/* =====================================================================
   export.js — single export architecture used by Studio, Sign, and PDF
   Tools. Provides four consistent actions:
       1. Save to Library  (IndexedDB)
       2. Download PDF     (browser download)
       3. Share PDF         (Web Share API with fallback)
       4. Print PDF         (browser print dialog via hidden iframe)
   ===================================================================== */

import { saveDocument, listDocuments } from './storage.js';

import {askText,confirmAction} from './dialogs.js';
import {documentName,pdfFilename} from './filenames.js';
const pickFilename=pdfFilename;

// Check if a document with the same name already exists in the Library.
// Returns the existing document record, or null if no match.
async function findExistingByName(name) {
  try {
    const docs = await listDocuments();
    return docs.find(d => documentName(d.name).toLowerCase() === name.toLowerCase()) || null;
  } catch {
    return null;
  }
}

let saveQueue=Promise.resolve();
export function saveToLibrary(bytes,options={}) {
  const task=()=>saveNamed(bytes,options);const result=saveQueue.then(task,task);saveQueue=result.catch(()=>{});return result;
}
async function saveNamed(bytes,{name='Untitled document',pageCount=0,thumbnail=null,type='application/pdf',skipOverwriteCheck=false}={}) {
  if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);name=documentName(name);
  for(;;){
    const existing=skipOverwriteCheck?null:await findExistingByName(name);
    if(!existing)return saveDocument({name,bytes,pageCount,thumbnail,type});
    if(await confirmAction('Replace saved PDF?',`“${existing.name}” is already in your Library. Replace it, or cancel to choose a different name.`))return saveDocument({id:existing.id,name,bytes,pageCount,thumbnail,type,createdAt:existing.createdAt});
    const renamed=await askText('Save with a different name',`${name}_copy`);if(renamed===null)return null;name=documentName(renamed,`${name}_copy`);
  }
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
  // Delay cleanup so the browser has time to start the download.
  // Too short = "net::ERR_ABORTED" on the blob URL.
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 3000);
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
