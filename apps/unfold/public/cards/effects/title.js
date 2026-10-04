/**
 * The cinematic title layer: one element in the page, hidden from assistive technology because the view announces
 * the same words, that shows a moment's title over its card. Full motion scales it in with a short chromatic split;
 * calm crossfades it. A takeover centres it on the page between letterbox bars. It never takes focus or the pointer,
 * and it draws within the CSP: classes, data attributes and custom properties set through the CSSOM.
 */
export class CinematicTitle {
  constructor() {
    this.element = null;
    this.timer = 0;
  }

  ensure() {
    if (this.element?.isConnected) return this.element;
    if (!globalThis.document?.body) return null;
    const element = document.createElement('div');
    element.className = 'fx-title';
    element.setAttribute('aria-hidden', 'true');
    element.hidden = true;
    for (const name of ['bar top', 'bar bottom']) { const bar = document.createElement('span'); bar.className = `fx-title-${name}`; element.append(bar); }
    const text = document.createElement('div');
    text.className = 'fx-title-text';
    for (const part of ['kicker', 'main', 'sub', 'count']) { const span = document.createElement(part === 'main' ? 'b' : 'span'); span.className = `fx-title-${part}`; text.append(span); }
    element.append(text);
    document.body.append(element);
    this.element = element;
    return element;
  }

  /**
   * Shows a title for `hold` milliseconds.
   * @param {{ kicker?: string, main: string, sub?: string, tone?: string, mode?: 'full' | 'calm', tier?: string, hold?: number, banner?: boolean, rect?: DOMRect | null, count?: number }} title
   */
  show({ kicker = '', main, sub = '', tone = 'gold', mode = 'full', tier = 'major', hold = 1200, banner = false, rect = null, count = 1 }) {
    const element = this.ensure();
    if (!element) return;
    clearTimeout(this.timer);
    element.querySelector('.fx-title-kicker').textContent = kicker;
    const headline = element.querySelector('.fx-title-main');
    headline.textContent = main;
    headline.dataset.text = main;
    element.querySelector('.fx-title-sub').textContent = sub;
    this.count(count);
    element.dataset.tone = tone;
    element.dataset.mode = mode;
    element.dataset.tier = tier;
    element.dataset.banner = banner ? 'true' : 'false';
    const anchor = rect && !banner ? { x: rect.left + rect.width / 2, y: Math.max(56, rect.top + Math.min(rect.height * 0.32, 160)) } : { x: innerWidth / 2, y: innerHeight * 0.18 };
    element.style.setProperty('--fx-x', `${Math.round(anchor.x)}px`);
    element.style.setProperty('--fx-y', `${Math.round(anchor.y)}px`);
    element.style.setProperty('--fx-hold', `${Math.max(300, Math.round(hold))}ms`);
    element.hidden = false;
    delete element.dataset.state;
    void element.offsetWidth;
    element.dataset.state = 'in';
    this.shown = (this.shown ?? 0) + 1;
    element.dataset.shown = String(this.shown);
    this.timer = setTimeout(() => this.hide(), Math.max(300, hold) + 120);
  }

  /** Shows how many of the same moment the ceremony stands for: "× 3". */
  count(count) {
    const element = this.element;
    if (!element) return;
    element.querySelector('.fx-title-count').textContent = count > 1 ? `× ${count}` : '';
  }

  /** Hides the title at once. */
  hide() {
    clearTimeout(this.timer);
    if (!this.element) return;
    this.element.dataset.state = 'out';
    this.element.hidden = true;
  }

  /** The words showing now, for tests and screenshots. */
  get text() { return this.element && !this.element.hidden ? this.element.querySelector('.fx-title-text').textContent : ''; }
}
