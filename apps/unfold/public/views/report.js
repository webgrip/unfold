import { state } from '../core/state.js';
import { $, escape } from '../core/dom.js';
import { button, iconButton, segmented, timeAgo } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { isMac, isTyping, keyLabel, singleKeyAllowed } from '../core/keys.js';
import { browserName, buffers, captureScreen, rememberRequest } from '../core/report-capture.js';
import { createAnnotation, markAround, markFrom, targetAt } from '../core/annotate.js';
import { screenFields } from '../core/insight.js';
import { parseHash } from '../core/route.js';

export const kinds = Object.freeze({
  broken: { label: 'Something broke', glyph: 'alert', question: 'What went wrong?', example: 'I pressed Approve and nothing happened. The Work Item still says it waits for me.' },
  confusing: { label: 'Confusing', glyph: 'help-circle', question: 'What was confusing?', example: 'I could not tell whether this Run was still going or had stopped.' },
  idea: { label: 'Idea', glyph: 'spark', question: 'What would help?', example: 'Let me filter Runs by repository.' },
});
export const impacts = Object.freeze({ blocks: 'Blocks me', slows: 'Slows me down', minor: 'Small thing' });
const toolSet = [
  { id: 'box', glyph: 'square', label: 'Highlight', key: 'h', hint: 'Click a thing on the screenshot to box it, or drag a box' },
  { id: 'blur', glyph: 'blur', label: 'Hide', key: 'b', hint: 'Click a thing to blur it, or drag over what to hide' },
  { id: 'arrow', glyph: 'arrow-up-right', label: 'Arrow', key: 'a', hint: 'Drag from where the arrow starts to what it points at' },
  { id: 'text', glyph: 'type', label: 'Label', key: 't', hint: 'Click where the label goes, type, then press Enter' },
];
const draftKey = 'unfold.report.draft';
const draftDays = 7;
const pickable = 'a,button,input,select,textarea,summary,label,img,svg,canvas,h1,h2,h3,h4,p,li,tr,td,th,dt,dd,pre,table,[role],[data-action],[class*="chip"],[class*="badge"],[class*="card"],[class*="stat"],section,article,aside,nav,header,figure';
const controls = 'a,button,summary,label,input,select,textarea,[role="button"],[role="tab"],[role="link"],[role="checkbox"],[data-action]';
const roleNames = { a: 'link', button: 'button', input: 'field', select: 'menu', textarea: 'field', summary: 'disclosure', label: 'label', img: 'image', svg: 'icon', canvas: 'canvas', h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', p: 'text', li: 'list item', tr: 'row', td: 'cell', th: 'column header', dt: 'term', dd: 'value', pre: 'code', table: 'table', section: 'section', article: 'article', aside: 'panel', nav: 'navigation', header: 'header', figure: 'figure' };
let current = null;

/**
 * A suggested title: the page's name and the first sentence of what happened, which the person can change. An idea
 * or a confusing screen says so first.
 * @param {string} page
 * @param {string} happened
 * @param {keyof typeof kinds} [kind]
 */
export function suggestTitle(page, happened, kind = 'broken') {
  const first = happened.trim().split(/(?<=[.!?])\s|\n/)[0].slice(0, 100);
  if (!first) return '';
  return kind === 'idea' ? `Idea for ${page}: ${first}` : kind === 'confusing' ? `Confusing on ${page}: ${first}` : `${page}: ${first}`;
}

function words(element) {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const parts = [];
  for (let node = walker.nextNode(); node && parts.length < 40; node = walker.nextNode()) if (node.data.trim()) parts.push(node.data.trim());
  return parts.join(' ');
}

function squish(value, max) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Names a page element for the report the way a person would: its role, its visible name and the section it sits in,
 * for example `button “Approve” in “Delivery gate”`. Text inside a `[data-private]` region is never used.
 * @param {Element} element
 */
export function describeElement(element) {
  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute('role') || roleNames[tag] || tag;
  const hidden = Boolean(element.closest('[data-private]'));
  const labelled = element.getAttribute('aria-labelledby')?.split(/\s+/).map(id => element.ownerDocument.getElementById(id)?.textContent ?? '').join(' ');
  const field = /^(input|select|textarea)$/.test(tag) ? element.labels?.[0]?.textContent || element.getAttribute('placeholder') : '';
  const name = hidden ? '' : squish(element.getAttribute('aria-label') || labelled || field || element.getAttribute('title') || element.getAttribute('alt') || words(element), 60);
  const region = element.parentElement?.closest('section,article,aside,dialog,[role="region"]');
  const heading = region && !region.closest('[data-private]') ? squish(region.querySelector('h1,h2,h3,h4')?.textContent, 40) : '';
  return squish(`${role}${name ? ` “${name}”` : ''}${heading && heading !== name ? ` in “${heading}”` : ''}`, 200);
}

function snapshotTargets(exclude) {
  const width = document.documentElement.clientWidth;
  const height = document.documentElement.clientHeight;
  const found = [];
  for (const element of document.body.querySelectorAll(pickable)) {
    if (exclude.contains(element) || element.closest('dialog:not([open])')) continue;
    const box = element.getBoundingClientRect();
    if (box.width < 6 || box.height < 6 || box.bottom <= 0 || box.right <= 0 || box.top >= height || box.left >= width) continue;
    if (box.width * box.height > width * height * 0.5) continue;
    found.push({ element, x: box.left, y: box.top, w: box.width, h: box.height });
    if (found.length >= 3000) break;
  }
  const hidden = [...document.body.querySelectorAll('[data-private]')].filter(element => !exclude.contains(element) && !element.parentElement?.closest('[data-private]')).map(element => element.getBoundingClientRect()).filter(box => box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < height).map(box => ({ x: box.left, y: box.top, w: box.width, h: box.height }));
  return { found, byElement: new Map(), hidden, width };
}

function scaled(rect, ratio) {
  return { ...rect, x: rect.x * ratio, y: rect.y * ratio, w: rect.w * ratio, h: rect.h * ratio };
}

function pageName() {
  return document.getElementById('page-title')?.textContent?.trim() || state.view || 'Unfold';
}

function target() {
  const reports = state.bootstrap?.reports;
  if (reports?.demo) return 'Demo: Unfold keeps the report and files nothing.';
  return reports?.target ? `Files to ${reports.target}` : 'No tracker is set up, so Unfold keeps it for an administrator.';
}

function readDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(draftKey) || 'null');
    return draft && Date.now() - draft.at < draftDays * 86_400_000 && draft.happened?.trim() ? draft : null;
  } catch { return null; }
}

