import { render as nativeRender } from '../vloer-native/skin.js';
import { attachSkin, coin, crackPaths, figures, gradeName, honours, initials, markSeed, skinView } from '../../skin-kit.js';
import { pixelText, sprite } from './pixel-font.js';

/** The skin's name, matching its folder and manifest. */
export const id = 'arcade';

const ordinals = ['1ST', '2ND', '3RD', '4TH', '5TH'];
const gateShort = { development: 'DEV', test: 'TEST', acceptance: 'ACC', done: 'DONE' };
const subgradeCodes = [['REL', 'reliability'], ['DUR', 'durability'], ['DEL', 'delivery'], ['REV', 'review']];
const gold = { Y: '#ffd84a', y: '#c98a00', w: '#fff6c8', o: '#7a4a00' };
const art = {
  ship: ['...#...', '..###..', '..#.#..', '.#####.', '###.###', '#.#.#.#'],
  check: ['.......', '.....##', '....##.', '#..##..', '####...', '.##....'],
  skull: ['.#####.', '#######', '##.#.##', '##.#.##', '#######', '.#.#.#.', '.#####.'],
  trophy: ['Y.YYYYY.Y', 'Y.YwYYY.Y', '.YYwYYYY.', '..YYYYy..', '...YYy...', '....Y....', '...yYy...', '..YYYYY..', '..yyyyy..'],
  coin: ['..oooo..', '.oYYYYo.', 'oYwYYYyo', 'oYwYYYyo', 'oYYYYYyo', 'oYYYYyyo', '.oyyyyo.', '..oooo..'],
};

const pad = (value, width = 6) => String(Math.max(0, Math.floor(value))).padStart(width, '0');
const upper = value => String(value ?? '').toUpperCase();

function px(text, e, className = '', spoken = true) {
  return `<span class="ac-px${className ? ` ${className}` : ''}">${pixelText(upper(text))}${spoken ? `<span class="sr-only">${e(text)}</span>` : ''}</span>`;
}

function roleName(view) {
  if (view.crew === 'No agent Runs yet') return '';
  return view.crew.split(' · ')[0].replace(/ ×\d+$/, '');
}

function blinkTarget(view) {
  if (view.set?.setCard) return view.set.complete ? '' : 'stage';
  if (view.state.key === 'drafting') return 'banner';
  if (!view.steward.signed) return 'initials';
  return view.release?.released ? '' : 'oneup';
}

function banner(view) {
  const release = view.release;
  const key = view.state.key;
  if (release?.released) return { big: 'STAGE CLEAR', sub: `DAY ${release.days} IN PRODUCTION`, tone: 'green' };
  if (key === 'merged') return { big: 'STAGE CLEAR', sub: release?.reported === false ? 'MERGED · LIVE NOT REPORTED' : 'MERGED · NOT LIVE YET', tone: 'green' };
  if (key === 'in_review') return { big: 'BOSS: REVIEW', sub: view.pr ? `PULL REQUEST ${view.pr.text} OPEN` : 'PULL REQUEST OPEN', tone: 'cyan' };
  if (key === 'closed') return { big: 'GAME OVER', sub: 'CLOSED UNMERGED', tone: 'amber' };
  if (key === 'withdrawn') return { big: 'TIME UP', sub: 'MANDATE WITHDRAWN', tone: 'dim' };
  return { big: 'CONTINUE?', sub: `${view.rounds ? `ROUND ${view.rounds} · ` : ''}NO PULL REQUEST YET`, tone: 'magenta' };
}

function stateChip(view, h) {
  const e = h.escape;
  return `<span class="ac-state" data-slot="state" data-tone="${e(view.state.tone)}" title="${e(view.state.description || '')}"><i aria-hidden="true"></i>${e(view.state.label)}</span>`;
}

