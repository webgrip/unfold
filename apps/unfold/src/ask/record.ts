import { money } from '../../public/core/format.js';
import type { BriefProgress, WorkItemBrief } from './brief.ts';
import type { AskAudience } from './types.ts';

/** A standing question about a Work Item that Unfold answers from the record, with no model call (system ADR-0031, update 2026-10-10). */
export type RecordIntent = 'doing' | 'stopped' | 'spend' | 'next' | 'who' | 'done' | 'pull_request' | 'preview';

const subject = '(?:it|this|that|this work|the work|this work item|the work item|this item|the item|this task|the task|this ticket|the ticket|the agents?|the crew)';
const now = '(?: (?:now|right now|at the moment|currently|so far|today))?';
const sofar = '(?: (?:so far|until now|to date|yet))?';
const pr = '(?:pr|pull request|merge request)';

const phrasings: Record<RecordIntent, string[]> = {
  doing: [
    `(?:what(?:'s| is) )?(?:the )?(?:current )?(?:status|progress|state)(?: of ${subject})?${now}`,
    `what(?:'s| is| are) ${subject} (?:currently )?(?:doing|working on)${now}`,
    `what(?:'s| is) (?:happening|going on)(?: with ${subject})?${now}`,
    `where (?:does|do) ${subject} stand${now}`,
    `how far (?:along )?(?:is|are) ${subject}${now}`,
    `how(?:'s| is) ${subject} going${now}`,
    `(?:is|are) ${subject} (?:still )?(?:running|working|going|in progress|being worked on)${now}`,
  ],
  stopped: [
    `why (?:did|has|have) ${subject} (?:stop|stopped|halt|halted|fail|failed|pause|paused)`,
    `why (?:is|are|was|were) ${subject} (?:stopped|stuck|waiting|paused|blocked|halted|failed|on hold|not (?:running|working|moving))${now}`,
    `why(?:'s| is) ${subject} (?:stopped|stuck|waiting|paused|blocked)${now}`,
    `why (?:didn't|did not|hasn't|has not|haven't|have not) ${subject} (?:finish|finished|complete|completed|continue|continued)(?: yet)?`,
    `what (?:stopped|blocked|halted) ${subject}`,
    `what(?:'s| is| are) ${subject} waiting (?:for|on)`,
  ],
  spend: [
    `(?:what|how much) (?:did|has|have) ${subject} cost${sofar}`,
    `how much (?:has|did) ${subject} (?:spend|spent|use|used)${sofar}`,
    `how much (?:money|budget) (?:has|did) ${subject} (?:spend|spent|use|used)${sofar}`,
    `how much (?:has been|was|did we|have we) spen[dt](?: on ${subject})?${sofar}`,
    `what(?:'s| is| was) (?:the|its) (?:cost|spend|spending|total cost)(?: of ${subject})?${sofar}`,
    `(?:cost|spend)(?: so far)?`,
  ],
  next: [
    `what (?:should|do|can|must) (?:i|we) do(?: now| next)?(?: (?:about|with) ${subject})?`,
    `what(?:'s| is| are) (?:the )?next(?: steps?)?`,
    `next steps?`,
    `what now`,
    `do (?:i|we) (?:need|have) to do anything(?: now)?`,
    `(?:is|are) there (?:anything|something) (?:i|we) (?:need|have|should) to do(?: now)?`,
    `what do(?:es)? (?:you|it|they) need from (?:me|us)`,
  ],
  who: [
    `who(?:'s| is) (?:working on|doing|handling) ${subject}${now}`,
    `who(?:'s| is) working${now}`,
    `(?:which|what) (?:role|roles|agent|agents) (?:is|are) (?:working|running|active)(?: on ${subject})?${now}`,
  ],
  done: [
    `(?:is|are) ${subject} (?:done|finished|complete|completed|ready)(?: yet)?`,
    `(?:has|have|did) ${subject} (?:finish|finished|complete|completed)(?: yet)?`,
  ],
  pull_request: [
    `where(?:'s| is) (?:the|its) ${pr}`,
    `(?:is|was) there (?:a|an) ${pr}(?: yet)?`,
    `(?:has|did) ${subject} (?:open|opened|create|created|make|made|raise|raised) (?:a|an|the) ${pr}(?: yet)?`,
    `(?:does|do) ${subject} have (?:a|an) ${pr}(?: yet)?`,
    `(?:what(?:'s| is) (?:the|its) )?${pr}(?: (?:status|number))?`,
    `(?:what(?:'s| is) )?the (?:status|state) of the ${pr}`,
  ],
  preview: [
    `(?:is|was) there (?:a|an) preview(?: environment)?(?: yet)?`,
    `where(?:'s| is) (?:the|its) preview(?: environment)?`,
    `(?:does|do) ${subject} have (?:a|an) preview(?: environment)?(?: yet)?`,
  ],
};

