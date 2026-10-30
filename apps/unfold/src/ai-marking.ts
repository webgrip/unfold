/**
 * The AI marking Unfold puts on what agents write through it: a sentence people read, an HTML comment marker and a
 * forge label machines read on pull requests and pull request comments, and git trailers on commits. The format is
 * described in docs/ai-marking.md; {@link readAiMarking} reads a marker back.
 */

/** The version of the marker format, written as `v=` in every marker. */
export const aiMarkingVersion = 1;

/** The forge label Unfold puts on the pull requests it opens. */
export const aiGeneratedLabel = { name: 'ai-generated', color: '#7c3aed', description: 'Written by an AI agent. A person reviews it before merge.' } as const;

/** Where the review of the AI-written change stands: approved by people, merged by a person without a recorded approval, or not reviewed yet. */
export type AiReview = { state: 'approved'; by: readonly string[] } | { state: 'merged'; by: string } | { state: 'pending' };

/** What a marker on a pull request, or on a comment about one, says. `subject` is what the AI agent wrote. */
export type AiMarking = {
  subject: 'pull-request' | 'commit';
  review: AiReview;
  /** Agent Trace record ids that attribute the change's lines, at most 20. */
  agentTraces?: readonly string[];
  /** The Unfold page of the session that wrote the change. */
  session?: string;
};

/** What a commit's trailers name: the agent (harness) and model that wrote it, its Agent Trace record and its Unfold page. */
export type AiCommitMarking = { agent: string; model?: string; agentTrace?: string; session?: string };

const markerPrefix = '<!-- unfold:ai-generated ';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxTraces = 20;
const maxReviewers = 3;

const singleLine = (value: string): string => value.replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim();

function safeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return undefined;
    return url.href.length <= 2048 ? url.href : undefined;
  } catch { return undefined; }
}

