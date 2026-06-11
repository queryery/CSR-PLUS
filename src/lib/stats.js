/* CSR+ — stats engine. Turns raw user + match history into player ratings
 * and team win probabilities. All pure functions, no DOM.
 *
 * v2 highlights:
 *  - Bayesian shrinkage: per-round rates are pulled toward league averages by
 *    sample size, so one lucky match can't mint a "Very strong" badge.
 *  - Per-match impact rating (HLTV-style approximation from KPR + survival),
 *    used for form trend and consistency.
 *  - Form trend (regression slope of recent ratings) + current win/loss streak.
 *  - Win probability: star-weighted team Elo (carries matter more in pugs),
 *    momentum nudges, and shrinkage toward 50% when data is thin. */
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

  // League baselines (per-round averages) the Bayesian priors shrink toward.
  const LG = { kpr: 0.68, dpr: 0.66, apr: 0.12 };
  const PRIOR_ROUNDS = 40;  // ~2 matches' worth of prior weight
  const WINDOW = 10;        // "last 10 games" period size

  // Filter a history feed to the active period. 'today'/'yesterday' are date
  // windows; anything else (the default 'last10', plus the legacy 'all' some
  // users still have saved) means "the most recent WINDOW matches".
  function inPeriod(dateStr, period) {
    if (period !== 'today' && period !== 'yesterday') return true;
    const d = new Date(dateStr);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === 'today') return d >= startOfToday;
    const startY = new Date(startOfToday.getTime() - 864e5);
    return d >= startY && d < startOfToday;
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
    // Date periods keep the whole day; everything else is the last N matches
    // (rows arrive newest-first from the API).
    if (period === 'today' || period === 'yesterday') return rows;
    return rows.slice(0, WINDOW);
  }

  // HLTV 1.0-style impact rating for one match (no multikill data, so the
  // kill + survival components carry the weight). ~1.0 = average.
  function matchRating(r) {
    const rounds = r.rounds || 1;
    const killRating = (r.kills / rounds) / 0.679;
    const survivalRating = (Math.max(0, rounds - r.deaths) / rounds) / 0.317;
    return (killRating + 0.7 * survivalRating) / 1.7;
  }

  // Weighted regression slope of a newest-first series, flipped so that
  // positive = improving. Scaled by window length and clamped to [-1, 1].
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

  // Current win/loss streak from newest-first rows: +3 = won last 3, -2 = lost
  // last 2. Undecided matches are skipped.
  function streakOf(rows) {
    const decided = rows.filter((r) => r.won !== null);
    if (!decided.length) return 0;
    let n = 0;
    for (const r of decided) { if (r.won === decided[0].won) n++; else break; }
    return decided[0].won ? n : -n;
  }

  // Aggregate a player's profile. `profile` = /users payload, `rows` = match
  // rows (assumed newest-first, which is how the API returns them).
  function aggregate(profile, rows) {
    const games = rows.length;

    // Recency weights: most-recent game weighted highest, decaying ~0.92^i.
    const w = rows.map((_, i) => Math.pow(0.92, i));
    const wsum = w.reduce((s, x) => s + x, 0) || 1;

    const kills = rows.reduce((s, r) => s + r.kills, 0);
    const deaths = rows.reduce((s, r) => s + r.deaths, 0);
    const rounds = rows.reduce((s, r) => s + r.rounds, 0);
    const assists = rows.reduce((s, r) => s + (r.assists || 0), 0);
    const decided = rows.filter((r) => r.won !== null).length;

    // Recency-weighted per-round rates…
    const wKills = rows.reduce((s, r, i) => s + (r.rounds ? r.kills / r.rounds : 0) * w[i], 0) / wsum;
    const wDeaths = rows.reduce((s, r, i) => s + (r.rounds ? r.deaths / r.rounds : 0) * w[i], 0) / wsum;
    const wWin = (() => {
      let num = 0, den = 0;
      rows.forEach((r, i) => { if (r.won !== null) { den += w[i]; if (r.won) num += w[i]; } });
      return den ? num / den : null;
    })();

    // …shrunk toward the league baseline by sample size (Bayesian prior), so a
    // 30-bomb in a single short match reads as "probably good", not "demigod".
    const shrink = (rate, prior) => (rate * rounds + prior * PRIOR_ROUNDS) / (rounds + PRIOR_ROUNDS);
    const kpr = games ? shrink(wKills, LG.kpr) : LG.kpr;
    const dpr = games ? shrink(wDeaths, LG.dpr) : LG.dpr;
    const apr = rounds ? shrink(assists / rounds, LG.apr) : LG.apr;

    // Lifetime fallbacks when the window is empty.
    const lifeKD = profile && profile.deaths ? profile.kills / profile.deaths : 1;
    const lifeWR = profile && profile.matches ? profile.wins / profile.matches : 0.5;

    const kd = games ? (dpr ? kpr / dpr : kpr * 5) : lifeKD;
    const kr = games ? kpr : 0.68;
    const adr = games ? clamp(kr * 100 + apr * 22, 30, 160) : 72;
    // Winrate shrunk toward 50% with a ~4-game prior.
    const winrate = wWin != null
      ? (wWin * decided + 0.5 * 4) / (decided + 4)
      : lifeWR;

    // Per-match series for consistency, form trend and the peak signal.
    const kdSeries = rows.map((r) => (r.deaths ? r.kills / r.deaths : r.kills));
    const krSeries = rows.map((r) => (r.rounds ? r.kills / r.rounds : 0));
    const ratingSeries = rows.map(matchRating);
    const kdStability = stabilityScore(kdSeries);
    const krStability = stabilityScore(krSeries);

    // Impact rating: recency-weighted mean, shrunk toward 1.0 on thin data.
    const wRating = games
      ? rows.reduce((s, r, i) => s + matchRating(r) * w[i], 0) / wsum
      : 1;
    const confidence = clamp(games / WINDOW, 0.15, 1);
    const rating = 1 + (wRating - 1) * confidence;

    // Form trend (slope of impact ratings) + current streak.
    const formTrend = trendOf(ratingSeries);
    const streak = streakOf(rows);

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

    const elo = profile?.points ?? 1000;

    return {
      id: profile?.id, name: profile?.name, elo, games,
      kd, kr, adr, winrate, rating, formTrend, streak,
      recentForm, kdStability, krStability, peak, confidence,
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

  // 0-100 player strength — Elo-led hybrid. Elo carries the base (it already
  // encodes long-term results); the performance composite (impact rating, K/D,
  // K/R, ADR, winrate, form, trend) earns its voice with sample size.
  function strength(a) {
    // Centre ~1050 Elo at the "Average" midpoint. Band 550..1650 → 0..1.
    const eloN = clamp((a.elo - 550) / (1650 - 550), 0, 1);
    const kdN = clamp((a.kd - 0.6) / (1.6 - 0.6), 0, 1);
    const krN = clamp((a.kr - 0.5) / (1.0 - 0.5), 0, 1);
    const adrN = clamp((a.adr - 50) / (110 - 50), 0, 1);
    const wrN = clamp((a.winrate - 0.3) / (0.7 - 0.3), 0, 1);
    const formN = clamp((a.recentForm - 0.7) / (1.4 - 0.7), 0, 1);
    const ratingN = clamp(((a.rating ?? 1) - 0.55) / (1.45 - 0.55), 0, 1);
    const trendN = clamp(0.5 + (a.formTrend ?? 0) * 0.5, 0, 1);

    // Performance composite (the non-Elo signals). Weights sum to 1.
    const perf = 0.28 * kdN + 0.18 * ratingN + 0.15 * krN + 0.14 * adrN +
                 0.12 * wrN + 0.08 * formN + 0.05 * trendN;

    // Performance earns up to 40% of the say with a full window; with no data
    // it keeps a small floor so badges don't read as pure Elo clones.
    const perfWeight = 0.12 + 0.28 * (a.confidence ?? 0.15);
    const raw = (1 - perfWeight) * eloN + perfWeight * perf;

    // Pull toward the mean a touch when sample is very small.
    const adjusted = 0.5 + (raw - 0.5) * (0.72 + 0.28 * (a.confidence ?? 0.15));
    return Math.round(clamp(adjusted, 0, 1) * 100);
  }

  // One player's Elo adjusted for current form: strength nudges it by up to
  // ±100 (confidence-scaled), and momentum (trend + streak) by up to ~±50.
  function playerEloAdj(p) {
    const s = strength(p);
    const perfDelta = (s - 50) * 2.0 * (p.confidence ?? 0.15);
    const momentum = (p.formTrend ?? 0) * 30 + clamp(p.streak ?? 0, -3, 3) * 7;
    return p.elo + perfDelta + momentum;
  }

  // Team Elo: star-weighted mean of adjusted player Elos. In pugs the best
  // player carries hardest, so the top of the lineup counts a bit more
  // (best ×1.2 … worst ×0.8).
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

  // Team win probability — logistic on the star-weighted Elo difference
  // (P(A) = 1 / (1 + 10^((eloB - eloA)/400))), then shrunk toward 50% when we
  // have little match data on either lineup.
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
    // Convenience: build an aggregate straight from profile + history feed.
    analyze(profile, history, period) {
      const rows = rowsForPlayer(history, profile?.id, period);
      return aggregate(profile, rows);
    },
  };
})();
