/* CSR+ — UI sound player. Bundled WAVs, master on/off + volume from storage.
 * Works in both the content script and the popup (uses chrome.runtime URL). */
(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});

  const NAMES = ['hover', 'on', 'off', 'click', 'accept', 'cancel', 'tick', 'alert'];
  const buffers = {}; // name -> HTMLAudioElement pool
  let enabled = true;
  let volume = 0.6;
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

  // Browsers gate audio until a user gesture; arm on first interaction.
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
    try {
      const base = buffers[name];
      const node = base.cloneNode(true);
      node.volume = volume;
      const p = node.play();
      if (p && p.catch) p.catch(() => {});
    } catch {
      /* ignore */
    }
  }

  function applyConfig(cfg) {
    enabled = cfg.soundEnabled !== false;
    volume = typeof cfg.soundVolume === 'number' ? cfg.soundVolume : 0.6;
    for (const n of NAMES) if (buffers[n]) buffers[n].volume = volume;
  }

  function init(cfg) {
    if (cfg) applyConfig(cfg);
    preload();
    armUnlock();
  }

  CSRP.sound = { init, play, applyConfig, NAMES };
})();
