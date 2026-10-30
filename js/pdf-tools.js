/* =====================================================================
   pdf-tools.js — merge / split / rotate / reorder / watermark / annotate
   operations for the PDF Tools workspace. All operations run on the
   currently-loaded source document bytes and produce a NEW Uint8Array
   (never mutate the original in-place).
   ===================================================================== */

import {
  mergePdfs, splitPdf, rotatePdf, reorderPdf, insertWatermark, insertTextElement, insertDrawing,
} from './pdf-editor.js';

export async function runMerge(primaryBytes, additionalBytesList, opts = {}) {
  return mergePdfs(primaryBytes, additionalBytesList);
}

export function parseRanges(input, total) {
  // Accepts "1-3,5,8-10" → [{from:1,to:3},{from:5,to:5},{from:8,to:10}]
  if (!input || !input.trim()) throw new Error('No page ranges supplied.');
  const parts = input.split(',').map(s => s.trim()).filter(Boolean);
  const ranges = [];
  for (const p of parts) {
    const m = p.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) throw new Error(`Invalid page range: "${p}"`);
    const from = parseInt(m[1], 10);
    const to = m[2] ? parseInt(m[2], 10) : from;
    if (from < 1 || to < from || to > total) {
      throw new Error(`Range ${from}-${to} out of bounds (1..${total}).`);
    }
    ranges.push({ from, to });
  }
  return ranges;
}

export async function runSplit(bytes, rangeInput, total) {
  const ranges = parseRanges(rangeInput, total);
  return splitPdf(bytes, ranges);
}

export async function runRotate(bytes, angle) {
  return rotatePdf(bytes, angle);
}

export async function runReorder(bytes, newOrder) {
  return reorderPdf(bytes, newOrder);
}

export async function runWatermark(bytes, opts) {
  // Apply watermark by loading and inserting, then saving.
  if (!window.PDFLib) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load pdf-lib.'));
      document.head.appendChild(s);
    });
  }
  const lib = window.PDFLib;
  const { PDFDocument } = lib;
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  await insertWatermark(doc, opts);
  return await doc.save();
}

export async function runAnnotateText(bytes, pageIdx, opts) {
  // Lazy-load pdf-lib if not yet available on window
  if (!window.PDFLib) {
    await loadPdfLibScript();
  }
  const lib = window.PDFLib;
  if (!lib) throw new Error('pdf-lib failed to load.');
  const { PDFDocument } = lib;
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  await insertTextElement(doc, pageIdx, opts);
  return await doc.save();
}

export async function runAnnotateDrawing(bytes, pageIdx, pngBytes) {
  if (!window.PDFLib) {
    await loadPdfLibScript();
  }
  const lib = window.PDFLib;
  if (!lib) throw new Error('pdf-lib failed to load.');
  const { PDFDocument } = lib;
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  await insertDrawing(doc, pageIdx, pngBytes);
  return await doc.save();
}

/** Lazy-load pdf-lib from the pinned CDN URL. */
function loadPdfLibScript() {
  return new Promise((resolve, reject) => {
    if (window.PDFLib) return resolve();
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load pdf-lib from CDN.'));
    document.head.appendChild(s);
  });
}
