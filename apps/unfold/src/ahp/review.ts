import { randomUUID } from 'node:crypto';
import type { Engine } from '../engine.ts';
import type { Store } from '../store.ts';
import type { AppConfig, Session, User } from '../types.ts';

type Json = Record<string, any>;
type Origin = { clientId: string; clientSeq: number };
type Sender = { user: User };

/** The changeset operations a candidate that waits for review offers: the workbench's own Accept and Reject, and Request changes. */
export const reviewOperationIds = { accept: 'accept', reject: 'reject', requestChanges: 'request-changes' } as const;
/** What a person decides about a candidate through a question in the session's chat. */
export type ReviewKind = 'rejected' | 'changes';

/** The `choice.offered` fields that make a host choice a review question with one text answer instead of options. */
export type ReviewOffer = { review: ReviewKind; input: 'text'; optional?: boolean; comments?: CandidateComment[] };

/** One comment a person left on a candidate file, from VS Code's agent feedback. `lines` is `12` or `12-14`, absent for a whole file. */
export type CandidateComment = { id: string; path: string; lines?: string; text: string; replies: string[] };

const annotationsSuffix = '/annotations';
const annotationsChannelPattern = /^(unfold|ahp-session):\/([A-Za-z0-9_-]{1,80})\/annotations$/;
const feedbackMeta = 'agentFeedback';
const vscodeFeedbackMeta = 'vscode.agentFeedback';
const workspacePath = /\/workspace\/repository\/(.+)$/;
const annotationActions = new Set(['annotations/set', 'annotations/updated', 'annotations/removed', 'annotations/entrySet', 'annotations/entryRemoved']);
const limits = { annotations: 500, entries: 50, id: 128, uri: 2048, text: 8000, meta: 16_384 };

/** The annotations channel VS Code derives from a session channel: the session URI followed by `/annotations`. */
export const annotationsChannel = (sessionUri: string) => `${sessionUri}${annotationsSuffix}`;

/** The public session id of an annotations channel in either spelling, or undefined for any other URI. */
export function parseAnnotationsChannel(uri: string): { id: string; session: string } | undefined {
  const parsed = annotationsChannelPattern.exec(uri);
  return parsed ? { id: parsed[2], session: `${parsed[1]}:/${parsed[2]}` } : undefined;
}

/** Whether a candidate waits for the person's review in VS Code: the session completed, nobody reviewed it, and no delivery policy hands the review to the forge. */
export function awaitingReview(session: Session, gated: boolean): boolean {
  return session.status === 'completed' && !session.review && !gated;
}

/** The candidate's review operations. Request changes needs a follow-up session, which a task imported from a tracker cannot get here. */
export function reviewOperations(session: Session, gated: boolean): Json[] {
  if (!awaitingReview(session, gated)) return [];
  const operation = (id: string, label: string, description: string, icon: string) => ({ id, label, description, scopes: ['changeset'], icon, status: 'idle' });
  return [
    operation(reviewOperationIds.accept, 'Accept', 'Records your acceptance in the session history, as Accept in the workbench does. Nothing is pushed or merged.', 'check'),
    ...(session.sourceTask ? [] : [operation(reviewOperationIds.requestChanges, 'Request changes…', 'Asks in the session\'s chat what should change. Your answer and your comments on the candidate become the instructions of a new session with the same brief, which waits for you to start it.', 'comment-discussion')]),
    operation(reviewOperationIds.reject, 'Reject…', 'Asks in the session\'s chat why, then records your rejection with that reason, as Reject in the workbench does. Nothing else happens.', 'close'),
  ];
}

const textOf = (value: unknown): string => typeof value === 'string' ? value : value && typeof value === 'object' && typeof (value as Json).markdown === 'string' ? (value as Json).markdown : '';

