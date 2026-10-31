---
type: explanation
audience: [owner, operator, integrator]
owner: unfold
last_verified: 2026-10-30
verified_by: "Every bullet read against apps/unfold/docs/features.md (snapshot 6738fb37) and its status; In Labs statuses checked in apps/unfold/src/flag-registry.json; each 'new here' claim checked against apps/unfold/docs/research/market-landscape.md, the fit records in docs/research and apps/unfold/docs/research; mise run docs-check"
---

# Unfold at a glance

For engineering leads and agency owners deciding whether to hand work to AI agents.

Unfold turns the tasks in your tracker into pull requests that are ready for a person to review, shows what each one cost, and leaves every merge to you. It runs on Ploeg, the open-source engine that authorizes, budgets and runs every agent Run.

- **Hand off.** Give a tracker task to a Team of agents from the tracker, the browser, your editor or an AI app.
- **Stay in control.** Spending is authorized before the work starts, questions come to you, and you can stop or take over any Run.
- **Review with evidence.** Each pull request arrives marked as AI-written, with the agent's account of the change, the reviewer's findings, CI and the settled cost.

A few words recur on this page. A Work Item is one piece of work, usually a task in your tracker, that should end as a pull request. A Team is a configured group of agents with their models and spending limits. A Role is one job inside a Team, such as writer or reviewer. A Run is one Role working on a Work Item once. A Shift is a Team's whole attempt at a Work Item, made of one or more Runs; screens call it an Attempt. The [glossary](../../../../docs/reference/glossary.md) defines every term.

Status tags: `Available` is built and on, or on once you configure it. `In Labs` is built and behind a feature flag that is off by default; a person or an administrator turns it on. `Experimental` is built but not yet proven against the real tool. `Planned` is decided or proposed and not built. Each bullet links to the engineering detail in [Unfold features by bounded context](../features.md).

## In ten lines

All ten are available today. The sections below carry each one's status and evidence.

1. **Hand off from the tracker you already use.** Assign a ClickUp or Vikunja task to an agent Team and it comes back as a pull request.
2. **Spending is authorized before it happens.** Every Run gets a budget before its first model call, and the hand-off shows the Team's limit and what is left.
3. **Agents propose, people merge.** Work arrives as a pull request on your forge, and Unfold never merges it.
4. **Know what waits on you, and why.** Stopped work is grouped by a plain reason, each with the one action that fixes it.
5. **Take over a running agent and hand it back.** Pause a Run at its next safe point, finish the job in your own editor, then return it on the same branch.
6. **Every AI-written change is marked.** Pull requests, comments and commits say an agent wrote them, and AI-written lines are recorded per commit.
7. **See the cost of every Run, Work Item and Client.** Spend, tokens and models per Run, cost per merged Work Item, and a FinOps FOCUS export.
8. **A tamper-evident record of who did what.** Every action is recorded with the person, the app they used and their confirmation, in a hash-chained OCSF audit trail.
9. **Work from VS Code, Claude Code or your AI app.** Follow, answer and steer the same Work Item from the tool you have open.
10. **Self-hosted and open source.** Apache-2.0, installed with one Helm chart that carries the Ploeg it was tested with.

## Integrations

Works with:

