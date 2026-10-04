import { render as nativeRender } from '../unfold-native/skin.js';
import { finishLadder } from '../../card-model.js';
import { attachSkin, coin, crackPaths, figures, gradeName, honours, kpiStrip, markSeed, rarityFrame, rarityMark, skinView } from '../../skin-kit.js';

/** The skin's name, matching its folder and manifest. */
export const id = 'ticker';

const subgradeCodes = [['REL', 'reliability'], ['DUR', 'durability'], ['DEL', 'delivery'], ['REV', 'review']];
const marks = { success: '▲', gold: '▲', danger: '▼', attention: '!', live: '●', review: '●', neutral: '—' };
const holdingStates = { open: 'PENDING', merged: 'LISTED', settled: 'SETTLED', none: 'PENDING' };
const chartBox = { width: 280, left: 4, right: 240, top: 10, bottom: 74 };
const dayMonth = new Intl.DateTimeFormat('nl-NL', { day: '2-digit', month: '2-digit' });

const plural = (value, word) => `${value} ${word}${value === 1 ? '' : 's'}`;
const uid = view => String(view.id).replace(/[^a-z0-9-]/gi, '') || 'card';
const step20 = share => Math.max(0, Math.min(20, Math.round(share * 20)));

function shortDate(iso) {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? dayMonth.format(time) : '—';
}

function metaTime(meta) {
  const found = /^(\d{2})-(\d{2})-(\d{4})(?: (\d{2}):(\d{2}))?/.exec(meta || '');
  if (!found) return { date: '—', at: 0 };
  const [, day, month, year, hour = '0', minute = '0'] = found;
  return { date: `${day}-${month}`, at: Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)) };
}

function symbol(view) {
  const ref = view.ids.find(entry => entry && entry !== `#${view.id}` && entry !== view.repo);
  return ref || `#${view.id}`;
}

function rootAttributes(view, layout, h) {
  const e = h.escape;
  return `class="sk tk" data-skin-root data-layout="${layout}" data-finish="${e(view.finish.key)}" data-level="${e(view.finish.level)}" data-tone="${e(view.state.tone)}"${view.condition ? ` data-condition="${e(view.condition.state)}"` : ''}${view.grade?.labelKey ? ` data-label="${e(view.grade.labelKey)}"` : ''}${view.set ? ` data-set="${view.set.setCard ? 'card' : 'child'}"` : ''}${view.set?.complete ? ' data-complete' : ''}`;
}

function flaps(text, h) {
  return [...text].map(char => /[0-9—]/.test(char) ? `<span class="tk-fl">${h.escape(char)}</span>` : `<span class="tk-fl tk-sep">${h.escape(char)}</span>`).join('');
}

function keyStrip(view, h, setCard) {
  const e = h.escape;
  const released = view.release?.released;
  const first = setCard ? 'SET CARD · FUND' : `${view.finish.label.toUpperCase()} FEED`;
  const feed = setCard ? `${view.set.settled}/${view.set.size} SETTLED` : released ? 'LIVE' : 'PRE-MARKET';
  return `<div class="tk-fk" aria-hidden="true"><span class="tk-k1">${e(first)}</span><span>DES</span><span class="tk-k3">${setCard ? 'HLDG' : 'BOOK'}</span><span class="tk-feed">${e(feed)}</span></div>`;
}

function statusBar(view, h, right) {
  const e = h.escape;
  const condition = view.condition?.state === 'cracked' ? '<b class="tk-halt">■ HALTED</b>' : view.condition?.state === 'mended' ? '<b class="tk-resume">▲ RESUMED</b>' : '';
  return `<div class="tk-hdr"><span class="tk-st" data-slot="state" data-tone="${e(view.state.tone)}" title="${e(view.state.description || '')}"><i aria-hidden="true"></i><span>${e(view.state.label)}</span></span><span class="tk-r">${condition}${rarityMark(view, h)}<span>${e(right)}</span></span></div>`;
}

