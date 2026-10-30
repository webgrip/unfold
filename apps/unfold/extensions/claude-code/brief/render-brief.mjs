#!/usr/bin/env node
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { markSvg, tokensCss, wordmarkSvg } from './brand.mjs';
import { isWebUrl, validateBrief } from './validate-brief.mjs';

const fontStylesheet = 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..800&display=swap';

const evidenceStatus = {
  verified: { glyph: 'lit', word: 'verified', meaning: 'someone ran the check and it held' },
  unverified: { glyph: 'dashed', word: 'unverified', meaning: 'nobody checked' },
  stale: { glyph: 'half', word: 'stale', meaning: 'checked once, no longer current' },
  failed: { glyph: 'stop', word: 'failed', meaning: 'checked and it did not hold' },
};

const stepStatus = {
  done: { glyph: 'lit', word: 'done', meaning: 'step finished and every check behind it verified' },
  unproven: { glyph: 'half', word: 'unproven', meaning: 'marked done, but a check behind it is missing, stale or unverified' },
  pending: { glyph: 'open', word: 'pending', meaning: 'not started or still running' },
  blocked: { glyph: 'stop', word: 'blocked', meaning: 'cannot go on until something changes' },
};

const sourceKinds = {
  command: 'Command',
  ci: 'CI run',
  live: 'Live check',
  render: 'Render',
  review: 'Review',
  document: 'Document',
};

const riskPips = { low: 1, medium: 2, high: 3 };

const timeFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' });

const htmlEntities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text for an HTML element body or a double-quoted attribute. */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => htmlEntities[character]);
}

const esc = escapeHtml;

function link(url, html, className = '') {
  if (!isWebUrl(url)) return html;
  const classAttribute = className ? ` class="${className}"` : '';
  return `<a${classAttribute} href="${esc(url)}" rel="noreferrer">${html}</a>`;
}

function paragraphs(text, className = '') {
  const classAttribute = className ? ` class="${className}"` : '';
  return String(text).split(/\n\s*\n/).map(part => part.trim()).filter(Boolean)
    .map(part => `<p${classAttribute}>${esc(part).replace(/\n/g, '<br>')}</p>`).join('');
}

function time(iso) {
  const parsed = new Date(iso);
  const shown = Number.isNaN(parsed.getTime()) ? iso : `${timeFormat.format(parsed)} UTC`;
  return `<time datetime="${esc(iso)}">${esc(shown)}</time>`;
}

function glyph(kind, size = 'small') {
  const shapes = {
    lit: '<circle class="g-fill-lamp" cx="10" cy="10" r="7"/>',
    open: '<circle class="g-ring" cx="10" cy="10" r="6.25"/>',
    dashed: '<circle class="g-ring g-dash" cx="10" cy="10" r="6.25"/>',
    half: '<circle class="g-ring" cx="10" cy="10" r="6.25"/><path class="g-fill-muted" d="M10 3.75a6.25 6.25 0 0 0 0 12.5z"/>',
    stop: '<rect class="g-fill-ink" x="3" y="3" width="14" height="14" rx="1.5"/><path class="g-cut" d="M7 7l6 6M13 7l-6 6"/>',
  };
  return `<svg class="glyph glyph-${size}" viewBox="0 0 20 20" aria-hidden="true" focusable="false">${shapes[kind]}</svg>`;
}

function statusTag(meta) {
  return `<span class="status status-${meta.word}">${glyph(meta.glyph)}<span>${meta.word}</span></span>`;
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) counts[item[key]] = (counts[item[key]] ?? 0) + 1;
  return counts;
}

function pageTitle(record) {
  if (record.workItem?.id) return `${record.workItem.id} Delivery Brief`;
  return [...record.title].length <= 60 ? record.title : 'Delivery Brief';
}

function lockup() {
  return `<span class="lockup" role="img" aria-label="Unfold">${markSvg.trim()}${wordmarkSvg.trim()}</span>`;
}

function masthead(record) {
  return `<header class="masthead">
<div class="bar">${lockup()}<p class="masthead-meta"><span class="label">Delivery Brief</span> <span class="masthead-time">${time(record.generatedAt)}</span></p></div>
</header>`;
}

