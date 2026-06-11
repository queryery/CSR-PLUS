/* CSR+ — inject a "Watch inventory" button on a player's page that opens our
 * custom inventory viewer. */
(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});

  const BTN_ID = 'csrp-watch-inv';

  // The player id lives in the URL on /app/user/{id} and similar routes.
  function userIdFromUrl() {
    const m = location.pathname.match(/\/user\/(\d{15,21})/);
    return m ? m[1] : null;
  }

  function invUrl(id) {
    return chrome.runtime.getURL(`inventory/inventory.html?id=${id}`);
  }

  // Find a good place to mount: next to "View Marketplace", else the header row.
  function findAnchor() {
    const market = Array.from(document.querySelectorAll('a[href*="/marketplace/"]'))
      .find((a) => a.querySelector('button') || /marketplace/i.test(a.textContent));
    if (market) return { node: market, mode: 'after' };
    // Fallback: the row holding the avatar + name.
    const name = document.querySelector('p.text-theme-white, .text-theme-white');
    const row = name?.closest('.flex.flex-row');
    return row ? { node: row, mode: 'append' } : null;
  }

  function makeButton(id) {
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.className = 'csrp-watch-btn';
    btn.innerHTML = '<span class="csrp-wb-ic">▦</span> Watch inventory';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      CSRP.sound?.play('click');
      window.open(invUrl(id), '_blank', 'noopener');
    });
    return btn;
  }

  function tick() {
    const id = userIdFromUrl();
    if (!id) {
      const stale = document.getElementById(BTN_ID);
      if (stale) stale.remove();
      return;
    }
    if (document.getElementById(BTN_ID)) return; // already placed
    const anchor = findAnchor();
    if (!anchor) return;
    const btn = makeButton(id);
    if (anchor.mode === 'after') anchor.node.insertAdjacentElement('afterend', btn);
    else anchor.node.appendChild(btn);
  }

  CSRP.inventory = { tick };
})();
