import '../styles/main.css';
import { createQuizClient, quizIsConfigured } from './quizService.js';

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const identityKey = 'sembrando-datos-quiz-identity';
const getIdentity = () => localStorage.getItem(identityKey) || (() => { const id = crypto.randomUUID(); localStorage.setItem(identityKey, id); return id; })();
const codeFromHash = () => {
  const match = window.location.hash.match(/^#\/quiz\/([^/?]+)/);
  try { return match ? decodeURIComponent(match[1]).toUpperCase() : ''; } catch { return ''; }
};
const activeStatus = (status) => ['lobby', 'question', 'paused', 'reveal'].includes(status);

export async function mountMobileQuiz(root) {
  const code = codeFromHash();
  if (!code) { root.innerHTML = '<main class="quiz-mobile"><h1>Enlace de quiz no válido</h1></main>'; return; }
  if (!quizIsConfigured()) {
    root.innerHTML = '<main class="quiz-mobile quiz-mobile-message"><span>SEMBRANDO DATOS</span><h1>El quiz aún no está conectado</h1><p>El anfitrión debe configurar Supabase y publicar el sitio para que puedas unirte desde tu teléfono.</p></main>';
    return;
  }

  let client;
  try { client = await createQuizClient(); } catch (error) {
    root.innerHTML = `<main class="quiz-mobile quiz-mobile-message"><span>QUIZ EN VIVO</span><h1>No se pudo abrir el quiz</h1><p>${escapeHtml(error.message || 'Revisa tu conexión e inténtalo de nuevo.')}</p></main>`;
    return;
  }

  let state = null;
  let joined = false;
  let alias = localStorage.getItem(`sembrando-datos-quiz-alias-${code}`) || '';
  const identity = getIdentity();
  let unsubscribe = null;
  let pollTimer = null;
  let syncPromise = null;
  let syncQueued = false;

  const currentQuestion = () => state?.question ?? state?.questions?.[state.currentQuestion];
  const mine = () => state?.me ?? state?.participants?.find((participant) => participant.id === identity || participant.alias === alias) ?? {};
  const stopUpdates = () => { unsubscribe?.(); unsubscribe = null; clearInterval(pollTimer); pollTimer = null; };
  const render = () => {
    const current = currentQuestion(); const me = mine();
    if (!joined) {
      root.innerHTML = `<main class="quiz-mobile quiz-mobile-join"><span>QUIZ EN VIVO</span><h1>Únete a ${escapeHtml(code)}</h1><p>Elige un alias para aparecer en la clasificación.</p><form id="joinQuiz"><input id="quizAlias" minlength="2" maxlength="20" autocomplete="nickname" placeholder="Tu alias" value="${escapeHtml(alias)}" required><button>Entrar al lobby</button></form></main>`;
      root.querySelector('#joinQuiz').addEventListener('submit', async (event) => {
        event.preventDefault(); alias = root.querySelector('#quizAlias').value.trim();
        try {
          state = await client.joinSession(code, alias, identity);
          localStorage.setItem(`sembrando-datos-quiz-alias-${code}`, alias);
          joined = true; startUpdates(); render();
        } catch (error) { root.querySelector('#joinQuiz').insertAdjacentHTML('beforeend', `<p class="quiz-join-error">${escapeHtml(error.message || 'No se pudo entrar a la sesión.')}</p>`); }
      });
      return;
    }
    if (!state) { root.innerHTML = '<main class="quiz-mobile quiz-mobile-message"><p>Sincronizando la partida…</p></main>'; return; }
    if (state.status === 'cancelled') { root.innerHTML = '<main class="quiz-mobile quiz-mobile-message"><span>QUIZ EN VIVO</span><h1>La sesión fue cancelada</h1><p>El anfitrión cerró esta partida.</p></main>'; return; }
    if (state.status === 'lobby') { root.innerHTML = `<main class="quiz-mobile quiz-mobile-wait"><span>¡LISTO, ${escapeHtml(alias)}!</span><h1>Mira la pantalla principal</h1><p>La partida comenzará cuando el anfitrión la inicie.</p><div class="quiz-mobile-count">${state.participantCount ?? state.participants?.length ?? 0} en la sala</div></main>`; return; }
    if (state.status === 'finished') { root.innerHTML = `<main class="quiz-mobile quiz-mobile-results"><span>RESULTADO FINAL</span><h1>${escapeHtml(alias)}</h1><strong>${Number(me.score || 0).toLocaleString('es-EC')} puntos</strong><p>Posición ${me.rank ?? '—'} de ${state.participantCount ?? state.participants?.length ?? '—'}</p></main>`; return; }
    if (state.status === 'reveal') { root.innerHTML = `<main class="quiz-mobile quiz-mobile-reveal"><span>RESPUESTA</span><h1>${current?.correctOptionId ?? ''}</h1><p>${escapeHtml(current?.explanation ?? 'Mira la pantalla para el resultado.')}</p></main>`; return; }
    if (state.status === 'paused') { root.innerHTML = '<main class="quiz-mobile quiz-mobile-wait"><span>EN PAUSA</span><h1>Espera un momento</h1><p>El anfitrión reanudará la pregunta.</p></main>'; return; }
    const answered = Boolean(state.myAnswered ?? me.answers?.[String(state.currentQuestion)]);
    root.innerHTML = `<main class="quiz-mobile quiz-mobile-answer"><header><span>PREGUNTA ${state.currentQuestion + 1}/8</span><b>Mira la pantalla</b></header><div class="phone-options">${current?.options?.map((option) => `<button class="phone-option option-${option.id.toLowerCase()}" data-option="${option.id}" ${answered ? 'disabled' : ''}><span>${option.id}</span><i>${option.id === 'A' ? '▲' : option.id === 'B' ? '◆' : option.id === 'C' ? '●' : '■'}</i></button>`).join('')}</div><p>${answered ? 'Respuesta enviada. ¡Atento a la pantalla!' : 'Elige el color, letra o forma de la opción correcta.'}</p></main>`;
    root.querySelectorAll('[data-option]').forEach((button) => button.addEventListener('click', async () => {
      button.disabled = true;
      try { state = await client.submitAnswer(code, identity, button.dataset.option); render(); }
      catch (error) { button.disabled = false; window.alert(error.message || 'No se pudo enviar la respuesta.'); }
    }));
  };

  const sync = async () => {
    if (syncPromise) { syncQueued = true; return syncPromise; }
    syncPromise = client.getPlayerState(code).then((next) => {
      state = next;
      if (next?.me?.alias) alias = next.me.alias;
      if (next && !activeStatus(next.status)) stopUpdates();
      render();
      return next;
    }).finally(() => {
      syncPromise = null;
      if (syncQueued) { syncQueued = false; sync().catch(() => {}); }
    });
    return syncPromise;
  };
  function startUpdates() {
    if (unsubscribe) return;
    unsubscribe = client.subscribePlayer(code, {
      onSubscribed: () => sync().catch(() => {}),
      onPhase: () => sync().catch(() => {}),
      onLobby: (payload) => {
        if (state && Number.isFinite(payload?.participantCount)) { state.participantCount = payload.participantCount; render(); }
        sync().catch(() => {});
      },
      onConnectionIssue: () => setTimeout(() => sync().catch(() => {}), 1000)
    });
    pollTimer = setInterval(() => { if (joined && state && activeStatus(state.status)) sync().catch(() => {}); }, 5000);
  }

  try {
    state = await client.getPlayerState(code);
    joined = true;
    alias = state?.me?.alias || alias;
    startUpdates();
  } catch {
    // La primera lectura falla para quien todavía no se ha unido; es esperado.
  }
  render();
  window.addEventListener('beforeunload', stopUpdates, { once: true });
}
