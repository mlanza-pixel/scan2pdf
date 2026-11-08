# DocuScan Pro v7.71.0 — Regression repair release

Baseline: v7.7.0 ALL_IN_ONE_PUBLISH. No application user data is intentionally reset.

## Corrections
- Fix stale browser title and internal APP_VERSION to v7.71.0; bump service worker cache to prevent stale releases.
- Replace screenshot runner with a strict Playwright runner that checks the Terms acceptance box and clicks Start Using App before navigating.
- Navigate with visible bottom navigation controls; never simulate navigation by editing DOM classes.
- Replace hidden legacy tab selectors with the six visible PDF Tools category buttons. Check panel selection, collapse and screenshots.
- Capture all six workspaces, all six tool categories, and the Tools tour on each of four emulated viewport profiles (52 screenshots expected).
- Record browser JavaScript errors and fail the workflow on missing screenshots, navigation failures or errors.
- Repeat actual navigation and category toggles in a strict stress runner.
- Apply a narrow-screen Library min-width containment fix; recheck actual overflow in new evidence.
- Keep all v7.7 manuals, editable spreadsheets, tour reference, publisher and original fixtures.

## Verification limitations
The GitHub Pages URL and localhost browser navigation are blocked in the assistant environment (ERR_BLOCKED_BY_ADMINISTRATOR). The tests are packaged to run on GitHub Actions after publication; do not mistake static validation for live certification. Physical iPhone/iPad/Android memory behavior, OCR at large scale and real camera remain unverified.

## Device Self-Test update (same 7.71 version)

About now offers a Device Self-Test for real iPhone, iPad, Android and desktop browsers. Quick, Standard and Stress modes run isolated generated-fixture diagnostics and display screenshot-friendly results with Copy Results and Download JSON. This is an on-device diagnostic, not a replacement for GitHub Actions' browser workflow or real user interaction testing. See `docs/DEVICE_SELF_TEST_v7.71.md`.

## Detailed live button inventory update
Added opt-in safe navigation tap-through and every-workspace button inventory to About → Device Self-Test. Full per-button JSON includes visibility, disabled state, labels and layout warnings. Non-navigation actions are explicitly untested; see docs/DETAILED_ON_DEVICE_AUDIT_v7.71.md.
