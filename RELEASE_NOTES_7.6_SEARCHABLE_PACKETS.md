# DocuScan Pro v7.6 Searchable Packets

This build continues the November workspace-layout release and keeps the DocuScan Pro name.

## Studio workflow

1. Use Import files to add images and ordinary PDFs to one page tray. Move earlier and Move later change the packet order. Imported PDF pages are copied without rasterizing. Their original page sizes and existing searchable text are retained. Fillable and password-protected PDFs are handled separately in PDF Tools to avoid dropping their form fields.
2. For paper captures, optionally enable Auto-crop and clean for border detection and uneven-light correction. For perspective correction, use Straighten page and tap the four document corners in the order shown. The camera uses the device's native picker, one capture at a time. Import files supports multiple selections.
3. Use Scan to recognize the image pages. The next PDF export embeds searchable text for unchanged OCR-processed images. Rescan after cropping, rotating, or enhancing. Embedded OCR currently uses the built-in Latin-script font. Other scripts can still be copied from the OCR result when supported by the recognition model.
4. Pick Small, Standard, or Original quality. The setting applies to image pages. Use PDF to create and save the packet, or send it directly to Sign or PDF Tools without downloading an intermediate file.
5. Share opens a review that shows the current file size and a smaller choice when one is available. Sign and PDF Tools also show file size before sharing and offer structural optimization when it saves space. Structural optimization retains text and forms and skips encrypted or digitally signed documents. The explicitly marked image-only options rasterize pages.

The optional packet checklist includes Expense claim, Signed document, and an editable My checklist. The current checklist and completion state are stored on the device. The checklist does not store the source files.

## Verification

The automated browser suite covers desktop Chromium, emulated iPhone and emulated iPad. It checks OCR-to-Create-PDF-to-Library export, seven-page mixed-file page order, retained source PDF text, smaller sharing through the browser download fallback, form values, camera import and four-corner correction, persisted checklist state, navigation and Help tours. The mixed fixture was approximately 144 KB at Original quality and 65 KB with the smaller sharing option. Size savings depend on content.

Physical camera capture, the native iOS email share sheet, and broad OCR accuracy on real documents require device validation. Browser OCR uses pinned English test assets. This package has not been deployed.
