import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { brandFontUrls, brandToken, type BrandToken } from './brand.ts';

const src = fileURLToPath(new URL('..', import.meta.url));
const publicDir = fileURLToPath(new URL('../../public', import.meta.url));
const brand = readFileSync(join(src, 'styles/brand.css'), 'utf8');

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

describe('brand.css', () => {
  test('declares every brand token as a colour', () => {
    const tokens: BrandToken[] = [
      'ink',
      'paper',
      'ground-dark',
      'muted',
      'muted-light',
      'accent',
      'accent-deep',
      'on-accent',
      'surface',
    ];
    for (const token of tokens) assert.match(brandToken(brand, token), /^#[0-9a-f]{6}$/i, token);
  });

  test('every font it loads ships in public/fonts with its licence', () => {
    const urls = brandFontUrls(brand);
    assert.ok(urls.length > 0);
    for (const url of urls) assert.ok(existsSync(join(publicDir, url)), url);
    assert.ok(existsSync(join(publicDir, 'fonts/OFL.txt')));
  });

  test('no component, layout or page hard-codes a colour', () => {
    const sources = files(src).filter(
      (path) => /\.(astro|ts|css)$/.test(path) && !path.endsWith('.test.ts'),
    );
    for (const path of sources) {
      if (path.endsWith(join('styles', 'brand.css'))) continue;
      assert.doesNotMatch(
        readFileSync(path, 'utf8'),
        /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b(?![0-9a-z-])/i,
        path,
      );
    }
  });
});
