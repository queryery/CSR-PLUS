(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});
  const { h } = CSRP.dom;

  const PANEL_ID = 'csrp-queue-panel';
  const REFRESH_MS = 7000;

  let lastFetch = 0;
  let lastStats = null;
  let fetching = false;

  // Realtime queue: the background worker holds ONE Firestore listener and
  // pushes the queue here instantly. We only fall back to the /stats poll if no
  // push has arrived recently (listener unavailable / cold worker).
  let pushedQueue = null;      // {users, count, at} from the push
  let lastPush = 0;
  const PUSH_FRESH_MS = 30000; // trust the push for this long before polling

  function requestQueueOnce() {
    try {
      chrome.runtime.sendMessage({ type: 'csrp:queue:get' }, (resp) => {
        if (chrome.runtime.lastError || !resp) return;
        if (resp.queue) { pushedQueue = resp.queue; lastPush = Date.now(); render(); }
      });
    } catch {}
  }
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'csrp:queue' && msg.queue) {
        pushedQueue = msg.queue; lastPush = Date.now();
        render();
      }
    });
  } catch {}

  // The play tab is identified by its primary Join Queue CTA (or the in-queue
  // variant of it) plus the lobby slot row.
  function findPlayAnchor() {
    for (const btn of document.querySelectorAll('button.rounded-full.bg-theme-primary.px-12')) {
      const t = (btn.textContent || '').trim();
      if (/join queue|leave queue|searching|in queue|\d{1,2}:\d{2}/i.test(t)) return btn;
    }
    return null;
  }

  function refreshStats() {
    if (fetching || !CSRP.pro || !CSRP.pro.stats) return;
    // If the realtime push is fresh, don't poll for the queue at all — only poll
    // slowly to keep total/active counts (which the push doesn't carry) current.
    const pushFresh = Date.now() - lastPush < PUSH_FRESH_MS;
    const interval = pushFresh ? 60000 : REFRESH_MS;
    if (Date.now() - lastFetch < interval) return;
    fetching = true;
    CSRP.pro.stats().then((resp) => {
      fetching = false;
      lastFetch = Date.now();
      if (resp && resp.ok && resp.data) lastStats = resp.data;
      render();
    }).catch(() => { fetching = false; lastFetch = Date.now(); });
  }

  function currentQueue() {
    // Prefer the realtime push when it's fresh; else the polled /stats list.
    if (pushedQueue && Date.now() - lastPush < PUSH_FRESH_MS) return pushedQueue.users || [];
    return (lastStats && lastStats.queue) || [];
  }

  function render() {
    const anchor = findPlayAnchor();
    const stale = document.getElementById(PANEL_ID);
    // (.csrp-play / .csrp-in-queue classes are owned by main.js's fast loop so
    // the styling never lags; here we only manage the queue panel itself.)
    if (!anchor) { if (stale) stale.remove(); return; }

    // Mount right under the site's "Active Players / Matches / Queue" line.
    const statsLine = anchor.nextElementSibling;
    const mount = statsLine || anchor.parentElement;
    if (!mount) return;

    let panel = stale;
    if (!panel) {
      panel = h('div', { id: PANEL_ID, class: 'csrp-qp' }, [
        h('div', { class: 'csrp-qp-h' }, [
          h('span', { class: 'csrp-qp-dot' }),
          h('span', { class: 'csrp-qp-t' }, 'CSR+ users in queue'),
          h('span', { class: 'csrp-qp-n' }, ''),
        ]),
        h('div', { class: 'csrp-qp-list' }),
      ]);
      mount.insertAdjacentElement('afterend', panel);
    }

    const listEl = panel.querySelector('.csrp-qp-list');
    const nEl = panel.querySelector('.csrp-qp-n');
    const queue = currentQueue();
    nEl.textContent = String(queue.length);
    panel.classList.toggle('csrp-qp-empty', !queue.length);

    const sig = queue.map((q) => q.id).join(',');
    if (listEl.dataset.sig === sig) return;
    listEl.dataset.sig = sig;
    listEl.replaceChildren(
      ...(queue.length
        ? queue.map((q) => h('button', {
          class: 'csrp-qp-user', title: 'Open CSR+ profile',
          onclick: (e) => { e.stopPropagation(); CSRP.notes?.openProfile(q.id); },
        }, [h('span', { class: 'csrp-qp-live' }), q.name]))
        : [h('span', { class: 'csrp-qp-none' }, 'No CSR+ users searching right now — only people with the extension show up here.')])
    );
  }

  let asked = false;
  function tick() {
    const anchor = findPlayAnchor();
    if (!anchor) {
      const stale = document.getElementById(PANEL_ID);
      if (stale) stale.remove();
      return;
    }
    // Kick the background listener + grab its current value once we're on the tab.
    if (!asked) { asked = true; requestQueueOnce(); }
    refreshStats();
    render();
  }

  CSRP.playTab = { tick };
})();
