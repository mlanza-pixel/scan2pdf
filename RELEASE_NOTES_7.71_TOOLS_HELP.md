# DocuScan Pro 7.71

- Studio, Sign and PDF Tools now use the Library label in the export row.
- PDF Tools has one Watermark button with Text and Image choices. Image settings display Size and Opacity together, then Position X and Y together.
- Library puts Move, Rename, Delete and Share on the first line. Open in Sign and Open in Tools appear on the second.
- The Merge/Combine group uses the same font sizing as the other categories and contains both Merge and Compare.
- Added searchable Help and tour entries for each PDF Tools operation, including Annotate Text, Annotate Draw, and Image watermark. Expanded Studio's tour and Help with page editing, OCR output, history and export instructions.

## Physical iPad and iPhone verification still needed

A passing device diagnostic covers the selected diagnostic checks, such as navigation, cache consistency, bundled files and sample OCR. Its button inventory does not execute each action.

1. Studio: capture real pages, import from Files or Photos, adjust the crop or perspective with touch, reorder, scan a real 16-page packet, confirm the exported PDF is searchable, then share it to Mail and open the attachment.
2. Sign: draw and resize a signature, drag annotations using a finger or Apple Pencil, and reopen the exported PDF to verify position and scale.
3. PDF Tools: apply Text and Image watermarks and inspect both exports, fill a form and reopen it, and verify file pickers, multi-file operations, and PDF output on both devices.
4. Library: move, rename, delete and reopen saved files, test share and cancellation, then reload to verify persistence. Test VoiceOver, larger text, landscape, and the installed Home Screen app.
5. Device endurance: repeat heavier workflows, including backgrounding and returning mid-session, and verify the app remains responsive. The GitHub stress run uses browser automation and is started manually with the stress option.

## Local verification

- 18 core checks passed. The Node PDF renderer emitted fallback-font warnings.
- Chromium at phone and tablet widths verified the Library rows, watermark mode switching and draft retention, and both watermark exports on all five pages.
- Completed 30 Studio tour steps and 36 PDF Tools tour steps in Chromium. Verified searchable Annotate Draw help.
- Physical iPad and iPhone diagnostics for v7.71 and the GitHub 1,000-workflow run remain pending.

## Talk to PDF build

Open a PDF in PDF Tools, choose Talk to PDF and enter a question. The browser searches the PDF's text layer and returns up to three matching source passages with page numbers. Keyboard dictation can enter a question when available. The app does not send document text to a model. This build performs passage retrieval without generating answers. For image-only PDFs, create a searchable PDF with Studio Scan first.

Verified at 390 and 1024 pixels in Chromium: a known fixture marker returned page 4 first, an unrelated query returned no matches, Escape closed the dialog, and an image-only fixture displayed OCR guidance. Physical-device dictation remains to be tested.

## GitHub test repair

The screenshot and navigation stress scripts now account for Markup opening by default. The screenshot test waits for the tour card before capturing it. Local Chromium verified five rounds of opening and closing every Tools category and opening and dismissing the tour at four viewport sizes. The hosted run logs were unavailable and the GitHub workflows still need to be rerun.

## Library backup build

Export Library Backup downloads a JSON file containing PDFs, names, and folder memberships. Move the file into iCloud Drive or Google Drive using Files or the browser's download controls. Restore Library Backup previews the PDF and folder counts and asks for confirmation before adding copies. Existing documents are preserved. Repeated restores add additional copies. The backup is readable, unencrypted and limited to 64 MiB. Cloud transfer is manual.

Chromium round-trip testing between separate phone- and tablet-sized browser contexts verified cancellation, byte-identical PDF recovery, folder membership and preservation of existing documents. Physical iOS and Android file-provider testing is pending.
