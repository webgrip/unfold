import test from 'node:test';
import assert from 'node:assert/strict';
import { NtfyChannel, type Transport } from '../src/notify/channels.ts';
import { SlackChannel } from '../src/notify/slack.ts';
import { adaptiveCardMessage } from '../src/notify/teams.ts';
import { handedOffMessage, workItemMessage } from '../src/notify/triggers.ts';
import { NotifyStore } from '../src/notify/store.ts';
import { Store } from '../src/store.ts';

const clickup = { id: '42', title: 'Show VAT per line', provider: 'clickup', externalId: '86c0abc12', url: 'https://app.clickup.com/t/86c0abc12' };
const base = 'https://unfold.example.org';

test('a notice about tracker work names the task as its tracker shows it and carries its link', () => {
  const message = workItemMessage('review', clickup, base);
  assert.equal(message.body, '#42 Show VAT per line · ClickUp #86c0abc12');
  assert.equal(message.url, 'https://unfold.example.org/#work/42', 'the click still opens Unfold');
  assert.deepEqual(message.task, { mention: 'ClickUp #86c0abc12', label: 'Open in ClickUp', url: 'https://app.clickup.com/t/86c0abc12' });
  assert.deepEqual(handedOffMessage('needs_you', clickup, base).task, message.task, 'the notice to the person who handed it off carries it too');
});

test('a notice carries no task for work no real tracker holds, and no unsafe task link', () => {
  assert.equal(workItemMessage('review', { id: '1', title: 'x', provider: 'manual', externalId: 'run-1' }, base).task, undefined);
  assert.equal(workItemMessage('review', { id: '1', title: 'x', provider: 'demo', externalId: 'DEMO-1' }, base).task, undefined, 'a demo fixture is no tracker');
  assert.equal(workItemMessage('review', { id: '1', title: 'x' }, base).body, '#1 x');
  assert.equal(workItemMessage('review', { ...clickup, url: 'javascript:alert(1)' }, base).task?.url, null);
  assert.equal(workItemMessage('review', { ...clickup, url: 'https://user:secret@app.clickup.com/t/1' }, base).task?.url, null);
});

test('Slack, Teams and ntfy offer the tracker task next to Unfold', async () => {
  const message = workItemMessage('needs_you', clickup, base);
  const slack = new SlackChannel(new NotifyStore(new Store(':memory:')), { tokenEnv: 'SLACK_TOKEN', signingSecretEnv: 'SLACK_SECRET', apiUrl: 'https://slack.example.org/api', permissionAnswers: false });
  const elements = (slack.blocks(message)[1] as { elements: { text: { text: string }; url: string }[] }).elements;
  assert.deepEqual(elements.map(entry => [entry.text.text, entry.url]), [['Open in Unfold', 'https://unfold.example.org/#work/42'], ['Open in ClickUp', 'https://app.clickup.com/t/86c0abc12']]);
  const card = adaptiveCardMessage(message) as { attachments: { content: { actions: { title: string; url: string }[] } }[] };
  assert.deepEqual(card.attachments[0].content.actions.map(entry => [entry.title, entry.url]), [['Open in Unfold', 'https://unfold.example.org/#work/42'], ['Open in ClickUp', 'https://app.clickup.com/t/86c0abc12']]);
  let sent: Record<string, unknown> = {};
  const transport: Transport = async (_url, _headers, body) => { sent = JSON.parse(body.toString()); return { status: 200 }; };
  await new NtfyChannel({} as NotifyStore, { server: 'https://ntfy.example.org', topicPrefix: 'unfold-' }, transport).send(message, { id: 't', address: { topic: 'unfold-abc' } } as never);
  assert.equal(sent.click, 'https://unfold.example.org/#work/42');
  assert.deepEqual(sent.actions, [{ action: 'view', label: 'Open in ClickUp', url: 'https://app.clickup.com/t/86c0abc12' }]);
});