function writeDraft(form) {
  if (!current || !form) return;
  const draft = { kind: current.kind, impact: current.impact, happened: form.elements.happened.value, expected: form.elements.expected.value, title: current.titleEdited ? form.elements.title.value : '', at: Date.now() };
  try { if (draft.happened.trim() || draft.expected.trim()) localStorage.setItem(draftKey, JSON.stringify(draft)); else localStorage.removeItem(draftKey); } catch {}
}

function dropDraft() {
  try { localStorage.removeItem(draftKey); } catch {}
}

function ago(iso) {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return seconds < 60 ? `${seconds} s ago` : seconds < 3600 ? `${Math.round(seconds / 60)} min ago` : `${Math.round(seconds / 3600)} h ago`;
}

function includedMarkup(collected, workItemId) {
  const row = (name, label, detail) => `<label class="report-include"><input type="checkbox" name="attach" value="${name}" checked><span class="report-include-text"><span>${escape(label)}</span>${detail ? `<small>${escape(detail)}</small>` : ''}</span></label>`;
  const errors = collected.console.filter(entry => entry.level === 'error');
  const lastMessage = errors.at(-1) ?? collected.console.at(-1);
  const lastRequest = collected.requests.at(-1);
  const rows = [
    `<label class="report-include"><input type="checkbox" name="attach" value="screenshot" checked><span class="report-include-text"><span>Screenshot</span><small data-report-marks>Code, diffs and pull-request text are hidden.</small></span></label>`,
    collected.console.length ? row('console', `${collected.console.length} console ${collected.console.length === 1 ? 'message' : 'messages'}`, lastMessage?.message ?? '') : '',
    collected.requests.length ? row('requests', `${collected.requests.length} failed ${collected.requests.length === 1 ? 'request' : 'requests'}`, lastRequest ? `${lastRequest.method} ${lastRequest.path}${lastRequest.status ? ` → ${lastRequest.status}` : ''} · ${ago(lastRequest.at)}` : '') : '',
  ].join('');
  const always = ['this page', ...(workItemId !== undefined ? [`Work Item ${workItemId}`] : []), ...(collected.trail.length > 1 ? [`the last ${collected.trail.length} pages you opened`] : []), 'Unfold version', 'browser', 'window size'];
  return `<fieldset class="report-included"><legend class="field-label">Sent with it</legend>${rows}<p class="report-always">${icon('info')}<span>Also ${escape(always.join(', ').replace(/, ([^,]*)$/, ' and $1'))}. Never headers, request bodies or text outside the screenshot.</span></p></fieldset>`;
}

