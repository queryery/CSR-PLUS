(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});
  const S = CSRP.store;

  let phaseKey = '';
  const clickedThisPhase = new Set();


  const MAP_ALIASES = { cbble: 'cobblestone' };


  function canonMap(label) {
    if (!label) return null;
    let s = label.replace(/^de_/i, '').replace(/\s+/g, '').toLowerCase();
    s = MAP_ALIASES[s] || s;
    return CSRP.MAPS.find((m) => m.toLowerCase() === s) || null;
  }


  function vetoButtons() {
    const out = [];
    for (const btn of document.querySelectorAll('button[type="button"], button')) {
      const img = btn.querySelector('img[src*="/maps/images/"], img[alt]');
      const p = btn.querySelector('p');
      if (!img && !p) continue;

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


  function vetoStatus() {

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


    const enabled = buttons.filter((b) => b.enabled);
    if (status && !status.myTurn) return;
    if (enabled.length === 0) return;

    const remainingMaps = buttons.map((b) => b.map);
    if (remainingMaps.length <= 1) return;


    const isFinal = remainingMaps.length === 2;
    let budget = status ? status.budget : isFinal ? 1 : 2;
    if (isFinal) budget = Math.min(budget, 1);


    const key = `${remainingMaps.slice().sort().join(',')}`;
    if (key !== phaseKey) resetPhase(key);


    const order = S.get('banPriority') || CSRP.DEFAULTS.banPriority;
    const ranked = enabled
      .map((b) => ({ ...b, rank: order.indexOf(b.map) === -1 ? 999 : order.indexOf(b.map) }))
      .sort((a, b) => a.rank - b.rank);

    let done = clickedThisPhase.size;
    for (const item of ranked) {
      if (done >= budget) break;
      if (clickedThisPhase.has(item.map)) continue;
      if (remainingMaps.length - (done + 1) < 1) break;
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
