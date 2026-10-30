import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** The MCP Apps extension identifier, under `capabilities.extensions` (MCP Apps 2026-01-26). */
export const mcpAppsExtension = 'io.modelcontextprotocol/ui';
/** The MIME type of an MCP Apps HTML view. */
export const mcpAppMimeType = 'text/html;profile=mcp-app';
/** The Content Security Policy every view carries itself, on top of whatever the host applies. */
export const mcpAppPolicy = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'none'; media-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

type Json = Record<string, any>;
type View = { uri: string; name: string; title: string; description: string; view: 'work-item' | 'now'; tool: string };

const views: View[] = [
  { uri: 'ui://unfold/work-item', name: 'unfold-work-item', title: 'Work Item card', description: 'One Work Item: its state, why it waits, its pull request, its last Runs and spend against budget, with Ask, answer, note and approve.', view: 'work-item', tool: 'unfold_get_work' },
  { uri: 'ui://unfold/now', name: 'unfold-now', title: 'What waits for you', description: 'The Work Items that wait for you, each with its reason, fix and links; pick one to open its card.', view: 'now', tool: 'unfold_now' },
];

const asset = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const tokens = asset('../public/styles/tokens.css');
const styles = asset('../public/mcp-apps/view.css');
const script = asset('../public/mcp-apps/view.js');
const inline = (text: string, tag: string) => text.replaceAll(`</${tag}`, `<\\/${tag}`);

function documentFor(view: View): string {
  return `<!doctype html>
<html lang="en" data-view="${view.view}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${mcpAppPolicy}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${view.title} · Unfold</title>
<style>
${inline(tokens, 'style')}
${inline(styles, 'style')}
</style>
</head>
<body>
<main id="unfold-app"><p class="muted">Loading…</p></main>
<p id="unfold-announce" class="visually-hidden" role="status" aria-live="polite"></p>
<script type="module">
${inline(script, 'script')}
</script>
</body>
</html>
`;
}

const documents = new Map(views.map(view => [view.uri, documentFor(view)]));

/** Whether client capabilities declare MCP Apps with the HTML view MIME type, as the extension negotiates it. */
export function supportsMcpApps(capabilities: unknown): boolean {
  const declared = (capabilities as Json | undefined)?.extensions?.[mcpAppsExtension];
  return Boolean(declared) && typeof declared === 'object' && Array.isArray(declared.mimeTypes) && declared.mimeTypes.includes(mcpAppMimeType);
}

/** The `resources/list` entries of the views. */
export function mcpAppResources(): Json[] {
  return views.map(view => ({ uri: view.uri, name: view.name, title: view.title, description: view.description, mimeType: mcpAppMimeType, _meta: { ui: { csp: {}, prefersBorder: false } } }));
}

/** The `resources/read` contents of one view, or undefined for a URI this server does not serve. */
export function readMcpAppResource(uri: unknown): Json[] | undefined {
  const text = typeof uri === 'string' ? documents.get(uri) : undefined;
  return text === undefined ? undefined : [{ uri, mimeType: mcpAppMimeType, text, _meta: { ui: { csp: {}, prefersBorder: false } } }];
}

/** The `_meta` a tool carries in `tools/list` for a capable client when it has a view: the nested key and the deprecated flat one. */
export function mcpAppToolMeta(tool: string): Json | undefined {
  const view = views.find(entry => entry.tool === tool);
  if (tool === cardRevisionTool) return { ui: { resourceUri: 'ui://unfold/work-item', visibility: ['app'] } };
  return view ? { ui: { resourceUri: view.uri, visibility: ['model', 'app'] }, 'ui/resourceUri': view.uri } : undefined;
}

/** The tool the Work Item card polls to stay current. Only a view may call it: hosts keep it out of the model's tool list. */
export const cardRevisionTool = 'unfold_work_item_revision';

const terminalStates = new Set(['done', 'withdrawn']);
const nullable = (type: string) => ({ type: [type, 'null'] });

/** Whether a tool is offered only to MCP Apps views, so only a client that declares the extension may list or call it. */
export function appOnlyTool(name: unknown): boolean { return name === cardRevisionTool; }

