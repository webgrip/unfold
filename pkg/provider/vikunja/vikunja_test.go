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