function workItemLine(record) {
  const parts = [];
  if (record.workItem) {
    const { id, title, url } = record.workItem;
    const text = `<strong>${esc(id)}</strong>${title ? ` ${esc(title)}` : ''}`;
    parts.push(`<li class="ref"><span class="label">Work Item</span> <span>${link(url, text)}</span></li>`);
  }
  for (const pr of record.pullRequests ?? []) {
    const state = pr.state ? ` <span class="pr-state pr-${pr.state}">${pr.state}</span>` : '';
    parts.push(`<li class="ref"><span class="label">Pull request</span> <span>${link(pr.url, esc(pr.title ?? pr.url))}</span>${state}</li>`);
  }
  return parts.length ? `<ul class="refs">${parts.join('')}</ul>` : '';
}

function lightsFromRecord(record) {
  const rollout = record.rollout ?? [];
  if (rollout.length) {
    const statusOf = new Map(record.evidence.map(item => [item.id, item.status]));
    const proven = step => (step.evidence ?? []).length > 0 && step.evidence.every(id => statusOf.get(id) === 'verified');
    return {
      unit: 'step',
      metas: stepStatus,
      lights: rollout.map((step, index) => ({ meta: stepStatus[step.status === 'done' && !proven(step) ? 'unproven' : step.status], href: `#step-${index + 1}`, label: step.step, number: index + 1 })),
    };
  }
  return {
    unit: 'evidence item',
    metas: evidenceStatus,
    lights: record.evidence.map((item, index) => ({ meta: evidenceStatus[item.status], href: `#ev-${item.id}`, label: item.claim, number: index + 1 })),
  };
}

function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function acceptanceState(lights) {
  const lit = lights.filter(light => light.meta.glyph === 'lit').length;
  const held = lights.filter(light => light.meta.glyph === 'stop').length;
  if (!lights.length) return { word: 'No lights', line: 'Nothing was recorded to check. Acceptance is a person’s call.' };
  if (held) return { word: 'Held', line: `${plural(held, 'light')} ${held === 1 ? 'shows' : 'show'} a stop. Clear ${held === 1 ? 'it' : 'them'} before Acceptance.` };
  if (lit === lights.length) return { word: 'Clear', line: 'Every light is lit. Acceptance is the reviewer’s call.' };
  return { word: 'Waiting', line: `${plural(lights.length - lit, 'light')} still unlit before Acceptance.` };
}

function approachLights(record) {
  const { unit, metas, lights } = lightsFromRecord(record);
  const lit = lights.filter(light => light.meta.glyph === 'lit').length;
  const acceptance = acceptanceState(lights);
  const counts = countBy(lights.map(light => light.meta), 'word');
  const tally = Object.values(metas).filter(meta => counts[meta.word]).map(meta => `${counts[meta.word]} ${meta.word}`).join(' · ');
  const items = lights.map(light => {
    const word = light.meta.glyph === 'stop' ? `<span class="light-word">${light.meta.word}</span>` : '';
    return `<li class="light light-${light.meta.glyph}"><a href="${light.href}">${glyph(light.meta.glyph, 'lamp')}<span class="light-number" aria-hidden="true">${light.number}</span>${word}<span class="sr-only">${unit} ${light.number}, ${light.meta.word}: ${esc(light.label)}</span></a></li>`;
  }).join('');
  const legend = Object.values(metas).map(meta => `<li>${glyph(meta.glyph)}<span><strong>${meta.word}</strong> ${meta.meaning}</span></li>`).join('');
  return `<section class="approach" aria-labelledby="approach-title">
<div class="approach-head"><h2 id="approach-title" class="label">Approach lights, one per ${unit}</h2><p class="tally">${lit} of ${plural(lights.length, unit)} lit${tally ? ` <span aria-hidden="true">·</span> ${tally}` : ''}</p></div>
<div class="runway">
<ol class="lights" aria-label="${lit} of ${plural(lights.length, unit)} lit">${items}</ol>
<div class="threshold threshold-${acceptance.word.toLowerCase().replace(/\s+/g, '-')}">${acceptance.word === 'Held' ? glyph('stop', 'lamp') : '<span class="piano" aria-hidden="true"><i></i><i></i><i></i><i></i></span>'}<p><span class="label">Acceptance</span> <strong>${acceptance.word}</strong></p><p class="threshold-line">${acceptance.line}</p></div>
</div>
<ul class="legend" aria-label="Legend">${legend}</ul>
</section>`;
}

function sheet(record) {
  return `<section class="sheet" aria-labelledby="brief-title">
<p class="eyebrow label">Delivery Brief</p>
<h1 id="brief-title">${esc(record.title)}</h1>
${workItemLine(record)}
<div class="summary">${paragraphs(record.summary)}</div>
${approachLights(record)}
</section>`;
}

