
(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});
  const D = CSRP.DEFAULTS;

  const listeners = new Set();
  let cache = { ...D };

  const area = (chrome.storage && chrome.storage.sync) ? chrome.storage.sync : chrome.storage.local;
  const AREA_NAME = area === (chrome.storage && chrome.storage.sync) ? 'sync' : 'local';

  function migrateFromLocal() {
    return new Promise((resolve) => {
      if (AREA_NAME !== 'sync') return resolve();
      chrome.storage.sync.get(['__csrpMigrated'], (s) => {
        if (s && s.__csrpMigrated) return resolve();
        chrome.storage.local.get(Object.keys(D), (localData) => {
          const toCopy = {};
          for (const k of Object.keys(D)) if (k in localData) toCopy[k] = localData[k];
          toCopy.__csrpMigrated = true;
          chrome.storage.sync.set(toCopy, resolve);
        });
      });
    });
  }

  async function load() {
    await migrateFromLocal();
    return new Promise((resolve) => {
      area.get(Object.keys(D), (data) => {
        cache = { ...D, ...data };
        resolve(cache);
      });
    });
  }

  chrome.storage.onChanged.addListener((changes, changedArea) => {
    if (changedArea !== AREA_NAME) return;
    let touched = false;
    for (const key in changes) {
      if (key in D) {
        cache[key] = changes[key].newValue ?? D[key];
        touched = true;
      }
    }
    if (touched) listeners.forEach((fn) => fn(cache));
  });

  CSRP.store = {
    load,
    get: (k) => (k ? cache[k] : cache),
    set(k, v) {
      cache[k] = v;
      return new Promise((r) => area.set({ [k]: v }, r));
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
})();
