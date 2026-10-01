import { render as nativeRender } from '../vloer-native/skin.js';
import { attachSkin, coin, crackPaths, figures, gradeName, honours, markSeed, rarityFrame, rarityMark, seeded, skinView } from '../../skin-kit.js';

/** The skin's name, matching its folder and manifest. */
export const id = 'holo';

const finishReminder = { matte: 'Matte: not live in production yet, or under 7 days.', foil: 'Foil: 7 days in production.', holo: 'Holo: 30 days in production.', prism: 'Prism: 90 days in production.', gilded: 'Gilded: 180 days in production.', infinity: 'Infinity: a year in production.' };
const subgradeCodes = [['REL', 'reliability'], ['DUR', 'durability'], ['DEL', 'delivery'], ['REV', 'review']];

function art(view) {
  const random = seeded(markSeed(view) ^ 0x51ed);
  const total = view.diff.known ? view.diff.additions + view.diff.deletions : 0;
  const share = total ? view.diff.additions / total : 0.5;
  const shown = view.diff.known ? Math.max(4, Math.min(14, Math.round(Math.log2(total + 1) * 1.6))) : 6;
  const rows = Array.from({ length: 14 }, (_, index) => {
    const indent = [0, 1, 1, 2, 2, 1, 2, 3, 2, 1, 1, 2, 1, 0][index];
    const kind = !view.diff.known || index >= shown ? 'ctx' : random() < share ? 'add' : 'del';
    const width = 36 + random() * 110;
    const tail = random() > 0.55 ? 10 + random() * 26 : 0;
    const x = 18 + indent * 12;
    const y = 12 + index * 8.2;
    return `<g class="hr-row" data-kind="${kind}"><rect x="${x}" y="${y}" width="${width.toFixed(1)}" height="4.2" rx="2.1"/>${tail ? `<rect x="${(x + width + 6).toFixed(1)}" y="${y}" width="${tail.toFixed(1)}" height="4.2" rx="2.1"/>` : ''}</g>`;
  }).join('');
  const gutter = Array.from({ length: 14 }, (_, index) => `<text x="6" y="${(16 + index * 8.2).toFixed(1)}">${index + 1}</text>`).join('');
  return `<svg class="hr-code" viewBox="0 0 240 132" preserveAspectRatio="xMinYMin slice" aria-hidden="true" focusable="false"><g class="gutter">${gutter}</g>${rows}</svg>`;
}

function crack(view) {
  if (!view.condition) return '';
  const paths = crackPaths(markSeed(view), { x: 58, y: 40 });
  const draw = paths.map(path => `<path d="${path.d}" pathLength="1" data-root="${path.root}"${path.branch ? ' class="br"' : ''}/>`).join('');
  const mended = view.condition.state === 'mended';
  return `<svg class="hr-crack${mended ? ' mended' : ''}" viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs><linearGradient id="hr-gold-${view.id}" gradientUnits="userSpaceOnUse" x1="10" y1="0" x2="100" y2="90"><stop offset="0" stop-color="#8a5a12"/><stop offset=".3" stop-color="#ffe08a"/><stop offset=".55" stop-color="#d49a2a"/><stop offset=".8" stop-color="#fff2c0"/><stop offset="1" stop-color="#a8701a"/></linearGradient></defs>
    <g class="shade">${draw}</g><g class="fissure">${draw}</g><g class="lip">${draw}</g>
    ${mended ? `<g class="gold" stroke="url(#hr-gold-${view.id})">${draw}</g><g class="glint">${draw}</g>` : ''}
  </svg>`;
}

function signature(view, h) {
  const e = h.escape;
  if (!view.steward.signed) return `<div class="hr-sig off" data-slot="steward"><span class="x" aria-hidden="true">×</span><i class="ln" aria-hidden="true"></i><small>Unsigned · ${e(view.steward.detail)}</small><span class="sr-only">${e(view.steward.text)}</span></div>`;
  return `<div class="hr-sig" data-slot="steward"><span class="pen" aria-hidden="true"><span class="name">${e(view.steward.name)}</span><svg class="swash" viewBox="0 0 120 14" preserveAspectRatio="none" focusable="false"><path d="M2 9 C 22 2, 34 13, 54 7 S 92 1, 118 6" pathLength="1"/></svg></span><i class="ln" aria-hidden="true"></i><small>Steward · ${e(view.steward.detail || 'signed')}</small><span class="sr-only">${e(view.steward.text)}</span></div>`;
}

