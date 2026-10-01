/** The skin's name, matching its folder and manifest. */
export const id = 'vloer-native';

const newTab = '<span class="sr-only"> (opens in a new tab)</span>';
const statusNote = { uncollected: 'Ploeg does not collect this yet', unreported: 'Ploeg did not report this', planned: 'Planned for a later phase', demo: 'The demo makes no model calls' };

function link(h, url, label, extra = '') {
  const href = h.link(url);
  return href ? `<a href="${h.escape(href)}" target="_blank" rel="noopener noreferrer"${extra}>${label}${newTab}</a>` : label;
}

function ring(v, h) {
  const share = v.cost.share;
  const arc = share !== null && share > 0 ? `<circle class="fg" cx="20" cy="20" r="16" pathLength="100" stroke-dasharray="${(share * 100).toFixed(1)} 100"/>` : '';
  return `<div class="ring" data-slot="cost" data-status="${h.escape(v.cost.status)}"${v.cost.over ? ' data-over' : ''} role="img" aria-label="${h.escape(v.cost.label)}">
    <svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><circle class="tr" cx="20" cy="20" r="16"/>${arc}</svg>
    <div class="mid" aria-hidden="true"><b>${h.escape(v.cost.value)}</b>${v.cost.caption ? `<span>${h.escape(v.cost.caption)}</span>` : ''}</div>
  </div>`;
}

function tile(label, body, { cls = '', title = '' } = {}) {
  return `<div class="t${cls ? ` ${cls}` : ''}"${title ? ` title="${title}"` : ''}><small>${label}</small><b>${body}</b></div>`;
}

function tiles(v, h) {
  const e = h.escape;
  const quiet = value => `<span class="sub">${e(value)}</span>`;
  const tokens = v.tokens.known ? `${e(v.tokens.value)}${v.tokens.partial ? '<span class="partial" aria-hidden="true">*</span>' : ''}` : quiet(v.tokens.value);
  const time = v.runTime.known ? e(v.runTime.value) : quiet(v.runTime.value);
  const diff = v.diff.known ? `<span class="add">${e(v.diff.addText)}</span> <span class="rem">${e(v.diff.delText)}</span>${v.diff.filesText ? ` <span class="sub">${e(v.diff.filesText)}</span>` : ''}` : quiet(v.diff.value);
  let pr = quiet('No pull request yet');
  if (v.pr) {
    const ci = v.pr.ci
      ? `<span class="ci" data-tone="${e(v.pr.ci.tone)}" title="${e(v.pr.ci.label)}">${h.icon(v.pr.ci.glyph)}<span class="sr-only">${e(v.pr.ci.label)}</span></span>`
      : `<span class="ci" data-tone="none" title="CI not reported"><span aria-hidden="true">–</span><span class="sr-only">CI not reported</span></span>`;
    pr = `${link(h, v.pr.url, e(v.pr.text))} <span class="pst" data-tone="${e(v.pr.state.tone)}">${e(v.pr.state.label)}</span>${ci}`;
  }
  return `<div class="tiles">
    ${tile('Tokens', tokens, { title: v.tokens.detail ? e(v.tokens.detail) : '' })}
    ${tile('Run time', time)}
    ${tile('Diff', diff, { cls: 't-wide' })}
    ${tile('PR · CI', pr, { cls: 't-wide' })}
  </div>`;
}

