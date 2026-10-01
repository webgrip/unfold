package store

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/webgrip/ploeg/pkg/work"
)

// OperatorCard is the Run card of one Work Item (ADR-0046): stored facts
// only, assembled when it is read. A figure nobody reported is left out,
// never zero. Rarity, Grade and Condition are always null and Finish is
// always "matte" until those decisions are made.
type OperatorCard struct {
	WorkItemID  string              `json:"workItemId"`
	Title       string              `json:"title"`
	ExternalRef string              `json:"externalRef,omitempty"`
	URL         string              `json:"url,omitempty"`
	Team        string              `json:"team"`
	Target      *OperatorCardTarget `json:"target"`
	Style       CardStyle           `json:"style"`
	// State is drafting, in_review, merged, closed or withdrawn.
	State     string       `json:"state"`
	Rarity    *string      `json:"rarity"`
	Finish    string       `json:"finish"`
	Grade     *string      `json:"grade"`
	Condition *string      `json:"condition"`
	Steward   *CardSteward `json:"steward"`
	Roster    []CardPerson `json:"roster"`
	Crew      []CardCrew   `json:"crew"`
	Plays     []CardPlay   `json:"plays"`
	Totals    CardTotals   `json:"totals"`
	Events    []CardEvent  `json:"events"`
	// Deployments holds the earliest deploy of each environment across the
	// plays, earliest first (ADR-0047).
	Deployments []CardDeployment `json:"deployments"`
	// Release is when the latest merged play went live, or nil when no play
	// merged or the release environment has not received it yet.
	Release   *CardRelease `json:"release"`
	Demo      bool         `json:"demo"`
	itemState string
	runs      []cardRun
	bots      map[string]bool
}

// CardDeployment is the first deploy of one environment that carried a
// play's merge commit. URL is the pipeline run, when the deploy named one.
type CardDeployment struct {
	Environment     string    `json:"environment"`
	FirstDeployedAt time.Time `json:"firstDeployedAt"`
	SHA             string    `json:"sha"`
	URL             string    `json:"url,omitempty"`
}

// CardRelease is when the card's change went live. Source is deploy when
// the release environment's first deploy of the latest merged play is
// recorded, and merge when the repository has never reported a deploy of
// that environment, so the merge time stands in for it.
type CardRelease struct {
	At          time.Time `json:"at"`
	Source      string    `json:"source"`
	Environment string    `json:"environment"`
}

// CardOptions is what assembling a card takes from configuration.
type CardOptions struct {
	// Bots are forge logins Ploeg acts as; they never appear as a person.
	Bots []string
	// ReleaseEnvironments maps a lowercased "owner/name" to the environment
	// whose first deploy releases a merged change. A repository absent here
	// releases in work.DefaultReleaseEnvironment.
	ReleaseEnvironments map[string]string
}

// OperatorCardTarget is the repository a Work Item's pull requests go to.
type OperatorCardTarget struct {
	Forge string `json:"forge"`
	Owner string `json:"owner"`
	Repo  string `json:"repo"`
}

// CardStyle is the skin and theme of the Work Target's cardStyle
// configuration. Theme is nil when none is set.
type CardStyle struct {
	Skin  string  `json:"skin"`
	Theme *string `json:"theme"`
}

// DefaultCardSkin is the skin of a Work Target without a cardStyle.
const DefaultCardSkin = "vloer-native"

// CardSteward is the person a card names as carrying the Work Item. Source
// is merged_by or approver.
type CardSteward struct {
	Name   string `json:"name"`
	Source string `json:"source"`
}

// CardPerson is a human who acted on the Work Item's pull requests. Roles
// holds merger and reviewer, in that order.
type CardPerson struct {
	Name  string   `json:"name"`
	Roles []string `json:"roles"`
}

