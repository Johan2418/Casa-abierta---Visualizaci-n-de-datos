import * as d3 from 'd3';

// d3.format usa coma para miles y punto para decimales (inglés); Ecuador usa
// justo lo contrario. formatLocale no toca las letras de sufijo SI (k, M) —
// eso es intencional: son estándar y se entienden igual en español.
const esEC = d3.formatLocale({
  decimal: ',',
  thousands: '.',
  grouping: [3],
  currency: ['$', ''],
  minus: '-'
});

const compactRaw = esEC.format('.3~s');

export const fmt = {
  // 3 cifras significativas + espacio antes de la letra SI: "10,7 M" en vez
  // de "10.7465M".
  compact: (value) => compactRaw(value).replace(/([a-zA-Zµ])$/, ' $1'),
  number: esEC.format(',.0f'),
  decimal: esEC.format(',.2f'),
  pct: esEC.format(',.1f')
};

export function sumField(rows, field) {
  return d3.sum(rows, (row) => row[field] ?? 0);
}

// Un rendimiento agregado debe calcularse con los totales, no promediando los
// rendimientos de cada cultivo: un cultivo pequeño no puede pesar igual que
// uno que ocupa miles de hectáreas.
export function aggregateYield(rows) {
  const comparable = rows.filter(
    (row) => Number.isFinite(row.produccion_t) && Number.isFinite(row.superficie_cosechada_ha) && row.superficie_cosechada_ha > 0
  );
  const harvested = sumField(comparable, 'superficie_cosechada_ha');
  return harvested ? sumField(comparable, 'produccion_t') / harvested : 0;
}

export function uniqueValues(rows, field) {
  return [...new Set(rows.map((row) => row[field]).filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), 'es')
  );
}

export function getSummary(rows) {
  const years = uniqueValues(rows, 'anio').sort((a, b) => a - b);
  const latestYear = d3.max(years);
  const latestRows = rows.filter((row) => row.anio === latestYear);

  return {
    records: rows.length,
    years,
    latestYear,
    provinces: uniqueValues(rows, 'provincia'),
    crops: uniqueValues(rows, 'cultivo'),
    groups: uniqueValues(rows, 'grupo_cultivo'),
    regions: uniqueValues(rows, 'region_natural'),
    totalProduction: sumField(rows, 'produccion_t'),
    latestProduction: sumField(latestRows, 'produccion_t'),
    latestHarvested: sumField(latestRows, 'superficie_cosechada_ha')
  };
}

export function filterRows(rows, filters = {}) {
  return rows.filter((row) => {
    if (filters.year && row.anio !== Number(filters.year)) return false;
    if (filters.province && row.provincia !== filters.province) return false;
    if (filters.region && row.region_natural !== filters.region) return false;
    if (filters.crop && row.cultivo !== filters.crop) return false;
    if (filters.group && row.grupo_cultivo !== filters.group) return false;
    return true;
  });
}

// Todos los cultivos del CSV, ordenados por producción histórica acumulada
// (no alfabético): así el selector del timeline abre mostrando primero los
// cultivos relevantes en vez de cortar arbitrariamente en la letra "R".
export function cropsByTotalProduction(rows) {
  return d3
    .rollups(rows, (items) => sumField(items, 'produccion_t'), (row) => row.cultivo)
    .sort((a, b) => d3.descending(a[1], b[1]))
    .map(([crop]) => crop);
}

export function cropRanking(rows, year, limit = 10) {
  const selected = rows.filter((row) => row.anio === year);
  return d3
    .rollups(
      selected,
      (items) => ({
        production: sumField(items, 'produccion_t'),
        harvested: sumField(items, 'superficie_cosechada_ha'),
        yield: aggregateYield(items)
      }),
      (row) => row.cultivo
    )
    .map(([crop, values]) => ({ crop, ...values }))
    .filter((item) => item.production > 0)
    .sort((a, b) => d3.descending(a.production, b.production))
    .slice(0, limit);
}

export function provinceSummary(rows, year) {
  const selected = rows.filter((row) => row.anio === year);
  return d3
    .rollups(
      selected,
      (items) => ({
        production: sumField(items, 'produccion_t'),
        harvested: sumField(items, 'superficie_cosechada_ha'),
        crops: uniqueValues(items, 'cultivo').length,
        region: items.find((item) => item.region_natural)?.region_natural ?? 'Sin clasificar',
        diversity: d3.mean(items, (row) => row.indice_diversidad_shannon_normalizado),
        yield: aggregateYield(items),
        hhi: d3.mean(items, (row) => row.indice_concentracion_hhi_superficie),
        qualityComplete: items.filter((row) => row.calidad_dato === 'Completo').length / Math.max(items.length, 1)
      }),
      (row) => row.provincia
    )
    .map(([province, values]) => ({ province, ...values }))
    .sort((a, b) => d3.descending(a.production, b.production));
}

/**
 * Filas listas para el cuadrante de escala y evolución: una burbuja por
 * provincia × cultivo. 2002 no entra porque no tiene comparación interanual.
 */
