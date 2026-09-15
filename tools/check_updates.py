#!/usr/bin/env python3
"""Controlla se AMA ha ripubblicato i PDF degli orari.

    tools/.venv/bin/python tools/check_updates.py

Gli orari attuali sono BOZZE (Rev 1) allegate al comunicato: le versioni
definitive compariranno nella sezione "Linee e orari" del sito. Questo script
confronta la data di modifica remota con quella registrata in pdf_state.json
e segnala cosa e' cambiato, cosi' non serve ricontrollare a mano.

Quando segnala una modifica:
    tools/.venv/bin/python tools/extract_schedule.py --download
e poi si rilegge il report prima di pubblicare.
"""
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STATE = ROOT / "pdf_state.json"


def remote_info(url):
    req = urllib.request.Request(url, method="HEAD")
    with urllib.request.urlopen(req, timeout=30) as r:
        return {
            "last_modified": r.headers.get("Last-Modified", ""),
            "length": r.headers.get("Content-Length", ""),
        }


def main():
    cfg = json.loads((ROOT / "lines.json").read_text(encoding="utf-8"))
    old = json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else {}

    new, changed = {}, []
    for key, src in cfg["sources"].items():
        try:
            info = remote_info(src["url"])
        except Exception as e:
            print(f"  {src['file']}: errore — {e}")
            new[key] = old.get(key, {})
            continue
        new[key] = info
        was = old.get(key)
        if was is None:
            print(f"  {src['file']}: primo rilevamento — {info['last_modified']}")
        elif was.get("last_modified") != info["last_modified"]:
            print(f"  {src['file']}: MODIFICATO")
            print(f"      prima : {was.get('last_modified')}  ({was.get('length')} byte)")
            print(f"      adesso: {info['last_modified']}  ({info['length']} byte)")
            changed.append(src["file"])
        else:
            print(f"  {src['file']}: invariato — {info['last_modified']}")

    STATE.write_text(json.dumps(new, indent=1), encoding="utf-8")

    if changed:
        print("\nPDF aggiornati da AMA. Rigenerare gli orari con:")
        print("    tools/.venv/bin/python tools/extract_schedule.py --download")
        return 1
    if cfg.get("draft"):
        print("\nNota: gli orari in uso sono ancora BOZZE (Rev 1).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
