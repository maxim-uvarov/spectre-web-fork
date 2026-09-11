// Service worker: makes Spectre Web installable and usable offline.
// Why: the page describes itself as an offline password cipher, and a home screen
// install is only worth having if it opens without a network.

const CACHE = "spectre-web-v2";

// Everything index.html loads from this origin, plus the worker chain.
const PRECACHE = [
    "./",
    "index.html",
    "manifest.webmanifest",
    "css/spectre.css",
    "js/main.js",
    "js/spectre/spectre-types.js",
    "js/spectre/spectre-service.js",
    "js/spectre/spectre-worker.js",
    "js/spectre/spectre-algorithm.js",
    "js/spectre/scrypt.js",
    "js/spectre/bip39.js",
    "js/spectre/pbkdf2.js",
    "images/icon.svg",
    "images/icon.png",
];

self.addEventListener("install", event => {
    // Why: addAll goes through the HTTP cache, and GitHub Pages sends max-age=600;
    // a new worker could precache the previous deploy and then serve it forever.
    const fresh = PRECACHE.map(url => new Request(url, {cache: "reload"}));
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(fresh)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
              .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
              .then(() => self.clients.claim()));
});

// Cache first, and refresh the cache from the network in the background.
// Not network-first because: the app has no server state to refresh, and cache-first
// is what makes it open instantly and offline. Not plain cache-first because: it
// served the old JS forever unless CACHE was bumped by hand on every change; now a
// change reaches the browser on the load after the one that fetched it.
// The refresh bypasses the HTTP cache for the same reason the install does.
self.addEventListener("fetch", event => {
    if (event.request.method !== "GET") {
        return;
    }

    const refresh = fetch(new Request(event.request, {cache: "reload"})).then(response => {
        if (response.ok) {
            let copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return response;
    });
    event.respondWith(caches.match(event.request).then(cached => cached || refresh));
});
