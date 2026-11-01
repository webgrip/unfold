---
type: explanation
audience: [owner, contributor, agent]
owner: unfold
last_verified: 2026-11-01
verified_by: "Source read on 2026-11-01 of webgrip/unfold origin/development (apps/unfold/src/tenancy.ts, tenant-scope.ts, oidc.ts, config.ts, tracker-connections.ts, tenant-export.ts, ops/helm/unfold/values.yaml), ploeg-hq/ploeg origin/development 7419f2f (no tenant_id in Go; ADR-0178, 0179 and 0181 proposed), webgrip/homelab-cluster main (kubernetes/apps/authentik, kubernetes/apps/security/access-plane, kubernetes/apps/network/cloudflare-tunnel, ADR-0056, 0057, 0059) and webgrip/unfold-cluster main (infra/unfold-staging-edge.tf, kubernetes/apps/unfold-staging). Identity broker facts from the vendors' documentation on the same day. Prompted by the owner on 2026-11-01 after Unfold staging went live behind Cloudflare Access with a one-time PIN. Nothing was run."
---

# Customer environments

How a new customer gets a working Unfold: an Agency and its people signed in with their own SSO, its own isolated place to run agents and previews, and its own budget, created from one screen. This page details journey 8 on [Users and their journeys](users-and-journeys.md) ("people sign in with SSO into the right Tenant with the right role, and projects are connected"). It describes what exists today, where it breaks, and the directions the owner has to choose between. [Connect a repository](connect-a-repository.md) covers the step after this one: connecting the customer's forge, boards and model keys.

An *environment* here means two things the owner asked for on 2026-11-01:

- a **Tenant** for each Agency on a shared cluster, isolated as [ADR-0009](../adr/adr-0009-one-tenant-per-agency.md) decides and bounded as [ADR-0017](../adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md) decides;
- a **preview environment** for each pull request, so an Agency's clients can use a change before they accept it ([ADR-0008](../adr/adr-0008-every-pull-request-gets-a-preview-environment.md)).

A dedicated cluster per customer is not in scope; ADR-0009 keeps it as the pilot fallback.

## The journey

| | |
|---|---|
| Name | create a customer and get its first person signed in |
| Actors | an Unfold operator (responsible: creates the customer); the Agency's first admin (accountable inside the Tenant: invites people, connects systems); the Agency's developers and clients (informed: they sign in) |
| Starts when | an Agency agrees to a pilot or a paid plan |
| Done when | the Agency's admin signed in with their own SSO into their own Tenant, sees an empty Unfold, and Connections lists what to connect next |
| How often | a few times a month in the hosted phase; once per self-hosted install |
| Success measure | time from "new customer" to the admin's first sign-in; baseline: impossible today |

