import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';

import { alternatesFor, routePath } from './routes.ts';

describe('routes', () => {
  test('English lives at the root and Dutch under /nl', () => {
    assert.equal(routePath('home', 'en'), '/');
    assert.equal(routePath('home', 'nl'), '/nl');
    assert.equal(routePath('notFound', 'nl'), '/nl/404');
  });

  test('every page names both locales and an English x-default', () => {
    assert.deepEqual(alternatesFor('home', 'https://example.test'), [
      { hreflang: 'en-GB', href: 'https://example.test/' },
      { hreflang: 'nl-NL', href: 'https://example.test/nl' },
      { hreflang: 'x-default', href: 'https://example.test/' },
    ]);
  });
});
