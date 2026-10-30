#!/usr/bin/env python3
"""Patch app.js for the new Studio/Tools layout."""
from pathlib import Path

APP = Path("/home/z/my-project/js/app.js")
text = APP.read_text()
orig = text

# ---------------------------------------------------------------------
# 1) Update updateStudioActions — drop btnMoveLeft/btnMoveRight refs,
#    add new page-nav refs.
# ---------------------------------------------------------------------
OLD1 = """function updateStudioActions() {
  const has = studio.pages.length > 0;
  const sel = studio.pages.find(p => p.id === studio.selectedId);
  ['btnRotatePage','btnDeletePage','btnClearAllPages','btnMoveLeft','btnMoveRight','btnApplyEnhance','btnResetEnhance','btnRunOcr'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !has;
  });
  const createBtn = document.getElementById('btnCreatePdf');
  if (createBtn) createBtn.disabled = !has;
  const sendSign = document.getElementById('btnSendToSign');
  const sendTools = document.getElementById('btnSendToTools');
  if (sendSign) sendSign.disabled = !has;
  if (sendTools) sendTools.disabled = !has;
  // Enable/disable the 4-button export row in Studio (Save/Download/Share/Print)
  ['btnStudioSave','btnStudioDownload','btnStudioShare','btnStudioPrint'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !has;
  });
  if (document.getElementById('btnMoveLeft')) {
    document.getElementById('btnMoveLeft').disabled = !sel || studio.pages.indexOf(sel) === 0;
    document.getElementById('btnMoveRight').disabled = !sel || studio.pages.indexOf(sel) === studio.pages.length - 1;
  }
}"""

NEW1 = """function updateStudioActions() {
  const has = studio.pages.length > 0;
  const sel = studio.pages.find(p => p.id === studio.selectedId);
  ['btnRotatePage','btnDeletePage','btnClearAllPages','btnApplyEnhance','btnResetEnhance','btnRunOcr'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !has;
  });
  const createBtn = document.getElementById('btnCreatePdf');
  if (createBtn) createBtn.disabled = !has;
  const sendSign = document.getElementById('btnSendToSign');
  const sendTools = document.getElementById('btnSendToTools');
  if (sendSign) sendSign.disabled = !has;
  if (sendTools) sendTools.disabled = !has;
  ['btnStudioSave','btnStudioDownload','btnStudioShare','btnStudioPrint'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !has;
  });
  // Page navigation lives under the preview pane now.
  const idx = sel ? studio.pages.indexOf(sel) : -1;
  const prev = document.getElementById('btnStudioPrevPage');
  const next = document.getElementById('btnStudioNextPage');
  if (prev) prev.disabled = !sel || idx <= 0;
  if (next) next.disabled = !sel || idx >= studio.pages.length - 1;
  const label = document.getElementById('studioPageNavLabel');
  if (label) label.textContent = has && sel ? `Page ${idx + 1} of ${studio.pages.length}` : 'No pages';
  const slider = document.getElementById('studioPageSlider');
  if (slider) {
    if (has && studio.pages.length > 1) {
      slider.style.display = '';
      slider.min = 1;
      slider.max = studio.pages.length;
      slider.value = idx + 1;
    } else {
      slider.style.display = 'none';
    }
  }
}"""
assert OLD1 in text
text = text.replace(OLD1, NEW1)

# ---------------------------------------------------------------------
# 2) addImageFile — add timestamp for camera source
# ---------------------------------------------------------------------
OLD2 = """async function addImageFile(file) {
  const v = validateImageFile(file);
  if (!v.ok) { toast(v.reason, 'error'); return; }
  try {
    const dataURL = await fileToDataURL(file);
    const img = await loadImage(dataURL);
    const canvas = imageToCanvas(img);
    const thumb = document.createElement('canvas');
    const tctx = thumb.getContext('2d');
    const tw = 184, th = 240;
    const ratio = Math.min(tw / canvas.width, th / canvas.height);
    thumb.width = canvas.width * ratio;
    thumb.height = canvas.height * ratio;
    tctx.drawImage(canvas, 0, 0, thumb.width, thumb.height);
    const page = {
      id: crypto.randomUUID(),
      name: file.name || `Page ${studio.pages.length + 1}`,
      originalCanvas: canvas,
      workingCanvas: canvas,
      thumbnailDataURL: thumb.toDataURL('image/jpeg', 0.7),
      transform: { brightness: 0, contrast: 0, preset: 'none' },
    };
    studio.pages.push(page);
    if (!studio.selectedId) studio.selectedId = page.id;
    renderStudioThumbs();
    toast(`Added ${file.name || 'page'} (${studio.pages.length} total)`, 'success');
  } catch (err) {
    toast(`Failed to add image: ${err.message}`, 'error');
  }
}"""

