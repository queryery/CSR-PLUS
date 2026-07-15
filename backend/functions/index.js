'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const vision = require('@google-cloud/vision');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);

admin.initializeApp();
const db = admin.firestore();
const bucket = () => admin.storage().bucket();

let _vision = null;
const visionClient = () => (_vision || (_vision = new vision.ImageAnnotatorClient()));

const DISCORD_CLIENT_ID = defineString('DISCORD_CLIENT_ID');
const DISCORD_CLIENT_SECRET = defineSecret('DISCORD_CLIENT_SECRET');
const JWT_SECRET = defineSecret('JWT_SECRET');
const PAYPAL_ENV = defineString('PAYPAL_ENV', { default: 'sandbox' });
const PAYPAL_CLIENT_ID = defineString('PAYPAL_CLIENT_ID');
const PAYPAL_CLIENT_SECRET = defineSecret('PAYPAL_CLIENT_SECRET');
const PAYPAL_PRO_PLAN_ID = defineString('PAYPAL_PRO_PLAN_ID');
const PAYPAL_PREMIUM_PLAN_ID = defineString('PAYPAL_PREMIUM_PLAN_ID');
const PAYPAL_WEBHOOK_ID = defineString('PAYPAL_WEBHOOK_ID');
const TELEGRAM_BOT_TOKEN = defineSecret('TELEGRAM_BOT_TOKEN');
const TELEGRAM_CHAT_ID = defineString('TELEGRAM_CHAT_ID');
const TELEGRAM_WEBHOOK_SECRET = defineSecret('TELEGRAM_WEBHOOK_SECRET');
const DISCORD_REPORT_WEBHOOK = defineSecret('DISCORD_REPORT_WEBHOOK');
const DISCORD_OWNER_ID = defineString('DISCORD_OWNER_ID', { default: '' });
const EXTENSION_ID = defineString('EXTENSION_ID');
const CHECKOUT_HOST = defineString('CHECKOUT_HOST', { default: '' });

const TOKEN_TTL = '12h';
const BANNER_MAX_BYTES = 40 * 1024 * 1024;
const REPORT_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
const BANNER_W = 1920;
const BANNER_H = 480;
const ANIM_MAX_SECONDS = 10;

const paypalBase = () =>
  PAYPAL_ENV.value() === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

const planToTier = (planId) => {
  if (planId && planId === PAYPAL_PREMIUM_PLAN_ID.value()) return 'premium';
  if (planId && planId === PAYPAL_PRO_PLAN_ID.value()) return 'pro';
  return null;
};
const TIER_RANK = { free: 0, pro: 1, premium: 2 };

function allowedOrigins() {
  const list = [];
  const id = EXTENSION_ID.value();
  if (id) list.push(`chrome-extension://${id}`);
  const co = CHECKOUT_HOST.value();
  if (co) list.push(co.replace(/\/+$/, ''));
  return list;
}
function cors(req, res) {
  const origin = req.get('Origin') || '';
  const allow = allowedOrigins();
  if (allow.includes(origin)) res.set('Access-Control-Allow-Origin', origin);
  else if (allow.length) res.set('Access-Control-Allow-Origin', allow[0]);
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
const bad = (res, code, msg) => res.status(code).json({ ok: false, error: msg });
const ok = (res, data) => res.json({ ok: true, ...data });

function signToken(uid, name) {
  return jwt.sign({ sub: uid, name }, JWT_SECRET.value(), { expiresIn: TOKEN_TTL });
}
function auth(req) {
  const m = /^Bearer (.+)$/.exec(req.get('Authorization') || '');
  if (!m) return null;
  try { return jwt.verify(m[1], JWT_SECRET.value()); } catch { return null; }
}
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

async function rateLimit(key, perWindow, windowMs = 3600e3) {
  const ref = db.doc(`ratelimits/${key}`);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.exists ? snap.data() : { start: now, n: 0 };
    if (now - d.start > windowMs) { d.start = now; d.n = 0; }
    d.n += 1;
    tx.set(ref, d);
    return d.n <= perWindow;
  });
}