function pathOf(uri: unknown): string | undefined {
  if (typeof uri !== 'string') return undefined;
  let path: string;
  try { path = decodeURIComponent(new URL(uri).pathname); } catch { return undefined; }
  return workspacePath.exec(path)?.[1] ?? (path.replace(/^\/+/, '') || undefined);
}

function linesOf(range: unknown): string | undefined {
  const start = Number((range as Json)?.start?.line);
  const end = Number((range as Json)?.end?.line);
  if (!Number.isInteger(start) || start < 0) return undefined;
  return Number.isInteger(end) && end > start ? `${start + 1}-${end + 1}` : String(start + 1);
}

/** The comments VS Code attaches to the message it sends when a person submits feedback on the candidate, from either attachment shape it uses. */
export function feedbackComments(message: unknown, annotations: readonly Json[] = []): CandidateComment[] {
  const attachments = Array.isArray((message as Json)?.attachments) ? (message as Json).attachments as Json[] : [];
  const comments = new Map<string, CandidateComment>();
  for (const attachment of attachments) {
    const items = attachment?._meta?.[feedbackMeta]?.feedbackItems;
    if (Array.isArray(items)) for (const item of items) {
      const path = pathOf(item?.resourceUri);
      const text = textOf(item?.text).trim();
      if (typeof item?.id !== 'string' || !path || !text) continue;
      comments.set(item.id, { id: item.id, path, ...(linesOf(item.range) ? { lines: linesOf(item.range) } : {}), text, replies: (Array.isArray(item.replies) ? item.replies : []).map(textOf).map((reply: string) => reply.trim()).filter(Boolean) });
    }
    if (attachment?.type === 'annotations' && Array.isArray(attachment.annotationIds)) for (const id of attachment.annotationIds) {
      const found = annotations.find(annotation => annotation.id === id);
      const comment = found && !comments.has(id) ? annotationComment(found) : undefined;
      if (comment) comments.set(id, comment);
    }
  }
  return [...comments.values()];
}

function annotationComment(annotation: Json): CandidateComment | undefined {
  const entries = Array.isArray(annotation.entries) ? annotation.entries as Json[] : [];
  const path = pathOf(annotation.resource);
  const text = textOf(entries[0]?.text).trim();
  if (!path || !text) return undefined;
  const lines = linesOf(annotation.range);
  return { id: String(annotation.id), path, ...(lines ? { lines } : {}), text, replies: entries.slice(1).map(entry => textOf(entry.text).trim()).filter(Boolean) };
}

/** The open comments on a candidate: annotations that are not resolved and that VS Code has not already sent as feedback. */
export function openComments(annotations: readonly Json[]): CandidateComment[] {
  return annotations.filter(annotation => annotation.resolved !== true && !['submitted', 'resolved'].includes(annotation._meta?.[vscodeFeedbackMeta]?.state)).map(annotationComment).filter((comment): comment is CandidateComment => Boolean(comment));
}

const where = (comment: CandidateComment) => `\`${comment.path}\`${comment.lines ? ` line ${comment.lines}` : ''}`;

/** The comments as a Markdown list, each with the file and lines it is about and its replies. */
export function commentList(comments: readonly CandidateComment[]): string {
  return comments.map(comment => [`- ${where(comment)}: ${comment.text}`, ...comment.replies.map(reply => `  - Reply: ${reply}`)].join('\n')).join('\n');
}

/** The instruction a follow-up session's crew reads: the person's message, then each comment with its file and lines. */
export function changesInstruction(previous: Session, message: string, comments: readonly CandidateComment[]): string {
  return [`Changes were requested on the candidate of the previous session, "${previous.title}".`, message ? `What should change:\n${message}` : '', comments.length ? `Comments on the candidate's files:\n${commentList(comments)}` : ''].filter(Boolean).join('\n\n');
}

function validEntry(entry: unknown): entry is Json {
  const value = entry as Json;
  return Boolean(value) && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= limits.id && textOf(value.text).length <= limits.text && (typeof value.text === 'string' || typeof value.text?.markdown === 'string');
}

