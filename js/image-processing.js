/* =====================================================================
   image-processing.js — canvas-based enhancement for studio pages.
   Preserves the original image; transforms are applied non-destructively
   on top of a working copy. Only "Apply to selected page" commits the
   enhanced result (the original can be restored with "Reset").
   ===================================================================== */

export const PRESETS = {
  none:      { brightness: 0,   contrast: 0,   grayscale: 0,   threshold: null },
  auto:      { brightness: 8,   contrast: 12,  grayscale: 0,   threshold: null },
  grayscale: { brightness: 0,   contrast: 0,   grayscale: 1,   threshold: null },
  bw:        { brightness: 10,  contrast: 20,  grayscale: 1,   threshold: 128 },
  brighten:  { brightness: 25,  contrast: 5,   grayscale: 0,   threshold: null },
  contrast:  { brightness: 0,   contrast: 35,  grayscale: 0,   threshold: null },
};

export function applyAdjustments(srcCanvas, { brightness = 0, contrast = 0, grayscale = false, threshold = null }) {
  const out = document.createElement('canvas');
  out.width = srcCanvas.width;
  out.height = srcCanvas.height;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(srcCanvas, 0, 0);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const data = img.data;
  const c = contrast / 100 + 1;
  const cIntercept = 128 * (1 - c);
  const b = brightness * 2.55;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], bl = data[i + 2];
    // Contrast
    r = c * r + cIntercept;
    g = c * g + cIntercept;
    bl = c * bl + cIntercept;
    // Brightness
    r += b; g += b; bl += b;
    // Grayscale
    if (grayscale) {
      const v = 0.299 * r + 0.587 * g + 0.114 * bl;
      r = g = bl = v;
    }
    // Threshold (B&W)
    if (threshold !== null) {
      const v = 0.299 * r + 0.587 * g + 0.114 * bl;
      const bw = v >= threshold ? 255 : 0;
      r = g = bl = bw;
    }
    data[i] = clamp(r);
    data[i + 1] = clamp(g);
    data[i + 2] = clamp(bl);
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function clamp(v) {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return v | 0;
}

export function rotateCanvas(srcCanvas, deg) {
  const angle = ((deg % 360) + 360) % 360;
  if (angle === 0) return srcCanvas;
  const out = document.createElement('canvas');
  if (angle === 180) {
    out.width = srcCanvas.width; out.height = srcCanvas.height;
  } else {
    out.width = srcCanvas.height; out.height = srcCanvas.width;
  }
  const ctx = out.getContext('2d');
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.drawImage(srcCanvas, -srcCanvas.width / 2, -srcCanvas.height / 2);
  return out;
}

export function imageToCanvas(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return c;
}

export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.85) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), type, quality);
  });
}

export function canvasToDataURL(canvas, type = 'image/jpeg', quality = 0.85) {
  return canvas.toDataURL(type, quality);
}
