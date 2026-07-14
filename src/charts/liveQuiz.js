import { buildQuestionBank, QUIZ_DURATION_MS } from '../quiz/questionBank.js';
import { createQuizClient, quizIsConfigured } from '../quiz/quizService.js';
import { renderQrCode } from './qrCode.js';

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const formatTime = (ms) => `${Math.max(0, Math.ceil(ms / 1000))} s`;
const joinUrl = (code) => `${window.location.origin}${window.location.pathname}#/quiz/${encodeURIComponent(code)}`;
const activeStatus = (status) => ['lobby', 'question', 'paused', 'reveal'].includes(status);

function leaderboard(items = [], limit = 10) {
  if (!items.length) return '<p class="quiz-empty">Aún no hay puntajes.</p>';
  return `<ol class="quiz-ranking">${items.slice(0, limit).map((item, index) => `<li><span>${index + 1}</span><strong>${escapeHtml(item.alias)}</strong><b>${Number(item.score || 0).toLocaleString('es-EC')} pts</b></li>`).join('')}</ol>`;
}

export function renderLiveQuiz(container, { rows, summary }) {
  let client; let session = null; let global = []; let unsubscribe = null;
  let isVisible = false; let timerFrame = null; let advanceTimer = null; let pollTimer = null;
  let modalOpen = false; let busy = false; let syncPromise = null; let syncQueued = false;
  const bank = buildQuestionBank(rows, summary);

  const durationMs = () => session?.questionDurationMs ?? QUIZ_DURATION_MS;
  const globalEligible = () => durationMs() === QUIZ_DURATION_MS;
  const clearAdvance = () => { clearTimeout(advanceTimer); advanceTimer = null; };
  const clearPoll = () => { clearInterval(pollTimer); pollTimer = null; };
  const stopClock = () => { cancelAnimationFrame(timerFrame); timerFrame = null; };
  const patchClock = () => {
    if (!isVisible || !session) return;
    const node = container.querySelector('[data-quiz-timer]');
    if (node && session.status === 'question') {
      const remaining = Math.max(0, new Date(session.closesAt).getTime() - Date.now());
      node.textContent = formatTime(remaining);
      node.style.setProperty('--timer', String(remaining / durationMs()));
    }
    timerFrame = requestAnimationFrame(patchClock);
  };
  const startClock = () => { stopClock(); if (isVisible) patchClock(); };
  const fetchGlobal = async () => { global = await client.getGlobalLeaderboard(); };
  const syncHost = async () => {
    if (!client || !session) return session;
    if (syncPromise) { syncQueued = true; return syncPromise; }
    syncPromise = client.getHostState(session.code).then((next) => { session = next; return next; }).finally(() => {
      syncPromise = null;
      if (syncQueued) { syncQueued = false; syncHost().then(afterStateChange).catch(() => {}); }
    });
    return syncPromise;
  };
  const scheduleAdvance = () => {
    clearAdvance();
    if (!session || !['question', 'reveal'].includes(session.status)) return;
    const at = session.status === 'question' ? session.closesAt : session.revealUntil;
    const delay = Math.max(0, new Date(at).getTime() - Date.now()) + 30;
    advanceTimer = setTimeout(async () => {
      try { session = await client.tick(session.code); await afterStateChange(); }
      catch (error) { console.warn('No se pudo avanzar el quiz:', error); }
    }, delay);
  };
  const afterStateChange = async () => {
    await syncHost();
    if (session?.status === 'finished') await fetchGlobal();
    if (session && !activeStatus(session.status)) { clearAdvance(); clearPoll(); unsubscribe?.(); unsubscribe = null; }
    render(); scheduleAdvance();
  };
  const stopUpdates = () => { clearAdvance(); clearPoll(); unsubscribe?.(); unsubscribe = null; };
  const modal = () => modalOpen ? `<div class="quiz-modal-backdrop" data-quiz-backdrop><section class="quiz-global-modal" role="dialog" aria-modal="true" aria-labelledby="globalTitle"><button class="quiz-modal-close" data-quiz-action="close-global" aria-label="Cerrar clasificación">×</button><span class="quiz-mark">CLASIFICACIÓN</span><h2 id="globalTitle">Top global</h2>${leaderboard(global)}</section></div>` : '';
  const setupNote = quizIsConfigured() ? '' : '<p class="quiz-demo-note">Modo local de demostración: configura Supabase para conectar teléfonos reales.</p>';

  function render() {
    const current = session?.questions?.[session.currentQuestion];
    let body;
    if (!session) {
      body = `<div class="quiz-host quiz-idle"><div class="quiz-mark">QUIZ EN VIVO</div><h2>¿Qué tanto quedó de la historia?</h2><p>Crea una ronda de 8 preguntas aleatorias basadas en los datos explorados.</p>${setupNote}<div class="quiz-actions"><button class="quiz-primary" data-quiz-action="create">Crear sesión</button><button class="quiz-secondary" data-quiz-action="global">Ver top global</button></div></div>`;
    } else if (session.status === 'cancelled') {
      body = '<div class="quiz-host quiz-finished"><div class="quiz-mark">SESIÓN CANCELADA</div><h2>La sala se cerró</h2><p>Esta partida no se agregó al ranking global.</p><div class="quiz-actions"><button class="quiz-primary" data-quiz-action="new">Nueva sesión</button><button class="quiz-secondary" data-quiz-action="global">Ver top global</button></div></div>';
    } else if (session.status === 'lobby') {
      const seconds = Math.round(durationMs() / 1000);
      body = `<div class="quiz-host quiz-lobby"><div class="quiz-session-head"><div><span class="quiz-mark">QUIZ EN VIVO</span><h2>La sala está abierta</h2><p>Escanea el QR o entra con el código.</p></div><div class="quiz-code"><small>CÓDIGO</small><strong>${session.code}</strong></div></div><div class="quiz-lobby-body"><div class="quiz-qr" id="quizQr"></div><div class="quiz-join-copy"><p class="quiz-url">${escapeHtml(joinUrl(session.code))}</p><strong>${session.participantCount ?? session.participants.length} participante${(session.participantCount ?? session.participants.length) === 1 ? '' : 's'}</strong>${session.participants.length ? `<ul class="quiz-members">${session.participants.map((item) => `<li>${escapeHtml(item.alias)}</li>`).join('')}</ul>` : '<p class="quiz-empty">Esperando el primer teléfono…</p>'}<label class="quiz-duration">Segundos por pregunta <input data-quiz-duration type="number" min="5" max="120" step="1" value="${seconds}" ${busy ? 'disabled' : ''}></label>${globalEligible() ? '' : '<p class="quiz-demo-note">Esta duración muestra resultados de sesión, sin ranking global.</p>'}<div class="quiz-actions"><button class="quiz-primary" data-quiz-action="start" ${session.participants.length && !busy ? '' : 'disabled'}>Comenzar quiz</button><button class="quiz-secondary" data-quiz-action="cancel" ${busy ? 'disabled' : ''}>Cancelar sesión</button><button class="quiz-secondary" data-quiz-action="global">Top global</button></div></div></div></div>`;
    } else if (session.status === 'finished') {
      body = `<div class="quiz-host quiz-finished"><div class="quiz-mark">RESULTADOS FINALES</div><h2>¡Gracias por jugar!</h2>${globalEligible() ? '' : '<p class="quiz-demo-note">Esta partida no participa en el ranking global por usar una duración distinta de 20 segundos.</p>'}<div class="quiz-podium">${session.participants.slice(0, 3).map((item, index) => `<article class="podium-${index + 1}"><span>${['🥇', '🥈', '🥉'][index]}</span><strong>${escapeHtml(item.alias)}</strong><b>${Number(item.score).toLocaleString('es-EC')}</b></article>`).join('')}</div><div class="quiz-results-grid"><section><h3>Esta sesión</h3>${leaderboard(session.participants)}</section><section><h3>Top global</h3>${leaderboard(global)}</section></div><div class="quiz-actions"><button class="quiz-primary" data-quiz-action="new">Nueva sesión</button><button class="quiz-secondary" data-quiz-action="global">Ver top global</button></div></div>`;
    } else {
      const reveal = session.status === 'reveal'; const paused = session.status === 'paused';
      const remaining = session.closesAt ? Math.max(0, new Date(session.closesAt).getTime() - Date.now()) : durationMs();
      body = `<div class="quiz-host quiz-question ${reveal ? 'is-reveal' : ''}"><header><span class="quiz-mark">PREGUNTA ${session.currentQuestion + 1} / 8</span><div class="quiz-timer ${paused ? 'is-paused' : ''}" data-quiz-timer style="--timer:${remaining / durationMs()}">${paused ? 'Pausa' : formatTime(remaining)}</div></header><h2>${escapeHtml(current?.prompt)}</h2><div class="quiz-options">${current?.options?.map((option) => `<article class="quiz-option option-${option.id.toLowerCase()} ${reveal && current.correctOptionId === option.id ? 'is-correct' : ''}"><span>${option.id}</span><strong>${escapeHtml(option.label)}</strong></article>`).join('')}</div><footer><p><b data-answered-count>${session.answeredCount ?? 0}</b> respuestas recibidas</p><div class="quiz-actions">${paused ? '<button class="quiz-primary" data-quiz-action="resume">Reanudar</button>' : '<button class="quiz-secondary" data-quiz-action="pause">Pausar</button>'}<button class="quiz-secondary" data-quiz-action="close">Cerrar ahora</button><button class="quiz-secondary" data-quiz-action="cancel">Cancelar sesión</button></div></footer>${reveal ? `<aside class="quiz-reveal"><strong>Respuesta correcta: ${current?.options?.find((option) => option.id === current.correctOptionId)?.label ?? ''}</strong><p>${escapeHtml(current?.explanation ?? '')}</p>${leaderboard(session.participants, 5)}</aside>` : ''}</div>`;
    }
    container.innerHTML = `${body}${modal()}`;
    if (session?.status === 'lobby') renderQrCode(container.querySelector('#quizQr'), joinUrl(session.code), { eyebrow: 'Únete al quiz', title: 'Escanea para responder desde tu teléfono', urlLabel: session.code }).play();
    if (modalOpen) container.querySelector('.quiz-modal-close')?.focus();
    startClock();
  }
  async function subscribeToHost(code) {
    unsubscribe?.();
    unsubscribe = client.subscribeHost(code, {
      onSubscribed: () => afterStateChange().catch(() => {}),
      onPhase: () => afterStateChange().catch(() => {}),
      onLobby: () => afterStateChange().catch(() => {}),
      onConnectionIssue: () => setTimeout(() => afterStateChange().catch(() => {}), 1000),
      onAnswer: (payload) => {
        if (session?.currentQuestion !== payload.questionIndex) return;
        session.answeredCount = Math.max(session.answeredCount ?? 0, payload.answeredCount ?? 0);
        const node = container.querySelector('[data-answered-count]');
        if (node) node.textContent = session.answeredCount;
      }
    });
    clearPoll();
    pollTimer = setInterval(() => { if (session && activeStatus(session.status)) afterStateChange().catch(() => {}); }, 5000);
  }
  async function runAction(action, value) {
    if (busy) return;
    busy = true; render();
    try {
      if (action === 'create' || action === 'new') { stopUpdates(); session = await client.createSession(); await subscribeToHost(session.code); await syncHost(); }
      else if (action === 'duration') session = await client.setQuestionDuration(session.code, Number(value));
      else if (action === 'start') session = await client.startSession(session.code);
      else if (action === 'pause') session = await client.command(session.code, 'pause');
      else if (action === 'resume') session = await client.command(session.code, 'resume');
      else if (action === 'close') session = await client.command(session.code, 'close');
      else if (action === 'cancel') { if (window.confirm('¿Cancelar esta sesión?')) session = await client.cancelSession(session.code); }
      else if (action === 'global') { await fetchGlobal(); modalOpen = true; }
      else if (action === 'close-global') modalOpen = false;
      if (session?.status === 'finished') await fetchGlobal();
      if (session && !activeStatus(session.status)) { clearAdvance(); clearPoll(); }
      render(); scheduleAdvance();
    } catch (error) { window.alert(error.message || 'No se pudo completar la acción.'); }
    finally { busy = false; render(); }
  }
  const onClick = (event) => {
    if (event.target.matches('[data-quiz-backdrop]')) { runAction('close-global'); return; }
    const button = event.target.closest('[data-quiz-action]');
    if (button) runAction(button.dataset.quizAction);
  };
  const onChange = (event) => { if (event.target.matches('[data-quiz-duration]')) runAction('duration', event.target.value); };
  const onKeydown = (event) => { if (event.key === 'Escape' && modalOpen) runAction('close-global'); };
  container.addEventListener('click', onClick);
  container.addEventListener('change', onChange);
  window.addEventListener('keydown', onKeydown);
  container.innerHTML = '<div class="quiz-loading">Preparando el quiz…</div>';
  (async () => {
    client = await createQuizClient(bank);
    [global, session] = await Promise.all([client.getGlobalLeaderboard(), client.getActiveHostSession()]);
    if (session) { await subscribeToHost(session.code); await syncHost(); }
    render(); scheduleAdvance();
  })().catch((error) => { container.innerHTML = `<p class="quiz-error">No se pudo preparar el quiz: ${escapeHtml(error.message)}</p>`; });
  return {
    play: () => { isVisible = true; startClock(); },
    reset: () => { isVisible = false; stopClock(); },
    destroy: () => { stopClock(); stopUpdates(); container.removeEventListener('click', onClick); container.removeEventListener('change', onChange); window.removeEventListener('keydown', onKeydown); }
  };
}
