# Coding runtime API evidence

Research date: 2026-09-09. OpenCode's tagged generated API types and server handler source are the implementation reference. Website summary tables retain a legacy permission endpoint. The adapter uses the current endpoint below.

## Verified versions and scope

| Component | Verified version | Implementation scope |
| --- | --- | --- |
| OpenCode binary | `opencode-ai@1.18.30` | HTTP runtime adapter implemented |
| OpenCode TypeScript SDK | `@opencode-ai/sdk@1.18.30` | Registry version verified; not a production dependency here |
| OpenHands Software Agent SDK | `1.46.0` | Feasible second engine behind the command protocol; no unvalidated direct adapter shipped |

The normal tests exercise a fake OpenCode server contract and real child processes implementing the command protocol. An additional probe executed the actual `opencode-ai@1.18.30` binary on 2026-09-09 through the real local workspace manager. It validated authenticated health, rejection of unauthenticated requests, managed configuration parsing and environment substitution, registration of the custom LiteLLM model alias, adapter-created native sessions with reviewer permissions, SSE connection, all reconciliation endpoints, abort and deletion. The probe observed zero requests at its loopback inference sink. It intercepted `prompt_async` before transmission; paid prompt processing and model execution were not exercised.

Reproduce this no-inference probe with a preinstalled pinned binary:

```sh
node scripts/probe-opencode.mjs /absolute/path/to/opencode
```

The probe creates and cleans up a temporary Git repository, workspace, isolated server and loopback sink. It uses a dummy noncredential placeholder, never provider credentials. These checks do not certify a Kubernetes deployment or a live LiteLLM integration. Live-provider acceptance must still run with an explicitly configured scoped LiteLLM key.

