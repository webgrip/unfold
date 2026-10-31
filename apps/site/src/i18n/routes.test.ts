import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';

import { AUDIENCES } from '../data/catalogue.ts';
import { AUDIENCE_ROUTES, ROUTES, alternatesFor, routePath } from './routes.ts';

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

  test('the audience, feature and integration pages live at the same path in both locales', () => {
    assert.equal(routePath('features', 'en'), '/features');
    assert.equal(routePath('integrations', 'nl'), '/nl/integrations');
    assert.equal(routePath('forAgencies', 'en'), '/for/agencies');
    assert.equal(routePath('forPlatform', 'nl'), '/nl/for/platform');
  });

  test('every audience has its own page, and no two share one', () => {
    const keys = AUDIENCES.map((audience) => AUDIENCE_ROUTES[audience]);
    assert.equal(new Set(keys).size, AUDIENCES.length);
    for (const key of keys) assert.match(ROUTES[key], /^\/for\/[a-z]+$/);
  });

  test('an audience page names both locales and an English x-default', () => {
    assert.deepEqual(alternatesFor('forTeams', 'https://example.test'), [
      { hreflang: 'en-GB', href: 'https://example.test/for/teams' },
      { hreflang: 'nl-NL', href: 'https://example.test/nl/for/teams' },
      { hreflang: 'x-default', href: 'https://example.test/for/teams' },
    ]);
  });
});
