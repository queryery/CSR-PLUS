(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const KEY = 'csrpCustom';

  const SURFACES = ['profile', 'card', 'lobby'];
  const ZOOM_MIN = 0.1, ZOOM_MAX = 3;

  const DEFAULTS = {
    enabled: true,
    banner: null, bannerOn: true, bannerBlur: 0, bannerDim: 30,
    fillMode: 'blur', fillColor: '#0b0b12',
    surf: {
      profile: { on: true, x: 50, y: 50, scale: 1, rot: 0 },
      card: { on: false, x: 50, y: 50, scale: 1, rot: 0 },
      lobby: { on: false, x: 50, y: 50, scale: 1, rot: 0 },
    },
    accent: '#e23a45', accent2: '#8fb4ff',
    nameStyle: 'gradient', cardFlair: 'ring', avatarFrame: 'ring',
    kanji: '東京', chip: '', chipStyle: 'gradient',
    animName: 'none', animAvatar: 'none', overlay: 'none',
  };

  const PRESETS = {
    'Tokyo': { accent: '#ff2a55', accent2: '#26c6ff', nameStyle: 'gradient', cardFlair: 'kanji', avatarFrame: 'ring', kanji: '東京', chipStyle: 'gradient' },
    'Crimson': { accent: '#e23a45', accent2: '#7a1218', nameStyle: 'outline', cardFlair: 'ring', avatarFrame: 'glow', chipStyle: 'solid' },
    'Arctic': { accent: '#8fd8ff', accent2: '#4a6cff', nameStyle: 'gradient', cardFlair: 'holo', avatarFrame: 'hex', chipStyle: 'outline' },
    'Gold': { accent: '#ffcf5e', accent2: '#a86514', nameStyle: 'metal', cardFlair: 'corners', avatarFrame: 'ring', chipStyle: 'solid' },
    'Matrix': { accent: '#41ff6a', accent2: '#0d5e22', nameStyle: 'outline', cardFlair: 'scanline', avatarFrame: 'none', chipStyle: 'outline' },
    'Vapor': { accent: '#ff71ce', accent2: '#01cdfe', nameStyle: 'rainbow', cardFlair: 'aurora', avatarFrame: 'glow', chipStyle: 'gradient' },
  };

  const SWATCHES = ['#e23a45', '#ff2a55', '#ff7a1a', '#ffcf5e', '#7ee081', '#41ff6a',
    '#26c6ff', '#8fb4ff', '#4a6cff', '#b78cff', '#ff71ce', '#ffffff'];

  let cfg = normalize({});
  let selSurf = 'profile';
  let previewTier = 'free';
  let saveTimer = null;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const clampPct = (v) => clamp(v, 0, 100);

  function normalize(c) {
    const out = { ...DEFAULTS, ...c };
    const s = c.surf || {};
    const legacy = { x: c.bannerX ?? 50, y: c.bannerY ?? 50, scale: c.bannerScale || 1 };
    out.surf = {
      profile: { ...DEFAULTS.surf.profile, ...(c.surf ? s.profile : { on: c.bannerOn !== false, ...legacy }) },
      card: { ...DEFAULTS.surf.card, ...(c.surf ? s.card : { on: !!c.cardBanner, ...legacy }) },
      lobby: { ...DEFAULTS.surf.lobby, ...(c.surf ? s.lobby : { on: !!c.cardBanner, ...legacy }) },
    };
    if (out.nameStyle === 'glow') out.nameStyle = 'gradient';
    delete out.bannerX; delete out.bannerY; delete out.bannerScale; delete out.cardBanner;
    return out;
  }

  const surf = (key) => cfg.surf[key];
  const bannerActive = (key) => !!(cfg.banner && cfg.bannerOn && surf(key).on);

  const extStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

  let dirty = false;
  function markDirty() {
    dirty = true;
    const btn = $('#btn-save'); if (btn) btn.classList.add('dirty');
  }
  function clearDirty() {
    dirty = false;
    const btn = $('#btn-save'); if (btn) btn.classList.remove('dirty');
  }

  const RANK = { free: 0, pro: 1, premium: 2 };
  function usesPremiumCosmetic(c) {
    return PREMIUM_NAMES.includes(c.nameStyle) ||
      PREMIUM_FLAIRS.includes(c.cardFlair) ||
      PREMIUM_FRAMES.includes(c.avatarFrame) ||
      PREMIUM_CHIPS.includes(c.chipStyle) ||
      c.fillMode === 'color' ||
      (c.animName && c.animName !== 'none') ||
      (c.animAvatar && c.animAvatar !== 'none') ||
      (c.overlay && c.overlay !== 'none');
  }
  function freeCustomizationBody(c) {
    return {
      accent: c.accent, accent2: c.accent2,
      nameStyle: PREMIUM_NAMES.includes(c.nameStyle) ? 'gradient' : c.nameStyle,
      cardFlair: PREMIUM_FLAIRS.includes(c.cardFlair) ? 'ring' : c.cardFlair,
      avatarFrame: PREMIUM_FRAMES.includes(c.avatarFrame) ? 'ring' : c.avatarFrame,
      chip: c.chip, chipStyle: PREMIUM_CHIPS.includes(c.chipStyle) ? 'outline' : c.chipStyle,
      kanji: c.kanji, fillMode: 'blur',
      animName: 'none', animAvatar: 'none', overlay: 'none',
      bannerEnabled: false, bannerOn: false,
    };
  }
  function fullCustomizationBody(c) {
    return {
      accent: c.accent, accent2: c.accent2, nameStyle: c.nameStyle, cardFlair: c.cardFlair,
      avatarFrame: c.avatarFrame, chip: c.chip, chipStyle: c.chipStyle, kanji: c.kanji,
      fillMode: c.fillMode, fillColor: c.fillColor, bannerBlur: c.bannerBlur, bannerDim: c.bannerDim,
      bannerOn: c.bannerOn, bannerEnabled: !!c.banner, surf: c.surf,
      animName: c.animName, animAvatar: c.animAvatar, overlay: c.overlay,
    };
  }

  async function saveNow() {
    if (extStorage) {
      await new Promise((r) => chrome.storage.local.set({ [KEY]: cfg }, r));
    } else {
      try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch {}
      toast('Saved (preview only — open via the CSR+ popup to apply on the site)');
      clearDirty(); return;
    }

    const token = await proToken().catch(() => null);
    if (!token) {
      toast('Saved locally · sign in to share your look with other players');
      clearDirty(); return;
    }

    const wantsBanner = !!cfg.banner;
    const wantsPremium = usesPremiumCosmetic(cfg);
    const bannerLocked = wantsBanner && RANK[proTier] < RANK.pro;
    const premiumLocked = wantsPremium && proTier !== 'premium';
    const fullyUnlocked = !bannerLocked && !premiumLocked;

    toast('Saving & publishing…');
    const body = fullyUnlocked ? fullCustomizationBody(cfg) : freeCustomizationBody(cfg);
    const custom = await pro('/me/customization', { token, method: 'POST', body });

    let banner = { ok: true };
    if (fullyUnlocked && wantsBanner) {
      const isAnim = /^data:(video\/|image\/gif)/.test(cfg.banner) ||
        (/^data:image\/webp/.test(cfg.banner) && cfg._animated);
      banner = isAnim
        ? await pro('/me/banner/animated', { token, method: 'POST', body: { media: cfg.banner }, timeoutMs: 120000 })
        : await pro('/me/banner', { token, method: 'POST', body: { image: cfg.banner }, timeoutMs: 90000 });
    }

    clearDirty();

    if (!custom.ok) {
      toast((custom.data && custom.data.error) || 'Saved locally; publish failed');
      return;
    }
    if (!banner.ok) {
      toast((banner.data && banner.data.error) || 'Cosmetics published; banner upload failed');
      return;
    }

    if (bannerLocked || premiumLocked) {
      const need = bannerLocked && premiumLocked ? 'premium'
        : premiumLocked ? 'premium' : 'pro';
      openUpgradeModal({ need, wantsBanner: bannerLocked, wantsPremium: premiumLocked });
    } else {
      toast('Saved & published — visible to CSR+ users');
    }
  }

  function openUpgradeModal({ need, wantsBanner, wantsPremium }) {
    const locked = [];
    if (wantsBanner) locked.push('your profile banner');
    if (wantsPremium) locked.push('premium effects (animated name/frame, holo/aurora flair, colour fill)');
    const tierName = need === 'premium' ? 'CSR+ Premium' : 'CSR+ Pro';
    const price = need === 'premium' ? '$4/mo' : '$2/mo';
    confirmDialog({
      title: `Unlock with ${tierName}`,
      body: `Your free look — colours, name style and card flair — is now live for everyone. ` +
        `${locked.join(' and ')} ${locked.length > 1 ? 'need' : 'needs'} ${tierName} (${price}) before ` +
        `${locked.length > 1 ? 'they' : 'it'} can be published. Upgrade now?`,
      okLabel: `Get ${tierName}`,
    }).then(async (yes) => {
      if (!yes) return;
      const t = await proToken().catch(() => null);
      const url = `${CHECKOUT_HOST}/checkout?plan=${encodeURIComponent(need)}` +
        (t ? `&token=${encodeURIComponent(t)}` : '');
      try { chrome.tabs.create({ url }); } catch { window.open(url, '_blank', 'noopener'); }
    });
  }
  function save() { markDirty(); }
  function load(cb) {
    if (extStorage) {
      chrome.storage.local.get([KEY, 'csrpMyId'], (d) => {
        cfg = normalize(d[KEY] || {});
        cb(d.csrpMyId || null);
      });
    } else {
      try { cfg = normalize(JSON.parse(localStorage.getItem(KEY)) || {}); } catch { }
      cb(null);
    }
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 1400);
  }

  function confirmDialog({ title, body, okLabel = 'Confirm', danger = false }) {
    return new Promise((resolve) => {
      const back = document.createElement('div');
      back.className = 'confirm-back';
      back.innerHTML =
        `<div class="confirm-box" role="dialog" aria-modal="true">
          <div class="confirm-title"></div>
          <div class="confirm-body"></div>
          <div class="confirm-actions">
            <button class="btn ghost sm confirm-cancel">Cancel</button>
            <button class="btn sm confirm-ok${danger ? ' danger' : ''}"></button>
          </div>
        </div>`;
      back.querySelector('.confirm-title').textContent = title || '';
      back.querySelector('.confirm-body').textContent = body || '';
      back.querySelector('.confirm-ok').textContent = okLabel;
      const close = (v) => { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') close(false); if (e.key === 'Enter') close(true); };
      back.querySelector('.confirm-cancel').addEventListener('click', () => close(false));
      back.querySelector('.confirm-ok').addEventListener('click', () => close(true));
      back.addEventListener('click', (e) => { if (e.target === back) close(false); });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(back);
      requestAnimationFrame(() => back.classList.add('show'));
      back.querySelector('.confirm-ok').focus();
    });
  }

  const MAX_W = 1920, MAX_STORE = 2.4e6, MAX_ANIMATED_BYTES = 1.7e6;
  function processBanner(file) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return reject(new Error('PNG, JPG, WebP or GIF only'));
      if (file.type === 'image/gif') {
        if (file.size > MAX_ANIMATED_BYTES) return reject(new Error('Animated GIFs must be 1.7 MB or smaller'));
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not read GIF'));
        reader.readAsDataURL(file);
        return;
      }
      if (file.size > 20 * 1024 * 1024) return reject(new Error('Max 20 MB'));
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, MAX_W / img.width);
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        let q = 0.9, out = c.toDataURL('image/webp', q);
        while (out.length > MAX_STORE && q > 0.4) { q -= 0.12; out = c.toDataURL('image/webp', q); }
        resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not decode image')); };
      img.src = url;
    });
  }

  function layoutBannerImg(layer, img, s) {
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const W = layer.clientWidth, H = layer.clientHeight;
    if (!iw || !ih || !W || !H) return;
    const zoom = clamp(+s.scale || 1, ZOOM_MIN, ZOOM_MAX);
    const sc = Math.max(W / iw, H / ih) * zoom;
    const dw = iw * sc, dh = ih * sc;
    const left = (W - dw) * s.x / 100, top = (H - dh) * s.y / 100;
    img.style.width = dw + 'px';
    img.style.height = dh + 'px';
    img.style.left = left + 'px';
    img.style.top = top + 'px';
    const rot = +s.rot || 0;
    if (rot) {
      img.style.transformOrigin = `${W / 2 - left}px ${H / 2 - top}px`;
      img.style.transform = `rotate(${rot}deg)`;
    } else {
      img.style.transform = '';
      img.style.transformOrigin = '';
    }
  }

  function setBannerTextContrast(layer, img, key) {
    const host = layer.parentElement;
    const contrastKey = `${key}:${cfg.bannerDim}:${img.dataset.src || img.src}`;
    if (host._bannerContrastKey === contrastKey) return;
    host._bannerContrastKey = contrastKey;
    const canvas = document.createElement('canvas');
    const size = 32;
    canvas.width = size; canvas.height = size;
    try {
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(img, 0, 0, size, size);
      const pixels = context.getImageData(0, 0, size, size).data;
      let luminance = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        luminance += 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2];
      }
      const dim = Math.min(0.85, cfg.bannerDim / 100 + (key === 'profile' ? 0 : 0.3));
      const isDark = luminance / (pixels.length / 4) * (1 - dim) < 128;
      host.style.setProperty('--bn-text', isDark ? '#f8fafc' : '#111827');
      host.style.setProperty('--bn-label', isDark ? 'rgba(248, 250, 252, 0.72)' : 'rgba(17, 24, 39, 0.72)');
      host.style.setProperty('--bn-shadow', isDark ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.8)');
    } catch {  }
  }

  function bannerStyle(layer, key) {
    const s = surf(key);
    let fill = layer.querySelector('img.pc-bfill');
    let img = layer.querySelector('img.pc-bimg');
    if (cfg.fillMode === 'color') {
      if (fill) fill.remove();
      layer.style.background = cfg.fillColor || '#0b0b12';
    } else {
      if (!fill) {
        fill = document.createElement('img');
        fill.className = 'pc-bfill'; fill.alt = '';
        layer.prepend(fill);
      }
      layer.style.background = '';
    }
    if (!img) {
      img = document.createElement('img');
      img.className = 'pc-bimg'; img.alt = '';
      img.addEventListener('load', () => {
        layoutBannerImg(layer, img, surf(key));
        setBannerTextContrast(layer, img, key);
      });
      layer.appendChild(img);
    }
    if (img.dataset.src !== cfg.banner) { img.src = cfg.banner; img.dataset.src = cfg.banner; }
    if (fill && fill.dataset.src !== cfg.banner) { fill.src = cfg.banner; fill.dataset.src = cfg.banner; }
    img.style.filter = cfg.bannerBlur ? `blur(${cfg.bannerBlur}px)` : '';
    layoutBannerImg(layer, img, s);
    if (img.complete) setBannerTextContrast(layer, img, key);
  }

  const layerOf = (key) => $('#bn-' + key);
  function layoutAll() {
    for (const key of SURFACES) {
      const layer = layerOf(key);
      const img = layer && layer.querySelector('img.pc-bimg');
      if (img) layoutBannerImg(layer, img, surf(key));
    }
  }

  let rescaleQueued = false;
  function rescale() {
    rescaleQueued = false;
    $$('.real').forEach((holder) => {
      const inner = holder.firstElementChild;
      if (!inner) return;
      const rw = +holder.dataset.rw || 1600;
      inner.style.width = rw + 'px';
      const sc = Math.min(1, holder.clientWidth / rw);
      inner.style.transform = sc < 1 ? `scale(${sc})` : '';
      holder.style.height = Math.round(inner.offsetHeight * sc) + 'px';
    });
    layoutAll();
  }
  function queueRescale() {
    if (rescaleQueued) return;
    rescaleQueued = true;
    requestAnimationFrame(rescale);
  }

  function paint() {
    document.documentElement.style.setProperty('--a1', cfg.accent);
    document.documentElement.style.setProperty('--a2', cfg.accent2);

    $('#c-enabled').checked = !!cfg.enabled;
    $('#c-banner-on').checked = !!cfg.bannerOn;
    $('#c-banner-blur').value = cfg.bannerBlur; $('#o-blur').textContent = cfg.bannerBlur;
    $('#c-banner-dim').value = cfg.bannerDim; $('#o-dim').textContent = cfg.bannerDim;
    $('#c-accent').value = cfg.accent; $('#o-accent').textContent = cfg.accent;
    $('#c-accent2').value = cfg.accent2; $('#o-accent2').textContent = cfg.accent2;
    $('#c-kanji').value = cfg.kanji;
    $('#c-chip').value = cfg.chip;
    $('#kanji-row').hidden = cfg.cardFlair !== 'kanji';
    $('#btn-banner-remove').disabled = !cfg.banner;
    $('#c-fill-color').value = cfg.fillColor || '#0b0b12';
    $('#fill-color-row').hidden = cfg.fillMode !== 'color';
    $$('#c-fill button').forEach((b) => b.classList.toggle('on', b.dataset.v === (cfg.fillMode || 'blur')));

    const sc = surf(selSurf);
    $$('#surf-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.surf === selSurf));
    $('#c-surf-on').checked = !!sc.on;
    $('#surf-on-lbl').textContent = 'Show banner on ' +
      (selSurf === 'profile' ? 'your profile page' : selSurf === 'card' ? 'your match-room card' : 'your lobby slot');
    $('#c-sscale').value = sc.scale; $('#o-sscale').textContent = (+sc.scale || 1).toFixed(2) + '×';
    $('#c-sx').value = sc.x;
    $('#c-sy').value = sc.y;
    $('#c-srot').value = sc.rot || 0; $('#o-srot').textContent = (sc.rot || 0) + '°';
    $('#surf-adjust').style.display = cfg.banner ? '' : 'none';

    for (const [elId, key] of [['#c-name', 'nameStyle'],
    ['#c-flair', 'cardFlair'], ['#c-avatar', 'avatarFrame'], ['#c-chipstyle', 'chipStyle'],
    ['#c-anim-name', 'animName'], ['#c-anim-avatar', 'animAvatar'], ['#c-overlay', 'overlay']]) {
      $$(elId + ' button').forEach((b) => b.classList.toggle('on', b.dataset.v === cfg[key]));
    }

    const drop = $('#drop');
    drop.classList.toggle('has-img', !!cfg.banner);
    drop.style.backgroundImage = cfg.banner ? `url(${cfg.banner})` : '';

    for (const key of SURFACES) {
      const layer = layerOf(key);
      const on = bannerActive(key);
      layer.hidden = !on;
      if (on) {
        bannerStyle(layer, key);
        const extraDim = key === 'profile' ? 0 : 0.3;
        layer.style.setProperty('--dim', Math.min(0.85, cfg.bannerDim / 100 + extraDim).toFixed(2));
      } else {
        layer.querySelectorAll('img').forEach((n) => n.remove());
        layer.style.background = '';
      }
      $('#box-' + key).classList.toggle('bn-drag', on);
      const dot = document.querySelector(`.scr-on[data-on="${key}"]`);
      dot.textContent = on ? 'BANNER LIVE' : cfg.banner ? 'BANNER OFF' : '';
      dot.classList.toggle('live', on);
      dot.title = cfg.banner ? 'Click to toggle the banner on this surface' : '';
    }
    $$('.screen').forEach((s) => s.classList.toggle('sel', s.dataset.surf === selSurf));

    const nameCls = (cfg.nameStyle && cfg.nameStyle !== 'none') ? 'n-' + cfg.nameStyle : '';
    const nameFx = (cfg.animName && cfg.animName !== 'none') ? 'nfx-' + cfg.animName : '';
    $$('.j-name').forEach((n) => {
      n.className = n.className.replace(/\bn-\w+/g, '').replace(/\bnfx-\w+/g, '').trim();
      if (nameCls) n.classList.add(nameCls);
      if (nameFx) n.classList.add(nameFx);
    });

    for (const [boxId, fxId] of [['#box-card', '#fx-card'], ['#box-lobby', '#fx-lobby']]) {
      const box = $(boxId);
      box.className = box.className.replace(/\bf-\w+/g, '').trim();
      if (cfg.cardFlair !== 'none') box.classList.add('f-' + cfg.cardFlair);
      $(fxId).dataset.kanji = cfg.kanji || '東京';
    }
    for (const boxId of ['#box-profile', '#box-card', '#box-lobby']) {
      const box = $(boxId); if (!box) continue;
      box.className = box.className.replace(/\bov-\w+/g, '').trim();
      let ov = box.querySelector(':scope > .pc-overlay');
      if (cfg.overlay && cfg.overlay !== 'none') {
        if (!ov) { ov = document.createElement('div'); ov.className = 'pc-overlay'; ov.setAttribute('aria-hidden', 'true'); box.appendChild(ov); }
        box.classList.add('ov-' + cfg.overlay);
      } else if (ov) ov.remove();
    }

    const avFx = (cfg.animAvatar && cfg.animAvatar !== 'none') ? 'avfx-' + cfg.animAvatar : '';
    $$('.j-av').forEach((a) => {
      a.className = a.className.replace(/\bav-\w+/g, '').replace(/\bavfx-\w+/g, '').trim();
      if (cfg.avatarFrame !== 'none') a.classList.add('av-' + cfg.avatarFrame);
      if (avFx) a.classList.add(avFx);
    });

    $$('.j-chip').forEach((c) => {
      c.hidden = !cfg.chip;
      c.textContent = cfg.chip;
      c.className = c.className.replace(/\bchip-\w+/g, '').trim();
      c.classList.add('chip-' + (cfg.chipStyle || 'outline'));
    });

    paintTierBadge();
  }

  function paintTierBadge() {
    const t = previewTier;
    $$('.j-tier-badge').forEach((b) => {
      const inline = b.classList.contains('inline');
      const center = b.classList.contains('center');
      b.className = 'j-tier-badge' + (inline ? ' inline' : '') + (center ? ' center' : '');
      if (t !== 'pro' && t !== 'premium') { b.hidden = true; b.textContent = ''; return; }
      b.hidden = false;
      b.classList.add('tb-' + t);
      b.textContent = t === 'premium' ? '◆ PREMIUM' : '◆ PRO';
    });
    $$('#c-preview-tier button').forEach((btn) => btn.classList.toggle('on', btn.dataset.v === previewTier));
  }

  function set(patch) { Object.assign(cfg, patch); paint(); queueRescale(); save(); }
  function setSurf(key, patch) {
    cfg.surf[key] = { ...cfg.surf[key], ...patch };
    paint(); save();
  }
  function select(key) {
    if (selSurf === key) return;
    selSurf = key;
    paint();
  }

  function bindBannerDrag(key) {
    const box = $('#box-' + key), layer = layerOf(key);
    let dragging = false, sx = 0, sy = 0, ox = 50, oy = 50;
    box.addEventListener('pointerdown', (e) => {
      select(key);
      if (!bannerActive(key)) return;
      const s = surf(key);
      dragging = true; sx = e.clientX; sy = e.clientY; ox = s.x; oy = s.y;
      layer.classList.add('dragging');
      box.setPointerCapture(e.pointerId); e.preventDefault();
    });
    box.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const img = layer.querySelector('img.pc-bimg');
      if (!img) return;
      const W = layer.clientWidth, H = layer.clientHeight;
      const vs = (layer.getBoundingClientRect().width / W) || 1;
      const dw = img.offsetWidth, dh = img.offsetHeight;
      const a = -(+surf(key).rot || 0) * Math.PI / 180;
      const rdx = ((e.clientX - sx) * Math.cos(a) + (e.clientY - sy) * Math.sin(a)) / vs;
      const rdy = (-(e.clientX - sx) * Math.sin(a) + (e.clientY - sy) * Math.cos(a)) / vs;
      let nx = ox, ny = oy;
      if (Math.abs(W - dw) > 1) nx = clampPct(ox + rdx * 100 / (W - dw));
      if (Math.abs(H - dh) > 1) ny = clampPct(oy + rdy * 100 / (H - dh));
      setSurf(key, { x: Math.round(nx * 10) / 10, y: Math.round(ny * 10) / 10 });
    });
    const stop = () => { dragging = false; layer.classList.remove('dragging'); };
    box.addEventListener('pointerup', stop);
    box.addEventListener('pointercancel', stop);
    box.addEventListener('wheel', (e) => {
      if (!bannerActive(key)) return;
      e.preventDefault();
      select(key);
      const s = clamp((+surf(key).scale || 1) * (e.deltaY < 0 ? 1.06 : 1 / 1.06), ZOOM_MIN, ZOOM_MAX);
      setSurf(key, { scale: +s.toFixed(2) });
    }, { passive: false });
  }

  function fitWholeImage(key) {
    const layer = layerOf(key);
    const img = layer && layer.querySelector('img.pc-bimg');
    if (!img || !img.naturalWidth) return;
    const W = layer.clientWidth, H = layer.clientHeight;
    const cover = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const contain = Math.min(W / img.naturalWidth, H / img.naturalHeight);
    setSurf(key, { scale: clamp(+(contain / cover).toFixed(2), ZOOM_MIN, 1), x: 50, y: 50, rot: 0 });
  }

  function bind() {
    $('#c-enabled').addEventListener('change', (e) => set({ enabled: e.target.checked }));
    $('#c-banner-on').addEventListener('change', (e) => set({ bannerOn: e.target.checked }));
    $('#c-banner-blur').addEventListener('input', (e) => set({ bannerBlur: +e.target.value }));
    $('#c-banner-dim').addEventListener('input', (e) => set({ bannerDim: +e.target.value }));
    $('#c-fill-color').addEventListener('input', (e) => set({ fillColor: e.target.value }));
    $('#c-fill').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      set({ fillMode: b.dataset.v });
    });

    $('#surf-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      select(b.dataset.surf);
    });
    $('#c-surf-on').addEventListener('change', (e) => setSurf(selSurf, { on: e.target.checked }));
    $('#c-sscale').addEventListener('input', (e) => setSurf(selSurf, { scale: +e.target.value }));
    $('#c-sx').addEventListener('input', (e) => setSurf(selSurf, { x: +e.target.value }));
    $('#c-sy').addEventListener('input', (e) => setSurf(selSurf, { y: +e.target.value }));
    $('#c-srot').addEventListener('input', (e) => setSurf(selSurf, { rot: +e.target.value }));
    $('#btn-fill').addEventListener('click', () => setSurf(selSurf, { x: 50, y: 50, scale: 1, rot: 0 }));
    $('#btn-fit').addEventListener('click', () => fitWholeImage(selSurf));
    $('#anchor-x').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      setSurf(selSurf, { x: +b.dataset.x });
    });

    $('#c-accent').addEventListener('input', (e) => set({ accent: e.target.value }));
    $('#c-accent2').addEventListener('input', (e) => set({ accent2: e.target.value }));
    $('#c-kanji').addEventListener('input', (e) => set({ kanji: e.target.value.slice(0, 4) }));
    $('#c-chip').addEventListener('input', (e) => set({ chip: e.target.value.slice(0, 18) }));

    window.addEventListener('resize', queueRescale);

    for (const [elId, key] of [['#c-name', 'nameStyle'],
    ['#c-flair', 'cardFlair'], ['#c-avatar', 'avatarFrame'], ['#c-chipstyle', 'chipStyle'],
    ['#c-anim-name', 'animName'], ['#c-anim-avatar', 'animAvatar'], ['#c-overlay', 'overlay']]) {
      $(elId).addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.classList.contains('prem') && proTier !== 'premium') {
          toast('Preview only — publishing this effect needs CSR+ Premium');
        }
        set({ [key]: b.dataset.v });
      });
    }

    const PANE_HINTS = {
      account: 'Connect Discord to share your look — or stay local in test mode.',
      banner: 'Upload art, then drag it on a holo-screen to position · scroll to zoom.',
      colors: 'Two accents drive every style — gradients, rings, chips, effects.',
      effects: 'Name styles, card flair, avatar frames — ✦ effects need Premium to publish.',
    };
    $('#tabbar').addEventListener('click', (e) => {
      const b = e.target.closest('.tab-btn'); if (!b) return;
      const pane = b.dataset.pane;
      $$('.tab-btn').forEach((t) => t.classList.toggle('active', t === b));
      $$('.pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === pane));
      const hint = $('#pane-hint');
      if (hint) hint.textContent = PANE_HINTS[pane] || '';
      queueRescale();
    });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        $('#btn-save')?.click();
      }
    });

    $('#btn-back')?.addEventListener('click', () => {
      if (history.length > 1) { const here = location.href; history.back(); setTimeout(() => { if (location.href === here) window.close(); }, 150); }
      else window.close();
    });

    $('#btn-save')?.addEventListener('click', async () => {
      const willPublish = extStorage && cfg.banner && proTier !== 'free' && tokenValid(proSession);
      if (willPublish) {
        const ok = await confirmDialog({
          title: 'Publish your banner?',
          body: 'Your banner will be uploaded and shown to all CSR+ users after it passes automatic moderation. Continue?',
          okLabel: 'Publish',
        });
        if (!ok) return;
      }
      const btn = $('#btn-save'); btn.disabled = true;
      try { await saveNow(); } finally { btn.disabled = false; }
    });
    window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

    $$('.screen').forEach((s) => s.addEventListener('pointerdown', () => select(s.dataset.surf)));
    for (const key of SURFACES) bindBannerDrag(key);

    $$('.scr-on').forEach((dot) => dot.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = dot.dataset.on;
      if (!cfg.banner) return;
      select(key);
      setSurf(key, { on: !surf(key).on });
    }));

    const drop = $('#drop'), fileIn = $('#c-banner-file');
    drop.addEventListener('click', () => fileIn.click());
    fileIn.addEventListener('change', () => { if (fileIn.files[0]) applyFile(fileIn.files[0]); fileIn.value = ''; });
    for (const ev of ['dragover', 'dragenter']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); });
    for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); });
    drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) applyFile(f); });

    async function applyFile(f) {
      try {
        const data = await processBanner(f);
        for (const key of SURFACES) cfg.surf[key] = { ...cfg.surf[key], on: true, x: 50, y: 50, scale: 1, rot: 0 };
        set({ banner: data, bannerOn: true });
        toast('Banner set — drag it on a screen to reposition, scroll to zoom');
      } catch (err) { toast(err.message); }
    }

    $('#btn-banner-remove').addEventListener('click', () => set({ banner: null }));

    $('#btn-reset').addEventListener('click', () => {
      if (!confirm('Reset all customization to defaults?')) return;
      cfg = normalize({});
      paint(); save();
    });

    $('#btn-export').addEventListener('click', async () => {
      const out = { ...cfg };
      delete out.banner;
      try { await navigator.clipboard.writeText(JSON.stringify(out)); toast('Setup copied to clipboard (without banner)'); }
      catch { toast('Copy failed'); }
    });
    $('#btn-import').addEventListener('click', () => {
      const raw = prompt('Paste a CSR+ Studio setup JSON:');
      if (!raw) return;
      try {
        const obj = JSON.parse(raw);
        const clean = {};
        for (const k of Object.keys(DEFAULTS)) if (k in obj && k !== 'banner') clean[k] = obj[k];
        cfg = normalize({ ...cfg, ...clean, banner: cfg.banner });
        paint(); save();
        toast('Setup imported');
      } catch { toast('Invalid JSON'); }
    });

    const box = $('#presets');
    for (const [name, p] of Object.entries(PRESETS)) {
      const b = document.createElement('button');
      b.className = 'preset';
      b.textContent = name;
      b.style.background = `linear-gradient(120deg, ${p.accent}, ${p.accent2})`;
      b.addEventListener('click', () => { set({ ...p }); toast(`Preset: ${name}`); });
      box.appendChild(b);
    }

    let lastColor = 'accent';
    $('#c-accent').addEventListener('focus', () => (lastColor = 'accent'));
    $('#c-accent2').addEventListener('focus', () => (lastColor = 'accent2'));
    const sw = $('#swatches');
    for (const c of SWATCHES) {
      const s = document.createElement('button');
      s.className = 'swatch'; s.style.background = c; s.title = c + ' (click = accent, shift+click = accent 2)';
      s.addEventListener('click', (e) => set({ [e.shiftKey ? 'accent2' : lastColor]: c }));
      sw.appendChild(s);
    }
  }

  const API = 'https://api.csrestored.fun';
  const fill = (cls, v) => $$('.' + cls).forEach((n) => (n.textContent = v));

  const isValidProfile = (p) => !!(p && typeof p === 'object' && !p.message && (p.name || p.id));

  async function fetchProfile(id) {
    try {
      const r = await fetch(`${API}/users/${id}`, { credentials: 'include' });
      if (!r.ok) return null;
      const text = await r.text();
      const u = JSON.parse(text.replace(/([:\[,]\s*)(-?\d{16,})(?=\s*[,}\]])/g, '$1"$2"'));
      return isValidProfile(u) ? u : null;
    } catch { return null; }
  }
  const fetchMe = () => fetchProfile('@me');

  function applyIdentity(u, myId) {
    const fallbackAv = '../assets/icon128.png';
    const av = u && u.avatar
      ? `https://cdn.discordapp.com/avatars/${myId}/${u.avatar}.png?size=128`
      : fallbackAv;

    if (u) {
      if (u.name) $$('.j-name').forEach((n) => (n.textContent = u.name));
      if (u.points != null) fill('d-elo', u.points);
      const matches = Number(u.matches) || 0;
      const wins = Number(u.wins) || 0;
      const kills = Number(u.kills) || 0;
      const deaths = Number(u.deaths) || 0;
      if (u.matches != null) fill('d-matches', matches);
      if (u.wins != null) fill('d-wins', wins);
      if (matches) {
        fill('d-wr', (wins / matches * 100).toFixed(2) + '%');
        if (kills) fill('d-avg', (kills / matches).toFixed(2));
      }
      if (kills) {
        fill('d-kills', kills);
        fill('d-kdr', (kills / Math.max(1, deaths)).toFixed(2));
      }
      if (u.bp_level != null) $$('.level-hex b').forEach((n) => (n.textContent = u.bp_level));
      const cc = u.country || u.cc;
      if (cc && /^[a-z]{2}$/i.test(cc)) {
        $$('.j-flag').forEach((n) => {
          n.src = `https://flagcdn.com/w40/${cc.toLowerCase()}.png`;
          n.alt = cc.toUpperCase(); n.hidden = false;
        });
      }
    }
    $$('.j-av').forEach((img) => {
      img.src = av;
      img.onerror = () => (img.src = fallbackAv);
    });
    return u;
  }

  async function loadIdentity(myId) {
    return applyIdentity(myId ? await fetchProfile(myId) : null, myId);
  }

  const PRO_API = 'https://europe-west1-csr-plus-331c8.cloudfunctions.net/api';
  const CHECKOUT_HOST = 'https://csr-plus-331c8.web.app';
  const DISCORD_CLIENT_ID = '1526694025757851819';
  const JWT_KEY = 'csrpProToken';
  let proSession = null;
  let proTier = 'free';
  let premiumUntil = 0;
  let modStrikes = 0;
  let modBanned = false;

  const PREMIUM_NAMES = ['rainbow', 'glitch', 'metal'];
  const PREMIUM_FLAIRS = ['holo', 'aurora'];
  const PREMIUM_FRAMES = ['hex', 'glow'];
  const PREMIUM_CHIPS = ['solid', 'gradient'];
  function downgradeConfigToTier(c, tier) {
    const patch = {};
    if (tier !== 'premium') {
      if (c.animName && c.animName !== 'none') patch.animName = 'none';
      if (c.animAvatar && c.animAvatar !== 'none') patch.animAvatar = 'none';
      if (c.overlay && c.overlay !== 'none') patch.overlay = 'none';
      if (PREMIUM_NAMES.includes(c.nameStyle)) patch.nameStyle = 'gradient';
      if (PREMIUM_FLAIRS.includes(c.cardFlair)) patch.cardFlair = 'ring';
      if (PREMIUM_FRAMES.includes(c.avatarFrame)) patch.avatarFrame = 'ring';
      if (PREMIUM_CHIPS.includes(c.chipStyle)) patch.chipStyle = 'outline';
      if (c.fillMode === 'color') patch.fillMode = 'blur';
    }
    if (tier === 'free') {
      if (c.banner) patch.banner = null;
      if (c.bannerOn) patch.bannerOn = false;
      if (c.surf) {
        const surf = {};
        let touched = false;
        for (const k of SURFACES) {
          if (c.surf[k]) { surf[k] = { ...c.surf[k], on: false }; if (c.surf[k].on) touched = true; }
        }
        if (touched) patch.surf = { ...c.surf, ...surf };
      }
    }
    return Object.keys(patch).length ? patch : null;
  }

  function pro(path, { method = 'GET', body = null, token = null, timeoutMs = 0 } = {}) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'csrp:pro', path, method, body, token, timeoutMs }, (resp) => {
          if (chrome.runtime.lastError || !resp) return resolve({ ok: false, error: 'no response' });
          resolve(resp);
        });
      } catch (e) { resolve({ ok: false, error: String(e) }); }
    });
  }
  const jwtExp = (t) => { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp || 0; } catch { return 0; } };
  const tokenValid = (s) => !!(s && s.token && s.exp && s.exp * 1000 > Date.now() + 30000);

  function loadProSession() {
    return new Promise((resolve) => {
      if (proSession) return resolve(proSession);
      if (!extStorage) return resolve(null);
      chrome.storage.local.get([JWT_KEY], (d) => { proSession = (d && d[JWT_KEY]) || null; resolve(proSession); });
    });
  }
  async function proSignIn(interactive = true) {
    const s = await loadProSession();
    if (tokenValid(s)) return s;
    if (!(chrome.identity && chrome.identity.launchWebAuthFlow)) return null;
    const redirectUri = chrome.identity.getRedirectURL();
    const authUrl = 'https://discord.com/api/oauth2/authorize?' + new URLSearchParams({
      client_id: DISCORD_CLIENT_ID, response_type: 'code', redirect_uri: redirectUri, scope: 'identify', prompt: 'consent',
    }).toString();
    const redirect = await new Promise((res) => {
      try { chrome.identity.launchWebAuthFlow({ url: authUrl, interactive }, (r) => res(chrome.runtime.lastError ? null : r)); }
      catch { res(null); }
    });
    if (!redirect) return null;
    const code = new URL(redirect).searchParams.get('code');
    if (!code) return null;
    const resp = await pro('/auth/exchange', { method: 'POST', body: { code, redirectUri } });
    if (!resp.ok || !resp.data || !resp.data.token) return null;
    proSession = { token: resp.data.token, exp: jwtExp(resp.data.token), user: resp.data.user || null };
    if (extStorage) chrome.storage.local.set({ [JWT_KEY]: proSession });
    return proSession;
  }
  async function proToken() {
    const s = await loadProSession();
    if (tokenValid(s)) return s.token;
    const re = await proSignIn(false);
    return tokenValid(re) ? re.token : null;
  }
  function proSignOut() { proSession = null; proTier = 'free'; if (extStorage) chrome.storage.local.remove(JWT_KEY); reflectAccount(); }

  function reflectAccount() {
    const signedIn = tokenValid(proSession);
    const rank = { free: 0, pro: 1, premium: 2 };
    const chip = $('#mode-chip');

    const user = proSession && proSession.user;
    const nameEl = $('#acct-name'), avEl = $('#acct-av'), dot = $('#acct-tier-dot');
    if (nameEl) nameEl.textContent = signedIn ? (user && user.name ? user.name : 'Signed in') : 'Not signed in';
    if (avEl) {
      avEl.src = (signedIn && user && user.avatar && user.id)
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
        : '../assets/icon128.png';
      avEl.onerror = () => { avEl.src = '../assets/icon128.png'; };
    }
    if (dot) dot.className = 'acct-tier-dot' + (signedIn && proTier !== 'free' ? ' t-' + proTier : '');

    const badge = $('#tier-badge');
    if (badge) {
      badge.className = 'acct-tier' + (signedIn && proTier !== 'free' ? ' t-' + proTier : '');
      badge.textContent = signedIn
        ? (proTier === 'premium' ? 'Premium member' : proTier === 'pro' ? 'Pro member' : 'Free account')
        : 'Free · local';
    }

    $('#btn-signin').hidden = signedIn;
    $('#btn-signout').hidden = !signedIn;
    const note = $('#acct-note');
    if (note) note.hidden = signedIn;
    const up = $('#acct-upgrade');
    if (up) up.style.display = (signedIn && proTier === 'premium') ? 'none' : '';

    const hb = $('#hide-banners-row');
    if (hb) hb.hidden = !(signedIn && rank[proTier] >= rank.pro);

    const prem = $('#c-anim-name')?.closest('.prem-panel');
    if (prem) prem.classList.toggle('prem-locked', !(signedIn && proTier === 'premium'));
    const lock = $('#prem-lock');
    if (lock) lock.hidden = signedIn && proTier === 'premium';

    if (chip) chip.textContent = signedIn
      ? (proTier === 'free' ? 'SIGNED IN · FREE' : proTier.toUpperCase() + ' · SHARED')
      : 'TEST MODE · LOCAL';

    const tb = $('#tier-badge');
    if (tb && signedIn && proTier !== 'free' && premiumUntil) {
      const d = new Date(premiumUntil);
      if (!isNaN(d)) tb.textContent = (proTier === 'premium' ? 'Premium' : 'Pro') +
        ' · until ' + d.toISOString().slice(0, 10);
    }

    const mw = $('#mod-warn');
    if (mw) {
      if (signedIn && modBanned) {
        mw.hidden = false; mw.className = 'mod-warn banned';
        mw.textContent = '⛔ Banner uploads disabled — 3/3 moderation strikes';
      } else if (signedIn && modStrikes > 0) {
        mw.hidden = false; mw.className = 'mod-warn';
        mw.textContent = `⚠ Moderation warnings: ${modStrikes}/3`;
      } else { mw.hidden = true; }
    }
  }

  async function refreshTier() {
    const token = await proToken();
    if (!token) { proTier = 'free'; reflectAccount(); return; }
    const resp = await pro('/me', { token });
    if (resp.ok && resp.data) {
      proTier = resp.data.tier || 'free';
      premiumUntil = resp.data.premiumUntil || 0;
      modStrikes = resp.data.moderationStrikes || 0;
      modBanned = !!resp.data.moderationBanned;
      proSession.user = proSession.user || resp.data.user;
      previewTier = proTier;
      const dg = downgradeConfigToTier(cfg, proTier);
      if (dg) {
        Object.assign(cfg, dg);
        paint(); save();
        toast(proTier === 'free'
          ? 'Cosmetics reset to match your Free plan'
          : 'Some premium cosmetics were reset to match your ' + (proTier === 'pro' ? 'Pro' : 'plan'));
      } else {
        paintTierBadge();
      }
    }
    reflectAccount();
  }

  function bindAccount() {
    const hideArea = (chrome.storage && chrome.storage.sync) ? chrome.storage.sync : chrome.storage.local;
    const hideToggle = $('#c-hide-banners');
    if (extStorage) hideArea.get(['hideBanners'], (d) => { hideToggle.checked = d.hideBanners === true; });
    hideToggle?.addEventListener('change', () => {
      if (extStorage) {
        hideArea.set({ hideBanners: hideToggle.checked });
        if (hideArea !== chrome.storage.local) chrome.storage.local.set({ hideBanners: hideToggle.checked });
      }
      toast(hideToggle.checked ? 'Other players’ banners hidden' : 'Banners shown');
    });

    $('#btn-signin')?.addEventListener('click', async () => {
      $('#btn-signin').disabled = true;
      const s = await proSignIn(true);
      $('#btn-signin').disabled = false;
      if (!s) return toast('Sign-in failed or cancelled');
      await refreshTier();
      toast('Signed in with Discord');
    });
    $('#btn-signout')?.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Log out of CSR+?',
        body: 'You will stop sharing your look with other CSR+ players until you sign back in. Your local settings stay saved.',
        okLabel: 'Log out', danger: true,
      });
      if (ok) proSignOut();
    });

    const openSubs = () => {
      const url = chrome.runtime.getURL('subscribe/subscribe.html');
      try { chrome.tabs.create({ url }); } catch { window.open(url, '_blank', 'noopener'); }
    };
    $('#btn-open-subs')?.addEventListener('click', openSubs);
    $('#prem-upsell')?.addEventListener('click', (e) => { e.preventDefault(); openSubs(); });

    $('#c-preview-tier')?.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      previewTier = b.dataset.v;
      paintTierBadge();
    });
  }

  load(async (storedId) => {
    bind(); bindAccount(); paint(); rescale();
    loadProSession().then(() => {
      reflectAccount();
      if (tokenValid(proSession)) refreshTier();
    });
    const me = await fetchMe();
    if (me && me.id) {
      const id = String(me.id);
      if (extStorage && (id !== String(storedId || ''))) {
        chrome.storage.local.set({ csrpMyId: id });
      }
      applyIdentity(me, id);
    } else {
      if (!storedId) toast('Log in on csrestored.fun to see your real profile in the preview');
      await loadIdentity(storedId);
    }
    queueRescale();
  });
})();
