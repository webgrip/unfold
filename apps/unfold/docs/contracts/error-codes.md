# Error codes

*Generated from [`src/error-catalogue.ts`](../../src/error-catalogue.ts) by `mise run error-codes`. Do not edit by hand; change the catalogue and regenerate.*

Every error Unfold gives a person carries a stable code. The HTTP API answers `{"error":{"code":"...","message":"..."}}` ([HTTP contract](api.md)), the browser shows the message, and an `unfold-mcp` tool error carries the code in `_meta["dev.unfold/error"].code`. The message names the specifics; this page says what each code means and what to do next. A fault inside Unfold always reaches people as `internal_error`, never as exception text, an address or a stack trace.

Codes Ploeg sends that Unfold does not name here pass through with Ploeg's own message. [`test/error-catalogue.test.ts`](../../test/error-catalogue.test.ts) fails when Unfold raises a code this page does not list.

## Requests

| Code | HTTP | What happened | What to do next |
| --- | --- | --- | --- |
| `internal_error` | 500 | Unfold hit a fault of its own and did not finish the request. | Try again in a minute. If it keeps failing, report a problem from the page and say when it happened. |
| `request_failed` | 400, 401, 403, 404, 409, 422, 429 | Unfold refused the request without naming a more specific reason. | Check what you sent against the API reference at /api/openapi.yaml, then try again. |
| `not_found` | 404 | What the address names does not exist, or it is outside what your account may see. | Check the address or identifier. Reload the list you came from; the item may have been removed. |
| `method` | 405 | The address exists but does not take this HTTP method. | Use a method the message or the API reference at /api/openapi.yaml lists for the address. |
| `forbidden` | 403 | Your account may not do this here. | Ask an administrator for an Access Role that allows it, or ask someone who holds one to do it. |
| `unauthenticated` | 401 | The request carried no valid sign-in. | Sign in to the workbench again, then repeat what you did. |
| `csrf` | 403 | A change arrived without the X-Unfold-Request header that every change must carry. | Reload the page. A script must send X-Unfold-Request: 1 with every change. |
| `origin` | 403 | A change came from another website or from an address Unfold does not know. | Make the change from the Unfold page itself, not from another site or an embedded frame. |
| `content_type` | 415 | The body was sent with a content type this address does not read. | Send the content type the message names, such as application/json. |
| `invalid_json` | 400 | The body is not a JSON object. | Send a JSON object, such as {}. |
| `body_too_large` | 413 | The request body is larger than this address accepts. | Send less at once, or split it into several requests. |
| `invalid_input` | 400 | A field is missing or holds a value Unfold does not accept. | Correct the value the message names and send it again. |
| `invalid_request` | 400 | The request does not have the shape this action needs. | Correct the value the message names and send it again. |
| `invalid_state` | 409 | The thing you acted on is no longer in a state that allows this action. | Reload the page to see where it stands now, then decide again. |
| `rate_limited` | 429 | Too many requests of this kind arrived in a short time. | Wait the time the message names, then try again. |
| `page` | 400 | The page number is outside 1 to 1000. | Choose a page between 1 and 1000. |
| `outcome` | 400 | The outcome filter holds a value Unfold does not know. | Filter by done, refused or failed. |
| `streams` | 429 | Unfold already sends live updates to as many pages as it can. | Close Unfold tabs you no longer watch, then reload this one. |
| `shutting_down` | 503 | The workbench is restarting and refuses new work until it is back. | Wait a minute, reload, and do it again. |
| `insight_batch_too_large` | 413 | A batch of product events is larger than Unfold takes at once. | Send fewer events per batch. |
| `agent_host_disabled` | 404 | This workbench does not serve an agent host, so VS Code cannot connect to it. | Ask an administrator to turn on the agent host, or use Unfold in the browser. |
| `invalid_editor_window` | 400 | The editor did not name its protocol and window. | Update the Unfold extension; it sends the protocol and window id itself. |
| `team_conflict` | 400 | The request names two different Teams in its two Team fields. | Send teamId only. |

## Sign-in and accounts

| Code | HTTP | What happened | What to do next |
| --- | --- | --- | --- |
| `invalid_credentials` | 401 | The name or password is not right. | Type them again. Ask an administrator to reset the password if you forgot it. |
| `local_login_off` | 404 | Signing in with a name and password is turned off on this workbench. | Use the single sign-on button instead. |
| `browser_only` | 403 | This can only be done in Unfold in a browser, not from an editor or a token. | Open the workbench in your browser and do it there. |
| `editor_login_unknown` | 404 | The editor sign-in is unknown or expired. | Start signing in again from your editor. |
| `editor_login_decided` | 409 | Someone already approved or denied this editor sign-in. | Start signing in again from your editor if it is still not signed in. |
| `editor_login_denied` | 403 | The editor sign-in was denied in the browser. | Start signing in again from your editor and approve it this time. |
| `slow_down` | 429 | The editor asked whether its sign-in was approved too often. | Wait; the extension slows down by itself. Update it if this repeats. |
| `oidc_unconfigured` | 404 | Single sign-on is not set up on this workbench. | Sign in with a name and password, or ask an administrator to set up single sign-on. |
| `oidc_busy` | 429 | Too many sign-ins are waiting to finish at once. | Wait a few minutes, then sign in again. |
| `oidc_state` | 400 | The sign-in finished in a different browser than it started in, or took too long. | Start signing in again from this browser. |
| `oidc_issuer` | 400 | The sign-in answer came from another identity provider than the one it started at. | Start signing in again. If it repeats, an administrator must check the identity provider settings. |
| `oidc_code` | 400 | The identity provider sent back a sign-in code Unfold could not use. | Start signing in again. |
| `oidc_not_entitled` | 403 | You signed in, but your account is in none of the groups this workbench admits. | Ask an administrator to add you to a group the workbench admits. |
| `oidc_discovery` | 502 | Unfold could not read the identity provider's settings. | Try again in a minute. If it keeps failing, an administrator must check the identity provider address. |
| `oidc_exchange` | 502 | The identity provider did not finish the sign-in. | Try again in a minute. If it keeps failing, an administrator must check the client id and secret. |
| `oidc_keys` | 502 | Unfold could not read the identity provider's signing keys. | Try again in a minute. If it keeps failing, an administrator must check the identity provider. |
| `oidc_token` | 502 | The identity provider sent an identity token Unfold cannot trust. | Start signing in again. If it repeats, an administrator must check the identity provider settings and the server clock. |
| `oidc_refresh` | 400, 401, 502 | Unfold could not renew your sign-in with the identity provider. | Sign in again. |
| `link_unknown` | 404 | This workbench links no such provider. | Choose a provider from the Linked accounts list. |
| `link_unconfigured` | 409 | This provider has no OAuth application on this workbench. | Paste a personal token instead, or ask an administrator to add the OAuth application. |
| `link_state` | 400 | The link attempt finished in a different browser, or took too long. | Start linking again from this browser. |
| `link_code` | 400 | The provider sent back an authorization code Unfold could not use. | Start linking again. |
| `link_token` | 400 | The pasted token does not look like a token of this provider. | Copy the token again exactly as the provider shows it. |
| `link_busy` | 429 | Too many link attempts are waiting to finish. | Wait a few minutes, then link again. |
| `link_profile` | 502 | The provider did not confirm which account the link belongs to. | Try again in a minute. If it keeps failing, check the token's permissions. |
| `source_unlinked` | 409 | This task connection needs your own tracker account, and you have not linked one. | Link the tracker under Linked accounts, then try again. |

