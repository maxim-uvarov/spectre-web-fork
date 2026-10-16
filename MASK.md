# Mask

The "Mask" result type turns a text, such as a recovery code, into a masked text of the same length and shape, safe to keep on paper.
Unmask, with the same identity, site and counter, gives the text back.
This page is the contract: the derivation below is frozen.
Once one real masked code is on paper, any change to it, however small, loses that code.

## Inputs

- Full name and Spectre secret, as typed on the sign-in form.
- Algorithm version. It only matters when the name or the site holds non-ASCII characters, by the same rules as SEED-WORDS.md.
- Site and counter.
- The text, and the direction: mask or unmask.

The purpose radio (Password, Login name, Security answer) has no effect.

## What it protects, and what it does not

The masked text is only as strong as the Spectre secret: whoever has the paper can try secrets offline, at one scrypt per guess.
There is no check value: a wrong secret, site or counter, or a typo in the masked text, gives a text of the same shape that is wrong, not an error.
A wrong letter, digit or symbol spoils only that character; a lost or extra space, dash or line break spoils nothing, because only alphabet characters take a key position.
One site and counter must mask one text only.
Two texts masked under the same site and counter leak the difference between them, character by character.
The length of the text, the separators and every non-ASCII character stay visible.
Each character also keeps its class (digit, lower case, upper case, symbol): in a masked hex code, the paper shows which positions are digits and which are `a`-`f`.
Write the site and the counter next to the masked text: they are not secret, and unmask needs them.

## Derivation

    user-key  = scrypt(secret, user-salt, N=32768, r=8, p=2, dkLen=64)     # as in SEED-WORDS.md
    mask-salt = "com.lyndir.masterpassword.mask" . uint32be(len(site)) . site . uint32be(counter)
    mask-key  = HMAC-SHA-256(user-key, mask-salt)
    stream    = HMAC-SHA-256(mask-key, uint32be(0)) . HMAC-SHA-256(mask-key, uint32be(1)) . ...
    k[j]      = uint16be(stream[2j], stream[2j+1]) mod len(alphabet of the j-th alphabet character)
    mask:   out = alphabet[(pos(c) + k[j]) mod len(alphabet)]     # c is the j-th alphabet character, j from 0
    unmask: out = alphabet[(pos(c) - k[j]) mod len(alphabet)]

The alphabets are `0123456789`, `abcdefghijklmnopqrstuvwxyz`, `ABCDEFGHIJKLMNOPQRSTUVWXYZ` and the ASCII symbols except the dash, in ASCII order: `` !"#$%&'()*+,./:;<=>?@[\]^_`{|}~ `` (31 characters).
A character in none of them (dash, space, line break, any non-ASCII character) is copied unchanged and does not advance `j`.
All strings are UTF-8; `len(site)` follows the version rules of SEED-WORDS.md.
The reference implementation below is V3 only.

## Test vector

    name     = Robert Lee Mitchell
    secret   = banana colored duckling
    version  = 3
    site     = github
    counter  = 1
    text     = a1b2c-3d4e5-f6g7h-8i9j0
    masked   = a6c9e-3i1w3-b3w3v-7j2u6

More vectors are in `test/mask.mjs`.

## Reference implementation

Runs on any Python 3 with OpenSSL, without this app.

```python
import hashlib, hmac, struct, sys

ALPHABETS = ["0123456789", "abcdefghijklmnopqrstuvwxyz", "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "!\"#$%&'()*+,./:;<=>?@[\\]^_`{|}~"]

def mask(name, secret, site, counter, text, unmask=False):
    user_salt = b"com.lyndir.masterpassword" + struct.pack(">I", len(name.encode())) + name.encode()
    user_key = hashlib.scrypt(secret.encode(), salt=user_salt, n=32768, r=8, p=2, dklen=64, maxmem=256 * 1024 * 1024)
    mask_salt = b"com.lyndir.masterpassword.mask" + struct.pack(">I", len(site.encode())) + site.encode() + struct.pack(">I", counter)
    mask_key = hmac.new(user_key, mask_salt, hashlib.sha256).digest()
    positions = sum(any(ch in a for a in ALPHABETS) for ch in text)
    stream = b"".join(hmac.new(mask_key, struct.pack(">I", b), hashlib.sha256).digest() for b in range((positions * 2 + 31) // 32))
    out, j = [], 0
    for ch in text:
        abc = next((a for a in ALPHABETS if ch in a), None)
        if abc is None:
            out.append(ch)
            continue
        k = int.from_bytes(stream[2 * j:2 * j + 2], "big") % len(abc)
        j += 1
        out.append(abc[(abc.index(ch) + (-k if unmask else k)) % len(abc)])
    return "".join(out)

if __name__ == "__main__":
    # mask.py NAME SECRET SITE COUNTER TEXT [unmask]
    print(mask(*sys.argv[1:4], int(sys.argv[4]), sys.argv[5], len(sys.argv) > 6 and sys.argv[6] == "unmask"))
```
