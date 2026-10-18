/**
 * Who a Run's question is for, as Ploeg ADR-0121 names the recipient, and how a screen says it. Only `person` parks
 * the Work Item for a person; the other two are answered inside the Shift.
 */
export const questionRecipients = Object.freeze({
  person: Object.freeze({ label: 'For a person', short: 'you' }),
  reviewer: Object.freeze({ label: 'For the reviewer', short: 'the reviewer' }),
  next_run: Object.freeze({ label: 'For the next Run', short: 'the next Run' }),
});

/** How a writer answered one reviewer finding (Ploeg ADR-0121, `answer.status`), and how a screen says it. */
export const findingAnswerKinds = Object.freeze({
  fixed: Object.freeze({ label: 'Fixed', tone: 'success', glyph: 'check-circle' }),
  disagree: Object.freeze({ label: 'Disagrees', tone: 'attention', glyph: 'alert' }),
  out_of_scope: Object.freeze({ label: 'Out of scope', tone: 'neutral', glyph: 'circle-slash' }),
  deferred: Object.freeze({ label: 'Deferred', tone: 'neutral', glyph: 'clock' }),
});

/** How serious a reviewer says a finding is (Ploeg ADR-0121, `severity`), and how a screen says it. */
export const findingSeverities = Object.freeze({
  blocking: Object.freeze({ label: 'Blocking', tone: 'danger' }),
  should_fix: Object.freeze({ label: 'Should fix', tone: 'attention' }),
  nit: Object.freeze({ label: 'Nit', tone: 'neutral' }),
});

/** The longest answer a person can give. With the quoted question it also fits Ploeg's 4096-character note. */
export const answerLimit = 2000;
const questionQuoteLimit = 1600;

const text = (value, max) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : '';
const newestFirst = (a, b) => { try { const x = BigInt(a.id), y = BigInt(b.id); return x < y ? 1 : x > y ? -1 : 0; } catch { return 0; } };
const verdicts = new Set(['approve', 'request_changes']);
const listed = value => Array.isArray(value) ? value : null;
const whole = value => Number.isInteger(value) && value >= 0 ? value : null;

/**
 * The questions of a Work Item detail (Ploeg ADR-0121 `questions`), oldest first, each with a known recipient and
 * text. An older ploegd sends none, and an entry Unfold cannot read is left out.
 * @returns {{ id: string, runId: string, shiftId: string | null, role: string, round: number | null, to: string, text: string, answer: string | null, answeredBy: string | null, waitingForPerson: boolean }[]}
 */
export function detailQuestions(detail) {
  return (listed(detail?.questions) || []).map(entry => ({
    id: text(entry?.id, 128), runId: text(entry?.runId, 32), shiftId: text(entry?.shiftId, 32) || null, role: text(entry?.role, 100), round: whole(entry?.round),
    to: typeof entry?.to === 'string' && Object.hasOwn(questionRecipients, entry.to) ? entry.to : '', text: text(entry?.text, 4096),
    answer: text(entry?.answer, 4096) || null, answeredBy: text(entry?.answeredBy, 256) || null, waitingForPerson: entry?.waitingForPerson === true,
  })).filter(entry => entry.id && entry.to && entry.text);
}

/**
 * The question a stopped Work Item waits on a person for, or null. In order: the newest question to a person that
 * Ploeg marks `waitingForPerson` (it has an `id` to answer); the close message of a `question_for_person` Shift when
 * the detail lists no questions; and, for an older ploegd, the stuck reason of the Run that stopped the item, because
 * there an agent that needs a person says so. Only a `needs_human` Work Item waits on a question. `reason` is the
 * detail's `detailReason`.
 * @param {object | null | undefined} detail
 * @param {{ code?: string, headline?: string | null, run?: { id: string, role?: string, round?: number | null, text?: string } | null } | null} reason
 * @returns {{ id: string, text: string, typed: boolean, runId: string, role: string, round: number | null, at: string | null } | null}
 */
export function waitingQuestion(detail, reason) {
  const item = detail?.item;
  if (item?.state !== 'needs_human') return null;
  const runs = detail.runs || [];
  const when = runId => { const run = runs.find(entry => String(entry.id) === String(runId)); return run?.finishedAt || run?.startedAt || null; };
  const waiting = detailQuestions(detail).filter(entry => entry.to === 'person' && entry.waitingForPerson).at(-1);
  if (waiting) return { id: waiting.id, text: waiting.text, typed: true, runId: waiting.runId, role: waiting.role, round: waiting.round, at: when(waiting.runId) };
  if (reason?.code === 'person_question') {
    const headline = text(reason.headline, 4096);
    return headline ? { id: '', text: headline, typed: true, runId: '', role: '', round: null, at: null } : null;
  }
  if (reason?.code !== 'run_stuck' || !reason.run?.text) return null;
  return { id: '', text: reason.run.text, typed: false, runId: String(reason.run.id), role: reason.run.role || '', round: Number.isInteger(reason.run.round) ? reason.run.round : null, at: when(reason.run.id) };
}

