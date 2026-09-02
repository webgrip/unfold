package worker

import (
	"strings"
	"testing"

	"github.com/webgrip/ploeg/pkg/harness"
)

// The delivery contract is forge-specific in exactly two ways — what the thing
// is called and how you open one — and both are load-bearing. An agent told to
// open a "pull request" via a Forgejo endpoint against GitLab opens nothing,
// reports success, and the Shift then has no change request for the reviewer to
// comment on. That failure is silent all the way to a human.

func gitlabSpec(role string) harness.TaskSpec {
	spec := specFor(testCfg("main"), testItem(), "agent/vik-585", "ploeg-abc123def456")
	spec.Role = role
	spec.Repo = harness.RepoRef{
		Forge:      harness.ForgeGitLab,
		ForgeURL:   "https://gitlab.com",
		Owner:      "acme",
		Name:       "internal/widgets",
		BaseBranch: "main",
	}
	return spec
}

func TestComposePrompt_GitLabWriterOpensAMergeRequest(t *testing.T) {
	task := ComposePrompt(gitlabSpec("builder"), true, "", true)

	for _, want := range []string{
		"open a merge request",
		// The subgroup path, encoded. Three segments, not two.
		"https://gitlab.com/api/v4/projects/acme%2Finternal%2Fwidgets/merge_requests",
		"PRIVATE-TOKEN",
		"Do NOT merge the merge request",
	} {
		if !strings.Contains(task, want) {
			t.Errorf("GitLab writer prompt missing %q:\n%s", want, task)
		}
	}
	for _, reject := range []string{"Forgejo", "/api/v1/repos/", "pull request"} {
		if strings.Contains(task, reject) {
			t.Errorf("GitLab writer prompt still says %q:\n%s", reject, task)
		}
	}
}

// The Forgejo contract must be byte-for-byte what it was. This change is
// additive, and a homelab deployment that never sets a forge must not notice
// it happened.
func TestComposePrompt_ForgejoWriterUnchanged(t *testing.T) {
	task := ComposePrompt(roleSpec("builder", nil), true, "", true)

	for _, want := range []string{
		"open a pull request",
		"via the Forgejo API",
		"/api/v1/repos/webgrip/ploeg/pulls",
		"authenticated as agent-builder",
		"Do NOT merge the pull request",
	} {
		if !strings.Contains(task, want) {
			t.Errorf("Forgejo writer prompt missing %q:\n%s", want, task)
		}
	}
	if strings.Contains(task, "merge request") {
		t.Errorf("Forgejo writer prompt leaked GitLab vocabulary:\n%s", task)
	}
}

// A reader never opens anything, but it is told where its findings will be
// posted and asked not to comment there itself — both of which name the object.
func TestComposePrompt_GitLabReaderUsesMergeRequestVocabulary(t *testing.T) {
	task := ComposePrompt(gitlabSpec("reviewer"), false, "https://gitlab.com/acme/internal/widgets/-/merge_requests/4", true)

	for _, want := range []string{
		"Do not open, update, comment on, or merge a merge request",
		"posted as a comment on this merge request",
		"-/merge_requests/4",
	} {
		if !strings.Contains(task, want) {
			t.Errorf("GitLab reader prompt missing %q:\n%s", want, task)
		}
	}
	if strings.Contains(task, "pull request") {
		t.Errorf("GitLab reader prompt still says pull request:\n%s", task)
	}
}

// The already-open branch of the writer contract is where a second change
// request gets opened by accident, so it has to name the object too.
func TestComposePrompt_GitLabWriterUpdatesExistingMR(t *testing.T) {
	pr := "https://gitlab.com/acme/internal/widgets/-/merge_requests/4"
	task := ComposePrompt(gitlabSpec("builder"), true, pr, true)

	for _, want := range []string{
		"A merge request is ALREADY OPEN on this branch: " + pr,
		"Do NOT open a second merge request",
	} {
		if !strings.Contains(task, want) {
			t.Errorf("GitLab update-existing prompt missing %q:\n%s", want, task)
		}
	}
}
