# Tasks — scim-and-shared-signals

## 1. Plan

- [ ] 1.1 File the ticket on the Unfold board and add its `VIK-<id>` to the proposal
- [x] 1.2 Write application ADR 0058 (proposed) with its README row and regenerate the decision register

## 2. Build

- [x] 2.1 `Revocation` for sign-out, SCIM and Shared Signals, with a test per credential type
- [x] 2.2 SCIM 2.0 service provider at `/scim/v2` behind `identity.scim`
- [x] 2.3 Shared Signals push receiver at `/ssf/events` behind `identity.shared-signals`
- [x] 2.4 Refuse a turned-off account on every sign-in path
- [x] 2.5 Action Records and log lines for every change and revocation

## 3. Document and verify

- [x] 3.1 Operations page "Provision and deprovision people (SCIM and Shared Signals)", the HTTP contract and the flag rows
- [ ] 3.2 **[owner]** Try SCIM and a Shared Signals stream against the estate's Authentik
- [x] 3.3 `mise run verify` and `mise run docs-check`, output in the pull request
