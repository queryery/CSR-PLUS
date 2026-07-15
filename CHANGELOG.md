# Changelog

## 0.0.9 — Studio, Pro & Premium, Reports

**CSR+ Studio — profile customization**
- Full profile customization: banner, accent colours, name styles (gradient,
  outline, metal, rainbow, glitch), card flair (neon ring, corners, scanlines,
  holo, aurora, kanji), avatar frames and a custom title chip.
- The editor is a space deck: three floating holo-screens replicate the real
  site — your profile page, match-room card and lobby slot — filled live with
  your name, avatar, country flag, ELO, matches, wins, winrate, kills, KDR and
  AVG.
- A real banner engine: zooming out reveals more of the image (down to the
  whole picture) instead of shrinking the same crop. Behind the image sits a
  blurred ambient fill or a solid colour of your choice for transparent PNGs.
- Per-surface placement: the profile, match-card and lobby banners each have
  their own position, zoom and rotation — drag a screen's banner in place,
  scroll to zoom, rotate with the slider (−180° to 180°), or use Fill / Fit.
- One-click presets, export and import of your setup.

**Shared cosmetics — everyone sees them**
- Sign in with Discord and your look is published for other CSR+ players: your
  colours, name style and card flair render on your match-room card, lobby slot
  and profile page for everyone running the extension.
- Free colours, name style and card flair are shared at no cost — signing in is
  all it takes.
- **Pro ($2/mo)** adds a shared banner, premium cosmetics, a Pro badge and a
  "hide everyone's banners" toggle. **Premium ($4/mo)** adds an animated banner
  (video loop or animated GIF/WebP), animated name and avatar frame, and a
  distinct badge.
- Banners require Pro: they no longer render locally on a Free account.
- On Save, your free look publishes immediately; anything above your plan
  prompts a one-click upgrade instead of being silently dropped.
- Tier badges show under the ELO on profiles and inline on match-room cards.
- Cosmetics above your current plan reset to their free equivalents the moment a
  tier check confirms you no longer have it.

**Subscriptions**
- A three-tier (Free / Pro / Premium) comparison page opens from the Studio and
  the popup, with checkout confirmation, live purchase status and an "until"
  date. Payments run through PayPal; a tier unlocks once PayPal confirms it and
  is revoked the moment a refund or chargeback is reported.

**Reports**
- A Report button on player profiles opens a form (reason, details, optional
  screenshot or video up to 50 MB) that routes to CSR+ moderators.
- A new **Reports** tab in the popup tracks every report you file and shows its
  status — Sent, Checking, Punishment applied, Not enough info, or Rejected —
  updated by a moderator as they review it.
- Premium members' reports are flagged as priority.

**Trades**
- A "Send trade" button on the site's friends page (confirmed friends only) and
  next to every friend in the popup, opening CSR+ Trades with that friend
  pre-selected.

**Docs**
- A full user manual ships with the extension, opened from About or the sidebar.

**Fixes**
- Group kick works: the lobby and card profile shortcuts pass every interactive
  element straight through instead of swallowing the click.
- Studio screens are true-size replicas of the real surfaces, so banner
  placement transfers exactly.
- Banners re-layout instantly when their container resizes (window resize, the
  match-room chat opening).
- Lobby styling only attaches to real lobby slots, leaving ranking widgets
  alone.
- Card flair effects are clipped inside the card's rounded outline.
- The win-probability bar aligns itself to the team grid so it no longer
  collides with the match-room chat.
- The console only reports real errors now.

## 0.0.8 — A new era of CS:R

The first public cut of CSR+ — an enhanced match suite for csrestored.fun, built
around one idea: give you everything the lobby never told you, the moment you
need it, without ever getting in your way.

**Match intelligence**
- Every Match Found window is rebuilt into a clean console: both teams sorted by
  strength, with name, ELO, K/D, K/R, ADR and winrate at a glance.
- A live win-probability bar reads the lineup and tells you who the maps favour.
- Each team's standout is crowned, and on-the-fly badges flag who's on fire and
  who's tilted.

**Flow**
- Auto-accept with a countdown you control — set the delay, accept instantly, or
  cancel on the spot.
- Smart, turn-aware map bans that follow your priority order.
- One-click copy of both teams, and the server address, straight to Discord.
- A desktop ping the instant a match is found, so you never miss a queue.

**Players**
- Open any player's full CSR+ profile: stats, recent form, map breakdown,
  match history and their full inventory with float, pattern seed and StatTrak.
- Tag and note players you remember.
- Search the leaderboard by name or ID.

**Make it yours**
- A cyberpunk console interface with two monochrome themes.
- Fine-grained sound control — preview and toggle UI, match, countdown and
  accept cues independently, with a live volume meter.
- Your settings follow your browser account across reloads and reinstalls.

Welcome to CSR+.