const dutchSubject = '(?:het|hij|ze|zij|dit|dat|dit werk|het werk|deze taak|de taak|dit werkitem|het werkitem|dit item|het item|dit ticket|het ticket|de agents?|de agenten|de ploeg)';
const dutchNow = '(?: (?:nu|op dit moment|op het moment|momenteel|vandaag))?';
const dutchSoFar = '(?: (?:tot nu toe|tot nu|tot zover|al|in totaal))?';
const dutchPr = '(?:pr|pull ?request|merge ?request)';
const dutchPreview = 'preview(?:[- ]?omgeving)?';

const dutchPhrasings: Record<RecordIntent, string[]> = {
  doing: [
    `(?:wat is )?(?:de )?(?:huidige )?(?:status|voortgang|stand van zaken)(?: van ${dutchSubject})?${dutchNow}`,
    `wat (?:doet|doen) ${dutchSubject}${dutchNow}`,
    `waar (?:is|zijn) ${dutchSubject}${dutchNow} mee bezig`,
    `wat gebeurt er${dutchNow}(?: (?:met|bij) ${dutchSubject})?${dutchNow}`,
    `hoe (?:staat|staan) ${dutchSubject} ervoor${dutchNow}`,
    `hoe staat het ervoor(?: met ${dutchSubject})?${dutchNow}`,
    `hoe ver (?:is|zijn) ${dutchSubject}${dutchNow}`,
    `hoe (?:gaat|loopt) het (?:met|bij) ${dutchSubject}${dutchNow}`,
    `(?:is|zijn) ${dutchSubject}${dutchNow} (?:nog )?(?:bezig|aan het werk|actief|aan de gang)`,
  ],
  stopped: [
    `waarom (?:is|zijn) ${dutchSubject} (?:gestopt|vastgelopen|mislukt|gefaald|gepauzeerd|stilgevallen|stilgezet)`,
    `waarom (?:stopte|stopten|faalde|faalden) ${dutchSubject}`,
    `waarom (?:staat|staan|ligt|liggen|zit|zitten) ${dutchSubject}${dutchNow} (?:stil|vast|te wachten|in de wacht|on hold|op pauze)`,
    `waarom (?:wacht|wachten) ${dutchSubject}${dutchNow}`,
    `waarom (?:is|zijn) ${dutchSubject} (?:nog )?niet (?:klaar|af|afgerond|verder gegaan|doorgegaan)`,
    `waar (?:wacht|wachten) ${dutchSubject}${dutchNow} op`,
    `waarop (?:wacht|wachten) ${dutchSubject}${dutchNow}`,
    `wat (?:houdt|houden|hield|hielden) ${dutchSubject} tegen`,
  ],
  spend: [
    `(?:wat|hoeveel) (?:heeft|hebben) ${dutchSubject}${dutchSoFar} gekost`,
    `hoeveel (?:geld|budget) (?:heeft|hebben) ${dutchSubject}${dutchSoFar} (?:gekost|gebruikt|verbruikt|uitgegeven)`,
    `hoeveel (?:is|werd) er${dutchSoFar} (?:aan ${dutchSubject} )?(?:uitgegeven|besteed)`,
    `wat (?:kostte|kostten) ${dutchSubject}`,
    `wat (?:zijn|waren) de (?:kosten|uitgaven)(?: van ${dutchSubject})?${dutchSoFar}`,
    `(?:kosten|uitgaven)(?: tot nu toe)?`,
  ],
  next: [
    `wat (?:moet|kan|moeten|kunnen) (?:ik|we|wij)(?: nu| hierna)?(?: (?:ermee|hiermee|daarmee|met ${dutchSubject}))? doen`,
    `wat (?:is|zijn) (?:de )?volgende stap(?:pen)?`,
    `volgende stap(?:pen)?`,
    `wat nu`,
    `(?:moet|moeten) (?:ik|we|wij)(?: nu)? (?:nog )?iets doen`,
    `(?:is|valt) er (?:nog )?iets (?:voor (?:mij|ons) )?te doen`,
    `wat (?:heb je|heeft ${dutchSubject}|hebben ${dutchSubject}) van (?:mij|ons) nodig`,
  ],
  who: [
    `wie (?:werkt|werken)${dutchNow} (?:eraan|er aan|aan ${dutchSubject})${dutchNow}`,
    `wie (?:werkt|werken) er${dutchNow}`,
    `wie (?:is|zijn) er${dutchNow} (?:mee )?bezig`,
    `wie (?:is|zijn)${dutchNow} (?:ermee bezig|bezig met ${dutchSubject})`,
    `welke (?:rol|rollen|agent|agents|agenten) (?:is|zijn|werkt|werken)${dutchNow} (?:eraan|ermee bezig|bezig|actief|aan het werk)(?: (?:aan|met) ${dutchSubject})?`,
  ],
  done: [
    `(?:is|zijn) ${dutchSubject} (?:al )?(?:klaar|af|voltooid|afgerond|gereed)`,
    `(?:heeft|hebben) ${dutchSubject} het (?:al )?(?:afgerond|voltooid)`,
  ],
  pull_request: [
    `waar (?:is|staat) (?:de|het|zijn) ${dutchPr}`,
    `(?:is|was) er (?:al )?(?:een )?${dutchPr}`,
    `(?:heeft|hebben) ${dutchSubject} (?:al )?(?:een|de) ${dutchPr} (?:geopend|aangemaakt|gemaakt|ingediend|opengezet)`,
    `(?:heeft|hebben) ${dutchSubject} (?:al )?een ${dutchPr}`,
    `(?:wat is )?de status van de ${dutchPr}`,
  ],
  preview: [
    `(?:is|was) er (?:al )?(?:een )?${dutchPreview}`,
    `waar (?:is|staat) (?:de|het|zijn) ${dutchPreview}`,
    `(?:heeft|hebben) ${dutchSubject} (?:al )?een ${dutchPreview}`,
  ],
};

