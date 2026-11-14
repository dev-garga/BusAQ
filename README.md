# Bus AQ

Orari degli autobus AMA de L'Aquila fra due fermate, per iPhone. **App non ufficiale**: gli orari vengono dai PDF che AMA pubblica nella pagina [Elenco linee AMA](https://www.ama.laquila.it/linee-e-orari/elenco-linee-ama/).

Online: **https://dev-garga.github.io/BusAQ/** (GitHub Pages, si aggiorna a ogni `git push` su `main`).

Cosa c'è dentro, in breve: una PWA statica (nessun compilatore, nessuna dipendenza) e una pipeline in Python che trasforma i PDF in `schedule.json`. Per chi vuole capire il prodotto e il disegno: [PRODUCT.md](PRODUCT.md) e [DESIGN.md](DESIGN.md).

## Cosa serve

| Per | Serve |
|---|---|
| guardare l'app, collaudare la logica | **Node 22+** e Python 3 per un server statico |
| rigenerare gli orari dai PDF | **Python 3.10+** e `tools/requirements.txt` |
| fare catture dello schermo | Chrome o Chromium |

Tutto gira su macOS, Linux e Windows. Nei comandi sotto `python3` su Windows è `py`.

## Provare l'app in locale

```bash
python3 -m http.server 8000
```

poi `http://localhost:8000/`. Serve un server: l'app usa moduli ES e `fetch`, che da `file://` non funzionano.

Il service worker mette in cache i file e durante lo sviluppo una modifica può non vedersi. Lo si scavalca dagli strumenti per sviluppatori del browser (Application → Service Workers → Unregister, poi svuota la cache) o con una finestra privata.

## Collaudi

```bash
node --test tools/prova_orari.mjs      # la logica di orari.js, sugli orari veri
python3 tools/verifica.py              # struttura, coerenza e confronto di schedule.json con git
```

`verifica.py` fallisce se una linea perde corse rispetto all'ultima versione in git. Se la perdita è voluta e l'hai riletta sul PDF, `--accetta-perdite` la declassa ad avviso.

Catture dello schermo, a viewport mobile vero e con l'orologio fissato (di sera non c'è una prossima corsa e il pannello LED non compare):

```bash
node tools/catture.mjs                              # 12:07 di mercoledì 7 ottobre 2026
node tools/catture.mjs --ora 2026-10-11T10:00:00    # una domenica
```

Le immagini vanno in `catture/` (non tracciata).

## Pubblicare

```bash
python3 tools/rilascia.py
git add -A && git commit && git push
```

`rilascia.py` verifica i dati e **scrive in `sw.js` un nome di cache che dipende dal contenuto dei file**: è ciò che fa arrivare l'aggiornamento ai telefoni. Non va modificato a mano.

## Aggiornare gli orari

AMA rivede gli orari spesso e cambia il nome dei file a ogni revisione (la data è nel nome).

```bash
python3 -m venv tools/.venv
tools/.venv/bin/pip install -r tools/requirements.txt     # Windows: tools\.venv\Scripts\pip
```

1. **Controllare se c'è qualcosa di nuovo.** Non serve il venv.
   ```bash
   python3 tools/check_updates.py
   ```
   Confronta la pagina AMA con la revisione usata l'ultima volta (`tools/pdf_state.json`). Segnala anche linee comparse o sparite, e avvisa se un PDF con corse trascritte a mano è cambiato.
2. **Scaricare e rigenerare.**
   ```bash
   tools/.venv/bin/python tools/extract_schedule.py --download
   ```
   Scrive `schedule.json` e stampa un report per direzione. **Va letto a fianco dei PDF**: confronta corse, prima e ultima partenza, corse del solo lun–ven, codici fuori legenda. Poi parte `verifica.py`.
3. **Se l'estrazione si ferma** dicendo che non trova una colonna, AMA ha cambiato l'impaginazione. `tools/inspect_pdf.py <file.pdf> [pagina]` mostra la struttura, e si aggiorna `tools/lines.json`, non il codice.
4. **Collaudi e pubblicazione**: `node --test tools/prova_orari.mjs`, poi come sopra. I valori fissati nei collaudi (numero di coppie servite, un caso reale di «conviene la corsa dopo») cambiano con i dati: si ricontrollano sul PDF uno per uno, non si copia l'uscita.

