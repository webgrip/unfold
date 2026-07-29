package vikunja

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http/httptest"
	"testing"

	"github.com/webgrip/ploeg/pkg/provider"
)

const assignedBody = `{
  "event_name": "task.assignee.created",
  "time": "2026-07-23T10:00:00Z",
  "data": {
    "task": {"id": 42, "title": "Wire the lease manager", "priority": 3},
    "assignee": {"username": "Crew-Alpha"}
  }
}`

func sign(secret string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

func TestParseWebhookAssigned(t *testing.T) {
	p := &Provider{Secret: "s3cret", DefaultTeam: "default", TeamMap: map[string]string{"crew-alpha": "alpha"}}

	body := []byte(assignedBody)
	r := httptest.NewRequest("POST", "/webhooks/tracker/vikunja", bytes.NewReader(body))
	r.Header.Set("X-Vikunja-Signature", sign("s3cret", body))

	events, err := p.ParseWebhook(r)
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 1 {
		t.Fatalf("got %d events, want 1", len(events))
	}
	ev := events[0]
	if ev.Kind != provider.TrackerAssigned || ev.ExternalID != "42" || ev.Team != "alpha" {
		t.Fatalf("unexpected event: %+v", ev)
	}
	if ev.Item == nil || ev.Item.Title != "Wire the lease manager" || ev.Item.Priority != 3 {
		t.Fatalf("unexpected item snapshot: %+v", ev.Item)
	}
	// The fixture predates project_id; a payload without it must still parse
	// and simply carry no scope (unresolved target ⇒ env fallback).
	if ev.Scope.ID != "" || ev.Item.ExternalScope != "" {
		t.Errorf("payload without project_id should carry no scope, got %+v", ev.Scope)
	}
}

// project_id is the scope the core resolves a Work Target from. Vikunja sends
// it on task events (verified against the live instance: tasks.project_id, and
// the smoke-test task 611 sits on project 11); encoding/json silently dropped
// it before this field existed.
const assignedWithProjectBody = `{
  "event_name": "task.assignee.created",
  "time": "2026-07-29T10:00:00Z",
  "data": {
    "task": {"id": 611, "project_id": 11, "title": "SMOKE", "priority": 2},
    "assignee": {"username": "copper"}
  }
}`

func TestParseWebhookCarriesProjectScope(t *testing.T) {
	p := &Provider{Secret: "s3cret", DefaultTeam: "default", TeamMap: map[string]string{"copper": "copper"}}
	body := []byte(assignedWithProjectBody)
	r := httptest.NewRequest("POST", "/webhooks/tracker/vikunja", bytes.NewReader(body))
	r.Header.Set("X-Vikunja-Signature", sign("s3cret", body))

	events, err := p.ParseWebhook(r)
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 1 {
		t.Fatalf("got %d events, want 1", len(events))
	}
	ev := events[0]
	if ev.Scope.Kind != "project" || ev.Scope.ID != "11" {
		t.Errorf("scope = %+v, want {project 11}", ev.Scope)
	}
	if ev.Item.ExternalScope != "11" {
		t.Errorf("item.ExternalScope = %q, want 11", ev.Item.ExternalScope)
	}
	// The adapter reports the vendor's container id and nothing else — it must
	// never learn what a repository is (R7).
	if ev.Scope.Name != "" {
		t.Errorf("scope name should stay empty; it is audit-only, never a routing key")
	}
}

func TestParseWebhookRejectsBadSignature(t *testing.T) {
	p := &Provider{Secret: "s3cret"}
	body := []byte(assignedBody)
	r := httptest.NewRequest("POST", "/", bytes.NewReader(body))
	r.Header.Set("X-Vikunja-Signature", sign("wrong-secret", body))
	if _, err := p.ParseWebhook(r); err == nil {
		t.Fatal("expected signature rejection")
	}
}

func TestParseWebhookUnhandledEventDropped(t *testing.T) {
	p := &Provider{DefaultTeam: "alpha"}
	body := []byte(`{"event_name":"task.comment.created","data":{"task":{"id":7,"title":"x"}}}`)
	r := httptest.NewRequest("POST", "/", bytes.NewReader(body))
	events, err := p.ParseWebhook(r)
	if err != nil || events != nil {
		t.Fatalf("want (nil, nil), got (%v, %v)", events, err)
	}
}
