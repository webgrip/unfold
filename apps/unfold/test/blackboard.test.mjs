import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answerNote, answeredBy, detailQuestions, disagreementSummary, resumeOffer, reviewDisagreements, waitingQuestion, waitingQuestions, workItemFindings, writeError } from '../public/core/blackboard.js';
import { detailReason, listReason } from '../public/core/reasons.js';
import { closeReasonLabel } from '../public/core/states.js';
import { detailMarkup, ploegReview } from '../public/ploeg.js';
import { answerDialogMarkup, disagreementsMarkup, findingsMarkup, noteAction, noteDialogMarkup } from '../public/blackboard-view.js';
import { nowMarkup } from '../public/now.js';
import { ploegDemo } from '../src/ploeg-demo.ts';
import { detail as parseDetail } from '../src/ploeg.ts';

const at = '2026-10-18T10:00:00Z';
const demoDetail = id => ({ ...structuredClone(ploegDemo.details[id]), demo: true, fetchedAt: at });
const model = (extra = {}) => ({ lane: 'needs_human', team: '', loading: false, refreshing: false, loadingMore: false, detailId: null, detail: null, detailError: null, listHref: '#work', canCancel: true, cancelBusy: false, cancelResult: null, briefOpen: false, sessions: [], userId: 'u1', now: Date.parse(at), ...extra });
const reader = (id, verdict, extra = {}) => ({ id, workItemId: '50', shiftId: '7', team: 'delivery', role: 'reviewer', round: 2, writes: false, state: 'finished', verdict, findings: `Findings of ${id}`, ...extra });
const question = (extra = {}) => ({ id: 'q43-1', shiftId: '15', runId: '43', role: 'implementer', round: 3, to: 'person', text: 'Must the API answer 422 or is 400 fine?', answer: null, answeredBy: null, waitingForPerson: true, ...extra });
function asking(extra = {}) {
  const detail = demoDetail('109');
  detail.shifts[0].closeReason = 'question_for_person';
  detail.questions = [question({ id: 'q41-1', runId: '41', round: 1, waitingForPerson: false, answer: 'Yes', answeredBy: 'person' }), question(extra)];
  return detail;
}

test('a question_for_person Shift reads “Question for you”, and the waiting question is the one Ploeg marks', () => {
  const detail = asking();
  const reason = detailReason(detail);
  assert.equal(reason.code, 'person_question');
  assert.equal(reason.chip, 'Question for you');
  assert.equal(reason.requeue, '', 'answering restarts the work, so no tracker step is added');
  assert.equal(listReason({ state: 'needs_human', latestShift: { closeReason: 'question_for_person', closedAt: at } }).chip, 'Question for you');
  assert.equal(closeReasonLabel('question_for_person'), 'An agent asked a person a question');
  assert.deepEqual({ ...waitingQuestion(detail, reason), at: null }, { id: 'q43-1', text: 'Must the API answer 422 or is 400 fine?', typed: true, runId: '43', role: 'implementer', round: 3, at: null });
  const none = asking({ waitingForPerson: false, answer: 'Use 422', answeredBy: 'person' });
  assert.notEqual(waitingQuestion(none, detailReason(none))?.id, 'q43-1', 'an answered question no longer waits');
  const toReviewer = asking({ to: 'reviewer' });
  assert.notEqual(waitingQuestion(toReviewer, detailReason(toReviewer))?.id, 'q43-1', 'a question to the reviewer is answered inside the Shift');
  assert.equal(waitingQuestion({ ...detail, item: { ...detail.item, state: 'queued' } }, reason), null, 'only a needs_human item waits on a question');
});

