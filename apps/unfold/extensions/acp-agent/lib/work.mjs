const clip = (value, max) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const whole = value => Number.isInteger(value) && value > 0 ? value : null;

/** The prefix of an ACP session id that follows a Work Item, as `session/list` offers it and `session/resume` takes it. */
export const workSessionPrefix = 'unfold-work-';

/** The ACP session id `session/list` gives a Work Item. */
export function workSessionId(id) { return `${workSessionPrefix}${id}`; }

/** The Work Item id an ACP session id from `session/list` names, or null. */
export function workItemOfSession(sessionId) {
  const match = /^unfold-work-([1-9][0-9]{0,18})$/.exec(String(sessionId ?? ''));
  return match ? match[1] : null;
}

/** What the Work Item's Shifts spent in total, in US dollars. */
export function spentOf(detail) {
  return (Array.isArray(detail?.shifts) ? detail.shifts : []).reduce((sum, shift) => sum + (Number(shift?.spentUsd) || 0), 0);
}

/** The pull request link of a Work Item, or ''. */
export function pullRequestOf(item) {
  const url = String(item?.pullRequestUrl || item?.pullRequest?.url || item?.prUrl || '');
  return /^https?:\/\//.test(url) ? url : '';
}

/**
 * The questions a `needs_human` Work Item waits on a person for, oldest first, as Ploeg lists them under `questions`
 * (Ploeg ADR-0121): each has the id Unfold answers it under. A question without an id, from an older Ploeg, is not listed.
 * @returns {{ id: string, text: string, role: string, round: number | null }[]}
 */
export function waitingQuestions(detail) {
  if (detail?.item?.state !== 'needs_human') return [];
  return (Array.isArray(detail.questions) ? detail.questions : [])
    .filter(entry => entry && entry.to === 'person' && entry.waitingForPerson === true && typeof entry.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(entry.id) && typeof entry.text === 'string' && entry.text.trim())
    .map(entry => ({ id: entry.id, text: String(entry.text).slice(0, 4096), role: typeof entry.role === 'string' ? entry.role.slice(0, 100) : '', round: whole(entry.round) }));
}

/** What resuming the Round that asked would do, as Ploeg offers it under `resume`, or null. */
export function resumeOffer(detail) {
  const offer = detail?.resume;
  if (!offer || typeof offer !== 'object' || Array.isArray(offer)) return null;
  const amount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  const fromRound = whole(offer.fromRound), roundCapUsd = amount(offer.roundCapUsd), poolUsd = amount(offer.poolUsd);
  if (!fromRound || roundCapUsd === null || poolUsd === null || typeof offer.ready !== 'boolean') return null;
  const waiting = (Array.isArray(offer.waitingQuestionIds) ? offer.waitingQuestionIds : []).filter(id => typeof id === 'string');
  return { fromRound, roundCapUsd, poolUsd, readyAfter: answered => offer.ready || waiting.every(id => answered.includes(id)) };
}

/**
 * An ACP form elicitation schema for the questions of a workbench session's question request: one field per question,
 * a single or multiple choice when the agent offered options, otherwise free text.
 * @param {unknown[]} questions
 */
export function questionForm(questions) {
  const properties = {};
  questions.forEach((raw, index) => {
    const question = raw && typeof raw === 'object' ? raw : { question: String(raw ?? '') };
    const title = clip(question.header || `Question ${index + 1}`, 120);
    const description = clip(question.question ?? '', 1000);
    const options = (Array.isArray(question.options) ? question.options : []).map(option => clip(typeof option === 'string' ? option : option?.label, 200)).filter(Boolean).slice(0, 25);
    const choices = [...new Set(options)].map(label => ({ const: label, title: label }));
    properties[`q${index}`] = !choices.length ? { type: 'string', title, description, maxLength: 4000 }
      : question.multiple === true ? { type: 'array', title, description, items: { anyOf: choices } }
      : { type: 'string', title, description, oneOf: choices };
  });
  return { type: 'object', properties, required: Object.keys(properties) };
}

/** The answers of an accepted question form, one list per question, in the shape Unfold takes them. Null when every answer is empty. */
export function formAnswers(questions, content) {
  const answers = questions.map((_, index) => {
    const value = content && typeof content === 'object' ? content[`q${index}`] : undefined;
    if (Array.isArray(value)) return value.map(entry => String(entry).slice(0, 4000)).filter(Boolean);
    if (value === undefined || value === null) return [];
    const text = String(value).trim().slice(0, 4000);
    return text ? [text] : [];
  });
  return answers.some(list => list.length) ? answers : null;
}

/** The tracker task and Team a hand-off request names: `<source>/<task> to <team>`, `<source>:<task> <team>` or a bare task id. */
export function handOffRequest(text) {
  const match = /^(?:task\s+)?(\S+?)\s+(?:to\s+)?(?:team\s+)?([^\s.!?]{1,100})[.!?]?$/i.exec(String(text ?? '').trim());
  if (!match) return null;
  const named = /^([a-z0-9-]{1,64})[/:#]([A-Za-z0-9_-]{1,128})$/.exec(match[1]) ?? /^()#?([A-Za-z0-9_-]{1,128})$/.exec(match[1]);
  return named ? { source: named[1], task: named[2], team: match[2] } : null;
}
