(() => {
  'use strict';
  if (window.CSRPConfirm) return;

  const S = {
    back: 'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;' +
      'justify-content:center;padding:20px;background:rgba(4,5,10,0.72);' +
      'backdrop-filter:blur(4px);opacity:0;transition:opacity .2s cubic-bezier(0.22,1,0.36,1);' +
      'font-family:-apple-system,"Segoe UI",Roboto,sans-serif;',
    box: 'width:min(400px,100%);background:#0e0f18;color:#f3f5fb;' +
      'border:1px solid rgba(255,255,255,0.14);padding:20px 20px 16px;' +
      'clip-path:polygon(0 0,100% 0,100% calc(100% - 14px),calc(100% - 14px) 100%,0 100%);' +
      'box-shadow:0 24px 60px rgba(0,0,0,0.6);transform:translateY(10px) scale(0.98);' +
      'transition:transform .24s cubic-bezier(0.22,1,0.36,1);',
    title: 'font-size:15px;font-weight:900;letter-spacing:.02em;margin-bottom:8px;',
    body: 'font-size:12.5px;line-height:1.6;color:rgba(243,245,251,0.65);margin-bottom:16px;',
    actions: 'display:flex;gap:10px;justify-content:flex-end;',
    btn: 'padding:8px 16px;font:inherit;font-size:12px;font-weight:800;cursor:pointer;border-radius:0;' +
      'clip-path:polygon(0 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%);',
    cancel: 'background:transparent;color:rgba(243,245,251,0.7);border:1px solid rgba(255,255,255,0.16);',
    ok: 'border:none;color:#04120a;background:linear-gradient(180deg,#43d17f,#2fae62);',
    okDanger: 'border:none;color:#fff;background:linear-gradient(180deg,#ff6a6a,#e23a45);',
  };

  window.CSRPConfirm = function ({ title, body, okLabel = 'Confirm', danger = false } = {}) {
    return new Promise((resolve) => {
      const back = document.createElement('div'); back.style.cssText = S.back;
      const box = document.createElement('div'); box.style.cssText = S.box;
      box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
      const t = document.createElement('div'); t.style.cssText = S.title; t.textContent = title || '';
      const b = document.createElement('div'); b.style.cssText = S.body; b.textContent = body || '';
      const acts = document.createElement('div'); acts.style.cssText = S.actions;
      const cancel = document.createElement('button'); cancel.style.cssText = S.btn + S.cancel; cancel.textContent = 'Cancel';
      const ok = document.createElement('button'); ok.style.cssText = S.btn + (danger ? S.okDanger : S.ok); ok.textContent = okLabel;
      acts.append(cancel, ok); box.append(t, b, acts); back.appendChild(box);

      const close = (v) => { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') close(false); else if (e.key === 'Enter') close(true); };
      cancel.addEventListener('click', () => close(false));
      ok.addEventListener('click', () => close(true));
      back.addEventListener('click', (e) => { if (e.target === back) close(false); });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(back);
      requestAnimationFrame(() => { back.style.opacity = '1'; box.style.transform = 'none'; });
      ok.focus();
    });
  };
})();
