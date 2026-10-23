---
description: Start a Ploeg Run that waits for your own Claude Code, in the Team's Claude environment on your Claude seat
argument-hint: <work item id or Unfold link>
allowed-tools: Bash(node:*)
---

Start the Run of Unfold Work Item `$ARGUMENTS` that waits for this person's own Claude Code.

Run exactly this command from the repository's clone, once, and show the person its output:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/unfold-start.mjs" $ARGUMENTS
```

The script checks that this directory is a clone of the Work Item's repository, claims the Run through Unfold, dispatches it with this person's own `claude` CLI and login to the Team's self-hosted Claude environment, and records the dispatched session on the Run. It prints the session's link.

- If it says the directory is not a clone of the repository, tell the person which repository to open and stop.
- If it says no Run waits for them, or Unfold refused the claim, pass that sentence on and stop. Do not retry.
- If the dispatch failed after the claim, say that the Run lapses at the deadline it printed and that they can run `/unfold:start` again after that.

Never run the script twice for one request, and never run `claude --environment` yourself.
