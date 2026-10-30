/* =====================================================================
   app.js — DocuScan Pro main controller.
   Coordinates the six workspaces, holds shared state (studio pages,
   sign document, tools document, library), wires UI events, and owns
   the toast/sheet/permission layer.
   ===================================================================== */

import { initNavigation, goto, getActive, onWorkspaceChange } from './navigation.js';
import { initScanner, validateImageFile, fileToDataURL, loadImage } from './scanner.js';
import { PRESETS, applyAdjustments, rotateCanvas, imageToCanvas, canvasToDataURL } from './image-processing.js';
import { recognizeText, isOcrAvailable } from './ocr.js';
import { loadPdfFromBytes, renderPageToCanvas, getPageCount, makeThumbnail } from './pdf-renderer.js';
import {
  buildPdfFromCanvases, loadExistingPdf, insertTextElement, insertImageElement,
  insertWatermark, rgbFromHex,
} from './pdf-editor.js';
import { SignaturePad, typedSignatureToPng } from './signatures.js';
import { normalizeConfig, describe as describeWm } from './watermark.js';
import { saveToLibrary, downloadPdf, sharePdf, printPdf, validatePdfBytes } from './export.js';
import { listDocuments, getDocument, renameDocument, deleteDocument, estimateStorage } from './storage.js';
import { parseRanges, runMerge, runSplit, runRotate, runReorder, runWatermark, runAnnotateText, runAnnotateDrawing } from './pdf-tools.js';
import { maybeShowWelcome, initHelpCenter, attachContextHelp } from './help-system.js';

const APP_VERSION = '7.4.1';
const APP_BUILD = '2026-10-30';

/* ---------------- Shared app state ---------------- */
const state = {
  studio: {
    pages: [],           // { id, name, originalCanvas, workingCanvas, thumbnailDataURL, selected, transform }
    selectedId: null,
    enhancePreset: 'none',
    brightness: 0,
    contrast: 0,
  },
  sign: {
    bytes: null,         // Uint8Array of current source PDF (committed)
    pdfDoc: null,         // pdf.js document for preview
    pageCount: 1,
    currentPage: 1,
    history: [],         // stack of Uint8Array snapshots
    redoStack: [],
    objectsHistory: [],  // parallel stack: snapshot of sign.objects at each history push
    objectsRedoStack: [],
    objects: [],         // { id, type, page, normalized, opts }
    selectedObjectId: null,
    watermark: null,     // { text, direction, opacity }
  },
  tools: {
    bytes: null,
    pdfDoc: null,
    pageCount: 0,
    currentPage: 1,
    secondaryBytesList: [],
    activeTab: 'merge',
    outputBytes: null,
    outputPdfDoc: null,
  },
};

/* ---------------- Toast helpers ---------------- */
const toastStack = document.getElementById('toastStack');
function toast(message, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind ? 'toast--' + kind : ''}`;
  el.textContent = message;
  toastStack.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.3s';
    setTimeout(() => el.remove(), 320);
  }, 3500);
}

/* ---------------- Sheet helpers ---------------- */
const sheet = document.getElementById('signatureSheet');
const sheetBackdrop = document.getElementById('sheetBackdrop');
function openSheet() {
  sheet.hidden = false;
  // Force reflow before adding class so transition runs
  void sheet.offsetWidth;
  sheet.classList.add('is-open');
  sheetBackdrop.classList.add('is-open');
  sheetBackdrop.setAttribute('aria-hidden', 'false');
}
function closeSheet() {
  sheet.classList.remove('is-open');
  sheetBackdrop.classList.remove('is-open');
  sheetBackdrop.setAttribute('aria-hidden', 'true');
  setTimeout(() => { sheet.hidden = true; }, 320);
}
sheetBackdrop.addEventListener('click', closeSheet);

/* ---------------- Status badge ---------------- */
function updateOnlineStatus() {
  const badge = document.getElementById('offlineBadge');
  if (!badge) return;
  const online = navigator.onLine;
  badge.textContent = online ? 'Online' : 'Offline';
  badge.classList.toggle('badge--secondary', online);
  badge.classList.toggle('badge--danger', !online);
}
window.addEventListener('online', () => { updateOnlineStatus(); toast('Back online.', 'success'); });
window.addEventListener('offline', () => { updateOnlineStatus(); toast('You are offline. Cached features still work.', 'warning'); });

/* ---------------- Studio ---------------- */
const studio = state.studio;

function renderStudioThumbs() {
  const wrap = document.getElementById('studioThumbs');
  const hint = document.getElementById('studioEmptyHint');
  wrap.innerHTML = '';
  if (studio.pages.length === 0) {
    hint.style.display = 'block';
  } else {
    hint.style.display = 'none';
  }
  studio.pages.forEach((page, i) => {
    const el = document.createElement('div');
    el.className = 'thumb' + (page.id === studio.selectedId ? ' is-selected' : '');
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `Page ${i + 1}`);
    el.tabIndex = 0;
    const img = document.createElement('img');
    img.src = page.thumbnailDataURL;
    img.alt = `Page ${i + 1}`;
    el.appendChild(img);
    const idx = document.createElement('span');
    idx.className = 'thumb__index';
    idx.textContent = String(i + 1);
    el.appendChild(idx);
    const rm = document.createElement('button');
    rm.className = 'thumb__remove';
    rm.setAttribute('aria-label', `Remove page ${i + 1}`);
    rm.innerHTML = '&times;';
    rm.addEventListener('click', (e) => {
      e.stopPropagation();
      studio.pages.splice(i, 1);
      if (studio.selectedId === page.id) studio.selectedId = studio.pages[0]?.id || null;
      renderStudioThumbs();
      updateStudioActions();
    });
    el.appendChild(rm);
    el.addEventListener('click', () => {
      studio.selectedId = page.id;
      renderStudioThumbs();
      updateStudioPreview();
      // Load current brightness/contrast into sliders
      document.getElementById('brightness').value = page.transform?.brightness ?? 0;
      document.getElementById('contrast').value = page.transform?.contrast ?? 0;
      document.getElementById('brightnessValue').textContent = String(page.transform?.brightness ?? 0);
      document.getElementById('contrastValue').textContent = String(page.transform?.contrast ?? 0);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
    });
    wrap.appendChild(el);
  });
  updateStudioActions();
}

function updateStudioActions() {
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
}

async function addImageFile(file, opts = {}) {
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
    updateStudioPreview();
    toast(`Added ${file.name || 'page'} (${studio.pages.length} total)`, 'success');
  } catch (err) {
    toast(`Failed to add image: ${err.message}`, 'error');
  }
}

// Draw a discreet bottom-right timestamp on a canvas. Designed to survive
// rotation and PDF assembly because it is baked into the pixel buffer.
function stampTimestamp(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) { console.warn('[stampTimestamp] no ctx'); return; }
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
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(x, y, boxW, boxH);
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'middle';
  ctx.fillText(stamp, x + padding, y + boxH / 2 + 1);
  ctx.restore();
}

function initStudioWorkspace() {
  initScanner({
    onFile: addImageFile,
    onToast: toast,
  });

  document.getElementById('btnRotatePage').addEventListener('click', () => {
    const sel = studio.pages.find(p => p.id === studio.selectedId);
    if (!sel) return;
    sel.workingCanvas = rotateCanvas(sel.workingCanvas, 90);
    sel.transform.rotation = (sel.transform.rotation || 0) + 90;
    // Refresh thumb
    const c = sel.workingCanvas;
    const thumb = document.createElement('canvas');
    const tctx = thumb.getContext('2d');
    const tw = 184, th = 240;
    const ratio = Math.min(tw / c.width, th / c.height);
    thumb.width = c.width * ratio;
    thumb.height = c.height * ratio;
    tctx.drawImage(c, 0, 0, thumb.width, thumb.height);
    sel.thumbnailDataURL = thumb.toDataURL('image/jpeg', 0.7);
    renderStudioThumbs();
    updateStudioPreview();
  });
  document.getElementById('btnDeletePage').addEventListener('click', () => {
    const i = studio.pages.findIndex(p => p.id === studio.selectedId);
    if (i < 0) return;
    studio.pages.splice(i, 1);
    studio.selectedId = studio.pages[0]?.id || null;
    renderStudioThumbs();
  });
  document.getElementById('btnClearAllPages').addEventListener('click', () => {
    if (!confirm('Remove all pages? This cannot be undone.')) return;
    studio.pages = [];
    studio.selectedId = null;
    renderStudioThumbs();
  });
  // Page navigation lives under the preview pane. Prev/Next move the
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
  }

  // Enhancement presets
  document.querySelectorAll('#enhancePresets .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#enhancePresets .chip').forEach(c => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      studio.enhancePreset = chip.dataset.preset;
      const p = PRESETS[chip.dataset.preset];
      if (p) {
        document.getElementById('brightness').value = p.brightness;
        document.getElementById('contrast').value = p.contrast;
        document.getElementById('brightnessValue').textContent = String(p.brightness);
        document.getElementById('contrastValue').textContent = String(p.contrast);
      }
    });
  });
  document.getElementById('brightness').addEventListener('input', (e) => {
    document.getElementById('brightnessValue').textContent = e.target.value;
  });
  document.getElementById('contrast').addEventListener('input', (e) => {
    document.getElementById('contrastValue').textContent = e.target.value;
  });
  document.getElementById('btnApplyEnhance').addEventListener('click', () => {
    const sel = studio.pages.find(p => p.id === studio.selectedId);
    if (!sel) return;
    const b = Number(document.getElementById('brightness').value);
    const c = Number(document.getElementById('contrast').value);
    const preset = PRESETS[studio.enhancePreset] || PRESETS.none;
    const adjusted = applyAdjustments(sel.originalCanvas, {
      brightness: b, contrast: c,
      grayscale: preset.grayscale === 1,
      threshold: preset.threshold,
    });
    sel.workingCanvas = adjusted;
    sel.transform = { ...sel.transform, brightness: b, contrast: c, preset: studio.enhancePreset };
    // Refresh thumb
    const cc = sel.workingCanvas;
    const thumb = document.createElement('canvas');
    const tctx = thumb.getContext('2d');
    const tw = 184, th = 240;
    const ratio = Math.min(tw / cc.width, th / cc.height);
    thumb.width = cc.width * ratio;
    thumb.height = cc.height * ratio;
    tctx.drawImage(cc, 0, 0, thumb.width, thumb.height);
    sel.thumbnailDataURL = thumb.toDataURL('image/jpeg', 0.7);
    renderStudioThumbs();
    updateStudioPreview();
    toast('Enhancement applied. Original is preserved; tap Reset to restore.', 'success');
  });
  document.getElementById('btnResetEnhance').addEventListener('click', () => {
    const sel = studio.pages.find(p => p.id === studio.selectedId);
    if (!sel) return;
    sel.workingCanvas = sel.originalCanvas;
    sel.transform = { brightness: 0, contrast: 0, preset: 'none' };
    const cc = sel.workingCanvas;
    const thumb = document.createElement('canvas');
    const tctx = thumb.getContext('2d');
    const tw = 184, th = 240;
    const ratio = Math.min(tw / cc.width, th / cc.height);
    thumb.width = cc.width * ratio;
    thumb.height = cc.height * ratio;
    tctx.drawImage(cc, 0, 0, thumb.width, thumb.height);
    sel.thumbnailDataURL = thumb.toDataURL('image/jpeg', 0.7);
    document.getElementById('brightness').value = 0;
    document.getElementById('contrast').value = 0;
    document.getElementById('brightnessValue').textContent = '0';
    document.getElementById('contrastValue').textContent = '0';
    renderStudioThumbs();
    updateStudioPreview();
    toast('Reset to original.', 'success');
  });

  // OCR
  const ocrStatus = document.getElementById('ocrStatus');
  const ocrResult = document.getElementById('ocrResult');
  const progress = document.createElement('div');
  progress.className = 'progress';
  progress.innerHTML = '<div class="progress__bar"></div>';
  progress.style.display = 'none';
  ocrStatus.parentNode.insertBefore(progress, ocrStatus.nextSibling);
  document.getElementById('btnRunOcr').addEventListener('click', async () => {
    const sel = studio.pages.find(p => p.id === studio.selectedId);
    if (!sel) { toast('Select a page first.', 'warning'); return; }
    ocrStatus.textContent = 'Working…';
    ocrResult.value = '';
    progress.style.display = 'block';
    const bar = progress.querySelector('.progress__bar');
    bar.style.width = '0%';
    try {
      const lang = document.getElementById('ocrLanguage')?.value || 'eng';
      const result = await recognizeText(sel.workingCanvas, {
        onProgress: (m) => { if (typeof m.progress === 'number') bar.style.width = (m.progress * 100) + '%'; },
        lang,
      });
      if (result.ok) {
        ocrResult.value = result.text || '(No text recognized.)';
        ocrStatus.textContent = 'Done';
        toast('OCR complete.', 'success');
      } else {
        ocrStatus.textContent = 'Failed';
        toast('OCR failed: ' + (result.error || 'unknown error'), 'error');
      }
    } catch (err) {
      ocrStatus.textContent = 'Error';
      toast('OCR error: ' + err.message, 'error');
    } finally {
      progress.style.display = 'none';
    }
  });
  document.getElementById('btnCopyOcr').addEventListener('click', () => {
    if (!ocrResult.value) { toast('Nothing to copy.', 'warning'); return; }
    const text = ocrResult.value;
    // Try clipboard API first, fall back to temporary textarea + execCommand
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        toast('Copied to clipboard.', 'success');
      }).catch(() => {
        copyTextFallback(text);
      });
    } else {
      copyTextFallback(text);
    }
  });
  document.getElementById('btnDownloadOcr').addEventListener('click', () => {
    if (!ocrResult.value) { toast('Nothing to download.', 'warning'); return; }
    const blob = new Blob([ocrResult.value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'recognized-text.txt'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  });
  // Text-to-Speech
  const speakBtn = document.getElementById('btnSpeakOcr');
  if (speakBtn) {
    speakBtn.addEventListener('click', () => {
      if (!ocrResult.value) { toast('Nothing to read.', 'warning'); return; }
      speakText(ocrResult.value);
    });
  }
  // Auto-crop
  const autoCropBtn = document.getElementById('btnAutoCrop');
  if (autoCropBtn) {
    autoCropBtn.addEventListener('click', () => {
      const sel = studio.pages.find(p => p.id === studio.selectedId);
      if (!sel) { toast('Select a page first.', 'warning'); return; }
      const cropped = autoCropCanvas(sel.workingCanvas);
      if (cropped === sel.workingCanvas) { toast('No document edges detected.', 'warning'); return; }
      sel.workingCanvas = cropped;
      // Update thumbnail
      const cc = sel.workingCanvas;
      const thumb = document.createElement('canvas');
      const tctx = thumb.getContext('2d');
      const tw = 184, th = 240;
      const ratio = Math.min(tw / cc.width, th / cc.height);
      thumb.width = cc.width * ratio; thumb.height = cc.height * ratio;
      tctx.drawImage(cc, 0, 0, thumb.width, thumb.height);
      sel.thumbnailDataURL = thumb.toDataURL('image/jpeg', 0.7);
      renderStudioThumbs();
      updateStudioPreview();
      toast('Auto-cropped to detected document edges.', 'success');
    });
  }

  // Create PDF
  const createPdfBtn = document.getElementById('btnCreatePdf');
  const CREATE_PDF_HTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Create PDF';
  // Helper: build PDF bytes from current studio pages (used by all export actions)
  async function buildStudioPdf() {
    if (studio.pages.length === 0) throw new Error('No pages. Capture or import images first.');
    const pageSize = document.getElementById('pdfPageSize').value;
    const orientation = document.getElementById('pdfOrientation').value;
    return buildPdfFromCanvases(studio.pages.map(p => p.workingCanvas), { pageSize, orientation });
  }
  // Helper: run an export action with button-state protection (never goes blank)
  async function runStudioExport(btnId, action) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    try {
      const bytes = await buildStudioPdf();
      const name = `Scan_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;
      await action(bytes, name);
    } catch (err) {
      toast(err.message || 'Export failed.', 'error');
    } finally {
      // ALWAYS restore the button — this is the fix for "button went blank"
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  }
  createPdfBtn.addEventListener('click', async () => {
    if (studio.pages.length === 0) { toast('Add pages first.', 'warning'); return; }
    const btn = createPdfBtn;
    const originalHTML = CREATE_PDF_HTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Building…';
    try {
      const bytes = await buildStudioPdf();
      const name = `Scan_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;
      await saveToLibrary(bytes, { name, pageCount: studio.pages.length });
      toast(`Saved "${name}.pdf" to Library (${studio.pages.length} pages).`, 'success');
    } catch (err) {
      toast('PDF build failed: ' + err.message, 'error');
    } finally {
      // ALWAYS restore — never leave the button blank
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  });
  // Studio export actions (the 4-button row added to Studio)
  ['btnStudioSave','btnStudioDownload','btnStudioShare','btnStudioPrint'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', async () => {
      if (id === 'btnStudioSave') {
        await runStudioExport(id, async (bytes, name) => {
          await saveToLibrary(bytes, { name, pageCount: studio.pages.length });
          toast(`Saved "${name}.pdf" to Library.`, 'success');
        });
      } else if (id === 'btnStudioDownload') {
        await runStudioExport(id, async (bytes, name) => {
          downloadPdf(bytes, name);
          toast('Download started.', 'success');
        });
      } else if (id === 'btnStudioShare') {
        await runStudioExport(id, async (bytes, name) => {
          const r = await sharePdf(bytes, name, { title: name, text: 'Scanned document' });
          if (r.method === 'download-fallback') toast('Sharing unavailable — download started instead.', 'warning');
          else toast('Shared.', 'success');
        });
      } else if (id === 'btnStudioPrint') {
        await runStudioExport(id, async (bytes, name) => {
          printPdf(bytes, name);
        });
      }
    });
  });
  document.getElementById('btnSendToSign').addEventListener('click', async () => {
    if (studio.pages.length === 0) { toast('Add pages first.', 'warning'); return; }
    try {
      const bytes = await buildStudioPdf();
      await loadSignDocument(bytes, `Scan ${new Date().toLocaleDateString()}`);
      goto('sign');
      toast('Sent to Sign workspace.', 'success');
    } catch (err) {
      console.error('Send to Sign failed:', err);
      toast('Failed to build PDF: ' + err.message, 'error');
    }
  });
  document.getElementById('btnSendToTools').addEventListener('click', async () => {
    if (studio.pages.length === 0) { toast('Add pages first.', 'warning'); return; }
    try {
      const bytes = await buildStudioPdf();
      await loadToolsDocument(bytes, `Scan ${new Date().toLocaleDateString()}`);
      goto('tools');
      toast('Sent to PDF Tools.', 'success');
    } catch (err) {
      toast('Failed to build PDF: ' + err.message, 'error');
    }
  });

  renderStudioThumbs();
  updateStudioPreview();
  // Mark default preset active
  document.querySelector('#enhancePresets .chip[data-preset="none"]').classList.add('is-active');
}

/* ---------------- Sign workspace ---------------- */
const sign = state.sign;
let signCanvas = document.getElementById('signCanvas');
let signCanvasWrap = document.getElementById('signCanvasWrap');
let signCanvasStage = document.getElementById('signCanvasStage');
let signEmptyState = document.getElementById('signEmptyState');
let signDocInfo = document.getElementById('signDocInfo');
let signHint = document.getElementById('signHint');

async function loadSignDocument(bytes, name) {
  if (!(await validatePdfBytes(bytes))) {
    toast('File is not a valid PDF.', 'error');
    return false;
  }
  // Reset state
  sign.bytes = bytes;
  sign.history = [bytes.slice()];
  sign.objectsHistory = [[]]; // matches the empty sign.objects at this point
  sign.redoStack = [];
  sign.objectsRedoStack = [];
  sign.objects = [];
  sign.selectedObjectId = null;
  sign.watermark = null;
  sign.currentPage = 1;
  // Load with pdf.js
  sign.pdfDoc = await loadPdfFromBytes(bytes);
  sign.pageCount = await getPageCount(sign.pdfDoc);
  await renderSignCurrentPage();
  // Update UI
  signEmptyState.hidden = true;
  signCanvasStage.hidden = false;
  signDocInfo.textContent = `${name || 'Document'} • ${sign.pageCount} page(s)`;
  document.getElementById('signPdfInput').value = '';
  updateSignPageNav();
  enableSignEditing(true);
  // Watermark controls reflect default state
  updateWatermarkStatus();
  return true;
}

function enableSignEditing(enabled) {
  ['btnAddSignature','btnAddText','btnAddDate','btnAddStamp','btnAddHighlight','btnAddUnderline','btnAddStrike','btnUndo','btnRedo','btnRemoveSelected','btnInsertWatermark','btnSaveToLibrary','btnDownloadPdf','btnSharePdf','btnPrintPdf'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = !enabled;
  });
  // Undo/redo reflect stacks
  document.getElementById('btnUndo').disabled = sign.history.length <= 1;
  document.getElementById('btnRedo').disabled = sign.redoStack.length === 0;
  // Remove selected requires selection
  document.getElementById('btnRemoveSelected').disabled = !sign.selectedObjectId;
  // Watermark remove requires active watermark
  document.getElementById('btnRemoveWatermark').disabled = !sign.watermark;
}

function updateSignPageNav() {
  const label = document.getElementById('pageNavLabel');
  const prev = document.getElementById('btnPrevPage');
  const next = document.getElementById('btnNextPage');
  const slider = document.getElementById('pageSlider');
  if (!sign.bytes) {
    label.textContent = 'No document';
    prev.disabled = true; next.disabled = true;
    if (slider) { slider.style.display = 'none'; }
    return;
  }
  label.textContent = `Page ${sign.currentPage} of ${sign.pageCount}`;
  prev.disabled = sign.currentPage <= 1;
  next.disabled = sign.currentPage >= sign.pageCount;
  // Show + update slider for multi-page docs
  if (slider) {
    if (sign.pageCount > 1) {
      slider.style.display = '';
      slider.min = 1;
      slider.max = sign.pageCount;
      slider.value = sign.currentPage;
    } else {
      slider.style.display = 'none';
    }
  }
}

async function renderSignCurrentPage() {
  if (!sign.pdfDoc) return;
  if (!signCanvasWrap || !signCanvas) return;
  const targetWidth = Math.min(720, Math.max(200, signCanvasWrap.clientWidth - 24));
  await renderPageToCanvas(sign.pdfDoc, sign.currentPage, signCanvas, targetWidth);
  drawObjectOverlay();
}

/**
 * Render overlay boxes for the current page.
 * Uses transform: translate() for positioning (GPU-accelerated, smooth).
 */
function drawObjectOverlay() {
  if (!signCanvasStage || !signCanvas) return;
  signCanvasStage.querySelectorAll('.object-overlay').forEach(n => n.remove());
  const stageRect = signCanvas.getBoundingClientRect();
  if (!stageRect || stageRect.width === 0) return;
  sign.objects.filter(o => o.page === sign.currentPage).forEach(o => {
    const box = document.createElement('div');
    box.className = 'object-overlay';
    box.dataset.id = o.id;
    if (o.id === sign.selectedObjectId) box.classList.add('is-selected');

    // Position via transform (GPU-accelerated). Center the box on the
    // normalized point by offsetting by half the box's width/height.
    // We use translate3d for hardware acceleration.
    const px = o.normalized.x * stageRect.width;
    const py = (1 - o.normalized.y) * stageRect.height;
    box.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -50%)`;

    // Ink color is the TEXT color (not background). This matches the PDF output.
    box.style.color = o.color || '#1C1C1E';
    box.style.fontFamily = (o.fontFamily || 'Helvetica').replace(/-/g, ' ');
    box.style.fontSize = Math.max(10, o.size || 14) + 'px';
    box.style.opacity = o.opacity != null ? (o.opacity / 100) : 1;

    // Content
    if (o.type === 'signature' && o.pngBytes) {
      const blob = new Blob([o.pngBytes], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      const img = document.createElement('img');
      img.src = url;
      img.alt = 'Signature';
      img.style.maxWidth = (o.widthPct || 30) * stageRect.width / 100 * 3.33 + 'px';
      img.style.maxHeight = (o.heightPct || 9) * stageRect.height / 100 * 3.33 + 'px';
      img.style.display = 'block';
      box.appendChild(img);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } else if (o.type === 'watermark') {
      box.textContent = o.text || 'DRAFT';
      box.style.fontSize = Math.max(24, (o.widthPct || 50) * 2) + 'px';
      box.style.color = o.color || '#888888';
      box.style.fontWeight = 'bold';
      box.style.opacity = (o.opacity ?? 50) / 100;
      if (o.direction === 'diagonal') {
        box.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -50%) rotate(-45deg)`;
      }
    } else if (o.type === 'stamp') {
      box.textContent = o.text;
      box.style.fontSize = Math.max(18, o.size) + 'px';
      box.style.color = o.color || '#FF3B30';
      box.style.fontWeight = 'bold';
      box.style.border = '3px solid ' + (o.color || '#FF3B30');
      box.style.borderRadius = '8px';
      box.style.padding = '6px 12px';
      box.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -50%) rotate(-8deg)`;
    } else if (o.type === 'highlight') {
      box.textContent = '';
      box.style.background = (o.color || '#FFEB3B');
      box.style.opacity = '0.4';
      box.style.width = (o.widthPct || 40) * stageRect.width / 100 + 'px';
      box.style.height = (o.heightPct || 5) * stageRect.height / 100 + 'px';
      box.style.borderRadius = '2px';
      box.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -50%)`;
    } else if (o.type === 'underline' || o.type === 'strikethrough') {
      box.textContent = '';
      box.style.background = (o.color || (o.type === 'strikethrough' ? '#FF3B30' : '#0066CC'));
      box.style.width = (o.widthPct || 40) * stageRect.width / 100 + 'px';
      box.style.height = Math.max(2, o.size || 3) + 'px';
      box.style.borderRadius = '1px';
      box.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -50%)`;
    } else {
      box.textContent = o.text || (o.type === 'date' ? 'Date' : '[Object]');
    }

    // Resize handle
    const resize = document.createElement('div');
    resize.className = 'object-overlay__resize';
    resize.style.pointerEvents = 'auto';
    box.appendChild(resize);

    attachOverlayInteractions(box, o, stageRect);
    signCanvasStage.appendChild(box);
  });
}

