(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});
  const { h } = CSRP.dom;

  const BOX_ID = 'csrp-lb-search';
  let query = '';

  const remoteCache = new Map();
  let remoteRow = null;
  let remoteFor = '';

  const isUserId = (s) => /^\d{17,21}$/.test(s);

  const SITE = 'https://csrestored.fun';

  function findHeader() {
    for (const row of document.querySelectorAll('div.grid.grid-cols-5')) {
      if (row.classList.contains('items-center')) continue;
      const txt = row.textContent.toLowerCase();
      if (txt.includes('username') && txt.includes('elo')) return row;
    }
    return null;
  }

  function findTable(header) {
    return header.closest('.flex.flex-col') || header.parentElement;
  }

  function dataRows(table) {
    return Array.from(table.querySelectorAll('div.grid.grid-cols-5.items-center'))
      .filter((r) => !r.classList.contains('csrp-lb-remote'));
  }

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

  function clearRemote() {
    if (remoteRow) { remoteRow.remove(); remoteRow = null; }
    remoteFor = '';
  }

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

  function isValidProfile(p) {
    return !!(p && typeof p === 'object' && !p.message && (p.name || p.id));
  }

  function showRemote(table, header, id, emptyEl) {
    if (remoteFor === id && remoteRow) return;
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

    place(buildRemoteRow(id, null, 'loading'));
    Promise.resolve(CSRP.api.user(id)).then((profile) => {
      const ok = isValidProfile(profile);
      remoteCache.set(id, ok ? profile : null);

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

    let remoteShown = 0;
    if (shown === 0 && isUserId(raw)) {
      showRemote(table, header, raw, emptyEl);
      if (remoteRow) remoteShown = 1;
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

    const tableHost = table.parentElement;
    if (!tableHost || table.parentNode !== tableHost) return;
    tableHost.insertBefore(bar, table);
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

      const table = findTable(header);
      const bar = document.getElementById(BOX_ID);
      applyFilter(table, header, bar?.querySelector('.csrp-lb-count'),
        document.querySelector('.csrp-lb-empty'));
    }
  }

  CSRP.leaderboardSearch = { tick };
})();