NEW2 = """async function addImageFile(file, opts = {}) {
  const v = validateImageFile(file);
  if (!v.ok) { toast(v.reason, 'error'); return; }
  try {
    const dataURL = await fileToDataURL(file);
    const img = await loadImage(dataURL);
    const canvas = imageToCanvas(img);
    // Stamp a small timestamp on camera captures (the only one of the three
    // capture paths that benefits from a fresh capture marker). Imported
    // images already carry their own EXIF/file metadata.
    if (opts && opts.source === 'camera') {
      stampTimestamp(canvas);
    }
    const thumb = document.createElement('canvas');
    const tctx = thumb.getContext('2d');
    const tw = 184, th = 240;
    const ratio = Math.min(tw / canvas.width, th / canvas.height);
    thumb.width = canvas.width * ratio;
    thumb.height = canvas.height * ratio;
    tctx.drawImage(canvas, 0, 0, thumb.width, thumb.height);
    const page = {
      id: crypto.randomUUID(),
      name: file.name || `Page ${studio.pages.length + 1}`,
      originalCanvas: canvas,
      workingCanvas: canvas,
      thumbnailDataURL: thumb.toDataURL('image/jpeg', 0.7),
      transform: { brightness: 0, contrast: 0, preset: 'none' },
    };
    studio.pages.push(page);
    if (!studio.selectedId) studio.selectedId = page.id;
    renderStudioThumbs();
    toast(`Added ${file.name || 'page'} (${studio.pages.length} total)`, 'success');
  } catch (err) {
    toast(`Failed to add image: ${err.message}`, 'error');
  }
}

// Draw a discreet bottom-right timestamp on a canvas. Designed to survive
// rotation and PDF assembly because it is baked into the pixel buffer.
function stampTimestamp(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const fontPx = Math.max(14, Math.round(canvas.width * 0.018));
  ctx.save();
  ctx.font = `${fontPx}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
  const padding = Math.round(fontPx * 0.6);
  const textW = ctx.measureText(stamp).width;
  const textH = fontPx;
  const boxW = textW + padding * 2;
  const boxH = textH + padding;
  const margin = Math.round(fontPx * 0.8);
  const x = canvas.width - boxW - margin;
  const y = canvas.height - boxH - margin;
  // Translucent chip background so the timestamp is legible on any image.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x, y, boxW, boxH);
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'middle';
  ctx.fillText(stamp, x + padding, y + boxH / 2 + 1);
  ctx.restore();
}"""
assert OLD2 in text
text = text.replace(OLD2, NEW2)

# Update scanner.js call to pass source through addImageFile opts
# scanner.js already calls handlers.onFile(f, { source: 'camera' }) — so addImageFile signature must accept opts.
# But scanner calls handlers.onFile(f, { source: 'camera' }) — second arg is opts. Good — our signature (file, opts = {}) matches.

# ---------------------------------------------------------------------
# 3) Replace btnMoveLeft/btnMoveRight listeners with new page-nav listeners
# ---------------------------------------------------------------------
OLD3 = """  document.getElementById('btnMoveLeft').addEventListener('click', () => {
    const i = studio.pages.findIndex(p => p.id === studio.selectedId);
    if (i <= 0) return;
    [studio.pages[i-1], studio.pages[i]] = [studio.pages[i], studio.pages[i-1]];
    renderStudioThumbs();
  });
  document.getElementById('btnMoveRight').addEventListener('click', () => {
    const i = studio.pages.findIndex(p => p.id === studio.selectedId);
    if (i < 0 || i >= studio.pages.length - 1) return;
    [studio.pages[i+1], studio.pages[i]] = [studio.pages[i], studio.pages[i+1]];
    renderStudioThumbs();
  });"""

