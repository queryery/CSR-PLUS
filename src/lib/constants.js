(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});

  CSRP.API_BASE = 'https://api.csrestored.fun';

  CSRP.PRO_API = 'https://europe-west1-csr-plus-331c8.cloudfunctions.net/api';
  CSRP.CHECKOUT_HOST = 'https://csr-plus-331c8.web.app';


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


  CSRP.DEFAULTS = {
    masterEnabled: true,
    autoMatch: true,
    autoInvite: true,
    inviteWhileInParty: false,
    autoQueue: true,
    autoBan: false,
    autoCopyServer: true,
    autoUpdate: true,
    acceptInstant: false,
    acceptDelay: 10,

    inviteFriends: {},

    banPriority: ['Vertigo', 'Overpass', 'Anubis', 'Train', 'Ancient', 'Dust2', 'Nuke', 'Inferno', 'Mirage', 'Cobblestone'],
    showBadges: true,
    showWinProb: true,
    showMatchOverlay: true,
    statsPeriod: 'last10',
    soundEnabled: true,
    soundVolume: 0.6,

    soundUi: true,
    soundMatch: true,
    soundCountdown: true,
    soundAccept: true,
    theme: 'black',
    hideBanners: false,
    useCsrpTrades: false,
    tradesPromptDismissed: false,
    useCsrpCases: false,
    casesPromptDismissed: false,
  };


  CSRP.TIERS = {
    vstrong:      { label: 'Very strong',  cls: 'csrp-t-vstrong' },
    hot:          { label: 'On fire',      cls: 'csrp-t-hot' },
    consistent:   { label: 'Consistent',   cls: 'csrp-t-consistent' },
    peak:         { label: 'Has peak games', cls: 'csrp-t-peak' },
    cold:         { label: 'Tilted',       cls: 'csrp-t-cold' },
    inconsistent: { label: 'Inconsistent', cls: 'csrp-t-inconsistent' },
    weak:         { label: 'Weak',         cls: 'csrp-t-weak' },
    none:         { label: 'No matches',   cls: 'csrp-t-none' },
  };


  CSRP.classify = (agg) => {
    const T = CSRP.TIERS;
    if (!agg || !agg.games) return T.none;
    const s = CSRP.stats.strength(agg);
    const stab = agg.kdStability ?? 0.5;
    const peak = agg.peak ?? 1;
    const trend = agg.formTrend ?? 0;
    const streak = agg.streak ?? 0;

    if (s >= 72 && stab >= 0.55) return T.vstrong;
    if (streak >= 3 && trend >= 0 && s >= 45) return T.hot;
    if (stab >= 0.6 && s >= 45) return T.consistent;
    if (peak >= 1.7 && s >= 40) return T.peak;
    if (streak <= -3 && trend <= 0 && s >= 35) return T.cold;
    if (s < 38) return T.weak;
    return T.inconsistent;
  };


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
