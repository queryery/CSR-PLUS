/* CSR+ — adds a search box to the site's Leaderboard so you can filter rows by
 * username or user id. The leaderboard is a list of `.grid.grid-cols-5` rows;
 * each row carries the username (alt + visible <p>) and the user id inside the
 * row's `a[href="/app/user/<id>"]`. We inject a search field above the table and
 * show/hide rows live, with a "no results" note and a match counter. */
(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});
  const { h } = CSRP.dom;

  const BOX_ID = 'csrp-lb-search';
  let query = '';
  // Remote-lookup state: when an exact user id isn't on the visible board we
  // fetch that user once and render a synthetic result row.
  const remoteCache = new Map(); // id -> profile | null (null = not found)
  let remoteRow = null;          // the injected result row, if any
  let remoteFor = '';            // the id remoteRow is currently showing

  const isUserId = (s) => /^\d{17,21}$/.test(s);

  const SITE = 'https://csrestored.fun';

  // Find the leaderboard's header row (the one labelled Rank / Username / ELO).
  // Returns the header element, or null if we're not on the leaderboard.
  function findHeader() {
    for (const row of document.querySelectorAll('div.grid.grid-cols-5')) {
      if (row.classList.contains('items-center')) continue; // that's a data row
      const txt = row.textContent.toLowerCase();
      if (txt.includes('username') && txt.includes('elo')) return row;
    }
    return null;
  }

  // The table wrapper that holds the header + all the player rows.
  function findTable(header) {
    return header.closest('.flex.flex-col') || header.parentElement;
  }

  function dataRows(table) {
    return Array.from(table.querySelectorAll('div.grid.grid-cols-5.items-center'))
      .filter((r) => !r.classList.contains('csrp-lb-remote')); // skip our injected row
  }

  // Pull the searchable fields out of one row: username + user id.
  function rowFields(row) {
    const link = row.querySelector('a[href*="/user/"]');
    const m = link && link.getAttribute('href').match(/\/user\/(\d{15,21})/);
    const id = m ? m[1] : '';
    const nameEl = row.querySelector('p.truncate, a p, img[alt]');
    let name = '';
    const vis = row.querySelector('a p');
    if (vis) name = vis.textContent.trim();
    if (!name) {
      const img = row.querySelector('img[alt]');
      name = img ? (img.getAttribute('alt') || '').trim() : '';
    }
    return { id, name: name.toLowerCase() };
  }

  // Remove the injected remote row (if present).
  function clearRemote() {
    if (remoteRow) { remoteRow.remove(); remoteRow = null; }
    remoteFor = '';
  }

  // Build a leaderboard-style row from a fetched /users profile so a player who
  // isn't on the visible board still shows up when searched by exact id.
  function buildRemoteRow(id, profile, state) {
    const avatar = profile && profile.avatar
      ? `https://cdn.discordapp.com/avatars/${id}/${profile.avatar}.png?size=64` : '';
    const name = profile ? (profile.name || 'Player') : 'Unknown player';
    const elo = profile && profile.points != null ? profile.points + ' ELO' : '—';
    const matches = profile && profile.matches != null ? String(profile.matches) : '—';
    const wins = profile && profile.wins != null ? String(profile.wins) : '—';

    const av = avatar
      ? h('img', { class: 'rounded-full', width: '35', height: '35', src: avatar, alt: name,
          style: { width: '35px', height: '35px', color: 'transparent' } })
      : h('div', { class: 'rounded-full', style: { width: '35px', height: '35px', background: 'rgba(255,255,255,0.08)' } });

    return h('div', {
      class: 'grid grid-cols-5 items-center py-3 text-center text-theme-white-darker csrp-lb-remote',
    }, [
      h('p', {}, h('span', { class: 'csrp-lb-remote-tag' }, state === 'loading' ? '⌕' : '★')),
      h('a', { class: 'flex flex-row items-center space-x-3', href: `${SITE}/app/user/${id}` }, [
        av,
        h('p', { class: 'truncate text-left text-theme-white' },
          state === 'loading' ? 'Looking up…' : name),
      ]),
      h('p', {}, matches),
      h('p', {}, wins),
      h('p', { class: 'text-theme-primary' }, elo),
    ]);
  }

  // The API returns HTTP 200 with {"message":"Not found"} for missing users, so
  // a truthy object isn't enough — a real profile must carry a name/id.
  function isValidProfile(p) {
    return !!(p && typeof p === 'object' && !p.message && (p.name || p.id));
  }

  // Render / refresh the remote result for an exact id, fetching once.
  function showRemote(table, header, id, emptyEl) {
    if (remoteFor === id && remoteRow) return; // already showing this id
    clearRemote();
    remoteFor = id;
    if (emptyEl) emptyEl.style.display = 'none';

    const place = (node) => {
      clearRemote();
      remoteFor = id;
      remoteRow = node;
      header.insertAdjacentElement('afterend', node);
    };
    const notFound = () => { clearRemote(); remoteFor = id; if (emptyEl) emptyEl.style.display = ''; };

    if (remoteCache.has(id)) {
      const p = remoteCache.get(id);
      if (p) place(buildRemoteRow(id, p, 'ok'));
      else notFound();
      return;
    }

    // Loading placeholder, then fetch.
    place(buildRemoteRow(id, null, 'loading'));
    Promise.resolve(CSRP.api.user(id)).then((profile) => {
      const ok = isValidProfile(profile);
      remoteCache.set(id, ok ? profile : null);
      // Ignore if the query moved on while we were fetching.
      if (query.trim() !== id) return;
      if (ok) place(buildRemoteRow(id, profile, 'ok'));
      else notFound();
    }).catch(() => {
      remoteCache.set(id, null);
      if (query.trim() === id) notFound();
    });
  }

  function applyFilter(table, header, counterEl, emptyEl) {
    const raw = query.trim();
    const q = raw.toLowerCase();
    const rows = dataRows(table);
    let shown = 0;
    for (const row of rows) {
      const { id, name } = rowFields(row);
      const hit = !q || name.includes(q) || id.includes(q);
      row.style.display = hit ? '' : 'none';
      if (hit) shown++;
    }

    // If the query is an exact user id with no visible match, look it up
    // remotely and inject a result row. Otherwise drop any stale remote row.
    let remoteShown = 0;
    if (shown === 0 && isUserId(raw)) {
      showRemote(table, header, raw, emptyEl);
      if (remoteRow) remoteShown = 1; // counts the injected result (incl. loading)
    } else {
      clearRemote();
      if (emptyEl) emptyEl.style.display = (q && shown === 0) ? '' : 'none';
    }

    if (counterEl) {
      counterEl.textContent = q
        ? `${shown + remoteShown} / ${rows.length}`
        : `${rows.length} players`;
    }
  }

  function build(header) {
    const table = findTable(header);
    if (!table || document.getElementById(BOX_ID)) return;

    const counter = h('span', { class: 'csrp-lb-count' }, '');
    const empty = h('div', { class: 'csrp-lb-empty' }, 'No players match your search.');
    empty.style.display = 'none';

    const input = h('input', {
      type: 'text',
      class: 'csrp-lb-input',
      placeholder: 'Search username or user ID…',
      spellcheck: 'false',
      autocomplete: 'off',
    });
    input.addEventListener('input', () => {
      query = input.value;
      applyFilter(table, header, counter, empty);
    });
    // Esc clears the field.
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { input.value = ''; query = ''; applyFilter(table, header, counter, empty); }
    });

    const clearBtn = h('button', {
      class: 'csrp-lb-clear', title: 'Clear', type: 'button',
      onclick: () => { input.value = ''; query = ''; applyFilter(table, header, counter, empty); input.focus(); },
    }, '✕');

    const bar = h('div', { id: BOX_ID, class: 'csrp-lb-search' }, [
      h('span', { class: 'csrp-lb-ic' }, '⌕'),
      input,
      clearBtn,
      counter,
    ]);

    // Mount the search bar just above the table, and the empty note just below
    // the header so it appears where rows would be.
    table.parentElement.insertBefore(bar, table);
    header.insertAdjacentElement('afterend', empty);

    applyFilter(table, header, counter, empty);
  }

  function tick() {
    const header = findHeader();
    if (!header) {
      const stale = document.getElementById(BOX_ID);
      if (stale) stale.remove();
      clearRemote();
      query = '';
      return;
    }
    if (!document.getElementById(BOX_ID)) build(header);
    else {
      // Keep the filter applied as the site streams in / re-renders rows.
      const table = findTable(header);
      const bar = document.getElementById(BOX_ID);
      applyFilter(table, header, bar?.querySelector('.csrp-lb-count'),
        document.querySelector('.csrp-lb-empty'));
    }
  }

  CSRP.leaderboardSearch = { tick };
})();
