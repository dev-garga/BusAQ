#!/usr/bin/env python3
"""Ispeziona la struttura dei PDF orari AMA.

Serve a capire, per ogni pagina: quale linea contiene, com'e' fatta la tabella
e se ci sono righe evidenziate in grigio (= corse non effettuate il sabato).
I PDF AMA cambiano impaginazione ogni anno: questo script e' il punto di
partenza per riscrivere lines.json.

Uso:
    inspect_pdf.py <file.pdf>              panoramica di tutte le pagine
    inspect_pdf.py <file.pdf> <n>          dettaglio della pagina n (1-based)
"""
import sys
from collections import Counter

import pdfplumber

# I rettangoli grigi marcano le corse soppresse il sabato. Il valore esatto
# cambia da un PDF all'altro, quindi si riconosce un grigio come componenti
# RGB quasi uguali fra loro e in una fascia intermedia di luminosita'.
def is_grey(color):
    if not isinstance(color, (list, tuple)):
        return False
    if len(color) == 1:
        return 0.45 < color[0] < 0.95
    if len(color) >= 3:
        r, g, b = color[0], color[1], color[2]
        return max(r, g, b) - min(r, g, b) < 0.04 and 0.45 < (r + g + b) / 3 < 0.95
    return False


def grey_rects(page):
    """Rettangoli grigi larghi almeno il 40% della pagina: le righe evidenziate."""
    out = []
    for r in page.rects:
        if not is_grey(r.get("non_stroking_color")):
            continue
        if (r["x1"] - r["x0"]) < 0.40 * page.width:
            continue
        out.append(r)
    return out


def page_title(page):
    """Testo piu' grande della pagina: di solito il numero/sigla della linea."""
    words = page.extract_words(extra_attrs=["size"])
    if not words:
        return "", []
    biggest = max(w["size"] for w in words)
    big = [w["text"] for w in words if w["size"] > biggest - 0.5]
    return " ".join(big[:8]), words


def overview(path):
    with pdfplumber.open(path) as pdf:
        print(f"{path}  —  {len(pdf.pages)} pagine\n")
        print(f"{'pag':>4}  {'testo piu grande':<34} {'grigi':>5}  {'tabella':>12}")
        print("-" * 64)
        for i, page in enumerate(pdf.pages, 1):
            title, _ = page_title(page)
            greys = grey_rects(page)
            tbl = page.extract_table()
            shape = f"{len(tbl)}x{max((len(r) for r in tbl), default=0)}" if tbl else "—"
            print(f"{i:>4}  {title[:34]:<34} {len(greys):>5}  {shape:>12}")


def detail(path, pageno):
    with pdfplumber.open(path) as pdf:
        page = pdf.pages[pageno - 1]
        title, words = page_title(page)
        print(f"=== {path} pagina {pageno} ===")
        print(f"dimensioni : {page.width:.0f} x {page.height:.0f}")
        print(f"titolo     : {title}\n")

        greys = grey_rects(page)
        print(f"--- rettangoli grigi larghi: {len(greys)} ---")
        cols = Counter(tuple(round(c, 4) for c in r["non_stroking_color"]) for r in greys)
        for color, n in cols.items():
            print(f"    colore {color}  x{n}")
        for r in greys[:12]:
            print(f"    y {r['top']:7.1f}–{r['bottom']:7.1f}  x {r['x0']:6.1f}–{r['x1']:6.1f}")

        print("\n--- parole ruotate (upright=False) ---")
        rot = [w for w in page.extract_words(extra_attrs=["upright"]) if not w.get("upright", True)]
        print(f"    {len(rot)} parole ruotate", (": " + ", ".join(w['text'] for w in rot[:10])) if rot else "")

        tbl = page.extract_table()
        if not tbl:
            print("\n--- nessuna tabella rilevata ---")
            return
        print(f"\n--- tabella {len(tbl)}x{max(len(r) for r in tbl)} (prime 12 righe) ---")
        for ri, row in enumerate(tbl[:12]):
            cells = [(c or "").replace("\n", "/")[:16] for c in row]
            print(f"  r{ri:<2} " + " | ".join(f"{c:<16}" for c in cells))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    if len(sys.argv) == 2:
        overview(sys.argv[1])
    else:
        detail(sys.argv[1], int(sys.argv[2]))
