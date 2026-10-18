import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activities, activityMeta, activityOf, activityRules, activityTime, moveActivities, shellSegments } from '../public/core/activity.js';
import { liveModel, movesOf } from '../public/live/model.js';
import { activitySummary, traceLanes } from '../public/live/trace.js';
import { scenarios } from '../public/live/fixtures.js';

const shell = input => activityOf({ kind: 'execute', input }).activity;

test('a shell command is placed by what it does, not by the harness running it in a shell', () => {
  const cases = {
    orient: [
      'cat /mnt/ci-shared/vik-1/AGENTS.md 2>/dev/null | head -100',
      'cat "$PLOEG_BOARD_FILE"',
      'echo "KNOWLEDGE_DIR=$PLOEG_KNOWLEDGE_DIR"; ls -la "$PLOEG_KNOWLEDGE_DIR" 2>/dev/null',
      'cd "$PLOEG_KNOWLEDGE_DIR/notes" && for f in *.md; do cat "$f"; done',
    ],
    explore: [
      'cd /work && pwd && ls -la && git branch --show-current && git log --oneline -5',
      'sed -n \'90,150p\' apps/unfold/public/core/progress.js',
      'grep -rn "failure" src | head -20',
      'git --no-pager diff main...agent/vik-1 && git remote -v',
      'tr -d \'\\r\' < notes.txt | grep -E "^x" | head -20',
      'echo "mutants: $(grep -c \'^spawn \' scripts/mutation.sh)"',
      'git tag | tail -5',
      'curl -s -o /dev/null -w "%{http_code}" https://example.test',
    ],
    change: [
      'sed -i \'s/old/new/\' src/engine.ts',
      'cat > src/notes.md <<\'EOF\'\nline > with a bracket\nEOF',
      'git checkout -- src/engine.ts',
      'python3 - <<\'PY\'\nopen("src/a.ts", "w").write("x")\nPY',
      'printf "x" >> docs/index.md',
    ],
    verify: [
      'sh "$PLOEG_VERIFY_SCRIPT"; echo "EXIT=$?"',
      'mise run verify',
      'mise exec -- npm test',
      'npm run typecheck',
      'go test ./...',
      'time python3 -W ignore scripts/test_distill.py 2>&1 | tail -5',
      'bash scripts/test-mutation.sh > /tmp/mut.log 2>&1',
      'npx tsc --noEmit',
      'node --test test/activity.test.mjs',
    ],
    ship: [
      'git add -- docs/observability.md && git commit -m "docs: link"',
      'git push -u origin agent/vik-1 2>&1 | tail -15',
      'cat > "$PLOEG_OUTCOME_FILE" <<\'EOF\'\n{"problem": "x"}\nEOF',
      'cat > /tmp/pr_body.md <<\'EOF\'\n## Problem\nEOF',
      'python3 - <<\'PY\'\nimport urllib.request\nreq = urllib.request.Request(url, data=body, method="POST")\nPY',
    ],
    setup: ['mise install', 'npm ci', 'git fetch origin main && git checkout -b agent/vik-1 origin/main', 'apt-get install -y jq', 'git rebase origin/main'],
    wait: ['sleep 60; tail -20 /tmp/run.log'],
    other: ['C-c', 'python3 /tmp/profile.py', './bin/thing --flag'],
  };
  for (const [expected, inputs] of Object.entries(cases)) for (const input of inputs) assert.equal(shell(input), expected, input);
});

test('a chained command takes its strongest Activity and remembers every one it touched', () => {
  const placed = activityOf({ kind: 'execute', input: 'grep -n x src/a.ts && sed -i "s/x/y/" src/a.ts && npm test' });
  assert.deepEqual([placed.activity, placed.touched, placed.rule], ['change', ['explore', 'change', 'verify'], 'sed -i']);
});

test('ACP tool kinds that already say what they do are trusted, with instructions, outcome and scratch files told apart', () => {
  assert.equal(activityOf({ kind: 'edit', paths: ['/w/src/a.ts'] }).activity, 'change');
  assert.equal(activityOf({ kind: 'edit', paths: ['/mnt/run-1/outcome-ploeg-0af5.json'] }).activity, 'ship');
  assert.equal(activityOf({ kind: 'edit', paths: ['/tmp/profile.py'] }).activity, 'other');
  assert.equal(activityOf({ kind: 'read', paths: ['/w/AGENTS.md'] }).activity, 'orient');
  assert.equal(activityOf({ kind: 'search', input: 'failure' }).activity, 'explore');
  assert.equal(activityOf({ kind: 'other', input: '{"name":"ploeg-verify-before-handoff","kind":"InvokeSkillAction"}' }).activity, 'orient');
  assert.equal(activityOf({ kind: 'think' }).activity, 'other');
});

