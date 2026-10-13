# RFC-0006: Live command output in the Agents window

> Status: **Proposed** 2026-10-13, projection built · Date: 2026-10-13 · Owner request (2026-10-13): stream the crew's command and pod output live · Ploeg half: [Ploeg RFC: live tool output in a Run's transcript](https://github.com/ploeg-hq/ploeg/blob/docs/live-tool-output-rfc/docs/research/2026-10-13-live-tool-output.md), proposed in [ploeg-hq/ploeg#125](https://github.com/ploeg-hq/ploeg/pull/125) · Decision records touched: [Unfold ADR 0012](../../apps/unfold/docs/adrs/0012-agent-host-protocol-host.md), [Unfold ADR 0023](../../apps/unfold/docs/adrs/0023-unfold-submits-work-to-ploeg-and-never-executes-it.md), Ploeg ADR-0090 (proposed)
>
> **TL;DR.** Today a crew command's terminal in the Agents window stays empty until the command ends, and then shows only the last 4,000 characters. Both harnesses we run already produce output while a command runs, and both paths drop it: Unfold's OpenCode driver reads output only once a tool call completes, and Ploeg's worker cuts every in-progress output snapshot to its first 4 KiB. The recommendation is to turn snapshots into offset-addressed chunks where the output is produced, redact them there by whole lines, and let the existing durable, cursor-read event paths carry them. No new channel, no new store and no input path are needed. The terminal projection that turns chunks into `terminal/data` increments is built with this RFC and does nothing until a producer sends chunks.

## Goal

A person watching a session in VS Code's Agents window, or a Work Item in the browser, sees a command's output while it runs. That output is:

1. **live:** visible within a few seconds of the sandbox printing it;
2. **ordered:** without duplicates after a retry, a reconnect or a restart;
3. **redacted:** before it leaves the place it was produced, and again before it is served;
4. **bounded:** fixed limits per command and per Run, with the tail always kept;
5. **read-only:** no path from a viewer to the sandbox, as [ADR 0012's 2026-10-10 entry](../../apps/unfold/docs/adrs/0012-agent-host-protocol-host.md#update-2026-10-10-read-only-terminals) requires.

## Where output stops today

Evidence was read at Unfold `development` `3b2b19bb`, Ploeg `development` `d20245b` and OpenCode `v1.18.35`, the version both images pin.

| Step | What happens | Evidence |
| --- | --- | --- |
| OpenCode runs a shell command | Each stdout or stderr chunk updates the running tool part's `metadata.output`: a rolling snapshot of the last 30,000 characters | OpenCode `packages/opencode/src/tool/shell.ts` lines 487–529 (`last = preview(last + chunk)`, `MAX_METADATA_LENGTH = 30_000`); `src/session/tools.ts` lines 67–79 |
| OpenCode's server (`opencode serve`) | Publishes each update as `message.part.updated` with `state.status: "running"` | same |
| OpenCode's ACP agent (`opencode acp`) | Sends each changed snapshot as `tool_call_update`, `status: "in_progress"`, with the whole snapshot as text content | OpenCode `src/acp/event.ts` lines 341–375, `src/acp/tool.ts` lines 140–163 |
| **Path A:** Unfold's OpenCode driver (managed sessions) | Emits a `tool` event on every update, but attaches output only when `status === 'completed'`, as `tail(output, 4000)`; `metadata` is never read | [`apps/unfold/src/runtime/opencode.ts:218-221`](../../apps/unfold/src/runtime/opencode.ts#L218-L221) |
| Unfold's engine and event store | Writes each `tool` event as it comes; no size cap at the store, no pruning | [`apps/unfold/src/engine.ts`](../../apps/unfold/src/engine.ts) `runtimeEvent` and `save`, [`apps/unfold/src/store.ts`](../../apps/unfold/src/store.ts) `appendEvent` |
| AHP terminals | Send one `terminal/data` with the whole recorded output when the command finishes | [`apps/unfold/src/ahp/terminals.ts`](../../apps/unfold/src/ahp/terminals.ts), `close` before this RFC; [`1cf1d92d`](https://forgejo.webgrip.dev/webgrip/unfold/commit/1cf1d92da5b4a7340b4c39c7b88519b6ea475c00) |
| **Path B:** Ploeg's worker (`acp` harness) | Records every changed snapshot as a new `tool_output` entry and cuts each to its **first** 4 KiB. A long command therefore yields many entries that repeat the same first 4 KiB, never its tail, and spends the Run's 2 MiB transcript budget on the copies | Ploeg `pkg/harness/adapters/acp/transcribe.go` lines 36–50 and 92–117, `pkg/transcript/recorder.go` lines 184–201, `pkg/transcript/entry.go` lines 36–50 and 135–147 |
| Ploeg's operator API | Serves the transcript by polling, `GET /operator/runs/{id}/transcript?after=<seq>`; the worker flushes every 2 s | Ploeg `pkg/httpapi/transcript.go`, `pkg/transcript/recorder.go` line 14 |
| Unfold for Ploeg-run Work Items | The browser Work page polls that transcript every 4 s. The Agents window's Work Item sessions show no tool calls at all | [`apps/unfold/public/views/work.js`](../../apps/unfold/public/views/work.js) `transcriptInterval`, [`apps/unfold/src/ahp/work-items.ts:42-46`](../../apps/unfold/src/ahp/work-items.ts#L42-L46) |
| Pod logs | ACP traffic never reaches the pod log, only the worker's lines and the harness's stderr. Unfold reads these from VictoriaLogs on the Work Item page | Ploeg `pkg/harness/adapters/acp/acp.go` line 115; [`apps/unfold/src/run-logs.ts`](../../apps/unfold/src/run-logs.ts) |

Claude Code runs with `--output-format json` and yields no transcript at all (Ploeg `pkg/harness/adapters/claudecode/claudecode.go` lines 92–97). Live output from Claude Code is out of scope here.

## Options

**(a) Offset-addressed chunks on the existing durable paths (recommended).** The producer diffs each snapshot against the last one. It then emits only the new characters with their offset in the command's output, buffers to whole lines, redacts and coalesces. Path A writes them as `tool.output` events into Unfold's event store. Path B sends them as `tool_output` transcript entries with an `offset`, through the existing 2-second batches. Readers use the cursors they already have: `after=<event id>` and `Last-Event-ID` for the session stream, and `after=<seq>` for the transcript. A chunk whose range the reader already has adds nothing. Cost: a few small rows per command per second, within fixed limits.

**(b) A live channel from ploegd that persists only a bounded tail.** The worker pushes chunks to ploegd, ploegd fans them out over SSE or a websocket, and only a tail is stored. It is lower latency, but it needs a fan-out per consumer in ploegd, a second resume protocol for chunks that were never stored, and a held connection per watcher. [ADR-0090](https://github.com/ploeg-hq/ploeg/blob/development/docs/adrs/0090-a-runs-agent-session-is-kept-as-a-bounded-redacted-transcript.md) defers a push channel until polling is measured to be too slow. Reconsider this option when it is.

**(c) Pod log streaming through the Kubernetes API.** ploegd would follow `pods/log` of each Run pod. The ACP output is not in the pod log, so the worker would first have to print it. That needs new `pods/log` RBAC in every Run namespace. Redaction would happen after the output had already left the worker, into the cluster log pipeline. Team scope would have to be rebuilt on top of a log stream. ADR-0090 rejected the log store as a transcript source for the same reasons. Pod logs stay what they are: diagnostics for an operator.

## Recommendation

Option (a), in the phases below.

**Event contract (Unfold, built).** A `tool.output` event carries `{partId, offset, data}`, with the Run's `runId` on the event. `data` is raw output. `offset` is the number of characters of that tool call's output that came before `data`. The event belongs to the command whose `tool` event has the same Run and part id. The projection in [`apps/unfold/src/ahp/terminals.ts`](../../apps/unfold/src/ahp/terminals.ts) works as follows:

* It skips what it already has and marks a gap as `… N characters of output not kept …`.
* It cleans and sends only whole lines, so a credential split across two chunks is masked like any other. A line longer than 4,096 characters is sent once it passes that length, and a stop sends what was held.
* It keeps at most 64,000 characters per command for a snapshot or a reconnect. It takes at most 16,384 new characters from one event and keeps their tail.
* Once a command streamed, its completed `tool` event sends no second copy of the output. The tool call's result preview is the last 4,000 characters.

Until a producer emits `tool.output`, nothing changes.

**Redaction, three times.** The producer redacts whole lines before anything leaves the process that ran the agent:

* Path A uses the engine's known-secret scrub.
* Path B uses Ploeg's `pkg/transcript/redact.go` patterns plus the Run's exact secrets.

The receiving store redacts again, as ploegd re-redacts every transcript entry on ingestion today. The AHP host applies known-secret redaction and the credential patterns, and strips control characters, as it does for every terminal.

**Limits and backpressure.**

* The producer coalesces chunks per tool call to at most one per second or per 8 KiB, whichever comes first.
* It keeps the first 32 KiB and the last 32 KiB of a command and drops the middle. The final chunk always carries the tail, and a dropped range shows up as an offset gap.
* Ploeg also counts these chunks against the Run's transcript ceiling (5,000 entries or 2 MiB).
* Unfold's session stream already closes a client that falls more than 1 MiB behind (the `writableLength` check in [`apps/unfold/src/http.ts`](../../apps/unfold/src/http.ts)), and that client resumes from its last event id. The AHP host reads only sessions with a subscriber.

**Retention.** Chunks live as long as their session's events (Unfold) or their Run's transcript (Ploeg). Neither store prunes today. The ceilings above bound a command to about 64 KiB of chunks.

**Prompts.** Chunks carry tool output only. That is the class of data `tool_output` entries already hold, so Ploeg keeps nothing new of a prompt. Its own prompt echo stays unrecorded.

**No input path.** Every change is on the read side. The terminal stays `isPty: false`, and every client action on it is still refused.

## Phases

| Phase | What | Repository | Size | Depends on |
| --- | --- | --- | --- | --- |
| 1 | The terminal projection turns `tool.output` chunks into `terminal/data` increments. Inert until a producer emits them. **Built** with this RFC, with tests in [`apps/unfold/test/ahp-terminals.test.ts`](../../apps/unfold/test/ahp-terminals.test.ts) | Unfold | S | none |
| 2 | Ploeg's worker sends offset-addressed `tool_output` chunks instead of 4 KiB snapshot heads. The transcript schema gains optional `offset`; the 2 MiB ceiling stays. This also fixes today's waste of the Run budget on repeated heads | Ploeg | M, 1–2 days | owner amends ADR-0090 (proposed) |
| 3 | Unfold maps a Ploeg Run's transcript into its Work Item session: `tool_call` becomes a `tool` event and `tool_output` with an offset becomes `tool.output`. Unfold polls only while someone watches, every 2 s | Unfold | M | Phase 2, Work Item sessions ([VIK-1978](https://vikunja.webgrip.dev/tasks/1978)) |
| 3b | The browser's session and Work pages render `tool.output` as growing output under its tool call instead of one line per event | Unfold | S | Phase 2 or 0 |
| 0 (optional) | Unfold's OpenCode driver emits `tool.output` from `state.metadata.output` while a shell tool runs. It is the same diff, coalesced like messages, and gives managed sessions live terminals before Phase 3 | Unfold | S, half a day | owner decision 1 |
| 4 (only if measured) | Option (b): a push channel from ploegd for sub-second output | Ploeg and Unfold | L | a measured need |

Acceptance, for each phase that has a producer:

* While `for i in $(seq 1 30); do echo line $i; sleep 1; done` runs in a session, the command's terminal in VS Code's Agents window shows new lines within 3 s of their being printed (Phase 0), or within 5 s (Phases 2 and 3).
* After a reconnect, the terminal shows the output so far exactly once.
* A canary secret printed across two chunks never reaches the wire.
* A command that prints 10 MiB leaves at most 64 KiB of chunks for that command and still shows its last line.
* No terminal action from a client is accepted.

## Decisions for the owner

1. **Build Phase 0 in a driver that is to be deleted?** [ADR 0023](../../apps/unfold/docs/adrs/0023-unfold-submits-work-to-ploeg-and-never-executes-it.md) deletes Unfold's OpenCode HTTP driver. Phase 0 is half a day of work and gives live terminals in managed sessions now. Against it: the code is thrown away when the driver goes. Recommendation: build it only if Work Item sessions (Phase 3) are more than two weeks out.
2. **Is a 2 to 5 second delay live enough?** Polling the existing cursors costs no new infrastructure. Sub-second output needs option (b). Recommendation: accept 2 to 5 s now, and measure before building (b).
3. **Per-command limits.** The recommendation is the first 32 KiB and the last 32 KiB of each command, inside Ploeg's existing 2 MiB Run ceiling. Against it: a long build log loses its middle. That is acceptable for following a Run; the full log is not a transcript's job.
4. **Amend Ploeg ADR-0090** (proposed) so that `tool_output` is offset-addressed chunks with head and tail kept, before it is ratified. Recommendation: yes. Today's behaviour records repeated copies of the first 4 KiB and never the tail.
