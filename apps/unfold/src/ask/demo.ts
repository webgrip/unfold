import type { WorkItemBrief } from './brief.ts';

const topics: { pattern: RegExp; answer: (brief: WorkItemBrief) => string | null }[] = [
  { pattern: /\b(why|stopp?ed|stuck|blocked|wait(ing)?)\b/i, answer: brief => brief.stoppedBecause ? `It stopped because ${brief.stoppedBecause}.` : brief.state === 'needs_human' ? `It is ${brief.stateText}; the record does not say why.` : `It has not stopped. It is ${brief.stateText}.` },
  { pattern: /\b(cost|spen[dt]|price|budget|money|pay)\b/i, answer: () => 'This is a demo, so no model ran and nothing was spent.' },
  { pattern: /\b(pull request|pr|review|merge)\b/i, answer: brief => brief.pullRequest ? `Pull request${brief.pullRequest.number === null ? '' : ` #${brief.pullRequest.number}`} is open${brief.pullRequest.status === 'conflicted' ? ' and has merge conflicts' : ''}.` : 'There is no pull request yet.' },
  { pattern: /\b(preview|environment|try it|look at)\b/i, answer: brief => brief.previews.length ? `It can be looked at in ${brief.previews.map(preview => preview.environment).join(', ')}.` : 'There is no preview yet.' },
  { pattern: /\b(what|did|done|change|summary|happen)/i, answer: brief => { const last = [...brief.runs].reverse().find(run => run.summary); return last ? `The ${last.role} said: ${last.summary}` : null; } },
  { pattern: /\b(status|state|where|how far|progress|now|when)\b/i, answer: brief => `It is ${brief.stateText}.` },
];

/** Answers an Ask in the deterministic demo from the brief alone, with fixed rules and no model call. Returns a plain refusal when no rule matches, rather than guessing. */
export function demoAnswer(brief: WorkItemBrief, question: string): string {
  for (const topic of topics) {
    if (!topic.pattern.test(question)) continue;
    const answer = topic.answer(brief);
    if (answer) return answer;
  }
  return 'The demo answers questions about where the work stands, why it stopped, the pull request, previews and spend. It cannot answer this one.';
}
