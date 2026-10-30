/* =====================================================================
   ocr.js — Tesseract.js wrapper. Loads the engine lazily from a pinned
   CDN version on first use. Reports progress, surfaces failures, and
   preserves the original image.
   ===================================================================== */

const TESS_VERSION = '5.1.1';
const TESS_CDN = `https://cdn.jsdelivr.net/npm/tesseract.js@${TESS_VERSION}/dist/tesseract.min.js`;
const LANG_PATH = `https://tessdata.projectnaptha.com/4.0.0`;

let _workerPromise = null;
let _workerLang = null;
let _scriptLoaded = false;

function loadTesseractScript() {
  if (_scriptLoaded) return Promise.resolve();
  if (window.Tesseract) { _scriptLoaded = true; return Promise.resolve(); }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = TESS_CDN;
    s.async = true;
    s.onload = () => { _scriptLoaded = true; resolve(); };
    s.onerror = () => reject(new Error('Failed to load Tesseract.js from CDN. OCR unavailable.'));
    document.head.appendChild(s);
  });
}

async function getWorker(onProgress, lang = 'eng') {
  if (_workerPromise && _workerLang === lang) return _workerPromise;
  _workerPromise = null; // discard old worker if language changed
  _workerLang = lang;
  _workerPromise = (async () => {
    await loadTesseractScript();
    if (!window.Tesseract) throw new Error('Tesseract global not available after script load.');
    const worker = await window.Tesseract.createWorker(lang, 1, {
      logger: m => {
        if (onProgress && typeof m.progress === 'number') {
          onProgress(m);
        }
      },
      langPath: LANG_PATH,
    });
    return worker;
  })();
  return _workerPromise;
}

export async function recognizeText(imageSource, { onProgress, lang = 'eng' } = {}) {
  try {
    const worker = await getWorker(onProgress, lang);
    const result = await worker.recognize(imageSource);
    return { ok: true, text: result?.data?.text || '' };
  } catch (err) {
    _workerPromise = null; // allow retry
    return { ok: false, error: err.message || String(err), text: '' };
  }
}

export async function isOcrAvailable() {
  try {
    await loadTesseractScript();
    return !!window.Tesseract;
  } catch { return false; }
}
