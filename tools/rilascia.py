#!/usr/bin/env python3
"""Prepara una pubblicazione: verifica i dati e timbra il service worker.

Il nome della cache nasce dall'impronta dei file serviti, non da un numero scritto a
mano: cambia da se' quando cambia qualcosa e resta fermo quando non e' cambiato niente.
Prima si incrementava a mano a ogni pubblicazione, e bastava dimenticarsene una volta
perche' i dispositivi restassero indietro in silenzio.

    python3 tools/rilascia.py            verifica, timbra e dice cosa fare
    python3 tools/rilascia.py --controlla   non scrive: dice solo se il timbro e' aggiornato
"""
import argparse
import hashlib
import re
import subprocess
import sys
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
SW = RADICE / "sw.js"

# Gli stessi file che il service worker mette in cache. Si leggono da sw.js invece di
# riscriverli qui: due elenchi da tenere allineati a mano divergono sempre.
ELENCO = re.compile(r"^const (?:VIVI|FERMI) = \[(.*?)\];", re.M | re.S)
TIMBRO = re.compile(r"^const CACHE = '([^']*)';", re.M)


def file_serviti(sorgente):
    nomi = []
    for blocco in ELENCO.findall(sorgente):
        nomi += re.findall(r"'\./([^']*)'", blocco)
    return [n for n in nomi if n]            # './' da solo e' index.html, gia' incluso


def impronta(nomi):
    h = hashlib.sha256()
    for nome in sorted(nomi):
        f = RADICE / nome
        if not f.exists():
            print(f"  manca: {nome}", file=sys.stderr)
            continue
        h.update(nome.encode())
        h.update(f.read_bytes())
    return h.hexdigest()[:10]


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--controlla", action="store_true",
                    help="non scrive niente, esce con 1 se il timbro non e' aggiornato")
    ap.add_argument("--salta-verifica", action="store_true",
                    help="non eseguire tools/verifica.py")
    args = ap.parse_args()

    if not args.salta_verifica:
        verifica = RADICE / "tools" / "verifica.py"
        if verifica.exists():
            print("verifica dei dati…")
            if subprocess.call([sys.executable, str(verifica)]) != 0:
                print("\nverifica fallita: non timbro niente.", file=sys.stderr)
                return 1
        else:
            print("(tools/verifica.py non c'e': salto la verifica)", file=sys.stderr)

    sorgente = SW.read_text(encoding="utf-8")
    nomi = file_serviti(sorgente)
    nuovo = "bus-aq-" + impronta(nomi)
    attuale = TIMBRO.search(sorgente).group(1)

    if attuale == nuovo:
        print(f"\ntimbro gia' aggiornato: {nuovo}  ({len(nomi)} file)")
        return 0

    if args.controlla:
        print(f"\ntimbro da aggiornare: {attuale} -> {nuovo}", file=sys.stderr)
        return 1

    SW.write_text(TIMBRO.sub(f"const CACHE = '{nuovo}';", sorgente, count=1), encoding="utf-8")
    print(f"\ntimbro: {attuale} -> {nuovo}  ({len(nomi)} file)")
    print("ora: git add -A && git commit && git push")
    return 0


if __name__ == "__main__":
    sys.exit(main())