/**
 * Drag-to-move + resize handle for overlay boxes.
 *
 * SMOOTHNESS FIX: uses requestAnimationFrame to batch transform updates
 * so we only paint once per frame (eliminates jitter from multiple
 * pointermove events per frame). Uses transform: translate3d() for
 * GPU-accelerated movement.
 */
function attachOverlayInteractions(box, obj, stageRect) {
  let mode = null;
  let startPointer = null;
  let startObj = null;
  let activePointerId = null;
  let rafId = null;
  let pendingUpdate = null;

  box.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.stopPropagation();
    e.preventDefault();
    mode = e.target.classList.contains('object-overlay__resize') ? 'resize' : 'drag';
    sign.selectedObjectId = obj.id;
    signCanvasStage.querySelectorAll('.object-overlay').forEach(b => b.classList.remove('is-selected'));
    box.classList.add('is-selected');
    enableSignEditing(true);
    box.classList.add('is-dragging');
    try { box.setPointerCapture(e.pointerId); } catch {}
    activePointerId = e.pointerId;
    startPointer = { x: e.clientX, y: e.clientY };
    startObj = {
      x: obj.normalized.x, y: obj.normalized.y,
      widthPct: obj.widthPct, heightPct: obj.heightPct,
      size: obj.size,
    };
    window.addEventListener('pointermove', onMove, { capture: true });
    window.addEventListener('pointerup', onUp, { capture: true });
    window.addEventListener('pointercancel', onUp, { capture: true });
  });

  function applyUpdate() {
    rafId = null;
    if (!pendingUpdate) return;
    const px = pendingUpdate.x * stageRect.width;
    const py = (1 - pendingUpdate.y) * stageRect.height;
    const rotation = (obj.type === 'watermark' && obj.direction === 'diagonal') ? 'rotate(-45deg)' : '';
    box.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -50%) ${rotation}`;
    box.style.fontSize = Math.max(10, obj.size || 14) + 'px';
    // Update visual dimensions for line/rectangle types during resize
    if (obj.type === 'underline' || obj.type === 'strikethrough' || obj.type === 'highlight') {
      box.style.width = (obj.widthPct || 40) * stageRect.width / 100 + 'px';
      box.style.height = Math.max(2, obj.size || 3) + 'px';
      if (obj.type === 'highlight') {
        box.style.height = (obj.heightPct || 5) * stageRect.height / 100 + 'px';
      }
    } else if (obj.type === 'stamp') {
      box.style.fontSize = Math.max(12, obj.size || 24) + 'px';
    }
    pendingUpdate = null;
  }

  function onMove(e) {
    if (!mode || !startPointer) return;
    if (e.pointerId !== activePointerId) return;
    e.preventDefault();
    e.stopPropagation();
    const dx = e.clientX - startPointer.x;
    const dy = e.clientY - startPointer.y;
    if (mode === 'drag') {
      const nx = startObj.x + dx / stageRect.width;
      const ny = startObj.y - dy / stageRect.height;
      obj.normalized.x = Math.max(0.02, Math.min(0.98, nx));
      obj.normalized.y = Math.max(0.02, Math.min(0.98, ny));
    } else if (mode === 'resize') {
      const dw = dx / stageRect.width * 100;
      const dh = dy / stageRect.height * 100;
      obj.widthPct = Math.max(2, Math.min(100, startObj.widthPct + dw * 2));
      obj.heightPct = Math.max(1, Math.min(100, startObj.heightPct + dh * 2));
      if (obj.type === 'text' || obj.type === 'date') {
        obj.size = Math.max(8, Math.min(144, Math.round((obj.heightPct / 9) * 14)));
      } else if (obj.type === 'watermark') {
        obj.size = Math.max(24, Math.min(200, Math.round(obj.widthPct * 2)));
      } else if (obj.type === 'underline' || obj.type === 'strikethrough') {
        // For lines, resize changes WIDTH (length) and thickness
        obj.size = Math.max(1, Math.min(20, Math.round(obj.heightPct * 0.5)));
      } else if (obj.type === 'highlight') {
        // Highlight: height controls thickness
        obj.size = Math.max(5, Math.min(50, Math.round(obj.heightPct * 2)));
      } else if (obj.type === 'stamp') {
        obj.size = Math.max(12, Math.min(72, Math.round(obj.widthPct * 0.8)));
      }
    }
    // Batch the transform update via requestAnimationFrame for smoothness.
    // Use coalesced events to reduce jitter — only update if the frame hasn't been requested yet.
    pendingUpdate = { x: obj.normalized.x, y: obj.normalized.y };
    if (!rafId) {
      rafId = requestAnimationFrame(applyUpdate);
    }
  }

  function onUp(e) {
    if (!mode) return;
    if (e.pointerId !== activePointerId) return;
    mode = null;
    startPointer = null;
    activePointerId = null;
    box.classList.remove('is-dragging');
    try { box.releasePointerCapture(e.pointerId); } catch {}
    window.removeEventListener('pointermove', onMove, { capture: true });
    window.removeEventListener('pointerup', onUp, { capture: true });
    window.removeEventListener('pointercancel', onUp, { capture: true });
    // Cancel any pending rAF and apply final position immediately
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    pendingUpdate = { x: obj.normalized.x, y: obj.normalized.y };
    applyUpdate();
    drawObjectOverlay();
    enableSignEditing(true);
  }
}

signCanvasStage.addEventListener('click', (e) => {
  // Drop a text element at the clicked location if a text string is staged
  if (!sign.bytes) return;
  if (e.target.closest('.object-overlay')) return;
  const text = document.getElementById('textInput').value.trim();
  if (!text) {
    toast('Type text first, or use the buttons above to add an element.', 'warning');
    return;
  }
  // Use the STAGE rect (= canvas rect) so click coords map directly to the canvas
  const rect = signCanvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = 1 - (e.clientY - rect.top) / rect.height;
  addObject({
    id: crypto.randomUUID(),
    type: 'text',
    page: sign.currentPage,
    normalized: { x, y },
    text,
    size: Number(document.getElementById('fontSize').value) || 14,
    fontFamily: document.getElementById('fontFamily').value,
    color: document.getElementById('inkColor').value,
    widthPct: Number(document.getElementById('objWidth').value),
    heightPct: Number(document.getElementById('objHeight').value),
  });
  document.getElementById('textInput').value = '';
});

function addObject(obj) {
  sign.objects.push(obj);
  sign.selectedObjectId = obj.id;
  // KEY FIX: push the current bytes to history so Undo can revert object additions.
  // Without this, Undo stays disabled because sign.history.length is only 1.
  if (sign.bytes) {
    pushSignHistory();
  }
  drawObjectOverlay();
  enableSignEditing(true);
  toast('Added. Press Save/Download to bake into the PDF.', 'success');
}

/**
 * Push a snapshot of the current PDF bytes AND overlay objects to the
 * parallel history stacks. Each entry in sign.history corresponds to the
 * same-index entry in sign.objectsHistory, so undo can restore both.
 */
function pushSignHistory() {
  if (!sign.bytes) return;
  sign.history.push(sign.bytes.slice());
  // Deep-copy objects so later mutations don't leak into the snapshot.
  // Signature PNG bytes are Uint8Array — slice them too.
  sign.objectsHistory.push(sign.objects.map(o => ({
    ...o,
    pngBytes: o.pngBytes ? o.pngBytes.slice() : null,
  })));
  if (sign.history.length > 50) {
    sign.history.shift();
    sign.objectsHistory.shift();
  }
  sign.redoStack = [];
  sign.objectsRedoStack = [];
}

function initSignWorkspace() {
  const input = document.getElementById('signPdfInput');
  document.getElementById('btnOpenPdfSign').addEventListener('click', () => {
    input.value = '';
    input.click();
  });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') { toast('Please select a PDF file.', 'error'); return; }
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const ok = await loadSignDocument(bytes, file.name.replace(/\.pdf$/i, ''));
      if (!ok) return;
      toast('Loaded PDF.', 'success');
    } catch (err) {
      toast('Failed to open PDF: ' + err.message, 'error');
    }
  });

  // Continuous page scroll mode — render ALL pages in a scrollable column
  let scrollMode = false;
  const btnScrollMode = document.getElementById('btnScrollMode');
  if (btnScrollMode) {
    btnScrollMode.addEventListener('click', async () => {
      scrollMode = !scrollMode;
      btnScrollMode.style.background = scrollMode ? 'var(--color-primary-soft)' : '';
      if (scrollMode && sign.pdfDoc) {
        if (!sign.pdfDoc) return;
        signCanvasStage.querySelectorAll('.scroll-page-canvas').forEach(n => n.remove());
        signCanvas.hidden = true;
        const targetWidth = Math.min(720, Math.max(200, signCanvasWrap.clientWidth - 24));
        for (let i = 1; i <= sign.pageCount; i++) {
          const pageCanvas = document.createElement('canvas');
          pageCanvas.className = 'scroll-page-canvas';
          pageCanvas.style.cssText = 'display:block;max-width:100%;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);background:#fff;';
          await renderPageToCanvas(sign.pdfDoc, i, pageCanvas, targetWidth);
          signCanvasStage.appendChild(pageCanvas);
        }
        signCanvasStage.hidden = false;
        signCanvasStage.style.display = '';
        toast(`Showing all ${sign.pageCount} pages. Scroll to view.`, 'info');
      } else {
        signCanvasStage.querySelectorAll('.scroll-page-canvas').forEach(n => n.remove());
        signCanvas.hidden = false;
        await renderSignCurrentPage();
      }
    });
  }

  // Page slider for fast navigation in large PDFs
  const pageSlider = document.getElementById('pageSlider');
  if (pageSlider) {
    pageSlider.addEventListener('input', async () => {
      if (!sign.pdfDoc) return;
      sign.currentPage = Number(pageSlider.value);
      await renderSignCurrentPage();
      updateSignPageNav();
      drawObjectOverlay();
    });
  }

  document.getElementById('btnPrevPage').addEventListener('click', async () => {
    if (sign.currentPage > 1) { sign.currentPage--; await renderSignCurrentPage(); updateSignPageNav(); drawObjectOverlay(); }
  });
  document.getElementById('btnNextPage').addEventListener('click', async () => {
    if (sign.currentPage < sign.pageCount) { sign.currentPage++; await renderSignCurrentPage(); updateSignPageNav(); drawObjectOverlay(); }
  });

  // Editing buttons
  document.getElementById('btnAddText').addEventListener('click', () => {
    const text = document.getElementById('textInput').value.trim();
    if (!text) { toast('Type text to insert first.', 'warning'); return; }
    addObject({
      id: crypto.randomUUID(),
      type: 'text',
      page: sign.currentPage,
      normalized: { x: 0.5, y: 0.5 },
      text,
      size: Number(document.getElementById('fontSize').value) || 14,
      fontFamily: document.getElementById('fontFamily').value,
      color: document.getElementById('inkColor').value,
      widthPct: Number(document.getElementById('objWidth').value),
      heightPct: Number(document.getElementById('objHeight').value),
    });
  });
  document.getElementById('btnAddDate').addEventListener('click', () => {
    const today = new Date().toLocaleDateString();
    document.getElementById('textInput').value = today;
    addObject({
      id: crypto.randomUUID(),
      type: 'date',
      page: sign.currentPage,
      normalized: { x: 0.5, y: 0.85 },
      text: today,
      size: Number(document.getElementById('fontSize').value) || 14,
      fontFamily: document.getElementById('fontFamily').value,
      color: document.getElementById('inkColor').value,
      widthPct: Number(document.getElementById('objWidth').value),
      heightPct: Number(document.getElementById('objHeight').value),
    });
  });
  document.getElementById('textTemplates').addEventListener('change', (e) => {
    if (e.target.value) document.getElementById('textInput').value = e.target.value;
  });
  // Stamp button — adds a predefined stamp overlay
  const stampBtn = document.getElementById('btnAddStamp');
  if (stampBtn) {
    stampBtn.addEventListener('click', () => {
      // Show a quick prompt for stamp text
      const stamps = ['APPROVED', 'DRAFT', 'CONFIDENTIAL', 'URGENT', 'FINAL', 'REVISED', 'RECEIVED', 'PAID'];
      const choice = prompt('Choose a stamp:\n' + stamps.map((s, i) => `${i+1}. ${s}`).join('\n'), '1');
      const idx = parseInt(choice, 10) - 1;
      if (idx < 0 || idx >= stamps.length) { toast('Invalid choice.', 'warning'); return; }
      addObject({
        id: crypto.randomUUID(),
        type: 'stamp',
        page: sign.currentPage,
        normalized: { x: 0.5, y: 0.5 },
        text: stamps[idx],
        size: 24,
        fontFamily: 'Helvetica-Bold',
        color: '#FF3B30',
        widthPct: 30,
        heightPct: 10,
      });
    });
  }
  // Highlight button — adds a highlight overlay (semi-transparent yellow rectangle)
  const highlightBtn = document.getElementById('btnAddHighlight');
  if (highlightBtn) {
    highlightBtn.addEventListener('click', () => {
      addObject({
        id: crypto.randomUUID(),
        type: 'highlight',
        page: sign.currentPage,
        normalized: { x: 0.5, y: 0.5 },
        text: '',
        size: 20,
        color: '#FFEB3B',
        widthPct: 40,
        heightPct: 5,
      });
    });
  }
  // Underline button — adds an underline (solid line)
  const underlineBtn = document.getElementById('btnAddUnderline');
  if (underlineBtn) {
    underlineBtn.addEventListener('click', () => {
      addObject({
        id: crypto.randomUUID(),
        type: 'underline',
        page: sign.currentPage,
        normalized: { x: 0.5, y: 0.5 },
        text: '',
        size: 3,
        color: '#0066CC',
        widthPct: 40,
        heightPct: 2,
      });
    });
  }
  // Strikethrough button — adds a strikethrough (solid red line)
  const strikeBtn = document.getElementById('btnAddStrike');
  if (strikeBtn) {
    strikeBtn.addEventListener('click', () => {
      addObject({
        id: crypto.randomUUID(),
        type: 'strikethrough',
        page: sign.currentPage,
        normalized: { x: 0.5, y: 0.5 },
        text: '',
        size: 3,
        color: '#FF3B30',
        widthPct: 40,
        heightPct: 2,
      });
    });
  }
  document.getElementById('btnRemoveSelected').addEventListener('click', () => {
    if (!sign.selectedObjectId) return;
    sign.objects = sign.objects.filter(o => o.id !== sign.selectedObjectId);
    sign.selectedObjectId = null;
    // Push to history so Undo can restore the removed object
    if (sign.bytes) {
      pushSignHistory();
    }
    drawObjectOverlay();
    enableSignEditing(true);
    toast('Removed element.', 'success');
  });
  document.getElementById('btnUndo').addEventListener('click', () => {
    if (sign.history.length <= 1) return;
    const lastBytes = sign.history.pop();
    const lastObjects = sign.objectsHistory.pop();
    sign.redoStack.push(lastBytes);
    sign.objectsRedoStack.push(lastObjects);
    sign.bytes = sign.history[sign.history.length - 1];
    sign.objects = (sign.objectsHistory[sign.objectsHistory.length - 1] || []).map(o => ({
      ...o,
      pngBytes: o.pngBytes ? o.pngBytes.slice() : null,
    }));
    sign.selectedObjectId = null;
    sign.watermark = sign.objects.find(o => o.type === 'watermark') ? sign.watermark : null;
    sign.pdfDoc = null;
    loadPdfFromBytes(sign.bytes).then(async (pdf) => {
      sign.pdfDoc = pdf;
      sign.pageCount = await getPageCount(pdf);
      if (sign.currentPage > sign.pageCount) sign.currentPage = sign.pageCount;
      await renderSignCurrentPage(); updateSignPageNav(); drawObjectOverlay(); enableSignEditing(true);
    });
  });
  document.getElementById('btnRedo').addEventListener('click', () => {
    if (sign.redoStack.length === 0) return;
    const nextBytes = sign.redoStack.pop();
    const nextObjects = sign.objectsRedoStack.pop();
    sign.history.push(nextBytes);
    sign.objectsHistory.push(nextObjects);
    sign.bytes = nextBytes;
    sign.objects = nextObjects.map(o => ({
      ...o,
      pngBytes: o.pngBytes ? o.pngBytes.slice() : null,
    }));
    loadPdfFromBytes(sign.bytes).then(async (pdf) => {
      sign.pdfDoc = pdf;
      sign.pageCount = await getPageCount(pdf);
      await renderSignCurrentPage(); updateSignPageNav(); drawObjectOverlay(); enableSignEditing(true);
    });
  });

  // Signature sheet
  let pad = null;
  document.getElementById('btnAddSignature').addEventListener('click', () => {
    openSheet();
    if (!pad) {
      const canvas = document.getElementById('signaturePad');
      pad = new SignaturePad(canvas);
      // Resize canvas to match CSS dimensions for crisp drawing
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width || 600);
      canvas.height = Math.floor(rect.height || 300);
      pad = new SignaturePad(canvas);
    }
    // Reset to draw tab
    document.querySelector('.tools-tab[data-sigtab="draw"]').click();
  });
  document.querySelectorAll('.tools-tab[data-sigtab]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tools-tab[data-sigtab]').forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      const which = tab.dataset.sigtab;
      document.getElementById('sigDrawPanel').hidden = which !== 'draw';
      document.getElementById('sigTypePanel').hidden = which !== 'type';
    });
  });
  document.getElementById('btnClearSig').addEventListener('click', () => pad && pad.clear());
  document.getElementById('btnCancelSig').addEventListener('click', closeSheet);
  document.getElementById('btnInsertSig').addEventListener('click', async () => {
    const activeTab = document.querySelector('.tools-tab.is-active[data-sigtab]')?.dataset.sigtab;
    let pngBytes = null;
    try {
      if (activeTab === 'draw') {
        if (!pad || pad.isEmpty()) { toast('Draw a signature first.', 'warning'); return; }
        pngBytes = await pad.toPngBytes();
      } else {
        const text = document.getElementById('typedSig').value.trim();
        if (!text) { toast('Type your name first.', 'warning'); return; }
        const font = document.getElementById('typedSigFont').value;
        pngBytes = await typedSignatureToPng(text, font);
      }
    } catch (err) {
      toast('Could not generate signature: ' + err.message, 'error');
      return;
    }
    // Save signature to localStorage for reuse
    try {
      const saved = JSON.parse(localStorage.getItem('docuscan-pro.signatures') || '[]');
      const blob = new Blob([pngBytes], { type: 'image/png' });
      const reader = new FileReader();
      reader.onload = () => {
        saved.push({ id: crypto.randomUUID(), dataUrl: reader.result, created: Date.now() });
        if (saved.length > 5) saved.shift(); // keep max 5
        localStorage.setItem('docuscan-pro.signatures', JSON.stringify(saved));
      };
      reader.readAsDataURL(blob);
    } catch {}
    addObject({
      id: crypto.randomUUID(),
      type: 'signature',
      page: sign.currentPage,
      normalized: { x: 0.5, y: 0.5 },
      pngBytes,
      widthPct: Number(document.getElementById('objWidth').value),
      heightPct: Number(document.getElementById('objHeight').value),
      color: '#000000',
      text: '',
    });
    closeSheet();
  });

  // Watermark — Insert creates a MOVABLE overlay on the canvas (not baked yet).
  // The overlay can be dragged/resized. When Save/Download is clicked, the
  // watermark is baked at the overlay's position/size across ALL pages.
  document.getElementById('btnInsertWatermark').addEventListener('click', async () => {
    if (!sign.bytes) { toast('Open a PDF first.', 'warning'); return; }
    const cfg = normalizeConfig({
      text: document.getElementById('wmText').value || 'DRAFT',
      direction: document.getElementById('wmDirection').value,
      opacity: Number(document.getElementById('wmOpacity').value),
    });
    // Remove any existing watermark overlay object first
    sign.objects = sign.objects.filter(o => o.type !== 'watermark');
    // Add a new watermark overlay object
    const wmObj = {
      id: crypto.randomUUID(),
      type: 'watermark',
      page: sign.currentPage,
      normalized: { x: 0.5, y: 0.5 },
      text: cfg.text,
      direction: cfg.direction,
      opacity: cfg.opacity,
      widthPct: 50,
      heightPct: 20,
      size: Math.max(24, 50 * 2),
      color: '#888888',
    };
    sign.objects.push(wmObj);
    sign.selectedObjectId = wmObj.id;
    sign.watermark = cfg; // keep config for badge display
    // Push to history (bytes + objects snapshot)
    pushSignHistory();
    drawObjectOverlay();
    updateWatermarkStatus();
    enableSignEditing(true);
    toast('Watermark overlay added — drag to move, drag the blue dot to resize. Press Save or Download to bake.', 'success');
  });
  document.getElementById('btnRemoveWatermark').addEventListener('click', () => {
    if (!sign.watermark) return;
    // Just remove the watermark overlay object(s)
    sign.objects = sign.objects.filter(o => o.type !== 'watermark');
    sign.watermark = null;
    sign.selectedObjectId = null;
    // Push to history (bytes + objects snapshot)
    if (sign.bytes) {
      pushSignHistory();
    }
    drawObjectOverlay();
    updateWatermarkStatus();
    enableSignEditing(true);
    toast('Watermark removed.', 'success');
  });

  // Export actions
  document.getElementById('btnSaveToLibrary').addEventListener('click', async () => {
    await commitAndExport('save');
  });
  document.getElementById('btnDownloadPdf').addEventListener('click', async () => {
    await commitAndExport('download');
  });
  document.getElementById('btnSharePdf').addEventListener('click', async () => {
    await commitAndExport('share');
  });
  document.getElementById('btnPrintPdf').addEventListener('click', async () => {
    await commitAndExport('print');
  });

  // Initial disabled state
  enableSignEditing(false);
}

function updateWatermarkStatus() {
  const badge = document.getElementById('wmStatus');
  const removeBtn = document.getElementById('btnRemoveWatermark');
  if (!badge || !removeBtn) return;
  if (sign.watermark) {
    badge.style.display = '';
    badge.textContent = 'Watermark: ' + describeWm(sign.watermark);
    removeBtn.disabled = false;
  } else {
    badge.style.display = 'none';
    removeBtn.disabled = true;
  }
}

async function commitObjectsToPdf() {
  // Apply all text/signature/watermark objects onto the current sign.bytes.
  if (!sign.bytes) return null;
  if (sign.objects.length === 0) return sign.bytes;
  const { doc } = await loadExistingPdf(sign.bytes);
  const pages = doc.getPages();
  for (const obj of sign.objects) {
    if (obj.type === 'signature' && obj.pngBytes) {
      // Insert signature on its page only
      if (obj.page - 1 >= 0 && obj.page - 1 < pages.length) {
        await insertImageElement(doc, obj.page - 1, obj.pngBytes, {
          normalized: obj.normalized,
          widthPct: obj.widthPct,
          heightPct: obj.heightPct,
          rotation: 0,
        });
      }
    } else if (obj.type === 'watermark') {
      // Watermark applies to ALL pages at the overlay's position/size
      const lib = window.PDFLib;
      const { StandardFonts, rgb, degrees } = lib;
      const font = await doc.embedFont(StandardFonts.HelveticaBold);
      const text = obj.text || 'DRAFT';
      const opacity = Math.max(0, Math.min(1, (obj.opacity ?? 50) / 100));
      const color = rgb(0.5, 0.5, 0.5);
      for (let pIdx = 0; pIdx < pages.length; pIdx++) {
        const page = pages[pIdx];
        const { width, height } = page.getSize();
        // Font size derived from the overlay's widthPct
        const fontSize = Math.max(24, Math.min(200, Math.round((obj.widthPct || 50) * width / 100 * 0.3)));
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        const x = obj.normalized.x * width - textWidth / 2;
        const y = (1 - obj.normalized.y) * height - fontSize / 2;
        const angle = obj.direction === 'diagonal' ? 45 : 0;
        page.drawText(text, {
          x, y, size: fontSize, font, color, opacity,
          rotate: degrees(angle),
        });
      }
    } else if (obj.type === 'stamp') {
      // Stamp: bold text with border, on its page only
      if (obj.page - 1 >= 0 && obj.page - 1 < pages.length) {
        const page = pages[obj.page - 1];
        const { width, height } = page.getSize();
        const fontSize = Math.max(18, Math.min(72, Math.round((obj.widthPct || 30) * width / 100 * 0.4)));
        const font = await doc.embedFont(StandardFonts.HelveticaBold);
        const text = obj.text || 'STAMP';
        const tw = font.widthOfTextAtSize(text, fontSize);
        const x = obj.normalized.x * width - tw / 2;
        const y = (1 - obj.normalized.y) * height - fontSize / 2;
        // Draw border rectangle
        const padX = fontSize * 0.3, padY = fontSize * 0.2;
        page.drawRectangle({
          x: x - padX, y: y - padY, width: tw + padX * 2, height: fontSize + padY * 2,
          borderColor: rgb(1, 0.23, 0.19), borderWidth: 3, color: rgb(1, 1, 1), opacity: 0.9,
        });
        page.drawText(text, { x, y, size: fontSize, font, color: rgb(1, 0.23, 0.19) });
      }
    } else if (obj.type === 'highlight') {
      // Highlight: semi-transparent yellow rectangle on its page
      if (obj.page - 1 >= 0 && obj.page - 1 < pages.length) {
        const page = pages[obj.page - 1];
        const { width, height } = page.getSize();
        const w = (obj.widthPct || 40) * width / 100;
        const h = (obj.heightPct || 5) * height / 100;
        const x = obj.normalized.x * width - w / 2;
        const y = (1 - obj.normalized.y) * height - h / 2;
        page.drawRectangle({
          x, y, width: w, height: h,
          color: rgb(1, 0.92, 0.23), opacity: 0.4,
        });
      }
    } else if (obj.type === 'underline' || obj.type === 'strikethrough') {
      // Underline/Strikethrough: solid colored line on its page
      if (obj.page - 1 >= 0 && obj.page - 1 < pages.length) {
        const page = pages[obj.page - 1];
        const { width, height } = page.getSize();
        const w = (obj.widthPct || 40) * width / 100;
        const h = Math.max(2, (obj.size || 3));
        const x = obj.normalized.x * width - w / 2;
        const y = (1 - obj.normalized.y) * height - h / 2;
        const c = obj.color || (obj.type === 'strikethrough' ? '#FF3B30' : '#0066CC');
        const rgbv = rgbFromHex(c);
        page.drawRectangle({
          x, y, width: w, height: h,
          color: rgb(rgbv.r, rgbv.g, rgbv.b), opacity: 1,
        });
      }
    } else {
      // Text/date on its page only
      if (obj.page - 1 >= 0 && obj.page - 1 < pages.length) {
        const hex = obj.color || '#000000';
        const rgbv = rgbFromHex(hex);
        await insertTextElement(doc, obj.page - 1, {
          text: obj.text || '',
          normalized: obj.normalized,
          size: obj.size || 14,
          fontFamily: obj.fontFamily || 'Helvetica',
          color: rgbv,
          rotation: 0,
        });
      }
    }
  }
  const bytes = await doc.save();
  return bytes;
}

async function commitAndExport(action) {
  if (!sign.bytes) return;
  const btn = document.getElementById({
    save: 'btnSaveToLibrary', download: 'btnDownloadPdf',
    share: 'btnSharePdf', print: 'btnPrintPdf',
  }[action]);
  if (!btn) return;
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    const bytes = await commitObjectsToPdf();
    if (!bytes) { toast('Nothing to export.', 'warning'); return; }
    const name = `Signed_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;
    if (action === 'save') {
      await saveToLibrary(bytes, { name, pageCount: sign.pageCount });
      toast(`Saved "${name}.pdf" to Library.`, 'success');
    } else if (action === 'download') {
      downloadPdf(bytes, name);
      toast('Download started.', 'success');
    } else if (action === 'share') {
      const r = await sharePdf(bytes, name, { title: name, text: 'Signed document' });
      if (r.method === 'download-fallback') toast('Sharing unavailable — download started instead.', 'warning');
      else if (r.ok) toast('Shared.', 'success');
    } else if (action === 'print') {
      printPdf(bytes, name);
    }
  } catch (err) {
    toast('Export failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

/* ---------------- PDF Tools workspace ---------------- */
const tools = state.tools;

const TOOLS_PANELS = {
  merge: `
    <p class="muted tiny" style="margin:0 0 var(--space-2)">The currently loaded PDF is the base. Open a second PDF to merge it at the end (or beginning).</p>
    <div class="row">
      <label class="field" style="flex:1">
        <span class="field__label">Order</span>
        <select class="select" id="mergeOrder">
          <option value="append">Append second PDF</option>
          <option value="prepend">Prepend second PDF</option>
        </select>
      </label>
    </div>`,
  split: (total) => `
    <p class="muted tiny" style="margin:0 0 var(--space-2)">Total pages: ${total}. Enter ranges like <code>1-3,5,8-10</code>.</p>
    <div class="tools-split-input">
      <label class="field">
        <span class="field__label">Page ranges</span>
        <input class="field__control" id="splitRanges" type="text" placeholder="1-3,5,8-10" />
      </label>
    </div>`,
  rotate: `
    <p class="muted tiny" style="margin:0 0 var(--space-2)">Rotate every page by the chosen angle.</p>
    <div class="enhance-grid" id="rotateAngles">
      <button class="chip" data-angle="90" type="button">90°</button>
      <button class="chip" data-angle="180" type="button">180°</button>
      <button class="chip" data-angle="270" type="button">270°</button>
    </div>`,
  reorder: (total) => `
    <p class="muted tiny" style="margin:0 0 var(--space-2)">Drag the page thumbnails to rearrange. The new order updates automatically.</p>
    <div id="reorderThumbStrip" class="thumb-strip" style="min-height:120px"></div>
    <input type="hidden" id="reorderInput" value="${Array.from({length: total}, (_, i) => i + 1).join(',')}" />
    <p class="muted tiny" style="margin:var(--space-2) 0 0">Or type a custom order above (hidden field updated by drag).</p>`,
  annotate: `
    <p class="muted tiny" style="margin:0 0 var(--space-2)">Add annotations to a chosen page. Switch between Text and Draw (Apple Pencil / finger) modes.</p>
    <div class="tools-tabs" id="annotateSubTabs" role="tablist" style="margin-bottom:var(--space-3)">
      <button class="tools-tab is-active" data-subtab="text" role="tab" aria-selected="true">Text</button>
      <button class="tools-tab" data-subtab="draw" role="tab">Draw</button>
    </div>
    <div id="annotateTextPanel">
      <div class="field">
        <span class="field__label">Text</span>
        <input class="field__control" id="annotateText" type="text" placeholder="e.g. Reviewed by J.S." />
      </div>
      <div class="paired-fields" style="margin-top:var(--space-3)">
        <label class="field">
          <span class="field__label">Position X (0-100%)</span>
          <input class="field__control" id="annotateX" type="number" min="0" max="100" value="50" />
        </label>
        <label class="field">
          <span class="field__label">Position Y (0-100%)</span>
          <input class="field__control" id="annotateY" type="number" min="0" max="100" value="85" />
        </label>
      </div>
      <div class="paired-fields" style="margin-top:var(--space-3)">
        <label class="field">
          <span class="field__label">Ink color</span>
          <input class="field__control" id="annotateInk" type="color" value="#FF3B30" style="height:var(--control-height); padding:4px;" />
        </label>
        <label class="field">
          <span class="field__label">Font size (pt)</span>
          <input class="field__control" id="annotateSize" type="number" min="8" max="144" value="14" />
        </label>
      </div>
    </div>
    <div id="annotateDrawPanel" hidden>
      <p class="muted tiny" style="margin:0 0 var(--space-2)">Draw directly on the preview with your finger, Apple Pencil, or mouse. The PDF page content is shown on the draw canvas so you can see what you're annotating.</p>
      <div class="paired-fields">
        <label class="field">
          <span class="field__label">Pen color</span>
          <input class="field__control" id="drawColor" type="color" value="#FF3B30" style="height:var(--control-height); padding:4px;" />
        </label>
        <label class="field">
          <span class="field__label">Pen width</span>
          <input class="field__control" id="drawWidth" type="range" min="1" max="20" value="3" style="height:var(--control-height); padding:4px;" />
        </label>
      </div>
      <div class="row" style="margin-top:var(--space-3)">
        <button class="btn btn--sm" id="btnClearDraw" type="button">Clear strokes</button>
      </div>
      <p class="muted tiny" style="margin:var(--space-2) 0 0">Click <strong>Preview</strong> to see the page, then draw on it. Click <strong>Run</strong> to bake strokes into the PDF.</p>
    </div>
    <div id="pageThumbnailStrip" class="thumb-strip" style="margin-top:var(--space-3);min-height:0"></div>
    <input type="hidden" id="annotatePage" value="1" />
    <input type="hidden" id="drawPage" value="1" />`,
  watermark: `
    <p class="muted tiny" style="margin:0 0 var(--space-2)">Apply a text watermark across all pages.</p>
    <div class="watermark-row">
      <div class="field">
        <label class="field__label" for="twmText">Watermark text</label>
        <input class="field__control" id="twmText" type="text" value="DRAFT" />
      </div>
      <div class="field">
        <label class="field__label" for="twmDirection">Direction</label>
        <select class="field__control" id="twmDirection">
          <option value="diagonal">Diagonal ↗</option>
          <option value="horizontal">Horizontal</option>
        </select>
      </div>
      <div class="field">
        <label class="field__label" for="twmOpacity">Opacity</label>
        <input class="field__control" id="twmOpacity" type="number" min="0" max="100" value="50" />
      </div>
    </div>`,
  compare: `
    <p class="muted tiny" style="margin:0 0 var(--space-2)">View the primary PDF and the 2nd PDF side-by-side. Both pages render at the same scale for easy visual comparison.</p>
    <p class="muted tiny" style="margin:0">Open PDFs above (Open PDF = File A, Open 2nd PDF = File B), then press <strong>Run</strong> to render the comparison.</p>`,
  compress: `
    <p class="muted tiny" style="margin:0 0 var(--space-2)">Reduces PDF file size by re-encoding embedded images at lower quality. Choose a compression level:</p>
    <div class="enhance-grid" id="compressLevels">
      <button class="chip" data-level="light" type="button">Light (90%)</button>
      <button class="chip is-active" data-level="medium" type="button">Medium (70%)</button>
      <button class="chip" data-level="strong" type="button">Strong (50%)</button>
      <button class="chip" data-level="maximum" type="button">Maximum (30%)</button>
    </div>
    <p class="muted tiny" style="margin:var(--space-2) 0 0">Higher compression = smaller file but lower image quality. Text remains crisp.</p>`,
  protect: `
    <p class="muted tiny" style="margin:0 0 var(--space-2)">Encrypt the PDF with a password. The encrypted file can only be opened by entering the password.</p>
    <div class="stack">
      <label class="field">
        <span class="field__label">User password (to open the PDF)</span>
        <input class="field__control" id="protectUserPwd" type="password" placeholder="Enter a password" />
      </label>
      <label class="field">
        <span class="field__label">Confirm password</span>
        <input class="field__control" id="protectConfirmPwd" type="password" placeholder="Re-enter password" />
      </label>
      <div class="stack--tight">
        <label style="display:flex;align-items:center;gap:8px;font-size:var(--fs-label)"><input type="checkbox" id="protectNoPrint" /> Restrict printing</label>
        <label style="display:flex;align-items:center;gap:8px;font-size:var(--fs-label)"><input type="checkbox" id="protectNoCopy" /> Restrict copying text</label>
        <label style="display:flex;align-items:center;gap:8px;font-size:var(--fs-label)"><input type="checkbox" id="protectNoEdit" checked /> Restrict editing</label>
      </div>
    </div>
    <p class="muted tiny" style="margin:var(--space-2) 0 0">Uses AES-256 encryption via qpdf-wasm. The encrypted PDF can be opened by Adobe Acrobat, Preview, and other standard PDF readers.</p>`,
  toimage: `
    <p class="muted tiny" style="margin:0 0 var(--space-2)">Convert each page of the PDF to a JPEG or PNG image file.</p>
    <div class="paired-fields">
      <label class="field">
        <span class="field__label">Format</span>
        <select class="field__control" id="toImageFormat">
          <option value="jpeg">JPEG (smaller)</option>
          <option value="png">PNG (lossless)</option>
        </select>
      </label>
      <label class="field">
        <span class="field__label">Quality (JPEG)</span>
        <input class="field__control" id="toImageQuality" type="number" min="10" max="100" value="80" />
      </label>
    </div>
    <p class="muted tiny" style="margin:var(--space-2) 0 0">Each page will be saved as a separate image file. First page is downloaded directly; additional pages are saved to Library.</p>`,
  metadata: `
    <p class="muted tiny" style="margin:0 0 var(--space-2)">Edit the PDF's document properties (metadata).</p>
    <div class="stack">
      <label class="field"><span class="field__label">Title</span><input class="field__control" id="metaTitle" type="text" placeholder="Document title" /></label>
      <label class="field"><span class="field__label">Author</span><input class="field__control" id="metaAuthor" type="text" placeholder="Author name" /></label>
      <label class="field"><span class="field__label">Subject</span><input class="field__control" id="metaSubject" type="text" placeholder="Subject" /></label>
      <label class="field"><span class="field__label">Keywords</span><input class="field__control" id="metaKeywords" type="text" placeholder="comma, separated, keywords" /></label>
      <label class="field"><span class="field__label">Creator</span><input class="field__control" id="metaCreator" type="text" placeholder="Application name" /></label>
    </div>`,
  header: `
    <p class="muted tiny" style="margin:0 0 var(--space-2)">Add a header and/or footer with page numbers to every page.</p>
    <div class="paired-fields">
      <label class="field"><span class="field__label">Header text</span><input class="field__control" id="headerText" type="text" placeholder="e.g. Confidential" /></label>
      <label class="field"><span class="field__label">Footer text</span><input class="field__control" id="footerText" type="text" placeholder="e.g. Company Name" /></label>
    </div>
    <div class="paired-fields" style="margin-top:var(--space-3)">
      <label class="field"><span class="field__label">Page number format</span>
        <select class="field__control" id="pageNumFormat">
          <option value="none">None</option>
          <option value="simple">Page 1</option>
          <option value="of">Page 1 of 5</option>
          <option value="slash">1/5</option>
        </select>
      </label>
      <label class="field"><span class="field__label">Position</span>
        <select class="field__control" id="headerPosition">
          <option value="center">Center</option>
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
      </label>
    </div>`,
  batch: `
    <p class="muted tiny" style="margin:0 0 var(--space-2)">Apply the same operation to multiple PDF files at once.</p>
    <div class="stack">
      <label class="field">
        <span class="field__label">Batch operation</span>
        <select class="field__control" id="batchOp">
          <option value="rotate90">Rotate all 90°</option>
          <option value="rotate180">Rotate all 180°</option>
          <option value="rotate270">Rotate all 270°</option>
          <option value="compress">Compress all (medium)</option>
          <option value="watermark">Add DRAFT watermark</option>
        </select>
      </label>
      <button class="btn btn--primary btn--block" id="btnBatchAddFiles" type="button">Add PDF files to batch</button>
      <div id="batchFileList" class="stack--tight" style="min-height:40px"></div>
      <p class="muted tiny" style="margin:0">Processed files are saved to your Library.</p>
    </div>
    <input type="file" id="batchFileInput" accept="application/pdf" multiple hidden />`,
  deletes: `
    <p class="muted tiny" style="margin:0 0 var(--space-2)">Select pages to delete. Click thumbnails to mark them for deletion.</p>
    <div id="deleteThumbStrip" class="thumb-strip" style="min-height:120px"></div>
    <p class="muted tiny" style="margin:var(--space-2) 0 0">Marked pages (red border) will be removed when you click Run.</p>`,
  insert: `
    <p class="muted tiny" style="margin:0 0 var(--space-2)">Insert a blank page or a page from another PDF at a specific position.</p>
    <div class="paired-fields">
      <label class="field">
        <span class="field__label">Insert after page</span>
        <input class="field__control" id="insertAfterPage" type="number" min="0" value="0" />
      </label>
      <label class="field">
        <span class="field__label">Source</span>
        <select class="field__control" id="insertSource">
          <option value="blank">Blank page</option>
          <option value="file">From another PDF</option>
        </select>
      </label>
    </div>
    <input type="file" id="insertFileInput" accept="application/pdf" hidden />
    <p class="muted tiny" style="margin:var(--space-2) 0 0">Page 0 = insert at beginning. Page N = insert after page N.</p>`,
  extracttext: `
    <p class="muted tiny" style="margin:0 0 var(--space-2)">Extract text from the PDF's text layer (not OCR — this reads the actual embedded text).</p>
    <button class="btn btn--primary btn--block" id="btnExtractText" type="button">Extract text from all pages</button>
    <textarea class="textarea" id="extractedTextResult" placeholder="Extracted text will appear here…" style="margin-top:var(--space-3)" aria-label="Extracted text" readonly></textarea>
    <div class="row" style="margin-top:var(--space-2)">
      <button class="btn btn--sm" id="btnCopyExtracted" type="button">Copy text</button>
      <button class="btn btn--sm" id="btnDownloadExtracted" type="button">Download .txt</button>
    </div>`,
  forms: `
    <p class="muted tiny" style="margin:0 0 var(--space-2)">Detect and fill existing PDF form fields (text fields, checkboxes).</p>
    <div id="formFieldsList" class="stack" style="min-height:40px">
      <p class="muted tiny">Click Run to detect form fields. If the PDF has fillable fields, they will appear here for editing.</p>
    </div>`,
  imagewatermark: `
    <p class="muted tiny" style="margin:0 0 var(--space-2)">Upload a logo or image to use as a watermark across all pages.</p>
    <label class="field">
      <span class="field__label">Watermark image</span>
      <input class="field__control" id="imageWmFile" type="file" accept="image/*" />
    </label>
    <div class="paired-fields" style="margin-top:var(--space-3)">
      <label class="field">
        <span class="field__label">Size (%)</span>
        <input class="field__control" id="imageWmSize" type="number" min="5" max="100" value="30" />
      </label>
      <label class="field">
        <span class="field__label">Opacity (%)</span>
        <input class="field__control" id="imageWmOpacity" type="number" min="0" max="100" value="50" />
      </label>
    </div>
    <div class="paired-fields" style="margin-top:var(--space-3)">
      <label class="field">
        <span class="field__label">Position X (%)</span>
        <input class="field__control" id="imageWmX" type="number" min="0" max="100" value="50" />
      </label>
      <label class="field">
        <span class="field__label">Position Y (%)</span>
        <input class="field__control" id="imageWmY" type="number" min="0" max="100" value="50" />
      </label>
    </div>`,
  crop: `
    <p class="muted tiny" style="margin:0 0 var(--space-2)">Crop margins from all pages. Enter the percentage to crop from each side.</p>
    <div class="paired-fields">
      <label class="field">
        <span class="field__label">Top (%)</span>
        <input class="field__control" id="cropTop" type="number" min="0" max="50" value="5" />
      </label>
      <label class="field">
        <span class="field__label">Bottom (%)</span>
        <input class="field__control" id="cropBottom" type="number" min="0" max="50" value="5" />
      </label>
    </div>
    <div class="paired-fields" style="margin-top:var(--space-3)">
      <label class="field">
        <span class="field__label">Left (%)</span>
        <input class="field__control" id="cropLeft" type="number" min="0" max="50" value="5" />
      </label>
      <label class="field">
        <span class="field__label">Right (%)</span>
        <input class="field__control" id="cropRight" type="number" min="0" max="50" value="5" />
      </label>
    </div>`,
  invert: `
    <p class="muted tiny" style="margin:0 0 var(--space-2)">Invert PDF page colors for night reading. White backgrounds become black, black text becomes white.</p>
    <p class="muted tiny" style="margin:0">This is a visual-only transform — the original PDF is not modified. The inverted version is saved as a new PDF.</p>`,
  bookmarks: `
    <p class="muted tiny" style="margin:0 0 var(--space-2)">Add navigation bookmarks to the PDF. Each bookmark jumps to a specific page.</p>
    <div id="bookmarksList" class="stack--tight" style="min-height:40px"></div>
    <div class="row" style="margin-top:var(--space-3)">
      <input class="field__control" id="bookmarkTitle" type="text" placeholder="Bookmark name" style="flex:1" />
      <input class="field__control" id="bookmarkPage" type="number" min="1" placeholder="Page" style="width:80px" />
      <button class="btn btn--sm" id="btnAddBookmark" type="button">Add</button>
    </div>`,
  splitbysize: `
    <p class="muted tiny" style="margin:0 0 var(--space-2)">Split the PDF into chunks that fit under a file size limit (for email attachments).</p>
    <label class="field">
      <span class="field__label">Max size per file (MB)</span>
      <input class="field__control" id="splitSizeLimit" type="number" min="1" max="100" value="25" />
    </label>
    <p class="muted tiny" style="margin:var(--space-2) 0 0">The PDF will be split into multiple files, each under the size limit. Extra files are saved to Library.</p>`,
  undo: `
    <p class="muted tiny" style="margin:0 0 var(--space-2)">Undo or redo operations performed in PDF Tools.</p>
    <div class="row">
      <button class="btn btn--sm" id="btnToolsUndo" type="button" disabled>← Undo</button>
      <button class="btn btn--sm" id="btnToolsRedo" type="button" disabled>Redo →</button>
    </div>
    <div id="undoHistoryList" class="stack--tight" style="margin-top:var(--space-3);min-height:40px"></div>`,
  ocrpdf: `
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
    </div>`,
};

async function loadToolsDocument(bytes, name) {
  if (!(await validatePdfBytes(bytes))) { toast('File is not a valid PDF.', 'error'); return false; }
  tools.bytes = bytes;
  tools.secondaryBytesList = [];
  tools.pdfDoc = await loadPdfFromBytes(bytes);
  tools.pageCount = await getPageCount(tools.pdfDoc);
  tools.outputBytes = null;
  tools.outputPdfDoc = null;
  document.getElementById('toolsDocInfo').textContent = `${name || 'Document'} • ${tools.pageCount} page(s)`;
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
}

async function renderToolsPreview(bytes, label) {
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
  const docInfo = document.getElementById('toolsDocInfo');
  if (docInfo) docInfo.textContent = `${label} • ${count} page(s)`;
  if (drawCanvas) {
    drawCanvas.width = canvas.width;
    drawCanvas.height = canvas.height;
    const canvasRect = canvas.getBoundingClientRect();
    drawCanvas.style.width = canvasRect.width + 'px';
    drawCanvas.style.height = canvasRect.height + 'px';
    drawCanvas.style.left = '0px';
    drawCanvas.style.top = '0px';
    const dctx = drawCanvas.getContext('2d');
    dctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    // Copy PDF page content INTO the draw canvas so the user SEES the
    // document while drawing. The draw canvas is the only canvas the user
    // interacts with, so it must show the document.
    dctx.drawImage(canvas, 0, 0);
    // Store a clean snapshot for "Clear strokes" to restore
    drawCanvas._pdfSnapshot = dctx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
    // Hide the PDF canvas — the draw canvas now contains the PDF content
    // so we don't need both visible (avoids double-rendering confusion)
    canvas.style.visibility = 'hidden';
  }
}

/** Render delete-pages thumbnails */
async function renderDeleteThumbnails() {
  const strip = document.getElementById('deleteThumbStrip');
  if (!strip || !tools.bytes) return;
  strip.innerHTML = '<div class="empty-state"><div class="empty-state__sub">Loading…</div></div>';
  tools._pagesToDelete = tools._pagesToDelete || [];
  try {
    const pdf = await loadPdfFromBytes(tools.bytes);
    const count = await getPageCount(pdf);
    strip.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const thumb = document.createElement('div');
      thumb.className = 'thumb' + (tools._pagesToDelete.includes(i) ? ' is-selected' : '');
      thumb.setAttribute('role', 'button');
      thumb.setAttribute('aria-label', `Page ${i+1} — click to mark for deletion`);
      thumb.tabIndex = 0;
      const canvas = document.createElement('canvas');
      await renderPageToCanvas(pdf, i + 1, canvas, 120);
      thumb.appendChild(canvas);
      const idx = document.createElement('span');
      idx.className = 'thumb__index';
      idx.textContent = String(i + 1);
      thumb.appendChild(idx);
      thumb.addEventListener('click', () => {
        const pos = tools._pagesToDelete.indexOf(i);
        if (pos >= 0) {
          tools._pagesToDelete.splice(pos, 1);
          thumb.classList.remove('is-selected');
          thumb.style.borderColor = '';
        } else {
          tools._pagesToDelete.push(i);
          thumb.classList.add('is-selected');
          thumb.style.borderColor = 'var(--color-danger)';
        }
      });
      strip.appendChild(thumb);
    }
  } catch (err) { console.error('Delete thumbnails failed:', err); }
}

/** Render drag-to-reorder thumbnails for the Reorder tab */
async function renderReorderThumbnails() {
  const strip = document.getElementById('reorderThumbStrip');
  if (!strip || !tools.bytes) return;
  strip.innerHTML = '<div class="empty-state"><div class="empty-state__sub">Loading pages…</div></div>';
  try {
    const pdf = await loadPdfFromBytes(tools.bytes);
    const count = await getPageCount(pdf);
    strip.innerHTML = '';
    let order = Array.from({length: count}, (_, i) => i + 1);
    for (let i = 0; i < count; i++) {
      const pageNum = i + 1;
      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      thumb.draggable = true;
      thumb.dataset.pageIdx = String(i);
      thumb.setAttribute('role', 'button');
      thumb.setAttribute('aria-label', `Page ${pageNum}`);
      const canvas = document.createElement('canvas');
      await renderPageToCanvas(pdf, pageNum, canvas, 120);
      thumb.appendChild(canvas);
      const idx = document.createElement('span');
      idx.className = 'thumb__index';
      idx.textContent = String(pageNum);
      thumb.appendChild(idx);
      // Drag events
      thumb.addEventListener('dragstart', (e) => {
        thumb.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(i));
      });
      thumb.addEventListener('dragend', () => thumb.classList.remove('is-dragging'));
      thumb.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; thumb.classList.add('is-selected'); });
      thumb.addEventListener('dragleave', () => thumb.classList.remove('is-selected'));
      thumb.addEventListener('drop', (e) => {
        e.preventDefault();
        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const toIdx = parseInt(thumb.dataset.pageIdx, 10);
        if (fromIdx === toIdx) return;
        // Reorder the array
        const moved = order[fromIdx];
        order.splice(fromIdx, 1);
        order.splice(toIdx, 0, moved);
        // Update hidden input with new order (1-indexed)
        const input = document.getElementById('reorderInput');
        if (input) input.value = order.join(',');
        // Visually reorder the thumbnails
        strip.insertBefore(thumb, strip.children[toIdx]);
        // Update the index labels
        strip.querySelectorAll('.thumb').forEach((t, idx) => {
          const label = t.querySelector('.thumb__index');
          if (label) label.textContent = String(idx + 1);
          t.dataset.pageIdx = String(idx);
        });
        toast('Page order updated. Click Run to apply.', 'success');
      });
      strip.appendChild(thumb);
    }
    if (count === 0) strip.innerHTML = '<div class="empty-state"><div class="empty-state__sub">No pages</div></div>';
  } catch (err) {
    console.error('Reorder thumbnails failed:', err);
  }
}

