# DocuScan Pro — permanent testing master register

**Required in every future release.** This file is the canonical list of tests and their evidence status. Do not delete previous coverage when adding new tests. Every release must update the version, fixture manifest, execution environment, observed results, failures, skipped cases, screenshots, and regressions. Do not mark a check PASS without a dated execution log. Preserve earlier release reports.

## Coverage register

| ID | Test | Implementation | Evidence needed | Limitations |
|---|---|---|---|---|
| NAV-01 | Six workspace navigation tap-through | `js/device-self-test.js` | device JSON | Not every button |
| UI-01 | Control inventory, labels, target size, horizontal clipping | device self-test | JSON + screenshots | Hidden controls not functionally exercised |
| PDF-01 | 5/10 image-backed PDF creation/reopen | device self-test | JSON with sizes | Direct pdf-lib, not editor pipeline |
| PDF-02 | 25/50/100 image-backed PDF stress | device self-test + CI fixtures | JSON, memory observations | iOS memory varies |
| OCR-01 | Actual Tesseract OCR of generated English text | device self-test | recognized text/token accuracy | Limited fixture diversity |
| OCR-02 | Five sequential OCR jobs | device self-test | JSON timing/errors | Not endurance certification |
| OCR-03 | Deterministic ground-truth fixtures, clean/blur/skew/noise/contrast | `scripts/generate_ocr_fixtures_v773.py` | PDF + `.groundtruth.json` | Generator does not perform recognition |
| OCR-04 | Fixture page count, images, SHA256, size thresholds | `scripts/verify_ocr_fixtures_v773.py` | CI logs | Structural validation only |
| OCR-05 | Ground-truth character error rate and token recall | planned | OCR transcript per page, accuracy report | **NOT IMPLEMENTED** for generated PDFs |
| IMG-01 | 10/25/50 image generation | device self-test | JSON | Not imported via app file picker |
| CAP-01 | Six workspace DOM screenshot attempts | device self-test | PNGs, JSON | Not native OS screenshots; browser limitations |
| E2E-01 | App import/edit/export/reopen, full editing controls | GitHub browser scripts (partial) | screenshots, exported PDF, assertions | Not fully covered by device self-test |
| MOB-01 | iPad Safari, iPhone Safari, Android Chrome | manual on-device tests | device JSON, screenshots | Desktop emulation not equivalent |
| SAFE-01 | No user documents touched by diagnostics | design review | source review | Check again for every modification |

## Release gate

1. Update release.json, JS version, manifest, service worker cache, About version and test report identifiers.
2. Generate fixture PDFs and ground-truth manifests; verify SHA256, page images and sizes.
3. Execute Node and GitHub Actions tests; attach evidence. Do not conflate static tests with interactive tests.
4. Run Quick, Standard and Stress on real iPad and iPhone; record hardware/browser/OS and screenshots.
5. Compare failures against prior release; track unresolved issues and regressions.
6. Update this register, `RELEASE_TEST_HISTORY.md`, Help manual, UI field reference and release notes. Mark any unupdated artifact explicitly.
7. Keep test reports, screenshots and fixture hashes per release; avoid embedding large generated fixtures into the deployable app shell.

## External inspiration and licensing

`https://github.com/digidigital/ocrtestdata` was proposed as inspiration for realistic OCR fixture generation. **No code from that repository has been copied or vendored.** The v7.73 generator is independently written with Pillow and ReportLab, so no unverified upstream license or dependencies are assumed. Review the upstream project separately before importing any of its source.


## v7.74: Upstream OCR load-data generator (permanent release test)
- Source: `tests/vendor/ocrtestdata-upstream/` from user-provided `digidigital/ocrtestdata` ZIP, upstream commit `238628b41142330fa899bf49fadb0e59472dc492`; MIT license retained, Ubuntu font licenses retained.
- Invocation: `python scripts/generate_upstream_ocr_fixtures_v774.py --pages 5 10 25 --dpi 100`. Optional higher page counts require deliberate selection; max default 100.
- Every fixture MUST have exact expected page count, at least one embedded image per page, zero extractable text, a reasonable minimum byte count, SHA-256, elapsed generation time, and manifest.
- GitHub Actions MUST generate 5/10/25 page fixtures and upload evidence. This verifies fixture generation, NOT OCR correctness or UI integration.
- Device self-test and screenshots remain separately maintained. No assertion of iPad/iPhone OCR accuracy without real execution and ground-truth comparison.
- Future releases: update fixture version, hashes, CI run URL, actual device evidence, failures, open issues, and test coverage changes. Do not turn SKIP into PASS.

## v7.74.1 complete-application integration suite

See `docs/COMPLETE_APPLICATION_WORKFLOW_TESTS.md` for E2E-01 through E2E-06, their exact UI actions, assertions, evidence, limitations and release acceptance rules. Run in CI; a configured test is **not** a verified pass until execution evidence exists.


### v7.74.2 — Sharded browser workflow tests
18 independently scheduled case/profile jobs, individual reports and failure screenshots. Syntax checked; local browser blocked by environment network policy; GitHub run pending.

## Repeated cache/reload regression (introduced v7.74.4)
- **On-device:** About → Device Self-Test → Repeat cache and resource checks → 10, 20, or 100 cycles. Alternates default/no-store fetches for app shell, app script, diagnostic script, diagnostic CSS, and service worker; checks version, HTTP success, stable lengths, and exports per-cycle timings/failures in JSON. No app reload; user documents untouched.
- **GitHub:** `.github/workflows/cache-repeat-regression.yml` performs real reloads in isolated Chromium runs: desktop 10/20/100; emulated iPhone/iPad 10 each. Verify version on each reload, report service-worker/cache keys and JS errors, and upload JSON and failure screenshots.
- **Acceptance:** all cycles complete, no stale version, no failed resources, no uncaught errors; log any overflow. Explicitly report physical Safari as unverified until on-device evidence is received.
- **Every release:** bump service-worker cache version; run and record repeated cache/reload tests in `RELEASE_TEST_HISTORY.md`; retain artifacts and investigate stale version, missing resource, or reload failure before declaring success.
