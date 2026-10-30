"""
Generate the printable Help Manual (PDF + DOCX) and the Help content
inventory (XLSX) for DocuScan Pro v5.1.0.

Source of truth: HELP_TOPICS array (mirrored from js/help-system.js).
Update both files together when help content changes.

Outputs:
  /home/z/my-project/download/DocuScan-Pro-Help-Manual.pdf
  /home/z/my-project/download/DocuScan-Pro-Help-Manual.docx
  /home/z/my-project/download/DocuScan-Pro-Help-Content-Inventory.xlsx
"""
import json
from pathlib import Path
from datetime import datetime

# ---------------------------------------------------------------------------
# HELP_TOPICS — mirror of js/help-system.js HELP_TOPICS array.
# Single source of truth for in-app Help AND printable manual.
# ---------------------------------------------------------------------------

HELP_TOPICS = [
    {"id": "home", "icon": "home", "title": "Get started with DocuScan Pro",
     "sub": "Overview of the four main workflows and the Home screen.",
     "tags": ["home", "start", "overview", "workflow"], "workspace": "home",
     "purpose": "Understand what DocuScan Pro does and where to begin.",
     "prerequisites": "A web browser. No account required.",
     "steps": [
         {"title": "Welcome", "body": "DocuScan Pro is a browser-based tool for scanning documents, creating PDFs, signing them, and organizing files locally. Everything stays on your device."},
         {"title": "Home screen", "body": "When you open the app you land on the Home screen. It shows four prominent workflow cards: Studio, Sign, PDF Tools, and Library."},
         {"title": "Quick start list", "body": "Below the four cards, a Quick start list lets you jump directly into the most common tasks: scanning, signing, or opening a saved document."},
         {"title": "Bottom navigation", "body": "The bar pinned to the bottom of every screen has six icons: Home, Studio, Sign, Tools, Library, and Help. Use it to switch workspaces at any time."},
     ],
     "troubleshooting": "If you don't see the four cards, you may have scrolled — try scrolling up or pressing Home in the bottom navigation.",
     "related": ["studio-scan", "sign-pdf", "pdf-tools-merge", "library-overview"]},
    {"id": "studio-scan", "icon": "camera", "title": "Scan or import a document",
     "sub": "Capture with your camera or import existing images, then build a PDF.",
     "tags": ["studio", "scan", "camera", "import", "capture", "image"], "workspace": "studio",
     "purpose": "Turn paper documents or existing images into clean PDF files.",
     "prerequisites": "A camera-equipped device (for capture) or images on your device.",
     "steps": [
         {"title": "Open Studio", "body": "Tap Studio in the bottom navigation, or the Studio card on the Home screen."},
         {"title": "Capture with camera", "body": "Tap \"Capture with camera\". Your browser will request camera permission. On phones, the rear camera is preferred. Capture a page; tap to retake if needed."},
         {"title": "Or import images", "body": "Tap \"Import images\" to choose existing image files (JPG, PNG). You can select multiple files at once."},
         {"title": "Review thumbnails", "body": "Captured or imported pages appear in the Pages strip as numbered thumbnails. Tap a thumbnail to select it. Selected pages are outlined in blue."},
         {"title": "Rotate, reorder, delete", "body": "Use Rotate, Move left, Move right, or Delete on the selected page. Clear all empties the strip."},
         {"title": "Enhance", "body": "Pick a preset (Auto, Grayscale, B&W, Brighten, Contrast+), optionally adjust Brightness / Contrast sliders, then tap Apply to selected page. The original is preserved — Reset restores it."},
         {"title": "Run OCR (optional)", "body": "Tap Run OCR on the selected page to recognize text using Tesseract.js. The first run may take longer while the engine initializes. Recognized text appears in the textarea and can be copied or downloaded as .txt."},
         {"title": "Create the PDF", "body": "Choose page size (Letter, A4, or Fit-to-image) and orientation (Auto, Portrait, Landscape), then tap Create PDF. The PDF is saved to your Library automatically."},
         {"title": "Hand off", "body": "Use Send to Sign or Send to PDF Tools to continue working on the new PDF without leaving the app."},
     ],
     "troubleshooting": "If the camera doesn't open, check browser permissions (Settings → Privacy → Camera) and confirm you're on HTTPS. As a fallback, use Import images to pick a photo from your camera roll.",
     "related": ["studio-enhance", "studio-ocr", "create-pdf", "library-overview"]},
    {"id": "studio-enhance", "icon": "sun", "title": "Enhance image quality",
     "sub": "Brighten, sharpen, convert to grayscale or black-and-white.",
     "tags": ["studio", "enhance", "brightness", "contrast", "grayscale", "bw", "black and white"], "workspace": "studio",
     "purpose": "Improve readability of scanned or photographed pages.",
     "prerequisites": "At least one page loaded in Studio.",
     "steps": [
         {"title": "Select a page", "body": "Tap the thumbnail of the page you want to improve. A blue outline confirms the selection."},
         {"title": "Choose a preset", "body": "Tap one of the chips in the Enhancement section: Original, Auto, Grayscale, B&W, Brighten, or Contrast+."},
         {"title": "Fine-tune (optional)", "body": "Drag the Brightness and Contrast sliders. The numbers update live (-100 to +100)."},
         {"title": "Apply", "body": "Tap Apply to selected page. The thumbnail updates to reflect the changes."},
         {"title": "Reset", "body": "Tap Reset to restore the original image. The original canvas is preserved, so this is always safe."},
     ],
     "troubleshooting": "If the thumbnail doesn't change after Apply, make sure a page is selected (blue outline) before tapping Apply. If the colors look wrong, try Original to revert.",
     "related": ["studio-scan", "studio-ocr", "create-pdf"]},
    {"id": "studio-ocr", "icon": "text", "title": "Recognize text with OCR",
     "sub": "Extract searchable, copyable text from scanned pages.",
     "tags": ["studio", "ocr", "tesseract", "text", "recognize", "recognize text", "extract"], "workspace": "studio",
     "purpose": "Turn scanned images into editable, searchable text.",
     "prerequisites": "A scanned page with printed text. Handwriting is not well supported.",
     "steps": [
         {"title": "Select a page", "body": "Tap a thumbnail in the Pages strip."},
         {"title": "Run OCR", "body": "Tap Run OCR. The status badge shows \"Working…\" while Tesseract.js initializes and processes the page."},
         {"title": "Watch the progress bar", "body": "A progress bar appears below the Run OCR button. On the first run it may pause while the language model downloads (a few MB)."},
         {"title": "Review recognized text", "body": "When complete, the recognized text appears in the textarea. It may include minor errors — OCR is never perfect."},
         {"title": "Copy or download", "body": "Tap Copy text to copy to the clipboard, or Download .txt to save a text file."},
     ],
     "troubleshooting": "If OCR returns \"(No text recognized.)\", try a higher-resolution scan, sharper lighting, or convert the image to B&W first. The first run can take 10-20 seconds while assets load; later runs are faster.",
     "related": ["studio-scan", "studio-enhance", "create-pdf"]},
    {"id": "create-pdf", "icon": "pdf", "title": "Create a PDF from pages",
     "sub": "Combine images into a single PDF with the page size you want.",
     "tags": ["studio", "pdf", "create", "build", "letter", "a4", "page size"], "workspace": "studio",
     "purpose": "Assemble one or more images into a single PDF document.",
     "prerequisites": "At least one page loaded in Studio.",
     "steps": [
         {"title": "Choose page size", "body": "In the Create PDF section, pick Letter (8.5×11\"), A4 (210×297mm), or Fit to image."},
         {"title": "Choose orientation", "body": "Pick Auto (uses each image's aspect ratio), Portrait, or Landscape."},
         {"title": "Create PDF", "body": "Tap Create PDF. The PDF is built with pdf-lib and saved to your Library automatically. A toast confirms the save."},
         {"title": "Hand off", "body": "Optionally tap Send to Sign or Send to PDF Tools to continue working."},
     ],
     "troubleshooting": "If Create PDF is disabled, add at least one page first. If the button shows a spinner forever, the network may be slow loading pdf-lib — try again in a moment.",
     "related": ["studio-scan", "sign-pdf", "library-overview"]},
    {"id": "sign-pdf", "icon": "pen", "title": "Sign a PDF document",
     "sub": "Open an existing PDF and add your signature, then download.",
     "tags": ["sign", "signature", "draw", "type", "pen", "sign", "ink"], "workspace": "sign",
     "purpose": "Add your signature to an existing PDF.",
     "prerequisites": "A PDF file on your device.",
     "steps": [
         {"title": "Open the PDF", "body": "Tap Open PDF from Files at the top of the left sidebar in the Sign workspace. Choose a PDF. It loads in the preview on the right."},
         {"title": "Create a signature", "body": "Tap the Signature button (one of the six editing buttons in two rows of three). A sheet slides up with two tabs: Draw and Type."},
         {"title": "Draw or type", "body": "In Draw mode, sign with your finger, Apple Pencil, or mouse on the signature pad. In Type mode, enter your name and pick a font style."},
         {"title": "Insert", "body": "Tap Insert signature. The signature is placed at the center of the current page as a movable overlay."},
         {"title": "Move and resize", "body": "Click the signature to select it (blue border + resize dot appears). Drag the body to move; drag the blue dot in the bottom-right corner to scale."},
         {"title": "Download", "body": "When you're happy, tap Download PDF to save the signed PDF to your device. Use Save to Library if you want to keep it in the app for later."},
     ],
     "troubleshooting": "If the signature doesn't appear, check that you're on the correct page (use the page navigation bar). If the overlay shows the wrong color, set the Ink color before inserting.",
     "related": ["sign-text", "sign-date", "sign-watermark", "library-overview"]},
    {"id": "sign-text", "icon": "text", "title": "Add text to a PDF",
     "sub": "Insert custom text or use Quick Text Templates.",
     "tags": ["sign", "text", "typed signature", "template", "font", "font size", "approved"], "workspace": "sign",
     "purpose": "Add typed text or reusable phrases to a PDF.",
     "prerequisites": "A PDF open in the Sign workspace.",
     "steps": [
         {"title": "Type your text", "body": "In the Text / typed signature field, type the text you want to insert. Or pick from Quick Text Templates (Approved, Received, Paid, Confidential, Draft, Final, For Review)."},
         {"title": "Choose font", "body": "Pick a Font style (Helvetica, Times Roman, Courier, etc.) and a Font size in points. This controls the text inside the PDF, not the interface."},
         {"title": "Pick ink color", "body": "Use the Ink color color picker. The color you pick is the color of the text in the final PDF."},
         {"title": "Insert", "body": "Tap the Text editing button to insert at the page center, OR click directly on the preview canvas to drop the text exactly where you clicked."},
         {"title": "Move and resize", "body": "Click the text element to select it. Drag the body to reposition; drag the blue dot in the bottom-right corner to scale."},
     ],
     "troubleshooting": "If nothing happens when you click on the page, make sure the Text / typed signature field isn't empty — type something first. If the ink color doesn't match, set the color before inserting.",
     "related": ["sign-pdf", "sign-date", "sign-watermark"]},
    {"id": "sign-date", "icon": "calendar", "title": "Insert the current date",
     "sub": "Add today's date to a PDF in one tap.",
     "tags": ["sign", "date", "today", "insert date"], "workspace": "sign",
     "purpose": "Stamp the current date onto a PDF.",
     "prerequisites": "A PDF open in the Sign workspace.",
     "steps": [
         {"title": "Pick font and color", "body": "Set the Font style, Font size, and Ink color as you want the date to appear."},
         {"title": "Tap Date", "body": "Tap the Date button (one of the six editing buttons). Today's date is inserted near the bottom of the current page."},
         {"title": "Move if needed", "body": "Click the date text to select it, then drag to move it to your preferred position."},
     ],
     "troubleshooting": "The date is generated by your browser's locale. If the format isn't what you want, type your own date into the Text field instead and use the Text button.",
     "related": ["sign-pdf", "sign-text", "sign-watermark"]},
    {"id": "sign-watermark", "icon": "watermark", "title": "Add a watermark to a PDF",
     "sub": "Stamp DRAFT, CONFIDENTIAL, or any text across all pages.",
     "tags": ["sign", "watermark", "draft", "confidential", "opacity", "diagonal", "horizontal"], "workspace": "sign",
     "purpose": "Apply a text watermark to every page of a PDF.",
     "prerequisites": "A PDF open in the Sign workspace.",
     "steps": [
         {"title": "Configure the watermark", "body": "In the Watermark section: set Watermark text (default DRAFT), pick Direction (Diagonal ↗ or Horizontal), and set Opacity (0-100%)."},
         {"title": "Insert", "body": "Tap Insert. The watermark is applied across ALL pages of the document. A badge confirms \"Watermark applied\"."},
         {"title": "Verify", "body": "The displayed opacity value matches the actual opacity baked into the PDF."},
         {"title": "Remove", "body": "Tap Remove watermark to revert. (Note: this currently reverts to the originally-loaded PDF and discards other edits added after the watermark.)"},
     ],
     "troubleshooting": "If the watermark is invisible, increase the Opacity. At 0% it's fully transparent. At 100% it's solid gray text.",
     "related": ["sign-pdf", "sign-text", "pdf-tools-watermark"]},
    {"id": "sign-undo-redo", "icon": "undo", "title": "Undo, Redo, and Remove Selected",
     "sub": "Correct mistakes and remove individual elements.",
     "tags": ["sign", "undo", "redo", "remove", "history", "mistake"], "workspace": "sign",
     "purpose": "Revert changes and clean up unwanted elements.",
     "prerequisites": "A PDF open in the Sign workspace.",
     "steps": [
         {"title": "Undo", "body": "Tap Undo (one of the six editing buttons, bottom row). Each press reverts to the previous state in the history stack."},
         {"title": "Redo", "body": "Tap Redo to re-apply a change you just undid. The Redo stack clears when you make a new edit."},
         {"title": "Remove Selected", "body": "Tap an element on the canvas to select it (blue border + resize dot). Then tap Remove Selected to delete it."},
     ],
     "troubleshooting": "If Undo is disabled, you're at the bottom of the history stack. If Remove Selected is disabled, no element is currently selected — click on one first.",
     "related": ["sign-pdf", "sign-text", "sign-watermark"]},
    {"id": "sign-export", "icon": "download", "title": "Save, download, share, and print",
     "sub": "Four export actions available across Studio, Sign, and PDF Tools.",
     "tags": ["export", "save", "download", "share", "print", "library", "web share"], "workspace": "sign",
     "purpose": "Understand the four consistent export actions and when to use each.",
     "prerequisites": "A document ready to export.",
     "steps": [
         {"title": "Save to Library", "body": "Stores the document in the app's local IndexedDB library. Use this when you want to come back to the document later from inside DocuScan Pro."},
         {"title": "Download PDF", "body": "Triggers a browser download of the PDF file to your device. The file lands in your normal Downloads folder."},
         {"title": "Share PDF", "body": "Uses the native Web Share API on supporting devices (mobile Safari, Chrome on Android). On desktop or unsupported browsers, it falls back to a download automatically."},
         {"title": "Print PDF", "body": "Opens the browser's print dialog in a hidden iframe so you don't lose your place in the app. Choose your printer and paper as usual."},
     ],
     "troubleshooting": "If Share doesn't show the system sheet, your browser doesn't support Web Share API for files — use Download instead. Print may pop a blocker; allow pop-ups for the app.",
     "related": ["sign-pdf", "library-overview", "pdf-tools-merge"]},
    {"id": "pdf-tools-merge", "icon": "merge", "title": "Merge two or more PDFs",
     "sub": "Combine multiple PDFs into one document.",
     "tags": ["tools", "merge", "combine", "join", "concatenate"], "workspace": "tools",
     "purpose": "Combine several PDFs into a single file.",
     "prerequisites": "Two or more PDF files on your device.",
     "steps": [
         {"title": "Open the primary PDF", "body": "In PDF Tools, tap Open PDF. This is File A — the base document."},
         {"title": "Open a second PDF", "body": "Tap Open 2nd PDF (for merge). This is File B."},
         {"title": "Select Merge", "body": "Tap the Merge tab in the Operation row."},
         {"title": "Choose order", "body": "Pick Append second PDF (B comes after A) or Prepend second PDF (B comes before A)."},
         {"title": "Run", "body": "Tap Run. The merged PDF appears in the Preview area."},
         {"title": "Export", "body": "Use Save to Library, Download, Share, or Print at the bottom of the card."},
     ],
     "troubleshooting": "If Run is disabled, you haven't loaded both PDFs yet. Open PDF = File A, Open 2nd PDF = File B.",
     "related": ["pdf-tools-split", "pdf-tools-rotate", "library-overview"]},
    {"id": "pdf-tools-split", "icon": "split", "title": "Split a PDF by page ranges",
     "sub": "Divide a multipage PDF into separate files.",
     "tags": ["tools", "split", "divide", "page range", "extract pages"], "workspace": "tools",
     "purpose": "Extract specific pages or ranges from a PDF.",
     "prerequisites": "A PDF with multiple pages.",
     "steps": [
         {"title": "Open the PDF", "body": "Tap Open PDF in PDF Tools."},
         {"title": "Select Split", "body": "Tap the Split tab."},
         {"title": "Enter ranges", "body": "Type page ranges in the format 1-3,5,8-10. Spaces around the dashes are optional. The total page count is shown for reference."},
         {"title": "Run", "body": "Tap Run. The first split file appears in the Preview area; additional files are saved to your Library automatically with names like \"Split part 2\"."},
         {"title": "Export", "body": "Use Save / Download / Share / Print for the first file. Additional parts are already in your Library."},
     ],
     "troubleshooting": "If you see \"Range X-Y out of bounds\", check the total page count shown in the panel. Ranges are 1-indexed and must satisfy 1 ≤ from ≤ to ≤ total.",
     "related": ["pdf-tools-merge", "pdf-tools-rotate", "pdf-tools-reorder"]},
    {"id": "pdf-tools-rotate", "icon": "rotate", "title": "Rotate PDF pages",
     "sub": "Rotate every page by 90°, 180°, or 270°.",
     "tags": ["tools", "rotate", "turn", "orientation", "90", "180", "270"], "workspace": "tools",
     "purpose": "Fix pages that are sideways or upside down.",
     "prerequisites": "A PDF open in PDF Tools.",
     "steps": [
         {"title": "Open the PDF", "body": "Tap Open PDF in PDF Tools."},
         {"title": "Select Rotate", "body": "Tap the Rotate tab."},
         {"title": "Pick angle", "body": "Tap 90°, 180°, or 270°. Rotation is applied cumulatively on top of the existing orientation."},
         {"title": "Run + Export", "body": "Tap Run to apply, then use Save / Download / Share / Print."},
     ],
     "troubleshooting": "Rotation applies to ALL pages in the document. If you need to rotate only specific pages, split first, rotate the part, then merge.",
     "related": ["pdf-tools-merge", "pdf-tools-split", "pdf-tools-reorder"]},
    {"id": "pdf-tools-reorder", "icon": "reorder", "title": "Reorder PDF pages",
     "sub": "Rearrange pages into a new sequence.",
     "tags": ["tools", "reorder", "rearrange", "move pages", "sequence", "order"], "workspace": "tools",
     "purpose": "Change the page order of a multipage PDF.",
     "prerequisites": "A multipage PDF open in PDF Tools.",
     "steps": [
         {"title": "Open the PDF", "body": "Tap Open PDF in PDF Tools."},
         {"title": "Select Reorder", "body": "Tap the Reorder tab."},
         {"title": "Enter new order", "body": "Type a comma-separated list of the new page positions, 1-indexed. For a 3-page PDF, \"3,1,2\" moves page 3 to position 1, page 1 to position 2, and page 2 to position 3. The placeholder shows the default order."},
         {"title": "Run + Export", "body": "Tap Run, then Save / Download / Share / Print."},
     ],
     "troubleshooting": "The list must be a complete permutation. For 3 pages you need exactly 3 unique numbers from 1-3. Duplicates or missing numbers will be rejected.",
     "related": ["pdf-tools-rotate", "pdf-tools-split", "pdf-tools-merge"]},
    {"id": "pdf-tools-annotate-text", "icon": "text", "title": "Annotate a PDF with text",
     "sub": "Add typed annotations like \"Reviewed by J.S.\" to a chosen page.",
     "tags": ["tools", "annotate", "text annotation", "reviewed", "note", "comment"], "workspace": "tools",
     "purpose": "Add text annotations to PDF pages.",
     "prerequisites": "A PDF open in PDF Tools.",
     "steps": [
         {"title": "Open the PDF", "body": "Tap Open PDF in PDF Tools."},
         {"title": "Select Annotate", "body": "Tap the Annotate tab. Two sub-tabs appear: Text and Draw."},
         {"title": "Stay in Text mode", "body": "The Text sub-tab is active by default."},
         {"title": "Set page + text", "body": "Pick the Page number and type the annotation Text (e.g. \"Reviewed by J.S.\")."},
         {"title": "Position + color", "body": "Set Position X and Position Y as percentages (0-100), pick an Ink color, and a Font size in points."},
         {"title": "Run + Export", "body": "Tap Run to bake the annotation into the PDF, then Save / Download / Share / Print."},
     ],
     "troubleshooting": "If Run is disabled, type some text first. The annotation appears at the chosen X/Y position (0,0 = top-left; 100,100 = bottom-right).",
     "related": ["pdf-tools-annotate-draw", "pdf-tools-watermark", "sign-text"]},
    {"id": "pdf-tools-annotate-draw", "icon": "pen", "title": "Draw freehand on a PDF",
     "sub": "Circle, underline, or mark up a PDF with your finger, Apple Pencil, or mouse.",
     "tags": ["tools", "annotate", "draw", "apple pencil", "finger", "circle", "freehand", "sketch", "markup"], "workspace": "tools",
     "purpose": "Add freehand drawings (circles, arrows, underlines) directly onto PDF pages.",
     "prerequisites": "A PDF open in PDF Tools, ideally with Preview loaded.",
     "steps": [
         {"title": "Open the PDF", "body": "Tap Open PDF in PDF Tools. Wait for the page to render in the Preview area."},
         {"title": "Select Annotate → Draw", "body": "Tap the Annotate tab, then the Draw sub-tab."},
         {"title": "Choose pen settings", "body": "Pick the Page to draw on, choose a Pen color, and adjust Pen width (1-20)."},
         {"title": "Draw", "body": "Draw directly on the page preview with your finger, Apple Pencil, or mouse. Strokes appear in real time on the transparent overlay."},
         {"title": "Clear (optional)", "body": "Tap Clear strokes to start over without affecting the underlying PDF."},
         {"title": "Run + Export", "body": "Tap Run to bake the strokes into the PDF as a transparent PNG layer. Then use Save / Download / Share / Print."},
     ],
     "troubleshooting": "If the draw canvas doesn't respond, make sure you're in the Draw sub-tab (not Text). The overlay sits exactly on top of the rendered page — strokes map 1:1 to PDF coordinates.",
     "related": ["pdf-tools-annotate-text", "pdf-tools-watermark", "sign-pdf"]},
    {"id": "pdf-tools-watermark", "icon": "watermark", "title": "Apply a watermark in PDF Tools",
     "sub": "Same as the Sign workspace watermark, but accessed via PDF Tools.",
     "tags": ["tools", "watermark", "draft", "confidential", "opacity"], "workspace": "tools",
     "purpose": "Apply a text watermark across all pages of a PDF.",
     "prerequisites": "A PDF open in PDF Tools.",
     "steps": [
         {"title": "Open the PDF", "body": "Tap Open PDF in PDF Tools."},
         {"title": "Select Watermark", "body": "Tap the Watermark tab."},
         {"title": "Configure", "body": "Set Watermark text, Direction (Diagonal or Horizontal), and Opacity (0-100%)."},
         {"title": "Run + Export", "body": "Tap Run, then Save / Download / Share / Print."},
     ],
     "troubleshooting": "Identical to the Sign workspace watermark. See \"Add a watermark to a PDF\" for more detail.",
     "related": ["sign-watermark", "pdf-tools-annotate-text"]},
    {"id": "pdf-tools-compare", "icon": "compare", "title": "Compare two PDFs side-by-side",
     "sub": "View File A and File B at the same scale for visual comparison.",
     "tags": ["tools", "compare", "side by side", "two pdfs", "comparison", "diff"], "workspace": "tools",
     "purpose": "Visually compare two PDFs without leaving the app.",
     "prerequisites": "Two PDF files on your device.",
     "steps": [
         {"title": "Open File A", "body": "Tap Open PDF in PDF Tools. This is File A."},
         {"title": "Open File B", "body": "Tap Open 2nd PDF (for merge). This is File B."},
         {"title": "Select Compare", "body": "Tap the Compare tab. The Preview area below shows two labeled panes."},
         {"title": "Run", "body": "Tap Run. Both first pages render at 380px width in their labeled panes."},
         {"title": "Compare", "body": "Scroll the page to see both side-by-side. On mobile (below 768px), the panes stack vertically."},
     ],
     "troubleshooting": "Compare is view-only — it doesn't modify either PDF. To produce a merged file, use the Merge tab instead.",
     "related": ["pdf-tools-merge", "library-overview"]},
    {"id": "library-overview", "icon": "library", "title": "Use the document Library",
     "sub": "Local storage, open / rename / delete saved documents.",
     "tags": ["library", "storage", "indexeddb", "saved", "documents", "rename", "delete"], "workspace": "library",
     "purpose": "Manage documents saved locally in your browser.",
     "prerequisites": "None. The Library is always available.",
     "steps": [
         {"title": "Open Library", "body": "Tap Library in the bottom navigation. Saved documents appear as cards with a thumbnail of the first page, name, page count, size, and modification date."},
         {"title": "Open in Sign", "body": "Tap Open in Sign on a card to load the document into the Sign workspace."},
         {"title": "Open in Tools", "body": "Tap Tools on a card to load it into PDF Tools."},
         {"title": "Rename", "body": "Tap Rename, type a new name, and confirm."},
         {"title": "Delete", "body": "Tap Delete on a card. A confirmation prompt prevents accidental deletes."},
         {"title": "Refresh", "body": "Tap Refresh to re-query IndexedDB if you've saved from another workspace."},
     ],
     "troubleshooting": "Browser-local storage is NOT cloud backup. If you clear site data, reset the browser, or remove storage, saved documents are lost. To be safe, use Download on important documents.",
     "related": ["sign-export", "home", "studio-scan"]},
    {"id": "help-system", "icon": "help", "title": "Use the Help system",
     "sub": "Find topics, search, and restart the interactive tutorial.",
     "tags": ["help", "tutorial", "walkthrough", "search", "guide", "instructions"], "workspace": "help",
     "purpose": "Navigate the Help Center and restart walkthroughs.",
     "prerequisites": "None.",
     "steps": [
         {"title": "Open Help", "body": "Tap Help in the bottom navigation."},
         {"title": "Search", "body": "Use the search field at the top. Type \"sign\", \"scan\", \"watermark\", \"merge\", etc. Topics filter live as you type."},
         {"title": "Open a topic", "body": "Tap any topic card to open the full illustrated article. Articles include Purpose, Prerequisites, numbered Steps, Troubleshooting, and Related topics."},
         {"title": "Back", "body": "Tap ‹ Back at the top of any article to return to the topic grid."},
         {"title": "Restart tutorial", "body": "At the bottom of the Help workspace is a \"Restart interactive tutorial\" button. Tap it to replay the Home walkthrough from the beginning."},
     ],
     "troubleshooting": "If search returns no results, try shorter keywords. The search matches against titles, subtitles, and tags.",
     "related": ["home", "studio-scan", "sign-pdf", "pdf-tools-merge"]},
    {"id": "troubleshooting", "icon": "warning", "title": "Troubleshooting common issues",
     "sub": "Camera, OCR, sharing, offline, and lost documents.",
     "tags": ["troubleshooting", "camera", "ocr", "share", "offline", "lost", "permission"], "workspace": "help",
     "purpose": "Solve common problems quickly.",
     "prerequisites": "None.",
     "steps": [
         {"title": "Camera doesn't open", "body": "Check browser permissions (Settings → Privacy → Camera). Confirm the site is on HTTPS. As a fallback, use Import images."},
         {"title": "OCR is slow", "body": "The first run downloads the Tesseract language model (a few MB). Subsequent runs are faster and work offline once cached."},
         {"title": "PDF won't open", "body": "Make sure it's not password-protected. DocuScan Pro can parse encrypted PDFs but cannot re-save them."},
         {"title": "Sharing unavailable", "body": "Some browsers don't support the Web Share API for files. The app automatically falls back to a download."},
         {"title": "Lost documents", "body": "Browser-local storage is not cloud backup. Clearing site data, resetting the browser, or removing storage deletes saved documents. Always Download important files."},
         {"title": "Offline use", "body": "The app shell and all dependencies are cached by the service worker. OCR, PDF preview, and PDF editing all work offline once the assets are cached."},
     ],
     "troubleshooting": "For anything else, restart your browser. If problems persist, the app may have been updated — refresh to grab the latest version.",
     "related": ["home", "library-overview"]},
    {"id": "privacy", "icon": "lock", "title": "Privacy and local storage",
     "sub": "What stays on your device, what doesn't, and how to back up.",
     "tags": ["privacy", "security", "local", "storage", "indexeddb", "backup", "offline"], "workspace": "help",
     "purpose": "Understand exactly what happens to your documents.",
     "prerequisites": "None.",
     "steps": [
         {"title": "Local-first", "body": "Documents are processed in your browser and stored in IndexedDB on your device."},
         {"title": "No uploads", "body": "Nothing in the application transmits document content to any server."},
         {"title": "OCR on-device", "body": "Tesseract.js runs entirely on-device once the language model is cached. First run downloads it from the official Tesseract data CDN."},
         {"title": "File validation", "body": "Images are type- and size-validated before processing. PDFs are validated by checking the %PDF- magic bytes before parsing."},
         {"title": "No cloud backup", "body": "Clearing site data, resetting the browser, or removing storage deletes saved documents. Use Download to save copies."},
     ],
     "troubleshooting": "To check storage usage, open your browser's DevTools → Application → Storage. To clear all app data, use Clear site data — but back up first.",
     "related": ["library-overview", "troubleshooting"]},
]

