import { dayAndTime } from './value-stream.js';

/**
 * The moment at `share` (0 to 100) across a chart whose scale is the piecewise list `pieces` of
 * `[from, to, start, end]`, as `data-time-scale` carries it; null outside the scale.
 * @param {number[][]} pieces
 * @param {number} share
 * @returns {number|null}
 */
export function momentAt(pieces, share) {
  if (!pieces.length || share < pieces[0][2] || share > pieces.at(-1)[3]) return null;
  const [from, to, start, end] = pieces.find(piece => share <= piece[3]);
  return from + ((share - start) / Math.max(1e-9, end - start)) * (to - from);
}

/**
 * Where `at` falls across the same piecewise scale, from 0 to 100; null outside it.
 * @param {number[][]} pieces
 * @param {number} at
 * @returns {number|null}
 */
export function shareAt(pieces, at) {
  if (!pieces.length || at < pieces[0][0] || at > pieces.at(-1)[1]) return null;
  const [from, to, start, end] = pieces.find(piece => at <= piece[1]);
  return start + ((at - from) / Math.max(1, to - from)) * (end - start);
}

/**
 * Where `at` falls among the timed parts of the flight path, given each part's `[from, to]` in time order: the part
 * and the fraction across it. A moment between two parts sits at the start of the later one; null before the first
 * part or after the last.
 * @param {number[][]} spans
 * @param {number} at
 * @returns {{ index: number, fraction: number }|null}
 */
export function flightSpot(spans, at) {
  if (!spans.length || at < spans[0][0] || at > Math.max(...spans.map(span => span[1]))) return null;
  const index = spans.findIndex(([from, to]) => at <= to);
  const [from, to] = spans[index];
  return { index, fraction: at <= from ? 0 : (at - from) / Math.max(1, to - from) };
}

const clamp = value => Math.min(1, Math.max(0, value));

function scaleOf(chart) {
  try {
    const pieces = JSON.parse(chart.dataset.timeScale ?? '[]');
    return Array.isArray(pieces) ? pieces : [];
  } catch {
    return [];
  }
}

function timedParts(figure) {
  return [...figure.querySelectorAll('[data-from][data-to]')]
    .map(element => ({ element, from: Number(element.dataset.from), to: Number(element.dataset.to) }))
    .filter(part => Number.isFinite(part.from) && Number.isFinite(part.to))
    .sort((a, b) => a.from - b.from);
}

function upright(figure) {
  const track = figure.querySelector('.lv-fp-track');
  return Boolean(track) && getComputedStyle(track).flexDirection === 'row';
}

function drawOnTracks(chart, at) {
  const line = chart.querySelector('.time-cursor');
  const label = chart.querySelector('.time-cursor-label');
  const share = at === null || !chart.getClientRects().length ? null : shareAt(scaleOf(chart), at);
  for (const element of [line, label]) element?.setAttribute('visibility', share === null ? 'hidden' : 'visible');
  if (share === null) return;
  line?.setAttribute('x1', `${share.toFixed(3)}%`);
  line?.setAttribute('x2', `${share.toFixed(3)}%`);
  if (label) {
    label.setAttribute('x', `${share.toFixed(3)}%`);
    label.setAttribute('text-anchor', share < 8 ? 'start' : share > 92 ? 'end' : 'middle');
    label.textContent = dayAndTime(at);
  }
}

function drawOnFlight(figure, at) {
  let cursor = figure.querySelector(':scope > .lv-fp-cursor');
  const parts = at === null || !upright(figure) ? [] : timedParts(figure);
  const spot = flightSpot(parts.map(part => [part.from, part.to]), at ?? 0);
  if (!spot) {
    if (cursor) cursor.hidden = true;
    return;
  }
  if (!cursor) {
    cursor = figure.ownerDocument.createElement('span');
    cursor.className = 'lv-fp-cursor';
    cursor.setAttribute('aria-hidden', 'true');
    figure.append(cursor);
  }
  const box = figure.getBoundingClientRect();
  const part = parts[spot.index].element.getBoundingClientRect();
  cursor.style.left = `${part.left - box.left + figure.scrollLeft + spot.fraction * part.width}px`;
  cursor.hidden = false;
}

function momentUnder(event) {
  const target = event.target instanceof Element ? event.target : null;
  const page = target?.closest('[data-live="work-item"]');
  if (!page) return null;
  const hop = target.closest('.lv-fp [data-from][data-to]');
  if (hop) {
    const box = hop.getBoundingClientRect();
    const from = Number(hop.dataset.from);
    const to = Number(hop.dataset.to);
    if (!box.width || !Number.isFinite(from) || !Number.isFinite(to)) return { page, at: null };
    return { page, at: from + clamp((event.clientX - box.left) / box.width) * (to - from) };
  }
  const chart = target.closest('.tracks-chart');
  const grid = chart?.querySelector('.stream-grid');
  if (!grid) return { page, at: null };
  const box = grid.getBoundingClientRect();
  if (!box.width || event.clientX < box.left) return { page, at: null };
  return { page, at: momentAt(scaleOf(chart), ((event.clientX - box.left) / box.width) * 100) };
}

function draw(page, at) {
  for (const chart of page.querySelectorAll('.tracks-chart')) drawOnTracks(chart, at);
  for (const figure of page.querySelectorAll('.lv-fp')) drawOnFlight(figure, at);
}

/**
 * Links the flight path and the two tracks of the Work Item page by time: pointing at a moment in either draws a
 * cursor at the same moment in both, with its day and clock time over the tracks. The flight path is not drawn to a
 * time scale, so its cursor moves across the hop, wait or stop whose `data-from` and `data-to` hold that moment. The
 * cursor is only a pointer aid: it is hidden from screen readers, which read every bar's times instead.
 * @param {Document} root
 */
export function followTimeCursor(root) {
  let pending = null;
  let shown = null;
  const apply = () => {
    const found = pending;
    pending = null;
    const page = found?.page ?? null;
    if (shown && shown !== page) draw(shown, null);
    if (page) draw(page, found.at);
    shown = page && found.at !== null ? page : null;
  };
  root.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return;
    const first = pending === null;
    pending = momentUnder(event) ?? { page: null, at: null };
    if (first) requestAnimationFrame(apply);
  }, { passive: true });
  root.addEventListener('pointerout', event => {
    if (event.relatedTarget) return;
    pending = null;
    if (shown) draw(shown, null);
    shown = null;
  });
}
