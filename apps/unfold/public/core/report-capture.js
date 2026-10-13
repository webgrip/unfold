export const consoleLimit = 50;
export const consoleWindowMs = 10 * 60_000;
export const requestLimit = 20;
export const trailLimit = 8;
export const privateBlurPx = 6;

const consoleEntries = [];
const requestEntries = [];
const trailEntries = [];

function summary(value) {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[array of ${value.length}]`;
  return `[${value?.constructor?.name || typeof value}]`;
}

function sourcePath(value) {
  if (typeof value !== 'string' || !value) return undefined;
  try { const url = new URL(value, location.href); return url.origin === location.origin ? url.pathname : `${url.origin}${url.pathname}`; } catch { return undefined; }
}

/**
 * Keeps one console entry: its level, a message in which objects are named by their type and never serialised, the
 * source path without query and the line. The buffer holds the last 50 entries of the last ten minutes.
 * @param {{ level: 'error' | 'warn', args?: unknown[], message?: string, source?: string, line?: number, at?: number }} entry
 */
export function rememberConsole({ level, args = [], message, source, line, at = Date.now() }) {
  const text = (message ?? args.map(summary).join(' ')).slice(0, 500);
  if (!text) return;
  consoleEntries.push({ level, message: text, ...(sourcePath(source) ? { source: sourcePath(source) } : {}), ...(Number.isSafeInteger(line) ? { line } : {}), at });
  if (consoleEntries.length > consoleLimit) consoleEntries.splice(0, consoleEntries.length - consoleLimit);
}

/**
 * Keeps one failed request: method, path without its query string, status, duration and time. Never a header or body.
 * @param {{ method?: string, url: string, status?: number, durationMs?: number, at?: number }} entry
 */
export function rememberRequest({ method = 'GET', url, status, durationMs, at = Date.now() }) {
  let path;
  try { path = new URL(url, location.href).pathname; } catch { return; }
  requestEntries.push({ method: String(method).toUpperCase(), path, ...(Number.isSafeInteger(status) ? { status } : {}), ...(Number.isFinite(durationMs) ? { durationMs: Math.round(durationMs) } : {}), at });
  if (requestEntries.length > requestLimit) requestEntries.splice(0, requestEntries.length - requestLimit);
}

/**
 * Keeps one page the person went to: the address hash without its query, so a report can say how they got there.
 * A repeat of the last page is not kept twice. The trail holds the last eight pages.
 * @param {string} hash
 */
export function rememberRoute(hash, at = Date.now()) {
  const route = (String(hash || '#now').split('?')[0] || '#now').slice(0, 120);
  if (!route.startsWith('#') || trailEntries.at(-1)?.route === route) return;
  trailEntries.push({ route, at });
  if (trailEntries.length > trailLimit) trailEntries.splice(0, trailEntries.length - trailLimit);
}

/** The console entries of the last ten minutes, the failed requests and the pages visited, with times as ISO strings. */
export function buffers(now = Date.now()) {
  const iso = entry => ({ ...entry, at: new Date(entry.at).toISOString() });
  return { console: consoleEntries.filter(entry => now - entry.at <= consoleWindowMs).map(iso), requests: requestEntries.map(iso), trail: trailEntries.map(entry => entry.route) };
}

/** Empties the buffers, for tests. */
export function clearBuffers() {
  consoleEntries.length = 0;
  requestEntries.length = 0;
  trailEntries.length = 0;
}

/**
 * Starts keeping console errors and warnings, uncaught errors, unhandled rejections and the pages visited in the page's memory. Nothing
 * leaves the page until the person files a report, and a reload forgets everything.
 * @param {Window} target
 */
export function startCapture(target = window) {
  for (const level of ['error', 'warn']) {
    const original = target.console[level].bind(target.console);
    target.console[level] = (...args) => { try { rememberConsole({ level, args }); } catch {} original(...args); };
  }
  target.addEventListener('error', event => rememberConsole({ level: 'error', message: event.message || summary(event.error), source: event.filename, line: event.lineno }));
  target.addEventListener('unhandledrejection', event => rememberConsole({ level: 'error', message: `Unhandled rejection: ${summary(event.reason)}` }));
  rememberRoute(target.location.hash);
  target.addEventListener('hashchange', () => rememberRoute(target.location.hash));
}

/**
 * A short browser name for the report, from the user-agent brands when the browser offers them.
 * @returns {string}
 */
export function browserName() {
  const brands = navigator.userAgentData?.brands?.filter(brand => !/not.?a.?brand|chromium/i.test(brand.brand)) ?? [];
  const platform = navigator.userAgentData?.platform;
  if (brands.length) return `${brands[0].brand} ${brands[0].version}${platform ? ` on ${platform}` : ''}`.slice(0, 120);
  const match = /(Firefox|Edg|Chrome|Safari)\/(\d+)/.exec(navigator.userAgent);
  return (match ? `${match[1] === 'Edg' ? 'Edge' : match[1]} ${match[2]}` : 'Unknown browser').slice(0, 120);
}

/** Converts one fetched file to a data URL. */
async function dataUrl(href) {
  const blob = await (await fetch(href, { credentials: 'same-origin' })).blob();
  return await new Promise((done, fail) => { const reader = new FileReader(); reader.onload = () => done(reader.result); reader.onerror = fail; reader.readAsDataURL(blob); });
}

let fontCss;
/**
 * The page's own @font-face rules with each font inlined as a data URL. html-to-image would otherwise resolve the
 * relative font URLs by setting a document base URI, which `base-uri 'none'` refuses.
 * @returns {Promise<string>}
 */
export function embeddedFonts() {
  fontCss ??= (async () => {
    let css = '';
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = [...sheet.cssRules]; } catch { continue; }
      for (const rule of rules) {
        if (!(rule instanceof CSSFontFaceRule)) continue;
        const match = /url\(["']?([^"')]+)["']?\)/.exec(rule.cssText);
        if (!match || match[1].startsWith('data:')) { css += rule.cssText; continue; }
        try { css += rule.cssText.replace(match[0], `url(${await dataUrl(new URL(match[1], sheet.href || location.href).href)})`); } catch {}
      }
    }
    return css;
  })();
  return fontCss;
}

function positioned(element) {
  return getComputedStyle(element).position;
}

/**
 * Marks what the screenshot must move so it shows what the person sees. html-to-image lays the copy out unscrolled,
 * so one walk from the body carries the scroll offset still to undo (the window's, then each scrolled container's)
 * down to the first elements that can take it. Fixed elements keep their place. A sticky element is moved from where
 * it would sit unstuck to where it is now, measured by switching it to `position: static` for one synchronous layout.
 * A container that holds a fixed or sticky element is entered rather than moved as a whole.
 * @returns {{ offsets: [number, number][], marked: HTMLElement[] }}
 */
export function scrollShifts(document, exclude) {
  const window = document.defaultView;
  const skipped = element => element === exclude || element.tagName === 'DIALOG' || element.tagName === 'SCRIPT' || element.tagName === 'STYLE';
  const all = [...document.body.querySelectorAll('*')].filter(element => !skipped(element) && !exclude?.contains(element));
  const holdsPinned = new Set();
  const holdsScrolled = new Set();
  for (const element of all) {
    const position = positioned(element);
    const pinned = position === 'fixed' || position === 'sticky';
    const scrolled = element.scrollTop || element.scrollLeft;
    if (!pinned && !scrolled) continue;
    for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      if (pinned) holdsPinned.add(parent);
      if (scrolled) holdsScrolled.add(parent);
    }
  }
  const offsets = [];
  const marked = [];
  const mark = (element, x, y) => {
    if (!x && !y) return;
    element.dataset.reportShift = String(offsets.push([x, y]) - 1);
    marked.push(element);
  };
  const walk = (parent, pendingX, pendingY) => {
    for (const child of parent.children) {
      if (skipped(child)) continue;
      const position = positioned(child);
      if (position === 'fixed') { walk(child, child.scrollLeft, child.scrollTop); continue; }
      if (position === 'sticky') {
        const now = child.getBoundingClientRect();
        child.style.setProperty('position', 'static', 'important');
        const unstuck = child.getBoundingClientRect();
        child.style.removeProperty('position');
        mark(child, unstuck.left + pendingX - now.left, unstuck.top + pendingY - now.top);
        walk(child, child.scrollLeft, child.scrollTop);
        continue;
      }
      if (holdsPinned.has(child)) { walk(child, pendingX + child.scrollLeft, pendingY + child.scrollTop); continue; }
      mark(child, pendingX, pendingY);
      if (child.scrollTop || child.scrollLeft || holdsScrolled.has(child)) walk(child, child.scrollLeft, child.scrollTop);
    }
  };
  walk(document.body, window.scrollX, window.scrollY);
  return { offsets, marked };
}

/**
 * Takes the screenshot: the visible part of the page rasterised by html-to-image from Unfold's own origin, with every
 * `[data-private]` region blurred in the copy, and `exclude` (the report dialog) left out. Other open dialogs stay in,
 * because the problem may be in one. Scrolled content is shifted back for the moment of the copy (see scrollShifts). The blur rule lives in a
 * constructed stylesheet for the moment of the copy only, which the CSP allows. Its rules switch transitions off: with
 * reduced motion every property transitions for 0.01ms, and html-to-image would copy the value a transition starts from.
 * @param {{ exclude?: Element | null }} [options]
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function captureScreen({ exclude = null } = {}) {
  const { toCanvas } = await import('../vendor/html-to-image/index.js');
  const fontEmbedCSS = await embeddedFonts();
  const root = document.documentElement;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  root.style.setProperty('overflow-anchor', 'none');
  let shifts;
  try { shifts = scrollShifts(document, exclude); } finally {
    root.style.removeProperty('overflow-anchor');
    if (window.scrollX !== scrollX || window.scrollY !== scrollY) window.scrollTo(scrollX, scrollY);
  }
  const sheet = new CSSStyleSheet();
  sheet.replaceSync([`[data-private]{filter:blur(${privateBlurPx}px) !important;transition:none !important}`, ...shifts.offsets.map(([x, y], index) => `[data-report-shift="${index}"]{translate:${-x}px ${-y}px !important;transition:none !important}`)].join('\n'));
  const width = document.documentElement.clientWidth;
  const height = document.documentElement.clientHeight;
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  try {
    return await toCanvas(document.body, {
      fontEmbedCSS, pixelRatio: Math.min(2, window.devicePixelRatio || 1), width, height, canvasWidth: width, canvasHeight: height, cacheBust: false,
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      filter: node => node !== exclude && !(node instanceof Element && node.hasAttribute?.('data-report-skip')),
    });
  } finally {
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter(entry => entry !== sheet);
    for (const element of shifts.marked) delete element.dataset.reportShift;
  }
}
