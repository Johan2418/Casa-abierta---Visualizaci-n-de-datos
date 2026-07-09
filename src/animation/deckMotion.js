import { gsap } from 'gsap';

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function motionDuration(base) {
  return REDUCED_MOTION ? 0.01 : base;
}

export function isReducedMotion() {
  return REDUCED_MOTION;
}

/**
 * Orquesta la coreografía de entrada/salida de cada slide del deck horizontal:
 * revelado de la copy (número, título por palabras, subtítulo, chip) y la
 * animación de construcción del chart registrado para esa sección.
 */
export function createDeckMotion() {
  const chartHandles = new Map();
  let slides = [];
  let started = false;
  let activeTimeline = null;

  function registerChart(id, handle) {
    if (!handle) return;
    chartHandles.set(id, handle);
  }

  function copyTargets(slide) {
    return {
      number: slide.querySelector('.section-number'),
      words: slide.querySelectorAll('h1 .word-inner'),
      subtitle: slide.querySelector('.subtitle'),
      body: slide.querySelector('.body'),
      chip: slide.querySelector('.insight-chip'),
      stage: slide.querySelector('.slide-stage')
    };
  }

  function hideCopy(slide) {
    const t = copyTargets(slide);
    if (t.number) gsap.set(t.number, { autoAlpha: 0, y: 22 });
    if (t.words.length) gsap.set(t.words, { yPercent: 115 });
    if (t.subtitle) gsap.set(t.subtitle, { autoAlpha: 0, y: 26 });
    if (t.body) gsap.set(t.body, { autoAlpha: 0, y: 26 });
    if (t.chip) gsap.set(t.chip, { autoAlpha: 0, y: 14, scale: 0.92 });
    if (t.stage) gsap.set(t.stage, { autoAlpha: 0 });
  }

  function resetSlide(slide) {
    hideCopy(slide);
    const handle = chartHandles.get(slide.dataset.section);
    handle?.reset?.();
  }

  function enterSlide(slide, direction = 1) {
    const t = copyTargets(slide);
    const handle = chartHandles.get(slide.dataset.section);

    activeTimeline?.kill();
    const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
    activeTimeline = tl;

    if (REDUCED_MOTION) {
      if (t.number) tl.set(t.number, { autoAlpha: 1, y: 0 });
      if (t.words.length) tl.set(t.words, { yPercent: 0 });
      if (t.subtitle) tl.set(t.subtitle, { autoAlpha: 1, y: 0 });
      if (t.body) tl.set(t.body, { autoAlpha: 1, y: 0 });
      if (t.chip) tl.set(t.chip, { autoAlpha: 1, y: 0, scale: 1 });
      if (t.stage) tl.set(t.stage, { autoAlpha: 1, x: 0, scale: 1 });
      handle?.play?.();
      return;
    }

    if (t.number) {
      tl.fromTo(t.number, { autoAlpha: 0, y: 22 }, { autoAlpha: 1, y: 0, duration: 0.5 }, 0.05);
    }
    if (t.words.length) {
      tl.fromTo(
        t.words,
        { yPercent: 115 },
        { yPercent: 0, duration: 0.9, stagger: 0.055 },
        0.12
      );
    }
    if (t.subtitle) {
      tl.fromTo(t.subtitle, { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, duration: 0.7 }, 0.38);
    }
    if (t.body) {
      tl.fromTo(t.body, { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, duration: 0.7 }, 0.48);
    }
    if (t.chip) {
      tl.fromTo(
        t.chip,
        { autoAlpha: 0, y: 14, scale: 0.92 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.55, ease: 'back.out(2)' },
        0.58
      );
    }
    if (t.stage) {
      // El stage entra con más recorrido que la copy: sensación de profundidad.
      tl.fromTo(
        t.stage,
        { autoAlpha: 0, x: 90 * direction, scale: 0.965 },
        { autoAlpha: 1, x: 0, scale: 1, duration: 0.85, ease: 'power3.out' },
        0.22
      );
    }

    tl.add(() => handle?.play?.(), 0.5);
  }

  function onDeckChange(event) {
    if (!started) return;
    const { index, prevIndex, direction } = event.detail;
    if (prevIndex !== null && prevIndex !== undefined && slides[prevIndex]) {
      resetSlide(slides[prevIndex]);
    }
    if (slides[index]) enterSlide(slides[index], direction ?? 1);
  }

  function init(slideElements) {
    slides = slideElements;
    slides.forEach(hideCopy);
    window.addEventListener('deck:change', onDeckChange);
  }

  function start(initialIndex = 0) {
    started = true;
    if (slides[initialIndex]) enterSlide(slides[initialIndex], 1);
  }

  /** Re-dispara el chart activo (p. ej. tras un re-render por resize). */
  function replayChart(id) {
    chartHandles.get(id)?.play?.();
  }

  return { init, start, registerChart, replayChart };
}
