# Complete application workflow regression — introduced v7.74.1

## Required tests for every release

| ID | Real application workflow | Pass condition | Evidence |
|---|---|---|---|
| E2E-01 | Studio image import → Create PDF → Download | Thumbnail exists, export is a parseable nonempty PDF | Downloaded PDF, JSON |
| E2E-02 | Reopen exported Studio PDF in PDF Tools | PDF Tools enables its download action and displays document information | JSON and failure screenshot |
| E2E-03 | Studio image → Run OCR | Recognizes at least 4 of 5 known text tokens, using actual UI | JSON recognized excerpt |
| E2E-04 | Sign PDF import → Add Text → Export | Editing control enabled, exported PDF parses and differs from source | Exported PDF and JSON; **visual edit position not yet proven** |
| E2E-05 | Sign PDF → Save to Library → open saved entry | Saved item visible and actionable | JSON; **full canvas reopen not yet proven** |
| E2E-06 | Browser errors | No uncaught JavaScript errors | JSON |

## Execution and provenance

GitHub Actions runs `scripts/test_complete_app_workflows_v7741.py` against the **actual locally served application UI** in desktop, iPhone-sized and iPad-sized Chromium contexts. Tests use synthetic image fixtures and isolated browser contexts, never personal documents. Failed cases are not counted as passed. Test output is `tests/results/complete-app-v7741/report.json`, with PDFs and failure screenshots. The workflow uploads this evidence even on failure. **Chromium device emulation is not physical iPhone/iPad testing.**

## Outstanding acceptance criteria

1. Verify annotation/text placement visually or through PDF content streams rather than byte inequality alone.
2. Verify that selecting a Library entry actually renders the saved PDF and that its page count/content match the source.
3. Extend OCR to multi-page, low-contrast, rotated, blurred and multilingual upstream-generated fixtures with ground truth and character/word error rates.
4. Test PDF Tools edit operations (rotate, reorder, split, merge, watermark) against expected PDF structure/content, not merely enabled buttons.
5. Test actual iOS Safari, camera, Files picker, Share Sheet, print and interrupted processing manually or with a native-device test provider.
6. Fix iPhone overflow and tainted/insecure DOM screenshot capture independently; do not mark them resolved until verified.

## Release rule

Update this document, `docs/TESTING_MASTER_REGISTER.md`, `docs/RELEASE_TEST_HISTORY.md`, and the release's `TEST_REPORT_*.md` on every release. Distinguish executed passing tests from tests that are merely packaged or scheduled for GitHub Actions. Do not equate a successful library round-trip with an end-to-end app workflow.


## Sharded workflow runner (v7.74.2)
Each test case and browser profile runs as an independent GitHub Actions matrix job, with a separate timeout, clean browser context, JSON report, and failure screenshot.
Cases: consent, import, ocr, edit, library, errors. Profiles: desktop, iphone-emulated, ipad-emulated.
Use `python scripts/test_complete_app_workflows_v7741.py http://127.0.0.1:8765/ --profile desktop --case import` to run one shard locally.
The edit test still checks changed bytes rather than proving text placement; the Library test still needs a rendered-page assertion. These remain coverage gaps.
Local execution in the authoring environment was blocked by Chromium network policy (`ERR_BLOCKED_BY_ADMINISTRATOR`), not by an observed app assertion. GitHub Actions execution is pending.
