import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import { getSummary } from '../src/data/aggregateData.js';
import { buildQuestionBank, validateQuestionBank } from '../src/quiz/questionBank.js';

const numericFields = new Set(['anio', 'superficie_plantada_ha', 'superficie_cosechada_ha', 'produccion_t', 'rendimiento_t_ha', 'indice_diversidad_shannon_normalizado', 'indice_concentracion_hhi_superficie']);
const csv = readFileSync(new URL('../public/data/agrodiversidad_ecuador_powerbi_2002_2025.csv', import.meta.url), 'utf8');
const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
if (parsed.errors.length) throw new Error(parsed.errors[0].message);
const rows = parsed.data.map((raw) => Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, numericFields.has(key) ? (value === '' ? null : Number(String(value).replace(',', '.'))) : String(value ?? '').trim()]))).filter((row) => Number.isFinite(row.anio) && row.provincia && row.cultivo);
const bank = validateQuestionBank(buildQuestionBank(rows, getSummary(rows)));
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;

console.log('begin;');
for (const item of bank) {
  console.log(`insert into public.quiz_questions (id, category, prompt, options, correct_option_id, explanation, source_section, dataset_version, active) values (${quote(item.id)}, ${quote(item.category)}, ${quote(item.prompt)}, ${quote(JSON.stringify(item.options))}::jsonb, ${quote(item.correctOptionId)}, ${quote(item.explanation)}, ${quote(item.sourceSection)}, ${quote(item.datasetVersion)}, true) on conflict (id) do update set category=excluded.category,prompt=excluded.prompt,options=excluded.options,correct_option_id=excluded.correct_option_id,explanation=excluded.explanation,source_section=excluded.source_section,dataset_version=excluded.dataset_version,active=true;`);
}
console.log('commit;');
