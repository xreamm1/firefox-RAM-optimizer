#!/usr/bin/env sh
# Packs the extension into dist/ram-optimizer-<version>.xpi (a zip archive).
set -e
cd "$(dirname "$0")"
VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' src/manifest.json | head -n1)
mkdir -p dist
OUT="dist/ram-optimizer-$VERSION.xpi"
rm -f "$OUT"
(cd src && zip -r -q -X "../$OUT" . -x '.*')
echo "Built $OUT"
