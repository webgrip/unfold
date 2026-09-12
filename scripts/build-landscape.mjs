import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const sources = [
  ['start', 'Start here', 'docs/landscape/index.md'],
  ['components', 'Responsibilities', 'docs/landscape/components.md'],
  ['c4', 'C4 views', 'docs/landscape/c4.md'],
  ['alternatives', 'Alternatives', 'docs/research/2026-09-11-ecosystem-alternatives.md'],
  ['bottlenecks', 'Bottlenecks', 'docs/landscape/bottlenecks.md'],
  ['vocabulary', 'Vocabulary', 'docs/domain/glossary.md'],
  ['rules', 'Product rules', 'docs/domain/rules.md'],
  ['questions', 'Open questions', 'docs/landscape/questions.md'],
  ['evidence', 'Implementation evidence', 'docs/research/2026-09-11-ecosystem-implementation.md'],
];
const inputs = await Promise.all(sources.map(async ([id, title, file]) => ({ id, title, file, markdown: await readFile(resolve(root, file), 'utf8') })));
const browser = await chromium.launch({ headless: true });
let rendered;
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  await page.setContent('<!doctype html><html><head><meta charset="UTF-8"></head><body></body></html>');
  rendered = await page.evaluate(async (inputs) => {
    const [{ default: mermaid }, { marked }] = await Promise.all([
      import('https://cdn.jsdelivr.net/npm/mermaid@12.0.0/dist/mermaid.esm.min.mjs'),
      import('https://cdn.jsdelivr.net/npm/marked@15.0.12/lib/marked.esm.js'),
    ]);
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', layout: 'dagre', fontFamily: 'Arial, sans-serif', flowchart: { htmlLabels: true, useMaxWidth: false, nodeSpacing: 35, rankSpacing: 55 }, sequence: { useMaxWidth: false, wrap: true }, themeVariables: { primaryColor: '#eef2f6', primaryTextColor: '#152738', primaryBorderColor: '#527082', lineColor: '#647884', secondaryColor: '#eef2f6', tertiaryColor: '#f7f9fa', clusterBkg: '#f7f9fa', clusterBorder: '#b3c0c9', edgeLabelBackground: '#ffffff', actorBkg: '#eef2f6', actorBorder: '#527082', actorTextColor: '#152738', signalColor: '#647884', signalTextColor: '#152738', labelBoxBkgColor: '#eef2f6', labelBoxBorderColor: '#527082', labelTextColor: '#152738', noteBkgColor: '#f7f9fa', noteTextColor: '#152738', noteBorderColor: '#b3c0c9' } });
    let sequence = 0;
    const pages = [];
    const diagrams = [];
    for (const input of inputs) {
      const tokens = marked.lexer(input.markdown);
      const document = [];
      let heading = input.title;
      for (const token of tokens) {
        if (token.type === 'heading') heading = token.text;
        if (token.type === 'code' && token.lang === 'mermaid') {
          const id = `architecture-${sequence++}`;
          const { svg } = await mermaid.render(id, token.text);
          diagrams.push({ id, source: input.id, title: heading, svg, mermaid: token.text });
          document.push({ type: 'html', raw: '', text: `<figure data-diagram="${id}"><div class="diagram">${svg}</div><figcaption>${heading}</figcaption></figure>` });
        } else document.push(token);
      }
      document.links = tokens.links;
      pages.push({ ...input, html: marked.parser(document) });
    }
    return { pages, diagrams };
  }, inputs);
} finally { await browser.close(); }

const colorVariables = new Map([
  ['#eef2f6', 'var(--diagram-node)'], ['#152738', 'var(--diagram-text)'],
  ['#527082', 'var(--diagram-stroke)'], ['#647884', 'var(--diagram-line)'],
  ['#f7f9fa', 'var(--diagram-boundary)'], ['#b3c0c9', 'var(--diagram-border)'],
  ['#ffffff', 'var(--diagram-paper)'], ['#fff', 'var(--diagram-paper)'], ['#333', 'var(--diagram-text)'],
]);
const themed = (html) => html.replace(/#[\da-f]{6}\b|#[\da-f]{3}\b/gi, color => colorVariables.get(color.toLowerCase()) ?? 'var(--diagram-stroke)').replace(/rgba?\([^)]*\)/g, 'var(--diagram-stroke)');
const idForFile = new Map(sources.map(([id,, file]) => [resolve(root, file), id]));
idForFile.set(resolve(root, 'docs/landscape/explorer.html'), 'start');
const embeddedSources = new Map(await Promise.all([
  'docs/domain/model.yaml', 'docs/domain/overview.md', 'docs/domain/entities.md', 'scripts/build-landscape.mjs',
].map(async file => [resolve(root, file), { name: file.split('/').at(-1), content: await readFile(resolve(root, file), 'utf8') }])));
for (const page of rendered.pages) {
  page.html = themed(page.html).replace(/href="([^"#][^"]*)"/g, (whole, href) => {
    if (/^(?:https?:|mailto:)/.test(href)) return whole;
    const [file, fragment] = href.split('#');
    const target = resolve(root, dirname(page.file), file);
    const pageId = idForFile.get(target);
    if (pageId) return `href="#${pageId}"`;
    const embedded = embeddedSources.get(target);
    if (embedded) return `href="data:text/plain;charset=utf-8,${encodeURIComponent(embedded.content)}" download="${embedded.name}"`;
    return `href="https://forgejo.webgrip.dev/webgrip/de-vloer/src/branch/development/${relative(root, target)}${fragment ? '#'+fragment : ''}"`;
  });
}
rendered.diagrams = rendered.diagrams.map(d => ({ ...d, svg: themed(d.svg) }));
const data = JSON.stringify(rendered).replaceAll('<', '\\u003c');
const template = await readFile(resolve(root, 'docs/landscape/explorer.template.html'), 'utf8');
await writeFile(resolve(root, 'docs/landscape/explorer.html'), template.replace('"__LANDSCAPE_DATA__"', data));
await writeFile('/tmp/ploeg-vloer-landscape-rendered.json', JSON.stringify(rendered));
const canvasOption = process.argv.indexOf('--canvas');
if (canvasOption !== -1) {
  if (!process.argv[canvasOption + 1]) throw new Error('--canvas requires the existing canvas file path');
  const canvasPath = resolve(process.argv[canvasOption + 1]);
  const source = await readFile(canvasPath, 'utf8');
  const declaration = /^const pages: .*\[\] = .*;$/m;
  if (!declaration.test(source)) throw new Error('The canvas pages declaration was not found');
  const pages = rendered.pages.map(({ id, title, html }) => ({ id, title, html }));
  await writeFile(canvasPath, source.replace(declaration, () => 'const pages: { id: string; title: string; html: string }[] = '+JSON.stringify(pages)+';'));
}
console.log(JSON.stringify({ pages: rendered.pages.length, diagrams: rendered.diagrams.length, output: 'docs/landscape/explorer.html' }));
