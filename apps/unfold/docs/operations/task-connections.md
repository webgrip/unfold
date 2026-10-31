# Connect a task system

Unfold reads tasks from **Vikunja, ClickUp, Forgejo, GitHub, GitLab and Jira Cloud** through the same operator workflow: choose a connection, browse tasks, inspect a preview, and explicitly import one into a queued session. Browser and VS Code use the same server registrations and API. Importing does not start agents, assign the task, post a comment or change its status. [Handing a Vikunja task to Ploeg](#hand-a-task-to-ploeg) is a separate, explicit action that does assign it and leaves a comment.

An administrator registers each source in the server configuration. Personal GitLab and ClickUp account links are also implemented, including optional OAuth; see [account linking](live.md#linking-clickup). Those account links do not replace administrator source registration, but a tracker whose adapter offers setting up by name, ClickUp today, lets a person pick a List with their link, test it and copy the entry an administrator adds ([ClickUp](#clickup)).

## Task providers are adapters

Each task system is an adapter in `src/task-providers/`, one file per provider, registered by name in `src/task-providers/index.ts`. The adapter browses, reads and normalizes tasks for import, and declares what else its tracker can do. Code outside the adapters asks for a capability and never names a provider ([system ADR-0050](../../../../docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md), rule 1); a test fails when it does. A source whose `provider` no adapter registered is refused at start-up with `Unsupported task source provider`.

| Provider | Hand to Ploeg | Report a problem | Descriptions | Reference | Personal link |
| --- | --- | --- | --- | --- | --- |
| `forgejo` | no | issues | Markdown | none | none |
| `github` | no | no | Markdown | none | none |
| `gitlab` | no | no | Markdown | none | `gitlab` |
| `vikunja` | yes, and Ploeg's assignment routes | tasks | HTML, shown as Markdown | `VIK-<id>` | none |
| `clickup` | yes | no | Markdown, tidied for display | none; a custom task ID shows as the task's reference | `clickup`, and set-up by name |
| `jira` | no | issues | Atlassian Document Format, shown as Markdown | the issue key, `<KEY>-<n>` | none |
| `demo` | no (demo mode only) | no | Markdown | none | none |

The hand-off and reporting messages list the adapters that declare the capability, so a new adapter appears in them without another change. Personal account links are a registry of their own in `src/link-providers/`. Adding a tracker is a new adapter file and one line in the index.

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

Set the server environment and live runtime prerequisites using [live operation](live.md). Supply each registered task token through the environment variable named by `tokenEnv`, populated through the deployment's secret mechanism or a short-lived vault-backed shell. The JSON contains variable names, never token values.

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
  "tokenEnv": "UNFOLD_TASK_VIKUNJA_TOKEN",
  "executionOwner": "interactive"
}
```

| Field | Meaning |
| --- | --- |
| `id` | Stable, unique lowercase connection slug. Keep it stable so retained task references continue identifying their source |
| `name` | Human-facing connection label shown in both clients |
| `provider` | `forgejo`, `github`, `gitlab`, `clickup`, `vikunja` or `jira` |
| `baseUrl` | The API root, including its API version path where applicable. It is not a browser issue URL |
| `project` | The configured repository, home List or project identifier for that provider; use a string |
| `repositoryId` | An existing entry in `repositories`. Operators cannot substitute another checkout during import |
| `tokenEnv` | Optional name of the server environment variable containing this source's credential. If supplied, it must contain a token when the server starts. Omit only for an API that permits the intended unauthenticated reads. Do not reuse the LiteLLM master or an operator login secret |
| `executionOwner` | `ploeg` when Ploeg owns dispatch and execution, which every importable live source needs; `interactive` sources stay readable but import only into the retired standalone mode |
| `ploeg` | Optional explicit Work Target for shared Vikunja or ClickUp imports; requires shared execution configuration |
| `tenant` | Optional [Tenant](../../../../docs/reference/glossary.md#tenant) that owns the source; `default` when unset. It must be the Tenant of the source's repository |
| `client` | Optional [Client](../../../../docs/reference/glossary.md#client) inside that Tenant that owns the source. A repository with a `client` takes sources of that Client only |

### Who owns a source and a repository

Each task source and each entry in `repositories` belongs to exactly one Tenant and, inside it, to at most one Client ([system ADR-0017](../../../../docs/adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md)). Both take the same optional `tenant` and `client` fields; an entry that sets neither belongs to the `default` Tenant with no Client, which is what every install without tenancy has. Ids are lower-case letters, digits and inner hyphens, at most 63 characters.

```json
"repositories": [{ "id": "acme-shop", "name": "Acme shop", "url": "https://forge.example/agency/acme-shop.git", "baseBranch": "main", "verify": ["npm", "test"], "tenant": "agency", "client": "acme" }],
"taskSources": [{ "id": "acme-board", "name": "Acme · Vikunja", "provider": "vikunja", "baseUrl": "https://tasks.example/api/v1", "project": "42", "repositoryId": "acme-shop", "tokenEnv": "UNFOLD_TASK_VIKUNJA_TOKEN", "executionOwner": "ploeg", "tenant": "agency", "client": "acme" }]
```

Unfold refuses to start, naming both entries, when:

* one repository is registered twice for different owners. A repository is keyed by its forge host and `owner/name`, without `.git` and in any case, so its HTTPS and SSH URLs are one repository;
* one tracker project is registered twice, under two connection ids, for different owners. A project is keyed by provider, API root and project id, so the same project id on another instance is another source. Two connection ids for one project and one owner stay allowed, as before;
* a source's Tenant is not its repository's Tenant, or its repository belongs to a Client and the source does not belong to that same Client. A Client's source may use a repository of its Tenant that no Client owns.

What the owner limits for people signed in is in [Tenant and Client memberships](live.md#tenant-and-client-memberships).

Use HTTPS for remote API roots. HTTP is accepted only for loopback development fixtures. The adapters reject redirects and embedded URL credentials. A reverse proxy must expose the provider API directly at the configured root. Network access and DNS resolution occur on the Unfold server.

## Provider recipes

These entries use the same registered `application` repository. Choose the rows that match your actual systems; configuring all five is optional.

| Provider | `baseUrl` example | `project` example | Environment variable example |
| --- | --- | --- | --- |
| Forgejo | `https://forge.example/api/v1` | `webgrip/application` | `UNFOLD_TASK_FORGEJO_TOKEN` |
| GitHub.com | `https://api.github.com` | `webgrip/application` | `UNFOLD_TASK_GITHUB_TOKEN` |
| GitHub Enterprise Cloud with data residency (GHE.com) | `https://api.octocorp.ghe.com` | `webgrip/application` | `UNFOLD_TASK_GITHUB_TOKEN` |
| GitHub Enterprise Server | `https://github.example/api/v3` | `webgrip/application` | `UNFOLD_TASK_GITHUB_TOKEN` |
| GitLab | `https://gitlab.example/api/v4` | `webgrip/platform/application` or `"123"` | `UNFOLD_TASK_GITLAB_TOKEN` |
| ClickUp | `https://api.clickup.com/api/v2` | `"901234567890"` | `UNFOLD_TASK_CLICKUP_TOKEN` |
| Vikunja | `https://tasks.example/api/v1` | `"42"` | `UNFOLD_TASK_VIKUNJA_TOKEN` |
| Jira Cloud, service account | `https://api.atlassian.com/ex/jira/CLOUD-ID/rest/api/3` | `APP` | `UNFOLD_TASK_JIRA_TOKEN` |
| Jira Cloud, user API token | `https://SITE.atlassian.net/rest/api/3` | `APP` | `UNFOLD_TASK_JIRA_TOKEN` |

For Forgejo and GitHub, use exactly `owner/repository` without `.git`, issue number or URL. GitLab accepts a numeric project ID or an unescaped namespace path, including subgroups; the adapter encodes it for the API. ClickUp uses the task's home List, not its Workspace, Space or Folder. Vikunja uses its numeric project ID. Jira uses the project key in capitals, such as `APP`. API reverse-proxy prefixes are supported when the required suffix remains present.

### Forgejo

Create a token with **`read:issue`** and restrict it to the intended repository where the instance supports that token option. The connector performs issue list/get operations. Code clone permissions are separately provisioned. Forgejo documents both issue read scope and the specific-repository token boundary in its [access token scope reference](https://forgejo.org/docs/latest/user/authentication/token-scope/).

The adapter uses the configured repository scope, excludes pull requests, and fetches issue details by the repository-local issue number. It does not enumerate all repositories or install webhooks.

### GitHub

Use a fine-grained personal access token limited to the selected repository with **Issues: read**. The list and get issue endpoints support that permission. GitHub's issues API also returns pull requests; the adapter excludes records containing `pull_request`. See the [official issue endpoint contract](https://docs.github.com/en/rest/issues/issues#list-repository-issues).

The `baseUrl` is `https://api.github.com` for GitHub.com and `https://api.SUBDOMAIN.ghe.com`, with no path, for an enterprise on GHE.com, where `SUBDOMAIN` is the enterprise's dedicated subdomain ([GitHub's REST API base URL](https://docs.github.com/en/enterprise-cloud@latest/rest/using-the-rest-api/getting-started-with-the-rest-api), [GHE.com network details](https://docs.github.com/en/enterprise-cloud@latest/admin/data-residency/network-details-for-ghecom)). Enterprise Server keeps its own host with the `/api/v3` path. Any other `ghe.com` host or path is rejected, and issue links open on the matching web host: `github.com`, `SUBDOMAIN.ghe.com` or the Enterprise Server host.

The current connection accepts a provisioned token. It does not install a GitHub App, renew installation tokens, or create pull requests. Public and private connectivity must still be qualified against the configured GitHub.com, GHE.com or Enterprise Server instance.

### GitLab

Prefer a project access token where available, with **`read_api`**, and an account role that can read the intended issues. GitLab's token model distinguishes a project token's project scope from a personal token's wider account access; `read_repository` alone grants repository access rather than general issue API access. See [access token scopes](https://docs.gitlab.com/security/tokens/access_token_scopes/) and [project access tokens](https://docs.gitlab.com/user/project/settings/project_access_tokens/).

The adapter sends the token in the `PRIVATE-TOKEN` header and uses project-local issue IIDs for detail requests. It does not fetch merge requests or perform GitLab OAuth, DPoP signing or token renewal. Qualify the actual deployment's authentication requirements before the pilot.

### ClickUp

**Set it up by name.** Configure the [ClickUp account link](live.md#linking-clickup) (`links.clickup`, with OAuth or pasted personal tokens). A person then opens **Settings › Connect a tracker** (`#settings/task-setup`, also offered on an empty Tasks page), and:

1. links their ClickUp account if they have not (the page says so and links to Linked accounts);
2. picks a **Workspace**, **Space**, **Folder** and **List** by name. A Space shows its Folders and the Lists outside any Folder; archived Spaces, Folders and Lists, and ClickUp's hidden Folders, are left out. A level with one choice is picked for them. Everything is read with that person's own account, so they see only what it sees;
3. gets a check that changes nothing: the account Unfold reads as, the List's path and statuses (an archived List is a problem), and the first page of open tasks with five previewed the way an import reads them: custom task ID or id, title, assignees, tags, due date and the start of the description. Comments, attachments and custom fields are not read;
4. chooses the registered repository the work goes to and copies the `taskSources` entry. It has no `tokenEnv`, so everyone reads with their own linked account, and `executionOwner: "ploeg"`. An administrator adds it to the configuration and restarts Unfold. A List some source already reads says so instead.

Connections stay in the server configuration ([who owns a source](#who-owns-a-source-and-a-repository)); the page never changes it. Under **Connected now** the same page has **Test connection** for every registered source (`GET /api/task-sources/{id}/check`), which reads with the source's own token or the person's link and also says whether its tasks can be handed to Ploeg.

**Token.** A source without `tokenEnv` reads with each person's linked account. A source with `tokenEnv` reads with that **personal API token** (ClickUp Settings → Apps), sent in the raw `Authorization` header. ClickUp tokens are not scoped: a token carries its account's whole access, so use an account that sees only the intended Lists ([ClickUp authentication](https://developer.clickup.com/docs/authentication)). Hand-off needs a `tokenEnv` source, because the server assigns the Team's user with its own token.

**What it reads.** The source is one home List: `GET /list/{id}/task` with `include_closed=false`, `include_timl=false`, `subtasks=true`, `include_markdown_description=true`, newest change first, 100 tasks a page, following ClickUp's `last_page` ([Get Tasks](https://developer.clickup.com/reference/gettasks)). A task, or subtask, whose home List is another List is left out of the page rather than failing it; opening one directly answers `task_outside_source`. ClickUp status types `open` and `custom` are open, `closed` and `done` closed, so custom statuses work. All assignees show. A custom task ID (such as `SHOP-12`) is the task's reference in the list; the task still opens by its ClickUp id. Due dates are ClickUp's UTC timestamps, shown in the reader's time zone.

**Descriptions** are ClickUp's own Markdown. For display, images become links that say `Image: …` (the browser shows no remote images) and the inline underline, span and line-break tags ClickUp mixes in become plain text; the stored snapshot and its revision keep ClickUp's text. The renderer escapes everything else and keeps only `http`, `https` and `mailto` links.

**Rate limits.** ClickUp lets each token ask 100 times a minute on most plans and answers 429 with `X-RateLimit-Reset` ([ClickUp rate limits](https://developer.clickup.com/docs/rate-limits)). Unfold waits out a 429 that asks for two seconds or less and asks once more. A longer one answers `task_rate_limited` with `Retry-After` and a message naming the seconds, and Unfold then asks nothing with that token until the reset; a response that reports `X-RateLimit-Remaining: 0` does the same before ClickUp has to refuse. Setup reads are cached per person for a minute, so clicking back and forth through the pickers costs little. All ClickUp reads happen while a person waits; Unfold has no background ClickUp work, so none of it goes through the job queue.

### Vikunja

Create an API token in **Settings → API Tokens** and grant the reads needed for task listing and task detail on the configured project. The connector uses a Bearer token. A dedicated account with read-only access to the project can further limit the integration; Vikunja describes that project sharing right as `0`. See [API authentication](https://vikunja.io/docs/api-documentation/) and [project permissions](https://vikunja.io/docs/permissions/).

This adapter targets **Vikunja API v1**. It lists tasks through `/tasks` with the configured `project_id` and incomplete-state filter, fetches details through `/tasks/{id}`, and checks the returned project ID. It does not depend on a legacy `/projects/{id}/tasks` route. Check your instance's `/api/v1/docs` when qualifying it. Vikunja currently documents v1 as supported alongside v2, with deprecation planned for 3.0 and removal for 4.0; use a compatible instance until a v2 adapter is implemented. [Vikunja API version guidance](https://vikunja.io/docs/api-documentation/).

Vikunja task links assume the frontend uses the API's origin and reverse-proxy prefix. A frontend hosted on a different origin needs a future explicit frontend-URL setting; API task reads can succeed while the generated browser link is unsuitable for that deployment.

### Jira

The adapter reads one Jira Cloud project through REST API v3. Jira Data Center has no v3 API and is not supported.

**Use a service account.** In Atlassian Administration, under **Directory → Service accounts**, create an account for Unfold and give it a scoped API token ([Atlassian: manage API tokens for service accounts](https://support.atlassian.com/user-management/docs/manage-api-tokens-for-service-accounts/)). Choose the scopes when you create the token; they cannot be changed afterwards:

| Unfold does | Scopes |
| --- | --- |
| Browse, preview and import | `read:jira-work` |
| Report a problem into the project | `read:jira-work`, `write:jira-work` and `read:jira-user` (for `GET /myself`) |

A scoped token works only through Atlassian's gateway, so `baseUrl` is `https://api.atlassian.com/ex/jira/CLOUD-ID/rest/api/3`. The site's cloud ID is the `cloudId` in `https://SITE.atlassian.net/_edge/tenant_info`. Put the token alone in the variable `tokenEnv` names; Unfold sends it as a Bearer token. Through the gateway, Unfold reads the site's address once from `GET /serverInfo` to build `https://SITE.atlassian.net/browse/APP-12` links, and accepts only an `atlassian.net` address there.

A classic API token of an ordinary Atlassian account also works, against the site's own root `https://SITE.atlassian.net/rest/api/3`. Put `email:token` in the variable; Unfold sends it as Basic credentials. A classic token carries the account's whole access, so use a dedicated account.

**Scope it per Client.** The service account sees what its Jira project roles let it see, and the token's scopes do not narrow that. Grant it **Browse projects** on exactly the projects Unfold may read, through each project's permission scheme, and register one task source per project. Give each source the `client` of the Client that owns the project ([who owns a source](#who-owns-a-source-and-a-repository)). Unfold lists a source's issues with this JQL, built from the configured key and never from task content:

```text
project = "APP" AND statusCategory != Done ORDER BY updated DESC, key DESC
```

Every issue it reads must belong to that project; one from another project answers `task_outside_source`.

**What it reads.** Lists go through `GET /search/jql`, which replaced the removed `GET /search` ([Atlassian: run a JQL search with the REST API](https://confluence.atlassian.com/display/JIRAKB/Run+JQL+search+query+using+Jira+Cloud+REST+API)). That endpoint pages with a `nextPageToken`, not a page number, so Unfold remembers the token of each page it has read and reaches a later page by walking at most ten pages from the nearest one it knows. One issue is read with `GET /issue/{key}`. An issue is named by its key, such as `APP-12`, which is also its reference in Unfold. A moved or renamed issue answers `task_moved`; open it from the list again.

Descriptions are Atlassian Document Format (ADF). Unfold renders them as HTML in which every text is escaped and only `http`, `https` and `mailto` links survive, and shows that HTML as Markdown like a Vikunja description. Mentions keep their display text, images and files show as `[attachment]`, and node types Unfold does not know keep their text. The status comes from Jira's status category: **Done** is closed, **To Do** and **In Progress** are open. Labels, the assignee, priority and due date show beside the task.

**Report a problem** files a Bug in the project (else a Task, else the project's first standard type, from `GET /issue/createmeta/{key}/issuetypes`), with the body converted to ADF, and attaches the screenshot, `console.json` and `requests.json` with `POST /issue/{key}/attachments`. Replies and repeat reports are comments. Unfold follows the issue's status category, labels, assignee and latest ten comments. The service account needs **Create issues**, **Create attachments** and **Add comments** on the report project.

**Not built.** Hand-off to Ploeg: Ploeg takes no Jira work (see [the hand-off matrix](#hand-a-task-to-ploeg)). Personal Atlassian account links through OAuth 2.0 (3LO). Transitions: Unfold never changes an issue's status. A panel inside Jira is a later, separate piece, built as an [Atlassian Forge](https://developer.atlassian.com/platform/forge/) app, because Atlassian ends support for Connect apps on 31 January 2027 ([Atlassian: Connect end of support extended to January 31, 2027](https://community.developer.atlassian.com/t/connect-end-of-support-extended-to-january-31-2027/102002)).

## Use the connection

Open the task browser in Unfold or run the extension's task import command. Choose a source, browse a page of open tasks, and preview the selected task. The preview shows its provider, source identity, current task content and destination repository. Select the Team, configured runtime and budget, then import it. Review the queued session and start it when ready.

The server refetches the task when importing and compares it with the previewed revision. If the task changed, refresh the preview and inspect the update. Closed or completed tasks cannot be imported. Task text is source content, not authority to change runtime policy, access credentials or override the registered repository.

Importing the same task revision again returns its existing session for that operator, including an already completed session; it does not create another paid attempt. If another operator owns the import, the server returns a conflict without exposing that person's session ID. Administrators can access the existing session. A changed task revision may create a new session only after prior work is terminal, no worker or uncertain interruption remains, and Holds on spend are resolved. Otherwise inspect the existing work first. Standalone imports coordinate one Unfold store. Shared imports use the Ploeg claim described below.

Task listing is paged, not an exhaustive background synchronization. Most providers return at most 50 records per request; ClickUp uses up to 100. Move to the next page to browse further. The server bounds response size and task text. A list page cuts a description over 16,000 characters and marks it truncated, so one long task does not hide the rest. Previewing or importing that task still refuses it with an explicit error instead of silently dropping acceptance criteria. Tasks also show labels, assignees, priority, due date and the tracker's own identifier where the provider returns them, and Vikunja's HTML descriptions are converted to plain Markdown for reading. The imported revision covers normalized title, description, state, update timestamp and link. It does not include comments, labels, checklists, assignees, priority, custom fields or linked documents. Put the required acceptance criteria in the task description for this pilot; changes to other fields are outside its revision check.

The same task may be represented in several systems. This release identifies imports by their registered source and task identity; it does not infer that a ClickUp task and a linked Forgejo issue are the same Work Item. Use one authoritative source per Work Item for the pilot.

## Share a server deliberately

All authenticated Unfold users share the registered source visibility, including viewers. The server credential's permitted task content is therefore visible to those users. Viewers cannot import or start work. Unfold does not currently reproduce each person's provider permissions or isolate sources by team membership. Use one trusted team per deployment and scope the configured source account accordingly. Session ownership checks continue to apply after import.

An `executionOwner` declaration alone is a local routing rule. A live Unfold always runs with [shared execution](../../../../docs/workflows/managed-execution.md), so Ploeg remains the authority and tracker imports must bind the existing Work Item using the registered target below.

The server checks source and repository configuration again before first admission. Existing repository registrations without an ownership declaration retain the interactive default; new task source entries require an explicit declaration. Declare repository ownership too when introducing Ploeg alongside the service.

## Import the existing Ploeg Work Item

Enable the [shared execution connection](../../../../docs/workflows/managed-execution.md), then register a supported source with an explicit target. This example maps the existing `application` repository whose URL is `https://forge.example/team/application.git` and base branch is `main`:

```json
{
  "id": "engineering",
  "name": "Engineering",
  "provider": "vikunja",
  "baseUrl": "https://tasks.example/api/v1",
  "project": "42",
  "repositoryId": "application",
  "tokenEnv": "UNFOLD_TASK_VIKUNJA_TOKEN",
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

The forge ID must exist in Ploeg, and the API root must be the same singleton Vikunja or ClickUp instance Ploeg uses. The native project or home List and exact target must match the existing Ploeg mirror. All target fields are required. A missing, unresolved, already claimed or previously executed item stays unavailable for this import path and never becomes a manual duplicate. On the Tasks page such a task shows only its Ploeg card, which says where the task stands and offers the hand-off; the import form appears only for a queued Work Item of the execution team.

Open the task preview and review the linked Work Item and target. Import creates one queued session. Start refetches the source as the session's owner and asks Ploeg to atomically claim the existing item. Import itself makes no tracker mutation and starts no model work. If a queued draft becomes stale, cancel it and review a fresh import; an old mandate never silently becomes a new one. An uncertain admission retries its original persisted request.

The [binding contract](../contracts/ploeg-tracker-binding.md) separates preview hashes, native tracker revisions and Ploeg row freshness. Browser qualification uses `mise exec -- node scripts/browser-task-binding-check.mjs`; its tracker and Ploeg are explicitly labelled fixtures and it starts no agents or model calls.

## Hand a task to Ploeg

Ploeg takes work from the trackers whose adapter declares hand-off, Vikunja and ClickUp, when a task is assigned to the tracker user that routes to one of its teams. What the pinned Ploeg release takes from each tracker decides which adapters declare hand-off:

| Tracker | Ploeg takes its work | Unfold hands off | Why |
| --- | --- | --- | --- |
| Vikunja | by assignee, through the `task.assignee.created` webhook | yes | Ploeg reports each team's assignees and pinned projects |
| ClickUp | by assignee, through the `taskAssigneeUpdated` webhook | yes | Ploeg reports each team's assignees and pinned Lists |
| GitHub Issues | by a `ploeg:<team>` label, or by an assignee listed in `PLOEG_GITHUB_TEAM_MAP` | no | Ploeg's team read reports only the assignees of `teams.<team>.assignees` and `PLOEG_TEAM_MAP`, so Unfold cannot know which GitHub login routes to a team, nor the label prefix |
| GitLab issues | no; Ploeg uses GitLab only as a forge | no | Ploeg has no GitLab tracker |
| Forgejo issues | no | no | Ploeg has no Forgejo tracker |
| Jira | no | no | Ploeg has no Jira tracker |

GitHub hand-off needs one generic change in Ploeg first: its team read reports the routing assignees per tracker.

The Tasks page and the editor's task view offer **Hand to Ploeg** with a team picker, and **Take back** while Ploeg has not started. The server does the assignment with the connection's token, so nobody needs to know which tracker user belongs to which team. The [API contract](../contracts/api.md#hand-a-task-to-ploeg) lists the routes and refusals, and [ADR 0025](../adrs/0025-hand-tracker-tasks-to-ploeg-by-assignment.md) records why.

A connection can hand off when all of these hold:

* its adapter declares hand-off (Vikunja or ClickUp) and it has a `tokenEnv`;
* its `executionOwner` is `"ploeg"`. A `ploeg.target` is not needed for hand-off; it is only for [importing the existing Ploeg Work Item](#import-the-existing-ploeg-work-item);
* the server has a live `ploeg` operator connection, not the demo;
* Ploeg reports tracker assignees for its teams. Ploeg's teams config `teams.<team>.assignees` and `PLOEG_TEAM_MAP` set them.

Only one team holds a task at a time. Hand-off is refused while another team's tracker user is on the task or Ploeg has live work for it, and take-back is refused once any team has started. When Ploeg pins a board to a team (a Vikunja project or ClickUp List with an `id` and a `team:` in Ploeg's tracker configuration), every assignment on that board runs as the pinned team, so the task view offers only that team.

The token then needs more than reads. A read-only token still browses and previews; hand-off answers `task_write_forbidden`.

* **Vikunja:** give it permission to add and remove task assignees and to add task comments on the project. Vikunja lists these as separate API token permissions.
* **ClickUp:** the account behind the personal token must be able to edit tasks and comment in the List. Unfold adds and removes the assignee with `PUT /task/{id}` (`assignees.add` and `assignees.rem`) and comments with `POST /task/{id}/comment` with `notify_all: false`. It finds the team's tracker user among the List's members (`GET /list/{id}/member`) and then the Workspace's (`GET /team`). Ploeg routes a ClickUp assignee by username or email, so either may be the team's tracker user.

A person can hand a task only to a Ploeg team they may use (`ploeg.userTeams`, or any team in scope for an administrator) that has a tracker user. Viewers see the status but cannot hand off. The server rereads the task first. A done, closed or archived task, or one that changed since it was opened, is refused, and the client reloads it. Handing off again, or taking back a task that is not assigned, changes nothing.

The comment reads *Handed to Ploeg team `silver` by NAME from Unfold.*, posted by the connection's tracker account; on ClickUp it is plain text. Taking back removes the assignee only while Ploeg's Work Items for that team are queued, withdrawn, done or stale; once Ploeg has started, cancel the work from the Ploeg view. Ploeg itself withdraws a queued Work Item when its assignee is removed.

The status beside the task shows which team holds it, Ploeg's Work Items for it with their state, branch, spend and pull request, and why hand-off is unavailable when it is. The demo fixture source is not linked to Ploeg and shows no Ploeg work.

## File Report a problem into a tracker

Report a problem ([RFC-0002](../../../../docs/design/rfc-0002-report-a-problem.md)) files what people report into any registered tracker whose adapter declares issue filing: a Forgejo issue, a Vikunja task or a Jira issue today, with the screenshot, `console.json` and `requests.json` attached. The adapter decides the body format (Markdown on Forgejo, HTML on Vikunja, ADF converted from Markdown on Jira), how files attach, and what Unfold reads back when it follows the report. It uses one of the task sources above:

```json
"reports": { "source": "forgejo-unfold", "project": "webgrip/unfold" }
```

Or give reports a connection of their own, which is not a task source and never appears on the Tasks page. Use this when no task source fits, for example when the repository is one Ploeg dispatches work for, where a task source owned by Unfold is refused at start-up:

```json
"reports": { "provider": "forgejo", "baseUrl": "https://forgejo.example/api/v1", "project": "webgrip/unfold", "tokenEnv": "UNFOLD_REPORTS_FORGEJO_TOKEN" }
```

* `source` names a task source with a token whose adapter files issues (Forgejo, Vikunja or Jira). Leave `reports` out to use the first such source that Unfold owns (`executionOwner: interactive`) and its own project. A source Ploeg dispatches from is never the default, and naming one requires a different `project`, so a report never becomes agent work. Set `reports` to `false` to keep every report in Unfold and file nothing.
* `project` is optional: `owner/repository` on Forgejo, a numeric project ID on Vikunja, or a project key on Jira, when reports belong somewhere other than the source's work.
* If the variable `tokenEnv` names is not set, Unfold starts anyway, logs `reports.token_missing` and keeps reports without filing them.
* The token needs to create issues and upload issue attachments on Forgejo (`write:issue`), create tasks and attachments in the project on Vikunja, or create issues and attachments and add comments in the project on Jira (see [Jira](#jira)).
* Unfold keeps each report before it files it. If the tracker refuses or cannot be reached, the person sees "Saved. Unfold will file it when the tracker answers", and Unfold retries with growing gaps for 24 hours, continuing an issue it already created. The server log line `report.file_failed` gives the tracker's answer.
* Files are deleted 90 days after a report is filed. The report row and its address stay.
* Unfold follows each filed report on the tracker every ten minutes for 180 days (two weeks after it closes, longer while a merged fix waits for a release) and shows the reporter where it stands. On Forgejo the token also needs to read the repository's pull requests and releases (`read:repository`) for *Fixed in* a release. A failed read logs `report.follow_failed` and keeps the last answer.
* People can reply to their filed report from Unfold, and a repeat report joins an open one as a comment. Both are written by the token's account, so the token needs to comment on issues or tasks.
* `acknowledgement` (optional, both forms) is one line of at most 280 characters the success screen shows, for example `"We read every report on weekdays."`. Leave it out rather than promise a response time you do not keep.
* With no tracker configured, and always in the demo, Unfold keeps the report and says so.

## Diagnose a connection

Start at **Settings → Connections** (`#settings/connections`, also linked from the Task connections check on Environment). It reads Ploeg's `GET /api/v1/operator/connections` (Ploeg ADR-0129) and matches it against the task sources here. Each board shows whether assignments reach Ploeg, which Teams can be assigned on it, where its work goes and whether Unfold lists it. Each repository shows whether it is ready for agents, whether its forge has sent Ploeg any pull request event in 30 days, and which boards reach it. A task source that hands work to Ploeg on a board Ploeg does not route is listed first, because a hand-off there assigns the Team and nothing starts. Every problem names its fix. A Ploeg release without the connections read gets a note saying so instead.

| Symptom | Check |
| --- | --- |
| Server rejects a missing credential | The named environment variable is present in the actual server process. Supplying it only to the editor does not configure the server |
| Authorization rejected | Token expiry, provider read permissions, account/project access and the instance's authentication policy |
| Source or task missing | API root versus browser URL, exact repository/project/List scope, home List membership, and issue number versus global provider ID |
| No tasks on a page | Open/incomplete task state, selected page, and whether the provider returned only excluded pull requests |
| Task changed during import | Refresh the preview and approve the new content; don't reuse the previous revision |
| Shared import blocked | Check the explicit source target, singleton API root, configured execution team and current queued/pristine Ploeg item. Unsupported tracker providers remain inspection-only in shared mode |
| Redirect or unexpected content rejected | Configure the final API root directly and inspect the reverse proxy; login HTML is not an API response |
| Description too large | Bound the task's actionable scope in the tracker, or create a smaller task. A list shows it truncated; preview and import refuse it rather than truncate it |
| Jira answers `task_page_expired`, `task_page_missing` or `task_moved` | Jira pages by token, so a page far past the last one read is refused: start from the first page. A moved or renamed issue has a new key: open it from the list again |
| Jira refuses the credentials | A scoped token needs the gateway root `api.atlassian.com/ex/jira/CLOUD-ID/rest/api/3`; a classic `email:token` needs the site root `SITE.atlassian.net/rest/api/3` |
| Not sure whether a source works | **Settings › Connect a tracker › Test connection** reads it the way the Tasks page does, says as whom, and names the code and fix of the first step that fails |
| `task_rate_limited` | The tracker refused because this token asked too often; the message names the seconds until it may ask again. On ClickUp, several people sharing one `tokenEnv` source share its 100 requests a minute; sources read with linked accounts spend each person's own |
| Hand-off refused with `task_write_forbidden` | The tracker token can read but not change the task. Grant it task assignee and comment permissions in Vikunja, or task edit and comment access to the List in ClickUp |
| No team to hand off to | Your account needs Ploeg team access in `ploeg.userTeams`, and the team needs a tracker user in Ploeg's configuration. An older Ploeg does not report tracker users at all |

The tests exercise provider contracts with local HTTP fixtures. They do not demonstrate live authentication against your accounts, verify every self-hosted version, or create external tasks. The [connector source notes](../research/task-connector-sources.md) record the inspected official API contracts and adapter limits. Record the instance version and a real list → preview → import result in [validation](../validation.md) during qualification.

## Proposed extensions

The connection-management proposal includes an administrator wizard, provider authorization where applicable, scope discovery, credential rotation and explicit source-to-repository mappings. The health view is the Connections page above. The broader unattended delivery proposal includes authenticated webhooks and reconciliation through Ploeg, transactional deduplication, one canonical WorkOrder, independent verification and fenced publication. Both clients should remain thin views over those shared contracts.

The [ticket integration design](../design/ticket-integration.md) and [system design](../PRODUCT-DESIGN.md) describe that larger system. The registered adapters are a starting point for it; they do not make arbitrary project-management APIs automatically compatible.