// CardCrew is every started Run of one Role. Each figure sums what those
// Runs reported and is left out when none reported it.
type CardCrew struct {
	Role         string   `json:"role"`
	Writes       bool     `json:"writes"`
	Runs         int      `json:"runs"`
	CostUSD      *float64 `json:"costUsd,omitempty"`
	InputTokens  *int64   `json:"inputTokens,omitempty"`
	OutputTokens *int64   `json:"outputTokens,omitempty"`
}

// CardPlay is one pull request opened for the Work Item, as the forge
// reported it. State is left out while the forge has not said.
type CardPlay struct {
	Number         int          `json:"number"`
	URL            string       `json:"url,omitempty"`
	State          string       `json:"state,omitempty"`
	ShiftID        string       `json:"shiftId,omitempty"`
	Branch         string       `json:"branch,omitempty"`
	HeadSHA        string       `json:"headSha,omitempty"`
	MergeCommitSHA string       `json:"mergeCommitSha,omitempty"`
	MergedAt       *time.Time   `json:"mergedAt,omitempty"`
	MergedBy       string       `json:"mergedBy,omitempty"`
	ClosedAt       *time.Time   `json:"closedAt,omitempty"`
	Additions      *int         `json:"additions,omitempty"`
	Deletions      *int         `json:"deletions,omitempty"`
	ChangedFiles   *int         `json:"changedFiles,omitempty"`
	CI             *CardCI      `json:"ci,omitempty"`
	Reviews        []CardReview `json:"reviews"`
	// Deployments holds the first deploy of each environment that carried
	// MergeCommitSHA, earliest first (ADR-0047).
	Deployments []CardDeployment `json:"deployments"`
	openedAt    time.Time
	id          int64
	repo        string
	forge       string
}

// CardCI is the combined commit status Ploeg last read at HeadSHA.
type CardCI struct {
	State      string             `json:"state"`
	Checks     []PullRequestCheck `json:"checks"`
	HeadSHA    string             `json:"headSha,omitempty"`
	CapturedAt time.Time          `json:"capturedAt"`
}

// CardReview is one review the forge reported on a play.
type CardReview struct {
	Reviewer   string    `json:"reviewer"`
	State      string    `json:"state,omitempty"`
	ReceivedAt time.Time `json:"receivedAt"`
	HeadSHA    string    `json:"headSha,omitempty"`
}

// CardTotals sums every started Run of the Work Item. A usage figure sums
// the Runs that reported it and is left out when none did; UsageComplete is
// false when a figure present here, or cost and tokens, misses a started Run.
// CostStatus is reserved while budget is still held, observed when a cost
// was recorded, and not_reported otherwise.
type CardTotals struct {
	CostUSD                  *float64   `json:"costUsd,omitempty"`
	AuthorizedUSD            float64    `json:"authorizedUsd"`
	CostStatus               string     `json:"costStatus"`
	InputTokens              *int64     `json:"inputTokens,omitempty"`
	OutputTokens             *int64     `json:"outputTokens,omitempty"`
	CacheReadInputTokens     *int64     `json:"cacheReadInputTokens,omitempty"`
	CacheCreationInputTokens *int64     `json:"cacheCreationInputTokens,omitempty"`
	Turns                    *int64     `json:"turns,omitempty"`
	ToolCalls                *int64     `json:"toolCalls,omitempty"`
	UsageComplete            bool       `json:"usageComplete"`
	Runs                     int        `json:"runs"`
	FailedRuns               int        `json:"failedRuns"`
	Rounds                   int        `json:"rounds"`
	Shifts                   int        `json:"shifts"`
	FirstRunAt               *time.Time `json:"firstRunAt,omitempty"`
	LastRunAt                *time.Time `json:"lastRunAt,omitempty"`
	RunSeconds               *int64     `json:"runSeconds,omitempty"`
}