function hud(view, h, blink) {
  const e = h.escape;
  const release = view.release;
  const score = view.set?.setCard ? `${view.set.settled}/${view.set.size}` : release?.released ? pad(release.days) : '------';
  const caption = view.set?.setCard ? 'SETTLED' : release?.released ? 'DAYS LIVE' : release?.reported === false ? 'LIVE NOT REPORTED' : 'NOT LIVE YET';
  const spoken = view.set?.setCard ? view.set.progress : release?.released ? release.label : caption.toLowerCase();
  const grade = view.grade;
  return `<div class="ac-hud">
    <div class="ac-score"><span class="ac-lbl ac-oneup${blink === 'oneup' ? ' ac-blink' : ''}">${px('1UP', e, 'ac-red', false)}</span><span class="ac-digits${release?.released || view.set?.setCard ? '' : ' ac-off'}">${px(score, e, 'ac-big', false)}</span>${px(caption, e, 'ac-cap', false)}<span class="sr-only">${e(spoken)}</span></div>
    <div class="ac-mid">${stateChip(view, h)}</div>
    <div class="ac-hi"><span class="ac-lbl">${px('HI-RANK', e, 'ac-amber', false)}</span><span class="ac-digits ac-amber${grade ? '' : ' ac-off'}">${px(grade ? grade.text : '--', e, 'ac-big', false)}</span>${grade?.provisional ? px('PROV.', e, 'ac-cap', false) : px(grade ? 'FINAL' : 'UNRANKED', e, 'ac-cap', false)}<span class="sr-only">${e(grade ? grade.description : 'Not graded yet')}</span></div>
  </div>`;
}

function title(view, h) {
  return `<h3 class="ac-title" data-slot="title"><span>${h.escape(view.title)}</span></h3>`;
}

function bannerBox(view, h, blink) {
  const e = h.escape;
  const parts = banner(view);
  return `<div class="ac-banner" data-tone="${parts.tone}"><span class="ac-bigline${blink === 'banner' ? ' ac-blink' : ''}">${px(parts.big, e, 'ac-head')}</span>${px(parts.sub, e, 'ac-sub')}</div>`;
}

function gateRow(view, h) {
  const gates = view.gates;
  if (!gates) return '';
  const e = h.escape;
  const cells = gates.steps.map(step => `<span class="ac-gate" data-reached="${step.reached}"${step.current ? ' data-current' : ''}${step.bounces ? ' data-bounced' : ''}>${px(gateShort[step.key] ?? step.label, e, '', false)}</span>`).join('');
  const bounce = gates.bounces.length ? `${gates.bounces.length} BOUNCE${gates.bounces.length === 1 ? '' : 'S'}` : 'NO BOUNCE';
  return `<div class="ac-stage" title="${e(gates.text)}">${px('STAGE', e, 'ac-lbl ac-faint', false)}<span class="ac-gates">${cells}</span>${px(gates.rightFirstTime ? '1ST TRY' : bounce, e, gates.bounces.length ? 'ac-amber' : gates.rightFirstTime ? 'ac-green' : 'ac-dim', false)}<span class="sr-only">Delivery gate: ${e(gates.text)}</span></div>`;
}

function setLine(view, h) {
  const set = view.set;
  if (!set || set.setCard) return '';
  const e = h.escape;
  const pips = Array.from({ length: set.size }, (_, index) => { const member = set.members.find(entry => entry.number === index + 1); return `<i data-state="${e(member?.state ?? 'open')}"${index + 1 === set.number ? ' data-self' : ''}></i>`; }).join('');
  return `<div class="ac-setline" title="${e(set.text)}">${px(`SET ${set.number}/${set.size}`, e, 'ac-magenta', false)}<span class="ac-pips" aria-hidden="true">${pips}</span><span class="ac-settitle">${e(set.title)}</span><span class="sr-only">${e(set.text)}</span></div>`;
}

