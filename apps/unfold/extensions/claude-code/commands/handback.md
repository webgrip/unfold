---
description: Hand a Work Item you took over back to Ploeg, once your work on its branch is committed and pushed
argument-hint: <work item id or Unfold link> [note for the next Run]
allowed-tools: Bash(node:*)
---

Hand Unfold Work Item back to Ploeg. The arguments are `$ARGUMENTS`: the first word is the Work Item, anything after it is the person's note for the next Run.

Run this command once, with the Work Item as the first argument and the whole note, if there is one, as a single argument in single quotes (write each `'` in the note as `'\''`), and show the person its output:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/unfold-takeover.mjs" handback <work item> '<note>'
```

The script finds the worktree `/unfold:takeover` made, refuses while it has uncommitted changes or commits that are not pushed to the Work Item's branch, and otherwise asks Unfold to hand the Work Item back. Ploeg then resumes the Round that stopped, on the same branch from its head on the forge, with the note.

- If it refuses because of uncommitted changes or unpushed commits, tell the person what to commit or push. Do not commit or push for them unless they ask.
- If Unfold refuses, pass its sentence on and stop. Do not retry.