function resolveTier(d) {
  if (!d || d.chargeback) return 'free';
  const until = d.premiumUntil || 0;
  if (d.tier && (d.subActive || until > Date.now())) return d.tier;
  return 'free';
}
function tierAtLeast(d, min) {
  return TIER_RANK[resolveTier(d)] >= TIER_RANK[min];
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const NAME_STYLES = ['none', 'gradient', 'outline', 'metal', 'rainbow', 'glitch'];
const CARD_FLAIRS = ['none', 'ring', 'corners', 'scanline', 'holo', 'aurora', 'kanji'];
const AVATAR_FRAMES = ['none', 'ring', 'hex', 'glow'];
const CHIP_STYLES = ['outline', 'solid', 'gradient'];
const FILL_MODES = ['blur', 'color'];
const SURFACES = ['profile', 'card', 'lobby'];
const ANIM_NAMES = ['none', 'shimmer', 'pulse'];
const ANIM_AVATARS = ['none', 'spin', 'orbit'];
const OVERLAYS = ['none', 'particles', 'sweep'];

const clampNum = (v, lo, hi) => Math.max(lo, Math.min(hi, +v));
const pct = (v) => Math.max(0, Math.min(100, Math.round(+v)));

function sanitizeCustomization(body) {
  const out = {};
  const b = body || {};
  if (b.accent != null) { if (!HEX.test(String(b.accent))) throw new Error('accent must be #rrggbb'); out.accent = String(b.accent).toLowerCase(); }
  if (b.accent2 != null) { if (!HEX.test(String(b.accent2))) throw new Error('accent2 must be #rrggbb'); out.accent2 = String(b.accent2).toLowerCase(); }
  if (b.fillColor != null) { if (!HEX.test(String(b.fillColor))) throw new Error('fillColor must be #rrggbb'); out.fillColor = String(b.fillColor).toLowerCase(); }
  if (b.nameStyle != null) { if (!NAME_STYLES.includes(b.nameStyle)) throw new Error('bad nameStyle'); out.nameStyle = b.nameStyle; }
  if (b.cardFlair != null) { if (!CARD_FLAIRS.includes(b.cardFlair)) throw new Error('bad cardFlair'); out.cardFlair = b.cardFlair; }
  if (b.avatarFrame != null) { if (!AVATAR_FRAMES.includes(b.avatarFrame)) throw new Error('bad avatarFrame'); out.avatarFrame = b.avatarFrame; }
  if (b.chipStyle != null) { if (!CHIP_STYLES.includes(b.chipStyle)) throw new Error('bad chipStyle'); out.chipStyle = b.chipStyle; }
  if (b.fillMode != null) { if (!FILL_MODES.includes(b.fillMode)) throw new Error('bad fillMode'); out.fillMode = b.fillMode; }
  if (b.chip != null) out.chip = String(b.chip).slice(0, 24);
  if (b.kanji != null) out.kanji = String(b.kanji).slice(0, 6);
  if (b.animName != null) { if (!ANIM_NAMES.includes(b.animName)) throw new Error('bad animName'); out.animName = b.animName; }
  if (b.animAvatar != null) { if (!ANIM_AVATARS.includes(b.animAvatar)) throw new Error('bad animAvatar'); out.animAvatar = b.animAvatar; }
  if (b.overlay != null) { if (!OVERLAYS.includes(b.overlay)) throw new Error('bad overlay'); out.overlay = b.overlay; }
  if (b.bannerEnabled != null) out.bannerEnabled = !!b.bannerEnabled;
  if (b.bannerOn != null) out.bannerOn = !!b.bannerOn;
  if (b.bannerBlur != null) out.bannerBlur = Math.round(clampNum(b.bannerBlur, 0, 16));
  if (b.bannerDim != null) out.bannerDim = Math.round(clampNum(b.bannerDim, 0, 100));
  if (b.surf && typeof b.surf === 'object') {
    out.surf = {};
    for (const k of SURFACES) {
      const s = b.surf[k];
      if (!s || typeof s !== 'object') continue;
      out.surf[k] = {
        on: !!s.on,
        x: pct(s.x ?? 50), y: pct(s.y ?? 50),
        scale: clampNum(s.scale ?? 1, 0.4, 3),
        rot: Math.round(clampNum(s.rot ?? 0, -180, 180)),
      };
    }
  }
  return out;
}

function publicView(d) {
  if (!d) return null;
  const tier = resolveTier(d);
  const bannerApproved = d.bannerEnabled && d.bannerStatus === 'approved' && d.bannerUrl;
  const bannerOk = bannerApproved && TIER_RANK[tier] >= TIER_RANK.pro;
  const animOk = bannerOk && d.bannerKind === 'anim' && tier === 'premium';
  return {
    tier,
    accent: d.accent || null,
    accent2: d.accent2 || null,
    nameStyle: d.nameStyle || 'none',
    cardFlair: d.cardFlair || 'none',
    avatarFrame: d.avatarFrame || 'none',
    chip: d.chip || null,
    chipStyle: d.chipStyle || 'outline',
    kanji: d.kanji || null,
    fillMode: d.fillMode || 'blur',
    fillColor: d.fillColor || null,
    banner: bannerOk ? d.bannerUrl : null,
    bannerKind: animOk ? 'anim' : (bannerOk ? 'static' : null),
    bannerMime: bannerOk ? (d.bannerMime || null) : null,
    bannerBlur: d.bannerBlur ?? 0,
    bannerDim: d.bannerDim ?? 30,
    surf: d.surf || null,
    animName: tier === 'premium' ? (d.animName || 'none') : 'none',
    animAvatar: tier === 'premium' ? (d.animAvatar || 'none') : 'none',
    overlay: tier === 'premium' ? (d.overlay || 'none') : 'none',
  };
}

async function paypalToken() {
  const r = await fetch(paypalBase() + '/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(
        PAYPAL_CLIENT_ID.value() + ':' + PAYPAL_CLIENT_SECRET.value()).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!r.ok) throw new Error('paypal oauth failed');
  return (await r.json()).access_token;
}

