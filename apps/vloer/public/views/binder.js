import { state, disconnect, onForget } from '../core/state.js';
import { api } from '../core/api.js';
import { $, escape, renderHtml, announce } from '../core/dom.js';
import { count, dateTime, plural, relative } from '../core/format.js';
import { button, callout, chip, demoNote, emptyState, skeleton, stat } from '../core/ui.js';
import { buildHash } from '../core/route.js';
import { shell } from '../shell.js';
import { cardView } from '../cards/card-model.js';
import { cardAsOf, copyCard, momentText, oddsPercent, patternBasisPoints, periodLabel, pullText, roleLabel } from '../cards/collection-model.js';
import { drawThumbnail, thumbnailsSupported } from '../cards/thumbs.js';
import '../cards/unfold-card.js';

const view = { data: null, odds: null, error: '', loading: false, focus: null, team: '', role: '', away: null, awayIndex: 0, awayTimer: 0, played: false, request: 0 };
onForget(() => { stopAway(); Object.assign(view, { data: null, odds: null, error: '', loading: false, focus: null, team: '', role: '', away: null, awayIndex: 0, played: false, request: view.request + 1 }); });

const sleeveMark = '<svg class="binder-sleeve-mark" viewBox="0 0 64 64" focusable="false"><path class="sheet" d="M52.625 9.758L11.079 27.437A1.8 1.8 0 0 0 10.949 30.688L28.354 39.805A1.5 1.5 0 0 0 30.199 39.44L53.782 11.321A1 1 0 0 0 52.625 9.758Z"/><path class="fold" d="M53.371 19.067L43.778 53.011A1.8 1.8 0 0 1 40.773 53.795L31.398 44.42A1.5 1.5 0 0 1 31.309 42.395L51.642 18.152A1 1 0 0 1 53.371 19.067Z"/></svg>';
const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
const wait = ms => new Promise(done => { view.awayTimer = setTimeout(done, ms); });

function visibleCopies() {
  return (view.data?.copies ?? []).filter(entry => (!view.team || entry.card.team === view.team) && (!view.role || entry.copy.role === view.role));
}

function focused() {
  const copies = view.data?.copies ?? [];
  return copies.find(entry => entry.card.workItemId === view.focus) ?? visibleCopies()[0] ?? copies[0] ?? null;
}

function packOf(entry) {
  if (!entry.copy.waitingIn) return '';
  const week = /^([0-9]{4})-W([0-9]{2})$/.exec(entry.copy.waitingIn);
  return week ? `Week ${Number(week[2])} · ${week[1]}` : entry.copy.waitingIn.replace('~', ' sprint from ');
}

function readouts(data) {
  const r = data.readouts;
  return `<div class="binder-readouts" role="group" aria-label="Your collection">${[
    stat({ label: 'Cards', value: count(r.cards), detail: r.pulled ? `${count(r.pulled)} pulled from packs` : 'None pulled yet' }),
    stat({ label: 'Released', value: count(r.released), detail: 'Live in production' }),
    stat({ label: 'Days live', value: count(r.daysLive), detail: 'Across your released cards' }),
    stat({ label: 'Days live this quarter', value: count(r.daysLiveThisQuarter), detail: `Added in ${r.quarter.replace('-', ' ')} so far` }),
    stat({ label: 'Mends', value: count(r.mends), detail: r.mends ? 'Cracks fixed on your cards' : 'No mends' }),
  ].join('')}</div>`;
}

function filters(data) {
  const teams = data.filters.teams;
  const roles = data.filters.roles;
  const teamSelect = teams.length > 1 ? `<label class="binder-filter"><span>Team</span><select id="binder-team" aria-label="Team">${['', ...teams].map(team => `<option value="${escape(team)}"${team === view.team ? ' selected' : ''}>${team ? escape(team) : 'All teams'}</option>`).join('')}</select></label>` : '';
  const roleButtons = roles.length > 1 ? `<div class="segmented binder-roles" role="group" aria-label="Role">${['', ...roles].map(role => `<button type="button" class="segment" data-action="binder-role" data-role="${escape(role)}" aria-pressed="${role === view.role}">${role ? escape(roleLabel(role)) : 'All roles'}</button>`).join('')}</div>` : '';
  return teamSelect || roleButtons ? `<div class="binder-filters">${teamSelect}${roleButtons}</div>` : '';
}

