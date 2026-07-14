const JURY_SECTIONS = ['hero', 'numbers', 'map', 'profile', 'diversity', 'conclusions', 'quiz'];

export function createJuryMode({ deck, toggleButton, sections, autoAdvance }) {
  if (!toggleButton) return { isActive: () => false };
  const route = JURY_SECTIONS.map((id) => sections.findIndex((section) => section.id === id)).filter((index) => index >= 0);
  const meta = document.querySelector('.topbar-meta');
  const initialMeta = meta?.textContent ?? '';
  let active = false;

  function render() {
    toggleButton.classList.toggle('is-active', active);
    toggleButton.setAttribute('aria-pressed', String(active));
    toggleButton.setAttribute('aria-label', active ? 'Salir de modo jurado' : 'Activar modo jurado');
    toggleButton.querySelector('span:last-child').textContent = active ? 'Demo jurado · 5 min' : 'Modo jurado';
    if (meta) meta.textContent = active ? 'Recorrido guiado · flechas para avanzar' : initialMeta;
  }

  function toggle() {
    active = !active;
    autoAdvance?.stop();
    deck.setRoute(active ? route : null);
    if (active) deck.goTo(route[0]);
    render();
  }

  toggleButton.addEventListener('click', toggle);
  render();
  return { isActive: () => active, toggle };
}
