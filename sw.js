const CACHE = 'zenhub-v1';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  const bypass =
    u.hostname.indexOf('googlesyndication') > -1 ||
    u.hostname.indexOf('doubleclick') > -1 ||
    u.hostname.indexOf('googleadservices') > -1 ||
    u.hostname.indexOf('googletagmanager') > -1 ||
    u.hostname.indexOf('google-analytics') > -1 ||
    u.hostname.indexOf('.google.com') > -1 ||
    u.hostname.indexOf('vhoriginal.com') > -1;   // always-fresh live article feed
  if (bypass) return;

  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (e.request.method === 'GET' && res && res.ok && u.origin === location.origin) {
        const c = res.clone();
        caches.open(CACHE).then(x => x.put(e.request, c));
      }
      return res;
    }).catch(() => e.request.mode === 'navigate' ? caches.match('./index.html') : new Response('', { status: 504 })))
  );
});
