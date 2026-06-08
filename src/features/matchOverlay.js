/* CSR+ — Match Found enhancer.
 *
 * The site's "Match found" confirm popup only shows a bare row of avatars. We
 * rebuild that into proper rows (avatar, name, tag, strength badge, K/D, K/R,
 * ADR, winrate), grouped/sorted by team, and host the auto-accept countdown
 * inside this same native window.
 *
 * The normal match room is NOT touched here — player cards are enhanced in
 * place by playerBadges.js. There is no floating/in-flow intel panel anymore. */
(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});
  const { h } = CSRP.dom;

  let panel = null;       // our injected block inside the match-found window
  let lastSig = '';
  let cancelledLatch = false;

  // ── countdown state (shared with autoAccept) ──────────────────────────
  const COUNTDOWN_MS = 10000;
  let countdown = null;

  // Build one player row from { id, avatarSrc }. Stats fetched via getAgg.
  const statCell = (k, v) => h('div', { class: 'csrp-mf-stat' }, [
    h('div', { class: 'csrp-mf-statv' }, v),
    h('div', { class: 'csrp-mf-statk' }, k),
  ]);

  // Build a row SYNCHRONOUSLY with placeholders + an update(agg) hook so the
  // panel renders instantly and each row fills in as its stats arrive.
  function makeRow(member) {
    const id = member.id;
    const tag = id ? CSRP.notes.getTag?.(id) : null;

    const nameEl = h('div', { class: 'csrp-mf-name' }, [
      id ? 'Loading…' : 'Anonymous',
      tag ? h('span', { class: 'csrp-tag-chip csrp-mf-tag' }, tag) : null,
    ]);
    const badgeEl = h('span', { class: 'csrp-badge csrp-badge-loading csrp-mf-badge' }, '···');
    const eloEl = h('span', { class: 'csrp-mf-elo' }, '');
    const kd = statCell('K/D', '—'), kr = statCell('K/R', '—'),
      adr = statCell('ADR', '—'), wr = statCell('WR', '—');

    const row = h('div', { class: 'csrp-mf-row' }, [
      member.avatarSrc
        ? h('img', { class: 'csrp-mf-av', src: member.avatarSrc, onerror: function () { this.style.visibility = 'hidden'; } })
        : h('div', { class: 'csrp-mf-av' }),
      h('div', { class: 'csrp-mf-id' }, [
        nameEl,
        h('div', { class: 'csrp-mf-sub' }, [badgeEl, eloEl]),
      ]),
      h('div', { class: 'csrp-mf-stats' }, [kd, kr, adr, wr]),
      id ? h('button', {
        class: 'csrp-mf-prof', title: 'View profile (new tab)',
        onclick: (e) => { e.stopPropagation(); CSRP.notes.openProfile(id); },
      }, '↗') : null,
    ]);

    // Fast first paint from just the user profile (name + ELO).
    function updateProfile(profile) {
      if (!profile) return;
      nameEl.firstChild.textContent = profile.name || 'Player';
      if (profile.points != null) eloEl.textContent = profile.points + ' ELO';
    }

    function update(agg) {
      if (!agg) { if (nameEl.firstChild.textContent === 'Loading…') nameEl.firstChild.textContent = id ? 'Player' : 'Anonymous'; return; }
      const score = CSRP.stats.strength(agg);
      const tier = CSRP.classify(agg);
      nameEl.firstChild.textContent = agg.name || 'Player';
      badgeEl.className = `csrp-badge ${tier.cls} csrp-mf-badge`;
      badgeEl.replaceChildren(h('span', { class: 'csrp-badge-dot' }), document.createTextNode(tier.label));
      if (agg.elo != null) eloEl.textContent = agg.elo + ' ELO';
      kd.querySelector('.csrp-mf-statv').textContent = agg.kd.toFixed(2);
      kr.querySelector('.csrp-mf-statv').textContent = agg.kr.toFixed(2);
      adr.querySelector('.csrp-mf-statv').textContent = agg.adr.toFixed(0);
      wr.querySelector('.csrp-mf-statv').textContent = (agg.winrate * 100).toFixed(0) + '%';
      row.dataset.score = String(score);
    }
    return { row, update, updateProfile, id };
  }

  // Build a team block immediately; returns the wrap + a promise of aggs that
  // resolves as each player's stats stream in (rows update live).
  function buildTeam(members, title) {
    const eloEl = h('span', { class: 'csrp-mf-team-elo' }, '');
    const teamEl = h('div', { class: 'csrp-mf-team' }, [
      h('div', { class: 'csrp-mf-team-h' }, [
        h('span', { class: 'csrp-mf-team-name' }, title),
        eloEl,
      ]),
    ]);
    const built = members.map(makeRow);
    built.forEach((b) => teamEl.appendChild(b.row));

    // Fire all fetches in parallel. Paint name+ELO from the user profile the
    // moment it lands, then fill full stats when history resolves.
    const aggsP = Promise.all(
      built.map(async (b) => {
        if (!b.id) return null;
        CSRP.api.user(b.id).then((p) => b.updateProfile(p)); // fast first paint
        const agg = await CSRP.playerBadges.getAgg(b.id);
        b.update(agg);
        return agg;
      })
    ).then((aggs) => {
      const good = aggs.filter(Boolean);
      // Re-sort rows strongest-first once we have scores.
      const sorted = built.slice().sort((a, b) =>
        (Number(b.row.dataset.score) || 0) - (Number(a.row.dataset.score) || 0));
      sorted.forEach((b) => teamEl.appendChild(b.row));
      if (good.length) {
        const avg = Math.round(good.reduce((s, a) => s + a.elo, 0) / good.length);
        eloEl.textContent = 'Avg ' + avg;
      }
      return good;
    });

    return { wrap: teamEl, name: title, aggsP };
  }

  function membersFromAvatars(avatars) {
    return avatars.map((im) => ({
      id: CSRP.dom.idFromAvatar(im),
      avatarSrc: im.getAttribute('src') || '',
    }));
  }

  function buildContent(avatars) {
    const md = CSRP._matchData || {};
    const t1 = (md.team1 || []).map(String);
    const t2 = (md.team2 || []).map(String);
    const members = membersFromAvatars(avatars);

    let groupA, groupB;
    if (t1.length && t2.length) {
      groupA = members.filter((m) => m.id && t1.includes(m.id));
      groupB = members.filter((m) => m.id && t2.includes(m.id));
      const rest = members.filter((m) => !groupA.includes(m) && !groupB.includes(m));
      for (const r of rest) (groupA.length <= groupB.length ? groupA : groupB).push(r);
    } else {
      const mid = Math.ceil(members.length / 2);
      groupA = members.slice(0, mid);
      groupB = members.slice(mid);
    }

    // Build both team blocks SYNCHRONOUSLY (rows show instantly, fill in live).
    const a = buildTeam(groupA, 'Your Team');
    const b = buildTeam(groupB, 'Enemy Team');

    // win probability bar
    const wp = h('div', { class: 'csrp-mf-wp' }, [
      h('div', { class: 'csrp-mf-wp-labels' }, [
        h('span', { class: 'csrp-mf-wp-a' }, ''),
        h('span', { class: 'csrp-mf-wp-t' }, 'Gathering stats…'),
        h('span', { class: 'csrp-mf-wp-b' }, ''),
      ]),
      h('div', { class: 'csrp-mf-wp-track' }, [h('div', { class: 'csrp-mf-wp-fill' })]),
    ]);

    const body = h('div', { class: 'csrp-mf-body' }, [a.wrap, h('div', { class: 'csrp-mf-vs' }, 'VS'), b.wrap]);
    const content = h('div', { class: 'csrp-mf-content' }, [wp, body]);

    // Fill the win-prob bar once both teams' stats have streamed in.
    Promise.all([a.aggsP, b.aggsP]).then(([aggA, aggB]) => {
      if (!content.isConnected) return;
      if (aggA.length >= 2 && aggB.length >= 2) {
        const p = CSRP.stats.winProbability(aggA, aggB);
        const pa = Math.round(p * 100);
        wp.querySelector('.csrp-mf-wp-fill').style.width = pa + '%';
        wp.querySelector('.csrp-mf-wp-t').textContent = 'Win Probability';
        wp.querySelector('.csrp-mf-wp-a').textContent = `${a.name} · ${pa}%`;
        wp.querySelector('.csrp-mf-wp-b').textContent = `${100 - pa}% · ${b.name}`;
      } else {
        wp.querySelector('.csrp-mf-wp-t').textContent = 'Not enough data';
      }
    });
    return content;
  }

  // Ensure our centered overlay panel exists (mounted on <body>; the native
  // dialog is hidden separately so ours takes its place in the center).
  function ensurePanel() {
    if (panel && panel.isConnected) return panel;
    panel = h('div', { class: 'csrp-mf csrp-mf-center' }, [
      h('div', { class: 'csrp-mf-bar' }, [
        h('span', { class: 'csrp-mf-logo' }, ['CSR', h('span', { class: 'csrp-mf-plus' }, '+')]),
        h('span', { class: 'csrp-mf-tag-lbl' }, 'Match Found'),
        h('h1', { class: 'csrp-mf-timer' }, ''),
        h('div', { class: 'csrp-mf-actions' }),
      ]),
      h('div', { class: 'csrp-mf-content' }),
      h('div', { class: 'csrp-mf-foot' }),
    ]);
    document.body.appendChild(panel);
    requestAnimationFrame(() => panel && panel.classList.add('csrp-mf-open'));
    return panel;
  }

  // Build / refresh the footer: a big Accept button that drives the native one.
  let footState = null;
  function renderFoot(modal) {
    const foot = panel.querySelector('.csrp-mf-foot');
    if (!foot) return;
    const accepted = modal.accepted;
    if (footState === accepted && foot.firstChild) return; // no change
    footState = accepted;
    foot.replaceChildren(
      h('button', {
        class: 'csrp-mf-accept' + (accepted ? ' csrp-mf-accept-done' : ''),
        disabled: accepted ? '' : undefined,
        onclick: () => {
          if (accepted) return;
          CSRP.sound?.play('accept');
          finishCountdown();
          modal.acceptBtn && modal.acceptBtn.click();
        },
      }, accepted ? 'Match Accepted ✓' : 'Accept Match'),
    );
  }

  // Mirror the native countdown timer (mm:ss) into our header.
  function syncTimer(modal) {
    const el = panel && panel.querySelector('.csrp-mf-timer');
    if (!el) return;
    // The native timer is an h1 with mm:ss inside the dialog.
    let txt = '';
    for (const hh of modal.host.querySelectorAll('h1')) {
      const t = hh.textContent.trim();
      if (/^\d{1,2}:\d{2}$/.test(t)) { txt = t; break; }
    }
    el.textContent = txt;
  }

  // ── auto-accept countdown (hosted inside the match-found window) ───────
  function startCountdown(acceptBtn) {
    if (countdown) return;
    // Mount the countdown into our panel bar if present, else float it.
    let host = panel && panel.isConnected ? panel.querySelector('.csrp-mf-actions') : null;
    const floating = !host;
    const widget = h('div', { class: 'csrp-cd' + (floating ? ' csrp-cd-float' : '') }, [
      h('span', { class: 'csrp-cd-ring' }, [h('span', { class: 'csrp-cd-num' }, '10')]),
      h('span', { class: 'csrp-cd-txt' }, 'Auto-accepting'),
      h('button', { class: 'csrp-cd-go', title: 'Accept now' }, 'Accept now'),
      h('button', { class: 'csrp-cd-x', title: 'Cancel auto-accept' }, '✕ Cancel'),
    ]);
    (host || document.body).appendChild(widget);

    const startedAt = Date.now();
    countdown = { startedAt, cancelled: false, timer: null, widget, acceptBtn, lastSec: 11 };
    CSRP.sound?.play('alert');

    const numEl = widget.querySelector('.csrp-cd-num');
    const ring = widget.querySelector('.csrp-cd-ring');

    const accept = () => {
      finishCountdown();
      CSRP.sound?.play('accept');
      CSRP.log('countdown → accept');
      acceptBtn.click();
    };
    widget.querySelector('.csrp-cd-go').addEventListener('click', accept);
    widget.querySelector('.csrp-cd-x').addEventListener('click', () => {
      if (!countdown) return;
      countdown.cancelled = true;
      cancelledLatch = true;
      CSRP.sound?.play('cancel');
      finishCountdown();
      CSRP.log('countdown cancelled');
    });

    countdown.timer = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const remain = Math.max(0, COUNTDOWN_MS - elapsed);
      const secs = Math.ceil(remain / 1000);
      numEl.textContent = String(secs);
      if (secs < countdown.lastSec && secs > 0) { countdown.lastSec = secs; CSRP.sound?.play('tick'); }
      const frac = elapsed / COUNTDOWN_MS;
      ring.style.background = `conic-gradient(var(--csrp-accent) ${frac * 360}deg, rgba(255,255,255,0.12) 0deg)`;
      if (remain <= 0 && !countdown.cancelled) accept();
    }, 100);
  }

  function finishCountdown() {
    if (!countdown) return;
    clearInterval(countdown.timer);
    countdown.widget?.remove();
    countdown = null;
  }
  function countdownActive() { return !!countdown; }
  function countdownCancelled() { return cancelledLatch; }
  function resetCancelLatch() { cancelledLatch = false; }

  let hiddenBox = null;
  function hideNative(box) {
    if (box && box.style.visibility !== 'hidden') {
      box.dataset.csrpHidden = '1';
      box.style.visibility = 'hidden';
      box.style.pointerEvents = 'none';
      hiddenBox = box;
    }
  }
  function restoreNative() {
    if (hiddenBox) { hiddenBox.style.visibility = ''; hiddenBox.style.pointerEvents = ''; delete hiddenBox.dataset.csrpHidden; hiddenBox = null; }
  }

  function removePanel() {
    if (panel) { panel.remove(); panel = null; }
    restoreNative();
    lastSig = '';
    footState = null;
  }

  // ── main tick ─────────────────────────────────────────────────────────
  async function tick() {
    const modal = CSRP.dom.findMatchFoundModal();
    if (!modal) { removePanel(); return; }
    if (!CSRP.store.get('showMatchOverlay')) { removePanel(); return; }

    // Hide the native dialog and show our centered panel in its place.
    hideNative(modal.host);
    ensurePanel();

    // Countdown widget belongs in our header bar.
    if (countdown && countdown.widget && !panel.contains(countdown.widget)) {
      const actions = panel.querySelector('.csrp-mf-actions');
      countdown.widget.classList.remove('csrp-cd-float');
      actions.appendChild(countdown.widget);
    }

    syncTimer(modal);
    renderFoot(modal);

    const sig = modal.avatars.map((im) => CSRP.dom.idFromAvatar(im) || '?').join(',') + '|' + modal.accepted;
    if (sig !== lastSig) {
      lastSig = sig;
      const content = buildContent(modal.avatars);
      const slot = panel.querySelector('.csrp-mf-content');
      if (slot) slot.replaceWith(content);
    }
  }

  CSRP.matchOverlay = {
    tick,
    startCountdown,
    finishCountdown,
    countdownActive,
    countdownCancelled,
    resetCancelLatch,
  };
})();
