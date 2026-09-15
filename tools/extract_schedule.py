#!/usr/bin/env python3
"""Genera schedule.json dai PDF orari AMA, secondo la mappatura in lines.json.

    tools/.venv/bin/python tools/extract_schedule.py            # scrive schedule.json
    tools/.venv/bin/python tools/extract_schedule.py --dry-run  # stampa solo il report

I PDF vengono presi da tools/pdfcache/; --download li riscarica dagli URL in lines.json.

Perche' questo script esiste: l'estrazione del 2025 fu fatta a mano e andata persa,
costringendo a rifare da zero tutto il lavoro di interpretazione dei PDF. Qui la
conoscenza dei PDF sta in lines.json e il codice resta generico.
"""
import argparse
import json
import re
import sys
import urllib.request
from collections import Counter
from datetime import date
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / "pdfcache"

TIME_RE = re.compile(r"\b(\d{1,2})[.:](\d{2})\b")


def unrotate(cell):
    """Le intestazioni verticali dei PDF AMA tornano col testo rovesciato.

    pdfplumber legge 'terminalbus' come 'sublanimret'. Si raddrizza ogni riga.
    """
    if not cell:
        return ""
    return " ".join(p[::-1] for p in cell.split("\n") if p.strip()).strip()


def parse_time(cell):
    """Estrae HH:MM da una cella, ma solo se la cella contiene *soltanto* un orario.

    Le celle non contengono solo orari: '-' indica fermata non servita, mentre
    diciture come 'stazione (7.35)' o 'via fani' segnalano che quella corsa devia
    e non transita dalla fermata della colonna. Accettarle come partenze darebbe
    corse inesistenti, quindi si scartano.
    """
    if not cell:
        return None
    txt = cell.replace("\n", " ").strip()
    m = TIME_RE.search(txt)
    if not m:
        return None
    if any(ch.isalpha() for ch in txt):
        return None
    h, mi = int(m.group(1)), int(m.group(2))
    if h > 23 or mi > 59:
        return None
    return f"{h:02d}:{mi:02d}"


def header_row_index(table):
    """Riga di intestazione: fra le prime, quella con piu' celle piene."""
    upto = min(8, len(table))
    return max(range(upto), key=lambda i: sum(1 for c in table[i] if c and c.strip()))


def has_note_column(table, hdr_i):
    """Le pagine con varianti di corsa hanno una colonna 'note' in posizione 0."""
    first = unrotate(table[hdr_i][0]).lower()
    return "note" in first


def has_line_column(table, hdr_i):
    """Dove c'e' la colonna note, la 1 riporta la variante (1T, 1G, 4L, 13X…)."""
    if len(table[hdr_i]) < 2:
        return False
    return "linea" in unrotate(table[hdr_i][1]).lower()


def apply_codes(codes, legend, default_days):
    """Traduce le lettere della colonna note in calendario e flag della corsa.

    Le lettere vanno lette una per una: 'BS' significa B e S insieme.
    """
    days = list(default_days)
    scolastica = False
    explicit = None
    for ch in codes:
        rule = legend.get(ch)
        if rule is None:
            continue
        if rule.get("scolastica"):
            scolastica = True
        if rule.get("no_saturday") and 6 in days:
            days.remove(6)
        if "days" in rule:
            explicit = rule["days"]
    if explicit is not None:
        days = list(explicit)
    return sorted(days), scolastica


