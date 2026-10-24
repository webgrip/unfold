import { escape } from './core/dom.js';
import { icon } from './core/icons.js';
import * as ui from './core/ui.js';
import { markdown } from './core/markdown.js';
import { verdict as verdictMeta } from './core/states.js';
import { money } from './core/format.js';
import { answerLimit, answeredBy, reviewDisagreements, workItemFindings } from './core/blackboard.js';

/** The longest note a person leaves for the next Run, as Ploeg's note route allows it. */
export const noteLimit = 4096;
const noteStates = new Set(['queued', 'leased', 'active']);
const findingsClip = 1200;

const jump = (id, label) => `<button type="button" class="button ghost xs work-jump" data-action="work-run" data-id="${escape(id)}">${escape(label)}${icon('arrow')}</button>`;
const asker = question => question.role ? `The ${question.role}` : 'An agent';
const clip = (value, max) => { const body = String(value ?? '').trim(); return body.length > max ? `${body.slice(0, max - 1)}…` : body; };

/** Whether a person may leave a note on this Work Item now: Ploeg's note route takes only queued and running work. */
export function canNote(item) {
  return noteStates.has(item?.state);
}

/**
 * The question a stopped Work Item waits on, at the top of its decision box: who asked it and in which Round, the
 * question as the agent wrote it, and, for a person who may restart work, the Answer action. A typed question says
 * it is one; a stuck reason standing in for it says what the agent needs.
 */
export function questionMarkup(question, { canAnswer = false, demo = false, others = [], resume = null } = {}) {
  if (!question) return '';
  const lead = question.typed ? `${asker(question)} asks you${question.round ? ` in Round ${question.round}` : ''}` : `What ${asker(question).toLowerCase()} needs from you${question.round ? ` in Round ${question.round}` : ''}`;
  const answer = canAnswer ? ui.button({ label: others.length ? 'Answer all' : 'Answer', icon: 'send', variant: 'primary', action: 'work-answer-open' }) : '';
  const viewer = canAnswer ? '' : `<p class="meta">${escape('Only a member who may restart work can answer here. You can still answer in the tracker.')}</p>`;
  const continues = resume ? `Ploeg records your answer under your name, then can resume Round ${resume.fromRound} on the same branch: this Round up to ${money(resume.roundCapUsd)}, in total up to ${money(resume.poolUsd)}. Unfold asks you first.` : 'Ploeg records your answer under your name, then restarts the Work Item so its Runs read it. Restarting spends from the Team’s budget, and Unfold asks you first.';
  const reach = canAnswer ? `<p class="meta">${escape(demo ? 'In the demo nothing is stored, nothing restarts and nothing is spent.' : continues)}</p>` : '';
  const more = others.length ? `<p class="overline">${escape(`${others.length === 1 ? 'One more question' : `${others.length} more questions`} from the same Round`)}</p>${others.map(other => `<blockquote class="work-quote work-question-text"><p data-private>${escape(`“${other.text}”`)}</p><footer class="meta">${escape(`${asker(other)}${other.round ? ` · Round ${other.round}` : ''}`)}</footer></blockquote>`).join('')}` : '';
  const show = question.runId ? jump(question.runId, 'Show this Run') : '';
  return `<div class="work-question" data-tone="attention"><p class="overline work-question-lead">${icon('help-circle')}<span>${escape(lead)}</span></p><blockquote class="work-quote work-question-text"><p data-private>${escape(`“${question.text}”`)}</p><footer class="meta">${escape(question.typed ? 'A question the agent raised instead of guessing' : 'The reason the agent gave for stopping')}</footer></blockquote>${more}<div class="work-decision-actions">${answer}${show}</div>${reach}${viewer}</div>`;
}

/** The form field name of the answer to `question`: one per question id, or `answer` for a question without one. */
export function answerField(question) {
  return question.id ? `answer:${question.id}` : 'answer';
}

/**
 * The Answer dialog: every question the Work Item waits on, each with its own answer field, and what sending does and
 * costs in Ploeg's own numbers. When Ploeg offers to resume the Round that asked and these answers are all it waits
 * for, resuming is the main action, worded from `resume` ("this Round: up to …, in total up to …"), and starting over
 * is the secondary one with its own cost line. Without an offer (an older ploegd, or a question without an id) the
 * only action starts the Work Item over.
 */
