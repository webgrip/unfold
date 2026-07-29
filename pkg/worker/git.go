package worker

import (
	"context"
	"net/url"
	"os/exec"
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
