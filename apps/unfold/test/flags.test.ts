import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkDocument, checkRegistry, FeatureFlags, flagSettings, fractionalBucket, loadRegistry, murmur3, type FlagOverride, type FlagRegistry } from '../src/flags.ts';

const meta = (extra: Record<string, unknown> = {}) => ({ kind: 'release', owner: 'Test', created: '2026-10-13', expires: '2027-01-13', title: 'A flag', description: 'For tests.', client: true, labs: true, ...extra });

function registry(): FlagRegistry {
  return checkRegistry({
    $evaluators: { 'labs-choice': { if: [{ in: [{ var: '$flagd.flagKey' }, { var: 'labsOff' }] }, 'off', { in: [{ var: '$flagd.flagKey' }, { var: 'labs' }] }, 'on', null] } },
    flags: {
      'work.labs': { state: 'ENABLED', variants: { on: true, off: false }, defaultVariant: 'off', targeting: { $ref: 'labs-choice' }, metadata: meta() },
      'work.static': { state: 'ENABLED', variants: { on: true, off: false }, defaultVariant: 'on', metadata: meta({ kind: 'ops', expires: undefined, client: false, labs: false }) },
      'work.colour': { state: 'ENABLED', variants: { ink: 'ink', baken: 'baken' }, defaultVariant: 'ink', targeting: { fractional: [['ink', 50], ['baken', 50]] }, metadata: meta({ kind: 'experiment', labs: false }) },
      'work.limit': { state: 'ENABLED', variants: { low: 3, high: 10 }, defaultVariant: 'low', targeting: { if: [{ sem_ver: [{ var: 'version' }, '>=', '0.4.0'] }, 'high', null] }, metadata: meta({ kind: 'permission', expires: undefined, client: false, labs: false }) },
      'work.broken': { state: 'ENABLED', variants: { on: true, off: false }, defaultVariant: 'off', targeting: { nonsense: [1] }, metadata: meta({ labs: false }) },
    },
  });
}

const quiet = () => {};

test('murmur3 matches the published MurmurHash3 x86 32-bit vectors that flagd buckets with', () => {
  assert.equal(murmur3(''), 0);
  assert.equal(murmur3('hello'), 613153351);
  assert.equal(murmur3('The quick brown fox jumps over the lazy dog'), 776992547);
  assert.ok(fractionalBucket('work.colourUser-1') >= 0 && fractionalBucket('work.colourUser-1') < 100);
});

test('a flag without targeting resolves its default variant as STATIC, and an unknown flag falls back with FLAG_NOT_FOUND', () => {
  const flags = new FeatureFlags({ registry: registry(), log: quiet });
  assert.deepEqual(flags.getBooleanDetails('work.static', false, {}), { flagKey: 'work.static', value: true, variant: 'on', reason: 'STATIC', flagMetadata: { source: 'code', kind: 'ops' } });
  const missing = flags.getBooleanDetails('work.nothing', true, {});
  assert.equal(missing.value, true);
  assert.equal(missing.errorCode, 'FLAG_NOT_FOUND');
});

test('the shared labs evaluator turns a flag on for a person who opted in, off for one who opted out, and leaves the default otherwise', () => {
  const flags = new FeatureFlags({ registry: registry(), log: quiet });
  assert.deepEqual([flags.getBooleanValue('work.labs', false, { targetingKey: 'a' }), flags.getBooleanDetails('work.labs', false, { targetingKey: 'a' }).reason], [false, 'DEFAULT']);
  assert.deepEqual([flags.getBooleanValue('work.labs', false, { targetingKey: 'b', labs: ['work.labs'] }), flags.getBooleanDetails('work.labs', false, { targetingKey: 'b', labs: ['work.labs'] }).reason], [true, 'TARGETING_MATCH']);
  const rolledOut = new FeatureFlags({ registry: registry(), settings: { document: { flags: { 'work.labs': { defaultVariant: 'on' } } }, unknown: [] }, log: quiet });
  assert.equal(rolledOut.getBooleanValue('work.labs', false, { targetingKey: 'c' }), true, 'a deployment rolls it out to everyone');
  assert.equal(rolledOut.getBooleanValue('work.labs', true, { targetingKey: 'c', labsOff: ['work.labs'] }), false, 'and a person can still opt out');
});

