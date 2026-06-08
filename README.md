# CSR+

A Chrome (Manifest V3) extension for **[csrestored.fun](https://csrestored.fun)**.
It handles the repetitive parts of matchmaking and surfaces useful player stats
directly in the lobby, without changing how the site works.

## Features

**Automation**
- Auto-accept the match ready check, with a 10-second countdown you can cancel.
- Auto-accept queue starts.
- Auto-accept party invites — restricted to trusted friends, or everyone.
- Auto-ban maps using a priority order you set (two per turn, one in the final vote).
- Auto-copy the server connect string when a match server is ready.

**In-game info**
- A skill badge on every player card so you can read a lobby at a glance.
- A team win-probability bar built from ELO, K/D, K/R, ADR, win rate and recent form.
- A match overlay that rebuilds the Match Found window with full per-player stats.
- Private notes and tags you can attach to any player.

**Player profile page**
- A clean profile view with the full statistics grid and win/loss match history.
- Quick links to the player's Steam, SteamDB and FaceitFinder pages.

CSR+ runs on any modern browser — Chrome, Edge, Brave, Opera and Firefox — from a
single shared codebase (Manifest V3).

## Install on Chrome / Edge / Brave / Opera (developer mode)
1. Open `chrome://extensions` (Edge: `edge://extensions`, Brave: `brave://extensions`).
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this folder.
4. Visit `https://csrestored.fun/app`, sign in, then open the toolbar popup to configure.

## Install on Firefox
1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and pick this folder's `manifest.json`.
3. Visit `https://csrestored.fun/app`, sign in, then open the toolbar popup.

> Temporary add-ons are removed when Firefox restarts. For a permanent install,
> the extension must be signed through [addons.mozilla.org](https://addons.mozilla.org).

## Updates
The popup checks GitHub for newer releases and shows a notice when one is
available. See [CHANGELOG.md](CHANGELOG.md) for release notes.

## Project layout
```
manifest.json
popup/                 settings UI (toggles, friends, drag-reorder ban priority)
profile/               full-page player profile (stats grid + match history)
src/
  lib/                 constants, storage, API client, stats, DOM helpers, sound
  features/            playerBadges, notes, matchOverlay, autoAccept, mapBan,
                       winProbability, serverCopy
  inject/socketHook.js page-world hook reading React matchData / Phoenix socket
  main.js              content-script orchestrator
  styles/inject.css    in-page styling
```
Each feature is an isolated module on the `window.CSRP` namespace. `main.js` runs
a fast loop for automation and a slower, mutation-observed loop for the UI.

## Privacy & license
- No analytics, no tracking. All settings and notes stay in local browser storage.
  See [PRIVACY.md](PRIVACY.md).
- Licensed under the [GNU GPL v3](LICENSE).

> Not affiliated with Valve or Counter-Strike: Restored.
