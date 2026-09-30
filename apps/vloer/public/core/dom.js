import { state } from './state.js';

/** Returns the first element matching `selector`. */
export const $ = selector => document.querySelector(selector);
/** Escapes a value for HTML text and attribute positions. */
export const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
/** Returns the URL when it is http(s) without embedded credentials, otherwise null. */
export function safeUrl(value) { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; } }

/**
 * Replaces #app with `markup`, keeping focus, text selection and each evidence panel's scroll position. After a
 * route change (`state.focusHeading`) it moves focus to the page heading `#page-title` and announces its text.
 */
export function renderHtml(markup) {
  const active = document.activeElement;
  const focusId = active?.id;
  const selection = active && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
  const oldPanel = $('.tab-content:not([hidden])');
  if (oldPanel && oldPanel.dataset.sessionId === state.session?.id) {
    state.evidenceScroll[oldPanel.dataset.tab] = { top: oldPanel.scrollTop, atBottom: oldPanel.scrollHeight - oldPanel.scrollTop - oldPanel.clientHeight < 90 };
  }
  $('#app').innerHTML = markup;
  if (focusId) {
    const replacement = document.getElementById(focusId);
    replacement?.focus({ preventScroll: true });
    if (selection && replacement?.setSelectionRange) try { replacement.setSelectionRange(...selection); } catch {}
  }
  const panel = $('.tab-content:not([hidden])');
  if (panel) {
    const previous = state.evidenceScroll[panel.dataset.tab];
    panel.scrollTop = panel.dataset.tab === 'stream' && (!previous || previous.atBottom) ? panel.scrollHeight : previous?.top || 0;
  }
  const heading = state.focusHeading && document.getElementById('page-title');
  if (heading) {
    state.focusHeading = false;
    if (!focusId || !document.getElementById(focusId)) heading.focus({ preventScroll: true });
    announce(heading.textContent.trim());
  }
}

/** Saves `content` as a file named `filename`. */
export function download(filename, content, type = 'text/plain') {
  const link = document.createElement('a'); const url = URL.createObjectURL(new Blob([content], { type }));
  link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Shows `message` in the toast for a few seconds, styled as an error when `error` is true. */
export function notify(message, error = false) {
  const toast = $('#toast');
  toast.textContent = message; toast.className = `toast visible ${error ? 'error' : ''}`;
  clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => { toast.className = 'toast'; }, 5500);
}

/** Speaks `message` through the polite live region. */
export function announce(message) { $('#announcement').textContent = message; }
