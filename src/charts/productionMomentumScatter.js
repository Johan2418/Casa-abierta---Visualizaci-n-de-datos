import * as d3 from 'd3';
import { fmt, productionMomentumRows } from '../data/aggregateData.js';
import { motionDuration, isReducedMotion } from '../animation/deckMotion.js';

// Duración de transición más larga (1.4s) + pausa (0.6s) = 2s total por año
const PLAY_TRANSITION_MS = 1400;
const PLAY_PAUSE_MS = 600;

const regionColor = {
  Costa: '#f4c95d',
  Sierra: '#79e28b',
  Amazonía: '#28d6ba',
  'Amazonía agrupada': '#34a4ff',
  'Sin clasificar': '#9ba4b5'
};

const QUADRANTS = [
  { key: 'low-fall', title: 'Baja escala en retroceso', meaning: 'Baja producción · cae', fill: 'rgba(245, 116, 116, 0.065)' },
  { key: 'high-fall', title: 'Líderes en contracción', meaning: 'Alta producción · cae', fill: 'rgba(244, 201, 93, 0.065)' },
  { key: 'low-growth', title: 'Cultivos emergentes', meaning: 'Baja producción · crece', fill: 'rgba(40, 214, 186, 0.065)' },
  { key: 'high-growth', title: 'Motores en crecimiento', meaning: 'Alta producción · crece', fill: 'rgba(121, 226, 139, 0.075)' }
];

const QUADRANT_KEYS = new Set(QUADRANTS.map((quadrant) => quadrant.key));

function groupOptions(groups, selected) {
  return [`<option value="">Todos los grupos</option>`, ...groups.map((group) => `<option value="${group}"${group === selected ? ' selected' : ''}>${group}</option>`)].join('');
}

function uniqueTicks(values) {
  return [...new Map(values.filter(Number.isFinite).map((value) => [value.toFixed(8), value])).values()];
}

