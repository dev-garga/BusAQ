# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Marco, studente UnivAQ, e altri studenti dell'Università dell'Aquila con cui lo condividerà. Aprono l'app in piedi alla fermata, o la sera per organizzarsi l'indomani, dall'iPhone (PWA aggiunta alla schermata Home). Il compito: sapere in pochi secondi quale autobus prendere fra due fermate e quando parte. Le tratte tipiche collegano casa (Fontana Luminosa, Via Strinella, Viale Panella) a Università Coppito, ma la tratta è libera fra sei fermate.

## Product Purpose
Mostrare gli orari degli autobus AMA de L'Aquila fra due fermate qualsiasi, con le prossime corse, il tempo all'arrivo e il consiglio quando conviene aspettare una corsa successiva perché arriva prima. Riuscito quando l'utente guarda lo schermo per cinque secondi e sa cosa fare.

## Positioning
Gli orari AMA esistono solo come PDF per linea, pensati per la lettura su carta. Bus AQ li trasforma in una risposta per tratta: l'utente sceglie partenza e arrivo, non una linea. Nessun'altra app lo fa per queste fermate.

## Operating Context
- Fonte unica: i PDF ufficiali AMA, uno per linea, dalla pagina «Elenco linee AMA». Gli orari non si scaricano mai da soli: si rigenerano con la pipeline in `tools/` e si pubblicano su GitHub Pages.
- AMA rivede gli orari spesso e cambia il nome dei file a ogni revisione; i dati possono quindi restare indietro finché non si rigenerano.
- Funziona offline (service worker) e senza account né tracciamento.

## Capabilities and Constraints
- Tratta libera fra sei fermate; due scorciatoie fisse; oggi/domani; calendario feriale, sabato, festivo (domeniche, festività nazionali, Pasquetta).
- Alcuni orari sono stimati da una fermata adiacente e vanno dichiarati come tali; non si approssima altro senza consenso.
- Statico, senza backend, senza dipendenze di costruzione: HTML, CSS e moduli ES serviti così come sono.
- Lingua: italiano. Terminologia: «corsa», «fermata», «lato università / lato ospedale» (le due fermate di Coppito).
- Aperto: il calendario scolastico non è noto, quindi le corse «solo vacanze» e «scolastica» si segnalano senza poterle nascondere.

## Brand Commitments
Nome «Bus AQ». App non ufficiale, dichiarata come tale: non è di AMA e gli orari vengono dai PDF AMA. Il segno è il percorso con due capolinea già usato per logo e icona.

## Evidence on Hand
Orari reali estratti dai PDF AMA (`schedule.json`, 329 corse, aggiornati al 1 ottobre 2026) con collaudi sulla logica. Nessun dato d'uso, recensione o testimonianza: non inventarne.

## Product Principles
- Prima la risposta, poi il resto: partenza, arrivo e tempo di attesa dominano; ogni elemento che non aiuta a leggere un orario è rumore.
- Mai un dato sbagliato detto con sicurezza: gli orari stimati, le corse incerte e le fonti si dichiarano.
- La tratta è dell'utente: nessuna fermata privilegiata, scorciatoie ferme, niente che si riordini da solo.
- Si apre e si usa: nessun accesso, nessuna attesa, funziona anche senza rete.

## Accessibility & Inclusion
Uso con una mano, all'aperto e di sera: aree di tocco ampie, testo leggibile al sole e al buio, rispetto di «riduci movimento».
