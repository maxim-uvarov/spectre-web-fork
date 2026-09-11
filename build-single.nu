#!/usr/bin/env nu
# Build the single-file variant of Spectre Web into dist/. The Pages workflow
# in .github/workflows/pages.yml publishes that folder.
#
# Why: the user wants to verify what a host serves from an iPhone with Safari
# and Shortcuts alone. One HTML file plus one service worker is a check of two
# URLs; the multi-file layout is twenty. The sources stay multi-file, this
# script inlines them, so nothing is maintained twice.
#
# Usage: nu build-single.nu [--skip-tests]

const ROOT = path self | path dirname

const MIME = {
    woff2: "font/woff2",
    svg: "image/svg+xml",
    png: "image/png",
}

# Worker chain in dependency order: every importScripts call is dropped and the
# files are concatenated into one blob, which is what importScripts would have
# done at run time.
const WORKER_CHAIN = [
    js/spectre/pbkdf2.js
    js/spectre/spectre-types.js
    js/spectre/scrypt.js
    js/spectre/bip39.js
    js/spectre/spectre-algorithm.js
    js/spectre/spectre-worker.js
]

# The BIP-39 English list, as shipped: sha256 of the words, one per line.
# Why: a changed word changes every seed phrase, silently. A wallet made on
# the old build would not restore on the new one, so the build must stop
# before it ships that.
const BIP39_LIST_SHA256 = "2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda"

def source-path [relative: string]: nothing -> string {
    $ROOT | path join $relative | path expand
}

def read-text [relative: string]: nothing -> string {
    open --raw (source-path $relative)
}

def data-uri [relative: string]: nothing -> string {
    let mime = $MIME | get ($relative | path parse | get extension)
    let base64 = open --raw (source-path $relative) | into binary | encode base64
    $"data:($mime);base64,($base64)"
}

def sha256-base64 []: string -> string {
    hash sha256 | decode hex | encode base64
}

# Replace an anchor that has to be there; a missing anchor means the sources
# changed under this script and the build must stop, not ship a half-inlined page.
def must-replace [from: string, to: string, --regex]: string -> string {
    let text = $in
    let found = if $regex { $text =~ $from } else { $text | str contains $from }
    if not $found {
        error make {msg: $"anchor not found: ($from)"}
    }
    $text | str replace --all --regex=$regex $from $to
}

# Inline a stylesheet: url() assets become data URIs, truetype fallbacks and
# source maps go.
def inline-css [relative: string]: nothing -> string {
    let dir = $relative | path dirname
    let css = read-text $relative
        | str replace --all --regex r#',url\([^)]*\.ttf\) format\("truetype"\)'# ''
        | str replace --regex r#'/\*# sourceMappingURL=.*?\*/'# ''
    $css
    | parse --regex r#'url\(["']?(?<url>[^)"']+)["']?\)'#
    | get url
    | where $it !~ '^data:'
    | uniq
    | reduce --fold $css {|url, acc|
        $acc | str replace --all $url (data-uri ($dir | path join $url))
    }
}

def inline-js [relative: string]: nothing -> string {
    read-text $relative | str replace --regex '//# sourceMappingURL=.*' ''
}

def check-bip39-list []: nothing -> nothing {
    let words = read-text js/spectre/bip39.js
        | parse --regex r#'(?s)spectre\.bip39Words = Object\.freeze\(\[(?<body>.*?)\]\);'#
        | get body.0
        | parse --regex r#'"(?<word>[a-z]+)"'#
        | get word
    let actual = $words | str join "\n" | $in + "\n" | hash sha256
    if ($words | length) != 2048 or $actual != $BIP39_LIST_SHA256 {
        error make {msg: $"BIP-39 word list changed: ($words | length) words, sha256 ($actual)"}
    }
}

# Why: the seed derivation is a contract, see SEED-WORDS.md. A build that moves
# a vector must not reach dist/.
def check-seed-words []: nothing -> nothing {
    let result = node (source-path test/seed-words.mjs) | complete
    if $result.exit_code != 0 {
        error make {msg: $"seed words test failed:\n($result.stderr)"}
    }
    print $result.stdout
}

