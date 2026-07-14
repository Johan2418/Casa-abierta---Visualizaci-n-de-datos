export function isQuizMobileRoute() {
  return /^#\/quiz\/[^/?]+/.test(window.location.hash);
}
