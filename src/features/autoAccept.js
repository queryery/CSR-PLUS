(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});
  const S = CSRP.store;
  const clicked = new WeakSet();

  function visible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function clickOnce(btn, label) {
    if (!btn || clicked.has(btn)) return;
    clicked.add(btn);
    CSRP.log('click →', label);
    btn.click();
    setTimeout(() => clicked.delete(btn), 3000);
  }


  function findPrimaryCTA(text) {
    for (const btn of document.querySelectorAll('button')) {
      if (btn.textContent.trim() !== text) continue;
      if (
        btn.classList.contains('rounded-full') &&
        btn.classList.contains('bg-theme-primary') &&
        btn.classList.contains('px-12') &&
        visible(btn)
      )
        return btn;
    }
    return null;
  }


  function inviteToasts() {
    const out = [];
    for (const btn of document.querySelectorAll('button')) {
      if (btn.textContent.trim() !== 'Accept') continue;
      if (
        !(
          btn.classList.contains('bg-theme-primary') &&
          btn.classList.contains('px-4') &&
          btn.classList.contains('hover:bg-red-900')
        )
      )
        continue;
      if (!visible(btn)) continue;
      const card = btn.closest('.animate-fade-in') || btn.closest('div[class*="rounded-lg"]');
      const nameEl = card?.querySelector('img[alt]')?.getAttribute('alt') || '';
      out.push({ btn, name: nameEl, card });
    }
    return out;
  }

  function inviteAllowed(name, cfg) {
    const list = cfg.inviteFriends || {};
    const ids = Object.keys(list).filter((k) => list[k]);
    if (ids.length === 0) return true;

    const friends = CSRP._friendsCache || [];
    const friend = friends.find((f) => f.name === name);
    return friend ? !!list[friend.id] : false;
  }

  function tick() {
    const cfg = S.get();
    if (cfg.autoMatch) {
      const matchBtn = findPrimaryCTA('Accept Match');
      if (matchBtn) {

        if (cfg.acceptInstant) {
          clickOnce(matchBtn, 'Accept Match (instant)');
        } else {

          const mo = CSRP.matchOverlay;
          if (mo && mo.countdownActive()) {

          } else if (mo && mo.alreadyAccepted()) {

          } else if (mo && mo.countdownCancelled()) {

          } else if (mo) {
            mo.startCountdown(matchBtn);
          } else {
            clickOnce(matchBtn, 'Accept Match');
          }
        }
      } else if (CSRP.matchOverlay) {

        const modalGone = !CSRP.dom.findMatchFoundModal();
        if (modalGone) {

          CSRP.matchOverlay.finishCountdown();
          CSRP.matchOverlay.resetCancelLatch();
          CSRP.matchOverlay.resetAcceptLatch();
        }
      }
    }
    if (cfg.autoQueue) clickOnce(findPrimaryCTA('Accept'), 'Accept Queue');
    if (cfg.autoInvite) {
      // While already in a party, invites are ignored unless the child setting
      // "accept invites while in a party" is enabled (off by default).
      const blocked = !cfg.inviteWhileInParty && CSRP.inParty && CSRP.inParty();
      if (!blocked) {
        for (const t of inviteToasts()) {
          if (inviteAllowed(t.name, cfg)) clickOnce(t.btn, `Invite: ${t.name}`);
        }
      }
    }
  }

  CSRP.autoAccept = { tick };
})();
