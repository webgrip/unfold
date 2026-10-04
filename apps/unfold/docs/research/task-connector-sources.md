# Task connector implementation sources

Research checked on 2026-09-09. The v0.2 adapters execute read-only HTTP requests to administrator-registered sources. Automated tests use local HTTP servers with representative provider payloads. No customer account, token, or live private instance was used to qualify these adapters.

| Provider | Official source | Implementation evidence |
| --- | --- | --- |
| Forgejo | [API usage and pagination](https://forgejo.org/docs/latest/user/api/usage/) | API root `/api/v1`; repository issue endpoints; personal access token in `Authorization: token …`; `page` and `limit`, `Link` pagination. |
| GitHub | [REST issue endpoints](https://docs.github.com/en/rest/issues/issues?apiVersion=2022-11-28) | Cloud root `https://api.github.com`, enterprise `/api/v3`; repository issues; Bearer token; version header `2022-11-28`; pull requests identified and excluded through `pull_request`. |
| GitLab | [Issues API](https://docs.gitlab.com/api/issues/) | `/api/v4/projects/{id-or-encoded-path}/issues`; `scope=all`, `state=opened`, `page`, `per_page`; private-token header; native issue IID and canonical project ID. |
| ClickUp | [Get Tasks](https://developer.clickup.com/reference/gettasks), [Get Task](https://developer.clickup.com/reference/gettask) | `/api/v2/list/{list_id}/task`, `/task/{task_id}`; zero-based provider pages with up to 100 tasks; home-list membership; Markdown descriptions requested explicitly. |
| Vikunja | [API documentation](https://vikunja.io/docs/api-documentation/), [official public v1 Swagger specification](https://try.vikunja.io/api/v1/docs.json) | `/api/v1/tasks` with project and completion filters; `/tasks/{id}`; `Authorization: Bearer …`; `project_id` checked on every task; paged results. |

## Configuration decisions

`baseUrl` is the full API root, not the general website URL. Reverse-proxy prefixes are supported. HTTPS is required except for explicit loopback development endpoints. Embedded credentials, query strings, fragments and percent-encoded API-root paths are rejected. Tokens are resolved from a named environment variable through `tokenEnv`; literal tokens in configuration are rejected. Public source summaries omit API roots and tokens.

`project` is `owner/repository` for Forgejo and GitHub, a numeric project ID or namespace path for GitLab, a numeric home-list ID for ClickUp, and a numeric project ID for Vikunja. Every source maps to an administrator-registered code repository; task descriptions cannot supply or change the clone URL. Sources explicitly select `interactive` or `ploeg` execution ownership. The adapter does not claim or assign work in any tracker.

ClickUp uses a personal API token in its raw `Authorization` header. This release has no ClickUp OAuth onboarding or refresh flow. Tasks whose home list differs from the configured list are rejected, including direct native-ID lookups. Tasks-in-multiple-lists discovery is deliberately not enabled. List results request subtasks but do not recursively fetch relations, comments, attachments or custom-field values.

Vikunja targets the supported v1 API. Current official documentation also describes v2 and a future v1 removal; confirm compatibility with the deployed instance. The adapter uses the documented global task collection with a fixed `project_id = N && done = false` filter and independently checks every returned task's project. This avoids assuming the older `/projects/{id}/tasks` collection route, which is absent from the inspected current specification. Task links assume the UI is served at the API's origin and reverse-proxy prefix. A separately hosted Vikunja frontend needs a future explicit frontend-URL option.

GitHub and Forgejo repository paths are normalized to lowercase. Identical provider/API-root/project aliases share a stable task key; GitLab response `project_id` additionally identifies numeric/path aliases. Separate hostnames for one service are not resolved as aliases. Conflicting ownership or repository mappings for identical configured source identities are rejected. Stable identity does not establish a distributed execution lease across Vloer and Ploeg.

## Bounded behavior

Calls are GET-only, have a ten-second total deadline and a two-MiB decoded response limit, refuse redirects, and do not retry automatically. Page navigation is explicit and capped at page 1000. Remote pagination links are used only to determine whether a next page exists; their URLs are never followed. Titles over 500 characters and descriptions over 16,000 characters fail explicitly instead of silently producing incomplete acceptance criteria.

Task revisions hash normalized title, description, state, update timestamp and link. A title or acceptance-criteria edit changes the revision even when the source timestamp is unchanged. This snapshot does not include comments, labels, checklists, assignees, priority or custom fields. Those can affect work outside this release's snapshot contract and are a documented next connector capability.

Open and closed states are normalized; unknown source states remain unknown. Lists expose open tasks only. Individual closed tasks can be read for review, while the import service decides whether they may start work. GitHub and Forgejo pull requests cannot be imported through issue intake.

Tracker text remains untrusted source content. The adapter preserves it as text; it neither renders HTML nor interprets embedded instructions. Fixed public errors exclude remote bodies, headers, tokens and network exception details. These protections do not make arbitrary task text suitable as trusted agent or operator policy.
