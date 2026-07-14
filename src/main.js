import './styles/main.css';
import { isQuizMobileRoute } from './quiz/router.js';

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const loading = document.querySelector('#loading');

if (isQuizMobileRoute()) {
  loading?.remove();
  import('./quiz/mobileQuiz.js')
    .then(({ mountMobileQuiz }) => mountMobileQuiz(document.querySelector('#app')))
    .catch((error) => {
      document.querySelector('#app').innerHTML = `<main class="quiz-mobile quiz-mobile-message"><span>QUIZ EN VIVO</span><h1>No se pudo cargar el quiz</h1><p>${escapeHtml(error.message || 'Actualiza la página e inténtalo de nuevo.')}</p></main>`;
    });
} else {
  import('./presentation.js').then(({ startPresentation }) => startPresentation());
}
