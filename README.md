# DocuScan Pro 7.75.0 Test Build 1

This ZIP is a complete application package for hands-on testing. It includes the self-test and annotation/form fixes, app naming dialogs, portable filenames, overwrite protection, and visible OCR loading/recognition progress. It does not include every proposed audit feature. See RELEASE_NOTES_7.75.0.md.

## Put this build on GitHub Pages

1. Extract the ZIP. Upload its contents to the root of your scan2pdf repository, keeping index.html, js, css, vendor, tests, docs and .github in their correct folders. Do not upload the enclosing ZIP or put the files inside an extra folder.
2. Commit the upload. The automated regression workflow runs on main pushes. The deployment workflow waits for the verified fixture/core suite before publishing.
3. Open https://mlanza-pixel.github.io/scan2pdf/?v=7.75.0-test1. Close and reopen an installed Home Screen app if necessary, then reload once. Confirm About shows 7.75.0, build 7.75.0-test1, and its UTC build timestamp. Avoid clearing site storage because that can delete your Library.

## Test on iPhone and iPad

Use the bundled sample files first. Open Help, then About > Device Self-Test. Select Standard for OCR/PDF components and enable the isolated fixture workflows checkbox. The disposable diagnostic Library is separate from your documents. Download JSON when the run finishes. PASS, FAIL and NOT RUN have different meanings.

Manually check camera capture, signature drawing/resizing, native sharing to Mail, printing, OCR accuracy and device responsiveness. Viewport emulation does not certify those interactions. Back up important documents before testing.

## Test on Windows

Run_All_Tests_Windows.bat installs the declared Node dependencies/browser, validates current documentation and runs the verified core/fixture suite. Python and Node.js must already be installed. Results are written to tests/results/v7.75.0. Start_Local_Windows.bat serves the app locally for browser testing; do not open index.html directly as a file.

The manual workflow “DocuScan Complete Workflow Shards” offers an optional 1,000 fixture-suite executions, 250 on each profile. This repeats the documented fixture workflows; it does not test every feature button, run real camera capture, or certify native device behavior. Old workflow definitions/scripts are preserved under docs/legacy and are not presented as current passing evidence.

## Documentation

Current documents are listed in docs/README.md. Editable UI Field Reference and Help Content Inventory workbooks were regenerated from this build. The Tour worksheet contains the current 92 steps. Historical manuals/workbooks are retained under docs/legacy.

scripts/validate_release.py checks source/document fingerprints and every workbook sheet's version/build. Changes to app content invalidate the documentation manifest. Regenerate current content, workbooks and manuals before updating that manifest. The workbook authoring script requires the artifact-tool authoring runtime; it is not a production runtime dependency.
