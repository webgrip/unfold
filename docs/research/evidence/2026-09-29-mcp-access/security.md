# MCP security and threat model

> Raw research-agent report, 2026-09-29, kept as evidence for [the MCP access dossier](../../2026-09-29-mcp-access.md). Agent output, not independently verified line by line; the dossier states which claims were checked first-hand.

MCP security research for Glide (Ploeg as MCP server, and MCP servers handed to agents in workers). Crawled 2026-09-29. Every claim below has a source URL. Where a source is secondary or vendor-written, I say so.

## 0. Spec baseline
- The current MCP revision is **2026-07-28**. It removes protocol sessions and `Mcp-Session-Id` (state now travels as explicit server-minted handles), deprecates Dynamic Client Registration in favour of Client ID Metadata Documents (CIMD), adds RFC 9207 `iss` validation (clients MUST validate a present `iss`), and binds client credentials to the issuer that issued them. It also moves tasks into an extension and replaces server-initiated elicitation with Multi Round-Trip Requests (a tool returns `InputRequiredResult`). Source: https://modelcontextprotocol.io/specification/2026-07-28/changelog
- Security BP page (current): https://modelcontextprotocol.io/specification/2026-07-28/basic/security_best_practices . Previous version: https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices

## 1. Attacks named on the MCP Security Best Practices page (2026-07-28), with the mandated mitigation
1. **Confused Deputy** (an MCP proxy using a static client ID + dynamic registration + a third-party consent cookie). Proxy servers "**MUST** implement per-client consent":
   - keep a per-user registry of approved `client_id`s and check it before the third-party flow;
   - the consent page MUST name the client, show the scopes and the `redirect_uri`, have CSRF protection, and block framing (`frame-ancestors` / `X-Frame-Options: DENY`);
   - consent cookies MUST use the `__Host-` prefix, `Secure`, `HttpOnly`, `SameSite=Lax`, be signed, and be bound to the `client_id`;
   - `redirect_uri` MUST match exactly (no wildcards);
   - `state` MUST be cryptographically random, single-use and short-lived (~10 min), and stored only after consent.
2. **Token Passthrough.** "MCP servers **MUST NOT** accept any tokens that were not explicitly issued for the MCP server." The authorization spec adds: servers "**MUST** validate that access tokens were issued specifically for them as the intended audience" (RFC 8707), and "**MUST NOT** accept or transit any other tokens". Clients MUST send the `resource` parameter. Tokens MUST NOT go in query strings. Source: https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
3. **SSRF during OAuth discovery** (`resource_metadata`, `authorization_servers`, and the endpoints in AS metadata). Clients "**MUST** consider SSRF risks". They SHOULD:
   - require HTTPS;
   - block 10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, fc00::/7 and fe80::/10;
   - validate every redirect hop;
   - use an egress proxy (Smokescreen);
   - pin DNS between check and use.
   New in this revision: **SSRF against authorization servers** that fetch CIMD URLs. The same mitigations apply.