function front(v, h) {
  const e = h.escape;
  const signed = v.steward.signed;
  const initials = signed ? v.steward.name.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() : '';
  return `<article class="card" data-tone="${e(v.state.tone)}" aria-label="Run card: ${e(v.title)}">
    <header class="hd">
      <span class="role" aria-hidden="true">${h.icon(v.pr ? 'pull-request' : 'work')}</span>
      <div class="who"><b>Ticket card</b><span>${e(v.repo || v.team || 'No repository')}</span></div>
      ${v.demo ? '<span class="demo" title="Illustrative record: no model calls, no spend">Demo</span>' : ''}
    </header>
    <div class="tl">
      <h3 class="title" data-slot="title">${e(v.title)}</h3>
      <div class="row"><span class="chip" data-slot="state" data-tone="${e(v.state.tone)}" title="${e(v.state.description || '')}">${h.icon(v.state.glyph)}<span>${e(v.state.label)}</span></span></div>
    </div>
    <div class="main">${ring(v, h)}${tiles(v, h)}</div>
    <p class="crew"><small>Crew</small><span>${e(v.crew)}</span></p>
    <div class="sign${signed ? '' : ' off'}" data-slot="steward">
      <span class="av" aria-hidden="true">${e(initials)}</span>
      <span class="sg">${signed ? `<span class="name">${e(v.steward.name)}</span>` : '<span class="line" aria-hidden="true"></span>'}<small>${signed ? `Steward · ${e(v.steward.detail || 'signed')}` : `Unsigned · ${e(v.steward.detail)}`}</small></span>
      <span class="sr-only">${e(v.steward.text)}</span>
    </div>
    <footer class="meta">
      <span class="plays">${h.icon('layers')}${e(v.plays.text)}</span>
      <span class="ids" data-slot="ids">${e(v.ids.join(' · '))}</span>
    </footer>
    <button type="button" class="more" data-card-action="flip">More info${h.icon('chevron')}</button>
  </article>`;
}

function rows(tab, h) {
  const e = h.escape;
  return `<dl class="rows">${tab.rows.map(entry => `<div data-status="${e(entry.status)}"><dt>${e(entry.label)}</dt><dd${statusNote[entry.status] ? ` title="${e(statusNote[entry.status])}"` : ''}>${e(entry.value)}</dd></div>`).join('')}</dl>`;
}

function lists(tab, h) {
  const e = h.escape;
  return tab.lists.map(group => `<section class="group"><h4>${e(group.title)}</h4>${group.items.length ? `<ol class="items">${group.items.map(item => `<li data-tone="${e(item.tone)}"><span class="glyph" aria-hidden="true">${h.icon(item.glyph)}</span><span class="it"><b>${item.url ? link(h, item.url, e(item.title)) : e(item.title)}</b>${item.meta ? `<small>${e(item.meta)}</small>` : ''}</span></li>`).join('')}</ol>` : `<p class="empty">${e(group.empty || 'None.')}</p>`}${group.more > 0 ? `<p class="empty">${e(`${group.more} earlier events are not shown.`)}</p>` : ''}</section>`).join('');
}

function back(v, h) {
  const e = h.escape;
  const tabs = v.tabs.map(tab => `<button type="button" role="tab" class="tab" id="gc-tab-${e(tab.id)}" aria-controls="gc-panel-${e(tab.id)}" data-card-tab="${e(tab.id)}">${e(tab.label)}</button>`).join('');
  const panels = v.tabs.map(tab => {
    const legend = tab.rows.some(entry => entry.status === 'uncollected') ? '<p class="legend"><i class="dot" aria-hidden="true"></i>Not collected yet: Ploeg does not record this yet.</p>' : '';
    return `<section class="pane" role="tabpanel" id="gc-panel-${e(tab.id)}" aria-labelledby="gc-tab-${e(tab.id)}" data-card-panel="${e(tab.id)}" tabindex="0">${rows(tab, h)}${tab.note ? `<p class="note">${e(tab.note)}</p>` : ''}${lists(tab, h)}${legend}</section>`;
  }).join('');
  return `<article class="card back" aria-label="More info: ${e(v.title)}">
    <header class="bh">
      <div class="bh-text"><h3 data-card-focus>More info</h3><span>${e(v.title)}</span></div>
      <button type="button" class="front-btn" data-card-action="flip">${h.icon('chevron-left')}Front</button>
    </header>
    <div class="tabs" role="tablist" aria-label="Card details">${tabs}</div>
    <div class="bscroll">${panels}</div>
    <footer class="bf"><span>${e(v.ids.join(' · '))}</span>${v.demo ? '<span class="demo">Demo</span>' : ''}</footer>
  </article>`;
}

/**
 * Draws one face of a card as markup. Every value comes from the view model and is escaped with `h.escape`; links go
 * through `h.link`, which keeps only http(s) URLs. The front fills the required slots (title, state, cost, steward,
 * ids) and carries the "More info" control; the back carries the tabs.
 * @param {object} view The `cardView` model.
 * @param {{ face: 'front' | 'back', escape: Function, icon: Function, link: Function }} h
 * @returns {string}
 */
export function render(view, h) {
  return h.face === 'back' ? back(view, h) : front(view, h);
}
