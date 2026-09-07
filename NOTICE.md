# Third-party notices

Spectre Web is GPLv3, see `LICENSE`.
It bundles these third-party components under their own licenses.

- `plugins/jquery/`: jQuery 3.5.1, MIT, JS Foundation and other contributors.
- `plugins/bootstrap/`: Bootstrap 5.0.0-beta1, MIT, The Bootstrap Authors.
- `plugins/fontawesome/`: Font Awesome Free 6.7.2, Fonticons, Inc. Icons CC BY 4.0, fonts SIL OFL 1.1, code MIT; full text in `plugins/fontawesome/LICENSE.txt`.
- `js/spectre/scrypt.js` and `js/spectre/pbkdf2.js`: by Tom Thorogood, from mpw-js (https://github.com/tmthrgd/mpw-js), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
  Modified from upstream: restructured to run inside a Web Worker via importScripts, the CryptoJS fallback and the setImmediate yield removed.
  The single-file build in `docs/` concatenates them and drops the importScripts lines.
