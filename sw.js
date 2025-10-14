// sw.js — minimal, safe PWA cache
const VERSION = 'v2025-12-28-0021';                 // bump this to force update
const CACHE_NAME = `depot-notes-${VERSION}`;
const ASSETS = [
  './welcome.html',
  './index.html',
  './index-v2.html',
  './thing.html',
  './quick-survey.html',
  './Options.txt',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache the config JSON
  if (url.pathname.endsWith('/App_config.json')) {
    event.respondWith(fetch(new Request(event.request, { cache: 'no-store' })));
    return;
  }

  // Network-first for navigations so the latest HTML is served immediately
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return resp;
      }).catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        return caches.match('./welcome.html');
      })
    );
    return;
  }

  // Cache-first for other assets
  event.respondWith(caches.match(event.request).then((r) => r || fetch(event.request)));
});