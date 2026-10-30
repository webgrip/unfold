# AI output marking

Everything an AI agent writes that Unfold puts on a forge carries two markings. People read a sentence. Machines read an HTML comment marker, a forge label and git trailers. [`src/ai-marking.ts`](../../src/ai-marking.ts) builds all of them, and every write path below uses it. [`test/ai-marking.test.ts`](../../test/ai-marking.test.ts) checks each path.

## What carries the marking

| Write path | Code | Human-visible | Machine-readable |
| --- | --- | --- | --- |
| Pull request the trusted publisher opens (Accept), on every registered forge | [`delivery-publishers/shared.ts`](../../src/delivery-publishers/shared.ts) and each forge adapter beside it | The sentence, naming the person who approved the candidate | Marker with `session=`; `ai-generated` label |
| Canonical commit of a delivered candidate | [`trusted-candidate.ts`](../../src/trusted-candidate.ts) | The `Assisted-by` trailer | `Assisted-by` and `Unfold-Session` trailers |
| Run card comment on a Work Item's pull request | [`cards/service.ts`](../../src/cards/service.ts) | The sentence, from the pull request's reviews | Marker |
| Agent Trace comment on a Work Item's pull request | [`agent-trace-comments.ts`](../../src/agent-trace-comments.ts) | The sentence, from the pull request's reviews | Marker with `agent-trace=` record ids |
| Client Sign-off comment on a Work Item's pull request | [`client-sign-off.ts`](../../src/client-sign-off.ts) | The sentence, from the pull request's reviews | Marker |
| Commits and pull requests of a Linked Session | [`linked-sessions.ts`](../../src/linked-sessions.ts) | The session is told to write the sentence | The session is told to write the trailers and the marker |

The three keyed comments go through Ploeg's keyed comment ([Ploeg ADR-0079](../../../ploeg/docs/adrs/0079-run-cards-belong-to-the-consumer-and-ploeg-supplies-delivery-facts.md)). Ploeg's workers open those pull requests, so the comments also bring the sentence and the marker to pull requests whose bodies Ploeg writes. A comment shows the review as it stood when Unfold last wrote it. Unfold rewrites a comment when its text changes, and a new approval changes the text.

A Linked Session runs in a person's own editor, so Unfold asks it to mark its work. It cannot enforce that. The start-up text the plugin gives the session ([API](api.md)) names the trailers and the two pull request lines. The session page shows which commits carry the `Unfold-Session` trailer.

## The sentence

The first visible line of a marked pull request body or comment is one of:

- *Written by an AI agent and reviewed by Ann.* Ann is the person who approved the candidate (delivery), or each person whose latest review approved the pull request's current head (comments). At most three names are listed.
- *Written by an AI agent and merged by Ann without a recorded approval.* A person merged the pull request and no approval of its head was recorded.
- *Written by an AI agent and awaiting review by a person.*

Names are escaped for Markdown, and `@` never mentions anyone.

## The marker

The marker is a single HTML comment. Forges keep it in the stored body and do not show it:

```text
<!-- unfold:ai-generated v=1 subject=pull-request review=approved reviewer=Ann agent-trace=0f6c1c9e-1111-4222-8333-944445555666 session=https://unfold.example/#session/s1 -->
```

