/* CSR+ — settings store wrapper over chrome.storage.local with change events. */
(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});
  const D = CSRP.DEFAULTS;

  const listeners = new Set();
  let cache = { ...D };

  function load() {
    return new Promise((resolve) => {
      chrome.storage.local.get(Object.keys(D), (data) => {
        cache = { ...D, ...data };
        resolve(cache);
      });
    });
  }

  // Reflect external changes (popup writes, other tabs) into the cache.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
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
      return new Promise((r) => chrome.storage.local.set({ [k]: v }, r));
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
})();
