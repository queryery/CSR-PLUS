(() => {
  "use strict";
  if (window.__csrpHooked) return;
  window.__csrpHooked = true;
  (function safeDom() {
    try {
      const origRemove = Node.prototype.removeChild;
      Node.prototype.removeChild = function(child) {
        try {
          return origRemove.call(this, child);
        } catch (e) {
          if (e && e.name === "NotFoundError") {
            try {
              child.remove();
            } catch {}
            return child;
          }
          throw e;
        }
      };
      const origInsert = Node.prototype.insertBefore;
      Node.prototype.insertBefore = function(node, ref) {
        try {
          return origInsert.call(this, node, ref);
        } catch (e) {
          if (e && e.name === "NotFoundError") {
            this.appendChild(node);
            return node;
          }
          throw e;
        }
      };
    } catch (e) {}
  })();
  (function blockBeep() {
    if (window.__csrpBlockBeep === undefined) window.__csrpBlockBeep = true;
    const isBeep = src => typeof src === "string" && /beep(\.mp3|\b)/i.test(src);
    try {
      const origPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function() {
        if (window.__csrpBlockBeep && isBeep(this.currentSrc || this.src)) {
          try {
            this.pause();
            this.currentTime = 0;
          } catch {}
          return Promise.resolve();
        }
        return origPlay.apply(this, arguments);
      };
      const OrigAudio = window.Audio;
      window.Audio = function(src) {
        const a = new OrigAudio(src);
        if (window.__csrpBlockBeep && isBeep(src)) {
          a.muted = true;
          a.volume = 0;
        }
        return a;
      };
      window.Audio.prototype = OrigAudio.prototype;
    } catch (e) {}
  })();
  function findRootFiber() {
    let fiber, w = document.createTreeWalker(document.body, 1);
    while (!fiber && w.nextNode()) {
      const k = Object.keys(w.currentNode).find(x => x.startsWith("__reactFiber$"));
      if (k) fiber = w.currentNode[k];
    }
    if (!fiber) return null;
    while (fiber.return) fiber = fiber.return;
    return fiber;
  }
  function searchValue(fiber, pick) {
    let found = null;
    const visit = n => {
      if (!n || found) return;
      const v = n.memoizedProps?.value;
      if (v) {
        const got = pick(v);
        if (got) {
          found = got;
          return;
        }
      }
      for (let c = n.child; c && !found; c = c.sibling) visit(c);
    };
    visit(fiber);
    return found;
  }
  function findMyId(fiber) {
    return searchValue(fiber, v => {
      const u = v.user || v.currentUser || v.me || v.profile;
      if (u && (u.id || u.discord_id)) return String(u.id || u.discord_id);
      if (v.userId) return String(v.userId);
      return null;
    });
  }
  function readMatchData(fiber) {
    const d = searchValue(fiber, v => v.matchData);
    if (!d) return null;
    const mp = d.map_pick || {};
    const si = d.server_info || d.serverInfo || {};
    const server = d.server || d.server_ip || d.ip || d.connect || (si.ip ? si.ip + (si.port ? ":" + si.port : "") : null) || null;
    return {
      id: d.id,
      server: typeof server === "string" ? server : null,
      team1: d.members?.[0] || [],
      team2: d.members?.[1] || [],
      playerData: d.members_data || {},
      mapState: {
        banned_maps: mp.banned_maps || [],
        remaining_maps: mp.remaining_maps || [],
        current_team: mp.current_team,
        finished: !!mp.finished,
        picked_map: mp.picked_map || mp.map || null
      },
      myId: findMyId(fiber)
    };
  }
  function readPartyData(fiber) {
    return searchValue(fiber, v => {
      const t = v.group || v.teamData || v.lobbyData || v.lobby || v.party || v.team;
      if (!t || typeof t !== "object") return null;
      const members = t.members || t.players || t.users;
      if (!Array.isArray(members)) return null;
      return {
        size: members.length,
        name: typeof t.name === "string" ? t.name : null
      };
    });
  }
  function findGroupCtx(fiber) {
    return searchValue(fiber, v => v && typeof v.leaveGroup === "function" && "group" in v ? v : null);
  }
  let soloSince = 0;
  let leaveCooldown = 0;
  function maybeAutoLeaveSolo(fiber) {
    if (document.visibilityState !== "visible") {
      soloSince = 0;
      return;
    }
    const ctx = findGroupCtx(fiber);
    const g = ctx && ctx.group;
    if (!g || !Array.isArray(g.members)) {
      soloSince = 0;
      return;
    }
    const inQueue = !!(ctx.queueState && ctx.queueState.channel);
    const pending = (g.invited || []).filter(id => !g.members.includes(id));
    const solo = g.members.length <= 1 && pending.length === 0 && !inQueue;
    const now = Date.now();
    if (!solo) {
      soloSince = 0;
      return;
    }
    if (!soloSince) {
      soloSince = now;
      return;
    }
    if (now - soloSince < 12e3 || now < leaveCooldown) return;
    leaveCooldown = now + 3e4;
    soloSince = 0;
    try {
      ctx.leaveGroup();
    } catch {}
  }
  let myIdSent = false;
  let hadParty = false;
  function emit() {
    const fiber = findRootFiber();
    if (!fiber) return;
    const myId = findMyId(fiber);
    if (myId && !myIdSent) {
      myIdSent = true;
      window.dispatchEvent(new CustomEvent("csrp:myid", {
        detail: {
          myId
        }
      }));
    }
    const data = readMatchData(fiber);
    if (data) {
      window.dispatchEvent(new CustomEvent("csrp:matchdata", {
        detail: data
      }));
    }
    try {
      maybeAutoLeaveSolo(fiber);
    } catch {}
    try {
      const qc = findGroupCtx(fiber);
      if (qc) window.dispatchEvent(new CustomEvent("csrp:queuedata", {
        detail: {
          inQueue: !!(qc.queueState && qc.queueState.channel),
          accepted: !!(qc.queueState && qc.queueState.accepted)
        }
      }));
    } catch {}
    const party = readPartyData(fiber);
    if (party) {
      hadParty = party.size >= 2;
      window.dispatchEvent(new CustomEvent("csrp:partydata", {
        detail: party
      }));
    } else if (hadParty) {
      hadParty = false;
      window.dispatchEvent(new CustomEvent("csrp:partydata", {
        detail: {
          size: 1,
          name: null,
          cleared: true
        }
      }));
    }
  }
  function hookSocket() {
    const fiber = findRootFiber();
    if (!fiber) return false;
    const ctx = searchValue(fiber, v => v.socket ? v : null);
    if (!ctx || !ctx.socket || ctx.socket.__csrp) return false;
    ctx.socket.__csrp = true;
    const orig = ctx.socket.decode;
    ctx.socket.decode = function(data, cb) {
      return orig.call(this, data, ev => {
        cb(ev);
        if (ev && ev.topic && (ev.topic.startsWith("match:") || String(ev.event).includes("match") || String(ev.event).includes("map"))) {
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
    if (ok && myIdSent || ++tries > 40) clearInterval(boot);
  }, 500);
  window.addEventListener("csrp:pull", emit);
})();
