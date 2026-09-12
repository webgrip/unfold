package provider

import "testing"

func TestRepositoryLocatorPinsConfiguredForgeAndCoordinates(t *testing.T) {
	actual, err := RepositoryURL("https://forge.example/", "nested/owner", "repository")
	if err != nil || actual != "https://forge.example/nested/owner/repository.git" {
		t.Fatalf("registered repository: %s %v", actual, err)
	}
	actual, err = RepositoryURL("https://forge.example/", "owner", "nested/repository")
	if err != nil || actual != "https://forge.example/owner/nested/repository.git" {
		t.Fatalf("registered nested repository: %s %v", actual, err)
	}
	for _, tc := range []struct{ base, owner, repo string }{
		{"https://user:secret@forge.example", "owner", "repo"},
		{"https://forge.example", "../owner", "repo"},
		{"https://forge.example", "owner", "../repo"},
		{"https://forge.example", "owner", "repo?token=unsafe"},
		{"https://forge.example", "owner", "repo%2Fother"},
	} {
		if _, err := RepositoryURL(tc.base, tc.owner, tc.repo); err == nil {
			t.Fatalf("unsafe repository coordinate accepted: %+v", tc)
		}
	}
}
