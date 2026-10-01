import { render as nativeRender } from '../vloer-native/skin.js';
import { attachSkin, coin, crackPaths, figures, gradeName, honours, markSeed, skinView } from '../../skin-kit.js';

/** The skin's name, matching its folder and manifest. */
export const id = 'loot';

const subgradeCodes = [['REL', 'reliability'], ['DUR', 'durability'], ['DEL', 'delivery'], ['REV', 'review']];
const effectCap = 4;
const pieceCap = 7;
const lineBudget = 7;
const safeId = view => String(view.id ?? '').replace(/[^A-Za-z0-9_-]/g, '') || 'card';

function rootAttributes(view, layout, h) {
  const e = h.escape;
  return `class="sk lt" data-skin-root data-layout="${layout}" data-finish="${e(view.finish.key)}" data-level="${e(view.finish.level)}" data-tone="${e(view.state.tone)}"${view.condition ? ` data-condition="${e(view.condition.state)}"` : ''}${view.grade?.labelKey ? ` data-label="${e(view.grade.labelKey)}"` : ''}${view.set ? ` data-set="${view.set.setCard ? 'card' : 'child'}"` : ''}${view.set?.complete ? ' data-complete' : ''}`;
}

function pageIcon(view) {
  const lengths = [8, 11, 6, 9];
  const total = view.diff.known ? view.diff.additions + view.diff.deletions : 0;
  const share = total ? view.diff.additions / total : 0;
  const adds = !total ? 0 : view.diff.deletions && view.diff.additions ? Math.min(3, Math.max(1, Math.round(share * 4))) : view.diff.additions ? 4 : 0;
  const lines = lengths.map((length, index) => {
    const kind = !view.diff.known ? 'ctx' : index < adds ? 'add' : 'del';
    return `<path class="lt-ln lt-${kind}" d="M15 ${15 + index * 4}h${length}"/>`;
  }).join('');
  const seal = view.state.key === 'merged' ? '<circle class="lt-seal" cx="29" cy="30" r="5.5"/><circle class="lt-seal-glint" cx="27.5" cy="28.5" r="1.6"/>' : view.pr ? '<circle class="lt-seal lt-open" cx="29" cy="30" r="5"/>' : '';
  return `<svg class="lt-art" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><path class="lt-pg" d="M11 7h15l5 5v21H11z"/><path class="lt-fold" d="M26 7v5h5"/>${lines}${seal}</svg>`;
}

function pendantIcon() {
  return `<svg class="lt-art" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><path class="lt-chain" d="M13 5 Q20 13 27 5"/><path class="lt-mount" d="M20 12 L29 21 L20 35 L11 21 Z"/><path class="lt-gem" d="M20 15 L26 21.5 L20 31 L14 21.5 Z"/><path class="lt-facet" d="M20 15 L23 21 L20 22 L17 21 Z"/><circle class="lt-bail" cx="20" cy="9" r="1.6"/></svg>`;
}

function crack(view) {
  if (!view.condition) return '';
  const paths = crackPaths(markSeed(view), { x: 64, y: 30, reach: 1.2 });
  const draw = paths.map(path => `<path d="${path.d}" pathLength="1" data-root="${path.root}"${path.branch ? ' class="lt-br"' : ''}/>`).join('');
  const mended = view.condition.state === 'mended';
  const gold = `lt-kin-${safeId(view)}`;
  return `<svg class="lt-crack${mended ? ' lt-mended' : ''}" viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    ${mended ? `<defs><linearGradient id="${gold}" gradientUnits="userSpaceOnUse" x1="30" y1="0" x2="100" y2="80"><stop offset="0" stop-color="#8a5a10"/><stop offset=".45" stop-color="#ffe08a"/><stop offset=".6" stop-color="#e2a92a"/><stop offset="1" stop-color="#9c6812"/></linearGradient></defs>` : ''}
    <g class="lt-core">${draw}</g><g class="lt-edge">${draw}</g>
    ${mended ? `<g class="lt-gold" stroke="url(#${gold})">${draw}</g><g class="lt-glint">${draw}</g>` : ''}
  </svg>`;
}