4. **State Handle Hijacking** (replaces Session Hijacking). "**MUST** verify all inbound requests. MCP servers **MUST NOT** treat possession of a state handle as authentication." Handles SHOULD be random and expiring, and SHOULD be bound server-side as `<user_id>:<handle>`, with the user ID taken from the verified token. The 2025-11-25 version said the same about session IDs: "**MUST NOT** use sessions for authentication" and "**MUST** use secure, non-deterministic session IDs".
5. **Local MCP Server Compromise** (malicious startup command, malicious payload, DNS rebinding). One-click config "**MUST** implement proper consent" and "**MUST** show the exact command… without truncation". Clients SHOULD sandbox with minimal privileges and restricted filesystem and network. Local servers SHOULD use stdio, or HTTP with a token or a unix socket.
6. **OAuth Authorization URL Validation** (XSS through `javascript:`, command injection through shell open). Clients MUST allow only http(s), MUST reject `javascript:`, `data:`, `file:` and `vbscript:`, "**MUST NOT** use shell commands… to open URLs", MUST sanitize URLs, and SHOULD set a CSP.
7. **stdio Transport Security in Proxy Scenarios** (XSS leads to a stolen proxy token, which leads to arbitrary stdio spawn). Proxies SHOULD sandbox spawned processes, restrict the filesystem, log all stdio use, and require extra authorization for dangerous commands.
8. **Mix-Up Attacks** (new). Validate `iss` against the issuer recorded before the redirect. "PKCE alone does not prevent this attack."
9. **Localhost Redirect URI Impersonation** (new, CIMD). The authorization server should warn on localhost-only redirect URIs and display the redirect host.
10. **CIMD Trust Policies** (new). Domain allowlists, reputation checks, domain-age checks, and prominent display of the client hostname.
11. **Scope Minimization.** Start with a minimal scope (e.g. `mcp:tools-basic`). Elevate through `WWW-Authenticate scope=` challenges. Log elevation events with correlation IDs. Listed common mistakes: omnibus scopes (`*`, `all`, `full-access`), publishing every scope in `scopes_supported`, and "Treating claimed scopes in token as sufficient without server-side authorization logic".

**Related normative text:**
- **Tools page.**
  - "there **SHOULD** always be a human in the loop with the ability to deny tool invocations".
  - Servers "**MUST**: Validate all tool inputs; Implement proper access controls; Rate limit tool invocations; Sanitize tool outputs".
  - Clients SHOULD prompt on sensitive operations, show inputs, set timeouts, and log for audit.
  - "clients **MUST** consider tool annotations to be untrusted unless they come from trusted servers".
  - `tools/list` "**MAY** vary by the authorization presented on the request".
  - Source: https://modelcontextprotocol.io/specification/2026-07-28/server/tools
- **ToolAnnotations** (hints only). Defaults: `readOnlyHint` false, `destructiveHint` true, `idempotentHint` false, `openWorldHint` true. "Clients should never make tool use decisions based on ToolAnnotations received from untrusted servers." Source: https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/schema/2025-11-25/schema.ts
- **Elicitation.**
  - Servers "**MUST NOT** use form mode… to request… passwords, API keys, access tokens, or payment credentials".
  - Servers "**MUST** bind elicitation requests to the client and user identity".
  - Clients MUST show which server is asking and MUST offer decline and cancel.
  - URL mode: clients MUST NOT prefetch, MUST get consent, and MUST show the full URL; servers MUST verify the user who opens the URL is the one who started the elicitation (anti-phishing).
  - Responses are `accept`, `decline` or `cancel`.
  - Source: https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation

