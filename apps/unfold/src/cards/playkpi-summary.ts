import { goRound } from './go.ts';
import { median, type Timeline } from './playkpi-timeline.ts';
import type { CI } from './playkpi-ci.ts';
import { complexityMethod, sortHotspots, type Complexity, type Hotspot } from './playkpi-complexity.ts';
import { shownHotspots, shownLanguages, topLanguages, type Language, type Shape } from './playkpi-shape.ts';

/** One play's derived figures as a card summarizes them (Ploeg `playkpi.PlayFigures`), oldest play first: the stored Timeline, CI and full Shape as their JSON reads, an absent field counting as Go's zero value; mergedAt is whole epoch microseconds. */
export type PlayFigures = {
  state: string;
  mergedAt?: number | null;
  timeline?: Partial<Timeline> | null;
  ci?: Partial<CI> | null;
  shape?: (Partial<Omit<Shape, 'complexity'>> & { complexity?: Partial<Complexity> | null }) | null;
};

/** Medians over a card's plays, in seconds. */
export type PipelineMedian = { toFirstFeedbackSeconds: number | null; openToMergeSeconds: number | null; responseSeconds: number | null; lastGreenSeconds: number | null };

/** The CI of every play whose CI was read, added up. */
export type PipelineCI = { runs: number; failedRuns: number; reruns: number; minutes: number | null; queueSeconds: number | null };

/** Review and CI across a card's plays, serialized as Ploeg's `playkpi.Pipeline` (ADR-0058). */
export type Pipeline = {
  plays: number;
  toFirstFeedbackSeconds: number | null;
  openToMergeSeconds: number | null;
  reviewRounds: number | null;
  comments: number | null;
  firstPassGreen: boolean | null;
  median: PipelineMedian;
  ci: PipelineCI | null;
};

/** The Shape of a card's merged plays added up, serialized as Ploeg's `playkpi.CardShape` (ADR-0058). */
export type CardShape = {
  plays: number;
  complete: boolean;
  complexity: Complexity | null;
  files: number;
  countedLines: number | null;
  testLines: number | null;
  testRatio: number | null;
  docsTouched: number;
  languages: Language[];
  truncated: boolean;
};

const zeroTime = -62135596800000000;

function pipeline(plays: readonly PlayFigures[]): Pipeline | null {
  let count = 0;
  let toFirstFeedback: number | null = null;
  let firstPassGreen: boolean | null = null;
  let ci: PipelineCI | null = null;
  const feedback: number[] = [];
  const merge: number[] = [];
  const response: number[] = [];
  const green: number[] = [];
  let latest: PlayFigures | null = null;
  let rounds = 0;
  let comments = 0;
  let knownRounds = false;
  let knownComments = false;
  let first = true;
  for (const pf of plays) {
    const t = pf.timeline ?? null;
    const c = pf.ci ?? null;
    if (t === null && c === null) continue;
    count++;
    if (t !== null) {
      if (first) toFirstFeedback = t.toFirstFeedbackSeconds ?? null;
      rounds += t.reviewRounds ?? 0;
      knownRounds = true;
      if (t.comments != null) {
        comments += t.comments;
        knownComments = true;
      }
      if (t.toFirstFeedbackSeconds != null) feedback.push(t.toFirstFeedbackSeconds);
      if (t.openToMergeSeconds != null) merge.push(t.openToMergeSeconds);
      if (t.responseSeconds != null) response.push(t.responseSeconds);
    }
    if (first && c !== null) firstPassGreen = c.firstPassGreen ?? null;
    first = false;
    if (c !== null) {
      ci ??= { runs: 0, failedRuns: 0, reruns: 0, minutes: null, queueSeconds: null };
      ci.runs += c.runs ?? 0;
      ci.failedRuns += c.failedRuns ?? 0;
      ci.reruns += c.reruns ?? 0;
      if (c.minutes != null) ci.minutes = goRound(((ci.minutes ?? 0) + c.minutes) * 10) / 10;
      if (c.queueSeconds != null) ci.queueSeconds = (ci.queueSeconds ?? 0) + c.queueSeconds;
      if (c.lastGreenSeconds != null) green.push(c.lastGreenSeconds);
    }
    if (pf.state === 'merged' && (latest === null || (pf.mergedAt ?? zeroTime) >= (latest.mergedAt ?? zeroTime))) latest = pf;
  }
  if (count === 0) return null;
  return {
    plays: count,
    toFirstFeedbackSeconds: toFirstFeedback,
    openToMergeSeconds: latest?.timeline ? (latest.timeline.openToMergeSeconds ?? null) : null,
    reviewRounds: knownRounds ? rounds : null,
    comments: knownComments ? comments : null,
    firstPassGreen,
    median: { toFirstFeedbackSeconds: median(feedback), openToMergeSeconds: median(merge), responseSeconds: median(response), lastGreenSeconds: median(green) },
    ci,
  };
}

function cardShape(plays: readonly PlayFigures[]): CardShape | null {
  let complete = true;
  let measured = 0;
  let files = 0;
  let docsTouched = 0;
  let truncated = false;
  let lines = 0;
  let tests = 0;
  let linesKnown = true;
  let testsKnown = true;
  let complexityKnown = true;
  let added = 0;
  let removed = 0;
  let maxDepth = 0;
  const hotspots = new Map<string, number>();
  const languages = new Map<string, number>();
  let merged = 0;
  for (const pf of plays) {
    if (pf.state !== 'merged') continue;
    merged++;
    const sh = pf.shape ?? null;
    if (sh === null) {
      complete = false;
      continue;
    }
    measured++;
    files += sh.files ?? 0;
    docsTouched += sh.docsTouched ?? 0;
    truncated = truncated || sh.truncated === true;
    if (sh.countedLines == null) linesKnown = false;
    else lines += sh.countedLines;
    if (sh.testLines == null) testsKnown = false;
    else tests += sh.testLines;
    for (const l of sh.languages ?? []) languages.set(l.name, (languages.get(l.name) ?? 0) + l.lines);
    if (sh.complexity == null) {
      complexityKnown = false;
      continue;
    }
    added += sh.complexity.added ?? 0;
    removed += sh.complexity.removed ?? 0;
    maxDepth = Math.max(maxDepth, sh.complexity.maxDepth ?? 0);
    for (const h of sh.complexity.hotspots ?? []) hotspots.set(h.path, (hotspots.get(h.path) ?? 0) + h.added);
  }
  if (merged === 0 || measured === 0) return null;
  let testLines: number | null = null;
  let testRatio: number | null = null;
  if (testsKnown && linesKnown) {
    testLines = tests;
    const rest = lines - tests;
    if (rest > 0) testRatio = goRound((tests / rest) * 1000) / 1000;
  }
  let complexity: Complexity | null = null;
  if (complexityKnown) {
    const merged: Hotspot[] = [...hotspots].map(([path, n]) => ({ path, added: n }));
    sortHotspots(merged);
    complexity = { method: complexityMethod, added, removed, net: added - removed, maxDepth, hotspots: merged.slice(0, shownHotspots) };
  }
  return {
    plays: measured,
    complete,
    complexity,
    files,
    countedLines: linesKnown ? lines : null,
    testLines,
    testRatio,
    docsTouched,
    languages: topLanguages(languages, shownLanguages),
    truncated,
  };
}

/** A card's Pipeline and CardShape from its plays, as Ploeg's `playkpi.Summarize`; each is null when no play carries the figures it sums. */
export function summarize(plays: readonly PlayFigures[]): [Pipeline | null, CardShape | null] {
  return [pipeline(plays), cardShape(plays)];
}