## Sessions

| Code | HTTP | What happened | What to do next |
| --- | --- | --- | --- |
| `already_running` | 409 | The session is already starting or running. | Wait for it, or stop it before starting it again. |
| `already_reviewed` | 409 | Someone already accepted or rejected this session's result. | Reload to read their decision. |
| `session_finished` | 409 | The session has finished and takes no more changes. | Start a new session for further work. |
| `session_stranded` | 409 | The session lost its link to Ploeg and cannot go on by itself. | Follow the steps the message names: reconnect it, or cancel it and start again. |
| `capacity` | 409 | The workbench runs as many sessions at once as it may. | Wait until one finishes, or ask an administrator to raise the limit. |
| `budget` | 400 | The budget is zero, negative or above what this workbench allows. | Choose an amount greater than zero and within the limit the message names. |
| `invalid_budget` | 400 | The budget is outside what this workbench allows. | Choose an amount within the limit the message names. |
| `budget_exhausted` | 409 | The session or attempt spent all the budget it was given. | Add budget if an administrator allows it, or start again with a larger budget. |
| `authority_budget` | 409 | Ploeg holds this session's budget, so the workbench cannot raise it. | Raise the Team's budget in Ploeg, or start again with a larger Size. |
| `pause_required` | 409 | A running session keeps the budget its model key was issued with. | Pause the session, add budget, then resume it; the new key carries the increase. |
| `spend_unresolved` | 409 | Unfold does not yet know what the previous attempt spent, so its budget stays held. | Wait a few minutes for the spend to settle, then try again. |
| `broker_required` | 503 | Paid work needs a credential broker, and none is configured. | Ask an administrator of this workbench to fix its configuration. |
| `authority_required` | 503 | Ploeg manages this session and cannot be reached, so Unfold will not run it alone. | Wait until Ploeg is reachable again, or cancel the session. |
| `new_authorization_required` | 409 | A session Ploeg ran and failed cannot start again. | Start a new session for the same work. |
| `execution_generation` | 409 | Another copy of Unfold took over this session. | Reload the page to see where it stands now, then decide again. |
| `execution_not_running` | 409 | Ploeg no longer runs this session, so it did not take the command. | Reload the page to see where it stands now, then decide again. |
| `execution_scope` | 403 | Your account may not run work for this Team in Ploeg. | Ask an administrator to give you access to the Team. |
| `execution_unconfirmed` | 409, 503 | Ploeg did not confirm the change, so Unfold holds the session where it is. | Wait until Ploeg answers again, reload, and check the session before you continue. |
| `inference_blocked` | 409 | The session's model key was locked when it stopped, so it cannot continue. | Duplicate it as a new session to try again, or cancel it. |
| `inference_unresolved` | 409 | No model key can be recovered for this session, and Unfold will not pay twice. | Wait for the previous attempt to settle, then start a new session. |
| `interrupt_unconfirmed` | 409 | The agent has not confirmed that it stopped its last step. | Wait a moment and try again; the agent confirms when it stops. |
| `input_unresolved` | 409 | The agent finished while a question to you was still open. | Reload the session and answer or dismiss the question. |
| `request_expired` | 409 | The question or permission request no longer waits for an answer. | Reload the session to see what it waits for now. |
| `start_superseded` | 409 | A stop or restart came in before this start went through, so nothing started. | Start it again if you still want it to run. |
| `stopping` | 409 | The previous attempt is still stopping. | Wait until it has stopped, then try again. |
| `unsupported` | 409 | This kind of workspace cannot answer questions while it runs. | Use a workspace placement that takes questions, or let the session finish. |
| `runtime_response_failed` | 502 | The workspace did not take your answer. | Send the answer again. If it keeps failing, stop and restart the session. |
| `candidate_unavailable` | 409 | Unfold could not take the change out of the workspace. | Keep the workspace and try again, or follow the recovery steps the session shows. |
| `candidate_format` | 400 | The export format is not one Unfold offers. | Choose bundle, patch, manifest, attestation or trace. |
| `not_capturable` | 409 | Only a session Ploeg runs can be captured this way. | Use Accept on the session page instead. |
| `not_deliverable` | 409 | Only a session Ploeg runs can be delivered this way. | Use Accept on the session page instead. |
| `review_incomplete` | 409 | The reviewer did not approve the change. | Read the review and decide the next step yourself. |
| `note_required` | 400 | A rejection needs a reason. | Say why you reject the result, so the next attempt can use it. |
| `objective_too_thin` | 400 | The brief is too short to work from. | Say what the Team should do and how you will know it is done. |
| `invalid_answer` | 400 | The answer is not one the question offers. | Choose once, always or reject, or answer each question with text. |
| `answers` | 400 | The answers to the agent's questions are not in the expected form. | Send at most 20 lists of texts, each text at most 4000 characters. |
| `permission` | 400 | The answer to a permission request is not once, always or reject. | Answer with once, always or reject. |
| `invalid_approval` | 400 | The approval mode is not manual or auto. | Choose manual or auto. |
| `approval_requires_isolation` | 400 | Automatic approval needs an isolated workspace. | Choose a container or pod placement, or approve by hand. |
| `invalid_decision` | 400 | The decision is not accepted or rejected. | Choose accepted or rejected. |
| `invalid_supervision` | 400 | The supervision mode is not human or background. | Choose human or background. |
| `invalid_model` | 400 | The model is not configured on this workbench. | Choose a model from the list. |
| `invalid_placement` | 400 | The workspace placement is not enabled on this workbench. | Choose a placement from the list. |
| `placement` | 400 | The workspace placement is not enabled on this workbench. | Choose a placement from the list. |
| `invalid_runtime` | 400 | The runtime does not match how this workbench is deployed. | Choose a runtime from the list. |
| `invalid_configuration` | 400 | The repository, Team or runtime is not configured here. | Choose each from the lists. |
| `unknown_profile` | 400 | The repository, Team or runtime is not configured here. | Choose each from the lists. |
| `invalid_team` | 400 | The Team's Roles are not set up the way a session needs. | Give the Team reviewers, optionally after one writer, each with its own id. |
| `invalid_tracker` | 400 | The tracker link does not match the repository's tracker. | Use the tracker link the repository is configured with. |
| `tracker_url` | 400 | The tracker link is not a plain web address. | Use an http or https link without a name or password in it. |
| `policy_provider` | 409 | The model is served by a provider this workbench does not allow. | Choose another model, or ask an administrator to allow the provider. |
| `repository_unavailable` | 409 | The repository is no longer configured on this workbench. | Ask an administrator to configure it again, or choose another repository. |
| `ploeg_owned` | 403 | Ploeg runs the work for this repository or task connection, so it cannot start here. | Assign the task to the Team in its tracker instead. |

## Ploeg and Work Items