function markdownName(value: string): string {
  return singleLine(value).slice(0, 120).replace(/[\\`*_[\]<>|#~]/g, character => `\\${character}`).replace(/@(?=\w)/g, '@​');
}

function people(names: readonly string[]): string[] {
  return [...new Set(names.map(name => singleLine(name).slice(0, 120)).filter(Boolean))].slice(0, maxReviewers);
}

function joined(names: readonly string[]): string {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** The one sentence people read, such as "Written by an AI agent and reviewed by Ryan." Names are escaped for Markdown. */
export function aiDisclosure(review: AiReview): string {
  if (review.state === 'approved' && people(review.by).length) return `Written by an AI agent and reviewed by ${joined(people(review.by).map(markdownName))}.`;
  if (review.state === 'merged' && singleLine(review.by)) return `Written by an AI agent and merged by ${markdownName(review.by)} without a recorded approval.`;
  return 'Written by an AI agent and awaiting review by a person.';
}

/** The machine-readable marker: one HTML comment such as `<!-- unfold:ai-generated v=1 subject=pull-request review=approved reviewer=Ryan agent-trace=<id> -->`. Every value is percent-encoded, so the comment never closes early. */
export function aiGeneratedMarker(marking: AiMarking): string {
  const fields = [`v=${aiMarkingVersion}`, `subject=${marking.subject}`, `review=${marking.review.state}`];
  if (marking.review.state === 'approved') for (const name of people(marking.review.by)) fields.push(`reviewer=${encodeURIComponent(name)}`);
  if (marking.review.state === 'merged' && singleLine(marking.review.by)) fields.push(`reviewer=${encodeURIComponent(singleLine(marking.review.by).slice(0, 120))}`);
  const traces = [...new Set((marking.agentTraces ?? []).filter(id => uuid.test(id)).map(id => id.toLowerCase()))].slice(0, maxTraces);
  if (traces.length) fields.push(`agent-trace=${traces.join(',')}`);
  const session = safeUrl(marking.session);
  if (session) fields.push(`session=${session.replace(/[<>\s]/g, encodeURIComponent)}`);
  return `${markerPrefix}${fields.join(' ')} -->`;
}

/** The marker and the sentence, as the first lines of a pull request body or comment. */
export function aiMarkingBlock(marking: AiMarking): string {
  return `${aiGeneratedMarker(marking)}\n_${aiDisclosure(marking.review)}_`;
}

/** Puts the marking at the top of Markdown that does not carry an Unfold AI marker yet; Markdown that does is returned as it is. */
export function markAiMarkdown(markdown: string, marking: AiMarking): string {
  if (markdown.includes(markerPrefix)) return markdown;
  return `${aiMarkingBlock(marking)}\n\n${markdown}`;
}

/** The fields of the first Unfold AI marker in a text, or null when it carries none. */
export function readAiMarking(text: string): { version: number; subject: string; review: string; reviewers: string[]; agentTraces: string[]; session?: string } | null {
  const start = text.indexOf(markerPrefix);
  if (start < 0) return null;
  const end = text.indexOf(' -->', start);
  if (end < 0) return null;
  const fields = text.slice(start + markerPrefix.length, end).split(' ').map(pair => [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)] as const);
  const value = (key: string) => fields.find(([name]) => name === key)?.[1];
  const decode = (raw: string) => { try { return decodeURIComponent(raw); } catch { return raw; } };
  const session = value('session');
  return {
    version: Number(value('v')),
    subject: value('subject') ?? '',
    review: value('review') ?? '',
    reviewers: fields.filter(([name]) => name === 'reviewer').map(([, raw]) => decode(raw)),
    agentTraces: (value('agent-trace') ?? '').split(',').filter(Boolean),
    ...(session ? { session } : {}),
  };
}

/**
 * Where a pull request's review stands from the forge's reviews: the people whose latest review approved the current
 * head (or any head, when the forge did not say which), else the person who merged it, else pending.
 */
export function pullRequestReview(pullRequest: { headSha: string | null; mergedBy?: string | null; reviews: readonly { reviewer: string; state: string | null; headSha: string | null; receivedAt: string }[] }): AiReview {
  const latest = new Map<string, { state: string; headSha: string | null; at: string }>();
  for (const review of pullRequest.reviews ?? []) {
    const state = (review.state ?? '').toLowerCase();
    if (!review.reviewer || !['approved', 'changes_requested', 'request_changes', 'dismissed'].includes(state)) continue;
    const known = latest.get(review.reviewer);
    if (!known || known.at <= review.receivedAt) latest.set(review.reviewer, { state, headSha: review.headSha, at: review.receivedAt });
  }
  const approvers = [...latest.entries()].filter(([, review]) => review.state === 'approved' && (!review.headSha || !pullRequest.headSha || review.headSha === pullRequest.headSha)).sort((a, b) => a[1].at.localeCompare(b[1].at)).map(([name]) => name);
  if (approvers.length) return { state: 'approved', by: approvers };
  if (pullRequest.mergedBy) return { state: 'merged', by: pullRequest.mergedBy };
  return { state: 'pending' };
}

function trailerValue(value: string, max: number): string {
  return singleLine(value).slice(0, max);
}

/**
 * The git trailers of an AI-written commit: `Assisted-by: <agent>[:<model>]` (the Linux kernel's tag for AI-assisted
 * contributions), `Agent-Trace-Id` when an Agent Trace record exists, and `Unfold-Session` with the session's page.
 * There is never a `Signed-off-by` or `Co-authored-by`: an agent certifies nothing and has no address of its own.
 */
export function aiCommitTrailers(marking: AiCommitMarking): string[] {
  const agent = trailerValue(marking.agent, 80).replace(/\s+/g, '-') || 'unknown-agent';
  const model = marking.model ? trailerValue(marking.model, 120).replace(/\s+/g, '-') : '';
  const session = safeUrl(marking.session);
  return [
    `Assisted-by: ${model ? `${agent}:${model}` : agent}`,
    ...(marking.agentTrace && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(marking.agentTrace) ? [`Agent-Trace-Id: ${marking.agentTrace}`] : []),
    ...(session ? [`Unfold-Session: ${session}`] : []),
  ];
}

const trailerLine = /^[A-Za-z0-9][A-Za-z0-9-]*: \S/;

/** A commit message with trailers added: into its last paragraph when that already holds only trailers, else as a new paragraph. A trailer the message already has is not added twice. */
export function withTrailers(message: string, trailers: readonly string[]): string {
  const body = message.replace(/\s+$/, '');
  const paragraphs = body.split(/\n{2,}/);
  const last = paragraphs.length > 1 ? paragraphs.at(-1)!.split('\n') : [];
  const fresh = trailers.filter(trailer => !body.split('\n').includes(trailer));
  if (!fresh.length) return `${body}\n`;
  const joinsLast = last.length > 0 && last.every(line => trailerLine.test(line));
  return `${body}${joinsLast ? '\n' : '\n\n'}${fresh.join('\n')}\n`;
}
