// Collaudo della logica degli orari, sugli orari veri.
//
//     node --test tools/prova_orari.mjs
//
// Ogni caso qui dentro e' un controllo che ho fatto a mano almeno una volta e che
// nessuno rifarebbe: le coppie servite, il sabato, la domenica, il consiglio
// sull'arrivo piu' rapido, la giornata di domani.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  indicizza, corse, arrivoPiuRapido, servita, linee, notaApprossimazione,
  attesa, etichettaAttesa, giorniLabel, dataEstesa, minuti
} from '../orari.js';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const idx = indicizza(JSON.parse(readFileSync(join(RADICE, 'schedule.json'), 'utf8')));

const MER = 3, SAB = 6, DOM = 0;
const ore = t => minuti(t);

test('l\'indice trova le fermate e le coppie servite', () => {
  assert.equal(idx.fermate.length, 6);
  assert.equal(idx.servite.size, 26);
  assert.ok(servita(idx, 'fontana_luminosa', 'uni'));
  assert.ok(servita(idx, 'aquilone', 'terminal'));
  // fermate adiacenti senza collegamento diretto pubblicato
  assert.ok(!servita(idx, 'via_panella', 'fontana_luminosa'));
  assert.ok(!servita(idx, 'aquilone', 'via_strinella'));
});

test('di domenica non circola niente, su qualunque tratta', () => {
  for (const [a, b] of [['fontana_luminosa', 'uni'], ['terminal', 'aquilone']]) {
    const { passate, future } = corse(idx, { partenza: a, arrivo: b, dow: DOM, adesso: ore('08:00') });
    assert.equal(future.length, 0);
    assert.equal(passate.length, 0);
  }
});

test('ogni corsa arriva dopo essere partita, e in ordine di partenza', () => {
  for (const [a, b] of [...idx.servite].map(k => k.split('>'))) {
    const { future } = corse(idx, { partenza: a, arrivo: b, dow: MER, adesso: 0, tutte: true });
    assert.ok(future.length > 0, `${a}>${b} non ha corse`);
    for (const t of future) assert.ok(t.arrMin > t.depMin, `${a}>${b} ${t.dep}->${t.arr}`);
    for (let i = 1; i < future.length; i++)
      assert.ok(future[i].depMin >= future[i - 1].depMin, 'non ordinate');
  }
});

test('il sabato esclude le corse del solo lunedi-venerdi, salvo chiederle tutte', () => {
  const arg = { partenza: 'uni', arrivo: 'terminal', dow: SAB, adesso: ore('07:00') };
  const soloOggi = corse(idx, arg).future;
  const proprioTutte = corse(idx, { ...arg, tutte: true }).future;

  assert.ok(proprioTutte.length > soloOggi.length, 'il sabato dovrebbe escludere qualcosa');
  for (const t of soloOggi) assert.ok(t.days.includes(SAB));
  assert.ok(proprioTutte.some(t => !t.days.includes(SAB)));
});

test('le corse passate si fermano a un\'ora indietro', () => {
  const { passate } = corse(idx, {
    partenza: 'terminal', arrivo: 'uni', dow: MER, adesso: ore('12:00')
  });
  for (const t of passate) {
    assert.ok(t.diff < 0 && t.diff > -60, `${t.dep} e' fuori dalla finestra`);
  }
});

test('caso reale: alle 10:45 da Collemaggio conviene la corsa dopo', () => {
  const { future } = corse(idx, {
    partenza: 'terminal', arrivo: 'uni', dow: MER, adesso: ore('10:45')
  });
  arrivoPiuRapido(future, 3);

  const consigliata = future.find(t => t.guadagno);
  assert.ok(consigliata, 'nessun consiglio dove me ne aspettavo uno');
  assert.equal(consigliata.dep, '10:50');
  assert.equal(consigliata.arr, '11:00');
  assert.equal(consigliata.guadagno, 20);
  assert.equal(consigliata.stessaPartenza, false);
  assert.ok(future.indexOf(consigliata) > 0, 'non e\' gia\' la prima a partire');
});

test('il consiglio tace quando il guadagno e\' sotto la soglia', () => {
  const { future } = corse(idx, {
    partenza: 'fontana_luminosa', arrivo: 'terminal', dow: MER, adesso: ore('08:00')
  });
  const quante = arrivoPiuRapido(future, 3);
  const consigliata = future.find(t => t.guadagno);
  if (consigliata) assert.ok(consigliata.guadagno >= 5);
  assert.ok(quante >= 3);
});

test('il consiglio allunga l\'elenco fino a rendere visibile la corsa', () => {
  const { future } = corse(idx, {
    partenza: 'terminal', arrivo: 'uni', dow: MER, adesso: ore('10:45')
  });
  const quante = arrivoPiuRapido(future, 1);
  const consigliata = future.find(t => t.guadagno);
  assert.ok(quante > future.indexOf(consigliata) || quante >= future.indexOf(consigliata) + 1);
});

test('la giornata intera non ha ne\' presente ne\' passato', () => {
  const { passate, future } = corse(idx, {
    partenza: 'fontana_luminosa', arrivo: 'uni', dow: MER, adesso: null
  });
  assert.equal(passate.length, 0);
  assert.ok(future.length > 30, 'una giornata intera dovrebbe avere molte corse');
  for (const t of future) assert.equal(t.diff, null, 'niente conto alla rovescia domani');
});

test('la stessa corsa vista da due pannelli compare una volta sola', () => {
  const { future } = corse(idx, {
    partenza: 'uni', arrivo: 'aquilone', dow: MER, adesso: null, tutte: true
  });
  const chiavi = future.map(t => t.line + t.dep + t.arr);
  assert.equal(new Set(chiavi).size, chiavi.length, 'ci sono doppioni');

  // 14D 07:45: pubblicata due volte, una con il vincolo scolastico e una senza.
  // Vince la meno restrittiva: non va etichettata come scolastica.
  const doppia = future.find(t => t.dep === '07:45' && t.arr === '08:10');
  assert.ok(doppia, 'manca la corsa delle 07:45');
  assert.equal(doppia.scolastica, false);
});

test('le descrizioni delle fermate', () => {
  assert.deepEqual(linee(idx, 'fontana_luminosa', 'uni').sort(), ['1', '3', 'A']);
  const nota = notaApprossimazione(idx, 'via_panella');
  assert.equal(nota.length, 1);
  assert.ok(!nota[0].startsWith('Linea '), 'vale per piu\' linee: non va attribuita a una sola');
  assert.ok(notaApprossimazione(idx, 'fontana_luminosa')[0].startsWith('Linea 1 ·'));
  assert.deepEqual(notaApprossimazione(idx, 'terminal'), []);
});

test('formattazione', () => {
  assert.equal(attesa(25), '25\u2032');
  assert.equal(attesa(60), '1h');
  assert.equal(attesa(85), '1h 25');
  assert.deepEqual(etichettaAttesa(0), ['Ora', 'now']);
  assert.deepEqual(etichettaAttesa(-30), ['30\u2032 fa', 'past']);
  assert.deepEqual(etichettaAttesa(5), ['5\u2032', 'now']);
  assert.deepEqual(etichettaAttesa(30), ['30\u2032', 'soon']);
  assert.deepEqual(etichettaAttesa(90), ['1h 30', '']);
  assert.equal(giorniLabel([1, 2, 3, 4, 5]), 'lun–ven');
  assert.equal(giorniLabel([1, 5]), 'lun e ven');
  assert.equal(dataEstesa('2026-09-16'), '16 settembre 2026');
});
