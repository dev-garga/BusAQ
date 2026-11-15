// Prova dell'app in un browser vero, con l'orologio fissato.
//
//     node --test tools/prova_pagina.mjs          (serve Chrome o Chromium e Node 22+)
//
// I collaudi di prova_orari.mjs coprono la logica; questi coprono cio' che la logica non puo'
// vedere: che la pagina si carichi senza errori, che i controlli facciano quello che dicono, e
// che le scorciatoie restino ferme mentre si cambia tratta (e' stato un difetto: erano una
// cronologia che si riordinava a ogni scelta).
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { avvia } from './chrome.mjs';

const testo = (b, sel) => b.valuta(`document.querySelector(${JSON.stringify(sel)})?.textContent.trim() ?? null`);
const tutti = (b, sel) => b.valuta(`[...document.querySelectorAll(${JSON.stringify(sel)})].map(e => e.textContent.trim().replace(/\\s+/g, ' '))`);
const conta = (b, sel) => b.valuta(`document.querySelectorAll(${JSON.stringify(sel)}).length`);

const GIORNO = '2026-10-07T12:07:00';       // mercoledi'
const SERA = '2026-10-07T23:30:00';
const DOMENICA = '2026-10-11T10:00:00';
const FESTIVO = '2026-12-08T10:00:00';      // martedi', Immacolata

let b;
const aperti = [];
const nuovo = async (ora) => { const x = await avvia(ora); aperti.push(x); await x.apri(); return x; };
after(() => aperti.forEach(x => x.chiudi()));

test('di giorno: si carica senza errori e mostra pannello, passate e successive', async () => {
  b = await nuovo(GIORNO);
  assert.deepEqual(b.errori, [], 'errori nella pagina');
  assert.equal(await testo(b, '.testata h1'), 'Bus AQ');
  assert.equal(await conta(b, '.led'), 1, 'un solo pannello LED');
  assert.ok(await conta(b, '.card.past') > 3, 'le corse gia\' partite stanno sopra, nella stessa lista');
  assert.ok(await conta(b, '.card:not(.past)') > 3, 'le successive stanno sotto');
  assert.match(await testo(b, '#foot'), /App non ufficiale/);
  // Il pannello LED e' disegnato a punti: l'etichetta accessibile e' il testo vero.
  assert.match(await b.valuta("document.querySelector('.led .punti').getAttribute('aria-label')"), /^(ORA|\d+′|\d+h\d\d)$/);
});

test('le due scorciatoie restano ferme quando si cambia tratta', async () => {
  const prima = await tutti(b, '.scorciatoia');
  assert.equal(prima.length, 2);
  await b.clic('#f-dest');
  await b.aspetta("document.querySelector('.sheet-bg.open')");
  await b.valuta("[...document.querySelectorAll('.opt')].find(o => o.textContent.includes('Collemaggio')).click()");
  await b.aspetta("document.getElementById('v-dest').textContent.includes('Collemaggio')");
  assert.deepEqual(await tutti(b, '.scorciatoia'), prima, 'le scorciatoie si sono mosse');
  assert.equal(await conta(b, '.scorciatoia.on'), 0, 'nessuna scorciatoia corrisponde a questa tratta');
});

test('una scorciatoia riporta alla sua tratta e si accende', async () => {
  await b.clic('.scorciatoia');
  await b.aspetta("document.getElementById('v-dest').textContent.includes('Coppito')");
  assert.equal(await testo(b, '#v-origin'), 'Fontana Luminosa');
  assert.equal(await conta(b, '.scorciatoia.on'), 1);
});

test('il tasto di inversione scambia partenza e arrivo', async () => {
  await b.clic('#swap');
  await b.aspetta("document.getElementById('v-origin').textContent.includes('Coppito')");
  assert.equal(await testo(b, '#v-dest'), 'Fontana Luminosa');
  assert.equal(await conta(b, '.scorciatoia.on'), 1, 'la tratta inversa e\' la seconda scorciatoia');
});

test('il selettore disattiva le fermate senza corsa diretta, col motivo', async () => {
  // Da L'Aquilone a Via Strinella non c'e' nessuna corsa diretta (le due fermate non sono mai sullo stesso giro).
  const f = await nuovo(GIORNO);
  await f.valuta(`localStorage.setItem('busaq.route.v2', JSON.stringify({ origin: 'aquilone', dest: 'terminal' }))`);
  await f.apri();
  await f.clic('#f-dest');
  await f.aspetta("document.querySelector('.sheet-bg.open')");
  const opt = await f.valuta(`[...document.querySelectorAll('.opt')].map(o => ({ nome: o.querySelector('.nm').textContent, spenta: o.disabled, sub: o.querySelector('.sub')?.textContent ?? '' }))`);
  const strinella = opt.find(o => o.nome === 'Via Strinella');
  assert.ok(strinella && strinella.spenta, 'Via Strinella dovrebbe essere spenta');
  assert.match(strinella.sub, /Nessuna corsa diretta da L’Aquilone/);
  assert.ok(opt.filter(o => !o.spenta).length >= 2, 'le altre restano scegliibili');
});

test('domani: giornata intera, senza conto alla rovescia', async () => {
  await b.clic('[data-day=domani]');
  await b.aspetta("document.querySelector('[data-day=domani].on')");
  assert.equal(await conta(b, '.card.past'), 0);
  assert.equal(await conta(b, '.cd'), 0, 'domani non c\'e\' un adesso');
  assert.match(await b.valuta("document.querySelector('.led .punti').getAttribute('aria-label')"), /^\d\d:\d\d$/);
  assert.match(await testo(b, '#foot'), /^\d+ corse, dalle \d\d:\d\d alle \d\d:\d\d/);
  assert.deepEqual(b.errori, []);
});

test('di sera: niente da prendere, e domani e\' a un tocco', async () => {
  const sera = await nuovo(SERA);
  assert.equal(await conta(sera, '.led'), 0);
  assert.match(await testo(sera, '#cards .empty.inline strong'), /Nessun’altra corsa oggi/);
  assert.ok(await conta(sera, '.card.past') > 5, 'le corse della giornata restano consultabili');
  await sera.clic('.vedi-domani');
  await sera.aspetta("document.querySelector('[data-day=domani].on')");
  assert.equal(await conta(sera, '.led'), 1);
  assert.deepEqual(sera.errori, []);
});

test('domenica e festivi: orario festivo, con le sole corse festive', async () => {
  for (const [ora, avviso] of [[DOMENICA, /Domenica · Orario festivo/], [FESTIVO, /Immacolata · Orario festivo/]]) {
    const f = await nuovo(ora);
    assert.match(await testo(f, '#banner-text'), avviso);
    assert.ok(await conta(f, '.led, .card') > 0, 'la tratta predefinita ha corse festive (2UF)');
    assert.deepEqual(f.errori, []);
  }
});

test('una tratta senza servizio festivo lo dice invece di restare vuota', async () => {
  const f = await nuovo(DOMENICA);
  await f.valuta(`localStorage.setItem('busaq.route.v2', JSON.stringify({ origin: 'via_strinella', dest: 'uni' }))`);
  await f.apri();
  assert.match(await testo(f, '#cards .empty strong'), /Nessuna corsa oggi/);
  assert.match(await testo(f, '#cards .empty'), /nei giorni festivi/);
});