NEW3 = """  // Page navigation lives under the preview pane. Prev/Next move the
  // selection pointer; they do not reorder. (Reordering stays drag-based
  // via the thumb strip.)
  document.getElementById('btnStudioPrevPage').addEventListener('click', () => {
    const i = studio.pages.findIndex(p => p.id === studio.selectedId);
    if (i <= 0) return;
    studio.selectedId = studio.pages[i - 1].id;
    renderStudioThumbs();
    updateStudioPreview();
  });
  document.getElementById('btnStudioNextPage').addEventListener('click', () => {
    const i = studio.pages.findIndex(p => p.id === studio.selectedId);
    if (i < 0 || i >= studio.pages.length - 1) return;
    studio.selectedId = studio.pages[i + 1].id;
    renderStudioThumbs();
    updateStudioPreview();
  });
  const studioSlider = document.getElementById('studioPageSlider');
  if (studioSlider) {
    studioSlider.addEventListener('input', () => {
      const idx = Number(studioSlider.value) - 1;
      if (idx >= 0 && idx < studio.pages.length) {
        studio.selectedId = studio.pages[idx].id;
        renderStudioThumbs();
        updateStudioPreview();
      }
    });
  }"""
assert OLD3 in text
text = text.replace(OLD3, NEW3)

# ---------------------------------------------------------------------
# 4) updateStudioPreview — also update page nav label
# ---------------------------------------------------------------------
OLD4 = """function updateStudioPreview() {
  const sel = studio.pages.find(p => p.id === studio.selectedId);
  const wrap = document.getElementById('studioPreviewWrap');
  const canvas = document.getElementById('studioPreviewCanvas');
  const empty = document.getElementById('studioPreviewEmpty');
  if (!wrap || !canvas || !empty) return;
  if (!sel) {
    empty.hidden = false;
    canvas.hidden = true;
    return;
  }
  empty.hidden = true;
  canvas.hidden = false;
  const ctx = canvas.getContext('2d');
  const maxW = Math.min(600, wrap.clientWidth - 24);
  const ratio = Math.min(maxW / sel.workingCanvas.width, 1);
  canvas.width = sel.workingCanvas.width * ratio;
  canvas.height = sel.workingCanvas.height * ratio;
  ctx.drawImage(sel.workingCanvas, 0, 0, canvas.width, canvas.height);
}"""

NEW4 = """function updateStudioPreview() {
  const sel = studio.pages.find(p => p.id === studio.selectedId);
  const wrap = document.getElementById('studioPreviewWrap');
  const canvas = document.getElementById('studioPreviewCanvas');
  const empty = document.getElementById('studioPreviewEmpty');
  if (!wrap || !canvas || !empty) return;
  if (!sel) {
    empty.hidden = false;
    canvas.hidden = true;
    updateStudioActions();
    return;
  }
  empty.hidden = true;
  canvas.hidden = false;
  const ctx = canvas.getContext('2d');
  const maxW = Math.min(600, wrap.clientWidth - 24);
  const ratio = Math.min(maxW / sel.workingCanvas.width, 1);
  canvas.width = sel.workingCanvas.width * ratio;
  canvas.height = sel.workingCanvas.height * ratio;
  ctx.drawImage(sel.workingCanvas, 0, 0, canvas.width, canvas.height);
  updateStudioActions();
}"""
assert OLD4 in text
text = text.replace(OLD4, NEW4)

# ---------------------------------------------------------------------
# 5) Update OCR progress injection — ocrStatus is now in the left card,
#    but textarea moved to right pane. We just inject progress after the
#    status badge; that still works because ocrStatus is referenced by id.
# ---------------------------------------------------------------------
# No change needed — code already uses getElementById('ocrStatus') which still exists.

# ---------------------------------------------------------------------
# 6) Tools — add currentPage + pageNav state, show/hide 2nd PDF on merge
# ---------------------------------------------------------------------
OLD6 = """  tools: {
    bytes: null,
    pdfDoc: null,
    pageCount: 0,
    secondaryBytesList: [],
    activeTab: 'merge',
    outputBytes: null,
    outputPdfDoc: null,
  },"""
NEW6 = """  tools: {
    bytes: null,
    pdfDoc: null,
    pageCount: 0,
    currentPage: 1,
    secondaryBytesList: [],
    activeTab: 'merge',
    outputBytes: null,
    outputPdfDoc: null,
  },"""
