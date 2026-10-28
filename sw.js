/**
 * DocuScan Pro - Service Worker
 * Version: v4.8.6
 * Strategy: Cache-First for static app shell, background refresh for cache updates.
 */

const CACHE_NAME = 'docuscan-pro-v4.8.6';
const BASE_PATH = '/scan2pdf';

// Core static assets required for offline app shell execution
const PRECACHE_ASSETS = [
  BASE_PATH + '/',
  BASE_PATH + '/index.html',
  BASE_PATH + '/manifest.webmanifest',
  BASE_PATH + '/css/tokens.css',
  BASE_PATH + '/css/components.css',
  BASE_PATH + '/css/layout.css',
  BASE_PATH + '/css/responsive.css',
  BASE_PATH + '/js/app.js',
  BASE_PATH + '/js/navigation.js',
  BASE_PATH + '/js/storage.js',
  BASE_PATH + '/js/scanner.js',
  BASE_PATH + '/js/image-processing.js',
  BASE_PATH + '/js/ocr.js',
  BASE_PATH + '/js/pdf-renderer.js',
  BASE_PATH + '/js/pdf-editor.js',
  BASE_PATH + '/js/pdf-tools.js',
  BASE_PATH + '/js/signatures.js',
  BASE_PATH + '/js/watermark.js',
  BASE_PATH + '/js/export.js',
  BASE_PATH + '/js/pwa.js'
];

// Install Event: Precache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Clear stale cache versions safely upon deployment
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Cache-First strategy with dynamic network update
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch background update for cache
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse);
            });
          }
        }).catch(() => {/* Offline: gracefully ignore network failure */});

        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match(BASE_PATH + '/index.html');
        }
      });
    })
  );
});
