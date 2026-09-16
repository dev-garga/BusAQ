// Percorsi RELATIVI di proposito: si risolvono rispetto alla posizione del service
// worker, quindi l'app continua a funzionare se il repository (e con esso l'URL di
// GitHub Pages) viene rinominato. Con percorsi assoluti una rinomina fa fallire
// addAll e l'app perde del tutto la modalita' offline.
//
// Il nome della cache lo scrive tools/rilascia.py dall'impronta dei file serviti:
// cambia da se' quando cambia qualcosa e non cambia quando non e' cambiato niente.
const CACHE = 'bus-aq-6ad33f2f3a';

// Cio' che cambia a ogni pubblicazione: si chiede prima alla rete, cosi' una versione
// nuova si vede subito. Era questo il difetto — con la cache per prima, l'unico
// interruttore restava il nome della cache, da incrementare a mano.
const VIVI = ['./', './index.html', './stile.css', './app.js', './orari.js', './schedule.json'];

// Cio' che non cambia mai: inutile pagarlo a ogni apertura.
const FERMI = ['./manifest.json', './icon-180.png', './icon-192.png', './icon-512.png'];

const SCADENZA = 2000;   // oltre, si serve la cache: alla fermata la rete e' quel che e'

const percorso = url => {
  const p = new URL(url).pathname;
  const base = new URL('./', self.location).pathname;
  return './' + p.slice(base.length);
};

// Si scarica un file per volta invece di addAll: addAll e' atomico, quindi una sola
// risorsa mancante faceva fallire l'installazione e l'app restava senza modalita'
// offline del tutto. Meglio una cache incompleta che nessuna cache.
self.addEventListener('install', e =>
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all([...VIVI, ...FERMI].map(f =>
      c.add(f).catch(err => console.warn('[sw] non messo in cache:', f, err.message)))))
    .then(() => self.skipWaiting()))
);

self.addEventListener('activate', e =>
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()))
);

// Rete prima, con scadenza: se risponde si serve e si aggiorna la cache, cosi' il
// ripiego e' sempre l'ultima versione vista. Se tarda o fallisce, si serve la cache.
async function retePrima(req) {
  const cache = await caches.open(CACHE);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SCADENZA);
    const res = await fetch(req, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res && res.ok) { cache.put(req, res.clone()); return res; }
    throw new Error('risposta non utilizzabile');
  } catch (err) {
    return (await cache.match(req)) || (await cache.match('./index.html')) || Response.error();
  }
}

async function cachePrima(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;   // altre origini: passante

  // Una navigazione non porta sempre l'indirizzo esatto del file: si tratta come pagina.
  if (req.mode === 'navigate') return e.respondWith(retePrima(req));

  const p = percorso(req.url);
  if (VIVI.includes(p))  return e.respondWith(retePrima(req));
  if (FERMI.includes(p)) return e.respondWith(cachePrima(req));
});
