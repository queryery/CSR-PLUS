/* CSR+ — auto-sell. Periodically fetches the logged-in user's own inventory and
 * sells items that match the configured filters via POST /inventory/sell/{id}.
 *
 * SAFETY: selling is irreversible. This only sells when the config is BOTH
 * `enabled` AND `armed`. When enabled but not armed it runs a dry-run: it
 * computes the matching set and reports it, but never POSTs a sell. Knives,
 * gloves and name-tagged items are protected by default. */
(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});

  let myId = null;
  let myIdTried = false;
  let busy = false;
  let nextRunAt = 0;
  const soldThisSession = new Set(); // item_ids we've already sold (avoid retry)
  let lastPreview = { count: 0, names: [], at: 0 };

  // item_type → category used for the knife/glove protection.
  const KNIFE = 1, GLOVE = 6; // item_type 1 = knife; gloves report rarity-style
  function isKnife(it) { return String(it.item_type) === '1'; }
  function isGlove(it) { return /glove/i.test(it.name || ''); }

  function wearCode(f) {
    if (f == null) return null;
    if (f < 0.07) return 'FN';
    if (f < 0.15) return 'MW';
    if (f < 0.38) return 'FT';
    if (f < 0.45) return 'WW';
    return 'BS';
  }

  function toast(msg) {
    try {
      const t = document.createElement('div');
      t.className = 'csrp-toast';
      t.textContent = msg;
      document.body.appendChild(t);
      requestAnimationFrame(() => t.classList.add('csrp-toast-show'));
      setTimeout(() => { t.classList.remove('csrp-toast-show'); setTimeout(() => t.remove(), 400); }, 2600);
    } catch { /* ignore (no DOM) */ }
  }

  function api(path) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'csrp:api', path }, (resp) => {
          if (chrome.runtime.lastError || !resp || !resp.ok) return resolve(null);
          resolve(resp.data);
        });
      } catch { resolve(null); }
    });
  }

  function sellOne(itemId) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'csrp:sell', itemId: String(itemId) }, (resp) => {
          if (chrome.runtime.lastError) return resolve({ ok: false, error: 'runtime' });
          resolve(resp || { ok: false, error: 'no response' });
        });
      } catch { resolve({ ok: false, error: 'throw' }); }
    });
  }

  async function resolveMyId() {
    if (myId || myIdTried) return myId;
    myIdTried = true;
    // Prefer the live match data (has myId), else ask the API for @me.
    const fromMatch = CSRP._matchData && CSRP._matchData.myId;
    if (fromMatch) { myId = String(fromMatch); return myId; }
    const me = await api('/users/@me');
    if (me && me.id) myId = String(me.id);
    return myId;
  }

  // Decide whether a single item matches the sell filters.
  function matches(it, cfg) {
    // Protections first — these always win.
    if (cfg.protectKnivesGloves && (isKnife(it) || isGlove(it))) return false;
    if (cfg.protectNametag && it.nametag) return false;
    if (it.active) return false; // currently equipped — never sell

    // StatTrak handling.
    const st = !!it.stattrak;
    if (cfg.stattrak === 'keep' && st) return false;
    if (cfg.stattrak === 'only' && !st) return false;

    // Rarity gate (must be an explicitly enabled rarity).
    if (!cfg.rarities || !cfg.rarities[Number(it.rarity)]) return false;

    // Wear / float gate.
    const code = wearCode(it.float);
    if (code == null) {
      if (!cfg.sellNoFloat) return false;
    } else {
      if (!cfg.wears || !cfg.wears[code]) return false;
      if (typeof cfg.maxFloat === 'number' && it.float > cfg.maxFloat) return false;
    }
    return true;
  }

  // Build the current list of sellable items (excludes already-sold ids).
  async function computeMatches(cfg) {
    const id = await resolveMyId();
    if (!id) return null;
    const inv = await api(`/users/${id}/inventory`);
    if (!Array.isArray(inv)) return null;
    return inv.filter((it) => it.item_id != null
      && !soldThisSession.has(String(it.item_id))
      && matches(it, cfg));
  }

  async function tick() {
    const cfg = CSRP.store.get('autoSell');
    if (!cfg || !cfg.enabled) return;
    if (busy || Date.now() < nextRunAt) return;
    busy = true;
    try {
      const list = await computeMatches(cfg);
      if (!list) return;

      lastPreview = { count: list.length, names: list.slice(0, 12).map((i) => i.name), at: Date.now() };
      // Publish the preview so the popup can show "X would be sold".
      try { CSRP.store.set('autoSellPreview', { count: list.length, names: lastPreview.names, armed: !!cfg.armed, at: Date.now() }); } catch { /* ignore */ }

      if (!cfg.armed) {
        // Dry-run only — never sell.
        if (list.length) CSRP.log(`auto-sell DRY-RUN: ${list.length} item(s) match (arm to sell)`);
        nextRunAt = Date.now() + Math.max(5, cfg.intervalSec || 15) * 1000;
        return;
      }
      if (!list.length) { nextRunAt = Date.now() + Math.max(5, cfg.intervalSec || 15) * 1000; return; }

      // Sell up to batchSize this run.
      const batch = list.slice(0, Math.max(1, Math.min(50, cfg.batchSize || 5)));
      let sold = 0;
      for (const it of batch) {
        const res = await sellOne(it.item_id);
        if (res && res.ok) {
          sold++;
          soldThisSession.add(String(it.item_id));
          CSRP.log('auto-sell SOLD', it.name, `(item ${it.item_id})`);
        } else {
          CSRP.log('auto-sell FAILED', it.name, res && (res.error || res.status));
        }
        await new Promise((r) => setTimeout(r, 400)); // gentle spacing within a batch
      }
      if (sold) {
        CSRP.sound?.play('tick');
        toast(`Auto-sold ${sold} item${sold > 1 ? 's' : ''}`);
      }
      nextRunAt = Date.now() + Math.max(5, cfg.intervalSec || 15) * 1000;
    } catch (err) {
      CSRP.log('auto-sell error', err && err.message);
    } finally {
      busy = false;
    }
  }

  // Reset the per-session sold cache (e.g. when the user re-arms).
  function reset() { soldThisSession.clear(); nextRunAt = 0; }

  CSRP.autoSell = { tick, reset, getPreview: () => lastPreview };
})();
