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

  // Inject the corner kanji mark into a creator element (top-right). Idempotent.
  function ensureCreatorFrame(el) {
    if (!el || el.querySelector('.csrp-cf')) return;
    const frame = h('div', { class: 'csrp-cf', 'aria-hidden': 'true' }, [
      h('span', { class: 'csrp-cf-kanji' }, '東京'),
    ]);
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.appendChild(frame);
  }

  // Wrap the creator's avatar <img> in a cyberpunk frame: an angular clipped
  // ring with a rotating conic tracer + crimson accent. Idempotent — marks the
  // <img> so we only wrap once even as the site re-renders.
  function ensureAvatarFrame(el) {
    if (!el) return;
    // The avatar is the round profile image — match on the Avatar alt, or the
    // discord-cdn avatar src, so we never grab the rank/flag icons.
    const img = el.querySelector('img[alt="Avatar"]') ||
      Array.from(el.querySelectorAll('img')).find((im) =>
        CSRP.dom.idFromAvatar(im) === CSRP.CREATOR_ID);
    if (!img || img.dataset.csrpAvFramed === '1' || img.closest('.csrp-avframe')) return;
    img.dataset.csrpAvFramed = '1';
    const frame = h('span', { class: 'csrp-avframe' });
    // Carry the avatar's spacing (e.g. mb-3) onto the frame so layout holds.
    for (const c of Array.from(img.classList)) {
      if (/^m[btlrxy]?-/.test(c)) { frame.classList.add(c); img.classList.remove(c); }
    }
    img.parentNode.insertBefore(frame, img);
    frame.appendChild(img);          // move the avatar inside our frame
    frame.appendChild(h('span', { class: 'csrp-avframe-ring' }));
  }

  // Give the CSR+ creator's card its aura, corner kanji + avatar frame (runs
  // early, regardless of stats).
  function markCreator(card, info) {
    if (info.id !== CSRP.CREATOR_ID) return;
    card.classList.add('csrp-creator-card');
    ensureCreatorFrame(card);
    ensureAvatarFrame(card);
  }

  // Decorate the LOBBY player slots (the .rounded-2xl team cards on the
  // home/lobby screen). These aren't player "cards" so findCards() misses them.
  // For ANY occupied slot we add a clickable + hover affordance that opens our
  // custom profile page; the creator's slot additionally gets the aura, frame
  // and "CSR+ Creator" chip. Idempotent per slot.
  function tickLobby() {
    for (const img of document.querySelectorAll('div.rounded-2xl img[alt="Avatar"]')) {
      const id = CSRP.dom.idFromAvatar(img);
      if (!id) continue;
      const slot = img.closest('div.rounded-2xl');
      if (!slot) continue;

      // Make the whole slot open the profile on click (once per slot).
      if (slot.dataset.csrpLobbyClick !== '1') {
        slot.dataset.csrpLobbyClick = '1';
        slot.classList.add('csrp-lobby-card');
        slot.style.cursor = 'pointer';
        slot.addEventListener('click', (e) => {
          if (e.target.closest('a, button')) return; // don't hijack native controls
          e.stopPropagation();
          CSRP.sound?.play('click');
          CSRP.notes?.openProfile(id);
        });
      }

      // Creator-only decoration.
      if (id !== CSRP.CREATOR_ID) continue;
      slot.classList.add('csrp-creator-card', 'csrp-creator-lobby');
      ensureCreatorFrame(slot);
      ensureAvatarFrame(slot);
      if (slot.querySelector('.csrp-creator-chip')) continue;
      // Name row is the `.flex.items-center.gap-1.5` holding name + flag.
      const nameRow = slot.querySelector('.flex.items-center.gap-1\\.5');
      const chip = h('span', { class: 'csrp-tag-chip csrp-creator-chip csrp-creator-chip-lobby' }, [
        h('span', { class: 'csrp-creator-spark', title: 'CSR+ Creator' }, '作'),
        'CSR+ Creator',
      ]);
      // Drop it just below the name/ELO block so it sits centered under the name.
      const block = nameRow?.parentElement || slot.querySelector('.flex.flex-col');
      (block || slot).appendChild(chip);
    }
  }

  // The "CSR+ Creator" chip, placed right AFTER the strength badge inside the
  // badge wrap so it reads: [strength badge] [CSR+ Creator]. Idempotent.
  function addCreatorChip(card, info, wrap) {
    if (info.id !== CSRP.CREATOR_ID || !wrap) return;
    if (wrap.querySelector('.csrp-creator-chip')) return;
    const chip = h('span', { class: 'csrp-tag-chip csrp-creator-chip' }, [
      h('span', { class: 'csrp-creator-spark', title: 'CSR+ Creator' }, '作'),
      'CSR+ Creator',
    ]);
    // Insert right after the badge (before the hover tooltip, if present).
    const tip = wrap.querySelector('.csrp-tip');
    if (tip) wrap.insertBefore(chip, tip);
    else wrap.appendChild(chip);
  }

  async function decorate(card) {
    const info = CSRP.dom.parseCard(card);
    if (!info.id) return;
    markCreator(card, info);
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
      // No stats badge to sit behind, but still tag the creator.
      addCreatorChip(card, info, wrap);
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
    // Creator chip sits right after the strength badge.
    addCreatorChip(card, info, wrap);
  }

  function tick() {
    // Lobby click-to-profile + creator decoration run regardless of the badges
    // toggle (they're navigation/cosmetic, not stats).
    tickLobby();
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
