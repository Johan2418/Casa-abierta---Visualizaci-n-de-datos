import './styles/main.css';
import { gsap } from 'gsap';
import { timerFlush } from 'd3';
import { loadData } from './data/loadData.js';
import { cropRanking, getSummary, groupCycleSummary, provinceSummary } from './data/aggregateData.js';
import { createHorizontalDeck } from './navigation/horizontalDeck.js';
import { createDeckMotion, motionDuration } from './animation/deckMotion.js';
import { createAmbientBackground } from './animation/ambient.js';
import { createAttractMode } from './animation/attractMode.js';
import { buildAppShell, sections } from './sections/sectionRegistry.js';
import { renderHeroStage, renderKpis } from './charts/kpiCounters.js';
import { loadEcuadorTopology, renderProvinceMap } from './charts/provinceMap.js';
import { renderTimeline } from './charts/timelineChart.js';
import { renderRankingBars } from './charts/rankingBars.js';
import { renderDiversityScatter } from './charts/diversityScatter.js';
import { renderGroupCycleBars } from './charts/groupCycleBars.js';
import { renderProvinceCompare } from './charts/provinceCompare.js';
import { renderExplorer } from './charts/explorerDashboard.js';
import { renderMethodology } from './charts/methodologyPipeline.js';
import { renderConclusions } from './charts/conclusions.js';

// En pestañas ocultas el navegador congela requestAnimationFrame; este tick
// manual evita que la pantalla de carga y las coreografías queden a medias.
// lagSmoothing(0) hace que tras una pausa larga la animación salte al tiempo
// real en lugar de arrastrarse.
gsap.ticker.lagSmoothing(0);
setInterval(() => {
  if (!document.hidden) return;
  gsap.ticker.tick();
  timerFlush(); // los timers de D3 (transiciones) también dependen de rAF
}, 250);

const app = document.querySelector('#app');
const loading = document.querySelector('#loading');
const loadingBar = loading?.querySelector('.loading-bar span');

function stage(id) {
  return document.querySelector(`#stage-${id}`);
}

function renderStaticError(error) {
  loading?.remove();
  app.innerHTML = `
    <main class="error-state">
      <h1>No se pudo iniciar la visualización</h1>
      <p>${error.message}</p>
      <p>Revisa que el archivo CSV exista en <code>public/data/</code>.</p>
    </main>
  `;
}

function renderResizeAware(callback) {
  let frame = null;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(callback);
  });
}

function dismissLoading(onDone) {
  if (!loading) {
    onDone();
    return;
  }
  const tl = gsap.timeline({
    onComplete: () => {
      loading.remove();
      onDone();
    }
  });
  tl.to(loadingBar, { width: '100%', duration: motionDuration(0.45), ease: 'power2.out' })
    .to(loading.querySelector('.loading-inner'), { autoAlpha: 0, y: -34, duration: motionDuration(0.55), ease: 'power3.in' }, '+=0.15')
    .to(loading, { autoAlpha: 0, duration: motionDuration(0.6), ease: 'power2.inOut' }, '-=0.2');
}

function wireFullscreen(button) {
  if (!button || !document.fullscreenEnabled) {
    button?.remove();
    return;
  }
  button.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  });
  document.addEventListener('fullscreenchange', () => {
    const isFullscreen = Boolean(document.fullscreenElement);
    button.classList.toggle('is-fullscreen', isFullscreen);
    button.setAttribute('aria-pressed', String(isFullscreen));
    button.setAttribute('aria-label', isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa');
  });
}

async function init() {
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
    const compareIndex = sections.findIndex((section) => section.id === 'compare');

    // Se asignan dentro de renderCharts(); el callback del mapa las referencia
    // por closure y solo se invoca mucho después (al hacer clic), para
    // entonces ya están asignadas.
    let compareHandle;
    let deck;

    function goToCompareWith(provinceName) {
      compareHandle?.selectProvinceA(provinceName);
      if (compareIndex >= 0) deck?.goTo(compareIndex);
    }

    function renderCharts() {
      motion.registerChart('hero', renderHeroStage(stage('hero'), summary));
      motion.registerChart('numbers', renderKpis(stage('numbers'), summary));
      motion.registerChart(
        'map',
        renderProvinceMap(stage('map'), provinces, tooltip, topology, summary.latestYear, goToCompareWith)
      );
      motion.registerChart('timeline', renderTimeline(stage('timeline'), rows, summary));
      motion.registerChart('ranking', renderRankingBars(stage('ranking'), crops, `Top cultivos ${summary.latestYear}`));
      motion.registerChart('diversity', renderDiversityScatter(stage('diversity'), provinces, tooltip));
      motion.registerChart('groups', renderGroupCycleBars(stage('groups'), groups));
      compareHandle = renderProvinceCompare(stage('compare'), rows, summary);
      motion.registerChart('compare', compareHandle);
      motion.registerChart('explorer', renderExplorer(stage('explorer'), rows, summary));
      motion.registerChart('methodology', renderMethodology(stage('methodology'), summary));
      motion.registerChart('conclusions', renderConclusions(stage('conclusions'), dataContext));
    }

    renderCharts();

    const slides = [...document.querySelectorAll('.slide')];
    motion.init(slides);

    deck = createHorizontalDeck({
      root: document.querySelector('.deck-app'),
      track: document.querySelector('#deckTrack'),
      progress: document.querySelector('#deckProgress'),
      counter: document.querySelector('#slideCounter'),
      prevButton: document.querySelector('#prevSlide'),
      nextButton: document.querySelector('#nextSlide'),
      dots: [...document.querySelectorAll('.dot')]
    });

    createAmbientBackground(document.querySelector('.deck-app'));
    wireFullscreen(document.querySelector('#fullscreenToggle'));
    createAttractMode({
      deck,
      badge: document.querySelector('#attractBadge'),
      sections,
      explorerYearCount: summary.years.length
    });

    dismissLoading(() => motion.start(deck.getIndex()));

    renderResizeAware(() => {
      // Re-render de los charts sensibles al tamaño y re-registro de sus handles.
      motion.registerChart(
        'map',
        renderProvinceMap(stage('map'), provinces, tooltip, topology, summary.latestYear, goToCompareWith)
      );
      motion.registerChart('ranking', renderRankingBars(stage('ranking'), crops, `Top cultivos ${summary.latestYear}`));
      motion.registerChart('diversity', renderDiversityScatter(stage('diversity'), provinces, tooltip));
      motion.registerChart('groups', renderGroupCycleBars(stage('groups'), groups));
      compareHandle = renderProvinceCompare(stage('compare'), rows, summary);
      motion.registerChart('compare', compareHandle);

      const activeId = sections[deck.getIndex()]?.id;
      if (['map', 'ranking', 'diversity', 'groups', 'compare'].includes(activeId)) {
        motion.replayChart(activeId);
      }
    });
  } catch (error) {
    renderStaticError(error);
  }
}

init();
