/* CSR+ — injects player-strength badges + hover tooltips + quick profile
 * actions into every player card. Stats are fetched/aggregated lazily. */
(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});
  const { h } = CSRP.dom;
  const analyzed = new Map(); // id -> aggregate (cache per page session)

  const pending = new Map();
  async function getAgg(id) {
    if (!id) return null;
    if (analyzed.has(id)) return analyzed.get(id);
    if (pending.has(id)) return pending.get(id);
    const p = (async () => {
      const period = CSRP.store.get('statsPeriod');
      const [profile, history] = await Promise.all([
        CSRP.api.user(id),
        CSRP.api.history(id),
      ]);
      pending.delete(id);
      if (!profile) { CSRP.log('no profile for', id); return null; }
      if (!Array.isArray(history)) CSRP.log('no history for', id, '(using lifetime stats)');
      const agg = CSRP.stats.analyze(profile, history, period);
      analyzed.set(id, agg);
      return agg;
    })();
    pending.set(id, p);
    return p;
  }

  function periodLabel() {
    return { today: 'today', yesterday: 'yesterday', all: 'all' }[
      CSRP.store.get('statsPeriod')
    ];
  }

  function buildTooltip(a) {
    const row = (k, v) => h('div', { class: 'csrp-tip-row' }, [
      h('span', { class: 'csrp-tip-k' }, k),
      h('span', { class: 'csrp-tip-v' }, v),
    ]);
    const pct = (x) => (x * 100).toFixed(1) + '%';
    return h('div', { class: 'csrp-tip' }, [
      h('div', { class: 'csrp-tip-head' }, [
        h('span', {}, a.name || 'Player'),
        h('span', { class: 'csrp-tip-elo' }, `${a.elo} ELO`),
      ]),
      row('Sample', `${a.games} games`),
      row('K/D', a.kd.toFixed(2)),
      row('K/R', a.kr.toFixed(2)),
      row('Winrate', pct(a.winrate)),
      row('Rating', (CSRP.stats.strength(a) / 50).toFixed(2)),
      row('K/D stability', pct(a.kdStability)),
      row('K/R stability', pct(a.krStability)),
    ]);
  }

  async function decorate(card) {
    const info = CSRP.dom.parseCard(card);
    if (!info.id) return;
    if (card.querySelector('.csrp-badge-wrap')) return; // already done

    // Reserve a slot immediately so we don't double-process.
    const wrap = h('div', { class: 'csrp-badge-wrap' }, [
      h('span', { class: 'csrp-badge csrp-badge-loading' }, '···'),
    ]);
    const anchor = info.header || card.querySelector('h1')?.parentElement;
    if (!anchor) return;
    anchor.appendChild(wrap);

    // Click anywhere on the card → compact CSR+ popover (tags/notes/profile).
    if (!card.dataset.csrpClick) {
      card.dataset.csrpClick = '1';
      card.style.cursor = 'pointer';
      card.addEventListener('click', (e) => {
        // Don't hijack clicks on the site's own links/buttons inside the card.
        if (e.target.closest('a, button')) return;
        e.stopPropagation();
        CSRP.notes?.openCardPopover(info.id, info.name, card);
      });
    }

    const agg = await getAgg(info.id);
    if (!agg) {
      wrap.innerHTML = '';
      return;
    }
    const tier = CSRP.classify(agg);

    const badge = h('span', { class: `csrp-badge ${tier.cls}` }, [
      h('span', { class: 'csrp-badge-dot' }),
      tier.label,
      h('span', { class: 'csrp-badge-period' }, periodLabel()),
    ]);
    const tip = buildTooltip(agg);
    wrap.innerHTML = '';
    wrap.append(badge, tip);
  }

  function tick() {
    if (!CSRP.store.get('showBadges')) return;
    CSRP.dom.findCards().forEach((c) => decorate(c).catch(() => { }));
  }

  // Re-run when period changes (drop the badges so they rebuild).
  function reset() {
    analyzed.clear();
    document.querySelectorAll('.csrp-badge-wrap').forEach((n) => n.remove());
  }

  CSRP.playerBadges = { tick, reset, getAgg };
})();
