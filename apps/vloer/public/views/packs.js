import { state, disconnect, onForget } from '../core/state.js';
import { api } from '../core/api.js';
import { $, escape, renderHtml, announce, notify } from '../core/dom.js';
import { count, date, dateTime, plural } from '../core/format.js';
import { prefs } from '../core/prefs.js';
import { isTyping } from '../core/keys.js';
import { button, callout, demoNote, emptyState, skeleton, table } from '../core/ui.js';
import { shell } from '../shell.js';
import { cardView } from '../cards/card-model.js';
import { webglSupport } from '../cards/registry.js';
import { faceFacts } from '../cards/skins/forge/forge-model.js';
import { cardAsOf, copyCard, momentText, oddsOneIn, oddsPercent, packSummaryText, patternBasisPoints, patternLabels, periodLabel, pullExtras, pullIntensity, pullText, roleLabel } from '../cards/collection-model.js';
import { drawThumbnail, thumbnailsSupported } from '../cards/thumbs.js';
import { cardMotion, cardSounds, effects } from '../cards/effects/vloer.js';

const view = { page: 'shelf', data: null, odds: null, opened: null, error: '', loading: false, request: 0, ceremony: null, release: null };
onForget(() => { endCeremony(); Object.assign(view, { page: 'shelf', data: null, odds: null, opened: null, error: '', loading: false, request: view.request + 1 }); });

const reducedMotion = () => cardMotion() !== 'full';

function demoLine(data) {
  return data?.demo ? demoNote('Demo packs · illustrative cards · no model calls, no spend') : '';
}

function stateLine(pack) {
  if (pack.state === 'filling') return `Filling until ${date(pack.period.end)} · opens then`;
  if (pack.state === 'opened') return `Opened ${dateTime(pack.openedAt)}`;
  return 'Sealed · keeps until you open it';
}

function contentsLine(pack) {
  return [plural(pack.count, 'card'), pack.firsts ? `${count(pack.firsts)} new` : '', pack.upgrades ? plural(pack.upgrades, 'upgrade') : ''].filter(Boolean).join(' · ');
}

function packRow(pack) {
  const link = pack.state === 'opened' ? `<a href="#packs/${encodeURIComponent(pack.id)}">${escape(periodLabel(pack.period))}</a>` : escape(periodLabel(pack.period));
  return `<li class="pack-row" data-state="${escape(pack.state)}"><span class="pack-row-icon" aria-hidden="true"></span><span class="pack-row-main"><span class="pack-row-title">${link}</span><span class="pack-row-meta">${escape(contentsLine(pack))} · ${escape(stateLine(pack))}</span></span></li>`;
}

function soundSwitch() {
  return `<label class="pack-sound" for="pack-sound"><input type="checkbox" role="switch" id="pack-sound" data-pack-sound${prefs.get('cardSound') ? ' checked' : ''}><span>Sound</span></label>`;
}

function hero(pack) {
  const fallback = webglSupport() === 'none';
  return `<section class="pack-hero" aria-labelledby="pack-hero-title">
    <div class="pack-stage" id="pack-stage" data-phase="sealed" data-action="pack-stage"${fallback ? ' data-fallback' : ''}>
      ${fallback ? `<div class="pack-css" aria-hidden="true"><span class="pack-css-strip"></span><span class="pack-css-mark"></span><span class="pack-css-label">${escape(periodLabel(pack.period))}</span><span class="pack-css-count">${escape(plural(pack.count, 'card'))}</span></div><div class="pack-css-card" id="pack-css-card" hidden></div>` : ''}
      <p class="pack-hint" id="pack-hint">${fallback ? 'Press Tear open.' : 'Drag across the top edge to tear it open, or press Tear open.'}</p>
      <div class="pack-title" id="pack-title" aria-live="polite"></div>
    </div>
    <div class="pack-controls">
      <p class="pack-overline">Your next pack</p>
      <h2 class="pack-heading" id="pack-hero-title">${escape(periodLabel(pack.period))}</h2>
      <p class="pack-meta">${escape(contentsLine(pack))}</p>
      ${pack.demo ? '<p class="pack-demo">Demo pack · illustrative cards · no spend</p>' : ''}
      <div class="pack-buttons">${button({ label: 'Tear open', icon: 'pack', variant: 'primary', action: 'pack-primary', id: 'pack-primary', data: { id: pack.id }, kbd: 'Enter' })}${button({ label: 'Skip to summary', variant: 'ghost', action: 'pack-skip', id: 'pack-skip' })}</div>
      <p class="pack-progress" id="pack-progress"></p>
      <ol class="pack-tray" id="pack-tray" aria-label="Revealed so far"></ol>
      <div class="pack-aside">${soundSwitch()}<a href="#packs/odds">See the odds</a></div>
    </div>
  </section>`;
}

