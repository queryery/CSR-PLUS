
(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});

  const NAMES = ['hover', 'on', 'off', 'click', 'accept', 'cancel', 'tick', 'alert'];

  const CATEGORY = {
    hover: 'ui', click: 'ui', on: 'ui', off: 'ui',
    alert: 'match',
    tick: 'countdown',
    accept: 'accept', cancel: 'accept',
  };

  const CAT_KEY = { match: 'soundMatch', countdown: 'soundCountdown', accept: 'soundAccept', ui: 'soundUi' };
  const buffers = {};
  let enabled = true;
  let volume = 0.6;
  let cats = { ui: true, match: true, countdown: true, accept: true };
  let unlocked = false;

  function url(name) {
    return chrome.runtime.getURL(`assets/sounds/${name}.wav`);
  }

  function preload() {
    for (const n of NAMES) {
      const a = new Audio(url(n));
      a.preload = 'auto';
      a.volume = volume;
      buffers[n] = a;
    }
  }


  function armUnlock() {
    if (unlocked) return;
    const go = () => {
      unlocked = true;
      window.removeEventListener('pointerdown', go, true);
      window.removeEventListener('keydown', go, true);
    };
    window.addEventListener('pointerdown', go, true);
    window.addEventListener('keydown', go, true);
  }

  function play(name) {
    if (!enabled || !buffers[name]) return;

    const cat = CATEGORY[name] || 'ui';
    if (cats[cat] === false) return;
    try {
      const base = buffers[name];
      const node = base.cloneNode(true);
      node.volume = volume;
      const p = node.play();
      if (p && p.catch) p.catch(() => {});
    } catch {
      
    }
  }

  function applyConfig(cfg) {
    enabled = cfg.soundEnabled !== false;
    volume = typeof cfg.soundVolume === 'number' ? cfg.soundVolume : 0.6;
    for (const cat in CAT_KEY) cats[cat] = cfg[CAT_KEY[cat]] !== false;
    for (const n of NAMES) if (buffers[n]) buffers[n].volume = volume;
  }

  function init(cfg) {
    if (cfg) applyConfig(cfg);
    preload();
    armUnlock();
  }

  CSRP.sound = { init, play, applyConfig, NAMES };
})();
