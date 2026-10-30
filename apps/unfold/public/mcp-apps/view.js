/** The MCP Apps protocol revision this view speaks in `ui/initialize`. */
export const appProtocolVersion = '2026-01-26';

const usd = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const changesWork = new Set(['unfold_ask', 'unfold_answer_question', 'unfold_add_note', 'unfold_approve_work']);
const stateWords = { needs_human: 'Needs you', awaiting_review: 'Ready for review', proposed: 'Proposed', ingested: 'Ingested', queued: 'Queued', leased: 'Running', active: 'Running', stale: 'Stale', done: 'Done', withdrawn: 'Withdrawn' };
const stateTone = { needs_human: 'attention', awaiting_review: 'accent', proposed: 'neutral', queued: 'neutral', ingested: 'neutral', leased: 'live', active: 'live', stale: 'severe', done: 'success', withdrawn: 'neutral' };

/** US dollars with two decimals in nl-NL (`US$ 1.234,50`); a positive amount under a cent reads `< US$ 0,01`, an unknown one `Not reported`. */
export function money(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Not reported';
  if (value > 0 && value < 0.01) return `< ${usd.format(0.01)}`;
  return usd.format(value);
}

/** The URL itself when it is `http:` or `https:`, otherwise null. */
export function safeLink(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch { return null; }
}

/** The plain words for a Ploeg Work Item state and the token family that colours it. */
export function stateOf(state) {
  const key = String(state ?? '');
  return { label: stateWords[key] ?? key.replaceAll('_', ' '), tone: stateTone[key] ?? 'neutral' };
}

/** What the Work Item card shows, from `unfold_get_work`'s structured content. */
export function workItemModel(data) {
  const item = data?.item ?? {};
  const shifts = Array.isArray(data?.shifts) ? data.shifts : [];
  const latest = shifts.at(-1) ?? null;
  const spentUsd = shifts.reduce((sum, shift) => sum + (Number(shift.spentUsd) || 0), 0);
  const budgetUsd = typeof latest?.budgetUsd === 'number' ? latest.budgetUsd : null;
  const latestSpent = typeof latest?.spentUsd === 'number' ? latest.spentUsd : null;
  const runs = (Array.isArray(data?.runs) ? data.runs : []).slice(-5).reverse().map(run => ({
    id: String(run.id ?? ''), role: String(run.role ?? ''), round: run.round ?? null,
    result: String(run.verdict || run.outcome || run.state || ''), costUsd: typeof run.costUsd === 'number' ? run.costUsd : null,
    shadow: run.shadow === true,
  }));
  const reason = data?.reason ?? item.reason ?? null;
  const state = String(item.state ?? '');
  const question = data?.untrusted?.question ?? item.untrusted?.question ?? null;
  return {
    id: String(item.id ?? ''), title: String(data?.untrusted?.title ?? item.untrusted?.title ?? ''), state, ...stateOf(state), team: String(item.team ?? ''),
    reason: reason ? { chip: String(reason.chip ?? ''), sentence: String(reason.sentence ?? ''), fix: String(reason.action || reason.fix || '') } : null,
    ploegSaid: data?.ploegSaid ?? null, question: question ? String(question) : null,
    pullRequestUrl: safeLink(item.pullRequestUrl), link: safeLink(item.link), taskUrl: safeLink(item.taskUrl),
    spend: { spentUsd: Math.round(spentUsd * 100) / 100, shiftSpentUsd: latestSpent, budgetUsd, share: budgetUsd && latestSpent !== null ? Math.min(1, Math.max(0, latestSpent / budgetUsd)) : null, shifts: shifts.length },
    runs, demo: /illustrative demo/i.test(String(data?.summary ?? '')),
    actions: actionsFor(state, Boolean(question || item.waitsOnQuestion)),
  };
}