function shelf() {
  const data = view.data;
  if (!data) return view.loading ? skeleton({ rows: 4 }) : callout({ tone: 'danger', title: 'Could not read your packs', body: `<p>${escape(view.error || 'The workbench did not answer.')}</p>` });
  const next = data.packs.find(pack => pack.next);
  const waiting = data.packs.filter(pack => pack.state === 'sealed' && !pack.next);
  const filling = data.packs.filter(pack => pack.state === 'filling');
  const opened = data.packs.filter(pack => pack.state === 'opened').reverse();
  const identity = data.identity.source === 'none' ? callout({ tone: 'neutral', icon: 'user', title: 'Tell Unfold which logins are yours', body: '<p>Packs hold your copies of Run cards, found by your logins on each card\'s roster.</p>', actions: button({ label: 'Add your logins', href: '#settings/cards', variant: 'primary', size: 'sm' }) }) : '';
  const empty = !data.packs.length ? emptyState({ icon: 'pack', title: 'No packs yet', body: 'A pack holds your cards with a moment in one period: minted, merged, released, a finish level crossed, cracked or mended. It seals when the period ends and keeps until you open it.' }) : '';
  const list = (title, packs, note = '') => packs.length ? `<section class="pack-list" aria-labelledby="pack-list-${escape(title.toLowerCase().replace(/\W+/g, '-'))}"><h2 class="pack-list-title" id="pack-list-${escape(title.toLowerCase().replace(/\W+/g, '-'))}">${escape(title)}</h2>${note ? `<p class="pack-list-note">${escape(note)}</p>` : ''}<ul class="pack-rows">${packs.map(packRow).join('')}</ul></section>` : '';
  const rules = `<p class="pack-rules">Packs are earned: each holds only your own cards. Pulls are cosmetic and drawn from <a href="#packs/odds">published odds</a>; they are recorded and never change. Nothing can be bought, re-rolled or traded.</p>`;
  return `${demoLine(data)}${identity}${next ? hero(next) : ''}${empty}${list('Waiting', waiting, 'Packs open in order, oldest first.')}${list('Filling now', filling, 'A pack seals when its period ends.')}${list('Opened', opened)}${rules}`;
}

function oddsPage() {
  const odds = view.odds;
  if (!odds) return view.loading ? skeleton({ rows: 6, variant: 'table' }) : callout({ tone: 'danger', title: 'Could not read the odds', body: `<p>${escape(view.error)}</p>` });
  const patterns = table({ caption: 'Foil pattern odds', compact: true, region: false, rowHeader: true, columns: [{ key: 'pattern', label: 'Foil pattern' }, { key: 'chance', label: 'Chance', numeric: true }, { key: 'about', label: 'About', numeric: true }], rows: odds.patterns.map(entry => ({ pattern: escape(entry.label), chance: escape(oddsPercent(entry.basisPoints)), about: escape(oddsOneIn(entry.basisPoints)) })) });
  const extras = table({ caption: 'Cosmetic extra odds', compact: true, region: false, rowHeader: true, columns: [{ key: 'extra', label: 'Extra' }, { key: 'chance', label: 'Chance', numeric: true }, { key: 'detail', label: 'What it does' }], rows: odds.extras.map(entry => ({ extra: escape(entry.label), chance: escape(oddsPercent(entry.basisPoints)), detail: escape(entry.detail) })) });
  const total = odds.patterns.reduce((sum, entry) => sum + entry.basisPoints, 0);
  return `<div class="odds-page">
    <section class="card odds-card" aria-labelledby="odds-patterns"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="odds-patterns">Foil pattern</h2><p class="card-subtitle">Every card's first pull draws one pattern. The chances add up to ${escape(oddsPercent(total))}.</p></div></header>${patterns}</section>
    <section class="card odds-card" aria-labelledby="odds-extras"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="odds-extras">Extras</h2><p class="card-subtitle">Each extra is drawn on its own, apart from the pattern and from each other. A card can get none, one or all three.</p></div></header>${extras}</section>
    <section class="card odds-card" aria-labelledby="odds-rules"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="odds-rules">How pulls work</h2></div></header><ul class="odds-rules">
      <li>A pack holds only cards you earned: your copies with a moment in its period. Only their looks are drawn.</li>
      <li>A pull is cosmetic. It never changes a card's facts, grade, finish, rarity or anything Ploeg authorizes, budgets or merges.</li>
      <li>A card is pulled once, in the first pack it appears in, and keeps that pull. Later packs show what changed: a finish rising, a crack, a mend.</li>
      <li>The draw is HMAC-SHA256 of your account, the Work Item and the pack with a key only the server holds, so it is fixed before you open the pack, and Vloer records it. Opening a pack again cannot change it.</li>
      <li>The odds never depend on rarity, grade, finish, role or who you are.</li>
      <li>One pack per period per person. Packs cannot be bought, re-rolled, traded or given away, and they do not expire.</li>
      <li>The earned finish decides how much of a card the pattern covers: none while matte, the frame at foil, more at each step after.</li>
    </ul><p class="odds-version">Odds table version ${escape(odds.version)}.</p></section>
  </div>`;
}

