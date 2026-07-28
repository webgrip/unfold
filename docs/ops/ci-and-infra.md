# CI and infrastructure notes

> Hard-won operational knowledge about *where Ploeg's CI runs* and the traps that
> cost a release cycle each. Migrated 2026-07-28 from assistant memory into version
> control. The cluster itself is described in `webgrip/homelab-cluster`; this file
> only carries what someone working in **this** repo needs.

## Where CI runs

Ploeg's Forgejo Actions jobs run in the homelab Kubernetes cluster, managed by the
sibling repo `webgrip/homelab-cluster` (GitOps via Flux, trunk-based direct-to-main).

- Cluster access: `KUBECONFIG=~/projects/webgrip/homelab-cluster/kubeconfig`
- Runners: KEDA `ScaledJob` `forgejo-runner` in namespace `forgejo` — ephemeral
  one-job pods with a warm pool. Runbook lives at
  `homelab-cluster/docs/techdocs/docs/runbooks/forgejo-runner.md`.
- Debugging a runner-side failure:
  `kubectl -n forgejo exec <warm runner pod> -c runner -- sh -c '...'`. The image is
  Debian-based and has `git`, `curl`, and `getent`, but no `nslookup` or `dig`.
- Network edge VIPs: envoy-external 10.0.0.28 (Cloudflare tunnel origin),
  envoy-internal 10.0.0.27, k8s-gateway split-horizon DNS 10.0.0.26, API 10.0.0.25.

Cluster edits are generally out of reach from a Ploeg session (the permission
classifier blocks them) — make them from a homelab-cluster session or hand the diff
to the operator.

## Resolved: intermittent TLS failures when cloning in CI

Diagnosed and fixed 2026-07-24, recorded because the symptom is likely to recur from a
different cause and should not be re-diagnosed here.

Symptom was `gnutls_handshake() failed` when cloning `webgrip/workflows`. Root cause was
`autopath @kubernetes` in the CoreDNS default server block: it answered pods'
search-expanded queries by resolving the stripped name via public DNS, so the
`${SECRET_DOMAIN} → 10.0.0.26` stub zone was never consulted and every pod reached
in-cluster services by hairpinning through Cloudflare.

Fixed by removing the autopath plugin (homelab-cluster commit 116231cf). **If CI TLS
flakes come back, this is no longer the cause** — confirm with the comparison that
originally proved it, from inside a runner pod:

```sh
getent ahosts forgejo.webgrip.dev.   # trailing dot → 10.0.0.28 (correct LAN VIP)
getent ahosts forgejo.webgrip.dev    # bare name → should also be the LAN VIP now
```

## Forgejo packages and tokens

- **Packages are owner-scoped and land unlinked.** A package does not appear on a repo
  page until linked via
  `POST /api/v1/packages/{owner}/{type}/{name}/-/link/{repo_name}` (per package *name*,
  not version). OCI-pushed Helm charts arrive as type `container`. Note the anonymous
  packages API hides `.repository` when the linked repo is private, so a package can
  look unlinked while being linked; HTTP 400 "invalid argument" from the link endpoint
  means owner-mismatch or already-linked.
- **`secrets.FORGEJO_TOKEN` is the built-in per-job token, not an org secret.**
  `FORGEJO_`/`GITHUB_`/`GITEA_` are reserved secret prefixes. The built-in token cuts
  releases fine but attributes them to *Ghost* and **cannot write org packages** —
  which surfaces as a 401 on push at the end of a long build. Use the org secret
  `WEBGRIP_CI_TOKEN` (bot has `write:package` via team `ci`); prefer the
  un-shadowable `CI_TOKEN` input name over the legacy `FORGEJO_TOKEN` when calling the
  shared release reusables, since a caller-mapped secret of that name risks resolving
  to the built-in token.

Ploeg publishes and links both image and chart in
[.forgejo/workflows/on_release_published.yml](../../.forgejo/workflows/on_release_published.yml);
`webgrip/workflows` ADR 0004 records the org-wide pattern.

## Image signing

Ploeg has signed its releases since v0.2.0-rc.2 by calling the shared
`webgrip/workflows` composite `cosign-sign-attest`, which signs by digest through
**OpenBao Transit** (the key never leaves OpenBao; `--tlog-upload=false`, key-only
verification) and authenticates with the per-job **Forgejo Actions OIDC token**
(`enable-openid-connect: true`) exchanged at OpenBao's `auth/forgejo` JWT auth.

Adopting it in another repo takes a homelab-cluster change *first*: add the repo to the
`cosign-signer` role's `bound_claims.repository` and re-run the OpenBao bootstrap.
Wiring the job before the role change hard-fails the release with an OIDC login 400.

Open hardening items: bind the `workflow` claim in the role; Kyverno
`image-verify-harbor-audit` is still audit-mode; the sign step re-resolves tag→digest
(TOCTOU).

## Credentials rule: OpenBao, not org secrets

When a CI job needs a credential that already exists in the cluster, read it from
OpenBao using the job's OIDC-exchanged token rather than adding a Forgejo org or repo
secret. OpenBao is the single secrets backbone; org secrets are unaudited copies that
rot, and the signing flow already holds a short-lived scoped token per job, so an extra
read is one policy line rather than a new distribution channel.

Grant the minimal kv-v2 read path in the relevant OpenBao policy (homelab-cluster
openbao bootstrap `*.hcl` — those files are classifier-blocked from Ploeg sessions, so
hand the diff over) and read `${VAULT_ADDR}/v1/<mount>/data/<key>`, failing soft.
Precedent: the Dependency-Track API key path used by `cosign-sign-attest`.
