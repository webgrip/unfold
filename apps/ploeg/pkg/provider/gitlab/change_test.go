package gitlab

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/webgrip/ploeg/pkg/provider"
)

func TestPullRequestChange_ReadsTitleLabelsDiffsAndCommits(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("PRIVATE-TOKEN") != "tok" {
			t.Errorf("read without the token: %s", r.URL)
		}
		switch r.URL.EscapedPath() {
		case "/api/v4/projects/group%2Fsub%2Fapp/merge_requests/4":
			fmt.Fprint(w, `{"title":"Fix login","description":"closes #3","labels":["hotfix","bug"]}`)
		case "/api/v4/projects/group%2Fsub%2Fapp/merge_requests/4/diffs":
			fmt.Fprint(w, `[{"new_path":"a.go","old_path":"a.go"},{"new_path":"b.go","old_path":"c.go"}]`)
		case "/api/v4/projects/group%2Fsub%2Fapp/merge_requests/4/commits":
			fmt.Fprint(w, `[{"message":"fix login"}]`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	got, err := (&Provider{BaseURL: srv.URL, Token: "tok"}).PullRequestChange(context.Background(), "group/sub/app", 4)
	if err != nil {
		t.Fatal(err)
	}
	want := provider.PullRequestChange{Title: "Fix login", Body: "closes #3", Labels: []string{"hotfix", "bug"},
		Files: []string{"a.go", "b.go", "c.go"}, Commits: []string{"fix login"}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("change = %+v; want %+v", got, want)
	}
}

func TestPullRequestChange_FailsOnAForgeError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "nope", http.StatusForbidden)
	}))
	defer srv.Close()
	if _, err := (&Provider{BaseURL: srv.URL}).PullRequestChange(context.Background(), "group/app", 4); err == nil {
		t.Fatal("a refused read reported no error")
	}
}