- **Trackers.** Hand off by assignment in ClickUp and Vikunja; read tasks from Forgejo, GitHub, GitLab and Jira Cloud. Jira has no hand-off yet. `Available` · [Execution](../features.md#context-execution)
- **Forges.** Pull requests on Forgejo, GitHub and GitLab (a merge request on GitLab), each through its own publisher. `Available` · [Execution](../features.md#context-execution)
- **Agent tools.** A Claude Code plugin that also installs as an Agent Plugin in Codex, Copilot, VS Code, Cursor and Kiro; an OpenCode 1.x plugin; any Agent Client Protocol (ACP) agent through a pass-through proxy. `Available` · [Participation](../features.md#context-participation)
- **Codex CLI reporting.** Reports Codex sessions to Unfold; tested with recorded payloads only. `Experimental` · [Participation](../features.md#context-participation)
- **Model providers.** Any provider your LiteLLM gateway serves. `Available` · [Execution](../features.md#context-execution)
- **Editors.** VS Code with its Agents window. JetBrains IDEs, Zed and Neovim connect through ACP, not yet tried in a real install of those editors. `Available` for VS Code, `Experimental` for ACP editors · [Participation](../features.md#context-participation)
- **AI apps.** Claude Code and other apps that speak MCP over HTTP with OAuth, such as claude.ai, ChatGPT and Copilot, reach Unfold over MCP (Model Context Protocol, the standard way AI apps call tools). `Available` · [Participation](../features.md#context-participation)
- **Chat and notifications.** Slack, Microsoft Teams, ntfy and Web Push, with quiet hours. Browser and VS Code notifications are `Available`. `In Labs` · [Participation](../features.md#context-participation)
- **Billing and FinOps.** Model cost as FinOps FOCUS 1.4 files for any FinOps tool. `Available` · [Billing](../features.md#context-billing)
- **Billing tools.** Lines for accepted Work Items into Simplicate, or as CSV and UBL 2.1 files for any other tool. `In Labs` · [Billing](../features.md#context-billing)
- **Identity.** Single sign-on with any OIDC provider; local sign-in can be turned off. `Available` · [Participation](../features.md#context-participation)
- **Provisioning.** SCIM 2.0 and Shared Signals, so your identity provider adds and removes people. `In Labs` · [Participation](../features.md#context-participation)
- **Feedback tools and email.** Requests from Marker.io, BugHerd, Userback, Freshdesk, Zendesk, a web form or email. `In Labs` · [Offering](../features.md#context-offering)
- **Observability.** Grafana, Prometheus and VictoriaLogs for logs and telemetry; any Sentry-protocol tracker (Sentry, GlitchTip, Bugsink) for errors. `Available` · [Shared kernel](../features.md)

## You stay in control

- **Budgets set before any spend.** Ploeg authorizes each Run's budget before the first model call, and the hand-off confirmation states the Team's limit per day, week or month and what is left. `Available` · [Participation](../features.md#context-participation)
- **No silent re-spend.** Resuming or running work again first checks that Ploeg will pay for it. `Available` · [Execution](../features.md#context-execution)
- **Held money kept apart from spent money.** Budget held by unfinished Runs is shown separately, with a warning when a hold cannot be released. `Available` · [Execution](../features.md#context-execution)
- **Confirm before anything changes.** Actions from AI apps and editors show their effect and cost and wait for your yes. `Available` · [Participation](../features.md#context-participation)
- **Stop work with one confirmation.** Stopping lists what it does (stop Runs, revoke keys, comment on the task) and the spend so far. `Available` · [Execution](../features.md#context-execution)
- **Take over and hand back.** Take a running Run at its next safe point, work on its branch yourself, then hand it back with a note. `Available` · [Execution](../features.md#context-execution)
- **Steer running work.** Leave a note that the next Run reads, or answer an agent's question and choose to resume or start over, each with its cost. `Available` · [Execution](../features.md#context-execution)
- **Answer permission requests.** Allow once, allow matching requests or deny an agent's tool request; approve your own Claude Code session's prompts remotely if you opt in. `Available` · [Participation](../features.md#context-participation)
- **Approve work agents propose.** Work Items an agent suggests wait for a person to approve or reject them. `Available` · [Work](../features.md#context-work)
- **Check the brief first.** A cheap model checks that a task can be acted on and asks questions before the first Run. `Available` · [Work](../features.md#context-work)
- **Merging stays with people.** Unfold opens the pull request; your forge and your reviewers decide the merge. `Available` · [Execution](../features.md#context-execution)
- **Who sees what.** Viewer, operator and administrator roles from your identity provider, and a per-person limit on which Teams they see. `Available` · [Participation](../features.md#context-participation)
- **Client Sign-off.** Record a Client's "looks good" or "needs changes" on the exact commit under review; API only for now. `In Labs` · [Offering](../features.md#context-offering)

## Security and isolation

- **Agents work in sandboxes.** Each workspace runs in a limited Docker container, a Kubernetes pod with egress rules, or a pre-warmed Kata sandbox (a lightweight virtual machine). `Available` · [Execution](../features.md#context-execution)
- **No master keys inside a workspace.** A workspace gets a scoped model key from Ploeg that is blocked when the work ends, and never your Kubernetes or another person's credentials. `Available` · [Execution](../features.md#context-execution)
- **Changes checked outside the agent.** Before publishing, the change is rebuilt outside the agent's workspace and its checks run in network-less containers from a pinned image. `Available` · [Execution](../features.md#context-execution)
- **Signed changes.** Each captured change carries an in-toto attestation you can verify offline; changes touching secret files are refused. `Available` · [Participation](../features.md#context-participation)
- **Secrets stopped at hand-off.** Handing your own uncommitted change to a Team is refused on any secret-scanner hit. `Available` · [Participation](../features.md#context-participation)
- **Editors sign in only with your approval.** An editor gets its own credential after you approve its code in the browser; AI apps get short-lived, route-limited tokens. `Available` · [Participation](../features.md#context-participation)
- **The person is proven to Ploeg.** Each change made for you carries a token exchanged from your own sign-in, once configured. `Available` · [Participation](../features.md#context-participation)
- **Separate Tenants and Clients.** With the Tenant boundary on, people reach only the repositories, tasks and Work Items of their own organisation and Client. `Available` · [Offering](../features.md#context-offering)
- **Tracker text treated as data.** Text from trackers and agents reaches AI apps marked as untrusted, so it is not followed as instructions. `Available` · [Participation](../features.md#context-participation)
- **Hardened by default.** A strict content security policy, cross-site request checks, rate limits, secret redaction in every answer and encrypted internal state. `Available` · [Shared kernel](../features.md)
- **Leavers lose access at once.** Deprovisioning a person in your identity provider ends every session and credential they hold. `In Labs` · [Participation](../features.md#context-participation)

## Cost and spend you can see

- **Spend per Run.** Each Run shows its spend, model and tokens, live against its budget. `Available` · [Execution](../features.md#context-execution)
- **Cost per merged Work Item.** Insights leads with merge rate and cost per merged Work Item, and says so when there is too little data. `Available` · [Execution](../features.md#context-execution)
- **Delivery ledger.** Each Work Item agents tried, with whether it was accepted and what every attempt cost, as CSV or JSON. `Available` · [Billing](../features.md#context-billing)
- **Cost per Client for FinOps.** A FOCUS 1.4 export per Run or per Work Item and day, with your organisation as billing account and the Client as sub-account. `Available` · [Billing](../features.md#context-billing)
- **Spend alerts in the editor.** The VS Code Agents window tells you at 50, 80 and 100 % of a budget. `Available` · [Participation](../features.md#context-participation)
- **Questions answered free when possible.** Asking about a Work Item answers from the record at no cost, and states the cost before any model call. `Available` · [Participation](../features.md#context-participation)
- **Your own agents' cost too.** Your Claude Code sessions show an API-price estimate beside the Runs Ploeg pays for. `Available` · [Participation](../features.md#context-participation)
- **Bill accepted work.** Send one line per accepted Work Item to your billing tool, at your own price per Client. `In Labs` · [Billing](../features.md#context-billing)

## Visibility and evidence

- **Full Run transcript.** The agent's messages, tool calls, edits as diffs and its plan, followed live. `Available` · [Execution](../features.md#context-execution)
- **Evidence before merge.** The reviewer's verdict, CI, settled spend and the agent's own account of what it changed and why. `Available` · [Work](../features.md#context-work)
- **Reviewer findings with answers.** Every finding with the writing agent's reply, unanswered ones first. `Available` · [Work](../features.md#context-work)
- **From pull request to production.** Pull request, CI, approval, merge and first deploy per environment, each with its time. `Available` · [Work](../features.md#context-work)
- **Who did what, from where.** Every change records the person, the app they used and whether they confirmed, exportable as CSV or JSON. `Available` · [Participation](../features.md#context-participation)
- **Can new work start?** A status page answers in plain words and names what to fix. `Available` · [System](../features.md#context-system)
- **Run health.** Running Runs are marked On track, Watch or Off track from their own behaviour. `Available` · [Execution](../features.md#context-execution)
- **Second opinions on running work.** A free model judges a Run's health, and a tripwire flags risky tool calls; both only advise and never act. `In Labs` · [Execution](../features.md#context-execution)
- **AI-written lines per commit.** Agent Trace records which lines an agent wrote in each commit. `Available` · [Participation](../features.md#context-participation)
- **Your own sessions in the picture.** Claude Code, OpenCode and Codex sessions report their state and commits next to Ploeg's Runs, never their prompt text. `Available` · [Participation](../features.md#context-participation)
- **A delivery brief you can hand on.** The Claude Code plugin turns the commands that proved a change into one page per audience, each claim marked verified or not. `Available` · [Work](../features.md#context-work)
- **Run Cards.** Each delivered change becomes a card with its cost, flow figures and life in production; a card describes a change, never a person. `Available` · [Cards](../features.md#context-cards)
- **Audit to your SIEM.** Audit records leave as OTLP logs or NDJSON. `In Labs` · [Shared kernel](../features.md)
- **Events to your systems.** Work Item, pull request and Run events as signed CloudEvents webhooks. `In Labs` · [Shared kernel](../features.md)

## Works where you work

- **Browser.** One app for desktop and phone, with keyboard shortcuts and a command palette. `Available` · [Shared kernel](../features.md)
- **VS Code.** Now, Tasks and Work views, hand-off, review and branch checkout, plus Work Items in the Agents window. `Available` · [Participation](../features.md#context-participation)
- **JetBrains, Zed and Neovim.** Use "unfold" as an ACP agent that follows one Work Item, streams its Run and asks before spending; not yet tried in a real install of those editors. `Experimental` · [Participation](../features.md#context-participation)
- **Claude Code.** Commands to claim a Run on your own seat, hand off your uncommitted change, take over and hand back. `Available` · [Participation](../features.md#context-participation)
- **AI apps over MCP.** Find, follow, hand off and approve work from Claude Code, claude.ai, ChatGPT or Copilot, with Work Item cards where the app shows them. `Available` · [Participation](../features.md#context-participation)
- **Follow a hand-off as an MCP task.** Claude Code's terminal follows a hand-off until its pull request is ready. `In Labs` · [Participation](../features.md#context-participation)
- **Tell your AI app when work needs you.** Apps such as ChatGPT subscribe to "needs you", "pull request ready" and "Run finished". `In Labs` · [Participation](../features.md#context-participation)
- **Chat with Unfold.** Ask the Unfold agent in VS Code's Agents window; it acts only after you confirm. `Available` · [Participation](../features.md#context-participation)
- **Messages to your own session.** Send a note to a running Claude Code session; it picks it up on its next prompt. `Available` · [Participation](../features.md#context-participation)

## Open, self-hosted, no lock-in

- **Open source.** Apache-2.0, with no feature held back from the open code. `Available` · [Who Unfold is for](../../../../docs/concepts/who-unfold-is-for.md)
- **Runs on your own cluster.** One Helm chart carries the Ploeg it was tested with; Docker Compose for local use. A guide covers [self-hosting the whole stack in the EU](../../../../docs/how-to/self-host-the-whole-stack.md). `Available` · [Release](../features.md#context-release)
- **Choose your models.** Any provider behind your LiteLLM gateway, a provider and region allow-list for work started in Unfold, and a "Where your data goes" view. `Available` · [Execution](../features.md#context-execution)
- **Take your data with you.** Export everything Unfold holds for a Tenant as JSON Lines with a schema per file. `In Labs` · [Offering](../features.md#context-offering)
- **Try it without spending.** A deterministic demo with illustrative records that makes no model calls and spends nothing. `Available` · [System](../features.md#context-system)

Standards it speaks:

- MCP (revision 2026-07-28, with the Apps extension), ACP, VS Code's Agent Host Protocol, OIDC with RFC 8693 token exchange, in-toto, Agent Trace, OCSF 1.9.0 audit records, FinOps FOCUS 1.4, OpenFeature with flagd and OFREP, and OTLP. `Available` · [Tooling](../features.md#context-tooling)
- CloudEvents 1.0 over Standard Webhooks, MCP Tasks and Events, SCIM 2.0, Shared Signals (CAEP and RISC) and UBL 2.1. `In Labs` · [Tooling](../features.md#context-tooling)

## What's new here

Each item says why it matters and what the [market landscape](../research/market-landscape.md) and the fit records found. Where no record shows the idea is unusual, the item says only that it is built in.

- **A budget before the spend.** It matters because a stuck agent cannot run up a bill. The surveys found [Fullsend](../../../../docs/research/2026-10-27-fullsend-fit.md) with no budget before spend, [Hive](../../../../docs/research/2026-10-27-hive-fit.md) with a soft weekly estimate, and LiteLLM's `agent()` reporting cost after the call. `Available`
- **Changes verified outside the agent and signed.** It matters because the agent cannot mark its own homework. The [sandbox landscape](../research/2026-09-10-sandbox-landscape.md) found nobody combining agent provenance records with signing, and the market landscape counts signed changes among what no surveyed vendor carries. `Available`
- **Forgejo as a first-class forge.** It matters for teams who host their own code. The October refresh found no large commercial vendor supporting Forgejo or Gitea; OpenHands does. `Available`
- **Control plane and agents both on your infrastructure.** It matters when code and transcripts must stay in-house. Only Coder Agents and OpenHands do both among the products surveyed; the model labs keep the control plane in their cloud. `Available`
- **A Client approves the exact commit.** It matters for agencies whose clients sign off on work. The surveys found that elsewhere "approval" means an AI approving or a person approving a plan, and none lets an agency's client approve ready work. `In Labs` (API only; the Client Portal is Planned)
- **Billing per accepted Work Item.** It matters because an agency charges for delivered work. The October refresh found every other product billing per seat, credit, token or ACU. `In Labs`
- **A hand-off you follow as an MCP task.** It matters because your AI app tracks the work until the pull request is ready. The [MCP extensions fit record](../research/2026-10-30-mcp-extensions-fit.md) found no competitor's MCP server returning tasks. `In Labs`
- **Take over a running agent and hand it back.** It matters when an agent is close but stuck. Built in. `Available`
- **Your own agent sessions beside the agents' Runs.** It matters because people and agents work the same backlog, and collisions on one branch are flagged. Built in. `Available`

## Coming next

- **Client Portal.** Clients send requests, approve Work Items and sign off ready work in one place, with an Approver per Client. `Planned` · [Offering](../features.md#context-offering)
- **Hosted Unfold for agencies.** A hosted service on a rented EU cluster, one Tenant per agency. `Planned` · [Offering](../features.md#context-offering)
- **Quotes per Work Item.** A Size and a price agreed before work starts, with the fee charged only on acceptance. No prices are published. `Planned` · [Billing](../features.md#context-billing)
- **A preview environment per pull request.** Every pull request gets a running preview to look at. `Planned` · [Work](../features.md#context-work)
- **Knowledge per organisation.** Agents briefed from a knowledge base kept per Tenant. `Planned` · [Execution](../features.md#context-execution)
- **Choose the agent tool per Work Item.** Work started in Unfold runs inside Ploeg with the agent tool picked per Work Item. `Planned` · [Execution](../features.md#context-execution)
- **Shared accounts within an organisation.** Projects share tracker accounts and repositories inside one Tenant. `Planned` · [Offering](../features.md#context-offering)
