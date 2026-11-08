# DocuScan Pro v7.72.0 — realistic stress diagnostics

- 5-, 10-, 50-, and 100-page PDFs now embed actual generated 960×1280 JPEG scans, with page-count verification and a minimum size assertion. This avoids misleading 1–2 KB blank-page results.
- Actual Tesseract OCR recognition on generated English text with token matching, plus 5 sequential OCR jobs in Stress mode. OCR may require network access to the pinned Tesseract and language-data CDNs; inability to load is reported as a warning.
- Optional automatic six-workspace DOM screenshot capture with a Download Screenshots action. Uses SVG foreignObject; Safari may block or incompletely render this method. Such failures are warnings and are not silently marked pass. These are not native OS screenshots. Browsers may block multiple automatic downloads; JSON reports remain available.
- The existing six-navigation tap-through and 125-control inventory remain non-destructive. Editing buttons are NOT all clicked; camera, share, print, native file dialogs are excluded.
- Stress tests can consume considerable device memory; run Standard first. Stop is checked between pages/OCR jobs, not during a single OCR recognition.
- Version and service-worker cache bumped to 7.72.0.

## Verification
JavaScript syntax and structural tests should be run before publishing. Actual iPad/iPhone behavior and screenshot capture must be verified on devices.
