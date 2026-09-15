// Bump della versione a ogni rilascio: senza, il browser continua a servire
// dalla cache la versione precedente e l'aggiornamento non arriva mai.
const CACHE = 'bus-aq-v4';
const FILES = [
  '/bus-aquila/',
  '/bus-aquila/index.html',
  '/bus-aquila/schedule.json',
  '/bus-aquila/manifest.json',
  '/bus-aquila/icon-180.png',
  '/bus-aquila/icon-192.png',
  '/bus-aquila/icon-512.png',
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
    r || fetch(e.request).catch(() => caches.match('/bus-aquila/index.html'))))
);
