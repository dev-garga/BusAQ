#!/usr/bin/env python3
"""Genera schedule.json dai PDF ufficiali AMA secondo la mappatura in lines.json.

    tools/.venv/bin/python tools/extract_schedule.py --download  # scarica le revisioni correnti
    tools/.venv/bin/python tools/extract_schedule.py             # scrive schedule.json
    tools/.venv/bin/python tools/extract_schedule.py --dry-run   # stampa solo il report

Modello: una voce per DIREZIONE (un senso di marcia su un pannello di PDF) con l'elenco
ordinato delle fermate, e una riga per CORSA con gli orari allineati a quell'elenco.
Le coppie origine->destinazione le ricava l'app dall'ordine, quindi aggiungere una
fermata costa una colonna invece di N rotte.

Le colonne si cercano PER NOME, leggendo le intestazioni ruotate dalla geometria delle
parole: AMA rivede gli orari spesso, e una colonna aggiunta farebbe scivolare tutti gli
orari sulla fermata sbagliata senza alcun errore visibile. Con i nomi, una colonna che
non si trova piu' ferma l'estrazione e dice quale.
"""
import argparse
import json
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / "pdfcache"
STATO = ROOT / "pdf_state.json"
MANUALI = ROOT / "manuali.json"

# Gli orari AMA usano punto, due punti o virgola: la linea 15 scriveva "7,05".
TIME_RE = re.compile(r"\b(\d{1,2})[.:,](\d{2})\b")
MESI = {m: i for i, m in enumerate(
    ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio",
     "agosto", "settembre", "ottobre", "novembre", "dicembre"], 1)}
FERIALI = [1, 2, 3, 4, 5]


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


def data_iso(testo):
    """'28 settembre 2026' -> '2026-09-28'; None se non si riconosce."""
    m = re.match(r"\s*(\d{1,2})\s+([a-z]+)\s+(\d{4})", (testo or "").lower())
    if not m or m.group(2) not in MESI:
        return None
    return f"{m.group(3)}-{MESI[m.group(2)]:02d}-{int(m.group(1)):02d}"


# ── Pulizia della pagina ──────────────────────

def bianco(colore):
    return isinstance(colore, (list, tuple)) and len(colore) >= 1 and all(c > 0.95 for c in colore)


def pagina_pulita(page):
    """Toglie i caratteri sovrapposti e gli orari scritti in bianco.

    Il finto grassetto di alcuni PDF disegna ogni carattere due o tre volte nello
    stesso punto: le celle escono come '1122..1100' e il parser le scarta in silenzio.
    La M14F ha poi un '06.00' bianco su bianco nella colonna del Terminal, che
    stampato non si vede e diventerebbe una partenza inesistente. Si tolgono solo le
    cifre bianche: un'intestazione in bianco su sfondo scuro e' legittima.
    """
    # Senza 'size' fra gli attributi da confrontare: le due copie di un carattere
    # differiscono alla quattordicesima cifra decimale (9.442799999999977 contro
    # 9.442800000000005), e il confronto esatto le lasciava entrambe.
    return page.dedupe_chars(tolerance=1, extra_attrs=("fontname",)).filter(
        lambda o: not (o.get("object_type") == "char" and o.get("text", "") in "0123456789.:,"
                       and bianco(o.get("non_stroking_color"))))


def is_grey(color):
    """Grigio usato da AMA per le corse con un calendario ridotto.

    Non e' sempre lo stesso: 0.749 sulla 1 e sulla 3, 0.851 sul blocco pomeridiano della
    2U. Un rettangolo grigio che non contiene orari (intestazioni, riquadri della
    legenda) non produce fasce, quindi una soglia larga non crea falsi positivi.
    """
    if not isinstance(color, (list, tuple)):
        return False
    if len(color) == 1:
        return 0.70 < color[0] < 0.90
    if len(color) >= 3:
        r, g, b = color[0], color[1], color[2]
        return max(r, g, b) - min(r, g, b) < 0.04 and 0.70 < (r + g + b) / 3 < 0.90
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


