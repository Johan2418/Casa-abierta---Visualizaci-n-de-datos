import * as d3 from 'd3';
import { cropRanking, groupCycleSummary, provinceSummary, qualityBreakdown, sumField, uniqueValues } from '../data/aggregateData.js';

export const QUIZ_QUESTION_COUNT = 8;
export const QUIZ_DURATION_MS = 20_000;
export const QUESTION_BANK_VERSION = 'agro-2025-v1';

const letters = ['A', 'B', 'C', 'D'];

function uniqueOptions(correct, candidates) {
  const values = [correct, ...candidates].filter((value, index, list) => value && list.indexOf(value) === index);
  if (values.length < 4) throw new Error(`No hay distractores suficientes para «${correct}».`);
  return values.slice(0, 4);
}

function question(id, category, prompt, correct, candidates, explanation, sourceSection) {
  const options = uniqueOptions(correct, candidates);
  return {
    id,
    category,
    prompt,
    options: options.map((label, index) => ({ id: letters[index], label })),
    correctOptionId: letters[options.indexOf(correct)],
    explanation,
    sourceSection,
    datasetVersion: QUESTION_BANK_VERSION
  };
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const next = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[next]] = [copy[next], copy[index]];
  }
  return copy;
}

export function scoreAnswer(remainingMs, durationMs = QUIZ_DURATION_MS) {
  const safeRemaining = Math.max(0, Math.min(durationMs, remainingMs));
  return 500 + Math.floor(500 * (safeRemaining / durationMs));
}

