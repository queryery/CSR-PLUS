"use strict";

const {onRequest} = require("firebase-functions/v2/https");

const {defineSecret, defineString} = require("firebase-functions/params");

const admin = require("firebase-admin");

const jwt = require("jsonwebtoken");

const sharp = require("sharp");

const vision = require("@google-cloud/vision");

const ffmpeg = require("fluent-ffmpeg");

const ffmpegStatic = require("ffmpeg-static");

const os = require("os");

const fs = require("fs");

const path = require("path");

const crypto = require("crypto");

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);

admin.initializeApp();

const db = admin.firestore();

const bucket = () => admin.storage().bucket();

let _vision = null;

const visionClient = () => _vision || (_vision = new vision.ImageAnnotatorClient);

const DISCORD_CLIENT_ID = defineString("DISCORD_CLIENT_ID");

const DISCORD_CLIENT_SECRET = defineSecret("DISCORD_CLIENT_SECRET");

const JWT_SECRET = defineSecret("JWT_SECRET");

const TELEGRAM_BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");

const TELEGRAM_CHAT_ID = defineString("TELEGRAM_CHAT_ID");

const TELEGRAM_WEBHOOK_SECRET = defineSecret("TELEGRAM_WEBHOOK_SECRET");

const DISCORD_REPORT_WEBHOOK = defineSecret("DISCORD_REPORT_WEBHOOK");

const DISCORD_OWNER_ID = defineString("DISCORD_OWNER_ID", {
  default: ""
});

const EXTENSION_ID = defineString("EXTENSION_ID");

const CHECKOUT_HOST = defineString("CHECKOUT_HOST", {
  default: ""
});

const TOKEN_TTL = "12h";

const BANNER_MAX_BYTES = 40 * 1024 * 1024;

const REPORT_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

const BANNER_W = 1920;

const BANNER_H = 480;

const ANIM_MAX_SECONDS = 10;

const TIER_RANK = {
  free: 0,
  pro: 1,
  premium: 2
};

const DEFAULT_CONFIG = {
  prices: {
    pro: 2,
    premium: 4
  },
  bannerMaxBytes: {
    free: 0,
    pro: 20 * 1024 * 1024,
    premium: 40 * 1024 * 1024
  },
  animatedBanner: {
    pro: false,
    premium: true
  },
  reportVideoMaxBytes: 50 * 1024 * 1024,
  minVersion: "0.1.1",
  updateRequired: true,
  updateUrl: "https://github.com/queryery/CSR-PLUS/releases/latest",
  updateMessage: "CSR+ 0.1.1 is here — a redesigned Play tab, a live in-queue list, remade banner effects and a bunch of fixes. Update to keep using CSR+.",
  premium: {
    nameStyles: [ "rainbow", "glitch", "metal" ],
    cardFlairs: [ "holo", "aurora" ],
    avatarFrames: [ "hex", "glow" ],
    chipStyles: [ "solid", "gradient" ],
    fillModeColor: true,
    animName: true,
    animAvatar: true,
    overlay: true
  }
};

let _cfgCache = {
  at: 0,
  val: null
};

const CONFIG_TTL = 30 * 1e3;

async function getConfig() {
  if (_cfgCache.val && Date.now() - _cfgCache.at < CONFIG_TTL) return _cfgCache.val;
  let stored = {};
  try {
    const snap = await db.doc("config/tiers").get();
    if (snap.exists) stored = snap.data() || {};
  } catch {}
  const val = mergeConfig(DEFAULT_CONFIG, stored);
  _cfgCache = {
    at: Date.now(),
    val
  };
  return val;
}