function formMarkup(collected, context, draft) {
  const kind = kinds[current.kind];
  const toolbar = toolSet.map(tool => `<button type="button" class="report-tool" data-action="report-tool" data-tool="${tool.id}" aria-pressed="${tool.id === current.tool}" title="${escape(`${tool.hint} (${tool.key.toUpperCase()})`)}" aria-keyshortcuts="${tool.key}" aria-label="${tool.label}">${icon(tool.glyph)}<span aria-hidden="true">${tool.label}</span></button>`).join('');
  const mod = keyLabel('Mod', isMac());
  return `<form data-form="report" novalidate>
<header class="dialog-header"><h2 id="report-title">Report a problem</h2>${iconButton({ icon: 'x', label: 'Close', action: 'close-dialog' })}</header>
<div class="dialog-body report-body">
  <section class="report-stage" aria-label="Screenshot">
    <div class="report-tools" role="toolbar" aria-label="Mark up the screenshot">${toolbar}<span class="report-tools-gap"></span><button type="button" class="report-tool" data-action="report-undo" disabled aria-keyshortcuts="Control+Z Meta+Z" title="Undo the last mark (${escape(mod)} Z)" aria-label="Undo">${icon('undo')}<span aria-hidden="true">Undo</span></button></div>
    <div class="report-canvas" data-report-canvas><p class="report-taking" role="status"><span class="spinner" aria-hidden="true"></span>Taking a screenshot of the page…</p></div>
    <p class="report-stage-hint" data-report-hint>${escape(toolSet[0].hint)}.</p>
  </section>
  <section class="report-panel" aria-label="Your report">
    ${draft ? `<p class="report-draft" role="status">${icon('clock')}<span>Your unsent report is back.</span>${button({ label: 'Start over', variant: 'ghost', size: 'xs', action: 'report-discard-draft' })}</p>` : ''}
    <div class="report-kinds">${segmented({ label: 'What kind of report', action: 'report-kind', items: Object.entries(kinds).map(([id, entry]) => ({ id, label: entry.label, icon: entry.glyph, selected: id === current.kind })) })}</div>
    <div class="field"><label class="field-label" for="report-happened" data-report-question>${escape(kind.question)}</label><textarea id="report-happened" name="happened" rows="5" maxlength="4000" required aria-describedby="report-happened-error" placeholder="${escape(`For example: ${kind.example}`)}"></textarea><p class="field-error" id="report-happened-error" data-error-for="report-happened" hidden></p></div>
    <div class="report-expected" data-report-expected${current.kind === 'broken' ? '' : ' hidden'}>
      <button type="button" class="report-reveal" data-action="report-add-expected"${draft?.expected ? ' hidden' : ''}>${icon('plus')}<span>Add what you expected instead</span></button>
      <div class="field" data-report-expected-field${draft?.expected ? '' : ' hidden'}><label class="field-label" for="report-expected">What did you expect instead?</label><textarea id="report-expected" name="expected" rows="3" maxlength="4000"></textarea></div>
    </div>
    <div class="field report-impact" data-report-impact${current.kind === 'broken' ? '' : ' hidden'}><span class="field-label">How much is it in your way? <span class="field-optional">Optional</span></span>${segmented({ label: 'How much is it in your way?', action: 'report-impact', items: Object.entries(impacts).map(([id, label]) => ({ id, label, selected: id === current.impact })) })}</div>
    <p class="report-pointed" data-report-pointed hidden></p>
    ${includedMarkup(collected, context.workItemId)}
    <div class="report-title-row">
      <span class="field-label" id="report-title-label">Title</span>
      <p class="report-title-preview" data-report-title-preview>Written from what you type.</p>
      <button type="button" class="report-reveal" data-action="report-edit-title">Edit</button>
      <input id="report-title-input" name="title" maxlength="200" autocomplete="off" aria-labelledby="report-title-label" hidden>
    </div>
    <p class="field-error" data-report-error role="alert" hidden></p>
  </section>
</div>
<footer class="dialog-footer report-footer"><p class="report-target">${icon('send')}<span>${escape(target())}</span></p>${button({ label: 'Cancel', variant: 'ghost', action: 'close-dialog' })}${button({ label: 'File report', variant: 'primary', type: 'submit', id: 'report-submit', kbd: [mod, '↵'] })}</footer>
</form>`;
}

