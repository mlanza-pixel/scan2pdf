import { localState } from './local-state.js';
import { deleteDocument, importDocuments, listDocuments } from './storage.js';

const folderKey = 'docuscan-pro.folders';
const format = 'docuscan-library-backup';
const maxSize = 64 * 1024 * 1024;

function encode(bytes) {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 16384) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 16384));
  }
  return btoa(binary);
}

export async function exportLibraryBackup() {
  const docs = await listDocuments();
  if (docs.reduce((total, doc) => total + doc.bytes.length, 0) > maxSize * 0.73) {
    throw new Error('This Library is too large for a single backup.');
  }
  const folders = JSON.parse(localState.getItem(folderKey) || '[]');
  const documents = docs.map(({ id, name, bytes, pageCount }) => ({
    id, name, pageCount, pdf: encode(bytes),
  }));
  const blob = new Blob([JSON.stringify({ format, version: 1, folders, documents })], { type: 'application/json' });
  if (blob.size > maxSize) throw new Error('This Library is too large for a single backup.');
  return blob;
}

export async function restoreLibraryBackup(file, confirmRestore) {
  if (file.size > maxSize) throw new Error('Backup exceeds the 64 MiB limit.');
  const backup = JSON.parse(await file.text());
  if (backup?.format !== format || backup.version !== 1 ||
      !Array.isArray(backup.documents) || !Array.isArray(backup.folders)) {
    throw new Error('Select a DocuScan Library backup.');
  }
  const ids = new Map();
  const now = Date.now();
  const documents = backup.documents.map(({ id, name, pageCount, pdf }) => {
    if (typeof id !== 'string' || ids.has(id) || typeof name !== 'string' ||
        typeof pdf !== 'string' || !Number.isSafeInteger(pageCount) || pageCount < 0) {
      throw new Error('Backup contains an invalid document.');
    }
    const binary = atob(pdf);
    if (!binary.slice(0, 1024).includes('%PDF-')) throw new Error('Backup contains a file without a PDF header.');
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const newId = crypto.randomUUID();
    ids.set(id, newId);
    return { id: newId, name, pageCount, bytes, size: bytes.length,
      type: 'application/pdf', createdAt: now, modifiedAt: now, thumbnail: null };
  });
  const folders = backup.folders.map(({ name, docs }) => {
    if (typeof name !== 'string' || !Array.isArray(docs)) throw new Error('Backup contains an invalid folder.');
    return { id: crypto.randomUUID(), name, docs: [...new Set(docs.map(id => ids.get(id)).filter(Boolean))] };
  });
  if (!confirmRestore(documents.length, folders.length)) return null;
  await importDocuments(documents);
  try {
    if (folders.length) {
      const existing = JSON.parse(localState.getItem(folderKey) || '[]');
      localState.setItem(folderKey, JSON.stringify([...existing, ...folders]));
    }
  } catch (error) {
    await Promise.all(documents.map(doc => deleteDocument(doc.id)));
    throw error;
  }
  return documents.length;
}