| Code | HTTP | What happened | What to do next |
| --- | --- | --- | --- |
| `ploeg_unconfigured` | 503 | This workbench is not connected to Ploeg. | Ask an administrator of this workbench to fix its configuration. |
| `ploeg_unavailable` | 503 | Ploeg could not be reached or sent incomplete data, so nothing was changed. | Try again in a minute. |
| `ploeg_credential` | 503 | Unfold's credential for Ploeg is missing. | Ask an administrator of this workbench to fix its configuration. |
| `ploeg_credential_changed` | 503 | Unfold's credential for Ploeg changed while it read the data. | Reload to read it with the current credential. |
| `ploeg_scope` | 403 | Your account has access to no Team in Ploeg. | Ask an administrator to give you access to a Team. |
| `ploeg_actor` | 400, 403 | Ploeg cannot record your account as the person who did this. | Ask an administrator to check your account's identity in Ploeg. |
| `ploeg_id` | 400 | The Work Item, Run or Shift id is not one Ploeg uses. | Use the id as Unfold shows it, such as 42. |
| `ploeg_not_found` | 404 | Ploeg has no such Work Item, Run or Team in the Teams you can see. | Check the id, or ask for access to the Team that holds it. |
| `ploeg_filter` | 400 | A filter holds a value Ploeg does not take. | Choose a value the message names. |
| `ploeg_response` | 502 | Ploeg answered in a form this Unfold cannot read. | An administrator should check that Unfold and Ploeg are versions that work together. |
| `ploeg_response_size` | 502 | Ploeg sent more data than Unfold reads at once. | Narrow the view with a filter, or ask an administrator to check Ploeg. |
| `ploeg_facts_invalid` | 502 | Ploeg sent delivery facts this Unfold cannot read. | An administrator should check that Unfold and Ploeg are versions that work together. |
| `ploeg_transcript_invalid` | 502 | Ploeg sent a Run transcript this Unfold cannot read. | An administrator should check that Unfold and Ploeg are versions that work together. |
| `ploeg_unsupported` | 501 | The connected Ploeg version does not offer this yet. | Ask an administrator to update Ploeg. |
| `ploeg_admission_unsupported` | 501 | The connected Ploeg version cannot take Work Items from Unfold. | Ask an administrator to update Ploeg. |
| `ploeg_notes_unsupported` | 501 | The connected Ploeg version cannot take notes for running work. | Ask an administrator to update Ploeg. |
| `ploeg_answers_unsupported` | 501 | The connected Ploeg version cannot store answers to questions. | Ask an administrator to update Ploeg. |
| `ploeg_demo` | 409 | The deterministic demo runs no agents, so this action has nothing to act on. | Connect a real Ploeg to do this. |
| `ploeg_command` | 400 | The command id is missing or malformed. | Send the action again from the Unfold page; it adds the command id. |
| `ploeg_decision` | 400 | A rejection needs a reason of at most 4096 characters. | Write a shorter reason, or add one. |
| `ploeg_decision_conflict` | 409 | The Work Item is not in a state this decision applies to. | Reload the page to see where it stands now, then decide again. |
| `ploeg_decision_forbidden` | 403 | Unfold's credential for Ploeg may not admit this kind of work. | Ask an administrator to give Unfold's Ploeg credential execute permission. |
| `ploeg_cancel_body` | 400 | The connected Ploeg version takes no reason with a cancel. | Cancel without a reason, or ask an administrator to update Ploeg. |
| `ploeg_requeue` | 400 | The restart does not fit what Ploeg allows. | Restart only a Work Item that needs you or went stale, with the values the message names. |
| `ploeg_note` | 400 | Ploeg refused the note. | Write a note of 1 to 4096 characters. |
| `ploeg_answer` | 400 | Ploeg refused the answer. | Write an answer of 1 to 4096 characters. |
| `ploeg_question` | 400 | The question id is not one Ploeg uses. | Answer the question from the Work Item page. |
| `ploeg_question_not_found` | 404 | The Work Item has no open question with this id. | Reload the Work Item; the question may already be answered. |
| `ploeg_forge_login` | 403 | Your forge login is not linked, so Unfold cannot tell which Run Cards are yours. | Link your forge account under Linked accounts. |
| `team_forbidden` | 403 | You chose a Team you have no access to. | Choose one of your Teams. |
| `team_not_found` | 404 | There is no such Team among your Teams. | Choose a Team from the list. |
| `context_empty` | 400 | The context file is empty. | Choose a file with content. |
| `context_name` | 400 | The context file name is not allowed. | Name the file with 1 to 200 characters, without folders or control characters. |
| `context_note` | 400 | The note on the context file is longer than 500 characters. | Shorten the note. |
| `context_too_large` | 413 | The context file is larger than 20 MiB. | Upload a smaller file. |
| `transcript_cursor` | 400 | The transcript cursor is not one Unfold gave out. | Reload the transcript from the start. |
| `comment_invalid` | 400 | The comment request names no Work Item or comment key. | Send it again from the Work Item page. |
| `judgement_not_found` | 404 | The Run has no judgement with this id. | Reload the Run health panel. |
| `tripwire_hit_not_found` | 404 | The Work Item has no tripwire hit with this id. | Reload the Work Item. |
| `tripwire_verdict` | 400 | The verdict on the tripwire hit is not right or wrong. | Say right or wrong. |
| `run_logs_alias` | 422 | Unfold cannot search the logs of this Run. | Read the Run's logs in your log store directly. |
| `run_logs_cursor` | 400 | The log cursor is not one Unfold gave out. | Reload the logs from the start. |
| `run_logs_too_large` | 502 | The log store sent more than 8 MiB for this Run. | Narrow the time range, or read the logs in your log store. |
| `run_logs_unavailable` | 502, 503 | The log store could not be reached. | Try again in a minute. If it keeps failing, an administrator must check the log store connection. |
| `cards_facts_unavailable` | 503 | Ploeg does not supply the delivery facts Run Cards need. | Ask an administrator to update Ploeg or connect its delivery facts. |
| `facts_unavailable` | 503 | Ploeg does not supply delivery facts, so Unfold cannot tell which commit is meant. | Connect a Ploeg that serves delivery facts; the deterministic demo has none. |
| `invalid_admission` | 400 | Ploeg refused the new Work Item. | Give it a title of at most 200 characters and a brief. |
| `budget_above_limit` | 400, 409 | The budget is above what Unfold may give a Work Item. | Choose a smaller Size or budget. |
| `unknown_target` | 404, 409 | Ploeg has no registered repository with that key. | Choose a repository from Connections. |
| `target_not_ready` | 409 | The repository is registered but not ready. | Open Connections to see why and fix it. |
| `team_not_dispatched` | 409 | The Team has no Plan, so Ploeg cannot run work for it. | Ask an administrator to give the Team a Plan in Ploeg. |
| `request_conflict` | 409 | Ploeg already admitted a different Work Item under this request. | Send the form again. |
| `dispatch_unavailable` | 503 | Ploeg's dispatch is off, so it takes no new work. | Try again later, or ask an administrator to turn dispatch on. |
| `pool_above_limit` | 409 | The budget for the restart is above the Team's limit. | Raise the Team's budget, then try again. |
| `not_requeueable` | 409 | Ploeg restarts only a Work Item that needs you or went stale and has no open Shift. | Reload the page to see where it stands now, then decide again. |
| `state_changed` | 409 | The Work Item changed since you looked. | Reload the page to see where it stands now, then decide again. |
| `operator_owned` | 409 | A workbench session drives this Work Item. | Act on that session instead. |
| `command_conflict` | 409 | Ploeg already took a different command under this id. | Reload the page to see where it stands now, then decide again. |
| `question_unanswered` | 409 | Another question of the same Round still waits for an answer. | Answer it too, then resume. |
| `nothing_to_resume` | 409 | Ploeg has no Round to resume for this Work Item. | Start it over instead. |
| `shift_changed` | 409 | Ploeg started a new attempt since you looked, so nothing was changed. | Look again and act on the new attempt if you still want to. |
| `work_item_terminal` | 409 | The Work Item is no longer running, so the note was not saved. | Reload the page to see where it stands now, then decide again. |
| `already_answered` | 409 | Someone already answered this question. | Reload to read their answer. |
| `already_claimed` | 409 | The Run was already started. | Open the Work Item to follow it. |
| `not_your_run` | 403, 409 | This Run waits for another person. | Only the person it acts for can start it. |
| `person_unknown` | 409 | Ploeg does not know which person this Run acts for. | An administrator must map the tracker user to a person. |
| `no_client_run` | 404, 409 | No Run of this Work Item waits for your Claude Code. | Open the Work Item to see what it waits for. |
| `no_target` | 409 | The Work Item has no repository yet. | Give it a repository in its tracker, then start it. |
| `team_at_capacity` | 409 | The Team already runs as many Runs as it may. | Try again when one finishes. |
| `snooze_key` | 400 | The snooze names neither a Work Item nor a task. | Snooze from the Now page; it names the item for you. |
| `snooze_kind` | 400 | The snooze kind is not snooze or dismiss. | Choose snooze or dismiss. |
| `snooze_until` | 400 | The snooze length is not 1d, 1w or change. | Choose 1d, 1w or change. |
| `snooze_fingerprint` | 400 | The snooze fingerprint is empty or longer than 200 characters. | Snooze from the Now page; it sends the fingerprint for you. |
| `snooze_dismiss` | 400 | Only a task Ploeg could not start can be dismissed. | Snooze it instead. |

