// Stato, disegno ed eventi. Il calcolo degli orari sta in orari.js e non conosce
// il DOM: qui non si decide mai quali corse esistono, solo come si mostrano.
import {
  indicizza, corse, arrivoPiuRapido, servita, linee, notaApprossimazione,
  etichettaAttesa, giorniLabel, giornoBreve, giornoLungo, dataEstesa, chiave,
  festivita, giornoServizio
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

// La data di cui si stanno guardando gli orari, e il giorno secondo cui circolano:
// nei festivi vale come una domenica.
const dataMostrata = () => {
  const d = new Date();
  if (stato.giorno === 'domani') d.setDate(d.getDate() + 1);
  return d;
};
const dowMostrato = () => giornoServizio(dataMostrata());
const adessoMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };

function rigaMeta() {
  if (!idx) return '';
  // Non e' un'app di AMA: gli orari vengono dai suoi PDF e si dichiara.
  const fonte = 'App non ufficiale · orari dai PDF AMA, ';
  if (idx.meta.draft)
    return fonte + '<span class="draft">provvisori</span>, in vigore dal ' + dataEstesa(idx.meta.effective);
  return fonte + 'aggiornati al ' + dataEstesa(idx.meta.aggiornato || idx.meta.effective);
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
      nome(r[0], true) + FRECCIA + nome(r[1], true) + '</span></button>').join('');
}

function disegnaGiorni() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  const etichetta = festivita(d) ? 'Festivo' : maiuscola(giornoBreve(d.getDay()));
  $('days').querySelectorAll('.day').forEach(b => {
    b.classList.toggle('on', b.dataset.day === stato.giorno);
    if (b.dataset.day === 'domani') b.innerHTML = 'Domani <small>· ' + etichetta + '</small>';
  });
}

// Il festivo non e' piu' un errore ("nessun servizio"): AMA ha un orario festivo.
function disegnaAvviso() {
  const data = dataMostrata(), dow = giornoServizio(data), banner = $('banner');
  banner.classList.remove('sunday');
  if (dow === 0) {
    banner.style.display = 'flex';
    $('banner-text').textContent = (festivita(data) || 'Domenica') + ' · Orario festivo';
    $('banner-btn').style.display = 'none';
  } else if (dow === 6) {
    banner.style.display = 'flex';
    $('banner-text').textContent = 'Sabato · Corse ridotte';
    $('banner-btn').style.display = '';
    $('banner-btn').textContent = stato.tutte ? 'Solo oggi' : 'Tutte le corse';
  } else banner.style.display = 'none';
}

// Il carattere della freccia in Barlow non c'e': cadeva su un ripiego sottile accanto al peso 800.
const FRECCIA = '<svg class="fr" viewBox="0 0 14 10" width="14" height="10" aria-hidden="true">' +
  '<path d="M0 5h12M8 1l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>';

const imminente = t => t.diff !== null && t.diff >= -2 && t.diff <= 5;

// ── Punti LED ─────────────────────────────────
// Lo stesso alfabeto 5x7 del logo (tools/make_icon.py): il conto alla rovescia e il segno
// dell'app sono fatti degli stessi punti. Sono dati, non un carattere tipografico: non
// serve scaricare un font e funzionano offline.
const GLIFI = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ':': ['0', '0', '1', '0', '1', '0', '0'],
  '′': ['001', '001', '010', '000', '000', '000', '000'],
  'h': ['10000', '10000', '10110', '11001', '10001', '10001', '10001'],
  'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  ' ': ['00', '00', '00', '00', '00', '00', '00']
};

