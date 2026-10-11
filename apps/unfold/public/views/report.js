import { state } from '../core/state.js';
import { $, escape } from '../core/dom.js';
import { button, iconButton } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { browserName, buffers, captureScreen, rememberRequest } from '../core/report-capture.js';
import { createAnnotation, markFrom, tools } from '../core/annotate.js';
import { screenFields } from '../core/insight.js';
import { parseHash } from '../core/route.js';

const toolLabels = { box: ['square', 'Box'], arrow: ['arrow-up-right', 'Arrow'], text: ['type', 'Text'], blur: ['blur', 'Blur'] };
let current = null;

/**
 * A suggested title: the page's name and the first sentence of what happened, which the person can change.
 * @param {string} page
 * @param {string} happened
 */
export function suggestTitle(page, happened) {
  const first = happened.trim().split(/(?<=[.!?])\s|\n/)[0].slice(0, 100);
  return first ? `${page}: ${first}` : '';
}

function pageName() {
  return document.getElementById('page-title')?.textContent?.trim() || state.view || 'Unfold';
}

function target() {
  const reports = state.bootstrap?.reports;
  if (reports?.demo) return 'This is the demo: Unfold keeps the report and files nothing.';
  return reports?.target ? `Goes to ${reports.target}.` : 'No tracker is set up for reports, so Unfold keeps it for an administrator.';
}

function attachment(name, label, count, checked) {
  return `<label class="report-attachment"><input type="checkbox" name="attach" value="${name}"${checked ? ' checked' : ''}${count === 0 ? ' disabled' : ''}><span>${escape(label)}${count === undefined ? '' : ` <span class="report-count">(${count})</span>`}</span></label>`;
}

function formMarkup(collected) {
  const toolbar = tools.map(tool => { const [glyph, label] = toolLabels[tool]; return `<button type="button" class="report-tool" data-action="report-tool" data-tool="${tool}" aria-pressed="${tool === 'box'}">${icon(glyph)}<span>${label}</span></button>`; }).join('');
  return `<form data-form="report" novalidate>
<header class="dialog-header"><h2 id="report-title">Report a problem</h2>${iconButton({ icon: 'x', label: 'Close', action: 'close-dialog' })}</header>
<div class="dialog-body report-body">
  <section class="report-shot" aria-label="Screenshot">
    <div class="report-tools" role="toolbar" aria-label="Mark up the screenshot">${toolbar}<button type="button" class="report-tool" data-action="report-undo" disabled>${icon('undo')}<span>Undo</span></button></div>
    <div class="report-canvas" data-report-canvas><p class="report-taking" role="status">Taking a screenshot…</p></div>
    <p class="field-hint">Code, diffs and pull-request text are blurred automatically. Draw a box or an arrow at the problem, add a label, or blur more.</p>
  </section>
  <section class="report-form">
    <div class="field"><label class="field-label" for="report-happened">What happened?</label><textarea id="report-happened" name="happened" rows="4" maxlength="4000" required aria-describedby="report-happened-error"></textarea><p class="field-error" id="report-happened-error" data-error-for="report-happened" hidden></p></div>
    <div class="field"><label class="field-label" for="report-expected">What did you expect?</label><textarea id="report-expected" name="expected" rows="3" maxlength="4000"></textarea></div>
    <div class="field"><label class="field-label" for="report-title-input">Title</label><input id="report-title-input" name="title" maxlength="200" autocomplete="off" aria-describedby="report-title-hint"><p class="field-hint" id="report-title-hint">Suggested from the page and your first sentence. Change it if you like.</p></div>
    <fieldset class="report-attachments"><legend class="field-label">Attach</legend>
      ${attachment('screenshot', 'Screenshot', undefined, true)}
      ${attachment('console', 'Console errors', collected.console.length, collected.console.length > 0)}
      ${attachment('requests', 'Failed requests', collected.requests.length, collected.requests.length > 0)}
      <p class="field-hint">The page, Work Item, versions and browser are always included. No headers, request bodies or screen text beyond the screenshot.</p>
    </fieldset>
    <p class="report-target">${escape(target())}</p>
    <p class="field-error" data-report-error hidden></p>
  </section>
</div>
<footer class="dialog-footer">${button({ label: 'Cancel', variant: 'ghost', action: 'close-dialog' })}${button({ label: 'File report', variant: 'primary', type: 'submit', id: 'report-submit', disabled: true })}</footer>
</form>`;
}