/** What the Now list shows, from `unfold_now`'s structured content. */
export function nowModel(data) {
  const waiting = (Array.isArray(data?.waiting) ? data.waiting : []).map(item => ({
    id: String(item.id ?? ''), title: String(item.untrusted?.title ?? ''), state: String(item.state ?? ''), ...stateOf(item.state), team: String(item.team ?? ''),
    reason: item.reason ? { chip: String(item.reason.chip ?? ''), fix: String(item.reason.action || item.reason.fix || '') } : null,
    spentUsd: typeof item.spentUsd === 'number' ? item.spentUsd : null, pullRequestUrl: safeLink(item.pullRequestUrl), link: safeLink(item.link),
  }));
  return {
    summary: String(data?.summary ?? ''), demo: data?.demo === true, waiting,
    running: Array.isArray(data?.running) ? data.running.length : 0,
    yourSessions: Array.isArray(data?.yourSessions) ? data.yourSessions.length : 0,
  };
}

function actionsFor(state, waitsOnQuestion) {
  const actions = ['ask'];
  if (waitsOnQuestion && state === 'needs_human') actions.push('answer');
  if (['queued', 'leased', 'active'].includes(state)) actions.push('note');
  if (state === 'proposed') actions.push('approve');
  return actions;
}

/**
 * A JSON-RPC 2.0 peer over `postMessage`, as MCP Apps defines between a view and its host. `post` sends one message;
 * `listen` registers the receiver of every message from the host.
 */
export function createBridge({ post, listen }) {
  let next = 0;
  const pending = new Map();
  const notifications = new Map();
  const requests = new Map();
  listen(message => {
    if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0') return;
    if (message.method === undefined && pending.has(message.id)) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(String(message.error.message ?? 'The host refused.')));
      else entry.resolve(message.result ?? {});
      return;
    }
    if (typeof message.method !== 'string') return;
    if (message.id === undefined) { notifications.get(message.method)?.(message.params ?? {}); return; }
    const handler = requests.get(message.method);
    if (!handler) { post({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `Method ${message.method} is not supported.` } }); return; }
    Promise.resolve().then(() => handler(message.params ?? {})).then(
      result => post({ jsonrpc: '2.0', id: message.id, result: result ?? {} }),
      error => post({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: String(error?.message ?? error) } }));
  });
  return {
    request(method, params) {
      const id = `unfold-view-${++next}`;
      return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); post({ jsonrpc: '2.0', id, method, params }); });
    },
    notify(method, params) { post({ jsonrpc: '2.0', method, params }); },
    onNotification(method, handler) { notifications.set(method, handler); },
    onRequest(method, handler) { requests.set(method, handler); },
  };
}

/**
 * Calls one `unfold-mcp` tool through the host, with only its name and arguments: the host's MCP client asks the person
 * to confirm whatever the tool asks it to. A result that still needs input comes back as not done, never answered here.
 */
export async function callTool(bridge, name, args) {
  const result = await bridge.request('tools/call', { name, arguments: args });
  if (result?.resultType === 'input_required') return { done: false, unconfirmed: true, text: 'Your AI client did not show you the confirmation, so nothing changed and nothing was spent.' };
  const text = Array.isArray(result?.content) ? result.content.filter(part => part?.type === 'text').map(part => String(part.text)).join(' ') : '';
  if (result?.isError) return { done: false, error: true, text: text || 'The tool refused.' };
  return { done: true, structured: result?.structuredContent ?? null, text };
}

/** Whether a tool the view calls may change work or spend, so the person sees a note that their client asks them first. */
export function confirmsFirst(name) { return changesWork.has(name); }

function el(doc, tag, attrs = {}, ...children) {
  const node = doc.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? doc.createTextNode(child) : child);
  }
  return node;
}

function linkTo(doc, ui, url, label) {
  if (!url) return null;
  return el(doc, 'a', { href: url, class: 'link', rel: 'noopener noreferrer', onclick: event => { event.preventDefault(); ui.open(url); } }, label);
}

function chip(doc, model) { return el(doc, 'span', { class: `chip tone-${model.tone}` }, model.label); }

function runsTable(doc, runs) {
  const head = el(doc, 'tr', {}, ['Role', 'Round', 'Result'].map(name => el(doc, 'th', { scope: 'col' }, name)), el(doc, 'th', { scope: 'col', class: 'num' }, 'Cost'));
  const rows = runs.map(run => el(doc, 'tr', {},
    el(doc, 'td', {}, run.role + (run.shadow ? ' (shadow)' : '')),
    el(doc, 'td', {}, run.round === null ? '' : String(run.round)),
    el(doc, 'td', {}, run.result.replaceAll('_', ' ')),
    el(doc, 'td', { class: 'num' }, money(run.costUsd))));
  return el(doc, 'section', { class: 'runs' }, el(doc, 'h2', {}, 'Last Runs'), el(doc, 'table', {}, el(doc, 'thead', {}, head), el(doc, 'tbody', {}, rows)));
}

