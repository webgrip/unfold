import { rfc3339, seconds } from './go.ts';
import { equalFold, toLower } from './rarity-go.ts';

/** One review recorded for a play from a forge webhook; `at` is epoch milliseconds (Ploeg `playkpi.Review`). */
export type Review = { reviewer: string; state: string; headSha?: string; at: number };

/** One stored conversation event of a play; kind is comment, review_comment, review, push, force_push, ready or draft, and `at` is epoch milliseconds (Ploeg `playkpi.Event`). */
export type PlayEvent = { kind: string; actor?: string; at: number; state?: string; headSha?: string };

/** A comment on the pull request. */
export const kindComment = 'comment';
/** An inline review comment. */
export const kindReviewComment = 'review_comment';
/** A submitted review. */
export const kindReview = 'review';
/** A push of new commits. */
export const kindPush = 'push';
/** A force push. */
export const kindForcePush = 'force_push';
/** The pull request left draft. */
export const kindReady = 'ready';
/** The pull request became a draft. */
export const kindDraft = 'draft';

/** One stored attempt of a CI job or check; times are epoch milliseconds (Ploeg `playkpi.Job`). */
export type Job = { name: string; status: string; startedAt?: number | null; completedAt?: number | null; queuedSeconds?: number | null; attempt: number };

/** One stored CI run on one head commit; status is success, failure, error, cancelled, skipped, pending or running, and times are epoch milliseconds (Ploeg `playkpi.Run`). */
export type Run = {
  id: string;
  sha: string;
  workflow?: string;
  status: string;
  createdAt?: number | null;
  startedAt?: number | null;
  completedAt?: number | null;
  jobs?: readonly Job[] | null;
};

/** What Ploeg stored about one pull request (Ploeg `playkpi.Play`); an absent field is Go's zero value and times are epoch milliseconds. activityCapturedAt is null until a forge activity read succeeded, ciCapturedAt until a CI read did; headSha is the merged head of a merged play and the current head otherwise. */
export type Play = {
  openedAt?: number | null;
  author?: string;
  draft?: boolean | null;
  mergedAt?: number | null;
  headSha?: string;
  reviews?: readonly Review[] | null;
  activityCapturedAt?: number | null;
  activityTruncated?: boolean;
  events?: readonly PlayEvent[] | null;
  commits?: number | null;
  firstCommitAt?: number | null;
  forcePushes?: number | null;
  ciCapturedAt?: number | null;
  ciSource?: string;
  ciTruncated?: boolean;
  runs?: readonly Run[] | null;
};

/** When a play moved from opened to merged and how its review went, serialized as Ploeg's `playkpi.Timeline` (ADR-0058). */
export type Timeline = {
  openedAt: string | null;
  readyAt: string | null;
  firstFeedbackAt: string | null;
  firstApprovalAt: string | null;
  lastApprovalAt: string | null;
  mergedAt: string | null;
  toFirstFeedbackSeconds: number | null;
  toFirstApprovalSeconds: number | null;
  approvalToMergeSeconds: number | null;
  openToMergeSeconds: number | null;
  reviewRounds: number;
  comments: number | null;
  reviewers: number;
  responseSeconds: number | null;
  commits: number | null;
  firstCommitAt: string | null;
  forcePushes: number | null;
  codingSeconds: number | null;
  truncated: boolean;
  capturedAt: string | null;
};

/** How far apart, in milliseconds, a webhook's record of a review and the forge's own timestamp of it may be and still be one review. */
export const sameReviewMs = 2 * 60 * 1000;

type Verdict = { reviewer: string; state: string; at: number };

/** The time an optional instant serializes to, or null. */
export function timeJson(at: number | null | undefined): string | null {
  return at == null ? null : rfc3339(at);
}

/** Whole seconds from `from` to `to`, or null when either is unknown or `to` is earlier. */
export function between(from: number | null | undefined, to: number | null | undefined): number | null {
  if (from == null || to == null || to < from) return null;
  return seconds(to - from);
}

/** Whole seconds from `from` to `to`, never below zero, or null when either is unknown. */
export function sinceReady(from: number | null | undefined, to: number | null | undefined): number | null {
  if (from == null || to == null) return null;
  return Math.max(0, seconds(to - from));
}

