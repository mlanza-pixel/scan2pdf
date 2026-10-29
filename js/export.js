/* =====================================================================
   export.js — single export architecture used by Studio, Sign, and PDF
   Tools. Provides four consistent actions:
       1. Save to Library  (IndexedDB)
       2. Download PDF     (browser download)
       3. Share PDF         (Web Share API with fallback)
       4. Print PDF         (browser print dialog via hidden iframe)
   ===================================================================== */

import { saveDocument } from './storage.js';

function pickFilename(name) {
  const base = (name || 'document').replace(/[\\/:*?"<>|]/g, '_').trim() || 'document';
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

export async function saveToLibrary(bytes, { name = 'Untitled document', pageCount = 0, thumbnail = null } = {}) {
  if (!(bytes instanceof Uint8Array)) {
    bytes = new Uint8Array(bytes);
  }
  return saveDocument({ name, bytes, pageCount, thumbnail, type: 'application/pdf' });
}

export function downloadPdf(bytes, name) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = pickFilename(name);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1500);
}

export async function sharePdf(bytes, name, { title, text } = {}) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  if (navigator.canShare) {
    try {
      const file = new File([bytes], pickFilename(name), { type: 'application/pdf' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title, text });
        return { ok: true, method: 'native' };
      }
    } catch (err) {
      if (err.name === 'AbortError') return { ok: false, reason: 'cancelled' };
      // Fall through to fallback
      console.warn('Native share failed; falling back to download', err);
    }
  }
  // Fallback: trigger download
  downloadPdf(bytes, name);
  return { ok: true, method: 'download-fallback' };
}

export function printPdf(bytes, name) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  // Use an iframe so we don't navigate away from the app
  let iframe = document.getElementById('__docuscan_print_frame');
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = '__docuscan_print_frame';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
  }
  iframe.src = url;
  iframe.onload = () => {
    try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch {}
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
}

export async function validatePdfBytes(bytes) {
  if (!bytes || bytes.length < 8) return false;
  // PDF files begin with "%PDF-"
  const head = String.fromCharCode(...bytes.slice(0, 5));
  return head === '%PDF-';
}
