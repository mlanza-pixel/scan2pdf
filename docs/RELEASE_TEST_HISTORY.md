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

## v7.74.1 — application-level workflow coverage added

Added Playwright UI workflow suite for Studio import/create/export, PDF Tools reopen, real OCR with known tokens, Sign import/add-text/export, Library save/item action, and uncaught browser errors. **Status at packaging:** script syntax checked; full suite not verified as passing in local environment (browser run exceeded execution budget). CI run and physical-device results pending. Editing placement and full saved-document reopen assertions are outstanding, not certified.


### v7.74.2 — Sharded browser workflow tests
18 independently scheduled case/profile jobs, individual reports and failure screenshots. Syntax checked; local browser blocked by environment network policy; GitHub run pending.

## v7.74.3
Corrective CSS for iPhone diagnostics clipping/overflow; Safari-incompatible screenshot exporter replaced by clearly labeled diagnostic layout maps. Physical-device retest pending. No claims of native screenshot capture. Split end-to-end workflow test matrix retained.

## 7.74.4 — repeated cache/reload testing
Added on-device 10/20/100 resource-consistency loops and independent GitHub 10/20/100 reload shards. Code syntax and ZIP packaging verified locally; live browser and physical iOS results **pending**. Cache version updated. Existing iPhone overflow/screenshot concerns require physical re-test.
