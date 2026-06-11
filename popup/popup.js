/* CSR+ popup controller — sidebar tabs, settings, friends, veto, sound. */
(() => {
  'use strict';

  // Settings live in storage.sync (survives reloads/reinstalls) — must match
  // the content-script store. Falls back to local where sync is unavailable.
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
    theme: 'black',
    useCsrpTrades: false, tradesPromptDismissed: false,
  };

  let state = { ...DEFAULTS };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // ── popup-local sound player ─────────────────────────────────────────
  const sndCache = {};
  function snd(name) {
    if (!state.soundEnabled) return;
    try {
      let a = sndCache[name];
      if (!a) { a = new Audio(chrome.runtime.getURL(`assets/sounds/${name}.wav`)); sndCache[name] = a; }
      const n = a.cloneNode(true);
      n.volume = state.soundVolume;
      n.play().catch(() => { });
    } catch { /* ignore */ }
  }

  function save(key, value) {
    state[key] = value;
    SA.set({ [key]: value });
  }

  // For sliders: they fire one input event per pixel, but storage.sync only
  // allows ~120 writes/min — past that, writes fail silently and the final
  // value is lost. Update local state immediately, trail the actual write.
  const saveTimers = {};
  function saveDebounced(key, value, ms = 250) {
    state[key] = value;
    clearTimeout(saveTimers[key]);
    saveTimers[key] = setTimeout(() => SA.set({ [key]: value }), ms);
  }

  // ── toasts ───────────────────────────────────────────────────────────
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

  // ── tabs ─────────────────────────────────────────────────────────────
  function bindNav() {
    $$('.nav-i').forEach((btn) => {
      btn.addEventListener('mouseenter', () => snd('hover'));
      btn.addEventListener('click', () => {
        snd('click');
        const tab = btn.dataset.tab;
        $$('.nav-i').forEach((b) => b.classList.toggle('active', b === btn));
        $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
        if (tab === 'friends') loadFriends();
      });
    });
  }

  // ── toggles (.set rows with data-key) ────────────────────────────────
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
        if (key === 'acceptInstant' && bindAccept._sync) bindAccept._sync();
      });
    });
  }

  function reflectInvite() {
    // nothing structural; friends tab note already explains empty = all
  }
  function reflectMaster() {
    document.querySelector('.content').style.opacity = state.masterEnabled ? '1' : '0.45';
  }

  // ── period segment ───────────────────────────────────────────────────
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

  // ── theme ────────────────────────────────────────────────────────────
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

  // ── accept settings (countdown delay) ────────────────────────────────
  function bindAccept() {
    const delay = $('#delay');
    const val = $('#delay-val');
    const sync = () => {
      val.textContent = `${state.acceptDelay}s`;
      // The delay only matters when not accepting instantly.
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
    // Re-sync when the instant toggle flips (handled in bindToggles callback).
    bindAccept._sync = sync;
  }

  // ── sound controls ───────────────────────────────────────────────────
  function bindSound() {
    const vol = $('#vol');
    vol.value = Math.round(state.soundVolume * 100);
    vol.addEventListener('input', () => { saveDebounced('soundVolume', vol.value / 100); });
    vol.addEventListener('change', () => snd('click'));
    $('#test-sound').addEventListener('click', () => snd('accept'));
  }

  // ── feedback: copy Discord username ──────────────────────────────────
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
  }

  // ── friends ──────────────────────────────────────────────────────────
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
          <span class="fchk">✓</span>`;
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

  // Reconcile a saved priority list against the canonical default: append any
  // new maps (e.g. Cobblestone) the user has never seen, drop any that no
  // longer exist. Keeps the user's existing ordering for maps they do have.
  function reconcileMaps(saved) {
    const canon = DEFAULTS.banPriority;
    const list = Array.isArray(saved) ? saved.filter((m) => canon.includes(m)) : [];
    for (const m of canon) if (!list.includes(m)) list.push(m);
    return list;
  }

  // ── map priority drag list ───────────────────────────────────────────
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
    bindDrag(ul); // binds exactly once (guarded), refreshes labels every render
  }

  // Update rank numbers + first/last labels after a reorder, without rebuilding
  // the DOM (rebuilding mid-interaction is what made every row jump).
  function refreshMapLabels(ul) {
    const items = $$('.map', ul);
    const last = items.length - 1;
    items.forEach((li, i) => {
      li.querySelector('.rank').textContent = i + 1;
      li.querySelector('.pri').textContent = i === 0 ? 'ban first' : i === last ? 'keep' : '';
    });
  }

  function bindDrag(ul) {
    if (dragBound) return; // listeners must be attached only once
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

  // ── live users counter ───────────────────────────────────────────────
  // Free hosted counter. Increments once per popup open (throttled to 1/hour
  // per install) and shows the community total. Fails silent.
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
      // hide the row entirely if the counter is unreachable
      const row = $('#live-users');
      if (row) row.style.display = 'none';
    } finally {
      numEl.classList.remove('loading');
    }
  }

  // ── about: version, links, changelog ─────────────────────────────────
  const REPO = 'queryery/CSR-PLUS';

  function showVersion() {
    const v = chrome.runtime.getManifest().version;
    $('#about-ver').textContent = `v${v}`;
    const sv = $('#side-ver');
    if (sv) sv.textContent = `v${v}`;
  }

  // Render a short "what's new" list from the bundled CHANGELOG.md (latest
  // release block only — no network needed).
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

  // ── update check ─────────────────────────────────────────────────────
  // Ask GitHub for the latest release. On a background (auto) check we cache the
  // result for an hour; a manual check always hits the network. `manual` also
  // surfaces "you're up to date" / error toasts so the button gives feedback.
  async function fetchLatest(useCache) {
    if (useCache) {
      const cached = JSON.parse(localStorage.getItem('csrp:update') || 'null');
      if (cached && Date.now() - cached.at < 3600e3) return cached;
    }
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
    // 404 = the repo simply has no published release yet (not an error).
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

  // Returns >0 if a is newer than b. Numeric, dot-separated.
  function cmpVer(a, b) {
    const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return d;
    }
    return 0;
  }

  // ── boot ─────────────────────────────────────────────────────────────
  SA.get(Object.keys(DEFAULTS), (data) => {
    state = { ...DEFAULTS, ...data };
    state.inviteFriends = state.inviteFriends || {};
    state.banPriority = reconcileMaps(state.banPriority);
    // Migrate the retired 'all' period (and anything unknown) to 'last10'.
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
    renderMaps();
    reflectMaster();
    showVersion();
    renderChangelog();
    bindModal();
    loadLiveUsers();
    if (state.autoUpdate) checkForUpdate(false);
  });
})();