test('without Ploeg’s questions list the close message, and on an older ploegd the stuck reason, stand in for the question', () => {
  const message = demoDetail('109');
  message.shifts[0].closeReason = 'question_for_person';
  message.events.unshift({ id: '9999', at, actor: 'ploegd', action: 'work_item.needs_human', workItemId: '109', team: message.item.team, detail: { reason: 'The implementer asks: must the API answer 422?' } });
  const fromMessage = waitingQuestion(message, detailReason(message));
  assert.equal(fromMessage.id, '', 'no id, so the answer travels as a restart note');
  assert.equal(fromMessage.typed, true);
  assert.match(fromMessage.text, /must the API answer 422/);
  const stuck = demoDetail('111');
  const fallback = waitingQuestion(stuck, detailReason(stuck));
  assert.deepEqual([fallback.id, fallback.typed, fallback.runId, fallback.role], ['', false, '28', 'builder']);
  assert.match(fallback.text, /stops at 2023/);
  assert.equal(waitingQuestion(demoDetail('109'), detailReason(demoDetail('109'))), null, 'a reviewer that ran out of fix Rounds asks nothing');
});

test('questions, findings and disagreements are read defensively: absent lists and unreadable entries show nothing', () => {
  assert.deepEqual(detailQuestions({}), []);
  assert.deepEqual(detailQuestions({ questions: [question({ to: 'boss' }), question({ text: '' }), question({ id: '' }), 'junk', question()] }).map(entry => entry.id), ['q43-1']);
  assert.deepEqual(workItemFindings({}), []);
  assert.deepEqual(workItemFindings({ findings: [{ id: 'f1-1', title: '' }, { id: 'f1-2', title: 'Kept', answer: { status: 'ignored' }, unanswered: true }] }).map(entry => [entry.id, entry.answer, entry.unanswered]), [['f1-2', null, true]]);
  assert.equal(findingsMarkup({ item: { id: '1' } }), '');
});

test('an answer without a question id becomes one restart note that quotes the question and fits Ploeg’s note limit', () => {
  const note = answerNote({ text: 'q'.repeat(5000), role: 'builder', round: 2 }, `  ${'a'.repeat(2000)}  `);
  assert(note.length <= 4096, `${note.length}`);
  assert.match(note, /^A person answered the question the builder asked in Round 2\.\n\nQuestion: “q+…”\n\nAnswer: a{2000}$/);
  assert.equal(writeError('  ', 2000, 'Type your answer.'), 'Type your answer.');
  assert.equal(writeError('x'.repeat(2001), 2000, ''), 'Keep it to at most 2000 characters.');
  assert.equal(writeError('fine', 2000, ''), '');
});

test('Ploeg’s reviewDisagreements win; an older ploegd’s Runs are compared as the review loop combines verdicts', () => {
  const runs = [reader('1', 'approve'), reader('2', 'approve', { shadow: true, role: 'second' })];
  assert.deepEqual(reviewDisagreements(runs), [], 'the shadow agrees');
  const [reported] = reviewDisagreements(runs, [{ shiftId: '7', round: 2, shadowRunId: '2', shadowRole: 'second', primaryVerdict: 'approve', shadowVerdict: 'none' }]);
  assert.deepEqual([reported.acting, reported.shadows[0].verdict, reported.shadows[0].role, reported.reviewers.map(run => run.id)], ['approve', 'none', 'second', ['1']], 'Ploeg compared what the Runs alone would not show');
  assert.deepEqual(reviewDisagreements(runs, [{ shiftId: '7', round: 2, shadowRunId: '2', primaryVerdict: 'approve', shadowVerdict: 'approve' }, { shiftId: 'x' }]), [], 'equal or unreadable entries are dropped');
  assert.deepEqual(reviewDisagreements(runs, []), [], 'an empty list from Ploeg means no disagreement, even if the Runs differ');
  const [found] = reviewDisagreements([reader('1', 'approve'), reader('3', 'request_changes', { role: 'security' }), reader('2', 'approve', { shadow: true })]);
  assert.equal(found.acting, 'request_changes', 'any acting request_changes wins');
  assert.deepEqual(reviewDisagreements([reader('1', 'approve'), reader('2', '', { shadow: true }), reader('4', 'request_changes', { shadow: true, state: 'running' })]), [], 'only finished Runs with a verdict count');
  assert.deepEqual(disagreementSummary(ploegDemo.details['109'].runs, ploegDemo.details['109'].reviewDisagreements), { round: 4, acting: 'request_changes', shadow: 'approve' });
  assert.deepEqual(disagreementSummary(ploegDemo.details['109'].runs), { round: 4, acting: 'request_changes', shadow: 'approve' }, 'the same from the Runs alone');
});