function mergeConfig(base, over) {
  const out = JSON.parse(JSON.stringify(base));
  if (over.prices && typeof over.prices === "object") Object.assign(out.prices, pickNums(over.prices, [ "pro", "premium" ]));
  if (over.bannerMaxBytes && typeof over.bannerMaxBytes === "object") Object.assign(out.bannerMaxBytes, pickNums(over.bannerMaxBytes, [ "free", "pro", "premium" ]));
  if (over.animatedBanner && typeof over.animatedBanner === "object") {
    if (typeof over.animatedBanner.pro === "boolean") out.animatedBanner.pro = over.animatedBanner.pro;
    if (typeof over.animatedBanner.premium === "boolean") out.animatedBanner.premium = over.animatedBanner.premium;
  }
  if (Number.isFinite(+over.reportVideoMaxBytes)) out.reportVideoMaxBytes = clampNum(over.reportVideoMaxBytes, 0, 200 * 1024 * 1024);
  if (typeof over.minVersion === "string" && /^\d+(\.\d+){0,3}$/.test(over.minVersion)) out.minVersion = over.minVersion;
  if (typeof over.updateRequired === "boolean") out.updateRequired = over.updateRequired;
  if (typeof over.updateUrl === "string" && /^https:\/\//.test(over.updateUrl)) out.updateUrl = over.updateUrl.slice(0, 300);
  if (typeof over.updateMessage === "string") out.updateMessage = over.updateMessage.slice(0, 300);
  if (over.premium && typeof over.premium === "object") {
    const p = over.premium;
    if (Array.isArray(p.nameStyles)) out.premium.nameStyles = p.nameStyles.filter(x => typeof x === "string").slice(0, 20);
    if (Array.isArray(p.cardFlairs)) out.premium.cardFlairs = p.cardFlairs.filter(x => typeof x === "string").slice(0, 20);
    if (Array.isArray(p.avatarFrames)) out.premium.avatarFrames = p.avatarFrames.filter(x => typeof x === "string").slice(0, 20);
    if (Array.isArray(p.chipStyles)) out.premium.chipStyles = p.chipStyles.filter(x => typeof x === "string").slice(0, 20);
    for (const k of [ "fillModeColor", "animName", "animAvatar", "overlay" ]) if (typeof p[k] === "boolean") out.premium[k] = p[k];
  }
  return out;
}

function pickNums(obj, keys) {
  const out = {};
  for (const k of keys) if (Number.isFinite(+obj[k])) out[k] = Math.max(0, Math.round(+obj[k]));
  return out;
}

function allowedOrigins() {
  const list = [];
  const id = EXTENSION_ID.value();
  if (id) list.push(`chrome-extension://${id}`);
  const co = CHECKOUT_HOST.value();
  if (co) list.push(co.replace(/\/+$/, ""));
  return list;
}

function cors(req, res) {
  const origin = req.get("Origin") || "";
  const allow = allowedOrigins();
  if (allow.includes(origin)) res.set("Access-Control-Allow-Origin", origin); else if (allow.length) res.set("Access-Control-Allow-Origin", allow[0]);
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

const bad = (res, code, msg) => res.status(code).json({
  ok: false,
  error: msg
});

const ok = (res, data) => res.json({
  ok: true,
  ...data
});

function signToken(uid, name) {
  return jwt.sign({
    sub: uid,
    name
  }, JWT_SECRET.value(), {
    expiresIn: TOKEN_TTL
  });
}

function auth(req) {
  const m = /^Bearer (.+)$/.exec(req.get("Authorization") || "");
  if (!m) return null;
  try {
    return jwt.verify(m[1], JWT_SECRET.value());
  } catch {
    return null;
  }
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

async function rateLimit(key, perWindow, windowMs = 36e5) {
  const ref = db.doc(`ratelimits/${key}`);
  const now = Date.now();
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const d = snap.exists ? snap.data() : {
      start: now,
      n: 0
    };
    if (now - d.start > windowMs) {
      d.start = now;
      d.n = 0;
    }
    d.n += 1;
    tx.set(ref, d);
    return d.n <= perWindow;
  });
}

function resolveTier(d) {
  return "premium";
}

function tierAtLeast(d, min) {
  return TIER_RANK[resolveTier(d)] >= TIER_RANK[min];
}

const HEX = /^#[0-9a-fA-F]{6}$/;

const NAME_STYLES = [ "none", "gradient", "outline", "metal", "rainbow", "glitch" ];

const CARD_FLAIRS = [ "none", "ring", "corners", "scanline", "holo", "aurora", "kanji" ];

const AVATAR_FRAMES = [ "none", "ring", "hex", "glow" ];

const CHIP_STYLES = [ "outline", "solid", "gradient" ];

const FILL_MODES = [ "blur", "color" ];

const SURFACES = [ "profile", "card", "lobby" ];

const ANIM_NAMES = [ "none", "shimmer", "pulse", "wave", "flicker", "breathe", "glitchpop" ];

const ANIM_AVATARS = [ "none", "spin", "orbit", "halo", "sonar", "prism" ];

const OVERLAYS = [ "none", "particles", "sweep", "rain", "snow", "embers", "stars", "grid", "bokeh", "storm" ];

const MAX_OVERLAYS = 3;

const clampNum = (v, lo, hi) => Math.max(lo, Math.min(hi, +v));

const pct = v => Math.max(0, Math.min(100, Math.round(+v)));

function sanitizeCustomization(body) {
  const out = {};
  const b = body || {};
  if (b.accent != null) {
    if (!HEX.test(String(b.accent))) throw new Error("accent must be #rrggbb");
    out.accent = String(b.accent).toLowerCase();
  }
  if (b.accent2 != null) {
    if (!HEX.test(String(b.accent2))) throw new Error("accent2 must be #rrggbb");
    out.accent2 = String(b.accent2).toLowerCase();
  }
  if (b.fxColor !== undefined) {
    if (b.fxColor === null || b.fxColor === "") out.fxColor = null; else if (HEX.test(String(b.fxColor))) out.fxColor = String(b.fxColor).toLowerCase(); else throw new Error("fxColor must be #rrggbb");
  }
  if (b.fxColor2 !== undefined) {
    if (b.fxColor2 === null || b.fxColor2 === "") out.fxColor2 = null; else if (HEX.test(String(b.fxColor2))) out.fxColor2 = String(b.fxColor2).toLowerCase(); else throw new Error("fxColor2 must be #rrggbb");
  }
  if (b.fillColor != null) {
    if (!HEX.test(String(b.fillColor))) throw new Error("fillColor must be #rrggbb");
    out.fillColor = String(b.fillColor).toLowerCase();
  }
  if (b.nameStyle != null) {
    if (!NAME_STYLES.includes(b.nameStyle)) throw new Error("bad nameStyle");
    out.nameStyle = b.nameStyle;
  }
  if (b.cardFlair != null) {
    if (!CARD_FLAIRS.includes(b.cardFlair)) throw new Error("bad cardFlair");
    out.cardFlair = b.cardFlair;
  }
  if (b.avatarFrame != null) {
    if (!AVATAR_FRAMES.includes(b.avatarFrame)) throw new Error("bad avatarFrame");
    out.avatarFrame = b.avatarFrame;
  }
  if (b.chipStyle != null) {
    if (!CHIP_STYLES.includes(b.chipStyle)) throw new Error("bad chipStyle");
    out.chipStyle = b.chipStyle;
  }
  if (b.fillMode != null) {
    if (!FILL_MODES.includes(b.fillMode)) throw new Error("bad fillMode");
    out.fillMode = b.fillMode;
  }
  if (b.chip != null) out.chip = String(b.chip).slice(0, 24);
  if (b.kanji != null) out.kanji = String(b.kanji).slice(0, 6);
  if (b.animName != null) {
    if (!ANIM_NAMES.includes(b.animName)) throw new Error("bad animName");
    out.animName = b.animName;
  }
  if (b.animAvatar != null) {
    if (!ANIM_AVATARS.includes(b.animAvatar)) throw new Error("bad animAvatar");
    out.animAvatar = b.animAvatar;
  }
  if (b.overlay != null) {
    if (!OVERLAYS.includes(b.overlay)) throw new Error("bad overlay");
    out.overlay = b.overlay;
  }
  if (b.overlays != null) {
    if (!Array.isArray(b.overlays)) throw new Error("overlays must be an array");
    const list = [ ...new Set(b.overlays.filter(x => typeof x === "string" && x !== "none")) ];
    for (const x of list) if (!OVERLAYS.includes(x)) throw new Error("bad overlay");
    out.overlays = list.slice(0, MAX_OVERLAYS);
  }
  if (b.bannerEnabled != null) out.bannerEnabled = !!b.bannerEnabled;
  if (b.bannerOn != null) out.bannerOn = !!b.bannerOn;
  if (b.bannerBlur != null) out.bannerBlur = Math.round(clampNum(b.bannerBlur, 0, 16));
  if (b.bannerDim != null) out.bannerDim = Math.round(clampNum(b.bannerDim, 0, 100));
  if (b.surf && typeof b.surf === "object") {
    out.surf = {};
    for (const k of SURFACES) {
      const s = b.surf[k];
      if (!s || typeof s !== "object") continue;
      out.surf[k] = {
        on: !!s.on,
        x: pct(s.x ?? 50),
        y: pct(s.y ?? 50),
        scale: clampNum(s.scale ?? 1, .4, 3),
        rot: Math.round(clampNum(s.rot ?? 0, -180, 180))
      };
    }
  }
  return out;
}

function publicView(d) {
  if (!d) return null;
  const tier = resolveTier(d);
  const bannerApproved = d.bannerEnabled && d.bannerStatus === "approved" && d.bannerUrl;
  const bannerOk = bannerApproved && TIER_RANK[tier] >= TIER_RANK.pro;
  const animOk = bannerOk && d.bannerKind === "anim" && tier === "premium";
  return {
    tier,
    accent: d.accent || null,
    accent2: d.accent2 || null,
    nameStyle: d.nameStyle || "none",
    cardFlair: d.cardFlair || "none",
    avatarFrame: d.avatarFrame || "none",
    chip: d.chip || null,
    chipStyle: d.chipStyle || "outline",
    kanji: d.kanji || null,
    fillMode: d.fillMode || "blur",
    fillColor: d.fillColor || null,
    banner: bannerOk ? d.bannerUrl : null,
    bannerKind: animOk ? "anim" : bannerOk ? "static" : null,
    bannerMime: bannerOk ? d.bannerMime || null : null,
    bannerBlur: d.bannerBlur ?? 0,
    bannerDim: d.bannerDim ?? 30,
    surf: d.surf || null,
    animName: tier === "premium" ? d.animName || "none" : "none",
    animAvatar: tier === "premium" ? d.animAvatar || "none" : "none",
    overlay: tier === "premium" ? d.overlay || "none" : "none",
    overlays: tier === "premium" && Array.isArray(d.overlays) ? d.overlays.slice(0, 3) : null,
    fxColor: d.fxColor || null,
    fxColor2: d.fxColor2 || null
  };
}

const hot = v => v === "VERY_LIKELY";

function safeSearchBlocks(s) {
  return !!(s && (hot(s.adult) || hot(s.violence)));
}

async function moderateStill(buf) {
  const [result] = await visionClient().safeSearchDetection({
    image: {
      content: buf
    }
  });
  return safeSearchBlocks(result.safeSearchAnnotation || {});
}

async function strike(uid, d) {
  const strikes = (d.moderationStrikes || 0) + 1;
  await db.doc(`profiles/${uid}`).set({
    moderationStrikes: strikes,
    moderationBanned: strikes >= 3,
    bannerStatus: "rejected"
  }, {
    merge: true
  });
  return {
    banned: strikes >= 3
  };
}

function allowedRedirect(redirectUri) {
  if (/^https:\/\/[a-p]{32}\.chromiumapp\.org\/?$/.test(redirectUri)) return true;
  if (/^https:\/\/[0-9a-f-]{32,64}\.extensions\.allizom\.org\/?$/.test(redirectUri)) return true;
  const host = (CHECKOUT_HOST.value() || "").replace(/\/+$/, "");
  if (host && (redirectUri === `${host}/admin` || redirectUri === `${host}/admin/`)) return true;
  return false;
}

async function handleAuthExchange(req, res) {
  const {code, redirectUri} = req.body || {};
  if (!code || !redirectUri) return bad(res, 400, "code and redirectUri required");
  if (!allowedRedirect(redirectUri)) return bad(res, 400, "bad redirectUri");
  const r = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: DISCORD_CLIENT_ID.value(),
      client_secret: DISCORD_CLIENT_SECRET.value(),
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    })
  });
  if (!r.ok) return bad(res, 401, "discord code exchange failed");
  const tok = await r.json();
  const ur = await fetch("https://discord.com/api/users/@me", {
    headers: {
      Authorization: "Bearer " + tok.access_token
    }
  });
  if (!ur.ok) return bad(res, 401, "discord user fetch failed");
  const user = await ur.json();
  await db.doc(`profiles/${user.id}`).set({
    name: user.username,
    lastLoginAt: admin.firestore.FieldValue.serverTimestamp()
  }, {
    merge: true
  });
  return ok(res, {
    token: signToken(user.id, user.username),
    user: {
      id: user.id,
      name: user.username,
      avatar: user.avatar
    }
  });
}

