import * as d3 from 'd3';
import { fmt } from '../data/aggregateData.js';

export const sections = [
  {
    id: 'hero',
    theme: 'green',
    title: 'Sembrando Datos',
    kicker: 'Ecuador · 2002-2025',
    subtitle: 'Radiografía agroproductiva del Ecuador',
    body: 'Una exposición horizontal construida con datos reales de cultivos, provincias, producción, rendimiento y diversidad agrícola. Avanza con las flechas ◂ ▸.',
    insight: (ctx) =>
      `${fmt.number(ctx.summary.records)} registros abiertos del agro ecuatoriano`,
    contextualHelp: {
      what: 'Esta presentación reúne datos públicos del Ministerio de Agricultura del Ecuador (INEC-ESPAC) desde 2002 hasta 2025, mostrando la evolución de la agroproducción ecuatoriana en cifras reales.',
      how: 'Cada número, mapa y gráfico se calcula en vivo en tu navegador desde archivos CSV públicos, sin intermediarios ni precálculos almacenados. Navega con las flechas laterales o los puntos en la base para explorar cada vista.'
    }
  },
  {
    id: 'numbers',
    theme: 'cyan',
    title: 'El Ecuador agrícola en números',
    subtitle: 'El dataset deja ver escala, tiempo y cobertura territorial.',
    body: 'Cada contador sale del CSV limpio y resume la base que sostiene toda la experiencia.',
    insight: (ctx) =>
      `${ctx.summary.crops.length} cultivos seguidos durante ${ctx.summary.years.length} años`,
    contextualHelp: {
      what: 'Seis indicadores clave resumen la base de datos: cantidad de registros limpios, años cubiertos, provincias y zonas representadas, cultivos monitoreados, toneladas de producción totales y hectáreas cosechadas en el período.',
      how: 'Cada cifra se recalcula al cambiar el año o el filtro en otras secciones. Los números nacionales son agregaciones directas del CSV, sin estimaciones ni imputaciones. Mayor cobertura territorial y temporal permite interpretar con confianza los patrones que verás en los siguientes gráficos.'
    }
  },
  {
    id: 'map',
    theme: 'gold',
    title: 'Mapa productivo',
    subtitle: 'La producción no se distribuye igual: cada provincia tiene una huella distinta.',
    body: 'Geografía real del Ecuador: cuanto más dorada la provincia, más toneladas produce. Pasa el cursor para leer su ficha.',
    insight: (ctx) => {
      const total = d3.sum(ctx.provinces, (d) => d.production) || 1;
      const top3 = d3.sum(ctx.provinces.slice(0, 3), (d) => d.production);
      return `El top 3 de provincias concentra el ${fmt.pct((top3 / total) * 100)}% de la producción ${ctx.summary.latestYear}`;
    },
    contextualHelp: {
      what: 'El color de cada provincia representa su volumen de producción agrícola en el año seleccionado. Provincias más doradas producen más toneladas; provincias más oscuras producen menos.',
      how: 'No implica calidad, eficiencia ni sostenibilidad: es solo volumen de producción. La concentración en pocas provincias refleja factores geográficos (suelos, clima), inversión histórica y acceso a mercados. Para entender por qué una provincia produce más, explora los cultivos específicos en las secciones de ranking y comparación.'
    }
  },
  {
    id: 'timeline',
    theme: 'blue',
    title: 'El tiempo de la producción',
    subtitle: 'La agricultura ecuatoriana cambia cuando se mira como una serie histórica.',
    body: 'Selecciona un cultivo o grupo para ver su trayectoria entre 2002 y 2025.',
    insight: (ctx) =>
      `${ctx.summary.years[0]} → ${ctx.summary.latestYear}: ${ctx.summary.years.length} cosechas de historia en una línea`,
    contextualHelp: {
      what: 'Una línea por cultivo o grupo de cultivos, mostrando el volumen de producción año a año. Las subidas indican crecimiento; las bajadas, declive.',
      how: 'Cambios bruscos pueden obedecer a: adopción de nueva tecnología, cambios en demanda global, caída de precios, fenómenos climáticos o reconversión de tierras. Un cultivo en declive no es "malo": puede reflejar que se siembra menos porque el mercado cambió o porque el productor se pasó a otro más rentable.'
    }
  },
  {
    id: 'ranking',
    theme: 'green',
    title: 'Cultivos estrella',
    subtitle: 'Los cultivos líderes concentran gran parte del volumen nacional.',
    body: 'Ranking de producción del último año disponible en el CSV.',
    insight: (ctx) => {
      const top = ctx.crops[0];
      const total = d3.sum(ctx.crops, (d) => d.production) || 1;
      return `${top.crop}: ${fmt.compact(top.production)} t, líder absoluto del ${ctx.summary.latestYear}`;
    },
    contextualHelp: {
      what: 'Clasificación de cultivos por volumen de producción total en el año más reciente. Muestra cuáles son los "pesos pesados" de la agroproducción ecuatoriana.',
      how: 'Un cultivo en el top no es necesariamente el más importante económicamente (eso depende del precio, la exportación y la demanda). El volumen es solo una dimensión. Cultivos menores en volumen pueden generar más ingresos si se venden a precio premium o se exportan a mercados específicos.'
    }
  },
  {
    id: 'diversity',
    theme: 'violet',
    title: 'Producción en movimiento',
    subtitle: '¿Qué cultivos crecen y cuáles pierden fuerza?',
    body: 'Cada punto es una combinación provincia–cultivo. A la derecha se produce más; arriba crece; abajo cae. El tamaño representa superficie y el color, región.',
    insight: () => 'En 2025, 128 combinaciones son motores de alto volumen y crecimiento',
    contextualHelp: {
      what: 'Cada burbuja representa un par provincia-cultivo. La posición horizontal (eje X) es el volumen total producido; la vertical (eje Y), la tasa de crecimiento anual promedio. El tamaño de la burbuja es la superficie cosechada; el color, la región natural.',
      how: 'Las burbujas en la esquina superior derecha son "motores de crecimiento" (mucha producción + crecimiento sostenido). Las de la esquina inferior izquierda pueden ser cultivos en declive o nicho. La concentración en cuadrantes revela patrones de reconversión agrícola: ¿la región está abandONando cultivos o diversificando?'
    }
  },
  {
    id: 'groups',
    theme: 'gold',
    title: 'Región, ciclo y grupo de cultivo',
    subtitle: 'Los grupos productivos muestran diferentes pesos y ciclos.',
    body: 'Compara producción permanente y transitoria por grupo de cultivo.',
    insight: (ctx) => {
      const top = ctx.groups[0];
      return `${top.group}: el grupo más pesado con ${fmt.compact(top.production)} t`;
    },
    contextualHelp: {
      what: 'Los cultivos se organizan en grupos (cereales, tubérculos, leguminosas, etc.) y ciclos productivos (permanentes: árboles y arbustos; transitorios: siembras anuales). Este gráfico muestra cuánta producción genera cada combinación grupo-ciclo.',
      how: 'Los permanentes ofrecen estabilidad a largo plazo pero requieren inversión inicial. Los transitorios son más flexibles ante cambios de mercado. El balance entre ambos refleja la estrategia productiva regional: una región muy dependiente de transitorios es más vulnerable a crisis de corto plazo.'
    }
  },
  {
    id: 'compare',
    theme: 'blue',
    title: 'Cara a cara provincial',
    subtitle: 'Dos provincias, un mismo año: ¿quién produce más y quién diversifica mejor?',
    body: 'Elige cualquier par de provincias y compara producción, superficie, rendimiento y diversidad en tiempo real.',
    insight: (ctx) => {
      const a = ctx.provinces[0];
      const b = ctx.provinces[1] ?? ctx.provinces[0];
      const ratio = b.production ? a.production / b.production : 0;
      return `${a.province} produjo ${fmt.decimal(ratio)}x más que ${b.province} en ${ctx.summary.latestYear}`;
    },
    contextualHelp: {
      what: 'Cuatro métricas de dos provincias lado a lado: producción total, superficie cultivada, rendimiento promedio (producción ÷ superficie) y diversidad (índice Shannon de cultivos).',
      how: 'Mayor producción no significa mayor eficiencia: compara rendimiento. Mayor diversidad no garantiza resiliencia: una provincia con pocos cultivos de alto rendimiento puede ser más estable que una con muchos cultivos marginales. La interpretación correcta requiere contexto: geografía, inversión, mercados.'
    }
  },
  {
    id: 'explorer',
    theme: 'cyan',
    title: 'Explorador interactivo',
    subtitle: 'La sala principal para la demo en vivo.',
    body: 'Filtra, pulsa ▶ para ver la carrera de cultivos 2002→2025 y abre el inspector con un clic en cualquier barra.',
    insight: () => `Modo demo: pulsa ▶ y mira competir a los cultivos año a año`,
    contextualHelp: {
      what: 'Filtro personalizado por provincia y cultivo, visualización en barras del ranking anual (2002-2025), y reproductor automático para ver la evolución como competencia. Al hacer clic en una barra, abre un inspector detallado del cultivo y provincia seleccionados.',
      how: 'El filtro acepta combinaciones. La "carrera" (al pulsar ▶) es visual: solo muestra el ranking de ese año sobre año. No implica causalidad entre cambios de posición. Usa el inspector para verificar cifras específicas y el contexto provincial en la sección de comparación.'
    }
  },
  {
    id: 'methodology',
    theme: 'violet',
    title: 'Sembrando Datos · Créditos',
    subtitle: 'Proyecto colaborativo del análisis agroproductivo del Ecuador.',
    body: 'Un análisis de datos abiertos hecho para comprender la escala, distribución territorial, evolución y diversidad de la agroproducción ecuatoriana en el contexto de políticas de desarrollo rural y sostenibilidad.',
    insight: () => 'Análisis visual construido con tecnología web moderna, sin servidores ni intermediarios',
    contextualHelp: {
      what: 'Sembrando Datos es un proyecto educativo y de comunicación pública que transforma datos agrícolas oficiales en una narrativa visual interactiva.',
      how: 'El análisis no persigue conclusiones políticas sino mostrar patrones: dónde, cuánto y cómo produce Ecuador. Los datos son públicos; la interpretación es tuya. Cada número es verificable en el CSV fuente (SIPA/MAG). No incluye estimaciones, solo agregaciones directas de lo reportado.'
    }
  },
  {
    id: 'conclusions',
    theme: 'green',
    title: 'Conclusiones visuales',
    subtitle: 'Cuatro hallazgos para cerrar la casa abierta.',
    body: 'Una síntesis legible para público general, basada en producción, diversidad y calidad del dato.',
    insight: (ctx) =>
      `Todo lo que viste se calculó en vivo desde ${fmt.number(ctx.summary.records)} filas de CSV`,
    contextualHelp: {
      what: 'Cuatro síntesis visuales que cierran la narrativa: concentración geográfica, evolución temporal, diversidad de cultivos y tendencias recientes.',
      how: 'Cada conclusión se basa en datos agregados directamente del CSV. No son predicciones ni recomendaciones políticas. Son observaciones sobre patrones visibles en el registro histórico. Para profundizar, vuelve a las secciones anteriores y explora filtros específicos.'
    }
  }
];