function slab(view, h) {
  const e = h.escape;
  const grade = view.grade;
  if (!grade) return `<div class="hr-slab pending"><span>Not graded yet</span><b class="num" aria-hidden="true">—</b></div>`;
  const parts = subgradeCodes.map(([code, key]) => { const part = grade.subgrades.find(entry => entry.key === key); return `<span>${code}<b>${e(part ? part.text : '—')}</b></span>`; }).join('');
  const label = grade.label || `Unfold grading · #${view.id}`;
  const qualifiers = grade.qualifiers.map(entry => `<i class="q" title="${e(entry.text)}">${e(entry.code)}</i>`).join('');
  return `<div class="hr-slab" data-label="${e(grade.labelKey)}" title="${e(grade.description)}">
    <div class="name"><small>${e(label)}</small><b>${e(gradeName(grade.overall))}${grade.provisional ? '<em>prov.</em>' : ''}</b></div>
    <div class="subs">${parts}</div>
    <div class="score">${qualifiers}<b class="num">${e(grade.text)}</b></div>
    <span class="sr-only">${e(grade.description)}</span>
  </div>`;
}

function honourLine(view, h) {
  const e = h.escape;
  const list = honours(view).filter(entry => entry.key !== 'signed');
  const words = list.length ? `<p class="kw">${list.map(entry => `<b data-tone="${e(entry.tone)}">${e(entry.label)}</b>`).join(', ')}</p>` : '<p class="kw quiet">No honours yet.</p>';
  const reminder = view.release?.released ? `${finishReminder[view.finish.key]}${view.release.next ? ` ${view.release.next.text}.` : ''}` : view.state.description || '';
  const flavor = view.condition ? view.condition.text : view.gates ? `Delivery: ${view.gates.text}.` : '';
  return `${words}${reminder ? `<p class="hr-rem">(${e(reminder)})</p>` : ''}${flavor ? `<p class="flavor">${e(flavor)}</p>` : ''}`;
}

function setStrip(view, h) {
  const set = view.set;
  if (!set || set.setCard) return '';
  const e = h.escape;
  const pips = Array.from({ length: set.size }, (_, index) => { const member = set.members.find(entry => entry.number === index + 1); return `<i data-state="${e(member?.state ?? 'open')}"${index + 1 === set.number ? ' data-self' : ''}></i>`; }).join('');
  return `<div class="hr-setline" title="${e(set.text)}"><span class="pips" aria-hidden="true">${pips}</span><span class="txt">${e(`${set.number}/${set.size}`)} · ${e(set.title)}</span></div>`;
}

function layers(view) {
  const level = view.finish.level;
  return `<i class="mat" aria-hidden="true"></i>${level >= 5 ? '<i class="rim-glow" aria-hidden="true"></i><i class="rim" aria-hidden="true"></i>' : ''}${level >= 1 ? '<i class="foil" aria-hidden="true"></i>' : ''}${level >= 4 ? '<i class="glitter" aria-hidden="true"></i>' : ''}`;
}

function windowLayers(view) {
  const level = view.finish.level;
  return `<i class="art-bg"></i>${level >= 2 ? '<i class="holo"></i>' : ''}${level >= 3 ? '<i class="cosmos"></i>' : ''}`;
}

function coinMarkup(view, h) {
  const e = h.escape;
  const parts = coin(view);
  return `<div class="hr-coin" data-slot="cost" data-status="${e(parts.status)}" role="img" aria-label="${e(view.cost.label)}"><small>${e(parts.top)}</small><b>${e(parts.main)}</b>${parts.caption ? `<span>${e(parts.caption)}</span>` : ''}</div>`;
}

function stateChip(view, h) {
  const e = h.escape;
  return `<span class="hr-chip" data-slot="state" data-tone="${e(view.state.tone)}" title="${e(view.state.description || '')}"><i aria-hidden="true"></i><span>${e(view.state.label)}</span></span>`;
}

function finishTag(view, h) {
  const e = h.escape;
  const release = view.release;
  if (!release?.released) return '';
  return `<span class="hr-fin" title="${e(release.label)}"><b>${e(release.dayText)}</b> · ${e(release.finish.label)}</span>`;
}

function seal(view, h) {
  if (view.state.key !== 'merged' || !view.pr) return '';
  return `<div class="hr-seal" aria-hidden="true"><b>Merged</b><small>${h.escape(view.pr.text)}</small></div>`;
}

