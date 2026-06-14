
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);

  const EMBEDDED = (() => { try { return window.self !== window.top; } catch { return true; } })();
  function closeOverlay() {
    try { window.parent.postMessage({ type: 'csrp:cases-close' }, '*'); } catch {  }
  }

  let sndCfg = { soundEnabled: true, soundVolume: 0.6 };
  try {

    const area = (chrome.storage && chrome.storage.sync) ? chrome.storage.sync : chrome.storage.local;
    area.get(['soundEnabled', 'soundVolume'], (d) => {
      if (d && typeof d.soundEnabled === 'boolean') sndCfg.soundEnabled = d.soundEnabled;
      if (d && typeof d.soundVolume === 'number') sndCfg.soundVolume = d.soundVolume;
    });
  } catch {  }
  const sndCache = {};
  function snd(name, scale = 1) {
    if (!sndCfg.soundEnabled) return null;
    try {
      let a = sndCache[name];
      if (!a) { a = new Audio(chrome.runtime.getURL(`assets/sounds/${name}.wav`)); sndCache[name] = a; }
      const n = a.cloneNode(true);
      n.volume = Math.max(0, Math.min(1, sndCfg.soundVolume * scale));
      n.play().catch(() => {});
      return n;
    } catch { return null; }
  }

  const stageSounds = [];
  function sndStage(name, scale = 1) {
    const n = snd(name, scale);
    if (n) stageSounds.push(n);
  }
  function stopStageSounds() {
    for (const n of stageSounds) { try { n.pause(); n.currentTime = 0; } catch {  } }
    stageSounds.length = 0;
  }

  function api(path, { method = 'GET', body } = {}) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'csrp:api', path, method, body }, (resp) => {
        if (chrome.runtime.lastError || !resp) return resolve({ ok: false, error: 'No response from background' });
        resolve(resp);
      });
    });
  }

  const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const coin = (n) => `<span class="coin-chip"><span class="coin-mini"></span>${Number(n).toLocaleString()}</span>`;
  const iconUrl = (id) => (id != null ? `https://cdn.csrestored.fun/skins/${id}.png` : null);

  const caseArtUrl = (id) => `https://cdn.csrestored.fun/cases/${id}.webp`;

  const RARITY = {
    1: { name: 'Consumer', c: '#b0c3d9' }, 2: { name: 'Industrial', c: '#5e98d9' },
    3: { name: 'Mil-Spec', c: '#4b69ff' }, 4: { name: 'Restricted', c: '#8847ff' },
    5: { name: 'Classified', c: '#d32ce6' }, 6: { name: 'Covert', c: '#eb4b4b' },
    7: { name: 'Special', c: '#ffd24a' },
  };
  const rarity = (r) => RARITY[Number(r)] || { name: '', c: '#9aa0ad' };

  const REEL_WEIGHTS = { 1: 64, 2: 32, 3: 16, 4: 8, 5: 4, 6: 2, 7: 1 };

  const RARITY_PRICES = { 7: 6942, 6: 2013, 5: 530, 4: 255, 3: 118, 2: 94, 1: 56 };
  function sellPrice(r, f, st) {
    const fl = Math.min(Math.max(num(f) ?? 0, 0), 1);
    let p = Math.round((RARITY_PRICES[Number(r)] || 0) * (1 - fl * 0.25));
    if (st) p = Math.round(1.5 * p);
    return p;
  }
  const TYPES = { 0: 'Special', 1: 'Knife', 2: 'Rifle', 3: 'Heavy', 4: 'Pistol', 5: 'SMG', 8: 'Container', 9: 'Agent', 10: 'Sticker' };
  const typeName = (t) => TYPES[Number(t)] || 'Other';

  function wear(f) {
    if (f == null) return null;
    if (f < 0.07) return { code: 'FN', label: 'Factory New', c: '#4ade80' };
    if (f < 0.15) return { code: 'MW', label: 'Minimal Wear', c: '#86efac' };
    if (f < 0.38) return { code: 'FT', label: 'Field-Tested', c: '#fbbf24' };
    if (f < 0.45) return { code: 'WW', label: 'Well-Worn', c: '#fb923c' };
    return { code: 'BS', label: 'Battle-Scarred', c: '#f87171' };
  }
  function splitName(name) {
    const star = /^★\s*/.test(String(name || ''));
    const clean = String(name || '').replace(/^★\s*/, '').trim();
    const [weapon, skin] = clean.split('|').map((s) => s.trim());
    return { star, weapon: weapon || clean, skin: skin || '' };
  }

  const SPECIAL_GT25 = new Set([52, 53, 54, 58, 60, 61, 65, 66, 70, 71, 73, 74, 75, 78, 79]);
  const NO_SPECIAL = new Set([51, 55, 56, 57, 59, 62, 63, 64, 67, 68, 69, 72, 76, 77]);
  const hasSpecial = (id) => !NO_SPECIAL.has(id) && (id <= 25 || SPECIAL_GT25.has(id));

  const SPECIALS_KEY = 'csrp:specials-v2';
  const SPECIALS_TTL = 7 * 24 * 3600e3;
  const CRATES_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/crates.json';
  let specialsMemo = null;
  let specialsPromise = null;

  const COLOR_WORDS = {
    'consumer grade': 'white gray grey', 'industrial grade': 'light blue lightblue',
    'mil-spec grade': 'blue', restricted: 'purple', classified: 'pink',
    covert: 'red', extraordinary: 'gold yellow knife glove rare special',
  };

  function normCaseName(s) {
    let n = String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    n = n.replace(/^operation\s+/, '');
    n = n.replace(/ weapon case(?=\s|$)/, '').replace(/ case(?=\s|$)/, '').trim();
    if (n === 'gloves') n = 'glove';
    return n;
  }

  function getSpecialsMap() {
    if (specialsMemo) return Promise.resolve(specialsMemo);
    if (specialsPromise) return specialsPromise;
    specialsPromise = (async () => {
      try {
        const raw = localStorage.getItem(SPECIALS_KEY);
        if (raw) {
          const { t, v } = JSON.parse(raw);
          if (Date.now() - t < SPECIALS_TTL && v) { specialsMemo = v; return v; }
        }
      } catch {  }
      try {

        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 12000);
        let r;
        try { r = await fetch(CRATES_URL, { signal: ctrl.signal }); }
        finally { clearTimeout(t); }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const crates = await r.json();
        const spec = {}, blob = {};
        for (const cr of crates) {
          const key = normCaseName(cr.name);

          const words = [];
          for (const it of [...(cr.contains || []), ...(cr.contains_rare || [])]) {
            words.push(it.name || '');
            if (it.phase) words.push(it.phase);
            const rn = (it.rarity && it.rarity.name || '').toLowerCase();
            if (rn) { words.push(rn); const cw = COLOR_WORDS[rn]; if (cw) words.push(cw); }
          }
          if (words.length) blob[key] = ((blob[key] || '') + ' ' + words.join(' ')).toLowerCase();
          if (cr.type !== 'Case' || !Array.isArray(cr.contains_rare) || !cr.contains_rare.length) continue;
          spec[key] = cr.contains_rare.map((it) => {
            const { weapon, skin } = splitName(it.name);
            return { n: weapon, s: skin, p: it.phase || null, i: it.image || null };
          });
        }
        specialsMemo = { spec, blob };
        try { localStorage.setItem(SPECIALS_KEY, JSON.stringify({ t: Date.now(), v: specialsMemo })); } catch {  }
        return specialsMemo;
      } catch {
        specialsPromise = null;
        return null;
      }
    })();
    return specialsPromise;
  }

  const state = {
    cases: [],
    q: '', sort: 'price', kind: 'all',
    coins: null,
    current: null,
    spinning: false,
    realSpin: false,
    lastQuick: false,
  };

  async function loadBalance() {
    const resp = await api('/users/@me');
    const c = resp.ok && resp.data ? num(resp.data.coins ?? resp.data.balance) : null;
    if (c != null) state.coins = c;
    renderBalance();
  }
  function renderBalance() {
    $('#balance-n').textContent = state.coins != null ? state.coins.toLocaleString() : '—';
    syncOpenBtn();
  }
  function syncOpenBtn() {
    const btn = $('#open-btn');
    if (!btn || !state.current) return;
    const price = state.current.case.price || 0;
    const broke = state.coins != null && state.coins < price;
    btn.disabled = state.spinning || broke;
    btn.title = broke ? `You need ◎${price.toLocaleString()} to open this` : '';
    const quick = $('#quick-btn');
    if (quick) quick.disabled = state.spinning || broke;
  }

  const isCapsule = (c) => /capsule|sticker|pins|legends|challengers|contenders|agents/i.test(c.name || '');
  const isAgents = (c) => /agent/i.test(c.name || '');

  function visibleCases() {
    let list = state.cases.slice();
    if (state.q) {

      const blob = specialsMemo && specialsMemo.blob;
      list = list.filter((c) => {
        if ((c.name || '').toLowerCase().includes(state.q)) return true;
        const b = blob && blob[normCaseName(c.name)];
        return !!(b && b.includes(state.q));
      });
    }
    if (state.kind === 'special') list = list.filter((c) => hasSpecial(c.id));
    else if (state.kind === 'cases') list = list.filter((c) => !isCapsule(c));
    else if (state.kind === 'agents') list = list.filter(isAgents);
    else if (state.kind === 'other') list = list.filter((c) => isCapsule(c) && !isAgents(c));
    if (state.sort === 'price') list.sort((a, b) => (a.price - b.price) || a.name.localeCompare(b.name));
    else if (state.sort === 'price-d') list.sort((a, b) => (b.price - a.price) || a.name.localeCompare(b.name));
    else list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }

  function caseCard(c, i) {
    const special = hasSpecial(c.id);
    const d = el('div', 'case-card' + (special ? ' has-special' : ''));
    d.style.animationDelay = Math.min(i * 0.018, 0.45) + 's';

    d.innerHTML =
      (special ? '<span class="cc-star" title="Can drop a rare special item">★</span>' : '') +
      `<div class="cc-art"><img src="${caseArtUrl(c.id)}" alt="" loading="lazy" decoding="async" /></div>` +
      `<div class="cc-name">${esc(c.name)}</div>` +
      `<div class="cc-price">${coin(c.price)}</div>`;
    const im = d.querySelector('img');
    if (im) im.addEventListener('error', () => im.replaceWith(el('div', 'cc-fallback', '▣')));
    d.addEventListener('mouseenter', () => snd('hover', 0.4));
    d.addEventListener('click', () => { snd('click'); openCaseView(c.id); });
    return d;
  }

  function renderList() {
    const grid = $('#case-grid');
    const list = visibleCases();
    $('#cs-count').textContent = `${list.length} / ${state.cases.length}`;
    grid.innerHTML = '';
    if (!list.length) { grid.append(el('div', 'empty', 'No cases match.')); return; }
    const frag = document.createDocumentFragment();
    list.forEach((c, i) => frag.append(caseCard(c, i)));
    grid.append(frag);
  }

  function loaderEl(label) {
    const d = el('div', 'cs-loading',
      `<span class="cs-spin" aria-hidden="true"></span>
       <div class="cs-load-txt"><b>${esc(label)}</b><span class="cs-load-sub">Contacting the CS:R servers…</span></div>`);
    const sub = d.querySelector('.cs-load-sub');
    setTimeout(() => { if (d.isConnected) sub.textContent = 'Still loading — the CS:R servers are slow right now, hang tight…'; }, 4000);
    setTimeout(() => { if (d.isConnected) sub.textContent = 'The servers are really struggling… we\'re still trying.'; }, 12000);
    return d;
  }

  function errorEl(title, detail, onRetry) {
    const d = el('div', 'cs-error',
      `<div class="cs-error-txt"><b>${esc(title)}</b><span>${esc(detail)}</span></div>`);
    const btn = el('button', 'cs-retry', '↻ Try again');
    btn.addEventListener('click', () => { snd('click'); onRetry(); });
    d.append(btn);
    return d;
  }

  async function loadCases() {
    const grid = $('#case-grid');
    grid.innerHTML = '';
    grid.append(loaderEl('Loading cases'));
    grid.insertAdjacentHTML('beforeend', Array.from({ length: 12 }, () => '<div class="case-skel"></div>').join(''));
    const resp = await api('/inventory/cases');
    state.cases = resp.ok && Array.isArray(resp.data) ? resp.data : [];
    if (!state.cases.length) {
      grid.innerHTML = '';
      const timedOut = resp && (resp.timeout || /timeout/i.test(resp.error || ''));
      grid.append(timedOut
        ? errorEl('The CS:R servers didn\'t respond', 'They\'re slow or down right now — nothing wrong on your end.', loadCases)
        : errorEl('Could not load cases', 'Make sure you\'re signed in on csrestored.fun, then try again.', loadCases));
      return;
    }
    renderList();
  }

  let viewToken = 0;
  async function openCaseView(id) {
    const token = ++viewToken;
    $('#page-list').hidden = true;
    $('#page-case').hidden = false;
    hideMsg();
    const hero = $('#case-hero');
    hero.innerHTML = '';
    hero.append(loaderEl('Loading case'));
    $('#contents').innerHTML = Array.from({ length: 8 }, () => '<div class="card-skel"></div>').join('');
    window.scrollTo({ top: 0 });

    const resp = await api(`/inventory/cases/${id}`);
    if (token !== viewToken) return;
    if (!resp.ok || !resp.data || !resp.data.case) {
      const timedOut = resp && (resp.timeout || /timeout/i.test(resp.error || ''));
      $('#case-hero').innerHTML = '';
      $('#case-hero').append(timedOut
        ? errorEl('The CS:R servers didn\'t respond', 'They\'re slow or down right now — try again in a moment.', () => openCaseView(id))
        : errorEl('Could not load this case', 'Something went wrong fetching it — try again.', () => openCaseView(id)));
      $('#contents').innerHTML = '';
      return;
    }
    state.current = resp.data;
    renderHero();
    renderContents();
    appendSpecialCards(token);
  }

  function backToList() {

    if (state.spinning) {
      showMsg('Hold on — your case is opening…');
      return;
    }
    viewToken++;
    state.current = null;
    $('#page-case').hidden = true;
    $('#page-list').hidden = false;
    hideReveal();
  }

  function renderHero() {
    const c = state.current.case;
    const hero = $('#case-hero');
    hero.innerHTML = '';
    const art = el('div', 'ch-art', `<img src="${caseArtUrl(c.id)}" alt="" />`);
    const heroImg = art.querySelector('img');
    heroImg.addEventListener('error', () => heroImg.replaceWith(el('div', 'cc-fallback', '▣')));
    const info = el('div', 'ch-info');
    info.append(
      el('div', 'ch-name', esc(c.name)),
      el('div', 'ch-sub', `${state.current.items.length} items inside` + (hasSpecial(c.id) ? ' · <span style="color:var(--gold)">★ rare special possible</span>' : '')),
    );
    const actions = el('div', 'ch-actions');
    const openBtn = el('button', 'open-btn', `OPEN CASE&nbsp; ${coin(c.price)}`);
    openBtn.id = 'open-btn';
    openBtn.addEventListener('click', () => spin({}));

    const quickBtn = el('button', 'alt-btn', '⚡ Quick open');
    quickBtn.id = 'quick-btn';
    quickBtn.title = 'Open instantly — same cost, no animation';
    quickBtn.addEventListener('click', () => spin({ quick: true }));

    const buyBtn = el('button', 'alt-btn', `📦 Buy container`);
    buyBtn.id = 'buy-btn';
    buyBtn.title = 'Buy the sealed container into your inventory (does not open it)';
    let buyArmed = null;
    buyBtn.addEventListener('click', async () => {
      if (state.spinning) return;
      const price = c.price || 0;
      if (state.coins != null && state.coins < price) {
        showMsg(`Not enough coins — this container costs ◎${price.toLocaleString()}.`);
        return;
      }
      if (!buyArmed) {
        snd('click');
        buyBtn.innerHTML = `Confirm buy&nbsp; ${coin(price)}`;
        buyArmed = setTimeout(() => { buyArmed = null; buyBtn.textContent = '📦 Buy container'; }, 4000);
        return;
      }
      clearTimeout(buyArmed); buyArmed = null;
      buyBtn.disabled = true;
      buyBtn.textContent = 'Buying…';
      const resp = await api(`/inventory/cases/buy/${encodeURIComponent(c.id)}`, { method: 'POST', body: '' });
      buyBtn.disabled = false;
      buyBtn.textContent = '📦 Buy container';
      if (resp.ok) {
        snd('accept');
        if (state.coins != null) { state.coins -= price; renderBalance(); }
        showMsg('Container added to your inventory ✓', true);
        loadBalance();
      } else {
        snd('cancel');
        const apiMsg = resp.data && (resp.data.message || resp.data.error);
        showMsg('Could not buy the container: ' + (apiMsg || resp.error || ('HTTP ' + (resp.status || '?'))));
      }
    });

    actions.append(openBtn, quickBtn, buyBtn);
    hero.append(art, info, actions);
    syncOpenBtn();
  }

  function renderContents() {
    const grid = $('#contents');
    grid.innerHTML = '';
    const items = state.current.items.slice()
      .sort((a, b) => (Number(b.rarity) - Number(a.rarity)) || String(a.name).localeCompare(String(b.name)));
    const frag = document.createDocumentFragment();
    items.forEach((it, i) => frag.append(itemCard(it, i)));
    grid.append(frag);
  }

  function itemCard(it, i) {
    const { weapon, skin } = splitName(it.name);
    const rar = rarity(it.rarity);
    const c = el('div', 'card');
    c.style.setProperty('--rc', rar.c);
    c.style.animationDelay = Math.min(i * 0.02, 0.4) + 's';
    c.innerHTML = `
      <span class="c-strip"></span>
      <div class="c-top"><span></span><span></span></div>
      <div class="c-art"><img class="c-img" alt="" loading="lazy" decoding="async" src="${iconUrl(it.id)}" /><div class="c-fallback">${esc(weapon)}</div></div>
      <div class="c-meta">
        <div class="c-name">${esc(weapon)}</div>
        <div class="c-skin">${esc(skin || rar.name)}</div>
      </div>
      <div class="c-badges"><span class="c-float" style="color:${rar.c};border-color:${rar.c}55"><span class="c-dot" style="background:${rar.c}"></span>${esc(rar.name)}</span></div>`;
    c.querySelector('.c-img').addEventListener('error', function () { this.remove(); c.classList.add('noimg'); });
    return c;
  }

  function specialCard(d, i) {
    const gold = RARITY[7].c;
    const c = el('div', 'card sp-card');
    c.style.setProperty('--rc', gold);
    c.style.animationDelay = Math.min(i * 0.02, 0.4) + 's';
    const sub = (d.s || 'Vanilla') + (d.p ? ' · ' + d.p : '');
    c.innerHTML = `
      <span class="c-strip"></span>
      <span class="sp-corner">RARE</span>
      <div class="c-top"><span></span><span></span></div>
      <div class="c-art">${d.i ? `<img class="c-img" alt="" loading="lazy" decoding="async" src="${esc(d.i)}" />` : ''}<div class="c-fallback">★</div></div>
      <div class="c-meta">
        <div class="c-name">★ ${esc(d.n)}</div>
        <div class="c-skin">${esc(sub)}</div>
      </div>
      <div class="c-badges"><span class="c-float" style="color:${gold};border-color:${gold}55"><span class="c-dot" style="background:${gold}"></span>Rare Special</span></div>`;
    const im = c.querySelector('.c-img');
    if (im) im.addEventListener('error', function () { this.remove(); c.classList.add('noimg'); });
    return c;
  }

  async function appendSpecialCards(token) {
    const c = state.current && state.current.case;
    if (!c || !hasSpecial(c.id)) return;
    const map = await getSpecialsMap();
    if (token !== viewToken || !state.current || state.current.case !== c) return;
    const grid = $('#contents');
    const list = map && map.spec && map.spec[normCaseName(c.name)];
    const frag = document.createDocumentFragment();
    if (list && list.length) {
      list.forEach((d, i) => frag.append(specialCard(d, i)));
      const sub = document.querySelector('.ch-sub');
      if (sub) sub.innerHTML = `${state.current.items.length} items inside · <span style="color:var(--gold)">★ ${list.length} rare special drops</span>`;
    } else {

      frag.append(specialCard({ n: 'Rare Special Item', s: 'Pool unknown — unbox to find out', p: null, i: null }, 0));
    }
    grid.append(frag);
  }

  function showMsg(text, ok) {
    const m = $('#case-msg');
    m.hidden = false; m.className = 'case-msg' + (ok ? ' ok' : ''); m.textContent = text;
  }
  function hideMsg() { $('#case-msg').hidden = true; }

  const ITEM_W = 148, GAP = 8, STEP = ITEM_W + GAP;

  function reelCardData(c) {
    const pool = [];
    for (const it of state.current.items) {
      const w = REEL_WEIGHTS[Number(it.rarity)] ?? 10;
      for (let i = 0; i < w; i++) pool.push({ id: it.id, name: it.name, rarity: it.rarity });
    }
    if (hasSpecial(c.id)) pool.push({ special: true, name: '★ Rare Special Item', rarity: 7 });
    return pool;
  }

  function reelItemEl(d) {
    const r = el('div', 'reel-item' + (d.special ? ' ri-special' : ''));
    r.style.setProperty('--rc', rarity(d.rarity).c);
    const { weapon, skin } = splitName(d.name);
    r.innerHTML = d.special
      ? `<div class="ri-img" style="display:flex;align-items:center;justify-content:center;font-size:44px;color:var(--gold)">★</div><span class="ri-name">Rare Special</span><span class="ri-skin">???</span>`
      : `<img class="ri-img" alt="" loading="lazy" decoding="async" src="${iconUrl(d.id)}" />` +
        `<span class="ri-name">${esc(weapon)}</span><span class="ri-skin">${esc(skin)}</span>`;
    const im = r.querySelector('img');
    if (im) im.addEventListener('error', () => { im.style.visibility = 'hidden'; });
    return r;
  }

  function buildReel(result) {
    const c = state.current.case;
    const pool = reelCardData(c);
    const COUNT = 90;
    const LAND = 75 + Math.floor(Math.random() * 9);
    const reel = $('#reel');
    reel.classList.remove('done');
    reel.style.transform = 'translateX(0)';
    reel.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (let i = 0; i < COUNT; i++) {
      const d = i === LAND ? result : pool[Math.floor(Math.random() * pool.length)];
      frag.append(reelItemEl(d));
    }
    reel.append(frag);
    return LAND;
  }

  let spinToken = 0;
  function animateReel(landIdx, skip, duration = 6800) {
    const token = ++spinToken;
    return new Promise((resolve) => {
      const reel = $('#reel');
      const win = reel.parentElement;
      const center = win.clientWidth / 2;

      const jitter = (Math.random() - 0.5) * (ITEM_W * 0.55);
      const target = landIdx * STEP + ITEM_W / 2 - center + jitter;
      const start = performance.now();
      let lastTickIdx = -1;

      const ease = (t) => 1 - Math.pow(1 - t, 5);
      const finish = () => {
        reel.style.transform = `translateX(${-target}px)`;
        const winEl = reel.children[landIdx];
        if (winEl) winEl.classList.add('ri-win');
        reel.classList.add('done');
        resolve();
      };
      const frame = (now) => {
        if (token !== spinToken) return resolve();
        if (skip.on) return finish();
        const t = Math.min(1, (now - start) / duration);
        const x = target * ease(t);
        reel.style.transform = `translateX(${-x}px)`;
        const idx = Math.floor((x + center) / STEP);
        if (idx !== lastTickIdx) {
          lastTickIdx = idx;
          if (t < 0.97) snd('tick', 0.45);
        }
        if (t < 1) requestAnimationFrame(frame);
        else finish();
      };
      requestAnimationFrame(frame);
    });
  }

  function stageEl() { return $('#open-stage'); }

  function hideStage() {
    stopStageSounds();
    stageEl().hidden = true;
  }

  function skippableWait(ms, skip) {
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      skip.cbs.push(() => { clearTimeout(t); resolve(); });
    });
  }

  function showStage(c) {
    $('#os-case').src = caseArtUrl(c.id);
    $('#os-title').textContent = c.name;
    stageEl().hidden = false;
  }

  const isSpecialDrop = (d) => [0, 1].includes(Number(d?.item_type));

  let activeSkip = null;
  function triggerSkip() {
    const skip = activeSkip;
    if (!skip || skip.on) return;
    skip.on = true;
    stopStageSounds();
    skip.cbs.forEach((fn) => fn());
    skip.cbs.length = 0;
  }

  async function spin({ quick = false } = {}) {
    if (state.spinning || !state.current) return;
    const c = state.current.case;
    hideMsg();

    if (state.coins != null && state.coins < (c.price || 0)) {
      showMsg(`Not enough coins — this case costs ◎${(c.price || 0).toLocaleString()}.`);
      return;
    }
    state.spinning = true;
    state.realSpin = true;
    state.lastQuick = quick;
    syncOpenBtn();

    showMsg('Opening your case… contacting the CS:R servers.', true);
    const resp = await api(`/inventory/cases/open/${encodeURIComponent(c.id)}`, { method: 'POST', body: '' });
    if (!resp.ok || !resp.data || typeof resp.data !== 'object') {
      state.spinning = false;
      state.realSpin = false;
      syncOpenBtn();
      const timedOut = resp && (resp.timeout || /timeout/i.test(resp.error || ''));
      if (timedOut) {
        showMsg('The CS:R servers didn\'t respond in time. Check your balance before retrying — the open may or may not have gone through.');
        loadBalance();
      } else {
        const apiMsg = resp.data && (resp.data.message || resp.data.error);
        showMsg('Could not open the case: ' + (apiMsg || resp.error || ('HTTP ' + (resp.status || '?'))));
      }
      return;
    }
    hideMsg();

    const d = resp.data;
    const drop = (d.item && typeof d.item === 'object' && d.item)
      || (d.dropped_item && typeof d.dropped_item === 'object' && d.dropped_item)
      || (d.droppedItem && typeof d.droppedItem === 'object' && d.droppedItem)
      || d;

    if (state.coins != null) { state.coins -= c.price || 0; renderBalance(); }

    let landCard;
    const special = isSpecialDrop(drop);
    if (!special) {
      const defId = num(drop.item_id);
      const known = state.current.items.find((it) => Number(it.id) === defId);
      landCard = known
        ? { id: known.id, name: known.name, rarity: known.rarity }
        : { id: defId, name: drop.name || 'Unknown item', rarity: drop.rarity || 3 };
    } else {
      landCard = { special: true, name: '★ Rare Special Item', rarity: 7 };
    }

    if (!quick) {

      const skip = { on: false, cbs: [] };
      activeSkip = skip;
      showStage(c);
      const landIdx = buildReel(landCard);
      await skippableWait(400, skip);
      sndStage('on');
      await animateReel(landIdx, skip);
      snd(special ? 'alert' : 'accept');
      await skippableWait(skip.on ? 250 : 900, { on: false, cbs: skip.cbs });
      activeSkip = null;
      hideStage();
    } else {
      snd(special ? 'alert' : 'accept');
    }

    state.spinning = false;
    state.realSpin = false;
    syncOpenBtn();
    showReveal(drop, landCard);
    loadBalance();
  }

  let sellArmTimer = null;
  function showReveal(drop, landCard) {
    const card = $('#reveal-card');
    const special = drop ? isSpecialDrop(drop) : !!landCard.special;
    const r = special ? 7 : Number(drop?.rarity ?? landCard.rarity) || 0;
    const rar = rarity(r);
    card.classList.toggle('special', special);
    $('#rv-tag').textContent = special ? '★ Rare Special Item ★' : 'Dropped Item';

    const name = drop ? (drop.name || landCard.name) : landCard.name;
    const { star, weapon, skin } = splitName(name);
    const fullName = (star || special ? '★ ' : '') + weapon + (skin ? ' | ' + skin : '');
    $('#rv-name').textContent = fullName;
    $('#rv-name').style.color = rar.c;
    $('#rv-name').style.setProperty('--rc', rar.c);
    $('#rv-artname').textContent = fullName;
    $('#rv-artbox').style.setProperty('--rc', rar.c);

    $('#reveal').style.setProperty('--rc', rar.c);
    card.style.setProperty('--rc', rar.c);

    card.classList.remove('rv-anim'); void card.offsetWidth; card.classList.add('rv-anim');

    const art = $('#rv-art');
    const defId = drop ? num(drop.item_id) : (landCard.special ? null : landCard.id);
    art.innerHTML = '';
    if (defId != null) {
      const img = el('img');
      img.src = iconUrl(defId);
      img.onerror = () => { art.innerHTML = '<span class="rv-star">★</span>'; };
      art.append(img);
    } else {
      art.innerHTML = '<span class="rv-star">★</span>';
    }

    const f = drop ? num(drop.float) : null;
    const w = wear(f);
    const seed = drop ? num(drop.seed ?? drop.pattern) : null;

    const chips = $('#rv-chips');
    chips.innerHTML = '';
    const rarChip = el('span', 'rv-chip rar', esc(rar.name || '—'));
    rarChip.style.setProperty('--rc', rar.c);
    chips.append(rarChip);
    const t = drop?.item_type;
    if (t != null) chips.append(el('span', 'rv-chip', esc(typeName(t))));
    const gem = window.CSRPGems
      ? window.CSRPGems.badgeFor({ name: fullName, seed, skin_index: drop?.skin_index, item_id: drop?.item_id, weapon_id: drop?.weapon_id })
      : null;
    if (gem) {
      const g = el('span', 'rv-chip rar', esc(gem.label));
      g.style.setProperty('--rc', gem.color);
      if (gem.title) g.title = gem.title;
      chips.append(g);
    }

    const stats = $('#rv-stats');
    stats.innerHTML = '';
    const stat = (k, v) => {
      const s = el('div', 'rv-stat');
      s.append(el('p', 'rv-stat-k', esc(k)), el('p', 'rv-stat-v', v));
      stats.append(s);
    };
    if (drop) {
      stat('Wear', w ? `${w.code} - ${w.label}` : '—');
      stat('Float', f != null ? f.toFixed(6) : '—');
      stat('Pattern', seed != null ? '✿ ' + Math.round(seed) : '—');
      stat('StatTrak™', drop.stattrak ? 'Yes' : 'No');
    }

    const fb = $('#rv-floatblock');
    if (f != null && w) {
      fb.hidden = false;
      const dot = $('#rv-floatdot');
      dot.style.transition = 'none';
      dot.style.left = '0%';
      void dot.offsetWidth;
      dot.style.transition = 'left 0.9s cubic-bezier(0.22,1,0.36,1)';
      dot.style.left = (f * 100) + '%';
      $('#rv-floattxt').textContent = `${f.toFixed(6)} (${(f * 100).toFixed(4)}%) - ${w.label}`;
    } else {
      fb.hidden = true;
    }

    const sell = $('#rv-sell');
    clearTimeout(sellArmTimer);
    sell.onclick = null;
    sell.classList.remove('confirm', 'sold');
    sell.disabled = false;
    const weaponId = drop && drop.weapon_id != null ? String(drop.weapon_id) : null;
    if (drop && weaponId) {
      const price = sellPrice(r, f, drop.stattrak);
      sell.hidden = false;
      sell.innerHTML = `Quick Sell&nbsp;<b>◎${price.toLocaleString()}</b>`;
      let armed = false;
      sell.onclick = async () => {
        if (sell.classList.contains('sold')) return;
        if (!armed) {
          armed = true;
          snd('click');
          sell.classList.add('confirm');
          sell.innerHTML = `Confirm sell&nbsp;<b>◎${price.toLocaleString()}</b>?`;
          sellArmTimer = setTimeout(() => {
            armed = false;
            sell.classList.remove('confirm');
            sell.innerHTML = `Quick Sell&nbsp;<b>◎${price.toLocaleString()}</b>`;
          }, 4000);
          return;
        }
        clearTimeout(sellArmTimer);
        sell.disabled = true;
        sell.textContent = 'Selling…';
        const resp = await api(`/inventory/sell/${encodeURIComponent(weaponId)}`, { method: 'POST', body: '' });
        if (resp.ok) {
          snd('accept');
          sell.classList.remove('confirm');
          sell.classList.add('sold');
          const got = num(resp.data && (resp.data.price ?? resp.data.coins ?? resp.data.amount)) ?? price;
          sell.innerHTML = `Sold ✓&nbsp;<b>+◎${got.toLocaleString()}</b>`;
          if (state.coins != null) { state.coins += got; renderBalance(); }
          loadBalance();
        } else {
          snd('cancel');
          sell.disabled = false;
          armed = false;
          sell.classList.remove('confirm');
          const apiMsg = resp.data && (resp.data.message || resp.data.error);
          sell.textContent = apiMsg ? `Sell failed: ${apiMsg}` : 'Sell failed — try again';
          sellArmTimer = setTimeout(() => {
            sell.innerHTML = `Quick Sell&nbsp;<b>◎${price.toLocaleString()}</b>`;
          }, 2600);
        }
      };
    } else {
      sell.hidden = true;
    }

    $('#reveal').hidden = false;
  }
  function hideReveal() { $('#reveal').hidden = true; }

  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  function bindSeg(sel, key, after) {
    $(sel).addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      state[key] = b.dataset.v;
      snd('click');
      [...$(sel).children].forEach((x) => x.classList.toggle('on', x === b));
      after();
    });
  }

  function bindBack() {
    $('#back-btn').addEventListener('click', () => {
      snd('click');
      if (!$('#page-case').hidden) { backToList(); return; }

      if (EMBEDDED) { closeOverlay(); return; }
      if (history.length > 1) {
        const here = location.href;
        history.back();
        setTimeout(() => { if (location.href === here) window.close(); }, 150);
      } else { window.close(); }
    });
  }

  function init() {
    if (EMBEDDED) {

      const sl = $('#site-link');
      if (sl) sl.hidden = true;
      const bb = $('#back-btn');
      bb.textContent = '✕ Close';
      bb.title = 'Close CSR+ Cases and return to csrestored.fun';
    }
    bindBack();
    $('#cs-back').addEventListener('click', () => { snd('click'); backToList(); });
    const search = debounce(renderList, 120);
    $('#cs-search').addEventListener('input', (e) => { state.q = e.target.value.trim().toLowerCase(); search(); });
    bindSeg('#cs-sort', 'sort', renderList);
    bindSeg('#cs-kind', 'kind', renderList);
    $('#rv-close').addEventListener('click', () => { snd('off'); hideReveal(); });
    $('#rv-x').addEventListener('click', () => { snd('off'); hideReveal(); });

    $('#rv-again').addEventListener('click', () => { snd('click'); hideReveal(); spin({ quick: state.lastQuick }); });
    $('#reveal').addEventListener('click', (e) => { if (e.target === $('#reveal')) hideReveal(); });

    $('#open-stage').addEventListener('click', triggerSkip);
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('#reveal').hidden) { hideReveal(); return; }

      if (EMBEDDED && !state.spinning && $('#open-stage').hidden) {
        if (!$('#page-case').hidden) backToList();
        else closeOverlay();
      }
    });
    loadCases();
    loadBalance();
    try { localStorage.removeItem('csrp:specials-v1'); } catch {  }

    getSpecialsMap().then(() => { if (state.q) renderList(); });
  }

  init();
})();
