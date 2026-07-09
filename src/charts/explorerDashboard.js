import * as d3 from 'd3';
import { gsap } from 'gsap';
import { cropRanking, filterRows, fmt, provinceSummary, sumField, uniqueValues, yearlySeries } from '../data/aggregateData.js';
import { motionDuration } from '../animation/deckMotion.js';

const RACE_LIMIT = 8;
const PLAY_STEP_MS = 900;

function optionList(values, label) {
  return `<option value="">${label}</option>${values.map((value) => `<option value="${value}">${value}</option>`).join('')}`;
}

export function renderExplorer(container, rows, summary) {
  const years = summary.years;
  container.innerHTML = `
    <div class="explorer-shell" data-deck-ignore>
      <div class="explorer-controls">
        <button id="playYears" class="play-button" type="button" aria-label="Reproducir años">
          <span class="play-icon">▶</span><span class="play-label">2002 → ${summary.latestYear}</span>
        </button>
        <div class="year-control">
          <input type="range" id="filterYear" min="${years[0]}" max="${summary.latestYear}" step="1" value="${summary.latestYear}" aria-label="Año" />
          <span class="year-value" id="yearValue">${summary.latestYear}</span>
        </div>
        <select id="filterProvince" aria-label="Provincia">${optionList(summary.provinces, 'Todas las provincias')}</select>
        <select id="filterRegion" aria-label="Región">${optionList(summary.regions, 'Todas las regiones')}</select>
        <select id="filterGroup" aria-label="Grupo">${optionList(summary.groups, 'Todos los grupos')}</select>
      </div>
      <div class="explorer-kpis" id="explorerKpis">
        ${['Registros', 'Producción', 'Superficie', 'Provincias', 'Cultivos', 'Rendimiento prom.']
          .map((label) => `<article><strong data-kpi>0</strong><span>${label}</span></article>`)
          .join('')}
      </div>
      <div class="explorer-main">
        <div class="explorer-chart" id="explorerRace">
          <div class="year-backdrop" id="yearBackdrop">${summary.latestYear}</div>
        </div>
        <aside class="inspector" id="inspector">
          <span>Inspector</span>
          <strong>Selecciona una barra</strong>
          <p>Haz clic en un cultivo de la carrera para leer su historia completa 2002-2025.</p>
        </aside>
      </div>
    </div>
  `;

  const shell = container.querySelector('.explorer-shell');
  const playButton = container.querySelector('#playYears');
  const playIcon = playButton.querySelector('.play-icon');
  const yearInput = container.querySelector('#filterYear');
  const yearValue = container.querySelector('#yearValue');
  const yearBackdrop = container.querySelector('#yearBackdrop');
  const kpiNodes = [...container.querySelectorAll('[data-kpi]')];
  const inspector = container.querySelector('#inspector');
  const raceHost = container.querySelector('#explorerRace');

  const filters = { year: summary.latestYear, province: '', region: '', group: '' };
  const selects = {
    province: container.querySelector('#filterProvince'),
    region: container.querySelector('#filterRegion'),
    group: container.querySelector('#filterGroup')
  };

  // ── Carrera de barras (SVG persistente con join keyed por cultivo) ──
  const width = raceHost.clientWidth || 760;
  const height = raceHost.clientHeight || 430;
  const margin = { top: 14, right: 96, bottom: 10, left: 150 };
  const svg = d3
    .select(raceHost)
    .append('svg')
    .attr('class', 'chart-svg race-svg')
    .attr('viewBox', `0 0 ${width} ${height}`);
  const rowsG = svg.append('g');
  const emptyNote = svg
    .append('text')
    .attr('class', 'axis-label')
    .attr('x', width / 2)
    .attr('y', height / 2)
    .attr('text-anchor', 'middle')
    .attr('opacity', 0)
    .text('Sin datos para esta combinación de filtros');

  let selectedCrop = null;
  let playing = false;
  let playTimer = null;

  function currentRanking() {
    const base = filterRows(rows, {
      year: filters.year,
      province: filters.province,
      region: filters.region,
      group: filters.group
    });
    return { base, ranking: cropRanking(base, Number(filters.year), RACE_LIMIT) };
  }

  function updateKpis(base, durationMs) {
    const values = [
      { value: base.length, format: (v) => fmt.number(v) },
      { value: sumField(base, 'produccion_t'), format: (v) => `${fmt.compact(v)} t` },
      { value: sumField(base, 'superficie_cosechada_ha'), format: (v) => `${fmt.compact(v)} ha` },
      { value: uniqueValues(base, 'provincia').length, format: (v) => fmt.number(v) },
      { value: uniqueValues(base, 'cultivo').length, format: (v) => fmt.number(v) },
      { value: d3.mean(base, (r) => r.rendimiento_t_ha) ?? 0, format: (v) => `${fmt.decimal(v)} t/ha` }
    ];

    kpiNodes.forEach((node, i) => {
      const { value, format } = values[i];
      const previous = Number(node.dataset.raw ?? 0);
      node.dataset.raw = value;
      d3.select(node)
        .interrupt()
        .transition()
        .duration(durationMs)
        .tween('text', () => {
          const interpolate = d3.interpolateNumber(previous, value);
          return (t) => {
            node.textContent = format(interpolate(t));
          };
        });
    });
  }

  function updateRace(ranking, durationMs) {
    const x = d3
      .scaleLinear()
      .domain([0, d3.max(ranking, (d) => d.production) || 1])
      .range([margin.left, width - margin.right]);
    const y = d3
      .scaleBand()
      .domain(ranking.map((d) => d.crop))
      .range([margin.top, height - margin.bottom])
      .padding(0.3);

    emptyNote.transition().duration(200).attr('opacity', ranking.length ? 0 : 1);

    const t = d3.transition().duration(durationMs).ease(d3.easeCubicInOut);

    rowsG
      .selectAll('g.race-row')
      .data(ranking, (d) => d.crop)
      .join(
        (enter) => {
          const g = enter
            .append('g')
            .attr('class', 'race-row')
            .attr('transform', (d) => `translate(0,${y(d.crop) ?? height})`)
            .attr('opacity', 0);
          g.append('rect')
            .attr('class', 'race-bar')
            .attr('x', margin.left)
            .attr('rx', 7)
            .attr('height', y.bandwidth())
            .attr('width', 0);
          g.append('text').attr('class', 'race-name').attr('x', margin.left - 10).attr('text-anchor', 'end').attr('dy', '0.33em');
          g.append('text').attr('class', 'race-value').attr('dy', '0.33em');
          return g;
        },
        (update) => update,
        (exit) =>
          exit
            .transition(t)
            .attr('opacity', 0)
            .attr('transform', `translate(0,${height + 20})`)
            .remove()
      )
      .on('click', (_, d) => {
        selectedCrop = d.crop;
        renderInspector(d);
        highlightSelection();
      })
      .call((selection) => {
        selection
          .transition(t)
          .attr('opacity', 1)
          .attr('transform', (d) => `translate(0,${y(d.crop)})`);

        selection
          .select('rect.race-bar')
          .attr('height', y.bandwidth())
          .transition(t)
          .attr('width', (d) => Math.max(2, x(d.production) - margin.left));

        selection
          .select('text.race-name')
          .attr('y', y.bandwidth() / 2)
          .text((d) => (d.crop.length > 19 ? `${d.crop.slice(0, 18)}…` : d.crop));

        selection
          .select('text.race-value')
          .attr('y', y.bandwidth() / 2)
          .transition(t)
          .attr('x', (d) => Math.max(x(d.production) + 10, margin.left + 40))
          .textTween(function (d) {
            const previous = this._raceValue ?? 0;
            this._raceValue = d.production;
            const interpolate = d3.interpolateNumber(previous, d.production);
            return (t2) => `${fmt.compact(interpolate(t2))} t`;
          });
      });

    highlightSelection();
  }

  function highlightSelection() {
    rowsG.selectAll('g.race-row').classed('is-selected', (d) => d.crop === selectedCrop);
  }

  function renderInspector(d) {
    const scoped = filterRows(rows, { province: filters.province, region: filters.region, group: filters.group });
    const history = yearlySeries(scoped.filter((r) => r.cultivo === d.crop), 'crop', d.crop);
    const cropYearRows = scoped.filter((r) => r.cultivo === d.crop && r.anio === Number(filters.year));
    const bestProvince = provinceSummary(cropYearRows, Number(filters.year))[0];
    const totalYear = sumField(
      scoped.filter((r) => r.anio === Number(filters.year)),
      'produccion_t'
    );
    const share = totalYear ? (d.production / totalYear) * 100 : 0;

    inspector.innerHTML = `
      <span>Inspector · ${filters.year}</span>
      <strong>${d.crop}</strong>
      <svg class="sparkline" viewBox="0 0 200 56" preserveAspectRatio="none" aria-label="Trayectoria histórica"></svg>
      <p class="spark-caption">Producción ${years[0]}-${summary.latestYear}</p>
      <dl>
        <div><dt>Producción</dt><dd>${fmt.compact(d.production)} t</dd></div>
        <div><dt>Participación en el filtro</dt><dd>${fmt.pct(share)}%</dd></div>
        <div><dt>Superficie cosechada</dt><dd>${fmt.compact(d.harvested)} ha</dd></div>
        <div><dt>Rendimiento promedio</dt><dd>${fmt.decimal(d.yield ?? 0)} t/ha</dd></div>
        <div><dt>Provincia destacada</dt><dd>${bestProvince?.province ?? 'Sin dato'}</dd></div>
      </dl>
    `;

    gsap.fromTo(inspector, { autoAlpha: 0, x: 26 }, { autoAlpha: 1, x: 0, duration: motionDuration(0.5), ease: 'power3.out' });

    const spark = d3.select(inspector).select('.sparkline');
    const sx = d3.scaleLinear().domain(d3.extent(history, (h) => h.year)).range([3, 197]);
    const sy = d3
      .scaleLinear()
      .domain([0, d3.max(history, (h) => h.production) || 1])
      .range([50, 6]);
    const sline = d3
      .line()
      .defined((h) => h.production > 0)
      .x((h) => sx(h.year))
      .y((h) => sy(h.production))
      .curve(d3.curveMonotoneX);

    spark
      .append('path')
      .datum(history)
      .attr('class', 'spark-area')
      .attr(
        'd',
        d3
          .area()
          .defined((h) => h.production > 0)
          .x((h) => sx(h.year))
          .y0(52)
          .y1((h) => sy(h.production))
          .curve(d3.curveMonotoneX)
      );

    const path = spark.append('path').datum(history).attr('class', 'spark-line').attr('d', sline);
    const length = path.node().getTotalLength();
    path
      .attr('stroke-dasharray', length)
      .attr('stroke-dashoffset', length)
      .transition()
      .duration(motionDuration(0.9) * 1000)
      .attr('stroke-dashoffset', 0);

    const currentPoint = history.find((h) => h.year === Number(filters.year));
    if (currentPoint && currentPoint.production > 0) {
      spark
        .append('circle')
        .attr('class', 'spark-dot')
        .attr('cx', sx(currentPoint.year))
        .attr('cy', sy(currentPoint.production))
        .attr('r', 0)
        .transition()
        .delay(500)
        .duration(300)
        .attr('r', 3.4);
    }
  }

  function draw(durationMs = motionDuration(0.8) * 1000) {
    const { base, ranking } = currentRanking();
    yearValue.textContent = filters.year;
    yearBackdrop.textContent = filters.year;
    updateKpis(base, durationMs);
    updateRace(ranking, durationMs);
  }

  // ── Reproducción automática: la carrera 2002 → 2025 ──
  function stopPlayback() {
    playing = false;
    clearTimeout(playTimer);
    playIcon.textContent = '▶';
    playButton.classList.remove('is-playing');
  }

  function startPlayback() {
    playing = true;
    playIcon.textContent = '⏸';
    playButton.classList.add('is-playing');
    let yearIndex = 0;

    gsap.fromTo(yearBackdrop, { scale: 0.9 }, { scale: 1, duration: 0.4, ease: 'power2.out' });

    function step() {
      if (!playing) return;
      filters.year = years[yearIndex];
      yearInput.value = filters.year;
      draw(PLAY_STEP_MS * 0.82);
      gsap.fromTo(yearBackdrop, { autoAlpha: 0.5, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.35 });
      yearIndex += 1;
      if (yearIndex >= years.length) {
        stopPlayback();
        return;
      }
      playTimer = setTimeout(step, PLAY_STEP_MS);
    }
    step();
  }

  playButton.addEventListener('click', () => {
    if (playing) stopPlayback();
    else startPlayback();
  });

  yearInput.addEventListener('input', () => {
    stopPlayback();
    filters.year = Number(yearInput.value);
    draw(motionDuration(0.5) * 1000);
  });

  Object.entries(selects).forEach(([key, select]) => {
    select.addEventListener('change', () => {
      stopPlayback();
      filters[key] = select.value;
      draw();
    });
  });

  // ── Handle para la coreografía del deck ──
  function play() {
    gsap.fromTo(
      shell.querySelectorAll('.explorer-controls > *'),
      { autoAlpha: 0, y: -18 },
      { autoAlpha: 1, y: 0, duration: motionDuration(0.55), stagger: 0.06, ease: 'power3.out' }
    );
    gsap.fromTo(
      shell.querySelectorAll('.explorer-kpis article'),
      { autoAlpha: 0, y: 26 },
      { autoAlpha: 1, y: 0, duration: motionDuration(0.6), stagger: 0.06, delay: 0.15, ease: 'power3.out' }
    );
    gsap.fromTo(inspector, { autoAlpha: 0, x: 30 }, { autoAlpha: 1, x: 0, duration: motionDuration(0.6), delay: 0.35 });
    gsap.fromTo(yearBackdrop, { autoAlpha: 0 }, { autoAlpha: 1, duration: motionDuration(0.8), delay: 0.3 });

    // Arranca la carrera desde cero para que las barras compitan al entrar.
    rowsG.selectAll('g.race-row').remove();
    kpiNodes.forEach((node) => {
      node.dataset.raw = 0;
    });
    draw(motionDuration(1) * 1000);
  }

  function reset() {
    stopPlayback();
    gsap.set([shell.querySelectorAll('.explorer-controls > *'), shell.querySelectorAll('.explorer-kpis article'), inspector, yearBackdrop], {
      autoAlpha: 0
    });
  }

  draw(0);

  return { play, reset };
}
