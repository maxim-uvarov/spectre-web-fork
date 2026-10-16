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
- MASK.md is the contract for the details: only letters and digits take a 16-bit key value; separators are copied and take none.
- No authentication: a wrong secret, site or counter gives a plausible code of the same shape. The user accepted that.
- One site + counter masks one code. Two codes under the same key leak the difference between them, character by character.
- All crypto runs in `spectre-worker.js`; the user key never reaches `main.js`.

## The cost to accept

The format is frozen from the first masked code that goes on paper, like SEED-WORDS.md: any change to the derivation or the encoding makes old codes unrecoverable.
So a contract doc and a test vector in `test/` come before the first real use.
The site name and the counter are not secret but are needed to unmask: write them next to the masked string.
The masked string is only as strong as the Spectre secret: an attacker who has the paper can brute-force the secret offline at one scrypt per guess.

## Check in the app

Pages deploys only from `pwa-homescreen` (`.github/workflows/pages.yml`).
To see it on the phone, fast-forward and push — your call, I did not run it:

    git switch pwa-homescreen
    git merge --ff-only feature/mask-unmask
    git push source pwa-homescreen

On the computer, serve `dist/` (made by `nu build-single.nu`) on `localhost`.
Plain http from another device does not work: `crypto.subtle` exists only on https or localhost, and sign-in fails with "Cryptography unavailable".

Checklist (the page wiring is not tested; the worker and the service are):

- Type → Mask shows the Text field, the Mask/Unmask switch and the notice.
- The result has the same length and shape as the text; `-`, spaces and line breaks stay, one code per line.
- Unmask a code with its dashes removed: it still gives the code.
- Unmask on the result gives the original back.
- Switch the type away and back: the result is right, never a stale one.
- Switch apps and return: the text and the result come back.
- Sign out clears the text.

## Not requested

- Merged the 2 commits of `source/pwa-homescreen` into your branch first (`a54e1eb`).
- Four alphabets that keep the class: digits, lower case, upper case, ASCII symbols but the dash. A character in none of them is copied.
- Purpose string `com.lyndir.masterpassword.mask`, Type value 4130, label "Mask". Frozen with the format.
- The notice under the result, the multi-line text field, and blanking the text while the app is in the background.
- Test vectors for V3 only; V0-V2 differ only for non-ASCII names and sites, by the rules of SEED-WORDS.md.
