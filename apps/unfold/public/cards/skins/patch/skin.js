import { render as nativeRender } from '../unfold-native/skin.js';
import { attachSkin, coin, crackPaths, figures, gradeName, honours, initials, kpiStrip, markSeed, rarityFrame, rarityMark, seeded, skinView } from '../../skin-kit.js';
import { stableHash } from '../../card-model.js';

/** The skin's name, matching its folder and manifest. */
export const id = 'patch';

const subgradeCodes = [['REL', 'reliability'], ['DUR', 'durability'], ['DEL', 'delivery'], ['REV', 'review']];
const gateCodes = { development: 'Dev', test: 'Test', acceptance: 'Acc', done: 'Done' };
const objectiveWords = { open: 'Pending', merged: 'Taken', settled: 'Held' };
const objectiveNotes = { open: 'Pending: not merged yet', merged: 'Taken: merged', settled: 'Held: settled, 30 days live' };

function roleName(view) {
  if (view.crew === 'No agent Runs yet') return '';
  return view.crew.split(' · ')[0].replace(/ ×\d+$/, '');
}

function uidOf(view) {
  return markSeed(view).toString(36);
}

function starPath(cx, cy, r, k = 0.42) {
  let d = '';
  for (let index = 0; index < 10; index++) {
    const angle = -Math.PI / 2 + index * Math.PI / 5;
    const radius = index % 2 ? r * k : r;
    d += `${index ? 'L' : 'M'}${(cx + radius * Math.cos(angle)).toFixed(1)} ${(cy + radius * Math.sin(angle)).toFixed(1)}`;
  }
  return `${d}Z`;
}

function goldGradient(gid) {
  return `<linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7d5a12"/><stop offset=".42" stop-color="#ffe39a"/><stop offset=".6" stop-color="#b8892a"/><stop offset="1" stop-color="#ffd36b"/></linearGradient>`;
}

