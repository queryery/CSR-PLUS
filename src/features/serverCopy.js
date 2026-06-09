/* CSR+ — auto-copy the server connect string as soon as it is revealed.
 * The match page shows a monospace connect command (initially "Hidden");
 * when it resolves to a real value we copy it to the clipboard once and toast. */
(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});
  let lastCopied = '';

  const IP_RE = /(\d{1,3}(?:\.\d{1,3}){3}:\d+)/;

  // Find the connect address. The visible font-mono text often shows "Hidden",
  // but the "Connect using Steam" link carries the real ip:port even then — so
  // we read that href first and build a clean `connect ip:port` string from it.
  function findConnect() {
    // 1) steam://connect/<ip:port> link (most reliable; present while "Hidden").
    const steam = document.querySelector('a[href^="steam://connect/"]');
    if (steam) {
      const m = steam.getAttribute('href').match(IP_RE);
      if (m) {
        const monoEl = document.querySelector('p.font-mono, .font-mono') || steam;
        return { el: monoEl, text: `connect ${m[1]}` };
      }
    }
    // 2) a font-mono element already showing the address.
    for (const p of document.querySelectorAll('p.font-mono, .font-mono')) {
      const t = p.textContent.trim();
      if (looksReady(t)) {
        const m = t.match(IP_RE);
        return { el: p, text: m ? `connect ${m[1]}` : t };
      }
    }
    return null;
  }

  function looksReady(text) {
    if (!text) return false;
    const t = text.toLowerCase();
    if (t === 'hidden' || t === 'loading' || t.includes('…')) return false;
    // A connect command or ip:port looks like one of these.
    return /connect\s+\d{1,3}(\.\d{1,3}){3}:\d+/i.test(text) ||
           /\d{1,3}(\.\d{1,3}){3}:\d+/.test(text) ||
           /steam:\/\/connect\//i.test(text);
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'csrp-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('csrp-toast-show'));
    setTimeout(() => { t.classList.remove('csrp-toast-show'); setTimeout(() => t.remove(), 400); }, 2600);
  }

  // execCommand path works without async-clipboard permission, as long as the
  // document is focused. Try the modern API first, then fall back.
  async function copy(text) {
    try {
      if (navigator.clipboard && document.hasFocus()) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch { /* fall through to execCommand */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  }

  async function copyAndToast(text) {
    const ok = await copy(text);
    CSRP.sound?.play(ok ? 'on' : 'cancel');
    toast(ok ? '✓ Server copied — paste in console' : 'Press Ctrl+C to copy');
    return ok;
  }

  // Make the connect string + the connect box clickable to copy (real gesture →
  // clipboard always works). Marks elements so we only bind once.
  function armClickToCopy(el, text) {
    if (el.dataset.csrpCopy === '1') return;
    el.dataset.csrpCopy = '1';
    el.style.cursor = 'pointer';
    el.title = 'Click to copy: ' + text;
    el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); copyAndToast(text); }, true);
  }

  function tick() {
    if (!CSRP.store.get('autoCopyServer')) return;
    const found = findConnect();
    if (!found) return;
    const text = found.text;

    // Always arm click-to-copy on the address (reliable manual path).
    armClickToCopy(found.el, text);
    // Also arm the connect box wrapper so clicking anywhere on it copies.
    const box = found.el.closest('.border')?.parentElement;
    if (box) armClickToCopy(box, text);

    if (text === lastCopied) return;
    lastCopied = text;
    copy(text).then((ok) => {
      if (ok) {
        CSRP.sound?.play('on');
        toast('✓ Server copied — paste in console');
        CSRP.log('server copied:', text);
      } else {
        toast('Click the server address to copy');
        CSRP.log('server auto-copy blocked; click-to-copy armed');
      }
    });
  }

  CSRP.serverCopy = { tick };
})();
