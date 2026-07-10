/* =========================================================
 * Page: 인사 > 복리후생 > 식권 정산
 *
 *  업무 흐름
 *   1) 팀원 근무조는 초기 설정 후 고정 (근태 > 근무조 설정). 매월 별도 제출 없음.
 *   2) 인사팀은 고정 근무조를 확인하고, 이를 기준으로 「다음 달분」 식권 지급량을 월별 집계.
 *   3) 전월 말일에 식권 대행업체(식권대장)에 정산 → 식권을 선지급.
 *   4) 전월에 선지급했던 인원 중 「초과근무(10H↑)조」 예정일에 연차를 쓴 경우
 *      그날 선지급된 식권금액을 이번 달 실지급액에서 차감(전월 차감).
 *
 *  식권 정책 (근무조 마스터 App.AttShifts.workHours 기준)
 *   · 1일 순근무 8H 기준 → 식권 10,000원 (1장)
 *   · 8H 를 2H 이상 초과(순근무 10H↑) → 식권 20,000원 (2장)
 *   · 총 식수 = 기본근무일×1 + 초과근무일×2,  식권금액 = 총 식수 × 10,000원
 *
 *  UI Kit 재사용
 *   .search(App.Components.searchPanel) / .toolbar / .tbl / .pill / .pagination
 *   / .page-bar / .att-kpi / .table-card / .att-tb__views(뷰 토글)
 *
 *  데이터 소스 — App.AttShifts(근무조 마스터) + App.AttStatus(임직원 명단·근무스케줄 배치).
 *  공개 API: App.HRMeal.list() / .get(id)
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  /* ============ 환경 ============ */
  const TODAY     = '2026-06-05';
  const HR_NAME   = '정혜진';
  const VENDOR    = '식권대장';
  const MEAL_UNIT = 10000;   /* 식권 1장 단가 */

  /* ============ Helper ============ */
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function won(n) { return Number(n || 0).toLocaleString(); }
  function daysInMonth(ym) { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); }
  function dowOf(ym, d) { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, d).getDay(); }
  const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];
  function ymLabel(ym) { /* YY/MM (SWADPIA §1 연·월) */ const [y, m] = ym.split('-'); return `${y.slice(2)}/${pad2(Number(m))}`; }
  function dateLabel(ds) { /* YY/MM/DD (SWADPIA §1) */ if (!ds) return '-'; const [y, m, d] = ds.split('-'); return `${y.slice(2)}/${m}/${d}`; }
  /* 성명 셀 — 임직원 관리 nameCellHTML 형식(아바타+이름). 부서는 별도 컬럼이 있어 inline 중복 표기 안 함. */
  function nameCell(name) {
    const nm = name || '';
    return `<div style="display:flex;align-items:center;gap:8px;min-width:0;">`
      + `<span class="ssw-tbl__ava" style="width:24px;height:24px;flex:0 0 auto;">${esc(nm.slice(0, 1))}</span>`
      + `<span style="font-weight:var(--fw-medium);white-space:nowrap;">${esc(nm)}</span>`
      + `</div>`;
  }
  function hashId(id) { let h = 0; const s = String(id); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function monthSeed(ym) { const [y, m] = ym.split('-').map(Number); return y * 12 + m; }

  /* ============ 식권 정책 — 근무조 → 식권 ============ */
  function parseHM(hm) { const [h, m] = String(hm || '0:00').split(':').map(Number); return (h || 0) + (m || 0) / 60; }
  /* 순근무 10H 이상(8H+2H 초과) → 초과근무조(2장) */
  function isOTShift(code) { const s = App.AttShifts && App.AttShifts.get(code); return !!s && parseHM(s.workHours) >= 10; }
  function ticketsOf(code) { return isOTShift(code) ? 2 : 1; }
  function amtOf(code) { return ticketsOf(code) * MEAL_UNIT; }
  function shiftPill(code, cnt) {
    const s = App.AttShifts && App.AttShifts.get(code);
    const ot = isOTShift(code);
    const tone = ot ? 'purple' : 'info';
    const tip = s ? `${s.start}~${s.end} · 순근무 ${s.workHours}${ot ? ' · 초과(2장)' : ' · 기본(1장)'}` : '';
    const cntTxt = (cnt === '' || cnt === null || cnt === undefined) ? '' : ` ${cnt}일`;
    const nm = s ? (s.label || code) : code;
    return `<span class="pill pill--${tone}" title="${esc(tip)}">${esc(nm)}${cntTxt}</span>`;
  }

  /* ============ 임직원 명단 ============ */
  const FALLBACK_EMPS = [
    { id: 'E1001', name: '김도윤', dept: '개발1팀', shift: 'WTD02' },
    { id: 'E1002', name: '이서준', dept: '개발1팀', shift: 'WTD03' },
    { id: 'E1003', name: '박지후', dept: '개발2팀', shift: 'WTD02' },
    { id: 'E1004', name: '최예준', dept: '가공1팀', shift: 'WTN01' },
    { id: 'E1005', name: '정시우', dept: '가공1팀', shift: 'WTD04' },
    { id: 'E1006', name: '강하준', dept: '가공2팀', shift: 'WTN01' },
    { id: 'E1007', name: '조주원', dept: '출력팀', shift: 'WTN02' },
    { id: 'E1008', name: '윤지호', dept: '출력팀', shift: 'WTD05' },
    { id: 'E1009', name: '장건우', dept: '출고팀', shift: 'WTD06' },
    { id: 'E1010', name: '임수호', dept: '인사총무팀', shift: 'WTD01' },
    { id: 'E1011', name: '한도현', dept: '회계팀', shift: 'WTD01' },
    { id: 'E1012', name: '오은우', dept: '영업팀', shift: 'WTD07' },
  ];
  function roster() {
    const A = App.AttStatus;
    if (A && typeof A.syncEmpList === 'function') { try { A.syncEmpList(); } catch (e) {} }
    if (A && A.EMP_LIST && A.EMP_LIST.length) return A.EMP_LIST.slice();
    if (App.Employees && App.Employees.length) return App.Employees.map(e => ({ id: e.id, name: e.name, dept: e.dept, shift: e.shift || 'A' }));
    return FALLBACK_EMPS.slice();
  }
  function shiftCodeForDate(emp, dateStr) {
    const A = App.AttStatus;
    if (A && typeof A.shiftCodeForDate === 'function') return A.shiftCodeForDate(emp, dateStr);
    return (emp && emp.shift) || 'A';
  }

  /* ============ 집계 — 임직원 월별 식권 ============ */
  function aggregateEmp(emp, ym) {
    const days = daysInMonth(ym);
    const byShift = {};
    let days8 = 0, days10 = 0;
    for (let d = 1; d <= days; d++) {
      const wd = dowOf(ym, d);
      if (wd === 0 || wd === 6) continue;            /* 평일 근무만 */
      const code = shiftCodeForDate(emp, `${ym}-${pad2(d)}`);
      if (!code || code === '-') continue;
      byShift[code] = (byShift[code] || 0) + 1;
      if (isOTShift(code)) days10++; else days8++;
    }
    const tickets = days8 * 1 + days10 * 2;
    return { empId: emp.id, name: emp.name, dept: emp.dept, byShift, days8, days10, totalDays: days8 + days10, tickets, amount: tickets * MEAL_UNIT };
  }
  function firstOTCode(byShift) { return Object.keys(byShift).find(c => isOTShift(c)) || null; }

  /* 전월(deductYm) 연차 사용 → 차감 내역. 초과근무(10H↑)조 예정일에 연차를 쓴 인원만 대상. */
  function buildDeducts(r) {
    if (!r.deductYm) return [];
    const out = [];
    roster().forEach(emp => {
      const agg = aggregateEmp(emp, r.deductYm);
      if (!agg.days10) return;
      const seed = hashId(emp.id);
      if (seed % 5 !== monthSeed(r.deductYm) % 5) return;   /* 결정적 — 일부 인원만 */
      const code = firstOTCode(agg.byShift) || 'C';
      /* 연차 사용일 — 해당 월의 결정적 평일 1일 */
      const days = daysInMonth(r.deductYm);
      let d = (seed % days) + 1;
      for (let k = 0; k < 7; k++) { const wd = dowOf(r.deductYm, d); if (wd !== 0 && wd !== 6) break; d = (d % days) + 1; }
      out.push({
        empId: emp.id, name: emp.name, dept: emp.dept,
        leaveDate: `${r.deductYm}-${pad2(d)}`, leaveType: '연차',
        shiftCode: code, prepaidAmt: amtOf(code), tickets: ticketsOf(code), deductAmt: amtOf(code),
      });
    });
    return out;
  }

  /* 집계 산출 여부 — 「확정」 이후에만 식권 금액이 산출된다(확정 대기 단계에선 미산출). */
  function isAggregated(r) { return r.status === 'confirmed' || r.status === 'paid'; }

  /* 라운드 1건 (lazy, 캐시)
     · 부서별 적용 근무조 — 항상 산출 (근무조 확인 단계의 조회 정보)
     · 임직원 식권 집계/차감/합계 — 「확정」 이후에만 산출 */
  function ensureComputed(r) {
    if (r._computed) return r;
    /* 1) 부서별 적용 근무조 (조회) — 항상. 근무조는 초기 설정 후 고정이므로 '제출' 개념 없음. */
    r._deptShifts = deptShiftSummary();

    /* 2) 식권 금액 집계 — 확정 이후만 */
    r._aggregated = isAggregated(r);
    if (r._aggregated) {
      const emps = roster().map(e => aggregateEmp(e, r.ym)).filter(a => a.totalDays > 0);
      const deducts = buildDeducts(r);
      const dmap = {};
      deducts.forEach(d => { dmap[d.empId] = (dmap[d.empId] || 0) + d.deductAmt; });
      emps.sort((a, b) => (a.dept || '').localeCompare(b.dept || '') || (a.name || '').localeCompare(b.name || ''));
      emps.forEach(a => { a.deduct = dmap[a.empId] || 0; a.net = a.amount - a.deduct; });
      r._emps = emps;
      r._deducts = deducts;
      r.headcount    = emps.length;
      r.basicTickets = emps.reduce((s, a) => s + a.days8, 0);          /* 1장/일 */
      r.otTickets    = emps.reduce((s, a) => s + a.days10 * 2, 0);     /* 2장/일 */
      r.sumTickets   = r.basicTickets + r.otTickets;
      r.sumAmount    = emps.reduce((s, a) => s + a.amount, 0);
      r.sumDeduct    = deducts.reduce((s, d) => s + d.deductAmt, 0);
      r.sumNet       = r.sumAmount - r.sumDeduct;
    } else {
      r._emps = []; r._deducts = [];
      r.headcount = 0; r.basicTickets = 0; r.otTickets = 0; r.sumTickets = 0;
      r.sumAmount = 0; r.sumDeduct = 0; r.sumNet = 0;
    }
    r._computed = true;
    return r;
  }

  /* ============ 상태 ============ */
  const STATUS = {
    draft:     { label: '확정 대기', pill: 'warning' },
    confirmed: { label: '확정',     pill: 'info' },
    paid:      { label: '지급완료', pill: 'success' },
  };
  const STATUS_OPTIONS = Object.keys(STATUS).map(k => ({ value: k, label: STATUS[k].label }));
  function statusPill(code) { const s = STATUS[code]; return s ? `<span class="pill pill--${s.pill}">${esc(s.label)}</span>` : `<span class="t-muted">-</span>`; }

  /* 전월 말일 (선지급일) */
  function lastDayOfPrevMonth(ym) {
    const [y, m] = ym.split('-').map(Number);
    const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
    return `${py}-${pad2(pm)}-${pad2(daysInMonth(`${py}-${pad2(pm)}`))}`;
  }
  function prevYm(ym) { const [y, m] = ym.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${pad2(m - 1)}`; }

  /* 회차 사이클 — 식권 회차는 월말 정산 업무 시점(정산월 M)에 「다음 달(M+1)분」을 미리 정산(선지급)한다.
     근무조는 초기 설정 후 고정이므로 집계는 고정 근무조에서 바로 산출(제출 대기 없음).
     · 정산월(settleYm) = M  : 정산 업무를 수행하는 달(=전월). r.deductYm 과 동일.
     · 대상월(ym)       = M+1: 고정 근무조에서 산출한 다음 달분 식권을 선지급.  → r.ym
     · 차감기준월        = M  : 정산월의 실제 연차 사용분.                         → r.deductYm */
  function settleYmOf(r) { return r.deductYm; }

  /* 부서별 적용 근무조 (조회) — 근무조는 초기 설정 후 고정이라 '제출' 단계가 없다.
     각 부서가 어떤 근무조를 쓰는지 확인용으로만 노출(경고·카운트 없음). */
  function deptShiftSummary() {
    const map = {};
    roster().forEach(e => {
      const dept = e.dept || '기타';
      const code = e.shift || 'A';
      if (!map[dept]) map[dept] = { dept, count: 0, shifts: {} };
      map[dept].count++;
      map[dept].shifts[code] = (map[dept].shifts[code] || 0) + 1;
    });
    return Object.values(map).sort((a, b) => a.dept.localeCompare(b.dept));
  }

  /* ============ 조직도 (좌측 트리) — 임직원 관리 단일 소스 재사용 ============
     정산 상세에서 부서 필터로 사용. deptId 인자 생략 시 STATE.selectedDeptId 기본 사용. */
  function HRI() { return window.App && App.HRInfoMgmt; }
  function deptTreeHTML(deptId) {
    const h = HRI();
    const id = deptId || STATE.selectedDeptId;
    return (h && h.deptTreeHTML) ? h.deptTreeHTML(id, { emps: roster() }) : '';
  }
  function deptScopeName(deptId) {
    const id = deptId || STATE.selectedDeptId;
    if (!id || id === 'C0') return '전체 부서';
    const h = HRI();
    return (h && h.deptName && h.deptName(id)) || id;
  }
  /* 집계 결과(_emps / _deducts 등) 를 선택 부서(자손 포함)로 필터 */
  function filterByDept(list, deptId) {
    const h = HRI();
    const id = deptId || STATE.selectedDeptId;
    if (!h || !h.empsInDept || !id || id === 'C0') return list.slice();
    return h.empsInDept(list, id);
  }

  function makeRound(ym, status) {
    return {
      id: `ML-${ym.replace('-', '').slice(2)}-01`,
      ym,
      vendor: VENDOR,
      deductYm: prevYm(ym),               /* 정산월(M) = 차감 기준월 */
      payDate: `${ym}-01`,                 /* 지급예정일 = 대상월 1일 */
      status,                              /* draft | confirmed | paid */
      createdBy: HR_NAME,
      createdAt: lastDayOfPrevMonth(ym),
      _computed: false,
    };
  }

  /* ============ Mock — 월별 정산 배치 ============ */
  function makeMock() {
    /* 단계 시연: 확정 대기(draft) / 확정 / 지급완료 */
    return [
      makeRound('2026-08', 'draft'),    /* 확정 대기 — 근무조 확인 후 집계 확정 */
      makeRound('2026-07', 'draft'),    /* 확정 대기 */
      makeRound('2026-06', 'paid'),
      makeRound('2026-05', 'paid'),
      makeRound('2026-04', 'paid'),
      makeRound('2026-03', 'paid'),
    ];
  }

  /* ============ STATE ============ */
  const STATE = {
    topView: 'settle',     /* 'settle'(정산 회차) | 'ot'(초과근무 식권) — 상단 뷰 토글 */
    view: 'list',          /* 'list' | 'detail' */
    rounds: [],
    filtered: [],
    page: 1, pageSize: 20,
    filter: null,
    detailId: null,
    detailTab: 'emp',      /* 'emp' | 'deduct' */
    selectedDeptId: 'C0',  /* 정산 상세 조직도 선택 부서 ('C0'=전체) */
    otYm: prevYm(TODAY.slice(0, 7)),  /* 초과근무 식권 뷰 대상월 — 기본 전월(직전 완료월) */
  };

  /* ============ 초과근무 식권 (실적) — 근태 초과근무 신청 연동 집계 ============
     식권 "정산"(계획 선지급)과 분리된 별도 집계 뷰. 근무조 계획엔 없던 당일 초과근무
     (연장/휴일근무) 승인 실적을 모아 1건당 식권 1장(1만원)으로 집계해 보여준다. */
  function approvedOtOf(empId, ym) {
    const A = App.AttStatus;
    if (!A || typeof A.appsForEmp !== 'function') return [];
    let apps;
    try { apps = A.appsForEmp(empId) || []; } catch (e) { return []; }
    return apps.filter(a => a && a.kind === 'ot' && a.status === 'approved'
      && String(a.date || '').slice(0, 7) === ym);
  }
  /* 대상월 임직원별 승인 초과근무 집계 — 연장/휴일 건수 + 추가 식수/금액(1건=1장). */
  function otAggregate(ym) {
    const out = [];
    roster().forEach(emp => {
      const apps = approvedOtOf(emp.id, ym);
      if (!apps.length) return;
      let night = 0, holiday = 0;
      apps.forEach(a => { if (a.otKind === 'holiday') holiday++; else night++; });
      const otCnt = night + holiday;
      out.push({ empId: emp.id, name: emp.name, dept: emp.dept, night, holiday, otCnt, tickets: otCnt, amount: otCnt * MEAL_UNIT });
    });
    out.sort((a, b) => (a.dept || '').localeCompare(b.dept || '') || (a.name || '').localeCompare(b.name || ''));
    return out;
  }
  function shiftYm(ym, delta) {
    let [y, m] = ym.split('-').map(Number);
    m += delta;
    while (m < 1) { m += 12; y--; }
    while (m > 12) { m -= 12; y++; }
    return `${y}-${pad2(m)}`;
  }

  /* ============ 필터 ============ */
  function applyFilter() {
    const p = STATE.filter || {};
    const kw = (p.keyword || '').trim().toLowerCase();
    const cond = p.condition || 'ym';
    const statusSel = (p.advanced && p.advanced.status) || '';
    const monthSel  = (p.advanced && p.advanced.ym) || '';
    STATE.filtered = STATE.rounds.filter(r => {
      if (statusSel && r.status !== statusSel) return false;
      if (monthSel && r.ym !== monthSel) return false;
      if (kw) {
        const t = cond === 'id' ? r.id : ymLabel(r.ym);
        if (!String(t).toLowerCase().includes(kw)) return false;
      }
      return true;
    });
    const totalPages = Math.max(1, Math.ceil(STATE.filtered.length / STATE.pageSize));
    if (STATE.page > totalPages) STATE.page = 1;
  }

  /* 상단 뷰 토글 — [정산 회차 | 초과근무 식권]. 나의 근태현황과 동일한 큰 밑줄 탭(.att-scope-tab) 스타일. */
  function topSwitchHTML() {
    return `
      <div class="att-scope-tabs" style="flex-shrink:0;" data-meal-topswitch>
        <button type="button" class="att-scope-tab ${STATE.topView === 'settle' ? 'is-active' : ''}" data-meal-topview="settle">정산 회차</button>
        <button type="button" class="att-scope-tab ${STATE.topView === 'ot' ? 'is-active' : ''}" data-meal-topview="ot">초과근무 식권</button>
      </div>`;
  }
  function switchTopView(pageEl, v) {
    if (STATE.topView === v) return;
    STATE.topView = v;
    if (v === 'ot') { renderOtView(pageEl); return; }
    renderListView(pageEl); applyFilter(); renderTable();
  }

  /* =========================================================
   *  VIEW: 목록 (월별 정산 배치)
   * ========================================================= */
  function renderListView(pageEl) {
    STATE.view = 'list';
    const C = App.Components;
    const monthOpts = STATE.rounds.map(r => ({ value: r.ym, label: ymLabel(r.ym) }));

    const searchHTML = C.searchPanel({
      showDateRange: false,
      conditions: [
        { value: 'ym', label: '대상월' },
        { value: 'id', label: '정산번호' },
      ],
      placeholder: '대상월 또는 정산번호 검색',
      cols: 2,
      advanced: [
        { name: 'ym',     label: '대상월(익월)', options: monthOpts },
        { name: 'status', label: '진행 상태',    options: STATUS_OPTIONS },
      ],
    });

    pageEl.innerHTML = `
      ${topSwitchHTML()}
      ${searchHTML}

      <div class="toolbar">
        <div class="toolbar__left">
          <span class="toolbar__count">총 <span data-count><strong>0</strong>건</span></span>
        </div>
        <div class="toolbar__right">
          <button class="btn btn--sm btn--primary" type="button" data-meal-new>${(window.Icons && window.Icons.plus) || '+'} 식권 회차 생성</button>
        </div>
      </div>

      <div class="grid-wrap" style="flex:1;min-height:0;">
        <div class="grid-scroll">
          <table class="tbl tbl--hover" style="min-width:980px;">
            <thead>
              <tr>
                <th style="width:130px;">정산번호</th>
                <th style="width:120px;text-align:center;">대상월</th>
                <th style="width:100px;text-align:center;">상태</th>
                <th style="width:90px;text-align:right;">대상 인원</th>
                <th style="width:100px;text-align:right;">총 식수</th>
                <th style="width:130px;text-align:right;">식권 금액</th>
                <th style="width:120px;text-align:right;">전월 차감</th>
                <th style="width:140px;text-align:right;">실 지급액</th>
                <th style="width:110px;text-align:center;">지급예정일</th>
                <th style="width:70px;text-align:center;"></th>
              </tr>
            </thead>
            <tbody id="meal-list-body"></tbody>
          </table>
        </div>
        <div class="pagination">
          <div class="pagination__info" id="meal-page-info"></div>
          <div class="pagination__right">
            <div class="pagination__size">
              <label>페이지당</label>
              <select class="select" id="meal-page-size">
                <option value="20">20</option><option value="50">50</option><option value="100">100</option>
              </select>
              <span>건</span>
            </div>
            <div class="pagination__list" id="meal-pagination"></div>
          </div>
        </div>
      </div>
    `;
    bindList(pageEl);
  }

  /* 검색 패널만 매 렌더마다 새 element 에 재부착(나머지 위임은 bindOnce). */
  function bindList(pageEl) {
    const sp = pageEl.querySelector('[data-search]');
    if (sp) App.Search.attach(sp, (params) => {
      STATE.filter = params; STATE.page = 1; applyFilter(); renderTable();
    });
  }

  /* pageEl 은 재생성되지 않으므로 클릭/변경 위임은 한 번만 바인딩 (목록·상세 공용). */
  function bindOnce(pageEl) {
    if (pageEl.dataset.mealBound === '1') return;
    pageEl.dataset.mealBound = '1';

    pageEl.addEventListener('click', (e) => {
      /* ----- 상단 뷰 토글 (정산 회차 / 초과근무 식권) ----- */
      const tv = e.target.closest('[data-meal-topview]');
      if (tv) { switchTopView(pageEl, tv.dataset.mealTopview); return; }

      /* ----- 초과근무 식권 뷰 ----- */
      if (e.target.closest('[data-meal-ot-prev]'))  { STATE.otYm = shiftYm(STATE.otYm, -1); renderOtView(pageEl); return; }
      if (e.target.closest('[data-meal-ot-next]'))  { STATE.otYm = shiftYm(STATE.otYm,  1); renderOtView(pageEl); return; }
      if (e.target.closest('[data-meal-ot-today]')) { STATE.otYm = TODAY.slice(0, 7);       renderOtView(pageEl); return; }
      if (e.target.closest('[data-meal-ot-excel]')) {
        const fn = `초과근무식권_${STATE.otYm}.xlsx`;
        if (App.downloadFile) App.downloadFile(fn, { context: '초과근무 식권 집계' });
        else window.toast && window.toast('엑셀 다운로드 (mock)', 'info');
        return;
      }

      /* ----- 목록 ----- */
      if (e.target.closest('[data-meal-new]')) { openCreateModal(); return; }
      const detailBtn = e.target.closest('[data-meal-detail]');
      if (detailBtn) { openDetail(detailBtn.dataset.mealDetail); return; }
      const pg = e.target.closest('#meal-pagination .pagination__btn');
      if (pg) { if (pg.disabled) return; const p = Number(pg.dataset.page); if (Number.isFinite(p)) { STATE.page = p; renderTable(); } return; }

      /* ----- 상세 ----- */
      if (e.target.closest('[data-meal-back]')) { backToList(); return; }
      /* 타이틀 옆 [정보] 버튼 → 정산 회차 정보 · 식권 정책 모달 */
      if (e.target.closest('[data-meal-info]')) {
        const r = STATE.rounds.find(x => x.id === STATE.detailId);
        if (r) openInfoModal(r);
        return;
      }
      const tab = e.target.closest('[data-meal-tab]');
      if (tab) { STATE.detailTab = tab.dataset.mealTab; const r = STATE.rounds.find(x => x.id === STATE.detailId); if (r) { setActiveTab(pageEl); renderDetailTab(r); } return; }
      /* 조직도 트리 노드 선택 → 표만 필터 (KPI 는 회차 전체 유지) */
      const treeNode = e.target.closest('[data-meal-tree] .tree__node[data-id]');
      if (treeNode) {
        STATE.selectedDeptId = treeNode.dataset.id;
        const tree = pageEl.querySelector('[data-meal-tree]');
        if (tree) tree.innerHTML = deptTreeHTML();   /* 단일 소스 재렌더 — is-selected 갱신 */
        const r = STATE.rounds.find(x => x.id === STATE.detailId);
        if (r) renderDetailTab(r);
        return;
      }
      if (e.target.closest('[data-meal-goto-shift]')) {
        if (App.Tabs && App.Tabs.open) App.Tabs.open({ id: 'att-shift-status', label: '근무스케줄 현황', page: 'page-att-shift-status' });
        else window.toast && window.toast('근무스케줄 현황 화면을 열 수 없습니다.', 'warning');
        return;
      }
      if (e.target.closest('[data-meal-excel-detail]')) {
        const r = STATE.rounds.find(x => x.id === STATE.detailId); if (!r) return;
        const fn = `식권정산_${r.ym}_${VENDOR}_명세.xlsx`;
        if (App.downloadFile) App.downloadFile(fn, { context: '식권대장 정산 명세' });
        else window.toast && window.toast('엑셀 다운로드 (mock)', 'info');
        return;
      }
      const adv = e.target.closest('[data-meal-advance]');
      if (adv) {
        const r = STATE.rounds.find(x => x.id === STATE.detailId); if (!r) return;
        const to = adv.dataset.mealAdvance;
        r.status = to;
        r._computed = false;          /* 확정 시 고정 근무조에서 식권 금액 재집계 */
        ensureComputed(r);
        const msg = to === 'confirmed'
          ? `${ymLabel(r.ym)} 식권 집계를 확정했습니다. (총 ${won(r.sumTickets)}장 · ${won(r.sumNet)}원)`
          : `${VENDOR} 정산·선지급 완료 처리했습니다.`;
        renderDetailView(pageEl);
        window.toast && window.toast(msg, 'success');
        return;
      }

      /* ----- 목록 행 클릭 → 상세 (인터랙티브 요소·드래그 선택 제외) ----- */
      if (STATE.view !== 'list') return;
      if (e.target.closest('button, a, input, select, textarea, label')) return;
      const sel = window.getSelection && window.getSelection();
      if (sel && sel.type === 'Range' && String(sel).length > 0) return;
      const row = e.target.closest('[data-meal-row]');
      if (row) openDetail(row.dataset.mealRow);
    });

    pageEl.addEventListener('change', (e) => {
      const sz = e.target.closest('#meal-page-size');
      if (sz) { STATE.pageSize = Number(sz.value); STATE.page = 1; renderTable(); }
    });
  }

  /* 탭 버튼 활성 표시만 갱신 (전체 재렌더 없이) */
  function setActiveTab(pageEl) {
    pageEl.querySelectorAll('[data-meal-tab]').forEach(b => b.classList.toggle('is-active', b.dataset.mealTab === STATE.detailTab));
  }

  function renderTable() {
    const pageEl = document.getElementById('page-hr-meal');
    if (!pageEl) return;
    const total = STATE.filtered.length;
    const start = (STATE.page - 1) * STATE.pageSize;
    const rows = STATE.filtered.slice(start, start + STATE.pageSize);

    const body = $('#meal-list-body', pageEl); if (!body) return;
    body.innerHTML = !rows.length
      ? `<tr><td colspan="10" style="text-align:center;color:var(--color-text-muted);padding:32px 0;">조건에 해당하는 정산 회차가 없습니다.</td></tr>`
      : rows.map(r => {
          ensureComputed(r);
          const pre = '<span class="t-muted" style="font-size:var(--fs-xs);">집계 전</span>';   /* 확정 전 — 미산출 */
          const ag = r._aggregated;
          return `
            <tr class="is-clickable" data-meal-row="${esc(r.id)}">
              <td style="white-space:nowrap;font-weight:var(--fw-medium);">${esc(r.id)}</td>
              <td style="text-align:center;white-space:nowrap;">${esc(ymLabel(r.ym))}</td>
              <td style="text-align:center;white-space:nowrap;">${statusPill(r.status)}</td>
              <td style="text-align:right;">${ag ? won(r.headcount) + '명' : pre}</td>
              <td style="text-align:right;">${ag ? won(r.sumTickets) + '장' : pre}</td>
              <td style="text-align:right;">${ag ? won(r.sumAmount) + '원' : pre}</td>
              <td style="text-align:right;color:${r.sumDeduct ? 'var(--color-danger)' : 'var(--color-text-muted)'};">${ag ? (r.sumDeduct ? '−' + won(r.sumDeduct) + '원' : '0원') : pre}</td>
              <td style="text-align:right;font-weight:var(--fw-bold);color:var(--color-brand-primary);">${ag ? won(r.sumNet) + '원' : pre}</td>
              <td style="text-align:center;white-space:nowrap;">${esc(dateLabel(r.payDate))}</td>
              <td style="text-align:center;"><button class="btn btn--xs" type="button" data-meal-detail="${esc(r.id)}">상세</button></td>
            </tr>`;
        }).join('');

    const cnt = pageEl.querySelector('[data-count]');
    if (cnt) cnt.innerHTML = `<strong>${total.toLocaleString()}</strong>건`;

    const size = STATE.pageSize;
    const totalPages = Math.max(1, Math.ceil(total / size));
    if (STATE.page > totalPages) STATE.page = totalPages;
    $('#meal-page-info', pageEl).textContent = total === 0 ? '0건' : `${start + 1}-${Math.min(start + size, total)} / ${total}건`;

    const btns = [];
    btns.push(`<button class="pagination__btn" data-page="1" ${STATE.page === 1 ? 'disabled' : ''}>«</button>`);
    btns.push(`<button class="pagination__btn" data-page="${Math.max(1, STATE.page - 1)}" ${STATE.page === 1 ? 'disabled' : ''}>‹</button>`);
    let s = Math.max(1, STATE.page - 5), e = Math.min(totalPages, s + 9);
    if (e - s < 9) s = Math.max(1, e - 9);
    for (let i = s; i <= e; i++) btns.push(`<button class="pagination__btn${i === STATE.page ? ' is-active' : ''}" data-page="${i}">${i}</button>`);
    btns.push(`<button class="pagination__btn" data-page="${Math.min(totalPages, STATE.page + 1)}" ${STATE.page === totalPages ? 'disabled' : ''}>›</button>`);
    btns.push(`<button class="pagination__btn" data-page="${totalPages}" ${STATE.page === totalPages ? 'disabled' : ''}>»</button>`);
    $('#meal-pagination', pageEl).innerHTML = btns.join('');
    const sizeSel = $('#meal-page-size', pageEl); if (sizeSel) sizeSel.value = String(STATE.pageSize);
  }

  /* =========================================================
   *  VIEW: 상세 (월 1건)
   * ========================================================= */
  function openDetail(id) {
    STATE.detailId = id;
    STATE.detailTab = 'emp';
    STATE.selectedDeptId = 'C0';
    renderDetailView(document.getElementById('page-hr-meal'));
  }
  function backToList() {
    const pageEl = document.getElementById('page-hr-meal');
    renderListView(pageEl); applyFilter(); renderTable();
  }

  /* =========================================================
   *  VIEW: 초과근무 식권 (실적 집계) — 정산과 분리된 별도 뷰
   * ========================================================= */
  function renderOtView(pageEl) {
    STATE.view = 'ot';
    const ym = STATE.otYm;

    pageEl.innerHTML = `
      ${topSwitchHTML()}
      <div class="toolbar" style="flex-shrink:0;">
        <div class="toolbar__left">
          <div class="att-tb__title" style="font-size:var(--fs-lg);">${esc(ymLabel(ym))}</div>
          <div class="att-tb__nav">
            <button type="button" data-meal-ot-prev aria-label="이전 달">‹</button>
            <button type="button" data-meal-ot-today>이번 달</button>
            <button type="button" data-meal-ot-next aria-label="다음 달">›</button>
          </div>
        </div>
      </div>
      <div style="flex:1;min-height:0;display:flex;flex-direction:column;padding:0 20px 20px;">
        <div id="meal-ot-table" style="flex:1;min-height:0;display:flex;flex-direction:column;border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden;"></div>
      </div>
    `;
    renderOtTable();
  }

  function renderOtTable() {
    const host = document.getElementById('meal-ot-table');
    if (!host) return;
    const ym = STATE.otYm;
    const list = otAggregate(ym);   /* 초과근무 발생자만 — 조직도 필터 없이 전체 */
    const n = list.length;
    const sNight = list.reduce((s, a) => s + a.night, 0);
    const sHol   = list.reduce((s, a) => s + a.holiday, 0);
    const sOt    = list.reduce((s, a) => s + a.otCnt, 0);
    const sTk    = list.reduce((s, a) => s + a.tickets, 0);
    const sAmt   = list.reduce((s, a) => s + a.amount, 0);
    const dl = (window.Icons && window.Icons.download) || '';

    const rows = list.map((a, i) => `
        <tr>
          <td style="text-align:right;color:var(--color-text-muted);">${n - i}</td>
          <td style="white-space:nowrap;">${esc(a.empId)}</td>
          <td style="white-space:nowrap;">${nameCell(a.name)}</td>
          <td style="white-space:nowrap;">${esc(a.dept || '-')}</td>
          <td style="text-align:right;">${a.night ? won(a.night) + '건' : '<span class="t-muted">0</span>'}</td>
          <td style="text-align:right;">${a.holiday ? won(a.holiday) + '건' : '<span class="t-muted">0</span>'}</td>
          <td style="text-align:right;font-weight:var(--fw-medium);">${won(a.otCnt)}건</td>
          <td style="text-align:right;font-weight:var(--fw-medium);">${won(a.tickets)}장</td>
          <td style="text-align:right;font-weight:var(--fw-bold);color:var(--color-brand-primary);">${won(a.amount)}원</td>
        </tr>`).join('');
    const body = rows || `<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--color-text-muted);">해당 월 승인된 초과근무가 없습니다.</td></tr>`;

    /* 합계 행 — grid-scroll 하단 고정(sticky bottom).
       .tbl 은 border-collapse:collapse 라 sticky 셀에서 보더가 비치고 겹쳐 굵어 보인다.
       → 이 표만 separate 로 바꾸고(아래 table inline), 합계 셀은 보더 없이 box-shadow 로
         상단 1px 구분선만 그린다(최하단 도달 시 마지막 행 보더와 같은 픽셀에 겹쳐 두꺼워지지 않음). */
    const fs = 'position:sticky;bottom:0;background:var(--color-surface-alt);font-weight:var(--fw-bold);border:0;box-shadow:0 -1px 0 0 var(--color-divider);z-index:1;';
    const foot = list.length ? `
      <tr>
        <td colspan="4" style="${fs}text-align:right;">전체 합계</td>
        <td style="${fs}text-align:right;">${won(sNight)}건</td>
        <td style="${fs}text-align:right;">${won(sHol)}건</td>
        <td style="${fs}text-align:right;">${won(sOt)}건</td>
        <td style="${fs}text-align:right;">${won(sTk)}장</td>
        <td style="${fs}text-align:right;color:var(--color-brand-primary);">${won(sAmt)}원</td>
      </tr>` : '';

    host.innerHTML = `
      <div class="toolbar" style="flex-shrink:0;">
        <div class="toolbar__left">
          <strong>임직원별 초과근무 식권</strong>
          <span class="toolbar__count" style="margin-left:10px;">총 <strong>${won(sOt)}</strong>건 · 추가 ${won(sTk)}장</span>
        </div>
        <div class="toolbar__right">
          <button class="btn btn--sm" type="button" data-meal-ot-excel>${dl} 엑셀</button>
        </div>
      </div>
      <div class="grid-wrap" style="flex:1;min-height:0;">
        <div class="grid-scroll">
          <table class="tbl tbl--hover" style="min-width:880px;border-collapse:separate;border-spacing:0;">
            <thead>
              <tr>
                <th style="width:50px;text-align:right;">No</th>
                <th style="width:90px;">사번</th>
                <th style="width:90px;">이름</th>
                <th style="width:120px;">부서</th>
                <th style="width:100px;text-align:right;">연장근무</th>
                <th style="width:100px;text-align:right;">휴일근무</th>
                <th style="width:100px;text-align:right;">초과근무 계</th>
                <th style="width:100px;text-align:right;">추가 식수</th>
                <th style="width:130px;text-align:right;">추가 금액</th>
              </tr>
            </thead>
            <tbody>${body}</tbody>
            ${foot ? `<tfoot>${foot}</tfoot>` : ''}
          </table>
        </div>
      </div>`;
  }

  function kpiCard(label, value, suffix, tone) {
    return `<div class="att-kpi__card${tone ? ' att-kpi__card--' + tone : ''}">
      <div class="att-kpi__label">${esc(label)}</div>
      <div class="att-kpi__value">${value}<small>${esc(suffix || '')}</small></div>
    </div>`;
  }

  /* 진행 단계 스텝퍼 — 급여 정산 상세와 동일한 .prs-phases 스타일.
     1 회차 생성 · 2 근무조 스케줄 검토 · 3 정산 검토 · 4 정산 완료 */
  const STEP_LABELS = ['회차 생성', '근무조 확인', '정산 검토', '정산 완료'];
  /* 스텝퍼 내부 아이템만 반환 — 페이지바 중앙(.prs-phases--inline) 호스트에 인라인 삽입. */
  function renderStepperItems(r) {
    /* 활성 단계(0-base) — draft=근무조 검토(1), confirmed=정산 검토(2), paid=정산 완료(3). 회차 생성(0)은 항상 완료. */
    const activeIdx = r.status === 'draft' ? 1 : r.status === 'confirmed' ? 2 : 3;
    return STEP_LABELS.map((label, i) => {
      let cls = '';
      if (i < activeIdx) cls = 'is-done';
      if (i === activeIdx) cls = (cls ? cls + ' ' : '') + 'is-active';
      const num = i < activeIdx ? '✓' : (i + 1);
      return `<div class="prs-phase ${cls}" style="cursor:default;"><span class="prs-phase__num">${num}</span><span class="prs-phase__label">${esc(label)}</span></div>`;
    }).join('<span class="prs-phase__sep" aria-hidden="true">→</span>');
  }

  function renderDetailView(pageEl) {
    const r = STATE.rounds.find(x => x.id === STATE.detailId);
    if (!r) { backToList(); return; }
    STATE.view = 'detail';
    ensureComputed(r);

    const settleYm = settleYmOf(r);
    const aggregated = r._aggregated;

    /* page-bar 우측 — 단계 처리 버튼 + (정산 완료 후) 엑셀 다운로드 */
    const dl = (window.Icons && window.Icons.download) || '';
    let actBtn = '';
    if (r.status === 'draft') {
      actBtn = `<button class="btn btn--sm btn--primary" type="button" data-meal-advance="confirmed" title="고정 근무조에서 식권 금액을 집계해 확정합니다">집계 확정</button>`;
    } else if (r.status === 'confirmed') {
      actBtn = `<button class="btn btn--sm btn--primary" type="button" data-meal-advance="paid" title="정산을 확정하고 완료 처리합니다">정산 확정 →</button>`;
    } else if (r.status === 'paid') {
      /* 정산 확정(완료) 이후에만 식권대장 명세 엑셀 다운로드 노출 */
      actBtn = `<button class="btn btn--sm" type="button" data-meal-excel-detail>${dl} 식권대장 명세 엑셀</button>`;
    }

    /* 본문 — 단계별 분기 */
    let bodyHTML;
    if (!aggregated) {
      /* 확정 대기(draft) — 부서별 적용 근무조 확인(조회). 근무조는 고정이라 '제출' 개념 없음. */
      const callout = `<div style="flex-shrink:0;margin:0 0 12px;font-size:var(--fs-sm);color:var(--color-text-sub);">
             부서별 적용 근무조를 확인하세요. 근무조는 초기 설정 후 고정이며, 상단 <strong style="color:var(--color-text);">[집계 확정]</strong> 시 이 근무조에서 식권 금액이 집계됩니다.
           </div>`;
      const ds = r._deptShifts || [];
      const subRows = ds.map((s, i) => {
        const pills = Object.keys(s.shifts).sort()
          .map(c => `${shiftPill(c, '')} <span class="t-muted" style="font-size:var(--fs-xs);">${s.shifts[c]}명</span>`).join(' &nbsp; ');
        return `
        <tr>
          <td style="text-align:right;color:var(--color-text-muted);">${ds.length - i}</td>
          <td style="white-space:nowrap;font-weight:var(--fw-medium);">${esc(s.dept)}</td>
          <td>${pills || '<span class="t-muted">-</span>'}</td>
          <td style="text-align:right;">${won(s.count)}명</td>
        </tr>`;
      }).join('');
      bodyHTML = `
        <div style="height:100%;display:flex;flex-direction:column;">
          ${callout}
          <div style="flex:1;min-height:0;display:flex;flex-direction:column;border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden;">
            <div class="toolbar" style="flex-shrink:0;">
              <div class="toolbar__left"><strong>부서별 적용 근무조</strong> <span class="t-muted" style="font-size:var(--fs-xs);margin-left:8px;">${esc(ymLabel(r.ym))} 적용 기준 · ${ds.length}개 부서</span></div>
              <div class="toolbar__right"><button class="btn btn--sm" type="button" data-meal-goto-shift>근무스케줄 현황 보기</button></div>
            </div>
            <div class="grid-wrap" style="flex:1;min-height:0;">
              <div class="grid-scroll">
                <table class="tbl tbl--hover" style="min-width:480px;">
                  <thead><tr>
                    <th style="width:50px;text-align:right;">No</th>
                    <th style="width:140px;">부서</th>
                    <th>적용 근무조</th>
                    <th style="width:90px;text-align:right;">인원</th>
                  </tr></thead>
                  <tbody>${subRows}</tbody>
                </table>
              </div>
            </div>
          </div>
        </div>`;
    } else {
      /* 확정/지급완료 — KPI + 탭 + 조직도 split */
      const kpi = `
        <div class="att-kpi" style="margin:0 0 12px;">
          ${kpiCard('대상 인원', won(r.headcount), '명', 'brand')}
          ${kpiCard('기본근무 식수', won(r.basicTickets), '장 (1만)', '')}
          ${kpiCard('초과근무 식수', won(r.otTickets), '장 (2만)', 'warn')}
          ${kpiCard('총 식수', won(r.sumTickets), '장', '')}
          ${kpiCard('식권 총액', won(r.sumAmount), '원', '')}
          ${kpiCard('전월 차감', r.sumDeduct ? '−' + won(r.sumDeduct) : '0', '원', r.sumDeduct ? 'danger' : 'muted')}
          ${kpiCard('실 지급액', won(r.sumNet), '원', 'brand')}
        </div>`;
      const tabs = `
        <div class="att-tb__views" style="margin:8px 0 10px;">
          <button type="button" data-meal-tab="emp" class="${STATE.detailTab === 'emp' ? 'is-active' : ''}">임직원별 집계 (${r.headcount})</button>
          <button type="button" data-meal-tab="deduct" class="${STATE.detailTab === 'deduct' ? 'is-active' : ''}">전월 차감 내역 (${r._deducts.length})</button>
        </div>`;
      bodyHTML = `
        <div style="flex-shrink:0;">${kpi}${tabs}</div>
        <div style="flex:1;min-height:0;border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden;">
          <div class="split" style="--split-left:240px;height:100%;">
            <aside class="split__left">
              <div class="split__head"><h3>조직도</h3></div>
              <div class="split__body" style="padding:0;display:flex;flex-direction:column;min-height:0;">
                <ul class="tree tree--selectable" data-meal-tree style="flex:1;overflow:auto;padding:8px 10px;margin:0;">${deptTreeHTML()}</ul>
              </div>
            </aside>
            <section class="split__right" style="display:flex;flex-direction:column;min-height:0;">
              <div id="meal-detail-tab" style="flex:1;min-height:0;display:flex;flex-direction:column;"></div>
            </section>
          </div>
        </div>`;
    }

    const BACK_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>';
    pageEl.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;min-height:0;">
        <div class="page-bar page-bar--3col">
          <div class="prs-page-bar__left">
            <button class="page-bar__back" type="button" data-meal-back>${BACK_SVG} 목록</button>
            <div class="page-bar__divider"></div>
            <div class="page-bar__title">${esc(ymLabel(r.ym))} 식권 정산</div>
            <button class="btn btn--sm prs-title-more" type="button" data-meal-info title="정산 회차 정보 · 식권 정책">정보</button>
            <span>${statusPill(r.status)}</span>
          </div>
          <div class="prs-page-bar__center prs-phases prs-phases--inline">
            ${renderStepperItems(r)}
          </div>
          <div class="prs-page-bar__right">
            ${actBtn}
          </div>
        </div>
        <div style="flex:1;min-height:0;display:flex;flex-direction:column;padding:16px 20px 20px;">
          <div style="flex:1;min-height:0;display:flex;flex-direction:column;">
            ${bodyHTML}
          </div>
        </div>
      </div>
    `;
    if (aggregated) renderDetailTab(r);
  }

  function renderDetailTab(r) {
    const host = document.getElementById('meal-detail-tab');
    if (!host) return;
    host.innerHTML = STATE.detailTab === 'deduct' ? renderDeductTable(r) : renderEmpTable(r);
  }

  /* 표 캡션(고정) + 스크롤 그리드(grid-wrap → sticky 헤더 + 스크롤) 구조. */
  function gridShell(capHTML, theadHTML, bodyHTML, footHTML, minWidth) {
    return `
      <div class="toolbar" style="flex-shrink:0;">
        <div class="toolbar__left">${capHTML}</div>
      </div>
      <div class="grid-wrap" style="flex:1;min-height:0;">
        <div class="grid-scroll">
          <table class="tbl tbl--hover" style="min-width:${minWidth}px;">
            <thead>${theadHTML}</thead>
            <tbody>${bodyHTML}</tbody>
            ${footHTML ? `<tfoot>${footHTML}</tfoot>` : ''}
          </table>
        </div>
      </div>`;
  }

  function renderEmpTable(r) {
    const emps = filterByDept(r._emps);
    const n = emps.length;
    const sumDays8  = emps.reduce((s, a) => s + a.days8, 0);
    const sumDays10 = emps.reduce((s, a) => s + a.days10, 0);
    const sumTk     = emps.reduce((s, a) => s + a.tickets, 0);
    const sumAmt    = emps.reduce((s, a) => s + a.amount, 0);
    const sumDed    = emps.reduce((s, a) => s + a.deduct, 0);
    const sumNet    = emps.reduce((s, a) => s + a.net, 0);

    const rows = emps.map((a, i) => {
      const shiftCells = Object.keys(a.byShift).sort((x, y) => a.byShift[y] - a.byShift[x])
        .map(c => shiftPill(c, a.byShift[c])).join(' ');
      return `
        <tr>
          <td style="text-align:right;color:var(--color-text-muted);">${n - i}</td>
          <td style="white-space:nowrap;">${esc(a.empId)}</td>
          <td style="white-space:nowrap;">${nameCell(a.name)}</td>
          <td style="white-space:nowrap;">${esc(a.dept || '-')}</td>
          <td>${shiftCells || '<span class="t-muted">-</span>'}</td>
          <td style="text-align:right;">${won(a.days8)}일</td>
          <td style="text-align:right;color:${a.days10 ? 'var(--color-warning)' : 'var(--color-text-muted)'};">${won(a.days10)}일</td>
          <td style="text-align:right;font-weight:var(--fw-medium);">${won(a.tickets)}장</td>
          <td style="text-align:right;">${won(a.amount)}원</td>
          <td style="text-align:right;color:${a.deduct ? 'var(--color-danger)' : 'var(--color-text-muted)'};">${a.deduct ? '−' + won(a.deduct) : '0'}원</td>
          <td style="text-align:right;font-weight:var(--fw-bold);color:var(--color-brand-primary);">${won(a.net)}원</td>
        </tr>`;
    }).join('');

    const cap = `<strong>임직원별 식권 집계</strong>
      <span class="t-muted" style="font-size:var(--fs-xs);margin-left:8px;">${esc(deptScopeName())} · ${n}명 · ${esc(ymLabel(r.ym))} 근무조 계획 기준</span>`;
    const thead = `
      <tr>
        <th style="width:50px;text-align:right;">No</th>
        <th style="width:90px;">사번</th>
        <th style="width:90px;">이름</th>
        <th style="width:110px;">부서</th>
        <th>근무조 구성 (근무일수)</th>
        <th style="width:90px;text-align:right;">기본근무</th>
        <th style="width:90px;text-align:right;">초과근무</th>
        <th style="width:90px;text-align:right;">총 식수</th>
        <th style="width:120px;text-align:right;">식권 금액</th>
        <th style="width:110px;text-align:right;">전월 차감</th>
        <th style="width:130px;text-align:right;">실 지급액</th>
      </tr>`;
    const body = rows || `<tr><td colspan="11" style="text-align:center;padding:30px;color:var(--color-text-muted);">집계 대상 임직원이 없습니다.</td></tr>`;
    const foot = `
      <tr style="font-weight:var(--fw-bold);background:var(--color-surface-alt);">
        <td colspan="5" style="text-align:right;">${STATE.selectedDeptId === 'C0' ? '전체 합계' : '부서 소계'}</td>
        <td style="text-align:right;">${won(sumDays8)}일</td>
        <td style="text-align:right;">${won(sumDays10)}일</td>
        <td style="text-align:right;">${won(sumTk)}장</td>
        <td style="text-align:right;">${won(sumAmt)}원</td>
        <td style="text-align:right;color:${sumDed ? 'var(--color-danger)' : 'inherit'};">${sumDed ? '−' + won(sumDed) : '0'}원</td>
        <td style="text-align:right;color:var(--color-brand-primary);">${won(sumNet)}원</td>
      </tr>`;
    return gridShell(cap, thead, body, foot, 1080);
  }

  function renderDeductTable(r) {
    const ds = filterByDept(r._deducts);
    const sumDed = ds.reduce((s, d) => s + d.deductAmt, 0);
    const rows = ds.map((d, i) => `
        <tr>
          <td style="text-align:right;color:var(--color-text-muted);">${ds.length - i}</td>
          <td style="white-space:nowrap;">${esc(d.empId)}</td>
          <td style="white-space:nowrap;">${nameCell(d.name)}</td>
          <td style="white-space:nowrap;">${esc(d.dept || '-')}</td>
          <td style="text-align:center;white-space:nowrap;">${esc(dateLabel(d.leaveDate))}</td>
          <td style="text-align:center;"><span class="pill pill--info">${esc(d.leaveType)}</span></td>
          <td style="text-align:center;">${shiftPill(d.shiftCode, '')}</td>
          <td style="text-align:right;">${won(d.prepaidAmt)}원</td>
          <td style="text-align:right;font-weight:var(--fw-bold);color:var(--color-danger);">−${won(d.deductAmt)}원</td>
        </tr>`).join('');

    const cap = `<strong>전월 차감 내역</strong>
      <span class="t-muted" style="font-size:var(--fs-xs);margin-left:8px;">${esc(deptScopeName())} · ${ds.length}건 · ${esc(ymLabel(r.deductYm))} 초과근무조 예정일 연차 사용분</span>`;
    const thead = `
      <tr>
        <th style="width:50px;text-align:right;">No</th>
        <th style="width:90px;">사번</th>
        <th style="width:90px;">이름</th>
        <th style="width:120px;">부서</th>
        <th style="width:120px;text-align:center;">연차 사용일</th>
        <th style="width:90px;text-align:center;">구분</th>
        <th style="width:120px;text-align:center;">예정 근무조</th>
        <th style="width:130px;text-align:right;">선지급 식권</th>
        <th style="width:130px;text-align:right;">차감 금액</th>
      </tr>`;
    const body = rows || `<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--color-text-muted);">전월 차감 대상이 없습니다.</td></tr>`;
    const foot = ds.length ? `
      <tr style="font-weight:var(--fw-bold);background:var(--color-surface-alt);">
        <td colspan="8" style="text-align:right;">차감 합계</td>
        <td style="text-align:right;color:var(--color-danger);">−${won(sumDed)}원</td>
      </tr>` : '';
    return gridShell(cap, thead, body, foot, 820);
  }

  /* =========================================================
   *  회차 생성 모달
   * ========================================================= */
  function createMonthOptions() {
    const existing = new Set(STATE.rounds.map(r => r.ym));
    const opts = [];
    let [y, m] = TODAY.split('-').map(Number);
    for (let k = 0; k < 14 && opts.length < 6; k++) {
      m++; if (m > 12) { m = 1; y++; }
      const ym = `${y}-${pad2(m)}`;
      if (!existing.has(ym)) opts.push(ym);
    }
    return opts;
  }
  function ensureCreateModal() {
    let m = document.getElementById('modal-meal-new');
    if (m) return m;
    m = document.createElement('div');
    m.className = 'modal-backdrop';
    m.id = 'modal-meal-new';
    m.innerHTML = `
      <div class="modal" style="width:480px;">
        <div class="modal__header">
          <div class="modal__title">식권 회차 생성</div>
          <button class="modal__close" type="button" data-meal-modal-close aria-label="닫기">✕</button>
        </div>
        <div class="modal__body">
          <div class="fm-tbl">
            <div class="fm-tbl__row fm-tbl__row--1">
              <div class="fm-tbl__label">대상월(익월)<em style="color:var(--color-danger);">*</em></div>
              <div class="fm-tbl__value"><select class="select" data-meal-new-ym style="width:100%;"></select></div>
            </div>
          </div>
          <p style="margin:14px 2px 0;font-size:var(--fs-sm);line-height:1.6;color:var(--color-text-sub);">생성 후 부서별 적용 근무조를 확인하고, <strong>[집계 확정]</strong> 시 고정 근무조에서 식권 금액이 산출됩니다.</p>
        </div>
        <div class="modal__footer">
          <button class="btn btn--sm" type="button" data-meal-modal-close>취소</button>
          <button class="btn btn--sm btn--primary" type="button" data-meal-new-confirm>생성</button>
        </div>
      </div>`;
    document.body.appendChild(m);
    m.addEventListener('click', (e) => {
      if (e.target === m || e.target.closest('[data-meal-modal-close]')) { closeCreateModal(); return; }
      if (e.target.closest('[data-meal-new-confirm]')) { confirmCreate(); return; }
    });
    return m;
  }
  function openCreateModal() {
    const m = ensureCreateModal();
    const opts = createMonthOptions();
    const sel = m.querySelector('[data-meal-new-ym]');
    sel.innerHTML = opts.length
      ? opts.map(ym => `<option value="${ym}">${esc(ymLabel(ym))}</option>`).join('')
      : `<option value="">생성 가능한 대상월이 없습니다</option>`;
    m.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeCreateModal() {
    const m = document.getElementById('modal-meal-new');
    if (m) { m.classList.remove('is-open'); document.body.style.overflow = ''; }
  }
  function confirmCreate() {
    const m = document.getElementById('modal-meal-new'); if (!m) return;
    const ym = m.querySelector('[data-meal-new-ym]').value;
    if (!ym) { window.toast && window.toast('대상월을 선택하세요.', 'warning'); return; }
    if (STATE.rounds.find(r => r.ym === ym)) { window.toast && window.toast('이미 존재하는 대상월입니다.', 'warning'); return; }
    const r = makeRound(ym, 'draft');
    STATE.rounds.push(r);
    STATE.rounds.sort((a, b) => (a.ym < b.ym ? 1 : a.ym > b.ym ? -1 : 0));   /* 대상월 내림차순 */
    closeCreateModal();
    window.toast && window.toast(`${ymLabel(ym)} 식권 회차를 생성했습니다.`, 'success');
    openDetail(r.id);   /* 생성 직후 근무조 확인 화면으로 진입 */
  }

  /* =========================================================
   *  정산 회차 정보 · 식권 정책 모달 (타이틀 옆 [정보] 버튼)
   * ========================================================= */
  function openInfoModal(r) {
    const settleYm = settleYmOf(r);
    let m = document.getElementById('modal-meal-info');
    if (!m) {
      m = document.createElement('div');
      m.className = 'modal-backdrop';
      m.id = 'modal-meal-info';
      document.body.appendChild(m);
      m.addEventListener('click', (e) => {
        if (e.target === m || e.target.closest('[data-meal-info-close]')) {
          m.classList.remove('is-open'); document.body.style.overflow = '';
        }
      });
    }
    m.innerHTML = `
      <div class="modal" style="width:520px;">
        <div class="modal__header">
          <div class="modal__title">정산 회차 정보 · 식권 정책</div>
          <button class="modal__close" type="button" data-meal-info-close aria-label="닫기">✕</button>
        </div>
        <div class="modal__body">
          <div class="po-info po-info--rows po-info--bare">
            <span class="po-info__pill"><span class="po-info__pill-label">정산 회차</span><span class="po-info__pill-value"><strong>${esc(ymLabel(settleYm))}</strong> 말 정산 → 익월 <strong>${esc(ymLabel(r.ym))}</strong>분 선지급</span></span>
            <span class="po-info__pill"><span class="po-info__pill-label">지급예정일</span><span class="po-info__pill-value"><strong>${esc(dateLabel(r.payDate))}</strong> · 대상월 1일</span></span>
            <span class="po-info__pill"><span class="po-info__pill-label">근무조 연동</span><span class="po-info__pill-value">초기 설정 후 고정된 근무조에서 바로 집계 → <strong>[집계 확정]</strong></span></span>
            <span class="po-info__pill"><span class="po-info__pill-label">차감 기준</span><span class="po-info__pill-value"><strong>${esc(ymLabel(settleYm))}</strong> 초과근무조 예정일 연차 사용분</span></span>
            <span class="po-info__pill"><span class="po-info__pill-label">식권 정책</span><span class="po-info__pill-value">8H <strong>10,000원</strong>(1장) · 10H↑ <strong>20,000원</strong>(2장)</span></span>
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--sm" type="button" data-meal-info-close>닫기</button>
        </div>
      </div>`;
    m.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  /* =========================================================
   *  Public API
   * ========================================================= */
  function ensureSeeded() { if (!STATE.rounds.length) STATE.rounds = makeMock(); return STATE.rounds; }
  App.HRMeal = {
    list: () => ensureSeeded().map(r => ensureComputed(r)),
    get:  (id) => { const r = ensureSeeded().find(x => x.id === id); return r ? ensureComputed(r) : null; },
    statusLabel: (code) => (STATUS[code] && STATUS[code].label) || null,
  };

  /* =========================================================
   *  Page Init
   * ========================================================= */
  function initPage() {
    const pageEl = document.getElementById('page-hr-meal');
    if (!pageEl) return;
    bindOnce(pageEl);
    pageEl.__onShow = () => {
      if (!STATE.rounds.length) STATE.rounds = makeMock();
      /* 명단 변경 시 집계 캐시 무효화 */
      STATE.rounds.forEach(r => { r._computed = false; });
      if (STATE.topView === 'ot') { renderOtView(pageEl); return; }
      STATE.view = 'list';
      renderListView(pageEl);
      applyFilter();
      renderTable();
    };
  }
  const prev = App.initPages;
  App.initPages = function () {
    if (typeof prev === 'function') prev();
    initPage();
  };
})();
