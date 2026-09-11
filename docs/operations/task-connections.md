# Connect a task system

De Vloer 0.2.0 reads tasks from **Vikunja, ClickUp, Forgejo, GitHub and GitLab** through the same operator workflow: choose a connection, browse tasks, inspect a preview, and explicitly import one into a queued session. Browser and VS Code use the same server registrations and API. Importing does not start agents, assign the task, post a comment or change its status.

An administrator links each source once in the server configuration. This release supplies five adapters; it does not yet have OAuth installation or a graphical connection-management wizard. Adding another system requires a server adapter that implements the same list/get normalization contract.

## Task source and code host are separate choices

`taskSources[].repositoryId` maps a task source to an administrator-registered repository. That repository fixes the clone URL, base branch and verification command. A Vikunja project can point at a Forgejo repository; a ClickUp List can point at GitHub or GitLab. A forge's issue source can also be used directly. Task content never chooses a clone URL or a runtime endpoint.

| You want to use | Register the task source as | Register the code checkout as |
| --- | --- | --- |
| Vikunja tasks with Forgejo code | `provider: "vikunja"`, numeric project ID | A repository with the Forgejo HTTPS clone URL |
| ClickUp tasks with GitLab code | `provider: "clickup"`, numeric home List ID | A repository with the GitLab HTTPS clone URL |
| GitHub issues with GitHub code | `provider: "github"`, `owner/repo` | A repository with the GitHub HTTPS clone URL |
| Forgejo issues with Forgejo code | `provider: "forgejo"`, `owner/repo` | A repository with the Forgejo HTTPS clone URL |
| GitLab issues with GitLab code | `provider: "gitlab"`, numeric ID or namespace/path | A repository with the GitLab HTTPS clone URL |

Issue credentials authorize the control plane to read task content. They are not used for Git cloning, model inference or publication. Private repository read credentials are a separate workspace deployment concern described in [live operation](live.md).

## Register the connection

Copy the complete example, keep only the sources you need, and replace its example repository, model alias, API roots and project IDs:

```sh
cp config/task-sources.example.json config/live.local.json
```

Set the server environment and live runtime prerequisites using [live operation](live.md). Supply each task token through the environment variable named by `tokenEnv`. An ignored private `.env` works for a trusted development host because `npm start` loads it; a remote deployment should inject those variables through its existing secret mechanism. The checked-in JSON contains variable names, never token values.

Start the configured server:

```sh
npm start -- --config config/live.local.json
```

The following is one `taskSources` entry, placed inside the array in the full configuration:

```json
{
  "id": "team-vikunja",
  "name": "Engineering · Vikunja",
  "provider": "vikunja",
  "baseUrl": "https://tasks.example/api/v1",
  "project": "42",
  "repositoryId": "application",
  "tokenEnv": "VLOER_TASK_VIKUNJA_TOKEN",
  "executionOwner": "interactive"
}
```

| Field | Meaning |
| --- | --- |
| `id` | Stable, unique lowercase connection slug. Keep it stable so retained task references continue identifying their source |
| `name` | Human-facing connection label shown in both clients |
| `provider` | `forgejo`, `github`, `gitlab`, `clickup` or `vikunja` |
| `baseUrl` | The API root, including its API version path where applicable. It is not a browser issue URL |
| `project` | The configured repository, home List or project identifier for that provider; use a string |
| `repositoryId` | An existing entry in `repositories`. Operators cannot substitute another checkout during import |
| `tokenEnv` | Optional name of the server environment variable containing this source's credential. If supplied, it must contain a token when the server starts. Omit only for an API that permits the intended unauthenticated reads. Do not reuse the LiteLLM master or an operator login secret |
| `executionOwner` | `interactive` for standalone operator sessions, or `ploeg` when Ploeg owns dispatch and execution |
| `ploeg` | Optional explicit Work Target for shared Vikunja or ClickUp imports; requires shared execution configuration |

Use HTTPS for remote API roots. HTTP is accepted only for loopback development fixtures. The adapters reject redirects and embedded URL credentials. A reverse proxy must expose the provider API directly at the configured root. Network access and DNS resolution occur on the Vloer server.

## Provider recipes

These entries use the same registered `application` repository. Choose the rows that match your actual systems; configuring all five is optional.

| Provider | `baseUrl` example | `project` example | Environment variable example |
| --- | --- | --- | --- |
| Forgejo | `https://forge.example/api/v1` | `webgrip/application` | `VLOER_TASK_FORGEJO_TOKEN` |
| GitHub.com | `https://api.github.com` | `webgrip/application` | `VLOER_TASK_GITHUB_TOKEN` |
| GitHub Enterprise Server | `https://github.example/api/v3` | `webgrip/application` | `VLOER_TASK_GITHUB_TOKEN` |
| GitLab | `https://gitlab.example/api/v4` | `webgrip/platform/application` or `"123"` | `VLOER_TASK_GITLAB_TOKEN` |
| ClickUp | `https://api.clickup.com/api/v2` | `"901234567890"` | `VLOER_TASK_CLICKUP_TOKEN` |
| Vikunja | `https://tasks.example/api/v1` | `"42"` | `VLOER_TASK_VIKUNJA_TOKEN` |