export function renderProductionMomentumScatter(container, rows, summary, tooltip, initialState = {}) {
  const years = summary.years.filter((value) => value >= 2003);
  let year = years.includes(initialState.year) ? initialState.year : summary.latestYear;
  let group = summary.groups.includes(initialState.group) ? initialState.group : '';

  container.innerHTML = `
    <div class="momentum-shell" data-deck-ignore>
      <div class="momentum-controls">
        <button id="playMomentumYears" class="play-button" type="button" aria-label="Reproducir años">
          <span class="play-icon">▶</span><span class="play-label">${years[0]} → ${summary.latestYear}</span>
        </button>
        <label class="year-control" for="momentumYear">
          <span class="year-marker" id="momentumYearStart">${years[0]}</span>
          <input id="momentumYear" type="range" min="${years[0]}" max="${summary.latestYear}" step="1" value="${year}" aria-label="Año del gráfico de producción en movimiento" />
          <span class="year-value" id="momentumYearValue">${year}</span>
          <span class="year-marker" id="momentumYearEnd">${summary.latestYear}</span>
        </label>
        <select id="momentumGroup" aria-label="Grupo de cultivo">${groupOptions(summary.groups, group)}</select>
        <div class="momentum-legend" aria-label="Regiones naturales">
          ${summary.regions
            .filter((region) => regionColor[region])
            .map((region) => `<span><i style="color:${regionColor[region]};background:${regionColor[region]}"></i>${region}</span>`)
            .join('')}
        </div>
      </div>
      <div class="momentum-plot">
        <button class="momentum-focus-reset" type="button" hidden>← Ver todos los cuadrantes</button>
        <div class="momentum-year-backdrop" aria-hidden="true">${year}</div>
        <svg class="chart-svg" role="img" aria-label="Producción y variación interanual por provincia y cultivo"></svg>
      </div>
    </div>
  `;

  const shell = container.querySelector('.momentum-shell');
  const controls = shell.querySelector('.momentum-controls');
  const playButton = shell.querySelector('#playMomentumYears');
  const playIcon = playButton.querySelector('.play-icon');
  const yearInput = shell.querySelector('#momentumYear');
  const yearValue = shell.querySelector('#momentumYearValue');
  const groupSelect = shell.querySelector('#momentumGroup');
  const focusReset = shell.querySelector('.momentum-focus-reset');
  const yearBackdrop = shell.querySelector('.momentum-year-backdrop');
  const plot = shell.querySelector('.momentum-plot');
  const width = plot.clientWidth || 760;
  const height = plot.clientHeight || 440;
  const margin = { top: 44, right: 34, bottom: 62, left: 84 };
  const bottom = height - margin.bottom;
  const middle = (margin.top + bottom) / 2;

  const svg = d3.select(plot).select('svg').attr('viewBox', `0 0 ${width} ${height}`);
  const x = d3.scaleLog().range([margin.left, width - margin.right]);
  const radius = d3.scaleSqrt().range([2.5, 11]).clamp(true);
  const xAxisG = svg.append('g').attr('transform', `translate(0,${bottom})`);
  const yAxisG = svg.append('g').attr('transform', `translate(${margin.left},0)`);
  const quadrantsG = svg.append('g').attr('class', 'momentum-quadrants');
  const guideV = svg.append('line').attr('class', 'guide-line');
  const guideH = svg.append('line').attr('class', 'guide-line');
  const pointsG = svg.append('g');
  const emptyNote = svg
    .append('text')
    .attr('class', 'axis-label')
    .attr('x', width / 2)
    .attr('y', middle)
    .attr('text-anchor', 'middle')
    .attr('opacity', 0)
    .text('Sin datos válidos para este grupo y año');

  svg.append('text').attr('x', margin.left).attr('y', 26).attr('class', 'chart-title').text('Producción y evolución interanual');
  svg.append('text').attr('x', width / 2).attr('y', height - 18).attr('class', 'axis-label').attr('text-anchor', 'middle').text('Producción (t, escala logarítmica)');
  svg.append('text').attr('x', -height / 2).attr('y', 22).attr('class', 'axis-label').attr('text-anchor', 'middle').attr('transform', 'rotate(-90)').text('Variación de producción interanual');

  let playing = false;
  let playTimer = null;
  let destroyed = false;
  let focus = QUADRANT_KEYS.has(initialState.focus) ? initialState.focus : 'all';
  
  // Cache de dominios fijos para cada grupo
  let fixedScales = null;

  function currentData() {
    return productionMomentumRows(rows, year, group);
  }

  /**
   * Calcula y cachea los dominios fijos (X, Y, radius) para todo el período
   * del grupo seleccionado. Se recalcula cuando cambia el grupo.
   */
  function computeFixedScales() {
    // Recopilar todos los datos válidos para el período completo
    const allGroupData = [];
    for (const y of years) {
      allGroupData.push(...productionMomentumRows(rows, y, group));
    }

    if (!allGroupData.length) {
      // Sin datos para este grupo en todo el período
      return {
        minProduction: 1,
        maxProduction: 10,
        globalMedianProduction: 5.5,
        minChange: -1,
        maxChange: 1,
        maxAreaCap: 1
      };
    }

    const productions = allGroupData.map((p) => p.production).sort(d3.ascending);
    const changes = allGroupData.map((p) => p.change);
    const negativeChanges = changes.filter((v) => v < 0).sort(d3.ascending);
    const positiveChanges = changes.filter((v) => v > 0).sort(d3.ascending);
    const areas = allGroupData.map((p) => p.harvested).sort(d3.ascending);

    const minProduction = productions[0] || 1;
    const maxProduction = productions[productions.length - 1] || 10;
    const globalMedianProduction = d3.median(productions) || ((minProduction + maxProduction) / 2);
    const minChange = Math.min(d3.quantile(negativeChanges, 0.05) ?? -1, -1);
    const maxChange = Math.max(d3.quantile(positiveChanges, 0.95) ?? 1, 1);
    const maxAreaCap = d3.quantile(areas, 0.95) || 1;

    return {
      minProduction,
      maxProduction,
      globalMedianProduction,
      minChange,
      maxChange,
      maxAreaCap
    };
  }

  function stopPlayback() {
    playing = false;
    clearTimeout(playTimer);
    playTimer = null;
    playIcon.textContent = '▶';
    playButton.classList.remove('is-playing');
  }

  function showTooltip(event, point) {
    d3.select(event.currentTarget).raise().classed('is-hovered', true);
    tooltip.innerHTML = `<strong>${point.crop}</strong><span>${point.province} · ${point.region}</span><span>${point.group}</span><span>${year} · ${fmt.compact(point.production)} t</span><span>Variación ${fmt.pct(point.change)}% · Superficie ${fmt.compact(point.harvested)} ha</span>`;
    tooltip.classList.add('is-visible');
    tooltip.style.left = `${event.clientX + 16}px`;
    tooltip.style.top = `${event.clientY + 16}px`;
  }

  function yScaleFor(data, focusedQuadrant, globalMinChange, globalMaxChange) {
    const focusesFall = focusedQuadrant.endsWith('fall');
    const focusesGrowth = focusedQuadrant.endsWith('growth');
    const fallingRange = focusesFall ? [bottom, margin.top] : [bottom, middle];
    const growingRange = focusesGrowth ? [bottom, margin.top] : [middle, margin.top];
    const falling = d3.scaleSymlog().constant(12).domain([globalMinChange, 0]).range(fallingRange).clamp(true);
    const growing = d3.scaleSymlog().constant(12).domain([0, globalMaxChange]).range(growingRange).clamp(true);
    
    const ticks = focusesFall
      ? [globalMinChange, globalMinChange * 0.75, globalMinChange / 2, globalMinChange / 4, 0]
      : focusesGrowth
        ? [0, globalMaxChange / 4, globalMaxChange / 2, globalMaxChange * 0.75, globalMaxChange]
        : [globalMinChange, globalMinChange / 2, 0, globalMaxChange / 2, globalMaxChange];
    
    return {
      floor: globalMinChange,
      ceiling: globalMaxChange,
      position: (value) => (value < 0 ? falling(value) : growing(value)),
      ticks: uniqueTicks(ticks).sort((a, b) => a - b)
    };
  }

  function updateYAxis(scale, ms) {
    const transition = svg.transition().duration(ms).ease(d3.easeCubicInOut);
    yAxisG
      .selectAll('line.momentum-axis-domain')
      .data([0])
      .join('line')
      .attr('class', 'domain momentum-axis-domain')
      .attr('x1', 0)
      .attr('x2', 0)
      .transition(transition)
      .attr('y1', margin.top)
      .attr('y2', bottom);

    const ticks = yAxisG
      .selectAll('g.momentum-y-tick')
      .data(scale.ticks, (value) => value.toFixed(8))
      .join(
        (enter) => {
          const node = enter.append('g').attr('class', 'tick momentum-y-tick').attr('opacity', 0).attr('transform', `translate(0,${middle})`);
          node.append('line').attr('x2', -6);
          node.append('text').attr('x', -10).attr('dy', '0.32em').attr('text-anchor', 'end');
          return node;
        },
        (update) => update,
        (exit) => exit.transition().duration(Math.min(ms, 250)).attr('opacity', 0).remove()
      );

    ticks.select('text').text((value) => (value === 0 ? '0%' : `${fmt.pct(value)}%`));
    ticks.transition(transition).attr('opacity', 1).attr('transform', (value) => `translate(0,${scale.position(value)})`);
  }

  function quadrantLayout(median, counts) {
    const leftWidth = x(median) - margin.left;
    const rightWidth = width - margin.right - x(median);
    const geometry = {
      'low-fall': { x: margin.left, y: middle, width: leftWidth, height: bottom - middle },
      'high-fall': { x: x(median), y: middle, width: rightWidth, height: bottom - middle },
      'low-growth': { x: margin.left, y: margin.top, width: leftWidth, height: middle - margin.top },
      'high-growth': { x: x(median), y: margin.top, width: rightWidth, height: middle - margin.top }
    };

    const layout = QUADRANTS.map((quadrant) => ({ ...quadrant, ...geometry[quadrant.key], count: counts[quadrant.key] }));
    if (focus === 'all') return layout;
    return layout
      .filter((quadrant) => quadrant.key === focus)
      .map((quadrant) => ({ ...quadrant, x: margin.left, y: margin.top, width: width - margin.left - margin.right, height: bottom - margin.top }));
  }

  function focusQuadrant(nextFocus) {
    if (!QUADRANT_KEYS.has(nextFocus) || focus === nextFocus) return;
    stopPlayback();
    focus = nextFocus;
    updateChart(motionDuration(0.65) * 1000);
  }

  function updateQuadrants(layout, ms) {
    const transition = svg.transition().duration(ms).ease(d3.easeCubicInOut);
    quadrantsG
      .selectAll('rect.quadrant-shade')
      .data(layout, (item) => item.key)
      .join('rect')
      .attr('class', 'quadrant-shade')
      .attr('fill', (item) => item.fill)
      .transition(transition)
      .attr('x', (item) => item.x)
      .attr('y', (item) => item.y)
      .attr('width', (item) => Math.max(0, item.width))
      .attr('height', (item) => Math.max(0, item.height))
      .attr('opacity', 1);

    const labels = quadrantsG
      .selectAll('g.momentum-quadrant-label')
      .data(layout, (item) => item.key)
      .join(
        (enter) => {
          const node = enter
            .append('g')
            .attr('class', 'momentum-quadrant-label')
            .attr('role', 'button')
            .attr('tabindex', 0)
            .attr('opacity', 0);
          node.append('text').attr('class', 'quadrant-title').attr('text-anchor', 'middle');
          node.append('text').attr('class', 'quadrant-meaning').attr('text-anchor', 'middle').attr('y', 15);
          node.append('text').attr('class', 'quadrant-count').attr('text-anchor', 'middle').attr('y', 30);
          return node;
        },
        (update) => update,
        (exit) => exit.transition().duration(Math.min(ms, 250)).attr('opacity', 0).remove()
      )
      .attr('aria-label', (item) => `${item.title}: ${item.meaning}. ${item.count} combinaciones. Activar para acercar este cuadrante.`)
      .on('click', (_, item) => focusQuadrant(item.key))
      .on('keydown', (event, item) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        focusQuadrant(item.key);
      });

    labels.select('.quadrant-title').text((item) => item.title);
    labels.select('.quadrant-meaning').text((item) => item.meaning);
    labels.select('.quadrant-count').text((item) => `${item.count} combinaciones`);
    labels.selectAll('text').attr('opacity', 1);
    labels
      .transition(transition)
      .attr('opacity', 1)
      .attr('transform', (item) => `translate(${item.x + item.width / 2},${item.y + 25})`);
  }

  function updateChart(ms = motionDuration(0.72) * 1000, entrance = false) {
    if (!fixedScales) {
      fixedScales = computeFixedScales();
    }

    const data = currentData();
    const scales = fixedScales;
    const safeMaxProduction = scales.maxProduction > scales.minProduction ? scales.maxProduction : scales.minProduction * 10;
    const yScale = yScaleFor(data, focus, scales.minChange, scales.maxChange);
    const counts = { 'low-fall': 0, 'high-fall': 0, 'low-growth': 0, 'high-growth': 0 };

    const quadrantOf = (point) => {
      const volume = point.production >= scales.globalMedianProduction ? 'high' : 'low';
      const direction = point.change >= 0 ? 'growth' : 'fall';
      return `${volume}-${direction}`;
    };

    data.forEach((point) => {
      counts[quadrantOf(point)] += 1;
    });

    const visibleData = focus === 'all' ? data : data.filter((point) => quadrantOf(point) === focus);
    let domainMin = scales.minProduction;
    let domainMax = safeMaxProduction;
    if (focus.startsWith('low')) domainMax = scales.globalMedianProduction;
    if (focus.startsWith('high')) domainMin = scales.globalMedianProduction;
    if (domainMax <= domainMin) domainMax = domainMin * 10;

    x.domain([domainMin, domainMax]);
    radius.domain([0, scales.maxAreaCap]);
    yearInput.value = year;
    yearValue.textContent = year;
    yearBackdrop.textContent = year;
    focusReset.hidden = focus === 'all';
    emptyNote.text(focus === 'all' ? 'Sin datos válidos para este grupo y año' : 'Sin datos en este cuadrante para el grupo y año seleccionados');

    const transition = svg.transition().duration(ms).ease(d3.easeCubicInOut);
    xAxisG.transition(transition).call(d3.axisBottom(x).ticks(5).tickFormat((value) => fmt.compact(value)));
    updateYAxis(yScale, ms);
    updateQuadrants(quadrantLayout(scales.globalMedianProduction, counts), ms);

    guideV
      .interrupt()
      .transition(transition)
      .attr('opacity', data.length && focus === 'all' ? 1 : 0)
      .attr('x1', x(scales.globalMedianProduction))
      .attr('x2', x(scales.globalMedianProduction))
      .attr('y1', margin.top)
      .attr('y2', bottom);
    guideH
      .interrupt()
      .transition(transition)
      .attr('opacity', data.length && focus === 'all' ? 1 : 0)
      .attr('x1', margin.left)
      .attr('x2', width - margin.right)
      .attr('y1', middle)
      .attr('y2', middle);
    emptyNote.transition().duration(Math.min(ms, 250)).attr('opacity', visibleData.length ? 0 : 1);

    const points = pointsG
      .selectAll('circle.momentum-point')
      .data(visibleData, (point) => point.id)
      .join(
        (enter) => enter.append('circle').attr('class', 'momentum-point').attr('r', 0),
        (update) => update,
        (exit) => exit.transition().duration(Math.min(ms, 360)).attr('r', 0).attr('opacity', 0).remove()
      )
      .attr('fill', (point) => regionColor[point.region] ?? '#9ba4b5')
      .attr('fill-opacity', 0.46)
      .attr('stroke', '#fff')
      .attr('stroke-opacity', 0.18)
      .attr('opacity', 1)
      .on('mousemove', showTooltip)
      .on('mouseleave', (event) => {
        d3.select(event.currentTarget).classed('is-hovered', false);
        tooltip.classList.remove('is-visible');
      });

    points
      .interrupt()
      .transition()
      .duration(ms)
      .ease(entrance ? d3.easeBackOut.overshoot(1.15) : d3.easeCubicInOut)
      .attr('cx', (point) => x(point.production))
      .attr('cy', (point) => yScale.position(point.change))
      .attr('r', (point) => radius(point.harvested));
  }

  function startPlayback() {
    if (isReducedMotion()) {
      // Sin animación si prefiere movimiento reducido
      return;
    }

    playing = true;
    playIcon.textContent = '⏸';
    playButton.classList.add('is-playing');
    let yearIndex = years.indexOf(year);
    if (yearIndex < 0) yearIndex = 0;

    let restarted = false;
    if (yearIndex === years.length - 1) {
      // Al llegar al último año, una nueva reproducción reinicia la historia.
      year = years[0];
      updateChart(PLAY_TRANSITION_MS, false);
      yearIndex = 1;
      restarted = true;
    } else {
      // El año visible queda como punto de partida; el primer desplazamiento
      // lleva la atención al año siguiente sin repetir el mismo estado.
      yearIndex += 1;
    }
    if (yearIndex >= years.length) {
      stopPlayback();
      return;
    }

    function step() {
      if (!playing || destroyed) return;
      
      if (yearIndex >= years.length) {
        stopPlayback();
        return;
      }

      const nextYear = years[yearIndex];
      year = nextYear;
      updateChart(PLAY_TRANSITION_MS, false);
      
      // Animar año backdrop
      d3.select(yearBackdrop)
        .interrupt()
        .attr('opacity', 0.45)
        .transition()
        .duration(PLAY_TRANSITION_MS / 2)
        .attr('opacity', 1);

      yearIndex += 1;
      
      // Transición + pausa antes del siguiente paso
      playTimer = setTimeout(step, PLAY_TRANSITION_MS + PLAY_PAUSE_MS);
    }

    if (restarted) playTimer = setTimeout(step, PLAY_TRANSITION_MS + PLAY_PAUSE_MS);
    else step();
  }

  playButton.addEventListener('click', () => {
    if (playing) stopPlayback();
    else startPlayback();
  });

  yearInput.addEventListener('input', () => {
    stopPlayback();
    year = Number(yearInput.value);
    updateChart(motionDuration(0.45) * 1000);
  });

  groupSelect.addEventListener('change', () => {
    stopPlayback();
    group = groupSelect.value;
    fixedScales = null; // Resetear cache de dominios al cambiar grupo
    updateChart(motionDuration(0.55) * 1000);
  });

  focusReset.addEventListener('click', () => {
    stopPlayback();
    focus = 'all';
    updateChart(motionDuration(0.65) * 1000);
  });

  function play() {
    destroyed = false;
    d3.select(controls).interrupt().transition().duration(motionDuration(0.5) * 1000).attr('opacity', 1).attr('transform', 'translateY(0)');
    d3.select(yearBackdrop).interrupt().transition().duration(motionDuration(0.7) * 1000).attr('opacity', 1);
    updateChart(motionDuration(0.85) * 1000, true);
  }

  function reset() {
    stopPlayback();
    tooltip.classList.remove('is-visible');
    pointsG.selectAll('circle.momentum-point').interrupt().attr('r', 0);
    quadrantsG.selectAll('rect.quadrant-shade, g.momentum-quadrant-label').interrupt().attr('opacity', 0);
    guideV.interrupt().attr('opacity', 0);
    guideH.interrupt().attr('opacity', 0);
    d3.select(controls).interrupt().attr('opacity', 0).attr('transform', 'translateY(-14px)');
    d3.select(yearBackdrop).interrupt().attr('opacity', 0);
  }

  function destroy() {
    destroyed = true;
    stopPlayback();
    tooltip.classList.remove('is-visible');
  }

  updateChart(0);
  reset();

  return { play, reset, destroy, getState: () => ({ year, group, focus }) };
}