function point(canvas, event) {
  const box = canvas.getBoundingClientRect();
  return { x: (event.clientX - box.left) * canvas.width / box.width, y: (event.clientY - box.top) * canvas.height / box.height };
}

function liftToControl(target) {
  const control = target.element?.closest(controls);
  return control && control !== target.element ? current.targets.byElement.get(control) : undefined;
}

function pointedAt() {
  return [...new Set((current?.annotation?.marks ?? []).filter(mark => mark.kind === 'box' && mark.element).map(mark => mark.element))];
}

function repaint(extra) {
  if (!current?.annotation) return;
  const { annotation, view } = current;
  annotation.paint(view.getContext('2d'), extra);
  const undo = $('#report-dialog [data-action="report-undo"]');
  if (undo) undo.disabled = annotation.marks.length === 0;
  const marks = annotation.marks.length;
  const summary = $('#report-dialog [data-report-marks]');
  if (summary) summary.textContent = `${marks ? `${marks} ${marks === 1 ? 'mark' : 'marks'}. ` : ''}Code, diffs and pull-request text are hidden.`;
  const pointed = $('#report-dialog [data-report-pointed]');
  const elements = pointedAt();
  if (pointed) {
    pointed.hidden = !elements.length;
    pointed.innerHTML = elements.length ? `${icon('square')}<span>Pointed at ${escape(elements.join('; '))}</span>` : '';
  }
}

