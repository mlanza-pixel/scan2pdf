# DocuScan Pro v7.5 expanded browser regression

The workflow matrix runs each scenario independently on desktop Chromium, an emulated iPhone, and an emulated iPad. Tests click and drag actual controls, supply synthetic fixtures, and check the resulting preview, stored document, or independently parsed export. GitHub Actions publishes a JSON report per shard and screenshots for failures.

| Scenario | Verified outcome |
| --- | --- |
| Consent and navigation | Dismiss the welcome screen, open every workspace, and check horizontal overflow. |
| Studio import | Import, remove, undo, redo, restore, download, and reopen the PDF in Tools. |
| Studio capture and enhancement | Exercise the camera file input with a JPG, verify grayscale pixels in the exported PDF, and check enhancement undo, redo, reset, rotation, and clear-all confirmation. |
| Studio OCR | Read the expected text tokens on a synthetic invoice. |
| Sign text and drawn signature | Extract inserted text from the export and compare the drawn signature's exported dimensions to its resized preview. |
| Sign highlight and watermark | Insert, move, and resize the overlays. Check highlight geometry in the export and watermark position and text on five pages. Verify watermark removal in a new export. |
| Sign annotations and history | Add a date, stamp, underline and strike. Verify remove, undo and redo. Verify the exported date, stamp and typed signature. |
| PDF Tools history and merge | Rotate five pages, verify Undo and Redo in exports, merge 5- and 10-page files, then restore the source with Remove. |
| PDF Tools page operations | Verify split, blank-page insertion, deletion, repeated drag reorder, crop, and a separate 1 MiB split on a 10-page fixture. |
| PDF Tools markup and document properties | Verify extracted text download, text and freehand annotations, clear strokes, text and image watermarks, header/footer and page numbering, metadata and an actual PDF bookmark destination. |
| PDF Tools images and batch | Verify image download, inverted pixels, a readable rasterized compression output, side-by-side previews, and two batch-rotated PDFs reopened from Library. |
| PDF Tools forms and password validation | Export a filled text field and reject mismatched passwords. |
| PDF Tools OCR | Read the expected invoice number and amount from a synthetic image-only PDF. |
| Library documents and folders | Save, reopen, rename, search and delete a document. Create and open a folder, verify membership after reload, cancel deletion, then delete the folder while preserving the PDF. |
| Help and Tour | Search, open an article and go back. Check Next, Back and Skip on all six workspace tours and restart the tutorial. |

## Findings and results

- All 57 browser shards passed locally across the three Chromium profiles. This includes six OCR shards that used the real Tesseract engine and English model from pinned npm assets. Direct CDN attempts failed in the local browser. The test-only routing makes recognition repeatable without modifying production OCR loading.
- All three profiles passed 10 reloads with the expanded build's new service worker cache. The 1,000 desktop reload evidence in the prior release applies to that earlier build. The 1,000-cycle GitHub Action remains available as a manual endurance run.
- The expanded tests caught four defects. Extract Text's dedicated button was unwired, Bookmarks did not write PDF outlines, repeated reorder could diverge from the preview, and a highlighted control could cover the tour card. The package includes their fixes.
- Remaining checks include physical-device camera capture, Share and Print, successful PDF encryption, and the production OCR CDN path. OCR recognition was verified on synthetic English fixtures. Broad accuracy on real scans and every individual control variant are still open.

See `docs/test-evidence-v7.5-expanded/` for the browser and reload reports. To run the browser matrix locally, install Playwright, pypdf, Pillow and ReportLab, start the app's HTTP server, and run `scripts/test_complete_app_workflows_v7741.py` with its URL. For repeatable English OCR, install `tesseract.js@5.1.1`, `tesseract.js-core@5.1.1`, and `@tesseract.js-data/eng@1.0.0` in a test directory and point `DOCUSCAN_OCR_NODE_MODULES` to its `node_modules`.