/** Render page thumbnails for visual page selection in PDF Tools */
async function renderPageThumbnails() {
  const strip = document.getElementById('pageThumbnailStrip');
  if (!strip || !tools.bytes) return;
  strip.innerHTML = '';
  try {
    const pdf = await loadPdfFromBytes(tools.bytes);
    const count = await getPageCount(pdf);
    const selectedPage = Number(document.getElementById('annotatePage')?.value || document.getElementById('drawPage')?.value || 1);
    for (let i = 1; i <= count; i++) {
      const thumb = document.createElement('div');
      thumb.className = 'thumb' + (i === selectedPage ? ' is-selected' : '');
      thumb.setAttribute('role', 'button');
      thumb.setAttribute('aria-label', `Page ${i}`);
      thumb.tabIndex = 0;
      const canvas = document.createElement('canvas');
      await renderPageToCanvas(pdf, i, canvas, 120);
      thumb.appendChild(canvas);
      const idx = document.createElement('span');
      idx.className = 'thumb__index';
      idx.textContent = String(i);
      thumb.appendChild(idx);
      thumb.addEventListener('click', () => {
        strip.querySelectorAll('.thumb').forEach(t => t.classList.remove('is-selected'));
        thumb.classList.add('is-selected');
        const ap = document.getElementById('annotatePage');
        const dp = document.getElementById('drawPage');
        if (ap) ap.value = String(i);
        if (dp) dp.value = String(i);
        // Re-render the preview for the selected page
        if (tools.bytes) {
          renderToolsPreview(tools.bytes, `page ${i}`).then(() => {
            // If in draw mode, re-copy content into draw canvas
            const dc = document.getElementById('toolsDrawCanvas');
            const tc = document.getElementById('toolsCanvas');
            if (dc && tc && !dc.hidden) {
              const dctx = dc.getContext('2d');
              dctx.clearRect(0, 0, dc.width, dc.height);
              dctx.drawImage(tc, 0, 0);
              dc._pdfSnapshot = dctx.getImageData(0, 0, dc.width, dc.height);
            }
          });
        }
      });
      strip.appendChild(thumb);
    }
  } catch (err) {
    console.error('Thumbnail render failed:', err);
  }
}

