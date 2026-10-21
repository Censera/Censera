#!/bin/sh
set -eu

tidy -indent -quiet -modify src/*.html
perl -0777 -i -pe 's/<meta name="generator" content=\s*"HTML Tidy[^"]*"\s*\/?>\s*//g' src/*.html

prettier --write src/css/*.css