| Stage | Where | Today |
|---|---|---|
| 1. Create the customer | nowhere | missing: a Tenant is only a slug written in configuration (`tenant` on `repositories[]` and `taskSources[]`) and in SSO group names. No table, no API, no screen |
| 2. Give it a sign-in | the identity provider | missing for customers: see [Sign-in today](#sign-in-today) |
| 3. Map people to the Tenant and their role | Unfold | **works**: `apps/unfold/src/tenancy.ts` turns the groups `unfold/<tenant>/<viewer\|member\|admin>` and `unfold/<tenant>/client/<client>` into memberships at sign-in and through SCIM; `tenancy.enforce: true` turns the checks on. Off by default. There is no Tenant switcher |
| 4. Isolate where its agents run | the cluster | missing: no per-Tenant namespaces, egress gateway or LiteLLM team (LiteLLM teams are per repository, `mcp.litellmTeamId`). ADR-0009 says "Not implemented yet" |
| 5. Isolate its work in Ploeg | Ploeg | missing: no `tenant_id` in Ploeg's Go code; Ploeg ADR-0178 (tenant on operator records) is proposed |
| 6. Connect its systems | Unfold, Settings → Connections | partly: tracker connections are the only resource created on a screen and bound to a Tenant; the rest is [Connect a repository](connect-a-repository.md) direction 6 |
| 7. Preview each pull request | the cluster | missing: ADR-0008 and Ploeg ADR-0181 (preview controller) are not built |
| 8. Leave | Unfold | partly: the Tenant export exists behind the `tenant.export` flag; deleting a Tenant's data does not |

## Sign-in today

| Who | How they sign in | What it depends on |
|---|---|---|
| Webgrip staff on the homelab Unfold | Unfold's OIDC against the homelab Authentik, which signs in only through Google Workspace (`webgrip.nl`), only for people in the access-plane roster (homelab ADR-0057) | the homelab, and the LAN or VPN: Authentik is published on the internal gateway only |
| Webgrip staff on Unfold staging | a one-time PIN from Cloudflare Access for the owners' email domain, then a local Unfold account (`auth.localLogin: true`) | Cloudflare; two logins |
| A customer | nothing | |

Three facts close off the easy paths:

- **Authentik cannot serve people outside the LAN.** The Cloudflare tunnel publishes `authentik.webgrip.dev` for exactly two paths, the discovery document and signing keys of `unfold-kubernetes`; everything else answers 404. A browser on the internet cannot reach the authorize endpoint, and Cloudflare Access cannot use Authentik as its identity provider. Homelab ADR-0056 names publishing the identity provider as a decision that "deserves its own record". Authentik also runs one server replica, pinned to the high-CPU nodes, one of which is the unstable `fringe-workstation`.
- **Authentik is single-tenant by design here.** One brand, one Google source, no enrolment, a Git roster as the allow-list. Real Authentik tenancy is an Enterprise feature, documented as alpha in 2026.8, with a licence per tenant ([tenancy](https://docs.goauthentik.io/sys-mgmt/tenancy/)).
- **Cloudflare Access is the wrong layer for customers.** Seats are counted per person who authenticates and new people are blocked once seats run out; an account holds at most 50 identity providers by default ([account limits](https://developers.cloudflare.com/cloudflare-one/account-limits/)); and Access gives the application no Tenant or role. It stays in front of staging and the operators' consoles, not in front of customers.

## Directions

Proposed, for the owner to decide. They follow the order the owner chose on 2026-11-01: design first, then staff sign-in on staging, then customers.

### 1. Unfold owns sign-in; local login goes off

Unfold already does OIDC with discovery, PKCE and a JWKS check (`apps/unfold/src/oidc.ts`). Every installation signs people in through it, and `auth.localLogin: false` removes the password form, the `POST /api/login` route and the bootstrap administrator. The chart already refuses `false` without `config.auth.oidc`. Cloudflare Access stays in front of staging as a second wall, with the same identity provider, so a person signs in once and both layers see the same session.

On staging the owner chose Google Workspace directly until the broker exists (decided 2026-11-01). Access moves to it in [unfold-cluster#173](https://forgejo.webgrip.dev/webgrip/unfold-cluster/pulls/173) once a person has made the Google OAuth client. Unfold itself cannot follow yet: it takes a person's role from a role claim or a groups claim (`entitledRole` in `apps/unfold/src/oidc.ts`), and a Google ID token carries neither. Turning local login off on staging therefore waits for either the broker, which emits the groups, or a small Unfold change that maps a verified email address or Workspace domain to a role.

### 2. One customer identity broker, with an organisation per Tenant

A broker is the one sign-in service Unfold trusts. Each Agency's own Google Workspace or Microsoft Entra ID is linked to it as that Agency's identity provider, and small Agencies and their clients sign in with a passkey or email instead. The broker puts the Tenant and the role in the token as the groups Unfold already reads, so step 3 needs no change.

| | Zitadel | Keycloak 26 | Authentik |
|---|---|---|---|
| Tenant model | organisation per Tenant, built for it | Organizations (since 26), identity-first login by domain | brands share applications; real tenancy is alpha Enterprise with a licence per tenant |
| An Agency's own SSO | an identity provider per organisation, routed by verified email domain | an identity provider linked per organisation, routed by domain | a source per Agency; routing by domain is a custom flow |
| Create a Tenant by API | organisation, identity provider, domain and role grants, all API | Admin REST API | API, but the tenancy part is alpha |
| Groups claim `unfold/<tenant>/<role>` | an Action rewrites the role claim | a mapper | a property mapping |
| Footprint | one Go binary and Postgres | about 1.25 GB per pod by Red Hat's sizing | server, worker and Postgres |
| Licence | AGPL-3.0 since v3; calling its API unmodified creates no obligation, per Zitadel | Apache-2.0 | open source core; Enterprise per user |
| Managed EU fallback | Zitadel Cloud, EU or Swiss region | third parties only | none |

Sources: [Zitadel domain discovery](https://zitadel.com/docs/guides/solution-scenarios/domain-discovery), [Zitadel licence FAQ](https://zitadel.com/license-faq), [Keycloak organisations](https://docs.redhat.com/en/documentation/red_hat_build_of_keycloak/26.0/html/server_administration_guide/managing_organizations), [Keycloak sizing](https://docs.redhat.com/en/documentation/red_hat_build_of_keycloak/26.0/html/high_availability_guide/concepts-memory-and-cpu-sizing-), [Authentik pricing](https://goauthentik.io/pricing).

For Webgrip the choice is between Zitadel and moving Authentik to the production cluster:

| | Zitadel | Authentik on the production cluster |
|---|---|---|
| What we already have | nothing: a new system to run and learn | the access plane in OpenTofu, the Google source, the passkey flow, every Unfold client, and unfold-mcp's end-to-end suite runs against a real Authentik |
| A customer's own Google or Entra ID | an identity provider on that customer's organisation, picked by email domain | a source per customer on one shared login page; routing by domain is a flow we write |
| A customer admin manages their own people and SSO | yes: organisation owners manage their own users and identity providers | not without real tenancy, which is alpha and licensed per tenant |
| Groups `unfold/<tenant>/<role>` | an Action turns organisation roles into the claim | a property mapping over global groups; every customer's groups live in one namespace |
| What a mistake can reach | one organisation's settings | applications, sources and policies are global, so one bad policy reaches every customer |
| Cost | none for the open source build | open source core; tenancy needs Enterprise |

The proposal is **Zitadel on the production cluster**, not on the homelab, because customer sign-in must not depend on the homelab ([ADR-0040](../adr/adr-0040-unfold-production-runs-on-a-rented-eu-talos-cluster-and-the-homelab-is-staging.md)). Webgrip staff reach it through federation: the Webgrip organisation in Zitadel links Google Workspace (or the homelab Authentik, once it is published), so staff keep one Google sign-in and the security-key check of homelab ADR-0077.

### 3. A Tenant is an object in Git with an owner screen

A Tenant is a `Tenant` custom resource, one file per customer in the production cluster repository, reconciled by Flux like everything else there (decided 2026-11-01: "ook dit GitOps"). Unfold gets a **Platform → Customers** area for Unfold operators: a list of customers with their provisioning state, read from the `Tenant` objects' status, and a *New customer* form that asks for the name, the slug, the first admin's email, the model routing (EU only, or EU and US under the Data Privacy Framework, as ADR-0009 lets each Agency choose), and the monthly budget.

ADR-0017 says Unfold staff never see Tenant content. The Customers area therefore shows only what provisioning made and whether it is healthy: never Work Items, people's activity or code. A new platform role, separate from the Tenant roles, gates it.

### 4. One reconciler turns a Tenant record into everything it needs

The *New customer* form opens a pull request that adds the customer's `Tenant` file, and one of the Webgrip operators reviews and merges it: every customer starts with one of us, for now (decided 2026-11-01). After the merge Flux applies the object, and a reconciler makes each piece, idempotently, and reports each as a line with a state, like the Connections checks:

| Piece | Made through | ADR |
|---|---|---|
| Broker organisation, the three role groups, an invitation to the first admin | the broker's API | ADR-0017 |
| Namespaces for Runs and previews, default-deny network policies, a resource quota, the sandboxed RuntimeClass | the Kubernetes API | ADR-0009, [ADR-0045](../adr/adr-0045-agent-code-runs-under-kata-or-gvisor-chosen-by-what-the-node-and-the-work-need.md) |
| LiteLLM team and budget, with the Tenant's model routing | LiteLLM's admin API | ADR-0009 |
| An OpenBao path and a write-only role for the Tenant's connections | OpenBao, through a role that may create Tenant paths and nothing else | homelab ADR-0055, Connections direction 6 |
| The Tenant in Ploeg, and an operator consumer bound to it | Ploeg's API | Ploeg ADR-0178 |

The reconciler is a small Kubernetes operator for the `Tenant` resource (decided 2026-11-01). It holds the rights to make namespaces, call the broker and LiteLLM, and write OpenBao; Unfold's web process, which faces the internet, holds none of them. It may only open a pull request on the cluster repository and read `Tenant` status. Kubernetes gives the operator retries, status conditions and events; Git gives every customer a reviewed history.

A `Tenant` file holds no secret: the slug, the display name, the first admin's email, the model routing, the budget and the plan. Everything secret is made by the operator and kept in OpenBao.

Deleting a customer is a pull request that removes the file. A finalizer on the `Tenant` keeps the object until the export is done, then runs the pieces in reverse and deletes code, prompts and logs as ADR-0009 requires.

### 5. The Agency onboards itself

1. The first admin gets the invitation, signs in with a passkey, and lands on an empty Unfold with a checklist.
2. *Sign-in for your team*: the admin links their Google Workspace or Entra ID to their organisation in the broker, from a page in Unfold that walks them through it, and verifies their email domain. From then on everyone with that domain lands in the right Tenant without an invitation.
3. *Connect your systems*: [Connect a repository](connect-a-repository.md) direction 6.
4. *Invite your clients*: the admin adds a Client and invites its people by email; they get `unfold/<tenant>/client/<client>` and see only their Client's Work Items (ADR-0017).

### 6. Previews per pull request, inside the Tenant

The preview controller of Ploeg ADR-0181 creates each preview in the Tenant's preview namespace from direction 4, under a wildcard host such as `pr-<number>-<repo>.<tenant>.<preview domain>`. A preview is reachable only after signing in through the same broker, by an authenticating proxy in front of the preview gateway, so an Agency's client opens a preview with the account they already have. Cloudflare Access is not used for previews, for the seat and identity-provider reasons above.

## Order

1. Staff sign-in on staging (direction 1): Access through Google Workspace, then Unfold through the same identity provider and `auth.localLogin: false`.
2. The broker on the production cluster, with the Webgrip organisation only, and staging switched to it.
3. The `Tenant` resource and its operator for the broker organisation and the namespaces, then the Platform → Customers area that opens the pull request.
4. LiteLLM, OpenBao and Ploeg pieces, as Ploeg ADR-0178 lands; then `tenancy.enforce: true` on staging.
5. Agency self-onboarding and the Tenant switcher.
6. Previews, once Ploeg ADR-0181 is built.

## Open questions

Each is the owner's to decide. The owner answered 1, 3, 4 and 5 on 2026-11-01.

1. ~~Staff sign-in on staging before the broker exists.~~ Google Workspace directly, for Access and Unfold ([unfold-cluster ADR 0014](https://forgejo.webgrip.dev/webgrip/unfold-cluster/src/branch/main/docs/adr/0014-operators-sign-in-to-production-through-google-directly.md)); one OAuth client made by hand in Google's console. Publishing the homelab Authentik was not chosen.
2. The broker: Zitadel or Authentik moved to the production cluster. The owner asked for a closer comparison of the two first.
3. ~~Self-hosted or managed.~~ Self-hosted on the production cluster.
4. ~~Where the reconciler runs.~~ A `Tenant` custom resource and operator, with the `Tenant` files in Git.
5. ~~Self sign-up.~~ Every customer starts with one of the Webgrip operators, for now.
6. Until the broker exists: does Unfold on staging learn to map a verified Google email or Workspace domain to a role, so local login can go off now, or does local login stay on until the broker emits groups?