## 2. Real incidents and CVEs, 2025–2026 (one-line root cause each)
- **Invariant Labs tool poisoning / rug pull / shadowing**, 2025-04-01. Hidden instructions in tool descriptions, descriptions that change after approval, and cross-server shadowing. https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks
- **WhatsApp MCP exfiltration**, 2025-04-07. A malicious co-installed server used a sleeper rug pull to make whatsapp-mcp send history to an attacker's number. https://invariantlabs.ai/blog/whatsapp-mcp-exploited
- **GitHub MCP "toxic agent flow"**, 2025-05-26. A malicious public issue led an over-scoped PAT to read private repos and leak them in a public PR. The flaw is architectural; the fix was "one repo per session" and least privilege. https://invariantlabs.ai/blog/mcp-github-vulnerability
- **Asana MCP cross-tenant leak.** Launched 2025-05-01, found 2025-06-04, offline 06-05 to 06-17, about 1,000 orgs affected. "Logic flaw", not a hack: tenant isolation failed in the MCP layer. https://www.bleepingcomputer.com/news/security/asana-warns-mcp-ai-feature-exposed-customer-data-to-other-orgs/ , https://www.theregister.com/security/2025/06/18/asana-mcp-server-back-online-after-plugging-a-data-leak-hole/1199951
- **MCP Inspector RCE, CVE-2025-49596** (CVSS 9.4, fixed in 0.14.1, June 2025). No auth between the Inspector UI and its proxy; exploitable through 0.0.0.0 / CSRF / DNS rebinding. https://www.oligo.security/blog/critical-rce-vulnerability-in-anthropic-mcp-inspector-cve-2025-49596
- **Smithery.ai hosting**, disclosed 2025-06-13. Path traversal via `dockerBuildPath: ".."` leaked a fly.io token controlling more than 3,000 hosted MCP servers. https://blog.gitguardian.com/breaking-mcp-server-hosting/
- **Supabase MCP**, 2025-07-06. Support-ticket text plus an agent holding `service_role` (bypasses RLS) exfiltrated `integration_tokens` into the ticket thread. This is the lethal trifecta inside one server. https://simonwillison.net/2025/Jul/6/supabase-mcp-lethal-trifecta/
- **Filesystem MCP "EscapeRoute", CVE-2025-53109/53110** (fixed in 2025.7.01). A symlink or prefix check escaped the allowed directories. https://cymulate.com/blog/cve-2025-53109-53110-escaperoute-anthropic/
- **mcp-remote, CVE-2025-6514** (CVSS 9.6, published 2025-07-09, fixed in 0.1.16). A crafted `authorization_endpoint` gave OS command injection on the client. https://jfrog.com/blog/2025-6514-critical-mcp-remote-rce-vulnerability/
- **Cursor CurXecute, CVE-2025-54135** (2025-08-01) and **MCPoison, CVE-2025-54136** (2025-08-05). A prompt injection writes `mcp.json`, which auto-executes; an approval, once given, was never re-checked when the config changed. https://research.checkpoint.com/2025/cursor-vulnerability-mcpoison/ , https://www.catonetworks.com/blog/curxecute-rce/
- **postmark-mcp**, the first in-the-wild malicious MCP server. Malicious v1.0.16 on 2025-09-17: a typosquat/impersonation built trust over 15 versions, then added a one-line BCC of every email. https://thehackernews.com/2025/09/first-malicious-mcp-server-found.html
- **Shai-Hulud npm worm**, Sept and Nov 2025. Later variants drop fake MCP servers carrying injection payloads that harvest SSH keys and LLM tokens. https://labs.cloudsecurityalliance.org/research/csa-research-note-shai-hulud-npm-worm-ai-developer-supply-ch/
- **Claude Code project files, CVE-2025-59536 and CVE-2026-21852** (Check Point, published 2026-02-25):
  - `.claude/settings.json` hooks gave RCE;
  - `enableAllProjectMcpServers` bypassed MCP consent;
  - `ANTHROPIC_BASE_URL` in repo settings exfiltrated the API key.
  - https://research.checkpoint.com/2026/rce-and-api-token-exfiltration-through-claude-code-project-files-cve-2025-59536/
- **Anthropic Git MCP server, CVE-2025-68143/68144/68145** (Cyata, 2026-01-20). Path traversal, argument injection and a repo-scope bypass, chained with Filesystem MCP into `.git/config`, gave RCE from prompt injection alone. https://thehackernews.com/2026/01/three-flaws-in-anthropic-mcp-git-server.html
- **OX Security "MCP by design" STDIO RCE**, 2026-04-15. The SDKs pass config straight into process exec, producing 10+ downstream CVEs. https://labs.cloudsecurityalliance.org/research/csa-research-note-mcp-by-design-rce-ox-security-20260420-csa/
- **LiteLLM CVE-2026-30623** (2026-04-21). This is in Glide's dependency. MCP-server creation passed `command` unvalidated to stdio, giving authenticated RCE (PROXY_ADMIN). Fixed in v1.83.7-stable with a launcher allowlist. https://docs.litellm.ai/blog/mcp-stdio-command-injection-april-2026
- **Adversa "TrustFall"** (2026-05-07). Claude Code, Cursor CLI, Gemini CLI and Copilot CLI auto-start project-defined MCP servers once the user accepts folder trust. Anthropic says this is out of scope. https://adversa.ai/blog/trustfall-coding-agent-security-flaw-rce-claude-cursor-gemini-cli-copilot/
- **Kong Konnect MCP, CVE-2026-13341** (2026-07-03, CVSS 7.4). Indirect prompt injection via analytics data caused unintended API calls (confused deputy). https://nvd.nist.gov/vuln/detail/CVE-2026-13341