function costCell(view, h) {
  const e = h.escape;
  const parts = coin(view);
  const main = parts.status === 'demo' ? 'Demo · no model calls' : parts.status === 'not_reported' ? `${parts.main} ${parts.caption}` : `${parts.top === 'Cost' ? '' : `${parts.top} `}${parts.main}`;
  return `<span class="ac-val ac-red" data-slot="cost" data-status="${e(parts.status)}" role="img" aria-label="${e(view.cost.label)}" title="${e(parts.caption)}">${e(main)}</span>`;
}

function table(view, h) {
  const e = h.escape;
  const facts = figures(view);
  const lines = view.diff.known ? `<span class="ac-green">${e(view.diff.addText)}</span> <span class="ac-red">${e(view.diff.delText)}</span>${view.diff.filesText ? ` <span class="ac-dim">· ${e(view.diff.filesText)}</span>` : ''}` : e(view.diff.value);
  const rows = [
    ['COST', costCell(view, h), 'red'],
    ['TIME', `<span class="ac-val">${e(facts.time.value)}</span>`, 'amber'],
    ['TOKENS', `<span class="ac-val">${e(facts.tokens.value)}</span>`, 'amber'],
    ['LINES', `<span class="ac-val">${lines}</span>`, 'green'],
    ['PR', `<span class="ac-val">${e(facts.pr.value)}${view.pr?.ci ? ` <span class="ac-dim">· ${e(view.pr.ci.label)}</span>` : ''}</span>`, 'cyan'],
  ];
  return `<div class="ac-table">${rows.map(([label, value, tone], index) => `<div class="ac-row" data-tone="${tone}">${px(ordinals[index], e, 'ac-rk', false)}${px(label, e, 'ac-key')}${value}</div>`).join('')}</div>`;
}

function rank(view, h) {
  const e = h.escape;
  const grade = view.grade;
  if (!grade) return `<div class="ac-rank ac-pending">${px('??', e, 'ac-rnum', false)}<span class="ac-rname">${px('NOT GRADED YET', e)}${px('RANK PENDING', e, 'ac-dim', false)}</span></div>`;
  const subs = subgradeCodes.map(([code, key]) => { const part = grade.subgrades.find(entry => entry.key === key); return `<span>${px(code, e, 'ac-dim', false)}${px(part ? part.text : '-', e, 'ac-green', false)}</span>`; }).join('');
  const label = grade.labelKey === 'black' ? 'BLACK LABEL' : grade.labelKey === 'gold' ? 'GOLD LABEL' : 'GRADED';
  const qualifiers = grade.qualifiers.map(entry => `<i class="ac-q" title="${e(entry.text)}">${px(entry.code, e, '', false)}</i>`).join('');
  return `<div class="ac-rank" data-label="${e(grade.labelKey)}" title="${e(grade.description)}">
    ${px(grade.text, e, 'ac-rnum', false)}
    <span class="ac-rname">${px(gradeName(grade.overall), e, 'ac-white', false)}<span class="ac-rtags">${px(label, e, 'ac-rlabel', false)}${grade.provisional ? `<i class="ac-prov">${px('PROV', e, '', false)}</i>` : ''}${qualifiers}</span></span>
    <span class="ac-subs">${subs}</span>
    <span class="sr-only">${e(grade.description)}</span>
  </div>`;
}

function bonus(view, h) {
  const e = h.escape;
  const list = honours(view).filter(entry => entry.key !== 'signed');
  if (!list.length) return `<div class="ac-bonus ac-quiet">${px('NO BONUS YET', e, 'ac-faint')}</div>`;
  const shown = list.slice(0, 3);
  return `<div class="ac-bonus">${shown.map(entry => `<span class="ac-chip" data-tone="${e(entry.tone)}">${px(entry.label, e)}</span>`).join('')}${list.length > shown.length ? `<span class="ac-chip ac-more" title="${e(list.slice(shown.length).map(entry => entry.label).join(', '))}">${px(`+${list.length - shown.length}`, e, '', false)}<span class="sr-only">${e(list.slice(shown.length).map(entry => entry.label).join(', '))}</span></span>` : ''}</div>`;
}

