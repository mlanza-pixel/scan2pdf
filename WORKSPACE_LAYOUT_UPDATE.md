# DocuScan Pro v7.5 workspace layout update

PDF Tools opens with Markup selected. The tool buttons, tool details and Apply and review controls sit in separate numbered cards. Reorder explains both supported input methods before the thumbnails and exposes an editable page-order field. Apply Changes and Show original share the review card with Undo, Redo and Remove.

Studio places Show original immediately above the history controls in the Enhancement card. The preview toggle does not change the export source. Read scanned text aloud sits underneath the page counter. The OCR status no longer repeats the number of pages. Studio, Sign and PDF Tools use larger and bolder page arrows, and history controls are grouped inside their respective cards.

Targeted Chromium checks covered desktop, emulated iPhone and emulated iPad. Results are included in the workspace-layout evidence folder.

## Desktop Edit stress follow-up

GitHub recorded 15 of 18 passes. Three iterations timed out after trying to insert a signature. A failure screenshot showed an empty drawing pad. The test now waits for the animated sheet to settle and verifies that drawing changes the canvas before it clicks Insert. All 18 repetitions passed locally after the change. A new GitHub run is needed to verify the timing on its runners.
