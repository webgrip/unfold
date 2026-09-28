import test from 'node:test';
import assert from 'node:assert/strict';
import { ploegLanes } from '../src/ploeg-types.ts';

test('the tree shows every lane the Vloer server snapshots, so work awaiting review is reachable without paging All work', () => {
  assert.deepEqual(ploegLanes.map(lane => lane.id), ['awaiting_review', 'needs_human', 'leased', 'queued', 'all']);
});
