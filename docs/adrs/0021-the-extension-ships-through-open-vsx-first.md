# 0021 — The extension ships through Open VSX first, and reaches the Marketplace only on stable versions

Date: 2026-09-11. Status: accepted for 0.3.0; the publishers themselves are an open manual gate.

## Context

Through 0.3.0-rc.14 the extension has been distributable only as a VSIX attached to a Forgejo
release. That works for a pilot and fails as distribution: a sideloaded VSIX never auto-updates,
so every fix reaches an operator only if that operator goes and fetches it. The extension is the
half of De Vloer people touch daily, and it is the half that has been hardest to get into their
hands.

Two registries can carry it, and they are not interchangeable.

[Open VSX](https://open-vsx.org/) is the default registry for the VS Code forks — VSCodium,
Cursor, Windsurf, code-server, Gitpod, Theia, Kiro, Antigravity — and Cursor runs its own
malware and supply-chain scan in front of it. It takes an Eclipse Foundation account, accepts
full semver, and asks nothing of Microsoft. The [Visual Studio
Marketplace](https://marketplace.visualstudio.com/) reaches only plain VS Code, but plain VS
Code is where most of our operators are.

The Marketplace imposes a constraint the release train did not anticipate. Its version string
must be one to four integers separated by periods, so `0.3.0-rc.14` is refused at upload and no
flag makes it acceptable; `--pre-release` marks a plain `X.Y.Z` as a pre-release channel and
does nothing for a `-rc` suffix. Since `development` cuts every `-rc.N` and only `main` cuts a
stable version, a single publish step aimed at both registries would fail on every release
candidate.

Its credential is on a clock as well. Azure DevOps retires global personal access tokens on
2026-12-01. The replacement is Entra ID workload identity federation, which wants an Azure
subscription, a user-assigned managed identity rather than an App Registration, a federated
credential trusting the Forgejo issuer, and an undocumented API call to learn the id the
Marketplace will recognise. None of that exists in this estate today, and waiting for it would
hold up distribution for the sake of a credential that still has eleven weeks of life in it.

One detail makes the whole thing worth deciding carefully rather than trying: a Marketplace
publisher id is permanent, and so is an extension name once it has been published and removed.
`webgrip.de-vloer` is a one-way door.

## Decision

Every release goes to Open VSX, prereleases marked with `--pre-release`. Only a stable `X.Y.Z`
goes to the Marketplace. Every release, stable or not, still attaches its VSIX and a SHA-256
checksum to the Forgejo release, so a team that prefers to install nothing from a registry keeps
a verifiable path. A version is never rewritten to force it past a registry's rules; the job
skips the Marketplace, says why in a notice, and warns when a stable release finds no credential
there.

[scripts/extension-verify.mjs](../../scripts/extension-verify.mjs) gates all of it, on every
pull request and every push rather than only at the tag. It fails a listing missing an icon, a
repository, a licence or a changelog, an icon that is not a square PNG of at least 128 pixels, a
README carrying a relative link that would break once the page is served from a registry, and a
VSIX that ships sources, source maps, `node_modules` or an environment file.

`@vscode/vsce` and `ovsx` are pinned devDependencies invoked through `npx --no-install`, so a
release resolves no publishing tool from the npm registry while holding a publishing credential.
Renovate keeps both current.

The Marketplace step prefers a federated identity whenever `MARKETPLACE_AZURE_CLIENT_ID` and
`MARKETPLACE_AZURE_TENANT_ID` are set and falls back to `VSCE_PAT`. We ship on the token now and
migrate before December; migrating is then a secrets change rather than a workflow change.

## Consequences

An operator on Cursor, VSCodium or code-server gets updates automatically from the first
release, and an operator on plain VS Code gets them from the first stable one. Release
candidates stay visible to the forks and invisible to the Marketplace, which matches what a
release candidate is for.

The stable-only rule means a Marketplace listing lags `development` by design. Someone will
eventually read that as the extension being stale. The listing is marked `preview` while the
product is pre-1.0, which is the honest signal, and the Forgejo release page remains the place
where every build is visible.

Claiming the two publishers is still a person's job and is not done. Until then the job warns
and the release asset is the only distribution path — the same position as before this decision,
now with a warning loud enough to notice.

The verified-publisher check is not available at the first release: it wants an extension
published for six months and a domain registered for six. `webgrip.nl` qualifies on the domain
side already.

## Reconsider when

The PAT stops working and federation is not in place, a registry changes its version rules, the
extension leaves preview and the `preview` flag should come off, or De Vloer acquires a second
publishable extension and the publisher identity deserves to be shared deliberately.
