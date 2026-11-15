// Catture dello schermo dell'app a viewport mobile vero e orologio fissato.
//
//     node tools/catture.mjs                      # 12:07 di mercoledi' 7 ottobre 2026
//     node tools/catture.mjs --ora 2026-10-11T10:00:00 --out catture/domenica
//
// Serve per guardare l'app come la vedrebbe un telefono, e per ripetere la stessa schermata
// dopo una modifica. A fine giornata non c'e' nessuna prossima corsa e il pannello LED non
// compare: per questo l'orologio va fissato a un orario in cui ce ne sono. Il codice di Chrome
// (server statico, orologio, viewport) sta in tools/chrome.mjs.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { avvia, RADICE } from './chrome.mjs';

const arg = (nome, predefinito) => {
  const i = process.argv.indexOf('--' + nome);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : predefinito;
};
const ORA = arg('ora', '2026-10-07T12:07:00');
const OUT = resolve(arg('out', join(RADICE, 'catture')));

const browser = await avvia(ORA);
try {
  mkdirSync(OUT, { recursive: true });
  for (const [nome, larghezza, altezza, dpr, tema] of [   // nome, larghezza, altezza, pixel per punto, tema
    ['mobile-chiaro.png', 390, 844, 3, 'light'],
    ['mobile-scuro.png', 393, 852, 3, 'dark'],
    ['desktop.png', 1440, 900, 1, 'light'],
  ]) {
    await browser.apri({ larghezza, altezza, dpr, tema });
    writeFileSync(join(OUT, nome), await browser.screenshot());
    console.log(`scritto ${join(OUT, nome)}  (${larghezza}x${altezza}, ${tema}, orologio ${ORA})`);
  }
} catch (e) {
  console.error('errore:', e.message);
  process.exitCode = 1;
} finally {
  browser.chiudi();
}
