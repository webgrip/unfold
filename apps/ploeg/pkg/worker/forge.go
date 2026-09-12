package worker

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/webgrip/ploeg/pkg/harness"
)

var errUnsupportedForge = errors.New("unsupported forge dialect")

type changeRequest struct {
	URL        string
	HeadBranch string
	BaseBranch string
}

func isRunChangeRequest(cr changeRequest, runBranch, requiredBase string) bool {
	if cr.HeadBranch != runBranch {
		return false
	}
	return requiredBase == "" || cr.BaseBranch == requiredBase
}

func findOpenChangeRequest(ref harness.RepoRef, token, runBranch string) (string, error) {
	var (
		open []changeRequest
		err  error
	)
	switch ref.Dialect() {
	case harness.ForgeForgejo:
		open, err = listForgejoPullRequests(ref, token)
	case harness.ForgeGitLab:
		open, err = listGitLabMergeRequests(ref, token, runBranch)
	default:
		return "", fmt.Errorf("%w: %q", errUnsupportedForge, ref.Forge)
	}
	if err != nil {
		return "", err
	}
	for _, cr := range open {
		if isRunChangeRequest(cr, runBranch, ref.BaseBranch) {
			return cr.URL, nil
		}
	}
	return "", nil
}

func listForgejoPullRequests(ref harness.RepoRef, token string) ([]changeRequest, error) {
	req, err := http.NewRequest(http.MethodGet,
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
	if err := getJSON(req, &pulls); err != nil {
		return nil, err
	}
	open := make([]changeRequest, 0, len(pulls))
	for _, p := range pulls {
		open = append(open, changeRequest{URL: p.HTMLURL, HeadBranch: p.Head.Ref, BaseBranch: p.Base.Ref})
	}
	return open, nil
}

func listGitLabMergeRequests(ref harness.RepoRef, token, sourceBranch string) ([]changeRequest, error) {
	req, err := http.NewRequest(http.MethodGet,
		fmt.Sprintf("%s/api/v4/projects/%s/merge_requests?state=opened&source_branch=%s&per_page=50",
			ref.ForgeURL, url.QueryEscape(ref.ProjectPath()), url.QueryEscape(sourceBranch)), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("PRIVATE-TOKEN", token)

	var merges []struct {
		WebURL       string `json:"web_url"`
		SourceBranch string `json:"source_branch"`
		TargetBranch string `json:"target_branch"`
	}
	if err := getJSON(req, &merges); err != nil {
		return nil, err
	}
	open := make([]changeRequest, 0, len(merges))
	for _, m := range merges {
		open = append(open, changeRequest{URL: m.WebURL, HeadBranch: m.SourceBranch, BaseBranch: m.TargetBranch})
	}
	return open, nil
}

func getJSON(req *http.Request, into any) error {
	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%s %s: HTTP %d", req.Method, req.URL.Path, resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(into)
}
