package main

import (
	"strings"
	"testing"

	"github.com/webgrip/ploeg/pkg/work"
)

func testItem() work.WorkItem {
	return work.WorkItem{ExternalID: "585", Title: "fix the thing", Description: "<p>details</p>"}
}

func testCfg(base string) config {
	return config{
		RepoOwner:  "webgrip",
		RepoName:   "ploeg",
		BaseBranch: base,
		ForgejoURL: "http://forgejo-http.forgejo.svc.cluster.local:3000",
	}
}

func TestComposeTask_DefaultBaseIsMain(t *testing.T) {
	task := composeTask(testItem(), testCfg(""), "agent/vik-585", "ploeg-abc123def456")
	for _, want := range []string{
		"created from main",
		"NEVER commit to main",
		"base\n  branch main",
	} {
		if !strings.Contains(task, want) {
			t.Errorf("task missing %q:\n%s", want, task)
		}
	}
}

func TestComposeTask_ConfiguredBase(t *testing.T) {
	task := composeTask(testItem(), testCfg("development"), "agent/vik-585", "ploeg-abc123def456")
	for _, want := range []string{
		"created from development",
		"NEVER commit to development",
		"base\n  branch development",
	} {
		if !strings.Contains(task, want) {
			t.Errorf("task missing %q:\n%s", want, task)
		}
	}
	for _, reject := range []string{"from main", "commit to main", "branch main"} {
		if strings.Contains(task, reject) {
			t.Errorf("task still references the default base (%q):\n%s", reject, task)
		}
	}
}

func TestCloneArgs(t *testing.T) {
	got := cloneArgs(testCfg(""), "http://x/repo.git", "/work/dir")
	want := []string{"clone", "--depth", "50", "http://x/repo.git", "/work/dir"}
	assertSlice(t, got, want)

	got = cloneArgs(testCfg("development"), "http://x/repo.git", "/work/dir")
	want = []string{"clone", "--depth", "50", "--branch", "development", "http://x/repo.git", "/work/dir"}
	assertSlice(t, got, want)
}

func assertSlice(t *testing.T, got, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("arg %d: got %q, want %q (full: %v)", i, got[i], want[i], got)
		}
	}
}

func TestPRMatches(t *testing.T) {
	cases := []struct {
		name                             string
		headRef, baseRef, wantHead, base string
		want                             bool
	}{
		{"head match, no base configured", "agent/vik-1", "main", "agent/vik-1", "", true},
		{"head mismatch", "agent/vik-2", "main", "agent/vik-1", "", false},
		{"head+base match", "agent/vik-1", "development", "agent/vik-1", "development", true},
		{"wrong base rejected when configured", "agent/vik-1", "main", "agent/vik-1", "development", false},
	}
	for _, c := range cases {
		if got := prMatches(c.headRef, c.baseRef, c.wantHead, c.base); got != c.want {
			t.Errorf("%s: prMatches(%q,%q,%q,%q) = %v, want %v",
				c.name, c.headRef, c.baseRef, c.wantHead, c.base, got, c.want)
		}
	}
}
