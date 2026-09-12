package provider

import (
	"context"
	"errors"
	"net/url"
	"strings"

	"github.com/webgrip/ploeg/pkg/work"
)

type ExecutionItem struct {
	Item work.WorkItem
	Open bool
}

type ExecutionReader interface {
	TrackerAPIBaseURL() string
	FetchExecutionItem(context.Context, string) (ExecutionItem, error)
}

type ForgeRepositoryLocator interface {
	RepositoryURL(owner, repository string) (string, error)
}

func RepositoryURL(base, owner, repository string) (string, error) {
	u, err := url.Parse(base)
	if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Scheme != "https" && u.Scheme != "http") {
		return "", errors.New("invalid forge repository endpoint")
	}
	for _, segment := range strings.Split(owner+"/"+repository, "/") {
		if segment == "" || segment == "." || segment == ".." || strings.ContainsAny(segment, "/\\?#%\x00") {
			return "", errors.New("invalid repository coordinate")
		}
	}
	u.Path = strings.TrimRight(u.Path, "/") + "/" + owner + "/" + strings.TrimSuffix(repository, ".git") + ".git"
	return u.String(), nil
}
