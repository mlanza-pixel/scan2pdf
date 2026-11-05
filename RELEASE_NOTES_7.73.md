# DocuScan Pro v7.73.0 — OCR fixture and testing documentation release

- Bumped app, package, manifest, device diagnostics and service worker cache versions.
- Added independently implemented `scripts/generate_ocr_fixtures_v773.py` using Pillow and ReportLab: deterministic synthetic image-backed PDFs, known expected text, clean/low contrast/rotated/blurred/noisy pages, JSON ground truth and SHA256.
- Added `scripts/verify_ocr_fixtures_v773.py` to validate page count, embedded images, hash, and minimum byte sizes.
- Added CI fixture generation, verification and upload artifact for 5/10/25/50-page PDFs. Large files are generated in CI instead of bloating mobile app downloads.
- Included 5/10-page fixture examples in `tests/fixtures/sample/`.
- Added permanent testing master register, release-by-release history, explicit release gates and documentation policy.
- Existing v7.72 on-device OCR and screenshot features retained.

**Not claimed:** This release does NOT incorporate code from `digidigital/ocrtestdata`; it is an independent implementation. The generated fixture verifier does not measure OCR accuracy. Real iPad/iPhone browser testing and end-to-end editing remain pending. Screenshots are browser DOM captures, not native screenshots. Existing v7.7 Help DOCX/PDF and UI workbook are retained unchanged; a full editorial update is still pending.
