import { state, onForget } from '../core/state.js';
import { api } from '../core/api.js';
import { escape, renderHtml, notify } from '../core/dom.js';
import { badge, button, callout, emptyState, skeleton, table, timeAt } from '../core/ui.js';
import { shell } from '../shell.js';

const view = { data: null, error: '', busy: '' };
onForget(() => Object.assign(view, { data: null, error: '', busy: '' }));

const path = '/api/me/notifications';
const stateWords = { pending: ['Waiting', 'attention'], delivered: ['Sent', 'success'], dead: ['Gave up', 'danger'], dropped: ['Dropped', 'neutral'] };
const channelHelp = {
  ntfy: 'Install the ntfy app, add the server below and subscribe to your topic. Anyone who knows the topic can read it, so keep it to yourself; get a new one if it leaked.',
  'web-push': 'Notices arrive in this browser even when Unfold is closed. On iPhone and iPad, add Unfold to the Home Screen first.',
  slack: 'Notices arrive as direct messages from the Unfold app. Give the email address of your Slack account; Slack then asks you there to confirm the link.',
  teams: 'In Teams, open Workflows, create one from the template "Send webhook alerts to a chat" or "… to a channel", copy its webhook URL and paste it here. Everyone who can read that chat or channel sees your notices.',
};

/** Whether this browser can subscribe to Web Push. */
export function pushSupported(scope = globalThis) {
  return Boolean(scope.navigator?.serviceWorker && scope.PushManager && scope.Notification);
}

