#!/usr/bin/env python3
"""Controlla schedule.json prima di pubblicarlo.

Ogni controllo qui dentro e' un errore che e' gia' successo davvero, o che i PDF AMA
rendono facile: colonne disallineate, una linea che sparisce in silenzio, una fermata
dichiarata e mai usata. Finora li ho cercati a mano ogni volta.

    python3 tools/verifica.py                  verifica e riepiloga
    python3 tools/verifica.py --file altro.json
    python3 tools/verifica.py --senza-confronto  niente confronto con la versione in git
    python3 tools/verifica.py --base origin/main   confronta con un'altra versione (predefinito: HEAD)
    python3 tools/verifica.py --tutto          elenca ogni corsa cambiata, senza tagliare

Il confronto con git dice, direzione per direzione, QUALI corse sono state aggiunte, tolte
o cambiate (con partenza e arrivo): e' la lista da spuntare leggendo il PDF, al posto di un
conteggio per linea che non dice cosa guardare.

Esce con 1 se trova errori, 0 altrimenti. Gli avvisi non fanno fallire.
"""
import argparse
import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
ORA = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")

errori, avvisi = [], []


def err(msg): errori.append(msg)
def avv(msg): avvisi.append(msg)


def minuti(t):
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def nome(d, meta):
    linea = meta["lines"].get(d["line"], {})
    etichetta = linea.get("num", d["line"]) + linea.get("sub", "")
    return f"{etichetta} {d.get('side') or '/'.join(d['stops'][:1])}"


def struttura(dati):
    """_meta e directions esistono e hanno la forma attesa."""
    if "_meta" not in dati or "directions" not in dati:
        err("mancano '_meta' o 'directions'")
        return None, None
    meta, dirs = dati["_meta"], dati["directions"]
    for chiave in ("stops", "lines", "default_days"):
        if chiave not in meta:
            err(f"_meta senza '{chiave}'")
    if not isinstance(dirs, list) or not dirs:
        err("'directions' vuoto o non e' un elenco")
        return meta, []
    return meta, dirs


def coerenza(meta, dirs):
    """Riferimenti validi, righe allineate, orari che non tornano indietro."""
    for d in dirs:
        eti = nome(d, meta)

        if d["line"] not in meta["lines"]:
            err(f"{eti}: linea '{d['line']}' non dichiarata in _meta.lines")
        ignote = [s for s in d["stops"] if s not in meta["stops"]]
        if ignote:
            err(f"{eti}: fermate non dichiarate: {ignote}")
        if len(set(d["stops"])) != len(d["stops"]):
            err(f"{eti}: la stessa fermata compare due volte in 'stops'")
        for s in (d.get("approx") or {}):
            if s not in d["stops"]:
                err(f"{eti}: 'approx' cita '{s}', che non e' fra le sue fermate")

        viste = set()
        for n, r in enumerate(d.get("runs", []), 1):
            t = r.get("t")
            if not isinstance(t, list) or len(t) != len(d["stops"]):
                err(f"{eti} corsa {n}: {len(t) if isinstance(t, list) else '?'} orari "
                    f"per {len(d['stops'])} fermate")
                continue

            for x in t:
                if x is not None and not ORA.match(str(x)):
                    err(f"{eti} corsa {n}: orario non valido {x!r}")

            # Una riga che torna indietro nel tempo significa colonne disallineate:
            # e' l'errore piu' insidioso dell'estrazione dai PDF, perche' produce
            # orari perfettamente plausibili ma attribuiti alla fermata sbagliata.
            pieni = [(i, x) for i, x in enumerate(t) if x and ORA.match(str(x))]
            for (ia, a), (ib, b) in zip(pieni, pieni[1:]):
                if minuti(b) < minuti(a):
                    err(f"{eti} corsa {n}: {d['stops'][ia]} {a} -> {d['stops'][ib]} {b} "
                        f"torna indietro (colonne disallineate?)")

            g = r.get("days", meta.get("default_days", []))
            if not g or any(x not in range(7) for x in g):
                err(f"{eti} corsa {n}: giorni non validi {g}")

            firma = tuple(t)
            if firma in viste:
                avv(f"{eti} corsa {n}: identica a un'altra corsa della stessa direzione")
            viste.add(firma)


def copertura(meta, dirs):
    """Niente dichiarato e mai usato, e ogni fermata raggiungibile da qualche parte."""
    usate = {s for d in dirs for s in d["stops"]}
    for s in meta["stops"]:
        if s not in usate:
            err(f"fermata '{s}' dichiarata ma non servita da nessuna direzione")
    usate_linee = {d["line"] for d in dirs}
    for l in meta["lines"]:
        if l not in usate_linee:
            avv(f"linea '{l}' dichiarata ma senza direzioni")

    coppie = set()
    for d in dirs:
        for i in range(len(d["stops"])):
            for j in range(i + 1, len(d["stops"])):
                if any(r["t"][i] and r["t"][j] and minuti(r["t"][j]) > minuti(r["t"][i])
                       for r in d["runs"] if len(r.get("t", [])) == len(d["stops"])):
                    coppie.add((d["stops"][i], d["stops"][j]))
    if not coppie:
        err("nessuna coppia di fermate risulta servita: l'app non mostrerebbe nulla")
    for s in usate:
        if not any(s in c for c in coppie):
            err(f"fermata '{s}': nessuna tratta utilizzabile, ne' in partenza ne' in arrivo")
    return coppie


