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

// Inverse projective mapping from a rectangular page to four tapped corners.
export function straightenPage(canvas, corners) {
  const cross = (a, b, c) => (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  if (corners.length !== 4 || corners.some((a, i) => cross(a, corners[(i + 1) % 4], corners[(i + 2) % 4]) <= 0)) {
    throw new Error('Tap the top-left, top-right, bottom-right and bottom-left corners in order.');
  }
  const [a, b, c, d] = corners;
  const distance = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  const width = Math.round(Math.max(distance(a, b), distance(d, c)));
  const height = Math.round(Math.max(distance(a, d), distance(b, c)));
  if (width < 20 || height < 20) throw new Error('The selected page is too small.');
  const dx1 = b.x - c.x, dx2 = d.x - c.x, dx3 = a.x - b.x + c.x - d.x;
  const dy1 = b.y - c.y, dy2 = d.y - c.y, dy3 = a.y - b.y + c.y - d.y;
  const determinant = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / determinant;
  const h = (dx1 * dy3 - dx3 * dy1) / determinant;
  const input = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const ctx = output.getContext('2d');
  const image = ctx.createImageData(width, height);
  for (let row = 0; row < height; row++) {
    const v = row / (height - 1);
    for (let col = 0; col < width; col++) {
      const u = col / (width - 1);
      const z = g * u + h * v + 1;
      const x = Math.max(0, Math.min(canvas.width - 1, Math.round((a.x + (b.x - a.x + g * b.x) * u + (d.x - a.x + h * d.x) * v) / z)));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.round((a.y + (b.y - a.y + g * b.y) * u + (d.y - a.y + h * d.y) * v) / z)));
      const source = (y * canvas.width + x) * 4;
      const target = (row * width + col) * 4;
      for (let channel = 0; channel < 4; channel++) image.data[target + channel] = input[source + channel];
    }
  }
  ctx.putImageData(image, 0, 0);
  return output;
}

// Estimate uneven illumination from a coarse blurred background.
export function reducePageShadows(canvas) {
  const output = document.createElement('canvas');
  output.width = canvas.width;
  output.height = canvas.height;
  const ctx = output.getContext('2d');
  const map = document.createElement('canvas');
  map.width = map.height = 16;
  map.getContext('2d').drawImage(canvas, 0, 0, 16, 16);
  ctx.drawImage(map, 0, 0, output.width, output.height);
  const background = ctx.getImageData(0, 0, output.width, output.height).data;
  ctx.drawImage(canvas, 0, 0);
  const image = ctx.getImageData(0, 0, output.width, output.height);
  for (let i = 0; i < image.data.length; i += 4) {
    const gray = (background[i] + background[i + 1] + background[i + 2]) / 3;
    const gain = Math.min(1.6, Math.max(1, 225 / Math.max(1, gray)));
    for (let channel = 0; channel < 3; channel++) image.data[i + channel] *= gain;
  }
  ctx.putImageData(image, 0, 0);
  return output;
}
