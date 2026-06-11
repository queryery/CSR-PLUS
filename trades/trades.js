/* CSR+ trade composer. Pick a friend, load both inventories with full
 * float/seed/wear/StatTrak data (so you can actually see what you're getting),
 * select items + coins on each side, and send the offer through the API.
 *
 * Endpoints (all relative to https://api.csrestored.fun, proxied via the SW):
 *   GET  /users/friends          → friends list
 *   GET  /inventory/             → my inventory
 *   GET  /users/{id}/inventory   → a friend's inventory
 *   POST /api/trades             → send the offer
 */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);

  // ── UI sound (reads soundEnabled / soundVolume from storage) ─────────────
  let sndCfg = { soundEnabled: true, soundVolume: 0.6 };
  try {
    chrome.storage.local.get(['soundEnabled', 'soundVolume'], (d) => {
      if (d && typeof d.soundEnabled === 'boolean') sndCfg.soundEnabled = d.soundEnabled;
      if (d && typeof d.soundVolume === 'number') sndCfg.soundVolume = d.soundVolume;
    });
  } catch { /* ignore */ }
  const sndCache = {};
  // `scale` lets callers play a quieter cue (e.g. tab switches were too loud).
  function snd(name, scale = 1) {
    if (!sndCfg.soundEnabled) return;
    try {
      let a = sndCache[name];
      if (!a) { a = new Audio(chrome.runtime.getURL(`assets/sounds/${name}.wav`)); sndCache[name] = a; }
      const n = a.cloneNode(true);
      n.volume = Math.max(0, Math.min(1, sndCfg.soundVolume * scale));
      n.play().catch(() => {});
    } catch { /* ignore */ }
  }

  // ── API via the background SW (avoids the page's CORS policy) ────────────
  function api(path, { method = 'GET', body } = {}) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'csrp:api', path, method, body }, (resp) => {
        if (chrome.runtime.lastError || !resp) return resolve({ ok: false, error: 'No response from background' });
        resolve(resp);
      });
    });
  }

  // ── helpers shared with the inventory viewer ─────────────────────────────
  const iconUrl = (weaponId) =>
    weaponId != null ? `https://cdn.csrestored.fun/skins/${weaponId}.png` : null;

  // Inventory schema quirk: the field names are NOT consistent between
  // /inventory/ (mine) and /users/{id}/inventory (a friend's). In one the
  // unique per-item INSTANCE id is `weapon_id`, in the other it's `item_id` —
  // the fields are effectively swapped. The instance id (what the trade API
  // needs) is always the LARGE value; the skin/definition+image id is the small
  // one (low thousands). So we pick by magnitude, not by field name.
  //   item_type/rarity come back as strings ("9","3") → coerce to numbers.
  const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
  // Instance ids can exceed Number.MAX_SAFE_INTEGER (the background quotes 16+
  // digit ints for exactly this reason), so keep them as exact digit STRINGS
  // and compare magnitude without ever going through Number.
  const rawDigits = (v) => { const s = String(v ?? '').trim(); return /^\d+$/.test(s) ? s : null; };
  const digitsGt = (a, b) => (a.length === b.length ? a > b : a.length > b.length);
  function instanceAndImage(it) {
    const a = rawDigits(it.weapon_id);
    const b = rawDigits(it.item_id);
    if (a == null && b == null) return { instance: null, image: null };
    if (a == null) return { instance: b, image: b };
    if (b == null) return { instance: a, image: a };
    // Larger = unique instance id (trade id); smaller = skin/image definition id.
    return digitsGt(a, b) ? { instance: a, image: b } : { instance: b, image: a };
  }
  function normalize(raw) {
    const it = raw || {};
    const { instance, image } = instanceAndImage(it);
    return {
      raw: it,
      id: instance != null ? String(instance) : null, // unique instance id (trade id)
      defId: image,                                    // skin/image definition id
      name: it.name || 'Unknown item',
      weapon_id: image,                                // CDN icon key (cdn/skins/{image}.png)
      float: num(it.float),
      seed: num(it.seed),
      rarity: num(it.rarity) ?? 0,
      item_type: num(it.item_type) ?? 0,
      stattrak: !!it.stattrak,
      stattrak_count: num(it.stattrak_count) || 0,
      nametag: it.nametag || null,
    };
  }

  const TYPES = { 1: 'Knife', 2: 'Rifle', 3: 'Heavy', 4: 'Pistol', 5: 'SMG', 8: 'Container', 9: 'Agent', 10: 'Sticker' };
  const typeName = (t) => TYPES[t] || 'Other';

  const RARITY = {
    1: { name: 'Consumer', c: '#b0c3d9' }, 2: { name: 'Industrial', c: '#5e98d9' },
    3: { name: 'Mil-Spec', c: '#4b69ff' }, 4: { name: 'Restricted', c: '#8847ff' },
    5: { name: 'Classified', c: '#d32ce6' }, 6: { name: 'Covert', c: '#eb4b4b' },
    7: { name: 'Contraband', c: '#e4ae39' },
  };
  const rarity = (r) => RARITY[Number(r)] || { name: '', c: '#9aa0ad' };

  function wear(f) {
    if (f == null) return null;
    if (f < 0.07) return { code: 'FN', c: '#4ade80' };
    if (f < 0.15) return { code: 'MW', c: '#86efac' };
    if (f < 0.38) return { code: 'FT', c: '#fbbf24' };
    if (f < 0.45) return { code: 'WW', c: '#fb923c' };
    return { code: 'BS', c: '#f87171' };
  }

  function splitName(name) {
    const star = /^★\s*/.test(name);
    const clean = String(name || '').replace(/^★\s*/, '').trim();
    const [weapon, skin] = clean.split('|').map((s) => s.trim());
    return { star, weapon: weapon || clean, skin: skin || '' };
  }

  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Inline gold coin chip (disc + amount) used in summaries.
  const coinChip = (n) => `<span class="coin-chip"><span class="coin-mini"></span>${Number(n).toLocaleString()}</span>`;

  // Items are normalized on load, so the id lives on `.id`.
  const itemId = (it) => it.id ?? null;

  function uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  // ── state ────────────────────────────────────────────────────────────────
  const state = {
    friends: [],
    partner: null,            // { id, name, avatar }
    activeSide: 'me',         // which tab/panel is showing
    themLoaded: false,        // lazy-load guard for the partner's inventory
    me: { items: [], coins: null, sel: new Set(), q: '', sort: 'rarity', cat: 'all', loaded: false },
    them: { items: [], coins: null, sel: new Set(), q: '', sort: 'rarity', cat: 'all', loaded: false },
    sending: false,
  };

  // ── friend picker ─────────────────────────────────────────────────────────
  function friendCard(f) {
    const id = String(f.id ?? f.discord_id ?? '');
    const name = f.name || f.username || 'Player';
    const avatar = f.avatar ? `https://cdn.discordapp.com/avatars/${id}/${f.avatar}.png?size=64` : '';
    const btn = el('button', 'friend');
    btn.dataset.name = name.toLowerCase();
    btn.innerHTML =
      (avatar ? `<img class="fr-av" src="${avatar}" alt="" />` : '<div class="fr-av"></div>') +
      `<div class="fr-info"><div class="fr-name">${esc(name)}</div><div class="fr-sub">#${esc(id.slice(-6))}</div></div>`;
    btn.addEventListener('mouseenter', () => snd('hover'));
    btn.addEventListener('click', () => { snd('click'); selectFriend({ id, name, avatar }); });
    return btn;
  }

  function renderFriends() {
    const grid = $('#friend-grid');
    const empty = $('#friend-empty');
    const q = $('#friend-search').value.trim().toLowerCase();
    grid.innerHTML = '';
    const list = state.friends.filter((f) => !q || (f.name || f.username || '').toLowerCase().includes(q));
    if (!list.length) {
      grid.append(el('div', 'empty', state.friends.length ? 'No friends match your search.' : 'No friends found. Add friends on csrestored.fun first.'));
      return;
    }
    list.forEach((f) => grid.append(friendCard(f)));
    if (empty) empty.remove();
  }

  async function loadFriends() {
    const resp = await api('/users/friends');
    const data = resp.ok ? resp.data : null;
    state.friends = Array.isArray(data) ? data : [];
    renderFriends();
  }

  // ── inventory grids ────────────────────────────────────────────────────────
  const gridSel = (side) => (side === 'me' ? '#me-grid' : '#them-grid');

  function card(it, side) {
    const id = itemId(it);
    const { star, weapon, skin } = splitName(it.name);
    const rar = rarity(it.rarity);
    const w = wear(it.float);
    // Icon: try the image (small) id first, then the instance (large) id as a
    // fallback, since the CDN key isn't consistent across inventory endpoints.
    const iconIds = [...new Set([it.weapon_id, it.id].filter((x) => x != null).map(String))];
    const iconUrls = iconIds.map((x) => iconUrl(x));

    const c = el('div', 'card');
    c.style.setProperty('--rc', rar.c);
    if (id != null) c.dataset.id = String(id);
    if (id != null && state[side].sel.has(String(id))) c.classList.add('selected');

    const st = it.stattrak ? `<span class="c-st">ST™${it.stattrak_count ? ' ' + it.stattrak_count : ''}</span>` : '<span></span>';
    const wearTop = w ? `<span class="c-wear-code" style="color:${w.c}">${w.code}</span>` : '<span></span>';
    const img = iconUrls.length ? '<img class="c-img" alt="" />' : '';
    const floatBadge = w
      ? `<span class="c-float" style="color:${w.c};border-color:${w.c}55"><span class="c-dot" style="background:${w.c}"></span>${w.code} · ${Number(it.float).toFixed(4)}</span>`
      : '';
    const seedBadge = it.seed != null ? `<span class="c-seed">#${Math.round(it.seed)}</span>` : '';
    const tag = it.nametag ? `<span class="c-nametag" title="Name tag">“${esc(it.nametag)}”</span>` : '';

    c.innerHTML = `
      <span class="c-strip"></span>
      <div class="c-top">${st}${wearTop}</div>
      <div class="c-art">${img}<div class="c-fallback">${esc(typeName(it.item_type))}</div></div>
      <div class="c-meta">
        <div class="c-name">${star ? '<span class="c-star">★</span>' : ''}${esc(weapon)}</div>
        <div class="c-skin">${esc(skin || rar.name)}</div>
      </div>
      <div class="c-badges">${floatBadge}${seedBadge}</div>${tag}`;

    // Walk the candidate icon URLs, falling back on each 404.
    const imgEl = c.querySelector('.c-img');
    if (imgEl) {
      let ii = 0;
      const tryNext = () => { if (ii >= iconUrls.length) { c.classList.add('noimg'); return; } imgEl.src = iconUrls[ii++]; };
      imgEl.addEventListener('error', tryNext);
      tryNext();
    } else {
      c.classList.add('noimg');
    }

    c.addEventListener('click', () => {
      if (id == null) return; // can't trade an item with no id
      const key = String(id);
      const sel = state[side].sel;
      if (sel.has(key)) { sel.delete(key); c.classList.remove('selected'); }
      else { sel.add(key); c.classList.add('selected'); }
      snd('click');
      updateTabBadges();
      updateSummary();
    });
    return c;
  }

  function visibleItems(side) {
    const s = state[side];
    let list = s.items;
    if (s.cat !== 'all') list = list.filter((it) => String(it.item_type) === s.cat);
    if (s.q) list = list.filter((it) => String(it.name || '').toLowerCase().includes(s.q));
    list = list.slice();
    if (s.sort === 'rarity') list.sort((a, b) => (b.rarity - a.rarity) || String(a.name).localeCompare(String(b.name)));
    else if (s.sort === 'float') list.sort((a, b) => (a.float ?? 99) - (b.float ?? 99));
    else list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return list;
  }

  // Lazy, scroll-driven rendering. We build a first page up front and append
  // more pages as the user nears the bottom of the grid's own scroll area, so
  // even a 1000-item inventory paints instantly. Each card animates in on mount.
  const PAGE = 50;          // cards added per batch
  const scrollHandlers = { me: null, them: null };

  function renderSide(side) {
    const gridEl = $(gridSel(side));
    const s = state[side];

    // Detach the previous scroll handler before rebuilding.
    if (scrollHandlers[side]) { gridEl.removeEventListener('scroll', scrollHandlers[side]); scrollHandlers[side] = null; }
    gridEl.innerHTML = '';
    gridEl.scrollTop = 0; // reset to top whenever the list changes / tab opens

    const list = visibleItems(side);
    s.view = list;
    s.shown = 0;

    if (!list.length) {
      gridEl.append(el('div', 'empty', s.items.length ? 'No items match these filters.' : 'No tradable items.'));
      updateCount(side);
      return;
    }

    const appendPage = () => {
      if (s.shown >= list.length) return true;
      const frag = document.createDocumentFragment();
      const end = Math.min(s.shown + PAGE, list.length);
      for (let i = s.shown; i < end; i++) frag.appendChild(card(list[i], side));
      s.shown = end;
      gridEl.appendChild(frag);
      return s.shown >= list.length;
    };

    // Keep filling until the grid scrolls (so there's always something below the
    // fold to reveal), then load the next page when the user nears the bottom.
    const fill = () => {
      let guard = 0;
      while (gridEl.scrollHeight <= gridEl.clientHeight + 80 && guard++ < 40) {
        if (appendPage()) break;
      }
    };

    appendPage();
    fill();
    updateCount(side);
    if (s.shown >= list.length) return;

    // Prefetch the next page well before the bottom (1200px), and append on the
    // next animation frame so it never blocks the scroll — keeps it smooth.
    let queued = false;
    const onScroll = () => {
      if (queued || s.shown >= list.length) return;
      if (gridEl.scrollTop + gridEl.clientHeight < gridEl.scrollHeight - 1200) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        appendPage();
        if (s.shown >= list.length) { gridEl.removeEventListener('scroll', onScroll); scrollHandlers[side] = null; }
      });
    };
    gridEl.addEventListener('scroll', onScroll, { passive: true });
    scrollHandlers[side] = onScroll;
  }

  function buildCats(side) {
    const s = state[side];
    const box = $(side === 'me' ? '#me-cats' : '#them-cats');
    const counts = {};
    for (const it of s.items) counts[it.item_type] = (counts[it.item_type] || 0) + 1;
    box.innerHTML = '';
    const mk = (val, label, n) => {
      const b = el('button', 'chip' + (s.cat === val ? ' on' : ''), `${esc(label)}<span class="chip-n">${n}</span>`);
      b.addEventListener('click', () => { s.cat = val; snd('click'); buildCats(side); renderSide(side); });
      return b;
    };
    box.append(mk('all', 'All', s.items.length));
    Object.keys(counts).sort((a, b) => counts[b] - counts[a])
      .forEach((t) => box.append(mk(String(t), typeName(Number(t)), counts[t])));
  }

  function skeletons(side) {
    $(gridSel(side)).innerHTML = Array.from({ length: 12 }, () => '<div class="card-skel"></div>').join('');
  }

  function updateCount(side) {
    $(side === 'me' ? '#me-count' : '#them-count').textContent = `${state[side].sel.size} selected`;
  }

  function updateTabBadges() {
    for (const side of ['me', 'them']) {
      const badge = $(side === 'me' ? '#me-badge' : '#them-badge');
      const n = state[side].sel.size;
      if (badge.textContent !== String(n)) {
        badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump');
      }
      badge.textContent = String(n);
      badge.classList.toggle('empty', n === 0);
    }
  }

  // Drop selections whose ids are no longer present in the (re)loaded inventory.
  function pruneSelection(side) {
    const ids = new Set(state[side].items.map((it) => String(itemId(it))));
    for (const k of [...state[side].sel]) if (!ids.has(k)) state[side].sel.delete(k);
  }

  // Pull the item array out of whatever envelope the endpoint returned.
  const itemsOf = (data) => Array.isArray(data) ? data
    : (Array.isArray(data?.items) ? data.items
    : (Array.isArray(data?.inventory) ? data.inventory : []));
  const hasItems = (data) => itemsOf(data).length > 0;

  function ingest(side, data) {
    const arr = itemsOf(data);
    state[side].items = arr.map(normalize).filter((it) => it.id != null);
    const coins = data && (data.coins ?? data.balance ?? data.wallet);
    if (typeof coins === 'number') state[side].coins = coins;
    state[side].loaded = true;
    pruneSelection(side);
  }

  // Fetch + ingest an inventory, but only paint the grid if that side's tab is
  // active right now. Inactive sides paint when their tab is opened (perf) — the
  // data is already loaded, so the switch is instant.
  function paintIfActive(side) {
    buildCats(side);
    if (state.activeSide === side) renderSide(side);
    else state[side].dirty = true; // render on next tab open
    applyCoinCaps();
  }

  // Resolve the logged-in user from /users/@me (carries our id + coin balance),
  // cached for the session. Falls back to a stashed id from the content script.
  let mePromise = null;
  function getMe() {
    if (mePromise) return mePromise;
    mePromise = (async () => {
      const resp = await api('/users/@me');
      const me = resp.ok && resp.data && (resp.data.id || resp.data.discord_id) ? resp.data : null;
      if (me) return me;
      // Fallback: id the content script captured from the page's React state.
      const stashed = await new Promise((res) => {
        try { chrome.storage.local.get(['csrpMyId'], (d) => res(d && d.csrpMyId ? String(d.csrpMyId) : null)); }
        catch { res(null); }
      });
      return stashed ? { id: stashed } : null;
    })();
    return mePromise;
  }

  async function loadMyInventory() {
    if (state.me.loaded) return;
    if (state.activeSide === 'me') skeletons('me');
    const me = await getMe();
    // Seed our coin balance from the profile so the cap is right even if the
    // inventory response doesn't include it.
    if (me && typeof me.coins === 'number') state.me.coins = me.coins;
    // Load our inventory exactly like a friend's: /users/{id}/inventory.
    let resp = me && me.id ? await api(`/users/${me.id}/inventory`) : null;
    if (!resp || !resp.ok || !hasItems(resp.data)) resp = await api('/inventory/');
    ingest('me', resp.ok ? resp.data : null);
    paintIfActive('me');
  }

  async function loadTheirInventory(id) {
    if (state.themLoaded && state.them.loaded) return;
    state.themLoaded = true;
    if (state.activeSide === 'them') skeletons('them');
    const resp = await api(`/users/${id}/inventory`);
    // Stale response: the user backed out or picked someone else while this
    // was in flight — don't overwrite the current partner's inventory.
    if (!state.partner || String(state.partner.id) !== String(id)) return;
    ingest('them', resp.ok ? resp.data : null);
    paintIfActive('them');
    const sub = $('#them-sub');
    if (sub) sub.textContent = `${state.them.items.length} item${state.them.items.length === 1 ? '' : 's'}`;
  }

  // ── coin inputs: integers ≥ 0, capped to owned balance when known ─────────
  function readCoins(input) {
    const v = Math.floor(Number(input.value));
    return Number.isFinite(v) && v > 0 ? v : 0;
  }
  function clampCoin(input, max) {
    let v = Math.floor(Number(input.value));
    if (!Number.isFinite(v) || v < 0) v = 0;
    if (max != null && v > max) v = max;
    // Reflect the sanitised value back so the user never sees "-5" or "1e9".
    if (String(v) !== input.value) input.value = String(v);
    input.classList.remove('invalid');
  }
  function applyCoinCaps() {
    const me = $('#me-coins'), them = $('#them-coins');
    if (state.me.coins != null) me.max = state.me.coins;
    if (state.them.coins != null) them.max = state.them.coins;
    clampCoin(me, state.me.coins);
    clampCoin(them, state.them.coins);
    $('#me-bal').textContent = state.me.coins != null ? `of ◎${state.me.coins.toLocaleString()}` : '';
    $('#them-bal').textContent = state.them.coins != null ? `of ◎${state.them.coins.toLocaleString()}` : '';
    updateSummary();
  }

  function bindCoinInput(input, side) {
    const guard = () => {
      // Block the characters that would let a negative/exponent through.
      input.value = input.value.replace(/[^\d]/g, '');
    };
    input.addEventListener('keydown', (e) => {
      if (['-', '+', 'e', 'E', '.', ','].includes(e.key)) e.preventDefault();
    });
    input.addEventListener('input', () => { guard(); clampCoin(input, state[side].coins); updateSummary(); });
    input.addEventListener('blur', () => { clampCoin(input, state[side].coins); updateSummary(); });
  }

  // ── summary + validity ────────────────────────────────────────────────────
  function offer() {
    return {
      give: { items: [...state.me.sel], coins: readCoins($('#me-coins')) },
      get: { items: [...state.them.sel], coins: readCoins($('#them-coins')) },
    };
  }
  function updateSummary() {
    const o = offer();
    $('#sum-give').innerHTML = `${o.give.items.length} item${o.give.items.length === 1 ? '' : 's'} · ${coinChip(o.give.coins)}`;
    $('#sum-get').innerHTML = `${o.get.items.length} item${o.get.items.length === 1 ? '' : 's'} · ${coinChip(o.get.coins)}`;
    updateCount('me'); updateCount('them');
    const empty = !o.give.items.length && !o.give.coins && !o.get.items.length && !o.get.coins;
    $('#send-btn').disabled = state.sending || !state.partner || empty;
  }

  function showMsg(text, kind) {
    const m = $('#form-msg');
    m.hidden = false;
    m.className = 'form-msg ' + (kind || '');
    m.textContent = text;
  }
  function clearMsg() { const m = $('#form-msg'); m.hidden = true; m.textContent = ''; }

  // ── tab switching: only the active side's grid is mounted (perf) ──────────
  function switchSide(side) {
    if (state.activeSide === side) return;
    state.activeSide = side;
    snd('hover', 0.5); // soft, quiet cue — full 'click' was too loud here
    document.querySelectorAll('.ttab').forEach((t) => t.classList.toggle('active', t.dataset.side === side));
    document.querySelectorAll('.side-panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === side));
    // If this side finished loading while it was hidden, paint it now (renderSide
    // resets the scroll). Otherwise just snap the already-painted grid to the top.
    if (state[side].loaded && state[side].dirty) { state[side].dirty = false; renderSide(side); }
    else if (side === 'them' && state.partner && !state.themLoaded) loadTheirInventory(state.partner.id);
    else { const g = document.querySelector(gridSel(side)); if (g) g.scrollTop = 0; }
  }

  // ── step switching ──────────────────────────────────────────────────────────
  function selectFriend(partner) {
    state.partner = partner;
    state.them = { items: [], coins: null, sel: new Set(), q: '', sort: 'rarity', cat: 'all', loaded: false };
    state.themLoaded = false;
    // Start every offer clean — clear MY previous selection + coins too, so items
    // and coins from the last offer don't carry over into a new one.
    state.me.sel.clear();
    state.me.q = '';
    $('#me-search').value = '';
    $('#me-coins').value = '0';
    $('#them-search').value = '';
    $('#them-coins').value = '0';
    $('#them-cats').innerHTML = '';
    $('#them-grid').innerHTML = '<div class="empty">Open this tab to load their items.</div>';
    $('#step-friend').hidden = true;
    $('#step-compose').hidden = false;
    clearMsg();

    $('#pb-av').style.backgroundImage = partner.avatar ? `url(${partner.avatar})` : '';
    $('#pb-av').style.backgroundSize = 'cover';
    $('#pb-name').textContent = `Trading with ${partner.name}`;
    $('#them-coin-label').textContent = `Coins you request from ${partner.name}`;
    $('#them-sub').textContent = `${partner.name} · loading…`;

    // Show YOUR side first; load BOTH inventories in parallel so each is ready
    // the moment its tab is opened (only the active grid paints up front).
    state.activeSide = 'them'; switchSide('me');
    // If my inventory was already loaded, repaint it so the cleared selection
    // is reflected (switchSide won't re-render an already-painted side).
    if (state.me.loaded) renderSide('me');
    updateTabBadges();
    updateSummary();
    loadMyInventory();
    loadTheirInventory(partner.id);
  }

  function backToFriends() {
    state.partner = null;
    $('#step-compose').hidden = true;
    $('#step-friend').hidden = false;
    renderFriends();
  }

  // ── trade status overlay ──────────────────────────────────────────────────
  // Human-readable label for one side: item count + coins (e.g. "2 items · ◎500").
  function partsLabel(itemCount, coins) {
    const bits = [];
    if (itemCount) bits.push(`${itemCount} item${itemCount === 1 ? '' : 's'}`);
    if (coins) bits.push(coinChip(coins));
    return bits.length ? bits.join(' · ') : 'nothing';
  }

  function showOverlay(o, ref) {
    $('#to-give').innerHTML = partsLabel(o.give.items.length, o.give.coins);
    $('#to-get').innerHTML = partsLabel(o.get.items.length, o.get.coins);
    const card = $('#to-card');
    card.classList.remove('ok', 'err');
    $('#to-icon').innerHTML = '<span class="to-spinner"></span>';
    $('#to-title').textContent = 'Sending trade offer…';
    $('#to-sub').textContent = `Submitting your offer to ${state.partner.name}.`;
    $('#to-detail').hidden = false;
    $('#to-actions').hidden = true;
    $('#to-meta').innerHTML = `<span>Ref</span> <b>${esc(ref)}</b>`;
    $('#trade-overlay').hidden = false;
  }

  function overlayResult(ok, info) {
    const card = $('#to-card');
    card.classList.add(ok ? 'ok' : 'err');
    $('#to-icon').innerHTML = ok ? '✓' : '✕';
    $('#to-title').textContent = ok ? 'Trade offer sent' : 'Offer not sent';
    $('#to-sub').textContent = ok
      ? `Your offer to ${state.partner.name} is now pending their response.`
      : (info.error || 'The server rejected this offer.');
    const meta = [`<span>Status</span> <b>${ok ? 'Pending' : 'Failed'}</b>`];
    if (info.id) meta.push(`<span>Trade ID</span> <b>${esc(String(info.id))}</b>`);
    meta.push(`<span>Ref</span> <b>${esc(info.ref)}</b>`);
    $('#to-meta').innerHTML = meta.join(' &nbsp;·&nbsp; ');
    $('#to-actions').hidden = false;
  }

  function hideOverlay() { $('#trade-overlay').hidden = true; }

  // ── send ────────────────────────────────────────────────────────────────────
  async function send() {
    if (state.sending || !state.partner) return;
    const o = offer();
    if (!o.give.items.length && !o.give.coins && !o.get.items.length && !o.get.coins) {
      showMsg('Add at least one item or some coins to trade.', 'err');
      return;
    }
    if (state.me.coins != null && o.give.coins > state.me.coins) {
      showMsg(`You only have ◎${state.me.coins.toLocaleString()} to offer.`, 'err');
      return;
    }

    state.sending = true;
    $('#send-btn').disabled = true;
    clearMsg();

    const ref = uuid();
    showOverlay(o, ref);
    const startedAt = Date.now();

    // The API expects the item arrays as integer weapon_ids (not strings). Only
    // send ids that are actually present in the matching loaded inventory, so a
    // stale selection can't trigger "item doesn't belong to you".
    // The ids can exceed Number.MAX_SAFE_INTEGER, so the JSON body is built by
    // hand with the ids as raw (unquoted) integers — JSON.stringify would have
    // to round them through Number first. The background sends string bodies
    // through untouched.
    const ownIds = new Set(state.me.items.map((it) => String(it.id)));
    const theirIds = new Set(state.them.items.map((it) => String(it.id)));
    const idList = (arr, owned) => '[' +
      arr.map(String).filter((x) => owned.has(x) && /^\d+$/.test(x)).join(',') + ']';
    const body =
      `{"recipient_id":"${String(state.partner.id).replace(/[^\d]/g, '')}",` +
      `"initiator_items":${idList(o.give.items, ownIds)},` +
      `"initiator_coins":${o.give.coins},` +
      `"recipient_items":${idList(o.get.items, theirIds)},` +
      `"recipient_coins":${o.get.coins},` +
      `"client_ref":"${ref}"}`;

    const resp = await api('/api/trades', { method: 'POST', body });
    // Keep the loading state visible briefly so it never flashes by.
    const elapsed = Date.now() - startedAt;
    if (elapsed < 550) await new Promise((r) => setTimeout(r, 550 - elapsed));
    state.sending = false;

    if (resp.ok) {
      snd('click');
      const id = resp.data && (resp.data.id || resp.data.trade_id || resp.data.trade?.id);
      overlayResult(true, { id, ref });
      // Reset selections so a second offer starts clean.
      state.me.sel.clear(); state.them.sel.clear();
      $('#me-coins').value = '0'; $('#them-coins').value = '0';
      renderSide('me'); if (state.themLoaded) renderSide('them');
      updateTabBadges();
      updateSummary();
    } else {
      const apiMsg = resp.data && (resp.data.message || resp.data.error || (typeof resp.data === 'string' ? resp.data : ''));
      overlayResult(false, { error: apiMsg || resp.error || ('Request failed (HTTP ' + (resp.status || '?') + ')'), ref });
      updateSummary();
    }
  }

  // ── back button (close the tab if there's no history) ─────────────────────
  function bindBack() {
    $('#back-btn').addEventListener('click', () => {
      snd('click');
      if (history.length > 1) {
        const here = location.href;
        history.back();
        setTimeout(() => { if (location.href === here) window.close(); }, 150);
      } else { window.close(); }
    });
  }

  // Debounce search so typing in a big inventory doesn't re-render per keystroke.
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  function bindSort(side) {
    const seg = $(side === 'me' ? '#me-sort' : '#them-sort');
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      state[side].sort = b.dataset.v;
      snd('click');
      [...seg.children].forEach((x) => x.classList.toggle('on', x === b));
      renderSide(side);
    });
  }

  // ── trades list (Trades page) ───────────────────────────────────────────────
  const tradeState = { filter: 'all', q: '', from: '', to: '', loaded: false, loading: false, list: [], myId: null };

  const STATUS_LABEL = {
    pending: 'Pending', accepted: 'Accepted', rejected: 'Rejected',
    cancelled: 'Cancelled', canceled: 'Cancelled', expired: 'Expired', completed: 'Completed',
  };
  const fmtDate = (s) => {
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };
  // The API's created_at is bulk-set (many trades share it), so it's not a
  // reliable timestamp. Prefer the date that actually marks this trade's last
  // event: completed_at for finished trades, otherwise created_at.
  function tradeWhen(t) {
    if (t.completed_at) return { label: 'Completed', date: t.completed_at };
    return { label: 'Created', date: t.created_at };
  }

  // From my perspective, split a raw trade into what I give vs. receive.
  function perspective(t, myId) {
    const iAmInitiator = String(t.initiator_id) === String(myId);
    const ini = { items: t.items_from_initiator || [], coins: t.coins?.initiator_coins || 0 };
    const rec = { items: t.items_from_recipient || [], coins: t.coins?.recipient_coins || 0 };
    const partner = iAmInitiator
      ? { id: t.recipient_id, name: t.recipient_name }
      : { id: t.initiator_id, name: t.initiator_name };
    // "give" = what leaves my account, "get" = what comes to me.
    const give = iAmInitiator ? ini : rec;
    const get = iAmInitiator ? rec : ini;
    return { iAmInitiator, give, get, partner };
  }


  // A compact summary of what each side holds, e.g. "2 items · ◎500".
  function sideSummary(side) {
    const bits = [];
    if (side.items.length) bits.push(`${side.items.length} item${side.items.length === 1 ? '' : 's'}`);
    if (side.coins) bits.push(`◎${Number(side.coins).toLocaleString()}`);
    return bits.length ? bits.join(' · ') : 'nothing';
  }

  function tradeRow(t, myId) {
    const p = perspective(t, myId);
    const status = String(t.status || '').toLowerCase();
    const card = el('div', `tr st-${status}`);

    const sender = t.initiator_name || 'Unknown';
    const receiver = t.recipient_name || 'Unknown';
    const head = el('div', 'tr-head');
    head.innerHTML =
      `<div class="tr-who"><div class="tr-who-name">` +
        `<span class="${String(t.initiator_id) === String(myId) ? 'tr-me' : ''}">${esc(sender)}</span>` +
        `<span class="tr-arrow">→</span>` +
        `<span class="${String(t.recipient_id) === String(myId) ? 'tr-me' : ''}">${esc(receiver)}</span>` +
      `</div>` +
      `<div class="tr-who-sub">give ${esc(sideSummary(p.give))} · get ${esc(sideSummary(p.get))}</div></div>` +
      `<span class="tr-status">${STATUS_LABEL[status] || status || '—'}</span>` +
      `<span class="tr-caret tr-open-ic" title="Open trade">↗</span>`;
    card.append(head);

    // Clicking the row opens the full trade in its own window.
    head.addEventListener('click', () => {
      snd('click');
      const url = chrome.runtime.getURL(
        `trades/trade-view.html?id=${encodeURIComponent(t.id)}${myId != null ? '&me=' + encodeURIComponent(myId) : ''}`);
      window.open(url, '_blank', 'noopener');
    });

    // Hover → floating read-only preview of the full offer.
    let hoverTimer = null;
    card.addEventListener('mouseenter', () => {
      hoverTimer = setTimeout(() => showPreview(t, p), 140);
    });
    card.addEventListener('mousemove', positionPreview);
    card.addEventListener('mouseleave', () => { clearTimeout(hoverTimer); hidePreview(); });
    return card;
  }

  // ── trade hover preview (read-only) ─────────────────────────────────────────
  let previewEl = null;
  function ensurePreview() {
    if (previewEl) return previewEl;
    previewEl = el('div', 'tr-preview');
    previewEl.hidden = true;
    document.body.append(previewEl);
    return previewEl;
  }

  // Mini item card for the preview, built straight from the trade item (uses the
  // float/seed the payload carries; the full window resolves missing floats).
  function previewItem(it) {
    const { star, weapon, skin } = splitName(it.name);
    const rar = rarity(it.rarity);
    const { instance, image } = instanceAndImage(it);
    const urls = [...new Set([image, instance].filter((x) => x != null))].map((x) => iconUrl(x));
    const w = wear(num(it.float));
    const row = el('div', 'trp-item');
    row.style.setProperty('--rc', rar.c);
    const st = it.stattrak ? `<span class="trp-st">ST™${it.stattrak_count ? ' ' + it.stattrak_count : ''}</span>` : '';
    const wearBadge = w ? `<span class="trp-wear" style="color:${w.c}">${w.code}${it.float != null ? ' ' + Number(it.float).toFixed(3) : ''}</span>` : '';
    row.innerHTML =
      `<span class="trp-strip"></span>` +
      (urls.length ? `<img class="trp-img" alt="" />` : '<span class="trp-img"></span>') +
      `<span class="trp-meta"><span class="trp-name" style="color:${rar.c}">${star ? '★ ' : ''}${esc(weapon)}</span>` +
      `<span class="trp-skin">${esc(skin || rar.name)}</span></span>` +
      `<span class="trp-tags">${st}${wearBadge}</span>`;
    const img = row.querySelector('img.trp-img');
    if (img) { let i = 0; const next = () => { if (i >= urls.length) { img.style.visibility = 'hidden'; return; } img.src = urls[i++]; }; img.addEventListener('error', next); next(); }
    return row;
  }

  function previewColumn(label, cls, side) {
    const col = el('div', 'trp-col');
    col.innerHTML = `<div class="trp-h ${cls}">${label}</div>`;
    const wrap = el('div', 'trp-items');
    if (!side.items.length && !side.coins) wrap.append(el('div', 'trp-empty', 'Nothing'));
    else {
      side.items.forEach((it) => wrap.append(previewItem(it)));
      if (side.coins) wrap.append(el('div', 'trp-coins', coinChip(side.coins)));
    }
    col.append(wrap);
    return col;
  }

  function showPreview(t, p) {
    const box = ensurePreview();
    const status = String(t.status || '').toLowerCase();
    box.className = `tr-preview st-${status}`;
    box.innerHTML =
      `<div class="trp-head"><span class="trp-title">${esc(t.initiator_name)} → ${esc(t.recipient_name)}</span>` +
      `<span class="trp-status">${STATUS_LABEL[status] || status}</span></div>`;
    const cols = el('div', 'trp-cols');
    cols.append(previewColumn('YOU GIVE', 'give', p.give), previewColumn('YOU RECEIVE', 'get', p.get));
    box.append(cols);
    box.append(el('div', 'trp-foot', `${tradeWhen(t).label} ${fmtDate(tradeWhen(t).date)} · click to open`));
    box.hidden = false;
  }
  function hidePreview() { if (previewEl) previewEl.hidden = true; }
  function positionPreview(e) {
    if (!previewEl || previewEl.hidden) return;
    const pad = 16, w = previewEl.offsetWidth, h = previewEl.offsetHeight;
    let x = e.clientX + 18, y = e.clientY + 18;
    if (x + w + pad > window.innerWidth) x = e.clientX - w - 18;
    if (y + h + pad > window.innerHeight) y = Math.max(pad, window.innerHeight - h - pad);
    previewEl.style.left = x + 'px';
    previewEl.style.top = y + 'px';
  }

  function statusMatch(t) {
    const status = String(t.status || '').toLowerCase();
    switch (tradeState.filter) {
      case 'accepted': return status === 'accepted' || status === 'completed';
      case 'rejected': return status === 'rejected' || status === 'cancelled' || status === 'canceled' || status === 'expired';
      case 'pending': return status === 'pending';
      default: return true;
    }
  }

  // Text query matches either party's name or any item name on either side.
  function textMatch(t, q) {
    if (!q) return true;
    if (String(t.initiator_name || '').toLowerCase().includes(q)) return true;
    if (String(t.recipient_name || '').toLowerCase().includes(q)) return true;
    const items = [...(t.items_from_initiator || []), ...(t.items_from_recipient || [])];
    return items.some((it) => String(it.name || '').toLowerCase().includes(q));
  }

  // Date range is inclusive, compared against the trade's created_at (local day).
  function dateMatch(t) {
    if (!tradeState.from && !tradeState.to) return true;
    const d = new Date(t.created_at);
    if (isNaN(d)) return false;
    const day = d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC) — good enough for range
    if (tradeState.from && day < tradeState.from) return false;
    if (tradeState.to && day > tradeState.to) return false;
    return true;
  }

  function filterTrades() {
    const q = tradeState.q;
    return tradeState.list.filter((t) => statusMatch(t) && dateMatch(t) && textMatch(t, q));
  }

  function renderTrades() {
    hidePreview();
    const box = $('#trade-list');
    const countEl = $('#tl-count');
    if (tradeState.loading) {
      box.innerHTML = Array.from({ length: 5 }, () => '<div class="tr-skel"></div>').join('');
      if (countEl) countEl.textContent = '';
      return;
    }
    const list = filterTrades();
    if (countEl) countEl.textContent = `${list.length} / ${tradeState.list.length}`;
    box.innerHTML = '';
    if (!list.length) { box.append(el('div', 'empty', tradeState.list.length ? 'No trades match your filters.' : 'No trades yet.')); return; }
    // Newest first.
    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    list.forEach((t) => box.append(tradeRow(t, tradeState.myId)));
  }

  async function loadTrades(force) {
    if (tradeState.loading) return;
    if (tradeState.loaded && !force) return;
    tradeState.loading = true;
    renderTrades();
    const [me, resp] = await Promise.all([getMe(), api('/api/trades')]);
    tradeState.myId = me && me.id;
    const data = resp.ok ? resp.data : null;
    tradeState.list = Array.isArray(data) ? data : (Array.isArray(data?.all) ? data.all : []);
    tradeState.loading = false;
    tradeState.loaded = true;
    if (!resp.ok) { $('#trade-list').innerHTML = '<div class="empty">Could not load your trades. Make sure you\'re signed in on csrestored.fun.</div>'; return; }
    renderTrades();
  }

  // ── page (Trades / Create Offer) switching ──────────────────────────────────
  let friendsLoaded = false;
  function switchPage(page) {
    hidePreview();
    document.querySelectorAll('.page-tab').forEach((t) => t.classList.toggle('active', t.dataset.page === page));
    document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.id === `page-${page}`));
    snd('hover', 0.5);
    if (page === 'trades') loadTrades(false);
    if (page === 'create' && !friendsLoaded) { friendsLoaded = true; loadFriends(); }
  }

  function bindTradesList() {
    document.querySelectorAll('.page-tab').forEach((t) => {
      t.addEventListener('mouseenter', () => snd('hover'));
      t.addEventListener('click', () => switchPage(t.dataset.page));
    });
    $('#tl-filter').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      tradeState.filter = b.dataset.v;
      snd('click');
      [...$('#tl-filter').children].forEach((x) => x.classList.toggle('on', x === b));
      renderTrades();
    });
    $('#tl-refresh').addEventListener('click', () => { snd('click'); loadTrades(true); });

    // Search by player/item name (debounced) + date range.
    const search = debounce(renderTrades, 130);
    $('#tl-search').addEventListener('input', (e) => { tradeState.q = e.target.value.trim().toLowerCase(); search(); });
    $('#tl-from').addEventListener('change', (e) => { tradeState.from = e.target.value; renderTrades(); });
    $('#tl-to').addEventListener('change', (e) => { tradeState.to = e.target.value; renderTrades(); });
    $('#tl-clear').addEventListener('click', () => {
      snd('click');
      tradeState.q = ''; tradeState.from = ''; tradeState.to = '';
      $('#tl-search').value = ''; $('#tl-from').value = ''; $('#tl-to').value = '';
      renderTrades();
    });
  }

  function bindControls() {
    bindTradesList();
    $('#friend-search').addEventListener('input', renderFriends);

    const meSearch = debounce(() => { renderSide('me'); }, 130);
    $('#me-search').addEventListener('input', (e) => { state.me.q = e.target.value.trim().toLowerCase(); meSearch(); });
    const themSearch = debounce(() => { renderSide('them'); }, 130);
    $('#them-search').addEventListener('input', (e) => { state.them.q = e.target.value.trim().toLowerCase(); themSearch(); });

    bindSort('me'); bindSort('them');
    document.querySelectorAll('.ttab').forEach((t) => {
      t.addEventListener('mouseenter', () => snd('hover'));
      t.addEventListener('click', () => switchSide(t.dataset.side));
    });

    bindCoinInput($('#me-coins'), 'me');
    bindCoinInput($('#them-coins'), 'them');
    $('#pb-close').addEventListener('click', () => { snd('click'); backToFriends(); });
    $('#cancel-btn').addEventListener('click', () => { snd('click'); backToFriends(); });
    $('#send-btn').addEventListener('click', send);

    // Overlay action: close → dismiss the overlay and go back to the friend list.
    $('#to-close').addEventListener('click', () => { snd('click'); hideOverlay(); backToFriends(); });

    // Report-a-bug overlay: open / close + copy Discord username.
    const reportOv = $('#report-overlay');
    const openReport = () => { snd('alert'); reportOv.hidden = false; };
    const closeReport = () => { snd('off'); reportOv.hidden = true; };
    $('#report-bug').addEventListener('click', openReport);
    $('#report-x').addEventListener('click', closeReport);
    reportOv.addEventListener('click', (e) => { if (e.target === reportOv) closeReport(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !reportOv.hidden) closeReport(); });

    const discord = $('#fb-discord');
    if (discord) {
      discord.addEventListener('click', async () => {
        snd('click');
        const sub = $('#fb-discord-sub');
        const state = $('#fb-copy-state');
        try {
          await navigator.clipboard.writeText('9uery');
          discord.classList.add('copied');
          if (sub) sub.textContent = 'copied to clipboard!';
          if (state) state.textContent = '✓';
          setTimeout(() => {
            discord.classList.remove('copied');
            if (sub) sub.textContent = 'click to copy';
            if (state) state.textContent = '⧉';
          }, 1800);
        } catch {
          if (sub) sub.textContent = "copy failed — it's 9uery";
        }
      });
    }
  }

  function init() {
    bindBack();
    bindControls();
    updateSummary();
    // Trades is the default landing page → load it now. The friend list (for
    // Create Offer) loads lazily the first time that tab is opened.
    loadTrades(false);
  }

  init();
})();
