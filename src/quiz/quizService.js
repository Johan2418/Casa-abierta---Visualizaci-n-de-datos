import { QUIZ_DURATION_MS, normalizeQuizDurationSeconds, scoreAnswer, selectSessionQuestions } from './questionBank.js';

const env = import.meta.env ?? {};
const hasRemoteConfig = Boolean(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY);
const REVEAL_MS = 6_000;

const nowIso = () => new Date().toISOString();
const makeCode = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
const rankParticipants = (participants) => [...participants]
  .sort((a, b) => b.score - a.score || b.correctCount - a.correctCount || a.responseMs - b.responseMs || a.joinedAt.localeCompare(b.joinedAt))
  .map((item, index) => ({ ...item, rank: index + 1 }));

export function createLocalQuizClient(questionBank) {
  const listeners = new Set();
  const state = { sessions: new Map(), global: new Map() };
  const publicState = (session, reveal = session.status === 'reveal' || session.status === 'finished') => ({
    ...session,
    currentQuestion: session.currentIndex >= 0 ? session.currentIndex : null,
    participantCount: session.participants.length,
    answeredCount: session.currentIndex < 0 ? 0 : session.participants.filter((item) => item.answers[String(session.currentIndex)]).length,
    questions: session.questions.map((question, index) => ({
      position: index, id: question.id, prompt: question.prompt, options: question.options,
      explanation: reveal && index === session.currentIndex ? question.explanation : null,
      correctOptionId: reveal && index === session.currentIndex ? question.correctOptionId : null
    })),
    participants: rankParticipants(session.participants)
  });
  const find = (code) => {
    const session = state.sessions.get(code);
    if (!session) throw new Error('Sesión no encontrada.');
    return session;
  };
  const notify = (session, event = 'phase') => listeners.forEach((listener) => {
    if (listener.code !== session.code) return;
    const snapshot = publicState(session);
    if (listener.kind === 'host') {
      if (event === 'answer') listener.handlers.onAnswer?.({ questionIndex: snapshot.currentQuestion, answeredCount: snapshot.answeredCount });
      else if (event === 'lobby') listener.handlers.onLobby?.(snapshot);
      else listener.handlers.onPhase?.(snapshot);
    } else if (event === 'lobby') listener.handlers.onLobby?.(snapshot);
    else listener.handlers.onPhase?.(snapshot);
  });
  const subscribe = (code, kind, handlers) => {
    const listener = { code, kind, handlers };
    listeners.add(listener);
    queueMicrotask(() => handlers.onSubscribed?.());
    return () => listeners.delete(listener);
  };

  return {
    mode: 'local',
    async createSession() {
      const code = makeCode();
      const session = {
        code, status: 'lobby', questions: selectSessionQuestions(questionBank), currentIndex: -1,
        questionDurationMs: QUIZ_DURATION_MS, participants: [{ id: 'local-demo', alias: 'Invitado demo', score: 0, correctCount: 0, responseMs: 0, joinedAt: nowIso(), answers: {} }],
        openedAt: null, closesAt: null, revealUntil: null
      };
      state.sessions.set(code, session);
      return publicState(session);
    },
    async setQuestionDuration(code, seconds) {
      const session = find(code);
      if (session.status !== 'lobby') throw new Error('La duración solo puede cambiarse en el lobby.');
      if (!Number.isInteger(seconds) || seconds < 5 || seconds > 120) throw new Error('La duración debe estar entre 5 y 120 segundos.');
      session.questionDurationMs = normalizeQuizDurationSeconds(seconds) * 1000;
      notify(session, 'lobby');
      return publicState(session);
    },
    async joinSession(code, alias, identity = crypto.randomUUID()) {
      const session = find(code);
      if (session.status !== 'lobby') throw new Error('La partida ya comenzó.');
      const existing = session.participants.find((item) => item.id === identity);
      if (session.participants.some((item) => item.id !== identity && item.alias.toLocaleLowerCase('es') === alias.toLocaleLowerCase('es'))) throw new Error('Ese alias ya está en uso en esta sesión.');
      if (existing) existing.alias = alias;
      else session.participants.push({ id: identity, alias, score: 0, correctCount: 0, responseMs: 0, joinedAt: nowIso(), answers: {} });
      notify(session, 'lobby');
      return publicState(session);
    },
    async startSession(code) {
      const session = find(code);
      session.status = 'question'; session.currentIndex = 0; session.openedAt = nowIso(); session.closesAt = new Date(Date.now() + session.questionDurationMs).toISOString();
      notify(session); return publicState(session);
    },
    async command(code, command) {
      const session = find(code);
      if (command === 'pause' && session.status === 'question') { session.status = 'paused'; session.remainingMs = Math.max(0, new Date(session.closesAt) - Date.now()); }
      if (command === 'resume' && session.status === 'paused') { session.status = 'question'; session.closesAt = new Date(Date.now() + session.remainingMs).toISOString(); }
      if (command === 'close' && ['question', 'paused'].includes(session.status)) { session.status = 'reveal'; session.revealUntil = new Date(Date.now() + REVEAL_MS).toISOString(); }
      notify(session); return publicState(session);
    },
    async submitAnswer(code, identity, optionId) {
      const session = find(code);
      if (session.status !== 'question' || Date.now() > new Date(session.closesAt)) throw new Error('El tiempo de respuesta terminó.');
      const participant = session.participants.find((item) => item.id === identity);
      if (!participant) throw new Error('Participante no encontrado.');
      const key = String(session.currentIndex);
      if (participant.answers[key]) return publicState(session);
      const elapsed = Math.max(0, session.questionDurationMs - Math.max(0, new Date(session.closesAt) - Date.now()));
      const current = session.questions[session.currentIndex];
      if (!current.options.some((option) => option.id === optionId)) throw new Error('Opción inválida.');
      const correct = optionId === current.correctOptionId;
      const points = correct ? scoreAnswer(session.questionDurationMs - elapsed, session.questionDurationMs) : 0;
      participant.answers[key] = { optionId, correct, points, elapsed };
      participant.score += points; participant.correctCount += Number(correct); participant.responseMs += elapsed;
      notify(session, 'answer'); return publicState(session);
    },
    async tick(code) {
      const session = find(code);
      if (session.status === 'question' && Date.now() >= new Date(session.closesAt)) { session.status = 'reveal'; session.revealUntil = new Date(Date.now() + REVEAL_MS).toISOString(); }
      else if (session.status === 'reveal' && Date.now() >= new Date(session.revealUntil)) {
        if (session.currentIndex + 1 >= session.questions.length) {
          session.status = 'finished';
          if (session.questionDurationMs === QUIZ_DURATION_MS) rankParticipants(session.participants).forEach((item) => {
            const previous = state.global.get(item.id);
            if (!previous || item.score > previous.score || (item.score === previous.score && (item.correctCount > previous.correctCount || (item.correctCount === previous.correctCount && item.responseMs < previous.responseMs)))) state.global.set(item.id, { ...item, achievedAt: nowIso() });
          });
        } else { session.status = 'question'; session.currentIndex += 1; session.openedAt = nowIso(); session.closesAt = new Date(Date.now() + session.questionDurationMs).toISOString(); }
      }
      notify(session); return publicState(session);
    },
    async getHostState(code) { return publicState(find(code)); },
    async getPlayerState(code) { return publicState(find(code)); },
    async getActiveHostSession() {
      const active = [...state.sessions.values()].filter((session) => ['lobby', 'question', 'paused', 'reveal'].includes(session.status)).at(-1);
      return active ? publicState(active) : null;
    },
    async cancelSession(code) {
      const session = find(code);
      if (!['lobby', 'question', 'paused', 'reveal'].includes(session.status)) throw new Error('La sesión ya terminó.');
      session.status = 'cancelled'; session.closesAt = null; session.revealUntil = null;
      notify(session); return publicState(session);
    },
    async getState(code) { return publicState(find(code)); },
    async getGlobalLeaderboard() { return rankParticipants([...state.global.values()]).slice(0, 10); },
    subscribeHost(code, handlers) { return subscribe(code, 'host', handlers); },
    subscribePlayer(code, handlers) { return subscribe(code, 'player', handlers); },
    subscribe(code, listener) { return subscribe(code, 'player', { onPhase: listener }); }
  };
}