/** The language a standing question was asked in. Record answers stay English either way; a Dutch question gets a Dutch lead saying so. */
export type RecordLanguage = 'en' | 'nl';

/** A standing question and the language it was asked in. */
export type RecordMatch = { intent: RecordIntent; language: RecordLanguage };

const compile = (language: RecordLanguage, source: Record<RecordIntent, string[]>) =>
  Object.entries(source).map(([intent, list]) => ({ intent: intent as RecordIntent, language, pattern: new RegExp(`^(?:${list.join('|')})$`) }));
const patterns = [...compile('en', phrasings), ...compile('nl', dutchPhrasings)];
const questionLimit = 80;

function normalized(question: string): string {
  return question.normalize('NFKC').toLowerCase().replace(/[‘’`]/g, "'").replace(/\s+/g, ' ').trim()
    .replace(/^(?:(?:hi|hey|hello|ok|okay|so|and|quick question|hoi|hallo|hé|dag|goedemorgen|goedemiddag|goedenavond|oké|dus|en|snelle vraag)[,:!]?\s+)+/, '')
    .replace(/^(?:please|alsjeblieft|alstublieft),?\s+/, '')
    .replace(/,?\s+(?:please|graag|alsjeblieft|alstublieft|aub|a\.u\.b)(?=[\s?!.]*$)/, '')
    .replace(/[\s?!.]+$/, '');
}

/**
 * The standing question a question asks and its language, or null. Precision over recall: the whole question, after
 * trimming greetings, "please" and closing punctuation in English or Dutch, must be one of a fixed set of English or
 * Dutch phrasings, short, a single sentence, and match exactly one intent. Anything else, including two questions in
 * one, goes to the model.
 */
export function matchQuestion(question: string): RecordMatch | null {
  const text = normalized(question);
  if (!text || text.length > questionLimit || /[?!.;:\n]/.test(text)) return null;
  const found = patterns.filter(entry => entry.pattern.test(text));
  if (new Set(found.map(entry => entry.intent)).size !== 1) return null;
  return { intent: found[0].intent, language: found.some(entry => entry.language === 'en') ? 'en' : 'nl' };
}

/** The standing question a question asks, or null; see `matchQuestion`. */
export function matchIntent(question: string): RecordIntent | null {
  return matchQuestion(question)?.intent ?? null;
}

const capital = (value: string) => value ? value[0].toUpperCase() + value.slice(1) : value;
const list = (items: string[]) => items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
const finished = new Set(['accepted', 'rejected']);

function statusLine(progress: BriefProgress): string {
  const rest = progress.headline === progress.label ? '' : progress.headline.startsWith(`${progress.label} · `) ? progress.headline.slice(progress.label.length + 3) : progress.headline;
  return `${progress.label}${rest ? `: ${rest}` : ''}.`;
}

function pullRequestNumber(brief: WorkItemBrief): number | null {
  return brief.pullRequest?.number ?? brief.progress?.pullRequest ?? null;
}

function stepsLine(progress: BriefProgress): string {
  if (!progress.steps.length) return 'No Role has run yet.';
  return `${progress.steps.map(step => `${capital(step.role)}: ${step.label.toLowerCase()}${step.verdict ? `, ${step.verdict.toLowerCase()}${step.verdictRecorded ? '' : ' in its transcript, not recorded'}` : ''}`).join('; ')}.`;
}

function runningRoles(brief: WorkItemBrief): string[] {
  return brief.state === 'leased' ? brief.runs.filter(run => run.state === 'running').map(run => run.role) : [];
}

const answers: Record<RecordIntent, (brief: WorkItemBrief, audience: AskAudience) => string | null> = {
  doing(brief) {
    const progress = brief.progress;
    if (progress) return `${statusLine(progress)}${progress.stop ? ` ${progress.stop}` : ''}`;
    const roles = runningRoles(brief);
    return `It is ${brief.stateText}.${brief.stoppedBecause ? ` It stopped because ${brief.stoppedBecause}.` : ''}${roles.length ? ` Running now: ${list(roles)}.` : ''}`;
  },
  stopped(brief) {
    const progress = brief.progress;
    if (progress) {
      if (['stopped', 'failed', 'paused', 'cancelled'].includes(progress.phase)) return progress.stop ?? `It ${progress.phase === 'failed' ? 'failed' : 'stopped'}, and the record does not say why.`;
      if (progress.phase === 'asking') return `It has not stopped; it is waiting for an answer. ${statusLine(progress)}`;
      return `It has not stopped. ${statusLine(progress)}`;
    }
    if (brief.stoppedBecause) return `It stopped because ${brief.stoppedBecause}.`;
    if (brief.state === 'needs_human' || brief.state === 'withdrawn') return `It is ${brief.stateText}; the record does not say why.`;
    return `It has not stopped. It is ${brief.stateText}.`;
  },
  spend(brief) {
    if (brief.spend.status === 'demo' || brief.progress?.spend.status === 'demo') return 'This is a demo, so no model ran and nothing was spent.';
    const apart = ' Questions asked about it are counted apart.';
    const spend = brief.progress?.spend;
    if (spend) return spend.status === 'unknown' ? `Spend on the work is not reported yet.${spend.note ? ` Its budget: ${spend.note.replace(/^of /, '')}.` : ''}` : `Spend on the work so far: ${spend.text} (${spend.note}).${apart}`;
    if (brief.spend.deliveryUsd === null) return 'Spend on the work is not reported yet.';
    return `Spend on the work so far: ${money(brief.spend.deliveryUsd)} (${brief.spend.status === 'settled' ? 'settled' : 'observed, not settled'}).${apart}`;
  },
  next(brief, audience) {
    if (audience !== 'internal') return null;
    const progress = brief.progress;
    if (progress) {
      if (progress.next) return progress.next;
      if (finished.has(progress.phase)) return `Nothing is needed; a person ${progress.phase} it.`;
      return `Nothing runs again by itself. ${progress.actions.length ? `From its session you can: ${list(progress.actions)}.` : 'Its session shows the evidence.'}`;
    }
    switch (brief.state) {
      case 'leased': return 'Nothing is needed now.';
      case 'queued': case 'ingested': return 'Nothing is needed now. To change its priority, change it in the tracker; Unfold never re-ranks work.';
      case 'proposed': return 'An agent proposed this work. Nothing runs until a person approves it on Proposed.';
      case 'withdrawn': return 'To start again, assign the task to the Team in its tracker.';
      case 'done': return 'Nothing; it is done.';
      default: return null;
    }
  },
  who(brief) {
    const progress = brief.progress;
    if (progress) return progress.working ? `The ${progress.working.role} is working on it now${progress.working.round ? `, in Round ${progress.working.round}` : ''}.` : `No Role is working on it now. ${stepsLine(progress)}`;
    const roles = runningRoles(brief);
    if (roles.length) return `${capital(list(roles))} ${roles.length === 1 ? 'is' : 'are'} working on it now.`;
    const last = brief.runs.at(-1);
    return `No Role is working on it now. It is ${brief.stateText}.${last ? ` The last Run was the ${last.role}, in round ${last.round}.` : ''}`;
  },
  done(brief) {
    const number = pullRequestNumber(brief);
    const pull = number ? `pull request #${number}` : 'the pull request';
    if (brief.state === 'done') return 'Yes, it is done.';
    const progress = brief.progress;
    if (progress?.phase === 'accepted') return 'Yes. A person accepted it.';
    if (progress?.phase === 'rejected') return 'It is finished, and a person rejected it.';
    if (progress?.phase === 'review' || (!progress && brief.state === 'awaiting_review')) return `The agents finished. It is waiting for a person to review ${pull}.`;
    if (brief.state === 'withdrawn') return 'No. It was withdrawn; no more work will happen on it.';
    return `No. ${progress ? statusLine(progress) : `It is ${brief.stateText}.`}`;
  },
  pull_request(brief) {
    if (brief.pullRequest) {
      const number = brief.pullRequest.number === null ? 'The pull request' : `Pull request #${brief.pullRequest.number}`;
      if (brief.state === 'done') return `${number} belongs to it, and the Work Item is done.`;
      if (brief.state === 'withdrawn') return `${number} was left as it was when the work was withdrawn; the record does not say whether it is still open.`;
      return `${number} is open${brief.pullRequest.status === 'conflicted' ? ' and has merge conflicts' : ''}. It is linked on the Work Item page.`;
    }
    if (brief.progress?.pullRequest) return `Pull request #${brief.progress.pullRequest} belongs to it. It is linked on the Work Item page.`;
    return `The record shows no pull request${brief.state === 'done' ? '' : ' yet'}.`;
  },
  preview(brief) {
    return brief.previews.length ? `It can be looked at in ${list(brief.previews.map(preview => preview.environment))}.` : 'There is no preview yet.';
  },
};

/** How a record answer to a Dutch question starts: the answer itself stays in the English the rest of Unfold shows. */
export const dutchLead = 'Antwoord uit het dossier, in het Engels zoals Unfold het toont.';

/**
 * The answer to a standing question from the brief alone, or null when the record cannot answer it for this audience
 * and the model should. A question asked in Dutch gets `dutchLead` before the English answer.
 */
export function recordAnswer(intent: RecordIntent, brief: WorkItemBrief, audience: AskAudience, language: RecordLanguage = 'en'): string | null {
  const answer = answers[intent](brief, audience);
  return answer !== null && language === 'nl' ? `${dutchLead} ${answer}` : answer;
}

/** What the deterministic demo says to a question that is not a standing question: it has no model to ask. */
export const demoUnanswered = 'The demo answers standing questions about where the work stands, why it stopped, what to do next, who is working, whether it is done, the pull request, previews and spend. It cannot answer this one.';
