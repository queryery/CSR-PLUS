(() => {
  "use strict";
  const CSRP = window.CSRP = window.CSRP || {};
  const {h} = CSRP.dom;
  let mounted = null;
  async function aggsFor(cards) {
    const results = await Promise.all(cards.filter(c => c.id).map(c => CSRP.playerBadges.getAgg(c.id)));
    return results.filter(Boolean);
  }
  function render(pA, titleA, titleB) {
    const a = Math.round(pA * 100);
    const b = 100 - a;
    const bar = mounted.querySelector(".csrp-wp-fill");
    const left = mounted.querySelector(".csrp-wp-a");
    const right = mounted.querySelector(".csrp-wp-b");
    bar.style.width = a + "%";
    left.textContent = `${titleA} · ${a}%`;
    right.textContent = `${b}% · ${titleB}`;
    mounted.classList.toggle("csrp-wp-edge-a", a >= 60);
    mounted.classList.toggle("csrp-wp-edge-b", b >= 60);
  }
  async function tick() {
    if (!CSRP.store.get("showWinProb")) {
      if (mounted) {
        mounted.remove();
        mounted = null;
      }
      return;
    }
    const cols = CSRP.dom.findTeamColumns();
    if (cols.length < 2) return;
    const [c1, c2] = cols;
    if (c1.cards.length < 2 || c2.cards.length < 2) return;
    if (mounted && !mounted.isConnected) mounted = null;
    if (!mounted) {
      mounted = h("div", {
        class: "csrp-wp"
      }, [ h("div", {
        class: "csrp-wp-labels"
      }, [ h("span", {
        class: "csrp-wp-a"
      }, ""), h("span", {
        class: "csrp-wp-title"
      }, "Win Probability"), h("span", {
        class: "csrp-wp-b"
      }, "") ]), h("div", {
        class: "csrp-wp-track"
      }, [ h("div", {
        class: "csrp-wp-fill"
      }) ]) ]);
      const grid = c1.el.parentElement;
      const host = grid && grid.parentElement;
      if (!host || grid.parentNode !== host) {
        mounted = null;
        return;
      }
      host.insertBefore(mounted, grid);
    }
    fitToColumns(c1.el, c2.el);
    const [aggA, aggB] = await Promise.all([ aggsFor(c1.cards), aggsFor(c2.cards) ]);
    if (aggA.length < 2 || aggB.length < 2) return;
    const p = CSRP.stats.winProbability(aggA, aggB);
    let titleA = shortTitle(c1.title) || "Team A";
    let titleB = shortTitle(c2.title) || "Team B";
    const my = CSRP._myId;
    if (my) {
      if (c1.cards.some(c => c.id === my)) {
        titleA = "Your Team";
        titleB = "Enemy Team";
      } else if (c2.cards.some(c => c.id === my)) {
        titleA = "Enemy Team";
        titleB = "Your Team";
      }
    }
    render(p, titleA, titleB);
  }
  function fitToColumns(colA, colB) {
    if (!mounted || !colA || !colB || !mounted.parentElement) return;
    try {
      const host = mounted.parentElement;
      const ra = colA.getBoundingClientRect();
      const rb = colB.getBoundingClientRect();
      if (!ra.width || !rb.width) return;
      const left = Math.min(ra.left, rb.left);
      const right = Math.max(ra.right, rb.right);
      const cs = getComputedStyle(host);
      const contentLeft = host.getBoundingClientRect().left + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.paddingLeft) || 0);
      const ml = Math.max(0, Math.round(left - contentLeft));
      const w = Math.round(right - left);
      if (mounted.style.marginLeft !== ml + "px") mounted.style.marginLeft = ml + "px";
      if (mounted.style.width !== w + "px") mounted.style.width = w + "px";
      mounted.style.marginRight = "0";
      mounted.style.boxSizing = "border-box";
    } catch {}
  }
  function shortTitle(t) {
    return (t || "").replace(/^team_/i, "");
  }
  function reset() {
    if (mounted) {
      mounted.remove();
      mounted = null;
    }
  }
  CSRP.winProbability = {
    tick,
    reset
  };
})();