// CardEvent is one step of the Work Item's history, oldest first. Kind is
// minted, run_started, run_finished, pr_opened, review, merged, closed or
// withdrawn; Actor is the human who acted, when one did.
type CardEvent struct {
	At     time.Time      `json:"at"`
	Kind   string         `json:"kind"`
	Actor  string         `json:"actor,omitempty"`
	Detail map[string]any `json:"detail"`
}

type cardRun struct {
	id                              int64
	shiftID                         *int64
	role                            string
	round                           int
	writes                          bool
	state                           string
	startedAt, finishedAt           *time.Time
	outcome                         *string
	authorized                      float64
	cost                            *float64
	held                            float64
	links                           []string
	input, output, cacheRead        *int64
	cacheCreation, turns, toolCalls *int64
}

const cardRunLimit = 1000
const cardPlayLimit = 50
const cardEventLimit = 1000

var cardRunQuery = `SELECT r.id, r.shift_id, r.role, r.round, r.writes, r.state, r.started_at, r.finished_at, r.outcome,
	r.authorized::float8, ((` + operatorRunCost + `)::numeric)::float8,
	COALESCE((SELECT h.reserved FROM run_budget_holds h WHERE h.run_token = r.run_token), 0)::float8,
	r.links[1:30],
	(` + operatorUsageCount("r.usage", "inputTokens") + `)::bigint,
	(` + operatorUsageCount("r.usage", "outputTokens") + `)::bigint,
	(` + operatorUsageCount("r.usage", "cacheReadInputTokens") + `)::bigint,
	(` + operatorUsageCount("r.usage", "cacheCreationInputTokens") + `)::bigint,
	(` + operatorUsageCount("r.usage", "turns") + `)::bigint,
	(` + operatorUsageCount("r.usage", "toolCalls") + `)::bigint
	FROM agent_runs r WHERE r.work_item_id = $1 ORDER BY r.id LIMIT $2`

