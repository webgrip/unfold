# Status page design record

The Status page (`#status`, [`status.js`](../../public/views/status.js), [`GET /api/status`](../contracts/api.md#status)) answers one question for everyone signed in: can a new session start right now, and if not, where does it stop? This record keeps the evidence, the decisions and what was exercised, so a later change can tell a design choice from an accident. [The browser UI guide](../browser-ui.md#status) describes the page as built.

## Why it exists

On 2026-10-05 a session failed after three minutes with "The operation exceeded its configured time limit" and the advice to reconcile spend. Its workspace Pod had never been scheduled: every worker node was full. Nothing in Unfold said so; finding the cause took `kubectl`. The page, the `capacity` failure category and the `workspace.waiting` event came out of that incident.

## Job stories

| Job story | Source |
| --- | --- |
| When my session fails to start, I want to know whether it is me or the platform and when to retry, so I do not waste attempts | The 2026-10-05 failed session and the owner's question "what should the customer see?" |
| When I am about to start work, I want to see at a glance whether starting will work | The owner's request for a status page; the hosted agency direction in [who Unfold is for](../../../../docs/concepts/who-unfold-is-for.md) |
| As an administrator, when something is broken, I want to tell everyone what is happening and when it will be fixed, so people stop retrying | The owner chose incident notes |
| As an administrator, when starts fail, I want the raw cause without a terminal | The 2026-10-05 diagnosis needed `kubectl` |
| When failures happened while I was away, I want to see which causes recur | The owner chose recent failures |

The ranking is a proxy from those sources, not measured use: the first two are frequent and cheap to get wrong once; posting a note is rare, and a wrong severity turns the answer red for everyone.

## Evidence ledger

| Claim on the page | Evidence | Wording allowed |
| --- | --- | --- |
| The four steps and their order | `Engine.execute`: Ploeg authority, then the budget credential, then `runtime.prepare`, then each Role | "Ploeg authorizes the work", "The gateway issues the budget", "A machine starts the workspace", "The crew works" |
| A step is working | A live probe within the last 15 seconds (gateway liveness, a fresh Ploeg `teams` call) or a workspace started within 24 hours | "Working · checked HH:MM:SS"; never green without a check |
| Step 3 stopped for capacity | The workspace Pod's `PodScheduled` condition is `Unschedulable` | "Every machine is busy" |
| How long a new session would wait | `kubernetes.provisionTimeoutMs` or `docker.provisionTimeoutMs`, default 180 s | "waits up to N minutes for a machine, then stops" |
| The wait is not charged | No model call happens while a workspace is prepared | "The wait is not charged"; not "nothing was charged", because the brief check and credential come earlier |
| The crew step | It has no check of its own | "Ready" or "Not reached", never "Working" |
| No recent workspace start | No `workspace.ready` in 24 hours | "Probably." and "step 3 is not proven yet"; the crew step reads "Not proven" |
| The demo | Every check reads not in use | "This is a demo." |
| Whose problem it is | A stopped step is a workbench service or capacity | "This is a problem on the workbench; there is nothing to change in your session" |
| A failed refresh | The last report is kept | "Unknown." with the time of the failed check and what the last check said; the line is greyed |

## Task model

| Task | Frequency | Cost of error | Design consequence |
| --- | --- | --- | --- |
| Glance before starting | Often | Low | Answer first, above the fold at 320 px, no interaction needed |
| Arrive from a failed session | Occasionally | Medium: retrying blindly wastes time | **Open Status** on the failure; the stopped step, the wait limit and when to retry in plain words |
| Read the raw cause (administrator) | Occasionally | Low | Behind a disclosure on the step, kept open across refreshes |
| Post or resolve a note (administrator) | Rarely | High: Outage turns the answer red for everyone | Severity options describe their effect; the form sits at the bottom |

## Direction

Question: what carries the page's identity in a tool used daily, where controls must stay familiar?

| Direction | What it was | Outcome |
| --- | --- | --- |
| Faithful | A large "No. Every machine is busy." over three unordered status tiles | Clear answer; the tiles had no order, so "where it stops" needed reading |
| Amplified | The start line: the four steps as one numbered line, the stopped step marked in the brand's beacon red, later steps "Not reached" | Chosen |
| Strange | A railway departure board with "On time", "Delayed", "Not running" | Rejected: the labels promise delays and outcomes the system does not have |

Criteria: answers the first two job stories in five seconds, claims nothing the checks do not prove, survives 320 px and no motion. An independent reader given only the stills ranked them Amplified, Faithful, Strange and asked for the Faithful direction's plain answer on top; the built page combines both. The beacon red is reserved for the stopped step; the verdict is set in ink so size alone makes it the first thing seen.

## States exercised

Rendered with fixtures at the API boundary on 2026-10-05 against the local demo build, Chromium through Playwright:

| State | Width | Role | Theme |
| --- | --- | --- | --- |
| Stopped at step 3, open Degraded note | 1400 | administrator | light, dark |
| Same | 390 | viewer | light |
| Everything working, one resolved note | 1400 | operator | light |
| No recent start, Ploeg not used, Degraded note | 900 | operator | light |
| Demo, real server data | 1400 | administrator | light |
| Refresh failed after a good report | 1400 | administrator | light |
| 12 waiting, 1284 failures in 8 causes, long Dutch compound titles | 390 | administrator | light |
| First load, 4 s server delay | 1400 | administrator | light |
| Stopped at step 3 | 320 | administrator | light |

No horizontal overflow at any of them after fixing one: a long unbroken title overflowed rows at 390 px. Root font size at 200 % overflows in the shell's top bar on every page, not in this page.

## Motion contract

| Effect | Purpose | Trigger | End state | Reduced motion |
| --- | --- | --- | --- | --- |
| One ring around a step's knot | Shows which step changed since the last check | A refresh where that step's state differs | Static knot; the text "changed just now" stays | No animation; the text carries it |

Nothing loops. A change of the verdict is announced once through the polite live region. A refresh keeps keyboard focus on the same control and keeps open disclosures open.

## Independent review

Three fresh reviewers, given only the rendered screenshots and the job stories, ran Nielsen's heuristics, a cognitive walkthrough from a failed session, and a hierarchy-and-honesty pass. Each finding was checked against the build before acting:

| Finding | Outcome |
| --- | --- |
| The administrator's note sat below the line, under the fold on a phone, apart from the retry advice | Fixed: open notes sit under the verdict; the next step says when no note exists yet |
| "Last known: Yes." still read as yes | Fixed: "Unknown." with the last result in words |
| "Yes" when step 3 was unproven, and the crew step "Ready" after it | Fixed: "Probably."; the crew step reads "Not proven" |
| The page did not say whose problem it is | Fixed: one sentence on a stopped step |
| Per-session scheduler messages repeated step 3's; long titles took four lines | Fixed: a duplicate message is left out; titles wrap to two lines |
| Loading showed no text | Fixed: "Checking…" in the verdict's place |
| Raw category codes with one shared sentence | Not a defect: the worst-case fixture supplied that text; the report uses each category's own message |
| Demo badge beside live-looking checks | Not a defect: fixtures were injected into the demo server; the real demo reads "Not used here" |
| Red links compete with the stopped step | Kept: red links are the application-wide link style |
| Possible contrast failures | Measured: 35 to 61 text elements per state, light and dark; lowest 4.71:1, every one meets WCAG AA |
| No retry button for the person's failed session | Open: the session page offers Try again; a link back is a later step |

## Validation status

Exercised: unit and API tests for the report and the answer logic, the state renders above, keyboard refresh with focus and open disclosures kept, the motion contract in both motion preferences, the live announcement, measured text contrast, the product-ux and expressive-design source scans (no findings), and three independent heuristic passes on screenshots. Not exercised: real users, a screen reader, Firefox or Safari, forced colours, and the page against the live homelab cluster.
