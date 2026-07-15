(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});
  const { h } = CSRP.dom;

  const NOTES_KEY = 'csrpNotes';
  let notes = {};

  chrome.storage.local.get([NOTES_KEY], (d) => (notes = d[NOTES_KEY] || {}));
  chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'local' && c[NOTES_KEY]) notes = c[NOTES_KEY].newValue || {};
  });

  function saveNote(id, data) {
    notes[id] = { ...notes[id], ...data };
    chrome.storage.local.set({ [NOTES_KEY]: notes });
  }

  function getTag(id) {
    return notes[id]?.tag || null;
  }


  let pop = null;
  function closePop() {
    if (pop) { pop.remove(); pop = null; document.removeEventListener('pointerdown', onDocDown, true); }
  }
  function onDocDown(e) {
    if (pop && !pop.contains(e.target)) closePop();
  }

  async function openCardPopover(id, name, anchorEl) {
    closePop();
    CSRP.sound?.play('click');
    const note = notes[id] || {};
    const agg = await CSRP.playerBadges.getAgg(id);
    const tier = CSRP.classify(agg);

    const tagInput = h('input', { class: 'csrp-pop-tag', placeholder: 'tag (smurf, mate…)', value: note.tag || '' });
    const noteArea = h('textarea', { class: 'csrp-pop-note', placeholder: 'private note…' });
    noteArea.value = note.text || '';

    pop = h('div', { class: 'csrp-pop' }, [
      h('div', { class: 'csrp-pop-head' }, [
        h('span', { class: 'csrp-pop-name' }, name || 'Player'),
        h('span', { class: `csrp-badge ${tier.cls}` }, [h('span', { class: 'csrp-badge-dot' }), tier.label]),
      ]),
      agg ? h('div', { class: 'csrp-pop-stats' }, [
        h('span', {}, `K/D ${agg.kd.toFixed(2)}`),
        h('span', {}, `K/R ${agg.kr.toFixed(2)}`),
        h('span', {}, `ADR ${agg.adr.toFixed(0)}`),
        h('span', {}, `${(agg.winrate * 100).toFixed(0)}% WR`),
        h('span', {}, `${agg.games}g`),
      ]) : null,
      tagInput,
      noteArea,
      h('div', { class: 'csrp-pop-actions' }, [
        h('button', {
          class: 'csrp-pop-save',
          onclick: () => {
            saveNote(id, { tag: tagInput.value.trim(), text: noteArea.value.trim() });
            CSRP.sound?.play('on');
            closePop();
          },
        }, 'Save'),
        h('a', {
          class: 'csrp-pop-link', href: profileUrl(id), target: '_blank', rel: 'noopener',
          onclick: () => CSRP.sound?.play('click'),
        }, 'Profile ↗'),
      ]),
    ]);

    document.body.appendChild(pop);
    positionPop(anchorEl);
    requestAnimationFrame(() => pop && pop.classList.add('csrp-pop-open'));
    setTimeout(() => document.addEventListener('pointerdown', onDocDown, true), 0);
  }

  function positionPop(anchorEl) {
    if (!pop) return;
    const r = anchorEl.getBoundingClientRect();
    const pw = 240, ph = pop.offsetHeight || 220;
    let left = r.left + r.width / 2 - pw / 2;
    let top = r.bottom + 8;
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 8);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  let panel = null;
  function ensurePanel() {
    if (panel) return panel;
    panel = h('div', { class: 'csrp-panel' });
    const backdrop = h('div', { class: 'csrp-panel-bk', onclick: close });
    document.body.append(backdrop, panel);
    panel._bk = backdrop;
    return panel;
  }
  function close() {
    if (!panel) return;
    panel.classList.remove('csrp-panel-open');
    panel._bk.classList.remove('csrp-panel-open');
  }

  async function openProfilePanel(id, name) {
    const p = ensurePanel();
    p.classList.add('csrp-panel-open');
    p._bk.classList.add('csrp-panel-open');
    p.innerHTML = '';
    p.append(h('div', { class: 'csrp-panel-skel' }, 'Loading ' + (name || 'player') + '…'));

    const [profile, history, agg] = await Promise.all([
      CSRP.api.user(id),
      CSRP.api.history(id),
      CSRP.playerBadges.getAgg(id),
    ]);
    p.innerHTML = '';
    const tier = CSRP.classify(agg);
    const note = notes[id] || {};

    const head = h('div', { class: 'csrp-panel-head' }, [
      profile?.avatar
        ? h('img', {
          class: 'csrp-panel-av',
          src: CSRP.api.avatarUrl(id, profile.avatar) + '?size=96',
        })
        : null,
      h('div', { class: 'csrp-panel-id' }, [
        h('div', { class: 'csrp-panel-name' }, profile?.name || name || 'Player'),
        h('div', { class: 'csrp-panel-sub' }, `${profile?.points ?? '—'} ELO · ${profile?.matches ?? 0} matches`),
        h('span', { class: `csrp-badge ${tier.cls}` }, tier.label),
      ]),
      h('button', { class: 'csrp-panel-x', onclick: close, html: '&times;' }),
    ]);

    const statGrid = agg
      ? h('div', { class: 'csrp-panel-stats' },
        [
          ['K/D', agg.kd.toFixed(2)],
          ['K/R', agg.kr.toFixed(2)],
          ['ADR', agg.adr.toFixed(0)],
          ['Winrate', (agg.winrate * 100).toFixed(0) + '%'],
          ['Form', (agg.recentForm).toFixed(2) + '×'],
          ['Sample', agg.games + 'g'],
        ].map(([k, v]) =>
          h('div', { class: 'csrp-panel-stat' }, [
            h('div', { class: 'csrp-panel-statv' }, v),
            h('div', { class: 'csrp-panel-statk' }, k),
          ])
        )
      )
      : null;


    const tagInput = h('input', {
      class: 'csrp-note-tag',
      placeholder: 'tag (e.g. smurf, mate)',
      value: note.tag || '',
    });
    const noteArea = h('textarea', {
      class: 'csrp-note-area',
      placeholder: 'Private note about this player…',
    });
    noteArea.value = note.text || '';
    const notesBlock = h('div', { class: 'csrp-panel-notes' }, [
      h('div', { class: 'csrp-panel-h' }, 'Notes & tags'),
      tagInput,
      noteArea,
      h('button', {
        class: 'csrp-note-save',
        onclick: () => {
          saveNote(id, { tag: tagInput.value.trim(), text: noteArea.value.trim() });
          const b = p.querySelector('.csrp-note-save');
          b.textContent = 'Saved ✓';
          setTimeout(() => (b.textContent = 'Save note'), 1200);
        },
      }, 'Save note'),
    ]);


    const recent = (history || []).filter((m) => !m.canceled).slice(0, 6);
    const histBlock = h('div', { class: 'csrp-panel-hist' }, [
      h('div', { class: 'csrp-panel-h' }, 'Recent matches'),
      ...(recent.length
        ? recent.map((m) => {
          const pl = m.players[id] || {};
          const [a, b] = (m.teams || '').split(' ');
          const sc = (m.score || '0 0').split(' ').map(Number);
          const idx = pl.team === a ? 0 : 1;
          const won = sc[idx] > sc[idx ? 0 : 1];
          return h('div', { class: 'csrp-hist-row ' + (won ? 'csrp-w' : 'csrp-l') }, [
            h('span', { class: 'csrp-hist-map' }, (m.map || '').replace('de_', '')),
            h('span', { class: 'csrp-hist-kda' }, `${pl.kills}/${pl.deaths}/${pl.assists}`),
            h('span', { class: 'csrp-hist-score' }, m.score),
            h('span', { class: 'csrp-hist-res' }, won ? 'W' : 'L'),
          ]);
        })
        : [h('div', { class: 'csrp-panel-empty' }, 'No recent matches')]),
    ]);

    p.append(
      head,
      statGrid,
      notesBlock,
      histBlock,
      h('a', {
        class: 'csrp-panel-link',
        href: profileUrl(id),
        target: '_blank',
        rel: 'noopener',
        onclick: () => CSRP.sound?.play('click'),
      }, 'View full profile ↗')
    );
  }


  function profileUrl(id) {
    const period = CSRP.store?.get('statsPeriod') || 'last10';
    return chrome.runtime.getURL(`profile/profile.html?id=${id}&period=${period}`);
  }


  function openProfile(id) {
    if (!id) return;
    CSRP.sound?.play('click');
    window.open(profileUrl(id), '_blank', 'noopener');
  }


  function tick() {
    for (const card of CSRP.dom.findCards()) {
      const info = CSRP.dom.parseCard(card);
      if (!info.id) continue;
      const note = notes[info.id];
      const head = info.header;
      if (!head) continue;
      const existing = head.querySelector('.csrp-tag-chip');
      if (note?.tag) {
        if (existing) existing.textContent = note.tag;
        else head.appendChild(h('span', { class: 'csrp-tag-chip' }, note.tag));
      } else if (existing) existing.remove();
    }
  }

  CSRP.notes = { openProfilePanel, openCardPopover, openProfile, profileUrl, getTag, tick };
})();
