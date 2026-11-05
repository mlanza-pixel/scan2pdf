# Release-by-release testing history

| Version | Evidence | Confirmed | Not confirmed / open |
|---|---|---|---|
| 7.71.0 | User-provided desktop Standard and Stress JSON (2026-11-05) | 6 navigation taps; 125 controls inventoried; basic PDF library operations; no observed browser errors | 125 controls were not functionally clicked; OCR not run; 50/100-page PDFs were ~1–2 KB |
| 7.72.0 | Source package inherited | Added image-backed PDF generator, OCR token checks, DOM screenshot attempts | No verified actual iOS device run or complete app editor pipeline result provided |
| 7.73.0 | This release: fixture generation and verifier run locally | Deterministic 5/10-page image PDFs and ground truth generated; verifier checks image presence, SHA256, page counts | OCR accuracy against PDF ground truth NOT YET EXECUTED; real iPad/iPhone runs NOT YET EXECUTED; external upstream repository not integrated |

**Mandatory:** append a row for every release. Record actual date/device, run ID, artifacts, failures, skipped tests, known issues and any changes to thresholds. Never overwrite historical findings with assumptions.


## v7.74.0 — upstream fixture integration
- Added vendored upstream generator and retained original licenses.
- Added a bounded fixture runner and GitHub Actions generation/artifact upload.
- Local fixture generation verification: see `TEST_REPORT_7.74.md`.
- Pending: real iPhone/iPad executions; OCR ground-truth scoring; real-app import/OCR/export of upstream fixtures; UI screenshots of generated fixtures.
