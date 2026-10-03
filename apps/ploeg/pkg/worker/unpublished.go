package worker

import (
	"context"
	"fmt"
	"strings"

	"github.com/webgrip/ploeg/pkg/harness"
	"github.com/webgrip/ploeg/pkg/work"
)

const maxNamedUnpublished = 20

type checkoutChanges struct {
	commits []string
	files   []string
}

func (c checkoutChanges) any() bool { return len(c.commits) > 0 || len(c.files) > 0 }

func checkoutStart(ctx context.Context, dir string) (string, error) {
	out, err := runGit(ctx, dir, "", "", "rev-parse", "HEAD")
	if err != nil {
		return "", fmt.Errorf("git rev-parse HEAD: %v: %s", err, tail(out, 400))
	}
	return strings.TrimSpace(string(out)), nil
}

func inspectCheckout(ctx context.Context, dir, start string) (checkoutChanges, error) {
	var changes checkoutChanges
	out, err := runGit(ctx, dir, "", "", "status", "--porcelain", "--untracked-files=all")
	if err != nil {
		return changes, fmt.Errorf("git status: %v: %s", err, tail(out, 400))
	}
	for _, line := range strings.Split(strings.TrimRight(string(out), "\n"), "\n") {
		if len(line) > 3 {
			changes.files = append(changes.files, line[3:])
		}
	}
	out, err = runGit(ctx, dir, "", "", "rev-list", "--oneline", "HEAD", "--branches", "--not", start, "--remotes")
	if err != nil {
		return changes, fmt.Errorf("git rev-list: %v: %s", err, tail(out, 400))
	}
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line != "" {
			changes.commits = append(changes.commits, line)
		}
	}
	return changes, nil
}

func (c checkoutChanges) describe() string {
	var parts []string
	if n := len(c.commits); n > 0 {
		parts = append(parts, fmt.Sprintf("%d commit(s) not on the forge: %s", n, strings.Join(capList(c.commits), "; ")))
	}
	if n := len(c.files); n > 0 {
		parts = append(parts, fmt.Sprintf("%d uncommitted path(s): %s", n, strings.Join(capList(c.files), ", ")))
	}
	return strings.Join(parts, ". ")
}

func capList(xs []string) []string {
	if len(xs) <= maxNamedUnpublished {
		return xs
	}
	return append(append([]string{}, xs[:maxNamedUnpublished]...), fmt.Sprintf("and %d more", len(xs)-maxNamedUnpublished))
}

func guardUnpublishedWork(ctx context.Context, report harness.OutcomeReport, writes bool, dir, start string) harness.OutcomeReport {
	if !writes || report.Outcome != work.OutcomeNoChangeNeeded {
		return report
	}
	stuck := func(summary, reason string) harness.OutcomeReport {
		report.Outcome = work.OutcomeStuck
		report.Summary = summary
		report.StuckReason = reason
		report.Verdict = ""
		return report
	}
	changes, err := inspectCheckout(ctx, dir, start)
	if err != nil {
		return stuck("could not inspect the writer's checkout for unpublished changes", err.Error())
	}
	if !changes.any() {
		return report
	}
	return stuck("the writer changed the checkout but delivered no pull request",
		"the writer reported no change needed, but its checkout differs from "+shortCommit(start)+
			" and nothing reached a pull request. "+changes.describe())
}

func shortCommit(sha string) string {
	if len(sha) > 12 {
		return sha[:12]
	}
	return sha
}
