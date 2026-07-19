# Changelog

## 0.1.3 — Free banners, video banners, queue & lobby fixes

**Banners**
- Banners are now free for everyone. No Pro or Premium needed to upload one,
  and that includes MP4 and WebM video banners. Upload limit is 20 MB.
- Fixed video banners not showing up. They now play on your profile, cards
  and in the lobby, muted and looping.
- Fixed larger video banners staying hidden on your own profile even after
  they uploaded fine.
- Video banners load faster and play smoother — they fully buffer up front,
  no longer re-download on every view, and run on their own GPU layer so they
  don't stutter or drag the card.

**Queue**
- You now stay listed as searching even when the tab is in the background.
  Before, switching to another tab dropped you from the CSR+ queue list.
- Opening a new tab while queued now restores your queue state and the timer.
- Being invited to a party on another tab no longer hides you from the lobby
  until you switch back — you show up for everyone straight away.
- The queue list holds up through long (30+ minute) queues thanks to a
  background heartbeat that keeps working while the tab is idle.

**Lobby & match**
- Win probability now shows on match load again, including for players on
  default Discord avatars.
- Ready tag no longer sits in the wrong place when a player has a banner.
- Fixed the ready countdown showing a garbled time.
- Tightened ready detection and fixed a lobby flicker.

**Effects**
- Animated card effects render correctly over bright banners and look cleaner.

**Other**
- Title chip is capped shorter so it can't crowd your name.
- Smaller popup fixes.

## 0.1.2 — Lobby fixed & polished, Firefox fixes

**Lobby — works in anyone's party, cleans up after itself**
- The tactical lobby style no longer vanishes when you join **someone else's**
  party. It was keyed to the Join Queue button, which only the leader has —
  the lobby itself is now the signal, so members get the full look too.
- **New kick control**: the native ✕ is replaced by a clean cut-corner button
  pinned to the card's top-left corner — it never sits on top of the avatar or
  the ready tag, brightens on hover and turns red when armed. Clicking it
  drives the real site button underneath, so kicking always works.
- **Ready status fixed**: the old detector was fooled by its own READY tag, so
  a card could stay "ready" forever. Ready state now tracks the site's real
  indicator and clears the moment a player unreadies.
- **No more broken lobbies**: whenever the party changes — someone joins,
  leaves, or you get kicked — every CSR+ decoration (leader/member styling,
  card ordering, ready tags, kick buttons, click targets) is wiped and rebuilt
  from scratch. Getting kicked also clears the stored party data, so nothing
  stale leaks into the next lobby.
- Card clicks now read the player id live instead of capturing it once, so a
  reshuffled lobby can't open the wrong profile.

**Firefox**
- The popup no longer renders cropped: explicit page sizing plus proper
  scroll constraints, and thin themed scrollbars (Firefox ignores WebKit
  scrollbar styling, so it was drawing fat default bars into the layout).
- Scrolling fixed on the popup and all CSR+ pages (profile, inventory,
  trades).

## 0.1.1 — Tactical Play tab, live queue, effects remade & fixes

**Play tab — full restructure (Valorant × CS2 look)**
- A sharp tactical redesign: angular cut-corner slot cards, mono labels, one
  confident red accent, staging-bay lighting behind the lobby.
- The party owner ("◆ LEADER") now sits in the **middle** of the lobby.
- **Ready status** is shown clearly — ready players get a green edge and a
  READY tag.
- **Kick (✕)** and every other native lobby control now always work; the card
  click (open profile) never swallows them.
- Solid Join Queue button — no gimmicky sheen; a calm scan line shows while
  searching.
- Styling appears instantly with the tab (no load-in delay), including in a
  second tab.

**Live "CSR+ users in queue" — instant, no request burn**
- The queue list is now pushed in realtime over a single shared connection
  (one Firestore listener for the whole browser), so it updates the moment
  someone joins or leaves — with effectively no polling.
- Being in queue survives switching tabs; it no longer resets.
- The live user counter is real: active-on-site / total.

**Effects — remade (Studio + in-game)**
- Every card overlay rebuilt with real depth: layered gradients, glows, varied
  motion. Rain is sharp diagonal streaks, the neon grid has a glowing horizon
  sun, embers rise from a flickering base, snow sways, starfield has a shooting
  star.
- Overlays combine — stack up to 3 at once.
- New name animations (Tide wave, Neon flicker, Soft breathe, Glitch pop) and
  avatar animations (Chroma halo, Sonar ping, Prism cycle).
- Effect colors: tint animations with their own two colors, independent of your
  accents (or keep them matched — the default).
- MP4/WebM banners preview live in Studio and upload reliably.

**Players without a profile picture**
- Match-found rows are no longer "Anonymous" for default-avatar players.
- Banners and cosmetics load for them too: signed-in CSR+ users register their
  site name so any client can resolve name → account.

**Cloud settings backup**
- Your settings and Studio look are backed up to your CSR+ account and restored
  automatically after a manual reinstall — just sign in with Discord.

**Fixes**
- Firefox: Discord sign-in works (make sure the Firefox redirect URL is
  registered in the Discord application).
- Join Queue no longer breaks when the party owner runs CSR+.
- "Send trade" no longer appears inside the Match found window.
- Strength-badge tooltip always paints above the card.
- Server IP copy falls back to live match data when the site hides the address.
- Party invites aren't auto-accepted while you're already in a party (optional
  child toggle to restore the old behavior).
- The title chip ("AWP enjoyer") sits under the ELO on lobby cards.
- Match-found window pre-loads everyone's banners so the room paints instantly.

## 0.1.0 — Everything free

**CSR+ is now completely free**
- Removed all paid tiers. Every cosmetic — shared banners, animated banners,
  premium name styles, card flair, avatar frames and overlays — is now
  available to everyone at no cost.
- Removed all subscription and checkout flows. There is nothing to buy.
- Sign in with Discord is still used only to share your look with other CSR+
  players (so your uploads belong to you and can be moderated) — never charged.

**Cleanup**
- Removed every Pro/Premium badge and tag across the extension and Studio.
  (Player skill/form badges — Very strong, On fire, Tilted, etc. — are
  unchanged; those were always free.)
- Banners no longer apply on the Friends page, where a featured-friend header
  was being decorated by mistake.
- Added a Donate button in the Studio tab for anyone who'd like to support
  development and server costs.

**Note**
- This is a required update — clients below 0.1.0 are prompted to update.

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
