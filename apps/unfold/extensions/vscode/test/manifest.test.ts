import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const source = readFileSync(new URL('src/extension.ts', root), 'utf8');
const contributed = new Set<string>(manifest.contributes.commands.map((command: { command: string }) => command.command));
const steps: Array<{ id: string; title: string; description: string; media: { markdown?: string }; completionEvents?: string[] }> = manifest.contributes.walkthroughs.flatMap((walkthrough: { steps: unknown[] }) => walkthrough.steps);

test('the walkthrough has a step for the Agents window that opens it with a registered command', () => {
  const step = steps.find(item => item.title === 'Use Unfold from the Agents window');
  assert.ok(step, 'the step exists');
  assert.equal(steps.indexOf(step), 1, 'it follows connecting');
  assert.match(step.description, /\(command:unfold\.openAgentsWindow\)/);
  assert.match(step.description, /Workspace ▾ → Unfold · <repository>/);
  assert.ok(step.completionEvents?.includes('onCommand:unfold.openAgentsWindow'));
  assert.ok(contributed.has('unfold.openAgentsWindow'));
  assert.match(source, /register\('openAgentsWindow'/);
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