// OperatorCard assembles the Run card of Work Item id from stored facts,
// within teams (nil means every team). Style is left zero for the caller to
// fill from configuration.
func (s *Store) OperatorCard(ctx context.Context, id int64, teams []string, opts CardOptions) (OperatorCard, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return OperatorCard{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	card := OperatorCard{Finish: "matte", Roster: []CardPerson{}, Crew: []CardCrew{}, Plays: []CardPlay{}, Events: []CardEvent{},
		Deployments: []CardDeployment{}, bots: map[string]bool{}}
	for _, b := range opts.Bots {
		card.bots[strings.ToLower(b)] = true
	}
	var provider, externalID, forge, owner, repo string
	err = tx.QueryRow(ctx, `SELECT i.id::text, left(i.title, 4096), i.provider, i.external_id, left(i.url, 4096), i.team, i.state,
		i.target_forge, i.target_owner, i.target_repo
		FROM work_items i WHERE i.id = $1 AND ($2::text[] IS NULL OR i.team = ANY($2))`, id, teams).
		Scan(&card.WorkItemID, &card.Title, &provider, &externalID, &card.URL, &card.Team, &card.itemState, &forge, &owner, &repo)
	if errors.Is(err, pgx.ErrNoRows) {
		return OperatorCard{}, ErrOperatorNotFound
	}
	if err != nil {
		return OperatorCard{}, err
	}
	if provider != "manual" && externalID != "" {
		card.ExternalRef = work.Reference(work.WorkItem{Provider: provider, ExternalID: externalID})
	}
	if owner != "" && repo != "" {
		card.Target = &OperatorCardTarget{Forge: forge, Owner: owner, Repo: repo}
	}
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM shifts WHERE work_item_id = $1`, id).Scan(&card.Totals.Shifts); err != nil {
		return OperatorCard{}, err
	}
	if err := card.loadRuns(ctx, tx, id); err != nil {
		return OperatorCard{}, err
	}
	checkpoints, err := cardCheckpoints(ctx, tx, id)
	if err != nil {
		return OperatorCard{}, err
	}
	if err := card.loadPlays(ctx, tx, id, checkpoints); err != nil {
		return OperatorCard{}, err
	}
	if err := card.loadDeployments(ctx, tx); err != nil {
		return OperatorCard{}, err
	}
	if card.Release, err = card.release(ctx, tx, opts.ReleaseEnvironments); err != nil {
		return OperatorCard{}, err
	}
	withdrawals, err := cardWithdrawals(ctx, tx, id)
	if err != nil {
		return OperatorCard{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return OperatorCard{}, err
	}

	card.Totals = card.totals(card.Totals.Shifts)
	card.Crew = card.crew()
	card.Roster = card.roster()
	card.Steward = card.steward()
	card.State = card.state()
	card.Events = card.events(withdrawals)

	var clean OperatorCard
	raw, err := json.Marshal(card)
	if err != nil {
		return OperatorCard{}, err
	}
	if err := operatorDecode(raw, &clean); err != nil {
		return OperatorCard{}, err
	}
	return clean, nil
}

func (c *OperatorCard) loadRuns(ctx context.Context, tx pgx.Tx, id int64) error {
	rows, err := tx.Query(ctx, cardRunQuery, id, cardRunLimit)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var r cardRun
		if err := rows.Scan(&r.id, &r.shiftID, &r.role, &r.round, &r.writes, &r.state, &r.startedAt, &r.finishedAt, &r.outcome,
			&r.authorized, &r.cost, &r.held, &r.links, &r.input, &r.output, &r.cacheRead, &r.cacheCreation, &r.turns, &r.toolCalls); err != nil {
			return err
		}
		c.runs = append(c.runs, r)
	}
	return rows.Err()
}

type cardCheckpoint struct {
	at  time.Time
	url string
}

func cardCheckpoints(ctx context.Context, tx pgx.Tx, id int64) ([]cardCheckpoint, error) {
	rows, err := tx.Query(ctx, `SELECT created_at, left(pr_url, 4096) FROM checkpoints
		WHERE work_item_id = $1 AND pr_url <> '' ORDER BY created_at, id LIMIT 200`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []cardCheckpoint
	for rows.Next() {
		var cp cardCheckpoint
		if err := rows.Scan(&cp.at, &cp.url); err != nil {
			return nil, err
		}
		out = append(out, cp)
	}
	return out, rows.Err()
}

type cardWithdrawal struct {
	at    time.Time
	actor string
}

func cardWithdrawals(ctx context.Context, tx pgx.Tx, id int64) ([]cardWithdrawal, error) {
	rows, err := tx.Query(ctx, `SELECT at, left(actor, 256) FROM audit_log
		WHERE work_item_id = $1 AND action = 'work_item.withdrawn' ORDER BY id LIMIT 20`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []cardWithdrawal
	for rows.Next() {
		var w cardWithdrawal
		if err := rows.Scan(&w.at, &w.actor); err != nil {
			return nil, err
		}
		out = append(out, w)
	}
	return out, rows.Err()
}

func (c *OperatorCard) loadPlays(ctx context.Context, tx pgx.Tx, id int64, checkpoints []cardCheckpoint) error {
	rows, err := tx.Query(ctx, `SELECT p.id, p.forge, p.repo_owner, p.repo_name, p.number, p.shift_id::text, COALESCE(p.branch, sh.branch, ''),
		COALESCE(p.state, ''), COALESCE(p.head_sha, ''), COALESCE(p.merge_commit_sha, ''), p.merged_at, COALESCE(p.merged_by, ''),
		p.closed_at, p.additions, p.deletions, p.changed_files,
		p.ci_state, p.ci_checks, COALESCE(p.ci_head_sha, ''), p.ci_captured_at, p.first_seen_at
		FROM pull_requests p LEFT JOIN shifts sh ON sh.id = p.shift_id
		WHERE p.work_item_id = $1 ORDER BY p.number, p.id LIMIT $2`, id, cardPlayLimit)
	if err != nil {
		return err
	}
	defer rows.Close()
	var ids []int64
	byID := map[int64]int{}
	for rows.Next() {
		var (
			pid         int64
			owner, name string
			shiftID     *string
			ciState     *string
			ciChecks    []byte
			ciHead      string
			ciAt        *time.Time
			play        CardPlay
		)
		if err := rows.Scan(&pid, &play.forge, &owner, &name, &play.Number, &shiftID, &play.Branch, &play.State, &play.HeadSHA,
			&play.MergeCommitSHA, &play.MergedAt, &play.MergedBy, &play.ClosedAt, &play.Additions, &play.Deletions,
			&play.ChangedFiles, &ciState, &ciChecks, &ciHead, &ciAt, &play.openedAt); err != nil {
			return err
		}
		if shiftID != nil {
			play.ShiftID = *shiftID
		}
		if ciState != nil && ciAt != nil {
			ci := &CardCI{State: *ciState, Checks: []PullRequestCheck{}, HeadSHA: ciHead, CapturedAt: ciAt.UTC()}
			if len(ciChecks) > 0 {
				if err := json.Unmarshal(ciChecks, &ci.Checks); err != nil {
					return err
				}
			}
			play.CI = ci
		}
		play.id, play.repo = pid, owner+"/"+name
		play.Reviews = []CardReview{}
		play.Deployments = []CardDeployment{}
		play.URL, play.openedAt = c.playLink(play, checkpoints)
		byID[pid] = len(c.Plays)
		ids = append(ids, pid)
		c.Plays = append(c.Plays, play)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if len(ids) == 0 {
		return nil
	}
	reviews, err := tx.Query(ctx, `SELECT pull_request_id, left(reviewer, 256), COALESCE(state, ''), COALESCE(head_sha, ''), received_at
		FROM pull_request_reviews WHERE pull_request_id = ANY($1) ORDER BY received_at, id LIMIT 500`, ids)
	if err != nil {
		return err
	}
	defer reviews.Close()
	for reviews.Next() {
		var pid int64
		var r CardReview
		if err := reviews.Scan(&pid, &r.Reviewer, &r.State, &r.HeadSHA, &r.ReceivedAt); err != nil {
			return err
		}
		r.ReceivedAt = r.ReceivedAt.UTC()
		p := &c.Plays[byID[pid]]
		p.Reviews = append(p.Reviews, r)
	}
	return reviews.Err()
}

func (c *OperatorCard) loadDeployments(ctx context.Context, tx pgx.Tx) error {
	if len(c.Plays) == 0 {
		return nil
	}
	byID := make(map[int64]int, len(c.Plays))
	ids := make([]int64, 0, len(c.Plays))
	for i, p := range c.Plays {
		byID[p.id] = i
		ids = append(ids, p.id)
	}
	rows, err := tx.Query(ctx, `SELECT pd.pull_request_id, pd.environment, pd.first_deployed_at, d.sha, COALESCE(left(d.url, 2048), '')
		FROM pull_request_deployments pd JOIN deployments d ON d.id = pd.deployment_id
		WHERE pd.pull_request_id = ANY($1) ORDER BY pd.first_deployed_at, pd.environment LIMIT 500`, ids)
	if err != nil {
		return err
	}
	defer rows.Close()
	seen := map[string]bool{}
	for rows.Next() {
		var pid int64
		var d CardDeployment
		if err := rows.Scan(&pid, &d.Environment, &d.FirstDeployedAt, &d.SHA, &d.URL); err != nil {
			return err
		}
		d.FirstDeployedAt = d.FirstDeployedAt.UTC()
		p := &c.Plays[byID[pid]]
		p.Deployments = append(p.Deployments, d)
		if !seen[d.Environment] {
			seen[d.Environment] = true
			c.Deployments = append(c.Deployments, d)
		}
	}
	return rows.Err()
}

func (c *OperatorCard) latestMerged() *CardPlay {
	var latest *CardPlay
	for i := range c.Plays {
		p := &c.Plays[i]
		if p.State != "merged" {
			continue
		}
		if latest == nil || mergedAt(p).Compare(mergedAt(latest)) >= 0 {
			latest = p
		}
	}
	return latest
}

func mergedAt(p *CardPlay) time.Time {
	if p.MergedAt == nil {
		return time.Time{}
	}
	return *p.MergedAt
}

func (c *OperatorCard) release(ctx context.Context, tx pgx.Tx, environments map[string]string) (*CardRelease, error) {
	play := c.latestMerged()
	if play == nil {
		return nil, nil
	}
	environment := work.DefaultReleaseEnvironment
	if configured, ok := environments[strings.ToLower(play.repo)]; ok && configured != "" {
		environment = configured
	}
	for _, d := range play.Deployments {
		if d.Environment == environment {
			return &CardRelease{At: d.FirstDeployedAt, Source: "deploy", Environment: environment}, nil
		}
	}
	owner, name, ok := splitRepo(play.repo)
	if !ok {
		return nil, nil
	}
	var reported bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM deployments
		WHERE forge = $1 AND repo_owner = lower($2) AND repo_name = lower($3) AND environment = $4)`,
		play.forge, owner, name, environment).Scan(&reported); err != nil {
		return nil, err
	}
	if reported || play.MergedAt == nil {
		return nil, nil
	}
	return &CardRelease{At: play.MergedAt.UTC(), Source: "merge", Environment: environment}, nil
}

