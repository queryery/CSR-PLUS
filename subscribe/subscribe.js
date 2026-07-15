(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);

  const CHECKOUT_HOST = 'https://csr-plus-331c8.web.app';
  const DISCORD_CLIENT_ID = '1526694025757851819';
  const JWT_KEY = 'csrpProToken';
  const rank = { free: 0, pro: 1, premium: 2 };

  let session = null;
  let tier = 'free';
  let premiumUntil = 0;
  let modStrikes = 0;
  let modBanned = false;
  let awaitingCheckout = null;

  let sndCfg = { soundEnabled: true, soundVolume: 0.6 };
  try {
    const area = (chrome.storage && chrome.storage.sync) ? chrome.storage.sync : chrome.storage.local;
    area.get(['soundEnabled', 'soundVolume'], (d) => {
      if (d && typeof d.soundEnabled === 'boolean') sndCfg.soundEnabled = d.soundEnabled;
      if (d && typeof d.soundVolume === 'number') sndCfg.soundVolume = d.soundVolume;
    });
  } catch {}
  const sndCache = {};
  function snd(name) {
    if (!sndCfg.soundEnabled) return;
    try { let a = sndCache[name]; if (!a) { a = new Audio(chrome.runtime.getURL(`assets/sounds/${name}.wav`)); sndCache[name] = a; }
      const n = a.cloneNode(true); n.volume = sndCfg.soundVolume; n.play().catch(() => {}); } catch {}
  }

  function pro(path, { method = 'GET', body = null, token = null } = {}) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'csrp:pro', path, method, body, token }, (resp) => {
          if (chrome.runtime.lastError || !resp) return resolve({ ok: false, error: 'no response' });
          resolve(resp);
        });
      } catch (e) { resolve({ ok: false, error: String(e) }); }
    });
  }
  const jwtExp = (t) => { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp || 0; } catch { return 0; } };
  const tokenValid = (s) => !!(s && s.token && s.exp && s.exp * 1000 > Date.now() + 30000);

  function loadSession() {
    return new Promise((resolve) => {
      if (session) return resolve(session);
      chrome.storage.local.get([JWT_KEY], (d) => { session = (d && d[JWT_KEY]) || null; resolve(session); });
    });
  }
  async function signIn(interactive = true) {
    const s = await loadSession();
    if (tokenValid(s)) return s;
    const redirectUri = chrome.identity.getRedirectURL();
    const authUrl = 'https://discord.com/api/oauth2/authorize?' + new URLSearchParams({
      client_id: DISCORD_CLIENT_ID, response_type: 'code', redirect_uri: redirectUri, scope: 'identify', prompt: 'consent',
    }).toString();
    const redirect = await new Promise((res) => {
      try { chrome.identity.launchWebAuthFlow({ url: authUrl, interactive }, (r) => res(chrome.runtime.lastError ? null : r)); }
      catch { res(null); }
    });
    if (!redirect) return null;
    const code = new URL(redirect).searchParams.get('code');
    if (!code) return null;
    const resp = await pro('/auth/exchange', { method: 'POST', body: { code, redirectUri } });
    if (!resp.ok || !resp.data || !resp.data.token) return null;
    session = { token: resp.data.token, exp: jwtExp(resp.data.token), user: resp.data.user || null };
    chrome.storage.local.set({ [JWT_KEY]: session });
    return session;
  }
  async function token() {
    const s = await loadSession();
    if (tokenValid(s)) return s.token;
    const re = await signIn(false);
    return tokenValid(re) ? re.token : null;
  }
  function signOut() { session = null; tier = 'free'; chrome.storage.local.remove(JWT_KEY); reflect(); }

  const msg = $('#msg');
  const showErr = (t) => { msg.className = 'msg err'; msg.textContent = t; };
  const showOk = (t) => { msg.className = 'msg ok'; msg.textContent = t; };
  const showWait = (t) => { msg.className = 'msg wait'; msg.textContent = t; };

  function reflect() {
    const signedIn = tokenValid(session);
    const user = session && session.user;
    $('#chip-signin').hidden = signedIn;
    $('#chip-signout').hidden = !signedIn;
    const av = $('#chip-av'), label = $('#chip-label');
    if (signedIn) {
      const until = premiumUntil ? new Date(premiumUntil) : null;
      const untilStr = (until && !isNaN(until)) ? ` · until ${until.toISOString().slice(0, 10)}` : '';
      label.textContent = (user && user.name ? user.name : 'Signed in') +
        (tier !== 'free' ? ` · ${tier === 'premium' ? 'Premium' : 'Pro'}${untilStr}` : '');
      if (user && user.avatar && user.id) { av.src = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=48`; av.hidden = false; }
      else av.hidden = true;
    } else { label.textContent = 'Not signed in'; av.hidden = true; }

    const mc = $('#mod-chip');
    if (mc) {
      if (signedIn && modBanned) { mc.hidden = false; mc.className = 'mod-chip banned'; mc.textContent = '⛔ Banner uploads disabled — 3/3 strikes'; }
      else if (signedIn && modStrikes > 0) { mc.hidden = false; mc.className = 'mod-chip'; mc.textContent = `⚠ ${modStrikes}/3 warnings`; }
      else mc.hidden = true;
    }

    $('#owned-pro').hidden = !(signedIn && tier === 'pro');
    $('#owned-premium').hidden = !(signedIn && tier === 'premium');
    document.querySelector('.tier.is-pro').classList.toggle('owned', signedIn && tier === 'pro');
    document.querySelector('.tier.is-premium').classList.toggle('owned', signedIn && tier === 'premium');
    const ctaPro = $('#cta-pro');
    if (signedIn && rank[tier] >= rank.premium) { ctaPro.disabled = true; ctaPro.textContent = 'Included in Premium'; }
    else { ctaPro.disabled = false; ctaPro.textContent = 'Get Pro'; }
  }

  async function refreshTier() {
    const t = await token();
    if (!t) { tier = 'free'; reflect(); return; }
    const prevTier = tier;
    const resp = await pro('/me', { token: t });
    if (resp.ok && resp.data) {
      tier = resp.data.tier || 'free';
      premiumUntil = resp.data.premiumUntil || 0;
      modStrikes = resp.data.moderationStrikes || 0;
      modBanned = !!resp.data.moderationBanned;
      session.user = session.user || resp.data.user;
    }
    reflect();

    if (awaitingCheckout) {
      if (rank[tier] >= rank[awaitingCheckout]) {
        showOk(`✓ ${tier === 'premium' ? 'Premium' : 'Pro'} is now active — enjoy!`);
        awaitingCheckout = null;
      } else if (tier !== prevTier) {
        showWait('Payment not confirmed yet. If you finished checkout, give it a moment and reopen this tab.');
      }
    }
  }

  async function startCheckout(plan) {
    let t = await token();
    if (!t) { const s = await signIn(true); t = s && s.token; }
    if (!t) return showErr('Please sign in first.');

    if (window.CSRPConfirm) {
      const price = plan === 'premium' ? '$4/mo' : '$2/mo';
      const ok = await window.CSRPConfirm({
        title: `Get CSR+ ${plan === 'premium' ? 'Premium' : 'Pro'}?`,
        body: `This opens PayPal checkout for CSR+ ${plan === 'premium' ? 'Premium' : 'Pro'} (${price}). You can cancel anytime; your tier stays until the paid period ends.`,
        okLabel: 'Open checkout',
      });
      if (!ok) return;
    }

    const url = `${CHECKOUT_HOST}/checkout?plan=${encodeURIComponent(plan)}&token=${encodeURIComponent(t)}`;
    try { chrome.tabs.create({ url }); } catch { window.open(url, '_blank', 'noopener'); }
    awaitingCheckout = plan;
    showWait('Opening secure checkout in a new tab — finish there, then return to this tab.');
  }

  function bind() {
    $('#back-btn').addEventListener('click', () => {
      snd('click');
      if (history.length > 1) { const here = location.href; history.back(); setTimeout(() => { if (location.href === here) window.close(); }, 150); }
      else window.close();
    });
    $('#chip-signin').addEventListener('click', async () => {
      snd('click'); $('#chip-signin').disabled = true;
      const s = await signIn(true); $('#chip-signin').disabled = false;
      if (!s) return showErr('Sign-in failed or cancelled.');
      await refreshTier(); showOk('Signed in.');
    });
    $('#chip-signout').addEventListener('click', async () => {
      snd('click');
      if (window.CSRPConfirm) {
        const ok = await window.CSRPConfirm({ title: 'Sign out?', body: 'You can sign back in anytime.', okLabel: 'Sign out', danger: true });
        if (!ok) return;
      }
      signOut();
    });
    $('#cta-pro').addEventListener('click', () => { snd('click'); startCheckout('pro'); });
    $('#cta-premium').addEventListener('click', () => { snd('click'); startCheckout('premium'); });
  }

  async function render() {
    bind();
    await loadSession();
    if (tokenValid(session)) await refreshTier(); else reflect();
    document.addEventListener('visibilitychange', () => { if (!document.hidden && tokenValid(session)) refreshTier(); });
  }
  render();
})();
