/* CSR+ — DOM helpers: parsing the site's player cards and mounting our UI. */
(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});

  const h = (tag, props = {}, children = []) => {
    const el = document.createElement(tag);
    for (const k in props) {
      if (k === 'class') el.className = props[k];
      else if (k === 'html') el.innerHTML = props[k];
      else if (k.startsWith('on') && typeof props[k] === 'function')
        el.addEventListener(k.slice(2).toLowerCase(), props[k]);
      else if (k === 'style' && typeof props[k] === 'object') Object.assign(el.style, props[k]);
      else el.setAttribute(k, props[k]);
    }
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null) return;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return el;
  };

  // Extract a Discord user id from an avatar <img> srcset/src on a card.
  // Handles plain, %2F-encoded and double-encoded Next.js image URLs, and
  // ignores anonymous "embed/avatars/0.png" placeholders.
  function idFromAvatar(img) {
    if (!img) return null;
    let src = (img.getAttribute('src') || '') + ' ' + (img.getAttribute('srcset') || '');
    try { src = decodeURIComponent(src); } catch { /* keep raw */ }
    // embed/avatars/N.png are Discord's default anonymous avatars — not a user id.
    if (/embed\/avatars\//i.test(src)) return null;
    const m = src.match(/avatars\/(\d{15,21})\//);
    return m ? m[1] : null;
  }

  // Parse a single player card element into a lightweight descriptor.
  function parseCard(card) {
    const img = card.querySelector('img[alt]');
    const id = idFromAvatar(img);
    const nameEl = card.querySelector('h1');
    const eloEl = card.querySelector('p.text-theme-primary-light');
    return {
      el: card,
      id,
      avatar: img,
      name: nameEl ? nameEl.textContent.trim() : img?.getAttribute('alt') || '',
      elo: eloEl ? parseInt(eloEl.textContent, 10) || null : null,
      header: card.querySelector('.flex.items-center.gap-1\\.5') || nameEl?.parentElement,
    };
  }

  // Find every player card on the page (match room + accept window share markup).
  function findCards() {
    return Array.from(
      document.querySelectorAll('div.flex.flex-row.border-b.border-theme-gray.rounded-md')
    ).filter((c) => c.querySelector('h1') && c.querySelector('img[alt]'));
  }

  // Group cards into the two team columns by their nearest column ancestor.
  function findTeamColumns() {
    const cols = Array.from(
      document.querySelectorAll('div.flex.flex-col.justify-start.w-full.space-y-1\\.5')
    );
    return cols.map((col) => ({
      el: col,
      title: col.querySelector('p.font-semibold')?.textContent.trim() || '',
      cards: Array.from(
        col.querySelectorAll('div.flex.flex-row.border-b.border-theme-gray.rounded-md')
      )
        .filter((c) => c.querySelector('h1'))
        .map(parseCard),
    }));
  }

  // Detect the "Match found" confirm modal and return the avatar <img>s.
  // This modal has no player cards — just a flex row of <img alt="Avatar">.
  function findMatchFoundModal() {
    // Anchor on the heading text to avoid false positives.
    let host = null;
    for (const p of document.querySelectorAll('p, h1, h2')) {
      if (p.textContent.trim().toLowerCase() === 'match found') {
        host = p.closest('div.rounded-lg') || p.parentElement?.parentElement;
        break;
      }
    }
    if (!host) return null;
    const avatars = Array.from(host.querySelectorAll('img[alt="Avatar"], img[alt]'))
      .filter((im) => {
        const r = im.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
    if (avatars.length < 2) return null;
    // Prefer the inner full-width column to mount into; fall back to the box.
    const inner = host.querySelector('.flex.h-full.w-full.flex-col') || host;
    // The native Accept button ("Accept Match" → "Match Accepted" when done).
    // Prefer an exact text match; only fall back to a fuzzy "accept …" match
    // when the button also carries the primary-CTA styling, so we don't grab
    // unrelated buttons ("Accept invite", "Accept terms", etc.).
    let acceptBtn = null;
    let fuzzyBtn = null;
    for (const btn of host.querySelectorAll('button')) {
      const t = btn.textContent.trim().toLowerCase();
      if (t === 'accept match' || t === 'match accepted') { acceptBtn = btn; break; }
      if (
        !fuzzyBtn &&
        t.startsWith('accept') &&
        btn.classList.contains('bg-theme-primary')
      ) fuzzyBtn = btn;
    }
    if (!acceptBtn) acceptBtn = fuzzyBtn;
    const accepted = !!acceptBtn && (acceptBtn.disabled ||
      /accepted/.test(acceptBtn.textContent.trim().toLowerCase()));
    return { host, inner, avatars, acceptBtn, accepted };
  }

  CSRP.dom = { h, idFromAvatar, parseCard, findCards, findTeamColumns, findMatchFoundModal };
})();
