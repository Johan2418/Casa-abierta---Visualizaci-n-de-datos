import { gsap } from 'gsap';
import { fmt } from '../data/aggregateData.js';
import { motionDuration } from '../animation/deckMotion.js';

function buildSteps(summary) {
  return [
    {
      title: 'Fuente abierta',
      text: `${fmt.number(summary.records)} filas de SIPA/MAG (INEC-ESPAC), ${summary.years[0]}-${summary.latestYear}, datos públicos de agricultura del Ecuador.`
    },
    {
      title: 'Limpieza en el navegador',
      text: 'PapaParse parsea el CSV, se tipa cada campo numérico y los vacíos se normalizan a null antes de dibujar nada.'
    },
    {
      title: 'Agregación con D3',
      text: 'rollups, mean y extent calculan rankings, series y diversidad al vuelo — sin backend ni caché precalculada.'
    },
    {
      title: 'Codificación visual deliberada',
      text: 'Posición y longitud para comparar magnitudes, color para región natural, tamaño para volumen, dos ejes para relaciones (Shannon vs HHI).'
    },
    {
      title: 'Movimiento con sentido',
      text: 'GSAP coreografía la narrativa; D3 anima los datos. Cada gráfico se construye ante el visitante, no aparece ya resuelto.'
    }
  ];
}

export function renderMethodology(container, summary) {
  const steps = buildSteps(summary);

  container.innerHTML = `
    <div class="pipeline">
      <svg class="pipeline-line" viewBox="0 0 20 100" preserveAspectRatio="none" aria-hidden="true">
        <line x1="10" y1="4" x2="10" y2="96" />
      </svg>
      <ol class="pipeline-steps">
        ${steps
          .map(
            (step, i) => `
              <li class="pipeline-step">
                <span class="pipeline-node">${String(i + 1).padStart(2, '0')}</span>
                <div class="pipeline-copy">
                  <strong>${step.title}</strong>
                  <p>${step.text}</p>
                </div>
              </li>
            `
          )
          .join('')}
      </ol>
    </div>
  `;

  const lineNode = container.querySelector('.pipeline-line line');
  const length = lineNode.getTotalLength();
  const nodes = container.querySelectorAll('.pipeline-node');
  const copies = container.querySelectorAll('.pipeline-copy');

  gsap.set(lineNode, { attr: { 'stroke-dasharray': length, 'stroke-dashoffset': length } });
  gsap.set(nodes, { autoAlpha: 0, scale: 0.4 });
  gsap.set(copies, { autoAlpha: 0, x: 24 });

  function play() {
    gsap
      .timeline({ defaults: { ease: 'power3.out' } })
      .to(lineNode, { attr: { 'stroke-dashoffset': 0 }, duration: motionDuration(1.6), ease: 'power2.inOut' }, 0)
      .to(nodes, { autoAlpha: 1, scale: 1, duration: motionDuration(0.5), stagger: 0.3, ease: 'back.out(2)' }, 0.1)
      .to(copies, { autoAlpha: 1, x: 0, duration: motionDuration(0.55), stagger: 0.3 }, 0.2);
  }

  function reset() {
    gsap.set(lineNode, { attr: { 'stroke-dashoffset': length } });
    gsap.set(nodes, { autoAlpha: 0, scale: 0.4 });
    gsap.set(copies, { autoAlpha: 0, x: 24 });
  }

  return { play, reset };
}
