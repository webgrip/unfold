package gitlab

import "github.com/webgrip/ploeg/pkg/provider"

func (p *Provider) RepositoryURL(owner, repository string) (string, error) {
	return provider.RepositoryURL(p.BaseURL, owner, repository)
}
