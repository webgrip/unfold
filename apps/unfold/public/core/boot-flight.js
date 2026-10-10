import { loopMark, prefersStill } from './motion.js';

const longestHold = 2500;
const lifting = 200;

/**
 * Keeps the loading screen's mark flying until the application has replaced the loading screen and the flight in
 * progress has landed, so every load shows at least one whole flight. A copy of the loading screen covers the page
 * meanwhile; it is inert and hidden from assistive technology, so the application underneath is usable at once. It
 * lifts after `longestHold` milliseconds at the latest. With reduced motion, or once the application has already
 * replaced the loading screen, nothing is copied.
 * @param {Element | null} boot
 */
export function flyWhileLoading(boot) {
  if (!boot?.isConnected || prefersStill()) return;
  const curtain = document.createElement('div');
  curtain.className = 'boot boot-curtain';
  curtain.setAttribute('aria-hidden', 'true');
  curtain.inert = true;
  curtain.innerHTML = boot.innerHTML;
  document.body.append(curtain);
  const loop = loopMark(curtain.querySelector('.brand-ink'), curtain.querySelector('.brand-fold'));
  const lift = () => {
    curtain.classList.add('is-lifting');
    setTimeout(() => curtain.remove(), lifting);
  };
  const watch = new MutationObserver(() => {
    if (boot.isConnected) return;
    watch.disconnect();
    Promise.race([loop.land(), new Promise((done) => setTimeout(done, longestHold))]).then(lift);
  });
  watch.observe(boot.parentNode, { childList: true });
}
