'use strict';

const BASE = 'https://api.csrestored.fun';
const PRO_BASE = 'https://europe-west1-csr-plus-331c8.cloudfunctions.net/api';

function quoteBigInts(text) {
  return text.replace(/([:\[,]\s*)(-?\d{16,})(?=\s*[,}\]])/g, '$1"$2"');
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === 'csrp:pro') {
    const path = String(msg.path || '');
    if (!path.startsWith('/')) { sendResponse({ ok: false, error: 'bad path' }); return true; }
    const method = String(msg.method || 'GET').toUpperCase();
    const init = { method, headers: {} };
    if (msg.token) init.headers['Authorization'] = 'Bearer ' + String(msg.token);
    if (msg.body != null && method !== 'GET' && method !== 'HEAD') {
      init.headers['content-type'] = 'application/json';
      init.body = typeof msg.body === 'string' ? msg.body : JSON.stringify(msg.body);
    }
    const timeoutMs = Number(msg.timeoutMs) > 0 ? Number(msg.timeoutMs)
      : (method === 'GET' ? 20000 : 60000);
    let timedOut = false;
    const ctrl = new AbortController();
    init.signal = ctrl.signal;
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);
    fetch(PRO_BASE + path, init)
      .then(async (r) => {
        clearTimeout(timer);
        let data = null;
        try {
          const text = await r.text();
          try { data = JSON.parse(quoteBigInts(text)); } catch { data = text; }
        } catch {}
        if (r.ok) return sendResponse({ ok: true, data, status: r.status });
        sendResponse({ ok: false, status: r.status, error: (data && data.error) || ('HTTP ' + r.status), data });
      })
      .catch((err) => {
        clearTimeout(timer);
        if (timedOut) return sendResponse({ ok: false, error: 'timeout', timeout: true });
        sendResponse({ ok: false, error: String(err && err.message || err) });
      });
    return true;
  }


  if (msg.type === 'csrp:notify') {
    try {
      chrome.notifications.create('csrp-' + Date.now(), {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('assets/icon128.png'),
        title: String(msg.title || 'CSR+'),
        message: String(msg.message || ''),
        priority: 2,
      });
    } catch (e) {  }
    return;
  }

  if (msg.type !== 'csrp:api') return;
  const path = String(msg.path || '');

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


  const timeoutMs = Number(msg.timeoutMs) > 0
    ? Number(msg.timeoutMs)
    : (method === 'GET' ? 20000 : 25000);
  let timedOut = false;
  const ctrl = new AbortController();
  init.signal = ctrl.signal;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);


  fetch(BASE + path, init)
    .then(async (r) => {
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
      } catch {  }
      if (r.ok) return sendResponse({ ok: true, data, status: r.status });
      sendResponse({ ok: false, status: r.status, error: 'HTTP ' + r.status, data });
    })
    .catch((err) => {
      clearTimeout(timer);

      if (timedOut) return sendResponse({ ok: false, error: 'timeout', timeout: true });
      sendResponse({ ok: false, error: String(err && err.message || err) });
    });
  return true;
});


chrome.notifications && chrome.notifications.onClicked.addListener(() => {
  chrome.tabs.query({ url: 'https://csrestored.fun/*' }, (tabs) => {
    if (tabs && tabs[0]) chrome.tabs.update(tabs[0].id, { active: true });
  });
});
