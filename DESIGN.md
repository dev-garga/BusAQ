---
name: Bus AQ
description: La palina di fermata resa viva, con campo arancione AMA e pannello LED a matrice di punti.
colors:
  arancio-ama: "#f28c1c"
  nero-lamiera: "#0d0d0d"
  ambra-led: "#ffb000"
  led-spento: "#2a2111"
  inchiostro: "#111111"
  striscia-bianca: "#ffffff"
  seppia: "#5c4a35"
  attesa-bruciata: "#a84a00"
  allarme: "#b3261e"
  notte-sfondo: "#14110c"
  notte-testo: "#f3e9d8"
  notte-striscia: "#221b11"
  notte-passata: "#1a150d"
  notte-seppia: "#bba98c"
typography:
  display-led:
    fontFamily: "Barlow, -apple-system, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "32px"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.03em"
    fontFeature: "tabular-nums"
  headline:
    fontFamily: "Barlow, -apple-system, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "25px"
    fontWeight: 800
    lineHeight: "28px"
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Barlow, -apple-system, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "19px"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Barlow, -apple-system, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
  label:
    fontFamily: "Barlow, -apple-system, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.35
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  logo: "9px"
  sheet: "14px"
spacing:
  xs: "4px"
  sm: "6px"
  md: "12px"
  lg: "16px"
  safe-top: "36px"
components:
  pannello-led:
    backgroundColor: "{colors.nero-lamiera}"
    textColor: "{colors.ambra-led}"
    rounded: "{rounded.lg}"
    padding: "14px 16px 14px 14px"
  striscia-corsa:
    backgroundColor: "{colors.striscia-bianca}"
    textColor: "{colors.inchiostro}"
    rounded: "{rounded.md}"
    padding: "11px 12px"
  striscia-passata:
    backgroundColor: "{colors.striscia-bianca}"
    textColor: "{colors.inchiostro}"
    rounded: "{rounded.md}"
    padding: "7px 12px"
  scorciatoia:
    backgroundColor: "{colors.nero-lamiera}"
    textColor: "{colors.ambra-led}"
    rounded: "{rounded.md}"
    height: "34px"
  scorciatoia-attiva:
    backgroundColor: "{colors.striscia-bianca}"
    textColor: "{colors.inchiostro}"
  badge-linea:
    backgroundColor: "{colors.inchiostro}"
    textColor: "{colors.striscia-bianca}"
    rounded: "{rounded.sm}"
    padding: "4px"
  tasto-inversione:
    backgroundColor: "{colors.nero-lamiera}"
    textColor: "{colors.ambra-led}"
    rounded: "{rounded.md}"
    size: "52px"
---

# Design System: Bus AQ

## Overview

**Creative North Star: "La palina viva"**

Bus AQ e' la palina di una fermata AMA che ha preso vita: un campo arancione, strisce bianche con la linea in un quadrato scuro, e un pannello LED nero in cui il tempo all'arrivo e' scritto a punti. Dice "questa e' una fermata", non "questa e' un'app". Il mondo e' fatto di materiali di segnaletica, non di schede morbide o di un tema scuro con accento freddo.

La densita' e' quella di una tabella: poche cose, grandi, in colonna, lette in cinque secondi, in piedi, con una mano, al sole pieno o al buio. Di giorno l'arancione occupa tutta la pagina; di sera lo sfondo scende a un quasi-nero caldo e l'arancione resta solo su testata e tratta. Il nero lamiera e l'ambra LED sono identici nei due temi: il pannello e' sempre acceso allo stesso modo.

Divergenza dal contratto di direzione: il testo non e' Helvetica/system ma Barlow (600 e 800, servito da `fonts/`), e il valore Da/A della tratta e' 25 px, non 28. Vale la build.

**Key Characteristics:**
- Campo arancione AMA come superficie dominante di giorno; quasi-nero caldo di sera.
- Ambra LED riservato ai minuti e alle superfici nere che li incorniciano.
- Un solo alfabeto di punti 5x7, usato per i minuti dell'interfaccia e per il logo.
- Piatto: nessuna ombra, la profondita' e' contrasto tra campi di colore.
- Tutto in pochi raggi piccoli (4, 6, 8 px); Barlow in due soli pesi.

