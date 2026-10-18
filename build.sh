#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$ROOT"

command -v minify >/dev/null 2>&1 || {
    echo "I need minify (go's minify)" >&2
    exit 1
}

command -v cargo >/dev/null 2>&1 || {
    echo "I need cargo" >&2
    exit 1
}

rm -rf dist
mkdir -p dist

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT HUP INT TERM

# stage
mkdir -p "$work/site"
cp -R src/. "$work/site/"

# exclude backend sourcecode from the build
rm -rf "$work/site/backend"

minify -r -o dist/ "$work/site/"

find dist -type f \
    \( -name '*.html' -o -name '*.css' -o -name '*.js' \
       -o -name '*.txt' -o -name '*.xml' \) \
    -exec gzip -9 -k -f {} +

cargo build --release \
    --manifest-path src/backend/Cargo.toml \
    --target-dir "$work/target"

mkdir -p dist/bin
install -m 755 "$work/target/release/visitors" dist/bin/visitors

find dist -type d -empty -delete