# ── Colonne per nome ──────────────────────────

def inizio_dati(righe):
    """Prima riga con almeno due orari: tutto cio' che sta sopra e' intestazione.

    Prima si cercava la riga "piu' piena", che nei PDF ufficiali e' spesso una riga
    di orari: l'estrazione partiva dalla riga dopo e perdeva le prime corse.
    """
    return next((i for i, r in enumerate(righe) if sum(bool(parse_time(c)) for c in r) >= 2),
                len(righe))


def ruotate(page):
    return [w for w in page.extract_words() if not w.get("upright", True)]


def sezioni(page, tab, righe):
    """Blocchi di righe di dati separati da una nuova intestazione ruotata.

    Una stessa tabella puo' contenere andata e ritorno uno sotto l'altro, ciascuno con
    le sue colonne (la 2UF): pdfplumber la vede come una tabella sola e leggerebbe il
    ritorno con i nomi dell'andata, trasformando L'Aquilone 08:30 -> Terminal 08:55 in
    un Terminal 08:30 -> L'Aquilone 08:55 perfettamente plausibile. Il confine fra due
    sezioni e' una parola ruotata fra due righe di dati consecutive.
    """
    dati = [i for i, r in enumerate(righe) if sum(bool(parse_time(c)) for c in r) >= 2]
    if not dati:
        return []
    parole = ruotate(page)
    out, inizio = [], dati[0]
    for a, b in zip(dati, dati[1:]):
        y0, y1 = tab.rows[a].bbox[3], tab.rows[b].bbox[1]
        if any(y0 - 1 <= w["top"] and w["bottom"] <= y1 + 1 for w in parole):
            out.append((inizio, a + 1))
            inizio = b
    out.append((inizio, dati[-1] + 1))
    return out


def nomi_colonne(page, tab, inizio, y_da=None):
    """Nome di ogni colonna, dalle parole ruotate sopra la prima riga di dati.

    Solo parole ruotate: le fermate sono scritte in verticale, mentre titolo e
    itinerario stampati sopra la tabella sono orizzontali e la sporcherebbero. I
    confini di ogni colonna sono quelli piu' frequenti fra le celle di dati: le celle
    unite su piu' colonne (le corse "stazione 06.10") sono l'eccezione.
    """
    ncol = max(len(r.cells) for r in tab.rows)
    confini = []
    for k in range(ncol):
        cc = [r.cells[k] for r in tab.rows[inizio:] if k < len(r.cells) and r.cells[k]]
        if cc:
            (x0, x1), _ = Counter((round(c[0], 1), round(c[2], 1)) for c in cc).most_common(1)[0]
            confini.append((x0, x1))
        else:
            confini.append(None)

    y_da = tab.bbox[1] - 40 if y_da is None else y_da
    y_dati = tab.rows[inizio].bbox[1] if inizio < len(tab.rows) else tab.bbox[3]
    parole = [w for w in ruotate(page) if w["top"] >= y_da and w["bottom"] <= y_dati + 1]
    nomi = [[] for _ in confini]
    for w in parole:
        cx = (w["x0"] + w["x1"]) / 2
        for k, c in enumerate(confini):
            if c and c[0] <= cx <= c[1]:
                # Testo ruotato: ogni riga si legge dal basso verso l'alto, e le righe
                # successive stanno piu' a destra. Ordinando dall'alto, "viale gran sasso"
                # diventava "sasso gran viale".
                nomi[k].append(((round(w["x0"] / 4), -w["top"]), w["text"][::-1]))
                break
    return [" ".join(t for _, t in sorted(n)).lower() for n in nomi]


