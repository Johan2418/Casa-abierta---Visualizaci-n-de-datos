import { gsap } from 'gsap';
import { timerFlush } from 'd3';
import { loadData } from './data/loadData.js';
import { cropRanking, getSummary, groupCycleSummary, provinceSummary } from './data/aggregateData.js';
import { createHorizontalDeck } from './navigation/horizontalDeck.js';
import { createJuryMode } from './navigation/juryMode.js';
import { createDeckMotion, motionDuration } from './animation/deckMotion.js';
import { createAmbientBackground } from './animation/ambient.js';
import { createAutoAdvance } from './animation/attractMode.js';
import { buildAppShell, sections } from './sections/sectionRegistry.js';
import { renderHeroStage, renderKpis } from './charts/kpiCounters.js';
import { loadEcuadorTopology, renderProvinceMap } from './charts/provinceMap.js';
import { renderTimeline } from './charts/timelineChart.js';
import { renderRankingBars } from './charts/rankingBars.js';
import { renderProductionMomentumScatter } from './charts/productionMomentumScatter.js';
import { renderGroupCycleBars } from './charts/groupCycleBars.js';
import { renderProvinceCompare } from './charts/provinceCompare.js';
import { renderProvinceProfile } from './charts/provinceProfile.js';
import { renderExplorer } from './charts/explorerDashboard.js';
import { renderCredits } from './charts/creditsPipeline.js';
import { renderConclusions } from './charts/conclusions.js';
import { renderLiveQuiz } from './charts/liveQuiz.js';

gsap.ticker.lagSmoothing(0);
setInterval(() => { if (document.hidden) { gsap.ticker.tick(); timerFlush(); } }, 250);

const app = document.querySelector('#app');
const loading = document.querySelector('#loading');
const loadingBar = loading?.querySelector('.loading-bar span');
const stage = (id) => document.querySelector(`#stage-${id}`);

function fail(error) {
  loading?.remove();
  app.innerHTML = `<main class="error-state"><h1>No se pudo iniciar la visualización</h1><p>${error.message}</p><p>Revisa que el archivo CSV exista en <code>public/data/</code>.</p></main>`;
}
function dismiss(onDone) {
  if (!loading) return onDone();
  gsap.timeline({ onComplete: () => { loading.remove(); onDone(); } })
    .to(loadingBar, { width: '100%', duration: motionDuration(.45), ease: 'power2.out' })
    .to(loading.querySelector('.loading-inner'), { autoAlpha: 0, y: -34, duration: motionDuration(.55), ease: 'power3.in' }, '+=.15')
    .to(loading, { autoAlpha: 0, duration: motionDuration(.6) }, '-=.2');
}
function wireFullscreen(button) {
  if (!button || !document.fullscreenEnabled) return button?.remove();
  button.addEventListener('click', () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {})));
  document.addEventListener('fullscreenchange', () => { const active = Boolean(document.fullscreenElement); button.classList.toggle('is-fullscreen', active); button.setAttribute('aria-pressed', String(active)); });
}

export async function startPresentation() {
  try {
    gsap.to(loadingBar, { width: '70%', duration: 1.6, ease: 'power2.out' });
    const [rows, topology] = await Promise.all([loadData(), loadEcuadorTopology()]);
    const summary = getSummary(rows);
    const provinces = provinceSummary(rows, summary.latestYear);
    const crops = cropRanking(rows, summary.latestYear, 10);
    const groups = groupCycleSummary(rows, summary.latestYear);
    const dataContext = { summary, provinces, crops, groups, rows };
    app.innerHTML = buildAppShell(dataContext);
    const tooltip = document.querySelector('#tooltip');
    const motion = createDeckMotion();
    const profileIndex = sections.findIndex((section) => section.id === 'profile');
    let compareHandle; let profileHandle; let momentumHandle; let deck;
    const goToProvinceProfile = (provinceName) => { profileHandle?.selectProvince(provinceName); if (profileIndex >= 0) deck?.goTo(profileIndex); };
    function renderCharts() {
      motion.registerChart('hero', renderHeroStage(stage('hero'), summary));
      motion.registerChart('numbers', renderKpis(stage('numbers'), summary));
      motion.registerChart('map', renderProvinceMap(stage('map'), rows, tooltip, topology, summary, goToProvinceProfile));
      motion.registerChart('timeline', renderTimeline(stage('timeline'), rows, summary));
      profileHandle = renderProvinceProfile(stage('profile'), rows, summary); motion.registerChart('profile', profileHandle);
      motion.registerChart('ranking', renderRankingBars(stage('ranking'), crops, `Top cultivos ${summary.latestYear}`));
      momentumHandle = renderProductionMomentumScatter(stage('diversity'), rows, summary, tooltip); motion.registerChart('diversity', momentumHandle);
      motion.registerChart('groups', renderGroupCycleBars(stage('groups'), groups));
      compareHandle = renderProvinceCompare(stage('compare'), rows, summary); motion.registerChart('compare', compareHandle);
      motion.registerChart('explorer', renderExplorer(stage('explorer'), rows, summary));
      motion.registerChart('methodology', renderCredits(stage('methodology')));
      motion.registerChart('conclusions', renderConclusions(stage('conclusions'), dataContext));
      motion.registerChart('quiz', renderLiveQuiz(stage('quiz'), dataContext));
    }
    renderCharts();
    const slides = [...document.querySelectorAll('.slide')]; motion.init(slides);
    deck = createHorizontalDeck({ root: document.querySelector('.deck-app'), track: document.querySelector('#deckTrack'), progress: document.querySelector('#deckProgress'), counter: null, prevButton: document.querySelector('#prevSlide'), nextButton: document.querySelector('#nextSlide'), dots: [...document.querySelectorAll('.dot')] });
    createAmbientBackground(document.querySelector('.deck-app')); wireFullscreen(document.querySelector('#fullscreenToggle'));
    const autoAdvance = createAutoAdvance({ deck, toggleButton: document.querySelector('#autoAdvanceToggle'), sections });
    createJuryMode({ deck, toggleButton: document.querySelector('#juryToggle'), sections, autoAdvance });
    window.addEventListener('deck:change', (event) => { if (sections[event.detail.index]?.id === 'quiz') autoAdvance.stop(); });
    dismiss(() => motion.start(deck.getIndex()));
    let resizeFrame;
    window.addEventListener('resize', () => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(() => {
      motion.registerChart('map', renderProvinceMap(stage('map'), rows, tooltip, topology, summary, goToProvinceProfile));
      motion.registerChart('ranking', renderRankingBars(stage('ranking'), crops, `Top cultivos ${summary.latestYear}`));
      const momentumState = momentumHandle?.getState?.() ?? { year: summary.latestYear, group: '', focus: 'all' };
      momentumHandle?.destroy?.(); momentumHandle = renderProductionMomentumScatter(stage('diversity'), rows, summary, tooltip, momentumState); motion.registerChart('diversity', momentumHandle);
      motion.registerChart('groups', renderGroupCycleBars(stage('groups'), groups));
      profileHandle = renderProvinceProfile(stage('profile'), rows, summary); motion.registerChart('profile', profileHandle);
      compareHandle = renderProvinceCompare(stage('compare'), rows, summary); motion.registerChart('compare', compareHandle);
      const activeId = sections[deck.getIndex()]?.id;
      if (['map', 'ranking', 'diversity', 'groups', 'profile', 'compare'].includes(activeId)) motion.replayChart(activeId);
    }); });
  } catch (error) { fail(error); }
}
