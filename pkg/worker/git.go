package worker

import (
	"context"
	"net/url"
	"os/exec"
)

// cloneArgs builds the git clone invocation: a configured base branch is
// cloned explicitly; unset means the repo's default branch — which may be a
// stale stub, so teams should pin baseBranch (VIK-589).
func cloneArgs(cfg Config, cloneURL, cloneDir string) []string {
	args := []string{"clone", "--depth", "50"}
	if cfg.BaseBranch != "" {
		args = append(args, "--branch", cfg.BaseBranch)
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
