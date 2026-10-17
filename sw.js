const CACHE_NAME = 'thyroid-tracker-v75';
const APP_SHELL = ['./', './index.html', './tracker.css', './correlations.css', './enhancements.css?v=7', './workflow.css?v=6', './routine-tabs.css?v=8', './challenge.css?v=6', './routine-management.css?v=4', './analysis.css?v=1', './routine-edit.css?v=7', './lab-pdf.css?v=8', './tracker.js?v=6', './quick-update.js', './lab-pdf.js', './pdf.min.mjs', './pdf.worker.min.mjs', './wisdom.js', './puzzles.json', './analysis.js', './chess-engine.js', './manifest.webmanifest', './app-icon.svg', './app-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    fetch(new Request(event.request, { cache: 'no-store' })).then((response) => {
      if (response.ok) {
        const clone = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)));
      }
      return response;
    }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
