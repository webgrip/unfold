---
type: how-to
audience: [operator, integrator, contributor]
owner: unfold
last_verified: 2026-10-25
verified_by: "src/coderabbit*.ts, public/views/coderabbit.js and test/coderabbit*.test.*, test/api-coderabbit.test.ts; vendor CLI and API documentation checked 2026-10-25. Live provider qualification remains outstanding."
---

# Use CodeRabbit evidence

CodeRabbit adds supplemental review evidence to a live Ploeg-managed session. A person requests a remote review of a pushed GitHub commit or imports existing security findings. The delivery gate still requires its independent checks and human acceptance. [ADR 0056](../adrs/0056-coderabbit-is-supplemental-external-review-evidence.md) records this boundary.

## Prepare access

1. Install CodeRabbit for the target GitHub Cloud repository. Choose an organization whose assigned user has a seat, create an Agentic API key for reviews, and check its region. Remote reviews require CLI 0.7.7 or later; use 0.9.0 or later for titles, comments and line ranges. Put a verified, version-pinned binary in a trusted workbench image, outside `dataDir`, and record its SHA-256. Unfold checks that digest before invoking it and never downloads or updates the CLI.
2. For security imports, create a separate **non-agentic** API key with `security:read`. Obtain the exact Git-provider repository and organization IDs. Importing only reads completed scan inventories; it does not start scans.
3. Keep both keys in OpenBao and expose references in the workbench environment. Use a separate key per client organization. Neither environment name may be in `runtime.agentEnvironment` or reuse the Ploeg, delivery, publisher or other declared control-service credential names. Keep the Kubernetes Secrets out of `workspaceAgentSecrets` and all agent images.

The person holding the credentials can write them to the deployment's approved OpenBao path with this command, using their securely supplied environment values. Then configure the deployment's existing secret synchronization to create the referenced Kubernetes Secret. Unfold never receives an OpenBao administration credential:

```sh
bao kv put "$CODERABBIT_SECRET_PATH" agentic-key="$CODERABBIT_AGENTIC_KEY" security-key="$CODERABBIT_SECURITY_KEY"
```

See the official [headless setup](https://docs.coderabbit.ai/cli/headless-cli-integration), [remote review limitations](https://docs.coderabbit.ai/cli/index#review-without-a-local-checkout), [agent output contract](https://docs.coderabbit.ai/cli/agent-mode) and [security findings API](https://docs.coderabbit.ai/api-reference/security-scans-code-list).

## Configure the workbench

Add this optional block to the existing live configuration, replacing the repository binding and CLI digest with operator-approved values. Credentials are environment references, never values:

```json
{
  "coderabbit": {
    "cli": {
      "binary": "/opt/coderabbit/coderabbit",
      "sha256": "<64 lowercase hexadecimal characters>",
      "timeoutMs": 1200000
    },
    "dailyReviewLimit": 5,
    "repositories": [{
      "repositoryId": "registered-repository-id",
      "github": "example/project",
      "base": "main",
      "region": "eu",
      "agenticKeyEnv": "CLIENT_CODERABBIT_REVIEW_KEY",
      "security": {
        "keyEnv": "CLIENT_CODERABBIT_SECURITY_KEY",
        "repositoryId": "123456",
        "organizationId": "789012"
      }
    }]
  }
}
```

Omit `cli` and `agenticKeyEnv` for security imports alone; omit `security` for reviews alone. Configuration is rejected in demo mode. An operator may explicitly bind a GitHub mirror to a registered Forgejo repository, but Unfold does not establish that the mirror matches the frozen candidate.

With Helm, put this block under `config.coderabbit`, use a trusted image containing the pinned binary, and reference existing workbench-only Secrets:

```yaml
coderabbitSecrets:
  - name: CLIENT_CODERABBIT_REVIEW_KEY
    existingSecret: client-coderabbit
    key: agentic-key
  - name: CLIENT_CODERABBIT_SECURITY_KEY
    existingSecret: client-coderabbit
    key: security-key
```

The chart refuses those Secrets in `workspaceAgentSecrets`. It does not create credentials, change a subscription or deploy itself. The local CLI auth command briefly receives the Agentic key as a process argument, as required by its documented interface. Run the workbench on a trusted host where unrelated users cannot inspect its processes. Its temporary auth directory has private permissions, is separate from agent workspaces and is removed after the command. No operator environment is inherited by the CLI.

## Review and inspect evidence

Open the session's **CodeRabbit evidence** card. Enter the full 40-character SHA of a commit already available in the configured GitHub repository. Accept the provider billing notice for this request, then request the review. CodeRabbit compares that source commit against the merge base of the configured base reference. The base reference may move: this is external GitHub review evidence, not proof of an exact match to Unfold's canonical candidate or its approved base.

Refresh to inspect completion, partial findings or failure. Session events also refresh the card. The newest review includes findings; older records remain available through **Open saved review evidence**. Findings and fix instructions are untrusted text; Unfold never executes them, pushes changes or approves delivery from them.

Each request has a durable idempotency key. Replaying it returns the existing record; using it for another scope is rejected. A restart records unresolved requests as interrupted when read and never retries them. Stopping a review kills local supervision, but cannot undo processing or billing already performed at CodeRabbit. A late result cannot replace cancellation.

The default limit is five new requests per registered repository per UTC day, counting failed and cancelled attempts. The configurable range is 1–100, with at most two reviews globally and one per repository in flight. These are request limits, **not dollar budgets**. No `--use-credits` flag is passed; provider-side automatic usage settings can still affect billing. Provider cost stays unknown and is never added to Ploeg's measured inference spend. Check the provider allowance and overage settings before enabling access.

Use **Import security findings** for an explicitly refreshed inventory. Each row must match both configured IDs; a scope mismatch or incomplete pagination rejects the whole import and preserves the previous snapshot. Imports are bounded to 20 pages, 1,000 rows per page, 2 MiB per page, 8 MiB normalized storage and 30 seconds. Only the primary scan ID, revision and evidence availability are retained from provenance; cross-repository context is excluded. Scan revision and import time are separate facts, and a finding without provenance remains unverified.

## Availability and qualification

This adapter supports GitHub Cloud remote reviews and the documented cloud findings endpoint. It does not support remote reviews of unpublished changes, Forgejo, GitHub Enterprise or self-hosted CodeRabbit. CodeRabbit runtime reproduction and cloud coding tasks are not wired into this adapter: no verified headless runtime-verification API was established, and cloud tasks require browser SaaS authentication rather than an Agentic key. See the vendor's [cloud task requirements](https://docs.coderabbit.ai/cli/cloud-tasks) and [runtime verification guide](https://docs.coderabbit.ai/security/runtime-verification).

Local tests exercise the subprocess contract, response validation, authorization, redaction, limits, cancellation and restart recovery without paid calls. A live review and security import must be qualified against the chosen CodeRabbit organization before production use. No live credentials, installation, purchase or deployment were performed by this implementation.
