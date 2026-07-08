/* =========================================================
 * Page: 근태 관리 > 근무조 현황 (전체 | 임직원별 | 부서별)
 *
 *   App.AttShifts (근무조 마스터, page-att-shift.js 노출) +
 *   App.Employees (임직원 마스터, page-hr-* 노출) 를 결합하여
 *   구성원의 월별 근무조 배치를 조회한다.
 *
 *   - 전체: 전직원 × 일자(31일) 매트릭스 (가로 스크롤)
 *   - 임직원별: 좌측 임직원 리스트 + 우측 4주 캘린더
 *   - 부서별: 부서별 근무조 분포 + 부서원 매트릭스
 *
 *   [근무조 설정] 버튼 — page-att-shift (부서장 편성 detail) 로 진입.
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function nowHMS() {
    const d = new Date();
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  }
  function daysInMonth(ym) {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  }
  function dowOfDate(ym, d) {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, d).getDay();
  }
  const DOW_KO = ['일','월','화','수','목','금','토'];
  const TODAY = '2026-05-28';

  const STATE = {
    selectedDeptId: 'C0',  /* 임직원 관리와 동일 부서 id ('C0'=전사 전체) */
    ym: '2026-05',
    viewMode: 'month',     /* 'month'(월간 일단위 매트릭스, 기본) | 'week'(주간 스케줄표) */
    weekStart: null,       /* 주간 모드 현재 주의 월요일(YYYY-MM-DD). null=오늘 기준 */
    targetEmp: null,
    targetDept: null,
    plan: {},              /* { 'empId|YYYY-MM-DD': 'WTD01' | '-' } — 결정적 시드 */
    lastRefreshAt: null,
    /* 권한 모드 — true: 전사 관리자(조직도 전체 조회) / false: 부서장(자기 부서만 편성) */
    isManager: true,
    myDept: '개발팀',       /* 부서장 모드에서 편성 대상이 되는 본인 부서 */
    treeCollapsed: true,    /* 좌측 조직도 접힘 여부 — 화면 진입 시 접힘이 기본 */
  };
  const CHEV_L = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`;
  const CHEV_R = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;
  function HRI() { return window.App && App.HRInfoMgmt; }
  function selectedEmps() {
    const h = HRI();
    return (h && h.empsInDept) ? h.empsInDept(getEmps(), STATE.selectedDeptId) : getEmps();
  }
  function selectedScopeName() {
    if (STATE.selectedDeptId === 'C0') return '성원애드피아 전체';
    const h = HRI();
    return (h && h.deptName && h.deptName(STATE.selectedDeptId)) || STATE.selectedDeptId;
  }

  function ensureDeps() {
    return App.AttShifts && (App.Employees || (App.AttStatus && App.AttStatus.EMP_LIST));
  }

  function getEmps() {
    /* 임직원 관리와 동기화된 근태 명단(App.AttStatus.EMP_LIST)을 단일 소스로 사용 */
    if (App.AttStatus && App.AttStatus.EMP_LIST && App.AttStatus.EMP_LIST.length) {
      return App.AttStatus.EMP_LIST.map(e => ({ id: e.id, name: e.name, dept: e.dept, rank: e.rank || '', position: e.position || '', shift: e.shift || 'WTD01' }));
    }
    if (App.Employees && App.Employees.length) return App.Employees.slice();
    return [];
  }
  function getDepts() {
    return Array.from(new Set(getEmps().map(e => e.dept).filter(Boolean)));
  }
  /* 신규 입사자(스케줄 미배정 추정) — 근무정책 설정 > 근무조 설정과 동일한 mock 판정(사번 끝 2자리 % 9 === 0).
     두 화면이 같은 인원을 '신규·미배정'으로 표시하도록 동일 로직 유지. */
  function isNewUnscheduled(emp) {
    const t = Number(String(emp.id).replace(/\D/g, '').slice(-2)) || 0;
    return t % 9 === 0;
  }

  /* 결정적 시드 — 일자별 근무조를 App.AttStatus.shiftCodeForDate 로 해석(단일 진실원).
     주말 휴무, 평일은 부서 전용 주간/야간 조가 모두 있으면 주차마다 교대(생산본부 등).
     나의 근태현황 / 근태 현황 캘린더와 동일한 값. */
  function ensurePlan() {
    const emps = getEmps();
    const days = daysInMonth(STATE.ym);
    emps.forEach(emp => {
      for (let d = 1; d <= days; d++) {
        const dateStr = `${STATE.ym}-${pad2(d)}`;
        const key = `${emp.id}|${dateStr}`;
        if (STATE.plan[key] !== undefined) continue;
        const wd = dowOfDate(STATE.ym, d);
        if (wd === 0 || wd === 6) { STATE.plan[key] = '-'; continue; }
        STATE.plan[key] = scheduleOverride(emp, dateStr, basePlanCode(emp, dateStr));
      }
    });
  }

  function shiftMonth(ym, delta) {
    const [y, m] = ym.split('-').map(Number);
    let nm = m + delta, ny = y;
    while (nm <= 0)  { nm += 12; ny -= 1; }
    while (nm > 12)  { nm -= 12; ny += 1; }
    return `${ny}-${pad2(nm)}`;
  }

  /* 근무조 색상 — 마스터 등록 순서(index) 기준 c0~c9 순환.
     스케줄배정표 톤: 근무조마다 고유 색으로 구분(야간은 호출부에서 shift-chip--night 사용). */
  function shiftColorClass(code) {
    const list = App.AttShifts ? App.AttShifts.list() : [];
    const idx = list.findIndex(s => s.code === code);
    return idx >= 0 ? `shift-chip--c${idx % 10}` : 'shift-chip--day';
  }
  /* 근무조 칩 — full=true 면 근무조명+시간, false 면 코드만. 휴무(-)는 '휴일' 칩.
     dateLabel 지정 시 카드 상단에 날짜 라벨을 붙인다(월간 예외 블록용). */
  function shiftChip(code, full, dateLabel, appr) {
    if (!code || code === '-') return '<span class="shift-chip shift-chip--off">휴일</span>';
    const s = App.AttShifts && App.AttShifts.get(code);
    if (!s) return `<span class="shift-chip">${esc(code)}</span>`;
    const night = s.isNight;
    const cls = night ? 'shift-chip--night' : shiftColorClass(code);
    const nm = s.label || s.code;
    let title = `${dateLabel ? dateLabel + ' · ' : ''}${nm} (${s.code}) ${s.start}~${s.end}${night ? ' · 야간' : ''}`;
    if (appr) title += ` · 근무조 변경 승인${appr.from ? ` (${appr.from}→${s.code})` : ''}${appr.reason ? ' · ' + appr.reason : ''}`;
    /* 근무코드 + 근무코드명 함께 표기 (full 이면 시간까지). appr(승인 오버라이드)면 '승인' 마커. */
    const apprHTML = appr ? `<span class="shift-chip__appr" title="근무조 변경 승인">승인</span>` : '';
    const dateHTML = dateLabel ? `<span class="shift-chip__date">${esc(dateLabel)}</span>` : '';
    const hd = `<span class="shift-chip__hd"><strong class="shift-chip__code">${esc(s.code)}</strong> <span class="shift-chip__nm">${esc(nm)}</span></span>`;
    const inner = full
      ? `${apprHTML}${dateHTML}${hd}<span class="shift-chip__t">${esc(s.start)}~${esc(s.end)}</span>`
      : `${apprHTML}${dateHTML}${hd}`;
    return `<span class="shift-chip ${cls}${appr ? ' shift-chip--appr' : ''}" title="${esc(title)}">${inner}</span>`;
  }
  /* 승인 근무조 변경 오버라이드 — 있으면 그 근무조로 확정 표시. */
  function overrideAt(emp, dateStr) {
    const O = App.AttShiftOverrides;
    return (O && O.get) ? O.get(emp.id, dateStr) : null;
  }
  /* 표시용 실효 근무조 — 승인 오버라이드 우선, 없으면 기본/편성 plan. */
  function effAt(emp, dateStr) {
    const ov = overrideAt(emp, dateStr);
    if (ov) return { code: ov.code, ov };
    return { code: planAt(emp, dateStr), ov: null };
  }
  /* 월간 매트릭스용 — 코드 칩(휴무는 가운뎃점) */
  function shiftKindPill(code) {
    if (!code || code === '-') return '<span class="t-muted">·</span>';
    return shiftChip(code, false);
  }
  /* 근무조 근무시간(시간, 소수) — workHours 'H:MM' 파싱 */
  function shiftHours(code) {
    const s = App.AttShifts && App.AttShifts.get(code);
    if (!s || !s.workHours) return 0;
    const m = String(s.workHours).match(/^(\d+):(\d{2})$/);
    if (m) return Number(m[1]) + Number(m[2]) / 60;
    const n = parseFloat(s.workHours);
    return isNaN(n) ? 0 : n;
  }
  function fmtHours(h) { return (Math.round(h * 10) / 10).toString().replace(/\.0$/, '') + 'h'; }

  /* ============ 주간 날짜 헬퍼 (월요일 기준, 월 경계 무관 연속 이동) ============ */
  function parseYMD(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function ymdOf(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
  function mondayOf(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const wd = x.getDay(); x.setDate(x.getDate() + (wd === 0 ? -6 : 1 - wd)); return x; }
  function currentWeekStart() { return STATE.weekStart || ymdOf(mondayOf(parseYMD(TODAY))); }
  function shiftWeekBy(delta) {
    const b = parseYMD(currentWeekStart());
    const nx = new Date(b.getFullYear(), b.getMonth(), b.getDate() + 7 * delta);
    STATE.weekStart = ymdOf(nx);
    STATE.ym = `${nx.getFullYear()}-${pad2(nx.getMonth() + 1)}`;
  }
  function weekDates7(start) {
    const b = parseYMD(start); const out = [];
    for (let i = 0; i < 7; i++) { const d = new Date(b.getFullYear(), b.getMonth(), b.getDate() + i); out.push(ymdOf(d)); }
    return out;
  }
  /* 임의 날짜의 근무조 — 캐시 없으면 결정적으로 계산(월 경계 무관) */
  function planAt(emp, dateStr) {
    const key = `${emp.id}|${dateStr}`;
    if (STATE.plan[key] !== undefined) return STATE.plan[key];
    const wd = parseYMD(dateStr).getDay();
    let v;
    if (wd === 0 || wd === 6) v = '-';
    else v = scheduleOverride(emp, dateStr, basePlanCode(emp, dateStr));
    STATE.plan[key] = v;
    return v;
  }

  /* 월(月) 내 주차 인덱스 — 일요일이 지날 때마다 +1 (근태 현황 weekIndexOfDate 와 동일 규칙). */
  function weekIdx(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    let idx = 0;
    for (let dd = 2; dd <= d; dd++) { if (new Date(y, m - 1, dd).getDay() === 0) idx++; }
    return idx;
  }

  /* ============ 기본 근무조 산출 — 「근무정책 설정」 반영(현실 고증) ============
     부서에 설정된 근무정책(통상/교대)과 사용 근무코드·기본 근무코드를 근거로 평일 근무조를 정한다.
       · 통상근무 — 부서 기본 근무코드로 매 평일 고정 (경영지원본부 = WTD01).
       · 교대근무 — 부서 사용 근무코드 배열 안에서 주차마다 교대(사원별 시작조는 배정값 유지, 없으면 기본조).
       · 정책 미설정 부서 — 공유 단일 진실원(App.AttStatus.shiftCodeForDate) 폴백. */
  function basePlanCode(emp, dateStr) {
    const wd = parseYMD(dateStr).getDay();
    if (wd === 0 || wd === 6) return '-';
    const P = App.AttWorkPolicy;
    const pol = (P && P.deptPolicy) ? P.deptPolicy(emp.dept) : null;
    const codes = (pol && pol.codes) ? pol.codes : [];
    if (pol && codes.length) {
      const def = (P.deptDefaultShift && P.deptDefaultShift(emp.dept)) || codes[0];
      if (pol.policy === 'shift') {
        let start = codes.indexOf(emp.shift);          /* 사원 배정조가 부서 코드에 있으면 시작조로(교대 스태거) */
        if (start < 0) start = Math.max(0, codes.indexOf(def));
        return codes[(start + weekIdx(dateStr)) % codes.length];
      }
      return def;                                      /* 통상 — 기본 근무코드 고정 */
    }
    const A = App.AttStatus;
    return (A && A.shiftCodeForDate) ? A.shiftCodeForDate(emp, dateStr) : (emp.shift || 'WTD01');
  }

  /* ============ 데모용 편성 상세 오버레이 ============
     설정된 스케줄 위에 일부 인원의 특정 평일에 「대체 근무조」를 결정적으로 배정(월간 예외 블록 시연).
     · 결정적(사번+일자) — 새로고침/재렌더에도 동일. 이 화면 로컬 표현(공유 근태 데이터 불변).
     · 대체 근무조는 반드시 부서 「사용 근무코드」 내에서 선택 → 설정 배너와 일관(현실 고증).
     · 대상 ≈ 1/3 인원, 월 최대 2 평일. */
  function scheduleOverride(emp, dateStr, baseCode) {
    if (!baseCode || baseCode === '-') return baseCode;
    const seed = Number(String(emp.id).replace(/\D/g, '').slice(-3)) || 0;
    if (seed % 3 !== 0) return baseCode;                      /* 약 1/3 인원만 대상 */
    const dd = Number(dateStr.slice(-2));
    const day1 = 3 + (seed % 5);                              /* 3~7일 중 하루 */
    const day2 = 19 + (seed % 4);                             /* 19~22일 중 하루 */
    if (dd !== day1 && dd !== day2) return baseCode;
    const allowed = deptAllowedCodes(emp.dept) || [];         /* 부서 사용 근무코드 */
    const others = allowed.filter(c => c !== baseCode);
    if (!others.length) return baseCode;
    return others[seed % others.length];
  }

  /* ============ 좌측 조직도 — 임직원 관리 트리 단일 소스 재사용 ============ */
  function buildShiftTree() {
    const h = HRI();
    return (h && h.deptTreeHTML) ? h.deptTreeHTML(STATE.selectedDeptId, { emps: getEmps() }) : '';
  }

  /* ============ Header ============ */
  function renderHead() {
    /* 전사 관리자: 선택 범위(전체/부서) 타이틀 / 부서장: 본인 부서 고정 표기 */
    let scopeChip;
    if (STATE.isManager) {
      const name = selectedScopeName();
      const cnt = selectedEmps().length;
      scopeChip = `<div class="att-target-chip" style="cursor:default;"><span class="att-target-chip__name">${esc(name)}</span><span class="att-target-chip__meta">${cnt}명</span></div>`;
    } else {
      const cnt = getEmps().filter(e => e.dept === STATE.myDept).length;
      scopeChip = `<div class="att-target-chip" style="cursor:default;"><span class="att-target-chip__name">${esc(STATE.myDept)}</span><span class="att-target-chip__meta">부서장 · ${cnt}명</span></div>`;
    }
    const isWeek = STATE.viewMode === 'week';
    const modeToggle = `
      <div class="tabs tabs--segmented" style="display:inline-flex;width:auto;">
        <div class="tabs__nav">
          <button type="button" class="tabs__tab ${isWeek ? 'is-active' : ''}" data-ss-mode="week">주간</button>
          <button type="button" class="tabs__tab ${!isWeek ? 'is-active' : ''}" data-ss-mode="month">월간</button>
        </div>
      </div>`;
    let titleHTML;
    if (isWeek) {
      const dates = weekDates7(currentWeekStart());
      const a = parseYMD(dates[0]), b = parseYMD(dates[6]);
      const f = (d) => `${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
      titleHTML = `<div class="att-tb__title" style="font-size:var(--fs-lg);">${f(a)} ~ ${f(b)}</div>`;
    } else {
      titleHTML = `<div class="att-tb__title">${STATE.ym.replace('-', '.')}</div>`;
    }
    const expander = (STATE.isManager && STATE.treeCollapsed)
      ? `<button class="split__expander" type="button" data-ss-tree-toggle title="조직도 펼치기" style="display:inline-flex;"><span>조직도</span>${CHEV_R}</button>`
      : '';
    return `
      <div class="att-tb">
        <div class="att-tb__left">
          ${expander}
          ${titleHTML}
          <div class="att-tb__nav">
            <button type="button" data-ss-ym-prev aria-label="${isWeek ? '이전 주' : '이전 달'}">‹</button>
            <button type="button" data-ss-today>오늘</button>
            <button type="button" data-ss-ym-next aria-label="${isWeek ? '다음 주' : '다음 달'}">›</button>
          </div>
          ${scopeChip}
        </div>
        <div style="flex:1;display:flex;justify-content:center;">${modeToggle}</div>
        <div class="att-tb__right">
          <button class="btn btn--sm btn--primary" type="button" data-ss-goto-manage>근무조 배치</button>
        </div>
      </div>
    `;
  }

  /* ============ Views ============ */

  /* 선택된 부서명(전체=C0 이면 '') — 정책·근무코드 조회 기준 */
  function currentDeptName() {
    if (STATE.selectedDeptId === 'C0') return '';
    const h = HRI();
    return (h && h.deptName && h.deptName(STATE.selectedDeptId)) || '';
  }
  /* 부서가 사용 가능한 근무코드 — 근무정책 설정(App.AttWorkPolicy)의 codes 우선,
     미지정 시 근무조 마스터 useDepts(App.AttShifts.forDept) 기준으로 폴백. */
  function deptAllowedCodes(deptName) {
    if (!deptName) return null;
    const P = App.AttWorkPolicy;
    if (P && P.deptPolicy) {
      const codes = (P.deptPolicy(deptName).codes || []);
      if (codes.length) return codes.slice();
    }
    if (App.AttShifts && App.AttShifts.forDept) return App.AttShifts.forDept(deptName).map(s => s.code);
    return null;
  }
  /* 근무정책 뱃지 — 통상근무(info) / 교대근무(purple). 근무정책 설정 화면(policyPill)과 동일 톤. */
  function policyPillHTML(policy) {
    return policy === 'shift'
      ? '<span class="pill pill--purple">교대근무</span>'
      : '<span class="pill pill--info">통상근무</span>';
  }
  /* 근무코드 인라인 표기 (코드 + 코드명 + 시간) — 「부서별 근무코드 설정」 배너의 po-info__code 표기와 동일. */
  function codeInlineHTML(code) {
    const s = (App.AttShifts && App.AttShifts.get) ? App.AttShifts.get(code) : null;
    const lbl = s ? (s.label || code) : code;
    const tm  = s ? `<span class="t-muted" style="font-weight:var(--fw-regular);">${esc(s.start)}~${esc(s.end)}</span>` : '';
    return `<span class="ss-codeitem"><span class="po-info__code">${esc(code)}</span> ${esc(lbl)} ${tm}</span>`;
  }

  /* ============ 상단 — 부서 근무정책 · 사용 근무코드 배너 ============
     「부서별 근무코드 설정」 화면의 .po-info 요약 배너와 동일한 UI Kit 컴포넌트/표기 사용.
     소스도 동일: App.AttWorkPolicy.deptPolicy(부서).policy/codes. */
  function renderPolicyBar() {
    const deptName = currentDeptName();
    if (!deptName) return '';   /* 전체(C0) — 배너 숨김 */
    const P = App.AttWorkPolicy;
    const cfg = (P && P.deptPolicy) ? P.deptPolicy(deptName) : { policy: 'regular', codes: [] };
    const codes = cfg.codes || [];
    const codeVal = codes.length
      ? codes.map(codeInlineHTML).join('<span class="ss-codesep">·</span>')
      : `<span class="t-muted" style="font-weight:var(--fw-regular);">미설정</span>`;
    return `
      <div class="po-info" style="min-height:34px;width:max-content;max-width:100%;flex:0 0 auto;">
        <span class="po-info__pill">
          <span class="po-info__pill-label">근무정책</span>
          <span class="po-info__pill-value">${policyPillHTML(cfg.policy)}</span>
        </span>
        <span class="po-info__sep">|</span>
        <span class="po-info__pill">
          <span class="po-info__pill-label">사용 근무코드</span>
          <span class="po-info__pill-value">${codeVal}</span>
        </span>
      </div>`;
  }

  /* ============ 성명 셀 (임직원 관리와 동일 — 아바타 + 이름 + 부서·직책 sub) ============ */
  function empNameCell(emp, extraHTML) {
    const sub = [emp.dept, emp.position].filter(Boolean).map(esc).join(' · ');
    const ch = esc((emp.name || '').slice(0, 1));
    return `
      <td class="ssw-tbl__namecell">
        <div class="ssw-tbl__person">
          <span class="ssw-tbl__ava">${ch}</span>
          <div class="ssw-tbl__nm">
            <div class="ssw-tbl__nm-top"><span class="ssw-tbl__name">${esc(emp.name)}</span></div>
            ${sub ? `<div class="ssw-tbl__nm-sub">${sub}</div>` : ''}
          </div>
        </div>
        ${extraHTML || ''}
      </td>`;
  }

  /* 대상 인원 — 선택 부서(자손 포함). 전체(C0)면 전 직원(empsInDept 가 전체 반환). */
  function scopeEmps() { return selectedEmps(); }

  /* ============ 주간 뷰 — 성명 1열 + 날짜 열, 셀은 근무조 색칩(명칭+시간) ============ */
  function renderWeekView() {
    ensurePlan();
    const emps = scopeEmps();
    const dates = weekDates7(currentWeekStart());

    const dayHead = dates.map(ds => {
      const dt = parseYMD(ds); const wd = dt.getDay();
      const cls = wd === 0 ? 'is-sun' : wd === 6 ? 'is-sat' : '';
      return `<th class="ssw-tbl__day ${cls}"><span class="ssw-tbl__dnum">${pad2(dt.getMonth() + 1)}.${pad2(dt.getDate())}</span><span class="ssw-tbl__dw">(${DOW_KO[wd]})</span></th>`;
    }).join('');

    const rows = emps.map(emp => {
      const cells = dates.map((ds) => {
        const eff = effAt(emp, ds);
        const dt = parseYMD(ds); const wd = dt.getDay();
        const cls = wd === 0 ? 'is-sun' : wd === 6 ? 'is-sat' : '';
        return `<td class="ssw-tbl__day ${cls}">${shiftChip(eff.code, true, null, eff.ov)}</td>`;
      }).join('');
      return `<tr>${empNameCell(emp)}${cells}</tr>`;
    }).join('');

    return `
      <div class="table-card" style="flex:1 1 0;display:flex;flex-direction:column;min-height:0;">
        <div class="table-card__cap"><strong>총 ${emps.length}명</strong></div>
        <div class="ssw-wrap">
          <table class="ssw-tbl ssw-tbl--sched">
            <thead>
              <tr>
                <th class="ssw-tbl__namecell-h">성명</th>
                ${dayHead}
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="${dates.length + 1}" style="text-align:center;padding:30px;color:var(--color-text-muted);">표시할 인원이 없습니다.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /* ============ 월간 뷰 — 성명 1열 + 주차 열(+ 상태), 셀은 대표 근무조 + '외 N건' ============ */
  /* 월의 평일(월~금)을 월요일 기준 주(週)로 묶는다. 각 원소: { dates: [YYYY-MM-DD, ...] } */
  function monthWeeks(ym) {
    const [y, m] = ym.split('-').map(Number);
    const days = daysInMonth(ym);
    const weeks = [];
    let cur = null;
    for (let d = 1; d <= days; d++) {
      const date = new Date(y, m - 1, d);
      const wd = date.getDay();
      if (wd === 0 || wd === 6) continue;          /* 평일만 */
      const monKey = ymdOf(mondayOf(date));
      if (!cur || cur.monKey !== monKey) { cur = { monKey, dates: [] }; weeks.push(cur); }
      cur.dates.push(`${ym}-${pad2(d)}`);
    }
    return weeks;
  }
  function mmdd(ds) { const p = ds.split('-'); return `${p[1]}/${p[2]}`; }
  function renderMonthView() {
    ensurePlan();
    const emps = scopeEmps();
    const weeks = monthWeeks(STATE.ym);

    const wkHead = weeks.map((w, i) => {
      const a = w.dates[0], b = w.dates[w.dates.length - 1];
      return `<th class="ssw-tbl__wk"><span class="ssw-tbl__wk-no">${i + 1}주차</span><span class="ssw-tbl__wk-range">${mmdd(a)}~${mmdd(b)}</span></th>`;
    }).join('');

    const rows = emps.map(emp => {
      const wkCells = weeks.map(w => {
        const entries = w.dates
          .map(ds => { const e = effAt(emp, ds); return { ds, code: e.code, ov: e.ov }; })
          .filter(e => e.code && e.code !== '-');
        if (!entries.length) {
          return `<td class="ssw-tbl__wk"><div class="ssw-wk"><span class="shift-chip shift-chip--off">휴무</span></div></td>`;
        }
        /* 대표 근무조 = 최빈값 */
        const freq = {};
        entries.forEach(e => { freq[e.code] = (freq[e.code] || 0) + 1; });
        let primary = entries[0].code, best = 0;
        Object.keys(freq).forEach(c => { if (freq[c] > best) { best = freq[c]; primary = c; } });
        /* 예외일(대표 외) — 큰 근무코드 블록 내부에 [날짜 + 근무코드] 로 담는다. 승인 오버라이드는 '승인' 마커. */
        const exc = entries.filter(e => e.code !== primary);
        const excHTML = exc.map(e => shiftChip(e.code, true, mmdd(e.ds), e.ov)).join('');
        /* 대표 근무조가 승인 오버라이드로 채워진 주(주 전체 변경)면 대표 카드에도 마커 */
        const primaryOv = (entries.find(e => e.code === primary && e.ov) || {}).ov || null;
        return `<td class="ssw-tbl__wk"><div class="ssw-wk">${shiftChip(primary, true, null, primaryOv)}${excHTML}</div></td>`;
      }).join('');
      return `<tr>${empNameCell(emp)}${wkCells}</tr>`;
    }).join('');
    const colspan = weeks.length + 1;

    return `
      <div class="table-card" style="flex:1 1 0;display:flex;flex-direction:column;min-height:0;">
        <div class="table-card__cap"><strong>총 ${emps.length}명</strong></div>
        <div class="ssw-wrap">
          <table class="ssw-tbl ssw-tbl--sched ssw-tbl--month">
            <thead>
              <tr>
                <th class="ssw-tbl__namecell-h">성명</th>
                ${wkHead}
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="${colspan}" style="text-align:center;padding:30px;color:var(--color-text-muted);">표시할 인원이 없습니다.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderBody() {
    const table = STATE.viewMode === 'week' ? renderWeekView() : renderMonthView();
    return renderPolicyBar() + table;
  }

  /* 전사 관리자 = 조직도 + 우측 현황판 / 부서장 = 조직도 없이 본인 부서 화면만 (화면 분리) */
  function layoutHTML() {
    const head = renderHead();
    const body = renderBody();
    if (STATE.isManager) {
      return `
        <div class="split split--collapsible${STATE.treeCollapsed ? ' is-left-collapsed' : ''}" style="--split-left:240px;flex:1 1 0;min-height:0;">
          <aside class="split__left">
            <div class="split__head"><h3>조직도</h3><button class="split__collapser" type="button" data-ss-tree-toggle title="조직도 접기">${CHEV_L}</button></div>
            <div class="split__body" style="padding:0;display:flex;flex-direction:column;min-height:0;">
              <ul class="tree tree--selectable" style="flex:1;overflow:auto;padding:8px 10px;margin:0;">${buildShiftTree()}</ul>
            </div>
          </aside>
          <section class="split__right">
            <header class="att-page__head">${head}</header>
            <div class="att-page__body" style="display:flex;flex-direction:column;gap:14px;min-height:0;overflow:hidden;">${body}</div>
          </section>
        </div>`;
    }
    return `
      <div style="display:flex;flex-direction:column;flex:1 1 0;min-height:0;">
        <header class="att-page__head">${head}</header>
        <div class="att-page__body" style="display:flex;flex-direction:column;gap:14px;min-height:0;overflow:hidden;">${body}</div>
      </div>`;
  }

  function renderShell(pageEl) {
    pageEl.innerHTML = `<div data-ss-root style="flex:1 1 0;min-height:0;display:flex;flex-direction:column;"></div>`;
    ensureFloatingToggle(pageEl);
  }
  function renderAll(pageEl) {
    /* 부서장 모드는 항상 본인 부서(자손 포함) 고정 */
    if (!STATE.isManager) {
      const h = HRI();
      STATE.selectedDeptId = (h && h.deptIdOf && h.deptIdOf(STATE.myDept)) || 'C0';
    }
    const root = pageEl.querySelector('[data-ss-root]');
    if (root) root.innerHTML = layoutHTML();
    updateFloatingToggle(pageEl);
  }

  /* ============ 권한 토글 — 우측 하단 floating ============ */
  function ensureFloatingToggle(pageEl) {
    if (pageEl.querySelector('[data-ss-perm-fab]')) return;
    const fab = document.createElement('div');
    fab.setAttribute('data-ss-perm-fab', '');
    fab.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:900;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-pill);box-shadow:var(--shadow-md);padding:6px 10px;display:flex;align-items:center;gap:8px;';
    fab.innerHTML = `
      <span style="font-size:var(--fs-xs);color:var(--color-text-muted);">권한</span>
      <button type="button" class="btn btn--xs" data-ss-perm="manager">전사 관리자</button>
      <button type="button" class="btn btn--xs" data-ss-perm="dept">부서장</button>`;
    pageEl.appendChild(fab);
  }
  function updateFloatingToggle(pageEl) {
    pageEl.querySelectorAll('[data-ss-perm]').forEach(b => {
      const on = (b.dataset.ssPerm === 'manager') === STATE.isManager;
      b.classList.toggle('btn--primary', on);
    });
  }

  function bind(pageEl) {
    if (pageEl.dataset.ssBound === '1') return;
    pageEl.dataset.ssBound = '1';

    pageEl.addEventListener('click', e => {
      /* 권한 토글 (우측 하단 floating) */
      const perm = e.target.closest('[data-ss-perm]');
      if (perm) {
        const wantManager = perm.dataset.ssPerm === 'manager';
        if (wantManager !== STATE.isManager) {
          STATE.isManager = wantManager;
          /* 전사 관리자 전환 시 전체로 초기화. 부서장은 renderAll 에서 본인 부서로 고정 */
          if (wantManager) STATE.selectedDeptId = 'C0';
          renderAll(pageEl);
        }
        return;
      }

      /* 조직도 접기/펼치기 */
      if (e.target.closest('[data-ss-tree-toggle]')) { STATE.treeCollapsed = !STATE.treeCollapsed; renderAll(pageEl); return; }

      /* 좌측 조직도 (전사 관리자) — 임직원 관리와 동일 트리. data-id 로 선택 부서 전환 */
      if (STATE.isManager) {
        const treeNode = e.target.closest('.tree__node[data-id]');
        if (treeNode) { STATE.selectedDeptId = treeNode.dataset.id; renderAll(pageEl); return; }
      }

      /* 주간/월간 모드 토글 */
      const modeBtn = e.target.closest('[data-ss-mode]');
      if (modeBtn) {
        const mode = modeBtn.dataset.ssMode;
        if (mode !== STATE.viewMode) { STATE.viewMode = mode; if (mode === 'week') STATE.weekStart = null; renderAll(pageEl); }
        return;
      }

      const isWeek = STATE.viewMode === 'week';
      if (e.target.closest('[data-ss-ym-prev]')) { if (isWeek) shiftWeekBy(-1); else { STATE.ym = shiftMonth(STATE.ym, -1); STATE.plan = {}; } renderAll(pageEl); return; }
      if (e.target.closest('[data-ss-ym-next]')) { if (isWeek) shiftWeekBy(+1); else { STATE.ym = shiftMonth(STATE.ym, +1); STATE.plan = {}; } renderAll(pageEl); return; }
      if (e.target.closest('[data-ss-today]'))   { STATE.ym = TODAY.slice(0, 7); STATE.weekStart = null; if (!isWeek) STATE.plan = {}; renderAll(pageEl); return; }

      if (e.target.closest('[data-ss-refresh]')) {
        STATE.plan = {};
        STATE.lastRefreshAt = nowHMS();
        renderAll(pageEl);
        window.toast && window.toast('근무조 현황을 갱신했습니다.', 'success');
        return;
      }

      if (e.target.closest('[data-ss-goto-manage]')) {
        if (App.Tabs && typeof App.Tabs.open === 'function') {
          App.Tabs.open({ id: 'att-shift', label: '근무조 배치', page: 'page-att-shift' });
        } else {
          window.toast && window.toast('근무조 배치 화면을 열 수 없습니다.', 'warning');
        }
        return;
      }

      const dp = e.target.closest('[data-ss-dept-open]');
      if (dp) { e.preventDefault(); STATE.scope = 'dept'; STATE.targetDept = dp.dataset.ssDeptOpen; renderAll(pageEl); return; }
    });

    pageEl.addEventListener('change', e => {
      const td = e.target.closest('[data-ss-target-dept]');
      if (td) { STATE.targetDept = td.value; renderAll(pageEl); return; }
    });
  }

  /* 임직원별 — 전자결재 구성원 picker 호출 (근태 현황과 동일). 선택 시 그 직원 근무조로 전환. */
  function openEmpPicker(pageEl) {
    if (typeof App.openEmpPicker !== 'function') {
      window.toast && window.toast('직원 선택 다이얼로그를 사용할 수 없습니다.', 'warning');
      return;
    }
    App.openEmpPicker({
      action: 'callback',
      multi: false,
      onConfirm(selected) {
        if (selected && selected[0]) {
          const e = selected[0];
          /* picker 가 반환한 직원이 명단에 없으면 동적 추가 (mock 환경) */
          if (App.AttStatus && App.AttStatus.EMP_LIST && !App.AttStatus.EMP_LIST.find(x => x.id === e.id)) {
            App.AttStatus.EMP_LIST.push({ id: e.id, name: e.name, dept: e.dept || '-', shift: 'WTD01' });
            STATE.plan = {};
          }
          STATE.targetEmp = e.id;
          STATE.scope = 'emp';
          renderAll(pageEl);
        }
      },
    });
  }

  function initPage() {
    const pageEl = document.getElementById('page-att-shift-status');
    if (!pageEl) return;
    pageEl.__onShow = () => {
      if (!ensureDeps()) {
        pageEl.innerHTML = `<div style="padding:24px;color:var(--color-text-muted);">근무조 모듈 로드 중...</div>`;
        return;
      }
      /* 임직원 관리 명단과 동기화 — 변경 시 근무조 배치 캐시 무효화 */
      if (App.AttStatus.syncEmpList && App.AttStatus.syncEmpList()) STATE.plan = {};
      /* 승인된 근무조 변경 오버라이드 시드/구독 (전자결재 승인 결과 반영) */
      if (App.AttShiftOverrides) {
        App.AttShiftOverrides.ensureSeed();
        if (!pageEl.dataset.ssOvBound) { pageEl.dataset.ssOvBound = '1'; App.AttShiftOverrides.onChange(() => { const el = document.getElementById('page-att-shift-status'); if (el && el.dataset.ssShellMounted) renderAll(el); }); }
      }
      if (!pageEl.dataset.ssShellMounted) {
        pageEl.dataset.ssShellMounted = '1';
        renderShell(pageEl);
        bind(pageEl);
        STATE.lastRefreshAt = nowHMS();
      }
      STATE.treeCollapsed = true;   /* 화면 진입 시 조직도 접힘을 기본값으로 (필요 시 "조직도 >" 버튼으로 펼침) */
      renderAll(pageEl);
    };
  }

  const prev = App.initPages;
  App.initPages = function () {
    if (typeof prev === 'function') prev();
    initPage();
  };
})();
