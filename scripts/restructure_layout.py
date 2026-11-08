#!/usr/bin/env python3
"""
Restructure Studio, Sign, and PDF Tools workspaces into a consistent
2-column layout (controls left, preview right) with page navigation and
OCR result panel placed UNDER the preview pane.

Run: python3 scripts/restructure_layout.py
"""
import re
from pathlib import Path

ROOT = Path("/home/z/my-project")
INDEX = ROOT / "index.html"

text = INDEX.read_text()
orig = text

# =====================================================================
# 1) STUDIO — replace entire Studio workspace body
# =====================================================================
STUDIO_START = '    <!-- ============== Studio ============== -->\n'
STUDIO_END = '    <!-- ============== Sign ============== -->'

i_start = text.find(STUDIO_START)
i_end = text.find(STUDIO_END)
assert i_start != -1 and i_end != -1 and i_end > i_start, "Studio block not found"

new_studio = '''    <!-- ============== Studio ============== -->
    <section class="workspace" id="ws-studio" data-workspace="studio" aria-label="Studio">
      <div class="page-header">
        <div>
          <h1 class="page-header__title">Studio</h1>
          <p class="page-header__sub">Capture or import images, enhance them, optionally run OCR, and assemble them into a PDF.</p>
        </div>
        <button class="page-tour-btn" data-tour="studio" type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Tour this page
        </button>
      </div>

      <div class="sign-layout">
        <div class="sign-layout__left">

      <div class="section">
        <h2 class="section__title">Capture &amp; import</h2>
        <div class="capture-controls">
          <button class="btn" id="btnCaptureCamera" type="button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            Camera
          </button>
          <button class="btn" id="btnImportImages" type="button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            Import images
          </button>
        </div>
        <input type="file" id="cameraInput" accept="image/*" capture="environment" hidden />
        <input type="file" id="imagesInput" accept=".jpg,.jpeg,.png,.gif,.webp,.bmp,.tiff" multiple hidden />
      </div>

      <div class="section">
        <h2 class="section__title">Pages</h2>
        <div class="card">
          <div class="thumb-strip" id="studioThumbs" aria-live="polite"></div>
          <p class="muted tiny center" id="studioEmptyHint" style="margin:var(--space-3) 0 0">
            No pages yet — capture or import images to begin.
          </p>
          <div class="row row--wrap" style="margin-top:var(--space-3)">
            <button class="btn btn--sm" id="btnRotatePage" type="button" disabled>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              Rotate
            </button>
            <button class="btn btn--sm" id="btnDeletePage" type="button" disabled>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              Delete
            </button>
            <button class="btn btn--sm btn--danger" id="btnClearAllPages" type="button" disabled>Clear all</button>
          </div>
        </div>
      </div>

      <div class="section">
        <h2 class="section__title">Enhancement</h2>
        <div class="card">
          <div class="enhance-grid" id="enhancePresets" role="group" aria-label="Enhancement presets">
            <button class="chip" data-preset="none" type="button">Original</button>
            <button class="chip" data-preset="auto" type="button">Auto</button>
            <button class="chip" data-preset="grayscale" type="button">Grayscale</button>
            <button class="chip" data-preset="bw" type="button">B&amp;W</button>
            <button class="chip" data-preset="brighten" type="button">Brighten</button>
            <button class="chip" data-preset="contrast" type="button">Contrast+</button>
          </div>
          <div class="stack" style="margin-top:var(--space-4)">
            <div class="slider-row">
              <label class="field__label" for="brightness" style="width:80px">Brightness</label>
              <input type="range" id="brightness" min="-100" max="100" value="0" />
              <span class="value" id="brightnessValue">0</span>
            </div>
            <div class="slider-row">
              <label class="field__label" for="contrast" style="width:80px">Contrast</label>
              <input type="range" id="contrast" min="-100" max="100" value="0" />
              <span class="value" id="contrastValue">0</span>
            </div>
          </div>
          <div class="row" style="margin-top:var(--space-3)">
            <button class="btn btn--sm" id="btnApplyEnhance" type="button">Apply to selected page</button>
            <button class="btn btn--sm btn--ghost" id="btnResetEnhance" type="button">Reset</button>
            <button class="btn btn--sm btn--ghost" id="btnAutoCrop" type="button">Auto-crop</button>
          </div>
        </div>
      </div>

      <div class="section">
        <h2 class="section__title">OCR (text recognition)</h2>
        <div class="card">
          <p class="muted tiny" style="margin:0 0 var(--space-3)">
            Recognizes text on the selected page using Tesseract.js. Works best on sharp, high-contrast scans. Result appears under the preview.
          </p>
          <div class="row">
            <button class="btn btn--sm" id="btnRunOcr" type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/></svg>
              Scan
            </button>
            <select class="select" id="ocrLanguage" style="width:auto;height:36px;font-size:13px">
              <option value="eng">English</option>
              <option value="spa">Spanish</option>
              <option value="fra">French</option>
              <option value="deu">German</option>
              <option value="ita">Italian</option>
              <option value="por">Portuguese</option>
              <option value="nld">Dutch</option>
              <option value="chi_sim">Chinese</option>
              <option value="jpn">Japanese</option>
              <option value="kor">Korean</option>
              <option value="rus">Russian</option>
              <option value="ara">Arabic</option>
              <option value="hin">Hindi</option>
            </select>
            <div class="spacer"></div>
            <span class="badge badge--secondary" id="ocrStatus">Idle</span>
          </div>
        </div>
      </div>

      <div class="section">
        <h2 class="section__title">Create PDF</h2>
        <div class="card">
          <div class="row row--wrap" style="margin-bottom:var(--space-3)">
            <label class="field" style="flex:1; min-width:160px">
              <span class="field__label">Page size</span>
              <select class="select" id="pdfPageSize">
                <option value="letter">Letter (8.5×11")</option>
                <option value="a4">A4 (210×297mm)</option>
                <option value="auto">Fit to image</option>
              </select>
            </label>
            <label class="field" style="flex:1; min-width:160px">
              <span class="field__label">Orientation</span>
              <select class="select" id="pdfOrientation">
                <option value="auto">Auto</option>
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </label>
          </div>
          <div class="row row--wrap">
            <button class="btn btn--primary" id="btnCreatePdf" type="button">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Create PDF
            </button>
            <button class="btn" id="btnSendToSign" type="button">Send to Sign ›</button>
            <button class="btn" id="btnSendToTools" type="button">Send to PDF Tools ›</button>
          </div>
        </div>
      </div>

      <div class="section">
        <h2 class="section__title">Export</h2>
        <p class="muted tiny" style="margin:0 0 var(--space-2)">Builds a PDF from your current pages, then performs the chosen action.</p>
        <div class="export-actions">
          <button class="btn" id="btnStudioSave" type="button" disabled>
            <svg class="btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            Save to Library
          </button>
          <button class="btn" id="btnStudioDownload" type="button" disabled>
            <svg class="btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download
          </button>
          <button class="btn" id="btnStudioShare" type="button" disabled>
            <svg class="btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            Share
          </button>
          <button class="btn" id="btnStudioPrint" type="button" disabled>
            <svg class="btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Print
          </button>
        </div>
      </div>

        </div>
        <div class="sign-layout__right">
          <div class="card card--padded">
            <h3 class="card__title">Preview</h3>
            <div class="pdf-canvas-wrap" id="studioPreviewWrap" style="min-height:400px">
              <div class="empty-state" id="studioPreviewEmpty">
                <div class="empty-state__icon" aria-hidden="true">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                </div>
                <div class="empty-state__title">No page selected</div>
                <div class="empty-state__sub">Capture or import images to see a preview.</div>
              </div>
              <canvas id="studioPreviewCanvas" hidden></canvas>
            </div>
            <div class="page-nav" id="studioPageNav" role="navigation" aria-label="Page navigation">
              <button class="page-nav__btn" id="btnStudioPrevPage" type="button" aria-label="Previous page" disabled>‹</button>
              <span class="page-nav__label" id="studioPageNavLabel">No pages</span>
              <button class="page-nav__btn" id="btnStudioNextPage" type="button" aria-label="Next page" disabled>›</button>
            </div>
            <input type="range" id="studioPageSlider" min="1" max="1" value="1" style="width:100%;margin-top:8px;display:none" aria-label="Page slider" />
          </div>

          <div class="card card--padded" id="studioOcrResultCard">
            <h3 class="card__title">OCR result</h3>
            <p class="card__subtitle">Text recognized from the selected page appears here.</p>
            <textarea class="textarea" id="ocrResult" placeholder="Run Scan to recognize text on the selected page…" style="margin-top:var(--space-2)" aria-label="Recognized text"></textarea>
            <div class="row" style="margin-top:var(--space-2)">
              <button class="btn btn--sm btn--ghost" id="btnCopyOcr" type="button">Copy text</button>
              <button class="btn btn--sm btn--ghost" id="btnDownloadOcr" type="button">Download .txt</button>
              <button class="btn btn--sm btn--ghost" id="btnSpeakOcr" type="button">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                Read aloud
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

'''