WORKSPACES = {
    'home': 'Home',
    'studio': 'Document Studio',
    'sign': 'Add Text & Sign',
    'tools': 'PDF Tools',
    'library': 'Library',
    'help': 'Help',
}

OUT_DIR = Path('/home/z/my-project/download')
OUT_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# PDF generator (reportlab)
# ---------------------------------------------------------------------------

def generate_pdf():
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.lib import colors
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    )
    from reportlab.lib.enums import TA_LEFT

    out_path = OUT_DIR / 'DocuScan-Pro-Help-Manual.pdf'
    doc = SimpleDocTemplate(
        str(out_path), pagesize=letter,
        leftMargin=0.85*inch, rightMargin=0.85*inch,
        topMargin=0.85*inch, bottomMargin=0.85*inch,
        title='DocuScan Pro Help Manual', author='DocuScan Pro',
    )
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle('H1', parent=styles['Heading1'],
                        fontSize=22, spaceBefore=24, spaceAfter=12,
                        textColor=colors.HexColor('#007AFF'))
    h2 = ParagraphStyle('H2', parent=styles['Heading2'],
                        fontSize=16, spaceBefore=18, spaceAfter=8,
                        textColor=colors.HexColor('#1C1C1E'))
    h3 = ParagraphStyle('H3', parent=styles['Heading3'],
                        fontSize=13, spaceBefore=10, spaceAfter=4,
                        textColor=colors.HexColor('#6E6E73'))
    body = ParagraphStyle('Body', parent=styles['BodyText'],
                          fontSize=10.5, leading=15, alignment=TA_LEFT,
                          spaceAfter=6)
    step_style = ParagraphStyle('Step', parent=body, leftIndent=20, bulletIndent=8)
    meta_style = ParagraphStyle('Meta', parent=body, fontSize=10, textColor=colors.HexColor('#6E6E73'))

    story = []
    # Cover
    story.append(Spacer(1, 2.5*inch))
    story.append(Paragraph('DocuScan Pro', ParagraphStyle('Cover', parent=h1, fontSize=36, alignment=1, spaceAfter=12)))
    story.append(Paragraph('Help Manual', ParagraphStyle('CoverSub', parent=h2, fontSize=20, alignment=1, textColor=colors.HexColor('#6E6E73'), spaceAfter=24)))
    story.append(Paragraph(f'Version 5.1.2  •  {datetime.now().strftime("%Y-%m-%d")}', meta_style))
    story.append(PageBreak())

    # Table of contents
    story.append(Paragraph('Table of Contents', h1))
    story.append(Spacer(1, 0.2*inch))
    toc_rows = [['#', 'Topic', 'Workspace']]
    for i, t in enumerate(HELP_TOPICS, 1):
        toc_rows.append([str(i), t['title'], WORKSPACES.get(t['workspace'], '—')])
    toc_table = Table(toc_rows, colWidths=[0.4*inch, 4.2*inch, 1.6*inch])
    toc_table.setStyle(TableStyle([
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,0), 10),
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#F2F2F7')),
        ('FONTSIZE', (0,1), (-1,-1), 10),
        ('TEXTCOLOR', (0,1), (-1,-1), colors.HexColor('#1C1C1E')),
        ('LINEBELOW', (0,0), (-1,0), 0.5, colors.HexColor('#D1D1D6')),
        ('LINEBELOW', (0,1), (-1,-2), 0.25, colors.HexColor('#E5E5EA')),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(toc_table)
    story.append(PageBreak())

    # Each topic
    for i, t in enumerate(HELP_TOPICS, 1):
        story.append(Paragraph(f'{i}. {t["title"]}', h1))
        story.append(Paragraph(t['sub'], meta_style))
        story.append(Spacer(1, 0.15*inch))

        story.append(Paragraph('Purpose', h3))
        story.append(Paragraph(t['purpose'], body))

        story.append(Paragraph('What you need', h3))
        story.append(Paragraph(t['prerequisites'], body))

        story.append(Paragraph('Steps', h3))
        for j, step in enumerate(t['steps'], 1):
            story.append(Paragraph(f'<b>{j}. {step["title"]}.</b> {step["body"]}', step_style))

        if t.get('troubleshooting'):
            story.append(Paragraph('Troubleshooting', h3))
            story.append(Paragraph(t['troubleshooting'], body))

        if t.get('related'):
            related_titles = []
            related_map = {x['id']: x['title'] for x in HELP_TOPICS}
            for rid in t['related']:
                if rid in related_map:
                    related_titles.append(related_map[rid])
            if related_titles:
                story.append(Paragraph('Related topics', h3))
                story.append(Paragraph(', '.join(related_titles), meta_style))

        story.append(PageBreak())

    # Appendix: Privacy summary
    story.append(Paragraph('Appendix: Privacy &amp; Local Storage', h1))
    story.append(Paragraph(
        'DocuScan Pro is local-first. Your documents are processed in your browser and stored in IndexedDB on your device. '
        'Documents are NOT uploaded to any server. OCR runs entirely on-device once the language model is cached. '
        'Browser-local storage is NOT cloud backup — clearing site data, resetting the browser, or removing storage deletes '
        'saved documents. Always use Download to keep copies of important files.',
        body))

    doc.build(story)
    print(f'PDF written: {out_path} ({out_path.stat().st_size} bytes)')


# ---------------------------------------------------------------------------
# DOCX generator (python-docx)
# ---------------------------------------------------------------------------

def generate_docx():
    from docx import Document
    from docx.shared import Pt, RGBColor, Inches
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement

    out_path = OUT_DIR / 'DocuScan-Pro-Help-Manual.docx'
    doc = Document()

    # Page setup
    section = doc.sections[0]
    section.top_margin = Inches(0.85)
    section.bottom_margin = Inches(0.85)
    section.left_margin = Inches(0.85)
    section.right_margin = Inches(0.85)

    # Cover
    for _ in range(6):
        doc.add_paragraph()
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run('DocuScan Pro')
    run.font.size = Pt(36)
    run.font.color.rgb = RGBColor(0x00, 0x7A, 0xFF)
    run.bold = True
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run('Help Manual')
    run.font.size = Pt(20)
    run.font.color.rgb = RGBColor(0x6E, 0x6E, 0x73)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(f'Version 5.1.2  •  {datetime.now().strftime("%Y-%m-%d")}')
    run.font.size = Pt(10)
    run.font.color.rgb = RGBColor(0x6E, 0x6E, 0x73)

    doc.add_page_break()

    # Table of contents
    h = doc.add_heading('Table of Contents', level=1)
    for run in h.runs:
        run.font.color.rgb = RGBColor(0x00, 0x7A, 0xFF)
    table = doc.add_table(rows=1, cols=3)
    table.style = 'Light Grid Accent 1'
    hdr = table.rows[0].cells
    hdr[0].text = '#'
    hdr[1].text = 'Topic'
    hdr[2].text = 'Workspace'
    for i, t in enumerate(HELP_TOPICS, 1):
        row = table.add_row().cells
        row[0].text = str(i)
        row[1].text = t['title']
        row[2].text = WORKSPACES.get(t['workspace'], '—')

    doc.add_page_break()

    # Each topic
    for i, t in enumerate(HELP_TOPICS, 1):
        h = doc.add_heading(f'{i}. {t["title"]}', level=1)
        for run in h.runs:
            run.font.color.rgb = RGBColor(0x00, 0x7A, 0xFF)

        p = doc.add_paragraph()
        run = p.add_run(t['sub'])
        run.italic = True
        run.font.color.rgb = RGBColor(0x6E, 0x6E, 0x73)
        run.font.size = Pt(11)

        doc.add_heading('Purpose', level=3)
        doc.add_paragraph(t['purpose'])

        doc.add_heading('What you need', level=3)
        doc.add_paragraph(t['prerequisites'])

        doc.add_heading('Steps', level=3)
        for j, step in enumerate(t['steps'], 1):
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.25)
            run = p.add_run(f'{j}. {step["title"]}. ')
            run.bold = True
            p.add_run(step['body'])

        if t.get('troubleshooting'):
            doc.add_heading('Troubleshooting', level=3)
            doc.add_paragraph(t['troubleshooting'])

        if t.get('related'):
            related_map = {x['id']: x['title'] for x in HELP_TOPICS}
            related_titles = [related_map[r] for r in t['related'] if r in related_map]
            if related_titles:
                doc.add_heading('Related topics', level=3)
                p = doc.add_paragraph(', '.join(related_titles))
                for run in p.runs:
                    run.font.color.rgb = RGBColor(0x6E, 0x6E, 0x73)
                    run.italic = True

        doc.add_page_break()

    # Appendix
    h = doc.add_heading('Appendix: Privacy & Local Storage', level=1)
    for run in h.runs:
        run.font.color.rgb = RGBColor(0x00, 0x7A, 0xFF)
    doc.add_paragraph(
        'DocuScan Pro is local-first. Your documents are processed in your browser and stored in IndexedDB on your device. '
        'Documents are NOT uploaded to any server. OCR runs entirely on-device once the language model is cached. '
        'Browser-local storage is NOT cloud backup — clearing site data, resetting the browser, or removing storage deletes '
        'saved documents. Always use Download to keep copies of important files.'
    )

    doc.save(str(out_path))
    print(f'DOCX written: {out_path} ({out_path.stat().st_size} bytes)')


