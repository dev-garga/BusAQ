"""Legge la pagina «Elenco linee AMA» e dice dove sta, oggi, l'orario di ogni linea.

AMA pubblica un PDF per linea e a ogni revisione gli cambia nome: la data e' nel nome
del file (`Orario-1_28092026.pdf`). Un elenco di URL scritti a mano smette di funzionare
alla prima revisione senza che nessuno se ne accorga — ed e' esattamente cosi' che le
bozze di settembre sono rimaste in uso per due settimane dopo l'uscita degli orari
ufficiali. Le fonti si cercano quindi per etichetta della linea, non per indirizzo.

    from ama import elenco
    elenco()["1"]  ->  {"url": "...Orario-1_28092026.pdf", "aggiornata": "28 settembre 2026",
                        "sezione": "Feriale", "file": "Orario-1_28092026.pdf"}
"""
import html
import re
import urllib.request

PAGINA = "https://www.ama.laquila.it/linee-e-orari/elenco-linee-ama/"
AGENTE = {"User-Agent": "Mozilla/5.0 (BusAQ; orari personali)"}

BLOCCO = re.compile(r'<div id="post-\d+" class="card[^"]*"')
SEZIONE = re.compile(r"<h2>(.*?)</h2>", re.S)
ETICHETTA = re.compile(r'<h5 class="card-title linea[^"]*"[^>]*>(.*?)</h5>', re.S)
ORARI = re.compile(r'<a [^>]*href="([^"]+\.pdf)"[^>]*>\s*<strong>\s*Orari\s*</strong>', re.S | re.I)
AGGIORNATA = re.compile(r"Aggiornata al\s+([^<]+)", re.I)


def scarica(url, timeout=40):
    req = urllib.request.Request(url, headers=AGENTE)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def testo(frammento):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", frammento))).strip()


def elenco(sorgente=None):
    """Etichetta della linea -> {url, file, aggiornata, sezione}.

    Le linee senza un PDF «Orari» (solo mappa, o servizio a chiamata) non compaiono.
    """
    s = sorgente if sorgente is not None else scarica(PAGINA).decode("utf-8", "replace")

    inizi = [m.start() for m in BLOCCO.finditer(s)] + [len(s)]
    sezioni = [(m.start(), testo(m.group(1))) for m in SEZIONE.finditer(s)]

    out = {}
    for a, b in zip(inizi, inizi[1:]):
        blocco = s[a:b]
        et = ETICHETTA.search(blocco)
        orari = ORARI.search(blocco)
        if not et or not orari:
            continue
        etichetta = testo(et.group(1))
        sezione = next((nome for pos, nome in reversed(sezioni) if pos < a), "")
        agg = AGGIORNATA.search(blocco)
        voce = {
            "url": orari.group(1),
            "file": orari.group(1).rsplit("/", 1)[-1],
            "aggiornata": agg.group(1).strip() if agg else "",
            "sezione": sezione,
        }
        # Un'etichetta ripetuta in due sezioni (feriale e festivo) non deve sovrascrivere
        # la prima in silenzio: la seconda si distingue con il nome della sezione.
        chiave = etichetta if etichetta not in out else f"{etichetta}@{sezione}"
        out[chiave] = voce
    return out


if __name__ == "__main__":
    for etichetta, v in elenco().items():
        print(f"{etichetta:<28} {v['sezione']:<9} {v['aggiornata']:<20} {v['file']}")
