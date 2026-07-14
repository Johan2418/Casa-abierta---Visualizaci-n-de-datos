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
    { label: 'Registros', value: summary.records, suffix: '', icon: 'database' },
    { label: 'Años', value: summary.years.length, suffix: '', icon: 'calendar' },
    { label: 'Provincias y zonas', value: summary.provinces.length, suffix: '', icon: 'map' },
    { label: 'Cultivos', value: summary.crops.length, suffix: '', icon: 'plant' },
    { label: `Producción ${summary.latestYear}`, value: summary.latestProduction, suffix: ' t', icon: 'harvest' },
    { label: `Superficie cosechada ${summary.latestYear}`, value: summary.latestHarvested, suffix: ' ha', icon: 'terrain' }
  ];

  function getIconSVG(type) {
    const icons = {
      database: `<svg viewBox="0 0 24 24" class="kpi-icon" aria-hidden="true">
        <ellipse cx="12" cy="4" rx="7" ry="2.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
        <path d="M5 4v8c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V4" stroke="currentColor" stroke-width="1.5" fill="none"/>
        <ellipse cx="12" cy="14.5" rx="7" ry="2.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
        <path d="M5 12v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-6" stroke="currentColor" stroke-width="1.5" fill="none"/>
      </svg>`,
      calendar: `<svg viewBox="0 0 24 24" class="kpi-icon" aria-hidden="true">
        <rect x="4" y="6" width="16" height="14" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/>
        <path d="M8 2v6M16 2v6M4 10h16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>`,
      map: `<svg viewBox="0 0 24 24" class="kpi-icon" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/>
        <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
      </svg>`,
      plant: `<svg viewBox="0 0 24 24" class="kpi-icon" aria-hidden="true">
        <path d="M12 2v10M12 12c-2.5 0-4.5 1.5-5 3.5M12 12c2.5 0 4.5 1.5 5 3.5M7 20h10M12 20v-4" 
              stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>
        <ellipse cx="8" cy="9" rx="2" ry="2.5" fill="currentColor" opacity="0.6"/>
        <ellipse cx="16" cy="9" rx="2" ry="2.5" fill="currentColor" opacity="0.6"/>
      </svg>`,
      harvest: `<svg viewBox="0 0 24 24" class="kpi-icon" aria-hidden="true">
        <path d="M5 18h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2z" 
              stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/>
        <path d="M8 8v8M12 8v8M16 8v8" stroke="currentColor" stroke-width="1" opacity="0.5"/>
      </svg>`,
      terrain: `<svg viewBox="0 0 24 24" class="kpi-icon" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/>
        <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" stroke-width="1" opacity="0.4"/>
        <line x1="3" y1="13" x2="21" y2="13" stroke="currentColor" stroke-width="1" opacity="0.4"/>
        <line x1="7" y1="5" x2="7" y2="19" stroke="currentColor" stroke-width="1" opacity="0.4"/>
        <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="1" opacity="0.4"/>
        <line x1="17" y1="5" x2="17" y2="19" stroke="currentColor" stroke-width="1" opacity="0.4"/>
      </svg>`
    };
    return icons[type] || '';
  }

  container.innerHTML = `
    <div class="kpi-grid">
      ${kpis
        .map(
          (kpi) => `
            <article class="metric-tile">
              <div class="metric-icon-slot">
                ${getIconSVG(kpi.icon)}
              </div>
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