async function paypalGetSubscription(subId) {
  const t = await paypalToken();
  const r = await fetch(`${paypalBase()}/v1/billing/subscriptions/${encodeURIComponent(subId)}`, {
    headers: { Authorization: 'Bearer ' + t },
  });
  if (!r.ok) return null;
  return r.json();
}

async function paypalVerifyWebhook(req) {
  const t = await paypalToken();
  const r = await fetch(paypalBase() + '/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_algo: req.get('paypal-auth-algo'),
      cert_url: req.get('paypal-cert-url'),
      transmission_id: req.get('paypal-transmission-id'),
      transmission_sig: req.get('paypal-transmission-sig'),
      transmission_time: req.get('paypal-transmission-time'),
      webhook_id: PAYPAL_WEBHOOK_ID.value(),
      webhook_event: req.body,
    }),
  });
  if (!r.ok) return false;
  return (await r.json()).verification_status === 'SUCCESS';
}

const hot = (v) => v === 'LIKELY' || v === 'VERY_LIKELY';
function safeSearchBlocks(s) {
  return !!(s && (hot(s.adult) || hot(s.violence) || hot(s.racy)));
}
async function moderateStill(buf) {
  const [result] = await visionClient().safeSearchDetection({ image: { content: buf } });
  return safeSearchBlocks(result.safeSearchAnnotation || {});
}
async function strike(uid, d) {
  const strikes = (d.moderationStrikes || 0) + 1;
  await db.doc(`profiles/${uid}`).set({
    moderationStrikes: strikes,
    moderationBanned: strikes >= 3,
    bannerStatus: 'rejected',
  }, { merge: true });
  return { banned: strikes >= 3 };
}

