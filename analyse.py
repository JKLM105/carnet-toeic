#!/usr/bin/env python3
"""
Carnet TOEIC — secours / transcription plus précise.

À utiliser seulement si la transcription dans l'extension a échoué,
ou si vous voulez une transcription plus fidèle (modèle plus gros).
Prend l'archive exportée par l'extension, retranscrit l'audio en local
et reconstruit le dossier .md (même format que l'extension).

Prérequis : pip3 install faster-whisper   et   Node.js installé (commande node)

Usage :
    python3 analyse.py ~/Downloads/carnet-toeic-XXXX/carnet-toeic-XXXX-archive.zip
    python3 analyse.py ARCHIVE.zip --modele large-v3     (défaut : medium.en)
"""
import argparse, json, shutil, subprocess, sys, zipfile
from pathlib import Path

ICI = Path(__file__).resolve().parent
DOSSIER_JS = ICI / "extension" / "dossier.js"


def transcrire(audio, modele):
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        sys.exit("Installez d'abord : pip3 install faster-whisper")
    print(f"Transcription avec Whisper ({modele}) — 10 à 30 min…")
    model = WhisperModel(modele, device="auto", compute_type="int8")
    segs, _ = model.transcribe(str(audio), language="en", vad_filter=True, condition_on_previous_text=False)
    out = []
    for s in segs:
        out.append({"debut": round(s.start, 1), "fin": round(s.end, 1), "texte": s.text.strip()})
        print(f"  [{int(s.start)//60:02d}:{int(s.start)%60:02d}] {s.text.strip()[:90]}")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("archive")
    ap.add_argument("--modele", default="medium.en")
    a = ap.parse_args()
    if not shutil.which("node"):
        sys.exit("Node.js est nécessaire (https://nodejs.org) pour construire le dossier.")

    zp = Path(a.archive).expanduser()
    out = zp.with_suffix("")
    out.mkdir(exist_ok=True)
    with zipfile.ZipFile(zp) as z:
        z.extractall(out)

    segments = transcrire(out / "audio.webm", a.modele)
    (out / "transcription.json").write_text(json.dumps(segments, ensure_ascii=False, indent=1), encoding="utf-8")

    js = (
        "const D=require(process.argv[1]);const fs=require('fs');"
        "const s=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));"
        "const t=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));"
        "const r=D.construire(s,t);fs.writeFileSync(process.argv[4],r.md);"
        "console.log(JSON.stringify(r.photos));"
    )
    res = subprocess.run(["node", "-e", js, str(DOSSIER_JS), str(out / "session.json"),
                          str(out / "transcription.json"), str(out / "dossier.md")],
                         capture_output=True, text=True, check=True)
    photos = json.loads(res.stdout or "[]")
    print(f"\n✔ Dossier : {out / 'dossier.md'}")
    if photos:
        print("Photos de la partie 1 à joindre (dans l'ordre des pages citées) :")
        for i, p in enumerate(photos, 1):
            print(f"  page {i} : {out / p['image']}")


if __name__ == "__main__":
    main()
