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
      `${fmt.number(ctx.summary.records)} registros abiertos del agro ecuatoriano`
  },
  {
    id: 'numbers',
    theme: 'cyan',
    title: 'El Ecuador agrícola en números',
    subtitle: 'El dataset deja ver escala, tiempo y cobertura territorial.',
    body: 'Cada contador sale del CSV limpio y resume la base que sostiene toda la experiencia.',
    insight: (ctx) =>
      `${ctx.summary.crops.length} cultivos seguidos durante ${ctx.summary.years.length} años`
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
    }
  },
  {
    id: 'timeline',
    theme: 'blue',
    title: 'El tiempo de la producción',
    subtitle: 'La agricultura ecuatoriana cambia cuando se mira como una serie histórica.',
    body: 'Selecciona un cultivo o grupo para ver su trayectoria entre 2002 y 2025.',
    insight: (ctx) =>
      `${ctx.summary.years[0]} → ${ctx.summary.latestYear}: ${ctx.summary.years.length} cosechas de historia en una línea`
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
    }
  },
  {
    id: 'diversity',
    theme: 'violet',
    title: 'Diversidad vs concentración',
    subtitle: 'No todo liderazgo productivo significa diversidad agrícola.',
    body: 'Shannon alto indica más diversidad; HHI alto indica mayor concentración de superficie.',
    insight: (ctx) => {
      const diverse = [...ctx.provinces].sort((a, b) => (b.diversity ?? 0) - (a.diversity ?? 0))[0];
      return `${diverse.province} es la provincia más diversa: Shannon ${fmt.decimal(diverse.diversity)}`;
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
    }
  },
  {
    id: 'explorer',
    theme: 'cyan',
    title: 'Explorador interactivo',
    subtitle: 'La sala principal para la demo en vivo.',
    body: 'Filtra, pulsa ▶ para ver la carrera de cultivos 2002→2025 y abre el inspector con un clic en cualquier barra.',
    insight: () => `Modo demo: pulsa ▶ y mira competir a los cultivos año a año`
  },
  {
    id: 'methodology',
    theme: 'violet',
    title: '¿Cómo se hizo?',
    subtitle: 'De filas crudas de CSV a una narrativa visual, en cinco pasos.',
    body: 'Ninguna cifra está precalculada: todo se limpia, agrega y dibuja en el navegador con D3 y GSAP.',
    insight: (ctx) =>
      `${fmt.number(ctx.summary.records)} filas → 0 backends → 1 experiencia interactiva`
  },
  {
    id: 'conclusions',
    theme: 'green',
    title: 'Conclusiones visuales',
    subtitle: 'Cuatro hallazgos para cerrar la casa abierta.',
    body: 'Una síntesis legible para público general, basada en producción, diversidad y calidad del dato.',
    insight: (ctx) =>
      `Todo lo que viste se calculó en vivo desde ${fmt.number(ctx.summary.records)} filas de CSV`
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
        <button class="fullscreen-toggle" id="fullscreenToggle" type="button" aria-label="Pantalla completa" aria-pressed="false">
          <svg viewBox="0 0 24 24" aria-hidden="true" class="icon-expand">
            <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />
          </svg>
          <svg viewBox="0 0 24 24" aria-hidden="true" class="icon-collapse">
            <path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5" />
          </svg>
        </button>
      </header>
      <div class="attract-badge" id="attractBadge" aria-live="polite">Modo demostración · toca para continuar</div>
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
        <span id="slideCounter">01 / 09</span>
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
  return `
    <section class="slide slide-${section.id}" data-section="${section.id}" data-theme="${section.theme}" aria-label="${section.title}">
      <div class="slide-copy">
        <span class="section-number">${number}${kicker}</span>
        <h1>${wrapTitleWords(section.title)}</h1>
        <p class="subtitle">${section.subtitle}</p>
        <p class="body">${section.body}</p>
        ${insight ? `<p class="insight-chip"><span class="chip-spark">✦</span>${insight}</p>` : ''}
      </div>
      <div class="slide-stage" id="stage-${section.id}"></div>
    </section>
  `;
}