test('fractional rollouts are deterministic per person and split roughly by weight', () => {
  const flags = new FeatureFlags({ registry: registry(), log: quiet });
  const first = flags.getStringDetails('work.colour', 'ink', { targetingKey: 'person-7' });
  assert.equal(first.reason, 'SPLIT');
  assert.equal(flags.getStringValue('work.colour', 'ink', { targetingKey: 'person-7' }), first.value);
  let baken = 0;
  for (let i = 0; i < 2000; i++) if (flags.getStringValue('work.colour', 'ink', { targetingKey: `person-${i}` }) === 'baken') baken++;
  assert.ok(baken > 850 && baken < 1150, `about half get baken, got ${baken}`);
});

test('sem_ver, type mismatches and parse errors resolve the way OpenFeature describes, falling back to the caller default', () => {
  const flags = new FeatureFlags({ registry: registry(), log: quiet });
  assert.equal(flags.getNumberValue('work.limit', 0, { version: 'v0.4.0-rc.73' }), 3, 'a pre-release sorts before its release');
  assert.equal(flags.getNumberValue('work.limit', 0, { version: '0.5.1' }), 10);
  const mismatch = flags.getBooleanDetails('work.limit', false, { version: '0.5.1' });
  assert.deepEqual([mismatch.value, mismatch.reason, mismatch.errorCode], [false, 'ERROR', 'TYPE_MISMATCH']);
  const lines: string[] = [];
  const logged = new FeatureFlags({ registry: registry(), log: line => lines.push(line) });
  const broken = logged.getBooleanDetails('work.broken', true, {});
  logged.getBooleanDetails('work.broken', true, {});
  assert.deepEqual([broken.value, broken.errorCode], [true, 'PARSE_ERROR']);
  assert.equal(lines.filter(line => line.includes('flag.evaluation_failed')).length, 1, 'a broken rule is logged once');
});

test('a disabled flag returns the caller default with reason DISABLED', () => {
  const flags = new FeatureFlags({ registry: registry(), settings: { document: { flags: { 'work.static': { state: 'DISABLED' } } }, unknown: [] }, log: quiet });
  assert.deepEqual([flags.getBooleanValue('work.static', false, {}), flags.getBooleanDetails('work.static', false, {}).reason], [false, 'DISABLED']);
});

test('an administrator override beats every rule, persists through its store and is counted per variant', () => {
  const saved: Record<string, FlagOverride> = {};
  const store = { flagOverrides: () => ({ ...saved }), setFlagOverride: (key: string, override: FlagOverride | null) => { if (override) saved[key] = override; else delete saved[key]; } };
  const flags = new FeatureFlags({ registry: registry(), overrides: store, now: () => new Date('2026-10-13T12:00:00Z'), log: quiet });
  flags.setOverride('work.labs', 'on', 'Ryan', 'Demo for the team');
  assert.deepEqual(saved['work.labs'], { variant: 'on', reason: 'Demo for the team', by: 'Ryan', at: '2026-10-13T12:00:00.000Z' });
  const forced = flags.getBooleanDetails('work.labs', false, { labsOff: ['work.labs'] });
  assert.deepEqual([forced.value, forced.flagMetadata.source], [true, 'override']);
  assert.throws(() => flags.setOverride('work.labs', 'maybe', 'Ryan', 'x'), /Choose one of on, off/);
  flags.setOverride('work.labs', null, 'Ryan', '');
  assert.equal(flags.getBooleanValue('work.labs', false, {}), false);
  assert.deepEqual(flags.counter.of('work.labs'), { on: 1, off: 1 });
  const reopened = new FeatureFlags({ registry: registry(), overrides: { ...store, flagOverrides: () => ({ 'work.labs': { variant: 'on', reason: 'r', by: 'b', at: 'a' } }) }, log: quiet });
  assert.equal(reopened.getBooleanValue('work.labs', false, {}), true, 'overrides load from the store at start');
});