function quote(view, h) {
  const e = h.escape;
  const release = view.release;
  const live = Boolean(release?.released);
  const next = live ? release.next : null;
  const share = !live ? 0 : next ? (release.days - release.finish.days) / (next.finish.days - release.finish.days) : 1;
  const change = !live
    ? `<span class="tk-chg" data-dir="flat"><b>PRE-MARKET</b><small>${e(view.state.label.toLowerCase())}</small></span>`
    : next
      ? `<span class="tk-chg" data-dir="up" title="${e(next.text)}"><b>▲ ${e(next.finish.label.toUpperCase())}</b><small>in ${e(plural(next.daysToGo, 'day'))}</small></span>`
      : '<span class="tk-chg" data-dir="top"><b>▲ TOP</b><small>of the ladder</small></span>';
  return `<div class="tk-quote">
    <div class="tk-sym"><b>${e(symbol(view))}</b><small>#${e(view.id)} · Run card</small></div>
    ${change}
    <div class="tk-px" title="${e(live ? release.label : 'Not live yet')}"><span class="tk-flaps">${flaps(live ? String(release.days) : '—', h)}</span><span class="tk-unit">${live ? 'DAYS<br>LIVE' : 'NOT<br>LIVE'}</span></div>
    <span class="tk-fin" title="${e(live ? release.label : 'Matte until released')}"><span>${e(view.finish.label.toUpperCase())}</span><i class="tk-bar" aria-hidden="true"><i data-step="${step20(share)}"></i></i></span>
    <h3 class="tk-title" data-slot="title"><span>${e(view.title)}</span></h3>
    <i class="tk-inv" aria-hidden="true"></i>
  </div>`;
}

function chart(view, h) {
  const e = h.escape;
  const { width, left, right, top, bottom } = chartBox;
  const release = view.release;
  const live = Boolean(release?.released);
  const days = live ? release.days : 0;
  const span = Math.max(400, Math.ceil(days * 1.08));
  const dayX = value => left + Math.sqrt(Math.max(0, Math.min(value, span)) / span) * (right - left);
  const levelY = level => bottom - 3 - level * ((bottom - 3 - top) / 5);
  const f = value => value.toFixed(1);
  const current = view.finish.level;
  const vertical = finishLadder.slice(1).map(step => `<line class="tk-gv" x1="${f(dayX(step.days))}" x2="${f(dayX(step.days))}" y1="${top - 4}" y2="${bottom}"/>`).join('');
  const levels = finishLadder.map(step => {
    const y = levelY(step.level);
    const on = live && step.level === current;
    return `${step.level ? `<line class="tk-gh" x1="${left}" x2="${right}" y1="${f(y)}" y2="${f(y)}"/>` : ''}${on ? `<rect class="tk-tag" x="${right + 2}" y="${f(y - 4.6)}" width="${width - right - 2}" height="8.4" rx="1"/>` : ''}<text class="tk-lv${on ? ' tk-on' : ''}" x="${width - 1}" y="${f(y + 2.2)}">${e(step.label.toUpperCase())}</text>`;
  }).join('');
  const ticks = finishLadder.map((step, index) => `<text class="tk-tx" x="${f(dayX(step.days))}" y="${bottom + 8}"${index === 0 ? ' data-edge="start"' : ''}>${step.days}</text>`).join('');
  const defs = `<defs><linearGradient id="tk-fill-${uid(view)}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffa028" stop-opacity=".42"/><stop offset="1" stop-color="#ffa028" stop-opacity="0"/></linearGradient></defs>`;
  let plot;
  if (!live) {
    const y = levelY(0);
    const mid = (left + right) / 2;
    plot = `<path class="tk-flat" d="M${left} ${f(y)}H${right}" pathLength="1"/><rect class="tk-nobox" x="${f(mid - 34)}" y="${f(top + 18)}" width="68" height="13" rx="1"/><text class="tk-nolive" x="${f(mid)}" y="${f(top + 27)}">NOT LIVE YET</text>`;
  } else {
    let line = `M${f(dayX(0))} ${f(levelY(0))}`;
    let ahead = '';
    for (const step of finishLadder.slice(1)) {
      if (step.days <= days) line += `H${f(dayX(step.days))}V${f(levelY(step.level))}`;
      else ahead += `H${f(dayX(step.days))}V${f(levelY(step.level))}`;
    }
    const x = dayX(days);
    const y = levelY(current);
    line += `H${f(x)}`;
    const area = `${line}V${bottom}H${f(dayX(0))}Z`;
    const labelLeft = x > right - 34;
    plot = `<path class="tk-area" d="${area}" fill="url(#tk-fill-${uid(view)})"/>${ahead ? `<path class="tk-ahead" d="M${f(x)} ${f(y)}${ahead}H${right}"/>` : ''}<path class="tk-ln" d="${line}" pathLength="1"/><line class="tk-now" x1="${f(x)}" x2="${f(x)}" y1="${top - 6}" y2="${bottom}"/><circle class="tk-dot" cx="${f(x)}" cy="${f(y)}" r="2.4"/><text class="tk-nowt" x="${f(labelLeft ? x - 3 : x + 3)}" y="${top - 2}"${labelLeft ? ' data-edge="end"' : ''}>D${days}</text>`;
  }
  const head = live
    ? `<span>FINISH · DAYS LIVE${release.source === 'merge' ? ' · FROM MERGE' : ''}</span><span>${release.next ? `NEXT ▸ D${release.next.finish.days}` : 'TOP OF LADDER'}</span>`
    : '<span>FINISH · DAYS LIVE</span><span>PRE-MARKET</span>';
  return `<div class="tk-chart"><div class="tk-ch">${head}</div><div class="tk-plot"><svg viewBox="0 0 ${width} ${bottom + 11}" aria-hidden="true" focusable="false">${defs}<g class="tk-grid">${vertical}${levels}</g>${plot}<line class="tk-axis" x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}"/>${ticks}</svg>${view.finish.level >= 2 ? '<i class="tk-colour" aria-hidden="true"></i>' : ''}</div><span class="sr-only">${e(live ? release.label : 'Not live yet')}</span></div>`;
}

