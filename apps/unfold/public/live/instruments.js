import { cx, escape, r, span, tokens, usd } from './parts.js';

function gauge(share, over) {
  if (share === null) return '';
  const width = r(Math.max(0, Math.min(1, share)) * 100);
  return `<svg class="lv-gauge" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect class="lv-gauge-track" x="0" y="0" width="100" height="6" rx="3"></rect><rect class="${cx('lv-gauge-fill', over ? 'is-over' : share >= 0.8 ? 'is-high' : '')}" x="0" y="0" width="${width}" height="6" rx="3"></rect></svg>`;
}

function tile({ key, label, value, detail = '', tone = '', extra = '' }) {
  return `<div class="${cx('lv-tile', tone ? `lv-tone-${tone}` : '')}" data-tile="${escape(key)}"><dt class="lv-tile-label">${escape(label)}</dt><dd class="lv-tile-value">${escape(value)}</dd>${extra}${detail ? `<dd class="lv-tile-detail">${escape(detail)}</dd>` : ''}</div>`;
}

/**
 * The instrument tiles: spend against what this attempt holds, time in the air, tokens, and what was lost. Each tile
 * says `Not reported` for a figure Ploeg did not report and never shows it as zero.
 * @param {object} model A `liveModel` result.
 * @param {{ layout?: 'tiles'|'strip'|'list' }} [options] `strip` is one row inside a header, `list` a definition list for a side column.
 * @returns {string}
 */
export function instruments(model, { layout = 'tiles' } = {}) {
  const { spend, time, lost } = model;
  const held = spend.heldUsd !== null ? `of ${usd(spend.heldUsd)} held for this attempt` : 'no hold reported';
  const tiles = [
    tile({ key: 'spend', label: 'Spend', value: usd(spend.usd), detail: spend.usd === null ? 'No Run reported a cost yet' : spend.usd !== spend.attemptUsd ? `${usd(spend.attemptUsd)} ${held}` : held, tone: spend.over ? 'danger' : spend.share !== null && spend.share >= 0.8 ? 'attention' : '', extra: gauge(spend.share, spend.over) }),
    tile({ key: 'time', label: model.running ? 'Airborne' : 'Agent time', value: model.running ? span(time.run) : span(time.agent), detail: lost.seconds ? `${span(time.agent)} in all · ${span(lost.seconds)} on machines that failed` : model.running ? `${span(time.agent)} in all` : `${model.runs.length} ${model.runs.length === 1 ? 'Run' : 'Runs'}` }),
    tile({ key: 'tokens', label: 'Tokens', value: model.tokens.in === null ? tokens(null) : `${tokens(model.tokens.in)} in`, detail: model.tokens.out === null ? '' : `${tokens(model.tokens.out)} out${model.tokens.unreportedRuns ? ` · ${model.tokens.unreportedRuns} ${model.tokens.unreportedRuns === 1 ? 'Run' : 'Runs'} not reported` : ''}` }),
    lost.runs || lost.agentFailures
      ? tile({ key: 'lost', label: 'Lost', value: `${lost.runs + lost.agentFailures} of ${model.runs.length}`, detail: lost.runs && !lost.agentFailures ? 'Machines, not the agent' : lost.agentFailures && !lost.runs ? 'The agent failed' : `${lost.runs} machine · ${lost.agentFailures} agent`, tone: lost.agentFailures ? 'danger' : 'attention' })
      : tile({ key: 'edits', label: 'Files changed', value: model.edits === null ? 'Not loaded' : String(model.edits), detail: model.calls.total === null ? 'Open the Run to load its calls' : `${model.calls.total} tool ${model.calls.total === 1 ? 'call' : 'calls'}` }),
  ];
  return `<dl class="${cx('lv-instruments', `lv-instruments-${layout}`)}">${tiles.join('')}</dl>`;
}
