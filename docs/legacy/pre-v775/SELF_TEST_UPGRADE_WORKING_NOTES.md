# Self-test upgrade — working checkpoint, not a release

November 7, 2026. Base app: v7.72-ci-diagnostics. Diagnostic build: self-test-5-draft.

## Implemented

- Opt-in fixture workflows in a separate app frame. A unique temporary IndexedDB Library and volatile settings prevent use of the user's Library, folders, signatures, or accepted-terms settings. A URL parameter alone cannot enable fixture mode; the parent must register the run token.
- Actual app file-input import of three JPGs, PDF creation and persistent page-count check, Library UI, Sign import, repeated Text clicks and placement, undo/redo, Tools rotation and output metadata, and W-9 text/checkbox editing with canonical field values reopened from saved bytes.
- Temporary Library cleanup reported independently. Failed, cancelled, unsupported, and unexecuted work is never converted to PASS. Native camera, email/share, printing, accessibility review, and remaining feature-button coverage stay NOT RUN.
- Quick mode explicitly marks real OCR/PDF component checks NOT RUN. Cache repetitions are labeled resource checks, not document workflows. Reports have a schema version, diagnostic build, coverage limitations and separate counts; workflow summary rows do not inflate counts.
- OCR requires all seven expected heading/body/amount tokens. Requested OCR failures fail instead of being downgraded to warnings. Evidence includes recognized text, missing tokens, and expected tokens. This measures token recall on generated English text, not whole-document accuracy.
- OCR worker serializes jobs, directs progress to the current callback, disposes old language workers, supports cancellation and a 90-second job timeout.
- Product fixes exposed by the improved tests: Text now stages placement instead of adding one annotation per toolbar click; blank page deselection no longer creates a misleading toast. PDF Forms renders checkboxes correctly and writes text/checkbox values without silently ignoring write failures. Unsupported field types remain preserved and explicitly uneditable. Field names/values are built with DOM properties rather than interpolated HTML.

## Executed validation

- Chromium viewport emulation at 1024x900 and 390x844: 12 workflow/isolation checks PASS on each, including W-9 save/reopen and Text/undo/redo. Quick+self-workflow reports: 17 PASS, 0 FAIL, 6 NOT RUN. This is NOT physical iPad/iPhone certification.
- Before product fixes, the same workflow checks reproduced six annotations from five toolbar clicks plus one page click, and W-9 checkbox-as-text failure. Before/after evidence is saved separately. An early undo assertion was corrected to wait for asynchronous rendering; it was not a product defect.
- Test Library/settings isolation: a parent user-Library sentinel and user folder stayed byte-for-byte unchanged in both emulated viewports. Stop/restart restored controls.
- Existing core regression: 18 PASS. Node file-based PDF.js font warnings were observed; this run does not certify every rendering path.
- OCR worker unit tests: current callback, sequential calls, language-worker disposal, cancellation, restart and timeout PASS. These use a stub worker and are not real-engine accuracy evidence.
- OCR scoring negative control: stub recognition omitting heading tokens must FAIL. This validates scoring, not real OCR performance.

## Remaining upgrades and release blockers

1. Replace native naming prompts with accessible async dialogs; filename validation and overwrite/rename paths need end-to-end tests.
2. Add visible loading phases/progress throughout Studio and PDF Tools; the underlying callback/cancellation defect is fixed but full UI feedback and language asset bundling are not complete.
3. Add watermark text/image placement and resize, signature drawing, enhancement, merge/split/reorder/delete, Library move/rename/share/backup/restore, Help/Tour and all other button sub-workflows. Inventory alone remains NOT RUN functional coverage.
4. Extend realistic OCR ground truth with full-text character/word error and numbers/titles across pages/languages; no physical scan timing or non-English accuracy was verified here.
5. Manual native camera/share/print and VoiceOver/TalkBack tests. No screenshots were captured in this working batch.
6. Regenerate Help, Tour, UI Field Reference and Help Content Inventory for the actual next release version, update manuals and release documentation, bump app/service-worker versions and regenerate file hashes. Existing v7.7 documents remain stale and BLOCK a production release.
7. Resolve exact prior GitHub tools/tools-batch/desktop-edit failures from their own JSON artifacts; local passing checks do not clear those historical runs.
8. Cross-device sync, encrypted backup, ID/QR capture, dark mode, compression presets and multilingual OCR are backlog candidates, not implemented claims.
9. The supplied draft terms describe planned cloud/Google Sheets functions and contain placeholders. They were not installed or published.

This archive is a recoverable WORKING CHECKPOINT. Do not upload it as a finished production release. Existing release names and historical docs are retained for context, not evidence that the draft has cleared release gates.
