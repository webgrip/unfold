# Changelog

## 0.2.0

- Added a native Linked Tasks view and provider-neutral task browsing for Forgejo, GitHub, GitLab, ClickUp and Vikunja sources configured on the workbench server.
- Added plain-text source previews, pagination, direct task IDs and explicit crew/runtime/budget import. Imported tasks remain queued until the operator starts them.
- Retained source revisions in session context; stale imports require a refreshed preview. Ploeg-owned sources remain inspection-only.
- Added the Preparing review lifecycle state and complete candidate evidence with explicit Git bundle, binary patch and manifest downloads.
- Added bounded authenticated downloads, refused redirects and bundle/patch digest verification before saving a new local file.
- Extended actual-server client integration tests and browser webview checks for linked tasks and candidate evidence. VS Code Extension Host qualification remains a separate manual gate.

## 0.1.1

- Show structured execution failures with a concrete next action and submission certainty.
- Keep unknown paid submissions explicit, with no automatic retry or repeat action.
- Render failure text safely in narrow and desktop session panels; retain compatibility with older servers.

## 0.1.0

- Added an origin-bound remote client with cookie login through VS Code SecretStorage.
- Added native remote session navigation and registered-profile creation.
- Added a theme-aware session panel with crew progress, evidence, durable history and human intervention.
- Added explicit lifecycle controls, instructions, allow-once/reject decisions and structured question responses.
- Added read-only evidence documents and bounded editor-context previews with destination confirmation.
- Added actual-server API integration tests, browser webview checks and VSIX packaging.