function signature(view, h) {
  const e = h.escape;
  const steward = view.steward;
  if (!steward.signed) return `<div class="lt-sig lt-off" data-slot="steward"><span class="lt-sig-lbl">Binds when<b>signed</b></span><span class="lt-sig-line"><em>unsigned · ${e(steward.detail)}</em></span><span class="sr-only">${e(steward.text)}</span></div>`;
  return `<div class="lt-sig" data-slot="steward" title="${e(steward.detail || steward.text)}"><span class="lt-sig-lbl">Soulbound to<b>${e(steward.name)}</b></span><span class="lt-sig-line" aria-hidden="true"><span class="lt-ink">${e(steward.name)}</span><svg class="lt-flour" viewBox="0 0 120 16" preserveAspectRatio="none" focusable="false"><path d="M4 11 C 30 4, 52 15, 78 8 S 110 6, 116 3" pathLength="1"/></svg></span><span class="sr-only">${e(steward.text)}</span></div>`;
}

function appraisal(view, h) {
  const e = h.escape;
  const grade = view.grade;
  if (!grade) return '<div class="lt-appr lt-pending"><b class="lt-gnum" aria-hidden="true">?</b><span class="lt-gname"><em>Not graded yet</em><small>Unidentified</small></span></div>';
  const subs = subgradeCodes.map(([code, key]) => { const part = grade.subgrades.find(entry => entry.key === key); return `<span>${code} <b>${e(part ? part.text : '—')}</b></span>`; }).join('');
  const qualifiers = grade.qualifiers.map(entry => `<i class="lt-qual" title="${e(entry.text)}">${e(entry.code)}</i>`).join('');
  const label = grade.label || 'Appraised';
  return `<div class="lt-appr" data-label="${e(grade.labelKey)}" title="${e(grade.description)}">
    <b class="lt-gnum" aria-hidden="true">${e(grade.text)}</b>
    <span class="lt-gname" aria-hidden="true"><em>${e(gradeName(grade.overall))}${qualifiers}</em><small>${e(label)}${grade.provisional ? '<i class="lt-prov">provisional</i>' : ''}</small></span>
    <span class="lt-subs" aria-hidden="true">${subs}</span>
    <span class="sr-only">${e(grade.description)}</span>
  </div>`;
}

function mergedOn(view) {
  const row = view.tabs?.find(tab => tab.id === 'life')?.rows.find(entry => entry.label === 'Merged');
  return row && row.status === 'ok' ? row.value.replace(/\s+\d{1,2}:\d{2}$/, '') : '';
}

function reviewedByPerson(view) {
  const row = view.tabs?.find(tab => tab.id === 'review')?.rows.find(entry => entry.label === 'Reviews by people');
  return Boolean(row && row.status === 'ok' && /[1-9]/.test(row.value));
}

function effects(view) {
  const first = [];
  const rest = [];
  if (view.state.key === 'merged' && view.pr) { const on = mergedOn(view); rest.push(['use', `Use: Merged ${view.pr.text}${on ? ` on ${on}` : ''}`]); }
  else if (view.pr) rest.push(['use', `Use: Pull request ${view.pr.text} ${view.pr.state.label.toLowerCase()}`]);
  else rest.push(['req', 'Requires: a pull request']);
  for (const entry of honours(view)) {
    if (entry.key === 'black-label') first.push(['gold', 'Equip: Black label grade']);
    else if (entry.key === 'gold-label') first.push(['gold', 'Equip: Gold label grade']);
    else if (entry.key === 'live' && view.finish.level >= 4) first.push(['gold', `Equip: ${view.finish.label} finish, ${view.release.dayText}`]);
    else if (entry.key === 'green-ci') rest.push(['equip', `Equip: Green CI on ${view.pr.text}`]);
    else if (entry.key === 'first-pass') rest.push(['equip', 'Equip: First pass, one Round']);
    else if (entry.key === 'right-first-time') rest.push(['equip', 'Equip: Right first time through the gates']);
    else if (entry.key === 'mended') first.push(['gold', `Kintsugi: ${view.condition.text.replace(/^Mended(?: · )?/, '') || 'mended'}`]);
    else if (entry.key === 'cracked') first.push(['dmg', `Damaged: ${view.condition.text.replace(/^Cracked(?: · )?/, '') || 'a confirmed bug'}`]);
    else if (entry.key.startsWith('q-')) rest.push(['flaw', `Flaw: ${entry.label}`]);
  }
  const all = [...first.filter(([tone]) => tone === 'dmg'), ...first.filter(([tone]) => tone !== 'dmg'), ...rest];
  const shown = all.length > effectCap ? all.slice(0, effectCap - 1) : all;
  return { shown, more: all.length - shown.length };
}

