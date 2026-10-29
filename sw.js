/* =====================================================================
   DocuScan Pro — Service Worker
   Cache-version strategy: bump CACHE_VERSION on every release to
   invalidate stale caches. Stale-while-revalidate for CDN assets
   (pdf.js, pdf-lib, Tesseract.js) so first use is online, subsequent
   uses are offline.
   ===================================================================== */

const CACHE_VERSION = 'v5-0-0';
const APP_CACHE = `docuscan-app-${CACHE_VERSION}`;
const ASSET_CACHE = `docuscan-assets-${CACHE_VERSION}`;

// Local application shell — versioned
const APP_SHELL = [
  './',
  './index.html',
  './css/tokens.css',
  './css/components.css',
  './css/layout.css',
  './css/responsive.css',
  './js/app.js',
  './js/navigation.js',
  './js/storage.js',
  './js/scanner.js',
  './js/image-processing.js',
  './js/ocr.js',
  './js/pdf-renderer.js',
  './js/pdf-editor.js',
  './js/pdf-tools.js',
  './js/signatures.js',
  './js/watermark.js',
  './js/export.js',
  './manifest.webmanifest',
  './assets/icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== APP_CACHE && k !== ASSET_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only handle GET
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // CDN assets: stale-while-revalidate
  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const fetchPromise = fetch(req).then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }
  // App shell: cache-first, fallback to network, then offline fallback
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Cache same-origin GETs
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(APP_CACHE).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => {
        // Fallback to index.html for navigations
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});