function point(canvas, event) {
  const box = canvas.getBoundingClientRect();
  return { x: (event.clientX - box.left) * canvas.width / box.width, y: (event.clientY - box.top) * canvas.height / box.height };
}

function repaint(extra) {
  const { annotation, view } = current;
  annotation.paint(view.getContext('2d'), extra);
  const undo = $('#report-dialog [data-action="report-undo"]');
  if (undo) undo.disabled = annotation.marks.length === 0;
}

function placeText(at) {
  const holder = $('#report-dialog [data-report-canvas]');
  const input = document.createElement('input');
  input.className = 'report-label-input';
  input.maxLength = 120;
  input.setAttribute('aria-label', 'Label text, Enter to place');
  const box = current.view.getBoundingClientRect();
  input.style.left = `${at.x * box.width / current.view.width}px`;
  input.style.top = `${at.y * box.height / current.view.height}px`;
  holder.append(input);
  input.focus({ preventScroll: true });
  const finish = commit => { if (commit) current.annotation.add(markFrom('text', at, at, input.value)); input.remove(); repaint(); };
  input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); finish(true); } if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); finish(false); } });
  input.addEventListener('blur', () => finish(true), { once: true });
}

function attachCanvas(shot) {
  const holder = $('#report-dialog [data-report-canvas]');
  const view = document.createElement('canvas');
  view.width = shot.width;
  view.height = shot.height;
  view.setAttribute('role', 'img');
  view.setAttribute('aria-label', 'Screenshot of the page you were on, with your marks');
  holder.replaceChildren(view);
  current.view = view;
  current.annotation = createAnnotation(shot);
  repaint();
  let start = null;
  view.addEventListener('pointerdown', event => {
    if (current.tool === 'text') { placeText(point(view, event)); return; }
    start = point(view, event);
    view.setPointerCapture(event.pointerId);
  });
  view.addEventListener('pointermove', event => { if (start) repaint(markFrom(current.tool, start, point(view, event))); });
  view.addEventListener('pointerup', event => {
    if (!start) return;
    current.annotation.add(markFrom(current.tool, start, point(view, event)));
    start = null;
    repaint();
  });
}

/** Opens Report a problem: the dialog first, then the screenshot taken behind it with the dialog left out. */
export async function openReport() {
  if (!state.bootstrap) return;
  const dialog = $('#report-dialog');
  if (!dialog || dialog.open) return;
  for (const transient of document.querySelectorAll('#palette[open], #nav-drawer[open], #shortcuts[open]')) transient.close();
  for (const menu of document.querySelectorAll('.app-user-trigger[aria-expanded="true"]')) menu.click();
  await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
  const collected = buffers();
  const place = screenFields(state.view, parseHash(location.hash).path);
  current = { tool: 'box', collected, context: { route: location.hash || '#now', screen: place.screen, ...(place.workItemId !== undefined ? { workItemId: place.workItemId } : {}), browser: browserName(), viewport: `${window.innerWidth}×${window.innerHeight}`, locale: navigator.language }, page: pageName(), titleEdited: false };
  dialog.className = 'dialog report-dialog';
  dialog.innerHTML = formMarkup(collected);
  dialog.showModal();
  dialog.querySelector('#report-happened').focus({ preventScroll: true });
  try {
    const shot = await captureScreen({ exclude: dialog });
    if (!dialog.open || !current) return;
    attachCanvas(shot);
  } catch {
    const holder = dialog.querySelector('[data-report-canvas]');
    if (holder) holder.innerHTML = '<p class="report-taking">Unfold could not take a screenshot of this page. You can still file the report.</p>';
    const box = dialog.querySelector('input[value="screenshot"]');
    if (box) { box.checked = false; box.disabled = true; }
  }
  const submit = dialog.querySelector('#report-submit');
  if (submit) submit.disabled = false;
}