var cardPullLink = regexp.MustCompile(`/(?:pulls?|merge_requests)/([0-9]+)/?$`)

func linkNames(link, repo string, number int) bool {
	u, err := url.Parse(link)
	if err != nil {
		return false
	}
	m := cardPullLink.FindStringSubmatch(u.Path)
	if m == nil || m[1] != strconv.Itoa(number) {
		return false
	}
	return strings.Contains(strings.ToLower(u.Path), "/"+strings.ToLower(repo)+"/")
}

func (c *OperatorCard) playLink(p CardPlay, checkpoints []cardCheckpoint) (string, time.Time) {
	link, opened := "", p.openedAt
	for _, cp := range checkpoints {
		if linkNames(cp.url, p.repo, p.Number) {
			if link == "" {
				link = cp.url
			}
			if cp.at.Before(opened) {
				opened = cp.at
			}
		}
	}
	for _, r := range c.runs {
		for _, l := range r.links {
			if !linkNames(l, p.repo, p.Number) {
				continue
			}
			if link == "" {
				link = l
			}
			if r.outcome != nil && *r.outcome == string(work.OutcomePROpened) && r.finishedAt != nil && r.finishedAt.Before(opened) {
				opened = *r.finishedAt
			}
		}
	}
	return link, opened.UTC()
}

