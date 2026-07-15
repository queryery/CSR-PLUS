(() => {
  'use strict';
  if (window.__csrpHooked) return;
  window.__csrpHooked = true;


  (function blockBeep() {
    if (window.__csrpBlockBeep === undefined) window.__csrpBlockBeep = true;
    const isBeep = (src) => typeof src === 'string' && /beep(\.mp3|\b)/i.test(src);
    try {
      const origPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        if (window.__csrpBlockBeep && isBeep(this.currentSrc || this.src)) {
          try { this.pause(); this.currentTime = 0; } catch {}
          return Promise.resolve();
        }
        return origPlay.apply(this, arguments);
      };

      const OrigAudio = window.Audio;
      window.Audio = function (src) {
        const a = new OrigAudio(src);
        if (window.__csrpBlockBeep && isBeep(src)) { a.muted = true; a.volume = 0; }
        return a;
      };
      window.Audio.prototype = OrigAudio.prototype;
    } catch (e) {  }
  })();

  function findRootFiber() {
    let fiber, w = document.createTreeWalker(document.body, 1);
    while (!fiber && w.nextNode()) {
      const k = Object.keys(w.currentNode).find((x) => x.startsWith('__reactFiber$'));
      if (k) fiber = w.currentNode[k];
    }
    if (!fiber) return null;
    while (fiber.return) fiber = fiber.return;
    return fiber;
  }

  function searchValue(fiber, pick) {
    let found = null;
    const visit = (n) => {
      if (!n || found) return;
      const v = n.memoizedProps?.value;
      if (v) {
        const got = pick(v);
        if (got) { found = got; return; }
      }
      for (let c = n.child; c && !found; c = c.sibling) visit(c);
    };
    visit(fiber);
    return found;
  }


  function findMyId(fiber) {
    return searchValue(fiber, (v) => {
      const u = v.user || v.currentUser || v.me || v.profile;
      if (u && (u.id || u.discord_id)) return String(u.id || u.discord_id);
      if (v.userId) return String(v.userId);
      return null;
    });
  }

  function readMatchData(fiber) {
    const d = searchValue(fiber, (v) => v.matchData);
    if (!d) return null;
    const mp = d.map_pick || {};
    return {
      id: d.id,
      team1: d.members?.[0] || [],
      team2: d.members?.[1] || [],
      playerData: d.members_data || {},
      mapState: {
        banned_maps: mp.banned_maps || [],
        remaining_maps: mp.remaining_maps || [],
        current_team: mp.current_team,
        finished: !!mp.finished,
        picked_map: mp.picked_map || mp.map || null,
      },
      myId: findMyId(fiber),
    };
  }

  let myIdSent = false;
  function emit() {
    const fiber = findRootFiber();
    if (!fiber) return;
    const myId = findMyId(fiber);
    if (myId && !myIdSent) {
      myIdSent = true;
      window.dispatchEvent(new CustomEvent('csrp:myid', { detail: { myId } }));
    }
    const data = readMatchData(fiber);
    if (data) {
      window.dispatchEvent(new CustomEvent('csrp:matchdata', { detail: data }));
    }
  }


  function hookSocket() {
    const fiber = findRootFiber();
    if (!fiber) return false;
    const ctx = searchValue(fiber, (v) => (v.socket ? v : null));
    if (!ctx || !ctx.socket || ctx.socket.__csrp) return false;
    ctx.socket.__csrp = true;
    const orig = ctx.socket.decode;
    ctx.socket.decode = function (data, cb) {
      return orig.call(this, data, (ev) => {
        cb(ev);
        if (ev && ev.topic && (ev.topic.startsWith('match:') ||
            String(ev.event).includes('match') || String(ev.event).includes('map'))) {
          setTimeout(emit, 30);
        }
      });
    };
    return true;
  }

  let tries = 0;
  const boot = setInterval(() => {
    const ok = hookSocket();
    emit();
    if ((ok && myIdSent) || ++tries > 40) clearInterval(boot);
  }, 500);


  window.addEventListener('csrp:pull', emit);
})();
