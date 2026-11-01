/* =====================================================================
   scanner.js — camera capture and image import for the Studio workspace.
   Honors browser permission denial with a graceful file-upload fallback.
   ===================================================================== */

export function initScanner(handlers) {
  const cameraInput = document.getElementById('cameraInput');
  const imagesInput = document.getElementById('imagesInput');
  const btnCamera = document.getElementById('btnCaptureCamera');
  const btnImport = document.getElementById('btnImportImages');

  if (!cameraInput || !imagesInput || !btnCamera || !btnImport) {
    console.warn('Scanner inputs missing — skipping init');
    return;
  }

  btnCamera.addEventListener('click', () => {
    // IMPORTANT: do NOT await anything before calling .click() — iOS Safari
    // requires the input.click() to happen synchronously within the user
    // gesture, or the file picker will not open. The `capture="environment"`
    // attribute on the input makes the browser open the camera directly and
    // handles permissions natively.
    cameraInput.value = '';
    cameraInput.click();
  });

  cameraInput.addEventListener('change', () => {
    const files = Array.from(cameraInput.files || []);
    files.forEach(f => handlers.onFile(f, { source: 'camera' }));
  });

  btnImport.addEventListener('click', () => {
    imagesInput.value = '';
    imagesInput.click();
  });

  imagesInput.addEventListener('change', () => {
    const files = Array.from(imagesInput.files || []);
    files.forEach(f => handlers.onFile(f, { source: 'import' }));
  });
}

export function validateImageFile(file) {
  if (!file) return { ok: false, reason: 'No file provided.' };
  if (!file.type.startsWith('image/')) {
    return { ok: false, reason: `Unsupported file type: ${file.type}. Only images are accepted.` };
  }
  const MAX_MB = 25;
  if (file.size > MAX_MB * 1024 * 1024) {
    return { ok: false, reason: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Limit is ${MAX_MB}MB.` };
  }
  return { ok: true };
}

export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('FileReader failed'));
    r.readAsDataURL(file);
  });
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}