## 3. The lethal trifecta applied to "an MCP tool that dispatches spending Runs from client ticket text"
- **Definition:** "Access to your private data", "Exposure to untrusted content", "The ability to externally communicate". "The problem with Model Context Protocol… is that it encourages users to mix and match tools". On guardrails: "95% is very much a failing grade". Advice: "avoid that lethal trifecta combination entirely". https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/
- **Meta "Agents Rule of Two"** (2025-10-31). Within one session, satisfy at most two of: [A] process untrustworthy input, [B] access sensitive systems or private data, [C] change state or communicate externally. https://ai.meta.com/blog/practical-ai-agent-security/
- **Design patterns paper** (Beurer-Kellner et al.): Action-Selector, Plan-Then-Execute, LLM Map-Reduce, Dual LLM, Code-Then-Execute, Context-Minimization. It includes case studies of a software-engineering agent and a customer-service bot. https://arxiv.org/abs/2506.08837
- **How it maps to Glide** (my synthesis, derived from the sources above):
  - A client ticket is [A]: untrusted content, like the Supabase support ticket and the GitHub issue.
  - The customer repo and secrets are [B].
  - Opening a PR, pushing, egress, and triggering further spending Runs are [C].
  - An MCP `dispatch_run` tool adds a new [C] that costs money. It also adds a recursion path: a Run reads ticket text, the text tells it to call dispatch, which creates more Runs (denial of wallet).
  - An LLM client connected to Ploeg-MCP *and* to other servers (email, web) completes the trifecta outside Glide's control.