def colonna(spec, nomi, dove, facoltativa=False):
    """'regex' o 'regex@n' -> indice della n-esima colonna il cui nome corrisponde.

    Un numero resta un indice: serve solo dove le intestazioni non sono leggibili.
    """
    if spec is None:
        return None
    if isinstance(spec, int):
        return spec
    modello, _, n = spec.partition("@")
    n = int(n or 1)
    trovate = [i for i, nome in enumerate(nomi) if nome and re.search(modello, nome, re.I)]
    if len(trovate) >= n:
        return trovate[n - 1]
    if facoltativa:
        return None
    elenco = " | ".join(f"{i}:{x}" for i, x in enumerate(nomi) if x)
    sys.exit(f"\n{dove}: nessuna colonna «{spec}» (ne trovo {len(trovate)}).\n"
             f"Colonne lette: {elenco}\n"
             "AMA ha probabilmente cambiato l'impaginazione: aggiornare lines.json.")


def togli_spuri(tempi, riga, nomi):
    """Stesso orario a due fermate diverse con solo trattini in mezzo: il primo e' spurio.

    La linea 1 stampa 07:00 sia a L'Aquilone sia a Finanza, con Optimes e Reiss Romoli
    saltate: impossibile, ci vogliono 4-5 minuti. Si scarta il primo. Se le due colonne
    sono la stessa fermata attraversata due volte (Prata Peschiolo nel giro della 12)
    l'orario uguale e' legittimo e resta.
    """
    parole = lambda i: frozenset(re.findall(r"[a-zà-ù]+", nomi[i])) if i < len(nomi) else frozenset()
    tolti = 0
    for i, a in enumerate(tempi):
        if not a:
            continue
        j = next((k for k in range(i + 1, len(tempi)) if tempi[k]), None)
        if (j is not None and j > i + 1 and tempi[j] == a
                and all((riga[k] or "").strip() in ("", "-") for k in range(i + 1, j))
                and parole(i) != parole(j)):
            tempi[i] = None
            tolti += 1
    return tolti


# ── Note e calendario ─────────────────────────

def read_codes(row, note_col):
    """Lettere isolate nella colonna note; 'BS' vale B e S insieme."""
    if note_col is None or note_col >= len(row) or not row[note_col]:
        return ""
    raw = row[note_col].replace("\n", " ").strip()
    if len(raw) > 4:
        return ""                      # intestazione o testo, non un codice
    return "".join(ch for ch in raw if ch.isalpha() and ch.isupper())


def applica_regola(regola, days, scolastica, vacanze):
    if regola.get("no_saturday") and 6 in days:
        days = [d for d in days if d != 6]
    if "days" in regola:
        days = [d for d in days if d in regola["days"]] or list(regola["days"])
    if regola.get("scolastica"):
        scolastica = True
    if regola.get("vacanze"):
        vacanze = True
    return days, scolastica, vacanze


def apply_codes(codes, legend, base_days):
    """Traduce le lettere in calendario, segnalando quelle fuori legenda.

    Convenzione rispettata da ogni legenda AMA vista: S = corsa scolastica, N = corsa
    che si effettua SOLO nei periodi non scolastici. Le bozze trattavano N come una
    corsa qualunque, e cosi' in pieno semestre comparivano corse che circolano solo
    durante le vacanze. Ogni altra lettera va dichiarata nella legenda della pagina.
    """
    days, scolastica, vacanze, unknown = list(base_days), False, False, []
    for ch in codes:
        regola = legend.get(ch)
        if regola is None:
            if ch == "S":
                scolastica = True
            elif ch == "N":
                vacanze = True
            else:
                unknown.append(ch)
            continue
        days, scolastica, vacanze = applica_regola(regola, days, scolastica, vacanze)
    return sorted(days), scolastica, vacanze, "".join(unknown)


def regola_grigio(valore):
    if not valore:
        return None
    if valore == "weekdays":
        return {"days": FERIALI}
    return valore


# ── Fonti ─────────────────────────────────────

def leggi_stato():
    return json.loads(STATO.read_text(encoding="utf-8")) if STATO.exists() else {}