function slot(entry) {
  const id = entry.card.workItemId;
  const v = cardView(copyCard(entry.card, entry.copy));
  const waiting = entry.copy.waitingIn && !entry.copy.pull;
  const caption = `<span class="binder-slot-title">${escape(v.title)}</span><span class="binder-slot-meta">${escape(roleLabel(entry.copy.role))} · ${escape(v.finish.label)}${entry.copy.pull ? ` · ${escape(pullText(entry.copy.pull))}` : ''}</span>`;
  const picture = waiting
    ? `<span class="binder-sleeve" aria-hidden="true">${sleeveMark}<span class="binder-sleeve-text">Pull waiting<br>${escape(packOf(entry))} pack</span></span>`
    : thumbnailsSupported() ? `<canvas class="binder-thumb" data-thumb="${escape(id)}" aria-hidden="true"></canvas>` : `<span class="binder-mini" aria-hidden="true" data-finish="${escape(v.finish.key)}"><span class="binder-mini-state">${escape(v.state.label)}</span><span class="binder-mini-title">${escape(v.title)}</span><span class="binder-mini-finish">${escape(v.finish.label)}</span></span>`;
  return `<li><button type="button" class="binder-slot" data-action="binder-focus" data-id="${escape(id)}" aria-pressed="${focused()?.card.workItemId === id}" aria-label="${escape(`${v.title}, ${roleLabel(entry.copy.role)} copy, ${v.finish.label}${waiting ? `, waiting in your ${packOf(entry)} pack` : ''}`)}">${picture}${caption}</button></li>`;
}

function spotlightDetails(entry) {
  if (!entry) return '';
  const v = cardView(copyCard(entry.card, entry.copy));
  const pull = entry.copy.pull;
  const bp = pull ? patternBasisPoints(view.odds, pull.pattern) : null;
  const pullLine = pull ? `<div class="binder-pull"><p class="binder-pull-name">${escape(pullText(pull))}${bp !== null ? ` <span class="binder-odds">${escape(oddsPercent(bp))} chance</span>` : ''}</p><p class="binder-pull-meta">Pulled ${escape(dateTime(pull.pulledAt))} from your ${escape(periodLabel(periodFromId(pull.packId)))} pack</p></div>` : entry.copy.waitingIn ? `<div class="binder-pull"><p>Its pull waits in your <a href="#packs">${escape(packOf(entry))} pack</a>. Until you open it, the card shows its own pattern.</p></div>` : '<div class="binder-pull"><p>No pull: its moments came before your packs began. It shows its own pattern until a new moment brings it into a pack.</p></div>';
  const roles = entry.copy.roles.length ? entry.copy.roles.map(role => chip({ label: roleLabel(role) })).join('') : '';
  const steward = entry.copy.steward ? chip({ label: 'Steward', icon: 'shield', title: 'You answer for this change' }) : '';
  return `<div class="binder-focus-facts"><h2 class="binder-focus-title">${escape(v.title)}</h2><p class="binder-focus-roles" aria-label="Your roles">${roles}${steward}</p>${pullLine}<p class="binder-focus-link"><a href="#work/${escape(entry.card.workItemId)}">Open Work Item #${escape(entry.card.workItemId)}</a>${entry.lastActivityAt ? ` · last moment ${escape(relative(entry.lastActivityAt))}` : ''}</p></div>`;
}

function periodFromId(id) {
  const week = /^([0-9]{4})-W([0-9]{2})$/.exec(id ?? '');
  if (week) return { kind: 'week', week: Number(week[2]), year: Number(week[1]) };
  const [team, start] = String(id ?? '').split('~');
  return { kind: 'sprint', team, start: `${start}T00:00:00Z`, end: `${start}T00:00:00Z` };
}