/**
 * The note Unfold sends with a restart when the question has no id Ploeg can store an answer under: the question
 * quoted, then the answer. Ploeg records the person who sends it as its author, so the text does not name them.
 * @param {{ text: string, role?: string, round?: number | null }} question
 * @param {string} answer
 * @returns {string}
 */
export function answerNote(question, answer) {
  const asked = String(question.text).length > questionQuoteLimit ? `${String(question.text).slice(0, questionQuoteLimit - 1)}…` : String(question.text);
  const who = question.role ? `the ${question.role}` : 'an agent';
  return `A person answered the question ${who} asked${question.round ? ` in Round ${question.round}` : ''}.\n\nQuestion: “${asked}”\n\nAnswer: ${String(answer).trim()}`;
}

/**
 * Checks an answer or a note before it is sent: required, and at most `limit` characters.
 * @returns {string} the problem, or '' when it can be sent
 */
export function writeError(value, limit, empty) {
  const body = String(value ?? '').trim();
  if (!body) return empty;
  if (body.length > limit) return `Keep it to at most ${limit} characters.`;
  return '';
}

const combined = readers => readers.some(run => run.verdict === 'request_changes') ? 'request_changes' : readers.some(run => run.verdict === 'approve') ? 'approve' : 'none';
const verdictOf = value => ['approve', 'request_changes', 'none'].includes(value) ? value : null;

function computed(runs) {
  const rounds = new Map();
  for (const run of runs || []) {
    if (run.writes || run.state !== 'finished') continue;
    const key = `${run.shiftId ?? ''}:${run.round ?? 0}`;
    if (!rounds.has(key)) rounds.set(key, { key, shiftId: run.shiftId ?? null, round: Number(run.round) || 0, reviewers: [], shadows: [] });
    rounds.get(key)[run.shadow === true ? 'shadows' : 'reviewers'].push(run);
  }
  return [...rounds.values()]
    .filter(entry => entry.reviewers.some(run => verdicts.has(run.verdict)))
    .map(entry => ({ ...entry, acting: combined(entry.reviewers) }))
    .map(entry => ({ ...entry, shadows: entry.shadows.filter(run => verdicts.has(run.verdict) && run.verdict !== entry.acting).map(run => ({ ...run, verdict: run.verdict })) }))
    .filter(entry => entry.shadows.length);
}

/**
 * Each review Round where a shadow reviewer's verdict differs from the acting reviewers', newest first. Ploeg's own
 * `reviewDisagreements` (Ploeg ADR-0121) wins when the detail carries it; an older ploegd's Runs are compared the way
 * Ploeg's review loop combines verdicts (any `request_changes` wins, Ploeg ADR-0017). A shadow never acts (Ploeg
 * ADR-0096), so what happened next followed `acting`. Each shadow carries the verdict Ploeg recorded for it.
 * @param {object[] | null | undefined} runs
 * @param {unknown} [reported] the detail's `reviewDisagreements`, when it has one
 * @returns {{ key: string, shiftId: string | null, round: number, acting: string, reviewers: object[], shadows: object[] }[]}
 */
export function reviewDisagreements(runs, reported) {
  const known = runs || [];
  const rounds = listed(reported)
    ? reported.map(entry => {
      const shiftId = text(entry?.shiftId, 32) || null;
      const round = whole(entry?.round) ?? 0;
      const acting = verdictOf(entry?.primaryVerdict);
      const said = verdictOf(entry?.shadowVerdict);
      const id = text(entry?.shadowRunId, 32);
      if (!acting || !said || !id || acting === said) return null;
      const run = known.find(candidate => String(candidate.id) === id);
      const reviewers = known.filter(candidate => !candidate.writes && !candidate.shadow && candidate.state === 'finished' && (candidate.shiftId ?? null) === shiftId && candidate.round === round);
      return { key: `${shiftId ?? ''}:${round}:${id}`, shiftId, round, acting, reviewers, shadows: [{ ...(run || { id, findings: '' }), role: run?.role || text(entry?.shadowRole, 100), verdict: said, shadow: true }] };
    }).filter(Boolean)
    : computed(known);
  return rounds
    .map(entry => ({ ...entry, reviewers: [...entry.reviewers].sort(newestFirst), shadows: [...entry.shadows].sort(newestFirst) }))
    .sort((a, b) => (Number(b.shiftId) || 0) - (Number(a.shiftId) || 0) || b.round - a.round);
}

