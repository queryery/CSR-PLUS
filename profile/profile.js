/* CSR+ profile page. Loads a player's public profile and match history through
 * the background proxy and renders them in a layout that mirrors the site. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const id = new URLSearchParams(location.search).get('id');
  const period = new URLSearchParams(location.search).get('period') || 'all';

  function api(path) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'csrp:api', path }, (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.ok) return resolve(null);
        resolve(resp.data);
      });
    });
  }
  const user = (uid) => api(`/users/${uid}`);
  async function history(uid) {
    const pages = await Promise.all([0, 1, 2].map((p) => api(`/history/user/${uid}/${p}`)));
    const all = [];
    for (const b of pages) if (Array.isArray(b)) all.push(...b);
    return all;
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const stdev = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };

  function inPeriod(dateStr, p) {
    if (p === 'all') return true;
    const d = new Date(dateStr), now = new Date();
    const sToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (p === 'today') return d >= sToday;
    if (p === 'yesterday') { const y = new Date(sToday - 864e5); return d >= y && d < sToday; }
    return true;
  }

  // Turn raw history into per-match rows for the current player.
  function rows(hist, uid, p) {
    const out = [];
    for (const m of hist || []) {
      if (m.canceled || !inPeriod(m.date, p)) continue;
      const pl = m.players?.[uid]; if (!pl) continue;
      const [a, b] = (m.teams || '').split(' ');
      const sc = (m.score || '0 0').split(' ').map(Number);
      let won = null, myScore = null, oppScore = null;
      if (a && b && sc.length === 2) {
        const i = pl.team === a ? 0 : pl.team === b ? 1 : -1;
        if (i >= 0) { won = sc[i] > sc[i ? 0 : 1]; myScore = sc[i]; oppScore = sc[i ? 0 : 1]; }
      }
      const playerCount = m.players ? Object.keys(m.players).length : 0;
      const mode = playerCount >= 9 ? '5v5' : playerCount >= 5 ? '3v3' : playerCount ? '2v2' : '';
      out.push({
        kills: pl.kills || 0, deaths: pl.deaths || 0, assists: pl.assists || 0,
        rounds: (sc[0] + sc[1]) || 1, won, myScore, oppScore, date: m.date, map: m.map, mode,
      });
    }
    return out;
  }

  // Career rating, reused from the in-game engine (Elo-led, performance-weighted).
  function aggregate(profile, rs) {
    const games = rs.length;
    const kills = rs.reduce((s, r) => s + r.kills, 0), deaths = rs.reduce((s, r) => s + r.deaths, 0);
    const rounds = rs.reduce((s, r) => s + r.rounds, 0), assists = rs.reduce((s, r) => s + r.assists, 0);
    const lifeKD = profile && profile.deaths ? profile.kills / profile.deaths : 1;
    const kd = games ? (deaths ? kills / deaths : kills) : lifeKD;
    const kr = rounds ? kills / rounds : 0.68;
    const apr = rounds ? assists / rounds : 0;
    const adr = games ? clamp(kr * 100 + apr * 22, 30, 160) : 72;
    const kdSeries = rs.map((r) => (r.deaths ? r.kills / r.deaths : r.kills));
    const winrate = profile && profile.matches ? profile.wins / profile.matches : 0.5;
    const elo = profile?.points ?? 1000;
    return { elo, games, kd, kr, adr, winrate };
  }

  // 0..1 rating in the FACEIT-style "AVG rating" range the site shows.
  function rating(a) {
    const krN = clamp((a.kr - 0.4) / 0.6, 0, 1);
    const kdN = clamp((a.kd - 0.5) / 1.0, 0, 1);
    const adrN = clamp((a.adr - 50) / 60, 0, 1);
    return clamp(0.5 * kdN + 0.3 * krN + 0.2 * adrN, 0, 1.5) * 0.95 + 0.05;
  }

  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  const SITE = 'https://csrestored.fun';
  const mapIcon = (map) => `${SITE}/maps/icons/${(map || '').toLowerCase()}.png`;
  const mapLabel = (map) => (map || '').replace(/^de_/, '').replace(/^\w/, (c) => c.toUpperCase());

  // Tab switching. The inventory tab lazily embeds the inventory page so its
  // grid/search/sort are reused as-is.
  let invLoaded = false;
  function bindTabs() {
    const tabs = document.querySelectorAll('.ptab');
    const panels = document.querySelectorAll('.ptab-panel');
    tabs.forEach((t) => t.addEventListener('click', () => {
      const name = t.dataset.tab;
      tabs.forEach((x) => x.classList.toggle('active', x === t));
      panels.forEach((p) => p.classList.toggle('active', p.dataset.panel === name));
      if (name === 'inventory' && !invLoaded) {
        invLoaded = true;
        const frame = document.createElement('iframe');
        frame.className = 'inv-frame';
        frame.src = chrome.runtime.getURL(`inventory/inventory.html?id=${id}`);
        $('#inv-frame-wrap').append(frame);
      }
    }));
  }

  async function render() {
    if (!id) { $('#head').innerHTML = '<div class="ph-skel">No player selected.</div>'; return; }
    document.title = 'CSR+ Profile';
    $('#site-link').href = `${SITE}/app/user/${id}`;

    const [profile, hist] = await Promise.all([user(id), history(id)]);
    if (!profile) { $('#head').innerHTML = '<div class="ph-skel">Could not load this player.</div>'; return; }
    document.title = `${profile.name} — CSR+`;

    const rs = rows(hist, id, period);
    const agg = aggregate(profile, rs);
    const avatar = profile.avatar ? `https://cdn.discordapp.com/avatars/${id}/${profile.avatar}.png?size=128` : '';
    const steam = profile.steam;

    $('#ptabs').hidden = false;
    bindTabs();

    // ── header card ────────────────────────────────────────────────────
    const head = $('#head');
    head.innerHTML = '';
    const flag = profile.country ? `<img class="flag" src="https://flagcdn.com/w40/${profile.country}.png" alt="" />` : '';
    const links = steam ? `
      <a class="ext steam" target="_blank" rel="noopener" title="Steam profile" href="https://steamcommunity.com/profiles/${steam}">${ICONS.steam}</a>
      <a class="ext steamdb" target="_blank" rel="noopener" title="SteamDB" href="https://steamdb.info/calculator/${steam}/">${ICONS.steamdb}</a>
      <a class="ext faceit" target="_blank" rel="noopener" title="FaceitFinder" href="https://faceitfinder.com/profile/${steam}">${ICONS.faceit}</a>` : '';

    head.append(
      avatar ? Object.assign(el('img', 'ph-av'), { src: avatar, alt: '' }) : el('div', 'ph-av'),
      (() => {
        const info = el('div', 'ph-info');
        info.append(
          el('div', 'ph-name', `${escapeHtml(profile.name)} ${flag}`),
          el('div', 'ph-links', links)
        );
        return info;
      })()
    );

    // ── statistics grid (site order) ───────────────────────────────────
    const winratePct = profile.matches ? (profile.wins / profile.matches) * 100 : 0;
    const kdr = profile.deaths ? profile.kills / profile.deaths : profile.kills;
    const avg = profile.matches ? profile.kills / profile.matches : 0;
    const stats = [
      ['Winrate', winratePct.toFixed(2) + '%', true],
      ['ELO', String(profile.points ?? '—'), true],
      ['KDR', kdr.toFixed(2), true],
      ['AVG', avg.toFixed(2), true],
      ['Rating', rating(agg).toFixed(2), true],
      ['Kills', String(profile.kills ?? 0)],
      ['Deaths', String(profile.deaths ?? 0)],
      ['Matches', String(profile.matches ?? 0)],
      ['Wins', String(profile.wins ?? 0)],
    ];
    $('#stats-block').hidden = false;
    const grid = $('#stat-grid'); grid.innerHTML = '';
    stats.forEach(([label, value, accent], i) => {
      const cell = el('div', 'stat' + (accent ? ' stat-accent' : ''));
      cell.style.animationDelay = (i * 0.03) + 's';
      cell.append(el('div', 'stat-v', escapeHtml(value)), el('div', 'stat-k', label));
      grid.append(cell);
    });

    // ── match history ──────────────────────────────────────────────────
    if (rs.length) {
      $('#history-block').hidden = false;
      const list = $('#history'); list.innerHTML = '';
      list.append(headerRow());
      rs.forEach((r, i) => {
        const win = r.won === true, loss = r.won === false;
        const row = el('a', 'hrow ' + (win ? 'win' : loss ? 'loss' : ''));
        row.style.animationDelay = Math.min(i * 0.02, 0.4) + 's';
        const d = new Date(r.date);
        const date = isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const time = isNaN(d) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        const kdrRow = r.deaths ? (r.kills / r.deaths).toFixed(2) : r.kills.toFixed(2);
        const res = win ? 'W' : loss ? 'L' : '—';
        const score = (r.myScore != null && r.oppScore != null)
          ? `<span class="hs-res">${res}</span><span class="hs-mine">${r.myScore}</span><span class="hs-sep">:</span><span class="hs-opp">${r.oppScore}</span>`
          : `<span class="hs-res">${res}</span>`;
        row.innerHTML =
          `<div class="hc hc-date"><span>${date}</span><span class="dim">${time}</span></div>` +
          `<div class="hc hc-score">${score}</div>` +
          `<div class="hc hc-kda">${r.kills} / ${r.deaths} / ${r.assists}</div>` +
          `<div class="hc hc-kdr">${kdrRow}</div>` +
          `<div class="hc hc-map"><img src="${mapIcon(r.map)}" alt="" onerror="this.style.visibility='hidden'" />` +
            `<span class="hm-txt"><span>${escapeHtml(mapLabel(r.map))}</span><span class="dim">${r.mode}</span></span></div>`;
        list.append(row);
      });
    }
  }

  function headerRow() {
    const h = el('div', 'hrow hrow-head');
    h.innerHTML = '<div class="hc">Date</div><div class="hc">Score</div><div class="hc">K / D / A</div><div class="hc">KDR</div><div class="hc">Map</div>';
    return h;
  }

  // Inline SVGs matching the icons the site uses for each external link.
  const ICONS = {
    steam: '<svg viewBox="0 0 496 512" width="16" height="16" fill="currentColor"><path d="M496 256c0 137-111.2 248-248.4 248-113.8 0-209.6-76.3-239-180.4l95.2 39.3c6.4 32.1 34.9 56.4 68.9 56.4 39.2 0 71.9-32.4 70.2-73.5l84.5-60.2c52.1 1.3 95.8-40.9 95.8-93.5 0-51.6-42-93.5-93.7-93.5s-93.7 42-93.7 93.5v1.2L176.6 279c-15.5-.9-30.7 3.4-43.5 12.1L0 236.1C10.2 108.4 117.1 8 247.6 8 384.8 8 496 119 496 256zM155.7 384.3l-30.5-12.6a52.79 52.79 0 0 0 27.2 25.8c26.9 11.2 57.8-1.6 69-28.4 5.4-13 5.5-27.3.1-40.3-5.4-13-15.5-23.2-28.5-28.6-12.9-5.4-26.7-5.2-38.9-.6l31.5 13c19.8 8.2 29.2 30.9 20.9 50.7-8.3 19.9-31 29.2-50.8 21zm173.8-129.9c-34.4 0-62.4-28-62.4-62.3s28-62.3 62.4-62.3 62.4 28 62.4 62.3-27.9 62.3-62.4 62.3zm.1-15.6c25.9 0 46.9-21 46.9-46.8 0-25.9-21-46.8-46.9-46.8s-46.9 21-46.9 46.8c.1 25.8 21.1 46.8 46.9 46.8z"/></svg>',
    steamdb: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M11.981 0C5.72 0 .581 2.231.02 5.081l6.675 1.257c.544-.17 1.162-.244 1.8-.244l3.131-1.875c-.037-.469.244-.956.881-1.35.9-.581 2.307-.9 3.732-.9a8.582 8.582 0 012.812.412c2.1.713 2.569 2.082 1.069 3.057-.956.618-2.494.937-4.013.9l-4.125 1.48c-.037.3-.243.582-.637.845-1.106.712-3.263.88-4.8.356-.675-.225-1.125-.563-1.313-.9L.47 7.2c.431.675 1.125 1.294 2.025 1.838C.938 9.938 0 11.062 0 12.28c0 1.2.9 2.307 2.419 3.206C.9 16.37 0 17.476 0 18.675 0 21.619 5.363 24 12 24c6.619 0 12-2.381 12-5.325 0-1.2-.9-2.306-2.419-3.188C23.1 14.588 24 13.482 24 12.282c0-1.219-.938-2.362-2.512-3.262 1.556-.956 2.493-2.138 2.493-3.413 0-3.093-5.381-5.606-12-5.606zM20.437 9.563v1.743c0 2.063-3.787 3.732-8.437 3.732-4.669 0-8.437-1.67-8.437-3.732V9.581c2.156.994 5.137 1.613 8.418 1.613 3.3 0 6.3-.619 8.475-1.631zm0 6.487v1.65c0 2.063-3.787 3.731-8.437 3.731-4.669 0-8.437-1.668-8.437-3.731v-1.65c2.175.956 5.137 1.538 8.437 1.538s6.281-.582 8.438-1.538z"/></svg>',
    faceit: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M23.999 2.705a.167.167 0 00-.312-.1 1141.27 1141.27 0 00-6.053 9.375H.218c-.221 0-.301.282-.11.352 7.227 2.73 17.667 6.836 23.5 9.134.15.06.39-.08.39-.18z"/></svg>',
  };

  render();
})();
