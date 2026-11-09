# Carnet TOEIC

🇫🇷 Français · [🇬🇧 English](README.en.md)

Une extension Chrome pour **comprendre ses erreurs** pendant les exercices et les tests blancs TOEIC en ligne.

Pendant que vous faites un exercice, l'extension enregistre discrètement :
- le **son** de l'onglet (parties d'écoute) ;
- le **texte** de chaque question et des **captures d'écran** (pour les photos de la partie 1) ;
- **vos réponses**, vos **changements de réponse** et vos **hésitations** (survol prolongé d'une autre option) ;
- la **bonne réponse**, quand le site l'affiche.

À la fin, elle **transcrit l'audio** dans le navigateur et produit **un seul fichier** à donner à une IA (Claude, Gemini, ChatGPT…). La consigne est déjà écrite dedans. L'IA rend un compte-rendu **par type d'erreur** : la règle, pourquoi vous vous êtes trompé, les pièges similaires, le bon réflexe, 10 questions d'entraînement par type, et les corrigés en fin de document.

> Conçu et testé sur **EstudyMe** (estudyme.com). Sur d'autres sites, l'extension fonctionne en mode générique, avec une détection des réponses moins fiable.

---

## Installation (une seule fois, 2 minutes)

1. Sur cette page GitHub : bouton vert **Code** → **Download ZIP**, puis dézipper.
2. Dans **Chrome**, ouvrir `chrome://extensions`.
3. Activer le **Mode développeur** (en haut à droite).
4. **Charger l'extension non empaquetée** → choisir le dossier `extension`.
5. Épingler l'icône « Carnet TOEIC » (icône puzzle 🧩 à droite de la barre d'adresse).

⚠️ **Chrome uniquement** (ou Edge, Brave). Safari et Firefox ne permettent pas d'enregistrer le son d'un onglet.

## Utilisation

1. Ouvrir l'exercice ou le test blanc dans Chrome.
2. Icône Carnet TOEIC → **Démarrer sur cet onglet**, *avant* de commencer.
3. Faire l'exercice normalement. Le son reste audible et rien ne s'affiche. Garder l'onglet au premier plan.
4. À la fin (idéalement sur la page des résultats) : **Arrêter et analyser**.
5. L'archive est enregistrée tout de suite. Un onglet « Transcription » s'ouvre ensuite et transcrit l'audio. Laisser « Rapide » et l'accélération graphique décochée. La 1re fois, le modèle de transcription se télécharge (environ 80 Mo).

Dans **Téléchargements**, un dossier `carnet-toeic-…` contient :

| Fichier | À quoi il sert |
|---|---|
| `…-dossier.md` | **À envoyer à l'IA.** Tout l'exercice + la consigne |
| `…-photos-partie1.pdf` | **À envoyer aussi**, s'il existe (photos de la partie 1) |
| `…-archive.zip` | Données brutes (audio, captures), à garder |
| `…-transcription.json` | La transcription seule |

Puis, dans Claude, Gemini ou ChatGPT : joindre le `.md` (et le `.pdf`), et écrire « Suis la consigne du fichier. »

### Exercice corrigé ou test blanc ?
L'extension le détecte toute seule :
- **Exercice corrigé** (le site montre la bonne réponse) : la correction du site fait foi.
- **Test blanc** (pas de correction) : l'IA résout elle-même les questions et indique son degré de certitude.

## Bon à savoir

- **Tout reste sur votre ordinateur.** Rien n'est envoyé nulle part, sauf le fichier que vous choisissez de donner à une IA.
- La transcription automatique peut se tromper sur un mot. L'IA a pour consigne de le signaler.
- Pour retranscrire un ancien enregistrement : popup → **Page de transcription**, puis déposer le fichier `…-archive.zip`.
- Transcription plus précise (optionnel, sur Mac ou PC avec Python et Node.js) :
  ```
  pip3 install faster-whisper
  python3 analyse.py chemin/vers/…-archive.zip
  ```
- Outil d'entraînement uniquement : il ne sert évidemment pas le jour de l'examen officiel.
- Utilisez-le pour votre usage personnel et dans le respect des conditions d'utilisation du site d'entraînement.

## Problèmes fréquents

- **La transcription reste à 0 %** : décocher « Accélération graphique », choisir « Rapide », relancer.
- **Le popup reste bloqué** : `chrome://extensions` → bouton ⟳ sur Carnet TOEIC.
- **Réponses « non captées »** : le site n'est peut-être pas EstudyMe. Ouvrez une *issue* sur GitHub avec le nom du site.

## Crédits

Transcription : [Whisper](https://github.com/openai/whisper) via [Transformers.js](https://github.com/huggingface/transformers.js). Voir `THIRD_PARTY_NOTICES.md` pour les bibliothèques incluses.

Licence : MIT (voir `LICENSE`).
