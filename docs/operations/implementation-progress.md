# Implementation progress: first dogfooding fixes

Date: 2026-09-09. Starting Vloer revision: `6c8fa08`. This increment implements the first operator fixes and supplies a source-reviewed Ploeg prerequisite patch. No live model calls, external ticket creation, remote push or deployment occurred.

| Plan item | Implementation | Qualification and remaining work |
| --- | --- | --- |
| PV-001 | Browser evidence tabs support arrows, wrapping, Home/End, one tab stop and associated panels; draft, focus and stream reading position survive updates | Actual desktop/mobile browser regressions pass. Human acceptance and a live self-improvement session remain outstanding |
| PV-002 | Sessions retain a safe failure category, stage, message, next action and prompt certainty; browser and VS Code show it | Authenticated API/history/SSE/restart and runtime regressions pass. Live provider/cluster and native desktop-host qualification remain outstanding |
| PV-013 | Ploeg candidate retains fetched tracker Scope and rejects conflicts before routing | Patch applies; Go/PostgreSQL tests pending. Durable rejection audit and connection identity remain open |
| PV-015 | Ploeg candidate authenticates before deduplication and enforces the existing body limit | Patch applies; Go/PostgreSQL tests pending. New media-type policy and transactional inbox remain open |
| PV-074 | Ploeg candidate requires successful explicit approval from every required final reader | Patch applies; Go/PostgreSQL tests pending. Missing approval stays a human review outcome; it creates no new paid work |

Local backlog status `review` means candidate code exists. It is not a tracker transition, human acceptance or production qualification. Generated briefs include the evidence and remaining checks so a crew is not assigned to recreate a change that already exists. Do not close an entire audited gap because one of its remediation tickets has candidate code.

## Try the Vloer changes

Run `npm run demo` and navigate the evidence tabs using Left/Right, Home and End. Draft an instruction, switch tabs and return; the text is retained. New events preserve the operator's reading position, while a stream already at the bottom continues following new activity.

Install `extensions/vscode/de-vloer-0.1.1.vsix` from the release archive using **Install from VSIX**. The updated panel understands the optional failure field and remains compatible with older servers that only supply a blocker. It never retries a mutation automatically or offers to restart a failed paid submission.

Failures are catalog entries, not raw exception text. Acknowledged means the runtime acknowledged submission; it does not mean the task completed. An ambiguous response remains unknown. Refresh and inspect the remote turn and spend before deciding on new work. Cancellation records a stop request; its failure metadata does not assert that a remote worker or in-flight charge has already stopped.

## Review the Ploeg changes

The [Ploeg integration directory](../../integrations/ploeg/README.md) contains the baseline, patch and qualification instructions. The source candidate is committed locally as `6c3e4f8`; no branch was pushed. Go was absent and the environment cancelled the attempted toolchain download, so the patch is deliberately offered for review and CI qualification.

## Continue dogfooding

Review PV-001/PV-002's existing candidates before assigning them again. PV-003 prepares a qualified development image; PV-004 then exercises a bounded live improvement using the stable service. Keep the candidate's source, tests and state separate from that service. The independent verifier, complete candidate export and publisher remain future work; the current manual lane still requires a trusted person to verify and publish changes.

The [validation matrix](../validation.md) records the executed checks. The [backlog guide](backlog.md) explains export and assignment. The [system design](../PRODUCT-DESIGN.md) remains the full roadmap, with implementation notes layered over its original audit baseline.