function openedPage() {
  const opened = view.opened;
  if (!opened) return view.loading ? skeleton({ rows: 4, variant: 'cards' }) : callout({ tone: 'danger', title: 'Could not open this pack', body: `<p>${escape(view.error)}</p>` });
  return `${demoLine(opened)}${summaryPanel(opened, false)}`;
}

function summaryPanel(opened, fresh) {
  const entries = opened.pack.entries;
  const items = entries.map(entry => {
    const pull = entry.pull;
    const title = entry.card ? entry.card.title : `Work Item #${entry.workItemId}`;
    const picture = entry.card && thumbnailsSupported() ? `<canvas class="pack-summary-thumb" data-summary="${escape(entry.workItemId)}" aria-hidden="true"></canvas>` : '<span class="pack-summary-thumb is-empty" aria-hidden="true"></span>';
    const kind = entry.kind === 'new' ? `<span class="pack-summary-kind" data-kind="new">New · ${escape(pullText(pull))}</span>` : `<span class="pack-summary-kind" data-kind="upgrade">Upgrade · ${escape(entry.moments.map(momentText).join(' · '))}</span>`;
    return `<li class="pack-summary-item">${picture}<span class="pack-summary-title">${escape(title)}</span>${kind}${entry.card ? '' : '<span class="pack-summary-gone">No longer in your Teams</span>'}</li>`;
  }).join('');
  const actions = fresh ? `${button({ label: 'Add to binder', icon: 'cards', variant: 'primary', action: 'pack-to-binder', id: 'pack-to-binder' })}${button({ label: 'Back to packs', variant: 'secondary', href: '#packs', action: 'pack-back' })}` : button({ label: 'Open your binder', icon: 'cards', href: '#binder' });
  return `<section class="pack-summary" aria-labelledby="pack-summary-title"><p class="pack-overline">${fresh ? 'Pack opened' : `Opened ${escape(dateTime(opened.pack.openedAt))}`}</p><h2 class="pack-heading" id="pack-summary-title" tabindex="-1">${escape(periodLabel(opened.pack.period))}</h2><p class="pack-summary-line">${escape(packSummaryText(entries))}</p><ul class="pack-summary-grid">${items}</ul><div class="pack-buttons">${actions}</div></section>`;
}

function drawSummaryThumbs(opened) {
  for (const canvas of document.querySelectorAll('canvas[data-summary]')) {
    const entry = opened.pack.entries.find(item => item.workItemId === canvas.dataset.summary);
    if (entry?.card) void drawThumbnail(canvas, copyCard(entry.card, { role: entry.copy?.role, pull: entry.pull })).then(ok => { canvas.dataset.drawn = ok ? 'true' : 'failed'; });
  }
}

