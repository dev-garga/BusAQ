#!/usr/bin/env python3
"""Collaudo delle regole di lettura dei PDF (tools/extract_schedule.py).

    python3 tools/prova_estrazione.py        (serve pdfplumber: tools/requirements.txt)

Sono le difese che sono costate una correzione ciascuna: ognuna qui ha il caso che l'ha
resa necessaria. Non leggono PDF: provano le funzioni sulle stringhe, quindi sono istantanee
e non dipendono da quale revisione AMA e' in cache.
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import extract_schedule as E  # noqa: E402

NOMI = ["note", "linea", "terminalbus", "via cencioni", "universita coppito",
        "l'aquilone", "terminalbus", "universita coppito"]


class Colonne(unittest.TestCase):
    def test_una_sola_corrispondenza(self):
        self.assertEqual(E.colonna("cencioni", NOMI, "x"), 3)

    def test_ambigua_senza_indice_si_ferma(self):
        # Il caso che l'identificazione per nome doveva evitare: due colonne "universita",
        # scegliere la prima in silenzio sposta gli orari sulla fermata sbagliata.
        with self.assertRaises(SystemExit) as r:
            E.colonna("universita", NOMI, "x")
        self.assertIn("ambigua", str(r.exception))
        self.assertIn("universita@1", str(r.exception))

    def test_indice_esplicito_sceglie(self):
        self.assertEqual(E.colonna("terminalbus@1", NOMI, "x"), 2)
        self.assertEqual(E.colonna("terminalbus@2", NOMI, "x"), 6)
        self.assertEqual(E.colonna("universita@2", NOMI, "x"), 7)

    def test_indice_oltre_le_occorrenze_si_ferma(self):
        with self.assertRaises(SystemExit):
            E.colonna("cencioni@2", NOMI, "x")

    def test_assente_obbligatoria_si_ferma(self):
        with self.assertRaises(SystemExit) as r:
            E.colonna("finanza", NOMI, "x")
        self.assertIn("nessuna colonna", str(r.exception))

    def test_assente_facoltativa_e_none(self):
        self.assertIsNone(E.colonna("finanza", NOMI, "x", facoltativa=True))

    def test_ambigua_facoltativa_si_ferma_comunque(self):
        # Una colonna "note" doppia (due pannelli affiancati) non e' "assente".
        with self.assertRaises(SystemExit):
            E.colonna("terminalbus", NOMI, "x", facoltativa=True)

    def test_numero_e_indice_di_colonna(self):
        self.assertEqual(E.colonna(5, NOMI, "x"), 5)
        self.assertIsNone(E.colonna(None, NOMI, "x"))


class Orari(unittest.TestCase):
    def test_formati(self):
        self.assertEqual(E.parse_time("07.05"), "07:05")
        self.assertEqual(E.parse_time("7,05"), "07:05")      # la 15 scriveva la virgola
        self.assertEqual(E.parse_time("7:05"), "07:05")

    def test_celle_con_testo_non_sono_partenze(self):
        self.assertIsNone(E.parse_time("da via Ficara (12.15)"))
        self.assertIsNone(E.parse_time("stazione (7.35)"))
        self.assertIsNone(E.parse_time("-"))
        self.assertIsNone(E.parse_time(""))

    def test_orari_impossibili(self):
        self.assertIsNone(E.parse_time("25.00"))
        self.assertIsNone(E.parse_time("07.75"))

    def test_data_italiana(self):
        self.assertEqual(E.data_iso("28 settembre 2026"), "2026-09-28")
        self.assertEqual(E.data_iso("01 ottobre 2026"), "2026-10-01")
        self.assertIsNone(E.data_iso("boh"))


class Note(unittest.TestCase):
    BASE = [1, 2, 3, 4, 5, 6]

    def test_S_scolastica_N_vacanze(self):
        _, scol, vac, _ = E.apply_codes("S", {}, self.BASE)
        self.assertTrue(scol and not vac)
        _, scol, vac, _ = E.apply_codes("N", {}, self.BASE)
        self.assertTrue(vac and not scol)

    def test_lettera_fuori_legenda_e_segnalata(self):
        _, _, _, ignote = E.apply_codes("SZ", {}, self.BASE)
        self.assertEqual(ignote, "Z")

    def test_la_legenda_della_pagina_vince(self):
        # Sulla 1 'A' = niente sabato; su altre pagine e' solo una variante di percorso.
        giorni, _, _, _ = E.apply_codes("A", {"A": {"no_saturday": True}}, self.BASE)
        self.assertNotIn(6, giorni)
        giorni, _, _, ignote = E.apply_codes("A", {"A": {}}, self.BASE)
        self.assertIn(6, giorni)
        self.assertEqual(ignote, "")


class Spuri(unittest.TestCase):
    NOMI = ["l'aquilone", "optimes", "reiss romoli", "finanza", "universita"]

    def test_stesso_orario_con_trattini_in_mezzo(self):
        # La linea 1 stampa 07:00 sia a L'Aquilone sia a Finanza: la corsa parte da Finanza.
        tempi = ["07:00", None, None, "07:00", "07:02"]
        riga = ["07:00", "-", "-", "07:00", "07:02"]
        tolti = E.togli_spuri(tempi, riga, self.NOMI)
        self.assertEqual(tolti, 1)
        self.assertIsNone(tempi[0])
        self.assertEqual(tempi[3], "07:00")

    def test_stessa_fermata_attraversata_due_volte_resta(self):
        # Prata Peschiolo nel giro della 12: stesso nome, stesso orario legittimo.
        nomi = ["peschiolo prata", "collefracido", "peschiolo prata"]
        tempi = ["07:25", None, "07:25"]
        self.assertEqual(E.togli_spuri(tempi, ["07:25", "-", "07:25"], nomi), 0)
        self.assertEqual(tempi, ["07:25", None, "07:25"])


class PaginaAma(unittest.TestCase):
    """tools/ama.py: la pagina «Elenco linee AMA» letta con espressioni regolari.

    Se AMA cambia il tema del sito queste smettono di trovare le linee: il controllo deve
    accorgersene (check_updates.py esce con 2), non dire che tutte le linee sono sparite.
    """

    BLOCCO = ('<h2>Feriale</h2><div id="post-{n}" class="card mb-3"><h5 class="card-title linea p-4" style="x">{et}</h5>'
              '<a data-type="application" href="https://www.ama.laquila.it/wp-content/uploads/{f}" class="card-link">'
              '<strong>Orari</strong></a><div class="card-footer"><small>Aggiornata al {d}</small></div></div>')

    def test_trova_linea_file_e_data(self):
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import ama
        html = self.BLOCCO.format(n=1, et="  1  ", f="2022/09/Orario-1_22102026.pdf", d="19 ottobre 2026")
        html += self.BLOCCO.format(n=2, et="2U", f="2022/10/orario2U_02112026.pdf", d="02 novembre 2026")
        e = ama.elenco(html)
        self.assertEqual(sorted(e), ["1", "2U"])
        self.assertEqual(e["1"]["file"], "Orario-1_22102026.pdf")
        self.assertEqual(e["1"]["aggiornata"], "19 ottobre 2026")
        self.assertEqual(e["2U"]["sezione"], "Feriale")

    def test_blocco_senza_pdf_si_salta(self):
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import ama
        html = '<div id="post-9" class="card"><h5 class="card-title linea">M12X</h5><small>Aggiornata al 8 settembre 2017</small></div>'
        self.assertEqual(ama.elenco(html), {})

    def test_pagina_cambiata_non_trova_niente(self):
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import ama
        self.assertEqual(ama.elenco("<html><body><h1>Nuovo tema</h1></body></html>"), {})


class DiffCorse(unittest.TestCase):
    """verifica.differenze_corse: cosa e' cambiato fra due estrazioni, corsa per corsa."""

    @staticmethod
    def sch(*runs, stops=("terminal", "uni")):
        return {"_meta": {"default_days": [1, 2, 3, 4, 5, 6],
                          "stops": {"terminal": {"short": "Collemaggio"}, "uni": {"short": "Coppito"}}},
                "directions": [{"id": "3:andata", "line": "linea3", "stops": list(stops), "runs": list(runs)}]}

    def setUp(self):
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import verifica
        self.d = verifica.differenze_corse

    def test_identiche_nessuna_differenza(self):
        a = self.sch({"t": ["07:00", "07:40"]})
        self.assertEqual(self.d(a, a), [])

    def test_corsa_tolta_e_aggiunta(self):
        v = self.sch({"t": ["07:00", "07:40"]}, {"t": ["08:00", "08:40"]})
        n = self.sch({"t": ["07:00", "07:40"]}, {"t": ["09:00", "09:40"]})
        (did, righe), = self.d(v, n)
        self.assertEqual(did, "3:andata")
        self.assertIn("- 08:00 Collemaggio → 08:40 Coppito", righe)
        self.assertIn("+ 09:00 Collemaggio → 09:40 Coppito", righe)
        self.assertEqual(len(righe), 2)

    def test_stessa_corsa_calendario_diverso_e_cambiata_non_tolta(self):
        v = self.sch({"t": ["07:00", "07:40"], "scolastica": True})
        n = self.sch({"t": ["07:00", "07:40"], "vacanze": True})
        (_, righe), = self.d(v, n)
        self.assertEqual(len(righe), 1)
        self.assertTrue(righe[0].startswith("~ 07:00"))
        self.assertIn("era: scolastica", righe[0])
        self.assertIn("solo vacanze", righe[0])

    def test_direzione_tolta_e_nuova(self):
        v = self.sch({"t": ["07:00", "07:40"]})
        n = {"_meta": v["_meta"], "directions": []}
        (_, righe), = self.d(v, n)
        self.assertTrue(righe[0].startswith("- direzione tolta"))
        (_, righe), = self.d(n, v)
        self.assertTrue(righe[0].startswith("+ direzione nuova"))

    def test_fermate_cambiate_si_segnalano(self):
        v = self.sch({"t": ["07:00", "07:40"]})
        n = self.sch({"t": ["07:00", "07:40"]}, stops=("uni", "terminal"))
        (_, righe), = self.d(v, n)
        self.assertTrue(righe[0].startswith("! fermate cambiate"))

    def test_corsa_festiva_si_riconosce(self):
        v = self.sch()
        n = self.sch({"t": ["09:00", "09:30"], "days": [0]})
        (_, righe), = self.d(v, n)
        self.assertIn("festiva", righe[0])


if __name__ == "__main__":
    unittest.main(verbosity=1)
