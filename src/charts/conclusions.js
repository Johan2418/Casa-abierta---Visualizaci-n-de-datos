import * as d3 from 'd3';
import { gsap } from 'gsap';
import { fmt, qualityBreakdown } from '../data/aggregateData.js';
import { motionDuration } from '../animation/deckMotion.js';
import { renderQrCode } from './qrCode.js';

export function renderConclusions(container, { summary, provinces, crops, rows }) {
  const topProvince = provinces[0];
  const topCrop = crops[0];
  const diverse = [...provinces].sort((a, b) => (b.diversity ?? 0) - (a.diversity ?? 0))[0];
  const quality = qualityBreakdown(rows)[0];
  const sourceUrl = rows.find((row) => row.url_fuente_estadistica)?.url_fuente_estadistica;

  container.innerHTML = `
    <div class="conclusions-layout">
      <div class="conclusion-grid">
        <article>
          <span>Provincia líder ${summary.latestYear}</span>
          <strong>${topProvince.province}</strong>
          <p><b class="count" data-value="${topProvince.production}" data-format="compact" data-suffix=" t">0</b> registradas.</p>
        </article>
        <article>
          <span>Cultivo estrella</span>
          <strong>${topCrop.crop}</strong>
          <p><b class="count" data-value="${topCrop.production}" data-format="compact" data-suffix=" t">0</b> en el último año disponible.</p>
        </article>
        <article>
          <span>Mayor diversidad</span>
          <strong>${diverse.province}</strong>
          <p>Índice Shannon de <b class="count" data-value="${diverse.diversity}" data-format="decimal">0</b>.</p>
        </article>
        <article>
          <span>Calidad dominante</span>
          <strong>${quality.label}</strong>
          <p><b class="count" data-value="${quality.share * 100}" data-format="pct" data-suffix="%">0</b> de los registros.</p>
        </article>
      </div>
      ${sourceUrl ? '<div class="conclusion-qr" id="conclusionQr"></div>' : ''}
    </div>
  `;

  const tiles = container.querySelectorAll('article');
  const counts = container.querySelectorAll('.count');
  const formats = { compact: fmt.compact, decimal: fmt.decimal, pct: fmt.pct };
  const qrHandle = sourceUrl ? renderQrCode(container.querySelector('#conclusionQr'), sourceUrl) : null;

  function play() {
    gsap.fromTo(
      tiles,
      { autoAlpha: 0, y: 54, scale: 0.94 },
      { autoAlpha: 1, y: 0, scale: 1, duration: motionDuration(0.85), stagger: 0.14, ease: 'power3.out' }
    );

    counts.forEach((node, i) => {
      const target = Number(node.dataset.value);
      const format = formats[node.dataset.format] ?? fmt.number;
      const suffix = node.dataset.suffix ?? '';
      d3.select(node)
        .interrupt()
        .transition()
        .delay(350 + i * 160)
        .duration(motionDuration(1.2) * 1000)
        .tween('text', () => {
          const interpolate = d3.interpolateNumber(0, target);
          return (t) => {
            node.textContent = `${format(interpolate(t))}${suffix}`;
          };
        });
    });

    qrHandle?.play();
  }

  function reset() {
    gsap.set(tiles, { autoAlpha: 0 });
    counts.forEach((node) => {
      d3.select(node).interrupt();
      node.textContent = '0';
    });
    qrHandle?.reset();
  }

  return { play, reset };
}
