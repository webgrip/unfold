---
name: link-work-item
description: Links this agent session to an Unfold Work Item, or unlinks it, and adds the Unfold-Session trailer to commits. Use when the person names a Work Item, a VIK-<id> ticket or an Unfold link (…/#work/<id>) as what this session works on, asks to link or unlink this session, or asks which Work Item this session belongs to.
---

# Link this session to a Work Item

When Unfold knows this session, its start-up context holds a line beginning "Unfold records this … session as …", with the session's Unfold page and session id. Use that session id. The Unfold plugin's Claude Code hooks write that line, and so do Unfold's Codex and OpenCode reporters.

Without that line, for example in GitHub Copilot, Cursor or VS Code chat, Unfold does not know this session: find the Work Item as in step 1, give the person its link, and say that only sessions that report to Unfold (Claude Code with this plugin, Codex or OpenCode with Unfold's reporter) can be linked.

1. Find the Work Item id. An Unfold link ends in `#work/<id>`. For a tracker ticket such as `VIK-2051`, call `unfold_find_work` or `unfold_now` and pick the Work Item whose tracker is `vikunja:2051`. Ask the person when more than one matches.
2. Call `unfold_link_session` with `session_id` and `id`. To undo a link, call it with `unlink: true`; the branch name will not link that Work Item again.
3. Say which Work Item the session is now linked to, with the link the tool returned.

When you write a commit message in this session, end it with the trailer lines `Assisted-by: <harness>:<your model id>` and `Unfold-Session: <the session's Unfold page>`, next to any `VIK-<id>` trailer the repository asks for. The session's start-up text gives the exact lines, and the two lines that start a pull request description ([AI output marking](../../../../docs/contracts/ai-marking.md)).

`unfold_linked_sessions` with a Work Item id shows every session linked to it, including other people's.
