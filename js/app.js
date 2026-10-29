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
import { parseRanges, runMerge, runSplit, runRotate, runReorder, runWatermark, runAnnotateText } from './pdf-tools.js';

const APP_VERSION = '5.0.0';
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
    navigator.clipboard.writeText(ocrResult.value).then(() => toast('Copied.', 'success'));
  });
  document.getElementById('btnDownloadOcr').addEventListener('click', () => {
    if (!ocrResult.value) { toast('Nothing to download.', 'warning'); return; }
    const blob = new Blob([ocrResult.value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'recognized-text.txt'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  });

  // Create PDF
  document.getElementById('btnCreatePdf').addEventListener('click', async () => {
    if (studio.pages.length === 0) return;
    const btn = document.getElementById('btnCreatePdf');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Building…';
    try {
      const pageSize = document.getElementById('pdfPageSize').value;
      const orientation = document.getElementById('pdfOrientation').value;
      const bytes = await buildPdfFromCanvases(studio.pages.map(p => p.workingCanvas), { pageSize, orientation });
      const name = `Scan_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;
      // Save to library directly
      await saveToLibrary(bytes, { name, pageCount: studio.pages.length });
      toast(`Saved "${name}.pdf" to Library (${studio.pages.length} pages).`, 'success');
    } catch (err) {
      toast('PDF build failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Create PDF';
    }
  });
  document.getElementById('btnSendToSign').addEventListener('click', async () => {
    if (studio.pages.length === 0) return;
    try {
      const pageSize = document.getElementById('pdfPageSize').value;
      const orientation = document.getElementById('pdfOrientation').value;
      const bytes = await buildPdfFromCanvases(studio.pages.map(p => p.workingCanvas), { pageSize, orientation });
      await loadSignDocument(bytes, `Scan ${new Date().toLocaleDateString()}`);
      goto('sign');
      toast('Sent to Sign workspace.', 'success');
    } catch (err) {
      toast('Failed to build PDF: ' + err.message, 'error');
    }
  });
  document.getElementById('btnSendToTools').addEventListener('click', async () => {
    if (studio.pages.length === 0) return;
    try {
      const pageSize = document.getElementById('pdfPageSize').value;
      const orientation = document.getElementById('pdfOrientation').value;
      const bytes = await buildPdfFromCanvases(studio.pages.map(p => p.workingCanvas), { pageSize, orientation });
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
  signCanvas.hidden = false;
  signDocInfo.textContent = `${name || 'Document'} • ${sign.pageCount} page(s)`;
  document.getElementById('signPdfInput').value = '';
  updateSignPageNav();
  enableSignEditing(true);
  // Watermark controls reflect default state
  updateWatermarkStatus();
  return true;
}

function enableSignEditing(enabled) {
  ['btnAddSignature','btnAddText','btnAddDate','btnUndo','btnRedo','btnRemoveSelected','btnInsertWatermark','btnSaveToLibrary','btnDownloadPdf','btnSharePdf','btnPrintPdf'].forEach(id => {
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
  // Choose target width based on container
  const targetWidth = Math.min(720, signCanvasWrap.clientWidth - 24);
  await renderPageToCanvas(sign.pdfDoc, sign.currentPage, signCanvas, targetWidth);
  drawObjectOverlay();
}

function drawObjectOverlay() {
  // Object overlay rendered onto canvas via redraw each time the underlying
  // pdf.js render completes. For positioning simplicity, we render boxes as
  // DOM elements over the canvas — this avoids corrupting the pdf.js render.
  // Remove existing overlays
  signCanvasWrap.querySelectorAll('.object-overlay').forEach(n => n.remove());
  const wrapRect = signCanvas.getBoundingClientRect();
  sign.objects.filter(o => o.page === sign.currentPage).forEach(o => {
    const box = document.createElement('div');
    box.className = 'object-overlay';
    box.style.position = 'absolute';
    box.style.left = (o.normalized.x * wrapRect.width) + 'px';
    box.style.top = ((1 - o.normalized.y) * wrapRect.height) + 'px';
    box.style.transform = 'translate(-50%, -50%)';
    box.style.padding = '4px 8px';
    box.style.background = o.color || '#1C1C1E';
    box.style.color = '#fff';
    box.style.fontFamily = 'sans-serif';
    box.style.fontSize = Math.max(10, o.size) + 'px';
    box.style.borderRadius = '4px';
    box.style.border = o.id === sign.selectedObjectId ? '2px solid #007AFF' : '1px dashed rgba(255,255,255,0.4)';
    box.style.cursor = 'pointer';
    box.style.userSelect = 'none';
    box.textContent = o.text || (o.type === 'signature' ? '[Signature]' : '[Object]');
    box.addEventListener('click', (e) => {
      e.stopPropagation();
      sign.selectedObjectId = o.id;
      drawObjectOverlay();
      enableSignEditing(true);
    });
    signCanvasWrap.appendChild(box);
  });
}

signCanvasWrap.style.position = 'relative';

signCanvasWrap.addEventListener('click', (e) => {
  // Drop a text element at the clicked location if a text string is staged
  if (!sign.bytes) return;
  if (e.target.closest('.object-overlay')) return;
  const text = document.getElementById('textInput').value.trim();
  if (!text) {
    toast('Type text first, or use the buttons above to add an element.', 'warning');
    return;
  }
  const rect = signCanvasWrap.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
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
  document.getElementById('btnRemoveSelected').addEventListener('click', () => {
    if (!sign.selectedObjectId) return;
    sign.objects = sign.objects.filter(o => o.id !== sign.selectedObjectId);
    sign.selectedObjectId = null;
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

  // Watermark
  document.getElementById('btnInsertWatermark').addEventListener('click', async () => {
    if (!sign.bytes) return;
    const cfg = normalizeConfig({
      text: document.getElementById('wmText').value,
      direction: document.getElementById('wmDirection').value,
      opacity: Number(document.getElementById('wmOpacity').value),
    });
    try {
      // Rebuild the source PDF with watermark applied
      const { doc } = await loadExistingPdf(sign.bytes);
      await insertWatermark(doc, cfg);
      const newBytes = await doc.save();
      sign.watermark = cfg;
      sign.history.push(newBytes.slice());
      sign.redoStack = [];
      sign.bytes = newBytes;
      sign.pdfDoc = await loadPdfFromBytes(sign.bytes);
      await renderSignCurrentPage();
      updateWatermarkStatus();
      enableSignEditing(true);
      toast(`Watermark applied: ${describeWm(cfg)}`, 'success');
    } catch (err) {
      toast('Watermark failed: ' + err.message, 'error');
    }
  });
  document.getElementById('btnRemoveWatermark').addEventListener('click', async () => {
    if (!sign.watermark) return;
    // Rebuild from the original (history[0]) minus watermark — easiest path
    // is to re-bake all current objects onto history[0] without the
    // watermark. For simplicity, we revert to history[0] and re-apply
    // text objects (signatures are not re-applied here).
    sign.bytes = sign.history[0].slice();
    sign.history = [sign.bytes.slice()];
    sign.redoStack = [];
    sign.watermark = null;
    sign.pdfDoc = await loadPdfFromBytes(sign.bytes);
    await renderSignCurrentPage();
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
  if (sign.watermark) {
    badge.style.display = '';
    badge.textContent = 'Watermark applied: ' + describeWm(sign.watermark);
    removeBtn.disabled = false;
  } else {
    badge.style.display = 'none';
    removeBtn.disabled = true;
  }
}

async function commitObjectsToPdf() {
  // Apply all text/signature objects onto the current sign.bytes.
  if (!sign.bytes) return null;
  if (sign.objects.length === 0) return sign.bytes;
  const { doc } = await loadExistingPdf(sign.bytes);
  for (const obj of sign.objects) {
    if (obj.type === 'signature' && obj.pngBytes) {
      await insertImageElement(doc, obj.page - 1, obj.pngBytes, {
        normalized: obj.normalized,
        widthPct: obj.widthPct,
        heightPct: obj.heightPct,
        rotation: 0,
      });
    } else {
      const hex = obj.color || '#000000';
      const rgb = rgbFromHex(hex);
      await insertTextElement(doc, obj.page - 1, {
        text: obj.text || '',
        normalized: obj.normalized,
        size: obj.size || 14,
        fontFamily: obj.fontFamily || 'Helvetica',
        color: rgb,
        rotation: 0,
      });
    }
  }
  // If watermark should be re-applied, re-apply it
  if (sign.watermark) {
    await insertWatermark(doc, sign.watermark);
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
    <p class="muted tiny" style="margin:0 0 var(--space-2)">Add a text annotation to the chosen page.</p>
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
  await renderToolsPreview(bytes, 'source');
  renderToolsPanel();
  return true;
}

async function renderToolsPreview(bytes, label) {
  const wrap = document.getElementById('toolsCanvasWrap');
  const canvas = document.getElementById('toolsCanvas');
  if (!bytes) return;
  const pdf = await loadPdfFromBytes(bytes);
  const count = await getPageCount(pdf);
  // Render first page
  wrap.querySelectorAll('.empty-state').forEach(n => n.remove());
  canvas.hidden = false;
  const targetWidth = Math.min(720, wrap.clientWidth - 24);
  await renderPageToCanvas(pdf, 1, canvas, targetWidth);
  document.getElementById('toolsDocInfo').textContent = `${label} • ${count} page(s)`;
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
        const pageIdx = Number(document.getElementById('annotatePage').value) - 1;
        const text = document.getElementById('annotateText').value;
        const x = Number(document.getElementById('annotateX').value) / 100;
        const y = Number(document.getElementById('annotateY').value) / 100;
        if (!text) throw new Error('Enter annotation text.');
        out = await runAnnotateText(tools.bytes, pageIdx, {
          text, normalized: { x, y }, size: 14, fontFamily: 'Helvetica', color: { r: 0.7, g: 0.1, b: 0.1 }, rotation: 0,
        });
      } else if (tab === 'watermark') {
        const cfg = normalizeConfig({
          text: document.getElementById('twmText').value,
          direction: document.getElementById('twmDirection').value,
          opacity: Number(document.getElementById('twmOpacity').value),
        });
        out = await runWatermark(tools.bytes, cfg);
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
    if (!tools.outputBytes) return;
    const name = `Tools_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;
    await saveToLibrary(tools.outputBytes, { name });
    toast(`Saved "${name}.pdf" to Library.`, 'success');
  });
  document.getElementById('btnToolsDownload').addEventListener('click', () => {
    if (!tools.outputBytes) return;
    downloadPdf(tools.outputBytes, `Tools_${Date.now()}`);
    toast('Download started.', 'success');
  });
  document.getElementById('btnToolsShare').addEventListener('click', async () => {
    if (!tools.outputBytes) return;
    const r = await sharePdf(tools.outputBytes, `Tools_${Date.now()}`);
    if (r.method === 'download-fallback') toast('Sharing unavailable — download started instead.', 'warning');
  });
  document.getElementById('btnToolsPrint').addEventListener('click', () => {
    if (!tools.outputBytes) return;
    printPdf(tools.outputBytes, `Tools_${Date.now()}`);
  });

  renderToolsPanel();
}

/* ---------------- Library workspace ---------------- */
async function renderLibrary() {
  const grid = document.getElementById('libraryGrid');
  grid.innerHTML = '';
  let docs = [];
  try {
    docs = await listDocuments();
  } catch (err) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state__title">Library unavailable</div><div class="empty-state__sub">${err.message}</div></div>`;
    return;
  }
  if (docs.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-state__icon" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        </div>
        <div class="empty-state__title">No documents yet</div>
        <div class="empty-state__sub">Save documents from Studio, Sign, or PDF Tools to see them here.</div>
        <button class="btn btn--primary btn--sm" data-goto="studio" type="button">Go to Studio</button>
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
}

/* ---------------- Help workspace ---------------- */
const HELP_ITEMS = [
  {
    title: 'Getting started',
    body: `<p>DocuScan Pro is a Progressive Web App for scanning, editing, signing, and exporting PDFs. Use the bottom navigation to switch between Home, Studio, Sign, PDF Tools, Library, and Help.</p>
<p>Documents are stored locally in your browser (IndexedDB). Clearing site data will remove saved documents.</p>`
  },
  {
    title: 'Scanning documents',
    body: `<p>In <strong>Studio</strong>, tap "Capture with camera" to use your device's camera. You can capture multiple pages in sequence. If the camera is unavailable or permission is denied, the file picker is offered as a fallback.</p>
<p>Use "Import images" to add existing photos from your device.</p>`
  },
  {
    title: 'Enhancing images',
    body: `<p>Select a thumbnail in Studio, then choose a preset (Auto, Grayscale, B&amp;W, Brighten, Contrast+) and optionally adjust Brightness and Contrast sliders. Tap "Apply to selected page" to commit the changes.</p>
<p>The original image is preserved — tap "Reset" to restore it.</p>`
  },
  {
    title: 'OCR (text recognition)',
    body: `<p>Tap "Run OCR" on a selected page. The first run may take a few seconds longer while the OCR engine initializes. Recognized text appears in the textarea below and can be copied or downloaded as a .txt file.</p>
<p>OCR works best on sharp, high-contrast scans of printed text. Handwriting and low-resolution images will produce lower-quality results.</p>`
  },
  {
    title: 'Creating PDFs',
    body: `<p>Choose a page size (Letter, A4, or Fit-to-image) and orientation. Tap "Create PDF" to save the result to your Library, or use "Send to Sign" / "Send to PDF Tools" to continue working.</p>`
  },
  {
    title: 'Adding signatures',
    body: `<p>In <strong>Sign</strong>, open a PDF, then tap "Signature". You can draw a signature with your finger or stylus, or type your name in a chosen font. The signature is placed at the center of the current page; tap a different location to drop text directly there.</p>
<p>Use the Width and Height fields to control signature size as a percentage of the page.</p>`
  },
  {
    title: 'Adding text and dates',
    body: `<p>Type into the "Text / typed signature" field, or pick a Quick Text Template. Tap "Text" to insert at the page center, or "Date" to insert today's date near the bottom of the page.</p>
<p>Adjust Font style, Font size, and Ink color before inserting.</p>`
  },
  {
    title: 'Using watermarks',
    body: `<p>Configure the watermark text, direction (Diagonal or Horizontal), and opacity. Tap "Insert" to apply across all pages. The displayed opacity value matches the actual opacity baked into the PDF.</p>
<p>Use "Remove watermark" to revert to the unmarked source.</p>`
  },
  {
    title: 'PDF Tools',
    body: `<p>Open a PDF, then choose an operation: Merge (with a second PDF), Split (by ranges), Rotate (90/180/270°), Reorder (custom sequence), Annotate (text on a chosen page), or Watermark.</p>
<p>Tap "Run", then "Preview" to see the result. Use Save / Download / Share / Print to export.</p>`
  },
  {
    title: 'Saving to the Library',
    body: `<p>"Save to Library" stores the current document in IndexedDB. Open the Library workspace to see all saved documents, with thumbnails rendered from the PDF's first page.</p>
<p>You can rename, delete, or reopen any document in Sign or PDF Tools.</p>`
  },
  {
    title: 'Downloading, sharing, and printing',
    body: `<p>Download saves the PDF to your device. Share uses the native Web Share API where available; otherwise it falls back to a download. Print opens the browser's print dialog in a hidden iframe so you don't lose your place in the app.</p>`
  },
  {
    title: 'Troubleshooting',
    body: `<ul>
<li><strong>Camera doesn't open?</strong> Check browser permissions, try HTTPS, or use Import images instead.</li>
<li><strong>OCR is slow?</strong> The first run downloads the language model. Subsequent runs are faster and work offline once cached.</li>
<li><strong>PDF won't open?</strong> Make sure it's not password-protected. DocuScan Pro cannot edit encrypted PDFs.</li>
<li><strong>Lost documents?</strong> Browser-local storage is not cloud backup. Clearing site data removes saved documents.</li>
</ul>`
  },
  {
    title: 'Privacy and local storage',
    body: `<p>DocuScan Pro is local-first. Your documents are processed in your browser and stored in IndexedDB on your device. Documents are not uploaded to any server.</p>
<p>OCR runs entirely on-device when the language assets are cached; otherwise the OCR engine downloads them on first use.</p>`
  },
  {
    title: 'Offline limitations',
    body: `<p>The PWA shell is cached by the service worker and works offline. PDF.js, pdf-lib, and Tesseract.js are loaded from CDN on first use; once cached by the service worker, they work offline too.</p>
<p>Features that depend on a not-yet-cached asset will display a clear error if the network is unavailable.</p>`
  },
];

function initHelpWorkspace() {
  const wrap = document.getElementById('helpAccordion');
  wrap.innerHTML = '';
  HELP_ITEMS.forEach((item, i) => {
    const root = document.createElement('div');
    root.className = 'help-accordion-item';
    const trigger = document.createElement('button');
    trigger.className = 'help-accordion-trigger';
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', `help-content-${i}`);
    trigger.innerHTML = `<span>${item.title}</span><span aria-hidden="true">+</span>`;
    const content = document.createElement('div');
    content.className = 'help-accordion-content';
    content.id = `help-content-${i}`;
    content.hidden = true;
    content.innerHTML = item.body;
    trigger.addEventListener('click', () => {
      const open = !content.hidden;
      content.hidden = open;
      trigger.setAttribute('aria-expanded', String(!open));
      trigger.querySelector('span:last-child').textContent = open ? '+' : '–';
    });
    root.appendChild(trigger);
    root.appendChild(content);
    wrap.appendChild(root);
  });
}

/* ---------------- About dialog ---------------- */
document.getElementById('btnAbout').addEventListener('click', () => {
  toast(`DocuScan Pro v${APP_VERSION} • build ${APP_BUILD}`, '');
});

/* ---------------- Boot ---------------- */
function boot() {
  initNavigation();
  initStudioWorkspace();
  initSignWorkspace();
  initToolsWorkspace();
  initLibraryWorkspace();
  initHelpWorkspace();
  updateOnlineStatus();
  // Re-render library when entering
  onWorkspaceChange(({ to }) => {
    if (to === 'library') renderLibrary();
    if (to === 'sign') {
      // Resize canvas to match container if necessary
      if (sign.pdfDoc) renderSignCurrentPage();
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
  console.info(`DocuScan Pro v${APP_VERSION} booted.`);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