function slab(view, h) {
  const e = h.escape;
  const grade = view.grade;
  if (!grade) return '<div class="tk-slab tk-pending"><div class="tk-gr"><span>RATING</span><b>NR</b></div><div class="tk-pend">Not graded yet</div></div>';
  const subs = subgradeCodes.map(([code, key]) => { const part = grade.subgrades.find(entry => entry.key === key); return `<div><span>${code}</span><b>${e(part ? part.text : '—')}</b></div>`; }).join('');
  const qualifiers = grade.qualifiers.map(entry => `<i class="tk-q" title="${e(entry.text)}">${e(entry.code)}</i>`).join('');
  return `<div class="tk-slab" data-label="${e(grade.labelKey)}" title="${e(grade.description)}">
    <div class="tk-sh"><span>${e(grade.label ? grade.label.toUpperCase() : 'UNFOLD RATING')} · ${e(gradeName(grade.overall).toUpperCase())}</span>${grade.provisional ? '<em>PROVISIONAL</em>' : '<em class="tk-final">FINAL</em>'}</div>
    <div class="tk-gr"><span>GRADE<br>/10</span><b>${e(grade.text)}</b>${qualifiers}</div>
    <div class="tk-subs">${subs}</div>
    <span class="sr-only">${e(grade.description)}</span>
  </div>`;
}

function costCell(view, h) {
  const e = h.escape;
  const parts = coin(view);
  const top = parts.top && parts.top !== 'Cost' ? ` ${parts.top}` : '';
  return `<div class="tk-cost" data-slot="cost" data-status="${e(parts.status)}" role="img" aria-label="${e(view.cost.label)}"><dt>COST${e(top)}${parts.caption ? `<small>${e(parts.caption)}</small>` : ''}</dt><dd>${e(parts.main)}</dd></div>`;
}

function cell(label, value, h, extra = '') {
  const e = h.escape;
  return `<div><dt>${e(label)}</dt><dd title="${e(value)}">${e(value)}${extra}</dd></div>`;
}

function keyFigures(view, h) {
  const e = h.escape;
  const facts = figures(view);
  const diff = view.diff.known
    ? `<div><dt>LOC${view.diff.filesText ? `<small>${e(view.diff.filesText)}</small>` : ''}</dt><dd title="${e(view.diff.value)}"><span class="tk-a">${e(view.diff.addText)}</span> <span class="tk-d">${e(view.diff.delText)}</span></dd></div>`
    : cell('LOC', view.diff.value, h);
  const gate = view.gates
    ? `<div title="${e(view.gates.text)}"><dt>GATE${view.gates.bounces.length ? `<small>${e(plural(view.gates.bounces.length, 'bounce'))}</small>` : ''}</dt><dd>${e(view.gates.label)}${view.gates.rightFirstTime ? '<i class="tk-rft" title="Right first time">RFT</i>' : view.gates.counted ? `<i class="tk-bnc">${e(view.gates.counted)} CNT</i>` : ''}</dd></div>`
    : cell('PLAYS', view.plays.text, h);
  return `<dl class="tk-stats">${costCell(view, h)}${cell('TIME', facts.time.value, h)}${cell('VOL · TOKENS', facts.tokens.value, h)}${diff}${cell('PR', facts.pr.value, h)}${gate}</dl>`;
}

