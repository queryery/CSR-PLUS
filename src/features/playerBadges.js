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

  // The site scales the VIEWER's own slot (scale-110) whether or not they own
  // the party. Wanted look: only the party owner's card is big. The lobby is
  // named team_<owner>, so match slot names against that.
  function lobbyOwnerName() {
    for (const p of document.querySelectorAll('p')) {
      const t = (p.textContent || '').trim();
      if (/^team_\S+$/.test(t) && !p.closest('.csrp-mf, .csrp-mf-host')) return t.slice(5).toLowerCase();
    }
    return null;
  }

  // Center the party owner among the lobby slots by reordering the flex row:
  // the owner takes the middle order, everyone else fans out around it.
  function centerOwner(ownerSlot) {
    // The owner card sits inside a wrapper that is a direct child of the flex
    // row. Give that wrapper the middle flex `order`, and fan the rest around it.
    let ownerWrap = ownerSlot;
    while (ownerWrap && ownerWrap.parentElement &&
      !(ownerWrap.parentElement.classList.contains('flex') && ownerWrap.parentElement.children.length >= 3)) {
      ownerWrap = ownerWrap.parentElement;
    }
    const row = ownerWrap && ownerWrap.parentElement;
    if (!row) return;
    const items = [...row.children];
    const n = items.length;
    if (n < 3 || !items.includes(ownerWrap)) return;
    const mid = Math.floor((n - 1) / 2);
    let side = 0;
    items.forEach((it) => {
      if (it === ownerWrap) { it.style.order = String(mid); return; }
      it.style.order = String(side < mid ? side : side + 1);
      side++;
    });
  }

  function clearCenterOrder() {
    document.querySelectorAll('[style*="order"]').forEach((el) => {
      if (el.closest('div.rounded-2xl') || (el.querySelector && el.querySelector('div.rounded-2xl'))) el.style.order = '';
    });
  }

  function tickLobby() {
    for (const n of document.querySelectorAll('div.rounded-2xl.csrp-lobby-card')) {
      if (!n.querySelector('img[alt="Avatar"][width="72"]')) {
        n.classList.remove('csrp-lobby-card', 'csrp-lobby-owner', 'csrp-lobby-member');
        n.style.cursor = '';
      }
    }
    const owner = lobbyOwnerName();
    let ownerSlot = null;
    for (const img of document.querySelectorAll('div.rounded-2xl img[alt="Avatar"][width="72"]')) {
      const slot = img.closest('div.rounded-2xl');
      if (!slot) continue;
      if (owner) {
        const nameEl = slot.querySelector('span');
        const nm = nameEl ? (nameEl.textContent || '').trim().toLowerCase() : '';
        const isOwner = !!nm && nm === owner;
        slot.classList.toggle('csrp-lobby-owner', isOwner);
        slot.classList.toggle('csrp-lobby-member', !!nm && nm !== owner);
        if (isOwner) ownerSlot = slot;
      }
      // Ready status: the site marks accepted/ready players (a green check /
      // green text). Reflect it as a clear tag + green edge on the slot.
      markReady(slot);

      const id = CSRP.dom.idFromAvatar(img) || CSRP.profileCustom?.idForSlot?.(slot);
      if (!id) continue;


      if (slot.dataset.csrpLobbyClick !== '1') {
        slot.dataset.csrpLobbyClick = '1';
        slot.classList.add('csrp-lobby-card');
        slot.style.cursor = 'pointer';
        slot.addEventListener('click', (e) => {
          if (!slot.classList.contains('csrp-lobby-card')) return;
          // Never hijack a click on ANY native control (kick ✕, ready, etc.).
          // Walk the whole path so nested svg/paths inside the kick button also
          // pass straight through to the site.
          const path = e.composedPath ? e.composedPath() : [e.target];
          for (const el of path) {
            if (el === slot) break;
            if (el.nodeType !== 1) continue;
            if (el.matches && el.matches(INTERACTIVE)) return;
            // Anything positioned in the card's top-right corner is treated as a
            // control (that's where the kick ✕ lives) — belt and suspenders.
            if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'SVG' || el.tagName === 'PATH') return;
          }
          CSRP.sound?.play('click');
          CSRP.notes?.openProfile(id);
        });
      } else {
        slot.classList.add('csrp-lobby-card');
      }
    }
    if (ownerSlot) centerOwner(ownerSlot); else clearCenterOrder();
  }

  // Detect the site's "ready/accepted" state on a lobby slot and reflect it.
  function markReady(slot) {
    const ready = !!(
      slot.querySelector('.text-green-500, .bg-green-500') ||
      /\bready\b/i.test(slot.textContent || '') ||
      slot.querySelector('svg[class*="green"], [class*="text-green"]')
    );
    slot.classList.toggle('csrp-ready', ready);
    let tag = slot.querySelector(':scope > .csrp-ready-tag');
    if (ready && !tag) {
      tag = document.createElement('span');
      tag.className = 'csrp-ready-tag';
      tag.textContent = 'Ready';
      if (getComputedStyle(slot).position === 'static') slot.style.position = 'relative';
      slot.appendChild(tag);
    } else if (!ready && tag) {
      tag.remove();
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
    // The tooltip lives on <body>, not inside the card: cards with banners are
    // overflow-clipped, which used to shove the tip UNDER the card.
    const tip = buildTooltip(agg);
    tip.classList.add('csrp-tip-body');
    tip._csrpWrap = wrap;
    document.body.appendChild(tip);
    wrap.innerHTML = '';
    wrap.append(badge);
    wrap.addEventListener('mouseenter', () => {
      const r = badge.getBoundingClientRect();
      tip.style.left = (r.left + r.width / 2) + 'px';
      tip.style.top = (r.top - 8) + 'px';
      tip.classList.add('csrp-tip-show');
    });
    wrap.addEventListener('mouseleave', () => tip.classList.remove('csrp-tip-show'));
  }

  function tick() {

    tickLobby();
    // Scrub body-mounted tooltips whose card got re-rendered away by React.
    document.querySelectorAll('.csrp-tip-body').forEach((t) => {
      if (!t._csrpWrap || !t._csrpWrap.isConnected) t.remove();
    });
    if (!CSRP.store.get('showBadges')) return;
    CSRP.dom.findCards().forEach((c) => decorate(c).catch(() => { }));
  }


  function reset() {
    analyzed.clear();
    document.querySelectorAll('.csrp-badge-wrap, .csrp-tip-body').forEach((n) => n.remove());
  }

  CSRP.playerBadges = { tick, reset, getAgg };
})();