## Take-over and hand-off

| Code | HTTP | What happened | What to do next |
| --- | --- | --- | --- |
| `nothing_running` | 409 | Nothing of this Work Item runs now, so there is nothing to take over. | Reload the page to see where it stands now, then decide again. |
| `run_client_carried` | 409 | This Run already runs in its person's own Claude Code. | Ask that person to stop it. |
| `yield_unsupported` | 409 | The Run's harness cannot stop at a safe point. | Cancel the Work Item and start it again instead. |
| `take_over_pending` | 409 | Someone already took this Work Item over. | Reload to see who holds it. |
| `person_forbidden` | 403 | This Work Item acts for another person. | Only they, or an administrator acting for them, can take it over. |
| `taken_over_by_another` | 409 | Another person took this Work Item over. | Only they, or an administrator acting for them, can hand it back or restart it. |
| `nothing_to_hand_back` | 409 | Nobody holds this Work Item after a take-over. | Reload the page to see where it stands now, then decide again. |
| `ploeg_take_over` | 400 | The take-over named no attempt. | Take it over again from the Work Item page. |
| `ploeg_take_over_unsupported` | 501 | The connected Ploeg version cannot hand a running Run to a person. | Ask an administrator to update Ploeg. |
| `ploeg_claim_unsupported` | 501 | The connected Ploeg version cannot hand a Run to your own Claude Code. | Ask an administrator to update Ploeg. |
| `claim_not_found` | 404 | Unfold holds no claim of yours for this Run. | Start it again with /unfold:start. |
| `claude_session_conflict` | 409 | Ploeg already recorded another session for this Run. | Continue in that session, or start the Run again. |
| `claude_session_id` | 400 | The session id is not one Claude Code printed. | Copy the session_… or cse_… id Claude Code printed. |
| `claude_session_refused` | 502, 503 | Ploeg refused to record the session. | Try again in a minute. If it keeps failing, an administrator must check Unfold's Ploeg credential. |
| `run_id` | 400 | The request names no Run. | Name the Run you claimed. |
| `run_not_running` | 409 | The Run stopped, so its session cannot be recorded. | Start the Run again. |
| `start_input` | 400 | A field of the start request is missing or too long. | Correct the value the message names and send it again. |
| `digest_window` | 400 | The digest window is not 7d or 30d. | Use window=7d or window=30d. |
| `work_item_id` | 400 | The Work Item id is not a whole number. | Use the id as Unfold shows it, such as 42. |
| `handoff_not_linked` | 409 | This session is not linked to that Work Item. | Link it first, then hand it off. |
| `handoff_unavailable` | 409 | This session cannot be handed off now. | Follow the reason the message names. |

## Asks and chat

| Code | HTTP | What happened | What to do next |
| --- | --- | --- | --- |
| `ask_question` | 400 | The question is empty or too long. | Type a question within the length the message names. |
| `ask_request` | 400 | The Ask chose both to ask a model and to read only the record. | Choose askModel or recordOnly, not both. |
| `ask_needs_model` | 409 | The record does not answer the question, and only a model could. | Ask again and allow a model; it spends from the Ask Allowance. |
| `ask_unavailable` | 503 | Asking needs a connected Ploeg and model gateway, and one of them is not available. | Try again in a minute, or ask an administrator to configure them. |
| `ask_unconfigured` | 409 | Ploeg has no Ask model for this Team. | Ask an administrator to set one in Ploeg. |
| `ask_replayed` | 409 | Ploeg already issued a key for this Ask. | Ask again. |
| `chat_message` | 400 | Ploeg refused the chat message. | Keep it under 4,000 characters. |
| `chat_unconfigured` | 409 | Ploeg has no chat model for this Team. | Ask an administrator to set one in Ploeg. |
| `chat_conflict` | 409 | Ploeg already holds a different message under this chat id. | Send it again as a new message. |
| `chat_replayed` | 409 | Ploeg already issued a key for this chat message. | Send it again as a new message. |
| `chat_unavailable` | 503 | Ploeg's model gateway is not available, so the message was not sent. | Try again in a minute. |
| `chat_block_unconfirmed` | 503 | Ploeg could not confirm that the message's model key is blocked. | Try again in a minute before you send more. |

## Tasks and trackers

