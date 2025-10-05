const CACHE_NAME = 'depot-notes-v1';
const ASSETS = [
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
  )));
  self.clients.claim();
});
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then(resp => resp || fetch(event.request))
  );
});
-const CACHE_NAME = 'depot-notes-v1';
-const ASSETS = [
+// Bump this any time you want clients to pull fresh assets
+const VERSION = 'v2025-10-05-15-16';
+const CACHE_NAME = `depot-notes-${VERSION}`;
+const ASSETS = [
   './index.html',
   './manifest.webmanifest',
   './icon-192.png',
   './icon-512.png'
 ];
 self.addEventListener('install', (event) => {
   event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
   self.skipWaiting();
 });
 self.addEventListener('activate', (event) => {
-  event.waitUntil(caches.keys().then((keys) => Promise.all(
-    keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
-  )));
+  event.waitUntil(
+    caches.keys().then((keys) =>
+      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
+    )
+  );
   self.clients.claim();
 });
 self.addEventListener('fetch', (event) => {
-  event.respondWith(
-    caches.match(event.request).then((resp) => resp || fetch(event.request))
-  );
+  const url = new URL(event.request.url);
+
+  // Always fetch fresh config JSON (don’t cache)
+  if (url.pathname.endsWith('/App_config.json')) {
+    event.respondWith(fetch(new Request(event.request, { cache: 'no-store' })));
+    return;
+  }
+
+  // For navigations (index.html), try network first so updates show up
+  if (event.request.mode === 'navigate') {
+    event.respondWith(
+      fetch(event.request).then((resp) => {
+        // update cache copy in background
+        const copy = resp.clone();
+        caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
+        return resp;
+      }).catch(() => caches.match('./index.html'))
+    );
+    return;
+  }
+
+  // Everything else: cache-first fallback to network
+  event.respondWith(
+    caches.match(event.request).then((resp) => resp || fetch(event.request))
+  );
 });