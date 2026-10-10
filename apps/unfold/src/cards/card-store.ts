import type { DatabaseSync } from 'node:sqlite';
import { micros } from './go.ts';
import type { WorkItemFacts } from './facts.ts';
import type { CrackRecord, PullRequestRef, RarityRecord, CardRarityInputs } from './assemble.ts';
import type { Shape } from './playkpi.ts';

/** The first id of a crack Unfold records itself; cracks imported from Ploeg keep Ploeg's lower ids. */
export const firstLocalCrackId = 1_000_000_000;

/** What Unfold recorded about one Work Item's card comment, taken over from Ploeg or published by Unfold. */
export type CardCommentRecord = { workItemId: string; pullRequest: PullRequestRef | null; moment: string; commentId: number | null; image: boolean; publishedAt: string | null; checkedAt: string; origin: 'ploeg' | 'unfold'; adopted: boolean };
/** How the one-time import of Ploeg's card state went. Ploeg v0.2.0-rc.12 no longer offers it, so the record is history. */
export type CardImportRecord = { state: 'pending' | 'running' | 'done' | 'failed' | 'unsupported'; after: string | null; cracks: number; rarities: number; comments: number; shapes: number; attempts: number; message: string; startedAt: string | null; finishedAt: string | null };
/** One audited crack step. */
export type CrackAuditRecord = { crackId: string; cardWorkItemId: string; action: string; actor: string; at: string; detail: Record<string, unknown> };
/** One merged pull request file Unfold has seen in Ploeg's facts, for novelty and crack candidates. */
export type FileTouch = { pullRequestId: string; workItemId: string; team: string; forge: string; repo: string; number: number; path: string; mergedAt: string; mergedBy: string; reverted: boolean };

const crackColumns = ['id', 'team', 'state', 'card_work_item_id', 'bug_work_item_id', 'bug_provider', 'bug_external_id', 'pull_request', 'severity', 'share', 'discovery', 'steward', 'note', 'proposed_by', 'proposed_at', 'confirmed_by', 'confirmed_at', 'dispute_until', 'disputed_by', 'disputed_at', 'dispute_reason', 'resolved_by', 'resolved_at', 'resolution', 'evolved_by', 'evolved_at', 'mend_pull_request', 'mend_number', 'mended_at', 'mended_by', 'mend_by_steward', 'mend_confirmed_at', 'mend_reopened_at', 'origin'] as const;

type Row = Record<string, unknown>;
const text = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));
const json = <T>(value: unknown): T | null => (value === null || value === undefined ? null : JSON.parse(String(value)) as T);

function crackFromRow(row: Row): CrackRecord {
  return {
    id: String(row.id), team: String(row.team), state: row.state as CrackRecord['state'], cardWorkItemId: String(row.card_work_item_id), bugWorkItemId: String(row.bug_work_item_id),
    bug: { provider: String(row.bug_provider), externalId: String(row.bug_external_id) }, pullRequest: json<PullRequestRef>(row.pull_request),
    severity: text(row.severity), share: text(row.share), discovery: text(row.discovery), steward: String(row.steward ?? ''), note: text(row.note),
    proposedBy: String(row.proposed_by), proposedAt: String(row.proposed_at), confirmedBy: text(row.confirmed_by), confirmedAt: text(row.confirmed_at), disputeUntil: text(row.dispute_until),
    disputedBy: text(row.disputed_by), disputedAt: text(row.disputed_at), disputeReason: text(row.dispute_reason), resolvedBy: text(row.resolved_by), resolvedAt: text(row.resolved_at),
    resolution: text(row.resolution) as CrackRecord['resolution'], evolvedBy: text(row.evolved_by), evolvedAt: text(row.evolved_at),
    mendPullRequest: json<PullRequestRef>(row.mend_pull_request), mendNumber: row.mend_number === null || row.mend_number === undefined ? null : Number(row.mend_number),
    mendedAt: text(row.mended_at), mendedBy: text(row.mended_by), mendBySteward: row.mend_by_steward === null || row.mend_by_steward === undefined ? null : Boolean(row.mend_by_steward),
    mendConfirmedAt: text(row.mend_confirmed_at), mendReopenedAt: text(row.mend_reopened_at),
  };
}

