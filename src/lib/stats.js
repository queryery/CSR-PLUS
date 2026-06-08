/* CSR+ — stats engine. Turns raw user + match history into player ratings
 * and team win probabilities. All pure functions, no DOM. */
(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const stdev = (a) => {
    if (a.length < 2) return 0;
    const m = mean(a);
    return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
  };

  // Filter a history feed to a time window relative to today.
  function inPeriod(dateStr, period) {
    if (period === 'all') return true;
    const d = new Date(dateStr);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === 'today') return d >= startOfToday;
    if (period === 'yesterday') {
      const startY = new Date(startOfToday.getTime() - 864e5);
      return d >= startY && d < startOfToday;
    }
    return true;
  }

  // Derive per-match rows for one player id from a history array.
  function rowsForPlayer(history, id, period) {
    const rows = [];
    for (const m of history || []) {
      if (m.canceled) continue;
      if (!inPeriod(m.date, period)) continue;
      const p = m.players?.[id];
      if (!p) continue;
      const [a, b] = (m.teams || '').split(' ');
      const scores = (m.score || '0 0').split(' ').map(Number);
      let won = null;
      if (a && b && scores.length === 2) {
        const myTeam = p.team;
        const myIdx = myTeam === a ? 0 : myTeam === b ? 1 : -1;
        const otherIdx = myIdx === 0 ? 1 : 0;
        if (myIdx >= 0) won = scores[myIdx] > scores[otherIdx];
      }
      // rounds played ≈ sum of the two map scores
      const rounds = scores[0] + scores[1] || 1;
      rows.push({
        kills: p.kills || 0,
        deaths: p.deaths || 0,
        assists: p.assists || 0,
        score: p.score || 0,
        rounds,
        won,
        date: m.date,
      });
    }
    return rows;
  }

  // Aggregate a player's profile. `profile` = /users payload, `rows` = match
  // rows (assumed newest-first, which is how the API returns them).
  function aggregate(profile, rows) {
    const games = rows.length;

    // Recency weights: most-recent game weighted highest, decaying ~0.92^i.
    // This makes "recent matches" matter more, complementing the period filter.
    const w = rows.map((_, i) => Math.pow(0.92, i));
    const wsum = w.reduce((s, x) => s + x, 0) || 1;

    const kills = rows.reduce((s, r) => s + r.kills, 0);
    const deaths = rows.reduce((s, r) => s + r.deaths, 0);
    const rounds = rows.reduce((s, r) => s + r.rounds, 0);
    const assists = rows.reduce((s, r) => s + (r.assists || 0), 0);
    const wins = rows.filter((r) => r.won === true).length;
    const decided = rows.filter((r) => r.won !== null).length;

    // Recency-weighted per-round rates (kills/round, deaths/round, win).
    const wKills = rows.reduce((s, r, i) => s + (r.rounds ? r.kills / r.rounds : 0) * w[i], 0) / wsum;
    const wDeaths = rows.reduce((s, r, i) => s + (r.rounds ? r.deaths / r.rounds : 0) * w[i], 0) / wsum;
    const wWin = (() => {
      let num = 0, den = 0;
      rows.forEach((r, i) => { if (r.won !== null) { den += w[i]; if (r.won) num += w[i]; } });
      return den ? num / den : null;
    })();

    // Lifetime fallbacks when the window is empty.
    const lifeKD = profile && profile.deaths ? profile.kills / profile.deaths : 1;
    const lifeWR = profile && profile.matches ? profile.wins / profile.matches : 0.5;

    const kd = games ? (wDeaths ? wKills / wDeaths : wKills * 5) : lifeKD;
    const kr = games ? wKills : 0.68;
    const apr = rounds ? assists / rounds : 0;
    const adr = games ? clamp(kr * 100 + apr * 22, 30, 160) : 72;
    const winrate = wWin != null ? wWin : lifeWR;

    // Per-match KD / KR series for stability (consistency) measures.
    const kdSeries = rows.map((r) => (r.deaths ? r.kills / r.deaths : r.kills));
    const krSeries = rows.map((r) => (r.rounds ? r.kills / r.rounds : 0));
    const kdStability = stabilityScore(kdSeries);
    const krStability = stabilityScore(krSeries);

    // Recent form: last 5 games KD vs the whole window's flat KD.
    const flatKD = deaths ? kills / deaths : kills;
    const recent = rows.slice(0, 5);
    const recentKD = recent.length
      ? mean(recent.map((r) => (r.deaths ? r.kills / r.deaths : r.kills)))
      : flatKD;
    const recentForm = clamp(recentKD / (flatKD || 1), 0.5, 1.6);

    // Peak signal: best single-game K/D vs the average. >1.7 ⇒ spiky "peak" play.
    const avgSeriesKD = mean(kdSeries) || 1;
    const peak = kdSeries.length ? Math.max(...kdSeries) / avgSeriesKD : 1;

    const confidence = clamp(games / 25, 0.18, 1);
    const elo = profile?.points ?? 1000;

    return {
      id: profile?.id, name: profile?.name, elo, games,
      kd, kr, adr, winrate, recentForm, kdStability, krStability, peak, confidence,
    };
  }

  // Stability: 1 = perfectly consistent, lower = swingy. Based on coeff. of variation.
  function stabilityScore(series) {
    if (series.length < 2) return 0.6;
    const m = mean(series);
    if (m <= 0) return 0.5;
    const cv = stdev(series) / m;
    return clamp(1 - cv, 0, 1);
  }

  // 0-100 player strength — Elo-led hybrid (REPEEK leads with Elo; we keep a
  // smaller performance component so badges still reflect K/D, K/R, ADR, form).
  function strength(a) {
    // Centre ~1050 Elo at the "Average" midpoint. Band 550..1650 → 0..1, so
    // 1050 ≈ 0.45, 1300 ≈ 0.68 (Strong), 800 ≈ 0.23 (Weak).
    const eloN = clamp((a.elo - 550) / (1650 - 550), 0, 1);
    const kdN = clamp((a.kd - 0.6) / (1.6 - 0.6), 0, 1);
    const krN = clamp((a.kr - 0.5) / (1.0 - 0.5), 0, 1);
    const adrN = clamp((a.adr - 50) / (110 - 50), 0, 1);
    const wrN = clamp((a.winrate - 0.3) / (0.7 - 0.3), 0, 1);
    const formN = clamp((a.recentForm - 0.7) / (1.4 - 0.7), 0, 1);

    // Performance composite (the non-Elo signals).
    const perf = 0.40 * kdN + 0.24 * krN + 0.20 * adrN + 0.10 * wrN + 0.06 * formN;

    // Elo dominates (REPEEK style); performance nudges. Low sample → lean on Elo.
    const perfWeight = 0.30 * a.confidence; // up to 0.30 when we have data
    const raw = (1 - perfWeight) * eloN + perfWeight * perf;

    // Pull toward the mean a touch when sample is very small.
    const adjusted = 0.5 + (raw - 0.5) * (0.7 + 0.3 * a.confidence);
    return Math.round(clamp(adjusted, 0, 1) * 100);
  }

  // Team Elo (average), with a small performance adjustment per player so a
  // smurf on low Elo still bumps the team a bit.
  function teamElo(players) {
    if (!players.length) return 1000;
    const adj = players.map((p) => {
      const s = strength(p);          // 0..100
      const perfDelta = (s - 50) * 1.2; // ±60 Elo-equiv nudge from form/stats
      return p.elo + perfDelta * p.confidence;
    });
    return adj.reduce((x, y) => x + y, 0) / adj.length;
  }

  // Team win probability — FACEIT/REPEEK style logistic on the Elo difference.
  // P(A) = 1 / (1 + 10^((eloB - eloA)/400)).
  function winProbability(teamA, teamB) {
    const ea = teamElo(teamA);
    const eb = teamElo(teamB);
    const p = 1 / (1 + Math.pow(10, (eb - ea) / 400));
    return clamp(p, 0.05, 0.95);
  }

  CSRP.stats = {
    rowsForPlayer,
    aggregate,
    strength,
    teamElo,
    winProbability,
    // Convenience: build an aggregate straight from profile + history feed.
    analyze(profile, history, period) {
      const rows = rowsForPlayer(history, profile?.id, period);
      return aggregate(profile, rows);
    },
  };
})();
