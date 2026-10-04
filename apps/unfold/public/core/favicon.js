import { faviconPaths } from './brand.js';

/**
 * The favicon mark on its 64-unit grid, exactly as public/favicon.svg draws it: the Vouwvlieger's ink wing and its
 * fold, from the brand generator. `dot` is the attention dot over the top-right corner, nearly half the icon wide so
 * it still reads at 16 pixels, with a transparent `gap` around it so it stands apart on light and dark tab strips.
 */
export const faviconShape = Object.freeze({
  size: 64,
  ink: faviconPaths.ink,
  fold: faviconPaths.fold,
  dot: Object.freeze({ x: 48, y: 16, radius: 15, gap: 3 }),
});

/**
 * The design tokens the favicon is painted with: the ink wing on a light and on a dark tab strip, the fold, and the
 * dot, in the high-chroma attention signal (or the solid attention tone where that token is missing).
 */
export const faviconTokens = Object.freeze({ inkLight: '--vouw', inkDark: '--vel', fold: '--brand-fold', dot: '--attention-signal', dotFallback: '--attention-solid' });

/**
 * Paints the mark on a 2D canvas context, and the attention dot when `dot` is true. `colors` holds resolved CSS
 * colours for `ink`, `fold` and `dot`. `path` turns SVG path data into something `fill` accepts (`Path2D` by default).
 * @param {CanvasRenderingContext2D} context
 * @param {{ ink: string, fold: string, dot: string }} colors
 * @param {boolean} dot
 * @param {(data: string) => any} [path]
 */
export function drawFavicon(context, colors, dot, path = data => new Path2D(data)) {
  const { size } = faviconShape;
  const badge = faviconShape.dot;
  context.clearRect(0, 0, size, size);
  context.globalCompositeOperation = 'source-over';
  context.fillStyle = colors.ink;
  context.fill(path(faviconShape.ink));
  context.fillStyle = colors.fold;
  context.fill(path(faviconShape.fold));
  if (!dot) return;
  context.globalCompositeOperation = 'destination-out';
  context.beginPath();
  context.arc(badge.x, badge.y, badge.radius + badge.gap, 0, Math.PI * 2);
  context.fill();
  context.globalCompositeOperation = 'source-over';
  context.fillStyle = colors.dot;
  context.beginPath();
  context.arc(badge.x, badge.y, badge.radius, 0, Math.PI * 2);
  context.fill();
}

/**
 * Creates the favicon switch. `env` supplies `links()` (the `<link rel="icon">` elements), `dark()` (whether the
 * browser prefers a dark scheme, which is what the SVG favicon follows), `color(token, fallback)` (a resolved
 * colour for a custom property, or for the fallback property when the first is not set), `canvas()` (a new
 * canvas element) and, optionally, `path(data)` (a `Path2D` for SVG path data). `show(true)` points every icon link at a PNG data URL
 * of the mark with the dot; `show(false)` puts the original links back. Nothing is touched while the state is unchanged.
 */
export function createFavicon(env) {
  let visible = false;
  let drawn = null;
  const originals = new WeakMap();

  function image() {
    const dark = env.dark();
    const colors = { ink: env.color(dark ? faviconTokens.inkDark : faviconTokens.inkLight), fold: env.color(faviconTokens.fold), dot: env.color(faviconTokens.dot, faviconTokens.dotFallback) };
    const key = `${colors.ink}|${colors.fold}|${colors.dot}`;
    if (drawn?.key === key) return drawn.url;
    const canvas = env.canvas();
    canvas.width = faviconShape.size;
    canvas.height = faviconShape.size;
    const context = canvas.getContext('2d');
    if (!context) return null;
    drawFavicon(context, colors, true, env.path);
    const url = canvas.toDataURL('image/png');
    drawn = { key, url };
    return url;
  }

  function apply() {
    const url = visible ? image() : null;
    for (const link of env.links()) {
      if (!originals.has(link)) originals.set(link, { href: link.getAttribute('href'), type: link.getAttribute('type') });
      const original = originals.get(link);
      const href = url ?? original.href;
      const type = url ? 'image/png' : original.type;
      if (link.getAttribute('href') !== href) link.setAttribute('href', href);
      if (type === null) link.removeAttribute('type');
      else if (link.getAttribute('type') !== type) link.setAttribute('type', type);
    }
  }

  return {
    /** Shows the attention dot on the favicon when `on` is true, and the plain favicon otherwise. */
    show(on) {
      const next = Boolean(on);
      if (next === visible) return;
      visible = next;
      try { apply(); } catch { visible = false; }
    },
    /** Paints the dot again, for example after the browser switched between light and dark. */
    refresh() {
      if (!visible) return;
      try { apply(); } catch {}
    },
    /** Whether the dot is showing. */
    get visible() { return visible; },
  };
}

function resolveColor(token, fallback) {
  const probe = document.createElement('span');
  probe.hidden = true;
  probe.style.color = fallback ? `var(${token}, var(${fallback}))` : `var(${token})`;
  document.body.append(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
}

const darkScheme = globalThis.matchMedia?.('(prefers-color-scheme: dark)') ?? null;

/** The favicon switch of this page. */
export const favicon = createFavicon({
  links: () => globalThis.document ? [...document.querySelectorAll('link[rel~="icon"]')] : [],
  dark: () => Boolean(darkScheme?.matches),
  color: resolveColor,
  canvas: () => document.createElement('canvas'),
});

darkScheme?.addEventListener?.('change', () => favicon.refresh());
