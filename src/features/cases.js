
(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});

  const BTN_ID = 'csrp-open-cases';
  const OVERLAY_ID = 'csrp-cases-overlay';
  const FRAME_ID = 'csrp-cases-frame';
  const HIDE_ATTR = 'data-csrp-cases-overlay';

  const EXT_ORIGIN = chrome.runtime.getURL('').replace(/\/$/, '');

  function onCasesRoute() {
    return /\/inventory\/cases/i.test(location.pathname);
  }

  let closedHere = false;

  let clickGraceUntil = 0;
  let promptShown = false;

  function mountOverlay() {
    if (document.getElementById(FRAME_ID)) return;
    const f = document.createElement('iframe');
    f.id = FRAME_ID;
    f.src = chrome.runtime.getURL('cases/cases.html');
    f.setAttribute('allow', 'autoplay');
    document.body.appendChild(f);

    document.documentElement.setAttribute(HIDE_ATTR, '1');
  }

  function unmountOverlay() {
    const f = document.getElementById(FRAME_ID);
    if (f) f.remove();
    document.documentElement.removeAttribute(HIDE_ATTR);
  }

  window.addEventListener('message', (e) => {
    if (e.origin !== EXT_ORIGIN) return;
    if (!e.data || e.data.type !== 'csrp:cases-close') return;
    closedHere = true;
    unmountOverlay();

    if (history.length > 1) history.back();
  });

  function buildOverlay() {
    const wrap = document.createElement('div');
    wrap.id = OVERLAY_ID;
    wrap.className = 'csrp-tr-overlay';
    wrap.innerHTML = `
      <div class="csrp-tr-card" role="dialog" aria-modal="true">
        <div class="csrp-tr-scan"></div>
        <div class="csrp-tr-tag">CSR+ // CASES <span class="csrp-tr-beta">BETA</span></div>
        <h2 class="csrp-tr-title">Try the new CSR+ Cases</h2>
        <p class="csrp-tr-sub">CSR+ can take over this page with its own case screen — browse every container, see the <b>rare knives &amp; gloves</b> each case can drop (the site hides them), and unbox with a smoother reel. It's in <b>beta</b>, so a few things may still break. Use it instead of the default page?</p>
        <label class="csrp-tr-remember">
          <input type="checkbox" id="csrp-cs-dontask" />
          <span class="csrp-tr-box"></span>
          <span>Remember my choice &amp; don't ask again</span>
        </label>
        <div class="csrp-tr-actions">
          <button class="csrp-tr-btn csrp-tr-legacy" id="csrp-cs-legacy">Use legacy</button>
          <button class="csrp-tr-btn csrp-tr-use" id="csrp-cs-use">Use CSR+ Cases  ★</button>
        </div>
      </div>`;

    const close = () => wrap.remove();
    const dontAsk = () => wrap.querySelector('#csrp-cs-dontask').checked;

    async function remember(useCsrp) {
      if (!dontAsk()) return;
      try {
        await CSRP.store.set('useCsrpCases', useCsrp);
        await CSRP.store.set('casesPromptDismissed', true);
      } catch {  }
    }

    wrap.querySelector('#csrp-cs-use').addEventListener('click', async () => {
      CSRP.sound?.play('click');
      await remember(true);
      close();
      closedHere = false;
      mountOverlay();
    });
    wrap.querySelector('#csrp-cs-legacy').addEventListener('click', async () => {
      CSRP.sound?.play('off');
      await remember(false);
      close();
    });

    wrap.addEventListener('click', (e) => { if (e.target === wrap) { CSRP.sound?.play('off'); close(); } });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape' && document.getElementById(OVERLAY_ID)) { close(); document.removeEventListener('keydown', esc); }
    });

    return wrap;
  }

  function showPrompt() {
    if (document.getElementById(OVERLAY_ID)) return;
    document.body.appendChild(buildOverlay());
    CSRP.sound?.play('alert');
  }

  function isCasesLink(a) {
    if (!a) return false;
    const href = a.getAttribute('href') || '';
    if (/\/inventory\/cases/i.test(href)) return true;
    const txt = (a.textContent || '').trim().toLowerCase();
    return txt === 'cases';
  }

  let navBound = false;
  function bindNavInterception() {
    if (navBound) return;
    navBound = true;
    document.addEventListener('click', (e) => {
      if (CSRP.store.get('masterEnabled') === false) return;
      const a = e.target.closest && e.target.closest('a');
      if (!a || !isCasesLink(a)) return;
      if (!CSRP.store.get('casesPromptDismissed') || !CSRP.store.get('useCsrpCases')) return;

      CSRP.sound?.play('click');
      closedHere = false;
      clickGraceUntil = Date.now() + 3000;
      mountOverlay();
    }, true);
  }

  function fastTick() {
    bindNavInterception();
    if (CSRP.store.get('masterEnabled') === false) { unmountOverlay(); return; }
    if (!onCasesRoute()) {
      closedHere = false;
      promptShown = false;
      if (Date.now() > clickGraceUntil) unmountOverlay();
      return;
    }
    if (CSRP.store.get('casesPromptDismissed')) {
      if (CSRP.store.get('useCsrpCases') && !closedHere) mountOverlay();
      return;
    }

    if (!promptShown && !document.getElementById(FRAME_ID)) {
      promptShown = true;
      showPrompt();
    }
  }

  function findAnchor() {
    for (const h of document.querySelectorAll('h1, h2, h3')) {
      if (/^cases/i.test((h.textContent || '').trim())) return h;
    }
    for (const a of document.querySelectorAll('a')) {
      if (/go back/i.test(a.textContent || '')) return a;
    }
    return null;
  }

  function makeButton() {
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.className =
      'rounded-lg bg-theme-primary px-6 py-2 text-sm font-medium text-theme-white transition-colors hover:bg-theme-primary-light';
    btn.style.marginLeft = '10px';
    btn.textContent = '★ CSR+ Cases';
    btn.title = 'Open the CSR+ case browser — shows the rare special drops';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      CSRP.sound?.play('click');
      closedHere = false;
      mountOverlay();
    });
    return btn;
  }

  function tick() {
    if (!onCasesRoute() || document.getElementById(FRAME_ID)) {
      const stale = document.getElementById(BTN_ID);
      if (stale) stale.remove();
      return;
    }
    if (document.getElementById(BTN_ID)) return;
    const anchor = findAnchor();
    if (!anchor) return;
    anchor.insertAdjacentElement('afterend', makeButton());
  }

  CSRP.cases = { tick, fastTick, unmountOverlay };
})();