test('a shadow reviewer never gives the Work Item’s verdict, findings or last reader', () => {
  const runs = [reader('14', 'request_changes', { shadow: true, findings: 'Shadow worry' }), reader('13', 'approve'), { ...reader('12', ''), role: 'builder', writes: true, round: 1, outcome: 'pr_opened', links: [] }];
  const detail = { item: { id: '50', team: 'delivery', state: 'awaiting_review', latestShift: { id: '7' } }, shifts: [{ id: '7', round: 2 }], runs, checkpoints: [], events: [], truncated: {} };
  const review = ploegReview(detail);
  assert.equal(review.verdict, 'approve');
  assert.equal(review.lastReader.id, '13');
  assert.deepEqual(review.findings.map(finding => finding.runId), ['13']);
  assert.equal(review.runs.find(run => run.id === '14').shadow, true);
});

test('acting reviewers stopped before a verdict share one row, and the shadow’s findings stay folded', () => {
  const stopped = ['21', '22', '23'].map(id => reader(id, 'none', { findings: '' }));
  const runs = [...stopped, reader('24', 'approve', { shadow: true, role: 'shadow-reviewer', findings: 'Looks right' })];
  const detail = { item: { id: '50', latestShift: { id: '7' } }, shifts: [{ id: '7' }], runs, reviewDisagreements: [{ shiftId: '7', round: 2, shadowRunId: '24', primaryVerdict: 'none', shadowVerdict: 'approve' }] };
  const html = disagreementsMarkup(detail);
  assert.match(html, /Only the shadow reviewer has a verdict/);
  assert.equal(html.match(/class="work-disagree-side">/g).length, 1, 'three verdictless acting Runs read as one row');
  assert.match(html, /acts · 3 Runs[^]*No verdict[^]*data-id="23"[^]*Show the latest/);
  assert.match(html, /data-shadow[^]*Agent approved[^]*<details class="work-disagree-fold"><summary>Findings<\/summary>[^]*Looks right/);
});

test('the Findings card lists acting findings with answers, flags unanswered ones first, and folds shadow findings away', () => {
  const detail = demoDetail('109');
  detail.findings[2].unanswered = true;
  const html = findingsMarkup(detail);
  assert.match(html, /id="work-findings"[^]*1 finding was not answered[^]*The API answers 400, but the task asks for 422\.<\/p><p class="meta">Not answered · Blocking · reviewer, Round 4[^]*A quantity of 0 is still accepted\.<\/p><p class="meta">Fixed · implementer, Round 3 · Blocking · src\/cart\/quantity\.ts:14/);
  assert.match(html, /Shadow reviewer findings \(1, recorded, never briefed\)[^]*Recorded only/);
  assert.deepEqual(answeredBy(detail, { id: '43' }).map(entry => entry.id), ['f42-1', 'f42-2']);
});

test('the Work Item page shows the question with an Answer action, both verdicts and the findings', () => {
  const stuck = detailMarkup(demoDetail('111'), model({ detailId: '111', canWrite: true }));
  assert.match(stuck, /What the builder needs from you in Round 2[^]*every source in the repository stops at 2023[^]*data-action="work-answer-open"/);
  assert.match(stuck, /<div class="work-sticky-actions" role="group" aria-label="Next step"><button[^>]*data-action="work-answer-open"/, 'answering is the primary next step');
  const viewer = detailMarkup(demoDetail('111'), model({ detailId: '111' }));
  assert.doesNotMatch(viewer, /data-action="work-answer-open"/, 'a viewer cannot restart work');
  assert.match(viewer, /Only a member who may restart work can answer here/);
  const typed = detailMarkup(asking(), model({ detailId: '109', canWrite: true }));
  assert.match(typed, /The implementer asks you in Round 3[^]*Must the API answer 422 or is 400 fine\?/);
  const split = detailMarkup(demoDetail('109'), model({ detailId: '109', canWrite: true }));
  assert.match(split, /id="work-disagreements"[^]*Reviewers disagree[^]*<strong>reviewer<\/strong> <span class="meta">acts<\/span>[^]*Agent asked for changes[^]*data-shadow[^]*<strong>second-reviewer<\/strong>[^]*Agent approved[^]*Ploeg followed the acting reviewer: agent asked for changes\./);
  assert.match(split, /id="work-findings"/);
  assert.match(split, /Answers to the reviewer’s findings/, 'the writer’s Run lists what it answered');
  assert.match(split, /shadow reader/);
  assert.doesNotMatch(detailMarkup(demoDetail('111'), model({ detailId: '111' })), /id="work-disagreements"|id="work-findings"/);
});

