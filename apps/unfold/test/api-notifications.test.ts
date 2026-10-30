import test from 'node:test';
import assert from 'node:assert/strict';
import { application, login, request } from './api-support.ts';
import { notificationSettings } from '../src/notify/settings.ts';

test('the notifications routes say off while the flag is off, then keep choices per person once an override turns it on', async t => {
  process.env.UNFOLD_TEST_NTFY_TOKEN = 'tk_api_test';
  const app = await application('live', config => { config.notifications = notificationSettings({ ntfy: { server: 'https://ntfy.example.org', tokenEnv: 'UNFOLD_TEST_NTFY_TOKEN' } }); });
  t.after(() => { delete process.env.UNFOLD_TEST_NTFY_TOKEN; return app.close(); });
  const admin = await login(app.url);

  const off = await request(app.url, '/api/me/notifications', { cookie: admin.cookie });
  assert.deepEqual(off.body, { enabled: false, demo: false });
  assert.equal((await request(app.url, '/api/me/notifications', { method: 'PUT', cookie: admin.cookie, body: { channels: ['ntfy'], triggers: ['review'] } })).body.error.code, 'notifications_off');

  const forced = await request(app.url, '/api/admin/flags/notifications.push/override', { method: 'PUT', cookie: admin.cookie, body: { variant: 'on', reason: 'Try notifications' } });
  assert.equal(forced.status, 200, forced.text);
  const view = await request(app.url, '/api/me/notifications', { cookie: admin.cookie });
  assert.equal(view.body.enabled, true);
  assert.deepEqual(view.body.channels.map((channel: any) => [channel.id, channel.available]), [['ntfy', true], ['web-push', false]]);
  assert.equal((await request(app.url, '/api/me/notifications', { method: 'PUT', cookie: admin.cookie, body: { channels: ['web-push'], triggers: [] } })).body.error.code, 'notify_channel');
  assert.equal((await request(app.url, '/api/me/notifications', { method: 'PUT', cookie: admin.cookie, body: { channels: ['ntfy'], triggers: ['review'] }, csrf: false })).status, 403);

  const saved = await request(app.url, '/api/me/notifications', { method: 'PUT', cookie: admin.cookie, body: { channels: ['ntfy'], triggers: ['review'], quietHours: { start: '22:00', end: '07:00', timeZone: 'Europe/Amsterdam' } } });
  assert.equal(saved.status, 200, saved.text);
  const ntfy = saved.body.channels.find((channel: any) => channel.id === 'ntfy');
  assert.match(ntfy.topic, /^unfold-/);
  assert.equal(ntfy.subscribeUrl, `https://ntfy.example.org/${ntfy.topic}`);
  assert.equal(JSON.stringify(saved.body).includes('tk_api_test'), false, 'the token never reaches the browser');
  assert.equal((await request(app.url, '/api/me/notifications/nothing', { method: 'POST', cookie: admin.cookie, body: {} })).status, 404);
});
