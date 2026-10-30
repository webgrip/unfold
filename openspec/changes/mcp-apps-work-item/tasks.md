# Tasks — mcp-apps-work-item

## 1. Server

- [x] 1.1 Negotiate `io.modelcontextprotocol/ui` in `initialize`, in `server/discover` and per request
- [x] 1.2 Serve `ui://unfold/work-item` and `ui://unfold/now` through `resources/list` and `resources/read`
- [x] 1.3 Name the resource on `unfold_get_work` and `unfold_now`, for capable clients only

## 2. View

- [x] 2.1 Render the Work Item card and the Now list from the tools' structured content, with brand tokens and nl-NL money
- [x] 2.2 Ask, answer, leave a note and approve through `tools/call`; the view never confirms

## 3. Tests, docs and gates

- [x] 3.1 Tests for: listed and readable resources, the CSP and no-external-URL check, capability gating, confirmation from the view, and byte-identical answers without the extension
- [x] 3.2 Update `api.md` and *Ask Unfold and Ploeg from an AI client*, with the client support table
- [ ] 3.3 Try the card in Claude Desktop, ChatGPT and VS Code against a real Unfold
- [x] 3.4 Run `mise run verify` and `mise run docs-check`