function hiScore(view, h, blink) {
  const e = h.escape;
  const steward = view.steward;
  if (!steward.signed) return `<div class="ac-ini ac-off" data-slot="steward">${px('ENTER INITIALS', e, 'ac-dim', false)}<span class="ac-slots${blink === 'initials' ? ' ac-blink' : ''}" aria-hidden="true"><b></b><b></b><b></b></span>${px('UNSIGNED', e, 'ac-faint', false)}<span class="sr-only">${e(steward.text)}</span></div>`;
  const letters = [...initials(steward.name).padEnd(3, '.').slice(0, 3)];
  return `<div class="ac-ini" data-slot="steward" title="${e(steward.detail)}">${px('HI-SCORE', e, 'ac-amber', false)}<span class="ac-slots ac-on" aria-hidden="true">${letters.map((letter, index) => `<b data-i="${index}">${pixelText(letter)}</b>`).join('')}</span><span class="ac-name">${e(steward.name)}</span><span class="ac-pop" aria-hidden="true">${pixelText('NEW HI-SCORE!')}</span><span class="sr-only">${e(steward.text)}</span></div>`;
}

function foot(view, h) {
  const e = h.escape;
  const ships = Array.from({ length: Math.min(5, view.plays.count) }, () => sprite(art.ship, { '#': 'currentColor' }, 'ac-ship')).join('');
  const condition = view.condition ? `<span class="ac-cond" data-condition="${e(view.condition.state)}" title="${e(view.condition.text)}">${px(view.condition.label, e, '', false)}<span class="sr-only">${e(view.condition.text)}</span></span>` : view.release?.next ? `<span class="ac-next">${e(view.release.next.text)}</span>` : '<span></span>';
  const right = view.condition?.state === 'cracked' ? px('TILT', e, 'ac-amber', false) : view.rounds ? px(`ROUND ${view.rounds}`, e, 'ac-dim') : '';
  return `<div class="ac-foot"><span class="ac-lives" title="${e(view.plays.text)}">${ships || px('NO PLAYS', e, 'ac-faint', false)}<span class="sr-only">${e(view.plays.text)}</span></span>${condition}<span class="ac-right">${right}</span></div>`;
}

function crack(view) {
  if (!view.condition) return '';
  const paths = crackPaths(markSeed(view), { x: 64, y: 52 });
  const draw = paths.map(path => `<path d="${path.d}" pathLength="1" data-root="${path.root}"${path.branch ? ' class="ac-br"' : ''}/>`).join('');
  const mended = view.condition.state === 'mended';
  return `<svg class="ac-crack${mended ? ' ac-mended' : ''}" viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs><linearGradient id="ac-gold-${view.id}" gradientUnits="userSpaceOnUse" x1="20" y1="10" x2="100" y2="110"><stop offset="0" stop-color="#9c6812"/><stop offset=".4" stop-color="#ffe08a"/><stop offset=".62" stop-color="#e2a92a"/><stop offset=".82" stop-color="#fff2c0"/><stop offset="1" stop-color="#8a5a10"/></linearGradient></defs>
    <g class="ac-sh">${draw}</g><g class="ac-hl">${draw}</g>
    ${mended ? `<g class="ac-au" stroke="url(#ac-gold-${view.id})">${draw}</g><g class="ac-gl">${draw}</g>` : ''}
  </svg>`;
}

