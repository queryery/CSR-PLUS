# Changelog

## 0.0.7

- New CSR+ Trades (beta): a redesigned trade screen — see a friend's item
  floats/seed before you request them, search/sort/filter both inventories, and
  browse your trade history with read-only previews.
- Accept or reject incoming pending trades from CSR+.
- Added a Feedback tab and a Report-a-bug button (Discord: 9uery).
- Smarter stats engine: a real per-match impact rating, form trend (improving /
  declining) and win/loss streak detection, with small samples weighted
  cautiously so one lucky match can't mint a top badge.
- Two new player badges: "On fire" (win streak + climbing form) and "Tilted"
  (loss streak + sliding form). Badge tooltips now show Rating, Form and Streak.
- Win probability now weighs star players more (carries decide pugs), factors
  in momentum, and stays near 50% when there's little data on a lineup.
- Stat periods are now Today / Yesterday / Last 10 games (replacing "All"), so
  lobbies load with half the history requests.
- Fixed accepting/rejecting trades failing with an error (wrong HTTP method).
- Fixed a ghost auto-accept countdown that kept ticking (and "accepted")
  after the match-found dialog had already closed.
- Fixed the win-probability bar disappearing for good after the site
  re-rendered the match room.
- Fixed the trade composer showing the previous friend's inventory if you
  switched friends while it was still loading.
- Fixed high-value item ids being silently corrupted in trade offers
  (number precision), which could make the server reject the trade.
- Fixed the volume / accept-delay sliders sometimes not saving their final
  value after a drag.
- Rejecting a trade now plays the right sound.

## 0.0.6

- Each team's top player is now crowned BEST and highlighted in gold.
- The page behind the Match Found window is locked while it's up, so a stray
  click can't dodge or mis-click the lobby.
- Added a Copy button to Match Found — copies both teams (name, ELO, K/D) to
  your clipboard to paste in Discord.
- New ELO tracker: a toast shows your ELO change after each match (▲/▼) along
  with your running session total.
- Desktop notification when a match is found, so you don't miss it while tabbed
  out.
- New leaderboard search — filter by username or user ID; searching an exact ID
  that isn't on the board fetches that player on the fly.
- Click any player's lobby card to open their CSR+ profile, with a subtle hover
  lift.
- Your settings now follow your browser account and survive extension reloads
  and reinstalls.
- Fixed the Accept Match button being unclickable in the Match Found window.
- Fixed auto-accept re-showing the "Auto-accepting" countdown after a match was
  already accepted.

## 0.0.5

- Fixed inventory icons showing the wrong skin.
- Fixed the map veto list jumping around (and playing sounds repeatedly) while
  reordering — dragging is smooth now.
- Added UI sounds to the profile and inventory pages.
- Added a Back button to the profile and inventory pages.

## 0.0.4

- New inventory viewer: open any player's skins with icons, float, pattern seed
  and StatTrak, with search, sorting and type filters.
- Added a "Watch inventory" button on player pages.
- Custom profile page now has Overview / History / Inventory tabs.
- Fixed not being able to accept a match manually when auto-accept was off.
- Fixed server address copy — it reads the real address from the connect link
  and shows a confirmation when copied; click the address to copy any time.
- Match Found window restyled to match the app.
- Added a community user counter in the popup.

## 0.0.3

- Fixed the server address not copying — it now copies reliably, and you can
  click the address to copy it if the browser blocks the automatic copy.
- Fixed invisible button text in the player popup on the light/mono theme.

## 0.0.2

- Match Found window is now properly centered.
- You can drag the Match Found window around by its top bar.
- Added accept settings: pick the countdown length, or accept instantly.
- Restyled the player card popup and tweaked a few rough UI spots.
- Works across Chrome, Edge, Brave and Firefox.

## 0.0.1

- Release
