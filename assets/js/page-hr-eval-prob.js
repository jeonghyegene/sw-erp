/* =========================================================
 * Page: HR > 평가 관리 > 수습 평가
 *
 *  개요
 *   - probation=true 인 직원만 다루는 전용 평가 흐름. 평가 회차/유형 설정 불필요.
 *   - 수습 종료일 - TODAY ≤ AUTO_DAYS (=14) 이 되면 평가 세션 자동 생성.
 *   - 직책자 / 비직책자 두 가지 고정 양식 — 시스템 제공, admin 수정 불가.
 *   - 결과: 전환 / 보류 / 미전환 — App.HRProbEval.getResult 로 외부 조회 가능.
 *
 *  View
 *   1) list    — 수습 직원 표 + 검색/필터
 *   2) modal   — 한 직원의 평가 입력 폼 (likert + 코멘트 + 결과 선택)
 *
 *  UI Kit 재사용
 *   .toolbar / .tbl / .pill / .progress / .pagination
 *   .modal / .modal--xl / .modal-backdrop
 *   .likert (입력 모드)
 *   .input / textarea.input
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  /* ============ 환경 ============ */
  const TODAY = '2026-05-18';
  const AUTO_DAYS = 14;   /* 수습 종료 N일 이내 진입 시 자동 생성 */

  /* ============ 척도별 기본 명칭 ============
   * 평가요소 설정(page-hr-eval-element) 의 DEFAULT_SCALE_LABELS 와 동일 체계.
   * 양식별 scaleLabels 미지정 시 fallback. */
  const DEFAULT_SCALE_LABELS = {
    3: ['낮음', '보통', '높음'],
    5: ['매우 미흡', '미흡', '보통', '우수', '매우 우수'],
    7: ['매우 미흡', '미흡', '다소 미흡', '보통', '다소 우수', '우수', '매우 우수'],
  };

  /* ============ 고정 템플릿 ============
   *   직책자 / 비직책자 분기. items.id 는 템플릿 키 prefix 로 충돌 방지.
   *   scaleLabels: { 3:[..3], 5:[..5], 7:[..7] } — 단계별 명칭. 미지정 시 DEFAULT_SCALE_LABELS 사용. */
  const TEMPLATES = {
    leader: {
      key: 'leader',
      name: '직책자 수습 평가',
      description: '리더(리더/총괄/본부장) 수습 평가 양식',
      scale: 5,
      scaleLabels: {
        3: ['낮음', '보통', '높음'],
        5: ['매우 미흡', '미흡', '보통', '우수', '매우 우수'],
        7: ['매우 미흡', '미흡', '다소 미흡', '보통', '다소 우수', '우수', '매우 우수'],
      },
      sections: [
        { name: '리더십', items: [
          { id: 'L-l1', text: '구성원에게 명확한 방향과 비전을 제시한다.' },
          { id: 'L-l2', text: '갈등을 효과적으로 조율하고 의사결정을 이끈다.' },
          { id: 'L-l3', text: '구성원의 성장과 동기부여를 챙긴다.' },
        ]},
        { name: '조직 관리', items: [
          { id: 'L-o1', text: '조직 목표와 일정에 맞춰 업무를 배분·관리한다.' },
          { id: 'L-o2', text: '리스크를 식별하고 적시에 보고·대응한다.' },
        ]},
        { name: '직무 성과', items: [
          { id: 'L-p1', text: '담당 직무에서 기대 수준 이상의 성과를 낸다.' },
          { id: 'L-p2', text: '문제 발생 시 본질을 파악하고 빠르게 해결한다.' },
        ]},
      ],
    },
    staff: {
      key: 'staff',
      name: '비직책자 수습 평가',
      description: '담당/책임 수습 평가 양식',
      scale: 5,
      scaleLabels: {
        3: ['낮음', '보통', '높음'],
        5: ['매우 미흡', '미흡', '보통', '우수', '매우 우수'],
        7: ['매우 미흡', '미흡', '다소 미흡', '보통', '다소 우수', '우수', '매우 우수'],
      },
      sections: [
        { name: '직무 역량', items: [
          { id: 'S-j1', text: '담당 업무의 핵심 지식을 갖추고 적용한다.' },
          { id: 'S-j2', text: '업무 완수를 위한 실행력과 책임감을 보인다.' },
          { id: 'S-j3', text: '문제 발생 시 스스로 해결을 시도하고 필요 시 도움을 요청한다.' },
        ]},
        { name: '조직 적응', items: [
          { id: 'S-a1', text: '팀 동료와 협업하고 적극적으로 소통한다.' },
          { id: 'S-a2', text: '조직 문화와 규정에 잘 적응한다.' },
        ]},
        { name: '근태·태도', items: [
          { id: 'S-t1', text: '출퇴근·일정 준수와 보고가 성실하다.' },
          { id: 'S-t2', text: '피드백을 적극 수용하고 개선한다.' },
        ]},
      ],
    },
  };

  /* 양식 버전 메타 — 수습 평가 설정(page-hr-eval-prob-set) 에서 편집/버전관리 */
  TEMPLATES.leader.version = 'v1';
  TEMPLATES.leader.updatedAt = '2025-01-01';
  TEMPLATES.leader.updatedBy = '정혜진';
  TEMPLATES.leader.versionHistory = [
    { v: 'v1', publishedAt: '2025-01-01', publisher: '정혜진', changeReason: '최초 등록' },
  ];
  TEMPLATES.staff.version = 'v1';
  TEMPLATES.staff.updatedAt = '2025-01-01';
  TEMPLATES.staff.updatedBy = '정혜진';
  TEMPLATES.staff.versionHistory = [
    { v: 'v1', publishedAt: '2025-01-01', publisher: '정혜진', changeReason: '최초 등록' },
  ];

  /* ============ 평가 차수(평가 단계) 설정 ============
   *   수습 평가 설정(page-hr-eval-prob-set) 「평가 단계 설정」 탭에서 편집.
   *   각 차수: { criterion:'role'|'position', value, weight(%) }. 최소 1 ~ 최대 3단계.
   *   비중 합계는 100% 여야 저장 가능(검증은 설정 화면에서). */
  const MAX_STAGES = 3;
  const STAGE_CRITERIA = [
    { key: 'role',     label: '직책' },
    { key: 'position', label: '직위' },
  ];
  /* 직책 / 직위 값 — 평가유형 설정(page-hr-eval-type GROUP_FIELDS) 과 동일 체계 */
  const ROLE_VALUES = ['임원', '본부장', '소장', '팀장', '파트장', '팀원', '파트원'];
  const POSITION_VALUES = ['대표이사', '부대표이사', '전무이사', '상무이사', '부장', '차장', '과장', '대리', '주임', '사원'];
  function criterionLabel(k) { return (STAGE_CRITERIA.find(c => c.key === k) || {}).label || '-'; }
  function stageCriterionValues(k) { return k === 'position' ? POSITION_VALUES.slice() : ROLE_VALUES.slice(); }

  /* 차수 설정 단일 진실원 — 기본값 2차(1차 팀장 50% · 2차 본부장 50%).
     다단계 흐름(2차 진행 시 1차 참조)을 기본 데모로 보여주기 위함. 설정 화면에서 1~3단계로 변경 가능. */
  const STAGE_CONFIG = {
    stages: [
      { criterion: 'role', value: '팀장',   weight: 50 },
      { criterion: 'role', value: '본부장', weight: 50 },
    ],
    /* 변경 이력 — 설정 화면(page-hr-eval-prob-set)에서 수정 사유 입력 후 저장 시 누적.
       ⚠️ 변경 사항은 저장일시 이후 '평가 가능' 상태로 전환되는 수습 직원부터 적용된다.
       이미 평가 가능/진행중/완료된 직원은 변경 전 단계·비중을 유지(세션에 확정 저장). */
    version: 'v2',
    updatedAt: '2025-06-01',
    updatedBy: '정혜진',
    history: [
      { v: 'v1', publishedAt: '2025-01-01', publisher: '정혜진', changeReason: '최초 등록 (1차 팀장 100%)' },
      { v: 'v2', publishedAt: '2025-06-01', publisher: '정혜진', changeReason: '2차 평가 도입 — 1차 팀장 50% · 2차 본부장 50%' },
    ],
  };
  function cloneStages(arr) {
    return (arr || []).map(s => ({ criterion: s.criterion, value: s.value, weight: Number(s.weight) || 0 }));
  }

  /* ============ 페이지 로컬 mock 수습 직원 ============
   *   실 HRMembers 데이터에 14일 이내 수습 종료 직원이 없어 데모용 1~2명 추가.
   *   다른 화면에는 영향 없음 (probationEmps / memberById 안에서만 합쳐 사용). */
  /* 사번 형식 — 입사자 관리 마스터(SW{yy}{mm}{dd}{nn}) 와 통일 */
  const MOCK_PROB = [
    {
      id: 'SW26022501', name: '신지호',
      dept: '경영지원본부', position: '팀원', rank: '사원',
      joinDate: '2026-02-25',
      probation: true, probationStart: '2026-02-25', probationEnd: '2026-05-25',  /* D-7 */
      status: 'active', _mock: true,
    },
    {
      id: 'SW26022102', name: '한리아',
      dept: '경영지원본부', position: '팀장', rank: '대리',
      joinDate: '2026-02-21',
      probation: true, probationStart: '2026-02-21', probationEnd: '2026-05-21',  /* D-3 */
      status: 'active', _mock: true,
    },
    /* 평가 가능(D-90 이내) — [평가하기] 가 곧바로 눌리는 데모 데이터 (경영지원본부 = 동일 차수 진행자) */
    {
      id: 'SW26030105', name: '정우성',
      dept: '경영지원본부', position: '팀원', rank: '사원',
      joinDate: '2026-03-01',
      probation: true, probationStart: '2026-03-01', probationEnd: '2026-06-01',  /* D-14 */
      status: 'active', _mock: true,
    },
    {
      id: 'SW26031506', name: '김서연',
      dept: '경영지원본부', position: '파트원', rank: '사원',
      joinDate: '2026-03-15',
      probation: true, probationStart: '2026-03-15', probationEnd: '2026-06-15',  /* D-28 */
      status: 'active', _mock: true,
    },
    /* 처리 완료 — 「처리 이력」 탭 시드용 (전 차수 제출 + 후속 처리 확정). probationEnd 는 과거(=D+). */
    {
      id: 'SW25100502', name: '오세훈',
      dept: '생산본부', position: '파트원', rank: '사원',
      joinDate: '2025-10-05',
      probation: true, probationStart: '2025-10-05', probationEnd: '2026-01-05',
      status: 'active', _mock: true, _seedHistory: 'released', _seedApproval: 'approved',
    },
    {
      id: 'SW25101203', name: '배유나',
      dept: '연구소', position: '팀원', rank: '사원',
      joinDate: '2025-10-12',
      probation: true, probationStart: '2025-10-12', probationEnd: '2026-01-12',
      status: 'active', _mock: true, _seedHistory: 'extended', _seedApproval: 'pending',
    },
    {
      id: 'SW25110104', name: '문재훈',
      dept: '생산본부', position: '파트원', rank: '사원',
      joinDate: '2025-11-01',
      probation: true, probationStart: '2025-11-01', probationEnd: '2026-02-01',
      status: 'active', _mock: true, _seedHistory: 'terminated', _seedApproval: 'approved',
    },
  ];

  /* ============ STATE ============ */
  const STATE = {
    /* 세션 — { [empId]: { empId, templateKey, status, responses:{[itemId]:1-5},
       comment, result:'pass|hold|fail|null', evaluatorId, submittedAt,
       postAction: { kind:'released|extended|terminated', at, ...formData } | null } } */
    sessions: {},
    selectedEmpId: null,
    currentUserId: null,              // 「내 시점」 — 차수별 평가자 권한 게이팅 기준 (스토리보드 picker 로 전환)
    followup: null,                   // { empId, kind } — 후속 모달 컨텍스트
    filter: { keyword: '', condition: 'name', status: '', result: '' },
    activeTab: 'target',              // 'target' (대상자) | 'history' (최근 처리 이력)
    page: 1, pageSize: 20,
    /* KPI(현황) 영역 접힘 상태 — 퇴사 현황 패턴과 동일 */
    dashboardOpen: true,
  };

  /* ============ 후속 처리 매핑 ============
     평가 결과 → 후속 액션 종류. 평가 모달 제출 후 자동으로 해당 모달 열림. */
  const POSTACTION = {
    pass: { kind: 'released',   label: '수습 해제', tone: 'var(--color-success)' },
    hold: { kind: 'extended',   label: '수습 연장', tone: 'var(--color-warning)' },
    fail: { kind: 'terminated', label: '수습 종료', tone: 'var(--color-danger)'  },
  };
  function postActionByKind(kind) {
    return Object.values(POSTACTION).find(p => p.kind === kind) || null;
  }
  function actionLabel(kind) {
    const p = postActionByKind(kind);
    return p ? p.label : '';
  }

  /* ============ Helpers ============ */
  function $(s, r = document) { return r.querySelector(s); }
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function diffDays(a, b) {
    if (!a || !b) return null;
    return Math.round((new Date(a) - new Date(b)) / 86400000);
  }
  function addMonths(dateStr, months) {
    const d = new Date(dateStr || TODAY);
    d.setMonth(d.getMonth() + months);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  /* avatar 컬러 — 직원 아바타 공통 산식: 사번 끝 2자리 정수 % 6 + 1.
     emp.colorIdx 가 있으면 우선 사용. */
  function avColor(emp) {
    if (emp && emp.colorIdx) return `av--c${emp.colorIdx}`;
    const seed = Number(String((emp && emp.id) || '').slice(-2)) || 1;
    return `av--c${(seed % 6) + 1}`;
  }
  function avatarHTML(emp, size) {
    const cls = `av av--${size || 'sm'} ${avColor(emp)}`;
    if (emp.photoUrl) {
      return `<span class="av av--${size || 'sm'}" style="background:transparent;"><img src="${esc(emp.photoUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"></span>`;
    }
    /* 이니셜 — 성(姓) 한 글자만 표시. 한글 이름의 경우 첫 글자. */
    return `<span class="${cls}">${esc((emp.name || '?').charAt(0))}</span>`;
  }
  /* 성명 셀 — 임직원관리(page-hr-info-mgmt nameCellHTML) 와 동일 패턴.
     사진 + 이름(브랜드 링크) + 부서 · 직책 inline(muted). 부서/직책 모두 빈값이면 메타 미노출. */
  function nameCell(emp) {
    const dept = emp.dept ? esc(emp.dept) : '';
    const pos  = emp.position ? esc(emp.position) : '';
    const dot  = `<span style="color:var(--color-text-muted);font-size:var(--fs-xs);padding:0 2px;" aria-hidden="true">·</span>`;
    const meta = (v) => v
      ? `<span style="color:var(--color-text-muted);font-size:var(--fs-xs);white-space:nowrap;">${v}</span>`
      : '';
    const sep = (dept && pos) ? dot : '';
    return `
      <div style="display:flex;align-items:center;gap:8px;min-width:0;">
        ${avatarHTML(emp, 'sm')}
        <a href="#" data-pep-card="${esc(emp.id)}" style="color:var(--color-brand-primary);font-weight:var(--fw-medium);white-space:nowrap;">${esc(emp.name)}</a>
        <span style="display:inline-flex;align-items:center;gap:0;min-width:0;">
          ${meta(dept)}${sep}${meta(pos)}
        </span>
      </div>
    `;
  }
  function allMembers() {
    return (window.App && App.HRMembers && App.HRMembers.list) ? App.HRMembers.list() : [];
  }
  function memberById(id) {
    return allMembers().find(e => e.id === id) || MOCK_PROB.find(e => e.id === id) || null;
  }

  /* ============ 도메인 ============ */
  const POSITION_HOLDER = new Set(['팀장', '본부장', '본부장', '본부장직무대행']);
  function isPositionHolder(emp) {
    return !!(emp && POSITION_HOLDER.has(emp.position));
  }
  /* 초기 추천 양식 — 직책자/비직책자 자동 분기. 평가자가 모달에서 변경 가능. */
  function defaultTemplateKeyFor(emp) {
    return isPositionHolder(emp) ? 'leader' : 'staff';
  }
  function templateByKey(key) {
    return TEMPLATES[key] || TEMPLATES.staff;
  }
  /* 세션 우선 — 세션에 저장된 templateKey 가 진실. 미생성 상태에서만 기본값 fallback. */
  function templateOf(emp, session) {
    const key = (session && session.templateKey) || defaultTemplateKeyFor(emp);
    return templateByKey(key);
  }

  function probationEmps() {
    const real = allMembers().filter(e => e && e.probation && e.status !== 'retired');
    return real.concat(MOCK_PROB);
  }

  /* 평가자 — 같은 부서에서 본인이 아닌 첫 직책자(리더/총괄/본부장) → 없으면 같은 부서 첫 직원 */
  function pickEvaluator(emp) {
    const same = allMembers().filter(x => x.id !== emp.id && x.dept === emp.dept && x.status !== 'retired');
    const lead = same.find(isPositionHolder) || same[0];
    return lead ? lead.id : null;
  }
  /* 차수 진행자 — 같은 부서에서 cfg 기준(직책/직위)이 cfg.value 와 일치하는 첫 직원.
     매칭이 없으면 첫 직책자, 그래도 없으면 pickEvaluator fallback. (데모 안정 동작) */
  function pickStageEvaluator(emp, cfg) {
    if (!cfg) return pickEvaluator(emp);
    const same = allMembers().filter(x => x.id !== emp.id && x.dept === emp.dept && x.status !== 'retired');
    /* 직책(role) → emp.position(팀장/본부장…) 매칭 · 직위(position) → emp.rank(부장/대리…) 매칭 */
    const matched = same.find(x => (cfg.criterion === 'position' ? x.rank : x.position) === cfg.value)
                 || same.find(x => x.position === cfg.value || x.rank === cfg.value);
    const pick = matched || same.find(isPositionHolder) || same[0];
    return pick ? pick.id : null;
  }

  /* ============ 「내 시점」 평가자 권한 ============
   *   차수별로 지정된 평가자(activeStage.evaluatorId) 에게만 [평가하기] 가 노출된다.
   *   실서비스에서는 로그인 사용자로 고정되며 picker 자체가 없다 (스토리보드 데모용). */
  /* 지금 평가를 수행해야 할(=현재 활성 차수) 진행자 id. 전부 제출됐으면 마지막 차수 진행자. */
  function currentEvaluatorId(session) {
    const stage = activeStage(session) || lastStage(session);
    return stage ? stage.evaluatorId : null;
  }
  /* 회차 전체에서 등장하는 차수 진행자 id 모음 — picker 후보 우선순위 */
  function allStageEvaluatorIds() {
    const ids = new Set();
    probationEmps().forEach(e => {
      const s = STATE.sessions[e.id];
      (s && s.stages || []).forEach(st => { if (st.evaluatorId) ids.add(st.evaluatorId); });
    });
    return Array.from(ids);
  }
  /* picker 후보 — 차수 진행자를 앞에, 그 외 활성 직원 일부를 뒤에 (스토리보드) */
  function pickViewerCandidates() {
    const seen = new Set();
    const out = [];
    allStageEvaluatorIds().forEach(id => {
      const m = memberById(id);
      if (m && !seen.has(m.id)) { seen.add(m.id); out.push(m); }
    });
    allMembers().filter(e => e.status !== 'retired').slice(0, 8).forEach(m => {
      if (!seen.has(m.id)) { seen.add(m.id); out.push(m); }
    });
    return out;
  }
  /* 기본 시점 — 데모에서 곧바로 [평가하기] 가 활성화되도록 첫 행의 현재 차수 진행자로 시작 */
  function defaultViewer() {
    const rows = buildRows();
    for (const r of rows) {
      const id = currentEvaluatorId(r.session);
      if (id) return id;
    }
    return (pickViewerCandidates()[0] || {}).id || null;
  }

  /* 현재 차수 설정 — 단일 진실원 STAGE_CONFIG 의 라이브 참조 */
  function configStages() { return STAGE_CONFIG.stages || []; }
  function buildSessionStages(emp) {
    const cfgs = configStages();
    return cfgs.map((cfg, i) => ({
      idx: i,
      criterion: cfg.criterion,
      value: cfg.value,
      weight: Number(cfg.weight) || 0,
      responses: {},
      comment: '',
      result: null,
      evaluatorId: pickStageEvaluator(emp, cfg),
      status: 'ready',           /* ready | inProgress | submitted */
      submittedAt: null,
    }));
  }
  function ensureSession(emp) {
    let s = STATE.sessions[emp.id];
    if (!s) {
      s = STATE.sessions[emp.id] = {
        empId: emp.id,
        templateKey: defaultTemplateKeyFor(emp),
        status: 'ready',
        stages: buildSessionStages(emp),
        postAction: null,
      };
    }
    /* 차수 설정이 바뀌었고 아직 아무 차수도 제출 전이면 차수 구조 재구성(데모용 동기화) */
    else if (Array.isArray(s.stages)
             && s.stages.length !== configStages().length
             && !s.stages.some(st => st.status === 'submitted')) {
      s.stages = buildSessionStages(emp);
    }
    maybeSeedDemo(emp, s);
    maybeSeedHistory(emp, s);
    return s;
  }
  /* 처리 이력 시드 — emp._seedHistory('released'|'extended'|'terminated') 인 mock 을
     전 차수 제출 완료 + 결과 확정 + 후속 처리 확정 상태로 채운다. (「처리 이력」 탭 데모 데이터) */
  const HISTORY_RESULT = { released: 'pass', extended: 'hold', terminated: 'fail' };
  function maybeSeedHistory(emp, s) {
    if (!emp || !emp._seedHistory || s._historySeeded) return;
    const tpl = templateOf(emp, s);
    const res = HISTORY_RESULT[emp._seedHistory] || 'pass';
    const at = emp.probationEnd || TODAY;
    (s.stages || []).forEach((st) => {
      (tpl.sections || []).forEach(sec => (sec.items || []).forEach(it => { st.responses[it.id] = 4; }));
      st.comment = '수습 기간 평가를 완료하였습니다. (데모 이력)';
      st.result = res;
      st.status = 'submitted';
      st.submittedAt = at;
    });
    s.result = res;
    s.status = 'submitted';
    s.submittedAt = at;
    s.postAction = { kind: emp._seedHistory, at, approvalStatus: emp._seedApproval || 'approved' };
    s._historySeeded = true;
  }
  /* 데모 시드 — 다단계(2차 이상) 설정일 때 특정 직원(한리아)의 1차를 미리 제출 완료 상태로 채워,
     해당 행을 열면 곧바로 2차 평가 화면 + 1차 참조 패널을 확인할 수 있게 한다. (스토리보드 전용) */
  const DEMO_SEED_EMP = 'SW26022102';   /* 한리아 */
  function maybeSeedDemo(emp, s) {
    if (!emp || emp.id !== DEMO_SEED_EMP) return;
    if (s._demoSeeded) return;
    const stages = s.stages || [];
    if (stages.length < 2) return;                 /* 단일 차수면 시드 불필요 */
    if (stages.some(st => st.status === 'submitted')) { s._demoSeeded = true; return; }
    const tpl = templateOf(emp, s);
    const first = stages[0];
    /* 1차 — 모든 문항에 4점(우수) 부여 + 종합 의견 채우고 제출 처리 */
    (tpl.sections || []).forEach(sec => (sec.items || []).forEach(it => { first.responses[it.id] = 4; }));
    first.comment = '업무 습득 속도가 빠르고 팀 적응이 우수합니다. 보고·소통도 성실하여 다음 차수 평가를 권장합니다.';
    first.status = 'submitted';
    first.submittedAt = TODAY;
    if (s.status === 'ready') s.status = 'inProgress';
    s._demoSeeded = true;
  }
  /* 현재 활성 차수 인덱스 — 첫 미제출 차수. 전부 제출이면 stages.length(확정) */
  function activeStageIdx(session) {
    const stages = (session && session.stages) || [];
    const idx = stages.findIndex(st => st.status !== 'submitted');
    return idx === -1 ? stages.length : idx;
  }
  function activeStage(session) {
    const stages = (session && session.stages) || [];
    const i = activeStageIdx(session);
    return i < stages.length ? stages[i] : null;
  }
  function isAllStagesSubmitted(session) {
    const stages = (session && session.stages) || [];
    return stages.length > 0 && stages.every(st => st.status === 'submitted');
  }
  function lastStage(session) {
    const stages = (session && session.stages) || [];
    return stages.length ? stages[stages.length - 1] : null;
  }
  /* 차수 라벨 — "1차 (팀장)" */
  function stageLabel(stage) {
    if (!stage) return '';
    return `${stage.idx + 1}차 (${esc(stage.value || criterionLabel(stage.criterion))})`;
  }
  /* 평가 가능 여부 — 수습 종료 3개월(D-90) 이내가 되면 '평가 가능' 상태로 전환된다.
     그 전(D-90 초과)에는 '대기 중'. 종료일이 지난(음수) 경우도 평가 가능 유지. */
  const OPEN_DAYS = 90;   /* 수습 종료 D-90 부터 평가 가능 */
  function isOpenForEval(emp) {
    const d = diffDays(emp.probationEnd, TODAY);
    return d === null ? true : d <= OPEN_DAYS;
  }
  /* 자동 트리거 — 매 렌더마다 호출. 평가자/양식 정보 미리 표시하기 위해 모든 수습 직원에 차수 세션 생성. */
  function autoTriggerSessions() {
    probationEmps().forEach(e => ensureSession(e));
  }

  /* ============ 산출 ============ */
  /* 한 차수의 응답 완료율 */
  function stageCompletionRatio(stage, tpl) {
    if (!stage || !tpl) return 0;
    const items = tpl.sections.flatMap(s => s.items.map(it => it.id));
    if (!items.length) return 0;
    const r = stage.responses || {};
    const done = items.filter(id => Number(r[id]) > 0).length;
    return done / items.length;
  }
  /* 한 차수의 환산 점수(0~100) — 평균 척도값 / 척도 × 100 */
  function stageScore(stage, tpl) {
    if (!stage || !tpl) return 0;
    const items = tpl.sections.flatMap(s => s.items.map(it => it.id));
    if (!items.length) return 0;
    const sum = items.reduce((a, id) => a + Number((stage.responses || {})[id] || 0), 0);
    const avg = sum / items.length;
    return Math.round((avg / (tpl.scale || 5)) * 100);
  }
  /* 전체 진행률 — 현재 활성 차수의 완료율 (전부 제출이면 1) */
  function completionRatio(session, tpl) {
    if (isAllStagesSubmitted(session)) return 1;
    return stageCompletionRatio(activeStage(session), tpl);
  }

  function buildRows() {
    /* 수습 만료 D-90 이내부터 노출 — 그 전(대기 중) 직원은 목록에 나오지 않는다.
       따라서 모든 행은 '평가 가능' / '진행중' / '제출 완료' 중 하나. */
    return probationEmps().filter(isOpenForEval).map(emp => {
      const session = STATE.sessions[emp.id] || null;
      const tpl = templateOf(emp, session);
      const days = diffDays(emp.probationEnd, TODAY);
      const open = isOpenForEval(emp);
      const allDone = session ? isAllStagesSubmitted(session) : false;
      const cur = session ? activeStage(session) : null;
      const ratio = session ? completionRatio(session, tpl) : 0;
      const submittedCount = session ? (session.stages || []).filter(st => st.status === 'submitted').length : 0;
      let statusCode, statusLabel, statusPill;
      const hasPostAction = !!(session && session.postAction);
      if (!open) {
        statusCode = 'waiting'; statusLabel = '대기 중';   statusPill = '';
      } else if (session && session.status === 'submitted' && (allDone || hasPostAction)) {
        statusCode = 'done';    statusLabel = '제출 완료'; statusPill = 'success';
      } else if (ratio > 0 || submittedCount > 0) {
        statusCode = 'doing';
        statusLabel = cur ? `${cur.idx + 1}차 진행중` : '진행중';
        statusPill = 'warning';
      } else {
        statusCode = 'todo';    statusLabel = '평가 가능'; statusPill = 'info';
      }
      /* 결과 — 마지막 차수 제출 시 확정된 result (= session.result) */
      const result = (session && allDone) ? session.result : null;
      /* 표시 평가자 — 현재 활성 차수 진행자(전부 끝났으면 마지막 차수 진행자) */
      const evalStage = cur || lastStage(session);
      const evaluator = evalStage && evalStage.evaluatorId ? memberById(evalStage.evaluatorId) : null;
      return {
        emp, session, tpl,
        days, open, ratio, allDone, cur,
        statusCode, statusLabel, statusPill,
        result,
        evaluator,
      };
    });
  }
  /* 탭 분류 — done(제출 완료) 은 '최근 처리 이력', 나머지는 '대상자' */
  function rowMatchesTab(r, tab) {
    if (tab === 'history') return r.statusCode === 'done';
    /* target — 평가 가능(todo) / 진행중(doing). 대기 중 직원은 목록에 없음(D-90 게이팅). */
    return r.statusCode === 'todo' || r.statusCode === 'doing';
  }
  function applyFilter(rows) {
    const f = STATE.filter;
    const kw = (f.keyword || '').toLowerCase().trim();
    const cond = f.condition || 'name';
    return rows.filter(r => {
      /* 탭별 1차 분류 */
      if (!rowMatchesTab(r, STATE.activeTab)) return false;
      if (kw) {
        const target = cond === 'empId' ? (r.emp.id || '') : (r.emp.name || '');
        if (!String(target).toLowerCase().includes(kw)) return false;
      }
      if (f.status && f.status !== r.statusCode) return false;
      if (f.result) {
        if (f.result === 'none') { if (r.result) return false; }
        else if (r.result !== f.result) return false;
      }
      return true;
    });
  }

  function resultPill(code, postAction) {
    /* postAction 처리 완료 — 후속 액션 라벨로 대체 (수습 해제 / 수습 연장 / 수습 종료) */
    if (postAction && postAction.kind) {
      const map = {
        released:   { l: '수습 해제', c: 'pill--success' },
        extended:   { l: '수습 연장', c: 'pill--warning' },
        terminated: { l: '수습 종료', c: 'pill--danger'  },
      };
      const m = map[postAction.kind];
      if (m) return `<span class="pill ${m.c}" style="font-size:var(--fs-xs);min-width:60px;justify-content:center;">${m.l}</span>`;
    }
    const map = {
      pass: { l: '전환',   c: 'pill--success' },
      hold: { l: '보류',   c: 'pill--warning' },
      fail: { l: '미전환', c: 'pill--danger'  },
    };
    const m = map[code];
    if (!m) return '<span class="t-muted">-</span>';
    return `<span class="pill ${m.c}" style="font-size:var(--fs-xs);min-width:42px;justify-content:center;">${m.l}</span>`;
  }

  /* 결과 승인상태 pill — 후속 처리(수습 해제/연장/종료)의 전자결재 승인 상태 */
  function approvalStatusPill(postAction) {
    if (!postAction) return '<span class="t-muted" style="font-size:var(--fs-xs);">-</span>';
    const map = {
      pending:  { l: '승인 대기', c: 'pill--warning' },
      approved: { l: '승인 완료', c: 'pill--success' },
      rejected: { l: '반려',      c: 'pill--danger'  },
    };
    const m = map[postAction.approvalStatus] || map.pending;
    return `<span class="pill ${m.c}" style="font-size:var(--fs-xs);min-width:60px;justify-content:center;">${m.l}</span>`;
  }

  /* 액션 셀 —
     · 읽기 전용([평가 결과]/[검토]) 은 모니터링을 위해 모두에게 노출.
     · 실제 입력([평가하기]/[이어하기]) 은 현재 활성 차수의 지정 평가자(내 시점) 에게만 노출.
       다른 사람에게는 담당 평가자 안내(muted) 만 표시. */
  function actionCell(r, postAction, viewerId) {
    const e = r.emp;
    /* 후속 처리 완료 행 — 결과 read-only (전원) */
    if (postAction && postAction.kind) {
      return `<button class="btn btn--xs" type="button" data-pep-open="${esc(e.id)}">평가 결과</button>`;
    }
    /* 제출 완료(확정) 행 — 검토 read-only (전원) */
    if (r.statusCode === 'done') {
      return `<button class="btn btn--xs" type="button" data-pep-open="${esc(e.id)}">검토</button>`;
    }
    /* 여기서부터 실제 입력이 필요한 행 (todo / doing) — 평가자 권한 게이팅.
       자기 담당 차수가 아니면 아무 버튼도 노출하지 않는다 (담당자 안내 문구 없음). */
    const evId = currentEvaluatorId(r.session);
    const isMine = !!(viewerId && evId && viewerId === evId);
    if (!isMine) {
      return `<span class="t-muted" style="font-size:var(--fs-xs);">-</span>`;
    }
    /* 내 차례 — 평가하기 / 이어하기 */
    const btnLabel = r.statusCode === 'todo' ? '평가하기' : '이어하기';
    return `<button class="btn btn--xs btn--primary" type="button" data-pep-open="${esc(e.id)}">${btnLabel}</button>`;
  }

  /* =========================================================
   *  VIEW: LIST
   * ========================================================= */
  function renderListView(pageEl) {
    autoTriggerSessions();
    /* 「내 시점」 기본값 — 세션(차수 진행자)이 만들어진 뒤 첫 진행자로 설정 */
    if (!STATE.currentUserId) STATE.currentUserId = defaultViewer();
    const C = App.Components;
    const allRows = buildRows();
    const isHistory = STATE.activeTab === 'history';
    const counts = {
      total: allRows.length,
      todo:    allRows.filter(r => r.statusCode === 'todo').length,
      doing:   allRows.filter(r => r.statusCode === 'doing').length,
      done:    allRows.filter(r => r.statusCode === 'done').length,
    };

    const searchHTML = C.searchPanel({
      showDateRange: false,
      conditions: [
        { value: 'name',  label: '성명' },
        { value: 'empId', label: '사번' },
      ],
      placeholder: '성명 또는 사번 검색',
      cols: 2,
      advanced: [
        { name: 'status', label: '상태', options: [
          { value: 'todo',    label: '평가 가능' },
          { value: 'doing',   label: '진행중' },
          { value: 'done',    label: '제출 완료' },
        ]},
        { name: 'result', label: '결과', options: [
          { value: 'pass', label: '전환' },
          { value: 'hold', label: '보류' },
          { value: 'fail', label: '미전환' },
          { value: 'none', label: '미평가' },
        ]},
      ],
    });

    const dashboardOpen = STATE.dashboardOpen;
    const arrowSvg = dashboardOpen
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

    const viewerOpts = pickViewerCandidates().map(e => {
      const sel = e.id === STATE.currentUserId ? 'selected' : '';
      return `<option value="${esc(e.id)}" ${sel}>${esc(e.name)} — ${esc(e.dept || '-')}${e.position ? ' · ' + esc(e.position) : ''}</option>`;
    }).join('');

    pageEl.innerHTML = `
      ${searchHTML}

      <div style="flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;">
        <div class="toolbar">
          <div class="toolbar__left" style="gap:14px;">
            <span class="toolbar__count">총 <strong data-pep-count>0</strong>건</span>
            <div style="height:18px;width:1px;background:var(--color-divider);"></div>
            <div class="btn-toggle" data-pep-tab-host>
              <button class="btn btn--sm ${STATE.activeTab === 'target'  ? 'is-active' : ''}" type="button" data-pep-tab="target">
                대상자 <span style="margin-left:4px;color:${STATE.activeTab === 'target' ? 'var(--color-brand-primary)' : 'var(--color-text-muted)'};font-weight:var(--fw-regular);" data-pep-tab-count="target">${counts.todo + counts.doing}</span>
              </button>
              <button class="btn btn--sm ${STATE.activeTab === 'history' ? 'is-active' : ''}" type="button" data-pep-tab="history">
                처리 이력 <span style="margin-left:4px;color:${STATE.activeTab === 'history' ? 'var(--color-brand-primary)' : 'var(--color-text-muted)'};font-weight:var(--fw-regular);" data-pep-tab-count="history">${counts.done}</span>
              </button>
            </div>
          </div>
        </div>
        <div class="grid-wrap" style="flex:1;min-height:0;">
          <div class="grid-scroll">
            <table class="tbl tbl--hover">
              <thead>
                <tr>
                  <th style="width:120px;">사번</th>
                  <th style="width:260px;">성명</th>
                  <th style="width:110px;">입사일</th>
                  <th style="width:200px;white-space:nowrap;">수습 기간</th>
                  <th style="width:80px;text-align:center;">잔여</th>
                  ${!isHistory ? `
                  <th style="width:170px;text-align:center;">평가 단계</th>
                  <th style="width:130px;">차수 진행자</th>` : ''}
                  <th style="width:110px;text-align:center;">상태</th>
                  ${isHistory ? `
                  <th style="width:90px;text-align:center;">결과</th>
                  <th style="width:110px;text-align:center;">결과 승인상태</th>` : ''}
                  <th style="width:120px;text-align:center;"></th>
                </tr>
              </thead>
              <tbody data-pep-body></tbody>
            </table>
          </div>
          <div class="pagination">
            <div class="pagination__info" data-pep-info></div>
            <div class="pagination__right">
              <div class="pagination__size">
                <label>페이지당</label>
                <select class="select" data-pep-pagesize>
                  <option value="20">20</option><option value="40">40</option><option value="60">60</option><option value="100">100</option>
                </select>
                <span>건</span>
              </div>
              <div class="pagination__list" data-pep-pagination></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 평가 입력 OffCanvas — 평가 진행 화면과 동일한 우측 패널 패턴 -->
      <div class="oc-backdrop" data-pep-eval-host></div>
      <aside class="offcanvas offcanvas--lg" data-pep-eval-modal aria-hidden="true" style="width:760px;max-width:100vw;">
        <header class="offcanvas__header">
          <div style="flex:1;min-width:0;">
            <div class="offcanvas__title" data-pep-eval-title>수습 평가</div>
            <div class="page-bar__sub" style="margin-top:2px;font-size:var(--fs-sm);color:var(--color-text-muted);" data-pep-eval-sub></div>
          </div>
          <button class="offcanvas__close" type="button" data-pep-eval-close aria-label="닫기">✕</button>
        </header>
        <div class="offcanvas__body" style="background:var(--color-surface-alt);display:flex;flex-direction:column;gap:14px;" data-pep-eval-body></div>
        <div class="offcanvas__footer" data-pep-eval-footer></div>
      </aside>

      <!-- 이전 차수 평가내용 모달 — 평가 OffCanvas 위에 표시(over-oc). openPriorModal 이 채움 -->
      <div class="modal-backdrop modal-backdrop--over-oc" data-pep-prior-modal>
        <div class="modal modal--lg">
          <div class="modal__header">
            <div class="modal__title" data-pep-prior-title>이전 차수 평가 내용</div>
            <button class="modal__close" type="button" data-pep-prior-close aria-label="닫기">✕</button>
          </div>
          <div class="modal__body" style="background:var(--color-surface-alt);padding:18px 20px;" data-pep-prior-body></div>
          <div class="modal__footer"><button class="btn" type="button" data-pep-prior-close>닫기</button></div>
        </div>
      </div>

      <!-- 후속 처리 모달 — 수습 해제 / 연장 / 종료. populateFollowupModal 이 채움 -->
      <div class="modal-backdrop" data-pep-followup-modal>
        <div class="modal modal--lg">
          <div class="modal__header">
            <div style="flex:1;min-width:0;">
              <div class="modal__title" data-pep-followup-title>후속 처리</div>
              <div class="page-bar__sub" style="margin-top:2px;" data-pep-followup-sub></div>
            </div>
            <button class="modal__close" type="button" data-pep-followup-close aria-label="닫기">✕</button>
          </div>
          <div class="modal__body" style="background:var(--color-surface-alt);padding:20px 24px;" data-pep-followup-body></div>
          <div class="modal__footer" data-pep-followup-footer></div>
        </div>
      </div>

      <!-- 「내 시점」 picker — 차수별 평가자 권한 시연용 (실서비스에서는 로그인 사용자 고정, picker 없음) -->
      <div data-pep-viewer-fab style="position:fixed;right:24px;bottom:24px;z-index:50;display:flex;align-items:center;gap:8px;padding:8px 14px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-pill);box-shadow:var(--shadow-md);">
        <span style="font-size:var(--fs-xs);color:var(--color-text-muted);">내 시점</span>
        <select class="select select--sm" data-pep-viewer style="min-width:240px;border:0;background:transparent;font-weight:var(--fw-medium);">${viewerOpts}</select>
      </div>
    `;

    refreshTable(pageEl);
    bindList(pageEl);
  }

  function kpiCard(label, value, opts) {
    const o = opts || {};
    /* info 옵션 — 라벨 옆 ⓘ 아이콘 + hover 시 title 툴팁 */
    /* info 아이콘 — UI Kit .tip / .tip__bubble 컴포넌트 사용 (native title 은 SVG hover 미발화 이슈) */
    const infoIcon = o.info
      ? `<span class="tip tip--bottom" style="margin-left:4px;color:var(--color-text-muted);cursor:help;vertical-align:middle;line-height:1;" aria-label="${esc(o.info)}">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
           <span class="tip__bubble">${esc(o.info)}</span>
         </span>`
      : '';
    return `
      <div style="padding:14px 16px;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);">
        <div style="font-size:var(--fs-xs);color:var(--color-text-muted);display:flex;align-items:center;">${esc(label)}${infoIcon}</div>
        <div style="font-size:var(--fs-xl);font-weight:var(--fw-bold);color:var(--color-text);margin-top:4px;">${value}</div>
      </div>
    `;
  }

  /* 그리드 「평가 단계」 셀 — step-dots 컴팩트 스텝퍼. (평가 진행 화면 renderStageDots 차용)
     체인: 1차 → 2차 → … → 확정. 제출 차수=is-done, 현재 차수=is-current. */
  function renderStageDots(r) {
    const session = r.session;
    const stages = (session && session.stages) || [];
    if (!stages.length) return '<span class="t-muted">-</span>';
    const curIdx = activeStageIdx(session);
    const allDone = r.allDone;
    /* 평가 진행 화면과 동일 — 전체 차수(1차 → … → 확정)를 모두 표시하고 현재 위치를 활성화.
       제출 차수=완료(진한 원) · 현재 진행 차수=브랜드 원 · 이후 차수=대기(테두리). */
    const dots = stages.map((st, i) => {
      let cls = '';
      if (st.status === 'submitted') cls = 'is-done';
      else if (i === curIdx) cls = 'is-current';
      return `<li class="step-dots__item ${cls}"><span class="step-dots__dot" title="${stageLabel(st)}">${i + 1}</span></li>`;
    }).join('');
    /* 확정(terminal) — 평가 진행 화면처럼 마지막 번호 점으로 표시(타이틀 "확정"). 전체 제출 시 활성. */
    const term = `<li class="step-dots__item ${allDone ? 'is-done' : ''}"><span class="step-dots__dot" title="확정">${stages.length + 1}</span></li>`;
    return `<ol class="step-dots step-dots--sm step-dots--brand-done" style="padding:0;margin:0;list-style:none;justify-content:center;">${dots}${term}</ol>`;
  }

  function renderRows(rows, viewerId) {
    const isHistory = STATE.activeTab === 'history';
    if (!rows.length) {
      return `<tr><td colspan="9" style="text-align:center;color:var(--color-text-muted);padding:48px 0;">조건에 해당하는 수습 직원이 없습니다.</td></tr>`;
    }
    return rows.map(r => {
      const e = r.emp;
      const ev = r.evaluator;
      const session = r.session;
      const postAction = session ? session.postAction : null;
      const period = `${esc(e.probationStart || '?')} ~ ${esc(e.probationEnd || '?')}`;
      const daysCell = r.days === null ? '-'
        : r.days < 0 ? `<span class="t-danger">D+${Math.abs(r.days)}</span>`
        : r.days === 0 ? '<strong>D-DAY</strong>'
        : `D-${r.days}`;
      const statusCell = `<span class="pill${r.statusPill ? ' pill--' + r.statusPill : ''}" style="font-size:var(--fs-xs);min-width:60px;justify-content:center;">${esc(r.statusLabel)}</span>`;
      return `
        <tr data-pep-row="${esc(e.id)}">
          <td style="white-space:nowrap;">${esc(e.id)}</td>
          <td>${nameCell(e)}</td>
          <td style="white-space:nowrap;">${esc(e.joinDate || '-')}</td>
          <td style="white-space:nowrap;">${period}</td>
          <td style="text-align:center;font-size:var(--fs-sm);color:var(--color-text-sub);">${daysCell}</td>
          ${!isHistory ? `
          <td style="text-align:center;">${renderStageDots(r)}</td>
          <td style="white-space:nowrap;">${ev
            ? `<div style="display:flex;align-items:center;gap:6px;">${avatarHTML(ev, 'xs')}<span>${esc(ev.name)}</span>${r.cur ? `<small style="color:var(--color-text-muted);font-size:var(--fs-xs);">${r.cur.idx + 1}차</small>` : ''}</div>`
            : '<span class="t-muted">-</span>'}</td>` : ''}
          <td style="text-align:center;">${statusCell}</td>
          ${isHistory ? `
          <td style="text-align:center;">${resultPill(r.result, postAction)}</td>
          <td style="text-align:center;">${approvalStatusPill(postAction)}</td>` : ''}
          <td style="text-align:center;">${actionCell(r, postAction, viewerId)}</td>
        </tr>
      `;
    }).join('');
  }

  function bindList(pageEl) {
    /* 검색 패널 — App.Components.searchPanel + App.Search.attach */
    const searchRoot = pageEl.querySelector('[data-search]');
    if (searchRoot && App.Search) {
      App.Search.attach(searchRoot, (params) => {
        const adv = params.advanced || {};
        STATE.filter.keyword   = (params.keyword || '').trim();
        STATE.filter.condition = params.condition || 'name';
        STATE.filter.status    = adv.status || '';
        STATE.filter.result    = adv.result || '';
        STATE.page = 1;
        refreshTable(pageEl);
      });
    }

    /* 페이지네이션 */
    const pp = pageEl.querySelector('[data-pep-pagination]');
    if (pp) pp.addEventListener('click', e => {
      const b = e.target.closest('.pagination__btn');
      if (!b || b.disabled) return;
      const p = Number(b.dataset.page);
      if (Number.isFinite(p)) { STATE.page = p; refreshTable(pageEl); }
    });
    const ps = pageEl.querySelector('[data-pep-pagesize]');
    if (ps) ps.addEventListener('change', e => { STATE.pageSize = Number(e.target.value); STATE.page = 1; refreshTable(pageEl); });

    /* 「내 시점」 picker — 시점 전환 시 평가자 권한(버튼 노출) 재계산 */
    const viewer = pageEl.querySelector('[data-pep-viewer]');
    if (viewer) viewer.addEventListener('change', () => { STATE.currentUserId = viewer.value; refreshTable(pageEl); });

    /* KPI 현황 접기/펼치기 */
    const toggle = pageEl.querySelector('[data-pep-toggle]');
    if (toggle) toggle.addEventListener('click', () => {
      STATE.dashboardOpen = !STATE.dashboardOpen;
      renderListView(pageEl);
    });

    /* 행 액션 — 평가 모달 열기. renderListView 가 KPI 토글/모달 close 시 재호출되므로
       pageEl 자체에는 한 번만 위임 (중복 바인딩 방지) */
    if (!pageEl.dataset.pepDelegated) {
      pageEl.dataset.pepDelegated = '1';
      pageEl.addEventListener('click', e => {
        /* 탭 전환 — 대상자 / 최근 처리 이력 */
        const tab = e.target.closest('[data-pep-tab]');
        if (tab) {
          const key = tab.dataset.pepTab;
          if (STATE.activeTab !== key) {
            STATE.activeTab = key;
            STATE.page = 1;
            renderListView(pageEl);
          }
          return;
        }
        /* 이전 차수 [평가내용 보기] — 모달 열기 / 닫기(백드롭·버튼) */
        const priorBtn = e.target.closest('[data-pep-prior]');
        if (priorBtn) { openPriorModal(pageEl, Number(priorBtn.dataset.pepPrior)); return; }
        if (e.target.closest('[data-pep-prior-close]') || e.target.matches('[data-pep-prior-modal]')) {
          closePriorModal(pageEl);
          return;
        }
        /* 성명 링크 — 인사정보카드 열기 */
        const card = e.target.closest('[data-pep-card]');
        if (card) {
          e.preventDefault();
          openHrInfoCard(card.dataset.pepCard);
          return;
        }
        /* [평가하기] 버튼 — 평가 모달 열기 */
        const opener = e.target.closest('[data-pep-open]');
        if (!opener) return;
        if (opener.tagName === 'BUTTON' && opener.disabled) return;
        if (opener.tagName === 'A') e.preventDefault();
        openEvalModal(pageEl, opener.dataset.pepOpen);
      });
    }
    /* 모달 외곽 (닫기/백드롭/ESC) — 매 렌더마다 내부 버튼 핸들러는 갱신 필요 */
    bindEvalModalChrome(pageEl);
    bindFollowupModalChrome(pageEl);
  }

  function refreshTable(pageEl) {
    const filtered = applyFilter(buildRows());
    const start = (STATE.page - 1) * STATE.pageSize;
    const rows = filtered.slice(start, start + STATE.pageSize);
    const body = pageEl.querySelector('[data-pep-body]');
    if (body) body.innerHTML = renderRows(rows, STATE.currentUserId);
    const cnt = pageEl.querySelector('[data-pep-count]');
    if (cnt) cnt.textContent = filtered.length;
    renderPagination(pageEl, filtered);
  }
  /* 페이지네이션 — 퇴사 현황 패턴과 동일 (« ‹ N ... › ») */
  function renderPagination(pageEl, filtered) {
    const total = filtered.length;
    const start = (STATE.page - 1) * STATE.pageSize;
    const size = STATE.pageSize;
    const totalPages = Math.max(1, Math.ceil(total / size));
    if (STATE.page > totalPages) STATE.page = totalPages;

    const info = pageEl.querySelector('[data-pep-info]');
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
    const pp = pageEl.querySelector('[data-pep-pagination]');
    if (pp) pp.innerHTML = btns.join('');

    const sel = pageEl.querySelector('[data-pep-pagesize]');
    if (sel) sel.value = String(STATE.pageSize);
  }

  /* =========================================================
   *  MODAL: EVAL
   * ========================================================= */
  /* 수습 평가 입력 — OffCanvas 패턴 (평가 진행 화면과 동일).
   *   data-pep-eval-modal: aside.offcanvas
   *   data-pep-eval-host : div.oc-backdrop */
  function bindEvalModalChrome(pageEl) {
    const oc = pageEl.querySelector('[data-pep-eval-modal]');
    const bd = pageEl.querySelector('[data-pep-eval-host]');
    if (!oc) return;
    pageEl.querySelectorAll('[data-pep-eval-close]').forEach(b => b.addEventListener('click', () => closeEvalModal(pageEl)));
    if (bd) bd.addEventListener('click', () => closeEvalModal(pageEl));
    pageEl.__pepKeyHandler && document.removeEventListener('keydown', pageEl.__pepKeyHandler);
    pageEl.__pepKeyHandler = (e) => {
      if (e.key === 'Escape' && oc.classList.contains('is-open')) closeEvalModal(pageEl);
    };
    document.addEventListener('keydown', pageEl.__pepKeyHandler);
  }
  function openEvalModal(pageEl, empId) {
    const emp = memberById(empId);
    if (!emp) return;
    /* 윈도우 밖이라도 [평가하기] 버튼은 막혀있지만 안전을 위해 세션 생성 */
    const session = ensureSession(emp);
    /* 권한 가드 — 입력이 필요한(읽기 전용 아님) 진입은 현재 차수 지정 평가자만 허용.
       읽기 전용(후속 처리 완료 / 전체 차수 제출 후 검토) 은 전원 허용. */
    const readonly = !!(session && session.postAction) || isAllStagesSubmitted(session);
    if (!readonly) {
      const evId = currentEvaluatorId(session);
      if (evId && STATE.currentUserId !== evId) {
        const ev = memberById(evId);
        window.toast && window.toast(`현재 차수의 지정 평가자(${ev ? ev.name : '-'})만 평가할 수 있습니다.`, 'warning');
        return;
      }
    }
    STATE.selectedEmpId = empId;
    populateEvalModal(pageEl);
    const oc = pageEl.querySelector('[data-pep-eval-modal]');
    const bd = pageEl.querySelector('[data-pep-eval-host]');
    if (oc) { oc.classList.add('is-open'); oc.setAttribute('aria-hidden', 'false'); }
    if (bd) bd.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  /* 이전 차수 평가내용 모달 — 평가 OffCanvas 위에 해당 차수의 전체 양식(읽기 전용)을 띄운다. */
  function openPriorModal(pageEl, stageIdx) {
    const emp = STATE.selectedEmpId ? memberById(STATE.selectedEmpId) : null;
    if (!emp) return;
    const session = STATE.sessions[emp.id];
    if (!session) return;
    const stage = (session.stages || []).find(s => s.idx === stageIdx);
    if (!stage) return;
    const tpl = templateOf(emp, session);
    const isFinal = stageIdx === (session.stages.length - 1);
    const titleEl = pageEl.querySelector('[data-pep-prior-title]');
    const bodyEl  = pageEl.querySelector('[data-pep-prior-modal] [data-pep-prior-body]');
    if (titleEl) titleEl.textContent = `${stageIdx + 1}차 평가 내용`;
    if (bodyEl) bodyEl.innerHTML = renderStageReviewBlock(tpl, stage, isFinal);
    const modal = pageEl.querySelector('[data-pep-prior-modal]');
    if (modal) modal.classList.add('is-open');
  }
  function closePriorModal(pageEl) {
    const modal = pageEl.querySelector('[data-pep-prior-modal]');
    if (modal) modal.classList.remove('is-open');
  }

  /* =========================================================
   *  MODAL: FOLLOWUP (수습 해제 / 수습 연장 / 수습 종료)
   *  - 평가 모달 [제출] 후 자동 오픈
   *  - 상단 [수습 해제/연장/종료] 버튼 또는 행 dot 메뉴에서도 오픈
   *  - 어떤 방식이든 모달을 닫으면 session.postAction 마킹 (입력된 폼 값 보존)
   * ========================================================= */
  function bindFollowupModalChrome(pageEl) {
    const modal = pageEl.querySelector('[data-pep-followup-modal]');
    if (!modal) return;
    /* 헤더의 X 버튼은 항상 「취소」(discard) 로 동작 */
    pageEl.querySelectorAll('[data-pep-followup-close]').forEach(b => b.addEventListener('click', () => closeFollowupModal(pageEl, false)));
    /* 백드롭 클릭 / ESC 도 「취소」 — 확정은 오직 [확인] 버튼만 */
    modal.addEventListener('click', e => { if (e.target === modal) closeFollowupModal(pageEl, false); });
    pageEl.__pepFupKeyHandler && document.removeEventListener('keydown', pageEl.__pepFupKeyHandler);
    pageEl.__pepFupKeyHandler = (e) => {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) closeFollowupModal(pageEl, false);
    };
    document.addEventListener('keydown', pageEl.__pepFupKeyHandler);
  }
  /* openFollowupModal — 후속 처리 진입점.
   *   이전: 중간 입력 모달 → 승인 요청 모달 (2 단계)
   *   현재: 바로 시스템 전자결재 모달 (1 단계). 각 kind 별로 titlePrefix/사유 라디오 다르게 구성. */
  function openFollowupModal(pageEl, empId, kind) {
    const emp = memberById(empId);
    if (!emp) return;
    openFollowupApprovalDirect(pageEl, emp, kind);
  }
  /* 각 후속 처리 종류별 전자결재 모달 컨피그 */
  function followupApprovalConfig(kind) {
    if (kind === 'released') {
      return {
        titlePrefix: '수습 해제',
        codeLabel: '처리 유형', nameLabel: '대상자',
        matCode: '수습 해제 (정규직 전환)',
        customReasons: ['수습 평가 통과', '업무 우수', '본인 희망', '기타'],
        defaultReason: '수습 평가 통과',
        contentExtra: ['· 발령일: 결재 완료 시점', '· 근무 유형: 정규직 전환', '· 수습 표시(뱃지) 해제'],
      };
    }
    if (kind === 'extended') {
      return {
        titlePrefix: '수습 기간 연장',
        codeLabel: '처리 유형', nameLabel: '대상자',
        matCode: '수습 연장',
        customReasons: ['평가 결과 보류', '추가 관찰 필요', '본인 요청', '기타'],
        defaultReason: '평가 결과 보류',
        contentExtra: ['· 연장 기간: 3개월 (기본)', '· 연장 후 종료일 결정은 결재 완료 후'],
      };
    }
    if (kind === 'terminated') {
      return {
        titlePrefix: '퇴사 처리 (수습 종료)',
        codeLabel: '처리 유형', nameLabel: '대상자',
        matCode: '수습 종료 (퇴사)',
        customReasons: ['수습 평가 미통과', '근태 불량', '본인 의사', '기타'],
        defaultReason: '수습 평가 미통과',
        contentExtra: ['· 퇴사일: 결재 완료일 또는 별도 지정', '· 퇴사 처리는 「퇴사 현황」 화면에 자동 반영'],
      };
    }
    return null;
  }
  function openFollowupApprovalDirect(pageEl, emp, kind) {
    if (!(window.App && typeof App.openSystemApprovalModal === 'function')) {
      window.toast && window.toast('전자결재 모듈이 준비되지 않았습니다.', 'warning');
      return;
    }
    const cfg = followupApprovalConfig(kind);
    if (!cfg) return;
    const contentLines = [
      `· 대상자: ${emp.name} (${emp.id}, ${emp.dept || '-'})`,
      `· 처리 유형: ${cfg.titlePrefix}`,
      `· 현재 수습 종료일: ${emp.probationEnd || '-'}`,
    ].concat(cfg.contentExtra || []);

    App.openSystemApprovalModal({
      docName: '수습평가-후속처리',
      titlePrefix: cfg.titlePrefix,
      codeLabel: cfg.codeLabel,
      nameLabel: cfg.nameLabel,
      matCode: cfg.matCode,
      matName: `${emp.name} (${emp.id})`,
      customReasons: cfg.customReasons,
      defaultReason: cfg.defaultReason,
      defaultApprovers: [],
      title: `${cfg.titlePrefix} 승인 요청 — ${emp.name}`,
      content: contentLines.join('\n'),
      attachments: [],
      payload: { followupKind: kind, empId: emp.id },
      onSubmit() {
        /* 승인 요청 완료 → session.postAction 마킹 + 화면 갱신 */
        const session = ensureSession(emp);
        session.postAction = { kind, at: TODAY, approvalStatus: 'pending' };
        if (session.status !== 'submitted') {
          session.status = 'submitted';
          session.submittedAt = TODAY;
        }
        window.toast && window.toast(`${cfg.titlePrefix} 승인 요청 접수`, 'success');
        renderListView(pageEl);
      },
    });
  }
  /* 후속 처리 모달 닫기.
     · confirm=true  → [확인] 클릭: 폼 값 수거 + session.postAction 마킹 + 처리 이력 탭으로 이동.
     · confirm=false → [닫기]/X/백드롭/ESC: 입력값·결과 모두 버리고 원상태 유지. */
  function closeFollowupModal(pageEl, confirm) {
    pageEl = pageEl || document.getElementById('page-hr-eval-prob');
    if (!pageEl) return;
    const ctx = STATE.followup;
    if (ctx && confirm) {
      const emp = memberById(ctx.empId);
      if (emp) {
        const session = ensureSession(emp);
        const formData = readFollowupForm(pageEl, ctx.kind);
        session.postAction = Object.assign({ kind: ctx.kind, at: TODAY, approvalStatus: 'pending' }, formData);
        if (session.status !== 'submitted') {
          session.status = 'submitted';
          session.submittedAt = TODAY;
        }
        window.toast && window.toast(`${actionLabel(ctx.kind)} 처리되었습니다.`, 'success');
      }
    }
    STATE.followup = null;
    const modal = pageEl.querySelector('[data-pep-followup-modal]');
    if (modal) modal.classList.remove('is-open');
    document.body.style.overflow = '';
    renderListView(pageEl);
  }
  function populateFollowupModal(pageEl) {
    const ctx = STATE.followup;
    if (!ctx) return;
    const emp = memberById(ctx.empId);
    if (!emp) { closeFollowupModal(pageEl); return; }
    const meta = postActionByKind(ctx.kind);
    const titleEl  = pageEl.querySelector('[data-pep-followup-title]');
    const subEl    = pageEl.querySelector('[data-pep-followup-sub]');
    const bodyEl   = pageEl.querySelector('[data-pep-followup-body]');
    const footerEl = pageEl.querySelector('[data-pep-followup-footer]');

    const heading = ({
      released:   '수습 해제 발령',
      extended:   '수습 기간 연장 처리',
      terminated: '퇴사 처리 (수습 종료)',
    })[ctx.kind] || '후속 처리';
    /* 타이틀에 종류가 이미 명시되므로 상태 뱃지·서브 텍스트는 노출하지 않음 */
    titleEl.textContent = heading;
    subEl.textContent = '';

    bodyEl.innerHTML = renderFollowupForm(emp, ctx.kind);
    /* [닫기] → 입력값·결과 모두 폐기 / [확인] → 액션 확정 + 처리 이력 탭으로 이동.
       hook 을 다르게 두어 사용자 의도를 명확히 분리한다. */
    footerEl.innerHTML = `
      <button class="btn" type="button" data-pep-followup-cancel>닫기</button>
      <button class="btn btn--primary" type="button" data-pep-followup-confirm>승인 요청</button>
    `;
    footerEl.querySelectorAll('[data-pep-followup-cancel]').forEach(b => b.addEventListener('click', () => closeFollowupModal(pageEl, false)));
    /* [확인] → 바로 처리하지 않고 시스템 전자결재 모달 호출 → 결재선 지정 후 onSubmit 에서 실제 후속 처리. */
    footerEl.querySelectorAll('[data-pep-followup-confirm]').forEach(b => b.addEventListener('click', () => requestFollowupApproval(pageEl)));
  }

  /* 후속 처리 승인 요청 — 거래처 수정 승인 요청 방식의 시스템 전자결재 모달 호출 */
  function requestFollowupApproval(pageEl) {
    const ctx = STATE.followup;
    if (!ctx) return;
    if (!(window.App && typeof App.openSystemApprovalModal === 'function')) {
      window.toast && window.toast('전자결재 모듈이 준비되지 않았습니다.', 'warning');
      return;
    }
    const emp = memberById(ctx.empId);
    if (!emp) return;
    const formData = readFollowupForm(pageEl, ctx.kind);
    const kindLabel = ({
      released:   '수습 해제',
      extended:   '수습 연장',
      terminated: '수습 종료(퇴사)',
    })[ctx.kind] || '후속 처리';

    const contentLines = [
      `· 대상자: ${emp.name} (${emp.id}, ${emp.dept || '-'})`,
      `· 처리 유형: ${kindLabel}`,
    ];
    if (ctx.kind === 'released') {
      contentLines.push(`· 발령일: ${formData.releaseDate || '-'}`);
      contentLines.push(`· 근무 유형: ${formData.newEmpType === 'regular' ? '정규직' : (formData.newEmpType || '-')}`);
      if (formData.note) contentLines.push(`· 비고: ${formData.note}`);
    } else if (ctx.kind === 'extended') {
      contentLines.push(`· 현재 수습 종료일: ${emp.probationEnd || '-'}`);
      contentLines.push(`· 연장 후 종료일: ${formData.newProbationEnd || '-'}`);
      if (formData.reason) contentLines.push(`· 연장 사유: ${formData.reason}`);
    } else if (ctx.kind === 'terminated') {
      if (formData.terminationDate) contentLines.push(`· 퇴사일: ${formData.terminationDate}`);
      if (formData.reason) contentLines.push(`· 사유: ${formData.reason}`);
    }

    /* 후속 처리 모달은 그대로 두고, 시스템 모달이 위에 올라온다 (z-index 동일이지만 나중에 열린 것이 우선) */
    const fupModal = pageEl.querySelector('[data-pep-followup-modal]');
    if (fupModal) fupModal.style.visibility = 'hidden';

    App.openSystemApprovalModal({
      docName: '수습평가-후속처리',
      titlePrefix: '수습 평가 후속 처리',
      codeLabel: '처리 유형',
      nameLabel: '대상자',
      matCode: kindLabel,
      matName: `${emp.name} (${emp.id})`,
      customReasons: ['수습 평가 결과', '근태 불량', '업무 적합성', '본인 사정', '기타'],
      defaultReason: '수습 평가 결과',
      defaultApprovers: [],
      title: `${kindLabel} 승인 요청 — ${emp.name}`,
      content: contentLines.join('\n'),
      attachments: [],
      payload: { followupKind: ctx.kind, empId: emp.id, formData },
      onSubmit() {
        if (fupModal) fupModal.style.visibility = '';
        /* 승인 요청 등록 후 — 기존 로직(closeFollowupModal confirm=true) 으로 후속 처리 마킹 */
        closeFollowupModal(pageEl, true);
        window.toast && window.toast(`${kindLabel} 승인 요청 접수`, 'success');
      },
    });

    /* 사용자가 시스템 모달 취소 시 followup 모달 복원 */
    setTimeout(() => {
      const sysapr = document.querySelector('[data-sysapr-host]');
      if (!sysapr || !sysapr.classList.contains('is-open')) {
        if (fupModal) fupModal.style.visibility = '';
      }
    }, 250);
  }
  function renderFollowupForm(emp, kind) {
    /* 각 액션의 핵심 정보를 form-field 로 노출. 필요 입력은 최소화 — 닫기 시 어떤 값이든 그대로 보존. */
    const cardHTML = `
      <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:14px 18px;margin-bottom:14px;display:flex;align-items:center;gap:14px;">
        ${avatarHTML(emp, 'sm')}
        <div style="flex:1;min-width:0;">
          <strong style="color:var(--color-text);font-size:var(--fs-md);">${esc(emp.name)}</strong>
          <small style="color:var(--color-text-muted);font-weight:var(--fw-regular);margin-left:6px;">${esc(emp.id)}</small>
          <div style="font-size:var(--fs-xs);color:var(--color-text-muted);margin-top:2px;">${esc(emp.dept || '-')} · ${esc(emp.position || '-')} · ${esc(emp.rank || '-')}</div>
        </div>
      </section>
    `;
    if (kind === 'released') {
      return cardHTML + `
        <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:18px 22px;">
          <div class="form-field">
            <label class="form-label is-required">발령일</label>
            <input class="input" type="date" data-pep-fup-field="releaseDate" value="${esc(TODAY)}" />
          </div>
          <div class="form-field">
            <label class="form-label">근무 유형</label>
            <select class="select" data-pep-fup-field="newEmpType">
              <option value="regular" selected>정규직</option>
            </select>
          </div>
          <div class="form-field" style="margin-bottom:0;">
            <label class="form-label">비고</label>
            <textarea class="input input--full" rows="3" data-pep-fup-field="note" placeholder="발령에 관한 메모 (선택)"></textarea>
          </div>
        </section>
      `;
    }
    if (kind === 'extended') {
      const newEnd = addMonths(emp.probationEnd || TODAY, 3);
      return cardHTML + `
        <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:18px 22px;">
          <div class="form-field">
            <label class="form-label">현재 수습 종료일</label>
            <input class="input" type="date" value="${esc(emp.probationEnd || '')}" disabled />
          </div>
          <div class="form-field">
            <label class="form-label is-required">연장 후 수습 종료일</label>
            <input class="input" type="date" data-pep-fup-field="newProbationEnd" value="${esc(newEnd)}" />
          </div>
          <div class="form-field" style="margin-bottom:0;">
            <label class="form-label is-required">연장 사유</label>
            <textarea class="input input--full" rows="4" data-pep-fup-field="reason" placeholder="수습 기간 연장이 필요한 사유를 작성해주세요."></textarea>
          </div>
        </section>
      `;
    }
    if (kind === 'terminated') {
      const defaultDate = emp.probationEnd && emp.probationEnd >= TODAY ? emp.probationEnd : TODAY;
      return cardHTML + `
        <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:18px 22px;">
          <div class="form-field">
            <label class="form-label is-required">퇴사일</label>
            <input class="input" type="date" data-pep-fup-field="retiredAt" value="${esc(defaultDate)}" />
          </div>
          <div class="form-field">
            <label class="form-label">퇴사 사유</label>
            <input class="input" type="text" value="수습 종료 (미전환)" disabled />
          </div>
          <div class="form-field" style="margin-bottom:0;">
            <label class="form-label">비고</label>
            <textarea class="input input--full" rows="3" data-pep-fup-field="note" placeholder="퇴사 처리 관련 메모 (선택)"></textarea>
          </div>
        </section>
      `;
    }
    return cardHTML;
  }
  function readFollowupForm(pageEl, kind) {
    const data = {};
    pageEl.querySelectorAll('[data-pep-fup-field]').forEach(el => {
      data[el.dataset.pepFupField] = el.value;
    });
    return data;
  }

  /* 성명 클릭 — 입사자 관리 인사정보카드 drawer 호출.
     실 데이터(allMembers) 의 emp 는 풍부한 필드 보유, MOCK_PROB 는 최소 필드만 있어
     필수값 기본 보정 후 전달 (HRInfoCard.open 내부에서 fname/gname 도 자동 분리). */
  function openHrInfoCard(empId) {
    const emp = memberById(empId);
    if (!emp || !window.App || !App.HRInfoCard) return;
    const empForCard = Object.assign({
      empType: 'regular',
      jobCat: 'office',
      site: '본사',
      infoStatus: 'done',
    }, emp);
    App.HRInfoCard.open(empForCard);
  }
  function closeEvalModal(pageEl) {
    pageEl = pageEl || document.getElementById('page-hr-eval-prob');
    /* 현재 활성 차수에 부분 응답이 있고 아직 제출 전이면 '임시저장 하시겠습니까?' 확인.
       - 확인: 차수 상태 유지 (입력값은 즉시 STATE 에 반영됨)
       - 취소: 현재 차수 응답값만 초기화 (제출된 앞 차수는 보존) */
    const emp = STATE.selectedEmpId ? memberById(STATE.selectedEmpId) : null;
    const session = emp ? STATE.sessions[emp.id] : null;
    const cur = session ? activeStage(session) : null;
    if (cur) {
      const tpl = templateOf(emp, session);
      const ratio = stageCompletionRatio(cur, tpl);
      const hasResponse = ratio > 0 || (cur.comment || '').trim() || cur.result;
      if (hasResponse && ratio < 1) {
        const save = confirm('입력한 평가가 아직 완료되지 않았습니다.\n임시저장 하시겠습니까?\n\n[확인] 임시저장 후 닫기  [취소] 입력값 초기화 후 닫기');
        if (!save) {
          cur.responses = {};
          cur.comment = '';
          cur.result = null;
          cur.status = 'ready';
          window.toast && window.toast('입력값이 초기화되었습니다.', 'info');
        } else {
          if (cur.status === 'ready') cur.status = 'inProgress';
          window.toast && window.toast('임시저장 되었습니다.', 'success');
        }
      }
    }
    /* offcanvas + backdrop 양쪽 닫기 */
    const oc = pageEl && pageEl.querySelector('[data-pep-eval-modal]');
    const bd = pageEl && pageEl.querySelector('[data-pep-eval-host]');
    if (oc) { oc.classList.remove('is-open'); oc.setAttribute('aria-hidden', 'true'); }
    if (bd) bd.classList.remove('is-open');
    document.body.style.overflow = '';
    STATE.selectedEmpId = null;
    /* 표 재계산 (진행률/결과 갱신) — 전체 재렌더 */
    if (pageEl) renderListView(pageEl);
  }

  /* 모달 상단 차수 스텝퍼 — UI Kit .steps-h. 실제 차수만 표시(확정 노드 없음). 항상 노출.
     opts.withPriorBtn=true 이면 제출 완료된 차수에 [평가내용 보기] 버튼을 달아 모달로 전체 양식을 확인. */
  function renderStageStepperModal(session, opts) {
    const withPriorBtn = !!(opts && opts.withPriorBtn);
    const stages = session.stages || [];
    if (!stages.length) return '';
    const curIdx = activeStageIdx(session);
    const allDone = isAllStagesSubmitted(session);
    const steps = stages.map(st => {
      const isCurrent = !allDone && st.idx === curIdx;
      const done = st.status === 'submitted';
      const cls = isCurrent ? 'is-current' : (done ? 'is-done' : '');
      const viewBtn = (withPriorBtn && done)
        ? `<button class="btn btn--xs" type="button" data-pep-prior="${st.idx}" style="margin-top:5px;">평가내용 보기</button>`
        : '';
      return `<li class="steps-h__item ${cls}">
        <span class="steps-h__num">${st.idx + 1}</span>
        <div class="steps-h__body"><span class="steps-h__title">${st.idx + 1}차</span><span class="steps-h__sub">${esc(st.value || criterionLabel(st.criterion))}</span>${viewBtn}</div>
      </li>`;
    });
    /* 투명 div 로만 감싼다 — steps-h 가 flex 컬럼의 직접 자식이 되면 높이가 붕괴(납작)되므로
       블록 컨텍스트를 주되, 테두리/배경 없는 div 라 시각적 이중 박스는 생기지 않는다. */
    return `<div><ol class="steps-h" style="margin:0;">${steps.join('')}</ol></div>`;
  }

  /* 차수 결과 pill (전환/보류/미전환) — 작은 인라인 버전 */
  function stageResultPill(code) {
    const map = {
      pass: { l: '전환',   c: 'pill--success' },
      hold: { l: '보류',   c: 'pill--warning' },
      fail: { l: '미전환', c: 'pill--danger'  },
    };
    const m = map[code];
    if (!m) return '<span class="t-muted" style="font-size:var(--fs-xs);">미선택</span>';
    return `<span class="pill ${m.c}" style="font-size:var(--fs-xs);">${m.l}</span>`;
  }

  function populateEvalModal(pageEl) {
    const emp = memberById(STATE.selectedEmpId);
    if (!emp) { closeEvalModal(pageEl); return; }
    const session = ensureSession(emp);
    const tpl = templateOf(emp, session);
    const stages = session.stages || [];
    const allDone = isAllStagesSubmitted(session);
    const cur = allDone ? null : activeStage(session);
    const isFinalStage = cur && cur.idx === stages.length - 1;
    const evStage = cur || lastStage(session);
    const ev = evStage && evStage.evaluatorId ? memberById(evStage.evaluatorId) : null;

    const titleEl  = pageEl.querySelector('[data-pep-eval-title]');
    const subEl    = pageEl.querySelector('[data-pep-eval-sub]');
    const bodyEl   = pageEl.querySelector('[data-pep-eval-body]');
    const footerEl = pageEl.querySelector('[data-pep-eval-footer]');

    let statusPill, sub;
    if (allDone) {
      statusPill = `<span class="pill pill--success" style="font-size:var(--fs-xs);margin-left:6px;vertical-align:middle;">제출 완료</span>`;
      sub = '전체 차수 평가 완료';
    } else {
      const ratio = stageCompletionRatio(cur, tpl);
      const pct = Math.round(ratio * 100);
      statusPill = ratio > 0
        ? `<span class="pill pill--warning" style="font-size:var(--fs-xs);margin-left:6px;vertical-align:middle;">진행중 ${pct}%</span>`
        : `<span class="pill" style="font-size:var(--fs-xs);margin-left:6px;vertical-align:middle;">미시작</span>`;
      sub = `${cur.idx + 1}차 평가${isFinalStage ? ' (최종)' : ''} · 진행자 ${ev ? ev.name : '-'}`;
    }

    titleEl.innerHTML = `${esc(emp.name)} 수습 평가 ${statusPill}`;
    subEl.textContent = sub;

    if (allDone) {
      /* 검토 모드 — 전체 차수 읽기 전용 */
      bodyEl.innerHTML = `
        ${renderTargetCard(emp, ev, lastStage(session))}
        ${renderStageStepperModal(session)}
        ${stages.map(st => renderStageReviewBlock(tpl, st, st.idx === stages.length - 1)).join('')}
      `;
      footerEl.innerHTML = `
        <span style="flex:1;font-size:var(--fs-xs);color:var(--color-text-muted);">제출이 완료되어 수정·취소할 수 없습니다.</span>
        <button class="btn" type="button" data-pep-eval-close>닫기</button>`;
    } else {
      bodyEl.innerHTML = `
        ${renderTargetCard(emp, ev, cur)}
        ${renderStageStepperModal(session, { withPriorBtn: true })}
        ${renderTemplatePicker(session, cur.idx > 0)}
        <div data-pep-active-form style="display:flex;flex-direction:column;gap:14px;">
          ${renderFormSection(tpl, cur, false, cur.idx)}
          ${renderCommentSection(cur, false, cur.idx)}
          ${isFinalStage ? renderResultSection(cur, false, true) : ''}
        </div>
      `;
      footerEl.innerHTML = `
        <button class="btn" type="button" data-pep-eval-close>닫기</button>
        <button class="btn" type="button" data-pep-save>임시저장</button>
        <button class="btn btn--primary" type="button" data-pep-submit>${isFinalStage ? '제출 및 결과 확정' : `${cur.idx + 1}차 제출`}</button>`;
    }

    bindEvalForm(pageEl, emp, session, tpl, cur);
    footerEl.querySelectorAll('[data-pep-eval-close]').forEach(b => b.addEventListener('click', () => closeEvalModal(pageEl)));
  }

  /* 검토 모드 — 한 차수의 결과를 읽기 전용 블록으로 (헤더 + 양식 + 의견 + 결과) */
  function renderStageReviewBlock(tpl, stage, isFinal) {
    const ev = stage.evaluatorId ? memberById(stage.evaluatorId) : null;
    const score = stageScore(stage, tpl);
    return `
      <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:14px 18px;display:flex;flex-direction:column;gap:12px;">
        <header style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;border-bottom:1px solid var(--color-divider);padding-bottom:10px;">
          <span style="display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 7px;border-radius:var(--radius-pill);background:var(--color-active);color:var(--color-brand-primary);font-size:var(--fs-xs);font-weight:var(--fw-semibold);">${stage.idx + 1}차${isFinal ? ' (최종)' : ''}</span>
          ${ev ? `<span style="display:inline-flex;align-items:center;gap:5px;font-size:var(--fs-sm);color:var(--color-text-sub);">${avatarHTML(ev, 'xs')}${esc(ev.name)}</span>` : ''}
          <span style="flex:1;"></span>
          <span style="font-size:var(--fs-sm);color:var(--color-text-sub);">환산 점수 <strong style="color:var(--color-brand-primary);">${score}</strong>점</span>
          ${stage.result ? stageResultPill(stage.result) : ''}
        </header>
        ${renderFormSection(tpl, stage, true, stage.idx)}
        ${(stage.comment || '').trim() ? `<div style="font-size:var(--fs-sm);color:var(--color-text-sub);line-height:1.55;white-space:pre-wrap;background:var(--color-surface-alt);border:1px solid var(--color-divider);border-radius:var(--radius-sm);padding:10px 12px;"><strong style="display:block;font-size:var(--fs-xs);color:var(--color-text-muted);margin-bottom:4px;">종합 의견</strong>${esc(stage.comment)}</div>` : ''}
      </section>
    `;
  }

  function renderTargetCard(emp, ev, stage) {
    const probPeriod = (emp.probationStart || emp.probationEnd)
      ? `${emp.probationStart || '?'} ~ ${emp.probationEnd || '?'}`
      : '';
    return `
      <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:14px 18px;display:flex;align-items:center;gap:14px;">
        ${avatarHTML(emp, 'lg')}
        <div style="flex:1;min-width:0;">
          <div style="font-size:var(--fs-lg);font-weight:var(--fw-semibold);color:var(--color-text);">
            ${esc(emp.name)}
            <small style="color:var(--color-text-muted);font-weight:var(--fw-regular);font-size:var(--fs-sm);margin-left:6px;">${esc(emp.id)}</small>
          </div>
          <div style="font-size:var(--fs-sm);color:var(--color-text-sub);margin-top:4px;">
            ${esc(emp.dept || '-')} · ${esc(emp.position || '-')} · ${esc(emp.rank || '-')}
            ${emp.joinDate ? ` · 입사 ${esc(emp.joinDate)}` : ''}
          </div>
          ${probPeriod ? `
            <div style="font-size:var(--fs-sm);color:var(--color-text-sub);margin-top:4px;display:inline-flex;align-items:center;gap:6px;">
              <span style="font-size:var(--fs-xs);color:var(--color-text-muted);">수습기간</span>
              <strong style="font-weight:var(--fw-medium);color:var(--color-text);">${esc(probPeriod)}</strong>
            </div>
          ` : ''}
        </div>
        ${ev ? `
          <div style="text-align:right;font-size:var(--fs-sm);">
            <div style="font-size:var(--fs-xs);color:var(--color-text-muted);">${stage ? `${stage.idx + 1}차 진행자` : '평가자'}</div>
            <div style="display:flex;align-items:center;gap:6px;justify-content:flex-end;margin-top:4px;">
              ${avatarHTML(ev, 'xs')}
              <strong>${esc(ev.name)}</strong>
              <small style="color:var(--color-text-muted);font-weight:var(--fw-regular);">${esc(ev.dept || '')}</small>
            </div>
          </div>
        ` : ''}
      </section>
    `;
  }

  /* 평가 양식 선택 — 직책자용 / 비직책자용 토글.
     1차에서만 변경 가능. 2차 이후(readonly)는 1차에서 선택한 양식 고정. */
  function renderTemplatePicker(session, readonly) {
    const cur = session.templateKey || 'staff';
    const btn = (key, label) => `
      <button class="btn btn--sm ${cur === key ? 'is-active' : ''}" type="button"
        data-pep-tpl="${esc(key)}" ${readonly ? 'disabled' : ''}>${esc(label)}</button>
    `;
    return `
      <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:14px 18px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
        <div style="display:flex;flex-direction:column;gap:2px;flex:1;min-width:0;">
          <strong style="font-size:var(--fs-sm);color:var(--color-text);">평가 양식</strong>
          <small style="color:var(--color-text-muted);font-size:var(--fs-xs);">${readonly ? '1차에서 선택한 양식이 전 차수에 적용됩니다.' : '대상자의 직책/직무에 맞는 양식을 선택하세요.'}</small>
        </div>
        <div class="btn-toggle" data-pep-tpl-group>
          ${btn('staff',  '비직책자용')}
          ${btn('leader', '직책자용')}
        </div>
      </section>
    `;
  }

  function renderFormSection(tpl, stage, readonly, stageIdx) {
    const scale = tpl.scale || 5;
    const si = (typeof stageIdx === 'number') ? stageIdx : 0;
    /* 척도별 명칭 — 양식에 scaleLabels 지정되어 있으면 사용, 아니면 기본값. 길이 불일치 시도 기본값 fallback. */
    const tplLabels = tpl.scaleLabels && tpl.scaleLabels[scale];
    const labels = (Array.isArray(tplLabels) && tplLabels.length === scale)
      ? tplLabels
      : (DEFAULT_SCALE_LABELS[scale] || []);
    const responses = stage.responses || {};
    const sectionsHTML = tpl.sections.map((sec, sIdx) => {
      const itemsHTML = (sec.items || []).map((it, iIdx) => {
        const cur = Number(responses[it.id] || 0);
        const opts = Array.from({ length: scale }, (_, k) => {
          const v = k + 1;
          const on = cur === v ? 'is-on' : '';
          return `
            <label class="likert__opt ${on}">
              <input type="radio" name="pep-q-${si}-${esc(it.id)}" value="${v}" ${cur === v ? 'checked' : ''} ${readonly ? 'disabled' : ''} />
              <span class="likert__num">${v}</span>
              <span class="likert__lbl">${esc(labels[k] || '')}</span>
            </label>
          `;
        }).join('');
        return `
          <div data-pep-item="${esc(it.id)}" style="padding:14px 16px;border:1px solid var(--color-divider);border-radius:var(--radius-md);background:var(--color-surface);display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;align-items:baseline;gap:10px;">
              <span style="font-size:var(--fs-xs);color:var(--color-brand-primary);font-weight:var(--fw-semibold);min-width:36px;">Q${sIdx + 1}-${iIdx + 1}</span>
              <span style="flex:1;font-size:var(--fs-md);color:var(--color-text);">${esc(it.text)}</span>
            </div>
            <div class="likert ${readonly ? 'likert--readonly' : ''}" data-value="${cur}">${opts}</div>
          </div>
        `;
      }).join('');
      return `
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div style="display:flex;align-items:center;gap:8px;padding:8px 0 4px;border-bottom:1px solid var(--color-divider);">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:var(--radius-sm);background:var(--color-brand-primary);color:#fff;font-size:var(--fs-xs);font-weight:var(--fw-bold);">${sIdx + 1}</span>
            <strong style="font-size:var(--fs-md);">${esc(sec.name)}</strong>
            <small style="color:var(--color-text-muted);font-size:var(--fs-xs);">${(sec.items || []).length} 문항</small>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;">${itemsHTML}</div>
        </div>
      `;
    }).join('');
    return `
      <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:18px 22px;display:flex;flex-direction:column;gap:14px;">
        <header style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;border-bottom:1px solid var(--color-divider);padding-bottom:10px;">
          <div>
            <h3 style="font-size:var(--fs-lg);font-weight:var(--fw-semibold);margin:0;">${esc(tpl.name)}</h3>
            <small style="color:var(--color-text-muted);font-size:var(--fs-sm);">${esc(tpl.description)}</small>
          </div>
          <small style="color:var(--color-text-muted);font-size:var(--fs-xs);">${scale}점 척도 · 시스템 제공 양식</small>
        </header>
        ${sectionsHTML}
      </section>
    `;
  }

  function renderCommentSection(stage, readonly) {
    return `
      <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:18px 22px;">
        <header style="margin-bottom:10px;">
          <h3 style="font-size:var(--fs-md);font-weight:var(--fw-semibold);margin:0;">종합 의견 <small style="font-weight:var(--fw-regular);color:var(--color-text-muted);">(선택)</small></h3>
        </header>
        <textarea class="input input--full" id="pep-comment" rows="7" ${readonly ? 'disabled' : ''} placeholder="수습 기간 동안의 적응도, 강점·개선 포인트, 다음 차수 평가에 참고할 종합 의견을 작성해주세요.">${esc(stage.comment || '')}</textarea>
      </section>
    `;
  }

  /* 결과 카드 — 전환/보류/미전환 세 가지 옵션을 큰 카드로 표현.
     선택 상태는 톤 컬러 보더 + 상단 라벨 강조. 비활성(readonly) 모드에서도 시각 동일.
     isFinal=true 면 최종 결과(후속 처리 트리거), 아니면 차수 권고. */
  function renderResultSection(stage, readonly, isFinal) {
    const r = stage.result;
    const RESULT_OPTS = [
      { key: 'pass', label: '전환',   desc: isFinal ? '정규직 전환 권고 — 수습 평가 통과' : '전환 권고 — 수습 평가 통과',
        tone: 'var(--color-success)', icon: '<polyline points="20 6 9 17 4 12"/>' },
      { key: 'hold', label: '보류',   desc: '추가 검증 필요 — 수습 기간 연장 또는 재평가',
        tone: 'var(--color-warning)', icon: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>' },
      { key: 'fail', label: '미전환', desc: isFinal ? '정규직 전환 부적합 — 수습 종료 권고' : '미전환 권고 — 부적합',
        tone: 'var(--color-danger)',  icon: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' },
    ];
    const cards = RESULT_OPTS.map(o => {
      const on = r === o.key;
      return `
        <label data-pep-result-card="${o.key}" style="
          display:flex;flex-direction:column;gap:8px;
          padding:14px 16px 16px;
          border:2px solid ${on ? o.tone : 'var(--color-border)'};
          border-radius:var(--radius-md);
          background:${on ? `color-mix(in srgb, ${o.tone} 6%, #fff)` : '#fff'};
          cursor:${readonly ? 'default' : 'pointer'};
          transition:border-color var(--t-fast), background var(--t-fast);
          position:relative;
          ">
          <input type="radio" name="pep-result" value="${o.key}" ${on ? 'checked' : ''} ${readonly ? 'disabled' : ''}
            style="position:absolute;opacity:0;pointer-events:none;" />
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="width:28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;
                         background:${on ? o.tone : 'var(--color-surface-alt)'};color:${on ? '#fff' : 'var(--color-text-muted)'};transition:all var(--t-fast);">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${o.icon}</svg>
            </span>
            <strong style="font-size:var(--fs-md);color:${on ? o.tone : 'var(--color-text)'};font-weight:var(--fw-semibold);">${o.label}</strong>
          </div>
          <small style="color:var(--color-text-sub);font-size:var(--fs-xs);line-height:1.5;">${o.desc}</small>
        </label>
      `;
    }).join('');
    return `
      <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:18px 22px;">
        <header style="margin-bottom:12px;">
          <h3 style="font-size:var(--fs-md);font-weight:var(--fw-semibold);margin:0;">${isFinal ? '최종 결과' : `${stage.idx + 1}차 평가 결과`} <small style="font-weight:var(--fw-regular);color:var(--color-text-muted);">${isFinal ? '(필수 — 제출 시 후속 처리 진행)' : '(필수 — 차수 권고)'}</small></h3>
        </header>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;" data-pep-result-group>
          ${cards}
        </div>
      </section>
    `;
  }

  function bindEvalForm(pageEl, emp, session, tpl, cur) {
    const stages = session.stages || [];
    const isFinalStage = cur && cur.idx === stages.length - 1;

    /* 평가 양식 picker — 1차에서만 활성. 클릭 시 session.templateKey 변경 + 모달 본문 재렌더 */
    const tplGroup = pageEl.querySelector('[data-pep-tpl-group]');
    if (tplGroup) tplGroup.addEventListener('click', e => {
      const btn = e.target.closest('[data-pep-tpl]');
      if (!btn || btn.disabled) return;
      const key = btn.dataset.pepTpl;
      if (!key || key === session.templateKey) return;
      session.templateKey = key;
      /* 양식 변경 — 응답값은 itemId 가 양식별로 다르므로 자연스럽게 새 양식에서 빈 상태로 노출됨. */
      populateEvalModal(pageEl);
    });

    /* 검토 모드(cur 없음) — 제출 완료 후에는 수정·취소 불가. 별도 바인딩 없음. */
    if (!cur) {
      return;
    }

    /* likert — 현재 활성 차수 폼 영역으로 한정 (이전 차수 참조 패널의 readonly 입력 제외) */
    const activeForm = pageEl.querySelector('[data-pep-active-form]') || pageEl;
    activeForm.querySelectorAll('[data-pep-item]').forEach(itemEl => {
      const itemId = itemEl.dataset.pepItem;
      itemEl.querySelectorAll('input[type="radio"]').forEach(rb => {
        rb.addEventListener('change', () => {
          if (!rb.checked) return;
          cur.responses[itemId] = Number(rb.value);
          itemEl.querySelectorAll('.likert__opt').forEach(o => {
            const ib = o.querySelector('input[type="radio"]');
            o.classList.toggle('is-on', !!ib && ib.checked);
          });
          const lk = itemEl.querySelector('.likert'); if (lk) lk.dataset.value = rb.value;
          if (cur.status === 'ready') cur.status = 'inProgress';
          if (session.status === 'ready') session.status = 'inProgress';
        });
      });
    });

    /* 코멘트 */
    const ta = activeForm.querySelector('#pep-comment');
    if (ta) ta.addEventListener('input', () => { cur.comment = ta.value; });

    /* 결과 카드 — 카드 전체가 클릭 타겟. 클릭 시 cur.result 변경 + 본문 재렌더 */
    const rg = activeForm.querySelector('[data-pep-result-group]');
    if (rg) rg.addEventListener('click', e => {
      const card = e.target.closest('[data-pep-result-card]');
      if (!card) return;
      const key = card.dataset.pepResultCard;
      const rb = card.querySelector('input[type="radio"]');
      if (!rb || rb.disabled) return;
      if (cur.result === key) return;
      cur.result = key;
      populateEvalModal(pageEl);
    });

    /* 액션 */
    const save = pageEl.querySelector('[data-pep-save]');
    if (save) save.addEventListener('click', () => {
      if (cur.status === 'ready') cur.status = 'inProgress';
      window.toast && window.toast('임시저장 되었습니다.', 'success');
    });
    const submit = pageEl.querySelector('[data-pep-submit]');
    if (submit) submit.addEventListener('click', () => {
      /* 최종 차수에서만 결과(전환/보류/미전환) 필수. 그 외 차수는 점수 + 종합 의견만 작성. */
      if (isFinalStage && !cur.result) { alert('최종 결과(전환/보류/미전환) 를 선택해주세요.'); return; }
      const ratio = stageCompletionRatio(cur, tpl);
      if (ratio < 1) {
        if (!confirm('아직 점수를 부여하지 않은 문항이 있습니다.\n그래도 제출하시겠습니까?')) return;
      } else if (isFinalStage) {
        if (!confirm('최종 차수입니다. 제출 후에는 결과에 따른 후속 처리(수습 해제/연장/종료) 모달이 열립니다.\n\n※ 제출 후에는 수정 및 제출 취소가 불가능합니다.\n제출하시겠습니까?')) return;
      } else {
        if (!confirm(`${cur.idx + 1}차 평가를 제출합니다.\n제출 후 ${cur.idx + 2}차 진행자가 평가를 이어서 진행할 수 있습니다.\n\n※ 제출 후에는 수정 및 제출 취소가 불가능합니다. 계속하시겠습니까?`)) return;
      }
      cur.status = 'submitted';
      cur.submittedAt = TODAY;

      if (!isFinalStage) {
        /* 다음 차수로 진행 — 모달을 다음 차수 평가로 갱신 */
        if (session.status === 'ready') session.status = 'inProgress';
        window.toast && window.toast(`${cur.idx + 1}차 평가가 제출되었습니다. ${cur.idx + 2}차로 진행합니다.`, 'success');
        populateEvalModal(pageEl);
        return;
      }

      /* 최종 차수 — 결과 확정 + 후속 처리 모달 */
      session.result = cur.result;
      session.status = 'submitted';
      const meta = POSTACTION[session.result];
      const evalOc = pageEl.querySelector('[data-pep-eval-modal]');
      const evalBd = pageEl.querySelector('[data-pep-eval-host]');
      if (evalOc) { evalOc.classList.remove('is-open'); evalOc.setAttribute('aria-hidden', 'true'); }
      if (evalBd) evalBd.classList.remove('is-open');
      STATE.selectedEmpId = null;
      if (meta) openFollowupModal(pageEl, emp.id, meta.kind);
      else renderListView(pageEl);
    });
  }

  /* =========================================================
   *  외부 API — 수습 평가 결과 조회용 (App.HRProbEval.getResult)
   * ========================================================= */
  App.HRProbEval = {
    /* 제출된 결과만 반환 — 마지막 차수 기준. { result, score(=0~100 환산), submittedAt, evaluatorId } 또는 null */
    getResult(empId) {
      const s = STATE.sessions[empId];
      if (!s || s.status !== 'submitted' || !isAllStagesSubmitted(s)) return null;
      const emp = memberById(empId);
      const tpl = emp ? templateOf(emp, s) : null;
      const last = lastStage(s);
      const score = tpl && last ? stageScore(last, tpl) : 0;
      return {
        result: s.result,                /* 'pass' | 'hold' | 'fail' — 마지막 차수 결과 */
        score, completionRatio: tpl && last ? stageCompletionRatio(last, tpl) : 0,
        comment: last ? last.comment : '',
        submittedAt: last ? last.submittedAt : null,
        evaluatorId: last ? last.evaluatorId : null,
        templateKey: s.templateKey,
        stages: (s.stages || []).map(st => ({ idx: st.idx, result: st.result, score: tpl ? stageScore(st, tpl) : 0, evaluatorId: st.evaluatorId })),
      };
    },
    /* 진행 상태 — 'submitted' | 'inProgress' | 'ready' | 'none' */
    getStatus(empId) {
      const s = STATE.sessions[empId];
      if (!s) return 'none';
      return s.status === 'ready' ? 'ready' : s.status;
    },
    /* ── 평가 차수(평가 단계) 설정 API — page-hr-eval-prob-set 「평가 단계 설정」 탭 ── */
    getStageConfig() {
      return {
        stages: cloneStages(STAGE_CONFIG.stages),
        version: STAGE_CONFIG.version,
        updatedAt: STAGE_CONFIG.updatedAt,
        updatedBy: STAGE_CONFIG.updatedBy,
        history: (STAGE_CONFIG.history || []).slice(),
      };
    },
    /* 저장 — 합계 100% 검증은 호출측(설정 화면). 여기서는 1~3단계 범위만 방어.
       reason(수정 사유) 필수 — 변경 이력 1건 누적 + 버전 bump. */
    saveStageConfig(stages, reason) {
      const arr = cloneStages(stages).filter(s => s && s.value);
      if (!arr.length) return this.getStageConfig();
      STAGE_CONFIG.stages = arr.slice(0, MAX_STAGES);
      if (!reason || !reason.trim()) reason = '평가 단계 변경';
      const last = STAGE_CONFIG.history[STAGE_CONFIG.history.length - 1];
      const newNum = Number((last && last.v || 'v0').replace(/^v/, '')) + 1;
      const newVer = 'v' + newNum;
      STAGE_CONFIG.version = newVer;
      STAGE_CONFIG.updatedAt = TODAY;
      STAGE_CONFIG.updatedBy = '정혜진';
      STAGE_CONFIG.history.push({ v: newVer, publishedAt: TODAY, publisher: '정혜진', changeReason: reason });
      return this.getStageConfig();
    },
    maxStages() { return MAX_STAGES; },
    stageCriteria() { return STAGE_CRITERIA.map(c => ({ key: c.key, label: c.label })); },
    criterionLabel(k) { return criterionLabel(k); },
    criterionValues(k) { return stageCriterionValues(k); },
    roleValues() { return ROLE_VALUES.slice(); },
    positionValues() { return POSITION_VALUES.slice(); },

    /* ── 수습 평가 설정 (page-hr-eval-prob-set) 용 양식 관리 API ── */
    getTemplates() {
      return { leader: TEMPLATES.leader, staff: TEMPLATES.staff };
    },
    getTemplate(key) {
      return TEMPLATES[key] || null;
    },
    /* 척도별 기본 명칭 — 설정 화면에서 placeholder 및 normalize 용 */
    defaultScaleLabels(n) {
      return (DEFAULT_SCALE_LABELS[n] || []).slice();
    },
    /* 양식 저장 — 기존 키에 새 데이터 덮어쓰고 버전 히스토리 1건 추가.
       draft 는 { name, description, scale, scaleLabels, sections } 만 사용 (key 는 immutable).
       reason 은 변경 사유(필수). */
    saveTemplate(key, draft, reason) {
      const t = TEMPLATES[key];
      if (!t) return null;
      if (!reason || !reason.trim()) reason = '내용 수정';
      t.name = draft.name || t.name;
      t.description = draft.description || t.description;
      if (draft.scale) t.scale = Number(draft.scale) || t.scale;
      /* scaleLabels — 단계별 명칭. { 3:[..], 5:[..], 7:[..] } 부분 업데이트 허용. */
      if (draft.scaleLabels && typeof draft.scaleLabels === 'object') {
        t.scaleLabels = t.scaleLabels || {};
        [3, 5, 7].forEach(n => {
          if (Array.isArray(draft.scaleLabels[n]) && draft.scaleLabels[n].length === n) {
            t.scaleLabels[n] = draft.scaleLabels[n].slice();
          }
        });
      }
      if (Array.isArray(draft.sections)) t.sections = draft.sections;
      /* 버전 bump — v1 → v2 → ... */
      const last = t.versionHistory[t.versionHistory.length - 1];
      const newNum = Number((last.v || 'v0').replace(/^v/, '')) + 1;
      const newVer = 'v' + newNum;
      const publishedAt = TODAY;
      const publisher = '정혜진';
      t.version = newVer;
      t.updatedAt = publishedAt;
      t.updatedBy = publisher;
      t.versionHistory.push({ v: newVer, publishedAt, publisher, changeReason: reason });
      return t;
    },
  };

  /* =========================================================
   *  Page Init
   * ========================================================= */
  function initPage() {
    const pageEl = document.getElementById('page-hr-eval-prob');
    if (!pageEl) return;
    pageEl.__onShow = () => renderListView(pageEl);
  }
  const prev = App.initPages;
  App.initPages = function () {
    if (typeof prev === 'function') prev();
    initPage();
  };
})();
