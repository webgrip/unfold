import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkDocument, checkRegistry, FeatureFlags, flagSettings, fractionalBucket, loadRegistry, murmur3, type FlagOverride, type FlagRegistry, type FlagStore } from '../src/flags.ts';
import type { RolloutSpec, Segment } from '../src/flag-rollouts.ts';

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

function memoryStore(): FlagStore & { saved: Record<string, FlagOverride> } {
  const saved: Record<string, FlagOverride> = {};
  const rollouts: Record<string, RolloutSpec> = {};
  const segments: Record<string, Segment> = {};
  return {
    saved,
    flagOverrides: () => ({ ...saved }),
    setFlagOverride: (key, override) => { if (override) saved[key] = override; else delete saved[key]; },
    flagRollouts: () => ({ ...rollouts }),
    setFlagRollout: (key, spec) => { if (spec) rollouts[key] = spec; else delete rollouts[key]; },
    flagSegments: () => ({ ...segments }),
    setFlagSegment: (name, segment) => { if (segment) segments[name] = segment; else delete segments[name]; },
  };
}

test('murmur3 matches the published MurmurHash3 x86 32-bit vectors, and buckets follow flagd\'s integer arithmetic', () => {
  assert.equal(murmur3(''), 0);
  assert.equal(murmur3('hello'), 613153351);
  assert.equal(murmur3('The quick brown fox jumps over the lazy dog'), 776992547);
  assert.equal(fractionalBucket('hello', 100), Math.floor(613153351 * 100 / 2 ** 32));
  assert.equal(fractionalBucket('The quick brown fox jumps over the lazy dog', 2147483647), Number((776992547n * 2147483647n) >> 32n));
});

test('a flag without targeting resolves its default variant as STATIC, and an unknown flag falls back with FLAG_NOT_FOUND', async () => {
  const flags = new FeatureFlags({ registry: registry(), log: quiet });
  assert.deepEqual(await flags.getBooleanDetails('work.static', false, {}), { flagKey: 'work.static', value: true, variant: 'on', reason: 'STATIC', flagMetadata: { provider: 'flagd', source: 'code', kind: 'ops' } });
  const missing = await flags.getBooleanDetails('work.nothing', true, {});
  assert.equal(missing.value, true);
  assert.equal(missing.errorCode, 'FLAG_NOT_FOUND');
});

test('the shared labs evaluator turns a flag on for a person who opted in, off for one who opted out, and leaves the default otherwise', async () => {
  const flags = new FeatureFlags({ registry: registry(), log: quiet });
  assert.equal((await flags.getBooleanDetails('work.labs', false, { targetingKey: 'a' })).reason, 'DEFAULT');
  assert.equal(await flags.getBooleanValue('work.labs', false, { targetingKey: 'b', labs: ['work.labs'] }), true);
  const rolledOut = new FeatureFlags({ registry: registry(), settings: { document: { flags: { 'work.labs': { defaultVariant: 'on' } } }, unknown: [] }, log: quiet });
  assert.equal(await rolledOut.getBooleanValue('work.labs', false, { targetingKey: 'c' }), true, 'a deployment rolls it out to everyone');
  assert.equal(await rolledOut.getBooleanValue('work.labs', true, { targetingKey: 'c', labsOff: ['work.labs'] }), false, 'and a person can still opt out');
});

