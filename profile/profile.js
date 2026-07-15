(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const period = params.get('period') || 'last10';
  const startTab = params.get('tab') || 'overview';

  let CSRP_MYID = null;
  try { chrome.storage.local.get(['csrpMyId'], (d) => { if (d && d.csrpMyId) CSRP_MYID = String(d.csrpMyId); }); } catch {}

  let sndCfg = { soundEnabled: true, soundVolume: 0.6 };
  try {
    const area = (chrome.storage && chrome.storage.sync) ? chrome.storage.sync : chrome.storage.local;
    area.get(['soundEnabled', 'soundVolume'], (d) => {
      if (d && typeof d.soundEnabled === 'boolean') sndCfg.soundEnabled = d.soundEnabled;
      if (d && typeof d.soundVolume === 'number') sndCfg.soundVolume = d.soundVolume;
    });
  } catch {  }
  const sndCache = {};
  function snd(name) {
    if (!sndCfg.soundEnabled) return;
    try {
      let a = sndCache[name];
      if (!a) { a = new Audio(chrome.runtime.getURL(`assets/sounds/${name}.wav`)); sndCache[name] = a; }
      const n = a.cloneNode(true);
      n.volume = sndCfg.soundVolume;
      n.play().catch(() => {});
    } catch {  }
  }

  function bindBack() {
    const btn = $('#back-btn');
    btn.addEventListener('click', () => {
      snd('click');
      if (history.length > 1) {
        const here = location.href;
        history.back();
        setTimeout(() => { if (location.href === here) window.close(); }, 150);
      } else { window.close(); }
    });
  }

  function api(path) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'csrp:api', path }, (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.ok) return resolve(null);
        resolve(resp.data);
      });
    });
  }
  const user = (uid) => api(`/users/${uid}`);
  const historyPage = async (uid, page) => {
    const p = await api(`/history/user/${uid}/${page}`);
    return Array.isArray(p) ? p : [];
  };

  function proApi(path) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'csrp:pro', path }, (resp) => {
          if (chrome.runtime.lastError || !resp || !resp.ok) return resolve(null);
          resolve(resp.data);
        });
      } catch { resolve(null); }
    });
  }
  async function tierOf(uid) {
    const d = await proApi('/pub/profiles?ids=' + encodeURIComponent(uid));
    const p = d && d.profiles && d.profiles[uid];
    return (p && p.tier) || 'free';
  }
  function tierBadgeHtml(tier) {
    if (tier !== 'pro' && tier !== 'premium') return '';
    const label = tier === 'premium' ? 'PREMIUM' : 'PRO';
    return `<span class="ps-tier ps-tier-${tier}">◆ ${label}</span>`;
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const SITE = 'https://csrestored.fun';
  const mapIcon = (map) => `${SITE}/maps/icons/${(map || '').toLowerCase()}.png`;
  const mapLabel = (map) => (map || '').replace(/^de_/, '').replace(/^\w/, (c) => c.toUpperCase());

  function inPeriod(dateStr, p) {
    if (p !== 'today' && p !== 'yesterday') return true;
    const d = new Date(dateStr), now = new Date();
    const sToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (p === 'today') return d >= sToday;
    const y = new Date(sToday - 864e5); return d >= y && d < sToday;
  }

  function toRow(m, uid) {
    if (m.canceled) return null;
    const pl = m.players?.[uid]; if (!pl) return null;
    const [a, b] = (m.teams || '').split(' ');
    const sc = (m.score || '0 0').split(' ').map(Number);
    let won = null, myScore = null, oppScore = null;
    if (a && b && sc.length === 2) {
      const i = pl.team === a ? 0 : pl.team === b ? 1 : -1;
      if (i >= 0) { won = sc[i] > sc[i ? 0 : 1]; myScore = sc[i]; oppScore = sc[i ? 0 : 1]; }
    }
    const playerCount = m.players ? Object.keys(m.players).length : 0;
    const mode = playerCount >= 9 ? '5v5' : playerCount >= 5 ? '3v3' : playerCount ? '2v2' : '';

    const eloAfter = [pl.elo, pl.points, pl.elo_after, pl.new_elo].map(Number).find((x) => Number.isFinite(x) && x > 0) ?? null;
    const eloDelta = [pl.elo_change, pl.points_change, pl.delta].map(Number).find((x) => Number.isFinite(x)) ?? null;
    return {
      kills: pl.kills || 0, deaths: pl.deaths || 0, assists: pl.assists || 0,
      rounds: (sc[0] + sc[1]) || 1, won, myScore, oppScore,
      date: m.date, map: m.map, mode, eloAfter, eloDelta,
    };
  }

  const state = {
    profile: null,
    rows: [],
    page: 0,
    histDone: false,
    inv: null,
    invState: { sort: 'rarity', q: '', type: 'all' },
  };

  function switchTab(name) {
    document.querySelectorAll('.pn-tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === name));
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('on', p.dataset.panel === name));
    if (name === 'performance') drawCharts();
    if (name === 'inventory' && !state.inv) loadInventory();
    const u = new URL(location.href); u.searchParams.set('tab', name);
    history.replaceState(null, '', u);
  }
  function bindTabs() {
    document.querySelectorAll('.pn-tab').forEach((t) => {
      t.addEventListener('mouseenter', () => snd('hover'));
      t.addEventListener('click', () => { snd('click'); switchTab(t.dataset.tab); });
    });
  }

  const ICONS = {
    steam: '<svg viewBox="0 0 496 512" width="16" height="16" fill="currentColor"><path d="M496 256c0 137-111.2 248-248.4 248-113.8 0-209.6-76.3-239-180.4l95.2 39.3c6.4 32.1 34.9 56.4 68.9 56.4 39.2 0 71.9-32.4 70.2-73.5l84.5-60.2c52.1 1.3 95.8-40.9 95.8-93.5 0-51.6-42-93.5-93.7-93.5s-93.7 42-93.7 93.5v1.2L176.6 279c-15.5-.9-30.7 3.4-43.5 12.1L0 236.1C10.2 108.4 117.1 8 247.6 8 384.8 8 496 119 496 256zM155.7 384.3l-30.5-12.6a52.79 52.79 0 0 0 27.2 25.8c26.9 11.2 57.8-1.6 69-28.4 5.4-13 5.5-27.3.1-40.3-5.4-13-15.5-23.2-28.5-28.6-12.9-5.4-26.7-5.2-38.9-.6l31.5 13c19.8 8.2 29.2 30.9 20.9 50.7-8.3 19.9-31 29.2-50.8 21zm173.8-129.9c-34.4 0-62.4-28-62.4-62.3s28-62.3 62.4-62.3 62.4 28 62.4 62.3-27.9 62.3-62.4 62.3zm.1-15.6c25.9 0 46.9-21 46.9-46.8 0-25.9-21-46.8-46.9-46.8s-46.9 21-46.9 46.8c.1 25.8 21.1 46.8 46.9 46.8z"/></svg>',
    steamdb: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M11.981 0C5.72 0 .581 2.231.02 5.081l6.675 1.257c.544-.17 1.162-.244 1.8-.244l3.131-1.875c-.037-.469.244-.956.881-1.35.9-.581 2.307-.9 3.732-.9a8.582 8.582 0 012.812.412c2.1.713 2.569 2.082 1.069 3.057-.956.618-2.494.937-4.013.9l-4.125 1.48c-.037.3-.243.582-.637.845-1.106.712-3.263.88-4.8.356-.675-.225-1.125-.563-1.313-.9L.47 7.2c.431.675 1.125 1.294 2.025 1.838C.938 9.938 0 11.062 0 12.28c0 1.2.9 2.307 2.419 3.206C.9 16.37 0 17.476 0 18.675 0 21.619 5.363 24 12 24c6.619 0 12-2.381 12-5.325 0-1.2-.9-2.306-2.419-3.188C23.1 14.588 24 13.482 24 12.282c0-1.219-.938-2.362-2.512-3.262 1.556-.956 2.493-2.138 2.493-3.413 0-3.093-5.381-5.606-12-5.606zM20.437 9.563v1.743c0 2.063-3.787 3.732-8.437 3.732-4.669 0-8.437-1.67-8.437-3.732V9.581c2.156.994 5.137 1.613 8.418 1.613 3.3 0 6.3-.619 8.475-1.631zm0 6.487v1.65c0 2.063-3.787 3.731-8.437 3.731-4.669 0-8.437-1.668-8.437-3.731v-1.65c2.175.956 5.137 1.538 8.437 1.538s6.281-.582 8.438-1.538z"/></svg>',
    faceit: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M23.999 2.705a.167.167 0 00-.312-.1 1141.27 1141.27 0 00-6.053 9.375H.218c-.221 0-.301.282-.11.352 7.227 2.73 17.667 6.836 23.5 9.134.15.06.39-.08.39-.18z"/></svg>',
  };

  function eloTier(points) {
    const p = Number(points);
    if (!Number.isFinite(p)) return { name: 'Unranked', c: '#9aa0ad', i: 0 };
    if (p < 600) return { name: 'Bronze', c: '#b0764a', i: 1 };
    if (p < 900) return { name: 'Silver', c: '#b9c2d0', i: 2 };
    if (p < 1200) return { name: 'Gold', c: '#ffd24a', i: 3 };
    if (p < 1500) return { name: 'Platinum', c: '#5ed6d6', i: 4 };
    if (p < 1800) return { name: 'Diamond', c: '#7aa8ff', i: 5 };
    if (p < 2100) return { name: 'Master', c: '#c77dff', i: 6 };
    return { name: 'Elite', c: '#ff5d6c', i: 7 };
  }

  function renderIdentity(profile) {
    const avatar = profile.avatar ? `https://cdn.discordapp.com/avatars/${id}/${profile.avatar}.png?size=128` : '';
    const flag = profile.country ? `<img class="flag" src="https://flagcdn.com/w40/${profile.country}.png" alt="" />` : '';

    const tier = eloTier(profile.points);
    const wins = Number(profile.wins) || 0;
    const matches = Number(profile.matches) || 0;
    const wr = matches ? (wins / matches) * 100 : 0;
    const kdr = profile.deaths ? profile.kills / profile.deaths : (profile.kills || 0);
    const card = $('#ps-card');
    card.style.setProperty('--tc', tier.c);
    const rankLabel = tier.name;
    const rankTitle = `${tier.name} tier`;
    card.innerHTML =
      '<div class="ps-holo" aria-hidden="true"></div>' +
      '<div class="ps-corner ps-corner-tl" aria-hidden="true"></div>' +
      '<div class="ps-corner ps-corner-br" aria-hidden="true"></div>' +
      `<div class="ps-rank" title="${esc(rankTitle)}"><span class="ps-rank-dot"></span>${esc(rankLabel)}</div>` +
      '<div class="ps-avwrap">' +
        (avatar ? `<img class="ps-av" src="${avatar}" alt="" />` : '<div class="ps-av ps-av-empty">?</div>') +
        '<span class="ps-avring" aria-hidden="true"></span>' +
      '</div>' +
      `<div class="ps-name">${esc(profile.name)} ${flag}</div>` +
      `<div class="ps-id" title="User ID">#${esc(id)}</div>` +
      '<div class="ps-elo"><span class="ps-elo-coin" aria-hidden="true"></span>' +
        `<b>${profile.points ?? '—'}</b><span class="ps-elo-lbl">ELO</span></div>` +
      '<div class="ps-tier-row" id="ps-tier-row"></div>' +
      '<div class="ps-mini">' +
        `<div class="ps-mini-cell"><b class="${wr >= 50 ? 'good' : 'bad'}">${matches ? wr.toFixed(0) + '%' : '—'}</b><span>Winrate</span></div>` +
        `<div class="ps-mini-cell"><b>${kdr.toFixed(2)}</b><span>KDR</span></div>` +
        `<div class="ps-mini-cell"><b>${matches}</b><span>Matches</span></div>` +
      '</div>';

    const av = card.querySelector('img.ps-av');
    if (av) av.addEventListener('error', () => {
      const ph = el('div', 'ps-av ps-av-empty', '?');
      av.replaceWith(ph);
    });

    const links = profile.steam ? `
      <a class="ext steam" target="_blank" rel="noopener" title="Steam profile" href="https://steamcommunity.com/profiles/${profile.steam}">${ICONS.steam}</a>
      <a class="ext steamdb" target="_blank" rel="noopener" title="SteamDB" href="https://steamdb.info/calculator/${profile.steam}/">${ICONS.steamdb}</a>
      <a class="ext faceit" target="_blank" rel="noopener" title="FaceitFinder" href="https://faceitfinder.com/profile/${profile.steam}">${ICONS.faceit}</a>` : '';
    const isSelf = CSRP_MYID && String(CSRP_MYID) === String(id);
    const reportBtn = isSelf ? '' :
      `<button class="ph-report" id="ph-report" title="Report this player to CSR+ moderators">⚑ Report</button>`;
    $('#head').innerHTML =
      (avatar ? `<img class="ph-av" src="${avatar}" alt="" />` : '<div class="ph-av"></div>') +
      `<div class="ph-info"><div class="ph-name">${esc(profile.name)} ${flag}</div>` +
      `<div class="ph-links">${links}${reportBtn}</div></div>`;
    const rb = $('#ph-report');
    if (rb) rb.addEventListener('click', () => {
      snd('click');
      window.open(chrome.runtime.getURL(`report/report.html?id=${encodeURIComponent(id)}`), '_blank', 'noopener');
    });

    tierOf(id).then((tier) => {
      const html = tierBadgeHtml(tier);
      const row = $('#ps-tier-row'); if (row) row.innerHTML = html;
    });
  }

  function periodRows() {
    const rs = state.rows.filter((r) => inPeriod(r.date, period));
    return (period === 'today' || period === 'yesterday') ? rs : rs.slice(0, 10);
  }

  function rating(rs, profile) {
    const kills = rs.reduce((s, r) => s + r.kills, 0), deaths = rs.reduce((s, r) => s + r.deaths, 0);
    const rounds = rs.reduce((s, r) => s + r.rounds, 0), assists = rs.reduce((s, r) => s + r.assists, 0);
    const kd = deaths ? kills / deaths : kills || (profile.deaths ? profile.kills / profile.deaths : 1);
    const kr = rounds ? kills / rounds : 0.68;
    const adr = rs.length ? clamp(kr * 100 + (rounds ? assists / rounds : 0) * 22, 30, 160) : 72;
    const krN = clamp((kr - 0.4) / 0.6, 0, 1);
    const kdN = clamp((kd - 0.5) / 1.0, 0, 1);
    const adrN = clamp((adr - 50) / 60, 0, 1);
    return clamp(0.5 * kdN + 0.3 * krN + 0.2 * adrN, 0, 1.5) * 0.95 + 0.05;
  }

  function renderStats(profile) {
    const rs = periodRows();
    const winratePct = profile.matches ? (profile.wins / profile.matches) * 100 : 0;
    const kdr = profile.deaths ? profile.kills / profile.deaths : profile.kills;
    const avg = profile.matches ? profile.kills / profile.matches : 0;
    const stats = [
      ['Winrate', winratePct.toFixed(2) + '%', true],
      ['ELO', String(profile.points ?? '—'), true],
      ['KDR', kdr.toFixed(2), true],
      ['AVG', avg.toFixed(2), true],
      ['Rating', rating(rs, profile).toFixed(2), true],
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
      cell.append(el('div', 'stat-v', esc(value)), el('div', 'stat-k', label));
      grid.append(cell);
    });

    const last = state.rows.slice(0, 10);
    if (last.length) {
      $('#form-block').hidden = false;
      const strip = $('#form-strip'); strip.innerHTML = '';

      [...last].reverse().forEach((r, i) => {
        const t = el('div', 'form-tile ' + (r.won === true ? 'w' : r.won === false ? 'l' : ''));
        t.style.animationDelay = (i * 0.04) + 's';
        t.innerHTML = `<b>${r.won === true ? 'W' : r.won === false ? 'L' : '—'}</b><span>${r.kills}/${r.deaths}</span>`;
        t.title = `${mapLabel(r.map)} · ${r.kills}/${r.deaths}/${r.assists}`;
        strip.append(t);
      });
    }
  }

  function chartCtx(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.parentElement.clientWidth || 600;
    const h = canvas.getAttribute('height') ? Number(canvas.getAttribute('height')) : 180;
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return { ctx, w, h };
  }

  function lineChart(canvas, values, { color = '#fff', fmt = (v) => String(Math.round(v)) } = {}) {
    if (!canvas || !values.length) return;
    const { ctx, w, h } = chartCtx(canvas);
    const PAD = { l: 44, r: 14, t: 14, b: 22 };
    const iw = w - PAD.l - PAD.r, ih = h - PAD.t - PAD.b;
    let min = Math.min(...values), max = Math.max(...values);
    if (min === max) { min -= 1; max += 1; }
    const span = max - min, head = span * 0.12;
    min -= head; max += head;
    const x = (i) => PAD.l + (values.length === 1 ? iw / 2 : (i / (values.length - 1)) * iw);
    const y = (v) => PAD.t + (1 - (v - min) / (max - min)) * ih;
    ctx.clearRect(0, 0, w, h);

    ctx.font = '10px Consolas, monospace';
    ctx.fillStyle = 'rgba(244,246,251,0.4)';
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    for (let g = 0; g <= 3; g++) {
      const gv = min + ((max - min) * g) / 3;
      const gy = y(gv);
      ctx.beginPath(); ctx.moveTo(PAD.l, gy); ctx.lineTo(w - PAD.r, gy); ctx.stroke();
      ctx.fillText(fmt(gv), 6, gy + 3);
    }

    ctx.beginPath();
    values.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    const grad = ctx.createLinearGradient(0, PAD.t, 0, h);
    grad.addColorStop(0, color + '44'); grad.addColorStop(1, color + '00');
    ctx.lineTo(x(values.length - 1), h - PAD.b); ctx.lineTo(x(0), h - PAD.b); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    ctx.beginPath();
    values.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();

    ctx.fillStyle = color;
    values.forEach((v, i) => { ctx.beginPath(); ctx.arc(x(i), y(v), 2.6, 0, 7); ctx.fill(); });

    const lv = values[values.length - 1];
    ctx.fillStyle = '#f4f6fb'; ctx.font = 'bold 11px Consolas, monospace';
    ctx.fillText(fmt(lv), Math.min(x(values.length - 1) + 6, w - 40), y(lv) - 6);
  }

  function barChart(canvas, rows) {
    if (!canvas || !rows.length) return;
    const { ctx, w, h } = chartCtx(canvas);
    const PAD = { l: 30, r: 8, t: 10, b: 20 };
    const iw = w - PAD.l - PAD.r, ih = h - PAD.t - PAD.b;
    const max = Math.max(...rows.map((r) => Math.max(r.kills, r.deaths, r.assists)), 1);
    const groupW = iw / rows.length;
    const bw = Math.min(8, (groupW - 6) / 3);
    ctx.clearRect(0, 0, w, h);
    ctx.font = '10px Consolas, monospace'; ctx.fillStyle = 'rgba(244,246,251,0.4)';
    ctx.fillText(String(max), 6, PAD.t + 8);
    ctx.fillText('0', 6, h - PAD.b);
    const draw = (i, j, v, color) => {
      const bh = (v / max) * ih;
      ctx.fillStyle = color;
      ctx.fillRect(PAD.l + i * groupW + groupW / 2 + (j - 1.5) * bw, h - PAD.b - bh, bw - 1, bh);
    };
    rows.forEach((r, i) => { draw(i, 0.5, r.kills, '#c7ffd9'); draw(i, 1.5, r.deaths, '#ffb3b8'); draw(i, 2.5, r.assists, '#8ab8ff'); });

    ctx.fillStyle = '#c7ffd9'; ctx.fillRect(PAD.l, h - 11, 8, 8); ctx.fillStyle = 'rgba(244,246,251,0.6)'; ctx.fillText('K', PAD.l + 11, h - 4);
    ctx.fillStyle = '#ffb3b8'; ctx.fillRect(PAD.l + 28, h - 11, 8, 8); ctx.fillStyle = 'rgba(244,246,251,0.6)'; ctx.fillText('D', PAD.l + 39, h - 4);
    ctx.fillStyle = '#8ab8ff'; ctx.fillRect(PAD.l + 56, h - 11, 8, 8); ctx.fillStyle = 'rgba(244,246,251,0.6)'; ctx.fillText('A', PAD.l + 67, h - 4);
  }

  function eloSeries() {
    const rows = [...state.rows].reverse();
    if (!rows.length) return { values: [], estimated: false };
    if (rows.every((r) => r.eloAfter != null)) {
      return { values: rows.map((r) => r.eloAfter), estimated: false };
    }
    const cur = Number(state.profile?.points);
    if (!Number.isFinite(cur)) return { values: [], estimated: false };
    const deltas = rows.map((r) => (r.eloDelta != null ? r.eloDelta : r.won === true ? 25 : r.won === false ? -25 : 0));
    const values = new Array(rows.length);
    let v = cur;
    for (let i = rows.length - 1; i >= 0; i--) { values[i] = v; v -= deltas[i]; }
    return { values, estimated: rows.some((r) => r.eloDelta == null) };
  }

  function drawCharts() {
    const rows = [...state.rows].reverse();
    if (!rows.length) return;
    const elo = eloSeries();
    $('#elo-sub').textContent = elo.estimated
      ? `estimated from W/L (±25) — last ${rows.length} matches`
      : `last ${rows.length} matches`;
    lineChart($('#chart-elo'), elo.values, { color: '#ffd24a' });
    lineChart($('#chart-kdr'), rows.map((r) => (r.deaths ? r.kills / r.deaths : r.kills)), { color: '#8ab8ff', fmt: (v) => v.toFixed(1) });
    barChart($('#chart-kda'), rows);

    const byMap = {};
    for (const r of state.rows) {
      const k = r.map || '?';
      (byMap[k] = byMap[k] || { games: 0, wins: 0, kills: 0, deaths: 0 });
      byMap[k].games++; if (r.won === true) byMap[k].wins++;
      byMap[k].kills += r.kills; byMap[k].deaths += r.deaths;
    }
    const maps = Object.entries(byMap).sort((a, b) => b[1].games - a[1].games);
    if (maps.length) {
      $('#maps-block').hidden = false;
      const box = $('#map-rows'); box.innerHTML = '';
      for (const [m, d] of maps) {
        const wr = d.games ? (d.wins / d.games) * 100 : 0;
        const kd = d.deaths ? d.kills / d.deaths : d.kills;
        const row = el('div', 'map-row');
        row.innerHTML =
          `<img src="${mapIcon(m)}" alt="" /><span class="mr-name">${esc(mapLabel(m))}</span>` +
          `<span class="mr-games">${d.games} game${d.games === 1 ? '' : 's'}</span>` +
          `<div class="mr-bar"><span style="width:${wr.toFixed(0)}%"></span></div>` +
          `<span class="mr-wr ${wr >= 50 ? 'good' : 'bad'}">${wr.toFixed(0)}%</span>` +
          `<span class="mr-kd">${kd.toFixed(2)} KD</span>`;
        const img = row.querySelector('img');
        img.addEventListener('error', () => { img.style.visibility = 'hidden'; });
        box.append(row);
      }
    }
  }

  function histRow(r, i) {
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
      `<div class="hc hc-map"><img src="${mapIcon(r.map)}" alt="" />` +
        `<span class="hm-txt"><span>${esc(mapLabel(r.map))}</span><span class="dim">${r.mode}</span></span></div>`;
    const img = row.querySelector('.hc-map img');
    img.addEventListener('error', () => { img.style.visibility = 'hidden'; });
    return row;
  }

  function renderHistory() {
    const list = $('#history');
    list.innerHTML = '';
    if (!state.rows.length) { list.append(el('div', 'empty', 'No matches on record.')); return; }
    const h = el('div', 'hrow hrow-head');
    h.innerHTML = '<div class="hc">Date</div><div class="hc">Score</div><div class="hc">K / D / A</div><div class="hc">KDR</div><div class="hc">Map</div>';
    list.append(h);
    state.rows.forEach((r, i) => list.append(histRow(r, i)));
    $('#hist-more').hidden = state.histDone;
    $('#hist-note').hidden = !state.histDone;
  }

  async function loadMoreHistory() {
    const btn = $('#hist-more');
    btn.disabled = true; btn.textContent = 'Loading…';
    const page = await historyPage(id, state.page);
    state.page++;
    const fresh = page.map((m) => toRow(m, id)).filter(Boolean);
    if (!fresh.length) state.histDone = true;
    state.rows.push(...fresh);
    btn.disabled = false; btn.textContent = 'Load more matches';
    renderHistory();
    drawCharts();
  }

  const iconUrl = (weaponId) => (weaponId != null ? `https://cdn.csrestored.fun/skins/${weaponId}.png` : null);
  const TYPES = { 1: 'Knife', 2: 'Rifle', 3: 'Heavy', 4: 'Pistol', 5: 'SMG', 8: 'Container', 9: 'Agent', 10: 'Sticker' };
  const typeName = (t) => TYPES[t] || 'Other';
  const RARITY = {
    1: { name: 'Consumer', c: '#b0c3d9', cw: 'white gray grey' },
    2: { name: 'Industrial', c: '#5e98d9', cw: 'light blue' },
    3: { name: 'Mil-Spec', c: '#4b69ff', cw: 'blue' },
    4: { name: 'Restricted', c: '#8847ff', cw: 'purple' },
    5: { name: 'Classified', c: '#d32ce6', cw: 'pink' },
    6: { name: 'Covert', c: '#eb4b4b', cw: 'red' },
    7: { name: 'Contraband', c: '#e4ae39', cw: 'gold yellow' },
  };
  const rarity = (r) => RARITY[Number(r)] || { name: '', c: '#9aa0ad', cw: '' };
  function wear(f) {
    if (f == null) return null;
    if (f < 0.07) return { code: 'FN', label: 'Factory New', c: '#4ade80' };
    if (f < 0.15) return { code: 'MW', label: 'Minimal Wear', c: '#86efac' };
    if (f < 0.38) return { code: 'FT', label: 'Field-Tested', c: '#fbbf24' };
    if (f < 0.45) return { code: 'WW', label: 'Well-Worn', c: '#fb923c' };
    return { code: 'BS', label: 'Battle-Scarred', c: '#f87171' };
  }
  function splitName(name) {
    const star = /^★\s*/.test(name || '');
    const clean = String(name || '').replace(/^★\s*/, '').trim();
    const [weapon, skin] = clean.split('|').map((s) => s.trim());
    return { star, weapon: weapon || clean, skin: skin || '' };
  }

  function invBlob(it) {
    if (it.__blob) return it.__blob;
    const rar = rarity(it.rarity);
    const w = wear(it.float);
    const gem = window.CSRPGems ? window.CSRPGems.badgeFor(it) : null;
    it.__blob = [
      it.name, typeName(it.item_type), rar.name, rar.cw,
      w ? `${w.code} ${w.label}` : '', it.stattrak ? 'stattrak st' : '',
      gem ? `${gem.label} gem special t1 t2 t3` : '', it.nametag || '',
      String(it.item_type) === '1' ? 'knife knives gold' : '',
    ].join(' ').toLowerCase();
    return it.__blob;
  }

  function invCard(it, i) {
    const { star, weapon, skin } = splitName(it.name);
    const rar = rarity(it.rarity);
    const w = wear(it.float);
    const icon = iconUrl(it.weapon_id);
    const gem = window.CSRPGems ? window.CSRPGems.badgeFor(it) : null;

    const c = el('div', 'card' + (gem ? ' gem-card' : ''));
    c.style.setProperty('--rc', rar.c);
    if (gem) c.style.setProperty('--gc', gem.color);
    c.style.animationDelay = Math.min(i * 0.012, 0.45) + 's';

    const st = it.stattrak ? `<span class="c-st">ST™${it.stattrak_count ? ' ' + it.stattrak_count : ''}</span>` : '';
    const wearTop = w ? `<span class="c-wear-code" style="color:${w.c}">${w.code}</span>` : '';
    const img = icon ? `<img class="c-img" src="${icon}" alt="" loading="lazy" decoding="async" />` : '';
    const floatBadge = w
      ? `<span class="c-float" style="color:${w.c};border-color:${w.c}55"><span class="c-dot" style="background:${w.c}"></span>${w.code} · ${it.float.toFixed(4)}</span>`
      : '';
    const seedBadge = it.seed != null ? `<span class="c-seed">#${Math.round(it.seed)}</span>` : '';
    const gemBadge = gem
      ? `<span class="c-gem" style="color:${gem.color};border-color:${gem.color}66" title="${esc(gem.title || gem.label)}">${esc(gem.label)}</span>`
      : '';
    const tag = it.nametag ? `<span class="c-nametag" title="Name tag">“${esc(it.nametag)}”</span>` : '';

    c.innerHTML = `
      <span class="c-strip"></span>
      <div class="c-top"><span class="c-st-wrap">${st}</span>${wearTop}</div>
      <div class="c-art">${img}<div class="c-fallback">${esc(typeName(it.item_type))}</div></div>
      <div class="c-meta">
        <div class="c-name">${star ? '<span class="c-star">★</span>' : ''}${esc(weapon)}</div>
        <div class="c-skin">${esc(skin || rar.name)}</div>
      </div>
      <div class="c-badges">${gemBadge}${floatBadge}${seedBadge}</div>
      ${tag}`;
    const im = c.querySelector('.c-img');
    if (im) im.addEventListener('error', () => { im.remove(); c.classList.add('noimg'); });
    c.addEventListener('click', () => { snd('click'); openItemModal(it); });
    return c;
  }

  function openItemModal(it) {
    const { star, weapon, skin } = splitName(it.name);
    const rar = rarity(it.rarity);
    const w = wear(it.float);
    const gem = window.CSRPGems ? window.CSRPGems.badgeFor(it) : null;
    const fullName = (star ? '★ ' : '') + weapon + (skin ? ' | ' + skin : '');

    const card = document.querySelector('.wd-card');
    card.style.setProperty('--rc', rar.c);
    $('#wd-name').textContent = fullName;
    $('#wd-name').style.color = rar.c;
    $('#wd-artname').textContent = fullName;

    const art = $('#wd-art');
    art.innerHTML = '';
    const icon = iconUrl(it.weapon_id);
    if (icon) {
      const img = el('img');
      img.src = icon;
      img.onerror = () => { art.innerHTML = `<span class="wd-fallback">${esc(typeName(it.item_type))}</span>`; };
      art.append(img);
    } else {
      art.innerHTML = `<span class="wd-fallback">${esc(typeName(it.item_type))}</span>`;
    }

    const chips = $('#wd-chips');
    chips.innerHTML = '';
    const rc = el('span', 'wd-chip rar', esc(rar.name || '—'));
    rc.style.setProperty('--rc', rar.c);
    chips.append(rc, el('span', 'wd-chip', esc(typeName(it.item_type))));
    if (it.stattrak) chips.append(el('span', 'wd-chip st', 'StatTrak™'));
    if (gem) {
      const g = el('span', 'wd-chip rar', esc(gem.label));
      g.style.setProperty('--rc', gem.color);
      if (gem.title) g.title = gem.title;
      chips.append(g);
    }

    const stats = $('#wd-stats');
    stats.innerHTML = '';
    const stat = (k, v) => {
      const s = el('div', 'wd-stat');
      s.append(el('p', 'wd-stat-k', esc(k)), el('p', 'wd-stat-v', v));
      stats.append(s);
    };
    stat('Wear', w ? `${w.code} - ${w.label}` : '—');
    stat('Float', it.float != null ? Number(it.float).toFixed(6) : '—');
    stat('Pattern', it.seed != null ? '✿ ' + Math.round(it.seed) : '—');
    stat('StatTrak™', it.stattrak ? (it.stattrak_count != null ? `Yes · ${it.stattrak_count}` : 'Yes') : 'No');

    const fb = $('#wd-floatblock');
    if (it.float != null && w) {
      fb.hidden = false;
      const dot = $('#wd-floatdot');
      dot.style.transition = 'none';
      dot.style.left = '0%';
      void dot.offsetWidth;
      dot.style.transition = 'left 0.8s cubic-bezier(0.22,1,0.36,1)';
      dot.style.left = (Number(it.float) * 100) + '%';
      $('#wd-floattxt').textContent = `${Number(it.float).toFixed(6)} (${(Number(it.float) * 100).toFixed(4)}%) - ${w.label}`;
    } else {
      fb.hidden = true;
    }

    const tag = $('#wd-nametag');
    if (it.nametag) { tag.hidden = false; tag.textContent = `Name tag: “${it.nametag}”`; }
    else tag.hidden = true;

    $('#wd').hidden = false;
  }
  function closeItemModal() { $('#wd').hidden = true; }

  function applyInvView() {
    const s = state.invState;
    let list = (state.inv || []).slice();
    if (s.type !== 'all') list = list.filter((it) => String(it.item_type) === s.type);
    if (s.q) {
      const q = s.q.toLowerCase();
      list = list.filter((it) => invBlob(it).includes(q));
    }
    if (s.sort === 'rarity') list.sort((a, b) => (b.rarity - a.rarity) || a.name.localeCompare(b.name));
    else if (s.sort === 'float') list.sort((a, b) => (a.float ?? 99) - (b.float ?? 99));
    else if (s.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (s.sort === 'gem') {
      const score = (it) => (window.CSRPGems && window.CSRPGems.badgeFor(it) ? 1 : 0);
      list.sort((a, b) => (score(b) - score(a)) || (b.rarity - a.rarity) || a.name.localeCompare(b.name));
    }
    const grid = $('#inv-grid');
    grid.innerHTML = '';
    if (!list.length) { grid.append(el('div', 'empty', 'No items match.')); return; }
    const frag = document.createDocumentFragment();
    list.forEach((it, i) => frag.append(invCard(it, i)));
    grid.append(frag);
  }

  function buildInvFilters() {
    const counts = {};
    for (const it of state.inv) counts[it.item_type] = (counts[it.item_type] || 0) + 1;
    const box = $('#inv-filters');
    box.innerHTML = '';
    const mk = (val, label, n) => {
      const b = el('button', 'chip' + (state.invState.type === val ? ' on' : ''), `${label}<span class="chip-n">${n}</span>`);
      b.addEventListener('click', () => { state.invState.type = val; snd('click'); buildInvFilters(); applyInvView(); });
      return b;
    };
    box.append(mk('all', 'All', state.inv.length));
    Object.keys(counts).sort((a, b) => counts[b] - counts[a])
      .forEach((t) => box.append(mk(String(t), typeName(t), counts[t])));
  }

  function renderInvStats() {
    const items = state.inv;
    const knives = items.filter((it) => String(it.item_type) === '1').length;
    const covert = items.filter((it) => Number(it.rarity) >= 6).length;
    const stat = items.filter((it) => it.stattrak).length;
    const gems = window.CSRPGems ? items.filter((it) => window.CSRPGems.badgeFor(it)).length : 0;
    $('#tb-stats').innerHTML =
      `<span class="kv"><b>${items.length}</b> items</span>` +
      `<span class="kv"><b>${knives}</b> knives</span>` +
      `<span class="kv"><b>${covert}</b> covert+</span>` +
      `<span class="kv"><b>${stat}</b> StatTrak</span>` +
      (gems ? `<span class="kv kv-gem"><b>${gems}</b> special patterns</span>` : '');
  }

  async function loadInventory() {
    const grid = $('#inv-grid');
    $('#inv-sub').textContent = '';
    grid.innerHTML = Array.from({ length: 18 }, () => '<div class="card-skel"></div>').join('');

    const mapReady = window.CSRPGems && window.CSRPGems.loadIdMap ? window.CSRPGems.loadIdMap().catch(() => null) : null;
    const inv = await api(`/users/${id}/inventory`);
    if (!Array.isArray(inv)) {
      grid.innerHTML = '<div class="empty">Could not load this inventory. The owner may have it hidden, or you need to be signed in on csrestored.fun.</div>';
      return;
    }
    if (mapReady) await mapReady;
    if (window.CSRPGems && window.CSRPGems.learn) window.CSRPGems.learn(inv);
    state.inv = inv;

    try {
      const dop = inv.filter((it) => /doppler/i.test(it.name || ''));
      if (dop.length) {
        console.info('[CSR+] Doppler items in this inventory:',
          dop.map((it) => ({ name: it.name, skin_index: it.skin_index, seed: it.seed, keys: Object.keys(it).join(',') })));
      }
    } catch {  }
    $('#inv-toolbar').hidden = false;
    renderInvStats();
    buildInvFilters();
    applyInvView();
  }

  function bindInvControls() {
    let t;
    $('#inv-search').addEventListener('input', (e) => {
      clearTimeout(t);
      t = setTimeout(() => { state.invState.q = e.target.value.trim(); applyInvView(); }, 120);
    });
    $('#inv-sort').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      state.invState.sort = b.dataset.v;
      snd('click');
      [...$('#inv-sort').children].forEach((x) => x.classList.toggle('on', x === b));
      applyInvView();
    });
  }

  async function render() {
    bindBack();
    bindTabs();
    bindInvControls();
    $('#hist-more').addEventListener('click', () => { snd('click'); loadMoreHistory(); });

    $('#wd-x').addEventListener('click', () => { snd('off'); closeItemModal(); });
    $('#wd').addEventListener('click', (e) => { if (e.target === $('#wd')) { snd('off'); closeItemModal(); } });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#wd').hidden) closeItemModal(); });

    if (!id) { $('#ps-card').innerHTML = '<div class="ps-skel">No player selected.</div>'; return; }
    $('#brand-uid').textContent = id;
    document.title = `CSR+ Profile | ${id}`;
    $('#site-link').href = `${SITE}/app/user/${id}`;

    const [profile, page0] = await Promise.all([user(id), historyPage(id, 0)]);
    if (!profile) { $('#ps-card').innerHTML = '<div class="ps-skel">Could not load this player.</div>'; return; }
    state.profile = profile;
    state.page = 1;
    state.rows = page0.map((m) => toRow(m, id)).filter(Boolean);
    if (!page0.length) state.histDone = true;
    document.title = `CSR+ Profile | ${profile.name} (${id})`;

    renderIdentity(profile);
    renderStats(profile);
    renderHistory();
    $('#ps-note').textContent = `${state.rows.length} matches loaded`;

    if (startTab !== 'overview') switchTab(startTab);
    else drawCharts();
  }

  window.addEventListener('resize', () => {

    if (document.querySelector('.panel.on')?.dataset.panel === 'performance') drawCharts();
  });

  render();
})();