function awayBanner() {
  const away = view.away;
  if (!away?.length) return '';
  if (reducedMotion()) return `<div class="binder-away" role="status"><p class="binder-away-title">While you were away</p><ul class="binder-away-list">${away.map(moment => `<li><strong>${escape(titleOf(moment.workItemId))}</strong> · ${escape(momentText(moment))}</li>`).join('')}</ul>${button({ label: 'Done', size: 'sm', variant: 'secondary', action: 'binder-away-skip' })}</div>`;
  const moment = away[Math.min(view.awayIndex, away.length - 1)];
  return `<div class="binder-away" role="status" aria-live="polite"><p class="binder-away-title">While you were away <span class="binder-away-count">${count(Math.min(view.awayIndex + 1, away.length))} of ${count(away.length)}</span></p><p class="binder-away-moment"><strong>${escape(titleOf(moment.workItemId))}</strong> · ${escape(momentText(moment))}</p>${button({ label: 'Skip', size: 'sm', variant: 'ghost', action: 'binder-away-skip' })}</div>`;
}

function titleOf(id) {
  return view.data?.copies.find(entry => entry.card.workItemId === id)?.card.title ?? `Work Item #${id}`;
}

function spotlight() {
  const entry = focused();
  if (!entry) return '';
  return `<section class="binder-spotlight" aria-labelledby="binder-spotlight-title"><h2 class="sr-only" id="binder-spotlight-title">Focused card</h2><div id="binder-away">${awayBanner()}</div><div class="binder-stage"><unfold-card id="binder-focus" class="binder-focus-card"></unfold-card></div><div id="binder-focus-facts">${spotlightDetails(entry)}</div></section>`;
}

function notices(data) {
  const parts = [];
  if (data.demo) parts.push(demoNote('Demo binder · illustrative cards · no model calls, no spend'));
  if (data.identity.source === 'none') parts.push(callout({ tone: 'neutral', icon: 'user', title: 'Tell Unfold which logins are yours', body: '<p>Your binder finds your copies of Run cards by the forge and tracker logins on each card\'s roster.</p>', actions: button({ label: 'Add your logins', href: '#settings/cards', variant: 'primary', size: 'sm' }) }));
  if (data.source.kind === 'scan') parts.push(`<p class="binder-source">Ploeg has no card list yet, so Vloer read your Teams' ${count(data.source.scanned)} most recently updated Work Items${data.source.truncated ? ' and may have missed older cards' : ''}.</p>`);
  return parts.join('');
}

function renderBinder() {
  const data = view.data;
  const actions = `${button({ label: 'Packs', icon: 'pack', href: '#packs', size: 'sm' })}${button({ label: 'Card logins', icon: 'user', href: '#settings/cards', size: 'sm', variant: 'ghost' })}`;
  let content;
  if (!data && view.loading) content = skeleton({ rows: 6, variant: 'cards' });
  else if (!data) content = callout({ tone: 'danger', title: 'Could not open your binder', body: `<p>${escape(view.error || 'The workbench did not answer.')}</p>` });
  else if (!data.copies.length) content = `${notices(data)}${emptyState({ icon: 'cards', title: 'No cards yet', body: data.identity.logins.length ? 'No card in your Teams lists your logins on its roster yet. Cards appear here when you carry, review, test or accept a Work Item.' : 'Add your logins and your copies appear here.' })}`;
  else {
    const copies = visibleCopies();
    content = `${notices(data)}${readouts(data)}<div class="binder-layout">${spotlight()}<section class="binder-collection" aria-labelledby="binder-grid-title"><div class="binder-collection-head"><h2 class="binder-section-title" id="binder-grid-title">${plural(copies.length, 'card')} <span>newest moment first</span></h2>${filters(data)}</div>${copies.length ? `<ul class="binder-grid">${copies.map(slot).join('')}</ul>` : '<p class="binder-empty-filter">No card matches these filters.</p>'}</section></div>`;
  }
  renderHtml(shell(content, { title: 'Binder', subtitle: 'Your copies of Run cards. Private: only you can see this page.', actions, wide: true }));
  if (data?.copies.length) { mountFocus(); drawThumbs(); }
}

function mountFocus({ asOf = null, card = null } = {}) {
  const element = $('#binder-focus');
  const entry = focused();
  if (!element || !entry) return;
  element.asOf = asOf;
  element.card = card ?? copyCard(entry.card, entry.copy);
}

