(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});
  const PRO_API = CSRP.PRO_API;
  const DISCORD_CLIENT_ID = '1526694025757851819';

  const JWT_KEY = 'csrpProToken';
  let session = null;

  function call(path, { method = 'GET', body = null, token = null, timeoutMs = 0 } = {}) {
    return new Promise((resolve) => {
      let settled = false;
      try {
        chrome.runtime.sendMessage(
          { type: 'csrp:pro', path, method, body, token, timeoutMs },
          (resp) => {
            if (settled) return; settled = true;
            if (chrome.runtime.lastError || !resp) return resolve({ ok: false, error: 'no response' });
            resolve(resp);
          });
      } catch (e) { resolve({ ok: false, error: String(e) }); }
    });
  }

  function loadSession() {
    return new Promise((resolve) => {
      if (session) return resolve(session);
      try {
        chrome.storage.local.get([JWT_KEY], (d) => {
          session = (d && d[JWT_KEY]) || null;
          resolve(session);
        });
      } catch { resolve(null); }
    });
  }
  function saveSession(s) {
    session = s;
    try { chrome.storage.local.set({ [JWT_KEY]: s }); } catch {}
  }
  function clearSession() {
    session = null;
    try { chrome.storage.local.remove(JWT_KEY); } catch {}
  }
  function tokenValid(s) { return !!(s && s.token && s.exp && s.exp * 1000 > Date.now() + 30000); }

  function jwtExp(token) {
    try {
      const p = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return p.exp || 0;
    } catch { return 0; }
  }

  async function signIn(interactive = true) {
    const s = await loadSession();
    if (tokenValid(s)) return s;

    const redirectUri = chrome.identity.getRedirectURL();
    const authUrl = 'https://discord.com/api/oauth2/authorize?' + new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: 'identify',
      prompt: 'consent',
    }).toString();

    const redirect = await new Promise((resolve) => {
      try {
        chrome.identity.launchWebAuthFlow({ url: authUrl, interactive }, (r) => {
          if (chrome.runtime.lastError || !r) return resolve(null);
          resolve(r);
        });
      } catch { resolve(null); }
    });
    if (!redirect) return null;

    const code = new URL(redirect).searchParams.get('code');
    if (!code) return null;

    const resp = await call('/auth/exchange', { method: 'POST', body: { code, redirectUri } });
    if (!resp.ok || !resp.data || !resp.data.token) return null;
    const token = resp.data.token;
    const newSession = { token, exp: jwtExp(token), user: resp.data.user || null };
    saveSession(newSession);
    return newSession;
  }

  async function ensureToken() {
    const s = await loadSession();
    if (tokenValid(s)) return s.token;
    const re = await signIn(false);
    if (tokenValid(re)) return re.token;
    return null;
  }

  function currentUser() { return session && session.user; }
  async function isSignedIn() { const s = await loadSession(); return tokenValid(s); }
  function signOut() { clearSession(); }

  async function authed(path, opts = {}) {
    const token = await ensureToken();
    if (!token) return { ok: false, error: 'sign in required', needAuth: true };
    const resp = await call(path, { ...opts, token });
    if (resp.status === 401) { clearSession(); return { ok: false, error: 'session expired', needAuth: true }; }
    return resp;
  }

  const getMe = () => authed('/me');
  const getMyReports = () => authed('/me/reports');
  const saveCustomization = (fields) => authed('/me/customization', { method: 'POST', body: fields });
  const uploadBanner = (dataUrl) => authed('/me/banner', { method: 'POST', body: { image: dataUrl }, timeoutMs: 90000 });
  const uploadAnimatedBanner = (dataUrl) => authed('/me/banner/animated', { method: 'POST', body: { media: dataUrl }, timeoutMs: 120000 });
  const report = (payload) => authed('/report', { method: 'POST', body: payload, timeoutMs: 90000 });

  const mem = new Map();
  const inflight = new Map();
  const PUB_TTL = 5 * 60 * 1000;

  function readMem(id) {
    const e = mem.get(id);
    if (e && Date.now() - e.t < PUB_TTL) return e.v;
    if (e) mem.delete(id);
    return undefined;
  }

  async function getPublicProfiles(ids) {
    const uniq = [...new Set((ids || []).filter((x) => /^\d{15,21}$/.test(String(x))).map(String))];
    const out = {};
    const missing = [];
    for (const id of uniq) {
      const v = readMem(id);
      if (v !== undefined) out[id] = v; else missing.push(id);
    }
    if (!missing.length) return out;

    for (let i = 0; i < missing.length; i += 25) {
      const chunk = missing.slice(i, i + 25);
      const key = chunk.join(',');
      let p = inflight.get(key);
      if (!p) {
        p = call('/pub/profiles?ids=' + encodeURIComponent(key)).then((resp) => {
          inflight.delete(key);
          const profiles = (resp.ok && resp.data && resp.data.profiles) || {};
          const now = Date.now();
          for (const id of chunk) {
            const v = profiles[id] || null;
            mem.set(id, { t: now, v });
          }
          return profiles;
        });
        inflight.set(key, p);
      }
      const profiles = await p;
      for (const id of chunk) out[id] = profiles[id] || null;
    }
    return out;
  }
  function invalidateProfile(id) { if (id) mem.delete(String(id)); }

  CSRP.pro = {
    signIn, signOut, isSignedIn, currentUser, ensureToken,
    getMe, getMyReports, saveCustomization, uploadBanner, uploadAnimatedBanner, report,
    getPublicProfiles, invalidateProfile,
  };
})();
