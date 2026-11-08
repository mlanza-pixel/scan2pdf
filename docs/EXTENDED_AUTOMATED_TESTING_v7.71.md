# DocuScan Pro v7.71 — extended automated test coverage

The GitHub Actions workflow now runs `scripts/test_extended_workflows_v771.py` after the normal regression, screenshots, navigation and 3-image/5-page/10-page smoke checks.

## New test matrix

Across Chromium emulations of iPhone (390×844), iPad (820×1180), Android (412×915), and desktop (1365×900):

- Import 10, 25, and 50 **individual** JPEG files in Studio. Confirm at least the expected number of thumbnails appear.
- Create and download a PDF from 10 Studio images; independently reopen the downloaded file with `pypdf` and verify exactly 10 pages.
- Open 20-, 50-, and 100-page PDF fixtures in Tools.
- Run a one-image Studio OCR completion smoke test and require nonempty recognized text. **This does not validate OCR accuracy.**
- Import a malformed PDF and verify the browser page remains alive.
- Fail if uncaught browser exceptions are observed.
- Save a JSON report in `tests/results/extended-v771/report.json`, and screenshots of failures under `screenshots/extended/`.

All cases report `passed` or `failed`; any failure returns a nonzero exit code, so GitHub Actions marks the run red. A red result may indicate a test fixture or selector issue; inspect the evidence before deciding whether the app is defective.

## Limitations and follow-ups

- The suite uses Chromium browser/device emulation, not physical iPhone, iPad, or Android hardware. Native camera, print/share sheets, out-of-memory process termination, and Safari/WebKit-specific behavior remain manual/physical-device tests.
- It does **not** certify 50-page OCR, 1,000-page PDFs, exact OCR accuracy, or memory-safe maximums. Larger workloads need carefully bounded test fixtures and hardware-specific measurement.
- Automated OCR may require external OCR language assets. A failure due to unavailable assets must be fixed or explicitly documented; it must not silently count as a pass.
- Each release should update this matrix, fixtures, screenshot selectors, Help content, tours, and the UI Field Reference workbook together.
