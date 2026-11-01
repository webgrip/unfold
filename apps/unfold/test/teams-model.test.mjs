import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agentForm, agentIssues, agentPreview, anyRecord, assignMarkup, copyTeam, currentRecord, demoRoster, fit, gateVerdict, newAgent, newTeam, ranked, recordTable, repositoryAccess, repositoryOf, saveVersion, teamBlocks, teamDetail, teamEstimate, teamLine, teamListMarkup, rosterMarkup, verdictMarkup } from '../public/teams.js';

const roster = () => demoRoster();
const team = (name, { agents, teams } = roster()) => ({ team: teams.find(entry => entry.name === name), agents, teams });
const card = (overrides = {}) => ({ reference: 'CU-8w2k', title: 'Add a status', brief: 'Add it.', repository: 'webgrip/unfold', team: '', size: 's', assigned: false, ...overrides });

test('an agent can enter a repository unless the harness or the forge forbids it, each with its reason', () => {
  const openhands = { harness: 'openhands', model: 'haiku' };
  const opencode = { harness: 'opencode', model: 'haiku' };
  assert.deepEqual(repositoryAccess(openhands, repositoryOf('webgrip/unfold')), { ok: false, why: 'OpenHands refuses a repository that ships .openhands/hooks.json' });
  assert.equal(repositoryAccess(openhands, repositoryOf('webgrip/erfbeeld')).ok, true);
  assert.equal(repositoryAccess(opencode, repositoryOf('webgrip/unfold')).ok, true);
  assert.deepEqual(repositoryAccess(opencode, repositoryOf('webgrip/seekframe')), { ok: false, why: 'the homelab executor reaches Forgejo repositories only' });
});

test('the builder blocks a harness that cannot run the model and warns about a budget, a push without AGit and dispatch without create', () => {
  const blocked = { ...newAgent(), harness: 'claude-code', model: 'qwen' };
  assert.deepEqual(agentIssues(blocked).map(issue => issue.kind), ['block']);
  assert.match(agentIssues(blocked)[0].text, /Claude Code runs Claude models only/);
  const thin = { ...newAgent(), model: 'opus', budget: 1, skills: [], permissions: ['push', 'dispatch'] };
  const kinds = agentIssues(thin);
  assert.deepEqual(kinds.map(issue => issue.kind), ['warn', 'warn', 'warn']);
  assert.match(kinds[0].text, /below 1.5 times a typical Run on Claude Opus 5.5/);
  assert.match(kinds[1].text, /Create follow-up work/);
  assert.match(kinds[2].text, /opens no pull request/);
  assert.deepEqual(agentIssues({ ...newAgent(), permissions: [] }).map(issue => issue.text), ['This agent can neither push nor comment, so nobody sees its work.']);
  assert.deepEqual(agentIssues(newAgent()), []);
});

test('a Team estimate adds each filled position at its agent\'s typical Run, scaled by size, with review rounds from the record', () => {
  const { team: zwaluw, agents } = team('Zwaluw');
  const medium = teamEstimate(zwaluw, agents);
  assert.deepEqual(medium.parts.map(part => part.position), ['Build', 'Review', 'Fix']);
  assert.ok(Math.abs(medium.total - (0.12 * 1.3 + 0 + 0.12 * 0.3)) < 1e-9, `medium estimate ${medium.total}`);
  assert.ok(Math.abs(teamEstimate(zwaluw, agents, { size: 'l', rounds: 2 }).total - (0.12 * 1.3 + 0.12 * 1) * 2.1) < 1e-9);
  assert.deepEqual(teamEstimate(newTeam('tm-x'), agents), { total: 0, parts: [] });
});

test('the fit of a Team to a card is blocked by an unfilled position, an unlisted repository, a harness that cannot enter or too little headroom, and asks without a record', () => {
  const { team: zwaluw, agents, teams } = team('Zwaluw');
  const ok = fit(zwaluw, agents, card());
  assert.equal(ok.status, 'ok');
  assert.equal(ok.record.merged, 14);
  const homelab = fit(zwaluw, agents, card({ repository: 'webgrip/homelab-cluster' }));
  assert.equal(homelab.status, 'ok');
  const { team: erf } = team('Erf', { agents, teams });
  const erfOnUnfold = fit(erf, agents, card());
  assert.equal(erfOnUnfold.status, 'blocked');
  assert.deepEqual(erfOnUnfold.reasons, ['Erf does not list webgrip/unfold', 'Build (Erf handen): OpenHands refuses a repository that ships .openhands/hooks.json']);
  const broke = fit({ ...zwaluw, spent: 14.99 }, agents, card({ size: 'l' }));
  assert.equal(broke.status, 'blocked');
  assert.match(broke.reasons[0], /weekly headroom of <\sUS\$\s0,01 is below the estimate of US\$\s0,40/);
  const fresh = fit({ ...zwaluw, repositories: [...zwaluw.repositories, 'webgrip/erfbeeld'] }, agents, card({ repository: 'webgrip/erfbeeld' }));
  assert.equal(fresh.status, 'ask');
  assert.match(fresh.reasons[0], /no record on this repository yet/);
  const empty = fit(newTeam('tm-x'), agents, card());
  assert.equal(empty.status, 'blocked');
  assert.equal(empty.reasons[0], 'the Build and Review positions must both be filled');
  assert.deepEqual(teamBlocks(erf, 'webgrip/seekframe', agents).length, 2);
});

