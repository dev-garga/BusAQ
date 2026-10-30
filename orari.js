// Logica degli orari: nessun riferimento al DOM, nessun effetto collaterale.
// Sta separata dalla vista perche' cosi' si puo' collaudare da riga di comando
// (`node --test tools/prova_orari.mjs`) invece che solo aprendo un browser e
// guardando: tutti i controlli fatti finora erano manuali e irripetibili.

export const GUADAGNO_MIN = 5;   // sotto questa soglia il consiglio sarebbe rumore
export const FINESTRA_MIN = 30;  // quanto avanti guardare per un arrivo migliore

const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const GIORNI_LUNGHI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
              'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

export const minuti = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const chiave = (a, b) => a + '>' + b;

// ── Formattazione ─────────────────────────────
// I minuti si scrivono col primo: 25′, e le ore per esteso: 1h 25. L'unita' non
// compare mai due volte nella stessa espressione.
export function attesa(m) {
  if (m < 60) return m + '′';
  const h = Math.floor(m / 60), r = m % 60;
  return r ? h + 'h ' + String(r).padStart(2, '0') : h + 'h';
}

export function etichettaAttesa(diff) {
  if (diff >= -2 && diff < 2) return ['Ora', 'now'];
  if (diff < 0) return [attesa(-diff) + ' fa', 'past'];
  return [attesa(diff), diff < 10 ? 'now' : diff < 60 ? 'soon' : ''];
}

// 'non oggi' non diceva perche'. I giorni di servizio sono nei dati: si scrivono.
export function giorniLabel(days) {
  const d = [...days].sort((a, b) => a - b);
  const contigui = d.every((v, i) => i === 0 || v === d[i - 1] + 1);
  return d.length > 2 && contigui ? GIORNI[d[0]] + '–' + GIORNI[d[d.length - 1]]
                                  : d.map(x => GIORNI[x]).join(' e ');
}

export const giornoBreve = dow => GIORNI[dow];

// ── Festivi ───────────────────────────────────
// Nei festivi AMA segue l'orario festivo (2UF, M14F…) e le linee feriali non
// circolano. Senza calendario, l'8 dicembre l'app mostrerebbe corse che non esistono.
// Niente patrono: San Massimo non ha data fissa (nel 2026 cade il 14 giugno).
const FESTE_FISSE = {
  '1-1': 'Capodanno', '1-6': 'Epifania', '4-25': 'Festa della Liberazione',
  '5-1': 'Festa del lavoro', '6-2': 'Festa della Repubblica', '8-15': 'Ferragosto',
  '11-1': 'Ognissanti', '12-8': 'Immacolata', '12-25': 'Natale', '12-26': 'Santo Stefano'
};

// Domenica di Pasqua nel calendario gregoriano (algoritmo di Meeus/Jones/Butcher).
export function pasqua(anno) {
  const a = anno % 19, b = Math.floor(anno / 100), c = anno % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31), giorno = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(anno, mese - 1, giorno);
}

// Nome della festivita' o null. Le domeniche non hanno nome: sono festive e basta.
export function festivita(data) {
  const fissa = FESTE_FISSE[(data.getMonth() + 1) + '-' + data.getDate()];
  if (fissa) return fissa;
  const lunedi = pasqua(data.getFullYear());
  lunedi.setDate(lunedi.getDate() + 1);
  return lunedi.getMonth() === data.getMonth() && lunedi.getDate() === data.getDate()
    ? 'Pasquetta' : null;
}

// Il giorno della settimana secondo cui circolano gli autobus: 0 nei festivi.
export const giornoServizio = data => festivita(data) ? 0 : data.getDay();
export const giornoLungo = dow => GIORNI_LUNGHI[dow];

export function dataEstesa(iso) {
  const [y, m, d] = (iso || '').split('-');
  return MESI[+m - 1] ? +d + ' ' + MESI[+m - 1] + ' ' + y : iso;
}

// ── Indice ────────────────────────────────────
// Le coppie servite si calcolano una volta sola: una coppia vale se in qualche
// direzione l'origine precede la destinazione e almeno una corsa ha l'orario a
// entrambe le fermate.
export function indicizza(dati) {
  const meta = dati._meta, direzioni = dati.directions;
  const servite = new Set(), usate = new Set();

  for (const d of direzioni) {
    for (let i = 0; i < d.stops.length; i++) {
      for (let j = i + 1; j < d.stops.length; j++) {
        const utile = d.runs.some(r => r.t[i] && r.t[j] && minuti(r.t[j]) > minuti(r.t[i]));
        if (!utile) continue;
        servite.add(chiave(d.stops[i], d.stops[j]));
        usate.add(d.stops[i]); usate.add(d.stops[j]);
      }
    }
  }
  return { meta, direzioni, servite, fermate: Object.keys(meta.stops).filter(s => usate.has(s)) };
}

export const servita = (idx, a, b) => idx.servite.has(chiave(a, b));

export function linee(idx, a, b) {
  const out = new Set();
  for (const d of idx.direzioni) {
    const i = d.stops.indexOf(a), j = d.stops.indexOf(b);
    if (i < 0 || j < 0 || i >= j) continue;
    if (d.runs.some(r => r.t[i] && r.t[j] && minuti(r.t[j]) > minuti(r.t[i])))
      out.add(idx.meta.lines[d.line].num + idx.meta.lines[d.line].sub);
  }
  return [...out];
}