test('quotes, pipes and here-documents do not split or mislead a command', () => {
  assert.deepEqual(shellSegments('echo "a && b" | grep a; ls').map(segment => [segment.text, segment.piped]), [['echo "a && b"', false], ['grep a', true], ['ls', false]]);
  assert.equal(shellSegments('python3 - <<\'PY\'\nprint(1)\nprint(2)\nPY\nls').length, 2);
  assert.equal(shell('env | sed \'s/=.*/=<set>/\' | head -20'), 'explore', 'a > inside quotes is not a redirect');
});

test('every Activity has a label, and an unknown key reads as Other', () => {
  assert.deepEqual(activities.map(entry => entry.key), ['orient', 'explore', 'change', 'verify', 'ship', 'setup', 'wait', 'other']);
  assert.equal(activityMeta('nonsense').label, 'Other');
});

test('a short interruption stays in the move around it, a long one starts its own', () => {
  const at = seconds => seconds * 1000;
  const calls = ['explore', 'explore', 'orient', 'explore', 'change', 'change', 'explore', 'explore', 'explore', 'change'].map((activity, index) => ({ activity, at: at(index * 10) }));
  assert.deepEqual(moveActivities(calls), ['explore', 'explore', 'explore', 'explore', 'change', 'change', 'explore', 'explore', 'explore', 'change']);
  const slow = [{ activity: 'explore', at: 0 }, { activity: 'orient', at: 1000 }, { activity: 'orient', at: (activityRules.absorbSeconds + 5) * 1000 }, { activity: 'explore', at: 200000 }];
  assert.deepEqual(moveActivities(slow), ['explore', 'orient', 'orient', 'explore']);
});

test('time before a call counts for that call, the harness start counts for none, the rest for the last call', () => {
  const split = activityTime([{ activity: 'orient', at: 60000 }, { activity: 'explore', at: 120000 }, { activity: 'change', at: 300000 }], 360000);
  assert.deepEqual([split.seconds.orient, split.seconds.explore, split.seconds.change, split.firstChangeAt], [0, 60, 240, 300000]);
});

test('moves split where the Activity changes and the summary leads with where the time went', () => {
  const at = seconds => new Date(1_760_000_000_000 + seconds * 1000).toISOString();
  const tool = (seconds, input, extra = {}) => ({ type: 'tool', id: `c${seconds}`, at: at(seconds), title: input, toolKind: 'execute', status: 'completed', input, paths: [], ...extra });
  const moves = movesOf([
    { type: 'stage', at: at(0), text: 'Agent session started' },
    tool(1, 'cat AGENTS.md'), tool(20, 'grep -rn x src'), tool(40, 'sed -n 1,20p src/a.ts'), tool(60, 'rg y'),
    tool(90, 'x', { toolKind: 'edit', paths: ['/w/src/a.ts'] }), tool(100, 'npm test'), tool(130, 'git push'),
  ], { now: 1_760_000_000_000 + 200000, live: true });
  assert.deepEqual(moves.map(move => [move.activity, move.calls.length, move.named]), [['orient', 1, true], ['explore', 3, false], ['change', 1, false], ['verify', 1, false], ['ship', 1, false]]);
  assert.deepEqual(moves[1].calls.map(call => call.rule), ['grep', 'sed read', 'rg']);
});

test('the live model and the trace speak in Activities for every scenario', () => {
  for (const [name, scenario] of Object.entries(scenarios)) {
    const model = liveModel(scenario.input());
    if (!model.activity) continue;
    const summary = activitySummary(model);
    assert.match(summary, /\d+ calls?$/, name);
    const svg = traceLanes(model, { scope: 'run' });
    for (const key of ['Orient', 'Explore', 'Change', 'Verify', 'Ship']) assert.match(svg, new RegExp(`>${key}<`), `${name} draws the ${key} lane`);
    assert.doesNotMatch(svg, />Shell</, `${name} no longer names the mechanism as a lane`);
  }
});
