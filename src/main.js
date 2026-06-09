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
  });

  // ── fast loop: auto-accept + map ban need low latency ──────────────────
  function fastLoop() {
    if (CSRP.store.get('masterEnabled') === false) return;
    try {
      CSRP.autoAccept.tick();
      CSRP.mapBan.tick();
      CSRP.serverCopy.tick();
      CSRP.autoSell.tick(); // self-throttled; runs on any page when enabled+armed
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
      document.querySelectorAll('.csrp-badge-wrap, .csrp-wp, .csrp-mo, .csrp-tag-chip, #csrp-watch-inv').forEach((n) => n.remove());
      return;
    }
    uiBusy = true;
    try {
      CSRP.playerBadges.tick();
      CSRP.notes.tick();
      CSRP.inventory.tick();
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