assert OLD6 in text
text = text.replace(OLD6, NEW6)

# ---------------------------------------------------------------------
# 7) Update ocrpdf panel HTML — drop textarea, copy/download (now in right pane)
# ---------------------------------------------------------------------
OLD7 = """  ocrpdf: `
    <p class="muted tiny" style="margin:0 0 var(--space-2)">Run OCR on an existing PDF. Renders each page and recognizes text using Tesseract.js.</p>
    <div class="paired-fields">
      <label class="field">
        <span class="field__label">Language</span>
        <select class="field__control" id="pdfOcrLang">
          <option value="eng">English</option>
          <option value="spa">Spanish</option>
          <option value="fra">French</option>
          <option value="deu">German</option>
          <option value="ita">Italian</option>
          <option value="por">Portuguese</option>
          <option value="chi_sim">Chinese</option>
          <option value="jpn">Japanese</option>
          <option value="kor">Korean</option>
          <option value="rus">Russian</option>
        </select>
      </label>
      <label class="field">
        <span class="field__label">Pages</span>
        <select class="field__control" id="pdfOcrPages">
          <option value="all">All pages</option>
          <option value="1">Page 1 only</option>
        </select>
      </label>
    </div>
    <div class="progress" id="pdfOcrProgress" style="display:none;margin-top:var(--space-3)">
      <div class="progress__bar" id="pdfOcrProgressBar"></div>
    </div>
    <textarea class="textarea" id="pdfOcrResult" placeholder="Recognized text will appear here…" style="margin-top:var(--space-3)" aria-label="OCR result" readonly></textarea>
    <div class="row" style="margin-top:var(--space-2)">
      <button class="btn btn--sm" id="btnCopyPdfOcr" type="button">Copy text</button>
      <button class="btn btn--sm" id="btnDownloadPdfOcr" type="button">Download .txt</button>
    </div>`,"""
NEW7 = """  ocrpdf: `
    <p class="muted tiny" style="margin:0 0 var(--space-2)">Run OCR on an existing PDF. Renders each page and recognizes text using Tesseract.js. The result appears in the second preview pane on the right.</p>
    <div class="paired-fields">
      <label class="field">
        <span class="field__label">Language</span>
        <select class="field__control" id="pdfOcrLang">
          <option value="eng">English</option>
          <option value="spa">Spanish</option>
          <option value="fra">French</option>
          <option value="deu">German</option>
          <option value="ita">Italian</option>
          <option value="por">Portuguese</option>
          <option value="chi_sim">Chinese</option>
          <option value="jpn">Japanese</option>
          <option value="kor">Korean</option>
          <option value="rus">Russian</option>
        </select>
      </label>
      <label class="field">
        <span class="field__label">Pages</span>
        <select class="field__control" id="pdfOcrPages">
          <option value="all">All pages</option>
          <option value="1">Page 1 only</option>
        </select>
      </label>
    </div>`,"""
assert OLD7 in text
text = text.replace(OLD7, NEW7)

# ---------------------------------------------------------------------
# 8) loadToolsDocument — show 2nd PDF button only when on merge tab,
#    and update page nav
# ---------------------------------------------------------------------
OLD8 = """  document.getElementById('toolsDocInfo').textContent = `${name || 'Document'} • ${tools.pageCount} page(s)`;
  document.getElementById('btnAddSecondPdf').disabled = false;
  document.getElementById('btnRunToolOp').disabled = false;
  document.getElementById('btnPreviewTool').disabled = false;
  // KEY FIX: enable export buttons as soon as a PDF is loaded — they fall
  // back to source bytes if no operation output yet. This way the user
  // can save/download/share/print the source PDF without first clicking Run.
  document.getElementById('btnToolsSave').disabled = false;
  document.getElementById('btnToolsDownload').disabled = false;
  document.getElementById('btnToolsShare').disabled = false;
  document.getElementById('btnToolsPrint').disabled = false;
  await renderToolsPreview(bytes, 'source');
  renderToolsPanel();
  return true;
}"""

