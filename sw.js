// Percorsi RELATIVI di proposito: si risolvono rispetto alla posizione del
// service worker, quindi l'app continua a funzionare se il repository (e con
// esso l'URL di GitHub Pages) viene rinominato. Con percorsi assoluti una
// rinomina fa fallire addAll e l'app perde del tutto la modalita' offline.
const CACHE = 'bus-aq-v8';
const FILES = [
  './',
  './index.html',
  './schedule.json',
  './manifest.json',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', e =>
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()))
);
self.addEventListener('activate', e =>
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()))
);
self.addEventListener('fetch', e =>
  e.respondWith(caches.match(e.request).then(r =>
    r || fetch(e.request).catch(() => caches.match('./index.html'))))
);
