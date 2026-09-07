// Service worker: makes Spectre Web installable and usable offline.
// Why: the page describes itself as an offline password cipher, and a home screen
// install is only worth having if it opens without a network.

const CACHE = "spectre-web-v1";

// Everything index.html loads from this origin, plus the worker chain.
const PRECACHE = [
    "./",
    "index.html",
    "manifest.webmanifest",
    "css/spectre-base.css",
    "css/spectre-web.css",
    "plugins/bootstrap/bootstrap.min.css",
    "plugins/bootstrap/bootstrap.bundle.min.js",
    "plugins/fontawesome/css/all.min.css",
    "plugins/fontawesome/webfonts/fa-duotone-900.woff2",
    "plugins/fontawesome/webfonts/fa-solid-900.woff2",
    "plugins/jquery/jquery.min.js",
    "js/main.js",
    "js/spectre/spectre-types.js",
    "js/spectre/spectre-service.js",
    "js/spectre/spectre-worker.js",
    "js/spectre/spectre-algorithm.js",
    "js/spectre/scrypt.js",
    "images/spectre.png",
    "images/spectre-light.png",
    "images/spectre-light-glyph.svg",
];

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
// is what makes it open instantly and offline. Bump CACHE to ship new assets.
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
