import * as d3 from 'd3';
import { gsap } from 'gsap';
import { fmt } from '../data/aggregateData.js';
import { motionDuration } from '../animation/deckMotion.js';

export function renderHeroStage(container, summary) {
  container.innerHTML = `
    <div class="hero-visual">
      <svg class="ecuador-pulse" viewBox="0 0 560 560" role="img" aria-label="Mapa abstracto del Ecuador hecho con puntos de datos"></svg>
      <div class="hero-card">
        <strong data-hero-counter>0</strong>
        <span>registros agroproductivos</span>
      </div>
    </div>
  `;

  const svg = d3.select(container).select('svg');
  const heroCard = container.querySelector('.hero-card');
  const heroCounter = container.querySelector('[data-hero-counter]');

  const points = d3.range(180).map((i) => {
    const angle = i * 2.399963;
    const radius = 18 + Math.sqrt(i) * 17;
    const x = 280 + Math.cos(angle) * radius * (0.64 + (i % 5) * 0.04);
    const y = 280 + Math.sin(angle) * radius * (1.02 - (i % 7) * 0.03);
    return { x, y, r: 1.6 + (i % 9) * 0.22 };
  });

  const outline = svg
    .append('path')
    .attr('d', 'M254 42 C330 56 395 105 421 178 C466 306 397 441 283 515 C207 466 127 392 119 276 C111 163 168 73 254 42Z')
    .attr('class', 'map-glow');

  const dots = svg
    .selectAll('circle')
    .data(points)
    .join('circle')
    .attr('cx', (d) => d.x)
    .attr('cy', (d) => d.y)
    .attr('r', 0)
    .attr('class', 'data-dot');

  const outlineLength = outline.node().getTotalLength();

  function play() {
    // El contorno del país se dibuja y los puntos brotan en espiral.
    outline
      .interrupt()
      .attr('stroke-dasharray', outlineLength)
      .attr('stroke-dashoffset', outlineLength)
      .attr('fill-opacity', 0)
      .transition()
      .duration(motionDuration(1.6) * 1000)
      .ease(d3.easeCubicInOut)
      .attr('stroke-dashoffset', 0)
      .transition()
      .duration(motionDuration(0.7) * 1000)
      .attr('fill-opacity', 1)
      .on('end', () => outline.attr('stroke-dasharray', null));

    dots
      .interrupt()
      .attr('r', 0)
      .style('animation', 'none')
      .transition()
      .delay((_, i) => 350 + i * 9)
      .duration(motionDuration(0.5) * 1000)
      .ease(d3.easeBackOut.overshoot(2))
      .attr('r', (d) => d.r)
      .on('end', function (_, i) {
        // Reactiva el pulso ambiental una vez terminada la entrada.
        this.style.animation = '';
        this.style.animationDelay = `${i * 18}ms`;
      });

    gsap.fromTo(
      heroCard,
      { autoAlpha: 0, y: 30 },
      { autoAlpha: 1, y: 0, duration: motionDuration(0.8), delay: 0.9, ease: 'power3.out' }
    );

    d3.select(heroCounter)
      .transition()
      .delay(1000)
      .duration(motionDuration(1.4) * 1000)
      .tween('text', () => {
        const interpolate = d3.interpolateNumber(0, summary.records);
        return (t) => {
          heroCounter.textContent = Math.round(interpolate(t)).toLocaleString('es-EC');
        };
      });
  }

  function reset() {
    outline.interrupt().attr('stroke-dasharray', outlineLength).attr('stroke-dashoffset', outlineLength).attr('fill-opacity', 0);
    dots.interrupt().attr('r', 0);
    d3.select(heroCounter).interrupt();
    heroCounter.textContent = '0';
    gsap.set(heroCard, { autoAlpha: 0 });
  }

  return { play, reset };
}

export function renderKpis(container, summary) {
  const kpis = [
    { label: 'Registros', value: summary.records, suffix: '' },
    { label: 'Años', value: summary.years.length, suffix: '' },
    { label: 'Provincias y zonas', value: summary.provinces.length, suffix: '' },
    { label: 'Cultivos', value: summary.crops.length, suffix: '' },
    { label: `Producción ${summary.latestYear}`, value: summary.latestProduction, suffix: ' t' },
    { label: `Superficie cosechada ${summary.latestYear}`, value: summary.latestHarvested, suffix: ' ha' }
  ];

  container.innerHTML = `
    <div class="kpi-grid">
      ${kpis
        .map(
          (kpi) => `
            <article class="metric-tile">
              <strong data-value="${kpi.value}" data-suffix="${kpi.suffix}">0</strong>
              <span>${kpi.label}</span>
            </article>
          `
        )
        .join('')}
    </div>
    <div class="quality-note">
      Datos normalizados desde CSV: vacíos convertidos a null, texto con tildes preservado y métricas recalculadas en navegador.
    </div>
  `;

  const tiles = container.querySelectorAll('.metric-tile');
  const note = container.querySelector('.quality-note');

  function play() {
    gsap.fromTo(
      tiles,
      { autoAlpha: 0, y: 44, rotationX: -18, transformPerspective: 700 },
      {
        autoAlpha: 1,
        y: 0,
        rotationX: 0,
        duration: motionDuration(0.8),
        stagger: 0.09,
        ease: 'power3.out'
      }
    );
    gsap.fromTo(note, { autoAlpha: 0 }, { autoAlpha: 1, duration: motionDuration(0.6), delay: 0.7 });

    container.querySelectorAll('[data-value]').forEach((node, i) => {
      const target = Number(node.dataset.value);
      d3.select(node)
        .interrupt()
        .transition()
        .delay(200 + i * 90)
        .duration(motionDuration(1.2) * 1000)
        .tween('text', () => {
          const interpolate = d3.interpolateNumber(0, target);
          return (t) => {
            node.textContent = `${fmt.compact(interpolate(t))}${node.dataset.suffix}`;
          };
        });
    });
  }

  function reset() {
    gsap.set(tiles, { autoAlpha: 0 });
    gsap.set(note, { autoAlpha: 0 });
    container.querySelectorAll('[data-value]').forEach((node) => {
      d3.select(node).interrupt();
      node.textContent = '0';
    });
  }

  return { play, reset };
}
