import * as d3 from 'd3';
import { gsap } from 'gsap';
import { fmt, provinceStats, provinceSummary, yearlySeries } from '../data/aggregateData.js';
import { motionDuration } from '../animation/deckMotion.js';

const METRICS = [
  { key: 'production', label: 'Producción', format: (v) => `${fmt.compact(v)} t` },
  { key: 'harvested', label: 'Superficie cosechada', format: (v) => `${fmt.compact(v)} ha` },
  { key: 'yield', label: 'Rendimiento promedio', format: (v) => `${fmt.decimal(v)} t/ha` },
  { key: 'diversity', label: 'Diversidad Shannon', format: (v) => fmt.decimal(v) }
];

function optionList(values) {
  return values.map((value) => `<option value="${value}">${value}</option>`).join('');
}

export function renderProvinceCompare(container, rows, summary) {
  const provinces = summary.provinces;
  // Arranca con las dos provincias más productivas: el "cara a cara" abre
  // con la pelea más interesante y coincide con el chip de insight.
  const byProduction = provinceSummary(rows, summary.latestYear);
  const defaultA = byProduction[0]?.province ?? provinces[0];
  const defaultB = byProduction[1]?.province ?? provinces[1] ?? provinces[0];

  container.innerHTML = `
    <div class="compare-shell" data-deck-ignore>
      <div class="compare-controls">
        <select id="compareA" aria-label="Provincia A">${optionList(provinces)}</select>
        <span class="versus-badge">VS</span>
        <select id="compareB" aria-label="Provincia B">${optionList(provinces)}</select>
      </div>
      <div class="compare-metrics" id="compareMetrics"></div>
      <div class="compare-trend">
        <svg class="chart-svg" id="compareTrendSvg" role="img" aria-label="Evolución comparada de producción"></svg>
        <div class="compare-trend-legend" id="compareLegend"></div>
      </div>
    </div>
  `;

  container.querySelector('#compareA').value = defaultA;
  container.querySelector('#compareB').value = defaultB;

  const selectA = container.querySelector('#compareA');
  const selectB = container.querySelector('#compareB');
  const metricsHost = container.querySelector('#compareMetrics');
  const legendHost = container.querySelector('#compareLegend');
  const trendSvg = d3.select(container.querySelector('#compareTrendSvg'));

  metricsHost.innerHTML = METRICS.map(
    (metric) => `
      <div class="compare-row" data-metric="${metric.key}">
        <span class="compare-value compare-value-a">0</span>
        <div class="compare-track">
          <div class="compare-bar compare-bar-a"></div>
          <span class="compare-label">${metric.label}</span>
          <div class="compare-bar compare-bar-b"></div>
        </div>
        <span class="compare-value compare-value-b">0</span>
      </div>
    `
  ).join('');

  function stats() {
    return {
      a: provinceStats(rows, selectA.value, summary.latestYear),
      b: provinceStats(rows, selectB.value, summary.latestYear)
    };
  }

  function drawMetrics({ a, b }, animate) {
    METRICS.forEach((metric) => {
      const row = metricsHost.querySelector(`[data-metric="${metric.key}"]`);
      const max = Math.max(a[metric.key], b[metric.key], 1e-9);
      const barA = row.querySelector('.compare-bar-a');
      const barB = row.querySelector('.compare-bar-b');
      const valueA = row.querySelector('.compare-value-a');
      const valueB = row.querySelector('.compare-value-b');
      const widthA = `${Math.min(100, (a[metric.key] / max) * 100)}%`;
      const widthB = `${Math.min(100, (b[metric.key] / max) * 100)}%`;

      if (animate) {
        gsap.fromTo(barA, { width: '0%' }, { width: widthA, duration: motionDuration(0.8), ease: 'power3.out' });
        gsap.fromTo(barB, { width: '0%' }, { width: widthB, duration: motionDuration(0.8), ease: 'power3.out' });
      } else {
        gsap.set(barA, { width: widthA });
        gsap.set(barB, { width: widthB });
      }

      [{ node: valueA, target: a[metric.key] }, { node: valueB, target: b[metric.key] }].forEach(({ node, target }) => {
        const previous = Number(node.dataset.raw ?? 0);
        node.dataset.raw = target;
        d3.select(node)
          .interrupt()
          .transition()
          .duration(motionDuration(0.8) * 1000)
          .tween('text', () => {
            const interpolate = d3.interpolateNumber(previous, target);
            return (t) => {
              node.textContent = metric.format(interpolate(t));
            };
          });
      });
    });

    // Anota el cultivo estrella de cada provincia bajo su valor de producción.
    const prodRow = metricsHost.querySelector('[data-metric="production"]');
    prodRow.querySelector('.compare-value-a').title = `Cultivo estrella: ${a.topCrop}`;
    prodRow.querySelector('.compare-value-b').title = `Cultivo estrella: ${b.topCrop}`;
  }

  function drawTrend({ a, b }, animate) {
    const width = container.clientWidth || 760;
    const height = 190;
    const margin = { top: 18, right: 16, bottom: 26, left: 56 };
    trendSvg.attr('viewBox', `0 0 ${width} ${height}`);

    const seriesA = yearlySeries(rows, 'province', a.province);
    const seriesB = yearlySeries(rows, 'province', b.province);
    const x = d3.scaleLinear().domain(d3.extent(summary.years)).range([margin.left, width - margin.right]);
    const y = d3
      .scaleLinear()
      .domain([0, d3.max([...seriesA, ...seriesB], (d) => d.production) || 1])
      .nice()
      .range([height - margin.bottom, margin.top]);
    const line = d3
      .line()
      .defined((d) => d.production > 0)
      .x((d) => x(d.year))
      .y((d) => y(d.production))
      .curve(d3.curveMonotoneX);

    trendSvg.selectAll('*').remove();
    trendSvg.append('g').attr('transform', `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).tickFormat(d3.format('d')).ticks(6));
    trendSvg.append('g').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(fmt.compact));

    const pathA = trendSvg.append('path').datum(seriesA).attr('class', 'compare-line compare-line-a').attr('d', line);
    const pathB = trendSvg.append('path').datum(seriesB).attr('class', 'compare-line compare-line-b').attr('d', line);

    [pathA, pathB].forEach((path, i) => {
      const node = path.node();
      const length = node.getTotalLength();
      if (!length) return;
      if (animate) {
        path
          .attr('stroke-dasharray', length)
          .attr('stroke-dashoffset', length)
          .transition()
          .delay(i * 160)
          .duration(motionDuration(1) * 1000)
          .ease(d3.easeCubicInOut)
          .attr('stroke-dashoffset', 0)
          .on('end', () => path.attr('stroke-dasharray', null));
      } else {
        path.attr('stroke-dasharray', null).attr('stroke-dashoffset', null);
      }
    });

    legendHost.innerHTML = `
      <span class="legend-chip legend-chip-a">${a.province}</span>
      <span class="legend-chip legend-chip-b">${b.province}</span>
    `;
  }

  function draw(animate = true) {
    const current = stats();
    drawMetrics(current, animate);
    drawTrend(current, animate);
  }

  selectA.addEventListener('change', () => draw(false));
  selectB.addEventListener('change', () => draw(false));

  function play() {
    gsap.fromTo(
      container.querySelector('.compare-controls'),
      { autoAlpha: 0, y: -14 },
      { autoAlpha: 1, y: 0, duration: motionDuration(0.5), ease: 'power3.out' }
    );
    gsap.fromTo(
      metricsHost.querySelectorAll('.compare-row'),
      { autoAlpha: 0, y: 20 },
      { autoAlpha: 1, y: 0, duration: motionDuration(0.6), stagger: 0.1, delay: 0.15, ease: 'power3.out' }
    );
    gsap.fromTo(
      container.querySelector('.compare-trend'),
      { autoAlpha: 0, y: 20 },
      { autoAlpha: 1, y: 0, duration: motionDuration(0.6), delay: 0.55, ease: 'power3.out' }
    );
    draw(true);
  }

  function reset() {
    gsap.set(
      [container.querySelector('.compare-controls'), metricsHost.querySelectorAll('.compare-row'), container.querySelector('.compare-trend')],
      { autoAlpha: 0 }
    );
    metricsHost.querySelectorAll('.compare-bar').forEach((bar) => gsap.set(bar, { width: '0%' }));
  }

  // Llamado desde el mapa: pone la provincia clicada como "A". Si ya era la
  // "B", se intercambian en vez de repetir la misma provincia dos veces.
  function selectProvinceA(name) {
    if (!provinces.includes(name)) return;
    if (name === selectB.value) {
      selectB.value = selectA.value;
    }
    selectA.value = name;
    draw(false);
  }

  draw(false);
  gsap.set(
    [container.querySelector('.compare-controls'), metricsHost.querySelectorAll('.compare-row'), container.querySelector('.compare-trend')],
    { autoAlpha: 0 }
  );

  return { play, reset, selectProvinceA };
}
