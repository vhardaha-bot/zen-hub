/* ═══════════════════════════════════════════════════════════
   ZEN HUB 2.0 — Service Worker
   Cache strategy:
     Cache-First  → static assets (HTML, icons, manifest)
     Network-First → WordPress REST API (fresh articles)
     Bypass       → ads, analytics, external scripts
   
   Cache version: bump CACHE string to force full refresh.
═══════════════════════════════════════════════════════════ */

const CACHE   = 'zenhub-v8';
const ASSETS  = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

/* Domains whose responses must NEVER be cached (ads/analytics) */
const BYPASS_PATTERNS = [
  'googlesyndication',
  'doubleclick',
  'googleadservices',
  'googletagmanager',
  'google-analytics',
  'googletag',
  'fonts.googleapis',        /* Google Fonts CSS — network only (changes rarely but must be fresh) */
  'fonts.gstatic',           /* Google Fonts actual font files */
  'pagead2',
];

/* Domains whose responses should be Network-First (fresh data preferred) */
const NETWORK_FIRST_PATTERNS = [
  'vhoriginal.com',          /* WP REST API article feed */
];

/* ── Install: precache static shell ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

/* ── Activate: delete stale caches ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

/* ── Fetch handler ── */
self.addEventListener('fetch', e => {
  /* Only handle GET; pass through everything else */
  if(e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  /* 1. Bypass — don't touch ads / analytics / external CDNs */
  if(BYPASS_PATTERNS.some(p => url.hostname.includes(p) || url.href.includes(p))){
    return;  /* fall through to browser */
  }

  /* 2. Network-First — WP REST API, always try network, fall back to cache */
  if(NETWORK_FIRST_PATTERNS.some(p => url.hostname.includes(p))){
    e.respondWith(networkFirst(e.request));
    return;
  }

  /* 3. Cache-First — static shell assets; fall back to network then offline page */
  e.respondWith(cacheFirst(e.request));
});

/* ────────────────────────────────────────
   Cache-First strategy
   Good for: HTML shell, icons, manifest
──────────────────────────────────────── */
async function cacheFirst(request){
  const cached = await caches.match(request);
  if(cached) return cached;

  try {
    const response = await fetch(request);
    if(response && response.ok && request.method === 'GET'){
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch(err) {
    /* Offline fallback: serve shell for navigation requests */
    if(request.mode === 'navigate'){
      const fallback = await caches.match('./index.html');
      if(fallback) return fallback;
    }
    return new Response('', { status: 504, statusText: 'Gateway Timeout' });
  }
}

/* ────────────────────────────────────────
   Network-First strategy
   Good for: WP REST API article feed
──────────────────────────────────────── */
async function networkFirst(request){
  try {
    const response = await fetch(request);
    if(response && response.ok){
      /* Cache successful API responses for offline fallback */
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch(err) {
    /* Network failed — try cache */
    const cached = await caches.match(request);
    if(cached) return cached;
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/* ════════════════════════════════════════════════════════
   VH NOTIFY — Push Notifications
════════════════════════════════════════════════════════ */
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch(_){}

  const title   = data.title   || '🔔 VH Original';
  const options = {
    body:    data.message || '',
    icon:    data.icon    || '/icon-192.png',
    badge:   data.badge   || '/badge-96.png',
    image:   data.image   || undefined,
    data:    { url: data.url || 'https://vhoriginal.com/' },
    vibrate: [200, 100, 200],
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url)
              ? e.notification.data.url
              : 'https://vhoriginal.com/';
  e.waitUntil(
    clients.matchAll({ type:'window', includeUncontrolled:true }).then(list => {
      for(const c of list){
        if(c.url === url && 'focus' in c) return c.focus();
      }
      return clients.openWindow(url);
    })
  );
});
