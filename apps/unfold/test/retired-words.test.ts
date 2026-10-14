import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { test } from 'node:test';

const repository = resolve(import.meta.dirname, '../../..');
const model = readFileSync(join(repository, 'docs/domain/model.yaml'), 'utf8');
const enforced = ['Crew', 'Vloer'];
const retiredBlock = model.slice(model.indexOf('\nretired_terms:'), model.indexOf('\nrules:'));
const retired = [...retiredBlock.matchAll(/- name: (\S+)\n(?:\s+\w+:.*\n)*?\s+use: \[([^\]]+)\]/g)]
  .map(([, word, use]) => ({ word, use: use.split(',')[0].trim() }))
  .filter(entry => enforced.includes(entry.word));

const screens = ['apps/unfold/public', 'apps/unfold/extensions/vscode/src', 'apps/unfold/extensions/vscode/media', 'apps/unfold/extensions/vscode/package.json', 'apps/unfold/src'];
const pages = ['docs', 'apps/unfold/docs', 'apps/unfold/README.md', 'apps/unfold/extensions/vscode/README.md', 'README.md'];
const records = /(^|\/)(research|evidence|adr|adrs|openspec|landscape|vendor)(\/|$)|CHANGELOG\.md$|\/iteration-[^/]*\.md$|glossary\.md$|decisions\.md$|docs\/domain\//;
const sentenceRecords: Record<string, string> = {
  'apps/unfold/docs/design/2026-10-10-work-item-progress.md': 'its evidence table quotes what the screens said on 2026-10-10',
};
const compatibleText: Record<string, string> = {
  'Set teams only: crews, its retired name, lists different Teams': 'names the retired configuration key crews, which configuration still reads until step 3 of the Team migration',
};
const unfold = 'apps/unfold/src';
const extension = 'apps/unfold/extensions/vscode';
const compatibleKeys: Record<string, { reason: string; files: string[] }> = {
  crewId: {
    reason: 'sessions stored before system ADR-0036 spell their Team crewId, so the store reads it as teamId; the API accepts it from older clients and serves it beside teamId for one release; the extension sends it beside teamId and reads it from older workbenches; Ploeg\'s admission API names the field, so execution-authority sends it until Ploeg renames it',
    files: [`${unfold}/types.ts`, `${unfold}/store.ts`, `${unfold}/engine.ts`, `${unfold}/http.ts`, `${unfold}/execution-authority.ts`, `${extension}/src/types.ts`, `${extension}/src/client.ts`, `${extension}/src/tree.ts`, `${extension}/media/session.js`],
  },
  crews: {
    reason: 'the configuration key and bootstrap field before system ADR-0036: configuration still reads it, bootstrap serves it beside teams for one release, and the extension reads it from older workbenches',
    files: [`${unfold}/config.ts`, `${unfold}/http.ts`, `${extension}/src/client.ts`],
  },
  crew: {
    reason: 'the card field sent beside roles for one release and read from cards stored before; the AHP configuration key older clients send; and the key of the signed candidate attestation predicate, which verifiers pin and which stays unchanged',
    files: [`${unfold}/ahp/session-config.ts`, `${unfold}/attestations.ts`, `${unfold}/cards/cardimage-view.ts`, `${unfold}/ploeg.ts`, `${unfold}/ploeg-demo.ts`, 'apps/unfold/public/cards/card-model.js', `${extension}/src/ploeg-types.ts`, `${extension}/media/task.js`],
  },
};
const inputWords: Record<string, string> = {
  'apps/unfold/src/ask/record.ts': 'the standing-question matcher still understands a person who types the retired word',
};

function files(path: string, extensions: RegExp): string[] {
  const full = join(repository, path);
  let entries;
  try { entries = readdirSync(full, { withFileTypes: true }); } catch { return extensions.test(path) ? [path] : []; }
  return entries.flatMap(entry => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : files(child, extensions);
    return extensions.test(entry.name) ? [child] : [];
  });
}

