import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWebview, type StubElement } from './webview-dom.ts';

const view = loadWebview('task.js', { taskKey: 'glide:1505' });
const now = new Date().toISOString();

function current(status: Record<string, unknown> = {}, task: Record<string, unknown> = {}) {
  return {
    task: { key: 'task:k', sourceId: 'glide', provider: 'vikunja', id: '1505', identifier: '#1505', revision: 'a'.repeat(64), title: 'Explain the flow', description: '<p>raw</p>', descriptionMarkdown: 'Body', url: 'https://vikunja.example/tasks/1505', status: 'open', repositoryId: 'ploeg', updatedAt: now, labels: [{ name: 'ploeg', color: '1973ff' }], assignees: [], ...task },
    source: { id: 'glide', name: 'Glide', provider: 'vikunja', handoff: true, executionOwner: 'ploeg' },
    repositoryName: 'Glide', host: 'vloer.example', loadedAt: now, session: { allowed: false }, preferredTeam: 'silver',
    status: { available: true, demo: false, handoff: { allowed: true }, teams: [{ id: 'bronze', assignee: 'bronze', queueDepth: 2, paused: false, roles: ['engineer'] }, { id: 'silver', assignee: 'silver', queueDepth: 0, paused: false, roles: ['engineer', 'reviewer'] }], assignedTeams: [], workItems: [], fetchedAt: now, ...status },
  };
}

const item = (state: string, extra: Record<string, unknown> = {}) => ({ id: '42', team: 'silver', state, attempts: 1, updatedAt: now, ...extra });

test('the task view announces itself to the extension host on load', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(view.posted)), [{ type: 'ready' }]);
});

test('an untouched open task invites a hand-off and preselects the team used last time', () => {
  const value = current();
  assert.equal(view.ploegSituation(value).headline, 'Not with Ploeg yet.');
  assert.equal(view.canHandOff(value), true);
  const card: StubElement = view.ploegCard(value);
  const radios = card.find('input');
  assert.deepEqual(radios.map(radio => [radio.value, radio.checked]), [['bronze', false], ['silver', true]]);
  assert.equal(card.find('button').find(button => button.getAttribute('type') === 'submit')?.textContent, 'Hand to silver');
  assert.match(card.textContent, /Assigns “silver” in Vikunja/);
});

test('each Ploeg state reads as what is happening and what comes next, and hides the hand-off while work is live', () => {
  const cases: [string, RegExp][] = [['queued', /Queued for team silver/], ['leased', /Team silver is working on it/], ['awaiting_review', /pull request is waiting for your review/], ['needs_human', /needs a human/]];
  for (const [state, headline] of cases) {
    const value = current({ workItems: [item(state)], assignedTeams: ['silver'] });
    assert.match(view.ploegSituation(value).headline, headline, state);
    assert.equal(view.canHandOff(value), false, state);
  }
  assert.match(view.ploegSituation(current({ assignedTeams: ['silver'] })).headline, /Waiting for Ploeg to queue it/);
  assert.match(view.ploegSituation(current({ workItems: [item('withdrawn')] })).headline, /Taken back from team silver/);
  assert.equal(view.canHandOff(current({ workItems: [item('withdrawn')] })), true, 'a withdrawn item can be handed over again');
});

test('take back is offered only while the item is still queued', () => {
  const queued: StubElement = view.ploegCard(current({ workItems: [item('queued')], assignedTeams: ['silver'] }));
  assert.ok(queued.find('button').some(button => button.textContent === 'Take back from silver'));
  const leased: StubElement = view.ploegCard(current({ workItems: [item('leased')], assignedTeams: ['silver'] }));
  assert.ok(!leased.find('button').some(button => button.textContent.startsWith('Take back')));
});

test('a work item links only to an HTTPS pull request, and opening Ploeg goes through the host', () => {
  const card: StubElement = view.ploegCard(current({ workItems: [item('awaiting_review', { prUrl: 'https://forgejo.example/webgrip/glide/pulls/9' })], assignedTeams: ['silver'] }));
  assert.equal(card.find('button').find(button => button.textContent === 'Review pull request ↗')?.dataset.openUrl, 'https://forgejo.example/webgrip/glide/pulls/9');
  const hostile: StubElement = view.ploegCard(current({ workItems: [item('awaiting_review', { prUrl: 'javascript:alert(1)' })], assignedTeams: ['silver'] }));
  assert.ok(!hostile.find('button').some(button => button.textContent === 'Review pull request ↗'));
  assert.equal(card.find('button').find(button => button.textContent === 'Open in Ploeg ↗')?.dataset.action, 'open-ploeg');
});

test('viewers, closed tasks and unavailable Ploeg explain themselves instead of offering the hand-off', () => {
  const viewer = current({ handoff: { allowed: false, reason: 'An operator account is required to hand tasks to Ploeg.' } });
  assert.equal(view.canHandOff(viewer), false);
  assert.match(view.ploegCard(viewer).textContent, /operator account is required/);
  assert.match(view.ploegSituation(current({}, { status: 'closed' })).headline, /closed in the tracker/);
  assert.equal(view.ploegSituation(current({ available: false, message: 'Update the workbench server to see Ploeg status.' })).headline, 'Update the workbench server to see Ploeg status.');
});

test('the header shows tracker facts and labels as text, and a hostile title or label stays inert', () => {
  const header: StubElement = view.header(current({}, { title: '<img src=x onerror=alert(1)>', labels: [{ name: '<script>x</script>', color: 'red;background:url(x)' }], priority: 3 }));
  assert.equal(header.find('img').length, 0);
  assert.equal(header.find('script').length, 0);
  assert.equal(header.find('h1')[0]?.textContent, '<img src=x onerror=alert(1)>');
  assert.match(header.textContent, /#1505/);
  assert.match(header.textContent, /priority High/);
  assert.match(header.textContent, /<script>x<\/script>/);
});

test('markdown links in a description open through the host only when they are HTTPS', () => {
  const root: StubElement = view.markdown('See [the PR](https://forgejo.example/pulls/1) and [bad](javascript:alert(1)).');
  const links = root.withClass('link-text');
  assert.equal(links[0]?.dataset.openUrl, 'https://forgejo.example/pulls/1');
  assert.equal(links[0]?.getAttribute('role'), 'link');
  assert.equal(links[1]?.dataset.openUrl, undefined);
  assert.equal(root.find('a').length, 0);
});
