'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const floors = require('./release-floors.cjs');

const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/release-floor-cases.json'), 'utf8'));

function outcome(run) {
  try {
    run();
    return null;
  } catch (error) {
    return error.message;
  }
}

test('versions order by semantic-version precedence, prereleases below their release', () => {
  for (const [left, right, expected] of cases.order) {
    assert.equal(floors.compare(left, right), expected, `${left} vs ${right}`);
    assert.equal(floors.compare(right, left), 0 - expected, `${right} vs ${left}`);
  }
});

test('malformed versions are rejected instead of ordered', () => {
  for (const version of cases.malformed) {
    assert.equal(floors.parse(version), null, version);
    assert.throws(() => floors.compare(version, '0.4.0'), /Not a semantic version/);
  }
});

test('a component version must clear its floor, its withdrawn versions and every tag that carried it', () => {
  for (const { component, version, tags, refused } of cases.decisions) {
    const message = outcome(() => floors.refuseOccupied(component, version, { floors: cases.floors, tags }));
    if (refused === null) assert.equal(message, null, `${component} ${version} should be accepted`);
    else assert.ok(message?.includes(refused), `${component} ${version} with ${tags}: ${message}`);
  }
});

test('a train version must clear the floors of every component it versions', () => {
  for (const { train, version, tags, refused } of cases.trains) {
    const message = outcome(() => floors.refuseOccupiedTrain(train, version, { floors: cases.floors, tags }));
    if (refused === null) assert.equal(message, null, `${train} ${version} should be accepted`);
    else assert.ok(message?.includes(refused), `${train} ${version}: ${message}`);
  }
});

test('the recorded floors cover every published Ploeg and Vloer version from the 2026-10-03 audit', () => {
  const recorded = floors.load();
  assert.equal(recorded.evidence, 'docs/research/2026-10-03-release-floors-and-identity.md');
  assert.ok(fs.existsSync(path.join(__dirname, '..', recorded.evidence)));
  for (const component of ['ploeg', 'vloer']) {
    assert.ok(floors.compare(recorded.components[component].floor, '0.4.0-rc.34') >= 0, component);
    for (const published of ['0.4.0-rc.34', '0.4.0-rc.32', '0.4.0-rc.1', '0.3.0-rc.16', '0.2.0']) {
      assert.throws(() => floors.refuseOccupied(component, published, { floors: recorded }), /at or below its release floor/, `${component} ${published}`);
    }
  }
  assert.throws(() => floors.refuseOccupied('ploeg', '1.0.0-rc.1', { floors: recorded }), /already occupied/);
  assert.deepEqual(recorded.trains.unfold.components, ['ploeg', 'vloer']);
  assert.equal(recorded.trains.unfold.tag_prefix, 'unfold-v');
});

test('a floor record that lists an occupied version at or below its floor is refused', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'unfold-floors-'));
  try {
    const file = path.join(directory, 'floors.json');
    const broken = structuredClone(cases.floors);
    broken.components.ploeg.occupied_above_floor = { '0.4.0-rc.1': 'below the floor' };
    fs.writeFileSync(file, JSON.stringify(broken));
    assert.throws(() => floors.load(file), /as occupied above its floor/);
    broken.components.ploeg.occupied_above_floor = {};
    broken.trains.unfold.components = ['ploeg', 'site'];
    fs.writeFileSync(file, JSON.stringify(broken));
    assert.throws(() => floors.load(file), /known components/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