text = text[:i_start] + new_studio + text[i_end:]

# =====================================================================
# 2) SIGN — move pageNav + pageSlider from left to right (under preview)
# =====================================================================
# Remove the sign-aligned-stack block (which contains pageNav + slider) from left
SIGN_LEFT_OLD = '''      <div class="sign-layout">
        <div class="sign-layout__left">
          <!-- §8.2 strict-aligned stack: Open PDF + page-nav share parent width, height, edges, radius, border -->
          <div class="sign-aligned-stack">
            <button class="btn btn--primary" id="btnOpenPdfSign" type="button">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              Open PDF from Files
            </button>
            <div class="page-nav" id="pageNav" role="navigation" aria-label="Page navigation">
              <button class="page-nav__btn" id="btnPrevPage" type="button" aria-label="Previous page" disabled>‹</button>
              <span class="page-nav__label" id="pageNavLabel">No document</span>
              <button class="page-nav__btn" id="btnNextPage" type="button" aria-label="Next page" disabled>›</button>
              <button class="page-nav__btn" id="btnScrollMode" type="button" aria-label="Toggle continuous scroll" title="Show all pages" style="font-size:16px">☰</button>
            </div>
            <input type="range" id="pageSlider" min="1" max="1" value="1" style="width:100%;margin-top:8px;display:none" aria-label="Page slider" />
          </div>
          <input type="file" id="signPdfInput" accept="application/pdf" hidden />

'''

