import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';

import { LOCAL_SITE_URL, SITE_INDEXABLE, SITE_URL, isIndexable, resolveSiteUrl } from './site.ts';

describe('site indexing', () => {
  test('a Cloudflare platform hostname is never indexed', () => {
    assert.equal(isIndexable('https://unfold-site.example.workers.dev'), false);
    assert.equal(isIndexable('https://unfold-site.pages.dev'), false);
  });

  test('a local build is never indexed', () => {
    assert.equal(isIndexable(LOCAL_SITE_URL), false);
    assert.equal(isIndexable('http://127.0.0.1:4321'), false);
  });

  test('a real domain is indexed', () => {
    assert.equal(isIndexable('https://unfoldhq.dev'), true);
    assert.equal(isIndexable('https://unfold.example'), true);
    assert.equal(isIndexable('https://www.workers.dev.example'), true);
  });

  test('the site follows its own URL', () => {
    assert.equal(SITE_INDEXABLE, isIndexable(SITE_URL));
  });

  test('the URL is an origin without a trailing slash', () => {
    assert.equal(new URL(SITE_URL).origin, SITE_URL.toLowerCase());
  });
});

describe('site URL', () => {
  test('an unset or blank build URL falls back to the local origin', () => {
    assert.equal(resolveSiteUrl(undefined), LOCAL_SITE_URL);
    assert.equal(resolveSiteUrl('  '), LOCAL_SITE_URL);
  });

  test('the deploy passes the workers.dev origin through unchanged', () => {
    assert.equal(
      resolveSiteUrl('https://unfold-site.example.workers.dev'),
      'https://unfold-site.example.workers.dev',
    );
  });

  test('a URL with a path or trailing slash is refused', () => {
    assert.throws(() => resolveSiteUrl('https://unfold-site.example.workers.dev/'));
    assert.throws(() => resolveSiteUrl('https://unfold.example/site'));
  });
});