const metaFits = (meta: unknown) => meta === undefined || (Boolean(meta) && typeof meta === 'object' && !Array.isArray(meta) && JSON.stringify(meta).length <= limits.meta);

function validAnnotation(annotation: unknown): annotation is Json {
  const value = annotation as Json;
  return Boolean(value) && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= limits.id && typeof value.resource === 'string' && value.resource.length <= limits.uri
    && Array.isArray(value.entries) && value.entries.length >= 1 && value.entries.length <= limits.entries && value.entries.every(validEntry)
    && (value.resolved === undefined || typeof value.resolved === 'boolean') && (value.range === undefined || (value.range && typeof value.range === 'object')) && metaFits(value._meta) && metaFits(value.origin);
}

/** The AHP annotations reducer (`types/channels-annotations/reducer.ts`), with the host's limits. Returns the next list, or why the action is refused. */
export function reduceAnnotations(annotations: readonly Json[], action: Json): Json[] | string {
  const index = annotations.findIndex(annotation => annotation.id === (action.annotation?.id ?? action.annotationId));
  const next = [...annotations];
  switch (action.type) {
    case 'annotations/set': {
      if (!validAnnotation(action.annotation)) return 'An annotation needs an id, a resource and one to fifty entries of text';
      const annotation = { ...action.annotation, resolved: action.annotation.resolved === true };
      if (index < 0) { if (annotations.length >= limits.annotations) return `A candidate keeps at most ${limits.annotations} annotations`; next.push(annotation); } else next[index] = annotation;
      return next;
    }
    case 'annotations/updated': {
      if (index < 0) return next;
      if ((action.resource !== undefined && (typeof action.resource !== 'string' || action.resource.length > limits.uri)) || (action.resolved !== undefined && typeof action.resolved !== 'boolean') || !metaFits(action.origin)) return 'An annotation update changes only its origin, resource, range or resolved state';
      next[index] = { ...next[index], ...(action.origin !== undefined ? { origin: action.origin } : {}), ...(action.resource !== undefined ? { resource: action.resource } : {}), ...(action.range !== undefined ? { range: action.range } : {}), ...(action.resolved !== undefined ? { resolved: action.resolved } : {}) };
      return next;
    }
    case 'annotations/removed': if (index >= 0) next.splice(index, 1); return next;
    case 'annotations/entrySet': {
      if (index < 0) return next;
      if (!validEntry(action.entry)) return 'An entry needs an id and its text';
      const entries = [...next[index].entries];
      const at = entries.findIndex((entry: Json) => entry.id === action.entry.id);
      if (at < 0) { if (entries.length >= limits.entries) return `An annotation keeps at most ${limits.entries} entries`; entries.push(action.entry); } else entries[at] = action.entry;
      next[index] = { ...next[index], entries };
      return next;
    }
    case 'annotations/entryRemoved': {
      if (index < 0) return next;
      next[index] = { ...next[index], entries: next[index].entries.filter((entry: Json) => entry.id !== action.entryId) };
      return next;
    }
    default: return `Unsupported action ${String(action.type)}`;
  }
}

/** What the review needs from the host it runs in: its stores, its authorization and the way it sends actions. */
export type ReviewHost = {
  config: AppConfig;
  store: Store;
  engine: Engine;
  serverSeq: () => number;
  sessionFor: (user: User, uri: string) => Session | undefined;
  engineId: (publicId: string) => string;
  publicId: (engineId: string) => string;
  gated: (session: Session) => boolean;
  mayView: (user: User, ownerId: string) => boolean;
  echo: (sender: Sender, channel: string, action: Json, origin: Origin, audience?: (client: Sender) => boolean) => void;
  openChoice: (session: Session) => Json | undefined;
  claimTurn: (session: Session, turnId: unknown, origin: Origin) => string | undefined;
  claimAnswer: (session: Session, key: string, origin: Origin) => () => void;
  announceSession: (session: Session) => void;
  sessionPage: (session: Session) => string;
  choiceEvents: { offered: string; answered: string; reported: string };
};