I PDF scaricati stanno in `tools/pdfcache/`, **che non è nel repository**: si riscaricano, ma solo nella revisione corrente.

### Dove sta cosa

| File | Contenuto |
|---|---|
| `tools/lines.json` | mappa linee, fermate e colonne dei PDF (le colonne si cercano per **nome**), legende delle note |
| `tools/manuali.json` | corse trascritte a mano (linea 13, il cui PDF non si può leggere in modo affidabile) |
| `tools/ama.py` | trova il PDF corrente di ogni linea per **etichetta** sulla pagina AMA |
| `tools/extract_schedule.py` | PDF → `schedule.json` |
| `tools/make_icon.py` | logo e icone, da dati (le lettere sono punti 5×7) |
| `orari.js` | logica pura, senza DOM: coppie servite, corse, festivi, consiglio sull'arrivo più rapido |
| `app.js` | stato, disegno ed eventi |

## Cose da sapere sui dati

Sono le trappole già pagate: la prossima volta che un orario «non torna», si parte da qui.

- **Un PDF per linea, e i nomi cambiano.** La 3 era sfuggita perché mi fidavo dell'elenco delle linee sul sito invece dei PDF. Si verifica sempre sul PDF.
- **Le intestazioni sono ruotate**: il testo esce rovesciato (`sublanimret` = «terminalbus»). Alcune tabelle hanno più sezioni (la 2UF ha andata e ritorno una sotto l'altra) o più pannelli affiancati.
- **Le righe grigie e le lettere cambiano significato da pagina a pagina.** Il grigio marca un calendario ridotto (sulla 1 e sull'andata della 3: lun–ven e solo giorni scolastici), e convive con i codici lettera. `S` = corsa scolastica, `N` = solo nei periodi non scolastici, ogni altra lettera è una variante di percorso, da leggere nella legenda di *quella* pagina. Le lettere fuori legenda si segnalano, non si ignorano.
- **Il finto grassetto sono caratteri disegnati due volte nello stesso punto** (`1122..1100`): si tolgono. Alcune cifre sono scritte in bianco e non si vedono stampate.
- **Lo stesso orario a due fermate con solo trattini in mezzo è un errore del PDF**: la corsa parte dalla seconda.
- **Una corsa pubblicata sia come `S` sia come `N` circola tutto l'anno.**
- **Orari scritti con la virgola** (`7,05`) e celle tipo `da via Ficara (12.15)`, che indicano una corsa che parte altrove.

### Approssimazioni di fermata approvate

Sono quelle, e **solo quelle**. Ogni altra va chiesta.

- Viale Gran Sasso = Fontana Luminosa (linee 1 e 2UF, non la 2U)
- Via Cencioni = Viale Panella (1, 2U, 2UF; A e B usano la colonna di Fontana)
- «Ospedale» = Università Coppito nelle festive (2UF e M14F)

Nell'app compaiono come «Orario stimato». Il «Coppito» della 14D al ritorno non è stato mappato sull'università.

### Festivi

Domeniche, festività nazionali e Pasquetta (`giornoServizio` in `orari.js`). Niente patrono: San Massimo non ha data fissa. Le corse festive hanno `days: [0]`.

## Cose da sapere su iOS

- iOS ignora le icone del manifest: serve `<link rel="apple-touch-icon">`.
- Un overlay a tutto schermo si chiude su `pointerdown`, mai su `click`: iOS sintetizza un click dopo il tocco che richiude l'overlay appena aperto.
- La barra di stato è `black-translucent` e disegna la sua sfocatura sopra la pagina: per questo il corpo ha 36 px in più sopra l'area di sicurezza. Il fondo del manifest va tenuto allineato al fondo della pagina.
- I percorsi del manifest e del service worker sono **relativi**, perché rinominare il repository non rompa la cache.
- Il service worker chiede la rete prima per ciò che cambia e usa la cache come ripiego; la registrazione usa `updateViaCache: 'none'`, altrimenti Safari serve dalla cache HTTP perfino lo script del worker.