/** The application server key of `PushManager.subscribe` from a base64url VAPID public key. */
export function applicationServerKey(publicKey) {
  const base64 = String(publicKey).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

/** The preferences body a submitted Notifications form stands for. */
export function preferencesFrom(data, channelIds, triggerIds) {
  const quiet = data.quiet === 'on' && data.quietStart && data.quietEnd;
  return {
    channels: channelIds.filter(id => data[`channel.${id}`] === 'on'),
    triggers: triggerIds.filter(id => data[`trigger.${id}`] === 'on'),
    quietHours: quiet ? { start: data.quietStart, end: data.quietEnd, timeZone: data.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone } : null,
  };
}

const check = (name, label, checked, hint = '', disabled = false) => `<label class="flag-check"><input type="checkbox" name="${escape(name)}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}><span>${escape(label)}${hint ? ` <span class="meta">${escape(hint)}</span>` : ''}</span></label>`;

function channelBlock(channel) {
  if (!channel.available) return `<p class="meta">${escape(channel.label)}: not configured on this server.</p>`;
  if (channel.id === 'ntfy') {
    const rows = channel.topic ? `<p class="meta">Server <span class="mono">${escape(channel.server)}</span> · topic <span class="mono">${escape(channel.topic)}</span></p>${button({ label: 'Get a new topic', size: 'sm', variant: 'ghost', action: 'notify-ntfy-topic' })}` : '<p class="meta">Turn ntfy on and save to get your topic.</p>';
    return `<div class="settings-row"><div class="settings-row-text"><p class="settings-row-label">ntfy</p><p class="settings-row-hint">${escape(channelHelp.ntfy)}</p>${rows}</div></div>`;
  }
  if (channel.id === 'web-push') {
    const subscriptions = channel.subscriptions ?? [];
    const list = subscriptions.length ? `<ul class="sessions-list">${subscriptions.map(entry => `<li><span class="mono">${escape(entry.host)}</span> · since ${timeAt(entry.createdAt)} ${button({ label: 'Remove', size: 'sm', variant: 'danger-ghost', action: 'notify-push-remove', data: { id: entry.id } })}</li>`).join('')}</ul>` : '<p class="meta">No browser subscribed yet.</p>';
    const add = pushSupported() ? button({ label: 'Subscribe this browser', size: 'sm', icon: 'bell', action: 'notify-push-subscribe', busy: view.busy === 'subscribe' }) : '<p class="meta">This browser cannot receive Web Push.</p>';
    return `<div class="settings-row"><div class="settings-row-text"><p class="settings-row-label">Web Push</p><p class="settings-row-hint">${escape(channelHelp['web-push'])}</p>${list}${add}</div></div>`;
  }
  if (channel.id === 'slack') {
    const linked = channel.linked ? `<p class="meta">Linked to Slack member <span class="mono">${escape(channel.linked.slackUserId)}</span> since ${timeAt(channel.linked.linkedAt)}</p>${button({ label: 'Unlink', size: 'sm', variant: 'danger-ghost', action: 'notify-slack-unlink' })}` : '';
    const pending = channel.pending ? `<p class="meta">Confirm the link in Slack before ${timeAt(channel.pending.expiresAt)}.</p>` : '';
    const ask = channel.linked ? '' : `<form data-form="notify-slack-link" class="flag-rule-grid"><div class="field"><label class="field-label" for="notify-slack-email">Slack email address</label><input id="notify-slack-email" name="email" type="email" autocomplete="email" required></div>${button({ type: 'submit', label: 'Link Slack', size: 'sm' })}</form>`;
    const answers = channel.permissionAnswers ? '<p class="meta">You can review and answer tool prompts of your own sessions from Slack.</p>' : '';
    return `<div class="settings-row"><div class="settings-row-text"><p class="settings-row-label">Slack</p><p class="settings-row-hint">${escape(channelHelp.slack)}</p>${linked}${pending}${answers}${ask}</div></div>`;
  }
  if (channel.id === 'teams') {
    const hooks = channel.webhooks ?? [];
    const list = hooks.length ? `<ul class="sessions-list">${hooks.map(entry => `<li><span class="mono">${escape(entry.host)}</span>${entry.label ? ` · ${escape(entry.label)}` : ''} · since ${timeAt(entry.createdAt)} ${button({ label: 'Remove', size: 'sm', variant: 'danger-ghost', action: 'notify-teams-remove', data: { id: entry.id } })}</li>`).join('')}</ul>` : '<p class="meta">No workflow added yet.</p>';
    const add = `<form data-form="notify-teams-add" class="flag-rule-grid"><div class="field"><label class="field-label" for="notify-teams-url">Workflow webhook URL</label><input id="notify-teams-url" name="url" type="url" autocomplete="off" required></div><div class="field"><label class="field-label" for="notify-teams-label">Name</label><input id="notify-teams-label" name="label" type="text" maxlength="60" autocomplete="off"></div>${button({ type: 'submit', label: 'Add workflow', size: 'sm' })}</form>`;
    return `<div class="settings-row"><div class="settings-row-text"><p class="settings-row-label">Microsoft Teams</p><p class="settings-row-hint">${escape(channelHelp.teams)}</p>${list}${add}</div></div>`;
  }
  return `<p class="meta">${escape(channel.label)}</p>`;
}

function form(data) {
  const chosen = data.preferences;
  const zone = chosen.quietHours?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const channels = data.channels.map(channel => check(`channel.${channel.id}`, channel.label, chosen.channels.includes(channel.id), channel.available ? '' : 'not configured', !channel.available)).join('');
  const triggers = data.triggers.map(trigger => check(`trigger.${trigger.id}`, trigger.label, chosen.triggers.includes(trigger.id))).join('');
  const quiet = chosen.quietHours;
  return `<form data-form="notify-preferences" class="settings-rows">
<fieldset><legend class="settings-row-label">Send to</legend>${channels}</fieldset>
<fieldset><legend class="settings-row-label">Tell me when</legend>${triggers}</fieldset>
<fieldset><legend class="settings-row-label">Quiet hours</legend>${check('quiet', 'Hold notices during quiet hours and send them when they end', Boolean(quiet))}
<div class="flag-rule-grid"><div class="field"><label class="field-label" for="notify-quiet-start">From</label><input id="notify-quiet-start" name="quietStart" type="time" value="${escape(quiet?.start ?? '22:00')}"></div><div class="field"><label class="field-label" for="notify-quiet-end">Until</label><input id="notify-quiet-end" name="quietEnd" type="time" value="${escape(quiet?.end ?? '07:00')}"></div><div class="field"><label class="field-label" for="notify-zone">Time zone</label><input id="notify-zone" name="timeZone" type="text" autocomplete="off" value="${escape(zone)}"></div></div></fieldset>
<p class="meta">A notice names the Work Item's number and title and links to it. It never carries a price, spend, note or question text.</p>
<div class="flag-actions">${button({ type: 'submit', label: 'Save', variant: 'primary', size: 'sm' })}${button({ label: 'Send a test notice', size: 'sm', action: 'notify-test' })}${button({ label: 'Turn everything off', size: 'sm', variant: 'danger-ghost', action: 'notify-forget' })}</div>
</form>`;
}

function recent(data) {
  if (!data.recent.length) return emptyState({ icon: 'bell', title: 'Nothing sent yet', body: 'Notices you were sent show here, with whether they arrived.', compact: true });
  return table({ caption: 'Recent notices', compact: true, columns: ['When', 'Notice', 'Channel', 'State'], rows: data.recent.map(entry => {
    const [label, tone] = stateWords[entry.state] ?? [entry.state, 'neutral'];
    return [timeAt(entry.createdAt), escape(entry.title), escape(entry.channel), `${badge({ label, tone, size: 'sm' })}${entry.lastError ? ` <span class="meta mono">${escape(entry.lastError)}</span>` : ''}`];
  }) });
}

function render() {
  const data = view.data;
  let content;
  if (view.error && !data) content = callout({ tone: 'danger', title: 'Could not read your notifications', body: `<p>${escape(view.error)}</p>` });
  else if (!data) content = `<section class="card settings-card">${skeleton({ rows: 3 })}</section>`;
  else if (!data.enabled) content = `<section class="card settings-card">${emptyState({ icon: 'bell', title: 'Notifications are not on for you', body: 'An administrator turns on the notifications.push flag for the people who may use them.', compact: true })}</section>`;
  else {
    const demo = data.demo ? callout({ tone: 'neutral', title: 'This is the demo', body: '<p>The demo saves your choices but sends no notifications.</p>' }) : '';
    content = `${demo}<section class="card settings-card" aria-labelledby="notify-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="notify-title">What tells you</h2><p class="card-subtitle">Nothing is sent until you choose a channel and at least one moment.</p></div></header><div class="card-body">${form(data)}</div></section>
<section class="card settings-card" aria-labelledby="notify-channels"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="notify-channels">Channels</h2></div></header><div class="card-body settings-rows">${data.channels.map(channelBlock).join('')}</div></section>
<section class="card settings-card" aria-labelledby="notify-recent"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="notify-recent">Recent</h2></div></header><div class="card-body">${recent(data)}</div></section>`;
  }
  renderHtml(shell(`<div class="settings-page">${content}</div>`, { title: 'Notifications', subtitle: 'Be told when something waits for you, without Unfold open.' }));
}

async function load() {
  view.error = '';
  try { view.data = await api(path); } catch (error) { view.error = error.message; view.data = null; }
  if (state.view === 'notifications' && state.bootstrap) render();
}

const show = data => { view.data = data; if (state.view === 'notifications' && state.bootstrap) render(); };

async function subscribe() {
  const push = view.data?.channels.find(channel => channel.id === 'web-push');
  if (!push?.publicKey) return;
  view.busy = 'subscribe'; render();
  try {
    if (await Notification.requestPermission() !== 'granted') { notify('The browser did not allow notifications.', true); return; }
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(push.publicKey) });
    show(await api(`${path}/channels/web-push/subscriptions`, { method: 'POST', body: JSON.stringify(subscription.toJSON()) }));
    notify('This browser is subscribed.');
  } finally { view.busy = ''; render(); }
}

