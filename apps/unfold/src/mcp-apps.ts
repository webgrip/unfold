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
<main id="unfold-app" aria-live="polite"><p class="muted">Loading…</p></main>
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
  return view ? { ui: { resourceUri: view.uri, visibility: ['model', 'app'] }, 'ui/resourceUri': view.uri } : undefined;
}