function placeText(at) {
  const holder = $('#report-dialog [data-report-canvas]');
  const input = document.createElement('input');
  input.className = 'report-label-input';
  input.maxLength = 120;
  input.setAttribute('aria-label', 'Label text, Enter to place');
  const box = current.view.getBoundingClientRect();
  const frame = holder.getBoundingClientRect();
  input.style.left = `${box.left - frame.left + at.x * box.width / current.view.width}px`;
  input.style.top = `${box.top - frame.top + at.y * box.height / current.view.height}px`;
  holder.append(input);
  input.focus({ preventScroll: true });
  let placed = false;
  const finish = commit => { if (placed) return; placed = true; if (commit) current?.annotation?.add(markFrom('text', at, at, input.value)); input.remove(); repaint(); };
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
  const ratio = shot.width / current.targets.width;
  current.targets.found = current.targets.found.map(entry => scaled(entry, ratio));
  current.targets.byElement = new Map(current.targets.found.map(entry => [entry.element, entry]));
  current.view = view;
  current.annotation = createAnnotation(shot, { hidden: current.targets.hidden.map(entry => scaled(entry, ratio)) });
  repaint();
  let start = null;
  const picks = () => current.tool === 'box' || current.tool === 'blur';
  const hovered = at => {
    const found = targetAt(current.targets.found, at, liftToControl);
    return found ? { kind: 'hover', x: found.x, y: found.y, w: found.w, h: found.h, target: found } : null;
  };
  view.addEventListener('pointerdown', event => {
    if (!current) return;
    if (current.tool === 'text') { event.preventDefault(); placeText(point(view, event)); return; }
    start = point(view, event);
    view.setPointerCapture(event.pointerId);
  });
  view.addEventListener('pointermove', event => {
    if (!current) return;
    const at = point(view, event);
    if (start && Math.hypot(at.x - start.x, at.y - start.y) > 4 * (view.width / view.getBoundingClientRect().width)) { repaint(markFrom(current.tool, start, at)); return; }
    if (!start && picks()) repaint(hovered(at) ?? undefined);
  });
  view.addEventListener('pointerleave', () => { if (!start) repaint(); });
  view.addEventListener('pointerup', event => {
    if (!start || !current) return;
    const at = point(view, event);
    const dragged = markFrom(current.tool, start, at);
    const picked = !dragged && picks() ? hovered(start)?.target : null;
    current.annotation.add(dragged ?? (picked ? markAround(current.tool, { ...picked, label: describeElement(picked.element) }, view) : null));
    start = null;
    repaint();
    const hint = $('#report-dialog [data-report-hint]');
    if (hint && current.annotation.marks.length) hint.textContent = 'Marked. Add more, or say what is wrong on the right.';
  });
  view.addEventListener('pointercancel', () => { start = null; repaint(); });
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
  const draft = readDraft();
  current = {
    tool: 'box', kind: draft && kinds[draft.kind] ? draft.kind : 'broken', impact: draft && impacts[draft.impact] ? draft.impact : null, collected,
    context: { route: location.hash || '#now', screen: place.screen, ...(place.workItemId !== undefined ? { workItemId: place.workItemId } : {}), browser: browserName(), viewport: `${window.innerWidth}×${window.innerHeight}`, locale: navigator.language, ...(collected.trail.length > 1 ? { trail: collected.trail } : {}) },
    page: pageName(), titleEdited: Boolean(draft?.title), targets: snapshotTargets(dialog),
  };
  dialog.className = 'dialog report-dialog';
  dialog.innerHTML = formMarkup(collected, current.context, draft);
  const form = dialog.querySelector('form');
  if (draft) {
    form.elements.happened.value = draft.happened;
    form.elements.expected.value = draft.expected ?? '';
    if (draft.title) revealTitle(form, draft.title);
  }
  updateTitle(form);
  dialog.showModal();
  dialog.addEventListener('close', () => { writeDraft(form); current = null; }, { once: true });
  form.elements.happened.focus({ preventScroll: true });
  current.shot = captureScreen({ exclude: dialog }).then(shot => {
    if (dialog.open && current) attachCanvas(shot);
  }, () => {
    const holder = dialog.querySelector('[data-report-canvas]');
    if (holder) holder.innerHTML = `<p class="report-taking">${icon('alert')}Unfold could not take a screenshot of this page. You can still file the report.</p>`;
    const box = dialog.querySelector('input[value="screenshot"]');
    if (box) { box.checked = false; box.disabled = true; }
  });
}

function chooseTool(id) {
  const tool = toolSet.find(entry => entry.id === id);
  if (!current || !tool) return;
  current.tool = id;
  for (const control of document.querySelectorAll('#report-dialog [data-action="report-tool"]')) control.setAttribute('aria-pressed', String(control.dataset.tool === id));
  const hint = $('#report-dialog [data-report-hint]');
  if (hint) hint.textContent = `${tool.hint}.`;
  repaint();
}

function chooseKind(control) {
  if (!current || !kinds[control.dataset.id]) return;
  current.kind = control.dataset.id;
  const form = control.closest('form');
  for (const segment of control.parentElement.querySelectorAll('[data-id]')) segment.setAttribute('aria-pressed', String(segment === control));
  const kind = kinds[current.kind];
  form.querySelector('[data-report-question]').textContent = kind.question;
  form.elements.happened.placeholder = `For example: ${kind.example}`;
  form.querySelector('[data-report-expected]').hidden = current.kind !== 'broken';
  form.querySelector('[data-report-impact]').hidden = current.kind !== 'broken';
  updateTitle(form);
  writeDraft(form);
}

function chooseImpact(control) {
  if (!current || !impacts[control.dataset.id]) return;
  current.impact = current.impact === control.dataset.id ? null : control.dataset.id;
  for (const segment of control.parentElement.querySelectorAll('[data-id]')) segment.setAttribute('aria-pressed', String(segment.dataset.id === current.impact));
  writeDraft(control.closest('form'));
}

function addExpected(control) {
  const form = control.closest('form');
  control.hidden = true;
  form.querySelector('[data-report-expected-field]').hidden = false;
  form.elements.expected.focus();
}

function revealTitle(form, value) {
  const input = form.elements.title;
  if (value !== undefined) input.value = value;
  input.hidden = false;
  form.querySelector('[data-report-title-preview]').hidden = true;
  form.querySelector('[data-action="report-edit-title"]').hidden = true;
}

