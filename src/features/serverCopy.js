
(() => {
  'use strict';
  const CSRP = (window.CSRP = window.CSRP || {});
  let lastCopied = '';

  const IP_RE = /(\d{1,3}(?:\.\d{1,3}){3}:\d+)/;


  function findConnect() {

    const steam = document.querySelector('a[href^="steam://connect/"]');
    if (steam) {
      const m = steam.getAttribute('href').match(IP_RE);
      if (m) {
        const monoEl = document.querySelector('p.font-mono, .font-mono') || steam;
        return { el: monoEl, text: `connect ${m[1]}` };
      }
    }

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
      if (navigator.clipboard && document.hasFocus()) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {  }
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


    armClickToCopy(found.el, text);

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
