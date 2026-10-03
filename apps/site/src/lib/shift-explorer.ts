/** Enhances the recorded Shift with direct stage selection and pausable playback. */
export function initShiftExplorers(): void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  for (const root of document.querySelectorAll<HTMLElement>('[data-explorer]')) {
    const links = [...root.querySelectorAll<HTMLAnchorElement>('[data-stage-control]')];
    const panels = [...root.querySelectorAll<HTMLElement>('[data-stage-panel]')];
    const play = root.querySelector<HTMLButtonElement>('[data-shift-play]');
    const announcement = root.querySelector<HTMLElement>('[data-shift-announcement]');
    if (!play || panels.length !== links.length || panels.length === 0) continue;
    let current = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let playing = false;
    let remaining = 0;
    let deadline = 0;
    const durationAt = (index: number) =>
      Math.max(
        1600,
        Number(panels[index + 1]?.dataset['at'] ?? 0) - Number(panels[index]?.dataset['at'] ?? 0),
      );
    const updateLabel = () => {
      play.textContent =
        root.dataset[playing ? 'pause' : current === panels.length - 1 ? 'replay' : 'play'] ?? '';
    };
    const stop = () => {
      if (playing) remaining = Math.max(0, deadline - performance.now());
      clearTimeout(timer);
      playing = false;
      updateLabel();
    };
    const select = (index: number, announce: boolean) => {
      current = index;
      panels.forEach((panel, i) => {
        panel.hidden = i !== index;
      });
      links.forEach((link, i) => {
        if (i === index) link.setAttribute('aria-current', 'step');
        else link.removeAttribute('aria-current');
      });
      if (announce && announcement)
        announcement.textContent =
          index === panels.length - 1
            ? (root.dataset['complete'] ?? '')
            : (panels[index]?.querySelector('h3')?.textContent ?? '');
      updateLabel();
    };
    const schedule = () => {
      if (current >= panels.length - 1) {
        stop();
        return;
      }
      const delay = remaining || durationAt(current);
      deadline = performance.now() + delay;
      timer = setTimeout(() => {
        remaining = 0;
        select(current + 1, true);
        schedule();
      }, delay);
    };
    links.forEach((link, index) => {
      link.addEventListener('click', (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        stop();
        remaining = 0;
        select(index, true);
        window.history.replaceState(null, '', link.hash);
      });
      link.addEventListener('keydown', (event) => {
        const next =
          event.key === 'ArrowRight'
            ? (index + 1) % links.length
            : event.key === 'ArrowLeft'
              ? (index + links.length - 1) % links.length
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? links.length - 1
                  : null;
        if (next === null) return;
        event.preventDefault();
        stop();
        remaining = 0;
        select(next, true);
        links[next]?.focus();
        window.history.replaceState(null, '', links[next]?.hash ?? '');
      });
    });
    play.addEventListener('click', () => {
      if (playing) {
        stop();
        return;
      }
      if (reduced.matches) {
        select((current + 1) % panels.length, true);
        return;
      }
      if (current === panels.length - 1) {
        select(0, false);
        remaining = 0;
      }
      playing = true;
      updateLabel();
      schedule();
    });
    reduced.addEventListener('change', stop);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop();
    });
    root.dataset['enhanced'] = 'true';
    play.hidden = reduced.matches;
    reduced.addEventListener('change', () => {
      play.hidden = reduced.matches;
    });
    panels.forEach((panel) => panel.addEventListener('focusin', stop));
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) stop();
      }).observe(root);
    }
    const selectFragment = () => {
      const index = panels.findIndex((panel) => `#${panel.id}` === window.location.hash);
      if (index !== -1) {
        stop();
        remaining = 0;
        select(index, false);
      }
    };
    const initialIndex = panels.findIndex((panel) => `#${panel.id}` === window.location.hash);
    select(initialIndex >= 0 ? initialIndex : 0, false);
    window.addEventListener('hashchange', selectFragment);
  }
}
