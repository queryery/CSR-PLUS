(() => {
  "use strict";
  const CSRP = window.CSRP = window.CSRP || {};
  const BTN_CLASS = "csrp-report-btn";
  function userIdFromUrl() {
    const m = location.pathname.match(/\/user\/(\d{15,21})/);
    return m ? m[1] : null;
  }
  function reportUrl(id) {
    return chrome.runtime.getURL(`report/report.html?id=${encodeURIComponent(id)}`);
  }
  function makeButton(id, floating) {
    const btn = document.createElement("button");
    btn.className = BTN_CLASS + (floating ? " csrp-report-float" : "");
    btn.type = "button";
    btn.title = "Report this player to CSR+ moderators";
    btn.innerHTML = '<span class="csrp-rb-ic">⚑</span> Report';
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      CSRP.sound?.play("click");
      window.open(reportUrl(id), "_blank", "noopener");
    });
    return btn;
  }
  function findAnchor() {
    const actions = document.querySelector(".csrp-pc-actions");
    if (actions) return {
      node: actions,
      mode: "append"
    };
    const name = document.querySelector("p.text-theme-white, .text-theme-white");
    const row = name?.closest(".flex.flex-row");
    if (row) return {
      node: row,
      mode: "append"
    };
    const ext = document.querySelector('a[href*="steamcommunity.com"], a[href*="steamdb.info"]');
    const extRow = ext?.closest(".flex");
    if (extRow) return {
      node: extRow,
      mode: "append"
    };
    const watch = document.getElementById("csrp-watch-inv");
    if (watch && watch.parentElement) return {
      node: watch,
      mode: "after"
    };
    return null;
  }
  function tick() {
    const id = userIdFromUrl();
    const mine = CSRP._myId != null ? String(CSRP._myId) : null;
    if (!id || mine && id === mine) {
      document.querySelectorAll("." + BTN_CLASS).forEach(n => n.remove());
      return;
    }
    const existing = document.querySelector("." + BTN_CLASS);
    const actions = document.querySelector(".csrp-pc-actions");
    if (existing) {
      if (actions && existing.parentElement !== actions && !existing.classList.contains("csrp-report-float")) {
        actions.appendChild(existing);
      }
      return;
    }
    const anchor = findAnchor();
    if (anchor) {
      if (anchor.mode === "after") anchor.node.insertAdjacentElement("afterend", makeButton(id, false)); else anchor.node.appendChild(makeButton(id, false));
    } else {
      document.body.appendChild(makeButton(id, true));
    }
  }
  CSRP.reportButton = {
    tick
  };
})();
