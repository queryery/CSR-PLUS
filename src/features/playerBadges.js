(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});
  const { h } = CSRP.dom;
  const analyzed = new Map();

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
      if (!profile) return null;
      const agg = CSRP.stats.analyze(profile, history, period);
      analyzed.set(id, agg);
      return agg;
    })();
    pending.set(id, p);
    return p;
  }

  function periodLabel() {

    return { today: 'today', yesterday: 'yesterday', last10: 'last 10' }[
      CSRP.store.get('statsPeriod')
    ] || 'last 10';
  }

  function buildTooltip(a) {
    const row = (k, v) => h('div', { class: 'csrp-tip-row' }, [
      h('span', { class: 'csrp-tip-k' }, k),
      h('span', { class: 'csrp-tip-v' }, v),
    ]);
    const pct = (x) => (x * 100).toFixed(1) + '%';
    const trend = a.formTrend ?? 0;
    const trendTxt = trend > 0.05 ? `▲ improving` : trend < -0.05 ? `▼ declining` : '— steady';
    const streak = a.streak ?? 0;
    const streakTxt = streak > 0 ? `W${streak}` : streak < 0 ? `L${-streak}` : '—';
    return h('div', { class: 'csrp-tip' }, [
      h('div', { class: 'csrp-tip-head' }, [
        h('span', {}, a.name || 'Player'),
        h('span', { class: 'csrp-tip-elo' }, `${a.elo} ELO`),
      ]),
      row('Sample', `${a.games} games`),
      row('Rating', (a.rating ?? 1).toFixed(2)),
      row('K/D', a.kd.toFixed(2)),
      row('K/R', a.kr.toFixed(2)),
      row('Winrate', pct(a.winrate)),
      row('Form', trendTxt),
      row('Streak', streakTxt),
      row('K/D stability', pct(a.kdStability)),
    ]);
  }


  const INTERACTIVE = 'a, button, svg, [role="button"], input, textarea, select, label, [class*="cursor-pointer"]';

  function tickLobby() {
    for (const n of document.querySelectorAll('div.rounded-2xl.csrp-lobby-card')) {
      if (!n.querySelector('img[alt="Avatar"][width="72"]')) {
        n.classList.remove('csrp-lobby-card');
        n.style.cursor = '';
      }
    }
    for (const img of document.querySelectorAll('div.rounded-2xl img[alt="Avatar"][width="72"]')) {
      const id = CSRP.dom.idFromAvatar(img);
      if (!id) continue;
      const slot = img.closest('div.rounded-2xl');
      if (!slot) continue;


      if (slot.dataset.csrpLobbyClick !== '1') {
        slot.dataset.csrpLobbyClick = '1';
        slot.classList.add('csrp-lobby-card');
        slot.style.cursor = 'pointer';
        slot.addEventListener('click', (e) => {
          if (!slot.classList.contains('csrp-lobby-card')) return;
          const hit = e.target.closest(INTERACTIVE);
          if (hit && hit !== slot) return;
          CSRP.sound?.play('click');
          CSRP.notes?.openProfile(id);
        });
      } else {
        slot.classList.add('csrp-lobby-card');
      }
    }
  }


  async function decorate(card) {
    const info = CSRP.dom.parseCard(card);
    if (!info.id) return;
    if (card.querySelector('.csrp-badge-wrap')) return;


    const wrap = h('div', { class: 'csrp-badge-wrap' }, [
      h('span', { class: 'csrp-badge csrp-badge-loading' }, '···'),
    ]);
    const anchor = info.header || card.querySelector('h1')?.parentElement;
    if (!anchor) return;
    anchor.appendChild(wrap);


    if (!card.dataset.csrpClick) {
      card.dataset.csrpClick = '1';
      card.style.cursor = 'pointer';
      card.addEventListener('click', (e) => {
        const hit = e.target.closest(INTERACTIVE);
        if (hit && hit !== card) return;
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

    tickLobby();
    if (!CSRP.store.get('showBadges')) return;
    CSRP.dom.findCards().forEach((c) => decorate(c).catch(() => { }));
  }


  function reset() {
    analyzed.clear();
    document.querySelectorAll('.csrp-badge-wrap').forEach((n) => n.remove());
  }

  CSRP.playerBadges = { tick, reset, getAgg };
})();
