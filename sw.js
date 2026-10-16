// Service worker: makes Spectre Web installable and usable offline.
// Why: the page describes itself as an offline password cipher, and a home screen
// install is only worth having if it opens without a network.

// build-single.nu replaces this line with the hash of the page it builds.
const VERSION = "v2";

// Why the scope in the name: every app on a github.io host shares one origin,
// and so one set of caches. The activate step used to delete every cache but
// this one, which wiped the offline copy of any other app on the host; the
// air-gapped signer there, whose worker has no network fallback, then failed
// to load at all, online too, until its next version installed. A cache now
// belongs to the scope it was made for, and only this scope's older versions
// are deleted. Caches named the old way ("spectre-web-v2",
// "spectre-web-single-...") are left alone: from the name alone they cannot be
// told apart from another deployment's.
const PREFIX = "spectre-web:" + self.registration.scope + ":";
const CACHE = PREFIX + VERSION;

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
              .then(keys => Promise.all(keys
                  .filter(key => key.startsWith(PREFIX) && key !== CACHE)
                  .map(key => caches.delete(key))))
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

    // Fetched by URL, not by cloning the request: cloning a navigation request
    // with an init threw in older engines, synchronously, before respondWith,
    // and the offline open is the one request that must not fall through.
    const refresh = fetch(event.request.url, {cache: "reload"}).then(response => {
        if (response.ok) {
            let copy = response.clone();
            return caches.open(CACHE).then(cache => cache.put(event.request, copy)).then(() => response);
        }
        return response;
    });
    // Why: once the cached answer is sent the worker may be stopped before the
    // put lands; waitUntil keeps it alive. Offline, the refresh rejects and
    // that is expected, so the kept copy swallows it; the copy handed to
    // respondWith on a cache miss still rejects, which is the real error.
    event.waitUntil(refresh.catch(() => {}));
    // Looked up in this version's cache only, not in every cache of the origin,
    // where another app's entry for the same URL could answer.
    event.respondWith(caches.open(CACHE)
        .then(cache => cache.match(event.request))
        .then(cached => cached || refresh));
});
