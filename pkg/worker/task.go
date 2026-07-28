package worker

import (
	"fmt"
	"strings"

	"github.com/webgrip/ploeg/pkg/harness"
)

// ComposePrompt renders the task prompt: the ticket plus the dark-factory
// delivery contract (mirrors erfbeeld's agent-run.yml build-mode prompt).
// The prompt is Ploeg's, not the harness's — every adapter delivers this
// same contract in its own native format.
func ComposePrompt(spec harness.TaskSpec) string {
	item := spec.WorkItem
	// Historical default: before baseBranch existed the contract said "main".
	// The clone above used the repo default branch in that case, so keeping
	// "main" only preserves behavior for repos where the two coincide.
	base := spec.Repo.BaseBranch
	if base == "" {
		base = "main"
	}
	var b strings.Builder
	fmt.Fprintf(&b, "# Ticket VIK-%s: %s\n\n", item.ExternalID, item.Title)
	if item.Description != "" {
		fmt.Fprintf(&b, "## Ticket description\n\n%s\n\n", item.Description)
	}
	fmt.Fprintf(&b, `## Delivery contract

- Work on a branch named %[1]s created from %[7]s. NEVER commit to %[7]s.
- Follow AGENTS.md and the repository skills.
- Run the repository's quality gates via docker run against the CI images before opening the PR.
- Every commit message ends with the trailers:
  VIK-%[2]s
  Agent-Trace-Id: %[3]s
- When the work is complete: push the branch and open a pull request with base
  branch %[7]s via the Forgejo API (%[4]s/api/v1/repos/%[5]s/%[6]s/pulls)
  authenticated as agent-builder. Put "VIK-%[2]s" in the PR body.
- Do NOT merge the pull request. A human merges.
- If the ticket cannot be completed, explain why on stderr and exit non-zero.
`, spec.Branch, item.ExternalID, spec.TraceID, spec.Repo.ForgeURL, spec.Repo.Owner, spec.Repo.Name, base)
	return b.String()
}
