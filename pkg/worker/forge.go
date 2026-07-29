package worker

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/webgrip/ploeg/pkg/harness"
)

// prMatches reports whether an open PR is the one this run created: the head
// branch must match, and when a base branch is configured the PR must target
// it — an agent opening the PR against the wrong base is not "done" (VIK-589).
func prMatches(headRef, baseRef, wantHead, wantBase string) bool {
	if headRef != wantHead {
		return false
	}
	return wantBase == "" || baseRef == wantBase
}

// findPR returns the html_url of an open PR whose head branch matches (and
// whose base matches the target's base branch when configured). It queries
// only the run's own target, so it can never match a PR in another repo.
func findPR(ref harness.RepoRef, token, branch string) (string, error) {
	req, err := http.NewRequest("GET",
		fmt.Sprintf("%s/api/v1/repos/%s/%s/pulls?state=open&limit=50", ref.ForgeURL, ref.Owner, ref.Name), nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "token "+token)
	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("pulls list: HTTP %d", resp.StatusCode)
	}
	var pulls []struct {
		HTMLURL string `json:"html_url"`
		Head    struct {
			Ref string `json:"ref"`
		} `json:"head"`
		Base struct {
			Ref string `json:"ref"`
		} `json:"base"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&pulls); err != nil {
		return "", err
	}
	for _, p := range pulls {
		if prMatches(p.Head.Ref, p.Base.Ref, branch, ref.BaseBranch) {
			return p.HTMLURL, nil
		}
	}
	return "", nil
}
