(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const KEY = "csrpCustom";
  const SURFACES = [ "profile", "card", "lobby" ];
  const ZOOM_MIN = .1, ZOOM_MAX = 3;
  const DEFAULTS = {
    enabled: true,
    banner: null,
    bannerOn: true,
    bannerBlur: 0,
    bannerDim: 30,
    fillMode: "blur",
    fillColor: "#0b0b12",
    surf: {
      profile: {
        on: true,
        x: 50,
        y: 50,
        scale: 1,
        rot: 0
      },
      card: {
        on: false,
        x: 50,
        y: 50,
        scale: 1,
        rot: 0
      },
      lobby: {
        on: false,
        x: 50,
        y: 50,
        scale: 1,
        rot: 0
      }
    },
    accent: "#e23a45",
    accent2: "#8fb4ff",
    nameStyle: "gradient",
    cardFlair: "ring",
    avatarFrame: "ring",
    kanji: "東京",
    chip: "",
    chipStyle: "gradient",
    animName: "none",
    animAvatar: "none",
    overlay: "none",
    overlays: [],
    fxColor: null,
    fxColor2: null
  };
  const OVERLAY_VALUES = [ "particles", "sweep", "rain", "snow", "embers", "stars", "grid", "bokeh", "storm" ];
  const MAX_OVERLAYS = 3;
  const PRESETS = {
    Tokyo: {
      accent: "#ff2a55",
      accent2: "#26c6ff",
      nameStyle: "gradient",
      cardFlair: "kanji",
      avatarFrame: "ring",
      kanji: "東京",
      chipStyle: "gradient"
    },
    Crimson: {
      accent: "#e23a45",
      accent2: "#7a1218",
      nameStyle: "outline",
      cardFlair: "ring",
      avatarFrame: "glow",
      chipStyle: "solid"
    },
    Arctic: {
      accent: "#8fd8ff",
      accent2: "#4a6cff",
      nameStyle: "gradient",
      cardFlair: "holo",
      avatarFrame: "hex",
      chipStyle: "outline"
    },
    Gold: {
      accent: "#ffcf5e",
      accent2: "#a86514",
      nameStyle: "metal",
      cardFlair: "corners",
      avatarFrame: "ring",
      chipStyle: "solid"
    },
    Matrix: {
      accent: "#41ff6a",
      accent2: "#0d5e22",
      nameStyle: "outline",
      cardFlair: "scanline",
      avatarFrame: "none",
      chipStyle: "outline"
    },
    Vapor: {
      accent: "#ff71ce",
      accent2: "#01cdfe",
      nameStyle: "rainbow",
      cardFlair: "aurora",
      avatarFrame: "glow",
      chipStyle: "gradient"
    }
  };
  const SWATCHES = [ "#e23a45", "#ff2a55", "#ff7a1a", "#ffcf5e", "#7ee081", "#41ff6a", "#26c6ff", "#8fb4ff", "#4a6cff", "#b78cff", "#ff71ce", "#ffffff" ];
  let cfg = normalize({});
  let selSurf = "profile";
  let previewTier = "free";
  let saveTimer = null;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const clampPct = v => clamp(v, 0, 100);
  function normalize(c) {
    const out = {
      ...DEFAULTS,
      ...c
    };
    const s = c.surf || {};
    const legacy = {
      x: c.bannerX ?? 50,
      y: c.bannerY ?? 50,
      scale: c.bannerScale || 1
    };
    out.surf = {
      profile: {
        ...DEFAULTS.surf.profile,
        ...c.surf ? s.profile : {
          on: c.bannerOn !== false,
          ...legacy
        }
      },
      card: {
        ...DEFAULTS.surf.card,
        ...c.surf ? s.card : {
          on: !!c.cardBanner,
          ...legacy
        }
      },
      lobby: {
        ...DEFAULTS.surf.lobby,
        ...c.surf ? s.lobby : {
          on: !!c.cardBanner,
          ...legacy
        }
      }
    };
    if (out.nameStyle === "glow") out.nameStyle = "gradient";
    if (!Array.isArray(out.overlays)) out.overlays = [];
    const OV_ID = /^[a-z0-9_-]{2,24}$/;
    const okOv = o => typeof o === "string" && (OVERLAY_VALUES.includes(o) || OV_ID.test(o));
    out.overlays = [ ...new Set(out.overlays.filter(okOv)) ].slice(0, MAX_OVERLAYS);
    if (!out.overlays.length && out.overlay && out.overlay !== "none" && okOv(out.overlay)) {
      out.overlays = [ out.overlay ];
    }
    out.overlay = "none";
    delete out.bannerX;
    delete out.bannerY;
    delete out.bannerScale;
    delete out.cardBanner;
    return out;
  }
  const surf = key => cfg.surf[key];
  const bannerActive = key => !!(cfg.banner && cfg.bannerOn && surf(key).on);
  const extStorage = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
  let dirty = false;
  function markDirty() {
    dirty = true;
    const btn = $("#btn-save");
    if (btn) btn.classList.add("dirty");
  }
  function clearDirty() {
    dirty = false;
    const btn = $("#btn-save");
    if (btn) btn.classList.remove("dirty");
  }
  const RANK = {
    free: 0,
    pro: 1,
    premium: 2
  };
  function usesPremiumCosmetic(c) {
    return PREMIUM_NAMES.includes(c.nameStyle) || PREMIUM_FLAIRS.includes(c.cardFlair) || PREMIUM_FRAMES.includes(c.avatarFrame) || PREMIUM_CHIPS.includes(c.chipStyle) || c.fillMode === "color" || c.animName && c.animName !== "none" || c.animAvatar && c.animAvatar !== "none" || c.overlay && c.overlay !== "none" || Array.isArray(c.overlays) && c.overlays.length > 0;
  }
  function freeCustomizationBody(c) {
    return {
      accent: c.accent,
      accent2: c.accent2,
      nameStyle: PREMIUM_NAMES.includes(c.nameStyle) ? "gradient" : c.nameStyle,
      cardFlair: PREMIUM_FLAIRS.includes(c.cardFlair) ? "ring" : c.cardFlair,
      avatarFrame: PREMIUM_FRAMES.includes(c.avatarFrame) ? "ring" : c.avatarFrame,
      chip: c.chip,
      chipStyle: PREMIUM_CHIPS.includes(c.chipStyle) ? "outline" : c.chipStyle,
      kanji: c.kanji,
      fillMode: "blur",
      animName: "none",
      animAvatar: "none",
      overlay: "none",
      overlays: [],
      bannerEnabled: false,
      bannerOn: false
    };
  }
  function fullCustomizationBody(c) {
    return {
      accent: c.accent,
      accent2: c.accent2,
      nameStyle: c.nameStyle,
      cardFlair: c.cardFlair,
      avatarFrame: c.avatarFrame,
      chip: c.chip,
      chipStyle: c.chipStyle,
      kanji: c.kanji,
      fillMode: c.fillMode,
      fillColor: c.fillColor,
      bannerBlur: c.bannerBlur,
      bannerDim: c.bannerDim,
      bannerOn: c.bannerOn,
      bannerEnabled: !!c.banner,
      surf: c.surf,
      animName: c.animName,
      animAvatar: c.animAvatar,
      overlay: c.overlay,
      overlays: Array.isArray(c.overlays) ? c.overlays.slice(0, MAX_OVERLAYS) : [],
      fxColor: c.fxColor || null,
      fxColor2: c.fxColor2 || null
    };
  }
  const upEl = () => ({
    overlay: $("#upload-overlay"),
    fill: $("#upload-fill"),
    step: $("#upload-step"),
    title: $("#upload-title")
  });
  function upShow(title) {
    const u = upEl();
    if (!u.overlay) return;
    if (u.title) u.title.textContent = title || "Publishing…";
    if (u.fill) {
      u.fill.classList.remove("indet");
      u.fill.style.width = "0%";
    }
    u.overlay.hidden = false;
  }
  function upSet(pct, step, indet) {
    const u = upEl();
    if (!u.overlay) return;
    if (u.step && step != null) u.step.textContent = step;
    if (u.fill) {
      if (indet) {
        u.fill.classList.add("indet");
        u.fill.style.width = "";
      } else {
        u.fill.classList.remove("indet");
        u.fill.style.width = Math.max(0, Math.min(100, pct)) + "%";
      }
    }
  }
  function upHide(delay) {
    const u = upEl();
    if (!u.overlay) return;
    setTimeout(() => {
      u.overlay.hidden = true;
    }, delay || 0);
  }
  function persistableCfg() {
    const big = typeof cfg.banner === "string" && /^data:video\//.test(cfg.banner) && cfg.banner.length > 24e5;
    if (!big) return cfg;
    const copy = {
      ...cfg,
      banner: null,
      _bannerCloudOnly: true
    };
    return copy;
  }
  async function saveNow() {
    if (extStorage) {
      await new Promise(r => chrome.storage.local.set({
        [KEY]: persistableCfg()
      }, r));
    } else {
      try {
        localStorage.setItem(KEY, JSON.stringify(persistableCfg()));
      } catch {}
      toast("Saved (preview only — open via the CSR+ popup to apply on the site)");
      clearDirty();
      return;
    }
    const token = await proToken().catch(() => null);
    if (!token) {
      toast("Saved locally · sign in to share your look with other players");
      clearDirty();
      return;
    }
    const wantsBanner = !!cfg.banner;
    const willUploadBanner = wantsBanner;
    upShow(willUploadBanner ? "Publishing banner" : "Publishing");
    upSet(15, "Saving your cosmetics…");
    const body = fullCustomizationBody(cfg);
    const custom = await pro("/me/customization", {
      token,
      method: "POST",
      body
    });
    let banner = {
      ok: true
    };
    if (willUploadBanner) {
      const isAnim = /^data:(video\/|image\/gif)/.test(cfg.banner) || /^data:image\/webp/.test(cfg.banner) && cfg._animated;
      const sizeMb = Math.round(cfg.banner.length * .75 / 1048576);
      upSet(45, `Uploading ${isAnim ? "video" : "image"}${sizeMb ? ` (~${sizeMb} MB)` : ""}…`);
      upSet(0, null, true);
      banner = isAnim ? await pro("/me/banner/animated", {
        token,
        method: "POST",
        body: {
          media: cfg.banner
        },
        timeoutMs: 18e4
      }) : await pro("/me/banner", {
        token,
        method: "POST",
        body: {
          image: cfg.banner
        },
        timeoutMs: 9e4
      });
      upSet(90, banner.ok ? "Moderating & finishing…" : "Upload failed");
    }
    clearDirty();
    upSet(100, custom.ok && banner.ok ? "Done" : "Finished with errors");
    upHide(600);
    if (!custom.ok) {
      toast(custom.data && custom.data.error || "Saved locally; publish failed");
      return;
    }
    if (!banner.ok) {
      toast(banner.data && banner.data.error || "Cosmetics published; banner upload failed");
      return;
    }
    toast("Saved & published — visible to CSR+ users");
  }
  function save() {
    markDirty();
  }
  function load(cb) {
    if (extStorage) {
      chrome.storage.local.get([ KEY, "csrpMyId" ], d => {
        cfg = normalize(d[KEY] || {});
        cb(d.csrpMyId || null);
      });
    } else {
      try {
        cfg = normalize(JSON.parse(localStorage.getItem(KEY)) || {});
      } catch {}
      cb(null);
    }
  }
  let toastTimer = null;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.hidden = true, 1400);
  }
  function confirmDialog({title, body, okLabel = "Confirm", danger = false}) {
    return new Promise(resolve => {
      const back = document.createElement("div");
      back.className = "confirm-back";
      back.innerHTML = `<div class="confirm-box" role="dialog" aria-modal="true">\n          <div class="confirm-title"></div>\n          <div class="confirm-body"></div>\n          <div class="confirm-actions">\n            <button class="btn ghost sm confirm-cancel">Cancel</button>\n            <button class="btn sm confirm-ok${danger ? " danger" : ""}"></button>\n          </div>\n        </div>`;
      back.querySelector(".confirm-title").textContent = title || "";
      back.querySelector(".confirm-body").textContent = body || "";
      back.querySelector(".confirm-ok").textContent = okLabel;
      const close = v => {
        back.remove();
        document.removeEventListener("keydown", onKey);
        resolve(v);
      };
      const onKey = e => {
        if (e.key === "Escape") close(false);
        if (e.key === "Enter") close(true);
      };
      back.querySelector(".confirm-cancel").addEventListener("click", () => close(false));
      back.querySelector(".confirm-ok").addEventListener("click", () => close(true));
      back.addEventListener("click", e => {
        if (e.target === back) close(false);
      });
      document.addEventListener("keydown", onKey);
      document.body.appendChild(back);
      requestAnimationFrame(() => back.classList.add("show"));
      back.querySelector(".confirm-ok").focus();
    });
  }
  let cfgCaps = {
    free: 20 * 1048576,
    pro: 20 * 1048576,
    premium: 40 * 1048576
  };
  (async () => {
    try {
      const r = await pro("/config");
      if (r && r.ok && r.data && r.data.bannerMaxBytes) cfgCaps = r.data.bannerMaxBytes;
    } catch {}
  })();
  function bannerCapBytes() {
    return cfgCaps[proTier] || cfgCaps.premium || 40 * 1048576;
  }
  const MAX_W = 1920, MAX_STORE = 24e5, MAX_ANIMATED_BYTES = 4e6;
  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader;
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not read file"));
      reader.readAsDataURL(file);
    });
  }
  function processBanner(file) {
    return new Promise((resolve, reject) => {
      const cap = bannerCapBytes();
      if (/^video\/(mp4|webm)$/.test(file.type)) {
        const vcap = Math.min(cap, 22 * 1048576);
        if (file.size > vcap) return reject(new Error(`Video too large — max ${Math.round(vcap / 1048576)} MB (server upload limit)`));
        readAsDataUrl(file).then(resolve).catch(reject);
        return;
      }
      if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return reject(new Error("PNG, JPG, WebP, GIF or MP4/WebM only"));
      if (file.type === "image/gif") {
        if (file.size > MAX_ANIMATED_BYTES) return reject(new Error("Animated GIFs must be 4 MB or smaller"));
        readAsDataUrl(file).then(resolve).catch(reject);
        return;
      }
      if (file.size > cap) return reject(new Error(`Max ${Math.round(cap / 1048576)} MB`));
      const img = new Image;
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, MAX_W / img.width);
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        let q = .9, out = c.toDataURL("image/webp", q);
        while (out.length > MAX_STORE && q > .4) {
          q -= .12;
          out = c.toDataURL("image/webp", q);
        }
        resolve(out);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not decode image"));
      };
      img.src = url;
    });
  }
  function layoutBannerImg(layer, img, s) {
    const iw = img.naturalWidth || img.videoWidth, ih = img.naturalHeight || img.videoHeight;
    const W = layer.clientWidth, H = layer.clientHeight;
    if (!iw || !ih || !W || !H) return;
    const zoom = clamp(+s.scale || 1, ZOOM_MIN, ZOOM_MAX);
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
    const contrastKey = `${key}:${cfg.bannerDim}:${img.dataset.src || img.src}`;
    if (host._bannerContrastKey === contrastKey) return;
    host._bannerContrastKey = contrastKey;
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
      const dim = Math.min(.85, cfg.bannerDim / 100 + (key === "profile" ? 0 : .3));
      const isDark = luminance / (pixels.length / 4) * (1 - dim) < 128;
      host.style.setProperty("--bn-text", isDark ? "#f8fafc" : "#111827");
      host.style.setProperty("--bn-label", isDark ? "rgba(248, 250, 252, 0.72)" : "rgba(17, 24, 39, 0.72)");
      host.style.setProperty("--bn-shadow", isDark ? "rgba(0, 0, 0, 0.8)" : "rgba(255, 255, 255, 0.8)");
    } catch {}
  }
  const isVideoBanner = () => /^data:video\//.test(cfg.banner || "");
  function bannerStyle(layer, key) {
    const s = surf(key);
    const wantVideo = isVideoBanner();
    let fill = layer.querySelector("img.pc-bfill");
    let img = layer.querySelector(".pc-bimg");
    if (img && (wantVideo && img.tagName !== "VIDEO" || !wantVideo && img.tagName !== "IMG")) {
      img.remove();
      img = null;
    }
    if (cfg.fillMode === "color" || wantVideo) {
      if (fill) fill.remove();
      layer.style.background = cfg.fillMode === "color" ? cfg.fillColor || "#0b0b12" : "#0b0b12";
    } else {
      if (!fill) {
        fill = document.createElement("img");
        fill.className = "pc-bfill";
        fill.alt = "";
        layer.prepend(fill);
      }
      layer.style.background = "";
    }
    if (!img) {
      if (wantVideo) {
        img = document.createElement("video");
        img.className = "pc-bimg";
        img.muted = true;
        img.loop = true;
        img.autoplay = true;
        img.playsInline = true;
        img.addEventListener("loadeddata", () => {
          layoutBannerImg(layer, img, surf(key));
          img.play().catch(() => {});
        });
      } else {
        img = document.createElement("img");
        img.className = "pc-bimg";
        img.alt = "";
        img.addEventListener("load", () => {
          layoutBannerImg(layer, img, surf(key));
          setBannerTextContrast(layer, img, key);
        });
      }
      layer.appendChild(img);
    }
    if (img.dataset.src !== cfg.banner) {
      img.src = cfg.banner;
      img.dataset.src = cfg.banner;
      if (wantVideo) {
        img.load?.();
        img.play?.().catch(() => {});
      }
    }
    if (fill && fill.dataset.src !== cfg.banner) {
      fill.src = cfg.banner;
      fill.dataset.src = cfg.banner;
    }
    img.style.filter = cfg.bannerBlur ? `blur(${cfg.bannerBlur}px)` : "";
    layoutBannerImg(layer, img, s);
    if (!wantVideo && img.complete) setBannerTextContrast(layer, img, key);
  }
  const layerOf = key => $("#bn-" + key);
  function layoutAll() {
    for (const key of SURFACES) {
      const layer = layerOf(key);
      const img = layer && layer.querySelector(".pc-bimg");
      if (img) layoutBannerImg(layer, img, surf(key));
    }
  }
  let rescaleQueued = false;
  function rescale() {
    rescaleQueued = false;
    $$(".real").forEach(holder => {
      const inner = holder.firstElementChild;
      if (!inner) return;
      const rw = +holder.dataset.rw || 1600;
      inner.style.width = rw + "px";
      const sc = Math.min(1, holder.clientWidth / rw);
      inner.style.transform = sc < 1 ? `scale(${sc})` : "";
      holder.style.height = Math.round(inner.offsetHeight * sc) + "px";
    });
    layoutAll();
  }
  function queueRescale() {
    if (rescaleQueued) return;
    rescaleQueued = true;
    requestAnimationFrame(rescale);
  }
  function paint() {
    document.documentElement.style.setProperty("--a1", cfg.accent);
    document.documentElement.style.setProperty("--a2", cfg.accent2);
    const de = document.documentElement.style;
    if (cfg.fxColor) de.setProperty("--fx1", cfg.fxColor); else de.removeProperty("--fx1");
    if (cfg.fxColor2) de.setProperty("--fx2", cfg.fxColor2); else de.removeProperty("--fx2");
    const fxRow = $("#fx-colors");
    if (fxRow) {
      const usingAccents = !cfg.fxColor && !cfg.fxColor2;
      fxRow.classList.toggle("using-accents", usingAccents);
      $("#fx-use-accents")?.classList.toggle("on", usingAccents);
      if ($("#c-fx1")) $("#c-fx1").value = cfg.fxColor || cfg.accent;
      if ($("#c-fx2")) $("#c-fx2").value = cfg.fxColor2 || cfg.accent2;
    }
    $("#c-enabled").checked = !!cfg.enabled;
    $("#c-banner-on").checked = !!cfg.bannerOn;
    $("#c-banner-blur").value = cfg.bannerBlur;
    $("#o-blur").textContent = cfg.bannerBlur;
    $("#c-banner-dim").value = cfg.bannerDim;
    $("#o-dim").textContent = cfg.bannerDim;
    $("#c-accent").value = cfg.accent;
    $("#o-accent").textContent = cfg.accent;
    $("#c-accent2").value = cfg.accent2;
    $("#o-accent2").textContent = cfg.accent2;
    $("#c-kanji").value = cfg.kanji;
    $("#c-chip").value = cfg.chip;
    $("#kanji-row").hidden = cfg.cardFlair !== "kanji";
    $("#btn-banner-remove").disabled = !cfg.banner;
    $("#c-fill-color").value = cfg.fillColor || "#0b0b12";
    $("#fill-color-row").hidden = cfg.fillMode !== "color";
    $$("#c-fill button").forEach(b => b.classList.toggle("on", b.dataset.v === (cfg.fillMode || "blur")));
    const sc = surf(selSurf);
    $$("#surf-tabs button").forEach(b => b.classList.toggle("on", b.dataset.surf === selSurf));
    $("#c-surf-on").checked = !!sc.on;
    $("#surf-on-lbl").textContent = "Show banner on " + (selSurf === "profile" ? "your profile page" : selSurf === "card" ? "your match-room card" : "your lobby slot");
    $("#c-sscale").value = sc.scale;
    $("#o-sscale").textContent = (+sc.scale || 1).toFixed(2) + "×";
    $("#c-sx").value = sc.x;
    $("#c-sy").value = sc.y;
    $("#c-srot").value = sc.rot || 0;
    $("#o-srot").textContent = (sc.rot || 0) + "°";
    $("#surf-adjust").style.display = cfg.banner ? "" : "none";
    for (const [elId, key] of [ [ "#c-name", "nameStyle" ], [ "#c-flair", "cardFlair" ], [ "#c-avatar", "avatarFrame" ], [ "#c-chipstyle", "chipStyle" ], [ "#c-anim-name", "animName" ], [ "#c-anim-avatar", "animAvatar" ] ]) {
      $$(elId + " button").forEach(b => b.classList.toggle("on", b.dataset.v === cfg[key]));
    }
    $$("#c-overlay button").forEach(b => {
      b.classList.toggle("on", b.dataset.v === "none" ? !cfg.overlays.length : cfg.overlays.includes(b.dataset.v));
    });
    const drop = $("#drop");
    drop.classList.toggle("has-img", !!cfg.banner);
    drop.classList.toggle("has-vid", isVideoBanner());
    drop.style.backgroundImage = cfg.banner && !isVideoBanner() ? `url(${cfg.banner})` : "";
    for (const key of SURFACES) {
      const layer = layerOf(key);
      const on = bannerActive(key);
      layer.hidden = !on;
      if (on) {
        bannerStyle(layer, key);
        const extraDim = key === "profile" ? 0 : .3;
        layer.style.setProperty("--dim", Math.min(.85, cfg.bannerDim / 100 + extraDim).toFixed(2));
      } else {
        layer.querySelectorAll("img").forEach(n => n.remove());
        layer.style.background = "";
      }
      $("#box-" + key).classList.toggle("bn-drag", on);
      const dot = document.querySelector(`.scr-on[data-on="${key}"]`);
      dot.textContent = on ? "BANNER LIVE" : cfg.banner ? "BANNER OFF" : "";
      dot.classList.toggle("live", on);
      dot.title = cfg.banner ? "Click to toggle the banner on this surface" : "";
    }
    $$(".screen").forEach(s => s.classList.toggle("sel", s.dataset.surf === selSurf));
    const nameCls = cfg.nameStyle && cfg.nameStyle !== "none" ? "n-" + cfg.nameStyle : "";
    const nameFx = cfg.animName && cfg.animName !== "none" ? "nfx-" + cfg.animName : "";
    $$(".j-name").forEach(n => {
      n.className = n.className.replace(/\bn-\w+/g, "").replace(/\bnfx-\w+/g, "").trim();
      if (nameCls) n.classList.add(nameCls);
      if (nameFx) n.classList.add(nameFx);
    });
    for (const [boxId, fxId] of [ [ "#box-card", "#fx-card" ], [ "#box-lobby", "#fx-lobby" ] ]) {
      const box = $(boxId);
      box.className = box.className.replace(/\bf-\w+/g, "").trim();
      if (cfg.cardFlair !== "none") box.classList.add("f-" + cfg.cardFlair);
      $(fxId).dataset.kanji = cfg.kanji || "東京";
    }
    for (const boxId of [ "#box-profile", "#box-card", "#box-lobby" ]) {
      const box = $(boxId);
      if (!box) continue;
      box.className = box.className.replace(/\bov-\w+/g, "").trim();
      const want = cfg.overlays;
      const have = new Map;
      box.querySelectorAll(":scope > .pc-overlay").forEach(l => {
        const k = l.dataset.ov;
        if (k && want.includes(k) && !have.has(k)) have.set(k, l); else l.remove();
      });
      for (const o of want) {
        box.classList.add("ov-" + o);
        if (!have.has(o)) {
          const ov = document.createElement("div");
          ov.className = "pc-overlay ovl-" + o;
          ov.dataset.ov = o;
          ov.setAttribute("aria-hidden", "true");
          box.appendChild(ov);
        }
      }
    }
    const avFx = cfg.animAvatar && cfg.animAvatar !== "none" ? "avfx-" + cfg.animAvatar : "";
    $$(".j-av").forEach(a => {
      a.className = a.className.replace(/\bav-\w+/g, "").replace(/\bavfx-\w+/g, "").trim();
      if (cfg.avatarFrame !== "none") a.classList.add("av-" + cfg.avatarFrame);
      if (avFx) a.classList.add(avFx);
    });
    $$(".j-chip").forEach(c => {
      c.hidden = !cfg.chip;
      c.textContent = cfg.chip;
      c.className = c.className.replace(/\bchip-\w+/g, "").trim();
      c.classList.add("chip-" + (cfg.chipStyle || "outline"));
    });
    paintTierBadge();
  }
  function paintTierBadge() {
    $$(".j-tier-badge").forEach(b => {
      b.hidden = true;
      b.textContent = "";
    });
  }
  function set(patch) {
    Object.assign(cfg, patch);
    paint();
    queueRescale();
    save();
  }
  function setSurf(key, patch) {
    cfg.surf[key] = {
      ...cfg.surf[key],
      ...patch
    };
    paint();
    save();
  }
  function select(key) {
    if (selSurf === key) return;
    selSurf = key;
    paint();
  }
  function bindBannerDrag(key) {
    const box = $("#box-" + key), layer = layerOf(key);
    let dragging = false, sx = 0, sy = 0, ox = 50, oy = 50;
    box.addEventListener("pointerdown", e => {
      select(key);
      if (!bannerActive(key)) return;
      const s = surf(key);
      dragging = true;
      sx = e.clientX;
      sy = e.clientY;
      ox = s.x;
      oy = s.y;
      layer.classList.add("dragging");
      box.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    box.addEventListener("pointermove", e => {
      if (!dragging) return;
      const img = layer.querySelector(".pc-bimg");
      if (!img) return;
      const W = layer.clientWidth, H = layer.clientHeight;
      const vs = layer.getBoundingClientRect().width / W || 1;
      const dw = img.offsetWidth, dh = img.offsetHeight;
      const a = -(+surf(key).rot || 0) * Math.PI / 180;
      const rdx = ((e.clientX - sx) * Math.cos(a) + (e.clientY - sy) * Math.sin(a)) / vs;
      const rdy = (-(e.clientX - sx) * Math.sin(a) + (e.clientY - sy) * Math.cos(a)) / vs;
      let nx = ox, ny = oy;
      if (Math.abs(W - dw) > 1) nx = clampPct(ox + rdx * 100 / (W - dw));
      if (Math.abs(H - dh) > 1) ny = clampPct(oy + rdy * 100 / (H - dh));
      setSurf(key, {
        x: Math.round(nx * 10) / 10,
        y: Math.round(ny * 10) / 10
      });
    });
    const stop = () => {
      dragging = false;
      layer.classList.remove("dragging");
    };
    box.addEventListener("pointerup", stop);
    box.addEventListener("pointercancel", stop);
    box.addEventListener("wheel", e => {
      if (!bannerActive(key)) return;
      e.preventDefault();
      select(key);
      const s = clamp((+surf(key).scale || 1) * (e.deltaY < 0 ? 1.06 : 1 / 1.06), ZOOM_MIN, ZOOM_MAX);
      setSurf(key, {
        scale: +s.toFixed(2)
      });
    }, {
      passive: false
    });
  }
  function fitWholeImage(key) {
    const layer = layerOf(key);
    const img = layer && layer.querySelector(".pc-bimg");
    if (!img || !img.naturalWidth) return;
    const W = layer.clientWidth, H = layer.clientHeight;
    const cover = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const contain = Math.min(W / img.naturalWidth, H / img.naturalHeight);
    setSurf(key, {
      scale: clamp(+(contain / cover).toFixed(2), ZOOM_MIN, 1),
      x: 50,
      y: 50,
      rot: 0
    });
  }
  function bind() {
    $("#c-enabled").addEventListener("change", e => set({
      enabled: e.target.checked
    }));
    $("#c-banner-on").addEventListener("change", e => set({
      bannerOn: e.target.checked
    }));
    $("#c-banner-blur").addEventListener("input", e => set({
      bannerBlur: +e.target.value
    }));
    $("#c-banner-dim").addEventListener("input", e => set({
      bannerDim: +e.target.value
    }));
    $("#c-fill-color").addEventListener("input", e => set({
      fillColor: e.target.value
    }));
    $("#c-fill").addEventListener("click", e => {
      const b = e.target.closest("button");
      if (!b) return;
      set({
        fillMode: b.dataset.v
      });
    });
    $("#surf-tabs").addEventListener("click", e => {
      const b = e.target.closest("button");
      if (!b) return;
      select(b.dataset.surf);
    });
    $("#c-surf-on").addEventListener("change", e => setSurf(selSurf, {
      on: e.target.checked
    }));
    $("#c-sscale").addEventListener("input", e => setSurf(selSurf, {
      scale: +e.target.value
    }));
    $("#c-sx").addEventListener("input", e => setSurf(selSurf, {
      x: +e.target.value
    }));
    $("#c-sy").addEventListener("input", e => setSurf(selSurf, {
      y: +e.target.value
    }));
    $("#c-srot").addEventListener("input", e => setSurf(selSurf, {
      rot: +e.target.value
    }));
    $("#btn-fill").addEventListener("click", () => setSurf(selSurf, {
      x: 50,
      y: 50,
      scale: 1,
      rot: 0
    }));
    $("#btn-fit").addEventListener("click", () => fitWholeImage(selSurf));
    $("#anchor-x").addEventListener("click", e => {
      const b = e.target.closest("button");
      if (!b) return;
      setSurf(selSurf, {
        x: +b.dataset.x
      });
    });
    $("#c-accent").addEventListener("input", e => set({
      accent: e.target.value
    }));
    $("#c-accent2").addEventListener("input", e => set({
      accent2: e.target.value
    }));
    $("#c-kanji").addEventListener("input", e => set({
      kanji: e.target.value.slice(0, 4)
    }));
    $("#c-chip").addEventListener("input", e => set({
      chip: e.target.value.slice(0, 10)
    }));
    window.addEventListener("resize", queueRescale);
    for (const [elId, key] of [ [ "#c-name", "nameStyle" ], [ "#c-flair", "cardFlair" ], [ "#c-avatar", "avatarFrame" ], [ "#c-chipstyle", "chipStyle" ], [ "#c-anim-name", "animName" ], [ "#c-anim-avatar", "animAvatar" ] ]) {
      $(elId).addEventListener("click", e => {
        const b = e.target.closest("button");
        if (!b) return;
        if (b.classList.contains("prem") && proTier !== "premium") {
          toast("Preview only — publishing this effect needs CSR+ Premium");
        }
        set({
          [key]: b.dataset.v
        });
      });
    }
    $("#c-fx1")?.addEventListener("input", e => set({
      fxColor: e.target.value
    }));
    $("#c-fx2")?.addEventListener("input", e => set({
      fxColor2: e.target.value
    }));
    $("#fx-use-accents")?.addEventListener("click", () => {
      const useAccents = !(!cfg.fxColor && !cfg.fxColor2);
      set(useAccents ? {
        fxColor: null,
        fxColor2: null
      } : {
        fxColor: cfg.accent,
        fxColor2: cfg.accent2
      });
    });
    $("#c-overlay").addEventListener("click", e => {
      const b = e.target.closest("button");
      if (!b) return;
      const v = b.dataset.v;
      if (v === "none") {
        set({
          overlays: []
        });
        return;
      }
      const list = cfg.overlays.slice();
      const i = list.indexOf(v);
      if (i >= 0) list.splice(i, 1); else {
        if (list.length >= MAX_OVERLAYS) {
          toast(`Up to ${MAX_OVERLAYS} overlays — remove one first`);
          return;
        }
        list.push(v);
      }
      set({
        overlays: list
      });
    });
    const PANE_HINTS = {
      account: "Sign in with Discord to share your look — colours, name and flair are free for everyone.",
      banner: "Upload art, then drag it on a holo-screen to position · scroll to zoom.",
      colors: "Two accents drive every style — gradients, rings, chips, effects.",
      effects: "Name styles, card flair, avatar frames — ✦ effects need Premium to publish."
    };
    $("#tabbar").addEventListener("click", e => {
      const b = e.target.closest(".tab-btn");
      if (!b) return;
      const pane = b.dataset.pane;
      $$(".tab-btn").forEach(t => t.classList.toggle("active", t === b));
      $$(".pane").forEach(p => p.classList.toggle("active", p.dataset.pane === pane));
      const hint = $("#pane-hint");
      if (hint) hint.textContent = PANE_HINTS[pane] || "";
      queueRescale();
    });
    document.addEventListener("keydown", e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        $("#btn-save")?.click();
      }
    });
    $("#btn-back")?.addEventListener("click", () => {
      if (history.length > 1) {
        const here = location.href;
        history.back();
        setTimeout(() => {
          if (location.href === here) window.close();
        }, 150);
      } else window.close();
    });
    $("#btn-save")?.addEventListener("click", async () => {
      const willPublish = extStorage && cfg.banner && proTier !== "free" && tokenValid(proSession);
      if (willPublish) {
        const ok = await confirmDialog({
          title: "Publish your banner?",
          body: "Your banner will be uploaded and shown to all CSR+ users after it passes automatic moderation. Continue?",
          okLabel: "Publish"
        });
        if (!ok) return;
      }
      const btn = $("#btn-save");
      btn.disabled = true;
      try {
        await saveNow();
      } finally {
        btn.disabled = false;
      }
    });
    window.addEventListener("beforeunload", e => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
    $$(".screen").forEach(s => s.addEventListener("pointerdown", () => select(s.dataset.surf)));
    for (const key of SURFACES) bindBannerDrag(key);
    $$(".scr-on").forEach(dot => dot.addEventListener("click", e => {
      e.stopPropagation();
      const key = dot.dataset.on;
      if (!cfg.banner) return;
      select(key);
      setSurf(key, {
        on: !surf(key).on
      });
    }));
    const drop = $("#drop"), fileIn = $("#c-banner-file");
    drop.addEventListener("click", () => fileIn.click());
    fileIn.addEventListener("change", () => {
      if (fileIn.files[0]) applyFile(fileIn.files[0]);
      fileIn.value = "";
    });
    for (const ev of [ "dragover", "dragenter" ]) drop.addEventListener(ev, e => {
      e.preventDefault();
      drop.classList.add("over");
    });
    for (const ev of [ "dragleave", "drop" ]) drop.addEventListener(ev, e => {
      e.preventDefault();
      drop.classList.remove("over");
    });
    drop.addEventListener("drop", e => {
      const f = e.dataTransfer.files[0];
      if (f) applyFile(f);
    });
    async function applyFile(f) {
      try {
        const data = await processBanner(f);
        for (const key of SURFACES) cfg.surf[key] = {
          ...cfg.surf[key],
          on: true,
          x: 50,
          y: 50,
          scale: 1,
          rot: 0
        };
        set({
          banner: data,
          bannerOn: true
        });
        toast("Banner set — drag it on a screen to reposition, scroll to zoom");
      } catch (err) {
        toast(err.message);
      }
    }
    $("#btn-banner-remove").addEventListener("click", () => set({
      banner: null
    }));
    $("#btn-reset").addEventListener("click", () => {
      if (!confirm("Reset all customization to defaults?")) return;
      cfg = normalize({});
      paint();
      save();
    });
    $("#btn-export").addEventListener("click", async () => {
      const out = {
        ...cfg
      };
      delete out.banner;
      try {
        await navigator.clipboard.writeText(JSON.stringify(out));
        toast("Setup copied to clipboard (without banner)");
      } catch {
        toast("Copy failed");
      }
    });
    $("#btn-import").addEventListener("click", () => {
      const raw = prompt("Paste a CSR+ Studio setup JSON:");
      if (!raw) return;
      try {
        const obj = JSON.parse(raw);
        const clean = {};
        for (const k of Object.keys(DEFAULTS)) if (k in obj && k !== "banner") clean[k] = obj[k];
        cfg = normalize({
          ...cfg,
          ...clean,
          banner: cfg.banner
        });
        paint();
        save();
        toast("Setup imported");
      } catch {
        toast("Invalid JSON");
      }
    });
    const box = $("#presets");
    for (const [name, p] of Object.entries(PRESETS)) {
      const b = document.createElement("button");
      b.className = "preset";
      b.textContent = name;
      b.style.background = `linear-gradient(120deg, ${p.accent}, ${p.accent2})`;
      b.addEventListener("click", () => {
        set({
          ...p
        });
        toast(`Preset: ${name}`);
      });
      box.appendChild(b);
    }
    let lastColor = "accent";
    $("#c-accent").addEventListener("focus", () => lastColor = "accent");
    $("#c-accent2").addEventListener("focus", () => lastColor = "accent2");
    const sw = $("#swatches");
    for (const c of SWATCHES) {
      const s = document.createElement("button");
      s.className = "swatch";
      s.style.background = c;
      s.title = c + " (click = accent, shift+click = accent 2)";
      s.addEventListener("click", e => set({
        [e.shiftKey ? "accent2" : lastColor]: c
      }));
      sw.appendChild(s);
    }
  }
  const API = "https://api.csrestored.fun";
  const fill = (cls, v) => $$("." + cls).forEach(n => n.textContent = v);
  const isValidProfile = p => !!(p && typeof p === "object" && !p.message && (p.name || p.id));
  async function fetchProfile(id) {
    try {
      const r = await fetch(`${API}/users/${id}`, {
        credentials: "include"
      });
      if (!r.ok) return null;
      const text = await r.text();
      const u = JSON.parse(text.replace(/([:\[,]\s*)(-?\d{16,})(?=\s*[,}\]])/g, '$1"$2"'));
      return isValidProfile(u) ? u : null;
    } catch {
      return null;
    }
  }
  const fetchMe = () => fetchProfile("@me");
  function applyIdentity(u, myId) {
    const fallbackAv = "../assets/icon128.png";
    const av = u && u.avatar ? `https://cdn.discordapp.com/avatars/${myId}/${u.avatar}.png?size=128` : fallbackAv;
    if (u) {
      if (u.name) $$(".j-name").forEach(n => n.textContent = u.name);
      if (u.points != null) fill("d-elo", u.points);
      const matches = Number(u.matches) || 0;
      const wins = Number(u.wins) || 0;
      const kills = Number(u.kills) || 0;
      const deaths = Number(u.deaths) || 0;
      if (u.matches != null) fill("d-matches", matches);
      if (u.wins != null) fill("d-wins", wins);
      if (matches) {
        fill("d-wr", (wins / matches * 100).toFixed(2) + "%");
        if (kills) fill("d-avg", (kills / matches).toFixed(2));
      }
      if (kills) {
        fill("d-kills", kills);
        fill("d-kdr", (kills / Math.max(1, deaths)).toFixed(2));
      }
      if (u.bp_level != null) $$(".level-hex b").forEach(n => n.textContent = u.bp_level);
      const cc = u.country || u.cc;
      if (cc && /^[a-z]{2}$/i.test(cc)) {
        $$(".j-flag").forEach(n => {
          n.src = `https://flagcdn.com/w40/${cc.toLowerCase()}.png`;
          n.alt = cc.toUpperCase();
          n.hidden = false;
        });
      }
    }
    $$(".j-av").forEach(img => {
      img.src = av;
      img.onerror = () => img.src = fallbackAv;
    });
    return u;
  }
  async function loadIdentity(myId) {
    return applyIdentity(myId ? await fetchProfile(myId) : null, myId);
  }
  const PRO_API = "https://europe-west1-csr-plus-331c8.cloudfunctions.net/api";
  const DISCORD_CLIENT_ID = "1526694025757851819";
  const JWT_KEY = "csrpProToken";
  let proSession = null;
  let proTier = "free";
  let premiumUntil = 0;
  let modStrikes = 0;
  let modBanned = false;
  const PREMIUM_NAMES = [ "rainbow", "glitch", "metal" ];
  const PREMIUM_FLAIRS = [ "holo", "aurora" ];
  const PREMIUM_FRAMES = [ "hex", "glow" ];
  const PREMIUM_CHIPS = [ "solid", "gradient" ];
  function downgradeConfigToTier(c, tier) {
    const patch = {};
    if (tier !== "premium") {
      if (c.animName && c.animName !== "none") patch.animName = "none";
      if (c.animAvatar && c.animAvatar !== "none") patch.animAvatar = "none";
      if (c.overlay && c.overlay !== "none") patch.overlay = "none";
      if (Array.isArray(c.overlays) && c.overlays.length) patch.overlays = [];
      if (PREMIUM_NAMES.includes(c.nameStyle)) patch.nameStyle = "gradient";
      if (PREMIUM_FLAIRS.includes(c.cardFlair)) patch.cardFlair = "ring";
      if (PREMIUM_FRAMES.includes(c.avatarFrame)) patch.avatarFrame = "ring";
      if (PREMIUM_CHIPS.includes(c.chipStyle)) patch.chipStyle = "outline";
      if (c.fillMode === "color") patch.fillMode = "blur";
    }
    return Object.keys(patch).length ? patch : null;
  }
  function pro(path, {method = "GET", body = null, token = null, timeoutMs = 0} = {}) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({
          type: "csrp:pro",
          path,
          method,
          body,
          token,
          timeoutMs
        }, resp => {
          if (chrome.runtime.lastError || !resp) return resolve({
            ok: false,
            error: "no response"
          });
          resolve(resp);
        });
      } catch (e) {
        resolve({
          ok: false,
          error: String(e)
        });
      }
    });
  }
  const jwtExp = t => {
    try {
      return JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp || 0;
    } catch {
      return 0;
    }
  };
  const tokenValid = s => !!(s && s.token && s.exp && s.exp * 1e3 > Date.now() + 3e4);
  function loadProSession() {
    return new Promise(resolve => {
      if (proSession) return resolve(proSession);
      if (!extStorage) return resolve(null);
      chrome.storage.local.get([ JWT_KEY ], d => {
        proSession = d && d[JWT_KEY] || null;
        resolve(proSession);
      });
    });
  }
  async function proSignIn(interactive = true) {
    const s = await loadProSession();
    if (tokenValid(s)) return s;
    if (!(chrome.identity && chrome.identity.launchWebAuthFlow)) return null;
    const redirectUri = chrome.identity.getRedirectURL();
    const authUrl = "https://discord.com/api/oauth2/authorize?" + new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: "identify",
      prompt: "consent"
    }).toString();
    const redirect = await new Promise(res => {
      try {
        chrome.identity.launchWebAuthFlow({
          url: authUrl,
          interactive
        }, r => res(chrome.runtime.lastError ? null : r));
      } catch {
        res(null);
      }
    });
    if (!redirect) return null;
    const code = new URL(redirect).searchParams.get("code");
    if (!code) return null;
    const resp = await pro("/auth/exchange", {
      method: "POST",
      body: {
        code,
        redirectUri
      }
    });
    if (!resp.ok || !resp.data || !resp.data.token) return null;
    proSession = {
      token: resp.data.token,
      exp: jwtExp(resp.data.token),
      user: resp.data.user || null
    };
    if (extStorage) chrome.storage.local.set({
      [JWT_KEY]: proSession
    });
    return proSession;
  }
  async function proToken() {
    const s = await loadProSession();
    if (tokenValid(s)) return s.token;
    const re = await proSignIn(false);
    return tokenValid(re) ? re.token : null;
  }
  function proSignOut() {
    proSession = null;
    proTier = "free";
    if (extStorage) chrome.storage.local.remove(JWT_KEY);
    reflectAccount();
  }
  function reflectAccount() {
    const signedIn = tokenValid(proSession);
    const rank = {
      free: 0,
      pro: 1,
      premium: 2
    };
    const chip = $("#mode-chip");
    const user = proSession && proSession.user;
    const nameEl = $("#acct-name"), avEl = $("#acct-av"), dot = $("#acct-tier-dot");
    if (nameEl) nameEl.textContent = signedIn ? user && user.name ? user.name : "Signed in" : "Not signed in";
    if (avEl) {
      avEl.src = signedIn && user && user.avatar && user.id ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : "../assets/icon128.png";
      avEl.onerror = () => {
        avEl.src = "../assets/icon128.png";
      };
    }
    if (dot) dot.className = "acct-tier-dot" + (signedIn ? " t-on" : "");
    const badge = $("#tier-badge");
    if (badge) {
      badge.className = "acct-tier" + (signedIn ? " t-on" : "");
      badge.textContent = signedIn ? "Sharing enabled" : "Local preview";
    }
    $("#btn-signin").hidden = signedIn;
    $("#btn-signout").hidden = !signedIn;
    const note = $("#acct-note");
    if (note) note.hidden = signedIn;
    const hb = $("#hide-banners-row");
    if (hb) hb.hidden = !signedIn;
    if (chip) chip.textContent = signedIn ? "SIGNED IN · SHARED" : "LOCAL PREVIEW";
    const mw = $("#mod-warn");
    if (mw) {
      if (signedIn && modBanned) {
        mw.hidden = false;
        mw.className = "mod-warn banned";
        mw.textContent = "⛔ Banner uploads disabled — 3/3 moderation strikes";
      } else if (signedIn && modStrikes > 0) {
        mw.hidden = false;
        mw.className = "mod-warn";
        mw.textContent = `⚠ Moderation warnings: ${modStrikes}/3`;
      } else {
        mw.hidden = true;
      }
    }
  }
  async function refreshTier() {
    const token = await proToken();
    if (!token) {
      proTier = "free";
      reflectAccount();
      return;
    }
    const resp = await pro("/me", {
      token
    });
    if (resp.ok && resp.data) {
      proTier = resp.data.tier || "free";
      premiumUntil = resp.data.premiumUntil || 0;
      modStrikes = resp.data.moderationStrikes || 0;
      modBanned = !!resp.data.moderationBanned;
      proSession.user = proSession.user || resp.data.user;
      previewTier = proTier;
      const dg = downgradeConfigToTier(cfg, proTier);
      if (dg) {
        Object.assign(cfg, dg);
        paint();
        save();
        toast(proTier === "free" ? "Cosmetics reset to match your Free plan" : "Some premium cosmetics were reset to match your " + (proTier === "pro" ? "Pro" : "plan"));
      } else {
        paintTierBadge();
      }
    }
    reflectAccount();
  }
  function bindAccount() {
    const hideArea = chrome.storage && chrome.storage.sync ? chrome.storage.sync : chrome.storage.local;
    const hideToggle = $("#c-hide-banners");
    if (extStorage) hideArea.get([ "hideBanners" ], d => {
      hideToggle.checked = d.hideBanners === true;
    });
    hideToggle?.addEventListener("change", () => {
      if (extStorage) {
        hideArea.set({
          hideBanners: hideToggle.checked
        });
        if (hideArea !== chrome.storage.local) chrome.storage.local.set({
          hideBanners: hideToggle.checked
        });
      }
      toast(hideToggle.checked ? "Other players’ banners hidden" : "Banners shown");
    });
    $("#btn-signin")?.addEventListener("click", async () => {
      $("#btn-signin").disabled = true;
      const s = await proSignIn(true);
      $("#btn-signin").disabled = false;
      if (!s) return toast("Sign-in failed or cancelled");
      await refreshTier();
      toast("Signed in with Discord");
    });
    $("#btn-signout")?.addEventListener("click", async () => {
      const ok = await confirmDialog({
        title: "Log out of CSR+?",
        body: "You will stop sharing your look with other CSR+ players until you sign back in. Your local settings stay saved.",
        okLabel: "Log out",
        danger: true
      });
      if (ok) proSignOut();
    });
  }
  function loadRemoteEffects() {
    const applyFx = fx => {
      if (!fx) return;
      if (fx.css) {
        let st = document.getElementById("csrp-remote-fx");
        if (!st) {
          st = document.createElement("style");
          st.id = "csrp-remote-fx";
          document.head.appendChild(st);
        }
        if (st.textContent !== fx.css) st.textContent = fx.css;
      }
      const list = fx.manifest && Array.isArray(fx.manifest.overlays) ? fx.manifest.overlays : [];
      const box = $("#c-overlay");
      let added = false;
      for (const o of list) {
        if (!o || !o.id || !/^[a-z0-9_-]{2,24}$/.test(o.id)) continue;
        if (!OVERLAY_VALUES.includes(o.id)) OVERLAY_VALUES.push(o.id);
        if (box && !box.querySelector(`button[data-v="${o.id}"]`)) {
          const b = document.createElement("button");
          b.dataset.v = o.id;
          b.className = "prem";
          b.textContent = o.label || o.id;
          box.appendChild(b);
          added = true;
        }
      }
      if (added) paint();
    };
    try {
      if (!extStorage) return;
      chrome.storage.local.get([ "csrpFx" ], d => {
        if (d.csrpFx) applyFx(d.csrpFx);
        chrome.runtime.sendMessage({
          type: "csrp:fx"
        }, resp => {
          if (chrome.runtime.lastError || !resp || !resp.ok) return;
          const fx = {
            css: resp.css || "",
            manifest: resp.manifest || null,
            ts: Date.now()
          };
          chrome.storage.local.set({
            csrpFx: fx
          });
          applyFx(fx);
        });
      });
    } catch {}
  }
  load(async storedId => {
    bind();
    bindAccount();
    loadRemoteEffects();
    paint();
    rescale();
    loadProSession().then(() => {
      reflectAccount();
      if (tokenValid(proSession)) refreshTier();
    });
    const me = await fetchMe();
    if (me && me.id) {
      const id = String(me.id);
      if (extStorage && id !== String(storedId || "")) {
        chrome.storage.local.set({
          csrpMyId: id
        });
      }
      applyIdentity(me, id);
    } else {
      if (!storedId) toast("Log in on csrestored.fun to see your real profile in the preview");
      await loadIdentity(storedId);
    }
    queueRescale();
  });
})();