// Un motivo per riga: "Linee 1, 2UF: orario di Viale Gran Sasso". Il nome delle linee
// si omette solo se il motivo vale per TUTTE quelle che servono la fermata: sotto
// Fontana Luminosa non va scritto in generale, perche' la A e la 3 pubblicano
// l'orario vero.
export function notaApprossimazione(idx, fermata) {
  const sigla = l => idx.meta.lines[l].num + idx.meta.lines[l].sub;
  const tutte = new Set(idx.direzioni.filter(d => d.stops.includes(fermata)).map(d => sigla(d.line)));
  const per = new Map();
  for (const d of idx.direzioni) {
    const motivo = d.approx && d.approx[fermata];
    if (!motivo) continue;
    if (!per.has(motivo)) per.set(motivo, new Set());
    per.get(motivo).add(sigla(d.line));
  }
  return [...per].map(([motivo, linee]) => {
    if (linee.size === tutte.size) return motivo.charAt(0).toUpperCase() + motivo.slice(1);
    return (linee.size > 1 ? 'Linee ' : 'Linea ') + [...linee].join(', ') + ': ' + motivo;
  });
}

// ── Corse ─────────────────────────────────────
const SCUOLA = 1, VACANZE = 2;
const periodi = t => t.scolastica ? SCUOLA : t.vacanze ? VACANZE : SCUOLA | VACANZE;

// `adesso: null` significa "giornata intera": e' il caso di domani, dove non
// esiste un momento presente attorno a cui dividere passato e futuro. Quali corse
// circolano la domenica lo dicono i dati (le linee festive hanno days [0]), non una
// regola scritta qui: prima la domenica si scartava tutto, e la 2UF non compariva mai.
export function corse(idx, { partenza, arrivo, dow, adesso = null, tutte = false }) {
  const out = { passate: [], future: [] };

  const intera = adesso === null, viste = new Map();

  for (const d of idx.direzioni) {
    const i = d.stops.indexOf(partenza), j = d.stops.indexOf(arrivo);
    if (i < 0 || j < 0 || i >= j) continue;      // rispetta l'ordine di percorso

    for (const r of d.runs) {
      const dep = r.t[i], arr = r.t[j];
      if (!dep || !arr) continue;
      const depMin = minuti(dep), arrMin = minuti(arr);
      if (arrMin <= depMin) continue;

      const days = r.days || idx.meta.default_days;
      const oggi = days.includes(dow);
      // "Tutte le corse" serve a vedere il sabato quelle del solo lun-ven: le festive
      // non c'entrano, e in un giorno feriale sarebbero solo rumore.
      const festiva = days.length === 1 && days[0] === 0;
      if (!oggi && !(tutte && !festiva)) continue;

      const k = d.line + dep + arr;
      const e = {
        dep, arr, depMin, arrMin, dur: arrMin - depMin,
        diff: intera ? null : depMin - adesso,
        line: d.line, side: d.side, variant: r.variant,
        scolastica: !!r.scolastica, vacanze: !!r.vacanze, ignota: r.nota_ignota, oggi, days,
        approx: !!(d.approx && (d.approx[partenza] || d.approx[arrivo]))
      };

      // Stessa linea, stessa partenza, stesso arrivo: e' la stessa corsa pubblicata
      // due volte. Spesso una volta come S (solo periodo scolastico) e una come N (solo
      // vacanze): insieme vogliono dire "sempre". I periodi si uniscono — prima vinceva
      // la versione incontrata per prima, e una corsa che circola tutto l'anno poteva
      // risultare "solo vacanze".
      const gia = viste.get(k);
      if (gia) {
        const u = periodi(gia) | periodi(e);
        gia.scolastica = u === SCUOLA;
        gia.vacanze = u === VACANZE;
        if (e.days.length > gia.days.length) { gia.days = e.days; gia.oggi = e.oggi; }
        continue;
      }
      viste.set(k, e);

      if (intera) out.future.push(e);
      // Le corse gia' partite restano tutte, non solo l'ultima ora: si sfogliano
      // scorrendo la lista verso l'alto. Prima si tagliavano a 60 minuti.
      else if (e.diff < -2) out.passate.push(e);
      else out.future.push(e);
    }
  }

  const perOra = (a, b) => a.depMin - b.depMin || a.line.localeCompare(b.line);
  out.passate.sort(perOra); out.future.sort(perOra);
  return out;
}

// Segnala la corsa che arriva prima, se non e' gia' la prima a partire: capita che
// convenga aspettare il bus dopo perche' fa un giro piu' diretto. Restituisce quante
// schede servono perche' la corsa consigliata sia visibile — un consiglio che rimanda
// a una scheda nascosta non servirebbe a niente.
export function arrivoPiuRapido(future, quante) {
  future.forEach(t => { delete t.guadagno; delete t.stessaPartenza; });
  if (future.length < 2) return quante;

  const vicine = future.filter(t => t.depMin <= future[0].depMin + FINESTRA_MIN);
  let best = vicine[0];
  for (const t of vicine) if (t.arrMin < best.arrMin) best = t;

  const guadagno = vicine[0].arrMin - best.arrMin;
  if (best === vicine[0] || guadagno < GUADAGNO_MIN) return quante;

  best.guadagno = guadagno;
  best.stessaPartenza = best.depMin === vicine[0].depMin;
  return Math.max(quante, future.indexOf(best) + 1);
}
