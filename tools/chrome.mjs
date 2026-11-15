// Un Chrome headless pilotato via protocollo DevTools, con l'app servita da un server statico
// e l'orologio fissato. Lo usano tools/catture.mjs (le immagini) e tools/prova_pagina.mjs (la
// prova del comportamento). Serve Node 22 o superiore (WebSocket incluso) e Chrome o Chromium;
// se non lo trova da solo: CHROME="/percorso/di/chrome".
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RADICE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const attendi = ms => new Promise(r => setTimeout(r, ms));

const CANDIDATI = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

const TIPI = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

export function trovaChrome() {
  const c = CANDIDATI.find(p => existsSync(p));
  if (!c) throw new Error('Chrome non trovato. Indica il percorso con CHROME="..."');
  return c;
}

// L'app usa moduli ES e fetch, che da file:// non funzionano: serve un server, anche se minimo.
function serviRadice() {
  const server = createServer((req, res) => {
    const percorso = normalize(join(RADICE, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    const file = percorso.endsWith('/') || (existsSync(percorso) && statSync(percorso).isDirectory())
      ? join(percorso, 'index.html') : percorso;
    if (!file.startsWith(RADICE) || !existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': TIPI[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

/**
 * Avvia Chrome con l'orologio fissato a `ora` (ISO locale, es. '2026-10-07T12:07:00').
 * -> { apri, valuta, clic, aspetta, errori, chiudi }
 */
export async function avvia(ora) {
  const server = await serviRadice();
  const indirizzo = `http://127.0.0.1:${server.address().port}/index.html`;
  const profilo = mkdtempSync(join(tmpdir(), 'busaq-chrome-'));
  const porta = 9300 + Math.floor(Math.random() * 400);
  // Sui runner di CI (variabile CI) l'utente non puo' creare lo spazio isolato di Chrome: li' si
  // lancia senza. In locale il sandbox resta attivo.
  const senzaSandbox = process.env.CI ? ['--no-sandbox'] : [];
  const chrome = spawn(trovaChrome(), ['--headless=new', '--disable-gpu', ...senzaSandbox,
    `--remote-debugging-port=${porta}`, `--user-data-dir=${profilo}`, 'about:blank'], { stdio: 'ignore' });

  let lista;
  for (let i = 0; i < 40 && !lista; i++) {
    try { lista = await (await fetch(`http://127.0.0.1:${porta}/json`)).json(); } catch { await attendi(250); }
  }
  if (!lista) { chrome.kill(); server.close(); throw new Error('Chrome non risponde sulla porta di debug'); }
  const ws = new WebSocket(lista.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));

  let n = 0; const attese = new Map(); const errori = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && attese.has(m.id)) { attese.get(m.id)(m); attese.delete(m.id); return; }
    // Gli errori della pagina: eccezioni non gestite e console.error. Un 404 e' un errore di rete.
    if (m.method === 'Runtime.exceptionThrown') errori.push('eccezione: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errori.push('console.error: ' + m.params.args.map(a => a.value ?? a.description).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errori.push('log: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
  });
  const cdp = (metodo, params = {}) => new Promise(r => { const id = ++n; attese.set(id, r); ws.send(JSON.stringify({ id, method: metodo, params })); });

  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Log.enable');
  // L'orologio si fissa prima che parta qualunque script della pagina.
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source:
    `(() => { const t = new Date(${JSON.stringify(ora)}).getTime(); const D = Date;
       window.Date = class extends D { constructor(...a) { if (a.length) super(...a); else super(t); } static now() { return t; } }; })();` });

  const valuta = async espressione => {
    const r = await cdp('Runtime.evaluate', { expression: espressione, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error('nella pagina: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
    return r.result.result.value;
  };
  const aspetta = async (condizione, ms = 6000) => {
    const fine = Date.now() + ms;
    while (Date.now() < fine) { if (await valuta(`!!(${condizione})`)) return; await attendi(80); }
    throw new Error('non compare: ' + condizione);
  };

  return {
    errori, valuta, aspetta, cdp,
    clic: sel => valuta(`document.querySelector(${JSON.stringify(sel)}).click()`),
    /** Carica l'app a una larghezza vera di telefono (non con --window-size: sotto i 500 px Chrome impagina a 500). */
    async apri({ larghezza = 393, altezza = 852, dpr = 2, tema = 'light' } = {}) {
      await cdp('Emulation.setDeviceMetricsOverride', { width: larghezza, height: altezza, deviceScaleFactor: dpr, mobile: larghezza < 600 });
      await cdp('Emulation.setEmulatedMedia', { features: [
        { name: 'prefers-color-scheme', value: tema }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
      await cdp('Page.navigate', { url: indirizzo });
      await aspetta("document.querySelector('#cards .card, #cards .led, #cards .empty')");
      await attendi(250);
    },
    screenshot: async () => Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'),
    chiudi() {
      try { ws.close(); } catch {}
      try { chrome.kill(); } catch {}
      server.close();
      setTimeout(() => { try { rmSync(profilo, { recursive: true, force: true }); } catch {} }, 300);
    },
  };
}
