package worker

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
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

// changeRequest is the one shape both forges are decoded into. Forgejo calls it
// a pull request and GitLab a merge request; they differ in field names and in
// nothing else this code cares about.
type changeRequest struct {
	URL  string
	Head string
	Base string
}

// findPR returns the web URL of an open change request whose head branch
// matches (and whose base matches the target's base branch when configured).
// It queries only the run's own target, so it can never match a request in
// another repo.
//
// This is ground truth, not the primary path: a writing run normally reports
// the URL it opened in its OutcomeReport links, and the Shift engine reads it
// from there. The poll exists for the run that opened one and then died before
// reporting, and for the fix round that needs to find the request its
// predecessor left behind.
func findPR(ref harness.RepoRef, token, branch string) (string, error) {
	var (
		list []changeRequest
		err  error
	)
	switch ref.Dialect() {
	case harness.ForgeGitLab:
		list, err = listGitLabMRs(ref, token, branch)
	case harness.ForgeForgejo:
		list, err = listForgejoPRs(ref, token)
	default:
		// Naming a forge the worker cannot speak is a configuration error, and
		// a loud one: silently falling back to Forgejo would poll a real
		// endpoint on the wrong host and report "no PR" forever.
		return "", fmt.Errorf("unknown forge dialect %q", ref.Forge)
	}
	if err != nil {
		return "", err
	}
	for _, c := range list {
		if prMatches(c.Head, c.Base, branch, ref.BaseBranch) {
			return c.URL, nil
		}
	}
	return "", nil
}

// listForgejoPRs reads open pull requests from the Forgejo/Gitea API.
func listForgejoPRs(ref harness.RepoRef, token string) ([]changeRequest, error) {
	req, err := http.NewRequest("GET",
		fmt.Sprintf("%s/api/v1/repos/%s/%s/pulls?state=open&limit=50", ref.ForgeURL, ref.Owner, ref.Name), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "token "+token)
	var pulls []struct {
		HTMLURL string `json:"html_url"`
		Head    struct {
			Ref string `json:"ref"`
		} `json:"head"`
		Base struct {
			Ref string `json:"ref"`
		} `json:"base"`
	}
	if err := forgeGet(req, &pulls); err != nil {
		return nil, err
	}
	out := make([]changeRequest, 0, len(pulls))
	for _, p := range pulls {
		out = append(out, changeRequest{URL: p.HTMLURL, Head: p.Head.Ref, Base: p.Base.Ref})
	}
	return out, nil
}

// listGitLabMRs reads open merge requests from the GitLab API.
//
// The project is addressed by its URL-ENCODED full path, not by a numeric id:
// resolving an id would need a second round trip, and the path is what the
// claim already carries. url.PathEscape is not enough — GitLab wants the
// slashes themselves percent-encoded, which is what QueryEscape does, and the
// segment is then substituted into the path rather than parsed as one.
//
// source_branch filters server-side, so unlike the Forgejo call this cannot be
// defeated by a repository with more than fifty open merge requests.
func listGitLabMRs(ref harness.RepoRef, token, branch string) ([]changeRequest, error) {
	req, err := http.NewRequest("GET",
		fmt.Sprintf("%s/api/v4/projects/%s/merge_requests?state=opened&source_branch=%s&per_page=50",
			ref.ForgeURL, url.QueryEscape(ref.ProjectPath()), url.QueryEscape(branch)), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("PRIVATE-TOKEN", token)
	var mrs []struct {
		WebURL       string `json:"web_url"`
		SourceBranch string `json:"source_branch"`
		TargetBranch string `json:"target_branch"`
	}
	if err := forgeGet(req, &mrs); err != nil {
		return nil, err
	}
	out := make([]changeRequest, 0, len(mrs))
	for _, m := range mrs {
		out = append(out, changeRequest{URL: m.WebURL, Head: m.SourceBranch, Base: m.TargetBranch})
	}
	return out, nil
}

func forgeGet(req *http.Request, into any) error {
	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%s: HTTP %d", req.URL.Path, resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(into)
}