export function answerDialogMarkup(detail, questions, { demo = false, budget = '', resume = null } = {}) {
  const list = (Array.isArray(questions) ? questions : [questions]).filter(Boolean);
  const several = list.length > 1;
  const fields = list.map((question, index) => {
    const id = `work-answer-text-${index}`;
    const quote = `<blockquote class="work-quote"><p data-private>${escape(`“${clip(question.text, 600)}”`)}</p><footer class="meta">${escape(`${asker(question)}${question.round ? ` · Round ${question.round}` : ''}`)}</footer></blockquote>`;
    return `${quote}<div class="field"><label class="field-label" for="${id}">${escape(several ? `Your answer to question ${index + 1}` : 'Your answer')}</label><textarea id="${id}" name="${escape(answerField(question))}" rows="4" maxlength="${answerLimit}" required aria-describedby="work-answer-hint"></textarea><p class="field-error" data-error-for="${escape(answerField(question))}" hidden></p></div>`;
  }).join('');
  const hint = `<p class="field-hint" id="work-answer-hint">${escape(`Say what the agent should do, as you would to a colleague. At most ${answerLimit} characters${several ? ' each. Ploeg resumes only once every question has an answer' : ''}.`)}</p>`;
  const ids = list.map(question => question.id).filter(Boolean);
  const canResume = Boolean(resume) && ids.length === list.length && resume.readyAfter(ids);
  const restartCost = `It spends from the Team’s budget${budget ? `, up to ${budget} like the last attempt` : ''}.`;
  const stored = ids.length ? 'Ploeg stores your answer with the question and records you as its author.' : 'Ploeg records you as the author.';
  let effect;
  let actions;
  if (demo) {
    effect = ui.callout({ tone: 'neutral', title: 'Not available in the demo', body: `<p>${escape('Nothing runs here, so nothing is stored or restarted. In a live workbench this sends your answer to Ploeg and continues the Work Item.')}</p>` });
    actions = ui.button({ label: 'Answer (demo)', variant: 'primary', type: 'submit', disabled: true });
  } else if (canResume) {
    effect = ui.callout({ tone: 'attention', title: `Resume Round ${resume.fromRound}`, body: `<p>${escape(`${stored} Ploeg then reopens Round ${resume.fromRound} on the same branch and keeps the Rounds before it. This Round: up to ${money(resume.roundCapUsd)}, in total up to ${money(resume.poolUsd)}.`)}</p><p class="meta">${escape(`Or start over: a new attempt from the start of the plan. ${restartCost}`)}</p>` });
    actions = `${ui.button({ label: 'Answer and start over', type: 'submit', value: 'restart' })}${ui.button({ label: `Answer and resume Round ${resume.fromRound}`, variant: 'primary', type: 'submit', value: 'resume' })}`;
  } else {
    effect = ui.callout({ tone: 'attention', title: 'This restarts the Work Item', body: `<p>${escape(`${ids.length ? 'Ploeg stores your answer with the question, then' : 'Ploeg'} opens a new attempt whose Runs read the question and your answer. Ploeg says which Round it starts from. ${restartCost} Ploeg records you as the author.`)}</p>` });
    actions = ui.button({ label: 'Answer and restart', variant: 'primary', type: 'submit', value: 'restart' });
  }
  return `<form data-form="work-answer" data-id="${escape(detail.item.id)}" class="work-answer-dialog" novalidate><header class="dialog-header"><h2 id="confirm-title">${escape(several ? `Answer the agent’s ${list.length} questions` : 'Answer the agent')}</h2>${ui.iconButton({ icon: 'x', label: 'Close', action: 'close-dialog' })}</header><div class="dialog-body">${fields}${hint}${effect}</div><footer class="dialog-footer">${ui.button({ label: 'Cancel', action: 'close-dialog' })}${actions}</footer></form>`;
}

/** The Leave a note action for queued or running work, or '' when the person may not write or Ploeg would refuse. */
export function noteAction(item, { canWrite = false } = {}) {
  if (!canWrite || !canNote(item)) return '';
  return `<div class="work-decision-part work-note-action"><p>${escape('Know something the next Run should? Leave it a note. The Run working now does not see it.')}</p><div class="work-decision-actions">${ui.button({ label: 'Leave a note', icon: 'send', variant: 'secondary', action: 'work-note-open' })}</div></div>`;
}