const questions: Record<ReviewKind, { title: string; question: string; explanation: (comments: number) => string; asked: string }> = {
  rejected: {
    title: 'Reject this candidate',
    question: 'Why do you reject this outcome?',
    explanation: () => 'Say what is wrong. Your reason is recorded with the rejection in the session history, as Reject in the workbench records it. Nothing runs and nothing is pushed. Skip the question to leave the candidate waiting for your review.',
    asked: 'Answer the question in the session\'s chat to record the rejection. Nothing is recorded until you do.',
  },
  changes: {
    title: 'Request changes',
    question: 'What should change?',
    explanation: comments => `Unfold records your answer as a rejection with that reason, then creates a new session with this session's brief, crew, repository, placement and budget. Your answer${comments ? ` and the ${comments === 1 ? 'comment' : `${comments} comments`} on the candidate` : ''} become its instructions. It waits for you to start it, as a new authorization. Skip the question to leave the candidate waiting for your review.`,
    asked: 'Answer the question in the session\'s chat to request the changes. Nothing is recorded until you do.',
  },
};

/** Reject, Request changes and comments on a candidate from VS Code's Changes view, through the same review path and owner checks as the browser. */
export class CandidateReview {
  private readonly host: ReviewHost;
  private readonly answering = new Set<string>();

  constructor(host: ReviewHost) { this.host = host; }

  /** The annotations a candidate's reviewers left, kept with the session. */
  annotations(session: Session): Json[] { return this.host.store.getSecret<Json[]>(`ahp-annotations:${session.id}`) ?? []; }

  /** The annotations summary of a session's state, under the annotations channel in the client's spelling of the session. */
  annotationsSummary(session: Session, sessionUri: string): Json {
    const annotations = this.annotations(session);
    if (!annotations.length) return {};
    return { annotations: { resource: annotationsChannel(sessionUri), annotationCount: annotations.length, entryCount: annotations.reduce((count, annotation) => count + (Array.isArray(annotation.entries) ? annotation.entries.length : 0), 0) } };
  }

  /** The snapshot of a session's annotations channel. */
  annotationsSnapshot(user: User, channel: string): Json {
    const parsed = parseAnnotationsChannel(channel);
    const session = parsed ? this.host.sessionFor(user, parsed.session) : undefined;
    if (!session) throw Object.assign(new Error('Session not found'), { status: 404 });
    return { resource: channel, state: { annotations: this.annotations(session) }, fromSeq: this.host.serverSeq() };
  }

  /** Applies a client's annotation action, keeps the result with the session and echoes it to everyone who may see the session. Returns why it is refused. */
  dispatchAnnotation(client: Sender, channel: string, action: Json, origin: Origin): string | undefined {
    const parsed = parseAnnotationsChannel(channel);
    const session = parsed ? this.host.sessionFor(client.user, parsed.session) : undefined;
    if (!session) return 'Session not found';
    if (!annotationActions.has(String(action.type))) return `Unsupported action ${String(action.type)}`;
    if (client.user.role === 'viewer') return 'Viewers cannot comment on a candidate';
    const next = reduceAnnotations(this.annotations(session), action);
    if (typeof next === 'string') return next;
    this.host.store.setSecret(`ahp-annotations:${session.id}`, next);
    this.host.echo(client, channel, action, origin, other => this.host.mayView(other.user, session.ownerId));
    return undefined;
  }

  /** The comments a message carries when VS Code sends a person's feedback on the candidate, or undefined for any other message. */
  feedback(session: Session, message: unknown): CandidateComment[] | undefined {
    const comments = feedbackComments(message, this.annotations(session));
    return comments.length ? comments : undefined;
  }

