// Stato, disegno ed eventi. Il calcolo degli orari sta in orari.js e non conosce
// il DOM: qui non si decide mai quali corse esistono, solo come si mostrano.
import {
  indicizza, corse, arrivoPiuRapido, servita, linee, notaApprossimazione,
  etichettaAttesa, giorniLabel, giornoBreve, giornoLungo, dataEstesa, chiave
} from './orari.js';

const $ = id => document.getElementById(id);
const maiuscola = t => t.charAt(0).toUpperCase() + t.slice(1);

// ── Stato ─────────────────────────────────────
// Un oggetto solo e un solo punto di modifica. Prima erano otto variabili sparse,
// con l'azzeramento dell'impaginazione ripetuto a mano in quattro punti: bastava
// scordarlo una volta per ritrovarsi l'elenco della tratta precedente.
const stato = {
  partenza: null,
  arrivo: null,
  giorno: 'oggi',      // 'oggi' | 'domani'
  tutte: false,        // mostra anche le corse che oggi non circolano
  precedenti: false,   // elenco delle corse gia' passate
  quante: 3,           // quante corse future in elenco
  preferite: []        // due scorciatoie fisse, slegate dalla selezione
};

function aggiorna(modifica) {
  Object.assign(stato, modifica);
  salva();
  disegna();
}

let idx = null;

// ── Preferenze ────────────────────────────────
// v2: prima le due tratte in cima erano "recenti" e si riordinavano a ogni
// selezione. Sono scorciatoie fisse, non una cronologia.
const PREF = 'busaq.route.v2';
const TRATTA_INIZIALE = ['fontana_luminosa', 'uni'];
const QUANTE_PREFERITE = 2;

// Chiavi delle versioni precedenti, rimaste sui dispositivi dopo i cambi di modello.
try { ['busaq.stops.v3', 'busaq.route.v1'].forEach(k => localStorage.removeItem(k)); } catch (e) {}

function leggiPref() { try { return JSON.parse(localStorage.getItem(PREF)) || {}; } catch (e) { return {}; } }
function salva() {
  try {
    localStorage.setItem(PREF, JSON.stringify({
      origin: stato.partenza, dest: stato.arrivo, preferite: stato.preferite
    }));
  } catch (e) {}
}

function ripristina() {
  const p = leggiPref();
  const [ca, cb] = TRATTA_INIZIALE;
  const valida = r => Array.isArray(r) && servita(idx, r[0], r[1]);

  // Le predefinite si completano coi valori di riserva se ne mancano: due righe
  // sempre, anche se una tratta sparisce da un aggiornamento degli orari.
  let pref = (p.preferite || []).filter(valida);
  for (const r of [[ca, cb], [cb, ca]]) {
    if (pref.length >= QUANTE_PREFERITE) break;
    if (valida(r) && !pref.some(x => x[0] === r[0] && x[1] === r[1])) pref.push(r);
  }
  stato.preferite = pref.slice(0, QUANTE_PREFERITE);

  if (p.origin && p.dest && servita(idx, p.origin, p.dest)) {
    stato.partenza = p.origin; stato.arrivo = p.dest;
  } else if (servita(idx, ca, cb)) {
    stato.partenza = ca; stato.arrivo = cb;
  } else {
    [stato.partenza, stato.arrivo] = [...idx.servite][0].split('>');
  }
}

// ── Etichette ─────────────────────────────────
const nome = (id, breve) => {
  const s = idx && idx.meta.stops[id];
  return s ? (breve && s.short ? s.short : s.label) : id;
};

// Il giorno della settimana di cui si stanno guardando gli orari.
const dowMostrato = () => (new Date().getDay() + (stato.giorno === 'domani' ? 1 : 0)) % 7;
const adessoMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };

function rigaMeta() {
  if (!idx) return '';
  const d = dataEstesa(idx.meta.effective);
  return idx.meta.draft ? 'Orari <span class="draft">provvisori</span>, in vigore dal ' + d
                        : 'Orari in vigore dal ' + d;
}

