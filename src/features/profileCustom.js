(() => {
  "use strict";
  const CSRP = window.CSRP = window.CSRP || {};
  const {h} = CSRP.dom;
  const KEY = "csrpCustom";
  let localCfg = null;
  let cfg = null;
  let myId = null;
  chrome.storage.local.get([ KEY, "csrpMyId" ], d => {
    localCfg = d[KEY] || null;
    myId = d.csrpMyId ? String(d.csrpMyId) : null;
  });
  chrome.storage.onChanged.addListener((c, area) => {
    if (area !== "local") return;
    if (c[KEY]) {
      localCfg = c[KEY].newValue || null;
      sharedCache.clear();
      cleanup();
    }
    if (c.csrpMyId) myId = c.csrpMyId.newValue ? String(c.csrpMyId.newValue) : null;
  });
  const hideBanners = () => CSRP.store.get("hideBanners") === true;
  const sharedCache = new Map;
  const SHARED_TTL = 5 * 60 * 1e3;
  let pendingIds = new Set;
  let fetchScheduled = false;
  function pubToCfg(p) {
    if (!p) return null;
    return {
      enabled: true,
      tier: p.tier || "free",
      accent: p.accent,
      accent2: p.accent2,
      nameStyle: p.nameStyle || "none",
      cardFlair: p.cardFlair || "none",
      avatarFrame: p.avatarFrame || "none",
      chip: p.chip || "",
      chipStyle: p.chipStyle || "outline",
      kanji: p.kanji || "",
      banner: p.banner || null,
      bannerOn: !!p.banner,
      bannerKind: p.bannerKind || "static",
      bannerMime: p.bannerMime || null,
      bannerBlur: 0,
      bannerDim: p.bannerDim ?? 30,
      fillMode: p.fillMode || "blur",
      fillColor: p.fillColor || null,
      surf: p.surf || null,
      animName: p.animName || "none",
      animAvatar: p.animAvatar || "none",
      overlay: p.overlay || "none",
      overlays: Array.isArray(p.overlays) ? p.overlays : null,
      fxColor: p.fxColor || null,
      fxColor2: p.fxColor2 || null
    };
  }
  const nameIds = new Map;
  let pendingNames = new Set;
  let nameFetchScheduled = false;
  function matchDataNameId(nameLower) {
    const md = CSRP._matchData;
    if (!md || !md.playerData) return null;
    for (const [id, v] of Object.entries(md.playerData)) {
      const n = v && (v.name || v.username || v.display_name);
      if (n && String(n).trim().toLowerCase() === nameLower) return String(id);
    }
    return null;
  }
  function scheduleNameFetch() {
    if (nameFetchScheduled) return;
    nameFetchScheduled = true;
    setTimeout(async () => {
      nameFetchScheduled = false;
      const names = [ ...pendingNames ];
      pendingNames.clear();
      if (!names.length || !CSRP.pro || !CSRP.pro.lookupNames) return;
      try {
        const ids = await CSRP.pro.lookupNames(names);
        for (const n of names) nameIds.set(n, ids[n] || null);
      } catch {
        for (const n of names) nameIds.set(n, null);
      }
    }, 80);
  }
  function idForName(name) {
    const n = String(name || "").trim().toLowerCase();
    if (!n || n === "anonymous") return null;
    const fromMatch = matchDataNameId(n);
    if (fromMatch) return fromMatch;
    if (nameIds.has(n)) return nameIds.get(n);
    pendingNames.add(n);
    scheduleNameFetch();
    return null;
  }
  function idForSlot(slot) {
    const nameEl = slot && slot.querySelector("span");
    return nameEl ? idForName(nameEl.textContent) : null;
  }
  function scheduleFetch() {
    if (fetchScheduled) return;
    fetchScheduled = true;
    setTimeout(async () => {
      fetchScheduled = false;
      const ids = [ ...pendingIds ];
      pendingIds.clear();
      if (!ids.length || !CSRP.pro) return;
      try {
        const profiles = await CSRP.pro.getPublicProfiles(ids);
        const now = Date.now();
        for (const id of ids) sharedCache.set(id, {
          t: now,
          cfg: pubToCfg(profiles[id])
        });
      } catch {
        for (const id of ids) sharedCache.set(id, {
          t: Date.now(),
          cfg: null
        });
      }
    }, 60);
  }
  const TIER_RANK = {
    free: 0,
    pro: 1,
    premium: 2
  };
  function gateLocalCfg(c, tier) {
    if (!c) return c;
    const out = {
      ...c,
      tier
    };
    if (TIER_RANK[tier] < TIER_RANK.pro) {
      out.banner = null;
      out.bannerOn = false;
    }
    if (tier !== "premium") {
      if (out.animName && out.animName !== "none") out.animName = "none";
      if (out.animAvatar && out.animAvatar !== "none") out.animAvatar = "none";
      if (out.overlay && out.overlay !== "none") out.overlay = "none";
      if (Array.isArray(out.overlays) && out.overlays.length) out.overlays = [];
      if ([ "rainbow", "glitch", "metal" ].includes(out.nameStyle)) out.nameStyle = "gradient";
      if ([ "holo", "aurora" ].includes(out.cardFlair)) out.cardFlair = "ring";
      if ([ "hex", "glow" ].includes(out.avatarFrame)) out.avatarFrame = "ring";
      if (out.fillMode === "color") out.fillMode = "blur";
    }
    return out;
  }
  function cfgForId(id) {
    if (myId && id === myId) {
      const e = sharedCache.get(id);
      const tier = e && e.cfg ? e.cfg.tier : e ? "free" : undefined;
      if (tier === undefined) {
        pendingIds.add(id);
        scheduleFetch();
      }
      if (!localCfg) return tier && tier !== "free" ? {
        enabled: true,
        tier,
        __own: true
      } : undefined;
      return {
        ...gateLocalCfg(localCfg, tier || localCfg.tier || "free"),
        __own: true
      };
    }
    const e = sharedCache.get(id);
    if (e && Date.now() - e.t < SHARED_TTL) return e.cfg || undefined;
    pendingIds.add(id);
    scheduleFetch();
    return undefined;
  }
  function tierBadge(el) {
    if (!el) return;
    const host = el.parentElement || el;
    host.querySelectorAll(":scope > .csrp-tier-badge").forEach(b => b.remove());
    el.querySelectorAll?.(":scope > .csrp-tier-badge").forEach(b => b.remove());
    el.classList.remove("csrp-has-badge");
  }
  function profileEloAnchor(hdr) {
    const lvlImg = hdr.querySelector('img[src*="/level/"], img[alt="rank"]');
    if (lvlImg && lvlImg.closest("div")) return lvlImg.closest("div");
    const eloEl = [ ...hdr.querySelectorAll("div, span, p") ].filter(el => /\bELO\b/i.test(el.textContent) && el.children.length <= 2).sort((a, b) => a.textContent.length - b.textContent.length)[0];
    if (eloEl) return eloEl;
    return hdr.querySelector("p.truncate");
  }
  function withCfg(c, fn) {
    const prev = cfg;
    cfg = c;
    try {
      fn();
    } finally {
      cfg = prev;
    }
  }
  const NAME_STYLES = [ "gradient", "glow", "metal", "rainbow", "glitch", "outline" ];
  const FLAIRS = [ "ring", "corners", "scanline", "holo", "kanji", "aurora" ];
  const AV_FRAMES = [ "ring", "hex", "glow" ];
  const ANIM_NAMES = [ "shimmer", "pulse", "wave", "flicker", "breathe", "glitchpop" ];
  const ANIM_AVS = [ "spin", "orbit", "halo", "sonar", "prism" ];
  const OVERLAYS = [ "particles", "sweep", "rain", "snow", "embers", "stars", "grid", "bokeh", "storm" ];
  const STAT_LABELS = new Set([ "matches", "wins", "winrate", "kills", "deaths", "kdr", "avg", "elo" ]);
  function active() {
    return CSRP.store.get("masterEnabled") !== false && (!!localCfg || !!CSRP.pro);
  }
  function surf(key) {
    const s = cfg.surf && cfg.surf[key];
    if (s) return {
      on: !!s.on,
      x: s.x ?? 50,
      y: s.y ?? 50,
      scale: s.scale || 1,
      rot: s.rot || 0
    };
    return {
      on: key === "profile" ? cfg.bannerOn !== false : !!cfg.cardBanner,
      x: cfg.bannerX ?? 50,
      y: cfg.bannerY ?? 50,
      scale: cfg.bannerScale || 1,
      rot: 0
    };
  }
  const bannerActive = key => (cfg.__own || !hideBanners()) && !!(cfg.banner && cfg.bannerOn !== false && surf(key).on);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function layoutBannerImg(layer, img, s) {
    const iw = img.naturalWidth || img.videoWidth, ih = img.naturalHeight || img.videoHeight;
    const W = layer.clientWidth, H = layer.clientHeight;
    if (!iw || !ih || !W || !H) return;
    const zoom = clamp(+s.scale || 1, .1, 3);
    const sc = Math.max(W / iw, H / ih) * zoom;
    const dw = iw * sc, dh = ih * sc;
    const left = (W - dw) * s.x / 100, top = (H - dh) * s.y / 100;
    img.style.width = dw + "px";
    img.style.height = dh + "px";
    img.style.left = left + "px";
    img.style.top = top + "px";
    const rot = +s.rot || 0;
    if (rot) {
      img.style.transformOrigin = `${W / 2 - left}px ${H / 2 - top}px`;
      img.style.transform = `rotate(${rot}deg)`;
    } else {
      img.style.transform = "";
      img.style.transformOrigin = "";
    }
  }
  function setBannerTextContrast(layer, img, key) {
    const host = layer.parentElement;
    const contrastKey = `${key}:${cfg.bannerDim ?? 30}:${img.dataset.src || img.src}`;
    if (host._csrpBannerContrastKey === contrastKey) return;
    host._csrpBannerContrastKey = contrastKey;
    const canvas = document.createElement("canvas");
    const size = 32;
    canvas.width = size;
    canvas.height = size;
    try {
      const context = canvas.getContext("2d", {
        willReadFrequently: true
      });
      context.drawImage(img, 0, 0, size, size);
      const pixels = context.getImageData(0, 0, size, size).data;
      let luminance = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        luminance += .2126 * pixels[index] + .7152 * pixels[index + 1] + .0722 * pixels[index + 2];
      }
      const dim = Math.min(.85, (cfg.bannerDim ?? 30) / 100 + (key === "profile" ? 0 : .3));
      const isDark = luminance / (pixels.length / 4) * (1 - dim) < 128;
      host.style.setProperty("--pc-banner-fg", isDark ? "#f8fafc" : "#111827");
      host.style.setProperty("--pc-banner-label", isDark ? "rgba(248, 250, 252, 0.72)" : "rgba(17, 24, 39, 0.72)");
      host.style.setProperty("--pc-banner-shadow", isDark ? "rgba(0, 0, 0, 0.8)" : "rgba(255, 255, 255, 0.8)");
    } catch {}
    host.querySelectorAll("p, span, small, i").forEach(element => {
      element.classList.toggle("csrp-pc-stat-label", STAT_LABELS.has(element.textContent.trim().toLowerCase()));
    });
    host.querySelectorAll("b, strong, p, span").forEach(element => {
      const value = element.textContent.trim();
      element.classList.toggle("csrp-pc-stat-value", /^(?:[\d,.]+%?|[+-]?\d+(?:\.\d+)?(?:\s*(?:elo|kdr|avg))?)$/i.test(value));
    });
  }
  const observers = new Set;
  const visObservers = new Set;
  function observeLayer(layer, key) {
    const ownCfg = cfg;
    layer._csrpOwnCfg = ownCfg;
    if (layer._csrpRo) return;
    const ro = new ResizeObserver(() => {
      const oc = layer._csrpOwnCfg;
      if (!oc) return;
      const el = layer.querySelector(".csrp-pc-bimg");
      if (el) withCfg(oc, () => layoutBannerImg(layer, el, surf(key)));
    });
    ro.observe(layer);
    layer._csrpRo = ro;
    observers.add(ro);
  }
  function observeVisibility(layer, video) {
    if (layer._csrpVo) return;
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) video.play().catch(() => {}); else video.pause();
      }
    }, {
      threshold: .1
    });
    io.observe(layer);
    layer._csrpVo = io;
    visObservers.add(io);
  }
  const isAnim = () => cfg.bannerKind === "anim" && /webm|mp4/.test(cfg.bannerMime || "");
  function applyBanner(layer, key) {
    const s = surf(key);
    observeLayer(layer, key);
    let fill = layer.querySelector("img.csrp-pc-bfill");
    let img = layer.querySelector(".csrp-pc-bimg");
    const wantVideo = isAnim();
    if (img && (wantVideo && img.tagName !== "VIDEO" || !wantVideo && img.tagName !== "IMG")) {
      if (img._csrpVo) {
        img._csrpVo.disconnect?.();
      }
      img.remove();
      img = null;
    }
    if (cfg.fillMode === "color") {
      if (fill) fill.remove();
      layer.style.background = cfg.fillColor || "#0b0b10";
    } else {
      if (!fill) {
        fill = h("img", {
          class: "csrp-pc-bfill",
          alt: ""
        });
        layer.prepend(fill);
      }
      layer.style.background = "";
    }
    if (!img) {
      const ownCfg = cfg;
      const onReady = () => withCfg(ownCfg, () => {
        layoutBannerImg(layer, img, surf(key));
        setBannerTextContrast(layer, img, key);
      });
      if (wantVideo) {
        img = h("video", {
          class: "csrp-pc-bimg",
          muted: "true",
          loop: "true",
          playsinline: "true",
          preload: "metadata"
        });
        img.muted = true;
        img.addEventListener("loadeddata", onReady);
      } else {
        img = h("img", {
          class: "csrp-pc-bimg",
          alt: ""
        });
        img.addEventListener("load", onReady);
      }
      layer.appendChild(img);
    }
    if (img.dataset.src !== cfg.banner) {
      img.src = cfg.banner;
      img.dataset.src = cfg.banner;
      if (wantVideo) {
        img.load?.();
        observeVisibility(layer, img);
      }
      if (fill) fill.src = wantVideo ? "" : cfg.banner;
    } else if (fill && !wantVideo && fill.dataset.src !== cfg.banner) {
      fill.src = cfg.banner;
      fill.dataset.src = cfg.banner;
    }
    img.style.filter = cfg.bannerBlur ? `blur(${cfg.bannerBlur}px)` : "";
    layoutBannerImg(layer, img, s);
    if (img.complete || img.readyState >= 2) setBannerTextContrast(layer, img, key);
  }
  function ensureCardBanner(card, key) {
    let bn = card.querySelector(":scope > .csrp-pc-banner");
    if (bannerActive(key)) {
      if (!bn) {
        bn = h("div", {
          class: "csrp-pc-banner csrp-pc-cardbn",
          "aria-hidden": "true"
        });
        if (getComputedStyle(card).position === "static") card.style.position = "relative";
        card.prepend(bn);
      }
      card.classList.add("csrp-pc-hasbn");
      applyBanner(bn, key);
      card.style.setProperty("--pcdim", Math.min(.85, (cfg.bannerDim ?? 30) / 100 + .3).toFixed(2));
    } else {
      if (bn) bn.remove();
      card.classList.remove("csrp-pc-hasbn");
    }
  }
  function setVars(el) {
    el.style.setProperty("--pc1", cfg.accent || "#e23a45");
    el.style.setProperty("--pc2", cfg.accent2 || "#8fb4ff");
    if (cfg.fxColor) el.style.setProperty("--fx1", cfg.fxColor); else el.style.removeProperty("--fx1");
    if (cfg.fxColor2) el.style.setProperty("--fx2", cfg.fxColor2); else el.style.removeProperty("--fx2");
  }
  function styleName(el) {
    if (!el) return;
    for (const s of NAME_STYLES) el.classList.remove("csrp-pcn-" + s);
    for (const s of ANIM_NAMES) el.classList.remove("csrp-anim-name-" + s);
    if (cfg.nameStyle && cfg.nameStyle !== "none" && cfg.nameStyle !== "glow") {
      setVars(el);
      el.classList.add("csrp-pcn-" + cfg.nameStyle);
    }
    if (cfg.animName && cfg.animName !== "none") {
      setVars(el);
      el.classList.add("csrp-anim-name-" + cfg.animName);
    }
  }
  function styleAvatar(img) {
    if (!img) return;
    for (const s of AV_FRAMES) img.classList.remove("csrp-pca-" + s);
    for (const s of ANIM_AVS) img.classList.remove("csrp-anim-av-" + s);
    if (cfg.avatarFrame && cfg.avatarFrame !== "none") {
      setVars(img);
      img.classList.add("csrp-pca-" + cfg.avatarFrame);
    }
    if (cfg.animAvatar && cfg.animAvatar !== "none") {
      setVars(img);
      img.classList.add("csrp-anim-av-" + cfg.animAvatar);
    }
  }
  function activeOverlays() {
    if (Array.isArray(cfg.overlays) && cfg.overlays.length) {
      return cfg.overlays.filter(o => OVERLAYS.includes(o)).slice(0, 3);
    }
    return cfg.overlay && cfg.overlay !== "none" ? [ cfg.overlay ] : [];
  }
  function ensureOverlay(el) {
    setVars(el);
    const want = activeOverlays();
    for (const o of OVERLAYS) el.classList.remove("csrp-ov-" + o);
    const layers = el.querySelectorAll(":scope > .csrp-pc-overlay");
    if (!want.length) {
      layers.forEach(l => l.remove());
      return;
    }
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    const have = new Map;
    layers.forEach(l => {
      const k = l.dataset.ov;
      if (k && want.includes(k) && !have.has(k)) have.set(k, l); else l.remove();
    });
    for (const o of want) {
      el.classList.add("csrp-ov-" + o);
      if (!have.has(o)) {
        const ov = h("div", {
          class: "csrp-pc-overlay csrp-ovl-" + o,
          "aria-hidden": "true",
          "data-ov": o
        });
        el.appendChild(ov);
      }
    }
  }
  function styleCard(card, key) {
    setVars(card);
    card.classList.add("csrp-pc-card");
    for (const f of FLAIRS) card.classList.toggle("csrp-pcf-" + f, cfg.cardFlair === f);
    let fx = card.querySelector(":scope > .csrp-pc-fx");
    if (cfg.cardFlair && cfg.cardFlair !== "none") {
      if (!fx) {
        fx = h("div", {
          class: "csrp-pc-fx",
          "aria-hidden": "true"
        });
        if (getComputedStyle(card).position === "static") card.style.position = "relative";
        card.appendChild(fx);
      }
      fx.dataset.kanji = cfg.kanji || "東京";
    } else if (fx) fx.remove();
    ensureOverlay(card);
    ensureCardBanner(card, key);
  }
  function ensureChip(anchor, mode) {
    if (!anchor) return;
    let chip = anchor.querySelector(":scope .csrp-pc-chip");
    if (!cfg.chip) {
      if (chip) chip.remove();
      return;
    }
    if (!chip) {
      chip = h("span", {
        class: "csrp-pc-chip"
      });
      anchor.appendChild(chip);
    }
    chip.textContent = cfg.chip;
    setVars(chip);
    chip.className = "csrp-pc-chip csrp-pcc-" + (cfg.chipStyle || "outline") + (mode === "block" ? " csrp-pc-chip-block" : "");
  }
  const onFriendsPage = () => /friend/i.test(location.pathname);
  function tickProfileHeader() {
    if (onFriendsPage()) return;
    for (const img of document.querySelectorAll('img[width="76"], img.mr-2')) {
      const urlId = (location.pathname.match(/\/user\/(\d{15,21})/) || [])[1] || null;
      const id = CSRP.dom.idFromAvatar(img) || urlId;
      if (!id) continue;
      const c = cfgForId(id);
      if (!c || c.enabled === false) continue;
      const hdr = img.closest(".justify-between") || img.closest(".flex.flex-row");
      if (!hdr) continue;
      withCfg(c, () => {
        hdr.classList.add("csrp-pc-hdr");
        setVars(hdr);
        let bn = hdr.querySelector(":scope > .csrp-pc-banner");
        if (bannerActive("profile")) {
          if (!bn) {
            bn = h("div", {
              class: "csrp-pc-banner",
              "aria-hidden": "true"
            });
            hdr.prepend(bn);
          }
          applyBanner(bn, "profile");
          hdr.style.setProperty("--pcdim", ((cfg.bannerDim ?? 30) / 100).toFixed(2));
        } else if (bn) bn.remove();
        styleName(hdr.querySelector("p.truncate"));
        styleAvatar(img);
        ensureOverlay(hdr);
        ensureChip(hdr.querySelector(".flex.items-center.gap-2"));
        const eloAnchor = profileEloAnchor(hdr);
        hdr.querySelectorAll(".csrp-tier-badge").forEach(b => {
          if (b.previousElementSibling !== eloAnchor) b.remove();
        });
        tierBadge(eloAnchor, cfg.tier);
      });
      return;
    }
  }
  function tickCards() {
    for (const card of CSRP.dom.findCards()) {
      const info = CSRP.dom.parseCard(card);
      if (!info.id) info.id = idForName(info.name);
      if (!info.id) continue;
      const c = cfgForId(info.id);
      if (!c || c.enabled === false) {
        unstyleCard(card);
        continue;
      }
      withCfg(c, () => {
        styleCard(card, "card");
        styleName(card.querySelector("h1"));
        styleAvatar(info.avatar);
        ensureChip(info.header);
        const eloEl = card.querySelector("p.text-theme-primary-light");
        card.querySelectorAll(".csrp-tier-badge").forEach(b => {
          const okInline = eloEl && b.parentElement === eloEl;
          const okBlock = !eloEl && b.previousElementSibling === card.querySelector("h1");
          if (!okInline && !okBlock) b.remove();
        });
        tierBadge(eloEl || card.querySelector("h1"), cfg.tier, eloEl ? "inline" : undefined);
      });
    }
  }
  const LOBBY_AV = 'img[alt="Avatar"][width="72"]';
  function tickLobby() {
    for (const img of document.querySelectorAll("div.rounded-2xl " + LOBBY_AV)) {
      const slot = img.closest("div.rounded-2xl");
      if (!slot) continue;
      const id = CSRP.dom.idFromAvatar(img) || idForSlot(slot);
      const c = id ? cfgForId(id) : null;
      if (!c || c.enabled === false) {
        if (slot.classList.contains("csrp-pc-card")) unstyleCard(slot);
        continue;
      }
      withCfg(c, () => {
        styleCard(slot, "lobby");
        const nameEl = slot.querySelector(".flex.items-center.gap-1\\.5 > span, span");
        styleName(nameEl);
        styleAvatar(img);
        const eloEl = [ ...slot.querySelectorAll("div, span, p") ].filter(el => /\bELO\b/i.test(el.textContent) && el.childElementCount <= 2 && el.textContent.trim().length <= 16).sort((a, b) => a.textContent.length - b.textContent.length)[0];
        const chipHost = eloEl && eloEl.parentElement || nameEl && nameEl.parentElement;
        ensureChip(chipHost, "block");
        const anchor = eloEl || nameEl;
        slot.querySelectorAll(".csrp-tier-badge").forEach(b => {
          if (b.previousElementSibling !== anchor) b.remove();
        });
        tierBadge(anchor, cfg.tier, "center");
      });
    }
  }
  function unstyleCard(n) {
    n.querySelectorAll(":scope > .csrp-pc-banner, :scope > .csrp-pc-fx, :scope > .csrp-pc-overlay, .csrp-pc-chip, .csrp-tier-badge").forEach(x => x.remove());
    n.querySelectorAll(".csrp-has-badge").forEach(x => x.classList.remove("csrp-has-badge"));
    n.classList.remove("csrp-pc-card", "csrp-pc-hasbn");
    for (const o of OVERLAYS) n.classList.remove("csrp-ov-" + o);
    for (const f of FLAIRS) n.classList.remove("csrp-pcf-" + f);
    n.querySelectorAll('[class*="csrp-pca-"]').forEach(a => {
      for (const s of AV_FRAMES) a.classList.remove("csrp-pca-" + s);
    });
    n.querySelectorAll(".csrp-pc-stat-label, .csrp-pc-stat-value").forEach(x => {
      x.classList.remove("csrp-pc-stat-label", "csrp-pc-stat-value");
    });
  }
  function cleanup() {
    observers.forEach(ro => ro.disconnect());
    observers.clear();
    visObservers.forEach(io => io.disconnect());
    visObservers.clear();
    document.querySelectorAll(".csrp-pc-banner, .csrp-pc-fx, .csrp-pc-overlay, .csrp-pc-chip, .csrp-tier-badge").forEach(n => {
      if (n._csrpRo) delete n._csrpRo;
      if (n._csrpVo) delete n._csrpVo;
      n.remove();
    });
    document.querySelectorAll(".csrp-has-badge").forEach(n => n.classList.remove("csrp-has-badge"));
    document.querySelectorAll(".csrp-pc-card, .csrp-pc-hdr").forEach(n => {
      n.classList.remove("csrp-pc-card", "csrp-pc-hdr", "csrp-pc-hasbn");
      for (const f of FLAIRS) n.classList.remove("csrp-pcf-" + f);
      for (const o of OVERLAYS) n.classList.remove("csrp-ov-" + o);
    });
    document.querySelectorAll('[class*="csrp-pcn-"], [class*="csrp-pca-"], [class*="csrp-anim-"]').forEach(n => {
      for (const s of NAME_STYLES) n.classList.remove("csrp-pcn-" + s);
      for (const s of AV_FRAMES) n.classList.remove("csrp-pca-" + s);
      for (const s of ANIM_NAMES) n.classList.remove("csrp-anim-name-" + s);
      for (const s of ANIM_AVS) n.classList.remove("csrp-anim-av-" + s);
    });
    document.querySelectorAll(".csrp-pc-stat-label, .csrp-pc-stat-value").forEach(n => {
      n.classList.remove("csrp-pc-stat-label", "csrp-pc-stat-value");
    });
  }
  function tick() {
    if (!active()) {
      cleanup();
      return;
    }
    try {
      tickProfileHeader();
    } catch {}
    try {
      tickCards();
    } catch {}
    try {
      tickLobby();
    } catch {}
  }
  CSRP.profileCustom = {
    tick,
    cleanup,
    idForSlot,
    idForName
  };
})();
