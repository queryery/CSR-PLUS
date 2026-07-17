"use strict";

const BASE = "https://api.csrestored.fun";

const PRO_BASE = "https://europe-west1-csr-plus-331c8.cloudfunctions.net/api";

function quoteBigInts(text) {
  return text.replace(/([:\[,]\s*)(-?\d{16,})(?=\s*[,}\]])/g, '$1"$2"');
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === "csrp:pro") {
    const path = String(msg.path || "");
    if (!path.startsWith("/")) {
      sendResponse({
        ok: false,
        error: "bad path"
      });
      return true;
    }
    const method = String(msg.method || "GET").toUpperCase();
    const init = {
      method,
      headers: {}
    };
    if (msg.token) init.headers["Authorization"] = "Bearer " + String(msg.token);
    if (msg.body != null && method !== "GET" && method !== "HEAD") {
      init.headers["content-type"] = "application/json";
      init.body = typeof msg.body === "string" ? msg.body : JSON.stringify(msg.body);
    }
    const timeoutMs = Number(msg.timeoutMs) > 0 ? Number(msg.timeoutMs) : method === "GET" ? 2e4 : 6e4;
    let timedOut = false;
    const ctrl = new AbortController;
    init.signal = ctrl.signal;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, timeoutMs);
    fetch(PRO_BASE + path, init).then(async r => {
      clearTimeout(timer);
      let data = null;
      try {
        const text = await r.text();
        try {
          data = JSON.parse(quoteBigInts(text));
        } catch {
          data = text;
        }
      } catch {}
      if (r.ok) return sendResponse({
        ok: true,
        data,
        status: r.status
      });
      sendResponse({
        ok: false,
        status: r.status,
        error: data && data.error || "HTTP " + r.status,
        data
      });
    }).catch(err => {
      clearTimeout(timer);
      if (timedOut) return sendResponse({
        ok: false,
        error: "timeout",
        timeout: true
      });
      sendResponse({
        ok: false,
        error: String(err && err.message || err)
      });
    });
    return true;
  }
  if (msg.type === "csrp:notify") {
    try {
      chrome.notifications.create("csrp-" + Date.now(), {
        type: "basic",
        iconUrl: chrome.runtime.getURL("assets/icon128.png"),
        title: String(msg.title || "CSR+"),
        message: String(msg.message || ""),
        priority: 2
      });
    } catch (e) {}
    return;
  }
  if (msg.type !== "csrp:api") return;
  const path = String(msg.path || "");
  if (!path.startsWith("/")) {
    sendResponse({
      ok: false,
      error: "bad path"
    });
    return;
  }
  const method = String(msg.method || "GET").toUpperCase();
  const init = {
    method,
    credentials: "include"
  };
  if (msg.body != null && method !== "GET" && method !== "HEAD") {
    init.headers = {
      "content-type": "application/json"
    };
    init.body = typeof msg.body === "string" ? msg.body : JSON.stringify(msg.body);
  }
  const timeoutMs = Number(msg.timeoutMs) > 0 ? Number(msg.timeoutMs) : method === "GET" ? 2e4 : 25e3;
  let timedOut = false;
  const ctrl = new AbortController;
  init.signal = ctrl.signal;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  fetch(BASE + path, init).then(async r => {
    clearTimeout(timer);
    let data = null;
    try {
      const text = await r.text();
      try {
        const safe = text.replace(/([:\[,]\s*)(-?\d{16,})(?=\s*[,}\]])/g, '$1"$2"');
        data = JSON.parse(safe);
      } catch {
        data = text;
      }
    } catch {}
    if (r.ok) return sendResponse({
      ok: true,
      data,
      status: r.status
    });
    sendResponse({
      ok: false,
      status: r.status,
      error: "HTTP " + r.status,
      data
    });
  }).catch(err => {
    clearTimeout(timer);
    if (timedOut) return sendResponse({
      ok: false,
      error: "timeout",
      timeout: true
    });
    sendResponse({
      ok: false,
      error: String(err && err.message || err)
    });
  });
  return true;
});

chrome.notifications && chrome.notifications.onClicked.addListener(() => {
  chrome.tabs.query({
    url: "https://csrestored.fun/*"
  }, tabs => {
    if (tabs && tabs[0]) chrome.tabs.update(tabs[0].id, {
      active: true
    });
  });
});

let _fbQueue = {
  users: [],
  count: 0,
  at: 0
};

let _fbReady = false;

function broadcastQueue() {
  try {
    chrome.tabs.query({
      url: "https://csrestored.fun/*"
    }, tabs => {
      for (const t of tabs || []) {
        chrome.tabs.sendMessage(t.id, {
          type: "csrp:queue",
          queue: _fbQueue
        }, () => void chrome.runtime.lastError);
      }
    });
  } catch {}
}

function initQueueListener() {
  if (_fbReady) return;
  try {
    importScripts("vendor/firebase-firestore.bundle.js");
    const FB = globalThis.CSRPFirebase;
    if (!FB) throw new Error("firebase bundle missing");
    const app = FB.initializeApp({
      projectId: "csr-plus-331c8"
    });
    const fs = FB.initializeFirestore(app, {
      experimentalForceLongPolling: true
    });
    FB.onSnapshot(FB.doc(fs, "public/queue"), snap => {
      const d = snap && snap.data && snap.data() || {};
      _fbQueue = {
        users: Array.isArray(d.users) ? d.users.slice(0, 25) : [],
        count: Number.isFinite(d.count) ? d.count : Array.isArray(d.users) ? d.users.length : 0,
        at: Date.now()
      };
      broadcastQueue();
    }, err => {
      console.warn("[CSR+] queue listener error", err && err.message);
    });
    _fbReady = true;
  } catch (e) {
    console.warn("[CSR+] queue listener unavailable, clients will poll", e && e.message);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "csrp:queue:get") {
    initQueueListener();
    sendResponse({
      ok: true,
      queue: _fbQueue,
      live: _fbReady
    });
    return true;
  }
});

initQueueListener();
