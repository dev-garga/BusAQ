// Catture dello schermo dell'app a viewport mobile vero e orologio fissato.
//
//     node tools/catture.mjs                      # 12:07 di mercoledi' 7 ottobre 2026
//     node tools/catture.mjs --ora 2026-10-11T10:00:00 --out catture/domenica
//
// Serve per guardare l'app come la vedrebbe un telefono, e per ripetere la stessa
// schermata dopo una modifica. Due trappole che qui sono gia' risolte:
//   * Chrome headless con --window-size sotto i 500 px impagina comunque a 500 e ritaglia il
//     bordo destro: la larghezza si impone con l'emulazione del dispositivo (CDP), non con
//     la finestra;
//   * a fine giornata non c'e' nessuna prossima corsa e il pannello LED non compare, quindi
//     l'orologio va fissato a un orario in cui ce ne sono.
//
// Serve Node 22 o superiore (WebSocket incluso) e Chrome o Chromium. Se non lo trova da
// solo: CHROME="/percorso/di/chrome" node tools/catture.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const arg = (nome, predefinito) => {
  const i = process.argv.indexOf('--' + nome);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : predefinito;
};
const ORA = arg('ora', '2026-10-07T12:07:00');
const OUT = resolve(arg('out', join(RADICE, 'catture')));

const CANDIDATI = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);
const CHROME = CANDIDATI.find(p => existsSync(p));
if (!CHROME) { console.error('Chrome non trovato. Indica il percorso con CHROME="..."'); process.exit(1); }

const TIPI = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

// Un server statico minimo: l'app usa moduli ES e fetch, che da file:// non funzionano.
const server = createServer((req, res) => {
  const percorso = normalize(join(RADICE, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  const file = percorso.endsWith('/') || (existsSync(percorso) && statSync(percorso).isDirectory())
    ? join(percorso, 'index.html') : percorso;
  if (!file.startsWith(RADICE) || !existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': TIPI[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL_APP = `http://127.0.0.1:${server.address().port}/index.html`;

const profilo = mkdtempSync(join(tmpdir(), 'busaq-chrome-'));
const porta = 9300 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${porta}`,
  `--user-data-dir=${profilo}`, 'about:blank'], { stdio: 'ignore' });
const attendi = ms => new Promise(r => setTimeout(r, ms));

function chiudi(codice) {
  try { chrome.kill(); } catch {}
  server.close();
  setTimeout(() => { try { rmSync(profilo, { recursive: true, force: true }); } catch {} process.exit(codice); }, 300);
}

try {
  let lista;
  for (let i = 0; i < 30 && !lista; i++) {
    try { lista = await (await fetch(`http://127.0.0.1:${porta}/json`)).json(); } catch { await attendi(300); }
  }
  if (!lista) throw new Error('Chrome non risponde sulla porta di debug');
  const ws = new WebSocket(lista.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let n = 0; const attese = new Map();
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && attese.has(m.id)) { attese.get(m.id)(m); attese.delete(m.id); } });
  const cdp = (metodo, params = {}) => new Promise(r => { const id = ++n; attese.set(id, r); ws.send(JSON.stringify({ id, method: metodo, params })); });

  // L'orologio si fissa prima che parta qualunque script della pagina.
  await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source:
    `(() => { const t = new Date(${JSON.stringify(ORA)}).getTime(); const D = Date;
       window.Date = class extends D { constructor(...a) { if (a.length) super(...a); else super(t); } static now() { return t; } }; })();` });

  mkdirSync(OUT, { recursive: true });
  const catture = [  // nome, larghezza, altezza, pixel per punto, tema
    ['mobile-chiaro.png', 390, 844, 3, 'light'],
    ['mobile-scuro.png', 393, 852, 3, 'dark'],
    ['desktop.png', 1440, 900, 1, 'light'],
  ];
  for (const [nome, w, h, dpr, tema] of catture) {
    await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: w < 600 });
    await cdp('Emulation.setEmulatedMedia', { features: [
      { name: 'prefers-color-scheme', value: tema }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
    await cdp('Page.navigate', { url: URL_APP });
    await attendi(2200);
    const s = await cdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT, nome), Buffer.from(s.result.data, 'base64'));
    console.log(`scritto ${join(OUT, nome)}  (${w}x${h}, ${tema}, orologio ${ORA})`);
  }
  ws.close();
  chiudi(0);
} catch (e) {
  console.error('errore:', e.message);
  chiudi(1);
}
