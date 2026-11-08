# Changes in 7.6.0

- Clear Studio / Sign / PDF Tools workflow descriptions and direct Tools-to-Sign handoff.
- Home, Sign, Tools, Studio, Library, Help navigation order.
- Three primary Tools categories; less common tools in an expandable drawer.
- Repeated category selections no longer hide tool buttons or clear the operation.
- Draft controls and file selections survive tool/category switching within a document.
- New documents reset PDF-specific drafts and pending drawings.
- Failed or older document loads cannot replace a newer working document.
- Conflicting controls stay disabled during tool execution.
- Preview page counts/navigation follow the currently displayed original or output PDF.
- Compare and drawing visibility are restored consistently when changing operations.
- Continuous scrolling is read-only, explicitly returns to editing, and resets for a new PDF.
- PDF loader retries after dependency errors and reuses parsed documents for identical byte references.
- Canvas render jobs are serialized to prevent simultaneous rendering on the same canvas.
- Original source survives capped undo histories; Remove restores the immutable original.
- Save cancellation no longer produces a false success message in primary export paths.
- Sign exporter snapshots its source and overlay objects; overlapping exports are guarded.
- OCR action keeps its Scan text label after processing.
- Touch hover rules preserve button foreground/background contrast.
- Bottom safe-area navigation height and content spacing corrected; reduced-motion support added.
- Studio import icon preserved when the button label changes.
- PDF dependencies/fallback fonts included locally; service worker only removes this app's old caches.

This ZIP is a local release, not a deployment. See the test report for unverified device and browser-file workflows.

Watermark visual review also exposed oversized diagonal text clipping at page edges. The shared watermark renderer now fits and centers rotated text inside page margins; generated outputs were rebuilt and independently checked again.