/** The median of whole numbers with Go's integer halving, or null for none. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.trunc(sorted.length / 2);
  let m = sorted[mid]!;
  if (sorted.length % 2 === 0) m = Math.trunc((sorted[mid - 1]! + sorted[mid]!) / 2);
  return m;
}

function recorded(verdicts: readonly Verdict[], e: PlayEvent): boolean {
  for (const v of verdicts) {
    const gap = Math.abs(v.at - e.at);
    if (equalFold(v.reviewer, e.actor ?? '') && v.state === (e.state ?? '') && gap <= sameReviewMs) return true;
  }
  return false;
}

function readyAt(p: Play): number | null {
  if (p.openedAt == null) return null;
  const toggles = (p.events ?? []).filter(e => e.kind === kindReady || e.kind === kindDraft);
  let openedDraft = p.draft === true;
  if (toggles.length > 0) openedDraft = toggles[0]!.kind === kindReady;
  if (!openedDraft) return p.openedAt;
  for (const e of toggles) if (e.kind === kindReady) return e.at;
  return null;
}

function responseSeconds(p: Play, verdicts: readonly Verdict[]): number | null {
  const author = p.author ?? '';
  const pushes = (p.events ?? []).filter(e => (e.kind === kindPush || e.kind === kindForcePush) && (author === '' || (e.actor ?? '') === '' || equalFold(e.actor ?? '', author)));
  const waits: number[] = [];
  for (const v of verdicts) {
    if (v.state !== 'changes_requested') continue;
    for (const push of pushes) {
      if (push.at > v.at) {
        waits.push(seconds(push.at - v.at));
        break;
      }
    }
  }
  return median(waits);
}

/** A play's Timeline with its readiness in epoch milliseconds, or null when nothing about its conversation is known. */
export function deriveTimeline(p: Play, human: (login: string) => boolean): { timeline: Timeline; readyAt: number | null } | null {
  const reviews = p.reviews ?? [];
  if (p.openedAt == null && reviews.length === 0 && p.activityCapturedAt == null) return null;
  const author = p.author ?? '';
  const other = (login: string) => human(login) && (author === '' || !equalFold(login, author));
  const captured = p.activityCapturedAt != null;

  const verdicts: Verdict[] = [];
  const rounds = new Set<string>();
  for (const r of reviews) {
    if (human(r.reviewer)) rounds.add(r.headSha ?? '');
    if (other(r.reviewer)) verdicts.push({ reviewer: r.reviewer, state: r.state, at: r.at });
  }

  let comments = 0;
  const feedback: number[] = [];
  for (const e of p.events ?? []) {
    const actor = e.actor ?? '';
    switch (e.kind) {
      case kindReview:
        if (other(actor) && !recorded(verdicts, e)) verdicts.push({ reviewer: actor, state: e.state ?? '', at: e.at });
        break;
      case kindComment:
      case kindReviewComment:
        if (other(actor)) {
          comments++;
          feedback.push(e.at);
        }
        break;
    }
  }
  const reviewers = new Set<string>();
  let firstApproval: number | null = null;
  let lastApproval: number | null = null;
  for (const v of verdicts) {
    feedback.push(v.at);
    reviewers.add(toLower(v.reviewer));
    if (v.state !== 'approved') continue;
    if (firstApproval === null || v.at < firstApproval) firstApproval = v.at;
    if (p.mergedAt != null && v.at > p.mergedAt) continue;
    if (lastApproval === null || v.at > lastApproval) lastApproval = v.at;
  }
  let firstFeedback: number | null = null;
  for (const at of feedback) if (firstFeedback === null || at < firstFeedback) firstFeedback = at;

  const ready = captured ? readyAt(p) : null;
  const firstCommitAt = captured ? (p.firstCommitAt ?? null) : null;
  const openedAt = p.openedAt ?? null;
  const mergedAt = p.mergedAt ?? null;
  const timeline: Timeline = {
    openedAt: timeJson(openedAt),
    readyAt: timeJson(ready),
    firstFeedbackAt: timeJson(firstFeedback),
    firstApprovalAt: timeJson(firstApproval),
    lastApprovalAt: timeJson(lastApproval),
    mergedAt: timeJson(mergedAt),
    toFirstFeedbackSeconds: sinceReady(ready, firstFeedback),
    toFirstApprovalSeconds: sinceReady(ready, firstApproval),
    approvalToMergeSeconds: between(lastApproval, mergedAt),
    openToMergeSeconds: between(openedAt, mergedAt),
    reviewRounds: rounds.size,
    comments: captured ? comments : null,
    reviewers: reviewers.size,
    responseSeconds: captured ? responseSeconds(p, verdicts) : null,
    commits: captured ? (p.commits ?? null) : null,
    firstCommitAt: timeJson(firstCommitAt),
    forcePushes: captured ? (p.forcePushes ?? null) : null,
    codingSeconds: sinceReady(firstCommitAt, ready),
    truncated: p.activityTruncated === true,
    capturedAt: timeJson(p.activityCapturedAt),
  };
  return { timeline, readyAt: ready };
}
