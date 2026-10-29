#!/usr/bin/env bash
# Package DocuScan Pro into a single zip for GitHub upload.
# Output: /home/z/my-project/download/docuscan-pro.zip
set -euo pipefail

SRC_DIR="/home/z/my-project"
OUT_ZIP="/home/z/my-project/download/docuscan-pro.zip"
STAGE_DIR="$(mktemp -d)/docuscan-pro"
mkdir -p "$STAGE_DIR"

# Files to copy (everything that belongs in the repo, nothing else)
echo "Staging files..."
cp "$SRC_DIR/index.html" "$STAGE_DIR/"
cp "$SRC_DIR/manifest.webmanifest" "$STAGE_DIR/"
cp "$SRC_DIR/sw.js" "$STAGE_DIR/"
cp "$SRC_DIR/README.md" "$STAGE_DIR/"
cp "$SRC_DIR/.gitignore" "$STAGE_DIR/"

# CSS, JS, assets (icons + samples), scripts, .github workflows
cp -r "$SRC_DIR/css" "$STAGE_DIR/"
cp -r "$SRC_DIR/js" "$STAGE_DIR/"
cp -r "$SRC_DIR/assets" "$STAGE_DIR/"
cp -r "$SRC_DIR/scripts" "$STAGE_DIR/"
cp -r "$SRC_DIR/.github" "$STAGE_DIR/"

# Visual regression baselines (helpful for future PRs)
mkdir -p "$STAGE_DIR/download/screenshots"
cp "$SRC_DIR/download/screenshots/"*.png "$STAGE_DIR/download/screenshots/"

# Verify
echo
echo "Staged contents:"
( cd "$STAGE_DIR" && find . -type f | sort | sed 's|^\./|  |' )

# Zip
echo
echo "Zipping..."
( cd "$(dirname "$STAGE_DIR")" && zip -qr "$OUT_ZIP" "docuscan-pro" )

# Cleanup staging
rm -rf "$(dirname "$STAGE_DIR")"

# Verify zip
echo
echo "Zip contents:"
unzip -l "$OUT_ZIP" | head -50
echo "..."
unzip -l "$OUT_ZIP" | tail -5

echo
echo "Wrote: $OUT_ZIP"
ls -la "$OUT_ZIP"
