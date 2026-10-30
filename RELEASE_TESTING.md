# DocuScan Pro — Release Testing Protocol

Every release of DocuScan Pro MUST pass the walkthrough test suite before
the versioned zip is rebuilt. This document defines what "pass" means
and how to run the suite.

## When to run

- Before bumping `APP_VERSION` in `js/app.js`
- Before rebuilding `download/docuscan-pro-v<version>.zip`
- After any change that touches:
  - `index.html` (layout / DOM structure)
  - `js/app.js` (any handler that modifies preview, OCR, page nav)
  - `js/scanner.js`, `js/ocr.js`, `js/pdf-tools.js`
  - `css/layout.css` or `css/responsive.css`

## Test fixture

A 10-page test PDF lives at `assets/samples/test-10page.pdf`. Each page
has a distinct accent color and page-number footer so multi-page
operations (Split, Reorder, Delete Pages, Rotate, OCR) produce
verifiable results.

Regenerate with:
```bash
python3 scripts/make_10page_test_pdf.py
```

## Walkthrough tests (run in this order)

| # | Script | Workspace | What it covers |
|---|--------|-----------|----------------|
| 1 | `test_studio_walkthrough_v740.py` | Studio | Empty state, import, page nav, enhancement, rotate, OCR Scan, Copy/Download/Read aloud, camera timestamp, Create PDF, Send to Sign |
| 2 | `test_sign_walkthrough_v740.py` | Sign | Open PDF, page nav, Add Text, drag, resize, Add Date, Undo, Redo, Remove, Watermark, Remove watermark, Save, Download, Share |
| 3 | `test_pdf_tools_walkthrough_v740.py` | PDF Tools | Open 10-page PDF, page nav, Split tab (2nd PDF hides), Merge tab (2nd PDF shows), Merge, Rotate, Reorder (reverse), Delete Pages (3 pages), Watermark, OCR tab (Scan label + card), Scan, Copy/Download/Read aloud, Save, Download |
| 4 | `test_library_walkthrough_v740.py` | Library | Setup via Studio, search filter, clear search, partial-match search, card structure, New Folder, Refresh, Rename, Delete, re-render after navigation |

Each test prints `[PASS]` or `[FAIL]` per assertion and exits 0 on full
pass or 1 on any failure.

## How to run

```bash
# Start a static server (must serve on http://127.0.0.1:8765)
python3 -m http.server 8765 &

# Run all four walkthroughs in order
python3 scripts/test_studio_walkthrough_v740.py
python3 scripts/test_sign_walkthrough_v740.py
python3 scripts/test_pdf_tools_walkthrough_v740.py
python3 scripts/test_library_walkthrough_v740.py
```

## Pass criteria

A release is green only when ALL of the following hold:

1. All four walkthrough tests exit 0.
2. `node --check js/app.js && node --check js/scanner.js && node --check js/help-system.js && node --check js/ocr.js` succeeds.
3. No `[pageerror]` or `[error]` console messages during any walkthrough (service-worker registration errors are ignored).
4. The versioned zip rebuilds cleanly: `bash scripts/make_zip.sh` produces `download/docuscan-pro-v<version>.zip` with the new Overview PDF at `docs/DocuScan-Pro-Overview.pdf` and the 10-page test fixture at `assets/samples/test-10page.pdf`.

## If a test fails

1. Read the failure detail (`[FAIL] <name> — <detail>`).
2. If the failure is in the product (not the test), fix `js/app.js` or `index.html`, then re-run the failing test.
3. If the failure is in the test (assertion too strict, sample image too similar, etc.), fix the test, then re-run.
4. Do not skip or mark a failing test as known-broken without an explicit note in this file under "Known limitations".

## Known limitations

- `test_pdf_tools_exhaustive.py` is a longer smoke test (~3 min, 110+ assertions). It is not part of the release gate but should be run quarterly.
- `test_full_e2e.py` is a 50+ check end-to-end test. Same status as above.
- OCR tests depend on Tesseract.js downloading language data from `tessdata.projectnaptha.com` on first run. If the network is unavailable, OCR tests will fail with status `Failed`. Run again with network.

## Release zip contents

The zip includes:

- The full app source (`index.html`, `css/`, `js/`, `assets/`)
- `docs/DocuScan-Pro-Overview.pdf` — 8-page release overview (page 1 = app description; pages 2-8 = one screenshot per workspace)
- `docs/DocuScan-Pro-Help-Manual.pdf` and `.docx` — the full detailed help manual
- `docs/DocuScan-Pro-Help-Content-Inventory.xlsx` — help content inventory
- `assets/samples/test-10page.pdf` — the 10-page test fixture, so users / contributors can re-run the walkthrough tests
- `scripts/` — all test scripts and helpers
- `RELEASE_TESTING.md` — this file
- `download/screenshots/` — visual regression baselines

## Bumping the version

1. Edit `js/app.js`: bump `APP_VERSION` (e.g. `'7.4.1'` → `'7.4.2'`).
2. Edit `README.md`: bump the version line at the top.
3. Run all four walkthrough tests (above).
4. Re-generate the Overview PDF: `python3 scripts/make_overview_pdf.py` (the version string is baked in).
5. Rebuild the zip: `bash scripts/make_zip.sh`.
6. Verify the zip: `unzip -l download/docuscan-pro-v<version>.zip | grep -E "Overview|test-10page|RELEASE_TESTING"` should list all three.