let remoteClientPromise;
async function createRemoteClient() {
  if (!remoteClientPromise) {
    remoteClientPromise = import('@supabase/supabase-js').then(async ({ createClient }) => {
      const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
      const { data } = await supabase.auth.getSession();
      let authSession = data.session;
      if (!authSession) {
        const { data: signInData, error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
        authSession = signInData.session;
      }
      if (authSession?.access_token) await supabase.realtime.setAuth(authSession.access_token);
      supabase.auth.onAuthStateChange((_event, nextSession) => { if (nextSession?.access_token) supabase.realtime.setAuth(nextSession.access_token).catch(() => {}); });
      const rpc = async (fn, args = {}) => {
        const { data: result, error } = await supabase.rpc(fn, args);
        if (error) throw error;
        return result;
      };
      const subscribe = (topic, handlers, events) => {
        let channel = supabase.channel(topic, { config: { private: true } });
        events.forEach(([event, callback]) => { channel = channel.on('broadcast', { event }, (message) => callback(message.payload ?? message)); });
        channel.subscribe((status) => { if (status === 'SUBSCRIBED') handlers.onSubscribed?.(); else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') handlers.onConnectionIssue?.(status); });
        return () => supabase.removeChannel(channel);
      };
      return {
        mode: 'remote',
        createSession: () => rpc('quiz_create_session'),
        setQuestionDuration: (code, seconds) => rpc('quiz_set_question_duration', { p_code: code, p_seconds: seconds }),
        joinSession: (code, alias) => rpc('quiz_join_session', { p_code: code, p_alias: alias }),
        startSession: (code) => rpc('quiz_start_session', { p_code: code }),
        command: (code, command) => rpc('quiz_host_command', { p_code: code, p_command: command }),
        submitAnswer: (code, _identity, optionId) => rpc('quiz_submit_answer', { p_code: code, p_option_id: optionId }),
        tick: (code) => rpc('quiz_tick_session', { p_code: code }),
        getHostState: (code) => rpc('quiz_get_host_state', { p_code: code }),
        getPlayerState: (code) => rpc('quiz_get_player_state', { p_code: code }),
        getState: (code) => rpc('quiz_get_state', { p_code: code }),
        getGlobalLeaderboard: () => rpc('quiz_get_global_leaderboard'),
        subscribeHost(code, handlers) {
          return subscribe(`quiz:${code}:host`, handlers, [
            ['phase', (payload) => handlers.onPhase?.(payload)],
            ['answer', (payload) => handlers.onAnswer?.(payload)],
            ['lobby', (payload) => handlers.onLobby?.(payload)]
          ]);
        },
        getActiveHostSession: () => rpc('quiz_get_active_host_session'),
        cancelSession: (code) => rpc('quiz_cancel_session', { p_code: code }),
        subscribePlayer(code, handlers) {
          return subscribe(`quiz:${code}:players`, handlers, [
            ['phase', (payload) => handlers.onPhase?.(payload)],
            ['lobby', (payload) => handlers.onLobby?.(payload)]
          ]);
        },
        subscribe(code, listener) {
          return subscribe(`quiz:${code}`, {}, [['state', () => rpc('quiz_get_state', { p_code: code }).then(listener).catch(() => {})]]);
        }
      };
    });
  }
  return remoteClientPromise;
}

export async function createQuizClient(questionBank = []) { return hasRemoteConfig ? createRemoteClient() : createLocalQuizClient(questionBank); }
export function quizIsConfigured() { return hasRemoteConfig; }