test('fractional rollouts are deterministic per person, split by weight, and fall back to the default without a targeting key', async () => {
  const flags = new FeatureFlags({ registry: registry(), log: quiet });
  const first = await flags.getStringDetails('work.colour', 'ink', { targetingKey: 'person-7' });
  assert.equal(first.reason, 'SPLIT');
  assert.equal(await flags.getStringValue('work.colour', 'ink', { targetingKey: 'person-7' }), first.value);
  let baken = 0;
  for (let i = 0; i < 2000; i++) if (await flags.getStringValue('work.colour', 'ink', { targetingKey: `person-${i}` }) === 'baken') baken++;
  assert.ok(baken > 900 && baken < 1100, `about half get baken, got ${baken}`);
  assert.deepEqual(await flags.getStringDetails('work.colour', 'ink', {}).then(details => [details.value, details.reason]), ['ink', 'DEFAULT'], 'flagd returns no bucket without a targeting key');
  const weighted = new FeatureFlags({ registry: registry(), settings: { document: { flags: { 'work.colour': { targeting: { fractional: [['ink', 1], ['baken', 1_000_000]] } } } }, unknown: [] }, log: quiet });
  let ink = 0;
  for (let i = 0; i < 500; i++) if (await weighted.getStringValue('work.colour', 'x', { targetingKey: `p${i}` }) === 'ink') ink++;
  assert.ok(ink <= 2, 'relative weights: one in a million');
  const fractionalWeight = new FeatureFlags({ registry: registry(), settings: { document: { flags: { 'work.colour': { targeting: { fractional: [['ink', 0.5], ['baken', 0.5]] } } } }, unknown: [] }, log: quiet });
  assert.equal((await fractionalWeight.getStringDetails('work.colour', 'x', { targetingKey: 'p' })).errorCode, 'PARSE_ERROR', 'flagd rejects weights that are not whole numbers');
});

test('a time-based ramp written with $flagd.timestamp weights moves the share as the clock moves', async () => {
  const start = Date.parse('2026-10-01T00:00:00Z') / 1000;
  const end = Date.parse('2026-10-11T00:00:00Z') / 1000;
  const document = { flags: { 'work.colour': { targeting: { fractional: [['baken', { '-': [{ var: '$flagd.timestamp' }, start] }], ['ink', { '-': [end, { var: '$flagd.timestamp' }] }]] } } } };
  const share = async (iso: string) => {
    const flags = new FeatureFlags({ registry: registry(), settings: { document, unknown: [] }, now: () => new Date(iso), log: quiet });
    let baken = 0;
    for (let i = 0; i < 1000; i++) if (await flags.getStringValue('work.colour', 'x', { targetingKey: `p${i}` }) === 'baken') baken++;
    return baken / 1000;
  };
  assert.ok(Math.abs(await share('2026-10-02T00:00:00Z') - 0.1) < 0.05);
  assert.ok(Math.abs(await share('2026-10-09T00:00:00Z') - 0.8) < 0.05);
});

test('sem_ver, some, arithmetic, type mismatches and parse errors resolve the way OpenFeature describes', async () => {
  const flags = new FeatureFlags({ registry: registry(), settings: { document: { flags: { 'work.static': { targeting: { if: [{ some: [{ var: 'teams' }, { in: [{ var: '' }, ['bronze']] }] }, 'off', { '>': [{ '*': [{ var: 'size' }, 2] }, 10] }, 'off', null] } } } }, unknown: [] }, log: quiet });
  assert.equal(await flags.getNumberValue('work.limit', 0, { version: 'v0.4.0-rc.73' }), 3, 'a pre-release sorts before its release');
  assert.equal(await flags.getNumberValue('work.limit', 0, { version: '0.5.1' }), 10);
  assert.equal(await flags.getBooleanValue('work.static', true, { teams: ['silver', 'bronze'] }), false);
  assert.equal(await flags.getBooleanValue('work.static', true, { size: 6 }), false);
  assert.equal(await flags.getBooleanValue('work.static', false, { teams: ['silver'], size: 2 }), true);
  const mismatch = await flags.getBooleanDetails('work.limit', false, { version: '0.5.1' });
  assert.deepEqual([mismatch.value, mismatch.reason, mismatch.errorCode], [false, 'ERROR', 'TYPE_MISMATCH']);
  const lines: string[] = [];
  const logged = new FeatureFlags({ registry: registry(), log: line => lines.push(line) });
  const broken = await logged.getBooleanDetails('work.broken', true, {});
  await logged.getBooleanDetails('work.broken', true, {});
  assert.deepEqual([broken.value, broken.errorCode], [true, 'PARSE_ERROR']);
  assert.equal(lines.filter(line => line.includes('flag.evaluation_failed')).length, 1, 'a broken rule is logged once');
});

