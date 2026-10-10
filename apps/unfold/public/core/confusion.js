export const rageClicks = 3;
export const rageWindowMs = 1000;
export const rageRadiusPx = 100;
export const deadWindowMs = 100;
export const uTurnLeaveMs = 3000;
export const uTurnWindowMs = 120_000;

const insightNamePattern = /^[a-z0-9][a-z0-9.-]{0,63}$/;
const candidateSelector = 'button, a[href], [role="button"], [data-insight]';

/**
 * The name a confusion signal reports for an element: the nearest `data-insight` value, or `unnamed`. Never the
 * element's text or CSS path, so no screen content leaves the browser.
 * @param {Element | null | undefined} element
 * @returns {string}
 */
export function insightName(element) {
  const value = element?.closest?.('[data-insight]')?.getAttribute('data-insight') ?? '';
  return insightNamePattern.test(value) ? value : 'unnamed';
}

/**
 * The detector's rules without the DOM, so they can be tested with plain values. `track` receives product events
 * in the shape `createInsightQueue().track` takes; `where` names the current screen and Work Item.
 * @param {{ track: (name: string, fields: object) => void, where: () => { screen: string, workItemId?: number } }} options
 */
export function createConfusionRules({ track, where }) {
  let burst = [];
  let burstReported = false;
  let detail;
  const quickLeaves = new Map();
  return {
    /**
     * One click. Three within a second and 100 px of the first are a rage click, reported once per burst. A click
     * that selected text is never part of one, so double- and triple-click selection stays quiet.
     * @param {{ x: number, y: number, at: number, element: string, selecting: boolean }} click
     */
    click({ x, y, at, element, selecting }) {
      burst = burst.filter(previous => at - previous.at <= rageWindowMs);
      if (selecting || (burst.length && Math.hypot(x - burst[0].x, y - burst[0].y) > rageRadiusPx)) burst = [];
      if (!burst.length) burstReported = false;
      if (selecting) return;
      burst.push({ x, y, at });
      if (burst.length >= rageClicks && !burstReported) {
        burstReported = true;
        track('ui.rage_click', { ...where(), props: { element } });
      }
    },
    /** A click on an interactive element after which nothing happened within the dead-click window. */
    deadClick(element) {
      track('ui.dead_click', { ...where(), props: { element } });
    },
    /**
     * A route change. Leaving a Work Item detail within 3 s twice for the same item within 2 minutes is a U-turn.
     * @param {{ screen: string, workItemId?: number, at: number }} view
     */
    viewed({ screen, workItemId, at }) {
      if (detail && detail.workItemId !== workItemId && at - detail.at < uTurnLeaveMs) {
        const previous = quickLeaves.get(detail.workItemId);
        if (previous !== undefined && at - previous <= uTurnWindowMs) {
          quickLeaves.delete(detail.workItemId);
          track('ui.u_turn', { screen: detail.screen, workItemId: detail.workItemId });
        } else quickLeaves.set(detail.workItemId, at);
      }
      for (const [item, leftAt] of quickLeaves) if (at - leftAt > uTurnWindowMs) quickLeaves.delete(item);
      detail = Number.isSafeInteger(workItemId) ? { screen, workItemId, at } : undefined;
    },
  };
}

let activityCount = 0;

/** Tells the detector the application started work for the person, such as a request, so a click is not dead. */
export function activity() {
  activityCount++;
}

function leavesPage(element, origin) {
  const link = element.closest('a[href]');
  if (!link) return false;
  if (link.target === '_blank' || link.hasAttribute('download')) return true;
  try { return new URL(link.href, origin).origin !== origin; } catch { return true; }
}

/**
 * Watches clicks and route changes in `document` and reports rage clicks, dead clicks and U-turns through `rules`.
 * A dead click is a click on a button, link, `[role=button]` or `[data-insight]` element after which, within
 * 100 ms, nothing in the page changed (an attribute set again to the value it had does not count), the address and focus stayed the same, and the application started no work.
 * @param {{ document: Document, rules: ReturnType<typeof createConfusionRules>, now?: () => number }} options
 */
export function startConfusionDetector({ document, rules, now = () => performance.now() }) {
  const window = document.defaultView;
  document.addEventListener('click', event => {
    const target = event.target instanceof window.Element ? event.target : null;
    const element = insightName(target);
    const selecting = Boolean(window.getSelection?.()?.toString());
    rules.click({ x: event.clientX, y: event.clientY, at: now(), element, selecting });
    const candidate = target?.closest(candidateSelector);
    if (!candidate || candidate.matches(':disabled, [aria-disabled="true"]') || leavesPage(candidate, window.location.origin) || selecting) return;
    let changed = false;
    const address = window.location.href;
    const observer = new window.MutationObserver(records => {
      if (records.some(record => record.type !== 'attributes' || record.target.getAttribute(record.attributeName) !== record.oldValue)) changed = true;
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true });
    const activityBefore = activityCount;
    queueMicrotask(() => {
      const focused = document.activeElement;
      window.setTimeout(() => {
        observer.disconnect();
        if (!changed && activityCount === activityBefore && window.location.href === address && document.activeElement === focused) rules.deadClick(element);
      }, deadWindowMs);
    });
  }, true);
}
