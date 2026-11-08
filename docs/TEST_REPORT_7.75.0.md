# Verification for v7.75.0 Test Build 1

## Executed

| Check | Result | Evidence |
|---|---|---|
| Desktop fixture workflows and 10 cache/resource cycles | PASS: 20 checks, 6 NOT RUN categories | tests/results/v7.75.0/report-desktop-1.json |
| iPad viewport fixture workflows and cache checks | PASS: 20 checks, 6 NOT RUN categories | report-ipad-emulated-1.json |
| iPhone viewport fixture workflows and cache checks | PASS: 20 checks, 6 NOT RUN categories | report-iphone-emulated-1.json |
| Android viewport fixture workflows and cache checks | PASS: 20 checks, 6 NOT RUN categories | report-android-emulated-1.json |
| Source Library and folders preserved | PASS in each disposable browser profile | Per-profile report checks |
| Stop restores controls | PASS in each profile | Per-profile report checks |
| Naming dialog containment, Escape and focus | PASS at 1024px and 390px | naming-ocr-1024.json, naming-ocr-390.json |
| Alternate-name collision protection | PASS at both widths | naming-ocr reports |
| Three-page visible OCR stage updates | PASS with a STUB engine | naming-ocr reports; not real OCR evidence |
| PDF/image core regression | 18 PASS | tests/results/core-results.json |
| OCR worker callback, queue, disposal, cancel and timeout | PASS unit tests with stub worker | tests/ocr-worker-regression.mjs |
| Portable filenames and progress state | PASS unit tests | tests/naming-progress-regression.mjs |
| Current Tour contract | 92 steps PASS structural validation | tests/tours/check-tour-contract.mjs |

Screenshots are real Chromium captures in tests/results/v7.75.0/screenshots, separated by viewport profile. They are not native iOS/Android captures. The Node PDF renderer emitted local-file standard-font warnings in core checks; page/text assertions passed. Do not interpret this as a complete visual/accessibility certification.

## NOT RUN or incomplete

Physical camera capture, native email/share delivery, native print, VoiceOver/TalkBack, real scanned-document OCR accuracy, actual iOS/Android device memory/endurance, and remaining feature-button/sub-button workflows. The checked quick fixture run did not run the real OCR engine. Standard/Stress modes on the user's device can run the recognition checks.

The older exact GitHub failures are not cleared by these results. Current CI runs the verified tests and documentation gate. Older workflow definitions and broader scripts are preserved as historical work to port to the new dialogs and placement behavior. A 1,000-run manual dispatch repeats the documented fixture suite; it is not 1,000 distinct workflows or proof that every feature is correct.
