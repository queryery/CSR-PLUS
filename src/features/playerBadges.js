
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


  function ensureCreatorFrame(el) {
    if (!el || el.querySelector('.csrp-cf')) return;
    const frame = h('div', { class: 'csrp-cf', 'aria-hidden': 'true' }, [
      h('span', { class: 'csrp-cf-kanji' }, '東京'),
    ]);
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.appendChild(frame);
  }


  function ensureAvatarFrame() {}


  function makeCreatorChip() {
    return h('span', { class: 'csrp-tag-chip csrp-creator-chip' }, [
      h('span', { class: 'csrp-creator-spark', title: 'CSR+ Creator' }, '作'),
      'CSR+ Creator',
    ]);
  }

  function markCreator(card, info) {
    if (info.id !== CSRP.CREATOR_ID) return;
    card.classList.add('csrp-creator-card');
    ensureCreatorFrame(card);
    ensureAvatarFrame(card);
    ensureCreatorChip(card, info);
    swapRankImg(card);
  }

  function swapRankImg(scope) {
    const url = CSRP.CREATOR_RANK_IMG;
    if (!scope || !url) return;
    for (const img of scope.querySelectorAll('img[alt="rank"]')) {
      if (img.src === url) continue;
      img.removeAttribute('srcset');
      img.src = url;
      img.dataset.csrpRank = '1';
    }
  }

  function ensureCreatorChip(card, info) {
    if (info.id !== CSRP.CREATOR_ID) return;
    if (card.querySelector('.csrp-creator-chip')) return;
    const anchor = info.header || card.querySelector('h1')?.parentElement;
    if (!anchor) return;
    anchor.appendChild(makeCreatorChip());
  }


  function tickLobby() {
    for (const img of document.querySelectorAll('div.rounded-2xl img[alt="Avatar"]')) {
      const id = CSRP.dom.idFromAvatar(img);
      if (!id) continue;
      const slot = img.closest('div.rounded-2xl');
      if (!slot) continue;


      if (slot.dataset.csrpLobbyClick !== '1') {
        slot.dataset.csrpLobbyClick = '1';
        slot.classList.add('csrp-lobby-card');
        slot.style.cursor = 'pointer';
        slot.addEventListener('click', (e) => {
          if (e.target.closest('a, button')) return;
          e.stopPropagation();
          CSRP.sound?.play('click');
          CSRP.notes?.openProfile(id);
        });
      }


      if (id !== CSRP.CREATOR_ID) continue;
      slot.classList.add('csrp-creator-card', 'csrp-creator-lobby');
      ensureCreatorFrame(slot);
      ensureAvatarFrame(slot);
      swapRankImg(slot);
      if (slot.querySelector('.csrp-creator-chip')) continue;

      const nameRow = slot.querySelector('.flex.items-center.gap-1\\.5');
      const chip = h('span', { class: 'csrp-tag-chip csrp-creator-chip csrp-creator-chip-lobby' }, [
        h('span', { class: 'csrp-creator-spark', title: 'CSR+ Creator' }, '作'),
        'CSR+ Creator',
      ]);

      const block = nameRow?.parentElement || slot.querySelector('.flex.flex-col');
      (block || slot).appendChild(chip);
    }
  }


  async function decorate(card) {
    const info = CSRP.dom.parseCard(card);
    if (!info.id) return;
    markCreator(card, info);
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