NEW8 = """  document.getElementById('toolsDocInfo').textContent = `${name || 'Document'} • ${tools.pageCount} page(s)`;
  // The 2nd-PDF button only matters for merge/append operations; we keep it
  // hidden otherwise so the toolbar stays grouped by function.
  const isMerge = tools.activeTab === 'merge';
  const secondBtn = document.getElementById('btnAddSecondPdf');
  if (secondBtn) { secondBtn.hidden = !isMerge; secondBtn.disabled = false; }
  document.getElementById('btnRunToolOp').disabled = false;
  document.getElementById('btnPreviewTool').disabled = false;
  document.getElementById('btnToolsSave').disabled = false;
  document.getElementById('btnToolsDownload').disabled = false;
  document.getElementById('btnToolsShare').disabled = false;
  document.getElementById('btnToolsPrint').disabled = false;
  tools.currentPage = 1;
  await renderToolsPreview(bytes, 'source');
  updateToolsPageNav();
  renderToolsPanel();
  return true;
}

function updateToolsPageNav() {
  const label = document.getElementById('toolsPageNavLabel');
  const prev = document.getElementById('btnToolsPrevPage');
  const next = document.getElementById('btnToolsNextPage');
  const slider = document.getElementById('toolsPageSlider');
  if (!tools.bytes) {
    if (label) label.textContent = 'No document';
    if (prev) prev.disabled = true;
    if (next) next.disabled = true;
    if (slider) slider.style.display = 'none';
    return;
  }
  if (label) label.textContent = `Page ${tools.currentPage} of ${tools.pageCount}`;
  if (prev) prev.disabled = tools.currentPage <= 1;
  if (next) next.disabled = tools.currentPage >= tools.pageCount;
  if (slider) {
    if (tools.pageCount > 1) {
      slider.style.display = '';
      slider.min = 1;
      slider.max = tools.pageCount;
      slider.value = tools.currentPage;
    } else {
      slider.style.display = 'none';
    }
  }
}"""
assert OLD8 in text
text = text.replace(OLD8, NEW8)

# ---------------------------------------------------------------------
# 9) renderToolsPreview — keep the page in sync with currentPage
# ---------------------------------------------------------------------
# Original line: const dims = await renderPageToCanvas(pdf, 1, canvas, targetWidth);
# We change to render currentPage. But renderToolsPreview is called with various
# sources (source/output/etc.). The "currentPage" state should drive which page is shown.
# However: when the output is rendered after a Run operation, currentPage may be 1.
# Safest: keep rendering page 1 on fresh loads, but add a separate renderToolsPage() for nav.
# Actually let me modify renderToolsPreview to use currentPage.
OLD9 = """async function renderToolsPreview(bytes, label) {
  const wrap = document.getElementById('toolsCanvasWrap');
  const stage = document.getElementById('toolsCanvasStage');
  const canvas = document.getElementById('toolsCanvas');
  const drawCanvas = document.getElementById('toolsDrawCanvas');
  if (!bytes || !wrap || !stage || !canvas) return;
  const pdf = await loadPdfFromBytes(bytes);
  const count = await getPageCount(pdf);
  wrap.querySelectorAll('.empty-state').forEach(n => n.remove());
  stage.hidden = false;
  canvas.hidden = false;
  const targetWidth = Math.min(720, Math.max(200, wrap.clientWidth - 24));
  const dims = await renderPageToCanvas(pdf, 1, canvas, targetWidth);
  const docInfo = document.getElementById('toolsDocInfo');"""
NEW9 = """async function renderToolsPreview(bytes, label) {
  const wrap = document.getElementById('toolsCanvasWrap');
  const stage = document.getElementById('toolsCanvasStage');
  const canvas = document.getElementById('toolsCanvas');
  const drawCanvas = document.getElementById('toolsDrawCanvas');
  if (!bytes || !wrap || !stage || !canvas) return;
  const pdf = await loadPdfFromBytes(bytes);
  const count = await getPageCount(pdf);
  wrap.querySelectorAll('.empty-state').forEach(n => n.remove());
  stage.hidden = false;
  canvas.hidden = false;
  const targetWidth = Math.min(720, Math.max(200, wrap.clientWidth - 24));
  const pageToRender = Math.min(Math.max(1, tools.currentPage || 1), count);
  const dims = await renderPageToCanvas(pdf, pageToRender, canvas, targetWidth);
  const docInfo = document.getElementById('toolsDocInfo');"""
assert OLD9 in text
text = text.replace(OLD9, NEW9)