SIGN_LEFT_NEW = '''      <div class="sign-layout">
        <div class="sign-layout__left">
          <button class="btn btn--primary" id="btnOpenPdfSign" type="button" style="width:100%">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            Open PDF from Files
          </button>
          <input type="file" id="signPdfInput" accept="application/pdf" hidden />

'''

assert SIGN_LEFT_OLD in text, "Sign left block not found"
text = text.replace(SIGN_LEFT_OLD, SIGN_LEFT_NEW)

# Add pageNav + pageSlider under preview pane (right column)
SIGN_RIGHT_OLD = '''            <div class="pdf-canvas-wrap" id="signCanvasWrap">
              <div class="empty-state" id="signEmptyState">
                <div class="empty-state__icon" aria-hidden="true">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
                <div class="empty-state__title">No document</div>
                <div class="empty-state__sub">Open a PDF from the left panel to begin.</div>
              </div>
              <!-- Stage is exactly the size of the canvas; overlay boxes
                   are positioned inside it so click→overlay mapping is
                   pixel-perfect regardless of wrap padding. -->
              <div class="pdf-canvas-stage" id="signCanvasStage" hidden>
                <canvas id="signCanvas"></canvas>
              </div>
            </div>
            <div class="row" style="margin-top:var(--space-3)">
              <span class="badge badge--secondary" id="signDocInfo">No document loaded</span>
              <div class="spacer"></div>
              <span class="tiny muted" id="signHint">Tip: click on the page to drop a text element at that location.</span>
            </div>'''

SIGN_RIGHT_NEW = '''            <div class="pdf-canvas-wrap" id="signCanvasWrap">
              <div class="empty-state" id="signEmptyState">
                <div class="empty-state__icon" aria-hidden="true">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
                <div class="empty-state__title">No document</div>
                <div class="empty-state__sub">Open a PDF from the left panel to begin.</div>
              </div>
              <!-- Stage is exactly the size of the canvas; overlay boxes
                   are positioned inside it so click→overlay mapping is
                   pixel-perfect regardless of wrap padding. -->
              <div class="pdf-canvas-stage" id="signCanvasStage" hidden>
                <canvas id="signCanvas"></canvas>
              </div>
            </div>
            <div class="page-nav" id="pageNav" role="navigation" aria-label="Page navigation" style="margin-top:var(--space-3)">
              <button class="page-nav__btn" id="btnPrevPage" type="button" aria-label="Previous page" disabled>‹</button>
              <span class="page-nav__label" id="pageNavLabel">No document</span>
              <button class="page-nav__btn" id="btnNextPage" type="button" aria-label="Next page" disabled>›</button>
              <button class="page-nav__btn" id="btnScrollMode" type="button" aria-label="Toggle continuous scroll" title="Show all pages" style="font-size:16px">☰</button>
            </div>
            <input type="range" id="pageSlider" min="1" max="1" value="1" style="width:100%;margin-top:8px;display:none" aria-label="Page slider" />
            <div class="row" style="margin-top:var(--space-3)">
              <span class="badge badge--secondary" id="signDocInfo">No document loaded</span>
              <div class="spacer"></div>
              <span class="tiny muted" id="signHint">Tip: click on the page to drop a text element at that location.</span>
            </div>'''

