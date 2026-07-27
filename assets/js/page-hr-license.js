/* =========================================================
 * Page: HR > 복리후생 > 라이선스 현황
 *   SCR-LIC-01 라이선스 현황 (목록)
 *   SCR-LIC-02 라이선스 상세 (개별 배정형 / 공용형 공용)
 *
 *  라이선스 유형
 *   · individual (개별 배정형) — 직원별 배정 수량을 관리 (구매·과금 대상)
 *   · shared     (공용형)      — 배정 수량은 관리하지 않고 이용 직원만 관리
 *
 *  내부 view 전환: STATE.view = 'list' | 'detail'
 *   렌더 함수가 pageEl 의 내부 마크업을 통째로 재구성 (page-hr-contract 패턴 준용).
 *
 *  UI Kit 재사용:
 *   .search (App.Components.searchPanel) · .toolbar · .btn(*)      — 조회·액션
 *   .grid-wrap / .grid-scroll / .tbl.tbl--hover / .pagination      — 그리드 (계약 관리 레이아웃 준용)
 *   .pill(*)                                                       — 유형·재직상태·사용여부
 *   .detail-summary (신규 등록)                                     — 상세 상단 요약 카드
 *   .modal-backdrop / .modal / .fm-tbl                             — 라이선스 등록 모달
 *   App.openEmpPicker                                              — 직원 배정 / 이용 직원 등록
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  /* ============ 헬퍼 ============ */
  function $(s, r = document) { return r.querySelector(s); }
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function dispYmd(s) {   /* 'YYYY-MM-DD' → 'YY/MM/DD' (SWADPIA §1) */
    s = String(s == null ? '' : s);
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(2, 4) + '/' + s.slice(5, 7) + '/' + s.slice(8, 10) : s;
  }
  function toast(msg, kind) {
    if (App.flashToast) App.flashToast(msg, kind);
    else if (window.toast) window.toast(msg, kind);
  }
  const TODAY = '2026-07-23';
  /* 현재 일시 표기 'YY/MM/DD   HH:MM' (SWADPIA §2 · 공백 3칸) */
  function nowStamp() {
    const t = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${String(t.getFullYear()).slice(2)}/${p(t.getMonth() + 1)}/${p(t.getDate())}   ${p(t.getHours())}:${p(t.getMinutes())}`;
  }

  /* ============ 유형 / 상태 정의 ============ */
  const TYPE = {
    individual: { label: '개별 배정형', pill: 'info' },
    shared:     { label: '공용형',      pill: 'purple' },
  };
  const WORK_STATUS = {
    active:  { label: '재직', pill: 'success' },
    leave:   { label: '휴직', pill: 'warning' },
    retired: { label: '퇴직', pill: 'muted' },
  };
  function typePill(code)   { const t = TYPE[code] || TYPE.individual; return `<span class="pill pill--${t.pill}">${esc(t.label)}</span>`; }
  function statusPill(code) { const s = WORK_STATUS[code] || WORK_STATUS.active; return `<span class="pill pill--${s.pill}">${esc(s.label)}</span>`; }

  /* 라이선스 이용 상태 — 만료일 기준 파생 (만료일 없음 = 영구 = 사용중) */
  function licState(lic) {
    return (lic.expiryDate && lic.expiryDate < TODAY) ? 'expired' : 'in-use';
  }
  function licStatePill(lic) {
    return licState(lic) === 'expired'
      ? '<span class="pill pill--danger">만료</span>'
      : '<span class="pill pill--success">사용중</span>';
  }

  /* ============ Mock 데이터 ============ */
  const NAME_POOL = [
    '홍길동', '김영희', '이수정', '박준형', '최민서', '정다은', '오세훈', '한지민',
    '윤태호', '강예린', '조현우', '임소연', '서준혁', '문가영', '배성민', '신유진',
    '권도윤', '황서연', '노지훈', '전민아', '고은비', '남재원', '류하늘', '차예준',
    '백승아', '허준서', '유채원', '심규호', '진서윤', '엄태경', '방시우', '표하은',
    '선우진', '봉지아', '피현서', '탁유나', '견우빈', '설아름', '마준영', '옥다인',
  ];
  const RANK_POOL = ['사원', '주임', '대리', '과장', '차장'];
  const POSITION_POOL = ['팀원', '파트원', '파트장'];

  /** count 명의 배정/이용 직원을 생성. unused 명은 사용여부=미사용, leaveN 명은 휴직. */
  function genMembers(seed, count, unused, leaveN) {
    const members = [];
    for (let i = 0; i < count; i++) {
      const name = NAME_POOL[(seed + i) % NAME_POOL.length];
      const rank = RANK_POOL[(seed + i) % RANK_POOL.length];
      const position = POSITION_POOL[(seed + i * 2) % POSITION_POOL.length];
      const used = i >= unused;                       // 앞쪽 unused 명이 미사용
      const status = i < leaveN ? 'leave' : 'active'; // 앞쪽 leaveN 명이 휴직
      /* 배정일 — 데모용으로 최근일부터 과거로 분산 */
      const base = new Date('2026-07-01');
      base.setDate(base.getDate() - i * 5);
      const y = base.getFullYear();
      const m = String(base.getMonth() + 1).padStart(2, '0');
      const d = String(base.getDate()).padStart(2, '0');
      members.push({
        empId: `LIC${String(seed).padStart(2, '0')}-${String(i + 1).padStart(3, '0')}`,
        name, dept: '디자인팀', position, rank,
        photoUrl: '',
        status,
        assignedDate: `${y}-${m}-${d}`,
        used,
      });
    }
    return members;
  }

  let _store = null;
  function seed() {
    return [
      { id: 'LIC-0001', name: 'Adobe CC',        type: 'individual', assigned: 76, enabled: true,  contractDate: '2025-08-01', expiryDate: '2026-07-31', history: [], members: genMembers(1, 76, 8, 3) },
      { id: 'LIC-0002', name: 'Figma',           type: 'individual', assigned: 25, enabled: true,  contractDate: '2024-03-01', expiryDate: '2026-02-28', history: [], members: genMembers(2, 25, 3, 1) },
      { id: 'LIC-0003', name: '공용 이미지 사이트', type: 'shared',     assigned: null, enabled: true, contractDate: '2025-06-01', expiryDate: null, history: [], members: genMembers(3, 35, 5, 2) },
    ];
  }
  function list() {
    if (!_store) _store = seed();
    return _store;
  }
  function byId(id) { return list().find(l => l.id === id) || null; }

  /* 배정 수량 — 개별형은 직접 입력·수정하는 구매/과금 수량(직원 수와 독립), 공용형은 관리하지 않음(null) */
  function assignedCount(lic) { return lic.type === 'shared' ? null : (lic.assigned != null ? lic.assigned : 0); }
  function usingCount(lic)    { return lic.members.length; }
  function unusedCount(lic)   { return lic.members.filter(m => !m.used).length; }

  /* ============ STATE ============ */
  const STATE = {
    view: 'list',          // 'list' | 'detail'
    detailId: null,
    /* 목록 뷰 */
    listFilter: null,
    listPage: 1,
    listPageSize: 20,
    /* 상세 뷰 */
    detailFilter: null,
    detailPage: 1,
    detailPageSize: 20,
    detailSelected: new Set(),
  };

  /* ============ 아바타 (사진 or 이니셜) — 계약 관리 목록 패턴 준용 ============ */
  function avatarHTML(m) {
    if (m.photoUrl) {
      return `<img src="${esc(m.photoUrl)}" alt="" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;" />`;
    }
    return `<span style="width:24px;height:24px;border-radius:50%;background:var(--color-active);color:var(--color-brand-primary);display:inline-flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;">${esc((m.name || '?').charAt(0))}</span>`;
  }
  /** 성명 셀 — 임직원 관리 패턴(사진 + 이름 + 부서·직책·직위) */
  function nameCellHTML(m) {
    const meta = [m.dept, m.position, m.rank].filter(Boolean)
      .map(v => `<span style="color:var(--color-text-muted);font-size:var(--fs-xs);white-space:nowrap;">${esc(v)}</span>`)
      .join(`<span style="color:var(--color-text-muted);font-size:var(--fs-xs);">·</span>`);
    return `<div style="display:flex;align-items:center;gap:6px;min-width:0;">
      ${avatarHTML(m)}
      <span style="font-weight:var(--fw-medium);white-space:nowrap;">${esc(m.name)}</span>
      <span style="display:inline-flex;align-items:center;min-width:0;">${meta}</span>
    </div>`;
  }

  /* =========================================================
   *  VIEW: LIST (SCR-LIC-01)
   * ========================================================= */
  function applyListFilter() {
    const p = STATE.listFilter || {};
    const kw = (p.keyword || '').trim().toLowerCase();
    const typeSel = (p.advanced && p.advanced.type) || '';
    return list().filter(l => {
      if (typeSel && l.type !== typeSel) return false;
      if (kw) {
        if (!String(l.name).toLowerCase().includes(kw)) return false;
      }
      return true;
    });
  }

  function renderListView(pageEl) {
    STATE.view = 'list';
    const C = App.Components;
    const searchHTML = C.searchPanel({
      showDateRange: false,
      conditions: [
        { value: 'name', label: '라이선스명' },
      ],
      placeholder: '라이선스명으로 검색',
      cols: 1,
      advanced: [
        { name: 'type', label: '유형', options: [
          { value: 'individual', label: '개별 배정형' },
          { value: 'shared',     label: '공용형' },
        ]},
      ],
    });

    pageEl.innerHTML = `
      ${searchHTML}

      <div class="toolbar">
        <div class="toolbar__left">
          <span class="toolbar__count">총 <span data-lic-count><strong>0</strong>건</span></span>
        </div>
        <div class="toolbar__right">
          <button class="btn btn--sm btn--primary" type="button" data-lic-create>${(window.Icons && window.Icons.plus) || ''} 라이선스 등록</button>
        </div>
      </div>

      <div class="grid-wrap" style="flex:1;min-height:0;">
        <div class="grid-scroll">
          <table class="tbl tbl--hover" style="min-width:1020px;">
            <thead>
              <tr>
                <th style="width:52px;text-align:center;">No</th>
                <th>라이선스</th>
                <th style="width:104px;text-align:center;">유형</th>
                <th style="width:82px;text-align:center;">상태</th>
                <th style="width:96px;text-align:center;">계약일</th>
                <th style="width:96px;text-align:center;">만료일</th>
                <th style="width:88px;text-align:right;">배정 수량</th>
                <th style="width:88px;text-align:right;">이용 인원</th>
                <th style="width:76px;text-align:right;">미사용</th>
                <th style="width:96px;text-align:center;">활성화</th>
                <th style="width:150px;text-align:center;">관리</th>
              </tr>
            </thead>
            <tbody id="lic-list-body"></tbody>
          </table>
        </div>
        <div class="pagination">
          <div class="pagination__info" id="lic-page-info"></div>
          <div class="pagination__right">
            <div class="pagination__size">
              <label>페이지당</label>
              <select class="select" id="lic-page-size">
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
              <span>건</span>
            </div>
            <div class="pagination__list" id="lic-pagination"></div>
          </div>
        </div>
      </div>
    `;
    bindListView(pageEl);
    applyListFilterAndRender();
  }

  function bindListView(pageEl) {
    App.Search.attach(pageEl.querySelector('[data-search]'), (params) => {
      STATE.listFilter = params;
      STATE.listPage = 1;
      applyListFilterAndRender();
    }, { defaultQuick: null });

    $('#lic-pagination', pageEl).addEventListener('click', (e) => {
      const btn = e.target.closest('.pagination__btn');
      if (!btn || btn.disabled) return;
      const p = Number(btn.dataset.page);
      if (Number.isFinite(p)) { STATE.listPage = p; renderListTable(); }
    });
    $('#lic-page-size', pageEl).addEventListener('change', (e) => {
      STATE.listPageSize = Number(e.target.value);
      STATE.listPage = 1;
      renderListTable();
    });

    /* 활성화 / 비활성화 토글 */
    $('#lic-list-body', pageEl).addEventListener('change', (e) => {
      const tg = e.target.closest('[data-lic-enable-toggle]');
      if (!tg) return;
      const lic = byId(tg.dataset.licEnableToggle);
      if (!lic) return;
      lic.enabled = tg.checked;
      toast(`${lic.name} · ${lic.enabled ? '활성화' : '비활성화'}`, 'info');
    });
  }

  let _listFiltered = [];
  function applyListFilterAndRender() {
    _listFiltered = applyListFilter();
    if (STATE.listPage > Math.ceil(_listFiltered.length / STATE.listPageSize)) STATE.listPage = 1;
    renderListTable();
  }

  function renderListTable() {
    const total = _listFiltered.length;
    const size = STATE.listPageSize;
    const start = (STATE.listPage - 1) * size;
    const rows = _listFiltered.slice(start, start + size);

    const body = $('#lic-list-body'); if (!body) return;
    body.innerHTML = !rows.length
      ? `<tr><td colspan="11" style="text-align:center;color:var(--color-text-muted);padding:32px 0;">조건에 해당하는 라이선스가 없습니다.</td></tr>`
      : rows.map((l, i) => {
          const assigned = assignedCount(l);
          const no = total - (start + i);          // No — 내림차순 (N → 1, 최신이 위)
          return `
            <tr class="is-clickable" data-lic-row="${esc(l.id)}">
              <td style="text-align:center;color:var(--color-text-muted);">${no}</td>
              <td><span style="font-weight:var(--fw-semibold);color:var(--color-brand-primary);">${esc(l.name)}</span></td>
              <td style="text-align:center;">${typePill(l.type)}</td>
              <td style="text-align:center;">${licStatePill(l)}</td>
              <td style="text-align:center;">${esc(dispYmd(l.contractDate))}</td>
              <td style="text-align:center;">${l.expiryDate ? esc(dispYmd(l.expiryDate)) : '<span style="color:var(--color-text-muted);">없음</span>'}</td>
              <td style="text-align:right;">${assigned == null ? '-' : assigned.toLocaleString()}</td>
              <td style="text-align:right;">${usingCount(l).toLocaleString()}</td>
              <td style="text-align:right;">${unusedCount(l).toLocaleString()}</td>
              <td style="text-align:center;">
                <label class="switch switch--success" title="활성화 / 비활성화">
                  <input type="checkbox" data-lic-enable-toggle="${esc(l.id)}" ${l.enabled === false ? '' : 'checked'} />
                  <span class="switch__box"></span>
                </label>
              </td>
              <td style="text-align:center;white-space:nowrap;">
                <button class="btn btn--sm btn--soft-primary" type="button" data-lic-detail="${esc(l.id)}">상세보기</button>
                <button class="btn btn--sm btn--soft-danger" type="button" data-lic-del="${esc(l.id)}">삭제</button>
              </td>
            </tr>`;
        }).join('');

    const pageEl = document.getElementById('page-hr-license');
    const cnt = pageEl && pageEl.querySelector('[data-lic-count]');
    if (cnt) cnt.innerHTML = `<strong>${total.toLocaleString()}</strong>건`;

    renderPagination('#lic-page-info', '#lic-pagination', total, STATE.listPage, size);
    const sel = $('#lic-page-size'); if (sel) sel.value = String(size);
  }

  /* =========================================================
   *  VIEW: DETAIL (SCR-LIC-02) — 개별 배정형 / 공용형 공용
   * ========================================================= */
  function openDetailView(id) {
    const lic = byId(id);
    if (!lic) return;
    STATE.detailId = id;
    STATE.detailFilter = null;
    STATE.detailPage = 1;
    STATE.detailSelected = new Set();
    renderDetailView(document.getElementById('page-hr-license'), lic);
  }

  function applyDetailFilter(lic) {
    const p = STATE.detailFilter || {};
    const cond = p.condition || 'name';
    const kw = (p.keyword || '').trim().toLowerCase();
    const deptSel = (p.advanced && p.advanced.dept) || '';
    const statusSel = (p.advanced && p.advanced.status) || '';
    const usedSel = (p.advanced && p.advanced.used) || '';
    return lic.members.filter(m => {
      if (deptSel && m.dept !== deptSel) return false;
      if (statusSel && m.status !== statusSel) return false;
      if (usedSel && String(m.used) !== usedSel) return false;
      if (kw) {
        const t = cond === 'id' ? m.empId : m.name;
        if (!String(t).toLowerCase().includes(kw)) return false;
      }
      return true;
    });
  }

  function renderDetailView(pageEl, lic) {
    STATE.view = 'detail';
    const C = App.Components;
    const isShared = lic.type === 'shared';
    const assigned = assignedCount(lic);
    const depts = Array.from(new Set(lic.members.map(m => m.dept)));

    const searchHTML = C.searchPanel({
      showDateRange: false,
      conditions: [
        { value: 'name', label: '성명' },
        { value: 'id',   label: '사번' },
      ],
      placeholder: '성명 · 사번으로 검색',
      cols: 3,
      advanced: [
        { name: 'dept',   label: '소속',     options: depts.map(d => ({ value: d, label: d })) },
        { name: 'status', label: '재직상태', options: [
          { value: 'active',  label: '재직' },
          { value: 'leave',   label: '휴직' },
          { value: 'retired', label: '퇴직' },
        ]},
        { name: 'used', label: '사용 여부', options: [
          { value: 'true',  label: '사용' },
          { value: 'false', label: '미사용' },
        ]},
      ],
    });

    const addLabel = isShared ? '이용 직원 등록' : '직원 배정';

    pageEl.innerHTML = `
      <div class="toolbar">
        <div class="toolbar__left">
          <button class="btn btn--sm btn--ghost" type="button" data-lic-back>← 목록</button>
        </div>
      </div>

      <div class="detail-summary" style="margin:4px 20px 16px;">
        <div class="detail-summary__id">
          <div class="detail-summary__title">${esc(lic.name)} ${typePill(lic.type)} ${licStatePill(lic)}</div>
          <div class="detail-summary__sub">계약일 ${esc(dispYmd(lic.contractDate))} <span style="color:var(--color-divider);">|</span> 만료일 ${lic.expiryDate ? esc(dispYmd(lic.expiryDate)) : '없음'}</div>
        </div>
        <div class="detail-summary__metrics">
          <div class="detail-summary__metric detail-summary__metric--accent">
            <span class="detail-summary__metric-label">배정 수량</span>
            <span class="detail-summary__metric-value" data-metric-assigned>${assigned == null ? '-' : assigned.toLocaleString()}</span>
          </div>
          <div class="detail-summary__metric">
            <span class="detail-summary__metric-label">이용 인원</span>
            <span class="detail-summary__metric-value" data-metric-using>${usingCount(lic).toLocaleString()}</span>
          </div>
          <div class="detail-summary__metric detail-summary__metric--warn">
            <span class="detail-summary__metric-label">미사용</span>
            <span class="detail-summary__metric-value" data-metric-unused>${unusedCount(lic).toLocaleString()}</span>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn btn--sm btn--ghost" type="button" data-lic-history>변경 이력${lic.history && lic.history.length ? ` (${lic.history.length})` : ''}</button>
          <button class="btn btn--sm btn--soft" type="button" data-lic-edit>${(window.Icons && window.Icons.edit) || ''} 편집</button>
        </div>
      </div>

      ${searchHTML}

      <div class="toolbar">
        <div class="toolbar__left">
          <span class="toolbar__count">총 <span data-lic-mem-count><strong>0</strong>명</span></span>
          <span style="color:var(--color-text-muted);font-size:var(--fs-sm);" data-lic-sel-count></span>
        </div>
        <div class="toolbar__right">
          <button class="btn btn--sm btn--soft-success" type="button" data-lic-bulk-use disabled>선택 사용</button>
          <button class="btn btn--sm btn--soft" type="button" data-lic-bulk-unuse disabled>선택 미사용</button>
          <button class="btn btn--sm btn--soft-danger" type="button" data-lic-bulk-del disabled>선택 삭제</button>
          <button class="btn btn--sm btn--primary" type="button" data-lic-add>${(window.Icons && window.Icons.plus) || ''} ${addLabel}</button>
        </div>
      </div>

      <div class="grid-wrap" style="flex:1;min-height:0;">
        <div class="grid-scroll">
          <table class="tbl tbl--hover">
            <thead>
              <tr>
                <th style="width:40px;text-align:center;"><input type="checkbox" data-lic-check-all aria-label="전체 선택" /></th>
                <th>성명</th>
                <th style="width:110px;text-align:center;">재직상태</th>
                <th style="width:120px;text-align:center;">배정일</th>
                <th style="width:110px;text-align:center;">사용 여부</th>
                <th style="width:90px;text-align:center;">삭제</th>
              </tr>
            </thead>
            <tbody id="lic-mem-body"></tbody>
          </table>
        </div>
        <div class="pagination">
          <div class="pagination__info" id="lic-mem-page-info"></div>
          <div class="pagination__right">
            <div class="pagination__size">
              <label>페이지당</label>
              <select class="select" id="lic-mem-page-size">
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
              <span>건</span>
            </div>
            <div class="pagination__list" id="lic-mem-pagination"></div>
          </div>
        </div>
      </div>
    `;
    bindDetailView(pageEl, lic);
    applyDetailFilterAndRender(lic);
  }

  let _detailFiltered = [];
  function applyDetailFilterAndRender(lic) {
    _detailFiltered = applyDetailFilter(lic);
    if (STATE.detailPage > Math.ceil(_detailFiltered.length / STATE.detailPageSize)) STATE.detailPage = 1;
    renderDetailTable(lic);
    refreshDetailMetrics(lic);
  }

  function refreshDetailMetrics(lic) {
    const pageEl = document.getElementById('page-hr-license');
    if (!pageEl) return;
    const a = pageEl.querySelector('[data-metric-assigned]');
    const u = pageEl.querySelector('[data-metric-using]');
    const n = pageEl.querySelector('[data-metric-unused]');
    const assigned = assignedCount(lic);
    if (a) a.textContent = assigned == null ? '-' : assigned.toLocaleString();
    if (u) u.textContent = usingCount(lic).toLocaleString();
    if (n) n.textContent = unusedCount(lic).toLocaleString();
  }

  function renderDetailTable(lic) {
    const total = _detailFiltered.length;
    const size = STATE.detailPageSize;
    const start = (STATE.detailPage - 1) * size;
    const rows = _detailFiltered.slice(start, start + size);

    const body = $('#lic-mem-body'); if (!body) return;
    body.innerHTML = !rows.length
      ? `<tr><td colspan="6" style="text-align:center;color:var(--color-text-muted);padding:32px 0;">조건에 해당하는 직원이 없습니다.</td></tr>`
      : rows.map(m => {
          const sel = STATE.detailSelected.has(m.empId);
          return `
            <tr data-lic-mem-row="${esc(m.empId)}" class="${sel ? 'is-selected' : ''}">
              <td style="text-align:center;"><input type="checkbox" ${sel ? 'checked' : ''} /></td>
              <td>${nameCellHTML(m)}</td>
              <td style="text-align:center;">${statusPill(m.status)}</td>
              <td style="text-align:center;">${esc(dispYmd(m.assignedDate))}</td>
              <td style="text-align:center;">
                <label class="switch switch--success" title="사용 여부 전환">
                  <input type="checkbox" data-lic-used-toggle="${esc(m.empId)}" ${m.used ? 'checked' : ''} />
                  <span class="switch__box"></span>
                  <span style="font-size:var(--fs-xs);color:var(--color-text-sub);min-width:30px;text-align:left;">${m.used ? '사용' : '미사용'}</span>
                </label>
              </td>
              <td style="text-align:center;"><button class="btn btn--sm btn--soft-danger" type="button" data-lic-mem-del="${esc(m.empId)}">삭제</button></td>
            </tr>`;
        }).join('');

    const pageEl = document.getElementById('page-hr-license');
    const cnt = pageEl && pageEl.querySelector('[data-lic-mem-count]');
    if (cnt) cnt.innerHTML = `<strong>${total.toLocaleString()}</strong>명`;

    renderPagination('#lic-mem-page-info', '#lic-mem-pagination', total, STATE.detailPage, size, '명');
    const sel = $('#lic-mem-page-size'); if (sel) sel.value = String(size);
    updateBulkState();
    updateCheckAll();
  }

  function bindDetailView(pageEl, lic) {
    App.Search.attach(pageEl.querySelector('[data-search]'), (params) => {
      STATE.detailFilter = params;
      STATE.detailPage = 1;
      applyDetailFilterAndRender(lic);
    }, { defaultQuick: null });

    /* 전체 선택 */
    $('[data-lic-check-all]', pageEl).addEventListener('change', (e) => {
      const checked = e.target.checked;
      const pageRows = _detailFiltered.slice((STATE.detailPage - 1) * STATE.detailPageSize, STATE.detailPage * STATE.detailPageSize);
      pageRows.forEach(m => { if (checked) STATE.detailSelected.add(m.empId); else STATE.detailSelected.delete(m.empId); });
      renderDetailTable(lic);
    });

    /* 사용 여부 토글 + 선택 체크박스 */
    $('#lic-mem-body', pageEl).addEventListener('change', (e) => {
      const cb = e.target.closest('input[type="checkbox"]');
      if (!cb) return;
      /* 사용 여부 스위치 */
      if (cb.dataset.licUsedToggle) {
        const m = lic.members.find(x => x.empId === cb.dataset.licUsedToggle);
        if (m) {
          m.used = cb.checked;
          applyDetailFilterAndRender(lic);           // 미사용 지표 갱신 + 사용여부 필터 반영
          toast(`${m.name} · ${m.used ? '사용' : '미사용'}으로 변경`, 'info');
        }
        return;
      }
      /* 행 선택 */
      const tr = cb.closest('[data-lic-mem-row]'); if (!tr) return;
      const id = tr.dataset.licMemRow;
      if (cb.checked) STATE.detailSelected.add(id); else STATE.detailSelected.delete(id);
      tr.classList.toggle('is-selected', cb.checked);
      updateBulkState();
      updateCheckAll();
    });

    $('#lic-mem-pagination', pageEl).addEventListener('click', (e) => {
      const btn = e.target.closest('.pagination__btn');
      if (!btn || btn.disabled) return;
      const p = Number(btn.dataset.page);
      if (Number.isFinite(p)) { STATE.detailPage = p; renderDetailTable(lic); }
    });
    $('#lic-mem-page-size', pageEl).addEventListener('change', (e) => {
      STATE.detailPageSize = Number(e.target.value);
      STATE.detailPage = 1;
      renderDetailTable(lic);
    });
  }

  function updateBulkState() {
    const pageEl = document.getElementById('page-hr-license');
    if (!pageEl) return;
    const n = STATE.detailSelected.size;
    ['[data-lic-bulk-del]', '[data-lic-bulk-use]', '[data-lic-bulk-unuse]'].forEach(sel => {
      const b = pageEl.querySelector(sel);
      if (b) b.disabled = n === 0;
    });
    const cnt = pageEl.querySelector('[data-lic-sel-count]');
    if (cnt) cnt.textContent = n ? ` · 선택 ${n}명` : '';
  }

  /* 선택 직원 사용 여부 일괄 변경 */
  function setUsedForSelected(lic, used) {
    const ids = new Set(STATE.detailSelected);
    if (!ids.size) return;
    lic.members.forEach(m => { if (ids.has(m.empId)) m.used = used; });
    applyDetailFilterAndRender(lic);
    toast(`${ids.size}명 ${used ? '사용' : '미사용'} 처리 완료`, 'success');
  }
  function updateCheckAll() {
    const pageEl = document.getElementById('page-hr-license');
    const all = pageEl && pageEl.querySelector('[data-lic-check-all]'); if (!all) return;
    const pageRows = _detailFiltered.slice((STATE.detailPage - 1) * STATE.detailPageSize, STATE.detailPage * STATE.detailPageSize);
    if (!pageRows.length) { all.checked = false; all.indeterminate = false; return; }
    const selectedCount = pageRows.filter(m => STATE.detailSelected.has(m.empId)).length;
    all.checked = selectedCount === pageRows.length;
    all.indeterminate = selectedCount > 0 && selectedCount < pageRows.length;
  }

  /* ============ 직원 배정 / 이용 직원 등록 ============ */
  function openAddPicker(lic) {
    if (typeof App.openEmpPicker !== 'function') {
      toast('직원 선택 다이얼로그를 사용할 수 없습니다.', 'danger');
      return;
    }
    const isShared = lic.type === 'shared';
    const existing = new Set(lic.members.map(m => m.empId));
    /* employees 미지정 → 전자결재와 동일한 전사 직원 디렉터리 (부서 제한 없음) */
    App.openEmpPicker({
      action: 'callback',
      multi: true,
      onConfirm: (selected) => {
        if (!selected || !selected.length) return;
        let added = 0, skipped = 0;
        selected.forEach(e => {
          if (existing.has(e.id)) { skipped++; return; }
          existing.add(e.id);
          lic.members.unshift({
            empId: e.id,
            name: e.name,
            dept: e.dept || '',
            position: e.pos || e.position || '',
            rank: e.rank || '',
            photoUrl: e.photo || e.photoUrl || '',
            status: 'active',
            assignedDate: TODAY,
            used: true,           // 신규 배정 직후 기본값은 사용
          });
          added++;
        });
        applyDetailFilterAndRender(lic);
        const verb = isShared ? '이용 직원 등록' : '직원 배정';
        if (added && skipped)  toast(`${added}명 ${verb} · 이미 배정된 ${skipped}명 제외`, 'info');
        else if (added)        toast(`${added}명 ${verb} 완료`, 'success');
        else if (skipped)      toast('이미 배정된 직원입니다.', 'warning');
      },
    });
  }

  function doRemoveOne(lic, empId) {
    const m = lic.members.find(x => x.empId === empId);
    if (!m) return;
    window.sweet ? window.sweet({
      icon: 'confirm', title: '배정 삭제',
      text: `${m.name} 직원의 라이선스 배정을 삭제하시겠습니까?\n이용 인원이 감소합니다.`,
      cancelText: '취소', confirmText: '삭제',
      onConfirm: () => { removeMembers(lic, [empId]); },
    }) : (window.confirm(`${m.name} 배정을 삭제하시겠습니까?`) && removeMembers(lic, [empId]));
  }

  function doBulkDelete(lic) {
    const ids = [...STATE.detailSelected];
    if (!ids.length) return;
    window.sweet ? window.sweet({
      icon: 'confirm', title: '선택 삭제',
      text: `선택한 ${ids.length}명의 라이선스 배정을 삭제하시겠습니까?\n이용 인원이 감소합니다.`,
      cancelText: '취소', confirmText: '삭제',
      onConfirm: () => { removeMembers(lic, ids); },
    }) : (window.confirm(`${ids.length}명 배정을 삭제하시겠습니까?`) && removeMembers(lic, ids));
  }

  function removeMembers(lic, ids) {
    const set = new Set(ids);
    lic.members = lic.members.filter(m => !set.has(m.empId));
    ids.forEach(id => STATE.detailSelected.delete(id));
    applyDetailFilterAndRender(lic);
    toast(`${ids.length}명 삭제 완료`, 'success');
  }

  /* ============ 라이선스 삭제 (목록) ============ */
  function doDeleteLicense(id) {
    const lic = byId(id);
    if (!lic) return;
    const run = () => {
      _store = list().filter(l => l.id !== id);
      applyListFilterAndRender();
      toast(`${lic.name} 라이선스가 삭제되었습니다.`, 'success');
    };
    window.sweet ? window.sweet({
      icon: 'confirm', title: '라이선스 삭제',
      text: `${lic.name} 라이선스를 삭제하시겠습니까?\n이용 인원 ${usingCount(lic)}명의 배정 정보도 함께 삭제됩니다.`,
      cancelText: '취소', confirmText: '삭제',
      onConfirm: run,
    }) : (window.confirm(`${lic.name} 라이선스를 삭제하시겠습니까?`) && run());
  }

  /* ============ 라이선스 등록 / 수정 모달 ============ */
  let _modalEl = null;
  let _modalMode = 'create';   // 'create' | 'edit'
  let _editId = null;
  function ensureModal() {
    if (_modalEl) return _modalEl;
    const el = document.createElement('div');
    el.className = 'modal-backdrop';
    el.id = 'modal-lic-create';
    el.setAttribute('data-modal-id', 'lic-create');
    el.innerHTML = `
      <div class="modal modal--md">
        <div class="modal__header">
          <div class="modal__title" data-lic-modal-title>라이선스 등록</div>
          <button class="modal__close" data-lic-modal-close type="button" aria-label="닫기">✕</button>
        </div>
        <div class="modal__body" style="padding:20px 24px;">
          <div class="fm-tbl">
            <div class="fm-tbl__row fm-tbl__row--1">
              <div class="fm-tbl__label">라이선스명 <em style="color:var(--color-danger);">*</em></div>
              <div class="fm-tbl__value"><input class="input" type="text" data-lic-f-name placeholder="예: Adobe CC" style="width:100%;" /></div>
            </div>
            <div class="fm-tbl__row fm-tbl__row--1">
              <div class="fm-tbl__label">유형 <em style="color:var(--color-danger);">*</em></div>
              <div class="fm-tbl__value">
                <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-start;width:100%;">
                  <div style="display:flex;gap:18px;">
                    <label class="chk"><input type="radio" name="lic-type" value="individual" checked><span>개별 배정형</span></label>
                    <label class="chk"><input type="radio" name="lic-type" value="shared"><span>공용형</span></label>
                  </div>
                  <div class="form-help" style="white-space:nowrap;">개별 배정형은 직원별 배정 수량을, 공용형은 이용 직원만 관리합니다.</div>
                </div>
              </div>
            </div>
            <div class="fm-tbl__row fm-tbl__row--1" data-lic-qty-row>
              <div class="fm-tbl__label">배정 수량 <em style="color:var(--color-danger);">*</em></div>
              <div class="fm-tbl__value">
                <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-start;width:100%;">
                  <input class="input" type="number" min="0" step="1" data-lic-f-qty placeholder="0" style="width:160px;text-align:right;" />
                  <div class="form-help">구매·과금이 필요한 라이선스 수량을 직접 입력합니다.</div>
                </div>
              </div>
            </div>
            <div class="fm-tbl__row fm-tbl__row--2">
              <div class="fm-tbl__label">계약일 <em style="color:var(--color-danger);">*</em></div>
              <div class="fm-tbl__value"><input class="input" type="date" data-lic-f-contract style="width:100%;" /></div>
              <div class="fm-tbl__label">만료일</div>
              <div class="fm-tbl__value"><input class="input" type="date" data-lic-f-expiry style="width:100%;" /></div>
            </div>
            <div class="fm-tbl__row fm-tbl__row--1">
              <div class="fm-tbl__label"></div>
              <div class="fm-tbl__value">
                <label class="chk"><input type="checkbox" data-lic-f-noexpiry><span>만료일 없음 (영구 라이선스)</span></label>
              </div>
            </div>
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--ghost" type="button" data-lic-modal-close>취소</button>
          <button class="btn btn--primary" type="button" data-lic-modal-save>등록</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => { if (e.target === el) closeCreateModal(); });
    el.querySelectorAll('[data-lic-modal-close]').forEach(b => b.addEventListener('click', closeCreateModal));
    el.querySelector('[data-lic-modal-save]').addEventListener('click', saveNewLicense);
    /* 유형 라디오 → 배정 수량 행 표시/숨김 (공용형은 배정 수량 미관리) */
    el.querySelectorAll('input[name="lic-type"]').forEach(r => r.addEventListener('change', syncQtyRow));
    /* 만료일 없음 체크 → 만료일 입력 비활성화 */
    const noExp = el.querySelector('[data-lic-f-noexpiry]');
    if (noExp) noExp.addEventListener('change', syncExpiryRow);
    _modalEl = el;
    return el;
  }
  function syncQtyRow() {
    if (!_modalEl) return;
    const type = (_modalEl.querySelector('input[name="lic-type"]:checked') || {}).value || 'individual';
    const row = _modalEl.querySelector('[data-lic-qty-row]');
    if (row) row.style.display = type === 'shared' ? 'none' : '';
  }
  function syncExpiryRow() {
    if (!_modalEl) return;
    const noExp = _modalEl.querySelector('[data-lic-f-noexpiry]');
    const exp = _modalEl.querySelector('[data-lic-f-expiry]');
    if (!exp) return;
    exp.disabled = !!(noExp && noExp.checked);
    if (exp.disabled) { exp.value = ''; clearErr(exp); }
  }
  function _setTypeRadios(el, type, disabled) {
    el.querySelectorAll('input[name="lic-type"]').forEach(r => {
      r.checked = (r.value === type);
      r.disabled = !!disabled;
    });
  }
  function openCreateModal() {
    const el = ensureModal();
    _modalMode = 'create';
    _editId = null;
    el.querySelector('[data-lic-modal-title]').textContent = '라이선스 등록';
    el.querySelector('[data-lic-modal-save]').textContent = '등록';
    el.querySelector('[data-lic-f-name]').value = '';
    el.querySelector('[data-lic-f-qty]').value = '';
    el.querySelector('[data-lic-f-contract]').value = '';
    el.querySelector('[data-lic-f-expiry]').value = '';
    el.querySelector('[data-lic-f-noexpiry]').checked = false;
    _setTypeRadios(el, 'individual', false);   // 등록 시 유형 선택 가능
    syncQtyRow();
    syncExpiryRow();
    App.Forms && App.Forms.clearAll && App.Forms.clearAll(el);
    el.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => el.querySelector('[data-lic-f-name]').focus(), 50);
  }
  function openEditModal(lic) {
    const el = ensureModal();
    _modalMode = 'edit';
    _editId = lic.id;
    el.querySelector('[data-lic-modal-title]').textContent = '라이선스 수정';
    el.querySelector('[data-lic-modal-save]').textContent = '저장';
    el.querySelector('[data-lic-f-name]').value = lic.name || '';
    el.querySelector('[data-lic-f-qty]').value = lic.assigned != null ? String(lic.assigned) : '';
    el.querySelector('[data-lic-f-contract]').value = lic.contractDate || '';
    el.querySelector('[data-lic-f-expiry]').value = lic.expiryDate || '';
    el.querySelector('[data-lic-f-noexpiry]').checked = !lic.expiryDate;
    _setTypeRadios(el, lic.type, true);        // 수정 시 유형은 변경 불가 (읽기 전용)
    syncQtyRow();
    syncExpiryRow();
    App.Forms && App.Forms.clearAll && App.Forms.clearAll(el);
    el.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => el.querySelector('[data-lic-f-name]').focus(), 50);
  }
  function closeCreateModal() {
    if (!_modalEl) return;
    _modalEl.classList.remove('is-open');
    document.body.style.overflow = '';
  }
  function saveNewLicense() {
    const el = _modalEl;
    const nameEl = el.querySelector('[data-lic-f-name]');
    const qtyEl = el.querySelector('[data-lic-f-qty]');
    const contractEl = el.querySelector('[data-lic-f-contract]');
    const expiryEl = el.querySelector('[data-lic-f-expiry]');
    const noExpEl = el.querySelector('[data-lic-f-noexpiry]');
    const type = (el.querySelector('input[name="lic-type"]:checked') || {}).value || 'individual';
    const nameVal = nameEl.value.trim();
    const contractVal = contractEl.value || '';
    const noExpiry = !!(noExpEl && noExpEl.checked);
    const expiryVal = noExpiry ? null : (expiryEl.value || '');
    const isEdit = _modalMode === 'edit';
    App.Forms && App.Forms.clearAll && App.Forms.clearAll(el);
    let ok = true;
    if (!nameVal) { setErr(nameEl, '라이선스명을 입력해 주세요.'); ok = false; }
    else if (list().some(l => l.name === nameVal && l.id !== _editId)) { setErr(nameEl, '이미 등록된 라이선스명입니다.'); ok = false; }
    let assigned = null;
    if (type === 'individual') {
      const q = parseInt(qtyEl.value, 10);
      if (qtyEl.value.trim() === '' || !Number.isFinite(q) || q < 0) { setErr(qtyEl, '배정 수량을 입력해 주세요.'); ok = false; }
      else assigned = q;
    }
    if (!contractVal) { setErr(contractEl, '계약일을 선택해 주세요.'); ok = false; }
    if (!noExpiry && !expiryVal) { setErr(expiryEl, '만료일을 선택하거나 [만료일 없음]을 체크해 주세요.'); ok = false; }
    if (contractVal && expiryVal && expiryVal < contractVal) { setErr(expiryEl, '만료일은 계약일 이후여야 합니다.'); ok = false; }
    if (!ok) return;

    if (isEdit) {
      const lic = byId(_editId);
      if (!lic) { closeCreateModal(); return; }
      /* 변경 항목 diff — 사유 모달로 이력을 남기기 위해 수집 */
      const changes = [];
      const push = (label, from, to) => { if (String(from) !== String(to)) changes.push({ label, from, to }); };
      push('라이선스명', lic.name, nameVal);
      if (lic.type === 'individual') push('배정 수량', lic.assigned, assigned);
      push('계약일', dispYmd(lic.contractDate), dispYmd(contractVal));
      push('만료일', lic.expiryDate ? dispYmd(lic.expiryDate) : '없음', expiryVal ? dispYmd(expiryVal) : '없음');
      if (!changes.length) { closeCreateModal(); toast('변경된 내용이 없습니다.', 'info'); return; }
      const next = { name: nameVal, assigned, contractDate: contractVal, expiryDate: expiryVal };
      /* 사유 입력 모달 → 확인 시 적용 + 이력 기록 */
      openReasonModal(changes, (reason) => applyLicenseEdit(lic, next, changes, reason));
      return;
    }

    const store = list();
    const num = store.reduce((mx, l) => Math.max(mx, Number((l.id.match(/\d+/) || [0])[0])), 0) + 1;
    store.unshift({
      id: `LIC-${String(num).padStart(4, '0')}`,
      name: nameVal,
      type,
      assigned,
      enabled: true,
      contractDate: contractVal,
      expiryDate: expiryVal,
      history: [],
      members: [],
    });
    closeCreateModal();
    applyListFilterAndRender();
    toast('라이선스가 등록되었습니다.', 'success');
  }

  /* 수정 확정 — 값 반영 + 변경 이력 push (사유 모달 확인 콜백에서 호출) */
  function applyLicenseEdit(lic, next, changes, reason) {
    lic.name = next.name;
    if (lic.type === 'individual') lic.assigned = next.assigned;
    lic.contractDate = next.contractDate;
    lic.expiryDate = next.expiryDate;
    if (!Array.isArray(lic.history)) lic.history = [];
    lic.history.unshift({
      at: nowStamp(),
      by: (App.currentUser && App.currentUser.name) || '관리자',
      reason: reason,
      changes: changes.slice(),
    });
    closeReasonModal();
    closeCreateModal();
    if (STATE.view === 'detail') renderDetailView(document.getElementById('page-hr-license'), lic);
    toast('라이선스 정보가 수정되었습니다.', 'success');
  }
  function clearErr(inputEl) {
    if (!inputEl) return;
    if (App.Forms && App.Forms.clearFieldError) { App.Forms.clearFieldError(inputEl); return; }
    inputEl.classList.remove('is-invalid');
  }
  function setErr(inputEl, msg) {
    if (App.Forms && App.Forms.setFieldError) { App.Forms.setFieldError(inputEl, msg); return; }
    /* fallback */
    inputEl.classList.add('is-invalid');
    let e = inputEl.parentElement.querySelector('.field-error');
    if (!e) { e = document.createElement('div'); e.className = 'field-error'; inputEl.parentElement.appendChild(e); }
    e.textContent = msg;
  }

  /* ============ 사유 입력 모달 (라이선스 수정 시) ============ */
  let _reasonEl = null;
  let _reasonCb = null;
  function changesSummaryHTML(changes) {
    return `<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;padding:12px 14px;background:var(--color-surface-alt);border-radius:var(--radius-md);">
      <div style="font-size:var(--fs-xs);color:var(--color-text-muted);margin-bottom:2px;">변경 항목 ${changes.length}건</div>
      ${changes.map(c => `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:var(--fs-sm);">
        <span class="pill pill--info" style="font-size:10px;">${esc(c.label)}</span>
        <span style="color:var(--color-text-muted);text-decoration:line-through;">${esc(c.from == null || c.from === '' ? '-' : c.from)}</span>
        <span style="color:var(--color-text-muted);">→</span>
        <span style="font-weight:var(--fw-medium);color:var(--color-brand-primary);">${esc(c.to == null || c.to === '' ? '-' : c.to)}</span>
      </div>`).join('')}
    </div>`;
  }
  function ensureReasonModal() {
    if (_reasonEl) return _reasonEl;
    const el = document.createElement('div');
    el.className = 'modal-backdrop';
    el.id = 'modal-lic-reason';
    el.setAttribute('data-modal-id', 'lic-reason');
    el.style.zIndex = '1060';   // 수정 모달(기본) 위에 표시
    el.innerHTML = `
      <div class="modal">
        <div class="modal__header">
          <div class="modal__title">변경 사유 입력</div>
          <button class="modal__close" data-lic-reason-close type="button" aria-label="닫기">✕</button>
        </div>
        <div class="modal__body" style="padding:18px 24px;">
          <div data-lic-reason-summary></div>
          <div class="fm-tbl">
            <div class="fm-tbl__row fm-tbl__row--1">
              <div class="fm-tbl__label">변경 사유 <em style="color:var(--color-danger);">*</em></div>
              <div class="fm-tbl__value">
                <textarea class="input" data-lic-reason-text rows="3" placeholder="변경 사유를 입력해 주세요." style="width:100%;resize:vertical;"></textarea>
              </div>
            </div>
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--ghost" type="button" data-lic-reason-close>취소</button>
          <button class="btn btn--primary" type="button" data-lic-reason-save>확인</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => { if (e.target === el) closeReasonModal(); });
    el.querySelectorAll('[data-lic-reason-close]').forEach(b => b.addEventListener('click', closeReasonModal));
    el.querySelector('[data-lic-reason-save]').addEventListener('click', () => {
      const ta = el.querySelector('[data-lic-reason-text]');
      const val = ta.value.trim();
      if (!val) { setErr(ta, '변경 사유를 입력해 주세요.'); return; }
      const cb = _reasonCb;
      if (typeof cb === 'function') cb(val);
    });
    _reasonEl = el;
    return el;
  }
  function openReasonModal(changes, onConfirm) {
    const el = ensureReasonModal();
    _reasonCb = onConfirm;
    el.querySelector('[data-lic-reason-summary]').innerHTML = changesSummaryHTML(changes);
    const ta = el.querySelector('[data-lic-reason-text]');
    ta.value = '';
    clearErr(ta);
    el.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => ta.focus(), 50);
  }
  function closeReasonModal() {
    if (!_reasonEl) return;
    _reasonEl.classList.remove('is-open');
    _reasonCb = null;
    /* 기저 수정 모달이 닫혔으면 body 스크롤 복원 */
    if (!_modalEl || !_modalEl.classList.contains('is-open')) document.body.style.overflow = '';
  }

  /* ============ 변경 이력 모달 ============ */
  let _historyEl = null;
  function ensureHistoryModal() {
    if (_historyEl) return _historyEl;
    const el = document.createElement('div');
    el.className = 'modal-backdrop';
    el.id = 'modal-lic-history';
    el.setAttribute('data-modal-id', 'lic-history');
    el.innerHTML = `
      <div class="modal modal--md" style="display:flex;flex-direction:column;max-height:80vh;">
        <div class="modal__header">
          <div class="modal__title" data-lic-history-title>변경 이력</div>
          <button class="modal__close" data-lic-history-close type="button" aria-label="닫기">✕</button>
        </div>
        <div class="modal__body" data-lic-history-body style="overflow:auto;padding:18px 20px;"></div>
        <div class="modal__footer"><button class="btn" type="button" data-lic-history-close>닫기</button></div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('[data-lic-history-close]')) closeHistoryModal();
    });
    _historyEl = el;
    return el;
  }
  function closeHistoryModal() {
    if (!_historyEl) return;
    _historyEl.classList.remove('is-open');
    document.body.style.overflow = '';
  }
  function openLicHistory(lic) {
    const el = ensureHistoryModal();
    el.querySelector('[data-lic-history-title]').textContent = `변경 이력 · ${lic.name}`;
    const body = el.querySelector('[data-lic-history-body]');
    const hist = Array.isArray(lic.history) ? lic.history : [];
    body.innerHTML = hist.length
      ? `<div class="timeline">${hist.map(h => `
          <div class="tl-item tl-item--info">
            <div class="tl-item__dot"></div>
            <div class="tl-item__time">${esc(h.at)}</div>
            <div class="tl-item__title">라이선스 정보 수정 <span style="font-weight:var(--fw-regular);color:var(--color-text-muted);font-size:var(--fs-sm);">· ${esc(h.by)}</span></div>
            <div class="tl-item__desc">
              ${(h.changes || []).map(c => `<div style="display:flex;align-items:center;gap:8px;padding:2px 0;flex-wrap:wrap;">
                <span class="pill pill--info" style="font-size:10px;">${esc(c.label)}</span>
                <span style="color:var(--color-text-muted);text-decoration:line-through;">${esc(c.from == null || c.from === '' ? '-' : c.from)}</span>
                <span style="color:var(--color-text-muted);">→</span>
                <span style="font-weight:var(--fw-medium);">${esc(c.to == null || c.to === '' ? '-' : c.to)}</span>
              </div>`).join('')}
              <div style="margin-top:6px;padding-top:6px;border-top:1px dashed var(--color-divider);color:var(--color-text-sub);font-size:var(--fs-sm);">
                <strong style="color:var(--color-text-muted);font-weight:var(--fw-medium);">사유</strong> · ${esc(h.reason)}
              </div>
            </div>
          </div>`).join('')}</div>`
      : `<p style="text-align:center;color:var(--color-text-muted);padding:44px 0;line-height:1.7;">기록된 변경 이력이 없습니다.<br>[편집]에서 라이선스 정보를 수정하면 이력이 기록됩니다.</p>`;
    el.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  /* ============ 공통 페이지네이션 렌더 ============ */
  function renderPagination(infoSel, listSel, total, page, size, unit) {
    unit = unit || '건';
    const info = $(infoSel); const listEl = $(listSel);
    if (!info || !listEl) return;
    const totalPages = Math.max(1, Math.ceil(total / size));
    if (page > totalPages) page = totalPages;
    const start = (page - 1) * size;
    info.textContent = total === 0 ? `0${unit}` : `${start + 1}-${Math.min(start + size, total)} / ${total}${unit}`;
    const btns = [];
    btns.push(`<button class="pagination__btn" data-page="1" ${page === 1 ? 'disabled' : ''}>«</button>`);
    btns.push(`<button class="pagination__btn" data-page="${Math.max(1, page - 1)}" ${page === 1 ? 'disabled' : ''}>‹</button>`);
    const win = 10;
    let s = Math.max(1, page - Math.floor(win / 2));
    let e = Math.min(totalPages, s + win - 1);
    if (e - s < win - 1) s = Math.max(1, e - win + 1);
    for (let i = s; i <= e; i++) {
      btns.push(`<button class="pagination__btn${i === page ? ' is-active' : ''}" data-page="${i}">${i}</button>`);
    }
    btns.push(`<button class="pagination__btn" data-page="${Math.min(totalPages, page + 1)}" ${page === totalPages ? 'disabled' : ''}>›</button>`);
    btns.push(`<button class="pagination__btn" data-page="${totalPages}" ${page === totalPages ? 'disabled' : ''}>»</button>`);
    listEl.innerHTML = btns.join('');
  }

  /* ============ 페이지 등록 ============ */
  function initLicensePage() {
    const pageEl = document.getElementById('page-hr-license');
    if (!pageEl) return;

    /* 페이지 레벨 클릭 위임 — 1회만 바인딩 (pageEl 은 재생성되지 않으므로 누적 방지).
       내부 마크업이 re-render 되어도 data-* 훅으로 현재 view 액션을 분기한다. */
    if (pageEl.dataset.licBound !== '1') {
      pageEl.addEventListener('click', (e) => {
        /* ---- 목록 뷰 ---- */
        if (e.target.closest('[data-lic-create]')) { openCreateModal(); return; }
        const detailBtn = e.target.closest('[data-lic-detail]');
        if (detailBtn) { openDetailView(detailBtn.dataset.licDetail); return; }
        const delBtn = e.target.closest('[data-lic-del]');
        if (delBtn) { doDeleteLicense(delBtn.dataset.licDel); return; }

        /* ---- 상세 뷰 ---- */
        if (e.target.closest('[data-lic-back]')) { renderListView(pageEl); return; }
        const lic = STATE.detailId ? byId(STATE.detailId) : null;
        if (e.target.closest('[data-lic-history]'))    { if (lic) openLicHistory(lic); return; }
        if (e.target.closest('[data-lic-edit]'))       { if (lic) openEditModal(lic); return; }
        if (e.target.closest('[data-lic-add]'))       { if (lic) openAddPicker(lic); return; }
        if (e.target.closest('[data-lic-bulk-use]'))   { if (lic) setUsedForSelected(lic, true); return; }
        if (e.target.closest('[data-lic-bulk-unuse]')) { if (lic) setUsedForSelected(lic, false); return; }
        if (e.target.closest('[data-lic-bulk-del]'))  { if (lic) doBulkDelete(lic); return; }
        const del = e.target.closest('[data-lic-mem-del]');
        if (del) { if (lic) doRemoveOne(lic, del.dataset.licMemDel); return; }

        /* ---- 행 클릭 → 상세 (목록 뷰 전용, 인터랙티브 요소·드래그 선택 제외) ---- */
        if (STATE.view !== 'list') return;
        if (e.target.closest('button, a, input, select, textarea, label')) return;
        const selg = window.getSelection && window.getSelection();
        if (selg && selg.type === 'Range' && String(selg).length > 0) return;
        const row = e.target.closest('[data-lic-row]');
        if (row) { openDetailView(row.dataset.licRow); return; }
      });
      pageEl.dataset.licBound = '1';
    }

    pageEl.__onShow = () => {
      /* 탭 재진입 시 항상 목록부터 시작 */
      STATE.view = 'list';
      STATE.detailId = null;
      renderListView(pageEl);
    };
  }

  const prev = App.initPages;
  App.initPages = function () {
    if (typeof prev === 'function') prev();
    initLicensePage();
  };

  /* 외부 참조용 API */
  App.HRLicense = { list, byId };
})();
