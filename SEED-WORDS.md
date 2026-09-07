# Seed words

The "Seed words" result type turns a Spectre identity into a 24-word BIP-39 mnemonic.
This page is the contract: the derivation below is frozen.
Once one real wallet uses it, any change to it, however small, is a wallet-loss event.

## Inputs

- Full name and Spectre secret, as typed on the sign-in form.
- Algorithm version. It only matters when the name or the site holds non-ASCII characters: V0-V2 count the name in characters and V0-V1 count the site in characters; V3 counts both in bytes.
- Site and counter.

The purpose radio (Password, Login name, Security answer) has no effect.
The seed uses its own fixed purpose string, so it shares no bytes with any password of the same site.

The 24 words carry exactly the entropy of the Spectre secret behind them.
A wallet seed has no rate limit and no reset, and the chain is public, so the secret must be long and random.

## Derivation

    user-salt = "com.lyndir.masterpassword" . uint32be(len(name)) . name
    user-key  = scrypt(secret, user-salt, N=32768, r=8, p=2, dkLen=64)
    seed-salt = "com.lyndir.masterpassword.seed" . uint32be(len(site)) . site . uint32be(counter)
    entropy   = HMAC-SHA-256(user-key, seed-salt)          # 32 bytes
    words     = BIP-39(entropy)                            # 256 bits + 8 checksum bits, 24 words, English list

All strings are UTF-8.
`len(name)` is the byte length under V3 and the character length under V0-V2.
`len(site)` is the byte length under V2-V3 and the character length under V0-V1.
The reference implementation below is V3 only.
The BIP-39 English list is the upstream one, unchanged (sha256 `2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda`).

## Test vector

    name     = Robert Lee Mitchell
    secret   = banana colored duckling
    version  = 3
    site     = wallet
    counter  = 1
    words    = sound average tumble social achieve adapt cement use arm sheriff pear express combine seminar public oppose spider answer woman people leaf wish million snow

## Reference implementation

Runs on any Python 3 with OpenSSL, without this app.

```python
import hashlib, hmac, struct, sys

WORDS = open("bip39-english.txt").read().split()  # the upstream list, 2048 words
assert len(WORDS) == 2048

def seed_words(name, secret, site, counter=1):
    user_salt = b"com.lyndir.masterpassword" + struct.pack(">I", len(name.encode())) + name.encode()
    user_key = hashlib.scrypt(secret.encode(), salt=user_salt, n=32768, r=8, p=2, dklen=64, maxmem=128 * 1024 * 1024)
    seed_salt = b"com.lyndir.masterpassword.seed" + struct.pack(">I", len(site.encode())) + site.encode() + struct.pack(">I", counter)
    entropy = hmac.new(user_key, seed_salt, hashlib.sha256).digest()
    checksum = hashlib.sha256(entropy).digest()[0]
    bits = "".join(f"{b:08b}" for b in entropy) + f"{checksum:08b}"
    return " ".join(WORDS[int(bits[i:i + 11], 2)] for i in range(0, 264, 11))

if __name__ == "__main__":
    print(seed_words(*sys.argv[1:4], int(sys.argv[4]) if len(sys.argv) > 4 else 1))
```
