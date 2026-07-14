import { gsap } from 'gsap';
import { motionDuration } from '../animation/deckMotion.js';

function buildCredits() {
  return [
    {
      icon: 'project',
      title: 'Sembrando Datos',
      label: 'Nombre del Proyecto',
      text: 'Análisis interactivo de agroproducción ecuatoriana con datos abiertos del INEC-ESPAC (2002-2025).'
    },
    {
      icon: 'team',
      title: '6to Software "A"',
      label: 'Equipo de Realización',
      text: 'Estudiantes y desarrolladores que transformaron datos públicos en una experiencia visual narrativa.'
    },
    {
      icon: 'mentor',
      title: 'Ing. Anthony Legarda Albiño',
      label: 'Docente Encargado',
      text: 'Orientación académica y supervisión del proyecto dentro del programa de educación digital.'
    },
    {
      icon: 'purpose',
      title: 'Propósito',
      label: 'Misión del Análisis',
      text: 'Comprender la escala, distribución territorial, evolución y diversidad de la agroproducción ecuatoriana mediante visualización de datos públicos, sin fines políticos ni económicos.'
    }
  ];
}

function iconSVG(type) {
  const icons = {
    project: `
      <svg viewBox="0 0 24 24" class="credit-icon" aria-hidden="true">
        <rect x="4" y="3" width="16" height="18" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/>
        <path d="M8 6h8M8 10h8M8 14h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    `,
    team: `
      <svg viewBox="0 0 24 24" class="credit-icon" aria-hidden="true">
        <circle cx="12" cy="8" r="3" stroke="currentColor" stroke-width="1.5" fill="none"/>
        <path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    `,
    mentor: `
      <svg viewBox="0 0 24 24" class="credit-icon" aria-hidden="true">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" 
              stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/>
      </svg>
    `,
    purpose: `
      <svg viewBox="0 0 24 24" class="credit-icon" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/>
        <circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="1.5" fill="none"/>
        <circle cx="12" cy="12" r="1" fill="currentColor"/>
      </svg>
    `
  };
  return icons[type] || '';
}

export function renderCredits(container) {
  const credits = buildCredits();

  container.innerHTML = `
    <div class="credits-grid">
      ${credits
        .map(
          (credit, i) => `
            <article class="credit-card">
              ${iconSVG(credit.icon)}
              <div class="credit-copy">
                <strong>${credit.title}</strong>
                <span class="credit-label">${credit.label}</span>
                <p>${credit.text}</p>
              </div>
            </article>
          `
        )
        .join('')}
    </div>
  `;

  const cards = container.querySelectorAll('.credit-card');
  const icons = container.querySelectorAll('.credit-icon');

  gsap.set(cards, { autoAlpha: 0, scale: 0.7, y: 20 });
  gsap.set(icons, { autoAlpha: 0 });

  function play() {
    gsap
      .timeline({ defaults: { ease: 'power3.out' } })
      .to(cards, { autoAlpha: 1, scale: 1, y: 0, duration: motionDuration(0.6), stagger: 0.2 }, 0)
      .to(icons, { autoAlpha: 1, duration: motionDuration(0.5), stagger: 0.2 }, 0.1);
  }

  function reset() {
    gsap.set(cards, { autoAlpha: 0, scale: 0.7, y: 20 });
    gsap.set(icons, { autoAlpha: 0 });
  }

  return { play, reset };
}