| Code | HTTP | What happened | What to do next |
| --- | --- | --- | --- |
| `source_not_found` | 404 | There is no such task connection. | Choose a connection from the Tasks page. |
| `source_unavailable` | 409 | The task connection is no longer configured for this repository. | Ask an administrator to configure it again. |
| `source_owner_unavailable` | 403 | The person who imported the task no longer has tracker access. | Import the task again under your own linked account. |
| `task_not_found` | 404 | The tracker has no such task, or the workbench token cannot see it. | Check the task id, or give the token access to the project. |
| `task_id_invalid` | 400 | The task id is not in the tracker's own form. | Use the tracker's own task id or issue number. |
| `task_page_invalid` | 400 | The task page is outside 1 to 1000. | Choose a page between 1 and 1000. |
| `task_outside_source` | 404 | The task is outside the project or list this connection reads. | Choose a task from the configured project. |
| `task_is_pull_request` | 422 | The number names a pull request, not an issue. | Choose an issue. |
| `task_changed` | 409 | The task changed after you opened it. | Reload the task and review the current version. |
| `task_closed` | 409 | The task is closed. | Reopen it in the tracker, or choose an open task. |
| `task_in_use` | 409 | A session already works on this task. | Open that session, or finish it first. |
| `tracked_task` | 409 | A task from a tracker runs again only after a fresh import. | Import the task again from its tracker. |
| `tracked_execution_binding` | 409 | The task's link to Ploeg is out of date. | Reload the task before importing or starting it. |
| `task_binding_changed` | 409 | The task or its Ploeg Work Item changed after you looked. | Reload the task and review it before you start. |
| `task_binding_conflict` | 409 | The Ploeg Work Item for this task changed, is taken, or already ran. | Open the Work Item before you start a new session. |
| `task_binding_missing` | 409 | Ploeg has no Work Item for this task in this connection's scope. | Check the task's assignment in the tracker. |
| `task_binding_unavailable` | 503 | Ploeg could not confirm the task's Work Item. | Reload, then try again. |
| `task_binding_unconfigured` | 409 | This task connection has no registered Ploeg tracker target. | Ask an administrator of this workbench to fix its configuration. |
| `handoff_active` | 409 | The task is already handed to a Team. | Take it back from that Team first, or follow its work. |
| `handoff_started` | 409 | Ploeg already started on the task. | Cancel it from the Work Item page instead. |
| `handoff_team` | 404 | You cannot hand the task to that Team. | Choose a Team the Tasks page offers. |
| `handoff_unsupported` | 422 | This tracker does not support handing tasks to Ploeg. | Use a tracker the message names. |
| `handoff_unverified` | 503 | Unfold could not check with Ploeg whether the task is already handed off. | Try again in a minute. |
| `handoff_assignee_unknown` | 502 | The tracker has no user the Team can be assigned as. | An administrator must check the Team's tracker user in Ploeg. |
| `task_source_unknown` | 404 | No task connection holds this task. | Open the task from the Tasks page. |
| `lookup_unsupported` | 400 | Unfold cannot look up tasks of this tracker. | Use a tracker the message names. |
| `task_credentials_rejected` | 502 | The tracker refused the workbench's token. | An administrator must renew the token or give it the permissions the message names. |
| `task_write_forbidden` | 502 | The workbench's tracker token may not change this task. | An administrator must give the token the permissions the message names. |
| `task_write_conflict` | 409 | The tracker refused the change because the task changed meanwhile. | Reload the task and try again. |
| `task_rate_limited` | 503 | The tracker is limiting how often Unfold may ask. | Wait a minute and try again. |
| `task_timeout` | 504 | The tracker did not answer in time. | Try again in a minute. |
| `task_unreachable` | 502 | The tracker could not be reached. | Try again in a minute. If it keeps failing, an administrator must check its address. |
| `task_redirect_refused` | 502 | The tracker redirected Unfold elsewhere, which Unfold refuses. | An administrator must update the tracker's API address. |
| `task_response_invalid` | 502 | The tracker answered in a form Unfold cannot read. | Try again. If it keeps failing, an administrator must check the tracker's API address. |
| `task_response_too_large` | 502 | The tracker sent more than Unfold reads at once. | Shorten the task, or choose another one. |
| `task_sensitive_response` | 502 | The tracker put a credential in a task link, so Unfold refused to import it. | Remove the credential from the task in the tracker. |
| `task_service_failed` | 502 | The tracker failed to finish the request. | Try again in a minute. If it keeps failing, report a problem from the page and say when it happened. |

## Linked Sessions

| Code | HTTP | What happened | What to do next |
| --- | --- | --- | --- |
| `linked_session_id` | 400 | The session id is not a harness session id. | Send the id the harness printed: 8 to 128 letters, digits, - or _. |
| `linked_event` | 400 | The session event is not one Unfold knows. | Send an event the message lists. |
| `linked_harness` | 400, 409 | The harness is unknown, or another harness already reported this session. | Report the session with the harness that runs it. |
| `linked_commit` | 400 | The commit report has no full commit id. | Send commit.sha as the full commit id. |
| `linked_work_items_full` | 409 | The session is linked to as many Work Items as it may be. | Unlink one before linking another. |
| `linked_inbox_full` | 409 | The session has not collected the messages already waiting for it. | Let the session collect its messages, then send more. |
| `linked_message` | 400 | The message is not text or is too long. | Send text within the length the message names. |
| `agent_trace_conflict` | 409 | Another session already recorded an Agent Trace with this id. | Send the record with a new id. |
| `agent_trace_full` | 409 | The session keeps as many Agent Trace records as it may. | Start a new session for further work. |
| `agent_trace_revision` | 400 | The Agent Trace names no full commit id. | Name the commit in vcs.revision as a full commit id. |
| `agent_trace_invalid` | 400 | The Agent Trace record is not valid. | Fix the field the message names and send it again. |
| `conversation_busy` | 429 | The session already has as many conversation reads waiting as it takes. | Wait for those to finish. |
| `confirmation_required` | 403 | Answering a prompt from an editor, agent or chat needs the person's confirmation. | Confirm the answer when your client asks, or answer in the browser. |
| `permission_decision` | 400 | The answer to the prompt is not allow or deny. | Answer allow or deny. |
| `permission_reason` | 400 | Only a denial carries a reason. | Leave the reason out when you allow. |
| `permission_tool` | 400 | The tool name is not valid. | Name the tool with 1 to 80 letters, digits, _ . : or -. |
| `permission_closed` | 409 | The prompt was already answered or went away. | Nothing more to do here. |
| `permission_expired` | 410 | The prompt no longer waits for an answer from Unfold. | Answer it in your terminal. |
| `permission_requests_full` | 409 | The session has as many prompts waiting as it may. | Answer the waiting prompts first. |
| `remote_approval_off` | 409 | The session did not turn on remote approval. | Start it with UNFOLD_REMOTE_APPROVAL=1. |
| `remote_approval_editor` | 403 | Only the plugin reports a permission prompt. | Report prompts with the plugin's editor credential. |
| `remote_approval_same_credential` | 403 | The credential that reported the prompt cannot also answer it. | Answer in the browser, or give unfold-mcp its own credential. |

## Client Sign-off

| Code | HTTP | What happened | What to do next |
| --- | --- | --- | --- |
| `client_sign_off_off` | 404 | Client Sign-off is not turned on for this Team. | Ask an administrator to turn it on. |
| `no_open_pull_request` | 409 | The Work Item has no open pull request to sign off. | Wait until the Team opens one. |
| `no_current_sign_off` | 409 | There is no current Client Sign-off to withdraw. | Nothing more to do here. |
| `head_moved` | 409 | The pull request changed after you looked. | Look at the new version and answer again. |
| `head_unknown` | 409 | Ploeg has not reported the pull request's latest commit yet. | Look again in a minute. |
| `sign_off_answer` | 400 | The answer is not looks_good or needs_changes. | Answer looks_good or needs_changes. |
| `sign_off_head` | 400 | The answer names no commit. | Name the commit you looked at. |
| `sign_off_note` | 400 | The note is too long. | Shorten it to the length the message names. |
| `sign_off_note_required` | 400 | Needs changes takes a note. | Say what should change. |
| `sign_off_globs` | 400 | The path list is too long or not a list. | Give at most the number of paths the message names. |
| `sign_off_repository` | 400 | The repository is not named as owner/name. | Name it as owner/name. |

