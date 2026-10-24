# Design — add-review-walkthrough

## Context

The owner's request and answers of 2026-10-18 are in the proposal. The
Walkthrough's shape, its storage and the reviewing Run's check are Ploeg's
(ADR-0125, ploeg-hq #185). Unfold shows it, keeps ticks and nudges on Approve
(ADR 0054).

## Decisions local to this change

- **Placement.** The sections sit directly under the Problem and solution card
  (`accountMarkup` in `public/ploeg.js`), so a reader goes from what was
  wrong, to what changed, to what it looks like, to trying it.
- **Same source rule as the card.** Take the newest writing Run with a
  Walkthrough, from the latest Shift when one there did, so the card and the
  gallery describe the same Round where both exist.
- **Ticks in the workbench database.** A small table keyed by person, Work Item
  and Run id. No browser storage: ticks are what the nudge counts, and they
  must survive another device.
- **Image proxy.** One route per Work Item, Run and step. It checks read
  permission on the Work Item and that the Run belongs to it before fetching
  from Ploeg, and sends `Cache-Control: private, max-age=86400`. Images use
  `<img>` with width and height attributes, not inline styles (CSP).
- **Nudge copy.** "You haven't tried N of M steps." with "Approve anyway" and
  "Go back". No colour or wording that suggests the person did something wrong.

- **AI-written hunks first (proposed 2026-10-24, not built).** A reviewer who
  does not read code still has to decide where to look in the diff. Below "Try
  it yourself", a "What the agent wrote" list names each changed hunk in plain
  words (the file and the line range), AI-written hunks first and the most
  AI-written lines first, each with a badge such as "12 of 14 lines written by
  an agent". Hunks a person wrote follow under "Written by a person". The counts
  come from the Agent Trace records of the Work Item's Linked Sessions and of
  the writing Run, for the pull request's head commit, through
  `attributeHunks` and `aiHunksFirst` in `src/agent-trace-hunks.ts` (built, with
  tests): a line two records claim counts once, a `human`, `mixed` or `unknown`
  range does not count, and the records' line numbers must refer to the diff's
  new side. Without a record the list keeps the diff's order and says no
  attribution was recorded; it never guesses. Records from any tool that writes
  Agent Trace 0.1 count. The list shows counts only, no model or cost, like the
  `agent-trace` pull request comment. Getting the diff and the head commit's
  records to the page is not designed yet: Unfold reads the diff from neither
  Ploeg nor the forge today.

## Open Questions

- Should a step of the Walkthrough name the hunks it exercises, so the
  reviewer reads those AI-written hunks next to the step? Needs Ploeg's
  Walkthrough to carry paths (ADR-0125).

- Should a reviewer be able to add a note to a step ("didn't match on my
  phone")? Out of scope; a Work Item note covers it today.
- When a preview environment exists, steps could link to it. ADR 0054's
  re-evaluation triggers name it.
