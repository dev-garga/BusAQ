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
  attesa, etichettaAttesa, giorniLabel, dataEstesa, minuti,
  pasqua, festivita, giornoServizio
} from '../orari.js';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const idx = indicizza(JSON.parse(readFileSync(join(RADICE, 'schedule.json'), 'utf8')));

const MER = 3, SAB = 6, DOM = 0;
const linea = t => idx.meta.lines[t.line].num + idx.meta.lines[t.line].sub;
const ore = t => minuti(t);

test('l\'indice trova le fermate e le coppie servite', () => {
  assert.equal(idx.fermate.length, 6);
  // 28 dagli orari ufficiali: le due in piu' rispetto alle bozze sono Panella <-> Fontana,
  // ora che Panella prende l'orario di via Cencioni e non quello di Fontana stessa.
  assert.equal(idx.servite.size, 28);
  assert.ok(servita(idx, 'via_panella', 'fontana_luminosa'));
  assert.ok(servita(idx, 'fontana_luminosa', 'via_panella'));
  assert.ok(servita(idx, 'fontana_luminosa', 'uni'));
  assert.ok(servita(idx, 'aquilone', 'terminal'));
  // fermate senza collegamento diretto pubblicato
  assert.ok(!servita(idx, 'aquilone', 'via_strinella'));
  assert.ok(!servita(idx, 'via_strinella', 'aquilone'));
});

test('di domenica circolano solo le corse festive', () => {
  for (const [a, b] of [['fontana_luminosa', 'uni'], ['terminal', 'aquilone'], ['aquilone', 'terminal']]) {
    const { future } = corse(idx, { partenza: a, arrivo: b, dow: DOM, adesso: null });
    assert.ok(future.length > 0, `${a}>${b}: nessuna corsa festiva`);
    for (const t of future) assert.deepEqual(t.days, [DOM], `${a}>${b} ${t.dep}: non e' festiva`);
  }
  // Fontana -> Coppito la domenica: solo la 2UF, passando da Viale Gran Sasso.
  const fontana = corse(idx, { partenza: 'fontana_luminosa', arrivo: 'uni', dow: DOM, adesso: null }).future;
  assert.deepEqual([...new Set(fontana.map(linea))], ['2UF']);
  assert.ok(fontana.every(t => t.approx), 'orario di Gran Sasso: va dichiarato stimato');
  // Strinella non ha servizio festivo.
  assert.equal(corse(idx, { partenza: 'via_strinella', arrivo: 'uni', dow: DOM, adesso: null }).future.length, 0);
});

test('nei festivi infrasettimanali vale l\'orario festivo', () => {
  const immacolata = new Date(2026, 11, 8);          // martedi'
  assert.equal(immacolata.getDay(), 2);
  assert.equal(giornoServizio(immacolata), DOM);
  const { future } = corse(idx, { partenza: 'terminal', arrivo: 'uni', dow: giornoServizio(immacolata), adesso: null });
  assert.ok(future.length > 0);
  assert.ok(future.every(t => t.days.length === 1 && t.days[0] === DOM), 'una corsa feriale l\'8 dicembre');
});

