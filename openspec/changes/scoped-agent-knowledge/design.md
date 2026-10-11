## Context

ADR-0021 and the RFC `docs/research/2026-10-04-rfc-agent-knowledge.md` set
the first design: OKF packs, one graph per Tenant, every learning reviewed.
On 2026-10-11 the owner asked for writes at four levels and chose the shape
recorded in ADR-0034 and ADR-0035. Ploeg's design is in ploeg-hq's change
`scoped-knowledge-and-work-item-notes`; this document covers what crosses
both applications and what Unfold adds.

Checked on 2026-10-11 against the homelab's Omnigraph bundle and runbook:
policy rules grant actions per graph and branch class only (no row filter, no
branch prefix), `cluster apply` refuses a schema change while a branch is open,
and the only Unfold actor today, `act-glide`, can read graphs no Run may reach.

## Goals / Non-Goals

**Goals:** every agent reads the knowledge of the levels that apply to it;
agents write notes about their own work without waiting for review; nothing
reaches other work before a Tenant admin accepts it; sessions share the same
store and rules; no graph token outside Ploeg.

**Non-Goals:** as in the proposal.

## Decisions

### D1 — Who enforces what

| Boundary | Enforced by |
|---|---|
| Tenant to Tenant, and graphs outside any Tenant | Omnigraph policy (403) |
| Unreviewed text into reviewed knowledge | Omnigraph policy: the run actor has no write on the knowledge graph |
| Client, repository and root inside a graph | Ploeg's filter, from its own records |
| Which person a session acts for | Unfold (editor credential, SSO groups), checked again by Ploeg against the consumer's Tenant |

### D2 — Reads per role

| Reader | Tenant concepts | Client concepts | Repository concepts | Work Item Notes |
|---|---|---|---|---|
| Run of a Work Item | yes | its Client | its repository | its root |
| Tenant member or admin (session) | yes | all | all | all |
| Client user (session) | no | their Client | their Client's | their Client's Work Items |

### D3 — Writes per role

| Writer | Work Item Note | Wider scope |
|---|---|---|
| Run | direct (learnings) | suggested in `learnings[].scope`, becomes a Promotion |
| Tenant member (session) | direct, with confirmation | Promotion request |
| Tenant admin (session or review) | direct | accepted at once, recorded as theirs |
| Client user | no | Promotion request about their repositories |

### D4 — unfold-mcp gains its first write tools

`unfold_write_note` and `unfold_suggest_promotion` carry MCP's
`readOnlyHint: false` annotation, and the tool description says it writes;
clients that honour annotations ask the person before calling (ADR-0011). Reads keep the `untrusted` wrapper of
ADR-0032.

### D5 — Review surface

Promotions are reviewed in Unfold's Needs you (owner answer of 2026-10-04:
Tenant admins accept in Unfold). Omnigraph's branch review is not used, since
Promotions never wait as branches. The review spike VIK-1862 narrows to how
the queue should look, measured on the first 10 Promotions.

## Risks / Trade-offs

- A wrong or injected note steers later Runs of the same root → notes are
  labelled unreviewed in the pack, listed per Run on the Work Item page
  (VIK-1868) and expire 90 days after the root closes.
- Client boundaries rest on Ploeg's filter → scope tests in Ploeg and an
  Unfold test that a client user never sees another Client's object.
- Two graphs and two actors per Tenant to operate → provisioning is one
  template per Tenant on the cluster side.

## Migration Plan

Additive. ADR-0021 stays as it is until ADR-0034 is accepted; the RFC records
both sets of owner answers. No code changes in this change.

### D6 — Repository Promotions reach git

An accepted repository Promotion also creates an approved Work Item on that
repository; its Run adds the concept under `knowledge/` and opens a pull
request the client reviews like any other. Ploeg gains no forge write path of
its own. Once the file is merged, packs keep the repository's file over the
graph copy, because the client owns their git. Each accepted repository
Promotion costs one small Run.

## Owner answers, 2026-10-11 (second round)

- ADR-0034, ADR-0035 and Ploeg ADR-0087 to ADR-0089 stay proposed until the
  measurement spike (VIK-1859) reports; the pull requests merge as proposals.
- A note a person writes in a session reaches Runs at once.
- Only a Tenant admin promotes; a member's request waits.
- Repository Promotions open a `knowledge/` pull request now (D6).

## Open Questions

None open from this change.
