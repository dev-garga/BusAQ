#!/usr/bin/env python3
"""Genera le icone della PWA.

    tools/.venv/bin/python tools/make_icon.py

Soggetto: due fermate unite da una linea di percorso, in stile mappa — neutro
rispetto ai numeri di linea, che AMA riorganizza di frequente.

Vincoli iOS, motivo per cui l'icona e' fatta cosi':
  * full-bleed, senza angoli arrotondati incorporati: la maschera "squircle"
    la applica iOS, e un riquadro gia' arrotondato verrebbe mascherato due volte;
  * nessun canale alpha: il trasparente diventa nero sulla schermata Home;
  * grafica entro ~80% del lato, perche' la maschera taglia gli angoli.

Serve anche icon-180.png: iOS ignora le icone di manifest.json e usa solo
<link rel="apple-touch-icon">. Senza, mostra l'iniziale del titolo.
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
MASTER = 1024
SIZES = {"icon-180.png": 180, "icon-192.png": 192, "icon-512.png": 512}

TOP    = (74, 125, 251)    # blu acceso, come l'accento dell'app
BOTTOM = (18, 20, 46)      # indaco profondo
WARM   = (255, 142, 84)    # accento caldo, ripreso dalle luci ambientali


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def background(size):
    """Gradiente verticale + alone caldo in basso a destra."""
    img = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / (size - 1)
        d.line([(0, y), (size, y)], fill=lerp(TOP, BOTTOM, t ** 0.85))

    # L'alone si costruisce piccolo e poi si ingrandisce: per pixel a piena
    # risoluzione sarebbe inutilmente lento.
    n = 128
    glow = Image.new("L", (n, n), 0)
    gp = glow.load()
    cx, cy, r = n * 0.82, n * 0.88, n * 0.62
    for y in range(n):
        for x in range(n):
            dist = (((x - cx) ** 2 + (y - cy) ** 2) ** 0.5) / r
            gp[x, y] = max(0, round(255 * (1 - dist) ** 2)) if dist < 1 else 0
    glow = glow.resize((size, size), Image.LANCZOS)
    img.paste(Image.new("RGB", (size, size), WARM), (0, 0), glow)
    return img


def bezier(p0, p1, p2, p3, steps=400):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        x = u**3*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0]
        y = u**3*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1]
        pts.append((x, y))
    return pts


def dot(d, xy, r, fill):
    x, y = xy
    d.ellipse([x - r, y - r, x + r, y + r], fill=fill)


def build(size):
    img = background(size)
    d = ImageDraw.Draw(img)
    s = size / 1024.0

    # Percorso: dalla fermata in basso a sinistra a quella in alto a destra.
    a = (300 * s, 730 * s)
    b = (724 * s, 300 * s)
    path = bezier(a, (300 * s, 430 * s), (724 * s, 600 * s), b)

    # Tracciato disegnato come sequenza di dischi: da' estremi e curve morbidi.
    for x, y in path:
        dot(d, (x, y), 26 * s, (255, 255, 255, 255))

    # Fermate: anello bianco pieno con centro scavato sul colore del fondo.
    for centre in (a, b):
        px = max(0, min(size - 1, int(centre[0])))
        py = max(0, min(size - 1, int(centre[1])))
        dot(d, centre, 96 * s, (255, 255, 255))
        dot(d, centre, 58 * s, background(size).getpixel((px, py)))

    return img


def main():
    master = build(MASTER * 2)          # supersampling, poi riduzione
    for name, px in SIZES.items():
        out = master.resize((px, px), Image.LANCZOS).convert("RGB")
        path = ROOT / name
        out.save(path, "PNG", optimize=True)
        print(f"  {name:<16} {px}x{px}  {path.stat().st_size:>6} byte")


if __name__ == "__main__":
    main()
