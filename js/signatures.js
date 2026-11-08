/* =====================================================================
   signatures.js — drawing pad (pointer events), typed signature preview,
   and PNG-byte extraction for embedding into a PDF.
   ===================================================================== */

export class SignaturePad {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.drawing = false;
    this.hasInk = false;
    this.strokes = [];
    this._current = null;
    this._bindEvents();
    this.clear();
  }

  _bindEvents() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      c.setPointerCapture(e.pointerId);
      this.drawing = true;
      this.hasInk = true;
      const p = this._pos(e);
      this._current = { points: [p] };
      this.ctx.beginPath();
      this.ctx.moveTo(p.x, p.y);
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.drawing) return;
      e.preventDefault();
      const p = this._pos(e);
      this._current.points.push(p);
      this.ctx.lineTo(p.x, p.y);
      this.ctx.stroke();
    });
    c.addEventListener('pointerup', (e) => {
      if (!this.drawing) return;
      e.preventDefault();
      this.drawing = false;
      if (this._current) this.strokes.push(this._current);
      this._current = null;
    });
    c.addEventListener('pointercancel', () => {
      this.drawing = false; this._current = null;
    });
    c.addEventListener('pointerleave', () => {
      if (this.drawing) {
        this.drawing = false;
        if (this._current) this.strokes.push(this._current);
        this._current = null;
      }
    });
  }

  _pos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  clear() {
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.strokeStyle = '#1C1C1E';
    this.ctx.lineWidth = 2.5;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.strokes = [];
    this.hasInk = false;
  }

  isEmpty() { return !this.hasInk; }

  /**
   * Trim transparent/white borders and return PNG bytes with transparent
   * background, suitable for overlay onto a PDF page.
   */
  async toPngBytes() {
    if (this.isEmpty()) throw new Error('Signature is empty.');
    // Render a fresh canvas with transparent background, only the strokes.
    const out = document.createElement('canvas');
    out.width = this.canvas.width;
    out.height = this.canvas.height;
    const ctx = out.getContext('2d');
    ctx.strokeStyle = '#1C1C1E';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const stroke of this.strokes) {
      ctx.beginPath();
      stroke.points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    }
    // Trim
    const trimmed = this._trim(out);
    // to PNG
    return new Promise((resolve, reject) => {
      trimmed.toBlob(async (b) => {
        if (!b) { reject(new Error('toBlob failed')); return; }
        const buf = await b.arrayBuffer();
        resolve(new Uint8Array(buf));
      }, 'image/png');
    });
  }

  _trim(srcCanvas) {
    const ctx = srcCanvas.getContext('2d', { willReadFrequently: true });
    const { width, height } = srcCanvas;
    const img = ctx.getImageData(0, 0, width, height);
    const data = img.data;
    let minX = width, minY = height, maxX = 0, maxY = 0;
    let found = false;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const a = data[(y * width + x) * 4 + 3];
        if (a > 5) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          found = true;
        }
      }
    }
    if (!found) return srcCanvas;
    const pad = 8;
    const sx = Math.max(0, minX - pad);
    const sy = Math.max(0, minY - pad);
    const sw = Math.min(width - sx, maxX - minX + pad * 2);
    const sh = Math.min(height - sy, maxY - minY + pad * 2);
    const out = document.createElement('canvas');
    out.width = sw; out.height = sh;
    out.getContext('2d').drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
    return out;
  }
}

/**
 * Render a typed signature to PNG bytes.
 */
export async function typedSignatureToPng(text, font = 'Courier-Bold', size = 56) {
  // Use a temp canvas — let the browser pick a system fallback for the font.
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `${size}px ${font}`;
  const metrics = ctx.measureText(text);
  const pad = 12;
  c.width = Math.ceil(metrics.width + pad * 2);
  c.height = Math.ceil(size + pad * 2);
  ctx.font = `${size}px ${font}`;
  ctx.fillStyle = 'transparent';
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#1C1C1E';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, pad, c.height / 2);
  return new Promise((resolve, reject) => {
    c.toBlob(async (b) => {
      if (!b) { reject(new Error('toBlob failed')); return; }
      const buf = await b.arrayBuffer();
      resolve(new Uint8Array(buf));
    }, 'image/png');
  });
}
