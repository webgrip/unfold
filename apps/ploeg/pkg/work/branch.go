package work

import "strings"

// Branch derives a tracker item's work branch. Vikunja items, and items with
// no recorded provider, keep the deployed agent/vik-<id> form byte for byte;
// every other tracker gets agent/<provider>-<id> with characters outside
// [A-Za-z0-9_-] replaced by '-'.
func Branch(item WorkItem) string {
	if item.Provider == "" || item.Provider == "vikunja" {
		return "agent/vik-" + item.ExternalID
	}
	return "agent/" + refSafe(item.Provider) + "-" + refSafe(item.ExternalID)
}

func refSafe(s string) string {
	return strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '_', r == '-':
			return r
		}
		return '-'
	}, s)
}