function drawThumbs() {
  for (const canvas of document.querySelectorAll('canvas[data-thumb]')) {
    const entry = view.data.copies.find(item => item.card.workItemId === canvas.dataset.thumb);
    if (entry) void drawThumbnail(canvas, copyCard(entry.card, entry.copy)).then(ok => { if (ok) canvas.dataset.drawn = 'true'; else canvas.dataset.drawn = 'failed'; });
  }
}

function setFocus(id) {
  view.focus = id;
  for (const button of document.querySelectorAll('.binder-slot')) button.setAttribute('aria-pressed', String(button.dataset.id === id));
  const facts = $('#binder-focus-facts');
  if (facts) facts.innerHTML = spotlightDetails(focused());
  mountFocus();
}

function stopAway() {
  clearTimeout(view.awayTimer);
  view.awayTimer = 0;
}

function finishAway() {
  stopAway();
  view.away = null;
  const banner = $('#binder-away');
  if (banner) banner.innerHTML = '';
  mountFocus();
}

async function playAway() {
  const away = view.away;
  const run = view.request;
  for (let index = 0; index < away.length; index++) {
    if (view.away !== away || run !== view.request) return;
    view.awayIndex = index;
    const moment = away[index];
    const entry = view.data.copies.find(item => item.card.workItemId === moment.workItemId);
    if (!entry) continue;
    if (view.focus !== entry.card.workItemId) setFocus(entry.card.workItemId);
    const banner = $('#binder-away');
    if (banner) banner.innerHTML = awayBanner();
    const at = Date.parse(moment.at);
    mountFocus({ asOf: at - 1000, card: copyCard(cardAsOf(entry.card, at - 1000), entry.copy) });
    await wait(900);
    if (view.away !== away || run !== view.request) return;
    const later = away.slice(index + 1).some(next => next.workItemId === moment.workItemId);
    mountFocus(later ? { asOf: at + 1000, card: copyCard(cardAsOf(entry.card, at + 1000), entry.copy) } : {});
    announce(`${entry.card.title}: ${momentText(moment)}`);
    await wait(2400);
  }
  if (view.away === away) finishAway();
}

async function load() {
  const request = ++view.request;
  view.loading = true;
  renderBinder();
  try {
    const [data, odds] = await Promise.all([api('/api/binder'), view.odds ? Promise.resolve(view.odds) : api('/api/packs/odds')]);
    if (request !== view.request) return;
    view.data = data;
    view.odds = odds;
    view.error = '';
    if (!data.copies.some(entry => entry.card.workItemId === view.focus)) view.focus = data.copies[0]?.card.workItemId ?? null;
    if (!view.played && data.away.length) { view.away = data.away; view.awayIndex = 0; }
    view.played = true;
    api('/api/binder/seen', { method: 'POST', body: JSON.stringify({ until: data.seenUntil }) }).catch(() => {});
  } catch (error) {
    if (request !== view.request) return;
    if (error.status !== 401) view.error = error.message;
  }
  view.loading = false;
  if (state.view !== 'binder') return;
  renderBinder();
  if (view.away?.length && !reducedMotion()) void playAway();
}

async function enterBinder({ query = {} } = {}) {
  disconnect(); state.session = null; state.view = 'binder';
  stopAway();
  view.played = false;
  view.away = null;
  if (query.card) view.focus = query.card;
  await load();
}

/** The binder (`#binder`): the signed-in person's own copies of Run cards, newest moment first, a focused card in 3D, personal readouts and, once per visit, what changed while they were away. */
export default {
  id: 'binder',
  match: hash => hash === 'binder' ? {} : null,
  enter: enterBinder,
  render: renderBinder,
  actions: {
    'binder-focus': element => { if (view.away) finishAway(); setFocus(element.dataset.id); const hash = `#${buildHash('binder', { card: element.dataset.id })}`; if (location.hash !== hash) history.replaceState(null, '', hash); $('#binder-focus')?.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' }); },
    'binder-role': element => { view.role = element.dataset.role; renderBinder(); },
    'binder-away-skip': () => { finishAway(); announce('Caught up'); },
  },
  changes: { '#binder-team': element => { view.team = element.value; renderBinder(); } },
};