test('a disabled flag returns the caller default with reason DISABLED', async () => {
  const flags = new FeatureFlags({ registry: registry(), settings: { document: { flags: { 'work.static': { state: 'DISABLED' } } }, unknown: [] }, log: quiet });
  assert.deepEqual(await flags.getBooleanDetails('work.static', false, {}).then(details => [details.value, details.reason]), [false, 'DISABLED']);
});

test('an administrator override beats every rule and every provider, persists through its store and is counted per variant', async () => {
  const store = memoryStore();
  const flags = new FeatureFlags({ registry: registry(), store, now: () => new Date('2026-10-13T12:00:00Z'), log: quiet });
  flags.setOverride('work.labs', 'on', 'Ryan', 'Demo for the team');
  assert.deepEqual(store.saved['work.labs'], { variant: 'on', reason: 'Demo for the team', by: 'Ryan', at: '2026-10-13T12:00:00.000Z' });
  const forced = await flags.getBooleanDetails('work.labs', false, { labsOff: ['work.labs'] });
  assert.deepEqual([forced.value, forced.flagMetadata.source], [true, 'override']);
  assert.throws(() => flags.setOverride('work.labs', 'maybe', 'Ryan', 'x'), /Choose one of on, off/);
  flags.setOverride('work.labs', null, 'Ryan', '');
  assert.equal(await flags.getBooleanValue('work.labs', false, {}), false);
  assert.deepEqual(flags.counter.of('work.labs'), { on: 1, off: 1 });
});

test('an authored rollout compiles to flagd: a percentage of a segment, a scheduled window and a prerequisite, with Labs choices first', async () => {
  const store = memoryStore();
  let now = new Date('2026-10-13T12:00:00Z');
  const flags = new FeatureFlags({ registry: registry(), store, now: () => now, log: quiet });
  flags.setSegment('agency-staff', { description: 'People at the agency', audience: { roles: ['admin', 'operator'] } }, 'Ryan');
  flags.setRollout('work.labs', { defaultVariant: 'off', rules: [
    { id: 'beta', audience: { segment: 'agency-staff' }, serve: { kind: 'split', weights: { on: 2500, off: 7500 } } },
    { id: 'launch', audience: {}, window: { start: '2026-11-01T00:00:00Z' }, serve: { kind: 'variant', variant: 'on' } },
  ] }, 'Ryan', 'Quarter of the staff first');
  let on = 0;
  for (let i = 0; i < 1000; i++) if (await flags.getBooleanValue('work.labs', false, { targetingKey: `u${i}`, role: 'operator' })) on++;
  assert.ok(on > 200 && on < 300, `about a quarter of the staff, got ${on}`);
  assert.equal(await flags.getBooleanValue('work.labs', true, { targetingKey: 'u1', role: 'viewer' }), false, 'outside the segment, before the launch window');
  assert.equal(await flags.getBooleanValue('work.labs', false, { targetingKey: 'u1', role: 'viewer', labs: ['work.labs'] }), true, 'a Labs opt-in still wins');
  now = new Date('2026-11-02T00:00:00Z');
  assert.equal(await flags.getBooleanValue('work.labs', false, { targetingKey: 'u1', role: 'viewer' }), true, 'the scheduled window opened');
  assert.equal((await flags.list({})).find(view => view.key === 'work.labs')?.source, 'console');
  assert.deepEqual(Object.keys(flags.exportDocument().flags), ['work.labs']);
  assert.ok(JSON.stringify(flags.exportDocument()).includes('fractional'), 'the export is plain flagd');
  assert.doesNotMatch(JSON.stringify(flags.exportDocument()), /\$ref|agency-staff/, 'segments are inlined');
  assert.throws(() => flags.setSegment('agency-staff', null, 'Ryan'), /used by work.labs/);

  flags.setRollout('work.static', { defaultVariant: 'off', rules: [{ id: 'dep', audience: { prerequisite: { flag: 'work.labs', variants: ['on'] } }, serve: { kind: 'variant', variant: 'on' } }] }, 'Ryan', 'Only with the Labs flag');
  assert.equal(await flags.getBooleanValue('work.static', false, { targetingKey: 'u1', role: 'viewer' }), true, 'the prerequisite is on after the window');
  now = new Date('2026-10-13T12:00:00Z');
  assert.equal(await flags.getBooleanValue('work.static', true, { targetingKey: 'u1', role: 'viewer' }), false, 'and off before it');
  assert.throws(() => flags.setRollout('work.static', { defaultVariant: 'off', rules: [{ audience: {}, serve: { kind: 'split', weights: { on: 10, off: 10 } } }] }, 'Ryan', 'x'), /add up to 10000/);
  assert.throws(() => flags.setRollout('work.static', { defaultVariant: 'off', rules: [{ audience: { segment: 'nobody' }, serve: { kind: 'variant', variant: 'on' } }] }, 'Ryan', 'x'), /names no segment/);
  flags.setRollout('work.static', null, 'Ryan', '');
  assert.equal(await flags.getBooleanValue('work.static', false, {}), true, 'clearing the rollout restores the Git rule');
});