# ---------------------------------------------------------------------
# 10) initToolsWorkspace — wire page nav, dynamic Run label, OCR card show/hide
# ---------------------------------------------------------------------
# Find the tab click handler
OLD10 = """  // Tabs
  document.querySelectorAll('#toolsTabs .tools-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#toolsTabs .tools-tab').forEach(t => { t.classList.remove('is-active'); t.setAttribute('aria-selected','false'); });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected','true');
      tools.activeTab = tab.dataset.tab;
      renderToolsPanel();
    });
  });"""
NEW10 = """  // Tabs
  document.querySelectorAll('#toolsTabs .tools-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#toolsTabs .tools-tab').forEach(t => { t.classList.remove('is-active'); t.setAttribute('aria-selected','false'); });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected','true');
      tools.activeTab = tab.dataset.tab;
      // Show "Open 2nd PDF" only when the operation actually needs a second
      // document (Merge is the canonical case).
      const secondBtn = document.getElementById('btnAddSecondPdf');
      if (secondBtn) {
        secondBtn.hidden = tab.dataset.tab !== 'merge';
      }
      // Rename Run → Scan on the OCR tab so the action label matches the
      // workflow; restore to Run for every other tab.
      const runBtn = document.getElementById('btnRunToolOp');
      if (runBtn) runBtn.textContent = tab.dataset.tab === 'ocrpdf' ? 'Scan' : 'Run';
      const runHint = document.getElementById('toolsRunHint');
      if (runHint) runHint.textContent = tab.dataset.tab === 'ocrpdf'
        ? 'Scan will recognize text and show the result below the preview.'
        : 'Open a PDF to begin.';
      // The OCR result panel only exists for the OCR tab.
      const ocrCard = document.getElementById('toolsOcrResultCard');
      if (ocrCard) ocrCard.hidden = tab.dataset.tab !== 'ocrpdf';
      renderToolsPanel();
    });
  });

  // Tools page navigation (under preview)
  const btnToolsPrev = document.getElementById('btnToolsPrevPage');
  const btnToolsNext = document.getElementById('btnToolsNextPage');
  const toolsSlider = document.getElementById('toolsPageSlider');
  if (btnToolsPrev) {
    btnToolsPrev.addEventListener('click', async () => {
      if (!tools.bytes || tools.currentPage <= 1) return;
      tools.currentPage -= 1;
      await renderToolsPreview(tools.outputBytes || tools.bytes, tools.outputBytes ? 'output' : 'source');
      updateToolsPageNav();
    });
  }
  if (btnToolsNext) {
    btnToolsNext.addEventListener('click', async () => {
      if (!tools.bytes || tools.currentPage >= tools.pageCount) return;
      tools.currentPage += 1;
      await renderToolsPreview(tools.outputBytes || tools.bytes, tools.outputBytes ? 'output' : 'source');
      updateToolsPageNav();
    });
  }
  if (toolsSlider) {
    toolsSlider.addEventListener('input', async () => {
      const v = Number(toolsSlider.value);
      if (!tools.bytes || v < 1 || v > tools.pageCount) return;
      tools.currentPage = v;
      await renderToolsPreview(tools.outputBytes || tools.bytes, tools.outputBytes ? 'output' : 'source');
      updateToolsPageNav();
    });
  }

  // OCR result actions
  document.getElementById('btnCopyPdfOcr').addEventListener('click', () => {
    const ta = document.getElementById('pdfOcrResult');
    if (!ta || !ta.value) { toast('Nothing to copy.', 'warning'); return; }
    const text = ta.value;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard.', 'success'))
        .catch(() => copyTextFallback(text));
    } else { copyTextFallback(text); }
  });
  document.getElementById('btnDownloadPdfOcr').addEventListener('click', () => {
    const ta = document.getElementById('pdfOcrResult');
    if (!ta || !ta.value) { toast('Nothing to download.', 'warning'); return; }
    const blob = new Blob([ta.value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'pdf-ocr-text.txt'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  });
  const speakPdfBtn = document.getElementById('btnSpeakPdfOcr');
  if (speakPdfBtn) {
    speakPdfBtn.addEventListener('click', () => {
      const ta = document.getElementById('pdfOcrResult');
      if (!ta || !ta.value) { toast('Nothing to read.', 'warning'); return; }
      speakText(ta.value);
    });
  }"""