async function handleMe(req, res, claims) {
  const snap = await db.doc(`profiles/${claims.sub}`).get();
  const d = snap.exists ? snap.data() : {};
  trackActive(claims.sub, req.query && req.query.v || null).catch(() => {});
  return ok(res, {
    user: {
      id: claims.sub,
      name: claims.name
    },
    tier: resolveTier(d),
    premiumUntil: d.premiumUntil || null,
    chargeback: !!d.chargeback,
    moderationStrikes: d.moderationStrikes || 0,
    moderationBanned: !!d.moderationBanned,
    customization: {
      accent: d.accent || null,
      accent2: d.accent2 || null,
      fillMode: d.fillMode || "blur",
      fillColor: d.fillColor || null,
      nameStyle: d.nameStyle || "none",
      cardFlair: d.cardFlair || "none",
      avatarFrame: d.avatarFrame || "none",
      chip: d.chip || null,
      chipStyle: d.chipStyle || "outline",
      kanji: d.kanji || null,
      bannerEnabled: !!d.bannerEnabled,
      bannerOn: !!d.bannerOn,
      bannerUrl: d.bannerUrl || null,
      bannerStatus: d.bannerStatus || null,
      bannerKind: d.bannerKind || null,
      bannerMime: d.bannerMime || null,
      bannerBlur: d.bannerBlur ?? 0,
      bannerDim: d.bannerDim ?? 30,
      surf: d.surf || null,
      animName: d.animName || "none",
      animAvatar: d.animAvatar || "none",
      overlay: d.overlay || "none"
    },
    moderationBanned: !!d.moderationBanned
  });
}

const PREMIUM_FLAIRS = [ "holo", "aurora" ];

const PREMIUM_NAMES = [ "rainbow", "glitch", "metal" ];

const PREMIUM_FRAMES = [ "hex", "glow" ];

function wantsPremiumCosmetic(b) {
  return PREMIUM_FLAIRS.includes(b.cardFlair) || PREMIUM_NAMES.includes(b.nameStyle) || PREMIUM_FRAMES.includes(b.avatarFrame) || b.animName && b.animName !== "none" || b.animAvatar && b.animAvatar !== "none" || b.overlay && b.overlay !== "none";
}

async function handleSetCustomization(req, res, claims) {
  if (!await rateLimit(`${claims.sub}_custom`, 120)) return bad(res, 429, "slow down");
  const snap = await db.doc(`profiles/${claims.sub}`).get();
  const d = snap.exists ? snap.data() : {};
  if (d.moderationBanned) return bad(res, 403, "customization disabled for this account");
  const tier = resolveTier(d);
  if (wantsPremiumCosmetic(req.body || {}) && tier !== "premium") return bad(res, 402, "this cosmetic requires CSR+ Premium");
  let fields;
  try {
    fields = sanitizeCustomization(req.body || {});
  } catch (e) {
    return bad(res, 400, e.message);
  }
  if (TIER_RANK[tier] < TIER_RANK.pro) fields.bannerEnabled = false;
  fields.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  await db.doc(`profiles/${claims.sub}`).set(fields, {
    merge: true
  });
  return ok(res, {});
}

const mb = n => Math.round(n / (1024 * 1024));

async function handleBannerUpload(req, res, claims) {
  const snap = await db.doc(`profiles/${claims.sub}`).get();
  const d = snap.exists ? snap.data() : {};
  const tier = resolveTier(d);
  if (!tierAtLeast(d, "pro")) return bad(res, 402, "CSR+ Pro subscription required");
  if (d.moderationBanned) return bad(res, 403, "customization disabled for this account");
  if (!await rateLimit(`${claims.sub}_banner`, 10)) return bad(res, 429, "too many uploads, try later");
  const cfg = await getConfig();
  const cap = cfg.bannerMaxBytes[tier] || 0;
  const b64 = req.body && req.body.image || "";
  const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(b64);
  if (!m) return bad(res, 400, "image must be a png/jpeg/webp data URL");
  const approxBytes = Math.floor(m[2].length * .75);
  if (approxBytes > cap) return bad(res, 413, `image too large (max ${mb(cap)} MB on your plan)`);
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > cap) return bad(res, 413, `image too large (max ${mb(cap)} MB on your plan)`);
  let webp;
  try {
    webp = await sharp(buf, {
      limitInputPixels: 6e7
    }).resize(BANNER_W, null, {
      fit: "inside",
      withoutEnlargement: true
    }).webp({
      quality: 82
    }).toBuffer();
  } catch {
    return bad(res, 400, "not a decodable image");
  }
  try {
    if (await moderateStill(webp)) {
      const {banned} = await strike(claims.sub, d);
      return bad(res, 422, banned ? "banner rejected — customization has been disabled after repeated violations" : "banner rejected by content moderation");
    }
  } catch (e) {
    console.error("vision failed", e);
    return bad(res, 503, "moderation unavailable, try again later");
  }
  const key = `banners/${claims.sub}.webp`;
  await saveBanner(key, webp, "image/webp");
  const url = publicUrl(key);
  await db.doc(`profiles/${claims.sub}`).set({
    bannerUrl: url,
    bannerStatus: "approved",
    bannerEnabled: true,
    bannerKind: "static",
    bannerMime: "image/webp",
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, {
    merge: true
  });
  return ok(res, {
    bannerUrl: url,
    bannerKind: "static"
  });
}

