# mask-unmask-secrets: design

## What exists

`spectre-types.js` declares the result type `statePersonal` ("Own", class `stateful`): "use the site key to encrypt and decrypt a stateful entity".
No code in `js/` implements it: `grep -rn 'statePersonal\|stateful' js/` hits only the types file.
Upstream Spectre apps store "Own" passwords as AES-128-CBC under the site key, zero IV, Base64 — ASSUMED from memory; the upstream source (gitlab.com/spectre.app/api) is blocked by the egress proxy here.
`crypto.subtle` is already required (`spectre-algorithm.js:77` throws without it), so the key derivation below needs no new library.

## Proposed shape

- Key: HMAC-SHA-256(user-key, own purpose string . site . counter), like the seed words, so it shares no bytes with any password of that site.
- Mask: each character moves forward in its own alphabet (digits, lower case, upper case) by a key value: `out[i] = abc[(pos(in[i]) + k[i]) mod len(abc)]`.
  Unmask moves it back. Characters outside these alphabets (`-`, space) stay in place, so the output has the same length and shape as the input.
- k[i] comes from the HMAC output (extended with a block counter when the code is longer than 32 bytes); a 16-bit value per character keeps the mod bias negligible.
- No authentication: a wrong secret, site or counter gives a plausible code of the same shape. The user accepted that.
- One site + counter masks one code. Two codes under the same key leak the difference between them, character by character.
- All crypto runs in `spectre-worker.js`; the user key never reaches `main.js`.

## The cost to accept

The format is frozen from the first masked code that goes on paper, like SEED-WORDS.md: any change to the derivation or the encoding makes old codes unrecoverable.
So a contract doc and a test vector in `test/` come before the first real use.
The site name and the counter are not secret but are needed to unmask: write them next to the masked string.
The masked string is only as strong as the Spectre secret: an attacker who has the paper can brute-force the secret offline at one scrypt per guess.
