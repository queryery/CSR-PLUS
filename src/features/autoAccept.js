/* CSR+ — auto-accept: match ready, queue start, and party invites (per-friend). */
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

  // Big primary CTA used for both "Accept Match" and queue "Accept".
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

  // Party-invite toasts: bottom-right cards with Accept/Decline.
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
    if (ids.length === 0) return true; // empty allow-list => accept everyone
    // The toast exposes a name, not an id — match against cached friends.
    const friends = CSRP._friendsCache || [];
    const friend = friends.find((f) => f.name === name);
    return friend ? !!list[friend.id] : false;
  }

  function tick() {
    const cfg = S.get();
    if (cfg.autoMatch) {
      const matchBtn = findPrimaryCTA('Accept Match');
      if (matchBtn) {
        // Instant mode skips the countdown and accepts straight away.
        if (cfg.acceptInstant) {
          clickOnce(matchBtn, 'Accept Match (instant)');
        } else {
          // Route the match-accept through the countdown widget so the user can
          // inspect the lobby and cancel. The widget clicks the button itself.
          const mo = CSRP.matchOverlay;
          if (mo && mo.countdownActive()) {
            // countdown running — it owns the click; do nothing here.
          } else if (mo && mo.alreadyAccepted()) {
            // already accepted this match; the dialog lingers until the server
            // transitions, so don't re-arm a fresh countdown.
          } else if (mo && mo.countdownCancelled()) {
            // user cancelled this round; don't re-arm until the button is gone.
          } else if (mo) {
            mo.startCountdown(matchBtn);
          } else {
            clickOnce(matchBtn, 'Accept Match');
          }
        }
      } else if (CSRP.matchOverlay) {
        // The "Accept Match" CTA isn't present right now. That happens both when
        // the match is truly over AND momentarily right after we accept (the
        // dialog lingers, the button flips text/disables). Only reset the latches
        // once the whole match-found dialog is actually gone — otherwise we'd
        // re-arm a fresh countdown while the accepted dialog is still on screen.
        const modalGone = !CSRP.dom.findMatchFoundModal();
        if (modalGone) {
          if (!CSRP.matchOverlay.countdownActive()) CSRP.matchOverlay.finishCountdown();
          CSRP.matchOverlay.resetCancelLatch();
          CSRP.matchOverlay.resetAcceptLatch();
        }
      }
    }
    if (cfg.autoQueue) clickOnce(findPrimaryCTA('Accept'), 'Accept Queue');
    if (cfg.autoInvite) {
      for (const t of inviteToasts()) {
        if (inviteAllowed(t.name, cfg)) clickOnce(t.btn, `Invite: ${t.name}`);
      }
    }
  }

  CSRP.autoAccept = { tick };
})();
