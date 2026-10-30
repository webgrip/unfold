# unfold-acp-agent: Unfold as an Agent Client Protocol agent

`unfold-acp-agent` is the agent `unfold` for editors that speak the [Agent Client Protocol](https://agentclientprotocol.com) (ACP): PhpStorm and the other JetBrains IDEs, JetBrains Air, Zed and the Neovim ACP plugins. The editor starts it as an agent. In its chat a person sees what waits for them, asks about a Work Item, steers its session and answers the tool permissions its Run asks for. The how-to, with each editor's configuration, is [Use Unfold from PhpStorm and other ACP editors](../../../../docs/how-to/use-unfold-from-an-acp-editor.md); the decision is [Unfold ADR 0058](../../docs/adrs/0058-an-acp-editor-uses-unfold-as-the-agent-unfold-which-follows-one-work-item.md).

It needs Node.js 22 or later and has no dependencies. It is not published to npm yet; install it from a checkout with `npm install --global ./apps/unfold/extensions/acp-agent`.

```text
unfold-acp-agent [--url <unfold>] [login | logout]
```

Without a command it speaks ACP on stdin and stdout. `login` runs Unfold's editor sign-in and keeps the `vle_` editor credential in `$XDG_CONFIG_HOME/unfold/acp-agent.json` (mode 0600); `logout` forgets it. `UNFOLD_URL` names the Unfold when `--url` does not, `UNFOLD_TOKEN` overrides the kept credential, and `UNFOLD_WORK_ITEM` binds every new session to one Work Item.

## ACP methods

| Method | What it does |
| --- | --- |
| `initialize` | Protocol version 1. `agentInfo` is `unfold`. One authentication method, `unfold-sign-in` of type `terminal`, runs the agent with `login`. No `loadSession`, no images, audio or embedded context |
| `authenticate` | Reads the credential again and checks it with Unfold |
| `session/new` | A session that follows nothing yet, or the Work Item in `_meta.unfold.workItem` or `UNFOLD_WORK_ITEM`. Answers the modes `ask` and `steer` and a `work-item` select filled from Now. Without a credential Unfold accepts: error `-32000` |
| `session/prompt` | A command (`/now`, `/work`, `/ask`, `/steer`, `/watch`, `/propose`) or, in the current mode, a question or a steer |
| `session/cancel` | Ends the prompt turn with `cancelled`. It never pauses, cancels or retries the work |
| `session/set_mode` | `ask` or `steer` |
| `session/set_config_option` | `work-item`: binds the session to a Work Item, or `none` |

What it sends the editor: `session/update` with `agent_message_chunk`, `tool_call`, `tool_call_update`, `available_commands_update`, `session_info_update` and `config_option_update`, and `session/request_permission` before every spend or change.

## What each prompt does in Unfold

| Prompt | Unfold routes | Asks first |
| --- | --- | --- |
| `/now`, the unbound first message | `GET /api/ploeg/now` | no |
| `/work <id>` | `GET /api/ploeg/work-items/{id}`, `GET /api/sessions` | no |
| `/work <session id>` | `GET /api/sessions/{id}` | no |
| Ask | `POST /api/ploeg/work-items/{id}/asks` with `recordOnly`; then, when the record does not answer, with `askModel` | only the model Ask, naming the most it spends from the Team's Ask Allowance |
| Steer, with a workbench session you own | `POST /api/sessions/{id}/messages`, then watches | yes |
| Steer, a queued or running Work Item without one | `POST /api/ploeg/work-items/{id}/notes` | yes |
| `/watch` | `GET /api/sessions/{id}/history?after=…` and `GET /api/sessions/{id}`, every second | no |
| A harness permission while watching | `GET /api/sessions/{id}/permissions`, `POST /api/sessions/{id}/permissions/{request}` with `once` or `reject` | yes: **Allow once** or **Deny**, the session's owner only |
| `/propose` | none: it drafts and admits nothing | no |

Every call carries `X-Unfold-Client: unfold-acp-agent`, and every confirmed action carries `X-Unfold-Confirmation` (`<id>:<SHA-256 of the text the person allowed>`), so Unfold's action record names the channel and the confirmation, as for `unfold-mcp`.

## The ACP registry entry

`registry/unfold/agent.json` and `registry/unfold/icon.svg` are the entry for the [ACP registry](https://github.com/agentclientprotocol/registry), in its `agent.schema.json` format. It is not submitted: the registry checks that the npm package exists, and it is not published.