function changesList(changes) {
  const items = changes.map(change => `<li>
<p class="change-area">${esc(change.area)}</p>
<p>${esc(change.what)}</p>
${change.why ? `<p class="change-why"><span class="label">Why</span> ${esc(change.why)}</p>` : ''}
${isWebUrl(change.url) ? `<p>${link(change.url, 'View the change')}</p>` : ''}
</li>`).join('');
  return `<ol class="changes">${items}</ol>`;
}

function statTiles(evidence) {
  const counts = countBy(evidence, 'status');
  const tiles = Object.values(evidenceStatus).map(meta => {
    const count = counts[meta.word] ?? 0;
    return `<li class="tile${count ? '' : ' tile-zero'}">${glyph(meta.glyph)}<span class="tile-count">${count}</span><span class="tile-word">${meta.word}</span></li>`;
  }).join('');
  return `<ul class="tiles" aria-label="Evidence by status">${tiles}</ul>`;
}

function sourceCell(source) {
  const lines = [`<span class="source-kind">${esc(sourceKinds[source.kind] ?? source.kind)}</span>`];
  if (source.ref) lines.push(`<code>${esc(source.ref)}</code>`);
  const facts = [];
  if (Number.isInteger(source.exitCode)) facts.push(`exit code ${source.exitCode}`);
  if (source.ledger) facts.push(`ledger ${esc(source.ledger)}`);
  if (source.at) facts.push(`checked ${time(source.at)}`);
  if (facts.length) lines.push(`<span class="source-facts">${facts.join(' · ')}</span>`);
  if (isWebUrl(source.url)) lines.push(link(source.url, 'Open the evidence'));
  return lines.join('');
}

function evidenceLedger(evidence) {
  if (!evidence.length) return '<p class="empty">No evidence was recorded, so every claim in this brief is unverified.</p>';
  const rows = evidence.map(item => `<tr id="ev-${esc(item.id)}">
<td data-label="Status">${statusTag(evidenceStatus[item.status])}</td>
<td data-label="Claim"><p class="claim">${esc(item.claim)}</p>${item.detail ? paragraphs(item.detail, 'detail') : ''}<p class="ev-id">${esc(item.id)}</p></td>
<td data-label="Source" class="source">${sourceCell(item.source)}</td>
</tr>`).join('');
  return `${statTiles(evidence)}
<div class="table-wrap"><table class="ledger"><caption class="sr-only">Evidence ledger: each claim, its status and where to check it</caption>
<thead><tr><th scope="col">Status</th><th scope="col">Claim</th><th scope="col">Source</th></tr></thead>
<tbody>${rows}</tbody></table></div>`;
}

function riskList(risks) {
  const items = risks.map(risk => {
    const pips = [1, 2, 3].map(pip => `<i class="${pip <= riskPips[risk.level] ? 'on' : ''}"></i>`).join('');
    return `<li><p class="risk-level"><span class="pips" aria-hidden="true">${pips}</span><span>${risk.level}</span></p><div><p>${esc(risk.risk)}</p>${risk.mitigation ? `<p class="mitigation"><span class="label">Mitigation</span> ${esc(risk.mitigation)}</p>` : ''}</div></li>`;
  }).join('');
  return `<ul class="risks">${items}</ul>`;
}

function fold(id, title, lede, body) {
  return `<section class="fold" id="${id}" data-fold aria-labelledby="${id}-title">
<h2 class="fold-title" id="${id}-title">${title}</h2>
<p class="fold-lede">${lede}</p>
${body}
</section>`;
}

function reviewerFold(record) {
  const risks = record.risks?.length ? `<h3>Risks</h3>${riskList(record.risks)}` : '';
  return fold('reviewer', 'Reviewer', 'What the change means to do, what it touched, and the proof behind each claim.', `<h3>Intent</h3>
<div class="prose">${paragraphs(record.intent)}</div>
<h3>Changes</h3>
${changesList(record.changes)}
<h3>Evidence</h3>
${evidenceLedger(record.evidence)}
${risks}`);
}

function evidenceRefs(ids, byId) {
  if (!ids?.length) return '';
  const refs = ids.map(id => {
    const item = byId.get(id);
    const meta = item ? evidenceStatus[item.status] : evidenceStatus.unverified;
    return `<li><a href="#ev-${esc(id)}">${glyph(meta.glyph)}<span>${esc(id)}</span></a> <span class="ref-status">${meta.word}</span></li>`;
  }).join('');
  return `<div class="step-evidence"><span class="label">Evidence</span><ul>${refs}</ul></div>`;
}

