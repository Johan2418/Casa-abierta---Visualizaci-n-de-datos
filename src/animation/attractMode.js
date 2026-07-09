import { gsap } from 'gsap';

const IDLE_MS = 45000;
const SLIDE_MS = 6500;
const EXPLORER_RACE_BUFFER_MS = 3000;

/**
 * Modo kiosco: tras un período de inactividad, recorre las salas solo y
 * dispara la carrera del explorador, para que el stand nunca se vea estático
 * en la casa abierta. Cualquier interacción real lo detiene de inmediato.
 */
export function createAttractMode({ deck, badge, sections, explorerYearCount = 24, playStepMs = 900 }) {
  let idleTimer = null;
  let advanceTimer = null;
  let active = false;

  const explorerDurationMs = explorerYearCount * playStepMs + EXPLORER_RACE_BUFFER_MS;

  function slideDurationFor(index) {
    return sections[index]?.id === 'explorer' ? explorerDurationMs : SLIDE_MS;
  }

  function triggerExplorerRace() {
    const playButton = document.querySelector('#playYears');
    if (playButton && !playButton.classList.contains('is-playing')) {
      playButton.click();
    }
  }

  function showBadge() {
    if (!badge) return;
    gsap.to(badge, { autoAlpha: 1, duration: 0.5, ease: 'power2.out' });
  }

  function hideBadge() {
    if (!badge) return;
    gsap.to(badge, { autoAlpha: 0, duration: 0.35, ease: 'power2.in' });
  }

  function scheduleAdvance() {
    clearTimeout(advanceTimer);
    advanceTimer = setTimeout(() => {
      if (!active) return;
      const index = deck.getIndex();
      if (index >= deck.getSlideCount() - 1) {
        deck.goTo(0);
      } else {
        deck.next();
        if (sections[index + 1]?.id === 'explorer') triggerExplorerRace();
      }
      scheduleAdvance();
    }, slideDurationFor(deck.getIndex()));
  }

  function startAttract() {
    if (active) return;
    active = true;
    document.body.classList.add('is-attract');
    showBadge();
    if (deck.getIndex() !== 0) deck.goTo(0);
    scheduleAdvance();
  }

  function stopAttract() {
    if (!active) return;
    active = false;
    document.body.classList.remove('is-attract');
    hideBadge();
    clearTimeout(advanceTimer);
  }

  function scheduleIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(startAttract, IDLE_MS);
  }

  function onActivity() {
    if (active) stopAttract();
    scheduleIdle();
  }

  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((evt) =>
    window.addEventListener(evt, onActivity, { passive: true })
  );

  scheduleIdle();

  return { stopAttract, isActive: () => active };
}
