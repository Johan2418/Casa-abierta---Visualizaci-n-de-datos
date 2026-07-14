import { buildQuestionBank, QUIZ_DURATION_MS } from '../quiz/questionBank.js';
import { createQuizClient, quizIsConfigured } from '../quiz/quizService.js';
import { renderQrCode } from './qrCode.js';

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const formatTime = (ms) => `${Math.max(0, Math.ceil(ms / 1000))} s`;

function joinUrl(code) {
  return `${window.location.origin}${window.location.pathname}#/quiz/${encodeURIComponent(code)}`;
}

function leaderboard(items = [], limit = 10) {
  if (!items.length) return '<p class="quiz-empty">Aún no hay puntajes.</p>';
  return `<ol class="quiz-ranking">${items.slice(0, limit).map((item, index) => `<li><span>${index + 1}</span><strong>${escapeHtml(item.alias)}</strong><b>${item.score.toLocaleString('es-EC')} pts</b></li>`).join('')}</ol>`;
}

export function renderLiveQuiz(container, { rows, summary }) {
  let client;
  let session = null;
  let global = [];
  let unsubscribe = null;
  let timer = null;
  let isVisible = false;
  const bank = buildQuestionBank(rows, summary);

  function clearTimer() { clearInterval(timer); timer = null; }
  function render() {
    const now = Date.now();
    const current = session?.questions?.[session.currentQuestion];
    const remaining = session?.closesAt ? new Date(session.closesAt).getTime() - now : QUIZ_DURATION_MS;
    const answerCount = session?.answeredCount ?? session?.participants?.filter((item) => item.answers?.[String(session.currentQuestion)]).length ?? 0;
    const configured = quizIsConfigured();
    const setup = configured ? '' : '<p class="quiz-demo-note">Modo local de demostración: configura Supabase para que los teléfonos se conecten entre sí.</p>';

    if (!session) {
      container.innerHTML = `<div class="quiz-host quiz-idle"><div class="quiz-mark">QUIZ EN VIVO</div><h2>¿Qué tanto quedó de la historia?</h2><p>Crea una ronda de 8 preguntas aleatorias basadas en los datos que acabas de explorar.</p>${setup}<div class="quiz-actions"><button class="quiz-primary" data-quiz-action="create">Crear sesión</button><button class="quiz-secondary" data-quiz-action="global">Ver top global</button></div><section class="quiz-global-panel">${leaderboard(global)}</section></div>`;
      return;
    }

    if (session.status === 'lobby') {
      container.innerHTML = `<div class="quiz-host quiz-lobby"><div class="quiz-session-head"><div><span class="quiz-mark">QUIZ EN VIVO</span><h2>La sala está abierta</h2><p>Escanea el QR o entra con el código.</p></div><div class="quiz-code"><small>CÓDIGO</small><strong>${session.code}</strong></div></div><div class="quiz-lobby-body"><div class="quiz-qr" id="quizQr"></div><div class="quiz-join-copy"><p class="quiz-url">${escapeHtml(joinUrl(session.code))}</p><strong>${session.participants.length} participante${session.participants.length === 1 ? '' : 's'}</strong>${session.participants.length ? `<ul class="quiz-members">${session.participants.map((item) => `<li>${escapeHtml(item.alias)}</li>`).join('')}</ul>` : '<p class="quiz-empty">Esperando el primer teléfono…</p>'}<div class="quiz-actions"><button class="quiz-primary" data-quiz-action="start" ${session.participants.length ? '' : 'disabled'}>Comenzar quiz</button><button class="quiz-secondary" data-quiz-action="global">Top global</button></div></div></div></div>`;
      renderQrCode(container.querySelector('#quizQr'), joinUrl(session.code), { eyebrow: 'Únete al quiz', title: 'Escanea para responder desde tu teléfono', urlLabel: session.code }).play();
      return;
    }

    if (session.status === 'finished') {
      container.innerHTML = `<div class="quiz-host quiz-finished"><div class="quiz-mark">RESULTADOS FINALES</div><h2>¡Gracias por jugar!</h2><div class="quiz-podium">${session.participants.slice(0, 3).map((item, index) => `<article class="podium-${index + 1}"><span>${['🥇', '🥈', '🥉'][index]}</span><strong>${escapeHtml(item.alias)}</strong><b>${item.score.toLocaleString('es-EC')}</b></article>`).join('')}</div><div class="quiz-results-grid"><section><h3>Esta sesión</h3>${leaderboard(session.participants)}</section><section><h3>Top global</h3>${leaderboard(global)}</section></div><div class="quiz-actions"><button class="quiz-primary" data-quiz-action="new">Nueva sesión</button></div></div>`;
      return;
    }

    const showReveal = session.status === 'reveal';
    const paused = session.status === 'paused';
    container.innerHTML = `<div class="quiz-host quiz-question ${showReveal ? 'is-reveal' : ''}"><header><span class="quiz-mark">PREGUNTA ${session.currentQuestion + 1} / 8</span><div class="quiz-timer ${paused ? 'is-paused' : ''}" style="--timer:${Math.max(0, remaining) / QUIZ_DURATION_MS}">${paused ? 'Pausa' : formatTime(remaining)}</div></header><h2>${escapeHtml(current?.prompt)}</h2><div class="quiz-options">${current?.options?.map((option) => `<article class="quiz-option option-${option.id.toLowerCase()} ${showReveal && current.correctOptionId === option.id ? 'is-correct' : ''}"><span>${option.id}</span><strong>${escapeHtml(option.label)}</strong></article>`).join('')}</div><footer><p>${answerCount} respuestas recibidas</p><div class="quiz-actions">${paused ? '<button class="quiz-primary" data-quiz-action="resume">Reanudar</button>' : '<button class="quiz-secondary" data-quiz-action="pause">Pausar</button>'}<button class="quiz-secondary" data-quiz-action="close">Cerrar ahora</button></div></footer>${showReveal ? `<aside class="quiz-reveal"><strong>Respuesta correcta: ${current.options.find((option) => option.id === current.correctOptionId)?.label ?? ''}</strong><p>${escapeHtml(current.explanation ?? '')}</p>${leaderboard(session.participants, 5)}</aside>` : ''}</div>`;
  }

  async function refresh() {
    if (!client || !session) return;
    try { session = await client.tick(session.code); global = await client.getGlobalLeaderboard(); render(); } catch (error) { console.warn(error); }
  }

  async function setup() {
    client = await createQuizClient(bank);
    global = await client.getGlobalLeaderboard();
    render();
    container.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-quiz-action]')?.dataset.quizAction;
      if (!action) return;
      try {
        if (action === 'create' || action === 'new') {
          unsubscribe?.(); clearTimer(); session = await client.createSession();
          unsubscribe = client.subscribe(session.code, (next) => { session = next; render(); });
        } else if (action === 'start') session = await client.startSession(session.code);
        else if (action === 'pause') session = await client.command(session.code, 'pause');
        else if (action === 'resume') session = await client.command(session.code, 'resume');
        else if (action === 'close') session = await client.command(session.code, 'close');
        else if (action === 'global') global = await client.getGlobalLeaderboard();
        global = await client.getGlobalLeaderboard(); render();
      } catch (error) { window.alert(error.message || 'No se pudo completar la acción.'); }
    });
    // El Broadcast actualiza al instante cuando Realtime está disponible. El
    // sondeo es el respaldo, también en lobby, para que el contador no se
    // quede en cero si un teléfono se une antes de que el canal privado
    // termine de conectarse.
    timer = setInterval(() => { if (session) refresh(); }, 1000);
  }

  container.innerHTML = '<div class="quiz-loading">Preparando el quiz…</div>';
  setup().catch((error) => { container.innerHTML = `<p class="quiz-error">No se pudo preparar el quiz: ${escapeHtml(error.message)}</p>`; });
  return { play: () => { isVisible = true; }, reset: () => { isVisible = false; }, destroy: () => { clearTimer(); unsubscribe?.(); } };
}
