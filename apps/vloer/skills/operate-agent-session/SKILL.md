---
name: operate-agent-session
description: >-
  Operate a durable remote agent session, register its objective and authorized scope, inspect progress and evidence, resolve human blockers, and prepare a reviewable handoff. Use for De Vloer sessions or a compatible operator workbench.
---

Load the repository's `.agents/contracts/operate-agent-session.md` when present. It supplies workbench commands, allowed runtimes and local evidence paths. If absent, use the operator's supplied endpoint and its published API; do not guess a dispatch endpoint or credential source.

Bind work to the authorized repository, objective, crew and spending limit. Use the existing tracker item as the source for priority and acceptance criteria when one is supplied. Creating an interactive session does not assign the tracker item to an unattended dispatcher.

Inspect the session's status, run evidence, spend state and unresolved human requests before acting. Continue already authorized work. A persisted message records intent; do not claim it interrupted a model call. Use supported pause/resume controls when an active run must receive a changed instruction. Cancellation is intentional and must not trigger a replacement paid run.

After a disconnect, reconnect to the existing session and replay its events. After a server interruption, inspect durable changes and spend before explicitly resuming. If spend is unknown, report that uncertainty; never convert it to zero or create a fresh budget to bypass it. Additional spending needs an authorized budget increase under the workbench's role controls.

Keep native harness state opaque. When changing harnesses or handing work to a person, transfer the branch/diff, objective, remaining constraints, actual check commands and results, review findings and unresolved decisions. Distinguish executed checks from proposed checks and demo execution from model execution.

Return the reviewable result and the next required decision. A successful agent run does not itself authorize merging, publishing, deployment or sending messages. Never include raw credentials in the handoff.