func (c *OperatorCard) started() []cardRun {
	var out []cardRun
	for _, r := range c.runs {
		if r.startedAt != nil {
			out = append(out, r)
		}
	}
	return out
}

type usageSum struct {
	total    int64
	reported int
}

func (u *usageSum) add(v *int64) {
	if v != nil {
		u.total += *v
		u.reported++
	}
}

func (u usageSum) value() *int64 {
	if u.reported == 0 {
		return nil
	}
	v := u.total
	return &v
}

func (c *OperatorCard) totals(shifts int) CardTotals {
	t := CardTotals{Shifts: shifts, CostStatus: "not_reported", UsageComplete: true}
	runs := c.started()
	t.Runs = len(runs)
	var cost float64
	var costs int
	var held bool
	var in, out, cacheRead, cacheCreation, turns, toolCalls usageSum
	rounds := map[[2]int64]bool{}
	var seconds int64
	var finished int
	for _, r := range runs {
		t.AuthorizedUSD += r.authorized
		if r.cost != nil {
			cost += *r.cost
			costs++
		}
		if r.held > 0 {
			held = true
		}
		in.add(r.input)
		out.add(r.output)
		cacheRead.add(r.cacheRead)
		cacheCreation.add(r.cacheCreation)
		turns.add(r.turns)
		toolCalls.add(r.toolCalls)
		if r.shiftID != nil {
			rounds[[2]int64{*r.shiftID, int64(r.round)}] = true
		}
		if r.state == "finished" && r.outcome != nil &&
			(*r.outcome == string(work.OutcomeFailed) || *r.outcome == string(work.OutcomeStuck)) {
			t.FailedRuns++
		}
		if t.FirstRunAt == nil || r.startedAt.Before(*t.FirstRunAt) {
			at := r.startedAt.UTC()
			t.FirstRunAt = &at
		}
		last := *r.startedAt
		if r.finishedAt != nil {
			last = *r.finishedAt
			if d := r.finishedAt.Sub(*r.startedAt); d > 0 {
				seconds += int64(d / time.Second)
			}
			finished++
		}
		if t.LastRunAt == nil || last.After(*t.LastRunAt) {
			at := last.UTC()
			t.LastRunAt = &at
		}
	}
	t.Rounds = len(rounds)
	if finished > 0 {
		t.RunSeconds = &seconds
	}
	if costs > 0 {
		t.CostUSD = &cost
	}
	switch {
	case held:
		t.CostStatus = "reserved"
	case costs > 0:
		t.CostStatus = "observed"
	}
	t.InputTokens, t.OutputTokens = in.value(), out.value()
	t.CacheReadInputTokens, t.CacheCreationInputTokens = cacheRead.value(), cacheCreation.value()
	t.Turns, t.ToolCalls = turns.value(), toolCalls.value()
	if costs < len(runs) || in.reported < len(runs) || out.reported < len(runs) {
		t.UsageComplete = false
	}
	for _, u := range []usageSum{cacheRead, cacheCreation, turns, toolCalls} {
		if u.reported > 0 && u.reported < len(runs) {
			t.UsageComplete = false
		}
	}
	return t
}

