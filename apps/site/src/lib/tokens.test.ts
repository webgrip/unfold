import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const tokens = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
const global = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');

function declarationsOf(block: string): string[] {
  return block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('--') || line.startsWith('color-scheme'))
    .sort();
}

function blockAfter(marker: string): string {
  const start = tokens.indexOf(marker);
  assert.notEqual(start, -1, `marker not found: ${marker}`);
  const open = tokens.indexOf('{', start + marker.length);
  let depth = 1;
  let index = open + 1;
  while (index < tokens.length && depth > 0) {
    if (tokens[index] === '{') depth++;
    if (tokens[index] === '}') depth--;
    index++;
  }
  return tokens.slice(open + 1, index - 1);
}

describe('tokens.css', () => {
  test('the media-query dark block and the [data-theme=dark] block declare identical tokens', () => {
    assert.deepEqual(
      declarationsOf(blockAfter('@media (prefers-color-scheme: dark) {\n  :root')),
      declarationsOf(blockAfter(":root[data-theme='dark']")),
      'the two dark blocks have drifted apart; every token change must land in both',
    );
  });

  test('raw colour values live only in brand.css', () => {
    for (const [name, css] of Object.entries({ 'tokens.css': tokens, 'global.css': global })) {
      assert.doesNotMatch(
        css,
        /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i,
        `${name} declares a raw colour`,
      );
    }
  });
});
