---
type: how-to
audience: [owner, contributor, agent]
owner: unfold
last_verified: 2026-11-04
verified_by: "Ran mise run agent-standards, scripts/agent-standards.test.py and a dry run of scripts/agent-standards-survey.py (with review dates set back to 2026-10-20) on 2026-11-04; renovate-config-validator --strict passed on renovate.json. The survey workflow has not run on Forgejo yet, and no Renovate pull request for a standard has been opened yet."
---

# Keep the agent-standards catalogue current

The [agent-standards catalogue](../../apps/unfold/docs/research/agent-standards/index.md) tracks every agent protocol, specification and concept that could touch Unfold, from MCP and AHP to payment and identity drafts. For each entry it records five uses for Unfold and the trigger that would move its radar ring. [ADR 0065](../../apps/unfold/docs/adrs/0065-unfold-tracks-agent-standards-in-a-catalogue-that-renovate-and-a-weekly-survey-keep-current.md) explains why it exists. This page covers the three things that keep it current and what to do with the pull requests they open.

## The parts

| Part | Where |
| --- | --- |
| The catalogue | [`standards.yaml`](../../apps/unfold/docs/research/agent-standards/standards.yaml) |
| Rules, pages, list of ids | [`scripts/agent-standards.py`](../../scripts/agent-standards.py), tested by [`agent-standards.test.py`](../../scripts/agent-standards.test.py), which `mise run docs-check` runs |
| Version watching | [`renovate.json`](../../renovate.json): the custom manager for `standards.yaml`, the `ietf-draft` datasource, and the `agent-standard` package rule |
| The weekly survey | [`scripts/agent-standards-survey.py`](../../scripts/agent-standards-survey.py), run by [`on_agent_standards.yml`](../../.forgejo/workflows/on_agent_standards.yml) |

## Turn the survey on

The workflow runs every Monday only when the repository variable `AGENT_STANDARDS_SURVEY_ENABLED` is `true`. Without a model it reports deterministically: feed entries newer than each entry's `reviewed` date, and new IETF drafts (revision 00 or 01) from the last ten days. With a model it also triages them into changes and candidates.

1. In Forgejo, under the repository's **Settings › Actions › Variables**, set `AGENT_STANDARDS_SURVEY_ENABLED` to `true`.
2. Optional: set the variables `AGENT_STANDARDS_MODEL_URL` (an OpenAI-compatible base URL ending in `/v1`) and `AGENT_STANDARDS_MODEL` (a model id). Then set the secret `AGENT_STANDARDS_MODEL_KEY`, a key with its own small budget.
3. Run the workflow once by hand (**Actions › [Workflow] On Agent Standards › Run workflow**).

It opens a pull request from `docs/agent-standards-survey-<ISO week>` into `development` only when it found something, using `WEBGRIP_CI_TOKEN`. In the same week it updates that branch rather than opening a second pull request.

To rehearse locally without pushing:

```sh
mise exec -- uv run --frozen python scripts/agent-standards-survey.py --dry-run
```

## Review a Renovate pull request (label `agent-standards`)

A new release of a spec raises a question. It is not an upgrade.

1. Read the release notes the pull request links.
2. On the same branch, update the entry's `latest`, `status` and `reviewed`. If the release moves the ring, change `radar` and `radar_reason` too.
3. Re-read every decision under the entry's `decisions`. A decision that no longer holds gets its own change, either an amendment or a new ADR, never an edit in this pull request.
4. Run `mise run agent-standards` and commit the regenerated pages. Docs-check fails while they are stale.
5. If the bump is wrong, for example a tag that only looks newer under `loose` versioning, close the pull request and add an `allowedVersions` rule for that `depName`.

## Review a survey pull request

The pull request carries one file, `apps/unfold/docs/research/agent-standards/survey/<week>.md`.

- For a change to a catalogued entry, edit the entry as for a Renovate pull request.
- For a candidate worth tracking, add an entry with five uses, a ring and a flip trigger. Give it a `watch` source Renovate can read wherever one exists, so that next time Renovate finds it and the survey does not have to.
- Keep the report when you merge. It records that the week was looked at.

## Add a standard by hand

Copy an entry from the same layer. A `watch` entry stays on **one line**: `{kind: K, ref: R, current: "V"}` for `github-releases`, `github-tags` and `ietf-draft`, or `{kind: rss, ref: "URL"}` for a feed. Renovate's regex reads exactly that shape, and `scripts/agent-standards.py` counts the lines it can match. A reformatted or wrapped entry fails the check, not Renovate. Then run:

```sh
mise run agent-standards
mise exec -- uv run --frozen python scripts/agent-standards.test.py
```

## When something goes wrong

| Symptom | Cause | Fix |
| --- | --- | --- |
| Docs-check: `Stale agent-standards pages` | `standards.yaml` changed and the pages were not regenerated | `mise run agent-standards` |
| Docs-check: `lines match the Renovate regex` | A `watch` entry was padded or wrapped | Put it back on one line in the shape above |
| The survey workflow is skipped | `AGENT_STANDARDS_SURVEY_ENABLED` is not `true` | Set the variable |
| The survey is green but opens no pull request | Nothing new since the entries' `reviewed` dates, or a pull request from this week's branch is already open | Check the job log's summary line |
| A source is listed under "could not be read" every week | The URL moved | Fix the entry's `watch`, or `survey.sources` in the catalogue |
