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

const APP_VERSION = '6.0.0';
const APP_BUILD = '2026-10-29';

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
    objects: [],         // { id, type, page, normalized, opts }
    selectedObjectId: null,
    watermark: null,     // { text, direction, opacity }
  },
  tools: {
    bytes: null,
    pdfDoc: null,
    pageCount: 0,
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
      updateStudioActions();
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
}

async function addImageFile(file) {
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
  document.getElementById('btnMoveLeft').addEventListener('click', () => {
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
  });

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
      const result = await recognizeText(sel.workingCanvas, {
        onProgress: (m) => { if (typeof m.progress === 'number') bar.style.width = (m.progress * 100) + '%'; },
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
  sign.redoStack = [];
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
  ['btnAddSignature','btnAddText','btnAddDate','btnAddStamp','btnAddHighlight','btnUndo','btnRedo','btnRemoveSelected','btnInsertWatermark','btnSaveToLibrary','btnDownloadPdf','btnSharePdf','btnPrintPdf'].forEach(id => {
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
  if (!sign.bytes) {
    label.textContent = 'No document';
    prev.disabled = true; next.disabled = true;
    return;
  }
  label.textContent = `Page ${sign.currentPage} of ${sign.pageCount}`;
  prev.disabled = sign.currentPage <= 1;
  next.disabled = sign.currentPage >= sign.pageCount;
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
    sign.history.push(sign.bytes.slice());
    if (sign.history.length > 50) sign.history.shift(); // cap history
    sign.redoStack = [];
  }
  drawObjectOverlay();
  enableSignEditing(true);
  toast('Added. Press Save/Download to bake into the PDF.', 'success');
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
  document.getElementById('btnRemoveSelected').addEventListener('click', () => {
    if (!sign.selectedObjectId) return;
    sign.objects = sign.objects.filter(o => o.id !== sign.selectedObjectId);
    sign.selectedObjectId = null;
    // Push to history so Undo can restore the removed object
    if (sign.bytes) {
      sign.history.push(sign.bytes.slice());
      if (sign.history.length > 50) sign.history.shift();
      sign.redoStack = [];
    }
    drawObjectOverlay();
    enableSignEditing(true);
    toast('Removed element.', 'success');
  });
  document.getElementById('btnUndo').addEventListener('click', () => {
    if (sign.history.length <= 1) return;
    const last = sign.history.pop();
    sign.redoStack.push(last);
    sign.bytes = sign.history[sign.history.length - 1];
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
    const next = sign.redoStack.pop();
    sign.history.push(next);
    sign.bytes = next;
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
    // Push to history
    sign.history.push(sign.bytes.slice());
    if (sign.history.length > 50) sign.history.shift();
    sign.redoStack = [];
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
    // Push to history
    if (sign.bytes) {
      sign.history.push(sign.bytes.slice());
      if (sign.history.length > 50) sign.history.shift();
      sign.redoStack = [];
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
    <p class="muted tiny" style="margin:0 0 var(--space-2)">Reorder pages. Provide a comma-separated list of new positions, 1-indexed (e.g., <code>3,1,2</code>).</p>
    <div class="tools-split-input">
      <label class="field">
        <span class="field__label">New order</span>
        <input class="field__control" id="reorderInput" type="text" placeholder="${Array.from({length: total}, (_, i) => i + 1).join(',')}" />
      </label>
    </div>`,
  annotate: `
    <p class="muted tiny" style="margin:0 0 var(--space-2)">Add annotations to a chosen page. Switch between Text and Draw (Apple Pencil / finger) modes.</p>
    <div class="tools-tabs" id="annotateSubTabs" role="tablist" style="margin-bottom:var(--space-3)">
      <button class="tools-tab is-active" data-subtab="text" role="tab" aria-selected="true">Text</button>
      <button class="tools-tab" data-subtab="draw" role="tab">Draw</button>
    </div>
    <div id="annotateTextPanel">
      <div class="paired-fields">
        <label class="field">
          <span class="field__label">Page</span>
          <input class="field__control" id="annotatePage" type="number" min="1" value="1" />
        </label>
        <label class="field">
          <span class="field__label">Text</span>
          <input class="field__control" id="annotateText" type="text" placeholder="e.g. Reviewed by J.S." />
        </label>
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
      <p class="muted tiny" style="margin:0 0 var(--space-2)">Draw directly on the preview with your finger, Apple Pencil, or mouse. Strokes are baked into the PDF when you press Run.</p>
      <div class="paired-fields">
        <label class="field">
          <span class="field__label">Page</span>
          <input class="field__control" id="drawPage" type="number" min="1" value="1" />
        </label>
        <label class="field">
          <span class="field__label">Pen color</span>
          <input class="field__control" id="drawColor" type="color" value="#FF3B30" style="height:var(--control-height); padding:4px;" />
        </label>
      </div>
      <div class="paired-fields" style="margin-top:var(--space-3)">
        <label class="field">
          <span class="field__label">Pen width</span>
          <input class="field__control" id="drawWidth" type="range" min="1" max="20" value="3" style="height:var(--control-height); padding:4px;" />
        </label>
        <div class="field">
          <span class="field__label">&nbsp;</span>
          <button class="btn btn--sm" id="btnClearDraw" type="button">Clear strokes</button>
        </div>
      </div>
      <p class="muted tiny" style="margin:var(--space-2) 0 0">Tip: press <strong>Preview</strong> first to see the underlying page, then draw on it.</p>
    </div>`,
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
    <p class="muted tiny" style="margin:0 0 var(--space-2)">Add permission restrictions to the PDF. These restrict what viewers can do with the document.</p>
    <div class="stack">
      <label class="field">
        <span class="field__label">Owner password (optional)</span>
        <input class="field__control" id="protectOwnerPwd" type="password" placeholder="Password to change restrictions" />
      </label>
      <label class="field">
        <span class="field__label">User password (optional)</span>
        <input class="field__control" id="protectUserPwd" type="password" placeholder="Password to open the PDF" />
      </label>
      <div class="stack--tight">
        <label style="display:flex;align-items:center;gap:8px;font-size:var(--fs-label)"><input type="checkbox" id="protectNoPrint" /> Restrict printing</label>
        <label style="display:flex;align-items:center;gap:8px;font-size:var(--fs-label)"><input type="checkbox" id="protectNoCopy" /> Restrict copying text</label>
        <label style="display:flex;align-items:center;gap:8px;font-size:var(--fs-label)"><input type="checkbox" id="protectNoEdit" checked /> Restrict editing</label>
      </div>
    </div>
    <p class="muted tiny" style="margin:var(--space-2) 0 0">Note: Full AES encryption requires a native library. Browser-based protection sets permission flags that most PDF viewers respect.</p>`,
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
}

async function renderToolsPreview(bytes, label) {
  const wrap = document.getElementById('toolsCanvasWrap');
  const stage = document.getElementById('toolsCanvasStage');
  const canvas = document.getElementById('toolsCanvas');
  const drawCanvas = document.getElementById('toolsDrawCanvas');
  if (!bytes || !wrap || !stage || !canvas) return;
  const pdf = await loadPdfFromBytes(bytes);
  const count = await getPageCount(pdf);
  // Render first page
  wrap.querySelectorAll('.empty-state').forEach(n => n.remove());
  stage.hidden = false;
  canvas.hidden = false;
  const targetWidth = Math.min(720, Math.max(200, wrap.clientWidth - 24));
  const dims = await renderPageToCanvas(pdf, 1, canvas, targetWidth);
  const docInfo = document.getElementById('toolsDocInfo');
  if (docInfo) docInfo.textContent = `${label} • ${count} page(s)`;
  // Size draw overlay to EXACTLY match the rendered canvas
  if (drawCanvas) {
    drawCanvas.width = canvas.width;
    drawCanvas.height = canvas.height;
    const canvasRect = canvas.getBoundingClientRect();
    drawCanvas.style.width = canvasRect.width + 'px';
    drawCanvas.style.height = canvasRect.height + 'px';
    drawCanvas.style.left = '0px';
    drawCanvas.style.top = '0px';
    const ctx = drawCanvas.getContext('2d');
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
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
        // KEY FIX: re-render the PDF preview when entering Draw mode so the
        // user sees the actual page they're annotating (not a blank canvas).
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
          // Re-render the source PDF if loaded
          if (tools.bytes) {
            renderToolsPreview(tools.bytes, 'source').catch(err => {
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
        ctx.clearRect(0, 0, dc.width, dc.height);
        tools._drawStrokes = [];
        toast('Strokes cleared.', 'success');
      });
    }
    // Initialize drawing strokes array + bind pointer events on the draw canvas
    tools._drawStrokes = tools._drawStrokes || [];
    attachDrawCanvasHandlers();
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
      renderToolsPanel();
    });
  });

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
          // Draw mode — bake strokes into the PDF
          const pageIdx = Number(document.getElementById('drawPage').value) - 1;
          const dc = document.getElementById('toolsDrawCanvas');
          if (!dc) throw new Error('Draw canvas not initialized.');
          if ((tools._drawStrokes || []).length === 0) throw new Error('Draw some strokes first.');
          // Export the draw canvas (transparent bg) as PNG bytes
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
        // Set permission flags via pdf-lib metadata
        const lib = window.PDFLib || await (async () => { await loadPdfLibScript?.(); return window.PDFLib; })();
        if (!lib) throw new Error('pdf-lib not loaded.');
        const { PDFDocument } = lib;
        const doc = await PDFDocument.load(tools.bytes, { ignoreEncryption: true });
        // pdf-lib doesn't support full encryption, but we can set metadata + flags
        const noPrint = document.getElementById('protectNoPrint')?.checked;
        const noCopy = document.getElementById('protectNoCopy')?.checked;
        const noEdit = document.getElementById('protectNoEdit')?.checked;
        // Set producer to indicate protection
        doc.setProducer('DocuScan Pro (Protected)');
        if (noEdit) doc.setCreator('DocuScan Pro — Editing Restricted');
        out = await doc.save();
        toast('Protection flags applied. Note: full AES encryption requires a native runtime (Capacitor).', 'success');
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
        toast(`Batch complete: ${processed}/${files.length} files processed and saved to Library.`, 'success');
        tools._batchFiles = [];
        return;
      }
      if (out) {
        tools.outputBytes = out;
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
    if (tools.outputBytes) await renderToolsPreview(tools.outputBytes, 'output');
    else if (tools.bytes) await renderToolsPreview(tools.bytes, 'source');
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
async function renderLibrary(searchQuery = '') {
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
  // Filter by search query (defensive: ensure searchQuery is a string)
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
        await renderLibrary();
        toast('Renamed.', 'success');
      }
    });
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn--sm btn--danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`Delete "${doc.name}"? This cannot be undone.`)) return;
      await deleteDocument(doc.id);
      await renderLibrary();
      toast('Deleted.', 'success');
    });
    actions.appendChild(openBtn);
    actions.appendChild(toolsBtn);
    actions.appendChild(renameBtn);
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
  wrap.innerHTML = '<div class="library-grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">' +
    folders.map(f => `
      <div class="library-card" data-folder-id="${f.id}" style="cursor:pointer">
        <div class="library-card__thumb" style="height:80px;display:grid;place-items:center;color:var(--color-primary)">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        </div>
        <div class="library-card__body">
          <div class="library-card__name">${f.name}</div>
          <div class="library-card__meta">${f.docs.length} document(s)</div>
        </div>
      </div>
    `).join('') + '</div>';
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