function slams(view, h) {
  const e = h.escape;
  const out = [];
  const add = (moment, big, small, tone, place = 'mid') => out.push(`<div class="ac-slam" data-for="${moment}" data-tone="${tone}" data-place="${place}">${px(big, e, 'ac-head', false)}${small ? px(small, e, 'ac-sub', false) : ''}</div>`);
  if (view.state.key === 'merged') add('merged', view.set?.setCard ? 'BOSS DOWN!' : 'STAGE CLEAR', view.pr ? `MERGED · PR ${view.pr.text}` : 'MERGED', 'green');
  if (view.finish.level) add('finish', 'UPGRADE!', `${view.finish.label} FINISH`, view.finish.level >= 4 ? 'amber' : 'cyan', 'top');
  if (view.condition?.state === 'cracked') add('crack', 'TILT!', view.condition.label, 'amber');
  if (view.condition?.state === 'mended') add('mend', 'REPAIRED!', 'KINTSUGI', 'amber');
  if (view.set?.setCard) add('set', view.set.complete ? 'ALL CLEAR!' : 'STAGE CLEAR', view.set.complete ? 'SET COMPLETE' : `${view.set.settled}/${view.set.size} SETTLED`, view.set.complete ? 'amber' : 'green');
  if (view.gates && view.gates.bounces.length) add('bounce', 'BOUNCED', view.gates.label, 'amber', 'top');
  return out.join('');
}

function screenFx(view, h) {
  return `<i class="ac-roll" aria-hidden="true"></i><i class="ac-beam" aria-hidden="true"></i><i class="ac-dip" aria-hidden="true"></i><i class="ac-noise" aria-hidden="true"></i><div class="ac-fx" aria-hidden="true">${slams(view, h)}</div>`;
}

function marquee(view, h, big, small) {
  const e = h.escape;
  const bulbs = view.finish.level >= 5 ? `<span class="ac-bulbs" aria-hidden="true">${Array.from({ length: 14 }, (_, index) => `<i data-i="${index}"></i>`).join('')}</span>` : '';
  return `<header class="ac-marquee">${bulbs}${view.finish.level >= 2 ? '<i class="ac-holo" aria-hidden="true"></i>' : ''}${px(big, e, 'ac-mq')}${px(small, e, 'ac-mqs')}${bulbs ? bulbs.replace('ac-bulbs', 'ac-bulbs ac-low') : ''}</header>`;
}

function panel(view, h) {
  const e = h.escape;
  const credit = view.crew === 'No agent Runs yet' ? `Team ${view.team || 'unknown'}` : `${view.crew}${view.team ? ` · Team ${view.team}` : ''}`;
  return `<div class="ac-panel">${view.finish.level >= 4 ? '<i class="ac-gild" aria-hidden="true"></i>' : ''}
      <span class="ac-stick" aria-hidden="true"></span>
      <span class="ac-btns" aria-hidden="true"><i data-c="cyan"></i><i data-c="amber"></i><i data-c="magenta"></i></span>
      <span class="ac-plate"><span class="ac-ids" data-slot="ids">${e(view.ids.join(' · '))}</span><span class="ac-credit">© ${e(credit)}</span></span>
      <span class="ac-door">${view.demo ? `<b class="ac-demo" title="Illustrative record: no model calls, no spend">${px('DEMO', e)}</b>` : sprite(art.coin, gold, 'ac-coin')}<i class="ac-slot" aria-hidden="true"></i></span>
    </div>`;
}

function rootAttributes(view, layout, h) {
  const e = h.escape;
  return `class="sk ac" data-skin-root data-layout="${layout}" data-finish="${e(view.finish.key)}" data-level="${e(view.finish.level)}" data-tone="${e(view.state.tone)}"${view.condition ? ` data-condition="${e(view.condition.state)}"` : ''}${view.grade?.labelKey ? ` data-label="${e(view.grade.labelKey)}"` : ''}${view.set ? ` data-set="${view.set.setCard ? 'card' : 'child'}"` : ''}${view.set?.complete ? ' data-complete' : ''}`;
}

