import { escape } from './dom.js';
import { money } from './format.js';
import { meter } from './ui.js';

const isAmount = value => typeof value === 'number' && Number.isFinite(value);
const isCap = cap => Boolean(cap) && typeof cap === 'object' && isAmount(cap.usd) && isAmount(cap.remainingUsd) && typeof cap.period === 'string' && typeof cap.periodEnd === 'string';

/**
 * A Team's spend cap rounded to cents, as every hand-off confirmation states it.
 * @param {number} usd
 * @returns {number}
 */
export function capAmount(usd) { return Math.round(usd * 100) / 100; }

/**
 * What is left of a Team's spend cap rounded down to cents, so no confirmation says more is left than Ploeg reported.
 * @param {number} usd
 * @returns {number}
 */
export function capLeft(usd) { return Math.floor(usd * 100 + 1e-6) / 100; }

/**
 * When a cap's UTC period ends and the cap resets, as `2026-10-31 00:00 UTC`.
 * @param {string} iso
 * @returns {string}
 */
export function capResets(iso) { return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`; }

/**
 * The spend-limit line of a Team where a person hands it a task, from Ploeg's `spendCap` (Ploeg ADR-0162) and nothing
 * else: what is left of the cap this period and when it resets, that Ploeg reports no cap (`null`), that the limit is
 * not known (`undefined` or a shape Unfold does not know), or that this is the demo.
 * @param {object|null|undefined} cap A team's `spendCap` from `GET /api/task-sources/:source/tasks/:id/ploeg`.
 * @param {{ demo?: boolean }} [options]
 * @returns {string}
 */
export function spendCapLine(cap, { demo = false } = {}) {
  if (demo) return 'Demo · no Run starts and no money is spent';
  if (cap === null) return 'No spend limit: Ploeg reports no cap for this Team';
  if (!isCap(cap)) return 'Spend limit not known: Ploeg did not report one for this Team';
  return `${money(capLeft(cap.remainingUsd))} of ${money(capAmount(cap.usd))} left this ${cap.period} (UTC), resets ${capResets(cap.periodEnd)}`;
}

/**
 * The few words a Team's pill shows for its spend cap, such as `US$ 12,34 left`: '' when the limit is not known or in
 * the demo, because the line under the picker says why.
 * @param {object|null|undefined} cap
 * @param {{ demo?: boolean }} [options]
 * @returns {string}
 */
export function spendCapShort(cap, { demo = false } = {}) {
  if (demo) return '';
  if (cap === null) return 'no spend cap';
  return isCap(cap) ? `${money(capLeft(cap.remainingUsd))} left` : '';
}

/**
 * The chosen Team's spend limit as a block: a small meter of settled and held spend against the cap when Ploeg
 * reported both, then the line of `spendCapLine` with the reset as a `<time>`.
 * @param {object|null|undefined} cap
 * @param {{ demo?: boolean, id?: string }} [options]
 * @returns {string}
 */
export function spendCapMarkup(cap, { demo = false, id = 'spend-cap' } = {}) {
  const capped = !demo && isCap(cap);
  const line = escape(spendCapLine(cap, { demo }));
  const text = capped ? line.replace(escape(capResets(cap.periodEnd)), `<time datetime="${escape(cap.periodEnd)}">${escape(capResets(cap.periodEnd))}</time>`) : line;
  const bar = capped && isAmount(cap.settledUsd) ? meter({ settled: cap.settledUsd, reserved: isAmount(cap.heldUsd) ? cap.heldUsd : 0, authorized: cap.usd, label: cap.period === 'day' ? 'Spent today' : `Spent this ${cap.period}`, size: 'sm' }) : '';
  return `<div class="spend-cap" id="${escape(id)}"${capped ? '' : ` data-cap="${demo ? 'demo' : cap === null ? 'none' : 'unknown'}"`}>${bar}<p class="spend-cap-line">${text}.</p></div>`;
}
