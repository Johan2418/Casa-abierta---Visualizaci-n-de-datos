import * as d3 from 'd3';
import { fmt } from '../data/aggregateData.js';
import { motionDuration } from '../animation/deckMotion.js';

export function renderGroupCycleBars(container, data) {
  const width = container.clientWidth || 780;
  const height = container.clientHeight || 500;
  const margin = { top: 54, right: 56, bottom: 70, left: 68 };
  container.innerHTML = '<svg class="chart-svg" role="img" aria-label="Barras apiladas por grupo y ciclo de cultivo"></svg>';
  const svg = d3.select(container).select('svg').attr('viewBox', `0 0 ${width} ${height}`);
  const keys = ['permanent', 'transient'];
  const x = d3
    .scaleBand()
    .domain(data.map((d) => d.group))
    .range([margin.left, width - margin.right])
    .padding(0.28);
  const y = d3
    .scaleLinear()
    .domain([0, d3.max(data, (d) => d.production) || 1])
    .nice()
    .range([height - margin.bottom, margin.top]);
  const color = d3.scaleOrdinal().domain(keys).range(['#79e28b', '#34a4ff']);
  const stack = d3.stack().keys(keys)(data);

  svg.append('text').attr('x', margin.left).attr('y', 28).attr('class', 'chart-title').text('Producción por grupo y ciclo');
  svg.append('g').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(fmt.compact));
  svg
    .append('g')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x))
    .selectAll('text')
    .attr('transform', 'rotate(-24)')
    .attr('text-anchor', 'end');

  const layers = svg
    .selectAll('g.stack')
    .data(stack)
    .join('g')
    .attr('class', 'stack')
    .attr('fill', (d) => color(d.key));

  const rects = layers
    .selectAll('rect')
    .data((d, layerIndex) => d.map((item) => ({ ...item, layerIndex })))
    .join('rect')
    .attr('x', (d) => x(d.data.group))
    .attr('y', height - margin.bottom)
    .attr('height', 0)
    .attr('width', x.bandwidth())
    .attr('rx', 5);

  const legend = svg.append('g').attr('class', 'legend-row').attr('transform', `translate(${margin.left},${height - 24})`).attr('opacity', 0);
  [
    ['permanent', 'Permanente'],
    ['transient', 'Transitorio']
  ].forEach(([key, label], index) => {
    const row = legend.append('g').attr('transform', `translate(${index * 150},0)`);
    row.append('rect').attr('width', 14).attr('height', 14).attr('rx', 4).attr('fill', color(key));
    row.append('text').attr('x', 22).attr('y', 12).text(label);
  });

  function play() {
    // Las capas crecen en secuencia: primero lo permanente, luego lo transitorio.
    rects
      .interrupt()
      .attr('y', height - margin.bottom)
      .attr('height', 0)
      .transition()
      .duration(motionDuration(0.85) * 1000)
      .delay((d, i) => d.layerIndex * 480 + (i % data.length) * 55)
      .ease(d3.easeCubicOut)
      .attr('y', (d) => y(d[1]))
      .attr('height', (d) => Math.max(0, y(d[0]) - y(d[1])));

    legend
      .interrupt()
      .attr('opacity', 0)
      .transition()
      .delay(650)
      .duration(motionDuration(0.5) * 1000)
      .attr('opacity', 1);
  }

  function reset() {
    rects.interrupt().attr('y', height - margin.bottom).attr('height', 0);
    legend.interrupt().attr('opacity', 0);
  }

  return { play, reset };
}
