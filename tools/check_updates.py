#!/usr/bin/env python3
"""Dice se AMA ha pubblicato orari diversi da quelli usati per schedule.json.

    python3 tools/check_updates.py

Confronta la pagina «Elenco linee AMA» con pdf_state.json, che registra la revisione
di ogni PDF usata nell'ultima estrazione. Non aggiorna niente: lo stato lo scrive
`extract_schedule.py --download` quando i dati vengono davvero rigenerati, cosi'
l'avviso resta finche' il lavoro non e' fatto.

La versione precedente sorvegliava gli URL delle bozze di settembre. AMA ha poi
pubblicato gli orari ufficiali con URL nuovi, e il controllo ha continuato a dire
"invariato" per due settimane. Ora le linee si cercano per etichetta.

Codici di uscita — distinti apposta, perche' un controllo automatico deve poter dire «ci sono
novita'» e «non sono riuscito a guardare» come due cose diverse:
    0  nessuna novita'
    1  AMA ha pubblicato revisioni nuove (o linee comparse/sparite)
    2  controllo non riuscito: rete assente, o la pagina AMA non ha piu' la forma attesa
"""
import json
import sys
from pathlib import Path

from ama import elenco

ROOT = Path(__file__).resolve().parent
LINEE_MINIME = 20          # la pagina ne elenca una quarantina


def main():
    cfg = json.loads((ROOT / "lines.json").read_text(encoding="utf-8"))
    stato_f = ROOT / "pdf_state.json"
    stato = json.loads(stato_f.read_text(encoding="utf-8")) if stato_f.exists() else {}
    manuali_f = ROOT / "manuali.json"
    manuali = ({d["source"] for d in json.loads(manuali_f.read_text(encoding="utf-8"))["directions"]}
               if manuali_f.exists() else set())

    try:
        pagina = elenco()
    except Exception as e:                       # rete assente, HTTP 5xx, timeout…
        print(f"controllo non riuscito: {e.__class__.__name__}: {e}", file=sys.stderr)
        return 2
    # Una pagina con pochissime linee non e' «tutte le linee sono sparite»: e' la struttura
    # del sito che e' cambiata e l'estrazione dei blocchi non trova piu' niente.
    if len(pagina) < LINEE_MINIME:
        print(f"controllo non riuscito: sulla pagina AMA trovo {len(pagina)} linee (ne attendo almeno "
              f"{LINEE_MINIME}): la struttura della pagina e' probabilmente cambiata, vedi tools/ama.py.",
              file=sys.stderr)
        return 2
    cambiate = []
    print("linee usate dall'app:")
    for chiave, src in cfg["sources"].items():
        ora, prima = pagina.get(src["etichetta"]), stato.get(chiave, {})
        if not ora:
            print(f"  {chiave:<5} SPARITA dalla pagina AMA")
            cambiate.append(chiave)
            continue
        if ora["file"] != prima.get("file") or ora["aggiornata"] != prima.get("aggiornata"):
            print(f"  {chiave:<5} AGGIORNATA: {prima.get('file', '—')} ({prima.get('aggiornata', '—')})")
            print(f"  {'':<5}          -> {ora['file']} ({ora['aggiornata']})")
            if chiave in manuali:
                print(f"  {'':<5}          ha corse trascritte a mano in manuali.json: vanno ricontrollate")
            cambiate.append(chiave)
        else:
            print(f"  {chiave:<5} invariata — {ora['file']} ({ora['aggiornata']})")

    note = set(stato.get("_pagina", []))
    if note:
        nuove, sparite = sorted(set(pagina) - note), sorted(note - set(pagina))
        if nuove:
            print("\nlinee comparse sulla pagina AMA:", ", ".join(nuove))
        if sparite:
            print("linee sparite dalla pagina AMA:", ", ".join(sparite))

    if cambiate:
        print("\nPer rigenerare gli orari:")
        print("  python3 tools/extract_schedule.py --download")
        print("e rileggere il report a fianco dei PDF prima di pubblicare.")
        return 1
    print("\nnessuna novita'.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
