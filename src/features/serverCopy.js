/* CSR+ — auto-copy the server connect string as soon as it is revealed.
 * The match page shows a monospace connect command (initially "Hidden");
 * when it resolves to a real value we copy it to the clipboard once and toast. */
(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});
  let lastCopied = '';

  // Find the connect string element: a font-mono <p> inside the connect box.
  function findConnectText() {
    for (const p of document.querySelectorAll('p.font-mono')) {
      const t = p.textContent.trim();
      if (t) return { el: p, text: t };
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

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback for clipboard permission edge cases.
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch { return false; }
    }
  }

  function tick() {
    if (!CSRP.store.get('autoCopyServer')) return;
    const found = findConnectText();
    if (!found) { return; }
    const text = found.text;
    if (!looksReady(text)) return;
    if (text === lastCopied) return;
    lastCopied = text;
    copy(text).then((ok) => {
      if (ok) {
        CSRP.sound?.play('on');
        toast('Server copied to clipboard');
        CSRP.log('server copied:', text);
      }
    });
  }

  CSRP.serverCopy = { tick };
})();
