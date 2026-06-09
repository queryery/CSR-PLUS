/* CSR+ background service worker.
 * Proxies API requests so the content script isn't blocked by the page's CORS
 * policy (the SW has host_permissions for api.csrestored.fun). */
'use strict';

const BASE = 'https://api.csrestored.fun';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  // Read proxy (GET) — bypasses the page CORS policy.
  if (msg.type === 'csrp:api') {
    const path = String(msg.path || '');
    if (!path.startsWith('/')) { sendResponse({ ok: false, error: 'bad path' }); return; }
    fetch(BASE + path, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: String(err && err.message || err) }));
    return true;
  }

  // Sell one item (POST). Kept as a separate, narrowly-scoped message so a
  // generic write proxy can't be abused — only /inventory/sell/{id} is allowed.
  if (msg.type === 'csrp:sell') {
    const itemId = String(msg.itemId || '');
    if (!/^\d+$/.test(itemId)) { sendResponse({ ok: false, error: 'bad item id' }); return; }
    fetch(`${BASE}/inventory/sell/${itemId}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
    })
      .then(async (r) => {
        let data = null; try { data = await r.json(); } catch { /* maybe empty */ }
        if (!r.ok) return sendResponse({ ok: false, status: r.status, error: 'HTTP ' + r.status, data });
        sendResponse({ ok: true, status: r.status, data });
      })
      .catch((err) => sendResponse({ ok: false, error: String(err && err.message || err) }));
    return true;
  }
});