func (c *OperatorCard) crew() []CardCrew {
	type key struct {
		role   string
		writes bool
	}
	type acc struct {
		crew    CardCrew
		cost    float64
		costs   int
		in, out usageSum
	}
	var order []key
	byKey := map[key]*acc{}
	for _, r := range c.started() {
		k := key{r.role, r.writes}
		a := byKey[k]
		if a == nil {
			a = &acc{crew: CardCrew{Role: r.role, Writes: r.writes}}
			byKey[k] = a
			order = append(order, k)
		}
		a.crew.Runs++
		if r.cost != nil {
			a.cost += *r.cost
			a.costs++
		}
		a.in.add(r.input)
		a.out.add(r.output)
	}
	out := make([]CardCrew, 0, len(order))
	for _, k := range order {
		a := byKey[k]
		if a.costs > 0 {
			cost := a.cost
			a.crew.CostUSD = &cost
		}
		a.crew.InputTokens, a.crew.OutputTokens = a.in.value(), a.out.value()
		out = append(out, a.crew)
	}
	return out
}

func (c *OperatorCard) human(name string) bool {
	return name != "" && !c.bots[strings.ToLower(name)]
}

func (c *OperatorCard) roster() []CardPerson {
	roles := map[string]map[string]bool{}
	mark := func(name, role string) {
		if !c.human(name) {
			return
		}
		if roles[name] == nil {
			roles[name] = map[string]bool{}
		}
		roles[name][role] = true
	}
	for _, p := range c.Plays {
		mark(p.MergedBy, "merger")
		for _, r := range p.Reviews {
			mark(r.Reviewer, "reviewer")
		}
	}
	names := make([]string, 0, len(roles))
	for name := range roles {
		names = append(names, name)
	}
	sort.Strings(names)
	out := make([]CardPerson, 0, len(names))
	for _, name := range names {
		person := CardPerson{Name: name, Roles: []string{}}
		for _, role := range []string{"merger", "reviewer"} {
			if roles[name][role] {
				person.Roles = append(person.Roles, role)
			}
		}
		out = append(out, person)
	}
	return out
}

