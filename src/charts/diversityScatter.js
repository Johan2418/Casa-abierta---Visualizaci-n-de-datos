import * as d3 from 'd3';
import { fmt } from '../data/aggregateData.js';
import { motionDuration } from '../animation/deckMotion.js';

const regionColor = {
  Costa: '#f4c95d',
  Sierra: '#79e28b',
  Amazonía: '#28d6ba',
  'Amazonía agrupada': '#34a4ff',
  'Sin clasificar': '#9ba4b5'
};

export function renderDiversityScatter(container, data, tooltip) {
  const width = container.clientWidth || 760;
  const height = container.clientHeight || 500;
  const margin = { top: 44, right: 34, bottom: 62, left: 72 };
  const clean = data.filter((d) => d.diversity !== null && d.hhi !== null);
  container.innerHTML = '<svg class="chart-svg" role="img" aria-label="Dispersión de diversidad frente a concentración"></svg>';

  const svg = d3.select(container).select('svg').attr('viewBox', `0 0 ${width} ${height}`);
  const x = d3.scaleLinear().domain([0, 1]).range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain([0, 1]).range([height - margin.bottom, margin.top]);
  const r = d3
    .scaleSqrt()
    .domain([0, d3.max(clean, (d) => d.production) || 1])
    .range([6, 30]);

  svg.append('text').attr('x', margin.left).attr('y', 26).attr('class', 'chart-title').text('Diversidad agrícola vs concentración de superficie');
  svg.append('g').attr('transform', `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).ticks(5));
  svg.append('g').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5));
  svg.append('text').attr('x', width / 2).attr('y', height - 18).attr('class', 'axis-label').attr('text-anchor', 'middle').text('Índice Shannon normalizado');
  svg.append('text').attr('x', -height / 2).attr('y', 22).attr('class', 'axis-label').attr('text-anchor', 'middle').attr('transform', 'rotate(-90)').text('HHI superficie');

  const guideV = svg
    .append('line')
    .attr('x1', x(0.5))
    .attr('x2', x(0.5))
    .attr('y1', margin.top)
    .attr('y2', height - margin.bottom)
    .attr('class', 'guide-line');
  const guideH = svg
    .append('line')
    .attr('x1', margin.left)
    .attr('x2', width - margin.right)
    .attr('y1', y(0.5))
    .attr('y2', y(0.5))
    .attr('class', 'guide-line');

  const quadrantLabels = [
    { x: x(0.75), y: y(0.94), text: 'Diverso y concentrado' },
    { x: x(0.25), y: y(0.94), text: 'Poco diverso y concentrado' },
    { x: x(0.75), y: y(0.06), text: 'Diverso y disperso' },
    { x: x(0.25), y: y(0.06), text: 'Poco diverso y disperso' }
  ];
  const quadrants = svg
    .selectAll('text.quadrant-label')
    .data(quadrantLabels)
    .join('text')
    .attr('class', 'quadrant-label')
    .attr('x', (d) => d.x)
    .attr('y', (d) => d.y)
    .attr('text-anchor', 'middle')
    .attr('opacity', 0)
    .text((d) => d.text);

  // Orden de entrada por cuadrante: los puntos aparecen en oleadas.
  const quadrantOf = (d) => (d.diversity >= 0.5 ? 0 : 1) + (d.hhi >= 0.5 ? 0 : 2);

  const points = svg
    .selectAll('circle.scatter-point')
    .data(clean)
    .join('circle')
    .attr('class', 'scatter-point')
    .attr('cx', (d) => x(d.diversity))
    .attr('cy', (d) => y(d.hhi))
    .attr('r', 0)
    .attr('fill', (d) => regionColor[d.region] ?? '#9ba4b5')
    .attr('fill-opacity', 0.78)
    .attr('stroke', '#fff')
    .attr('stroke-opacity', 0.3)
    .on('mousemove', (event, d) => {
      tooltip.innerHTML = `<strong>${d.province}</strong><span>${d.region}</span><span>Shannon ${fmt.decimal(d.diversity)} · HHI ${fmt.decimal(d.hhi)}</span><span>${fmt.compact(d.production)} t</span>`;
      tooltip.classList.add('is-visible');
      tooltip.style.left = `${event.clientX + 16}px`;
      tooltip.style.top = `${event.clientY + 16}px`;
    })
    .on('mouseleave', () => tooltip.classList.remove('is-visible'));

  function drawGuide(selection, delay) {
    const node = selection.node();
    const length = Math.hypot(
      Number(node.getAttribute('x2')) - Number(node.getAttribute('x1')),
      Number(node.getAttribute('y2')) - Number(node.getAttribute('y1'))
    );
    selection
      .interrupt()
      .attr('stroke-dasharray', `${length}`)
      .attr('stroke-dashoffset', length)
      .transition()
      .delay(delay)
      .duration(motionDuration(0.9) * 1000)
      .ease(d3.easeCubicInOut)
      .attr('stroke-dashoffset', 0)
      .on('end', () => selection.attr('stroke-dasharray', '6 7').attr('stroke-dashoffset', null));
  }

  function play() {
    drawGuide(guideV, 0);
    drawGuide(guideH, 150);

    points
      .interrupt()
      .attr('r', 0)
      .transition()
      .delay((d, i) => 300 + quadrantOf(d) * 260 + (i % 8) * 40)
      .duration(motionDuration(0.7) * 1000)
      .ease(d3.easeBackOut.overshoot(1.6))
      .attr('r', (d) => r(d.production));

    quadrants
      .interrupt()
      .attr('opacity', 0)
      .transition()
      .delay((_, i) => 500 + i * 260)
      .duration(motionDuration(0.6) * 1000)
      .attr('opacity', 0.85);
  }

  function reset() {
    points.interrupt().attr('r', 0);
    quadrants.interrupt().attr('opacity', 0);
    guideV.interrupt().attr('stroke-dasharray', '6 7');
    guideH.interrupt().attr('stroke-dasharray', '6 7');
  }

  return { play, reset };
}
