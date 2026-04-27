self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  // This allows the app to be 'installable'
});
