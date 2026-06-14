
(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});

  const BTN_ID = 'csrp-watch-inv';


  function userIdFromUrl() {
    const m = location.pathname.match(/\/user\/(\d{15,21})/);
    return m ? m[1] : null;
  }


  function invUrl(id) {
    return chrome.runtime.getURL(`profile/profile.html?id=${id}&tab=inventory`);
  }


  function findAnchor() {
    const market = Array.from(document.querySelectorAll('a[href*="/marketplace/"]'))
      .find((a) => a.querySelector('button') || /marketplace/i.test(a.textContent));
    if (market) return { node: market, mode: 'after' };

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
    if (document.getElementById(BTN_ID)) return;
    const anchor = findAnchor();
    if (!anchor) return;
    const btn = makeButton(id);
    if (anchor.mode === 'after') anchor.node.insertAdjacentElement('afterend', btn);
    else anchor.node.appendChild(btn);
  }

  CSRP.inventory = { tick };
})();
