#!/bin/sh
set -eu
rm -rf dist
cp -r src dist
minify -r -o dist/ src/
find dist -type f \( -name '*.html' -o -name '*.css' -o -name '*.js' -o -name '*.txt' -o -name '*.xml' \) \
    -exec gzip -9 -k -f {} +
find dist -type d -empty -delete
