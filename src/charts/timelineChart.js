import * as d3 from 'd3';
import { cropsByTotalProduction, fmt, yearlySeries } from '../data/aggregateData.js';
import { motionDuration } from '../animation/deckMotion.js';

// Verificado contra el CSV: 2012 es el primer año en que la Amazonía se
// reporta por provincia individual (antes venía agregada como
// "Nororiente"/"Centro-Suroriente"). El Niño costero y la pandemia son
// hechos públicos ampliamente documentados que coinciden con caídas o
// quiebres visibles en varias series.
const ANNOTATIONS = [
  { year: 2012, label: 'Amazonía: provincias individuales' },
  { year: 2016, label: 'El Niño costero 2015-16' },
  { year: 2020, label: 'Pandemia COVID-19' }
];

export function renderTimeline(container, rows, summary) {
  const crops = cropsByTotalProduction(rows);
  const groups = summary.groups;
  container.innerHTML = `
    <div class="chart-controls">
      <select id="timelineMode" aria-label="Tipo de serie">
        <option value="crop">Cultivo</option>
        <option value="group">Grupo</option>
      </select>
      <select id="timelineValue" aria-label="Valor de serie"></select>
    </div>
    <div class="timeline-plot"></div>
  `;

  const modeSelect = container.querySelector('#timelineMode');
  const valueSelect = container.querySelector('#timelineValue');
  const plot = container.querySelector('.timeline-plot');

  const width = plot.clientWidth || 720;
  const height = plot.clientHeight || 430;
  const margin = { top: 30, right: 24, bottom: 42, left: 68 };
  plot.innerHTML = '<svg class="chart-svg" role="img" aria-label="Serie temporal de producción"></svg>';
  const svg = d3.select(plot).select('svg').attr('viewBox', `0 0 ${width} ${height}`);

  const x = d3.scaleLinear().range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().range([height - margin.bottom, margin.top]);

  const xAxisG = svg.append('g').attr('transform', `translate(0,${height - margin.bottom})`);
  const yAxisG = svg.append('g').attr('transform', `translate(${margin.left},0)`);
  const areaPath = svg.append('path').attr('class', 'timeline-area').attr('opacity', 0);
  const annotationsG = svg.append('g').attr('class', 'timeline-annotations');
  const linePath = svg.append('path').attr('class', 'timeline-line');
  const dotsG = svg.append('g');

  const line = d3
    .line()
    .defined((d) => d.production > 0)
    .x((d) => x(d.year))
    .y((d) => y(d.production))
    .curve(d3.curveCatmullRom.alpha(0.5));
  const area = d3
    .area()
    .x((d) => x(d.year))
    .y0(height - margin.bottom)
    .y1((d) => y(d.production))
    .curve(d3.curveCatmullRom.alpha(0.5));

  function fillOptions() {
    const values = modeSelect.value === 'crop' ? crops : groups;
    valueSelect.innerHTML = values.map((value) => `<option value="${value}">${value}</option>`).join('');
  }

  function currentSeries() {
    return yearlySeries(rows, modeSelect.value, valueSelect.value);
  }

  // Solo dibuja las marcas que caen dentro del rango de años que sí tiene
  // esta serie (un cultivo puntual puede no cubrir 2002-2025 completo).
  function drawAnnotations(domain, dur, animate) {
    const [min, max] = domain;
    const visible = ANNOTATIONS.filter((a) => a.year >= min && a.year <= max);
    const top = margin.top + 4;
    const bottom = height - margin.bottom;

    const groups = annotationsG
      .selectAll('g.timeline-annotation')
      .data(visible, (d) => d.year)
      .join(
        (enter) => {
          const g = enter.append('g').attr('class', 'timeline-annotation').attr('opacity', 0);
          g.append('line').attr('y1', top).attr('y2', bottom);
          g.append('text').attr('y', top).attr('transform', `rotate(-90)`).attr('dy', '-0.35em').attr('dx', 4);
          return g;
        },
        (update) => update,
        (exit) => exit.transition().duration(dur / 2).attr('opacity', 0).remove()
      );

    groups
      .select('text')
      .text((d) => d.label);

    const t = animate ? groups.transition().duration(dur).ease(d3.easeCubicInOut) : groups;
    t.attr('transform', (d) => `translate(${x(d.year)},0)`).attr('opacity', 1);
  }

  // Cambio de serie: los ejes, el área y la línea se morfean a la nueva forma.
  function morphTo(series) {
    const dur = motionDuration(0.85) * 1000;
    const domain = d3.extent(series, (d) => d.year);
    x.domain(domain);
    y.domain([0, d3.max(series, (d) => d.production) || 1]).nice();

    xAxisG.transition().duration(dur).call(d3.axisBottom(x).tickFormat(d3.format('d')).ticks(8));
    yAxisG.transition().duration(dur).call(d3.axisLeft(y).ticks(5).tickFormat(fmt.compact));
    drawAnnotations(domain, dur, true);

    linePath
      .datum(series)
      .attr('stroke-dasharray', null)
      .attr('stroke-dashoffset', null)
      .transition()
      .duration(dur)
      .ease(d3.easeCubicInOut)
      .attr('d', line);

    areaPath.datum(series).transition().duration(dur).ease(d3.easeCubicInOut).attr('d', area).attr('opacity', 1);

    dotsG
      .selectAll('circle')
      .data(series.filter((d) => d.production > 0), (d) => d.year)
      .join(
        (enter) =>
          enter
            .append('circle')
            .attr('class', 'line-dot')
            .attr('r', 0)
            .attr('cx', (d) => x(d.year))
            .attr('cy', (d) => y(d.production)),
        (update) => update,
        (exit) => exit.transition().duration(dur / 2).attr('r', 0).remove()
      )
      .transition()
      .duration(dur)
      .attr('cx', (d) => x(d.year))
      .attr('cy', (d) => y(d.production))
      .attr('r', 4);
  }

  // Entrada de capítulo: la línea se dibuja de izquierda a derecha.
  function play() {
    const series = currentSeries();
    const domain = d3.extent(series, (d) => d.year);
    x.domain(domain);
    y.domain([0, d3.max(series, (d) => d.production) || 1]).nice();

    xAxisG.interrupt().call(d3.axisBottom(x).tickFormat(d3.format('d')).ticks(8));
    yAxisG.interrupt().call(d3.axisLeft(y).ticks(5).tickFormat(fmt.compact));
    drawAnnotations(domain, 0, false);
    annotationsG.selectAll('g.timeline-annotation').interrupt().attr('opacity', 0);
    annotationsG
      .selectAll('g.timeline-annotation')
      .transition()
      .delay((_, i) => 900 + i * 180)
      .duration(motionDuration(0.5) * 1000)
      .attr('opacity', 1);

    linePath.datum(series).interrupt().attr('d', line);
    areaPath.datum(series).interrupt().attr('d', area).attr('opacity', 0);

    const node = linePath.node();
    const length = node.getTotalLength();
    linePath
      .attr('stroke-dasharray', length)
      .attr('stroke-dashoffset', length)
      .transition()
      .duration(motionDuration(1.4) * 1000)
      .ease(d3.easeCubicInOut)
      .attr('stroke-dashoffset', 0)
      .on('end', () => linePath.attr('stroke-dasharray', null));

    areaPath.transition().delay(500).duration(motionDuration(0.9) * 1000).attr('opacity', 1);

    dotsG
      .selectAll('circle')
      .data(series.filter((d) => d.production > 0), (d) => d.year)
      .join('circle')
      .attr('class', 'line-dot')
      .attr('cx', (d) => x(d.year))
      .attr('cy', (d) => y(d.production))
      .interrupt()
      .attr('r', 0)
      .transition()
      .delay((_, i) => 200 + i * (1100 / Math.max(series.length, 1)))
      .duration(motionDuration(0.4) * 1000)
      .ease(d3.easeBackOut)
      .attr('r', 4);
  }

  function reset() {
    linePath.interrupt();
    areaPath.interrupt().attr('opacity', 0);
    dotsG.selectAll('circle').interrupt().attr('r', 0);
    annotationsG.selectAll('g.timeline-annotation').interrupt().attr('opacity', 0);
    const node = linePath.node();
    if (node.getAttribute('d')) {
      const length = node.getTotalLength();
      linePath.attr('stroke-dasharray', length).attr('stroke-dashoffset', length);
    }
  }

  fillOptions();
  play();
  reset();

  modeSelect.addEventListener('change', () => {
    fillOptions();
    morphTo(currentSeries());
  });
  valueSelect.addEventListener('change', () => morphTo(currentSeries()));

  return { play, reset };
}
