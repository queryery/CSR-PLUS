
(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});

  const KEY = 'csrp:elotrack';
  let state = load();
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
    } catch {  }
    return null;
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {  }
  }

  function toast(msg, cls) {
    const t = document.createElement('div');
    t.className = 'csrp-toast csrp-elo-toast' + (cls ? ' ' + cls : '');
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('csrp-toast-show'));
    setTimeout(() => { t.classList.remove('csrp-toast-show'); setTimeout(() => t.remove(), 400); }, 4200);
  }

  function apply(elo) {
    if (typeof elo !== 'number' || !Number.isFinite(elo)) return;

    if (!state || state.id !== myId || state.day !== today()) {
      state = { id: myId, last: elo, sessionStart: elo, sessionDelta: 0, day: today() };
      persist();
      return;
    }

    if (elo === state.last) return;

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

      const profile = await CSRP.api.userFresh(myId);
      if (profile && profile.points != null) apply(Number(profile.points));
    } catch {  } finally {
      polling = false;
    }
  }

  let timer = null;
  function tick() {

    if (!myId) {
      const id = CSRP._matchData && CSRP._matchData.myId;
      if (id) {
        myId = String(id);
        poll();
      }
      return;
    }
    if (!timer) {

      timer = setInterval(poll, 90 * 1000);
    }
  }

  function sessionDelta() { return state && state.id === myId ? state.sessionDelta : 0; }

  CSRP.eloTracker = { tick, sessionDelta };
})();
