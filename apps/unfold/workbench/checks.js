const interactive = 'a[href], button, summary, input, select, textarea, [tabindex]:not([tabindex="-1"])';
const canvas = typeof document === 'undefined' ? null : document.createElement('canvas');
const paint = canvas?.getContext('2d', { willReadFrequently: true });
if (canvas) { canvas.width = 1; canvas.height = 1; }

/** Parses any CSS colour the browser understands into sRGB 0–255 and alpha 0–1. */
export function rgba(color) {
  if (!paint) return null;
  paint.clearRect(0, 0, 1, 1);
  paint.fillStyle = '#000';
  paint.fillStyle = color;
  paint.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = paint.getImageData(0, 0, 1, 1).data;
  return { r, g, b, a: a / 255 };
}

const over = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });

function luminance({ r, g, b }) {
  const channel = value => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** The WCAG contrast ratio of two opaque colours. */
export function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

function backdrop(element) {
  const layers = [];
  for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
    const color = rgba(getComputedStyle(node).backgroundColor);
    if (color && color.a > 0) { layers.push(color); if (color.a >= 1) break; }
  }
  let result = rgba(getComputedStyle(document.documentElement).backgroundColor);
  if (!result || result.a < 1) result = { r: 255, g: 255, b: 255, a: 1 };
  for (const layer of layers.reverse()) result = over(layer, result);
  return result;
}

function selector(element) {
  const parts = [];
  for (let node = element; node && node.nodeType === 1 && parts.length < 3 && node.id !== 'root'; node = node.parentElement) {
    const classes = [...node.classList].filter(name => !name.startsWith('is-')).slice(0, 2).map(name => `.${name}`).join('');
    parts.unshift(`${node.localName}${classes}`);
  }
  return parts.join(' > ');
}

const visible = element => { const box = element.getBoundingClientRect(); const style = getComputedStyle(element); return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'; };
const hiddenText = element => Boolean(element.closest('.sr-only, [hidden]'));
const scrolls = element => { for (let node = element.parentElement; node; node = node.parentElement) { const x = getComputedStyle(node).overflowX; if (x === 'auto' || x === 'scroll') return true; } return false; };
const ownText = element => [...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim());

function name(element) {
  if (element.getAttribute('aria-label')?.trim() || element.getAttribute('aria-labelledby') || element.getAttribute('title')?.trim()) return true;
  if (element.id && document.querySelector(`label[for="${CSS.escape(element.id)}"]`)) return true;
  if (element.closest('label')) return true;
  return Boolean(element.textContent.trim()) || Boolean(element.querySelector('img[alt]:not([alt=""])'));
}

/**
 * Runs every constraint check against the rendered story under `root`. Every story frame runs it after it renders,
 * and `npm run test:workbench` reads the result back from each frame. A failure breaks the check run; a warning is
 * listed but passes. The rules: `page-overflow` the page scrolls sideways; `element-overflow` an element sticks out
 * of the story outside a scroll box; `clipped-text` a box cuts text off without an ellipsis; `target-size` a control
 * is under 24 × 24 px (WCAG 2.2 2.5.8), or under 44 px as a warning; `contrast` text below 4.5:1 (3:1 when large);
 * `name` a control or graphic without an accessible name; `duplicate-id`; `motion` an animation runs under reduced
 * motion; `csp` the page broke its Content Security Policy.
 * @param {Element} root
 * @param {{ cspViolations?: string[] }} [context]
 * @returns {{ failures: { rule: string, detail: string, at: string }[], warnings: { rule: string, detail: string, at: string }[] }}
 */
export function runChecks(root, { cspViolations = [] } = {}) {
  const failures = [];
  const warnings = [];
  const add = (list, rule, element, detail) => { if (list.length < 400 && !list.some(entry => entry.rule === rule && entry.at === (element ? selector(element) : '') && entry.detail === detail)) list.push({ rule, detail, at: element ? selector(element) : '' }); };
  const doc = document.documentElement;
  if (doc.scrollWidth > doc.clientWidth + 1) add(failures, 'page-overflow', null, `page is ${doc.scrollWidth}px wide in a ${doc.clientWidth}px viewport`);
  const edge = root.getBoundingClientRect().right;
  const elements = [...root.querySelectorAll('*')].filter(visible);
  for (const element of elements) {
    if (element.closest('svg') && element.localName !== 'svg') continue;
    const box = element.getBoundingClientRect();
    if (box.right > edge + 1 && !scrolls(element) && !hiddenText(element)) add(failures, 'element-overflow', element, `ends ${Math.round(box.right - edge)}px past the story's edge`);
    const style = getComputedStyle(element);
    if (['hidden', 'clip'].includes(style.overflowX) && style.textOverflow !== 'ellipsis' && element.scrollWidth > element.clientWidth + 1 && ownText(element) && !hiddenText(element)) add(failures, 'clipped-text', element, `text needs ${element.scrollWidth}px, has ${element.clientWidth}px`);
  }
  for (const element of root.querySelectorAll(interactive)) {
    if (!visible(element) || element.closest('[inert]')) continue;
    const box = element.getBoundingClientRect();
    if (box.width < 24 || box.height < 24) add(failures, 'target-size', element, `${Math.round(box.width)}×${Math.round(box.height)}px, under 24×24`);
    else if (box.height < 44 && !element.matches('a.lv-row, summary.lv-move-head, input')) add(warnings, 'target-size', element, `${Math.round(box.height)}px tall, under 44`);
    if (!name(element)) add(failures, 'name', element, 'no accessible name');
  }
  for (const svg of root.querySelectorAll('svg')) {
    if (svg.closest('[aria-hidden="true"]') || svg.getAttribute('aria-hidden') === 'true') continue;
    if (svg.getAttribute('role') !== 'img' || !svg.getAttribute('aria-label')?.trim()) add(failures, 'name', svg, 'graphic without role="img" and an aria-label, and not aria-hidden');
  }
  const texts = [...root.querySelectorAll('*')].filter(element => visible(element) && !hiddenText(element) && (element.localName === 'text' ? element.textContent.trim() : ownText(element) && !element.closest('svg')));
  for (const element of texts) {
    const style = getComputedStyle(element);
    const svgText = element.localName === 'text';
    const ink = rgba(svgText ? style.fill : style.color);
    if (!ink) continue;
    const ground = backdrop(svgText ? element.closest('svg') : element);
    const ratio = contrast(over({ ...ink, a: ink.a * Number(style.opacity || 1) }, ground), ground);
    const size = parseFloat(style.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
    const needed = large ? 3 : 4.5;
    if (ratio < needed) add(failures, 'contrast', element, `${ratio.toFixed(2)}:1, needs ${needed}:1 for “${element.textContent.trim().slice(0, 40)}”`);
  }
  const ids = new Map();
  for (const element of root.querySelectorAll('[id]')) ids.set(element.id, (ids.get(element.id) ?? 0) + 1);
  for (const [id, count] of ids) if (count > 1) add(failures, 'duplicate-id', null, `#${id} appears ${count} times`);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const moving = document.getAnimations().filter(animation => animation.playState === 'running' && Number(animation.effect?.getComputedTiming().duration) > 50);
    if (moving.length) add(failures, 'motion', moving[0].effect?.target ?? null, `${moving.length} animations run under reduced motion`);
  }
  for (const violation of cspViolations) add(failures, 'csp', null, violation);
  return { failures, warnings };
}
