(() => {
  'use strict';


  const SA = (chrome.storage && chrome.storage.sync) ? chrome.storage.sync : chrome.storage.local;

  const DEFAULTS = {
    masterEnabled: true,
    autoMatch: true, autoInvite: true, autoQueue: true, autoBan: false,
    autoCopyServer: true, autoUpdate: true,
    acceptInstant: false, acceptDelay: 10,
    inviteFriends: {},
    banPriority: ['Vertigo', 'Overpass', 'Anubis', 'Train', 'Ancient', 'Dust2', 'Nuke', 'Inferno', 'Mirage', 'Cobblestone'],
    showBadges: true, showWinProb: true,
    showMatchOverlay: true, statsPeriod: 'last10',
    soundEnabled: true, soundVolume: 0.6,
    soundUi: true, soundMatch: true, soundCountdown: true, soundAccept: true,
    theme: 'black',
    useCsrpTrades: false, tradesPromptDismissed: false,
    useCsrpCases: false, casesPromptDismissed: false,
  };

  let state = { ...DEFAULTS };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));


  const sndCache = {};
  function snd(name) {
    if (!state.soundEnabled) return;
    try {
      let a = sndCache[name];
      if (!a) { a = new Audio(chrome.runtime.getURL(`assets/sounds/${name}.wav`)); sndCache[name] = a; }
      const n = a.cloneNode(true);
      n.volume = state.soundVolume;
      n.play().catch(() => { });
    } catch {  }
  }

  function save(key, value) {
    state[key] = value;
    SA.set({ [key]: value });
  }


  const saveTimers = {};
  function saveDebounced(key, value, ms = 250) {
    state[key] = value;
    clearTimeout(saveTimers[key]);
    saveTimers[key] = setTimeout(() => SA.set({ [key]: value }), ms);
  }


  function toast(msg, ms = 2200) {
    const stack = $('#toasts');
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<span class="tdot"></span><span>${esc(msg)}</span>`;
    stack.appendChild(t);
    setTimeout(() => {
      t.classList.add('out');
      t.addEventListener('animationend', () => t.remove(), { once: true });
    }, ms);
  }


  function bindNav() {
    $$('.nav-i').forEach((btn) => {
      btn.addEventListener('mouseenter', () => snd('hover'));
      btn.addEventListener('click', () => {
        snd('click');
        const tab = btn.dataset.tab;
        $$('.nav-i').forEach((b) => b.classList.toggle('active', b === btn));
        $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
        if (tab === 'friends') loadFriends();
        if (tab === 'reports') loadReports();
      });
    });
  }


  function bindToggles() {
    $$('.set[data-key]').forEach((el) => {
      const key = el.dataset.key;
      el.classList.toggle('on', !!state[key]);
      el.addEventListener('click', () => {
        const v = !el.classList.contains('on');
        el.classList.toggle('on', v);
        save(key, v);
        snd(v ? 'on' : 'off');
        if (key === 'autoInvite') reflectInvite();
        if (key === 'masterEnabled') reflectMaster();
        if (key === 'soundEnabled') reflectSound();
        if (key === 'acceptInstant' && bindAccept._sync) bindAccept._sync();
      });
    });
  }

  function reflectInvite() {

  }
  function reflectMaster() {
    document.querySelector('.content').style.opacity = state.masterEnabled ? '1' : '0.45';
  }

  function reflectSound() {
    const body = $('#snd-body');
    if (body) body.classList.toggle('snd-off', !state.soundEnabled);
  }


  function bindPeriod() {
    const seg = $('#period');
    const sync = () => $$('button', seg).forEach((b) => b.classList.toggle('on', b.dataset.v === state.statsPeriod));
    sync();
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      save('statsPeriod', b.dataset.v);
      snd('click');
      sync();
    });
  }


  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme || 'mask');
  }
  function bindTheme() {
    const seg = $('#theme');
    const sync = () => $$('button', seg).forEach((b) => b.classList.toggle('on', b.dataset.v === state.theme));
    sync();
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      save('theme', b.dataset.v);
      applyTheme();
      snd('click');
      sync();
    });
  }


  function bindAccept() {
    const delay = $('#delay');
    const val = $('#delay-val');
    const sync = () => {
      val.textContent = `${state.acceptDelay}s`;

      $('#delay-set').style.opacity = state.acceptInstant ? '0.4' : '1';
      delay.disabled = !!state.acceptInstant;
    };
    delay.value = state.acceptDelay;
    sync();
    delay.addEventListener('input', () => {
      saveDebounced('acceptDelay', Number(delay.value));
      val.textContent = `${delay.value}s`;
    });
    delay.addEventListener('change', () => snd('click'));

    bindAccept._sync = sync;
  }


  function preview(name) {
    try {
      let a = sndCache['_pv_' + name];
      if (!a) { a = new Audio(chrome.runtime.getURL(`assets/sounds/${name}.wav`)); sndCache['_pv_' + name] = a; }
      const n = a.cloneNode(true);
      n.volume = state.soundVolume;
      n.play().catch(() => {});
    } catch {  }
  }
  function bindSound() {
    reflectSound();
    const vol = $('#vol'), read = $('#vol-read'), fill = $('#vol-fill');
    const paint = (pct) => {
      if (read) read.textContent = pct + '%';
      if (fill) fill.style.width = pct + '%';
    };
    const start = Math.round(state.soundVolume * 100);
    vol.value = start; paint(start);
    vol.addEventListener('input', () => {
      const pct = Number(vol.value);
      paint(pct);
      saveDebounced('soundVolume', pct / 100);
    });

    vol.addEventListener('change', () => preview('click'));


    $$('.snd-test').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        preview(b.dataset.snd || 'click');
      });
    });


    const allBtn = $('#snd-all');
    if (allBtn) allBtn.addEventListener('click', () => {
      const seq = ['alert', 'tick', 'accept', 'cancel', 'click'];
      allBtn.disabled = true;
      seq.forEach((name, i) => setTimeout(() => {
        preview(name);
        if (i === seq.length - 1) setTimeout(() => { allBtn.disabled = false; }, 360);
      }, i * 360));
    });
  }


  function bindFeedback() {
    const btn = $('#fb-discord');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      snd('click');
      const sub = $('#fb-discord-sub'), state = $('#fb-copy-state');
      try {
        await navigator.clipboard.writeText('9uery');
        btn.classList.add('copied');
        if (sub) sub.textContent = 'copied to clipboard!';
        if (state) state.textContent = '✓';
        toast('Copied 9uery to clipboard');
        setTimeout(() => {
          btn.classList.remove('copied');
          if (sub) sub.textContent = 'click to copy';
          if (state) state.textContent = '⧉';
        }, 1800);
      } catch {
        if (sub) sub.textContent = "it's 9uery";
      }
    });


    const smel = $('#credit-smel');
    if (smel) {
      smel.addEventListener('click', async () => {
        snd('click');
        try {
          await navigator.clipboard.writeText('smel_111');
          const prev = smel.textContent;
          smel.textContent = 'copied ✓';
          toast('Copied smel_111 to clipboard');
          setTimeout(() => { smel.textContent = prev; }, 1600);
        } catch { toast("it's smel_111"); }
      });
    }
  }


  let friendsLoaded = false;
  async function loadFriends() {
    if (friendsLoaded) return;
    friendsLoaded = true;
    const box = $('#friends');
    box.innerHTML = Array.from({ length: 5 }, () => '<div class="friend-skel"></div>').join('');
    try {
      const res = await fetch('https://api.csrestored.fun/users/friends', { credentials: 'include' });
      const friends = res.ok ? await res.json() : [];
      if (!Array.isArray(friends) || !friends.length) {
        box.innerHTML = '<div class="friends-empty">No friends found (sign in on the site first).</div>';
        friendsLoaded = false;
        return;
      }
      box.innerHTML = '';
      friends.forEach((f) => {
        const sel = !!state.inviteFriends[f.id];
        const row = document.createElement('div');
        row.className = 'friend' + (sel ? ' sel' : '');
        const avatar = f.avatar ? `https://cdn.discordapp.com/avatars/${f.id}/${f.avatar}.png?size=32` : '';
        row.innerHTML = `
          <img src="${avatar}" alt="" onerror="this.style.visibility='hidden'"/>
          <span class="fn">${esc(f.name)}</span>
          <span class="fp">${f.points ?? ''}</span>
          <button class="ftrade" title="Send trade offer">⇄</button>
          <span class="fchk">✓</span>`;
        row.querySelector('.ftrade').addEventListener('click', (e) => {
          e.stopPropagation();
          snd('click');
          chrome.tabs.create({ url: chrome.runtime.getURL(`trades/trades.html?partner=${f.id}`) });
        });
        row.addEventListener('mouseenter', () => snd('hover'));
        row.addEventListener('click', () => {
          const now = !row.classList.contains('sel');
          row.classList.toggle('sel', now);
          if (now) state.inviteFriends[f.id] = true;
          else delete state.inviteFriends[f.id];
          save('inviteFriends', state.inviteFriends);
          snd(now ? 'on' : 'off');
        });
        box.appendChild(row);
      });
    } catch {
      box.innerHTML = '<div class="friends-empty">Could not reach the API.</div>';
      friendsLoaded = false;
    }
  }


  function reconcileMaps(saved) {
    const canon = DEFAULTS.banPriority;
    const list = Array.isArray(saved) ? saved.filter((m) => canon.includes(m)) : [];
    for (const m of canon) if (!list.includes(m)) list.push(m);
    return list;
  }


  let dragBound = false;
  function renderMaps() {
    const ul = $('#maps');
    ul.innerHTML = '';
    state.banPriority.forEach((map, i) => {
      const li = document.createElement('li');
      li.className = 'map'; li.draggable = true; li.dataset.map = map;
      const last = state.banPriority.length - 1;
      li.innerHTML = `
        <span class="rank">${i + 1}</span><span class="grip">⠿</span>
        <span class="mn">${map}</span>
        <span class="pri">${i === 0 ? 'ban first' : i === last ? 'keep' : ''}</span>`;
      ul.appendChild(li);
    });
    bindDrag(ul);
  }


  function refreshMapLabels(ul) {
    const items = $$('.map', ul);
    const last = items.length - 1;
    items.forEach((li, i) => {
      li.querySelector('.rank').textContent = i + 1;
      li.querySelector('.pri').textContent = i === 0 ? 'ban first' : i === last ? 'keep' : '';
    });
  }

  function bindDrag(ul) {
    if (dragBound) return;
    dragBound = true;
    let dragEl = null;
    ul.addEventListener('dragstart', (e) => {
      dragEl = e.target.closest('.map');
      if (dragEl) dragEl.classList.add('drag');
    });
    ul.addEventListener('dragend', () => {
      if (!dragEl) return;
      dragEl.classList.remove('drag');
      $$('.map', ul).forEach((m) => m.classList.remove('over'));
      dragEl = null;
      state.banPriority = $$('.map', ul).map((m) => m.dataset.map);
      refreshMapLabels(ul);
      save('banPriority', state.banPriority);
      snd('click');
    });
    ul.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!dragEl) return;
      const after = afterEl(ul, e.clientY);
      $$('.map', ul).forEach((m) => m.classList.remove('over'));
      if (after && after !== dragEl) after.classList.add('over');
      if (after == null) ul.appendChild(dragEl);
      else if (after !== dragEl) ul.insertBefore(dragEl, after);
    });
  }
  function afterEl(ul, y) {
    let closest = { offset: -Infinity, el: null };
    for (const el of $$('.map:not(.drag)', ul)) {
      const box = el.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) closest = { offset, el };
    }
    return closest.el;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }


  async function loadLiveUsers() {
    const numEl = $('#lu-num');
    if (!numEl) return;
    numEl.classList.add('loading');
    try {
      const last = Number(localStorage.getItem('csrp:counted') || 0);
      const fresh = Date.now() - last > 3600e3;
      const action = fresh ? 'up' : '';
      const url = `https://api.counterapi.dev/v1/csrplus-ext/online${action ? '/up' : ''}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      if (fresh) localStorage.setItem('csrp:counted', String(Date.now()));
      const n = Number(data.count || 0);
      numEl.textContent = n.toLocaleString();
    } catch {

      const row = $('#live-users');
      if (row) row.style.display = 'none';
    } finally {
      numEl.classList.remove('loading');
    }
  }


  const REPO = 'queryery/CSR-PLUS';

  function showVersion() {
    const v = chrome.runtime.getManifest().version;
    $('#about-ver').textContent = `v${v}`;
    const sv = $('#side-ver');
    if (sv) sv.textContent = `v${v}`;
  }


  async function renderChangelog() {
    const box = $('#changelog');
    try {
      const md = await fetch(chrome.runtime.getURL('CHANGELOG.md')).then((r) => r.text());
      const blocks = md.split(/^## /m).filter((b) => /^\d/.test(b.trim()));
      if (!blocks.length) { box.remove(); return; }
      const head = blocks[0].split('\n');
      const title = head[0].trim();
      const items = head
        .filter((l) => l.trim().startsWith('- '))
        .map((l) => l.replace(/^[-\s]+/, '').replace(/\*\*/g, '').trim())
        .slice(0, 6);
      box.innerHTML =
        `<div class="cl-ver">${esc(title)}</div>` +
        '<ul class="cl-list">' + items.map((i) => `<li>${esc(i)}</li>`).join('') + '</ul>' +
        `<a class="cl-more" href="https://github.com/${REPO}/blob/main/CHANGELOG.md" target="_blank" rel="noopener">Full changelog ↗</a>`;
    } catch {
      box.remove();
    }
  }


  async function fetchLatest(useCache) {
    if (useCache) {
      const cached = JSON.parse(localStorage.getItem('csrp:update') || 'null');
      if (cached && Date.now() - cached.at < 3600e3) return cached;
    }
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);

    if (r.status === 404) return { none: true, at: Date.now() };
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    const latest = { tag: String(data.tag_name || '').replace(/^v/i, ''), url: data.html_url, at: Date.now() };
    localStorage.setItem('csrp:update', JSON.stringify(latest));
    return latest;
  }

  async function checkForUpdate(manual) {
    const current = chrome.runtime.getManifest().version;
    let latest;
    try {
      latest = await fetchLatest(!manual);
    } catch {
      if (manual) toast('Could not reach GitHub — try again later.');
      return;
    }
    if (latest.none) {
      if (manual) toast('No releases published yet.');
    } else if (latest.tag && cmpVer(latest.tag, current) > 0) {
      openUpdateModal(latest);
    } else if (manual) {
      toast(`You're on the latest version (v${current}).`);
    }
  }

  function openUpdateModal(latest) {
    const modal = $('#update-modal');
    $('#modal-ver').textContent = `v${latest.tag}`;
    $('#modal-go').href = latest.url || `https://github.com/${REPO}/releases/latest`;
    modal.hidden = false;
    snd('alert');
  }
  function bindModal() {
    const modal = $('#update-modal');
    $('#modal-later').addEventListener('click', () => { modal.hidden = true; snd('off'); });
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
    $('#modal-go').addEventListener('click', () => { modal.hidden = true; });
    $('#check-update').addEventListener('click', () => {
      snd('click');
      toast('Checking GitHub for updates…', 1400);
      checkForUpdate(true);
    });
  }

  function bindStudio() {
    $('#open-studio')?.addEventListener('click', () => {
      snd('click');
      chrome.tabs.create({ url: chrome.runtime.getURL('customize/customize.html') });
    });
    $('#open-subs')?.addEventListener('click', () => {
      snd('click');
      chrome.tabs.create({ url: chrome.runtime.getURL('subscribe/subscribe.html') });
    });
    bindProAccount();
    bindReports();
  }

  const REP_STATUS = {
    sent: { label: 'Sent', cls: 's-sent', desc: 'Delivered to moderators' },
    checking: { label: 'Checking', cls: 's-checking', desc: 'A moderator is reviewing it' },
    punished: { label: 'Punishment applied', cls: 's-punished', desc: 'Action was taken against the player' },
    insufficient: { label: 'Not enough info', cls: 's-insufficient', desc: 'Add more detail and report again' },
    rejected: { label: 'Rejected', cls: 's-rejected', desc: 'Dismissed as invalid or fake' },
  };
  let repLoaded = false;

  function repTimeAgo(ms) {
    if (!ms) return '';
    const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  function renderReports(items) {
    const list = $('#rep-list');
    if (!list) return;
    if (!items.length) {
      list.innerHTML = '<div class="rep-empty">No reports yet. Report a player from their CSR+ profile.</div>';
      return;
    }
    list.textContent = '';
    for (const r of items) {
      const st = REP_STATUS[r.status] || REP_STATUS.sent;
      const row = document.createElement('div');
      row.className = 'rep-item';
      const head = document.createElement('div');
      head.className = 'rep-item-head';
      const reason = document.createElement('span');
      reason.className = 'rep-reason';
      reason.textContent = r.reason || 'Report';
      const chip = document.createElement('span');
      chip.className = 'rep-chip ' + st.cls;
      chip.textContent = st.label;
      head.append(reason, chip);
      const meta = document.createElement('div');
      meta.className = 'rep-meta';
      const tgt = document.createElement('span');
      tgt.className = 'rep-target';
      tgt.textContent = 'Player ' + (r.targetId || '');
      const when = document.createElement('span');
      when.className = 'rep-when';
      when.textContent = repTimeAgo(r.at);
      meta.append(tgt, when);
      const desc = document.createElement('div');
      desc.className = 'rep-status-desc';
      desc.textContent = st.desc;
      row.append(head, meta, desc);
      list.appendChild(row);
    }
  }

  async function loadReports() {
    const auth = $('#rep-auth'), body = $('#rep-body');
    await loadPro();
    const signedIn = proValid(proSession);
    if (auth) auth.hidden = signedIn;
    if (body) body.hidden = !signedIn;
    if (!signedIn) return;
    const list = $('#rep-list');
    if (!repLoaded && list) list.innerHTML = '<div class="cl-skel"></div>';
    const resp = await proProxy('/me/reports', { token: proSession.token });
    repLoaded = true;
    if (resp.ok && resp.data && Array.isArray(resp.data.reports)) renderReports(resp.data.reports);
    else if (resp.status === 401) { renderReports([]); }
    else if (list) list.innerHTML = '<div class="rep-empty">Could not load your reports. Try again.</div>';
  }

  function bindReports() {
    $('#rep-signin')?.addEventListener('click', async () => {
      snd('click'); $('#rep-signin').disabled = true;
      const s = await proSignIn(); $('#rep-signin').disabled = false;
      if (!s) return toast('Sign-in failed or cancelled');
      await refreshPro(); await loadReports();
    });
    $('#rep-refresh')?.addEventListener('click', () => { snd('click'); repLoaded = false; loadReports(); });
  }

  const JWT_KEY = 'csrpProToken';
  const DISCORD_CLIENT_ID = '1526694025757851819';
  let proSession = null, proTier = 'free';

  function proProxy(path, opts = {}) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'csrp:pro', path, ...opts }, (resp) => {
          if (chrome.runtime.lastError || !resp) return resolve({ ok: false });
          resolve(resp);
        });
      } catch { resolve({ ok: false }); }
    });
  }
  const jwtExp = (t) => { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp || 0; } catch { return 0; } };
  const proValid = (s) => !!(s && s.token && s.exp && s.exp * 1000 > Date.now() + 30000);

  function loadPro() {
    return new Promise((r) => chrome.storage.local.get([JWT_KEY], (d) => { proSession = (d && d[JWT_KEY]) || null; r(proSession); }));
  }
  async function proSignIn() {
    if (proValid(proSession)) return proSession;
    const redirectUri = chrome.identity.getRedirectURL();
    const authUrl = 'https://discord.com/api/oauth2/authorize?' + new URLSearchParams({
      client_id: DISCORD_CLIENT_ID, response_type: 'code', redirect_uri: redirectUri, scope: 'identify', prompt: 'consent',
    }).toString();
    const redirect = await new Promise((res) => {
      try { chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (r) => res(chrome.runtime.lastError ? null : r)); }
      catch { res(null); }
    });
    if (!redirect) return null;
    const code = new URL(redirect).searchParams.get('code');
    if (!code) return null;
    const resp = await proProxy('/auth/exchange', { method: 'POST', body: { code, redirectUri } });
    if (!resp.ok || !resp.data || !resp.data.token) return null;
    proSession = { token: resp.data.token, exp: jwtExp(resp.data.token), user: resp.data.user || null };
    chrome.storage.local.set({ [JWT_KEY]: proSession });
    return proSession;
  }
  function reflectPro() {
    const signedIn = proValid(proSession);
    const st = $('#pro-status');
    if (st) st.textContent = signedIn
      ? `${proSession.user?.name || 'Signed in'} · ${proTier === 'premium' ? 'Premium' : proTier === 'pro' ? 'Pro' : 'Free'}`
      : 'Not signed in';
    $('#pro-signin').hidden = signedIn;
    $('#pro-signout').hidden = !signedIn;
    $('#hide-banners-set').hidden = !(signedIn && (proTier === 'pro' || proTier === 'premium'));
    const area = (chrome.storage && chrome.storage.sync) ? chrome.storage.sync : chrome.storage.local;
    area.get(['hideBanners'], (d) => { $('#pop-hide-banners')?.classList.toggle('on', d.hideBanners === true); });
  }
  async function refreshPro() {
    if (!proValid(proSession)) { proTier = 'free'; reflectPro(); return; }
    const resp = await proProxy('/me', { token: proSession.token });
    if (resp.ok && resp.data) { proTier = resp.data.tier || 'free'; proSession.user = proSession.user || resp.data.user; }
    reflectPro();
  }
  function bindProAccount() {
    loadPro().then(() => {
      reflectPro();
      if (proValid(proSession)) refreshPro();
    });
    $('#pro-signin')?.addEventListener('click', async () => {
      snd('click'); $('#pro-signin').disabled = true;
      const s = await proSignIn(); $('#pro-signin').disabled = false;
      if (!s) return toast('Sign-in failed or cancelled');
      await refreshPro(); toast('Signed in');
    });
    $('#pro-signout')?.addEventListener('click', () => {
      proSession = null; proTier = 'free'; chrome.storage.local.remove(JWT_KEY); reflectPro(); snd('off');
    });
    $('#pop-hide-banners')?.addEventListener('click', () => {
      const el = $('#pop-hide-banners');
      const on = !el.classList.contains('on');
      el.classList.toggle('on', on);
      snd(on ? 'on' : 'off');
      const area = (chrome.storage && chrome.storage.sync) ? chrome.storage.sync : chrome.storage.local;
      area.set({ hideBanners: on });
      if (area !== chrome.storage.local) chrome.storage.local.set({ hideBanners: on });
    });
  }

  function bindDocs() {
    const open = (e) => {
      e.preventDefault();
      snd('click');
      chrome.tabs.create({ url: chrome.runtime.getURL('docs/docs.html') });
    };
    $('#docs-link')?.addEventListener('click', open);
    $('#side-docs')?.addEventListener('click', open);
  }


  function cmpVer(a, b) {
    const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return d;
    }
    return 0;
  }


  SA.get(Object.keys(DEFAULTS), (data) => {
    state = { ...DEFAULTS, ...data };
    state.inviteFriends = state.inviteFriends || {};
    state.banPriority = reconcileMaps(state.banPriority);

    if (!['today', 'yesterday', 'last10'].includes(state.statsPeriod)) {
      save('statsPeriod', 'last10');
    }
    applyTheme();
    bindNav();
    bindToggles();
    bindPeriod();
    bindTheme();
    bindAccept();
    bindSound();
    bindFeedback();
    bindDocs();
    bindStudio();
    renderMaps();
    reflectMaster();
    showVersion();
    renderChangelog();
    bindModal();
    loadLiveUsers();
    if (state.autoUpdate) checkForUpdate(false);
  });
})();