// ── Avvio ─────────────────────────────────────
fetch('schedule.json').then(r => r.json()).then(dati => {
  idx = indicizza(dati);
  ripristina();
  disegna();
  setInterval(disegna, 30000);
}).catch(() => {
  $('cards').innerHTML = '<div class="empty"><strong>Orari non disponibili</strong>' +
    'Non è stato possibile caricarli. Controlla la connessione e riapri l’app.</div>';
});

// ── Orologio ──────────────────────────────────
function orologio() {
  const n = new Date();
  $('clock').textContent = String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0');
}
orologio(); setInterval(orologio, 10000);

// ── Disegno ───────────────────────────────────
function disegnaTratta() {
  $('v-origin').textContent = nome(stato.partenza);
  $('v-dest').textContent = nome(stato.arrivo);
  $('preferite').style.display = stato.preferite.length ? 'flex' : 'none';
  $('preferite').innerHTML = stato.preferite.map((r, i) =>
    '<button class="scorciatoia' + (r[0] === stato.partenza && r[1] === stato.arrivo ? ' on' : '') +
      '" data-i="' + i + '"><i></i><span>' +
      nome(r[0], true) + '<b>&rarr;</b>' + nome(r[1], true) + '</span></button>').join('');
}

function disegnaGiorni() {
  const dom = (new Date().getDay() + 1) % 7;
  $('days').querySelectorAll('.day').forEach(b => {
    b.classList.toggle('on', b.dataset.day === stato.giorno);
    if (b.dataset.day === 'domani') b.innerHTML = 'Domani <small>· ' + maiuscola(giornoBreve(dom)) + '</small>';
  });
}

function disegnaAvviso(dow) {
  const banner = $('banner');
  if (dow === 0) {
    banner.style.display = 'flex'; banner.classList.add('sunday');
    $('banner-text').textContent = 'Domenica · Nessun servizio';
    $('banner-btn').style.display = 'none';
  } else if (dow === 6) {
    banner.style.display = 'flex'; banner.classList.remove('sunday');
    $('banner-text').textContent = 'Sabato · Corse ridotte';
    $('banner-btn').style.display = '';
    $('banner-btn').textContent = stato.tutte ? 'Solo oggi' : 'Tutte le corse';
  } else banner.style.display = 'none';
}

const imminente = t => t.diff !== null && t.diff >= -2 && t.diff <= 5;

// `ord` e' la posizione fra le schede NUOVE: quelle gia' a schermo non rientrano,
// altrimenti aggiungere tre corse in fondo farebbe ripartire l'intero elenco.
function scheda(t, prima, passata, ord) {
  const ln = idx.meta.lines[t.line] || { num: '?', sub: '' };
  const [cd, cdClasse] = t.diff === null ? ['', ''] : etichettaAttesa(t.diff);
  const sigla = ((t.variant && t.variant !== ln.num ? t.variant : ln.sub) || '').replace(/\s+/g, '');

  const pezzi = ['<b>' + t.dur + '′</b>'];
  // 'arrivo lato ospedale' si leggeva come "ti lascia all'ospedale". Il lato e' quello
  // della fermata di Coppito: il PDF la chiama "universita' coppito (lato ospedale)",
  // perche' il campus confina col San Salvatore e ha due fermate distinte. Dirlo su
  // una tratta che non tocca l'universita' confonderebbe invece di aiutare.
  if (t.side && stato.arrivo === 'uni')        pezzi.push('Arrivo a Coppito lato ' + t.side);
  else if (t.side && stato.partenza === 'uni') pezzi.push('Partenza da Coppito lato ' + t.side);
  if (t.approx) pezzi.push('<span class="est">Orario stimato</span>');

  let tag = '';
  if (!t.oggi)           tag = '<span class="tag warn">solo ' + giorniLabel(t.days) + '</span>';
  else if (t.ignota)     tag = '<span class="tag bad">nota ' + t.ignota + '</span>';
  else if (t.scolastica) tag = '<span class="tag">scolastica</span>';

  return '<div class="card' + (prima ? ' next' : '') + (passata ? ' past' : '') +
      (prima && imminente(t) ? ' imminente' : '') + '"' +
      (ord >= 0 ? ' data-in style="--i:' + ord + '"' : '') + '>' +
    '<div class="badge"><span class="num">' + ln.num + '</span>' +
      (sigla ? '<span class="sub">' + sigla + '</span>' : '') + '</div>' +
    '<div class="times"><span class="dep">' + t.dep + '</span><span class="arr">' + t.arr + '</span></div>' +
    (t.diff === null ? '' : '<div class="cd ' + cdClasse + '">' + cd + '</div>') +
    '<div class="detail">' + pezzi.join(' &middot; ') + '</div>' +
    (t.guadagno ? '<div class="hint">' + (t.stessaPartenza ? 'Stessa partenza' : 'Parte dopo') +
        ', ma arriva ' + t.guadagno + '′ prima</div>' : '') +
    tag + '</div>';
}