function operatorFold(record) {
  const byId = new Map(record.evidence.map(item => [item.id, item]));
  const steps = (record.rollout ?? []).map((step, index) => `<li id="step-${index + 1}" class="step step-${step.status}">
<span class="step-number" aria-hidden="true">${index + 1}</span>
<div class="step-body">
<p class="step-head">${statusTag(stepStatus[step.status])}<span class="step-text">${esc(step.step)}</span></p>
${step.check ? `<p class="step-check"><span class="label">Check</span> ${esc(step.check)}</p>` : ''}
${evidenceRefs(step.evidence, byId)}
</div>
</li>`).join('');
  const rollout = steps ? `<h3>Rollout</h3><ol class="steps">${steps}</ol>` : '';
  const rollback = record.rollback?.length ? `<h3>Rollback</h3><ol class="rollback">${record.rollback.map(line => `<li>${esc(line)}</li>`).join('')}</ol>` : '';
  return fold('operator', 'Operator', 'The rollout in order, how to check each step, and how to back out.', `${rollout}${rollback}`);
}

function clientFold(client) {
  const summary = client.summary ? `<div class="prose">${paragraphs(client.summary)}</div>` : '';
  const preview = isWebUrl(client.previewUrl) ? `<p class="preview">${link(client.previewUrl, 'Open the Preview Environment', 'preview-link')}<span class="preview-url">${esc(client.previewUrl)}</span></p>` : '';
  const tryThis = client.tryThis?.length ? `<h3>Try this</h3><ol class="try">${client.tryThis.map(line => `<li>${esc(line)}</li>`).join('')}</ol>` : '';
  return fold('client', 'Client', 'In plain words: what changed for you and how to see it.', `${summary}${preview}${tryThis}`);
}

function decisionsFold(decisions) {
  const items = decisions.map(decision => `<article class="decision">
<h3>${esc(decision.question)}</h3>
${decision.options?.length ? `<ul class="options">${decision.options.map(option => `<li>${esc(option)}</li>`).join('')}</ul>` : ''}
${decision.recommendation ? `<p class="recommendation"><span class="label">Recommended</span> ${esc(decision.recommendation)}</p>` : ''}
</article>`).join('');
  return fold('decisions', 'Decisions', 'Open questions a person has to answer.', items);
}

function folds(record) {
  const sections = [{ id: 'reviewer', name: 'Reviewer', html: reviewerFold(record) }];
  if (record.rollout?.length || record.rollback?.length) sections.push({ id: 'operator', name: 'Operator', html: operatorFold(record) });
  const client = record.client;
  if (client && (client.summary || client.previewUrl || client.tryThis?.length)) sections.push({ id: 'client', name: 'Client', html: clientFold(client) });
  if (record.decisions?.length) sections.push({ id: 'decisions', name: `Decisions <span class="tab-count">${record.decisions.length}</span>`, html: decisionsFold(record.decisions) });
  const tabs = sections.map((section, index) => `<button type="button" role="tab" id="tab-${section.id}" aria-controls="${section.id}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">${section.name}</button>`).join('');
  return `<div class="folds">
<div class="tabs" role="tablist" aria-label="Read as" hidden>${tabs}</div>
${sections.map(section => section.html).join('\n')}
</div>`;
}

function footer(record) {
  const session = record.session?.id || record.session?.url
    ? `<p><span class="label">Session</span> ${link(record.session.url, esc(record.session.id ?? 'Open the session'))}</p>`
    : '';
  return `<footer class="foot">
<p class="creed">Every claim links to its evidence; unverified means nobody checked.</p>
<div class="foot-meta"><p><span class="label">Generated</span> ${time(record.generatedAt)}</p>${session}<p class="schema-id">${esc(record.schema)}</p></div>
</footer>`;
}

