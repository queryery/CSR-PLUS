
(() => {
  'use strict';
  const CSRP = window.CSRP;
  if (!CSRP || window.__csrpMain) return;
  window.__csrpMain = true;


  function injectHook() {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('src/inject/socketHook.js');
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
  }

  CSRP._matchData = null;
  CSRP._friendsCache = [];
  window.addEventListener('csrp:matchdata', (e) => {
    CSRP._matchData = e.detail;

    const myId = e.detail && e.detail.myId;
    if (myId) {
      try { chrome.storage.local.set({ csrpMyId: String(myId) }); } catch {  }
    }
  });


  function fastLoop() {
    if (CSRP.store.get('masterEnabled') === false) return;
    try {
      CSRP.autoAccept.tick();
      CSRP.mapBan.tick();
      CSRP.serverCopy.tick();
      CSRP.cases.fastTick();
    } catch (err) {
      
    }
  }


  let uiBusy = false;
  async function uiLoop() {
    if (uiBusy) return;
    if (CSRP.store.get('masterEnabled') === false) {

      document.querySelectorAll('.csrp-badge-wrap, .csrp-wp, .csrp-mo, .csrp-tag-chip, #csrp-watch-inv, #csrp-open-trades, #csrp-open-cases, #csrp-lb-search, .csrp-lb-empty, .csrp-lb-remote, .csrp-cf, .csrp-av-ring').forEach((n) => n.remove());
      document.querySelectorAll('img.csrp-av-clip').forEach((n) => { n.classList.remove('csrp-av-clip'); delete n.dataset.csrpAvFramed; });

      CSRP.cases.unmountOverlay();

      document.querySelectorAll('div.grid.grid-cols-5.items-center[style*="display"]').forEach((r) => { r.style.display = ''; });

      document.querySelectorAll('.csrp-creator-card').forEach((n) => n.classList.remove('csrp-creator-card', 'csrp-creator-lobby'));

      document.querySelectorAll('.csrp-lobby-card').forEach((n) => { n.classList.remove('csrp-lobby-card'); n.style.cursor = ''; });
      return;
    }
    uiBusy = true;
    try {
      CSRP.playerBadges.tick();
      CSRP.notes.tick();
      CSRP.inventory.tick();
      CSRP.trades.tick();
      CSRP.cases.tick();
      CSRP.leaderboardSearch.tick();
      CSRP.eloTracker.tick();
      await CSRP.matchOverlay.tick();
      await CSRP.winProbability.tick();
    } catch (err) {
      
    } finally {
      uiBusy = false;
    }
  }

  function applyTheme(cfg) {
    document.documentElement.setAttribute('data-csrp-theme', cfg.theme || 'mask');
  }

  async function boot() {
    await CSRP.store.load();

    document.querySelectorAll('.csrp-mo, .csrp-mo-float').forEach((n) => n.remove());
    applyTheme(CSRP.store.get());
    CSRP.sound.init(CSRP.store.get());
    injectHook();

    CSRP.api.friends().then((f) => {
      if (Array.isArray(f)) CSRP._friendsCache = f;
    });


    CSRP.store.onChange((cfg) => {
      applyTheme(cfg);
      CSRP.sound.applyConfig(cfg);

      CSRP.playerBadges.reset();
      CSRP.winProbability.reset();
    });

    setInterval(fastLoop, 500);
    setInterval(uiLoop, 1200);


    let pending = null;
    new MutationObserver(() => {
      clearTimeout(pending);
      pending = setTimeout(uiLoop, 250);
    }).observe(document.body, { childList: true, subtree: true });

    fastLoop();
    uiLoop();
    CSRP.log('ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
