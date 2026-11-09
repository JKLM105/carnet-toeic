# Carnet TOEIC

[🇫🇷 Français](README.md) · 🇬🇧 English

A Chrome extension that helps you **understand your mistakes** during online TOEIC practice exercises and mock tests.

While you work through an exercise, the extension quietly records:
- the tab's **audio** (listening parts);
- the **text** of each question, plus **screenshots** (for the Part 1 photos);
- **your answers**, your **answer changes** and your **hesitations** (hovering over another option for a long time);
- the **correct answer**, when the website shows it.

When you finish, it **transcribes the audio** in the browser and produces **a single file** to give to an AI (Claude, Gemini, ChatGPT…). The instructions for the AI are already written inside. The AI returns a report **organised by type of mistake**: the rule, why you got it wrong, similar traps, the right reflex, 10 practice questions per type, and the answer keys at the end of the document.

> Designed and tested on **EstudyMe** (estudyme.com). On other websites the extension runs in generic mode, and answer detection is less reliable.

> Note: the report and the AI instructions are written in **French**. You can ask the AI to answer in English.

---

## Installation (once, 2 minutes)

1. On this GitHub page: green **Code** button → **Download ZIP**, then unzip it.
2. In **Chrome**, open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** → select the `extension` folder.
5. Pin the "Carnet TOEIC" icon (puzzle icon 🧩 to the right of the address bar).

⚠️ **Chrome only** (or Edge, Brave). Safari and Firefox do not allow an extension to record a tab's audio.

## How to use it

1. Open the exercise or mock test in Chrome.
2. Carnet TOEIC icon → **Démarrer sur cet onglet** (Start on this tab), *before* you begin.
3. Do the exercise as usual. You can still hear the audio, and nothing is displayed. Keep the tab in the foreground.
4. When you finish (ideally on the results page): **Arrêter et analyser** (Stop and analyse).
5. The archive is saved right away. A "Transcription" tab then opens and transcribes the audio. Keep "Rapide" (Fast) selected and leave graphics acceleration unchecked. The first time, the transcription model is downloaded (about 80 MB).

In **Downloads**, a `carnet-toeic-…` folder contains:

| File | What it is for |
|---|---|
| `…-dossier.md` | **Send it to the AI.** The whole exercise + the instructions |
| `…-photos-partie1.pdf` | **Send it too**, if it exists (Part 1 photos) |
| `…-archive.zip` | Raw data (audio, screenshots), keep it |
| `…-transcription.json` | The transcription only |

Then, in Claude, Gemini or ChatGPT: attach the `.md` (and the `.pdf`) and write "Follow the instructions in the file." Add "Answer in English." if you prefer.

### Corrected exercise or mock test?
The extension detects it automatically:
- **Corrected exercise** (the website shows the correct answer): the website's correction is the reference.
- **Mock test** (no correction): the AI solves the questions itself and states how certain it is.

## Good to know

- **Everything stays on your computer.** Nothing is sent anywhere, except the file you choose to give to an AI.
- Automatic transcription can get a word wrong. The AI is instructed to point it out.
- To re-transcribe an old recording: popup → **Page de transcription** (Transcription page), then drop the `…-archive.zip` file.
- More accurate transcription (optional, on Mac or PC with Python and Node.js):
  ```
  pip3 install faster-whisper
  python3 analyse.py path/to/…-archive.zip
  ```
- Practice tool only: it obviously cannot be used on the day of the official exam.
- Use it for your personal practice and in line with the practice website's terms of use.

## Common problems

- **Transcription stuck at 0%**: uncheck "Accélération graphique" (graphics acceleration), choose "Rapide" (Fast), start again.
- **The popup is stuck**: `chrome://extensions` → ⟳ button on Carnet TOEIC.
- **Answers "non captée" (not captured)**: the website may not be EstudyMe. Open an *issue* on GitHub with the website's name.

## Credits

Transcription: [Whisper](https://github.com/openai/whisper) via [Transformers.js](https://github.com/huggingface/transformers.js). See `THIRD_PARTY_NOTICES.md` for the bundled libraries.

License: MIT (see `LICENSE`).
