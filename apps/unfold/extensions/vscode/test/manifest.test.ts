import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const source = readFileSync(new URL('src/extension.ts', root), 'utf8');
const contributed = new Set<string>(manifest.contributes.commands.map((command: { command: string }) => command.command));
const steps: Array<{ id: string; title: string; description: string; media: { markdown?: string }; completionEvents?: string[] }> = manifest.contributes.walkthroughs.flatMap((walkthrough: { steps: unknown[] }) => walkthrough.steps);

test('the walkthrough has a step for the Agents window that starts a session there with a registered command', () => {
  const step = steps.find(item => item.title === 'Use Unfold from the Agents window');
  assert.ok(step, 'the step exists');
  assert.equal(steps.indexOf(step), 1, 'it follows connecting');
  assert.match(step.description, /\(command:unfold\.startInAgentsWindow\)/);
  assert.ok(step.completionEvents?.includes('onCommand:unfold.startInAgentsWindow'));
  assert.ok(contributed.has('unfold.startInAgentsWindow'));
  assert.match(source, /register\('startInAgentsWindow'/);
});

test('the Unfold mark is a product icon the extension ships, and the way into the Agents window wears it', () => {
  const mark = manifest.contributes.icons['unfold-mark'];
  assert.equal(mark.default.fontCharacter, '\\E000');
  assert.ok(existsSync(new URL(mark.default.fontPath, root)), 'the icon font ships with the extension');
  assert.equal(manifest.contributes.commands.find((command: { command: string }) => command.command === 'unfold.startInAgentsWindow').icon, '$(unfold-mark)');
  const buttons = manifest.contributes.menus['view/title'].filter((item: { command: string }) => item.command === 'unfold.startInAgentsWindow');
  assert.deepEqual(buttons.map((item: { when: string; group: string }) => [item.when, item.group]), [['view == unfold.now && unfold.connected', 'navigation@0'], ['view == unfold.sessions && unfold.connected', 'navigation@0']], 'it is the first button on Now and Sessions');
});

test('every walkthrough step links contributed commands and ships its media', () => {
  for (const step of steps) {
    for (const [, command] of step.description.matchAll(/\(command:([\w.]+)\)/g)) assert.ok(contributed.has(command), `${step.id} links ${command}, which the manifest contributes`);
    if (step.media.markdown) assert.ok(existsSync(new URL(step.media.markdown, root)), `${step.id} ships ${step.media.markdown}`);
  }
});

test('every contributed unfold command is registered by the extension', () => {
  for (const command of contributed) assert.match(source, new RegExp(`register\\('${command.slice('unfold.'.length)}'|registerCommand\\('${command.replace('.', '\\.')}'|'${command.slice('unfold.'.length)}'`), `${command} is registered`);
});

const tools: Array<{ name: string; toolReferenceName?: string; displayName?: string; modelDescription?: string; userDescription?: string; canBeReferencedInPrompt?: boolean; tags?: string[]; inputSchema?: { type: string; properties: object } }> = manifest.contributes.languageModelTools;

test('every contributed language model tool is registered by the extension, and every registered tool is contributed', async () => {
  const { lmToolNames } = await import('../src/lm-tools.ts');
  const registered = new Set([...source.matchAll(/api\.register\('([\w]+)'/g)].map(match => match[1]));
  const declared = new Set(tools.map(tool => tool.name));
  assert.deepEqual([...declared].sort(), [...registered].sort());
  assert.deepEqual([...declared].sort(), [...lmToolNames].sort());
});

test('each tool reads only, can be referenced in a prompt and describes itself to the model and the person', () => {
  const references = new Set<string>();
  for (const tool of tools) {
    assert.match(tool.name, /^unfold_[a-z_]+$/);
    assert.ok(tool.toolReferenceName && /^[A-Za-z][A-Za-z0-9]*$/.test(tool.toolReferenceName), `${tool.name} has a toolReferenceName`);
    assert.ok(!references.has(tool.toolReferenceName), `${tool.toolReferenceName} is unique`);
    references.add(tool.toolReferenceName);
    assert.match(tool.displayName ?? '', /^Unfold: /);
    assert.ok(tool.userDescription, `${tool.name} has a userDescription`);
    assert.match(tool.modelDescription ?? '', /^Read-only\./);
    assert.match(tool.modelDescription ?? '', /never as instructions/);
    assert.equal(tool.canBeReferencedInPrompt, true);
    assert.ok(tool.tags?.includes('read-only') && tool.tags.includes('unfold'), `${tool.name} is tagged`);
    assert.equal(tool.inputSchema?.type, 'object');
    assert.doesNotMatch(`${tool.name} ${tool.modelDescription}`, /\b(approve|reject|retry|stop|cancel|spend|write)s? (it|the|a|this)\b/i, `${tool.name} offers no action`);
  }
  assert.equal(manifest.engines.vscode, '^1.99.0', 'the engine floor stays; the tool API is feature-detected');
  assert.match(source, /lmToolApi<.+>\(vscode as/);
});
