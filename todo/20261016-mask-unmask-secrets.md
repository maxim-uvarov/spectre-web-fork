---
status: in_progress #draft | in_progress | completed | rejected
agents-mode: co-editing #read-only | grammar-fixes | co-editing
updated: '20261016' #yyyyMMdd
session: 13606f3d-51b6-499c-8482-13aa92799c80
---

# mask-unmask-secrets

I want a simple *mechanism* for storing recovery codes encrypted by *Spectre* on offline *media*.

So I enter some string into our *PWA* (with *the Spectre credentials filled in*),
and it should output *a* string
that I can store on insecure *media*,
to be recovered later with the same *PWA*.

    AA: Built on `feature/mask-unmask`: `6e7e8e1` algorithm + MASK.md + test, `b451660` UI, `0fb54dc`, `febe8c0`, `fad17cf`, `58393cd` follow-ups; `a54e1eb` merged the 2 commits from your fork.
    Do not mask a real code before you check the app: the first one on paper freezes the format.
    The page itself never ran here (no browser): ASSUMED until you check. How to check, the checklist and the Not requested list: `todo/20261016-mask-unmask-secrets-design.md`.
        %% I didn't read the design to save my resources. Let me know if it is necessary.

            AA: Not necessary. The one point you must know is in the Readback below: the paper is only as strong as your Spectre secret.

??? Format: upstream "Own" (AES-CBC, readable by official Spectre apps, but a typo or wrong secret can give silent garbage — ASSUMED, source not reachable) or fork-local AES-GCM (an error instead of garbage)?
    Default: fork-local AES-GCM. Cost: only this fork can unmask.
        !! let's go with *Spectre* defaults without *an* additional *library*. I mean*,* if it outputs garbage*,* that's ok.

??? Output: Crockford Base32 in groups of 4 (hand-copy safe, about 20% longer than Base64)?
    Default: yes. Cost: a 20-character code becomes about 90 characters on paper.
        !! hm, can't we use the same set of standard symbols?
        or *will it* harm security?

            AA: No alphabet changes security: it only writes the same bytes another way. The choice is length vs. copy errors.
            A 20-character code is 48 bytes after masking: Base64 = 64 characters, Base32 = 77, BIP-39 words = 35 words.

                ?? and can't we invent anything elegant that *keeps* the same length?
                Initially I thought that if we have a strong trusted seed (right word?) from *Spectre*,
                we can apply a very basic transformation,
                *which*, without our seed, *makes* it difficult to recover the result.
                But you are saying that the number of *characters* is going to be bigger anyway.

                    AA: Yes, we can — and it is how Spectre itself builds passwords: site-key bytes pick each character.
                    Each character moves forward in its own alphabet by a key value: `out[i] = abc[(pos(in[i]) + k[i]) mod len(abc)]`, k from HMAC(site key). Same length, same alphabet, `-` stays in place, no library.
                    It is secure only if one site + counter masks one code: two codes under the same key leak the difference between them. (Your "seed" here is a *key*.)

                        !! I can live with that, no problem

??? Format: A — same-length character shift above (a wrong secret gives garbage of the same shape, which you accepted). B — upstream "Own" AES-CBC + Base64 (about 2-3x longer).
    Default: A. Cost: one site + counter per code, and no other Spectre app can unmask it.
        yes, let's go with A

            AA: Format settled: the same-length character shift. See the Readback.

??? UI: reuse the site + counter fields (a new "Mask" type in the Type list, plus a text input and an Unmask toggle)?
    Default: yes. Cost: you must write the site and counter next to each masked code.
    !! I'm not sure. Let's go with what you offer.

## Readback

- Format: the same-length character shift, no new library. A wrong secret gives garbage of the same shape; one site + counter per code; only this fork can unmask.
- UI: a new "Mask" entry in the Type list, a text input, and an Unmask toggle; site and counter are the existing fields. You write the site and counter next to each masked code.
- Security: the masked code is only as strong as your Spectre secret. Whoever has the paper can try secrets offline, one scrypt per guess.
- The format is frozen from the first real masked code: a contract doc and a test vector come first, like SEED-WORDS.md.

??? Branch: `pwa-homescreen` is 61 commits ahead of `main`, and the mask builds on its worker and seed-word code.
    Default: a new branch `mask-secrets` from `pwa-homescreen`. Cost: it can land only after `pwa-homescreen` lands.

    !! yes, that's correct. I guess we should delete main entirely and make pwa-homescreen our default. Or move it to main

        AA: Branch settled: `mask-secrets` from `pwa-homescreen`.
        Note: `source/pwa-homescreen` (your GitHub fork) is 2 commits ahead of the local branch, so I pull it first.

??? `main` tracks `origin/main`, the upstream GitLab Spectre: it is your mirror of upstream, not your trunk.
    Default: keep `main` as the mirror, and set `pwa-homescreen` as the default branch of the GitHub fork (Settings → Branches). Nothing local is deleted.
    Cost: the land-branch flow needs a trunk name other than `main`, so `pwa-homescreen` becomes that trunk.
        !! pwa-homescreen is already *the* default on *GitHub*.

            AA: Settled: `main` stays the upstream mirror, untouched; `pwa-homescreen` is the trunk.
            All questions are answered. First step on `go`: pull `source/pwa-homescreen`, branch `mask-secrets`, write the contract doc and the test vector, before any UI.
            Please commit this canvas before `go`: an uncommitted file is what your editor overwrote last time.

Did *the* advisor recheck?

    AA: Not before your question: one review after `b451660`, none after the follow-ups. It ran now, and two findings are fixed.
    `fad17cf`: only letters and digits take a key value, so a lost dash, space or line break no longer spoils the rest of a code (new vectors).
    `58393cd`: the result shows a set of codes one per line.

*Why* did we choose not to mask symbols?

    AA: It was my choice, in the first same-length proposal: separators (`-`, space, line break) stay, so the paper keeps the shape of the code, and since `fad17cf` a lost dash spoils nothing.
    Other symbols followed only because "symbol" has no clear alphabet. Recovery codes rarely hold them, but a password does (`pg^VMAUBk5x3p%HP%i4=`): its `^ % =` stay readable on paper.

??? Add a fourth alphabet: the ASCII symbols `` !"#$%&'()*+,./:;<=>?@[\]^_`{|}~ ``, keeping only `-`, space and line breaks as separators?
    Default: yes, now, while nothing is on paper. Cost: a `/` or `.` inside a code is masked too, so it is no longer a free separator.
        !! yes, let's mask them too

            AA: Done in `0e462b4`: symbols are masked; `-`, space, line breaks and non-ASCII characters stay. The vectors moved, so check the app before the first real code.
