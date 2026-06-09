/* CSR+ inventory viewer. Loads a player's inventory through the background proxy
 * and renders the skins with icons, wear, float, seed and StatTrak. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const id = new URLSearchParams(location.search).get('id');

  function api(path) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'csrp:api', path }, (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.ok) return resolve(null);
        resolve(resp.data);
      });
    });
  }

  // Skin icons come from the same CDN the site uses.
  const iconUrl = (skinIndex) =>
    skinIndex != null ? `https://cdn.csrestored.fun/skins/${skinIndex}.png` : null;

  // item_type → readable category.
  const TYPES = {
    1: 'Knife', 2: 'Rifle', 3: 'Heavy', 4: 'Pistol', 5: 'SMG',
    8: 'Container', 9: 'Agent', 10: 'Sticker',
  };
  function typeName(t) { return TYPES[t] || 'Other'; }

  // rarity → accent colour (standard CS ladder; covert/knife = red).
  const RARITY = {
    1: { name: 'Consumer',   c: '#b0c3d9' },
    2: { name: 'Industrial', c: '#5e98d9' },
    3: { name: 'Mil-Spec',   c: '#4b69ff' },
    4: { name: 'Restricted', c: '#8847ff' },
    5: { name: 'Classified', c: '#d32ce6' },
    6: { name: 'Covert',     c: '#eb4b4b' },
    7: { name: 'Contraband', c: '#e4ae39' },
  };
  function rarity(r) { return RARITY[Number(r)] || { name: '', c: '#9aa0ad' }; }

  // float → wear bucket (code + colour), matching the site's badges.
  function wear(f) {
    if (f == null) return null;
    if (f < 0.07) return { code: 'FN', label: 'Factory New',    c: '#4ade80' };
    if (f < 0.15) return { code: 'MW', label: 'Minimal Wear',   c: '#86efac' };
    if (f < 0.38) return { code: 'FT', label: 'Field-Tested',   c: '#fbbf24' };
    if (f < 0.45) return { code: 'WW', label: 'Well-Worn',      c: '#fb923c' };
    return { code: 'BS', label: 'Battle-Scarred', c: '#f87171' };
  }

  // Split "★ AK-47 | Redline" into weapon + skin parts.
  function splitName(name) {
    const star = /^★\s*/.test(name);
    const clean = name.replace(/^★\s*/, '').trim();
    const [weapon, skin] = clean.split('|').map((s) => s.trim());
    return { star, weapon: weapon || clean, skin: skin || '' };
  }

  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let items = [];
  let state = { sort: 'rarity', q: '', type: 'all' };

  function card(it, i) {
    const { star, weapon, skin } = splitName(it.name);
    const rar = rarity(it.rarity);
    const w = wear(it.float);
    const icon = iconUrl(it.skin_index);

    const c = el('a', 'card');
    c.style.setProperty('--rc', rar.c);
    c.style.animationDelay = Math.min(i * 0.015, 0.5) + 's';
    if (it.skin_index != null) {
      c.href = `https://csrestored.fun/skins/${it.skin_index}`;
      c.target = '_blank'; c.rel = 'noopener';
    }

    const st = it.stattrak ? `<span class="c-st">ST™${it.stattrak_count ? ' ' + it.stattrak_count : ''}</span>` : '';
    const wearTop = w ? `<span class="c-wear-code" style="color:${w.c}">${w.code}</span>` : '';
    const img = icon
      ? `<img class="c-img" src="${icon}" alt="" loading="lazy" onerror="this.closest('.card').classList.add('noimg')" />`
      : '';
    const floatBadge = w
      ? `<span class="c-float" style="color:${w.c};border-color:${w.c}55"><span class="c-dot" style="background:${w.c}"></span>${w.code} · ${it.float.toFixed(4)}</span>`
      : '';
    const seedBadge = it.seed != null ? `<span class="c-seed">#${Math.round(it.seed)}</span>` : '';
    const tag = it.nametag ? `<span class="c-nametag" title="Name tag">“${esc(it.nametag)}”</span>` : '';

    c.innerHTML = `
      <span class="c-strip"></span>
      <div class="c-top"><span class="c-st-wrap">${st}</span>${wearTop}</div>
      <div class="c-art">${img}<div class="c-fallback">${esc(typeName(it.item_type))}</div></div>
      <div class="c-meta">
        <div class="c-name">${star ? '<span class="c-star">★</span>' : ''}${esc(weapon)}</div>
        <div class="c-skin">${esc(skin || rar.name)}</div>
      </div>
      <div class="c-badges">${floatBadge}${seedBadge}</div>
      ${tag}`;
    return c;
  }

  function applyView() {
    let list = items.slice();
    if (state.type !== 'all') list = list.filter((it) => String(it.item_type) === state.type);
    if (state.q) {
      const q = state.q.toLowerCase();
      list = list.filter((it) => it.name.toLowerCase().includes(q));
    }
    if (state.sort === 'rarity') list.sort((a, b) => (b.rarity - a.rarity) || a.name.localeCompare(b.name));
    else if (state.sort === 'float') list.sort((a, b) => (a.float ?? 99) - (b.float ?? 99));
    else if (state.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));

    const grid = $('#grid');
    grid.innerHTML = '';
    if (!list.length) { grid.append(el('div', 'empty', 'No items match.')); return; }
    list.forEach((it, i) => grid.append(card(it, i)));
  }

  function buildFilters() {
    const counts = {};
    for (const it of items) counts[it.item_type] = (counts[it.item_type] || 0) + 1;
    const box = $('#filters');
    box.innerHTML = '';
    const mk = (val, label, n) => {
      const b = el('button', 'chip' + (state.type === val ? ' on' : ''), `${label}<span class="chip-n">${n}</span>`);
      b.addEventListener('click', () => { state.type = val; buildFilters(); applyView(); });
      return b;
    };
    box.append(mk('all', 'All', items.length));
    Object.keys(counts).sort((a, b) => counts[b] - counts[a])
      .forEach((t) => box.append(mk(String(t), typeName(t), counts[t])));
  }

  function renderStats() {
    const knives = items.filter((it) => String(it.item_type) === '1').length;
    const covert = items.filter((it) => Number(it.rarity) >= 6).length;
    const stat = items.filter((it) => it.stattrak).length;
    $('#tb-stats').innerHTML =
      `<span class="kv"><b>${items.length}</b> items</span>` +
      `<span class="kv"><b>${knives}</b> knives</span>` +
      `<span class="kv"><b>${covert}</b> covert+</span>` +
      `<span class="kv"><b>${stat}</b> StatTrak</span>`;
  }

  function bindControls() {
    $('#search').addEventListener('input', (e) => { state.q = e.target.value.trim(); applyView(); });
    $('#sort').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      state.sort = b.dataset.v;
      [...$('#sort').children].forEach((x) => x.classList.toggle('on', x === b));
      applyView();
    });
  }

  function skeletons() {
    const grid = $('#grid');
    grid.innerHTML = Array.from({ length: 18 }, () => '<div class="card-skel"></div>').join('');
  }

  async function render() {
    if (!id) { $('#head').innerHTML = '<div class="ih-skel">No player selected.</div>'; return; }
    $('#site-link').href = `https://csrestored.fun/app/user/${id}`;
    skeletons();

    // Profile (name/avatar) + inventory in parallel.
    const [profile, inv] = await Promise.all([api(`/users/${id}`), api(`/users/${id}/inventory`)]);

    const head = $('#head');
    if (profile) {
      document.title = `${profile.name} — CSR+ Inventory`;
      const avatar = profile.avatar ? `https://cdn.discordapp.com/avatars/${id}/${profile.avatar}.png?size=128` : '';
      const flag = profile.country ? `<img class="flag" src="https://flagcdn.com/w40/${profile.country}.png" alt="" />` : '';
      head.innerHTML =
        (avatar ? `<img class="ih-av" src="${avatar}" alt="" />` : '<div class="ih-av"></div>') +
        `<div class="ih-info"><div class="ih-name">${esc(profile.name)} ${flag}</div>` +
        `<div class="ih-sub">Inventory</div></div>`;
    } else {
      head.innerHTML = '<div class="ih-name">Inventory</div>';
    }

    if (!Array.isArray(inv)) {
      $('#grid').innerHTML = '<div class="empty">Could not load this inventory. The owner may have it hidden, or you need to be signed in on csrestored.fun.</div>';
      return;
    }
    items = inv;
    $('#toolbar').hidden = false;
    renderStats();
    buildFilters();
    bindControls();
    applyView();
  }

  render();
})();