export function buildQuestionBank(rows, summary) {
  const latestYear = summary.latestYear;
  const years = summary.years;
  const provinces = provinceSummary(rows, latestYear);
  const crops = cropRanking(rows, latestYear, 10);
  const groups = groupCycleSummary(rows, latestYear);
  const quality = qualityBreakdown(rows);
  const latestRows = rows.filter((row) => row.anio === latestYear);
  const historicalCrops = d3
    .rollups(rows, (items) => sumField(items, 'produccion_t'), (row) => row.cultivo)
    .sort((a, b) => d3.descending(a[1], b[1]));
  const historicalProvinces = d3
    .rollups(rows, (items) => sumField(items, 'produccion_t'), (row) => row.provincia)
    .sort((a, b) => d3.descending(a[1], b[1]));
  const regions = uniqueValues(rows, 'region_natural').filter((value) => value !== 'Amazonía agrupada');
  const diverse = [...provinces].sort((a, b) => (b.diversity ?? 0) - (a.diversity ?? 0));
  const topCycle = d3
    .rollups(latestRows, (items) => sumField(items, 'produccion_t'), (row) => row.ciclo_cultivo)
    .sort((a, b) => d3.descending(a[1], b[1]));
  const topRegion = d3
    .rollups(latestRows, (items) => sumField(items, 'produccion_t'), (row) => row.region_natural || 'Sin clasificar')
    .sort((a, b) => d3.descending(a[1], b[1]));
  const cropNames = crops.map((item) => item.crop);
  const provinceNames = provinces.map((item) => item.province);
  const groupNames = groups.map((item) => item.group);

  const bank = [
    question('coverage-years', 'cobertura', '¿Qué periodo cubre el dataset agroproductivo?', `${years[0]}–${latestYear}`, [`${years[0]}–${latestYear - 5}`, `${years[0] + 5}–${latestYear}`, '2010–2024'], 'La base sigue la agroproducción ecuatoriana desde el primer año hasta el último año disponible.', 'numbers'),
    question('coverage-count', 'cobertura', '¿Cuántos años distintos están representados en la base?', String(years.length), [String(years.length - 4), String(years.length + 2), '10'], 'Cada año corresponde a una campaña agrícola registrada en el CSV.', 'numbers'),
    question('latest-year', 'cobertura', '¿Cuál es el año más reciente mostrado en la presentación?', String(latestYear), [String(latestYear - 1), String(latestYear - 2), String(latestYear - 5)], 'Los rankings y conclusiones principales se calculan con el último año disponible.', 'numbers'),
    question('records', 'cobertura', '¿Aproximadamente cuántos registros limpios contiene la base?', `${Math.round(summary.records / 1000)} mil`, [`${Math.round(summary.records / 1000) - 4} mil`, `${Math.round(summary.records / 1000) + 5} mil`, '2 mil'], 'Cada registro combina provincia, cultivo y año.', 'numbers'),
    question('top-province', 'producción', `¿Qué provincia lidera la producción en ${latestYear}?`, provinces[0].province, provinceNames.slice(1, 5), `La provincia líder suma el mayor volumen de toneladas al agregar todos sus cultivos en ${latestYear}.`, 'map'),
    question('top-crop', 'cultivos', `¿Cuál es el cultivo estrella por producción en ${latestYear}?`, crops[0].crop, cropNames.slice(1, 5), 'El ranking agrega las toneladas reportadas para cada cultivo en el último año.', 'ranking'),
    question('top-group', 'cultivos', `¿Qué grupo de cultivo aporta más producción en ${latestYear}?`, groups[0].group, groupNames.slice(1, 5), 'La visualización de grupos compara el peso productivo agregado de cada categoría.', 'groups'),
    question('top-region', 'regiones', `¿Qué región natural concentra más producción en ${latestYear}?`, topRegion[0][0], regions.filter((item) => item !== topRegion[0][0]).concat(['Amazonía agrupada', 'Sin clasificar']), 'La concentración territorial cambia según los cultivos y la superficie cosechada.', 'map'),
    question('top-cycle', 'ciclos', `¿Qué ciclo de cultivo registra más producción en ${latestYear}?`, topCycle[0][0], ['Permanente', 'Transitorio', 'Ambos exactamente igual', 'Sin ciclo reportado'], 'Los ciclos permanentes y transitorios se agregan desde los registros de cultivos.', 'groups'),
    question('diverse-province', 'diversidad', `¿Qué provincia tiene el mayor índice de diversidad en ${latestYear}?`, diverse[0].province, diverse.slice(1, 5).map((item) => item.province), 'El índice Shannon normalizado permite comparar la diversidad de la canasta de cultivos.', 'conclusions'),
    question('row-grain', 'metodología', '¿Qué representa una fila del dataset?', 'Una combinación de provincia, cultivo y año', ['Un agricultor individual', 'Una exportación mensual', 'Un cantón sin cultivo'], 'Esa granularidad permite agregar el dato por provincia, cultivo, región o año.', 'methodology'),
    question('production-unit', 'metodología', '¿En qué unidad se reporta la producción principal?', 'Toneladas métricas', ['Hectáreas', 'Dólares', 'Quintales por día'], 'La métrica central del proyecto es produccion_t, expresada en toneladas métricas.', 'numbers'),
    question('yield-formula', 'metodología', '¿Cómo se obtiene el rendimiento agregado mostrado?', 'Producción total ÷ superficie cosechada total', ['Promedio simple de todos los rendimientos', 'Producción total × superficie cosechada', 'Superficie plantada ÷ producción total'], 'Se divide sobre los totales para que los cultivos pequeños no pesen igual que los grandes.', 'compare'),
    question('quality', 'metodología', '¿Cuál es la categoría de calidad de dato más frecuente?', quality[0].label, quality.slice(1, 4).map((item) => item.label).concat(['Sin registros']), 'La conclusión de calidad resume la clasificación reportada por la fuente original.', 'conclusions'),
    question('historical-crop', 'tendencias', '¿Qué cultivo lidera la producción acumulada de toda la serie histórica?', historicalCrops[0][0], historicalCrops.slice(1, 5).map(([name]) => name), 'Este resultado suma todos los años, no solo el último disponible.', 'timeline'),
    question('historical-province', 'tendencias', '¿Qué provincia lidera la producción acumulada de toda la serie?', historicalProvinces[0][0], historicalProvinces.slice(1, 5).map(([name]) => name), 'El histórico permite distinguir liderazgo sostenido de un buen año puntual.', 'timeline'),
    question('province-count', 'cobertura', '¿Qué dimensión territorial se usa para comparar la producción?', 'Provincia', ['País únicamente', 'Barrio', 'Continente'], 'La presentación usa provincias y zonas históricas reportadas por la fuente.', 'map'),
    question('crop-count', 'cobertura', '¿Qué se sigue a lo largo del tiempo en el explorador?', 'Cultivos', ['Empresas privadas', 'Puertos de exportación', 'Precios de supermercados'], 'Los filtros y la carrera comparan cultivos por provincia y año.', 'explorer'),
    question('map-color', 'producción', 'En el mapa productivo, un dorado más intenso indica…', 'Mayor volumen de producción', ['Mayor precio de venta', 'Mayor diversidad', 'Menor superficie cosechada'], 'El color del mapa codifica toneladas, no calidad ni eficiencia.', 'map'),
    question('diversity-meaning', 'diversidad', 'Un índice Shannon más alto indica que una provincia es…', 'Más diversa en cultivos', ['Más pequeña', 'Más lluviosa', 'Más cara para producir'], 'La diversidad mide la variedad y distribución relativa de la canasta de cultivos.', 'compare'),
    question('cycle-permanent', 'ciclos', '¿Cuál describe mejor a un cultivo permanente?', 'Produce durante varios años', ['Se cosecha el mismo día de la siembra', 'Solo crece en invernadero', 'No requiere superficie'], 'Los permanentes suelen requerir inversión inicial y una estrategia de más largo plazo.', 'groups'),
    question('source', 'metodología', '¿Cuál es la fuente estadística principal de la base?', 'INEC-ESPAC publicada por SIPA/MAG', ['Un sondeo de redes sociales', 'Datos estimados por esta página', 'Una encuesta internacional sin detalle territorial'], 'La presentación transforma datos públicos oficiales, sin estimaciones propias.', 'methodology'),
    question('explorer-filter', 'metodología', '¿Qué permite hacer el explorador interactivo?', 'Filtrar y comparar la evolución de cultivos', ['Editar los datos originales', 'Cambiar los límites provinciales', 'Publicar datos nuevos al ministerio'], 'El explorador es una herramienta de lectura y comparación de los datos cargados.', 'explorer'),
    question('latest-ranking', 'producción', `¿Sobre qué año se calcula el ranking “Cultivos estrella”?`, String(latestYear), [String(latestYear - 1), String(years[0]), 'Promedio de todos los años'], 'El ranking de esa sala usa el año más reciente disponible.', 'ranking')
  ];

  return validateQuestionBank(bank);
}

export function selectSessionQuestions(bank, count = QUIZ_QUESTION_COUNT) {
  const selected = [];
  const categoryCounts = new Map();
  for (const item of shuffle(bank)) {
    if ((categoryCounts.get(item.category) ?? 0) >= 2) continue;
    selected.push({ ...item, options: shuffle(item.options) });
    categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + 1);
    if (selected.length === count) break;
  }
  if (selected.length !== count) throw new Error('El banco no permite formar una sesión diversa de 8 preguntas.');
  return selected;
}

export function validateQuestionBank(bank) {
  if (bank.length < 24) throw new Error('El banco debe tener al menos 24 preguntas.');
  const ids = new Set();
  bank.forEach((item) => {
    if (ids.has(item.id)) throw new Error(`Pregunta duplicada: ${item.id}`);
    ids.add(item.id);
    if (item.options.length !== 4 || new Set(item.options.map((option) => option.label)).size !== 4) {
      throw new Error(`La pregunta ${item.id} debe tener cuatro opciones distintas.`);
    }
    if (!item.options.some((option) => option.id === item.correctOptionId)) {
      throw new Error(`La pregunta ${item.id} no tiene una respuesta correcta válida.`);
    }
  });
  return bank;
}
