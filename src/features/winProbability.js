/* CSR+ — team win-probability bar mounted above the two team columns. */
(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});
  const { h } = CSRP.dom;
  let mounted = null;

  async function aggsFor(cards) {
    // Fetch all players in parallel for speed.
    const results = await Promise.all(
      cards.filter((c) => c.id).map((c) => CSRP.playerBadges.getAgg(c.id))
    );
    return results.filter(Boolean);
  }

  function render(pA, titleA, titleB) {
    const a = Math.round(pA * 100);
    const b = 100 - a;
    const bar = mounted.querySelector('.csrp-wp-fill');
    const left = mounted.querySelector('.csrp-wp-a');
    const right = mounted.querySelector('.csrp-wp-b');
    bar.style.width = a + '%';
    left.textContent = `${titleA} · ${a}%`;
    right.textContent = `${b}% · ${titleB}`;
    mounted.classList.toggle('csrp-wp-edge-a', a >= 60);
    mounted.classList.toggle('csrp-wp-edge-b', b >= 60);
  }

  async function tick() {
    // Standalone win-probability bar for the MATCH ROOM (the team-column view).
    // The Match Found window has its own bar inside the rebuilt panel.
    if (!CSRP.store.get('showWinProb')) {
      if (mounted) { mounted.remove(); mounted = null; }
      return;
    }
    const cols = CSRP.dom.findTeamColumns();
    if (cols.length < 2) return;
    const [c1, c2] = cols;
    if (c1.cards.length < 2 || c2.cards.length < 2) return;

    // The site's re-renders can drop our bar from the DOM; rebuild it then.
    if (mounted && !mounted.isConnected) mounted = null;
    if (!mounted) {
      mounted = h('div', { class: 'csrp-wp' }, [
        h('div', { class: 'csrp-wp-labels' }, [
          h('span', { class: 'csrp-wp-a' }, ''),
          h('span', { class: 'csrp-wp-title' }, 'Win Probability'),
          h('span', { class: 'csrp-wp-b' }, ''),
        ]),
        h('div', { class: 'csrp-wp-track' }, [h('div', { class: 'csrp-wp-fill' })]),
      ]);
      // Insert above the team grid.
      const grid = c1.el.parentElement;
      grid.parentElement.insertBefore(mounted, grid);
    }

    const [aggA, aggB] = await Promise.all([aggsFor(c1.cards), aggsFor(c2.cards)]);
    if (aggA.length < 2 || aggB.length < 2) return;
    const p = CSRP.stats.winProbability(aggA, aggB);
    render(
      p,
      shortTitle(c1.title) || 'Team A',
      shortTitle(c2.title) || 'Team B'
    );
  }

  function shortTitle(t) {
    return (t || '').replace(/^team_/i, '');
  }

  function reset() {
    if (mounted) { mounted.remove(); mounted = null; }
  }

  CSRP.winProbability = { tick, reset };
})();