- **Documented mitigations:**
  - Human approval: MCP Tools "SHOULD… human in the loop"; OWASP LLM06 "require a human to approve high-impact actions"; OWASP cheat sheet "Require explicit user confirmation for destructive, financial, or data-sharing operations" and "Ensure confirmation UI cannot be bypassed by LLM-crafted responses".
  - Annotations: destructive annotations are hints only and untrusted from untrusted servers, so they are no control on the server side.
  - Elicitation confirmation: return `InputRequiredResult` with a form elicitation, and handle `decline`/`cancel`. Elicitation MUST be bound to the client and user identity.
  - Read-only toolsets: Supabase read-only mode "remove[s] one leg"; GitHub Copilot agent docs say tools run "autonomously, and will not ask for approval", so allowlist only needed tools (https://docs.github.com/en/copilot/concepts/agents/coding-agent/mcp-and-coding-agent).
  - Per-tool scopes: spec step-up `insufficient_scope` / 403 flow.
  - Budget caps: see §6.
  - Complete mediation: OWASP LLM06, "Implement authorization in downstream systems rather than relying on an LLM". https://genai.owasp.org/llmrisk/llm062025-excessive-agency/

## 4. OWASP items relevant to Glide
- **OWASP MCP Top 10 (2025, beta).** https://owasp.org/www-project-mcp-top-10/
  - MCP01 Token Mismanagement & Secret Exposure
  - MCP02 Privilege Escalation via Scope Creep
  - MCP03 Tool Poisoning
  - MCP04 Supply Chain & Dependency Tampering
  - MCP05 Command Injection & Execution
  - MCP06 Prompt Injection via Contextual Payloads
  - MCP07 Insufficient AuthN/AuthZ
  - MCP08 Lack of Audit and Telemetry
  - MCP09 Shadow MCP Servers
  - MCP10 Context Injection & Over-Sharing (cross-tenant context)
  - All ten apply. The most relevant for Glide are 01, 02, 06, 07, 08 and 10.
- **OWASP Top 10 for Agentic Applications (Dec 2025).** https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/
  - ASI01 Agent Goal Hijack (ticket text)
  - ASI02 Tool Misuse
  - ASI03 Identity & Privilege Abuse
  - ASI04 Agentic Supply Chain
  - ASI05 Unexpected Code Execution
  - ASI06 Memory & Context Poisoning
  - ASI07 Insecure Inter-Agent Communication
  - ASI08 Cascading Failures ("work can create work" loops)
  - ASI09 Human-Agent Trust Exploitation (plausible explanations that get approvals)
  - ASI10 Rogue Agents
- **OWASP LLM Top 10 2025:** LLM01 Prompt Injection, LLM06 Excessive Agency, and LLM10 Unbounded Consumption ("Denial of Wallet… exploit the cost-per-use model"). Mitigations: rate limiting, user quotas, timeouts/throttling, queue limits, anomaly monitoring. https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/
- **OWASP MCP Security Cheat Sheet.** https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html
  - "Pin tool definitions using cryptographic hashes and alert on any changes"
  - `additionalProperties: false`
  - "Never auto-approve tool calls in multi-server setups"
  - "Apply rate limits, quotas, and timeouts per session/tenant"
  - "Treat every tool response as untrusted user input"
  - log every invocation with parameters and user context; redact secrets
  - re-prompt for consent when tool definitions change
  - use a gateway for cross-server isolation

## 5. Multi-tenant SaaS and agents-in-sandboxes guidance
**Exposing Ploeg as a multi-tenant MCP server (A):**
- Token audience binding: RFC 8707 `resource` plus audience validation, no passthrough (spec, §1).
- Per-tenant isolation (CSA draft 2026-03-27): "Run regular cross-tenant isolation tests — provisioning distinct test tenants, seeding them with canary data"; tenant identity as a mandatory filter at every data layer; segment at storage, not only at query. https://labs.cloudsecurityalliance.org/agentic/agentic-mcp-security-best-practices-v1/
- AWS AgentCore Gateway pattern: `tenant_id` JWT claim, an interceptor enforcing isolation before the LLM sees tools, on-behalf-of token exchange with one audience per target, and "Do not reuse tokens between tools and servers". https://aws.amazon.com/blogs/machine-learning/apply-fine-grained-access-control-with-bedrock-agentcore-gateway-interceptors/ , https://aws.amazon.com/blogs/machine-learning/implement-on-behalf-of-token-exchange-for-multi-tenant-agents-with-amazon-bedrock-agentcore-gateway/
- Audit: CSA says log enough "to reconstruct the full context of each call" and keep at least 90 days. For the NSA CSI (U/OO/6030316-26, May 2026) I could not fetch the primary PDF (403). Press summaries say it recommends logging parameters, identities and result hashes: https://techinformed.com/nsa-warns-enterprises-over-security-gaps-in-ai-agent-protocol/
- Consent screens: the MCP-level consent requirements in §1.1.

**MCP servers consumed by agents in workers (B):**
- **Egress.** CSA: "Outbound network access should be blocked by default and permitted only to explicitly whitelisted external endpoints". Claude Code's sandbox routes all egress through an allowlist proxy; network isolation "removes the data exfiltration leg" (https://claude.com/blog/beyond-permission-prompts-making-claude-code-more-secure-and-autonomous). Caveat: GitHub's Copilot agent firewall "does not apply directly to Model Context Protocol (MCP) server processes". MCP servers are an egress bypass unless they are confined separately. https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/customize-the-agent-firewall
- **Credential scoping.** One service account per server with minimum permissions, with scopes defined per tool (CSA). The Copilot GitHub MCP defaults to a read-only token for the current repo.
- **Repository-supplied MCP config** (Claude Code docs). With `claude -p` or the SDK in an untrusted folder, `.mcp.json` servers are "Connected without asking, approved or not". Hooks, the `env` block and `apiKeyHelper` are "Used". Mitigations: `--strict-mcp-config`, `--settings '{"disableAllHooks": true}'`, `--setting-sources user`, `--bare`, `disabledMcpjsonServers`. https://code.claude.com/docs/en/permissions (the "What runs before you trust a folder" section), https://code.claude.com/docs/en/mcp
  - **Glide status:** Ploeg ADR-0030 already passes `--strict-mcp-config` and `disableAllHooks` for `claude-code`, and `harnesstest/live_test.go` covers it. ADR-0030 itself records two gaps:
    - "the project `env` block in `.claude/settings.json` still applies". That is the CVE-2026-21852-style `ANTHROPIC_BASE_URL` key-exfiltration shape; egress is the stated mitigation.
    - openhands, acp and exec are unchanged. I found no evidence of how opencode, Goose or Qwen Code treat project MCP config; that is unverified.
    - Files: apps/ploeg/docs/adrs/0030-target-repository-instructions-rank-below-the-delivery-contract.md , apps/ploeg/pkg/harness/adapters/claudecode/claudecode.go
- **Gateways:**
  - **Docker MCP Gateway.** Bearer token required on HTTP by default. Signature verification is on by default for `mcp/` images, which must be pinned by digest. Containers get `no-new-privileges` and CPU/memory limits, and no host env. Remote URLs must be public HTTPS (private and metadata IPs blocked). `--block-network`, `allowHosts`, `disableNetwork`, `--block-secrets` (on by default), `--log-calls` (logs argument shape only), and tool-name collision rejection. https://github.com/docker/mcp-gateway (docs/security.md)
  - **LiteLLM MCP gateway.** Server and tool access by key, team or org, with intersection semantics ("most-restrictive wins"). `mcp_tool_permissions`, `allowed_tools`/`disallowed_tools`/`allowed_params`, and `mcp_rpm_limit`. https://docs.litellm.ai/docs/mcp_control
  - **agentgateway (Linux Foundation).** Per-tool CEL RBAC on JWT claims, deny by default, enforced both at list and at call time. https://agentgateway.dev/docs/standalone/latest/mcp/mcp-authz/
  - **Microsoft mcp-gateway.** K8s reverse proxy with Entra ID bearer plus app-role RBAC on the control and data planes. https://github.com/microsoft/mcp-gateway

## 6. Spend and abuse controls for tools that trigger expensive work
- **Authoritative sources:**
  - Spec: servers "MUST… Rate limit tool invocations".
  - OWASP LLM10: quotas, throttling, timeouts, queue limits.
  - Cheat sheet: per-tenant quotas.
  - LiteLLM: `mcp_rpm_limit` per key/team/server; MCP cost tracking with `default_cost_per_query` / `tool_name_to_cost_per_query`; customer budgets return 429 when exceeded (https://docs.litellm.ai/docs/mcp_cost).
- **Elicitation confirmation** before a costly step: a form elicitation with a boolean, via the MRTR `InputRequiredResult`. Bound to the user; decline and cancel must be handled.
- **Dry-run / quote-then-confirm:** returns the estimate plus a short-lived confirmation token, and the preview must not itself spend. These are blog-level sources only, with no standard: https://dev.to/jackm-singularity/mcp-tool-budget-for-ai-saas-stop-agents-from-burning-tokens-tools-and-trust-1n99 , https://github.com/MatthewLacerda2/scorsese/issues/538
- **Absence:** I found no MCP-spec-level cost or budget primitive, and no standard "dry-run" annotation.

## 7. Supply chain for MCP servers
- **Official MCP Registry** (preview) provides namespace authentication only: GitHub OAuth for `io.github.*`, DNS or HTTP challenge for domains. Package ownership checks:
  - npm: `mcpName` in package.json;
  - PyPI, NuGet, Cargo: `mcp-name:` in the README;
  - OCI: the `io.modelcontextprotocol.server.name` label;
  - MCPB: `fileSha256`.
  - It "delegates security scanning" to package registries and aggregators, does not support private servers, and recommends a private registry for those.
  - https://modelcontextprotocol.io/registry/about , https://modelcontextprotocol.io/registry/package-types
- **Pinning:** pin by digest (Docker gateway), pin versions, use a private registry in production, and keep an SBOM (CSA). Hash tool definitions and re-approve when they change: OWASP cheat sheet; Snyk Agent Scan (formerly mcp-scan) does rug-pull hash diffing (https://invariantlabs.ai/blog/introducing-mcp-scan).
- **Absence:** the MCP spec has no normative server signing requirement. Sigstore for MCP appears only in academic proposals (e.g. https://doi.org/10.3390/fi18050243).

## 8. Proposed security acceptance criteria (derived from the above)
**(A) Ploeg as an MCP server**
- A1. Remote MCP uses OAuth 2.1 resource-server semantics. Tokens carry `aud` = Ploeg's canonical MCP URI, and any other audience gets a 401. Existing operator and reader tokens are never forwarded downstream. LiteLLM and forge credentials are Ploeg's own, not the client's.
- A2. Scopes: the baseline is read-only (reader-equivalent). `workitem:propose`, `run:dispatch` and `shift:cancel` are separate scopes obtained by step-up (403 `insufficient_scope`). No omnibus scope exists. Authorization is enforced server-side per call, never taken from token claims or annotations alone.
- A3. Every tool call is authorized against (tenant, principal, Work Item) at call time. Handles such as run and shift IDs are keyed `<principal>:<handle>` and are never authentication.
- A4. Tenant ID comes from the verified token and filters every storage query. CI runs a canary cross-tenant test.
- A5. No MCP tool starts a spending Run without a human approval recorded in Ploeg. That approval is an out-of-band owner approval, or an elicitation bound to the user and showing estimated cost, budget remaining and Work Item text provenance. `decline`/`cancel` means no spend. Runs proposed from ticket text or by other Runs keep going through the existing owner-approval gate.
- A6. Budgets are enforced in Ploeg before dispatch: per tenant, per principal, per Work Item and per Shift. There are rpm limits on MCP calls, a cap on dispatch fan-out and recursion depth for "work creates work", timeouts, and an estimate-only tool that spends nothing.
- A7. Tool results that echo third-party ticket text are labelled untrusted and delimited. Tools are split so no single token holds read-private, ingest-untrusted and dispatch/communicate together (Rule of Two).
- A8. An audit log per call records principal, tenant, tool, argument hash, decision, approval ID and cost, with at least 90-day retention and secrets redacted.
- A9. The MCP-level consent page (if Ploeg brokers third-party OAuth) meets §1.1. Clients are accepted via CIMD with a domain allowlist; open DCR is off.
- A10. `tools/list` is filtered by scope and is deterministic. Tool definitions are versioned; any change is announced and re-consented.

**(B) MCP servers inside worker sandboxes**
- B1. Target-repository MCP, hooks and settings never load: `--strict-mcp-config`, `disableAllHooks`, and an equivalent verified for every harness (opencode, Goose, Qwen Code, OpenHands), each with a conformance test. Close the `env`-block gap from ADR-0030.
- B2. Only operator-allowlisted servers run, pinned by digest or version and hash, with tool-definition hashes pinned. Any drift fails the Run.
- B3. MCP server processes sit under the same default-deny egress allowlist as the agent, and the platform applies it (GitHub firewall caveat). There is no path to metadata IPs or the cluster network.
- B4. Credentials are per Run, per server, short-lived and least-privilege (repo-scoped, read-only by default). No customer secret is in agent context. The LiteLLM key is per Run and budget-capped, so an `ANTHROPIC_BASE_URL`-style leak is bounded.
- B5. Only read-only tools are enabled by default. Write or open-world tools need an explicit Work Item grant.
- B6. LiteLLM is at v1.83.7-stable or later (CVE-2026-30623). LiteLLM's own MCP-server creation is disabled or PROXY_ADMIN-restricted.
- B7. The gateway (LiteLLM, Docker MCP Gateway, or agentgateway) logs every tool call and scans for secrets.
