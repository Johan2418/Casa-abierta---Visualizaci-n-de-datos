import Papa from 'papaparse';

const CSV_PATH = '/data/agrodiversidad_ecuador_powerbi_2002_2025.csv';

const numericFields = [
  'anio',
  'superficie_plantada_ha',
  'superficie_cosechada_ha',
  'produccion_t',
  'rendimiento_t_ha',
  'superficie_plantada_solo_ha',
  'superficie_plantada_asociado_ha',
  'superficie_plantada_invernadero_ha',
  'produccion_solo_t',
  'produccion_asociado_t',
  'produccion_invernadero_t',
  'componentes_ocultos_confidencialidad',
  'componentes_con_valores_ausentes',
  'superficie_cosechada_nacional_ha',
  'produccion_nacional_t',
  'participacion_superficie_nacional_pct',
  'participacion_produccion_nacional_pct',
  'ranking_produccion_provincial',
  'cultivos_reportados_provincia_anio',
  'superficie_agricola_reportada_provincia_ha',
  'participacion_cultivo_superficie_provincial_pct',
  'indice_diversidad_shannon_normalizado',
  'indice_concentracion_hhi_superficie',
  'variacion_produccion_interanual_pct',
  'variacion_rendimiento_interanual_pct'
];

const requiredFields = [
  'anio',
  'provincia',
  'region_natural',
  'cultivo',
  'grupo_cultivo',
  'ciclo_cultivo',
  'produccion_t',
  'superficie_cosechada_ha',
  'rendimiento_t_ha',
  'indice_diversidad_shannon_normalizado',
  'indice_concentracion_hhi_superficie'
];

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanRow(row) {
  const cleaned = {};
  Object.entries(row).forEach(([key, value]) => {
    cleaned[key] = numericFields.includes(key) ? toNumber(value) : String(value ?? '').trim();
  });
  return cleaned;
}

function validateColumns(fields) {
  const missing = requiredFields.filter((field) => !fields.includes(field));
  if (missing.length) {
    throw new Error(`Faltan columnas requeridas: ${missing.join(', ')}`);
  }
}

export async function loadData() {
  const response = await fetch(CSV_PATH);
  if (!response.ok) {
    throw new Error(`No se pudo cargar el CSV (${response.status})`);
  }

  const csv = await response.text();
  const parsed = Papa.parse(csv, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false
  });

  if (parsed.errors.length) {
    const first = parsed.errors[0];
    throw new Error(`Error leyendo CSV: ${first.message}`);
  }

  validateColumns(parsed.meta.fields ?? []);

  return parsed.data
    .map(cleanRow)
    .filter((row) => row.anio !== null && row.provincia && row.cultivo);
}
