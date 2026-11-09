// Carnet TOEIC — page de transcription (onglet visible).
import { pipeline, env } from './lib/transformers.min.js';

env.allowLocalModels = false;
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('lib/');
env.backends.onnx.wasm.numThreads = 1;

const $ = id => document.getElementById(id);
const etat = (t, cls = '') => { $('etat').textContent = t; $('etat').className = cls; };
const barre = p => { $('barre').style.width = Math.round(p) + '%'; };
const direct = t => { const d = $('direct'); d.textContent += t + '\n'; d.scrollTop = d.scrollHeight; };
const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s) % 60).padStart(2, '0')}`;

let donnees = null;
let enCours = false;

// ---------- Chargement de l'enregistrement ----------
function afficherSource(d, origine) {
  donnees = d;
  const s = d.session;
  $('source').innerHTML = `${origine} : <b>${s.meta.title || 'test'}</b> — ${new Date(s.audio_debut).toLocaleString('fr-FR')} — durée ${fmt(s.audio_duree_sec)}, ${s.ecrans.length} écrans, ${(s.evenements || []).length} événements.`;
  $('go').disabled = !d.audio;
  if (!d.audio) etat("Cet enregistrement n'a pas d'audio.", 'erreur');
}

async function chargerArchive(fichier) {
  const zip = await JSZip.loadAsync(fichier);
  const session = JSON.parse(await zip.file('session.json').async('string'));
  const a = zip.file('audio.webm');
  const audio = a ? new Blob([await a.async('arraybuffer')], { type: 'audio/webm' }) : null;
  const images = {};
  for (const nom of Object.keys(zip.files).filter(n => n.startsWith('captures/') && n.endsWith('.jpg'))) {
    images[nom] = 'data:image/jpeg;base64,' + await zip.file(nom).async('base64');
  }
  const prefixe = fichier.name.replace(/-archive\.zip$/, '').replace(/\.zip$/, '');
  afficherSource({ prefixe, session, audio, images }, 'Archive chargée');
}

// ---------- Transcription ----------
async function decoder(blob) {
  const ac = new AudioContext({ sampleRate: 16000 });
  const buf = await ac.decodeAudioData(await blob.arrayBuffer());
  ac.close();
  const g = buf.getChannelData(0);
  if (buf.numberOfChannels < 2) return g;
  const d = buf.getChannelData(1), m = new Float32Array(g.length);
  for (let i = 0; i < g.length; i++) m[i] = (g[i] + d[i]) / 2;
  return m;
}

async function transcrire() {
  const modele = document.querySelector('input[name="m"]:checked').value;
  const gpu = $('gpu').checked && navigator.gpu && await navigator.gpu.requestAdapter().catch(() => null);
  const device = gpu ? 'webgpu' : 'wasm';

  etat("Décodage de l'audio…");
  const audio = await decoder(donnees.audio);

  etat('Chargement du modèle…');
  const id = modele === 'precis' ? 'Xenova/whisper-small.en' : 'Xenova/whisper-base.en';
  const asr = await pipeline('automatic-speech-recognition', id, {
    device,
    dtype: device === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8',
    progress_callback: p => {
      if (p.status === 'progress' && /\.onnx$/.test(p.file || '')) {
        etat(`Téléchargement du modèle (1re fois seulement) : ${Math.round(p.progress)} %`);
        barre(p.progress);
      }
    }
  });

  const SR = 16000, PAS = 28 * SR, segments = [];
  const t0 = Date.now();
  barre(0);
  for (let s = 0; s < audio.length; s += PAS) {
    const part = audio.subarray(s, Math.min(s + PAS, audio.length));
    const off = s / SR;
    const pct = 100 * s / audio.length;
    etat(`Transcription : ${Math.round(pct)} % (${fmt(off)} / ${fmt(audio.length / SR)})`);
    barre(pct);
    if (pct > 2) {
      const reste = (Date.now() - t0) / pct * (100 - pct) / 1000;
      $('eta').textContent = `Temps restant estimé : ${Math.ceil(reste / 60)} min`;
    }
    // Saute les passages silencieux
    let e = 0;
    for (let i = 0; i < part.length; i += 160) e += part[i] * part[i];
    if (Math.sqrt(e / (part.length / 160)) < 0.003) continue;

    const out = await asr(part, { return_timestamps: true });
    for (const c of out.chunks || [{ timestamp: [0, part.length / SR], text: out.text }]) {
      const texte = (c.text || '').trim();
      if (!texte) continue;
      const [a, b] = c.timestamp;
      const seg = { debut: Math.round((off + (a ?? 0)) * 10) / 10, fin: Math.round((off + (b ?? (a ?? 0) + 2)) * 10) / 10, texte };
      segments.push(seg);
      direct(`[${fmt(seg.debut)}] ${texte}`);
    }
  }
  barre(100);
  $('eta').textContent = '';
  return segments;
}

// ---------- Fichiers finaux ----------
function pdfPhotos(photos, images) {
  const { jsPDF } = self.jspdf;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  photos.forEach((p, i) => {
    if (i) pdf.addPage();
    pdf.setFontSize(14);
    pdf.text(`Page ${i + 1} — ${p.titre}`, 10, 12);
    const data = images[p.image];
    const prop = pdf.getImageProperties(data);
    const h = Math.min(185, 277 * prop.height / prop.width);
    pdf.addImage(data, 'JPEG', 10, 18, h * prop.width / prop.height, h);
  });
  return pdf.output('blob');
}

async function telecharger(blob, nom) {
  const url = URL.createObjectURL(blob);
  await chrome.downloads.download({ url, filename: `${donnees.prefixe}/${donnees.prefixe}-${nom}`, saveAs: false });
}

async function lancer() {
  if (enCours || !donnees) return;
  enCours = true;
  $('go').disabled = true;
  $('direct').textContent = '';
  try {
    const segments = await transcrire();
    etat('Préparation du dossier…');
    const { md, photos } = CarnetDossier.construire(donnees.session, segments);
    await telecharger(new Blob([md], { type: 'text/markdown' }), 'dossier.md');
    if (photos.length) await telecharger(pdfPhotos(photos, donnees.images), 'photos-partie1.pdf');
    await telecharger(new Blob([JSON.stringify(segments, null, 1)], { type: 'application/json' }), 'transcription.json');
    etat(`✔ Terminé : ${segments.length} phrases transcrites. Le dossier .md${photos.length ? ' et le PDF des photos sont' : ' est'} dans Téléchargements › ${donnees.prefixe}.`, 'ok');
  } catch (e) {
    console.error(e);
    etat(`Erreur : ${e.message}. Essayez en décochant « Accélération graphique » et en choisissant « Rapide », puis relancez.`, 'erreur');
  }
  enCours = false;
  $('go').disabled = false;
}

// ---------- Démarrage ----------
$('go').onclick = lancer;

const depot = $('depot');
depot.ondragover = e => { e.preventDefault(); depot.classList.add('survol'); };
depot.ondragleave = () => depot.classList.remove('survol');
depot.ondrop = async e => {
  e.preventDefault(); depot.classList.remove('survol');
  const f = e.dataTransfer.files[0];
  if (!f) return;
  try { await chargerArchive(f); } catch (err) { etat('Archive illisible : ' + err.message, 'erreur'); }
};

(async () => {
  const d = await CarnetIDB.get('derniere').catch(() => null);
  if (d) {
    afficherSource(d, 'Dernier enregistrement');
    if (new URLSearchParams(location.search).has('auto')) lancer();
  } else {
    $('source').textContent = 'Aucun enregistrement récent. Déposez une archive ci-dessous.';
  }
})();