function chooseTool(control) {
  current.tool = control.dataset.tool;
  for (const button of document.querySelectorAll('#report-dialog [data-action="report-tool"]')) button.setAttribute('aria-pressed', String(button === control));
}

function undo() {
  current?.annotation?.undo();
  repaint();
}

function suggest(input) {
  if (!current || current.titleEdited) return;
  const title = $('#report-title-input');
  if (title) title.value = suggestTitle(current.page, input.value);
}

function markTitleEdited() {
  if (current) current.titleEdited = true;
}

function blob(canvas) {
  return new Promise(done => canvas.toBlob(done, 'image/png'));
}

async function submitReport(_data, form) {
  const happened = form.elements.happened.value.trim();
  const error = form.querySelector('[data-error-for="report-happened"]');
  if (!happened) { error.textContent = 'Say what happened.'; error.hidden = false; form.elements.happened.setAttribute('aria-invalid', 'true'); form.elements.happened.focus(); return; }
  error.hidden = true;
  form.elements.happened.removeAttribute('aria-invalid');
  const attach = new Set([...form.querySelectorAll('input[name="attach"]:checked')].map(box => box.value));
  const data = new FormData();
  data.append('title', form.elements.title.value.trim() || suggestTitle(current.page, happened));
  data.append('happened', happened);
  data.append('expected', form.elements.expected.value.trim());
  data.append('context', JSON.stringify(current.context));
  if (attach.has('screenshot') && current.annotation) data.append('screenshot', await blob(current.annotation.flatten()), 'screenshot.png');
  if (attach.has('console')) data.append('console', new Blob([JSON.stringify(current.collected.console)], { type: 'application/json' }), 'console.json');
  if (attach.has('requests')) data.append('requests', new Blob([JSON.stringify(current.collected.requests)], { type: 'application/json' }), 'requests.json');
  const submit = form.querySelector('#report-submit');
  submit.disabled = true;
  submit.setAttribute('aria-busy', 'true');
  const failure = form.querySelector('[data-report-error]');
  failure.hidden = true;
  const started = performance.now();
  try {
    const response = await fetch('/api/reports', { method: 'POST', credentials: 'same-origin', headers: { 'X-Unfold-Request': '1' }, body: data });
    const outcome = await response.json().catch(() => ({}));
    if (!response.ok) {
      rememberRequest({ method: 'POST', url: '/api/reports', status: response.status, durationMs: performance.now() - started });
      throw new Error(outcome.error?.message || 'Unfold could not save the report. Try again.');
    }
    showOutcome(form, outcome);
  } catch (problem) {
    failure.textContent = problem.message;
    failure.hidden = false;
    submit.disabled = false;
    submit.removeAttribute('aria-busy');
  }
}

function showOutcome(form, outcome) {
  const body = form.querySelector('.report-body');
  const reference = outcome.url ? /\/([^/]+\/[^/]+)\/issues\/(\d+)$/.exec(outcome.url) : null;
  const filed = outcome.status === 'filed' && outcome.url;
  const linkText = reference ? `${reference[1]}#${reference[2]}` : 'the filed report';
  body.innerHTML = `<div class="report-outcome" role="status">${icon(filed ? 'check-circle' : 'clock')}<h3>${filed ? 'Filed' : 'Saved'}</h3><p>${filed ? `Filed as <a href="${escape(outcome.url)}" target="_blank" rel="noopener noreferrer">${escape(linkText)}</a>.` : escape(outcome.message || 'Unfold kept the report.')}</p></div>`;
  form.querySelector('.dialog-footer').innerHTML = button({ label: 'Done', variant: 'primary', action: 'close-dialog', autofocus: true });
  form.querySelector('.dialog-footer button')?.focus();
  current = null;
}

/** Report a problem: the dialog, its markup tools and the form that files the report. */
export default {
  id: 'report',
  actions: {
    'report-open': () => openReport(),
    'report-tool': control => chooseTool(control),
    'report-undo': () => undo(),
  },
  forms: { report: submitReport },
  inputs: { '#report-happened': suggest, '#report-title-input': markTitleEdited },
};

