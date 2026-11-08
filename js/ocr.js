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
let _onProgress = null;
let _queue = Promise.resolve();

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
  if (_workerPromise) { const old = await _workerPromise.catch(() => null); await old?.terminate(); }
  _workerPromise = null; // dispose old language worker
  _workerLang = lang;
  _workerPromise = (async () => {
    await loadTesseractScript();
    if (!window.Tesseract) throw new Error('Tesseract global not available after script load.');
    const worker = await window.Tesseract.createWorker(lang, 1, {
      logger: m => {
        if (_onProgress && typeof m.progress === 'number') {
          _onProgress(m);
        }
      },
      langPath: LANG_PATH,
    });
    // Tune Tesseract parameters for sharper document OCR:
    //  - tessedit_pageseg_mode=6: assume a single uniform block of text
    //    (better for scanned documents than the default auto-PSM=3, which
    //    often mis-segments pages with mixed content).
    //  - preserve_interword_spaces=1: keep word spacing intact so the
    //    recognized text reads naturally instead of running together.
    //  - tessedit_char_whitelist: restrict to common document characters
    //    to reduce false-positive garbage characters.
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: '6',
        preserve_interword_spaces: '1',
      });
    } catch (e) {
      console.info('setParameters not supported on this Tesseract version; using defaults.', e);
    }
    return worker;
  })();
  return _workerPromise;
}

export function recognizeText(imageSource, { onProgress, lang = 'eng', signal, timeoutMs = 90000 } = {}) {
  const job = async () => {
    if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
    let worker, abort, timer;
    _onProgress = onProgress;
    try {
      onProgress?.({status:'Loading OCR engine',progress:0});
      const aborted = new Promise((_,reject) => {
        abort = () => {
          const pending = _workerPromise;
          _workerPromise = null; _workerLang = null;
          pending?.then(w=>w.terminate()).catch(()=>{});
          reject(signal?.aborted ? new DOMException('Stopped', 'AbortError') : new Error('OCR timed out; retry or check the language download.'));
        };
        signal?.addEventListener('abort',abort,{once:true});
        timer=setTimeout(abort,timeoutMs);
      });
      const recognition = (async () => {
        worker = await getWorker(null, lang);
        if (signal?.aborted) throw new DOMException('Stopped','AbortError');
        return worker.recognize(imageSource);
      })();
      const result = await Promise.race([recognition,aborted]);
      return {ok:true,text:result?.data?.text || '',lines:result?.data?.lines || []};
    } catch(err) {
      if (err.name==='AbortError') throw err;
      const pending = _workerPromise; _workerPromise=null; _workerLang=null;
      pending?.then(w=>w.terminate()).catch(()=>{});
      return {ok:false,error:err.message || String(err),text:''};
    } finally { clearTimeout(timer); signal?.removeEventListener('abort',abort); _onProgress=null; }
  };
  const result = _queue.then(job,job);
  _queue=result.catch(()=>{});
  return result;
}

export async function isOcrAvailable() {
  try {
    await loadTesseractScript();
    return !!window.Tesseract;
  } catch { return false; }
}