// L'elenco si ricostruiva per intero ogni 30 secondi: azzerava scorrimento e
// selezione e faceva ripartire ogni animazione. Ora il giro periodico tocca solo le
// attese, e si ridisegna quando cambia davvero l'insieme delle corse mostrate.
let chiaviDom = [], firmaDom = '';

function aggiornaAttese(elenco) {
  const schede = $('cards').querySelectorAll('.card');
  elenco.forEach((t, i) => {
    const el = schede[i];
    if (!el || t.diff === null) return;
    const cd = el.querySelector('.cd');
    if (!cd) return;
    const [txt, cls] = etichettaAttesa(t.diff);
    const cambiato = cd.textContent !== txt;
    cd.textContent = txt;
    cd.className = 'cd ' + cls;
    if (cambiato) { void cd.offsetWidth; cd.classList.add('bump'); }
    el.classList.toggle('imminente', el.classList.contains('next') && imminente(t));
  });
}

function disegnaElenco() {
  const dow = dowMostrato(), domani = stato.giorno === 'domani';
  const cards = $('cards'), piede = $('foot');
  const svuota = html => { cards.innerHTML = html; chiaviDom = []; firmaDom = ''; };

  if (dow === 0) {
    svuota('<div class="empty"><strong>' + (domani ? 'Domani' : 'Oggi') + ' è domenica</strong>' +
           'AMA non effettua corse la domenica.</div>');
    piede.innerHTML = rigaMeta(); return;
  }

  const { passate, future } = corse(idx, {
    partenza: stato.partenza, arrivo: stato.arrivo, dow,
    adesso: domani ? null : adessoMin(), tutte: stato.tutte
  });

  const verso = 'da ' + nome(stato.partenza) + ' a ' + nome(stato.arrivo);
  const invito = '<button class="vedi-domani" data-act="domani">Vedi le corse di domani</button>';
  const finite = (coda, dentro) =>
    '<div class="empty' + (dentro ? ' inline' : '') + '"><strong>Nessun’altra corsa oggi</strong>' +
    (coda || 'L’ultima ' + verso + ' è già passata.') + invito + '</div>';

  if (!future.length) {
    if (domani) {
      svuota('<div class="empty"><strong>Nessuna corsa domani</strong>' +
             'Nessun bus ' + verso + ' circola di ' + giornoLungo(dow) + '.</div>');
      piede.innerHTML = rigaMeta(); return;
    }
    if (!passate.length) { svuota(finite('')); piede.innerHTML = rigaMeta(); return; }
  }

  // Il consiglio sull'arrivo piu' rapido confronta la mezz'ora dopo la prima partenza
  // utile. Domani quella finestra sarebbe l'alba, un ritaglio arbitrario: si tace.
  const quante = domani ? future.length : arrivoPiuRapido(future, stato.quante);

  // Domani non c'e' un "adesso" attorno a cui impaginare: si mostra la giornata
  // intera e si scorre fino all'ora che interessa.
  const elenco = stato.precedenti && !domani ? passate.slice(-3) : [];
  const primaFutura = elenco.length;
  elenco.push(...future.slice(0, quante));
  const restano = future.length - quante;

  const ultima = future[future.length - 1];
  const coda = domani
    ? (future.length ? future.length + ' corse, dalle ' + future[0].dep + ' alle ' + ultima.dep : '')
    : !ultima ? ''
    : restano > 1   ? 'Altre ' + restano + ' corse fino alle ' + ultima.dep
    : restano === 1 ? 'Un’altra corsa alle ' + ultima.dep
    :                 'Ultima corsa alle ' + ultima.dep;
  piede.innerHTML = (coda ? coda + '<br>' : '') + rigaMeta();

  const chiavi = elenco.map(t => t.line + t.dep + t.arr);
  const firma = stato.giorno + '#' + chiavi.join('|') + '#' + passate.length + '#' + restano +
                '#' + (stato.precedenti ? 1 : 0) + '#' + future.length;
  if (firma === firmaDom) { aggiornaAttese(elenco); return; }

  let html = '';
  if (passate.length && !domani) {
    const n = Math.min(passate.length, 3);
    html += '<button class="more past" data-act="past">' +
      (stato.precedenti ? 'Nascondi le precedenti'
        : n === 1 ? 'Mostra la corsa precedente' : 'Mostra le ' + n + ' corse precedenti') + '</button>';
  }

  let nuove = 0;
  html += elenco.map((t, i) => {
    const ord = chiaviDom.includes(chiavi[i]) ? -1 : nuove++;
    return scheda(t, !domani && i === primaFutura && t.diff >= -2, t.diff < -2, ord);
  }).join('');

  if (!future.length)
    html += finite('L’ultima è partita alle ' + passate[passate.length - 1].dep + '.', true);

  if (restano > 0) {
    const n = Math.min(restano, 3);
    html += '<button class="more" data-act="more">' +
      (n === 1 ? 'Mostra un’altra corsa' : 'Mostra altre ' + n + ' corse') + '</button>';
  }
  cards.innerHTML = html;
  chiaviDom = chiavi; firmaDom = firma;
}