def per_linea(dati):
    """Corse, prima e ultima partenza, corse solo lun-ven e festive — per linea."""
    meta = dati["_meta"]
    out = defaultdict(lambda: {"corse": 0, "feriali": 0, "festive": 0, "ore": []})
    for d in dati["directions"]:
        v = out[d["line"]]
        for r in d["runs"]:
            v["corse"] += 1
            giorni = r.get("days", meta["default_days"])
            if giorni == [0]:
                v["festive"] += 1
            elif 6 not in giorni:
                v["feriali"] += 1
            partenze = [x for x in r["t"] if x]
            if partenze:
                v["ore"].append(partenze[0])
    return {k: {"corse": v["corse"], "feriali": v["feriali"], "festive": v["festive"],
                "prima": min(v["ore"], default="-"), "ultima": max(v["ore"], default="-")}
            for k, v in out.items()}


def firma(r, base_giorni):
    """Cio' che distingue una corsa: gli orari e il calendario (giorni, periodo scolastico)."""
    return (tuple(r["t"]), tuple(r.get("days", base_giorni)), bool(r.get("scolastica")),
            bool(r.get("vacanze")), r.get("nota_ignota", ""))


def calendario(sig):
    """Come circola una corsa, a parole; vuoto se e' il calendario consueto."""
    t, giorni, scol, vac, nota = sig
    extra = []
    if giorni == (0,):
        extra.append("festiva")
    elif giorni != (1, 2, 3, 4, 5, 6):
        extra.append("solo " + ",".join(("dom", "lun", "mar", "mer", "gio", "ven", "sab")[g] for g in giorni))
    if scol: extra.append("scolastica")
    if vac: extra.append("solo vacanze")
    if nota: extra.append("nota " + nota)
    return ", ".join(extra)


def etichetta_corsa(stops, sig, nomi):
    """'07:05 Terminal Collemaggio → 07:45 Università Coppito  [calendario se non e' il solito]'"""
    pieni = [(st, x) for st, x in zip(stops, sig[0]) if x]
    nome = lambda st: (nomi.get(st) or {}).get("short") or st
    testo = f"{pieni[0][1]} {nome(pieni[0][0])} → {pieni[-1][1]} {nome(pieni[-1][0])}"
    cal = calendario(sig)
    return testo + (f"  [{cal}]" if cal else "")


def differenze_corse(prima, dopo):
    """Per direzione, le corse aggiunte (+), tolte (-) e cambiate di calendario (~).

    -> [(id_direzione, [righe])], solo per le direzioni che cambiano. Una corsa con gli
    stessi orari ma un calendario diverso e' "cambiata", non una tolta e una aggiunta:
    sono due letture molto diverse (la corsa c'e' ancora, circola in altri giorni).
    """
    nomi = dopo["_meta"].get("stops", {})
    base_p, base_d = prima["_meta"]["default_days"], dopo["_meta"]["default_days"]
    dp = {d["id"]: d for d in prima["directions"]}
    dd = {d["id"]: d for d in dopo["directions"]}
    out = []
    for did in sorted(set(dp) | set(dd)):
        a, b = dp.get(did), dd.get(did)
        if a and not b:
            out.append((did, [f"- direzione tolta ({len(a['runs'])} corse)"])); continue
        if b and not a:
            out.append((did, [f"+ direzione nuova ({len(b['runs'])} corse): "
                              + " > ".join(b["stops"])])); continue
        righe = []
        if a["stops"] != b["stops"]:
            righe.append(f"! fermate cambiate: {' > '.join(a['stops'])}  ->  {' > '.join(b['stops'])}")
        sa = defaultdict(int); sb = defaultdict(int)
        for r in a["runs"]: sa[firma(r, base_p)] += 1
        for r in b["runs"]: sb[firma(r, base_d)] += 1
        tolte = [k for k in sa for _ in range(sa[k] - min(sa[k], sb.get(k, 0)))]
        aggiunte = [k for k in sb for _ in range(sb[k] - min(sb[k], sa.get(k, 0)))]
        # stessi orari, calendario diverso
        for k in list(tolte):
            m = next((x for x in aggiunte if x[0] == k[0]), None)
            if m:
                tolte.remove(k); aggiunte.remove(m)
                righe.append("~ " + etichetta_corsa(b["stops"], m, nomi)
                             + f"   (era: {calendario(k) or 'calendario consueto'})")
        righe += ["- " + etichetta_corsa(a["stops"], k, nomi) for k in sorted(tolte)]
        righe += ["+ " + etichetta_corsa(b["stops"], k, nomi) for k in sorted(aggiunte)]
        if righe:
            out.append((did, righe))
    return out