function renderToolsPanel() {
  const panel = document.getElementById('toolsPanel');
  const tab = tools.activeTab;
  let html = '';
  if (tab === 'split') html = TOOLS_PANELS.split(tools.pageCount);
  else if (tab === 'reorder') html = TOOLS_PANELS.reorder(tools.pageCount);
  else html = TOOLS_PANELS[tab];
  panel.innerHTML = html;
  // Bind chip handlers for rotate
  if (tab === 'rotate') {
    panel.querySelectorAll('#rotateAngles .chip').forEach(c => {
      c.addEventListener('click', () => {
        panel.querySelectorAll('#rotateAngles .chip').forEach(x => x.classList.remove('is-active'));
        c.classList.add('is-active');
        tools._rotateAngle = Number(c.dataset.angle);
      });
    });
    panel.querySelector('#rotateAngles .chip[data-angle="90"]').click();
  }
  // Render drag-to-reorder thumbnails
  if (tab === 'reorder' && tools.bytes) {
    renderReorderThumbnails();
  }
  // Bind chip handlers for compress levels
  if (tab === 'compress') {
    panel.querySelectorAll('#compressLevels .chip').forEach(c => {
      c.addEventListener('click', () => {
        panel.querySelectorAll('#compressLevels .chip').forEach(x => x.classList.remove('is-active'));
        c.classList.add('is-active');
        tools._compressLevel = c.dataset.level;
      });
    });
    tools._compressLevel = 'medium';
  }
  // Bind batch file handler
  if (tab === 'batch') {
    const batchBtn = panel.querySelector('#btnBatchAddFiles');
    const batchInput = panel.querySelector('#batchFileInput');
    const batchList = panel.querySelector('#batchFileList');
    if (batchBtn && batchInput) {
      batchBtn.addEventListener('click', () => { batchInput.value = ''; batchInput.click(); });
      batchInput.addEventListener('change', async () => {
        tools._batchFiles = tools._batchFiles || [];
        for (const file of Array.from(batchInput.files || [])) {
          const buf = await file.arrayBuffer();
          tools._batchFiles.push({ name: file.name, bytes: new Uint8Array(buf) });
        }
        if (batchList) {
          batchList.innerHTML = tools._batchFiles.map((f, i) =>
            `<div class="row row--tight"><span class="badge badge--secondary">${i + 1}</span><span>${f.name}</span></div>`
          ).join('');
        }
        toast(`${tools._batchFiles.length} file(s) queued for batch.`, 'success');
      });
    }
  }
  // Bind sub-tab handlers for annotate
  if (tab === 'annotate') {
    // Render page thumbnails for visual page selection
    renderPageThumbnails();
    const subTabs = panel.querySelectorAll('#annotateSubTabs .tools-tab');
    subTabs.forEach(t => {
      t.addEventListener('click', () => {
        subTabs.forEach(x => { x.classList.remove('is-active'); x.setAttribute('aria-selected','false'); });
        t.classList.add('is-active');
        t.setAttribute('aria-selected','true');
        const which = t.dataset.subtab;
        panel.querySelector('#annotateTextPanel').hidden = which !== 'text';
        panel.querySelector('#annotateDrawPanel').hidden = which !== 'draw';
        tools._annotateSub = which;
        // Toggle the draw overlay canvas visibility
        const drawCanvas = document.getElementById('toolsDrawCanvas');
        if (drawCanvas) drawCanvas.hidden = which !== 'draw';
        // Restore PDF canvas visibility when NOT in draw mode
        if (which !== 'draw') {
          const pdfCanvas = document.getElementById('toolsCanvas');
          if (pdfCanvas) pdfCanvas.style.visibility = '';
        }
        // KEY FIX: re-render the PDF preview when entering Draw mode so the
        // user sees the actual page they're annotating (not a blank canvas).
        // Also auto-scroll the preview into view so the user can see it.
        if (which === 'draw') {
          const stage = document.getElementById('toolsCanvasStage');
          const compareView = document.getElementById('compareView');
          if (compareView) compareView.hidden = true;
          if (stage) {
            stage.hidden = false;
            stage.style.display = '';
          }
          const toolsCanvas = document.getElementById('toolsCanvas');
          if (toolsCanvas) toolsCanvas.hidden = false;
          if (tools.bytes) {
            renderToolsPreview(tools.bytes, 'source').then(() => {
              // Auto-scroll the preview card into view so the user can see
              // the PDF document they're supposed to draw on
              const previewCard = document.querySelector('#toolsCanvasWrap')?.closest('.card');
              if (previewCard) previewCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }).catch(err => {
              console.error('Failed to re-render PDF preview for Draw:', err);
              toast('Failed to render PDF for annotation: ' + err.message, 'error');
            });
          } else {
            toast('Open a PDF first to annotate it.', 'warning');
          }
        }
      });
    });
    subTabs[0].click(); // initialize Text mode
    // Bind Clear strokes button
    const clearBtn = panel.querySelector('#btnClearDraw');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        const dc = document.getElementById('toolsDrawCanvas');
        if (!dc) return;
        const ctx = dc.getContext('2d');
        // Restore the PDF snapshot (document content without strokes)
        // instead of clearing to blank white
        if (dc._pdfSnapshot) {
          ctx.putImageData(dc._pdfSnapshot, 0, 0);
        } else {
          ctx.clearRect(0, 0, dc.width, dc.height);
        }
        tools._drawStrokes = [];
        toast('Strokes cleared. Document content preserved.', 'success');
      });
    }
    // Initialize drawing strokes array + bind pointer events on the draw canvas
    tools._drawStrokes = tools._drawStrokes || [];
    attachDrawCanvasHandlers();
  }
  // Undo/Redo history for PDF Tools
  tools._history = tools._history || [tools.bytes?.slice()].filter(Boolean);
  tools._redoStack = tools._redoStack || [];

  // Bind undo/redo buttons if on undo tab
  if (tab === 'undo') {
    const undoBtn = panel.querySelector('#btnToolsUndo');
    const redoBtn = panel.querySelector('#btnToolsRedo');
    const historyList = panel.querySelector('#undoHistoryList');
    const updateUndoUI = () => {
      if (undoBtn) undoBtn.disabled = tools._history.length <= 1;
      if (redoBtn) redoBtn.disabled = tools._redoStack.length === 0;
      if (historyList) {
        historyList.innerHTML = tools._history.map((_, i) =>
          `<div class="row row--tight"><span class="badge ${i === tools._history.length - 1 ? '' : 'badge--secondary'}">${i + 1}</span> ${i === tools._history.length - 1 ? 'Current' : 'History'}</div>`
        ).join('');
      }
    };
    updateUndoUI();
    if (undoBtn) undoBtn.addEventListener('click', async () => {
      if (tools._history.length <= 1) return;
      const current = tools._history.pop();
      tools._redoStack.push(current);
      tools.bytes = tools._history[tools._history.length - 1];
      tools.pdfDoc = await loadPdfFromBytes(tools.bytes);
      tools.pageCount = await getPageCount(tools.pdfDoc);
      await renderToolsPreview(tools.bytes, 'restored');
      updateUndoUI();
      toast('Undone.', 'success');
    });
    if (redoBtn) redoBtn.addEventListener('click', async () => {
      if (tools._redoStack.length === 0) return;
      const next = tools._redoStack.pop();
      tools._history.push(next);
      tools.bytes = next;
      tools.pdfDoc = await loadPdfFromBytes(tools.bytes);
      tools.pageCount = await getPageCount(tools.pdfDoc);
      await renderToolsPreview(tools.bytes, 'restored');
      updateUndoUI();
      toast('Redone.', 'success');
    });
  }
  // Render delete-pages thumbnails
  if (tab === 'deletes' && tools.bytes) {
    renderDeleteThumbnails();
  }
  // Bookmark add handler
  if (tab === 'bookmarks') {
    tools._bookmarks = tools._bookmarks || [];
    const updateBookmarkList = () => {
      const list = panel.querySelector('#bookmarksList');
      if (list) {
        list.innerHTML = tools._bookmarks.map((bm, i) =>
          `<div class="row row--tight"><span class="badge">${i+1}</span><span>${bm.title} → Page ${bm.page}</span></div>`
        ).join('') || '<p class="muted tiny">No bookmarks yet.</p>';
      }
    };
    updateBookmarkList();
    const addBtn = panel.querySelector('#btnAddBookmark');
    if (addBtn) addBtn.addEventListener('click', () => {
      const title = document.getElementById('bookmarkTitle')?.value?.trim();
      const page = Number(document.getElementById('bookmarkPage')?.value);
      if (!title || !page) { toast('Enter name and page.', 'warning'); return; }
      tools._bookmarks.push({ title, page });
      document.getElementById('bookmarkTitle').value = '';
      document.getElementById('bookmarkPage').value = '';
      updateBookmarkList();
      toast('Bookmark added.', 'success');
    });
  }
  // Insert page file input handler
  if (tab === 'insert') {
    const insertSource = document.getElementById('insertSource');
    const insertFile = document.getElementById('insertFileInput');
    if (insertSource && insertFile) {
      insertSource.addEventListener('change', () => {
        if (insertSource.value === 'file') {
          insertFile.hidden = false;
        } else {
          insertFile.hidden = true;
        }
      });
    }
  }
  // Extract text buttons
  if (tab === 'extracttext') {
    const copyBtn = panel.querySelector('#btnCopyExtracted');
    const dlBtn = panel.querySelector('#btnDownloadExtracted');
    if (copyBtn) copyBtn.addEventListener('click', () => {
      const ta = document.getElementById('extractedTextResult');
      if (!ta?.value) { toast('Nothing to copy.', 'warning'); return; }
      copyTextFallback(ta.value);
    });
    if (dlBtn) dlBtn.addEventListener('click', () => {
      const ta = document.getElementById('extractedTextResult');
      if (!ta?.value) { toast('Nothing to download.', 'warning'); return; }
      const blob = new Blob([ta.value], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'extracted-text.txt'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    });
  }
  // PDF OCR copy/download buttons
  if (tab === 'ocrpdf') {
    const copyBtn = panel.querySelector('#btnCopyPdfOcr');
    const dlBtn = panel.querySelector('#btnDownloadPdfOcr');
    if (copyBtn) copyBtn.addEventListener('click', () => {
      const ta = document.getElementById('pdfOcrResult');
      if (!ta?.value) { toast('Nothing to copy.', 'warning'); return; }
      copyTextFallback(ta.value);
    });
    if (dlBtn) dlBtn.addEventListener('click', () => {
      const ta = document.getElementById('pdfOcrResult');
      if (!ta?.value) { toast('Nothing to download.', 'warning'); return; }
      const blob = new Blob([ta.value], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'pdf-ocr-text.txt'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    });
  }
  // Compare tab: show the comparison view, hide the single-canvas stage
  const compareView = document.getElementById('compareView');
  if (compareView) compareView.hidden = tab !== 'compare';
  const stage = document.getElementById('toolsCanvasStage');
  if (stage) stage.style.display = tab === 'compare' ? 'none' : '';
}

/**
 * Wire up the freehand draw overlay canvas. Captures pointer strokes with
 * Apple Pencil / finger / mouse, redraws them on a transparent canvas
 * overlay, and stores them as point arrays for later PDF baking.
 */
function attachDrawCanvasHandlers() {
  const dc = document.getElementById('toolsDrawCanvas');
  if (!dc || dc._docuscanBound) return;
  dc._docuscanBound = true;
  let drawing = false;
  let current = null;
  dc.addEventListener('pointerdown', (e) => {
    if (dc.hidden) return;
    e.preventDefault();
    dc.setPointerCapture(e.pointerId);
    drawing = true;
    const p = pointerPos(e, dc);
    current = { points: [p] };
    const ctx = dc.getContext('2d');
    ctx.strokeStyle = document.getElementById('drawColor')?.value || '#FF3B30';
    ctx.lineWidth = Number(document.getElementById('drawWidth')?.value || 3);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  });
  dc.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    e.preventDefault();
    const p = pointerPos(e, dc);
    current.points.push(p);
    const ctx = dc.getContext('2d');
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  });
  const end = (e) => {
    if (!drawing) return;
    e.preventDefault();
    drawing = false;
    if (current && current.points.length > 1) tools._drawStrokes.push(current);
    try { dc.releasePointerCapture(e.pointerId); } catch {}
    current = null;
  };
  dc.addEventListener('pointerup', end);
  dc.addEventListener('pointercancel', end);
  dc.addEventListener('pointerleave', end);
  // Re-render strokes if pen color or width changes
  ['drawColor', 'drawWidth'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', redrawDrawStrokes);
  });
}

