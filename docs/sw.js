// Service worker: makes Spectre Web installable and usable offline.
// Why: the page describes itself as an offline password cipher, and a home screen
// install is only worth having if it opens without a network.

const CACHE = "spectre-web-single-a16bba0b53cf8afc";

// Everything index.html loads from this origin, plus the worker chain.
const PRECACHE = ["./", "index.html", "sw.js"];

self.addEventListener("install", event => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
              .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
              .then(() => self.clients.claim()));
});

// Cache first, then network; whatever the network returns is cached for next time.
// Not network-first because: the app has no server state to refresh, and cache-first
// is what makes it open instantly and offline. The cache name carries the build hash, so a new build ships itself.
self.addEventListener("fetch", event => {
    if (event.request.method !== "GET") {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
            if (response.ok) {
                let copy = response.clone();
                caches.open(CACHE).then(cache => cache.put(event.request, copy));
            }
            return response;
        })));
});