function tabRow(view, tabId, label) {
  const row = view.tabs?.find(tab => tab.id === tabId)?.rows.find(entry => entry.label === label);
  return row && row.status === 'ok' && /[1-9]/.test(row.value) ? row.value : '';
}

function budget(view) {
  const { shown, more } = effects(view);
  const effectRows = shown.length + (more ? 1 : 0);
  const extras = (view.gates ? 1 : 0) + (view.set && !view.set.setCard ? 1 : 0);
  return { stats: Math.max(0, Math.min(3, lineBudget - extras - effectRows)) };
}

function statLines(view, h) {
  const e = h.escape;
  const lines = [
    [tabRow(view, 'change', 'Files changed'), 'Files changed'],
    [view.plays.count ? String(view.plays.count) : '', view.plays.count === 1 ? 'Play' : 'Plays'],
    [tabRow(view, 'agent', 'Runs'), 'Runs'],
    [tabRow(view, 'agent', 'Tool calls'), 'Tool calls'],
  ].filter(([value]) => value).slice(0, budget(view).stats);
  return lines.length ? `<div class="lt-stats">${lines.map(([value, label]) => `<p>+${e(value)} ${e(label)}</p>`).join('')}</div>` : '';
}

function effectLines(view, h) {
  const e = h.escape;
  const { shown, more } = effects(view);
  return `<div class="lt-aff">${shown.map(([tone, text]) => `<p data-tone="${tone}">${e(text)}</p>`).join('')}${more ? `<p class="lt-more">+${e(more)} more on the back</p>` : ''}</div>`;
}

function sockets(view, h) {
  const e = h.escape;
  const pr = view.pr;
  const list = [
    ['pr', pr ? `PR ${pr.text}` : 'PR', Boolean(pr), pr ? `Pull request ${pr.text} opened` : 'No pull request yet'],
    ['ci', 'CI', pr?.ci?.key === 'success', pr ? pr.ciText : 'No CI yet'],
    ['review', 'Review', reviewedByPerson(view), reviewedByPerson(view) ? 'Reviewed by a person' : 'No review by a person yet'],
    ['merge', 'Merge', view.state.key === 'merged', view.state.key === 'merged' ? 'Merged' : 'Not merged'],
  ];
  return `<div class="lt-socks">${list.map(([key, label, on, text]) => `<span class="lt-sock" data-sock="${key}"${on ? ' data-on' : ''} title="${e(text)}"><i aria-hidden="true"></i>${e(label)}<span class="sr-only">: ${e(text)}</span></span>`).join('')}</div>`;
}

function gatesRow(view, h) {
  const gates = view.gates;
  if (!gates) return '';
  const e = h.escape;
  const pips = gates.steps.map(step => `<i${step.reached ? ' data-reached' : ''}${step.current ? ' data-current' : ''}${step.bounces ? ' data-bounced' : ''} title="${e(step.label)}"></i>`).join('');
  const tail = gates.bounces.length ? `<em class="lt-bn">${e(gates.text.slice(gates.label.length + 3))}</em>` : gates.rightFirstTime ? '<em class="lt-rft">Right first time</em>' : '<em>no bounces</em>';
  return `<div class="lt-gates" title="${e(`Delivery: ${gates.text}`)}"><span class="lt-gl">Gates</span><span class="lt-pips" aria-hidden="true">${pips}</span><b>${e(gates.label)}</b>${tail}</div>`;
}

function setStrip(view, h) {
  const set = view.set;
  if (!set || set.setCard) return '';
  const e = h.escape;
  const pips = Array.from({ length: set.size }, (_, index) => { const member = set.members.find(entry => entry.number === index + 1); return `<i data-state="${e(member?.state ?? 'open')}"${index + 1 === set.number ? ' data-self' : ''}></i>`; }).join('');
  return `<div class="lt-setline" title="${e(`${set.text} · ${set.progress}`)}"><span class="lt-setpips" aria-hidden="true">${pips}</span><span class="lt-settx"><b>${e(`${set.number}/${set.size}`)}</b> · ${e(set.title)}</span></div>`;
}

