# GitHub Actions testing — v7.71

On push to main, `.github/workflows/automated-tests.yml` runs Node regression, Playwright screenshot capture and real navigation stress. A green check now requires 52 screenshots (6 workspaces + 6 Tools categories + Tools tour on 4 device profiles) and no JavaScript page errors.

Download `docuscan-v7-71-test-evidence` from the run's Artifacts section and upload it for a screenshot audit. Device profiles are browser emulation, not physical devices. Full import/OCR/export stress and real-device testing require separate validation.

To run locally: `python -m http.server 8765`, then `python scripts/universal_capture_v771.py http://127.0.0.1:8765/` and `python scripts/test_stress_v771.py http://127.0.0.1:8765/`. Install `playwright` and Chromium first.