func (c *OperatorCard) steward() *CardSteward {
	for i := len(c.Plays) - 1; i >= 0; i-- {
		if p := c.Plays[i]; p.State == "merged" && c.human(p.MergedBy) {
			return &CardSteward{Name: p.MergedBy, Source: "merged_by"}
		}
	}
	var approver *CardReview
	for i := range c.Plays {
		for j := range c.Plays[i].Reviews {
			r := &c.Plays[i].Reviews[j]
			if r.State == "approved" && c.human(r.Reviewer) && (approver == nil || !r.ReceivedAt.Before(approver.ReceivedAt)) {
				approver = r
			}
		}
	}
	if approver == nil {
		return nil
	}
	return &CardSteward{Name: approver.Reviewer, Source: "approver"}
}

func (c *OperatorCard) state() string {
	if c.itemState == string(work.StateWithdrawn) {
		return "withdrawn"
	}
	if len(c.Plays) == 0 {
		return "drafting"
	}
	merged := false
	for _, p := range c.Plays {
		switch p.State {
		case "open", "":
			return "in_review"
		case "merged":
			merged = true
		}
	}
	if c.Plays[len(c.Plays)-1].State == "merged" || (merged && c.itemState == string(work.StateDone)) {
		return "merged"
	}
	return "closed"
}

func (c *OperatorCard) events(withdrawals []cardWithdrawal) []CardEvent {
	var out []CardEvent
	add := func(at time.Time, kind, actor string, detail map[string]any) {
		if !c.human(actor) {
			actor = ""
		}
		out = append(out, CardEvent{At: at.UTC(), Kind: kind, Actor: actor, Detail: detail})
	}
	runs := c.started()
	first := -1
	for i, r := range runs {
		if first < 0 || r.startedAt.Before(*runs[first].startedAt) {
			first = i
		}
	}
	if first >= 0 {
		add(*runs[first].startedAt, "minted", "", map[string]any{"runId": strconv.FormatInt(runs[first].id, 10)})
	}
	for _, r := range runs {
		runID := strconv.FormatInt(r.id, 10)
		add(*r.startedAt, "run_started", "", map[string]any{"runId": runID, "role": r.role, "round": r.round, "writes": r.writes})
		if r.finishedAt != nil {
			detail := map[string]any{"runId": runID, "role": r.role}
			if r.outcome != nil {
				detail["outcome"] = *r.outcome
			}
			add(*r.finishedAt, "run_finished", "", detail)
		}
	}
	for _, p := range c.Plays {
		add(p.openedAt, "pr_opened", "", map[string]any{"number": p.Number})
		for _, r := range p.Reviews {
			detail := map[string]any{"number": p.Number}
			if r.State != "" {
				detail["state"] = r.State
			}
			add(r.ReceivedAt, "review", r.Reviewer, detail)
		}
		if p.State == "merged" && p.MergedAt != nil {
			add(*p.MergedAt, "merged", p.MergedBy, map[string]any{"number": p.Number})
		}
		if p.State == "closed" && p.ClosedAt != nil {
			add(*p.ClosedAt, "closed", "", map[string]any{"number": p.Number})
		}
	}
	for _, w := range withdrawals {
		actor, source := "", "tracker"
		if rest, ok := strings.CutPrefix(w.actor, "operator:"); ok {
			source = "operator"
			if _, person, ok := strings.Cut(rest, ":"); ok {
				actor = person
			}
		}
		add(w.at, "withdrawn", actor, map[string]any{"source": source})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].At.Before(out[j].At) })
	if len(out) > cardEventLimit {
		out = out[:cardEventLimit]
	}
	if out == nil {
		out = []CardEvent{}
	}
	return out
}