def confronto(dati, percorso, accetta=False, base="HEAD", tutto=False):
    """Differenze rispetto a una versione gia' in git: una linea che perde corse va vista.

    Con accetta=True le perdite diventano avvisi: serve quando sono state rilette una
    per una sul PDF e spiegate, come al passaggio dalle bozze agli orari ufficiali. L'elenco
    delle corse cambiate si stampa comunque: accettare una perdita non vuol dire non guardarla.
    """
    segnala = avv if accetta else err
    try:
        vecchio = json.loads(subprocess.run(["git", "show", f"{base}:{percorso}"], cwd=RADICE,
                                            capture_output=True, text=True, check=True).stdout)
        prima = per_linea(vecchio)
    except Exception as e:
        avv(f"confronto con git ({base}) non possibile ({e.__class__.__name__}): salto")
        return

    dopo = per_linea(dati)
    righe = []
    for l in sorted(set(prima) | set(dopo)):
        a, b = prima.get(l), dopo.get(l)
        if a == b:
            continue
        if a and not b:
            segnala(f"la linea '{l}' e' sparita del tutto ({a['corse']} corse)")
            continue
        if b and not a:
            righe.append(f"  + {l}: nuova, {b['corse']} corse")
            continue
        if b["corse"] < a["corse"]:
            segnala(f"la linea '{l}' perde corse: {a['corse']} -> {b['corse']}")
        else:
            righe.append(f"  ~ {l}: {a['corse']} -> {b['corse']} corse, "
                         f"{a['prima']}–{a['ultima']} -> {b['prima']}–{b['ultima']}")
    if righe:
        print(f"\ndifferenze per linea rispetto a {base}:")
        print("\n".join(righe))

    diff = differenze_corse(vecchio, dati)
    if diff:
        n = lambda ls, c: sum(1 for r in ls if r.startswith(c))
        print(f"\ncorse cambiate rispetto a {base}, per direzione "
              f"(+ aggiunta, - tolta, ~ calendario diverso):")
        for did, ls in diff:
            print(f"  {did}  (+{n(ls, '+')} -{n(ls, '-')} ~{n(ls, '~')})")
            for r in (ls if tutto else ls[:40]):
                print("      " + r)
            if not tutto and len(ls) > 40:
                print(f"      … e altre {len(ls) - 40} (--tutto le mostra)")


def riepilogo(dati, coppie):
    meta = dati["_meta"]
    print(f"\n{'linea':<10} {'corse':>6} {'lun-ven':>8} {'festive':>8} {'prima':>7} {'ultima':>8}")
    print("-" * 52)
    tot = 0
    for l, v in sorted(per_linea(dati).items()):
        etichetta = meta["lines"][l]["num"] + meta["lines"][l]["sub"] if l in meta["lines"] else l
        print(f"{etichetta:<10} {v['corse']:>6} {v['feriali']:>8} {v['festive']:>8} {v['prima']:>7} {v['ultima']:>8}")
        tot += v["corse"]
    print("-" * 52)
    print(f"{'TOTALE':<10} {tot:>6}   in {len(dati['directions'])} direzioni, "
          f"{len(coppie)} coppie servite")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--file", default="schedule.json")
    ap.add_argument("--senza-confronto", action="store_true")
    ap.add_argument("--base", default="HEAD", help="versione di git con cui confrontare (predefinito HEAD)")
    ap.add_argument("--tutto", action="store_true", help="elenca ogni corsa cambiata, senza tagliare a 40 per direzione")
    ap.add_argument("--accetta-perdite", action="store_true",
                    help="le linee che perdono corse rispetto a git diventano avvisi: "
                         "solo dopo averle rilette sul PDF")
    args = ap.parse_args()

    percorso = args.file
    f = RADICE / percorso
    if not f.exists():
        print(f"non trovo {percorso}", file=sys.stderr)
        return 1
    dati = json.loads(f.read_text(encoding="utf-8"))

    meta, dirs = struttura(dati)
    if dirs:
        coerenza(meta, dirs)
        coppie = copertura(meta, dirs)
        if not args.senza_confronto:
            confronto(dati, percorso, args.accetta_perdite, args.base, args.tutto)
        riepilogo(dati, coppie)

    for a in avvisi:
        print(f"avviso: {a}", file=sys.stderr)
    for e in errori:
        print(f"ERRORE: {e}", file=sys.stderr)
    print(f"\n{len(errori)} errori, {len(avvisi)} avvisi")
    return 1 if errori else 0


if __name__ == "__main__":
    sys.exit(main())