test('the answer and note dialogs say what they do and cost, from what Ploeg reports, and the note action shows only for queued and running work', () => {
  const detail = asking();
  const typed = waitingQuestion(detail, detailReason(detail));
  const live = answerDialogMarkup({ ...detail, demo: false }, [typed], { budget: 'US$ 3.00' });
  assert.match(live, /data-form="work-answer"[^]*Ploeg stores your answer with the question, then opens a new attempt[^]*Ploeg says which Round it starts from[^]*up to US\$ 3\.00 like the last attempt[^]*Answer and restart/);
  assert.doesNotMatch(live, /Round 1/, 'the dialog does not promise where the restart begins');
  const stuck = demoDetail('111');
  assert.match(answerDialogMarkup({ ...stuck, demo: false }, waitingQuestion(stuck, detailReason(stuck))), /Ploeg opens a new attempt/);
  assert.match(answerDialogMarkup(detail, [typed], { demo: true }), /Not available in the demo[^]*disabled/);
  assert.match(noteDialogMarkup(detail), /data-form="work-note"[^]*The running Run does not see it/);
  assert.equal(noteAction({ state: 'needs_human' }, { canWrite: true }), '');
  assert.equal(noteAction({ state: 'queued' }, { canWrite: false }), '');
  for (const state of ['queued', 'leased', 'active']) assert.match(noteAction({ state }, { canWrite: true }), /data-action="work-note-open"/);
});

test('Now shows the question a row waits on with an Answer link, and a Reviewers disagree chip', () => {
  const row = { id: '111', team: 'research', state: 'needs_human', title: 'Size the market', url: '', createdAt: at, updatedAt: at, provider: 'demo', externalId: 'DEMO-11', target: null, closeReason: 'question_for_person', latestShift: { round: 2, closeReason: 'question_for_person', budgetUsd: 3, spentUsd: 0, reservedUsd: 0, closedAt: at }, spentUsd: 0, pullRequestUrl: '', question: { id: 'q28-1', text: 'Are 2023 figures acceptable?', typed: true, role: 'builder', round: 2, runId: '28' }, disagreement: { round: 4, acting: 'request_changes', shadow: 'approve' } };
  const data = { demo: false, teams: ['research'], fetchedAt: at, errors: {}, waiting: [row], active: [], running: [], recent: [], runningTruncated: false, recentTruncated: false, truncatedStates: [] };
  const html = nowMarkup({ data, error: null, since: at, summary: { data: null, error: null } }, { grafanaUrl: '', singleKeys: true });
  assert.match(html, /Question for you/);
  assert.match(html, /now-question[^]*“Are 2023 figures acceptable\?”/);
  assert.match(html, /href="#work\/111" id="now-answer-111"/);
  assert.match(html, /Round 4: agent asked for changes by the acting reviewer, agent approved by the shadow reviewer/);
});

