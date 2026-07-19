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
    let joinSeen = false, searchSeen = false, limboSeen = false;
    for (const btn of document.querySelectorAll("button.rounded-full.bg-theme-primary.px-12")) {
      const t = (btn.textContent || "").trim();
      if (/^join queue$/i.test(t)) {
        joinSeen = true;
        continue;
      }
      if (/leave queue|searching|cancel|in queue|matchmaking|\d{1,2}:\d{2}/i.test(t)) searchSeen = true;
      else if (/not available|unavailable/i.test(t)) limboSeen = true;
    }
    if (searchSeen) return true;
    if (limboSeen) return CSRP._inQueue;
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
      if (/join queue|leave queue|searching|in queue|matchmaking|ready|\d{1,2}:\d{2}/i.test(t) || (CSRP._inQueue && /not available|unavailable/i.test(t))) {
        onPlay = true;
        break;
      }
    }
    if (!onPlay && document.querySelector('div.rounded-2xl img[alt="Avatar"][width="72"]')) onPlay = true;
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
  let lastQueueClick = 0;
  document.addEventListener("click", e => {
    const btn = e.target && e.target.closest ? e.target.closest("button.rounded-full.bg-theme-primary.px-12") : null;
    if (!btn) return;
    const now = Date.now();
    if (now - lastQueueClick < 900) {
      e.preventDefault();
      e.stopPropagation();
      btn.classList.add("csrp-q-cool");
      setTimeout(() => btn.classList.remove("csrp-q-cool"), 450);
      return;
    }
    lastQueueClick = now;
  }, true);
  document.addEventListener("click", e => {
    const a = e.target && e.target.closest ? e.target.closest('a[href^="/user/"], a[href^="/app/user/"]') : null;
    if (!a) return;
    if (!a.closest("div.rounded-lg.border-2.bg-theme-black")) return;
    const m = (a.getAttribute("href") || "").match(/user\/(\d{5,25})/);
    if (!m) return;
    e.preventDefault();
    e.stopPropagation();
    CSRP.notes?.openProfile(m[1]);
  }, true);
  function elapsedText() {
    const real = Math.max(0, Math.floor((Date.now() - CSRP._qStart) / 1e3));
    return String(Math.floor(real / 60)).padStart(2, "0") + ":" + String(real % 60).padStart(2, "0");
  }
  function clearAllLimboClocks() {
    document.querySelectorAll("button.csrp-q-limbo").forEach(clearLimboClock);
  }
  function syncQueueTimer() {
    if (!CSRP._inQueue || !CSRP._qStart) {
      clearAllLimboClocks();
      return;
    }
    if (CSRP.dom.findMatchFoundModal && CSRP.dom.findMatchFoundModal()) return;
    for (const btn of document.querySelectorAll("button.rounded-full.bg-theme-primary.px-12")) {
      const clockEl = btn.querySelector(":scope > .csrp-q-clock");
      const t = [ ...btn.childNodes ].filter(n => n !== clockEl).map(n => n.textContent || "").join("").trim();
      const m = t.match(/^(\d{1,2}):(\d{2})$/);
      if (m) {
        clearLimboClock(btn);
        const real = Math.max(0, Math.floor((Date.now() - CSRP._qStart) / 1e3));
        if (Math.abs(+m[1] * 60 + +m[2] - real) <= 2) continue;
        const node = [ ...btn.childNodes ].find(n => n.nodeType === 3 && /\d{1,2}:\d{2}/.test(n.nodeValue));
        if (node) node.nodeValue = node.nodeValue.replace(/\d{1,2}:\d{2}/, elapsedText());
        continue;
      }
      if (/not available|unavailable/i.test(t)) showLimboClock(btn); else clearLimboClock(btn);
    }
  }
  function showLimboClock(btn) {
    btn.classList.add("csrp-q-limbo");
    let clock = btn.querySelector(":scope > .csrp-q-clock");
    if (!clock) {
      clock = document.createElement("span");
      clock.className = "csrp-q-clock";
      btn.appendChild(clock);
    }
    clock.textContent = elapsedText();
  }
  function clearLimboClock(btn) {
    if (!btn.classList.contains("csrp-q-limbo")) return;
    btn.classList.remove("csrp-q-limbo");
    const clock = btn.querySelector(":scope > .csrp-q-clock");
    if (clock) clock.remove();
  }
  function fixUserLinks() {
    document.querySelectorAll('a[href^="/user/"]').forEach(a => {
      a.setAttribute("href", "/app" + a.getAttribute("href"));
    });
  }
  function fastLoop() {
    if (CSRP.store.get("masterEnabled") === false) return;
    try {
      fastPlayClass();
      fixUserLinks();
      syncQueueTimer();
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
      document.querySelectorAll(".csrp-badge-wrap, .csrp-tip-body, .csrp-wp, .csrp-mo, .csrp-tag-chip, #csrp-watch-inv, #csrp-open-trades, #csrp-open-cases, #csrp-lb-search, .csrp-lb-empty, .csrp-lb-remote, .csrp-st-btn, .csrp-report-btn, .csrp-tier-badge, #csrp-queue-panel, .csrp-q-clock").forEach(n => n.remove());
      document.querySelectorAll("button.csrp-q-limbo").forEach(n => n.classList.remove("csrp-q-limbo"));
      CSRP.cases.unmountOverlay();
      document.querySelectorAll('div.grid.grid-cols-5.items-center[style*="display"]').forEach(r => {
        r.style.display = "";
      });
      CSRP.playerBadges.resetLobby?.();
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
  function applyRemoteFx(css) {
    if (!css) return;
    let st = document.getElementById("csrp-remote-fx");
    if (!st) {
      st = document.createElement("style");
      st.id = "csrp-remote-fx";
      (document.head || document.documentElement).appendChild(st);
    }
    if (st.textContent !== css) st.textContent = css;
  }
  function loadRemoteFx() {
    try {
      chrome.storage.local.get([ "csrpFx" ], d => {
        const fx = d.csrpFx;
        if (fx && fx.css) applyRemoteFx(fx.css);
        if (fx && Date.now() - (fx.ts || 0) < 36e5) return;
        chrome.runtime.sendMessage({
          type: "csrp:fx"
        }, resp => {
          if (chrome.runtime.lastError || !resp || !resp.ok) return;
          applyRemoteFx(resp.css);
          chrome.storage.local.set({
            csrpFx: {
              css: resp.css || "",
              manifest: resp.manifest || null,
              ts: Date.now()
            }
          });
        });
      });
    } catch {}
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
    loadRemoteFx();
    CSRP.api.friends().then(f => {
      if (Array.isArray(f)) CSRP._friendsCache = f;
    }).catch(() => {});
    CSRP.api.me().then(u => {
      if (u && u.id && !u.message) {
        storeMyId(u.id);
        CSRP._myName = u.name || null;
      }
    }).catch(() => {});
    CSRP._qStart = 0;
    function persistQueue() {
      try {
        chrome.storage.local.set({
          csrpQueue: {
            q: CSRP._inQueue,
            start: CSRP._qStart,
            n: CSRP._myName || null,
            t: Date.now()
          }
        });
      } catch {}
    }
    try {
      chrome.storage.local.get([ "csrpQueue" ], d => {
        const s = d.csrpQueue;
        if (s && s.q && Date.now() - (s.t || 0) < 6e5) {
          CSRP._inQueue = true;
          CSRP._qStart = s.start || Date.now();
          scheduleBeat();
          beat();
        }
      });
    } catch {}
    try {
      chrome.storage.onChanged.addListener((c, area) => {
        if (area !== "local" || !c.csrpQueue || !c.csrpQueue.newValue) return;
        const s = c.csrpQueue.newValue;
        if (!!s.q !== CSRP._inQueue) {
          CSRP._inQueue = !!s.q;
          CSRP._qStart = s.q ? s.start || Date.now() : 0;
          scheduleBeat();
        } else if (s.q && s.start && Math.abs((s.start || 0) - CSRP._qStart) > 1500) {
          CSRP._qStart = Math.min(CSRP._qStart || s.start, s.start);
        }
      });
    } catch {}
    let lastSocketQ = 0;
    function setQueueState(q) {
      if (q === CSRP._inQueue) {
        if (q && !CSRP._qStart) {
          CSRP._qStart = Date.now();
          persistQueue();
        }
        return;
      }
      CSRP._inQueue = q;
      CSRP._qStart = q ? CSRP._qStart || Date.now() : 0;
      persistQueue();
      scheduleBeat();
      beat(true);
    }
    window.addEventListener("csrp:queuedata", e => {
      const d = e.detail || {};
      lastSocketQ = Date.now();
      setQueueState(!!d.inQueue);
    });
    const beat = force => {
      if (!force && !CSRP._inQueue && document.visibilityState !== "visible") return;
      try {
        CSRP.pro?.track({
          name: CSRP._myName,
          inQueue: CSRP._inQueue
        });
      } catch {}
      if (CSRP._inQueue) persistQueue();
    };
    beat();
    let beatTimer = null;
    function scheduleBeat() {
      clearInterval(beatTimer);
      beatTimer = setInterval(beat, CSRP._inQueue ? 2e4 : 45e3);
    }
    scheduleBeat();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" || CSRP._inQueue) beat();
    });
    setInterval(() => {
      if (Date.now() - lastSocketQ > 1e4) setQueueState(detectQueue());
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