function durability(view, h) {
  const e = h.escape;
  const release = view.release;
  if (!release.released) {
    const live = figures(view).live.value;
    return `<div class="lt-dur lt-off"><div class="lt-row"><span>Durability · ${e(view.finish.label)}</span><span>${e(live)}</span></div><div class="lt-bar" aria-hidden="true"><i data-step="0"></i></div><p class="lt-next">${e(release.reported === false ? 'This Ploeg reports no releases yet' : 'Days live start at the release to production')}</p></div>`;
  }
  const next = release.next;
  const step = next ? Math.max(0, Math.min(20, Math.round(((release.days - release.finish.days) / (next.finish.days - release.finish.days)) * 20))) : 20;
  const note = next ? `Next finish: ${next.text}` : `${release.finish.label}: top of the ladder`;
  return `<div class="lt-dur" title="${e(release.label)}"><div class="lt-row"><span>Durability · ${e(release.finish.label)}${next ? ` <i class="lt-arrow">→</i> ${e(next.finish.label)}` : ''}</span><span>${e(release.dayText)}</span></div><div class="lt-bar" aria-hidden="true"><i data-step="${step}"></i></div><p class="lt-next">${e(note)}${release.source === 'merge' ? ' · counted from merge' : ''}</p></div>`;
}

function costLine(view, h) {
  const e = h.escape;
  const parts = coin(view);
  const amount = parts.top === 'Cost' ? parts.main : `${parts.top} ${parts.main}`;
  const coins = parts.status === 'demo' || parts.status === 'not_reported' ? '' : '<i class="lt-coin" aria-hidden="true"></i><i class="lt-coin lt-silver" aria-hidden="true"></i>';
  return `<div class="lt-cost" data-slot="cost" data-status="${e(parts.status)}" role="img" aria-label="${e(view.cost.label)}"><span>Cost:</span><b>${e(amount)}</b>${coins}${parts.caption ? `<span class="lt-cap">${e(parts.caption)}</span>` : ''}</div>`;
}

function stateChip(view, h) {
  const e = h.escape;
  return `<span class="lt-state" data-slot="state" data-tone="${e(view.state.tone)}" title="${e(view.state.description || '')}">${e(view.state.label)}</span>`;
}

function qualityRow(view, h) {
  const e = h.escape;
  const release = view.release;
  const condition = view.condition ? `<span class="lt-cond" data-condition="${e(view.condition.state)}" title="${e(view.condition.text)}">(${e(view.condition.label)})</span>` : '';
  return `<div class="lt-q"><span class="lt-fin">${e(view.finish.label)}</span><span class="lt-dim">${release.released ? e(release.dayText) : 'not live yet'}</span>${condition}${view.demo ? '<b class="lt-demo" title="Illustrative record: no model calls, no spend">Demo</b>' : ''}</div>`;
}

function madeBy(view, h) {
  const e = h.escape;
  const crew = view.crew === 'No agent Runs yet' ? 'No agent Runs yet' : `Made by ${view.crew}`;
  return `<p class="lt-made">&lt;${e(crew)}${view.team ? ` · Team ${e(view.team)}` : ''}&gt;</p>`;
}

function roleLine(view) {
  const role = view.crew === 'No agent Runs yet' ? '' : view.crew.split(' · ')[0].replace(/ ×\d+$/, '');
  const named = role ? `${role[0].toUpperCase()}${role.slice(1)}'s patch` : 'Run card';
  return `${named}${view.rounds ? ` · Round ${view.rounds}` : ''}`;
}

function frame(view) {
  const level = view.finish.level;
  return `<div class="lt-bg" aria-hidden="true"><i class="lt-smoke"></i>${level >= 1 ? '<i class="lt-sheen"></i>' : ''}${level >= 2 ? '<i class="lt-ench"></i>' : ''}</div>
    <i class="lt-runes lt-top" aria-hidden="true"></i><i class="lt-runes lt-bot" aria-hidden="true"></i>${level >= 3 ? '<i class="lt-lit lt-top" aria-hidden="true"></i><i class="lt-lit lt-bot" aria-hidden="true"></i>' : ''}
    <i class="lt-cn lt-tl" aria-hidden="true"></i><i class="lt-cn lt-tr" aria-hidden="true"></i><i class="lt-cn lt-bl" aria-hidden="true"></i><i class="lt-cn lt-br" aria-hidden="true"></i>
    ${level >= 4 ? '<i class="lt-fil lt-tl" aria-hidden="true"></i><i class="lt-fil lt-tr" aria-hidden="true"></i><i class="lt-fil lt-bl" aria-hidden="true"></i><i class="lt-fil lt-br" aria-hidden="true"></i>' : ''}`;
}

