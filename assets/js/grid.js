/* =========================================================
 * Grid (페이지네이션 포함 데이터 그리드)
 *
 * 사용:
 *   const grid = App.Grid.create({
 *     mount: rootEl,            // 그리드를 그릴 컨테이너 (.grid-wrap)
 *     columns: [{ key, label, align?, format?(v,row), width? }],
 *     rows: [...],              // 전체 데이터
 *     pageSize: 20,             // 기본 20 (드롭다운으로 변경 가능)
 *   });
 *   grid.setRows(newRows); // 데이터 갱신
 *
 * 페이지네이션 규칙:
 *  - 페이지 버튼 한 묶음 = 최대 10개
 *  - 그 외엔 '처음/이전/다음/끝' 으로 이동
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});
  // SWADPIA §3.3: 기본 20건 / 옵션 20 · 50 · 100 · 200 · 500 · 1,000
  const PAGE_SIZES = [20, 50, 100, 200, 500, 1000];
  const PAGE_BLOCK = 10;


  function create(opts) {
    const state = {
      columns: opts.columns,
      rows: opts.rows || [],
      pageSize: opts.pageSize || 20,
      page: 1,
    };
    const expandFn = (typeof opts.expand === 'function') ? opts.expand : null;
    // 행 클래스 훅 — schema.rowClass(row) 가 반환한 문자열을 <tr> 에 부여 (예: 긴급 행 'is-urgent')
    const rowClassFn = (typeof opts.rowClass === 'function') ? opts.rowClass : null;

    const root = opts.mount;
    root.innerHTML = `
      <div class="grid-scroll">
        <table class="grid">
          <thead><tr></tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="pagination">
        <div class="pagination__info" data-info></div>
        <div class="pagination__right">
          <div class="pagination__size">
            <label>페이지당</label>
            <select class="select" data-size>
              ${PAGE_SIZES.map(n => `<option value="${n}"${n === state.pageSize ? ' selected' : ''}>${n}</option>`).join('')}
            </select>
            <span>건</span>
          </div>
          <div class="pagination__list" data-pages></div>
        </div>
      </div>
    `;

    const $thead = root.querySelector('thead tr');
    const $tbody = root.querySelector('tbody');
    const $pages = root.querySelector('[data-pages]');
    const $info  = root.querySelector('[data-info]');
    const $size  = root.querySelector('[data-size]');

    $size.addEventListener('change', () => {
      state.pageSize = Number($size.value);
      state.page = 1;
      render();
    });

    /* Flex 컬럼 휴리스틱 — 잉여 폭 흡수
     * 좁은 그리드(가로 스크롤 없음) 에서 schema 의 컬럼 width 합이 페이지 폭보다 작으면
     * 브라우저가 잉여 폭을 모든 컬럼에 분산해 간격이 넓어진다. 이를 막으려면 한 컬럼을 flex 로
     * 지정해 그 컬럼이 모든 잉여 폭을 흡수하도록 한다.
     * 휴리스틱: schema 의 좌측 정렬 컬럼 중 width 가 가장 큰 것 (= 보통 "제목/자재명/메모" 같은 본문 컬럼).
     * schema 에서 `flex: true` 를 명시하면 그 컬럼이 우선 flex 가 된다. */
    function _findFlexColumnIdx(columns) {
      // 명시적 flex: true 가 있으면 우선
      const explicit = columns.findIndex(c => c.flex === true);
      if (explicit >= 0) return explicit;
      // 휴리스틱 — 좌측 정렬 컬럼 중 width 가 가장 큰 것
      let idx = -1, maxW = 0;
      columns.forEach((c, i) => {
        if (c.align === 'left' || !c.align) {
          const w = parseInt(String(c.width || '').replace(/\D/g, ''), 10) || 0;
          if (w > maxW) { maxW = w; idx = i; }
        }
      });
      return idx;
    }
    const _flexIdx = _findFlexColumnIdx(state.columns);

    function renderHead() {
      $thead.innerHTML = state.columns.map((c, i) => {
        // flex 컬럼은 inline width 생략 — 브라우저가 잉여 폭을 이 컬럼에 할당
        const widthStyle = (c.width && i !== _flexIdx) ? `style="width:${c.width}"` : '';
        return `<th class="${c.align ? 'col-' + c.align : ''}" ${widthStyle}>${c.label}</th>`;
      }).join('');
    }

    function renderBody() {
      const total = state.rows.length;
      const start = (state.page - 1) * state.pageSize;
      const end = Math.min(start + state.pageSize, total);
      const slice = state.rows.slice(start, end);

      if (!slice.length) {
        $tbody.innerHTML = `<tr><td colspan="${state.columns.length}"><div class="empty">조회된 데이터가 없습니다.</div></td></tr>`;
        return;
      }

      $tbody.innerHTML = slice.map((row, i) => {
        const extraClass = rowClassFn ? (rowClassFn(row) || '') : '';
        const main = `<tr data-row-idx="${i}"${extraClass ? ` class="${extraClass}"` : ''}>
          ${state.columns.map(c => {
            const v = row[c.key];
            const cell = c.format ? c.format(v, row) : (v == null ? '' : v);
            return `<td class="${c.align ? 'col-' + c.align : ''}">${cell}</td>`;
          }).join('')}
        </tr>`;
        const expand = expandFn
          ? `<tr class="grid__row-expand" data-expand-for="${i}" hidden><td colspan="${state.columns.length}">${expandFn(row)}</td></tr>`
          : '';
        return main + expand;
      }).join('');
    }

    // 행 확장 토글 (스키마가 expand 를 제공한 경우)
    $tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-grid-expand]');
      if (!btn) return;
      const tr = btn.closest('tr[data-row-idx]');
      if (!tr) return;
      const idx = tr.dataset.rowIdx;
      const ex = $tbody.querySelector(`tr.grid__row-expand[data-expand-for="${idx}"]`);
      if (!ex) return;
      const isOpen = !ex.hasAttribute('hidden');
      if (isOpen) { ex.setAttribute('hidden', ''); btn.classList.remove('is-open'); }
      else        { ex.removeAttribute('hidden');  btn.classList.add('is-open'); }
    });

    /* ──── Row-click → 상세 (도메인 표준)
     * 같은 행에 `data-*-detail` 트리거가 있으면, 행 영역 클릭이 그 트리거를 대신 발화시킨다.
     * → "상세 버튼 클릭" 과 "데이터 ROW 클릭" 두 입력이 동일하게 상세화면을 연다.
     *
     * 클릭이 행 안의 인터랙티브 요소(button, a, input, select, …, 액션 영역) 위면 무시 —
     * 명시적 액션이 우선이고, 이벤트 버블 후 그 핸들러가 자기 책임을 한다.
     * ──── */
    const _INTERACTIVE = 'button, a, input, select, textarea, label, [role="button"], [data-grid-expand], .combo, .multi-select, .pill';
    function _findDetailTrigger(tr) {
      // 명시적 마커가 있으면 1순위
      const explicit = tr.querySelector('[data-row-detail], [data-action="detail"]');
      if (explicit) return explicit;
      // 관용 패턴 — data-*-detail 인 버튼/링크
      const candidates = tr.querySelectorAll('button, a, [data-row-idx] *');
      for (const el of candidates) {
        for (const a of el.attributes) {
          if (/^data-[\w-]+-detail$/.test(a.name)) return el;
        }
      }
      return null;
    }
    $tbody.addEventListener('click', (e) => {
      // 인터랙티브 요소 클릭이면 무시 (그 요소의 핸들러가 처리)
      if (e.target.closest(_INTERACTIVE)) return;
      const tr = e.target.closest('tr[data-row-idx]');
      if (!tr || tr.classList.contains('grid__row-expand')) return;
      const trigger = _findDetailTrigger(tr);
      if (!trigger) return;
      // 텍스트 선택 중이면 무시 (드래그로 셀 텍스트 선택하는 사용자 의도)
      const sel = window.getSelection && window.getSelection();
      if (sel && sel.type === 'Range' && String(sel).length > 0) return;
      trigger.click();
    });

    // 상세 트리거 보유 행에 클릭 가능 시각 — render() 이후 한 번 갱신
    function _markClickableRows() {
      $tbody.querySelectorAll('tr[data-row-idx]').forEach(tr => {
        if (tr.classList.contains('grid__row-expand')) return;
        if (_findDetailTrigger(tr)) tr.classList.add('is-clickable');
      });
    }

    function renderPager() {
      const total = state.rows.length;
      const pageCount = Math.max(1, Math.ceil(total / state.pageSize));
      if (state.page > pageCount) state.page = pageCount;

      const blockStart = Math.floor((state.page - 1) / PAGE_BLOCK) * PAGE_BLOCK + 1;
      const blockEnd   = Math.min(blockStart + PAGE_BLOCK - 1, pageCount);

      const btn = (label, page, opts = {}) => `
        <button type="button" class="pagination__btn${opts.active ? ' is-active' : ''}"
          ${opts.disabled ? 'disabled' : ''} data-page="${page}">${label}</button>
      `;

      let html = '';
      html += btn('«', 1,              { disabled: state.page === 1 });
      html += btn('‹', state.page - 1, { disabled: state.page === 1 });
      for (let p = blockStart; p <= blockEnd; p++) {
        html += btn(p, p, { active: p === state.page });
      }
      html += btn('›', state.page + 1, { disabled: state.page === pageCount });
      html += btn('»', pageCount,      { disabled: state.page === pageCount });

      $pages.innerHTML = html;
      $pages.querySelectorAll('.pagination__btn').forEach(b => {
        b.addEventListener('click', () => {
          const p = Number(b.dataset.page);
          if (!p || p === state.page) return;
          state.page = p;
          render();
        });
      });

      const startN = total === 0 ? 0 : (state.page - 1) * state.pageSize + 1;
      const endN   = Math.min(state.page * state.pageSize, total);
      $info.textContent = `${startN.toLocaleString()} - ${endN.toLocaleString()} / 총 ${total.toLocaleString()}건`;
    }

    function render() { renderBody(); renderPager(); _markClickableRows(); }

    renderHead(); render();

    return {
      setRows(rows) { state.rows = rows || []; state.page = 1; render(); },
      getState: () => ({ ...state }),
      refresh: render,
    };
  }

  App.Grid = { create };
})();
