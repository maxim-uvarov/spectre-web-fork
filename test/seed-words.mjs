// Regression anchors for the seed words. Run: node test/seed-words.mjs
//
// Why: the derivation in SEED-WORDS.md is a contract. A vector that moves is a
// wallet-loss event, and it must be caught here, not by a user restoring a
// wallet. The expected words below were produced by the Python reference in
// SEED-WORDS.md (extended with the V0-V2 length rules), not by this code, so a
// pass means two independent implementations agree.

import fs from "node:fs";
import vm from "node:vm";
import { createHash } from "node:crypto";
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
const SEED = spectre.resultType.deriveMnemonic;

// BIP-39 official 256-bit vectors, trezor/python-mnemonic vectors.json.
const BIP39_VECTORS = [
    ["0000000000000000000000000000000000000000000000000000000000000000", "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art"],
    ["7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f", "legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth title"],
    ["8080808080808080808080808080808080808080808080808080808080808080", "letter advice cage absurd amount doctor acoustic avoid letter advice cage absurd amount doctor acoustic avoid letter advice cage absurd amount doctor acoustic bless"],
    ["ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo vote"],
    ["68a79eaca2324873eacc50cb9c6eca8cc68ea5d936f98787c60c7ebc74e6ce7c", "hamster diagram private dutch cause delay private meat slide toddler razor book happy fancy gospel tennis maple dilemma loan word shrug inflict delay length"],
    ["9f6a2878b2520799a44ef18bc7df394e7061a224d2c33cd015b157d746869863", "panda eyebrow bullet gorilla call smoke muffin taste mesh discover soft ostrich alcohol speed nation flash devote level hobby quick inner drive ghost inside"],
    ["066dca1a2bb7e8a1db2832148ce9933eea0f3ac9548d793112d9a95c9407efad", "all hour make first leader extend hole alien behind guard gospel lava path output census museum junior mass reopen famous sing advance salt reform"],
    ["f585c11aec520db57dd353c69554b21a89b20fb0650966fa0a9d6f74fd989d8f", "void come effort suffer camp survey warrior heavy shoot primary clutch crush open amazing screen patrol group space point ten exist slush involve unfold"],
];

// Seed words per algorithm version. ASCII input: every version agrees.
// Non-ASCII input: the name length rule switches at V3, the site length rule at V2.
const ASCII = "sound average tumble social achieve adapt cement use arm sheriff pear express combine seminar public oppose spider answer woman people leaf wish million snow";
const CYRILLIC_V0_V1 = "crop metal survey carpet sing evoke case lake hospital vendor struggle void laptop olive icon ancient favorite glue interest midnight brass crack lounge portion";
const SEED_VECTORS = [
    { name: "Robert Lee Mitchell", secret: "banana colored duckling", site: "wallet", counter: 1, version: 0, words: ASCII },
    { name: "Robert Lee Mitchell", secret: "banana colored duckling", site: "wallet", counter: 1, version: 1, words: ASCII },
    { name: "Robert Lee Mitchell", secret: "banana colored duckling", site: "wallet", counter: 1, version: 2, words: ASCII },
    { name: "Robert Lee Mitchell", secret: "banana colored duckling", site: "wallet", counter: 1, version: 3, words: ASCII },
    { name: "Robert Lee Mitchell", secret: "banana colored duckling", site: "wallet", counter: 2, version: 3, words: "jazz program exchange same heavy pioneer circle nasty vacuum pioneer kiwi avoid lady hedgehog flame sword inner silly census boring vanish wheel absent load" },
    { name: "Роберт Ли Митчелл", secret: "banana colored duckling", site: "кошелёк", counter: 1, version: 0, words: CYRILLIC_V0_V1 },
    { name: "Роберт Ли Митчелл", secret: "banana colored duckling", site: "кошелёк", counter: 1, version: 1, words: CYRILLIC_V0_V1 },
    { name: "Роберт Ли Митчелл", secret: "banana colored duckling", site: "кошелёк", counter: 1, version: 2, words: "maze season dry plunge fix seed demand transfer blush above sadness icon trend mix dinosaur concert gown daughter hurt right act coyote ranch latin" },
    { name: "Роберт Ли Митчелл", secret: "banana colored duckling", site: "кошелёк", counter: 1, version: 3, words: "debate leg universe seed ball aerobic step urban live outdoor mandate fabric mesh swap alcohol glow ball embrace hover mail media pave rare earth" },
];

let checks = 0;
function check(name, actual, expected) {
    assert.equal(actual, expected, name);
    checks++;
}

check("word list hash",
    createHash("sha256").update(spectre.bip39Words.join("\n") + "\n").digest("hex"),
    "2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda");

for (const [hex, words] of BIP39_VECTORS) {
    check(`BIP-39 ${hex.slice(0, 8)}`, await spectre.newMnemonic(Uint8Array.from(Buffer.from(hex, "hex"))), words);
}

const userKeys = new Map();
async function userKey(name, secret, version) {
    const id = JSON.stringify([name, secret, version]);
    if (!userKeys.has(id)) userKeys.set(id, await spectre.newUserKey(name, secret, version));
    return userKeys.get(id);
}

for (const v of SEED_VECTORS) {
    const key = await userKey(v.name, v.secret, v.version);
    const label = `${v.name} / ${v.site} / ${v.counter} / V${v.version}`;
    // The result type arrives from the form as a string; the purpose and context must not matter.
    for (const purpose of Object.values(spectre.purpose)) {
        check(`${label} under ${purpose}`, await spectre.newSiteResult(key, v.site, String(SEED), v.counter, purpose, null), v.words);
    }
    check(`${label} with a context`, await spectre.newSiteResult(key, v.site, SEED, v.counter, spectre.purpose.authentication, "ctx"), v.words);
}

// The password path is untouched by the seed branch.
check("known password", await spectre.newSiteResult(await userKey("Robert Lee Mitchell", "banana colored duckling", 3), "masterpasswordapp.com"), "Jejr5[RepuSosp");

console.log(`seed-words: ${checks} checks passed`);
