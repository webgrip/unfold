# Audience, feature and integration pages

The site speaks to four audiences, each on its own page, and lists every feature with its status. It keeps the identity of the [October 2026 redesign](redesign-2026-10.md): Archivo at display scale, paper, ink and one red, and "Agents work. You decide." Each new page amplifies one paper object taken from its visitor's own unit of work.

| Page               | Path              | Thesis object                                                                   | First decision it answers                                                    |
| ------------------ | ----------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Agencies           | `/for/agencies`   | A Work Item torn off as one billing line, stamped Accepted                      | Can I hand client work to agents without losing money, or my client's trust? |
| Engineering leads  | `/for/teams`      | The Needs you board: real reason names with the action each asks for            | Can I let agents spend and push without losing control?                      |
| Developers         | `/for/developers` | One branch: agents, your take-over, the hand-back                               | Does this fit how I work, and can I step in when the agent is stuck?         |
| Platform engineers | `/for/platform`   | The capability envelope of one Run: namespace, pod, proxies, canary             | Can I run this without handing agents our credentials?                       |
| Features           | `/features`       | The status tags themselves                                                      | What is built, and what is only planned?                                     |
| Integrations       | `/integrations`   | The port board: ports as rows, adapters as paper tabs, an open socket for yours | Will it work with my tools, and can I add the one that is missing?           |

The Dutch pages live at the same paths under `/nl`. The home page gains a "Who are you?" chooser after the human-control interlude and the ten-line feature list after the guardrails.

## How the pages are built

- `src/data/catalogue.ts` holds each feature's id, category, status, audiences and the component it is built into (Unfold or Ploeg). `src/data/integrations.ts` holds the port board, the standards and the planned integrations in order. All words live in `src/i18n/en.ts` and `nl.ts` under the same ids; `src/data/catalogue.test.ts` fails when an id has no copy, when a non-planned item sits in Coming next, when an audience's proof is planned or not tagged for it, or when the branch timeline no longer has the shape its grid is drawn for.
- `AudiencePage.astro` is the one layout for the four audience pages; each page passes its thesis object (`src/components/objects/`) into the `object` slot. After the first question, each page has one section the others do not (`AudienceSection.astro`): agencies get the cost-per-client flow, engineering leads the evidence each change carries, developers the tools they can work from, platform engineers Ploeg's support scope. Then comes a key list of six to eight features (`AUDIENCE_KEY`) with a link to the full list.
- `FeatureList` renders features as dense rows (name, what it does, status, Unfold or Ploeg), grouped by category on `/features` and flat on the audience pages. Available is the default and carries no tag; only In Labs, Experimental and Planned are tagged, so exceptions stand out, and screen readers still hear "Available". `ComingNext` renders planned work as rows under one Planned tag, so no card sits alone on a row. The port board also tags only the exceptions.
- The features page filter keeps one state, the URL query (`?for=…&category=…`), parsed and written by `src/lib/feature-filter.ts` (unit-tested) and applied by `feature-filter-client.ts`. Every feature is in the HTML. Without scripting, `@media (scripting: none)` hides the filter controls and shows a category jump list with a note; with scripting, the filter is there from first paint, so it causes no layout shift. Filter links are real links, so a filtered view can be shared or opened in a new tab; back and forward restore it.
- Routes, `hreflang` alternates, the sitemap and JSON-LD come from `src/i18n/routes.ts` and `BaseHead.astro` as for every page. `lighthouserc.json` lists the new pages, so the axe scan covers them, and `scripts/motion-check.ts` checks them at five widths in both languages.

## Claim ledger

