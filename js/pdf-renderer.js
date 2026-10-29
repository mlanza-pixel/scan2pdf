/* =====================================================================
   pdf-renderer.js — PDF.js wrapper (pinned version, single import).
   Renders a page of a PDF document to a canvas element.
   ===================================================================== */

const PDFJS_VERSION = '4.7.76';
const PDFJS_CDN = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`;
const PDFJS_WORKER_CDN = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

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
  })();
  return _pdfjsPromise;
}

export async function loadPdfFromBytes(bytes) {
  const pdfjsLib = await loadPdfJs();
  // pdf.js needs an ArrayBuffer copy (it may transfer ownership to a worker)
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const task = pdfjsLib.getDocument({ data: buf });
  const pdf = await task.promise;
  return pdf;
}

export async function renderPageToCanvas(pdf, pageNum, canvas, targetWidth = 0) {
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
