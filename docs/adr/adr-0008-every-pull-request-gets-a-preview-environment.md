---
status: accepted
date: 2026-09-29
decision-makers: Ryan Grippeling
---

# Every pull request gets a preview environment; production stays with the agency

## Context and Problem Statement

A client cannot review a diff. To accept work, the client needs to use the change. The agency needs the same thing to review quickly. Glide could stop at the pull request, host a preview of it, or deploy it to production. Where does Glide's delivery end?

## Decision Drivers

* The client accepts a working feature, not code.
* Glide must not own the uptime, data or incidents of a client's production system.
* A preview runs code an agent wrote, so it is untrusted and must be isolated like a Run.
* Previews cost compute for as long as they live.

## Considered Options

* A preview environment per pull request, deleted when the pull request closes
* No preview; the agency deploys to its own staging
* Deploy to production after merge

## Decision Outcome

Chosen option: "A preview environment per pull request, deleted when the pull request closes", because it gives the client something to accept without making us a hosting company.

* Previews are an optional add-on delivered as a CI step: Glide ships a preview-deploy action for GitHub Actions, GitLab CI and Forgejo Actions that runs in the agency's own pipeline when Glide opens a pull request.
* The step deploys either to the agency's own infrastructure, which costs nothing extra, or to Glide's preview hosting, in a namespace owned by the agency's tenant ([ADR-0009](adr-0009-one-tenant-per-agency.md)). Either way the URL is posted to the pull request and the client portal.
* The repository declares how to build and run a preview. Repositories without a declaration get no preview and are marked so.
* Previews use generated test data only. They never receive production secrets.
* A preview is deleted when its pull request is merged or closed, or after an idle time limit.
* On Glide's preview hosting, each preview deploy is billed a flat fee that covers 7 days, then a daily fee, separately from tickets ([ADR-0006](adr-0006-the-ticket-is-the-billing-unit.md)). Ingress is free; 100 GB of egress a month is included, then egress is billed at provider cost plus markup.
* Merging and production deployment stay with the agency.

Not implemented yet. The first supported declaration is a Dockerfile in the repository; buildpacks and Helm charts may follow.

### Consequences

* Good, because the client accepts by using the feature, and the agency reviews faster.
* Good, because CPU and memory are what a preview consumes, so CPU minutes finally have a use as a unit.
* Bad, because building arbitrary repositories is a large and varied problem. The first version supports one declared format.
* Bad, because a preview is internet-reachable agent-written code. It needs default-deny egress and authentication in front of it.

### Confirmation

Confirmed when a delivered pull request in a declared repository gets a reachable preview URL, and closing the pull request removes its namespace within the idle limit, checked by an end-to-end test.

## Pros and Cons of the Options

### No preview

* Good, because it adds nothing.
* Bad, because the client must wait for the agency to deploy before accepting.

### Deploy to production

* Bad, because it makes Glide responsible for production. See [ADR-0005](adr-0005-glide-is-offered-to-agencies.md).

## More Information

* 2026-09-28 — The owner chose previews ("feature previews", "review apps") over production hosting.
* 2026-09-29 — Accepted. The owner chose a Dockerfile as the first preview declaration.
* 2026-09-29 — The owner made previews an optional CI-step add-on that deploys to the agency's own infrastructure or to metered Glide hosting, with free ingress and an egress allowance.
* 2026-09-29 — The owner replaced hourly preview billing with a flat fee per deploy plus a daily fee after 7 days.
