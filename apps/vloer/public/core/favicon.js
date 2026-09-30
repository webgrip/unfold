/**
 * The favicon mark on its 64-unit grid, exactly as public/favicon.svg draws it: the Peil vee (a round-capped
 * stroke through three points) above the ground slab. `dot` is the attention dot drawn over the top-right
 * corner, with a transparent `gap` around it so it reads on light and dark tab strips.
 */
export const faviconShape = Object.freeze({
  size: 64,
  vee: Object.freeze([[15.5, 11.5], [32, 51.5], [48.5, 11.5]]),
  stroke: 15,
  ground: Object.freeze([8, 44, 48, 8]),
  dot: Object.freeze({ x: 50, y: 14, radius: 12, gap: 4 }),
});

/** The design tokens the favicon is painted with: the vee, the ground slab on a light and on a dark tab strip, and the dot. */
export const faviconTokens = Object.freeze({ vee: '--peil', groundLight: '--vlak', groundDark: '--krijt', dot: '--attention-solid' });

/**
 * Paints the mark on a 2D canvas context, and the attention dot when `dot` is true. `colors` holds resolved CSS
 * colours for `vee`, `ground` and `dot`.
 * @param {CanvasRenderingContext2D} context
 * @param {{ vee: string, ground: string, dot: string }} colors
 * @param {boolean} dot
 */
export function drawFavicon(context, colors, dot) {
  const { size, vee, stroke, ground } = faviconShape;
  const badge = faviconShape.dot;
  context.clearRect(0, 0, size, size);
  context.globalCompositeOperation = 'source-over';
  context.lineWidth = stroke;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = colors.vee;
  context.beginPath();
  context.moveTo(vee[0][0], vee[0][1]);
  context.lineTo(vee[1][0], vee[1][1]);
  context.lineTo(vee[2][0], vee[2][1]);
  context.stroke();
  context.fillStyle = colors.ground;
  context.fillRect(ground[0], ground[1], ground[2], ground[3]);
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
 * browser prefers a dark scheme, which is what the SVG favicon follows), `color(token)` (a resolved colour for a
 * custom property) and `canvas()` (a new canvas element). `show(true)` points every icon link at a PNG data URL
 * of the mark with the dot; `show(false)` puts the original links back. Nothing is touched while the state is unchanged.
 */
export function createFavicon(env) {
  let visible = false;
  let drawn = null;
  const originals = new WeakMap();

  function image() {
    const dark = env.dark();
    const colors = { vee: env.color(faviconTokens.vee), ground: env.color(dark ? faviconTokens.groundDark : faviconTokens.groundLight), dot: env.color(faviconTokens.dot) };
    const key = `${colors.vee}|${colors.ground}|${colors.dot}`;
    if (drawn?.key === key) return drawn.url;
    const canvas = env.canvas();
    canvas.width = faviconShape.size;
    canvas.height = faviconShape.size;
    const context = canvas.getContext('2d');
    if (!context) return null;
    drawFavicon(context, colors, true);
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

function resolveColor(token) {
  const probe = document.createElement('span');
  probe.hidden = true;
  probe.style.color = `var(${token})`;
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
