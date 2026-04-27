const CACHE_NAME = 'byl-v1';
const ASSETS = [
  '/Byl/',
  '/Byl/index.html',
  '/Byl/manifest.json',
  '/Byl/logo-rounded.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
