// Petit stockage partagé (IndexedDB) entre le document hors écran et la page de transcription.
(function (root) {
  const ouvrir = () => new Promise((res, rej) => {
    const r = indexedDB.open('carnet-toeic', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('sessions');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  async function tx(mode, f) {
    const db = await ouvrir();
    return new Promise((res, rej) => {
      const t = db.transaction('sessions', mode);
      const req = f(t.objectStore('sessions'));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
    });
  }
  root.CarnetIDB = {
    put: (cle, valeur) => tx('readwrite', s => s.put(valeur, cle)),
    get: cle => tx('readonly', s => s.get(cle))
  };
})(self);