  /** The instruction text for feedback sent while the crew can still read it: the person's own words and each comment with its file and lines. */
  feedbackInstruction(message: unknown, comments: readonly CandidateComment[]): string {
    const typed = String((message as Json)?.text ?? '').trim();
    const own = typed && !typed.startsWith('/') ? `${typed}\n\n` : '';
    return `${own}Comments on the change:\n${commentList(comments)}`;
  }

  /** Opens the Request changes question for feedback sent on a candidate that waits for review, in the person's own turn. Returns false when the candidate takes no change request. */
  submitFeedback(client: Sender, session: Session, comments: CandidateComment[], action: Json, origin: Origin): string | undefined | false {
    if (!reviewOperations(session, this.host.gated(session)).some(operation => operation.id === reviewOperationIds.requestChanges)) return false;
    if (client.user.role === 'viewer') return 'Viewers cannot review a candidate';
    const turnId = this.host.claimTurn(session, action.turnId, origin);
    this.offer(session, client.user, 'changes', comments, { text: `Comments on the candidate:\n${commentList(comments)}`, ...(turnId ? { turnId } : {}) });
    return undefined;
  }

  /** Starts Reject or Request changes from the Changes view: a question in the session's chat, whose answer records the review. */
  ask(user: User, session: Session, operationId: string): Json {
    const kind: ReviewKind = operationId === reviewOperationIds.reject ? 'rejected' : 'changes';
    const open = this.host.openChoice(session);
    if (open?.review) return { message: open.review === kind ? questions[kind].asked : `Answer or skip the open question in the session's chat first: ${open.title}.` };
    this.offer(session, user, kind, kind === 'changes' ? openComments(this.annotations(session)) : []);
    return { message: questions[kind].asked };
  }

  private offer(session: Session, user: User, kind: ReviewKind, comments: CandidateComment[], extra: Json = {}): void {
    const detail = comments.length ? `Comments on the candidate that go with it:\n${commentList(comments)}` : '';
    const offer: ReviewOffer = { review: kind, input: 'text', ...(kind === 'changes' && comments.length ? { optional: true, comments } : {}) };
    this.host.store.appendEvent(session.id, this.host.choiceEvents.offered, user.id, { choiceId: randomUUID(), title: questions[kind].title, question: questions[kind].question, explanation: questions[kind].explanation(comments.length), detail, options: [], ...offer, ...extra });
  }

  /** Records the answer to a review question through the engine's review path and reports the result in the same turn. Returns why the answer is refused. */
  async answer(client: Sender, session: Session, offered: Json, action: Json, origin: Origin): Promise<string | undefined> {
    const choiceId = String(offered.choiceId);
    const kind = offered.review as ReviewKind;
    if (this.answering.has(choiceId)) return 'This question is already being answered';
    const accepted = action.response === 'accept' && action.cancelled !== true;
    const submitted = accepted && action.answers && typeof action.answers === 'object' ? action.answers as Json : undefined;
    const message = String(submitted?.['0']?.value?.value ?? '').trim();
    const comments = (Array.isArray(offered.comments) ? offered.comments : []) as CandidateComment[];
    const originKey = action.cancelled === true ? 'cancel' : `request:${choiceId}`;
    const answered = (data: Json) => this.host.store.appendEvent(session.id, this.host.choiceEvents.answered, client.user.id, { choiceId, option: kind, response: accepted ? 'accept' : 'cancel', ...(submitted ? { answers: submitted } : {}), ...data });
    if (!accepted) {
      this.host.claimAnswer(session, originKey, origin);
      answered({ reply: 'Nothing was recorded. The candidate still waits for your review.', ...(action.cancelled === true ? { cancelled: true } : {}) });
      return undefined;
    }
    if (client.user.role === 'viewer') return 'Viewers cannot review a candidate';
    if (!message && (kind === 'rejected' || !comments.length)) return kind === 'rejected' ? 'Say why you reject this outcome, so the next attempt can use it.' : 'Say what should change.';
    this.answering.add(choiceId);
    const release = this.host.claimAnswer(session, originKey, origin);
    try {
      if (kind === 'rejected') {
        this.host.engine.review(session.id, { decision: 'rejected', note: message }, client.user);
        answered({ reply: `Rejected by ${client.user.name}. The reason is in the session history; nothing else happens.` });
        return undefined;
      }
      const note = (message || `Requested changes in ${comments.length === 1 ? 'one comment' : `${comments.length} comments`} on the candidate.`).slice(0, 2000);
      const { next } = await this.host.engine.requestChanges(session.id, { note, instructions: [changesInstruction(session, message, comments)] }, client.user);
      this.host.announceSession(next);
      const page = this.host.sessionPage(next);
      answered({ sessionId: next.id, reply: `Recorded your request for changes as a rejection, with your reason in the session history. Created a new session, **${next.title}**, with this session's brief, repository, crew, placement and budget; ${comments.length ? 'your answer and the comments are' : 'your answer is'} its instruction. It is in the Agents window's session list${page ? ` and on [its session page](${page})` : ''}, and waits for you: send it a message or start it on its session page. This session stays as it is.` });
      return undefined;
    } catch (error) {
      release();
      this.answering.delete(choiceId);
      this.host.store.appendEvent(session.id, this.host.choiceEvents.reported, client.user.id, { choiceId, reply: `${questions[kind].title} did not work: ${error instanceof Error ? error.message : 'the call failed.'} The question is still open.`, closes: false });
      throw error;
    }
  }