function base(view, h) {
  const e = h.escape;
  const condition = view.condition ? `<span class="hr-cond" data-condition="${e(view.condition.state)}" title="${e(view.condition.text)}">${e(view.condition.label)}</span>` : view.gates ? `<span class="hr-cond" title="${e(view.gates.text)}">${e(view.gates.label)}</span>` : '<span class="hr-cond"></span>';
  const credit = view.crew === 'No agent Runs yet' ? `Team ${view.team || 'unknown'}` : `Illus. ${view.crew}${view.team ? ` · Team ${view.team}` : ''}`;
  return `<div class="hr-base"><span class="il">${e(credit)}</span>${condition}<span class="hr-ids" data-slot="ids">${e(view.ids.join(' · '))}</span>${view.demo ? '<b class="hr-demo" title="Illustrative record: no model calls, no spend">Demo</b>' : ''}</div>`;
}

function rootAttributes(view, layout, h) {
  const e = h.escape;
  return `class="sk hr" data-skin-root data-layout="${layout}" data-finish="${e(view.finish.key)}" data-level="${e(view.finish.level)}" data-tone="${e(view.state.tone)}"${view.condition ? ` data-condition="${e(view.condition.state)}"` : ''}${view.grade?.labelKey ? ` data-label="${e(view.grade.labelKey)}"` : ''}${view.set ? ` data-set="${view.set.setCard ? 'card' : 'child'}"` : ''}${view.set?.complete ? ' data-complete' : ''}`;
}

function roleLine(view) {
  const role = view.crew === 'No agent Runs yet' ? '' : view.crew.split(' · ')[0].replace(/ ×\d+$/, '');
  const named = role ? role[0].toUpperCase() + role.slice(1) : 'Run card';
  return `${named}${view.rounds ? ` · Round ${view.rounds}` : ''}`;
}

function standard(view, h) {
  const e = h.escape;
  const facts = figures(view);
  return `<article ${rootAttributes(view, 'standard', h)} aria-label="Run card: ${e(view.title)}">
    <div class="sk-card">${rarityFrame(view)}${layers(view)}
      <div class="face">
        <header class="head"><h3 class="hr-title" data-slot="title"><span>${e(view.title)}</span></h3>${coinMarkup(view, h)}</header>
        <div class="art">${windowLayers(view)}${art(view)}${stateChip(view, h)}${finishTag(view, h)}${signature(view, h)}${seal(view, h)}<i class="scan" aria-hidden="true"></i></div>
        <div class="typebar"><span>${e(roleLine(view))}</span><span class="hr-tb-end"><span class="hr-plays">${e(view.plays.text)}</span>${rarityMark(view, h)}</span></div>
        ${setStrip(view, h)}
        <div class="box">${honourLine(view, h)}</div>
        ${slab(view, h)}
        <div class="foot">
          <dl class="stats">
            <dt>Time</dt><dd>${e(facts.time.value)}</dd>
            <dt>Tokens</dt><dd>${e(facts.tokens.value)}</dd>
            <dt>PR</dt><dd>${e(facts.pr.value)}</dd>
            <dt>Live</dt><dd>${e(facts.live.value)}</dd>
          </dl>
          <div class="lines"><div>${view.diff.known ? `<b><span class="a">${e(view.diff.addText)}</span><span class="sl">/</span><span class="r">${e(view.diff.delText)}</span></b><small>${e(view.diff.filesText || 'Lines')}</small>` : `<b class="unknown">—</b><small>${e(view.pr ? view.diff.value : 'No diff yet')}</small>`}</div></div>
        </div>
        ${base(view, h)}
        ${crack(view)}
      </div>
      <div class="fx" aria-hidden="true"><i class="edge"></i><i class="sweep"></i><span class="banner">New finish · ${e(view.finish.label)}</span></div>
      <i class="glare" aria-hidden="true"></i>
    </div>
    <button type="button" class="sk-more" data-card-action="flip">More info${h.icon('chevron')}</button>
  </article>`;
}

