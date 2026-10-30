#!/usr/bin/env bash
# Package DocuScan Pro into a single zip for GitHub upload.
# Output: /home/z/my-project/download/docuscan-pro-v<version>.zip
# Version is read from js/app.js APP_VERSION automatically.
set -euo pipefail

SRC_DIR="/home/z/my-project"

# Read APP_VERSION from js/app.js
VERSION=$(grep -m1 'APP_VERSION' "$SRC_DIR/js/app.js" | sed -E "s/.*APP_VERSION\s*=\s*'([^']+)'.*/\1/")
if [ -z "$VERSION" ]; then
  echo "ERROR: could not read APP_VERSION from js/app.js"
  exit 1
fi

OUT_ZIP="/home/z/my-project/download/docuscan-pro-v${VERSION}.zip"
STAGE_DIR="$(mktemp -d)/docuscan-pro"
mkdir -p "$STAGE_DIR"

echo "Packaging DocuScan Pro v${VERSION}..."
echo "Output: $OUT_ZIP"
echo
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

# Documentation deliverables (PDF, DOCX, XLSX Help Manual)
cp "$SRC_DIR/download/DocuScan-Pro-Help-Manual.pdf" "$STAGE_DIR/docs/" 2>/dev/null || {
  mkdir -p "$STAGE_DIR/docs"
  cp "$SRC_DIR/download/DocuScan-Pro-Help-Manual.pdf" "$STAGE_DIR/docs/"
  cp "$SRC_DIR/download/DocuScan-Pro-Help-Manual.docx" "$STAGE_DIR/docs/"
  cp "$SRC_DIR/download/DocuScan-Pro-Help-Content-Inventory.xlsx" "$STAGE_DIR/docs/"
}

# Visual regression baselines (helpful for future PRs)
mkdir -p "$STAGE_DIR/download/screenshots"
cp "$SRC_DIR/download/screenshots/"*.png "$STAGE_DIR/download/screenshots/" 2>/dev/null || true

# Verify
echo
echo "Staged top-level contents:"
( cd "$STAGE_DIR" && find . -maxdepth 2 -type d | sort )

# Zip
echo
echo "Zipping..."
( cd "$(dirname "$STAGE_DIR")" && zip -qr "$OUT_ZIP" "docuscan-pro" )

# Cleanup staging
rm -rf "$(dirname "$STAGE_DIR")"

# Verify zip
echo
echo "Total files in zip:"
unzip -l "$OUT_ZIP" | tail -1

echo
echo "Top-level entries in zip:"
unzip -l "$OUT_ZIP" | awk 'NR>3 {print $4}' | grep -E '^docuscan-pro/[^/]*/?$' | sort -u | head -20

echo
echo "Wrote: $OUT_ZIP"
ls -la "$OUT_ZIP"
