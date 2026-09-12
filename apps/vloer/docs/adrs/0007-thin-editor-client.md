# 0007 — A native editor client for the remote control plane

Date: 2026-09-09. Status: accepted for the v0.1 extension; canonical work-order and OIDC extensions remain proposed.

## Context

Operators should use the same remote work from the browser or editor without installing a coding harness or a second scheduler locally. VS Code's extension host has its own runtime and security lifecycle; the server's native Node 24 TypeScript strategy is not an extension packaging format.

## Decision

Build an Apache-2.0 desktop extension using native Tree Views, commands, Quick Picks and read-only virtual documents. Use a narrowly scoped, theme-aware webview for the session's evidence and decisions. Compile TypeScript to JavaScript for the editor's supported extension host. Keep third-party runtime npm dependencies at zero; separately pinned development dependencies provide compilation and VSIX packaging.

Declare a UI extension so the operator connects from the laptop even when editing through Remote SSH. Store the current API's session cookie in SecretStorage bound to a validated server origin. Use HTTPS except for loopback development, reject redirects and keep credentials out of the webview. A workspace cannot override the application-scoped server destination.

Send local code only through an explicit, bounded preview and destination confirmation under Workspace Trust. Do not run agents, apply patches, upload a repository or retry paid mutations automatically. An account or deployment change invalidates pending context-sharing and mutation interactions.

The editor follows the current HTTP contract. Do not invent bearer or OIDC endpoints or claim tracker intake, native remote files or fenced takeover before the server implements them. Poll durable events with global ID cursors; a numerical gap within one session is not evidence of event loss.

## Consequences and acceptance

The extension adds a separately packaged surface and its own compatibility checks. Client tests must exercise the actual server, and browser tests must exercise the shipped webview script. Actual VS Code Extension Host installation, platform SecretStorage and accessibility require separate desktop qualification; Node or browser tests do not prove them.

Revisit ACP when a concrete harness/editor requirement needs its protocol. ACP is not the authority for project budgets, remote resource quotas or ticket claims. Evaluate VSCodium/Open VSX distribution through actual compatibility and publisher ownership checks, not an assumption that every VS Code distribution behaves identically.

See [extension README](../../extensions/vscode/README.md), [operator experience](../design/ide-and-operator-experience.md) and [VS Code extension-host documentation](https://code.visualstudio.com/api/advanced-topics/extension-host).
