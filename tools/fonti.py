"""Da quale file PDF viene ogni direzione di schedule.json (solo libreria standard).

Serve a verifica.py e a controlla_campioni.py per sapere se i campioni letti su una
revisione valgono ancora: valgono solo finche' il file e' lo stesso.
"""
import json
from pathlib import Path


def fonti_correnti(radice):
    """id direzione -> nome del PDF in uso (lines.json + manuali.json + pdf_state.json)."""
    tools = Path(radice) / "tools"
    stato = json.loads((tools / "pdf_state.json").read_text(encoding="utf-8"))
    direzioni = json.loads((tools / "lines.json").read_text(encoding="utf-8"))["directions"]
    manuali = tools / "manuali.json"
    if manuali.exists():
        direzioni = direzioni + json.loads(manuali.read_text(encoding="utf-8"))["directions"]
    return {d["id"]: stato.get(d["source"], {}).get("file") for d in direzioni}