test('a ramp moves from one share to another in twenty steps over its window', async () => {
  let now = new Date('2026-09-30T00:00:00Z');
  const flags = new FeatureFlags({ registry: registry(), store: memoryStore(), now: () => now, log: quiet });
  flags.setRollout('work.colour', { defaultVariant: 'ink', rules: [{ audience: {}, serve: { kind: 'ramp', variant: 'baken', otherwise: 'ink', from: 0, to: 10000, start: '2026-10-01T00:00:00Z', end: '2026-10-21T00:00:00Z' } }] }, 'Ryan', 'Ramp');
  const share = async () => { let baken = 0; for (let i = 0; i < 1000; i++) if (await flags.getStringValue('work.colour', 'x', { targetingKey: `p${i}` }) === 'baken') baken++; return baken / 1000; };
  assert.equal(await share(), 0, 'before the ramp');
  now = new Date('2026-10-11T00:00:00Z');
  assert.ok(Math.abs(await share() - 0.5) < 0.06, 'half way');
  now = new Date('2026-10-22T00:00:00Z');
  assert.equal(await share(), 1, 'after the ramp everyone');
});

test('with flags.console false the rollouts are Git-only', async () => {
  const flags = new FeatureFlags({ registry: registry(), store: memoryStore(), settings: { document: {}, unknown: [], console: false }, log: quiet });
  assert.throws(() => flags.setRollout('work.labs', { defaultVariant: 'on', rules: [] }, 'Ryan', 'x'), /managed in Git/);
});

test('the browser gets only client flags, as values; Labs lists only Labs flags', async () => {
  const flags = new FeatureFlags({ registry: registry(), log: quiet });
  assert.deepEqual(await flags.clientValues({ targetingKey: 'x', labs: ['work.labs'] }), { 'work.labs': true, 'work.colour': await flags.getStringValue('work.colour', 'ink', { targetingKey: 'x' }), 'work.broken': false });
  assert.deepEqual((await flags.labs({})).map(entry => entry.key), ['work.labs']);
});

