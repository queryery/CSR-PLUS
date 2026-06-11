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
  let host = null;        // full-screen centering wrapper around the panel
  let lastSig = '';
  let cancelledLatch = false;
  let acceptedLatch = false;   // set once we accept; blocks re-arming the countdown
  let dragPos = null;     // { x, y } offset from centre, kept for the session
  let liveRows = [];      // all built player rows for the current content
  let acceptHud = null;   // the "N / M accepted" progress element

  // ── countdown state (shared with autoAccept) ──────────────────────────
  // Delay is configurable in Automation settings (seconds, clamped 1..30).
  function countdownMs() {
    const s = Number(CSRP.store.get('acceptDelay'));
    return Math.max(1, Math.min(30, s || 10)) * 1000;
  }
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

    // Rank pill on the avatar — filled once we know each player's standing.
    const rankEl = h('span', { class: 'csrp-mf-rank' }, '');
    const avEl = member.avatarSrc
      ? h('img', { class: 'csrp-mf-av', src: member.avatarSrc, onerror: function () { this.style.visibility = 'hidden'; } })
      : h('div', { class: 'csrp-mf-av' });
    const checkEl = h('span', { class: 'csrp-mf-check', title: 'Accepted' }, '✓');

    const row = h('div', { class: 'csrp-mf-row' }, [
      h('div', { class: 'csrp-mf-avwrap' }, [avEl, rankEl, checkEl]),
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

    // Mark this row's standing: rank 1 in its team gets a "TOP" pill; the single
    // best player across both teams gets the gold BEST treatment.
    function setRank(rank, isBest) {
      row.classList.toggle('csrp-mf-row-top', rank === 1);
      row.classList.toggle('csrp-mf-row-best', !!isBest);
      if (isBest) { rankEl.textContent = 'BEST'; rankEl.className = 'csrp-mf-rank csrp-mf-rank-best'; }
      else if (rank === 1) { rankEl.textContent = 'TOP'; rankEl.className = 'csrp-mf-rank csrp-mf-rank-top'; }
      else { rankEl.textContent = '#' + rank; rankEl.className = 'csrp-mf-rank'; }
    }

    // Reflect the live accept state read off the native avatar.
    let wasAccepted = false;
    function refreshAccepted() {
      const ok = avatarAccepted(member.nativeImg);
      if (ok === wasAccepted) return;
      wasAccepted = ok;
      row.classList.toggle('csrp-mf-row-accepted', ok);
      if (ok) {
        // brief pop when this player accepts
        row.classList.remove('csrp-mf-justaccepted');
        void row.offsetWidth;
        row.classList.add('csrp-mf-justaccepted');
        CSRP.sound?.play('tick');
      }
      return ok;
    }

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
    return { row, update, updateProfile, setRank, refreshAccepted, id };
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
      // Re-sort rows strongest-first once we have scores, then re-mount in order
      // with a slide so the leaderboard visibly settles.
      const sorted = built.slice().sort((a, b) =>
        (Number(b.row.dataset.score) || 0) - (Number(a.row.dataset.score) || 0));
      sorted.forEach((b, i) => {
        // Each team's #1 is the gold BEST; everyone else gets a plain rank.
        b.setRank(i + 1, i === 0);
        b.row.style.setProperty('--csrp-rank-i', i);
        b.row.classList.remove('csrp-mf-reorder');
        // force reflow so re-adding the class restarts the animation
        void b.row.offsetWidth;
        b.row.classList.add('csrp-mf-reorder');
        teamEl.appendChild(b.row);
      });
      if (good.length) {
        const avg = Math.round(good.reduce((s, a) => s + a.elo, 0) / good.length);
        eloEl.textContent = 'Avg ' + avg;
      }
      // Hand back the leader (built row + score) so buildContent can crown the
      // single match MVP across both teams.
      const topB = sorted[0];
      const topScore = topB ? (Number(topB.row.dataset.score) || 0) : -1;
      return { good, leader: topB, topScore };
    });

    return { wrap: teamEl, name: title, aggsP, built };
  }

  function membersFromAvatars(avatars) {
    return avatars.map((im) => ({
      id: CSRP.dom.idFromAvatar(im),
      avatarSrc: im.getAttribute('src') || '',
      nativeImg: im,                 // kept to read live per-player accept state
    }));
  }

  // A native avatar reads as "accepted" when the site shows it at full strength
  // (bright / no grayscale). Pending players are dimmed. We treat opacity and a
  // grayscale filter as the signal, tolerant of either being used.
  function avatarAccepted(img) {
    if (!img) return false;
    const cs = getComputedStyle(img);
    const op = parseFloat(cs.opacity);
    if (!Number.isNaN(op) && op < 0.85) return false;
    if (/grayscale\((?!0\b)/i.test(cs.filter || '')) return false;
    // Some markups dim a wrapper instead; check the immediate parent too.
    const p = img.parentElement;
    if (p) {
      const po = parseFloat(getComputedStyle(p).opacity);
      if (!Number.isNaN(po) && po < 0.85) return false;
    }
    return true;
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

    // All rows, so the tick can poll each player's live accept state.
    liveRows = [...a.built, ...b.built];

    // accept progress HUD ("N / M ready")
    acceptHud = h('div', { class: 'csrp-mf-accbar' }, [
      h('div', { class: 'csrp-mf-accbar-h' }, [
        h('span', { class: 'csrp-mf-accbar-lbl' }, 'Players ready'),
        h('span', { class: 'csrp-mf-accbar-n' }, `0 / ${liveRows.length}`),
      ]),
      h('div', { class: 'csrp-mf-accbar-track' }, [h('div', { class: 'csrp-mf-accbar-fill' })]),
    ]);

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
    const content = h('div', { class: 'csrp-mf-content' }, [acceptHud, wp, body]);

    // Fill the win-prob bar once both teams' stats are in. (Each team's BEST is
    // crowned inside buildTeam as its rows settle, so nothing to do here.)
    Promise.all([a.aggsP, b.aggsP]).then(([resA, resB]) => {
      if (!content.isConnected) return;
      const aggA = resA.good, aggB = resB.good;

      if (aggA.length >= 2 && aggB.length >= 2) {
        const p = CSRP.stats.winProbability(aggA, aggB);
        const pa = Math.round(p * 100);
        wp.querySelector('.csrp-mf-wp-fill').style.width = pa + '%';
        wp.querySelector('.csrp-mf-wp-t').textContent = 'Win Probability';
        wp.querySelector('.csrp-mf-wp-a').textContent = `${a.name} · ${pa}%`;
        wp.querySelector('.csrp-mf-wp-b').textContent = `${100 - pa}% · ${b.name}`;
        wp.dataset.fav = pa >= 50 ? 'a' : 'b';
      } else {
        wp.querySelector('.csrp-mf-wp-t').textContent = 'Not enough data';
      }
    });
    return content;
  }

  // Ensure our overlay exists: a full-screen host that centres the panel, with
  // the native dialog hidden separately so ours takes its place. The panel can
  // be dragged by its bar; the offset is remembered for the session.
  function ensurePanel() {
    if (panel && panel.isConnected) return panel;
    const bar = h('div', { class: 'csrp-mf-bar' }, [
      h('span', { class: 'csrp-mf-grip', title: 'Drag to move' }, '⠿'),
      h('span', { class: 'csrp-mf-pulse' }),
      h('div', { class: 'csrp-mf-brand' }, [
        h('span', { class: 'csrp-mf-logo' }, ['CSR', h('span', { class: 'csrp-mf-plus' }, '+')]),
        h('span', { class: 'csrp-mf-tag-lbl' }, 'Match Found'),
      ]),
      h('h1', { class: 'csrp-mf-timer' }, ''),
      h('button', {
        class: 'csrp-mf-copy', title: 'Copy both teams to clipboard',
        onclick: (e) => { e.stopPropagation(); copyLobby(e.currentTarget); },
      }, '⧉ Copy'),
      h('div', { class: 'csrp-mf-actions' }),
    ]);
    panel = h('div', { class: 'csrp-mf csrp-mf-center' }, [
      bar,
      h('div', { class: 'csrp-mf-content' }),
      h('div', { class: 'csrp-mf-foot' }),
    ]);
    host = h('div', { class: 'csrp-mf-host' }, [panel]);
    // Swallow clicks that land on the backdrop (not the panel) so the page
    // behind stays uninteractive while the match is being confirmed.
    host.addEventListener('pointerdown', (e) => { if (e.target === host) e.preventDefault(); });
    document.body.appendChild(host);
    lockPage();
    applyDragPos();
    enableDrag(bar);
    requestAnimationFrame(() => panel && panel.classList.add('csrp-mf-open'));
    return panel;
  }

  // While the overlay is up, block page scroll + the most common shortcut keys
  // so nothing behind the glass can be triggered by accident.
  let pageLocked = false;
  let prevOverflow = '';
  const blockScroll = (e) => { if (!panel || !panel.contains(e.target)) e.preventDefault(); };
  function lockPage() {
    if (pageLocked) return;
    pageLocked = true;
    prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    window.addEventListener('wheel', blockScroll, { passive: false, capture: true });
    window.addEventListener('touchmove', blockScroll, { passive: false, capture: true });
  }
  function unlockPage() {
    if (!pageLocked) return;
    pageLocked = false;
    document.documentElement.style.overflow = prevOverflow;
    window.removeEventListener('wheel', blockScroll, { capture: true });
    window.removeEventListener('touchmove', blockScroll, { capture: true });
  }

  function applyDragPos() {
    if (!panel) return;
    panel.style.setProperty('--csrp-dx', (dragPos ? dragPos.x : 0) + 'px');
    panel.style.setProperty('--csrp-dy', (dragPos ? dragPos.y : 0) + 'px');
  }

  // Drag the panel by its bar. We move via a transform offset from centre, so
  // it stays centred by default and the open animation is unaffected.
  function enableDrag(handle) {
    let startX = 0, startY = 0, baseX = 0, baseY = 0, dragging = false;
    const onMove = (e) => {
      if (!dragging) return;
      const nx = baseX + (e.clientX - startX);
      const ny = baseY + (e.clientY - startY);
      dragPos = clampToViewport(nx, ny);
      applyDragPos();
    };
    const onUp = () => {
      dragging = false;
      panel && panel.classList.remove('csrp-mf-dragging');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    handle.addEventListener('pointerdown', (e) => {
      // Ignore drags that start on interactive controls inside the bar.
      if (e.target.closest('button, a, input')) return;
      e.preventDefault();
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      baseX = dragPos ? dragPos.x : 0; baseY = dragPos ? dragPos.y : 0;
      panel && panel.classList.add('csrp-mf-dragging');
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }

  // Keep most of the panel on-screen as it's dragged.
  function clampToViewport(x, y) {
    if (!panel) return { x, y };
    const r = panel.getBoundingClientRect();
    const maxX = Math.max(0, (window.innerWidth - r.width) / 2 - 8);
    const maxY = Math.max(0, (window.innerHeight - r.height) / 2 - 8);
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }

  // Build / refresh the footer: a big Accept button that drives the native one.
  // The native dialog re-renders under us, so we re-query the live accept button
  // at click time instead of trusting a captured reference (that reference goes
  // stale and is the reason manual accept stopped working with auto-accept off).
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
          acceptNative();
        },
      }, accepted ? 'Match Accepted ✓' : 'Accept Match'),
    );
  }

  // Re-find the native accept button right now and click it for real.
  function acceptNative() {
    // Latch immediately so the auto-accept loop won't re-arm a new countdown
    // while the match-found dialog is still on screen (button stays present
    // until the server transitions away).
    acceptedLatch = true;
    const live = CSRP.dom.findMatchFoundModal();
    const btn = live?.acceptBtn;
    if (!btn) { CSRP.log('accept: native button not found'); return; }
    // Some React handlers ignore a bare .click(); dispatch real pointer events.
    btn.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    btn.click();
  }

  // Copy both teams (name · ELO · strength) as shareable text. Reads the live
  // rendered rows so it reflects whatever has loaded so far.
  function copyLobby(btn) {
    if (!panel) return;
    const lines = [];
    for (const team of panel.querySelectorAll('.csrp-mf-team')) {
      const tName = team.querySelector('.csrp-mf-team-name')?.textContent.trim() || 'Team';
      const tElo = team.querySelector('.csrp-mf-team-elo')?.textContent.trim();
      lines.push(`▌ ${tName}${tElo ? ' — ' + tElo : ''}`);
      for (const row of team.querySelectorAll('.csrp-mf-row')) {
        const name = row.querySelector('.csrp-mf-name')?.textContent.trim().replace(/\s+/g, ' ') || 'Player';
        const elo = row.querySelector('.csrp-mf-elo')?.textContent.trim();
        const kd = row.querySelector('.csrp-mf-stats .csrp-mf-stat:nth-child(1) .csrp-mf-statv')?.textContent.trim();
        const parts = [name];
        if (elo) parts.push(elo);
        if (kd && kd !== '—') parts.push('K/D ' + kd);
        lines.push('  • ' + parts.join(' · '));
      }
      lines.push('');
    }
    const text = ('CSR+ — Match\n' + lines.join('\n')).trim();

    const done = (ok) => {
      if (!btn) return;
      const prev = btn.textContent;
      btn.textContent = ok ? '✓ Copied' : 'Copy failed';
      btn.classList.toggle('csrp-mf-copy-done', ok);
      setTimeout(() => { btn.textContent = prev; btn.classList.remove('csrp-mf-copy-done'); }, 1600);
    };
    if (navigator.clipboard && document.hasFocus()) {
      navigator.clipboard.writeText(text).then(() => done(true)).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
    CSRP.sound?.play('click');
  }

  function fallbackCopy(text, done) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      const ok = document.execCommand('copy');
      ta.remove(); done(ok);
    } catch { done(false); }
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
    const totalMs = countdownMs();
    const startSec = Math.ceil(totalMs / 1000);
    let mount = panel && panel.isConnected ? panel.querySelector('.csrp-mf-actions') : null;
    const floating = !mount;
    const widget = h('div', { class: 'csrp-cd' + (floating ? ' csrp-cd-float' : '') }, [
      h('span', { class: 'csrp-cd-ring' }, [h('span', { class: 'csrp-cd-num' }, String(startSec))]),
      h('span', { class: 'csrp-cd-txt' }, 'Auto-accepting'),
      h('button', { class: 'csrp-cd-go', title: 'Accept now' }, 'Accept now'),
      h('button', { class: 'csrp-cd-x', title: 'Cancel auto-accept' }, '✕ Cancel'),
    ]);
    (mount || document.body).appendChild(widget);

    const startedAt = Date.now();
    countdown = { startedAt, cancelled: false, timer: null, widget, acceptBtn, lastSec: startSec + 1, totalMs };
    CSRP.sound?.play('alert');

    const numEl = widget.querySelector('.csrp-cd-num');
    const ring = widget.querySelector('.csrp-cd-ring');

    const accept = () => {
      finishCountdown();
      CSRP.sound?.play('accept');
      CSRP.log('countdown → accept');
      acceptNative();
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
      const remain = Math.max(0, totalMs - elapsed);
      const secs = Math.ceil(remain / 1000);
      numEl.textContent = String(secs);
      if (secs < countdown.lastSec && secs > 0) { countdown.lastSec = secs; CSRP.sound?.play('tick'); }
      const frac = elapsed / totalMs;
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
  function alreadyAccepted() { return acceptedLatch; }
  function resetAcceptLatch() { acceptedLatch = false; }

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
    if (host) { host.remove(); host = null; }
    panel = null;
    unlockPage();
    restoreNative();
    lastSig = '';
    footState = null;
    liveRows = [];
    acceptHud = null;
  }

  // ── desktop notification (fires once per match-found, even if the overlay
  //    is disabled) ───────────────────────────────────────────────────────
  let notifiedThisMatch = false;
  function notifyMatchFound(modal) {
    if (notifiedThisMatch) return;
    notifiedThisMatch = true;
    try {
      const count = modal.avatars.length;
      chrome.runtime.sendMessage({
        type: 'csrp:notify',
        title: 'CSR+ — Match found',
        message: count ? `Your ${count}-player match is ready. Accept to play!` : 'Your match is ready. Accept to play!',
      });
    } catch (e) { /* ignore */ }
  }

  // ── main tick ─────────────────────────────────────────────────────────
  async function tick() {
    const modal = CSRP.dom.findMatchFoundModal();
    if (!modal) { finishCountdown(); removePanel(); notifiedThisMatch = false; return; }
    notifyMatchFound(modal);
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

    // Poll each player's live accept state and update the ready HUD.
    refreshAccepts();
  }

  // Re-read every row's native avatar and reflect how many have accepted.
  function refreshAccepts() {
    if (!liveRows.length || !acceptHud || !acceptHud.isConnected) return;
    let n = 0;
    for (const r of liveRows) if (r.refreshAccepted()) n++;
    // refreshAccepted only returns truthy on a *change*; recompute the running
    // total from current row classes so the HUD is always accurate.
    n = liveRows.filter((r) => r.row.classList.contains('csrp-mf-row-accepted')).length;
    const total = liveRows.length;
    const numEl = acceptHud.querySelector('.csrp-mf-accbar-n');
    const fillEl = acceptHud.querySelector('.csrp-mf-accbar-fill');
    if (numEl) numEl.textContent = `${n} / ${total}`;
    if (fillEl) fillEl.style.width = (total ? (n / total) * 100 : 0) + '%';
    acceptHud.classList.toggle('csrp-mf-accbar-full', n === total && total > 0);
  }

  CSRP.matchOverlay = {
    tick,
    startCountdown,
    finishCountdown,
    countdownActive,
    countdownCancelled,
    resetCancelLatch,
    alreadyAccepted,
    resetAcceptLatch,
  };
})();