function renderPacks() {
  if (view.ceremony && view.page === 'shelf') return;
  const titles = { shelf: ['Packs', 'Your cards from each period, with a cosmetic pull for every new one.'], odds: ['Pack odds', 'Every chance a pull is drawn with, published before you open a pack.'], pack: ['Opened pack', 'What this pack held and what it pulled.'] };
  const [title, subtitle] = titles[view.page];
  const content = view.page === 'odds' ? oddsPage() : view.page === 'pack' ? openedPage() : shelf();
  const actions = view.page === 'shelf' ? button({ label: 'Odds', href: '#packs/odds', size: 'sm', variant: 'ghost' }) : button({ label: 'Packs', href: '#packs', size: 'sm', variant: 'ghost', icon: 'pack' });
  renderHtml(shell(`<div class="packs-page" data-page="${view.page}">${content}</div>`, { title, subtitle, actions, wide: view.page !== 'odds', breadcrumbs: view.page === 'shelf' ? undefined : [{ label: 'Cards' }, { label: 'Packs', href: '#packs' }, { label: title }] }));
  if (view.page === 'pack' && view.opened) drawSummaryThumbs(view.opened);
  if (view.page === 'shelf') void startStage();
}

function startStage() {
  const stage = $('#pack-stage');
  const pack = view.data?.packs.find(entry => entry.next);
  if (!stage || !pack || stage.dataset.ready) return view.stageReady;
  stage.dataset.ready = 'true';
  view.stageReady = webglSupport() === 'none' ? Promise.resolve() : buildStage(stage, pack);
  return view.stageReady;
}

async function buildStage(stage, pack) {
  try {
    const { createPackCeremony } = await import('../cards/pack-scene.js');
    if (!stage.isConnected) return;
    const scene = await createPackCeremony(stage, { title: periodLabel(pack.period), subtitle: pack.demo ? 'Demo · no spend' : contentsLine(pack), count: pack.count, demo: pack.demo, seed: [...pack.id].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 7), reduced: reducedMotion(), software: webglSupport() === 'software', sounds: cardSounds });
    if (!stage.isConnected) { scene.dispose(); return; }
    stage.dataset.scene = 'ready';
    view.scene = scene;
    scene.onTearProgress = progress => { const hint = $('#pack-hint'); if (hint && progress > 0.05) hint.hidden = true; };
    scene.onTearComplete = () => void tearOpen(pack.id);
  } catch {
    stage.dataset.scene = 'failed';
  }
}

function setPrimary(label, { disabled = false } = {}) {
  const primary = $('#pack-primary');
  if (!primary) return;
  primary.querySelector('.button-label').textContent = label;
  primary.disabled = disabled;
  primary.querySelector('.kbd-group')?.remove();
}

function setPhase(phase) {
  const stage = $('#pack-stage');
  if (stage) stage.dataset.phase = phase;
  if (view.ceremony) view.ceremony.phase = phase;
}

function ordered(entries) {
  return [...entries.filter(entry => entry.kind === 'upgrade'), ...entries.filter(entry => entry.kind === 'new').sort((a, b) => a.intensity.level - b.intensity.level)];
}

function prepare(opened) {
  const odds = view.odds;
  return ordered(opened.pack.entries.filter(entry => entry.card).map(entry => {
    const copy = { role: entry.copy?.role, pull: entry.pull };
    const card = copyCard(entry.card, copy);
    const facts = faceFacts(cardView(card));
    let before = null;
    if (entry.kind === 'upgrade' && entry.moments.length) {
      const at = Date.parse(entry.moments[0].at) - 1000;
      before = faceFacts(cardView(copyCard(cardAsOf(entry.card, at), copy), { now: at }));
    }
    const fresh = entry.kind === 'new' && entry.pull;
    return { ...entry, facts, before, preview: Boolean(fresh && entry.pull.pattern !== 'none' && facts.coverage.level < 3), intensity: fresh ? pullIntensity(entry.pull, odds) : { level: 0, chargeMs: 450, burst: 30 }, pull: fresh ? entry.pull : null, shownPull: entry.pull, finishLabel: cardView(card).finish.label };
  }));
}

function titleMarkup(entry) {
  const card = `<p class="pack-title-card">${escape(entry.card.title)} · ${escape(roleLabel(entry.copy?.role))} copy</p>`;
  if (entry.kind === 'upgrade') return `<p class="pack-title-kind">Upgrade</p><p class="pack-title-main">${escape(entry.moments.map(momentText).join(' · '))}</p>${card}`;
  const pull = entry.pull;
  const bp = patternBasisPoints(view.odds, pull.pattern);
  const pattern = pull.pattern === 'none' ? 'Plain' : `${patternLabels[pull.pattern] ?? pull.pattern} foil`;
  const extras = pullExtras(pull);
  const preview = entry.preview ? `<p class="pack-title-note">Pattern preview: it covers more of the card as it earns its finish (now ${escape(entry.finishLabel)}).</p>` : '';
  return `<p class="pack-title-kind">New card</p><p class="pack-title-main" data-level="${entry.intensity.level}">${escape(pattern)}</p><p class="pack-title-odds">${escape(oddsPercent(bp))} · ${escape(oddsOneIn(bp))}</p>${extras.length ? `<p class="pack-title-extras">${extras.map(extra => `<span>${escape(extra)}</span>`).join('')}</p>` : ''}${card}${preview}`;
}

