(() => {
  "use strict";
  const CSRP = window.CSRP = window.CSRP || {};
  const {h} = CSRP.dom;
  const PANEL_ID = "csrp-queue-panel";
  const REFRESH_MS = 7e3;
  let lastFetch = 0;
  let lastStats = null;
  let fetching = false;
  let pushedQueue = null;
  let lastPush = 0;
  const PUSH_FRESH_MS = 3e4;
  function requestQueueOnce() {
    try {
      chrome.runtime.sendMessage({
        type: "csrp:queue:get"
      }, resp => {
        if (chrome.runtime.lastError || !resp) return;
        if (resp.queue) {
          pushedQueue = resp.queue;
          lastPush = Date.now();
          render();
        }
      });
    } catch {}
  }
  try {
    chrome.runtime.onMessage.addListener(msg => {
      if (msg && msg.type === "csrp:queue" && msg.queue) {
        pushedQueue = msg.queue;
        lastPush = Date.now();
        render();
      }
    });
  } catch {}
  function findPlayAnchor() {
    for (const btn of document.querySelectorAll("button.rounded-full.bg-theme-primary.px-12")) {
      const t = (btn.textContent || "").trim();
      if (/join queue|leave queue|searching|in queue|\d{1,2}:\d{2}/i.test(t)) return btn;
    }
    return null;
  }
  function refreshStats() {
    if (fetching || !CSRP.pro || !CSRP.pro.stats) return;
    const pushFresh = Date.now() - lastPush < PUSH_FRESH_MS;
    const interval = pushFresh ? 6e4 : REFRESH_MS;
    if (Date.now() - lastFetch < interval) return;
    fetching = true;
    CSRP.pro.stats().then(resp => {
      fetching = false;
      lastFetch = Date.now();
      if (resp && resp.ok && resp.data) lastStats = resp.data;
      render();
    }).catch(() => {
      fetching = false;
      lastFetch = Date.now();
    });
  }
  function currentQueue() {
    if (pushedQueue && Date.now() - lastPush < PUSH_FRESH_MS) return pushedQueue.users || [];
    return lastStats && lastStats.queue || [];
  }
  function render() {
    const anchor = findPlayAnchor();
    const stale = document.getElementById(PANEL_ID);
    if (!anchor) {
      if (stale) stale.remove();
      return;
    }
    const statsLine = anchor.nextElementSibling;
    const mount = statsLine || anchor.parentElement;
    if (!mount) return;
    let panel = stale;
    if (!panel) {
      panel = h("div", {
        id: PANEL_ID,
        class: "csrp-qp"
      }, [ h("div", {
        class: "csrp-qp-h"
      }, [ h("span", {
        class: "csrp-qp-dot"
      }), h("span", {
        class: "csrp-qp-t"
      }, "CSR+ users in queue"), h("span", {
        class: "csrp-qp-n"
      }, "") ]), h("div", {
        class: "csrp-qp-list"
      }) ]);
      mount.insertAdjacentElement("afterend", panel);
    }
    const listEl = panel.querySelector(".csrp-qp-list");
    const nEl = panel.querySelector(".csrp-qp-n");
    const queue = currentQueue();
    nEl.textContent = String(queue.length);
    panel.classList.toggle("csrp-qp-empty", !queue.length);
    const sig = queue.map(q => q.id).join(",");
    if (listEl.dataset.sig === sig) return;
    listEl.dataset.sig = sig;
    listEl.replaceChildren(...queue.length ? queue.map(q => h("button", {
      class: "csrp-qp-user",
      title: "Open CSR+ profile",
      onclick: e => {
        e.stopPropagation();
        CSRP.notes?.openProfile(q.id);
      }
    }, [ h("span", {
      class: "csrp-qp-live"
    }), q.name ])) : [ h("span", {
      class: "csrp-qp-none"
    }, "No CSR+ users searching right now — only people with the extension show up here.") ]);
  }
  let asked = false;
  function tick() {
    const anchor = findPlayAnchor();
    if (!anchor) {
      const stale = document.getElementById(PANEL_ID);
      if (stale) stale.remove();
      return;
    }
    if (!asked) {
      asked = true;
      requestQueueOnce();
    }
    refreshStats();
    render();
  }
  CSRP.playTab = {
    tick
  };
})();
