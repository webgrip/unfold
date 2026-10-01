import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import { en } from '../i18n/en.ts';
import { nl } from '../i18n/nl.ts';
import { CONTROLLER, PRIVACY_VERSION, SIGNUP_RETENTION_MONTHS } from './site.ts';

const wrangler = readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8');

describe('the privacy statement', () => {
  test('names the controller, the retention period and the contact in both locales', () => {
    for (const [name, dict] of Object.entries({ en, nl })) {
      const text = dict.privacy.sections.map((section) => section.text).join(' ');
      for (const fact of [
        CONTROLLER.person,
        CONTROLLER.city,
        CONTROLLER.kvk,
        CONTROLLER.email,
        String(SIGNUP_RETENTION_MONTHS),
      ])
        assert.ok(text.includes(fact), `${name} privacy statement lacks ${fact}`);
    }
  });

  test('shows the version that sign-ups record', () => {
    const [year, month, day] = PRIVACY_VERSION.split('-').map(Number);
    assert.ok(en.privacy.version.includes(`${day} October ${year}`));
    assert.ok(nl.privacy.version.includes(`${day} oktober ${year}`));
    assert.equal(month, 10);
  });
});

describe('wrangler.toml', () => {
  test('runs the Worker first only for /api/* and binds the assets and the sign-up database', () => {
    assert.match(wrangler, /^main = "src\/worker\/index\.ts"$/m);
    assert.match(wrangler, /^binding = "ASSETS"$/m);
    assert.match(wrangler, /^run_worker_first = \["\/api\/\*"\]$/m);
    assert.match(wrangler, /^binding = "SIGNUPS"$/m);
    assert.match(wrangler, /^database_id = "[^"]+"$/m);
  });

  test('keeps request logging off so the form never stores an address in logs', () => {
    assert.match(wrangler, /\[observability\.logs\]\ninvocation_logs = false/);
  });

  test('runs the retention job every day', () => {
    assert.match(wrangler, /^crons = \["\d+ \d+ \* \* \*"\]$/m);
  });
});