function texts(source: string): string[] {
  const out: string[] = [];
  const braces: number[] = [];
  let depth = 0;
  let previous = '';
  let i = 0;
  const template = () => {
    let text = '';
    while (i < source.length) {
      const c = source[i];
      if (c === '\\') { text += source.slice(i, i + 2); i += 2; continue; }
      if (c === '`') { i++; out.push(text); return; }
      if (c === '$' && source[i + 1] === '{') { i += 2; out.push(text); text = ''; braces.push(depth); depth++; return; }
      text += c; i++;
    }
    out.push(text);
  };
  while (i < source.length) {
    const c = source[i];
    if (c === '/' && source[i + 1] === '/') { i = source.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && source[i + 1] === '*') { i = source.indexOf('*/', i + 2); if (i < 0) break; i += 2; continue; }
    if (c === '/' && (previous === '' || '(,=:[!&|?{};+-*%<>~^'.includes(previous) || /\breturn$/.test(source.slice(Math.max(0, i - 7), i).trimEnd()))) {
      i++; let inClass = false;
      while (i < source.length && (inClass || source[i] !== '/') && source[i] !== '\n') { if (source[i] === '\\') i++; else if (source[i] === '[') inClass = true; else if (source[i] === ']') inClass = false; i++; }
      i++; previous = ')'; continue;
    }
    if (c === "'" || c === '"') {
      let text = ''; i++;
      while (i < source.length && source[i] !== c && source[i] !== '\n') { if (source[i] === '\\') { text += source.slice(i, i + 2); i += 2; } else text += source[i++]; }
      i++; out.push(text); previous = ')'; continue;
    }
    if (c === '`') { i++; template(); previous = ')'; continue; }
    if (c === '{') depth++;
    if (c === '}') {
      depth--;
      if (braces.length && braces.at(-1) === depth) { braces.pop(); i++; template(); previous = ')'; continue; }
    }
    if (!/\s/.test(c)) previous = c;
    i++;
  }
  return out;
}
const visible = (text: string): string => text.replace(/<[^>]*>/g, ' ');

test('the domain model retires single words that this check enforces', () => {
  assert.deepEqual(retired.map(entry => entry.word).sort(), [...enforced].sort(), 'every word this check enforces is retired in docs/domain/model.yaml');
  assert(retired.some(entry => entry.word === 'Crew' && entry.use === 'Team'), 'docs/domain/model.yaml retires Crew in favour of Team');
});

test('no screen text says a retired word; stored keys, ids and class names that still spell it are not text', () => {
  for (const { word, use } of retired) {
    const pattern = new RegExp(`\\b${word}s?\\b`, 'i');
    const found: string[] = [];
    for (const file of screens.flatMap(path => files(path, /\.(m?js|ts|html|json)$/))) {
      if (records.test(file) || inputWords[file]) continue;
      const source = readFileSync(join(repository, file), 'utf8');
      for (const literal of file.endsWith('.html') || file.endsWith('.json') ? [source] : texts(source)) {
        const text = visible(literal);
        if (compatibleText[text.trim()]) continue;
        if (/\s/.test(text.trim()) ? pattern.test(text) : new RegExp(`^${word}s?$`).test(text.trim())) found.push(`${relative(repository, join(repository, file))}: ${text.trim().slice(0, 120)}`);
      }
    }
    assert.deepEqual(found, [], `Screens say the retired word "${word}"; say "${use}" (docs/domain/model.yaml retired_terms)`);
  }
});

test('code spells the retired word Crew only in the compatibility keys that must remain, each with its reason', () => {
  const found = new Map<string, Set<string>>();
  for (const file of screens.flatMap(path => files(path, /\.(m?js|ts|html|json|css)$/))) {
    if (records.test(file) || inputWords[file]) continue;
    for (const [token] of readFileSync(join(repository, file), 'utf8').matchAll(/[\w-]*crew[\w-]*/gi)) {
      const allowed = compatibleKeys[token];
      assert(allowed?.files.includes(file), `${file} spells "${token}"; say team, or add it to compatibleKeys with the reason it must remain`);
      found.set(token, (found.get(token) ?? new Set()).add(file));
    }
  }
  for (const [token, { files: allowed }] of Object.entries(compatibleKeys)) for (const file of allowed) assert(found.get(token)?.has(file), `${file} no longer spells "${token}"; remove it from compatibleKeys`);
});

test('no living documentation page uses a retired word outside code', () => {
  for (const { word, use } of retired) {
    const pattern = new RegExp(`\\b${word}s?\\b`, 'i');
    const found: string[] = [];
    for (const file of pages.flatMap(path => files(path, /\.md$/))) {
      if (records.test(file) || sentenceRecords[file]) continue;
      const prose = readFileSync(join(repository, file), 'utf8').replace(/```[^]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ').replace(/\]\([^)]*\)/g, ']');
      for (const line of prose.split('\n')) if (pattern.test(line.replace(/CrewAI/g, ''))) found.push(`${file}: ${line.trim().slice(0, 120)}`);
    }
    assert.deepEqual(found, [], `Living docs say the retired word "${word}"; say "${use}"`);
  }
});
