package shiftengine

import (
	"context"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/webgrip/ploeg/pkg/store"
	"github.com/webgrip/ploeg/pkg/work"
)

// The blackboard's transport half (ADR-0011). A reading Run returns findings
// in its OutcomeReport; Ploeg puts them where a human is already looking —
// the pull request — and injects them into the next Round's prompt. The agent
// gains no client, tool or credential to take part (R6).
//
// Everything here is best-effort by design: a forge that is down, a Target
// that never resolved, or a Shift with no pull request yet must not stall the
// pipeline or lose an Outcome. Failures are logged, never returned into the
// lifecycle, and never block a state transition (blackboard spec).

// prNumber extracts a pull request number from a forge URL. Forgejo and Gitea
// both end the path with the number; anything else yields 0, which is treated
// as "no PR known" rather than an error.
var prPathRe = regexp.MustCompile(`/(?:pulls?|merge_requests)/(\d+)/?$`)

func prNumber(link string) int {
	m := prPathRe.FindStringSubmatch(strings.TrimSpace(link))
	if m == nil {
		return 0
	}
	n, err := strconv.Atoi(m[1])
	if err != nil {
		return 0
	}
	return n
}

// pullRequest finds the Shift's pull request from what its Runs reported.
// The writer's links carry it; readers do not open one.
func pullRequest(reports []store.RunReport) (link string, number int) {
	for _, r := range reports {
		for _, l := range r.Links {
			if n := prNumber(l); n > 0 {
				link, number = l, n
			}
		}
	}
	return link, number
}

// publishRound posts one comment per reading Run of the round that just
// finished, attributed to its Role.
//
// At-least-once: two evaluators can both observe the same completed Round and
// both publish before one wins the round-advance CAS. A duplicated comment is
// visible and harmless; a missing one loses the review a human is waiting for.
func (e *Engine) publishRound(ctx context.Context, si store.ShiftInfo, reports []store.RunReport, round int) {
	if len(e.Forges) == 0 {
		return
	}
	var pending []store.RunReport
	for _, r := range reports {
		if r.Round == round && strings.TrimSpace(r.Findings) != "" {
			pending = append(pending, r)
		}
	}
	if len(pending) == 0 {
		return
	}

	_, pr := pullRequest(reports)
	if pr == 0 {
		// Round 1 readers routinely run before any pull request exists. Their
		// findings are not lost: they reach the writer through the briefing on
		// its claim, and they stay queryable in agent_runs.
		e.Log.Info("findings not published: no pull request on this shift yet",
			"shift", si.ID, "round", round, "findings", len(pending))
		return
	}

	item, err := e.Store.WorkItem(ctx, si.WorkItemID)
	if err != nil {
		e.Log.Error("findings not published: work item read failed", "shift", si.ID, "err", err)
		return
	}
	if item.Target == nil {
		// ploegd genuinely does not know the repository here — the worker used
		// its env fallback. Publishing to a guess would be worse than not.
		e.Log.Warn("findings not published: work item has no resolved target",
			"shift", si.ID, "work_item", si.WorkItemID)
		return
	}
	fp, ok := e.Forges[item.Target.Forge]
	if !ok {
		e.Log.Warn("findings not published: no provider for forge",
			"forge", item.Target.Forge, "shift", si.ID)
		return
	}

	repo := item.Target.Owner + "/" + item.Target.Repo
	for _, r := range pending {
		if err := fp.Comment(ctx, repo, pr, findingsComment(r)); err != nil {
			e.Log.Error("findings comment failed", "shift", si.ID, "role", r.Role,
				"repo", repo, "pr", pr, "err", err)
			continue
		}
		e.Log.Info("findings published", "shift", si.ID, "role", r.Role,
			"round", r.Round, "repo", repo, "pr", pr)
	}
}

// findingsComment renders one Role's findings for the pull request thread.
// Attribution first: a human scanning the thread needs to know which
// specialist said what before they read the prose.
func findingsComment(r store.RunReport) string {
	var b strings.Builder
	fmt.Fprintf(&b, "### %s — round %d\n\n", r.Role, r.Round)
	if r.Summary != "" {
		fmt.Fprintf(&b, "_%s_\n\n", r.Summary)
	}
	b.WriteString(r.Findings)
	b.WriteString("\n\n<sub>Posted by Ploeg on behalf of the reviewing agent. It could not push to this branch.</sub>")
	return b.String()
}

// notifyHuman closes the loop the factory opens: a Shift that has stopped
// tells the board why, with the pull request to look at. Without this the
// handoff is something a person notices, not something they are told
// (blackboard spec, "a person is asked to merge").
func (e *Engine) notifyHuman(ctx context.Context, si store.ShiftInfo, reason string) {
	if len(e.Trackers) == 0 {
		return
	}
	item, err := e.Store.WorkItem(ctx, si.WorkItemID)
	if err != nil {
		e.Log.Error("tracker write-back skipped: work item read failed", "shift", si.ID, "err", err)
		return
	}
	tp, ok := e.Trackers[item.Provider]
	if !ok {
		e.Log.Warn("tracker write-back skipped: no provider", "provider", item.Provider, "shift", si.ID)
		return
	}

	reports, err := e.Store.RoundReports(ctx, si.ID)
	if err != nil {
		e.Log.Error("tracker write-back: reports read failed", "shift", si.ID, "err", err)
	}
	link, _ := pullRequest(reports)

	var b strings.Builder
	b.WriteString("Ploeg finished working this item.\n\n")
	fmt.Fprintf(&b, "**Outcome:** %s\n", reason)
	if link != "" {
		fmt.Fprintf(&b, "**Pull request:** %s\n", link)
		b.WriteString("\nPlease review and merge — the agents never merge their own work.\n")
	} else {
		b.WriteString("\nNo pull request was opened.\n")
	}
	if n := len(reports); n > 0 {
		fmt.Fprintf(&b, "\n<sub>%d agent run(s) across %d round(s).</sub>", n, si.Round)
	}

	// Write-back failure is logged, never propagated: the Work Item state and
	// the audit rows are already correct, and losing them to a tracker outage
	// would be the worse trade (blackboard spec).
	if err := tp.Comment(ctx, item.ExternalID, b.String()); err != nil {
		e.Log.Error("tracker comment failed", "shift", si.ID, "external_id", item.ExternalID, "err", err)
	}
	if err := tp.SetStatus(ctx, item.ExternalID, work.StateNeedsHuman); err != nil {
		e.Log.Error("tracker status write failed", "shift", si.ID, "external_id", item.ExternalID, "err", err)
	}
}
