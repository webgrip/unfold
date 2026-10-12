export const tools = Object.freeze(['box', 'blur', 'arrow', 'text']);
export const markColour = '#e5484d';
export const privateColour = '#6e56cf';
export const blurPx = 8;
const minimumSize = 4;

/**
 * The rectangle two corner points span, with a positive width and height.
 * @param {{ x: number, y: number }} from
 * @param {{ x: number, y: number }} to
 */
export function spanned(from, to) {
  return { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), w: Math.abs(to.x - from.x), h: Math.abs(to.y - from.y) };
}

/**
 * The two points of an arrow head at the end of a line, each `size` back from the tip at 28° off the line.
 * @returns {[[number, number], [number, number]]}
 */
export function arrowHead(x1, y1, x2, y2, size) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const spread = Math.PI * 28 / 180;
  return [[x2 - size * Math.cos(angle - spread), y2 - size * Math.sin(angle - spread)], [x2 - size * Math.cos(angle + spread), y2 - size * Math.sin(angle + spread)]];
}

/**
 * Turns one drag (or a click, for text) with a tool into a mark, or null when the drag is too small to mean anything.
 * Coordinates are in screenshot pixels.
 */
export function markFrom(tool, from, to, text = '') {
  if (tool === 'text') return text.trim() ? { kind: 'text', x: from.x, y: from.y, text: text.trim().slice(0, 120) } : null;
  if (tool === 'arrow') return Math.hypot(to.x - from.x, to.y - from.y) < minimumSize ? null : { kind: 'arrow', x1: from.x, y1: from.y, x2: to.x, y2: to.y };
  const rect = spanned(from, to);
  return rect.w < minimumSize || rect.h < minimumSize ? null : { kind: tool, ...rect };
}

/**
 * The smallest of `targets` under `at`, lifted to the control it sits in, so a click on a button's icon picks the
 * button. Targets are page rectangles in screenshot pixels; `lift` names the control a target belongs to, if any.
 * @template {{ x: number, y: number, w: number, h: number }} T
 * @param {T[]} targets
 * @param {{ x: number, y: number }} at
 * @param {(target: T) => T | undefined} [lift]
 * @returns {T | null}
 */
export function targetAt(targets, at, lift = () => undefined) {
  let best = null;
  for (const target of targets) {
    if (at.x < target.x || at.y < target.y || at.x > target.x + target.w || at.y > target.y + target.h) continue;
    if (!best || target.w * target.h < best.w * best.h) best = target;
  }
  return best ? lift(best) ?? best : null;
}

/**
 * The mark one click on a picked target leaves: a box (or a blur) a little larger than the target, inside the
 * screenshot, carrying what the target is.
 */
export function markAround(tool, target, bounds, pad = 4) {
  const x = Math.max(0, target.x - pad);
  const y = Math.max(0, target.y - pad);
  const w = Math.min(bounds.width, target.x + target.w + pad) - x;
  const h = Math.min(bounds.height, target.y + target.h + pad) - y;
  return { kind: tool === 'blur' ? 'blur' : 'box', x, y, w, h, ...(target.label ? { element: target.label } : {}) };
}

/**
 * The marks drawn on one screenshot and how to paint them. Blur marks only ever add blur, so a person can hide more
 * than Unfold blurred automatically, never less.
 * @param {HTMLCanvasElement} base the screenshot, never changed
 */
export function createAnnotation(base, { hidden = [] } = {}) {
  const marks = [];
  const scale = Math.max(1, base.width / 1200);
  function paint(context, extra, { guides = true } = {}) {
    context.drawImage(base, 0, 0);
    const all = extra && extra.kind !== 'hover' ? [...marks, extra] : marks;
    for (const mark of all.filter(entry => entry.kind === 'blur')) {
      context.save();
      context.beginPath();
      context.rect(mark.x, mark.y, mark.w, mark.h);
      context.clip();
      context.filter = `blur(${blurPx * scale}px)`;
      context.drawImage(base, 0, 0);
      context.restore();
    }
    context.save();
    context.strokeStyle = markColour;
    context.fillStyle = markColour;
    context.lineWidth = 3 * scale;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    for (const mark of all) {
      if (mark.kind === 'box') context.strokeRect(mark.x, mark.y, mark.w, mark.h);
      if (mark.kind === 'arrow') {
        context.beginPath();
        context.moveTo(mark.x1, mark.y1);
        context.lineTo(mark.x2, mark.y2);
        const [left, right] = arrowHead(mark.x1, mark.y1, mark.x2, mark.y2, 14 * scale);
        context.moveTo(...left);
        context.lineTo(mark.x2, mark.y2);
        context.lineTo(...right);
        context.stroke();
      }
      if (mark.kind === 'text') {
        context.font = `600 ${16 * scale}px Archivo, system-ui, sans-serif`;
        const width = context.measureText(mark.text).width;
        context.fillRect(mark.x - 4 * scale, mark.y - 18 * scale, width + 8 * scale, 24 * scale);
        context.fillStyle = '#ffffff';
        context.fillText(mark.text, mark.x, mark.y);
        context.fillStyle = markColour;
      }
    }
    context.restore();
    if (guides) paintGuides(context, scale, extra?.kind === 'hover' ? extra : null);
  }
  function paintGuides(context, scale, hover) {
    context.save();
    context.lineWidth = 1.5 * scale;
    context.setLineDash([5 * scale, 4 * scale]);
    context.font = `600 ${11 * scale}px Archivo, system-ui, sans-serif`;
    for (const region of hidden) {
      context.strokeStyle = privateColour;
      context.strokeRect(region.x, region.y, region.w, region.h);
      const label = 'Hidden automatically';
      const width = context.measureText(label).width + 10 * scale;
      if (region.w < width || region.h < 18 * scale) continue;
      context.fillStyle = privateColour;
      context.fillRect(region.x, region.y, width, 16 * scale);
      context.fillStyle = '#ffffff';
      context.fillText(label, region.x + 5 * scale, region.y + 12 * scale);
    }
    if (hover) {
      context.strokeStyle = markColour;
      context.fillStyle = 'rgba(229, 72, 77, 0.10)';
      context.fillRect(hover.x, hover.y, hover.w, hover.h);
      context.strokeRect(hover.x, hover.y, hover.w, hover.h);
    }
    context.restore();
  }
  return {
    marks,
    add(mark) { if (mark) marks.push(mark); },
    undo() { return marks.pop(); },
    clear() { marks.length = 0; },
    paint,
    /** The screenshot with every mark painted in, as the PNG the report files. */
    flatten() {
      const canvas = document.createElement('canvas');
      canvas.width = base.width;
      canvas.height = base.height;
      paint(canvas.getContext('2d'), undefined, { guides: false });
      return canvas;
    },
  };
}