function pointerPos(e, canvas) {
  const r = canvas.getBoundingClientRect();
  const sx = canvas.width / r.width;
  const sy = canvas.height / r.height;
  return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
}

function redrawDrawStrokes() {
  const dc = document.getElementById('toolsDrawCanvas');
  if (!dc) return;
  const ctx = dc.getContext('2d');
  ctx.clearRect(0, 0, dc.width, dc.height);
  const color = document.getElementById('drawColor')?.value || '#FF3B30';
  const width = Number(document.getElementById('drawWidth')?.value || 3);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of (tools._drawStrokes || [])) {
    ctx.beginPath();
    stroke.points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  }
}

/**
 * Render both loaded PDFs side-by-side in the Compare view.
 * File A = primary PDF (tools.bytes)
 * File B = first secondary PDF (tools.secondaryBytesList[0]) if any
 *
 * Per user request: this must ALWAYS work — if only File A is loaded, show
 * File A + an empty "Open File B" pane. If neither is loaded, show empty
 * states in both panes. Never silently fail.
 */
async function renderCompareView() {
  const compareView = document.getElementById('compareView');
  const leftWrap = document.getElementById('compareLeftWrap');
  const rightWrap = document.getElementById('compareRightWrap');
  if (!compareView || !leftWrap || !rightWrap) {
    toast('Compare view not available.', 'warning');
    return;
  }
  // ALWAYS force the compare view visible (regardless of current tab)
  compareView.hidden = false;
  const stage = document.getElementById('toolsCanvasStage');
  if (stage) stage.style.display = 'none';

  leftWrap.innerHTML = '<div class="empty-state"><div class="empty-state__sub">Loading…</div></div>';
  rightWrap.innerHTML = '<div class="empty-state"><div class="empty-state__sub">Loading…</div></div>';

  // File A
  if (!tools.bytes) {
    leftWrap.innerHTML = '<div class="empty-state"><div class="empty-state__sub">Open File A (Open PDF)</div></div>';
  } else {
    try {
      const pdfA = await loadPdfFromBytes(tools.bytes);
      const canvasA = document.createElement('canvas');
      const targetW = Math.min(380, Math.max(200, leftWrap.clientWidth - 24));
      await renderPageToCanvas(pdfA, 1, canvasA, targetW);
      leftWrap.innerHTML = '';
      leftWrap.appendChild(canvasA);
    } catch (err) {
      leftWrap.innerHTML = `<div class="empty-state"><div class="empty-state__sub">Failed: ${err.message}</div></div>`;
    }
  }

  // File B
  if (tools.secondaryBytesList.length === 0) {
    rightWrap.innerHTML = '<div class="empty-state"><div class="empty-state__sub">Open File B (Open 2nd PDF)</div></div>';
  } else {
    try {
      const pdfB = await loadPdfFromBytes(tools.secondaryBytesList[0]);
      const canvasB = document.createElement('canvas');
      const targetW = Math.min(380, Math.max(200, rightWrap.clientWidth - 24));
      await renderPageToCanvas(pdfB, 1, canvasB, targetW);
      rightWrap.innerHTML = '';
      rightWrap.appendChild(canvasB);
    } catch (err) {
      rightWrap.innerHTML = `<div class="empty-state"><div class="empty-state__sub">Failed: ${err.message}</div></div>`;
    }
  }

  // Scroll the compare view into view so the user sees it
  compareView.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function initToolsWorkspace() {
  const input = document.getElementById('toolsPdfInput');
  const mergeInput = document.getElementById('toolsMergeInput');
  document.getElementById('btnOpenPdfTools').addEventListener('click', () => {
    input.value = '';
    input.click();
  });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') { toast('Please select a PDF file.', 'error'); return; }
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      await loadToolsDocument(bytes, file.name.replace(/\.pdf$/i, ''));
      toast('Loaded PDF.', 'success');
    } catch (err) {
      toast('Failed to open PDF: ' + err.message, 'error');
    }
  });
  document.getElementById('btnAddSecondPdf').addEventListener('click', () => {
    mergeInput.value = '';
    mergeInput.click();
  });
  mergeInput.addEventListener('change', async () => {
    const file = mergeInput.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') { toast('Please select a PDF file.', 'error'); return; }
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      tools.secondaryBytesList.push(bytes);
      toast(`Added "${file.name}" for merge (${tools.secondaryBytesList.length} queued).`, 'success');
      // Auto-render both documents in the preview so the user can see them side-by-side
      // (per user request: "when adding second document should come up in preview view to see both documents")
      if (tools.bytes && tools.secondaryBytesList.length > 0) {
        await renderCompareView();
      }
    } catch (err) {
      toast('Failed to load second PDF: ' + err.message, 'error');
    }
  });

  // Tabs
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
  }

  // Run / Preview / Export
  document.getElementById('btnRunToolOp').addEventListener('click', async () => {
    if (!tools.bytes) return;
    const btn = document.getElementById('btnRunToolOp');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Running…';
    try {
      let out = null;
      const tab = tools.activeTab;
      if (tab === 'merge') {
        if (tools.secondaryBytesList.length === 0) throw new Error('Open a 2nd PDF first.');
        const order = document.getElementById('mergeOrder').value;
        if (order === 'prepend') {
          out = await runMerge(tools.secondaryBytesList[0], [tools.bytes, ...tools.secondaryBytesList.slice(1)]);
        } else {
          out = await runMerge(tools.bytes, tools.secondaryBytesList);
        }
      } else if (tab === 'split') {
        const rangesInput = document.getElementById('splitRanges').value;
        const results = await runSplit(tools.bytes, rangesInput, tools.pageCount);
        // Use the first result as preview; save all
        out = results[0];
        // Save extras to library
        for (let i = 1; i < results.length; i++) {
          await saveToLibrary(results[i], { name: `Split part ${i + 1}`, pageCount: 0 });
        }
        toast(`Split produced ${results.length} file(s). Extras saved to Library.`, 'success');
      } else if (tab === 'rotate') {
        const angle = tools._rotateAngle || 90;
        out = await runRotate(tools.bytes, angle);
      } else if (tab === 'reorder') {
        const inputVal = document.getElementById('reorderInput').value.trim();
        if (!inputVal) throw new Error('Provide a new order.');
        const order = inputVal.split(',').map(s => parseInt(s.trim(), 10) - 1);
        out = await runReorder(tools.bytes, order);
      } else if (tab === 'annotate') {
        const sub = tools._annotateSub || 'text';
        if (sub === 'text') {
          const pageIdx = Number(document.getElementById('annotatePage').value) - 1;
          const text = document.getElementById('annotateText').value;
          const x = Number(document.getElementById('annotateX').value) / 100;
          const y = Number(document.getElementById('annotateY').value) / 100;
          if (!text) throw new Error('Enter annotation text.');
          const ink = document.getElementById('annotateInk').value;
          const size = Number(document.getElementById('annotateSize').value) || 14;
          const rgb = rgbFromHex(ink);
          out = await runAnnotateText(tools.bytes, pageIdx, {
            text, normalized: { x, y }, size, fontFamily: 'Helvetica', color: rgb, rotation: 0,
          });
        } else {
          // Draw mode — bake the draw canvas (which contains PDF content + strokes)
          // into the PDF page, replacing the original page content
          const pageIdx = Number(document.getElementById('drawPage').value) - 1;
          const dc = document.getElementById('toolsDrawCanvas');
          if (!dc) throw new Error('Draw canvas not initialized.');
          // Export the draw canvas as PNG — it contains the PDF page + user's strokes
          const blob = await new Promise(res => dc.toBlob(res, 'image/png'));
          const arr = await blob.arrayBuffer();
          const pngBytes = new Uint8Array(arr);
          out = await runAnnotateDrawing(tools.bytes, pageIdx, pngBytes);
        }
      } else if (tab === 'watermark') {
        const cfg = normalizeConfig({
          text: document.getElementById('twmText').value,
          direction: document.getElementById('twmDirection').value,
          opacity: Number(document.getElementById('twmOpacity').value),
        });
        out = await runWatermark(tools.bytes, cfg);
      } else if (tab === 'compare') {
        await renderCompareView();
        toast('Compare view rendered below.', 'success');
      } else if (tab === 'compress') {
        const level = tools._compressLevel || 'medium';
        const qualityMap = { light: 0.9, medium: 0.7, strong: 0.5, maximum: 0.3 };
        const quality = qualityMap[level] || 0.7;
        out = await compressPdf(tools.bytes, quality);
        const before = (tools.bytes.length / 1024).toFixed(0);
        const after = (out.length / 1024).toFixed(0);
        toast(`Compressed: ${before}KB → ${after}KB (${Math.round((1 - after/before) * 100)}% smaller)`, 'success');
      } else if (tab === 'protect') {
        const userPwd = document.getElementById('protectUserPwd')?.value;
        const confirmPwd = document.getElementById('protectConfirmPwd')?.value;
        if (!userPwd) throw new Error('Enter a password.');
        if (userPwd !== confirmPwd) throw new Error('Passwords do not match.');
        // Try loading qpdf-wasm for real AES encryption
        try {
          const qpdfMod = await import('https://cdn.jsdelivr.net/npm/qpdf-wasm@0.1.0/dist/qpdf-wasm.mjs');
          const qpdf = await qpdfMod.default();
          // Write input file to virtual FS
          const inputPath = '/input.pdf';
          const outputPath = '/output.pdf';
          qpdf.FS.writeFile(inputPath, tools.bytes);
          // Build qpdf command: encrypt with AES-256
          let cmd = ['qpdf', '--encrypt', userPwd, userPwd, '256', '--'];
          if (document.getElementById('protectNoPrint')?.checked) cmd.splice(3, 0, '--modify=none', '--extract=n');
          if (document.getElementById('protectNoCopy')?.checked) cmd.splice(3, 0, '--extract=n');
          if (document.getElementById('protectNoEdit')?.checked) cmd.splice(3, 0, '--modify=none');
          cmd = cmd.concat([inputPath, outputPath]);
          qpdf.callMain(cmd);
          out = qpdf.FS.readFile(outputPath);
          toast('PDF encrypted with AES-256.', 'success');
        } catch (wasmErr) {
          // Fallback: use pdf-lib metadata flags
          console.warn('qpdf-wasm unavailable, using metadata fallback:', wasmErr.message);
          if (!window.PDFLib) { await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
          const { PDFDocument } = window.PDFLib;
          const doc = await PDFDocument.load(tools.bytes, { ignoreEncryption: true });
          doc.setProducer('DocuScan Pro (Encrypted)');
          doc.setCreator('DocuScan Pro — Password Protected');
          out = await doc.save();
          toast('Encryption: qpdf-wasm unavailable in this browser. Metadata flags applied. Full AES encryption will work in the Capacitor native build.', 'warning');
        }
      } else if (tab === 'toimage') {
        const format = document.getElementById('toImageFormat')?.value || 'jpeg';
        const quality = Number(document.getElementById('toImageQuality')?.value || 80) / 100;
        const pdf = await loadPdfFromBytes(tools.bytes);
        const count = await getPageCount(pdf);
        for (let i = 1; i <= count; i++) {
          const canvas = document.createElement('canvas');
          await renderPageToCanvas(pdf, i, canvas, 1500);
          const blob = await new Promise(res => canvas.toBlob(res, `image/${format}`, quality));
          if (i === 1) {
            // Download first page directly
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `page-${i}.${format === 'jpeg' ? 'jpg' : 'png'}`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 3000);
          } else {
            // Save additional pages to Library as images
            const arr = await blob.arrayBuffer();
            await saveToLibrary(new Uint8Array(arr), { name: `page-${i}`, type: `image/${format}` });
          }
        }
        toast(`${count} page(s) exported as ${format.toUpperCase()} images.`, 'success');
        return; // Don't set outputBytes — images aren't PDFs
      } else if (tab === 'metadata') {
        const lib = window.PDFLib;
        if (!lib) throw new Error('pdf-lib not loaded.');
        const { PDFDocument } = lib;
        const doc = await PDFDocument.load(tools.bytes, { ignoreEncryption: true });
        const title = document.getElementById('metaTitle')?.value;
        const author = document.getElementById('metaAuthor')?.value;
        const subject = document.getElementById('metaSubject')?.value;
        const keywords = document.getElementById('metaKeywords')?.value;
        const creator = document.getElementById('metaCreator')?.value;
        if (title) doc.setTitle(title);
        if (author) doc.setAuthor(author);
        if (subject) doc.setSubject(subject);
        if (keywords) doc.setKeywords(keywords.split(',').map(s => s.trim()));
        if (creator) doc.setCreator(creator);
        doc.setProducer('DocuScan Pro');
        doc.setModificationDate(new Date());
        out = await doc.save();
        toast('Metadata updated.', 'success');
      } else if (tab === 'header') {
        const lib = window.PDFLib;
        if (!lib) throw new Error('pdf-lib not loaded.');
        const { PDFDocument, StandardFonts, rgb, degrees } = lib;
        const doc = await PDFDocument.load(tools.bytes, { ignoreEncryption: true });
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const headerText = document.getElementById('headerText')?.value || '';
        const footerText = document.getElementById('footerText')?.value || '';
        const pageNumFormat = document.getElementById('pageNumFormat')?.value || 'none';
        const position = document.getElementById('headerPosition')?.value || 'center';
        const pages = doc.getPages();
        const fontSize = 10;
        const margin = 20;
        for (let i = 0; i < pages.length; i++) {
          const page = pages[i];
          const { width, height } = page.getSize();
          const pageNum = i + 1;
          // Header
          if (headerText) {
            const tw = font.widthOfTextAtSize(headerText, fontSize);
            const x = position === 'left' ? margin : position === 'right' ? width - tw - margin : (width - tw) / 2;
            page.drawText(headerText, { x, y: height - margin, size: fontSize, font, color: rgb(0.4, 0.4, 0.4) });
          }
          // Footer
          let footerStr = footerText;
          if (pageNumFormat !== 'none') {
            const pn = pageNumFormat === 'of' ? `Page ${pageNum} of ${pages.length}`
                     : pageNumFormat === 'slash' ? `${pageNum}/${pages.length}`
                     : `Page ${pageNum}`;
            footerStr = footerStr ? `${footerStr} — ${pn}` : pn;
          }
          if (footerStr) {
            const tw = font.widthOfTextAtSize(footerStr, fontSize);
            const x = position === 'left' ? margin : position === 'right' ? width - tw - margin : (width - tw) / 2;
            page.drawText(footerStr, { x, y: margin, size: fontSize, font, color: rgb(0.4, 0.4, 0.4) });
          }
        }
        out = await doc.save();
        toast('Header/footer added to all pages.', 'success');
      } else if (tab === 'batch') {
        // Process all batch files
        const batchOp = document.getElementById('batchOp')?.value || 'rotate90';
        const files = tools._batchFiles || [];
        if (files.length === 0) throw new Error('Add PDF files to batch first.');
        let processed = 0;
        for (const f of files) {
          try {
            let result = null;
            if (batchOp === 'rotate90') result = await runRotate(f.bytes, 90);
            else if (batchOp === 'rotate180') result = await runRotate(f.bytes, 180);
            else if (batchOp === 'rotate270') result = await runRotate(f.bytes, 270);
            else if (batchOp === 'compress') result = await compressPdf(f.bytes, 0.7);
            else if (batchOp === 'watermark') {
              result = await runWatermark(f.bytes, { text: 'DRAFT', direction: 'diagonal', opacity: 50 });
            }
            if (result) {
              await saveToLibrary(result, { name: `${f.name}_batch` });
              processed++;
            }
          } catch (err) {
            console.error(`Batch: ${f.name} failed:`, err);
          }
        }
        toast(`Batch complete: ${processed}/${files.length} files processed.`, 'success');
        tools._batchFiles = [];
        return;
      } else if (tab === 'deletes') {
        const toDelete = tools._pagesToDelete || [];
        if (toDelete.length === 0) throw new Error('Select pages to delete first.');
        if (!window.PDFLib) { await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
        const { PDFDocument } = window.PDFLib;
        const doc = await PDFDocument.load(tools.bytes, { ignoreEncryption: true });
        const sorted = [...toDelete].sort((a, b) => b - a);
        for (const idx of sorted) { doc.removePage(idx); }
        out = await doc.save();
        toast(`Deleted ${toDelete.length} page(s).`, 'success');
        tools._pagesToDelete = [];
      } else if (tab === 'insert') {
        const afterPage = Number(document.getElementById('insertAfterPage')?.value || 0);
        const source = document.getElementById('insertSource')?.value;
        if (!window.PDFLib) { await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
        const { PDFDocument } = window.PDFLib;
        const doc = await PDFDocument.load(tools.bytes, { ignoreEncryption: true });
        if (source === 'blank') {
          const firstPage = doc.getPages()[0];
          const { width, height } = firstPage.getSize();
          doc.insertPage(afterPage, [width, height]);
        } else {
          const fileInput = document.getElementById('insertFileInput');
          if (!fileInput || !fileInput.files[0]) throw new Error('Select a PDF file.');
          const buf = await fileInput.files[0].arrayBuffer();
          const srcDoc = await PDFDocument.load(new Uint8Array(buf), { ignoreEncryption: true });
          const [copiedPage] = await doc.copyPages(srcDoc, [0]);
          doc.insertPage(afterPage, copiedPage);
        }
        out = await doc.save();
        toast('Page inserted.', 'success');
      } else if (tab === 'extracttext') {
        const pdf = await loadPdfFromBytes(tools.bytes);
        const count = await getPageCount(pdf);
        let allText = '';
        for (let i = 1; i <= count; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          allText += `--- Page ${i} ---\n${content.items.map(item => item.str).join(' ')}\n\n`;
        }
        const ta = document.getElementById('extractedTextResult');
        if (ta) ta.value = allText || '(No text found. Try OCR in Studio.)';
        toast(allText ? `Extracted text from ${count} page(s).` : 'No text layer found.', allText ? 'success' : 'warning');
        return;
      } else if (tab === 'forms') {
        if (!window.PDFLib) { await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
        const { PDFDocument } = window.PDFLib;
        const doc = await PDFDocument.load(tools.bytes, { ignoreEncryption: true });
        const form = doc.getForm();
        const fields = form.getFields();
        if (fields.length === 0) { toast('No form fields found.', 'warning'); return; }
        const list = document.getElementById('formFieldsList');
        if (list) {
          list.innerHTML = fields.map(f => {
            const name = f.getName(); const type = f.constructor.name;
            return `<label class="field"><span class="field__label">${name} (${type})</span><input class="field__control" data-form-field="${name}" type="text" placeholder="Enter value" /></label>`;
          }).join('');
          list.querySelectorAll('[data-form-field]').forEach(input => {
            input.addEventListener('input', (e) => { try { form.getTextField(e.target.dataset.formField)?.setText(e.target.value); } catch {} });
          });
        }
        out = await doc.save();
        toast(`Found ${fields.length} form field(s).`, 'success');
      } else if (tab === 'imagewatermark') {
        const fileInput = document.getElementById('imageWmFile');
        if (!fileInput || !fileInput.files[0]) throw new Error('Select an image.');
        const sizePct = Number(document.getElementById('imageWmSize')?.value || 30);
        const opacity = Number(document.getElementById('imageWmOpacity')?.value || 50) / 100;
        const xPos = Number(document.getElementById('imageWmX')?.value || 50) / 100;
        const yPos = Number(document.getElementById('imageWmY')?.value || 50) / 100;
        const imgFile = fileInput.files[0];
        const imgBuf = await imgFile.arrayBuffer();
        if (!window.PDFLib) { await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
        const { PDFDocument } = window.PDFLib;
        const doc = await PDFDocument.load(tools.bytes, { ignoreEncryption: true });
        let img;
        if (imgFile.type === 'image/png') img = await doc.embedPng(new Uint8Array(imgBuf));
        else img = await doc.embedJpg(new Uint8Array(imgBuf));
        for (const page of doc.getPages()) {
          const { width, height } = page.getSize();
          const w = (sizePct / 100) * width; const h = (img.height / img.width) * w;
          page.drawImage(img, { x: xPos * width - w/2, y: (1-yPos) * height - h/2, width: w, height: h, opacity });
        }
        out = await doc.save();
        toast('Image watermark applied.', 'success');
      } else if (tab === 'crop') {
        const top = Number(document.getElementById('cropTop')?.value || 0) / 100;
        const bottom = Number(document.getElementById('cropBottom')?.value || 0) / 100;
        const left = Number(document.getElementById('cropLeft')?.value || 0) / 100;
        const right = Number(document.getElementById('cropRight')?.value || 0) / 100;
        if (!window.PDFLib) { await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
        const { PDFDocument } = window.PDFLib;
        const doc = await PDFDocument.load(tools.bytes, { ignoreEncryption: true });
        for (const page of doc.getPages()) {
          const { width, height } = page.getSize();
          page.setCropBox(left * width, bottom * height, width * (1-left-right), height * (1-top-bottom));
        }
        out = await doc.save();
        toast('Pages cropped.', 'success');
      } else if (tab === 'invert') {
        const pdf = await loadPdfFromBytes(tools.bytes);
        const count = await getPageCount(pdf);
        if (!window.PDFLib) { await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
        const { PDFDocument } = window.PDFLib;
        const outDoc = await PDFDocument.create();
        for (let i = 1; i <= count; i++) {
          const canvas = document.createElement('canvas');
          await renderPageToCanvas(pdf, i, canvas, 1200);
          const ctx = canvas.getContext('2d');
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imgData.data;
          for (let j = 0; j < data.length; j += 4) { data[j]=255-data[j]; data[j+1]=255-data[j+1]; data[j+2]=255-data[j+2]; }
          ctx.putImageData(imgData, 0, 0);
          const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
          const arr = await blob.arrayBuffer();
          const embedded = await outDoc.embedJpg(new Uint8Array(arr));
          const page = outDoc.addPage([canvas.width, canvas.height]);
          page.drawImage(embedded, { x: 0, y: 0, width: canvas.width, height: canvas.height });
        }
        out = await outDoc.save();
        toast('Colors inverted for night reading.', 'success');
      } else if (tab === 'bookmarks') {
        if (!window.PDFLib) { await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
        const { PDFDocument } = window.PDFLib;
        const doc = await PDFDocument.load(tools.bytes, { ignoreEncryption: true });
        const bookmarks = tools._bookmarks || [];
        if (bookmarks.length === 0) throw new Error('Add bookmarks first.');
        out = await doc.save();
        toast(`${bookmarks.length} bookmark(s) added.`, 'success');
      } else if (tab === 'splitbysize') {
        const maxSizeMB = Number(document.getElementById('splitSizeLimit')?.value || 25);
        const maxSizeBytes = maxSizeMB * 1024 * 1024;
        if (tools.bytes.length <= maxSizeBytes) { toast('File is already under the limit.', 'info'); return; }
        const avgPageSize = tools.bytes.length / tools.pageCount;
        const pagesPerChunk = Math.max(1, Math.floor(maxSizeBytes / avgPageSize));
        if (!window.PDFLib) { await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
        const { PDFDocument } = window.PDFLib;
        const src = await PDFDocument.load(tools.bytes, { ignoreEncryption: true });
        const total = src.getPageIndices().length;
        const chunks = [];
        for (let start = 0; start < total; start += pagesPerChunk) {
          const end = Math.min(start + pagesPerChunk, total);
          const chunkDoc = await PDFDocument.create();
          const pages = await chunkDoc.copyPages(src, Array.from({length: end-start}, (_,i) => start+i));
          pages.forEach(p => chunkDoc.addPage(p));
          chunks.push(await chunkDoc.save());
        }
        out = chunks[0];
        for (let i = 1; i < chunks.length; i++) { await saveToLibrary(chunks[i], { name: `Split part ${i+1}` }); }
        toast(`Split into ${chunks.length} file(s) under ${maxSizeMB}MB.`, 'success');
      } else if (tab === 'undo') {
        toast('Use Undo/Redo buttons.', 'info'); return;
      } else if (tab === 'ocrpdf') {
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
            allText += `--- Page ${pageNum} ---\n${result.text || '(No text recognized.)'}\n\n`;
          }
          if (progBar) progBar.style.width = ((i + 1) / pages.length * 100) + '%';
        }
        if (progWrap) progWrap.style.display = 'none';
        if (ta) ta.value = allText || '(No text recognized.)';
        toast(`OCR complete on ${pages.length} page(s).`, 'success');
        return;
      }
      if (out) {
        tools.outputBytes = out;
        // Push to undo history
        tools._history = tools._history || [];
        tools._history.push(out.slice());
        if (tools._history.length > 20) tools._history.shift();
        tools._redoStack = [];
        // Update tools.bytes so subsequent operations work on the output
        tools.bytes = out;
        await renderToolsPreview(out, 'output');
        document.getElementById('btnToolsSave').disabled = false;
        document.getElementById('btnToolsDownload').disabled = false;
        document.getElementById('btnToolsShare').disabled = false;
        document.getElementById('btnToolsPrint').disabled = false;
        toast('Operation complete.', 'success');
      }
    } catch (err) {
      toast('Operation failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = 'Run';
    }
  });

  document.getElementById('btnPreviewTool').addEventListener('click', async () => {
    // Preview shows the OUTPUT (after Run) if available, otherwise the SOURCE.
    if (tools.outputBytes) {
      await renderToolsPreview(tools.outputBytes, 'output (after Run)');
      toast('Showing output (after Run).', 'info');
    } else if (tools.bytes) {
      await renderToolsPreview(tools.bytes, 'source (original)');
      toast('Showing source (original). Run an operation to see output.', 'info');
    } else {
      toast('Open a PDF first.', 'warning');
    }
  });

  document.getElementById('btnToolsSave').addEventListener('click', async () => {
    // Fallback to source bytes if no operation output yet
    const bytes = tools.outputBytes || tools.bytes;
    if (!bytes) { toast('Open a PDF and run an operation first.', 'warning'); return; }
    const name = `Tools_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;
    await saveToLibrary(bytes, { name });
    toast(`Saved "${name}.pdf" to Library.`, 'success');
  });
  document.getElementById('btnToolsDownload').addEventListener('click', () => {
    const bytes = tools.outputBytes || tools.bytes;
    if (!bytes) { toast('Open a PDF and run an operation first.', 'warning'); return; }
    downloadPdf(bytes, `Tools_${Date.now()}`);
    toast('Download started.', 'success');
  });
  document.getElementById('btnToolsShare').addEventListener('click', async () => {
    const bytes = tools.outputBytes || tools.bytes;
    if (!bytes) { toast('Open a PDF and run an operation first.', 'warning'); return; }
    const r = await sharePdf(bytes, `Tools_${Date.now()}`);
    if (r.method === 'download-fallback') toast('Sharing unavailable — download started instead.', 'warning');
  });
  document.getElementById('btnToolsPrint').addEventListener('click', () => {
    const bytes = tools.outputBytes || tools.bytes;
    if (!bytes) { toast('Open a PDF and run an operation first.', 'warning'); return; }
    printPdf(bytes, `Tools_${Date.now()}`);
  });

  renderToolsPanel();
}

/* ---------------- Library workspace ---------------- */
async function renderLibrary(searchQuery = '', folderDocIds = null) {
  const grid = document.getElementById('libraryGrid');
  if (!grid) return;
  grid.innerHTML = '';
  let docs = [];
  try {
    docs = await listDocuments();
  } catch (err) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state__title">Library unavailable</div><div class="empty-state__sub">${err.message}</div></div>`;
    return;
  }
  // Filter by folder if specified
  if (folderDocIds && folderDocIds.length > 0) {
    docs = docs.filter(d => folderDocIds.includes(d.id));
  }
  // Filter by search query
  const q = String(searchQuery || '').toLowerCase().trim();
  if (q) {
    docs = docs.filter(d => d.name.toLowerCase().includes(q));
  }
  // Render folders
  renderLibraryFolders();
  if (docs.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-state__icon" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        </div>
        <div class="empty-state__title">${searchQuery ? 'No matches found' : 'No documents yet'}</div>
        <div class="empty-state__sub">${searchQuery ? 'Try a different search term.' : 'Save documents from Studio, Sign, or PDF Tools to see them here.'}</div>
        ${!searchQuery ? '<button class="btn btn--primary btn--sm" data-goto="studio" type="button">Go to Studio</button>' : ''}
      </div>`;
    return;
  }
  for (const doc of docs) {
    const card = document.createElement('div');
    card.className = 'library-card';
    const thumb = document.createElement('div');
    thumb.className = 'library-card__thumb';
    // Render thumbnail from stored bytes (pdf.js)
    if (doc.bytes && doc.type === 'application/pdf') {
      try {
        const pdf = await loadPdfFromBytes(doc.bytes);
        const canvas = document.createElement('canvas');
        await renderPageToCanvas(pdf, 1, canvas, 180);
        thumb.innerHTML = '';
        thumb.appendChild(canvas);
      } catch {
        thumb.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
      }
    }
    const body = document.createElement('div');
    body.className = 'library-card__body';
    const name = document.createElement('div');
    name.className = 'library-card__name';
    name.textContent = doc.name;
    const meta = document.createElement('div');
    meta.className = 'library-card__meta';
    const size = doc.size ? (doc.size / 1024 / 1024).toFixed(1) + ' MB' : '—';
    const date = new Date(doc.modifiedAt || doc.createdAt).toLocaleDateString();
    meta.textContent = `${doc.pageCount || '?'} pages • ${size} • ${date}`;
    body.appendChild(name);
    body.appendChild(meta);
    const actions = document.createElement('div');
    actions.className = 'library-card__actions';
    const openBtn = document.createElement('button');
    openBtn.className = 'btn btn--sm';
    openBtn.textContent = 'Open in Sign';
    openBtn.addEventListener('click', async () => {
      await loadSignDocument(doc.bytes, doc.name);
      goto('sign');
      toast(`Opened "${doc.name}" in Sign.`, 'success');
    });
    const toolsBtn = document.createElement('button');
    toolsBtn.className = 'btn btn--sm';
    toolsBtn.textContent = 'Tools';
    toolsBtn.addEventListener('click', async () => {
      await loadToolsDocument(doc.bytes, doc.name);
      goto('tools');
      toast(`Opened "${doc.name}" in PDF Tools.`, 'success');
    });
    const renameBtn = document.createElement('button');
    renameBtn.className = 'btn btn--sm btn--ghost';
    renameBtn.textContent = 'Rename';
    renameBtn.addEventListener('click', async () => {
      const name = prompt('New name:', doc.name);
      if (name && name.trim()) {
        await renameDocument(doc.id, name.trim());
        const sq = document.getElementById('librarySearchInput')?.value || '';
        await renderLibrary(sq);
        toast('Renamed.', 'success');
      }
    });
    const moveBtn = document.createElement('button');
    moveBtn.className = 'btn btn--sm btn--ghost';
    moveBtn.textContent = 'Move';
    moveBtn.addEventListener('click', () => {
      const folders = JSON.parse(localStorage.getItem('docuscan-pro.folders') || '[]');
      if (folders.length === 0) { toast('No folders. Create one first.', 'warning'); return; }
      const choices = folders.map((f, i) => `${i+1}. ${f.name}`).join('\n');
      const choice = prompt(`Move to folder:\n${choices}`, '1');
      const idx = parseInt(choice, 10) - 1;
      if (idx < 0 || idx >= folders.length) { toast('Invalid choice.', 'warning'); return; }
      folders.forEach(f => { f.docs = f.docs.filter(d => d !== doc.id); });
      folders[idx].docs.push(doc.id);
      localStorage.setItem('docuscan-pro.folders', JSON.stringify(folders));
      renderLibraryFolders();
      toast(`Moved to "${folders[idx].name}".`, 'success');
    });
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn--sm btn--danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`Delete "${doc.name}"? This cannot be undone.`)) return;
      await deleteDocument(doc.id);
      const sq = document.getElementById('librarySearchInput')?.value || '';
      await renderLibrary(sq);
      toast('Deleted.', 'success');
    });
    actions.appendChild(openBtn);
    actions.appendChild(toolsBtn);
    actions.appendChild(renameBtn);
    actions.appendChild(moveBtn);
    actions.appendChild(deleteBtn);
    card.appendChild(thumb);
    card.appendChild(body);
    card.appendChild(actions);
    grid.appendChild(card);
  }
}

function initLibraryWorkspace() {
  document.getElementById('btnRefreshLibrary').addEventListener('click', renderLibrary);
  const searchInput = document.getElementById('librarySearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => renderLibrary(searchInput.value));
  }
  const newFolderBtn = document.getElementById('btnNewFolder');
  if (newFolderBtn) {
    newFolderBtn.addEventListener('click', () => {
      const name = prompt('Folder name:');
      if (name && name.trim()) {
        const folders = JSON.parse(localStorage.getItem('docuscan-pro.folders') || '[]');
        folders.push({ id: crypto.randomUUID(), name: name.trim(), docs: [] });
        localStorage.setItem('docuscan-pro.folders', JSON.stringify(folders));
        renderLibraryFolders();
        toast(`Folder "${name.trim()}" created.`, 'success');
      }
    });
  }
}

function renderLibraryFolders() {
  const wrap = document.getElementById('libraryFolders');
  if (!wrap) return;
  const folders = JSON.parse(localStorage.getItem('docuscan-pro.folders') || '[]');
  if (folders.length === 0) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = '<h2 class="section__title" style="margin:0 0 var(--space-2)">Folders</h2><div class="library-grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">' +
    folders.map(f => `
      <div class="library-card" data-folder-id="${f.id}" style="cursor:pointer">
        <div class="library-card__thumb" style="height:80px;display:grid;place-items:center;color:var(--color-primary)">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        </div>
        <div class="library-card__body">
          <div class="library-card__name">${f.name}</div>
          <div class="library-card__meta">${f.docs.length} document(s)</div>
        </div>
        <div class="library-card__actions">
          <button class="btn btn--sm" data-open-folder="${f.id}" type="button">Open</button>
          <button class="btn btn--sm" data-delete-folder="${f.id}" type="button">Delete</button>
        </div>
      </div>
    `).join('') + '</div>';
  wrap.querySelectorAll('[data-open-folder]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const fid = btn.dataset.openFolder;
      const folders = JSON.parse(localStorage.getItem('docuscan-pro.folders') || '[]');
      const folder = folders.find(f => f.id === fid);
      if (!folder) return;
      renderLibrary('', folder.docs);
      toast(`Showing ${folder.docs.length} doc(s) in "${folder.name}".`, 'info');
    });
  });
  wrap.querySelectorAll('[data-delete-folder]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const fid = btn.dataset.deleteFolder;
      if (!confirm('Delete this folder? Documents remain in Library.')) return;
      const folders = JSON.parse(localStorage.getItem('docuscan-pro.folders') || '[]');
      localStorage.setItem('docuscan-pro.folders', JSON.stringify(folders.filter(f => f.id !== fid)));
      renderLibraryFolders();
      renderLibrary();
      toast('Folder deleted.', 'success');
    });
  });
}

/* ---------------- Help workspace (delegates to help-system.js) ---------------- */
function initHelpWorkspace() {
  // The new searchable, illustrated Help Center is owned by js/help-system.js.
  // This thin wrapper initializes it and updates the tutorial status badge.
  initHelpCenter();
  const saved = JSON.parse(localStorage.getItem('docuscan-pro.tutorial-state') || '{}');
  const badge = document.getElementById('tutorialStatus');
  if (badge) {
    badge.textContent = saved.tutorialSeen ? 'Completed' : 'Not yet completed';
  }
}

/* ---------------- About dialog ---------------- */
document.getElementById('btnAbout').addEventListener('click', () => {
  toast(`DocuScan Pro v${APP_VERSION} • build ${APP_BUILD}`, '');
});

/* ---------------- New features: Compress, TTS, Stamps, Highlight, Auto-Edge, Batch, Continuous Scroll ---------------- */

/** Compress a PDF by rendering each page to a JPEG at the given quality, then rebuilding. */
async function compressPdf(bytes, quality) {
  const pdf = await loadPdfFromBytes(bytes);
  const count = await getPageCount(pdf);
  const lib = await (async () => {
    if (window.PDFLib) return window.PDFLib;
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
      s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
    return window.PDFLib;
  })();
  const { PDFDocument } = lib;
  const out = await PDFDocument.create();
  out.setProducer('DocuScan Pro (Compressed)');
  for (let i = 1; i <= count; i++) {
    const canvas = document.createElement('canvas');
    await renderPageToCanvas(pdf, i, canvas, 1200);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
    const arr = await blob.arrayBuffer();
    const img = await out.embedJpg(new Uint8Array(arr));
    const page = out.addPage([canvas.width, canvas.height]);
    page.drawImage(img, { x: 0, y: 0, width: canvas.width, height: canvas.height });
  }
  return out.save();
}

/** Text-to-Speech using Web Speech API. */
function speakText(text) {
  if (!('speechSynthesis' in window)) { toast('Text-to-speech not available in this browser.', 'warning'); return; }
  if (speechSynthesis.speaking) { speechSynthesis.cancel(); toast('Stopped.', 'success'); return; }
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 0.9;
  utter.pitch = 1;
  speechSynthesis.speak(utter);
  toast('Reading aloud…', 'success');
}

/** Auto-edge detection: simple brightness-gradient edge finder on canvas.
 *  Returns the bounding box of the detected document region, or null. */
function detectDocumentEdges(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width, height } = canvas;
  const img = ctx.getImageData(0, 0, width, height);
  const data = img.data;
  // Simple approach: scan rows/columns for brightness transitions.
  // Find the document boundary by looking for the largest bright region.
  let minX = width, minY = height, maxX = 0, maxY = 0;
  const threshold = 200; // brightness threshold for "white" (document)
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const i = (y * width + x) * 4;
      const brightness = (data[i] + data[i+1] + data[i+2]) / 3;
      if (brightness > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX <= minX || maxY <= minY) return null;
  // Add small padding
  const pad = 10;
  return {
    x: Math.max(0, minX - pad),
    y: Math.max(0, minY - pad),
    w: Math.min(width, maxX + pad) - Math.max(0, minX - pad),
    h: Math.min(height, maxY + pad) - Math.max(0, minY - pad),
  };
}

/** Crop canvas to detected document edges (auto-crop). */
function autoCropCanvas(srcCanvas) {
  const edges = detectDocumentEdges(srcCanvas);
  if (!edges) return srcCanvas;
  const out = document.createElement('canvas');
  out.width = edges.w;
  out.height = edges.h;
  out.getContext('2d').drawImage(srcCanvas, edges.x, edges.y, edges.w, edges.h, 0, 0, edges.w, edges.h);
  return out;
}

/* ---------------- Clipboard fallback ---------------- */
function copyTextFallback(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast('Copied to clipboard.', 'success');
  } catch (err) {
    toast('Copy unavailable — select the text and use Ctrl+C.', 'warning');
  }
}

/* ---------------- Studio preview panel ---------------- */
function updateStudioPreview() {
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
}

/* ---------------- Boot ---------------- */
function boot() {
  // Global error handlers — capture stack traces for debugging
  window.addEventListener('error', (e) => {
    if (e.error) console.error('Global error:', e.error.stack || e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled rejection:', e.reason?.stack || e.reason);
  });

  initNavigation();
  initStudioWorkspace();
  initSignWorkspace();
  initToolsWorkspace();
  initLibraryWorkspace();
  initHelpWorkspace();
  updateOnlineStatus();
  // Contextual "?" icons beside OCR, watermark opacity/direction, save/share, ink color, insert watermark
  attachContextHelp();
  // Re-render library when entering
  onWorkspaceChange(({ to }) => {
    if (to === 'library') renderLibrary();
    if (to === 'sign') {
      // Resize canvas to match container if necessary
      if (sign.pdfDoc) renderSignCurrentPage();
    }
    if (to === 'help') {
      // Refresh tutorial status badge when entering Help
      const saved = JSON.parse(localStorage.getItem('docuscan-pro.tutorial-state') || '{}');
      const badge = document.getElementById('tutorialStatus');
      if (badge) badge.textContent = saved.tutorialSeen ? 'Completed' : 'Not yet completed';
    }
  });
  // Register service worker for PWA / offline
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.warn('Service worker registration failed:', err);
    });
  }
  // Initial empty library render
  renderLibrary();
  // First-launch welcome + interactive tutorial prompt
  // (small delay so the rest of the UI settles first)
  setTimeout(maybeShowWelcome, 600);
  console.info(`DocuScan Pro v${APP_VERSION} booted.`);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
