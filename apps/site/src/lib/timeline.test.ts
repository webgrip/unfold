import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import {
  VOLATILE_FIELDS,
  formatMoney,
  formatOffset,
  maskTimeline,
  timelineDuration,
  type Timeline,
} from './timeline.ts';

const timeline = JSON.parse(
  readFileSync(new URL('../data/demo-timeline.json', import.meta.url), 'utf8'),
) as Timeline;

describe('the committed demo timeline', () => {
  test('records the deterministic demo: no model calls, no spend, nothing merged', () => {
    assert.equal(timeline.modelCalls, 0);
    assert.equal(timeline.budget.spent, 0);
    assert.equal(timeline.budget.costStatus, 'demo');
    assert.equal(timeline.outcome.merged, false);
    assert.equal(timeline.outcome.verdict, 'approve');
  });

  test('goes from a Work Item through a writer and a reviewer Run to a change ready for review', () => {
    const kinds = timeline.events.map((event) => event.kind);
    assert.equal(kinds[0], 'work-item');
    assert.ok(kinds.indexOf('shift-started') < kinds.indexOf('run-started'));
    assert.deepEqual(
      timeline.roles.map((role) => role.mode),
      ['write', 'read'],
    );
    assert.ok(kinds.includes('change-ready'));
    assert.equal(kinds.at(-1), 'shift-finished');
  });

  test('its offsets never go backwards', () => {
    const offsets = timeline.events.map((event) => event.at);
    assert.deepEqual(
      offsets,
      [...offsets].sort((a, b) => a - b),
    );
    assert.equal(timelineDuration(timeline), offsets.at(-1));
  });
});

describe('masking', () => {
  test('only the event offsets are volatile', () => {
    assert.deepEqual([...VOLATILE_FIELDS], ['events[].at']);
    const shifted = {
      ...timeline,
      events: timeline.events.map((event) => ({ ...event, at: event.at + 123 })),
    };
    assert.deepEqual(maskTimeline(shifted), maskTimeline(timeline));
    assert.notDeepEqual(maskTimeline({ ...timeline, diff: '' }), maskTimeline(timeline));
  });
});

describe('formatting', () => {
  test('money has two decimals in the page locale', () => {
    assert.match(formatMoney(5, 'EUR', 'nl-NL'), /^€\s5,00$/u);
    assert.match(formatMoney(0, 'USD', 'en-GB'), /0\.00$/);
  });

  test('offsets are seconds with one decimal', () => {
    assert.equal(formatOffset(1100, 'nl-NL'), '1,1');
    assert.equal(formatOffset(6400, 'en-GB'), '6.4');
  });
});
