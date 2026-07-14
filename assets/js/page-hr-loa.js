/* =========================================================
 * Page: HR > 계약·발령·휴직 > 휴직 관리
 *
 *  개요
 *   - 「전자결재 승인」 난 휴직 신청 건의 이력을 테이블로 보고 현황(휴직예정/휴직중/복직완료)을 관리하는 화면.
 *   - 휴직 유형은 전자결재 휴직 신청 3종만 — 육아휴직(본인) / 육아휴직(배우자) / 가족돌봄휴직.
 *     이 신청이 전자결재에서 승인되면 본 화면에 누적된다 (storyboard 는 mock).
 *
 *  업무 흐름 — 현황은 별도 발령 절차 없이 휴직 기간(시작일·복직예정일) 기준으로 자동 판정된다.
 *   1) 전자결재 휴직 신청 승인 → 본 화면에 휴직 이력으로 쌓임
 *   2) 현황 자동 전환 (기준일: TODAY)
 *        · 휴직 시작일 미도래            → 「휴직예정」
 *        · 휴직 시작일 도래 ~ 복직예정일 전 → 「휴직중」
 *        · 복직예정일(휴직 종료 다음날) 도래 → 「복직완료」
 *   3) 복직 D-day 는 복직예정일 30일 전부터 표기 (복직 임박 알림용 · 별도 발령 불요)
 *
 *  관리 액션
 *   - 행/[상세] 클릭 → 휴직 상세 모달 (현황 · 복직예정일 · 자동 전환 안내)
 *   - 성명 클릭 → 인사정보카드
 *
 *  UI Kit 재사용
 *   .toolbar / .tbl / .tbl--hover / .pill / .pagination
 *   .modal / .modal-backdrop / .modal--lg / .fm-tbl / .input / .select / .field-error
 *   App.Components.searchPanel / App.Search.attach
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  /* ============ 환경 ============ */
  const TODAY = '2026-06-09';

  /* ============ 휴직 유형 ============
   *   · 전자결재 휴직 신청 3종 — 육아휴직(본인) / 육아휴직(배우자) / 가족돌봄휴직
   *   · 근태 휴가 신청의 「출산/휴가」 2종 — 출산휴가(본인) / 출산휴가(배우자)
   *     (근태 휴가 신청에서 출산휴가가 상신되면 App.HRLoa.add 로 본 화면에 이력이 함께 쌓인다) */
  const LOA_TYPES = {
    parental_self:    { label: '육아휴직(본인)',   group: '육아휴직',  pill: 'pill--success' },
    parental_spouse:  { label: '육아휴직(배우자)', group: '육아휴직',  pill: 'pill--info'    },
    family_care:      { label: '가족돌봄휴직',     group: '가족돌봄',  pill: 'pill--warning' },
    maternity_self:   { label: '출산휴가(본인)',   group: '출산/휴가', pill: 'pill--purple'  },
    maternity_spouse: { label: '출산휴가(배우자)', group: '출산/휴가', pill: 'pill--purple'  },
  };
  /* ============ 휴직 현황 ============ */
  const LOA_STATUS = {
    scheduled: { label: '휴직예정', pill: 'pill--info' },
    ongoing:   { label: '휴직중',   pill: 'pill--warning' },
    returned:  { label: '복직완료', pill: 'pill--success' },
  };
  const STATUS_ORDER = ['scheduled', 'ongoing', 'returned'];

  /* ============ STATE ============ */
  const STATE = {
    records: [],
    filter: { keyword: '', condition: 'empName', type: '', status: '' },
    page: 1, pageSize: 20,
    editingId: null,
  };

  /* ============ Helpers ============ */
  function $(s, r = document) { return r.querySelector(s); }
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* ISO(YYYY-MM-DD) → YY/MM/DD (SWADPIA §1) */
  function fmtYMD(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '';
    return iso.slice(2).replace(/-/g, '/');
  }
  function addDays(iso, n) { const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
  /* 일시 'YYYY-MM-DD HH:MM' → 'YY/MM/DD   HH:MM' (SWADPIA §2) */
  function fmtDT(dt) {
    const m = String(dt || '').match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
    if (!m) return dt || '';
    return `${m[1].slice(2)}/${m[2]}/${m[3]}   ${m[4]}:${m[5]}`;
  }
  function dayCount(from, to) {
    if (!from || !to) return 0;
    const d = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
    return d > 0 ? d : 0;
  }
  function diffDays(from, to) { return Math.round((new Date(to) - new Date(from)) / 86400000); }
  /* D-Day 표기 — 휴직중일 때 복직예정일(종료+1) 30일 전부터 카운트다운 (복직 임박 알림용).
   *   · 31일 이상 남음 → 표기 안 함(—)   · 8~30일 → brand   · 7일 이내 → warning(복직 임박)
   *   휴직중은 정의상 TODAY < 복직예정일 이므로 항상 D-n (n≥1). 그 외(예정/복직완료)는 — */
  function ddayHTML(r) {
    if (r.status !== 'ongoing') return '<span style="color:var(--color-text-muted);">—</span>';
    const n = diffDays(TODAY, addDays(r.endDate, 1));   /* 복직예정일까지 남은 일수 */
    if (n > 30) return '<span style="color:var(--color-text-muted);">—</span>';   /* 30일 전부터 표기 */
    const color = (n <= 7) ? 'var(--color-warning)' : 'var(--color-brand-primary)';
    return `<span style="font-weight:var(--fw-medium);color:${color};white-space:nowrap;">복직 D-${n}</span>`;
  }
  function allMembers() { return (window.App && App.HRMembers && App.HRMembers.list) ? App.HRMembers.list() : []; }
  function activeMembers() { return allMembers().filter(e => e.status !== 'retired' && e.status !== 'contractExpired'); }
  function memberById(id) { return allMembers().find(e => e.id === id) || null; }
  function recById(id) { return STATE.records.find(r => r.id === id) || null; }
  function typeMeta(t) { return LOA_TYPES[t] || { label: t, group: '-', pill: 'pill--muted' }; }
  function statusMeta(s) { return LOA_STATUS[s] || LOA_STATUS.scheduled; }

  /* 현황 자동 판정 — 휴직 기간(시작일·복직예정일)과 기준일(TODAY) 비교만으로 결정.
   *   · TODAY < 휴직 시작일                 → scheduled (휴직예정)
   *   · 휴직 시작일 ≤ TODAY < 복직예정일      → ongoing   (휴직중)
   *   · 복직예정일(= 휴직 종료 + 1) ≤ TODAY  → returned  (복직완료)
   * ISO(YYYY-MM-DD) 문자열은 사전식 비교가 곧 날짜 비교라 그대로 사용. */
  function computeStatus(r) {
    const returnDate = addDays(r.endDate, 1);   /* 복직예정일 */
    if (TODAY >= returnDate) return 'returned';
    if (TODAY >= r.startDate) return 'ongoing';
    return 'scheduled';
  }

  /* ============ Mock — 전자결재 승인된 휴직 이력 ============ */
  function makeMock() {
    const emps = activeMembers();
    if (!emps.length) return [];
    /* offset(시작일, TODAY 기준) · 기간(일) · 유형 — 휴직 3종.
       현황은 저장하지 않고 휴직 기간으로 computeStatus() 자동 판정 → 예정/진행/복직 골고루 분포.
       (시작일 미도래=예정 / 진행 중=휴직중 / 복직예정일 도래=복직완료. ongoing 의 복직 D-day 도 다양하게 구성) */
    const samples = [
      { type: 'parental_self',    start: 20,   days: 365 },   /* 시작 +20  → 휴직예정 */
      { type: 'parental_spouse',  start: 10,   days: 90  },   /* 시작 +10  → 휴직예정 */
      { type: 'family_care',      start: 45,   days: 60  },   /* 시작 +45  → 휴직예정 */
      { type: 'parental_self',    start: 5,    days: 180 },   /* 시작 +5   → 휴직예정 */
      { type: 'parental_self',    start: -340, days: 365 },   /* 휴직중 · 복직 D-25 (brand) */
      { type: 'family_care',      start: -57,  days: 60  },   /* 휴직중 · 복직 D-3  (warning) */
      { type: 'parental_spouse',  start: -88,  days: 90  },   /* 휴직중 · 복직 D-2  (warning) */
      { type: 'parental_self',    start: -100, days: 180 },   /* 휴직중 · 복직 80일 → — */
      { type: 'family_care',      start: -65,  days: 60  },   /* 복직예정일 도래 → 복직완료 */
      { type: 'parental_self',    start: -400, days: 365 },   /* 복직완료 */
      { type: 'family_care',      start: -120, days: 45  },   /* 복직완료 */
      { type: 'parental_spouse',  start: -260, days: 90  },   /* 복직완료 */
      { type: 'maternity_self',   start: 12,   days: 90  },   /* 출산휴가(본인) · 휴직예정 */
      { type: 'maternity_self',   start: -30,  days: 90  },   /* 출산휴가(본인) · 휴직중 (복직 D-59 → —) */
      { type: 'maternity_spouse', start: -3,   days: 10  },   /* 출산휴가(배우자) · 휴직중 (복직 D-7) */
      { type: 'maternity_self',   start: -200, days: 90  },   /* 출산휴가(본인) · 복직완료 */
    ];
    const out = samples.map((s, i) => {
      const emp = emps[(i * 3 + 2) % emps.length];
      const startDate = addDays(TODAY, s.start);
      const endDate   = addDays(startDate, s.days - 1);
      const approvedAt = addDays(startDate, -7);   /* 승인은 시작 7일 전 */
      const rec = {
        id: `LOA-${startDate.slice(0, 4)}-${String(i + 1).padStart(4, '0')}`,
        empId: emp.id, empName: emp.name, empDept: emp.dept, empPosition: emp.position,
        type: s.type,
        startDate, endDate, days: s.days,
        status: 'scheduled',   /* computeStatus 로 즉시 덮어씀 */
        returnDate: '',
        approvalNo: `EAP-${approvedAt.slice(0, 4)}-${String(1000 + i * 7).padStart(5, '0')}`,
        approvedAt,
        note: '',
      };
      rec.status = computeStatus(rec);
      /* 복직완료 건은 복직예정일(= 휴직 종료 다음날)을 복직 처리일로 기록 */
      rec.returnDate = rec.status === 'returned' ? addDays(endDate, 1) : '';
      return rec;
    });
    /* 최신 시작일 우선 */
    out.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
    return out;
  }

  /* ============ 필터 ============ */
  function applyFilter() {
    const p = STATE.filter;
    const kw = (p.keyword || '').trim().toLowerCase();
    return STATE.records.filter(r => {
      if (p.type && r.type !== p.type) return false;
      if (p.status && r.status !== p.status) return false;
      if (kw) {
        const t = p.condition === 'empId' ? r.empId : (p.condition === 'loaNo' ? r.id : r.empName);
        if (!String(t).toLowerCase().includes(kw)) return false;
      }
      return true;
    });
  }

  /* =========================================================
   *  VIEW
   * ========================================================= */
  function render(pageEl) {
    const C = App.Components;
    const searchHTML = C.searchPanel({
      showDateRange: false,
      conditions: [
        { value: 'empName', label: '성명' },
        { value: 'empId',   label: '사번' },
        { value: 'loaNo',   label: '휴직번호' },
      ],
      placeholder: '성명/사번/휴직번호 검색',
      cols: 2,
      advanced: [
        { name: 'type', label: '휴직 유형', options: Object.keys(LOA_TYPES).map(k => ({ value: k, label: LOA_TYPES[k].label })) },
        { name: 'status', label: '현황', options: STATUS_ORDER.map(k => ({ value: k, label: LOA_STATUS[k].label })) },
      ],
    });

    const filtered = applyFilter();
    const start = (STATE.page - 1) * STATE.pageSize;
    const rows = filtered.slice(start, start + STATE.pageSize);

    pageEl.innerHTML = `
      ${searchHTML}

      <div style="flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;">
        <div class="toolbar">
          <div class="toolbar__left">
            <span class="toolbar__count">총 <strong>${filtered.length}</strong>건</span>
          </div>
          <div class="toolbar__right">
            <button class="btn btn--sm" type="button" data-loa-excel><span style="display:inline-flex;align-items:center;gap:4px;">${(window.Icons && window.Icons.download) || ''}<span>엑셀 다운로드</span></span></button>
          </div>
        </div>

        <div class="grid-wrap" style="flex:1;min-height:0;">
          <div class="grid-scroll">
            <table class="tbl tbl--hover">
              <thead>
                <tr>
                  <th style="width:140px;">휴직번호</th>
                  <th style="width:130px;">결재문서</th>
                  <th style="width:96px;">사번</th>
                  <th style="min-width:220px;">성명</th>
                  <th style="width:140px;">휴직 유형</th>
                  <th style="width:170px;text-align:center;">휴직 기간</th>
                  <th style="width:96px;text-align:center;">D-Day</th>
                  <th style="width:90px;text-align:center;">현황</th>
                  <th style="width:70px;text-align:center;"></th>
                </tr>
              </thead>
              <tbody data-loa-body>${renderRows(rows, filtered.length, start)}</tbody>
            </table>
          </div>

          <div class="pagination">
            <div class="pagination__info" data-loa-info></div>
            <div class="pagination__right">
              <div class="pagination__size">
                <label>페이지당</label>
                <select class="select" data-loa-pagesize>
                  <option value="20">20</option><option value="50">50</option><option value="100">100</option>
                </select>
                <span>건</span>
              </div>
              <div class="pagination__list" data-loa-pagination></div>
            </div>
          </div>
        </div>
      </div>
    `;
    bind(pageEl);
    renderPagination(pageEl, filtered);
  }

  function renderRows(rows, total, start) {
    if (!rows.length) {
      return `<tr><td colspan="9" style="text-align:center;color:var(--color-text-muted);padding:32px 0;">
        조건에 맞는 휴직 이력이 없습니다.
      </td></tr>`;
    }
    return rows.map((r, i) => {
      const tm = typeMeta(r.type);
      const sm = statusMeta(r.status);
      const member = memberById(r.empId);
      const photo = (member && member.photoUrl) || '';
      const avatarHTML = photo
        ? `<img src="${esc(photo)}" alt="" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;" />`
        : `<span style="width:24px;height:24px;border-radius:50%;background:var(--color-active);color:var(--color-brand-primary);display:inline-flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;">${esc((r.empName || '?').charAt(0))}</span>`;
      /* 성명 옆 회색 메타 — 팀·직위·직책 (구두점 앞뒤 여백 없이) */
      const metaParts = [
        r.empDept || (member && member.dept) || '',
        (member && member.rank) || '',
        r.empPosition || (member && member.position) || '',
      ].filter(Boolean).map(esc);
      const dot  = `<span style="color:var(--color-text-muted);font-size:var(--fs-xs);" aria-hidden="true">·</span>`;
      const meta = (v) => `<span style="color:var(--color-text-muted);font-size:var(--fs-xs);white-space:nowrap;">${v}</span>`;
      const metaHTML = metaParts.map(meta).join(dot);
      return `
        <tr class="is-clickable" data-loa-row="${esc(r.id)}">
          <td style="white-space:nowrap;"><span class="link-code">${esc(r.id)}</span></td>
          <td style="white-space:nowrap;"><a href="#" data-loa-approval="${esc(r.id)}" class="link-code">${esc(r.approvalNo)}</a></td>
          <td style="white-space:nowrap;">${esc(r.empId)}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px;min-width:0;">
              ${avatarHTML}
              <a href="#" data-loa-emp-card="${esc(r.empId)}" style="color:var(--color-brand-primary);font-weight:var(--fw-medium);white-space:nowrap;">${esc(r.empName)}</a>
              <span style="display:inline-flex;align-items:center;gap:0;min-width:0;">${metaHTML}</span>
            </div>
          </td>
          <td>${esc(tm.label)}</td>
          <td style="text-align:center;white-space:nowrap;">${fmtYMD(r.startDate)} ~ ${fmtYMD(r.endDate)}</td>
          <td style="text-align:center;">${ddayHTML(r)}</td>
          <td style="text-align:center;"><span class="pill ${sm.pill}">${esc(sm.label)}</span></td>
          <td style="text-align:center;">
            <button class="btn btn--xs" type="button" data-loa-detail="${esc(r.id)}">상세</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderPagination(pageEl, filtered) {
    const total = filtered.length;
    const start = (STATE.page - 1) * STATE.pageSize;
    const size = STATE.pageSize;
    const totalPages = Math.max(1, Math.ceil(total / size));
    if (STATE.page > totalPages) STATE.page = totalPages;

    const info = pageEl.querySelector('[data-loa-info]');
    if (info) info.textContent = total === 0 ? '0건' : `${start + 1}-${Math.min(start + size, total)} / ${total}건`;

    const btns = [];
    btns.push(`<button class="pagination__btn" data-page="1" ${STATE.page === 1 ? 'disabled' : ''}>«</button>`);
    btns.push(`<button class="pagination__btn" data-page="${Math.max(1, STATE.page - 1)}" ${STATE.page === 1 ? 'disabled' : ''}>‹</button>`);
    const win = 10;
    let s = Math.max(1, STATE.page - Math.floor(win / 2));
    let e = Math.min(totalPages, s + win - 1);
    if (e - s < win - 1) s = Math.max(1, e - win + 1);
    for (let i = s; i <= e; i++) {
      btns.push(`<button class="pagination__btn${i === STATE.page ? ' is-active' : ''}" data-page="${i}">${i}</button>`);
    }
    btns.push(`<button class="pagination__btn" data-page="${Math.min(totalPages, STATE.page + 1)}" ${STATE.page === totalPages ? 'disabled' : ''}>›</button>`);
    btns.push(`<button class="pagination__btn" data-page="${totalPages}" ${STATE.page === totalPages ? 'disabled' : ''}>»</button>`);
    const pg = pageEl.querySelector('[data-loa-pagination]');
    if (pg) pg.innerHTML = btns.join('');
    const ps = pageEl.querySelector('[data-loa-pagesize]');
    if (ps) ps.value = String(STATE.pageSize);
  }

  function refreshTable(pageEl) {
    const filtered = applyFilter();
    const start = (STATE.page - 1) * STATE.pageSize;
    const rows = filtered.slice(start, start + STATE.pageSize);
    const body = pageEl.querySelector('[data-loa-body]');
    if (body) body.innerHTML = renderRows(rows, filtered.length, start);
    renderPagination(pageEl, filtered);
    const count = pageEl.querySelector('.toolbar__count');
    if (count) count.innerHTML = `총 <strong>${filtered.length}</strong>건`;
  }

  /* ============ Bind ============ */
  function bind(pageEl) {
    App.Search.attach(pageEl.querySelector('[data-search]'), (params) => {
      const adv = params.advanced || {};
      STATE.filter.keyword   = (params.keyword || '').trim();
      STATE.filter.condition = params.condition || 'empName';
      STATE.filter.type      = adv.type || '';
      STATE.filter.status    = adv.status || '';
      STATE.page = 1;
      refreshTable(pageEl);
    });

    /* 엑셀 다운로드 — 현재 조회조건(현황·유형·검색어)으로 필터된 휴직 목록을 CSV 로 내려받는다. */
    const excel = pageEl.querySelector('[data-loa-excel]');
    if (excel) excel.addEventListener('click', () => {
      const filtered = applyFilter();
      if (!filtered.length) { window.toast && window.toast('다운로드할 휴직 이력이 없습니다.', 'warning'); return; }
      const headers = ['휴직번호','결재문서','사번','성명','부서','직위','휴직유형','휴직시작','휴직종료','기간(일)','복직예정일','현황','승인일'];
      const cell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
      const lines = [headers.map(cell).join(',')];
      filtered.forEach(r => {
        const tm = typeMeta(r.type); const sm = statusMeta(r.status);
        lines.push([
          r.id, r.approvalNo, r.empId, r.empName, r.empDept || '', r.empPosition || '',
          tm.label, r.startDate, r.endDate, r.days, addDays(r.endDate, 1),
          sm.label, r.approvedAt,
        ].map(cell).join(','));
      });
      const csv = '﻿' + lines.join('\r\n');   /* BOM — Excel 한글 깨짐 방지 */
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const statusLabel = STATE.filter.status ? statusMeta(STATE.filter.status).label : '전체';
      const fn = `휴직관리_${statusLabel}_${TODAY.replace(/-/g, '')}.csv`;
      if (App.downloadFile) App.downloadFile(fn, { blob, context: '휴직 관리' });
      else window.toast && window.toast('다운로드 모듈이 준비되지 않았습니다.', 'warning');
    });

    const pp = pageEl.querySelector('[data-loa-pagination]');
    if (pp) pp.addEventListener('click', e => {
      const b = e.target.closest('.pagination__btn');
      if (!b || b.disabled) return;
      const p = Number(b.dataset.page);
      if (Number.isFinite(p)) { STATE.page = p; refreshTable(pageEl); }
    });
    const ps = pageEl.querySelector('[data-loa-pagesize]');
    if (ps) ps.addEventListener('change', e => { STATE.pageSize = Number(e.target.value); STATE.page = 1; refreshTable(pageEl); });
  }

  /* root 위임 — 행 클릭(상세) / 성명(인사카드) / 결재문서 / 상세 버튼 */
  function ensureRootDelegation(pageEl) {
    if (pageEl.dataset.loaDelegated === '1') return;
    pageEl.dataset.loaDelegated = '1';
    pageEl.addEventListener('click', e => {
      const card = e.target.closest('[data-loa-emp-card]');
      if (card) {
        e.preventDefault();
        const emp = memberById(card.dataset.loaEmpCard);
        if (emp && window.App && App.HRInfoCard && typeof App.HRInfoCard.open === 'function') App.HRInfoCard.open(emp);
        return;
      }
      const ap = e.target.closest('[data-loa-approval]');
      if (ap) { e.preventDefault(); openApprovalDetail(ap.dataset.loaApproval); return; }
      const detail = e.target.closest('[data-loa-detail]');
      if (detail) { openDetail(detail.dataset.loaDetail); return; }
      /* 행 클릭 — 인터랙티브 요소/텍스트 선택 중 제외 */
      if (e.target.closest('button, a, input, select, textarea, label')) return;
      const sel = window.getSelection && window.getSelection();
      if (sel && sel.type === 'Range' && String(sel).length > 0) return;
      const row = e.target.closest('[data-loa-row]');
      if (row) openDetail(row.dataset.loaRow);
    });
  }

  /* =========================================================
   *  휴직 상세 모달 (읽기 전용) — 현황은 뱃지로 표시
   * ========================================================= */
  function openDetail(id) {
    const r = recById(id);
    if (!r) return;
    renderDetailModal(r);
    openModal('modal-loa-detail');
  }
  function renderDetailModal(r) {
    const tm = typeMeta(r.type);
    const sm = statusMeta(r.status);
    const member = memberById(r.empId);
    const dept = r.empDept || (member && member.dept) || '-';

    const html = `
      <div class="modal modal--lg" role="dialog" aria-modal="true">
        <div class="modal__header">
          <div>
            <div class="modal__title">휴직 상세</div>
            <div style="font-size:var(--fs-xs);color:var(--color-text-muted);margin-top:2px;">${esc(r.id)}</div>
          </div>
          <button class="modal__close" type="button" data-loa-close aria-label="닫기">✕</button>
        </div>
        <div class="modal__body">
          <!-- 휴직 정보 (read-only) -->
          <div class="fm-tbl fm-tbl--compact">
            <div class="fm-tbl__row fm-tbl__row--2">
              <div class="fm-tbl__label">대상자</div>
              <div class="fm-tbl__value">${esc(r.empName)} <span style="color:var(--color-text-muted);">(${esc(r.empId)} · ${esc(dept)})</span></div>
              <div class="fm-tbl__label">휴직 유형</div>
              <div class="fm-tbl__value"><span class="pill ${tm.pill}">${esc(tm.label)}</span> <span style="color:var(--color-text-muted);font-size:var(--fs-xs);margin-left:4px;">${esc(tm.group)}</span></div>
            </div>
            <div class="fm-tbl__row fm-tbl__row--2">
              <div class="fm-tbl__label">현황</div>
              <div class="fm-tbl__value"><span class="pill ${sm.pill}">${esc(sm.label)}</span></div>
              <div class="fm-tbl__label">휴직 기간</div>
              <div class="fm-tbl__value">${fmtYMD(r.startDate)} ~ ${fmtYMD(r.endDate)} <strong style="color:var(--color-brand-primary);margin-left:6px;">${r.days}일</strong></div>
            </div>
            <div class="fm-tbl__row fm-tbl__row--2">
              <div class="fm-tbl__label">복직(예정)일</div>
              <div class="fm-tbl__value">${fmtYMD(addDays(r.endDate, 1))}</div>
              <div class="fm-tbl__label">결재문서</div>
              <div class="fm-tbl__value"><span class="link-code">${esc(r.approvalNo)}</span></div>
            </div>
            <div class="fm-tbl__row fm-tbl__row--1">
              <div class="fm-tbl__label">승인일</div>
              <div class="fm-tbl__value">${fmtYMD(r.approvedAt)}</div>
            </div>
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn" type="button" data-loa-close>닫기</button>
        </div>
      </div>
    `;
    buildModal('modal-loa-detail', html);
    bindDetailModal();
  }

  function bindDetailModal() {
    const modal = document.getElementById('modal-loa-detail');
    if (!modal) return;
    modal.querySelectorAll('[data-loa-close]').forEach(b => b.addEventListener('click', () => closeModal('modal-loa-detail')));
  }

  /* =========================================================
   *  전자결재 상세 모달 (읽기 전용) — 결재문서 클릭 시.
   *   자재 메뉴의 전자결재 상세 모달과 동일한 레이아웃(문서 기본정보 + 결재선 단계).
   *   본 건은 승인 완료 상태이므로 결재선 3단계 모두 「결재」 로 표시.
   * ========================================================= */
  function openApprovalDetail(id) {
    const r = recById(id);
    if (!r) return;
    const tm = typeMeta(r.type);
    const member = memberById(r.empId);
    const dept = r.empDept || (member && member.dept) || '-';
    const draftAt = `${addDays(r.approvedAt, -1)} 09:00`;
    const stages = [
      { name: r.empName, when: draftAt,                  comment: `${tm.label} 신청합니다.` },
      { name: '이팀장',   when: `${r.approvedAt} 11:20`,  comment: '확인했습니다.' },
      { name: '인사팀장', when: `${r.approvedAt} 14:30`,  comment: '승인합니다.' },
    ];
    const stagesRows = stages.map((s, i) => `
      <tr>
        <td class="col-center">${i + 1}차</td>
        <td>${esc(s.name)}</td>
        <td class="col-center"><span class="pill pill--success">결재</span></td>
        <td class="col-center">${fmtDT(s.when)}</td>
        <td>${esc(s.comment)}</td>
      </tr>`).join('');

    const html = `
      <div class="modal modal--xl" style="min-width:auto;" role="dialog" aria-modal="true">
        <div class="modal__header">
          <div class="modal__title">결재 완료 · ${esc(tm.label)} 신청서 · ${esc(r.approvalNo)}</div>
          <button class="modal__close" type="button" data-loa-appr-close aria-label="닫기">✕</button>
        </div>
        <div class="modal__body" style="color:var(--color-text);">
          <!-- 문서 기본 정보 -->
          <div class="fm-tbl" style="border:1px solid var(--color-divider);border-radius:var(--radius-md);margin-bottom:18px;">
            <div class="fm-tbl__row fm-tbl__row--4">
              <div class="fm-tbl__label">문서번호</div>
              <div class="fm-tbl__value"><a class="link-code">${esc(r.approvalNo)}</a></div>
              <div class="fm-tbl__label">문서명</div>
              <div class="fm-tbl__value">${esc(tm.label)} 신청서</div>
              <div class="fm-tbl__label">상태</div>
              <div class="fm-tbl__value"><span class="pill pill--success">완료</span></div>
              <div class="fm-tbl__label">기안자</div>
              <div class="fm-tbl__value">${esc(r.empName)} <span style="color:var(--color-text-muted);">(${esc(dept)})</span></div>
            </div>
            <div class="fm-tbl__row fm-tbl__row--2">
              <div class="fm-tbl__label">제목</div>
              <div class="fm-tbl__value">${esc(r.empName)} · ${esc(tm.label)} (${fmtYMD(r.startDate)}~${fmtYMD(r.endDate)})</div>
              <div class="fm-tbl__label">기안일시</div>
              <div class="fm-tbl__value">${fmtDT(draftAt)}</div>
            </div>
          </div>

          <!-- 휴직 신청 내용 -->
          <div style="margin:18px 0 8px;"><strong>휴직 신청 내용</strong></div>
          <div class="fm-tbl" style="border:1px solid var(--color-divider);border-radius:var(--radius-md);margin-bottom:18px;">
            <div class="fm-tbl__row fm-tbl__row--3">
              <div class="fm-tbl__label">휴직 유형</div>
              <div class="fm-tbl__value">${esc(tm.label)} <span style="color:var(--color-text-muted);font-size:var(--fs-xs);margin-left:4px;">${esc(tm.group)}</span></div>
              <div class="fm-tbl__label">휴직 기간</div>
              <div class="fm-tbl__value">${fmtYMD(r.startDate)} ~ ${fmtYMD(r.endDate)}</div>
              <div class="fm-tbl__label">기간(일수)</div>
              <div class="fm-tbl__value"><strong style="color:var(--color-brand-primary);">${r.days}일</strong></div>
            </div>
          </div>

          <!-- 결재선 -->
          <div style="margin-bottom:8px;"><strong>결재선 — 단계별 상태</strong></div>
          <table class="grid" style="width:100%;">
            <thead>
              <tr>
                <th style="width:60px;">단계</th>
                <th style="width:120px;">결재자</th>
                <th style="width:90px;">결재</th>
                <th style="width:200px;">결재일시</th>
                <th>의견</th>
              </tr>
            </thead>
            <tbody>${stagesRows}</tbody>
          </table>
        </div>
        <div class="modal__footer">
          <button class="btn" type="button" data-loa-appr-close>닫기</button>
        </div>
      </div>
    `;
    buildModal('modal-loa-approval', html);
    const modal = document.getElementById('modal-loa-approval');
    modal.querySelectorAll('[data-loa-appr-close]').forEach(b => b.addEventListener('click', () => closeModal('modal-loa-approval')));
    openModal('modal-loa-approval');
  }

  /* ============ Modal 공통 ============ */
  function buildModal(id, html) {
    let modal = document.getElementById(id);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = id;
      modal.className = 'modal-backdrop';
      modal.dataset.modalId = id;
      modal.addEventListener('click', e => { if (e.target === modal) closeModal(id); });
      document.body.appendChild(modal);
    }
    modal.innerHTML = html;
    return modal;
  }
  function openModal(id) {
    const m = document.getElementById(id); if (!m) return;
    m.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(id) {
    const m = document.getElementById(id); if (!m) return;
    m.classList.remove('is-open');
    if (!document.querySelector('.modal-backdrop.is-open')) document.body.style.overflow = '';
  }

  /* =========================================================
   *  Page Init
   * ========================================================= */
  function initPage() {
    const pageEl = document.getElementById('page-hr-loa');
    if (!pageEl) return;
    pageEl.__onShow = () => {
      ensureRecords();         /* lazy build (1회) — add() 로 선등록된 이력은 보존 */
      STATE.page = 1;
      render(pageEl);
      ensureRootDelegation(pageEl);
    };
  }
  /* =========================================================
   *  Public API — 발령 관리(휴직/복직 발령)·근태 휴가 신청 등 외부 화면 연동.
   *   · list()              — 전체 휴직 레코드 (없으면 lazy build)
   *   · byStatus(status)    — 현황별 필터 ('scheduled'|'ongoing'|'returned')
   *   · typeLabel(typeCode) — 휴직 유형 코드 → 라벨
   *   · add(payload)        — 외부(근태 휴가 신청 등)에서 승인된 휴직/휴가 이력 추가
   * ========================================================= */
  function ensureRecords() {
    if (!STATE.records || !STATE.records.length) STATE.records = makeMock();
    return STATE.records;
  }

  /* 외부 화면에서 승인된 휴직/휴가 건을 본 화면 이력으로 추가.
   *   payload: { empId, empName?, empDept?, empPosition?, type, startDate, endDate, approvalNo?, approvedAt?, note? }
   *   현황은 computeStatus 로 기간 기준 자동 판정. 화면이 떠 있으면 즉시 갱신. */
  let _addSeq = 0;
  function addRecord(payload) {
    payload = payload || {};
    const startDate = payload.startDate, endDate = payload.endDate;
    if (!startDate || !endDate || !LOA_TYPES[payload.type]) return null;
    const recs = ensureRecords();
    const member = memberById(payload.empId) || {};
    _addSeq += 1;
    const approvedAt = payload.approvedAt || TODAY;
    const rec = {
      id: payload.id || `LOA-${startDate.slice(0, 4)}-${String(9000 + _addSeq).padStart(4, '0')}`,
      empId: payload.empId,
      empName: payload.empName || member.name || '',
      empDept: payload.empDept || member.dept || '',
      empPosition: payload.empPosition || member.position || '',
      type: payload.type,
      startDate, endDate, days: dayCount(startDate, endDate),
      status: 'scheduled',
      returnDate: '',
      approvalNo: payload.approvalNo || `EAP-${approvedAt.slice(0, 4)}-${String(20000 + _addSeq).padStart(5, '0')}`,
      approvedAt,
      note: payload.note || '',
    };
    rec.status = computeStatus(rec);
    rec.returnDate = rec.status === 'returned' ? addDays(endDate, 1) : '';
    recs.unshift(rec);
    /* 휴직 관리 화면이 현재 떠 있으면 테이블 즉시 갱신 */
    const pageEl = document.getElementById('page-hr-loa');
    if (pageEl && pageEl.querySelector('[data-loa-body]')) { STATE.page = 1; refreshTable(pageEl); }
    return rec;
  }

  App.HRLoa = {
    list() { return ensureRecords().slice(); },
    byStatus(status) { return ensureRecords().filter(r => r.status === status); },
    typeLabel(t) { return typeMeta(t).label; },
    add(payload) { return addRecord(payload); },
  };

  const prev = App.initPages;
  App.initPages = function () {
    if (typeof prev === 'function') prev();
    initPage();
  };
})();