const pageCss = `
:root {
  --ground: var(--unfold-ground);
  --ink: var(--unfold-text);
  --muted: var(--unfold-muted);
  --link: var(--unfold-accent);
  --lamp: var(--unfold-mark);
  --sheet-ink: var(--unfold-vouw);
  --rule: #D2D8D4;
  --font: var(--unfold-font);
  --text-display: clamp(1.75rem, 1.15rem + 2.6vw, 2.875rem);
  --text-heading: 1.3125rem;
  --text-sub: 1.0625rem;
  --text-body: 1rem;
  --text-small: 0.875rem;
  --text-label: 0.75rem;
  --measure: 66ch;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --sheet-ink: var(--unfold-vel); --rule: #2B3438; color-scheme: dark; }
}
:root[data-theme="dark"] { --sheet-ink: var(--unfold-vel); --rule: #2B3438; color-scheme: dark; }

body {
  background: var(--ground);
  color: var(--ink);
  font-family: var(--font);
  font-size: var(--text-body);
  line-height: 1.55;
  padding-left: max(16px, env(safe-area-inset-left, 0px));
  padding-right: max(16px, env(safe-area-inset-right, 0px));
  padding-block: 1.25rem 2.5rem;
  -webkit-text-size-adjust: 100%;
}
.page { max-width: 72rem; margin-inline: auto; display: grid; gap: 2rem; }
.brief { display: grid; gap: 2rem; min-width: 0; }
a { color: var(--link); text-decoration-thickness: 1px; text-underline-offset: 0.18em; }
a:hover { text-decoration-thickness: 2px; }
:focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; border-radius: 2px; }
h1, h2, h3 { text-wrap: balance; margin: 0; }
p { margin: 0; }
code { font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; font-size: 0.875em; overflow-wrap: anywhere; }
.label { word-spacing: 0.12em; font-weight: 600; font-size: var(--text-label); letter-spacing: 0.07em; text-transform: uppercase; }
.sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }

.glyph { flex: none; }
.glyph-small { width: 1rem; height: 1rem; }
.glyph-lamp { width: 2.25rem; height: 2.25rem; }
.g-fill-lamp { fill: var(--lamp); }
.g-fill-muted { fill: var(--muted); }
.g-fill-ink { fill: var(--ink); }
.g-ring { fill: none; stroke: var(--muted); stroke-width: 1.75; }
.g-dash { stroke-dasharray: 2.6 2.3; }
.g-cut { stroke: var(--ground); stroke-width: 2; stroke-linecap: round; fill: none; }

.masthead .bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem 1.5rem; }
.lockup { display: inline-flex; align-items: center; gap: 1px; }
.lockup > svg:first-child { width: 2.5rem; height: 2.5rem; }
.lockup > svg:first-child path:first-child { fill: var(--sheet-ink); }
.lockup > svg:first-child path:last-child { fill: var(--lamp); }
.lockup > svg:nth-child(2) { height: 1.42rem; width: 6.47rem; }
.lockup > svg:nth-child(2) path { fill: var(--ink); }
.masthead-meta { display: flex; flex-wrap: wrap; gap: 0.25rem 0.75rem; align-items: baseline; color: var(--muted); font-size: var(--text-small); font-variant-numeric: tabular-nums; }

.sheet { position: relative; display: grid; gap: 1.25rem; padding: clamp(1.25rem, 0.75rem + 2.5vw, 2.5rem); border: 1px solid var(--rule); border-top: 3px solid var(--ink); background: var(--ground); }
.sheet::after { content: ""; position: absolute; top: -3px; right: -1px; width: 1.5rem; height: 1.5rem; background: var(--lamp); clip-path: polygon(0 0, 100% 0, 100% 100%); }
.eyebrow { color: var(--muted); }
.sheet h1 { font-size: var(--text-display); font-weight: 800; font-stretch: 110%; font-variation-settings: "wdth" 110; line-height: 1.08; letter-spacing: -0.014em; max-width: 28ch; }
.refs { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.5rem 1.5rem; font-size: var(--text-small); }
.ref { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.25rem 0.5rem; min-width: 0; }
.ref .label { color: var(--muted); margin-right: 0.25rem; }
.pr-state { font-weight: 600; font-size: var(--text-label); text-transform: uppercase; letter-spacing: 0.07em; border: 1px solid var(--muted); border-radius: 999px; padding: 0 0.5rem; color: var(--ink); }
.summary { max-width: var(--measure); font-size: 1.125rem; line-height: 1.5; display: grid; gap: 0.75rem; }

.approach { display: grid; gap: 0.75rem; border-top: 1px solid var(--rule); padding-top: 1.25rem; }
.approach-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 0.25rem 1rem; }
.approach-head h2 { color: var(--muted); }
.tally { font-size: var(--text-small); font-variant-numeric: tabular-nums; }
.runway { display: flex; flex-wrap: wrap; align-items: stretch; gap: 0.75rem 1.25rem; }
.lights {
  list-style: none; margin: 0; padding: 0; flex: 1 1 18rem; min-width: 0; align-self: start;
  display: grid; grid-template-columns: repeat(auto-fit, minmax(3.25rem, 1fr)); grid-auto-rows: 5rem;
  background-image: linear-gradient(to bottom, transparent 1.0625rem, var(--rule) 1.0625rem, var(--rule) 1.1875rem, transparent 1.1875rem);
  background-size: 100% 5rem;
}
.light a { display: flex; flex-direction: column; align-items: center; gap: 0.125rem; color: var(--ink); text-decoration: none; padding-block: 0; height: 100%; }
.light .glyph-lamp { background: var(--ground); border-radius: 50%; box-shadow: 0 0 0 0.25rem var(--ground); }
.light-stop .glyph-lamp { border-radius: 2px; }
.light-number { font-size: var(--text-small); font-weight: 600; font-variant-numeric: tabular-nums; color: var(--muted); }
.light-word { font-size: 0.6875rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; line-height: 1; }
.light a:hover .light-number { color: var(--ink); text-decoration: underline; }
.threshold { flex: 0 1 14rem; display: grid; align-content: start; gap: 0.25rem; border-left: 1px solid var(--rule); padding-left: 1rem; }
.threshold p:first-of-type { display: flex; align-items: baseline; gap: 0.5rem; }
.threshold strong { font-weight: 800; font-stretch: 110%; font-variation-settings: "wdth" 110; font-size: var(--text-heading); }
.threshold-line { font-size: var(--text-small); color: var(--muted); }
.piano { display: flex; gap: 3px; height: 2.25rem; align-items: stretch; }
.piano i { width: 4px; background: var(--ink); }
.threshold-waiting .piano i, .threshold-no-lights .piano i { background: var(--muted); }
.threshold-held .piano i { background: var(--ink); }
.legend { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.375rem 1.25rem; font-size: var(--text-small); color: var(--muted); }
.legend li { display: flex; gap: 0.375rem; align-items: center; }
.legend strong { color: var(--ink); font-weight: 600; }

.tabs { display: flex; flex-wrap: wrap; gap: 0.25rem 1.5rem; border-bottom: 1px solid var(--rule); }
.tabs button { font: inherit; font-weight: 600; font-size: var(--text-sub); color: var(--muted); background: none; border: 0; border-bottom: 3px solid transparent; padding: 0.5rem 0 0.5rem; margin-bottom: -1px; cursor: pointer; display: inline-flex; gap: 0.375rem; align-items: baseline; }
.tabs button[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--lamp); }
.tabs button:hover { color: var(--ink); }
.tab-count { font-size: var(--text-label); font-variant-numeric: tabular-nums; border: 1px solid currentColor; border-radius: 999px; padding: 0 0.4rem; }
.folds { display: grid; gap: 2.5rem; }
.folds-tabbed .folds { gap: 1.5rem; }
.fold { display: grid; gap: 1rem; align-content: start; min-width: 0; }
.fold-title { font-size: var(--text-heading); font-weight: 700; padding-top: 0.75rem; border-top: 1px solid var(--ink); }
.folds-tabbed .fold-title { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; padding: 0; border: 0; }
.fold-lede { color: var(--muted); max-width: var(--measure); }
.fold h3 { font-size: var(--text-sub); font-weight: 700; margin-top: 1rem; }
.prose { max-width: var(--measure); display: grid; gap: 0.75rem; }

.changes { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr)); gap: 1rem 2rem; counter-reset: change; }
.changes li { display: grid; gap: 0.375rem; align-content: start; padding-top: 0.625rem; border-top: 1px solid var(--rule); min-width: 0; }
.change-area { font-weight: 600; overflow-wrap: anywhere; }
.change-why { color: var(--muted); font-size: var(--text-small); }
.change-why .label, .mitigation .label, .step-check .label, .recommendation .label { color: var(--ink); margin-right: 0.25rem; }

.tiles { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr)); gap: 0.75rem; }
.tile { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: 0.5rem; align-items: center; padding: 0.75rem 1rem; border: 1px solid var(--rule); }
.tile .glyph { grid-row: 1; }
.tile-count { grid-row: 1; font-size: 2rem; font-weight: 800; font-stretch: 110%; font-variation-settings: "wdth" 110; line-height: 1.1; font-variant-numeric: tabular-nums; }
.tile-word { grid-column: 1 / -1; font-weight: 600; font-size: var(--text-label); letter-spacing: 0.07em; text-transform: uppercase; }
.tile-zero .tile-count, .tile-zero .tile-word { color: var(--muted); }

.table-wrap { overflow-x: auto; min-width: 0; }
.ledger { width: 100%; border-collapse: collapse; font-size: var(--text-small); }
.ledger th { text-align: left; font-weight: 600; font-size: var(--text-label); letter-spacing: 0.07em; text-transform: uppercase; color: var(--muted); padding: 0.5rem 0.75rem 0.5rem 0; border-bottom: 1px solid var(--ink); }
.ledger td { vertical-align: top; padding: 0.75rem 0.75rem 0.75rem 0; border-bottom: 1px solid var(--rule); }
.ledger td:first-child { white-space: nowrap; width: 8.5rem; }
.ledger td:nth-child(2) { min-width: 14rem; }
.ledger td > * + * { margin-top: 0.25rem; }
.ledger tr:target td { border-bottom-color: var(--lamp); }
.claim { font-size: var(--text-body); }
.detail { color: var(--muted); }
.ev-id { font-size: var(--text-label); color: var(--muted); font-variant-numeric: tabular-nums; }
.source { display: grid; gap: 0.25rem; }
.source-kind { font-weight: 600; }
.source-facts { color: var(--muted); font-variant-numeric: tabular-nums; }
.status { display: inline-flex; align-items: center; gap: 0.375rem; font-weight: 600; }

.risks { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; max-width: 52rem; }
.risks li { display: grid; grid-template-columns: 6.5rem 1fr; gap: 0.25rem 1rem; padding-top: 0.625rem; border-top: 1px solid var(--rule); }
.risks li > div { display: grid; gap: 0.25rem; min-width: 0; }
.risk-level { display: flex; align-items: center; gap: 0.5rem; font-weight: 600; }
.pips { display: inline-flex; gap: 2px; align-items: flex-end; }
.pips i { width: 4px; border: 1px solid var(--ink); }
.pips i:nth-child(1) { height: 0.5rem; }
.pips i:nth-child(2) { height: 0.75rem; }
.pips i:nth-child(3) { height: 1rem; }
.pips i.on { background: var(--ink); }
.mitigation { color: var(--muted); font-size: var(--text-small); }

.steps { list-style: none; margin: 0; padding: 0; display: grid; max-width: 52rem; }
.step { display: grid; grid-template-columns: 2rem 1fr; gap: 0 0.75rem; padding-block: 0.75rem; border-top: 1px solid var(--rule); scroll-margin-top: 1rem; }
.step:target { border-top-color: var(--lamp); }
.step-number { font-weight: 800; font-stretch: 110%; font-variation-settings: "wdth" 110; font-size: var(--text-heading); line-height: 1.2; font-variant-numeric: tabular-nums; color: var(--muted); }
.step-body { display: grid; gap: 0.375rem; min-width: 0; }
.step-head { display: flex; flex-wrap: wrap; gap: 0.25rem 0.75rem; align-items: baseline; }
.step-head .status { min-width: 6rem; }
.step-text { font-weight: 600; flex: 1 1 16rem; min-width: 0; }
.step-check { font-size: var(--text-small); color: var(--muted); }
.step-evidence { display: flex; flex-wrap: wrap; gap: 0.25rem 0.75rem; align-items: center; font-size: var(--text-small); }
.step-evidence .label { color: var(--muted); }
.step-evidence ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; }
.step-evidence a { display: inline-flex; align-items: center; gap: 0.3rem; }
.ref-status { color: var(--muted); }
.rollback { margin: 0; padding-left: 1.5rem; display: grid; gap: 0.5rem; max-width: var(--measure); }
.rollback li::marker, .try li::marker { font-weight: 700; font-variant-numeric: tabular-nums; }

.preview { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 1rem; }
.preview-link { display: inline-block; padding: 0.625rem 1rem; border: 2px solid var(--link); font-weight: 600; text-decoration: none; }
.preview-link:hover { text-decoration: underline; }
.preview-url { font-size: var(--text-small); color: var(--muted); overflow-wrap: anywhere; min-width: 0; }
.try { margin: 0; padding-left: 1.5rem; display: grid; gap: 0.5rem; max-width: var(--measure); }

.decision { display: grid; gap: 0.5rem; padding-top: 0.75rem; border-top: 1px solid var(--rule); max-width: 52rem; }
.decision h3 { margin-top: 0; }
.options { margin: 0; padding-left: 1.25rem; display: grid; gap: 0.25rem; }
.recommendation { padding-left: 0.75rem; border-left: 3px solid var(--lamp); }

.foot { display: grid; gap: 0.75rem; padding-top: 1.25rem; border-top: 3px solid var(--ink); }
.creed { font-weight: 700; font-size: var(--text-sub); max-width: var(--measure); }
.foot-meta { display: flex; flex-wrap: wrap; gap: 0.25rem 2rem; color: var(--muted); font-size: var(--text-small); font-variant-numeric: tabular-nums; }
.foot-meta .label { margin-right: 0.25rem; }
.schema-id { font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; font-size: var(--text-label); }

@media (max-width: 40rem) {
  .ledger thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .ledger, .ledger tbody, .ledger tr, .ledger td { display: block; width: auto; }
  .ledger tr { border-bottom: 1px solid var(--rule); padding-block: 0.5rem; }
  .ledger td { border: 0; padding: 0.25rem 0; }
  .ledger td:first-child { width: auto; }
  .ledger td:nth-child(2) { min-width: 0; }
  .ledger td[data-label="Source"]::before { content: attr(data-label); display: block; font-weight: 600; font-size: var(--text-label); letter-spacing: 0.07em; text-transform: uppercase; color: var(--muted); }
  .risks li { grid-template-columns: 1fr; }
  .threshold { flex-basis: 100%; border-left: 0; border-top: 1px solid var(--rule); padding-left: 0; padding-top: 0.75rem; }
}

@media print {
  body { padding-block: 0; }
  .tabs { display: none !important; }
  [data-fold][hidden] { display: grid !important; }
  .folds-tabbed .fold-title { position: static; width: auto; height: auto; overflow: visible; clip-path: none; white-space: normal; padding-top: 0.75rem; border-top: 1px solid var(--ink); }
  .fold, .step, .ledger tr, .decision { break-inside: avoid; }
  a { color: var(--ink); }
}
`;

