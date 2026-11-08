# Upstream OCR Test Data Integration

**Origin:** https://github.com/digidigital/ocrtestdata, user-provided source archive, commit `238628b41142330fa899bf49fadb0e59472dc492`.

**Licensing:** MIT for generator; bundled Ubuntu font license included. Keep license files with any redistribution.

## Running on Windows or GitHub Actions

Install Python 3.11+ and `pip install Faker Pillow qrcode[pil] PyMuPDF`. From the `docuscan-pro` folder run:

```bash
python scripts/generate_upstream_ocr_fixtures_v774.py --pages 5 10 25 --dpi 100 --out tests/fixtures/upstream-generated
```

For 50 or 100 pages, explicitly select `--pages 50 100`, ideally on desktop/CI. Larger image-backed documents can consume significant memory; never run 100-page generation automatically on a phone.

## Evidence and interpretation

The runner creates PDFs and `manifest.json` with file hash, bytes, page count, embedded-image verification, text-layer absence, and runtime. QR separator pages occur every third page. Image-only pages intentionally have no searchable text.

These fixtures have randomly generated text, but the upstream generator does not emit an exact per-page ground-truth transcript. Do NOT report OCR accuracy percentages from these PDFs until a ground-truth capture mechanism and comparison algorithm are added. Keep v7.73 deterministic known-text fixtures for OCR scoring.

## Every-release checklist

1. Generate fixtures; inspect manifest, sizes, hashes, and rendered pages.
2. Run actual application import/render/OCR/export tests, recording PASS/FAIL/SKIP per workflow.
3. Capture GitHub browser screenshots and actual iPad/iPhone device reports.
4. Update TESTING_MASTER_REGISTER.md, RELEASE_TEST_HISTORY.md, and the release-specific TEST_REPORT.
5. Log test runner version, app version, device/browser, and unresolved issues.
