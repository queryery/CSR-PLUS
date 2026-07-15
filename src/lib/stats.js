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

  const LG = { kpr: 0.68, dpr: 0.66, apr: 0.12 };
  const PRIOR_ROUNDS = 40;
  const WINDOW = 10;

  function inPeriod(dateStr, period) {
    if (period !== 'today' && period !== 'yesterday') return true;
    const d = new Date(dateStr);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === 'today') return d >= startOfToday;
    const startY = new Date(startOfToday.getTime() - 864e5);
    return d >= startY && d < startOfToday;
  }

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

    if (period === 'today' || period === 'yesterday') return rows;
    return rows.slice(0, WINDOW);
  }

  function matchRating(r) {
    const rounds = r.rounds || 1;
    const killRating = (r.kills / rounds) / 0.679;
    const survivalRating = (Math.max(0, rounds - r.deaths) / rounds) / 0.317;
    return (killRating + 0.7 * survivalRating) / 1.7;
  }

  function trendOf(series) {
    const n = series.length;
    if (n < 3) return 0;
    const mx = (n - 1) / 2;
    const my = mean(series);
    let num = 0, den = 0;
    series.forEach((y, i) => { num += (i - mx) * (y - my); den += (i - mx) ** 2; });
    const slope = den ? num / den : 0;
    return clamp(-slope * (n / 2), -1, 1);
  }

  function streakOf(rows) {
    const decided = rows.filter((r) => r.won !== null);
    if (!decided.length) return 0;
    let n = 0;
    for (const r of decided) { if (r.won === decided[0].won) n++; else break; }
    return decided[0].won ? n : -n;
  }

  function aggregate(profile, rows) {
    const games = rows.length;

    const w = rows.map((_, i) => Math.pow(0.92, i));
    const wsum = w.reduce((s, x) => s + x, 0) || 1;

    const kills = rows.reduce((s, r) => s + r.kills, 0);
    const deaths = rows.reduce((s, r) => s + r.deaths, 0);
    const rounds = rows.reduce((s, r) => s + r.rounds, 0);
    const assists = rows.reduce((s, r) => s + (r.assists || 0), 0);
    const decided = rows.filter((r) => r.won !== null).length;

    const wKills = rows.reduce((s, r, i) => s + (r.rounds ? r.kills / r.rounds : 0) * w[i], 0) / wsum;
    const wDeaths = rows.reduce((s, r, i) => s + (r.rounds ? r.deaths / r.rounds : 0) * w[i], 0) / wsum;
    const wWin = (() => {
      let num = 0, den = 0;
      rows.forEach((r, i) => { if (r.won !== null) { den += w[i]; if (r.won) num += w[i]; } });
      return den ? num / den : null;
    })();

    const shrink = (rate, prior) => (rate * rounds + prior * PRIOR_ROUNDS) / (rounds + PRIOR_ROUNDS);
    const kpr = games ? shrink(wKills, LG.kpr) : LG.kpr;
    const dpr = games ? shrink(wDeaths, LG.dpr) : LG.dpr;
    const apr = rounds ? shrink(assists / rounds, LG.apr) : LG.apr;

    const lifeKD = profile && profile.deaths ? profile.kills / profile.deaths : 1;
    const lifeWR = profile && profile.matches ? profile.wins / profile.matches : 0.5;

    const kd = games ? (dpr ? kpr / dpr : kpr * 5) : lifeKD;
    const kr = games ? kpr : 0.68;
    const adr = games ? clamp(kr * 100 + apr * 22, 30, 160) : 72;

    const winrate = wWin != null
      ? (wWin * decided + 0.5 * 4) / (decided + 4)
      : lifeWR;

    const kdSeries = rows.map((r) => (r.deaths ? r.kills / r.deaths : r.kills));
    const krSeries = rows.map((r) => (r.rounds ? r.kills / r.rounds : 0));
    const ratingSeries = rows.map(matchRating);
    const kdStability = stabilityScore(kdSeries);
    const krStability = stabilityScore(krSeries);

    const wRating = games
      ? rows.reduce((s, r, i) => s + matchRating(r) * w[i], 0) / wsum
      : 1;
    const confidence = clamp(games / WINDOW, 0.15, 1);
    const rating = 1 + (wRating - 1) * confidence;

    const formTrend = trendOf(ratingSeries);
    const streak = streakOf(rows);

    const flatKD = deaths ? kills / deaths : kills;
    const recent = rows.slice(0, 5);
    const recentKD = recent.length
      ? mean(recent.map((r) => (r.deaths ? r.kills / r.deaths : r.kills)))
      : flatKD;
    const recentForm = clamp(recentKD / (flatKD || 1), 0.5, 1.6);

    const avgSeriesKD = mean(kdSeries) || 1;
    const peak = kdSeries.length ? Math.max(...kdSeries) / avgSeriesKD : 1;

    const elo = profile?.points ?? 1000;

    return {
      id: profile?.id, name: profile?.name, elo, games,
      kd, kr, adr, winrate, rating, formTrend, streak,
      recentForm, kdStability, krStability, peak, confidence,
    };
  }

  function stabilityScore(series) {
    if (series.length < 2) return 0.6;
    const m = mean(series);
    if (m <= 0) return 0.5;
    const cv = stdev(series) / m;
    return clamp(1 - cv, 0, 1);
  }

  function strength(a) {

    const eloN = clamp((a.elo - 550) / (1650 - 550), 0, 1);
    const kdN = clamp((a.kd - 0.6) / (1.6 - 0.6), 0, 1);
    const krN = clamp((a.kr - 0.5) / (1.0 - 0.5), 0, 1);
    const adrN = clamp((a.adr - 50) / (110 - 50), 0, 1);
    const wrN = clamp((a.winrate - 0.3) / (0.7 - 0.3), 0, 1);
    const formN = clamp((a.recentForm - 0.7) / (1.4 - 0.7), 0, 1);
    const ratingN = clamp(((a.rating ?? 1) - 0.55) / (1.45 - 0.55), 0, 1);
    const trendN = clamp(0.5 + (a.formTrend ?? 0) * 0.5, 0, 1);

    const perf = 0.28 * kdN + 0.18 * ratingN + 0.15 * krN + 0.14 * adrN +
                 0.12 * wrN + 0.08 * formN + 0.05 * trendN;

    const perfWeight = 0.12 + 0.28 * (a.confidence ?? 0.15);
    const raw = (1 - perfWeight) * eloN + perfWeight * perf;

    const adjusted = 0.5 + (raw - 0.5) * (0.72 + 0.28 * (a.confidence ?? 0.15));
    return Math.round(clamp(adjusted, 0, 1) * 100);
  }

  function playerEloAdj(p) {
    const s = strength(p);
    const perfDelta = (s - 50) * 2.0 * (p.confidence ?? 0.15);
    const momentum = (p.formTrend ?? 0) * 30 + clamp(p.streak ?? 0, -3, 3) * 7;
    return p.elo + perfDelta + momentum;
  }

  function teamElo(players) {
    if (!players.length) return 1000;
    const adj = players.map(playerEloAdj).sort((x, y) => y - x);
    const n = adj.length;
    let num = 0, den = 0;
    adj.forEach((e, i) => {
      const w = n > 1 ? 1.2 - 0.4 * (i / (n - 1)) : 1;
      num += e * w; den += w;
    });
    return num / den;
  }

  function winProbability(teamA, teamB) {
    const ea = teamElo(teamA);
    const eb = teamElo(teamB);
    let p = 1 / (1 + Math.pow(10, (eb - ea) / 400));
    const conf = (mean(teamA.map((x) => x.confidence ?? 0.15)) +
                  mean(teamB.map((x) => x.confidence ?? 0.15))) / 2;
    p = 0.5 + (p - 0.5) * (0.55 + 0.45 * conf);
    return clamp(p, 0.05, 0.95);
  }

  CSRP.stats = {
    rowsForPlayer,
    aggregate,
    strength,
    teamElo,
    winProbability,

    analyze(profile, history, period) {
      const rows = rowsForPlayer(history, profile?.id, period);
      return aggregate(profile, rows);
    },
  };
})();