assert OLD10 in text
text = text.replace(OLD10, NEW10)

# ---------------------------------------------------------------------
# 11) ocrpdf Run handler — reset currentPage; reference hidden card correctly
# ---------------------------------------------------------------------
# Existing handler already references pdfOcrResult by ID — works because ID now in right pane.
# Also need to make sure the OCR result card is visible when Scan is clicked even if tab was switched away before.
OLD11 = """      } else if (tab === 'ocrpdf') {
        // OCR on PDF — render each page to canvas, run Tesseract
        const lang = document.getElementById('pdfOcrLang')?.value || 'eng';
        const pagesSel = document.getElementById('pdfOcrPages')?.value || 'all';
        const pdf = await loadPdfFromBytes(tools.bytes);
        const count = await getPageCount(pdf);
        const pages = pagesSel === '1' ? [1] : Array.from({length: count}, (_, i) => i + 1);
        const progBar = document.getElementById('pdfOcrProgressBar');
        const progWrap = document.getElementById('pdfOcrProgress');
        if (progWrap) progWrap.style.display = 'block';
        if (progBar) progBar.style.width = '0%';
        let allText = '';
        for (let i = 0; i < pages.length; i++) {
          const pageNum = pages[i];
          const canvas = document.createElement('canvas');
          await renderPageToCanvas(pdf, pageNum, canvas, 1500);
          const result = await recognizeText(canvas, {
            lang,
            onProgress: (m) => {
              if (progBar) progBar.style.width = ((i / pages.length) + (m.progress / pages.length)) * 100 + '%';
            },
          });
          if (result.ok) {
            allText += `--- Page ${pageNum} ---\\n${result.text || '(No text recognized.)'}\\n\\n`;
          }
          if (progBar) progBar.style.width = ((i + 1) / pages.length * 100) + '%';
        }
        if (progWrap) progWrap.style.display = 'none';
        const ta = document.getElementById('pdfOcrResult');
        if (ta) ta.value = allText || '(No text recognized.)';
        toast(`OCR complete on ${pages.length} page(s).`, 'success');
        return;
      }"""

NEW11 = """      } else if (tab === 'ocrpdf') {
        // OCR on PDF — render each page to canvas, run Tesseract
        const lang = document.getElementById('pdfOcrLang')?.value || 'eng';
        const pagesSel = document.getElementById('pdfOcrPages')?.value || 'all';
        const pdf = await loadPdfFromBytes(tools.bytes);
        const count = await getPageCount(pdf);
        const pages = pagesSel === '1' ? [1] : Array.from({length: count}, (_, i) => i + 1);
        // Ensure the OCR result panel is visible while we scan.
        const ocrCard = document.getElementById('toolsOcrResultCard');
        if (ocrCard) ocrCard.hidden = false;
        const progBar = document.getElementById('pdfOcrProgressBar');
        const progWrap = document.getElementById('pdfOcrProgress');
        if (progWrap) progWrap.style.display = 'block';
        if (progBar) progBar.style.width = '0%';
        const ta = document.getElementById('pdfOcrResult');
        if (ta) ta.value = '';
        let allText = '';
        for (let i = 0; i < pages.length; i++) {
          const pageNum = pages[i];
          const canvas = document.createElement('canvas');
          await renderPageToCanvas(pdf, pageNum, canvas, 1500);
          const result = await recognizeText(canvas, {
            lang,
            onProgress: (m) => {
              if (progBar) progBar.style.width = ((i / pages.length) + (m.progress / pages.length)) * 100 + '%';
            },
          });
          if (result.ok) {
            allText += `--- Page ${pageNum} ---\\n${result.text || '(No text recognized.)'}\\n\\n`;
          }
          if (progBar) progBar.style.width = ((i + 1) / pages.length * 100) + '%';
        }
        if (progWrap) progWrap.style.display = 'none';
        if (ta) ta.value = allText || '(No text recognized.)';
        toast(`OCR complete on ${pages.length} page(s).`, 'success');
        return;
      }"""
assert OLD11 in text
text = text.replace(OLD11, NEW11)

APP.write_text(text)
print("app.js updated. Bytes:", len(text), "delta:", len(text) - len(orig))