const enhanceScript = `(() => {
  const tabs = Array.from(document.querySelectorAll('.tabs [role="tab"]'));
  if (tabs.length < 2) return;
  const panelOf = tab => document.getElementById(tab.getAttribute('aria-controls'));
  const select = (tab, focus) => {
    for (const each of tabs) {
      const on = each === tab;
      each.setAttribute('aria-selected', String(on));
      each.tabIndex = on ? 0 : -1;
      panelOf(each).hidden = !on;
    }
    if (focus) tab.focus();
  };
  const remember = tab => { try { history.replaceState(null, '', '#' + tab.getAttribute('aria-controls')); } catch (error) {} };
  document.documentElement.classList.add('folds-tabbed');
  tabs[0].parentElement.hidden = false;
  for (const tab of tabs) {
    const panel = panelOf(tab);
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    tab.addEventListener('click', () => { select(tab); remember(tab); });
    tab.addEventListener('keydown', event => {
      const index = tabs.indexOf(tab);
      const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      const target = tabs[(next + tabs.length) % tabs.length];
      select(target, true);
      remember(target);
    });
  }
  const reveal = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    const target = id ? document.getElementById(id) : null;
    const fold = target ? target.closest('[data-fold]') : null;
    const tab = fold ? tabs.find(each => panelOf(each) === fold) : null;
    select(tab || tabs.find(each => each.getAttribute('aria-selected') === 'true') || tabs[0]);
    if (target && fold && target !== fold) target.scrollIntoView({ block: 'start' });
  };
  window.addEventListener('hashchange', reveal);
  document.addEventListener('click', event => {
    const anchor = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
    if (anchor && anchor.getAttribute('href') === location.hash) reveal();
  });
  reveal();
})();`;