function cabinet(view, h, layout, label, marqueeMarkup, screen) {
  const e = h.escape;
  const level = view.finish.level;
  return `<article ${rootAttributes(view, layout, h)} aria-label="${label}: ${e(view.title)}">
    <div class="sk-card">
      ${level >= 1 ? '<i class="ac-trim" aria-hidden="true"></i>' : ''}
      <div class="ac-cab">
        ${level >= 2 ? '<i class="ac-sideart" aria-hidden="true"></i>' : ''}
        ${marqueeMarkup}
        <div class="ac-bezel"><div class="ac-crt">
          ${level >= 3 ? '<i class="ac-rgb" aria-hidden="true"></i>' : ''}
          <div class="ac-screen">${screen}</div>
          ${crack(view)}
          ${screenFx(view, h)}
          <i class="ac-glass" aria-hidden="true"></i>
        </div></div>
        ${panel(view, h)}
      </div>
    </div>
    <button type="button" class="sk-more" data-card-action="flip">More info${h.icon('chevron')}</button>
  </article>`;
}

function standard(view, h) {
  const blink = blinkTarget(view);
  const role = roleName(view);
  const sub = [view.rounds ? `ROUND ${view.rounds}` : '', view.plays.count ? view.plays.text : 'NO PLAYS YET'].filter(Boolean).join(' · ');
  const screen = `${hud(view, h, blink)}${title(view, h)}${bannerBox(view, h, blink)}${gateRow(view, h)}${setLine(view, h)}${table(view, h)}${rank(view, h)}${bonus(view, h)}${hiScore(view, h, blink)}${foot(view, h)}`;
  return cabinet(view, h, 'standard', 'Run card', marquee(view, h, role || 'RUN CARD', `UNFOLD · ${sub}`), screen);
}

function bossMap(view, h, blink) {
  const e = h.escape;
  const set = view.set;
  const next = Array.from({ length: set.size }, (_, index) => index + 1).find(number => set.members.find(entry => entry.number === number)?.state !== 'settled');
  const cells = Array.from({ length: set.size }, (_, index) => {
    const member = set.members.find(entry => entry.number === index + 1);
    const state = member?.state ?? 'open';
    const inner = state === 'settled' ? sprite(art.check, { '#': 'currentColor' }, 'ac-chk') : pixelText(String(index + 1));
    return `<span class="ac-stg${index + 1 === next && blink === 'stage' ? ' ac-blink' : ''}" data-state="${e(state)}" data-n="${index + 1}" title="${e(member ? `${index + 1}/${set.size} · ${member.ref ? `${member.ref} · ` : ''}${member.title} · ${member.stateText}` : `${index + 1}/${set.size} · not in the set yet`)}">${inner}</span>`;
  }).join('<i class="ac-lk" aria-hidden="true"></i>');
  const boss = set.complete ? sprite(art.trophy, gold, 'ac-trophy') : sprite(art.skull, { '#': 'currentColor' }, 'ac-skull');
  return `<div class="ac-map${set.size > 7 ? ' ac-many' : ''}" aria-hidden="true">${cells}<i class="ac-lk" aria-hidden="true"></i><span class="ac-stg ac-boss">${boss}</span></div>`;
}

function memberList(view, h) {
  const e = h.escape;
  const set = view.set;
  const rows = Array.from({ length: set.size }, (_, index) => ({ number: index + 1, member: set.members.find(entry => entry.number === index + 1) }));
  const shown = rows.slice(0, 5);
  const word = { settled: 'CLEAR', merged: 'MERGED', open: 'OPEN' };
  const items = shown.map(({ number, member }) => {
    const state = member?.state ?? 'open';
    return `<li data-state="${e(state)}">${px(`${number}/${set.size}`, e, 'ac-rk', false)}${px(word[state], e, 'ac-mstate', false)}<span class="ac-mtitle">${e(member?.title || 'Not in the set yet')}</span><span class="sr-only">${e(`${number} of ${set.size}: ${member?.title || 'not in the set yet'}, ${member?.stateText ?? 'Open'}`)}</span></li>`;
  }).join('');
  return `<ol class="ac-members">${items}${rows.length > shown.length ? `<li class="ac-more">${px(`+${rows.length - shown.length} MORE STAGES`, e, 'ac-dim')}</li>` : ''}</ol>`;
}

