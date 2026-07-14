import { describe, expect, it } from 'vitest';
import { aggregateYield, provinceProfile } from '../src/data/aggregateData.js';

const rows = [
  { provincia: 'A', anio: 2025, region_natural: 'Costa', cultivo: 'Maíz', produccion_t: 100, superficie_cosechada_ha: 50, superficie_plantada_ha: 40, indice_diversidad_shannon_normalizado: 0.4, indice_concentracion_hhi_superficie: 0.3, calidad_dato: 'Completo' },
  { provincia: 'B', anio: 2025, region_natural: 'Costa', cultivo: 'Arroz', produccion_t: 50, superficie_cosechada_ha: 25, superficie_plantada_ha: 30, indice_diversidad_shannon_normalizado: 0.5, indice_concentracion_hhi_superficie: 0.2, calidad_dato: 'Completo' }
];

describe('agregados provinciales', () => {
  it('calcula rendimiento sobre totales comparables', () => {
    expect(aggregateYield(rows)).toBeCloseTo(2);
  });

  it('conserva una brecha plantada/cosechada negativa', () => {
    expect(provinceProfile(rows, 'A', 2025).reportedGap).toBeLessThan(0);
  });
});