test('Teams that fit a card rank by their record on like work, best first, and leave out the blocked ones', () => {
  const { agents, teams } = roster();
  const order = ranked(teams, agents, card());
  assert.deepEqual(order.map(entry => entry.team.name), ['Steenbok', 'Zwaluw']);
  assert.deepEqual(ranked(teams, agents, card({ repository: 'webgrip/erfbeeld' })).map(entry => entry.team.name), ['Erf']);
  assert.deepEqual(ranked(teams, agents, card(), { except: 'tm-steenbok' }).map(entry => entry.team.name), ['Zwaluw']);
});

test('the gate says starting with an estimate, asks without a record, refuses with the reasons and the Teams that fit, and ranks when the field is empty', () => {
  const { agents, teams } = roster();
  const starting = gateVerdict(teams, agents, card({ team: 'tm-zwaluw' }));
  assert.equal(starting.tone, 'success');
  assert.equal(starting.headline, 'Zwaluw v3 starts');
  assert.match(starting.lines[0], /^Estimate US\$\s0,12 on like work: 14 merged in webgrip\/unfold, 1\.3 review rounds, 0 reverts\.$/);
  assert.match(starting.lines[1], /Branch agent\/CU-8w2k/);
  const refused = gateVerdict(teams, agents, card({ team: 'tm-erf' }));
  assert.equal(refused.tone, 'danger');
  assert.equal(refused.headline, 'Erf cannot take this card');
  assert.deepEqual(refused.ranked.map(entry => entry.team.name), ['Steenbok', 'Zwaluw']);
  const empty = gateVerdict(teams, agents, card());
  assert.equal(empty.headline, 'Which Team?');
  assert.equal(empty.ranked.length, 2);
  assert.equal(empty.action, 'Set the field, or reply with a number.');
  const nobody = gateVerdict(teams, agents, card({ repository: 'webgrip/seekframe' }));
  assert.match(nobody.lines[0], /No Team fits webgrip\/seekframe; the card waits in Ready\./);
  const asking = gateVerdict([{ ...teams[0], repositories: ['webgrip/erfbeeld'] }], agents, card({ team: 'tm-zwaluw', repository: 'webgrip/erfbeeld' }));
  assert.equal(asking.tone, 'attention');
  assert.match(asking.action, /Reply go to start under the experiment budget \(US\$\s3,20 left\)/);
});

test('a save is a new version with an empty record, a copy keeps its lineage and counts an adoption, and the record reads per version', () => {
  const { team: zwaluw } = team('Zwaluw');
  const next = saveVersion(zwaluw, { charter: 'New charter', positions: { ...zwaluw.positions, plan: 'ag-haiku' } });
  assert.equal(next.version, 4);
  assert.equal(next.history.length, 4);
  assert.deepEqual(next.history.at(-1).record, {});
  assert.equal(next.history.at(-1).positions.plan, 'ag-haiku');
  assert.equal(currentRecord(next, 'webgrip/unfold'), null);
  assert.equal(anyRecord(next, 'webgrip/unfold').merged, 14);
  assert.equal(currentRecord(zwaluw, 'webgrip/unfold').merged, 14, 'the source is untouched');
  const { copy, source } = copyTeam(zwaluw, 'tm-copy', 'Noor');
  assert.deepEqual({ name: copy.name, version: copy.version, lineage: copy.lineage, owner: copy.owner, adopted: copy.adopted }, { name: 'Zwaluw (copy)', version: 1, lineage: 'Zwaluw v3', owner: 'Noor', adopted: 0 });
  assert.equal(source.adopted, 4);
  assert.equal(teamLine(copy), 'by Noor · from Zwaluw v3');
  assert.equal(teamLine(zwaluw), 'by Ryan · adopted by 3 people');
});

test('the markup escapes names, greys what cannot be chosen with its reason, and never writes an undefined', () => {
  const { agents, teams } = roster();
  const hostile = { ...newAgent(), name: '<b>x</b>', harness: 'claude-code', model: 'sonnet' };
  const form = agentForm(hostile);
  assert.ok(form.includes('&lt;b&gt;x&lt;/b&gt;'));
  assert.ok(form.includes('class="tb-option is-off"'), 'a model Claude Code cannot run is greyed');
  assert.ok(form.includes('Claude Code runs Claude models only'));
  const preview = agentPreview(hostile);
  assert.ok(preview.includes('the homelab executor reaches Forgejo repositories only'));
  assert.ok(preview.includes('Can enter'));
  for (const markup of [form, preview, rosterMarkup(agents, teams, { editing: 'ag-haiku' }), teamListMarkup(teams, { open: 'tm-zwaluw' }), teamDetail(teams[0], agents, { version: 2 }), recordTable(teams[0], 3), assignMarkup(teams, agents, card({ team: 'tm-erf' })), verdictMarkup(gateVerdict(teams, agents, card()))]) {
    assert.ok(!/undefined|NaN|\[object/.test(markup), 'markup leaks a value');
    assert.ok(!/ style="/.test(markup), 'markup carries an inline style the CSP forbids');
  }
  const detail = teamDetail(teams[0], agents, { version: 2 });
  assert.ok(detail.includes('Deltas are against v1.'));
  assert.ok(detail.includes('data-tone="success"'), 'a lower cost per merged reads as an improvement');
  assert.ok(assignMarkup(teams, agents, card({ team: 'tm-erf' })).includes('Erf cannot take this card'));
});
