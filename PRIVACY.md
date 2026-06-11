# Privacy Policy

**CSR+** is a browser extension that enhances the experience on
[csrestored.fun](https://csrestored.fun). This document explains exactly what
data the extension touches and where it goes. In short: **CSR+ has no servers of
its own and does not collect, sell, or transmit your personal data to anyone.**

_Last updated: 8 June 2026._

## What is stored, and where

All of your data stays on your own machine, in the browser's local extension
storage (`chrome.storage.local`). Nothing is uploaded.

| Data | Purpose | Location |
| --- | --- | --- |
| Your settings (toggles, theme, sound, ban priority) | Remember how you configured the extension | Local only |
| Trusted-friends list | Decide which party invites to auto-accept | Local only |
| Private notes and tags you write on players | Show your own notes back to you | Local only |
| Cached player stats | Avoid re-fetching the same profile repeatedly | Local / session only |

You can erase all of it at any time by removing the extension, or via
`chrome://extensions` → CSR+ → **Remove**.

## Network requests

CSR+ makes requests only to the following hosts, and only to provide the
features you enabled:

- **`api.csrestored.fun`** — the official CS:Restored API. CSR+ reads public
  player profiles and match history to calculate strength badges, ratings, and
  win-probability. These are the same endpoints the website itself uses. Requests
  are made with your existing site session so they return the same data you would
  see while logged in.
- **`cdn.discordapp.com` / `flagcdn.com`** — to display player avatars and
  country flags (images only).
- **`api.github.com`** — only when you open the extension popup, to check whether
  a newer version of CSR+ has been released. This request sends no personal data;
  it asks GitHub for the latest public release tag of the project. You can ignore
  the update notice if you prefer not to update.

CSR+ does **not** run analytics, telemetry, advertising, fingerprinting, or any
third-party tracking. There is no account, login, or sign-up for the extension
itself.

## Permissions, and why they are needed

- **`storage`** — save your settings and notes locally (above).
- **`clipboardWrite`** — copy the server connect string to your clipboard when a
  match server is ready (only if you enable "Auto-copy server IP").
- **Host access to `csrestored.fun` and `api.csrestored.fun`** — required to add
  the in-page UI and read public stats. CSR+ does not run on any other website.

## Children

CSR+ is intended for the existing audience of csrestored.fun and is not directed
at children under 13.

## Changes

If this policy changes, the updated version will be published in the project
repository alongside the release notes.

## Contact

Questions or concerns: open an issue at
<https://github.com/queryery/CSR-PLUS>.

---

CSR+ is an independent project and is not affiliated with Valve Corporation or
Counter-Strike: Restored.
