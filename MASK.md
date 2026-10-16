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
One site and counter must mask one text only.
Two texts masked under the same site and counter leak the difference between them, character by character.
The length of the text, and every character that is not an ASCII letter or digit, stay visible.
Each letter or digit also keeps its class (digit, lower case, upper case): in a masked hex code, the paper shows which positions are digits and which are `a`-`f`.
Write the site and the counter next to the masked text: they are not secret, and unmask needs them.

## Derivation

    user-key  = scrypt(secret, user-salt, N=32768, r=8, p=2, dkLen=64)     # as in SEED-WORDS.md
    mask-salt = "com.lyndir.masterpassword.mask" . uint32be(len(site)) . site . uint32be(counter)
    mask-key  = HMAC-SHA-256(user-key, mask-salt)
    stream    = HMAC-SHA-256(mask-key, uint32be(0)) . HMAC-SHA-256(mask-key, uint32be(1)) . ...
    k[i]      = uint16be(stream[2i], stream[2i+1]) mod len(alphabet of character i)
    mask:   out[i] = alphabet[(pos(c[i]) + k[i]) mod len(alphabet)]
    unmask: out[i] = alphabet[(pos(c[i]) - k[i]) mod len(alphabet)]

The alphabets are `0123456789`, `abcdefghijklmnopqrstuvwxyz` and `ABCDEFGHIJKLMNOPQRSTUVWXYZ`.
A character in none of them is copied unchanged, and still takes its position `i`.
Positions count Unicode code points, not UTF-16 units: an emoji is one position.
All strings are UTF-8; `len(site)` follows the version rules of SEED-WORDS.md.
The reference implementation below is V3 only.

## Test vector

    name     = Robert Lee Mitchell
    secret   = banana colored duckling
    version  = 3
    site     = github
    counter  = 1
    text     = a1b2c-3d4e5-f6g7h-8i9j0
    masked   = a6c9e-2w0w3-v2u6i-3i0z4

More vectors are in `test/mask.mjs`.

## Reference implementation

Runs on any Python 3 with OpenSSL, without this app.

```python
import hashlib, hmac, struct, sys

ALPHABETS = ["0123456789", "abcdefghijklmnopqrstuvwxyz", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"]

def mask(name, secret, site, counter, text, unmask=False):
    user_salt = b"com.lyndir.masterpassword" + struct.pack(">I", len(name.encode())) + name.encode()
    user_key = hashlib.scrypt(secret.encode(), salt=user_salt, n=32768, r=8, p=2, dklen=64, maxmem=256 * 1024 * 1024)
    mask_salt = b"com.lyndir.masterpassword.mask" + struct.pack(">I", len(site.encode())) + site.encode() + struct.pack(">I", counter)
    mask_key = hmac.new(user_key, mask_salt, hashlib.sha256).digest()
    chars = list(text)
    stream = b"".join(hmac.new(mask_key, struct.pack(">I", b), hashlib.sha256).digest() for b in range((len(chars) * 2 + 31) // 32))
    out = []
    for i, ch in enumerate(chars):
        abc = next((a for a in ALPHABETS if ch in a), None)
        if abc is None:
            out.append(ch)
            continue
        k = int.from_bytes(stream[2 * i:2 * i + 2], "big") % len(abc)
        out.append(abc[(abc.index(ch) + (-k if unmask else k)) % len(abc)])
    return "".join(out)

if __name__ == "__main__":
    # mask.py NAME SECRET SITE COUNTER TEXT [unmask]
    print(mask(*sys.argv[1:4], int(sys.argv[4]), sys.argv[5], len(sys.argv) > 6 and sys.argv[6] == "unmask"))
```
