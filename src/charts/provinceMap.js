import * as d3 from 'd3';
import { feature } from 'topojson-client';
import { fmt, provinceSummary } from '../data/aggregateData.js';
import { motionDuration } from '../animation/deckMotion.js';

const TOPO_PATH = '/data/ecuador-provincias.topo.json';
const COLOR_LOW = '#132019';
const COLOR_HIGH = '#f4c95d';
const NO_DATA_FILL = 'rgba(255, 255, 255, 0.07)';

export async function loadEcuadorTopology() {
  try {
    const response = await fetch(TOPO_PATH);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn('No se pudo cargar el TopoJSON del Ecuador:', error);
    return null;
  }
}

function normalizeName(name) {
  return String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function showTooltip(event, tooltip, html) {
  tooltip.innerHTML = html;
  tooltip.classList.add('is-visible');
  tooltip.style.left = `${event.clientX + 16}px`;
  tooltip.style.top = `${event.clientY + 16}px`;
}

function hideTooltip(tooltip) {
  tooltip.classList.remove('is-visible');
}

export function renderProvinceMap(container, rows, tooltip, topology, summary, onProvinceClick) {
  const width = container.clientWidth || 720;
  const height = container.clientHeight || 520;
  let currentYear = summary.latestYear;
  let data = provinceSummary(rows, currentYear);

  if (!topology) {
    container.innerHTML = `
      <div class="map-fallback">
        <p>No se pudo cargar la geografía del Ecuador.</p>
        <p>Verifica <code>public/data/ecuador-provincias.topo.json</code>.</p>
      </div>
    `;
    return { play() {}, reset() {} };
  }

  container.innerHTML = `
    <div class="map-controls" data-deck-ignore>
      <button type="button" class="play-button" id="mapPlayYears" aria-label="Reproducir evolución territorial"><span>▶</span><span>Ver cambio</span></button>
      <label>Año <input id="mapYear" type="range" min="${summary.years[0]}" max="${summary.latestYear}" step="1" value="${currentYear}" aria-label="Año del mapa" /></label>
      <strong id="mapYearValue">${currentYear}</strong>
    </div>
    <svg class="chart-svg" role="img" aria-label="Mapa coroplético del Ecuador por producción provincial"></svg>`;
  const svg = d3.select(container).select('svg').attr('viewBox', `0 0 ${width} ${height}`);

  const features = feature(topology, topology.objects.ecuador).features;
  const galapagos = features.find((f) => normalizeName(f.properties.name) === 'galapagos');
  const mainland = features.filter((f) => f !== galapagos);

  let dataByName = new Map(data.map((d) => [normalizeName(d.province), d]));
  const matched = mainland.filter((f) => dataByName.has(normalizeName(f.properties.name)));
  const unmatched = data.filter(
    (d) => !features.some((f) => normalizeName(f.properties.name) === normalizeName(d.province))
  );

  const maxProduction = d3.max(summary.years, (itemYear) => d3.max(provinceSummary(rows, itemYear), (item) => item.production)) || 1;
  // Raíz cuadrada: Guayas produce órdenes de magnitud más que la Amazonía y
  // una escala lineal dejaría medio mapa del mismo color.
  const color = d3.scaleSequentialSqrt([0, maxProduction], d3.interpolateRgb(COLOR_LOW, COLOR_HIGH));

  const projection = d3.geoMercator().fitExtent(
    [
      [24, 58],
      [width - 24, height - 56]
    ],
    { type: 'FeatureCollection', features: mainland }
  );
  const geoPath = d3.geoPath(projection);

  const title = svg
    .append('text')
    .attr('x', width / 2)
    .attr('y', 34)
    .attr('class', 'chart-title')
    .attr('text-anchor', 'middle')
    .text(`Producción provincial ${currentYear}`);

  // Ordenadas de oeste a este para que la entrada "barra" el país.
  const ordered = [...mainland].sort((a, b) => geoPath.centroid(a)[0] - geoPath.centroid(b)[0]);
  const entryIndex = new Map(ordered.map((f, i) => [f.properties.name, i]));

  const provincesG = svg.append('g');
  const paths = provincesG
    .selectAll('path.province-shape')
    .data(mainland)
    .join('path')
    .attr('class', 'province-shape')
    .attr('d', geoPath)
    .attr('fill', COLOR_LOW)
    .attr('opacity', 0)
    .on('mousemove', (event, f) => {
      const d = dataByName.get(normalizeName(f.properties.name));
      const html = d
        ? `<strong>${d.province}</strong><span>${d.region}</span><span>${fmt.compact(d.production)} t · ${d.crops} cultivos</span><span>Diversidad ${fmt.decimal(d.diversity ?? 0)}</span>${onProvinceClick ? '<span class="tooltip-hint">Clic para radiografía →</span>' : ''}`
        : `<strong>${f.properties.name}</strong><span>Sin datos en el CSV</span>`;
      showTooltip(event, tooltip, html);
      d3.select(event.currentTarget).attr('stroke', '#fff').attr('stroke-width', 1.6).raise();
    })
    .on('mouseleave', (event) => {
      hideTooltip(tooltip);
      d3.select(event.currentTarget).attr('stroke', 'rgba(255, 255, 255, 0.28)').attr('stroke-width', 0.7);
    })
    .on('click', (event, f) => {
      const d = dataByName.get(normalizeName(f.properties.name));
      if (d) onProvinceClick?.(d.province);
    })
    .attr('stroke', 'rgba(255, 255, 255, 0.28)')
    .attr('stroke-width', 0.7)
    .attr('stroke-linejoin', 'round');

  function finalFill(f) {
    const d = dataByName.get(normalizeName(f.properties.name));
    return d ? color(d.production) : NO_DATA_FILL;
  }

  // Halo pulsante sobre la provincia líder.
  const leaderFeature = matched.reduce(
    (best, f) =>
      dataByName.get(normalizeName(f.properties.name)).production >
      (best ? dataByName.get(normalizeName(best.properties.name)).production : -1)
        ? f
        : best,
    null
  );
  const leaderCentroid = leaderFeature ? geoPath.centroid(leaderFeature) : null;
  const halo = svg
    .append('circle')
    .attr('class', 'leader-halo')
    .attr('cx', leaderCentroid?.[0] ?? -100)
    .attr('cy', leaderCentroid?.[1] ?? -100)
    .attr('r', 0)
    .attr('fill', 'none')
    .attr('stroke', COLOR_HIGH);

  // Inset de Galápagos: sin datos agrícolas en ESPAC, pero el mapa del
  // Ecuador estaría incompleto sin las islas.
  let inset = null;
  if (galapagos) {
    const box = { x: 20, y: height - 178, w: 118, h: 86 };
    const insetProjection = d3.geoMercator().fitExtent(
      [
        [box.x + 8, box.y + 8],
        [box.x + box.w - 8, box.y + box.h - 22]
      ],
      galapagos
    );
    inset = svg.append('g').attr('class', 'galapagos-inset').attr('opacity', 0);
    inset
      .append('rect')
      .attr('x', box.x)
      .attr('y', box.y)
      .attr('width', box.w)
      .attr('height', box.h)
      .attr('rx', 6)
      .attr('class', 'inset-frame');
    inset
      .append('path')
      .attr('d', d3.geoPath(insetProjection)(galapagos))
      .attr('fill', NO_DATA_FILL)
      .attr('stroke', 'rgba(255, 255, 255, 0.35)')
      .attr('stroke-width', 0.7);
    inset
      .append('text')
      .attr('class', 'inset-label')
      .attr('x', box.x + box.w / 2)
      .attr('y', box.y + box.h - 8)
      .attr('text-anchor', 'middle')
      .text('Galápagos · sin datos');
  }

  // Leyenda: gradiente continuo con extremos etiquetados.
  const legendW = 190;
  const legendX = width - legendW - 26;
  const legendY = height - 40;
  const gradientId = 'mapLegendGradient';
  const defs = svg.append('defs');
  const gradient = defs.append('linearGradient').attr('id', gradientId).attr('x1', 0).attr('x2', 1);
  d3.range(0, 1.01, 0.2).forEach((t) => {
    gradient
      .append('stop')
      .attr('offset', `${t * 100}%`)
      .attr('stop-color', color(maxProduction * t * t)); // t² deshace la raíz para que el gradiente refleje la escala
  });
  const legend = svg.append('g').attr('class', 'map-legend').attr('opacity', 0);
  legend
    .append('rect')
    .attr('x', legendX)
    .attr('y', legendY)
    .attr('width', legendW)
    .attr('height', 10)
    .attr('rx', 5)
    .attr('fill', `url(#${gradientId})`);
  legend.append('text').attr('class', 'axis-label').attr('x', legendX).attr('y', legendY - 8).text('0 t');
  legend
    .append('text')
    .attr('class', 'axis-label')
    .attr('x', legendX + legendW)
    .attr('y', legendY - 8)
    .attr('text-anchor', 'end')
    .text(`${fmt.compact(maxProduction)} t`);

  if (unmatched.length) {
    legend
      .append('text')
      .attr('class', 'map-footnote')
      .attr('x', legendX + legendW)
      .attr('y', legendY + 28)
      .attr('text-anchor', 'end')
      .text(`Zonas agregadas sin geometría: ${unmatched.map((d) => d.province).join(', ')}`);
  }

  const yearInput = container.querySelector('#mapYear');
  const yearValue = container.querySelector('#mapYearValue');
  const playButton = container.querySelector('#mapPlayYears');
  let playbackTimer = null;

  function updateYear(year, animate = true) {
    currentYear = Number(year);
    data = provinceSummary(rows, currentYear);
    dataByName = new Map(data.map((item) => [normalizeName(item.province), item]));
    title.text(`Producción provincial ${currentYear}`);
    yearInput.value = currentYear;
    yearValue.textContent = currentYear;
    const selection = animate ? paths.transition().duration(motionDuration(0.55) * 1000) : paths;
    selection.attr('fill', finalFill);
  }

  function stopPlayback() {
    clearTimeout(playbackTimer);
    playbackTimer = null;
    playButton.classList.remove('is-playing');
    playButton.querySelector('span').textContent = '▶';
  }

  function startPlayback() {
    stopPlayback();
    playButton.classList.add('is-playing');
    playButton.querySelector('span').textContent = '⏸';
    // La animación siempre cuenta la historia completa, no solo los años que
    // queden después del valor que estaba seleccionado.
    let index = 0;
    const step = () => {
      updateYear(summary.years[index]);
      index += 1;
      if (index >= summary.years.length) {
        stopPlayback();
        return;
      }
      playbackTimer = setTimeout(step, 600);
    };
    step();
  }

  yearInput.addEventListener('input', () => {
    stopPlayback();
    updateYear(yearInput.value);
  });
  playButton.addEventListener('click', () => (playbackTimer ? stopPlayback() : startPlayback()));

  function play() {
    paths
      .interrupt()
      .attr('opacity', 0)
      .attr('fill', COLOR_LOW)
      .transition()
      .delay((f) => 80 + entryIndex.get(f.properties.name) * 55)
      .duration(motionDuration(0.55) * 1000)
      .attr('opacity', 1)
      .transition()
      .duration(motionDuration(0.75) * 1000)
      .attr('fill', finalFill);

    legend
      .interrupt()
      .attr('opacity', 0)
      .transition()
      .delay(900)
      .duration(motionDuration(0.6) * 1000)
      .attr('opacity', 1);

    inset
      ?.interrupt()
      .attr('opacity', 0)
      .transition()
      .delay(1050)
      .duration(motionDuration(0.6) * 1000)
      .attr('opacity', 1);

    if (leaderCentroid) {
      halo
        .interrupt()
        .attr('stroke-opacity', 0)
        .transition()
        .delay(1400)
        .on('start', function repeat() {
          d3.select(this)
            .attr('r', 10)
            .attr('stroke-opacity', 0.85)
            .transition()
            .duration(motionDuration(1.7) * 1000)
            .ease(d3.easeCubicOut)
            .attr('r', 44)
            .attr('stroke-opacity', 0)
            .transition()
            .on('start', repeat);
        });
    }
  }

  function reset() {
    stopPlayback();
    paths.interrupt().attr('opacity', 0).attr('fill', COLOR_LOW);
    legend.interrupt().attr('opacity', 0);
    inset?.interrupt().attr('opacity', 0);
    halo.interrupt().attr('stroke-opacity', 0);
  }

  return { play, reset, destroy: stopPlayback };
}