## Colors

Palette impegnata: un arancione di segnaletica, un nero di lamiera, un ambra di LED, il bianco delle strisce.

### Primary
- **Arancio AMA** (#f28c1c): campo di pagina di giorno; testata e tratta in ogni tema (la tratta resta arancione anche di sera); anche la linea in badge di sera e il filetto in cima al selettore fermate.

### Secondary
- **Ambra LED** (#ffb000): solo sui minuti e sul testo sopra nero lamiera (scorciatoie, tasto inversione, avvisi, tag). Di sera diventa anche il colore del focus, dell'anello di stato attivo e dell'attesa.

### Neutral
- **Nero lamiera** (#0d0d0d): il pannello LED, le scorciatoie, Oggi/Domani, il tasto di inversione, gli avvisi.
- **LED spento** (#2a2111): i punti non accesi della matrice, a raggio piccolo, per far leggere la griglia.
- **Inchiostro** (#111111): testo di giorno, linea in badge di giorno, testo su arancione.
- **Striscia bianca** (#ffffff): le corse future di giorno; di sera **Striscia notte** (#221b11).
- **Seppia** (#5c4a35): testo secondario sulle strisce di giorno; di sera **Seppia chiara** (#bba98c).
- **Attesa bruciata** (#a84a00): il tempo all'arrivo in formato testo e le stime, di giorno; di sera passa ad ambra.
- **Allarme** (#b3261e): solo il tag di corsa problematica.
- **Notte** (#14110c) sfondo, **Avorio caldo** (#f3e9d8) testo, **Passata notte** (#1a150d) per le corse gia' partite.

### Named Rules
**La regola dell'ambra.** L'ambra LED non decora: compare dove c'e' un numero da leggere, o su nero lamiera. Mai su bianco o su arancione.

**La regola del campo.** L'arancione AMA e' un campo, non un accento: o riempie la pagina (giorno) o fascia testata e tratta (sera). Non si usa a filetti sparsi.

## Typography

**Font:** Barlow 600 e 800 (con -apple-system, Helvetica Neue, Helvetica, Arial come ripiego). Cifre tabulari ovunque.

**Character:** il grotesque della segnaletica stradale, stretto e pesante, che regge i numeri grandi e il testo piccolo al sole. Due pesi soltanto: 800 per tutto cio' che si legge, 600 per il corpo e i dettagli.

### Hierarchy
- **Display LED** (800, 32 px, 1.05, -0.03em): l'orario di partenza sulle strisce. I minuti del pannello non sono testo: sono punti (96 px di altezza).
- **Headline** (800, 25 px, 28 px, -0.02em): le fermate Da/A nella tratta.
- **Title** (800, 19 px, -0.01em): nome app; orari nel pannello LED (19 px); ora corrente 17 px.
- **Body** (600, 16 px, 1.3): base; scorciatoie e Oggi/Domani 15 px a 800.
- **Label** (600-800, 12-13 px): dettagli di corsa (600, 12 px, 1.35), avvisi (800, 12-13 px), sottotitoli del selettore.

### Named Rules
**La regola dei due pesi.** 800 o 600, niente di mezzo. Le gerarchie si fanno con dimensione e con colore di campo, non con pesi intermedi.

**La regola dei minuti a punti.** Il conto alla rovescia e' sempre la matrice di punti 5x7 (funzione `punti()` in `app.js`, dati `GLIFI`), mai testo composto, nel pannello e nel mini-pannello delle strisce.

## Layout

Una colonna centrata, larga al massimo 480 px, alta quanto la viewport (100dvh) senza scorrimento di pagina: testata, tratta, scorciatoie, Oggi/Domani e piede restano fermi; scorre solo la lista delle corse, con una dissolvenza di 14 px in alto. Il margine superiore e' 36 px piu' `safe-area-inset-top`: e' deliberato, tiene logo e titolo fuori dalla sfocatura della barra di stato iOS, e non va ridotto. Margine laterale 16 px; ritmo verticale tra blocchi 12 px; tra strisce 6 px; tra scorciatoie 4 px.

Aree di tocco: campi della tratta 46 px, tasto di inversione 52 px, scorciatoie 34 px, Oggi/Domani 38 px, opzioni del selettore 56 px, pulsante "vedi domani" 44 px. La striscia di corsa e' una griglia a tre colonne: badge di linea 46 px, orari, conto alla rovescia. Le corse passate si comprimono (padding 7 px, orario 22 px, dettagli nascosti) e stanno sopra; la prossima e' il pannello LED, poi le successive.

## Elevation & Depth

Piatto. Nessuna ombra sfumata e nessuna ombra spostata. La profondita' viene dal contrasto tra campi di colore (arancione, nero, bianco) e dalla sovrapposizione del selettore su un velo nero al 55%. L'unico alone e' l'anello pieno di 3 px (`box-shadow: 0 0 0 3px`) attorno a scorciatoia o giorno attivo.

### Named Rules
**La regola piatta.** Le superfici non hanno ombra; lo stato si dice con riempimento e anello, non con altezza.

## Shapes

Angoli piccoli e secchi, da targa: 4 px per badge, tag e pulsanti interni; 6 px per strisce, scorciatoie e opzioni; 8 px per il pannello LED; 9 px per il logo; 14 px solo sopra al selettore. Il tag di corsa pende dal bordo alto con gli angoli bassi arrotondati. I punti del LED sono cerchi (acceso r=0.4, spento r=0.17 su cella unitaria). Il segno dell'app e' la tabella a LED con "AQ" in punti 5x7, generata da `tools/make_icon.py`: lo stesso alfabeto dei minuti.

## Components

### Pannello LED (la prossima corsa)
Nero lamiera, testo ambra, raggio 8 px. A sinistra i minuti a punti (96 px), a destra linea (ambra con testo nero, 32 px), orari e dettagli. Quando la corsa e' imminente i punti "respirano" (opacita' a .72, 1.8 s).

### Strisce di corsa
Bianche (notte: #221b11), raggio 6 px. Badge di linea in quadrato scuro (di sera arancione con testo nero), orario a 32 px, arrivo in seppia con trattino, conto alla rovescia in mini-pannello nero a punti (26 px). Passata: sfondo traslucido o #1a150d, compressa, senza dettagli.

### Scorciatoie e Oggi/Domani
Strisce nere con testo ambra, 15 px a 800. Attivo: riempito col colore del tema (bianco di giorno, arancione di sera) con testo inchiostro e anello di 3 px. Lo stesso linguaggio per entrambi i gruppi. Pressione: scala .985.

### Tratta e tasto di inversione
Campo arancione fisso, due righe divise da un filetto inchiostro di 2 px: etichetta Da/A a sinistra, fermata a 25 px. Tasto di inversione quadrato nero 52 px con freccia ambra; ruota con curva a decelerazione.

### Selettore fermate
Foglio dal basso con filetto arancione di 8 px in cima, raggio 14 px, opzioni da 56 px con quadratino di stato; l'opzione scelta ha un anello interno di 2 px. Entrata scaglionata (26 ms per voce).

### Avvisi e suggerimenti
Barre nere con testo ambra, 12-13 px a 800; il bottone interno ha bordo ambra di 1.5 px. Dentro il pannello LED il suggerimento si inverte (fondo ambra, testo nero).

## Do's and Don'ts

### Do:
- **Do** usare Barlow a 800 per cio' che si legge subito e 600 per il resto.
- **Do** disegnare ogni conto alla rovescia con la matrice di punti 5x7 e il suo alfabeto.
- **Do** tenere nero lamiera e ambra uguali nei due temi; cambiano solo sfondo, strisce e testo.
- **Do** dire lo stato attivo con riempimento del colore di tema piu' anello pieno di 3 px.
- **Do** mantenere i 36 px sopra `safe-area-inset-top` e aree di tocco di almeno 34 px.
- **Do** rispettare `prefers-reduced-motion` (animazioni ridotte a 1 ms).

### Don't:
- **Don't** usare ambra fuori da minuti e superfici nere.
- **Don't** introdurre accenti blu, viola o un tema scuro freddo.
- **Don't** aggiungere schede morbide, ombre sfumate o raggi sopra gli 8 px (il foglio del selettore e' l'unica eccezione).
- **Don't** introdurre pesi di Barlow diversi da 600 e 800.
- **Don't** riordinare da solo tratte o scorciatoie.