For Forgejo and GitHub, use exactly `owner/repository` without `.git`, issue number or URL. GitLab accepts a numeric project ID or an unescaped namespace path, including subgroups; the adapter encodes it for the API. ClickUp uses the task's home List, not its Workspace, Space or Folder. Vikunja uses its numeric project ID. API reverse-proxy prefixes are supported when the required suffix remains present.

### Forgejo

Create a token with **`read:issue`** and restrict it to the intended repository where the instance supports that token option. The connector performs issue list/get operations. Code clone permissions are separately provisioned. Forgejo documents both issue read scope and the specific-repository token boundary in its [access token scope reference](https://forgejo.org/docs/latest/user/authentication/token-scope/).

The adapter uses the configured repository scope, excludes pull requests, and fetches issue details by the repository-local issue number. It does not enumerate all repositories or install webhooks.

### GitHub

Use a fine-grained personal access token limited to the selected repository with **Issues: read**. The list and get issue endpoints support that permission. GitHub's issues API also returns pull requests; the adapter excludes records containing `pull_request`. See the [official issue endpoint contract](https://docs.github.com/en/rest/issues/issues#list-repository-issues).

The current connection accepts a provisioned token. It does not install a GitHub App, renew installation tokens, or create pull requests. Public and private connectivity must still be qualified against the configured GitHub.com or Enterprise Server instance.

### GitLab

Prefer a project access token where available, with **`read_api`**, and an account role that can read the intended issues. GitLab's token model distinguishes a project token's project scope from a personal token's wider account access; `read_repository` alone grants repository access rather than general issue API access. See [access token scopes](https://docs.gitlab.com/security/tokens/access_token_scopes/) and [project access tokens](https://docs.gitlab.com/user/project/settings/project_access_tokens/).

The adapter sends the token in the `PRIVATE-TOKEN` header and uses project-local issue IIDs for detail requests. It does not fetch merge requests or perform GitLab OAuth, DPoP signing or token renewal. Qualify the actual deployment's authentication requirements before the pilot.

### ClickUp

The pilot adapter uses a **personal API token** in the raw `Authorization` header. Obtain it from ClickUp Settings → Apps and place it in the server environment. The token inherits the account's access; a read-only implementation does not make a broad personal token read-only. Use an account restricted to the intended work. ClickUp recommends OAuth for applications used by other people; its [authentication guide](https://developer.clickup.com/docs/authentication) documents the distinction. OAuth onboarding is planned, not provided by this release.

The connection targets one home List. Tasks whose returned home List does not match the configured List are rejected, including tasks merely attached through ClickUp's tasks-in-multiple-lists feature. This makes the import scope explicit. See the [List tasks endpoint](https://developer.clickup.com/reference/gettasks). Comments, attachments and custom fields are not added to the imported objective.

### Vikunja

Create an API token in **Settings → API Tokens** and grant the reads needed for task listing and task detail on the configured project. The connector uses a Bearer token. A dedicated account with read-only access to the project can further limit the integration; Vikunja describes that project sharing right as `0`. See [API authentication](https://vikunja.io/docs/api-documentation/) and [project permissions](https://vikunja.io/docs/permissions/).

This adapter targets **Vikunja API v1**. It lists tasks through `/tasks` with the configured `project_id` and incomplete-state filter, fetches details through `/tasks/{id}`, and checks the returned project ID. It does not depend on a legacy `/projects/{id}/tasks` route. Check your instance's `/api/v1/docs` when qualifying it. Vikunja currently documents v1 as supported alongside v2, with deprecation planned for 3.0 and removal for 4.0; use a compatible instance until a v2 adapter is implemented. [Vikunja API version guidance](https://vikunja.io/docs/api-documentation/).

Vikunja task links assume the frontend uses the API's origin and reverse-proxy prefix. A frontend hosted on a different origin needs a future explicit frontend-URL setting; API task reads can succeed while the generated browser link is unsuitable for that deployment.

## Use the connection

Open the task browser in De Vloer or run the extension's task import command. Choose a source, browse a page of open tasks, and preview the selected task. The preview shows its provider, source identity, current task content and destination repository. Select the crew, configured runtime and budget, then import it. Review the queued session and start it when ready.

The server refetches the task when importing and compares it with the previewed revision. If the task changed, refresh the preview and inspect the update. Closed or completed tasks cannot be imported. Task text is source content, not authority to change runtime policy, access credentials or override the registered repository.

Importing the same task revision again returns its existing session for that operator, including an already completed session; it does not create another paid attempt. If another operator owns the import, the server returns a conflict without exposing that person's session ID. Administrators can access the existing session. A changed task revision may create a new session only after prior work is terminal, no worker or uncertain interruption remains, and spend reservations are resolved. Otherwise inspect the existing work first. Standalone imports coordinate one Vloer store. Shared imports use the Ploeg claim described below.

Task listing is paged, not an exhaustive background synchronization. Most providers return at most 50 records per request; ClickUp uses up to 100. Move to the next page to browse further. The server bounds response size and task text; oversized content produces an explicit error instead of silently dropping acceptance criteria. The imported revision covers normalized title, description, state, update timestamp and link. It does not include comments, labels, checklists, assignees, priority, custom fields or linked documents. Put the required acceptance criteria in the task description for this pilot; changes to other fields are outside its revision check.

The same task may be represented in several systems. This release identifies imports by their registered source and task identity; it does not infer that a ClickUp task and a linked Forgejo issue are the same work item. Use one authoritative source per work item for the pilot.

## Share a server deliberately

All authenticated Vloer users share the registered source visibility, including viewers. The server credential's permitted task content is therefore visible to those users. Viewers cannot import or start work. Vloer does not currently reproduce each person's provider permissions or isolate sources by team membership. Use one trusted team per deployment and scope the configured source account accordingly. Session ownership checks continue to apply after import.

An `executionOwner` declaration alone is a local routing rule. Standalone imports require an interactive source and repository. With [shared execution](unified-baseline.md), Ploeg remains the authority and tracker imports must bind the existing Work Item using the registered target below.

The server checks source and repository configuration again before first admission. Existing repository registrations without an ownership declaration retain the interactive default; new task source entries require an explicit declaration. Declare repository ownership too when introducing Ploeg alongside the service.

## Import the existing Ploeg work item

Enable the [shared execution connection](unified-baseline.md), then register a supported source with an explicit target. This example maps the existing `application` repository whose URL is `https://forge.example/team/application.git` and base branch is `main`:

```json
{
  "id": "engineering",
  "name": "Engineering",
  "provider": "vikunja",
  "baseUrl": "https://tasks.example/api/v1",
  "project": "42",
  "repositoryId": "application",
  "tokenEnv": "VLOER_TASK_VIKUNJA_TOKEN",
  "executionOwner": "ploeg",
  "ploeg": {
    "target": {
      "forge": "primary",
      "owner": "team",
      "repo": "application",
      "baseBranch": "main"
    }
  }
}
```

The forge ID must exist in Ploeg, and the API root must be the same singleton Vikunja or ClickUp instance Ploeg uses. The native project or home List and exact target must match the existing Ploeg mirror. All target fields are required. A missing, unresolved, already claimed or previously executed item stays unavailable for this import path; the browser reports the binding problem without creating a manual duplicate.

Open the task preview and review the linked Work Item and target. Import creates one queued session. Start refetches the source as the session's owner and asks Ploeg to atomically claim the existing item. Import itself makes no tracker mutation and starts no model work. If a queued draft becomes stale, cancel it and review a fresh import; an old mandate never silently becomes a new one. An uncertain admission retries its original persisted request.

The [binding contract](../contracts/ploeg-tracker-binding.md) separates preview hashes, native tracker revisions and Ploeg row freshness. Browser qualification uses `mise exec -- node scripts/browser-task-binding-check.mjs`; its tracker and Ploeg are explicitly labelled fixtures and it starts no agents or model calls.

## Diagnose a connection

| Symptom | Check |
| --- | --- |
| Server rejects a missing credential | The named environment variable is present in the actual server process. Supplying it only to the editor does not configure the server |
| Authorization rejected | Token expiry, provider read permissions, account/project access and the instance's authentication policy |
| Source or task missing | API root versus browser URL, exact repository/project/List scope, home List membership, and issue number versus global provider ID |
| No tasks on a page | Open/incomplete task state, selected page, and whether the provider returned only excluded pull requests |
| Task changed during import | Refresh the preview and approve the new content; don't reuse the previous revision |
| Shared import blocked | Check the explicit source target, singleton API root, configured execution team and current queued/pristine Ploeg item. Unsupported tracker providers remain inspection-only in shared mode |
| Standalone import blocked | The source and destination repository must belong to the interactive lane |
| Redirect or unexpected content rejected | Configure the final API root directly and inspect the reverse proxy; login HTML is not an API response |
| Description too large | Bound the task's actionable scope in the tracker, or create a smaller task. The connector does not silently truncate it |

The tests exercise provider contracts with local HTTP fixtures. They do not demonstrate live authentication against your accounts, verify every self-hosted version, or create external tasks. The [connector source notes](../research/task-connector-sources.md) record the inspected official API contracts and adapter limits. Record the instance version and a real list → preview → import result in [validation](../validation.md) during qualification.

## What follows this release

The next connection-management design adds an administrator wizard, provider authorization where applicable, scope discovery, credential rotation, a health view and explicit source-to-repository mappings. The next unattended delivery layer adds authenticated webhooks and reconciliation through Ploeg, transactional deduplication, one canonical WorkOrder, independent verification and fenced publication. Both clients should remain thin views over those shared contracts.

The [ticket integration design](../design/ticket-integration.md), [system design](../PRODUCT-DESIGN.md) and [backlog](../../backlog/README.md) describe that larger system. The five implemented read adapters are a starting point for it; they do not make arbitrary project-management APIs automatically compatible.
