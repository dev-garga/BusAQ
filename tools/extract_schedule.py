#!/usr/bin/env python3
"""Genera schedule.json dai PDF orari AMA secondo la mappatura in lines.json.

    tools/.venv/bin/python tools/extract_schedule.py            # scrive schedule.json
    tools/.venv/bin/python tools/extract_schedule.py --dry-run  # stampa solo il report
    tools/.venv/bin/python tools/extract_schedule.py --download # riscarica i PDF

Modello: una voce per DIREZIONE (un senso di marcia su un pannello di PDF) con l'elenco
ordinato delle fermate, e una riga per CORSA con gli orari allineati a quell'elenco.
Le coppie origine->destinazione le ricava l'app dall'ordine, quindi aggiungere una
fermata costa una colonna invece di N rotte.
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

# Gli orari AMA usano punto, due punti o virgola: la linea 15 scrive "7,05".
TIME_RE = re.compile(r"\b(\d{1,2})[.:,](\d{2})\b")


def unrotate(cell):
    """Le intestazioni verticali tornano col testo rovesciato ('sublanimret')."""
    if not cell:
        return ""
    return " ".join(p[::-1] for p in cell.split("\n") if p.strip()).strip()


def parse_time(cell):
    """Estrae HH:MM solo se la cella contiene *soltanto* un orario.

    Diciture come 'da via Ficara (12.15)' o 'stazione (7.35)' segnalano corse che
    partono altrove: accettarle darebbe partenze da fermate mai servite.
    """
    if not cell:
        return None
    txt = cell.replace("\n", " ").strip()
    if any(ch.isalpha() for ch in txt):
        return None
    m = TIME_RE.search(txt)
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2))
    return f"{h:02d}:{mi:02d}" if h < 24 and mi < 60 else None


def norm_time(text):
    m = TIME_RE.search(text or "")
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2))
    return f"{h:02d}:{mi:02d}" if h < 24 and mi < 60 else None


def header_row(table):
    upto = min(8, len(table))
    return max(range(upto), key=lambda i: sum(1 for c in table[i] if c and c.strip()))


def is_grey(color):
    """Grigio ~0.749 usato da AMA per le corse del solo lunedi'-venerdi'."""
    if not isinstance(color, (list, tuple)):
        return False
    if len(color) == 1:
        return 0.70 < color[0] < 0.80
    if len(color) >= 3:
        r, g, b = color[0], color[1], color[2]
        return max(r, g, b) - min(r, g, b) < 0.04 and 0.70 < (r + g + b) / 3 < 0.80
    return False


def grey_bands(page):
    """Insiemi di orari coperti da ciascuna fascia grigia.

    Si usa la geometria delle parole e non le righe di find_tables(), che sono
    disallineate rispetto ai rettangoli.
    """
    rects = [r for r in page.rects
             if is_grey(r.get("non_stroking_color")) and (r["x1"] - r["x0"]) > 0.40 * page.width]
    if not rects:
        return []
    words = [w for w in page.extract_words() if TIME_RE.fullmatch(w["text"].strip())]
    bands = []
    for r in rects:
        times = {norm_time(w["text"]) for w in words
                 if r["top"] - 1 <= w["top"] <= r["bottom"] + 1}
        times.discard(None)
        if times:
            bands.append(times)
    return bands


def read_codes(row, note_col):
    """Lettere isolate nella colonna note; 'BS' vale B e S insieme."""
    if note_col is None or note_col >= len(row) or not row[note_col]:
        return ""
    raw = row[note_col].replace("\n", " ").strip()
    if len(raw) > 4:
        return ""                      # intestazione o testo, non un codice
    return "".join(ch for ch in raw if ch.isalpha() and ch.isupper())


def apply_codes(codes, legend, default_days):
    """Traduce le lettere in calendario, segnalando quelle fuori legenda."""
    days, scolastica, explicit, unknown = list(default_days), None, None, []
    for ch in codes:
        rule = legend.get(ch)
        if rule is None:
            # Convenzione rispettata da ogni legenda AMA vista: S scolastica,
            # N non scolastica, ogni altra lettera e' variante di percorso.
            if ch == "S":
                scolastica = True
            elif ch == "N":
                scolastica = False
            else:
                unknown.append(ch)
            continue
        if "scolastica" in rule:
            scolastica = rule["scolastica"]
        if rule.get("no_saturday") and 6 in days:
            days.remove(6)
        if "days" in rule:
            explicit = rule["days"]
    if explicit is not None:
        days = list(explicit)
    return sorted(days), bool(scolastica), "".join(unknown)


def extract(cfg, download=False):
    if download:
        CACHE.mkdir(exist_ok=True)
        for src in cfg["sources"].values():
            print(f"  scarico {src['file']} …", file=sys.stderr)
            urllib.request.urlretrieve(src["url"], CACHE / src["file"])

    pdfs = {}
    for key, src in cfg["sources"].items():
        path = CACHE / src["file"]
        if not path.exists():
            sys.exit(f"manca {path} — rilanciare con --download")
        pdfs[key] = pdfplumber.open(path)

    default_days = cfg["default_days"]
    out, report = [], []

    for d in cfg["directions"]:
        page = pdfs[d["source"]].pages[d["page"] - 1]
        table = (page.extract_tables()[d["table_index"]]
                 if "table_index" in d else page.extract_table())
        if not table:
            report.append((d["id"], 0, 0, 0, 0, 0, "—", "—")); continue

        hi = header_row(table)
        bands = grey_bands(page) if d.get("grey") == "weekdays" else []
        order, cols = d["order"], d["columns"]
        legend = d.get("legend", {})
        runs = []

        for row in table[hi + 1:]:
            times = [parse_time(row[cols[s]]) if cols[s] < len(row) else None for s in order]
            if sum(t is not None for t in times) < 2:
                continue                       # una corsa serve almeno due fermate

            days, scolastica, unknown = apply_codes(
                read_codes(row, d.get("note_col")), legend, default_days)

            # Fascia grigia: la corsa e' evidenziata se vi cadono almeno due dei suoi orari.
            present = {t for t in times if t}
            if any(len(present & band) >= 2 for band in bands) and 6 in days:
                days.remove(6)

            run = {"t": times}
            if days != default_days:
                run["days"] = days
            if scolastica:
                run["scolastica"] = True
            if unknown:
                run["nota_ignota"] = unknown
            lc = d.get("line_col")
            if lc is not None and lc < len(row) and row[lc]:
                variant = row[lc].replace("\n", " ").strip().strip("/")
                if variant and variant.lower() != "linea" and len(variant) <= 6:
                    run["variant"] = variant
            runs.append(run)

        runs.sort(key=lambda r: next((x for x in r["t"] if x), "99:99"))

        entry = {"id": d["id"], "line": d["line"], "stops": order, "runs": runs}
        if d.get("side"):
            entry["side"] = d["side"]
        if d.get("approx"):
            entry["approx"] = d["approx"]
        out.append(entry)

        first = next((x for r in runs for x in r["t"] if x), "—")
        last = max((x for r in runs for x in r["t"] if x), default="—")
        report.append((d["id"], len(runs),
                       sum(1 for r in runs if 6 not in r.get("days", default_days)),
                       sum(1 for r in runs if r.get("scolastica")),
                       sum(1 for r in runs if r.get("nota_ignota")),
                       len(d.get("approx", {})), first, last))

    for p in pdfs.values():
        p.close()

    schedule = {
        "_meta": {
            "generated": date.today().isoformat(),
            "effective": cfg["effective"],
            "draft": cfg.get("draft", False),
            "default_days": default_days,
            "stops": cfg["stops"],
            "lines": cfg["lines"],
        },
        "directions": out,
    }
    return schedule, report


def print_report(report, schedule):
    print(f"\n{'direzione':<24} {'corse':>6} {'lun-ven':>8} {'scolast':>8} {'nota?':>6} {'appr':>5}  {'prima':>6} {'ultima':>7}")
    print("-" * 82)
    for row in report:
        did, n, wk, sc, unk, ap, first, last = row
        flag = "  ⚠ VUOTA" if n == 0 else ""
        print(f"{did:<24} {n:>6} {wk:>8} {sc:>8} {unk:>6} {ap:>5}  {first:>6} {last:>7}{flag}")
    print("-" * 82)
    print(f"{'TOTALE':<24} {sum(r[1] for r in report):>6}")

    unknown = Counter()
    for d in schedule["directions"]:
        for r in d["runs"]:
            if r.get("nota_ignota"):
                unknown[r["nota_ignota"]] += 1
    if unknown:
        print("\ncodici fuori legenda (corse mostrate ma segnalate):", dict(unknown))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--download", action="store_true")
    ap.add_argument("--out", default=str(ROOT.parent / "schedule.json"))
    args = ap.parse_args()

    cfg = json.loads((ROOT / "lines.json").read_text(encoding="utf-8"))
    schedule, report = extract(cfg, download=args.download)
    print_report(report, schedule)

    if args.dry_run:
        print("\n(dry-run: schedule.json non e' stato scritto)")
        return
    Path(args.out).write_text(json.dumps(schedule, ensure_ascii=False, separators=(",", ":")),
                              encoding="utf-8")
    kb = Path(args.out).stat().st_size / 1024
    print(f"\nscritto {args.out}  ({kb:.0f} KB)")

    # La verifica gira subito: un'estrazione sbagliata va vista adesso, non fra tre
    # settimane alla fermata. Non cancella il file — lo si vuole poter ispezionare —
    # ma il codice di uscita impedisce di proseguire senza accorgersene.
    verifica = ROOT / "verifica.py"
    if verifica.exists():
        import subprocess
        rel = Path(args.out).resolve().relative_to(ROOT.parent)
        return subprocess.call([sys.executable, str(verifica), "--file", str(rel)])
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