async function handleAuthExchange(req, res) {
  const { code, redirectUri } = req.body || {};
  if (!code || !redirectUri) return bad(res, 400, 'code and redirectUri required');
  if (!/^https:\/\/[a-p]{32}\.chromiumapp\.org\/?/.test(redirectUri) &&
    !/^https:\/\/[0-9a-f-]{36}\.extensions\.allizom\.org\/?/.test(redirectUri))
    return bad(res, 400, 'bad redirectUri');

  const r = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: DISCORD_CLIENT_ID.value(),
      client_secret: DISCORD_CLIENT_SECRET.value(),
      grant_type: 'authorization_code',
      code, redirect_uri: redirectUri,
    }),
  });
  if (!r.ok) return bad(res, 401, 'discord code exchange failed');
  const tok = await r.json();

  const ur = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: 'Bearer ' + tok.access_token },
  });
  if (!ur.ok) return bad(res, 401, 'discord user fetch failed');
  const user = await ur.json();

  await db.doc(`profiles/${user.id}`).set({
    name: user.username,
    lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return ok(res, {
    token: signToken(user.id, user.username),
    user: { id: user.id, name: user.username, avatar: user.avatar },
  });
}

async function handleMe(req, res, claims) {
  const snap = await db.doc(`profiles/${claims.sub}`).get();
  const d = snap.exists ? snap.data() : {};
  return ok(res, {
    user: { id: claims.sub, name: claims.name },
    tier: resolveTier(d),
    premiumUntil: d.premiumUntil || null,
    chargeback: !!d.chargeback,
    moderationStrikes: d.moderationStrikes || 0,
    moderationBanned: !!d.moderationBanned,
    customization: {
      accent: d.accent || null, accent2: d.accent2 || null,
      fillMode: d.fillMode || 'blur', fillColor: d.fillColor || null,
      nameStyle: d.nameStyle || 'none', cardFlair: d.cardFlair || 'none',
      avatarFrame: d.avatarFrame || 'none', chip: d.chip || null,
      chipStyle: d.chipStyle || 'outline', kanji: d.kanji || null,
      bannerEnabled: !!d.bannerEnabled, bannerOn: !!d.bannerOn,
      bannerUrl: d.bannerUrl || null, bannerStatus: d.bannerStatus || null,
      bannerKind: d.bannerKind || null, bannerMime: d.bannerMime || null,
      bannerBlur: d.bannerBlur ?? 0, bannerDim: d.bannerDim ?? 30,
      surf: d.surf || null,
      animName: d.animName || 'none', animAvatar: d.animAvatar || 'none', overlay: d.overlay || 'none',
    },
    moderationBanned: !!d.moderationBanned,
  });
}

const PREMIUM_FLAIRS = ['holo', 'aurora'];
const PREMIUM_NAMES = ['rainbow', 'glitch', 'metal'];
const PREMIUM_FRAMES = ['hex', 'glow'];

function wantsPremiumCosmetic(b) {
  return PREMIUM_FLAIRS.includes(b.cardFlair) ||
    PREMIUM_NAMES.includes(b.nameStyle) ||
    PREMIUM_FRAMES.includes(b.avatarFrame) ||
    (b.animName && b.animName !== 'none') ||
    (b.animAvatar && b.animAvatar !== 'none') ||
    (b.overlay && b.overlay !== 'none');
}

async function handleSetCustomization(req, res, claims) {
  if (!(await rateLimit(`${claims.sub}_custom`, 120))) return bad(res, 429, 'slow down');
  const snap = await db.doc(`profiles/${claims.sub}`).get();
  const d = snap.exists ? snap.data() : {};
  if (d.moderationBanned) return bad(res, 403, 'customization disabled for this account');
  const tier = resolveTier(d);
  if (wantsPremiumCosmetic(req.body || {}) && tier !== 'premium')
    return bad(res, 402, 'this cosmetic requires CSR+ Premium');
  let fields;
  try { fields = sanitizeCustomization(req.body || {}); } catch (e) { return bad(res, 400, e.message); }
  if (TIER_RANK[tier] < TIER_RANK.pro) fields.bannerEnabled = false;
  fields.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  await db.doc(`profiles/${claims.sub}`).set(fields, { merge: true });
  return ok(res, {});
}

async function handleBannerUpload(req, res, claims) {
  const snap = await db.doc(`profiles/${claims.sub}`).get();
  const d = snap.exists ? snap.data() : {};
  if (!tierAtLeast(d, 'pro')) return bad(res, 402, 'CSR+ Pro subscription required');
  if (d.moderationBanned) return bad(res, 403, 'customization disabled for this account');
  if (!(await rateLimit(`${claims.sub}_banner`, 10))) return bad(res, 429, 'too many uploads, try later');

  const b64 = (req.body && req.body.image) || '';
  const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(b64);
  if (!m) return bad(res, 400, 'image must be a png/jpeg/webp data URL');
  const approxBytes = Math.floor(m[2].length * 0.75);
  if (approxBytes > BANNER_MAX_BYTES) return bad(res, 413, 'image too large (max 40 MB)');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > BANNER_MAX_BYTES) return bad(res, 413, 'image too large (max 40 MB)');

  let webp;
  try {
    webp = await sharp(buf, { limitInputPixels: 60e6 })
      .resize(BANNER_W, null, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch { return bad(res, 400, 'not a decodable image'); }

  try {
    if (await moderateStill(webp)) {
      const { banned } = await strike(claims.sub, d);
      return bad(res, 422, banned
        ? 'banner rejected — customization has been disabled after repeated violations'
        : 'banner rejected by content moderation');
    }
  } catch (e) {
    console.error('vision failed', e);
    return bad(res, 503, 'moderation unavailable, try again later');
  }

  const key = `banners/${claims.sub}.webp`;
  await saveBanner(key, webp, 'image/webp');
  const url = publicUrl(key);
  await db.doc(`profiles/${claims.sub}`).set({
    bannerUrl: url, bannerStatus: 'approved', bannerEnabled: true,
    bannerKind: 'static', bannerMime: 'image/webp',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return ok(res, { bannerUrl: url, bannerKind: 'static' });
}

async function handleAnimatedBannerUpload(req, res, claims) {
  const snap = await db.doc(`profiles/${claims.sub}`).get();
  const d = snap.exists ? snap.data() : {};
  if (resolveTier(d) !== 'premium') return bad(res, 402, 'CSR+ Premium subscription required');
  if (d.moderationBanned) return bad(res, 403, 'customization disabled for this account');
  if (!(await rateLimit(`${claims.sub}_animbanner`, 6))) return bad(res, 429, 'too many uploads, try later');

  const dataUrl = (req.body && req.body.media) || '';
  const m = /^data:(video\/(?:mp4|webm)|image\/(?:gif|webp));base64,(.+)$/.exec(dataUrl);
  if (!m) return bad(res, 400, 'media must be an mp4/webm video or animated gif/webp data URL');
  const mime = m[1];
  const approxBytes = Math.floor(m[2].length * 0.75);
  if (approxBytes > BANNER_MAX_BYTES) return bad(res, 413, 'media too large (max 40 MB)');
  const inBuf = Buffer.from(m[2], 'base64');
  if (inBuf.length > BANNER_MAX_BYTES) return bad(res, 413, 'media too large (max 40 MB)');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csrp-anim-'));
  const cleanup = () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } };
  try {
    let outKey, outMime, outBuf, frames;
    if (mime.startsWith('video/')) {
      const inPath = path.join(tmp, 'in');
      fs.writeFileSync(inPath, inBuf);
      const outPath = path.join(tmp, 'out.webm');
      await transcodeWebm(inPath, outPath);
      outBuf = fs.readFileSync(outPath);
      frames = await sampleVideoFrames(outPath, tmp);
      outKey = `banners/${claims.sub}.webm`;
      outMime = 'video/webm';
    } else {
      outBuf = await sharp(inBuf, { animated: true, limitInputPixels: 60e6 })
        .resize(BANNER_W, null, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      frames = await sampleImageFrames(inBuf);
      outKey = `banners/${claims.sub}.anim.webp`;
      outMime = 'image/webp';
    }

    try {
      for (const f of frames) {
        if (await moderateStill(f)) {
          const { banned } = await strike(claims.sub, d);
          cleanup();
          return bad(res, 422, banned
            ? 'banner rejected — customization has been disabled after repeated violations'
            : 'banner rejected by content moderation');
        }
      }
    } catch (e) {
      console.error('vision failed (anim)', e);
      cleanup();
      return bad(res, 503, 'moderation unavailable, try again later');
    }

    await saveBanner(outKey, outBuf, outMime);
    const url = publicUrl(outKey);
    await db.doc(`profiles/${claims.sub}`).set({
      bannerUrl: url, bannerStatus: 'approved', bannerEnabled: true,
      bannerKind: 'anim', bannerMime: outMime,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    cleanup();
    return ok(res, { bannerUrl: url, bannerKind: 'anim', bannerMime: outMime });
  } catch (e) {
    cleanup();
    console.error('anim transcode failed', e);
    return bad(res, 400, 'could not process media');
  }
}

function transcodeWebm(inPath, outPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inPath)
      .noAudio()
      .duration(ANIM_MAX_SECONDS)
      .videoCodec('libvpx-vp9')
      .size(`${BANNER_W}x${BANNER_H}`)
      .autopad(false)
      .outputOptions(['-b:v', '1M', '-crf', '34', '-pix_fmt', 'yuv420p', '-an', '-t', String(ANIM_MAX_SECONDS)])
      .videoFilters(`scale=${BANNER_W}:${BANNER_H}:force_original_aspect_ratio=increase,crop=${BANNER_W}:${BANNER_H}`)
      .format('webm')
      .on('end', () => resolve())
      .on('error', (e) => reject(e))
      .save(outPath);
  });
}

function sampleVideoFrames(videoPath, dir) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .on('end', () => {
        try {
          const files = fs.readdirSync(dir).filter((f) => /^frame-\d+\.png$/.test(f));
          resolve(files.map((f) => fs.readFileSync(path.join(dir, f))));
        } catch (e) { reject(e); }
      })
      .on('error', (e) => reject(e))
      .screenshots({ count: 4, filename: 'frame-%i.png', folder: dir, size: `${BANNER_W}x${BANNER_H}` });
  });
}

