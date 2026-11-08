#!/usr/bin/env bash
set -euo pipefail

check_chromium() {
  timeout 30s python - <<'PY'
from playwright.sync_api import sync_playwright

with sync_playwright() as playwright:
    with playwright.chromium.launch() as browser:
        browser.new_page()
PY
}

timeout 4m python -m playwright install chromium
if ! check_chromium; then
  echo "Chromium could not start. Installing Linux browser dependencies."
  timeout --kill-after=15s 4m python -m playwright install-deps chromium || {
    echo "::error::Chromium dependency installation failed or timed out. See the package manager output above."
    exit 1
  }
  check_chromium
fi
