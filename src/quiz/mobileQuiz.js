import '../styles/main.css';
import { createQuizClient, quizIsConfigured } from './quizService.js';

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const identityKey = 'sembrando-datos-quiz-identity';
const getIdentity = () => localStorage.getItem(identityKey) || (() => { const id = crypto.randomUUID(); localStorage.setItem(identityKey, id); return id; })();

function codeFromHash() {
  const match = window.location.hash.match(/^#\/quiz\/([^/?]+)/);
  return match ? decodeURIComponent(match[1]).toUpperCase() : '';
}

export async function mountMobileQuiz(root) {
  const code = codeFromHash();
  if (!code) { root.innerHTML = '<main class="quiz-mobile"><h1>Enlace de quiz no válido</h1></main>'; return; }
  if (!quizIsConfigured()) {
    root.innerHTML = '<main class="quiz-mobile quiz-mobile-message"><span>SEMBRANDO DATOS</span><h1>El quiz aún no está conectado</h1><p>El anfitrión debe configurar Supabase y publicar el sitio para que puedas unirte desde tu teléfono.</p></main>';
    return;
  }
  let client;
  try {
    client = await createQuizClient();
  } catch (error) {
    root.innerHTML = `<main class="quiz-mobile quiz-mobile-message"><span>QUIZ EN VIVO</span><h1>No se pudo abrir el quiz</h1><p>${escapeHtml(error.message || 'Revisa tu conexión e inténtalo de nuevo.')}</p></main>`;
    return;
  }
  let state = null;
  let joined = false;
  let alias = localStorage.getItem(`sembrando-datos-quiz-alias-${code}`) || '';
  const identity = getIdentity();
  let unsubscribe;
  let ticker;

  function startLiveUpdates() {
    if (unsubscribe) return;
    unsubscribe = client.subscribe(code, (next) => { state = next; render(); });
    ticker = window.setInterval(async () => {
      try {
        state = await client.tick(code);
        render();
      } catch {
        // El siguiente Broadcast o tick reintentará la sincronización.
      }
    }, 1000);
  }
  const render = () => {
    const current = state?.questions?.[state.currentQuestion];
    const me = state?.participants?.find((participant) => participant.id === identity || participant.alias === alias);
    if (!joined) {
      root.innerHTML = `<main class="quiz-mobile quiz-mobile-join"><span>QUIZ EN VIVO</span><h1>Únete a ${escapeHtml(code)}</h1><p>Elige un alias para aparecer en la clasificación.</p><form id="joinQuiz"><input id="quizAlias" minlength="2" maxlength="20" autocomplete="nickname" placeholder="Tu alias" value="${escapeHtml(alias)}" required><button>Entrar al lobby</button></form></main>`;
      root.querySelector('#joinQuiz').addEventListener('submit', async (event) => {
        event.preventDefault();
        alias = root.querySelector('#quizAlias').value.trim();
        try {
          // Un visitante aún no puede leer estado privado: entrar al lobby es
          // la primera operación y devuelve el estado sanitizado.
          state = await client.joinSession(code, alias, identity);
          localStorage.setItem(`sembrando-datos-quiz-alias-${code}`, alias);
          joined = true;
          startLiveUpdates();
          render();
        } catch (error) {
          const message = error.message || 'No se pudo entrar a la sesión.';
          root.querySelector('#joinQuiz').insertAdjacentHTML('beforeend', `<p class="quiz-join-error">${escapeHtml(message)}</p>`);
        }
      });
      return;
    }
    if (state.status === 'lobby') {
      root.innerHTML = `<main class="quiz-mobile quiz-mobile-wait"><span>¡LISTO, ${escapeHtml(alias)}!</span><h1>Mira la pantalla principal</h1><p>La partida comenzará cuando el anfitrión la inicie.</p><div class="quiz-mobile-count">${state.participants.length} en la sala</div></main>`;
      return;
    }
    if (state.status === 'finished') {
      root.innerHTML = `<main class="quiz-mobile quiz-mobile-results"><span>RESULTADO FINAL</span><h1>${escapeHtml(alias)}</h1><strong>${me?.score?.toLocaleString('es-EC') ?? 0} puntos</strong><p>Posición ${me?.rank ?? '—'} de ${state.participants.length}</p></main>`;
      return;
    }
    if (state.status === 'reveal') {
      root.innerHTML = `<main class="quiz-mobile quiz-mobile-reveal"><span>RESPUESTA</span><h1>${current?.correctOptionId ?? ''}</h1><p>${escapeHtml(current?.explanation ?? 'Mira la pantalla para el resultado.')}</p></main>`;
      return;
    }
    if (state.status === 'paused') {
      root.innerHTML = '<main class="quiz-mobile quiz-mobile-wait"><span>EN PAUSA</span><h1>Espera un momento</h1><p>El anfitrión reanudará la pregunta.</p></main>';
      return;
    }
    const answered = Boolean(state.myAnswered ?? me?.answers?.[String(state.currentQuestion)]);
    root.innerHTML = `<main class="quiz-mobile quiz-mobile-answer"><header><span>PREGUNTA ${state.currentQuestion + 1}/8</span><b>Mira la pantalla</b></header><div class="phone-options">${current?.options?.map((option) => `<button class="phone-option option-${option.id.toLowerCase()}" data-option="${option.id}" ${answered ? 'disabled' : ''}><span>${option.id}</span><i>${option.id === 'A' ? '▲' : option.id === 'B' ? '◆' : option.id === 'C' ? '●' : '■'}</i></button>`).join('')}</div><p>${answered ? 'Respuesta enviada. ¡Atento a la pantalla!' : 'Elige el color, letra o forma de la opción correcta.'}</p></main>`;
    root.querySelectorAll('[data-option]').forEach((button) => button.addEventListener('click', async () => { try { state = await client.submitAnswer(code, identity, button.dataset.option); render(); } catch (error) { window.alert(error.message); } }));
  };
  render();
  window.addEventListener('beforeunload', () => { unsubscribe?.(); window.clearInterval(ticker); }, { once: true });
}