function disegna() {
  if (!idx) return;
  disegnaTratta();
  disegnaGiorni();
  disegnaAvviso(dowMostrato());
  disegnaElenco();
}

// ── Selettore fermate ─────────────────────────
let scegliendo = null, apertoIl = 0;

function apriSelettore(quale) {
  scegliendo = quale; apertoIl = Date.now();
  const fisso = quale === 'origin' ? stato.arrivo : stato.partenza;
  const attuale = quale === 'origin' ? stato.partenza : stato.arrivo;
  $('sheet-title').textContent = quale === 'origin' ? 'Fermata di partenza' : 'Fermata di arrivo';

  $('sheet-opts').innerHTML = idx.fermate.filter(s => s !== fisso).map((s, i) => {
    const [a, b] = quale === 'origin' ? [s, fisso] : [fisso, s];
    const ok = servita(idx, a, b);
    const l = ok ? linee(idx, a, b) : [];
    const nota = ok ? notaApprossimazione(idx, s).join(' · ')
                    : 'Nessuna corsa diretta ' + (quale === 'origin' ? 'verso ' : 'da ') + nome(fisso);
    // Coppito e' servita da sette linee: elencarle tutte spingerebbe il nome a capo.
    const et = !l.length ? '' : l.length > 4 ? l.length + ' linee'
             : (l.length > 1 ? 'Linee ' : 'Linea ') + l.join(' &middot; ');
    return '<button class="opt' + (s === attuale ? ' on' : '') + '" data-stop="' + s + '"' +
      ' style="--i:' + i + '"' + (ok ? '' : ' disabled') + '>' +
      '<i></i><span class="txt"><span class="nm">' + nome(s) + '</span>' +
      (nota ? '<span class="sub">' + nota + '</span>' : '') + '</span>' +
      '<span class="ln">' + et + '</span></button>';
  }).join('');
  $('sheet-bg').classList.add('open');
}
const chiudiSelettore = () => $('sheet-bg').classList.remove('open');

// ── Eventi ────────────────────────────────────
const cambiaTratta = (a, b) => aggiorna({ partenza: a, arrivo: b, quante: 3, precedenti: false });

$('f-origin').addEventListener('click', () => apriSelettore('origin'));
$('f-dest').addEventListener('click', () => apriSelettore('dest'));

$('preferite').addEventListener('click', e => {
  const b = e.target.closest('.scorciatoia');
  if (b) cambiaTratta(...stato.preferite[b.dataset.i]);
});

