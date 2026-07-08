/* =========================================================
 * Notify — Toast / Sweet Alert (공용)
 *
 * 본 모듈은 index.html / ui-kit.html / 외부 standalone 페이지
 * (contract-sign.html, contract-confirm.html) 모두에서 동일하게 동작한다.
 *
 *  - window.toast(text, kind?, timeout?)
 *      kind: 'info' | 'success' | 'warning' | 'danger'   (기본 'info')
 *  - window.sweet({ icon, title, text, confirmText, cancelText, onConfirm })
 *      icon: 'info'|'success'|'danger'|'warning'|'confirm'
 *
 * DOM 호스트(#toast-host, #sweet-modal)는 자동 생성한다.
 * CSS 는 ui-kit.css 의 .toast / .sweet-* 클래스를 그대로 사용.
 * ========================================================= */
(function () {
  function ensureHost(id, html) {
    let el = document.getElementById(id);
    if (el) return el;
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    el = wrap.firstElementChild;
    document.body.appendChild(el);
    return el;
  }

  function init() {
    const toastHost = ensureHost('toast-host', '<div class="toast-host" id="toast-host"></div>');
    ensureHost('sweet-modal',
      `<div class="modal-backdrop" id="sweet-modal">
         <div class="modal" style="max-width:400px">
           <div class="modal__body" id="sweet-body"></div>
           <div class="modal__footer" id="sweet-footer"></div>
         </div>
       </div>`);

    /* ============ Toast ============ */
    function toast(text, kind = 'info', timeout = 3000) {
      const t = document.createElement('div');
      t.className = 'toast toast--' + kind;
      t.innerHTML = `<span></span><button class="toast__close" type="button" aria-label="닫기">✕</button>`;
      t.querySelector('span').textContent = text;
      toastHost.appendChild(t);
      function dismiss() {
        t.classList.add('is-out');
        t.addEventListener('animationend', () => t.remove(), { once: true });
        // animation 미적용 환경 대비 fallback
        setTimeout(() => t.remove(), 600);
      }
      t.querySelector('.toast__close').addEventListener('click', dismiss);
      if (timeout) setTimeout(dismiss, timeout);
      return { dismiss };
    }
    window.toast = toast;

    /* ============ Sweet Alert ============ */
    const SW_ICONS = {
      success:  { cls: 'sweet-icon--success',  glyph: '✓' },
      danger:   { cls: 'sweet-icon--danger',   glyph: '✕' },
      warning:  { cls: 'sweet-icon--warning',  glyph: '!' },
      info:     { cls: 'sweet-icon--info',     glyph: 'i' },
      confirm:  { cls: 'sweet-icon--question', glyph: '?' },
    };
    function sweet({ icon = 'info', title, text, confirmText = '확인', cancelText, onConfirm } = {}) {
      const m = document.getElementById('sweet-modal');
      const cfg = SW_ICONS[icon] || SW_ICONS.info;
      const body   = document.getElementById('sweet-body');
      const footer = document.getElementById('sweet-footer');
      body.innerHTML = `
        <div class="sweet-icon ${cfg.cls}" style="text-align:center;padding:6px 0;">${cfg.glyph}</div>
        <div class="sweet-body">
          <div class="sweet-body__title"></div>
          <div class="sweet-body__text"></div>
        </div>`;
      body.querySelector('.sweet-body__title').textContent = title || '';
      body.querySelector('.sweet-body__text').textContent  = text  || '';
      footer.innerHTML = `
        ${cancelText ? `<button class="btn" type="button" data-sweet-cancel></button>` : ''}
        <button class="btn btn--primary" type="button" data-sweet-ok></button>`;
      const okBtn     = footer.querySelector('[data-sweet-ok]');
      const cancelBtn = footer.querySelector('[data-sweet-cancel]');
      okBtn.textContent = confirmText;
      if (cancelBtn) cancelBtn.textContent = cancelText;
      okBtn.onclick = () => { close(); onConfirm && onConfirm(); };
      if (cancelBtn) cancelBtn.onclick = close;
      function close() {
        m.classList.remove('is-open');
        document.body.style.overflow = '';
      }
      m.onclick = (e) => { if (e.target === m) close(); };
      m.classList.add('is-open');
      /* 항상 최상위로 — 다른 모달(modal-ctr-view 등) layer 위에 표시되어야 confirm 가능. */
      m.style.zIndex = '1500';
      document.body.style.overflow = 'hidden';
      return { close };
    }
    window.sweet = sweet;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