function setCondition(view, h) {
  const e = h.escape;
  const set = view.set;
  const segments = Array.from({ length: set.size }, (_, index) => `<i data-state="${e(set.members.find(entry => entry.number === index + 1)?.state ?? 'open')}"></i>`).join('');
  const lines = set.complete ? ['SET COMPLETE.', 'EVERY WORK ITEM SETTLED: 30 DAYS LIVE'] : [`COMPLETES WHEN ALL ${set.size} WORK ITEMS`, 'HAVE SETTLED: 30 DAYS LIVE'];
  const spoken = set.complete ? 'Set complete. Every Work Item settled: 30 days live.' : `Completes when all ${set.size} Work Items have settled: 30 days live.`;
  return `<div class="ac-setcond${set.complete ? ' ac-done' : ''}">${lines.map(line => px(line, e, 'ac-cline', false)).join('')}<span class="sr-only">${e(spoken)}</span><span class="ac-meter" aria-hidden="true">${segments}</span>${px(`${set.settled}/${set.size} SETTLED · ${set.merged}/${set.size} MERGED`, e, 'ac-dim')}</div>`;
}

function setCard(view, h) {
  const e = h.escape;
  const set = view.set;
  const blink = blinkTarget(view);
  const next = Array.from({ length: set.size }, (_, index) => index + 1).find(number => set.members.find(entry => entry.number === number)?.state !== 'settled');
  const headline = set.complete
    ? `<div class="ac-banner ac-win" data-tone="gold">${sprite(art.trophy, gold, 'ac-trophy ac-xl')}<span class="ac-wintext">${px('ALL CLEAR!', e, 'ac-head ac-rain')}${px('YOU WIN · SET COMPLETE', e, 'ac-sub')}</span>${sprite(art.trophy, gold, 'ac-trophy ac-xl')}</div>`
    : `<div class="ac-banner" data-tone="magenta">${px('BOSS RUSH', e, 'ac-head')}${px(`STAGE ${next ?? set.size} OF ${set.size}`, e, 'ac-sub')}</div>`;
  const costRow = `<div class="ac-table"><div class="ac-row" data-tone="red">${px('1ST', e, 'ac-rk', false)}${px('COST', e, 'ac-key')}${costCell(view, h)}</div></div>`;
  const screen = `${hud(view, h, blink)}${title(view, h)}${headline}${bossMap(view, h, blink)}${memberList(view, h)}${setCondition(view, h)}${costRow}${rank(view, h)}${hiScore(view, h, blink)}`;
  const big = set.complete ? 'ALL CLEAR' : 'BOSS RUSH';
  const small = `SET CARD · ${set.size} WORK ITEMS${set.ref ? ` · ${set.ref}` : ''}`;
  return cabinet(view, h, 'set', 'Set Card', marquee(view, h, big, small), screen);
}

/**
 * Draws one face of a card as markup. The front is an arcade cabinet: a lit marquee, a CRT screen with scanlines and
 * phosphor glow, the days live as the score, the grade as the HI-RANK and a slab box, a 1ST–5TH table of cost, run
 * time, tokens, lines and pull request, honours as bonus chips, the Steward's initials as the HI-SCORE, and a control
 * panel with the ids. Fixed strings and numbers are drawn in the skin's own bitmap font. The finish ladder adds chrome
 * trim, holographic side art, an RGB phosphor mask, a gilded control panel and chasing marquee bulbs. A crack runs
 * across the CRT glass and mends in gold. A Set Card is a boss rush with the members as stages. The back is Vloer
 * Native's tabs in the cabinet's colours.
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
 * Lights the drawn front: the pointer tilts the cabinet and moves the light across the chrome and holographic layers,
 * the light drifts while idle, and a change between two draws plays its moment (see `attachSkin`).
 * @param {Element} face The front face the runtime drew.
 * @param {object} view The `cardView` model.
 * @returns {() => void}
 */
export function attach(face, view) {
  return attachSkin(face, view, { tilt: 10 });
}