/** Renders the Work Item card into `root`. `ui` opens links and runs actions; every text from Unfold is set as text. */
export function renderWorkItem(doc, root, data, ui) {
  const model = workItemModel(data);
  const spend = model.spend;
  const meter = spend.share === null ? null : el(doc, 'div', { class: 'meter', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(spend.share * 100)), 'aria-label': 'Share of the budget spent' }, el(doc, 'span', { class: `fill${spend.share >= 0.8 ? ' high' : ''}` }));
  if (meter) meter.firstChild.style.width = `${Math.round(spend.share * 100)}%`;
  const card = el(doc, 'article', { class: 'card', 'aria-labelledby': 'unfold-title' },
    el(doc, 'header', { class: 'head' },
      el(doc, 'div', { class: 'eyebrow' }, `Work Item ${model.id}`, model.team ? ` · ${model.team}` : '', model.demo ? ' · Illustrative demo' : ''),
      el(doc, 'h1', { id: 'unfold-title', class: 'title' }, model.title || `Work Item ${model.id}`),
      chip(doc, model)),
    model.reason ? el(doc, 'section', { class: 'reason' },
      el(doc, 'p', { class: 'reason-chip' }, model.reason.chip),
      model.reason.sentence ? el(doc, 'p', {}, model.reason.sentence) : null,
      model.reason.fix ? el(doc, 'p', { class: 'fix' }, el(doc, 'strong', {}, 'Fix: '), model.reason.fix) : null) : null,
    model.question ? el(doc, 'section', { class: 'question' }, el(doc, 'p', { class: 'label' }, 'The agent asks'), el(doc, 'blockquote', {}, model.question)) : null,
    model.ploegSaid ? el(doc, 'p', { class: 'muted' }, el(doc, 'span', { class: 'label' }, 'Ploeg said: '), String(model.ploegSaid)) : null,
    el(doc, 'section', { class: 'spend', 'aria-label': 'Spend and budget' },
      el(doc, 'div', { class: 'stat' }, el(doc, 'span', { class: 'label' }, 'Spent'), el(doc, 'span', { class: 'num' }, model.demo ? 'Nothing (demo)' : money(spend.spentUsd)), el(doc, 'span', { class: 'muted' }, `over ${spend.shifts} ${spend.shifts === 1 ? 'Shift' : 'Shifts'}`)),
      el(doc, 'div', { class: 'stat' }, el(doc, 'span', { class: 'label' }, 'Latest Shift'), el(doc, 'span', { class: 'num' }, spend.budgetUsd === null ? 'No budget yet' : `${money(spend.shiftSpentUsd)} of ${money(spend.budgetUsd)}`), meter)),
    model.runs.length ? runsTable(doc, model.runs) : null,
    el(doc, 'nav', { class: 'links', 'aria-label': 'Links' },
      linkTo(doc, ui, model.link, 'Open in Unfold'), linkTo(doc, ui, model.pullRequestUrl, 'Pull request'), linkTo(doc, ui, model.taskUrl, 'Tracker task')),
    actionsPanel(doc, model, ui));
  root.replaceChildren(card);
  return model;
}

