// Carnet TOEIC — script injecté dans la page du test.
// Il ne modifie rien et n'affiche rien. Il note :
//  - le texte visible à chaque changement d'écran ;
//  - chaque choix de réponse (numéro de question, lettre, heure) ;
//  - les clics sur « Valider / Suivant » (réponse validée) ;
//  - les survols prolongés d'une option (signe d'hésitation).
(() => {
  if (window.__carnetToeic) return;

  let last = '';
  let timer = null;
  let actif = true;

  const court = (t, n = 300) => (t || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const visible = el => {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
  };
  const envoyer = (type, data) =>
    chrome.runtime.sendMessage({ target: 'bg', type, data: { t: Date.now(), ...data } }).catch(() => {});

  const RE_Q = /\b(?:question|q)\s*(?:n[°o]\s*)?(\d{1,3})\b/i;
  const RE_VALID = /^(valider|validate|suivant|next|submit|confirmer|confirm|continuer|continue|terminer|finish|ok)\b/i;
  const RE_LETTRE = /^\s*\(?([A-D])\)?(?:[\s.):-]|$)/;
  const OPTION_SEL = '.quiz-choice-item, input[type="radio"], input[type="checkbox"], [role="radio"], [role="option"], label';

  // Numéro de question le plus proche de l'élément (en remontant dans la page)
  function questionDe(el) {
    const bloc = el.closest && el.closest('.game-object-view, .game-object-quiz');
    const idx = bloc && bloc.querySelector('.game-object-view-question-index');
    const m0 = idx && (idx.innerText || '').match(/(\d{1,3})/);
    if (m0) return m0[1];
    let e = el;
    for (let i = 0; e && i < 14; i++, e = e.parentElement) {
      const t = e.innerText || '';
      if (t.length > 4000) break;
      const m = t.match(RE_Q);
      if (m) return m[1];
    }
    const input = el.matches && el.matches('input') ? el : el.querySelector && el.querySelector('input[type="radio"]');
    return input && input.name ? 'nom:' + input.name : null;
  }

  // Lettre A/B/C/D de l'option
  function lettreDe(el) {
    const input = el.matches('input') ? el : el.querySelector('input[type="radio"], input[type="checkbox"]');
    if (input && input.name) {
      const groupe = [...document.querySelectorAll(`input[name="${CSS.escape(input.name)}"]`)];
      const i = groupe.indexOf(input);
      if (i >= 0 && i < 6) return 'ABCDEF'[i];
    }
    if (input && /^[A-D]$/i.test(input.value)) return input.value.toUpperCase();
    const m = court(el.innerText || el.getAttribute('aria-label') || (input && input.value), 60).match(RE_LETTRE);
    if (m) return m[1];
    const opts = el.parentElement ? [...el.parentElement.children].filter(c => c.tagName === el.tagName) : [];
    if (opts.length >= 3 && opts.length <= 4) return 'ABCD'[opts.indexOf(el)];
    return null;
  }

  function optionDe(target) {
    const el = target.closest(OPTION_SEL);
    if (el) return el.matches('label') && el.control ? el.control : el;
    // Option « maison » : un bloc court qui commence par A, B, C ou D
    let e = target;
    for (let i = 0; e && i < 4; i++, e = e.parentElement) {
      const t = court(e.innerText, 400);
      if (t && t.length < 400 && RE_LETTRE.test(t)) return e;
    }
    return null;
  }

  function selections() {
    const out = [];
    document.querySelectorAll('input[type="radio"]:checked, input[type="checkbox"]:checked').forEach(i => {
      out.push({ q: questionDe(i), lettre: lettreDe(i), label: court(i.labels && i.labels[0] ? i.labels[0].innerText : i.value, 150) });
    });
    document.querySelectorAll('[aria-checked="true"], [aria-selected="true"]').forEach(e => {
      if (visible(e)) out.push({ q: questionDe(e), lettre: lettreDe(e), label: court(e.innerText, 150) });
    });
    const re = /(^|[-_\s])(selected|checked|chosen|is-selected|user-answer|correct|wrong|incorrect|good|bad|right)([-_\s]|$)/i;
    let n = 0;
    document.querySelectorAll('[class]').forEach(e => {
      if (n > 25 || typeof e.className !== 'string' || !re.test(e.className)) return;
      const t = court(e.innerText, 150);
      if (!t || /^\d+$/.test(t) || e.closest('button, .question-btn, nav, aside') || !visible(e)) return;
      out.push({ q: questionDe(e), lettre: lettreDe(e), label: t, classe: court(e.className, 60) }); n++;
    });
    return out;
  }

  // Zone utile de la page (EstudyMe : zone de la question, sans barre latérale ni publicité)
  function zone() {
    return document.querySelector('.game-view-container-main, .main-game-object') || document.body;
  }
  function texteZone() {
    return (zone().innerText || '').split('\n')
      .filter(l => !/^\s*\d{1,2}:\d{2}(:\d{2})?\s*$/.test(l)) // chronomètre
      .join('\n').slice(0, 20000);
  }

  // État de chaque question visible : options, et classes posées par le site
  // (EstudyMe : .quiz-choice-item, avec « picking » = choisie, « correct » = bonne réponse)
  function quiz() {
    const groupes = new Map();
    document.querySelectorAll('.quiz-choice-item').forEach(o => {
      if (!visible(o)) return;
      const bloc = o.closest('.game-object-view, .game-object-quiz') || o.parentElement;
      if (!groupes.has(bloc)) groupes.set(bloc, []);
      groupes.get(bloc).push(o);
    });
    const out = [];
    for (const [bloc, opts] of groupes) {
      const idx = bloc.querySelector('.game-object-view-question-index');
      const m = idx && (idx.innerText || '').match(/(\d{1,3})/);
      out.push({
        q: m ? m[1] : questionDe(opts[0]),
        options: opts.map((o, i) => ({
          lettre: (court(o.innerText, 40).match(RE_LETTRE) || [])[1] || 'ABCD'[i],
          texte: court(o.innerText, 120),
          classes: (typeof o.className === 'string' ? o.className : '').replace('quiz-choice-item', '').trim()
        }))
      });
    }
    return out;
  }

  function grandesImages() {
    return [...document.querySelectorAll('img, canvas, video')].filter(i => {
      const r = i.getBoundingClientRect();
      return r.width >= 250 && r.height >= 150 && visible(i);
    }).length;
  }

  function snap(reason) {
    if (!actif || !document.body) return;
    const text = texteZone();
    const qz = quiz();
    const sel = qz.length ? [] : selections();
    const key = text + '|' + JSON.stringify(qz) + JSON.stringify(sel);
    if (key === last) return;
    last = key;
    envoyer('snap', { reason, url: location.href, text, quiz: qz, selections: sel, images: grandesImages() });
  }
  const plusTard = (reason, ms) => { clearTimeout(timer); timer = setTimeout(() => snap(reason), ms); };

  // 1. Changements d'écran
  const obs = new MutationObserver(() => plusTard('changement', 900));
  obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ['class', 'aria-checked', 'aria-selected', 'checked'] });

  // 2. Choix de réponse et validation
  function onClick(ev) {
    if (!actif) return;
    const bouton = ev.target.closest('button, a, input[type="submit"], input[type="button"], [role="button"]');
    const texteBouton = bouton ? court(bouton.innerText || bouton.value || bouton.getAttribute('aria-label'), 60) : '';
    if (bouton && RE_VALID.test(texteBouton)) {
      envoyer('evt', { kind: 'validation', bouton: texteBouton });
      plusTard('validation', 400);
      return;
    }
    const opt = optionDe(ev.target);
    if (opt) {
      envoyer('evt', { kind: 'choix', q: questionDe(opt), lettre: lettreDe(opt), label: court(opt.innerText || opt.value, 150) });
      plusTard('choix', 400);
    }
  }
  function onChange(ev) {
    const i = ev.target;
    if (!actif || !i.matches('input[type="radio"], input[type="checkbox"], select')) return;
    const label = i.tagName === 'SELECT' ? i.options[i.selectedIndex].text : (i.labels && i.labels[0] ? i.labels[0].innerText : i.value);
    envoyer('evt', { kind: 'choix', source: 'change', q: questionDe(i), lettre: i.tagName === 'SELECT' ? null : lettreDe(i), label: court(label, 150) });
  }
  document.addEventListener('click', onClick, true);
  document.addEventListener('change', onChange, true);

  // 3. Survol prolongé d'une option (≥ 1,5 s) : signe d'hésitation
  let survol = null;
  function onOver(ev) {
    const opt = optionDe(ev.target);
    if (survol && survol.el === opt) return;
    finSurvol();
    if (opt) survol = { el: opt, debut: Date.now() };
  }
  function finSurvol() {
    if (!survol) return;
    const ms = Date.now() - survol.debut;
    if (ms >= 1500 && actif) envoyer('evt', { kind: 'survol', q: questionDe(survol.el), lettre: lettreDe(survol.el), ms });
    survol = null;
  }
  document.addEventListener('mouseover', onOver, true);
  window.addEventListener('blur', finSurvol);

  window.__carnetToeic = {
    stop() {
      finSurvol();
      actif = false; obs.disconnect();
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('change', onChange, true);
      document.removeEventListener('mouseover', onOver, true);
    }
  };

  snap('début de page');
})();
