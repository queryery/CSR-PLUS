/* CSR+ — smart map banning, driven primarily by the live veto DOM.
 *
 * The veto screen tells us everything we need in text:
 *   "It's your team's turn to ban."          → it is our turn
 *   "Maps banned 6/9. Bans in this turn: 2"  → budget for this turn
 * and renders the still-bannable maps as <button> with a <p>Map Name</p>.
 *
 * We act ONCE per turn, latched by (bansDone + the set of visible maps), so the
 * picks never "switch" as the page re-renders mid-turn. */
(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});
  const S = CSRP.store;

  let phaseKey = '';
  const clickedThisPhase = new Set();

  // Some maps ship under a short file/code name that differs from the label.
  const MAP_ALIASES = { cbble: 'cobblestone' };

  // Map the on-screen label ("Dust 2", "Overpass") to our canonical name.
  function canonMap(label) {
    if (!label) return null;
    let s = label.replace(/^de_/i, '').replace(/\s+/g, '').toLowerCase();
    s = MAP_ALIASES[s] || s;
    return CSRP.MAPS.find((m) => m.toLowerCase() === s) || null;
  }

  // The veto map buttons: a <button> containing a maps/images/de_*.png img and
  // a short text label. Returns [{ btn, map, enabled }].
  function vetoButtons() {
    const out = [];
    for (const btn of document.querySelectorAll('button[type="button"], button')) {
      const img = btn.querySelector('img[src*="/maps/images/"], img[alt]');
      const p = btn.querySelector('p');
      if (!img && !p) continue;
      // Must look like a map veto button (image path or border styling).
      const html = btn.innerHTML;
      const looksVeto =
        /maps%2Fimages%2Fde_/.test(html) ||
        /maps\/images\/de_/.test(html) ||
        (btn.className.includes('border-theme-gray') && btn.className.includes('rounded-md'));
      if (!looksVeto) continue;
      const r = btn.getBoundingClientRect();
      if (r.width <= 0) continue;
      const label = (p?.textContent || img?.getAttribute('alt') || '').trim();
      const map = canonMap(label) || mapFromImg(html);
      if (!map) continue;
      const enabled =
        !btn.disabled &&
        btn.getAttribute('aria-disabled') !== 'true' &&
        !/cursor-not-allowed/.test(btn.className) &&
        !/pointer-events-none/.test(btn.className);
      out.push({ btn, map, enabled });
    }
    return out;
  }

  function mapFromImg(html) {
    const m = html.match(/de_([a-z0-9]+)\.png/i);
    return m ? canonMap(m[1]) : null;
  }

  // Read the veto status text. Returns { myTurn, budget } or null if not veto.
  function vetoStatus() {
    // Find the header block with "turn to ban" / "Bans in this turn".
    let myTurn = null;
    let budget = null;
    for (const p of document.querySelectorAll('p, h1')) {
      const t = p.textContent.trim();
      if (/turn to ban/i.test(t)) {
        myTurn = /your team'?s turn/i.test(t);
      }
      const bm = t.match(/Bans in this turn:\s*(\d+)/i);
      if (bm) budget = parseInt(bm[1], 10);
    }
    if (myTurn === null && budget === null) return null;
    return { myTurn: myTurn === true, budget: budget || 2 };
  }

  function tick() {
    if (!S.get('autoBan')) return;

    const status = vetoStatus();
    const buttons = vetoButtons();
    if (!status && !buttons.length) { resetPhase(''); return; }

    // Only act on our turn (DOM is authoritative). If the header is absent but
    // buttons are enabled, treat enabled buttons as "actionable" cautiously.
    const enabled = buttons.filter((b) => b.enabled);
    if (status && !status.myTurn) return;        // not our turn
    if (enabled.length === 0) return;            // buttons disabled → wait

    const remainingMaps = buttons.map((b) => b.map);
    if (remainingMaps.length <= 1) return;

    // Budget: from the text if present; else 1 in the final round, otherwise 2.
    const isFinal = remainingMaps.length === 2;
    let budget = status ? status.budget : isFinal ? 1 : 2;
    if (isFinal) budget = Math.min(budget, 1); // site forces a 1-map vote

    // Phase key changes whenever the veto advances (different visible set).
    const key = `${remainingMaps.slice().sort().join(',')}`;
    if (key !== phaseKey) resetPhase(key);

    // Rank by user priority (earlier in list = ban first).
    const order = S.get('banPriority') || CSRP.DEFAULTS.banPriority;
    const ranked = enabled
      .map((b) => ({ ...b, rank: order.indexOf(b.map) === -1 ? 999 : order.indexOf(b.map) }))
      .sort((a, b) => a.rank - b.rank);

    let done = clickedThisPhase.size;
    for (const item of ranked) {
      if (done >= budget) break;
      if (clickedThisPhase.has(item.map)) continue;
      if (remainingMaps.length - (done + 1) < 1) break; // never ban the last map
      clickedThisPhase.add(item.map);
      done++;
      CSRP.log('ban map →', item.map, isFinal ? '(final vote)' : '', `[${budget} this turn]`);
      item.btn.click();
    }
  }

  function resetPhase(key) {
    phaseKey = key;
    clickedThisPhase.clear();
  }

  CSRP.mapBan = { tick };
})();
