/* =====================================================================
   pdf-editor.js — pdf-lib wrapper for building PDFs from images and
   for inserting text, dates, signatures, and watermarks. Pinned
   single version, loaded lazily on first use.
   ===================================================================== */

const PDFLIB_VERSION = '1.17.1';
const PDFLIB_CDN = `https://cdn.jsdelivr.net/npm/pdf-lib@${PDFLIB_VERSION}/dist/pdf-lib.min.js`;

let _pdfLibPromise = null;

async function loadPdfLib() {
  if (_pdfLibPromise) return _pdfLibPromise;
  _pdfLibPromise = (async () => {
    if (!window.PDFLib) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = PDFLIB_CDN;
        s.async = true;
        s.onload = resolve;
        s.onerror = () => reject(new Error('Failed to load pdf-lib from CDN.'));
        document.head.appendChild(s);
      });
    }
    if (!window.PDFLib) throw new Error('pdf-lib global not available');
    return window.PDFLib;
  })();
  return _pdfLibPromise;
}

const PT = 1; // 1 pt = 1 pt in pdf-lib
const PAGE_SIZES = {
  letter: [612, 792],   // 8.5×11 in × 72
  a4: [595.28, 841.89], // 210×297mm
};

export async function buildPdfFromCanvases(canvases, opts = {}) {
  const lib = await loadPdfLib();
  const { PDFDocument } = lib;
  const doc = await PDFDocument.create();
  doc.setCreator('DocuScan Pro');
  doc.setProducer('DocuScan Pro (pdf-lib)');
  const pageSize = PAGE_SIZES[opts.pageSize] || null;
  for (const canvas of canvases) {
    const pngBytes = await new Promise((resolve, reject) => {
      canvas.toBlob(b => {
        const fr = new FileReader();
        fr.onload = () => resolve(new Uint8Array(fr.result));
        fr.onerror = () => reject(fr.error);
        fr.readAsArrayBuffer(b);
      }, 'image/png');
    });
    const img = await doc.embedPng(pngBytes);
    let pageW, pageH;
    if (pageSize) {
      [pageW, pageH] = pageSize;
      if (opts.orientation === 'landscape') [pageW, pageH] = [pageH, pageW];
      else if (opts.orientation === 'auto') {
        if (canvas.width > canvas.height) [pageW, pageH] = [pageH, pageW];
      }
    } else {
      // Fit-to-image: use image dims scaled to 96 dpi
      const dpi = 96;
      pageW = (canvas.width / dpi) * 72;
      pageH = (canvas.height / dpi) * 72;
    }
    const page = doc.addPage([pageW, pageH]);
    const padding = 18;
    const maxW = pageW - padding * 2;
    const maxH = pageH - padding * 2;
    const scale = Math.min(maxW / img.width, maxH / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;
    page.drawImage(img, { x, y, width: w, height: h });
  }
  const bytes = await doc.save();
  return bytes;
}

export async function loadExistingPdf(bytes) {
  const lib = await loadPdfLib();
  const { PDFDocument } = lib;
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return { doc, lib };
}

export function rgbFromHex(hex) {
  if (!hex || hex[0] !== '#') return { r: 0, g: 0, b: 1 };
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return { r, g, b };
}

/**
 * Insert a text element into a pdf-lib document at normalized coords.
 * normalized: { x: 0..1, y: 0..1 } where (0,0) is bottom-left of the page.
 * size is the font point size.
 */
export async function insertTextElement(doc, pageIdx, opts) {
  const lib = await loadPdfLib();
  const { StandardFonts, rgb, degrees } = lib;
  const font = await doc.embedFont(opts.fontFamily || StandardFonts.Helvetica);
  const pages = doc.getPages();
  if (pageIdx < 0 || pageIdx >= pages.length) throw new Error('Page index out of range');
  const page = pages[pageIdx];
  const { width, height } = page.getSize();
  const text = opts.text || '';
  const size = Number(opts.size) || 14;
  const color = rgb(opts.color?.r ?? 0, opts.color?.g ?? 0, opts.color?.b ?? 0);
  const xN = opts.normalized?.x ?? 0.5;
  const yN = opts.normalized?.y ?? 0.5;
  const x = xN * width;
  const y = yN * height;
  page.drawText(text, {
    x, y, size, font, color,
    rotate: degrees(opts.rotation || 0),
  });
  return { x, y, width: font.widthOfTextAtSize(text, size), height: size };
}

export async function insertImageElement(doc, pageIdx, pngBytes, opts) {
  const lib = await loadPdfLib();
  const { rgb, degrees } = lib;
  const img = await doc.embedPng(pngBytes);
  const pages = doc.getPages();
  if (pageIdx < 0 || pageIdx >= pages.length) throw new Error('Page index out of range');
  const page = pages[pageIdx];
  const { width, height } = page.getSize();
  const xN = opts.normalized?.x ?? 0.5;
  const yN = opts.normalized?.y ?? 0.5;
  // Width/Height percent of page dims
  const w = (opts.widthPct / 100) * width;
  const h = (opts.heightPct / 100) * height;
  const x = xN * width - w / 2;
  const y = (1 - yN) * height - h / 2;
  page.drawImage(img, {
    x, y, width: w, height: h,
    rotate: degrees(opts.rotation || 0),
  });
}

export async function insertWatermark(doc, opts) {
  const lib = await loadPdfLib();
  const { StandardFonts, rgb, degrees } = lib;
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const text = opts.text || 'DRAFT';
  const opacity = Math.max(0, Math.min(1, Number(opts.opacity) / 100));
  const color = rgb(0.5, 0.5, 0.5);
  const pages = doc.getPages();
  for (const page of pages) {
    const { width, height } = page.getSize();
    const size = Math.min(width, height) * 0.18;
    const textWidth = font.widthOfTextAtSize(text, size);
    const textHeight = size;
    let x, y, angle;
    if (opts.direction === 'horizontal') {
      x = (width - textWidth) / 2;
      y = (height - textHeight) / 2;
      angle = 0;
    } else {
      // Diagonal ↗ (45deg)
      x = width / 2 - textWidth / 2;
      y = height / 2 - textHeight / 2;
      angle = 45;
    }
    page.drawText(text, {
      x, y, size, font, color,
      opacity,
      rotate: degrees(angle),
    });
  }
}

export async function mergePdfs(primaryBytes, additionalBytesList) {
  const lib = await loadPdfLib();
  const { PDFDocument } = lib;
  const out = await PDFDocument.load(primaryBytes, { ignoreEncryption: true });
  for (const bytes of additionalBytesList) {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const indices = src.getPageIndices();
    const pages = await out.copyPages(src, indices);
    pages.forEach(p => out.addPage(p));
  }
  return await out.save();
}

export async function splitPdf(bytes, ranges) {
  const lib = await loadPdfLib();
  const { PDFDocument } = lib;
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = src.getPageIndices().length;
  const results = [];
  for (const range of ranges) {
    const { from, to } = range;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > total || from > to) {
      throw new Error(`Invalid page range: ${from}-${to}`);
    }
    const out = await PDFDocument.create();
    const pages = await out.copyPages(src, Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i));
    pages.forEach(p => out.addPage(p));
    results.push(await out.save());
  }
  return results;
}

export async function rotatePdf(bytes, rotation) {
  const lib = await loadPdfLib();
  const { PDFDocument, degrees } = lib;
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  for (const page of doc.getPages()) {
    const current = page.getRotation().angle || 0;
    page.setRotation(degrees((current + rotation) % 360));
  }
  return await doc.save();
}

export async function reorderPdf(bytes, newOrder) {
  const lib = await loadPdfLib();
  const { PDFDocument } = lib;
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = src.getPageIndices().length;
  if (!Array.isArray(newOrder) || newOrder.length !== total) {
    throw new Error('Reorder list must match page count.');
  }
  if (new Set(newOrder).size !== total || newOrder.some(i => i < 0 || i >= total)) {
    throw new Error('Reorder list must be a permutation of 0..n-1.');
  }
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, newOrder);
  pages.forEach(p => out.addPage(p));
  return await out.save();
}