Sources: [OpenCode release](https://github.com/anomalyco/opencode/releases/tag/v1.18.30), [tagged API types](https://github.com/anomalyco/opencode/blob/v1.18.30/packages/sdk/js/src/v2/gen/types.gen.ts), [tagged asynchronous handler](https://github.com/anomalyco/opencode/blob/v1.18.30/packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts), [OpenHands release](https://github.com/OpenHands/software-agent-sdk/releases/tag/v1.46.0).

## OpenCode lifecycle

The manager provisions one workspace and credentials; the adapter creates a native session per role run. An explicit resumed run can reconnect using its persisted native ID. Native state remains on the workspace volume. An operator action never automatically replays a paid prompt after an ambiguous transport failure.

Every instance-scoped request includes `directory` as a URL-encoded query parameter. The endpoint comes from provisioning, not user prompts. HTTP redirects are rejected. Each JSON request has a 15-second timeout; execution and streams also share the configured total timeout and cancellation signal.

| Operation | Method and path | Payload or result |
| --- | --- | --- |
| Create | `POST /session` | `{title, permission?}` → native session |
| Submit | `POST /session/{id}/prompt_async` | `{model:{providerID,modelID},agent:"build",parts:[{type:"text",text}]}` → 204 |
| Observe | `GET /event` | Server-sent events |
| Reconcile transcript | `GET /session/{id}/message` | `[{info,parts}]` |
| Reconcile activity | `GET /session/status` | Native status map |
| Discover subagents | `GET /session/{id}/children` | Native child sessions |
| Pending approval | `GET /permission` | Permission requests |
| Answer approval | `POST /permission/{requestID}/reply` | `{reply:"once"|"always"|"reject"}` |
| Pending questions | `GET /question` | Question requests |
| Answer question | `POST /question/{requestID}/reply` | `{answers:[["label"]]}` |
| Reject question | `POST /question/{requestID}/reject` | Empty body |
| Interrupt | `POST /session/{id}/abort` | Empty body |
| File evidence | `GET /session/{id}/diff` | Actual native file-diff records |

HTTP 204 acknowledges submission. Completion requires an inactive session and a new completed assistant message with a terminal finish reason. A tool-call message is not a final response. Pending permission requests prevent completion. Polling supplements the stream and recovers missed permission, question and final-message events. This adapter does not assume durable `Last-Event-ID` replay from OpenCode; De Vloer's own event journal supplies browser replay.

OpenCode abort means stop the current turn. It does not promise resumption of a paused operating-system process. Explicit resume is another prompted turn with existing native history.

After control-plane restart, in-memory worker Basic credentials are unavailable. Recovery disposes managed local or Kubernetes workers instead of issuing an unauthenticated abort. Local storage and Kubernetes workspace PVCs survive disposal; explicit resume provisions a fresh runtime around that state. Local supervisors stop their child process group when the control-plane input pipe closes.

Source: [server overview](https://opencode.ai/docs/server/).

## Runtime events and accounting

The adapter translates native events into the workbench's event vocabulary:

| Event | Data |
| --- | --- |
| `native.session` | `nativeId` |
| `message` | Assistant text fragment, role, optional native session and part IDs |
| `tool` | Tool name, status, native session ID |
| `permission` | Native request ID, kind, title, detail, options or questions |
| `permission.resolved` | Native request ID |
| `usage` | Harness cost estimate and token counts |

The adapter deduplicates native stream IDs and replaces message snapshots. It does not sum every streaming update. Child-session assistant messages contribute to the final harness estimate. LiteLLM remains the independent spend authority: a custom alias may have no price configured inside OpenCode and therefore report zero estimated cost despite actual gateway spend.

The report artifact is actual final assistant text. The diff artifact preserves the native diff payload instead of fabricating a unified patch. `repository.verify` is one command as an argv array. Writers receive that exact array in their task. Test artifacts are captured only from completed native tool output whose command exactly matches its conservative shell rendering. The agent reporting success is not proof that an independent CI gate passed.

Read roles receive session permissions denying edits, shell execution and further task delegation. Their final report must contain an explicit JSON verdict. Missing verdicts remain inconclusive. Tool permissions supplement workspace isolation; they are not a substitute for kernel-level isolation or scoped repository credentials.

## LiteLLM and runtime configuration

The provider uses `@ai-sdk/openai-compatible`, with its base URL pointing to the LiteLLM `/v1` endpoint and its key sourced from `LITELLM_API_KEY`. This provider is bundled in the pinned binary; its factory does not require runtime npm installation. Model names must exactly match configured gateway aliases. `model` and `small_model` are explicitly set; enabled providers are restricted; sharing and automatic updates are disabled. [Tagged provider source](https://github.com/anomalyco/opencode/blob/v1.18.30/packages/opencode/src/provider/provider.ts).

OpenCode configuration is merged. Project configuration overrides `OPENCODE_CONFIG`; `OPENCODE_CONFIG_CONTENT` provides runtime overrides and Linux `/etc/opencode/opencode.json` supplies managed settings. Do not rely on repository-owned configuration as the sole policy boundary.

Vision-capable models need declared input modalities in the custom provider configuration. Some reasoning model routes need LiteLLM's `additional_drop_params: ["reasoningSummary"]` for Chat Completions compatibility. Test the specific configured model instead of assuming every provider supports identical capabilities.

Sources: [LiteLLM integration](https://docs.litellm.ai/docs/tutorials/opencode_integration), [configuration precedence](https://opencode.ai/docs/config/), [permissions](https://opencode.ai/docs/permissions/).

## Generic command bridge version 1

This is an executable integration seam for other harnesses. It runs a configured argv array without a shell, in the managed workspace on the De Vloer server. It requires backend `local`; a remote server installation moves this computation off the operator's laptop. The adapter does not claim to run this subprocess in a Kubernetes pod.

Only the workspace manager's approved environment reaches the child, including its scoped LiteLLM key when configured. The control plane's ambient credentials are not inherited. Command configuration is administrator-owned. Standard output is exclusively JSON Lines; diagnostics belong on standard error. Standard error is drained without being exposed in user events because it can contain credentials.

First input line:

```json
{"type":"start","version":1,"sessionId":"s1","runId":"r1","directory":"/workspace/repo","prompt":"Implement the agreed change","role":{"id":"builder","mode":"write","instruction":"..."},"model":{"providerId":"litellm","modelId":"coding"},"verify":["npm","test"]}
```

`nativeId` is included when resuming an existing native run. A runner emits the native ID as soon as it is known:

```json
{"type":"event","event":{"type":"native.session","data":{"nativeId":"native-123"}}}
{"type":"event","event":{"type":"message","data":{"role":"assistant","text":"Inspecting the repository."}}}
```

Supported event types are the table above plus `status`. A permission event uses the same workbench fields. Later input can respond:

```json
{"type":"response","requestId":"permission-123","kind":"permission","decision":"once"}
{"type":"response","requestId":"question-123","kind":"question","answers":[["Use existing module"]]}
```

The final line carries actual collected evidence:

```json
{"type":"result","summary":"Completed the requested change","verdict":"approve","artifacts":[{"kind":"test","name":"npm test","content":"Actual captured process output"}]}
```

The process must then exit with status zero. `costUsd` is optional harness telemetry. Artifact kinds accepted from runners are `diff`, `test`, and `summary`. A missing result, duplicate result, invalid JSON, timeout, error record, or nonzero exit fails the run. A process cannot claim success by printing a result before exiting unsuccessfully.

Cancellation sends `{"type":"cancel"}` and terminates the process group with SIGTERM, escalating to SIGKILL within two seconds. A supervisor also stops the runner when the control-plane input pipe closes after a crash. The result is cancellation, never a transparent retry. A runner that needs graceful remote cancellation must handle SIGTERM and call its remote harness's cancellation endpoint; killing a local client alone cannot prove its remote workload stopped.

## OpenHands mapping for a future runner

The SDK's native Agent Server has concrete corresponding operations: create `/api/conversations`; send `{role:"user",content:[{type:"text",text}],run:true}` to `/api/conversations/{id}/events`; POST `/run`, `/pause`, `/interrupt`; paginate `/events/search`; answer `/events/respond_to_confirmation` with `{accept,reason}`. Its live transport is WebSocket, so it requires a separate translation from OpenCode's event decoder.

Create the agent specification using the installed SDK's `get_default_agent` and serialization rather than guessing registered tool names. Set `OH_SESSION_API_KEYS_0` for server access and preserve `OH_SECRET_KEY` across restarts so encrypted model credentials remain recoverable. The workbench's generic bridge is implemented; a direct OpenHands runner still requires live SDK integration validation and is not advertised as tested.

Sources: [tagged creation tests](https://github.com/OpenHands/software-agent-sdk/blob/v1.46.0/tests/agent_server/test_conversation_router.py), [official conversation client](https://github.com/OpenHands/software-agent-sdk/blob/main/clients/typescript/src/client/conversation-client.ts), [server setup](https://docs.openhands.dev/sdk/guides/agent-server/local-server).
