/* =====================================================================
   storage.js — IndexedDB persistence for DocuScan Pro documents.
   Single object store 'documents' keyed by id (uuid). Stores: id, name,
   type, createdAt, modifiedAt, pageCount, bytes (Uint8Array), size.
   ===================================================================== */

const DB_NAME = 'docuscan-pro';
const DB_VERSION = 1;
const STORE = 'documents';

let _dbPromise = null;

function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('modifiedAt', 'modifiedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB.'));
  });
  return _dbPromise;
}

export async function saveDocument(doc) {
  const db = await openDb();
  const record = {
    id: doc.id || crypto.randomUUID(),
    name: doc.name || 'Untitled document',
    type: doc.type || 'application/pdf',
    createdAt: doc.createdAt || Date.now(),
    modifiedAt: Date.now(),
    pageCount: doc.pageCount ?? 0,
    bytes: doc.bytes instanceof Uint8Array ? doc.bytes : new Uint8Array(doc.bytes || []),
    size: doc.bytes ? (doc.bytes instanceof Uint8Array ? doc.bytes.length : doc.bytes.byteLength || 0) : 0,
    thumbnail: doc.thumbnail || null,
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error || new Error('Failed to save document.'));
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted.'));
  });
}

export async function getDocument(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function listDocuments() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const docs = (req.result || []).sort((a, b) => (b.modifiedAt || 0) - (a.modifiedAt || 0));
      resolve(docs);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function renameDocument(id, newName) {
  const doc = await getDocument(id);
  if (!doc) throw new Error('Document not found.');
  doc.name = newName;
  doc.modifiedAt = Date.now();
  return saveDocument(doc);
}

export async function deleteDocument(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function estimateStorage() {
  if (navigator.storage && navigator.storage.estimate) {
    const est = await navigator.storage.estimate();
    return { usage: est.usage || 0, quota: est.quota || 0 };
  }
  return { usage: 0, quota: 0, unsupported: true };
}