| Field | Meaning |
| --- | --- |
| `v` | Format version, `1`. |
| `subject` | What the AI agent wrote: `pull-request` or `commit`. The marker on a comment describes the pull request the comment is on; Unfold's own comment text comes from templates and recorded facts, never from a model. |
| `review` | `approved`, `merged` or `pending`, as in the sentence. |
| `reviewer` | Repeated once per named person, percent-encoded. |
| `agent-trace` | Comma-separated [Agent Trace](https://agent-trace.dev/) record ids (UUIDs) that attribute the change's lines, at most 20. Agent Trace 0.1 links a record to a commit through `vcs.revision` and leaves storage open; Unfold stores the records Linked Sessions send and exports them as JSON Lines ([API](api.md)). |
| `session` | The Unfold page of the session that wrote the change. |

Every value is percent-encoded, so no value can contain a space or `>` and close the comment early. `readAiMarking` in `src/ai-marking.ts` reads a marker back. To find marked pull requests without code, search for the label, or for `unfold:ai-generated` in bodies and comments.

The delivery pull request also keeps its older `<!-- unfold-publication: pub-<candidateId> -->` marker on its first line. That marker identifies the publication, not the AI marking ([candidate delivery](candidate-delivery.md)).

## The label

Unfold puts the label `ai-generated` (colour `#7c3aed`, description "Written by an AI agent. A person reviews it before merge.") on each pull request it opens. It uses the repository's label of that name, and creates it when it is missing. Forgejo's labels API needs the `read:issue` scope to find a label and `write:issue` to create one. The publisher's documented scope is `write:repository` only, so either create the label once by hand and add `read:issue`, or grant `write:issue`. GitHub adds the label after the pull request opens, through the issue labels API; GitLab names it on the new merge request. When the forge refuses, the pull request still opens, without the label. Ploeg's keyed comment cannot set labels, so the label is on delivery pull requests only.

## Commit trailers

Unfold writes these [git trailers](https://git-scm.com/docs/git-interpret-trailers) on commits it creates, and asks Linked Sessions to write them:

| Trailer | Value | Why this one |
| --- | --- | --- |
| `Assisted-by` | `<agent>` or `<agent>:<model>`, such as `opencode:qwen3-coder` | The Linux kernel's [guidelines for AI coding assistants](https://docs.kernel.org/process/coding-assistants.html) define `Assisted-by` as the tag that records AI involvement in a contribution, and other projects follow them. It is the most widely documented AI trailer. |
| `Agent-Trace-Id` | The Run's trace alias, when the commit has one; a delivery commit has none | Ploeg already asks its workers for this trailer on every commit ([Ploeg contracts](../../../ploeg/docs/contracts/README.md), `run.trace`). |
| `Unfold-Session` | The session's Unfold page | Linked Sessions already write it ([ADR 0047](../adrs/0047-people-link-their-own-agent-sessions-through-a-plugin-agent-trace-and-telemetry-never-a-claude-sign-in.md)). |

Unfold never writes `Signed-off-by` or `Co-authored-by` for an agent. The kernel's guidelines say an AI agent must not add `Signed-off-by`, because only a person can certify the Developer Certificate of Origin. GitHub's [`Co-authored-by`](https://docs.github.com/en/pull-requests/committing-changes-to-your-project/creating-and-editing-commits/creating-a-commit-with-multiple-authors) names a person by email address, and an agent run through Unfold has no address of its own. A harness that adds its own `Co-authored-by`, as Claude Code does, keeps it.

The canonical delivery commit's message already ends with `Artifact:` and `Policy:` lines. The AI trailers join that block, so `git interpret-trailers --parse` reads all of them. List the AI-assisted commits of a repository with:

```sh
git log --format='%h %(trailers:key=Assisted-by,valueonly,separator=%x2C)' | grep -v ' $'
```

## What carries no AI marking

These write paths carry text a person wrote or an action a person took. No agent wrote them, so they are not marked as AI-generated:

- Hand-off and take-back comments on Vikunja and ClickUp tasks ([`task-handoff.ts`](../../src/task-handoff.ts)). They say a person handed the task to a Ploeg team from Unfold.
- Report a problem issues, repeat reports and replies ([`reports.ts`](../../src/reports.ts)). A signed-in person writes them in the browser, and a report never becomes agent work.
- Notes for a Work Item's next Run ([`ploeg.ts`](../../src/ploeg.ts) `note`). They go to Ploeg as input for a Run and are not published.

Ask and chat answers stay inside Unfold and are not written to a forge or tracker.

Commits and pull requests that Ploeg's workers create are written by Ploeg, not Unfold. They carry `Agent-Trace-Id` and the tracker reference that Ploeg's prompt asks for. They get the marker and the sentence only through the keyed comments above, and only for Teams that turned those comments on.

## Pointing to it from a transparency notice

[Article 50(2) of the AI Act](https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng) requires providers of AI systems that generate synthetic audio, image, video or text content to ensure that the outputs are "marked in a machine-readable format and detectable as artificially generated or manipulated". Under Article 113, Article 50 applies from 2 August 2026. Article 111(4), added by [Regulation (EU) 2026/1744](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202601744), gives providers of such systems placed on the market before 2 August 2026 until 2 December 2026 to comply with Article 50(2). Article 50(5) asks for the information to be given "in a clear and distinguishable manner at the latest at the time of the first interaction or exposure".

An agency that names this marking in its own AI Act transparency notice can point to:

- the sentence at the top of each marked pull request body and comment;
- the marker string `unfold:ai-generated` and its fields above;
- the `ai-generated` label;
- the `Assisted-by` trailer on commits.

Linking to this page from the notice lets readers find the format. This page describes what Unfold writes. It does not say whether that meets any party's obligations under the AI Act.
