/* CSR+ — auto-copy the server connect string as soon as it is revealed.
 * The match page shows a monospace connect command (initially "Hidden");
 * when it resolves to a real value we copy it to the clipboard once and toast. */
(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});
  let lastCopied = '';

  // Find the connect string element. Prefer the font-mono <p> the site uses,
  // but fall back to any small element whose text looks like a connect command.
  function findConnectText() {
    for (const p of document.querySelectorAll('p.font-mono, .font-mono')) {
      const t = p.textContent.trim();
      if (t && looksReady(t)) return { el: p, text: t };
    }
    // Fallback: scan short text nodes for an ip:port / connect command.
    for (const el of document.querySelectorAll('p, span, code, div')) {
      if (el.children.length) continue; // leaf nodes only
      const t = el.textContent.trim();
      if (t.length <= 80 && looksReady(t)) return { el, text: t };
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

  // If auto-copy was blocked (no page focus / gesture), let the user finish it
  // by clicking the connect string itself.
  function armClickToCopy(el, text) {
    if (el.dataset.csrpClickCopy === '1') return;
    el.dataset.csrpClickCopy = '1';
    el.style.cursor = 'pointer';
    el.title = 'Click to copy connect string';
    el.addEventListener('click', async () => {
      const ok = await copy(text);
      CSRP.sound?.play(ok ? 'on' : 'cancel');
      toast(ok ? 'Server copied to clipboard' : 'Press Ctrl+C to copy');
    });
  }

  function tick() {
    if (!CSRP.store.get('autoCopyServer')) return;
    const found = findConnectText();
    if (!found) return;
    const text = found.text;
    if (!looksReady(text)) return;

    // Always make the element click-to-copy as a reliable manual fallback.
    armClickToCopy(found.el, text);

    if (text === lastCopied) return;
    lastCopied = text;
    copy(text).then((ok) => {
      if (ok) {
        CSRP.sound?.play('on');
        toast('Server copied to clipboard');
        CSRP.log('server copied:', text);
      } else {
        // Auto-copy blocked (page not focused). Prompt the click fallback.
        toast('Click the server address to copy');
        CSRP.log('server auto-copy blocked; click-to-copy armed');
      }
    });
  }

  CSRP.serverCopy = { tick };
})();
