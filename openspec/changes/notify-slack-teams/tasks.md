# Tasks — notify-slack-teams

## 1. Plan

- [ ] 1.1 File the ticket on the Unfold board and add its `VIK-<id>` to the proposal

## 2. Build

- [x] 2.1 `publicRoute`, `flag` and `forget` on `NotificationChannel`; per-person channel flags in the service
- [x] 2.2 Slack adapter: settings, signature check, linking, Block Kit notices, delivery outcomes
- [x] 2.3 Slack permission review and answer for the owner, with the `chat` scope and an Action Record
- [x] 2.4 Teams adapter: workflow URL check, Adaptive Card, delivery outcomes
- [x] 2.5 Demo refusal, secret masking, Tenant export classification, Notifications page blocks

## 3. Document and verify

- [x] 3.1 Operations sections *Slack* and *Microsoft Teams*, flag rows, API and OpenAPI rows
- [ ] 3.2 **[owner]** Install the Slack app in a real workspace and link an account
- [ ] 3.3 **[owner]** Add a real Teams workflow and send a test notice
- [x] 3.4 `mise run verify` and `mise run docs-check`, output in the pull request
