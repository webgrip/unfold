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

## Open Questions

- Should a reviewer be able to add a note to a step ("didn't match on my
  phone")? Out of scope; a Work Item note covers it today.
- When a preview environment exists, steps could link to it. ADR 0054's
  re-evaluation triggers name it.
