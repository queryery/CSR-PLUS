/* CSR+ single-trade viewer. Opened in its own window from the Trades list.
 * Renders one trade as read-only inventory-style cards (same look as the
 * Create Offer composer), with floats filled in from both parties' inventories.
 *
 * URL: trade-view.html?id=<tradeId>&me=<myId>
 */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const params = new URLSearchParams(location.search);
  const tradeId = params.get('id');
  const myIdParam = params.get('me');

  // ── sound ──────────────────────────────────────────────────────────────────
  let sndCfg = { soundEnabled: true, soundVolume: 0.6 };
  try {
    chrome.storage.local.get(['soundEnabled', 'soundVolume'], (d) => {
      if (d && typeof d.soundEnabled === 'boolean') sndCfg.soundEnabled = d.soundEnabled;
      if (d && typeof d.soundVolume === 'number') sndCfg.soundVolume = d.soundVolume;
    });
  } catch { /* ignore */ }
  const sndCache = {};
  function snd(name) {
    if (!sndCfg.soundEnabled) return;
    try {
      let a = sndCache[name];
      if (!a) { a = new Audio(chrome.runtime.getURL(`assets/sounds/${name}.wav`)); sndCache[name] = a; }
      const n = a.cloneNode(true); n.volume = sndCfg.soundVolume; n.play().catch(() => {});
    } catch { /* ignore */ }
  }

  // ── api ────────────────────────────────────────────────────────────────────
  function api(path, { method = 'GET', body } = {}) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'csrp:api', path, method, body }, (resp) => {
        if (chrome.runtime.lastError || !resp) return resolve({ ok: false });
        resolve(resp);
      });
    });
  }
  const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
  const itemsOf = (data) => Array.isArray(data) ? data
    : (Array.isArray(data?.items) ? data.items : (Array.isArray(data?.inventory) ? data.inventory : []));

  // ── shared visual helpers (match the composer cards) ───────────────────────
  const iconUrl = (w) => (w != null ? `https://cdn.csrestored.fun/skins/${w}.png` : null);
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
  const coinChip = (n) => `<span class="coin-chip"><span class="coin-mini"></span>${Number(n).toLocaleString()}</span>`;

  const fmtDate = (s) => {
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };
  const STATUS_LABEL = { pending: 'Pending', accepted: 'Accepted', rejected: 'Rejected', cancelled: 'Cancelled', canceled: 'Cancelled', expired: 'Expired', completed: 'Completed' };

  // A read-only card identical in look to the composer's (no click handler).
  // `hit` comes from the item_id lookup (inventory) and carries the CDN image
  // key + float/seed that the trades payload doesn't include.
  function card(it, hit) {
    const { star, weapon, skin } = splitName(it.name);
    const rar = rarity(it.rarity);
    // The CDN image key is the SMALL of the two ids (the skin/definition id);
    // the large one is the unique instance. Prefer the inventory-resolved image
    // id, then this item's small id, then the large id as a last resort.
    const candidates = [hit && hit.imageId, smallId(it), bigId(it)].filter((x) => x != null);
    const urls = [...new Set(candidates)].map((x) => iconUrl(x));
    const fl = hit && hit.float != null ? hit.float : num(it.float);
    const seed = hit && hit.seed != null ? hit.seed : num(it.seed);
    const w = wear(fl);

    const c = el('div', 'card');
    c.style.cursor = 'default';
    c.style.setProperty('--rc', rar.c);
    const st = it.stattrak ? `<span class="c-st">ST™${it.stattrak_count ? ' ' + it.stattrak_count : ''}</span>` : '<span></span>';
    const wearTop = w ? `<span class="c-wear-code" style="color:${w.c}">${w.code}</span>` : '<span></span>';
    const img = urls.length ? '<img class="c-img" alt="" />' : '';
    const floatBadge = w
      ? `<span class="c-float" style="color:${w.c};border-color:${w.c}55"><span class="c-dot" style="background:${w.c}"></span>${w.code} · ${Number(fl).toFixed(4)}</span>`
      : '<span class="c-float" style="color:var(--muted);border-color:var(--line)">float n/a</span>';
    const seedBadge = seed != null ? `<span class="c-seed">#${Math.round(seed)}</span>` : '';
    c.innerHTML = `
      <span class="c-strip"></span>
      <div class="c-top">${st}${wearTop}</div>
      <div class="c-art">${img}<div class="c-fallback">${esc(weapon)}</div></div>
      <div class="c-meta">
        <div class="c-name">${star ? '<span class="c-star">★</span>' : ''}${esc(weapon)}</div>
        <div class="c-skin">${esc(skin || rar.name)}</div>
      </div>
      <div class="c-badges">${floatBadge}${seedBadge}</div>`;

    // Walk the candidate icon URLs, falling back on each 404.
    const imgEl = c.querySelector('.c-img');
    if (imgEl) {
      let i = 0;
      const tryNext = () => {
        if (i >= urls.length) { c.classList.add('noimg'); return; }
        imgEl.src = urls[i++];
      };
      imgEl.addEventListener('error', tryNext);
      tryNext();
    } else {
      c.classList.add('noimg');
    }
    return c;
  }

  function sideBlock(label, tag, items, coins, itemMap) {
    const sec = el('section', 'side tv-side');
    const head = el('header', 'side-head');
    head.innerHTML = `<span class="side-tag ${tag}">${label}</span><span class="side-name">${items.length} item${items.length === 1 ? '' : 's'}</span>`;
    sec.append(head);
    if (coins) {
      sec.append(el('div', 'tv-coins', coinChip(coins)));
    }
    const grid = el('div', 'grid tv-grid');
    if (!items.length && !coins) grid.append(el('div', 'empty', 'Nothing on this side.'));
    else items.forEach((it) => grid.append(card(it, lookupHit(itemMap, it))));
    sec.append(grid);
    return sec;
  }

  function perspective(t, myId) {
    const iAmInitiator = myId != null && String(t.initiator_id) === String(myId);
    const ini = { items: t.items_from_initiator || [], coins: t.coins?.initiator_coins || 0 };
    const rec = { items: t.items_from_recipient || [], coins: t.coins?.recipient_coins || 0 };
    return {
      known: myId != null,
      iAmInitiator,
      give: iAmInitiator ? ini : rec,
      get: iAmInitiator ? rec : ini,
      ini, rec,
      partner: iAmInitiator ? { id: t.recipient_id, name: t.recipient_name } : { id: t.initiator_id, name: t.initiator_name },
    };
  }

  // The unique INSTANCE id (large of weapon_id/item_id) is the same value in the
  // /api/trades item and that user's inventory item — even though which field
  // holds it differs between endpoints. Key the lookup by that instance id and
  // carry the small (image) id + float/seed, which the trades payload lacks.
  const bigId = (it) => {
    const a = num(it.weapon_id), b = num(it.item_id);
    if (a == null) return b; if (b == null) return a; return Math.max(a, b);
  };
  const smallId = (it) => {
    const a = num(it.weapon_id), b = num(it.item_id);
    if (a == null) return b; if (b == null) return a; return Math.min(a, b);
  };
  async function buildItemMap(t) {
    const ids = [t.initiator_id, t.recipient_id].filter((x) => x != null);
    const maps = await Promise.all(ids.map(async (id) => {
      const resp = await api(`/users/${id}/inventory`);
      const inv = itemsOf(resp.ok ? resp.data : null);
      const m = new Map();
      for (const raw of inv) {
        const rec = { imageId: smallId(raw), float: num(raw.float), seed: num(raw.seed) };
        // Index under every id the trade item might match on: the unique
        // instance (big), and the raw weapon_id/item_id as given.
        for (const k of [bigId(raw), num(raw.weapon_id), num(raw.item_id), num(raw.id)]) {
          if (k != null && !m.has(String(k))) m.set(String(k), rec);
        }
      }
      return m;
    }));
    const merged = new Map();
    for (const m of maps) for (const [k, v] of m) if (!merged.has(k)) merged.set(k, v);
    return merged;
  }

  // Look up a trade item's float/seed by trying each of its candidate ids.
  function lookupHit(map, it) {
    for (const k of [bigId(it), num(it.weapon_id), num(it.item_id), num(it.id)]) {
      if (k != null && map.has(String(k))) return map.get(String(k));
    }
    return null;
  }

  function bindBack() {
    $('#back-btn').addEventListener('click', () => {
      snd('click');
      if (history.length > 1) { const here = location.href; history.back(); setTimeout(() => { if (location.href === here) window.close(); }, 150); }
      else window.close();
    });
  }

  async function render() {
    bindBack();
    if (!tradeId) { $('#tv-body').innerHTML = '<div class="empty">No trade selected.</div>'; return; }

    const resp = await api('/api/trades');
    const data = resp.ok ? resp.data : null;
    const list = Array.isArray(data) ? data : (Array.isArray(data?.all) ? data.all : []);
    const t = list.find((x) => String(x.id) === String(tradeId));
    if (!t) { $('#tv-body').innerHTML = '<div class="empty">Could not find this trade. It may have expired.</div>'; return; }

    const p = perspective(t, myIdParam);
    const status = String(t.status || '').toLowerCase();
    document.title = `${t.initiator_name} → ${t.recipient_name} — CSR+`;
    $('#tv-title').innerHTML = `${esc(t.initiator_name || 'Unknown')} <span class="tv-arrow">→</span> ${esc(t.recipient_name || 'Unknown')}`;
    $('#tv-sub').innerHTML =
      `<span class="tv-status st-${status}">${STATUS_LABEL[status] || status}</span> · ` +
      `Created ${esc(fmtDate(t.created_at))}` +
      (t.completed_at ? ` · Completed ${esc(fmtDate(t.completed_at))}` : (t.expires_at ? ` · Expires ${esc(fmtDate(t.expires_at))}` : ''));

    const body = $('#tv-body');
    body.innerHTML = '<div class="empty">Loading items…</div>';
    const itemMap = await buildItemMap(t);
    body.innerHTML = '';

    const cols = el('div', 'tv-cols');
    if (p.known) {
      cols.append(
        sideBlock('YOU GIVE', 'tag-give', p.give.items, p.give.coins, itemMap),
        sideBlock('YOU RECEIVE', 'tag-get', p.get.items, p.get.coins, itemMap),
      );
    } else {
      // No perspective (shouldn't happen) — label by role.
      cols.append(
        sideBlock(`${esc(t.initiator_name)} GIVES`, 'tag-give', p.ini.items, p.ini.coins, itemMap),
        sideBlock(`${esc(t.recipient_name)} GIVES`, 'tag-get', p.rec.items, p.rec.coins, itemMap),
      );
    }
    body.append(cols);

    // Accept / Reject — only when I'm the recipient of a still-pending offer.
    const iAmRecipient = myIdParam != null && String(t.recipient_id) === String(myIdParam);
    if (status === 'pending' && iAmRecipient) {
      body.append(buildActions(t));
    }
  }

  function buildActions(t) {
    const bar = el('div', 'tv-actions');
    bar.innerHTML =
      `<div class="tv-act-msg" id="tv-act-msg" hidden></div>` +
      `<div class="tv-act-btns">` +
        `<button class="btn btn-ghost tv-reject" id="tv-reject">Reject</button>` +
        `<button class="btn btn-primary tv-accept" id="tv-accept">Accept trade</button>` +
      `</div>`;

    const msg = bar.querySelector('#tv-act-msg');
    const accept = bar.querySelector('#tv-accept');
    const reject = bar.querySelector('#tv-reject');
    let busy = false;

    function setMsg(text, kind) {
      msg.hidden = false; msg.className = 'tv-act-msg ' + (kind || ''); msg.textContent = text;
    }

    async function act(kind) {
      if (busy) return;
      busy = true;
      accept.disabled = reject.disabled = true;
      const label = kind === 'accept' ? accept.textContent : reject.textContent;
      (kind === 'accept' ? accept : reject).textContent = '…';
      snd('click');
      // The API routes accept/reject as PATCH (POST returns 405).
      const resp = await api(`/api/trades/${encodeURIComponent(t.id)}/${kind}`, { method: 'PATCH' });
      if (resp.ok) {
        snd(kind === 'accept' ? 'accept' : 'cancel');
        setMsg(kind === 'accept' ? 'Trade accepted ✓' : 'Trade rejected.', 'ok');
        bar.querySelector('.tv-act-btns').remove();
        // Reflect the new status in the header.
        const s = kind === 'accept' ? 'accepted' : 'rejected';
        const stEl = document.querySelector('.tv-status');
        if (stEl) { stEl.className = `tv-status st-${s}`; stEl.textContent = STATUS_LABEL[s]; }
      } else {
        busy = false;
        accept.disabled = reject.disabled = false;
        accept.textContent = 'Accept trade'; reject.textContent = 'Reject';
        const apiMsg = resp.data && (resp.data.message || resp.data.error || (typeof resp.data === 'string' ? resp.data : ''));
        setMsg('Could not ' + kind + ': ' + (apiMsg || resp.error || ('HTTP ' + (resp.status || '?'))), 'err');
      }
    }

    accept.addEventListener('click', () => act('accept'));
    reject.addEventListener('click', () => act('reject'));
    return bar;
  }

  render();
})();
