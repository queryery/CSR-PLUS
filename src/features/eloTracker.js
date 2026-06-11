/* CSR+ — ELO change tracker. Watches the logged-in user's ELO and surfaces the
 * +/- delta after each match, plus a running session total. The user's id comes
 * from the page-world socket hook (CSRP._matchData.myId); ELO is read from the
 * /users profile. State is persisted in localStorage so the session figure
 * survives reloads within the day. */
(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});

  const KEY = 'csrp:elotrack';
  let state = load();          // { id, last, sessionStart, sessionDelta, day }
  let myId = null;
  let polling = false;

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return null;
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }

  function toast(msg, cls) {
    const t = document.createElement('div');
    t.className = 'csrp-toast csrp-elo-toast' + (cls ? ' ' + cls : '');
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('csrp-toast-show'));
    setTimeout(() => { t.classList.remove('csrp-toast-show'); setTimeout(() => t.remove(), 400); }, 4200);
  }

  // Apply a freshly-read ELO value: detect a change, toast the delta, and keep
  // the running session total.
  function apply(elo) {
    if (typeof elo !== 'number' || !Number.isFinite(elo)) return;

    // New day or first run for this account → (re)start the session baseline.
    if (!state || state.id !== myId || state.day !== today()) {
      state = { id: myId, last: elo, sessionStart: elo, sessionDelta: 0, day: today() };
      persist();
      return;
    }

    if (elo === state.last) return; // no change

    const delta = elo - state.last;
    state.last = elo;
    state.sessionDelta = elo - state.sessionStart;
    persist();

    const sign = delta > 0 ? '+' : '';
    const sessSign = state.sessionDelta > 0 ? '+' : '';
    const cls = delta > 0 ? 'csrp-elo-up' : 'csrp-elo-down';
    CSRP.sound?.play(delta > 0 ? 'on' : 'cancel');
    toast(`${delta > 0 ? '▲' : '▼'} ${sign}${delta} ELO  ·  now ${elo}  ·  session ${sessSign}${state.sessionDelta}`, cls);
  }

  async function poll() {
    if (polling || !myId) return;
    polling = true;
    try {
      // Cache-bypassing read so a finished match's ELO change is seen promptly.
      const profile = await CSRP.api.userFresh(myId);
      if (profile && profile.points != null) apply(Number(profile.points));
    } catch { /* ignore */ } finally {
      polling = false;
    }
  }

  let timer = null;
  function tick() {
    // Discover our id from match data once it's available.
    if (!myId) {
      const id = CSRP._matchData && CSRP._matchData.myId;
      if (id) {
        myId = String(id);
        poll(); // baseline immediately
      }
      return;
    }
    if (!timer) {
      // Poll every ~90s; ELO only changes once per finished match.
      timer = setInterval(poll, 90 * 1000);
    }
  }

  // Public: current session delta (for popup/UI if needed later).
  function sessionDelta() { return state && state.id === myId ? state.sessionDelta : 0; }

  CSRP.eloTracker = { tick, sessionDelta };
})();
