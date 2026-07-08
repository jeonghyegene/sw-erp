/* =========================================================
 * Story Tab Bar
 *
 * 책임:
 *  - 진입한 화면을 탭으로 보관/표시
 *  - 탭 클릭 시 본문 전환 + LNB/GNB 동기화
 *  - 탭 'x' 클릭 시 닫기 (홈/대시보드는 닫기 불가)
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});
  const HOME_TAB_ID = 'dashboard'; // 최초 진입 = 대시보드. 닫기 불가.

  const tabs = []; // [{ id, label, page }]
  let activeId = null;

  function $(s, r = document) { return r.querySelector(s); }

  function render() {
    const bar = $('#tabbar');
    bar.innerHTML = tabs.map(t => `
      <div class="tab${t.id === activeId ? ' is-active' : ''}${t.id === HOME_TAB_ID ? ' is-home' : ''}"
           data-id="${t.id}" data-page="${t.page}" data-label="${t.label}">
        <span>${t.label}</span>
        <button type="button" class="tab__close" aria-label="탭 닫기">${Icons.close}</button>
      </div>
    `).join('');
  }

  function showPage(t) {
    document.querySelectorAll('.page').forEach(el => el.classList.remove('is-active'));
    const el = document.getElementById(t.page);
    if (el) {
      el.classList.add('is-active');
      if (typeof el.__onShow === 'function') el.__onShow(t);
    }
  }

  function activate(id) {
    const t = tabs.find(x => x.id === id);
    if (!t) return;
    activeId = id;
    render();
    showPage(t);
    App.Nav.syncTo(id);
  }

  /** 외부 진입점: 화면 열기 */
  function open({ id, label, page }) {
    let t = tabs.find(x => x.id === id);
    if (!t) {
      t = { id, label, page };
      tabs.push(t);
    } else {
      t.label = label; t.page = page;
    }
    activate(id);
  }

  function close(id) {
    if (id === HOME_TAB_ID) return; // 홈 탭 닫기 금지
    const idx = tabs.findIndex(t => t.id === id);
    if (idx < 0) return;
    tabs.splice(idx, 1);
    if (activeId === id) {
      const next = tabs[idx] || tabs[idx - 1] || tabs[0];
      if (next) activate(next.id);
    } else {
      render();
    }
  }

  function bind() {
    const bar = $('#tabbar');
    bar.addEventListener('click', (e) => {
      const closeBtn = e.target.closest('.tab__close');
      const tabEl = e.target.closest('.tab');
      if (!tabEl) return;
      if (closeBtn) {
        e.stopPropagation();
        close(tabEl.dataset.id);
        return;
      }
      activate(tabEl.dataset.id);
    });
  }

  App.Tabs = {
    init() { bind(); render(); },
    open, close, activate,
    list: () => [...tabs],
  };
})();