def extract(cfg, download=False):
    sources, legends = cfg["sources"], cfg.get("legends", {})
    default_days = cfg["default_days"]

    if download:
        CACHE.mkdir(exist_ok=True)
        for key, src in sources.items():
            dest = CACHE / src["file"]
            print(f"  scarico {src['file']} …", file=sys.stderr)
            urllib.request.urlretrieve(src["url"], dest)

    # una pagina serve piu' rotte: si apre una volta sola
    pages = {}
    for key, src in sources.items():
        path = CACHE / src["file"]
        if not path.exists():
            sys.exit(f"manca {path} — rilanciare con --download")
        pages[key] = pdfplumber.open(path)

    schedule, report = {}, []
    for line_id, line in cfg["lines"].items():
        schedule[line_id] = {}
        for route, rc in line["routes"].items():
            page = pages[rc["source"]].pages[rc["page"] - 1]
            table = page.extract_table()
            if not table:
                report.append((line_id, route, 0, 0, "—", "—", "NESSUNA TABELLA"))
                continue

            hdr_i = header_row_index(table)
            noted = has_note_column(table, hdr_i)
            lined = has_line_column(table, hdr_i)
            legend = legends.get(f"{rc['source']}:{rc['page']}", {})

            trips = []
            for row in table[hdr_i + 1:]:
                if rc["dep_col"] >= len(row) or rc["arr_col"] >= len(row):
                    continue
                dep = parse_time(row[rc["dep_col"]])
                arr = parse_time(row[rc["arr_col"]])
                if not dep or not arr:
                    continue  # fermata non servita da questa corsa

                codes = ""
                if noted and row[0]:
                    # solo lettere maiuscole isolate: il resto e' intestazione o rumore
                    raw = row[0].replace("\n", " ").strip()
                    if len(raw) <= 4:
                        codes = "".join(ch for ch in raw if ch.isalpha() and ch.isupper())

                days, scolastica = apply_codes(codes, legend, default_days)
                trip = {"dep": dep, "arr": arr, "days": days, "scolastica": scolastica}

                # La tabella della linea unificata ospita anche corse di varianti
                # (1T, 1G, 4L, 13X…): vanno mostrate, ma etichettate per quello che sono.
                if lined and row[1]:
                    variant = row[1].replace("\n", " ").strip().strip("/")
                    if variant and variant.lower() != "linea":
                        trip["variant"] = variant

                if rc.get("side"):
                    trip["side"] = rc["side"]
                if codes:
                    trip["note"] = codes
                trips.append(trip)

            trips.sort(key=lambda t: t["dep"])
            schedule[line_id][route] = trips
            no_sat = sum(1 for t in trips if 6 not in t["days"])
            scol = sum(1 for t in trips if t["scolastica"])
            report.append((line_id, route, len(trips), no_sat, scol,
                           trips[0]["dep"] if trips else "—",
                           trips[-1]["dep"] if trips else "—"))

    for p in pages.values():
        p.close()

    schedule["_meta"] = {
        "generated": date.today().isoformat(),
        "effective": cfg["effective"],
        "draft": cfg.get("draft", False),
        "stops": cfg["stops"],
        "lines": {lid: {"num": l["num"], "sub": l["sub"], "descrizione": l["descrizione"]}
                  for lid, l in cfg["lines"].items()},
    }
    return schedule, report


def print_report(report, schedule):
    print(f"\n{'linea':<10} {'rotta':<24} {'corse':>6} {'no-sab':>7} {'scolast':>8}  {'prima':>6} {'ultima':>7}")
    print("-" * 76)
    for line_id, route, n, no_sat, scol, first, last in report:
        flag = "  ⚠" if n == 0 else ""
        print(f"{line_id:<10} {route:<24} {n:>6} {no_sat:>7} {scol:>8}  {first:>6} {last:>7}{flag}")

    total = sum(r[2] for r in report)
    print("-" * 76)
    print(f"{'TOTALE':<10} {'':<24} {total:>6}")

    notes = Counter()
    for line_id, routes in schedule.items():
        if line_id.startswith("_"):
            continue
        for trips in routes.values():
            for t in trips:
                if t.get("note"):
                    notes[t["note"]] += 1
    if notes:
        print("\ncodici nota incontrati:", dict(notes))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="stampa il report senza scrivere")
    ap.add_argument("--download", action="store_true", help="riscarica i PDF dagli URL")
    ap.add_argument("--out", default=str(ROOT.parent / "schedule.json"))
    args = ap.parse_args()

    cfg = json.loads((ROOT / "lines.json").read_text(encoding="utf-8"))
    schedule, report = extract(cfg, download=args.download)
    print_report(report, schedule)

    if args.dry_run:
        print("\n(dry-run: schedule.json non e' stato scritto)")
        return
    Path(args.out).write_text(
        json.dumps(schedule, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nscritto {args.out}")


if __name__ == "__main__":
    main()