async function handleAnimatedBannerUpload(req, res, claims) {
  const snap = await db.doc(`profiles/${claims.sub}`).get();
  const d = snap.exists ? snap.data() : {};
  const tier = resolveTier(d);
  const cfg = await getConfig();
  if (!cfg.animatedBanner[tier]) return bad(res, 402, "CSR+ Premium subscription required");
  if (d.moderationBanned) return bad(res, 403, "customization disabled for this account");
  if (!await rateLimit(`${claims.sub}_animbanner`, 6)) return bad(res, 429, "too many uploads, try later");
  const cap = cfg.bannerMaxBytes[tier] || 0;
  const dataUrl = req.body && req.body.media || "";
  const m = /^data:(video\/(?:mp4|webm)|image\/(?:gif|webp));base64,(.+)$/.exec(dataUrl);
  if (!m) return bad(res, 400, "media must be an mp4/webm video or animated gif/webp data URL");
  const mime = m[1];
  const approxBytes = Math.floor(m[2].length * .75);
  if (approxBytes > cap) return bad(res, 413, `media too large (max ${mb(cap)} MB on your plan)`);
  const inBuf = Buffer.from(m[2], "base64");
  if (inBuf.length > cap) return bad(res, 413, `media too large (max ${mb(cap)} MB on your plan)`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "csrp-anim-"));
  const cleanup = () => {
    try {
      fs.rmSync(tmp, {
        recursive: true,
        force: true
      });
    } catch {}
  };
  try {
    let outKey, outMime, outBuf, frames;
    if (mime.startsWith("video/")) {
      const inPath = path.join(tmp, "in");
      fs.writeFileSync(inPath, inBuf);
      const outPath = path.join(tmp, "out.webm");
      await transcodeWebm(inPath, outPath);
      outBuf = fs.readFileSync(outPath);
      frames = await sampleVideoFrames(outPath, tmp);
      outKey = `banners/${claims.sub}.webm`;
      outMime = "video/webm";
    } else {
      outBuf = await sharp(inBuf, {
        animated: true,
        limitInputPixels: 6e7
      }).resize(BANNER_W, null, {
        fit: "inside",
        withoutEnlargement: true
      }).webp({
        quality: 80
      }).toBuffer();
      frames = await sampleImageFrames(inBuf);
      outKey = `banners/${claims.sub}.anim.webp`;
      outMime = "image/webp";
    }
    try {
      for (const f of frames) {
        if (await moderateStill(f)) {
          const {banned} = await strike(claims.sub, d);
          cleanup();
          return bad(res, 422, banned ? "banner rejected — customization has been disabled after repeated violations" : "banner rejected by content moderation");
        }
      }
    } catch (e) {
      console.error("vision failed (anim)", e);
      cleanup();
      return bad(res, 503, "moderation unavailable, try again later");
    }
    await saveBanner(outKey, outBuf, outMime);
    const url = publicUrl(outKey);
    await db.doc(`profiles/${claims.sub}`).set({
      bannerUrl: url,
      bannerStatus: "approved",
      bannerEnabled: true,
      bannerKind: "anim",
      bannerMime: outMime,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, {
      merge: true
    });
    cleanup();
    return ok(res, {
      bannerUrl: url,
      bannerKind: "anim",
      bannerMime: outMime
    });
  } catch (e) {
    cleanup();
    console.error("anim transcode failed", e);
    return bad(res, 400, "could not process media");
  }
}

function transcodeWebm(inPath, outPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inPath).inputOptions([ "-t", String(ANIM_MAX_SECONDS + 1) ]).noAudio().duration(ANIM_MAX_SECONDS).videoCodec("libvpx-vp9").outputOptions([ "-b:v", "1.2M", "-crf", "34", "-pix_fmt", "yuv420p", "-an", "-t", String(ANIM_MAX_SECONDS), "-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1", "-threads", "4", "-r", "30" ]).videoFilters(`scale=${BANNER_W}:${BANNER_H}:force_original_aspect_ratio=increase,crop=${BANNER_W}:${BANNER_H}`).format("webm").on("end", () => resolve()).on("error", e => reject(e)).save(outPath);
  });
}

function sampleVideoFrames(videoPath, dir) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath).on("end", () => {
      try {
        const files = fs.readdirSync(dir).filter(f => /^frame-\d+\.png$/.test(f));
        resolve(files.map(f => fs.readFileSync(path.join(dir, f))));
      } catch (e) {
        reject(e);
      }
    }).on("error", e => reject(e)).screenshots({
      count: 4,
      filename: "frame-%i.png",
      folder: dir,
      size: `${BANNER_W}x${BANNER_H}`
    });
  });
}

async function sampleImageFrames(buf) {
  const img = sharp(buf, {
    animated: true
  });
  const meta = await img.metadata();
  const pages = meta.pages || 1;
  const idxs = pages <= 1 ? [ 0 ] : [ ...new Set([ 0, Math.floor(pages / 4), Math.floor(pages / 2), pages - 1 ]) ];
  const out = [];
  for (const i of idxs) {
    out.push(await sharp(buf, {
      page: i,
      limitInputPixels: 6e7
    }).png().toBuffer());
  }
  return out;
}

async function saveBanner(key, buf, contentType) {
  const others = [ `banners/${key.split("/")[1].split(".")[0]}.webp`, `banners/${key.split("/")[1].split(".")[0]}.webm`, `banners/${key.split("/")[1].split(".")[0]}.anim.webp` ];
  await Promise.all(others.filter(k => k !== key).map(k => bucket().file(k).delete().catch(() => {})));
  const file = bucket().file(key);
  await file.save(buf, {
    contentType,
    metadata: {
      cacheControl: "public, max-age=300"
    }
  });
  await file.makePublic();
}

const publicUrl = key => `https://storage.googleapis.com/${bucket().name}/${key}?v=${Date.now()}`;

async function handlePublicProfiles(req, res) {
  const ids = String(req.query.ids || "").split(",").map(s => s.trim()).filter(s => /^\d{15,21}$/.test(s)).slice(0, 25);
  if (!ids.length) return bad(res, 400, "ids required");
  const snaps = await db.getAll(...ids.map(id => db.doc(`profiles/${id}`)));
  const out = {};
  snaps.forEach((s, i) => {
    if (s.exists) {
      const v = publicView(s.data());
      if (v) out[ids[i]] = v;
    }
  });
  res.set("Cache-Control", "public, max-age=300");
  return ok(res, {
    profiles: out
  });
}

