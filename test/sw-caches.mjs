// The service worker deletes only its own scope's older caches. Run: node test/sw-caches.mjs
//
// Why: every app on a github.io host shares one origin and one set of caches.
// A worker that deletes every cache but its own wipes the other apps' offline
// copies; the air-gapped signer on the same host then failed to load at all.
// sw.js is run here in Node's vm against a stub of the cache storage holding
// other apps' caches, another deployment of Spectre, caches named the old way
// and this scope's previous version; install, activate and fetch are played
// through it. The built copy is checked too, with the VERSION line replaced
// the way build-single.nu replaces it.

import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const ROOT = new URL("..", import.meta.url);
const SCOPE = "https://user.github.io/spectre-web-fork/";
const SIGNER = "https://user.github.io/js-signer-spectre-deriv/";

let checks = 0;
function check(name, actual, expected) {
    assert.deepEqual(actual, expected, name);
    checks++;
}

async function play(source, label) {
    const store = new Map();
    const cacheObject = name => ({
        addAll: requests => {
            for (const request of requests) {
                store.get(name).set(request.url, `body of ${request.url}`);
            }
            return Promise.resolve();
        },
        put: (request, response) => Promise.resolve(store.get(name).set(request.url, response)),
        match: request => Promise.resolve(store.get(name).get(request.url)),
    });
    const caches = {
        open: name => {
            if (!store.has(name)) {
                store.set(name, new Map());
            }
            return Promise.resolve(cacheObject(name));
        },
        keys: () => Promise.resolve([...store.keys()]),
        delete: name => Promise.resolve(store.delete(name)),
        // A lookup across every cache, as the real caches.match does.
        match: request => {
            for (const entries of store.values()) {
                if (entries.has(request.url)) {
                    return Promise.resolve(entries.get(request.url));
                }
            }
            return Promise.resolve(undefined);
        },
    };
    const listeners = {};
    const pending = [];
    const context = {
        self: {
            registration: { scope: SCOPE },
            addEventListener: (type, listener) => { listeners[type] = listener; },
            skipWaiting: () => Promise.resolve(),
            clients: { claim: () => Promise.resolve() },
        },
        caches,
        Request: function Request(url) { this.url = new URL(url, SCOPE).href; },
        // Offline: every network request fails, so a cache miss must not be
        // answered from another app's cache.
        fetch: () => Promise.reject(new TypeError("offline")),
        Promise, URL,
    };
    vm.runInNewContext(`${source}\n;globalThis.CACHE = CACHE; globalThis.PREFIX = PREFIX;`, context);
    const { CACHE, PREFIX } = context;
    const run = (type, extra) => {
        let done;
        listeners[type](Object.assign({
            waitUntil: promise => { pending.push(promise); done = done || promise; },
            respondWith: promise => { done = promise; },
        }, extra));
        return done;
    };

    const others = [
        "gap-signer:" + SIGNER + ":2026-10-05.6",            // the signer on the same host
        "spectre-web:https://user.github.io/other-copy/:v2",  // Spectre deployed under another path
        "spectre-web-v2",                                     // named the old way
        "spectre-web-single-0123456789abcdef",                // named the old way, built copy
    ];
    for (const name of others) {
        store.set(name, new Map([[new URL("index.html", name.startsWith("gap-signer") ? SIGNER : "https://user.github.io/x/").href, "theirs"]]));
    }
    store.set(PREFIX + "v1", new Map([[SCOPE + "index.html", "old version"]]));

    await run("install");
    check(`${label}: install fills this version's cache`, store.get(CACHE).has(SCOPE + "index.html"), true);

    await run("activate");
    check(`${label}: every other cache survives`, others.every(name => store.has(name)), true);
    check(`${label}: this scope's previous version is deleted`, store.has(PREFIX + "v1"), false);
    check(`${label}: cache names after activate`, [...store.keys()].sort(), [...others, CACHE].sort());

    const hit = await run("fetch", { request: { method: "GET", url: SCOPE + "index.html" } });
    check(`${label}: a cached page is served offline`, hit, `body of ${SCOPE}index.html`);

    const foreign = { method: "GET", url: SIGNER + "index.html" };
    check(`${label}: stub sanity, the origin-wide lookup would find it`, await caches.match(foreign), "theirs");
    const miss = await run("fetch", { request: foreign }).then(() => "served", error => error.message);
    check(`${label}: a URL only another app's cache holds is not served`, miss, "offline");
    await Promise.allSettled(pending);
    return CACHE;
}

const source = fs.readFileSync(new URL("sw.js", ROOT), "utf8");
check("the VERSION line build-single.nu replaces is present", /const VERSION = "[^"]*";/.test(source), true);
const cache = await play(source, "source");
check("source cache name", cache, `spectre-web:${SCOPE}:v2`);

// The built copy, with the replacement build-single.nu makes.
const built = source.replace(/const VERSION = "[^"]*";/, 'const VERSION = "single-0123456789abcdef";');
check("built cache name", await play(built, "built"), `spectre-web:${SCOPE}:single-0123456789abcdef`);

console.log(`sw-caches: ${checks} checks passed`);