## Run Cards

| Code | HTTP | What happened | What to do next |
| --- | --- | --- | --- |
| `card_id` | 400 | The Work Item id is not valid. | Use the id as Unfold shows it, such as 42. |
| `card_not_found` | 404 | The card is not in your Teams. | Choose a card from your collection. |
| `card_copy` | 403 | Only someone who holds a copy of the card can decorate it. | Decorate a card you hold. |
| `card_logins` | 400 | The login list is not valid. | List up to 10 logins, each one word of letters, digits and . _ @ + : -. |
| `card_world` | 400 | The card world holds a value Unfold does not accept. | Correct the value the message names and send it again. |
| `quarter` | 400 | The quarter is not valid or has not started. | Choose a quarter such as 2026-Q4 that has started. |
| `pack_not_found` | 404 | There is no such pack for you. | Choose a pack from your collection. |
| `pack_filling` | 409 | The pack is still filling. | Open it when its period ends. |
| `pack_opened` | 409 | You opened this pack already. | Look at its cards in your collection. |
| `pack_order` | 409 | Packs open in order. | Open your older packs first. |
| `crack_limit` | 409 | A bug cracks at most three cards. | Treat a bug that reaches more cards as a systemic bug. |
| `crack_crack_limit` | 409 | A bug cracks at most three cards. | Treat a bug that reaches more cards as a systemic bug. |
| `already_attributed` | 409 | This card is already attributed to this bug. | Nothing more to do here. |
| `crack_already_attributed` | 409 | This card is already attributed to this bug. | Nothing more to do here. |
| `not_merged` | 409 | The card has no merged play to attribute the bug to. | Choose a card whose play merged. |
| `crack_not_merged` | 409 | The card has no merged play to attribute the bug to. | Choose a card whose play merged. |
| `merged_after_bug` | 409 | The play merged after the bug was raised, so it cannot have caused it. | Choose a play that merged earlier. |
| `crack_merged_after_bug` | 409 | The play merged after the bug was raised, so it cannot have caused it. | Choose a play that merged earlier. |
| `dispute_closed` | 409 | The five working days to dispute this crack have passed. | Nothing more can be done about it. |
| `crack_dispute_closed` | 409 | The five working days to dispute this crack have passed. | Nothing more can be done about it. |
| `concealment_unproven` | 409 | Concealed needs the card's Steward to have merged the bug's fix. | Choose another severity. |
| `crack_concealment_unproven` | 409 | Concealed needs the card's Steward to have merged the bug's fix. | Choose another severity. |
| `forbidden_actor` | 403 | This step on the crack is not yours to take. | Ask the person the message names to take it. |
| `crack_forbidden_actor` | 403 | This step on the crack is not yours to take. | Ask the person the message names to take it. |
| `crack_invalid_request` | 400 | The attribution request is not valid. | Correct the value the message names and send it again. |
| `crack_invalid_state` | 409 | The attribution changed state. | Reload the page to see where it stands now, then decide again. |

## Card themes and art

| Code | HTTP | What happened | What to do next |
| --- | --- | --- | --- |
| `theme_invalid` | 400 | The theme does not follow the theme format. | Correct the value the message names and send it again. |
| `theme_managed` | 409 | The theme comes from the mounted themes folder. | Change its file in that folder instead. |
| `theme_changed` | 409 | Someone saved the theme after you opened it, or deleted it. | Reload the theme and make your change again. |
| `asset_rejected` | 400 | The file is not one a theme can use. | Use a file of the kind and size the message names. |
| `asset_too_large` | 413 | The file is larger than a theme asset may be. | Use a smaller file. |
| `asset_purpose` | 409 | The same file was already uploaded for another purpose. | Upload a separate file for this purpose. |
| `asset_quota` | 507 | Theme assets would take more room than their quota. | Delete unused assets, or ask an administrator to raise cardThemes.assetQuotaMb. |
| `svg_rejected` | 400 | The SVG holds something a set symbol may not. | Remove what the message names and upload it again. |
| `shader_rejected` | 400 | The shader does not compile or breaks a shader rule. | Fix what the message names and upload it again. |
| `art_unconfigured` | 409, 503 | Art generation is not set up on this workbench. | Ask an administrator of this workbench to fix its configuration. |
| `art_master_key` | 503 | The art generation key is the gateway's master key, which Unfold refuses to use. | An administrator must give Unfold its own low-budget key. |
| `art_gateway` | 502 | The art model did not answer, or answered in a form Unfold cannot read. | Try again in a minute. If it keeps failing, report a problem from the page and say when it happened. |

## Reports

| Code | HTTP | What happened | What to do next |
| --- | --- | --- | --- |
| `report_invalid` | 400 | The report could not be read. | Send it again from Report a problem. |
| `report_kind_invalid` | 422 | The report kind is not broken, confusing or idea. | Choose broken, confusing or idea. |
| `report_impact_invalid` | 422 | Only a broken report has an impact. | Choose blocks, slows or minor for a broken report. |
| `report_field_missing` | 422 | A required part of the report is empty. | Fill in what the message names. |
| `report_field_too_long` | 422 | A part of the report is too long. | Shorten it to the length the message names. |
| `report_context_invalid` | 422 | The page context is too large or not JSON. | Send the report again from the page. |
| `report_attachment_invalid` | 422 | An attachment is not valid JSON. | Send the report again without that attachment. |
| `report_attachment_unknown` | 422 | The report carries a file Unfold does not keep. | Attach only the screenshot, console and requests. |
| `report_screenshot_invalid` | 422 | The screenshot is not a PNG of at most 6 MB. | Attach a smaller PNG. |
| `report_too_large` | 413 | The report is larger than Unfold keeps. | Leave out the screenshot or shorten the text. |
| `report_too_many_files` | 413 | The report carries more files than Unfold keeps. | Attach fewer files. |
| `report_duplicate_invalid` | 422 | The report it repeats is not a filed report. | Choose a filed report from the list. |
| `report_unknown` | 404 | There is no such report of yours. | Open your reports from Report a problem. |
| `report_not_filed` | 409 | The report is not filed yet. | Add to it once it is filed. |
| `report_provider_unsupported` | 422 | Report a problem cannot file into this tracker. | An administrator must choose a tracker the message names. |
| `report_target_missing` | 404 | The tracker cannot find the project reports go to. | An administrator must check the reports project. |
| `report_write_forbidden` | 502 | The tracker refused the workbench's token. | An administrator must give the token permission to create issues and attachments. |
| `report_tracker_failed` | 502 | The tracker did not file the report. | Nothing is lost: Unfold keeps the report and files it when the tracker answers. |

## Billing

