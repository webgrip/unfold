# unfold-acp-agent: Unfold as an Agent Client Protocol agent

`unfold-acp-agent` is the agent `unfold` for editors that speak the [Agent Client Protocol](https://agentclientprotocol.com) (ACP): PhpStorm and the other JetBrains IDEs, JetBrains Air, Zed and the Neovim ACP plugins. The editor starts it as an agent. In its chat a person picks up the work they handed off, follows its Runs and spend, answers the questions and tool permissions it waits on, hands tracker tasks to a Team, asks about a Work Item and steers its session. The how-to, with each editor's configuration, is [Use Unfold from PhpStorm and other ACP editors](../../../../docs/how-to/use-unfold-from-an-acp-editor.md); the decision is [Unfold ADR 0058](../../docs/adrs/0058-an-acp-editor-uses-unfold-as-the-agent-unfold-which-follows-one-work-item.md).

It needs Node.js 22 or later and has no dependencies. It is not published to npm yet; install it from a checkout with `npm install --global ./apps/unfold/extensions/acp-agent`.

```text
unfold-acp-agent [--url <unfold>] [login | logout]
```

Without a command it speaks ACP on stdin and stdout. `login` runs Unfold's editor sign-in and keeps the `vle_` editor credential in `$XDG_CONFIG_HOME/unfold/acp-agent.json` (mode 0600); `logout` forgets it. `UNFOLD_URL` names the Unfold when `--url` does not, `UNFOLD_TOKEN` overrides the kept credential, and `UNFOLD_WORK_ITEM` binds every new session to one Work Item.

## ACP methods

| Method | What it does |
| --- | --- |
| `initialize` | Protocol version 1. `agentInfo` is `unfold`. One authentication method, `unfold-sign-in` of type `terminal`, runs the agent with `login`. `sessionCapabilities` `list`, `resume` and `close`. No `loadSession`, no images, audio or embedded context. It reads the client's `elicitation.form` capability |
| `authenticate` | Reads the credential again and checks it with Unfold |
| `session/new` | A session that follows nothing yet, or the Work Item in `_meta.unfold.workItem` or `UNFOLD_WORK_ITEM`. Answers the modes `ask` and `steer` and a `work-item` select filled from Now. Without a credential Unfold accepts: error `-32000` |
| `session/list` | The Work Items the person handed off on any channel (a tracker hand-off or an approval in Unfold's action record) and those that wait for them, newest first, at most 50. Each is the session `unfold-work-<id>`, titled with its id, state and title, under the `cwd` asked for; `_meta.unfold` has the Work Item, its state, Team and pull request |
| `session/resume` | Follows the Work Item an `unfold-work-<id>` session names, or picks up a session the agent still holds. Unknown ids: `-32602` |
| `session/close` | Ends the prompt turn and forgets the session. It never touches the work |
| `session/prompt` | A command (`/now`, `/work`, `/ask`, `/steer`, `/watch`, `/answer`, `/handoff`, `/propose`), "hand off <task> to <Team>", or, in the current mode, a question or a steer |
| `session/cancel` | Ends the prompt turn with `cancelled`. It never pauses, cancels or retries the work |
| `session/set_mode` | `ask` or `steer` |
| `session/set_config_option` | `work-item`: binds the session to a Work Item, or `none` |

What it sends the editor: `session/update` with `agent_message_chunk`, `agent_thought_chunk`, `tool_call`, `tool_call_update`, `plan`, `usage_update`, `available_commands_update`, `session_info_update` and `config_option_update`; `session/request_permission` before every spend or change; and `elicitation/create` in form mode for a question, only to a client that offered `elicitation.form`.

The `usage_update` carries `cost` (`amount` in `USD`): what the followed Work Item's Shifts spent, or a workbench session without a Work Item. Unfold's chat holds no model context, so `used` and `size` are 0 and `_meta.unfold.contextWindow` is `false`. It is sent after the session binds and whenever the amount changes, never for the demo.

All of it is in the stable ACP schema v1.28.0. The agent has no dependencies and no ACP SDK: it speaks the protocol's JSON-RPC itself.

## What each prompt does in Unfold

| Prompt | Unfold routes | Asks first |
| --- | --- | --- |
| `/now`, the unbound first message | `GET /api/ploeg/now` | no |
| `/work <id>` | `GET /api/ploeg/work-items/{id}`, `GET /api/sessions` | no |
| `/work <session id>` | `GET /api/sessions/{id}` | no |
| Ask | `POST /api/ploeg/work-items/{id}/asks` with `recordOnly`; then, when the record does not answer, with `askModel` | only the model Ask, naming the most it spends from the Team's Ask Allowance |
| Steer, with a workbench session you own | `POST /api/sessions/{id}/messages`, then watches | yes |
| Steer, a queued or running Work Item without one | `POST /api/ploeg/work-items/{id}/notes` | yes |
| `/watch`, with a workbench session | `GET /api/sessions/{id}/history?after=…` and `GET /api/sessions/{id}`, every second | no |
| `/watch`, a Work Item Ploeg runs | `GET /api/ploeg/work-items/{id}` and `GET /api/ploeg/work-items/{id}/runs/{run}/transcript?after=…`, every second, until it waits for you, its pull request is ready or it settles | no |
| A question the Work Item waits on, while watching | `POST /api/ploeg/work-items/{id}/questions/{question}/answer`, then `POST /api/ploeg/work-items/{id}/requeue` (with `resume` when Ploeg offers it) | yes: the form names what restarting spends; submitting it agrees |
| `/answer <text>` | the same | yes, through the permission prompt |
| A workbench session's question, while watching | `POST /api/sessions/{id}/permissions/{request}` with `answers` | yes: submitting the form sends them |
| `/handoff <source>/<task> to <team>`, "hand off …" | `GET /api/task-sources/{source}/tasks/{task}` and `…/ploeg`, then `POST …/handoff`; `/watch` then waits on `…/ploeg` for the Work Item | yes |
| `session/list` | `GET /api/ploeg/now`, `GET /api/actions?outcome=done`, `GET /api/task-sources/{source}/tasks/{task}/ploeg`, `GET /api/ploeg/work-items/{id}` | no |
| A harness permission while watching | `GET /api/sessions/{id}/permissions`, `POST /api/sessions/{id}/permissions/{request}` with `once` or `reject` | yes: **Allow once** or **Deny**, the session's owner only |
| `/propose` | none: it drafts and admits nothing | no |

Every call carries `X-Unfold-Client: unfold-acp-agent`, and every confirmed action carries `X-Unfold-Confirmation` (`<id>:<SHA-256 of the text the person allowed>`), so Unfold's action record names the channel and the confirmation, as for `unfold-mcp`.

## The ACP registry entry

`registry/unfold/agent.json` and `registry/unfold/icon.svg` are the entry for the [ACP registry](https://github.com/agentclientprotocol/registry), in its `agent.schema.json` format. It is not submitted: the registry checks that the npm package exists, and it is not published.
