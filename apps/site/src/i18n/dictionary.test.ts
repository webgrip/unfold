import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';

import { en } from './en.ts';
import { nl } from './nl.ts';

function keyPaths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return [
      `${prefix}[${value.length}]`,
      ...value.flatMap((item, index) => keyPaths(item, `${prefix}[${index}]`)),
    ];
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) =>
      keyPaths(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

function leaves(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(leaves);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(leaves);
  return [String(value)];
}

describe('locale dictionaries', () => {
  test('en and nl declare exactly the same keys and list lengths', () => {
    assert.deepEqual(keyPaths(nl).sort(), keyPaths(en).sort());
  });

  test('no entry is empty', () => {
    for (const [name, dict] of Object.entries({ en, nl })) {
      for (const text of leaves(dict))
        assert.ok(text.trim().length > 0, `${name} has an empty entry`);
    }
  });

  test('copy carries no emoji', () => {
    const emoji = /\p{Extended_Pictographic}/u;
    for (const [name, dict] of Object.entries({ en, nl })) {
      for (const text of leaves(dict)) assert.doesNotMatch(text, emoji, `${name}: ${text}`);
    }
  });

  test('glossary terms keep their exact spelling in both locales', () => {
    const miscased = /\b(work item|work-item|workitem|shift|role)s?\b/;
    for (const [name, dict] of Object.entries({ en, nl })) {
      for (const text of leaves(dict)) {
        for (const match of text.matchAll(new RegExp(miscased, 'g'))) {
          assert.fail(`${name}: "${match[0]}" should use the glossary spelling in "${text}"`);
        }
      }
    }
  });
});