function punti(testo, altezzaMax, larghezzaMax) {
  const gl = [...testo].map(c => GLIFI[c] || GLIFI[' ']);
  const cols = gl.reduce((n, g) => n + g[0].length, 0) + (gl.length - 1);
  const passo = Math.min(altezzaMax / 7, larghezzaMax / cols);
  let x = 0, acceso = '', spento = '';
  for (const g of gl) {
    g.forEach((riga, r) => [...riga].forEach((v, c) => {
      const cerchio = '<circle cx="' + (x + c + .5) + '" cy="' + (r + .5) + '" r="' + (v === '1' ? .4 : .17) + '"/>';
      if (v === '1') acceso += cerchio; else spento += cerchio;
    }));
    x += g[0].length + 1;
  }
  return '<svg class="punti" viewBox="0 0 ' + cols + ' 7" width="' + (cols * passo).toFixed(1) + '" height="' + (7 * passo).toFixed(1) +
    '" role="img" aria-label="' + testo + '"><g fill="#2a2111">' + spento + '</g><g fill="#ffb000">' + acceso + '</g></svg>';
}

// Cosa scrive il pannello: minuti ('5′'), ore e minuti ('1h25') oppure l'orario di partenza
// quando non c'e' un adesso (domani).
function testoLed(t) {
  if (t.diff === null) return t.dep;
  if (t.diff >= -2 && t.diff < 2) return 'ORA';
  if (t.diff < 60) return t.diff + '′';
  return Math.floor(t.diff / 60) + 'h' + String(t.diff % 60).padStart(2, '0');
}

function pezziDettaglio(t) {
  const pezzi = ['<b>' + t.dur + '′</b>'];
  // Il lato e' quello della fermata di Coppito: il PDF la chiama «università coppito (lato
  // ospedale)» perche' il campus confina col San Salvatore e ha due fermate distinte. Dirlo
  // su una tratta che non tocca l'universita' confonderebbe invece di aiutare.
  if (t.side && stato.arrivo === 'uni')        pezzi.push('Arrivo a Coppito lato ' + t.side);
  else if (t.side && stato.partenza === 'uni') pezzi.push('Partenza da Coppito lato ' + t.side);
  if (t.approx) pezzi.push('<span class="est">Orario stimato</span>');
  return pezzi.join(' &middot; ');
}

function etichetta(t) {
  // «Solo vacanze»: la legenda AMA dice «si effettua solo nei periodi non scolastici».
  // Senza il calendario scolastico non si puo' nascondere, ma va detto.
  if (!t.oggi)           return '<span class="tag">solo ' + giorniLabel(t.days) + '</span>';
  if (t.ignota)          return '<span class="tag bad">nota ' + t.ignota + '</span>';
  if (t.vacanze)         return '<span class="tag">solo vacanze</span>';
  if (t.scolastica)      return '<span class="tag">scolastica</span>';
  return '';
}

const suggerimento = t => t.guadagno
  ? '<div class="hint">' + (t.stessaPartenza ? 'Stessa partenza' : 'Parte dopo') + ', ma arriva ' + t.guadagno + '′ prima</div>' : '';

function sigla(t) {
  const ln = idx.meta.lines[t.line] || { num: '?', sub: '' };
  return { ln, sub: ((t.variant && t.variant !== ln.num ? t.variant : ln.sub) || '').replace(/\s+/g, '') };
}

// `ord` e' la posizione fra le schede NUOVE che si animano: le altre, e quelle gia' a
// schermo, non rientrano, altrimenti aggiungere corse farebbe ripartire l'intero elenco.
const animaIn = ord => ord >= 0 ? ' data-in style="--i:' + ord + '"' : '';

// La prossima corsa: il pannello LED.
function pannello(t, ord) {
  const { ln, sub } = sigla(t);
  return '<div class="led' + (imminente(t) ? ' imminente' : '') + '"' + animaIn(ord) + '>' +
    punti(testoLed(t), 96, 190) +
    '<div class="info"><span class="linea">' + ln.num + (sub ? sub : '') + '</span>' +
    '<div class="orari">' + t.dep + FRECCIA + t.arr + '</div>' +
    '<div class="det">' + pezziDettaglio(t) + '</div></div>' +
    suggerimento(t) + etichetta(t) + '</div>';
}