/** Render a valid Delivery Brief record as one self-contained HTML page for a claude.ai Artifact; throws listing every error when the record is invalid. */
export function renderBrief(record) {
  const errors = validateBrief(record);
  if (errors.length) {
    const error = new Error(`The Delivery Brief is invalid:\n${errors.map(line => `- ${line}`).join('\n')}`);
    Object.assign(error, { errors });
    throw error;
  }
  return `<title>${esc(pageTitle(record))}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="${esc(record.summary.slice(0, 300))}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fontStylesheet}">
<style>
${tokensCss}
${pageCss}</style>
<div class="page">
${masthead(record)}
<main class="brief" id="brief">
${sheet(record)}
${folds(record)}
</main>
${footer(record)}
</div>
<script>${enhanceScript}</script>
`;
}

function runCli(argv) {
  const [input, output] = argv;
  if (!input) {
    console.error('Usage: node render-brief.mjs <record.json> [out.html]');
    return 2;
  }
  let record;
  try {
    record = JSON.parse(readFileSync(input, 'utf8'));
  } catch (error) {
    console.error(`Cannot read ${input} as JSON: ${error instanceof Error ? error.message : error}`);
    return 2;
  }
  const errors = validateBrief(record);
  if (errors.length) {
    console.error(`${input} is not a valid Delivery Brief:`);
    for (const line of errors) console.error(`- ${line}`);
    return 1;
  }
  const html = renderBrief(record);
  if (output) writeFileSync(output, html);
  else process.stdout.write(html);
  return 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = runCli(process.argv.slice(2));