/** The `tools/list` definition of the card's revision tool, without its `run`. */
export const cardRevisionDefinition = {
  name: cardRevisionTool, title: 'Work Item card revision',
  description: 'For the Work Item card only: a small summary of one Work Item and a revision token that changes whenever unfold_get_work would answer differently. The card polls it while the person can see it.',
  inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Work Item id, or an Unfold link to it' } }, required: ['id'], additionalProperties: false },
  outputSchema: {
    type: 'object', additionalProperties: false,
    required: ['id', 'state', 'terminal', 'reason', 'waitsOnQuestion', 'pullRequestUrl', 'runs', 'spend', 'lastUpdated', 'revision', 'demo', 'summary'],
    properties: {
      id: { type: 'string' }, state: { type: 'string' }, terminal: { type: 'boolean', description: 'True once the Work Item is done or withdrawn; the card then stops polling' },
      reason: { ...nullable('object'), properties: { chip: { type: 'string' }, sentence: { type: 'string' }, action: { type: 'string' } } },
      waitsOnQuestion: { type: 'boolean' }, pullRequestUrl: nullable('string'),
      runs: { type: 'object', properties: { shown: { type: 'number' }, running: { type: 'number' }, latest: { ...nullable('object'), properties: { role: { type: 'string' }, round: { type: ['number', 'null'] }, result: { type: 'string' } } } } },
      spend: { type: 'object', properties: { spentUsd: { type: 'number' }, latestShiftUsd: nullable('number'), budgetUsd: nullable('number') } },
      lastUpdated: { ...nullable('string'), description: 'When Ploeg last changed the Work Item' },
      revision: { type: 'string', description: 'The same while unfold_get_work answers the same' },
      demo: { type: 'boolean' }, summary: { type: 'string' },
    },
  },
};

/** A short token for one `unfold_get_work` answer: equal answers give the same token, and any change gives another. */
export function workRevision(work: Json): string {
  const { revision: _revision, ...rest } = work;
  return createHash('sha256').update(JSON.stringify(rest)).digest('base64url').slice(0, 22);
}

/** The `unfold_get_work` answer with its `revision`. */
export function withRevision(work: Json): Json { return { ...work, revision: workRevision(work) }; }

/** What the card's revision tool answers, reduced from the `unfold_get_work` answer it reads through the same path. */
export function cardRevision(work: Json): Json {
  const item = work.item ?? {};
  const state = String(item.state ?? '');
  const shifts = Array.isArray(work.shifts) ? work.shifts : [];
  const runs = Array.isArray(work.runs) ? work.runs : [];
  const latestShift = shifts.at(-1);
  const latestRun = runs.at(-1);
  const amount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  const reason = work.reason ? { chip: String(work.reason.chip ?? ''), sentence: String(work.reason.sentence ?? ''), action: String(work.reason.action ?? work.reason.fix ?? '') } : null;
  return {
    id: String(item.id ?? ''), state, terminal: terminalStates.has(state), reason, waitsOnQuestion: item.waitsOnQuestion === true, pullRequestUrl: item.pullRequestUrl ? String(item.pullRequestUrl) : null,
    runs: { shown: runs.length, running: runs.filter((run: Json) => run.state === 'running').length, latest: latestRun ? { role: String(latestRun.role ?? ''), round: typeof latestRun.round === 'number' ? latestRun.round : null, result: String(latestRun.verdict || latestRun.outcome || latestRun.state || '') } : null },
    spend: { spentUsd: amount(shifts.reduce((sum: number, shift: Json) => sum + (Number(shift.spentUsd) || 0), 0)) ?? 0, latestShiftUsd: amount(latestShift?.spentUsd), budgetUsd: amount(latestShift?.budgetUsd) },
    lastUpdated: typeof work.updatedAt === 'string' ? work.updatedAt : null,
    revision: typeof work.revision === 'string' ? work.revision : workRevision(work),
    demo: /illustrative demo/i.test(String(work.summary ?? '')),
    summary: `Work Item ${String(item.id ?? '')} is ${state}${reason?.chip ? `: ${reason.chip}` : ''}.`,
  };
}
