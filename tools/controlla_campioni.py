#!/usr/bin/env python3
"""Confronta alcune corse di schedule.json con il TESTO del PDF da cui vengono.

    python3 tools/controlla_campioni.py              controlla tools/campioni.json
    python3 tools/controlla_campioni.py --proponi    campioni nuovi per le direzioni scadute o senza
    python3 tools/controlla_campioni.py --scrivi     li aggiunge a campioni.json (dopo averli letti)

Serve pdfplumber (tools/requirements.txt).

Cosa dimostra e cosa no. Un campione e' una corsa letta sul PDF e legata al NOME del file
da cui l'ho letta: se AMA ripubblica la linea il file cambia nome e i campioni risultano
scaduti, perche' valgono per quella revisione e non per la successiva (lo dice verifica.py).
Qui si controlla una cosa diversa, indipendente dal lettore di tabelle: che gli orari della
corsa compaiano nel testo del PDF, nello stesso ordine, su una stessa riga. Coglie orari
sbagliati, troncati, inventati o spariti. NON coglie una colonna assegnata alla fermata
sbagliata: gli orari sono comunque tutti li', nell'ordine giusto. Per quello c'e' la ricerca
delle colonne per nome (tools/extract_schedule.py) e la lettura a occhio, che il campo
«come» di ogni campione distingue: «occhi» = guardata sul PDF, «testo» = solo questo controllo.
"""
import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pdfplumber  # noqa: E402
import extract_schedule as E  # noqa: E402
from fonti import fonti_correnti  # noqa: E402

RADICE = Path(__file__).resolve().parent.parent
CAMPIONI = RADICE / "tools" / "campioni.json"
ORARIO = re.compile(r"^\(?(\d{1,2})[.:,](\d{2})\)?$")


def minuti(t):
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def righe_di_orari(pdf_path):
    """Per ogni riga di testo del PDF, gli orari che contiene, da sinistra a destra."""
    out = []
    with pdfplumber.open(pdf_path) as pdf:
        for pagina in pdf.pages:
            parole = E.pagina_pulita(pagina).extract_words()
            gruppi = {}
            for w in parole:
                gruppi.setdefault(round(w["top"] / 3), []).append(w)     # stessa riga: entro ~3 pt
            for _, ws in sorted(gruppi.items()):
                orari = []
                for w in sorted(ws, key=lambda w: w["x0"]):
                    m = ORARIO.match(w["text"].strip())
                    if m and int(m.group(1)) < 24:
                        orari.append(f"{int(m.group(1)):02d}:{m.group(2)}")
                if orari:
                    out.append(orari)
    return out


def nel_testo(righe, t):
    """True se gli orari pieni di t compaiono, in ordine, su una stessa riga di testo."""
    # Due fermate che condividono una colonna (Panella e Fontana Luminosa sulla A e sulla B) danno
    # la stessa ora due volte di seguito: nel PDF e' scritta una volta sola.
    voluti = []
    for x in t:
        if x and (not voluti or x != voluti[-1]):
            voluti.append(x)
    for r in righe:
        it = iter(r)
        if all(any(x == y for y in it) for x in voluti):
            return True
    return False


def proposte(dati, fonte, gia):
    """Prima corsa, una di mezzogiorno e ultima, per le direzioni che non hanno campioni validi."""
    out = {}
    for d in dati["directions"]:
        if gia.get(d["id"], {}).get("fonte") == fonte.get(d["id"]):
            continue
        runs = [r for r in d["runs"] if all(x is None or isinstance(x, str) for x in r["t"])]
        if not runs:
            continue
        prima = lambda r: next(x for x in r["t"] if x)
        runs = sorted(runs, key=lambda r: minuti(prima(r)))
        scelte = [runs[0], min(runs, key=lambda r: abs(minuti(prima(r)) - 12 * 60 - 30)), runs[-1]]
        visti, corse = set(), []
        for r in scelte:
            if tuple(r["t"]) not in visti:
                visti.add(tuple(r["t"])); corse.append(r["t"])
        out[d["id"]] = {"fonte": fonte.get(d["id"]), "corse": corse}
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--proponi", action="store_true")
    ap.add_argument("--scrivi", action="store_true", help="aggiunge a campioni.json le proposte confermate dal testo")
    args = ap.parse_args()

    dati = json.loads((RADICE / "schedule.json").read_text(encoding="utf-8"))
    campioni = json.loads(CAMPIONI.read_text(encoding="utf-8")) if CAMPIONI.exists() else {"direzioni": {}}
    fonte = fonti_correnti(RADICE)
    cache, fallite = {}, 0

    def conferma(file, t):
        if file not in cache:
            cache[file] = righe_di_orari(RADICE / "fonti" / file)
        return nel_testo(cache[file], t)

    if args.proponi or args.scrivi:
        nuove = proposte(dati, fonte, campioni["direzioni"])
        if not nuove:
            print("tutte le direzioni hanno campioni validi per la revisione in uso")
            return 0
        for did, p in nuove.items():
            esiti = [(t, conferma(p["fonte"], t)) for t in p["corse"]]
            print(f"\n{did}   [{p['fonte']}]")
            for t, ok in esiti:
                print(f"   {'testo ok  ' if ok else 'NON NEL TESTO'}  {t}")
            fallite += sum(1 for _, ok in esiti if not ok)
            if args.scrivi:
                buone = [{"t": t, "come": "testo"} for t, ok in esiti if ok]
                if buone:
                    campioni["direzioni"][did] = {"fonte": p["fonte"], "letti": date.today().isoformat(), "corse": buone}
        if args.scrivi:
            campioni["direzioni"] = dict(sorted(campioni["direzioni"].items()))
            CAMPIONI.write_text(json.dumps(campioni, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
            print(f"\nscritto {CAMPIONI.relative_to(RADICE)}")
        return 1 if fallite else 0

    totale = 0
    for did, c in campioni["direzioni"].items():
        if c["fonte"] != fonte.get(did):
            continue                                   # scaduti: se ne occupa verifica.py
        for s in c["corse"]:
            totale += 1
            if not conferma(c["fonte"], s["t"]):
                fallite += 1
                print(f"NON NEL TESTO DEL PDF  {did}  {s['t']}  [{c['fonte']}]", file=sys.stderr)
    print(f"{totale} campioni controllati sul testo dei PDF, {fallite} non trovati")
    return 1 if fallite else 0


if __name__ == "__main__":
    sys.exit(main())
