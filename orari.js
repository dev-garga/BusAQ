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

// Se piu' linee condividono lo stesso motivo, citarne una sola era fuorviante.
export function notaApprossimazione(idx, fermata) {
  const per = new Map();
  for (const d of idx.direzioni) {
    const motivo = d.approx && d.approx[fermata];
    if (!motivo) continue;
    if (!per.has(motivo)) per.set(motivo, []);
    per.get(motivo).push(idx.meta.lines[d.line].num + idx.meta.lines[d.line].sub);
  }
  return [...per].map(([motivo, righe]) => {
    const u = [...new Set(righe)];
    const cap = motivo.charAt(0).toUpperCase() + motivo.slice(1);
    return u.length > 1 ? cap : 'Linea ' + u[0] + ' · ' + cap;
  });
}

// ── Corse ─────────────────────────────────────
// `adesso: null` significa "giornata intera": e' il caso di domani, dove non
// esiste un momento presente attorno a cui dividere passato e futuro.
export function corse(idx, { partenza, arrivo, dow, adesso = null, tutte = false }) {
  const out = { passate: [], future: [] };
  if (dow === 0) return out;                     // domenica: nessun servizio AMA

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
      if (!oggi && !tutte) continue;

      const k = d.line + dep + arr;
      const e = {
        dep, arr, depMin, arrMin, dur: arrMin - depMin,
        diff: intera ? null : depMin - adesso,
        line: d.line, side: d.side, variant: r.variant,
        scolastica: !!r.scolastica, ignota: r.nota_ignota, oggi, days,
        approx: !!(d.approx && (d.approx[partenza] || d.approx[arrivo]))
      };

      // Stessa linea, stessa partenza, stesso arrivo: e' la stessa corsa vista da
      // due pannelli del PDF. Vince la versione meno restrittiva — se altrove la
      // corsa e' pubblicata senza vincolo scolastico, non va etichettata come tale.
      const gia = viste.get(k);
      if (gia) {
        if (gia.scolastica && !e.scolastica) gia.scolastica = false;
        if (e.days.length > gia.days.length) { gia.days = e.days; gia.oggi = e.oggi; }
        continue;
      }
      viste.set(k, e);

      if (intera) out.future.push(e);
      else if (e.diff < -2) { if (e.diff > -60) out.passate.push(e); }
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
