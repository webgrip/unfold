package worker

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
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
// whose base matches cfg.BaseBranch when configured).
func findPR(cfg Config, branch string) (string, error) {
	req, err := http.NewRequest("GET",
		fmt.Sprintf("%s/api/v1/repos/%s/%s/pulls?state=open&limit=50", cfg.ForgejoURL, cfg.RepoOwner, cfg.RepoName), nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "token "+cfg.BuilderToken)
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
		if prMatches(p.Head.Ref, p.Base.Ref, branch, cfg.BaseBranch) {
			return p.HTMLURL, nil
		}
	}
	return "", nil
}
