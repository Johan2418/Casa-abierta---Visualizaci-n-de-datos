import { gsap } from 'gsap';
import { motionDuration } from '../animation/deckMotion.js';

const THEMES = {
  green: { accent: '#79e28b', accent2: '#f4c95d' },
  gold: { accent: '#f4c95d', accent2: '#79e28b' },
  cyan: { accent: '#28d6ba', accent2: '#f4c95d' },
  blue: { accent: '#34a4ff', accent2: '#79e28b' },
  violet: { accent: '#b38cff', accent2: '#28d6ba' }
};

export function createHorizontalDeck({ root, track, progress, counter, prevButton, nextButton, dots }) {
  const slides = [...track.querySelectorAll('.slide')];
  let index = 0;
  let startX = null;
  let navigationSuspendedUntil = 0;
  let wheelLockedUntil = 0;
  let route = null;

  const themeState = { ...THEMES[slides[0]?.dataset.theme ?? 'green'] };

  function applyTheme(themeName, animate) {
    const target = THEMES[themeName] ?? THEMES.green;
    gsap.to(themeState, {
      accent: target.accent,
      accent2: target.accent2,
      duration: animate ? motionDuration(0.9) : 0,
      ease: 'power2.inOut',
      overwrite: true,
      onUpdate: () => {
        root.style.setProperty('--accent', themeState.accent);
        root.style.setProperty('--accent-2', themeState.accent2);
      }
    });
  }

  function isInteractiveTarget(target) {
    return Boolean(
      target?.closest?.(
        'button, input, select, textarea, option, label, a, [role="button"], [data-deck-ignore]'
      )
    );
  }

  function isDeckControl(target) {
    return Boolean(target?.closest?.('.nav-arrow, .dot'));
  }

  // Solo estos elementos le dan un significado propio a las flechas
  // (mover el cursor de texto, abrir un select, deslizar un range). Un
  // <button> no lo necesita: si se incluyera aquí, hacer clic en cualquier
  // botón (flecha, play, fullscreen) dejaría "atrapado" el foco y las
  // flechas del teclado dejarían de avanzar salas hasta que algo más
  // recibiera el foco.
  function isArrowSensitiveTarget(target) {
    return Boolean(target?.closest?.('input, select, textarea, [contenteditable="true"]'));
  }

  function suspendNavigation(duration = 900) {
    navigationSuspendedUntil = Math.max(navigationSuspendedUntil, performance.now() + duration);
    startX = null;
  }

  function isNavigationSuspended() {
    return performance.now() < navigationSuspendedUntil;
  }

  function update(prevIndex = null) {
    const direction = prevIndex === null ? 1 : Math.sign(index - prevIndex) || 1;

    // Desaparca de inmediato el destino y sus vecinos; el resto se oculta al
    // terminar la transición para que el track pinte lo mínimo posible.
    slides.forEach((slide, slideIndex) => {
      if (Math.abs(slideIndex - index) <= 1) slide.classList.remove('is-parked');
    });

    gsap.to(track, {
      xPercent: -100 * index,
      duration: motionDuration(0.85),
      ease: 'power3.inOut',
      onComplete: () => {
        slides.forEach((slide, slideIndex) => {
          slide.classList.toggle('is-parked', Math.abs(slideIndex - index) > 1);
        });
      }
    });

    slides.forEach((slide, slideIndex) => {
      slide.classList.toggle('is-active', slideIndex === index);
      slide.setAttribute('aria-hidden', slideIndex === index ? 'false' : 'true');
    });

    dots.forEach((dot, dotIndex) => {
      dot.classList.toggle('is-active', dotIndex === index);
      dot.setAttribute('aria-current', dotIndex === index ? 'step' : 'false');
    });

    if (counter) {
      counter.textContent = `${String(index + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`;
    }
    progress.style.setProperty('--progress', `${((index + 1) / slides.length) * 100}%`);
    const routePosition = route ? route.indexOf(index) : index;
    const routeLength = route ? route.length : slides.length;
    prevButton.disabled = routePosition <= 0;
    nextButton.disabled = routePosition >= routeLength - 1;
    root.dataset.theme = slides[index].dataset.theme ?? 'green';
    applyTheme(slides[index].dataset.theme ?? 'green', prevIndex !== null);

    window.dispatchEvent(new CustomEvent('deck:change', { detail: { index, prevIndex, direction } }));
  }

  function goTo(nextIndex) {
    const clamped = Math.max(0, Math.min(slides.length - 1, nextIndex));
    if (clamped === index) return;
    const prevIndex = index;
    index = clamped;
    update(prevIndex);
  }

  function next() {
    if (!route) return goTo(index + 1);
    const position = route.indexOf(index);
    goTo(route[Math.min(route.length - 1, Math.max(0, position + 1))]);
  }

  function prev() {
    if (!route) return goTo(index - 1);
    const position = route.indexOf(index);
    goTo(route[Math.max(0, position - 1)]);
  }

  prevButton.addEventListener('click', prev);
  nextButton.addEventListener('click', next);
  dots.forEach((dot, dotIndex) => dot.addEventListener('click', () => goTo(dotIndex)));

  root.addEventListener(
    'focusin',
    (event) => {
      if (isDeckControl(event.target)) return;
      if (isInteractiveTarget(event.target)) suspendNavigation(1200);
    },
    true
  );

  // Solo se suspende la navegación por swipe/teclado; no se detiene la
  // propagación para que botones, selects y barras dentro de los slides
  // reciban sus propios eventos.
  root.addEventListener(
    'change',
    (event) => {
      if (isDeckControl(event.target)) return;
      if (!isInteractiveTarget(event.target)) return;
      suspendNavigation(1200);
    },
    true
  );

  root.addEventListener(
    'pointerdown',
    (event) => {
      if (isDeckControl(event.target)) return;
      if (!isInteractiveTarget(event.target)) return;
      suspendNavigation(1200);
    },
    true
  );

  root.addEventListener(
    'click',
    (event) => {
      if (isDeckControl(event.target)) return;
      if (!isInteractiveTarget(event.target)) return;
      suspendNavigation(900);
    },
    true
  );

  window.addEventListener('keydown', (event) => {
    if (isNavigationSuspended()) return;
    if (isArrowSensitiveTarget(event.target) || isArrowSensitiveTarget(document.activeElement)) return;
    if (event.key === 'ArrowRight') next();
    if (event.key === 'ArrowLeft') prev();
  });

  window.addEventListener(
    'wheel',
    (event) => {
      if (isNavigationSuspended()) return;
      if (event.target?.closest?.('select, .inspector, .explorer-shell, [data-deck-ignore]')) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (Math.abs(delta) < 24) return;
      const now = performance.now();
      if (now < wheelLockedUntil) return;
      wheelLockedUntil = now + 1100;
      if (delta > 0) next();
      else prev();
    },
    { passive: true }
  );

  track.addEventListener('pointerdown', (event) => {
    if (isNavigationSuspended()) return;
    if (isInteractiveTarget(event.target)) {
      suspendNavigation(1200);
      return;
    }
    startX = event.clientX;
  });

  track.addEventListener('pointerup', (event) => {
    if (isNavigationSuspended()) return;
    if (startX === null || isInteractiveTarget(event.target)) return;
    const delta = event.clientX - startX;
    startX = null;
    if (Math.abs(delta) < 70) return;
    if (delta < 0) next();
    if (delta > 0) prev();
  });

  update();

  function setRoute(nextRoute) {
    route = Array.isArray(nextRoute) && nextRoute.length ? [...new Set(nextRoute)].filter((item) => item >= 0 && item < slides.length) : null;
    if (route && !route.includes(index)) goTo(route[0]);
    else update();
  }

  return { goTo, next, prev, setRoute, getIndex: () => index, getSlideCount: () => slides.length };
}