test('a deployment document may change a known flag but not its metadata, and an unknown flag is reported and ignored', () => {
  const { document, unknown } = checkDocument({ flags: { 'work.labs': { defaultVariant: 'on' }, 'work.future': { state: 'ENABLED' } } }, registry());
  assert.deepEqual(unknown, ['work.future']);
  assert.deepEqual(document.flags, { 'work.labs': { defaultVariant: 'on' } });
  assert.throws(() => checkDocument({ flags: { 'work.labs': { metadata: {} } } }, registry()), /belongs to the code's registry/);
  assert.throws(() => checkDocument({ flags: { 'work.labs': { defaultVariant: 'maybe' } } }, registry()), /names no variant/);
  assert.equal(flagSettings({ file: 'flags.json' }, registry(), {}).file?.endsWith('flags.json'), true);
  assert.equal(flagSettings({}, registry(), { UNFOLD_FLAGS_FILE: '/etc/unfold-flags/flags.json' }).file, '/etc/unfold-flags/flags.json');
  const providers = flagSettings({ providers: [{ kind: 'ofrep', name: 'flipt', url: 'https://flags.example/', apiKeyEnv: 'FLIPT_KEY' }], strategy: 'first-successful' }, registry(), {});
  assert.deepEqual(providers.providers, [{ kind: 'ofrep', name: 'flipt', url: 'https://flags.example', apiKeyEnv: 'FLIPT_KEY', timeoutMs: 10000, cacheMs: 30000 }, { kind: 'flagd' }], 'the in-process evaluator is always the last fallback');
  assert.throws(() => flagSettings({ providers: [{ kind: 'ofrep', url: 'https://user:pw@flags.example' }] }, registry(), {}), /without credentials/);
});

test('the registry rejects a release flag without a removal date and a key that is not area.feature-name', () => {
  assert.throws(() => checkRegistry({ flags: { 'work.x': { state: 'ENABLED', variants: { on: true }, defaultVariant: 'on', metadata: meta({ expires: undefined }) } } }), /expires is required for a release flag/);
  assert.throws(() => checkRegistry({ flags: { Work: { state: 'ENABLED', variants: { on: true }, defaultVariant: 'on', metadata: meta() } } }), /area.feature-name/);
  const shipped = loadRegistry();
  assert.equal(shipped.flags['work.live-view'].defaultVariant, 'off', 'the live view ships off');
});

test('the watched flag file applies valid changes and keeps the last good rules when a change is invalid', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'unfold-flags-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'flags.json');
  await writeFile(file, JSON.stringify({ flags: { 'work.labs': { defaultVariant: 'on' } } }));
  const lines: string[] = [];
  const flags = new FeatureFlags({ registry: registry(), settings: { document: {}, file, unknown: [] }, log: line => lines.push(line) });
  assert.equal(await flags.getBooleanValue('work.labs', false, {}), true);
  await writeFile(file, '{ not json');
  assert.equal(flags.reloadFile(), false);
  assert.equal(await flags.getBooleanValue('work.labs', false, {}), true, 'the previous rules stay');
  assert.match(flags.fileStatus().error, /JSON/);
  assert.ok(lines.some(line => line.includes('flag.file_invalid')));
});

test('a flag past its removal date reads as expired, and one that served a single variant fifty times reads as settled', async () => {
  const flags = new FeatureFlags({ registry: registry(), now: () => new Date('2027-02-01T00:00:00Z'), log: quiet });
  assert.equal(flags.expired('work.labs'), true);
  assert.equal(flags.expired('work.static'), false, 'an ops flag has no removal date');
  for (let i = 0; i < 50; i++) await flags.getBooleanValue('work.static', false, {});
  assert.equal((await flags.list({})).find(view => view.key === 'work.static')?.settled, 'on');
});

test('mutually exclusive Labs flags name each other, and the registry refuses a one-sided, unknown or non-Labs exclusion', () => {
  const flag = (extra: Record<string, unknown>) => ({ state: 'ENABLED', variants: { on: true, off: false }, defaultVariant: 'off', metadata: meta(extra) });
  const pair = checkRegistry({ flags: { 'work.a': flag({ excludes: ['work.b'] }), 'work.b': flag({ excludes: ['work.a'] }) } });
  assert.deepEqual(pair.flags['work.a'].metadata.excludes, ['work.b']);
  assert.throws(() => checkRegistry({ flags: { 'work.a': flag({ excludes: ['work.b'] }), 'work.b': flag({}) } }), /exclusion is mutual/);
  assert.throws(() => checkRegistry({ flags: { 'work.a': flag({ excludes: ['work.gone'] }) } }), /not another registered flag/);
  assert.throws(() => checkRegistry({ flags: { 'work.a': flag({ excludes: ['work.a'] }) } }), /not another registered flag/);
  assert.throws(() => checkRegistry({ flags: { 'work.a': flag({ excludes: ['work.b'] }), 'work.b': flag({ labs: false, excludes: ['work.a'] }) } }), /both must be Labs flags/);
  assert.throws(() => checkRegistry({ flags: { 'work.a': flag({ excludes: 'work.b' }) } }), /must list flag keys/);
  const shipped = loadRegistry();
  assert.deepEqual([shipped.flags['work.layouts'].metadata.excludes, shipped.flags['work.live-view'].metadata.excludes], [['work.live-view'], ['work.layouts']]);
});