# ---------------------------------------------------------------------------
# XLSX inventory (openpyxl)
# ---------------------------------------------------------------------------

def generate_xlsx():
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    out_path = OUT_DIR / 'DocuScan-Pro-Help-Content-Inventory.xlsx'
    wb = Workbook()
    ws = wb.active
    ws.title = 'Help Content Inventory'

    headers = [
        'Workspace', 'Topic ID', 'Help Topic', 'Step #', 'Step Title',
        'Control/Feature', 'Instruction', 'Tags', 'Troubleshooting',
        'Related Topics', 'Verification Status',
    ]
    for col, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=h)
        cell.font = Font(bold=True, color='FFFFFF', size=11)
        cell.fill = PatternFill('solid', fgColor='007AFF')
        cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        cell.border = Border(bottom=Side(style='thin', color='D1D1D6'))

    row = 2
    for t in HELP_TOPICS:
        related_map = {x['id']: x['title'] for x in HELP_TOPICS}
        related_titles = ', '.join(related_map[r] for r in t.get('related', []) if r in related_map)
        for j, step in enumerate(t['steps'], 1):
            # Extract any control name mentioned in step title (heuristic)
            control = step['title']
            ws.cell(row=row, column=1, value=WORKSPACES.get(t['workspace'], t['workspace']))
            ws.cell(row=row, column=2, value=t['id'])
            ws.cell(row=row, column=3, value=t['title'])
            ws.cell(row=row, column=4, value=j)
            ws.cell(row=row, column=5, value=step['title'])
            ws.cell(row=row, column=6, value=control)
            ws.cell(row=row, column=7, value=step['body'])
            ws.cell(row=row, column=8, value=', '.join(t.get('tags', [])))
            ws.cell(row=row, column=9, value=t.get('troubleshooting', ''))
            ws.cell(row=row, column=10, value=related_titles)
            ws.cell(row=row, column=11, value='Verified v5.1.0')
            # Apply row formatting
            for c in range(1, len(headers) + 1):
                cell = ws.cell(row=row, column=c)
                cell.alignment = Alignment(vertical='top', wrap_text=True)
                cell.border = Border(bottom=Side(style='thin', color='E5E5EA'))
            row += 1

    # Column widths
    widths = [16, 22, 36, 7, 22, 18, 50, 22, 36, 30, 16]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    # Freeze header row
    ws.freeze_panes = 'A2'

    # Auto filter
    ws.auto_filter.ref = f'A1:{get_column_letter(len(headers))}{row-1}'

    # Second sheet: summary
    ws2 = wb.create_sheet('Summary')
    ws2['A1'] = 'DocuScan Pro Help Content Inventory'
    ws2['A1'].font = Font(bold=True, size=16, color='007AFF')
    ws2['A2'] = f'Version 5.1.2  •  {datetime.now().strftime("%Y-%m-%d")}'
    ws2['A2'].font = Font(size=10, color='6E6E73')
    ws2['A4'] = 'Total topics'
    ws2['B4'] = len(HELP_TOPICS)
    ws2['A5'] = 'Total steps'
    ws2['B5'] = sum(len(t['steps']) for t in HELP_TOPICS)
    ws2['A6'] = 'Workspaces covered'
    ws2['B6'] = len(set(t['workspace'] for t in HELP_TOPICS))
    ws2.column_dimensions['A'].width = 28
    ws2.column_dimensions['B'].width = 8

    wb.save(str(out_path))
    print(f'XLSX written: {out_path} ({out_path.stat().st_size} bytes)')


if __name__ == '__main__':
    generate_pdf()
    generate_docx()
    generate_xlsx()
