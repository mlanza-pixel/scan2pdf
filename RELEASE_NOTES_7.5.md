# DocuScan Pro v7.5

Built from v7.74.4. The requested release label is v7.5. The npm package uses the semver-compatible value 7.5.0.

## Changes

- The header shows a green Online or red Offline status next to DocuScan Pro. Tour this page uses the former status button's 36 px height. Header actions wrap into a dedicated row on narrow screens.
- Undo, Redo, and Remove sit immediately above Export in Sign, Studio, and PDF Tools. Studio history covers the last ten page changes, including image import, removal, rotation, crop, and enhancement.
- Sign groups Highlight, Underline, and Strike on one row, then Stamp and Watermark. Text settings come before history and export.
- A drawn signature's resize handle updates its on-page dimensions using the same page percentages as PDF export.
- Sign and Studio outline the last pressed button. Studio uses the standard button style for enhancements and the OCR label and icon used in PDF Tools.
- First-launch consent opens during initialization. Routine notifications allow taps through. Scroll spacing reserves room for the fixed navigation.
- Cache probes compare complete response content and bypass the service worker cache on their no-store passes. The reload test checks the exact title, active service worker, expected cache, and page width.

## Verification

- All 18 core checks passed using three JPGs and 5- and 10-page PDFs.
- Fifteen Chromium workflow checks passed across desktop, emulated iPhone and emulated iPad. These covered consent, image import and export, Studio removal/undo/redo, Sign text export and drawn signature resize, Library save/reopen, and navigation with a horizontal overflow assertion.
- An additional 430 px touch viewport check passed for workspace widths, status changes, and enhancement selection.
- Chromium passed 100 desktop reloads and 10 reloads per mobile profile. A separate local upgrade from v7.74.4 to v7.5 preserved browser storage and consent and activated the new cache.
- The three local browser OCR checks stopped while loading Tesseract from its CDN. OCR accuracy on this build remains unverified. The package retains the OCR regression and fixtures for GitHub Actions.
- GitHub Actions on the published build and physical iOS verification are pending.

Test reports for this build are in `docs/test-evidence-v7.5/`. Older screenshots and reports are historical.

## Publish

Select this ZIP explicitly in the Windows publisher. After GitHub Pages deploys it, open `https://mlanza-pixel.github.io/scan2pdf/?v=7.5` and verify the Device Self-Test version.