export function productionMomentumRows(rows, year, group = '') {
  return rows
    .filter(
      (row) =>
        row.anio === Number(year) &&
        (!group || row.grupo_cultivo === group) &&
        Number.isFinite(row.produccion_t) &&
        row.produccion_t > 0 &&
        Number.isFinite(row.superficie_cosechada_ha) &&
        row.superficie_cosechada_ha > 0 &&
        Number.isFinite(row.variacion_produccion_interanual_pct)
    )
    .map((row) => ({
      id: `${row.provincia}::${row.cultivo}`,
      province: row.provincia,
      crop: row.cultivo,
      group: row.grupo_cultivo || 'Sin clasificar',
      region: row.region_natural || 'Sin clasificar',
      production: row.produccion_t,
      change: row.variacion_produccion_interanual_pct,
      harvested: row.superficie_cosechada_ha
    }));
}

const SERIES_FIELD = {
  crop: 'cultivo',
  group: 'grupo_cultivo',
  province: 'provincia'
};

export function yearlySeries(rows, mode, value) {
  const field = SERIES_FIELD[mode] ?? 'cultivo';
  const selected = value ? rows.filter((row) => row[field] === value) : rows;
  return d3
    .rollups(
      selected,
      (items) => ({
        year: items[0].anio,
        production: sumField(items, 'produccion_t'),
        harvested: sumField(items, 'superficie_cosechada_ha'),
        yield: aggregateYield(items)
      }),
      (row) => row.anio
    )
    .map(([year, values]) => ({ ...values, year }))
    .sort((a, b) => a.year - b.year);
}

export function groupCycleSummary(rows, year) {
  const selected = rows.filter((row) => row.anio === year);
  return d3
    .rollups(
      selected,
      (items) => ({
        production: sumField(items, 'produccion_t'),
        harvested: sumField(items, 'superficie_cosechada_ha'),
        permanent: sumField(
          items.filter((row) => row.ciclo_cultivo === 'Permanente'),
          'produccion_t'
        ),
        transient: sumField(
          items.filter((row) => row.ciclo_cultivo === 'Transitorio'),
          'produccion_t'
        )
      }),
      (row) => row.grupo_cultivo
    )
    .map(([group, values]) => ({ group, ...values }))
    .filter((item) => item.production > 0)
    .sort((a, b) => d3.descending(a.production, b.production));
}

export function provinceStats(rows, province, year) {
  const scoped = rows.filter((row) => row.provincia === province && row.anio === year);
  const topCrop = cropRanking(scoped, year, 1)[0] ?? null;
  return {
    province,
    production: sumField(scoped, 'produccion_t'),
    harvested: sumField(scoped, 'superficie_cosechada_ha'),
    yield: aggregateYield(scoped),
    diversity: d3.mean(scoped, (row) => row.indice_diversidad_shannon_normalizado) ?? 0,
    crops: uniqueValues(scoped, 'cultivo').length,
    topCrop: topCrop?.crop ?? 'Sin dato'
  };
}

export function qualityBreakdown(rows) {
  const total = rows.length;
  return d3
    .rollups(rows, (items) => items.length, (row) => row.calidad_dato || 'Sin clasificar')
    .map(([label, count]) => ({ label, count, share: count / total }))
    .sort((a, b) => d3.descending(a.count, b.count));
}

export function provinceProfile(rows, province, year) {
  const scoped = rows.filter((row) => row.provincia === province);
  const selected = scoped.filter((row) => row.anio === Number(year));
  const years = uniqueValues(scoped, 'anio').sort((a, b) => a - b);
  const region = selected.find((row) => row.region_natural)?.region_natural ?? scoped.find((row) => row.region_natural)?.region_natural ?? 'Sin clasificar';
  const production = sumField(selected, 'produccion_t');
  const harvested = sumField(selected, 'superficie_cosechada_ha');
  const plantedComparable = selected.filter(
    (row) => Number.isFinite(row.superficie_plantada_ha) && Number.isFinite(row.superficie_cosechada_ha)
  );
  const planted = sumField(plantedComparable, 'superficie_plantada_ha');
  const harvestedComparable = sumField(plantedComparable, 'superficie_cosechada_ha');
  const crops = cropRanking(selected, Number(year), 1);
  const sameRegion = provinceSummary(rows, Number(year)).filter((item) => item.region === region && item.province !== province);
  const regionalProductionMedian = d3.median(sameRegion, (item) => item.production) ?? 0;
  const regionalYieldMedian = d3.median(sameRegion, (item) => item.yield) ?? 0;
  const quality = qualityBreakdown(selected)[0] ?? { label: 'Sin dato', share: 0 };
  const history = years.map((itemYear) => {
    const items = scoped.filter((row) => row.anio === itemYear);
    return {
      year: itemYear,
      production: sumField(items, 'produccion_t'),
      harvested: sumField(items, 'superficie_cosechada_ha'),
      yield: aggregateYield(items)
    };
  });

  return {
    province,
    year: Number(year),
    region,
    production,
    harvested,
    yield: aggregateYield(selected),
    diversity: d3.mean(selected, (row) => row.indice_diversidad_shannon_normalizado) ?? 0,
    hhi: d3.mean(selected, (row) => row.indice_concentracion_hhi_superficie) ?? 0,
    topCrop: crops[0] ?? null,
    cropCount: uniqueValues(selected, 'cultivo').length,
    coverage: { firstYear: years[0] ?? null, lastYear: years.at(-1) ?? null, years: years.length },
    planted,
    harvestedComparable,
    reportedGap: planted ? Math.max(0, ((planted - harvestedComparable) / planted) * 100) : null,
    quality,
    regionalProductionMedian,
    regionalYieldMedian,
    history
  };
}
