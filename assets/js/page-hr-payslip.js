/* =========================================================
 * Page: HR > 급여 관리 > 급여 명세서 조회 (My 명세서)
 *
 *  개요
 *   - 직원이 「내」 명세서만 조회하는 화면. 다른 직원 명세서는 보이지 않는다.
 *   - 2-view 구조 (도메인 표준 P-010 Search+Detail 변형):
 *       ① list   — 조회월 범위(YYYY-MM ~ YYYY-MM) + 빠른칩(3/6/12개월) 필터 →
 *                   내 명세서를 최신순 그리드로 나열. 같은 달에 정기급여 + 상여가 각각
 *                   별도 회차로 존재할 수 있으므로 리스트로 진입한다.
 *       ② detail — 행 클릭/[상세] → 해당 회차의 급상여명세서(급상여명세서.png 레이아웃).
 *
 *  데이터 소스
 *   - App.HRPaySettlement.list() → 정산 회차 + ledger
 *     · ledger 가 있는 회차(stage >= 1, finalized 포함) 만 명세서 데이터로 사용
 *     · 각 회차 ledger.rows 에서 「나」 한 명을 추출해 1건의 명세서로 만든다
 *   - 「나」 식별 — App.currentUser?.name / .empId 우선.
 *       · currentUser 가 지정돼 있으면 매칭되는 회차만 노출 (일용직 회차 등 자동 제외)
 *       · currentUser 미지정(순수 mock) 이면 각 회차 첫 행을 「나」 로 사용해 데모를 풍부하게
 *
 *  UI Kit 재사용
 *   .page / .select / .btn / .pill / .toolbar / App.Grid (그리드+페이지네이션+행클릭 상세)
 *   .payslip / .payslip__* (명세서 본체 — 기존)
 *   .psl-quick / .psl-list / .psl-pagebar__back / .psl-pagebar__sub (신규 — hr-components.css)
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  /* ============ Helper ============ */
  function $(s, r = document) { return r.querySelector(s); }
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtMoney(n) {
    n = Number(n);
    if (!isFinite(n) || n === 0) return '0';
    return Math.round(n).toLocaleString();
  }
  /* 표시 전용 날짜 포맷 (데이터/키 변형 금지 — 화면 렌더 시점에서만 사용) */
  function fmtD(s) {
    if (!s) return s;
    const m = String(s).match(/^(\d{4})[-./](\d{2})[-./](\d{2})/);
    return m ? m[1].slice(2) + '/' + m[2] + '/' + m[3] : s;
  }
  function fmtYM(s) {
    if (!s) return s;
    const m = String(s).match(/^(\d{4})[-./](\d{2})/);
    return m ? m[1].slice(2) + '/' + m[2] : s;
  }
  /* 'YYYY-MM' 에 delta(개월) 를 더한 'YYYY-MM' 반환 */
  function shiftMonth(ym, delta) {
    const mm = String(ym || '').match(/^(\d{4})-(\d{2})/);
    if (!mm) return ym;
    const d = new Date(Number(mm[1]), Number(mm[2]) - 1 + delta, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  /* ============ 공제 항목 라벨 (정산 화면과 동일 순서) ============ */
  const DEDUCT_LABELS = [
    { key: 'incomeTax',       label: '소득세' },
    { key: 'localTax',        label: '지방소득세' },
    { key: 'pension',         label: '국민연금' },
    { key: 'health',          label: '건강보험' },
    { key: 'ltcare',          label: '장기요양보험' },
    { key: 'employ',          label: '고용보험' },
    { key: 'adjHealth',       label: '건강보험정산' },
    { key: 'adjLtcare',       label: '장기요양정산' },
    { key: 'tuition',         label: '학자금공제' },
    { key: 'etcDed',          label: '기타공제' },
    { key: 'adjIncomeTaxMid', label: '연말정산 소득세' },
    { key: 'adjLocalTaxMid',  label: '연말정산 주민세' },
  ];

  /* ============ 지급항목 마스터 룩업 (코드 → 이름) ============ */
  function payItemName(code) {
    const api = window.App && App.HRPayItem;
    if (api && typeof api.getActiveItems === 'function') {
      const arr = api.getActiveItems();
      const it = arr && arr.find(x => x.code === code);
      if (it) return it.name;
    }
    const FALLBACK = {
      'PAY-SYS-001': '기본급',
      'PAY-SYS-002': '고정연장근무수당',
      'PAY-SYS-003': '연장근무수당',
      'PAY-SYS-004': '야간근무수당',
      'PAY-SYS-005': '휴일근무수당',
      'PAY-SYS-010': '식대',
    };
    return FALLBACK[code] || code;
  }

  /* ============ 시간외 근로수당 — 비고란 산정 내역 ============
   *   ledger row 의 otHoursBreakdown(근로시간 7종) + normalHr(통상시급) 사용.
   *   근로기준법 가산 원칙에 따라 연장·야간·휴일근로 각 50% 가산분을
   *   「연장근무수당 / 야간근무수당 / 휴일근무수당」 3개 수당으로 분해해 표시한다.
   *   중복 근로시간(예: 휴일+야간+연장)은 각 가산이 중복 적용된다.
   *   각 가산분 = 통상시급 × 해당 근로시간 × 0.5
   *
   *   근로시간 7종(상호 배타) → 가산 항목 매핑
   *     otRegularHr      순수 연장근로
   *     nightWorkHr      순수 야간근로
   *     holidayWorkHr    순수 휴일근로
   *     otNightHr        야간+연장 중복
   *     otHolidayHr      휴일+연장 중복
   *     holidayNightHr   휴일+야간 중복
   *     otHolidayNightHr 휴일+야간+연장 중복 */
  /* 4개 수당으로 분해 — 연장 / 야간 / 야간연장 / 휴일. 각 근로시간은 한 수당에만 귀속하고,
     중복 근로(예: 휴일+야간+연장)는 rate(가산율 배수)로 합산 반영 → 총 가산액은 동일. */
  const OT_ALLOWANCE_GROUPS = [
    {
      title: '연장근무수당',
      rows: [
        { label: '연장근로', hint: '순수 연장', hrKey: 'otRegularHr', rate: 0.5 },
      ],
    },
    {
      title: '야간근무수당',
      rows: [
        { label: '야간근로', hint: '순수 야간', hrKey: 'nightWorkHr', rate: 0.5 },
      ],
    },
    {
      title: '야간연장근무수당',
      rows: [
        { label: '야간연장', hint: '야간+연장', hrKey: 'otNightHr', rate: 1.0 },
      ],
    },
    {
      title: '휴일근무수당',
      rows: [
        { label: '휴일근로',     hint: '순수 휴일',      hrKey: 'holidayWorkHr',    rate: 0.5 },
        { label: '휴일연장',     hint: '휴일+연장',      hrKey: 'otHolidayHr',      rate: 1.0 },
        { label: '휴일야간',     hint: '휴일+야간',      hrKey: 'holidayNightHr',   rate: 1.0 },
        { label: '휴일야간연장', hint: '휴일+야간+연장', hrKey: 'otHolidayNightHr', rate: 1.5 },
      ],
    },
  ];
  /* 그룹별 시간·금액 소계 — 4개 수당(연장/야간/야간연장/휴일) 각각의 총 시간·총 가산액.
     세부 근로시간(순수 연장·휴일야간 등)은 표기하지 않고 4개 수당 라인만 노출. */
  function otGroupTotals(emp) {
    const hb = emp.otHoursBreakdown || {};
    const normalHr = Number(emp.normalHr || 0);
    return OT_ALLOWANCE_GROUPS.map(g => {
      let hr = 0, pay = 0;
      g.rows.forEach(r => {
        const h = Number(hb[r.hrKey] || 0);
        hr += h;
        pay += Math.round(normalHr * h * r.rate);
      });
      return { title: g.title, hr, pay };
    });
  }

  /* ============ 급여 산정 내역 (통상시급 · 시간외 근로수당 · 지각/조퇴 차감) ============
   *   - 통상시급: 한 곳에만, 표 형태로 표기 (OT·지각조퇴 계산의 공통 기준)
   *   - 시간외 근로수당: 4개 수당(연장/야간/야간연장/휴일) 라인만 (세부 근로시간 미표기)
   *   - 지각/조퇴 차감: 10분 단위 올림(예: 5분 → 10분) 규칙을 명확히 보이도록 산식 표기 */
  function renderRemarks(emp, calc) {
    const normalHr = Number(calc.normalHr || 0);

    /* 통상시급 — 공통 기준 (한 곳) */
    const basisHtml = `
      <table class="payslip__remark-tbl payslip__basis-tbl">
        <tbody>
          <tr><th>통상시급</th><td class="is-num">${fmtMoney(normalHr)} 원</td></tr>
        </tbody>
      </table>`;

    /* 시간외 근로수당 — 4개 수당 라인 */
    const groups = otGroupTotals(emp);
    const grandHr  = groups.reduce((s, g) => s + g.hr, 0);
    const grandPay = groups.reduce((s, g) => s + g.pay, 0);
    const otRows = groups.map(g => `
      <tr>
        <th>${esc(g.title)}</th>
        <td style="text-align:center;">${g.hr ? g.hr + 'h' : '-'}</td>
        <td class="is-num">${g.pay ? fmtMoney(g.pay) : ''}</td>
      </tr>`).join('');
    const otHtml = `
      <div class="payslip__remark-subtitle">시간외 근로수당</div>
      <table class="payslip__remark-tbl">
        <thead>
          <tr>
            <th>수당 항목</th>
            <th style="width:80px;">시간</th>
            <th style="width:130px;">금액</th>
          </tr>
        </thead>
        <tbody>${otRows}</tbody>
        <tfoot>
          <tr>
            <th>합계</th>
            <td style="text-align:center;">${grandHr ? grandHr + 'h' : '-'}</td>
            <td class="is-num">${fmtMoney(grandPay)}</td>
          </tr>
        </tfoot>
      </table>`;

    /* 지각/조퇴 차감 — 10분 단위 올림 규칙을 산식으로 명확히 */
    let lateHtml = '';
    if (calc.lateDeduct > 0) {
      lateHtml = `
        <div class="payslip__remark-subtitle">지각·조퇴 차감</div>
        <table class="payslip__remark-tbl">
          <thead>
            <tr>
              <th>항목</th>
              <th>산정</th>
              <th style="width:130px;">금액</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>누계 지각·조퇴</th>
              <td class="is-formula">${calc.lateEarlyMin}분</td>
              <td class="is-num">-</td>
            </tr>
            <tr>
              <th>적용 시간</th>
              <td class="is-formula">${calc.lateEarlyMin}분 → ${calc.lateRoundMin}분 <span class="payslip__remark-hint">10분 단위 올림</span></td>
              <td class="is-num">-</td>
            </tr>
            <tr>
              <th>차감액</th>
              <td class="is-formula">통상시급 ÷ 60 × ${calc.lateRoundMin}분</td>
              <td class="is-num">${fmtMoney(calc.lateDeduct)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr><th colspan="2">총 차감</th><td class="is-num">${fmtMoney(calc.lateDeduct)}</td></tr>
          </tfoot>
        </table>`;
    }

    return `
      <section class="payslip__remark">
        <div class="payslip__remark-title">급여 산정 내역</div>
        ${basisHtml}
        ${otHtml}
        ${lateHtml}
      </section>
    `;
  }

  /* ============ 「나」 매칭 ============
   *   currentUser 의 empId/name 과 ledger row 를 매칭. 매칭 실패 시 null. */
  function matchMyRow(rows) {
    const cu = (window.App && App.currentUser) || null;
    if (!cu) return null;
    if (cu.empId) {
      const hit = rows.find(r => String(r.empId) === String(cu.empId));
      if (hit) return hit;
    }
    if (cu.name) {
      const hit = rows.find(r => r.name === cu.name);
      if (hit) return hit;
    }
    return null;
  }
  /* 일용직 정산 회차 여부 — 상용직 사용자의 「내 명세서」 목록에서는 제외 */
  function isDailySettlement(r) {
    return !!(r && r.targetFilter && r.targetFilter.empGroup === 'daily');
  }

  /* ============ 정산 구분 (리스트 「구분」 = 정기 급여 | 기타) ============
   *   급여 정산의 정산유형(settlementType)과 동일 체계 — regular=정기 급여 / etc=기타.
   *   (상여·연차수당 등은 정산 화면에서 '기타' 유형으로 개설되므로 여기서도 '기타'.) */
  const KIND_OPTIONS = [
    { value: 'regular', label: '정기 급여', pill: 'info'   },
    { value: 'etc',     label: '기타',      pill: 'muted'  },
  ];
  function kindOf(r) {
    const type = (r.settlementType || 'regular') === 'regular' ? 'regular' : 'etc';
    return KIND_OPTIONS.find(k => k.value === type) || KIND_OPTIONS[1];
  }

  /* ============ 명세서 1건 계산 (list 요약 + detail 렌더 공용 단일 진실원) ============
   *   지급/공제 행 + 합계 + 지각차감 반영 실지급액을 한 번에 산출한다. */
  function computePayslip(emp, meta) {
    const payRows = (meta.payItemCodes || []).map(code => ({
      label: payItemName(code),
      value: (emp.amounts || {})[code] || 0,
    }));
    const dedRows = DEDUCT_LABELS.map(d => ({
      label: d.label,
      value: (emp.deductions || {})[d.key] || 0,
    }));
    /* 지각/조퇴 차감 — 누계 분을 10분 단위로 절상 × 통상분급(통상시급/60).
       분 데이터는 근태 연동값(emp.lateEarlyMin) 우선, 없으면 결정적 mock(사번 기반). */
    const normalHr = Number(emp.normalHr || 0);
    const idn = Number(String(emp.empId || emp.id || '').replace(/\D/g, '').slice(-2)) || 0;
    const lateEarlyMin = emp.lateEarlyMin != null ? Number(emp.lateEarlyMin) : (idn % 26);
    const lateRoundMin = Math.ceil(lateEarlyMin / 10) * 10;
    const lateDeduct   = lateEarlyMin > 0 ? Math.round(normalHr / 60 * lateRoundMin) : 0;
    if (lateDeduct > 0) dedRows.push({ label: '지각/조퇴 차감', value: lateDeduct });

    const payTotal = Number(emp.total || 0);
    const dedTotal = Number(emp.dedTotal || 0) + lateDeduct;
    const baseNet  = emp.netPay != null ? Number(emp.netPay) : (Number(emp.total || 0) - Number(emp.dedTotal || 0));
    const netPay   = baseNet - lateDeduct;

    return { payRows, dedRows, payTotal, dedTotal, netPay, normalHr, lateEarlyMin, lateRoundMin, lateDeduct };
  }

  /* ============ 내 명세서 목록 (전체 — 필터 미적용) ============ */
  function buildList() {
    const list = (App.HRPaySettlement && App.HRPaySettlement.list)
      ? App.HRPaySettlement.list()
      : [];
    const out = [];
    list.forEach(r => {
      const rows = r.ledger && r.ledger.rows;
      if (!rows || !rows.length) return;
      /* 「나」 우선 매칭. 매칭 실패 시 —
       *   · 일용직 회차: 상용직 사용자의 명세서가 아니므로 제외
       *   · 그 외: mock 데모 환경(ledger 에 현재 사용자 미포함) → 첫 행을 대표 명세서로 노출 */
      let myRow = matchMyRow(rows);
      if (!myRow) {
        if (isDailySettlement(r)) return;
        myRow = rows[0];
      }
      const meta = {
        settlementId:   r.id,
        settlementName: r.name,
        payDate:        r.payDate,
        accruedMonth:   r.accruedMonth,
        payItemCodes:   r.payItemCodes || [],
      };
      const calc = computePayslip(myRow, meta);
      const kind = kindOf(r);
      out.push({
        id:           r.id,
        accruedMonth: r.accruedMonth,
        kind:         kind,
        _type:        kind.value,   /* 구분 필터용 (regular|etc) */
        payDate:      r.payDate,
        payTotal:     calc.payTotal,
        dedTotal:     calc.dedTotal,
        netPay:       calc.netPay,
        _emp:         myRow,
        _meta:        meta,
      });
    });
    /* 최신순 — 지급일 desc, 동일 시 귀속월 desc */
    out.sort((a, b) =>
      String(b.payDate).localeCompare(String(a.payDate)) ||
      String(b.accruedMonth).localeCompare(String(a.accruedMonth))
    );
    return out;
  }

  /* ============ 조회월 옵션 (최근 24개월, 데이터 월 포함) ============ */
  function buildMonthOptions(latest) {
    const set = new Set();
    for (let i = 0; i < 24; i++) set.add(shiftMonth(latest, -i));
    STATE.all.forEach(s => { if (s.accruedMonth) set.add(s.accruedMonth); });
    return Array.from(set).sort().reverse();
  }
  function latestMonth() {
    let mx = '';
    STATE.all.forEach(s => { if (s.accruedMonth > mx) mx = s.accruedMonth; });
    if (!mx) {
      const d = new Date();
      mx = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    }
    return mx;
  }

  /* ============ STATE ============ */
  const STATE = {
    view:     'list',  /* 'list' | 'detail' */
    all:      [],      /* 전체 내 명세서 (필터 미적용) */
    from:     '',      /* 조회월 시작 YYYY-MM */
    to:       '',      /* 조회월 종료 YYYY-MM */
    quick:    3,       /* 활성 빠른칩 (3|6|12개월), null=수동 조정 */
    kind:     '',      /* 구분 필터 '' | 'regular' | 'etc' */
    selected: null,    /* 상세 대상 요약 행 */
    grid:     null,    /* App.Grid 인스턴스 */
  };

  /* 필터 적용 — 조회월(귀속월) 범위 + 구분, No 내림차순 부여 */
  function applyFilter() {
    const from = STATE.from, to = STATE.to, kind = STATE.kind;
    const rows = STATE.all.filter(s => {
      const m = s.accruedMonth || '';
      if (from && m < from) return false;
      if (to && m > to) return false;
      if (kind && s._type !== kind) return false;
      return true;
    });
    rows.forEach((r, i) => { r.no = rows.length - i; });   /* No 내림차순 (도메인 표준) */
    return rows;
  }

  /* 빠른칩 기준으로 from 재계산 (to 유지) */
  function applyQuick(n) {
    STATE.quick = n;
    STATE.to = STATE.to || latestMonth();
    STATE.from = shiftMonth(STATE.to, -(n - 1));
  }

  /* =========================================================
   *  Render — List
   * ========================================================= */
  function renderList(pageEl) {
    const months = buildMonthOptions(latestMonth());
    const optHTML = (sel) => months.map(m =>
      `<option value="${esc(m)}" ${m === sel ? 'selected' : ''}>${esc(m.replace('-', '/'))}</option>`
    ).join('');
    const chip = (n) =>
      `<button class="btn btn--sm${STATE.quick === n ? ' is-active' : ''}" type="button" data-psl-quick="${n}">${n}개월</button>`;
    const kindOptHTML = `<option value="">전체</option>` + KIND_OPTIONS.map(k =>
      `<option value="${esc(k.value)}" ${k.value === STATE.kind ? 'selected' : ''}>${esc(k.label)}</option>`
    ).join('');
    const iconSearch = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>`;

    /* 급여 정산과 동일한 크롬 — .search(검색 패널) + .toolbar + .grid-wrap.
       조회월은 월 단위(YYYY-MM) 범위라 표준 searchPanel(일 단위 date) 대신
       .search 클래스를 직접 사용하되 조회/초기화 버튼·칩·구분 필터는 동일 톤으로 구성. */
    pageEl.innerHTML = `
      <div class="psl-page">
        <section class="search" data-search aria-label="검색">
          <div class="search__row">
            <div class="field">
              <span class="field__label">조회월</span>
              <select class="select" data-psl-from aria-label="조회 시작월">${optHTML(STATE.from)}</select>
              <span style="color:var(--color-text-muted)">~</span>
              <select class="select" data-psl-to aria-label="조회 종료월">${optHTML(STATE.to)}</select>
            </div>
            <div class="search__quick">${chip(3)}${chip(6)}${chip(12)}</div>
            <div class="search__divider"></div>
            <div class="field">
              <span class="field__label">구분</span>
              <select class="select" data-psl-kind aria-label="구분">${kindOptHTML}</select>
            </div>
            <div style="margin-left:auto; display:flex; gap:6px;">
              <button class="btn" type="button" data-psl-reset>초기화</button>
              <button class="btn btn--primary" type="button" data-psl-submit>${iconSearch} 조회</button>
            </div>
          </div>
        </section>

        <div class="toolbar">
          <div class="toolbar__left">
            <span class="toolbar__count">총 <strong id="psl-count">0</strong>건</span>
          </div>
          <div class="toolbar__right">
            <button class="btn btn--sm" type="button" id="psl-excel-list">${(window.Icons && window.Icons.download) || ''} 엑셀 다운로드</button>
          </div>
        </div>

        <div class="grid-wrap" id="psl-grid" style="flex:1;min-height:0;"></div>
      </div>
    `;

    const rows = applyFilter();
    STATE.grid = App.Grid.create({
      mount: $('#psl-grid', pageEl),
      pageSize: 20,
      columns: [
        { key: 'no',           label: 'No',       align: 'center', width: '56px' },
        { key: 'accruedMonth', label: '귀속월',    align: 'center', width: '90px',  format: v => esc(fmtYM(v)) },
        { key: 'kind',         label: '구분',      align: 'center', width: '110px',
          format: k => `<span class="pill pill--${esc((k && k.pill) || 'muted')}">${esc((k && k.label) || '-')}</span>` },
        { key: 'payDate',      label: '지급일',    align: 'center', width: '110px', format: v => esc(fmtD(v)) },
        { key: 'payTotal',     label: '지급합계',  align: 'right',  width: '120px', format: v => fmtMoney(v) },
        { key: 'dedTotal',     label: '공제합계',  align: 'right',  width: '110px', format: v => fmtMoney(v) },
        { key: 'netPay',       label: '실지급액',  align: 'right',  width: '130px',
          format: v => `<strong style="color:var(--color-brand-primary)">${fmtMoney(v)}</strong>` },
        { key: 'id',           label: '상세',      align: 'center', width: '72px',
          format: v => `<button class="btn btn--sm" type="button" data-payslip-detail="${esc(v)}">상세</button>` },
      ],
      rows: rows,
    });
    $('#psl-count', pageEl).textContent = rows.length.toLocaleString();

    bindListEvents(pageEl);
  }

  function refreshList(pageEl) {
    if (!STATE.grid) return;
    const rows = applyFilter();
    STATE.grid.setRows(rows);
    const cnt = $('#psl-count', pageEl);
    if (cnt) cnt.textContent = rows.length.toLocaleString();
  }

  function bindListEvents(pageEl) {
    const root   = $('.search', pageEl);
    const fromEl = root.querySelector('[data-psl-from]');
    const toEl   = root.querySelector('[data-psl-to]');
    const kindEl = root.querySelector('[data-psl-kind]');
    const submit = root.querySelector('[data-psl-submit]');

    /* 조회/초기화 전까지는 pending(DOM 값만 변경) — 급여 정산의 조회 버튼 UX 와 동일 */
    const clearChip = () => root.querySelectorAll('[data-psl-quick].is-active')
      .forEach(b => b.classList.remove('is-active'));

    /* 빠른칩 — to 기준으로 from 재계산 후 즉시 적용 (빠른 필터: 조회 버튼 불필요) */
    root.querySelectorAll('[data-psl-quick]').forEach(btn => {
      btn.addEventListener('click', () => {
        const n  = Number(btn.dataset.pslQuick);
        const to = toEl.value || latestMonth();
        fromEl.value = shiftMonth(to, -(n - 1));
        root.querySelectorAll('[data-psl-quick]').forEach(b => b.classList.toggle('is-active', b === btn));
        STATE.from  = fromEl.value;
        STATE.to    = to;
        STATE.kind  = kindEl.value;
        STATE.quick = n;
        refreshList(pageEl);
      });
    });
    /* 월 수동 변경 → 칩 해제 + from>to 방지 (pending) */
    fromEl.addEventListener('change', () => { clearChip(); if (fromEl.value > toEl.value) toEl.value = fromEl.value; });
    toEl.addEventListener('change',   () => { clearChip(); if (toEl.value < fromEl.value) fromEl.value = toEl.value; });

    /* 조회 — DOM(pending) → STATE 반영 후 그리드만 갱신 */
    submit.addEventListener('click', () => {
      STATE.from = fromEl.value;
      STATE.to   = toEl.value;
      STATE.kind = kindEl.value;
      const active = root.querySelector('[data-psl-quick].is-active');
      STATE.quick = active ? Number(active.dataset.pslQuick) : null;
      refreshList(pageEl);
    });
    /* 엔터로도 조회 */
    root.querySelectorAll('select').forEach(sel => {
      sel.addEventListener('keydown', e => { if (e.key === 'Enter') submit.click(); });
    });

    /* 초기화 — 기본값(최신월 기준 최근 3개월 · 구분 전체) 복원 후 재조회 */
    root.querySelector('[data-psl-reset]').addEventListener('click', () => {
      STATE.kind = '';
      STATE.to = latestMonth();
      applyQuick(3);
      renderList(pageEl);   /* 전체 재렌더로 DOM·그리드 동기화 */
    });

    /* 상세 진입 — [상세] 버튼 또는 행 클릭(App.Grid 가 트리거 대리 클릭) */
    $('#psl-grid', pageEl).addEventListener('click', e => {
      const t = e.target.closest('[data-payslip-detail]');
      if (!t) return;
      openDetail(pageEl, t.dataset.payslipDetail);
    });

    $('#psl-excel-list', pageEl).addEventListener('click', () => {
      window.toast && window.toast('명세서 목록 엑셀 다운로드 (mock)', 'info');
    });
  }

  /* =========================================================
   *  Render — Detail (급상여명세서)
   * ========================================================= */
  function openDetail(pageEl, id) {
    const row = STATE.all.find(s => s.id === id);
    if (!row) return;
    STATE.selected = row;
    STATE.view = 'detail';
    renderDetail(pageEl);
  }
  function backToList(pageEl) {
    STATE.view = 'list';
    STATE.selected = null;
    renderList(pageEl);
  }

  function renderDetail(pageEl) {
    const row  = STATE.selected;
    const emp  = row && row._emp;
    const meta = row && row._meta;
    const kind = row && row.kind;

    pageEl.innerHTML = `
      <div class="psl-page">
        <div class="psl-pagebar">
          <div class="psl-pagebar__left">
            <button class="btn btn--sm psl-pagebar__back" type="button" id="psl-back">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
              목록
            </button>
            <div class="psl-pagebar__title">급여 명세서</div>
            <div class="psl-pagebar__sub">
              <span>${esc(fmtYM(meta && meta.accruedMonth || ''))}</span>
              ${kind ? `<span class="pill pill--${esc(kind.pill)}">${esc(kind.label)}</span>` : ''}
            </div>
          </div>
          <div class="psl-pagebar__right">
            <button class="btn btn--sm" type="button" id="psl-excel">엑셀 ↓</button>
            <button class="btn btn--sm btn--primary" type="button" id="psl-print">명세서 인쇄</button>
          </div>
        </div>

        <div class="psl-body psl-body--single">
          <section class="psl-detail" id="psl-detail"></section>
        </div>
      </div>
    `;

    const detailEl = $('#psl-detail', pageEl);
    if (!emp || !meta) {
      detailEl.innerHTML = `
        <div class="psl-empty">
          <div class="psl-empty__title">명세서를 불러올 수 없습니다.</div>
          <div class="psl-empty__sub">목록으로 돌아가 다시 선택하세요.</div>
        </div>
      `;
    } else {
      detailEl.innerHTML = renderPayslipBody(emp, meta);
    }
    bindDetailEvents(pageEl);
  }

  /* 명세서 본체 마크업 — computePayslip() 결과로 렌더 (급상여명세서.png 레이아웃) */
  function renderPayslipBody(emp, meta) {
    const calc = computePayslip(emp, meta);
    /* 지급 / 공제 — 값과 무관하게 항목 라벨은 모두 노출. 값 0 인 칸은 공란.
       좌우 길이 균형은 빈 행 패딩으로 맞춤. */
    const payRows = calc.payRows.slice();
    const dedRows = calc.dedRows.slice();
    const maxRows = Math.max(payRows.length, dedRows.length);
    while (payRows.length < maxRows) payRows.push({ _empty: true });
    while (dedRows.length < maxRows) dedRows.push({ _empty: true });

    const renderRows = (rows) => rows.map(r => {
      if (r._empty) return `<tr class="payslip__row payslip__row--empty"><th></th><td></td></tr>`;
      return `
        <tr class="payslip__row">
          <th>${esc(r.label)}</th>
          <td>${r.value ? fmtMoney(r.value) : ''}</td>
        </tr>
      `;
    }).join('');

    return `
      <article class="payslip">
        <h1 class="payslip__title">급상여명세서</h1>

        <div class="payslip__head">
          <table class="payslip__head-tbl">
            <tbody>
              <tr><th>소속</th><td>${esc(emp.dept || '-')}</td></tr>
              <tr><th>사원명</th><td>${esc(emp.name)}</td></tr>
            </tbody>
          </table>
          <table class="payslip__head-tbl">
            <tbody>
              <tr><th>지급일</th><td>${esc(fmtD(meta.payDate) || '-')}</td></tr>
              <tr><th>귀속연월</th><td>${esc(fmtYM(meta.accruedMonth || ''))}</td></tr>
            </tbody>
          </table>
        </div>

        <div class="payslip__grid">
          <table class="payslip__tbl payslip__tbl--pay">
            <thead><tr><th colspan="2">지급내역</th></tr></thead>
            <tbody>${renderRows(payRows)}</tbody>
            <tfoot><tr><th>지급합계</th><td>${fmtMoney(calc.payTotal)}</td></tr></tfoot>
          </table>
          <table class="payslip__tbl payslip__tbl--ded">
            <thead><tr><th colspan="2">공제내역</th></tr></thead>
            <tbody>${renderRows(dedRows)}</tbody>
            <tfoot><tr><th>공제합계</th><td>${fmtMoney(calc.dedTotal)}</td></tr></tfoot>
          </table>
        </div>

        <table class="payslip__netpay">
          <tbody>
            <tr>
              <th>실지급액</th>
              <td>${fmtMoney(calc.netPay)}</td>
            </tr>
          </tbody>
        </table>

        ${renderRemarks(emp, calc)}
      </article>
    `;
  }

  function bindDetailEvents(pageEl) {
    $('#psl-back', pageEl).addEventListener('click', () => backToList(pageEl));
    $('#psl-excel', pageEl).addEventListener('click', () => {
      window.toast && window.toast('내 명세서 엑셀 다운로드 (mock)', 'info');
    });
    $('#psl-print', pageEl).addEventListener('click', () => {
      window.toast && window.toast('명세서 인쇄 (mock) — 브라우저 인쇄 대화상자가 표시될 예정', 'info');
    });
  }

  /* =========================================================
   *  Page Init
   * ========================================================= */
  function render(pageEl) {
    if (STATE.view === 'detail' && STATE.selected) renderDetail(pageEl);
    else renderList(pageEl);
  }

  function initPage() {
    const pageEl = document.getElementById('page-hr-payslip');
    if (!pageEl) return;
    pageEl.classList.remove('page--scroll');
    pageEl.__onShow = () => {
      STATE.all = buildList();
      /* 진입 시 기본 — 최신 지급월 기준 최근 3개월. 상세 상태는 초기화. */
      STATE.view = 'list';
      STATE.selected = null;
      STATE.kind = '';
      STATE.to = latestMonth();
      applyQuick(3);
      render(pageEl);
    };
  }
  const prev = App.initPages;
  App.initPages = function () {
    if (typeof prev === 'function') prev();
    initPage();
  };
})();
