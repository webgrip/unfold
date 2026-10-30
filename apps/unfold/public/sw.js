const fallback = { title: 'Unfold', body: 'Something waits for you.', url: null, tag: 'unfold' };

function noticeFrom(data) {
  const value = data && typeof data === 'object' ? data : {};
  const text = (entry, limit, otherwise) => typeof entry === 'string' && entry.trim() ? entry.slice(0, limit) : otherwise;
  let url = null;
  try { url = typeof value.url === 'string' && new URL(value.url, self.location.origin).origin === self.location.origin ? new URL(value.url, self.location.origin).href : null; } catch { url = null; }
  return { title: text(value.title, 120, fallback.title), body: text(value.body, 200, fallback.body), url, tag: text(value.tag, 80, fallback.tag) };
}

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });

self.addEventListener('push', event => {
  let data = null;
  try { data = event.data ? event.data.json() : null; } catch { data = null; }
  const notice = noticeFrom(data);
  event.waitUntil(self.registration.showNotification(notice.title, { body: notice.body, tag: notice.tag, icon: '/android-chrome-192x192.png', badge: '/favicon-32x32.png', data: { url: notice.url } }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || new URL('/', self.location.origin).href;
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const same = open.find(client => new URL(client.url).origin === self.location.origin);
    if (same) { await same.focus(); if ('navigate' in same) await same.navigate(url).catch(() => undefined); return; }
    await self.clients.openWindow(url);
  })());
});
