/* =========================================================
 * Page: 근태 > 근태/스케줄 > 근태 현황
 *
 *   레이아웃 (경영·홍보 스케줄 패턴 그대로 차용)
 *     · 좌측 — 미니 캘린더 + 신청 액션(연차/근태/초과근무) + 신청 현황 카드
 *     · 우측 — 헤더(권한자 시점 토글 + 임직원/부서 선택) + 캘린더 / 대시보드
 *
 *   조회 뷰 (우측)
 *     · 캘린더 (월별) — 출/퇴근, 지각/조퇴/연장/야간 마커 + 근태 신청한 날에 품의서 뱃지
 *     · 대시보드      — KPI + 최근 기록 (근무조 컬럼 포함)
 *
 *   신청 (좌측 액션)
 *     · 연차 신청      — HOL-B (연차) / HOL-C (반차)
 *     · 근태 신청      — ATT-{A~Z}, HOL-{A~Z} 코드 전체
 *     · 초과근무 신청  — 연장근무 / 휴일근무 (휴게 차감 정책 반영, 사유 마스터 별도)
 *   상신 시 App.openSystemApprovalModal 로 전자결재 모달이 띄워진다.
 *
 *   신청 현황 (좌측 카드)
 *     · 연차 신청 현황 / 초과근무 신청 현황 — 카드 클릭 시 모달로 승인 내역 확인.
 *
 *   ※ 근무조 매핑은 App.AttShifts.list() 단일 소스. 사원 ↔ 근무조 매칭은 mock seed.
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  /* ============ 환경 ============ */
  const TODAY    = '2026-05-28';
  const ME_NAME  = '정혜진';
  const ME_ID    = 'SW22030101';
  const ME_DEPT  = '인사팀';
  const ME_POS   = '대리';

  /* =========================================================
   *  승인된 근무조 변경 오버라이드 (전자결재 승인 결과의 단일 진실원)
   *    - 근무조 변경 신청이 전자결재에서 승인되면 approve() 로 기간 내 평일에 오버라이드가 기록된다.
   *    - 근무스케줄 현황(주간/월간)·근무스케줄 배치가 이 레이어를 기본편성 위에 얹어 표시한다.
   *    - 우선순위: 승인 오버라이드 > 매니저 편성 > 기본편성.
   * ========================================================= */
  App.AttShiftOverrides = App.AttShiftOverrides || (function () {
    const _map = {};       /* 'empId|YYYY-MM-DD' -> { code, from, reason, reqId, approvedAt } */
    const _subs = [];
    let _seeded = false;
    function pad2(n) { return String(n).padStart(2, '0'); }
    function key(empId, ds) { return empId + '|' + ds; }
    function emit() { _subs.slice().forEach(cb => { try { cb(); } catch (e) { /* noop */ } }); }
    function altCodeFor(emp) {
      const P = App.AttWorkPolicy;
      let codes = (emp && P && P.deptPolicy) ? (P.deptPolicy(emp.dept).codes || []) : [];
      if ((!codes || !codes.length) && App.AttShifts && App.AttShifts.list) codes = App.AttShifts.list().map(s => s.code);
      const cur = (emp && emp.shift) || (codes[0] || 'WTD01');
      const other = (codes || []).find(c => c !== cur);
      return other || (cur === 'WTD02' ? 'WTD03' : 'WTD02');
    }
    const API = {
      get(empId, ds) { return _map[key(empId, ds)] || null; },
      /* 근무조 변경 승인 반영 — 기간 내 평일 각각에 오버라이드 기록. req: {empId, fromShift, toShift, dateFrom, dateTo, reason, reqId, approvedAt} */
      approve(req) {
        if (!req || !req.empId || !req.toShift || !req.dateFrom || !req.dateTo) return;
        const [fy, fm, fd] = req.dateFrom.split('-').map(Number);
        const [ty, tm, td] = req.dateTo.split('-').map(Number);
        let cur = new Date(fy, fm - 1, fd); const end = new Date(ty, tm - 1, td);
        while (cur <= end) {
          const wd = cur.getDay();
          if (wd !== 0 && wd !== 6) {
            const ds = `${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}-${pad2(cur.getDate())}`;
            _map[key(req.empId, ds)] = { code: req.toShift, from: req.fromShift || '', reason: req.reason || '', reqId: req.reqId || '', approvedAt: req.approvedAt || '' };
          }
          cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
        }
        emit();
      },
      /* 승인 취소/반려 — 기간 오버라이드 제거(기본편성으로 복귀) */
      revoke(empId, dateFrom, dateTo) {
        if (dateFrom && dateTo) {
          const [fy, fm, fd] = dateFrom.split('-').map(Number); const [ty, tm, td] = dateTo.split('-').map(Number);
          let cur = new Date(fy, fm - 1, fd); const end = new Date(ty, tm - 1, td);
          while (cur <= end) { const ds = `${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}-${pad2(cur.getDate())}`; delete _map[key(empId, ds)]; cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1); }
        }
        emit();
      },
      onChange(cb) { if (typeof cb === 'function') _subs.push(cb); },
      /* 데모 시드 — 전자결재 승인 배선 전이라도 화면에서 승인 반영을 볼 수 있도록 결정적 승인 2건 주입. */
      ensureSeed() {
        if (_seeded) return;
        const list = (App.AttStatus && App.AttStatus.EMP_LIST) || [];
        if (!list.length) return;   /* 명단 준비 전 — 다음 호출에서 시드 */
        _seeded = true;
        const ym = TODAY.slice(0, 7);
        const e0 = list[0], e1 = list.find(e => e.id !== e0.id) || e0;
        API.approve({ empId: e0.id, fromShift: e0.shift, toShift: altCodeFor(e0), dateFrom: `${ym}-12`, dateTo: `${ym}-12`, reason: '개인 사정', reqId: `SC-${ym.replace('-', '')}-001`, approvedAt: `${ym}-08 10:20` });
        if (e1.id !== e0.id) API.approve({ empId: e1.id, fromShift: e1.shift, toShift: altCodeFor(e1), dateFrom: `${ym}-19`, dateTo: `${ym}-21`, reason: '교대 조정', reqId: `SC-${ym.replace('-', '')}-002`, approvedAt: `${ym}-15 09:05` });
      },
    };
    return API;
  })();
  const ME_SHIFT = 'WTD01';   /* 본인 근무조 — 인사팀 사용 가능 근무조(전부서 공통) 기준 결정값 */
  /* 본인 직군 — 인사팀 = 사무직. 사무직이 휴일근무하면 대체 휴가가 발생한다. */
  const ME_JOBCAT = 'office';
  /* 대체 휴가 — 사무직 본인이 휴일근무 1일당 1일씩 발생(mock). earned: 발생 누계 / used: 사용 누계.
   *   잔여 = earned - used. 잔여 > 0 이면 근태 신청의 「휴가」 대분류에 「대체 휴가」가 노출된다. */
  const COMP_LEAVE = { earned: ME_JOBCAT === 'office' ? 2 : 0, used: 0 };
  function compLeaveBalance() { return Math.max(0, COMP_LEAVE.earned - COMP_LEAVE.used); }
  /* 본인 연차 — 발생/사용 (mock, 연차 현황 화면과 동일 톤). 잔여 = 발생 − 사용 */
  const ME_LEAVE = { granted: 15, used: 3.5 };
  function leaveRemain() { return Number(Math.max(0, ME_LEAVE.granted - ME_LEAVE.used).toFixed(1)); }

  /* =========================================================
   *  근태 코드 마스터 — 사용자 정의 코드체계로 전면 재정의
   *
   *  ATT — 일반 근태
   *    A 출장 / B 교육 / C 조퇴 / D 외출 / E 근무시간변경 / Z 기타
   *  HOL — 휴가
   *    A 경조 / B 연차 / C 반차 / D 출산/휴가 / E 청원 / F 공가 / G 보건 / Z 기타
   *    ※ G(보건) — '건강검진' 사유는 제외.
   * ========================================================= */
  const ATT_GROUPS = [
    {
      code: 'A', label: '출장',  items: [
        { code: 'ATTA01', label: '(국내)행사참석' },
        { code: 'ATTA02', label: '(국내)시장조사' },
        { code: 'ATTA03', label: '(해외)행사참석' },
        { code: 'ATTA04', label: '(해외)시장조사' },
        { code: 'ATTA05', label: '대외미팅' },
        { code: 'ATTA06', label: '내부미팅' },
        { code: 'ATTA07', label: '국내구매' },
      ],
    },
    {
      code: 'B', label: '교육', items: [
        { code: 'ATTB01', label: '사내' },
        { code: 'ATTB02', label: '사외' },
      ],
    },
    {
      code: 'C', label: '조퇴', items: [
        { code: 'ATTC01', label: '병가(산재)' },
        { code: 'ATTC02', label: '병가(무급)' },
        { code: 'ATTC03', label: '개인사정' },
      ],
    },
    {
      code: 'D', label: '외출', items: [
        { code: 'ATTD01', label: '병가(산재)' },
        { code: 'ATTD02', label: '병가(무급)' },
        { code: 'ATTD03', label: '개인사정' },
      ],
    },
    {
      code: 'E', label: '근무시간변경', items: [
        { code: 'ATTE01', label: '대체근무' },
        { code: 'ATTE02', label: '임신단축근무' },
      ],
    },
    {
      code: 'Z', label: '기타', items: [
        { code: 'ATTZ01', label: '기타' },
      ],
    },
  ];

  const HOL_GROUPS = [
    {
      code: 'A', label: '경조', items: [
        { code: 'HOLA01', label: '본인 결혼' },
        { code: 'HOLA02', label: '자녀 결혼' },
        { code: 'HOLA03', label: '본인(배우자) 형제자매 결혼' },
        { code: 'HOLA04', label: '본인 사망' },
        { code: 'HOLA05', label: '배우자 사망' },
        { code: 'HOLA06', label: '자녀 사망' },
        { code: 'HOLA07', label: '본인(배우자) 부모 사망' },
        { code: 'HOLA08', label: '본인(배우자) 형제자매 사망' },
        { code: 'HOLA09', label: '본인(배우자) 외가/친가 조부모 사망' },
      ],
    },
    {
      code: 'B', label: '연차', items: [
        { code: 'HOLB01', label: '연차' },
      ],
    },
    {
      code: 'C', label: '반차', items: [
        { code: 'HOLC01', label: '오전' },
        { code: 'HOLC02', label: '오후' },
      ],
    },
    {
      code: 'D', label: '출산/휴가', items: [
        { code: 'HOLD01', label: '본인' },
        { code: 'HOLD02', label: '배우자' },
      ],
    },
    {
      code: 'E', label: '청원', items: [
        { code: 'HOLE01', label: '청원' },
      ],
    },
    {
      code: 'F', label: '공가', items: [
        { code: 'HOLF01', label: '예비군' },
        { code: 'HOLF02', label: '민방위' },
      ],
    },
    {
      code: 'G', label: '보건', items: [
        { code: 'HOLG01', label: '전염병' },
        { code: 'HOLG02', label: '병가(산재)' },
        { code: 'HOLG03', label: '병가(무급)' },
        /* HOLG04 건강검진 — 사용자 요청으로 제외 */
        { code: 'HOLG05', label: '가족돌봄휴가' },
      ],
    },
    {
      code: 'Z', label: '기타', items: [
        { code: 'HOLZ01', label: '기타' },
      ],
    },
  ];

  /* 대체 휴가 — 사무직 휴일근무로 발생. 잔여 > 0 일 때만 「휴가」 대분류에 동적으로 노출.
   *   (HOL_GROUPS 에 상시 포함하지 않고 _getGroups 에서 조건부로 합친다) */
  const COMP_LEAVE_GROUP = {
    code: 'S', label: '대체 휴가', items: [
      { code: 'HOLS01', label: '대체 휴가' },
    ],
  };

  /* code(예: ATTA05) → { groupLabel, itemLabel } */
  function findCode(code) {
    const ALL = [{ kind: 'ATT', groups: ATT_GROUPS }, { kind: 'HOL', groups: HOL_GROUPS.concat([COMP_LEAVE_GROUP]) }];
    for (const a of ALL) {
      for (const g of a.groups) {
        for (const it of g.items) {
          if (it.code === code) return { kind: a.kind, groupCode: g.code, groupLabel: g.label, itemCode: it.code, itemLabel: it.label };
        }
      }
    }
    return null;
  }
  function codeLabel(code) {
    const c = findCode(code);
    return c ? `${c.groupLabel} — ${c.itemLabel}` : code;
  }
  function codeShortLabel(code) {
    const c = findCode(code);
    return c ? c.itemLabel : code;
  }
  /* 대분류 라벨 — 신청 내역 '구분' 컬럼에서 사용(예: 연차/반차/경조/공가/보건 …) */
  function codeGroupLabel(code) {
    const c = findCode(code);
    return c ? c.groupLabel : '';
  }
  function isHalfDay(code) { return code === 'HOLC01' || code === 'HOLC02'; }
  function isLeaveCode(code) { return /^HOL/.test(code || ''); }

  /* 신청 일수 — 반차는 0.5일, 그 외는 기간(시작~종료, 양끝 포함) */
  function applyReqDays(d) {
    if (!d || !d.dateFrom || !d.dateTo) return 0;
    if (isHalfDay(d.code)) return 0.5;
    const ms = new Date(d.dateTo) - new Date(d.dateFrom);
    if (isNaN(ms)) return 0;
    return Math.max(1, Math.round(ms / 86400000) + 1);
  }

  /* 출산/휴가 휴가 코드 → 휴직 관리(App.HRLoa) 휴직 유형 매핑.
     해당 코드 신청이 상신되면 휴직 관리에도 이력이 함께 쌓인다. */
  const LOA_TYPE_BY_CODE = { HOLD01: 'maternity_self', HOLD02: 'maternity_spouse' };

  /* =========================================================
   *  초과근무 사유 마스터 (사용자 정의)
   *
   *    야근(잔업) — 입고지연 / 기계고장 / 작업량 과다 / 업무협의 / 긴급작업 / 공사감독 / 시설개선
   *    휴일근무   — 입고지연 / 기계고장 / 작업량 과다 / 업무협의 / 장비입고
   * ========================================================= */
  const OT_REASONS = {
    night: [
      '잔업 - 입고지연',
      '잔업 - 기계고장',
      '잔업 - 작업량 과다',
      '잔업 - 업무협의',
      '긴급작업',
      '공사감독',
      '시설개선',
    ],
    holiday: [
      '잔업 - 입고지연',
      '잔업 - 기계고장',
      '잔업 - 작업량 과다',
      '잔업 - 업무협의',
      '장비입고',
    ],
  };

  /* ============ 마스터 ============ */
  const VIEW_MODES = [
    { key: 'cal',  label: '캘린더' },
    { key: 'dash', label: '대시보드' },
  ];

  /* ============ 사원 명단 / 부서 — 임직원 관리(App.HRInfoMgmt)와 동기화 ============
   *   별도 mock 명단을 두지 않고 임직원 관리의 재직 직원을 그대로 사용한다.
   *   근무조(shift) 코드만 근태 모듈에서 결정적으로 부여. syncEmpList() 가 모듈 로드 및
   *   각 화면 진입 시 EMP_LIST/DEPTS 를 임직원 관리 기준으로 재구성한다(같은 배열 인스턴스 유지). */
  const EMP_LIST = [];
  const DEPTS = [];
  /* 근태 조직도 통일 — 구성원을 권한 관리 부서 트리(App.OrgTree) 의 팀/파트로 결정적 재배치.
     App.AttOrg.leafDepts() 가 있으면 그 목록을, 없으면 동일 구성의 폴백 목록을 사용(로드 순서 무관). */
  const ATT_DEPT_POOL_FALLBACK = ['임원실','감사팀','개발1팀','개발2팀','회계팀','인사총무팀','자산관리팀','홍보팀','CS파트','고객지원파트','영업파트','접수파트','디자인파트','MD팀','구매팀','VIP관리팀','영업팀','생산연구소','생산관리팀','출력팀','옵셋인쇄팀','재단포장파트','가공1팀','가공2팀','가공3팀','출고팀','IT연구소'];
  function attDeptPool() { const L = (window.App && App.AttOrg && App.AttOrg.leafDepts) ? App.AttOrg.leafDepts() : []; return (L && L.length) ? L : ATT_DEPT_POOL_FALLBACK; }
  /* 근무조 배정 풀 — 근무조 마스터(App.AttShifts) 코드와 일치해야 함. 주간 7 + 야간 1 라운드로빈. */
  const _SHIFT_POOL = ['WTD01','WTD02','WTD03','WTD04','WTD05','WTD06','WTD07','WTN01'];
  let _empSig = null;
  function syncEmpList() {
    const h = window.App && App.HRInfoMgmt;
    const rows = (h && typeof h.list === 'function') ? h.list() : [];
    const active = rows.filter(r => r && r.status !== 'retired');
    const sig = active.map(r => r.id).join('|');
    if (sig === _empSig && EMP_LIST.length) return false;   // 변경 없음
    _empSig = sig;
    EMP_LIST.length = 0;
    active.forEach((r, i) => EMP_LIST.push({
      id: r.id,
      name: r.name || ((r.fname || '') + (r.gname || '')),
      dept: (function () { const pool = attDeptPool(); return pool[i % pool.length]; })(),   /* 권한 관리 부서 트리 기준 재배치 */
      rank: r.rank || '',
      position: r.position || '',
      photoUrl: r.photoUrl || '',
      shift: _SHIFT_POOL[i % _SHIFT_POOL.length],
    }));
    /* 부서 목록 — 명단의 distinct 부서(등장 순서) */
    DEPTS.length = 0;
    const seen = new Set();
    EMP_LIST.forEach(e => { if (e.dept && !seen.has(e.dept)) { seen.add(e.dept); DEPTS.push(e.dept); } });
    if (typeof STATE !== 'undefined' && STATE) STATE.records = {};   // 명단 변경 → 통계 캐시 무효화
    return true;
  }
  const DOW_KO = ['일','월','화','수','목','금','토'];

  /* ============ Helper ============ */
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
  function parseYM(s) { const [y, m] = s.split('-').map(Number); return { y, m }; }
  function parseYMD(s) {
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(+m[1], +m[2]-1, +m[3]) : new Date();
  }
  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
  function isWeekend(d) { const wd = d.getDay(); return wd === 0 || wd === 6; }
  /* 날짜 + 요일 표기 — YY/MM/DD(요일). 대시보드 등에서 사용 */
  function fmtDateDow(dateStr) {
    const d = parseYMD(dateStr);
    return `${pad2(d.getFullYear() % 100)}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}(${DOW_KO[d.getDay()]})`;
  }
  /* ===== 표시 전용 날짜 포맷 (데이터/키에는 절대 사용하지 않음) =====
     ISO 'YYYY-MM-DD' → 'YY/MM/DD', 일시 'YYYY-MM-DD HH:MM' → 'YY/MM/DD   HH:MM'(공백 3칸) */
  function fmtDisp(s) {
    if (!s) return s;
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?/);
    if (!m) return s;
    const d = `${m[1].slice(2)}/${m[2]}/${m[3]}`;
    return m[4] ? `${d}   ${m[4]}` : d;
  }
  /* 표시 전용 — 'YYYY-MM' → 'YY/MM' */
  function fmtYM(s) {
    const m = String(s || '').match(/^(\d{4})-(\d{2})/);
    return m ? `${m[1].slice(2)}/${m[2]}` : s;
  }

  /* =========================================================
   *  Application Store — 신청 내역 (연차 / 근태 / 초과근무)
   *    각 신청은 1건의 결재 문서(품의서)로 처리. 캘린더의 신청일 → 품의서 모달.
   * ========================================================= */
  const APP_STATUSES = {
    pending:   { label: '승인대기',     tone: 'warning' },
    approved:  { label: '승인',         tone: 'success' },
    rejected:  { label: '반려',         tone: 'danger'  },
    withdrawn: { label: '회수',         tone: 'muted'   },   /* 승인 전 신청자 철회 */
    cancelReq: { label: '취소 결재중',  tone: 'info'    },   /* 승인 후 취소 신청(전자결재 진행) */
    canceled:  { label: '취소',         tone: 'muted'   },   /* 취소 결재 완료 */
  };

  let _appsSeq = 1;
  function _nextAppNo(prefix) {
    const y = String(new Date(TODAY).getFullYear()).slice(-2);
    return `${prefix}-${y}-${String(700 + _appsSeq++).padStart(4, '0')}`;
  }
  /* 전자결재 문서번호 — 신청 1건이 결재 문서 1건으로 상신될 때 부여되는 번호(예: DOC-2026-03).
     신청번호(no)와 별개의 결재문서 식별자. 신청 내역의 '결재문서' 컬럼에 표기하며 클릭 시 기안 상세를 연다. */
  let _docSeq = 0;
  function _nextDocNo() {
    const y = String(new Date(TODAY).getFullYear());
    return `DOC-${y}-${String(++_docSeq).padStart(2, '0')}`;
  }

  function _initApps() {
    const seed = [];
    /* 본인 — 연차 1건 승인, 반차 1건 결재대기 */
    seed.push({
      id: 'APP-0001',
      no: _nextAppNo('LEAVE'),
      empId: ME_ID, empName: ME_NAME, empDept: ME_DEPT,
      kind: 'leave',  /* leave | att | ot */
      code: 'HOLB01', codeLabel: codeLabel('HOLB01'),
      dateFrom: '2026-05-15', dateTo: '2026-05-15',
      reason: '개인 휴식',
      status: 'approved',
      submittedAt: '2026-05-10 09:30',
      decidedAt:   '2026-05-12 14:10',
      approvers: [
        { stage: 1, name: '이팀장', status: '결재', at: '2026-05-11 11:00' },
        { stage: 2, name: '박상무', status: '결재', at: '2026-05-12 14:10' },
      ],
      files: [{ name: '연차신청_증빙.pdf', size: 184320 }],
    });
    seed.push({
      id: 'APP-0002',
      no: _nextAppNo('LEAVE'),
      empId: ME_ID, empName: ME_NAME, empDept: ME_DEPT,
      kind: 'leave',
      code: 'HOLC01', codeLabel: codeLabel('HOLC01'),
      dateFrom: '2026-05-29', dateTo: '2026-05-29',
      reason: '오전 병원 진료',
      status: 'pending',
      submittedAt: '2026-05-26 17:45',
      decidedAt:   '',
      approvers: [
        { stage: 1, name: '이팀장', status: '대기', at: '' },
      ],
    });
    /* 본인 — 야근 1건 승인 */
    seed.push({
      id: 'APP-0003',
      no: _nextAppNo('OT-N'),
      empId: ME_ID, empName: ME_NAME, empDept: ME_DEPT,
      kind: 'ot', otKind: 'night',
      date: '2026-05-25', startTime: '18:00', endTime: '21:00',
      reasonCode: '잔업 - 업무협의',
      reason: '인사 평가 관련 마감 협의',
      status: 'approved',
      submittedAt: '2026-05-25 10:00',
      decidedAt:   '2026-05-25 12:20',
      approvers: [
        { stage: 1, name: '이팀장', status: '결재', at: '2026-05-25 11:00' },
        { stage: 2, name: '인사팀장', status: '결재', at: '2026-05-25 12:20' },
      ],
    });
    /* 본인 — 휴일근무 1건 결재대기 */
    seed.push({
      id: 'APP-0004',
      no: _nextAppNo('OT-H'),
      empId: ME_ID, empName: ME_NAME, empDept: ME_DEPT,
      kind: 'ot', otKind: 'holiday',
      date: '2026-05-30', startTime: '09:00', endTime: '13:00',
      reasonCode: '잔업 - 작업량 과다',
      reason: '월말 정산 작업',
      status: 'pending',
      submittedAt: '2026-05-27 18:00',
      decidedAt:   '',
      approvers: [
        { stage: 1, name: '이팀장', status: '대기', at: '' },
      ],
    });
    /* 본인 — 출장 1건 승인 (근태) */
    seed.push({
      id: 'APP-0005',
      no: _nextAppNo('ATT'),
      empId: ME_ID, empName: ME_NAME, empDept: ME_DEPT,
      kind: 'att',
      code: 'ATTA05', codeLabel: codeLabel('ATTA05'),
      dateFrom: '2026-05-20', dateTo: '2026-05-20',
      reason: '신규 거래처 미팅',
      status: 'approved',
      submittedAt: '2026-05-18 14:00',
      decidedAt:   '2026-05-19 09:20',
      approvers: [
        { stage: 1, name: '이팀장', status: '결재', at: '2026-05-19 09:20' },
      ],
      files: [{ name: '출장계획서.pdf', size: 262144 }, { name: '미팅_안건.docx', size: 45056 }],
    });
    /* 본인 — 연차 1건 반려 (상태 사유 표기 확인용) */
    seed.push({
      id: 'APP-0006',
      no: _nextAppNo('LEAVE'),
      empId: ME_ID, empName: ME_NAME, empDept: ME_DEPT,
      kind: 'leave',
      code: 'HOLB01', codeLabel: codeLabel('HOLB01'),
      dateFrom: '2026-05-22', dateTo: '2026-05-22',
      reason: '개인 사정',
      status: 'rejected',
      statusReason: '해당 주 마감 일정과 겹쳐 반려합니다. 일정 조정 후 재신청 바랍니다.',
      submittedAt: '2026-05-19 08:40',
      decidedAt:   '2026-05-19 15:10',
      approvers: [
        { stage: 1, name: '이팀장', status: '반려', at: '2026-05-19 15:10' },
      ],
    });
    /* 본인 — 근태(외근) 1건 반려 (상태 사유 표기 확인용) */
    seed.push({
      id: 'APP-0007',
      no: _nextAppNo('ATT'),
      empId: ME_ID, empName: ME_NAME, empDept: ME_DEPT,
      kind: 'att',
      code: 'ATTA05', codeLabel: codeLabel('ATTA05'),
      dateFrom: '2026-05-21', dateTo: '2026-05-21',
      reason: '거래처 방문',
      status: 'rejected',
      statusReason: '출장 신청서로 재상신 필요 (외근 코드 부적합).',
      submittedAt: '2026-05-20 10:20',
      decidedAt:   '2026-05-20 16:00',
      approvers: [
        { stage: 1, name: '이팀장', status: '반려', at: '2026-05-20 16:00' },
      ],
    });
    /* 본인 — 연차 1건 승인 (사용일 도래 전 → [취소] 가능 케이스, 나의 연차현황) */
    seed.push({
      id: 'APP-0008',
      no: _nextAppNo('LEAVE'),
      empId: ME_ID, empName: ME_NAME, empDept: ME_DEPT,
      kind: 'leave',
      code: 'HOLB01', codeLabel: codeLabel('HOLB01'),
      dateFrom: '2026-05-29', dateTo: '2026-05-29',
      reason: '연차 사용',
      status: 'approved',
      submittedAt: '2026-05-25 09:10',
      decidedAt:   '2026-05-26 10:30',
      approvers: [
        { stage: 1, name: '이팀장', status: '결재', at: '2026-05-25 14:00' },
        { stage: 2, name: '박상무', status: '결재', at: '2026-05-26 10:30' },
      ],
    });
    /* 본인 — 출장 1건 승인 (사용일 도래 전 → [취소] 가능 케이스, 나의 근태현황) */
    seed.push({
      id: 'APP-0009',
      no: _nextAppNo('ATT'),
      empId: ME_ID, empName: ME_NAME, empDept: ME_DEPT,
      kind: 'att',
      code: 'ATTA05', codeLabel: codeLabel('ATTA05'),
      dateFrom: '2026-05-29', dateTo: '2026-05-29',
      reason: '협력사 현장 방문',
      status: 'approved',
      submittedAt: '2026-05-25 11:20',
      decidedAt:   '2026-05-26 09:40',
      approvers: [
        { stage: 1, name: '이팀장', status: '결재', at: '2026-05-26 09:40' },
      ],
    });
    /* 각 신청에 결재문서 번호(docNo) 부여 — 상신 순서대로 DOC-YYYY-01, 02 … */
    seed.forEach(a => { if (!a.docNo) a.docNo = _nextDocNo(); });
    return seed;
  }

  /* ============ 직원별 신청 내역 (부서별 근태/연차현황 모달용 Mock) ============
     본인(ME) 외 임직원은 결정적(deterministic) 으로 생성해 STATE.apps 스토어에 1회 적재.
     적재 후에는 본인 신청과 동일 스토어에 있으므로 setAppStatus / openDocModal 가 그대로 동작한다. */
  function _genEmpApps(emp) {
    const tail = Number(String(emp.id).replace(/\D/g, '').slice(-2)) || 1;
    const base = emp.id;
    const pad = (n) => String(n).padStart(2, '0');
    /* 사용일자 도래 전(미래) 건을 포함해야 인사팀 상태 변경 데모가 가능 — TODAY=2026-05-28 기준 6~7월.
       상태 변경은 이미 결재된(승인·반려) 건만 대상이므로 미래 승인/반려 건을 둔다(승인↔반려 재변경 데모).
       미래 승인대기 건(APP-1)은 버튼이 노출되지 않아 '전자결재 흐름으로 처리' 정책을 함께 확인할 수 있다. */
    const futM = 6 + (tail % 2);            /* 6 또는 7월 */
    const futD1 = (tail % 18) + 1;
    const futD2 = futD1 + 3;
    const futD3 = futD1 + 6;
    const out = [
      {
        id: `APP-${base}-1`, no: _nextAppNo('LEAVE'),
        empId: emp.id, empName: emp.name, empDept: emp.dept,
        kind: 'leave', code: 'HOLB01', codeLabel: codeLabel('HOLB01'),
        dateFrom: `2026-${pad(futM)}-${pad(futD1)}`, dateTo: `2026-${pad(futM)}-${pad(futD1)}`,
        reason: '여름 휴가', status: 'pending',
        submittedAt: `2026-05-2${tail % 9} 09:1${tail % 9}`, decidedAt: '',
        approvers: [{ stage: 1, name: '이팀장', status: '대기', at: '' }],
      },
      /* 미래 승인 건 — 상태 수정 시 [반려]만 노출되는 케이스 */
      {
        id: `APP-${base}-6`, no: _nextAppNo('LEAVE'),
        empId: emp.id, empName: emp.name, empDept: emp.dept,
        kind: 'leave', code: 'HOLB01', codeLabel: codeLabel('HOLB01'),
        dateFrom: `2026-${pad(futM)}-${pad(futD2)}`, dateTo: `2026-${pad(futM)}-${pad(futD2)}`,
        reason: '연차 사용', status: 'approved',
        submittedAt: '2026-05-22 10:20', decidedAt: '2026-05-23 09:40',
        approvers: [{ stage: 1, name: '이팀장', status: '결재', at: '2026-05-23 09:40' }],
        statusHistory: [{ by: '이팀장 팀장', at: '2026-05-23 09:40', status: 'approved', reason: '연차 승인 처리.' }],
      },
      /* 미래 반려 건 — 상태 수정 시 [승인]만 노출되는 케이스 */
      {
        id: `APP-${base}-7`, no: _nextAppNo('LEAVE'),
        empId: emp.id, empName: emp.name, empDept: emp.dept,
        kind: 'leave', code: 'HOLB01', codeLabel: codeLabel('HOLB01'),
        dateFrom: `2026-${pad(futM)}-${pad(futD3)}`, dateTo: `2026-${pad(futM)}-${pad(futD3)}`,
        reason: '개인 사정', status: 'rejected',
        statusReason: '해당 주 팀 일정과 겹쳐 반려. 일정 조정 후 재신청 바랍니다.',
        submittedAt: '2026-05-22 14:10', decidedAt: '2026-05-24 11:00',
        approvers: [{ stage: 1, name: '이팀장', status: '반려', at: '2026-05-24 11:00' }],
        statusHistory: [{ by: '이팀장 팀장', at: '2026-05-24 11:00', status: 'rejected', reason: '해당 주 팀 일정과 겹쳐 반려. 일정 조정 후 재신청 바랍니다.' }],
      },
      {
        id: `APP-${base}-2`, no: _nextAppNo('LEAVE'),
        empId: emp.id, empName: emp.name, empDept: emp.dept,
        kind: 'leave', code: 'HOLC01', codeLabel: codeLabel('HOLC01'),
        dateFrom: '2026-05-18', dateTo: '2026-05-18',
        reason: '오후 반차 — 개인 용무', status: 'approved',
        submittedAt: '2026-05-14 13:20', decidedAt: '2026-05-15 09:30',
        approvers: [{ stage: 1, name: '이팀장', status: '결재', at: '2026-05-15 09:30' }],
      },
      {
        id: `APP-${base}-3`, no: _nextAppNo('LEAVE'),
        empId: emp.id, empName: emp.name, empDept: emp.dept,
        kind: 'leave', code: 'HOLB01', codeLabel: codeLabel('HOLB01'),
        dateFrom: '2026-05-08', dateTo: '2026-05-09',
        reason: '가족 행사', status: 'rejected',
        statusReason: '동일 기간 부서 인원 부족으로 반려.',
        submittedAt: '2026-05-04 11:00', decidedAt: '2026-05-06 10:00',
        approvers: [{ stage: 1, name: '이팀장', status: '반려', at: '2026-05-06 10:00' }],
      },
      {
        id: `APP-${base}-4`, no: _nextAppNo('OT-N'),
        empId: emp.id, empName: emp.name, empDept: emp.dept,
        kind: 'ot', otKind: 'night', date: '2026-05-12', startTime: '18:00', endTime: '20:30',
        reasonCode: '잔업 - 업무협의', reason: '프로젝트 마감 대응', status: 'approved',
        submittedAt: '2026-05-12 10:00', decidedAt: '2026-05-12 14:00',
        approvers: [{ stage: 1, name: '이팀장', status: '결재', at: '2026-05-12 14:00' }],
      },
      {
        id: `APP-${base}-5`, no: _nextAppNo('ATT'),
        empId: emp.id, empName: emp.name, empDept: emp.dept,
        kind: 'att', code: 'ATTA05', codeLabel: codeLabel('ATTA05'),
        dateFrom: '2026-05-16', dateTo: '2026-05-16',
        reason: '현장 점검', status: 'pending',
        submittedAt: '2026-05-15 17:00', decidedAt: '',
        approvers: [{ stage: 1, name: '이팀장', status: '대기', at: '' }],
      },
    ];
    out.forEach(a => { if (!a.docNo) a.docNo = _nextDocNo(); });
    return out;
  }
  /* 직원 신청내역 보장 — 미적재 시 생성하여 스토어에 합친다(본인 제외) */
  function _ensureEmpApps(empId) {
    if (empId === ME_ID) return;
    const store = getApps();
    if (store.some(a => a.empId === empId)) return;
    const emp = EMP_LIST.find(e => e.id === empId);
    if (emp) store.push(..._genEmpApps(emp));
  }
  /* 특정 직원의 전체 신청내역 (leave + att + ot) */
  function appsForEmp(empId) {
    _ensureEmpApps(empId);
    return getApps().filter(a => a.empId === empId);
  }
  /* 신청 상태 수정 — 인사팀 승인/반려. reason 은 상태 사유(반려 시 노출, 승인 시 감사용).
     처리 이력(statusHistory) 에 처리자·처리일시·처리결과·처리사유를 최신순으로 누적한다. */
  function setAppStatus(appId, status, reason) {
    const app = getApps().find(a => a.id === appId);
    if (!app) return null;
    const at = nowYMDHM();
    app.status = status;                          /* 'approved' | 'rejected' | 'pending' */
    app.statusReason = (reason || '').trim();
    app.decidedAt = at;
    if (!app.statusHistory) app.statusHistory = [];
    app.statusHistory.unshift({                   /* 최신 처리가 맨 위 */
      by: `${ME_NAME} ${ME_POS}`.trim(),          /* 처리자 — 인사팀 담당자 */
      at,                                          /* 처리일시 */
      status,                                      /* 처리결과 */
      reason: app.statusReason,                    /* 처리사유 */
    });
    return app;
  }
  /* ===== 신청 회수(승인 전) / 취소(승인 후, 전자결재) — 본인 신청만 ===== */
  function appStartDate(app) { return app && (app.dateFrom || app.date || ''); }
  /* 승인 전(대기) → 회수 가능. 단 해당일(신청 시작일) 직전까지만 — 시작일이 도래하면 회수 불가. */
  function canWithdraw(app) {
    if (!app || app.empId !== ME_ID || app.status !== 'pending') return false;
    const s = appStartDate(app);
    return !s || s > TODAY;
  }
  /* 승인 후 → 취소 신청 가능. 단 신청 시작일이 아직 도래하지 않은 건만(예: 5/5 연차는 5/4까지). */
  function canCancel(app) {
    if (!app || app.empId !== ME_ID || app.status !== 'approved') return false;
    const s = appStartDate(app);
    return !!s && s > TODAY;
  }
  /* 승인 전 신청 회수 — 즉시 철회 */
  function withdrawApp(appId, onDone) {
    const app = getApps().find(a => a.id === appId);
    if (!canWithdraw(app)) { window.toast && window.toast('회수할 수 없는 상태입니다.', 'warning'); return; }
    app.status = 'withdrawn';
    app.statusReason = '신청자 회수';
    app.decidedAt = nowYMDHM();
    window.toast && window.toast('신청을 회수했습니다.', 'success');
    if (typeof onDone === 'function') onDone();
  }
  /* 승인 후 취소 신청 — 시스템 전자결재 모달로 취소 요청 상신(상위 결재권자 승인 절차) */
  function requestCancelApp(appId, onDone) {
    const app = getApps().find(a => a.id === appId);
    if (!canCancel(app)) { window.toast && window.toast('취소할 수 없는 상태입니다. (시작일이 지났거나 승인 상태가 아님)', 'warning'); return; }
    const label = app.codeLabel || codeLabel(app.code) || '근태/휴가';
    const period = app.dateFrom
      ? (app.dateFrom === app.dateTo ? fmtDisp(app.dateFrom) : `${fmtDisp(app.dateFrom)} ~ ${fmtDisp(app.dateTo)}`)
      : (fmtDisp(app.date) || '');
    const finish = () => {
      app.status = 'cancelReq';
      app.statusReason = '취소 신청(결재 진행)';
      app.decidedAt = nowYMDHM();
      window.toast && window.toast('취소 신청이 상신되었습니다.', 'success');
      if (typeof onDone === 'function') onDone();
    };
    if (typeof App.openSystemApprovalModal === 'function') {
      App.openSystemApprovalModal({
        docName: '근태/휴가 취소 신청', titlePrefix: '취소',
        codeLabel: '코드', nameLabel: '구분',
        matCode: app.code, matName: label,
        customReasons: [`${label} 취소`], defaultReason: `${label} 취소`,
        title: `${label} 취소 신청 (${period})`,
        content: `${label} (${period}) 신청 건의 취소를 요청합니다.`,
        payload: { cancelAppId: app.id, code: app.code },
        onSubmit() { finish(); },
      });
    } else { finish(); }
  }

  /* 현재 사용자가 인사팀(상태 수정 권한자) 인지 */
  function isHR() { return ME_DEPT === '인사팀'; }
  function nowYMDHM() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  /* ============ STATE ============ */
  /* 본 페이지는 권한자 전용. 비권한자(본인 시점)는 「나의 근무현황(page-att-my-work)」 으로 분리됨. */
  const STATE = {
    view:       'cal',
    /* 조직도 선택 부서 id — 임직원 관리와 동일한 id 체계('C0'=전체, 'T1','P11'…) */
    selectedDeptId: 'C0',
    isAdmin:    true,
    ym:         TODAY.slice(0, 7),
    selectedDate: TODAY,
    targetEmp:  ME_ID,
    targetDept: '인사팀',
    records:    {},
    apps:       null,
    applyDraft: null,
    otDraft:    null,
    applyMenuOpen: false,
    lastRefreshAt: null,
    /* 통계(KPI) 패널 접힘 상태 — 퇴사 현황 화면과 동일한 접기/펼치기 UX */
    statOpen: true,
    /* 부서별 뷰 표시 모드 — 'month'(월간 집계, 기본) | 'week'(주간 일자별) */
    deptMode: 'month',
    /* 전사(C0) 뷰 표시 모드 — 'week'(주간) | 'month'(월간, 기본) | 'year'(연간) */
    companyMode: 'month',
    /* 주간 모드 — 현재 주의 월요일(YYYY-MM-DD). null 이면 조회 월/오늘 기준 자동 결정 */
    weekMonday: null,
    /* 직원별 근태 현황 모달 — 나의 근태현황 미러(근태 현황/신청 내역 탭 + 캘린더/대시보드 토글) */
    modalEmpId: null,
    modalTab:  'status',   /* 'status'(근태 현황) | 'apps'(신청 내역) */
    modalView: 'cal',      /* 'cal' | 'dash' */
    modalYm:   null,       /* 모달 전용 조회 월 — 과거도 독립 조회 (페이지 월과 분리) */
    modalDailySort: 'desc',/* 모달 일자별 기록 정렬 — 'desc'(최신순, 기본) | 'asc'(오래된순) */
    modalDailyFilter: null,/* 대시보드 KPI 클릭 필터 — null | 'late'(지각) | 'early'(조퇴). 같은 카드 재클릭 시 해제 */
  };
  /* 모듈 로드 시점 1차 동기화 — page-hr-info-mgmt.js 가 먼저 로드되어 App.HRInfoMgmt.list() 사용 가능 */
  syncEmpList();
  function nowHMS() {
    const d = new Date();
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  }
  function getApps() {
    if (!STATE.apps) STATE.apps = _initApps();
    return STATE.apps;
  }
  function myApps() {
    return getApps().filter(a => a.empId === ME_ID);
  }
  function appsByDate(empId, dateStr) {
    return getApps().filter(a => {
      if (a.empId !== empId) return false;
      if (a.kind === 'ot') return a.date === dateStr;
      return a.dateFrom <= dateStr && dateStr <= a.dateTo;
    });
  }

  /* ============ 일자별 근무조 해석 (주간 교대 반영) ============
     달력 주차(일요일 시작) 인덱스로 순환. 부서에 주간/야간 근무조가 모두
     있으면(생산본부 등) 주차마다 교대, 아니면 본인 기준 근무조 고정.
     같은 직원·같은 주차는 항상 같은 값(결정적). */
  function weekIndexOfDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    let idx = 0;
    for (let dd = 2; dd <= d; dd++) { if (new Date(y, m - 1, dd).getDay() === 0) idx++; }
    return idx;
  }
  /* 부서 전용 교대 조 — useDepts 에 해당 부서가 명시된 조만(전부서공통 A·G·H 제외).
     주간·야간 조가 모두 있으면 교대 부서로 보고 그 조들의 코드 배열을 반환, 아니면 null. */
  function deptRotation(dept) {
    const list = (App.AttShifts && App.AttShifts.list) ? App.AttShifts.list() : [];
    const dedicated = list.filter(s => s.useDepts && s.useDepts.length && s.useDepts.includes(dept));
    const hasDay   = dedicated.some(s => !s.isNight);
    const hasNight = dedicated.some(s => s.isNight);
    return (hasDay && hasNight) ? dedicated.map(s => s.code) : null;
  }
  function shiftCodeForDate(emp, dateStr) {
    const baseCode = (emp && emp.shift) || 'WTD01';
    if (!emp) return baseCode;
    const rot = deptRotation(emp.dept);
    if (!rot) return baseCode;                /* 비교대 부서 — 본인 기준 근무조 고정 */
    let base = rot.indexOf(baseCode);
    if (base < 0) base = 0;
    return rot[(base + weekIndexOfDate(dateStr)) % rot.length];   /* 주차마다 교대 */
  }
  /* 레코드/표시용 — empId 로 사원 해석 (ME 는 EMP_LIST 에 없으므로 보강) */
  function empForShift(empId) {
    return EMP_LIST.find(e => e.id === empId)
        || (empId === ME_ID ? { id: ME_ID, dept: ME_DEPT, shift: ME_SHIFT } : null);
  }
  /* 캘린더 셀용 근무조 칩 — 야간조는 보라 톤. 두 캘린더(근태현황/나의근태) 공용 */
  function shiftChipHTML(code) {
    if (!code || code === '-') return '';
    const shift = App.AttShifts && App.AttShifts.get(code);
    const night = !!(shift && shift.isNight);
    const tip = shift ? `${shift.start}~${shift.end}${night ? ' · 야간' : ''}` : '';
    return `<span class="att-cal__shift${night ? ' att-cal__shift--night' : ''}" title="${esc(tip)}">${esc(shift ? (shift.label || code) : code)}</span>`;
  }

  /* ============ Mock 근태 기록 생성 ============ */
  function genMonthRecords(empId, ym) {
    const { y, m } = parseYM(ym);
    const days = daysInMonth(y, m);
    const out = [];
    const seed = Number(String(empId).slice(-2)) || 1;
    for (let d = 1; d <= days; d++) {
      const date = new Date(y, m - 1, d);
      const dateStr = ymd(date);
      const wkn = isWeekend(date);
      const offset = (d + seed) % 30;
      let code = null;
      if (offset === 3)  code = 'HOLB01';
      if (offset === 11) code = 'HOLC01';
      if (offset === 17) code = 'ATTD03';
      if (offset === 23) code = 'HOLG02';
      const emp = empForShift(empId);
      let rec;
      if (wkn) {
        /* 일부 주말은 휴일근무(시간) 부여 — 통계의 '휴일 근무' 가 의미를 갖도록 */
        const holWork = (offset === 12) ? 6 : (offset === 27) ? 4 : 0;
        rec = { date: dateStr, kind: 'holiday', label: holWork ? '휴일근무' : '주말', holWork };
      } else if (code) {
        /* 평일 휴가/근태 — 예정 근무조는 그대로 유지(교대 표시용) */
        rec = { date: dateStr, kind: 'att', code, label: codeShortLabel(code), shift: shiftCodeForDate(emp, dateStr) };
        if (isHalfDay(code)) { rec.checkIn = '09:00'; rec.checkOut = '14:00'; }
      } else if (date > new Date(TODAY)) {
        rec = { date: dateStr, kind: 'future', shift: shiftCodeForDate(emp, dateStr) };
      } else {
        const dayCode = shiftCodeForDate(emp, dateStr);
        const shift = (App.AttShifts && App.AttShifts.get(dayCode)) || null;
        const startBase = shift ? shift.start : '09:00';
        const endBase   = shift ? shift.end   : '18:00';
        const isLate  = (offset === 7 || offset === 14);
        const isEarly = (offset === 21);
        /* 지각/조퇴 분(分) — 다양한 케이스가 보이도록 일자별로 변동 */
        const lateMin  = offset === 7 ? 18 : offset === 14 ? 35 : 0;
        const earlyMin = isEarly ? 90 : 0;
        let checkIn  = isLate ? addMin(startBase, lateMin) : startBase;
        let checkOut = isEarly ? addMin(endBase, -earlyMin) : endBase;
        /* 반차 사용 정황(신청서 미등록) — 오전 반차: 오후 출근 / 오후 반차: 오전 퇴근 */
        let halfSuspect = '';
        if (offset === 16)      { halfSuspect = 'am'; checkIn = '13:30'; }
        else if (offset === 9)  { halfSuspect = 'pm'; checkOut = '13:00'; }
        const extraHr  = (offset === 18) ? 2 : (offset === 25 ? 1 : 0);
        const nightHr  = (shift && shift.isNight) ? 4 : 0;
        /* 휴일근무 — 토/일이 아닌 평일 기록엔 0. 휴일근무 OT 는 'ot' 종류 레코드(otKind:holiday)로 별도 시드됨 */
        rec = {
          date: dateStr, kind: 'work',
          checkIn, checkOut,
          isLate, isEarly, lateMin, earlyMin,
          halfSuspect,
          ot: { extra: extraHr, night: nightHr, holiday: 0 },
          shift: dayCode,
          shiftChanged: (offset === 5),   /* 결정적 mock — 근무조 변경 발생일(비고 표기용) */
        };
      }
      out.push(rec);
    }
    return out;
  }
  function addMin(t, mins) {
    if (!/^\d{2}:\d{2}$/.test(t)) return t;
    const [h, m] = t.split(':').map(Number);
    let total = h * 60 + m + mins;
    if (total < 0) total += 24 * 60;
    if (total >= 24 * 60) total -= 24 * 60;
    return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
  }

  function getRecords(empId, ym) {
    const key = `${empId}|${ym}`;
    if (!STATE.records[key]) STATE.records[key] = genMonthRecords(empId, ym);
    return STATE.records[key];
  }

  /* ============ Stats — 한달치 합계 ============ */
  function monthStats(recs) {
    const s = { workDays: 0, lateCnt: 0, earlyCnt: 0, lateMin: 0, earlyMin: 0, otExtra: 0, otNight: 0, otNightExtra: 0, otHoliday: 0, holidayCnt: 0, absCnt: 0 };
    recs.forEach(r => {
      if (r.kind === 'work') {
        s.workDays += 1;
        if (r.isLate)  { s.lateCnt  += 1; s.lateMin  += r.lateMin  || 0; }
        if (r.isEarly) { s.earlyCnt += 1; s.earlyMin += r.earlyMin || 0; }
        s.otExtra      += (r.ot && r.ot.extra)      || 0;
        s.otNight      += (r.ot && r.ot.night)      || 0;
        s.otNightExtra += (r.ot && r.ot.nightExtra) || 0;
        s.otHoliday    += (r.ot && r.ot.holiday)    || 0;
      } else if (r.kind === 'att' && (r.code === 'HOLB01' || r.code === 'HOLG02' || r.code === 'HOLG03')) {
        s.absCnt += 1;
      } else if (r.kind === 'holiday') {
        s.holidayCnt += 1;
        s.otHoliday  += r.holWork || 0;
      }
    });
    return s;
  }

  /* =========================================================
   *  Shell (좌측 패널 + 우측 헤더 + 우측 본문)
   * ========================================================= */
  function renderShell(pageEl) {
    pageEl.innerHTML = `
      <div class="split" style="--split-left:240px;height:100%;">
        <aside class="split__left">
          <div class="split__head"><h3>조직도</h3></div>
          <div class="split__body" style="padding:0;display:flex;flex-direction:column;min-height:0;">
            <ul class="tree tree--selectable" data-att-tree style="flex:1;overflow:auto;padding:8px 10px;margin:0;"></ul>
          </div>
        </aside>
        <section class="split__right">
          <header class="att-page__head" data-att-head></header>
          <div class="att-page__body" data-att-body style="flex:1;min-height:0;overflow:auto;"></div>
        </section>
      </div>
    `;
  }

  /* 좌측 조직도 — 임직원 관리(App.HRInfoMgmt) 의 트리를 단일 소스로 재사용(구조 100% 동일).
     인원 수만 근태 모듈 EMP_LIST 기준으로 집계. selectedDeptId 'C0'=전체. */
  function HRI() { return window.App && (App.AttOrg || App.HRInfoMgmt); }
  function renderOrgTree() {
    const h = HRI();
    return (h && h.deptTreeHTML) ? h.deptTreeHTML(STATE.selectedDeptId, { emps: EMP_LIST }) : '';
  }
  function selectedEmps() {
    const h = HRI();
    return (h && h.empsInDept) ? h.empsInDept(EMP_LIST, STATE.selectedDeptId) : EMP_LIST.slice();
  }
  function selectedScopeName() {
    if (STATE.selectedDeptId === 'C0') return '성원애드피아 전체';
    const h = HRI();
    return (h && h.deptName && h.deptName(STATE.selectedDeptId)) || STATE.selectedDeptId;
  }


  /* ============ 페이지 헤더 ============ */
  function renderHead() {
    /* 스코프 칩(부서명·N명) 은 좌측 조직도 선택으로 대체 — 헤더에서 제거 */

    /* 마지막 갱신 시각 + 새로고침 */
    const refreshHTML = `
      <div class="att-tb__refresh" title="수동 새로고침으로 근태 통계를 갱신합니다">
        <span class="att-tb__refresh-stamp">
          ${STATE.lastRefreshAt ? `마지막 갱신 <strong>${esc(STATE.lastRefreshAt)}</strong>` : '갱신 전'}
        </span>
        <button class="btn btn--sm" type="button" data-att-refresh aria-label="새로고침">
          ${(window.Icons && window.Icons.refresh) || '↻'} 새로고침
        </button>
      </div>
    `;

    /* 뷰 모드 — 부서 선택 시 월간/주간, 전사(C0) 선택 시 주간/월간/연간 토글. 주간 모드면 좌측 콘트롤러는 주 단위로 동작. */
    const isDept = STATE.selectedDeptId && STATE.selectedDeptId !== 'C0';
    const isCompany = !isDept;
    const companyYear = isCompany && STATE.companyMode === 'year';
    const isWeek = (isDept && STATE.deptMode === 'week') || (isCompany && STATE.companyMode === 'week');
    let weekLabel = '';
    if (isWeek) {
      const mon = currentWeekMonday();
      const ds = weekDates(mon);
      if (ds.length) {
        const wk = weekOfMonthInfo(mon);
        weekLabel = `<div class="att-tb__weekrange">${esc(fmtYM(wk.ym))} ${wk.week}주차 · ${esc(fmtDisp(ds[0]))} ~ ${esc(fmtDisp(ds[ds.length - 1]))}</div>`;
      }
    }
    const segTab = (grp, key, label, active) => `<button type="button" class="tabs__tab ${active ? 'is-active' : ''}" data-att-${grp}-mode="${key}">${label}</button>`;
    const modeToggle = `
      <div style="flex:1;display:flex;justify-content:center;">
        <div class="tabs tabs--segmented" style="display:inline-flex;width:auto;">
          <div class="tabs__nav">
            ${isDept
              ? segTab('dept', 'month', '월간', STATE.deptMode === 'month') + segTab('dept', 'week', '주간', STATE.deptMode === 'week')
              : segTab('comp', 'week', '주간', STATE.companyMode === 'week') + segTab('comp', 'month', '월간', STATE.companyMode === 'month') + segTab('comp', 'year', '연간', STATE.companyMode === 'year')}
          </div>
        </div>
      </div>`;

    /* 기간 선택 — 연간이면 연도만, 그 외는 연/월 피커. 화살표는 모드에 따라 주/월/연 단위로 이동(핸들러 분기). */
    const periodCtrl = companyYear
      ? `<span class="att-tb__title" style="font-size:var(--fs-lg);font-weight:var(--fw-semibold);">${parseYM(STATE.ym).y}년</span>`
      : App.YmPicker.html({ name: 'ym', ym: STATE.ym, todayYm: TODAY.slice(0, 7) });
    const navAria = companyYear ? ['이전 해', '다음 해'] : isWeek ? ['이전 주', '다음 주'] : ['이전 달', '다음 달'];

    return `
      <div class="att-tb">
        <div class="att-tb__left">
          ${periodCtrl}
          <div class="att-tb__nav">
            <button type="button" data-att-ym-prev aria-label="${navAria[0]}">‹</button>
            <button type="button" data-att-today>오늘</button>
            <button type="button" data-att-ym-next aria-label="${navAria[1]}">›</button>
          </div>
          ${weekLabel}
        </div>
        ${modeToggle}
        <div class="att-tb__right">
          ${refreshHTML}
        </div>
      </div>
    `;
  }

  /* ============ 본문 ============ */
  function renderBody() {
    if (STATE.selectedDeptId && STATE.selectedDeptId !== 'C0') return renderDeptView();
    return renderAllView();
  }

  /* ----- 전체 (전직원) — 회사 전체 KPI + 부서별 요약 ----- */
  function renderAllView() {
    /* 전직원 통계 집계 — 전사 모드(주간/월간/연간) 기준. getRecords 캐시 사용. */
    const all = EMP_LIST.map(e => ({ emp: e, st: statsForCompanyScope(e.id) }));
    /* 회사 합산 */
    const total = all.reduce((acc, r) => {
      acc.workDays     += r.st.workDays;
      acc.lateCnt      += r.st.lateCnt;
      acc.earlyCnt     += r.st.earlyCnt;
      acc.otExtra      += r.st.otExtra;
      acc.otNight      += r.st.otNight;
      acc.otNightExtra += r.st.otNightExtra;
      acc.otHoliday    += r.st.otHoliday;
      acc.holidayCnt   += r.st.holidayCnt;
      acc.absCnt       += r.st.absCnt;
      return acc;
    }, { workDays: 0, lateCnt: 0, earlyCnt: 0, otExtra: 0, otNight: 0, otNightExtra: 0, otHoliday: 0, holidayCnt: 0, absCnt: 0 });

    /* 부서별 그룹핑 */
    const byDept = DEPTS.map(d => {
      const rows = all.filter(r => r.emp.dept === d);
      const dst = rows.reduce((acc, r) => {
        acc.workDays   += r.st.workDays;
        acc.lateCnt    += r.st.lateCnt;
        acc.lateMin    += r.st.lateMin;
        acc.earlyCnt   += r.st.earlyCnt;
        acc.earlyMin   += r.st.earlyMin;
        acc.otExtra    += r.st.otExtra;
        acc.otNight    += r.st.otNight;
        acc.otNightExtra += r.st.otNightExtra;
        acc.otHoliday  += r.st.otHoliday;
        acc.holidayCnt += r.st.holidayCnt;
        acc.absCnt     += r.st.absCnt;
        return acc;
      }, { workDays: 0, lateCnt: 0, lateMin: 0, earlyCnt: 0, earlyMin: 0, otExtra: 0, otNight: 0, otNightExtra: 0, otHoliday: 0, holidayCnt: 0, absCnt: 0 });
      return { dept: d, count: rows.length, st: dst };
    }).filter(d => d.count > 0);

    const dlIcon = (window.Icons && window.Icons.download) || '↓';
    const sumLabel = STATE.companyMode === 'week' ? '주 근태 집계 다운로드'
      : STATE.companyMode === 'year' ? '연 근태 집계 다운로드' : '월 근태 집계 다운로드';
    /* 연간은 근태 집계만, 주간/월간은 집계 + 직원별 상세내역 (부서별 시트 분할 엑셀) */
    const dlBtns = `
      <button class="btn btn--sm" type="button" data-att-comp-sum-dl title="부서별 시트로 ${esc(sumLabel)}">${dlIcon} ${sumLabel}</button>
      ${STATE.companyMode === 'year' ? '' : `<button class="btn btn--sm" type="button" data-att-comp-detail-dl title="부서별 시트로 직원별 근태 상세내역 다운로드">${dlIcon} 직원별 근태 상세내역 다운로드</button>`}`;

    return `
      ${renderStatPanel(total)}
      <div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden;">
      <div class="toolbar">
        <div class="toolbar__left"><span class="toolbar__count">총 <strong>${byDept.length}</strong>개 부서</span></div>
        <div class="toolbar__right" style="display:flex;gap:6px;">${dlBtns}</div>
      </div>
      <div class="grid-wrap">
        <div class="grid-scroll">
          <table class="prs-editor__table prs-editor__table--wide" style="width:100%;">
            <thead>
              <tr>
                <th style="width:160px;">부서</th>
                <th style="width:64px;text-align:right;">인원</th>
                <th style="width:64px;text-align:right;">지각</th>
                <th style="width:64px;text-align:right;">조퇴</th>
                <th style="width:64px;text-align:right;">결근</th>
                <th style="width:80px;text-align:right;">연장</th>
                <th style="width:80px;text-align:right;">야간</th>
                <th style="width:90px;text-align:right;">야간 연장</th>
                <th style="width:80px;text-align:right;">휴일</th>
              </tr>
            </thead>
            <tbody>
              ${byDept.map(d => `
                <tr>
                  <td><a href="#" data-att-dept-open="${esc(d.dept)}" style="color:var(--color-brand-primary);font-weight:var(--fw-medium);">${esc(d.dept)}</a></td>
                  <td style="text-align:right;">${d.count}</td>
                  <td style="text-align:right;">${d.st.lateCnt}회</td>
                  <td style="text-align:right;">${d.st.earlyCnt}회</td>
                  <td style="text-align:right;color:${d.st.absCnt > 0 ? 'var(--color-danger)' : 'var(--color-text-muted)'};">${d.st.absCnt}</td>
                  <td style="text-align:right;">${d.st.otExtra.toFixed(1)}h</td>
                  <td style="text-align:right;">${d.st.otNight.toFixed(1)}h</td>
                  <td style="text-align:right;">${(d.st.otNightExtra || 0).toFixed(1)}h</td>
                  <td style="text-align:right;">${d.st.otHoliday.toFixed(1)}h</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    `;
  }

  /* 임직원별 — 대상자 식별 정보는 상단 toolbar 칩으로 표시. 본문 띠지(att-emp-head) 제거. */
  function renderEmpView(empId) {
    const recs = getRecords(empId, STATE.ym);
    const stats = monthStats(recs);
    if (STATE.view === 'cal') return renderCalendar(empId, recs);
    return renderDashboard(empId, stats, recs);
  }

  /* =========================================================
   *  주간(부서별) 헬퍼 — 월요일 기준 주(월~일). 월 경계 없이 연속 이동.
   * ========================================================= */
  function mondayOf(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const wd = x.getDay();                       /* 0=일 … 6=토 */
    x.setDate(x.getDate() + (wd === 0 ? -6 : 1 - wd));
    return x;
  }
  /* 기본 주의 월요일 — 조회월에 오늘이 있으면 오늘 주, 아니면 그 달 1일이 속한 주 */
  function defaultWeekMonday() {
    if (TODAY.slice(0, 7) === STATE.ym) return ymd(mondayOf(parseYMD(TODAY)));
    const { y, m } = parseYM(STATE.ym);
    return ymd(mondayOf(new Date(y, m - 1, 1)));
  }
  /* 현재 주의 월요일 — STATE.weekMonday 있으면 그대로, 없으면 기본 주 */
  function currentWeekMonday() {
    return STATE.weekMonday || defaultWeekMonday();
  }
  /* 주간 이동 — delta(주). 월 경계와 무관하게 연속 이동하며, 조회월(STATE.ym)을 월요일 기준으로 동기화. */
  function shiftWeek(delta) {
    const base = parseYMD(currentWeekMonday());
    const nx = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 7 * delta);
    STATE.weekMonday = ymd(nx);
    STATE.ym = `${nx.getFullYear()}-${pad2(nx.getMonth() + 1)}`;
  }
  /* 연 이동 — 전사 연간 뷰 (월은 유지) */
  function shiftYear(delta) { const { y, m } = parseYM(STATE.ym); STATE.ym = `${y + delta}-${pad2(m)}`; }
  /* 주의 7일(월~일) 전체 날짜 문자열 배열 — 월 경계 클리핑 없음 */
  function weekDates(monday) {
    const base = parseYMD(monday);
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      out.push(ymd(d));
    }
    return out;
  }
  /* 주차 정보 — 그 주가 속한 달(목요일 기준, ISO)과 그 달에서 몇 주차인지(1~5) 반환.
     예: { ym:'2026-06', week:3 } → "26/06 3주차" */
  function weekOfMonthInfo(monday) {
    const base = parseYMD(monday);
    const thu = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 3);   /* 그 주의 목요일 */
    return { ym: `${thu.getFullYear()}-${pad2(thu.getMonth() + 1)}`, week: Math.floor((thu.getDate() - 1) / 7) + 1 };
  }
  /* 특정 직원의 '이번 주(월~일)' 일자별 기록만 모은 배열 — 월 경계를 넘으면 두 달치에서 취합 후 필터 */
  function weekRecordsOf(empId, dates) {
    const months = Array.from(new Set(dates.map(d => d.slice(0, 7))));
    const map = {};
    months.forEach(mm => getRecords(empId, mm).forEach(r => { map[r.date] = r; }));
    return dates.map(ds => map[ds]).filter(Boolean);
  }
  /* 비고 — 4종(연차/휴일/근무조 변경/결근)만 텍스트로 표기. 그 외는 빈 값. */
  function weekBigo(r) {
    if (!r) return '';
    if (r.kind === 'holiday') return '휴일';
    if (r.kind === 'att') {
      const code = r.code || '';
      if (code === 'HOLG02' || code === 'HOLG03') return '결근';
      if (/^HOL/.test(code)) return '연차';
      return '';
    }
    if (r.kind === 'work' && r.shiftChanged) return '근무조 변경';
    return '';
  }
  /* 하루치 근태 메트릭(주간 총합 계산용) */
  function dayMetricsW(r) {
    const m = { work: 0, late: 0, lateMin: 0, early: 0, earlyMin: 0, abs: 0, otExtra: 0, otNight: 0, otNightExtra: 0, otHoliday: 0 };
    if (r.kind === 'work') {
      m.work = 1;
      if (r.isLate)  { m.late = 1;  m.lateMin  = r.lateMin  || 0; }
      if (r.isEarly) { m.early = 1; m.earlyMin = r.earlyMin || 0; }
      m.otExtra = (r.ot && r.ot.extra) || 0;
      m.otNight = (r.ot && r.ot.night) || 0;
      m.otNightExtra = (r.ot && r.ot.nightExtra) || 0;
      m.otHoliday = (r.ot && r.ot.holiday) || 0;
    } else if (r.kind === 'att' && (r.code === 'HOLG02' || r.code === 'HOLG03')) {
      m.abs = 1;
    } else if (r.kind === 'holiday') {
      m.otHoliday = r.holWork || 0;
    }
    return m;
  }

  /* =========================================================
   *  CSV 다운로드 — 직원 일자별 기록 / 직원 신청내역 / 부서 월 집계
   *    공통 헬퍼 App.csvDownload(파일명, [[헤더…],[행…]], {context}) 사용.
   * ========================================================= */
  /* 일자별 근태 기록 헤더/행 — 직원 1명·부서 상세 다운로드 공용 */
  const DAILY_HEAD = ['날짜', '구분', '출근', '퇴근', '지각(분)', '조퇴(분)', '연장(h)', '야간(h)', '야간연장(h)', '휴일(h)', '비고'];
  /* 근태 기록 1건 → 상세내역 행. (월/주 상세 다운로드 공용) */
  function recToDailyRow(r) {
    let gubun = '', ci = '', co = '', late = '', early = '', ext = '', night = '', hol = '', bigo = '';
    if (r.kind === 'work') {
      gubun = '출근'; ci = r.checkIn || ''; co = r.checkOut || '';
      late = r.lateMin || 0; early = r.earlyMin || 0;
      ext = ((r.ot && r.ot.extra) || 0); night = ((r.ot && r.ot.night) || 0); hol = ((r.ot && r.ot.holiday) || 0);
    } else if (r.kind === 'att') {
      const code = r.code || ''; const isAbsent = code === 'HOLG02' || code === 'HOLG03';
      gubun = isAbsent ? '결근' : '휴가'; ci = r.checkIn || ''; co = r.checkOut || '';
      bigo = (codeLabel && codeLabel(code)) || r.label || '';
    } else if (r.kind === 'holiday') {
      gubun = '휴일'; hol = r.holWork || 0; bigo = r.label || '';
    } else if (r.kind === 'future') { gubun = '예정'; }
    return [r.date, gubun, ci, co, late, early, ext, night, '', hol, bigo];
  }
  function empDailyBody(empId, ym) {
    return getRecords(empId, ym).map(recToDailyRow);
  }
  /* 임의 일자 목록(주간 등)의 상세내역 행 — 월 경계를 넘는 주도 지원 */
  function empDailyBodyDates(empId, dates) {
    const months = Array.from(new Set(dates.map(d => d.slice(0, 7))));
    const map = {};
    months.forEach(mm => getRecords(empId, mm).forEach(r => { map[r.date] = r; }));
    return dates.map(ds => recToDailyRow(map[ds] || { date: ds, kind: 'future' }));
  }
  /* 직원 1명의 일자별 근태 기록(대시보드 탭과 동일 구성) 1개 파일 */
  function dlEmpDaily(empId, ym) {
    ym = ym || STATE.ym;
    const emp = EMP_LIST.find(e => e.id === empId);
    const fn = `근태상세내역_${(emp && emp.dept) || ''}_${(emp && emp.name) || empId}_${ym.replace('-', '')}.csv`;
    App.csvDownload(fn, [DAILY_HEAD].concat(empDailyBody(empId, ym)), { context: '근태 상세내역' });
  }
  /* 선택 부서 소속 직원들의 일자별 근태 상세내역 — 직원별 섹션(시트 구분)으로 1개 파일 */
  function dlDeptDetail() {
    const dept = selectedScopeName();
    const emps = selectedEmps();
    const ym = STATE.ym;
    if (!emps.length) { window.toast && window.toast('대상 인원이 없습니다.', 'warning'); return; }
    const rows = [];
    emps.forEach((e, idx) => {
      if (idx > 0) { rows.push([]); rows.push([]); }   /* 직원 간 구분(빈 줄) */
      const shift = App.AttShifts && App.AttShifts.get(e.shift);
      rows.push([`■ ${e.name} (${e.id}) · ${e.dept}${shift ? ' · ' + (shift.label || shift.code) : ''} · ${ym.replace('-', '.')}`]);
      rows.push(DAILY_HEAD);
      empDailyBody(e.id, ym).forEach(r => rows.push(r));
    });
    const fn = `직원별근태상세내역_${dept}_${ym.replace('-', '')}.csv`;
    App.csvDownload(fn, rows, { context: '직원별 근태 상세내역' });
  }
  /* 직원 1명의 근태 신청내역(att+ot). approvedOnly=true 시 '승인'건만 */
  function dlEmpApps(empId, approvedOnly) {
    const emp = EMP_LIST.find(e => e.id === empId);
    let list = appsForEmp(empId).filter(a => a.kind === 'att' || a.kind === 'ot');
    if (approvedOnly) list = list.filter(a => a.status === 'approved');
    list.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
    if (!list.length) { window.toast && window.toast('다운로드할 신청 내역이 없습니다.', 'warning'); return; }
    const head = ['신청번호', '구분', '종류', '신청 일자/시간', '사유', '상태', '상태 사유', '상신 일시'];
    const body = list.map(a => {
      const isOt = a.kind === 'ot';
      const gubun = isOt ? '초과근무' : '근태';
      const typeMain = isOt ? (a.otKind === 'holiday' ? '휴일근무' : '연장근무') : (a.codeLabel || codeLabel(a.code));
      const typeSub = isOt ? (a.reasonCode || '') : '';
      const type = typeSub ? `${typeMain} / ${typeSub}` : typeMain;
      const dateCol = isOt ? `${a.date} ${a.startTime || ''}~${a.endTime || ''}`
        : (a.dateFrom === a.dateTo ? a.dateFrom : `${a.dateFrom} ~ ${a.dateTo}`);
      const stat = (APP_STATUSES[a.status] || {}).label || a.status;
      const statReason = a.status === 'rejected' ? (a.statusReason || '') : '';
      return [a.no, gubun, type, dateCol, a.reason || '', stat, statReason, a.submittedAt || ''];
    });
    const tag = approvedOnly ? '_승인' : '';
    const fn = `근태신청내역${tag}_${(emp && emp.dept) || ''}_${(emp && emp.name) || empId}.csv`;
    App.csvDownload(fn, [head].concat(body), { context: '근태 신청내역' });
  }
  /* 선택 부서 소속 직원들의 월 근태 요약(집계) 1개 파일 */
  function dlDeptMonth() {
    const dept = selectedScopeName();
    const emps = selectedEmps();
    const ym = STATE.ym;
    if (!emps.length) { window.toast && window.toast('집계할 인원이 없습니다.', 'warning'); return; }
    const head = ['사번', '성명', '부서', '근무조', '근무일', '지각(회)', '지각(분)', '조퇴(회)', '조퇴(분)', '결근(일)', '연장(h)', '야간(h)', '야간연장(h)', '휴일(h)'];
    const body = emps.map(e => {
      const st = monthStats(getRecords(e.id, ym));
      const shift = App.AttShifts && App.AttShifts.get(e.shift);
      return [e.id, e.name, e.dept, shift ? (shift.label || shift.code) : '', st.workDays, st.lateCnt, st.lateMin,
        st.earlyCnt, st.earlyMin, st.absCnt, st.otExtra.toFixed(1), st.otNight.toFixed(1),
        (st.otNightExtra || 0).toFixed(1), st.otHoliday.toFixed(1)];
    });
    const fn = `근태월집계_${dept}_${ym.replace('-', '')}.csv`;
    App.csvDownload(fn, [head].concat(body), { context: '근태 월 집계' });
  }
  /* 선택 부서 소속 직원들의 '현재 주' 일자별 기록 — 직원별 일자 행 + 직원별 총합 (스크린샷 양식) */
  function dlDeptWeek() {
    const dept = selectedScopeName();
    const emps = selectedEmps();
    const dates = weekDates(currentWeekMonday());
    if (!emps.length || !dates.length) { window.toast && window.toast('집계할 데이터가 없습니다.', 'warning'); return; }
    const months = Array.from(new Set(dates.map(d => d.slice(0, 7))));
    const head = ['사번', '부서', '직급', '이름', '근무일자', '근무조', '출근', '퇴근', '지각(분)', '조퇴(분)', '결근', '연장(h)', '야간(h)', '야간연장(h)', '휴일(h)', '비고'];
    const body = [];
    emps.forEach(e => {
      const recMap = {};
      months.forEach(mm => getRecords(e.id, mm).forEach(r => { recMap[r.date] = r; }));
      const tot = { lateMin: 0, earlyMin: 0, abs: 0, otExtra: 0, otNight: 0, otNightExtra: 0, otHoliday: 0 };
      dates.forEach(ds => {
        const r = recMap[ds] || { date: ds, kind: 'future' };
        const m = dayMetricsW(r);
        tot.lateMin += m.lateMin; tot.earlyMin += m.earlyMin; tot.abs += m.abs;
        tot.otExtra += m.otExtra; tot.otNight += m.otNight; tot.otNightExtra += m.otNightExtra; tot.otHoliday += m.otHoliday;
        const dd = parseYMD(ds);
        const dateTxt = `${dd.getFullYear()}/${pad2(dd.getMonth() + 1)}/${pad2(dd.getDate())}(${DOW_KO[dd.getDay()]})`;
        const code = r.kind === 'holiday' ? '휴일' : (r.shift || '');
        const isDuty = r.kind === 'work' || r.kind === 'att';
        body.push([
          e.id, e.dept, e.rank || '', e.name, dateTxt, code,
          isDuty && r.checkIn ? r.checkIn : '', isDuty && r.checkOut ? r.checkOut : '',
          m.lateMin || '', m.earlyMin || '', m.abs > 0 ? 1 : '',
          m.otExtra ? m.otExtra.toFixed(1) : '', m.otNight ? m.otNight.toFixed(1) : '',
          m.otNightExtra ? m.otNightExtra.toFixed(1) : '', m.otHoliday ? m.otHoliday.toFixed(1) : '',
          weekBigo(r),
        ]);
      });
      body.push([
        '', '', '', '', '총합', '', '', '',
        tot.lateMin, tot.earlyMin, tot.abs,
        tot.otExtra.toFixed(1), tot.otNight.toFixed(1), tot.otNightExtra.toFixed(1), tot.otHoliday.toFixed(1), '',
      ]);
    });
    const mon = currentWeekMonday();
    const fn = `근태주간집계_${dept}_${mon.replace(/-/g, '')}.csv`;
    App.csvDownload(fn, [head].concat(body), { context: '근태 주간 집계' });
  }

  /* =========================================================
   *  전사(C0) 근태 집계/상세 다운로드 — 주간/월간/연간 · 부서별 시트 분할 (엑셀)
   * ========================================================= */
  /* 날짜 → 'YY년/MM월/DD일' */
  function fmtKDate(d) { return `${pad2(d.getFullYear() % 100)}년/${pad2(d.getMonth() + 1)}월/${pad2(d.getDate())}일`; }
  /* 전사 뷰 현재 기간 라벨(제목 접두) — 주간: 기간범위 / 월간: YY년/MM월 / 연간: YYYY년 */
  function companyPeriodLabel() {
    if (STATE.companyMode === 'week') {
      const ds = weekDates(currentWeekMonday());
      return `${fmtKDate(parseYMD(ds[0]))} ~ ${fmtKDate(parseYMD(ds[ds.length - 1]))}`;
    }
    if (STATE.companyMode === 'year') return `${parseYM(STATE.ym).y}년`;
    const { y, m } = parseYM(STATE.ym);
    return `${pad2(y % 100)}년/${pad2(m)}월`;
  }
  /* 파일명 태그 — 주간: 월요일 YYYYMMDD / 월간: YYYYMM / 연간: YYYY */
  function companyPeriodTag() {
    if (STATE.companyMode === 'week') return currentWeekMonday().replace(/-/g, '');
    if (STATE.companyMode === 'year') return String(parseYM(STATE.ym).y);
    return STATE.ym.replace('-', '');
  }
  /* 전사 기간 기준 직원 통계(주간/월간/연간) */
  function recordsForWeek(empId) {
    const dates = new Set(weekDates(currentWeekMonday()));
    const months = Array.from(new Set(Array.from(dates).map(d => d.slice(0, 7))));
    const out = [];
    months.forEach(mm => getRecords(empId, mm).forEach(r => { if (dates.has(r.date)) out.push(r); }));
    return out;
  }
  function recordsForYear(empId) {
    const y = parseYM(STATE.ym).y;
    const out = [];
    for (let m = 1; m <= 12; m++) getRecords(empId, `${y}-${pad2(m)}`).forEach(r => out.push(r));
    return out;
  }
  function statsForCompanyScope(empId) {
    if (STATE.companyMode === 'week') return monthStats(recordsForWeek(empId));
    if (STATE.companyMode === 'year') return monthStats(recordsForYear(empId));
    return monthStats(getRecords(empId, STATE.ym));
  }
  /* 부서별 그룹핑(등장 순서) — 전사 다운로드 시트 분할 기준 */
  function empsGroupedByDept() {
    return DEPTS.map(d => ({ dept: d, emps: EMP_LIST.filter(e => e.dept === d) })).filter(g => g.emps.length);
  }
  /* [근태 집계 다운로드] — 부서별 시트, 각 시트 상단 제목 + 직원별 집계 표 */
  function dlCompanySummary() {
    const groups = empsGroupedByDept();
    if (!groups.length) { window.toast && window.toast('집계할 인원이 없습니다.', 'warning'); return; }
    const title = `${companyPeriodLabel()} 근태 집계`;
    const HEAD = ['사번', '성명', '근무조', '근무일', '지각(회)', '지각(분)', '조퇴(회)', '조퇴(분)', '결근(일)', '연장(h)', '야간(h)', '야간연장(h)', '휴일(h)'];
    const sheets = groups.map(g => {
      const rows = [
        { style: 'title', cells: [title] },
        { style: 'hdr', cells: HEAD },
      ];
      g.emps.forEach(e => {
        const st = statsForCompanyScope(e.id);
        const shift = App.AttShifts && App.AttShifts.get(e.shift);
        rows.push([e.id, e.name, shift ? (shift.label || shift.code) : '', st.workDays,
          st.lateCnt, st.lateMin, st.earlyCnt, st.earlyMin, st.absCnt,
          Number(st.otExtra.toFixed(1)), Number(st.otNight.toFixed(1)),
          Number((st.otNightExtra || 0).toFixed(1)), Number(st.otHoliday.toFixed(1))]);
      });
      return { name: g.dept, rows };
    });
    const kind = STATE.companyMode === 'week' ? '주' : STATE.companyMode === 'year' ? '연' : '월';
    App.xlsxDownload(`근태집계_전사_${companyPeriodTag()}.xls`, sheets, { context: `${kind} 근태 집계` });
  }
  /* [직원별 근태 상세내역 다운로드] — 부서별 시트, 각 시트에 소속 직원 전원의 일자별 상세(직원별 제목 블록) */
  function dlCompanyDetail() {
    const groups = empsGroupedByDept();
    if (!groups.length) { window.toast && window.toast('대상 인원이 없습니다.', 'warning'); return; }
    const base = companyPeriodLabel();
    const dates = STATE.companyMode === 'week' ? weekDates(currentWeekMonday()) : null;
    const sheets = groups.map(g => {
      const rows = [];
      g.emps.forEach((e, idx) => {
        if (idx > 0) rows.push([]);   /* 직원 간 빈 줄 */
        rows.push({ style: 'title', cells: [`${base} ${e.name} 근태 상세내역`] });
        rows.push({ style: 'hdr', cells: DAILY_HEAD });
        const body = dates ? empDailyBodyDates(e.id, dates) : empDailyBody(e.id, STATE.ym);
        body.forEach(r => rows.push(r));
      });
      return { name: g.dept, rows };
    });
    const kind = STATE.companyMode === 'week' ? '주간' : '월간';
    App.xlsxDownload(`직원별근태상세내역_전사_${companyPeriodTag()}.xls`, sheets, { context: `직원별 근태 상세내역(${kind})` });
  }

  function renderDeptView() {
    const dept = selectedScopeName();
    const emps = selectedEmps();
    if (!emps.length) {
      return `
        <div class="att-dept-head">
          <strong style="font-size:var(--fs-lg);">${esc(dept)}</strong>
          <span class="t-muted" style="margin-left:8px;">0명</span>
        </div>
        <div class="att-empty">${esc(dept)} 에 등록된 인원이 없습니다.</div>
      `;
    }
    if (STATE.deptMode === 'week') return renderDeptWeek(emps);
    const rows = emps.map(e => {
      const recs = getRecords(e.id, STATE.ym);
      const st = monthStats(recs);
      const shift = App.AttShifts && App.AttShifts.get(e.shift);
      return { emp: e, shift, st };
    });
    const deptSt = rows.reduce((acc, r) => {
      acc.workDays     += r.st.workDays;
      acc.lateCnt      += r.st.lateCnt;
      acc.earlyCnt     += r.st.earlyCnt;
      acc.otExtra      += r.st.otExtra;
      acc.otNight      += r.st.otNight;
      acc.otNightExtra += r.st.otNightExtra;
      acc.otHoliday    += r.st.otHoliday;
      acc.holidayCnt   += r.st.holidayCnt;
      acc.absCnt       += r.st.absCnt;
      return acc;
    }, { workDays: 0, lateCnt: 0, earlyCnt: 0, otExtra: 0, otNight: 0, otNightExtra: 0, otHoliday: 0, holidayCnt: 0, absCnt: 0 });

    return `
      ${renderStatPanel(deptSt)}
      ${renderDeptList(rows)}
    `;
  }
  function renderDeptList(rows, opts) {
    const dlIcon = (window.Icons && window.Icons.download) || '↓';
    const isWeek = opts && opts.scope === 'week';
    const countLabel = isWeek ? `총 <strong>${rows.length}</strong>명 · 주간` : `총 <strong>${rows.length}</strong>명`;
    const toolbarBtns = isWeek
      ? `<button class="btn btn--sm" type="button" data-att-dept-week-dl title="현재 주의 부서원 일자별 근태 기록을 1개 파일로 다운로드">${dlIcon} 주간 집계 다운로드</button>`
      : `<button class="btn btn--sm" type="button" data-att-dept-month-dl title="부서 소속 직원들의 ${esc(fmtYM(STATE.ym))} 근태 요약을 1개 파일로 다운로드">${dlIcon} 월 근태 집계 다운로드</button>
         <button class="btn btn--sm" type="button" data-att-dept-detail-dl title="부서 소속 직원별 ${esc(fmtYM(STATE.ym))} 근태 상세내역을 직원별 섹션으로 1개 파일에 다운로드">${dlIcon} 직원별 근태 상세내역 다운로드</button>`;
    return `
      <div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden;">
        <div class="toolbar">
          <div class="toolbar__left"><span class="toolbar__count">${countLabel}</span></div>
          <div class="toolbar__right" style="display:flex;gap:6px;">
            ${toolbarBtns}
          </div>
        </div>
        <div class="grid-wrap">
          <div class="grid-scroll">
            <table class="prs-editor__table prs-editor__table--wide" style="width:100%;">
              <thead>
                <tr>
                  <th style="width:100px;">사번</th>
                  <th style="width:90px;">성명</th>
                  <th style="width:110px;">근무조</th>
                  <th style="text-align:right;width:64px;">근무일</th>
                  <th style="text-align:right;width:100px;">지각</th>
                  <th style="text-align:right;width:100px;">조퇴</th>
                  <th style="text-align:right;width:56px;">결근</th>
                  <th style="text-align:right;width:70px;">연장</th>
                  <th style="text-align:right;width:70px;">야간</th>
                  <th style="text-align:right;width:80px;">야간 연장</th>
                  <th style="text-align:right;width:70px;">휴일</th>
                  <th style="text-align:center;width:220px;">다운로드</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(r => `
                  <tr>
                    <td>${esc(r.emp.id)}</td>
                    <td><div style="display:flex;align-items:center;gap:8px;min-width:0;"><span class="ssw-tbl__ava" style="width:24px;height:24px;flex:0 0 auto;">${esc((r.emp.name || '').slice(0, 1))}</span><a href="#" data-att-emp-open="${esc(r.emp.id)}" style="color:var(--color-brand-primary);font-weight:var(--fw-medium);white-space:nowrap;">${esc(r.emp.name)}</a>${(() => { const p = [r.emp.dept, r.emp.rank, r.emp.position].filter(Boolean); return p.length ? `<span style="display:inline-flex;align-items:center;">${p.map(v => `<span style="color:var(--color-text-muted);font-size:var(--fs-xs);white-space:nowrap;">${esc(v)}</span>`).join(`<span style="color:var(--color-text-muted);font-size:var(--fs-xs);">·</span>`)}</span>` : ''; })()}</div></td>
                    <td>${r.shift ? `<span class="pill pill--info">${esc(r.shift.label || r.shift.code)}</span>` : '-'}</td>
                    <td style="text-align:right;">${r.st.workDays}</td>
                    <td style="text-align:right;white-space:nowrap;">${r.st.lateCnt > 0 ? `<a href="#" data-att-le="late" data-att-le-emp="${esc(r.emp.id)}" title="지각 기록 보기" style="color:var(--color-warning);font-weight:var(--fw-medium);">${r.st.lateCnt}회 (${r.st.lateMin}분)</a>` : '<span style="color:var(--color-text-muted);">0회</span>'}</td>
                    <td style="text-align:right;white-space:nowrap;">${r.st.earlyCnt > 0 ? `<a href="#" data-att-le="early" data-att-le-emp="${esc(r.emp.id)}" title="조퇴 기록 보기" style="color:var(--color-warning);font-weight:var(--fw-medium);">${r.st.earlyCnt}회 (${r.st.earlyMin}분)</a>` : '<span style="color:var(--color-text-muted);">0회</span>'}</td>
                    <td style="text-align:right;color:${r.st.absCnt > 0 ? 'var(--color-danger)' : 'var(--color-text-muted)'};">${r.st.absCnt}</td>
                    <td style="text-align:right;">${r.st.otExtra.toFixed(1)}h</td>
                    <td style="text-align:right;">${r.st.otNight.toFixed(1)}h</td>
                    <td style="text-align:right;">${(r.st.otNightExtra || 0).toFixed(1)}h</td>
                    <td style="text-align:right;">${r.st.otHoliday.toFixed(1)}h</td>
                    <td style="text-align:center;white-space:nowrap;">
                      <button class="btn btn--xs" type="button" data-att-emp-daily-dl="${esc(r.emp.id)}" title="${esc(r.emp.name)} 근태 상세내역 다운로드">${dlIcon} 근태 상세내역</button>
                      <button class="btn btn--xs" type="button" data-att-emp-apps-dl="${esc(r.emp.id)}" title="${esc(r.emp.name)} 근태 신청내역(승인건) 다운로드">${dlIcon} 신청내역</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  /* ----- 주간(부서별) — 월간뷰와 동일한 레이아웃(근태 통계 + 직원별 요약)을 '이번 주(월~일)' 범위로 집계 ----- */
  function renderDeptWeek(emps) {
    const monday = currentWeekMonday();
    const dates = weekDates(monday);
    const wk = weekOfMonthInfo(monday);   /* { ym, week } — 그 주가 속한 달·주차 */
    const rangeTxt = `${fmtDisp(dates[0])} ~ ${fmtDisp(dates[dates.length - 1])}`;   /* YY/MM/DD ~ YY/MM/DD */

    /* 직원별 주간 스코프 통계 — 월간뷰와 동일한 monthStats() 를 이번 주 기록에만 적용 */
    const rows = emps.map(e => {
      const recs = weekRecordsOf(e.id, dates);
      const st = monthStats(recs);
      const shift = App.AttShifts && App.AttShifts.get(e.shift);
      return { emp: e, shift, st };
    });
    const deptSt = rows.reduce((acc, r) => {
      acc.workDays     += r.st.workDays;
      acc.lateCnt      += r.st.lateCnt;
      acc.earlyCnt     += r.st.earlyCnt;
      acc.otExtra      += r.st.otExtra;
      acc.otNight      += r.st.otNight;
      acc.otNightExtra += r.st.otNightExtra;
      acc.otHoliday    += r.st.otHoliday;
      acc.holidayCnt   += r.st.holidayCnt;
      acc.absCnt       += r.st.absCnt;
      return acc;
    }, { workDays: 0, lateCnt: 0, earlyCnt: 0, otExtra: 0, otNight: 0, otNightExtra: 0, otHoliday: 0, holidayCnt: 0, absCnt: 0 });

    /* 주차·기간 배너 — 통계/테이블이 이번 주(N주차, YY/MM/DD~YY/MM/DD) 집계임을 명시 */
    const banner = `
      <div class="att-dept-head" style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
        <span class="pill pill--info">${esc(fmtYM(wk.ym))} ${wk.week}주차</span>
        <strong style="font-size:var(--fs-md);">${esc(rangeTxt)}</strong>
        <span class="t-muted" style="font-size:var(--fs-xs);">이번 주 근태 집계</span>
      </div>`;

    return `
      ${banner}
      ${renderStatPanel(deptSt)}
      ${renderDeptList(rows, { scope: 'week' })}
    `;
  }

  /* ----- 캘린더 ----- */
  /* ===== 캘린더 셀 블록(bar) 공용 헬퍼 — 나의 근태현황/부서별 근태현황/부서별 연차현황 통일 =====
     세 캘린더가 동일한 색상 블록 체계(.att-cal__block--*)와 휴가 라벨("휴가: 사유")을 쓰도록 공용화. */
  const CAL_MISMATCH_MIN = 30;
  function _calToMin(t) { if (!/^\d{2}:\d{2}$/.test(t || '')) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; }
  function calShiftColorCls(code) {
    const list = (App.AttShifts && App.AttShifts.list) ? App.AttShifts.list() : [];
    const i = list.findIndex(s => s.code === code);
    return i >= 0 ? `shift-chip--c${i % 10}` : 'shift-chip--day';
  }
  function calShiftChip(code) {
    if (!code || code === '-') return '';
    const s = (App.AttShifts && App.AttShifts.get) ? App.AttShifts.get(code) : null;
    const label = s ? (s.label || code) : code;
    const tip = s ? `${s.start}~${s.end}${s.isNight ? ' · 야간' : ''}` : '';
    return `<span class="att-cal__shiftc ${calShiftColorCls(code)}" title="${esc(tip)}">${esc(label)}</span>`;
  }
  function calBlock(colorCls, text, title) {
    const t = title ? ` title="${esc(title)}"` : '';
    return `<div class="att-cal__block ${colorCls}"${t}><span class="att-cal__block-txt">${text}</span></div>`;
  }
  /* 휴가/근태 사유 라벨 — "휴가: {사유}" 형식. 반차는 '휴가: 오전 반차'. */
  function calLeaveLabel(r) {
    if (!r) return '';
    if (isHalfDay(r.code)) return `휴가: ${esc(r.label || '')} 반차`;
    return `휴가: ${esc(r.label || codeShortLabel(r.code) || '')}`;
  }
  /* 근무조 불일치 — 등록 근무조 시작시간과 실제 출근이 30분 이상 차이 */
  function calShiftMismatch(r) {
    if (!r || r.kind !== 'work' || !r.shift || !r.checkIn) return null;
    const s = (App.AttShifts && App.AttShifts.get) ? App.AttShifts.get(r.shift) : null;
    if (!s) return null;
    const sc = _calToMin(s.start), ac = _calToMin(r.checkIn);
    if (sc == null || ac == null) return null;
    const diff = ac - sc;
    if (Math.abs(diff) < CAL_MISMATCH_MIN) return null;
    return { code: r.shift, sched: s.start, actual: r.checkIn, diff };
  }

  function renderCalendar(empId, recs, ymArg) {
    const { y, m } = parseYM(ymArg || STATE.ym);
    const days = daysInMonth(y, m);
    const first = new Date(y, m - 1, 1);
    const leadBlanks = first.getDay();
    const cells = [];
    for (let i = 0; i < leadBlanks; i++) cells.push(`<div class="att-cal__cell att-cal__cell--blank"></div>`);
    recs.forEach(r => { cells.push(renderCalCell(empId, r)); });
    const total = leadBlanks + days;
    const trail = (7 - (total % 7)) % 7;
    for (let i = 0; i < trail; i++) cells.push(`<div class="att-cal__cell att-cal__cell--blank"></div>`);

    return `
      <div class="att-cal">
        <div class="att-cal__weekdays">
          ${DOW_KO.map((w, i) => `<div class="att-cal__wd ${i === 0 ? 'is-sun' : ''} ${i === 6 ? 'is-sat' : ''}">${w}</div>`).join('')}
        </div>
        <div class="att-cal__grid">
          ${cells.join('')}
        </div>
        <div class="att-cal__legend">
          <span><span class="att-cal__block shift-chip--c0 att-cal__sw"></span>출퇴근</span>
          <span><span class="att-cal__block att-cal__block--warn att-cal__sw"></span>경고</span>
          <span><span class="att-cal__block att-cal__block--late att-cal__sw"></span>지각</span>
          <span><span class="att-cal__block att-cal__block--early att-cal__sw"></span>조퇴</span>
          <span><span class="att-cal__block att-cal__block--ot att-cal__sw"></span>연장</span>
          <span><span class="att-cal__block att-cal__block--night att-cal__sw"></span>야간</span>
          <span><span class="att-cal__block att-cal__block--leave att-cal__sw"></span>휴가</span>
          <span><span class="att-cal__doc-mark">📄</span>품의서</span>
        </div>
      </div>
    `;
  }
  function renderCalCell(empId, r) {
    const d = Number(r.date.split('-')[2]);
    const wd = new Date(r.date).getDay();
    const wdCls = wd === 0 ? 'is-sun' : wd === 6 ? 'is-sat' : '';
    const today = r.date === TODAY ? 'is-today' : '';

    /* 신청 품의서 표시 (본인 데이터만) */
    const docs = empId === ME_ID ? appsByDate(ME_ID, r.date) : [];
    const docMark = docs.length ? `
      <button type="button" class="att-cal__doc"
              data-att-doc-open="${esc(docs[0].id)}"
              title="${esc(docs[0].codeLabel || (docs[0].otKind === 'night' ? '연장근무 신청서' : '휴일근무 신청서'))} (${esc(APP_STATUSES[docs[0].status].label)})">
        📄${docs.length > 1 ? `<span class="att-cal__doc-more">+${docs.length - 1}</span>` : ''}
      </button>
    ` : '';

    const chip = calShiftChip(r.shift);

    if (r.kind === 'holiday') {
      return `<div class="att-cal__cell att-cal__cell--off ${wdCls} ${today}">
        <div class="att-cal__day-row"><span class="att-cal__day">${d}</span><span class="att-cal__day-tail">${docMark}</span></div>
        <div class="att-cal__label t-muted">주말</div>
      </div>`;
    }
    if (r.kind === 'att') {
      const bl = [ calBlock('att-cal__block--leave', calLeaveLabel(r), calLeaveLabel(r)) ];
      if (r.checkIn) bl.push(calBlock(calShiftColorCls(r.shift), `출근 ${esc(r.checkIn)} 퇴근 ${esc(r.checkOut)}`, `출근 ${r.checkIn} · 퇴근 ${r.checkOut}`));
      return `<div class="att-cal__cell ${wdCls} ${today}">
        <div class="att-cal__day-row"><span class="att-cal__day">${d}</span><span class="att-cal__day-tail">${chip}${docMark}</span></div>
        <div class="att-cal__blocks">${bl.join('')}</div>
      </div>`;
    }
    if (r.kind === 'future') {
      return `<div class="att-cal__cell att-cal__cell--future ${wdCls}">
        <div class="att-cal__day-row"><span class="att-cal__day">${d}</span><span class="att-cal__day-tail">${chip}${docMark}</span></div>
      </div>`;
    }
    /* work — 색상 블록 스택(나의 근태현황과 통일). 근무조 불일치는 경고 블록(다홍+!)으로 표시. */
    const mm = calShiftMismatch(r);
    const blocks = [];
    if (mm) {
      blocks.push(`<div class="att-cal__block att-cal__block--warn" title="근무조 불일치 — 등록 ${esc(mm.code)} ${esc(mm.sched)} · 실제 출근 ${esc(mm.actual)}"><span class="att-cal__block-txt">출근 ${esc(r.checkIn)} 퇴근 ${esc(r.checkOut)}</span><span class="att-cal__mm">!</span></div>`);
    } else {
      blocks.push(calBlock(calShiftColorCls(r.shift), `출근 ${esc(r.checkIn)} 퇴근 ${esc(r.checkOut)}`, `출근 ${r.checkIn} · 퇴근 ${r.checkOut}`));
    }
    if (r.isLate)            blocks.push(calBlock('att-cal__block--late',  `지각 ${r.lateMin || 0}분`));
    if (r.isEarly)           blocks.push(calBlock('att-cal__block--early', `조퇴 ${r.earlyMin || 0}분`));
    if (r.ot && r.ot.extra)  blocks.push(calBlock('att-cal__block--ot',    `연장 ${r.ot.extra}h`));
    if (r.ot && r.ot.night)  blocks.push(calBlock('att-cal__block--night', `야간 ${r.ot.night}h`));
    return `
      <div class="att-cal__cell ${wdCls} ${today}">
        <div class="att-cal__day-row">
          <span class="att-cal__day">${d}</span>
          <span class="att-cal__day-tail">${chip}${docMark}</span>
        </div>
        <div class="att-cal__blocks">${blocks.join('')}</div>
      </div>
    `;
  }

  /* ----- 대시보드 ----- */
  function renderDashboard(empId, stats, recs) {
    return renderStatPanel(stats) + renderRecentLog(empId, recs);
  }

  /* ----- 통계 패널 (퇴사 현황 화면 레이아웃 차용) -----
   *  · 접기/펼치기 가능한 "근태 통계" 카드 패널
   *  · 내부는 4열 그리드 KPI 카드 (퇴사 현황 kpiCard 와 동일 톤)            */
  function kpiCard(title, value, valueColor) {
    return `
      <div style="padding:14px 16px;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);">
        <div style="font-size:var(--fs-xs);color:var(--color-text-muted);">${esc(title)}</div>
        <div style="font-size:var(--fs-2xl);font-weight:var(--fw-bold);margin-top:4px;color:${valueColor || 'var(--color-text)'};">${value}</div>
      </div>
    `;
  }
  function _kpiUnit(t) {
    return `<small style="font-size:var(--fs-sm);font-weight:var(--fw-regular);color:var(--color-text-muted);margin-left:4px;">${esc(t)}</small>`;
  }
  /* 클릭 가능한 KPI 카드 — 클릭 시 해당 항목 대상자 모달 */
  function kpiCardClickable(cat, title, value, valueColor) {
    return `
      <button type="button" data-att-stat-cat="${esc(cat)}"
        style="text-align:left;padding:14px 16px;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);cursor:pointer;transition:box-shadow var(--t-fast),border-color var(--t-fast);"
        onmouseover="this.style.boxShadow='var(--shadow-sm)';this.style.borderColor='var(--color-brand-primary)';"
        onmouseout="this.style.boxShadow='';this.style.borderColor='var(--color-border)';">
        <div style="font-size:var(--fs-xs);color:var(--color-text-muted);display:flex;align-items:center;gap:4px;">${esc(title)}<span style="margin-left:auto;color:var(--color-brand-primary);font-size:10px;">대상자 ›</span></div>
        <div style="font-size:var(--fs-2xl);font-weight:var(--fw-bold);margin-top:4px;color:${valueColor || 'var(--color-text)'};">${value}</div>
      </button>
    `;
  }
  function renderStatPanel(s) {
    /* 근태 통계 카드 — 지각 / 조퇴 / 결근 / 연장근무 / 야간근무 / 야간연장근무 / 휴일근무 */
    const items = [
      { cat: 'late',       label: '지각',         value: `${s.lateCnt}${_kpiUnit('회')}`,                color: s.lateCnt > 0 ? 'var(--color-warning)' : 'var(--color-text)' },
      { cat: 'early',      label: '조퇴',         value: `${s.earlyCnt}${_kpiUnit('회')}`,               color: s.earlyCnt > 0 ? 'var(--color-warning)' : 'var(--color-text)' },
      { cat: 'abs',        label: '결근',         value: `${s.absCnt}${_kpiUnit('일')}`,                 color: s.absCnt > 0 ? 'var(--color-danger)' : 'var(--color-text)' },
      { cat: 'extra',      label: '연장 근무',    value: `${s.otExtra.toFixed(1)}${_kpiUnit('h')}`,      color: 'var(--color-brand-primary)' },
      { cat: 'night',      label: '야간 근무',    value: `${s.otNight.toFixed(1)}${_kpiUnit('h')}`,      color: 'var(--color-brand-primary)' },
      { cat: 'nightExtra', label: '야간 연장 근무', value: `${(s.otNightExtra || 0).toFixed(1)}${_kpiUnit('h')}`, color: 'var(--color-brand-primary)' },
      { cat: 'holiday',    label: '휴일 근무',    value: `${s.otHoliday.toFixed(1)}${_kpiUnit('h')}`,    color: 'var(--color-text)' },
    ];
    const open = STATE.statOpen;
    const arrowSvg = open
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
    return `
      <div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);margin-bottom:14px;overflow:hidden;">
        <button type="button" data-att-stat-toggle
          style="width:100%;display:flex;align-items:center;gap:8px;padding:10px 16px;border:0;background:transparent;cursor:pointer;text-align:left;border-bottom:${open ? '1px solid var(--color-divider)' : '0'};">
          <strong style="font-size:var(--fs-sm);color:var(--color-text);">근태 통계</strong>
          <span style="flex:1;"></span>
          <span style="display:inline-flex;align-items:center;gap:4px;color:var(--color-text-muted);font-size:var(--fs-xs);">
            ${open ? '접기' : '펼치기'} ${arrowSvg}
          </span>
        </button>
        <div style="padding:14px 16px;${open ? '' : 'display:none;'}">
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;">
            ${items.map(it => kpiCardClickable(it.cat, it.label, it.value, it.color)).join('')}
          </div>
        </div>
      </div>
    `;
  }

  /* ----- 현황 요약 테이블 섹션 — Table Card(캡션 + 박스) 톤 ----- */
  function renderHRTableSection({ title, count, countUnit, thead, tbody }) {
    return `
      <div class="table-card table-card--mt">
        <div class="table-card__cap">
          <strong>${esc(title)}</strong>
          <span class="t-muted" style="font-size:var(--fs-xs);">${count}${esc(countUnit || '건')}</span>
        </div>
        <div class="table-card__body">
          <table class="prs-editor__table prs-editor__table--wide" style="width:100%;">
            <thead>${thead}</thead>
            <tbody>${tbody}</tbody>
          </table>
        </div>
      </div>
    `;
  }
  function renderRecentLog(empId, recs) {
    const recent = recs.filter(r => r.kind === 'work' || r.kind === 'att')
      .filter(r => r.date <= TODAY)
      .slice(-10).reverse();
    if (!recent.length) {
      return `<div class="att-empty">표시할 기록이 없습니다.</div>`;
    }
    const tbody = recent.map(r => {
      const emp = EMP_LIST.find(e => e.id === empId);
      const dayShift = r.shift || (emp ? emp.shift : '-');
      const dayShiftLabel = (dayShift && dayShift !== '-' && App.AttShifts && App.AttShifts.labelOf) ? App.AttShifts.labelOf(dayShift) : dayShift;
      if (r.kind === 'att') {
        return `<tr>
          <td>${esc(r.date)}</td>
          <td>${esc(dayShiftLabel)}</td>
          <td><span class="pill pill--info">${esc(r.label)}</span></td>
          <td>${esc(r.checkIn || '-')}</td>
          <td>${esc(r.checkOut || '-')}</td>
          <td style="text-align:right;">-</td>
          <td style="text-align:right;">-</td>
          <td>${esc(codeLabel(r.code) || '')}</td>
        </tr>`;
      }
      const notes = [];
      if (r.isLate)  notes.push('<span class="pill pill--warning">지각</span>');
      if (r.isEarly) notes.push('<span class="pill pill--warning">조퇴</span>');
      return `<tr>
        <td>${esc(r.date)}</td>
        <td>${esc(dayShiftLabel)}</td>
        <td>출근</td>
        <td>${esc(r.checkIn)}</td>
        <td>${esc(r.checkOut)}</td>
        <td style="text-align:right;">${r.ot.extra ? r.ot.extra.toFixed(1) + 'h' : '-'}</td>
        <td style="text-align:right;">${r.ot.night ? r.ot.night.toFixed(1) + 'h' : '-'}</td>
        <td>${notes.join(' ')}</td>
      </tr>`;
    }).join('');
    return renderHRTableSection({
      title: '최근 기록',
      count: recent.length,
      countUnit: '건',
      thead: `
        <tr>
          <th style="width:100px;">날짜</th>
          <th style="width:80px;">근무조</th>
          <th style="width:80px;">구분</th>
          <th style="width:80px;">출근</th>
          <th style="width:80px;">퇴근</th>
          <th style="width:80px;text-align:right;">연장</th>
          <th style="width:80px;text-align:right;">야간</th>
          <th>비고</th>
        </tr>`,
      tbody,
    });
  }

  /* =========================================================
   *  Re-render helpers — 부분 갱신
   * ========================================================= */
  function renderAll(pageEl) {
    const tree = pageEl.querySelector('[data-att-tree]');
    if (tree) tree.innerHTML = renderOrgTree();
    pageEl.querySelector('[data-att-head]').innerHTML = renderHead();
    pageEl.querySelector('[data-att-body]').innerHTML = renderBody();
  }

  /* =========================================================
   *  바인딩
   * ========================================================= */
  function bind(pageEl) {
    if (pageEl.dataset.attStatusBound === '1') return;
    pageEl.dataset.attStatusBound = '1';

    /* 연/월 피커(App.YmPicker) 월 선택 — 월간/주간 공통. 주간 모드면 선택한 달의 기본 주로 점프
       (weekMonday 초기화 → 그 달 1일이 속한 주, 이번 달이면 오늘 주). 주 단위 이동은 화살표로 처리. */
    pageEl.addEventListener('ympick:change', e => {
      if (e.detail.name === 'ym') { STATE.ym = e.detail.ym; STATE.weekMonday = null; renderAll(pageEl); }
    });

    pageEl.addEventListener('click', e => {
      /* 기간 이동 + 오늘 — 전사 연간=연 단위 / 주간(부서·전사)=주 단위 / 그 외=월 단위 */
      const isC0 = STATE.selectedDeptId === 'C0';
      const isYearNav = isC0 && STATE.companyMode === 'year';
      const isWeekNav = (STATE.selectedDeptId && STATE.selectedDeptId !== 'C0' && STATE.deptMode === 'week')
                     || (isC0 && STATE.companyMode === 'week');
      if (e.target.closest('[data-att-ym-prev]')) { if (isYearNav) shiftYear(-1); else if (isWeekNav) shiftWeek(-1); else STATE.ym = shiftMonth(STATE.ym, -1); renderAll(pageEl); return; }
      if (e.target.closest('[data-att-ym-next]')) { if (isYearNav) shiftYear(+1); else if (isWeekNav) shiftWeek(+1); else STATE.ym = shiftMonth(STATE.ym, +1); renderAll(pageEl); return; }
      if (e.target.closest('[data-att-today]'))   { STATE.ym = TODAY.slice(0,7); STATE.weekMonday = null; STATE.selectedDate = TODAY; renderAll(pageEl); return; }

      /* 부서별 월간/주간 모드 토글 */
      const modeBtn = e.target.closest('[data-att-dept-mode]');
      if (modeBtn) {
        STATE.deptMode = modeBtn.dataset.attDeptMode;
        if (STATE.deptMode === 'week') STATE.weekMonday = null;   /* 조회월 기준 주로 초기화 */
        renderAll(pageEl);
        return;
      }
      /* 전사(C0) 주간/월간/연간 모드 토글 */
      const compModeBtn = e.target.closest('[data-att-comp-mode]');
      if (compModeBtn) {
        STATE.companyMode = compModeBtn.dataset.attCompMode;
        if (STATE.companyMode === 'week') STATE.weekMonday = null;
        renderAll(pageEl);
        return;
      }

      /* 뷰 토글 */
      const v = e.target.closest('[data-att-view]');
      if (v && !v.disabled) { STATE.view = v.dataset.attView; renderAll(pageEl); return; }

      /* 통계 패널 접기/펼치기 */
      if (e.target.closest('[data-att-stat-toggle]')) { STATE.statOpen = !STATE.statOpen; renderAll(pageEl); return; }

      /* 수동 새로고침 — 캐시 비우고 통계 재계산 */
      if (e.target.closest('[data-att-refresh]')) {
        STATE.records = {};
        STATE.lastRefreshAt = nowHMS();
        renderAll(pageEl);
        window.toast && window.toast('근태 통계를 갱신했습니다.', 'success');
        return;
      }

      /* 좌측 조직도 — 임직원 관리와 동일 트리. 노드 클릭 시 data-id 로 선택 부서 전환 */
      const treeNode = e.target.closest('.tree__node[data-id]');
      if (treeNode) {
        STATE.selectedDeptId = treeNode.dataset.id;
        renderAll(pageEl);
        return;
      }

      /* 전체 뷰 — 부서명 클릭 → 해당 부서 선택 (부서명→id 매핑) */
      const dp = e.target.closest('[data-att-dept-open]');
      if (dp) {
        e.preventDefault();
        const h = HRI();
        STATE.selectedDeptId = (h && h.deptIdOf && h.deptIdOf(dp.dataset.attDeptOpen)) || 'C0';
        renderAll(pageEl);
        return;
      }

      /* 근태 통계 카드 클릭 → 해당 항목 대상자 모달 */
      const statCat = e.target.closest('[data-att-stat-cat]');
      if (statCat) { openStatTargetModal(statCat.dataset.attStatCat); return; }

      /* 신청 dropdown 토글 */
      if (e.target.closest('[data-att-apply-toggle]')) {
        STATE.applyMenuOpen = !STATE.applyMenuOpen;
        renderAll(pageEl);
        return;
      }

      /* 액션 — 연차/근태/초과근무 신청 + 신청 현황 통합 모달 */
      const act = e.target.closest('[data-att-act]');
      if (act) {
        const a = act.dataset.attAct;
        STATE.applyMenuOpen = false;
        if (a === 'apply-leave') openApplyModal('leave');
        else if (a === 'apply-att')   openApplyModal('att');
        else if (a === 'apply-ot')    openOtModal();
        else if (a === 'shift-change') openShiftChangeModal();
        renderAll(pageEl);
        return;
      }

      /* 캘린더 셀 안의 품의서 뱃지 클릭 */
      const docBtn = e.target.closest('[data-att-doc-open]');
      if (docBtn) { e.stopPropagation(); openDocModal(docBtn.dataset.attDocOpen); return; }

      /* 지각/조퇴 셀 클릭 → 해당 기록 리스트 모달 */
      const leCell = e.target.closest('[data-att-le]');
      if (leCell) {
        e.preventDefault();
        const eid = leCell.dataset.attLeEmp;
        const emp = EMP_LIST.find(x => x.id === eid);
        openLateEarlyModal({ name: emp && emp.name, periodLabel: fmtYM(STATE.ym), recs: getRecords(eid, STATE.ym), kind: leCell.dataset.attLe });
        return;
      }
      /* 다운로드 — 부서 월 집계 */
      if (e.target.closest('[data-att-dept-month-dl]')) { e.preventDefault(); dlDeptMonth(); return; }
      /* 다운로드 — 직원별 근태 상세내역(직원별 섹션 1개 파일) */
      if (e.target.closest('[data-att-dept-detail-dl]')) { e.preventDefault(); dlDeptDetail(); return; }
      /* 다운로드 — 부서 주간 집계(현재 주 일자별 + 직원별 총합) */
      if (e.target.closest('[data-att-dept-week-dl]')) { e.preventDefault(); dlDeptWeek(); return; }
      /* 다운로드 — 전사 근태 집계(부서별 시트, 주/월/연) */
      if (e.target.closest('[data-att-comp-sum-dl]')) { e.preventDefault(); dlCompanySummary(); return; }
      /* 다운로드 — 전사 직원별 근태 상세내역(부서별 시트, 주/월) */
      if (e.target.closest('[data-att-comp-detail-dl]')) { e.preventDefault(); dlCompanyDetail(); return; }
      /* 다운로드 — 직원 일자별 근태 기록(현재 조회 월) */
      const dailyDl = e.target.closest('[data-att-emp-daily-dl]');
      if (dailyDl) { e.preventDefault(); dlEmpDaily(dailyDl.dataset.attEmpDailyDl, STATE.ym); return; }
      /* 다운로드 — 직원 근태 신청내역(승인건만) */
      const appsDl = e.target.closest('[data-att-emp-apps-dl]');
      if (appsDl) { e.preventDefault(); dlEmpApps(appsDl.dataset.attEmpAppsDl, true); return; }

      /* 직원 이름 클릭 → 직원별 근태 현황 모달 */
      const emp = e.target.closest('[data-att-emp-open]');
      if (emp) {
        e.preventDefault();
        openEmpDetailModal(emp.dataset.attEmpOpen);
        return;
      }

      /* dropdown 영역 외부 클릭 → 메뉴 닫기 */
      if (STATE.applyMenuOpen && !e.target.closest('[data-att-apply-menu]')) {
        STATE.applyMenuOpen = false;
        renderAll(pageEl);
      }
    });
    pageEl.addEventListener('change', e => {
      const tDept = e.target.closest('[data-att-target-dept]');
      if (tDept) { STATE.targetDept = tDept.value; renderAll(pageEl); return; }
      /* 권한자 토글은 「나의 근무현황」(별도 메뉴) 분리로 본 페이지에서 제거됨. */
    });
  }

  /* 임직원별 — 전자결재 구성원 picker 호출. 선택 시 그 직원의 근태로 전환. */
  function openEmpPicker(pageEl) {
    if (typeof App.openEmpPicker !== 'function') {
      /* picker 부재 시 — fallback: 사용자 목록 select 다이얼로그를 promp t 대신 toast로 안내 */
      window.toast && window.toast('직원 선택 다이얼로그를 사용할 수 없습니다.', 'warning');
      return;
    }
    App.openEmpPicker({
      action: 'callback',
      multi: false,
      onConfirm(selected) {
        if (selected && selected[0]) {
          const e = selected[0];
          /* picker 가 반환한 직원이 EMP_LIST 에 없으면 동적 추가 (mock 환경) */
          if (!EMP_LIST.find(x => x.id === e.id)) {
            EMP_LIST.push({ id: e.id, name: e.name, dept: e.dept || '-', shift: 'WTD01' });
          }
          STATE.targetEmp = e.id;
          STATE.scope = 'emp';
          renderAll(pageEl);
        }
      },
    });
  }
  function shiftMonth(ym, delta) {
    const { y, m } = parseYM(ym);
    let nm = m + delta, ny = y;
    while (nm <= 0)  { nm += 12; ny -= 1; }
    while (nm > 12)  { nm -= 12; ny += 1; }
    return `${ny}-${pad2(nm)}`;
  }

  /* =========================================================
   *  근태 / 휴가 / 연차 신청 모달
   *
   *    mode: 'leave' — HOL-B(연차) / HOL-C(반차) 만 노출. 단순 라디오.
   *    mode: 'att'   — 일반근태(ATT) 대분류 select + 세부 select (휴가 제외)
   *    mode: 'hol'   — 휴가(HOL) 대분류 select + 세부 select (근태 제외)
   *
   *  설계 원칙: 코드 수가 많아도 사용자 시선엔 항상 "대분류 select → 세부 select"
   *  2단계만 보이도록 정리. 한 화면에 100개의 라디오를 깔지 않는다.
   *  ※ 근태(att)·휴가(hol)는 각각 단일 카테고리 전용 모달이므로 탭을 두지 않는다.
   * ========================================================= */
  function openApplyModal(mode) {
    let initial;
    if (mode === 'leave' || mode === 'hol') initial = 'HOLB01';
    else initial = 'ATTA01';
    const tab = (mode === 'leave' || mode === 'hol') ? 'HOL' : 'ATT';
    const init = findCode(initial);
    STATE.applyDraft = {
      mode,
      tab,                    /* 'ATT' | 'HOL' — 그룹 필터에 사용 */
      groupCode: init.groupCode,
      code: initial,
      dateFrom: STATE.selectedDate || TODAY,
      dateTo:   STATE.selectedDate || TODAY,
      reason: '',
      /* 결재선 — 전자결재(문서작성) 근태신청서와 동일한 .approval-line 패턴. 기본 1차 결재자(팀장) 시드. */
      approvers: [{ name: '이팀장', empId: '', dept: ME_DEPT }],
      /* 첨부 파일 — 전자결재 기안 양식과 동일하게 첨부 가능. [{name, size}] */
      files: [],
    };
    const titleEl = document.getElementById('att-apply-title');
    if (titleEl) titleEl.textContent = `기안 · ${applyDocName(mode)}`;
    renderApplyModal();
    openModalEl('modal-att-apply');
  }

  function _getGroups(tab) {
    if (tab !== 'HOL') return ATT_GROUPS;
    /* 대체 휴가 잔여가 있을 때만 「휴가」 대분류에 추가 */
    return compLeaveBalance() > 0 ? HOL_GROUPS.concat([COMP_LEAVE_GROUP]) : HOL_GROUPS;
  }

  /* 전자결재 기안 양식의 문서명 — 근태신청서 / 연차·휴가 신청서 */
  function applyDocName(mode) { return (mode === 'leave' || mode === 'hol') ? '연차·휴가 신청서' : '근태신청서'; }
  function applyTypeLabel(mode) { return (mode === 'leave' || mode === 'hol') ? '휴가 종류' : '근태 종류'; }

  /* 결재선 — 전자결재(문서작성) 근태신청서와 동일한 .approval-line 컴포넌트 재사용(추가 CSS 불요).
     STATE.applyDraft.approvers 를 단계별 칩으로 렌더. data-att-apr-* 훅으로 추가/변경/제거. */
  function renderApplyApprovalLine() {
    const aprs = (STATE.applyDraft && STATE.applyDraft.approvers) || [];
    const stages = aprs.map((s, idx) => {
      const isLast = idx === aprs.length - 1;
      return `
        <div class="approval-stage">
          <span class="approval-stage__badge">${idx + 1}차</span>
          <button type="button" class="approval-stage__person" data-att-apr-replace="${idx}" title="결재자 변경"><span>${esc(s.name || '선택')}</span></button>
          <button type="button" class="approval-stage__remove" data-att-apr-remove="${idx}" aria-label="제거">×</button>
        </div>
        ${!isLast ? '<span class="approval-arrow">→</span>' : ''}
      `;
    }).join('');
    const addBtn = aprs.length < 3 ? `<button type="button" class="approval-add" data-att-apr-add>+ 추가</button>` : '';
    return `<div class="approval-line">${stages}${addBtn}</div>`;
  }
  /* 첨부 파일 — 전자결재 기안 양식과 동일한 .file-field / .dz / .dz-list 컴포넌트. */
  function _applyFmtSize(n) {
    if (typeof n !== 'number') return n || '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }
  function renderApplyFiles() {
    const files = (STATE.applyDraft && STATE.applyDraft.files) || [];
    const list = files.map((f, i) => `
      <div class="dz-file">
        <span>📄</span>
        <span class="dz-file__name">${esc(f.name)}</span>
        <span class="dz-file__size">${esc(_applyFmtSize(f.size))}</span>
        <button type="button" class="dz-file__remove" data-att-file-remove="${i}" aria-label="제거">✕</button>
      </div>`).join('');
    return `
      <div class="file-field" data-att-file-field>
        <div class="dz" data-att-file-dz tabindex="0">
          <svg class="dz__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="30" height="30"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <div class="dz__title">파일을 끌어 놓거나 클릭하여 선택</div>
          <div class="dz__sub">최대 10MB · PDF, JPG, PNG, XLSX, DOCX</div>
          <input type="file" hidden multiple data-att-file-input>
        </div>
        <div class="dz-list" data-att-file-list>${list}</div>
      </div>`;
  }
  /* 결재자 선택 — 전자결재 구성원 picker(App.openEmpPicker) 재사용. idx<0 이면 추가, 아니면 해당 단계 교체. */
  function pickApprover(idx) {
    if (typeof App.openEmpPicker !== 'function') { window.toast && window.toast('결재자 선택 다이얼로그를 사용할 수 없습니다.', 'warning'); return; }
    App.openEmpPicker({
      action: 'callback', multi: false, zIndex: 1200,
      onConfirm(selected) {
        const p = Array.isArray(selected) ? selected[0] : selected;
        if (!p) return;
        const ap = { name: p.name || '', empId: p.empId || p.id || '', dept: p.dept || '' };
        const d = STATE.applyDraft;
        if (!d) return;
        if (idx < 0) { if (d.approvers.length < 3) d.approvers.push(ap); }
        else d.approvers[idx] = ap;
        renderApplyModal();
      },
    });
  }

  /* 연차휴가신청서(HOL) 상단 잔여 카드 — 발생 연차 / 잔여 연차 / 대체 휴가 를 큰 카드로 강조.
     모달 최상단에 배치해 신청 전 잔여를 한눈에 인지. 색상은 기존 칩 색 의미 유지(발생=brand, 잔여=success, 대체=warning). */
  function renderApplyBalanceCards(tab) {
    if (tab !== 'HOL') return '';
    const comp = compLeaveBalance();
    const cards = [
      { label: '발생 연차', value: ME_LEAVE.granted, mod: '' },
      { label: '잔여 연차', value: leaveRemain(),    mod: 'att-apply__card--remain' },
      { label: '대체 휴가', value: comp,             mod: 'att-apply__card--comp' },
    ];
    return `
      <div class="att-apply__cards">
        ${cards.map(c => `
          <div class="att-apply__card ${c.mod}">
            <div class="att-apply__card-label">${esc(c.label)}</div>
            <div class="att-apply__card-value">${c.value}<small>일</small></div>
          </div>
        `).join('')}
      </div>
    `;
  }

  /* 기간 옆 일수 표기 — 휴가(HOL)에서만 (n일) 노출. 날짜 변경 시 updateApplyDays 로 즉시 갱신. */
  function applyDaysHTML(d) {
    if (d.tab !== 'HOL') return '';
    return `<span class="t-muted" data-att-apply-days style="margin-left:10px;font-weight:var(--fw-medium);color:var(--color-text);">(${applyReqDays(d)}일)</span>`;
  }
  function updateApplyDays(modal) {
    const d = STATE.applyDraft;
    if (!modal || d.tab !== 'HOL') return;
    const daysEl = modal.querySelector('[data-att-apply-days]');
    if (daysEl) daysEl.textContent = `(${applyReqDays(d)}일)`;
  }

  function renderApplyModal() {
    const modal = document.getElementById('modal-att-apply');
    if (!modal) return;
    const body = modal.querySelector('#att-apply-body');
    if (!body) return;
    const d = STATE.applyDraft;

    let pickerHTML;

    if (d.mode === 'leave') {
      /* 연차/반차 — 옵션이 3개 뿐이라 단순 라디오 한 줄 */
      const opts = [
        { code: 'HOLB01', label: '연차',     desc: '하루 종일' },
        { code: 'HOLC01', label: '오전 반차', desc: '09:00 ~ 14:00' },
        { code: 'HOLC02', label: '오후 반차', desc: '14:00 ~ 18:00' },
      ];
      pickerHTML = `
        <div class="att-apply__leave-opts">
          ${opts.map(o => `
            <label class="att-apply__leave-opt ${d.code === o.code ? 'is-active' : ''}">
              <input type="radio" name="att-apply-code" value="${esc(o.code)}" ${d.code === o.code ? 'checked' : ''} />
              <span class="att-apply__leave-opt-label">${esc(o.label)}</span>
              <span class="att-apply__leave-opt-desc">${esc(o.desc)}</span>
            </label>
          `).join('')}
        </div>
      `;
    } else {
      /* 근태(att) / 휴가(hol) 신청 — 단일 카테고리. 대분류 select + 세부 select (탭 없음) */
      const groups = _getGroups(d.tab);
      const currentGroup = groups.find(g => g.code === d.groupCode) || groups[0];
      if (!groups.find(g => g.code === d.groupCode)) d.groupCode = currentGroup.code;
      const items = currentGroup.items;
      if (!items.find(it => it.code === d.code)) d.code = items[0].code;

      /* 대분류 + 세부구분 — 한 줄 인라인(구분/기간 여백 축소). flex-basis 명시로 나란히 배치. */
      pickerHTML = `
        <div style="display:flex;gap:8px;align-items:center;">
          <select class="select" id="att-apply-group" style="flex:0 0 140px;">
            ${groups.map(g => `<option value="${esc(g.code)}" ${g.code === d.groupCode ? 'selected' : ''}>${esc(g.label)}</option>`).join('')}
          </select>
          <select class="select" id="att-apply-item" style="flex:1 1 0;min-width:0;">
            ${items.map(it => `<option value="${esc(it.code)}" ${it.code === d.code ? 'selected' : ''}>${esc(it.label)}</option>`).join('')}
          </select>
        </div>
      `;
    }

    const req = '<em style="color:var(--color-danger);font-style:normal;">*</em>';
    const gridCol1 = 'style="grid-template-columns:110px 1fr;"';
    const gridCol2 = 'style="grid-template-columns:110px 1fr 110px 1fr;"';
    const docNo = `DOC-${TODAY.slice(0, 4)}-AUTO`;
    body.innerHTML = `
      ${renderApplyBalanceCards(d.tab)}
      <div class="fm-tbl fm-tbl--compact fm-tbl--bordered fm-tbl--form">
        <div class="fm-tbl__row fm-tbl__row--2" ${gridCol2}>
          <div class="fm-tbl__label">문서번호</div>
          <div class="fm-tbl__value"><a class="link-code">${esc(docNo)}</a> <small class="t-muted">(상신 시 자동 채번)</small></div>
          <div class="fm-tbl__label">문서명</div>
          <div class="fm-tbl__value">${esc(applyDocName(d.mode))}</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--2" ${gridCol2}>
          <div class="fm-tbl__label">기안자</div>
          <div class="fm-tbl__value">${esc(ME_NAME)} <span class="t-muted" style="margin-left:4px;">${esc(ME_ID)}</span></div>
          <div class="fm-tbl__label">부서</div>
          <div class="fm-tbl__value">${esc(ME_DEPT)}</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" ${gridCol1}>
          <div class="fm-tbl__label">${esc(applyTypeLabel(d.mode))} ${req}</div>
          <div class="fm-tbl__value">${pickerHTML}</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" ${gridCol1}>
          <div class="fm-tbl__label">기간 ${req}</div>
          <div class="fm-tbl__value">
            <div style="display:flex;align-items:center;flex-wrap:wrap;">
              <input type="date" class="input" id="att-apply-from" style="width:170px;" value="${esc(d.dateFrom)}" />
              <span class="t-muted" style="margin:0 6px;">~</span>
              <input type="date" class="input" id="att-apply-to" style="width:170px;" value="${esc(d.dateTo)}" />
              ${applyDaysHTML(d)}
            </div>
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" ${gridCol1}>
          <div class="fm-tbl__label">사유 ${req}</div>
          <div class="fm-tbl__value">
            <textarea class="input" id="att-apply-reason" rows="3" style="width:100%;" placeholder="신청 사유를 입력하세요">${esc(d.reason)}</textarea>
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" ${gridCol1}>
          <div class="fm-tbl__label">결재선 ${req}</div>
          <div class="fm-tbl__value">${renderApplyApprovalLine()}</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" ${gridCol1}>
          <div class="fm-tbl__label">첨부 파일</div>
          <div class="fm-tbl__value">${renderApplyFiles()}</div>
        </div>
      </div>
      ${isHalfDay(d.code) ? `<div class="att-half-warn">⚠ 반차 신청 — 당일 초과근무 신청은 자동 차단됩니다.</div>` : ''}
    `;
    bindApplyModal(modal);
  }

  function bindApplyModal(modal) {
    const d = STATE.applyDraft;

    /* 연차 모드 — 라디오 */
    modal.querySelectorAll('input[name="att-apply-code"]').forEach(r => r.addEventListener('change', () => {
      d.code = r.value;
      renderApplyModal();
    }));
    /* 근태/휴가 모드 — 대분류 / 세부 */
    const gSel = modal.querySelector('#att-apply-group');
    if (gSel) gSel.addEventListener('change', () => {
      d.groupCode = gSel.value;
      const grp = _getGroups(d.tab).find(g => g.code === d.groupCode);
      d.code = grp ? grp.items[0].code : d.code;
      renderApplyModal();
    });
    const iSel = modal.querySelector('#att-apply-item');
    if (iSel) iSel.addEventListener('change', () => {
      d.code = iSel.value;
      renderApplyModal();   /* 반차 경고 / chosen 라벨 갱신 */
    });

    const fromEl = modal.querySelector('#att-apply-from');
    const toEl   = modal.querySelector('#att-apply-to');
    if (fromEl) fromEl.addEventListener('input', () => { d.dateFrom = fromEl.value; updateApplyDays(modal); });
    if (toEl)   toEl.addEventListener('input',   () => { d.dateTo   = toEl.value; updateApplyDays(modal); });
    const reEl = modal.querySelector('#att-apply-reason');
    if (reEl) reEl.addEventListener('input', () => { d.reason = reEl.value; });

    if (!modal.dataset.attApplyBound) {
      modal.dataset.attApplyBound = '1';
      modal.addEventListener('click', e => { if (e.target === modal) closeModalEl('modal-att-apply'); });
      modal.querySelectorAll('[data-modal-close], [data-att-apply-cancel]').forEach(b => b.addEventListener('click', () => closeModalEl('modal-att-apply')));
      const ok = modal.querySelector('[data-att-apply-submit]');
      if (ok) ok.addEventListener('click', submitApply);
      /* 결재선 — 추가/변경/제거 (매 렌더마다 재생성되므로 위임으로 1회 바인딩) */
      modal.addEventListener('click', e => {
        if (e.target.closest('[data-att-apr-add]'))     { pickApprover(-1); return; }
        const rep = e.target.closest('[data-att-apr-replace]');
        if (rep) { pickApprover(Number(rep.dataset.attAprReplace)); return; }
        const del = e.target.closest('[data-att-apr-remove]');
        if (del) {
          const dd = STATE.applyDraft;
          if (dd && dd.approvers) { dd.approvers.splice(Number(del.dataset.attAprRemove), 1); renderApplyModal(); }
          return;
        }
        /* 첨부 — 제거 / dz 클릭 시 파일 선택 (input 자체 클릭은 무시하여 중복 방지) */
        const frm = e.target.closest('[data-att-file-remove]');
        if (frm) {
          const dd = STATE.applyDraft;
          if (dd && dd.files) { dd.files.splice(Number(frm.dataset.attFileRemove), 1); renderApplyModal(); }
          return;
        }
        if (e.target.closest('[data-att-file-input]')) return;
        const dz = e.target.closest('[data-att-file-dz]');
        if (dz) { const inp = dz.querySelector('[data-att-file-input]'); if (inp) inp.click(); return; }
      });
      /* 첨부 파일 선택 — draft.files 에 누적 후 재렌더 */
      modal.addEventListener('change', e => {
        const inp = e.target.closest('[data-att-file-input]');
        if (inp && inp.files && inp.files.length) {
          const dd = STATE.applyDraft;
          if (dd) { Array.from(inp.files).forEach(f => dd.files.push({ name: f.name, size: f.size })); renderApplyModal(); }
        }
      });
    }
  }
  function submitApply() {
    const d = STATE.applyDraft;
    if (!d.code) {
      window.toast && window.toast('근태 종류를 선택해 주세요.', 'warning');
      return;
    }
    if (!d.reason || !d.reason.trim()) {
      window.toast && window.toast('신청 사유를 입력해 주세요.', 'warning');
      return;
    }
    if (d.dateFrom > d.dateTo) {
      window.toast && window.toast('기간이 올바르지 않습니다.', 'warning');
      return;
    }
    /* 결재선 — 최소 1명 지정 (전자결재 상신 필수) */
    const aprs = (d.approvers || []).filter(a => a && a.name && a.name.trim());
    if (!aprs.length) {
      window.toast && window.toast('결재선을 1명 이상 지정해 주세요.', 'warning');
      return;
    }
    /* 대체 휴가 — 신청 일수가 보유 잔여를 초과할 수 없음 */
    const reqDays = Math.max(1, Math.round((new Date(d.dateTo) - new Date(d.dateFrom)) / 86400000) + 1);
    if (d.code === 'HOLS01' && reqDays > compLeaveBalance()) {
      window.toast && window.toast(`보유 대체 휴가(${compLeaveBalance()}개)보다 많은 일수는 신청할 수 없습니다.`, 'warning');
      return;
    }
    closeModalEl('modal-att-apply');
    /* 대체 휴가 사용분 차감 (mock) */
    if (d.code === 'HOLS01') COMP_LEAVE.used += reqDays;

    const label = codeLabel(d.code);
    const isLeave = isLeaveCode(d.code);
    const kind = (d.mode === 'leave' || d.mode === 'hol') ? 'leave' : (isLeave ? 'leave' : 'att');
    const noPrefix = kind === 'leave' ? 'LEAVE' : 'ATT';

    /* 신청 레코드 등록 — 기안 양식에서 지정한 결재선을 그대로 결재 단계로 반영 */
    const rec = {
      id: 'APP-' + Date.now(),
      no: _nextAppNo(noPrefix),
      docNo: _nextDocNo(),
      empId: ME_ID, empName: ME_NAME, empDept: ME_DEPT,
      kind,
      code: d.code, codeLabel: label,
      dateFrom: d.dateFrom, dateTo: d.dateTo,
      reason: d.reason.trim(),
      status: 'pending',
      submittedAt: TODAY + ' ' + new Date().toTimeString().slice(0, 5),
      decidedAt:   '',
      approvers: aprs.map((a, i) => ({ stage: i + 1, name: a.name, status: '대기', at: '' })),
      files: (d.files || []).map(f => ({ name: f.name, size: f.size })),
    };
    getApps().unshift(rec);

    /* 출산/휴가(출산휴가) 상신 시 → 휴직 관리(App.HRLoa)에도 이력을 함께 등록.
       (storyboard mock — 승인 가정. 현황은 휴직 기간 기준 자동 판정) */
    const loaType = LOA_TYPE_BY_CODE[rec.code];
    if (loaType && App.HRLoa && App.HRLoa.add) {
      App.HRLoa.add({
        empId: ME_ID, empName: ME_NAME, empDept: ME_DEPT, empPosition: ME_POS,
        type: loaType,
        startDate: rec.dateFrom, endDate: rec.dateTo,
        approvalNo: rec.no, approvedAt: TODAY,
      });
    }

    window.toast && window.toast(`${label} 신청이 상신되었습니다.`, 'success');
    const pageEl = document.getElementById('page-att-status');
    if (pageEl) renderAll(pageEl);
  }

  /* =========================================================
   *  초과근무 신청 모달 — 연장근무 / 휴일근무
   *
   *  휴게 차감 / 식대 정책
   *  ① 신청 단위 — 30분 단위(:00 / :30) 로만 신청.
   *  ② 초과근무 2시간 이하 — 휴게시간 차감 없음 (18:00~20:00 → 인정 2시간).
   *  ③ 초과근무 2시간 초과 — 식대 체크 여부로 휴게 차감이 달라진다.
   *     · 식대 체크    → 휴게 30분 차감 (18:00~20:30 → 인정 2시간).
   *     · 식대 미체크  → 차감 없음     (18:00~20:30 → 인정 2시간 30분).
   *  ④ 식대 지급 — 식대 체크 건을 인사담당자가 승인하면 식권 10,000원 지급
   *     (식권 지급은 ERP 외 별도 처리, 본 시스템에서는 안내만 한다).
   * ========================================================= */
  const OT_BREAK_THRESHOLD_MIN = 120;   /* 2시간 초과(> 120) 일 때만 휴게 차감 대상 */
  const OT_BREAK_DEDUCT_MIN    = 30;    /* 휴게 30분 차감 */
  const OT_MEAL_VOUCHER_WON    = 10000; /* 식대 체크 + 승인 시 지급되는 식권 금액 */
  function myShift() { return (App.AttShifts && App.AttShifts.get) ? App.AttShifts.get(ME_SHIFT) : null; }
  function _hm2min(t) { if (!/^\d{2}:\d{2}$/.test(t || '')) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; }
  /* 초과근무 신청 시간 — 30분 단위(:00 / :30) 선택지만 제공 */
  const OT_TIME_STEP_MIN = 30;
  function _snapOtTime(t) {
    const m = _hm2min(t);
    if (m === null) return t;
    let snapped = Math.round(m / OT_TIME_STEP_MIN) * OT_TIME_STEP_MIN;
    snapped = Math.max(0, Math.min(snapped, 23 * 60 + 30));   /* 00:00 ~ 23:30 */
    const h = Math.floor(snapped / 60), mm = snapped % 60;
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  /* 00:00 ~ 23:30, 30분 간격 시간 옵션 */
  function _otTimeOptions(selected) {
    const sel = _snapOtTime(selected);
    let out = '';
    for (let m = 0; m <= 23 * 60 + 30; m += OT_TIME_STEP_MIN) {
      const h = Math.floor(m / 60), mm = m % 60;
      const v = `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      out += `<option value="${v}" ${v === sel ? 'selected' : ''}>${v}</option>`;
    }
    return out;
  }
  function _fmtMin(min) {
    if (min <= 0) return '0분';
    const h = Math.floor(min / 60), m = min % 60;
    return (h ? `${h}시간` : '') + (m ? `${h ? ' ' : ''}${m}분` : (h ? '' : '0분'));
  }
  /* 신청 시간 + 식대 체크 → { rawMin, breakDeduct, netMin, overThreshold }
     · 2시간 이하            → 차감 없음
     · 2시간 초과 + 식대 체크 → 휴게 30분 차감
     · 2시간 초과 + 식대 미체크 → 차감 없음 */
  function otRecognized(start, end, mealChecked) {
    const s = _hm2min(start), e = _hm2min(end);
    if (s === null || e === null) return { rawMin: 0, breakDeduct: 0, netMin: 0, overThreshold: false };
    let raw = e - s;
    if (raw < 0) raw += 24 * 60;   /* 자정 넘김 */
    const overThreshold = raw > OT_BREAK_THRESHOLD_MIN;   /* 2시간 초과 */
    const breakDeduct = (overThreshold && mealChecked) ? OT_BREAK_DEDUCT_MIN : 0;
    return { rawMin: raw, breakDeduct, netMin: Math.max(0, raw - breakDeduct), overThreshold };
  }
  function renderOtSummary(start, end, mealChecked) {
    const r = otRecognized(start, end, mealChecked);
    if (!r.rawMin) {
      return `<span class="t-muted" style="font-size:var(--fs-sm);">시간을 입력하면 인정 시간이 계산됩니다.</span>`;
    }
    return `
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;font-size:var(--fs-sm);color:var(--color-text-sub);">
        <span>신청 <strong>${_fmtMin(r.rawMin)}</strong></span>
        <span style="color:var(--color-divider);">−</span>
        <span>휴게 차감 <strong style="color:${r.breakDeduct ? 'var(--color-warning)' : 'var(--color-text-muted)'};">${r.breakDeduct ? _fmtMin(r.breakDeduct) : '없음'}</strong></span>
        <span style="color:var(--color-divider);">=</span>
        <span>인정 <strong style="color:var(--color-brand-primary);font-size:var(--fs-md);">${_fmtMin(r.netMin)}</strong></span>
      </div>
    `;
  }
  function openOtModal() {
    STATE.otDraft = {
      otKind: 'night',  /* 'night' | 'holiday' */
      date: STATE.selectedDate || TODAY,
      startTime: '18:00',
      endTime:   '21:00',
      reasonCode: OT_REASONS.night[0],
      reason: OT_REASONS.night[0],   /* 사유 dropdown 선택값이 곧 신청 사유 */
      mealChecked: false,   /* 식대 체크 — 2시간 초과 시 휴게 차감 + 식권 지급 대상 */
    };
    renderOtModal();
    openModalEl('modal-att-ot');
  }
  function renderOtModal() {
    const modal = document.getElementById('modal-att-ot');
    if (!modal) return;
    const body = modal.querySelector('#att-ot-body');
    if (!body) return;
    const d = STATE.otDraft;
    const titleEl = document.getElementById('att-ot-title');
    if (titleEl) titleEl.textContent = '기안 · 초과근무 신청서';

    const reasons = OT_REASONS[d.otKind] || OT_REASONS.night;
    if (!reasons.includes(d.reasonCode)) { d.reasonCode = reasons[0]; d.reason = reasons[0]; }

    /* 기안·근태신청서와 동일한 전자결재 기안 양식(fm-tbl) — 문서 헤더 + 신청 필드 */
    const req = '<em style="color:var(--color-danger);font-style:normal;">*</em>';
    const gridCol1 = 'style="grid-template-columns:110px 1fr;"';
    const gridCol2 = 'style="grid-template-columns:110px 1fr 110px 1fr;"';
    const docNo = `DOC-${TODAY.slice(0, 4)}-AUTO`;
    const docName = d.otKind === 'holiday' ? '휴일근무 신청서' : '연장근무 신청서';
    const overThreshold = otRecognized(d.startTime, d.endTime).overThreshold;
    body.innerHTML = `
      <div class="fm-tbl fm-tbl--compact fm-tbl--bordered fm-tbl--form">
        <div class="fm-tbl__row fm-tbl__row--2" ${gridCol2}>
          <div class="fm-tbl__label">문서번호</div>
          <div class="fm-tbl__value"><a class="link-code">${esc(docNo)}</a> <small class="t-muted">(상신 시 자동 채번)</small></div>
          <div class="fm-tbl__label">문서명</div>
          <div class="fm-tbl__value">${esc(docName)}</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--2" ${gridCol2}>
          <div class="fm-tbl__label">기안자</div>
          <div class="fm-tbl__value">${esc(ME_NAME)} <span class="t-muted" style="margin-left:4px;">${esc(ME_ID)}</span></div>
          <div class="fm-tbl__label">부서</div>
          <div class="fm-tbl__value">${esc(ME_DEPT)}</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" ${gridCol1}>
          <div class="fm-tbl__label">구분 ${req}</div>
          <div class="fm-tbl__value">
            <div class="tabs tabs--segmented" style="display:inline-flex;width:auto;">
              <div class="tabs__nav">
                <button type="button" class="tabs__tab ${d.otKind === 'night' ? 'is-active' : ''}" data-att-ot-tab="night">연장근무</button>
                <button type="button" class="tabs__tab ${d.otKind === 'holiday' ? 'is-active' : ''}" data-att-ot-tab="holiday">휴일근무</button>
              </div>
            </div>
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" ${gridCol1}>
          <div class="fm-tbl__label">일자 ${req}</div>
          <div class="fm-tbl__value"><input type="date" class="input" id="att-ot-date" style="width:170px;" value="${esc(d.date)}" /></div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" ${gridCol1}>
          <div class="fm-tbl__label">시간 ${req}</div>
          <div class="fm-tbl__value">
            <div style="display:flex;align-items:center;">
              <select class="select" id="att-ot-start" style="max-width:120px;">${_otTimeOptions(d.startTime)}</select>
              <span class="t-muted" style="margin:0 6px;">~</span>
              <select class="select" id="att-ot-end" style="max-width:120px;">${_otTimeOptions(d.endTime)}</select>
            </div>
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" id="att-ot-meal-row" style="grid-template-columns:110px 1fr;${overThreshold ? '' : 'display:none;'}">
          <div class="fm-tbl__label">식대</div>
          <div class="fm-tbl__value">
            <label class="chk"><input type="checkbox" id="att-ot-meal" ${d.mealChecked ? 'checked' : ''}><span>식대 체크 (식사 후 근무)</span></label>
            <div class="form-help" style="margin-top:4px;">휴게 30분이 차감되며, 승인 시 식권 ${OT_MEAL_VOUCHER_WON.toLocaleString()}원이 지급됩니다.</div>
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" ${gridCol1}>
          <div class="fm-tbl__label">인정 시간</div>
          <div class="fm-tbl__value" id="att-ot-summary">${renderOtSummary(d.startTime, d.endTime, d.mealChecked)}</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" ${gridCol1}>
          <div class="fm-tbl__label">사유 ${req}</div>
          <div class="fm-tbl__value">
            <select class="select" id="att-ot-reason-sel" style="width:100%;">
              ${reasons.map(r => `<option value="${esc(r)}" ${d.reasonCode === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
    `;
    bindOtModal(modal);
  }
  function bindOtModal(modal) {
    modal.querySelectorAll('[data-att-ot-tab]').forEach(b => b.addEventListener('click', () => {
      STATE.otDraft.otKind = b.dataset.attOtTab;
      renderOtModal();
    }));
    const rSel = modal.querySelector('#att-ot-reason-sel');
    /* 사유는 dropdown 선택값이 곧 신청 사유(reason) — 별도 상세 내용 입력 없음 */
    if (rSel) rSel.addEventListener('change', () => { STATE.otDraft.reasonCode = rSel.value; STATE.otDraft.reason = rSel.value; });
    const dEl = modal.querySelector('#att-ot-date');
    const sEl = modal.querySelector('#att-ot-start');
    const eEl = modal.querySelector('#att-ot-end');
    const mEl = modal.querySelector('#att-ot-meal');
    const mealRow = modal.querySelector('#att-ot-meal-row');
    const refreshOtSummary = () => {
      const d = STATE.otDraft;
      const over = otRecognized(d.startTime, d.endTime).overThreshold;
      /* 2시간 이하면 식대 체크 불가 — 행 숨김 + 체크 해제 */
      if (!over && d.mealChecked) { d.mealChecked = false; if (mEl) mEl.checked = false; }
      if (mealRow) mealRow.style.display = over ? '' : 'none';
      const el = modal.querySelector('#att-ot-summary');
      if (el) el.innerHTML = renderOtSummary(d.startTime, d.endTime, d.mealChecked);
    };
    if (dEl) dEl.addEventListener('input', () => { STATE.otDraft.date = dEl.value; });
    if (sEl) sEl.addEventListener('change', () => { STATE.otDraft.startTime = sEl.value; refreshOtSummary(); });
    if (eEl) eEl.addEventListener('change', () => { STATE.otDraft.endTime = eEl.value; refreshOtSummary(); });
    if (mEl) mEl.addEventListener('change', () => { STATE.otDraft.mealChecked = mEl.checked; refreshOtSummary(); });

    if (!modal.dataset.attOtBound) {
      modal.dataset.attOtBound = '1';
      modal.addEventListener('click', e => { if (e.target === modal) closeModalEl('modal-att-ot'); });
      modal.querySelectorAll('[data-modal-close], [data-att-ot-cancel]').forEach(b => b.addEventListener('click', () => closeModalEl('modal-att-ot')));
      const ok = modal.querySelector('[data-att-ot-submit]');
      if (ok) ok.addEventListener('click', submitOt);
    }
  }
  function submitOt() {
    const d = STATE.otDraft;
    /* 신청 시간은 항상 30분 단위로 보정 후 처리 */
    if (d.startTime) d.startTime = _snapOtTime(d.startTime);
    if (d.endTime)   d.endTime   = _snapOtTime(d.endTime);
    if (!d.date) { window.toast && window.toast('신청 일자를 선택해 주세요.', 'warning'); return; }
    if (!d.startTime || !d.endTime) { window.toast && window.toast('시작/종료 시간을 입력해 주세요.', 'warning'); return; }
    if (d.startTime >= d.endTime) { window.toast && window.toast('종료 시간이 시작 시간 이후여야 합니다.', 'warning'); return; }
    if (!d.reasonCode) { window.toast && window.toast('사유를 선택해 주세요.', 'warning'); return; }
    /* 사유 dropdown 값이 곧 신청 사유 */
    d.reason = d.reasonCode;

    /* 같은 날 반차 신청이 있는지 검사 */
    const blocking = myApps().find(a => a.kind === 'leave' && a.dateFrom <= d.date && d.date <= a.dateTo && isHalfDay(a.code) && a.status !== 'rejected');
    if (blocking) {
      window.toast && window.toast(`해당 일자(${d.date})에 반차 신청이 있어 초과근무를 신청할 수 없습니다.`, 'warning');
      return;
    }

    closeModalEl('modal-att-ot');

    const rcg = otRecognized(d.startTime, d.endTime, d.mealChecked);
    const docName = d.otKind === 'night' ? '연장근무 신청서' : '휴일근무 신청서';
    const rec = {
      id: 'APP-' + Date.now(),
      no: _nextAppNo(d.otKind === 'night' ? 'OT-N' : 'OT-H'),
      docNo: _nextDocNo(),
      empId: ME_ID, empName: ME_NAME, empDept: ME_DEPT,
      kind: 'ot', otKind: d.otKind,
      date: d.date, startTime: d.startTime, endTime: d.endTime,
      mealChecked: d.mealChecked,
      breakDeductMin: rcg.breakDeduct, recognizedMin: rcg.netMin,
      reasonCode: d.reasonCode,
      reason: d.reason.trim(),
      status: 'pending',
      submittedAt: TODAY + ' ' + new Date().toTimeString().slice(0,5),
      decidedAt:   '',
      approvers: [{ stage: 1, name: '이팀장', status: '대기', at: '' }],
    };
    getApps().unshift(rec);

    if (typeof App.openSystemApprovalModal === 'function') {
      App.openSystemApprovalModal({
        docName,
        titlePrefix: d.otKind === 'night' ? '연장근무' : '휴일근무',
        codeLabel: '사유',
        nameLabel: '내용',
        matCode: d.reasonCode,
        matName: d.reason.trim(),
        customReasons: OT_REASONS[d.otKind],
        defaultReason: d.reasonCode,
        title: `${docName} — ${fmtDisp(d.date)} ${d.startTime}~${d.endTime} (인정 ${_fmtMin(rcg.netMin)})`,
        content: `[${d.reasonCode}] ${d.reason.trim()}\n신청 ${_fmtMin(rcg.rawMin)}${rcg.breakDeduct ? ` · 휴게 차감 ${_fmtMin(rcg.breakDeduct)}` : ''} · 인정 ${_fmtMin(rcg.netMin)}${d.mealChecked ? `\n식대 체크 — 승인 시 식권 ${OT_MEAL_VOUCHER_WON.toLocaleString()}원 지급` : ''}`,
        payload: { attAppId: rec.id, otKind: d.otKind, date: d.date, startTime: d.startTime, endTime: d.endTime, reasonCode: d.reasonCode, mealChecked: d.mealChecked },
        onSubmit() {
          window.toast && window.toast(`${docName} 상신 완료`, 'success');
          const pageEl = document.getElementById('page-att-status');
          if (pageEl) renderAll(pageEl);
        },
      });
    } else {
      window.toast && window.toast(`${docName} 상신 완료`, 'success');
      const pageEl = document.getElementById('page-att-status');
      if (pageEl) renderAll(pageEl);
    }
  }

  /* =========================================================
   *  근무조 변경 신청 모달 — 현재 근무조 → 변경 근무조 / 기간 / 사유
   * ========================================================= */
  function _shiftTimeLabel(sh) {
    if (!sh) return '';
    return `${sh.start}~${sh.end}${sh.isNight ? ' · 야간' : ''}`;
  }
  /* 부서 사용 가능 근무조 — 부서별 근무정책 설정(codes) 우선, 없으면 근무조 마스터 useDepts 폴백 */
  function _deptAllowedCodes(dept) {
    const P = App.AttWorkPolicy;
    if (P && P.deptPolicy) { const c = (P.deptPolicy(dept).codes || []); if (c.length) return c.slice(); }
    return (App.AttShifts && App.AttShifts.forDept) ? App.AttShifts.forDept(dept).map(s => s.code) : [];
  }
  function _availShifts() {
    const codes = _deptAllowedCodes(ME_DEPT);
    if (codes.length) return codes.map(c => (App.AttShifts && App.AttShifts.get) ? App.AttShifts.get(c) : null).filter(Boolean);
    return App.AttShifts ? (App.AttShifts.forDept ? App.AttShifts.forDept(ME_DEPT) : App.AttShifts.list()) : [];
  }
  /* 변경 신청 가능 시작일 — 현재 날짜 기준 익월 1일 */
  function _nextMonthFirst() {
    const [y, m] = TODAY.split('-').map(Number);
    let ny = y, nm = m + 1; if (nm > 12) { nm = 1; ny++; }
    return `${ny}-${pad2(nm)}-01`;
  }
  /* 기간(개월) 종료일 — 시작일이 속한 달부터 N개월의 마지막 날 */
  function _periodEnd(startYMD, months) {
    const [y, m] = startYMD.split('-').map(Number);
    let ny = y, nm = m + months; while (nm > 12) { nm -= 12; ny++; }
    const last = new Date(ny, nm - 1, 0);   /* (시작월 + N)의 0일 = 마지막 대상월 말일 */
    return `${last.getFullYear()}-${pad2(last.getMonth() + 1)}-${pad2(last.getDate())}`;
  }
  const SHIFTCHG_PERIODS = [3, 6, 9, 12];
  function openShiftChangeModal() {
    const avail = _availShifts();
    const target = (avail.find(s => s.code !== ME_SHIFT) || avail[0] || {}).code || '';
    const from = _nextMonthFirst();
    STATE.shiftChgDraft = {
      fromShift: ME_SHIFT,
      toShift: target,
      period: 3,
      dateFrom: from,
      dateTo: _periodEnd(from, 3),
      reason: '',
    };
    renderShiftChangeModal();
    openModalEl('modal-att-shiftchg');
  }
  function renderShiftChangeModal() {
    const modal = document.getElementById('modal-att-shiftchg');
    if (!modal) return;
    const body = modal.querySelector('#att-shiftchg-body');
    if (!body) return;
    const d = STATE.shiftChgDraft;
    const cur = (App.AttShifts && App.AttShifts.get) ? App.AttShifts.get(d.fromShift) : null;
    const avail = _availShifts();
    const periodChips = SHIFTCHG_PERIODS.map(p =>
      `<button class="chip-choice__item ${d.period === p ? 'is-active' : ''}" type="button" data-sc-period="${p}">${p}개월</button>`).join('');
    body.innerHTML = `
      <div class="att-apply__form">
        <div class="att-apply__row">
          <div class="att-apply__lbl">현재 근무조</div>
          <div class="att-apply__val">
            <span class="pill ${cur && cur.isNight ? 'pill--purple' : 'pill--info'}">${esc(cur ? (cur.label || cur.code) : d.fromShift)}</span>
            <span class="t-muted" style="margin-left:8px;font-size:var(--fs-sm);">${cur ? esc(cur.code + ' · ' + _shiftTimeLabel(cur)) : ''}</span>
          </div>
        </div>
        <div class="att-apply__row">
          <div class="att-apply__lbl">변경 근무조 <span style="color:var(--color-danger);">*</span></div>
          <div class="att-apply__val">
            <select class="select" id="att-shiftchg-to" style="width:100%;">
              ${avail.filter(s => s.code !== d.fromShift).map(s => `<option value="${esc(s.code)}" ${s.code === d.toShift ? 'selected' : ''}>${esc(s.label || s.code)} (${esc(s.start)}~${esc(s.end)}${s.isNight ? ' · 야간' : ''})</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="att-apply__row">
          <div class="att-apply__lbl">변경 기간 <span style="color:var(--color-danger);">*</span></div>
          <div class="att-apply__val" style="flex-direction:column;align-items:stretch;gap:8px;">
            <div class="chip-choice">${periodChips}</div>
            <div class="form-help">현재 날짜 기준 <strong style="color:var(--color-text);">익월 1일</strong>부터 적용 · 대상 기간 <strong style="color:var(--color-text);">${esc(fmtDisp(d.dateFrom))} ~ ${esc(fmtDisp(d.dateTo))}</strong></div>
          </div>
        </div>
        <div class="att-apply__row">
          <div class="att-apply__lbl">사유 <span style="color:var(--color-danger);">*</span></div>
          <div class="att-apply__val">
            <textarea class="input" id="att-shiftchg-reason" rows="3" style="width:100%;" placeholder="근무조 변경 사유를 입력하세요">${esc(d.reason)}</textarea>
          </div>
        </div>
      </div>
    `;
    bindShiftChangeModal(modal);
  }
  function bindShiftChangeModal(modal) {
    const d = STATE.shiftChgDraft;
    const toEl = modal.querySelector('#att-shiftchg-to');
    if (toEl) toEl.addEventListener('change', () => { d.toShift = toEl.value; });
    const r = modal.querySelector('#att-shiftchg-reason');
    if (r) r.addEventListener('input', () => { d.reason = r.value; });
    if (!modal.dataset.attShiftchgBound) {
      modal.dataset.attShiftchgBound = '1';
      modal.addEventListener('click', e => {
        if (e.target === modal) { closeModalEl('modal-att-shiftchg'); return; }
        const pc = e.target.closest('[data-sc-period]');
        if (pc) { const dr = STATE.shiftChgDraft; dr.period = Number(pc.dataset.scPeriod); dr.dateFrom = _nextMonthFirst(); dr.dateTo = _periodEnd(dr.dateFrom, dr.period); renderShiftChangeModal(); return; }
      });
      modal.querySelectorAll('[data-modal-close], [data-att-shiftchg-cancel]').forEach(b => b.addEventListener('click', () => closeModalEl('modal-att-shiftchg')));
      const ok = modal.querySelector('[data-att-shiftchg-submit]');
      if (ok) ok.addEventListener('click', submitShiftChange);
    }
  }
  function submitShiftChange() {
    const d = STATE.shiftChgDraft;
    if (!d.toShift) { window.toast && window.toast('변경할 근무조를 선택해 주세요.', 'warning'); return; }
    if (d.toShift === d.fromShift) { window.toast && window.toast('현재 근무조와 다른 근무조를 선택해 주세요.', 'warning'); return; }
    if (!d.period) { window.toast && window.toast('변경 기간을 선택해 주세요.', 'warning'); return; }
    if (!d.reason || !d.reason.trim()) { window.toast && window.toast('변경 사유를 입력해 주세요.', 'warning'); return; }
    closeModalEl('modal-att-shiftchg');
    const fromSh = App.AttShifts && App.AttShifts.get(d.fromShift);
    const toSh   = App.AttShifts && App.AttShifts.get(d.toShift);
    const fromLabel = fromSh ? (fromSh.label || d.fromShift) : d.fromShift;
    const toLabel   = toSh   ? (toSh.label   || d.toShift)   : d.toShift;
    const period = `${fmtDisp(d.dateFrom)} ~ ${fmtDisp(d.dateTo)} (${d.period}개월)`;
    if (typeof App.openSystemApprovalModal === 'function') {
      App.openSystemApprovalModal({
        docName: '근무조 변경 신청',
        titlePrefix: '근무조 변경',
        codeLabel: '변경',
        nameLabel: '근무조',
        matCode: `${d.fromShift}→${d.toShift}`,
        matName: `${fromLabel} → ${toLabel}`,
        customReasons: ['교대 조정', '개인 사정', '업무 협의', '건강상 사유', '기타'],
        defaultReason: '교대 조정',
        title: `근무조 변경 신청 — ${fromLabel} → ${toLabel} (${period})`,
        content: `${fromLabel} → ${toLabel}\n기간: ${period}\n사유: ${d.reason.trim()}`,
        payload: { fromShift: d.fromShift, toShift: d.toShift, dateFrom: d.dateFrom, dateTo: d.dateTo, months: d.period },
        onSubmit() { window.toast && window.toast('근무조 변경 신청이 상신되었습니다.', 'success'); },
      });
    } else {
      window.toast && window.toast('근무조 변경 신청이 상신되었습니다.', 'success');
    }
  }

  /* =========================================================
   *  품의서 상세 모달 — 캘린더 셀의 📄 또는 신청 내역의 [상세]
   * ========================================================= */
  /* 전자결재 기안 양식의 문서명 — 근태신청서 / 연차·휴가 신청서 / 초과근무(연장·휴일) 신청서 */
  function docNameOf(a) {
    if (a.kind === 'ot') return '초과근무 신청서';
    return a.kind === 'leave' ? '연차·휴가 신청서' : '근태신청서';
  }
  function openDocModal(appId) {
    const app = getApps().find(a => a.id === appId);
    if (!app) return;
    const titleEl = document.getElementById('att-doc-title');
    if (titleEl) {
      /* 전자결재 기안 상세와 동일 포맷 — 기안 상세 · {문서명} · {결재문서번호} */
      titleEl.textContent = `기안 상세 · ${docNameOf(app)} · ${app.docNo || app.no}`;
    }
    const body = document.getElementById('att-doc-body');
    if (body) body.innerHTML = renderDocBody(app);
    bindDocModal(document.getElementById('modal-att-doc'));
    openModalEl('modal-att-doc');
  }
  function renderDocBody(a) {
    const stat = APP_STATUSES[a.status] || { label: a.status, tone: 'muted' };
    /* 초과근무 신청서 — 일자 / 시간 / 근태체크 여부 / 구분 / 사유 만 표기 (인정시간·휴게차감 등 상세 제외) */
    const periodRow = a.kind === 'ot'
      ? `<div class="fm-tbl__row fm-tbl__row--1" style="grid-template-columns:110px 1fr;">
           <div class="fm-tbl__label">일자</div>
           <div class="fm-tbl__value">${esc(fmtDisp(a.date))}</div>
         </div>
         <div class="fm-tbl__row fm-tbl__row--1" style="grid-template-columns:110px 1fr;">
           <div class="fm-tbl__label">시간</div>
           <div class="fm-tbl__value">${esc(a.startTime)} ~ ${esc(a.endTime)}</div>
         </div>
         <div class="fm-tbl__row fm-tbl__row--1" style="grid-template-columns:110px 1fr;">
           <div class="fm-tbl__label">근태체크 여부</div>
           <div class="fm-tbl__value">${a.mealChecked ? '<span class="pill pill--success">예</span>' : '<span class="pill pill--muted">아니오</span>'}</div>
         </div>`
      : `<div class="fm-tbl__row fm-tbl__row--1" style="grid-template-columns:110px 1fr;">
           <div class="fm-tbl__label">신청 기간</div>
           <div class="fm-tbl__value">${a.dateFrom === a.dateTo ? esc(fmtDisp(a.dateFrom)) : esc(fmtDisp(a.dateFrom)) + ' ~ ' + esc(fmtDisp(a.dateTo))}</div>
         </div>`;
    const codeRow = a.kind === 'ot'
      ? `<div class="fm-tbl__row fm-tbl__row--1" style="grid-template-columns:110px 1fr;">
           <div class="fm-tbl__label">구분</div>
           <div class="fm-tbl__value"><span class="pill ${a.otKind === 'holiday' ? 'pill--warning' : 'pill--info'}">${a.otKind === 'holiday' ? '휴일근무' : '연장근무'}</span></div>
         </div>`
      : `<div class="fm-tbl__row fm-tbl__row--1" style="grid-template-columns:110px 1fr;">
           <div class="fm-tbl__label">구분</div>
           <div class="fm-tbl__value">${esc(a.codeLabel || codeLabel(a.code))}</div>
         </div>`;
    /* 결재선 — 시스템 전자결재 기안 상세와 동일한 grid 테이블(단계·결재자·결재·결재일시·의견) */
    const stagesTbl = `
      <table class="grid" style="width:100%;">
        <thead>
          <tr>
            <th style="width:60px;text-align:center;">단계</th>
            <th style="width:140px;">결재자</th>
            <th style="width:100px;text-align:center;">결재</th>
            <th style="width:200px;text-align:center;">결재일시</th>
            <th>의견</th>
          </tr>
        </thead>
        <tbody>
          ${(a.approvers || []).length ? a.approvers.map((s, idx) => `
            <tr>
              <td class="col-center">${idx + 1}차</td>
              <td>${esc(s.name)}</td>
              <td class="col-center"><span class="pill pill--${s.status === '결재' ? 'success' : s.status === '반려' ? 'danger' : 'warning'}">${esc(s.status)}</span></td>
              <td class="col-center">${s.at ? esc(fmtDisp(s.at)) : '<span class="t-muted">—</span>'}</td>
              <td>${s.comment ? esc(s.comment) : '<span class="t-muted">—</span>'}</td>
            </tr>
          `).join('') : `<tr><td colspan="5" class="col-center" style="padding:20px;color:var(--color-text-muted);">결재선이 지정되지 않았습니다.</td></tr>`}
        </tbody>
      </table>`;

    /* 첨부 파일 — 시스템 전자결재 기안 상세와 동일한 .dz-list / .dz-file + 다운로드(도메인 표준 App.downloadFile) */
    const files = a.files || [];
    const fmtSize = (n) => {
      if (typeof n !== 'number') return n || '';
      if (n < 1024) return n + ' B';
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
      return (n / 1024 / 1024).toFixed(1) + ' MB';
    };
    const attachmentsHTML = files.length
      ? `<div class="dz-list" style="margin-bottom:18px;">
          ${files.map(f => `
            <div class="dz-file">
              <span>📄</span>
              <span class="dz-file__name">${esc(f.name)}</span>
              <span class="dz-file__size">${esc(fmtSize(f.size))}</span>
              <button type="button" class="btn btn--xs btn--soft-primary" data-att-doc-download="${esc(f.name)}" style="margin-left:auto;">다운로드</button>
            </div>`).join('')}
        </div>`
      : `<div class="t-muted" style="margin-bottom:18px;font-size:var(--fs-sm);">첨부 파일이 없습니다.</div>`;

    return `
      <div class="fm-tbl" style="border:1px solid var(--color-divider);border-radius:var(--radius-md);margin-bottom:18px;">
        <div class="fm-tbl__row fm-tbl__row--2">
          <div class="fm-tbl__label">결재문서번호</div>
          <div class="fm-tbl__value"><a class="link-code">${esc(a.docNo || a.no)}</a></div>
          <div class="fm-tbl__label">신청번호</div>
          <div class="fm-tbl__value">${esc(a.no)}</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--2">
          <div class="fm-tbl__label">문서명</div>
          <div class="fm-tbl__value">${esc(docNameOf(a))}</div>
          <div class="fm-tbl__label">상태</div>
          <div class="fm-tbl__value"><span class="pill pill--${stat.tone}">${esc(stat.label)}</span></div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--2">
          <div class="fm-tbl__label">기안자</div>
          <div class="fm-tbl__value">${esc(a.empName)} <span class="t-muted" style="margin-left:4px;">${esc(a.empId)}</span></div>
          <div class="fm-tbl__label">부서</div>
          <div class="fm-tbl__value">${esc(a.empDept)}</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" style="grid-template-columns:110px 1fr;">
          <div class="fm-tbl__label">기안일시</div>
          <div class="fm-tbl__value">${esc(fmtDisp(a.submittedAt) || '-')}</div>
        </div>
      </div>

      <div style="margin:18px 0 8px;"><strong>${esc(docNameOf(a))} 상세</strong></div>
      <div class="fm-tbl" style="border:1px solid var(--color-divider);border-radius:var(--radius-md);margin-bottom:18px;">
        ${a.kind === 'ot' ? periodRow + codeRow : codeRow + periodRow}
        <div class="fm-tbl__row fm-tbl__row--1" style="grid-template-columns:110px 1fr;">
          <div class="fm-tbl__label">사유</div>
          <div class="fm-tbl__value">${esc(a.reason)}</div>
        </div>
        ${a.statusReason ? `<div class="fm-tbl__row fm-tbl__row--1" style="grid-template-columns:110px 1fr;">
          <div class="fm-tbl__label">상태 사유</div>
          <div class="fm-tbl__value">${esc(a.statusReason)}</div>
        </div>` : ''}
      </div>

      <div style="margin-bottom:8px;"><strong>첨부 파일 (${files.length}건)</strong></div>
      ${attachmentsHTML}

      <div style="margin-bottom:8px;"><strong>결재선 — 단계별 상태</strong></div>
      ${stagesTbl}
    `;
  }
  function bindDocModal(modal) {
    if (!modal) return;
    if (!modal.dataset.attDocBound) {
      modal.dataset.attDocBound = '1';
      modal.addEventListener('click', e => { if (e.target === modal) closeModalEl('modal-att-doc'); });
      modal.querySelectorAll('[data-modal-close], [data-att-doc-close]').forEach(b => b.addEventListener('click', () => closeModalEl('modal-att-doc')));
      /* 첨부 파일 다운로드 — 도메인 표준 App.downloadFile */
      modal.addEventListener('click', e => {
        const dl = e.target.closest('[data-att-doc-download]');
        if (dl) { e.preventDefault(); if (typeof App.downloadFile === 'function') App.downloadFile(dl.dataset.attDocDownload, { context: '근태 신청 첨부파일' }); }
      });
    }
  }

  /* ============ 모달 공통 ============ */
  function openModalEl(id) { const m = document.getElementById(id); if (!m) return; m.classList.add('is-open'); document.body.style.overflow = 'hidden'; }
  function closeModalEl(id) { const m = document.getElementById(id); if (m) m.classList.remove('is-open'); if (!document.querySelector('.modal-backdrop.is-open')) document.body.style.overflow = ''; }

  /* =========================================================
   *  Page Init
   * ========================================================= */
  function initPage() {
    const pageEl = document.getElementById('page-att-status');
    if (!pageEl) return;
    pageEl.__onShow = () => {
      syncEmpList();   // 임직원 관리 명단과 재동기화
      if (!pageEl.dataset.attShellMounted) {
        pageEl.dataset.attShellMounted = '1';
        renderShell(pageEl);
        bind(pageEl);
        STATE.lastRefreshAt = nowHMS();
      }
      renderAll(pageEl);
    };
  }

  /* =========================================================
   *  공용 모달 — 직원별 근태 현황 / 통계 항목 대상자 목록
   * ========================================================= */
  function ensureAttModal() {
    if (document.getElementById('att-modal')) return;
    const html = `
<div class="modal-backdrop" id="att-modal" data-modal-id="att-modal" style="z-index:1200;">
  <div class="modal modal--lg" style="width:92vw;max-width:1040px;height:86vh;max-height:880px;display:flex;flex-direction:column;">
    <div class="modal__header">
      <div class="modal__title" data-att-modal-title>근태 현황</div>
      <button class="modal__close" type="button" data-att-modal-close aria-label="닫기">✕</button>
    </div>
    <div class="modal__body" data-att-modal-body style="flex:1;min-height:0;overflow:auto;background:var(--color-surface-alt);padding:18px;"></div>
  </div>
</div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    const modal = document.getElementById('att-modal');
    /* 연/월 피커(App.YmPicker) 월 선택 — 임직원 상세 모달(캘린더/신청내역 공용). 모달은 body 직속이라 여기서 수신 */
    modal.addEventListener('ympick:change', (e) => {
      if (e.detail.name !== 'emp') return;
      STATE.modalYm = e.detail.ym;
      STATE.modalDailyFilter = null;
      modal.querySelector('[data-att-modal-body]').innerHTML = renderEmpModalBody();
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-att-modal-close]')) {
        modal.classList.remove('is-open');
        if (!document.querySelector('.modal-backdrop.is-open')) document.body.style.overflow = '';
        return;
      }
      /* 대상자 목록에서 성명 클릭 → 같은 모달에 직원별 근태 현황 표시 */
      const empLink = e.target.closest('[data-att-emp-open]');
      if (empLink) { e.preventDefault(); openEmpDetailModal(empLink.dataset.attEmpOpen); return; }

      /* 직원별 모달 — 탭/뷰 전환 */
      const empTab = e.target.closest('[data-att-emp-tab]');
      if (empTab) { STATE.modalTab = empTab.dataset.attEmpTab; STATE.modalDailyFilter = null; modal.querySelector('[data-att-modal-body]').innerHTML = renderEmpModalBody(); return; }
      const empView = e.target.closest('[data-att-emp-view]');
      if (empView) { STATE.modalView = empView.dataset.attEmpView; STATE.modalDailyFilter = null; modal.querySelector('[data-att-modal-body]').innerHTML = renderEmpModalBody(); return; }
      /* 직원별 모달 — 캘린더 월 이동(과거 조회) */
      if (e.target.closest('[data-att-emp-ym-prev]'))  { STATE.modalYm = shiftMonth(STATE.modalYm || STATE.ym, -1); STATE.modalDailyFilter = null; modal.querySelector('[data-att-modal-body]').innerHTML = renderEmpModalBody(); return; }
      if (e.target.closest('[data-att-emp-ym-next]'))  { STATE.modalYm = shiftMonth(STATE.modalYm || STATE.ym, +1); STATE.modalDailyFilter = null; modal.querySelector('[data-att-modal-body]').innerHTML = renderEmpModalBody(); return; }
      if (e.target.closest('[data-att-emp-ym-today]')) { STATE.modalYm = TODAY.slice(0, 7); STATE.modalDailyFilter = null; modal.querySelector('[data-att-modal-body]').innerHTML = renderEmpModalBody(); return; }

      /* 직원별 모달 — 대시보드 탭 일자별 기록 정렬 전환 */
      if (e.target.closest('[data-att-modal-daily-sort]')) {
        STATE.modalDailySort = STATE.modalDailySort === 'desc' ? 'asc' : 'desc';
        modal.querySelector('[data-att-modal-body]').innerHTML = renderEmpModalBody();
        return;
      }
      /* 직원별 모달 — 대시보드 지각/조퇴 KPI 클릭 → 아래 근태 상세내역 필터(재클릭 해제) */
      if (e.target.closest('[data-att-emp-le-clear]')) {
        STATE.modalDailyFilter = null;
        modal.querySelector('[data-att-modal-body]').innerHTML = renderEmpModalBody();
        return;
      }
      const empLe = e.target.closest('[data-att-emp-le]');
      if (empLe) {
        const kind = empLe.dataset.attEmpLe;
        STATE.modalDailyFilter = (STATE.modalDailyFilter === kind) ? null : kind;
        modal.querySelector('[data-att-modal-body]').innerHTML = renderEmpModalBody();
        return;
      }
      /* 직원별 모달 — 대시보드 탭 일자별 근태 기록 다운로드 */
      const mDaily = e.target.closest('[data-att-modal-daily-dl]');
      if (mDaily) { e.preventDefault(); dlEmpDaily(mDaily.dataset.attModalDailyDl, STATE.modalYm || STATE.ym); return; }
      /* 직원별 모달 — 신청 내역 탭 다운로드(표시 전체) */
      const mApps = e.target.closest('[data-att-modal-apps-dl]');
      if (mApps) { e.preventDefault(); dlEmpApps(mApps.dataset.attModalAppsDl, false); return; }

      /* 직원별 모달 — 신청 내역 상세(품의서) */
      const docBtn = e.target.closest('[data-att-doc-open]');
      if (docBtn) { e.stopPropagation(); openDocModal(docBtn.dataset.attDocOpen); return; }
      const appRow = e.target.closest('[data-att-emp-app-row]');
      if (appRow && !e.target.closest('button, a, input, select, textarea, label')) {
        const sel = window.getSelection && window.getSelection();
        if (sel && sel.type === 'Range' && String(sel).length > 0) return;
        openDocModal(appRow.dataset.attEmpAppRow);
        return;
      }
    });
  }
  function openAttModal(title, bodyHTML) {
    ensureAttModal();
    const modal = document.getElementById('att-modal');
    modal.querySelector('[data-att-modal-title]').textContent = title;
    modal.querySelector('[data-att-modal-body]').innerHTML = bodyHTML;
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  /* 지각/조퇴 기록 리스트 모달 — 본인/직원 근태현황의 지각·조퇴 클릭 시.
     opts: { name?, periodLabel?, recs:[근태레코드], kind:'late'|'early' } */
  function openLateEarlyModal(opts) {
    opts = opts || {};
    const isLate = opts.kind !== 'early';
    const field = isLate ? 'lateMin' : 'earlyMin';
    const label = isLate ? '지각' : '조퇴';
    const recs = (opts.recs || [])
      .filter(r => r && r.kind === 'work' && (r[field] || 0) > 0)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const totalMin = recs.reduce((s, r) => s + (r[field] || 0), 0);
    const rows = recs.length
      ? recs.map(r => `<tr>
          <td>${esc(fmtDateDow ? fmtDateDow(r.date) : r.date)}</td>
          <td style="text-align:center;">${esc(r.checkIn || '-')}</td>
          <td style="text-align:center;">${esc(r.checkOut || '-')}</td>
          <td style="text-align:right;color:var(--color-warning);font-weight:var(--fw-medium);white-space:nowrap;">${r[field]}분</td>
        </tr>`).join('')
      : `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--color-text-muted);">${label} 기록이 없습니다.</td></tr>`;
    const meta = [opts.name ? `<strong style="color:var(--color-text);">${esc(opts.name)}</strong>` : '', opts.periodLabel ? esc(opts.periodLabel) : '']
      .filter(Boolean).join(' · ');
    const body = `
      <div style="margin-bottom:10px;font-size:var(--fs-sm);color:var(--color-text-sub);">
        ${meta ? meta + ' · ' : ''}${label} <strong style="color:var(--color-warning);">${recs.length}회</strong>${recs.length ? ` (총 ${totalMin}분)` : ''}
      </div>
      <table class="tbl tbl--bordered" style="width:100%;">
        <thead><tr>
          <th>일자</th>
          <th style="width:84px;text-align:center;">출근</th>
          <th style="width:84px;text-align:center;">퇴근</th>
          <th style="width:96px;text-align:right;">${label}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    openAttModal(`${label} 기록`, body);
  }

  /* 직원별 근태 현황 — 나의 근태현황 미러: 근태 현황(캘린더/대시보드) + 신청 내역 탭 */
  function openEmpDetailModal(empId) {
    const emp = EMP_LIST.find(e => e.id === empId);
    if (!emp) return;
    STATE.modalEmpId = empId;
    STATE.modalTab = 'status';
    STATE.modalView = 'cal';
    STATE.modalYm = STATE.ym;
    STATE.modalDailyFilter = null;
    const meta = `${emp.name}·${emp.id}·${emp.dept}·${emp.rank || '-'}·${emp.position || '-'}`;
    openAttModal(`직원별 근태 현황 (${meta})`, renderEmpModalBody());
  }
  function renderEmpModalBody() {
    const empId = STATE.modalEmpId;
    const emp = EMP_LIST.find(e => e.id === empId);
    if (!emp) return '';
    const tabs = [['status', '근태 현황'], ['apps', '신청 내역']];
    /* 이름 뱃지는 모달 타이틀로 이동 — 본문 상단은 탭만 노출(상단 여백 축소) */
    const head = `
      <div class="att-scope-tabs" style="margin:-8px -18px 14px;background:transparent;">
        ${tabs.map(([k, l]) => `<button type="button" class="att-scope-tab ${STATE.modalTab === k ? 'is-active' : ''}" data-att-emp-tab="${k}">${esc(l)}</button>`).join('')}
      </div>
    `;
    return head + (STATE.modalTab === 'apps' ? renderEmpAppsTable(empId, ['att', 'ot']) : renderEmpStatusTab(empId));
  }
  function renderEmpStatusTab(empId) {
    const ym = STATE.modalYm || STATE.ym;
    const recs = getRecords(empId, ym);
    const s = monthStats(recs);
    const view = STATE.modalView;
    /* 월 이동 ‹오늘› + 연월 + 캘린더/대시보드 토글을 한 줄 좌측 정렬.
       월 이동은 두 뷰 모두에서 항상 노출 — 대시보드로 전환해도 조회 월(연월)은 유지된다. */
    const toggle = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <div class="att-tb__nav">
          <button type="button" data-att-emp-ym-prev aria-label="이전 달">‹</button>
          <button type="button" data-att-emp-ym-today>오늘</button>
          <button type="button" data-att-emp-ym-next aria-label="다음 달">›</button>
        </div>
        ${App.YmPicker.html({ name: 'emp', ym: ym, todayYm: TODAY.slice(0, 7) })}
        <div class="att-tb__views">
          <button type="button" data-att-emp-view="cal"  class="${view === 'cal'  ? 'is-active' : ''}">캘린더</button>
          <button type="button" data-att-emp-view="dash" class="${view === 'dash' ? 'is-active' : ''}">대시보드</button>
        </div>
      </div>`;
    /* 나의 근태현황과 동일: 캘린더 = 달력만 / 대시보드 = KPI 카드 + 일자별 기록 표 */
    if (view === 'cal') return toggle + renderCalendar(empId, recs, ym);
    return toggle + renderEmpKpiCards(s) + renderEmpDailyTable(empId, recs, ym);
  }
  /* 나의 근태현황(page-att-my-work) renderKpiCards 와 동일 카드 구성 */
  function renderEmpKpiCards(s) {
    const items = [
      { label: '근무일수',     val: s.workDays, suffix: '일', tone: 'brand' },
      { label: '지각',         val: s.lateCnt,  suffix: '회', tone: s.lateCnt > 0 ? 'warn' : 'muted',
        sub: s.lateCnt > 0 ? `총 ${s.lateMin}분` : '', le: s.lateCnt > 0 ? 'late' : '' },
      { label: '조퇴',         val: s.earlyCnt, suffix: '회', tone: s.earlyCnt > 0 ? 'warn' : 'muted',
        sub: s.earlyCnt > 0 ? `총 ${s.earlyMin}분` : '', le: s.earlyCnt > 0 ? 'early' : '' },
      { label: '결근',         val: s.absCnt,   suffix: '일', tone: s.absCnt > 0 ? 'danger' : 'muted' },
      { label: '연장 근무',    val: s.otExtra.toFixed(1),      suffix: 'h', tone: 'brand' },
      { label: '야간 근무',    val: s.otNight.toFixed(1),      suffix: 'h', tone: 'brand' },
      { label: '야간 연장 근무', val: (s.otNightExtra || 0).toFixed(1), suffix: 'h', tone: 'brand' },
      { label: '휴일 근무',    val: s.otHoliday.toFixed(1),    suffix: 'h', tone: 'muted' },
    ];
    return `
      <div class="att-kpi">
        ${items.map(it => `
          <div class="att-kpi__card att-kpi__card--${it.tone}${it.le && STATE.modalDailyFilter === it.le ? ' is-active' : ''}"${it.le ? ` data-att-emp-le="${it.le}" role="button" tabindex="0" title="${esc(it.label)} 내역 필터 (재클릭 시 해제)" style="cursor:pointer;"` : ''}>
            <div class="att-kpi__label">${esc(it.label)}</div>
            <div class="att-kpi__value">${it.val}<small>${esc(it.suffix)}</small></div>
            ${it.sub ? `<div class="att-kpi__sub">${esc(it.sub)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }
  /* 나의 근태현황 일자별 기록 표와 동일 컬럼(날짜·구분·출근·퇴근·지각·조퇴·연장·야간·야간연장·휴일·비고).
     관리자 시점이므로 본인 전용 사유서/신청서 작성 버튼(비고)은 표시하지 않는다. */
  function renderEmpDailyTable(empId, recs, ymArg) {
    const ym = ymArg || STATE.ym;
    const dashV = '<span class="t-muted">-</span>';
    const hourCell = (v) => (v && v > 0) ? `${v.toFixed(1)}h` : dashV;
    const minCell  = (v) => (v && v > 0) ? `${v}분` : dashV;
    const sorted = recs.slice().sort((a, b) => STATE.modalDailySort === 'desc'
      ? (b.date || '').localeCompare(a.date || '')
      : (a.date || '').localeCompare(b.date || ''));
    /* 대시보드 KPI(지각/조퇴) 클릭 필터 — 해당 기록만 노출. 미선택 시 전체. */
    const filtered = STATE.modalDailyFilter === 'late'  ? sorted.filter(r => r.isLate)
                   : STATE.modalDailyFilter === 'early' ? sorted.filter(r => r.isEarly)
                   : sorted;
    const rows = filtered.map(r => {
      const dateCell = esc(fmtDateDow ? fmtDateDow(r.date) : r.date);
      let gubun = dashV, gubunColor = '';
      let ci = dashV, co = dashV, late = dashV, early = dashV, ext = dashV, night = dashV, nightExt = dashV, hol = dashV;
      let bigo = '';
      if (r.kind === 'work') {
        gubun = '출근';
        ci = esc(r.checkIn || '-'); co = esc(r.checkOut || '-');
        late = minCell(r.lateMin); early = minCell(r.earlyMin);
        ext = hourCell(r.ot && r.ot.extra); night = hourCell(r.ot && r.ot.night);
        hol = hourCell(r.ot && r.ot.holiday);
      } else if (r.kind === 'att') {
        const code = r.code || '';
        const isAbsent = code === 'HOLG02' || code === 'HOLG03';
        gubun = isAbsent ? '결근' : '휴가';
        gubunColor = isAbsent ? 'var(--color-danger)' : 'var(--color-info)';
        ci = r.checkIn ? esc(r.checkIn) : dashV;
        co = r.checkOut ? esc(r.checkOut) : dashV;
        bigo = esc((codeLabel && codeLabel(code)) || r.label || '');
      } else if (r.kind === 'holiday') {
        gubun = '휴일'; gubunColor = 'var(--color-text-muted)';
        hol = hourCell(r.holWork);
        bigo = esc(r.label || '');
      } else if (r.kind === 'future') {
        gubun = '예정'; gubunColor = 'var(--color-text-muted)';
      }
      return `<tr>
        <td>${dateCell}</td>
        <td${gubunColor ? ` style="color:${gubunColor};font-weight:var(--fw-medium);"` : ''}>${gubun}</td>
        <td>${ci}</td>
        <td>${co}</td>
        <td style="text-align:right;">${late}</td>
        <td style="text-align:right;">${early}</td>
        <td style="text-align:right;">${ext}</td>
        <td style="text-align:right;">${night}</td>
        <td style="text-align:right;">${nightExt}</td>
        <td style="text-align:right;">${hol}</td>
        <td>${bigo || dashV}</td>
      </tr>`;
    }).join('');
    return `
      <div class="table-card table-card--mt">
        <div class="table-card__cap"><strong>${fmtYM(ym)} 근태 상세내역</strong>${STATE.modalDailyFilter ? `<span class="pill pill--warning" style="font-size:11px;">${STATE.modalDailyFilter === 'late' ? '지각' : '조퇴'}만 보기</span><button type="button" class="btn btn--xs" data-att-emp-le-clear>필터 해제</button>` : ''}<span class="t-muted" style="font-size:var(--fs-xs);">${filtered.length}일</span><span class="table-card__cap-spacer"></span><button class="btn btn--xs" type="button" data-att-modal-daily-dl="${esc(empId)}" title="${fmtYM(ym)} 근태 상세내역 다운로드">${(window.Icons && window.Icons.download) || '↓'} 근태 상세내역 다운로드</button></div>
        <div class="table-card__body">
        <table class="prs-editor__table prs-editor__table--wide" style="width:100%;">
          <thead>
            <tr>
              <th style="width:104px;"><button class="th-sort ${STATE.modalDailySort === 'asc' ? 'is-asc' : 'is-desc'}" type="button" data-att-modal-daily-sort>날짜<span class="th-sort__ico" aria-hidden="true"></span></button></th>
              <th style="width:60px;">구분</th>
              <th style="width:66px;">출근</th>
              <th style="width:66px;">퇴근</th>
              <th style="width:60px;text-align:right;">지각</th>
              <th style="width:60px;text-align:right;">조퇴</th>
              <th style="width:60px;text-align:right;">연장</th>
              <th style="width:60px;text-align:right;">야간</th>
              <th style="width:76px;text-align:right;">야간연장</th>
              <th style="width:60px;text-align:right;">휴일</th>
              <th>비고</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        </div>
      </div>
    `;
  }
  /* 직원별 신청 내역 테이블 — 근태 모달(att/ot) 공용. 상태/상태 사유 컬럼 포함 */
  function renderEmpAppsTable(empId, kinds) {
    const ym = STATE.modalYm || STATE.ym;
    const inMonth = (a) => {
      const from = (a.kind === 'ot' ? a.date : a.dateFrom) || '';
      const to   = (a.kind === 'ot' ? a.date : (a.dateTo || a.dateFrom)) || '';
      return from.slice(0, 7) === ym || to.slice(0, 7) === ym;
    };
    const list = appsForEmp(empId).filter(a => kinds.indexOf(a.kind) >= 0 && inMonth(a));
    list.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
    const n = list.length;
    const rows = n ? list.map((a, i) => {
      const isOt = a.kind === 'ot';
      const stat = APP_STATUSES[a.status] || { label: a.status, tone: 'muted' };
      const kindPill = isOt ? `<span class="pill pill--warning">초과근무</span>` : `<span class="pill pill--info">근태</span>`;
      const typeMain = isOt ? (a.otKind === 'holiday' ? '휴일근무' : '연장근무') : (a.codeLabel || codeLabel(a.code));
      /* 종류는 명칭만 — 사유(초과근무=reasonCode / 근태=reason)는 사유 컬럼에만 노출(종류 중복 표기 금지) */
      const typeCol  = esc(typeMain);
      const reasonText = isOt ? (a.reasonCode || a.reason || '') : (a.reason || '');
      const dateCol = isOt
        ? `${esc(fmtDisp(a.date))} <span class="t-muted">${esc(a.startTime)}~${esc(a.endTime)}</span>`
        : (a.dateFrom === a.dateTo ? esc(fmtDisp(a.dateFrom)) : `${esc(fmtDisp(a.dateFrom))} ~ ${esc(fmtDisp(a.dateTo))}`);
      return `
        <tr class="is-clickable" data-att-emp-app-row="${esc(a.id)}">
          <td style="text-align:right;">${n - i}</td>
          <td>${esc(a.no)}</td>
          <td style="text-align:center;"><a class="link-code" href="javascript:;" data-att-doc-open="${esc(a.id)}" title="결재문서 보기">${esc(a.docNo || a.no)}</a></td>
          <td style="text-align:center;">${kindPill}</td>
          <td style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${typeCol}</td>
          <td style="white-space:nowrap;">${dateCol}</td>
          <td style="word-break:keep-all;overflow-wrap:anywhere;">${esc(reasonText)}</td>
          <td style="text-align:center;"><span class="pill pill--${stat.tone}">${esc(stat.label)}</span></td>
          <td style="word-break:keep-all;overflow-wrap:anywhere;">${a.status === 'rejected' ? esc(a.statusReason || '') : '<span class="t-muted">-</span>'}</td>
          <td style="white-space:nowrap;">${esc(fmtDisp(a.submittedAt))}</td>
        </tr>`;
    }).join('') : `<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--color-text-muted);">표시할 신청 내역이 없습니다.</td></tr>`;
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="att-tb__nav">
            <button type="button" data-att-emp-ym-prev aria-label="이전 달">‹</button>
            <button type="button" data-att-emp-ym-today>오늘</button>
            <button type="button" data-att-emp-ym-next aria-label="다음 달">›</button>
          </div>
          ${App.YmPicker.html({ name: 'emp', ym: ym, todayYm: TODAY.slice(0, 7), labelStyle: 'font-size:var(--fs-lg);' })}
        </div>
        <button class="btn btn--sm" type="button" data-att-modal-apps-dl="${esc(empId)}" title="신청 내역 다운로드">${(window.Icons && window.Icons.download) || '↓'} 신청내역 다운로드</button>
      </div>
      <div style="overflow:auto;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);">
        <table class="tbl tbl--hover" style="min-width:1380px;table-layout:fixed;">
          <thead>
            <tr>
              <th style="width:48px;text-align:right;">No</th>
              <th style="width:130px;">신청번호</th>
              <th style="width:120px;text-align:center;">결재문서</th>
              <th style="width:80px;text-align:center;">구분</th>
              <th style="width:220px;">종류</th>
              <th style="width:190px;white-space:nowrap;">신청 일자/시간</th>
              <th style="width:220px;">사유</th>
              <th style="width:80px;text-align:center;">상태</th>
              <th style="width:200px;">상태 사유</th>
              <th style="width:140px;white-space:nowrap;">상신 일시</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  /* 통계 항목별 대상자 집계 (현재 선택 범위: 전체 또는 부서) */
  function empMetric(recs, cat) {
    let count = 0, amount = 0;
    recs.forEach(r => {
      if (cat === 'late'  && r.kind === 'work' && r.isLate)  { count++; amount += r.lateMin || 0; }
      else if (cat === 'early' && r.kind === 'work' && r.isEarly) { count++; amount += r.earlyMin || 0; }
      else if (cat === 'extra' && r.kind === 'work' && r.ot && r.ot.extra) { count++; amount += r.ot.extra; }
      else if (cat === 'night' && r.kind === 'work' && r.ot && r.ot.night) { count++; amount += r.ot.night; }
      else if (cat === 'nightExtra' && r.kind === 'work' && r.ot && r.ot.nightExtra) { count++; amount += r.ot.nightExtra; }
      else if (cat === 'abs' && r.kind === 'att' && (r.code === 'HOLB01' || r.code === 'HOLG02' || r.code === 'HOLG03')) { count++; amount += 1; }
      else if (cat === 'holiday') {
        if (r.kind === 'holiday' && r.holWork) { count++; amount += r.holWork; }
        if (r.kind === 'work' && r.ot && r.ot.holiday) { count++; amount += r.ot.holiday; }
      }
    });
    return { count, amount };
  }
  function openStatTargetModal(cat) {
    const META = {
      late:       { label: '지각',         unit: 'min' },
      early:      { label: '조퇴',         unit: 'min' },
      abs:        { label: '결근',         unit: 'day' },
      extra:      { label: '연장 근무',    unit: 'h' },
      night:      { label: '야간 근무',    unit: 'h' },
      nightExtra: { label: '야간 연장 근무', unit: 'h' },
      holiday:    { label: '휴일 근무',    unit: 'h' },
    };
    const meta = META[cat] || META.late;
    const scopeEmps = selectedEmps();
    const scopeName = selectedScopeName();
    /* 부서 주간뷰에서 클릭한 통계는 이번 주(월~일) 범위로 대상자를 집계 — 카드 값과 일치 */
    const isWeekScope = STATE.selectedDeptId && STATE.selectedDeptId !== 'C0' && STATE.deptMode === 'week';
    const wkDates = isWeekScope ? weekDates(currentWeekMonday()) : null;
    const periodLabel = isWeekScope
      ? (() => { const wk = weekOfMonthInfo(currentWeekMonday()); return `${fmtYM(wk.ym)} ${wk.week}주차`; })()
      : fmtYM(STATE.ym);
    const rows = scopeEmps.map(e => {
      const mt = empMetric(isWeekScope ? weekRecordsOf(e.id, wkDates) : getRecords(e.id, STATE.ym), cat);
      return { emp: e, ...mt };
    }).filter(r => r.count > 0).sort((a, b) => b.amount - a.amount);

    const valCell = (r) => meta.unit === 'min'
      ? `${r.count}회 · <strong>${r.amount}분</strong>`
      : meta.unit === 'day'
      ? `<strong>${r.count}일</strong>`
      : `${r.count}일 · <strong>${r.amount.toFixed(1)}h</strong>`;
    const tbody = rows.length
      ? rows.map((r, i) => `
        <tr>
          <td style="text-align:right;color:var(--color-text-muted);">${i + 1}</td>
          <td>${esc(r.emp.id)}</td>
          <td><div style="display:flex;align-items:center;gap:8px;min-width:0;"><span class="ssw-tbl__ava" style="width:24px;height:24px;flex:0 0 auto;">${esc((r.emp.name || '').slice(0, 1))}</span><a href="#" data-att-emp-open="${esc(r.emp.id)}" style="color:var(--color-brand-primary);font-weight:var(--fw-medium);white-space:nowrap;">${esc(r.emp.name)}</a>${(() => { const p = [r.emp.rank, r.emp.position].filter(Boolean); return p.length ? `<span style="display:inline-flex;align-items:center;">${p.map(v => `<span style="color:var(--color-text-muted);font-size:var(--fs-xs);white-space:nowrap;">${esc(v)}</span>`).join(`<span style="color:var(--color-text-muted);font-size:var(--fs-xs);">·</span>`)}</span>` : ''; })()}</div></td>
          <td>${esc(r.emp.dept)}</td>
          <td style="text-align:right;">${valCell(r)}</td>
        </tr>`).join('')
      : `<tr><td colspan="5" style="text-align:center;color:var(--color-text-muted);padding:24px;">해당 대상자가 없습니다.</td></tr>`;

    const body = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
        <span class="pill pill--info">${esc(meta.label)}</span>
        <span class="t-muted" style="font-size:var(--fs-sm);">${esc(scopeName)} · ${esc(periodLabel)} · 대상 ${rows.length}명</span>
      </div>
      <div class="table-card">
        <div class="table-card__body">
          <table class="tbl tbl--hover">
            <thead><tr>
              <th style="width:40px;text-align:right;">No</th>
              <th style="width:120px;">사번</th>
              <th style="width:110px;">성명</th>
              <th>부서</th>
              <th style="width:160px;text-align:right;">${esc(meta.label)}</th>
            </tr></thead>
            <tbody>${tbody}</tbody>
          </table>
        </div>
      </div>
      <div style="margin-top:8px;font-size:var(--fs-xs);color:var(--color-text-muted);">성명을 클릭하면 직원별 근태 현황을 볼 수 있습니다.</div>
    `;
    openAttModal(`${meta.label} 대상자`, body);
  }

  /* =========================================================
   *  공용 헬퍼 노출 — 나의 근무현황(page-att-my-work) 등에서 재사용
   * ========================================================= */
  App.AttStatus = {
    EMP_LIST,
    DEPTS,
    /* 임직원 관리 명단과 재동기화 — 연차/근무스케줄 현황 진입 시 호출. 변경 시 true 반환 */
    syncEmpList,
    ATT_GROUPS, HOL_GROUPS,
    APP_STATUSES,
    VIEW_MODES,
    codeLabel, codeShortLabel, codeGroupLabel, isHalfDay,
    /* 신청 내역 '결재문서' 컬럼 — 문서명 표기용(근태신청서/연차·휴가 신청서/연장·휴일근무 신청서) */
    docNameOf,
    /* 캘린더 셀 블록 공용 헬퍼 — 나의/부서별 근태현황, 부서별 연차현황 통일 */
    calShiftColorCls, calShiftChip, calBlock, calLeaveLabel, calShiftMismatch,
    getRecords, monthStats,
    ymd, pad2, parseYM, daysInMonth, isWeekend, fmtDateDow,
    nowHMS,
    TODAY,
    shiftChipHTML, shiftCodeForDate,
    ME: { id: ME_ID, name: ME_NAME, dept: ME_DEPT, pos: ME_POS, shift: ME_SHIFT, jobCat: ME_JOBCAT },
    /* 대체 휴가 — 사무직 휴일근무로 발생. 나의 연차현황에서 별도 카드로 노출 */
    compLeave: () => ({ earned: COMP_LEAVE.earned, used: COMP_LEAVE.used, balance: compLeaveBalance() }),
    /* 신청 모달 — 「나의 근태현황(page-att-my-work)」 toolbar 에서 호출 */
    openApplyModal, openOtModal, openShiftChangeModal,
    /* 품의서(신청 문서) — 캘린더 셀 배지/상세 모달. 나의 근태현황에서 재사용 */
    appsByDate, openDocModal,
    /* 본인 신청 내역 — 「나의 근태현황」의 '근태 신청 현황' 인페이지 탭에서 재사용 */
    myApps, APP_STATUSES,
    /* 직원별 신청 내역 + 상태 수정(인사팀) — 부서별 근태/연차현황 모달에서 재사용 */
    appsForEmp, setAppStatus, isHR,
    /* 지각/조퇴 기록 리스트 모달 — 나의 근태현황에서도 호출 */
    openLateEarlyModal,
    /* 신청 회수(승인 전) / 취소 신청(승인 후, 전자결재) — 나의 근태/연차현황에서 호출 */
    canWithdraw, canCancel, withdrawApp, requestCancelApp,
  };
  const prev = App.initPages;
  App.initPages = function () {
    if (typeof prev === 'function') prev();
    initPage();
  };
})();
