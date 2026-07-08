/* =========================================================
 * Page: HR > 급여 관리 > 급여 명세서 조회 (My 명세서)
 *
 *  개요
 *   - 직원이 「내」 명세서만 조회하는 화면. 다른 직원 명세서는 보이지 않는다.
 *   - 좌측 상단: 년 dropdown + 월 dropdown 으로 귀속월 선택 (평가 회차 화면과 동일 패턴).
 *   - 본문: 선택한 귀속월의 「나의」 명세서 1건 — 급상여명세서.png 와 동일 레이아웃.
 *
 *  데이터 소스
 *   - App.HRPaySettlement.list() → 정산 회차 + ledger
 *     · ledger 가 있는 회차(stage >= 1, finalized 포함) 만 명세서 데이터로 사용
 *     · STATE.year / STATE.month 기준으로 정산을 필터링한 뒤 ledger.rows 에서 「나」 한 명만 추출
 *   - 「나」 식별 — App.currentUser?.name / .empId 우선, 없으면 ledger 첫 행을 mock 으로 사용
 *
 *  명세서 구성 (참고: 급상여명세서.png)
 *   - 헤더: 소속(부서)/직급, 사원명, 지급일, 귀속연월
 *   - 지급내역(좌) / 공제내역(우)
 *     · 지급내역 = ledger row.amounts (지급 항목 마스터 매핑) + payItemCodes 기준
 *     · 공제내역 = ledger row.deductions (12 항목)
 *   - 하단: 지급합계 / 공제합계 / 실지급액
 *
 *  UI Kit 재사용
 *   .page / .input / .select / .pill
 *   .payslip / .payslip__head / .payslip__grid / .payslip__col / .payslip__row / .payslip__row--total (신규)
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
  function renderOtRemark(emp) {
    const hb = emp.otHoursBreakdown || {};
    const normalHr = Number(emp.normalHr || 0);
    let grandHr = 0, grandPay = 0;
    const groupsHtml = OT_ALLOWANCE_GROUPS.map(g => {
      let subHr = 0, subPay = 0;
      /* 근로 시간이 있는 항목만 노출 — 0시간 항목은 숨겨 표를 간결하게 */
      const rowsHtml = g.rows.map(r => {
        const hr = Number(hb[r.hrKey] || 0);
        if (!hr) return '';
        const pay = Math.round(normalHr * hr * r.rate);
        subHr += hr; subPay += pay;
        return `
          <tr>
            <th>${esc(r.label)}</th>
            <td style="text-align:center;">${hr}h</td>
            <td class="is-num">${fmtMoney(pay)}</td>
          </tr>`;
      }).join('');
      grandHr += subHr; grandPay += subPay;
      const detail = rowsHtml || `<tr class="is-zero"><td colspan="3">해당 근로 내역 없음</td></tr>`;
      return `
        <tr class="is-group">
          <th>${esc(g.title)}</th>
          <td style="text-align:center;">${subHr ? subHr + 'h' : '-'}</td>
          <td class="is-num">${fmtMoney(subPay)}</td>
        </tr>
        ${detail}`;
    }).join('');
    return `
      <section class="payslip__remark">
        <div class="payslip__remark-title">시간외 근로수당 산정</div>
        <div class="payslip__remark-sub">통상시급 ${fmtMoney(normalHr)}원</div>
        <table class="payslip__remark-tbl payslip__remark-tbl--grouped">
          <thead>
            <tr>
              <th>가산 항목</th>
              <th style="width:72px;">시간</th>
              <th style="width:120px;">금액</th>
            </tr>
          </thead>
          <tbody>${groupsHtml}</tbody>
          <tfoot>
            <tr>
              <th>총 합계</th>
              <td style="text-align:center;">${grandHr ? grandHr + 'h' : '-'}</td>
              <td class="is-num">${fmtMoney(grandPay)}</td>
            </tr>
          </tfoot>
        </table>
      </section>
    `;
  }

  /* ============ 지각/조퇴 차감 산정 ============
   *   누계 분 → 10분 단위 절상(1~10분→10분, 11~20분→20분 …) × 통상분급(통상시급/60) */
  function renderLateRemark(min, roundMin, deduct, normalHr) {
    return `
      <section class="payslip__remark">
        <div class="payslip__remark-title">지각/조퇴 차감 산정</div>
        <div class="payslip__remark-sub">통상시급 ${fmtMoney(normalHr)}원</div>
        <table class="payslip__remark-tbl">
          <thead>
            <tr>
              <th>항목</th>
              <th style="width:90px;">시간</th>
              <th style="width:120px;">금액</th>
            </tr>
          </thead>
          <tbody>
            <tr><th>지각/조퇴 누계</th><td style="text-align:center;">${min}분</td><td class="is-num">-</td></tr>
            <tr><th>10분 단위 절상</th><td style="text-align:center;">${roundMin}분</td><td class="is-num">${fmtMoney(deduct)}</td></tr>
          </tbody>
          <tfoot>
            <tr><th>총 차감</th><td style="text-align:center;">${roundMin}분</td><td class="is-num">${fmtMoney(deduct)}</td></tr>
          </tfoot>
        </table>
      </section>
    `;
  }

  /* ============ 「나」 매칭 ============
   *   App.currentUser 의 name/empId 와 ledger row 매칭. 없으면 첫 행을 mock 으로 사용. */
  function pickMyRow(rows) {
    if (!rows || !rows.length) return null;
    const cu = (window.App && App.currentUser) || null;
    if (cu) {
      if (cu.empId) {
        const hit = rows.find(r => String(r.empId) === String(cu.empId));
        if (hit) return hit;
      }
      if (cu.name) {
        const hit = rows.find(r => r.name === cu.name);
        if (hit) return hit;
      }
    }
    return rows[0];   /* mock fallback — 첫 직원을 「나」 로 표시 */
  }

  /* ============ STATE ============ */
  const STATE = {
    year:    '',   /* YYYY */
    month:   '',   /* MM   */
    myRow:   null, /* 현재 조회 결과 — 명세서 한 건 */
    myMeta:  null, /* settlement 메타 (id, name, payDate, accruedMonth, payItemCodes) */
  };

  /* ============ 데이터 로드 ============ */
  function loadMyPayslip() {
    const list = (App.HRPaySettlement && App.HRPaySettlement.list)
      ? App.HRPaySettlement.list()
      : [];
    const ym = (STATE.year && STATE.month) ? `${STATE.year}-${STATE.month}` : '';
    const candidates = list.filter(r => r.ledger && r.ledger.rows && r.ledger.rows.length && (!ym || r.accruedMonth === ym));
    if (!candidates.length) {
      STATE.myRow = null;
      STATE.myMeta = null;
      return;
    }
    /* 동일 귀속월에 여러 회차가 있으면 — 「나」 가 포함된 회차 우선, 없으면 첫 회차 */
    const cu = (window.App && App.currentUser) || null;
    const findInRound = (r) => {
      const rows = (r.ledger && r.ledger.rows) || [];
      if (!cu) return null;
      return rows.find(row =>
        (cu.empId && String(row.empId) === String(cu.empId)) ||
        (cu.name  && row.name === cu.name)
      );
    };
    let chosenRound = candidates.find(findInRound) || candidates[0];
    const myRow = pickMyRow(chosenRound.ledger.rows);
    STATE.myRow  = myRow;
    STATE.myMeta = {
      settlementId:   chosenRound.id,
      settlementName: chosenRound.name,
      payDate:        chosenRound.payDate,
      accruedMonth:   chosenRound.accruedMonth,
      payItemCodes:   chosenRound.payItemCodes || [],
    };
  }

  /* ============ 년/월 옵션 ============
   *   정산 데이터 + 최근 2년 범위 합집합. 데이터 없는 환경에서도 기본 옵션 노출. */
  function buildYearMonthOptions() {
    const list = (App.HRPaySettlement && App.HRPaySettlement.list)
      ? App.HRPaySettlement.list()
      : [];
    const yearSet  = new Set();
    const monthSet = new Set();
    list.forEach(r => {
      if (!r.accruedMonth) return;
      const [y, m] = r.accruedMonth.split('-');
      if (y) yearSet.add(y);
      if (m) monthSet.add(m);
    });
    const nowYear = new Date().getFullYear();
    [nowYear - 1, nowYear, nowYear + 1].forEach(y => yearSet.add(String(y)));
    for (let i = 1; i <= 12; i++) monthSet.add(String(i).padStart(2, '0'));
    return {
      years:  Array.from(yearSet).sort().reverse(),
      months: Array.from(monthSet).sort(),
    };
  }

  /* ============ 기본 년/월 초기화 ============
   *   진입 시 최신 정산의 귀속월로. 없으면 오늘 날짜. */
  function ensureDefaultYearMonth() {
    if (STATE.year && STATE.month) return;
    const list = (App.HRPaySettlement && App.HRPaySettlement.list)
      ? App.HRPaySettlement.list()
      : [];
    const months = list
      .filter(r => r.ledger && r.ledger.rows && r.ledger.rows.length)
      .map(r => r.accruedMonth)
      .filter(Boolean)
      .sort()
      .reverse();
    if (months.length) {
      const [y, m] = months[0].split('-');
      STATE.year  = y;
      STATE.month = m;
    } else {
      const d = new Date();
      STATE.year  = String(d.getFullYear());
      STATE.month = String(d.getMonth() + 1).padStart(2, '0');
    }
  }

  /* =========================================================
   *  Render
   * ========================================================= */
  function render(pageEl) {
    const { years, months } = buildYearMonthOptions();
    const yOpts = years.map(y =>
      `<option value="${esc(y)}" ${y === STATE.year ? 'selected' : ''}>${esc(y)}년</option>`
    ).join('');
    const mOpts = months.map(m =>
      `<option value="${esc(m)}" ${m === STATE.month ? 'selected' : ''}>${esc(m)}월</option>`
    ).join('');

    pageEl.innerHTML = `
      <div class="psl-page">
        <!-- 상단 페이지바 — 좌측 상단 년/월 dropdown -->
        <div class="psl-pagebar">
          <div class="psl-pagebar__left">
            <div class="psl-pagebar__title">급여 명세서 조회</div>
            <div class="psl-pagebar__period">
              <select class="select" id="psl-year" aria-label="조회 연도">${yOpts}</select>
              <select class="select" id="psl-month" aria-label="조회 월">${mOpts}</select>
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
    renderDetail(pageEl);
    bindEvents(pageEl);
  }

  function renderDetail(pageEl) {
    const detailEl = $('#psl-detail', pageEl);
    if (!detailEl) return;
    const emp  = STATE.myRow;
    const meta = STATE.myMeta;
    if (!emp || !meta) {
      detailEl.innerHTML = `
        <div class="psl-empty">
          <div class="psl-empty__title">선택한 월의 명세서가 없습니다.</div>
          <div class="psl-empty__sub">상단에서 조회할 년/월을 선택하세요.</div>
        </div>
      `;
      return;
    }

    /* 지급 / 공제 — 값과 무관하게 항목 라벨은 모두 노출 (참고 PNG 와 동일).
     *   값 0 인 칸은 공란. 좌우 길이 균형은 빈 행 패딩으로 맞춤. */
    const payRows = (meta.payItemCodes || []).map(code => ({
      label: payItemName(code),
      value: (emp.amounts || {})[code] || 0,
    }));
    const dedRows = DEDUCT_LABELS.map(d => ({
      label: d.label,
      value: (emp.deductions || {})[d.key] || 0,
    }));
    /* 지각/조퇴 차감 — 누계 분을 10분 단위로 절상(1~10분→10분, 11~20분→20분 …) × 통상분급(통상시급/60).
       분 데이터는 근태 연동값(emp.lateEarlyMin) 우선, 없으면 결정적 mock. */
    const _normalHr = Number(emp.normalHr || 0);
    const _idn = Number(String(emp.empId || emp.id || '').replace(/\D/g, '').slice(-2)) || 0;
    const lateEarlyMin = emp.lateEarlyMin != null ? Number(emp.lateEarlyMin) : (_idn % 26);
    const lateRoundMin = Math.ceil(lateEarlyMin / 10) * 10;
    const lateDeduct   = lateEarlyMin > 0 ? Math.round(_normalHr / 60 * lateRoundMin) : 0;
    if (lateDeduct > 0) dedRows.push({ label: '지각/조퇴 차감', value: lateDeduct });
    const dedTotalShown = Number(emp.dedTotal || 0) + lateDeduct;
    const netPayShown   = Number(emp.netPay != null ? emp.netPay : (Number(emp.total || 0) - Number(emp.dedTotal || 0))) - lateDeduct;
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

    detailEl.innerHTML = `
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
              <tr><th>지급일</th><td>${esc(meta.payDate || '-')}</td></tr>
              <tr><th>귀속연월</th><td>${esc((meta.accruedMonth || '').replace('-', '.'))}</td></tr>
            </tbody>
          </table>
        </div>

        <div class="payslip__grid">
          <table class="payslip__tbl payslip__tbl--pay">
            <thead><tr><th colspan="2">지급내역</th></tr></thead>
            <tbody>${renderRows(payRows)}</tbody>
            <tfoot><tr><th>지급합계</th><td>${fmtMoney(emp.total)}</td></tr></tfoot>
          </table>
          <table class="payslip__tbl payslip__tbl--ded">
            <thead><tr><th colspan="2">공제내역</th></tr></thead>
            <tbody>${renderRows(dedRows)}</tbody>
            <tfoot><tr><th>공제합계</th><td>${fmtMoney(dedTotalShown)}</td></tr></tfoot>
          </table>
        </div>

        <table class="payslip__netpay">
          <tbody>
            <tr>
              <th>실지급액</th>
              <td>${fmtMoney(netPayShown)}</td>
            </tr>
          </tbody>
        </table>

        ${renderOtRemark(emp)}
        ${lateDeduct > 0 ? renderLateRemark(lateEarlyMin, lateRoundMin, lateDeduct, _normalHr) : ''}
      </article>
    `;
  }

  /* ============ Events ============ */
  function bindEvents(pageEl) {
    $('#psl-year', pageEl).addEventListener('change', e => {
      STATE.year = e.target.value;
      loadMyPayslip();
      renderDetail(pageEl);
    });
    $('#psl-month', pageEl).addEventListener('change', e => {
      STATE.month = e.target.value;
      loadMyPayslip();
      renderDetail(pageEl);
    });
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
  function initPage() {
    const pageEl = document.getElementById('page-hr-payslip');
    if (!pageEl) return;
    pageEl.classList.remove('page--scroll');
    pageEl.__onShow = () => {
      ensureDefaultYearMonth();
      loadMyPayslip();
      render(pageEl);
    };
  }
  const prev = App.initPages;
  App.initPages = function () {
    if (typeof prev === 'function') prev();
    initPage();
  };
})();
