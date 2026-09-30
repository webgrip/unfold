import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';

import { SITE_INDEXABLE, SITE_URL, isIndexable } from './site.ts';

describe('site indexing', () => {
  test('a Cloudflare platform hostname is never indexed', () => {
    assert.equal(isIndexable('https://glide-site.example.workers.dev'), false);
    assert.equal(isIndexable('https://glide-site.pages.dev'), false);
  });

  test('a real domain is indexed', () => {
    assert.equal(isIndexable('https://glide.example'), true);
    assert.equal(isIndexable('https://www.workers.dev.example'), true);
  });

  test('the site follows its own URL', () => {
    assert.equal(SITE_INDEXABLE, isIndexable(SITE_URL));
  });

  test('the URL is an origin without a trailing slash', () => {
    assert.equal(new URL(SITE_URL).origin, SITE_URL.toLowerCase());
  });
});