function crackValues(c: CrackRecord, origin: string): (string | number | null)[] {
  return [Number(c.id), c.team, c.state, c.cardWorkItemId, c.bugWorkItemId, c.bug.provider, c.bug.externalId, c.pullRequest ? JSON.stringify(c.pullRequest) : null, c.severity, c.share, c.discovery, c.steward, c.note,
    c.proposedBy, c.proposedAt, c.confirmedBy, c.confirmedAt, c.disputeUntil, c.disputedBy, c.disputedAt, c.disputeReason, c.resolvedBy, c.resolvedAt, c.resolution, c.evolvedBy, c.evolvedAt,
    c.mendPullRequest ? JSON.stringify(c.mendPullRequest) : null, c.mendNumber, c.mendedAt, c.mendedBy, c.mendBySteward === null ? null : c.mendBySteward ? 1 : 0, c.mendConfirmedAt, c.mendReopenedAt, origin];
}

/** Unfold's own Run card state (root ADR-0030) in its SQLite store: cracks and their audit trail, frozen rarities, frozen play shapes, card comments, the import marker kept as history and the indexes it keeps of Ploeg's facts. Every write is additive to the existing schema. */
export class CardStore {
  readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
    db.exec(`
      CREATE TABLE IF NOT EXISTS card_cracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT, team TEXT NOT NULL, state TEXT NOT NULL CHECK (state IN ('proposed','confirmed','disputed','unlinked','evolved')),
        card_work_item_id TEXT NOT NULL, bug_work_item_id TEXT NOT NULL, bug_provider TEXT NOT NULL, bug_external_id TEXT NOT NULL, pull_request TEXT,
        severity TEXT CHECK (severity IN ('S1','S2','S3','S4')), share TEXT CHECK (share IN ('primary','contributing')), discovery TEXT CHECK (discovery IN ('self','discovered','concealed')),
        steward TEXT NOT NULL DEFAULT '', note TEXT, proposed_by TEXT NOT NULL, proposed_at TEXT NOT NULL, confirmed_by TEXT, confirmed_at TEXT, dispute_until TEXT,
        disputed_by TEXT, disputed_at TEXT, dispute_reason TEXT, resolved_by TEXT, resolved_at TEXT, resolution TEXT CHECK (resolution IN ('upheld','unlinked')),
        evolved_by TEXT, evolved_at TEXT, mend_pull_request TEXT, mend_number INTEGER, mended_at TEXT, mended_by TEXT, mend_by_steward INTEGER, mend_confirmed_at TEXT, mend_reopened_at TEXT,
        origin TEXT NOT NULL CHECK (origin IN ('ploeg','unfold')),
        UNIQUE (card_work_item_id, bug_work_item_id), CHECK (card_work_item_id <> bug_work_item_id),
        CHECK (state = 'evolved' OR (severity IS NOT NULL AND share IS NOT NULL AND discovery IS NOT NULL)));
      CREATE INDEX IF NOT EXISTS card_cracks_by_bug ON card_cracks(bug_work_item_id);
      CREATE TABLE IF NOT EXISTS card_crack_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, crack_id INTEGER NOT NULL, card_work_item_id TEXT NOT NULL, action TEXT NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL, detail TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS card_crack_audit_by_card ON card_crack_audit(card_work_item_id, id);
      CREATE TABLE IF NOT EXISTS card_rarity (
        work_item_id TEXT PRIMARY KEY, formula TEXT NOT NULL, revealed_tier TEXT NOT NULL, predicted_tier TEXT NOT NULL, score REAL NOT NULL, predicted_score REAL NOT NULL, percentile REAL,
        cohort_target TEXT NOT NULL, cohort_quarter TEXT NOT NULL, cohort_size INTEGER NOT NULL, inputs TEXT NOT NULL, revealed_at TEXT NOT NULL, recorded_at TEXT NOT NULL, checked_at TEXT NOT NULL,
        origin TEXT NOT NULL CHECK (origin IN ('ploeg','unfold')));
      CREATE INDEX IF NOT EXISTS card_rarity_cohort ON card_rarity(formula, cohort_target, cohort_quarter);
      CREATE TABLE IF NOT EXISTS card_play_shapes (pull_request_id TEXT PRIMARY KEY, work_item_id TEXT NOT NULL, shape TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS card_comments (work_item_id TEXT PRIMARY KEY, pull_request TEXT, moment TEXT NOT NULL DEFAULT '', comment_id INTEGER, image INTEGER NOT NULL DEFAULT 0, published_at TEXT, checked_at TEXT NOT NULL, origin TEXT NOT NULL CHECK (origin IN ('ploeg','unfold')), adopted INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS card_import (id TEXT PRIMARY KEY, state TEXT NOT NULL, after TEXT, cracks INTEGER NOT NULL DEFAULT 0, rarities INTEGER NOT NULL DEFAULT 0, comments INTEGER NOT NULL DEFAULT 0, shapes INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, message TEXT NOT NULL DEFAULT '', started_at TEXT, finished_at TEXT);
      CREATE TABLE IF NOT EXISTS card_work_items (work_item_id TEXT PRIMARY KEY, provider TEXT NOT NULL, external_id TEXT NOT NULL, team TEXT NOT NULL, title TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL, activity_at TEXT NOT NULL, seen_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS card_work_items_by_external ON card_work_items(provider, external_id, team);
      CREATE TABLE IF NOT EXISTS card_epic_links (work_item_id TEXT NOT NULL, provider TEXT NOT NULL, epic_external_id TEXT NOT NULL, team TEXT NOT NULL, first_seen_at TEXT NOT NULL, removed_at TEXT, PRIMARY KEY (work_item_id, provider, epic_external_id));
      CREATE INDEX IF NOT EXISTS card_epic_links_by_epic ON card_epic_links(provider, epic_external_id, team);
      CREATE TABLE IF NOT EXISTS card_file_touches (pull_request_id TEXT NOT NULL, path TEXT NOT NULL, work_item_id TEXT NOT NULL, team TEXT NOT NULL, forge TEXT NOT NULL, repo TEXT NOT NULL, repo_name TEXT NOT NULL, number INTEGER NOT NULL, merged_at_us INTEGER NOT NULL, merged_at TEXT NOT NULL, merged_by TEXT NOT NULL, reverted INTEGER NOT NULL, PRIMARY KEY (pull_request_id, path));
      CREATE INDEX IF NOT EXISTS card_file_touches_by_path ON card_file_touches(repo, path, merged_at_us);
    `);
    const sequence = this.db.prepare("SELECT seq FROM sqlite_sequence WHERE name='card_cracks'").get() as { seq: number } | undefined;
    if (!sequence) this.db.prepare("INSERT INTO sqlite_sequence(name, seq) VALUES ('card_cracks', ?)").run(firstLocalCrackId - 1);
  }

  transaction<T>(fn: () => T): T {
    if (this.db.isTransaction) return fn();
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  crack(id: string): CrackRecord | null {
    const row = this.db.prepare('SELECT * FROM card_cracks WHERE id=?').get(Number(id)) as Row | undefined;
    return row ? crackFromRow(row) : null;
  }
  cracksOnCard(cardId: string): CrackRecord[] { return (this.db.prepare('SELECT * FROM card_cracks WHERE card_work_item_id=? ORDER BY id').all(cardId) as Row[]).map(crackFromRow); }
  cracksOfBug(bugId: string): CrackRecord[] { return (this.db.prepare('SELECT * FROM card_cracks WHERE bug_work_item_id=? ORDER BY id').all(bugId) as Row[]).map(crackFromRow); }
  /** Every attribution where the Work Item is the bug or the card, oldest first, at most 100. */
  cracksOf(workItemId: string): CrackRecord[] { return (this.db.prepare('SELECT * FROM card_cracks WHERE bug_work_item_id=? OR card_work_item_id=? ORDER BY id LIMIT 100').all(workItemId, workItemId) as Row[]).map(crackFromRow); }
  crackFor(cardId: string, bugId: string): CrackRecord | null {
    const row = this.db.prepare('SELECT * FROM card_cracks WHERE card_work_item_id=? AND bug_work_item_id=?').get(cardId, bugId) as Row | undefined;
    return row ? crackFromRow(row) : null;
  }
  /** Cards a login co-signed by mending another steward's confirmed crack. */
  cosignedCards(logins: string[]): string[] {
    if (!logins.length) return [];
    const rows = this.db.prepare(`SELECT DISTINCT card_work_item_id AS id FROM card_cracks WHERE lower(mended_by) IN (${logins.map(() => '?').join(',')}) AND state IN ('confirmed','disputed') AND confirmed_at IS NOT NULL AND mended_at IS NOT NULL AND mend_number IS NOT NULL AND COALESCE(mend_by_steward,0)=0`).all(...logins.map(l => l.toLowerCase())) as { id: string }[];
    return rows.map(row => String(row.id));
  }
  /** Inserts a new crack with a local id and returns it. Throws on a duplicate card and bug pair. */
  insertCrack(c: Omit<CrackRecord, 'id'>): CrackRecord {
    const values = crackValues({ ...c, id: '0' } as CrackRecord, 'unfold').slice(1);
    const result = this.db.prepare(`INSERT INTO card_cracks(${crackColumns.slice(1).join(',')}) VALUES(${crackColumns.slice(1).map(() => '?').join(',')})`).run(...values);
    return this.crack(String(result.lastInsertRowid))!;
  }
  updateCrack(id: string, fields: Partial<Record<(typeof crackColumns)[number], string | number | null>>): void {
    const keys = Object.keys(fields);
    if (!keys.length) return;
    this.db.prepare(`UPDATE card_cracks SET ${keys.map(k => `${k}=?`).join(',')} WHERE id=?`).run(...keys.map(k => fields[k as keyof typeof fields] ?? null), Number(id));
  }
  audit(entry: CrackAuditRecord): void {
    this.db.prepare('INSERT INTO card_crack_audit(crack_id,card_work_item_id,action,actor,at,detail) VALUES(?,?,?,?,?,?)').run(Number(entry.crackId), entry.cardWorkItemId, entry.action, entry.actor, entry.at, JSON.stringify(entry.detail));
  }
  auditTrail(cardId: string): CrackAuditRecord[] {
    return (this.db.prepare('SELECT * FROM card_crack_audit WHERE card_work_item_id=? ORDER BY id').all(cardId) as Row[]).map(row => ({ crackId: String(row.crack_id), cardWorkItemId: String(row.card_work_item_id), action: String(row.action), actor: String(row.actor), at: String(row.at), detail: JSON.parse(String(row.detail)) }));
  }
  /** Mends whose window has not settled yet. */
  openMends(): CrackRecord[] { return (this.db.prepare('SELECT * FROM card_cracks WHERE mended_at IS NOT NULL AND mend_confirmed_at IS NULL AND mend_reopened_at IS NULL').all() as Row[]).map(crackFromRow); }

  storedRarity(workItemId: string): RarityRecord | null {
    const row = this.db.prepare('SELECT * FROM card_rarity WHERE work_item_id=?').get(workItemId) as Row | undefined;
    return row ? this.rarityFromRow(row) : null;
  }
  private rarityFromRow(row: Row): RarityRecord {
    return { workItemId: String(row.work_item_id), formula: String(row.formula), revealedTier: String(row.revealed_tier), predictedTier: String(row.predicted_tier), score: Number(row.score), predictedScore: Number(row.predicted_score), percentile: row.percentile === null ? null : Number(row.percentile), cohortTarget: String(row.cohort_target), cohortQuarter: String(row.cohort_quarter), cohortSize: Number(row.cohort_size), inputs: JSON.parse(String(row.inputs)) as CardRarityInputs, revealedAt: String(row.revealed_at), recordedAt: String(row.recorded_at), checkedAt: String(row.checked_at) };
  }
  cohort(formula: string, target: string, quarter: string, exclude: string): number[] {
    return (this.db.prepare('SELECT score FROM card_rarity WHERE formula=? AND cohort_target=? AND cohort_quarter=? AND work_item_id<>?').all(formula, target, quarter, exclude) as { score: number }[]).map(row => Number(row.score));
  }
  /** Stores a frozen rarity unless the Work Item already has one; returns the row that stands. */
  freezeRarity(row: RarityRecord, origin: 'ploeg' | 'unfold'): { record: RarityRecord; inserted: boolean } {
    const result = this.db.prepare('INSERT INTO card_rarity(work_item_id,formula,revealed_tier,predicted_tier,score,predicted_score,percentile,cohort_target,cohort_quarter,cohort_size,inputs,revealed_at,recorded_at,checked_at,origin) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(work_item_id) DO NOTHING')
      .run(row.workItemId, row.formula, row.revealedTier, row.predictedTier, Math.round(row.score * 10) / 10, Math.round(row.predictedScore * 10) / 10, row.percentile === null ? null : Math.round(row.percentile * 10) / 10, row.cohortTarget, row.cohortQuarter, row.cohortSize, JSON.stringify(row.inputs), row.revealedAt, row.recordedAt, row.checkedAt, origin);
    return { record: this.storedRarity(row.workItemId)!, inserted: Number(result.changes) > 0 };
  }

  playShape(pullRequestId: string): Shape | null {
    const row = this.db.prepare('SELECT shape FROM card_play_shapes WHERE pull_request_id=?').get(pullRequestId) as { shape: string } | undefined;
    return row ? JSON.parse(row.shape) as Shape : null;
  }
  comment(workItemId: string): CardCommentRecord | null {
    const row = this.db.prepare('SELECT * FROM card_comments WHERE work_item_id=?').get(workItemId) as Row | undefined;
    return row ? { workItemId: String(row.work_item_id), pullRequest: json<PullRequestRef>(row.pull_request), moment: String(row.moment), commentId: row.comment_id === null ? null : Number(row.comment_id), image: Boolean(row.image), publishedAt: text(row.published_at), checkedAt: String(row.checked_at), origin: row.origin as 'ploeg' | 'unfold', adopted: Boolean(row.adopted) } : null;
  }
  saveComment(c: CardCommentRecord): void {
    this.db.prepare(`INSERT INTO card_comments(work_item_id,pull_request,moment,comment_id,image,published_at,checked_at,origin,adopted) VALUES(?,?,?,?,?,?,?,?,?)
      ON CONFLICT(work_item_id) DO UPDATE SET pull_request=excluded.pull_request, moment=excluded.moment, comment_id=excluded.comment_id, image=excluded.image, published_at=excluded.published_at, checked_at=excluded.checked_at, origin=excluded.origin, adopted=excluded.adopted`)
      .run(c.workItemId, c.pullRequest ? JSON.stringify(c.pullRequest) : null, c.moment, c.commentId, c.image ? 1 : 0, c.publishedAt, c.checkedAt, c.origin, c.adopted ? 1 : 0);
  }
  markCommentChecked(workItemId: string, at: string): void {
    this.db.prepare("INSERT INTO card_comments(work_item_id,checked_at,origin) VALUES(?,?,'unfold') ON CONFLICT(work_item_id) DO UPDATE SET checked_at=excluded.checked_at").run(workItemId, at);
  }
  /** Work Items with a comment record not checked since `before`, the longest-unchecked first. */
  commentCandidates(before: string, limit: number): string[] {
    return (this.db.prepare('SELECT work_item_id AS id FROM card_comments WHERE checked_at<? ORDER BY checked_at, work_item_id LIMIT ?').all(before, limit) as { id: string }[]).map(row => String(row.id));
  }

  /** The recorded result of the one-time import of Ploeg's card state (Ploeg ADR-0079), kept as history; `pending` when none was recorded. */
  importState(): CardImportRecord {
    const row = this.db.prepare("SELECT * FROM card_import WHERE id='ploeg-legacy'").get() as Row | undefined;
    if (!row) return { state: 'pending', after: null, cracks: 0, rarities: 0, comments: 0, shapes: 0, attempts: 0, message: '', startedAt: null, finishedAt: null };
    return { state: row.state as CardImportRecord['state'], after: text(row.after), cracks: Number(row.cracks), rarities: Number(row.rarities), comments: Number(row.comments), shapes: Number(row.shapes), attempts: Number(row.attempts), message: String(row.message), startedAt: text(row.started_at), finishedAt: text(row.finished_at) };
  }
  /** Records what a facts document says about other cards: the Work Item, its tracker parents and its merged files. */
  observe(facts: WorkItemFacts, now: string): void {
    const item = facts.workItem;
    this.transaction(() => {
      this.db.prepare(`INSERT INTO card_work_items(work_item_id,provider,external_id,team,title,state,created_at,activity_at,seen_at) VALUES(?,?,?,?,?,?,?,?,?)
        ON CONFLICT(work_item_id) DO UPDATE SET provider=excluded.provider, external_id=excluded.external_id, team=excluded.team, title=excluded.title, state=excluded.state, activity_at=excluded.activity_at, seen_at=excluded.seen_at`)
        .run(item.id, item.provider, item.externalId, item.team, item.title.slice(0, 4096), item.state, item.createdAt, facts.activityAt, now);
      this.db.prepare('DELETE FROM card_epic_links WHERE work_item_id=?').run(item.id);
      for (const e of item.epics) this.db.prepare('INSERT OR REPLACE INTO card_epic_links(work_item_id,provider,epic_external_id,team,first_seen_at,removed_at) VALUES(?,?,?,?,?,?)').run(item.id, e.provider, e.externalId, item.team, e.firstSeenAt, e.removedAt);
      for (const pr of facts.pullRequests) {
        this.db.prepare('DELETE FROM card_file_touches WHERE pull_request_id=?').run(pr.id);
        if (pr.state !== 'merged' || pr.mergedAt === null || pr.filesCapturedAt === null) continue;
        for (const f of pr.files) this.db.prepare('INSERT OR REPLACE INTO card_file_touches(pull_request_id,path,work_item_id,team,forge,repo,repo_name,number,merged_at_us,merged_at,merged_by,reverted) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(pr.id, f.path, item.id, item.team, pr.forge, `${pr.owner}/${pr.repo}`.toLowerCase(), `${pr.owner}/${pr.repo}`, pr.number, micros(pr.mergedAt), pr.mergedAt, pr.mergedBy ?? '', pr.reverts.length > 0 ? 1 : 0);
      }
    });
  }
  workItem(id: string): { id: string; provider: string; externalId: string; team: string; title: string; state: string; createdAt: string } | null {
    const row = this.db.prepare('SELECT * FROM card_work_items WHERE work_item_id=?').get(id) as Row | undefined;
    return row ? { id: String(row.work_item_id), provider: String(row.provider), externalId: String(row.external_id), team: String(row.team), title: String(row.title), state: String(row.state), createdAt: String(row.created_at) } : null;
  }
  workItemByExternal(provider: string, externalId: string, team: string): { id: string; title: string } | null {
    const row = this.db.prepare('SELECT work_item_id, title FROM card_work_items WHERE provider=? AND external_id=? AND team=? ORDER BY CAST(work_item_id AS INTEGER) LIMIT 1').get(provider, externalId, team) as Row | undefined;
    return row ? { id: String(row.work_item_id), title: String(row.title) } : null;
  }
  epicMembers(provider: string, epicExternalId: string, team: string): string[] {
    return (this.db.prepare('SELECT work_item_id AS id FROM card_epic_links WHERE provider=? AND epic_external_id=? AND team=? AND removed_at IS NULL').all(provider, epicExternalId, team) as { id: string }[]).map(row => String(row.id));
  }
  /** Whether a merged pull request of another Work Item touched `path` in `repo` (lowercased) at or after `from` and before `until` (epoch microseconds). */
  touchedBefore(repo: string, path: string, from: number, until: number, exclude: string): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM card_file_touches WHERE repo=? AND path=? AND merged_at_us>=? AND merged_at_us<? AND work_item_id<>? LIMIT 1').get(repo, path, from, until, exclude));
  }
  /** Merged files of a Team's other Work Items in the given repositories and paths, merged after `since` and at or before `until`. */
  touchesFor(team: string, exclude: string, keys: { forge: string; repo: string; path: string }[], since: number, until: number): FileTouch[] {
    const out: FileTouch[] = [];
    for (const key of keys) {
      const rows = this.db.prepare('SELECT * FROM card_file_touches WHERE team=? AND work_item_id<>? AND forge=? AND repo=? AND path=? AND merged_at_us>? AND merged_at_us<=?').all(team, exclude, key.forge, key.repo, key.path, since, until) as Row[];
      for (const row of rows) out.push({ pullRequestId: String(row.pull_request_id), workItemId: String(row.work_item_id), team: String(row.team), forge: String(row.forge), repo: String(row.repo_name), number: Number(row.number), path: String(row.path), mergedAt: String(row.merged_at), mergedBy: String(row.merged_by), reverted: Boolean(row.reverted) });
    }
    return out;
  }
  /** How many Work Items and merged files the indexes hold. */
  indexSize(): { workItems: number; files: number } {
    const items = this.db.prepare('SELECT count(*) AS n FROM card_work_items').get() as { n: number };
    const files = this.db.prepare('SELECT count(*) AS n FROM card_file_touches').get() as { n: number };
    return { workItems: Number(items.n), files: Number(files.n) };
  }
}
