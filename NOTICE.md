# Third-party notices

Spectre Web is GPLv3, see `LICENSE`.
It bundles two third-party components under their own licenses.

- `js/spectre/scrypt.js` and `js/spectre/pbkdf2.js`: by Tom Thorogood, from mpw-js (https://github.com/tmthrgd/mpw-js), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
  Modified from upstream: restructured to run inside a Web Worker via importScripts, the CryptoJS fallback and the setImmediate yield removed.
  The single-file build (`build-single.nu`) concatenates them and drops the importScripts lines.
- `js/spectre/bip39.js` embeds the BIP-39 English word list from https://github.com/bitcoin/bips/blob/master/bip-0039/english.txt, MIT (per the BIP-39 header).
  Unchanged: sha256 of the upstream file is 2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda.