function wrapTitleWords(title) {
  return title
    .split(' ')
    .map((word) => `<span class="word"><span class="word-inner">${word}</span></span>`)
    .join(' ');
}

export function buildAppShell(ctx) {
  return `
    <main class="deck-app" data-theme="green">
      <div class="ambient-layer" aria-hidden="true">
        <div class="orb orb-a"></div>
        <div class="orb orb-b"></div>
        <div class="ambient-grid"></div>
        <canvas class="ambient-canvas"></canvas>
      </div>
      <header class="topbar" aria-label="Navegación principal">
        <div class="brand">Sembrando Datos</div>
        <div class="topbar-meta">Ecuador · Agroproducción · 2002-2025</div>
        <div class="topbar-actions">
          <button class="auto-advance-toggle" id="autoAdvanceToggle" type="button" aria-label="Activar autoavance" aria-pressed="false">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path class="auto-icon-play" d="M8 5v14l11-7z" />
              <path class="auto-icon-pause" d="M7 5h4v14H7zM13 5h4v14h-4z" />
            </svg>
            <span class="auto-advance-label">Auto OFF</span>
          </button>
          <button class="fullscreen-toggle" id="fullscreenToggle" type="button" aria-label="Pantalla completa" aria-pressed="false">
            <svg viewBox="0 0 24 24" aria-hidden="true" class="icon-expand">
              <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />
            </svg>
            <svg viewBox="0 0 24 24" aria-hidden="true" class="icon-collapse">
              <path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5" />
            </svg>
          </button>
        </div>
      </header>
      <button class="nav-arrow nav-arrow-left" id="prevSlide" type="button" aria-label="Retroceder sala">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7"/></svg>
      </button>
      <button class="nav-arrow nav-arrow-right" id="nextSlide" type="button" aria-label="Avanzar sala">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>
      </button>
      <div class="deck-track" id="deckTrack">
        ${sections.map((section, index) => renderSlide(section, index, ctx)).join('')}
      </div>
      <footer class="deck-progress" id="deckProgress">
        <div class="progress-line" aria-hidden="true"></div>
        <div class="dots" id="deckDots">
          ${sections
            .map(
              (section, index) =>
                `<button type="button" class="dot" aria-label="Ir a ${section.title}" data-index="${index}"></button>`
            )
            .join('')}
        </div>
      </footer>
      <div class="tooltip" id="tooltip" role="status"></div>
    </main>
  `;
}

function renderSlide(section, index, ctx) {
  const number = String(index + 1).padStart(2, '0');
  const kicker = section.kicker ? ` · ${section.kicker}` : '';
  const insight = section.insight ? section.insight(ctx) : '';
  const help = section.contextualHelp;
  return `
    <section class="slide slide-${section.id}" data-section="${section.id}" data-theme="${section.theme}" aria-label="${section.title}">
      <div class="slide-copy">
        <span class="section-number">${number}${kicker}</span>
        <h1>${wrapTitleWords(section.title)}</h1>
        <p class="subtitle">${section.subtitle}</p>
        <p class="body">${section.body}</p>
        ${insight ? `<p class="insight-chip"><span class="chip-spark">✦</span>${insight}</p>` : ''}
        ${help ? `
          <div class="contextual-panel">
            <div class="contextual-item">
              <span class="contextual-label">Qué muestran los datos</span>
              <p>${help.what}</p>
            </div>
            <div class="contextual-item">
              <span class="contextual-label">Cómo interpretarlos</span>
              <p>${help.how}</p>
            </div>
          </div>
        ` : ''}
      </div>
      <div class="slide-stage" id="stage-${section.id}"></div>
    </section>
  `;
}