function spoken(entry, index, total) {
  return `Card ${index + 1} of ${total}: ${entry.card.title}. ${entry.kind === 'upgrade' ? `Upgrade: ${entry.moments.map(momentText).join(', ')}` : pullText(entry.pull)}.`;
}

async function tearOpen(id) {
  if (view.ceremony) return;
  view.ceremony = { id, phase: 'opening', entries: [], index: -1, startedAt: performance.now(), scene: null };
  view.release = effects.hold('pack');
  await Promise.race([view.stageReady ?? Promise.resolve(), new Promise(done => setTimeout(done, 4000))]);
  if (!view.ceremony) return;
  const scene = view.scene ?? null;
  view.ceremony.scene = scene;
  setPhase('opening');
  setPrimary('Opening…', { disabled: true });
  const hint = $('#pack-hint');
  if (hint) hint.hidden = true;
  setTimeout(() => { const skip = $('#pack-skip'); if (skip && view.ceremony) skip.dataset.shown = 'true'; }, effects.rules.skipAfterMs);
  try {
    const [opened] = await Promise.all([api(`/api/packs/${encodeURIComponent(id)}/open`, { method: 'POST', body: '{}' }), scene ? scene.tear() : Promise.resolve()]);
    if (!view.ceremony) return;
    view.ceremony.opened = opened;
    const entries = prepare(opened);
    view.ceremony.entries = entries;
    announce(`Pack opened: ${packSummaryText(opened.pack.entries).replace(/ · .*$/, '')}. Reveal them one by one.`);
    setPhase('dealing');
    if (scene) await scene.deal(entries);
    if (!view.ceremony) return;
    if (!entries.length) return showSummary();
    readyNext();
  } catch (error) {
    endCeremony();
    notify(error.message || 'The pack could not be opened.', true);
    await load();
  }
}

function readyNext() {
  const ceremony = view.ceremony;
  ceremony.index = ceremony.entries.findIndex(entry => !entry.revealed);
  if (ceremony.index < 0) return showSummary();
  setPhase('ready');
  const total = ceremony.entries.length;
  setPrimary(`Reveal card ${ceremony.index + 1} of ${total}`);
  const progress = $('#pack-progress');
  if (progress) progress.textContent = `${count(total - ceremony.index)} face down`;
  if (ceremony.scene) setTimeout(() => ceremony.scene?.prepare?.(ceremony.index), 50);
}

async function revealCurrent() {
  const ceremony = view.ceremony;
  const entry = ceremony.entries[ceremony.index];
  if (!entry) return;
  setPhase('charging');
  setPrimary('Revealing…', { disabled: true });
  const title = $('#pack-title');
  if (title) { title.innerHTML = ''; title.dataset.level = String(entry.intensity.level); }
  if (ceremony.scene) await ceremony.scene.reveal();
  else fallbackReveal(entry);
  if (view.ceremony !== ceremony) return;
  entry.revealed = true;
  if (title) title.innerHTML = titleMarkup(entry);
  announce(spoken(entry, ceremony.index, ceremony.entries.length));
  const tray = $('#pack-tray');
  if (tray) tray.insertAdjacentHTML('beforeend', `<li><span class="pack-tray-title">${escape(entry.card.title)}</span><span class="pack-tray-pull">${escape(entry.kind === 'upgrade' ? 'Upgrade' : pullText(entry.pull))}</span></li>`);
  setPhase('revealed');
  const last = ceremony.entries.every(item => item.revealed);
  setPrimary(last ? 'See summary' : 'Next card');
}

function fallbackReveal(entry) {
  const card = $('#pack-css-card');
  const pack = $('.pack-css');
  if (pack) pack.hidden = true;
  if (!card) return;
  card.hidden = false;
  card.dataset.finish = entry.facts.coverage.key;
  card.innerHTML = `<span class="pack-css-card-title">${escape(entry.card.title)}</span><span class="pack-css-card-pull">${escape(pullText(entry.shownPull))}</span>`;
}