  /** Whether a `session/configChanged` action only sets VS Code's Agent Merge state, which this host maps onto the candidate's review. */
  handlesConfig(action: Json): boolean {
    const config = action.config;
    return action.type === 'session/configChanged' && action.replace !== true && Boolean(config) && typeof config === 'object' && Object.keys(config).length === 1 && Object.hasOwn(config, 'agentMerge');
  }

  /**
   * VS Code's Agent Merge for an Unfold session. Enabling it accepts a candidate that waits for review, through the same review
   * path and owner check as Accept; the pull request is still merged on the forge, never from the editor. Returns why it is refused.
   */
  agentMerge(client: Sender, channel: string, session: Session, action: Json, origin: Origin): string | undefined {
    const value = action.config.agentMerge;
    if (value !== undefined && value !== null && (typeof value !== 'object' || Array.isArray(value))) return 'agentMerge must be an object';
    const enabled = value?.enabled === true;
    const accepted = session.review?.decision === 'accepted';
    if (!enabled && accepted) return 'Your acceptance is recorded in the session history and cannot be withdrawn. Merge or close the pull request on the forge.';
    if (enabled && !accepted) {
      if (this.host.gated(session)) return 'Ploeg delivers this session through a pull request. Review and merge it on the forge.';
      if (!awaitingReview(session, false)) return session.review ? `This candidate was ${session.review.decision} by ${session.review.byName}.` : 'Agent Merge accepts a candidate that waits for your review; this session has none yet.';
      this.host.engine.review(session.id, { decision: 'accepted' }, client.user);
    }
    this.host.echo(client, channel, action, origin, other => other.user.id === client.user.id);
    return undefined;
  }

  /** The Agent Merge state VS Code reads from the session's configuration: enabled once the candidate is accepted. */
  configValues(session: Session): Json {
    return session.review?.decision === 'accepted' ? { agentMerge: { enabled: true } } : {};
  }

  /** The branch facts VS Code reads from `_meta.git`: the candidate's branch and the base it is compared with. Nothing about a local checkout. */
  gitMeta(session: Session): Json {
    const repository = this.host.config.repositories.find(repo => repo.id === session.repositoryId);
    if (!session.branch) return {};
    return { git: { branchName: session.branch, ...(repository?.baseBranch ? { baseBranchName: repository.baseBranch } : {}) } };
  }
}
