/* CSR+ — API client with in-memory + sessionStorage caching. */
(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});
  const BASE = CSRP.API_BASE;

  const mem = new Map();
  const inflight = new Map();

  // Per-type TTL. Profiles barely change → cache long & persist across sessions
  // (localStorage). History changes per match → shorter window.
  function ttlFor(path) {
    if (path.startsWith('/users/')) return 30 * 60 * 1000;   // 30 min
    if (path.startsWith('/history/')) return 6 * 60 * 1000;  // 6 min
    return 5 * 60 * 1000;
  }

  function cacheKey(path) {
    return 'csrp:' + path;
  }

  // localStorage persists across reloads/tabs → instant warm cache next lobby.
  function readSession(path) {
    try {
      const raw = localStorage.getItem(cacheKey(path));
      if (!raw) return null;
      const { t, v } = JSON.parse(raw);
      if (Date.now() - t > ttlFor(path)) return null;
      return v;
    } catch {
      return null;
    }
  }
  function writeSession(path, v) {
    try {
      localStorage.setItem(cacheKey(path), JSON.stringify({ t: Date.now(), v }));
    } catch {
      // quota — prune our old entries then ignore.
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith('csrp:')) localStorage.removeItem(k);
        }
      } catch { /* ignore */ }
    }
  }

  // Fetch via the background SW (avoids the page's CORS restrictions). Falls
  // back to a direct fetch if the runtime channel is unavailable.
  function bgFetch(path) {
    return new Promise((resolve) => {
      let settled = false;
      try {
        chrome.runtime.sendMessage({ type: 'csrp:api', path }, (resp) => {
          if (settled) return;
          settled = true;
          if (chrome.runtime.lastError || !resp) return directFetch(path).then(resolve);
          if (resp.ok) return resolve(resp.data);
          CSRP.log('api error', path, resp.error);
          resolve(null);
        });
      } catch {
        directFetch(path).then(resolve);
      }
    });
  }

  function directFetch(path) {
    return fetch(BASE + path, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .catch((err) => {
        CSRP.log('api direct error', path, err.message);
        return null;
      });
  }

  async function get(path) {
    if (mem.has(path)) return mem.get(path);
    const cached = readSession(path);
    if (cached !== null) {
      mem.set(path, cached);
      return cached;
    }
    if (inflight.has(path)) return inflight.get(path);

    const p = bgFetch(path).then((data) => {
      inflight.delete(path);
      if (data != null) {
        mem.set(path, data);
        writeSession(path, data);
      }
      return data;
    });
    inflight.set(path, p);
    return p;
  }

  // History is paginated by page number: /history/user/{id}/{page} (0,1,2…).
  // The stats periods are now at most "last 10 games", so the first page is
  // all we ever need — halves the request volume per lobby.
  const histCache = new Map();
  const HIST_PAGES = 1;
  async function history(id) {
    if (histCache.has(id)) return histCache.get(id);
    const p = (async () => {
      const pages = await Promise.all(
        Array.from({ length: HIST_PAGES }, (_, i) => get(`/history/user/${id}/${i}`))
      );
      const all = [];
      for (const batch of pages) if (Array.isArray(batch)) all.push(...batch);
      return all;
    })();
    histCache.set(id, p);
    const result = await p;
    // Keep a non-empty result cached; drop empties so a later call can retry.
    if (result && result.length) histCache.set(id, result);
    else histCache.delete(id);
    return result;
  }

  // Bypass all caches for a single path and refresh them with the result. Used
  // by the ELO tracker, which needs the live value (the normal 30-min profile
  // cache would hide a fresh match's ELO change).
  async function getFresh(path) {
    const data = await bgFetch(path);
    if (data != null) { mem.set(path, data); writeSession(path, data); }
    return data;
  }

  CSRP.api = {
    user: (id) => get(`/users/${id}`),
    userFresh: (id) => getFresh(`/users/${id}`),
    friends: () => get('/users/friends'),
    history,
    historyPage: (id, page = 0) => get(`/history/user/${id}/${page}`),
    avatarUrl: (id, hash) =>
      hash ? `https://cdn.discordapp.com/avatars/${id}/${hash}.png` : null,
  };
})();