function rim(view) {
  return view.finish.level >= 5 ? '<i class="lt-rim-glow" aria-hidden="true"></i><i class="lt-rim" aria-hidden="true"></i>' : '';
}

function fx(view, h) {
  const e = h.escape;
  const floats = [
    view.release.released ? `<span class="lt-float" data-for="finish">New finish · ${e(view.finish.label)}</span>` : '',
    view.state.key === 'merged' && view.pr ? `<span class="lt-float" data-for="merged">Loot: merged ${e(view.pr.text)}</span>` : '',
    view.condition?.state === 'cracked' ? '<span class="lt-float" data-for="crack">Damaged</span>' : '',
    view.condition?.state === 'mended' ? '<span class="lt-float" data-for="mend">Repaired</span>' : '',
    view.steward.signed ? '<span class="lt-float" data-for="signed">Soulbound</span>' : '',
  ].join('');
  return `<div class="lt-fx" aria-hidden="true"><i class="lt-beam"></i><i class="lt-beam lt-core"></i><i class="lt-flash"></i><i class="lt-ring"></i>${floats}</div>`;
}

function idsLine(view, h) {
  const e = h.escape;
  return `<div class="lt-ids"><span data-slot="ids">${e(view.ids.join(' · '))}</span></div>`;
}

function standard(view, h) {
  const e = h.escape;
  const diff = view.diff;
  const lines = diff.known
    ? `<span><b class="lt-lines"><span class="lt-a">${e(diff.addText)}</span> / <span class="lt-r">${e(diff.delText)}</span></b> Lines</span>`
    : `<span><b class="lt-lines lt-unk">—</b> ${e(view.pr ? diff.value : 'No diff yet')}</span>`;
  const sub = `Tokens: ${view.tokens.value}${view.demo ? ' · demo' : ''}`;
  return `<article ${rootAttributes(view, 'standard', h)} aria-label="Run card: ${e(view.title)}">
    <div class="sk-card">${rim(view)}
      <div class="lt-tip">${frame(view)}
        <header class="lt-hd"><div class="lt-icon">${pageIcon(view)}</div><div class="lt-hx"><h3 class="lt-title" data-slot="title"><span>${e(view.title)}</span></h3><div class="lt-type"><span>${e(roleLine(view))}</span>${stateChip(view, h)}</div></div></header>
        ${qualityRow(view, h)}
        <div class="lt-dmg">${lines}<span class="lt-time">${e(view.runTime.value)}</span></div>
        <p class="lt-tok">${e(sub)}</p>
        ${statLines(view, h)}
        ${effectLines(view, h)}
        ${sockets(view, h)}
        ${gatesRow(view, h)}
        ${setStrip(view, h)}
        ${appraisal(view, h)}
        <p class="lt-flavor">“${e(view.state.description || view.state.label)}”</p>
        <div class="lt-grow"><i class="lt-orn" aria-hidden="true"></i></div>
        ${durability(view, h)}
        ${signature(view, h)}
        ${madeBy(view, h)}
        ${costLine(view, h)}
        ${idsLine(view, h)}
        ${crack(view)}
        ${fx(view, h)}
      </div>
    </div>
    <button type="button" class="sk-more" data-card-action="flip">More info${h.icon('chevron')}</button>
  </article>`;
}

function embers(view) {
  if (!view.set?.complete) return '';
  return `<div class="lt-embers" aria-hidden="true">${Array.from({ length: 8 }, (_, index) => `<i data-n="${index + 1}"></i>`).join('')}</div>`;
}

