# DocuScan Pro v7.7.0 — test report

## Verified in this environment
- Static source/layout checks: 14/14 passed (`tests/results/v77-static-results.json`).
- Release completeness checks: 7/7 passed (`tests/results/v77-release-integrity.json`).
- JavaScript syntax: `node --check js/app.js` passed.
- Screenshot capture attempted on iPhone, iPad, Android and desktop emulation: **0 captured**; Chromium returned `net::ERR_BLOCKED_BY_ADMINISTRATOR` for the local test server on all four profiles. See `screenshots/capture-report.json`.
- Browser navigation stress attempted on iPhone, iPad and Android emulation: **blocked** by the same browser networking policy. See `tests/results/v77-browser-stress.json`.
- Node PDF regression suite: **NOT RUN**; `pdf-lib` dependency absent in this container. Run `npm install` followed by `npm test` on a permitted machine.

## NOT CERTIFIED
Real iPhone/iPad/Android operation; camera and image import; 50/100 image import; OCR 20/50 pages; 100/1000-page PDFs; memory use; offline persistence; full export, sharing, printing, accessibility, and all Help flows. All limits are provisional until tested on actual hardware. The v7.5.9 manuals are preserved, and a revised v7.7 Help Manual (DOCX/PDF) plus a 229-row editable in-app Help inventory have been added. The historical manual was updated and supplemented; a full live Help UI walkthrough remains unverified.

## Recommended next steps
Run `Run_All_Tests_Windows.bat`, capture and stress scripts on a local Windows machine with Playwright and Chromium. Reconcile every screenshot and test report, update the manuals, and do not deploy until the outstanding workflows pass.

## Additional testing — 2026-11-05
- **Independent PDF fixture pipeline: 9/9 passed.** Decoded all three distinct JPG fixtures; created three-page Letter, A4 and Fit PDFs; verified 5-page and 10-page PDFs; merged them into 15 pages; rotated and annotated the merged file; split the 10-page input to five pages. See `tests/results/v77-fixture-pipeline.json` and generated PDFs in `tests/results/v77-fixture-pipeline/`. These operations use independent Python PDF libraries, **not the application's browser UI**.
- **Chromium browser capture: 0 screenshots**, blocked by `ERR_BLOCKED_BY_ADMINISTRATOR` on local URL. The 3-image real UI E2E test, 5/10-page in-app workflows, and native device crash testing are **not verified**. The reusable browser scripts and fixtures remain bundled for execution on an unrestricted machine.
- **Documentation:** v7.7 Help Manual in DOCX and PDF (28 pages), plus 229-row editable Help inventory; Help source labels synchronized for revised navigation and Studio hand-off wording.
- **Source validation:** 14/14 static checks; 7/7 package checks; `node --check js/help-system.js` passed.
