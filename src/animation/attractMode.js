import { gsap } from 'gsap';

const SLIDE_MS = 8000;

/**
 * Autoavance manual: apagado por defecto. Al activarse recorre las secciones
 * a intervalo fijo; al desactivarse no vuelve a avanzar por su cuenta.
 */
export function createAutoAdvance({ deck, toggleButton, sections, slideMs = SLIDE_MS }) {
  let advanceTimer = null;
  let active = false;

  function triggerExplorerRace() {
    const playButton = document.querySelector('#playYears');
    if (playButton && !playButton.classList.contains('is-playing')) {
      playButton.click();
    }
  }

  function updateButton() {
    if (!toggleButton) return;
    toggleButton.classList.toggle('is-active', active);
    toggleButton.setAttribute('aria-pressed', String(active));
    toggleButton.setAttribute('aria-label', active ? 'Desactivar autoavance' : 'Activar autoavance');

    const label = toggleButton.querySelector('.auto-advance-label');
    if (label) label.textContent = active ? 'Auto ON' : 'Auto OFF';
  }

  function scheduleAdvance() {
    clearTimeout(advanceTimer);
    advanceTimer = setTimeout(() => {
      if (!active) return;

      const index = deck.getIndex();
      if (index >= deck.getSlideCount() - 1) {
        deck.goTo(0);
        if (sections[0]?.id === 'explorer') triggerExplorerRace();
      } else {
        deck.next();
        if (sections[index + 1]?.id === 'explorer') triggerExplorerRace();
      }

      if (active) scheduleAdvance();
    }, slideMs);
  }

  function start() {
    if (active) return;
    active = true;
    updateButton();
    gsap.fromTo(toggleButton, { scale: 0.96 }, { scale: 1, duration: 0.24, ease: 'back.out(2)' });
    scheduleAdvance();
  }

  function stop() {
    if (!active) return;
    active = false;
    clearTimeout(advanceTimer);
    advanceTimer = null;
    updateButton();
  }

  toggleButton?.addEventListener('click', () => {
    if (active) stop();
    else start();
  });

  updateButton();

  return { start, stop, isActive: () => active };
}
