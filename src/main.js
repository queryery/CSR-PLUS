(() => {
  'use strict';
  const CSRP = window.CSRP;
  if (!CSRP) {
    console.error('[CSR+] Startup failed: core library was not loaded.');
    return;
  }
  if (window.__csrpMain) return;
  window.__csrpMain = true;


  function injectHook() {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('src/inject/socketHook.js');
    s.onload = () => s.remove();
    s.onerror = () => {
      console.error('[CSR+] Page socket hook failed to load:', s.src);
      s.remove();
    };
    (document.head || document.documentElement).appendChild(s);
  }

  CSRP._matchData = null;
  CSRP._friendsCache = [];
  CSRP._myId = null;
  function storeMyId(myId) {
    if (!myId) return;
    CSRP._myId = String(myId);
    try { chrome.storage.local.set({ csrpMyId: String(myId) }); } catch { }
  }
  try { chrome.storage.local.get(['csrpMyId'], (d) => { if (d.csrpMyId && !CSRP._myId) CSRP._myId = String(d.csrpMyId); }); } catch { }
  window.addEventListener('csrp:myid', (e) => storeMyId(e.detail && e.detail.myId));
  window.addEventListener('csrp:matchdata', (e) => {
    CSRP._matchData = e.detail;
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
  async function runUiFeature(name, tick) {
    try {
      await tick();
    } catch (err) {
      console.error(`[CSR+] ${name} injection failed`, err);
    }
  }

  async function uiLoop() {
    if (uiBusy) return;
    if (CSRP.store.get('masterEnabled') === false) {

      document.querySelectorAll('.csrp-badge-wrap, .csrp-wp, .csrp-mo, .csrp-tag-chip, #csrp-watch-inv, #csrp-open-trades, #csrp-open-cases, #csrp-lb-search, .csrp-lb-empty, .csrp-lb-remote, .csrp-st-btn, .csrp-report-btn, .csrp-tier-badge').forEach((n) => n.remove());

      CSRP.cases.unmountOverlay();

      document.querySelectorAll('div.grid.grid-cols-5.items-center[style*="display"]').forEach((r) => { r.style.display = ''; });

      document.querySelectorAll('.csrp-lobby-card').forEach((n) => { n.classList.remove('csrp-lobby-card'); n.style.cursor = ''; });

      CSRP.profileCustom?.cleanup();
      return;
    }
    uiBusy = true;
    try {
      await runUiFeature('Player badges', () => CSRP.playerBadges.tick());
      await runUiFeature('Notes', () => CSRP.notes.tick());
      await runUiFeature('Inventory', () => CSRP.inventory.tick());
      await runUiFeature('Trades', () => CSRP.trades.tick());
      await runUiFeature('Cases', () => CSRP.cases.tick());
      await runUiFeature('Leaderboard search', () => CSRP.leaderboardSearch.tick());
      await runUiFeature('ELO tracker', () => CSRP.eloTracker.tick());
      await runUiFeature('Profile customization', () => CSRP.profileCustom.tick());
      await runUiFeature('Report button', () => CSRP.reportButton.tick());
      await runUiFeature('Match overlay', () => CSRP.matchOverlay.tick());
      await runUiFeature('Win probability', () => CSRP.winProbability.tick());
    } finally {
      uiBusy = false;
    }
  }

  function applyTheme(cfg) {
    document.documentElement.setAttribute('data-csrp-theme', cfg.theme || 'mask');
  }

  async function boot() {
    try {
      await CSRP.store.load();
    } catch (err) {
      console.error('[CSR+] Startup failed while loading settings', err);
      return;
    }

    document.querySelectorAll('.csrp-mo, .csrp-mo-float').forEach((n) => n.remove());
    applyTheme(CSRP.store.get());
    CSRP.sound.init(CSRP.store.get());
    injectHook();

    CSRP.api.friends().then((f) => {
      if (Array.isArray(f)) CSRP._friendsCache = f;
    }).catch(() => { });

    CSRP.api.me().then((u) => {
      if (u && u.id && !u.message) storeMyId(u.id);
    }).catch(() => {});


    CSRP.store.onChange((cfg) => {
      applyTheme(cfg);
      CSRP.sound.applyConfig(cfg);

      CSRP.playerBadges.reset();
      CSRP.winProbability.reset();
    });

    setInterval(fastLoop, 500);
    setInterval(uiLoop, 1200);

    for (const delay of [350, 900, 1800, 3500, 6000]) setTimeout(uiLoop, delay);


    let pending = null;
    new MutationObserver(() => {
      clearTimeout(pending);
      pending = setTimeout(uiLoop, 250);
    }).observe(document.body, { childList: true, subtree: true });

    fastLoop();
    uiLoop();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
