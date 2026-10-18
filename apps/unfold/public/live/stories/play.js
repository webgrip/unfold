/**
 * Throws when `condition` is false, so a story's `play` fails its workbench frame and `npm run test:workbench`.
 * @param {unknown} condition
 * @param {string} message What was expected, read after "Expected".
 */
export function expect(condition, message) {
  if (!condition) throw new Error(`Expected ${message}`);
}

/** The one element under `root` that matches `selector`; throws when there is none. */
export function find(root, selector) {
  const element = root.querySelector(selector);
  expect(element, `${selector} in the story`);
  return element;
}

/** Presses and releases the pointer on an element and clicks it, as a person's click does. */
export function click(element) {
  element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  element.click();
}

/** Focuses a field, replaces its text and fires `input`, as typing does. */
export function type(input, text) {
  input.focus();
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Fires a `keydown` for `key` on `target`; returns false when a listener prevented its default. */
export const press = (target, key) => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

/** Whether an element is shown: in the page, not hidden and with a box. */
export const shown = element => Boolean(element?.isConnected && !element.closest('[hidden]') && element.getClientRects().length);
