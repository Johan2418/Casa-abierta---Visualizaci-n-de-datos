import * as d3 from 'd3';
import { fmt } from '../data/aggregateData.js';
import { motionDuration } from '../animation/deckMotion.js';

export function renderRankingBars(container, data, title = 'Top cultivos por producción') {
  const width = container.clientWidth || 760;
  const height = container.clientHeight || 500;
  const compact = width < 560;
  const margin = {
    top: 54,
    right: compact ? 64 : 120,
    bottom: 28,
    left: compact ? 132 : 190
  };
  container.innerHTML = '<svg class="chart-svg" role="img" aria-label="Ranking de cultivos"></svg>';
  const svg = d3.select(container).select('svg').attr('viewBox', `0 0 ${width} ${height}`);

  const defs = svg.append('defs');
  const gradient = defs
    .append('linearGradient')
    .attr('id', 'barGradient')
    .attr('x1', '0')
    .attr('x2', '1')
    .attr('y1', '0')
    .attr('y2', '0');
  gradient.append('stop').attr('offset', '0%').attr('stop-color', 'var(--accent)').attr('stop-opacity', 0.55);
  gradient.append('stop').attr('offset', '100%').attr('stop-color', 'var(--accent)');

  const x = d3
    .scaleLinear()
    .domain([0, d3.max(data, (d) => d.production) || 1])
    .nice()
    .range([margin.left, width - margin.right]);
  const y = d3
    .scaleBand()
    .domain(data.map((d) => d.crop))
    .range([margin.top, height - margin.bottom])
    .padding(0.26);

  svg.append('text').attr('x', margin.left).attr('y', 28).attr('class', 'chart-title').text(title);
  svg
    .append('g')
    .attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickSize(0))
    .call((g) => g.select('.domain').remove());
  svg
    .append('g')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(4).tickFormat(fmt.compact))
    .call((g) => g.select('.domain').attr('opacity', 0.2));

  const bars = svg
    .selectAll('rect.rank-bar')
    .data(data)
    .join('rect')
    .attr('class', (_, i) => `rank-bar${i === 0 ? ' is-leader' : ''}`)
    .attr('fill', 'url(#barGradient)')
    .attr('x', margin.left)
    .attr('y', (d) => y(d.crop))
    .attr('height', y.bandwidth())
    .attr('rx', 7)
    .attr('width', 0);

  const labels = svg
    .selectAll('text.value-label')
    .data(data)
    .join('text')
    .attr('class', 'value-label')
    .attr('x', (d) => Math.min(width - 8, x(d.production) + 10))
    .attr('y', (d) => y(d.crop) + y.bandwidth() / 2 + 4)
    .attr('text-anchor', (d) => (x(d.production) > width - margin.right - 20 ? 'end' : 'start'))
    .attr('opacity', 0)
    .text((d) => `${fmt.compact(d.production)} t`);

  function play() {
    bars
      .interrupt()
      .attr('width', 0)
      .transition()
      .duration(motionDuration(0.95) * 1000)
      .delay((_, i) => i * 70)
      .ease(d3.easeCubicOut)
      .attr('width', (d) => Math.max(2, x(d.production) - margin.left));

    labels
      .interrupt()
      .attr('opacity', 0)
      .transition()
      .duration(motionDuration(0.9) * 1000)
      .delay((_, i) => 260 + i * 70)
      .attr('opacity', 1)
      .tween('text', function (d) {
        const interpolate = d3.interpolateNumber(0, d.production);
        return (t) => {
          this.textContent = `${fmt.compact(interpolate(t))} t`;
        };
      });
  }

  function reset() {
    bars.interrupt().attr('width', 0);
    labels.interrupt().attr('opacity', 0);
  }

  return { play, reset };
}
