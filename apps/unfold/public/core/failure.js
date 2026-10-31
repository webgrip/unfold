import { escape } from './dom.js';
import { button, callout } from './ui.js';

/**
 * What a failed request keeps for its notice: the message and the stable error code from docs/contracts/error-codes.md,
 * empty when the error carried none.
 * @param {unknown} error
 * @returns {{ message: string, code: string }}
 */
export function failureOf(error) {
  const raw = error ?? {};
  const code = typeof raw.code === 'string' && /^[a-z][a-z0-9_]*$/.test(raw.code) ? raw.code : '';
  return { message: String(raw.message || 'Unfold did not answer.'), code };
}

/**
 * The notice for a read that failed: the title, the server's message, the error code a person can quote or look up,
 * and a Try again button that runs `action`. Nothing else on the page is drawn from the missing data.
 * @param {object} options
 * @param {string} options.title What could not be read, such as "Could not read your notifications".
 * @param {{ message: string, code?: string } | string} options.failure
 * @param {string} [options.action] The `data-action` of the Try again button; left out, there is none.
 * @returns {string}
 */
export function failureCallout({ title, failure, action }) {
  const { message, code } = typeof failure === 'string' ? { message: failure, code: '' } : failure;
  const reference = code ? `<p class="meta failure-code">Error code <code>${escape(code)}</code>. The error codes page in the Unfold documentation says what it means and what to do next.</p>` : '';
  const actions = action ? button({ label: 'Try again', icon: 'refresh', size: 'sm', action }) : '';
  return callout({ tone: 'danger', title, body: `<p>${escape(message)}</p>${reference}`, actions });
}
