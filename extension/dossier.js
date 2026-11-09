// Carnet TOEIC — construit le dossier compact à partir de la session enregistrée.
// Utilisé par l'extension (offscreen.js) ; testable aussi avec Node.
(function (root) {
  const RE_Q = /\b(?:question|q)\s*(?:n[°o]\s*)?(\d{1,3})\b/gi;

  const fmt = s => {
    s = Math.max(0, Math.round(s));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  const norm = t => (t || '').replace(/\s+/g, ' ').trim();
  const nettoyer = (t, n) => {
    const s = (t || '').split('\n').map(l => l.trim()).filter(Boolean).join('\n');
    return s.length > n ? s.slice(0, n) + '\n[…]' : s;
  };
  const numeros = t => [...new Set([...(t || '').matchAll(RE_Q)].map(m => m[1]))];
  const reponse = c => c.lettre || c.label || '?';

  // Regroupe les instantanés : par question affichée si on la connaît, sinon par texte identique.
  function grouperEcrans(ecrans) {
    const g = [];
    for (const e of ecrans) {
      const qs = (e.quiz && e.quiz.length) ? e.quiz.map(x => x.q).filter(Boolean) : numeros(e.text);
      const cle = qs.length ? 'Q:' + qs.join(',') : norm(e.text).slice(0, 3000);
      const cur = g[g.length - 1];
      if (cur && cur.cle === cle) {
        cur.texte = e.text || cur.texte;               // garde le dernier état (correction comprise)
        if (e.quiz && e.quiz.length) cur.quiz = e.quiz;
        if (e.selections && e.selections.length) cur.selections = e.selections;
        cur.images = Math.max(cur.images, e.images || 0);
        if (e.image && !cur.image) cur.image = e.image;
      } else {
        g.push({ cle, debut: e.sec, texte: e.text || '', quiz: e.quiz || [], selections: e.selections || [],
                 images: e.images || 0, image: e.image || null, questions: qs });
      }
    }
    g.forEach((x, i) => { x.fin = i + 1 < g.length ? g[i + 1].debut : Infinity; });
    return g;
  }

  // Classes posées par le site sur une option (EstudyMe : picking = choisie, correct = bonne réponse)
  const jetons = c => (c || '').split(/\s+/).filter(Boolean);
  const estBonne = o => jetons(o.classes).includes('correct');
  const estChoisie = o => jetons(o.classes).some(t => /^(picking|selected|chosen|checked|incorrect|wrong|user-answer|is-selected)$/.test(t));

  // Associe une clé de question brute (« 12 », « nom:q3 », null) à un numéro affiché à l'écran
  function resoudre(ecran, evts) {
    const noms = [...new Set(evts.map(e => e.q).filter(q => q && q.startsWith('nom:')))];
    return q => {
      if (q && !q.startsWith('nom:')) return q;
      if (q) {
        const chiffres = (q.match(/\d+/g) || []).find(d => ecran.questions.includes(String(+d)));
        if (chiffres) return String(+chiffres);
        if (noms.length <= ecran.questions.length) return ecran.questions[noms.indexOf(q)];
      }
      if (ecran.questions.length === 1) return ecran.questions[0];
      return q ? q.replace('nom:', 'champ ') : (ecran.questions[0] || '?');
    };
  }

  function analyserQuestions(ecran, evts, segments) {
    const res = resoudre(ecran, evts);
    const parQ = new Map();
    const get = q => { if (!parQ.has(q)) parQ.set(q, { choix: [], survols: [], validee: null }); return parQ.get(q); };

    for (const e of evts) {
      if (e.kind === 'choix') {
        const x = get(res(e.q));
        const r = reponse(e);
        if (!x.choix.length || reponse(x.choix[x.choix.length - 1]) !== r) x.choix.push(e);
      } else if (e.kind === 'survol') {
        get(res(e.q)).survols.push(e);
      } else if (e.kind === 'validation') {
        for (const x of parQ.values()) if (x.choix.length && !x.validee) x.validee = { sec: e.sec };
      }
    }
    // Ce que la page affiche à la fin de l'écran : option marquée et bonne réponse
    for (const b of ecran.quiz || []) {
      const x = get(res(b.q));
      const marquee = b.options.find(estChoisie);
      const bonne = b.options.find(estBonne);
      if (marquee) x.marquee = marquee.lettre;
      if (bonne) x.bonne = bonne.lettre;
    }
    // Repli : état final de la page si aucun clic n'a été capté
    for (const s of ecran.selections) {
      const x = get(res(s.q));
      if (!x.choix.length && !x.marquee && /^[A-D]$/.test(reponse(s))) x.etatPage = reponse(s);
    }

    const finAudio = segments.length ? segments[segments.length - 1].fin : null;
    const lignes = [];
    for (const [q, x] of [...parQ.entries()].sort((a, b) => (+a[0] || 999) - (+b[0] || 999))) {
      const finale = x.choix.length ? reponse(x.choix[x.choix.length - 1]) : x.marquee || x.etatPage || null;
      let l = `- **${/^\d+$/.test(q) ? 'Q' + q : q}** — réponse finale : **${finale || 'non captée'}**`;
      if (x.validee) l += ` (validée à ${fmt(x.validee.sec)})`;
      else if (!x.choix.length && finale) l += ' (lue sur la page)';
      if (x.bonne) l += `
  - Bonne réponse affichée par le site : **${x.bonne}** → ${finale === x.bonne ? 'JUSTE' : finale ? 'FAUX' : 'non répondue'}`;
      const distinctes = [...new Set(x.choix.map(reponse))];
      if (x.choix.length > 1) {
        l += `\n  - Changement de réponse : ${x.choix.map(c => `${reponse(c)} (${fmt(c.sec)})`).join(' → ')}`;
      }
      const survolsAutres = x.survols.filter(s => s.lettre && s.lettre !== finale);
      if (survolsAutres.length) {
        l += `\n  - Survol prolongé d'une autre option : ${survolsAutres.map(s => `${s.lettre} (${(s.ms / 1000).toFixed(1)} s)`).join(', ')}`;
      }
      const dernier = x.choix[x.choix.length - 1];
      if (dernier && finAudio != null) {
        const d = dernier.sec - finAudio;
        l += `\n  - Délai réponse / fin de l'audio de l'écran : ${d >= 0 ? '+' : ''}${Math.round(d)} s`;
      }
      const hesite = distinctes.length > 1 || survolsAutres.length > 0;
      l += `\n  - Hésitation détectée : ${hesite ? 'OUI' : 'non'}`;
      lignes.push(l);
    }
    return lignes;
  }

  function consigne(mode) {
    const corrige = mode === 'corrige';
    return `# Consigne pour l'IA qui lit ce dossier

Tu es un formateur expert du TOEIC Listening & Reading. Ce dossier est l'enregistrement \
d'une session passée par une candidate francophone de niveau avancé (score actuel autour \
de 870/990). Son objectif : comprendre ses erreurs pour ne plus les refaire.

**Mode de la session : ${corrige
    ? "EXERCICE CORRIGÉ. Le site a affiché la bonne réponse : elle figure sur la ligne « Bonne réponse affichée par le site ». C'est la référence, ne la contredis jamais."
    : "TEST BLANC SANS CORRECTION. Le site n'a affiché aucune bonne réponse. Tu dois résoudre toi-même chaque question avec soin (audio transcrit, photo, texte), puis indiquer ta certitude : sûre, probable ou incertaine. Ne compte comme faute qu'une réponse dont tu es sûr qu'elle est fausse ; mets les cas douteux à part."}**

Pour chaque question, le dossier donne : le texte de la page, la transcription automatique \
de l'audio (parties 1 à 4), la réponse finale de la candidate, ses changements de réponse, \
ses survols prolongés d'autres options (hésitation) et son délai de réponse. Les photos de \
la partie 1 sont dans photos-partie1.pdf (numéro de page indiqué).

## Ce que tu dois produire (en français, phrases courtes, style simple, exemples en anglais)

### 1. Tableau récapitulatif
Une ligne par question : n°, partie TOEIC, réponse de la candidate, bonne réponse\
${corrige ? '' : ' (+ certitude)'}, ✔ ou ✘, hésitation oui/non. Puis le total : justes, \
fausses, hésitations.

### 2. Bilan par TYPE d'erreur (le cœur du travail)
Regroupe les fautes ET les hésitations par type de piège, pas question par question. \
Classe les types du plus coûteux au moins coûteux. Exemples de types :
- Partie 1 : mot entendu mais mauvaise action, mauvais sujet, mauvais lieu ; homophones.
- Partie 2 : question en wh- à laquelle on répond par oui/non ; mot de la question répété \
dans une mauvaise réponse ; son proche ; réponse indirecte juste mais déroutante.
- Parties 3-4 : paraphrase non reconnue ; mot entendu utilisé comme piège ; détail vs idée \
générale ; intention ou sous-entendu ; lien avec un graphique.
- Partie 5 : nature du mot (nom, adjectif, adverbe, verbe) ; temps et voix ; accord ; \
préposition ; conjonction ou connecteur ; pronom ; vocabulaire proche ou collocation.
- Partie 6 : cohérence du texte, phrase à insérer, connecteur logique.
- Partie 7 : paraphrase, inférence, question NOT, lien entre plusieurs documents.

Pour CHAQUE type, cette structure exacte :
- **Titre du type** — nombre de fautes et d'hésitations.
- **La règle** : 3 à 5 lignes, claires, avec un exemple.
- **Tes erreurs** : pour chaque question concernée : l'énoncé en bref, ta réponse et la bonne \
réponse, **pourquoi tu as probablement choisi cette réponse** (la confusion précise : « tu as \
confondu X et Y », « tu as reconnu le mot … entendu dans l'audio »…), pourquoi elle est fausse, \
et l'indice qui aurait dû t'alerter.
- **Tes hésitations** : quelle option t'a attirée, pourquoi elle était tentante, et si tu \
t'es bien rattrapée ou si tu as changé une bonne réponse pour une mauvaise.
- **Pièges similaires au TOEIC** : 3 ou 4 exemples courts du même piège sous d'autres formes.
- **Le réflexe à adopter** : 1 ou 2 phrases de méthode, à appliquer le jour de l'examen.
- **Entraînement** : 10 questions inédites, au format TOEIC de la même partie, qui ciblent ce \
piège précis, difficulté croissante. Numérote-les par type (1.1 à 1.10, puis 2.1 à 2.10…). \
Pour un type de l'écoute, écris le script à faire lire à voix haute par une synthèse vocale, \
puis les options. **Ne donne pas les réponses ici.**

### 3. Priorités
Les 3 priorités, classées par points perdus, et un plan court jour par jour jusqu'à l'examen. \
Signale aussi les réponses trop tardives (délai long) ou trop précipitées.

### 4. Corrigés (en fin de document uniquement)
Les réponses de toutes les séries d'entraînement, avec pour chacune une explication d'une ligne.

## Règles
- Les questions justes sans hésitation ne sont citées que dans le tableau.
- La transcription automatique peut se tromper sur un mot : signale-le quand une question \
devient incertaine, sans inventer.
- Si une réponse est « non captée », dis-le, sans l'inventer.
- Si ta réponse devient trop longue, termine proprement un type complet, puis écris \
« (suite : tapez continuer) » et attends.

---
`;
  }

  function construire(session, segments) {
    const ecrans = grouperEcrans(session.ecrans || []);
    const evts = session.evenements || [];
    const photos = [];
    // Le site a-t-il affiché des corrections ? (exercice corrigé vs test blanc)
    const mode = ecrans.some(e => (e.quiz || []).some(b => b.options.some(estBonne))) ? 'corrige' : 'test';
    const L = [];

    ecrans.forEach((e, i) => {
      const seg = segments.filter(s => s.debut >= e.debut && s.debut < e.fin);
      const ev = evts.filter(x => x.sec >= e.debut && x.sec < e.fin);
      const qs = e.questions.length ? ` — Q${e.questions.join(', Q')}` : '';
      L.push(`## Écran ${i + 1}${qs} (${fmt(e.debut)}${isFinite(e.fin) ? ' → ' + fmt(e.fin) : ''})`);
      if (e.images && e.image) {
        photos.push({ image: e.image, titre: `Écran ${i + 1}${qs} (${fmt(e.debut)})` });
        L.push(`Photo : photos-partie1.pdf, page ${photos.length}`);
      }
      L.push('**Texte de la page**\n```\n' + nettoyer(e.texte, 1500) + '\n```');
      if (seg.length) L.push('**Audio entendu**\n' + seg.map(s => `[${fmt(s.debut)}] ${s.texte}`).join('\n'));
      const rep = analyserQuestions(e, ev, seg);
      if (rep.length) L.push('**Réponses**\n' + rep.join('\n'));
      L.push('');
    });
    const corps = L.join('\n');
    const n = (re) => (corps.match(re) || []).length;
    const entete = [consigne(mode),
      `# Dossier de session`,
      `Page : ${session.meta.title || ''} — ${session.meta.url || ''}`,
      `Début : ${session.audio_debut} — durée : ${fmt(session.audio_duree_sec)} — ${ecrans.length} écrans`,
      `Mode détecté : ${mode === 'corrige' ? 'exercice corrigé (bonnes réponses affichées par le site)' : 'test blanc sans correction (bonnes réponses à déduire)'}`,
      `Résumé automatique : ${n(/réponse finale/g)} réponses relevées` +
        (mode === 'corrige' ? `, ${n(/→ JUSTE/g)} justes, ${n(/→ FAUX/g)} fausses` : '') +
        `, ${n(/Hésitation détectée : OUI/g)} hésitations.`, ''];
    return { md: entete.join('\n') + '\n' + corps, photos, mode };
  }

  const api = { construire, fmt };
  if (typeof module !== 'undefined') module.exports = api;
  else root.CarnetDossier = api;
})(typeof self !== 'undefined' ? self : this);
