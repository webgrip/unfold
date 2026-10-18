import { clock, cx, escape, healthWarning, span, usd } from './parts.js';

/**
 * The questions people ask about a live Work Item, answered from the record. Every answer names its source:
 * `record` for facts Ploeg reported, `estimate` only when the caller passed one. Unfold never writes a guess here.
 * @param {object} model A `liveModel` result.
 * @returns {{ id: string, question: string, answer: string, source: 'record'|'estimate'|'none' }[]}
 */
export function standingAnswers(model) {
  const list = [];
  if (model.running || model.moves.length) {
    const changed = model.edits ? `changed ${model.edits} ${model.edits === 1 ? 'file' : 'files'}` : 'changed no file yet';
    const trouble = model.lastTrouble ? ` ${span(model.lastTrouble.seconds)} went to “${model.lastTrouble.title}” at ${clock(model.lastTrouble.at)}.` : '';
    const warning = healthWarning(model.health);
    const health = warning ? ` ${warning}` : '';
    const made = model.calls.total === null ? (model.transcriptMissing ?? 'Its transcript is not loaded, so Unfold does not count its calls or changed files here.') : `It made ${model.calls.total} tool ${model.calls.total === 1 ? 'call' : 'calls'} and ${changed}.`;
    list.push({ id: 'progress', question: 'Is it getting anywhere?', answer: `${made}${trouble}${health}`, source: 'record' });
  }
  if (model.lost.runs || model.lost.agentFailures) {
    const machine = model.lost.runs ? `${model.lost.runs} ${model.lost.runs === 1 ? 'Run was' : 'Runs were'} ended by the machine, not the agent.` : '';
    const reasons = [...new Set(model.runs.filter(run => run.failure && !run.machine).map(run => run.failure.label))];
    const agent = model.lost.agentFailures ? ` ${model.lost.agentFailures} failed in the agent: ${reasons.join('; ')}.` : '';
    const lostUsd = model.runs.filter(run => run.failure).reduce((sum, run) => sum + (run.costUsd ?? 0), 0);
    list.push({ id: 'failures', question: model.running ? 'Why did the earlier Runs fail?' : 'Why did it fail?', answer: `${machine}${agent} Those Runs cost ${usd(lostUsd)}.`.trim(), source: 'record' });
  }
  const review = model.state === 'awaiting_review'
    ? { answer: 'Now. The pull request is open and waits for you.', source: 'record' }
    : model.state === 'done' ? { answer: 'It is merged; there is nothing left to review.', source: 'record' }
      : model.estimate ? { answer: `${model.estimate.text}. You get a notice when the pull request opens.`, source: 'estimate' }
        : { answer: 'Unfold has no estimate for this Team yet. You get a notice when the pull request opens; nothing is needed before then.', source: 'none' };
  list.push({ id: 'review', question: 'When do I review?', ...review });
  const held = model.spend.heldUsd !== null ? ` Ploeg holds ${usd(model.spend.heldUsd)} for this attempt.` : '';
  list.push({ id: 'cost', question: 'What does it cost?', answer: model.spend.usd === null ? `No Run reported a cost yet.${held}` : `${usd(model.spend.usd)} so far${model.spend.status === 'settled' ? ', settled' : ', settles when the Run ends'}.${held}`, source: 'record' });
  return list;
}

const sources = { record: 'From the record · free', estimate: 'Estimate · free', none: 'No estimate · free' };

/**
 * The standing answers as disclosures that work without script. `list` shows each answer open; `chips` shows the
 * questions as a row and opens the first.
 * @param {object} model
 * @param {{ layout?: 'list'|'chips', open?: string, ask?: boolean }} [options] `ask` adds the paid question box.
 * @returns {string}
 */
export function answers(model, { layout = 'list', open = layout === 'list' ? 'all' : 'failures', ask = true } = {}) {
  const list = standingAnswers(model);
  const first = list.some(entry => entry.id === open) ? open : list[0]?.id;
  const items = list.map(entry => `<details class="lv-answer" data-answer="${entry.id}"${open === 'all' || entry.id === first ? ' open' : ''}><summary class="lv-answer-q">${escape(entry.question)}</summary><p class="lv-answer-a">${escape(entry.answer)}</p><p class="${cx('lv-answer-source', `is-${entry.source}`)}">${escape(sources[entry.source])}</p></details>`).join('');
  const allowance = model.allowance ? `Paid from the Ask Allowance · ${usd(model.allowance.leftUsd)} of ${usd(model.allowance.totalUsd)} left` : 'Paid from the Team’s Ask Allowance';
  const box = ask ? `<form class="lv-ask" action="#"><label class="lv-ask-label" for="lv-ask-${escape(model.id)}">Ask something else</label><div class="lv-ask-row"><input id="lv-ask-${escape(model.id)}" name="question" type="text" autocomplete="off" placeholder="Why this approach?"><button class="button primary" type="submit"><span class="button-label">Ask</span></button></div><p class="lv-ask-note">The agents do not see this. ${escape(allowance)}.</p></form>` : '';
  return `<section class="${cx('lv-answers', `lv-answers-${layout}`)}" aria-label="Questions answered from the record"><h2 class="lv-overline">Answered from the record</h2><div class="lv-answers-items">${items}</div>${box}</section>`;
}