async function advance() {
  const ceremony = view.ceremony;
  setPhase('moving');
  setPrimary('Next card', { disabled: true });
  const title = $('#pack-title');
  if (title) title.innerHTML = '';
  if (ceremony.scene) await ceremony.scene.advance();
  if (view.ceremony !== ceremony) return;
  readyNext();
}

function showSummary() {
  const ceremony = view.ceremony;
  const opened = ceremony?.opened;
  endCeremony();
  if (!opened) return void load();
  const heroElement = document.querySelector('.pack-hero');
  if (heroElement) heroElement.outerHTML = summaryPanel(opened, true);
  drawSummaryThumbs(opened);
  $('#pack-summary-title')?.focus({ preventScroll: true });
  announce(`Pack opened. ${packSummaryText(opened.pack.entries)}.`);
  view.lastOpened = opened;
}

function endCeremony() {
  view.ceremony?.scene?.dispose();
  view.scene?.dispose();
  view.scene = null;
  view.stageReady = null;
  view.ceremony = null;
  view.release?.();
  view.release = null;
}

async function primary(element) {
  const ceremony = view.ceremony;
  if (!ceremony) return tearOpen(element.dataset.id);
  if (ceremony.phase === 'ready') return revealCurrent();
  if (ceremony.phase === 'revealed') return ceremony.entries.every(entry => entry.revealed) ? showSummary() : advance();
}

function skip() {
  const ceremony = view.ceremony;
  if (!ceremony?.opened) return;
  ceremony.scene?.skip();
  showSummary();
}

function packKeys(event) {
  if (state.view !== 'packs' || view.page !== 'shelf' || event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return false;
  if (event.key !== ' ' && event.key !== 'Enter') return false;
  if (event.target instanceof Element && event.target.closest('button, a, input, select, summary')) return false;
  const button = $('#pack-primary');
  if (!button || button.disabled) return false;
  event.preventDefault();
  button.click();
  return true;
}

async function load() {
  const request = ++view.request;
  view.loading = true;
  view.error = '';
  renderPacks();
  try {
    if (view.page === 'odds') view.odds = await api('/api/packs/odds');
    else if (view.page === 'pack') { const [opened, odds] = await Promise.all([api(`/api/packs/${encodeURIComponent(view.packId)}`), view.odds ? view.odds : api('/api/packs/odds')]); if (request !== view.request) return; view.opened = opened; view.odds = odds; }
    else { const [data, odds] = await Promise.all([api('/api/packs'), view.odds ? view.odds : api('/api/packs/odds')]); if (request !== view.request) return; view.data = data; view.odds = odds; }
  } catch (error) { if (request !== view.request) return; if (error.status !== 401) view.error = error.message; }
  view.loading = false;
  if (state.view === 'packs' && request === view.request) renderPacks();
}

async function enterPacks({ page = 'shelf', id } = {}) {
  disconnect(); state.session = null; state.view = 'packs';
  endCeremony();
  view.page = page;
  view.packId = id;
  if (page === 'pack') view.opened = null;
  await load();
}

/** Packs (`#packs`, `#packs/odds`, `#packs/<id>`): the signed-in person's packs in order, the rip ceremony for the next sealed one, the published odds and each opened pack's contents. */
export default {
  id: 'packs',
  match: hash => {
    if (hash === 'packs') return { page: 'shelf' };
    if (hash === 'packs/odds') return { page: 'odds' };
    const opened = /^packs\/([A-Za-z0-9_.:@~-]{1,120})$/.exec(hash);
    return opened ? { page: 'pack', id: decodeURIComponent(opened[1]) } : null;
  },
  enter: enterPacks,
  render: renderPacks,
  actions: {
    'pack-stage': () => { const phase = view.ceremony?.phase; if (phase === 'ready' || phase === 'revealed') $('#pack-primary')?.click(); },
    'pack-primary': primary,
    'pack-skip': skip,
    'pack-to-binder': () => { location.hash = '#binder'; },
    'pack-back': (element, event) => { event?.preventDefault?.(); void load(); },
  },
  changes: { '[data-pack-sound]': element => { prefs.set('cardSound', element.checked); announce(element.checked ? 'Card sound on' : 'Card sound off'); } },
  keys: [packKeys],
};
