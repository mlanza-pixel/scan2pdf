# DocuScan Pro 7.6.0 test report

Executed for the 7.6 release on November 4, 2026 (America/Chicago; UTC build date November 5). See release.json for the final build timestamp.

## Inputs

- photo-1.jpg: synthetic receipt, 1200 x 1600 pixels.
- photo-2.jpg: synthetic meeting notes, 1200 x 1600 pixels.
- photo-3.jpg: synthetic delivery checklist, 1200 x 1600 pixels.
- document-10-pages.pdf: 10 pages with unique DOC10-PAGE01 through DOC10-PAGE10 markers.
- document-5-pages.pdf: 5 pages with unique DOC5-PAGE01 through DOC5-PAGE05 markers.

The fixtures contain no personal information. They are included in tests/fixtures.

## Executed successfully

### File-processing tests

18 core cases passed using the shipped image/PDF modules, pdf-lib, PDF.js and a Node canvas/FileReader adapter:

- Decoded each of the three actual JPG files, applied grayscale/brightness/contrast and verified rotated dimensions.
- Created three-page PDFs from all three JPGs in Letter, A4 and fit-to-image sizes.
- Merged the 10-page and 5-page PDFs into a 15-page PDF.
- Rotated all 15 pages by 90 degrees.
- Reversed the 15-page order.
- Split the merged PDF back into 10-page and 5-page files.
- Rejected six invalid page-range inputs.
- Applied a watermark to the 10-page PDF.
- Added text to its first and final page.
- Rejected an out-of-range annotation page.
- Embedded an image on the final page of the five-page PDF (signature/image insertion path).
- Verified both original PDF byte hashes stayed unchanged.
- Loaded both sources through the actual PDF.js wrapper, checked page counts/final-page text and parser-cache reuse.

The actual Sign exporter was additionally executed with text, watermark, stamp, highlight, underline and strikethrough overlays. It produced a valid ten-page PDF without mutating the source object list.

12 independent pypdf checks confirmed unique-page marker order, reverse order, split boundaries, first/last-page annotations, watermarks on all pages and embedded image presence. Representative image-PDF and edited-PDF pages were rendered with Poppler for visual review.

PDF.js running in Node logs nonfatal fallback-font file-URL warnings. Parsing and text checks passed. These warnings are not evidence of successful browser font rendering; local standard fonts are included for HTTP/HTTPS use.

### State regression tests

Six cases passed using original source functions with controlled DOM/history/dependency doubles:

- Repeated category selection keeps the operation visible.
- Document loading is rejected during a busy operation.
- Failed PDF parsing preserves the previous document.
- An older async load cannot replace a newer document.
- Original preview uses its own page count after a merge changes the working page count.
- Empty Home hash and Back/Forward synchronize without creating new browser-history entries.

### Browser controls and layouts

Executed in cloud Chrome against a separate local HTTP preview of the release. The published GitHub site was not changed.

- Repeated category click retained the tool row.
- Annotation text survived category switching.
- Browser Back returned both URL and workspace to Home.
- All 23 tool panels opened without an undefined panel. Apply/Scan stayed disabled without a document.
- All six workspaces were visited at 390, 768 and 1024 pixel iframe widths: 18 layout checks, no document-level horizontal overflow. Browser scrollbar space accounts for measured content widths slightly below the frame width.
- The primary navigation showed Home, Sign, Tools, Studio, Library, Help.

Iframe width checks exercise responsive CSS, not native iOS/Android behavior or touch emulation. Non-app Chrome-extension metadata errors were present in browser logs and excluded from app findings.

## Blocked or not executed

**The browser upload approval system rejected loading the synthetic 10-page PDF into the isolated preview. No alternate upload route was attempted.** Consequently, this release is not certified for the full browser file-picker-to-export workflow.

Not passed/not certified in this run:

- Browser import of the three JPGs and both PDF fixtures; UI-generated downloads and reopening them.
- Loaded-document continuous-scroll, Compare, Undo/Redo and busy-state behavior through actual browser clicks (code-level tests and source checks cover only parts of these).
- OCR engine/language download, recognition quality and searchable PDF behavior.
- Camera capture and permissions.
- Native iPad/iPhone Safari, Android Chrome touch states and safe-area hardware behavior.
- Native sharing, print dialog and persistence after device/browser restart.
- Password encryption, batch processing, fillable forms and every advanced tool's output.

## How to finish device testing

1. Host the extracted release over HTTP/HTTPS and confirm About says 7.6.0.
2. Import all three JPGs into Studio. Create a three-page PDF. Save, download and reopen it.
3. Open the ten-page PDF in Tools, add the five-page PDF and merge. Verify 15 pages and the DOC markers across the boundary.
4. Rotate, reorder, split, then Undo/Redo and Remove. Compare original/output page counts and final pages.
5. Send the working file to Sign. Add text/signature on first and last pages. Toggle Read all pages; return to editing; load the other PDF and verify the canvas/toggle reset.
6. Download and inspect the result in another PDF reader.
7. Run OCR on a synthetic image, test Library reopen, native Share and Print.
8. Repeat on iPad portrait/landscape, iPhone and Android. Check normal/selected/pressed/focused/disabled controls and offline reopening.

## Evidence

- tests/results/core-results.json and core-log.txt
- tests/results/state-log.txt and sign-log.txt
- tests/results/independent-verification.json
- tests/results/browser-layout.json and browser-panels.json
- Generated output PDFs in tests/results

Historical scripts/manuals from 7.5.9 are retained; their test claims are not results for this release.

Watermark visual review also exposed oversized diagonal text clipping at page edges. The shared watermark renderer now fits and centers rotated text inside page margins; generated outputs were rebuilt and independently checked again.

Final checks: all 14 application JavaScript modules pass syntax; all 39 service-worker shell paths exist; no duplicate static HTML IDs or missing entry assets. Six additional watermark edge/direction bounds checks passed. Final preview booted v7.6.0 after the last syntax fixes; transient development syntax errors were resolved before packaging.