// Ogni altra corsa: una striscia, con la linea in un quadrato nero.
function striscia(t, passata, ord) {
  const { ln, sub } = sigla(t);
  const [cd, cls] = t.diff === null ? ['', ''] : etichettaAttesa(t.diff);
  return '<div class="card' + (passata ? ' past' : '') + '"' + animaIn(ord) + '>' +
    '<div class="badge"><span class="num' + (ln.num.length > 3 ? ' lunga' : '') + '">' + ln.num + '</span>' +
      (sub ? '<span class="sub">' + sub + '</span>' : '') + '</div>' +
    '<div class="times"><span class="dep">' + t.dep + '</span><span class="arr">' + t.arr + '</span></div>' +
    (t.diff === null ? '' : passata
      ? '<div class="cd ' + cls + '">' + cd + '</div>'
      : '<div class="cd mini">' + punti(testoLed(t), 26, 84) + '</div>') +
    '<div class="detail">' + pezziDettaglio(t) + '</div>' +
    suggerimento(t) + etichetta(t) + '</div>';
}

// L'elenco si ricostruiva per intero ogni 30 secondi: azzerava lo scorrimento e faceva
// ripartire ogni animazione. Ora il giro periodico tocca solo le attese, e si ridisegna
// quando cambia davvero l'insieme delle corse mostrate.
let chiaviDom = [], firmaDom = '', contestoDom = '';

function aggiornaAttese(elenco, iLed) {
  const el = $('cards');
  elenco.forEach((t, i) => {
    if (t.diff === null) return;
    const nodo = el.children[i];
    if (!nodo) return;
    if (i === iLed) {
      const nuovo = punti(testoLed(t), 96, 190), vecchio = nodo.querySelector('.punti');
      if (vecchio && vecchio.getAttribute('aria-label') !== testoLed(t)) vecchio.outerHTML = nuovo;
      nodo.classList.toggle('imminente', imminente(t));
      return;
    }
    const cd = nodo.querySelector('.cd');
    if (!cd) return;
    if (cd.classList.contains('mini')) {
      const vecchio = cd.querySelector('.punti');
      if (!vecchio || vecchio.getAttribute('aria-label') !== testoLed(t)) cd.innerHTML = punti(testoLed(t), 26, 84);
      return;
    }
    const [txt, cls] = etichettaAttesa(t.diff);
    const cambiato = cd.textContent !== txt;
    cd.textContent = txt;
    cd.className = 'cd ' + cls;
    if (cambiato) { void cd.offsetWidth; cd.classList.add('bump'); }
  });
}