function editTitle(control) {
  if (!current) return;
  const form = control.closest('form');
  revealTitle(form, form.elements.title.value || suggestTitle(current.page, form.elements.happened.value, current.kind));
  form.elements.title.focus();
  form.elements.title.select();
}

function updateTitle(form) {
  if (!current || current.titleEdited) return;
  const suggested = suggestTitle(current.page, form.elements.happened.value, current.kind);
  form.elements.title.value = suggested;
  const preview = form.querySelector('[data-report-title-preview]');
  if (preview) preview.textContent = suggested || 'Written from what you type.';
}

function discardDraft(control) {
  if (!current) return;
  const form = control.closest('form');
  dropDraft();
  form.elements.happened.value = '';
  form.elements.expected.value = '';
  current.titleEdited = false;
  control.closest('.report-draft')?.remove();
  updateTitle(form);
  form.elements.happened.focus();
}

function undo() {
  current?.annotation?.undo();
  repaint();
}

function typed(input) {
  if (!current) return;
  const form = input.closest('form');
  if (input.name === 'title') current.titleEdited = true;
  else updateTitle(form);
  writeDraft(form);
}

function reportKeys(event) {
  const dialog = $('#report-dialog');
  if (event.key === '!' && !dialog?.open && singleKeyAllowed(event)) { event.preventDefault(); void openReport(); return true; }
  if (!current || !dialog?.open || (event.target !== document.body && !dialog.contains(event.target))) return false;
  const form = dialog.querySelector('form[data-form="report"]');
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && form) { event.preventDefault(); form.requestSubmit(); return true; }
  if (isTyping(event.target)) return false;
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); return true; }
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const tool = toolSet.find(entry => entry.key === event.key.toLowerCase());
  if (tool) { event.preventDefault(); chooseTool(tool.id); return true; }
  return false;
}

function blob(canvas) {
  return new Promise(done => canvas.toBlob(done, 'image/png'));
}

async function submitReport(_data, form) {
  if (!current) return;
  const happened = form.elements.happened.value.trim();
  const error = form.querySelector('[data-error-for="report-happened"]');
  if (!happened) { error.textContent = 'Say it in a sentence or two. The screenshot and details are already attached.'; error.hidden = false; form.elements.happened.setAttribute('aria-invalid', 'true'); form.elements.happened.focus(); return; }
  error.hidden = true;
  form.elements.happened.removeAttribute('aria-invalid');
  const submit = form.querySelector('#report-submit');
  submit.disabled = true;
  submit.setAttribute('aria-busy', 'true');
  const failure = form.querySelector('[data-report-error]');
  failure.hidden = true;
  await Promise.race([current.shot, new Promise(done => setTimeout(done, 15000))]);
  if (!current) return;
  const report = current;
  const attach = new Set([...form.querySelectorAll('input[name="attach"]:checked')].map(box => box.value));
  const elements = pointedAt();
  const data = new FormData();
  data.append('kind', report.kind);
  if (report.kind === 'broken' && report.impact) data.append('impact', report.impact);
  data.append('title', form.elements.title.value.trim() || suggestTitle(report.page, happened, report.kind));
  data.append('happened', happened);
  data.append('expected', report.kind === 'broken' ? form.elements.expected.value.trim() : '');
  data.append('context', JSON.stringify({ ...report.context, ...(elements.length ? { element: elements.join('; ').slice(0, 240) } : {}) }));
  if (attach.has('screenshot') && report.annotation) data.append('screenshot', await blob(report.annotation.flatten()), 'screenshot.png');
  if (attach.has('console')) data.append('console', new Blob([JSON.stringify(report.collected.console)], { type: 'application/json' }), 'console.json');
  if (attach.has('requests')) data.append('requests', new Blob([JSON.stringify(report.collected.requests)], { type: 'application/json' }), 'requests.json');
  const started = performance.now();
  try {
    const response = await fetch('/api/reports', { method: 'POST', credentials: 'same-origin', headers: { 'X-Unfold-Request': '1' }, body: data });
    const outcome = await response.json().catch(() => ({}));
    if (!response.ok) {
      rememberRequest({ method: 'POST', url: '/api/reports', status: response.status, durationMs: performance.now() - started });
      throw new Error(outcome.error?.message || 'Unfold could not save the report. Your text is kept; try again.');
    }
    dropDraft();
    current = null;
    await showOutcome(form, outcome);
  } catch (problem) {
    failure.textContent = problem.message;
    failure.hidden = false;
    submit.disabled = false;
    submit.removeAttribute('aria-busy');
  }
}