const REPORT_REASONS = [ "Cheating", "Toxic/Harassment", "Griefing/Trolling", "Offensive name/avatar", "Ban evasion", "Other" ];

const tgEscape = s => String(s || "").replace(/[<>&]/g, c => ({
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;"
}[c]));

const STATUS_LABELS = {
  checking: "👀 Checking",
  punished: "✅ Punished",
  insufficient: "❔ Not enough info",
  rejected: "🚫 Fake report"
};

function statusKeyboard(reportId) {
  return {
    inline_keyboard: [ [ {
      text: STATUS_LABELS.checking,
      callback_data: `s:${reportId}:checking`
    }, {
      text: STATUS_LABELS.punished,
      callback_data: `s:${reportId}:punished`
    } ], [ {
      text: STATUS_LABELS.insufficient,
      callback_data: `s:${reportId}:insufficient`
    }, {
      text: STATUS_LABELS.rejected,
      callback_data: `s:${reportId}:rejected`
    } ] ]
  };
}

async function tgApi(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN.value()}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  try {
    return await r.json();
  } catch {
    return {
      ok: r.ok
    };
  }
}

async function tgSend(method, body) {
  const j = await tgApi(method, body);
  return {
    ok: !!(j && j.ok),
    messageId: j && j.result && j.result.message_id
  };
}

async function tgSendMedia(method, field, buf, mime, filename, caption, replyMarkup) {
  const fd = new FormData;
  fd.append("chat_id", TELEGRAM_CHAT_ID.value());
  fd.append("caption", caption);
  fd.append("parse_mode", "HTML");
  if (replyMarkup) fd.append("reply_markup", JSON.stringify(replyMarkup));
  fd.append(field, new Blob([ buf ], {
    type: mime
  }), filename);
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN.value()}/${method}`, {
    method: "POST",
    body: fd
  });
  let j = null;
  try {
    j = await r.json();
  } catch {}
  return {
    ok: !!(j && j.ok),
    messageId: j && j.result && j.result.message_id
  };
}

async function recordEvent(type, data) {
  const now = new Date;
  const day = now.toISOString().slice(0, 10);
  try {
    await db.collection("events").add({
      type,
      ...data,
      day,
      at: admin.firestore.FieldValue.serverTimestamp()
    });
    const inc = admin.firestore.FieldValue.increment(1);
    const patch = {
      [`total.${type}`]: inc,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await db.doc(`stats/daily_${day}`).set({
      day,
      [type]: inc,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, {
      merge: true
    });
    await db.doc("stats/totals").set(patch, {
      merge: true
    });
  } catch (e) {
    console.error("recordEvent failed", e);
  }
}

async function trackActive(uid, version) {
  const day = (new Date).toISOString().slice(0, 10);
  const ref = db.doc(`activity/${uid}`);
  try {
    const snap = await ref.get();
    const prev = snap.exists ? snap.data() : null;
    const firstSeen = !prev;
    await ref.set({
      lastSeen: admin.firestore.FieldValue.serverTimestamp(),
      lastDay: day,
      version: version || null,
      seenDays: admin.firestore.FieldValue.arrayUnion(day)
    }, {
      merge: true
    });
    if (firstSeen) await recordEvent("install", {
      uid
    });
    if (!prev || prev.lastDay !== day) await recordEvent("active", {
      uid,
      day
    });
  } catch (e) {
    console.error("trackActive failed", e);
  }
}

const ACTIVE_WINDOW_MS = 15 * 60 * 1e3;

const QUEUE_WINDOW_MS = 45 * 1e3;

async function handleBeat(req, res) {
  const raw = req.body && req.body.d || "";
  const dev = String(raw).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  if (dev.length < 8) return bad(res, 400, "bad device id");
  const claims = auth(req);
  const siteName = String(req.body && req.body.sn || "").slice(0, 40).trim();
  const inQueue = !!(req.body && req.body.q);
  const pres = {
    lastSeen: admin.firestore.FieldValue.serverTimestamp(),
    v: req.body && String(req.body.v || "").slice(0, 20) || null,
    q: inQueue,
    uid: claims ? String(claims.sub) : null,
    name: claims && siteName ? siteName : null
  };
  const writes = [ db.doc(`presence/${dev}`).set(pres, {
    merge: true
  }) ];
  if (claims && siteName) {
    writes.push(db.doc(`profiles/${claims.sub}`).set({
      siteName,
      siteNameLower: siteName.toLowerCase(),
      siteSeenAt: admin.firestore.FieldValue.serverTimestamp()
    }, {
      merge: true
    }));
  }
  await Promise.all(writes);
  const queueRelevant = claims && (inQueue || pres.name);
  await maybeRefreshQueueDoc(queueRelevant);
  return ok(res, {});
}

const QUEUE_DOC_MIN_MS = 4e3;

let _queueDoc = {
  at: 0,
  sig: null,
  building: false
};

async function maybeRefreshQueueDoc(force) {
  const now = Date.now();
  if (_queueDoc.building) return;
  if (!force && now - _queueDoc.at < QUEUE_DOC_MIN_MS) return;
  _queueDoc.building = true;
  try {
    const qSince = admin.firestore.Timestamp.fromMillis(now - QUEUE_WINDOW_MS);
    const snap = await db.collection("presence").where("lastSeen", ">=", qSince).limit(200).get();
    const users = [];
    const seen = new Set;
    snap.forEach(doc => {
      const d = doc.data() || {};
      if (d.q && d.uid && d.name && !seen.has(d.uid)) {
        seen.add(d.uid);
        users.push({
          id: String(d.uid),
          name: String(d.name).slice(0, 40)
        });
      }
    });
    users.sort((a, b) => a.name.localeCompare(b.name));
    const trimmed = users.slice(0, 25);
    const sig = trimmed.map(u => u.id).join(",");
    _queueDoc.at = now;
    if (sig !== _queueDoc.sig) {
      _queueDoc.sig = sig;
      await db.doc("public/queue").set({
        users: trimmed,
        count: trimmed.length,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  } catch (e) {
    console.error("queue doc refresh failed", e);
  } finally {
    _queueDoc.building = false;
  }
}

const SETTINGS_MAX_BYTES = 32768;

async function handleGetSettings(req, res, claims) {
  const snap = await db.doc(`settings/${claims.sub}`).get();
  if (!snap.exists) return ok(res, {
    settings: null,
    updatedAtMs: null
  });
  const d = snap.data() || {};
  return ok(res, {
    settings: d.data || null,
    updatedAtMs: d.updatedAtMs || null
  });
}

async function handleSaveSettings(req, res, claims) {
  const s = req.body && req.body.settings;
  if (!s || typeof s !== "object" || Array.isArray(s)) return bad(res, 400, "settings object required");
  let raw;
  try {
    raw = JSON.stringify(s);
  } catch {
    return bad(res, 400, "bad settings");
  }
  if (raw.length > SETTINGS_MAX_BYTES) return bad(res, 413, "settings too large");
  await db.doc(`settings/${claims.sub}`).set({
    data: JSON.parse(raw),
    updatedAtMs: Date.now(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return ok(res, {});
}

async function handlePublicLookup(req, res) {
  const names = String(req.query.names || "").split(",").map(s => s.trim().toLowerCase()).filter(s => s && s.length <= 40).slice(0, 25);
  if (!names.length) return bad(res, 400, "names required");
  const out = {};
  for (let i = 0; i < names.length; i += 10) {
    const chunk = names.slice(i, i + 10);
    const snap = await db.collection("profiles").where("siteNameLower", "in", chunk).get();
    snap.forEach(doc => {
      const d = doc.data() || {};
      if (d.siteNameLower) out[d.siteNameLower] = doc.id;
    });
  }
  res.set("Cache-Control", "public, max-age=120");
  return ok(res, {
    ids: out
  });
}

let _statsCache = {
  at: 0,
  val: null
};

async function handlePublicStats(req, res) {
  const now = Date.now();
  if (_statsCache.val && now - _statsCache.at < 8e3) {
    res.set("Cache-Control", "public, max-age=8");
    return ok(res, _statsCache.val);
  }
  const since = admin.firestore.Timestamp.fromMillis(now - ACTIVE_WINDOW_MS);
  const [totalAgg, activeSnap] = await Promise.all([ db.collection("profiles").count().get(), db.collection("presence").where("lastSeen", ">=", since).limit(500).get() ]);
  const qSince = now - QUEUE_WINDOW_MS;
  const queue = [];
  const seen = new Set;
  activeSnap.forEach(doc => {
    const d = doc.data() || {};
    const t = d.lastSeen && d.lastSeen.toMillis ? d.lastSeen.toMillis() : 0;
    if (d.q && d.uid && d.name && t >= qSince && !seen.has(d.uid)) {
      seen.add(d.uid);
      queue.push({
        id: String(d.uid),
        name: String(d.name).slice(0, 40)
      });
    }
  });
  const val = {
    total: totalAgg.data().count || 0,
    active: activeSnap.size || 0,
    queue: queue.slice(0, 25)
  };
  _statsCache = {
    at: now,
    val
  };
  res.set("Cache-Control", "public, max-age=8");
  return ok(res, val);
}

async function dcSendReport(content, media, priority) {
  const url = (DISCORD_REPORT_WEBHOOK.value() || "").trim();
  if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(url)) return false;
  const ownerId = (DISCORD_OWNER_ID.value() || "").trim();
  const fd = new FormData;
  fd.append("payload_json", JSON.stringify({
    content,
    allowed_mentions: priority && /^\d{15,21}$/.test(ownerId) ? {
      users: [ ownerId ]
    } : {
      parse: []
    }
  }));
  if (media) fd.append("files[0]", new Blob([ media.buf ], {
    type: media.mime
  }), media.filename);
  const r = await fetch(url + "?wait=true", {
    method: "POST",
    body: fd
  });
  return r.ok;
}

const dcEscape = s => String(s || "").replace(/([\\`*_~|>#@])/g, "\\$1");

