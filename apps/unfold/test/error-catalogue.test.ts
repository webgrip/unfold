import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { errorCatalogue, errorCodesPage, publicError } from '../src/error-catalogue.ts';
import { admissionFailures, answerFailures, claimFailures, noteFailures, PloegError } from '../src/ploeg.ts';
import { takeOverRefusals } from '../public/core/take-over.js';
import { askFailures } from '../src/ask/service.ts';

const app = resolve(import.meta.dirname, '..');
const page = join(app, 'docs/contracts/error-codes.md');

function sources(path: string, extensions: RegExp): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return entry.name === 'vendor' || entry.name === 'node_modules' ? [] : sources(child, extensions);
    return extensions.test(entry.name) ? [child] : [];
  });
}

const thrown: RegExp[] = [
  /\b(?:fault|fail|refuse|failure)\(\s*[^,()]+,\s*'([a-z][a-z0-9_]*)'/g,
  /\bnew (?!AgentTrace|Set|Scim|Decider|BillingSend|Capture|Rpc|Type)\w*Error\(\s*[^,'"`]*?,\s*'([a-z][a-z0-9_]*)'\s*,/g,
  /\bnew CrackError\(\s*'([a-z][a-z0-9_]*)'/g,
  /,\s*[1-5]\d\d,\s*'([a-z][a-z0-9_]*)'\s*\)/g,
  /\berror: \{ code: '([a-z][a-z0-9_]*)'/g,
  /\bstatus: [1-5]\d\d, code: '([a-z][a-z0-9_]*)'/g,
  /\bnew UnfoldAnswer\(\s*\d{3},\s*'([a-z][a-z0-9_]*)'/g,
  /\bcode: '([a-z][a-z0-9_]*)', message:/g,
];
const tuples = /\[\s*(?:\d{3},\s*)?'([a-z][a-z0-9_]*)',\s*['`]/g;
const tupleTables = ['askFailures', 'chatFailures', 'requeueFailures'];
const machineOnly = /^src\/(runtime\/relay|tar-writer|delivery-archive)\.ts$/;
const sentenceKeys = new Set(['not_found', 'invalid', 'unreachable', 'unsupported']);

function codesInSources(): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  const add = (code: string, where: string) => found.set(code, (found.get(code) ?? new Set()).add(where));
  for (const file of [...sources(join(app, 'src'), /\.ts$/), join(app, 'public/core/api.js')]) {
    if (machineOnly.test(relative(app, file))) continue;
    const source = readFileSync(file, 'utf8');
    const where = relative(app, file);
    for (const pattern of thrown) for (const [, code] of source.matchAll(pattern)) add(code, where);
    if (where === 'src/ploeg.ts') for (const table of tupleTables) {
      const start = source.indexOf(`const ${table}`);
      if (start < 0) continue;
      const block = source.slice(start, source.indexOf('\n};', start));
      for (const [, code] of block.matchAll(tuples)) add(code, where);
      for (const [, code] of block.matchAll(/^\s+([a-z][a-z0-9_]*): /gm)) add(code, where);
    }
  }
  const ploeg = readFileSync(join(app, 'src/ploeg.ts'), 'utf8');
  const attribution = ploeg.slice(ploeg.indexOf('const attributionRefusals'), ploeg.indexOf('\n};', ploeg.indexOf('const attributionRefusals')));
  for (const [, code] of attribution.matchAll(/^\s+([a-z][a-z0-9_]*): \[/gm)) add(`crack_${code}`, 'src/ploeg.ts');
  for (const [, code] of attribution.matchAll(/^\s+([a-z][a-z0-9_]*): \[/gm)) add(code, 'src/ploeg.ts');
  for (const table of [admissionFailures, claimFailures, noteFailures, answerFailures, takeOverRefusals]) for (const code of Object.keys(table)) if (!sentenceKeys.has(code)) add(code, 'src/ploeg.ts');
  for (const code of Object.keys(askFailures)) if (!errorCatalogueHas(code)) found.delete(code);
  return found;
}
const errorCatalogueHas = (code: string) => Object.hasOwn(errorCatalogue, code);

test('every code an error carries to a person is in the error catalogue', () => {
  const missing = [...codesInSources()].filter(([code]) => !Object.hasOwn(errorCatalogue, code)).map(([code, where]) => `${code} (${[...where].join(', ')})`);
  assert.deepEqual(missing, [], 'Add each code to src/error-catalogue.ts with what happened and what to do next, then run mise run error-codes');
});

test('the catalogue lists no code that nothing raises', () => {
  const used = codesInSources();
  const elsewhere = [...sources(join(app, 'src'), /\.ts$/), ...sources(join(app, 'public'), /\.js$/)].filter(file => !file.endsWith('error-catalogue.ts')).map(file => readFileSync(file, 'utf8')).join('\n');
  const unused = Object.keys(errorCatalogue).filter(code => !used.has(code) && !elsewhere.includes(`'${code}'`));
  assert.deepEqual(unused, [], 'Remove catalogue entries no error raises');
});

test('each catalogue entry says what happened and what to do next in plain sentences', () => {
  for (const [code, entry] of Object.entries(errorCatalogue)) {
    assert.match(code, /^[a-z][a-z0-9_]*$/, `${code} is lower snake case`);
    assert(entry.status.every(status => status >= 400 && status < 600), `${code} names its HTTP statuses`);
    for (const [field, text] of [['happened', entry.happened], ['next', entry.next]] as const) {
      assert.match(text, /^[A-Za-z].*[.]$/s, `${code}.${field} is a sentence`);
      assert.doesNotMatch(text, /something went wrong|an error occurred|unexpected error|oops|check the server log/i, `${code}.${field} is vague`);
      assert(text.length <= 240, `${code}.${field} stays short`);
    }
  }
});

test('the error codes page lists the catalogue as it is', () => {
  assert.equal(readFileSync(page, 'utf8'), errorCodesPage(askFailures), 'docs/contracts/error-codes.md is stale; run mise run error-codes');
});

test('a fault inside Unfold reaches a person as a catalogued sentence without internals', () => {
  const leaked = publicError(Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432 at Pool.connect (/app/node_modules/pg/lib/index.js:45)'), { code: 'ECONNREFUSED' }));
  assert.equal(leaked.status, 500);
  assert.equal(leaked.code, 'internal_error');
  assert.doesNotMatch(leaked.message, /ECONNREFUSED|10\.0\.0\.5|node_modules|pg/);
  assert.equal(leaked.message, errorCatalogue.internal_error.happened + ' ' + errorCatalogue.internal_error.next);
  const typed = publicError(new TypeError("Cannot read properties of undefined (reading 'id')"));
  assert.equal(typed.code, 'internal_error');
  assert.doesNotMatch(typed.message, /undefined|reading/);
  const kept = publicError(new PloegError(503, 'ploeg_unavailable', 'Ploeg could not be reached. Refresh to try again.'));
  assert.deepEqual(kept, { status: 503, code: 'ploeg_unavailable', message: 'Ploeg could not be reached. Refresh to try again.' });
  const refused = publicError(Object.assign(new Error('Choose a page between 1 and 1000.'), { status: 400, code: 'page' }));
  assert.deepEqual(refused, { status: 400, code: 'page', message: 'Choose a page between 1 and 1000.' });
  const unnamed = publicError(Object.assign(new Error('raw library text'), { status: 400 }));
  assert.equal(unnamed.code, 'request_failed');
  assert.doesNotMatch(unnamed.message, /raw library text/);
});
