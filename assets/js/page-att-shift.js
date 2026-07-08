/* =========================================================
 * Page: 근태 > 근태/스케줄 > 근무조 현황
 *
 *  본문 — 부서 팀원들의 월별 근무조 배정표.
 *    팀장이 본인 부서 인원의 일별 근무조(A/B/.../휴무)를 지정하고 제출한다.
 *
 *  [근무조 설정] 버튼 — 근무조 마스터(A~J 정의 / 시간 / 휴게 / 사용부서) 를 modal 로 열어 추가·수정.
 *
 *  공개 API: App.AttShifts.list() / .get(code) / .forDept(dept) / .depts()
 *    — 근태 현황 / 근로계약 화면에서 매핑 조회용.
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  /* ============ 환경 ============ */
  const TODAY   = '2026-05-28';
  const HR_NAME = '정혜진';

  /* 사용 부서 마스터 — App.Employees 의 실제 부서 목록에서 도출 (단일 진실원).
     fallback 은 App.Employees 가 아직 로드되지 않은 환경용. */
  const DEPT_FALLBACK = ['임원실','감사팀','개발1팀','개발2팀','회계팀','인사총무팀','자산관리팀','홍보팀','영업팀','생산연구소','생산관리팀'];
  function getDeptList() {
    const emps = (window.App && App.Employees) ? App.Employees : [];
    if (!emps.length) return DEPT_FALLBACK.slice();
    const seen = new Set();
    const out = [];
    emps.forEach(e => { if (e.dept && !seen.has(e.dept)) { seen.add(e.dept); out.push(e.dept); } });
    return out;
  }

  /* ============ Helper ============ */
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
  function hm(t) { return /^\d{2}:\d{2}$/.test(t) ? t : '-'; }
  function diffHours(start, end) {
    if (!hm(start) || !hm(end)) return 0;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins <= 0) mins += 24 * 60;   /* 야간조 — 익일 종료 */
    return Math.round(mins / 6) / 10; /* 0.1 단위 */
  }
  function toMin(t) { if (!hm(t)) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + m; }
  /* 야간(심야) 근무 판정 — 근무 시간 구간이 22:00~06:00 심야시간대와 일부라도 겹치면 야간.
     익일 퇴근(퇴근 ≤ 출근)은 날짜를 넘기는 근무로 보고 심야 포함 여부를 계산한다. */
  function autoNight(start, end) {
    if (!hm(start) || !hm(end)) return false;
    return nightMinutes(start, end) > 0;
  }
  /* 두 분(min) 구간 [as,ae)·[bs,be) 의 겹침 길이 */
  function overlapMin(as, ae, bs, be) { return Math.max(0, Math.min(ae, be) - Math.max(as, bs)); }
  /* 심야시간(분) — 근무 구간과 22:00~06:00 심야대의 겹침. 익일 퇴근은 +24h 로 펼쳐 계산.
     심야대는 하루마다 반복되므로 [00:00~06:00], [22:00~30:00(=익일06:00)], [46:00~54:00] 세 창과 겹침 합산. */
  function nightMinutes(start, end) {
    if (!hm(start) || !hm(end)) return 0;
    let sm = toMin(start), em = toMin(end);
    if (em <= sm) em += 24 * 60;                 /* 익일 퇴근 — 날짜 넘김 */
    const wins = [[0, 360], [1320, 1800], [2760, 3240]];  /* 00~06, 22~익06, 익22~익익06 */
    return wins.reduce((acc, w) => acc + overlapMin(sm, em, w[0], w[1]), 0);
  }
  /* 'HH:MM' 시각을 10분 단위로 스냅 (출근·퇴근은 10분 단위만 허용) */
  function snap10(hm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hm || '');
    if (!m) return hm || '';
    let total = (+m[1]) * 60 + Math.round((+m[2]) / 10) * 10;
    total = ((total % 1440) + 1440) % 1440;   /* 60분 반올림·자정 넘김 방어 */
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }
  /* 분 → 'H:MM' 표기 (근무시간·연장·심야 공통) */
  function fmtMin(mins) {
    mins = Math.max(0, Math.round(mins));
    return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
  }
  /* 스케줄이 직원에게 배정되어 사용 중인지 — 사용 중이면 수정·삭제 불가 */
  function shiftInUse(code) {
    const emps = (App.AttStatus && App.AttStatus.EMP_LIST) || App.Employees || [];
    return emps.some(e => e && e.shift === code);
  }
  /* 근무코드 근태 산정 기준 재계산 — 출근/퇴근/간식(휴게)로부터 총 근무·연장·심야시간·주야 구분 산출.
     · workHours : 총 근무시간 (출~퇴 - 간식). 'H:MM'
     · breakMin  : 간식(휴게) 총 분 (1+2 합산)
     · otMin     : 연장시간 분 — 1일 소정근로 8시간 초과분
     · nightMin  : 심야시간 분 — 22:00~06:00 겹침 (간식 제외 총 구간 기준)
     · isNight   : 심야시간 포함 시 야간 근무코드로 분류 */
  const DAILY_STD_MIN = 8 * 60;
  function recompute(f) {
    const total = diffHours(f.start, f.end);
    let bmin = 0;
    if (f.breakStart && f.breakEnd)   bmin += Math.round(diffHours(f.breakStart, f.breakEnd) * 60);
    if (f.breakStart2 && f.breakEnd2) bmin += Math.round(diffHours(f.breakStart2, f.breakEnd2) * 60);
    f.breakMin = bmin;
    const workMin = Math.max(0, Math.round(total * 60) - bmin);
    f.workHours = fmtMin(workMin);
    f.otMin = Math.max(0, workMin - DAILY_STD_MIN);   /* 연장 = 8시간 초과분 */
    f.nightMin = nightMinutes(f.start, f.end);        /* 심야 = 22~06 겹침 */
    f.isNight = f.nightMin > 0;                        /* 야간 자동 판정 */
  }
  /* 근무시간유형(D=주간 / N=야간) — 심야 겹침 여부로 결정 */
  function workTypeChar(f) { return f.isNight ? 'N' : 'D'; }

  /* ============ Mock 근무코드 ============
   *   근무코드 = 출·퇴근/총 근무시간/연장·심야·간식(휴게) 등 근태 산정 기준의 단위.
   *   · code  : 시스템 자동 채번 'WT + 근무시간유형(D 주간 / N 야간) + 일련번호(2자리)'.
   *             주간 08개(WTD01~WTD08), 야간 02개(WTN01~WTN02). (심야 22~06 겹침으로 D/N 분류)
   *   · label : 근무코드 명(사람이 읽는 이름). 코드와 별개 namespace — 배치/현황 등 타 화면은 label 로 표기.
   *   · workHours / breakMin / otMin / nightMin : recompute() 로 산출되는 근태 산정값.
   *   · isGlobalDefault : 전사 기본 근무코드(부서 신설 시 상위 조직 없으면 상속) — 정확히 1개. */
  function makeMock() {
    /* 사용 부서는 App.Employees 의 실제 부서명과 일치해야 함 (배정표에서 행 매핑) */
    const rows = [
      { code: 'WTD01', label: 'A조', useDepts: [],                          start: '07:00', end: '16:00', breakStart: '12:00', breakEnd: '13:00', breakStart2: '',      breakEnd2: '' },
      { code: 'WTD02', label: 'B조', useDepts: ['개발1팀','개발2팀'],       start: '07:30', end: '19:30', breakStart: '12:00', breakEnd: '13:00', breakStart2: '17:00', breakEnd2: '17:30' },
      { code: 'WTD03', label: 'C조', useDepts: ['개발1팀','개발2팀'],       start: '08:00', end: '19:00', breakStart: '12:00', breakEnd: '13:00', breakStart2: '',      breakEnd2: '' },
      { code: 'WTD04', label: 'D조', useDepts: ['가공1팀','가공2팀','가공3팀'], start: '08:30', end: '19:00', breakStart: '12:00', breakEnd: '13:00', breakStart2: '',      breakEnd2: '', isGlobalDefault: true },
      { code: 'WTD05', label: 'E조', useDepts: ['출력팀','옵셋인쇄팀'],     start: '09:00', end: '18:00', breakStart: '12:00', breakEnd: '13:00', breakStart2: '',      breakEnd2: '' },
      { code: 'WTD06', label: 'F조', useDepts: ['출고팀','재단포장파트'],   start: '09:30', end: '18:30', breakStart: '12:00', breakEnd: '13:00', breakStart2: '',      breakEnd2: '' },
      { code: 'WTD07', label: 'G조', useDepts: [],                          start: '09:00', end: '19:00', breakStart: '12:00', breakEnd: '13:00', breakStart2: '',      breakEnd2: '' },
      { code: 'WTD08', label: 'H조', useDepts: [],                          start: '12:00', end: '21:00', breakStart: '18:00', breakEnd: '19:00', breakStart2: '',      breakEnd2: '' },
      { code: 'WTN01', label: 'I조', useDepts: ['가공1팀','가공2팀','가공3팀'], start: '19:00', end: '06:30', breakStart: '00:00', breakEnd: '01:00', breakStart2: '05:00', breakEnd2: '05:30' },
      { code: 'WTN02', label: 'J조', useDepts: ['출력팀','옵셋인쇄팀','출고팀'], start: '19:30', end: '07:30', breakStart: '00:00', breakEnd: '01:00', breakStart2: '05:00', breakEnd2: '05:30' },
    ];
    rows.forEach(r => { r.memberCount = 0; if (r.active === undefined) r.active = true; recompute(r); });   /* workHours/otMin/nightMin/isNight 산출 + 사용 상태 기본 '사용' */
    return rows;
  }

  /* 근무코드 전자결재 승인자(mock) — 추가/삭제/미사용 결재 승인 주체 */
  const APPROVER = '김상무';
  /* 변경 이력 시드 — 데모용. 사용 중이던 C조(WTD03)를 미사용 처리한 상태로 시작. */
  function seedChangeLog() {
    const w3 = STATE.shifts.find(s => s.code === 'WTD03');
    if (w3) w3.active = false;
    STATE.codeChangeLog = [
      { at: '26/05/27   14:20', code: 'WTD03', label: 'C조', type: '미사용', reason: '개발팀 근무형태 통합으로 미사용 전환', by: HR_NAME, approver: APPROVER },
      { at: '26/04/18   09:35', code: 'WTN02', label: 'J조', type: '추가',   reason: '야간 2교대 신설 (출/퇴근 19:30~07:30)', by: HR_NAME, approver: APPROVER },
      { at: '26/03/02   11:10', code: 'WTD06', label: 'F조', type: '추가',   reason: '출고팀 근무시간 분리 신설', by: HR_NAME, approver: APPROVER },
      { at: '26/02/14   16:45', code: 'WTN03', label: 'K조', type: '삭제',   reason: '배정 이력 없는 야간조 정리', by: HR_NAME, approver: APPROVER },
    ];
  }

  /* ============ STATE ============ */
  const STATE = {
    shifts: [],
    editingCode: null,       /* null = 신규, code = 수정 */
    form: null,
    /* 근무코드 수정 이력 — { code: [ { at(수정일시), by(수정자), effDate(적용시작일), reason(사유), changes:[{field,label,from,to}] } ] } */
    shiftHistory: {},
    /* 근무코드 변경 이력(전자결재 대상) — [{ at(변경일시), code(대상 근무코드), label, type:'추가'|'삭제'|'미사용'|'재개', reason(변경 사유), by(변경자), approver(승인자) }] (최신순) */
    codeChangeLog: [],
    /* 추가 모달 — 변경 사유(전자결재 상신 시 필수) */
    addMeta: { reason: '' },
    /* 삭제/미사용/재개 전자결재 상태 — { type, code, label, reason, error } */
    codeAct: null,
    /* 수정 모달 상태 — 부서 연결 근무코드 수정 시 필수 입력 (적용 시작일/사유) + 인라인 검증 에러 */
    editMeta: { reason: '', effDate: '' },
    editErrors: {},
    /* 배정표 — 부서별 근무조 현황과 동일 구조(조직도 + 주간/월간 소프트카드) + 편집 */
    ym:        '2026-05',
    viewMode:  'month',      /* 'week' | 'month' — 현황 화면과 동일 토글 */
    selectedDeptId: null,    /* 좌측 조직도 선택 부서 id (첫 렌더 시 첫 부서로 자동) */
    weekStart: null,         /* 주간 뷰 현재 주 월요일(YYYY-MM-DD). null=오늘 기준 */
    treeCollapsed: true,     /* 좌측 조직도 접힘 여부 */
    plan:      {},           /* { 'empId|YYYY-MM-DD': 근무코드 | '-' } — 일자별 편성(현황과 동일 키) */
    dept:      null,         /* (구) 호환용 — 미사용 */
    weekPlan:  {},           /* (구) 호환용 — 미사용 */
    selected:  new Set(),    /* 일괄 적용 대상으로 체크된 사원 id */
    bulkWeek:  'all',        /* 일괄 적용 대상 주차 ('all' | 주차 index) */
    bulkShift: '',           /* 일괄 적용 근무조 코드 ('' → 첫 렌더 시 부서 첫 조로 채움) */
    status:    'draft',      /* 'draft' | 'submitted' */
    submittedAt: '',
    /* 월 단위 복사 — 원본 월(과거 포함) → 대상 월(현재·미래 포함). 주 단위는 테이블 헤더에서 처리. */
    copy: {
      srcYm: null,           /* 원본 월 (null → 첫 렌더 시 지난달) */
      dstYm: null,           /* 대상 월 (null → 첫 렌더 시 이번 달) */
    },
  };

  function ensureLoaded() {
    if (!STATE.shifts.length) { STATE.shifts = makeMock(); seedChangeLog(); }
    promotePending();   /* 적용일이 도래한 예정 변경을 반영 */
  }
  /* 사용 이력 있음 판정 — 직원 배정·부서 정책 연결·팀 사용지정(useDepts) 중 하나라도 있으면 사용 중.
     사용 중이면 출/퇴근·휴게 잠금 + 삭제 불가(미사용 처리만) — 근무코드 생성 기준 불변 원칙. */
  function codeInUse(code) {
    if (!code) return false;
    if (shiftConnected(code)) return true;
    const s = STATE.shifts.find(x => x.code === code);
    return !!(s && s.useDepts && s.useDepts.length);
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function daysInMonth(ym) {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  }
  function dowOfDate(ym, d) {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, d).getDay();
  }
  const DOW_KO = ['일','월','화','수','목','금','토'];

  function deptEmps(dept) {
    const list = (window.App && App.Employees) ? App.Employees : [];
    return list.filter(e => e.dept === dept);
  }

  /* 해당 부서에서 사용 가능한 근무조만 (useDepts 미지정 = 전부서 공통) */
  function availShifts(dept) {
    return STATE.shifts.filter(s => !s.useDepts || !s.useDepts.length || s.useDepts.includes(dept));
  }

  /* 월을 달력 주차(일요일 시작)로 분할. 각 주차에 평일수(weekdayCount) 부여 — 근무일 합계용 */
  function weeksOf(ym) {
    const days = daysInMonth(ym);
    const weeks = [];
    let cur = null;
    for (let d = 1; d <= days; d++) {
      const wd = dowOfDate(ym, d);
      if (cur === null || wd === 0) { cur = { days: [] }; weeks.push(cur); }
      cur.days.push(d);
    }
    weeks.forEach((w, i) => {
      w.idx = i;
      w.first = w.days[0];
      w.last = w.days[w.days.length - 1];
      w.weekdayCount = w.days.filter(d => { const wd = dowOfDate(ym, d); return wd !== 0 && wd !== 6; }).length;
    });
    return weeks;
  }

  /* ============ 부서별 근무조 현황과 동일 소스·표기 헬퍼 ============ */
  function HRI() { return window.App && App.HRInfoMgmt; }
  function allEmps() {
    if (App.AttStatus && App.AttStatus.EMP_LIST && App.AttStatus.EMP_LIST.length)
      return App.AttStatus.EMP_LIST.map(e => ({ id: e.id, name: e.name, dept: e.dept, rank: e.rank || '', position: e.position || '', shift: e.shift || 'WTD01' }));
    if (App.Employees && App.Employees.length) return App.Employees.slice();
    return [];
  }
  function deptNameOf(id) { if (!id || id === 'C0') return ''; const h = HRI(); return (h && h.deptName && h.deptName(id)) || id; }
  function scopeEmps(deptId) { const h = HRI(); return (h && h.empsInDept) ? h.empsInDept(allEmps(), deptId) : allEmps(); }
  function deptAllowedCodes(deptName) {
    if (!deptName) return [];
    const P = App.AttWorkPolicy;
    if (P && P.deptPolicy) { const c = (P.deptPolicy(deptName).codes || []); if (c.length) return c.slice(); }
    return (App.AttShifts && App.AttShifts.forDept) ? App.AttShifts.forDept(deptName).map(s => s.code) : [];
  }
  function policyOf(deptName) { const P = App.AttWorkPolicy; return (deptName && P && P.deptPolicy) ? (P.deptPolicy(deptName).policy || 'regular') : 'regular'; }
  function deptDefaultOf(deptName) { const P = App.AttWorkPolicy; return (deptName && P && P.deptDefaultShift) ? (P.deptDefaultShift(deptName) || '') : ''; }

  /* ============ 날짜 헬퍼 (현황 화면과 동일) ============ */
  function parseYMD(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function ymdOf(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
  function mondayOf(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const wd = x.getDay(); x.setDate(x.getDate() + (wd === 0 ? -6 : 1 - wd)); return x; }
  function currentWeekStart() { return STATE.weekStart || ymdOf(mondayOf(parseYMD(TODAY))); }
  function shiftWeekBy(delta) { const b = parseYMD(currentWeekStart()); const nx = new Date(b.getFullYear(), b.getMonth(), b.getDate() + 7 * delta); STATE.weekStart = ymdOf(nx); STATE.ym = `${nx.getFullYear()}-${pad2(nx.getMonth() + 1)}`; }
  function weekDates7(start) { const b = parseYMD(start); const out = []; for (let i = 0; i < 7; i++) { const d = new Date(b.getFullYear(), b.getMonth(), b.getDate() + i); out.push(ymdOf(d)); } return out; }
  function weekIdx(dateStr) { const [y, m, d] = dateStr.split('-').map(Number); let idx = 0; for (let dd = 2; dd <= d; dd++) { if (new Date(y, m - 1, dd).getDay() === 0) idx++; } return idx; }
  function monthWeeks(ym) {
    const [y, m] = ym.split('-').map(Number); const days = daysInMonth(ym); const weeks = []; let cur = null;
    for (let d = 1; d <= days; d++) { const date = new Date(y, m - 1, d); const wd = date.getDay(); if (wd === 0 || wd === 6) continue; const monKey = ymdOf(mondayOf(date)); if (!cur || cur.monKey !== monKey) { cur = { monKey, idx: weeks.length, dates: [] }; weeks.push(cur); } cur.dates.push(`${ym}-${pad2(d)}`); }
    return weeks;
  }
  function mmdd(ds) { const p = ds.split('-'); return `${p[1]}/${p[2]}`; }

  /* ============ 편성 산출 — 근무정책 설정 반영(현황과 동일 basePlanCode) ============ */
  function basePlanCode(emp, dateStr) {
    const wd = parseYMD(dateStr).getDay(); if (wd === 0 || wd === 6) return '-';
    const dn = emp.dept; const codes = deptAllowedCodes(dn);
    if (codes.length) {
      const def = deptDefaultOf(dn) || codes[0];
      if (policyOf(dn) === 'shift') { let start = codes.indexOf(emp.shift); if (start < 0) start = Math.max(0, codes.indexOf(def)); return codes[(start + weekIdx(dateStr)) % codes.length]; }
      return def;
    }
    const A = App.AttStatus; return (A && A.shiftCodeForDate) ? A.shiftCodeForDate(emp, dateStr) : (emp.shift || 'WTD01');
  }
  function ensurePlanSeed(deptId) {
    const emps = scopeEmps(deptId); const days = daysInMonth(STATE.ym);
    emps.forEach(emp => { for (let d = 1; d <= days; d++) { const ds = `${STATE.ym}-${pad2(d)}`; const key = `${emp.id}|${ds}`; if (STATE.plan[key] === undefined) STATE.plan[key] = basePlanCode(emp, ds); } });
  }
  function planAt(emp, dateStr) { const key = `${emp.id}|${dateStr}`; if (STATE.plan[key] !== undefined) return STATE.plan[key]; const v = basePlanCode(emp, dateStr); STATE.plan[key] = v; return v; }
  /* 승인된 근무조 변경 오버라이드(전자결재 승인 결과) — 있으면 그 근무조로 확정(편집 잠금). */
  function overrideAt(emp, dateStr) { const O = App.AttShiftOverrides; return (O && O.get) ? O.get(emp.id, dateStr) : null; }
  function effAt(emp, dateStr) { const ov = overrideAt(emp, dateStr); if (ov) return { code: ov.code, ov }; return { code: planAt(emp, dateStr), ov: null }; }

  /* ============ 근무조 칩 (현황과 동일 소프트 카드: 코드+명칭 / 시간) ============ */
  function shiftColorCls(code) { const list = App.AttShifts ? App.AttShifts.list() : []; const idx = list.findIndex(s => s.code === code); return idx >= 0 ? `shift-chip--c${idx % 10}` : 'shift-chip--day'; }
  function shiftShortName(code) { const s = App.AttShifts && App.AttShifts.get(code); return (s && s.label) ? s.label : code; }
  function chip(code, full, dateLabel, appr) {
    if (!code || code === '-') return '<span class="shift-chip shift-chip--off">휴무</span>';
    const s = App.AttShifts && App.AttShifts.get(code); if (!s) return `<span class="shift-chip">${esc(code)}</span>`;
    const night = s.isNight; const cls = night ? 'shift-chip--night' : shiftColorCls(code); const nm = s.label || s.code;
    let title = `${dateLabel ? dateLabel + ' · ' : ''}${nm} (${s.code}) ${s.start}~${s.end}${night ? ' · 야간' : ''}`;
    if (appr) title += ` · 근무조 변경 승인${appr.from ? ` (${appr.from}→${s.code})` : ''}${appr.reason ? ' · ' + appr.reason : ''} (편집 잠금)`;
    const apprHTML = appr ? `<span class="shift-chip__appr" title="근무조 변경 승인 — 편집 잠금">승인</span>` : '';
    const dateHTML = dateLabel ? `<span class="shift-chip__date">${esc(dateLabel)}</span>` : '';
    const hd = `<span class="shift-chip__hd"><strong class="shift-chip__code">${esc(s.code)}</strong> <span class="shift-chip__nm">${esc(nm)}</span></span>`;
    const inner = full ? `${apprHTML}${dateHTML}${hd}<span class="shift-chip__t">${esc(s.start)}~${esc(s.end)}</span>` : `${apprHTML}${dateHTML}${hd}`;
    return `<span class="shift-chip ${cls}${appr ? ' shift-chip--appr' : ''}" title="${esc(title)}">${inner}</span>`;
  }
  /* 성명 셀 (아바타 + 이름 + 부서·직책, 선택 체크박스) */
  function empNameCell(emp) {
    const sub = [emp.dept, emp.position].filter(Boolean).map(esc).join(' · ');
    const ch = esc((emp.name || '').slice(0, 1));
    const chk = STATE.selected.has(emp.id) ? 'checked' : '';
    return `<td class="ssw-tbl__namecell"><div class="ssw-tbl__person">
      <label class="cb" style="flex:0 0 auto;"><input type="checkbox" data-wk-emp="${esc(emp.id)}" ${chk}></label>
      <span class="ssw-tbl__ava">${ch}</span>
      <div class="ssw-tbl__nm"><div class="ssw-tbl__nm-top"><span class="ssw-tbl__name">${esc(emp.name)}</span></div>${sub ? `<div class="ssw-tbl__nm-sub">${sub}</div>` : ''}</div>
    </div></td>`;
  }
  /* 편집 select 옵션 — 부서 사용 근무코드 + 휴무 */
  function optionsHTML(deptName, val) {
    const codes = deptAllowedCodes(deptName);
    return `<option value="-" ${val === '-' ? 'selected' : ''}>휴무</option>` +
      codes.map(c => { const s = App.AttShifts && App.AttShifts.get(c); return `<option value="${esc(c)}" ${val === c ? 'selected' : ''}>${esc(c)} ${esc(s ? (s.label || '') : '')}</option>`; }).join('');
  }
  /* ============ 상단 근무정책·사용 근무코드 배너 (현황과 동일 .po-info) ============ */
  function policyPillHTML(policy) { return policy === 'shift' ? '<span class="pill pill--purple">교대근무</span>' : '<span class="pill pill--info">통상근무</span>'; }
  function codeInlineHTML(code) { const s = (App.AttShifts && App.AttShifts.get) ? App.AttShifts.get(code) : null; const lbl = s ? (s.label || code) : code; const tm = s ? `<span class="t-muted" style="font-weight:var(--fw-regular);">${esc(s.start)}~${esc(s.end)}</span>` : ''; return `<span class="ss-codeitem"><span class="po-info__code">${esc(code)}</span> ${esc(lbl)} ${tm}</span>`; }
  function renderPolicyBar(deptName) {
    if (!deptName) return '';
    const P = App.AttWorkPolicy; const cfg = (P && P.deptPolicy) ? P.deptPolicy(deptName) : { policy: 'regular', codes: [] };
    const codes = cfg.codes || [];
    const codeVal = codes.length ? codes.map(codeInlineHTML).join('<span class="ss-codesep">·</span>') : '<span class="t-muted" style="font-weight:var(--fw-regular);">미설정</span>';
    return `<div class="po-info" style="min-height:34px;width:max-content;max-width:100%;flex:0 0 auto;">
      <span class="po-info__pill"><span class="po-info__pill-label">근무정책</span><span class="po-info__pill-value">${policyPillHTML(cfg.policy)}</span></span>
      <span class="po-info__sep">|</span>
      <span class="po-info__pill"><span class="po-info__pill-label">사용 근무코드</span><span class="po-info__pill-value">${codeVal}</span></span>
    </div>`;
  }
  /* ============ 주간 뷰 — 성명 1열 + 날짜 열(일자별 편집) ============ */
  function renderWeekView(deptName, emps) {
    const dates = weekDates7(currentWeekStart());
    const dayHead = dates.map(ds => { const dt = parseYMD(ds); const wd = dt.getDay(); const cls = wd === 0 ? 'is-sun' : wd === 6 ? 'is-sat' : ''; return `<th class="ssw-tbl__day ${cls}"><span class="ssw-tbl__dnum">${pad2(dt.getMonth() + 1)}.${pad2(dt.getDate())}</span><span class="ssw-tbl__dw">(${DOW_KO[wd]})</span></th>`; }).join('');
    const rows = emps.map(emp => {
      const cells = dates.map(ds => {
        const dt = parseYMD(ds); const wd = dt.getDay(); const cls = wd === 0 ? 'is-sun' : wd === 6 ? 'is-sat' : '';
        if (wd === 0 || wd === 6) return `<td class="ssw-tbl__day ${cls}">${chip('-', true)}</td>`;
        const eff = effAt(emp, ds);
        /* 승인 오버라이드 — 편집 잠금(선택 오버레이 없음) */
        if (eff.ov) return `<td class="ssw-tbl__day ${cls}">${chip(eff.code, true, null, eff.ov)}</td>`;
        const sel = `<select class="ssw-edit__sel" data-day-cell="${esc(emp.id)}|${esc(ds)}">${optionsHTML(deptName, eff.code)}</select>`;
        return `<td class="ssw-tbl__day ${cls}"><div class="ssw-edit">${chip(eff.code, true)}${sel}</div></td>`;
      }).join('');
      return `<tr>${empNameCell(emp)}${cells}</tr>`;
    }).join('');
    return { cls: 'ssw-tbl--sched ssw-tbl--edit', head: dayHead, rows, cols: dates.length + 1 };
  }

  /* ============ 월간 뷰 — 성명 1열 + 주차 열(주 단위 편집 + 예외 카드 표시) ============ */
  function renderMonthView(deptName, emps) {
    const weeks = monthWeeks(STATE.ym);
    const wkHead = weeks.map((w, i) => { const a = w.dates[0], b = w.dates[w.dates.length - 1]; return `<th class="ssw-tbl__wk"><span class="ssw-tbl__wk-no">${i + 1}주차</span><span class="ssw-tbl__wk-range">${mmdd(a)}~${mmdd(b)}</span></th>`; }).join('');
    const rows = emps.map(emp => {
      const cells = weeks.map(w => {
        const entries = w.dates.map(ds => { const e = effAt(emp, ds); return { ds, code: e.code, ov: e.ov }; }).filter(e => e.code && e.code !== '-');
        let primary = '-';
        if (entries.length) { const freq = {}; entries.forEach(e => { freq[e.code] = (freq[e.code] || 0) + 1; }); let best = 0; primary = entries[0].code; Object.keys(freq).forEach(c => { if (freq[c] > best) { best = freq[c]; primary = c; } }); }
        const exc = entries.filter(e => e.code !== primary);
        /* 예외 카드는 표시 전용(dropdown 없음). 승인 예외는 '승인' 마커. */
        const excHTML = exc.map(e => chip(e.code, true, mmdd(e.ds), e.ov)).join('');
        const primaryOv = (entries.find(e => e.code === primary && e.ov) || {}).ov || null;
        const primaryCode = entries.length ? primary : '-';
        const primaryCard = chip(primaryCode, true, null, primaryOv);
        /* 승인된 대표 근무조 → dropdown 없음(편집 잠금). 그 외 → 대표 카드에만 편집 select. */
        const primaryHTML = primaryOv
          ? primaryCard
          : `<div class="ssw-edit">${primaryCard}<select class="ssw-edit__sel" data-week-cell="${esc(emp.id)}|${w.idx}">${optionsHTML(deptName, primaryCode)}</select></div>`;
        return `<td class="ssw-tbl__wk"><div class="ssw-wk">${primaryHTML}${excHTML}</div></td>`;
      }).join('');
      return `<tr>${empNameCell(emp)}${cells}</tr>`;
    }).join('');
    return { cls: 'ssw-tbl--sched ssw-tbl--month ssw-tbl--edit', head: wkHead, rows, cols: weeks.length + 1 };
  }

  /* =========================================================
   *  VIEW — 근무조 배치 (부서별 근무조 현황과 동일 구조 + 편집)
   * ========================================================= */
  const CHEV_L = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`;
  const CHEV_R = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;

  function selbarHTML() {
    const n = STATE.selected.size;
    const inner = n === 0
      ? `<span class="selbar__hint">구성원을 선택한 뒤 [근무조 일괄 변경] 으로 대상 주차의 근무조를 한 번에 편성할 수 있습니다.</span>`
      : `<span class="selbar__count">선택 <strong>${n}</strong>명</span><span class="selbar__divider"></span><button class="btn btn--sm btn--primary" type="button" data-bulk-open>근무조 일괄 변경</button><span class="selbar__spacer"></span><button class="btn btn--sm" type="button" data-wk-bulk-clear>선택 해제</button>`;
    return `<div class="selbar${n === 0 ? ' is-empty' : ''}" style="min-height:46px;flex:0 0 auto;">${inner}</div>`;
  }

  function renderMain(pageEl) {
    ensureLoaded();
    const h = HRI();
    if (STATE.selectedDeptId === null) {
      const first = allEmps()[0];
      STATE.selectedDeptId = (first && h && h.deptIdOf) ? (h.deptIdOf(first.dept) || 'C0') : 'C0';
    }
    const deptId   = STATE.selectedDeptId;
    const deptName = deptNameOf(deptId);
    const isWeek   = STATE.viewMode === 'week';
    const tree = (h && h.deptTreeHTML) ? h.deptTreeHTML(deptId, { emps: allEmps() }) : '';

    let bodyInner;
    if (!deptName) {
      bodyInner = `<div class="att-empty" style="padding:48px 20px;text-align:center;color:var(--color-text-muted);">좌측 조직도에서 편성할 부서를 선택하세요.</div>`;
    } else {
      ensurePlanSeed(deptId);
      const emps = scopeEmps(deptId);
      const empIds = new Set(emps.map(e => e.id));
      Array.from(STATE.selected).forEach(id => { if (!empIds.has(id)) STATE.selected.delete(id); });
      const view = isWeek ? renderWeekView(deptName, emps) : renderMonthView(deptName, emps);
      const allChecked = emps.length > 0 && emps.every(e => STATE.selected.has(e.id));
      const rowsHTML = emps.length ? view.rows : `<tr><td colspan="${view.cols}" style="text-align:center;padding:30px;color:var(--color-text-muted);">${esc(deptName)} 부서에 등록된 인원이 없습니다.</td></tr>`;
      bodyInner = `
        ${renderPolicyBar(deptName)}
        ${selbarHTML()}
        <div class="table-card" style="flex:1 1 0;display:flex;flex-direction:column;min-height:0;">
          <div class="table-card__cap"><strong>총 ${emps.length}명</strong><span class="t-muted" style="font-size:var(--fs-xs);margin-left:8px;">셀을 클릭해 근무조를 편성합니다</span></div>
          <div class="ssw-wrap">
            <table class="ssw-tbl ${view.cls}">
              <thead><tr><th class="ssw-tbl__namecell-h"><label class="cb"><input type="checkbox" data-wk-all ${allChecked ? 'checked' : ''}> 성명</label></th>${view.head}</tr></thead>
              <tbody>${rowsHTML}</tbody>
            </table>
          </div>
        </div>`;
    }

    let titleHTML;
    if (isWeek) { const ds = weekDates7(currentWeekStart()); const a = parseYMD(ds[0]), b = parseYMD(ds[6]); const f = d => `${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`; titleHTML = `<div class="att-tb__title" style="font-size:var(--fs-lg);">${f(a)} ~ ${f(b)}</div>`; }
    else titleHTML = `<div class="att-tb__title">${STATE.ym.replace('-', '.')}</div>`;
    const submitted = STATE.status === 'submitted';
    const statusPill = submitted ? `<span class="pill pill--success">제출 완료${STATE.submittedAt ? ` · ${esc(STATE.submittedAt)}` : ''}</span>` : `<span class="pill pill--warning">작성중</span>`;
    const scopeChip = deptName ? `<div class="att-target-chip" style="cursor:default;"><span class="att-target-chip__name">${esc(deptName)}</span><span class="att-target-chip__meta">${scopeEmps(deptId).length}명</span></div>` : '';
    const modeToggle = `<div class="tabs tabs--segmented" style="display:inline-flex;width:auto;"><div class="tabs__nav"><button type="button" class="tabs__tab ${isWeek ? 'is-active' : ''}" data-ss-mode="week">주간</button><button type="button" class="tabs__tab ${!isWeek ? 'is-active' : ''}" data-ss-mode="month">월간</button></div></div>`;
    const expander = STATE.treeCollapsed ? `<button class="split__expander" type="button" data-shift-tree-toggle title="조직도 펼치기" style="display:inline-flex;"><span>조직도</span>${CHEV_R}</button>` : '';

    const header = `
      <header class="att-page__head">
        <div class="att-tb">
          <div class="att-tb__left">
            <button class="page-bar__back" type="button" data-shift-back title="근무조 현황으로 돌아가기">${CHEV_L}근무조 현황</button>
            ${expander}
            ${titleHTML}
            <div class="att-tb__nav">
              <button type="button" data-shift-ym-prev aria-label="${isWeek ? '이전 주' : '이전 달'}">‹</button>
              <button type="button" data-shift-ym-today>오늘</button>
              <button type="button" data-shift-ym-next aria-label="${isWeek ? '다음 주' : '다음 달'}">›</button>
            </div>
            ${scopeChip}
          </div>
          <div style="flex:1;display:flex;justify-content:center;">${modeToggle}</div>
          <div class="att-tb__right">
            ${statusPill}
            <button class="btn btn--sm" type="button" data-shift-copy title="원본 월의 편성을 대상 월로 복사합니다">월 단위 복사</button>
            <button class="btn btn--sm btn--primary" type="button" data-shift-act="submit">${submitted ? '재제출' : '제출'}</button>
          </div>
        </div>
      </header>`;

    pageEl.innerHTML = `
      <div class="split split--collapsible${STATE.treeCollapsed ? ' is-left-collapsed' : ''}" style="--split-left:240px;flex:1 1 0;min-height:0;">
        <aside class="split__left">
          <div class="split__head"><h3>조직도</h3><button class="split__collapser" type="button" data-shift-tree-toggle title="조직도 접기">${CHEV_L}</button></div>
          <div class="split__body" style="padding:0;display:flex;flex-direction:column;min-height:0;">
            <ul class="tree tree--selectable" style="flex:1;overflow:auto;padding:8px 10px;margin:0;">${tree}</ul>
          </div>
        </aside>
        <section class="split__right">
          ${header}
          <div class="att-page__body" style="display:flex;flex-direction:column;gap:14px;min-height:0;overflow:hidden;">${bodyInner}</div>
        </section>
      </div>`;
    bindPage(pageEl);
  }

  function bindPage(pageEl) {
    if (pageEl.dataset.shiftPageBound === '1') return;
    pageEl.dataset.shiftPageBound = '1';

    pageEl.addEventListener('click', e => {
      if (e.target.closest('[data-shift-back]')) {
        if (App.Tabs && typeof App.Tabs.open === 'function') App.Tabs.open({ id: 'att-shift-status', label: '근무조 현황', page: 'page-att-shift-status' });
        return;
      }
      if (e.target.closest('[data-shift-tree-toggle]')) { STATE.treeCollapsed = !STATE.treeCollapsed; renderMain(pageEl); return; }
      const treeNode = e.target.closest('.tree__node[data-id]');
      if (treeNode) { STATE.selectedDeptId = treeNode.dataset.id; STATE.selected.clear(); renderMain(pageEl); return; }
      const open = e.target.closest('[data-shift-act="open-master"]');
      if (open) { openMasterModal(); return; }
      const modeBtn = e.target.closest('[data-ss-mode]');
      if (modeBtn) { const m = modeBtn.dataset.ssMode; if (m !== STATE.viewMode) { STATE.viewMode = m; if (m === 'week') STATE.weekStart = null; renderMain(pageEl); } return; }
      const isWeek = STATE.viewMode === 'week';
      if (e.target.closest('[data-shift-ym-prev]')) { if (isWeek) shiftWeekBy(-1); else STATE.ym = shiftMonth(STATE.ym, -1); renderMain(pageEl); return; }
      if (e.target.closest('[data-shift-ym-next]')) { if (isWeek) shiftWeekBy(1); else STATE.ym = shiftMonth(STATE.ym, 1); renderMain(pageEl); return; }
      if (e.target.closest('[data-shift-ym-today]')) { STATE.ym = TODAY.slice(0, 7); STATE.weekStart = null; renderMain(pageEl); return; }
      const sub = e.target.closest('[data-shift-act="submit"]');
      if (sub) {
        const deptName = deptNameOf(STATE.selectedDeptId);
        if (!deptName) { window.toast && window.toast('편성할 부서를 먼저 선택해 주세요.', 'warning'); return; }
        const resubmit = STATE.status === 'submitted';
        const q = resubmit
          ? `${STATE.ym.replace('-', '.')} ${deptName} 근무조 편성을 다시 제출하시겠습니까?`
          : `${STATE.ym.replace('-', '.')} ${deptName} 근무조 편성을 제출하시겠습니까? 제출 후에도 수정·재제출할 수 있습니다.`;
        if (!confirm(q)) return;
        STATE.status = 'submitted';
        STATE.submittedAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
        window.toast && window.toast(`${deptName} 근무조 편성 ${resubmit ? '재제출' : '제출'} 완료`, 'success');
        renderMain(pageEl);
        return;
      }
      if (e.target.closest('[data-shift-copy]')) { openCopyModal(pageEl); return; }
      if (e.target.closest('[data-bulk-open]')) { openBulkModal(pageEl); return; }
      if (e.target.closest('[data-wk-bulk-clear]')) { STATE.selected.clear(); renderMain(pageEl); return; }
    });

    pageEl.addEventListener('change', e => {
      /* 전체 선택 */
      const allCb = e.target.closest('[data-wk-all]');
      if (allCb) { const emps = scopeEmps(STATE.selectedDeptId); if (allCb.checked) emps.forEach(x => STATE.selected.add(x.id)); else STATE.selected.clear(); renderMain(pageEl); return; }
      /* 개별 사원 선택 */
      const empCb = e.target.closest('[data-wk-emp]');
      if (empCb) { if (empCb.checked) STATE.selected.add(empCb.dataset.wkEmp); else STATE.selected.delete(empCb.dataset.wkEmp); renderMain(pageEl); return; }
      /* 주간 뷰 — 일자 셀 편성 */
      const dayCell = e.target.closest('[data-day-cell]');
      if (dayCell) { STATE.plan[dayCell.dataset.dayCell] = dayCell.value; clearSubmitted(); renderMain(pageEl); return; }
      /* 월간 뷰 — 주차 셀 편성(해당 주 평일 전체 적용) */
      const weekCell = e.target.closest('[data-week-cell]');
      if (weekCell) {
        const parts = weekCell.dataset.weekCell.split('|');
        const empId = parts[0], wi = Number(parts[1]);
        const wk = monthWeeks(STATE.ym).find(w => w.idx === wi);
        const O = App.AttShiftOverrides;
        if (wk) wk.dates.forEach(ds => { if (O && O.get && O.get(empId, ds)) return; /* 승인일 보존 */ STATE.plan[`${empId}|${ds}`] = weekCell.value; });
        clearSubmitted();
        renderMain(pageEl);
        return;
      }
    });
  }

  /* 제출 완료 상태에서 편집이 일어나면 '작성중'으로 되돌린다(재제출 유도). */
  function clearSubmitted() {
    if (STATE.status === 'submitted') { STATE.status = 'draft'; STATE.submittedAt = ''; }
  }

  /* 선택 일괄 적용 — 체크된 사원의 대상 주차(또는 전체)를 선택 근무조로 설정 */
  function applyBulk(pageEl) {
    const ids = Array.from(STATE.selected);
    if (!ids.length) return;
    const weeks = monthWeeks(STATE.ym);
    const targets = STATE.bulkWeek === 'all' ? weeks : weeks.filter(w => String(w.idx) === String(STATE.bulkWeek));
    const O = App.AttShiftOverrides;
    ids.forEach(id => targets.forEach(w => w.dates.forEach(ds => { if (O && O.get && O.get(id, ds)) return; /* 승인일 보존 */ STATE.plan[`${id}|${ds}`] = STATE.bulkShift; })));
    clearSubmitted();
    renderMain(pageEl);
    const shiftLabel = STATE.bulkShift === '-' ? '휴무' : shiftShortName(STATE.bulkShift);
    const weekLabel  = STATE.bulkWeek === 'all' ? '전체 주차' : `${Number(STATE.bulkWeek) + 1}주차`;
    window.toast && window.toast(`${ids.length}명 · ${weekLabel} → ${shiftLabel} 적용 완료`, 'success');
  }

  /* ============ 근무조 일괄 변경 모달 — 선택 구성원 × 대상 주차 × 근무조 ============ */
  function ensureBulkModal() {
    if (document.getElementById('modal-shift-bulk')) return;
    const html = `
<div class="modal-backdrop" id="modal-shift-bulk">
  <div class="modal" style="width:92vw;max-width:460px;">
    <div class="modal__header">
      <div class="modal__title">근무조 일괄 변경</div>
      <button class="modal__close" type="button" data-bulk-close aria-label="닫기">✕</button>
    </div>
    <div class="modal__body" style="padding:18px 20px;">
      <div style="background:var(--color-active);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:16px;font-size:var(--fs-sm);color:var(--color-text-sub);">
        선택 <strong data-bulk-count style="color:var(--color-brand-primary);">0</strong>명 · <strong data-bulk-dept style="color:var(--color-text);"></strong> 구성원에게 적용합니다.
      </div>
      <div class="fm-tbl fm-tbl--compact fm-tbl--bordered fm-tbl--form">
        <div class="fm-tbl__row fm-tbl__row--1" style="grid-template-columns:96px 1fr;">
          <div class="fm-tbl__label">대상 주차</div>
          <div class="fm-tbl__value"><select class="select" data-bulk-week style="width:100%;"></select></div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" style="grid-template-columns:96px 1fr;">
          <div class="fm-tbl__label">근무조</div>
          <div class="fm-tbl__value"><select class="select" data-bulk-shift style="width:100%;"></select></div>
        </div>
      </div>
      <div class="form-help" style="margin-top:10px;">대상 주차의 평일 전체가 선택한 근무조로 변경됩니다. (주말은 휴무 유지)</div>
    </div>
    <div class="modal__footer">
      <button class="btn" type="button" data-bulk-close>취소</button>
      <button class="btn btn--primary" type="button" data-bulk-apply>적용</button>
    </div>
  </div>
</div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    const modal = document.getElementById('modal-shift-bulk');
    modal.addEventListener('click', e => {
      if (e.target === modal || e.target.closest('[data-bulk-close]')) { closeModalEl('modal-shift-bulk'); return; }
      if (e.target.closest('[data-bulk-apply]')) {
        applyBulk(document.getElementById('page-att-shift'));
        closeModalEl('modal-shift-bulk');
        return;
      }
    });
    modal.addEventListener('change', e => {
      const bw = e.target.closest('[data-bulk-week]');
      if (bw) { STATE.bulkWeek = bw.value; return; }
      const bs = e.target.closest('[data-bulk-shift]');
      if (bs) { STATE.bulkShift = bs.value; return; }
    });
  }
  function openBulkModal(pageEl) {
    if (!STATE.selected.size) { window.toast && window.toast('먼저 대상 구성원을 선택해 주세요.', 'warning'); return; }
    const deptName = deptNameOf(STATE.selectedDeptId);
    ensureBulkModal();
    const modal = document.getElementById('modal-shift-bulk');
    const weeks = monthWeeks(STATE.ym);
    const codes = deptAllowedCodes(deptName);
    /* 현재 부서·월에 맞춰 기본값 보정 */
    if (STATE.bulkShift !== '-' && codes.indexOf(STATE.bulkShift) < 0) STATE.bulkShift = codes.length ? codes[0] : '-';
    if (STATE.bulkWeek !== 'all' && !weeks.find(w => String(w.idx) === String(STATE.bulkWeek))) STATE.bulkWeek = 'all';
    modal.querySelector('[data-bulk-count]').textContent = STATE.selected.size;
    modal.querySelector('[data-bulk-dept]').textContent = deptName || '-';
    modal.querySelector('[data-bulk-week]').innerHTML = `
      <option value="all" ${STATE.bulkWeek === 'all' ? 'selected' : ''}>전체 주차</option>
      ${weeks.map(w => `<option value="${w.idx}" ${String(STATE.bulkWeek) === String(w.idx) ? 'selected' : ''}>${w.idx + 1}주차 (${mmdd(w.dates[0])}~${mmdd(w.dates[w.dates.length - 1])})</option>`).join('')}`;
    modal.querySelector('[data-bulk-shift]').innerHTML = `
      <option value="-" ${STATE.bulkShift === '-' ? 'selected' : ''}>휴무</option>
      ${codes.map(c => { const s = App.AttShifts && App.AttShifts.get(c); return `<option value="${esc(c)}" ${STATE.bulkShift === c ? 'selected' : ''}>${esc(c)} ${esc(s ? (s.label || '') : '')}</option>`; }).join('')}`;
    openModalEl('modal-shift-bulk');
  }

  /* =========================================================
   *  근무조 복사 — 월 단위는 모달, 주 단위는 배치 테이블 헤더에서 직접.
   *  적용 대상: 현재 부서 전체 구성원.
   * ========================================================= */
  /* 월 단위 — 원본 월 한 달치 배치를 대상 월로 복사. 주차 수가 다르면 마지막 주차를 이어서 채움. */
  function applyCopyMonth(pageEl) {
    const c = STATE.copy;
    const srcYm = c.srcYm, dstYm = c.dstYm;
    if (!srcYm || !dstYm || srcYm === dstYm) {
      const err = document.querySelector('#modal-shift-copy [data-copy-err]');
      if (err) err.hidden = false;
      return false;
    }
    const deptId = STATE.selectedDeptId;
    const emps = scopeEmps(deptId);
    /* 원본 월이 미편집이면 기본 편성으로 시드 */
    const savedYm = STATE.ym; STATE.ym = srcYm; ensurePlanSeed(deptId); STATE.ym = savedYm;
    const srcWeeks = monthWeeks(srcYm);
    const dstWeeks = monthWeeks(dstYm);
    /* 주차 + 요일 기준으로 정렬 복사 — 월/화…를 같은 주차의 월/화…로 매핑(평일 수가 달라도 어긋나지 않음). */
    emps.forEach(emp => {
      const srcMap = {};
      srcWeeks.forEach(w => w.dates.forEach(ds => { srcMap[`${w.idx}|${parseYMD(ds).getDay()}`] = STATE.plan[`${emp.id}|${ds}`]; }));
      dstWeeks.forEach(w => w.dates.forEach(ds => {
        const v = srcMap[`${w.idx}|${parseYMD(ds).getDay()}`];
        STATE.plan[`${emp.id}|${ds}`] = (v === undefined ? basePlanCode(emp, ds) : v);
      }));
    });
    /* 결과 확인을 위해 대상 월로 이동 */
    STATE.ym = dstYm;
    STATE.status = 'draft';
    STATE.submittedAt = '';
    STATE.selected.clear();
    renderMain(pageEl);
    window.toast && window.toast(`${srcYm.replace('-', '.')} 편성을 ${dstYm.replace('-', '.')}(으)로 복사했습니다.`, 'success');
    return true;
  }

  /* 월 옵션 — STATE.ym 기준 delta 범위. 지난달/이번 달/다음 달 라벨 부여. */
  function monthOptsHTML(fromD, toD, sel) {
    const out = [];
    for (let d = fromD; d <= toD; d++) {
      const t = shiftMonth(STATE.ym, d);
      const tag = d === -1 ? ' · 지난달' : d === 0 ? ' · 이번 달' : d === 1 ? ' · 다음 달' : '';
      out.push(`<option value="${t}" ${t === sel ? 'selected' : ''}>${t.replace('-', '.')}${tag}</option>`);
    }
    return out.join('');
  }

  function ensureCopyModal() {
    if (document.getElementById('modal-shift-copy')) return;
    const html = `
<div class="modal-backdrop" id="modal-shift-copy">
  <div class="modal" style="width:92vw;max-width:460px;">
    <div class="modal__header">
      <div class="modal__title">근무조 월 단위 복사</div>
      <button class="modal__close" type="button" data-copy-close aria-label="닫기">✕</button>
    </div>
    <div class="modal__body" style="padding:18px 20px;" id="shift-copy-body"></div>
    <div class="modal__footer">
      <button class="btn" type="button" data-copy-close>닫기</button>
      <button class="btn btn--primary" type="button" data-copy-month-go>복사</button>
    </div>
  </div>
</div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    const modal = document.getElementById('modal-shift-copy');
    modal.addEventListener('click', e => {
      if (e.target === modal || e.target.closest('[data-copy-close]')) { closeModalEl('modal-shift-copy'); return; }
      if (e.target.closest('[data-copy-month-go]')) {
        const ok = applyCopyMonth(document.getElementById('page-att-shift'));
        if (ok) closeModalEl('modal-shift-copy');
        return;
      }
    });
    modal.addEventListener('change', e => {
      const sy = e.target.closest('[data-copy-srcym]');
      if (sy) { STATE.copy.srcYm = sy.value; const err = modal.querySelector('[data-copy-err]'); if (err) err.hidden = true; return; }
      const dy = e.target.closest('[data-copy-dstym]');
      if (dy) { STATE.copy.dstYm = dy.value; const err = modal.querySelector('[data-copy-err]'); if (err) err.hidden = true; return; }
    });
  }

  function renderCopyBody() {
    const body = document.getElementById('shift-copy-body');
    if (!body) return;
    const c = STATE.copy;
    if (!c.srcYm) c.srcYm = shiftMonth(STATE.ym, -1);
    if (!c.dstYm) c.dstYm = STATE.ym;

    body.innerHTML = `
      <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:var(--fs-md);color:var(--color-text-sub);line-height:2.2;">
        <select class="select select--sm" data-copy-srcym style="min-width:150px;">${monthOptsHTML(-6, 0, c.srcYm)}</select>
        <span>의 배치를</span>
        <select class="select select--sm" data-copy-dstym style="min-width:150px;">${monthOptsHTML(0, 6, c.dstYm)}</select>
        <span>로 복사</span>
      </div>
      <div class="field-error" data-copy-err hidden style="margin-top:8px;">원본 월과 대상 월이 같습니다. 다른 달을 선택해 주세요.</div>
      <div style="margin-top:16px;background:var(--color-surface-alt);border-radius:var(--radius-sm);padding:13px 15px;font-size:var(--fs-sm);color:var(--color-text-sub);line-height:1.65;">
        <div style="margin-bottom:8px;">
          <strong style="color:var(--color-text);">${esc(deptNameOf(STATE.selectedDeptId))}</strong> 전체 구성원에게 적용됩니다.
        </div>
        <div style="display:flex;gap:7px;">
          <span style="color:var(--color-brand-primary);">·</span>
          <span>일자별 근무조 편성이 대상 월에 <strong style="color:var(--color-text);">그대로 복사</strong>됩니다.</span>
        </div>
        <div style="display:flex;gap:7px;margin-top:3px;">
          <span style="color:var(--color-brand-primary);">·</span>
          <span>복사 후 <strong style="color:var(--color-text);">대상 월로 이동</strong>하며, 개별 셀은 다시 수정할 수 있습니다.</span>
        </div>
      </div>
    `;
  }

  function openCopyModal(pageEl) {
    const deptName = deptNameOf(STATE.selectedDeptId);
    const emps = scopeEmps(STATE.selectedDeptId);
    if (!deptName || !emps.length) { window.toast && window.toast('편성할 부서를 먼저 선택해 주세요.', 'warning'); return; }
    ensureCopyModal();
    /* 재진입 기본값 — 지난달 → 이번 달 */
    STATE.copy.srcYm = shiftMonth(STATE.ym, -1);
    STATE.copy.dstYm = STATE.ym;
    renderCopyBody();
    openModalEl('modal-shift-copy');
  }

  function shiftMonth(ym, delta) {
    const [y, m] = ym.split('-').map(Number);
    let nm = m + delta, ny = y;
    while (nm <= 0)  { nm += 12; ny -= 1; }
    while (nm > 12)  { nm -= 12; ny += 1; }
    return `${ny}-${pad2(nm)}`;
  }

  /* =========================================================
   *  근무조 마스터 (설정) — 모달
   * ========================================================= */
  function openMasterModal() {
    ensureLoaded();
    renderMasterTable();
    const modal = document.getElementById('modal-shift-master');
    if (!modal) return;
    if (!modal.dataset.shiftMasterBound) {
      modal.dataset.shiftMasterBound = '1';
      modal.addEventListener('click', e => { if (e.target === modal) closeMasterModal(); });
      modal.querySelectorAll('[data-modal-close], [data-shift-master-close]').forEach(b => b.addEventListener('click', closeMasterModal));
      /* 내부 클릭 위임 — add / edit / row click */
      modal.addEventListener('click', e => {
        const add = e.target.closest('[data-shift-act="add"]');
        if (add) { openEditor(null); return; }
        const edit = e.target.closest('[data-shift-edit]');
        if (edit) { e.stopPropagation(); openEditor(edit.dataset.shiftEdit); return; }
        const card = e.target.closest('[data-shift-card]');
        if (card) { openEditor(card.dataset.shiftCard); return; }
      });
    }
    openModalEl('modal-shift-master');
  }
  function closeMasterModal() { closeModalEl('modal-shift-master'); }

  function renderMasterTable() {
    const host = document.getElementById('shift-master-body');
    if (!host) return;
    const list = STATE.shifts.slice();
    host.innerHTML = `
      <div class="toolbar" style="border-bottom:1px solid var(--color-divider);">
        <div class="toolbar__left">
          <span style="color:var(--color-text-muted);font-size:var(--fs-sm);">총 <strong>${list.length}</strong>개 근무코드</span>
        </div>
        <div class="toolbar__right">
          <button class="btn btn--sm btn--primary" type="button" data-shift-act="add">
            ${(window.Icons && window.Icons.plus) || '+'} 근무코드 추가
          </button>
        </div>
      </div>
      <div class="shift-tbl-wrap" style="max-height:60vh;">
        <table class="shift-tbl">
          <thead>
            <tr>
              <th style="width:80px;">근무코드</th>
              <th style="min-width:140px;">근무코드 명</th>
              <th style="width:64px;text-align:center;">구분</th>
              <th style="width:72px;text-align:center;">출근</th>
              <th style="width:72px;text-align:center;">퇴근</th>
              <th style="width:90px;text-align:right;">총 근무시간</th>
              <th style="width:130px;text-align:center;">간식(휴게) 1</th>
              <th style="width:130px;text-align:center;">간식(휴게) 2</th>
              <th style="width:64px;"></th>
            </tr>
          </thead>
          <tbody>
            ${list.length === 0
              ? `<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--color-text-muted);">등록된 근무코드가 없습니다.</td></tr>`
              : list.map(renderShiftRow).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderShiftRow(s) {
    const br1 = (s.breakStart && s.breakEnd) ? `${esc(s.breakStart)}~${esc(s.breakEnd)}` : '<span style="color:var(--color-text-muted);">-</span>';
    const br2 = (s.breakStart2 && s.breakEnd2) ? `${esc(s.breakStart2)}~${esc(s.breakEnd2)}` : '<span style="color:var(--color-text-muted);">-</span>';
    const kind = s.isNight ? '<span class="pill pill--purple">야간</span>' : '<span class="pill pill--info">주간</span>';
    return `
      <tr class="shift-tbl__row is-clickable" data-shift-card="${esc(s.code)}">
        <td class="shift-tbl__code">${esc(s.code)}</td>
        <td>${esc(s.label || s.code)}</td>
        <td style="text-align:center;">${kind}</td>
        <td style="text-align:center;">${esc(s.start)}</td>
        <td style="text-align:center;">${esc(s.end)}</td>
        <td style="text-align:right;font-weight:var(--fw-medium);">${esc(s.workHours || '-')}</td>
        <td style="text-align:center;">${br1}</td>
        <td style="text-align:center;">${br2}</td>
        <td style="text-align:center;">
          <button class="btn btn--xs" type="button" data-shift-edit="${esc(s.code)}" title="편집">편집</button>
        </td>
      </tr>
    `;
  }

  /* =========================================================
   *  MODAL: 근무코드 추가/수정
   * ========================================================= */
  /* 근무코드 자동 채번 — 'WT' + 근무시간유형(D/N) + 유형별 일련번호(2자리).
     유형은 폼의 심야 겹침(isNight)으로 결정되며, 시간 수정 시 실시간으로 재채번한다.
     excludeCode 는 수정 중인 자기 코드(중복 제외)용. */
  function channelCode(f, excludeCode) {
    const t = workTypeChar(f);   /* 'D' | 'N' */
    const prefix = 'WT' + t;
    let maxSeq = 0;
    STATE.shifts.forEach(s => {
      if (s.code === excludeCode) return;
      const m = String(s.code || '').match(/^WT([DN])(\d{2})$/);
      if (m && m[1] === t) maxSeq = Math.max(maxSeq, Number(m[2]));
    });
    return `${prefix}${String(maxSeq + 1).padStart(2, '0')}`;
  }
  function newDefaults() {
    const f = {
      code:        '',          /* 채번은 recompute 후 시간 기반으로 결정 */
      label:       '',
      useDepts:    [],
      start:       '09:00',
      end:         '18:00',
      breakStart:  '12:00', breakEnd:  '13:00',
      breakStart2: '',      breakEnd2: '',
      breakMin:    60,
      isNight:     false,
      memberCount: 0,
      active:      true,
    };
    recompute(f);
    f.code = channelCode(f);   /* 주간 09~18 → WTD0X */
    return f;
  }

  /* ============ 운영 중 수정 — 부서 연결 판정 / 수정 이력 ============ */
  /* 부서에 연결된 근무코드인지 — 직원 배정(shiftInUse) 또는 부서별 근무코드 설정 연결.
     연결된 코드 수정 시 적용 시작일·사유 필수, 변경은 적용일 이후 근무부터 반영(소급 없음). */
  function shiftConnected(code) {
    if (!code) return false;
    if (shiftInUse(code)) return true;
    const WP = window.App && App.AttWorkPolicy;
    return !!(WP && WP.codeLinked && WP.codeLinked(code));
  }
  /* 수정 이력 비교 대상 필드 */
  const HIST_FIELDS = [
    ['label', '근무코드 명'], ['start', '출근'], ['end', '퇴근'],
    ['breakStart', '휴게1 시작'], ['breakEnd', '휴게1 종료'],
    ['breakStart2', '휴게2 시작'], ['breakEnd2', '휴게2 종료'],
  ];
  function diffShift(before, after) {
    const out = [];
    HIST_FIELDS.forEach(function (kv) {
      const b = before[kv[0]] || '', a = after[kv[0]] || '';
      if (String(b) !== String(a)) out.push({ field: kv[0], label: kv[1], from: b || '-', to: a || '-' });
    });
    return out;
  }
  /* 수정일시 — YY/MM/DD   HH:MM (SWADPIA §2) */
  function nowStamp() {
    const d = new Date();
    const p = TODAY.split('-');
    return `${p[0].slice(2)}/${p[1]}/${p[2]}   ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  function fmtDateDot(ymd) {
    const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1].slice(2)}/${m[2]}/${m[3]}` : (ymd || '-');
  }

  function openEditor(code) {
    /* 운영 중에도 수정 가능. 추가=모달 / 수정=전체 화면. 부서 연결 코드 수정은 저장 시 적용 시작일·사유 모달. */
    STATE.editingCode = code;
    STATE.editErrors = {};
    STATE.editMeta = { reason: '', effDate: TODAY };   /* 적용 시작일 기본=오늘, 과거 불가 */
    if (code) {
      /* 수정 = 인-페이지 화면. 호출 맥락(근무조 배치 모달)에서는 모달 본문에 렌더. */
      openEditFromMaster(code);
    } else {
      STATE.form = newDefaults();
      STATE.addMeta = { reason: '' };   /* 추가 = 전자결재 대상 → 변경 사유 초기화 */
      openAddModal();       /* 추가 = 모달 */
    }
  }

  function closeEditor() {
    closeModalEl('modal-shift-editor');
    STATE.editingCode = null;
    STATE.form = null;
  }

  /* ----- 시간 선택 (10분 단위) — 시/분 select (분: 00·10·20·30·40·50) ----- */
  function timeParts(t) { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? [pad2(+m[1]), m[2]] : ['09', '00']; }
  function timeSelectHTML(idp, val, dis) {
    const p = timeParts(val);
    const d = dis ? ' disabled' : '';
    let hs = ''; for (let i = 0; i < 24; i++) { const v = pad2(i); hs += `<option value="${v}"${v === p[0] ? ' selected' : ''}>${v}</option>`; }
    const mm = ['00', '10', '20', '30', '40', '50'];
    const minSel = mm.indexOf(p[1]) >= 0 ? p[1] : '00';
    const ms = mm.map(v => `<option value="${v}"${v === minSel ? ' selected' : ''}>${v}</option>`).join('');
    return `<span style="display:inline-flex;align-items:center;gap:4px;">
      <select class="select" id="${idp}-h" style="width:68px;"${d}>${hs}</select><span class="t-muted">:</span>
      <select class="select" id="${idp}-m" style="width:68px;"${d}>${ms}</select></span>`;
  }

  /* ----- 휴게시간 선택 (30분 단위) — 시/분 select (분: 00·30) ----- */
  function breakTimeSelectHTML(idp, val, dis) {
    const p = timeParts(val);
    const d = dis ? ' disabled' : '';
    let hs = ''; for (let i = 0; i < 24; i++) { const v = pad2(i); hs += `<option value="${v}"${v === p[0] ? ' selected' : ''}>${v}</option>`; }
    const mm = ['00', '30'];
    const minSel = p[1] === '30' ? '30' : '00';
    const ms = mm.map(v => `<option value="${v}"${v === minSel ? ' selected' : ''}>${v}</option>`).join('');
    return `<span style="display:inline-flex;align-items:center;gap:4px;">
      <select class="select" id="${idp}-h" style="width:68px;"${d}>${hs}</select><span class="t-muted">:</span>
      <select class="select" id="${idp}-m" style="width:68px;"${d}>${ms}</select></span>`;
  }

  /* ----- 공용 폼 HTML (추가 모달 / 수정 화면 공용) — 코드·명·출퇴근(10분 select)·휴게·요약 ----- */
  function editorFormHTML(f, locked) {
    const row2GT = 'grid-template-columns:110px 1fr 110px 1fr;';
    const row1GT = 'grid-template-columns:110px 1fr;';
    const REQ = '<span style="color:var(--color-danger);">*</span>';
    const hasB2 = !!(f.breakStart2 && f.breakEnd2);
    return `
      <div class="fm-tbl fm-tbl--compact fm-tbl--bordered fm-tbl--form">
        <div class="fm-tbl__row fm-tbl__row--2" style="${row2GT}">
          <div class="fm-tbl__label">근무코드</div>
          <div class="fm-tbl__value" style="gap:8px;align-items:center;">
            <span data-shift-code style="display:inline-block;padding:5px 12px;background:var(--color-surface-alt);border:1px solid var(--color-divider);border-radius:var(--radius-sm);font-weight:var(--fw-bold);color:var(--color-brand-primary);letter-spacing:0.02em;">${esc(f.code || '-')}</span>
          </div>
          <div class="fm-tbl__label">근무코드 명 ${REQ}</div>
          <div class="fm-tbl__value">
            <input class="input" type="text" id="shift-f-label" value="${esc(f.label)}" placeholder="예: 주간 표준조" style="width:100%;" />
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--2" style="${row2GT}">
          <div class="fm-tbl__label">출근 ${REQ}</div>
          <div class="fm-tbl__value">${timeSelectHTML('shift-f-start', f.start, locked)}</div>
          <div class="fm-tbl__label">퇴근 ${REQ}</div>
          <div class="fm-tbl__value" style="gap:8px;align-items:center;">${timeSelectHTML('shift-f-end', f.end, locked)}</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" style="${row1GT}">
          <div class="fm-tbl__label">휴게시간</div>
          <div class="fm-tbl__value" style="flex-direction:column;align-items:stretch;gap:6px;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="t-muted" style="width:36px;flex:0 0 auto;font-size:var(--fs-xs);">1회</span>
              ${breakTimeSelectHTML('shift-f-b1s', f.breakStart, locked)}
              <span class="t-muted">~</span>
              ${breakTimeSelectHTML('shift-f-b1e', f.breakEnd, locked)}
              ${(hasB2 || locked) ? '' : `<button class="btn btn--sm" type="button" data-break-add style="margin-left:8px;">+ 휴게 추가</button>`}
            </div>
            ${hasB2 ? `
              <div style="display:flex;align-items:center;gap:6px;">
                <span class="t-muted" style="width:36px;flex:0 0 auto;font-size:var(--fs-xs);">2회</span>
                ${breakTimeSelectHTML('shift-f-b2s', f.breakStart2, locked)}
                <span class="t-muted">~</span>
                ${breakTimeSelectHTML('shift-f-b2e', f.breakEnd2, locked)}
                ${locked ? '' : `<button class="btn btn--sm btn--soft-danger" type="button" data-break-remove style="margin-left:8px;">삭제</button>`}
              </div>` : ''}
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" style="${row1GT}">
          <div class="fm-tbl__label">근무시간 요약</div>
          <div class="fm-tbl__value">
            <div data-shift-summary style="display:flex;flex-wrap:wrap;align-items:center;gap:8px 18px;width:100%;"></div>
          </div>
        </div>
      </div>`;
  }

  /* ===== 근무코드 추가 = 모달 ===== */
  function renderAddModal() {
    const modal = document.getElementById('modal-shift-editor');
    if (!modal) return;
    const body = modal.querySelector('#shift-editor-body');
    const foot = modal.querySelector('#shift-editor-footer');
    const titleEl = modal.querySelector('#shift-editor-title');
    if (!body || !foot) return;
    if (titleEl) titleEl.textContent = '근무코드 추가';
    const errs = STATE.editErrors || {};
    body.innerHTML = editorFormHTML(STATE.form, false)
      + (errs.dup ? `<div class="field-error" style="margin:10px 0 0;">${esc(errs.dup)}</div>` : '')
      + `
      <div class="fm-tbl fm-tbl--compact fm-tbl--bordered fm-tbl--form" style="margin-top:12px;">
        <div class="fm-tbl__row fm-tbl__row--1" style="grid-template-columns:110px 1fr;">
          <div class="fm-tbl__label">변경 사유 <span style="color:var(--color-danger);">*</span></div>
          <div class="fm-tbl__value" style="flex-direction:column;align-items:stretch;gap:4px;">
            <textarea class="input${errs.addReason ? ' is-invalid' : ''}" id="shift-f-reason" rows="2" placeholder="예: 신규 교대조 편성" style="width:100%;height:52px;min-height:52px;resize:vertical;">${esc(STATE.addMeta.reason || '')}</textarea>
            ${errs.addReason ? `<span class="field-error">${esc(errs.addReason)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="form-help" style="margin-top:8px;line-height:1.5;">근무코드 <strong>추가</strong>는 전자결재 대상입니다. 상신 후 승인되면 등록되며, 변경 이력에 기록됩니다.</div>`;
    foot.innerHTML = `
      <span style="flex:1;"></span>
      <button class="btn" type="button" data-shift-cancel>취소</button>
      <button class="btn btn--primary" type="button" data-shift-save>전자결재 상신</button>`;
    foot.style.display = 'flex';
    modal.querySelectorAll('[data-shift-cancel], [data-modal-close]').forEach(b => b.addEventListener('click', closeEditor));
    const saveBtn = modal.querySelector('[data-shift-save]');
    if (saveBtn) saveBtn.addEventListener('click', saveAdd);
    const reasonEl = body.querySelector('#shift-f-reason');
    if (reasonEl) reasonEl.addEventListener('input', () => {
      STATE.addMeta.reason = reasonEl.value;
      if (STATE.editErrors.addReason) { STATE.editErrors.addReason = ''; reasonEl.classList.remove('is-invalid'); }
    });
    if (!modal.dataset.shiftBound) {
      modal.dataset.shiftBound = '1';
      modal.addEventListener('click', e => { if (e.target === modal) closeEditor(); });
    }
    bindEditorForm(modal, renderAddModal);
    updateDur(modal);
  }
  function openAddModal() { renderAddModal(); openModalEl('modal-shift-editor'); }

  /* ===== 근무코드 수정 = 인-페이지 화면 (호출자가 제공한 host 컨테이너에 렌더 — 앱 레이아웃 유지) ===== */
  let _editHost = null, _editBack = null;
  /* hostEl 안에 수정 화면(헤더 + 폼 + 하단 액션)을 렌더. opts.onBack: 목록/취소/저장완료 시 호출(그리드 복귀). */
  function renderEditInto(hostEl, code, opts) {
    ensureLoaded();
    const src = STATE.shifts.find(s => s.code === code);
    if (!src || !hostEl) return;
    STATE.editingCode = code;
    STATE.editErrors = {};
    STATE.editMeta = { reason: '', effDate: TODAY };
    STATE.form = deepClone(src);
    _editHost = hostEl;
    _editBack = (opts && opts.onBack) || function () {};
    renderEditView();
  }
  /* 예정 변경 안내 — 적용일 미도래 상태에서 에디터/이력 상단에 노출.
     현재(변경 전) 값이 유지되며 effDate 부터 아래 내용으로 바뀐다는 것을 명시. */
  function pendingNoticeHTML(p) {
    if (!p) return '';
    const rows = (p.changes || []).map(c =>
      `<div style="white-space:nowrap;"><span class="t-muted">${esc(c.label)}</span> ${esc(c.from)} <span style="color:var(--color-brand-primary);">→</span> <strong>${esc(c.to)}</strong></div>`).join('');
    return `<div style="margin-bottom:14px;padding:12px 14px;background:var(--color-surface-alt);border:1px solid var(--color-warning);border-radius:var(--radius-sm);line-height:1.55;">
      <div style="font-weight:var(--fw-semibold);color:var(--color-text);font-size:var(--fs-sm);">${esc(fmtDateDot(p.effDate))}부터 아래 내용으로 변경 예정입니다.</div>
      <div style="color:var(--color-text-sub);font-size:var(--fs-xs);margin-top:2px;">적용 시작일 전까지는 현재(변경 전) 값이 그대로 유지됩니다.</div>
      ${rows ? `<div style="margin-top:8px;font-size:var(--fs-sm);">${rows}</div>` : ''}
    </div>`;
  }
  /* 사용 중 근무코드 잠금 안내 — 출/퇴근·휴게 수정 불가 + 신규 추가 유도 (근무코드 생성 기준 불변 원칙) */
  function lockedNoticeHTML() {
    return `<div style="margin-bottom:14px;padding:12px 14px;background:var(--color-surface-alt);border:1px solid var(--color-info);border-radius:var(--radius-sm);line-height:1.55;">
      <div style="font-weight:var(--fw-semibold);color:var(--color-text);font-size:var(--fs-sm);">사용 이력이 있는 근무코드입니다. 출·퇴근 시간과 휴게시간은 변경할 수 없습니다.</div>
      <div style="color:var(--color-text-sub);font-size:var(--fs-xs);margin-top:4px;">
        휴게시간도 급여 산정 기준에 포함되므로, 출·퇴근이 같아도 휴게가 다르면 별도의 근무코드입니다.
        새로운 기준이 필요하면 기존 코드를 수정하지 말고
        <button class="btn btn--xs" type="button" data-shift-add-new style="vertical-align:baseline;">+ 신규 근무코드 추가</button>
        로 등록하세요.
      </div>
    </div>`;
  }
  function renderEditView() {
    const host = _editHost, f = STATE.form;
    if (!host || !f) return;
    const src = STATE.shifts.find(s => s.code === (STATE.editingCode || f.code));
    const used = codeInUse(f.code);                       /* 사용 이력 있음 → 시간 잠금·삭제 불가 */
    const active = !src || src.active !== false;           /* 사용/미사용 상태 */
    const statusPill = !used
      ? `<span class="pill pill--muted" style="white-space:nowrap;">미사용(이력 없음)</span>`
      : (active ? `<span class="pill pill--success" style="white-space:nowrap;">사용 중</span>`
                : `<span class="pill pill--muted" style="white-space:nowrap;">미사용</span>`);
    /* 좌측 액션 — 사용 이력 없음: 삭제 / 사용 중: 미사용 처리 / 미사용 상태: 사용 재개 (모두 전자결재 대상) */
    let leftBtns;
    if (!used)        leftBtns = `<button class="btn btn--danger btn--sm" type="button" data-shift-delete>삭제</button>`;
    else if (active)  leftBtns = `<button class="btn btn--soft-danger btn--sm" type="button" data-shift-deactivate>미사용 처리</button>`;
    else              leftBtns = `<button class="btn btn--sm" type="button" data-shift-reactivate>사용 재개</button>`;
    host.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
        <button class="btn btn--sm" type="button" data-shift-back>← 목록</button>
        <h3 style="font-size:var(--fs-lg);font-weight:var(--fw-semibold);color:var(--color-text);">근무코드 수정</h3>
        <span class="t-muted" style="font-size:var(--fs-sm);">${esc(f.code)}${f.label ? ` · ${esc(f.label)}` : ''}</span>
        ${statusPill}
      </div>
      ${used ? lockedNoticeHTML() : ''}
      ${src && src.pending ? pendingNoticeHTML(src.pending) : ''}
      <div>${editorFormHTML(f, used)}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:18px;padding-top:14px;border-top:1px solid var(--color-divider);">
        ${leftBtns}
        <span style="flex:1;"></span>
        <button class="btn btn--sm" type="button" data-shift-back>취소</button>
        <button class="btn btn--primary btn--sm" type="button" data-shift-save-edit>저장</button>
      </div>`;
    if (!host.dataset.shiftEditBound) {
      host.dataset.shiftEditBound = '1';
      host.addEventListener('click', e => {
        if (e.target.closest('[data-shift-add-new]')) { closeEdit(); openEditor(null); return; }
        if (e.target.closest('[data-shift-back]')) { closeEdit(); return; }
        if (e.target.closest('[data-shift-delete]'))     { openCodeApproval('삭제'); return; }
        if (e.target.closest('[data-shift-deactivate]')) { openCodeApproval('미사용'); return; }
        if (e.target.closest('[data-shift-reactivate]')) { openCodeApproval('재개'); return; }
        if (e.target.closest('[data-shift-history]')) { openHistoryModal(STATE.editingCode); return; }
        if (e.target.closest('[data-shift-save-edit]')) { onEditSaveClick(); return; }
      });
    }
    bindEditorForm(host, renderEditView);
    updateDur(host);
  }
  function closeEdit() {
    _editHost = null;
    STATE.editingCode = null;
    STATE.form = null;
    const cb = _editBack; _editBack = null;
    if (cb) cb();
  }
  /* 근무조 배치의 근무조 설정 모달에서 편집 — 모달 본문(shift-master-body)에 인-페이지 수정 화면 렌더 */
  function openEditFromMaster(code) {
    const host = document.getElementById('shift-master-body');
    if (host) renderEditInto(host, code, { onBack: renderMasterTable });
  }
  /* 저장 클릭 — 사용 중 근무코드는 출/퇴근·휴게가 잠겨 명칭 등만 반영, 즉시 저장.
     (기준 변경은 신규 근무코드 추가로만 가능 — 기존 코드 수정 금지 원칙) */
  function onEditSaveClick() {
    const f = STATE.form;
    if (!validateBasics(f)) return;
    recompute(f);
    applyEdit(null);
  }
  /* 실제 적용 — meta(있으면 적용일/사유) → 이력 기록. 없으면 즉시 저장.
     · 적용 시작일이 오늘(또는 이미 도래) → 마스터에 즉시 반영 (오늘부터, 소급 아님).
     · 적용 시작일이 미래 → 마스터 값은 '변경 전' 그대로 두고 예정 변경(src.pending)으로 보관.
       적용일이 도래하면 promotePending() 이 실제 값으로 승격한다. */
  function applyEdit(meta) {
    const f = STATE.form, code = STATE.editingCode;
    const src = STATE.shifts.find(s => s.code === code);
    recompute(f);
    const changes = src ? diffShift(src, f) : [];
    const scheduled = !!(meta && meta.effDate && meta.effDate > TODAY);
    if (src && !scheduled) {
      /* 즉시 반영 — 남아있던 예정 변경도 정리 */
      Object.assign(src, deepClone(f));
      delete src.pending;
    } else if (src && scheduled) {
      /* 예정 변경 보관 — 현재 값(src)은 건드리지 않음 */
      src.pending = { effDate: meta.effDate, reason: meta.reason, changes: changes, to: deepClone(f), at: nowStamp() };
    }
    if (meta) {
      (STATE.shiftHistory[code] = STATE.shiftHistory[code] || []).unshift({
        at: nowStamp(), by: HR_NAME, effDate: meta.effDate, reason: meta.reason, changes: changes,
      });
      window.toast && window.toast(
        `근무코드 ${code}(${f.label}) ${scheduled ? '변경 예약됨' : '수정됨'} · ${fmtDateDot(meta.effDate)}부터 적용`,
        'success');
    } else {
      window.toast && window.toast(`근무코드 ${code}(${f.label}) 저장됨`, 'success');
    }
    closeEdit();
    refreshAfterChange();
  }
  /* 적용 시작일이 도래한(≤오늘) 예정 변경을 마스터 값으로 승격. 소급 없음(적용일 당일부터). */
  function promotePending() {
    (STATE.shifts || []).forEach(s => {
      if (s.pending && s.pending.effDate && s.pending.effDate <= TODAY) {
        const to = s.pending.to;
        delete s.pending;
        if (to) Object.assign(s, to);
      }
    });
  }

  /* ===== 적용 시작일·수정 사유 모달 (부서 연결 코드 수정 저장 시) ===== */
  function ensureSaveConfirm() {
    if (document.getElementById('shift-save-confirm')) return;
    const el = document.createElement('div');
    el.className = 'modal-backdrop';
    el.id = 'shift-save-confirm';
    el.style.zIndex = '1300';
    el.innerHTML = `
      <div class="modal" style="width:92vw;max-width:520px;">
        <div class="modal__header">
          <div class="modal__title">근무코드 수정 적용</div>
          <button class="modal__close" type="button" data-sc-close aria-label="닫기">✕</button>
        </div>
        <div class="modal__body" data-sc-body style="padding:18px 20px;"></div>
        <div class="modal__footer">
          <button class="btn btn--sm" type="button" data-sc-close>취소</button>
          <button class="btn btn--primary btn--sm" type="button" data-sc-ok>저장</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => {
      if (e.target === el || e.target.closest('[data-sc-close]')) { closeSaveConfirm(); return; }
      if (e.target.closest('[data-sc-ok]')) { confirmSaveConfirm(); return; }
    });
    el.addEventListener('input', e => {
      const d = e.target.closest('[data-sc-eff]');
      if (d) { STATE.editMeta.effDate = d.value; if (STATE.editErrors.effDate) { STATE.editErrors.effDate = ''; d.classList.remove('is-invalid'); } return; }
      const r = e.target.closest('[data-sc-reason]');
      if (r) { STATE.editMeta.reason = r.value; if (STATE.editErrors.reason) { STATE.editErrors.reason = ''; r.classList.remove('is-invalid'); } return; }
    });
  }
  function renderSaveConfirmBody() {
    const el = document.getElementById('shift-save-confirm');
    const em = STATE.editMeta, errs = STATE.editErrors;
    el.querySelector('[data-sc-body]').innerHTML = `
      <div class="fm-tbl fm-tbl--form">
        <div class="fm-tbl__row fm-tbl__row--1" style="grid-template-columns:96px 1fr;">
          <div class="fm-tbl__label">적용 시작일 <span style="color:var(--color-danger);">*</span></div>
          <div class="fm-tbl__value" style="flex-direction:column;align-items:flex-start;gap:4px;">
            <input class="input${errs.effDate ? ' is-invalid' : ''}" type="date" data-sc-eff value="${esc(em.effDate || TODAY)}" min="${esc(TODAY)}" style="width:180px;" />
            ${errs.effDate ? `<span class="field-error">${esc(errs.effDate)}</span>` : ''}
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" style="grid-template-columns:96px 1fr;">
          <div class="fm-tbl__label">수정 사유 <span style="color:var(--color-danger);">*</span></div>
          <div class="fm-tbl__value" style="flex-direction:column;align-items:stretch;gap:4px;">
            <textarea class="input${errs.reason ? ' is-invalid' : ''}" data-sc-reason rows="2" placeholder="예: 하계 단축근무 적용" style="width:100%;height:56px;min-height:56px;resize:vertical;">${esc(em.reason || '')}</textarea>
            ${errs.reason ? `<span class="field-error">${esc(errs.reason)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="form-help" style="margin-top:10px;line-height:1.5;">부서에 연결된 근무코드입니다. 변경 내용은 <strong>적용 시작일 이후 근무</strong>부터 반영되며, 이전 근태 데이터에는 소급되지 않습니다.</div>`;
  }
  function openSaveConfirm() {
    ensureSaveConfirm();
    STATE.editErrors = {};
    if (!STATE.editMeta.effDate) STATE.editMeta.effDate = TODAY;
    renderSaveConfirmBody();
    const el = document.getElementById('shift-save-confirm');
    el.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeSaveConfirm() {
    const el = document.getElementById('shift-save-confirm');
    if (el) el.classList.remove('is-open');
  }
  function confirmSaveConfirm() {
    const em = STATE.editMeta;
    STATE.editErrors = {};
    if (!em.effDate) STATE.editErrors.effDate = '적용 시작일을 선택해 주세요.';
    else if (em.effDate < TODAY) STATE.editErrors.effDate = '적용 시작일은 오늘 이후로 설정해 주세요.';
    if (!em.reason || !em.reason.trim()) STATE.editErrors.reason = '수정 사유를 입력해 주세요.';
    if (Object.keys(STATE.editErrors).length) { renderSaveConfirmBody(); return; }
    closeSaveConfirm();
    applyEdit({ effDate: em.effDate, reason: em.reason.trim() });
  }

  /* ===== 수정 이력 모달 ===== */
  function ensureHistoryModal() {
    if (document.getElementById('shift-history-modal')) return;
    const el = document.createElement('div');
    el.className = 'modal-backdrop';
    el.id = 'shift-history-modal';
    el.style.zIndex = '1300';
    el.innerHTML = `
      <div class="modal modal--lg" style="width:94vw;max-width:840px;max-height:86vh;display:flex;flex-direction:column;">
        <div class="modal__header">
          <div class="modal__title" data-hist-title>수정 이력</div>
          <button class="modal__close" type="button" data-hist-close aria-label="닫기">✕</button>
        </div>
        <div class="modal__body" data-hist-body style="flex:1;min-height:0;overflow:auto;padding:16px 20px;"></div>
        <div class="modal__footer"><button class="btn btn--sm" type="button" data-hist-close>닫기</button></div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-hist-close]')) el.classList.remove('is-open'); });
  }
  function openHistoryModal(code) {
    ensureHistoryModal();
    const el = document.getElementById('shift-history-modal');
    const s = STATE.shifts.find(x => x.code === code);
    const hist = STATE.shiftHistory[code] || [];
    el.querySelector('[data-hist-title]').textContent = `수정 이력 — ${code}${s && s.label ? ` (${s.label})` : ''}`;
    /* 적용 시작일이 미도래(> 오늘)한 변경은 아직 반영되지 않은 '적용 예정' 상태 */
    const hasPending = hist.some(h => h.effDate && h.effDate > TODAY);
    const noticeHTML = hasPending
      ? `<div style="margin-bottom:12px;padding:11px 14px;background:var(--color-surface-alt);border:1px solid var(--color-warning);border-radius:var(--radius-sm);font-size:var(--fs-sm);color:var(--color-text-sub);line-height:1.55;">
          <strong style="color:var(--color-text);">적용 예정</strong> 항목은 적용 시작일이 아직 도래하지 않아 반영되지 않았습니다. 그때까지는 <strong style="color:var(--color-text);">변경 이전 값</strong>이 유지됩니다.
        </div>`
      : '';
    el.querySelector('[data-hist-body]').innerHTML = hist.length ? `
      ${noticeHTML}
      <div class="shift-tbl-wrap" style="border:1px solid var(--color-divider);border-radius:var(--radius-sm);">
        <table class="shift-tbl" style="min-width:max-content;">
          <thead><tr>
            <th style="min-width:130px;">수정일시</th>
            <th style="width:72px;">수정자</th>
            <th style="width:88px;text-align:center;">적용 시작일</th>
            <th style="width:80px;text-align:center;">상태</th>
            <th style="min-width:220px;">변경 항목 (전 → 후)</th>
            <th style="min-width:140px;">수정 사유</th>
          </tr></thead>
          <tbody>
            ${hist.map(h => {
              const applied = !(h.effDate && h.effDate > TODAY);
              const statusPill = applied
                ? '<span class="pill pill--success" style="white-space:nowrap;">적용됨</span>'
                : '<span class="pill pill--warning" style="white-space:nowrap;">적용 예정</span>';
              return `<tr>
              <td style="white-space:nowrap;">${esc(h.at)}</td>
              <td style="white-space:nowrap;">${esc(h.by)}</td>
              <td style="text-align:center;white-space:nowrap;">${esc(fmtDateDot(h.effDate))}</td>
              <td style="text-align:center;">${statusPill}</td>
              <td>${(h.changes && h.changes.length) ? h.changes.map(c => `<div style="white-space:nowrap;"><span class="t-muted">${esc(c.label)}</span> ${esc(c.from)} <span style="color:var(--color-brand-primary);">→</span> <strong>${esc(c.to)}</strong></div>`).join('') : '<span class="t-muted">-</span>'}</td>
              <td style="white-space:normal;word-break:keep-all;">${esc(h.reason || '-')}</td>
            </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : `<div style="text-align:center;padding:30px;color:var(--color-text-muted);">수정 이력이 없습니다.</div>`;
    el.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function updateDur(modal) {
    const f = STATE.form;
    if (!f) return;
    recompute(f);
    /* 신규 등록 중이면 시간 변경에 따라 D/N 유형·코드를 실시간 재채번 (수정 시엔 기존 코드 유지) */
    if (!STATE.editingCode) {
      f.code = channelCode(f);
      const codeEl = modal.querySelector('[data-shift-code]');
      if (codeEl) codeEl.textContent = f.code || '-';
    }
    const sum = modal.querySelector('[data-shift-summary]');
    if (sum) {
      const kind = f.isNight
        ? '<span class="pill pill--purple">야간</span>'
        : '<span class="pill pill--info">주간</span>';
      const item = (label, val, strong) => `
        <span style="display:inline-flex;align-items:baseline;gap:5px;">
          <span class="t-muted" style="font-size:var(--fs-xs);">${label}</span>
          <strong style="font-size:var(--fs-md);${strong ? 'color:var(--color-brand-primary);' : ''}">${val}</strong>
        </span>`;
      sum.innerHTML = `
        <span style="display:inline-flex;align-items:center;gap:6px;">
          <span class="t-muted" style="font-size:var(--fs-xs);">구분</span>${kind}
        </span>
        ${item('총 근무', f.workHours, true)}
        ${item('연장', fmtMin(f.otMin))}
        ${item('심야', fmtMin(f.nightMin))}
        ${item('휴게', `${f.breakMin}분`)}`;
    }
  }

  /* 공용 폼 바인딩 — 추가 모달 / 수정 화면 공통. rerender: 휴게 추가·삭제 시 재렌더 콜백. */
  function bindEditorForm(root, rerender) {
    const f = STATE.form;
    const labelEl = root.querySelector('#shift-f-label');
    if (labelEl) labelEl.addEventListener('input', () => { f.label = labelEl.value; });
    const bindTime = (idp, key) => {
      const h = root.querySelector('#' + idp + '-h'), m = root.querySelector('#' + idp + '-m');
      const upd = () => { if (h && m) { f[key] = `${h.value}:${m.value}`; updateDur(root); } };
      if (h) h.addEventListener('change', upd);
      if (m) m.addEventListener('change', upd);
    };
    bindTime('shift-f-start', 'start');
    bindTime('shift-f-end', 'end');
    /* 휴게시간 — 출·퇴근과 동일한 시/분 select (30분 단위). bindTime 이 -h/-m 을 읽어 f[key] 갱신 */
    bindTime('shift-f-b1s', 'breakStart');
    bindTime('shift-f-b1e', 'breakEnd');
    bindTime('shift-f-b2s', 'breakStart2');
    bindTime('shift-f-b2e', 'breakEnd2');
    const addBreak = root.querySelector('[data-break-add]');
    if (addBreak) addBreak.addEventListener('click', () => { f.breakStart2 = '17:00'; f.breakEnd2 = '17:30'; rerender(); });
    const rmBreak = root.querySelector('[data-break-remove]');
    if (rmBreak) rmBreak.addEventListener('click', () => { f.breakStart2 = ''; f.breakEnd2 = ''; rerender(); });
  }

  function validateBasics(f) {
    if (!f.label || !f.label.trim()) { window.toast && window.toast('근무코드 명을 입력해 주세요.', 'warning'); return false; }
    if (!f.start || !f.end) { window.toast && window.toast('출근·퇴근 시간을 입력해 주세요.', 'warning'); return false; }
    return true;
  }

  /* 변경 이력 기록 — 추가/삭제/미사용/재개 (전자결재 승인 결과). 대상코드·유형·사유·변경자·변경일시·승인자. */
  function logCodeChange(code, label, type, reason) {
    STATE.codeChangeLog.unshift({ at: nowStamp(), code: code, label: label || '', type: type, reason: reason || '', by: HR_NAME, approver: APPROVER });
  }

  /* 두 근무코드의 생성 기준(출·퇴근·휴게) 동일 여부 — 휴게시간도 급여 산정 기준이라 identity 에 포함.
     출·퇴근이 같아도 휴게가 다르면 별개 코드 / 셋 다 같으면 완전 동일 기준(중복). */
  function sameCriteria(a, b) {
    return a.start === b.start && a.end === b.end
      && (a.breakStart || '') === (b.breakStart || '') && (a.breakEnd || '') === (b.breakEnd || '')
      && (a.breakStart2 || '') === (b.breakStart2 || '') && (a.breakEnd2 || '') === (b.breakEnd2 || '');
  }

  /* 추가 저장 (모달) — 신규 채번 후 등록. 추가는 전자결재 대상 → 변경 사유 필수 + 변경 이력 기록. */
  function saveAdd() {
    const f = STATE.form;
    if (!validateBasics(f)) return;
    const reason = (STATE.addMeta.reason || '').trim();
    STATE.editErrors = STATE.editErrors || {};
    STATE.editErrors.dup = '';
    /* 동일 기준(출·퇴근·휴게 전부 일치) 중복 방지 — 기준이 다르면(휴게만 달라도) 신규 허용 */
    const dup = STATE.shifts.find(s => sameCriteria(s, f));
    if (dup) { STATE.editErrors.dup = `동일한 출·퇴근·휴게 기준의 근무코드 ${dup.code}(${dup.label || dup.code})가 이미 있습니다. 기존 근무코드를 사용하세요.`; renderAddModal(); return; }
    if (!reason) { STATE.editErrors.addReason = '변경 사유를 입력해 주세요.'; renderAddModal(); return; }
    recompute(f);
    f.code = channelCode(f);   /* 최종 채번 확정 (WT+D/N+일련번호) */
    f.active = true;
    STATE.shifts.push(deepClone(f));
    STATE.shifts.sort((a, b) => String(a.code).localeCompare(String(b.code)));
    logCodeChange(f.code, f.label, '추가', reason);
    window.toast && window.toast(`근무코드 ${f.code}(${f.label}) 추가 — 전자결재 상신 완료`, 'success');
    closeEditor();
    refreshAfterChange();
  }

  /* ===== 삭제 / 미사용 처리 / 재개 — 전자결재 사유 모달 (공용) ===== */
  function ensureCodeApproval() {
    if (document.getElementById('shift-code-approval')) return;
    const el = document.createElement('div');
    el.className = 'modal-backdrop';
    el.id = 'shift-code-approval';
    el.style.zIndex = '1300';
    el.innerHTML = `
      <div class="modal" style="width:92vw;max-width:520px;">
        <div class="modal__header">
          <div class="modal__title" data-ca-title>근무코드 변경</div>
          <button class="modal__close" type="button" data-ca-close aria-label="닫기">✕</button>
        </div>
        <div class="modal__body" data-ca-body style="padding:18px 20px;"></div>
        <div class="modal__footer">
          <button class="btn btn--sm" type="button" data-ca-close>취소</button>
          <button class="btn btn--primary btn--sm" type="button" data-ca-ok>전자결재 상신</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => {
      if (e.target === el || e.target.closest('[data-ca-close]')) { closeCodeApproval(); return; }
      if (e.target.closest('[data-ca-ok]')) { confirmCodeApproval(); return; }
    });
    el.addEventListener('input', e => {
      const r = e.target.closest('[data-ca-reason]');
      if (r && STATE.codeAct) { STATE.codeAct.reason = r.value; if (STATE.codeAct.error) { STATE.codeAct.error = ''; r.classList.remove('is-invalid'); } }
    });
  }
  function caTypeWord(t) { return t === '재개' ? '사용 재개' : (t === '미사용' ? '미사용 처리' : t); }
  function renderCodeApprovalBody() {
    const a = STATE.codeAct; if (!a) return;
    const el = document.getElementById('shift-code-approval');
    el.querySelector('[data-ca-title]').textContent = `근무코드 ${caTypeWord(a.type)}`;
    const guide = a.type === '삭제'
      ? '사용 이력이 없는 근무코드를 삭제합니다. 삭제 후에는 복구할 수 없습니다.'
      : (a.type === '미사용'
          ? '사용 이력이 있어 삭제할 수 없습니다. 미사용 처리하면 이후 근무스케줄 편성에서 선택할 수 없습니다. 기존 배정·근태 데이터는 그대로 유지됩니다.'
          : '미사용 처리된 근무코드를 다시 사용 상태로 되돌립니다.');
    el.querySelector('[data-ca-body]').innerHTML = `
      <div style="margin-bottom:12px;font-size:var(--fs-sm);color:var(--color-text-sub);">
        대상 근무코드 <strong style="color:var(--color-brand-primary);">${esc(a.code)}</strong>${a.label ? ` <span class="t-muted">(${esc(a.label)})</span>` : ''}
      </div>
      <div class="fm-tbl fm-tbl--form">
        <div class="fm-tbl__row fm-tbl__row--1" style="grid-template-columns:96px 1fr;">
          <div class="fm-tbl__label">변경 사유 <span style="color:var(--color-danger);">*</span></div>
          <div class="fm-tbl__value" style="flex-direction:column;align-items:stretch;gap:4px;">
            <textarea class="input${a.error ? ' is-invalid' : ''}" data-ca-reason rows="2" placeholder="예: 근무형태 개편으로 미사용 전환" style="width:100%;height:56px;min-height:56px;resize:vertical;">${esc(a.reason || '')}</textarea>
            ${a.error ? `<span class="field-error">${esc(a.error)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="form-help" style="margin-top:10px;line-height:1.5;">${esc(guide)} 이 작업은 <strong>전자결재 대상</strong>이며 승인 후 변경 이력에 기록됩니다.</div>`;
  }
  function openCodeApproval(type) {
    const code = STATE.editingCode; if (!code) return;
    const s = STATE.shifts.find(x => x.code === code);
    STATE.codeAct = { type: type, code: code, label: (s && s.label) || code, reason: '', error: '' };
    ensureCodeApproval();
    renderCodeApprovalBody();
    const el = document.getElementById('shift-code-approval');
    el.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeCodeApproval() {
    const el = document.getElementById('shift-code-approval');
    if (el) el.classList.remove('is-open');
    if (!document.querySelector('.modal-backdrop.is-open')) document.body.style.overflow = '';
  }
  function confirmCodeApproval() {
    const a = STATE.codeAct; if (!a) return;
    if (!a.reason || !a.reason.trim()) { a.error = '변경 사유를 입력해 주세요.'; renderCodeApprovalBody(); return; }
    const reason = a.reason.trim();
    const s = STATE.shifts.find(x => x.code === a.code);
    if (a.type === '삭제')        { STATE.shifts = STATE.shifts.filter(x => x.code !== a.code); }
    else if (a.type === '미사용' && s) { s.active = false; }
    else if (a.type === '재개'   && s) { s.active = true; }
    logCodeChange(a.code, a.label, a.type, reason);
    closeCodeApproval();
    window.toast && window.toast(`근무코드 ${a.code} ${caTypeWord(a.type)} — 전자결재 상신 완료`, 'success');
    STATE.codeAct = null;
    closeEdit();
    refreshAfterChange();
  }

  /* 변경 반영 — 마스터 모달/페이지/구독자 갱신 */
  function refreshAfterChange() {
    const mm = document.getElementById('modal-shift-master');
    if (mm && mm.classList.contains('is-open')) renderMasterTable();
    const ps = document.getElementById('page-att-shift');
    if (ps) renderMain(ps);
    notifyShiftChange();
  }

  /* ============ 모달 공통 ============ */
  function openModalEl(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeModalEl(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('is-open');
    if (!document.querySelector('.modal-backdrop.is-open')) document.body.style.overflow = '';
  }

  /* =========================================================
   *  Public API — 근태 현황 화면에서 매핑 조회용
   * ========================================================= */
  App.AttShifts = {
    list:    () => { ensureLoaded(); return STATE.shifts.slice(); },
    get:     (code) => { ensureLoaded(); return STATE.shifts.find(s => s.code === code) || null; },
    /* 근무코드 명(라벨) — 없으면 코드로 대체. 배치/현황 등 타 화면 표기 공용. */
    labelOf: (code) => { const s = App.AttShifts.get(code); return s ? (s.label || code) : code; },
    /* 부서별로 사용 가능한 근무코드 — 근로계약 작성 시 활용. 미지정(useDepts=[]) 근무코드는 전부서 공통으로 노출. */
    forDept: (dept) => {
      ensureLoaded();
      return STATE.shifts.filter(s => !s.useDepts || !s.useDepts.length || s.useDepts.includes(dept));
    },
    depts:   () => getDeptList(),
    /* 근무코드가 직원에게 배정되어 사용 중인지 — 사용 중이면 수정·삭제 불가 */
    inUse:   (code) => shiftInUse(code),
    /* 부서 연결 여부(직원 배정 또는 부서 근무코드 설정 연결) — 운영 중 수정 시 사유·적용일 필수 판정 */
    connected: (code) => shiftConnected(code),
    /* 근무코드 수정 이력 — [{ at, by, effDate, reason, changes:[{field,label,from,to}] }] (최신순) */
    history: (code) => (STATE.shiftHistory[code] ? STATE.shiftHistory[code].slice() : []),
    /* 근무코드 변경 이력(전자결재) — [{ at, code, label, type, reason, by, approver }] (최신순). 근무코드 설정 메인 화면 노출용. */
    changeLog: () => { ensureLoaded(); return STATE.codeChangeLog.slice(); },
    /* 사용 상태 — 미사용 처리된 코드는 false. 편성 화면에서 선택 후보 제외용. */
    isActive: (code) => { const s = App.AttShifts.get(code); return !s || s.active !== false; },
    /* 근무코드 마스터 편집 — '근무정책 설정 > 근무코드 설정' 인라인에서 재사용. modal-shift-editor 열기. */
    openEditor: (code) => { ensureLoaded(); openEditor(code || null); },
    /* 수정 화면을 host 컨테이너 안에 인-페이지로 렌더 (앱 레이아웃 유지). opts.onBack: 목록 복귀 콜백. */
    editInto: (hostEl, code, opts) => { ensureLoaded(); renderEditInto(hostEl, code, opts); },
    /* 전사 기본 근무코드 — 부서 신설 시 상위 조직이 없으면 상속하는 기본값. */
    globalDefault: () => { ensureLoaded(); const s = STATE.shifts.find(x => x.isGlobalDefault); return s ? s.code : ''; },
    /* 전사 기본 근무코드 지정 — 정확히 1개만 유지 (기존 지정 해제 후 설정). */
    setGlobalDefault: (code) => {
      ensureLoaded();
      if (!STATE.shifts.some(s => s.code === code)) return;
      STATE.shifts.forEach(s => { s.isGlobalDefault = (s.code === code); });
      notifyShiftChange();
    },
    /* 근무코드 마스터 변경(추가/수정/삭제) 시 호출될 콜백 등록 — 인라인 테이블 갱신용. */
    onChange: (cb) => { if (typeof cb === 'function') _changeCbs.push(cb); },
  };
  const _changeCbs = [];
  function notifyShiftChange() { _changeCbs.forEach(cb => { try { cb(); } catch (e) { /* noop */ } }); }

  /* =========================================================
   *  Page Init
   * ========================================================= */
  function initPage() {
    const pageEl = document.getElementById('page-att-shift');
    if (!pageEl) return;
    pageEl.__onShow = () => {
      ensureLoaded();
      if (App.AttShiftOverrides) {
        App.AttShiftOverrides.ensureSeed();
        if (!pageEl.dataset.shiftOvBound) { pageEl.dataset.shiftOvBound = '1'; App.AttShiftOverrides.onChange(() => { const el = document.getElementById('page-att-shift'); if (el && el.dataset.shiftPageBound) renderMain(el); }); }
      }
      renderMain(pageEl);
    };
  }
  const prev = App.initPages;
  App.initPages = function () {
    if (typeof prev === 'function') prev();
    initPage();
  };
})();
