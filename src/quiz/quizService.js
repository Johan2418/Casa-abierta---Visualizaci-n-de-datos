import { QUIZ_DURATION_MS, scoreAnswer, selectSessionQuestions } from './questionBank.js';

const env = import.meta.env;
const hasRemoteConfig = Boolean(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY);

function nowIso() {
  return new Date().toISOString();
}

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

function rankParticipants(participants) {
  return [...participants]
    .sort((a, b) => b.score - a.score || b.correctCount - a.correctCount || a.responseMs - b.responseMs || a.joinedAt.localeCompare(b.joinedAt))
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

function createLocalClient(questionBank) {
  const listeners = new Set();
  const state = { sessions: new Map(), global: new Map() };
  const notify = (session) => listeners.forEach((listener) => listener(session));
  const publicState = (session, reveal = session.status === 'reveal' || session.status === 'finished') => ({
    ...session,
    questions: session.questions.map((question, index) => ({
      position: index,
      id: question.id,
      prompt: question.prompt,
      options: question.options,
      explanation: reveal ? question.explanation : null,
      correctOptionId: reveal ? question.correctOptionId : null
    })),
    participants: rankParticipants(session.participants),
    currentQuestion: session.currentIndex >= 0 ? session.currentIndex : null
  });
  const find = (code) => {
    const session = state.sessions.get(code);
    if (!session) throw new Error('Sesión no encontrada.');
    return session;
  };

  return {
    mode: 'local',
    async createSession() {
      const code = makeCode();
      const session = { code, status: 'lobby', questions: selectSessionQuestions(questionBank), currentIndex: -1, participants: [{ id: 'local-demo', alias: 'Invitado demo', score: 0, correctCount: 0, responseMs: 0, joinedAt: nowIso(), answers: {} }], hostId: 'local-host', openedAt: null, closesAt: null };
      state.sessions.set(code, session);
      return publicState(session);
    },
    async joinSession(code, alias, identity = crypto.randomUUID()) {
      const session = find(code);
      if (session.status !== 'lobby') throw new Error('La partida ya comenzó.');
      if (session.participants.some((item) => item.alias.toLocaleLowerCase('es') === alias.toLocaleLowerCase('es'))) throw new Error('Ese alias ya está en uso en esta sesión.');
      session.participants.push({ id: identity, alias, score: 0, correctCount: 0, responseMs: 0, joinedAt: nowIso(), answers: {} });
      notify(publicState(session));
      return publicState(session);
    },
    async startSession(code) {
      const session = find(code);
      if (!session.participants.length) throw new Error('Debe unirse al menos una persona antes de comenzar.');
      session.status = 'question'; session.currentIndex = 0; session.openedAt = nowIso(); session.closesAt = new Date(Date.now() + QUIZ_DURATION_MS).toISOString();
      notify(publicState(session)); return publicState(session);
    },
    async command(code, command) {
      const session = find(code);
      if (command === 'pause' && session.status === 'question') { session.status = 'paused'; session.remainingMs = Math.max(0, new Date(session.closesAt) - Date.now()); }
      if (command === 'resume' && session.status === 'paused') { session.status = 'question'; session.closesAt = new Date(Date.now() + session.remainingMs).toISOString(); }
      if (command === 'close' && ['question', 'paused'].includes(session.status)) { session.status = 'reveal'; session.revealUntil = new Date(Date.now() + 6000).toISOString(); }
      notify(publicState(session)); return publicState(session);
    },
    async submitAnswer(code, identity, optionId) {
      const session = find(code);
      if (session.status !== 'question' || Date.now() > new Date(session.closesAt)) throw new Error('El tiempo de respuesta terminó.');
      const participant = session.participants.find((item) => item.id === identity);
      if (!participant) throw new Error('Participante no encontrado.');
      const key = String(session.currentIndex);
      if (participant.answers[key]) return publicState(session);
      const elapsed = Math.max(0, QUIZ_DURATION_MS - Math.max(0, new Date(session.closesAt) - Date.now()));
      const current = session.questions[session.currentIndex];
      const correct = optionId === current.correctOptionId;
      const points = correct ? scoreAnswer(QUIZ_DURATION_MS - elapsed) : 0;
      participant.answers[key] = { optionId, correct, points, elapsed };
      participant.score += points; participant.correctCount += Number(correct); participant.responseMs += elapsed;
      notify(publicState(session)); return publicState(session);
    },
    async tick(code) {
      const session = find(code);
      if (session.status === 'question' && Date.now() >= new Date(session.closesAt)) { session.status = 'reveal'; session.revealUntil = new Date(Date.now() + 6000).toISOString(); }
      else if (session.status === 'reveal' && Date.now() >= new Date(session.revealUntil)) {
        if (session.currentIndex + 1 >= session.questions.length) {
          session.status = 'finished';
          rankParticipants(session.participants).forEach((item) => {
            const previous = state.global.get(item.id);
            if (!previous || item.score > previous.score) state.global.set(item.id, { ...item, achievedAt: nowIso() });
          });
        } else { session.status = 'question'; session.currentIndex += 1; session.openedAt = nowIso(); session.closesAt = new Date(Date.now() + QUIZ_DURATION_MS).toISOString(); }
      }
      notify(publicState(session)); return publicState(session);
    },
    async getState(code) { return publicState(find(code)); },
    async getGlobalLeaderboard() { return rankParticipants([...state.global.values()]).slice(0, 10); },
    subscribe(code, listener) { const wrapped = (session) => { if (session.code === code) listener(session); }; listeners.add(wrapped); return () => listeners.delete(wrapped); }
  };
}

let remoteClientPromise;
async function createRemoteClient() {
  if (!remoteClientPromise) {
    remoteClientPromise = import('@supabase/supabase-js').then(async ({ createClient }) => {
      const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
      }
      const rpc = async (fn, args = {}) => {
        const { data: result, error } = await supabase.rpc(fn, args);
        if (error) throw error;
        return result;
      };
      return {
        mode: 'remote',
        createSession: () => rpc('quiz_create_session'),
        joinSession: (code, alias) => rpc('quiz_join_session', { p_code: code, p_alias: alias }),
        startSession: (code) => rpc('quiz_start_session', { p_code: code }),
        command: (code, command) => rpc('quiz_host_command', { p_code: code, p_command: command }),
        submitAnswer: (code, _identity, optionId) => rpc('quiz_submit_answer', { p_code: code, p_option_id: optionId }),
        tick: (code) => rpc('quiz_tick_session', { p_code: code }),
        getState: (code) => rpc('quiz_get_state', { p_code: code }),
        getGlobalLeaderboard: () => rpc('quiz_get_global_leaderboard'),
        subscribe(code, listener) {
          const channel = supabase.channel(`quiz:${code}`, { config: { private: true } }).on('broadcast', { event: 'state' }, () => rpc('quiz_get_state', { p_code: code }).then(listener).catch(() => {})).subscribe();
          return () => supabase.removeChannel(channel);
        }
      };
    });
  }
  return remoteClientPromise;
}

export async function createQuizClient(questionBank = []) {
  return hasRemoteConfig ? createRemoteClient() : createLocalClient(questionBank);
}

export function quizIsConfigured() {
  return hasRemoteConfig;
}