/** The Leave a note dialog. A note costs nothing by itself and reaches exactly one later Run. */
export function noteDialogMarkup(detail, { demo = false } = {}) {
  const field = `<div class="field"><label class="field-label" for="work-note-text">Note</label><textarea id="work-note-text" name="text" rows="5" maxlength="${noteLimit}" required aria-describedby="work-note-hint"></textarea><p class="field-hint" id="work-note-hint">${escape(`A decision, a fact or a correction. At most ${noteLimit} characters.`)}</p><p class="field-error" data-error-for="text" hidden></p></div>`;
  const effect = `<p>${escape(demo ? 'The demo stores no notes; Unfold says so when you send one.' : 'Ploeg briefs the next Run of this Work Item with it and records you as the author. The running Run does not see it, and the note costs nothing by itself.')}</p>`;
  return `<form data-form="work-note" data-id="${escape(detail.item.id)}" class="work-note-dialog" novalidate><header class="dialog-header"><h2 id="confirm-title">${escape('Leave a note for the next Run')}</h2>${ui.iconButton({ icon: 'x', label: 'Close', action: 'close-dialog' })}</header><div class="dialog-body">${effect}${field}</div><footer class="dialog-footer">${ui.button({ label: 'Cancel', action: 'close-dialog' })}${ui.button({ label: 'Leave note', variant: 'primary', type: 'submit' })}</footer></form>`;
}

function side(runs, { shadow }) {
  const [latest] = runs;
  const meta = verdictMeta(latest.verdict);
  const findings = String(latest.findings ?? '').trim();
  const who = `${shadow ? 'shadow · recorded, never acts' : 'acts'}${runs.length > 1 ? ` · ${runs.length} Runs` : ''}`;
  const fold = findings ? `<details class="work-disagree-fold"><summary>${escape('Findings')}</summary><div data-private class="prose work-disagree-findings">${markdown(clip(findings, findingsClip), { baseLevel: 5 })}</div></details>` : '';
  const link = latest.id ? jump(latest.id, runs.length > 1 ? 'Show the latest' : 'Show this Run') : '';
  return `<li class="work-disagree-side"${shadow ? ' data-shadow' : ''}><p class="work-disagree-who"><strong>${escape(latest.role || 'Reviewer')}</strong> <span class="meta">${escape(who)}</span></p>${ui.badge({ tone: meta.tone, glyph: meta.glyph, label: meta.short || meta.label, size: 'sm' })}${link}${fold}</li>`;
}

function sameVerdictWithoutFindings(runs) {
  const groups = new Map();
  const kept = [];
  for (const run of runs) {
    if (String(run.findings ?? '').trim()) { kept.push([run]); continue; }
    const key = `${run.role || ''}:${run.verdict || ''}`;
    if (!groups.has(key)) { groups.set(key, []); kept.push(groups.get(key)); }
    groups.get(key).push(run);
  }
  return kept;
}

/**
 * The Reviewers disagree card: per Round where a shadow reviewer's verdict differs from the acting reviewers', one
 * row per side with its verdict and its findings folded. Acting Runs with the same verdict and no findings, such as
 * reviewers that infrastructure stopped before they could judge, share one row. Ploeg followed the acting side; the
 * card says so. '' without a disagreement.
 */
export function disagreementsMarkup(detail) {
  const rounds = reviewDisagreements(detail?.runs, detail?.reviewDisagreements);
  if (!rounds.length) return '';
  const current = detail.shifts?.[0]?.id ?? detail.item?.latestShift?.id ?? null;
  const entries = rounds.slice(0, 3).map(entry => {
    const acting = verdictMeta(entry.acting);
    const label = `${current && entry.shiftId && String(entry.shiftId) !== String(current) ? 'Earlier attempt · ' : ''}Round ${entry.round}`;
    const reviewers = entry.reviewers.length ? entry.reviewers : [{ id: '', role: 'Acting reviewers', verdict: entry.acting, findings: '' }];
    const sides = [...sameVerdictWithoutFindings(reviewers).map(runs => side(runs, { shadow: false })), ...entry.shadows.map(run => side([run], { shadow: true }))].join('');
    return `<li class="work-disagree"><p class="meta work-disagree-round">${escape(label)}</p><ul class="work-disagree-sides">${sides}</ul><p class="meta">${escape(`Ploeg followed the acting reviewer: ${(acting.short || acting.label).toLowerCase()}. A shadow reviewer only records what it would have said.`)}</p></li>`;
  }).join('');
  const more = rounds.length > 3 ? `<p class="meta">${escape(`${rounds.length - 3} earlier ${rounds.length - 3 === 1 ? 'Round disagrees' : 'Rounds disagree'} too; see the Runs.`)}</p>` : '';
  const onlyShadow = rounds[0].acting === 'none';
  const lead = onlyShadow ? 'The acting reviewer reached no verdict; a second reviewer model did.' : 'A second reviewer model read the same pull request and came to another verdict. Read both before you trust either.';
  const body = `<p class="meta">${escape(lead)}</p><ul class="work-disagree-list">${entries}</ul>${more}`;
  return ui.card({ id: 'work-disagreements', region: true, title: onlyShadow ? 'Only the shadow reviewer has a verdict' : 'Reviewers disagree', icon: 'eye', tone: 'attention', level: 3, body });
}

