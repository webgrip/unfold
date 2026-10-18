import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderStory, storyFiles, storyNames } from '../public/live/stories/index.js';
import { scenarioNames } from '../public/live/stories/shared.js';

const all = [];
for (const [file, load] of Object.entries(storyFiles)) {
  const module = await load();
  for (const name of storyNames(module)) all.push({ file, name, module });
}

test('every story file is a Component Story Format module with a scenario control', async () => {
  for (const [file, load] of Object.entries(storyFiles)) {
    const module = await load();
    assert.match(module.default.title, /^Live\//, file);
    assert.equal(typeof module.default.render, 'function', file);
    assert.deepEqual(module.default.argTypes.scenario.options, scenarioNames, file);
    assert.ok(storyNames(module).length > 0, file);
  }
  for (const { file, name, module } of all) assert.ok(scenarioNames.includes({ ...module.default.args, ...module[name].args }.scenario), `${file}--${name}`);
});

test('every story renders markup the app’s Content Security Policy and screen readers accept', () => {
  for (const { file, name, module } of all) {
    const id = `${file}--${name}`;
    const { html } = renderStory(module, name);
    assert.doesNotMatch(html, /\sstyle=/, `${id}: inline style attributes break style-src 'self'`);
    assert.doesNotMatch(html, /<script|\son[a-z]+=/i, `${id}: no inline script or handlers`);
    assert.doesNotMatch(html, /undefined|NaN|\[object |Infinity/, `${id}: a value leaked into the markup`);
    assert.doesNotMatch(html, /US\$\s?\d+\.\d\d/, `${id}: money is formatted for nl-NL`);
    for (const svg of html.match(/<svg[^>]*>/g) ?? []) assert.ok(/aria-hidden="true"/.test(svg) || (/role="img"/.test(svg) && /aria-label="[^"]+"/.test(svg)), `${id}: ${svg}`);
    for (const button of html.match(/<button[^>]*>/g) ?? []) assert.match(button, /type="(button|submit|reset)"/, `${id}: ${button}`);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, `${id}: duplicate ids ${ids}`);
  }
});

test('the scenario control re-renders a story from another fixture', () => {
  const { module } = all.find(entry => entry.file === 'flight-path');
  const queued = renderStory(module, 'Struggling', { scenario: 'queued' }).html;
  assert.match(queued, /data-state="queued"/);
  assert.match(queued, /At the gate/);
});
