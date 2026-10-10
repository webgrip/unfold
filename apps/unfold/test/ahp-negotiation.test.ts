import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MalformedVersion, negotiateProtocolVersion } from '../src/ahp/host.ts';
import { compareProtocolVersions, isActionKnownToVersion, protocolBaselines, speaksCatalog, supportedVersions } from '../src/ahp/versions.ts';

type Vector = { offered: unknown[]; expected?: string | null; invalid?: true };
const upstreamVectors: Vector[] = JSON.parse(readFileSync(new URL('./fixtures/agent-host-protocol/version-negotiation.json', import.meta.url), 'utf8'));

test('all 22 version-negotiation vectors of agent-host-protocol spec/v1.0.0 pass', () => {
  assert.equal(upstreamVectors.length, 22);
  for (const vector of upstreamVectors) {
    if (vector.invalid) assert.throws(() => negotiateProtocolVersion(vector.offered), MalformedVersion, JSON.stringify(vector.offered));
    else assert.equal(negotiateProtocolVersion(vector.offered), vector.expected ?? undefined, JSON.stringify(vector.offered));
  }
});

test('the host speaks both released baselines and names both in -32005', () => {
  assert.deepEqual(protocolBaselines, ['1.0.0', '0.9.0']);
  assert.deepEqual(supportedVersions, ['^1.0.0', '^0.9.0']);
});

test('the host selects the highest offered version in either baseline and answers that exact string, whatever the offer order', () => {
  const cases: Array<[string[], string | undefined]> = [
    [[], undefined],
    [['0.9.0'], '0.9.0'],
    [['0.9.0', '0.9.4'], '0.9.4'],
    [['0.9.4', '0.9.0'], '0.9.4'],
    [['0.9.10', '0.9.9'], '0.9.10'],
    [['0.9.2', '0.9.2'], '0.9.2'],
    [['0.10.0', '0.9.0', '0.7.0', '0.6.0', '0.5.2', '0.5.1'], '0.9.0'],
    [['1.0.0', '0.10.0', '0.9.0'], '1.0.0'],
    [['0.9.0', '1.0.0'], '1.0.0'],
    [['1.4.0', '1.10.0'], '1.10.0'],
    [['1.0.0'], '1.0.0'],
    [['2.0.0', '0.10.0', '0.9.1'], '0.9.1'],
    [['2.0.0', '0.10.0', '0.8.99'], undefined],
    [['0.10.0'], undefined],
    [['0.8.0', '0.5.2'], undefined],
    [['0.9.99999999999999999999', '0.9.100'], '0.9.99999999999999999999'],
    [['1.99999999999999999999.0', '1.100.0', '0.9.0'], '1.99999999999999999999.0'],
  ];
  for (const [offered, expected] of cases) assert.equal(negotiateProtocolVersion(offered), expected, JSON.stringify(offered));
});

test('a malformed offered version is an error even when another entry would match', () => {
  const malformed: unknown[][] = [
    ['0.9'], ['0.9.0.0'], ['00.9.0'], ['0.09.0'], ['0.9.01'], ['0.9.0-beta'], ['0.9.0+build'], [' 0.9.0'], ['0.9.0\n'], ['0.-1.0'], ['v0.9.0'], [''],
    ['0.9.0', 'invalid'], ['invalid', '0.9.0'], ['1.0.0', '1.0'], [9], [null], [{ version: '0.9.0' }],
  ];
  for (const offered of malformed) assert.throws(() => negotiateProtocolVersion(offered), MalformedVersion, JSON.stringify(offered));
});

test('only a 1.x client is sent the session chat catalog', () => {
  assert.equal(speaksCatalog('0.9.0'), false);
  assert.equal(speaksCatalog('0.9.7'), false);
  assert.equal(speaksCatalog('1.0.0'), true);
  assert.equal(speaksCatalog('1.10.3'), true);
});

test('an action is known to a client by the version that introduced it, as the SDK\'s isActionKnownToVersion decides', () => {
  assert.equal(compareProtocolVersions('0.10.0', '0.9.99'), 1);
  for (const type of ['session/chatUpdated', 'session/isReadChanged', 'chat/isReadChanged', 'chat/isArchivedChanged', 'chat/changesetsChanged', 'chat/turnStarted', 'session/activeClientSet', 'root/configChanged']) {
    assert.equal(isActionKnownToVersion(type, '0.9.0'), true, type);
    assert.equal(isActionKnownToVersion(type, '1.0.0'), true, type);
  }
  for (const type of ['chat/canvasesChanged', 'canvas/stateChanged']) {
    assert.equal(isActionKnownToVersion(type, '0.9.0'), false, type);
    assert.equal(isActionKnownToVersion(type, '0.9.12'), false, type);
    assert.equal(isActionKnownToVersion(type, '1.0.0'), true, type);
  }
  assert.equal(isActionKnownToVersion('session/workingDirectoryReplaced', '0.9.0'), true);
  assert.equal(isActionKnownToVersion('x-unfold/anything', '0.9.0'), true, 'an implementation-defined type is not version-gated');
});
