/* =========================================================
 * Module: 근무조 마스터 데이터 + 근무조 설정(추가/수정/삭제·비활성) 에디터
 *
 *  ※ 본 파일은 화면(page)이 아니라 근태 도메인 공용 데이터·에디터 모듈이다.
 *    - 근무조 마스터(A~J 정의 / 시간 / 휴게 / 사용부서 / 색상)를 단일 소스로 보관.
 *    - 근무조 추가/수정/삭제·비활성화 에디터 모달(modal-shift-editor)을 제공.
 *      '근무정책 설정 > 근무조 설정'(page-att-settings) 인라인에서 App.AttShifts.editInto /
 *      openEditor 로 재사용한다.
 *
 *  공개 API: App.AttShifts.list() / .get(code) / .forDept(dept) / .depts() / .codeFlags() /
 *            .editInto() / .openEditor() / .requestChange() / .changeLog() / .globalDefault() …
 *    — 근태 현황 / 근무스케줄 편성 / 근로계약 화면에서 매핑 조회·편집용.
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
  /* 두 'HH:MM' 사이 경과 분(정수). 야간조(퇴근 ≤ 출근)는 익일로 보고 +24h.
     ※ 0.1시간(6분) 단위로 스냅하면 분 단위 복원 시 ±2분 오차가 생기므로 분을 그대로 반환한다. */
  function diffMin(start, end) {
    if (!hm(start) || !hm(end)) return 0;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins <= 0) mins += 24 * 60;   /* 야간조 — 익일 종료 */
    return mins;
  }
  function toMin(t) { if (!hm(t)) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + m; }
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
  /* 근무조 근태 산정 기준 재계산 — 출근/퇴근/간식(휴게)로부터 총 근무·연장·심야시간·주야 구분 산출.
     · workHours : 총 근무시간 (출~퇴 - 간식). 'H:MM'
     · breakMin  : 간식(휴게) 총 분 (1+2 합산)
     · otMin     : 연장시간 분 — 1일 소정근로 8시간 초과분
     · nightMin  : 심야시간 분 — 22:00~06:00 겹침 (간식 제외 총 구간 기준)
     · isNight   : 심야시간 포함 시 야간 근무조로 분류 */
  const DAILY_STD_MIN = 8 * 60;
  function recompute(f) {
    const totalMin = diffMin(f.start, f.end);
    let bmin = 0;
    if (f.breakStart && f.breakEnd)   bmin += diffMin(f.breakStart, f.breakEnd);
    if (f.breakStart2 && f.breakEnd2) bmin += diffMin(f.breakStart2, f.breakEnd2);
    f.breakMin = bmin;
    const workMin = Math.max(0, totalMin - bmin);
    f.workHours = fmtMin(workMin);
    f.otMin = Math.max(0, workMin - DAILY_STD_MIN);   /* 연장 = 8시간 초과분 */
    f.nightMin = nightMinutes(f.start, f.end);        /* 심야 = 22~06 겹침 */
    f.isNight = f.nightMin > 0;                        /* 야간 자동 판정 */
  }
  /* 근무시간유형(D=주간 / N=야간) — 심야 겹침 여부로 결정 */
  function workTypeChar(f) { return f.isNight ? 'N' : 'D'; }

  /* ============ Mock 근무조 ============
   *   근무조 = 출·퇴근/총 근무시간/연장·심야·간식(휴게) 등 근태 산정 기준의 단위.
   *   · code  : 시스템 자동 채번 'WT + 근무시간유형(D 주간 / N 야간) + 일련번호(2자리)'.
   *             주간 08개(WTD01~WTD08), 야간 02개(WTN01~WTN02). (심야 22~06 겹침으로 D/N 분류)
   *   · label : 근무조 명(사람이 읽는 이름). 코드와 별개 namespace — 배치/현황 등 타 화면은 label 로 표기.
   *   · workHours / breakMin / otMin / nightMin : recompute() 로 산출되는 근태 산정값.
   *   · isGlobalDefault : 전사 기본 근무조(부서 신설 시 상위 조직 없으면 상속) — 정확히 1개. */
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
      /* 데모 — 과거 사용 후 배정 해제된 미사용 가능한 근무조(사용 부서 없음). 편집·삭제 불가, 사용 재개만 가능. */
      { code: 'WTD09', label: '단축조(구)', useDepts: [],                    start: '09:00', end: '15:00', breakStart: '12:00', breakEnd: '13:00', breakStart2: '',      breakEnd2: '', active: false, hist: true, startedAt: '2024-09-01' },
      { code: 'WTN01', label: 'I조', useDepts: ['가공1팀','가공2팀','가공3팀'], start: '19:00', end: '06:30', breakStart: '00:00', breakEnd: '01:00', breakStart2: '05:00', breakEnd2: '05:30' },
      { code: 'WTN02', label: 'J조', useDepts: ['출력팀','옵셋인쇄팀','출고팀'], start: '19:30', end: '07:30', breakStart: '00:00', breakEnd: '01:00', breakStart2: '05:00', breakEnd2: '05:30' },
    ];
    rows.forEach(r => {
      r.memberCount = 0;
      if (r.active === undefined) r.active = true;   /* 사용 상태 기본 '사용' */
      if (!r.startedAt) r.startedAt = '2025-07-01';  /* 사용 시작일(등록/최초 사용) */
      if (!r.usageLog) r.usageLog = [];              /* 사용/미사용 상태 변경 이력 */
      if (!r.color) r.color = 'gray';                /* 근무조 색상 기본값 — 회색(사용자가 상세에서 지정) */
      recompute(r);
    });
    return rows;
  }

  /* 근무조 색상 팔레트 — 기본 회색 + 빨·주·노·초·파·남·검(파스텔 톤). 근무조 명 옆 컬러칩 · 스케줄 시각 구분.
     ※ 보라는 휴가(임직원현황 보라)와 겹칠 수 있어 근무조 팔레트에서 제외한다. */
  const SHIFT_COLORS = [
    { key: 'gray',   label: '기본', hex: '#DDE1E6' },
    { key: 'red',    label: '빨강', hex: '#F6C9CB' },
    { key: 'orange', label: '주황', hex: '#FBD9B0' },
    { key: 'yellow', label: '노랑', hex: '#F5E7A3' },
    { key: 'green',  label: '초록', hex: '#C2E5C6' },
    { key: 'blue',   label: '파랑', hex: '#BFD7F0' },
    { key: 'navy',   label: '남색', hex: '#AEB8E0' },
    { key: 'black',  label: '검정', hex: '#A7AEBB' },
  ];
  function colorHexOf(key) { const c = SHIFT_COLORS.find(x => x.key === key); return c ? c.hex : SHIFT_COLORS[0].hex; }

  /* 근무조 전자결재 승인자(mock) — 추가/삭제/미사용 결재 승인 주체 */
  const APPROVER = '김상무';
  /* 변경 이력 시드 — 데모용. 삭제/미사용/재개만 전자결재·이력 대상(추가는 자유·미기록).
     WTD09(단축조·구)는 배정 해제 후 미사용 처리된 상태와 정합. WTN03(K조)은 삭제되어 목록에 없음. */
  function seedChangeLog() {
    STATE.codeChangeLog = [
      { at: '26/05/27   14:20', code: 'WTD09', label: '단축조(구)', type: '비활성', reason: '단축근무 폐지로 비활성화', by: HR_NAME, approver: APPROVER },
      { at: '26/02/14   16:45', code: 'WTN03', label: 'K조',        type: '삭제',   reason: '배정 이력 없는 야간조 정리', by: HR_NAME, approver: APPROVER },
    ];
    /* WTD09 활성/비활성 변경 시드 — 사용 이력 모달의 상태 변경 타임라인 */
    const w9 = STATE.shifts.find(s => s.code === 'WTD09');
    if (w9) w9.usageLog = [
      { at: '24/09/01', status: '활성',   reason: '신규 등록', by: HR_NAME, approver: APPROVER },
      { at: '26/05/27', status: '비활성', reason: '단축근무 폐지로 비활성화', by: HR_NAME, approver: APPROVER },
    ];
  }

  /* ============ STATE ============ */
  const STATE = {
    shifts: [],
    editingCode: null,       /* null = 신규, code = 수정 */
    form: null,
    /* 근무조 수정 이력 — { code: [ { at(수정일시), by(수정자), effDate(적용시작일), reason(사유), changes:[{field,label,from,to}] } ] } */
    shiftHistory: {},
    /* 근무조 변경 이력(전자결재 대상) — [{ at(변경일시), code(대상 근무조), label, type:'추가'|'삭제'|'미사용'|'재개', reason(변경 사유), by(변경자), approver(승인자) }] (최신순) */
    codeChangeLog: [],
    /* 추가 모달 — 변경 사유(전자결재 상신 시 필수) */
    addMeta: { reason: '' },
    /* 삭제/미사용/재개 전자결재 상태 — { type, code, label, reason, error } */
    codeAct: null,
    /* 수정 모달 상태 — 부서 연결 근무조 수정 시 필수 입력 (적용 시작일/사유) + 인라인 검증 에러 */
    editMeta: { reason: '', effDate: '' },
    editErrors: {},
  };

  function ensureLoaded() {
    if (!STATE.shifts.length) { STATE.shifts = makeMock(); seedChangeLog(); }
    promotePending();   /* 적용일이 도래한 예정 변경을 반영 */
  }
  /* 현재 이 근무조를 사용 중인 부서 — 부서별 근무정책 연결 + 직원 배정 + (시드)useDepts 합집합.
     '사용 부서' pill 표기와 미사용/삭제/편집 제한 판정의 단일 소스. */
  function usingDeptsOf(code) {
    if (!code) return [];
    ensureLoaded();
    const s = STATE.shifts.find(x => x.code === code);
    const set = new Set([].concat((s && s.useDepts) || []).filter(Boolean));
    const WP = window.App && App.AttWorkPolicy;
    if (WP && WP.deptsUsingCode) { try { WP.deptsUsingCode(code).forEach(d => d && set.add(d)); } catch (e) { /* noop */ } }
    allEmps().forEach(e => { if (e && e.shift === code && e.dept) set.add(e.dept); });
    return Array.from(set);
  }
  /* 사용 중인 부서 있음 — 있으면 미사용 처리·삭제·편집 불가(부서에서 먼저 해제해야 함). */
  function codeInUse(code) { return usingDeptsOf(code).length > 0; }
  /* 사용 이력 있음 — 현재 사용 중이거나 과거 사용 후 해제된(hist) 코드. 삭제 불가·기준(출/퇴근·휴게) 잠금. */
  function codeHasHistory(code) {
    if (codeInUse(code)) return true;
    const s = STATE.shifts.find(x => x.code === code);
    return !!(s && s.hist);
  }
  /* 근무조 상태/가능 액션 통합 판정 (정책 단일 소스)
     · status : 'pending'(승인대기) | 'inuse'(사용 부서 ≥1 = 사용 중) | 'unused'(사용 부서 0 = 미사용) — 사용 부서 수 기준(파생)
     · active : 활성/비활성(별도 축). 비활성 = 배치 후보에서 제외(폐기). 상태 뱃지와 무관한 마커로 표기
     · everUsed : 한번이라도 근무스케줄 배치(근태 산정)에 사용됨 → 수정·삭제 불가 (사용 이력)
     · isDefault : 전사 기본 근무조 → 수정·삭제·비활성화 모두 불가
     · canEdit/canDelete : 사용 부서 0 + 기본 아님 + 사용 이력 없음 + 활성 + 대기 아님
     · canDeactivate(비활성화) : 사용 부서 0 + 활성 + 기본/대기 아님
     · canActivate(활성화) : 비활성 코드 재사용 */
  function codeFlags(code) {
    ensureLoaded();
    const s = STATE.shifts.find(x => x.code === code) || null;
    const inUse = usingDeptsOf(code).length > 0;                /* 현재 사용 부서 있음 → 사용/미사용 판정 */
    const gd = STATE.shifts.find(x => x.isGlobalDefault);
    const isDefault = !!(s && s.isGlobalDefault) || !!(gd && gd.code === code);
    const usedBefore = !!(s && s.hist);                          /* 과거 사용 이력(현재 미배치) */
    const everUsed = inUse || usedBefore;                        /* 한번이라도 근무스케줄 배치(근태 산정)에 사용됨 → 수정·삭제 불가 */
    const active = !s || s.active !== false;                     /* 활성/비활성(별도 축) — 비활성 = 배치 후보 제외(폐기) */
    const pending = !!(s && s.pendingChange);                    /* 삭제·비활성화 승인대기 */
    return {
      code: code, s: s, inUse: inUse, isDefault: isDefault, everUsed: everUsed, active: active, pending: pending,
      /* 수정/삭제 — 사용 이력 없고, 사용 부서 없고, 활성 상태일 때만 */
      canEdit:       active && !inUse && !usedBefore && !isDefault && !pending,
      canDelete:     active && !inUse && !usedBefore && !isDefault && !pending,
      /* 비활성화 — 사용 부서 0 + 활성 상태 (기본/대기 아님) */
      canDeactivate: active && !inUse && !isDefault && !pending,
      /* 활성화 — 비활성 코드 재사용 */
      canActivate:   !active && !pending && !isDefault,
      /* 상태 뱃지 = 사용 부서 수 기준(파생). 활성/비활성은 별도 마커. */
      status: pending ? 'pending' : (inUse ? 'inuse' : 'unused'),
    };
  }
  function pad2(n) { return String(n).padStart(2, '0'); }

  /* 근무조 사용 부서 판정용 임직원 목록 — 근태 현황 EMP_LIST 우선, 없으면 App.Employees. */
  function allEmps() {
    if (App.AttStatus && App.AttStatus.EMP_LIST && App.AttStatus.EMP_LIST.length)
      return App.AttStatus.EMP_LIST.map(e => ({ id: e.id, name: e.name, dept: e.dept, rank: e.rank || '', position: e.position || '', shift: e.shift || 'WTD01' }));
    if (App.Employees && App.Employees.length) return App.Employees.slice();
    return [];
  }

  /* =========================================================
   *  근무조 마스터 에디터 — 추가/수정/삭제·비활성화 모달
   * ========================================================= */
  /* 근무조 자동 채번 — 'WT' + 근무시간유형(D/N) + 유형별 일련번호(2자리).
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
      color:       'gray',
    };
    recompute(f);
    f.code = channelCode(f);   /* 주간 09~18 → WTD0X */
    return f;
  }

  /* ============ 운영 중 수정 — 부서 연결 판정 / 수정 이력 ============ */
  /* 부서에 연결된 근무조인지 — 직원 배정(shiftInUse) 또는 부서별 근무조 설정 연결.
     연결된 코드 수정 시 적용 시작일·사유 필수, 변경은 적용일 이후 근무부터 반영(소급 없음). */
  function shiftConnected(code) {
    if (!code) return false;
    if (shiftInUse(code)) return true;
    const WP = window.App && App.AttWorkPolicy;
    return !!(WP && WP.codeLinked && WP.codeLinked(code));
  }
  /* 수정 이력 비교 대상 필드 */
  const HIST_FIELDS = [
    ['label', '근무조 명'], ['start', '출근'], ['end', '퇴근'],
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
      /* 수정은 host 컨테이너가 필요하므로 App.AttShifts.editInto(host, code) 로 진입한다.
         (근무조 설정 page-att-settings 이 자체 host 에 인-페이지로 렌더) — 여기서는 처리하지 않음. */
      return;
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

  /* ----- 공용 폼 HTML (추가 모달 / 수정 화면 공용) — 코드·명·출퇴근(10분 select)·휴게·요약.
     depts(배열) 전달 시 맨 아래 '사용 부서' 행 추가(상세 화면 전용 — 모든 사용 부서 표시). ----- */
  /* 잠금(읽기 전용) 상세에서 휴게시간을 값만 표시 — '12:00~13:00 · 17:00~17:30 (60분)' */
  function breakDisplayHTML(f) {
    const brk = [];
    if (f.breakStart && f.breakEnd)   brk.push(`${esc(f.breakStart)}~${esc(f.breakEnd)}`);
    if (f.breakStart2 && f.breakEnd2) brk.push(`${esc(f.breakStart2)}~${esc(f.breakEnd2)}`);
    return brk.length
      ? `${brk.join(' · ')} <span class="t-muted" style="font-size:11px;">(${f.breakMin || 0}분)</span>`
      : '<span class="t-muted">-</span>';
  }
  /* 근무조 색상 — 상세/추가 폼 맨 아래 별도 섹션(근태 산정과 무관한 cosmetic).
     withApply=true(근무조 상세)면 선택 색상이 저장값(savedColor)과 다를 때만 [적용] 버튼 노출. */
  function colorSectionHTML(f, withApply, savedColor) {
    const cur = f.color || 'gray';
    const changed = withApply && cur !== (savedColor || 'gray');
    const swatches = SHIFT_COLORS.map(c => {
      const sel = cur === c.key;
      return `<button type="button" data-shift-color="${c.key}" title="${esc(c.label)}" aria-label="${esc(c.label)}" style="width:24px;height:24px;padding:0;border-radius:50%;background:${c.hex};border:2px solid ${sel ? 'var(--color-brand-primary)' : 'transparent'};box-shadow:0 0 0 1px var(--color-border);cursor:pointer;"></button>`;
    }).join('');
    return `
      <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--color-divider);display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
        <span style="font-weight:var(--fw-semibold);font-size:var(--fs-sm);color:var(--color-text);flex:0 0 auto;">색상</span>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;flex:1;">${swatches}</div>
        ${changed ? '<button class="btn btn--primary btn--sm" type="button" data-shift-color-apply style="flex:0 0 auto;">적용</button>' : ''}
      </div>`;
  }
  function editorFormHTML(f, locked, depts) {
    const row2GT = 'grid-template-columns:110px 1fr 110px 1fr;';
    const row1GT = 'grid-template-columns:110px 1fr;';
    const REQ = '<span style="color:var(--color-danger);">*</span>';
    const hasB2 = !!(f.breakStart2 && f.breakEnd2);
    const deptsRow = depts
      ? `
        <div class="fm-tbl__row fm-tbl__row--1" style="${row1GT}">
          <div class="fm-tbl__label">사용 부서</div>
          <div class="fm-tbl__value">
            ${depts.length
              ? `<span style="line-height:1.6;word-break:keep-all;">${esc(depts.join(', '))}</span>`
              : '<span class="t-muted">없음</span>'}
          </div>
        </div>`
      : '';
    /* 잠금(수정 불가) 상세 — 근무조 명·출근·퇴근·휴게시간은 input 없이 값만 표시. 편집 가능 시 입력 컨트롤. */
    const labelCell = locked
      ? `<span style="font-weight:var(--fw-medium);color:var(--color-text);">${esc(f.label || '-')}</span>`
      : `<input class="input" type="text" id="shift-f-label" value="${esc(f.label)}" placeholder="예: 주간 표준조" style="width:100%;" />`;
    const startCell = locked ? `<span style="color:var(--color-text);">${esc(f.start || '-')}</span>` : timeSelectHTML('shift-f-start', f.start, locked);
    const endCell   = locked ? `<span style="color:var(--color-text);">${esc(f.end || '-')}</span>`   : timeSelectHTML('shift-f-end', f.end, locked);
    const breakBlock = locked
      ? `<span style="color:var(--color-text);">${breakDisplayHTML(f)}</span>`
      : `<div style="display:flex;flex-direction:column;align-items:stretch;gap:6px;width:100%;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="t-muted" style="width:36px;flex:0 0 auto;font-size:var(--fs-xs);">1회</span>
              ${breakTimeSelectHTML('shift-f-b1s', f.breakStart, locked)}
              <span class="t-muted">~</span>
              ${breakTimeSelectHTML('shift-f-b1e', f.breakEnd, locked)}
              ${hasB2 ? '' : `<button class="btn btn--sm" type="button" data-break-add style="margin-left:8px;">+ 휴게 추가</button>`}
            </div>
            ${hasB2 ? `
              <div style="display:flex;align-items:center;gap:6px;">
                <span class="t-muted" style="width:36px;flex:0 0 auto;font-size:var(--fs-xs);">2회</span>
                ${breakTimeSelectHTML('shift-f-b2s', f.breakStart2, locked)}
                <span class="t-muted">~</span>
                ${breakTimeSelectHTML('shift-f-b2e', f.breakEnd2, locked)}
                <button class="btn btn--sm btn--soft-danger" type="button" data-break-remove style="margin-left:8px;">삭제</button>
              </div>` : ''}
          </div>`;
    return `
      <div class="fm-tbl fm-tbl--compact fm-tbl--bordered fm-tbl--form">
        <div class="fm-tbl__row fm-tbl__row--2" style="${row2GT}">
          <div class="fm-tbl__label">근무조</div>
          <div class="fm-tbl__value" style="gap:8px;align-items:center;">
            <span data-shift-code style="display:inline-block;padding:5px 12px;background:var(--color-surface-alt);border:1px solid var(--color-divider);border-radius:var(--radius-sm);font-weight:var(--fw-bold);color:var(--color-brand-primary);letter-spacing:0.02em;">${esc(f.code || '-')}</span>
          </div>
          <div class="fm-tbl__label">근무조 명 ${REQ}</div>
          <div class="fm-tbl__value">${labelCell}</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--2" style="${row2GT}">
          <div class="fm-tbl__label">출근 ${REQ}</div>
          <div class="fm-tbl__value">${startCell}</div>
          <div class="fm-tbl__label">퇴근 ${REQ}</div>
          <div class="fm-tbl__value" style="gap:8px;align-items:center;">${endCell}</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" style="${row1GT}">
          <div class="fm-tbl__label">휴게시간</div>
          <div class="fm-tbl__value"${(!locked && hasB2) ? ' style="flex-direction:column;align-items:stretch;gap:6px;"' : ''}>${breakBlock}</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" style="${row1GT}">
          <div class="fm-tbl__label">근무시간 요약</div>
          <div class="fm-tbl__value">
            <div data-shift-summary style="display:flex;flex-wrap:wrap;align-items:center;gap:8px 18px;width:100%;"></div>
          </div>
        </div>
        ${deptsRow}
      </div>`;
  }

  /* ===== 근무조 추가 = 모달 ===== */
  function renderAddModal() {
    const modal = document.getElementById('modal-shift-editor');
    if (!modal) return;
    const body = modal.querySelector('#shift-editor-body');
    const foot = modal.querySelector('#shift-editor-footer');
    const titleEl = modal.querySelector('#shift-editor-title');
    if (!body || !foot) return;
    if (titleEl) titleEl.textContent = '근무조 추가';
    const errs = STATE.editErrors || {};
    body.innerHTML = editorFormHTML(STATE.form, false)
      + colorSectionHTML(STATE.form, false)
      + (errs.dup ? `<div class="field-error" style="margin:10px 0 0;">${esc(errs.dup)}</div>` : '');
    foot.innerHTML = `
      <span style="flex:1;"></span>
      <button class="btn" type="button" data-shift-cancel>취소</button>
      <button class="btn btn--primary" type="button" data-shift-save>추가</button>`;
    foot.style.display = 'flex';
    modal.querySelectorAll('[data-shift-cancel], [data-modal-close]').forEach(b => b.addEventListener('click', closeEditor));
    const saveBtn = modal.querySelector('[data-shift-save]');
    if (saveBtn) saveBtn.addEventListener('click', saveAdd);
    if (!modal.dataset.shiftBound) {
      modal.dataset.shiftBound = '1';
      modal.addEventListener('click', e => { if (e.target === modal) closeEditor(); });
    }
    bindEditorForm(modal, renderAddModal);
    updateDur(modal);
  }
  function openAddModal() { renderAddModal(); openModalEl('modal-shift-editor'); }

  /* ===== 근무조 수정 = 인-페이지 화면 (호출자가 제공한 host 컨테이너에 렌더 — 앱 레이아웃 유지) ===== */
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
  /* 잠금 안내 — 수정/삭제/미사용 불가 사유를 한 줄로 간결하게 + 신규 추가 액션. */
  function lockedNoticeHTML(fl) {
    const reason = fl.isDefault
      ? '기본 근무조는 수정·삭제·비활성화할 수 없습니다.'
      : (fl.pending
          ? '전자결재 승인 대기 중입니다.'
          : (!fl.active
              ? '비활성 상태입니다. 활성화 후 이용할 수 있습니다.'
              : (fl.inUse
                  ? '사용 중인 부서가 있어 수정·삭제할 수 없습니다.'
                  : '근무스케줄에 사용된 이력이 있어 수정·삭제할 수 없습니다.')));
    return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;padding:10px 14px;background:var(--color-surface-alt);border:1px solid var(--color-border);border-radius:var(--radius-sm);font-size:var(--fs-sm);color:var(--color-text-sub);">
      <span style="flex:1;">${esc(reason)}</span>
      <button class="btn btn--xs" type="button" data-shift-add-new style="flex:0 0 auto;">+ 신규 근무조 추가</button>
    </div>`;
  }
  /* 상태 뱃지(사용 부서 수 기준) + 비활성/사용 이력 마커(별도 축). */
  function statusBadgeHTML(fl) {
    if (fl.status === 'pending') return `<span class="pill pill--warning" style="white-space:nowrap;">승인대기</span>`;
    if (fl.status === 'inuse')   return `<span class="pill pill--success" style="white-space:nowrap;">사용 중</span>`;
    return `<span class="pill pill--muted" style="white-space:nowrap;">미사용</span>`;
  }
  /* 활성/비활성 · 사용 이력 마커 — 상태 뱃지와 별개. 비활성 우선(폐기), 그 외 사용 이력(현재 미배치) 표시. */
  function codeMarkersHTML(fl) {
    if (!fl.active) return `<span class="pill pill--slate" style="white-space:nowrap;" title="비활성 — 근무스케줄 배치 후보에서 제외됨(폐기)">비활성</span>`;
    if (fl.everUsed && !fl.inUse) return `<span class="pill pill--brown" style="white-space:nowrap;" title="근무스케줄에 사용된 이력이 있어 수정·삭제 불가">사용 이력</span>`;
    return '';
  }
  function renderEditView() {
    const host = _editHost, f = STATE.form;
    if (!host || !f) return;
    const src = STATE.shifts.find(s => s.code === (STATE.editingCode || f.code));
    const fl = codeFlags(f.code);
    const locked = !fl.canEdit;                            /* 수정 불가 → 읽기 전용(명칭·출퇴근·휴게 잠금) */
    /* 잠긴 코드는 읽기 전용 상세 — 좌측: 사용 이력. 우측: 활성화/비활성화 (닫기 없음 — 상단 '← 목록'으로 복귀).
       편집 가능 코드 — 좌측: 삭제 + 사용 이력. 우측: 취소/저장. */
    const footerActions = locked
      ? `<button class="btn btn--sm" type="button" data-shift-history>사용 이력</button>
         <span style="flex:1;"></span>
         ${fl.canDeactivate ? '<button class="btn btn--soft-danger btn--sm" type="button" data-shift-deact>비활성화</button>' : ''}
         ${fl.canActivate ? '<button class="btn btn--primary btn--sm" type="button" data-shift-react>활성화</button>' : ''}`
      : `${fl.canDelete ? '<button class="btn btn--danger btn--sm" type="button" data-shift-delete>삭제</button>' : ''}
         <button class="btn btn--sm" type="button" data-shift-history>사용 이력</button>
         <span style="flex:1;"></span>
         <button class="btn btn--sm" type="button" data-shift-back>취소</button>
         <button class="btn btn--primary btn--sm" type="button" data-shift-save-edit>저장</button>`;
    host.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
        <button class="btn btn--sm" type="button" data-shift-back>← 목록</button>
        <h3 style="font-size:var(--fs-lg);font-weight:var(--fw-semibold);color:var(--color-text);">근무조 ${locked ? '상세' : '수정'}</h3>
        ${statusBadgeHTML(fl)}
        ${codeMarkersHTML(fl)}
      </div>
      ${locked ? lockedNoticeHTML(fl) : ''}
      ${src && src.pending ? pendingNoticeHTML(src.pending) : ''}
      <div>${editorFormHTML(f, locked, usingDeptsOf(f.code))}</div>
      ${colorSectionHTML(f, true, src ? src.color : 'gray')}
      <div style="display:flex;align-items:center;gap:8px;margin-top:18px;padding-top:14px;border-top:1px solid var(--color-divider);">
        ${footerActions}
      </div>`;
    if (!host.dataset.shiftEditBound) {
      host.dataset.shiftEditBound = '1';
      host.addEventListener('click', e => {
        if (e.target.closest('[data-shift-add-new]')) { closeEdit(); openEditor(null); return; }
        if (e.target.closest('[data-shift-color-apply]')) { applyColorChange(); return; }
        if (e.target.closest('[data-shift-history]')) { openHistoryModal(STATE.editingCode); return; }
        if (e.target.closest('[data-shift-deact]')) { requestCodeChange('비활성', STATE.editingCode); return; }
        if (e.target.closest('[data-shift-react]')) { requestCodeChange('활성', STATE.editingCode); return; }
        if (e.target.closest('[data-shift-back]')) { closeEdit(); return; }
        if (e.target.closest('[data-shift-delete]')) { requestCodeChange('삭제', STATE.editingCode); return; }
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
  /* 색상만 적용 — 근무조 상세 화면 하단 [적용] 버튼. 근태 산정과 무관(cosmetic)해 사용/잠금과 무관하게 즉시 저장. */
  function applyColorChange() {
    const code = STATE.editingCode, f = STATE.form;
    if (!code || !f) return;
    const src = STATE.shifts.find(s => s.code === code);
    if (src) src.color = f.color;
    window.toast && window.toast(`근무조 ${code} 색상이 변경되었습니다.`, 'success');
    refreshAfterChange();
  }
  /* 저장 클릭 — 사용 중 근무조는 출/퇴근·휴게가 잠겨 명칭 등만 반영, 즉시 저장.
     (기준 변경은 신규 근무조 추가로만 가능 — 기존 코드 수정 금지 원칙) */
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
        `근무조 ${code}(${f.label}) ${scheduled ? '변경 예약됨' : '수정됨'} · ${fmtDateDot(meta.effDate)}부터 적용`,
        'success');
    } else {
      window.toast && window.toast(`근무조 ${code}(${f.label}) 저장됨`, 'success');
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
          <div class="modal__title" data-hist-title>사용 이력</div>
          <button class="modal__close" type="button" data-hist-close aria-label="닫기">✕</button>
        </div>
        <div class="modal__body" data-hist-body style="flex:1;min-height:0;overflow:auto;padding:16px 20px;"></div>
        <div class="modal__footer"><button class="btn btn--sm" type="button" data-hist-close>닫기</button></div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-hist-close]')) el.classList.remove('is-open'); });
  }
  /* 사용 이력 — 이 근무조의 근태 산정 사용 여부 + 사용 시작일 + 활성/비활성 변경 이력. (현재 사용 부서는 상세 화면 폼에 표시) */
  function openHistoryModal(code) {
    ensureHistoryModal();
    const el = document.getElementById('shift-history-modal');
    const s = STATE.shifts.find(x => x.code === code);
    if (!s) return;
    const everUsed = codeHasHistory(code);
    const log = (s.usageLog || []).slice().reverse();   /* 최신순 */
    el.querySelector('[data-hist-title]').textContent = `사용 이력 — ${code}${s.label ? ` (${s.label})` : ''}`;
    const usedText = everUsed
      ? '<span class="pill pill--slate">있음</span> <span class="t-muted" style="font-size:var(--fs-xs);">근태 산정에 사용됨</span>'
      : '<span class="pill pill--muted">없음</span>';
    const statusPill = (st) => st === '비활성'
      ? '<span class="pill pill--slate">비활성</span>'
      : '<span class="pill pill--success">활성</span>';
    const logHTML = log.length ? `
      <div class="shift-tbl-wrap" style="border:1px solid var(--color-divider);border-radius:var(--radius-sm);">
        <table class="shift-tbl" style="width:100%;">
          <thead><tr>
            <th style="width:96px;text-align:center;">일자</th>
            <th style="width:72px;text-align:center;">상태</th>
            <th>사유</th>
            <th style="width:70px;">처리자</th>
          </tr></thead>
          <tbody>
            ${log.map(h => `<tr>
              <td style="text-align:center;white-space:nowrap;">${esc(h.at)}</td>
              <td style="text-align:center;">${statusPill(h.status)}</td>
              <td style="white-space:normal;word-break:keep-all;">${esc(h.reason || '-')}</td>
              <td style="white-space:nowrap;">${esc(h.by || '-')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : `<div class="t-muted" style="font-size:var(--fs-sm);">상태 변경 이력이 없습니다.</div>`;
    el.querySelector('[data-hist-body]').innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;font-size:var(--fs-sm);">
        <span style="display:flex;gap:8px;align-items:center;"><span class="t-muted" style="width:84px;flex:0 0 auto;">사용 이력</span>${usedText}</span>
        <span style="display:flex;gap:8px;align-items:center;"><span class="t-muted" style="width:84px;flex:0 0 auto;">사용 시작일</span><strong>${esc(fmtDateDot(s.startedAt))}</strong></span>
      </div>
      <div style="font-weight:var(--fw-semibold);font-size:var(--fs-sm);margin-bottom:8px;">활성/비활성 변경 이력</div>
      ${logHTML}`;
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
    /* 색상 — 코드별 컬러칩 선택. 색상은 근태 산정과 무관(cosmetic)하므로 사용/잠금 여부와 무관하게 변경 가능.
       선택은 form(f)에만 반영하고 재렌더로 하이라이트. 상세 화면은 [적용] 버튼(applyColorChange)으로 확정 저장,
       추가 모달은 [추가] 저장 시 함께 반영. */
    root.querySelectorAll('[data-shift-color]').forEach(btn => {
      btn.addEventListener('click', () => {
        f.color = btn.dataset.shiftColor;
        rerender();
      });
    });
  }

  function validateBasics(f) {
    if (!f.label || !f.label.trim()) { window.toast && window.toast('근무조 명을 입력해 주세요.', 'warning'); return false; }
    if (!f.start || !f.end) { window.toast && window.toast('출근·퇴근 시간을 입력해 주세요.', 'warning'); return false; }
    return true;
  }

  /* 변경 이력 기록 — 삭제/미사용/재개 (전자결재 승인 결과). 대상코드·유형·사유·변경자·변경일시·승인자.
     (근무조 추가는 자유·미기록 — 전자결재 대상 아님) */
  function logCodeChange(code, label, type, reason, approver) {
    STATE.codeChangeLog.unshift({ at: nowStamp(), code: code, label: label || '', type: type, reason: reason || '', by: HR_NAME, approver: approver || APPROVER });
  }

  /* 두 근무조의 생성 기준(출·퇴근·휴게) 동일 여부 — 휴게시간도 급여 산정 기준이라 identity 에 포함.
     출·퇴근이 같아도 휴게가 다르면 별개 코드 / 셋 다 같으면 완전 동일 기준(중복). */
  function sameCriteria(a, b) {
    return a.start === b.start && a.end === b.end
      && (a.breakStart || '') === (b.breakStart || '') && (a.breakEnd || '') === (b.breakEnd || '')
      && (a.breakStart2 || '') === (b.breakStart2 || '') && (a.breakEnd2 || '') === (b.breakEnd2 || '');
  }

  /* 추가 저장 (모달) — 추가는 자유(전자결재·이력 대상 아님). 동일 기준 중복만 차단하고 즉시 등록. */
  function saveAdd() {
    const f = STATE.form;
    if (!validateBasics(f)) return;
    STATE.editErrors = STATE.editErrors || {};
    STATE.editErrors.dup = '';
    /* 동일 기준(출·퇴근·휴게 전부 일치) 중복 방지 — 기준이 다르면(휴게만 달라도) 신규 허용 */
    const dup = STATE.shifts.find(s => sameCriteria(s, f));
    if (dup) { STATE.editErrors.dup = `동일한 출·퇴근·휴게 기준의 근무조 ${dup.code}(${dup.label || dup.code})가 이미 있습니다. 기존 근무조를 사용하세요.`; renderAddModal(); return; }
    recompute(f);
    f.code = channelCode(f);   /* 최종 채번 확정 (WT+D/N+일련번호) */
    f.active = true;
    STATE.shifts.push(deepClone(f));
    STATE.shifts.sort((a, b) => String(a.code).localeCompare(String(b.code)));
    window.toast && window.toast(`근무조 ${f.code}(${f.label}) 추가됨`, 'success');
    closeEditor();
    refreshAfterChange();
  }

  /* ===== 삭제 / 비활성화 — 사유 입력 + 승인 요청 모달 → 승인대기 → 승인 시 반영 ===== */
  function caTypeWord(t) { return t === '비활성' ? '비활성화' : '삭제'; }
  /* 상신 접수 — 코드에 pendingChange 를 걸어 '승인대기' 로 표시. 실제 반영은 승인 시(approveCodeChange). */
  function submitCodeChange(type, code, reason) {
    const cur = STATE.shifts.find(x => x.code === code);
    if (!cur) return;
    cur.pendingChange = { type: type, reason: reason || '', approver: APPROVER, at: nowStamp() };
    closeEdit();
    refreshAfterChange();
    /* mock 결재 승인 — 승인권자 처리 전까지 '승인대기' 홀딩 후 반영 (실서비스는 결재 승인 콜백으로 대체) */
    setTimeout(() => approveCodeChange(code), 1600);
  }
  /* 결재 승인 — 대기 중이던 삭제/비활성화를 실제 반영 + 변경 이력(전자결재) + 활성/비활성 이력 기록. */
  function approveCodeChange(code) {
    const cur = STATE.shifts.find(x => x.code === code);
    if (!cur || !cur.pendingChange) return;
    const pc = cur.pendingChange;
    const label = cur.label || code;
    cur.pendingChange = null;
    if (pc.type === '삭제') {
      STATE.shifts = STATE.shifts.filter(x => x.code !== code);
    } else if (pc.type === '비활성') {
      cur.active = false;   /* 비활성화 완료 → 배치 후보 제외 */
      (cur.usageLog = cur.usageLog || []).push({ at: fmtDateDot(TODAY), status: '비활성', reason: pc.reason, by: HR_NAME, approver: pc.approver });
    }
    logCodeChange(code, label, pc.type, pc.reason, pc.approver);
    refreshAfterChange();
  }
  /* 활성화 — 비활성 코드를 다시 배치 가능 상태로. 즉시 반영 + 활성/비활성 이력 기록. */
  function activateCode(code) {
    ensureLoaded();
    code = code || STATE.editingCode; if (!code) return;
    const cur = STATE.shifts.find(x => x.code === code);
    if (!cur || cur.active !== false) return;
    cur.active = true;
    (cur.usageLog = cur.usageLog || []).push({ at: fmtDateDot(TODAY), status: '활성', reason: '활성화', by: HR_NAME, approver: '' });
    window.toast && window.toast(`근무조 ${code} 활성화됨 — 근무스케줄 배치에 사용할 수 있습니다.`, 'success');
    closeEdit();
    refreshAfterChange();
  }

  /* ----- 삭제/미사용 승인 요청 모달 (사유 입력 + 상신) ----- */
  function ensureCodeApprovalModal() {
    if (document.getElementById('shift-code-approval')) return;
    const el = document.createElement('div');
    el.className = 'modal-backdrop';
    el.id = 'shift-code-approval';
    el.style.zIndex = '1300';
    el.innerHTML = `
      <div class="modal" style="width:92vw;max-width:480px;">
        <div class="modal__header">
          <div class="modal__title" data-ca-title>근무조 승인 요청</div>
          <button class="modal__close" type="button" data-ca-close aria-label="닫기">✕</button>
        </div>
        <div class="modal__body" data-ca-body style="padding:18px 20px;"></div>
        <div class="modal__footer">
          <button class="btn btn--sm" type="button" data-ca-close>취소</button>
          <button class="btn btn--primary btn--sm" type="button" data-ca-ok>다음 (전자결재)</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => {
      if (e.target === el || e.target.closest('[data-ca-close]')) { closeCodeApprovalModal(); return; }
      if (e.target.closest('[data-ca-ok]')) { confirmCodeApproval(); return; }
    });
    el.addEventListener('input', e => {
      const r = e.target.closest('[data-ca-reason]');
      if (r && STATE.codeAct) { STATE.codeAct.reason = r.value; if (STATE.codeAct.error) { STATE.codeAct.error = ''; r.classList.remove('is-invalid'); } }
    });
  }
  function renderCodeApprovalBody() {
    const a = STATE.codeAct; if (!a) return;
    const el = document.getElementById('shift-code-approval');
    const word = caTypeWord(a.type);
    el.querySelector('[data-ca-title]').textContent = `근무조 ${word} 승인 요청`;
    const note = a.type === '삭제'
      ? '삭제 후에는 복구할 수 없습니다.'
      : '비활성화 시, 부서별 근무정책 설정에서 선택할 수 없습니다.';
    el.querySelector('[data-ca-body]').innerHTML = `
      <div style="margin-bottom:12px;font-size:var(--fs-sm);color:var(--color-text-sub);">
        대상 근무조 <strong style="color:var(--color-brand-primary);">${esc(a.code)}</strong>${a.label ? ` <span class="t-muted">(${esc(a.label)})</span>` : ''}
      </div>
      <div class="fm-tbl fm-tbl--form">
        <div class="fm-tbl__row fm-tbl__row--1" style="grid-template-columns:88px 1fr;">
          <div class="fm-tbl__label">${word === '삭제' ? '삭제' : '비활성화'} 사유 <span style="color:var(--color-danger);">*</span></div>
          <div class="fm-tbl__value" style="flex-direction:column;align-items:stretch;gap:4px;">
            <textarea class="input${a.error ? ' is-invalid' : ''}" data-ca-reason rows="2" placeholder="사유를 입력해 주세요" style="width:100%;height:60px;min-height:60px;resize:vertical;">${esc(a.reason || '')}</textarea>
            ${a.error ? `<span class="field-error">${esc(a.error)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="form-help" style="margin-top:10px;">${esc(note)}</div>`;
  }
  function openCodeApprovalModal(type, code) {
    ensureLoaded();
    code = code || STATE.editingCode; if (!code) return;
    const s = STATE.shifts.find(x => x.code === code);
    if (!s || s.pendingChange) return;   /* 이미 승인대기면 중복 상신 방지 */
    STATE.codeAct = { type: type, code: code, label: s.label || code, reason: '', error: '' };
    ensureCodeApprovalModal();
    renderCodeApprovalBody();
    const el = document.getElementById('shift-code-approval');
    el.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeCodeApprovalModal() {
    const el = document.getElementById('shift-code-approval');
    if (el) el.classList.remove('is-open');
    if (!document.querySelector('.modal-backdrop.is-open')) document.body.style.overflow = '';
  }
  /* 사유 입력 완료 → 시스템 전자결재 모달로 승인 요청(결재선 지정). 상신 시 승인대기. */
  function confirmCodeApproval() {
    const a = STATE.codeAct; if (!a) return;
    if (!a.reason || !a.reason.trim()) { a.error = `${a.type === '삭제' ? '삭제' : '비활성화'} 사유를 입력해 주세요.`; renderCodeApprovalBody(); return; }
    const reason = a.reason.trim(), type = a.type, code = a.code, label = a.label;
    STATE.codeAct = null;
    closeCodeApprovalModal();
    openApprovalSystemModal(type, code, label, reason);
  }
  function openApprovalSystemModal(type, code, label, reason) {
    const word = caTypeWord(type);
    const content = type === '삭제'
      ? `${code}(${label}) 근무조 삭제\n사유: ${reason}\n※ 삭제 후 복구할 수 없습니다.`
      : `${code}(${label}) 근무조 비활성화\n사유: ${reason}\n※ 비활성화 시, 부서별 근무정책 설정에서 선택 불가 (기존 배정·근태 데이터 유지 · 활성화로 되돌릴 수 있음).`;
    if (window.App && typeof App.openSystemApprovalModal === 'function') {
      App.openSystemApprovalModal({
        docName: `근무조 ${word}`,
        titlePrefix: `근무조 ${word}`,
        codeLabel: '근무조',
        nameLabel: '근무조 명',
        matCode: code,
        matName: label,
        customReasons: [reason, '기타'],
        defaultReason: reason,
        title: `근무조 ${word} 승인 요청 — ${code} (${label})`,
        content: content,
        payload: { kind: 'shift-code-change', changeType: type, code: code },
        onSubmit: () => submitCodeChange(type, code, reason),
      });
    } else {
      submitCodeChange(type, code, reason);   /* 결재 모듈 미연결 — 대기 후 자동 승인 */
    }
  }
  function requestCodeChange(type, code) {
    if (type === '활성') { activateCode(code); return; }
    openCodeApprovalModal(type, code);
  }

  /* 변경 반영 — 열려있는 에디터 모달 갱신 없음(에디터는 닫힌 뒤 호출) + 구독자(근무조 설정 등) 갱신 */
  function refreshAfterChange() {
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
   *  Public API — 근태 현황 / 편성 / 근로계약 화면에서 매핑 조회·편집용
   * ========================================================= */
  App.AttShifts = {
    list:    () => { ensureLoaded(); return STATE.shifts.slice(); },
    get:     (code) => { ensureLoaded(); return STATE.shifts.find(s => s.code === code) || null; },
    /* 근무조 명(라벨) — 없으면 코드로 대체. 배치/현황 등 타 화면 표기 공용. */
    labelOf: (code) => { const s = App.AttShifts.get(code); return s ? (s.label || code) : code; },
    /* 부서별로 사용 가능한 근무조 — 근로계약 작성 시 활용. 미지정(useDepts=[]) 근무조는 전부서 공통으로 노출. */
    forDept: (dept) => {
      ensureLoaded();
      return STATE.shifts.filter(s => s.active !== false && (!s.useDepts || !s.useDepts.length || s.useDepts.includes(dept)));
    },
    depts:   () => getDeptList(),
    /* 근무조가 직원에게 배정되어 사용 중인지 — 사용 중이면 수정·삭제 불가 */
    inUse:   (code) => shiftInUse(code),
    /* 부서 연결 여부(직원 배정 또는 부서 근무조 설정 연결) — 운영 중 수정 시 사유·적용일 필수 판정 */
    connected: (code) => shiftConnected(code),
    /* 근무조 수정 이력 — [{ at, by, effDate, reason, changes:[{field,label,from,to}] }] (최신순) */
    history: (code) => (STATE.shiftHistory[code] ? STATE.shiftHistory[code].slice() : []),
    /* 근무조 변경 이력(전자결재) — [{ at, code, label, type, reason, by, approver }] (최신순). 근무조 설정 메인 화면 노출용. */
    changeLog: () => { ensureLoaded(); return STATE.codeChangeLog.slice(); },
    /* 사용 상태 — 미사용 처리된 코드는 false. 편성 화면에서 선택 후보 제외용. */
    isActive: (code) => { const s = App.AttShifts.get(code); return !s || s.active !== false; },
    /* 현재 사용 중인 부서 목록 — '사용 부서' 표기 · 미사용/삭제/편집 제한 판정 공용. */
    usingDepts: (code) => usingDeptsOf(code),
    /* 근무조 상태/가능 액션 통합 판정 — 근무조 설정 그리드의 상태 뱃지·관리 버튼 단일 소스. */
    codeFlags: (code) => codeFlags(code),
    /* 근무조 색상 — 색상 key(gray/red/…)를 파스텔 hex 로. 그리드 컬러칩·스케줄 시각 구분 공용. */
    colorHex: (key) => colorHexOf(key),
    /* 사용 중인 부서 있음 — true 면 미사용 처리·삭제·편집 불가. */
    deptLocked: (code) => codeInUse(code),
    /* 사용 이력 있음 — true 면 삭제 불가(미사용만)·기준 잠금. */
    hasHistory: (code) => codeHasHistory(code),
    /* 그리드에서 삭제/미사용/재개 전자결재 요청 — 에디터 없이 코드 지정 호출. */
    requestChange: (type, code) => { requestCodeChange(type, code); },
    /* 근무조 마스터 편집 — '근무정책 설정 > 근무조 설정' 인라인에서 재사용. modal-shift-editor 열기. */
    openEditor: (code) => { ensureLoaded(); openEditor(code || null); },
    /* 수정 화면을 host 컨테이너 안에 인-페이지로 렌더 (앱 레이아웃 유지). opts.onBack: 목록 복귀 콜백. */
    editInto: (hostEl, code, opts) => { ensureLoaded(); renderEditInto(hostEl, code, opts); },
    /* 전사 기본 근무조 — 부서 신설 시 상위 조직이 없으면 상속하는 기본값. */
    globalDefault: () => { ensureLoaded(); const s = STATE.shifts.find(x => x.isGlobalDefault); return s ? s.code : ''; },
    /* 전사 기본 근무조 지정 — 정확히 1개만 유지 (기존 지정 해제 후 설정). */
    setGlobalDefault: (code) => {
      ensureLoaded();
      if (!STATE.shifts.some(s => s.code === code)) return;
      STATE.shifts.forEach(s => { s.isGlobalDefault = (s.code === code); });
      notifyShiftChange();
    },
    /* 근무조 마스터 변경(추가/수정/삭제) 시 호출될 콜백 등록 — 인라인 테이블 갱신용. */
    onChange: (cb) => { if (typeof cb === 'function') _changeCbs.push(cb); },
  };
  const _changeCbs = [];
  function notifyShiftChange() { _changeCbs.forEach(cb => { try { cb(); } catch (e) { /* noop */ } }); }
})();
