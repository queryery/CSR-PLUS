(function(root) {
  "use strict";
  const toInt = v => {
    if (v == null || v === "") return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  };
  const PHASE_COLORS = {
    Ruby: "#ef2d4f",
    Sapphire: "#2f7bff",
    "Black Pearl": "#8a63d2",
    Emerald: "#16c784",
    "Phase 1": "#b78bff",
    "Phase 2": "#e07bd0",
    "Phase 3": "#9b8bd0",
    "Phase 4": "#7f9bff"
  };
  const GEM_PHASES = [ "Ruby", "Sapphire", "Black Pearl", "Emerald" ];
  const DOPPLER = {
    415: "Ruby",
    416: "Sapphire",
    417: "Black Pearl",
    418: "Phase 1",
    419: "Phase 2",
    420: "Phase 3",
    421: "Phase 4"
  };
  const GAMMA = {
    568: "Emerald",
    569: "Phase 1",
    570: "Phase 2",
    571: "Phase 3",
    572: "Phase 4"
  };
  const GAMMA_GLOCK = {
    1119: "Emerald",
    1120: "Phase 1",
    1121: "Phase 2",
    1122: "Phase 3",
    1123: "Phase 4"
  };
  const isDopplerName = n => /doppler/i.test(n || "");
  const isGammaName = n => /gamma\s*doppler/i.test(n || "");
  const isGlockName = n => /glock-18/i.test(n || "");
  const ALL_FINISH = Object.assign({}, DOPPLER, GAMMA, GAMMA_GLOCK);
  const MAP_CACHE_KEY = "csrp:doppler-idmap-v1";
  const MAP_TTL = 24 * 36e5;
  const MAP_URL = "https://api.github.com/repos/smelbravo/CS-Restored-Inventory-Helper/contents/csr%20inventory%20plugin/data/csr-doppler-item-map.json?ref=develop";
  let idMap = {};
  let mapPromise = null;
  let persistTimer = null;
  function defId(item) {
    const a = toInt(item && item.item_id), b = toInt(item && item.weapon_id);
    if (a == null) return b;
    if (b == null) return a;
    return Math.min(a, b);
  }
  function mergeMap(obj) {
    if (!obj || typeof obj !== "object") return;
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith("_")) continue;
      const fc = toInt(v);
      if (fc != null && ALL_FINISH[fc]) idMap[k] = fc;
    }
  }
  function persistMap() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      try {
        localStorage.setItem(MAP_CACHE_KEY, JSON.stringify({
          t: Date.now(),
          v: idMap
        }));
      } catch {}
    }, 400);
  }
  function loadIdMap() {
    if (mapPromise) return mapPromise;
    mapPromise = (async () => {
      let fresh = false;
      try {
        const c = JSON.parse(localStorage.getItem(MAP_CACHE_KEY) || "null");
        if (c && c.v) {
          mergeMap(c.v);
          fresh = Date.now() - c.t < MAP_TTL;
        }
      } catch {}
      if (!fresh) {
        try {
          const r = await fetch(MAP_URL, {
            cache: "no-store"
          });
          if (r.ok) {
            const meta = await r.json();
            if (meta && meta.content) {
              mergeMap(JSON.parse(atob(String(meta.content).replace(/\n/g, ""))));
              persistMap();
            }
          }
        } catch {}
      }
      return idMap;
    })();
    return mapPromise;
  }
  function learn(items) {
    if (!Array.isArray(items)) return;
    let changed = false;
    for (const it of items) {
      if (!it || !isDopplerName(it.name)) continue;
      const fc = toInt(it.skin_index != null ? it.skin_index : it.skinIndex);
      const id = defId(it);
      if (fc == null || id == null || !ALL_FINISH[fc]) continue;
      if (idMap[String(id)] !== fc) {
        idMap[String(id)] = fc;
        changed = true;
      }
    }
    if (changed) persistMap();
  }
  function phaseWord(s) {
    const m = /(sapphire|ruby|black\s*pearl|emerald|phase\s*([1-4])|\bp([1-4])\b)/i.exec(String(s || ""));
    if (!m) return null;
    if (m[2] || m[3]) return "Phase " + (m[2] || m[3]);
    const w = m[1].replace(/\s+/g, " ").toLowerCase();
    const map = {
      sapphire: "Sapphire",
      ruby: "Ruby",
      "black pearl": "Black Pearl",
      emerald: "Emerald"
    };
    return map[w] || null;
  }
  function phaseFor(name, skinIndex) {
    if (!isDopplerName(name)) return null;
    const fam = isGammaName(name) ? isGlockName(name) ? GAMMA_GLOCK : GAMMA : DOPPLER;
    const fc = toInt(skinIndex);
    let phase = null;
    if (fc != null) {
      for (const t of [ fam, DOPPLER, GAMMA, GAMMA_GLOCK ]) {
        if (t[fc]) {
          phase = t[fc];
          break;
        }
      }
    }
    if (!phase) {
      phase = phaseWord(typeof skinIndex === "string" ? skinIndex : "") || phaseWord(name);
      if (!phase) return null;
    }
    const gem = GEM_PHASES.includes(phase);
    const family = isGammaName(name) ? "Gamma Doppler" : "Doppler";
    const short = gem ? phase : phase.replace("Phase ", "P");
    return {
      label: (gem ? "◆ " : "") + short,
      color: PHASE_COLORS[phase],
      title: `${family} — ${phase}` + (fc != null ? ` (finish catalog ${fc})` : ""),
      gem
    };
  }
  const CH_WEAPON_RULES = [ [ "ak47", /ak-47/ ], [ "mac10", /mac-10/ ], [ "fiveseven", /five-seven/ ], [ "m9", /m9 bayonet/ ], [ "karambit", /karambit/ ], [ "butterfly", /butterfly/ ], [ "skeleton", /skeleton/ ], [ "talon", /talon/ ], [ "stiletto", /stiletto/ ], [ "ursus", /ursus/ ], [ "nomad", /nomad/ ], [ "paracord", /paracord/ ], [ "survival", /survival/ ], [ "navaja", /navaja/ ], [ "falchion", /falchion/ ], [ "huntsman", /huntsman/ ], [ "bowie", /bowie/ ], [ "flip", /flip knife/ ], [ "gut", /gut knife/ ], [ "classic", /classic knife/ ], [ "kukri", /kukri/ ], [ "shadow", /shadow daggers/ ], [ "bayonet", /bayonet/ ] ];
  const CH_BLUE = {
    ak47: {
      1: [ 661 ],
      t1: [ 151, 168, 179, 321, 387, 555, 592, 670, 760, 809, 955 ],
      t2: [ 4, 13, 28, 32, 65, 74, 82, 92, 103, 122, 139, 147, 172, 189, 205, 228, 256, 323, 341, 426, 430, 442, 463, 479, 512, 525, 526, 532, 541, 571, 578, 605, 617, 627, 695, 698, 708, 713, 750, 752, 791, 828, 844, 868, 887, 888, 892, 903, 905, 922, 950, 969, 978, 996 ],
      t3: [ 34, 81, 112, 278, 310, 312, 363, 381, 413, 428, 429, 450, 519, 557, 586, 610, 647, 685, 689, 690, 733, 754, 770, 819, 823, 856, 862, 872, 878, 935, 1e3 ]
    },
    karambit: {
      1: [ 387 ],
      t1: [ 905, 698, 670, 130, 375, 664, 828, 74, 282, 453, 868, 377, 891, 798, 341, 541, 713, 661, 494, 4, 182, 823, 273, 838, 917, 82, 721, 510, 809, 470, 179 ],
      t2: [ 262, 322, 30, 256, 139, 782, 989, 888, 11, 844, 92, 919, 112, 770, 330, 463, 306, 34, 429, 965, 811, 522, 803, 20, 575, 638, 914, 580, 236, 310, 916, 515, 631, 407, 371, 841, 555, 711, 632, 398, 598, 420, 283, 856, 202 ]
    },
    m9: {
      1: [ 601 ],
      t1: [ 58, 107, 150, 239, 253, 349, 354, 403, 406, 417, 449, 503, 517, 523, 550, 585, 634, 675, 897, 946 ]
    },
    fiveseven: {
      1: [ 278, 690 ],
      t1: [ 189, 363, 689, 868, 872 ]
    },
    mac10: {
      t1: [ 667, 114, 406, 95 ],
      t2: [ 19, 22, 80, 199, 239, 251, 295, 313, 349, 503, 748, 807, 890, 944 ]
    },
    butterfly: {
      1: [ 494 ]
    },
    bayonet: {
      1: [ 555, 592, 670 ]
    },
    talon: {
      1: [ 146, 442 ]
    },
    skeleton: {
      1: [ 387, 601 ]
    },
    flip: {
      1: [ 670 ]
    },
    bowie: {
      1: [ 182 ]
    },
    huntsman: {
      1: [ 618 ]
    },
    falchion: {
      1: [ 494, 991 ]
    },
    gut: {
      1: [ 567 ]
    },
    shadow: {
      1: [ 56 ]
    },
    navaja: {
      1: [ 398, 407, 838 ]
    },
    nomad: {
      1: [ 888 ]
    },
    stiletto: {
      1: [ 182, 398 ]
    },
    ursus: {
      1: [ 916, 365 ]
    },
    paracord: {
      1: [ 398 ]
    },
    survival: {
      1: [ 403 ]
    },
    classic: {
      1: [ 387, 670 ]
    },
    kukri: {
      1: [ 371, 494 ]
    }
  };
  const CH_GOLD = {
    flip: {
      1: [ 731 ]
    }
  };
  const CH_BADGES = {
    blue: {
      1: {
        label: "◆ #1 BLUE GEM",
        color: "#1f8fff"
      },
      t1: {
        label: "◆ T1 Blue Gem",
        color: "#2f7bff"
      },
      t2: {
        label: "◆ T2 Blue Gem",
        color: "#4a8fe0"
      },
      t3: {
        label: "◆ T3 Blue",
        color: "#6aa6d8"
      }
    },
    gold: {
      1: {
        label: "◆ #1 GOLD GEM",
        color: "#e4ae39"
      },
      t1: {
        label: "◆ G1 Gold",
        color: "#e4ae39"
      },
      t2: {
        label: "◆ G2 Gold",
        color: "#d8b35c"
      },
      t3: {
        label: "◆ G3 Gold",
        color: "#c9b078"
      }
    }
  };
  function chWeaponKey(name) {
    const n = String(name || "").toLowerCase();
    for (const [key, re] of CH_WEAPON_RULES) if (re.test(n)) return key;
    return null;
  }
  function lookupTier(table, seed) {
    if (!table) return null;
    for (const tier of [ 1, "t1", "t2", "t3" ]) {
      if ((table[tier] || []).includes(seed)) return tier;
    }
    return null;
  }
  function gemFor(name, seed) {
    const s = toInt(seed);
    if (s == null || !/case\s*hardened/i.test(name || "")) return null;
    const key = chWeaponKey(name);
    if (!key) return null;
    let kind = "blue", tier = lookupTier(CH_BLUE[key], s);
    if (tier == null) {
      kind = "gold";
      tier = lookupTier(CH_GOLD[key], s);
    }
    if (tier == null) return null;
    const b = CH_BADGES[kind][tier];
    return {
      ...b,
      gem: tier === 1,
      title: `Case Hardened seed #${s} — ${b.label.replace("◆ ", "")} (community pattern lists)`
    };
  }
  function badgeFor(item) {
    if (!item) return null;
    const name = item.name || "";
    const seed = item.seed != null ? item.seed : item.pattern;
    let skinIndex = [ item.skin_index, item.skinIndex, item.finish_catalog, item.paint_index, item.paintIndex, item.finish_id, item.phase, item.skin_phase ].find(v => v != null);
    if (skinIndex == null && isDopplerName(name)) {
      const id = defId(item);
      if (id != null && idMap[String(id)] != null) skinIndex = idMap[String(id)];
    }
    return phaseFor(name, skinIndex) || gemFor(name, seed);
  }
  const api = {
    badgeFor,
    phaseFor,
    gemFor,
    loadIdMap,
    learn,
    defId
  };
  root.CSRPGems = api;
  const CSRP = root.CSRP = root.CSRP || {};
  CSRP.gems = api;
})(typeof window !== "undefined" ? window : this);
