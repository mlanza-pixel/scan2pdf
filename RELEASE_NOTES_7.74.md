# DocuScan Pro v7.74.0 — Upstream OCR fixture integration

- Integrated the actual user-provided `digidigital/ocrtestdata` source into `tests/vendor/ocrtestdata-upstream/`, including its MIT and bundled font licenses. No upstream files were altered.
- Added `scripts/generate_upstream_ocr_fixtures_v774.py` to generate bounded image-only, QR-separator PDFs with per-file hash, image count, page count, bytes, and elapsed-time manifest.
- GitHub Actions now installs generator dependencies, generates 5/10/25-page PDFs, and uploads fixtures as artifacts.
- Retained v7.73's existing fixtures, mobile self-test, and screenshot capture.
- Permanent testing master register and release test history updated.
- **Limitations:** Upstream generates PDFs but does not score OCR accuracy. CI fixture-generation success is not evidence that the app successfully imports, recognizes, edits, or exports those documents. Real-device testing is still required.
