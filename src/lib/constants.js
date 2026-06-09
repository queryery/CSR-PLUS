/* CSR+ — shared constants. Exposed on window.CSRP namespace (content-script world). */
(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});

  CSRP.API_BASE = 'https://api.csrestored.fun';

  // The maps available in the pool (used for ban ordering / priority UI).
  CSRP.MAPS = [
    'Mirage',
    'Inferno',
    'Nuke',
    'Dust2',
    'Ancient',
    'Anubis',
    'Vertigo',
    'Train',
    'Overpass',
    'Cobblestone',
  ];

  // Default settings — kept in sync with the popup.
  CSRP.DEFAULTS = {
    masterEnabled: true,
    autoMatch: true,
    autoInvite: true,
    autoQueue: true,
    autoBan: false,
    autoCopyServer: true, // copy the connect string when the server is ready
    autoUpdate: true,     // check GitHub for new releases and surface an update prompt
    acceptInstant: false, // skip the countdown and accept the match immediately
    acceptDelay: 10,      // countdown length before auto-accept (seconds, 1..30)
    // Per-friend auto-accept allow list { id: true }. Empty => accept all.
    inviteFriends: {},
    // Ordered list of map names, lowest priority (first to ban) at the top.
    banPriority: ['Vertigo', 'Overpass', 'Anubis', 'Train', 'Ancient', 'Dust2', 'Nuke', 'Inferno', 'Mirage', 'Cobblestone'],
    showBadges: true,
    showWinProb: true,
    showMatchOverlay: true, // custom 10-player match intel overlay
    statsPeriod: 'all', // today | yesterday | all
    soundEnabled: true,
    soundVolume: 0.6,
    theme: 'black', // 'black' (cyberpunk dark) | 'mask' (light)
    // Auto-sell: irreversible. Ships OFF and un-armed (dry-run preview only
    // until the user explicitly arms it). Sells items matching the filters via
    // POST /inventory/sell/{item_id} in batches, on any page.
    autoSell: {
      enabled: false,            // run the auto-sell loop at all
      armed: false,              // MUST be armed to actually sell; else dry-run
      rarities: { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false },
      stattrak: 'keep',          // 'keep' (never sell ST) | 'sell' (allow) | 'only' (only ST)
      wears: { FN: false, MW: false, FT: false, WW: false, BS: false },
      sellNoFloat: false,        // items without a float (cases, capsules, agents)
      maxFloat: 1,               // also require float <= this (1 = no extra gate)
      protectKnivesGloves: true, // never auto-sell knives or gloves
      protectNametag: true,      // never auto-sell name-tagged items
      batchSize: 5,              // items per batch
      intervalSec: 15,           // seconds between batches
    },
    // Written by the auto-sell loop so the popup can show the dry-run preview.
    autoSellPreview: { count: 0, names: [], armed: false, at: 0 },
  };

  // Player tiers — consistency/peak based (not a single threshold).
  CSRP.TIERS = {
    vstrong:      { label: 'Very strong',  cls: 'csrp-t-vstrong' },   // bright green
    consistent:   { label: 'Consistent',   cls: 'csrp-t-consistent' },// green
    peak:         { label: 'Has peak games', cls: 'csrp-t-peak' },    // yellow
    inconsistent: { label: 'Inconsistent', cls: 'csrp-t-inconsistent' }, // orange
    weak:         { label: 'Weak',         cls: 'csrp-t-weak' },      // red
    none:         { label: 'No matches',   cls: 'csrp-t-none' },      // grey
  };

  // Classify an aggregate into a tier. Uses strength (0-100), K/D stability
  // (1 = perfectly consistent) and the peak signal (best game vs average).
  CSRP.classify = (agg) => {
    const T = CSRP.TIERS;
    if (!agg || !agg.games) return T.none;
    const s = CSRP.stats.strength(agg);          // 0..100
    const stab = agg.kdStability ?? 0.5;          // 0..1
    const peak = agg.peak ?? 1;                    // best/avg KD ratio (>1.6 = spiky)

    if (s >= 72 && stab >= 0.55) return T.vstrong;
    if (stab >= 0.6 && s >= 45) return T.consistent;
    if (peak >= 1.7 && s >= 40) return T.peak;     // spiky but capable
    if (s < 38) return T.weak;
    return T.inconsistent;
  };

  // Back-compat shim: some code calls tierFor(score).
  CSRP.tierFor = (score) => {
    const T = CSRP.TIERS;
    if (score >= 72) return T.vstrong;
    if (score >= 55) return T.consistent;
    if (score >= 42) return T.peak;
    if (score >= 30) return T.inconsistent;
    return T.weak;
  };

  CSRP.log = (...a) => console.log('%c[CSR+]', 'color:#e23a45;font-weight:700', ...a);
})();