Statuses follow the buyer lists: Available (built, on or on once configured), In Labs (built, behind a flag that defaults off in `apps/unfold/src/flag-registry.json`), Experimental (built, not proven against the real tool or outside Ploeg's supported profile), Planned (decided or proposed, not built). Every feature line on the site is a rewording of a line in [Unfold at a glance](../../../unfold/docs/product/at-a-glance.md) or [Ploeg at a glance](https://github.com/ploeg-hq/ploeg/blob/development/docs/at-a-glance.md), with the status it carries there. The rows below are the claims that needed a check of their own.

| Claim on the page                            | Evidence                                                                                                                     | Status                               | Permitted wording                                        |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------- |
| Hand off from ClickUp and Vikunja            | `TaskHandoff` in the `clickup` and `vikunja` task providers ([features](../../../unfold/docs/features.md#context-execution)) | Available                            | "Assign a task to an agent Team"                         |
| Jira                                         | `jira` task provider reads and files issues; "no hand-off, because the pinned Ploeg has no Jira tracker"                     | Available (read), Planned (hand-off) | "Unfold reads Jira Cloud tasks but cannot hand them off" |
| GitHub Issues hand-off                       | Ploeg GitHub Issues tracker, qualified live against github.com                                                               | Available, through Ploeg             | "by label or assignee, through Ploeg"                    |
| GitLab and Forgejo issues                    | Unfold reads them; Ploeg lists them as Planned trackers                                                                      | Available (read)                     | "can only be read"                                       |
| Linear                                       | ADR-0050 tracker order                                                                                                       | Planned                              | "as a Linear agent"                                      |
| Simplicate billing lines                     | `billing-simplicate.ts`, flag `billing.export`                                                                               | In Labs                              | never "invoices": Unfold sends no invoice                |
| Teamleader, Moneybird, Exact                 | ADR-0050 billing order                                                                                                       | Planned                              | "after Simplicate, in that order"                        |
| Envoy AI Gateway                             | ADR-0050 owner decision; Ploeg Coming next                                                                                   | Planned                              | "beside LiteLLM, through one gateway contract in Ploeg"  |
| JetBrains and PhpStorm                       | `unfold-acp-agent` ships; not tried in a real editor install                                                                 | Experimental                         | "Not yet tried in a real install of those editors"       |
| Client Sign-off                              | flag `client.sign-off`, API only                                                                                             | In Labs                              | "API only for now"; Client Portal Planned                |
| Tenant export                                | flag `tenant.export`                                                                                                         | In Labs                              | tagged In Labs wherever it appears                       |
| OpenAPI 3.1                                  | `apps/unfold/docs/contracts/openapi.yaml`, served at `/api/openapi.yaml`                                                     | Available                            | listed under standards                                   |
| CloudEvents, SCIM                            | flags `events.webhooks`, `identity.scim`                                                                                     | In Labs                              | tagged In Labs in the standards list                     |
| Tracker conformance suite in Ploeg           | `pkg/provider/trackertest`, ClickUp passes it                                                                                | Available                            | "A conformance suite in Ploeg. ClickUp passes it."       |
| Tracker conformance suite in Unfold          | Unfold ADR 0063, proposed                                                                                                    | Planned                              | "proposed in Unfold ADR 0063"                            |
| Forge conformance suite                      | Ploeg ADR-0183 remaining steps                                                                                               | Planned                              | "proposed in Ploeg"                                      |
| Agent tool conformance                       | Ploeg `harnesstest` kernel plus the hostile-repository drill                                                                 | Available                            | "a shared conformance kernel"                            |
| Notification, billing, intake, link adapters | registries exist; no shared suite found                                                                                      | Available (registry)                 | "No shared suite yet."                                   |
| Credential isolation                         | Ploeg: qualified live for one Harness and one Role                                                                           | Available, scoped                    | the scope is stated beside the diagram                   |
| Worker pod lockdown                          | Ploeg: qualified live on one cluster with Cilium                                                                             | Available, scoped                    | the scope is stated beside the diagram                   |
| Kata VM per Run                              | Ploeg: supported with guest seccomp on, no probe passed yet                                                                  | Available, caveated                  | the caveat is in the line                                |
| Chart upgrade and rollback                   | Ploeg compatibility policy, no job yet                                                                                       | Experimental                         | "not yet exercised by any job"                           |
| Kubernetes and PostgreSQL versions           | Ploeg support matrix                                                                                                         | Available                            | the matrix's own versions                                |
| Billing line Work Item title                 | `src/data/demo-timeline.json`                                                                                                | recorded fixture                     | caption: "comes from the deterministic demo"             |
| Needs you reasons                            | chip and fix text in `apps/unfold/public/core/reasons.js`                                                                    | product text                         | caption: "Illustration, with no live data and no counts" |

Softened or left out:

- The buyer lists' comparisons ("no surveyed vendor carries…", "every other product bills per seat") are left out. They rest on our own dated surveys, and a comparative claim on a public page has to be verifiable and representative. "What's new here" says only why each item matters.
- No price, no amount on the billing line ("Yours to set"), no counts on the reason board, no dates on anything planned, no customer or logo. Third-party tools appear as names in type, never as logos.
- "Billing" never becomes "invoicing": Unfold writes a line into the agency's tool, and that tool sends the e-invoice.
- The Ploeg chart's default daily cap and the number of Ploeg alert rules are true but left out; they invite reading a default as a price or a count as a benchmark.
- The integration rules from ADR-0050 are labelled as rules for new work, not as finished work; the page says the hosted service "will" run the same code.
- `who-unfold-is-for.md` names an employer; nothing of it is used.

## References and mechanism cards

| Reference                                      | Observed mechanism                                      | Why it fits                                     | Adapt                                             | Do not borrow                       |
| ---------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------- | ----------------------------------- |
| Shop-floor job tickets and perforated receipts | A tear-off line carries one unit of work and its fields | An agency bills per accepted Work Item          | The billing line with a perforation and a stamp   | Amounts, tax lines, invoice numbers |
| Kanban boards on a wall                        | One card per stuck item, grouped by why                 | Unfold's Now view groups stopped work by reason | The reason board with real chip names             | Counts, avatars                     |
| Git graphs in `git log --graph`                | A branch leaves a line and rejoins it                   | Take over and hand back happen on one branch    | Two rails, one detour                             | Commit hashes, real branch names    |
| Network diagrams of nested trust zones         | Boxes inside boxes show what may reach what             | Ploeg's isolation is literally nested           | Namespace, pod, containers, proxies               | Vendor icons                        |
| Patch bays and modular synth panels            | Rows of sockets, cables plugged in, an empty socket     | Ports and adapters are sockets and plugs        | Rows per port, tabs per adapter, an open socket   | Logo walls                          |
| Product spec sheets                            | Every line carries a status mark                        | Buyers need built versus planned at a glance    | Status tags that differ in shape, not only colour | Check marks that hide "In Labs"     |
| Stripe Connect's spatial explanations          | Metaphor that cannot be mistaken for product UI         | The objects are illustrations, labelled as such | Paper objects with captions beside them           | Screenshots of plausible UI         |

## Decision record

Question: what does the hero of the audience-page template look like?

Options, rendered as three stills side by side (draft pages, since deleted):

1. Faithful: the home hero recomposed, the hook on the paper ground and three folding sheets below.
2. Amplified: the audience's own object at extreme scale, a tilted paper sheet that bleeds past the container, with the hook set on it.
3. Strange: a crossed-out weekly timesheet beside "Stop selling hours."

Criteria: the thesis object is the first thing seen; the plain category line sits with the hook on the first screen; the identity survives with motion off; the template carries four different objects; no invented artifact.

Choice: amplified. Faithful looked like the home page with new words, so every audience page would read the same. Strange made a business-model claim through invented hours and did not generalise beyond agencies. Amplified gives each page its own silhouette at thumbnail size while the type, palette and paper stay those of the home page. The drafts showed two fixes, both made: the plain line moved onto the sheet beside the hook, so it is on the first screen at 320 px, and the stamp no longer overlaps text. On the integrations page the hero follows the theme and the port board starts on the first screen as a dark band.

## Flatplans

No two neighbouring chapters share all three of loud or quiet, dense or open, light or dark.

| Page               | Chapters                                                                                                                                                                                                                                                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audience pages     | paper sheet hero (light, loud, open; a dark surface in the dark theme) · first question (dark, loud, open) · the page's own section (light, loud, open) · key features (light, quiet, dense) · coming next (raised, quiet, dense) · call to action (red, loud, open; the agency page uses the sign-up form) · also see (light, quiet) · footer (dark) |
| Features           | hero with status legend (light, loud, open) · filter and list (light, quiet, dense) · footer (dark)                                                                                                                                                                                                                                                   |
| Integrations       | hero (follows the theme, loud, open) · port board band (dark, loud, dense) · standards (light, quiet, dense) · add your own (raised, quiet, open) · rules (dark, quiet, open) · your data can leave (red, loud, open) · coming next (light, quiet, dense) · sign-up (light, loud, open) · footer (dark)                                               |
| Home, changed part | human control (red, loud, open) · who are you (light, loud, open) · guardrails (light, quiet, dense) · ten lines with where it stands (dark, loud, dense) · architecture (light, quiet, open) · pricing, labelled planned (light, quiet, dense)                                                                                                       |

The home page's separate open-source and status chapter is folded into the ten lines, which end with the three status lines and the documentation, source and licence links. Pricing stays its own block because the site rules require it labelled planned.

## Motion contracts

| Effect                                   | Purpose                                                                                                                  | Trigger                         | End state                                                     | Interruption                      | Selection                                                | Alternatives                                                                   | Controls             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | ------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------- |
| Accepted stamp lands on the billing line | Demonstration: acceptance makes the line                                                                                 | Page load, 450 ms delay, 320 ms | Stamp at rest, tilted                                         | Finite, under a second            | None                                                     | Reduced motion: no animation, stamp at rest; transform only, text never hidden | None needed          |
| Your branch draws under the agents' line | Demonstration: take over leaves the line and rejoins it; the agents' line is dashed and labelled while the Run is paused | Page load, 300 ms delay, 700 ms | Rail drawn                                                    | Finite                            | None                                                     | Reduced motion: drawn; narrow screens: a vertical list with no rail            | None needed          |
| Feature filter                           | Feedback                                                                                                                 | Click on a filter link          | Matching items shown, count announced in a polite live region | Instant; back and forward restore | The URL query drives items, `aria-current` and the count | No script: everything listed, jump list shown                                  | The links themselves |

## Validation record

Production build of this branch, served locally, headless Chromium 1248 through `playwright-core` 1.64.1.

| Check                               | Result                                                                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `format:check`, `lint`, `typecheck` | pass                                                                                                                               |
| `test`                              | 84 tests pass                                                                                                                      |
| `build` with CSP validation         | 22 pages, every inline style hash-authorised, no inline script                                                                     |
| `validate:a11y` (axe)               | 22 pages, 0 blocking, 0 advisory                                                                                                   |
| `validate:motion`                   | pass at 5 widths, both languages, all new pages; no page widens                                                                    |
| `design_scan.py src`                | 0 fail; 19 `vw-only-type` warnings, all in components this change did not touch                                                    |
| humanize scan of the new copy       | Flagged phrasing fixed; remaining hits are diagram labels and product names                                                        |
| Screenshots                         | 7 pages × EN and NL × 320, 768 and 1440 px × light and dark × reduced motion on and off: no horizontal overflow, no console errors |

A fresh reader reviewed the screenshots. That review led to the key lists, the per-page sections, the row layout without Available tags, theme-following integrations and platform pages, gateway and forge drawn inside the platform diagram, a two-up port board on phones, the paused stretch in the branch timeline, rows instead of cards for planned work, and a fix for pricing numbers that wrapped one digit per line.

Bugs the matrix caught and the fixes: the branch timeline kept its desktop columns on narrow screens (specificity), the Dutch agency hook broke inside "geaccepteerd" at 320 px (smaller minimum size), and screen-reader-only text inside the integrations table escaped its scroll region at 320 px (the region is now a containing block).

Not exercised: Firefox and Safari, a physical phone, a screen reader, browser-disabled JavaScript (the no-script path is source-reviewed and relies on `@media (scripting: none)`), 200 % text and the text-spacing override on the new pages, `forced-colors`, Lighthouse, and field data.
