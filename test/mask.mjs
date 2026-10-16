// Regression anchors for the mask. Run: node test/mask.mjs
//
// Why: the mask in MASK.md is a contract. A vector that moves is a lost
// recovery code, and it must be caught here, not by a user reading paper.
// The expected texts were produced by the Python reference in MASK.md, not
// by this code, so a pass means two independent implementations agree.

import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const ROOT = new URL("..", import.meta.url);

// The worker chain, importScripts dropped, the same way build-single.nu inlines it.
const CHAIN = ["pbkdf2.js", "spectre-types.js", "scrypt.js", "bip39.js", "spectre-algorithm.js"];
const source = CHAIN
    .map(file => fs.readFileSync(new URL(`js/spectre/${file}`, ROOT), "utf8"))
    .map(text => text.split("\n").filter(line => !line.startsWith("importScripts(")).join("\n"))
    .join("\n");
const context = vm.createContext({
    crypto: globalThis.crypto, TextEncoder, console: { trace() {}, error: console.error },
    Promise, Uint8Array, Uint16Array, Uint32Array, DataView, ArrayBuffer, Array, Object, Error, Number, parseInt, Math, String,
});
vm.runInContext(source + "\n;globalThis.spectre = spectre;", context);
const { spectre } = context;

const VECTORS = [
    { site: "github", counter: 1, text: "a1b2c-3d4e5-f6g7h-8i9j0", masked: "a6c9e-2w0w3-v2u6i-3i0z4" },
    { site: "github", counter: 2, text: "a1b2c-3d4e5-f6g7h-8i9j0", masked: "s7r5i-3r3x7-i8w9x-8f3x4" },
    { site: "google", counter: 1, text: "ABCD EFGH IJKL MNOP QRST UVWX YZ01 2345 6789", masked: "VNSW IIFO SLHG LDEI NYMX UAII AS51 1773 2550" },
    { site: "кошелёк", counter: 1, text: "Код: 0042-ffff-ZZZZ 🔑 end", masked: "Код: 4974-stzt-PIHG 🔑 zbh" },
];

let checks = 0;
function check(name, actual, expected) {
    assert.equal(actual, expected, name);
    checks++;
}

const key = await spectre.newUserKey("Robert Lee Mitchell", "banana colored duckling", 3);
for (const v of VECTORS) {
    const label = `${v.site} / ${v.counter}`;
    // The counter arrives from the form as a string.
    check(`${label} mask`, await spectre.newMask(key, v.site, String(v.counter), v.text, false), v.masked);
    check(`${label} unmask`, await spectre.newMask(key, v.site, v.counter, v.masked, true), v.text);
}
check("empty text", await spectre.newMask(key, "github", 1, "", false), "");

// A wrong secret gives garbage of the same shape, not an error: the user accepted that.
const wrong = await spectre.newMask(await spectre.newUserKey("Robert Lee Mitchell", "banana colored duckline", 3), "github", 1, VECTORS[0].masked, true);
check("wrong secret keeps the shape", wrong.replace(/[a-z0-9]/g, "x"), VECTORS[0].text.replace(/[a-z0-9]/g, "x"));
assert.notEqual(wrong, VECTORS[0].text, "wrong secret unmasks");

console.log(`mask: ${checks} checks passed`);
