/* =========================================================
 * Navigation (GNB ↔ LNB 매핑 + 상태)
 *
 * 책임:
 *  - GNB 카테고리 렌더링
 *  - 카테고리 선택 시 LNB(2/3depth) 재렌더링
 *  - 3Depth 항목 선택 시 Tab 시스템에 위임
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  const State = {
    currentCategoryId: 'home',
    currentItemId: 'dashboard',
  };

  function $(sel, root = document) { return root.querySelector(sel); }

  function renderGNB() {
    const ul = $('#gnb-categories');
    ul.innerHTML = NAV_DATA.map(cat => `
      <li>
        <button type="button" class="gnb__cat" data-cat-id="${cat.id}">${cat.label}</button>
      </li>
    `).join('');

    ul.addEventListener('click', (e) => {
      const btn = e.target.closest('.gnb__cat');
      if (!btn) return;
      selectCategory(btn.dataset.catId);
    });

    renderMobileCats();
  }

  /** 모바일(≤1280px) 드로어 상단 카테고리 전환 바 */
  function renderMobileCats() {
    const wrap = $('#lnb-mobile-cats');
    if (!wrap) return;
    wrap.innerHTML = NAV_DATA.map(cat => `
      <button type="button" class="lnb__mobile-cat" data-cat-id="${cat.id}">${cat.label}</button>
    `).join('');

    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.lnb__mobile-cat');
      if (!btn) return;
      // 카테고리만 전환 — 드로어는 열어둔 채 하위 메뉴를 다시 보여줌
      selectCategory(btn.dataset.catId, { skipAutoSelect: true });
    });
  }

  /** GNB 데스크톱 탭 + 모바일 카테고리 칩 active 동기화 */
  function markActiveCats(catId) {
    document.querySelectorAll('.gnb__cat, .lnb__mobile-cat').forEach(el => {
      el.classList.toggle('is-active', el.dataset.catId === catId);
    });
  }

  function renderLNB(catId) {
    const cat = NAV_DATA.find(c => c.id === catId);
    if (!cat) return;
    $('#lnb-cat-title').textContent = cat.label;

    const body = $('#lnb-body');
    body.innerHTML = cat.groups.map((g, gi) => `
      <div class="lnb-group${gi === 0 ? ' is-open' : ''}" data-group-index="${gi}" title="${g.label}">
        <button type="button" class="lnb-group__toggle" aria-label="${g.label}">
          <span class="lnb-group__label">
            <span class="lnb-group__icon">${Icons[g.icon] || ''}</span>
            <span>${g.label}</span>
          </span>
          ${Icons.chev}
        </button>
        <div class="lnb-group__items" data-flyout-title="${g.label}">
          ${g.items.filter(it => !it.hidden).map(it => `
            <button type="button" class="lnb-item" data-item-id="${it.id}" data-page="${it.page}" data-label="${it.label}">${it.label}</button>
          `).join('')}
        </div>
      </div>
    `).join('');

    // 아코디언
    body.querySelectorAll('.lnb-group__toggle').forEach(btn => {
      btn.addEventListener('click', () => btn.closest('.lnb-group').classList.toggle('is-open'));
    });

    // 3Depth 클릭
    body.querySelectorAll('.lnb-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const { itemId, page, label } = btn.dataset;
        selectItem(itemId, label, page);
      });
    });
  }

  function selectCategory(catId, opts = {}) {
    State.currentCategoryId = catId;
    markActiveCats(catId);
    renderLNB(catId);

    // [요구사항] LNB 첫번째 2Depth & 3Depth 자동 Active
    if (!opts.skipAutoSelect) {
      const cat = NAV_DATA.find(c => c.id === catId);
      const first = cat?.groups?.[0]?.items?.[0];
      if (first) selectItem(first.id, first.label, first.page);
    }
  }

  function selectItem(itemId, label, page) {
    State.currentItemId = itemId;
    // LNB Active item
    document.querySelectorAll('.lnb-item').forEach(el => {
      el.classList.toggle('is-active', el.dataset.itemId === itemId);
    });
    // 활성 item 의 부모 그룹에 is-active-group (collapsed 레일 강조용)
    document.querySelectorAll('.lnb-group').forEach(g => g.classList.remove('is-active-group'));
    const activeItem = document.querySelector(`.lnb-item.is-active`);
    activeItem?.closest('.lnb-group')?.classList.add('is-active-group');
    // Tab Bar 위임
    App.Tabs.open({ id: itemId, label, page });
    // 모바일 드로어가 열려 있으면 항목 선택 후 닫기
    App.toggleMobileDrawer && App.toggleMobileDrawer(false);
  }

  /** 외부에서 페이지 직접 이동(예: 탭 클릭) 시 LNB/GNB 동기화 */
  function syncTo(itemId) {
    for (const cat of NAV_DATA) {
      for (const g of cat.groups) {
        const found = g.items.find(it => it.id === itemId);
        if (found) {
          State.currentCategoryId = cat.id;
          State.currentItemId = itemId;
          markActiveCats(cat.id);
          // 카테고리가 다르면 LNB 다시 렌더
          if ($('#lnb-cat-title').textContent !== cat.label) renderLNB(cat.id);
          // 해당 group 펼치기
          document.querySelectorAll('.lnb-group').forEach((el, idx) => {
            const grp = cat.groups[idx];
            const hasItem = grp.items.some(it => it.id === itemId);
            el.classList.toggle('is-open', hasItem || idx === 0);
          });
          document.querySelectorAll('.lnb-item').forEach(el => {
            el.classList.toggle('is-active', el.dataset.itemId === itemId);
          });
          document.querySelectorAll('.lnb-group').forEach(gel => gel.classList.remove('is-active-group'));
          document.querySelector('.lnb-item.is-active')?.closest('.lnb-group')?.classList.add('is-active-group');
          return;
        }
      }
    }
  }

  App.Nav = {
    init() {
      renderGNB();
      selectCategory(State.currentCategoryId);
    },
    selectCategory,
    selectItem,
    syncTo,
    getState: () => ({ ...State }),
  };
})();