function constellation(view, h) {
  const e = h.escape;
  const set = view.set;
  const size = set.size;
  const hub = [150, 96];
  const nodes = Array.from({ length: size }, (_, index) => {
    const t = size === 1 ? 0.5 : index / (size - 1);
    const x = 30 + t * 240;
    const y = 18 + Math.sin(t * Math.PI) * -6 + Math.abs(t - 0.5) * 30;
    const member = set.members.find(entry => entry.number === index + 1);
    return { x, y, number: index + 1, state: member?.state ?? 'open' };
  });
  const lines = nodes.map(node => `<path class="link" data-state="${node.state}" d="M${node.x.toFixed(1)} ${node.y.toFixed(1)} Q${((node.x + hub[0]) / 2).toFixed(1)} ${((node.y + hub[1]) / 2 + 14).toFixed(1)} ${hub[0]} ${hub[1]}" pathLength="1"/>`).join('');
  const dots = nodes.map(node => `<g class="node" data-state="${node.state}"><circle cx="${node.x.toFixed(1)}" cy="${node.y.toFixed(1)}" r="${node.state === 'open' ? 5 : 6.5}"/><text x="${node.x.toFixed(1)}" y="${(node.y + 17).toFixed(1)}">${node.number}/${size}</text></g>`).join('');
  return `<svg class="constel" viewBox="0 0 300 122" aria-hidden="true" focusable="false">${lines}${dots}<g class="hub"><circle class="halo" cx="${hub[0]}" cy="${hub[1]}" r="20"/><path d="M150 80 L155 91 L167 92 L158 100 L161 112 L150 106 L139 112 L142 100 L133 92 L145 91 Z"/></g></svg><span class="sr-only">${e(set.progress)}</span>`;
}

function setCard(view, h) {
  const e = h.escape;
  const set = view.set;
  const slots = Array.from({ length: set.size }, (_, index) => {
    const member = set.members.find(entry => entry.number === index + 1);
    const state = member?.state ?? 'open';
    return `<div class="slot" data-state="${e(state)}" title="${e(member ? `${member.ref ? `${member.ref} · ` : ''}${member.title} · ${member.stateText}` : 'Not in the set yet')}"><b aria-hidden="true">${state === 'open' ? index + 1 : '✓'}</b><small>${index + 1}/${set.size}</small></div>`;
  }).join('');
  return `<article ${rootAttributes(view, 'set', h)} aria-label="Set Card: ${e(view.title)}">
    <div class="sk-card">${rarityFrame(view)}${layers(view)}
      <div class="face">
        <div class="art full">${windowLayers(view)}${set.complete ? '<i class="rays" aria-hidden="true"></i>' : ''}</div>
        <header class="banner"><div class="tl"><span class="kind">${set.complete ? '★ Set complete' : 'Set Card'}${rarityMark(view, h)}</span><small>Set of ${e(set.size)}${set.ref ? ` · ${e(set.ref)}` : ''}</small><h3 class="hr-title" data-slot="title"><span>${e(view.title)}</span></h3></div>${coinMarkup(view, h)}</header>
        <div class="stage">${stateChip(view, h)}${constellation(view, h)}${signature(view, h)}</div>
        <div class="cond${set.complete ? ' done' : ''}"><span>${set.complete ? '<b>Set complete.</b> Every Work Item settled: 30 days live.' : `<b>Completes</b> when all ${e(set.size)} Work Items have settled: 30 days live.`}</span><em>${e(set.settled)}/${e(set.size)}</em><span class="bar" aria-hidden="true"><i data-step="${e(Math.round((set.settled / set.size) * 20))}"></i></span></div>
        <div class="slots">${slots}</div>
        <div class="glass"><p class="kwl">${e(`${set.settled} settled · ${set.merged - set.settled} merged · ${set.size - set.merged} open`)}</p>${slab(view, h)}</div>
        ${base(view, h)}
      </div>
      <div class="fx" aria-hidden="true"><i class="edge"></i><i class="sweep"></i></div>
      <i class="glare" aria-hidden="true"></i>
    </div>
    <button type="button" class="sk-more" data-card-action="flip">More info${h.icon('chevron')}</button>
  </article>`;
}

/**
 * Draws one face of a card as markup. The front is a foil trading card: a metal frame in its rarity's metal, with
 * the rarity's set symbol on the type line, whose finish layers stack from the earned finish (a foil frame, sun-pillar holo, a cosmos, gold glitter and a prismatic border), a code-diff art
 * window, the grade as a slab label, honours drawn only from facts, and cracks or gold kintsugi from the condition. An
 * epic's Set Card draws its members as a constellation. The back is Vloer Native's tabs in the skin's colours.
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
 * Lights the drawn front: the pointer tilts the card and moves the light across the foil layers, the light drifts
 * while idle, and a change between two draws plays its moment (see `attachSkin`).
 * @param {Element} face The front face the runtime drew.
 * @param {object} view The `cardView` model.
 * @returns {() => void}
 */
export function attach(face, view) {
  return attachSkin(face, view, { tilt: 14 });
}