test('the browser gets only client flags, as values; Labs lists only Labs flags', () => {
  const flags = new FeatureFlags({ registry: registry(), log: quiet });
  assert.deepEqual(flags.clientValues({ targetingKey: 'x', labs: ['work.labs'] }), { 'work.labs': true, 'work.colour': flags.getStringValue('work.colour', 'ink', { targetingKey: 'x' }), 'work.broken': false });
  assert.deepEqual(flags.labs({}).map(entry => entry.key), ['work.labs']);
});

test('a deployment document may change a known flag but not its metadata, and an unknown flag is reported and ignored', () => {
  const { document, unknown } = checkDocument({ flags: { 'work.labs': { defaultVariant: 'on' }, 'work.future': { state: 'ENABLED' } } }, registry());
  assert.deepEqual(unknown, ['work.future']);
  assert.deepEqual(document.flags, { 'work.labs': { defaultVariant: 'on' } });
  assert.throws(() => checkDocument({ flags: { 'work.labs': { metadata: {} } } }, registry()), /belongs to the code's registry/);
  assert.throws(() => checkDocument({ flags: { 'work.labs': { defaultVariant: 'maybe' } } }, registry()), /names no variant/);
  assert.throws(() => checkDocument({ flags: { 'work.labs': { targeting: 'yes' } } }, registry()), /JsonLogic object/);
  assert.equal(flagSettings({ file: 'flags.json' }, registry(), {}).file?.endsWith('flags.json'), true);
  assert.equal(flagSettings({}, registry(), { UNFOLD_FLAGS_FILE: '/etc/unfold-flags/flags.json' }).file, '/etc/unfold-flags/flags.json');
});

test('the registry rejects a release flag without a removal date and a key that is not area.feature-name', () => {
  assert.throws(() => checkRegistry({ flags: { 'work.x': { state: 'ENABLED', variants: { on: true }, defaultVariant: 'on', metadata: meta({ expires: undefined }) } } }), /expires is required for a release flag/);
  assert.throws(() => checkRegistry({ flags: { Work: { state: 'ENABLED', variants: { on: true }, defaultVariant: 'on', metadata: meta() } } }), /area.feature-name/);
  const shipped = loadRegistry();
  assert.equal(shipped.flags['work.flight-profile'].metadata.labs, true);
  assert.equal(shipped.flags['work.flight-profile'].defaultVariant, 'off', 'the flight profile ships off');
});

test('the watched flag file applies valid changes and keeps the last good rules when a change is invalid', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'unfold-flags-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'flags.json');
  await writeFile(file, JSON.stringify({ flags: { 'work.labs': { defaultVariant: 'on' } } }));
  const lines: string[] = [];
  const flags = new FeatureFlags({ registry: registry(), settings: { document: {}, file, unknown: [] }, log: line => lines.push(line) });
  assert.equal(flags.getBooleanValue('work.labs', false, {}), true);
  assert.equal(flags.list({}).find(entry => entry.key === 'work.labs')?.source, 'file');
  await writeFile(file, '{ not json');
  assert.equal(flags.reloadFile(), false);
  assert.equal(flags.getBooleanValue('work.labs', false, {}), true, 'the previous rules stay');
  assert.match(flags.fileStatus().error, /JSON/);
  assert.ok(lines.some(line => line.includes('flag.file_invalid')));
  await writeFile(file, JSON.stringify({ flags: { 'work.labs': { defaultVariant: 'off' } } }));
  assert.equal(flags.reloadFile(), true);
  assert.equal(flags.getBooleanValue('work.labs', true, {}), false);
  assert.equal(flags.fileStatus().error, '');
});

test('a flag past its removal date reads as expired', () => {
  const flags = new FeatureFlags({ registry: registry(), now: () => new Date('2027-02-01T00:00:00Z'), log: quiet });
  assert.equal(flags.expired('work.labs'), true);
  assert.equal(flags.expired('work.static'), false, 'an ops flag has no removal date');
});