function actionsPanel(doc, model, ui) {
  const status = el(doc, 'p', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const say = (text, tone = '') => { status.textContent = text; status.className = `status${tone ? ` tone-${tone}` : ''}`; };
  const busy = (form, on) => { for (const control of form.querySelectorAll('button, textarea')) control.disabled = on; };
  const confirmNote = el(doc, 'p', { class: 'muted small' }, 'Asking a model, answering, leaving a note and approving all go through your AI client, which asks you to confirm before anything is spent or changed.');
  const textForm = (kind, label, button, tool, argsOf) => {
    const field = el(doc, 'textarea', { name: kind, rows: '2', maxlength: kind === 'ask' || kind === 'answer' ? '2000' : '4096', required: true, 'aria-label': label });
    const form = el(doc, 'div', { class: 'action', 'data-act': kind }, el(doc, 'label', {}, label, field), el(doc, 'button', { type: 'button', onclick: async () => {
      const text = field.value.trim();
      if (!text) { field.focus(); return; }
      busy(form, true); say('Waiting for your AI client…');
      try { await ui.act(tool, argsOf(text), say); } finally { busy(form, false); }
    } }, button));
    return form;
  };
  const forms = [];
  if (model.actions.includes('ask')) forms.push(textForm('ask', 'Ask about this Work Item', 'Ask', 'unfold_ask', question => ({ id: model.id, question })));
  if (model.actions.includes('answer')) forms.push(textForm('answer', 'Answer the agent', 'Answer…', 'unfold_answer_question', text => ({ id: model.id, text })));
  if (model.actions.includes('note')) forms.push(textForm('note', 'Note for the next Run', 'Leave note…', 'unfold_add_note', text => ({ id: model.id, text })));
  if (model.actions.includes('approve')) {
    const form = el(doc, 'div', { class: 'action', 'data-act': 'approve' }, el(doc, 'button', { type: 'button', onclick: async () => {
      busy(form, true); say('Waiting for your AI client…');
      try { await ui.act('unfold_approve_work', { id: model.id }, say); } finally { busy(form, false); }
    } }, 'Approve…'));
    forms.push(form);
  }
  return el(doc, 'section', { class: 'actions', 'aria-label': 'Act on this Work Item' }, forms, el(doc, 'p', { class: 'answer', hidden: true }), status, confirmNote);
}

/** Renders the Now list into `root`; picking an item asks `ui` to show its card. */
export function renderNow(doc, root, data, ui) {
  const model = nowModel(data);
  const list = model.waiting.length ? el(doc, 'ul', { class: 'items' }, model.waiting.map(item => el(doc, 'li', { class: 'item' },
    el(doc, 'div', { class: 'item-head' }, chip(doc, item), el(doc, 'span', { class: 'eyebrow' }, `#${item.id}${item.team ? ` · ${item.team}` : ''}`)),
    el(doc, 'button', { type: 'button', class: 'item-title', onclick: () => ui.show(item.id) }, item.title || `Work Item ${item.id}`),
    item.reason ? el(doc, 'p', { class: 'muted' }, item.reason.chip, item.reason.fix ? ` · ${item.reason.fix}` : '') : null,
    el(doc, 'div', { class: 'item-foot' }, el(doc, 'span', { class: 'num' }, model.demo ? '' : money(item.spentUsd)), linkTo(doc, ui, item.link, 'Open in Unfold'), linkTo(doc, ui, item.pullRequestUrl, 'Pull request'))))) : el(doc, 'p', { class: 'muted' }, 'Nothing waits for you.');
  root.replaceChildren(el(doc, 'article', { class: 'card', 'aria-labelledby': 'unfold-title' },
    el(doc, 'header', { class: 'head' }, el(doc, 'div', { class: 'eyebrow' }, model.demo ? 'Unfold · Illustrative demo' : 'Unfold'), el(doc, 'h1', { id: 'unfold-title', class: 'title' }, 'What waits for you')),
    el(doc, 'p', { class: 'muted' }, model.summary), list));
  return model;
}

/** The app-only tool the card polls; hosts keep it out of the model's tool list. */
export const revisionTool = 'unfold_work_item_revision';
/** How long a visible card waits between checks, and the longest wait after repeated errors. */
export const pollEveryMs = 20_000;
export const pollAtMostMs = 300_000;
const terminalStates = new Set(['done', 'withdrawn']);

/** Whether a Work Item state is final, so its card stops checking for changes. */
export function isTerminal(state) { return terminalStates.has(String(state ?? '')); }

/**
 * Runs `check` every `everyMs` while the page and the card are both visible. `check` resolves `'stop'` to end the
 * polling and rejects on an error, which doubles the wait up to `atMostMs`. A check that is due while hidden runs as
 * soon as the card is visible again. `setTimer`, `clearTimer` and `now` are the clock, so tests can drive it.
 */
export function createPoller({ check, setTimer, clearTimer, now, everyMs = pollEveryMs, atMostMs = pollAtMostMs }) {
  const seen = { page: true, screen: true };
  let timer = null;
  let running = false;
  let stopped = false;
  let failures = 0;
  let dueAt = now() + everyMs;
  const visible = () => seen.page && seen.screen;
  const disarm = () => { if (timer !== null) { clearTimer(timer); timer = null; } };
  const arm = () => {
    if (stopped || running || timer !== null || !visible()) return;
    timer = setTimer(fire, Math.max(0, dueAt - now()));
  };
  async function fire() {
    timer = null;
    if (stopped || !visible()) return;
    running = true;
    try {
      const outcome = await check();
      failures = 0;
      if (outcome === 'stop') stopped = true;
    } catch { failures += 1; }
    running = false;
    dueAt = now() + Math.min(atMostMs, everyMs * 2 ** failures);
    arm();
  }
  arm();
  return {
    setVisible(kind, value) { seen[kind] = Boolean(value); if (!visible()) disarm(); arm(); },
    stop() { stopped = true; disarm(); },
    get state() { return { stopped, running, scheduled: timer !== null, failures, visible: visible(), dueAt }; },
  };
}

/**
 * One check of a shown card: asks `call` for the revision tool's answer and, only when the revision differs from
 * `card.revision`, reads `unfold_get_work` again and hands it to `refresh`, which renders it and returns the new model.
 * It skips the check while `busy()` says an action is under way, announces a changed state, and resolves `'stop'` once
 * the Work Item is final.
 */
export function revisionCheck(card, { call, refresh, announce, busy = () => false }) {
  return async () => {
    if (isTerminal(card.state)) return 'stop';
    if (busy()) return 'continue';
    const answer = await call(revisionTool, { id: card.id });
    if (!answer.done || !answer.structured) throw new Error(answer.text || 'Unfold did not answer.');
    const latest = answer.structured;
    if (latest.revision !== card.revision) {
      if (busy()) return 'continue';
      const work = await call('unfold_get_work', { id: card.id });
      if (!work.done || !work.structured) throw new Error(work.text || 'Unfold did not answer.');
      const before = card.label;
      const model = refresh(work.structured);
      card.revision = String(work.structured.revision ?? latest.revision);
      card.state = model.state;
      card.label = model.label;
      if (model.label !== before) announce(`Work Item ${card.id} is now ${model.label}.`);
    }
    return isTerminal(card.state) || latest.terminal === true ? 'stop' : 'continue';
  };
}

function keepDrafts(root, render) {
  const fields = root.querySelectorAll ? [...root.querySelectorAll('textarea')] : [];
  const drafts = new Map(fields.filter(field => field.value).map(field => [field.name, field.value]));
  const focused = fields.find(field => field.ownerDocument?.activeElement === field)?.name ?? null;
  const model = render();
  if (root.querySelectorAll) for (const field of root.querySelectorAll('textarea')) {
    if (drafts.has(field.name)) field.value = drafts.get(field.name);
    if (field.name === focused) field.focus();
  }
  return model;
}

/** Starts the view inside its host frame: the `ui/initialize` handshake, then rendering each tool result. */
export async function boot(win) {
  const doc = win.document;
  const root = doc.getElementById('unfold-app');
  const view = doc.documentElement.dataset.view === 'now' ? 'now' : 'work-item';
  const bridge = createBridge({ post: message => win.parent.postMessage(message, '*'), listen: receive => win.addEventListener('message', event => { if (event.source === win.parent) receive(event.data); }) });
  const theme = context => { if (context?.theme === 'light' || context?.theme === 'dark') doc.documentElement.dataset.theme = context.theme; };
  let showing = null;
  let acting = 0;
  let poller = null;
  const seen = { page: doc.visibilityState !== 'hidden', screen: true };
  const announcer = doc.getElementById('unfold-announce');
  const announce = text => { if (announcer) announcer.textContent = text; };
  const unfollow = () => { poller?.stop(); poller = null; };
  const showCard = data => {
    showing = keepDrafts(root, () => renderWorkItem(doc, root, data, ui));
    addBack();
    return showing;
  };
  const follow = data => {
    unfollow();
    if (!showing || isTerminal(showing.state)) return;
    const card = { id: showing.id, state: showing.state, label: showing.label, revision: String(data?.revision ?? '') };
    const check = revisionCheck(card, { call: (name, args) => callTool(bridge, name, args), refresh: showCard, announce, busy: () => acting > 0 });
    poller = createPoller({ check, setTimer: (fire, ms) => win.setTimeout(fire, ms), clearTimer: timer => win.clearTimeout(timer), now: () => Date.now() });
    poller.setVisible('page', seen.page);
    poller.setVisible('screen', seen.screen);
  };
  doc.addEventListener('visibilitychange', () => { seen.page = doc.visibilityState !== 'hidden'; poller?.setVisible('page', seen.page); });
  if (typeof win.IntersectionObserver === 'function') new win.IntersectionObserver(entries => { seen.screen = entries.some(entry => entry.isIntersecting); poller?.setVisible('screen', seen.screen); }).observe(root);
  const ui = {
    open(url) { const safe = safeLink(url); if (safe) bridge.request('ui/open-link', { url: safe }).catch(() => {}); },
    async show(id) {
      const answer = await callTool(bridge, 'unfold_get_work', { id }).catch(error => ({ done: false, text: String(error.message) }));
      if (answer.done && answer.structured) { showCard(answer.structured); follow(answer.structured); }
    },
    async act(tool, args, say) {
      acting += 1;
      try { await perform(tool, args, say); } finally { acting -= 1; }
    },
  };
  const perform = async (tool, args, say) => {
    const answer = await callTool(bridge, tool, args).catch(error => ({ done: false, error: true, text: String(error.message) }));
    if (!answer.done) return say(answer.text, answer.unconfirmed ? 'attention' : 'danger');
    const result = answer.structured ?? {};
    if (tool === 'unfold_ask' && result.needsModel && args.use_model !== true) {
      say(String(result.summary ?? ''), 'attention');
      const again = doc.createElement('button');
      again.type = 'button'; again.textContent = 'Ask a model…';
      again.addEventListener('click', () => { again.remove(); say('Waiting for your AI client…'); ui.act('unfold_ask', { ...args, use_model: true }, say); });
      root.querySelector('.actions [data-act="ask"]')?.append(again);
      return;
    }
    if (tool === 'unfold_ask') {
      const out = root.querySelector('.actions .answer');
      if (out && result.untrusted?.answer) { out.textContent = String(result.untrusted.answer); out.hidden = false; }
      return say(String(result.summary ?? ''), result.asked ? 'success' : 'attention');
    }
    say(String(result.summary ?? answer.text), result.done ? 'success' : 'attention');
    if (result.done && showing) ui.show(showing.id);
  };
  let nowData = null;
  const addBack = () => {
    if (view !== 'now' || !nowData) return;
    const back = doc.createElement('button');
    back.type = 'button'; back.className = 'back'; back.textContent = '← What waits for you';
    back.addEventListener('click', () => { showing = null; unfollow(); renderNow(doc, root, nowData, ui); });
    root.prepend(back);
  };
  bridge.onNotification('ui/notifications/tool-result', result => {
    const data = result?.structuredContent;
    if (!data || result.isError) { unfollow(); root.textContent = 'Unfold did not answer this call; the text answer says why.'; return; }
    if (view === 'now') { nowData = data; showing = null; unfollow(); renderNow(doc, root, data, ui); } else { showCard(data); follow(data); }
  });
  bridge.onNotification('ui/notifications/host-context-changed', theme);
  bridge.onRequest('ui/resource-teardown', () => { unfollow(); return {}; });
  bridge.onRequest('ping', () => ({}));
  const init = await bridge.request('ui/initialize', { protocolVersion: appProtocolVersion, appCapabilities: { availableDisplayModes: ['inline'] }, clientInfo: { name: 'unfold-view', version: '1' } });
  theme(init?.hostContext);
  bridge.notify('ui/notifications/initialized', {});
  if (typeof win.ResizeObserver === 'function') {
    let last = '';
    new win.ResizeObserver(() => {
      const box = doc.body.getBoundingClientRect();
      const size = { width: Math.ceil(box.width), height: Math.ceil(box.height) };
      const key = `${size.width}x${size.height}`;
      if (key !== last) { last = key; bridge.notify('ui/notifications/size-changed', size); }
    }).observe(doc.body);
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined' && window.parent && window.parent !== window) boot(window);
