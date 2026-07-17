(() => {
  "use strict";
  const CSRP = window.CSRP;
  if (!CSRP) {
    console.error("[CSR+] Startup failed: core library was not loaded.");
    return;
  }
  if (window.__csrpMain) return;
  window.__csrpMain = true;
  function injectHook() {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("src/inject/socketHook.js");
    s.onload = () => s.remove();
    s.onerror = () => {
      console.error("[CSR+] Page socket hook failed to load:", s.src);
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
    try {
      chrome.storage.local.set({
        csrpMyId: String(myId)
      });
    } catch {}
  }
  try {
    chrome.storage.local.get([ "csrpMyId" ], d => {
      if (d.csrpMyId && !CSRP._myId) CSRP._myId = String(d.csrpMyId);
    });
  } catch {}
  window.addEventListener("csrp:myid", e => storeMyId(e.detail && e.detail.myId));
  window.addEventListener("csrp:matchdata", e => {
    CSRP._matchData = e.detail;
  });
  CSRP._party = null;
  window.addEventListener("csrp:partydata", e => {
    CSRP._party = e.detail || null;
  });
  CSRP._inQueue = false;
  function detectQueue() {
    let joinSeen = false, searchSeen = false;
    for (const btn of document.querySelectorAll("button.rounded-full.bg-theme-primary.px-12")) {
      const t = (btn.textContent || "").trim();
      if (/^join queue$/i.test(t)) {
        joinSeen = true;
        continue;
      }
      if (/leave queue|searching|cancel|in queue|matchmaking|\d{1,2}:\d{2}/i.test(t)) searchSeen = true;
    }
    if (searchSeen) return true;
    if (joinSeen) return false;
    return CSRP._inQueue;
  }
  let partyLatch = false;
  function detectInParty() {
    if (CSRP._party && Number.isFinite(CSRP._party.size)) {
      partyLatch = CSRP._party.size >= 2;
      return partyLatch;
    }
    const slots = document.querySelectorAll('div.rounded-2xl img[alt="Avatar"][width="72"]');
    if (slots.length) partyLatch = slots.length >= 2;
    return partyLatch;
  }
  CSRP.inParty = detectInParty;
  function fastPlayClass() {
    if (CSRP.store && CSRP.store.get && CSRP.store.get("masterEnabled") === false) {
      document.documentElement.classList.remove("csrp-play", "csrp-in-queue");
      return;
    }
    let onPlay = false;
    for (const btn of document.querySelectorAll("button.rounded-full.bg-theme-primary.px-12")) {
      const t = (btn.textContent || "").trim();
      if (/join queue|leave queue|searching|in queue|matchmaking|\d{1,2}:\d{2}/i.test(t)) {
        onPlay = true;
        break;
      }
    }
    document.documentElement.classList.toggle("csrp-play", onPlay);
    if (onPlay) document.documentElement.classList.toggle("csrp-in-queue", !!CSRP._inQueue); else document.documentElement.classList.remove("csrp-in-queue");
  }
  CSRP._fastPlayClass = fastPlayClass;
  const playRecheck = () => {
    try {
      fastPlayClass();
    } catch {}
  };
  window.addEventListener("focus", playRecheck);
  window.addEventListener("pageshow", playRecheck);
  document.addEventListener("visibilitychange", playRecheck);
  setInterval(playRecheck, 700);
  playRecheck();
  function fastLoop() {
    if (CSRP.store.get("masterEnabled") === false) return;
    try {
      fastPlayClass();
      CSRP.autoAccept.tick();
      CSRP.mapBan.tick();
      CSRP.serverCopy.tick();
      CSRP.cases.fastTick();
    } catch (err) {}
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
    if (CSRP.store.get("masterEnabled") === false) {
      document.querySelectorAll(".csrp-badge-wrap, .csrp-tip-body, .csrp-wp, .csrp-mo, .csrp-tag-chip, #csrp-watch-inv, #csrp-open-trades, #csrp-open-cases, #csrp-lb-search, .csrp-lb-empty, .csrp-lb-remote, .csrp-st-btn, .csrp-report-btn, .csrp-tier-badge, #csrp-queue-panel").forEach(n => n.remove());
      CSRP.cases.unmountOverlay();
      document.querySelectorAll('div.grid.grid-cols-5.items-center[style*="display"]').forEach(r => {
        r.style.display = "";
      });
      document.querySelectorAll(".csrp-lobby-card").forEach(n => {
        n.classList.remove("csrp-lobby-card");
        n.style.cursor = "";
      });
      CSRP.profileCustom?.cleanup();
      document.documentElement.classList.remove("csrp-play", "csrp-in-queue");
      return;
    }
    uiBusy = true;
    try {
      await runUiFeature("Player badges", () => CSRP.playerBadges.tick());
      await runUiFeature("Notes", () => CSRP.notes.tick());
      await runUiFeature("Inventory", () => CSRP.inventory.tick());
      await runUiFeature("Trades", () => CSRP.trades.tick());
      await runUiFeature("Cases", () => CSRP.cases.tick());
      await runUiFeature("Leaderboard search", () => CSRP.leaderboardSearch.tick());
      await runUiFeature("ELO tracker", () => CSRP.eloTracker.tick());
      await runUiFeature("Profile customization", () => CSRP.profileCustom.tick());
      await runUiFeature("Play tab", () => CSRP.playTab.tick());
      await runUiFeature("Report button", () => CSRP.reportButton.tick());
      await runUiFeature("Match overlay", () => CSRP.matchOverlay.tick());
      await runUiFeature("Win probability", () => CSRP.winProbability.tick());
    } finally {
      uiBusy = false;
    }
  }
  function applyTheme(cfg) {
    document.documentElement.setAttribute("data-csrp-theme", cfg.theme || "mask");
  }
  async function boot() {
    try {
      await CSRP.store.load();
    } catch (err) {
      console.error("[CSR+] Startup failed while loading settings", err);
      return;
    }
    document.querySelectorAll(".csrp-mo, .csrp-mo-float").forEach(n => n.remove());
    applyTheme(CSRP.store.get());
    CSRP.sound.init(CSRP.store.get());
    injectHook();
    CSRP.api.friends().then(f => {
      if (Array.isArray(f)) CSRP._friendsCache = f;
    }).catch(() => {});
    CSRP.api.me().then(u => {
      if (u && u.id && !u.message) {
        storeMyId(u.id);
        CSRP._myName = u.name || null;
      }
    }).catch(() => {});
    try {
      const saved = JSON.parse(sessionStorage.getItem("csrpInQueue") || "null");
      if (saved && Date.now() - saved.t < 9e4) CSRP._inQueue = !!saved.q;
    } catch {}
    function persistQueue() {
      try {
        sessionStorage.setItem("csrpInQueue", JSON.stringify({
          q: CSRP._inQueue,
          t: Date.now()
        }));
      } catch {}
    }
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      try {
        CSRP.pro?.track({
          name: CSRP._myName,
          inQueue: CSRP._inQueue
        });
      } catch {}
    };
    beat();
    let beatTimer = null;
    function scheduleBeat() {
      clearInterval(beatTimer);
      beatTimer = setInterval(beat, CSRP._inQueue ? 2e4 : 45e3);
    }
    scheduleBeat();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") beat();
    });
    setInterval(() => {
      const q = detectQueue();
      if (q !== CSRP._inQueue) {
        CSRP._inQueue = q;
        persistQueue();
        scheduleBeat();
        beat();
      }
      try {
        window.dispatchEvent(new CustomEvent("csrp:pull"));
      } catch {}
    }, 2500);
    const CLOUD_MARK = "csrpCloudRestored";
    function collectSettings() {
      return new Promise(resolve => {
        const storeCfg = {};
        const all = CSRP.store.get();
        for (const k of Object.keys(CSRP.DEFAULTS)) if (k in all) storeCfg[k] = all[k];
        try {
          chrome.storage.local.get([ "csrpCustom" ], d => {
            let custom = d.csrpCustom || null;
            if (custom) {
              custom = {
                ...custom
              };
              delete custom.banner;
            }
            resolve({
              store: storeCfg,
              custom
            });
          });
        } catch {
          resolve({
            store: storeCfg,
            custom: null
          });
        }
      });
    }
    let backupTimer = null;
    async function cloudBackup() {
      try {
        if (!CSRP.pro || !await CSRP.pro.isSignedIn()) return;
        CSRP.pro.saveSettings(await collectSettings());
      } catch {}
    }
    const scheduleBackup = () => {
      clearTimeout(backupTimer);
      backupTimer = setTimeout(cloudBackup, 4e3);
    };
    async function cloudRestore() {
      try {
        const marked = await new Promise(r => chrome.storage.local.get([ CLOUD_MARK ], d => r(!!(d && d[CLOUD_MARK]))));
        if (marked) return;
        if (!CSRP.pro || !await CSRP.pro.isSignedIn()) return;
        const resp = await CSRP.pro.loadSettings();
        if (!resp.ok) return;
        const s = resp.data && resp.data.settings;
        if (s) {
          if (s.store && typeof s.store === "object") {
            for (const k of Object.keys(CSRP.DEFAULTS)) if (k in s.store) await CSRP.store.set(k, s.store[k]);
          }
          if (s.custom && typeof s.custom === "object") {
            await new Promise(r => chrome.storage.local.get([ "csrpCustom" ], d => {
              const merged = {
                ...s.custom
              };
              if (d.csrpCustom && d.csrpCustom.banner) merged.banner = d.csrpCustom.banner;
              chrome.storage.local.set({
                csrpCustom: merged
              }, r);
            }));
          }
          CSRP.log("settings restored from cloud backup");
        }
        chrome.storage.local.set({
          [CLOUD_MARK]: true
        });
      } catch {}
    }
    cloudRestore().then(() => scheduleBackup());
    try {
      chrome.storage.onChanged.addListener((c, areaName) => {
        if (areaName === "local" && c.csrpCustom) scheduleBackup();
        if (areaName === "local" && c.csrpProToken && c.csrpProToken.newValue) {
          cloudRestore();
        }
      });
    } catch {}
    CSRP.store.onChange(cfg => {
      applyTheme(cfg);
      CSRP.sound.applyConfig(cfg);
      CSRP.playerBadges.reset();
      CSRP.winProbability.reset();
      scheduleBackup();
    });
    setInterval(fastLoop, 500);
    setInterval(uiLoop, 1200);
    for (const delay of [ 350, 900, 1800, 3500, 6e3 ]) setTimeout(uiLoop, delay);
    let pending = null;
    new MutationObserver(() => {
      try {
        fastPlayClass();
      } catch {}
      clearTimeout(pending);
      pending = setTimeout(uiLoop, 250);
    }).observe(document.body, {
      childList: true,
      subtree: true
    });
    fastLoop();
    uiLoop();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