def worker-source []: nothing -> string {
    $WORKER_CHAIN
    | each {|file| read-text $file | lines | where $it !~ '^importScripts\(' | str join "\n" }
    | str join "\n"
}

# spectre-service.js starts the worker from a URL; here the worker code is
# already in hand, so the blob holds the code itself.
def inline-service []: nothing -> string {
    inline-js js/spectre/spectre-service.js
    | must-replace 'spectre.worker = newWorkerFromURL("js/spectre/spectre-worker.js");' ('spectre.worker = new Worker(URL.createObjectURL(new Blob([' + (worker-source | to json --raw) + '], {type: "application/javascript"})));')
}

def inline-manifest []: nothing -> string {
    let json = read-text manifest.webmanifest
        | from json
        | update icons [{src: (data-uri images/icon.svg), sizes: any, type: image/svg+xml}]
        | to json --raw
    $"data:application/manifest+json;base64,($json | encode base64)"
}

def inline-stylesheets []: string -> string {
    let html = $in
    $html
    | parse --regex r#'(?<tag><link rel="stylesheet" href="(?<href>[^"]+)"(?<attributes>[^>]*)>)'#
    | reduce --fold $html {|link, acc|
        $acc | must-replace $link.tag $"<style($link.attributes)>(inline-css $link.href)</style>"
    }
}

def inline-scripts []: string -> string {
    let html = $in
    $html
    | parse --regex r#'(?<tag><script defer src="(?<src>[^"]+)"></script>)'#
    | reduce --fold $html {|script, acc|
        let js = if $script.src == "js/spectre/spectre-service.js" { inline-service } else { inline-js $script.src }
        $acc | must-replace $script.tag $"<script>($js)</script>"
    }
}

# Every inline block is named by its hash, so the policy admits exactly the
# code in this file and nothing else. Remote sources are gone, so the rest
# is 'none' and data:.
def hashed-csp []: string -> string {
    let html = $in
    let hashes = {|pattern|
        $html | parse --regex $pattern | get body | each {|body| $"'sha256-($body | sha256-base64)'" } | str join ' '
    }
    let scripts = do $hashes '(?s)<script>(?<body>.*?)</script>'
    let styles = do $hashes '(?s)<style(?: [^>]*)?>(?<body>.*?)</style>'
    $html | must-replace --regex '<meta http-equiv="Content-Security-Policy" content="[^"]*">' $"<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src ($scripts); style-src ($styles); img-src data:; font-src data:; worker-src 'self' blob:; manifest-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'\">"
}

def build-html []: nothing -> string {
    read-text index.html
    | inline-stylesheets
    | inline-scripts
    | must-replace '<link rel="icon" href="images/icon.svg">' $'<link rel="icon" href="(data-uri images/icon.svg)">'
    | must-replace '<link rel="apple-touch-icon" href="images/icon.png">' $'<link rel="apple-touch-icon" href="(data-uri images/icon.png)">'
    | must-replace '<link rel="manifest" href="manifest.webmanifest">' $'<link rel="manifest" href="(inline-manifest)">'
    | hashed-csp
}

# The cache name carries the hash of index.html, so a new build changes sw.js
# and the browser replaces the old cache on its own; no manual bump.
def build-sw [html: string]: nothing -> string {
    let build = $html | hash sha256 | str substring 0..15
    read-text sw.js
    | must-replace --regex 'const CACHE = "[^"]*";' $'const CACHE = "spectre-web-single-($build)";'
    | must-replace 'Bump CACHE to ship new assets.' 'The cache name carries the build hash, so a new build ships itself.'
    | must-replace --regex '(?s)const PRECACHE = \[.*?\];' 'const PRECACHE = ["./", "index.html", "sw.js"];'
}

# --skip-tests leaves out the node test only; the word list hash check is pure
# Nushell and stays.
def main [--skip-tests]: nothing -> nothing {
    check-bip39-list
    if not $skip_tests {
        check-seed-words
    }
    let out = source-path dist
    mkdir $out
    let html = build-html
    $html | save --force ($out | path join index.html)
    build-sw $html | save --force ($out | path join sw.js)
    ls $out | select name size | to nuon --pretty | print
}