const statusWords = { filed: ['check-circle', 'Filed'], pending: ['clock', 'Filing'], retrying: ['clock', 'Waiting for the tracker'], failed: ['x-circle', 'Not filed'], kept: ['inbox', 'Kept in Unfold'] };

async function recentReports(skip) {
  try {
    const response = await fetch('/api/reports', { credentials: 'same-origin', headers: { 'X-Unfold-Request': '1' } });
    if (!response.ok) return '';
    const { reports = [] } = await response.json();
    const rows = reports.filter(report => report.id !== skip).slice(0, 4).map(report => {
      const [glyph, word] = statusWords[report.status] ?? statusWords.kept;
      const title = report.url ? `<a href="${escape(report.url)}" target="_blank" rel="noopener noreferrer">${escape(report.title)}</a>` : escape(report.title);
      return `<li>${icon(glyph)}<span class="report-recent-title">${title}</span><span class="report-recent-meta">${escape(word)} · ${timeAgo(report.createdAt)}</span></li>`;
    }).join('');
    return rows ? `<section class="report-recent" aria-labelledby="report-recent-title"><h3 id="report-recent-title">Your earlier reports</h3><ul>${rows}</ul></section>` : '';
  } catch { return ''; }
}

async function showOutcome(form, outcome) {
  const body = form.querySelector('.report-body');
  const reference = outcome.url ? /\/([^/]+\/[^/]+)\/issues\/(\d+)$/.exec(outcome.url) : null;
  const filed = outcome.status === 'filed' && outcome.url;
  const linkText = reference ? `${reference[1]}#${reference[2]}` : 'the filed report';
  const lead = filed ? `Filed as <a href="${escape(outcome.url)}" target="_blank" rel="noopener noreferrer">${escape(linkText)}</a>. Follow it there: answers and fixes land on the issue.` : escape(outcome.message || 'Unfold kept the report.');
  body.classList.add('is-done');
  form.closest('dialog')?.classList.add('is-done');
  body.innerHTML = `<div class="report-outcome" role="status">${icon(filed ? 'check-circle' : 'clock')}<h3>${filed ? 'Thanks, it’s filed' : 'Thanks, it’s saved'}</h3><p>${lead}</p></div>`;
  const actions = filed ? `${button({ label: 'Copy link', icon: 'copy', action: 'report-copy-link', data: { url: outcome.url } })}${button({ label: 'Open issue', href: outcome.url, external: true })}` : '';
  form.querySelector('.dialog-footer').innerHTML = `${actions}${button({ label: 'Done', variant: 'primary', action: 'close-dialog', autofocus: true })}`;
  form.querySelector('.dialog-footer [data-action="close-dialog"]')?.focus();
  const recent = await recentReports(outcome.id);
  if (recent && body.isConnected) body.insertAdjacentHTML('beforeend', recent);
}

async function copyLink(control) {
  const label = control.querySelector('.button-label');
  try {
    await navigator.clipboard.writeText(control.dataset.url);
    if (label) label.textContent = 'Copied';
  } catch {
    if (label) label.textContent = 'Copy failed';
  }
}

/** Report a problem: the dialog, its markup tools and the form that files the report. */
export default {
  id: 'report',
  actions: {
    'report-open': () => openReport(),
    'report-tool': control => chooseTool(control.dataset.tool),
    'report-undo': () => undo(),
    'report-kind': control => chooseKind(control),
    'report-impact': control => chooseImpact(control),
    'report-add-expected': control => addExpected(control),
    'report-edit-title': control => editTitle(control),
    'report-discard-draft': control => discardDraft(control),
    'report-copy-link': control => copyLink(control),
  },
  forms: { report: submitReport },
  inputs: { '#report-happened': typed, '#report-expected': typed, '#report-title-input': typed },
  keys: [reportKeys],
};
