/* CSR+ — content-script entry point. Boots the store, injects the page-world
 * socket hook, and drives a throttled scheduler over all features. */
(() => {
  'use strict';
  const CSRP = window.CSRP;
  if (!CSRP || window.__csrpMain) return;
  window.__csrpMain = true;

  // ── inject page-world socket hook ──────────────────────────────────────
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
    // Persist the logged-in user's id so detached extension pages (e.g. the
    // trade composer) can load *our* inventory the same way they load a
    // friend's — via /users/{id}/inventory.
    const myId = e.detail && e.detail.myId;
    if (myId) {
      try { chrome.storage.local.set({ csrpMyId: String(myId) }); } catch { /* ignore */ }
    }
  });

  // ── fast loop: auto-accept + map ban need low latency ──────────────────
  function fastLoop() {
    if (CSRP.store.get('masterEnabled') === false) return;
    try {
      CSRP.autoAccept.tick();
      CSRP.mapBan.tick();
      CSRP.serverCopy.tick();
    } catch (err) {
      /* never let a tick kill the loop */
    }
  }

  // ── slow loop: UI decoration (network-bound, heavier) ──────────────────
  let uiBusy = false;
  async function uiLoop() {
    if (uiBusy) return;
    if (CSRP.store.get('masterEnabled') === false) {
      // Tear down injected UI when the extension is master-disabled.
      document.querySelectorAll('.csrp-badge-wrap, .csrp-wp, .csrp-mo, .csrp-tag-chip, #csrp-watch-inv, #csrp-open-trades, #csrp-lb-search, .csrp-lb-empty, .csrp-lb-remote, .csrp-cf').forEach((n) => n.remove());
      // Un-hide any leaderboard rows we filtered.
      document.querySelectorAll('div.grid.grid-cols-5.items-center[style*="display"]').forEach((r) => { r.style.display = ''; });
      // Drop the creator glow classes off any cards/lobby slots.
      document.querySelectorAll('.csrp-creator-card').forEach((n) => n.classList.remove('csrp-creator-card', 'csrp-creator-lobby'));
      // Drop the lobby click affordance styling.
      document.querySelectorAll('.csrp-lobby-card').forEach((n) => { n.classList.remove('csrp-lobby-card'); n.style.cursor = ''; });
      return;
    }
    uiBusy = true;
    try {
      CSRP.playerBadges.tick();
      CSRP.notes.tick();
      CSRP.inventory.tick();
      CSRP.trades.tick();
      CSRP.leaderboardSearch.tick();
      CSRP.eloTracker.tick();
      await CSRP.matchOverlay.tick();
      await CSRP.winProbability.tick();
    } catch (err) {
      /* swallow */
    } finally {
      uiBusy = false;
    }
  }

  function applyTheme(cfg) {
    document.documentElement.setAttribute('data-csrp-theme', cfg.theme || 'mask');
  }

  async function boot() {
    await CSRP.store.load();
    // Clean up any panels from a previous build (renamed .csrp-mo → .csrp-mf).
    document.querySelectorAll('.csrp-mo, .csrp-mo-float').forEach((n) => n.remove());
    applyTheme(CSRP.store.get());
    CSRP.sound.init(CSRP.store.get());
    injectHook();

    CSRP.api.friends().then((f) => {
      if (Array.isArray(f)) CSRP._friendsCache = f;
    });

    // React to live setting changes that require a UI rebuild.
    CSRP.store.onChange((cfg) => {
      applyTheme(cfg);
      CSRP.sound.applyConfig(cfg);
      // statsPeriod change → rebuild badges/probability with new window.
      CSRP.playerBadges.reset();
      CSRP.winProbability.reset();
    });

    setInterval(fastLoop, 500);
    setInterval(uiLoop, 1200);

    // Re-run UI promptly on DOM mutations (route changes, lobby updates).
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
