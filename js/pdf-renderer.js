/* =====================================================================
   pdf-renderer.js — PDF.js wrapper (pinned version, single import).
   Renders a page of a PDF document to a canvas element.
   ===================================================================== */

const PDFJS_VERSION = '4.7.76';
const PDFJS_CDN = new URL('../vendor/pdfjs/pdf.min.mjs', import.meta.url).href;
const PDFJS_WORKER_CDN = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

let _pdfjsPromise = null;

async function loadPdfJs() {
  if (_pdfjsPromise) return _pdfjsPromise;
  _pdfjsPromise = (async () => {
    const mod = await import(/* @vite-ignore */ PDFJS_CDN);
    const pdfjsLib = mod.GlobalWorkerOptions ? mod : (mod.default || mod);
    if (!pdfjsLib.GlobalWorkerOptions) {
      throw new Error('pdf.js GlobalWorkerOptions missing');
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
    return pdfjsLib;
  })().catch(err => { _pdfjsPromise = null; throw err; });
  return _pdfjsPromise;
}

const documentCache = new WeakMap();
export async function loadPdfFromBytes(bytes) {
  if (documentCache.has(bytes)) return documentCache.get(bytes);
  const pending = (async () => {
    const pdfjsLib = await loadPdfJs();
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return pdfjsLib.getDocument({ data: buf, standardFontDataUrl: new URL('../vendor/pdfjs/standard_fonts/', import.meta.url).href }).promise;
  })();
  documentCache.set(bytes, pending);
  try { return await pending; } catch (err) { documentCache.delete(bytes); throw err; }
}
const canvasQueues = new WeakMap();
export function renderPageToCanvas(pdf, pageNum, canvas, targetWidth = 0) {
  const previous = canvasQueues.get(canvas) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => renderPageNow(pdf, pageNum, canvas, targetWidth));
  canvasQueues.set(canvas, next);
  return next;
}
async function renderPageNow(pdf, pageNum, canvas, targetWidth = 0) {
  const page = await pdf.getPage(pageNum);
  const viewport0 = page.getViewport({ scale: 1 });
  const scale = targetWidth > 0 ? targetWidth / viewport0.width : 1.5;
  const viewport = page.getViewport({ scale });
  const ctx = canvas.getContext('2d');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { width: viewport.width, height: viewport.height, page };
}

export async function getPageCount(pdf) {
  return pdf.numPages;
}

export async function makeThumbnail(pdf, pageNum, maxWidth = 180) {
  const canvas = document.createElement('canvas');
  await renderPageToCanvas(pdf, pageNum, canvas, maxWidth);
  return canvas;
}
