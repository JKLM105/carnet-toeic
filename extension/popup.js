const etat = document.getElementById('etat');
const btnStart = document.getElementById('start');
const btnStop = document.getElementById('stop');

function afficher(s) {
  s = s || {};
  if (s.recording) {
    const min = Math.floor((Date.now() - s.startedAt) / 60000);
    etat.textContent = `● Enregistrement — ${min} min, ${s.count || 0} écrans, ${s.nbChoix || 0} clics de réponse`;
    etat.className = 'etat rec';
    btnStart.disabled = true; btnStop.disabled = false;
  } else if (s.processing) {
    etat.textContent = s.progress || 'Enregistrement de l’archive…';
    etat.className = 'etat work';
    btnStart.disabled = true; btnStop.disabled = true;
  } else {
    etat.textContent = s.progress && s.progress.startsWith('Erreur') ? s.progress
      : s.lastFile ? `✔ Fichiers prêts : ${s.lastFile}` : 'Prêt.';
    etat.className = 'etat';
    btnStart.disabled = false; btnStop.disabled = true;
  }
}

const rafraichir = async () => afficher(await chrome.runtime.sendMessage({ target: 'bg', type: 'status' }));

document.getElementById('trans').onclick = () => chrome.runtime.sendMessage({ target: 'bg', type: 'transcription' });

btnStart.onclick = async () => {
  btnStart.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
    const r = await chrome.runtime.sendMessage({
      target: 'bg', type: 'start', tabId: tab.id, streamId, title: tab.title, url: tab.url
    });
    if (r && r.error) throw new Error(r.error);
  } catch (e) {
    etat.textContent = 'Erreur : ' + e.message;
    btnStart.disabled = false;
    return;
  }
  rafraichir();
};

btnStop.onclick = async () => {
  btnStop.disabled = true;
  await chrome.runtime.sendMessage({ target: 'bg', type: 'stop' });
  rafraichir();
};

rafraichir();
setInterval(rafraichir, 1000);