async function handleReport(req, res, claims) {
  const b = req.body || {};
  const targetId = String(b.targetId || "");
  if (!/^\d{15,21}$/.test(targetId)) return bad(res, 400, "bad targetId");
  if (targetId === claims.sub) return bad(res, 400, "you cannot report yourself");
  if (!REPORT_REASONS.includes(b.reason)) return bad(res, 400, "bad reason");
  const desc = String(b.description || "").slice(0, 500);
  if (!await rateLimit(`${claims.sub}_report`, 3)) return bad(res, 429, "report limit reached, try later");
  if (!await rateLimit(`${claims.sub}_report_${targetId}`, 1, 24 * 36e5)) return bad(res, 429, "you already reported this player recently");
  const reporterSnap = await db.doc(`profiles/${claims.sub}`).get();
  const reporterTier = resolveTier(reporterSnap.exists ? reporterSnap.data() : {});
  const priority = reporterTier === "premium";
  const link = id => `https://csrestored.fun/app/user/${id}`;
  const caption = (priority ? `⭐ <b>PRIORITY</b> @queryer\n` : "") + `🚩 <b>CSR+ report</b>\n` + `<b>Reason:</b> ${tgEscape(b.reason)}\n` + `<b>Tier:</b> ${tgEscape(reporterTier)}\n` + `<b>Target:</b> <code>${tgEscape(targetId)}</code> ${tgEscape(link(targetId))}\n` + `<b>Reporter:</b> <code>${tgEscape(claims.sub)}</code> ${tgEscape(link(claims.sub))}\n` + (desc ? `<b>Details:</b> ${tgEscape(desc)}\n` : "");
  let media = null;
  {
    const shot = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(String(b.screenshot || ""));
    const vid = /^data:(video\/(?:mp4|webm));base64,(.+)$/.exec(String(b.video || ""));
    if (vid) {
      const vbuf = Buffer.from(vid[2], "base64");
      if (vbuf.length > REPORT_VIDEO_MAX_BYTES) return bad(res, 413, "video too large (max 50 MB)");
      media = {
        kind: "video",
        buf: vbuf,
        mime: vid[1],
        filename: vid[1] === "video/webm" ? "report.webm" : "report.mp4"
      };
    } else if (shot) {
      media = {
        kind: "photo",
        buf: Buffer.from(shot[2], "base64"),
        mime: "image/" + shot[1],
        filename: "report." + shot[1]
      };
    }
  }
  const id = crypto.randomUUID();
  const kb = statusKeyboard(id);
  let tg = {
    ok: false,
    messageId: null
  };
  try {
    if (media && media.kind === "video") tg = await tgSendMedia("sendVideo", "video", media.buf, media.mime, media.filename, caption, kb); else if (media) tg = await tgSendMedia("sendPhoto", "photo", media.buf, media.mime, media.filename, caption, kb); else tg = await tgSend("sendMessage", {
      chat_id: TELEGRAM_CHAT_ID.value(),
      text: caption,
      parse_mode: "HTML",
      reply_markup: kb
    });
  } catch (e) {
    console.error("telegram send failed", e);
  }
  let sentDc = false;
  try {
    const ownerId = (DISCORD_OWNER_ID.value() || "").trim();
    const dcContent = (priority ? `⭐ **PRIORITY**${/^\d{15,21}$/.test(ownerId) ? ` <@${ownerId}>` : ""}\n` : "") + `🚩 **CSR+ report**\n` + `**Reason:** ${dcEscape(b.reason)}\n` + `**Tier:** ${dcEscape(reporterTier)}\n` + `**Target:** \`${targetId}\` ${link(targetId)}\n` + `**Reporter:** \`${claims.sub}\` ${link(claims.sub)}\n` + (desc ? `**Details:** ${dcEscape(desc)}\n` : "");
    sentDc = await dcSendReport(dcContent, media, priority);
  } catch (e) {
    console.error("discord send failed", e);
  }
  if (!tg.ok && !sentDc) return bad(res, 502, "could not deliver report, try again later");
  await db.doc(`reports/${id}`).set({
    reporterId: claims.sub,
    targetId,
    reason: b.reason,
    description: desc,
    hadMedia: !!(b.screenshot || b.video),
    reporterTier,
    priority,
    status: "sent",
    tgMessageId: tg.messageId || null,
    deliveredTo: [ ...tg.ok ? [ "telegram" ] : [], ...sentDc ? [ "discord" ] : [] ],
    at: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return ok(res, {
    id,
    status: "sent"
  });
}

const REPORT_STATUSES = [ "sent", "checking", "punished", "insufficient", "rejected" ];

async function handleMyReports(req, res, claims) {
  const q = await db.collection("reports").where("reporterId", "==", claims.sub).limit(50).get();
  const items = q.docs.map(s => {
    const r = s.data();
    return {
      id: s.id,
      targetId: r.targetId,
      reason: r.reason,
      status: REPORT_STATUSES.includes(r.status) ? r.status : "sent",
      hadMedia: !!r.hadMedia,
      at: r.at && r.at.toMillis ? r.at.toMillis() : null,
      updatedAt: r.updatedAt && r.updatedAt.toMillis ? r.updatedAt.toMillis() : null
    };
  }).sort((a, b) => (b.at || 0) - (a.at || 0));
  res.set("Cache-Control", "no-store");
  return ok(res, {
    reports: items
  });
}

async function handleTelegramWebhook(req, res) {
  const secret = (TELEGRAM_WEBHOOK_SECRET.value() || "").trim();
  const got = req.get("x-telegram-bot-api-secret-token") || "";
  if (!secret || !safeEqual(got, secret)) return res.status(403).send("");
  const cq = req.body && req.body.callback_query;
  if (!cq || !cq.data) return res.status(200).send("");
  const chatId = cq.message && cq.message.chat && String(cq.message.chat.id);
  if (chatId !== String(TELEGRAM_CHAT_ID.value())) return res.status(200).send("");
  const m = /^s:([0-9a-f-]{36}):([a-z]+)$/.exec(String(cq.data));
  if (!m || !REPORT_STATUSES.includes(m[2])) {
    await tgApi("answerCallbackQuery", {
      callback_query_id: cq.id
    }).catch(() => {});
    return res.status(200).send("");
  }
  const [, reportId, status] = m;
  const ref = db.doc(`reports/${reportId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    await tgApi("answerCallbackQuery", {
      callback_query_id: cq.id,
      text: "Report not found"
    }).catch(() => {});
    return res.status(200).send("");
  }
  await ref.set({
    status,
    moderatedBy: String(cq.from && cq.from.username || cq.from && cq.from.id || "mod").slice(0, 64),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, {
    merge: true
  });
  const label = STATUS_LABELS[status] || status;
  await tgApi("answerCallbackQuery", {
    callback_query_id: cq.id,
    text: `Marked: ${label}`
  }).catch(() => {});
  if (cq.message && cq.message.message_id) {
    await tgApi("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: cq.message.message_id,
      reply_markup: {
        inline_keyboard: [ [ {
          text: `Status: ${label}`,
          callback_data: "noop"
        } ], ...statusKeyboard(reportId).inline_keyboard ]
      }
    }).catch(() => {});
  }
  return res.status(200).send("");
}

function isOwner(claims) {
  const owner = (DISCORD_OWNER_ID.value() || "").trim();
  return !!(claims && owner && /^\d{15,21}$/.test(owner) && String(claims.sub) === owner);
}

async function handleAdminOverview(req, res) {
  const totalsSnap = await db.doc("stats/totals").get();
  const totals = totalsSnap.exists ? totalsSnap.data().total || {} : {};
  const days = [];
  const now = new Date;
  for (let i = 13; i >= 0; i--) {
    const dt = new Date(now.getTime() - i * 864e5);
    days.push(dt.toISOString().slice(0, 10));
  }
  const daySnaps = await db.getAll(...days.map(d => db.doc(`stats/daily_${d}`)));
  const series = daySnaps.map((s, i) => {
    const v = s.exists ? s.data() : {};
    return {
      day: days[i],
      active: v.active || 0,
      install: v.install || 0,
      report: v.report || 0,
      payment: v.payment || 0
    };
  });
  const activeSnap = await db.collection("profiles").where("subActive", "==", true).select("tier").get().catch(() => null);
  let proCount = 0, premCount = 0;
  if (activeSnap) activeSnap.forEach(s => {
    const t = s.get("tier");
    if (t === "pro") proCount++; else if (t === "premium") premCount++;
  });
  const cfg = await getConfig();
  const mrr = proCount * (cfg.prices.pro || 0) + premCount * (cfg.prices.premium || 0);
  return ok(res, {
    totals: {
      installs: totals.install || 0,
      activeEvents: totals.active || 0,
      reports: totals.report || 0,
      payments: totals.payment || 0
    },
    subscribers: {
      pro: proCount,
      premium: premCount,
      mrr
    },
    series
  });
}

async function handleAdminReports(req, res) {
  const status = String(req.query.status || "").trim();
  let q = db.collection("reports");
  if (REPORT_STATUSES.includes(status)) q = q.where("status", "==", status);
  const snap = await q.limit(100).get();
  const items = snap.docs.map(s => {
    const r = s.data();
    return {
      id: s.id,
      reporterId: r.reporterId,
      targetId: r.targetId,
      reason: r.reason,
      description: r.description || "",
      status: REPORT_STATUSES.includes(r.status) ? r.status : "sent",
      reporterTier: r.reporterTier || "free",
      priority: !!r.priority,
      hadMedia: !!r.hadMedia,
      at: r.at && r.at.toMillis ? r.at.toMillis() : null,
      updatedAt: r.updatedAt && r.updatedAt.toMillis ? r.updatedAt.toMillis() : null
    };
  }).sort((a, b) => (b.at || 0) - (a.at || 0));
  return ok(res, {
    reports: items
  });
}

async function handleAdminReportStatus(req, res, claims) {
  const id = String(req.body && req.body.id || "");
  const status = String(req.body && req.body.status || "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return bad(res, 400, "bad id");
  if (!REPORT_STATUSES.includes(status)) return bad(res, 400, "bad status");
  const ref = db.doc(`reports/${id}`);
  if (!(await ref.get()).exists) return bad(res, 404, "not found");
  await ref.set({
    status,
    moderatedBy: `admin:${claims.sub}`,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, {
    merge: true
  });
  return ok(res, {
    status
  });
}

async function handleAdminUsers(req, res) {
  const search = String(req.query.q || "").trim();
  const out = [];
  if (/^\d{15,21}$/.test(search)) {
    const s = await db.doc(`profiles/${search}`).get();
    if (s.exists) out.push(userRow(search, s.data()));
  } else {
    const snap = await db.collection("profiles").where("subActive", "==", true).limit(100).get();
    snap.docs.forEach(s => out.push(userRow(s.id, s.data())));
  }
  return ok(res, {
    users: out
  });
}

function userRow(id, d) {
  return {
    id,
    name: d.name || null,
    tier: resolveTier(d),
    storedTier: d.tier || "free",
    subActive: !!d.subActive,
    chargeback: !!d.chargeback,
    premiumUntil: d.premiumUntil || 0,
    paddleSubId: d.paddleSubId || null,
    moderationStrikes: d.moderationStrikes || 0,
    moderationBanned: !!d.moderationBanned,
    bannerStatus: d.bannerStatus || null,
    bannerUrl: d.bannerUrl || null,
    bannerEnabled: !!d.bannerEnabled,
    bannerKind: d.bannerKind || null
  };
}

async function handleAdminSetTier(req, res, claims) {
  const uid = String(req.body && req.body.uid || "");
  const tier = String(req.body && req.body.tier || "");
  const days = Math.max(0, Math.min(365e4, Math.round(+(req.body && req.body.days) || 365)));
  if (!/^\d{15,21}$/.test(uid)) return bad(res, 400, "bad uid");
  if (![ "free", "pro", "premium" ].includes(tier)) return bad(res, 400, "bad tier");
  const patch = tier === "free" ? {
    tier: "free",
    subActive: false,
    premiumUntil: 0,
    chargeback: false
  } : {
    tier,
    subActive: true,
    chargeback: false,
    premiumUntil: Date.now() + days * 864e5,
    premiumUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  patch.grantedBy = `admin:${claims.sub}`;
  await db.doc(`profiles/${uid}`).set(patch, {
    merge: true
  });
  await recordEvent("admin_grant", {
    uid,
    tier
  });
  return ok(res, {
    tier
  });
}

async function handleAdminBannerModerate(req, res, claims) {
  const uid = String(req.body && req.body.uid || "");
  const action = String(req.body && req.body.action || "");
  if (!/^\d{15,21}$/.test(uid)) return bad(res, 400, "bad uid");
  const ref = db.doc(`profiles/${uid}`);
  if (!(await ref.get()).exists) return bad(res, 404, "not found");
  const patch = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  if (action === "approve") patch.bannerStatus = "approved"; else if (action === "reject") {
    patch.bannerStatus = "rejected";
    patch.bannerEnabled = false;
  } else if (action === "disable") patch.bannerEnabled = false; else if (action === "unban") {
    patch.moderationBanned = false;
    patch.moderationStrikes = 0;
  } else if (action === "ban") patch.moderationBanned = true; else return bad(res, 400, "bad action");
  patch.moderatedBy = `admin:${claims.sub}`;
  await ref.set(patch, {
    merge: true
  });
  return ok(res, {});
}

async function handleAdminGetConfig(req, res) {
  return ok(res, {
    config: await getConfig()
  });
}

async function handleAdminSetConfig(req, res, claims) {
  const body = req.body && req.body.config || {};
  const merged = mergeConfig(DEFAULT_CONFIG, body);
  merged.updatedBy = `admin:${claims.sub}`;
  merged.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  await db.doc("config/tiers").set(merged, {
    merge: false
  });
  _cfgCache = {
    at: 0,
    val: null
  };
  return ok(res, {
    config: await getConfig()
  });
}

exports.api = onRequest({
  region: "europe-west1",
  secrets: [ DISCORD_CLIENT_SECRET, JWT_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, DISCORD_REPORT_WEBHOOK ],
  memory: "1GiB",
  timeoutSeconds: 120,
  maxInstances: 10
}, async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  const p = (req.path || "/").replace(/\/+$/, "") || "/";
  try {
    if (req.method === "GET" && p === "/pub/profiles") {
      const ip = req.get("x-forwarded-for") || req.ip || "anon";
      if (!await rateLimit(`ip_${ip.split(",")[0].trim()}_pub`, 300)) return bad(res, 429, "slow down");
      return await handlePublicProfiles(req, res);
    }
    if (req.method === "GET" && p === "/stats") {
      const ip = req.get("x-forwarded-for") || req.ip || "anon";
      if (!await rateLimit(`ip_${ip.split(",")[0].trim()}_stats`, 300)) return bad(res, 429, "slow down");
      return await handlePublicStats(req, res);
    }
    if (req.method === "POST" && p === "/beat") {
      const ip = req.get("x-forwarded-for") || req.ip || "anon";
      if (!await rateLimit(`ip_${ip.split(",")[0].trim()}_beat`, 600)) return bad(res, 429, "slow down");
      return await handleBeat(req, res);
    }
    if (req.method === "GET" && p === "/pub/lookup") {
      const ip = req.get("x-forwarded-for") || req.ip || "anon";
      if (!await rateLimit(`ip_${ip.split(",")[0].trim()}_lookup`, 300)) return bad(res, 429, "slow down");
      return await handlePublicLookup(req, res);
    }
    if (req.method === "POST" && p === "/auth/exchange") return await handleAuthExchange(req, res);
    if (req.method === "POST" && p === "/tg/webhook") return await handleTelegramWebhook(req, res);
    if (req.method === "GET" && p === "/config") {
      const cfg = await getConfig();
      res.set("Cache-Control", "public, max-age=30");
      return ok(res, {
        paymentsEnabled: false,
        discordClientId: DISCORD_CLIENT_ID.value(),
        bannerMaxBytes: cfg.bannerMaxBytes,
        animatedBanner: cfg.animatedBanner,
        minVersion: cfg.minVersion,
        updateRequired: cfg.updateRequired,
        updateUrl: cfg.updateUrl,
        updateMessage: cfg.updateMessage
      });
    }
    const claims = auth(req);
    if (!claims) return bad(res, 401, "sign in required");
    if (req.method === "GET" && p === "/me") return await handleMe(req, res, claims);
    if (req.method === "POST" && p === "/me/customization") return await handleSetCustomization(req, res, claims);
    if (req.method === "POST" && p === "/me/banner") return await handleBannerUpload(req, res, claims);
    if (req.method === "POST" && p === "/me/banner/animated") return await handleAnimatedBannerUpload(req, res, claims);
    if (req.method === "POST" && p === "/report") return await handleReport(req, res, claims);
    if (req.method === "GET" && p === "/me/reports") return await handleMyReports(req, res, claims);
    if (req.method === "GET" && p === "/me/settings") return await handleGetSettings(req, res, claims);
    if (req.method === "POST" && p === "/me/settings") {
      if (!await rateLimit(`${claims.sub}_settings`, 120)) return bad(res, 429, "slow down");
      return await handleSaveSettings(req, res, claims);
    }
    if (req.method === "POST" && p === "/track") {
      trackActive(claims.sub, req.body && req.body.v || null).catch(() => {});
      return ok(res, {});
    }
    if (p.startsWith("/admin/")) {
      if (!isOwner(claims)) return bad(res, 403, "forbidden");
      if (req.method === "GET" && p === "/admin/overview") return await handleAdminOverview(req, res);
      if (req.method === "GET" && p === "/admin/reports") return await handleAdminReports(req, res);
      if (req.method === "POST" && p === "/admin/report/status") return await handleAdminReportStatus(req, res, claims);
      if (req.method === "GET" && p === "/admin/users") return await handleAdminUsers(req, res);
      if (req.method === "POST" && p === "/admin/user/tier") return await handleAdminSetTier(req, res, claims);
      if (req.method === "POST" && p === "/admin/banner/moderate") return await handleAdminBannerModerate(req, res, claims);
      if (req.method === "GET" && p === "/admin/config") return await handleAdminGetConfig(req, res);
      if (req.method === "POST" && p === "/admin/config") return await handleAdminSetConfig(req, res, claims);
      return bad(res, 404, "no such admin route");
    }
    return bad(res, 404, "no such route");
  } catch (e) {
    console.error(e);
    return bad(res, 500, "internal error");
  }
});
