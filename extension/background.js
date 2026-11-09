// Carnet TOEIC — service worker.
// Fait le lien entre la page du test, le popup et le document hors écran.

let lastShot = 0;

async function getState() {
  const { state } = await chrome.storage.local.get('state');
  return state || { recording: false };
}
async function setState(patch) {
  const s = Object.assign(await getState(), patch);
  await chrome.storage.local.set({ state: s });
  return s;
}

async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (existing.length) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA', 'BLOBS'],
    justification: "Enregistrer l'audio de l'onglet du test, le transcrire et préparer l'export."
  });
}

async function injecter(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['recorder.js'] });
  } catch (e) {
    console.warn('Injection impossible :', e.message);
  }
}

async function capture(windowId) {
  const wait = 650 - (Date.now() - lastShot); // Chrome limite à ~2 captures par seconde
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastShot = Date.now();
  try { return await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 55 }); }
  catch (e) { return null; }
}

const pad = n => String(n).padStart(2, '0');

async function arreter() {
  const s = await getState();
  if (!s.recording) return { error: "Pas d'enregistrement en cours." };
  await setState({ recording: false, processing: true, progress: 'Arrêt…', prefixe: null });
  if (s.tabId) chrome.scripting.executeScript({
    target: { tabId: s.tabId, allFrames: true },
    func: () => { if (window.__carnetToeic) window.__carnetToeic.stop(); }
  }).catch(() => {});
  const d = new Date();
  const prefixe = `carnet-toeic-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  await setState({ prefixe, progress: "Enregistrement de l'archive…" });
  // Réponse attendue par un message « fichiers ».
  chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop', prefixe }).catch(() => {});
  return { ok: true };
}

async function telecharger(fichiers) {
  const s = await getState();
  const noms = [];
  for (const f of fichiers) {
    const nom = `${s.prefixe}/${s.prefixe}-${f.suffixe}`;
    await chrome.downloads.download({ url: f.url, filename: nom, saveAs: false });
    noms.push(nom);
  }
  await setState({ processing: false, progress: null, lastFile: `${s.prefixe} (dans Téléchargements)` });
  setTimeout(() => chrome.offscreen.closeDocument().catch(() => {}), 60000);
  chrome.tabs.create({ url: chrome.runtime.getURL('transcription.html?auto=1') });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== 'bg') return;

  (async () => {
    if (msg.type === 'status') {
      sendResponse(await getState());

    } else if (msg.type === 'transcription') {
      chrome.tabs.create({ url: chrome.runtime.getURL('transcription.html') });
      sendResponse({});

    } else if (msg.type === 'start') {
      await ensureOffscreen();
      const r = await chrome.runtime.sendMessage({
        target: 'offscreen', type: 'start', streamId: msg.streamId,
        meta: { title: msg.title, url: msg.url, startedAt: new Date().toISOString() }
      });
      if (!r || r.error) { sendResponse({ error: (r && r.error) || 'démarrage impossible' }); return; }
      await setState({ recording: true, processing: false, tabId: msg.tabId, startedAt: Date.now(), count: 0, nbChoix: 0, lastFile: null });
      await injecter(msg.tabId);
      sendResponse({ ok: true });

    } else if (msg.type === 'snap' || msg.type === 'evt') {
      const s = await getState();
      if (!s.recording || !sender.tab || sender.tab.id !== s.tabId) { sendResponse({}); return; }
      let shot = null;
      if (msg.type === 'snap' && sender.frameId === 0) shot = await capture(sender.tab.windowId);
      await chrome.runtime.sendMessage({ target: 'offscreen', type: msg.type, data: msg.data, shot });
      if (msg.type === 'snap') await setState({ count: (s.count || 0) + 1 });
      else if (msg.data.kind === 'choix') await setState({ nbChoix: (s.nbChoix || 0) + 1 });
      sendResponse({});

    } else if (msg.type === 'progress') {
      await setState({ progress: msg.text });
      sendResponse({});

    } else if (msg.type === 'fichiers') {
      if (msg.error) await setState({ processing: false, progress: 'Erreur : ' + msg.error });
      else await telecharger(msg.fichiers);
      sendResponse({});

    } else if (msg.type === 'stop') {
      sendResponse(await arreter());
    }
  })();
  return true;
});

// Le site change de page pendant le test : on réinjecte le script.
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== 'complete') return;
  const s = await getState();
  if (s.recording && s.tabId === tabId) injecter(tabId);
});

// Onglet fermé pendant l'enregistrement : on exporte quand même.
chrome.tabs.onRemoved.addListener(async tabId => {
  const s = await getState();
  if (s.recording && s.tabId === tabId) arreter();
});

// Extension rechargée ou Chrome relancé : on repart d'un état propre.
const reinit = () => chrome.storage.local.set({ state: { recording: false, processing: false } });
chrome.runtime.onInstalled.addListener(reinit);
chrome.runtime.onStartup.addListener(reinit);