function findingLine(entry) {
  const tone = entry.answer ? entry.answer.meta.tone : entry.unanswered ? 'danger' : 'neutral';
  const glyph = entry.answer ? entry.answer.meta.glyph : entry.unanswered ? 'x-circle' : 'circle-dashed';
  const status = entry.answer ? `${entry.answer.meta.label}${entry.answer.role ? ` · ${entry.answer.role}${entry.answer.round ? `, Round ${entry.answer.round}` : ''}` : ''}` : entry.unanswered ? 'Not answered' : entry.shadow ? 'Recorded only' : 'Waiting for the writer';
  const facts = [entry.severity?.label, entry.place, `${entry.role || 'reviewer'}${entry.lastRaisedRound ? `, Round ${entry.lastRaisedRound}` : ''}`].filter(Boolean).join(' · ');
  const reason = entry.answer?.reason ? `<p data-private>${escape(entry.answer.reason)}</p>` : '';
  return `<li class="work-check" data-tone="${tone}"><span class="work-check-icon" aria-hidden="true">${icon(glyph)}</span><div class="work-check-main"><p class="work-check-title" data-private>${escape(clip(entry.title, 300))}</p><p class="meta">${escape(`${status} · ${facts}`)}</p>${reason}</div></li>`;
}

/**
 * The Findings card: every finding a reviewer raised by id with the writer's answer, findings left unanswered first.
 * A shadow reviewer's findings sit in a closed fold, because Ploeg never briefs or answers them. '' when Ploeg sent
 * no findings, which is every ploegd before ADR-0121.
 */
export function findingsMarkup(detail) {
  const all = workItemFindings(detail);
  if (!all.length) return '';
  const acting = all.filter(entry => !entry.shadow);
  const order = entry => entry.unanswered ? 0 : !entry.answer ? 1 : entry.answer.status === 'disagree' ? 2 : 3;
  const sorted = [...acting].sort((a, b) => order(a) - order(b));
  const missing = acting.filter(entry => entry.unanswered).length;
  const lead = missing ? `<p>${escape(`${missing} ${missing === 1 ? 'finding was' : 'findings were'} not answered by the writer that came after it.`)}</p>` : '';
  const list = sorted.length ? `<ul class="work-checklist">${sorted.map(findingLine).join('')}</ul>` : `<p class="meta">${escape('Only the shadow reviewer raised findings.')}</p>`;
  const shadows = all.filter(entry => entry.shadow);
  const fold = shadows.length ? ui.disclosure({ summary: `Shadow reviewer findings (${shadows.length}, recorded, never briefed)`, plain: true, id: `work-findings-shadow-${detail.item.id}`, body: `<ul class="work-checklist">${shadows.map(findingLine).join('')}</ul>` }) : '';
  return ui.card({ id: 'work-findings', region: true, title: 'Reviewer findings', icon: 'list', tone: missing ? 'attention' : undefined, level: 3, body: `${lead}${list}${fold}` });
}

/** A writing Run's answers to the findings it was handed, for its Run body. '' when Ploeg reported none. */
export function findingAnswersMarkup(run, detail) {
  const answers = answeredBy(detail, run);
  if (!answers.length) return '';
  return `<div class="work-finding-answers"><h4 class="overline">${escape('Answers to the reviewer’s findings')}</h4><ul class="work-checklist">${answers.map(findingLine).join('')}</ul></div>`;
}