function bookRows(view) {
  const rows = [];
  for (const crack of view.condition?.cracks ?? []) {
    const what = [crack.ref || 'Linked bug', crack.severity].filter(Boolean).join(' ');
    if (crack.mended) rows.push({ date: shortDate(crack.mended.at), title: `Mended ${what}${crack.mended.pr !== null ? ` in #${crack.mended.pr}` : ''}${crack.mended.bySteward ? ' by its steward' : crack.mended.by ? ` by ${crack.mended.by}` : ''}`, tone: 'gold' });
    rows.push({ date: '—', title: `Crack ${what}${crack.title ? ` · ${crack.title}` : ''}`, tone: crack.mended ? 'mended' : 'danger' });
  }
  const timeline = view.tabs.find(tab => tab.id === 'context')?.lists.at(-1)?.items ?? [];
  const dated = timeline.map(item => ({ ...metaTime(item.meta), title: item.title, meta: item.meta, tone: item.tone }));
  for (const bounce of view.gates?.bounces ?? []) {
    const from = view.gates.steps.find(step => step.key === bounce.from)?.label ?? bounce.from;
    const to = view.gates.steps.find(step => step.key === bounce.to)?.label ?? bounce.to;
    dated.push({ date: shortDate(bounce.at), at: Date.parse(bounce.at) || 0, title: `Bounce ${from} → ${to} · ${bounce.reasonText}${bounce.counted ? '' : ' · not counted'}`, tone: bounce.counted ? 'attention' : 'neutral' });
  }
  dated.sort((a, b) => b.at - a.at);
  return [...rows, ...dated].slice(0, 6);
}

function book(view, h) {
  const e = h.escape;
  const rows = bookRows(view);
  const body = rows.length
    ? rows.map(row => `<div class="tk-br" data-tone="${e(row.tone)}" title="${e(row.meta ? `${row.title} · ${row.meta}` : row.title)}"><span class="tk-bt">${e(row.date)}</span><span class="tk-bx">${e(row.title)}</span><span class="tk-bd" aria-hidden="true">${marks[row.tone] ?? (row.tone === 'mended' ? '▼' : '—')}</span></div>`).join('')
    : '<div class="tk-br" data-tone="neutral"><span class="tk-bt">—</span><span class="tk-bx">No events yet.</span><span class="tk-bd" aria-hidden="true">—</span></div>';
  const end = rows.length ? '<div class="tk-br tk-eob" aria-hidden="true"><span class="tk-bt"></span><span class="tk-bx">— END OF BOOK —</span><span class="tk-bd"></span></div>' : '';
  return `<div class="tk-book"><div class="tk-bh"><span>DATE</span><span>ORDER BOOK · EVENTS</span><span>SIDE</span></div><div class="tk-rows">${body}${end}</div></div>`;
}

function underwriter(view, h) {
  const e = h.escape;
  const steward = view.steward;
  const line = steward.signed
    ? `<span class="tk-line" title="${e(steward.detail || 'Signed')}"><span class="tk-ink" aria-hidden="true">${e(steward.name)}</span><i class="tk-nib" aria-hidden="true"></i></span>`
    : `<span class="tk-line tk-off" title="${e(steward.detail)}"><span class="tk-uns" aria-hidden="true">× UNSIGNED</span></span>`;
  return `<div class="tk-uw" data-slot="steward"><div class="tk-uwl"><span class="tk-k">UNDERWRITER · STEWARD</span>${line}</div><div class="tk-uwr"><span class="tk-k">ANALYST · CREW</span><span class="tk-crew">${e(view.crew)}</span></div><span class="sr-only">${e(steward.text)}</span></div>`;
}

function tapeItems(view, extra) {
  const items = honours(view).map(entry => ({ text: entry.label.toUpperCase(), tone: entry.tone, strong: true }));
  const facts = [
    view.release?.released ? view.release.label : view.release?.reported === false ? 'Releases not reported' : 'Not live yet',
    ...extra,
    view.condition?.text,
    view.gates ? `Delivery ${view.gates.text}` : '',
    view.set && !view.set.setCard ? view.set.text : '',
    view.pr ? `${view.pr.text} ${view.pr.state.label.toLowerCase()} · ${view.pr.ciText}` : '',
    view.diff.known ? view.diff.value : '',
    view.state.description,
  ].filter(Boolean);
  return [...items, ...facts.map(text => ({ text, tone: 'neutral', strong: false }))];
}

function tape(view, h, extra = []) {
  const e = h.escape;
  const items = tapeItems(view, extra);
  const copy = items.map(item => item.strong ? `<b data-tone="${e(item.tone)}">${e(item.text)}</b>` : `<span>${e(item.text)}</span>`).join('<i aria-hidden="true">|</i>');
  const length = Math.max(1, Math.min(8, Math.round(items.reduce((total, item) => total + item.text.length + 3, 0) / 45)));
  return `<div class="tk-news" data-len="${length}"><div class="tk-run"><span class="tk-copy">${copy}<i aria-hidden="true">|</i></span><span class="tk-copy" aria-hidden="true">${copy}<i>|</i></span></div></div>`;
}

function footer(view, h) {
  const e = h.escape;
  const condition = view.condition ? `<b class="tk-cnd" data-condition="${e(view.condition.state)}" title="${e(view.condition.text)}">${e(view.condition.label.toUpperCase())}</b>` : '';
  return `<div class="tk-ftr"><span class="tk-ids" data-slot="ids">${e(view.ids.join(' · '))}</span><span class="tk-fm">${condition}<span>${e(view.finish.label.toUpperCase())}</span></span>${view.demo ? '<b class="tk-demo" title="Illustrative record: no model calls, no spend">DEMO</b>' : ''}</div>`;
}

function setStrip(view, h) {
  const set = view.set;
  if (!set || set.setCard) return '';
  const e = h.escape;
  const pips = Array.from({ length: set.size }, (_, index) => { const member = set.members.find(entry => entry.number === index + 1); return `<i data-state="${e(member?.state ?? 'open')}"${index + 1 === set.number ? ' data-self' : ''}></i>`; }).join('');
  return `<div class="tk-setl" title="${e(set.text)}"><span class="tk-sk">SET</span><span class="tk-sn">${e(`${set.number}/${set.size}`)}</span><span class="tk-stt">${e(set.title)}</span><span class="tk-pips" aria-hidden="true">${pips}</span></div>`;
}

function crack(view) {
  if (!view.condition) return '';
  const paths = crackPaths(markSeed(view), { x: 64, y: 58, reach: 0.9 });
  const draw = paths.map(path => `<path d="${path.d}" pathLength="1" data-root="${path.root}"${path.branch ? ' class="tk-cbr"' : ''}/>`).join('');
  const mended = view.condition.state === 'mended';
  return `<svg class="tk-crk${mended ? ' tk-mended' : ''}" viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true" focusable="false"><g class="tk-cshade">${draw}</g><g class="tk-ccore">${draw}</g>${mended ? `<g class="tk-cgold">${draw}</g><g class="tk-cglint">${draw}</g>` : `<g class="tk-cedge">${draw}</g>`}</svg>`;
}

function banners(view, h) {
  const e = h.escape;
  const set = view.set;
  const out = [
    ['state', `STATUS ▸ ${view.state.label.toUpperCase()}`, ''],
    ['merged', `LIMIT UP · MERGED${view.pr ? ` ${view.pr.text}` : ''}`, 'up'],
    ['signed', `UNDERWRITTEN · ${view.steward.signed ? view.steward.name.toUpperCase() : 'STEWARD'}`, ''],
    ['released', '▶ NOW TRADING IN PRODUCTION', 'up'],
    ['finish', `FEED UPGRADE ▸ ${view.finish.label.toUpperCase()}`, view.finish.level >= 4 ? 'gold' : 'up', view.finish.level ? `${view.finish.label} finish · ${plural(view.finish.days, 'day')} live` : ''],
    ['grade', view.grade ? `RATING ▸ ${view.grade.text} ${gradeName(view.grade.overall).toUpperCase()}` : 'RATING ▸ NR', ''],
    ['gate', view.gates ? `GATE ▸ ${view.gates.label.toUpperCase()}` : 'GATE', ''],
    ['bounce', 'BOUNCE · BACK A GATE', 'dn'],
    ['crack', '■ CIRCUIT BREAKER · HALTED', 'dn', view.condition?.text ?? ''],
    ['mend', 'TRADING RESUMED · MENDED', 'gold', view.condition?.text ?? ''],
    ['set', set?.complete ? '▲ SET COMPLETE' : set ? `HOLDINGS ▸ ${set.settled}/${set.size} SETTLED` : 'SET', set?.complete ? 'gold' : 'up', set ? set.title : ''],
  ];
  return out.map(([name, text, tone, sub = '']) => `<span class="tk-bn" data-for="${name}"${tone ? ` data-bn="${tone}"` : ''}><span>${e(text)}</span>${sub ? `<small>${e(sub)}</small>` : ''}</span>`).join('');
}

function layers(view) {
  const level = view.finish.level;
  return `<i class="tk-bezel" aria-hidden="true"></i>${level >= 4 || view.set?.complete ? '<i class="tk-gild" aria-hidden="true"></i>' : ''}`;
}

function screenLayers(view) {
  const level = view.finish.level;
  return `${level >= 1 ? '<i class="tk-glass" aria-hidden="true"></i>' : ''}${level >= 3 ? '<i class="tk-prz" aria-hidden="true"></i>' : ''}`;
}

function marquee(view) {
  if (view.finish.level < 5 && !view.set?.complete) return '';
  return '<svg class="tk-marq" aria-hidden="true" focusable="false"><rect class="tk-ma"/><rect class="tk-mb"/></svg>';
}

function fx(view, h) {
  return `<div class="tk-fx" aria-hidden="true"><i class="tk-sweep"></i>${banners(view, h)}</div>`;
}

function roleLine(view) {
  const role = view.crew === 'No agent Runs yet' ? '' : view.crew.split(' · ')[0].replace(/ ×\d+$/, '');
  return [role ? role[0].toUpperCase() + role.slice(1) : '', view.rounds ? `Round ${view.rounds}` : '', view.plays.text].filter(Boolean).join(' · ');
}

function standard(view, h) {
  const e = h.escape;
  return `<article ${rootAttributes(view, 'standard', h)} aria-label="Run card: ${e(view.title)}">
    <div class="sk-card">${rarityFrame(view)}${layers(view)}
      <div class="tk-scr">
        ${keyStrip(view, h, false)}
        ${statusBar(view, h, roleLine(view))}
        ${quote(view, h)}
        ${setStrip(view, h)}
        ${chart(view, h)}
        ${slab(view, h)}
        ${keyFigures(view, h)}
        ${kpiStrip(view, h, { label: 'Key figures' })}
        ${book(view, h)}
        ${underwriter(view, h)}
        ${tape(view, h)}
        ${footer(view, h)}
        ${screenLayers(view)}${crack(view)}${fx(view, h)}
      </div>
      ${marquee(view)}
    </div>
    <button type="button" class="sk-more" data-card-action="flip">More info${h.icon('chevron')}</button>
  </article>`;
}

function fundQuote(view, h) {
  const e = h.escape;
  const set = view.set;
  const toGo = set.size - set.settled;
  const change = set.complete
    ? '<span class="tk-chg" data-dir="top"><b>▲ COMPLETE</b><small>all settled</small></span>'
    : `<span class="tk-chg" data-dir="up"><b>${e(toGo)} TO GO</b><small>to settle</small></span>`;
  return `<div class="tk-quote">
    <div class="tk-sym"><b>${e(set.ref || `#${view.id}`)}</b><small>Set Card · fund</small></div>
    ${change}
    <div class="tk-px" title="${e(set.progress)}"><span class="tk-flaps">${flaps(`${set.settled}/${set.size}`, h)}</span><span class="tk-unit">SET-<br>TLED</span></div>
    <span class="tk-fin" title="${e(`${set.merged} of ${set.size} merged`)}"><span>MERGED ${e(set.merged)}/${e(set.size)}</span><i class="tk-bar" aria-hidden="true"><i data-step="${step20(set.merged / set.size)}"></i></i></span>
    <h3 class="tk-title" data-slot="title"><span>${e(view.title)}</span></h3>
    <i class="tk-inv" aria-hidden="true"></i>
  </div>`;
}

function fundCondition(view, h) {
  const e = h.escape;
  const set = view.set;
  const segments = Array.from({ length: set.size }, (_, index) => { const member = set.members.find(entry => entry.number === index + 1); return `<i data-state="${e(member?.state ?? 'open')}"></i>`; }).join('');
  const words = set.complete ? '<b>CONDITION MET ✓</b> Every Work Item settled: 30 days live.' : `<b>COMPLETES</b> when all ${e(set.size)} Work Items have settled: 30 days live.`;
  return `<div class="tk-cond${set.complete ? ' tk-done' : ''}"><span class="tk-ct">${words}</span><span class="tk-cn">${e(set.settled)}/${e(set.size)}</span><span class="tk-seg" aria-hidden="true">${segments}</span></div>`;
}

function holdings(view, h) {
  const e = h.escape;
  const set = view.set;
  const shown = Math.min(set.size, 8);
  const rows = Array.from({ length: shown }, (_, index) => {
    const member = set.members.find(entry => entry.number === index + 1);
    const state = member?.state ?? 'none';
    const title = member ? member.title || member.ref || 'Work Item' : 'Not in the set yet';
    return `<div class="tk-hr" data-state="${e(state)}" title="${e(member ? [member.ref, member.title, member.stateText].filter(Boolean).join(' · ') : 'Not in the set yet')}"><span class="tk-hn">${e(`${index + 1}/${set.size}`)}</span><span class="tk-hf">${e(member?.ref || '—')}</span><span class="tk-ht">${e(title)}</span><span class="tk-hs">${state === 'open' || state === 'none' ? '· ' : '✓ '}${holdingStates[state]}</span></div>`;
  }).join('');
  const more = set.size > shown ? `<div class="tk-hr tk-hmore"><span class="tk-hn"></span><span class="tk-hf"></span><span class="tk-ht">+${e(set.size - shown)} more holdings on the back</span><span class="tk-hs"></span></div>` : '';
  return `<div class="tk-hold"><div class="tk-hh"><span>#</span><span>REF</span><span>HOLDING · WORK ITEM</span><span>STATE</span></div>${rows}${more}${set.complete ? '<span class="tk-stamp" aria-hidden="true">▲ SET COMPLETE</span>' : ''}<span class="sr-only">${e(set.progress)}</span></div>`;
}

function fundFigures(view, h) {
  const set = view.set;
  return `<dl class="tk-stats tk-fund">${costCell(view, h)}${cell('MERGED', `${set.merged}/${set.size}`, h)}${cell('SETTLED', `${set.settled}/${set.size}`, h)}</dl>`;
}

function setCard(view, h) {
  const e = h.escape;
  const set = view.set;
  return `<article ${rootAttributes(view, 'set', h)} aria-label="Set Card: ${e(view.title)}">
    <div class="sk-card">${rarityFrame(view)}${layers(view)}
      <div class="tk-scr">
        ${keyStrip(view, h, true)}
        ${statusBar(view, h, `Set of ${set.size}${set.ref ? ` · ${set.ref}` : ''}`)}
        ${fundQuote(view, h)}
        ${fundCondition(view, h)}
        ${holdings(view, h)}
        ${slab(view, h)}
        ${fundFigures(view, h)}
        ${underwriter(view, h)}
        ${tape(view, h, [set.text, `${set.progress} · ${set.merged}/${set.size} merged`, set.complete ? 'Set complete' : `Completes when all ${set.size} Work Items have settled: 30 days live`])}
        ${footer(view, h)}
        ${screenLayers(view)}${crack(view)}${fx(view, h)}
      </div>
      ${marquee(view)}
    </div>
    <button type="button" class="sk-more" data-card-action="flip">More info${h.icon('chevron')}</button>
  </article>`;
}

/**
 * Draws one face of a card as markup. The front is a trading terminal: a function-key strip, a status bar, days live
 * as the big amber readout with the next finish as the change line, a chart of the finish ladder against days since
 * release, the grade as a quote table, key figures, the Work Item's events as an order book, the Steward as the
 * underwriter and honours on a news tape. Each finish adds one terminal upgrade (CRT glass, a colour feed, a prismatic
 * screen edge, a gold bezel, marquee lights). A Set Card is a fund whose holdings are the set's Work Items. The back is
 * Unfold Native's tabs in terminal colours.
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
 * Lights the drawn front: the pointer tilts the terminal and moves the light across the glass and colour feed, the
 * light drifts and the news tape runs while idle, and a change between two draws plays its moment (see `attachSkin`).
 * @param {Element} face The front face the runtime drew.
 * @param {object} view The `cardView` model.
 * @returns {() => void}
 */
export function attach(face, view) {
  return attachSkin(face, view, { tilt: 8 });
}
