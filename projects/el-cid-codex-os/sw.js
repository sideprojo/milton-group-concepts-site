// Offline Service Worker for Spanish Acquisition OS (SAOS)
const CACHE_NAME = 'saos-runtime-cache-v3';
const OFFLINE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './imsmanifest.xml',
  './src/data/master_corpus.json',
  './src/modules/srs_engine.js',
  './src/modules/scorm_adapter.js',
  './src/modules/learning_modes.js',
  './src/dashboards/dashboard_engine.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(OFFLINE_URLS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then((fetchRes) => {
        return caches.open(CACHE_NAME).then((cache) => {
          if (event.request.method === 'GET' && fetchRes.status === 200) {
            cache.put(event.request, fetchRes.clone());
          }
          return fetchRes;
        });
      });
    }).catch(() => {
      if (event.request.destination === 'document') {
        return caches.match('./index.html');
      }
    })
  );
});
