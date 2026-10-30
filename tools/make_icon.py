#!/usr/bin/env python3
"""Genera il logo di Bus AQ: icone PWA, favicon SVG e il segno per l'intestazione.

    python3 tools/make_icon.py

Soggetto: la tabella a LED della fermata. «AQ» in punti ambra, 5x7 per lettera, su
pannello nero e campo arancione AMA. E' lo stesso alfabeto di punti con cui l'app
disegna il conto alla rovescia (app.js), cosi' logo e interfaccia parlano la stessa
lingua. Le lettere sono dati qui sotto, non un tipo di carattere: scalano senza
perdere i punti e non dipendono da nessun font.

Vincoli iOS, motivo per cui le icone sono fatte cosi':
  * full-bleed, senza angoli arrotondati incorporati: la maschera "squircle"
    la applica iOS, e un riquadro gia' arrotondato verrebbe mascherato due volte;
  * nessun canale alpha: il trasparente diventa nero sulla schermata Home;
  * grafica entro ~80% del lato, perche' la maschera taglia gli angoli.

Serve anche icon-180.png: iOS ignora le icone di manifest.json e usa solo
<link rel="apple-touch-icon">. Senza, mostra l'iniziale del titolo.

Scrive: icon-180.png, icon-192.png, icon-512.png, logo.svg (favicon) e segno.svg
(il pannello a punti, senza campo, per l'intestazione).
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
MASTER = 1024
SIZES = {"icon-180.png": 180, "icon-192.png": 192, "icon-512.png": 512}

ARANCIO = (242, 140, 28)    # arancione AMA, campo
NERO = (13, 13, 13)         # lamiera del pannello
AMBRA = (255, 176, 0)       # LED

GLIFI = {
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
}
PAROLA = "AQ"


def punti():
    """Coordinate (colonna, riga) dei punti accesi, con una colonna vuota fra le lettere."""
    out, x0 = [], 0
    for ch in PAROLA:
        for r, riga in enumerate(GLIFI[ch]):
            out += [(x0 + c, r) for c, v in enumerate(riga) if v == "1"]
        x0 += 6
    return out, x0 - 1, 7          # punti, colonne, righe


def icona(lato=MASTER):
    pts, cols, righe = punti()
    img = Image.new("RGB", (lato, lato), ARANCIO)

    # Pannello: largo l'80% del lato, con il margine interno di un passo e mezzo.
    pw = lato * 0.80
    passo = pw / (cols + 3)
    ph = passo * (righe + 3)
    x0, y0 = (lato - pw) / 2, (lato - ph) / 2
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([x0, y0, x0 + pw, y0 + ph], radius=passo * 0.9, fill=NERO)

    # Alone dei LED su un livello a parte, poi i punti netti sopra.
    alone = Image.new("RGB", img.size, (0, 0, 0))
    da = ImageDraw.Draw(alone)
    r = passo * 0.36
    centri = [(x0 + passo * (1.5 + c), y0 + passo * (1.5 + rr)) for c, rr in pts]
    for cx, cy in centri:
        da.ellipse([cx - r * 1.5, cy - r * 1.5, cx + r * 1.5, cy + r * 1.5], fill=(150, 90, 0))
    alone = alone.filter(ImageFilter.GaussianBlur(passo * 0.28))
    pannello = Image.new("L", img.size, 0)
    ImageDraw.Draw(pannello).rounded_rectangle([x0, y0, x0 + pw, y0 + ph], radius=passo * 0.9, fill=255)
    img.paste(Image.blend(img, Image.composite(alone, img, pannello), 1.0), (0, 0), pannello)
    d = ImageDraw.Draw(img)
    # Punti spenti appena visibili: sono cio' che fa leggere «matrice» invece di «lettere».
    for c in range(cols):
        for rr in range(righe):
            if (c, rr) not in pts:
                cx, cy = x0 + passo * (1.5 + c), y0 + passo * (1.5 + rr)
                d.ellipse([cx - r * .55, cy - r * .55, cx + r * .55, cy + r * .55], fill=(38, 30, 14))
    for cx, cy in centri:
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=AMBRA)
    return img


def svg(con_campo=False):
    """Segno vettoriale: pannello nero con i punti. Con campo arancione per la favicon."""
    pts, cols, righe = punti()
    p = 1.0
    w, h = (cols + 3) * p, (righe + 3) * p
    corpo = []
    for c in range(cols):
        for rr in range(righe):
            on = (c, rr) in pts
            corpo.append(f'<circle cx="{(1.5 + c) * p:.2f}" cy="{(1.5 + rr) * p:.2f}" '
                         f'r="{0.36 * p if on else 0.2 * p:.2f}" '
                         f'fill="{"#ffb000" if on else "#261e0e"}"/>')
    pannello = f'<rect width="{w:.0f}" height="{h:.0f}" rx="0.9" fill="#0d0d0d"/>' + "".join(corpo)
    if not con_campo:
        return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}">{pannello}</svg>'
    lato = w / 0.8
    off_x, off_y = (lato - w) / 2, (lato - h) / 2
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {lato:.2f} {lato:.2f}">'
            f'<rect width="{lato:.2f}" height="{lato:.2f}" rx="{lato * 0.22:.2f}" fill="#f28c1c"/>'
            f'<g transform="translate({off_x:.2f} {off_y:.2f})">{pannello}</g></svg>')


def main():
    master = icona()
    for nome, lato in SIZES.items():
        master.resize((lato, lato), Image.LANCZOS).save(ROOT / nome, optimize=True)
        print("scritto", nome)
    (ROOT / "logo.svg").write_text(svg(con_campo=True), encoding="utf-8")
    print("scritto logo.svg")
    (ROOT / "segno.svg").write_text(svg(), encoding="utf-8")
    print("scritto segno.svg")


if __name__ == "__main__":
    main()