test('Unfold’s Ploeg client keeps shadow and stream A’s detail lists, and drops what it cannot read', () => {
  const base = demoDetail('109');
  const raw = {
    schemaVersion: '1.0', item: base.item, shifts: base.shifts, checkpoints: base.checkpoints, events: base.events, truncated: base.truncated,
    runs: base.runs.map(run => run.id === '44' ? { ...run, shadow: 'yes' } : run),
    findings: [{ id: 'f42-1', shiftId: '15', runId: '42', role: 'reviewer', round: 2, lastRaisedRound: 2, shadow: false, severity: 'loud', title: 'Zero accepted', answer: { status: 'fixed', runId: '43', role: 'implementer', round: 3 }, unanswered: false }, { id: 'f42-2', runId: '42', round: 2, title: 'x', answer: { status: 'nope', runId: '43' }, unanswered: true }, { id: 'bad' }],
    questions: [{ id: 'q43-1', shiftId: '15', runId: '43', role: 'implementer', round: 3, to: 'person', text: 'Which status?', answer: null, answeredBy: null, waitingForPerson: true }, { id: 'q43-2', runId: '43', to: 'everyone', text: 'x' }],
    reviewDisagreements: [{ shiftId: '15', round: 4, shadowRunId: '55', shadowRole: 'second-reviewer', primaryVerdict: 'request_changes', shadowVerdict: 'approve' }, { shiftId: '15', round: 4, shadowRunId: '55', primaryVerdict: 'maybe', shadowVerdict: 'approve' }],
  };
  const parsed = parseDetail(raw);
  assert.deepEqual(parsed.findings.map(entry => [entry.id, entry.severity, entry.answer?.status ?? null, entry.unanswered]), [['f42-1', undefined, 'fixed', false], ['f42-2', undefined, null, true]]);
  assert.deepEqual(parsed.questions.map(entry => [entry.id, entry.waitingForPerson]), [['q43-1', true]]);
  assert.deepEqual(parsed.reviewDisagreements.map(entry => entry.shadowRunId), ['55']);
  assert.equal('shadow' in parsed.runs.find(run => run.id === '44'), false, 'only a literal true marks a shadow');
  assert.equal(parsed.runs.find(run => run.id === '55').shadow, true);
  const older = parseDetail({ schemaVersion: '1.0', item: base.item, shifts: base.shifts, runs: base.runs, checkpoints: base.checkpoints, events: base.events, truncated: base.truncated });
  assert.equal('findings' in older || 'questions' in older || 'reviewDisagreements' in older, false, 'an older ploegd’s detail carries none of the lists');
});

test('when Ploeg offers to resume, answering every question of the Round resumes it, worded from Ploeg’s numbers', () => {
  const detail = asking();
  detail.questions.push(question({ id: 'q43-2', text: 'And for a quantity of zero?' }));
  detail.resume = { shiftId: '15', askedRound: 3, fromRound: 3, roundCapUsd: 0.4, poolUsd: 2.25, ready: false, waitingQuestionIds: ['q43-1', 'q43-2'] };
  const offer = resumeOffer(detail);
  assert.equal(offer.readyAfter(['q43-1']), false, 'one question of the Round still waits');
  assert.equal(offer.readyAfter(['q43-1', 'q43-2']), true);
  assert.equal(resumeOffer({ resume: null }), null);
  assert.equal(resumeOffer({ resume: { fromRound: 0 } }), null);
  const questions = waitingQuestions(detail);
  assert.deepEqual(questions.map(entry => entry.id), ['q43-1', 'q43-2']);
  const html = answerDialogMarkup({ ...detail, demo: false }, questions, { budget: 'US$ 3,00', resume: offer });
  assert.match(html, /Answer the agent’s 2 questions/);
  assert.match(html, /name="answer:q43-1"[^]*name="answer:q43-2"/);
  assert.match(html, /Resume Round 3[^]*This Round: up to US\$\s0,40, in total up to US\$\s2,25\./);
  assert.match(html, /Or start over: a new attempt from the start of the plan\. It spends from the Team’s budget, up to US\$ 3,00 like the last attempt\./);
  assert.match(html, /value="restart"[^]*Answer and start over[^]*value="resume"[^]*Answer and resume Round 3/, 'resuming is the main action, starting over the secondary one');
  const partial = answerDialogMarkup({ ...detail, demo: false }, questions.slice(0, 1), { resume: offer });
  assert.doesNotMatch(partial, /value="resume"/, 'no resume while another question of the Round would still wait');
  const older = answerDialogMarkup({ ...detail, demo: false }, questions, { budget: 'US$ 3,00' });
  assert.doesNotMatch(older, /value="resume"|Resume Round/, 'an older ploegd offers no resume');
  const page = detailMarkup({ ...detail, demo: false }, model({ detailId: '109', canWrite: true }));
  assert.match(page, /One more question from the same Round[^]*Answer all/);
  assert.match(page, /can resume Round 3 on the same branch: this Round up to US\$\s0,40, in total up to US\$\s2,25/);
});
