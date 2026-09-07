# Third-party notices

Spectre Web is GPLv3, see `LICENSE`.
It bundles one third-party component under its own license.

- `js/spectre/scrypt.js` and `js/spectre/pbkdf2.js`: by Tom Thorogood, from mpw-js (https://github.com/tmthrgd/mpw-js), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
  Modified from upstream: restructured to run inside a Web Worker via importScripts, the CryptoJS fallback and the setImmediate yield removed.
  The single-file build in `docs/` concatenates them and drops the importScripts lines.