def scarica_fonti(cfg):
    """Risolve ogni fonte sulla pagina AMA e scarica la revisione corrente."""
    from ama import elenco, scarica
    pagina = elenco()
    stato = leggi_stato()
    CACHE.mkdir(exist_ok=True)
    for chiave, src in cfg["sources"].items():
        v = pagina.get(src["etichetta"])
        if not v:
            sys.exit(f"la linea «{src['etichetta']}» non compare piu' sulla pagina AMA")
        f = CACHE / v["file"]
        if not f.exists():
            print(f"  scarico {v['file']} …", file=sys.stderr)
            f.write_bytes(scarica(v["url"]))
        stato[chiave] = {**stato.get(chiave, {}), "url": v["url"], "file": v["file"],
                         "aggiornata": v["aggiornata"]}
    # L'elenco completo delle etichette serve a check_updates.py per accorgersi delle
    # linee che compaiono o spariscono dalla pagina.
    stato["_pagina"] = sorted(pagina)
    STATO.write_text(json.dumps(stato, indent=1, ensure_ascii=False), encoding="utf-8")
    return stato


# ── Estrazione ────────────────────────────────

def extract(cfg, download=False):
    stato = scarica_fonti(cfg) if download else leggi_stato()

    pdfs = {}
    for chiave in cfg["sources"]:
        nome = stato.get(chiave, {}).get("file")
        if not nome or not (CACHE / nome).exists():
            sys.exit(f"manca il PDF della fonte «{chiave}» — rilanciare con --download")
        pdfs[chiave] = pdfplumber.open(CACHE / nome)

    default_days = cfg["default_days"]
    out, report = [], []

    for d in cfg["directions"]:
        fonte = stato[d["source"]]["file"]
        dove = f"{d['id']} ({fonte} p{d['page']} t{d.get('table', 0)})"
        page = pagina_pulita(pdfs[d["source"]].pages[d["page"] - 1])
        tab = page.find_tables()[d.get("table", 0)]
        righe = tab.extract()
        blocchi = sezioni(page, tab, righe)
        if len(blocchi) > 1 and "sezione" not in d:
            sys.exit(f"\n{dove}: la tabella contiene {len(blocchi)} sezioni con intestazioni "
                     "diverse (andata e ritorno uno sotto l'altro?). Indicare 'sezione' in lines.json.")
        n = d.get("sezione", 1)
        if not 1 <= n <= len(blocchi):
            sys.exit(f"\n{dove}: sezione {n} inesistente (ne trovo {len(blocchi)})")
        inizio, fine = blocchi[n - 1]
        y_da = tab.rows[blocchi[n - 2][1] - 1].bbox[3] if n > 1 else None
        nomi = nomi_colonne(page, tab, inizio, y_da)
        righe = righe[:fine]

        order = d["order"]
        cols = {s: colonna(d["columns"][s], nomi, dove) for s in order}
        note_col = colonna(d.get("note", r"^note$"), nomi, dove, facoltativa=True)
        line_col = colonna(d.get("linea", r"^linea$"), nomi, dove, facoltativa=True)

        grigio = regola_grigio(d.get("grey"))
        bands = grey_bands(page) if grigio else []
        legend = d.get("legend", {})
        base_days = d.get("giorni", default_days)
        runs, spuri = [], 0

        for row in righe[inizio:]:
            tutti = [parse_time(c) for c in row]
            spuri += togli_spuri(tutti, row, nomi)
            times = [tutti[cols[s]] if cols[s] < len(tutti) else None for s in order]
            if sum(t is not None for t in times) < 2:
                continue                       # una corsa serve almeno due fermate

            days, scolastica, vacanze, unknown = apply_codes(
                read_codes(row, note_col), legend, base_days)

            # Alcune righe dicono "corsa scolastica" in una cella invece che con una lettera.
            if any(c and re.search(r"corsa\s+scolastica", c, re.I) for c in row):
                scolastica = True

            # Fascia grigia: la corsa e' evidenziata se vi cadono almeno due dei suoi orari.
            present = {t for t in tutti if t}
            if grigio and any(len(present & band) >= 2 for band in bands):
                days, scolastica, vacanze = applica_regola(grigio, days, scolastica, vacanze)

            run = {"t": times}
            if days != default_days:
                run["days"] = days
            if scolastica:
                run["scolastica"] = True
            if vacanze:
                run["vacanze"] = True
            if unknown:
                run["nota_ignota"] = unknown
            if line_col is not None and line_col < len(row) and row[line_col]:
                variant = row[line_col].replace("\n", " ").strip().strip("/")
                if variant and variant.lower() != "linea" and len(variant) <= 6:
                    run["variant"] = variant
            runs.append(run)

        runs.sort(key=lambda r: next((x for x in r["t"] if x), "99:99"))
        entry = {"id": d["id"], "line": d["line"], "stops": order, "runs": runs}
        for k in ("side", "approx"):
            if d.get(k):
                entry[k] = d[k]
        out.append(entry)
        report.append(riga_report(d["id"], runs, default_days, len(d.get("approx", {})), spuri))

    for p in pdfs.values():
        p.close()

    # Trascrizioni a mano, per le tabelle che non si possono leggere in modo affidabile.
    if MANUALI.exists():
        for m in json.loads(MANUALI.read_text(encoding="utf-8"))["directions"]:
            entry = {k: m[k] for k in ("id", "line", "stops", "runs", "side", "approx") if k in m}
            out.append(entry)
            report.append(riga_report(m["id"] + " (a mano)", m["runs"], default_days,
                                      len(m.get("approx", {})), 0))

    aggiornate = [data_iso(stato.get(k, {}).get("aggiornata")) for k in cfg["sources"]]
    schedule = {
        "_meta": {
            "generated": date.today().isoformat(),
            "effective": cfg["effective"],
            "aggiornato": max((a for a in aggiornate if a), default=None),
            "draft": cfg.get("draft", False),
            "default_days": default_days,
            "stops": cfg["stops"],
            "lines": cfg["lines"],
        },
        "directions": out,
    }
    return schedule, report