function setCard(view, h) {
  const e = h.escape;
  const set = view.set;
  const pieces = Array.from({ length: Math.min(set.size, pieceCap) }, (_, index) => {
    const member = set.members.find(entry => entry.number === index + 1);
    const state = member?.state ?? 'open';
    const name = member ? member.title || member.ref || 'Work Item' : 'Not in the set yet';
    return `<div class="lt-piece" data-state="${e(state)}" data-n="${index + 1}" title="${e(member ? [member.ref, member.title, member.stateText].filter(Boolean).join(' · ') : name)}"><span class="lt-pn">${e(`${index + 1}/${set.size}`)}</span><span class="lt-pt">${e(name)}</span><span class="lt-ps">${e(member ? member.stateText.toLowerCase() : 'open')}</span></div>`;
  }).join('');
  const hidden = set.size - Math.min(set.size, pieceCap);
  const goal = set.complete ? 'Set complete. Every Work Item settled: 30 days live.' : `Completes when all ${set.size} Work Items have settled: 30 days live.`;
  return `<article ${rootAttributes(view, 'set', h)} aria-label="Set Card: ${e(view.title)}">
    <div class="sk-card">${rim(view)}
      <div class="lt-tip">${frame(view)}${embers(view)}
        <header class="lt-banner"><div class="lt-bt"><span class="lt-kind">${set.complete ? 'Set complete' : 'Set Card'} · Set of ${e(set.size)}${set.ref ? ` · ${e(set.ref)}` : ''}</span><h3 class="lt-title" data-slot="title"><span>${e(view.title)}</span></h3><div class="lt-type"><span>${e(set.size)} Work Items · ${e(set.progress)}</span>${stateChip(view, h)}</div></div><div class="lt-icon lt-big">${set.complete ? '<i class="lt-pillar" aria-hidden="true"></i>' : ''}${pendantIcon()}</div></header>
        ${qualityRow(view, h)}
        <div class="lt-setb">
          <div class="lt-setn">${e(set.title)} (<b>${e(set.settled)}</b>/${e(set.size)} settled)</div>
          ${pieces}
          ${hidden ? `<p class="lt-more">+${e(hidden)} more on the back</p>` : ''}
          <div class="lt-bon"><p class="lt-tally">${e(`${set.settled} settled · ${set.merged - set.settled} merged · ${set.size - set.merged} open`)}</p><p class="lt-goal"${set.complete ? ' data-on' : ''}>(${e(set.size)}) ${e(goal)}</p></div>
        </div>
        <div class="lt-dur lt-setdur"><div class="lt-row"><span>Settled</span><span>${e(set.progress)}</span></div><div class="lt-bar" aria-hidden="true"><i data-step="${e(Math.round((set.settled / set.size) * 20))}"></i></div></div>
        ${appraisal(view, h)}
        <div class="lt-grow"><i class="lt-orn" aria-hidden="true"></i></div>
        ${signature(view, h)}
        ${madeBy(view, h)}
        ${costLine(view, h)}
        ${idsLine(view, h)}
        ${crack(view)}
        ${fx(view, h)}
      </div>
    </div>
    <button type="button" class="sk-more" data-card-action="flip">More info${h.icon('chevron')}</button>
  </article>`;
}

/**
 * Draws one face of a card as markup. The front is an RPG item tooltip: a smoky panel in a bronze frame with corner
 * gems and a rune band, an item icon tile drawn from the diff, a serif small-caps title tinted by the earned finish,
 * green effect lines drawn only from facts, sockets for pull request, CI, review by a person and merge, an appraisal box
 * for the grade, a durability bar for the days live toward the next finish and a "Soulbound to" line for the Steward.
 * Each finish adds one layer (a sheen, an enchantment, lit runes, gold filigree, an ember rim). An epic's Set Card lists
 * its pieces like an item set. The back is Vloer Native's tabs in the skin's colours.
 * @param {object} view The `cardView` model.
 * @param {{ face: 'front' | 'back', escape: Function, icon: Function, link: Function }} h
 * @returns {string}
 */
export function render(view, h) {
  if (h.face === 'back') return nativeRender(view, h);
  const drawn = skinView(view);
  return drawn.set?.setCard ? setCard(drawn, h) : standard(drawn, h);
}

/**
 * Lights the drawn front: the pointer tilts the tooltip and moves the light across the finish layers, the light
 * drifts while idle, and a change between two draws plays its moment (see `attachSkin`).
 * @param {Element} face The front face the runtime drew.
 * @param {object} view The `cardView` model.
 * @returns {() => void}
 */
export function attach(face, view) {
  return attachSkin(face, view, { tilt: 10 });
}
