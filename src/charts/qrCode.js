import qrcode from 'qrcode-generator';
import { gsap } from 'gsap';
import { motionDuration } from '../animation/deckMotion.js';

// Se genera 100% local (sin llamadas de red): qrcode-generator dibuja el SVG
// a partir de la URL, ideal para un stand sin conexión garantizada.
export function renderQrCode(container, url, content = {}) {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const svgMarkup = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });

  container.innerHTML = `
    <div class="qr-card">
      <div class="qr-art">${svgMarkup}</div>
      <div class="qr-copy">
        <span>${content.eyebrow ?? 'Explora la fuente'}</span>
        <strong>${content.title ?? 'Escanea para ver los datos originales'}</strong>
        <p>${content.urlLabel ?? url}</p>
      </div>
    </div>
  `;

  const card = container.querySelector('.qr-card');
  const art = container.querySelector('.qr-art');
  const copy = container.querySelector('.qr-copy');

  gsap.set(card, { autoAlpha: 0 });
  gsap.set(art, { scale: 0.85, rotate: -4 });
  gsap.set(copy, { x: 20 });

  function play() {
    gsap.set(card, { autoAlpha: 1 });
    gsap
      .timeline({ defaults: { ease: 'power3.out' } })
      .fromTo(art, { scale: 0.7, autoAlpha: 0, rotate: -6 }, { scale: 1, autoAlpha: 1, rotate: 0, duration: motionDuration(0.7) })
      .fromTo(copy, { autoAlpha: 0, x: 24 }, { autoAlpha: 1, x: 0, duration: motionDuration(0.6) }, 0.15);
  }

  function reset() {
    gsap.set(card, { autoAlpha: 0 });
  }

  return { play, reset };
}
