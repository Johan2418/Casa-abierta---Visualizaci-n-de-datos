import { gsap } from 'gsap';
import { isReducedMotion } from './deckMotion.js';

const PARTICLE_COUNT = 44;
const FRAME_INTERVAL_MS = 33; // ~30 fps: suficiente para partículas que derivan lento

/**
 * Fondo vivo: dos orbes de gradiente + un canvas de partículas que derivan
 * lentamente y reaccionan con parallax al slide activo y al mouse.
 */
export function createAmbientBackground(root) {
  const layer = root.querySelector('.ambient-layer');
  if (!layer) return;

  const canvas = layer.querySelector('canvas');
  const orbA = layer.querySelector('.orb-a');
  const orbB = layer.querySelector('.orb-b');
  const ctx = canvas.getContext('2d');

  let width = 0;
  let height = 0;
  let dpr = 1;

  const offset = { x: 0, y: 0 };
  const mouse = { x: 0, y: 0 };

  const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: 0.6 + Math.random() * 1.9,
    depth: 0.35 + Math.random() * 0.65,
    vx: (Math.random() - 0.5) * 0.00016,
    vy: (Math.random() - 0.5) * 0.00012,
    alpha: 0.14 + Math.random() * 0.3,
    accent: Math.random() < 0.24
  }));

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = layer.clientWidth;
    height = layer.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  let accent = '#79e28b';
  let frameCount = 0;
  let lastDraw = 0;

  function refreshAccent() {
    accent = getComputedStyle(root).getPropertyValue('--accent').trim() || '#79e28b';
  }

  function draw() {
    // Throttle a ~30 fps y lectura de estilos solo ~1 vez por segundo:
    // getComputedStyle por frame fuerza recálculo de estilos constante.
    const now = performance.now();
    if (now - lastDraw < FRAME_INTERVAL_MS) return;
    lastDraw = now;
    frameCount += 1;
    if (frameCount % 30 === 1) refreshAccent();

    ctx.clearRect(0, 0, width, height);

    particles.forEach((p) => {
      p.x = (p.x + p.vx + 1) % 1;
      p.y = (p.y + p.vy + 1) % 1;
      const px = p.x * width + (offset.x + mouse.x) * p.depth;
      const py = p.y * height + (offset.y + mouse.y) * p.depth;
      ctx.beginPath();
      ctx.arc(px, py, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.accent ? accent : '#ffffff';
      ctx.globalAlpha = p.alpha;
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  resize();
  window.addEventListener('resize', resize);

  if (isReducedMotion()) {
    draw();
    return;
  }

  gsap.ticker.add(draw);

  // quickTo reutiliza un único tween por propiedad: mucho más barato que
  // crear tweens nuevos en cada mousemove.
  const mouseX = gsap.quickTo(mouse, 'x', { duration: 1.4, ease: 'power2.out' });
  const mouseY = gsap.quickTo(mouse, 'y', { duration: 1.4, ease: 'power2.out' });
  const orbAX = gsap.quickTo(orbA, 'x', { duration: 2.2, ease: 'power2.out' });
  const orbAY = gsap.quickTo(orbA, 'y', { duration: 2.2, ease: 'power2.out' });
  const orbBX = gsap.quickTo(orbB, 'x', { duration: 2.2, ease: 'power2.out' });
  const orbBY = gsap.quickTo(orbB, 'y', { duration: 2.2, ease: 'power2.out' });

  window.addEventListener('pointermove', (event) => {
    const nx = event.clientX / window.innerWidth - 0.5;
    const ny = event.clientY / window.innerHeight - 0.5;
    mouseX(nx * 26);
    mouseY(ny * 18);
    orbAX(nx * 24);
    orbAY(ny * -18);
    orbBX(nx * -34);
    orbBY(ny * 26);
  });

  window.addEventListener('deck:change', (event) => {
    const { index } = event.detail;
    gsap.to(offset, { x: index * -34, duration: 1.2, ease: 'power3.out', overwrite: true });
    gsap.to(layer.querySelector('.ambient-grid'), {
      backgroundPositionX: `${index * -22}px`,
      duration: 1.2,
      ease: 'power3.out',
      overwrite: true
    });
  });

  // Respiración lenta de los orbes para que el fondo nunca esté quieto.
  gsap.to(orbA, { scale: 1.14, duration: 7, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  gsap.to(orbB, { scale: 0.88, duration: 9, yoyo: true, repeat: -1, ease: 'sine.inOut' });
}
