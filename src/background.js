/* CSR+ background service worker.
 * Proxies API requests so the content script isn't blocked by the page's CORS
 * policy (the SW has host_permissions for api.csrestored.fun). */
'use strict';

const BASE = 'https://api.csrestored.fun';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'csrp:api') return;
  const path = String(msg.path || '');
  // Only allow our own API paths.
  if (!path.startsWith('/')) {
    sendResponse({ ok: false, error: 'bad path' });
    return;
  }
  fetch(BASE + path, { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: String(err && err.message || err) }));
  return true; // keep the message channel open for the async response
});
