(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});

  const BTN_ID = 'csrp-open-trades';
  const OVERLAY_ID = 'csrp-trades-overlay';

  function onTradesRoute() {
    return /\/trades?\b/i.test(location.pathname);
  }

  function tradesUrl() {
    return chrome.runtime.getURL('trades/trades.html');
  }

  function openCsrpTrades() {
    window.open(tradesUrl(), '_blank', 'noopener');
  }

  function isTradesLink(a) {
    if (!a) return false;
    const href = a.getAttribute('href') || '';
    if (/trade-up|\/trades?\b/i.test(href)) return true;
    const txt = (a.textContent || '').trim().toLowerCase();
    return txt === 'trades';
  }

  function buildOverlay() {
    const wrap = document.createElement('div');
    wrap.id = OVERLAY_ID;
    wrap.className = 'csrp-tr-overlay';
    wrap.innerHTML = `
      <div class="csrp-tr-card" role="dialog" aria-modal="true">
        <div class="csrp-tr-scan"></div>
        <div class="csrp-tr-tag">CSR+ // TRADES <span class="csrp-tr-beta">BETA</span></div>
        <h2 class="csrp-tr-title">Try the new CSR+ Trades</h2>
        <p class="csrp-tr-sub">CSR+ now has its own trade screen — clearer, faster, and it shows the details the site hides. It's in <b>beta</b>, so a few things may still break. Open it instead of the default page?</p>
        <label class="csrp-tr-remember">
          <input type="checkbox" id="csrp-tr-dontask" />
          <span class="csrp-tr-box"></span>
          <span>Remember my choice &amp; don't ask again</span>
        </label>
        <div class="csrp-tr-actions">
          <button class="csrp-tr-btn csrp-tr-legacy" id="csrp-tr-legacy">Use legacy</button>
          <button class="csrp-tr-btn csrp-tr-use" id="csrp-tr-use">Use CSR+ Trades  ⇄</button>
        </div>
      </div>`;

    const close = () => wrap.remove();
    const dontAsk = () => wrap.querySelector('#csrp-tr-dontask').checked;

    async function remember(useCsrp) {
      if (!dontAsk()) return;
      try {
        await CSRP.store.set('useCsrpTrades', useCsrp);
        await CSRP.store.set('tradesPromptDismissed', true);
      } catch {  }
    }

    wrap.querySelector('#csrp-tr-use').addEventListener('click', async () => {
      CSRP.sound?.play('click');
      await remember(true);
      close();
      openCsrpTrades();
    });
    wrap.querySelector('#csrp-tr-legacy').addEventListener('click', async () => {
      CSRP.sound?.play('off');
      await remember(false);
      close();

      if (wrap.dataset.suppressed === '1') location.assign('/app/inventory/trade-up');
    });

    wrap.addEventListener('click', (e) => { if (e.target === wrap) { CSRP.sound?.play('off'); close(); } });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape' && document.getElementById(OVERLAY_ID)) { close(); document.removeEventListener('keydown', esc); }
    });

    return wrap;
  }

  function showOverlay(suppressed) {
    if (document.getElementById(OVERLAY_ID)) return;
    const ov = buildOverlay();
    if (suppressed) ov.dataset.suppressed = '1';
    document.body.appendChild(ov);
    CSRP.sound?.play('alert');
  }

  function handleTradesClick(e) {
    const dismissed = CSRP.store.get('tradesPromptDismissed');
    if (dismissed) {

      if (CSRP.store.get('useCsrpTrades')) {
        e.preventDefault();
        e.stopPropagation();
        CSRP.sound?.play('click');
        openCsrpTrades();
      }
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    showOverlay(true);
  }

  let navBound = false;
  function bindNavInterception() {
    if (navBound) return;
    navBound = true;
    document.addEventListener('click', (e) => {
      if (CSRP.store.get('masterEnabled') === false) return;
      const a = e.target.closest && e.target.closest('a');
      if (!a || !isTradesLink(a)) return;
      handleTradesClick(e);
    }, true);
  }

  function findAnchor() {
    const btns = Array.from(document.querySelectorAll('button'));
    const send = btns.find((b) => /send trade offer/i.test(b.textContent || ''));
    if (send && !send.id) return send;
    for (const h of document.querySelectorAll('h2')) {
      if ((h.textContent || '').trim().toLowerCase() === 'trades') return h;
    }
    return null;
  }

  function makeButton() {
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.className =
      'rounded-lg bg-theme-primary px-6 py-2 text-sm font-medium text-theme-white transition-colors hover:bg-theme-primary-light';
    btn.style.marginLeft = '8px';
    btn.textContent = '⇄ CSR+ Trade';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      CSRP.sound?.play('click');
      openCsrpTrades();
    });
    return btn;
  }

  function friendIdSet() {
    const list = CSRP._friendsCache;
    if (!Array.isArray(list) || !list.length) return null;
    return new Set(list.map((f) => String(f.id ?? f.discord_id ?? '')));
  }

  let friendsRefreshed = false;
  function tickFriendsPage() {
    if (!/friend/i.test(location.pathname)) return;
    const ids = friendIdSet();
    if (!ids) {
      if (!friendsRefreshed) {
        friendsRefreshed = true;
        CSRP.api.friends().then((f) => { if (Array.isArray(f)) CSRP._friendsCache = f; });
      }
      return;
    }
    for (const img of document.querySelectorAll('img')) {
      if (img.closest('.csrp-pop, .csrp-panel, nav, header')) continue;
      const id = CSRP.dom.idFromAvatar(img);
      if (!id || !ids.has(id)) continue;

      let row = img.parentElement, hit = null;
      for (let up = 0; row && up < 6; up++, row = row.parentElement) {
        if (row.querySelector('button, svg, a')) { hit = row; break; }
      }
      if (!hit || hit.querySelector('.csrp-st-btn')) continue;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'csrp-st-btn';
      btn.title = 'Send a trade offer via CSR+';
      btn.innerHTML = '<span class="csrp-st-ic">⇄</span> Send trade';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        CSRP.sound?.play('click');
        window.open(tradesUrl() + '?partner=' + id, '_blank', 'noopener');
      });

      const firstBtn = hit.querySelector('button');
      if (firstBtn) {
        firstBtn.insertAdjacentElement('beforebegin', btn);
        const wrap = firstBtn.parentElement;
        if (wrap) {
          wrap.style.display = 'flex';
          wrap.style.alignItems = 'center';
        }
        firstBtn.style.width = 'auto';
        firstBtn.style.flex = 'none';
      } else hit.appendChild(btn);
    }
  }

  function tick() {
    bindNavInterception();
    tickFriendsPage();
    if (!onTradesRoute()) {
      const stale = document.getElementById(BTN_ID);
      if (stale) stale.remove();
      return;
    }
    if (document.getElementById(BTN_ID)) return;
    const anchor = findAnchor();
    if (!anchor) return;
    anchor.insertAdjacentElement('afterend', makeButton());
  }

  CSRP.trades = { tick };
})();