def riga_report(did, runs, default_days, approx, spuri):
    giorni = lambda r: r.get("days", default_days)
    tempi = [x for r in runs for x in r["t"] if x]
    return {
        "id": did, "corse": len(runs),
        "feriali": sum(1 for r in runs if 6 not in giorni(r) and 0 not in giorni(r)),
        "festive": sum(1 for r in runs if giorni(r) == [0]),
        "scolast": sum(1 for r in runs if r.get("scolastica")),
        "vacanze": sum(1 for r in runs if r.get("vacanze")),
        "nota": sum(1 for r in runs if r.get("nota_ignota")),
        "appr": approx, "spuri": spuri,
        "prima": min(tempi, default="—"), "ultima": max(tempi, default="—"),
    }


def print_report(report, schedule):
    testa = f"{'direzione':<26} {'corse':>5} {'lun-ven':>7} {'fest':>4} {'scol':>4} {'vac':>4} {'nota?':>5} {'appr':>4} {'spuri':>5}  {'prima':>5} {'ultima':>6}"
    print("\n" + testa)
    print("-" * len(testa))
    for r in report:
        flag = "  ⚠ VUOTA" if r["corse"] == 0 else ""
        print(f"{r['id']:<26} {r['corse']:>5} {r['feriali']:>7} {r['festive']:>4} {r['scolast']:>4} "
              f"{r['vacanze']:>4} {r['nota']:>5} {r['appr']:>4} {r['spuri']:>5}  {r['prima']:>5} {r['ultima']:>6}{flag}")
    print("-" * len(testa))
    print(f"{'TOTALE':<26} {sum(r['corse'] for r in report):>5}")

    unknown = Counter(r["nota_ignota"] for d in schedule["directions"] for r in d["runs"]
                      if r.get("nota_ignota"))
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
        return 0
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
