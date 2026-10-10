import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../public/styles/', import.meta.url);

test('every stylesheet closes each rule it opens, so no rule is nested by accident', () => {
  for (const name of readdirSync(dir).filter(file => file.endsWith('.css'))) {
    const css = readFileSync(new URL(name, dir), 'utf8').replace(/\/\*[^]*?\*\//g, match => match.replace(/[^\n]/g, ' ')).replace(/(["'])(?:\\.|(?!\1).)*\1/g, '""');
    const open = [];
    for (const [index, line] of css.split('\n').entries()) {
      const where = `${name}:${index + 1}`;
      if (/^[.#\w[:*]/.test(line) && open.length) assert.ok(open.at(-1).startsWith('@'), `${where} starts a rule inside the unclosed rule "${open.at(-1)}"`);
      for (const char of line) {
        if (char === '{') open.push(line.trim());
        else if (char === '}') assert.ok(open.pop() !== undefined, `${where} closes a rule that was never opened`);
      }
    }
    assert.deepEqual(open, [], `${name} leaves rules open`);
  }
});
