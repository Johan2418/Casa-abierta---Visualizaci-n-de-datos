import * as d3 from 'd3';
import { fmt, provinceProfile, provinceSummary } from '../data/aggregateData.js';
import { motionDuration } from '../animation/deckMotion.js';

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

function options(values, selected) {
  return values.map((value) => `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(value)}</option>`).join('');
}

function insight(profile) {
  const productionPosition = profile.production >= profile.regionalProductionMedian ? 'supera' : 'queda por debajo de';
  const yieldPosition = profile.yield >= profile.regionalYieldMedian ? 'supera' : 'queda por debajo de';
  const dependence = profile.hhi >= 0.35 ? 'con una canasta relativamente concentrada' : 'con una canasta relativamente diversificada';
  return `${profile.province} ${productionPosition} la mediana de producción de ${profile.region}; su rendimiento ${yieldPosition} la referencia regional, ${dependence}.`;
}

export function renderProvinceProfile(container, rows, summary) {
  const provinces = provinceSummary(rows, summary.latestYear).map((item) => item.province);
  let selected = provinces[0] ?? '';
  let selectedYear = summary.latestYear;

  container.innerHTML = `
    <div class="profile-shell" data-deck-ignore>
      <div class="profile-controls">
        <label>Provincia <select id="profileProvince" aria-label="Provincia para radiografía"></select></label>
        <label>Año <select id="profileYear" aria-label="Año para radiografía"></select></label>
        <span class="profile-badge">Radiografía verificable</span>
      </div>
      <div class="profile-layout">
        <div class="profile-summary" id="profileSummary"></div>
        <div class="profile-trend">
          <svg class="chart-svg" id="profileTrend" role="img" aria-label="Evolución histórica de la producción provincial"></svg>
        </div>
      </div>
      <p class="profile-method" id="profileMethod"></p>
    </div>
  `;

  const provinceSelect = container.querySelector('#profileProvince');
  const yearSelect = container.querySelector('#profileYear');
  const summaryHost = container.querySelector('#profileSummary');
  const chart = d3.select(container.querySelector('#profileTrend'));
  const method = container.querySelector('#profileMethod');
  provinceSelect.innerHTML = options(provinces, selected);
  yearSelect.innerHTML = options(summary.years, selectedYear);

  function drawTrend(profile) {
    const node = chart.node();
    const width = node.clientWidth || 560;
    const height = node.clientHeight || 236;
    const margin = { top: 30, right: 28, bottom: 32, left: 58 };
    chart.selectAll('*').remove();
    chart.attr('viewBox', `0 0 ${width} ${height}`);
    const history = profile.history.filter((item) => item.production > 0);
    if (!history.length) return;
    const x = d3.scaleLinear().domain(d3.extent(history, (item) => item.year)).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([0, d3.max(history, (item) => item.production) || 1]).nice().range([height - margin.bottom, margin.top]);
    chart.append('g').attr('class', 'profile-axis').attr('transform', `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).ticks(5).tickFormat(d3.format('d')));
    chart.append('g').attr('class', 'profile-axis').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(4).tickFormat((value) => fmt.compact(value)));
    const area = d3.area().x((item) => x(item.year)).y0(height - margin.bottom).y1((item) => y(item.production)).curve(d3.curveMonotoneX);
    const line = d3.line().x((item) => x(item.year)).y((item) => y(item.production)).curve(d3.curveMonotoneX);
    chart.append('path').datum(history).attr('class', 'profile-area').attr('d', area);
    const path = chart.append('path').datum(history).attr('class', 'profile-line').attr('d', line);
    const length = path.node().getTotalLength();
    path.attr('stroke-dasharray', length).attr('stroke-dashoffset', length).transition().duration(motionDuration(0.9) * 1000).attr('stroke-dashoffset', 0);
    const active = history.find((item) => item.year === profile.year);
    if (active) chart.append('circle').attr('class', 'profile-dot').attr('cx', x(active.year)).attr('cy', y(active.production)).attr('r', 5);
    chart.append('text').attr('class', 'chart-title').attr('x', margin.left).attr('y', 16).text(`Producción histórica · ${profile.coverage.firstYear}–${profile.coverage.lastYear}`);
  }

  function draw() {
    const profile = provinceProfile(rows, selected, selectedYear);
    const gap = profile.reportedGap === null ? 'Sin superficie plantada comparable' : `${fmt.pct(profile.reportedGap)}%`;
    const gapNote = profile.reportedGap !== null && profile.reportedGap < 0 ? 'El área cosechada supera la plantada reportada; revisa la fuente.' : 'Solo filas con ambas superficies reportadas';
    const crop = profile.topCrop;
    summaryHost.innerHTML = `
      <div class="profile-heading"><span>${escapeHtml(profile.region)} · ${profile.year}</span><strong>${escapeHtml(profile.province)}</strong><p>${escapeHtml(insight(profile))}</p></div>
      <div class="profile-metrics">
        <article><span>Producción</span><strong>${fmt.compact(profile.production)} t</strong><small>Mediana regional: ${fmt.compact(profile.regionalProductionMedian)} t</small></article>
        <article><span>Rendimiento agregado</span><strong>${fmt.decimal(profile.yield)} t/ha</strong><small>Mediana regional: ${fmt.decimal(profile.regionalYieldMedian)} t/ha</small></article>
        <article><span>Cultivo líder</span><strong>${escapeHtml(crop?.crop ?? 'Sin dato')}</strong><small>${crop ? `${fmt.pct(profile.production ? (crop.production / profile.production) * 100 : 0)}% de la producción provincial` : ''}</small></article>
        <article><span>Brecha plantada/cosechada</span><strong>${gap}</strong><small>${gapNote}</small></article>
      </div>
      <div class="profile-signals"><span>Diversidad Shannon <b>${fmt.decimal(profile.diversity)}</b></span><span>Concentración HHI <b>${fmt.decimal(profile.hhi)}</b></span><span>Calidad dominante <b>${escapeHtml(profile.quality.label)} (${fmt.pct(profile.quality.share * 100)}%)</b></span></div>
    `;
    method.textContent = `Cobertura: ${profile.coverage.firstYear ?? 'sin dato'}–${profile.coverage.lastYear ?? 'sin dato'} (${profile.coverage.years} años). Rendimiento = producción total ÷ superficie cosechada total; las comparaciones usan la mediana de provincias de ${profile.region}.`;
    drawTrend(profile);
    const url = new URL(window.location.href);
    url.searchParams.set('provincia', selected);
    url.searchParams.set('anio', selectedYear);
    history.replaceState(null, '', url);
  }

  provinceSelect.addEventListener('change', () => {
    selected = provinceSelect.value;
    draw();
  });
  yearSelect.addEventListener('change', () => {
    selectedYear = Number(yearSelect.value);
    draw();
  });

  const fromUrl = new URLSearchParams(window.location.search).get('provincia');
  if (fromUrl && provinces.includes(fromUrl)) {
    selected = fromUrl;
    provinceSelect.value = selected;
  }
  const yearFromUrl = Number(new URLSearchParams(window.location.search).get('anio'));
  if (summary.years.includes(yearFromUrl)) {
    selectedYear = yearFromUrl;
    yearSelect.value = selectedYear;
  }
  draw();

  return {
    play() {},
    reset() {},
    selectProvince(name) {
      if (!provinces.includes(name)) return;
      selected = name;
      provinceSelect.value = name;
      draw();
    }
  };
}