| Code | HTTP | What happened | What to do next |
| --- | --- | --- | --- |
| `billing_unconfigured` | 409 | Billing is not configured. | Add a billing block to the configuration. |
| `billing_demo` | 409 | The demo has no billing. | Use a real workbench for billing. |
| `billing_format` | 400 | The export format is not csv or ubl. | Choose csv or ubl. |
| `billing_owner` | 400, 404 | The Tenant or Client is unknown or not named by id. | Name the Tenant and Client by their ids. |
| `billing_mapping` | 400 | The price mapping is not valid. | Correct the value the message names and send it again. |
| `billing_price` | 400 | The price is not valid. | Correct the value the message names and send it again. |
| `billing_priced` | 409 | This line already has its price. | Nothing more to do here. |
| `billing_line_not_found` | 404 | There is no such billing line. | Choose a line from the billing page. |
| `billing_not_failed` | 409 | Only a failed line can be sent again. | Reload the page to see where it stands now, then decide again. |
| `billing_not_uncertain` | 409 | Only a line whose outcome is uncertain can be marked as found. | Reload the page to see where it stands now, then decide again. |
| `billing_check_first` | 409 | The billing tool may already have this line. | Check the tool first, then confirm that the line is missing. |
| `billing_not_reversible` | 409 | Only an accepted Work Item's line can be reversed. | Choose an accepted line. |
| `billing_reversed` | 409 | This line is already reversed. | Nothing more to do here. |
| `billing_reversal_late` | 409 | A Reversal must come within the days after Acceptance the message names. | Raise a Dispute instead. |
| `billing_reason` | 400 | The Reversal names no defect or no valid revert link. | Say which defect the revert fixed and link the revert. |

## Notifications

| Code | HTTP | What happened | What to do next |
| --- | --- | --- | --- |
| `notifications_off` | 404 | Notifications are not switched on for you. | Ask an administrator to switch them on. |
| `notify_preferences` | 400 | The preferences are not in the expected form. | Send channels, triggers and quietHours. |
| `notify_channel` | 400 | The channel is not configured here. | Choose a channel the message lists. |
| `notify_trigger` | 400 | The trigger is not one Unfold offers. | Choose triggers from the listed ones. |
| `notify_quiet_hours` | 400 | Quiet hours are not two times of day. | Give them as HH:MM to HH:MM. |
| `notify_time_zone` | 400 | The time zone is not one Unfold knows. | Choose a time zone such as Europe/Amsterdam. |
| `notify_subscription` | 400 | The push subscription has no usable address. | Allow notifications in the browser again. |
| `notify_unavailable` | 409 | This channel is not configured on the server. | Ask an administrator of this workbench to fix its configuration. |
| `slack_email` | 400 | The Slack email address is missing. | Give the email address of your Slack account. |
| `slack_user_not_found` | 404 | No one in the Slack workspace has that email address. | Use the address of your Slack account. |
| `slack_user_linked` | 409 | That Slack account is linked to someone else in Unfold. | Ask them to unlink it, or use your own account. |
| `slack_workspace` | 403 | That Slack account is in another workspace. | Use your account in the workspace Unfold posts to. |
| `slack_link_wait` | 429 | A link request was sent less than a minute ago. | Confirm it in Slack, or wait a minute. |
| `slack_failed` | 409 | Slack refused the request. | Try again in a minute. If it keeps failing, report a problem from the page and say when it happened. |
| `slack_payload` | 400 | The Slack interaction carried no payload. | Nothing to do; Slack sends it again. |
| `slack_signature` | 401 | The Slack request is not signed with the configured secret, or is too old. | An administrator must check the Slack signing secret and the server clock. |
| `teams_webhook` | 400 | The Microsoft Teams webhook address is not valid. | Paste the workflow webhook URL from Microsoft Teams. |

## Webhooks

| Code | HTTP | What happened | What to do next |
| --- | --- | --- | --- |
| `webhooks_off` | 409 | Webhooks are off for this Tenant. | An administrator turns them on with the events.webhooks flag. |
| `webhook_url` | 400 | The receiver's URL is missing, too long or not a full https URL. | Give the receiver's full https URL without credentials or a #fragment. |
| `webhook_url_scheme` | 400 | The receiver's URL is not https. | Use an https URL. |
| `webhook_target_private` | 400 | The receiver is on a private address. | Use a public receiver, or ask an administrator to allow the address. |
| `webhook_target_unresolved` | 400 | The receiver's host name does not resolve. | Check the host name. |
| `webhook_types` | 400 | The event types are missing or too many. | Choose between 1 and 50 event types. |
| `webhook_description` | 400 | The description is longer than 200 characters. | Shorten it. |
| `webhook_active` | 400 | active is not true or false. | Send true or false. |
| `webhook_scope` | 400 | The Tenant is not named as an id. | Name the Tenant as lower-case letters, digits and inner hyphens. |
| `webhook_limit` | 409 | The workbench holds as many webhook subscriptions as it may. | Delete one you no longer use. |
| `webhook_not_found` | 404 | There is no such webhook subscription. | Choose one from the list. |
| `webhook_delivery_not_found` | 404 | The webhook has no such delivery. | Choose one from its deliveries. |
| `webhook_delivery_not_dead` | 409 | Only a delivery that gave up can be sent again. | Wait; a pending delivery retries by itself. |

## Request intake

| Code | HTTP | What happened | What to do next |
| --- | --- | --- | --- |
| `intake_off` | 404 | Request intake is off. | An administrator turns it on with the intake.requests flag. |
| `intake_source` | 400 | A field of the intake source is missing or not valid. | Correct the value the message names and send it again. |
| `intake_source_exists` | 409 | An intake source with this id exists. | Choose another id. |
| `intake_sources_full` | 409 | The workbench holds as many intake sources as it may. | Remove one you no longer use. |
| `intake_secret` | 400 | The signing secret is missing or not the sender's. | Paste the signing secret the sender shows. |
| `intake_mapping` | 400, 500 | The intake mapping is missing or not valid. | Correct the value the message names and send it again. |
| `intake_no_title` | 422 | The delivery has no title where the mapping looks for one. | Fix the mapping, or send a title. |
| `intake_mail` | 400 | The mail is in no form Unfold reads. | Send raw MIME, a Postmark inbound payload, or the JSON fields the message lists. |
| `signature_missing` | 401 | The delivery carries no signature. | Configure the sender to sign each delivery with the source's secret. |
| `signature_invalid` | 401 | The delivery's signature does not match this intake source. | Check that the sender uses the source's current secret. |
| `timestamp_outside_window` | 401 | The delivery's signed time is too far from now. | Check the sender's clock; replayed deliveries are refused. |

## Audit and export

