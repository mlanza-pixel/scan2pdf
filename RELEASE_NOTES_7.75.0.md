# Test Build 5 update

Multiline PDF fields use expandable textareas, preserving Enter/newlines and blank lines on save and reopen. Added an isolated regression fixture checking multiline text, checkbox and read-only values. All 40 contractor template/profile cases passed their selected checks. Four viewport self-test runs each passed 21 checks with 6 NOT RUN. Core and W-9 regression suites passed. Physical-device verification remains pending.

# DocuScan Pro 7.75.0 Test Build 1

## Included

- Isolated opt-in self-test fixture workflows for imports, creation, Library persistence, Sign text placement, undo/redo, rotation and W-9 text/checkbox save/reopen. Native and uncovered work stays NOT RUN.
- Duplicate text placement fixed. PDF checkbox controls now render and save correctly. Unsupported PDF field types are preserved and identified as uneditable.
- App naming/selection dialogs replace blocking prompts for PDF creation, drawing output, rename, folders, stamps and move-to-folder choices. Cancel/Escape and rapid-click guards are tested.
- Portable PDF names and serialized save jobs. Alternate names are rechecked for collisions rather than silently bypassing overwrite protection.
- OCR callback/cancellation/timeout fixes plus visible loading stages and recognition progress in Studio and PDF Tools. First-use English OCR assets are still fetched externally.
- New app/build/cache identifiers, UTC diagnostics, current manuals and editable workbooks, Tour/Help updates, version/source documentation gate, test scripts and screenshots.

## Verification and limits

Four Chromium viewport profiles each passed 20 Quick/fixture checks, with 6 categories explicitly NOT RUN. Separate naming/progress UI checks used a stub OCR engine and are not real OCR accuracy evidence. The 18-test PDF/image core suite and worker/filename unit checks passed. See tests/results/v7.75.0 and docs/TEST_REPORT_7.75.0.md for the recorded scope.

The old GitHub tools/tools-batch/desktop-edit failures are not declared fixed by these new tests. Earlier scripts are retained as historical coverage to port; the current workflow runs the verified fixture suite and current core tests. Full button/sub-button coverage remains incomplete.

## Audit features not included

English model bundling, drag-and-drop import, redesigned terms/splash, compression presets, keyboard shortcuts, automatic page-edge/form-field detection, dark mode, multilingual OCR, cloud sync, encrypted backups, Library lock, ID/QR scanning and annotation comments remain pending. Batch OCR already existed. Draft cloud/Google Sheets terms were not installed.

## Device testing still needed

Physical iOS/Android camera, native Mail/share, printing, signature drawing/resizing, real scanned-document OCR accuracy, screen readers, memory/endurance limits and all remaining feature workflows. The app is supplied for these tests, without a claim that every workflow has passed.