/**
 * The list-level summary of a Work Item's latest disagreement for Now: its Round and the two verdicts, or null.
 * @returns {{ round: number, acting: string, shadow: string } | null}
 */
export function disagreementSummary(runs, reported) {
  const latest = reviewDisagreements(runs, reported)[0];
  return latest ? { round: latest.round, acting: latest.acting, shadow: latest.shadows[0].verdict } : null;
}

/**
 * The findings of a Work Item detail (Ploeg ADR-0121 `findings`), in the order first raised, each with its severity,
 * place and the writer's answer when it has one. Absent on an older ploegd; an entry Unfold cannot read is left out.
 * @returns {{ id: string, shiftId: string | null, runId: string, role: string, round: number | null, lastRaisedRound: number | null, shadow: boolean, severity: object | null, title: string, body: string, place: string, answer: { status: string, meta: object, reason: string, runId: string, role: string, round: number | null } | null, unanswered: boolean }[]}
 */
export function workItemFindings(detail) {
  return (listed(detail?.findings) || []).map(entry => {
    const answer = entry?.answer && typeof entry.answer === 'object' && Object.hasOwn(findingAnswerKinds, entry.answer.status)
      ? { status: entry.answer.status, meta: findingAnswerKinds[entry.answer.status], reason: text(entry.answer.reason, 4096), runId: text(entry.answer.runId, 32), role: text(entry.answer.role, 100), round: whole(entry.answer.round) }
      : null;
    const path = text(entry?.path, 1024);
    const line = Number.isInteger(entry?.line) && entry.line > 0 ? entry.line : null;
    return {
      id: text(entry?.id, 128), shiftId: text(entry?.shiftId, 32) || null, runId: text(entry?.runId, 32), role: text(entry?.role, 100), round: whole(entry?.round), lastRaisedRound: whole(entry?.lastRaisedRound),
      shadow: entry?.shadow === true, severity: Object.hasOwn(findingSeverities, entry?.severity) ? findingSeverities[entry.severity] : null,
      title: text(entry?.title, 4096), body: text(entry?.body, 16000), place: path ? `${path}${line ? `:${line}` : ''}` : '', answer, unanswered: !answer && entry?.unanswered === true,
    };
  }).filter(entry => entry.id && entry.title).slice(0, 200);
}

/** The findings a writing Run answered, from the detail's `findings`. */
export function answeredBy(detail, run) {
  return workItemFindings(detail).filter(entry => entry.answer && entry.answer.runId === String(run?.id));
}

/**
 * Every question to a person a stopped Work Item still waits on, oldest first, so a person answers them all before the
 * Round resumes. Empty unless Ploeg lists questions.
 */
export function waitingQuestions(detail) {
  if (detail?.item?.state !== 'needs_human') return [];
  return detailQuestions(detail).filter(entry => entry.to === 'person' && entry.waitingForPerson).map(entry => ({ id: entry.id, text: entry.text, typed: true, runId: entry.runId, role: entry.role, round: entry.round, at: null }));
}

/**
 * What resuming the parked Round would do, as Ploeg offers it (Ploeg ADR-0121 `resume`), or null when Ploeg offers no
 * resume or an older ploegd sends none. `readyAfter` says whether answering `answered` question ids is enough for Ploeg
 * to accept the resume.
 * @returns {{ shiftId: string, askedRound: number, fromRound: number, roundCapUsd: number, poolUsd: number, ready: boolean, waitingQuestionIds: string[], readyAfter(answered: string[]): boolean } | null}
 */
export function resumeOffer(detail) {
  const offer = detail?.resume;
  if (!offer || typeof offer !== 'object' || Array.isArray(offer)) return null;
  const amount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  const fromRound = whole(offer.fromRound), askedRound = whole(offer.askedRound), roundCapUsd = amount(offer.roundCapUsd), poolUsd = amount(offer.poolUsd);
  if (!fromRound || !askedRound || roundCapUsd === null || poolUsd === null || typeof offer.ready !== 'boolean') return null;
  const waitingQuestionIds = (listed(offer.waitingQuestionIds) || []).filter(id => typeof id === 'string');
  return { shiftId: text(offer.shiftId, 32), askedRound, fromRound, roundCapUsd, poolUsd, ready: offer.ready, waitingQuestionIds, readyAfter: answered => offer.ready || waitingQuestionIds.every(id => answered.includes(id)) };
}