| Code | HTTP | What happened | What to do next |
| --- | --- | --- | --- |
| `audit_export_off` | 404 | Audit export is off for this Tenant. | An administrator turns it on with the audit.export flag. |
| `audit_tenant` | 400 | The request names no Tenant. | Name the Tenant with ?tenant=. |
| `audit_tenant_forbidden` | 403 | You are not an administrator of this Tenant. | Ask one of its administrators. |
| `audit_cursor` | 400 | The cursor is not a record sequence number. | Pass the sequence number of the last record you read. |
| `audit_limit` | 400 | The limit is outside what a page holds. | Choose a limit within the range the message names. |
| `audit_since` | 400 | since is not a UTC time. | Give it as an ISO 8601 UTC time, such as 2026-10-01T00:00:00Z. |
| `cost_export_filter` | 400 | A cost export filter is not valid. | Fix the parameter the message names. |
| `tenant` | 400 | The Tenant id is not valid. | Use lower-case letters, digits and inner hyphens. |
| `tenant_not_found` | 404 | There is no such Tenant here. | Use the Tenant the message names. |
| `tenant_export_off` | 403 | Tenant export is off. | An administrator turns it on with the flag the message names. |
| `tenant_export_confirm` | 400 | The export was not confirmed. | Type the Tenant id to confirm. |
| `tenant_export_running` | 409 | An export is already running. | Wait for it to finish. |
| `tenant_export_not_ready` | 409 | The export is still running or failed. | Wait for it, or start a new one if it failed. |
| `tenant_export_not_found` | 404 | The export is unknown, expired or not yours. | Start a new export. |
| `text` | 400 | The status note is empty or too long. | Write the note in 1 to 500 characters. |
| `severity` | 400 | The severity is not info, degraded or outage. | Choose info, degraded or outage. |

## Feature flags

| Code | HTTP | What happened | What to do next |
| --- | --- | --- | --- |
| `flag_not_found` | 404 | There is no such flag here. | Choose a flag from Labs. |
| `flag_choice` | 400 | The choice is not on, off or default. | Choose on, off or default. |
| `flag_variant` | 400 | The variant is not one the flag offers. | Choose a variant the message lists. |
| `flag_rollout` | 400 | The rollout rule is not valid. | Correct the value the message names and send it again. |
| `flag_segment` | 400 | The segment rule is not valid. | Correct the value the message names and send it again. |
| `flag_segment_in_use` | 409 | Rollouts still use this segment. | Remove it from the rollouts the message names first. |
| `flag_store` | 409 | This workbench keeps no flag store. | Ask an administrator of this workbench to fix its configuration. |
| `flag_console_off` | 409 | Rollouts are managed in Git on this workbench. | Change them in the flags file in Git. |
| `git_validation` | 409 | Git did not accept the captured change. | Capture the change again from the workspace. |
| `publication_disabled` | 409 | Publishing pull requests is not turned on here. | Ask an administrator of this workbench to fix its configuration. |
| `publication_binding_required` | 400 | Publishing needs the Work Item's Ploeg binding. | Reload the session and try again. |
| `delivery_authority_rejected` | 409 | Ploeg did not allow this delivery. | Reload the page to see where it stands now, then decide again. |

## MCP

| Code | HTTP | What happened | What to do next |
| --- | --- | --- | --- |
| `mcp_argument` | 400 | A tool argument is missing or not valid. | Call the tool again with the value the message names. |
| `mcp_sign_in_required` | 401 | unfold-mcp has no sign-in for Unfold. | Run npm run mcp -- login and set UNFOLD_TOKEN. |
| `mcp_token_refused` | 401 | Unfold refused UNFOLD_TOKEN; it expired or was revoked. | Run npm run mcp -- login again. |
| `unfold_timeout` | 504 | Unfold did not answer in time. | Try again in a minute. |
| `unfold_unreachable` | 502 | Unfold could not be reached at UNFOLD_URL. | Check UNFOLD_URL and your connection. |
| `mcp_confirmation_unsupported` | 409 | This client cannot ask you to confirm, so nothing was changed. | Do it in Unfold in the browser instead. |
| `mcp_confirmation_missing` | 409 | Your confirmation did not come back, so nothing was changed. | Call the tool again. |
| `mcp_confirmation_invalid` | 409 | The confirmation is expired, already used, for another action or not one this server issued, so nothing was changed. | Call the tool again and confirm the new request. |
| `mcp_plan_changed` | 409 | What the tool would do changed after you confirmed, so nothing was changed. | Call it again to see what it would do now. |
| `mcp_asks_off` | 409 | Asking a model is not enabled for this Work Item's Team. | Ask an administrator to set an Ask model for the Team. |
| `mcp_work_item_state` | 409 | The Work Item is not in a state this tool acts on, so nothing was changed. | Call unfold_get_work to see where it stands. |
| `mcp_handoff_refused` | 409 | The task cannot be handed to that Team, so nothing was changed. | Choose a Team the message lists. |

## Browser

| Code | HTTP | What happened | What to do next |
| --- | --- | --- | --- |
| `network_unreachable` | none | The browser could not reach Unfold. | Check your connection, then try again. |
| `gateway_unavailable` | 502, 503, 504 | The proxy in front of Unfold answered instead of Unfold. | Unfold may be restarting. Try again in a minute. |

## Ask outcomes

An Ask that fails is stored with one of these codes and shown with its message ([`src/ask/service.ts`](../../src/ask/service.ts)). "Ask again" says whether asking again may help.

| Code | Result | Message | Ask again |
| --- | --- | --- | --- |
| `allowance_used_up` | refused | Your Team's Ask Allowance is used up, so nothing was asked or charged. | no |
| `not_admitted` | failed | Ploeg did not admit the question. | no |
| `ploeg_unavailable` | failed | Ploeg did not admit the question: it could not be reached or failed. Try again in a minute. | yes |
| `no_model` | failed | This Team has no model for Asks, so nothing was asked. An administrator must set one in Ploeg. | no |
| `gateway_unreachable` | failed | The model did not answer: the model gateway could not be reached. Try again in a minute. | yes |
| `key_rejected` | failed | The model gateway refused the key Ploeg issued for this question, so nothing was answered. An administrator must check the Ask settings in Ploeg and the gateway. | no |
| `budget_exceeded` | failed | Answering needed more than the per-Ask Budget, so the model was stopped. Ask a shorter, narrower question. | yes |
| `spend_limit_reached` | failed | The model gateway's spending limit for this Team or its people is used up, so nothing was answered. An administrator must raise it in the gateway, or wait until it resets. | no |
| `model_unavailable` | failed | The model gateway does not offer this Team's Ask model to the key Ploeg issued, so nothing was answered. An administrator must check the Team's Ask model in Ploeg and the gateway. | no |
| `too_long` | failed | This Work Item's record and the question are more than the model can read at once, so nothing was answered. An administrator can choose an Ask model with a larger context window. | no |
| `rate_limited` | failed | The model provider is busy right now. Try again in a minute. | yes |
| `provider_error` | failed | The model provider failed to answer. Try again in a minute; if it keeps failing, tell an administrator. | yes |
| `bad_response` | failed | The model gateway sent a reply Unfold could not read, so there is no answer. An administrator should check the gateway. | yes |
| `timeout` | failed | The model took longer than a minute, so Unfold stopped waiting. Try again; a shorter question helps. | yes |
| `cut_off` | failed | The model used all its room thinking and wrote no answer. Try again, or ask a narrower question. | yes |
| `filtered` | failed | The model provider withheld the answer under its content rules. | no |
| `empty` | failed | The model returned an empty answer. Try again. | yes |
| `interrupted` | failed | Unfold restarted while this question was being answered, so the answer was lost. Ask again. | yes |