assert SIGN_RIGHT_OLD in text, "Sign right block not found"
text = text.replace(SIGN_RIGHT_OLD, SIGN_RIGHT_NEW)

# =====================================================================
# 3) TOOLS — group top buttons by function, add pageNav under preview,
#    add OCR second preview card
# =====================================================================
TOOLS_TOP_OLD = '''      <div class="sign-layout">
        <div class="sign-layout__left">
      <div class="tools-flow">
        <div class="card card--padded">
          <div class="row">
            <button class="btn btn--primary" id="btnOpenPdfTools" type="button">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              Open PDF
            </button>
            <button class="btn" id="btnAddSecondPdf" type="button" disabled>Open 2nd PDF (for merge)</button>
            <div class="spacer"></div>
            <span class="badge badge--secondary" id="toolsDocInfo">No document loaded</span>
          </div>
          <input type="file" id="toolsPdfInput" accept="application/pdf" hidden />
          <input type="file" id="toolsMergeInput" accept="application/pdf" hidden />
        </div>'''

TOOLS_TOP_NEW = '''      <div class="sign-layout">
        <div class="sign-layout__left">
      <div class="tools-flow">
        <div class="card card--padded">
          <h3 class="card__title">Documents</h3>
          <div class="row">
            <button class="btn btn--primary" id="btnOpenPdfTools" type="button">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              Open PDF
            </button>
            <button class="btn" id="btnAddSecondPdf" type="button" disabled hidden>Open 2nd PDF</button>
            <div class="spacer"></div>
            <span class="badge badge--secondary" id="toolsDocInfo">No document loaded</span>
          </div>
          <input type="file" id="toolsPdfInput" accept="application/pdf" hidden />
          <input type="file" id="toolsMergeInput" accept="application/pdf" hidden />
        </div>'''

assert TOOLS_TOP_OLD in text, "Tools top block not found"
text = text.replace(TOOLS_TOP_OLD, TOOLS_TOP_NEW)

# Update Run button label so it can be dynamically swapped to "Scan" for OCR
TOOLS_RUN_OLD = '''          <div class="row row--wrap" style="margin-top:var(--space-4)">
            <button class="btn btn--primary" id="btnRunToolOp" type="button" disabled>Run</button>
            <button class="btn" id="btnPreviewTool" type="button" disabled>Preview</button>
            <div class="spacer"></div>
          </div>'''

TOOLS_RUN_NEW = '''          <div class="row row--wrap" style="margin-top:var(--space-4)">
            <button class="btn btn--primary" id="btnRunToolOp" type="button" disabled>Run</button>
            <button class="btn" id="btnPreviewTool" type="button" disabled>Preview</button>
            <div class="spacer"></div>
            <span class="tiny muted" id="toolsRunHint">Open a PDF to begin.</span>
          </div>'''

assert TOOLS_RUN_OLD in text, "Tools run row not found"
text = text.replace(TOOLS_RUN_OLD, TOOLS_RUN_NEW)

