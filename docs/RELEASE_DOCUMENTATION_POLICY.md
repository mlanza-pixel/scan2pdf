# DocuScan Pro — mandatory documentation policy
Every future release must contain the editable UI Field Reference workbook, updated Help Manual DOCX and PDF, Overview PDF, Help Content Inventory, release notes, tests and scripts, screenshots in separate device directories, and a test results report. Preserve previous versions in docs/legacy; update the primary docs for the current release. Each UI label must have a stable ID, page, current text, Change To, behavior, associated test ID and Help linkage. If a test was not executed, mark it NOT RUN rather than PASS.

## v7.7 limitations
This release carries forward v7.5.9 manuals under docs/legacy; those manuals have NOT been comprehensively revised to reflect v7.7 behavior. The field-reference workbook is new and is a starting inventory. Browser stress does not establish real iPhone/iPad/Android crash-free operation or OCR/image limits. Do not claim production readiness from static checks alone.

### v7.7 current documentation
- `DocuScan-Pro-Help-Manual-v7.7.docx` and `.pdf` — updated manual, preserving legacy detail and adding revised workflows.
- `DocuScan-Pro-Help-Content-Inventory-v7.7.xlsx` — 229 editable Help fields/steps.
- `DocuScan-Pro-UI-Field-Reference-v7.7.xlsx` — page/element ID/description/change request/test matrix.
- `legacy/` — historical v7.5.9 files for traceability; do not substitute for current docs.

## Mandatory Tour This Page release gate (added v7.7)
Update `js/help-system.js` walkthroughs, `docs/Tour-Steps-v7.7.json`, the `Tour This Page` worksheet in `DocuScan-Pro-UI-Field-Reference-v7.7.xlsx`, and the Help Manual DOCX/PDF in the same change. Run `node tests/tours/check-tour-contract.mjs`, and then perform interactive Next/Back/Skip and mobile layout testing. Do not report mobile tour certification based only on static checks.

## v7.73 mandatory testing documentation
Every release must update `docs/TESTING_MASTER_REGISTER.md` and append to `docs/RELEASE_TEST_HISTORY.md`. Keep ground-truth manifests, SHA256 hashes, test evidence, and explicit PASS/FAIL/WARNING/NOT RUN status. The real-device screenshots, OCR transcript comparison, full editor workflow and native iOS results are release gates, not implied by fixture generation.
