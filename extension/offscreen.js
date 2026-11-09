// Carnet TOEIC — document hors écran.
// Enregistre l'audio de l'onglet, garde les écrans et les événements.
// À l'arrêt : enregistre tout de suite l'archive, puis confie la transcription
// à la page visible transcription.html (via IndexedDB).

let recorder = null, chunks = [], stream = null, ctx = null;
let startMs = 0, meta = {}, snaps = [], evenements = [];

const sec = t => Math.round((t - startMs) / 100) / 10;

async function demarrer(streamId, m) {
  meta = m; snaps = []; evenements = []; chunks = [];
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } }, video: false
  });
  // La capture coupe le son de l'onglet : on le renvoie vers les haut-parleurs.
  ctx = new AudioContext();
  ctx.createMediaStreamSource(stream).connect(ctx.destination);
  recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 64000 });
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  recorder.start(1000);
  startMs = Date.now();
}

function arreterAudio() {
  return new Promise(resolve => {
    if (!recorder) return resolve(null);
    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      if (ctx) ctx.close();
      resolve(new Blob(chunks, { type: 'audio/webm' }));
    };
    recorder.stop();
  });
}

async function exporter(audio, prefixe) {
  const images = {};
  const ecrans = snaps.map((s, i) => {
    let image = null;
    if (s.shot) { image = `captures/${String(i + 1).padStart(4, '0')}.jpg`; images[image] = s.shot; }
    return { n: i + 1, sec: sec(s.data.t), image, ...s.data };
  });
  const session = {
    outil: 'Carnet TOEIC 2.3', meta,
    audio_debut: new Date(startMs).toISOString(),
    audio_duree_sec: Math.round((Date.now() - startMs) / 1000),
    ecrans, evenements: evenements.map(e => ({ ...e, sec: sec(e.t) }))
  };

  // Pour la page de transcription
  await CarnetIDB.put('derniere', { prefixe, session, audio, images });

  // Archive complète, téléchargée immédiatement
  const zip = new JSZip();
  zip.file('session.json', JSON.stringify(session, null, 1));
  if (audio) zip.file('audio.webm', audio);
  for (const [nom, data] of Object.entries(images)) zip.file(nom, data.split(',')[1], { base64: true });
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } });
  return [{ suffixe: 'archive.zip', url: URL.createObjectURL(blob) }];
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== 'offscreen') return;
  (async () => {
    try {
      if (msg.type === 'start') {
        await demarrer(msg.streamId, msg.meta);
        sendResponse({ ok: true });
      } else if (msg.type === 'snap') {
        snaps.push({ data: msg.data, shot: msg.shot });
        sendResponse({ ok: true });
      } else if (msg.type === 'evt') {
        evenements.push(msg.data);
        sendResponse({ ok: true });
      } else if (msg.type === 'stop') {
        sendResponse({ ok: true });
        try {
          const audio = await arreterAudio();
          recorder = null;
          const fichiers = await exporter(audio, msg.prefixe);
          chrome.runtime.sendMessage({ target: 'bg', type: 'fichiers', fichiers });
        } catch (e) {
          chrome.runtime.sendMessage({ target: 'bg', type: 'fichiers', error: e.message });
        }
      }
    } catch (e) {
      sendResponse({ error: e.message });
    }
  })();
  return true;
});