$('days').addEventListener('click', e => {
  const b = e.target.closest('.day');
  if (b && b.dataset.day !== stato.giorno)
    aggiorna({ giorno: b.dataset.day, quante: 3, precedenti: false });
});

$('banner-btn').addEventListener('click', () => aggiorna({ tutte: !stato.tutte }));

$('cards').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  if (b.dataset.act === 'domani') aggiorna({ giorno: 'domani', quante: 3, precedenti: false });
  else if (b.dataset.act === 'more') aggiorna({ quante: stato.quante + 3 });
  else aggiorna({ precedenti: !stato.precedenti });
});

// L'overlay si chiude su pointerdown, non su click: dopo un tocco iOS sintetizza un
// click aggiuntivo che, trovando l'overlay appena comparso sotto il dito, chiudeva
// il selettore nello stesso gesto che lo apriva.
$('sheet-bg').addEventListener('pointerdown', e => {
  if (e.target === $('sheet-bg') && Date.now() - apertoIl > 400) chiudiSelettore();
});

$('sheet-opts').addEventListener('click', e => {
  const o = e.target.closest('.opt');
  if (!o || o.disabled) return;
  chiudiSelettore();
  if (scegliendo === 'origin') cambiaTratta(o.dataset.stop, stato.arrivo);
  else cambiaTratta(stato.partenza, o.dataset.stop);
});

// ── Inversione ────────────────────────────────
// La freccia gira e i due nomi si scambiano passandosi davanti: senza movimento il
// tocco sembrava non aver fatto niente.
const pocoMoto = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let giroFreccia = 0;

$('swap').addEventListener('click', () => {
  if (!servita(idx, stato.arrivo, stato.partenza)) return;
  const inverti = () => cambiaTratta(stato.arrivo, stato.partenza);

  giroFreccia += 180;
  const icona = $('swap').querySelector('svg');
  if (icona) icona.style.transform = 'rotate(' + giroFreccia + 'deg)';

  if (pocoMoto() || !$('v-origin').animate) return inverti();

  const esce = (el, dy) => el.animate(
    [{ transform: 'none', opacity: 1 }, { transform: 'translateY(' + dy + 'px)', opacity: 0 }],
    { duration: 140, easing: 'ease-in', fill: 'forwards' });
  const entra = (el, dy) => el.animate(
    [{ transform: 'translateY(' + dy + 'px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
    { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });

  const a = esce($('v-origin'), 20), b = esce($('v-dest'), -20);
  // Lo stato non dipende dal movimento: con la pagina in secondo piano le animazioni
  // non avanzano e una promessa `finished` non si risolve mai, quindi lo scambio non
  // avverrebbe affatto. Lo scandisce un timer, che parte comunque.
  setTimeout(() => {
    inverti();
    a.cancel(); b.cancel();   // il fermo immagine dell'uscita farebbe sparire i nomi
    const c = entra($('v-origin'), -20), d = entra($('v-dest'), 20);
    setTimeout(() => { c.cancel(); d.cancel(); }, 260);
  }, 140);
});

// ── Misure del dispositivo (temporaneo) ───────
// Tre tocchi sull'orologio aprono un pannello con le misure reali del telefono.
// Serve a capire la sfocatura in cima, che non riesco a riprodurre. Da togliere
// insieme a diagnostica.js quando la questione e' chiusa.
let tocchi = 0, ultimoTocco = 0;
$('clock').addEventListener('click', () => {
  const ora = Date.now();
  tocchi = ora - ultimoTocco < 1200 ? tocchi + 1 : 1;
  ultimoTocco = ora;
  if (tocchi >= 3) {
    tocchi = 0;
    import('./diagnostica.js').then(m => m.mostra()).catch(() => {});
  }
});

// ── Service worker ────────────────────────────
// updateViaCache 'none': senza, Safari puo' servire dalla propria cache HTTP perfino
// lo script del worker, e allora nessun aggiornamento viene mai notato. Il controllo
// si rifa' quando l'app torna in primo piano, che e' quando la si riapre davvero.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) reg.update().catch(() => {});
    });
  }).catch(() => {});
}
