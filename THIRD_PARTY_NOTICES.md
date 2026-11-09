# Bibliothèques incluses

Le dossier `extension/lib/` contient des copies non modifiées des bibliothèques suivantes :

| Fichier | Bibliothèque | Licence |
|---|---|---|
| `transformers.min.js` | Transformers.js 3.8.1 — Hugging Face | Apache-2.0 |
| `ort-wasm-simd-threaded.jsep.*` | ONNX Runtime Web — Microsoft | MIT |
| `jszip.min.js` | JSZip 3.10.1 — Stuart Knightley | MIT ou GPL-3.0 (au choix ; utilisée ici sous MIT) |
| `jspdf.umd.min.js` | jsPDF 2 — James Hall, yWorks | MIT |

Les modèles de transcription (`Xenova/whisper-base.en`, `Xenova/whisper-small.en`) ne sont pas inclus. Ils sont téléchargés depuis Hugging Face au premier usage. Whisper est publié par OpenAI sous licence MIT.