# Replace the entire Tools right pane with one that has page nav + OCR result card
TOOLS_RIGHT_OLD = '''        <div class="sign-layout__right">
          <div class="card card--padded" style="position:sticky;top:calc(var(--nav-height) + var(--space-4))">
          <h3 class="card__title">Preview</h3>
          <div class="pdf-canvas-wrap" id="toolsCanvasWrap">
            <div class="empty-state">
              <div class="empty-state__icon" aria-hidden="true">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </div>
              <div class="empty-state__title">No preview yet</div>
              <div class="empty-state__sub">Open a PDF and run an operation.</div>
            </div>
            <div class="pdf-canvas-stage" id="toolsCanvasStage" hidden>
              <canvas id="toolsCanvas"></canvas>
              <!-- For draw-annotate mode: an overlay canvas sits on top
                   of the rendered PDF page so user strokes map onto it. -->
              <canvas id="toolsDrawCanvas" class="draw-overlay" hidden></canvas>
            </div>
          </div>
          <!-- Side-by-side comparison view (Compare tab) -->
          <div id="compareView" hidden style="margin-top:var(--space-3)">
            <div class="compare-grid">
              <div class="compare-pane">
                <div class="compare-pane__label">File A</div>
                <div class="pdf-canvas-wrap" id="compareLeftWrap">
                  <div class="empty-state"><div class="empty-state__sub">Open primary PDF</div></div>
                </div>
              </div>
              <div class="compare-pane">
                <div class="compare-pane__label">File B</div>
                <div class="pdf-canvas-wrap" id="compareRightWrap">
                  <div class="empty-state"><div class="empty-state__sub">Open 2nd PDF</div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </section>'''

TOOLS_RIGHT_NEW = '''        <div class="sign-layout__right">
          <div class="card card--padded">
            <h3 class="card__title">Preview</h3>
            <div class="pdf-canvas-wrap" id="toolsCanvasWrap">
              <div class="empty-state">
                <div class="empty-state__icon" aria-hidden="true">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
                <div class="empty-state__title">No preview yet</div>
                <div class="empty-state__sub">Open a PDF and run an operation.</div>
              </div>
              <div class="pdf-canvas-stage" id="toolsCanvasStage" hidden>
                <canvas id="toolsCanvas"></canvas>
                <canvas id="toolsDrawCanvas" class="draw-overlay" hidden></canvas>
              </div>
            </div>
            <div class="page-nav" id="toolsPageNav" role="navigation" aria-label="Page navigation" style="margin-top:var(--space-3)">
              <button class="page-nav__btn" id="btnToolsPrevPage" type="button" aria-label="Previous page" disabled>‹</button>
              <span class="page-nav__label" id="toolsPageNavLabel">No document</span>
              <button class="page-nav__btn" id="btnToolsNextPage" type="button" aria-label="Next page" disabled>›</button>
            </div>
            <input type="range" id="toolsPageSlider" min="1" max="1" value="1" style="width:100%;margin-top:8px;display:none" aria-label="Page slider" />
          </div>

          <div class="card card--padded" id="toolsOcrResultCard" hidden>
            <h3 class="card__title">OCR result</h3>
            <p class="card__subtitle">Text recognized from the PDF appears here.</p>
            <div class="progress" id="pdfOcrProgress" style="display:none;margin-top:var(--space-2)">
              <div class="progress__bar" id="pdfOcrProgressBar"></div>
            </div>
            <textarea class="textarea" id="pdfOcrResult" placeholder="Run Scan to recognize text on the PDF…" style="margin-top:var(--space-2)" aria-label="OCR result" readonly></textarea>
            <div class="row" style="margin-top:var(--space-2)">
              <button class="btn btn--sm btn--ghost" id="btnCopyPdfOcr" type="button">Copy text</button>
              <button class="btn btn--sm btn--ghost" id="btnDownloadPdfOcr" type="button">Download .txt</button>
              <button class="btn btn--sm btn--ghost" id="btnSpeakPdfOcr" type="button">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                Read aloud
              </button>
            </div>
          </div>

          <div id="compareView" hidden>
            <div class="compare-grid">
              <div class="compare-pane">
                <div class="compare-pane__label">File A</div>
                <div class="pdf-canvas-wrap" id="compareLeftWrap">
                  <div class="empty-state"><div class="empty-state__sub">Open primary PDF</div></div>
                </div>
              </div>
              <div class="compare-pane">
                <div class="compare-pane__label">File B</div>
                <div class="pdf-canvas-wrap" id="compareRightWrap">
                  <div class="empty-state"><div class="empty-state__sub">Open 2nd PDF</div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </section>'''

assert TOOLS_RIGHT_OLD in text, "Tools right block not found"
text = text.replace(TOOLS_RIGHT_OLD, TOOLS_RIGHT_NEW)

INDEX.write_text(text)
print("index.html updated. Bytes:", len(text), "delta:", len(text) - len(orig))