async function sampleImageFrames(buf) {
  const img = sharp(buf, { animated: true });
  const meta = await img.metadata();
  const pages = meta.pages || 1;
  const idxs = pages <= 1 ? [0] : [...new Set([0, Math.floor(pages / 4), Math.floor(pages / 2), pages - 1])];
  const out = [];
  for (const i of idxs) {
    out.push(await sharp(buf, { page: i, limitInputPixels: 60e6 }).png().toBuffer());
  }
  return out;
}

async function saveBanner(key, buf, contentType) {
  const others = [`banners/${key.split('/')[1].split('.')[0]}.webp`,
  `banners/${key.split('/')[1].split('.')[0]}.webm`,
  `banners/${key.split('/')[1].split('.')[0]}.anim.webp`];
  await Promise.all(others.filter((k) => k !== key).map((k) =>
    bucket().file(k).delete().catch(() => { })));
  const file = bucket().file(key);
  await file.save(buf, { contentType, metadata: { cacheControl: 'public, max-age=300' } });
  await file.makePublic();
}
const publicUrl = (key) => `https://storage.googleapis.com/${bucket().name}/${key}?v=${Date.now()}`;

async function handlePaypalLink(req, res, claims) {
  if (!(await rateLimit(`${claims.sub}_link`, 20))) return bad(res, 429, 'slow down');
  const subId = String((req.body && req.body.subscriptionID) || '');
  if (!/^I-[A-Z0-9]{6,}$/i.test(subId)) return bad(res, 400, 'bad subscription id');
  const sub = await paypalGetSubscription(subId);
  if (!sub) return bad(res, 404, 'subscription not found');
  const tier = planToTier(sub.plan_id);
  if (!tier) return bad(res, 400, 'unknown plan');
  if (!['ACTIVE', 'APPROVED'].includes(sub.status)) return bad(res, 402, `subscription is ${sub.status}`);

  const dupe = await db.collection('profiles').where('paypalSubId', '==', subId).limit(1).get();
  if (!dupe.empty && dupe.docs[0].id !== claims.sub) {
    const od = dupe.docs[0].data();
    if (od.chargeback || od.moderationBanned) return bad(res, 409, 'subscription cannot be linked');
    return bad(res, 409, 'subscription already linked');
  }

  const until = sub.billing_info && sub.billing_info.next_billing_time
    ? Date.parse(sub.billing_info.next_billing_time) : (Date.now() + 32 * 864e5);
  await db.doc(`profiles/${claims.sub}`).set({
    tier, paypalSubId: subId, subActive: true, chargeback: false,
    premiumUntil: until,
    premiumUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return ok(res, { tier });
}

async function handlePaypalWebhook(req, res) {
  if (!(await paypalVerifyWebhook(req))) return bad(res, 401, 'bad signature');
  const ev = req.body || {};
  const evId = ev.id;
  if (evId) {
    const seen = db.doc(`webhookEvents/${evId}`);
    const dup = await seen.get();
    if (dup.exists) return ok(res, {});
    await seen.set({ at: admin.firestore.FieldValue.serverTimestamp(), type: ev.event_type });
  }
  const subId = ev.resource && (ev.resource.id || ev.resource.billing_agreement_id);
  if (!subId) return ok(res, {});
  const q = await db.collection('profiles').where('paypalSubId', '==', subId).limit(1).get();
  if (q.empty) return ok(res, {});
  const ref = q.docs[0].ref;
  const d = q.docs[0].data();

  switch (ev.event_type) {
    case 'BILLING.SUBSCRIPTION.ACTIVATED':
    case 'BILLING.SUBSCRIPTION.RE-ACTIVATED':
    case 'PAYMENT.SALE.COMPLETED': {
      const sub = await paypalGetSubscription(subId);
      const nbt = sub && sub.billing_info && sub.billing_info.next_billing_time;
      const tier = (sub && planToTier(sub.plan_id)) || d.tier || 'pro';
      await ref.set({
        tier, subActive: true, chargeback: false,
        premiumUntil: nbt ? Date.parse(nbt) : (Date.now() + 32 * 864e5),
        premiumUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      break;
    }
    case 'BILLING.SUBSCRIPTION.CANCELLED': {
      const sub = await paypalGetSubscription(subId);
      const nbt = sub && sub.billing_info && sub.billing_info.next_billing_time;
      await ref.set({
        subActive: false,
        premiumUntil: nbt ? Date.parse(nbt) : (d.premiumUntil || Date.now()),
        premiumUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      break;
    }
    case 'BILLING.SUBSCRIPTION.SUSPENDED':
    case 'BILLING.SUBSCRIPTION.EXPIRED':
    case 'PAYMENT.SALE.REVERSED':
    case 'PAYMENT.SALE.REFUNDED': {
      await ref.set({
        subActive: false, chargeback: true, premiumUntil: 0,
        premiumUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      break;
    }
  }
  return ok(res, {});
}

async function handlePublicProfiles(req, res) {
  const ids = String(req.query.ids || '').split(',').map((s) => s.trim())
    .filter((s) => /^\d{15,21}$/.test(s)).slice(0, 25);
  if (!ids.length) return bad(res, 400, 'ids required');
  const snaps = await db.getAll(...ids.map((id) => db.doc(`profiles/${id}`)));
  const out = {};
  snaps.forEach((s, i) => { if (s.exists) { const v = publicView(s.data()); if (v) out[ids[i]] = v; } });
  res.set('Cache-Control', 'public, max-age=300');
  return ok(res, { profiles: out });
}

const REPORT_REASONS = ['Cheating', 'Toxic/Harassment', 'Griefing/Trolling', 'Offensive name/avatar', 'Ban evasion', 'Other'];
const tgEscape = (s) => String(s || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

const STATUS_LABELS = {
  checking: '👀 Checking', punished: '✅ Punished',
  insufficient: '❔ Not enough info', rejected: '🚫 Fake report',
};
function statusKeyboard(reportId) {
  return {
    inline_keyboard: [
      [{ text: STATUS_LABELS.checking, callback_data: `s:${reportId}:checking` },
       { text: STATUS_LABELS.punished, callback_data: `s:${reportId}:punished` }],
      [{ text: STATUS_LABELS.insufficient, callback_data: `s:${reportId}:insufficient` },
       { text: STATUS_LABELS.rejected, callback_data: `s:${reportId}:rejected` }],
    ],
  };
}

async function tgApi(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN.value()}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  try { return await r.json(); } catch { return { ok: r.ok }; }
}
async function tgSend(method, body) {
  const j = await tgApi(method, body);
  return { ok: !!(j && j.ok), messageId: j && j.result && j.result.message_id };
}
async function tgSendMedia(method, field, buf, mime, filename, caption, replyMarkup) {
  const fd = new FormData();
  fd.append('chat_id', TELEGRAM_CHAT_ID.value());
  fd.append('caption', caption);
  fd.append('parse_mode', 'HTML');
  if (replyMarkup) fd.append('reply_markup', JSON.stringify(replyMarkup));
  fd.append(field, new Blob([buf], { type: mime }), filename);
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN.value()}/${method}`, { method: 'POST', body: fd });
  let j = null; try { j = await r.json(); } catch { }
  return { ok: !!(j && j.ok), messageId: j && j.result && j.result.message_id };
}

async function dcSendReport(content, media, priority) {
  const url = (DISCORD_REPORT_WEBHOOK.value() || '').trim();
  if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(url)) return false;
  const ownerId = (DISCORD_OWNER_ID.value() || '').trim();
  const fd = new FormData();
  fd.append('payload_json', JSON.stringify({
    content,
    allowed_mentions: priority && /^\d{15,21}$/.test(ownerId) ? { users: [ownerId] } : { parse: [] },
  }));
  if (media) fd.append('files[0]', new Blob([media.buf], { type: media.mime }), media.filename);
  const r = await fetch(url + '?wait=true', { method: 'POST', body: fd });
  return r.ok;
}
const dcEscape = (s) => String(s || '').replace(/([\\`*_~|>#@])/g, '\\$1');

async function handleReport(req, res, claims) {
  const b = req.body || {};
  const targetId = String(b.targetId || '');
  if (!/^\d{15,21}$/.test(targetId)) return bad(res, 400, 'bad targetId');
  if (targetId === claims.sub) return bad(res, 400, 'you cannot report yourself');
  if (!REPORT_REASONS.includes(b.reason)) return bad(res, 400, 'bad reason');
  const desc = String(b.description || '').slice(0, 500);

  if (!(await rateLimit(`${claims.sub}_report`, 3))) return bad(res, 429, 'report limit reached, try later');
  if (!(await rateLimit(`${claims.sub}_report_${targetId}`, 1, 24 * 3600e3)))
    return bad(res, 429, 'you already reported this player recently');

  const reporterSnap = await db.doc(`profiles/${claims.sub}`).get();
  const reporterTier = resolveTier(reporterSnap.exists ? reporterSnap.data() : {});
  const priority = reporterTier === 'premium';

  const link = (id) => `https://csrestored.fun/user/${id}`;
  const caption =
    (priority ? `⭐ <b>PRIORITY</b> @queryer\n` : '') +
    `🚩 <b>CSR+ report</b>\n` +
    `<b>Reason:</b> ${tgEscape(b.reason)}\n` +
    `<b>Tier:</b> ${tgEscape(reporterTier)}\n` +
    `<b>Target:</b> <code>${tgEscape(targetId)}</code> ${tgEscape(link(targetId))}\n` +
    `<b>Reporter:</b> <code>${tgEscape(claims.sub)}</code> ${tgEscape(link(claims.sub))}\n` +
    (desc ? `<b>Details:</b> ${tgEscape(desc)}\n` : '');

  let media = null;
  {
    const shot = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(String(b.screenshot || ''));
    const vid = /^data:(video\/(?:mp4|webm));base64,(.+)$/.exec(String(b.video || ''));
    if (vid) {
      const vbuf = Buffer.from(vid[2], 'base64');
      if (vbuf.length > REPORT_VIDEO_MAX_BYTES) return bad(res, 413, 'video too large (max 50 MB)');
      media = { kind: 'video', buf: vbuf, mime: vid[1], filename: vid[1] === 'video/webm' ? 'report.webm' : 'report.mp4' };
    } else if (shot) {
      media = { kind: 'photo', buf: Buffer.from(shot[2], 'base64'), mime: 'image/' + shot[1], filename: 'report.' + shot[1] };
    }
  }

  const id = crypto.randomUUID();
  const kb = statusKeyboard(id);

  let tg = { ok: false, messageId: null };
  try {
    if (media && media.kind === 'video') tg = await tgSendMedia('sendVideo', 'video', media.buf, media.mime, media.filename, caption, kb);
    else if (media) tg = await tgSendMedia('sendPhoto', 'photo', media.buf, media.mime, media.filename, caption, kb);
    else tg = await tgSend('sendMessage', { chat_id: TELEGRAM_CHAT_ID.value(), text: caption, parse_mode: 'HTML', reply_markup: kb });
  } catch (e) { console.error('telegram send failed', e); }

  let sentDc = false;
  try {
    const ownerId = (DISCORD_OWNER_ID.value() || '').trim();
    const dcContent =
      (priority ? `⭐ **PRIORITY**${/^\d{15,21}$/.test(ownerId) ? ` <@${ownerId}>` : ''}\n` : '') +
      `🚩 **CSR+ report**\n` +
      `**Reason:** ${dcEscape(b.reason)}\n` +
      `**Tier:** ${dcEscape(reporterTier)}\n` +
      `**Target:** \`${targetId}\` ${link(targetId)}\n` +
      `**Reporter:** \`${claims.sub}\` ${link(claims.sub)}\n` +
      (desc ? `**Details:** ${dcEscape(desc)}\n` : '');
    sentDc = await dcSendReport(dcContent, media, priority);
  } catch (e) { console.error('discord send failed', e); }

  if (!tg.ok && !sentDc) return bad(res, 502, 'could not deliver report, try again later');

  await db.doc(`reports/${id}`).set({
    reporterId: claims.sub, targetId, reason: b.reason, description: desc,
    hadMedia: !!(b.screenshot || b.video),
    reporterTier, priority,
    status: 'sent',
    tgMessageId: tg.messageId || null,
    deliveredTo: [...(tg.ok ? ['telegram'] : []), ...(sentDc ? ['discord'] : [])],
    at: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return ok(res, { id, status: 'sent' });
}

const REPORT_STATUSES = ['sent', 'checking', 'punished', 'insufficient', 'rejected'];

async function handleMyReports(req, res, claims) {
  const q = await db.collection('reports')
    .where('reporterId', '==', claims.sub)
    .limit(50).get();
  const items = q.docs.map((s) => {
    const r = s.data();
    return {
      id: s.id,
      targetId: r.targetId,
      reason: r.reason,
      status: REPORT_STATUSES.includes(r.status) ? r.status : 'sent',
      hadMedia: !!r.hadMedia,
      at: r.at && r.at.toMillis ? r.at.toMillis() : null,
      updatedAt: r.updatedAt && r.updatedAt.toMillis ? r.updatedAt.toMillis() : null,
    };
  }).sort((a, b) => (b.at || 0) - (a.at || 0));
  res.set('Cache-Control', 'no-store');
  return ok(res, { reports: items });
}

async function handleTelegramWebhook(req, res) {
  const secret = TELEGRAM_WEBHOOK_SECRET.value();
  const got = req.get('x-telegram-bot-api-secret-token') || '';
  if (!secret || !safeEqual(got, secret)) return res.status(403).send('');
  const cq = req.body && req.body.callback_query;
  if (!cq || !cq.data) return res.status(200).send('');
  const chatId = cq.message && cq.message.chat && String(cq.message.chat.id);
  if (chatId !== String(TELEGRAM_CHAT_ID.value())) return res.status(200).send('');

  const m = /^s:([0-9a-f-]{36}):([a-z]+)$/.exec(String(cq.data));
  if (!m || !REPORT_STATUSES.includes(m[2])) {
    await tgApi('answerCallbackQuery', { callback_query_id: cq.id }).catch(() => {});
    return res.status(200).send('');
  }
  const [, reportId, status] = m;
  const ref = db.doc(`reports/${reportId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    await tgApi('answerCallbackQuery', { callback_query_id: cq.id, text: 'Report not found' }).catch(() => {});
    return res.status(200).send('');
  }
  await ref.set({
    status,
    moderatedBy: String((cq.from && cq.from.username) || (cq.from && cq.from.id) || 'mod').slice(0, 64),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  const label = (STATUS_LABELS[status] || status);
  await tgApi('answerCallbackQuery', { callback_query_id: cq.id, text: `Marked: ${label}` }).catch(() => {});
  if (cq.message && cq.message.message_id) {
    await tgApi('editMessageReplyMarkup', {
      chat_id: chatId, message_id: cq.message.message_id,
      reply_markup: { inline_keyboard: [[{ text: `Status: ${label}`, callback_data: 'noop' }], ...statusKeyboard(reportId).inline_keyboard] },
    }).catch(() => {});
  }
  return res.status(200).send('');
}

exports.api = onRequest({
  region: 'europe-west1',
  secrets: [DISCORD_CLIENT_SECRET, JWT_SECRET, PAYPAL_CLIENT_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, DISCORD_REPORT_WEBHOOK],
  memory: '1GiB',
  timeoutSeconds: 120,
  maxInstances: 10,
}, async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  const p = (req.path || '/').replace(/\/+$/, '') || '/';

  try {
    if (req.method === 'GET' && p === '/pub/profiles') {
      const ip = req.get('x-forwarded-for') || req.ip || 'anon';
      if (!(await rateLimit(`ip_${ip.split(',')[0].trim()}_pub`, 300))) return bad(res, 429, 'slow down');
      return await handlePublicProfiles(req, res);
    }
    if (req.method === 'POST' && p === '/auth/exchange') return await handleAuthExchange(req, res);
    if (req.method === 'POST' && p === '/paypal/webhook') return await handlePaypalWebhook(req, res);
    if (req.method === 'POST' && p === '/tg/webhook') return await handleTelegramWebhook(req, res);
    if (req.method === 'GET' && p === '/config')
      return ok(res, {
        paypalClientId: PAYPAL_CLIENT_ID.value(),
        proPlanId: PAYPAL_PRO_PLAN_ID.value(),
        premiumPlanId: PAYPAL_PREMIUM_PLAN_ID.value(),
        env: PAYPAL_ENV.value(),
        discordClientId: DISCORD_CLIENT_ID.value(),
      });

    const claims = auth(req);
    if (!claims) return bad(res, 401, 'sign in required');
    if (req.method === 'GET' && p === '/me') return await handleMe(req, res, claims);
    if (req.method === 'POST' && p === '/me/customization') return await handleSetCustomization(req, res, claims);
    if (req.method === 'POST' && p === '/me/banner') return await handleBannerUpload(req, res, claims);
    if (req.method === 'POST' && p === '/me/banner/animated') return await handleAnimatedBannerUpload(req, res, claims);
    if (req.method === 'POST' && p === '/me/paypal/link') return await handlePaypalLink(req, res, claims);
    if (req.method === 'POST' && p === '/report') return await handleReport(req, res, claims);
    if (req.method === 'GET' && p === '/me/reports') return await handleMyReports(req, res, claims);

    return bad(res, 404, 'no such route');
  } catch (e) {
    console.error(e);
    return bad(res, 500, 'internal error');
  }
});