async function removeSubscription(button) {
  const registration = await navigator.serviceWorker?.getRegistration('/sw.js').catch(() => undefined);
  const current = await registration?.pushManager.getSubscription().catch(() => null);
  const data = await api(`${path}/channels/web-push/subscriptions/${encodeURIComponent(button.dataset.id)}`, { method: 'DELETE' });
  const left = data.channels.find(channel => channel.id === 'web-push')?.subscriptions ?? [];
  if (current && !left.some(entry => current.endpoint.includes(entry.host))) await current.unsubscribe().catch(() => undefined);
  show(data);
  notify('The subscription is removed.');
}

/** The Notifications page (`#settings/notifications`): channels, moments and quiet hours, and Web Push subscribe and unsubscribe. */
export default {
  id: 'notifications',
  match: hash => hash === 'settings/notifications' ? {} : null,
  load,
  render,
  actions: {
    'notify-push-subscribe': subscribe,
    'notify-push-remove': removeSubscription,
    'notify-ntfy-topic': async () => { show(await api(`${path}/channels/ntfy/topic`, { method: 'POST', body: '{}' })); notify('Subscribe to the new topic in the ntfy app.'); },
    'notify-test': async () => { const answer = await api(`${path}/test`, { method: 'POST', body: '{}' }); notify(answer.demo ? 'The demo sends no notifications.' : answer.queued ? 'A test notice is on its way.' : 'No channel to send to: choose one and save first.'); await load(); },
    'notify-slack-unlink': async () => { show(await api(`${path}/channels/slack/link`, { method: 'DELETE' })); notify('Slack is unlinked.'); },
    'notify-teams-remove': async button => { show(await api(`${path}/channels/teams/webhooks/${encodeURIComponent(button.dataset.id)}`, { method: 'DELETE' })); notify('The workflow is removed.'); },
    'notify-forget': async () => { show(await api(path, { method: 'DELETE' })); notify('Notifications are off and your choices are forgotten.'); },
  },
  forms: {
    'notify-slack-link': async data => { show(await api(`${path}/channels/slack/link`, { method: 'POST', body: JSON.stringify({ email: data.email }) })); notify('Slack sent you a message: confirm the link there.'); },
    'notify-teams-add': async data => { show(await api(`${path}/channels/teams/webhooks`, { method: 'POST', body: JSON.stringify({ url: data.url, label: data.label }) })); notify('The workflow is added. Send a test notice to try it.'); },
    'notify-preferences': async data => {
      const body = preferencesFrom(data, view.data.channels.map(channel => channel.id), view.data.triggers.map(trigger => trigger.id));
      show(await api(path, { method: 'PUT', body: JSON.stringify(body) }));
      notify('Your notification choices are saved.');
    },
  },
};
