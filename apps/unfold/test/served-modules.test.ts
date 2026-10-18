import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { browserModule } from '../src/http.ts';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));

test('every module the browser app imports is one the server serves, so a new folder cannot stop the app from starting', () => {
  const seen = new Set<string>();
  const queue = ['app.js'];
  while (queue.length) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(join(publicDir, file), 'utf8');
    for (const match of source.matchAll(/(?:import|export)\s[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) {
      const target = relative(publicDir, join(dirname(join(publicDir, file)), match[1] ?? match[2]));
      if (!target.startsWith('..')) queue.push(target);
    }
  }
  const unserved = [...seen].filter(file => file.includes('/') && !browserModule.test(`/${file}`));
  assert.deepEqual(unserved, []);
  assert.ok(seen.has('live/flight-path.js'), 'the walk reaches the live view');
});
