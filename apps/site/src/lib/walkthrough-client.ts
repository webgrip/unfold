const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Plays one walkthrough: reveals each event at its recorded offset and ticks the clock. */
export function playWalkthrough(root: HTMLElement): void {
  const duration = Number(root.dataset['duration'] ?? '0');
  const clock = root.querySelector<HTMLElement>('[data-walk-clock]');
  const button = root.querySelector<HTMLButtonElement>('[data-walk-play]');
  const label = root.querySelector<HTMLElement>('[data-walk-play-label]');
  const steps = [...root.querySelectorAll<HTMLElement>('[data-at]')].map((element) => ({
    element,
    at: Number(element.dataset['at'] ?? '0'),
  }));
  const format = new Intl.NumberFormat(document.documentElement.lang, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  for (const step of steps) step.element.classList.remove('is-on');
  root.dataset['walkState'] = 'playing';
  if (button) button.disabled = true;
  const lead = 400;
  const started = performance.now();
  const frame = (now: number) => {
    const elapsed = Math.max(0, now - started - lead);
    for (const step of steps) if (step.at <= elapsed) step.element.classList.add('is-on');
    if (clock) clock.textContent = format.format(Math.min(elapsed, duration) / 1000);
    if (elapsed < duration) {
      requestAnimationFrame(frame);
      return;
    }
    root.dataset['walkState'] = 'done';
    if (button) button.disabled = false;
    if (label) label.textContent = root.dataset['labelReplay'] ?? '';
  };
  requestAnimationFrame(frame);
}

/** Arms every walkthrough on the page; it plays once on first view and again from its button. */
export function initWalkthroughs(): void {
  for (const root of document.querySelectorAll<HTMLElement>('[data-walkthrough]')) {
    const button = root.querySelector<HTMLButtonElement>('[data-walk-play]');
    if (!button) continue;
    button.hidden = false;
    button.addEventListener('click', () => playWalkthrough(root));
    if (reducedMotion() || !('IntersectionObserver' in window)) continue;
    root.dataset['walkState'] = 'armed';
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        playWalkthrough(root);
      },
      { threshold: 0.35 },
    );
    observer.observe(root);
  }
}