test('festivita\' e Pasqua', () => {
  assert.equal(pasqua(2026).toDateString(), new Date(2026, 3, 5).toDateString());
  assert.equal(pasqua(2027).toDateString(), new Date(2027, 2, 28).toDateString());
  assert.equal(festivita(new Date(2026, 3, 6)), 'Pasquetta');
  assert.equal(festivita(new Date(2027, 2, 29)), 'Pasquetta');
  assert.equal(festivita(new Date(2026, 11, 8)), 'Immacolata');
  assert.equal(festivita(new Date(2026, 11, 9)), null);
  // Il patrono non e' in calendario: San Massimo non ha data fissa.
  assert.equal(festivita(new Date(2026, 5, 14)), null);
  assert.equal(giornoServizio(new Date(2026, 9, 7)), MER);
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

test('caso reale: alle 8:00 da Collemaggio conviene la corsa dopo', () => {
  // Verificato sui PDF: la 3 delle 08:00 arriva a Coppito alle 08:40 passando da
  // Cansatessa (Orario-3, p1); la 12 delle 08:05 alle 08:20 (Orario-12, p1).
  const { future } = corse(idx, {
    partenza: 'terminal', arrivo: 'uni', dow: MER, adesso: ore('08:00')
  });
  arrivoPiuRapido(future, 3);

  assert.equal(future[0].dep, '08:00');
  assert.equal(future[0].arr, '08:40');
  const consigliata = future.find(t => t.guadagno);
  assert.ok(consigliata, 'nessun consiglio dove me ne aspettavo uno');
  assert.equal(linea(consigliata), '12');
  assert.equal(consigliata.dep, '08:05');
  assert.equal(consigliata.arr, '08:20');
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
    partenza: 'terminal', arrivo: 'uni', dow: MER, adesso: ore('08:00')
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
  assert.deepEqual(linee(idx, 'fontana_luminosa', 'uni').sort(), ['1', '2UF', '3', 'A']);
  // Panella: nessuna linea pubblica un orario suo, e i motivi sono due. Ognuno dice
  // a quali linee si riferisce.
  assert.deepEqual(notaApprossimazione(idx, 'via_panella').sort(), [
    'Linee 1, 2U, 2UF: orario di via Cencioni',
    'Linee A, B: orario di Fontana Luminosa',
  ]);
  // Fontana: la A e la 3 pubblicano l'orario vero, quindi la nota non puo' essere generica.
  assert.deepEqual(notaApprossimazione(idx, 'fontana_luminosa'), ['Linee 1, 2UF: orario di Viale Gran Sasso']);
  assert.deepEqual(notaApprossimazione(idx, 'uni'), ['Linee 2UF, M14F: orario della fermata Ospedale']);
  assert.deepEqual(notaApprossimazione(idx, 'terminal'), []);
});

test('le corse dei soli periodi non scolastici sono segnalate', () => {
  // Legenda AMA: "N = la corsa si effettua solo nei periodi non scolastici".
  const { future } = corse(idx, { partenza: 'uni', arrivo: 'terminal', dow: MER, adesso: null });
  const n13 = future.find(t => t.line === 'linea13' && t.dep === '07:15');
  assert.ok(n13, 'manca la 13 delle 07:15');
  assert.equal(n13.vacanze, true);
  assert.equal(n13.scolastica, false);
});

test('una corsa pubblicata sia come S sia come N circola sempre', () => {
  // La 15 delle 07:32 compare due volte nel PDF: una S (solo scuola) e una N (solo
  // vacanze). Unite: tutto l'anno, senza etichetta. Vale in entrambi gli ordini.
  const { future } = corse(idx, { partenza: 'uni', arrivo: 'terminal', dow: MER, adesso: null });
  const c15 = future.filter(t => t.line === 'linea15' && t.dep === '07:32');
  assert.equal(c15.length, 1, 'doppione non unito');
  assert.equal(c15[0].scolastica, false);
  assert.equal(c15[0].vacanze, false);

  const finto = { _meta: idx.meta, directions: [{ id: 'x', line: 'linea15', stops: ['uni', 'terminal'],
    runs: [{ t: ['07:00', '07:30'], vacanze: true }, { t: ['07:00', '07:30'], scolastica: true }] }] };
  const [unica] = corse(indicizza(finto), { partenza: 'uni', arrivo: 'terminal', dow: MER, adesso: null }).future;
  assert.equal(unica.scolastica, false);
  assert.equal(unica.vacanze, false);
});

test('linea 1: nessuna partenza fantasma da L\'Aquilone alle 07:00', () => {
  // Il PDF stampa 07:00 sia a L'Aquilone sia a Finanza: la corsa parte da Finanza.
  // Le bozze la davano come L'Aquilone 07:00 -> Universita' 07:02.
  const { future } = corse(idx, { partenza: 'aquilone', arrivo: 'uni', dow: MER, adesso: null });
  for (const t of future) assert.ok(t.dur >= 4, `${t.dep} -> ${t.arr}: ${t.dur} minuti`);
  assert.ok(!future.some(t => t.dep === '07:00' && t.line === 'linea1'));
});

test('"tutte le corse" il sabato non aggiunge le festive', () => {
  const { future } = corse(idx, { partenza: 'terminal', arrivo: 'aquilone', dow: SAB, adesso: null, tutte: true });
  assert.ok(!future.some(t => t.days.length === 1 && t.days[0] === DOM));
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