function disegnaElenco() {
  const dow = dowMostrato(), domani = stato.giorno === 'domani';
  const cards = $('cards'), piede = $('foot');
  const svuota = html => { cards.innerHTML = html; chiaviDom = []; firmaDom = ''; };

  // Il pulsante "Tutte le corse" esiste solo il sabato: altrove la scelta non vale.
  const filtro = { partenza: stato.partenza, arrivo: stato.arrivo, dow, tutte: stato.tutte && dow === 6 };
  const { passate, future } = corse(idx, { ...filtro, adesso: domani ? null : adessoMin() });

  const verso = 'da ' + nome(stato.partenza) + ' a ' + nome(stato.arrivo);
  const quando = dow === 0 ? 'nei giorni festivi' : 'di ' + giornoLungo(dow);
  const invito = '<button class="vedi-domani" data-act="domani">Vedi le corse di domani</button>';
  const finite = (coda, dentro) =>
    '<div class="empty' + (dentro ? ' inline' : '') + '"><strong>Nessun’altra corsa oggi</strong>' +
    (coda || 'L’ultima ' + verso + ' è già passata.') + invito + '</div>';
  // Diverso da "sono finite": su questa tratta, in questo tipo di giorno, non ne passa nessuna.
  const nessuna = () => '<div class="empty"><strong>Nessuna corsa ' + (domani ? 'domani' : 'oggi') +
    '</strong>Nessun bus va ' + verso + ' ' + quando + '.' + (domani ? '' : invito) + '</div>';

  if (!future.length && !passate.length) {
    const giornata = domani ? 0 : corse(idx, { ...filtro, adesso: null }).future.length;
    svuota(giornata ? finite('') : nessuna());
    piede.innerHTML = rigaMeta(); return;
  }

  // Il consiglio sull'arrivo piu' rapido confronta la mezz'ora dopo la prima partenza
  // utile. Domani quella finestra sarebbe l'alba, un ritaglio arbitrario: si tace.
  if (!domani) arrivoPiuRapido(future, future.length);

  // Tutta la giornata in una lista sola: le corse gia' partite sopra, attenuate; la prossima
  // nel pannello LED; le successive sotto. Si sfoglia scorrendo, senza pulsanti.
  const elenco = [...passate, ...future];
  const iLed = passate.length;

  const ultima = future[future.length - 1] || passate[passate.length - 1];
  const coda = domani
    ? future.length + ' corse, dalle ' + future[0].dep + ' alle ' + ultima.dep
    : future.length ? 'Ultima corsa alle ' + ultima.dep : '';
  piede.innerHTML = (coda ? coda + '<br>' : '') + rigaMeta();

  const chiavi = elenco.map(t => t.line + t.dep + t.arr);
  const firma = stato.giorno + '#' + chiavi.join('|') + '#' + future.length;
  if (firma === firmaDom) { aggiornaAttese(elenco, iLed); return; }

  // Si riposiziona sulla prossima corsa solo quando cambia il contesto (tratta, giorno,
  // filtro): se e' solo partita una corsa, chi sta guardando le precedenti non va spostato.
  const contesto = [stato.giorno, stato.partenza, stato.arrivo, stato.tutte].join('|');
  const nuovoContesto = contesto !== contestoDom;
  const scorrimento = cards.scrollTop;

  // Si animano solo le corse nuove attorno al pannello: animare tutta la giornata
  // farebbe durare l'entrata piu' di mezzo secondo.
  let n = 0;
  let html = elenco.map((t, i) => {
    const nuova = !chiaviDom.includes(chiavi[i]);
    const ord = nuova && i >= iLed - 1 && i <= iLed + 6 ? n++ : -1;
    return i === iLed ? pannello(t, ord) : striscia(t, i < iLed, ord);
  }).join('');
  if (!future.length) html += finite('L’ultima è partita alle ' + passate[passate.length - 1].dep + '.', true);

  cards.style.scrollBehavior = 'auto';
  cards.innerHTML = html;
  if (nuovoContesto) {
    const led = cards.querySelector('.led');
    // Sopra il pannello resta l'ultima corsa gia' partita, intera: dice che sopra c'e' altro e
    // non sembra un ritaglio.
    const prima = led && led.previousElementSibling;
    cards.scrollTop = led ? Math.max(0, (prima ? prima.offsetTop : led.offsetTop) - 6) : cards.scrollHeight;
  } else cards.scrollTop = scorrimento;
  cards.style.scrollBehavior = '';

  chiaviDom = chiavi; firmaDom = firma; contestoDom = contesto;
}

function disegna() {
  if (!idx) return;
  disegnaTratta();
  disegnaGiorni();
  disegnaAvviso();
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
    const nota = ok ? notaApprossimazione(idx, s).join('<br>')
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
const cambiaTratta = (a, b) => aggiorna({ partenza: a, arrivo: b });

$('f-origin').addEventListener('click', () => apriSelettore('origin'));
$('f-dest').addEventListener('click', () => apriSelettore('dest'));

$('preferite').addEventListener('click', e => {
  const b = e.target.closest('.scorciatoia');
  if (b) cambiaTratta(...stato.preferite[b.dataset.i]);
});

$('days').addEventListener('click', e => {
  const b = e.target.closest('.day');
  if (b && b.dataset.day !== stato.giorno) aggiorna({ giorno: b.dataset.day });
});

$('banner-btn').addEventListener('click', () => aggiorna({ tutte: !stato.tutte }));

$('cards').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  if (b.dataset.act === 'domani') aggiorna({ giorno: 'domani' });
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

// Quando l'app torna in primo piano (la si riapre alla fermata) la lista riparte dalla
// prossima corsa: dopo ore in tasca sarebbe ferma dov'era rimasta.
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !idx) return;
  contestoDom = ''; firmaDom = '';
  disegna();
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
