/* CSR+ background service worker.
 * Proxies API requests so the content script isn't blocked by the page's CORS
 * policy (the SW has host_permissions for api.csrestored.fun). */
'use strict';

const BASE = 'https://api.csrestored.fun';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  // Desktop notification (content scripts can't call chrome.notifications).
  if (msg.type === 'csrp:notify') {
    try {
      chrome.notifications.create('csrp-' + Date.now(), {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('assets/icon128.png'),
        title: String(msg.title || 'CSR+'),
        message: String(msg.message || ''),
        priority: 2,
      });
    } catch (e) { /* ignore */ }
    return; // no async response needed
  }

  if (msg.type !== 'csrp:api') return;
  const path = String(msg.path || '');
  // Only allow our own API paths (must be a same-origin path on api.csrestored.fun).
  if (!path.startsWith('/')) {
    sendResponse({ ok: false, error: 'bad path' });
    return;
  }

  const method = String(msg.method || 'GET').toUpperCase();
  const init = { method, credentials: 'include' };
  if (msg.body != null && method !== 'GET' && method !== 'HEAD') {
    init.headers = { 'content-type': 'application/json' };
    init.body = typeof msg.body === 'string' ? msg.body : JSON.stringify(msg.body);
  }

  // Resolve to the response body even on non-2xx so callers can read API error
  // messages (e.g. a rejected trade) instead of just an opaque HTTP status.
  fetch(BASE + path, init)
    .then(async (r) => {
      let data = null;
      // Parse from raw text so we can protect big integers (Discord ids,
      // item instance ids) that exceed JS's safe integer range — JSON.parse
      // would silently round them (…7739505 → …7739500), breaking every
      // follow-up call keyed on that id. We quote any 16+ digit integer value
      // so it survives as a string.
      try {
        const text = await r.text();
        try {
          // Quote any 16+ digit integer that sits as a JSON value — after a
          // colon (object value) or after a comma/opening-bracket (array
          // element). Leaves floats (they contain a dot) and small ints alone.
          const safe = text.replace(/([:\[,]\s*)(-?\d{16,})(?=\s*[,}\]])/g, '$1"$2"');
          data = JSON.parse(safe);
        } catch {
          data = text;
        }
      } catch { /* ignore */ }
      if (r.ok) return sendResponse({ ok: true, data, status: r.status });
      sendResponse({ ok: false, status: r.status, error: 'HTTP ' + r.status, data });
    })
    .catch((err) => sendResponse({ ok: false, error: String(err && err.message || err) }));
  return true; // keep the message channel open for the async response
});

// Focus the csrestored tab when a notification is clicked.
chrome.notifications && chrome.notifications.onClicked.addListener(() => {
  chrome.tabs.query({ url: 'https://csrestored.fun/*' }, (tabs) => {
    if (tabs && tabs[0]) chrome.tabs.update(tabs[0].id, { active: true });
  });
});