function wreath(gid) {
  const leaves = [];
  for (const side of [-1, 1]) {
    for (let index = 0; index < 9; index++) {
      const angle = (90 + side * (14 + index * 15)) * Math.PI / 180;
      for (const [radius, tilt] of [[65.5, -28], [71, 28]]) {
        const x = 64 + Math.cos(angle) * radius;
        const y = 64 + Math.sin(angle) * radius;
        const turn = (angle * 180) / Math.PI + 90 + side * tilt;
        leaves.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(5.6 - index * 0.25).toFixed(2)}" ry="2.3" transform="rotate(${turn.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`);
      }
    }
  }
  return `<g class="pt-wreath" fill="url(#${gid})"><path class="pt-stem" d="M60 132 A68 68 0 0 1 8 44 M68 132 A68 68 0 0 0 120 44" fill="none"/>${leaves.join('')}<path class="pt-tie" d="M56 128 L64 133 L72 128 L68 138 L64 135 L60 138 Z"/></g>`;
}

function patch(view, { top, bottom }) {
  const uid = uidOf(view);
  const level = view.finish.level;
  const gold = `pt-gold-${uid}`;
  const arcLong = text => (text.length > 15 ? ' pt-long' : '');
  const emblem = '<path class="pt-wing" d="M34 76 L64 52 L94 76 L64 68 Z"/><path class="pt-trail" d="M64 52 L64 92"/><path class="pt-trail" d="M55 90 L64 85 L73 90"/>';
  return `<svg class="pt-patch" viewBox="0 0 128 128" aria-hidden="true" focusable="false">
    <defs>
      <pattern id="pt-tw-${uid}" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect class="pt-tw" width="3" height="3"/><rect class="pt-tw-hi" width="1.3" height="3"/></pattern>
      <path id="pt-top-${uid}" d="M20 64 A44 44 0 0 1 108 64"/>
      <path id="pt-bot-${uid}" d="M17 64 A47 47 0 0 0 111 64"/>
      <clipPath id="pt-clip-${uid}"><circle cx="64" cy="64" r="37"/></clipPath>
      ${goldGradient(gold)}
    </defs>
    ${level >= 5 ? wreath(gold) : ''}
    <circle class="pt-backing" cx="64" cy="64" r="62"/>
    <circle class="pt-merrow" cx="64" cy="64" r="60"/>
    ${level >= 4 ? `<circle class="pt-bullion-base" cx="64" cy="64" r="60.4" stroke="url(#${gold})" pathLength="1"/><circle class="pt-bullion" cx="64" cy="64" r="60.4" stroke="url(#${gold})"/>` : ''}
    <circle cx="64" cy="64" r="56" fill="url(#pt-tw-${uid})"/>
    <circle class="pt-inner" cx="64" cy="64" r="38.5"/>
    <g clip-path="url(#pt-clip-${uid})"><rect class="pt-sky" x="20" y="20" width="88" height="88"/><rect class="pt-ground" x="20" y="80" width="88" height="40"/><circle class="pt-orbit" cx="64" cy="76" r="27"/><path class="pt-horizon" d="M27 80 H101"/>${emblem}</g>
    <text class="pt-arc pt-top${arcLong(top)}"><textPath href="#pt-top-${uid}" startOffset="50%" text-anchor="middle">${top}</textPath></text>
    <text class="pt-arc pt-bot${arcLong(bottom)}"><textPath href="#pt-bot-${uid}" startOffset="50%" text-anchor="middle" dominant-baseline="hanging">${bottom}</textPath></text>
    <circle class="pt-pin" cx="17" cy="64" r="2"/><circle class="pt-pin" cx="111" cy="64" r="2"/>
  </svg>`;
}

function patchLayers(view) {
  const level = view.finish.level;
  return `${level >= 1 ? '<i class="pt-thread" aria-hidden="true"></i>' : ''}${level >= 2 ? '<i class="pt-holo" aria-hidden="true"></i>' : ''}`;
}

function seal(view) {
  return view.finish.level >= 3 ? `<i class="pt-seal" aria-hidden="true"><svg viewBox="0 0 40 40" focusable="false"><circle class="pt-guil" cx="20" cy="20" r="15"/><circle class="pt-guil" cx="20" cy="20" r="11"/><path class="pt-sealstar" d="${starPath(20, 20.5, 8, 0.45)}"/></svg></i>` : '';
}

function chevrons(view) {
  const level = view.finish.level;
  const gold = level >= 4;
  const gid = `pt-chg-${uidOf(view)}`;
  const shapes = [];
  for (let index = 0; index < 3; index++) { const y = 3 + index * 9; shapes.push(`M5 ${y + 10} L30 ${y} L55 ${y + 10} L55 ${y + 15} L30 ${y + 5} L5 ${y + 15} Z`); }
  for (let index = 0; index < 2; index++) { const y = 34 + index * 8; shapes.push(`M5 ${y} Q30 ${y + 9} 55 ${y} L55 ${y + 5} Q30 ${y + 14} 5 ${y + 5} Z`); }
  const drawn = shapes.map((d, index) => {
    const on = index < level;
    return `<path data-chev="${index + 1}" class="${on ? `pt-on${gold ? ' pt-gold' : ''}` : 'pt-off'}" d="${d}"${on && gold ? ` fill="url(#${gid})"` : ''} pathLength="1"/>`;
  }).join('');
  return `<svg class="pt-chev" viewBox="0 0 60 58" aria-hidden="true" focusable="false"><defs>${goldGradient(gid)}</defs>${drawn}</svg>`;
}

function rank(view, h) {
  const e = h.escape;
  const release = view.release;
  const day = release?.released ? `${release.dayText} in service` : figures(view).live.value;
  const next = release?.released ? (release.next ? release.next.text : 'Top of the ladder') : '';
  return `<div class="pt-rank" title="${e(release?.released ? release.label : day)}">${chevrons(view)}<b>${e(view.finish.label)}</b><small>${e(day)}</small>${next ? `<small class="pt-nx">${e(next)}</small>` : ''}</div>`;
}

function stampFor(view) {
  const condition = view.condition;
  if (condition?.state === 'cracked') {
    const crack = condition.cracks.find(entry => !entry.mended) || condition.cracks[0];
    return { kind: 'damaged', main: 'Damaged', small: crack ? [crack.ref || 'Linked bug', crack.severity].filter(Boolean).join(' · ') : condition.label };
  }
  if (condition?.state === 'mended') {
    const crack = condition.cracks.find(entry => entry.mended?.pr !== null && entry.mended?.pr !== undefined);
    return { kind: 'repaired', main: 'Repaired', small: crack ? `Mended in #${crack.mended.pr}` : 'Mended' };
  }
  if (view.set?.setCard && view.set.complete) return { kind: 'campaign', main: 'Campaign complete', small: 'All objectives taken and held' };
  if (view.state.key === 'merged') return { kind: 'complete', main: 'Mission complete', small: view.release?.released ? `${view.release.dayText} in service` : 'Merged' };
  if (view.release?.released) return { kind: 'service', main: `${view.release.dayText} in service`, small: view.release.finish.label };
  return null;
}

function stamp(view, h) {
  const found = stampFor(view);
  if (!found) return '';
  const e = h.escape;
  return `<div class="pt-stamp" data-kind="${found.kind}" aria-hidden="true"><b>${e(found.main)}</b><small>${e(found.small)}</small><span class="pt-sp"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span></div>`;
}

function evaluation(view, h) {
  const e = h.escape;
  const grade = view.grade;
  if (!grade) return '<div class="pt-eval pt-pending"><div class="pt-hd"><span class="pt-k">Evaluation</span><b class="pt-nm">Not graded yet</b></div><div class="pt-score"><b class="pt-num">—</b><small>/10</small></div><div class="pt-subs"><span>Pending</span></div></div>';
  const parts = subgradeCodes.map(([code, key]) => { const part = grade.subgrades.find(entry => entry.key === key); return `<span>${code}<b>${e(part ? part.text : '—')}</b></span>`; }).join('');
  const qualifiers = grade.qualifiers.map(entry => `<i class="pt-q" title="${e(entry.text)}">${e(entry.code)}</i>`).join('');
  return `<div class="pt-eval" data-label="${e(grade.labelKey)}" title="${e(grade.description)}">
    <div class="pt-hd"><span class="pt-k">${e(grade.label || 'Evaluation')}</span><b class="pt-nm">${e(gradeName(grade.overall))}</b>${grade.provisional ? '<em class="pt-prov" title="Provisional grade">Prov.</em>' : ''}</div>
    <div class="pt-score"><b class="pt-num">${e(grade.text)}</b><small>/10</small>${qualifiers ? `<span class="pt-qs">${qualifiers}</span>` : ''}</div>
    <div class="pt-subs">${parts}</div>
    <span class="sr-only">${e(grade.description)}</span>
  </div>`;
}

function checkpoints(view, h) {
  const gates = view.gates;
  if (!gates) return '';
  const e = h.escape;
  const steps = gates.steps.map(step => `<li${step.reached ? ' data-reached' : ''}${step.current ? ' data-current' : ''} title="${e(step.label)}">${e(gateCodes[step.key] || step.label)}${step.bounces ? `<em title="${e(`${step.bounces} bounced back from here`)}">${e(step.bounces)}</em>` : ''}</li>`).join('');
  const bounces = gates.bounces.length;
  const result = gates.rank > 0 && gates.rightFirstTime ? '<span class="pt-res pt-ok">Right first time</span>' : bounces ? `<span class="pt-res pt-bad">${e(bounces === 1 ? '1 bounce' : `${bounces} bounces`)}</span>` : '<span class="pt-res">No bounces</span>';
  return `<div class="pt-gates" title="${e(`Delivery: ${gates.text}`)}"><span class="pt-k">Gates</span><ol>${steps}</ol>${result}</div>`;
}

function campaignStrip(view, h) {
  const set = view.set;
  if (!set || set.setCard) return '';
  const e = h.escape;
  const pips = Array.from({ length: set.size }, (_, index) => { const member = set.members.find(entry => entry.number === index + 1); return `<i data-state="${e(member?.state ?? 'open')}"${index + 1 === set.number ? ' data-self' : ''}></i>`; }).join('');
  return `<div class="pt-camp" title="${e(`${set.text} · ${set.progress}`)}"><span class="pt-k">Campaign</span><span class="pt-pips" aria-hidden="true">${pips}</span><span class="pt-t"><b>${e(`${set.number}/${set.size}`)}</b> · ${e(set.title)}</span></div>`;
}

function ribbons(view, h) {
  const e = h.escape;
  const list = honours(view).filter(entry => entry.key !== 'signed');
  const shown = list.slice(0, view.kpis?.headline?.length ? 3 : 9);
  const cells = shown.length
    ? shown.map(entry => `<li class="pt-rib" data-tone="${e(entry.tone)}" data-v="${stableHash(entry.key) % 3}" title="${e(entry.label)}"><i aria-hidden="true"></i><span>${e(entry.label)}</span></li>`).join('')
    : '<li class="pt-rib pt-empty"><i aria-hidden="true"></i><span>No ribbons yet</span></li><li class="pt-rib pt-empty" aria-hidden="true"><i></i></li><li class="pt-rib pt-empty" aria-hidden="true"><i></i></li>';
  const more = list.length > shown.length && !view.kpis?.headline?.length ? `<p class="pt-ribmore">+${e(list.length - shown.length)} more on the back</p>` : '';
  return `<div class="pt-sec"><span>Ribbons</span><span>${e(list.length === 1 ? '1 ribbon' : `${list.length} ribbons`)}</span></div><ul class="pt-rack">${cells}</ul>${more}`;
}

function fuel(view, h) {
  const e = h.escape;
  const parts = coin(view);
  const words = parts.status === 'demo' ? `${parts.main} · ${parts.caption}` : `${view.cost.value}${view.cost.caption ? ` · ${view.cost.caption}` : ''}`;
  const share = typeof view.cost.share === 'number' ? view.cost.share : null;
  const gauge = share === null ? '' : `<span class="pt-gauge" aria-hidden="true"><i data-step="${e(Math.round(Math.min(1, Math.max(0, share)) * 20))}"${view.cost.over ? ' data-over' : ''}></i></span>`;
  return `<div class="pt-fuel" data-slot="cost" data-status="${e(parts.status)}" role="img" aria-label="${e(view.cost.label)}"><span class="pt-k">Fuel</span><b>${e(words)}</b>${gauge}</div>`;
}

function stat(label, value, h, title = '') {
  const e = h.escape;
  return `<div class="pt-st"${title ? ` title="${e(title)}"` : ''}><span class="pt-k">${e(label)}</span><span class="pt-v">${value}</span></div>`;
}

function stats(view, h) {
  const e = h.escape;
  const facts = figures(view);
  const payload = view.diff.known ? `<span class="pt-a">${e(view.diff.addText)}</span> <span class="pt-r">${e(view.diff.delText)}</span>` : `<span class="pt-u">${e(view.diff.value)}</span>`;
  const quiet = (value, known) => (known ? e(value) : `<span class="pt-u">${e(value)}</span>`);
  return `<div class="pt-stats">${fuel(view, h)}${stat('Sortie time', quiet(facts.time.value, facts.time.known), h, `Run time: ${facts.time.value}`)}${stat('Payload', payload, h, `Diff: ${view.diff.value}`)}${stat('Target', quiet(facts.pr.value, facts.pr.known), h, `Pull request: ${facts.pr.value}`)}${stat('In service', quiet(facts.live.value, facts.live.known), h, view.release?.label || facts.live.value)}</div>`;
}

function remarks(view, h) {
  const e = h.escape;
  const release = view.release;
  const capital = text => (text ? text[0].toUpperCase() + text.slice(1) : '');
  const lines = [
    view.condition ? `${view.condition.text}.` : '',
    view.gates ? `Delivery: ${view.gates.text}.` : '',
    view.diff.known && view.diff.filesText ? `Payload ${view.diff.addText} ${view.diff.delText} across ${view.diff.filesText}.` : '',
    view.pr ? `${view.pr.ciText}.` : '',
    view.state.description,
    release?.released ? `${capital(release.label)}.` : release?.reported === false ? 'Days live are not reported.' : 'Not live in production yet.',
  ].filter(Boolean);
  return `<ul class="pt-remarks" aria-label="Remarks">${lines.map((line, index) => `<li>${index ? '' : '<span class="pt-k">Remarks</span>'}<span class="pt-rl">${e(line)}</span></li>`).join('')}</ul>`;
}

function signature(view, h) {
  const e = h.escape;
  const steward = view.steward;
  const crew = view.crew;
  const line = steward.signed
    ? `<span class="pt-ink"><span class="pt-name">${e(steward.name)}</span><svg class="pt-swash" viewBox="0 0 120 12" preserveAspectRatio="none" focusable="false"><path d="M2 8 C 24 2, 36 12, 58 6 S 96 1, 118 5" pathLength="1"/></svg></span>`
    : '<span class="pt-uns">× Unsigned</span>';
  const sealMark = steward.signed ? `<span class="pt-wax" aria-hidden="true"><b>${e(initials(steward.name) || '·')}</b></span>` : '';
  return `<div class="pt-sig${steward.signed ? '' : ' pt-off'}" data-slot="steward">
    <div class="pt-who"><span class="pt-k">Authenticated by · Steward</span><span class="pt-line">${line}${sealMark}</span><small>${e(steward.detail || (steward.signed ? 'Signed' : 'Unsigned'))}</small></div>
    <div class="pt-crew"><span class="pt-k">Executed by</span><b>${e(crew)}</b></div>
    <span class="sr-only">${e(steward.text)}</span>
  </div>`;
}

function tags(view, h) {
  const e = h.escape;
  const ids = view.ids;
  const first = [ids[0] || `#${view.id}`, ids[1] || (view.team ? `Team ${view.team}` : view.plays.text)];
  const second = [ids[2] || view.repo || (view.team ? `Team ${view.team}` : 'No repository'), view.team ? `Team ${view.team}` : view.plays.text];
  const tag = lines => `<span class="pt-tag" aria-hidden="true">${lines.map(line => `<span>${e(line)}</span>`).join('')}</span>`;
  return `<div class="pt-tags" data-slot="ids"><span class="sr-only">${e(ids.join(' · '))}</span>${tag(first)}${tag(second)}</div>`;
}

function meta(view, h) {
  const e = h.escape;
  const condition = view.condition ? ` · <b class="pt-condl" data-condition="${e(view.condition.state)}" title="${e(view.condition.text)}">${e(view.condition.label)}</b>` : '';
  return `<div class="pt-meta"><span>${e(view.finish.label)} finish${condition}</span><span>${e(view.plays.text)}${view.demo ? '<b class="pt-demo" title="Illustrative record: no model calls, no spend">Demo</b>' : ''}</span></div>`;
}

function band(text, h, bottom = false) {
  return `<div class="pt-band${bottom ? ' pt-bot' : ''}"><span>${h.escape(text)}</span></div>`;
}

function crack(view) {
  if (!view.condition) return '';
  const paths = crackPaths(markSeed(view), { x: 24, y: 28, reach: 1.05 });
  const draw = paths.map(path => `<path d="${path.d}" pathLength="1" data-root="${path.root}"${path.branch ? ' class="pt-br"' : ''}/>`).join('');
  const mended = view.condition.state === 'mended';
  const gid = `pt-kin-${uidOf(view)}`;
  return `<svg class="pt-crack${mended ? ' pt-mended' : ''}" viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    ${mended ? `<defs><linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="80" y2="90"><stop offset="0" stop-color="#8a5a12"/><stop offset=".3" stop-color="#ffe08a"/><stop offset=".55" stop-color="#c98f22"/><stop offset=".8" stop-color="#fff2c0"/><stop offset="1" stop-color="#a8701a"/></linearGradient></defs>` : ''}
    <g class="pt-shade">${draw}</g><g class="pt-rip">${draw}</g><g class="pt-lip">${draw}</g>
    ${mended ? `<g class="pt-gold" stroke="url(#${gid})">${draw}</g><g class="pt-stitch">${draw}</g>` : ''}
  </svg>`;
}

function fx(view, h) {
  const e = h.escape;
  return `<div class="pt-fx" aria-hidden="true"><span class="pt-fstamp"><b>New finish</b><small>${e(view.finish.label)}${view.release?.released ? ` · ${e(view.release.dayText)} in service` : ''}</small></span></div>`;
}

function rootAttributes(view, layout, h) {
  const e = h.escape;
  return `class="sk pt" data-skin-root data-layout="${layout}" data-finish="${e(view.finish.key)}" data-level="${e(view.finish.level)}" data-tone="${e(view.state.tone)}"${view.condition ? ` data-condition="${e(view.condition.state)}"` : ''}${view.grade?.labelKey ? ` data-label="${e(view.grade.labelKey)}"` : ''}${view.set ? ` data-set="${view.set.setCard ? 'card' : 'child'}"` : ''}${view.set?.complete ? ' data-complete' : ''}`;
}

function header(kind, view, h) {
  const e = h.escape;
  return `<header class="pt-hdr"><span class="pt-kind">${e(kind)}</span>${rarityMark(view, h)}<span class="pt-state" data-slot="state" data-tone="${e(view.state.tone)}" title="${e(view.state.description || '')}">${e(view.state.label)}</span></header>`;
}

function standard(view, h) {
  const e = h.escape;
  const role = roleName(view);
  const top = role ? role.toUpperCase() : 'WORK ITEM';
  const bottom = role && view.rounds ? `ROUND ${view.rounds} · #${view.id}` : `#${view.id}`;
  return `<article ${rootAttributes(view, 'standard', h)} aria-label="Run card: ${e(view.title)}">
    <div class="sk-card">${rarityFrame(view)}<i class="pt-paper" aria-hidden="true"></i>
      ${band(`${view.finish.label} finish`, h)}
      ${header('Mission debrief', view, h)}
      <div class="pt-hero">
        <div class="pt-pwrap">${patch(view, { top: e(top), bottom: e(bottom) })}${patchLayers(view)}</div>
        ${rank(view, h)}${seal(view)}${stamp(view, h)}
      </div>
      ${evaluation(view, h)}
      ${checkpoints(view, h)}
      ${campaignStrip(view, h)}
      ${ribbons(view, h)}
      <div class="pt-sec"><span>After-action</span><span>Work Item #${e(view.id)}</span></div>
      <h3 class="pt-title" data-slot="title"><span>${e(view.title)}</span></h3>
      ${stats(view, h)}
      ${view.kpis?.headline?.length ? kpiStrip(view, h, { label: 'Key figures' }) : remarks(view, h)}
      ${signature(view, h)}
      ${tags(view, h)}
      ${meta(view, h)}
      ${band(`${view.finish.label} finish`, h, true)}
      ${crack(view)}
      ${fx(view, h)}
    </div>
    <button type="button" class="sk-more" data-card-action="flip">More info${h.icon('chevron')}</button>
  </article>`;
}

function opsMap(view, h) {
  const e = h.escape;
  const set = view.set;
  const size = Math.max(1, set.size);
  const random = seeded(markSeed(view) ^ 0x0b5e);
  const pattern = [78, 40, 72, 30, 66, 36, 80, 28];
  const nodes = Array.from({ length: size }, (_, index) => {
    const x = size === 1 ? 128 : 24 + index * (210 / (size - 1));
    let y = pattern[index % pattern.length] + (random() - 0.5) * 10;
    if (x > 196) y = Math.min(y, 48);
    const member = set.members.find(entry => entry.number === index + 1);
    return { x, y, number: index + 1, state: member?.state ?? 'open' };
  });
  const taken = node => node.state !== 'open';
  const route = nodes.slice(1).map((node, index) => {
    const from = nodes[index];
    const on = taken(node) && taken(from);
    return `<path class="pt-leg" data-seg="${index + 1}"${on ? ' data-on' : ''} d="M${from.x.toFixed(1)} ${from.y.toFixed(1)} Q${((from.x + node.x) / 2).toFixed(1)} ${(Math.min(from.y, node.y) - 16).toFixed(1)} ${node.x.toFixed(1)} ${node.y.toFixed(1)}" pathLength="1"/>`;
  }).join('');
  const marks = nodes.map(node => {
    const below = node.y < 92;
    const label = `<text class="pt-lb" y="${below ? 18 : -12}">OBJ ${node.number}</text>`;
    const body = taken(node)
      ? `${node.state === 'settled' ? '<circle class="pt-held" r="10.5"/>' : ''}<circle class="pt-mk" r="7.5"/><path class="pt-tick" d="M-3.2 0 l2.3 2.5 l4.2 -5.2"/>`
      : `<circle class="pt-mk" r="6.5"/><text class="pt-num" y="2.6">${node.number}</text>`;
    return `<g class="pt-obj" data-obj="${node.number}" data-state="${e(node.state)}" transform="translate(${node.x.toFixed(1)} ${node.y.toFixed(1)})"><g class="pt-pop">${body}${label}</g></g>`;
  }).join('');
  const grid = `${[40, 80, 120, 160, 200, 240].map(x => `<line x1="${x}" y1="0" x2="${x}" y2="122"/>`).join('')}${[30, 60, 90].map(y => `<line x1="0" y1="${y}" x2="280" y2="${y}"/>`).join('')}`;
  const contours = '<path d="M-10 104 C 40 84 70 114 120 99 S 200 74 300 94"/><path d="M-10 116 C 50 99 90 126 140 112 S 220 92 300 108"/><path d="M58 22 C 88 7 128 20 118 42 S 68 57 58 22Z"/><path d="M70 26 C 90 16 116 24 110 38 S 76 48 70 26Z"/><path d="M168 62 C 198 42 248 52 238 82 S 178 97 168 62Z"/><path d="M182 66 C 202 54 232 60 226 78 S 190 88 182 66Z"/>';
  return `<svg class="pt-map" viewBox="0 0 280 122" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><g class="pt-grid">${grid}</g><g class="pt-contour">${contours}</g><path class="pt-river" d="M0 66 C 40 62 60 46 100 54 S 160 96 200 88 S 260 46 280 52"/>${route}${marks}</svg>`;
}

function medal(view) {
  const gid = `pt-md-${uidOf(view)}`;
  return `<svg class="pt-medal" viewBox="0 0 60 92" aria-hidden="true" focusable="false"><defs>${goldGradient(gid)}</defs>
    <path class="pt-rb-a" d="M14 0 L46 0 L40 40 L20 40 Z"/><path class="pt-rb-b" d="M24 0 L36 0 L33 40 L27 40 Z"/><path class="pt-rb-c" d="M28.6 0 L31.4 0 L31 40 L29 40 Z"/>
    <rect x="18" y="38" width="24" height="5" rx="1" fill="url(#${gid})" class="pt-bar"/>
    <circle cx="30" cy="66" r="21" fill="url(#${gid})" class="pt-disc"/><circle cx="30" cy="66" r="16" class="pt-ring"/>
    <path d="${starPath(30, 66, 12, 0.45)}" class="pt-star"/><circle cx="30" cy="66" r="3.4" class="pt-core"/></svg>`;
}

function setCard(view, h) {
  const e = h.escape;
  const set = view.set;
  const complete = set.complete;
  const rows = set.members.slice().sort((a, b) => a.number - b.number);
  const shown = rows.slice(0, 6);
  const objectives = shown.map(member => `<li data-state="${e(member.state)}" data-row="${e(member.number)}" title="${e(`${member.ref ? `${member.ref} · ` : ''}${member.title} · ${objectiveNotes[member.state] || member.stateText}`)}"><span class="pt-n">Obj ${e(member.number)}/${e(set.size)}</span><span class="pt-t">${e(member.title || member.ref || 'Work Item')}</span><span class="pt-s">${e(objectiveWords[member.state] || member.stateText)}</span></li>`).join('');
  const missing = set.size - rows.length;
  const extra = rows.length > shown.length || missing > 0 ? `<li class="pt-more"><span class="pt-t">${e([rows.length > shown.length ? `+${rows.length - shown.length} more objectives` : '', missing > 0 ? `${missing} not in the set yet` : ''].filter(Boolean).join(' · '))}</span></li>` : '';
  const condition = complete
    ? `<div class="pt-citation"><b>Citation</b><p>Every objective taken and held. All ${e(set.size)} Work Items have settled: 30 days live.</p><em>${e(set.settled)}/${e(set.size)}</em></div>`
    : `<div class="pt-cond"><span><b>Completes when</b> all ${e(set.size)} Work Items have settled: 30 days live.</span><em>${e(set.settled)}/${e(set.size)}</em></div>`;
  const kind = complete ? 'Campaign complete' : 'Campaign order';
  return `<article ${rootAttributes(view, 'set', h)} aria-label="Set Card: ${e(view.title)}">
    <div class="sk-card">${rarityFrame(view)}<i class="pt-paper" aria-hidden="true"></i>
      ${band(complete ? 'Campaign complete' : `${view.finish.label} finish`, h)}
      ${header(kind, view, h)}
      <div class="pt-op"><small>Set Card · ${e(set.size)} Work Items${set.ref ? ` · ${e(set.ref)}` : ''}</small><h3 class="pt-title" data-slot="title"><span>${e(view.title)}</span></h3></div>
      <div class="pt-ops">
        <span class="pt-lgd">Operations map</span>
        ${opsMap(view, h)}
        <span class="sr-only">${e(`${set.progress}, ${set.merged} of ${set.size} merged`)}</span>
        <div class="pt-cpatch">${patch(view, { top: 'CAMPAIGN', bottom: e(`${set.settled}/${set.size} HELD`) })}${patchLayers(view)}</div>
        ${seal(view)}
        ${stamp(view, h)}
      </div>
      ${complete ? medal(view) : ''}
      ${condition}
      <ol class="pt-objs">${objectives}${extra}</ol>
      ${evaluation(view, h)}
      <div class="pt-stats">${fuel(view, h)}${stat('Taken', `${e(set.merged)}/${e(set.size)}`, h, 'Objectives merged')}${stat('Held', `${e(set.settled)}/${e(set.size)}`, h, 'Objectives settled: 30 days live')}</div>
      ${remarks(view, h)}
      ${signature(view, h)}
      ${tags(view, h)}
      ${meta(view, h)}
      ${band(complete ? 'Campaign complete' : `${view.finish.label} finish`, h, true)}
      ${crack(view)}
      ${fx(view, h)}
    </div>
    <button type="button" class="sk-more" data-card-action="flip">More info${h.icon('chevron')}</button>
  </article>`;
}

/**
 * Draws one face of a card as markup. The front is a mission debrief dossier: khaki paper with a classification band
 * in the finish's colour, an embroidered mission patch carrying the Role and Round, chevrons that count the finish
 * level, rubber stamps that say only what is true, the grade as an evaluation box, a ribbon for every honour, the
 * after-action figures, the Steward's signature and the ids on dog tags. Each finish adds one layer: metallic
 * thread, a holographic emblem, a prismatic security seal, gold bullion and a gold laurel wreath. A crack tears the
 * paper; a mend darns it with gold. An epic's Set Card is a campaign order with an operations map of its members.
 * The back is Unfold Native's tabs on the same paper.
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
 * Lights the drawn front: the pointer tilts the dossier a little and moves the light across the thread and foil
 * layers, the light drifts while idle, and a change between two draws plays its moment (see `attachSkin`).
 * @param {Element} face The front face the runtime drew.
 * @param {object} view The `cardView` model.
 * @returns {() => void}
 */
export function attach(face, view) {
  return attachSkin(face, view, { tilt: 8 });
}
