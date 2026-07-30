package worker

import (
	"context"
	"net/url"
	"os/exec"
	"strings"
)

// cloneArgs builds the git clone invocation: a configured base branch is
// cloned explicitly; unset means the repo's default branch — which may be a
// stale stub, so a target should pin its base branch (VIK-589).
func cloneArgs(baseBranch, cloneURL, cloneDir string) []string {
	args := []string{"clone", "--depth", "50"}
	if baseBranch != "" {
		args = append(args, "--branch", baseBranch)
	}
	return append(args, cloneURL, cloneDir)
}

// fetchBranchArgs brings the branch under review into a clone that was made
// from the base branch.
//
// A reader used to receive none of the work it was asked to review: the clone
// above is `--depth 50 --branch <base>`, and --depth implies --single-branch,
// so the writer's branch was not in the repository at all — while the review
// prompt claimed "the repository checkout is your working directory, on branch
// <shift branch>". Fetching it as a local ref of the same name keeps the base
// present too, so a reader can diff the two.
func fetchBranchArgs(branch string) []string {
	return []string{"fetch", "--depth", "50", "origin", branch + ":" + branch}
}

// plainURL is the repository URL with NO credentials in it — what a reading
// run's `origin` is reset to, so the clone's remote cannot be pushed to.
func plainURL(base, owner, repo string) (string, error) {
	u, err := url.Parse(base)
	if err != nil {
		return "", err
	}
	u.User = nil
	u.Path = "/" + owner + "/" + repo + ".git"
	return u.String(), nil
}

func authURL(base, user, token, owner, repo string) (string, error) {
	u, err := url.Parse(base)
	if err != nil {
		return "", err
	}
	u.User = url.UserPassword(user, token)
	u.Path = "/" + owner + "/" + repo + ".git"
	return u.String(), nil
}

func runCmd(ctx context.Context, dir, name string, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = dir
	return cmd.CombinedOutput()
}

// scrubSecrets removes forge credentials from the environment handed to a
// READING run's agent.
//
// It matches on VALUE, not on variable name, deliberately: the token reaches
// the pod as AGENT_BUILDER_TOKEN today, but any future variable carrying the
// same string would leak it just as well, and a name list silently rots. A
// writing run is returned unchanged — it has legitimate work to push.
func scrubSecrets(env []string, writes bool, secrets ...string) []string {
	if writes {
		return env
	}
	drop := map[string]bool{}
	for _, s := range secrets {
		if strings.TrimSpace(s) != "" {
			drop[s] = true
		}
	}
	if len(drop) == 0 {
		return env
	}
	out := make([]string, 0, len(env))
	for _, kv := range env {
		if _, val, ok := strings.Cut(kv, "="); ok && drop[val] {
			continue
		}
		out = append(out, kv)
	}
	return out
}
