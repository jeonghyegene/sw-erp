/* =========================================================
 * Page: HR > 평가 관리 > 평가 회차
 *
 *  개요
 *   - 인사담당자가 평가를 개설하고 대상자를 확정하여 구성원들이 평가에 참여할 수 있도록 세팅한다.
 *
 *  View
 *   1) list   — 평가 회차 목록
 *   2) detail — 상세 조회 (상태에 따라 READ-only 또는 UPDATE)
 *   3) create — 신규 등록
 *
 *  Status (4종)
 *   - pending    : 대기      → UPDATE/DELETE 가능
 *   - inProgress : 평가 진행중 → READ-only
 *   - closed     : 평가 종료  → READ-only
 *   - finalized  : 평가 확정  → READ-only
 *
 *  UI Kit 재사용
 *   .search / .toolbar / .tbl / .pill / .progress / .pagination / .page-bar
 *   .form-field / .input / .select / .cb / .fm-tbl
 *   .dd.dd--row + .btn--kebab — 행 더보기 메뉴
 *   .modal — 회차 복제 모달 (#modal-evr-copy)
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  /* ============ 환경 ============ */
  const TODAY   = '2026-05-15';
  const HR_NAME = '정혜진';

  /* ============ 열람 권한 (Q-38 / 권한) ============
   *  진행 현황은 인사담당자·대표이사·부서장이 「조회」할 수 있으나,
   *  미제출 후속 조치(독려·재오픈·재배정)는 인사담당자(hr)만 실행한다.
   *  실서비스에서는 세션 권한에서 주입됨. 데모는 'hr' 고정(테스트 시 'ceo'/'dept' 로 바꿔 비노출 확인). */
  const VIEWER_ROLE = 'hr';
  function canAct() { return VIEWER_ROLE === 'hr'; }
  /* 진행 현황에서 미제출 후속 조치가 가능한 회차 상태 — 인사담당자 + 미제출이 존재할 수 있는 상태 */
  function progActionable(round) {
    return canAct() && !!round && ['pending', 'inProgress', 'closed'].includes(round.status);
  }

  /* ============ 진행 조치 감사 로그 (Q-10) ============
   *  독려 알림 / 입력기간 재오픈 / 대체 평가자 지정 이력을 모듈 내 배열에 누적.
   *  외부(평가 이력 화면 등)에서 App.HREvalRounds.progressActions() 로 조회. */
  const PROGRESS_ACTIONS = [];
  function nowStamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${String(d.getFullYear()).slice(2)}/${p(d.getMonth() + 1)}/${p(d.getDate())}   ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  /* payload: { roundId, targetId, step, type, note } — actor/at 는 자동 채움 */
  function logProgressAction(payload) {
    PROGRESS_ACTIONS.unshift(Object.assign({
      actor: HR_NAME,
      at: nowStamp(),
    }, payload));
  }

  /* ============ 상태 ============
   *  registered → [시작] → pending(입력 시작일 전) → 자동 → inProgress(입력 기간) → 자동 → closed(입력 마감) → [확정] → finalized
   *                  ↓ [중단]          ↓ [중단]                   ↓ [중단]
   *                                  canceled (폐기 종결)
   *
   *  화면 표시 라벨:
   *   registered → '등록'
   *   pending    → '평가 대기'
   *   inProgress → '평가 진행중'
   *   closed     → '평가 종료'
   *   finalized  → '평가 확정'
   *   canceled   → '중단됨' (폐기) */
  const STATUS = {
    registered: { label: '등록',        pill: ''        },
    pending:    { label: '평가 대기',   pill: 'warning' },
    inProgress: { label: '평가 진행중', pill: 'info'    },
    closed:     { label: '평가 종료',   pill: ''        },
    finalized:  { label: '평가 확정',   pill: 'success' },
    canceled:   { label: '중단됨',      pill: 'danger'  },
  };
  const STATUS_OPTIONS = Object.keys(STATUS).map(k => ({ value: k, label: STATUS[k].label }));
  /* 회차 설정 자체를 수정할 수 있는 상태 — 등록(시작 전) 만 자유롭게 편집 */
  function isEditable(status) { return status === 'registered'; }
  /* 삭제 가능한 상태 — 시작 전(registered) + 폐기 종결(canceled).
   * pending/inProgress/closed/finalized 는 진행/이력 보존 대상이라 삭제 불가. */
  function isDeletable(status) { return status === 'registered' || status === 'canceled'; }

  /* ============ 평가유형 마스터 (Mock) ============
   * 실서비스에서는 [HR > 설정 > 평가유형 설정] 화면에서 관리됨.
   * 여기서는 회차 생성·상세에서 미리보기 용도. (페이지의 mock 과 일치 — ET-001/002/003)
   *
   *  process 필드 — 평가유형 설정 화면 Section 4 「평가 프로세스」 와 동일 구조.
   *    · 역량 평가요소만 평가자 단계 설정 가능. 인사/성과는 시스템 산정값 사용 → process 없음.
   *    · stages[i].role 이 'direct_assign' 이면 회차 등록 시 대상자별로 평가자를 직접 지정해야 함. */
  const EVAL_TYPES = [
    {
      key: 'ET-001', name: '정기 인사평가',
      description: '전사 정규직 대상 정기 역량 평가',
      elements: ['역량'],
      /* 역량 양식 — 평가유형 설정 화면에서 내장 정의 */
      competency: {
        scale: 5,
        scaleLabels: defScaleLabels(),
        sections: [
          { id: 's1', name: '리더십', items: [
            { id: 'i1', text: '구성원들을 잘 이끌 수 있다.' },
            { id: 'i2', text: '의사결정이 명확하고 책임감 있다.' },
          ]},
          { id: 's2', name: '커뮤니케이션', items: [
            { id: 'i3', text: '동료·상급자와 적극적으로 소통한다.' },
            { id: 'i4', text: '의견을 논리적으로 전달한다.' },
          ]},
          { id: 's3', name: '문제해결', items: [
            { id: 'i5', text: '문제의 본질을 파악하고 해결안을 제시한다.' },
          ]},
        ],
      },
      process: {
        '역량': { selfEval: true, stages: [{ role: 'direct_sup' }, { role: 'dept_head' }] },
      },
      resultType: '절대평가 · 5등급 (S/A/B/C/D)',
      grading: {
        mode: 'absolute',
        grades: [
          { key: 'S', name: 'S', mode: 'absolute', minScore: 90 },
          { key: 'A', name: 'A', mode: 'absolute', minScore: 80 },
          { key: 'B', name: 'B', mode: 'absolute', minScore: 70 },
          { key: 'C', name: 'C', mode: 'absolute', minScore: 60 },
          { key: 'D', name: 'D', mode: 'absolute', minScore: 0  },
        ],
      },
    },
    {
      key: 'ET-003', name: '승진 평가',
      description: '직위·직책 승진 대상자 역량 평가.',
      elements: ['역량'],
      competency: {
        scale: 5,
        scaleLabels: defScaleLabels(),
        sections: [
          { id: 's1', name: '비전 제시', items: [
            { id: 'i1', text: '조직 비전을 명확히 제시한다.' },
            { id: 'i2', text: '구성원에게 동기를 부여한다.' },
          ]},
          { id: 's2', name: '의사결정', items: [
            { id: 'i3', text: '데이터에 기반한 의사결정을 내린다.' },
          ]},
        ],
      },
      process: {
        '역량': { selfEval: true, stages: [{ role: 'direct_sup' }, { role: 'dept_head' }, { role: 'hr' }] },
      },
      resultType: '혼합평가 · 5등급 (S/A/B/C/D)',
      grading: {
        mode: 'mixed',
        grades: [
          { key: 'S', name: 'S', mode: 'relative', ratio: 10 },
          { key: 'A', name: 'A', mode: 'relative', ratio: 20 },
          { key: 'B', name: 'B', mode: 'relative', ratio: 40 },
          { key: 'C', name: 'C', mode: 'relative', ratio: 20 },
          { key: 'D', name: 'D', mode: 'absolute', minScore: 60 },
        ],
      },
    },
  ];
  /* 회차가 소비하는 「양식」 — 문항(competency)은 App.HREvalType(양식 설정) 단일 소스,
     평가자 단계·등급은 App.HREvalConfig(단계·등급 설정) 전역 설정에서 상속.
     API 미로드 시 로컬 EVAL_TYPES mock 으로 폴백. */
  function globalStagesProc() {
    const cfg = (window.App && App.HREvalConfig && App.HREvalConfig.get) ? App.HREvalConfig.get() : null;
    const st = cfg ? cfg.stages : { self: { on: true, weight: 5 }, first: { role: 'team_lead', weight: 20 }, second: { role: 'hq_lead', weight: 25 }, ceo: { weight: 50 } };
    return {
      '역량': {
        selfEval: !!(st.self && st.self.on),
        selfWeight: st.self ? st.self.weight : 0,
        /* 사람 배정이 필요한 단계 = 1차/2차 (본인·대표이사 제외). key 는 evaluatorAssignments 호환. */
        stages: [
          { role: st.first.role, weight: st.first.weight },
          { role: st.second.role, weight: st.second.weight },
        ],
        ceoWeight: st.ceo ? st.ceo.weight : 0,
      },
    };
  }
  function findEvalType(key) {
    if (!key) return null;
    let base = (window.App && App.HREvalType && App.HREvalType.getForm) ? App.HREvalType.getForm(key) : null;
    if (!base) base = EVAL_TYPES.find(t => t.key === key) || null;
    if (!base) return null;
    const resultType = (window.App && App.HREvalConfig && App.HREvalConfig.resultTypeSummary)
      ? App.HREvalConfig.resultTypeSummary() : (base.resultType || '상대평가');
    return {
      key: base.key, name: base.name, description: base.description || '',
      elements: ['역량'],
      competency: base.competency || { scale: 5, sections: [] },
      process: globalStagesProc(),
      resultType,
    };
  }
  /* 양식 목록 (드롭다운/필터용) — App.HREvalType 우선, 폴백 EVAL_TYPES */
  function listForms() {
    if (window.App && App.HREvalType && App.HREvalType.listForms) {
      return App.HREvalType.listForms().filter(fm => fm.useYn !== false);
    }
    return EVAL_TYPES.map(t => ({ key: t.key, name: t.name }));
  }

  /* 전역 단계 흐름 chips (본인 → 1차 → 2차 → 대표이사 → 확정) — 단계·등급 설정 상속 */
  function stageFlowChipsHTML() {
    const flow = (window.App && App.HREvalConfig && App.HREvalConfig.stageFlow)
      ? App.HREvalConfig.stageFlow()
      : [{ label: '본인' }, { label: '1차' }, { label: '2차' }, { label: '대표이사' }, { label: '확정' }];
    return `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;">` + flow.map((c, i, arr) => `
      <span style="display:inline-flex;align-items:center;gap:4px;">
        <span style="padding:2px 8px;border-radius:var(--radius-pill);background:var(--color-surface);border:1px solid var(--color-border);font-size:var(--fs-xs);color:var(--color-text-sub);white-space:nowrap;">${esc(c.label)}${c.weight != null ? ` ${c.weight}%` : ''}</span>
        ${i < arr.length - 1 ? '<span style="color:var(--color-text-muted);">→</span>' : ''}
      </span>`).join('') + `</div>`;
  }

  /* 직군별 등급 스킴 요약 — 단계·등급 설정 상속 */
  function gradeSchemeHTML() {
    const grades = (window.App && App.HREvalConfig && App.HREvalConfig.grades) ? App.HREvalConfig.grades() : [];
    if (!grades.length) return `<span class="t-muted">-</span>`;
    return `<div style="display:flex;flex-direction:column;gap:4px;">` + grades.map(g =>
      `<div style="font-size:var(--fs-sm);"><strong style="color:var(--color-text-sub);">${esc(g.groupName)}</strong>
        <span style="margin-left:6px;color:var(--color-text-sub);">${(g.tiers || []).map(t => `${esc(t.name)} ${t.ratio}%`).join(' · ')}</span></div>`
    ).join('') + `</div>`;
  }

  /* 척도별 기본 명칭 — 역량 양식 (평가요소 설정과 동일 체계). 함수 선언이라 EVAL_TYPES 에서 호출 가능(hoisting). */
  function defScaleLabels() {
    return {
      3: ['낮음', '보통', '높음'],
      5: ['매우 미흡', '미흡', '보통', '우수', '매우 우수'],
      7: ['매우 미흡', '미흡', '다소 미흡', '보통', '다소 우수', '우수', '매우 우수'],
    };
  }
  function defaultScaleLabels(scale) { return (defScaleLabels()[scale] || []).slice(); }

  /* 평가요소 — 역량 단일 */
  const EL_COMP = '역량';

  /* ============ 평가자 역할 (단계·등급 설정 App.HREvalConfig 와 일치 — 직책 기준) ============ */
  const EVALUATOR_ROLES = [
    { key: 'part_lead',     label: '파트장' },
    { key: 'team_lead',     label: '팀장' },
    { key: 'office_lead',   label: '실장' },
    { key: 'hq_lead',       label: '본부장' },
    { key: 'direct_assign', label: '직접 지정' },
  ];
  /* 구 역할 라벨 (레거시 mock/데이터 방어용) */
  const LEGACY_ROLE_LABEL = { direct_sup: '직속 상급자', next_sup: '차상위 상급자', dept_head: '부서장', hr: 'HR 담당자', ceo: '대표이사', self: '본인' };
  function roleLabel(k) {
    const r = EVALUATOR_ROLES.find(x => x.key === k);
    return r ? r.label : (LEGACY_ROLE_LABEL[k] || '-');
  }
  /* 직책 기준 role → 조직 직책 라벨 (자동 배정 해석용) */
  const ROLE_POSITION = { part_lead: '파트장', team_lead: '팀장', office_lead: '실장', hq_lead: '본부장' };

  /* 평가유형의 process 에서 direct_assign 단계만 추출. 회차 등록 시 대상자별 평가자 지정에 사용.
   *   반환: [{ el: '역량', stageIdx: 1, key: '역량_1' }, ...] (stageIdx 는 0-based)
   *   key 는 evaluatorAssignments[empId][key] 로 평가자 ID 를 저장하는 식별자. */
  function listDirectAssignStages(type) {
    if (!type || !type.process) return [];
    const out = [];
    Object.keys(type.process).forEach(el => {
      const stages = (type.process[el] && type.process[el].stages) || [];
      stages.forEach((s, i) => {
        if (s.role === 'direct_assign') out.push({ el, stageIdx: i, key: `${el}_${i}` });
      });
    });
    return out;
  }

  /* 평가유형의 모든 평가자 단계 추출 — [{ el, stageIdx, key, role }]. selfEval(본인)은 제외. */
  function listAllStages(type) {
    if (!type || !type.process) return [];
    const out = [];
    Object.keys(type.process).forEach(el => {
      const stages = (type.process[el] && type.process[el].stages) || [];
      stages.forEach((s, i) => out.push({ el, stageIdx: i, key: `${el}_${i}`, role: s.role }));
    });
    return out;
  }

  /* ============ 평가자 자동 배정 로직 (대상자별 단계 해석) ============
   *  직책 서열(작을수록 상위) — 부서장/본부장/직속상급자 판별 기준.
   *  · 직속 상급자 = 같은 부서의 상위 직책 중 랜덤 (없으면 전사 상위 직책 → 누구든)
   *  · 부서장      = 같은 부서의 리더(소장/팀장/본부장) 중 최상위. 없으면 → 본부장(대체).
   *  · 본부장      = position '본부장' (같은 부서 우선, 없으면 전사).
   *  · HR 담당자   = 인사팀 최상위.
   *  · 모두 부재 / 직접 지정 단계 = 수동 지정.  → 평가자 부재 케이스 없음 */
  const POS_RANK = { '임원': 0, '본부장': 1, '실장': 2, '소장': 2, '팀장': 3, '파트장': 4, '팀원': 5, '파트원': 6 };
  function posRank(p) { return (p in POS_RANK) ? POS_RANK[p] : 99; }
  const DEPT_LEADER_POS = ['본부장', '소장', '팀장'];

  function activeCandidates(emps) {
    return (emps || []).filter(e => e && e.status !== 'retired' && e.status !== 'contractExpired' && e.active !== false);
  }
  function deptLeaderOf(target, cands) {
    const list = cands.filter(e => e.id !== target.id && e.dept === target.dept && DEPT_LEADER_POS.includes(e.position));
    list.sort((a, b) => posRank(a.position) - posRank(b.position));
    return list[0] || null;
  }
  function divisionHeadOf(target, cands) {
    const same = cands.filter(e => e.id !== target.id && e.position === '본부장' && e.dept === target.dept);
    if (same.length) return same[0];
    const any = cands.filter(e => e.id !== target.id && e.position === '본부장');
    return any[0] || null;
  }
  function hrManagerOf(target, cands) {
    const list = cands.filter(e => e.id !== target.id && e.dept === '인사팀');
    list.sort((a, b) => posRank(a.position) - posRank(b.position));
    return list[0] || null;
  }
  /* 직속 상급자 후보 — 반드시 같은 부서의 상위 직책자 중 랜덤. 부서를 벗어나지 않는다. */
  function randomSuperiorOf(target, cands) {
    const tRank = posRank(target.position);
    const pool = cands.filter(e => e.id !== target.id && e.dept === target.dept && posRank(e.position) < tRank);
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /* 직책 기준 평가자 — 반드시 같은 부서에서 해당 직책자(자기 제외)만. 타 부서로 넘기지 않는다. */
  function positionEvaluatorOf(target, posLabel, cands) {
    const inDept = cands.filter(e => e.id !== target.id && e.dept === target.dept && e.position === posLabel);
    if (!inDept.length) return null;
    inDept.sort((a, b) => posRank(a.position) - posRank(b.position));
    return inDept[0];
  }

  /* role → 평가자 1명 해석. id '' 이면 수동 지정 필요. */
  function resolveStageEvaluator(target, role, cands) {
    if (role === 'direct_assign') return { id: '', via: '수동 지정' };
    /* 직책 기준 role (파트장/팀장/실장/본부장) — 단계·등급 설정에서 지정된 직책자를 배정.
       ⚠ 같은 부서 안에서만 해석한다. 해당 직책자가 없으면 같은 부서 상위 리더로 대행하고,
          그마저 없으면 수동 지정으로 남긴다. (타 부서 직책자를 임의로 끌어오지 않는다 — 부서 교차 배정 방지.) */
    if (ROLE_POSITION[role]) {
      const posLabel = ROLE_POSITION[role];
      const r = positionEvaluatorOf(target, posLabel, cands);
      if (r) return { id: r.id, via: posLabel };
      const lead = deptLeaderOf(target, cands);   // 같은 부서 리더(본부장/소장/팀장)만
      if (lead) return { id: lead.id, via: `${posLabel} (상위자 대행)` };
      return { id: '', via: '수동 지정' };
    }
    if (role === 'direct_sup') {
      const r = randomSuperiorOf(target, cands);          // 같은 부서 상위 직책 랜덤
      if (r) return { id: r.id, via: '직속 상급자 (자동배정)' };
      /* 같은 부서에 상위 직책자가 없음(부서 최상위) → 같은 부서 부서장 → 본부장 순 에스컬레이션 */
      const up = deptLeaderOf(target, cands) || divisionHeadOf(target, cands);
      if (up) return { id: up.id, via: '직속 상급자 (상위자 대행)' };
      return { id: '', via: '수동 지정' };
    }
    if (role === 'next_sup') {
      const r = divisionHeadOf(target, cands) || deptLeaderOf(target, cands);
      return r ? { id: r.id, via: '차상위 상급자' } : { id: '', via: '수동 지정' };
    }
    if (role === 'dept_head') {
      let r = deptLeaderOf(target, cands);
      if (r) return { id: r.id, via: '부서장' };
      r = divisionHeadOf(target, cands);
      if (r) return { id: r.id, via: '본부장 (부서장 부재)' };
      return { id: '', via: '수동 지정' };
    }
    if (role === 'hr') {
      const r = hrManagerOf(target, cands);
      return r ? { id: r.id, via: 'HR 담당자' } : { id: '', via: '수동 지정' };
    }
    return { id: '', via: '수동 지정' };
  }

  /* 저장된 평가자 id 의 배정 경위 라벨 (랜덤 재계산 없이 결정적으로 산출) */
  function assignmentViaLabel(target, role, id, cands) {
    if (!id) return '수동 지정 필요';
    if (role === 'direct_assign') return '직접 지정';
    if (ROLE_POSITION[role]) {
      const posLabel = ROLE_POSITION[role];
      const p = cands.find(e => e.id === id);
      return (p && p.position === posLabel) ? posLabel : `${posLabel} (상위자 대행)`;
    }
    if (role === 'direct_sup') {
      const p = cands.find(e => e.id === id);
      return (p && p.dept === target.dept) ? '직속 상급자 (자동배정)' : '직속 상급자 (상위자 대행)';
    }
    if (role === 'next_sup')      return '차상위 상급자';
    if (role === 'hr')            return 'HR 담당자';
    if (role === 'dept_head') {
      const p = cands.find(e => e.id === id);
      if (p && p.dept === target.dept && DEPT_LEADER_POS.includes(p.position)) return '부서장';
      if (p && p.position === '본부장') return '본부장 (부서장 부재)';
      return '부서장';
    }
    return '지정됨';
  }

  /* 대상자별 자동 배정 단계를 evaluatorAssignments 에 채움(없는 셀만 — 랜덤 고정).
     direct_assign(수동) 및 해석 실패 셀은 비워두어 수동 select 로 노출. */
  function ensureAutoAssignments(f) {
    const type = findEvalType(f.typeKey);
    if (!type) return;
    const stages = listAllStages(type);
    if (!stages.length) return;
    const cands = activeCandidates((window.App && App.HRMembers && App.HRMembers.list) ? App.HRMembers.list() : []);
    const matched = listEmployeesMatchingFilter(f.targetFilter);
    const idSet = f.targetEmpIds
      ? (f.targetEmpIds instanceof Set ? f.targetEmpIds : new Set(f.targetEmpIds))
      : null;
    const targets = idSet ? matched.filter(e => idSet.has(e.id)) : matched;
    if (!f.evaluatorAssignments) f.evaluatorAssignments = {};
    targets.forEach(t => {
      const a = f.evaluatorAssignments[t.id] || (f.evaluatorAssignments[t.id] = {});
      stages.forEach(s => {
        if (a[s.key]) return;                       // 이미 지정 → 유지(랜덤 고정/수동값 보존)
        if (s.role === 'direct_assign') return;     // 수동 단계는 비워둠
        const res = resolveStageEvaluator(t, s.role, cands);
        if (res.id) a[s.key] = res.id;              // 자동 해석 성공만 저장
      });
    });
  }

  /* 회차 r 의 미배정 평가자 셀 수 — 저장된 evaluatorAssignments 기준(자동배정 수행 안 함).
     목록/일괄 「평가 시작」 차단 판정에 사용 — 0 이어야 시작 가능. */
  function roundUnassignedEvaluatorCount(r) {
    const type = findEvalType(r.typeKey);
    if (!type) return 0;
    const stages = listAllStages(type);
    if (!stages.length) return 0;
    const matched = listEmployeesMatchingFilter(r.targetFilter || defaultTargetFilter());
    const idSet = r.targetEmpIds
      ? (r.targetEmpIds instanceof Set ? r.targetEmpIds : new Set(r.targetEmpIds))
      : null;
    const targets = idSet ? matched.filter(e => idSet.has(e.id)) : matched;
    let unset = 0;
    const asg = r.evaluatorAssignments || {};
    targets.forEach(t => {
      const a = asg[t.id] || {};
      stages.forEach(s => { if (!a[s.key]) unset += 1; });
    });
    return unset;
  }


  /* ============ 코드 마스터 (대상자 필터) ============ */
  const EMP_STATUS_OPTIONS = [
    { value: 'active', label: '재직' },
    { value: 'leave',  label: '휴직' },
  ];
  const EMP_TYPE_OPTIONS = [
    { value: 'regular',  label: '정규직' },
    { value: 'contract', label: '계약직' },
    { value: 'daily',    label: '일용직' },
  ];
  const JOB_CAT_OPTIONS = [
    { value: 'office',     label: '사무직' },
    { value: 'production', label: '생산직' },
    { value: 'research',   label: '연구직' },
  ];
  const TRI_OPTIONS = [
    { value: 'any', label: '전체' },
    { value: 'on',  label: '해당' },
    { value: 'off', label: '해당 외' },
  ];
  /* 사용자가 직접 입력하는 대신 목록을 미리 보여주기 위한 mock — 실서비스에서는 부서/직책 마스터에서 옴 */
  const POSITION_OPTIONS = ['임원', '본부장', '소장', '팀장', '파트장', '팀원', '파트원'];
  const DEPT_OPTIONS     = ['경영지원본부', '경영지원본부 / 인사팀', '경영지원본부 / 재무팀',
                            '생산본부', '생산본부 / 생산1팀', '생산본부 / 생산2팀',
                            '연구소', '연구소 / R&D1팀', '연구소 / R&D2팀'];

  /* ============ Helper ============ */
  function $(s, r = document) { return r.querySelector(s); }
  function $$(s, r = document) { return Array.from(r.querySelectorAll(s)); }
  /* 평가요소 등록과 동일한 카드 섹션 — 번호 뱃지 + 제목 + 도움말 텍스트 */
  function sectionCard(num, title, body, opts) {
    const help = (opts && opts.help) || '';
    return `
      <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:20px 24px 22px;">
        <header style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--color-divider);">
          <span style="display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;padding:0 8px;border-radius:var(--radius-sm);background:var(--color-brand-primary);color:#fff;font-size:var(--fs-sm);font-weight:var(--fw-bold);">${num}</span>
          <h3 style="font-size:var(--fs-lg);font-weight:var(--fw-semibold);color:var(--color-text);margin:0;">${esc(title)}</h3>
          ${help ? `<small style="color:var(--color-text-muted);font-size:var(--fs-sm);">${esc(help)}</small>` : ''}
        </header>
        ${body}
      </section>
    `;
  }
  const REQ_MARK = `<span style="color:var(--color-danger);">*</span>`;
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function ymd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${dd}`;
  }
  function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
  /* 표시 전용 — 'YYYY-MM-DD' → 'YY/MM/DD' (데이터 key/비교값은 원본 유지) */
  function fmtD(s) {
    s = (s === null || s === undefined) ? '' : String(s);
    return s.length >= 10 ? s.slice(2,4) + '/' + s.slice(5,7) + '/' + s.slice(8,10) : s;
  }
  function periodText(from, to) {
    if (!from && !to) return '-';
    return `${from ? fmtD(from) : '?'} ~ ${to ? fmtD(to) : '?'}`;
  }
  function statusPill(code) {
    const s = STATUS[code] || STATUS.pending;
    return `<span class="pill${s.pill ? ' pill--' + s.pill : ''}">${esc(s.label)}</span>`;
  }
  function progressBar(row) {
    if (!row.targetCount) return `<span class="t-muted" style="font-size:var(--fs-sm);">-</span>`;
    const pct = Math.round((row.completedCount / row.targetCount) * 100);
    return `
      <div style="display:flex;align-items:center;gap:6px;min-width:80px;">
        <div class="progress" style="flex:1;"><div class="progress__bar" style="width:${pct}%;"></div></div>
        <span style="font-size:var(--fs-xs);color:var(--color-text-sub);min-width:30px;text-align:right;">${pct}%</span>
      </div>`;
  }

  /* ============ Mock 회차 데이터 ============ */
  function makeMock() {
    const cases = [
      /* status 와 inputOffset 의 관계
       *   registered  — [시작] 미클릭 (입력 기간 무관)
       *   pending     — [시작] 클릭됨 + 입력 시작일 전
       *   inProgress  — [시작] 클릭됨 + 입력 기간 안
       *   closed      — 입력 종료일 지남, [확정] 전
       *   finalized   — [확정] 클릭됨
       *   canceled    — [중단] 클릭됨 (폐기) */
      { name: '2026 상반기 정기 인사평가', typeKey: 'ET-001', status: 'inProgress',
        periodOffset: [-180, -1],   inputOffset: [-5, 14],    targetN: 84, completedN: 52 },
      { name: '2026 1분기 승진 평가',     typeKey: 'ET-003', status: 'finalized',
        periodOffset: [-120, -30],  inputOffset: [-25, -10],  targetN: 18, completedN: 18 },
      { name: '2025 하반기 정기 인사평가', typeKey: 'ET-001', status: 'closed',
        periodOffset: [-400, -180], inputOffset: [-170, -150], targetN: 76, completedN: 74 },
      { name: '2026 신규 평가 (작성중)',  typeKey: 'ET-001', status: 'registered',
        periodOffset: [30, 180],    inputOffset: [185, 200],  targetN: 0,  completedN: 0  },
    ];
    return cases.map((c, i) => {
      const periodFrom = ymd(addDays(new Date(TODAY), c.periodOffset[0]));
      const periodTo   = ymd(addDays(new Date(TODAY), c.periodOffset[1]));
      const inputFrom  = ymd(addDays(new Date(TODAY), c.inputOffset[0]));
      const inputTo    = ymd(addDays(new Date(TODAY), c.inputOffset[1]));
      const createdAt  = ymd(addDays(new Date(TODAY), -30 - i * 7));
      const createdBy  = ['정혜진','윤민지'][i % 2];
      return {
        id:          `EVR-2026-${String(i + 1).padStart(4, '0')}`,
        name:        c.name,
        typeKey:     c.typeKey,
        periodFrom, periodTo,
        inputFrom,  inputTo,
        description: '',
        status:      c.status,
        targetCount:    c.targetN,
        completedCount: c.completedN,
        targetFilter: defaultTargetFilter(),
        createdBy,
        createdAt,
        editHistory: [{ at: createdAt, by: createdBy, reason: '회차 등록', kind: 'create' }],
      };
    });
  }
  function defaultTargetFilter() {
    return {
      empStatus: ['active'],                            // 재직 상태 (다중)
      empType:   ['regular'],                           // 고용 구분 (다중) — 기본: 정규직만
      probation: 'any',                                 // 수습 여부
      outsource: 'any',                                 // 도급 여부
      jobCat:    JOB_CAT_OPTIONS.map(o => o.value),     // 직군 (다중) — 기본: 전체 선택
      position:  '',           // 직책 (단일)
      dept:      '',           // 부서 (단일)
      joinFrom:  '',           // 입사일 시작
      joinTo:    '',           // 입사일 종료
    };
  }
  /* 평가번호 자동 채번 — 평가요소/평가유형의 nextMasterCode 와 동일 패턴.
   *   기존 회차 중 EVR-YYYY-NNNN 형식의 최대 시퀀스 + 1. 삭제로 갭이 생겨도 max 만 추적. */
  function newSeqId(rounds) {
    const year = String(TODAY).slice(0, 4);
    const re = new RegExp('^EVR-' + year + '-(\\d+)$');
    const maxSeq = (rounds || []).reduce((m, r) => {
      const match = String(r.id || '').match(re);
      return match ? Math.max(m, Number(match[1])) : m;
    }, 0);
    return `EVR-${year}-${String(maxSeq + 1).padStart(4, '0')}`;
  }

  /* ============ STATE ============ */
  const STATE = {
    view: 'list',            // 'list' | 'detail' | 'create' | 'progress'
    rounds: [],
    filtered: [],
    page: 1, pageSize: 20,
    filter: null,
    selectedIds: new Set(),
    /* detail / create */
    editingId: null,         // 상세 진입 시 회차 id, 신규는 null
    form: null,              // 편집/등록용 form 객체
    /* 복제 모달 임시 */
    copySrcId: null,
    /* 진행 현황 뷰 (인사팀/대표이사/부서장 모니터링) */
    progress: { roundId: null, keyword: '', condition: 'name', statusFilter: '', page: 1, pageSize: 20, selectedIds: new Set() },
  };

  /* ============ 필터 ============ */
  function applyFilter() {
    const p = STATE.filter || {};
    const kw   = (p.keyword || '').trim().toLowerCase();
    const cond = p.condition || 'name';
    const statusSel = (p.advanced && p.advanced.status)  || '';
    const typeSel   = (p.advanced && p.advanced.typeKey) || '';
    const createdBy = (p.advanced && p.advanced.createdBy) || '';

    STATE.filtered = STATE.rounds.filter(r => {
      if (statusSel && r.status   !== statusSel) return false;
      if (typeSel   && r.typeKey  !== typeSel)   return false;
      if (createdBy && r.createdBy !== createdBy) return false;
      if (kw) {
        const t = cond === 'id' ? r.id : r.name;
        if (!String(t).toLowerCase().includes(kw)) return false;
      }
      return true;
    });
    const totalPages = Math.max(1, Math.ceil(STATE.filtered.length / STATE.pageSize));
    if (STATE.page > totalPages) STATE.page = 1;
  }

  /* =========================================================
   *  VIEW: LIST
   * ========================================================= */
  function renderListView(pageEl) {
    STATE.view = 'list';
    const C = App.Components;

    const userOpts = Array.from(new Set(STATE.rounds.map(r => r.createdBy))).filter(Boolean);
    const searchHTML = C.searchPanel({
      showDateRange: false,
      conditions: [
        { value: 'name', label: '평가명' },
        { value: 'id',   label: '평가번호' },
      ],
      placeholder: '평가명 또는 평가번호 검색',
      cols: 2,
      advanced: [
        { name: 'typeKey',   label: '양식', options: listForms().map(t => ({ value: t.key, label: t.name })) },
        { name: 'status',    label: '진행 상태', options: STATUS_OPTIONS },
        { name: 'createdBy', label: '생성자',   options: userOpts.map(u => ({ value: u, label: u })) },
      ],
    });

    pageEl.innerHTML = `
      ${searchHTML}

      <div class="toolbar">
        <div class="toolbar__left">
          <span class="toolbar__count">총 <span data-count><strong>0</strong>건</span></span>
          <span style="color:var(--color-text-muted);font-size:var(--fs-sm);" data-sel-count></span>
        </div>
        <div class="toolbar__right">
          <button class="btn btn--sm btn--primary" type="button" data-evr-new>${window.Icons && window.Icons.plus || '+'} 평가 회차 등록</button>
          <button class="btn btn--sm" type="button" data-evr-start-bulk disabled>평가 시작</button>
          <button class="btn btn--sm btn--danger" type="button" data-evr-delete disabled>삭제</button>
        </div>
      </div>

      <div class="grid-wrap" style="flex:1;min-height:0;">
        <div class="grid-scroll">
          <table class="tbl tbl--hover">
            <thead>
              <tr>
                <th style="width:40px;text-align:center;"><input type="checkbox" data-evr-check-all aria-label="전체 선택" /></th>
                <th style="width:130px;">평가번호</th>
                <th style="width:110px;">양식</th>
                <th>평가명</th>
                <th style="width:200px;white-space:nowrap;">평가 대상 기간</th>
                <th style="width:200px;white-space:nowrap;">평가 입력 기간</th>
                <th style="width:80px;text-align:right;">대상자수</th>
                <th style="width:80px;text-align:right;">완료자수</th>
                <th style="width:100px;">진행률</th>
                <th style="width:110px;text-align:center;">상태</th>
                <th style="width:110px;text-align:center;"></th>
                <th style="width:40px;text-align:center;" aria-label="더보기"></th>
              </tr>
            </thead>
            <tbody id="evr-list-body"></tbody>
          </table>
        </div>
        <div class="pagination">
          <div class="pagination__info" id="evr-page-info"></div>
          <div class="pagination__right">
            <div class="pagination__size">
              <label>페이지당</label>
              <select class="select" id="evr-page-size">
                <option value="20">20</option><option value="40">40</option><option value="60">60</option><option value="100">100</option>
              </select>
              <span>건</span>
            </div>
            <div class="pagination__list" id="evr-pagination"></div>
          </div>
        </div>
      </div>
    `;
    bindList(pageEl);
  }

  function bindList(pageEl) {
    App.Search.attach(pageEl.querySelector('[data-search]'), (params) => {
      STATE.filter = params;
      STATE.page = 1;
      applyFilter();
      renderTable();
    });

    /* 툴바 액션 */
    pageEl.addEventListener('click', (e) => {
      if (e.target.closest('[data-evr-new]'))         { openCreate(); return; }
      if (e.target.closest('[data-evr-start-bulk]'))  { doStartBulk(); return; }
      if (e.target.closest('[data-evr-delete]'))      { doDelete(); return; }
    });

    /* 전체 선택 */
    pageEl.querySelector('[data-evr-check-all]').addEventListener('change', (e) => {
      const checked = e.target.checked;
      const pageRows = STATE.filtered.slice((STATE.page-1)*STATE.pageSize, STATE.page*STATE.pageSize);
      pageRows.forEach(r => {
        if (checked) STATE.selectedIds.add(r.id);
        else         STATE.selectedIds.delete(r.id);
      });
      renderTable();
    });

    /* 행 체크 / 행 액션 (이벤트 위임) */
    const body = $('#evr-list-body', pageEl);
    body.addEventListener('change', (e) => {
      const cb = e.target.closest('input[type="checkbox"][data-evr-row-cb]');
      if (!cb) return;
      const tr = cb.closest('[data-evr-row]'); if (!tr) return;
      const id = tr.dataset.evrRow;
      if (cb.checked) STATE.selectedIds.add(id);
      else            STATE.selectedIds.delete(id);
      tr.classList.toggle('is-selected', cb.checked);
      updateBulkButtons(); updateCheckAll();
    });
    body.addEventListener('click', (e) => {
      /* 평가명 클릭 → 시작된 회차는 진행 현황 바로, 미시작(등록/중단)은 상세.
         기본 정보·대상자·평가 정보·평가자 지정·수정 이력은 진행 현황의 [정보] 버튼 모달로 확인. */
      const link = e.target.closest('[data-evr-open]');
      if (link) {
        e.preventDefault();
        const tr = link.closest('[data-evr-row]');
        if (tr) {
          const r = STATE.rounds.find(x => x.id === tr.dataset.evrRow);
          const started = r && ['pending', 'inProgress', 'closed', 'finalized'].includes(r.status);
          if (started) openProgress(tr.dataset.evrRow);
          else openDetail(tr.dataset.evrRow);
        }
        return;
      }
      /* 행 액션 — 상태별 */
      const start = e.target.closest('[data-evr-row-start]');
      if (start) { doStartRow(start.dataset.evrRowStart); return; }
      const cancel = e.target.closest('[data-evr-row-cancel]');
      if (cancel) { doCancelRow(cancel.dataset.evrRowCancel); return; }
      const finalize = e.target.closest('[data-evr-row-finalize]');
      if (finalize) { doFinalizeRow(finalize.dataset.evrRowFinalize); return; }
      const result = e.target.closest('[data-evr-row-result]');
      if (result) { doOpenResult(result.dataset.evrRowResult); return; }
      /* 더보기 메뉴 항목 */
      const prog = e.target.closest('[data-evr-row-progress]');
      if (prog) { openProgress(prog.dataset.evrRowProgress); return; }
      const copy = e.target.closest('[data-evr-row-copy]');
      if (copy) { openCopyModal(copy.dataset.evrRowCopy); return; }
      const del = e.target.closest('[data-evr-row-delete]');
      if (del) { doDeleteOne(del.dataset.evrRowDelete); return; }
    });

    /* 페이지네이션 */
    $('#evr-pagination', pageEl).addEventListener('click', (e) => {
      const btn = e.target.closest('.pagination__btn');
      if (!btn || btn.disabled) return;
      const p = Number(btn.dataset.page);
      if (Number.isFinite(p)) { STATE.page = p; renderTable(); }
    });
    $('#evr-page-size', pageEl).addEventListener('change', (e) => {
      STATE.pageSize = Number(e.target.value); STATE.page = 1; renderTable();
    });
  }

  function renderTable() {
    const pageEl = document.getElementById('page-hr-eval-round');
    if (!pageEl) return;
    const total = STATE.filtered.length;
    const start = (STATE.page - 1) * STATE.pageSize;
    const rows = STATE.filtered.slice(start, start + STATE.pageSize);

    const body = $('#evr-list-body', pageEl); if (!body) return;
    body.innerHTML = !rows.length
      ? `<tr><td colspan="12" style="text-align:center;color:var(--color-text-muted);padding:32px 0;">조건에 해당하는 평가 회차가 없습니다.</td></tr>`
      : rows.map(r => {
          const sel = STATE.selectedIds.has(r.id);
          const type = findEvalType(r.typeKey);
          const deletable = isDeletable(r.status);
          /* 진행 현황 — 시작된 회차(대기/진행중/종료/확정)만 조회 가능 */
          const started = ['pending', 'inProgress', 'closed', 'finalized'].includes(r.status);
          /* 상태별 행 액션 버튼 — 평가 시작만 filled primary, 나머지는 무채색 border */
          const actionBtn = (() => {
            if (r.status === 'registered') {
              return `<button class="btn btn--xs btn--primary" type="button" data-evr-row-start="${esc(r.id)}">평가 시작</button>`;
            }
            if (r.status === 'pending' || r.status === 'inProgress') {
              return `<button class="btn btn--xs" type="button" data-evr-row-cancel="${esc(r.id)}">평가 중단</button>`;
            }
            if (r.status === 'closed') {
              return `<button class="btn btn--xs" type="button" data-evr-row-finalize="${esc(r.id)}">평가 확정</button>`;
            }
            if (r.status === 'finalized') {
              return `<button class="btn btn--xs" type="button" data-evr-row-result="${esc(r.id)}">결과 보기</button>`;
            }
            return `<span class="t-muted" style="font-size:var(--fs-xs);">-</span>`;
          })();
          return `
            <tr data-evr-row="${esc(r.id)}" class="${sel ? 'is-selected' : ''}">
              <td style="text-align:center;"><input type="checkbox" data-evr-row-cb ${sel ? 'checked' : ''} /></td>
              <td style="white-space:nowrap;">${esc(r.id)}</td>
              <td style="white-space:nowrap;">${esc(type ? type.name : r.typeKey)}</td>
              <td style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px;"><a href="#" data-evr-open style="color:var(--color-brand-primary);font-weight:var(--fw-medium);">${esc(r.name)}</a></td>
              <td style="white-space:nowrap;">${esc(periodText(r.periodFrom, r.periodTo))}</td>
              <td style="white-space:nowrap;">${esc(periodText(r.inputFrom, r.inputTo))}</td>
              <td style="text-align:right;">${(r.targetCount || 0).toLocaleString()}</td>
              <td style="text-align:right;">${(r.completedCount || 0).toLocaleString()}</td>
              <td>${progressBar(r)}</td>
              <td style="text-align:center;">${statusPill(r.status)}</td>
              <td style="text-align:center;">${actionBtn}</td>
              <td style="text-align:center;">
                <span class="dd dd--row" data-dd>
                  <button class="btn--kebab" type="button" aria-label="더보기">
                    ${window.Icons && window.Icons.moreVertical || '⋮'}
                  </button>
                  <div class="dd__menu">
                    <button class="dd__item" type="button" data-evr-row-progress="${esc(r.id)}" ${started ? '' : 'disabled'}>진행 현황</button>
                    <button class="dd__item" type="button" data-evr-row-copy="${esc(r.id)}">복제</button>
                    <button class="dd__item dd__item--danger" type="button" data-evr-row-delete="${esc(r.id)}" ${deletable ? '' : 'disabled'}>삭제</button>
                  </div>
                </span>
              </td>
            </tr>`;
        }).join('');

    /* 카운트 */
    const cnt = pageEl.querySelector('[data-count]');
    if (cnt) cnt.innerHTML = `<strong>${total.toLocaleString()}</strong>건`;

    /* 페이지 정보 + 페이지 버튼 */
    const size = STATE.pageSize;
    const totalPages = Math.max(1, Math.ceil(total / size));
    if (STATE.page > totalPages) STATE.page = totalPages;
    $('#evr-page-info', pageEl).textContent = total === 0
      ? '0건'
      : `${start + 1}-${Math.min(start + size, total)} / ${total}건`;

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
    $('#evr-pagination', pageEl).innerHTML = btns.join('');

    const sel = $('#evr-page-size', pageEl); if (sel) sel.value = String(STATE.pageSize);

    updateBulkButtons(); updateCheckAll();
  }

  function updateBulkButtons() {
    const pageEl = document.getElementById('page-hr-eval-round');
    if (!pageEl) return;
    const selected = STATE.rounds.filter(r => STATE.selectedIds.has(r.id));
    const has = selected.length > 0;
    const allDeletable = has && selected.every(r => isDeletable(r.status));
    const canStart     = selected.length === 1 && isEditable(selected[0].status);

    const startBtn = pageEl.querySelector('[data-evr-start-bulk]');
    if (startBtn) startBtn.disabled = !canStart;
    const delBtn = pageEl.querySelector('[data-evr-delete]');
    if (delBtn) delBtn.disabled = !allDeletable;

    const cnt = pageEl.querySelector('[data-sel-count]');
    if (cnt) cnt.textContent = has ? ` · 선택 ${selected.length}건` : '';
  }
  function updateCheckAll() {
    const pageEl = document.getElementById('page-hr-eval-round');
    const all = pageEl && pageEl.querySelector('[data-evr-check-all]'); if (!all) return;
    const pageRows = STATE.filtered.slice((STATE.page-1)*STATE.pageSize, STATE.page*STATE.pageSize);
    if (!pageRows.length) { all.checked = false; all.indeterminate = false; return; }
    const selCnt = pageRows.filter(r => STATE.selectedIds.has(r.id)).length;
    all.checked = selCnt === pageRows.length;
    all.indeterminate = selCnt > 0 && selCnt < pageRows.length;
  }

  /* ============ 목록 액션 ============ */
  function doDelete() {
    const targets = STATE.rounds.filter(r => STATE.selectedIds.has(r.id));
    if (!targets.length) return;
    if (targets.some(r => !isDeletable(r.status))) {
      window.toast && window.toast('「등록」 또는 「중단됨」 상태인 회차만 삭제할 수 있습니다.', 'danger'); return;
    }
    if (!confirm(`선택한 ${targets.length}건의 회차를 삭제하시겠습니까? (복구 불가)`)) return;
    STATE.rounds = STATE.rounds.filter(r => !STATE.selectedIds.has(r.id));
    STATE.selectedIds.clear();
    applyFilter(); renderTable();
    window.toast && window.toast(`${targets.length}건 삭제 완료`, 'success');
  }
  function doDeleteOne(id) {
    const r = STATE.rounds.find(x => x.id === id); if (!r) return;
    if (!isDeletable(r.status)) {
      window.toast && window.toast('「등록」 또는 「중단됨」 상태인 회차만 삭제할 수 있습니다.', 'danger'); return;
    }
    if (!confirm(`「${r.name}」(${r.id}) 회차를 삭제하시겠습니까?`)) return;
    STATE.rounds = STATE.rounds.filter(x => x.id !== id);
    STATE.selectedIds.delete(id);
    applyFilter(); renderTable();
    window.toast && window.toast('1건 삭제 완료', 'success');
  }
  function doStartBulk() {
    const ids = Array.from(STATE.selectedIds);
    if (ids.length !== 1) return;
    doStartRow(ids[0]);
  }
  function doStartRow(id) {
    const r = STATE.rounds.find(x => x.id === id); if (!r) return;
    if (r.status !== 'registered') {
      window.toast && window.toast('「등록」 상태인 회차만 시작할 수 있습니다.', 'warning'); return;
    }
    if (!r.inputFrom) {
      window.toast && window.toast('입력 시작일을 먼저 설정해주세요.', 'warning'); return;
    }
    /* 평가자 미지정 회차는 시작 불가 — 회차를 열어 평가자를 지정(자동 배정 + 부재 시 수동)한 뒤 시작 */
    const unassigned = roundUnassignedEvaluatorCount(r);
    if (unassigned > 0) {
      window.toast && window.toast(`평가자가 지정되지 않은 항목이 ${unassigned}건 있습니다. 회차를 열어 평가자를 지정한 뒤 시작할 수 있습니다.`, 'warning');
      return;
    }
    if (!confirm(`「${r.name}」 평가를 시작합니다.\n· 회차 설정 잠금\n· 평가자에게 알림 발송\n· 입력 시작일이 지나면 자동으로 「평가 진행중」 으로 전환\n계속하시겠습니까?`)) return;
    const todayStr = ymd(new Date(TODAY));
    r.status = (r.inputFrom > todayStr) ? 'pending' : 'inProgress';
    applyFilter(); renderTable();
    window.toast && window.toast(`${r.name} — ${STATUS[r.status].label}`, 'success');
  }

  function doCancelRow(id) {
    const r = STATE.rounds.find(x => x.id === id); if (!r) return;
    if (!['pending', 'inProgress', 'closed'].includes(r.status)) return;
    if (!confirm(`「${r.name}」 평가를 중단합니다.\n· 회차가 폐기되어 더 이상 진행되지 않음\n· 기존 입력값은 이력으로 보존\n· 복구 불가\n계속하시겠습니까?`)) return;
    r.status = 'canceled';
    applyFilter(); renderTable();
    window.toast && window.toast(`${r.name} — 회차 폐기됨`, 'info');
  }

  /* 결과 보기 — 평가 결과 모달 오픈 (provider: App.HREvalResult) */
  function doOpenResult(id) {
    const r = STATE.rounds.find(x => x.id === id); if (!r) return;
    if (App.HREvalResult && typeof App.HREvalResult.open === 'function') {
      App.HREvalResult.open(id);
    } else {
      window.toast && window.toast('결과 모달을 불러올 수 없습니다.', 'warning');
    }
  }

  function doFinalizeRow(id) {
    const r = STATE.rounds.find(x => x.id === id); if (!r) return;
    if (r.status !== 'closed') return;
    if (!confirm(`「${r.name}」 평가를 확정합니다.\n· 결과 등급이 공식 결정됨\n· 이후 점수/등급 변경 불가\n계속하시겠습니까?`)) return;
    r.status = 'finalized';
    applyFilter(); renderTable();
    window.toast && window.toast(`${r.name} 평가 확정 완료`, 'success');
  }

  /* ============ 회차 복제 (모달) ============ */
  function openCopyModal(id) {
    const r = STATE.rounds.find(x => x.id === id); if (!r) return;
    STATE.copySrcId = id;
    $('#evr-copy-src').textContent = `${r.name} (${r.id})`;
    $('#evr-copy-name').value = `${r.name} (복사)`;
    $('#evr-copy-period-from').value = '';
    $('#evr-copy-period-to').value = '';
    $('#evr-copy-input-from').value = '';
    $('#evr-copy-input-to').value = '';
    openModal('modal-evr-copy');
  }
  function confirmCopy() {
    const src = STATE.rounds.find(x => x.id === STATE.copySrcId); if (!src) return;
    const name = $('#evr-copy-name').value.trim();
    if (!name) { window.toast && window.toast('새 평가명을 입력하세요.', 'warning'); return; }
    const newId = newSeqId(STATE.rounds);
    const periodFrom = $('#evr-copy-period-from').value || src.periodFrom;
    const periodTo   = $('#evr-copy-period-to').value   || src.periodTo;
    const inputFrom  = $('#evr-copy-input-from').value  || src.inputFrom;
    const inputTo    = $('#evr-copy-input-to').value    || src.inputTo;

    STATE.rounds.unshift({
      id: newId,
      name,
      typeKey: src.typeKey,
      periodFrom, periodTo, inputFrom, inputTo,
      description: src.description || '',
      status: 'registered',
      targetCount: 0,
      completedCount: 0,
      targetFilter: Object.assign({}, src.targetFilter || defaultTargetFilter()),
      evaluatorAssignments: {},  /* 복제 시 평가자 지정은 초기화 — 대상자 재선택 필요 */
      createdBy: HR_NAME,
      createdAt: TODAY,
    });
    closeModal('modal-evr-copy');
    applyFilter(); renderTable();
    window.toast && window.toast(`${name} 회차가 생성되었습니다. (${newId})`, 'success');
  }

  /* =========================================================
   *  VIEW: DETAIL / CREATE (공용 폼)
   * ========================================================= */
  function openDetail(id) {
    const r = STATE.rounds.find(x => x.id === id); if (!r) return;
    STATE.view = 'detail';
    STATE.editingId = id;
    STATE.form = cloneRoundForEdit(r);
    renderFormView(document.getElementById('page-hr-eval-round'));
  }
  function openCreate() {
    STATE.view = 'create';
    STATE.editingId = null;
    STATE.form = newFormDefaults();
    renderFormView(document.getElementById('page-hr-eval-round'));
  }
  /* 위저드(스텝) 레이아웃을 쓰는 뷰 — 등록(create) / 수정(edit) 공통 */
  function isWizardView() { return STATE.view === 'create' || STATE.view === 'edit'; }
  /* 상세 「수정」 → 등록과 동일한 3단계 위저드로 진입. 대상자 조건↔평가자 지정이 단계 전환마다 다시 잡힘. */
  function openEditWizard(id) {
    const r = STATE.rounds.find(x => x.id === id); if (!r) return;
    if (!isEditable(r.status)) {
      window.toast && window.toast('등록(시작 전) 상태의 회차만 수정할 수 있습니다.', 'warning'); return;
    }
    STATE.view = 'edit';
    STATE.editingId = id;
    STATE.form = cloneRoundForEdit(r);   // step = 1 부터
    renderFormView(document.getElementById('page-hr-eval-round'));
  }
  function exitForm() {
    STATE.view = 'list';
    STATE.editingId = null;
    STATE.form = null;
    renderListView(document.getElementById('page-hr-eval-round'));
    applyFilter(); renderTable();
  }

  function newFormDefaults() {
    return {
      id:          newSeqId(STATE.rounds),
      name:        '',
      typeKey:     '',
      periodFrom:  '', periodTo: '',
      inputFrom:   '', inputTo:  '',
      description: '',
      status:      'pending',
      targetFilter: defaultTargetFilter(),
      targetEmpIds: null,   // null = 필터 결과 전체 사용, Set = 사용자가 직접 체크한 ID 만 사용
      targetCount: 0,
      completedCount: 0,
      /* 대상자별 「직접 지정」 단계 평가자 — { [empId]: { '역량_1': 'EMP-0001', ... } }
       *   평가유형 process 의 direct_assign 단계마다 키 발급(예: 역량_1).
       *   평가유형에 direct_assign 단계가 없으면 사용되지 않음. */
      evaluatorAssignments: {},
      editHistory: [],      // 등록/수정 이력 — [{ at, by, reason, kind }]
      step:        1,       // create wizard 현재 단계 (1: 기본정보 / 2: 대상자 / 3: 평가정보)
    };
  }
  function cloneRoundForEdit(r) {
    return {
      id:          r.id,
      name:        r.name,
      typeKey:     r.typeKey,
      periodFrom:  r.periodFrom, periodTo: r.periodTo,
      inputFrom:   r.inputFrom,  inputTo:  r.inputTo,
      description: r.description || '',
      status:      r.status,
      targetFilter: Object.assign({}, r.targetFilter || defaultTargetFilter()),
      targetEmpIds: r.targetEmpIds ? new Set(r.targetEmpIds) : null,
      targetCount: r.targetCount || 0,
      completedCount: r.completedCount || 0,
      evaluatorAssignments: r.evaluatorAssignments ? JSON.parse(JSON.stringify(r.evaluatorAssignments)) : {},
      editHistory: r.editHistory ? JSON.parse(JSON.stringify(r.editHistory)) : [],
      step:        1,
    };
  }

  /* 폼/마법사 마지막 렌더 컨텍스트(뷰+단계) — 같은 컨텍스트 재렌더 시 스크롤 위치 보존 기준 */
  let _evrRenderedCtx = null;
  function renderFormView(pageEl) {
    /* 상태 전이 등 같은 단계 재렌더에서는 스크롤이 위로 튀지 않도록 보존.
       단계/뷰가 바뀌면(다음/이전/goto·목록 진입) 상단부터 보여준다. */
    const _prevScroll = pageEl.querySelector('#evr-form-scroll');
    const _savedTop = _prevScroll ? _prevScroll.scrollTop : 0;
    const _ctxKey = STATE.view + ':' + ((STATE.form && STATE.form.step) || '');
    const _sameCtx = _evrRenderedCtx === _ctxKey;

    const f = STATE.form;
    const isCreate = STATE.view === 'create';
    const isWizard = isWizardView();          // create + edit
    const editable = isWizard;                // 위저드(등록/수정)에서만 입력 가능 — 상세는 읽기전용

    const titleText = isCreate
      ? '평가 회차 등록'
      : STATE.view === 'edit'
        ? `평가 회차 수정 — ${f.name || '(이름 없음)'}`
        : `평가 회차 상세 — ${f.name || '(이름 없음)'}`;
    const statusPillHTML = !isCreate ? statusPill(f.status) : '';
    const subtitle = isWizard
      ? wizardSubtitle(f.step)
      : (f.status === 'registered' ? '회차 상세입니다. [수정] 으로 설정을 변경할 수 있습니다. [시작] 후엔 잠금됩니다.'
         : f.status === 'canceled' ? '중단된 회차입니다. 더 이상 진행되지 않습니다.'
         : f.status === 'finalized' ? '확정된 회차입니다. 결과만 조회 가능합니다.'
         : '진행 중인 회차입니다. 회차 설정은 잠겨 있습니다.');

    /* 상태별 액션 버튼 (detail 뷰 전용) */
    const actionButtons = isWizard ? '' : (() => {
      const s = f.status;
      if (s === 'registered') {
        return `
          <button class="btn btn--sm" type="button" data-evr-form-delete>삭제</button>
          <button class="btn btn--sm" type="button" data-evr-act="edit">수정</button>
          <button class="btn btn--sm btn--primary" type="button" data-evr-act="start">평가 시작</button>
        `;
      }
      if (s === 'pending' || s === 'inProgress') {
        return `
          <button class="btn btn--sm" type="button" data-evr-act="progress">진행 현황</button>
          <button class="btn btn--sm" type="button" data-evr-act="cancel">평가 중단</button>
        `;
      }
      if (s === 'closed') {
        return `
          <button class="btn btn--sm" type="button" data-evr-act="progress">진행 현황</button>
          <button class="btn btn--sm" type="button" data-evr-act="cancel">평가 중단</button>
          <button class="btn btn--sm" type="button" data-evr-act="finalize">평가 확정</button>
        `;
      }
      if (s === 'canceled') {
        return `<button class="btn btn--sm" type="button" data-evr-form-delete>삭제</button>`;
      }
      if (s === 'finalized') {
        return `
          <button class="btn btn--sm" type="button" data-evr-act="progress">진행 현황</button>
          <button class="btn btn--sm btn--primary" type="button" data-evr-act="result">결과 보기</button>
        `;
      }
      return '';
    })();

    pageEl.innerHTML = `
      <div class="page-bar">
        <button class="page-bar__back" type="button" data-evr-form-back>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          목록
        </button>
        <div class="page-bar__divider"></div>
        <div>
          <div class="page-bar__title">${esc(titleText)} ${statusPillHTML ? `<span style="margin-left:8px;vertical-align:middle;">${statusPillHTML}</span>` : ''}</div>
          ${isWizard ? '' : `<div class="page-bar__sub">${esc(subtitle)}</div>`}
        </div>
        <div class="page-bar__spacer" style="flex:1;"></div>
        <div class="page-bar__actions">
          ${isWizard ? '' : actionButtons}
        </div>
      </div>

      ${isWizard ? renderWizard(f) : `
        <div id="evr-form-scroll" style="flex:1;min-height:0;overflow:auto;padding:24px 28px 40px;display:flex;flex-direction:column;gap:16px;background:var(--color-surface-alt);">
          ${renderSectionBasic(f, editable, isCreate)}
          ${renderSectionTargets(f, editable)}
          ${renderSectionEval(f)}
          ${renderSectionAssignments(f)}
          ${renderSectionHistory(f)}
        </div>
      `}
    `;
    bindForm(pageEl);
    _evrRenderedCtx = _ctxKey;
    const _nextScroll = pageEl.querySelector('#evr-form-scroll');
    if (_nextScroll && _sameCtx) _nextScroll.scrollTop = _savedTop;
  }

  /* ============ 3단계 마법사 (create 전용) ============ */
  function wizardSubtitle(step) {
    if (step === 1) return '1단계 — 평가 기본 정보를 입력하세요.';
    if (step === 2) return '2단계 — 평가 대상자 조건을 설정하고 대상을 확정하세요.';
    return '3단계 — 양식과 평가 단계·등급 적용 기준을 확인하고 등록하세요.';
  }
  function renderWizard(f) {
    const cur = f.step || 1;
    const stepLabel = ['기본 정보', '대상자', '평가 정보'];
    const stepSub   = ['평가명·유형·기간', '조건·대상 확정', '적용 기준 미리보기'];
    const items = [1, 2, 3].map(n => {
      const cls = n < cur ? 'is-done' : (n === cur ? 'is-current' : '');
      return `
        <li class="steps-h__item ${cls}" ${n < cur ? `data-evr-wz-goto="${n}" data-step-clickable` : ''}>
          <span class="steps-h__num">${n}</span>
          <div class="steps-h__body">
            <span class="steps-h__title">${stepLabel[n - 1]}</span>
            <small class="steps-h__sub">${stepSub[n - 1]}</small>
          </div>
        </li>`;
    }).join('');

    const bodyHTML = cur === 1 ? renderSectionBasic(f, true, true)
                  : cur === 2 ? renderTargetsWithEmployees(f)
                  : `${renderSectionEval(f)}${renderSectionAssignments(f)}`;

    const isLast = cur === 3;
    const footerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:12px 18px;border-top:1px solid var(--color-divider);background:var(--color-surface);">
        <button class="btn btn--sm" type="button" data-evr-wz-cancel>취소</button>
        <div style="display:flex;gap:8px;">
          <button class="btn btn--sm" type="button" data-evr-wz-prev ${cur === 1 ? 'disabled' : ''}>이전</button>
          ${isLast
            ? `<button class="btn btn--sm btn--primary" type="button" data-evr-form-save>${STATE.view === 'edit' ? '수정 저장' : '등록'}</button>`
            : `<button class="btn btn--sm btn--primary" type="button" data-evr-wz-next>다음</button>`}
        </div>
      </div>
    `;

    return `
      <div style="padding:14px 18px 0;background:var(--color-surface);border-bottom:1px solid var(--color-divider);">
        <ol class="steps-h" style="margin-bottom:14px;">${items}</ol>
      </div>
      <div id="evr-form-scroll" style="flex:1;min-height:0;overflow:auto;padding:24px 28px 40px;display:flex;flex-direction:column;gap:16px;background:var(--color-surface-alt);">
        ${bodyHTML}
      </div>
      ${footerHTML}
    `;
  }

  /* ============ 섹션 1. 기본 정보 ============ */
  function renderSectionBasic(f, editable, isCreate) {
    const typeOpts = listForms().map(t => {
      const sel = (t.key === f.typeKey) ? 'selected' : '';
      return `<option value="${esc(t.key)}" ${sel}>${esc(t.name)}</option>`;
    }).join('');
    const dis = editable ? '' : 'disabled';
    /* 평가요소 등록과 동일한 라벨 폭 적용 — 기본 90px 으로는 「평가 대상기간」 등이 줄바꿈됨 */
    const row2GT = 'grid-template-columns:130px 1fr 110px 1fr;';

    return sectionCard(1, '기본 정보', `
      <div class="fm-tbl fm-tbl--compact fm-tbl--bordered fm-tbl--form">
        <div class="fm-tbl__row fm-tbl__row--2" style="${row2GT}">
          <div class="fm-tbl__label">평가번호</div>
          <div class="fm-tbl__value">
            <input type="text" class="input" id="evr-f-id" value="${esc(f.id)}" style="width:100%;max-width:240px;background:var(--color-surface-alt);" disabled />
          </div>
          <div class="fm-tbl__label">평가명 ${REQ_MARK}</div>
          <div class="fm-tbl__value">
            <input class="input" type="text" id="evr-f-name" value="${esc(f.name)}" placeholder="예: 2026 상반기 정기평가" style="width:100%;max-width:480px;" ${dis} />
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--2" style="${row2GT}">
          <div class="fm-tbl__label">양식 ${REQ_MARK}</div>
          <div class="fm-tbl__value" style="gap:6px;">
            <select class="select" id="evr-f-type" style="flex:1;min-width:0;max-width:280px;" ${dis}>
              <option value="">선택하세요</option>
              ${typeOpts}
            </select>
            <button class="btn btn--sm" type="button" data-evr-type-preview ${f.typeKey ? '' : 'disabled'} title="양식 미리보기"
              style="height:32px;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;flex-shrink:0;">
              ${(window.Icons && window.Icons.eye) || ''}<span>미리보기</span>
            </button>
          </div>
          <div class="fm-tbl__label">설명</div>
          <div class="fm-tbl__value">
            <input class="input" type="text" id="evr-f-desc" value="${esc(f.description)}" placeholder="회차에 대한 메모/안내" style="width:100%;" ${dis} />
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--2" style="${row2GT}">
          <div class="fm-tbl__label">평가 대상기간 ${REQ_MARK}</div>
          <div class="fm-tbl__value" style="gap:6px;">
            <input class="input" type="date" id="evr-f-pfrom" value="${esc(f.periodFrom)}" ${dis} />
            <span style="color:var(--color-text-muted);">~</span>
            <input class="input" type="date" id="evr-f-pto" value="${esc(f.periodTo)}" ${dis} />
          </div>
          <div class="fm-tbl__label">평가 입력기간 ${REQ_MARK}</div>
          <div class="fm-tbl__value" style="gap:6px;">
            <input class="input" type="date" id="evr-f-ifrom" value="${esc(f.inputFrom)}" ${dis} />
            <span style="color:var(--color-text-muted);">~</span>
            <input class="input" type="date" id="evr-f-ito" value="${esc(f.inputTo)}" ${dis} />
          </div>
        </div>
        ${isCreate ? '' : `
          <div class="fm-tbl__row fm-tbl__row--2" style="${row2GT}">
            <div class="fm-tbl__label">생성자</div>
            <div class="fm-tbl__value">${esc(f.createdBy || '-')}</div>
            <div class="fm-tbl__label">생성일</div>
            <div class="fm-tbl__value">${f.createdAt ? esc(fmtD(f.createdAt)) : '-'}</div>
          </div>
        `}
      </div>
    `, { help: isCreate ? '평가명·양식·기간을 입력하세요.' : '' });
  }

  /* ============ 섹션 2. 대상자 (필터) ============ */
  function renderSectionTargets(f, editable) {
    const tf = f.targetFilter;
    const dis = editable ? '' : 'disabled';

    const chkboxes = (items, selected, name) => items.map(o => `
      <label class="cb"><input type="checkbox" data-evr-tf="${name}" value="${esc(o.value)}" ${selected.includes(o.value) ? 'checked' : ''} ${dis} /> ${esc(o.label)}</label>
    `).join('');
    const radios = (items, selected, name) => items.map(o => `
      <label class="cb"><input type="radio" name="${name}" data-evr-tf="${name}" value="${esc(o.value)}" ${selected === o.value ? 'checked' : ''} ${dis} /> ${esc(o.label)}</label>
    `).join('');
    const opts = (items, selected) => ['<option value="">전체</option>',
      ...items.map(v => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(v)}</option>`)
    ].join('');

    const row2GT = 'grid-template-columns:130px 1fr 110px 1fr;';

    return sectionCard(2, '대상자 조건', `
      <div class="fm-tbl fm-tbl--compact fm-tbl--bordered fm-tbl--form">
        <div class="fm-tbl__row fm-tbl__row--2" style="${row2GT}">
          <div class="fm-tbl__label">재직 상태</div>
          <div class="fm-tbl__value" style="gap:14px;flex-wrap:wrap;">${chkboxes(EMP_STATUS_OPTIONS, tf.empStatus || [], 'empStatus')}</div>
          <div class="fm-tbl__label">고용구분</div>
          <div class="fm-tbl__value" style="gap:14px;flex-wrap:wrap;">${chkboxes(EMP_TYPE_OPTIONS, tf.empType || [], 'empType')}</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--2" style="${row2GT}">
          <div class="fm-tbl__label">수습 여부</div>
          <div class="fm-tbl__value" style="gap:14px;flex-wrap:wrap;">${radios(TRI_OPTIONS, tf.probation || 'any', 'evr-tf-prob')}</div>
          <div class="fm-tbl__label">도급 여부</div>
          <div class="fm-tbl__value" style="gap:14px;flex-wrap:wrap;">${radios(TRI_OPTIONS, tf.outsource || 'any', 'evr-tf-out')}</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--2" style="${row2GT}">
          <div class="fm-tbl__label">직군</div>
          <div class="fm-tbl__value" style="gap:14px;flex-wrap:wrap;">${chkboxes(JOB_CAT_OPTIONS, tf.jobCat || [], 'jobCat')}</div>
          <div class="fm-tbl__label">직책</div>
          <div class="fm-tbl__value">
            <select class="select" id="evr-tf-position" style="width:100%;max-width:260px;" ${dis}>${opts(POSITION_OPTIONS, tf.position)}</select>
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--2" style="${row2GT}">
          <div class="fm-tbl__label">부서</div>
          <div class="fm-tbl__value">
            <select class="select" id="evr-tf-dept" style="width:100%;max-width:340px;" ${dis}>${opts(DEPT_OPTIONS, tf.dept)}</select>
          </div>
          <div class="fm-tbl__label">입사일</div>
          <div class="fm-tbl__value" style="gap:6px;">
            <input class="input" type="date" id="evr-tf-joinfrom" value="${esc(tf.joinFrom || '')}" ${dis} />
            <span style="color:var(--color-text-muted);">~</span>
            <input class="input" type="date" id="evr-tf-jointo" value="${esc(tf.joinTo || '')}" ${dis} />
          </div>
        </div>
      </div>
    `, { help: '조건에 맞는 대상자가 아래 목록에 자동으로 표시됩니다.' });
  }

  /* ============ Step 2 (create 전용) — 조건 카드 안에 직원 목록까지 같이 표시 ============
   *   detail 뷰는 renderSectionTargets 만 호출하여 필터만 보여준다. */
  function renderTargetsWithEmployees(f) {
    const card = renderSectionTargets(f, true);
    const list = renderTargetEmployees(f);
    /* 닫는 </section> 직전에 목록을 끼워넣음 — 같은 카드 안에 헤어라인 구분으로 들어감 */
    return card.replace(/<\/section>\s*$/, list + '</section>');
  }

  /* ============ Step 2 보조: 필터 조건에 맞는 직원 목록 ============
   *   공유 입사자 데이터(App.HRMembers.list) 가 단일 소스.
   *   targetFilter 의 조건을 AND 로 결합 — 빈 배열/'any'/빈 문자열은 전체 통과. */
  function listEmployeesMatchingFilter(tf) {
    const all = (window.App && App.HRMembers && App.HRMembers.list) ? App.HRMembers.list() : [];
    /* 입사자 관리의 status 값 → 재직/휴직 매핑 (휴직 데이터가 별도로 없는 mock 한계 — retired/contractExpired 만 제외) */
    const isActive = (e) => e.status !== 'retired' && e.status !== 'contractExpired';

    return all.filter(e => {
      /* 재직 상태 */
      if (tf.empStatus && tf.empStatus.length) {
        const ok = (tf.empStatus.includes('active') && isActive(e))
                || (tf.empStatus.includes('leave')  && !isActive(e));
        if (!ok) return false;
      }
      /* 고용구분 */
      if (tf.empType && tf.empType.length && !tf.empType.includes(e.empType)) return false;
      /* 수습 여부 */
      if (tf.probation === 'on'  && !e.probation) return false;
      if (tf.probation === 'off' &&  e.probation) return false;
      /* 도급 여부 */
      if (tf.outsource === 'on'  && !e.contractOut) return false;
      if (tf.outsource === 'off' &&  e.contractOut) return false;
      /* 직군 — mock 의 jobCat 키와 일치 (office/production/research) */
      if (tf.jobCat && tf.jobCat.length && !tf.jobCat.includes(e.jobCat)) return false;
      /* 직책 / 부서 — 단일 선택, '' 면 전체 통과 */
      if (tf.position && e.position !== tf.position) return false;
      if (tf.dept) {
        /* DEPT_OPTIONS 는 "본부 / 팀" 형식 — 본부만 선택 시 본부 자체 + 그 본부 내 팀 모두 통과 */
        const want = tf.dept;
        const wantTeam = want.includes(' / ') ? want.split(' / ').pop().trim() : null;
        const wantHead = want.split(' / ')[0].trim();
        const hit = (e.dept === want) || (wantTeam && e.dept === wantTeam) || (!wantTeam && e.dept === wantHead);
        if (!hit) return false;
      }
      /* 입사일 범위 */
      if (tf.joinFrom && e.joinDate && e.joinDate < tf.joinFrom) return false;
      if (tf.joinTo   && e.joinDate && e.joinDate > tf.joinTo)   return false;
      return true;
    });
  }

  function renderTargetEmployees(f) {
    const matched = listEmployeesMatchingFilter(f.targetFilter);
    /* 사용자가 한 번도 손대지 않았으면 전원 선택 상태로 본다 (=null). 손대면 Set 로 전환. */
    const sel = f.targetEmpIds;
    const isSelected = (id) => sel ? sel.has(id) : true;
    const selCount = sel ? matched.filter(e => sel.has(e.id)).length : matched.length;
    const total = matched.length;
    const allChecked = total > 0 && selCount === total;
    const noneChecked = selCount === 0;
    const empTypeLabel = (v) => ({ regular:'정규직', contract:'계약직', daily:'일용직' }[v] || v || '-');
    const jobCatLabel  = (v) => ({ office:'사무직', production:'생산직', research:'연구직' }[v] || v || '-');

    const rowsHTML = !total
      ? `<tr><td colspan="7" style="text-align:center;color:var(--color-text-muted);padding:32px 0;">조건에 맞는 대상자가 없습니다. 위 조건을 조정하세요.</td></tr>`
      : matched.map(e => {
          const checked = isSelected(e.id);
          return `
            <tr data-evr-emp-row="${esc(e.id)}" class="${checked ? 'is-selected' : ''}">
              <td style="text-align:center;width:40px;"><input type="checkbox" data-evr-emp-cb value="${esc(e.id)}" ${checked ? 'checked' : ''} /></td>
              <td style="white-space:nowrap;">${esc(e.id)}</td>
              <td style="white-space:nowrap;">${esc(e.name)}</td>
              <td style="white-space:nowrap;">${esc(e.dept || '-')}</td>
              <td style="white-space:nowrap;">${esc(e.position || '-')}</td>
              <td style="white-space:nowrap;">${esc(empTypeLabel(e.empType))}</td>
              <td style="white-space:nowrap;">${esc(jobCatLabel(e.jobCat))}</td>
            </tr>`;
        }).join('');

    /* 필드 그룹 헤더 — 평가요소 등록의 fieldLabel 패턴 차용 */
    const blockLabel = `
      <div style="margin-bottom:8px;display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div>
          <span style="font-size:var(--fs-sm);color:var(--color-text-sub);font-weight:var(--fw-medium);">대상자 목록</span>
          <small style="margin-left:8px;color:var(--color-text-muted);font-size:var(--fs-xs);">조건에 매칭된 직원 중 평가 대상으로 포함할 사람을 체크합니다.</small>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:var(--fs-sm);">선택 <strong style="color:var(--color-brand-primary);margin-left:2px;">${selCount.toLocaleString()}</strong><span style="color:var(--color-text-muted);"> / ${total.toLocaleString()} 명</span></span>
          <span style="display:flex;gap:6px;">
            <button class="btn btn--xs" type="button" data-evr-emp-all>전체 선택</button>
            <button class="btn btn--xs" type="button" data-evr-emp-none>전체 해제</button>
          </span>
        </div>
      </div>`;

    const tableHTML = `
      <div style="max-height:340px;overflow:auto;border:1px solid var(--color-border);border-radius:var(--radius-md);">
        <table class="tbl tbl--bordered tbl--compact tbl--hover" style="margin:0;">
          <thead>
            <tr>
              <th style="background:var(--color-surface-alt);text-align:center;font-weight:var(--fw-medium);width:48px;">
                <input type="checkbox" data-evr-emp-check-all ${allChecked ? 'checked' : ''} ${!total ? 'disabled' : ''} aria-label="전체 선택" />
              </th>
              <th style="background:var(--color-surface-alt);text-align:center;font-weight:var(--fw-medium);width:120px;">사번</th>
              <th style="background:var(--color-surface-alt);text-align:center;font-weight:var(--fw-medium);width:100px;">성명</th>
              <th style="background:var(--color-surface-alt);font-weight:var(--fw-medium);">부서</th>
              <th style="background:var(--color-surface-alt);text-align:center;font-weight:var(--fw-medium);width:90px;">직책</th>
              <th style="background:var(--color-surface-alt);text-align:center;font-weight:var(--fw-medium);width:90px;">고용구분</th>
              <th style="background:var(--color-surface-alt);text-align:center;font-weight:var(--fw-medium);width:90px;">직군</th>
            </tr>
          </thead>
          <tbody data-evr-emp-body>${rowsHTML}</tbody>
        </table>
      </div>
      ${noneChecked && total > 0 ? `<div style="color:var(--color-warning);font-size:var(--fs-xs);margin-top:6px;">최소 1명 이상 선택해야 다음 단계로 이동할 수 있습니다.</div>` : ''}`;

    return `<div data-evr-sec="target-list" style="margin-top:18px;padding-top:18px;border-top:1px solid var(--color-divider);">${blockLabel}${tableHTML}</div>`;
  }

  /* ============ 섹션 3. 평가 정보 (평가유형 미리보기) ============
   *  테이블 구조: [평가요소(역량) | 평가 양식(미리보기) | 평가 프로세스(chip flow)]
   *    - 평가요소는 역량 단일, 배점 없음 */
  /* 평가유형의 평가요소(역량) 행 — 양식 미리보기 + 평가 프로세스 chip flow.
   *   formPreviewAttr: 양식 미리보기 트리거에 붙일 data-* 속성 문자열 (renderSectionEval / type preview 공용). */
  function evalElementRowsHTML(type, formPreviewAttr) {
    const comp = type.competency || { scale: 5, sections: [] };
    const sections = comp.sections || [];
    const itemCnt = sections.reduce((s, sec) => s + (sec.items || []).length, 0);
    const procCell = stageFlowChipsHTML();

    const masterCell = `<button type="button" ${formPreviewAttr}
               style="background:none;border:0;padding:0;cursor:pointer;text-align:left;display:block;width:100%;"
               title="역량 양식 미리보기">
         <div style="font-weight:var(--fw-medium);color:var(--color-brand-primary);text-decoration:underline;text-underline-offset:3px;">역량 양식</div>
         <div style="margin-top:2px;color:var(--color-text-muted);font-size:var(--fs-xs);">${comp.scale || 5}점 · 분야 ${sections.length} · 항목 ${itemCnt}</div>
       </button>`;

    return `
      <tr>
        <td style="text-align:center;width:80px;color:var(--color-text-sub);font-weight:var(--fw-medium);">역량</td>
        <td style="width:auto;">${masterCell}</td>
        <td style="width:auto;">${procCell}</td>
      </tr>`;
  }

  function renderSectionEval(f) {
    const type = findEvalType(f.typeKey);
    if (!type) {
      const empty = `
        <div style="padding:18px;background:var(--color-surface-alt);border-radius:var(--radius-md);color:var(--color-text-muted);font-size:var(--fs-sm);">
          양식을 선택하면 문항 구성과 평가 단계·등급이 표시됩니다.
        </div>
      `;
      return `<div data-evr-sec="eval">${sectionCard(3, '평가 정보', empty)}</div>`;
    }

    const comp = type.competency || { scale: 5, sections: [] };
    const sections = comp.sections || [];
    const itemCnt = sections.reduce((s, sec) => s + (sec.items || []).length, 0);

    /* 양식 요약 1줄 + 미리보기 버튼 (인라인 요약 패턴 — 인지 비용 최소화) */
    const formSummary = `
      <button type="button" data-evr-form-preview="${esc(type.key)}"
        style="background:none;border:0;padding:0;cursor:pointer;text-align:left;display:inline-flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <strong style="color:var(--color-brand-primary);text-decoration:underline;text-underline-offset:3px;">${esc(type.name)}</strong>
        <span style="color:var(--color-text-muted);font-size:var(--fs-xs);">${comp.scale || 5}점 · 분야 ${sections.length} · 항목 ${itemCnt}</span>
        <span class="btn btn--xs" style="pointer-events:none;">미리보기</span>
      </button>`;

    const body = `
      <div class="fm-tbl fm-tbl--compact fm-tbl--bordered fm-tbl--form">
        <div class="fm-tbl__row fm-tbl__row--1" style="grid-template-columns:110px 1fr;">
          <div class="fm-tbl__label">평가 양식</div>
          <div class="fm-tbl__value">${formSummary}</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" style="grid-template-columns:110px 1fr;">
          <div class="fm-tbl__label">평가 단계</div>
          <div class="fm-tbl__value">${stageFlowChipsHTML()}</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" style="grid-template-columns:110px 1fr;">
          <div class="fm-tbl__label">등급 산정</div>
          <div class="fm-tbl__value">${gradeSchemeHTML()}</div>
        </div>
      </div>
      <div style="margin-top:8px;color:var(--color-text-muted);font-size:var(--fs-xs);">
        평가 단계·등급은 「역량평가 설정 &gt; 단계·등급 설정」에서 관리되며, 회차는 현재 설정을 상속합니다.
      </div>
    `;

    return `<div data-evr-sec="eval">${sectionCard(3, '평가 정보', body)}</div>`;
  }


  /* ============ 섹션 4. 평가자 지정 (direct_assign 단계가 있는 경우만 노출) ============
   *   - 평가유형 process 에 「직접 지정」 단계가 하나라도 있으면 표시
   *   - 행: 선택된 대상자, 열: direct_assign 단계
   *   - 셀: 평가자 선택 select (자기 자신은 옵션에서 제외)
   *   - 회차 등록자가 직접 입력 — 미지정 시 회차 시작 불가 */
  function renderSectionAssignments(f) {
    const type = findEvalType(f.typeKey);
    if (!type) return ''; // 평가유형 없으면 섹션 자체 없음
    const stages = listAllStages(type);
    if (!stages.length) return ''; // 평가자 단계 없으면 섹션 없음

    /* 대상자별 자동 배정(직속 상급자·부서장 등) 먼저 채움 —
       등록 위저드, 또는 아직 시작 전(registered)인 회차 상세에서만 mutate. 시작된 회차는 저장값 그대로. */
    if (STATE.view === 'create' || f.status === 'registered') ensureAutoAssignments(f);

    const allEmps = (window.App && App.HRMembers && App.HRMembers.list) ? App.HRMembers.list() : [];
    const empById = {};
    allEmps.forEach(e => { empById[e.id] = e; });
    const matched = listEmployeesMatchingFilter(f.targetFilter);
    const idSet = f.targetEmpIds
      ? (f.targetEmpIds instanceof Set ? f.targetEmpIds : new Set(f.targetEmpIds))
      : null;
    const targets = idSet ? matched.filter(e => idSet.has(e.id)) : matched;

    if (!targets.length) {
      const empty = `
        <div style="padding:18px;background:var(--color-surface-alt);border-radius:var(--radius-md);color:var(--color-text-muted);font-size:var(--fs-sm);">
          평가 대상자를 먼저 선택하면 대상자별 평가자 배정 표가 표시됩니다.
        </div>
      `;
      return `<div data-evr-sec="assign">${sectionCard(4, '평가자 지정', empty)}</div>`;
    }

    /* 수동 select 후보 — 재직자만, 사번 오름차순 */
    const candidates = activeCandidates(allEmps).slice().sort((a, b) => (a.id || '').localeCompare(b.id || ''));
    const cands = activeCandidates(allEmps);

    /* 수동 지정 필요(빈 셀) 카운트 */
    const totalCells = targets.length * stages.length;
    let unsetCount = 0;
    targets.forEach(t => {
      const a = (f.evaluatorAssignments || {})[t.id] || {};
      stages.forEach(s => { if (!a[s.key]) unsetCount += 1; });
    });

    /* 열 헤더 — 1차 / 2차 평가자 (전역 단계·등급 설정 상속) */
    const stageHeads = stages.map(s =>
      `<th style="min-width:200px;">${s.stageIdx + 1}차 평가자 <span class="t-muted" style="font-weight:var(--fw-regular);">(${esc(roleLabel(s.role))})</span></th>`
    ).join('');

    /* 한 셀 렌더 — 자동 배정은 읽기전용 표시, 직접지정/부재는 수동 select */
    const renderCell = (t, s, a) => {
      const cur = a[s.key] || '';
      const isManual = (s.role === 'direct_assign') || !cur;   // 직접지정 단계이거나 자동 해석 실패 → 수동
      if (!isManual) {
        const p = empById[cur];
        const via = assignmentViaLabel(t, s.role, cur, cands);
        const nm = p ? `${esc(p.name)} <span class="t-muted">(${esc(p.id)})</span>` : `<span class="t-muted">${esc(cur)}</span>`;
        const dept = p ? esc(p.dept || '-') : '';
        return `
          <td>
            <div style="font-weight:var(--fw-medium);">${nm}</div>
            <div style="margin-top:2px;font-size:var(--fs-xs);">
              <span class="pill pill--soft-blue">${esc(via)}</span>
              ${dept ? `<span class="t-muted" style="margin-left:6px;">${dept}</span>` : ''}
            </div>
          </td>`;
      }
      /* 수동 select — 자기 자신 제외 */
      const opts = candidates
        .filter(c => c.id !== t.id)
        .map(c => `<option value="${esc(c.id)}" ${c.id === cur ? 'selected' : ''}>${esc(c.name)} (${esc(c.id)}) — ${esc(c.dept || '-')}</option>`)
        .join('');
      const manualTag = s.role === 'direct_assign'
        ? `<span class="pill" style="margin-bottom:4px;display:inline-block;">직접 지정</span>`
        : `<span class="pill pill--soft-warning" style="margin-bottom:4px;display:inline-block;">상급자 부재 · 수동</span>`;
      return `
        <td>
          <div>${manualTag}</div>
          <select class="select select--sm" data-evr-asg="${esc(t.id)}|${esc(s.key)}" style="width:100%;min-width:190px;${cur ? '' : 'border-color:var(--color-warning);'}">
            <option value="">선택하세요</option>
            ${opts}
          </select>
        </td>`;
    };

    /* 행 */
    const rowsHTML = targets.map(t => {
      const a = (f.evaluatorAssignments || {})[t.id] || {};
      const cells = stages.map(s => renderCell(t, s, a)).join('');
      return `
        <tr>
          <td style="white-space:nowrap;">${esc(t.id)}</td>
          <td style="white-space:nowrap;">${esc(t.name)}</td>
          <td>${esc(t.dept || '-')}</td>
          <td style="text-align:center;white-space:nowrap;">${esc(t.position || '-')}</td>
          ${cells}
        </tr>`;
    }).join('');

    const stageBadges = stages.map(s =>
      `<span class="pill pill--info" style="margin-right:6px;">${s.stageIdx + 1}차 · ${esc(roleLabel(s.role))}</span>`
    ).join('');

    const body = `
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px;">
        <div>${stageBadges}</div>
        <div style="flex:1;"></div>
        <div data-evr-asg-counter style="font-size:var(--fs-sm);color:${unsetCount ? 'var(--color-warning)' : 'var(--color-success)'};font-weight:var(--fw-medium);">
          ${unsetCount ? `수동 지정 필요 ${unsetCount.toLocaleString()}건` : `평가자 배정 완료 (총 ${totalCells.toLocaleString()}건)`}
        </div>
      </div>

      <div style="max-height:440px;overflow:auto;border:1px solid var(--color-border);border-radius:var(--radius-md);">
        <table class="tbl tbl--bordered" style="margin:0;">
          <thead>
            <tr>
              <th style="width:120px;">사번</th>
              <th style="width:90px;">성명</th>
              <th>부서</th>
              <th style="width:80px;text-align:center;">직책</th>
              ${stageHeads}
            </tr>
          </thead>
          <tbody>${rowsHTML}</tbody>
        </table>
      </div>
      <div style="margin-top:6px;color:var(--color-text-muted);font-size:var(--fs-xs);">
        1·2차 평가자는 단계·등급 설정의 직책 기준으로 자동 배정되며, 해당 직책자가 없거나 「직접 지정」인 경우만 수동 선택합니다.
        본인·대표이사 단계는 자동 확정되어 배정이 필요 없습니다. 미지정 상태로는 회차를 시작할 수 없습니다.
      </div>
    `;

    return `<div data-evr-sec="assign">${sectionCard(4, '평가자 지정', body)}</div>`;
  }

  /* ============ 섹션 5. 수정 이력 (상세 전용, 읽기 전용) ============
   *   등록('회차 등록') + 수정(사유 입력 모달로 기록) 이력을 최신순으로 표시. */
  function renderSectionHistory(f) {
    const hist = (f.editHistory || []);
    const kindPill = (k) => k === 'create'
      ? '<span class="pill pill--soft-success">등록</span>'
      : '<span class="pill">수정</span>';
    const rows = hist.length
      ? hist.map((h, i) => ({ h, i })).reverse().map(({ h }) => `
          <tr>
            <td style="text-align:center;">${kindPill(h.kind)}</td>
            <td>${h.at ? esc(fmtD(h.at)) : '-'}</td>
            <td>${esc(h.by || '-')}</td>
            <td>${esc(h.reason || '-')}</td>
          </tr>`).join('')
      : `<tr><td colspan="4" style="text-align:center;color:var(--color-text-muted);padding:14px;">수정 이력이 없습니다.</td></tr>`;
    const body = `
      <table class="tbl tbl--bordered" style="margin:0;">
        <thead>
          <tr>
            <th style="width:80px;text-align:center;">구분</th>
            <th style="width:130px;">일자</th>
            <th style="width:120px;">처리자</th>
            <th>사유</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
    return sectionCard(5, '수정 이력', body, { help: `총 ${hist.length}건` });
  }

  /* ============ Form 바인딩 ============ */
  function bindForm(pageEl) {
    pageEl.querySelector('[data-evr-form-back]').addEventListener('click', exitForm);

    const saveBtn = pageEl.querySelector('[data-evr-form-save]');
    if (saveBtn) saveBtn.addEventListener('click', saveForm);

    const delBtn = pageEl.querySelector('[data-evr-form-delete]');
    if (delBtn) delBtn.addEventListener('click', () => {
      if (!STATE.editingId) return;
      if (!confirm('이 회차를 삭제하시겠습니까?')) return;
      STATE.rounds = STATE.rounds.filter(r => r.id !== STATE.editingId);
      window.toast && window.toast('1건 삭제 완료', 'success');
      exitForm();
    });

    /* 상태 전이 액션 (시작 / 중단 / 확정) */
    pageEl.querySelectorAll('[data-evr-act]').forEach(b => b.addEventListener('click', e => {
      const action = e.currentTarget.dataset.evrAct;
      const r = STATE.rounds.find(x => x.id === STATE.editingId);
      if (!r) return;

      const doTransit = (newStatus, toastMsg) => {
        r.status = newStatus;
        window.toast && window.toast(toastMsg, 'success');
        /* 화면 갱신 — 폼 다시 그림 */
        STATE.form = Object.assign({}, r);
        renderFormView(pageEl);
      };

      if (action === 'start') {
        /* 평가자 지정 미완료 시 시작 차단 */
        if (!validateStep(3)) return;
        const confirmMsg = '평가를 시작하시겠습니까?\n· 회차 설정 잠금\n· 평가자에게 알림 발송\n· 입력 시작일이 지나면 자동으로 「평가 진행중」 으로 전환';
        if (!confirm(confirmMsg)) return;
        /* 시작 전 평가자 지정값을 회차에 영구 반영 */
        r.evaluatorAssignments = STATE.form.evaluatorAssignments || {};
        /* 시작 클릭 시점에 입력 시작일과 비교해서 pending 또는 inProgress 결정 */
        const todayStr = ymd(new Date(TODAY));
        const next = (r.inputFrom && r.inputFrom > todayStr) ? 'pending' : 'inProgress';
        const label = STATUS[next].label;
        doTransit(next, `평가 시작 — ${label}`);
      } else if (action === 'cancel') {
        const confirmMsg = '평가를 중단하시겠습니까?\n· 회차가 폐기되어 더 이상 진행되지 않음\n· 기존 입력값은 이력으로 보존\n· 복구 불가';
        if (!confirm(confirmMsg)) return;
        doTransit('canceled', '평가 중단 — 회차 폐기됨');
      } else if (action === 'finalize') {
        const confirmMsg = '평가를 확정하시겠습니까?\n· 결과 등급이 공식 결정됨\n· 이후 점수/등급 변경 불가';
        if (!confirm(confirmMsg)) return;
        doTransit('finalized', '평가 확정 완료');
      } else if (action === 'result') {
        doOpenResult(r.id);
      } else if (action === 'progress') {
        openProgress(r.id);
      } else if (action === 'edit') {
        openEditWizard(r.id);
      }
    }));

    /* 마법사 네비게이션 (등록/수정 위저드) */
    if (isWizardView()) bindWizardNav(pageEl);

    /* 기본 정보 입력 → STATE.form 동기화 */
    const f = STATE.form;

    /* 평가유형 미리보기 모달 — Section 3 와 동일 구성 + 등급 구간.
     * 회차 상태와 무관하게 (수정 불가 detail 에서도) 동작. */
    const previewBtn = pageEl.querySelector('[data-evr-type-preview]');
    if (previewBtn) previewBtn.addEventListener('click', () => {
      if (!f.typeKey) return;
      openTypePreviewModal(f.typeKey);
    });

    /* Section 3 「평가 정보」 의 평가 양식 셀 클릭 → 역량 양식 미리보기 모달.
     *   bindForm 은 renderFormView 마다 호출되지만, 이 위임 핸들러는 pageEl 단위로 한 번만 부착해야
     *   중복 바인딩을 피할 수 있다. (refreshEvalAndAssignSections 의 부분 재렌더에도 자동 대응) */
    if (!pageEl.dataset.evrFormPreviewBound) {
      pageEl.dataset.evrFormPreviewBound = '1';
      pageEl.addEventListener('click', e => {
        const btn = e.target.closest('[data-evr-form-preview]');
        if (!btn || !pageEl.contains(btn)) return;
        openFormPreviewModal(btn.dataset.evrFormPreview);
      });
    }

    const editable = isWizardView();
    if (!editable) return;

    const setVal = (sel, key) => {
      const el = pageEl.querySelector(sel); if (!el) return;
      el.addEventListener('input', () => { f[key] = el.value; });
    };
    setVal('#evr-f-name',  'name');
    setVal('#evr-f-desc',  'description');
    setVal('#evr-f-pfrom', 'periodFrom');
    setVal('#evr-f-pto',   'periodTo');
    setVal('#evr-f-ifrom', 'inputFrom');
    setVal('#evr-f-ito',   'inputTo');

    /* 입력 시 인라인 필드 에러 자동 해제 */
    App.Forms && App.Forms.applyOnInput && App.Forms.applyOnInput(pageEl);

    /* 평가유형 변경 → 평가 정보 + 평가자 지정 섹션 재렌더 + 미리보기 버튼 enabled 갱신 */
    const typeSel = pageEl.querySelector('#evr-f-type');
    if (typeSel) typeSel.addEventListener('change', () => {
      f.typeKey = typeSel.value;
      f.evaluatorAssignments = {};   /* 평가유형 변경 시 기존 평가자 지정은 무효화 */
      const prevBtn = pageEl.querySelector('[data-evr-type-preview]');
      if (prevBtn) prevBtn.disabled = !f.typeKey;
      refreshEvalAndAssignSections(pageEl);
    });

    /* 대상자 필터 동기화 */
    const tf = f.targetFilter;
    pageEl.querySelectorAll('[data-evr-tf]').forEach(el => {
      const name = el.dataset.evrTf;
      const evt = el.type === 'checkbox' || el.type === 'radio' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        if (el.type === 'checkbox') {
          /* 다중 (empStatus / empType / jobCat) */
          tf[name] = pageEl.querySelectorAll(`[data-evr-tf="${name}"]:checked`).length
            ? Array.from(pageEl.querySelectorAll(`[data-evr-tf="${name}"]:checked`)).map(c => c.value)
            : [];
        } else if (el.type === 'radio') {
          /* probation / outsource — name 이 'evr-tf-prob' 또는 'evr-tf-out' */
          if (name === 'evr-tf-prob') tf.probation = el.value;
          if (name === 'evr-tf-out')  tf.outsource = el.value;
        }
        refreshTargetList(pageEl);
      });
    });

    /* 직책 / 부서 / 입사일 */
    const pos = pageEl.querySelector('#evr-tf-position');
    if (pos) pos.addEventListener('change', () => { tf.position = pos.value; refreshTargetList(pageEl); });
    const dept = pageEl.querySelector('#evr-tf-dept');
    if (dept) dept.addEventListener('change', () => { tf.dept = dept.value; refreshTargetList(pageEl); });
    const jf = pageEl.querySelector('#evr-tf-joinfrom');
    if (jf) jf.addEventListener('input', () => { tf.joinFrom = jf.value; refreshTargetList(pageEl); });
    const jt = pageEl.querySelector('#evr-tf-jointo');
    if (jt) jt.addEventListener('input', () => { tf.joinTo = jt.value; refreshTargetList(pageEl); });

    /* Step 2 — 대상자 목록의 체크박스/툴바 (등록/수정 위저드 공통) */
    if (isWizardView() && f.step === 2) {
      bindTargetEmployees(pageEl);
    }

    /* 평가자 지정 select 바인딩 (detail / wizard step 3) */
    bindAssignments(pageEl);
  }

  /* 평가 정보 + 평가자 지정 섹션을 함께 재렌더. 평가유형 변경/대상자 확정 시 호출. */
  function refreshEvalAndAssignSections(pageEl) {
    const f = STATE.form;
    const evalHost = pageEl.querySelector('[data-evr-sec="eval"]');
    if (evalHost) {
      const wrap = document.createElement('div');
      wrap.innerHTML = renderSectionEval(f);
      evalHost.replaceWith(wrap.firstElementChild);
    }
    /* 평가자 지정 섹션은 「있다가 없어질」 / 「없다가 생길」 수도 있어 부모 컨테이너 기준으로 처리 */
    const oldAssign = pageEl.querySelector('[data-evr-sec="assign"]');
    const newHTML = renderSectionAssignments(f);
    if (oldAssign && newHTML) {
      const wrap = document.createElement('div');
      wrap.innerHTML = newHTML;
      oldAssign.replaceWith(wrap.firstElementChild);
    } else if (oldAssign && !newHTML) {
      oldAssign.remove();
    } else if (!oldAssign && newHTML) {
      /* 평가 정보 섹션 뒤에 끼워넣음 */
      const evalNow = pageEl.querySelector('[data-evr-sec="eval"]');
      if (evalNow) {
        const wrap = document.createElement('div');
        wrap.innerHTML = newHTML;
        evalNow.parentNode.insertBefore(wrap.firstElementChild, evalNow.nextSibling);
      }
    }
    bindAssignments(pageEl);
  }

  function bindAssignments(pageEl) {
    const f = STATE.form;
    if (!f) return;
    pageEl.querySelectorAll('[data-evr-asg]').forEach(sel => {
      sel.addEventListener('change', () => {
        const [empId, stageKey] = sel.dataset.evrAsg.split('|');
        if (!f.evaluatorAssignments) f.evaluatorAssignments = {};
        if (!f.evaluatorAssignments[empId]) f.evaluatorAssignments[empId] = {};
        if (sel.value) {
          f.evaluatorAssignments[empId][stageKey] = sel.value;
          sel.style.borderColor = '';
        } else {
          delete f.evaluatorAssignments[empId][stageKey];
          sel.style.borderColor = 'var(--color-warning)';
        }
        /* 헤더의 미지정 카운트만 가볍게 업데이트 — 전체 재렌더는 select focus 손실 */
        updateAssignmentCounter(pageEl);
      });
    });
  }

  function updateAssignmentCounter(pageEl) {
    const host = pageEl.querySelector('[data-evr-sec="assign"]');
    if (!host) return;
    const f = STATE.form;
    const type = findEvalType(f.typeKey);
    if (!type) return;
    const stages = listAllStages(type);
    const matched = listEmployeesMatchingFilter(f.targetFilter);
    const idSet = f.targetEmpIds
      ? (f.targetEmpIds instanceof Set ? f.targetEmpIds : new Set(f.targetEmpIds))
      : null;
    const targets = idSet ? matched.filter(e => idSet.has(e.id)) : matched;
    const totalCells = targets.length * stages.length;
    let unsetCount = 0;
    targets.forEach(t => {
      const a = (f.evaluatorAssignments || {})[t.id] || {};
      stages.forEach(s => { if (!a[s.key]) unsetCount += 1; });
    });
    const counter = host.querySelector('[data-evr-asg-counter]');
    if (counter) {
      counter.textContent = unsetCount
        ? `수동 지정 필요 ${unsetCount.toLocaleString()}건`
        : `평가자 배정 완료 (총 ${totalCells.toLocaleString()}건)`;
      counter.style.color = unsetCount ? 'var(--color-warning)' : 'var(--color-success)';
    }
  }

  /* ============ 마법사 네비게이션 ============ */
  function bindWizardNav(pageEl) {
    const f = STATE.form;

    const cancelBtn = pageEl.querySelector('[data-evr-wz-cancel]');
    if (cancelBtn) cancelBtn.addEventListener('click', exitForm);

    const prevBtn = pageEl.querySelector('[data-evr-wz-prev]');
    if (prevBtn) prevBtn.addEventListener('click', () => {
      if (f.step > 1) { f.step -= 1; renderFormView(pageEl); }
    });

    const nextBtn = pageEl.querySelector('[data-evr-wz-next]');
    if (nextBtn) nextBtn.addEventListener('click', () => {
      if (!validateStep(f.step)) return;
      if (f.step < 3) { f.step += 1; renderFormView(pageEl); }
    });

    /* 완료된 step 뱃지 클릭 시 해당 step 으로 이동 */
    pageEl.querySelectorAll('[data-evr-wz-goto]').forEach(it => {
      it.addEventListener('click', () => {
        const target = Number(it.dataset.evrWzGoto);
        if (!Number.isFinite(target)) return;
        if (target < f.step) { f.step = target; renderFormView(pageEl); }
      });
    });
  }

  function validateStep(step) {
    const f = STATE.form;
    if (step === 1) {
      const pageEl = document.getElementById('page-hr-eval-round');
      if (pageEl && App.Forms && App.Forms.clearAll) App.Forms.clearAll(pageEl);
      /* 필드 검증 실패는 인라인(.field-error)으로 안내 — 토스트 금지 (도메인 표준) */
      const fieldErr = (sel, msg) => {
        const el = pageEl && pageEl.querySelector(sel);
        if (el && App.Forms && App.Forms.setFieldError) App.Forms.setFieldError(el, msg);
        else window.toast && window.toast(msg, 'warning');
        if (el && el.focus) el.focus();
        return false;
      };

      if (!f.name.trim()) return fieldErr('#evr-f-name', '평가명을 입력하세요.');
      if (!f.typeKey)     return fieldErr('#evr-f-type', '양식을 선택하세요.');

      /* 평가 대상기간 — 종료일이 시작일보다 빠를 수 없음 */
      if (!f.periodFrom) return fieldErr('#evr-f-pfrom', '평가 대상기간 시작일을 입력하세요.');
      if (!f.periodTo)   return fieldErr('#evr-f-pto',   '평가 대상기간 종료일을 입력하세요.');
      if (f.periodTo < f.periodFrom) return fieldErr('#evr-f-pto', '종료일은 시작일보다 빠를 수 없습니다.');

      /* 평가 입력기간 — 종료일이 시작일보다 빠를 수 없고, 대상기간보다 빠를 수 없음 */
      if (!f.inputFrom) return fieldErr('#evr-f-ifrom', '평가 입력기간 시작일을 입력하세요.');
      if (!f.inputTo)   return fieldErr('#evr-f-ito',   '평가 입력기간 종료일을 입력하세요.');
      if (f.inputTo < f.inputFrom) return fieldErr('#evr-f-ito', '종료일은 시작일보다 빠를 수 없습니다.');
      if (f.inputFrom < f.periodFrom) return fieldErr('#evr-f-ifrom', '평가 입력기간은 평가 대상기간보다 빠를 수 없습니다.');

      return true;
    }
    if (step === 2) {
      const matched = listEmployeesMatchingFilter(f.targetFilter);
      if (!matched.length) { window.toast && window.toast('조건에 맞는 대상자가 없습니다.', 'warning'); return false; }
      const selCount = f.targetEmpIds ? matched.filter(e => f.targetEmpIds.has(e.id)).length : matched.length;
      if (selCount === 0) { window.toast && window.toast('대상자를 1명 이상 선택하세요.', 'warning'); return false; }
      return true;
    }
    if (step === 3) {
      /* 평가자 지정 — 자동 배정 선행 후, 남은 미지정(부재·직접지정) 셀이 있으면 차단 */
      const type = findEvalType(f.typeKey);
      ensureAutoAssignments(f);
      const stages = listAllStages(type);
      if (stages.length) {
        const matched = listEmployeesMatchingFilter(f.targetFilter);
        const idSet = f.targetEmpIds
          ? (f.targetEmpIds instanceof Set ? f.targetEmpIds : new Set(f.targetEmpIds))
          : null;
        const targets = idSet ? matched.filter(e => idSet.has(e.id)) : matched;
        const unset = [];
        targets.forEach(t => {
          const a = (f.evaluatorAssignments || {})[t.id] || {};
          stages.forEach(s => { if (!a[s.key]) unset.push(`${t.name}(${t.id}) — ${s.el} ${s.stageIdx + 1}단계`); });
        });
        if (unset.length) {
          window.toast && window.toast(`평가자가 배정되지 않은 항목이 ${unset.length}건 있습니다. 모두 수동 지정해야 회차를 개설할 수 있습니다.`, 'warning');
          return false;
        }
      }
      return true;
    }
    return true;
  }

  /* Step 2 — 필터가 바뀌면 직원 목록 섹션만 부분 재렌더 */
  function refreshTargetList(pageEl) {
    if (!isWizardView() || (STATE.form && STATE.form.step !== 2)) return;
    const host = pageEl.querySelector('[data-evr-sec="target-list"]');
    if (!host) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = renderTargetEmployees(STATE.form);
    host.replaceWith(wrap.firstElementChild);
    bindTargetEmployees(pageEl);
  }

  function bindTargetEmployees(pageEl) {
    const f = STATE.form;
    const matched = listEmployeesMatchingFilter(f.targetFilter);
    const matchedIds = matched.map(e => e.id);

    /* targetEmpIds 가 null 이면 "전체 선택" 의미 — 첫 토글 시 Set 으로 전환 */
    const ensureSet = () => {
      if (!f.targetEmpIds) f.targetEmpIds = new Set(matchedIds);
      return f.targetEmpIds;
    };
    const updateHeader = () => {
      /* 헤더 카운트만 갱신 — 전체 재렌더는 무겁고 포커스 잃음 */
      const sel = f.targetEmpIds;
      const cnt = sel ? matched.filter(e => sel.has(e.id)).length : matched.length;
      const head = pageEl.querySelector('[data-evr-sec="target-list"] h3');
      if (head) head.innerHTML = `대상자 목록 <span style="color:var(--color-text-muted);font-weight:var(--fw-regular);font-size:var(--fs-sm);">— ${cnt.toLocaleString()} / ${matched.length.toLocaleString()} 명 선택</span>`;
      const all = pageEl.querySelector('[data-evr-emp-check-all]');
      if (all) {
        all.checked = matched.length > 0 && cnt === matched.length;
        all.indeterminate = cnt > 0 && cnt < matched.length;
      }
    };

    pageEl.querySelectorAll('[data-evr-emp-cb]').forEach(cb => {
      cb.addEventListener('change', () => {
        const set = ensureSet();
        if (cb.checked) set.add(cb.value);
        else            set.delete(cb.value);
        const tr = cb.closest('[data-evr-emp-row]');
        if (tr) tr.classList.toggle('is-selected', cb.checked);
        updateHeader();
      });
    });

    const allCb = pageEl.querySelector('[data-evr-emp-check-all]');
    if (allCb) allCb.addEventListener('change', () => {
      if (allCb.checked) f.targetEmpIds = new Set(matchedIds);
      else               f.targetEmpIds = new Set();
      pageEl.querySelectorAll('[data-evr-emp-cb]').forEach(cb => {
        cb.checked = allCb.checked;
        const tr = cb.closest('[data-evr-emp-row]');
        if (tr) tr.classList.toggle('is-selected', allCb.checked);
      });
      updateHeader();
    });

    const allBtn = pageEl.querySelector('[data-evr-emp-all]');
    if (allBtn) allBtn.addEventListener('click', () => {
      f.targetEmpIds = new Set(matchedIds);
      refreshTargetList(pageEl);
    });
    const noneBtn = pageEl.querySelector('[data-evr-emp-none]');
    if (noneBtn) noneBtn.addEventListener('click', () => {
      f.targetEmpIds = new Set();
      refreshTargetList(pageEl);
    });
  }

  function saveForm() {
    const f = STATE.form;
    if (!validateStep(1)) return;
    /* 등록/수정 위저드 모두 대상자(2)·평가자 배정(3)을 검증 — 평가자 부재 상태로는 저장 불가 */
    if (isWizardView()) {
      if (!validateStep(2)) return;
      if (!validateStep(3)) return;
    }
    /* 신규 등록은 사유 자동('회차 등록') — 모달 없이 저장. 수정은 사유 입력 모달 → 확인 시 commitSave */
    if (STATE.view === 'create') { commitSave(null); return; }
    openEditReasonModal();
  }

  /* ===== 수정 사유 입력 모달 (평가 회차 수정) ===== */
  function openEditReasonModal() {
    let modal = document.getElementById('evr-reason-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'evr-reason-modal';
      modal.className = 'modal-backdrop';
      modal.addEventListener('click', (e) => { if (e.target === modal) closeEditReasonModal(); });
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div class="modal" style="width:460px;max-width:92vw;">
        <header class="modal__header">
          <div class="modal__title">수정 사유 입력</div>
          <button class="modal__close" type="button" data-evr-rs-close aria-label="닫기">✕</button>
        </header>
        <div class="modal__body" style="background:var(--color-surface);">
          <div class="form-help" style="margin-bottom:10px;">이번 수정에서 무엇을 바꾸는지 기록합니다. 회차 상세의 「수정 이력」 에 남습니다.</div>
          <textarea class="input" id="evr-rs-text" rows="3" placeholder="예: 대상자 조건에 연구직 추가 / 입력기간 연장" style="width:100%;resize:vertical;min-height:72px;"></textarea>
        </div>
        <footer class="modal__footer">
          <button class="btn" type="button" data-evr-rs-close>취소</button>
          <button class="btn btn--primary" type="button" data-evr-rs-apply>수정 저장</button>
        </footer>
      </div>`;
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    const input = modal.querySelector('#evr-rs-text');
    modal.querySelectorAll('[data-evr-rs-close]').forEach(b => b.addEventListener('click', closeEditReasonModal));
    modal.querySelector('[data-evr-rs-apply]').addEventListener('click', () => {
      const v = (input.value || '').trim();
      App.Forms && App.Forms.clearFieldError(input);
      if (!v) { App.Forms && App.Forms.setFieldError(input, '수정 사유를 입력해 주세요.'); return; }
      closeEditReasonModal();
      commitSave(v);
    });
    App.Forms && App.Forms.applyOnInput(modal);
    if (input) input.focus();
  }
  function closeEditReasonModal() {
    const m = document.getElementById('evr-reason-modal'); if (!m) return;
    m.classList.remove('is-open');
    if (!document.querySelector('.modal-backdrop.is-open')) document.body.style.overflow = '';
  }

  /* 실제 저장 — reason 을 수정 이력에 기록 */
  function commitSave(reason) {
    const f = STATE.form;

    if (STATE.view === 'create') {
      const matched = listEmployeesMatchingFilter(f.targetFilter);
      const selectedIds = f.targetEmpIds
        ? matched.filter(e => f.targetEmpIds.has(e.id)).map(e => e.id)
        : matched.map(e => e.id);
      const newId = newSeqId(STATE.rounds);
      STATE.rounds.unshift({
        id: newId, name: f.name, typeKey: f.typeKey,
        periodFrom: f.periodFrom, periodTo: f.periodTo,
        inputFrom: f.inputFrom,   inputTo: f.inputTo,
        description: f.description,
        status: 'registered',
        targetCount: selectedIds.length,
        completedCount: 0,
        targetFilter: f.targetFilter,
        targetEmpIds: selectedIds,
        evaluatorAssignments: f.evaluatorAssignments || {},
        createdBy: HR_NAME, createdAt: TODAY,
        editHistory: [{ at: TODAY, by: HR_NAME, reason: '회차 등록', kind: 'create' }],
      });
      window.toast && window.toast(`${f.name} 회차가 생성되었습니다. (${newId} · 대상 ${selectedIds.length}명)`, 'success');
    } else if (STATE.editingId) {
      const r = STATE.rounds.find(x => x.id === STATE.editingId);
      if (r) {
        /* 대상자 조건 변경분을 확정 — 선택 ID·대상 수도 함께 갱신(평가자 배정과 연동) */
        const matched = listEmployeesMatchingFilter(f.targetFilter);
        const selectedIds = f.targetEmpIds
          ? matched.filter(e => f.targetEmpIds.has(e.id)).map(e => e.id)
          : matched.map(e => e.id);
        Object.assign(r, {
          name: f.name, typeKey: f.typeKey,
          periodFrom: f.periodFrom, periodTo: f.periodTo,
          inputFrom: f.inputFrom,   inputTo: f.inputTo,
          description: f.description,
          targetFilter: f.targetFilter,
          targetEmpIds: selectedIds,
          targetCount: selectedIds.length,
          evaluatorAssignments: f.evaluatorAssignments || {},
        });
        /* 수정 이력 누적 */
        r.editHistory = (r.editHistory || []).concat([{ at: TODAY, by: HR_NAME, reason: reason || '(사유 없음)', kind: 'edit' }]);
        window.toast && window.toast(`수정되었습니다. (대상 ${selectedIds.length}명)`, 'success');
      }
    }
    exitForm();
  }

  /* ============ 모달 공통 ============ */
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
  function bindModals() {
    const copyM = document.getElementById('modal-evr-copy');
    if (copyM) {
      copyM.addEventListener('click', (e) => { if (e.target === copyM) closeModal('modal-evr-copy'); });
      const okBtn = copyM.querySelector('[data-evr-copy-confirm]');
      if (okBtn) okBtn.addEventListener('click', confirmCopy);
    }
    /* 공통 닫기 (헤더 X / 푸터 취소) — 전역 data-modal-close 가 이미 닫지만, 별도 hook 도 지원 */
    document.querySelectorAll('[data-evr-modal-close]').forEach(b => {
      b.addEventListener('click', () => closeModal('modal-evr-copy'));
    });
  }

  /* =========================================================
   *  평가유형 미리보기 모달
   *   회차 등록 / 상세 화면에서 평가유형을 결정하기 전에 어떤 구성인지 확인.
   *   Section 3 「평가 정보」 와 동일 구성 (요소·마스터·프로세스·배점) + 등급 산정 기준 표.
   * ========================================================= */
  const GRADING_MODE_LABELS = {
    absolute: '절대평가',
    relative: '상대평가',
    mixed:    '혼합평가',
  };
  function gradingModeLabel(k) { return GRADING_MODE_LABELS[k] || '-'; }

  function openTypePreviewModal(typeKey) {
    const type = findEvalType(typeKey);
    if (!type) return;
    let modal = document.getElementById('evr-type-preview-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'evr-type-preview-modal';
      modal.className = 'modal-backdrop';
      modal.addEventListener('click', (e) => { if (e.target === modal) closeTypePreviewModal(); });
      document.body.appendChild(modal);
    }
    modal.innerHTML = buildTypePreviewModalHTML(type);
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    modal.querySelectorAll('[data-evr-tpm-close]').forEach(b => b.addEventListener('click', closeTypePreviewModal));
    /* 평가 양식 셀 클릭 → 역량 양식 미리보기 모달 (이 모달 위에 over-modal 로 표시). */
    modal.querySelectorAll('[data-evr-tpm-formpreview]').forEach(btn => btn.addEventListener('click', e => {
      openFormPreviewModal(e.currentTarget.dataset.evrTpmFormpreview, true);
    }));
  }
  function closeTypePreviewModal() {
    const modal = document.getElementById('evr-type-preview-modal');
    if (!modal) return;
    modal.classList.remove('is-open');
    if (!document.querySelector('.modal-backdrop.is-open')) document.body.style.overflow = '';
  }

  /* =========================================================
   *  역량 양식 미리보기 모달 — type.competency 를 read-only 로 표시.
   *   overModal=true 면 평가유형 미리보기 모달 위에 떠야 하므로 over-modal z-index 사용.
   * ========================================================= */
  function openFormPreviewModal(typeKey, overModal) {
    const type = findEvalType(typeKey);
    if (!type) return;
    let modal = document.getElementById('evr-form-preview-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'evr-form-preview-modal';
      modal.addEventListener('click', (e) => { if (e.target === modal) closeFormPreviewModal(); });
      document.body.appendChild(modal);
    }
    modal.className = 'modal-backdrop' + (overModal ? ' modal-backdrop--over-modal' : '');
    modal.innerHTML = `
      <div class="modal modal--xl">
        <header class="modal__header">
          <div class="modal__title">${esc(type.name)} — 역량 양식 <span style="color:var(--color-text-muted);font-weight:var(--fw-regular);font-size:var(--fs-md);margin-left:8px;">${esc(type.key)}</span></div>
          <button class="modal__close" type="button" data-evr-fpm-close aria-label="닫기">✕</button>
        </header>
        <div class="modal__body">${renderCompetencyPreviewBody(type)}</div>
        <footer class="modal__footer"><button class="btn" type="button" data-evr-fpm-close>닫기</button></footer>
      </div>
    `;
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    modal.querySelectorAll('[data-evr-fpm-close]').forEach(b => b.addEventListener('click', closeFormPreviewModal));
  }
  function closeFormPreviewModal() {
    const modal = document.getElementById('evr-form-preview-modal');
    if (!modal) return;
    modal.classList.remove('is-open');
    if (!document.querySelector('.modal-backdrop.is-open')) document.body.style.overflow = '';
  }

  function renderCompetencyPreviewBody(type) {
    const comp = type.competency || { scale: 5, sections: [] };
    const scale = comp.scale || 5;
    const labels = (comp.scaleLabels && comp.scaleLabels[scale]) || defaultScaleLabels(scale);
    const labelChips = labels.map((lab, i) => `
      <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:var(--radius-pill);background:var(--color-surface-alt);border:1px solid var(--color-border);font-size:var(--fs-xs);color:var(--color-text-sub);">
        <strong style="color:var(--color-text);">${i + 1}점</strong><span>${esc(lab)}</span>
      </span>
    `).join('');

    const sectionsBody = (comp.sections || []).map(sec => {
      const items = sec.items || [];
      const head = `
        <tr style="background:rgba(0,52,125,.04);">
          <td colspan="2" style="padding:8px 14px;font-weight:var(--fw-semibold);color:var(--color-brand-primary);font-size:var(--fs-sm);">
            ${esc(sec.name || '(이름 없음)')}
            <span style="margin-left:8px;color:var(--color-text-muted);font-weight:var(--fw-regular);font-size:var(--fs-xs);">${items.length} 항목</span>
          </td>
        </tr>`;
      const itemRows = items.length
        ? items.map((it, ii) => `<tr><td style="text-align:center;color:var(--color-text-muted);font-size:var(--fs-xs);width:40px;">${ii + 1}</td><td>${esc(it.text || '-')}</td></tr>`).join('')
        : `<tr><td colspan="2" class="t-muted" style="text-align:center;padding:10px;">항목이 없습니다.</td></tr>`;
      return head + itemRows;
    }).join('');

    return `
      <h4 style="font-size:var(--fs-sm);font-weight:var(--fw-semibold);margin:0 0 8px;color:var(--color-text-sub);">척도 <small style="margin-left:8px;color:var(--color-text-muted);font-weight:var(--fw-regular);font-size:var(--fs-xs);">${scale}점 척도</small></h4>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;">${labelChips}</div>
      <h4 style="font-size:var(--fs-sm);font-weight:var(--fw-semibold);margin:0 0 8px;color:var(--color-text-sub);">분야 · 평가 항목</h4>
      <table class="tbl tbl--bordered" style="width:100%;">
        <thead><tr><th style="width:40px;text-align:center;">#</th><th>평가 항목</th></tr></thead>
        <tbody>${sectionsBody || '<tr><td colspan="2" class="t-muted" style="text-align:center;padding:14px;">등록된 분야가 없습니다.</td></tr>'}</tbody>
      </table>
    `;
  }

  function buildTypePreviewModalHTML(type) {
    return `
      <div class="modal modal--xl">
        <header class="modal__header">
          <div class="modal__title">${esc(type.name)} <span style="color:var(--color-text-muted);font-weight:var(--fw-regular);font-size:var(--fs-md);margin-left:8px;">${esc(type.key)}</span></div>
          <button class="modal__close" type="button" data-evr-tpm-close aria-label="닫기">✕</button>
        </header>
        <div class="modal__body">${renderTypePreviewBody(type)}</div>
        <footer class="modal__footer">
          <button class="btn" type="button" data-evr-tpm-close>닫기</button>
        </footer>
      </div>
    `;
  }

  function renderTypePreviewBody(type) {
    const rows = evalElementRowsHTML(type, `data-evr-tpm-formpreview="${esc(type.key)}"`);

    const hasDirectAssign = listDirectAssignStages(type).length > 0;
    const directAssignNote = hasDirectAssign
      ? `<div style="margin-top:8px;color:var(--color-text-muted);font-size:var(--fs-xs);">* 「직접 지정」 단계는 회차 등록 시 「평가자 지정」 섹션에서 대상자별로 지정합니다.</div>`
      : '';

    const descBlock = type.description
      ? `<div style="margin-bottom:14px;padding:10px 14px;background:var(--color-surface-alt);border-left:3px solid var(--color-brand-primary);border-radius:0 var(--radius-md) var(--radius-md) 0;font-size:var(--fs-sm);color:var(--color-text-sub);">${esc(type.description)}</div>`
      : '';

    const blockLabel = (text) => `
      <h4 style="font-size:var(--fs-sm);font-weight:var(--fw-semibold);margin:18px 0 8px;color:var(--color-text-sub);">${esc(text)}</h4>
    `;

    return `
      ${descBlock}

      <div class="fm-tbl fm-tbl--compact fm-tbl--bordered fm-tbl--form" style="margin-bottom:6px;">
        <div class="fm-tbl__row fm-tbl__row--1" style="grid-template-columns:110px 1fr;">
          <div class="fm-tbl__label">결과 유형</div>
          <div class="fm-tbl__value">${esc(type.resultType)}</div>
        </div>
      </div>

      ${blockLabel('평가요소 구성')}
      <table class="tbl tbl--bordered" style="width:100%;">
        <thead>
          <tr>
            <th style="width:80px;text-align:center;">평가요소</th>
            <th>평가 양식</th>
            <th style="width:340px;">평가 프로세스</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${directAssignNote}

      ${blockLabel('등급 산정 기준')}
      ${renderTypePreviewGrading(type)}
    `;
  }

  function renderTypePreviewGrading(type) {
    const grades = (window.App && App.HREvalConfig && App.HREvalConfig.grades) ? App.HREvalConfig.grades() : [];
    if (!grades.length) {
      return `<div style="padding:14px;color:var(--color-text-muted);font-size:var(--fs-sm);background:var(--color-surface-alt);border-radius:var(--radius-md);">등급 산정 기준이 설정되지 않았습니다.</div>`;
    }
    const jobCatLabel = (v) => (window.App && App.HREvalConfig && App.HREvalConfig.jobCatLabel) ? App.HREvalConfig.jobCatLabel(v) : v;
    const groupTables = grades.map(g => {
      const rows = (g.tiers || []).map(t =>
        `<tr><td style="font-weight:var(--fw-medium);width:140px;">${esc(t.name)}</td><td>상위 ${Number(t.ratio) || 0}%</td></tr>`
      ).join('');
      const cats = (g.condValues || []).map(v => `<span class="pill">${esc(jobCatLabel(v))}</span>`).join(' ');
      return `
        <div style="margin-bottom:12px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
            <strong style="font-size:var(--fs-sm);">${esc(g.groupName)}</strong> ${cats}
          </div>
          <table class="tbl tbl--bordered" style="width:100%;">
            <thead><tr><th style="width:140px;">등급명</th><th>비율</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }).join('');
    return `
      <div style="display:flex;align-items:center;margin-bottom:8px;">
        <span class="pill pill--soft-blue" style="margin-right:8px;">상대평가</span>
        <span style="color:var(--color-text-muted);font-size:var(--fs-xs);">직군 그룹별 상위 비율에 따라 등급이 결정됩니다. (단계·등급 설정 상속)</span>
      </div>
      ${groupTables}
    `;
  }

  /* =========================================================
   *  VIEW: PROGRESS (회차별 대상자 진행 현황) — 인사팀 / 대표이사 / 부서장(소속) 모니터링
   *
   *   배경
   *     「평가 진행」 화면은 로그인 사용자 「내 시점」 전용이라 회차 전체의
   *     대상자별 진행 상태를 볼 수 없다. 이 뷰는 시작된 회차(대기/진행중/
   *     종료/확정)에 한해 대상자 한 명 한 명의 단계별 제출 진행률을
   *     인사담당자·대표이사·부서장(소속)이 한눈에 모니터링하도록 제공한다.
   *
   *   진행 데이터(mock)
   *     - 실서비스에서는 평가자별 제출 상태가 실데이터로 집계된다.
   *     - 데모에서는 회차의 완료자수/대상자수 비율(progress %)을 실제 대상자
   *       목록에 결정적으로 분배하여 회차 목록의 진행률과 일관되게 표시한다.
   *
   *   UI Kit 재사용 (신규 컴포넌트 없음)
   *     .page-bar / .search / .toolbar / .tbl / .progress / .pill / .pagination
   *     .step-dots(단계 진행) / .av(아바타)  — 모두 hr-ui-kit.css 기존 등록분
   * ========================================================= */

  /* 대상자 산출 — 회차에 확정된 targetEmpIds 우선, 없으면 targetFilter 로 매칭 */
  function roundTargets(round) {
    const all = (window.App && App.HRMembers && App.HRMembers.list) ? App.HRMembers.list() : [];
    if (round.targetEmpIds && round.targetEmpIds.length) {
      const set = round.targetEmpIds instanceof Set ? round.targetEmpIds : new Set(round.targetEmpIds);
      return all.filter(e => set.has(e.id));
    }
    return listEmployeesMatchingFilter(round.targetFilter || defaultTargetFilter());
  }

  /* 회차의 평가 단계 chain — 평가유형 process 의 첫 평가요소 기준
   *   (본인 평가 → 1단계 → 2단계 …). 확정(terminal)은 dots 에서 별도 처리. */
  function progressChain(round) {
    const type = findEvalType(round.typeKey);
    const el = (type && type.process) ? Object.keys(type.process)[0] : null;
    const proc = el ? type.process[el] : null;
    const E = el || '역량';
    const steps = [];
    if (proc && proc.selfEval) steps.push({ key: 'self', label: '본인 평가', role: 'self', el: E, stageIdx: -1 });
    ((proc && proc.stages) || []).forEach((s, i) => steps.push({ key: String(i), label: `${i + 1}단계 (${roleLabel(s.role)})`, role: s.role, el: E, stageIdx: i }));
    if (!steps.length) steps.push({ key: 'eval', label: '평가', role: 'eval', el: E, stageIdx: 0 });
    return { el: E, steps };
  }

  /* 대상자별 진행 상태 산출 (결정적) — 회차 진행률과 일관 */
  function computeRoundProgress(round) {
    const targets = roundTargets(round);
    const { el, steps } = progressChain(round);
    const total = steps.length;
    const finalized = round.status === 'finalized';
    const ratio = round.targetCount ? (round.completedCount / round.targetCount) : 0;
    const doneN = finalized ? targets.length : Math.round(targets.length * ratio);
    return targets.map((emp, i) => {
      let submitted;
      if (finalized || i < doneN) submitted = total;
      else submitted = (i * 7 + 3) % total;   // 0..total-1 → 미시작/진행중 혼재 (결정적)
      let code, label, pill;
      if (submitted <= 0)        { code = 'todo';  label = '미시작'; pill = ''; }
      else if (submitted < total){ code = 'doing'; label = '진행중'; pill = 'warning'; }
      else                       { code = 'done';  label = '완료';   pill = 'success'; }
      const pendingLabel = submitted < total ? steps[submitted].label : (finalized ? '확정 완료' : '확정 대기');
      const pct = Math.round((submitted / total) * 100);
      return { emp, el, steps, total, submitted, code, label, pill, pendingLabel, pct, finalized };
    });
  }

  /* 진행 단계 dots — 평가 진행 화면의 renderStageDots 와 동일 패턴 */
  function progressDots(item) {
    const out = item.steps.map((s, i) => {
      let cls = '';
      if (i < item.submitted) cls = 'is-done';
      else if (i === item.submitted && !item.finalized) cls = 'is-current';
      return `<li class="step-dots__item ${cls}"><span class="step-dots__dot" title="${esc(s.label)}">${i + 1}</span></li>`;
    });
    let tcls = '';
    if (item.finalized) tcls = 'is-done';
    else if (item.submitted >= item.steps.length) tcls = 'is-current';
    out.push(`<li class="step-dots__item ${tcls}"><span class="step-dots__dot" title="확정">${item.steps.length + 1}</span></li>`);
    return `<ol class="step-dots step-dots--sm step-dots--brand-done" style="padding:0;margin:0;list-style:none;display:inline-flex;">${out.join('')}</ol>`;
  }

  /* 대상자 셀 — 임직원 관리 성명 컬럼과 동일: 사진 + 이름 + 부서·직책(inline muted) */
  function progAvColor(emp) {
    if (emp && emp.colorIdx) return `av--c${emp.colorIdx}`;
    const seed = Number(String((emp && emp.id) || '').slice(-2)) || 1;
    return `av--c${(seed % 6) + 1}`;
  }
  function progAvatar(emp) {
    if (emp && emp.photoUrl) {
      return `<span class="av av--sm" style="background:transparent;"><img src="${esc(emp.photoUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"></span>`;
    }
    return `<span class="av av--sm ${progAvColor(emp)}">${esc(((emp && emp.name) || '?').charAt(0))}</span>`;
  }
  function progNameCell(emp) {
    const dept = emp.dept ? esc(emp.dept) : '';
    const pos  = emp.position ? esc(emp.position) : '';
    const dot  = (dept && pos) ? `<span style="color:var(--color-text-muted);font-size:var(--fs-xs);padding:0 2px;" aria-hidden="true">·</span>` : '';
    const meta = (v) => v ? `<span style="color:var(--color-text-muted);font-size:var(--fs-xs);white-space:nowrap;">${v}</span>` : '';
    return `
      <div style="display:flex;align-items:center;gap:8px;min-width:0;">
        ${progAvatar(emp)}
        <strong style="color:var(--color-text);font-weight:var(--fw-medium);white-space:nowrap;">${esc(emp.name || '-')}</strong>
        <span style="display:inline-flex;align-items:center;">${meta(dept)}${dot}${meta(pos)}</span>
      </div>`;
  }
  function progElBadge(el) {
    const map = { '역량': 'pill--info', '인사': 'pill--soft-blue', '성과': 'pill--soft-green' };
    return `<span class="pill ${map[el] || ''}" style="font-size:var(--fs-xs);">${esc(el)}</span>`;
  }

  function openProgress(id) {
    const r = STATE.rounds.find(x => x.id === id); if (!r) return;
    STATE.view = 'progress';
    STATE.progress = {
      roundId: id, keyword: '', condition: 'name', statusFilter: '',
      page: 1, pageSize: (STATE.progress && STATE.progress.pageSize) || 20,
      selectedIds: new Set(),
    };
    renderProgressView(document.getElementById('page-hr-eval-round'));
  }
  function exitProgress() {
    STATE.view = 'list';
    renderListView(document.getElementById('page-hr-eval-round'));
    applyFilter(); renderTable();
  }

  function progressFilteredRows(round) {
    let rows = computeRoundProgress(round);
    const p = STATE.progress;
    if (p.statusFilter) rows = rows.filter(x => x.code === p.statusFilter);
    const kw = (p.keyword || '').trim().toLowerCase();
    if (kw) {
      rows = rows.filter(x => {
        const e = x.emp;
        const t = p.condition === 'dept' ? (e.dept || '') : p.condition === 'id' ? (e.id || '') : (e.name || '');
        return String(t).toLowerCase().includes(kw);
      });
    }
    return rows;
  }

  /* =========================================================
   *  회차 정보 모달 — 기본 정보 / 대상자 조건 / 평가 정보 / 평가자 지정 / 수정 이력 (읽기 전용)
   *   진행 현황 화면의 [정보] 버튼에서 호출. 상세 화면의 섹션 렌더러를 그대로 재사용. */
  function openRoundInfoModal(round) {
    if (!round) return;
    let modal = document.getElementById('evr-info-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'evr-info-modal';
      modal.className = 'modal-backdrop';
      modal.addEventListener('click', (e) => { if (e.target === modal) closeRoundInfoModal(); });
      document.body.appendChild(modal);
    }
    const f = round;
    modal.innerHTML = `
      <div class="modal modal--xl" style="max-height:92vh;display:flex;flex-direction:column;">
        <div class="modal__header">
          <div class="modal__title">평가 회차 정보 <span style="color:var(--color-text-muted);font-weight:var(--fw-regular);font-size:var(--fs-md);margin-left:8px;">${esc(round.name)}</span></div>
          <button class="modal__close" type="button" data-evr-info-close aria-label="닫기">✕</button>
        </div>
        <div class="modal__body" style="background:var(--color-surface-alt);padding:20px 24px;display:flex;flex-direction:column;gap:16px;overflow:auto;">
          ${renderSectionBasic(f, false, false)}
          ${renderSectionTargets(f, false)}
          ${renderSectionEval(f)}
          ${renderSectionAssignments(f)}
          ${renderSectionHistory(f)}
        </div>
        <div class="modal__footer"><button class="btn" type="button" data-evr-info-close>닫기</button></div>
      </div>`;
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    modal.querySelectorAll('[data-evr-info-close]').forEach(b => b.addEventListener('click', closeRoundInfoModal));
    modal.querySelectorAll('[data-evr-type-preview]').forEach(b => b.addEventListener('click', () => { if (f.typeKey) openTypePreviewModal(f.typeKey); }));
    modal.querySelectorAll('[data-evr-form-preview]').forEach(b => b.addEventListener('click', () => openFormPreviewModal(b.dataset.evrFormPreview, true)));
  }
  function closeRoundInfoModal() {
    const m = document.getElementById('evr-info-modal');
    if (!m) return;
    m.classList.remove('is-open');
    if (!document.querySelector('.modal-backdrop.is-open')) document.body.style.overflow = '';
  }

  function renderProgressView(pageEl) {
    const round = STATE.rounds.find(r => r.id === STATE.progress.roundId);
    if (!round) { exitProgress(); return; }
    const type = findEvalType(round.typeKey);

    const searchHTML = App.Components.searchPanel({
      showDateRange: false,
      conditions: [
        { value: 'name', label: '성명' },
        { value: 'dept', label: '부서' },
        { value: 'id',   label: '사번' },
      ],
      placeholder: '성명·부서·사번 검색',
      cols: 2,
      advanced: [
        { name: 'pstatus', label: '진행 상태', options: [
          { value: 'todo',  label: '미시작' },
          { value: 'doing', label: '진행중' },
          { value: 'done',  label: '완료' },
        ]},
      ],
    });

    const allRows = computeRoundProgress(round);
    const doneCnt = allRows.filter(x => x.code === 'done').length;
    const totalCnt = allRows.length;
    const pct = totalCnt ? Math.round(doneCnt / totalCnt * 100) : 0;
    const dlIcon = (window.Icons && window.Icons.download) || '';

    /* 미제출 후속 조치 버튼 — 인사담당자만 노출 (대표이사·부서장은 조회만, Q-38/권한) */
    const canActNow = progActionable(round);
    const nudgeable = canActNow;                  // 미제출이 존재할 수 있는 상태(대기/진행중/종료)
    const reopenable = canAct() && round.status === 'closed';   // 마감 후 입력기간 재오픈 가능
    const actionBtns = !canActNow ? '' : [
      nudgeable  ? `<button class="btn btn--sm btn--soft-warning" type="button" data-evr-prog-nudge-bulk>미제출 독려</button>` : '',
      reopenable ? `<button class="btn btn--sm btn--soft-success" type="button" data-evr-prog-reopen>입력기간 재오픈</button>` : '',
    ].join('');

    pageEl.innerHTML = `
      <div class="page-bar">
        <button class="page-bar__back" type="button" data-evr-prog-back>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          목록
        </button>
        <div class="page-bar__divider"></div>
        <div>
          <div class="page-bar__title">
            진행 현황 — ${esc(round.name)} <span style="margin-left:8px;vertical-align:middle;">${statusPill(round.status)}</span>
            <button class="btn btn--sm" type="button" data-evr-prog-info style="margin-left:10px;vertical-align:middle;">정보</button>
          </div>
          <div class="page-bar__sub">${esc((type && type.name) || round.typeKey)} · 평가 입력기간 ${esc(periodText(round.inputFrom, round.inputTo))}</div>
        </div>
        <div class="page-bar__spacer" style="flex:1;"></div>
        <div class="page-bar__actions">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:var(--fs-xs);color:var(--color-text-muted);">전체 진행률</span>
            <div class="progress" style="width:160px;"><div class="progress__bar${pct >= 100 ? ' progress__bar--success' : ''}" style="width:${pct}%;"></div></div>
            <strong style="font-size:var(--fs-sm);color:var(--color-text);white-space:nowrap;">${doneCnt} / ${totalCnt}명 <small style="color:var(--color-text-muted);font-weight:var(--fw-regular);">(${pct}%)</small></strong>
          </div>
        </div>
      </div>

      ${searchHTML}

      <div class="toolbar">
        <div class="toolbar__left">
          <span class="toolbar__count">총 <span data-prog-count><strong>0</strong>명</span></span>
          <span style="color:var(--color-text-muted);font-size:var(--fs-sm);" data-prog-sel-count></span>
        </div>
        <div class="toolbar__right">
          ${actionBtns}
          <button class="btn btn--sm" type="button" data-evr-prog-excel>${dlIcon} 엑셀</button>
        </div>
      </div>

      <div class="grid-wrap" style="flex:1;min-height:0;">
        <div class="grid-scroll">
          <table class="tbl tbl--hover">
            <thead>
              <tr>
                ${canActNow ? `<th style="width:40px;text-align:center;"><input type="checkbox" data-prog-check-all aria-label="전체 선택" /></th>` : ''}
                <th style="width:48px;text-align:center;">No</th>
                <th style="min-width:240px;">대상자</th>
                <th style="width:200px;text-align:center;">진행 단계</th>
                <th style="width:150px;text-align:center;">현재 단계</th>
                <th style="width:160px;">진행률</th>
                <th style="width:90px;text-align:center;">상태</th>
                <th style="width:${canActNow ? 104 : 72}px;text-align:center;"></th>
              </tr>
            </thead>
            <tbody id="evr-prog-body"></tbody>
          </table>
        </div>
        <div class="pagination">
          <div class="pagination__info" id="evr-prog-info"></div>
          <div class="pagination__right">
            <div class="pagination__size">
              <label>페이지당</label>
              <select class="select" id="evr-prog-size">
                <option value="20">20</option><option value="50">50</option><option value="100">100</option>
              </select>
              <span>건</span>
            </div>
            <div class="pagination__list" id="evr-prog-pagination"></div>
          </div>
        </div>
      </div>
    `;
    bindProgress(pageEl);
    renderProgressTable();
  }

  function bindProgress(pageEl) {
    pageEl.querySelector('[data-evr-prog-back]').addEventListener('click', exitProgress);
    /* [정보] — 기본 정보·대상자 조건·평가 정보·평가자 지정·수정 이력 모달 */
    const infoBtn = pageEl.querySelector('[data-evr-prog-info]');
    if (infoBtn) infoBtn.addEventListener('click', () => {
      const round = STATE.rounds.find(r => r.id === STATE.progress.roundId);
      if (round) openRoundInfoModal(round);
    });
    App.Search.attach(pageEl.querySelector('[data-search]'), (params) => {
      STATE.progress.keyword = params.keyword || '';
      STATE.progress.condition = params.condition || 'name';
      STATE.progress.statusFilter = (params.advanced && params.advanced.pstatus) || '';
      STATE.progress.page = 1;
      renderProgressTable();
    });
    const excel = pageEl.querySelector('[data-evr-prog-excel]');
    if (excel) excel.addEventListener('click', exportProgressExcel);

    /* 미제출 후속 조치 — 툴바 (인사담당자만 렌더되므로 가드 불필요) */
    const nudgeBulk = pageEl.querySelector('[data-evr-prog-nudge-bulk]');
    if (nudgeBulk) nudgeBulk.addEventListener('click', doBulkNudge);
    const reopen = pageEl.querySelector('[data-evr-prog-reopen]');
    if (reopen) reopen.addEventListener('click', () => openReopenModal(STATE.progress.roundId));

    /* 전체 선택 (현재 페이지 행) */
    const checkAll = pageEl.querySelector('[data-prog-check-all]');
    if (checkAll) checkAll.addEventListener('change', (e) => {
      const round = STATE.rounds.find(r => r.id === STATE.progress.roundId); if (!round) return;
      const rows = progressFilteredRows(round);
      const start = (STATE.progress.page - 1) * STATE.progress.pageSize;
      rows.slice(start, start + STATE.progress.pageSize).forEach(x => {
        if (e.target.checked) STATE.progress.selectedIds.add(x.emp.id);
        else                  STATE.progress.selectedIds.delete(x.emp.id);
      });
      renderProgressTable();
    });

    /* 행 체크박스 토글 */
    $('#evr-prog-body', pageEl).addEventListener('change', (e) => {
      const cb = e.target.closest('input[type="checkbox"][data-prog-row-cb]');
      if (!cb) return;
      const tr = cb.closest('[data-prog-row]'); if (!tr) return;
      const id = tr.dataset.progRow;
      if (cb.checked) STATE.progress.selectedIds.add(id);
      else            STATE.progress.selectedIds.delete(id);
      tr.classList.toggle('is-selected', cb.checked);
      updateProgSelectionUI();
    });

    /* 행 클릭 / 「상세」 버튼 → 인원별 진행 상세 모달 (도메인 표준: 양쪽 입력 지원)
       + 행 후속 조치 케밥 항목(독려/대체 평가자) 위임 */
    $('#evr-prog-body', pageEl).addEventListener('click', (e) => {
      const nudge = e.target.closest('[data-prog-nudge]');
      if (nudge) { openNudgeConfirm([nudge.dataset.progNudge]); return; }
      const reassign = e.target.closest('[data-prog-reassign]');
      if (reassign) { openReassignPicker(reassign.dataset.progReassign, reassign.dataset.progStep); return; }
      const btn = e.target.closest('[data-prog-detail]');
      if (btn) { openProgressDetail(btn.dataset.progDetail); return; }
      if (e.target.closest('button, a, input, select, textarea, label')) return;
      const selct = window.getSelection && window.getSelection();
      if (selct && selct.type === 'Range' && String(selct).length > 0) return;
      const row = e.target.closest('[data-prog-row]');
      if (row) { openProgressDetail(row.dataset.progRow); return; }
    });
    $('#evr-prog-pagination', pageEl).addEventListener('click', (e) => {
      const btn = e.target.closest('.pagination__btn');
      if (!btn || btn.disabled) return;
      const p = Number(btn.dataset.page);
      if (Number.isFinite(p)) { STATE.progress.page = p; renderProgressTable(); }
    });
    $('#evr-prog-size', pageEl).addEventListener('change', (e) => {
      STATE.progress.pageSize = Number(e.target.value); STATE.progress.page = 1; renderProgressTable();
    });
  }

  function renderProgressTable() {
    const pageEl = document.getElementById('page-hr-eval-round'); if (!pageEl) return;
    const round = STATE.rounds.find(r => r.id === STATE.progress.roundId); if (!round) return;
    const rows = progressFilteredRows(round);
    const total = rows.length;
    const size = STATE.progress.pageSize;
    const totalPages = Math.max(1, Math.ceil(total / size));
    if (STATE.progress.page > totalPages) STATE.progress.page = totalPages;
    const start = (STATE.progress.page - 1) * size;
    const pageRows = rows.slice(start, start + size);

    const canActNow = progActionable(round);
    const colCount = canActNow ? 8 : 7;
    const moreIcon = (window.Icons && window.Icons.moreVertical) || '⋮';

    const body = $('#evr-prog-body', pageEl); if (!body) return;
    body.innerHTML = !pageRows.length
      ? `<tr><td colspan="${colCount}" style="text-align:center;color:var(--color-text-muted);padding:32px 0;">조건에 해당하는 대상자가 없습니다.</td></tr>`
      : pageRows.map((x, idx) => {
          const no = total - (start + idx);   // No 내림차순 (도메인 표준)
          const sel = STATE.progress.selectedIds.has(x.emp.id);
          /* 현재 미제출(대기) 단계 — 진행중/미시작 행에서 대체 평가자 지정 대상 (본인 평가 단계 제외) */
          const pendStep = x.submitted < x.total ? x.steps[x.submitted] : null;
          const canReassign = !!pendStep && pendStep.role !== 'self';
          /* 미제출(미시작·진행중) 행에만 후속 조치 케밥 — 완료 행은 비노출 */
          const actionMenu = (canActNow && x.code !== 'done')
            ? `<span class="dd dd--row" data-dd>
                 <button class="btn--kebab" type="button" aria-label="후속 조치">${moreIcon}</button>
                 <div class="dd__menu">
                   <button class="dd__item" type="button" data-prog-nudge="${esc(x.emp.id)}">독려 알림</button>
                   ${canReassign ? `<button class="dd__item" type="button" data-prog-reassign="${esc(x.emp.id)}" data-prog-step="${esc(pendStep.key)}">대체 평가자 지정</button>` : ''}
                 </div>
               </span>`
            : '';
          return `
            <tr class="is-clickable${sel ? ' is-selected' : ''}" data-prog-row="${esc(x.emp.id)}">
              ${canActNow ? `<td style="text-align:center;"><input type="checkbox" data-prog-row-cb ${sel ? 'checked' : ''} aria-label="선택" /></td>` : ''}
              <td style="text-align:center;color:var(--color-text-sub);">${no}</td>
              <td>${progNameCell(x.emp)}</td>
              <td style="text-align:center;">${progressDots(x)}</td>
              <td style="text-align:center;white-space:nowrap;font-size:var(--fs-xs);color:var(--color-text-sub);">${esc(x.pendingLabel)}</td>
              <td>
                <div style="display:flex;align-items:center;gap:6px;">
                  <div class="progress" style="flex:1;height:6px;"><div class="progress__bar${x.pct >= 100 ? ' progress__bar--success' : ''}" style="width:${x.pct}%;"></div></div>
                  <small style="min-width:34px;text-align:right;font-size:var(--fs-xs);color:${x.code === 'done' ? 'var(--color-success)' : 'var(--color-text-sub)'};font-weight:var(--fw-medium);">${x.pct}%</small>
                </div>
              </td>
              <td style="text-align:center;"><span class="pill${x.pill ? ' pill--' + x.pill : ''}" style="font-size:var(--fs-xs);">${esc(x.label)}</span></td>
              <td style="text-align:center;">
                <div style="display:inline-flex;align-items:center;gap:4px;">
                  <button class="btn btn--xs" type="button" data-prog-detail="${esc(x.emp.id)}">상세</button>
                  ${actionMenu}
                </div>
              </td>
            </tr>`;
        }).join('');

    const cnt = pageEl.querySelector('[data-prog-count]');
    if (cnt) cnt.innerHTML = `<strong>${total.toLocaleString()}</strong>명`;
    updateProgSelectionUI();

    $('#evr-prog-info', pageEl).textContent = total === 0
      ? '0명'
      : `${start + 1}-${Math.min(start + size, total)} / ${total}명`;

    const btns = [];
    btns.push(`<button class="pagination__btn" data-page="1" ${STATE.progress.page === 1 ? 'disabled' : ''}>«</button>`);
    btns.push(`<button class="pagination__btn" data-page="${Math.max(1, STATE.progress.page - 1)}" ${STATE.progress.page === 1 ? 'disabled' : ''}>‹</button>`);
    const win = 10;
    let s = Math.max(1, STATE.progress.page - Math.floor(win / 2));
    let e = Math.min(totalPages, s + win - 1);
    if (e - s < win - 1) s = Math.max(1, e - win + 1);
    for (let i = s; i <= e; i++) {
      btns.push(`<button class="pagination__btn${i === STATE.progress.page ? ' is-active' : ''}" data-page="${i}">${i}</button>`);
    }
    btns.push(`<button class="pagination__btn" data-page="${Math.min(totalPages, STATE.progress.page + 1)}" ${STATE.progress.page === totalPages ? 'disabled' : ''}>›</button>`);
    btns.push(`<button class="pagination__btn" data-page="${totalPages}" ${STATE.progress.page === totalPages ? 'disabled' : ''}>»</button>`);
    $('#evr-prog-pagination', pageEl).innerHTML = btns.join('');

    const sel = $('#evr-prog-size', pageEl); if (sel) sel.value = String(STATE.progress.pageSize);
  }

  /* 진행 현황 CSV 내보내기 — 파일 다운로드 표준(App.downloadFile) */
  function exportProgressExcel() {
    const round = STATE.rounds.find(r => r.id === STATE.progress.roundId); if (!round) return;
    const rows = progressFilteredRows(round);
    const head = ['No', '사번', '성명', '부서', '직책', '평가요소', '현재 단계', '완료 단계', '전체 단계', '진행률(%)', '상태'];
    const lines = [head.join(',')];
    const n = rows.length;
    rows.forEach((x, i) => {
      const e = x.emp;
      const cols = [n - i, e.id, e.name, e.dept || '', e.position || '', x.el, x.pendingLabel, x.submitted, x.total, x.pct, x.label];
      lines.push(cols.map(c => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(','));
    });
    const csv = '﻿' + lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const fname = `평가진행현황_${round.id}.csv`;
    if (App.downloadFile) App.downloadFile(fname, { blob, context: '평가 진행 현황' });
    window.toast && window.toast('진행 현황을 내려받았습니다.', 'success');
  }

  /* =========================================================
   *  미제출 후속 조치 (Q-03b / Q-38) — 인사담당자 전용
   *   ① 독려 알림 발송   ② 입력기간 재오픈   ③ 대체 평가자 지정
   *   모든 조치는 logProgressAction 으로 감사 로그(Q-10)에 누적된다.
   * ========================================================= */

  /* 선택 상태 UI 갱신 — 전체 선택 체크박스 + 선택 카운트 */
  function updateProgSelectionUI() {
    const pageEl = document.getElementById('page-hr-eval-round'); if (!pageEl) return;
    const round = STATE.rounds.find(r => r.id === STATE.progress.roundId); if (!round) return;
    const rows = progressFilteredRows(round);
    const start = (STATE.progress.page - 1) * STATE.progress.pageSize;
    const pageRows = rows.slice(start, start + STATE.progress.pageSize);
    const all = pageEl.querySelector('[data-prog-check-all]');
    if (all) {
      const selCnt = pageRows.filter(x => STATE.progress.selectedIds.has(x.emp.id)).length;
      all.checked = pageRows.length > 0 && selCnt === pageRows.length;
      all.indeterminate = selCnt > 0 && selCnt < pageRows.length;
    }
    const cnt = pageEl.querySelector('[data-prog-sel-count]');
    if (cnt) cnt.textContent = STATE.progress.selectedIds.size ? ` · 선택 ${STATE.progress.selectedIds.size}명` : '';
  }

  function progEmpName(id) {
    const m = progActiveMembers().find(e => e.id === id);
    return m ? m.name : id;
  }

  /* ---- ① 독려 알림 ---- */
  /* 툴바 [미제출 독려] — 선택이 있으면 선택 ∩ 미제출, 없으면 필터 결과 전체의 미제출 대상 */
  function doBulkNudge() {
    const round = STATE.rounds.find(r => r.id === STATE.progress.roundId); if (!round) return;
    const pending = progressFilteredRows(round).filter(x => x.code !== 'done');  // 미시작·진행중 = 미제출
    const sel = STATE.progress.selectedIds;
    const targets = sel.size ? pending.filter(x => sel.has(x.emp.id)) : pending;
    if (!targets.length) {
      window.toast && window.toast(sel.size ? '선택한 대상 중 미제출자가 없습니다.' : '독려할 미제출 대상이 없습니다.', 'info');
      return;
    }
    openNudgeConfirm(targets.map(x => x.emp.id));
  }

  function openNudgeConfirm(empIds) {
    const round = STATE.rounds.find(r => r.id === STATE.progress.roundId); if (!round) return;
    const ids = (empIds || []).filter(Boolean);
    if (!ids.length) return;
    const names = ids.map(progEmpName);
    const preview = names.slice(0, 5).join(', ') + (names.length > 5 ? ` 외 ${names.length - 5}명` : '');
    if (!confirm(`미제출 평가자 ${ids.length}명에게 독려 알림을 발송합니다.\n· 대상: ${preview}\n· 그룹웨어 시스템 알림으로 전송\n계속하시겠습니까?`)) return;
    sendNudge(ids);
  }

  function sendNudge(empIds) {
    const round = STATE.rounds.find(r => r.id === STATE.progress.roundId); if (!round) return;
    const ids = (empIds || []).filter(Boolean);
    if (!ids.length) return;
    /* 실서비스: 각 평가자에게 그룹웨어 시스템 알림(Q-32) 발송. 데모는 감사 로그에 누적. */
    ids.forEach(id => {
      const item = computeRoundProgress(round).find(x => x.emp.id === id);
      logProgressAction({
        roundId: round.id, targetId: id,
        step: item ? item.pendingLabel : '-',
        type: 'nudge', note: '미제출 독려 알림 발송',
      });
    });
    STATE.progress.selectedIds.clear();
    renderProgressTable();
    window.toast && window.toast(`${ids.length}명에게 독려 알림을 발송했습니다.`, 'success');
  }

  /* ---- ② 입력기간 재오픈 ---- */
  function openReopenModal(roundId) {
    const round = STATE.rounds.find(r => r.id === roundId); if (!round) return;
    if (round.status !== 'closed') { window.toast && window.toast('「평가 종료」 상태인 회차만 재오픈할 수 있습니다.', 'warning'); return; }
    let modal = document.getElementById('evr-reopen-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'evr-reopen-modal';
      modal.className = 'modal-backdrop';
      modal.addEventListener('click', (e) => { if (e.target === modal) closeReopenModal(); });
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div class="modal" style="width:440px;max-width:92vw;">
        <header class="modal__header">
          <div class="modal__title">입력기간 재오픈</div>
          <button class="modal__close" type="button" data-evr-ro-close aria-label="닫기">✕</button>
        </header>
        <div class="modal__body" style="background:var(--color-surface);">
          <p style="margin:0 0 14px;color:var(--color-text-sub);font-size:var(--fs-sm);line-height:1.6;">
            마감으로 「미제출」 처리된 평가를 다시 입력받기 위해 입력 종료일을 연장합니다.<br>
            재오픈 시 회차 상태가 <strong>「평가 진행중」</strong> 으로 전환됩니다.
          </p>
          <div class="fm-tbl fm-tbl--compact fm-tbl--bordered fm-tbl--form">
            <div class="fm-tbl__row fm-tbl__row--1">
              <div class="fm-tbl__label">기존 입력기간</div>
              <div class="fm-tbl__value"><span style="color:var(--color-text-sub);font-size:var(--fs-sm);">${esc(periodText(round.inputFrom, round.inputTo))}</span></div>
            </div>
            <div class="fm-tbl__row fm-tbl__row--1">
              <div class="fm-tbl__label">새 입력 종료일 ${REQ_MARK}</div>
              <div class="fm-tbl__value">
                <input type="date" class="input" id="evr-ro-date" value="" min="${esc(ymd(new Date(TODAY)))}" style="width:100%;max-width:220px;" />
              </div>
            </div>
          </div>
        </div>
        <footer class="modal__footer">
          <button class="btn" type="button" data-evr-ro-close>취소</button>
          <button class="btn btn--primary" type="button" data-evr-ro-apply>재오픈</button>
        </footer>
      </div>`;
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    modal.querySelectorAll('[data-evr-ro-close]').forEach(b => b.addEventListener('click', closeReopenModal));
    modal.querySelector('[data-evr-ro-apply]').addEventListener('click', () => {
      const dateEl = modal.querySelector('#evr-ro-date');
      const v = (dateEl.value || '').trim();
      App.Forms && App.Forms.clearFieldError(dateEl);
      if (!v) { App.Forms && App.Forms.setFieldError(dateEl, '새 입력 종료일을 선택해 주세요.'); return; }
      if (v < ymd(new Date(TODAY))) { App.Forms && App.Forms.setFieldError(dateEl, '오늘 이후 날짜로 설정해 주세요.'); return; }
      applyReopen(round.id, v);
    });
    App.Forms && App.Forms.applyOnInput(modal);
  }
  function closeReopenModal() {
    const m = document.getElementById('evr-reopen-modal'); if (!m) return;
    m.classList.remove('is-open');
    if (!document.querySelector('.modal-backdrop.is-open')) document.body.style.overflow = '';
  }
  function applyReopen(roundId, newInputTo) {
    const round = STATE.rounds.find(r => r.id === roundId); if (!round) return;
    round.inputTo = newInputTo;
    round.status = 'inProgress';
    logProgressAction({
      roundId: round.id, targetId: '-', step: '-',
      type: 'reopen', note: `입력기간 재오픈 (종료일 → ${newInputTo})`,
    });
    closeReopenModal();
    renderProgressView(document.getElementById('page-hr-eval-round'));  // 헤더(상태·기간) 갱신
    window.toast && window.toast(`입력기간을 ${newInputTo} 까지 재오픈했습니다.`, 'success');
  }

  /* ---- ③ 대체 평가자 지정 (위임 아님, 인사 재배정 — Q-08/Q-21) ---- */
  let _reassignDraft = null;   // { empId, stepKey, evaluator }
  function openReassignPicker(empId, stepKey) {
    const round = STATE.rounds.find(r => r.id === STATE.progress.roundId); if (!round) return;
    const item = computeRoundProgress(round).find(x => x.emp.id === empId); if (!item) return;
    const step = item.steps.find(s => String(s.key) === String(stepKey));
    if (!step || step.role === 'self') { window.toast && window.toast('본인 평가 단계는 대체 지정 대상이 아닙니다.', 'warning'); return; }
    _reassignDraft = { empId, stepKey: String(stepKey), evaluator: null };
    const current = progResolveEvaluator(round, item.emp, step);

    let modal = document.getElementById('evr-reassign-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'evr-reassign-modal';
      modal.className = 'modal-backdrop';
      modal.addEventListener('click', (e) => { if (e.target === modal) closeReassignModal(); });
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div class="modal" style="width:460px;max-width:92vw;">
        <header class="modal__header">
          <div class="modal__title">대체 평가자 지정</div>
          <button class="modal__close" type="button" data-evr-ra-close aria-label="닫기">✕</button>
        </header>
        <div class="modal__body" style="background:var(--color-surface);">
          <p style="margin:0 0 14px;color:var(--color-text-sub);font-size:var(--fs-sm);line-height:1.6;">
            미제출 단계의 평가자를 교체합니다. (위임이 아닌 <strong>인사 재배정</strong>)
          </p>
          <div class="fm-tbl fm-tbl--compact fm-tbl--bordered fm-tbl--form">
            <div class="fm-tbl__row fm-tbl__row--1">
              <div class="fm-tbl__label">대상자 / 단계</div>
              <div class="fm-tbl__value"><span style="font-size:var(--fs-sm);">${esc(item.emp.name)} · ${esc(step.label)}</span></div>
            </div>
            <div class="fm-tbl__row fm-tbl__row--1">
              <div class="fm-tbl__label">현재 평가자</div>
              <div class="fm-tbl__value"><span style="font-size:var(--fs-sm);color:var(--color-text-sub);">${current ? esc(current.name) + (current.dept ? ' · ' + esc(current.dept) : '') : '미지정'}</span></div>
            </div>
            <div class="fm-tbl__row fm-tbl__row--1">
              <div class="fm-tbl__label">대체 평가자 ${REQ_MARK}</div>
              <div class="fm-tbl__value">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span id="evr-ra-picked" style="font-size:var(--fs-sm);color:var(--color-text-muted);">선택된 평가자가 없습니다.</span>
                  <button class="btn btn--sm" type="button" data-evr-ra-pick style="flex-shrink:0;">평가자 선택</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <footer class="modal__footer">
          <button class="btn" type="button" data-evr-ra-close>취소</button>
          <button class="btn btn--primary" type="button" data-evr-ra-apply>교체</button>
        </footer>
      </div>`;
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    modal.querySelectorAll('[data-evr-ra-close]').forEach(b => b.addEventListener('click', closeReassignModal));
    modal.querySelector('[data-evr-ra-pick]').addEventListener('click', () => pickReassignEvaluator(empId));
    modal.querySelector('[data-evr-ra-apply]').addEventListener('click', () => {
      const pickEl = modal.querySelector('[data-evr-ra-pick]');
      App.Forms && App.Forms.clearFieldError(pickEl);
      if (!_reassignDraft || !_reassignDraft.evaluator) {
        App.Forms && App.Forms.setFieldError(pickEl, '대체 평가자를 선택해 주세요.');
        return;
      }
      applyReassign(empId, String(stepKey), _reassignDraft.evaluator);
    });
  }
  function closeReassignModal() {
    const m = document.getElementById('evr-reassign-modal'); if (!m) return;
    m.classList.remove('is-open');
    _reassignDraft = null;
    if (!document.querySelector('.modal-backdrop.is-open')) document.body.style.overflow = '';
  }
  /* 전자결재 공용 직원 선택 OffCanvas(App.openEmpPicker, 단일) 재사용 — 본인 제외 */
  function pickReassignEvaluator(selfId) {
    if (!(window.App && typeof App.openEmpPicker === 'function')) {
      window.toast && window.toast('직원 선택 모듈이 준비되지 않았습니다.', 'warning'); return;
    }
    /* picker OffCanvas 를 재배정 모달(z 1000) 위로 올림 */
    const pickerOc = document.getElementById('emp-picker-oc');
    const pickerBd = document.querySelector('[data-emp-picker-host]');
    if (pickerOc) pickerOc.classList.add('offcanvas--over-modal');
    if (pickerBd) pickerBd.classList.add('oc-backdrop--over-modal');
    const restoreZ = () => {
      if (pickerOc) pickerOc.classList.remove('offcanvas--over-modal');
      if (pickerBd) pickerBd.classList.remove('oc-backdrop--over-modal');
    };
    App.openEmpPicker({
      action: 'callback', multi: false,
      onConfirm(selected) {
        restoreZ();
        const e = selected && selected[0]; if (!e) return;
        if (e.id === selfId) { window.toast && window.toast('본인은 평가자로 지정할 수 없습니다.', 'warning'); return; }
        _reassignDraft.evaluator = { id: e.id, name: e.name, dept: e.dept || '', position: e.position || '', photoUrl: e.photoUrl || e.photo || '' };
        const picked = document.querySelector('#evr-reassign-modal #evr-ra-picked');
        if (picked) {
          picked.textContent = `${e.name}${e.dept ? ' · ' + e.dept : ''}`;
          picked.style.color = 'var(--color-text)';
        }
        const pickEl = document.querySelector('#evr-reassign-modal [data-evr-ra-pick]');
        if (pickEl) App.Forms && App.Forms.clearFieldError(pickEl);
      },
      onClose: restoreZ,
    });
  }
  function applyReassign(empId, stepKey, evaluator) {
    const round = STATE.rounds.find(r => r.id === STATE.progress.roundId); if (!round) return;
    if (!round.evaluatorOverrides) round.evaluatorOverrides = {};
    if (!round.evaluatorOverrides[empId]) round.evaluatorOverrides[empId] = {};
    round.evaluatorOverrides[empId][stepKey] = evaluator;
    logProgressAction({
      roundId: round.id, targetId: empId, step: stepKey,
      type: 'reassign', note: `대체 평가자 지정 → ${evaluator.name}`,
    });
    closeReassignModal();
    renderProgressTable();
    window.toast && window.toast(`대체 평가자로 ${evaluator.name} 님을 지정했습니다.`, 'success');
  }

  /* =========================================================
   *  진행 상세 — 인원별 단계 진행 (평가자 · 상태 · 제출일시) 모니터링 모달
   *
   *   각 단계의 평가자를 표시한다. direct_assign 단계는 회차의 evaluatorAssignments
   *   를 사용하고, 그 외 역할(직속/차상위/부서장/HR)은 데모용 결정적 휴리스틱으로
   *   해석한다. (단계 인덱스로 후보를 분산해 같은 사람이 연속 단계에 중복되지 않게 함)
   * ========================================================= */
  function progActiveMembers() {
    return (window.App && App.HRMembers && App.HRMembers.list ? App.HRMembers.list() : [])
      .filter(e => e.status !== 'retired' && e.status !== 'contractExpired');
  }
  function progResolveEvaluator(round, target, step) {
    if (!step || step.role === 'self') return target;
    /* 대체 평가자 지정(재배정) override — 회차에 저장된 교체 평가자가 있으면 우선 적용 (Q-21) */
    const ov = (round.evaluatorOverrides || {})[target.id];
    if (ov && step.key != null && ov[step.key]) return ov[step.key];
    const all = progActiveMembers();
    if (step.role === 'direct_assign') {
      const a = (round.evaluatorAssignments || {})[target.id] || {};
      const id = a[`${step.el}_${step.stageIdx}`];
      return all.find(e => e.id === id) || null;
    }
    const sameDept = all.filter(e => e.id !== target.id && e.dept && e.dept === target.dept);
    const pool = sameDept.length ? sameDept : all.filter(e => e.id !== target.id);
    if (!pool.length) return null;
    if (step.role === 'dept_head') {
      const head = pool.find(e => e.position === '팀장' || e.position === '본부장')
        || pool.find(e => e.rank === '부장' || e.rank === '차장');
      if (head) return head;
    }
    if (step.role === 'hr') {
      const hr = all.find(e => /인사/.test(e.dept || ''));
      if (hr) return hr;
    }
    /* 단계 인덱스로 후보 분산 — 직속(0)·부서장(1) 등이 서로 다른 사람이 되도록 */
    const idx = Math.max(0, step.stageIdx);
    return pool[idx % pool.length] || pool[0] || null;
  }
  function progMockSubmitAt(round, i) {
    const base = round.inputFrom || round.periodFrom || TODAY;
    const d = addDays(new Date(base), i + 1);
    const s = ymd(d).slice(2).replace(/-/g, '/');
    const hh = String(9 + (i % 8)).padStart(2, '0');
    const mm = String((i * 13) % 60).padStart(2, '0');
    return `${s}   ${hh}:${mm}`;
  }

  function openProgressDetail(empId) {
    const round = STATE.rounds.find(r => r.id === STATE.progress.roundId); if (!round) return;
    const item = computeRoundProgress(round).find(x => x.emp.id === empId); if (!item) return;
    let modal = document.getElementById('evr-prog-detail-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'evr-prog-detail-modal';
      modal.className = 'modal-backdrop';
      modal.addEventListener('click', (e) => { if (e.target === modal) closeProgressDetail(); });
      document.body.appendChild(modal);
    }
    modal.innerHTML = buildProgressDetailHTML(round, item);
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    modal.querySelectorAll('[data-evr-pd-close]').forEach(b => b.addEventListener('click', closeProgressDetail));
  }
  function closeProgressDetail() {
    const m = document.getElementById('evr-prog-detail-modal');
    if (!m) return;
    m.classList.remove('is-open');
    if (!document.querySelector('.modal-backdrop.is-open')) document.body.style.overflow = '';
  }

  function buildProgressDetailHTML(round, item) {
    const emp = item.emp;
    const type = findEvalType(round.typeKey);
    /* 대상자 카드 */
    const avBig = emp.photoUrl
      ? `<span class="av av--lg" style="background:transparent;"><img src="${esc(emp.photoUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"></span>`
      : `<span class="av av--lg ${progAvColor(emp)}">${esc((emp.name || '?').charAt(0))}</span>`;
    const targetCard = `
      <div style="display:flex;align-items:center;gap:14px;padding:14px 16px;background:var(--color-surface-alt);border:1px solid var(--color-border);border-radius:var(--radius-md);margin-bottom:16px;">
        ${avBig}
        <div style="min-width:0;flex:1;">
          <div style="display:flex;align-items:baseline;gap:8px;">
            <strong style="font-size:var(--fs-lg);color:var(--color-text);">${esc(emp.name || '-')}</strong>
            <small style="color:var(--color-text-muted);">${esc(emp.id || '')}</small>
            <span class="pill${item.pill ? ' pill--' + item.pill : ''}" style="font-size:var(--fs-xs);margin-left:4px;">${esc(item.label)}</span>
          </div>
          <div style="margin-top:3px;color:var(--color-text-sub);font-size:var(--fs-sm);">${esc(emp.dept || '-')}${emp.position ? ' · ' + esc(emp.position) : ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;min-width:200px;">
          <div class="progress" style="flex:1;"><div class="progress__bar${item.pct >= 100 ? ' progress__bar--success' : ''}" style="width:${item.pct}%;"></div></div>
          <strong style="font-size:var(--fs-sm);white-space:nowrap;">${item.submitted} / ${item.total} <small style="color:var(--color-text-muted);font-weight:var(--fw-regular);">(${item.pct}%)</small></strong>
        </div>
      </div>`;

    /* 단계 stepper — 본인 평가 → N단계 → 확정 */
    const stepperItems = item.steps.map((s, i) => {
      const cls = i < item.submitted ? 'is-done' : (i === item.submitted && !item.finalized ? 'is-current' : '');
      return `<li class="steps-h__item ${cls}"><span class="steps-h__num">${i + 1}</span><div class="steps-h__body"><span class="steps-h__title">${esc(s.label)}</span></div></li>`;
    });
    const finCls = item.finalized ? 'is-done' : (item.submitted >= item.steps.length ? 'is-current' : '');
    stepperItems.push(`<li class="steps-h__item ${finCls}"><span class="steps-h__num">${item.steps.length + 1}</span><div class="steps-h__body"><span class="steps-h__title">확정</span></div></li>`);
    const stepper = `<ol class="steps-h" style="margin:0 0 18px;">${stepperItems.join('')}</ol>`;

    /* 단계별 상세 테이블 */
    const evalCell = (member, roleText) => {
      if (!member) return `<span class="t-muted">미지정</span>`;
      const av = member.photoUrl
        ? `<span class="av av--xs" style="background:transparent;"><img src="${esc(member.photoUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"></span>`
        : `<span class="av av--xs ${progAvColor(member)}">${esc((member.name || '?').charAt(0))}</span>`;
      return `<div style="display:flex;align-items:center;gap:7px;">
        ${av}<span style="white-space:nowrap;">${esc(member.name || '-')}</span>
        <small style="color:var(--color-text-muted);">${esc(roleText)}${member.dept ? ' · ' + esc(member.dept) : ''}</small>
      </div>`;
    };
    const statePill = (code) => {
      if (code === 'done')  return `<span class="pill pill--success" style="font-size:var(--fs-xs);">제출 완료</span>`;
      if (code === 'doing') return `<span class="pill pill--warning" style="font-size:var(--fs-xs);">진행중</span>`;
      return `<span class="pill" style="font-size:var(--fs-xs);background:var(--color-surface-alt);color:var(--color-text-muted);">미시작</span>`;
    };

    const stageRows = item.steps.map((s, i) => {
      const member = progResolveEvaluator(round, emp, s);
      const roleText = s.role === 'self' ? '본인' : roleLabel(s.role);
      let code, dateText;
      if (i < item.submitted)            { code = 'done';  dateText = progMockSubmitAt(round, i); }
      else if (i === item.submitted && !item.finalized) { code = 'doing'; dateText = '-'; }
      else                               { code = 'todo';  dateText = '-'; }
      if (item.finalized)                { code = 'done';  dateText = dateText === '-' ? progMockSubmitAt(round, i) : dateText; }
      return `
        <tr>
          <td style="white-space:nowrap;">${esc(s.label)}</td>
          <td>${evalCell(member, roleText)}</td>
          <td style="text-align:center;">${statePill(code)}</td>
          <td style="text-align:center;white-space:nowrap;color:var(--color-text-sub);font-size:var(--fs-xs);">${esc(dateText)}</td>
        </tr>`;
    }).join('');
    /* 확정 행 */
    const finalState = item.finalized ? 'done' : (item.submitted >= item.steps.length ? 'doing' : 'todo');
    const finalDate = item.finalized ? progMockSubmitAt(round, item.steps.length) : '-';
    const finalRow = `
      <tr>
        <td style="white-space:nowrap;">확정</td>
        <td><span class="t-muted" style="font-size:var(--fs-sm);">시스템 · 회차 확정</span></td>
        <td style="text-align:center;">${item.finalized ? `<span class="pill pill--success" style="font-size:var(--fs-xs);">확정 완료</span>` : (finalState === 'doing' ? `<span class="pill pill--info" style="font-size:var(--fs-xs);">확정 대기</span>` : `<span class="pill" style="font-size:var(--fs-xs);background:var(--color-surface-alt);color:var(--color-text-muted);">대기</span>`)}</td>
        <td style="text-align:center;white-space:nowrap;color:var(--color-text-sub);font-size:var(--fs-xs);">${esc(finalDate)}</td>
      </tr>`;

    return `
      <div class="modal modal--lg">
        <header class="modal__header">
          <div class="modal__title">진행 상세 <span style="color:var(--color-text-muted);font-weight:var(--fw-regular);font-size:var(--fs-md);margin-left:8px;">${esc(round.name)} · ${esc((type && type.name) || round.typeKey)}</span></div>
          <button class="modal__close" type="button" data-evr-pd-close aria-label="닫기">✕</button>
        </header>
        <div class="modal__body" style="background:var(--color-surface);">
          ${targetCard}
          ${stepper}
          <table class="tbl tbl--bordered" style="width:100%;">
            <thead>
              <tr>
                <th style="width:160px;">평가 단계</th>
                <th>평가자</th>
                <th style="width:110px;text-align:center;">상태</th>
                <th style="width:140px;text-align:center;">제출일시</th>
              </tr>
            </thead>
            <tbody>${stageRows}${finalRow}</tbody>
          </table>
          <div style="margin-top:10px;color:var(--color-text-muted);font-size:var(--fs-xs);">평가자·제출일시는 데모용 표시이며, 실서비스에서는 평가자별 실제 제출 데이터로 집계됩니다.</div>
        </div>
        <footer class="modal__footer"><button class="btn" type="button" data-evr-pd-close>닫기</button></footer>
      </div>`;
  }

  /* =========================================================
   *  공유 mock — 다른 페이지(평가 진행/평가 이력) 가 이 화면을 한 번도 열지 않아도
   *  회차 데이터를 읽을 수 있도록 모듈 로드 시점에 즉시 채워둔다. */
  STATE.rounds = makeMock();

  /* =========================================================
   *  Public API — 평가 진행 / 평가 이력 화면이 이 회차/유형 mock 을 단일 소스로 사용.
   *   · list()                   — 전체 회차 (상태 무관)
   *   · listByStatus([...])       — 상태 화이트리스트 필터
   *   · get(id)                   — 단일 회차
   *   · types()                   — 평가유형 마스터 전체
   *   · getType(typeKey)          — 단일 평가유형
   *   · roleLabel(key)            — 평가자 역할 라벨
   *   · listDirectAssignStages(t) — 평가유형의 「직접 지정」 단계 목록
   *   · statusLabel(code)         — 회차 상태 표시 라벨/pill kind
   *   · listEmployeesMatchingFilter(tf) — targetFilter 로 대상자 산출 */
  App.HREvalRounds = {
    list:           () => STATE.rounds.slice(),
    listByStatus:   (statuses) => STATE.rounds.filter(r => (statuses || []).includes(r.status)),
    get:            (id) => STATE.rounds.find(r => r.id === id) || null,
    types:          () => listForms(),
    getType:        (key) => findEvalType(key),
    roleLabel,
    listDirectAssignStages,
    defaultScaleLabels,
    statusLabel:    (code) => STATUS[code] || null,
    listEmployeesMatchingFilter,
    /* 진행 현황 조치 감사 로그 (독려/재오픈/재배정) — 평가 이력 화면 등에서 단일 소스로 조회 */
    progressActions: (roundId) => roundId ? PROGRESS_ACTIONS.filter(a => a.roundId === roundId) : PROGRESS_ACTIONS.slice(),
    /* 회차 상태 변경 — 폼/리스트 어디서 호출해도 동일하게 반영되도록 일원화 */
    setStatus(id, newStatus) {
      const r = STATE.rounds.find(x => x.id === id);
      if (!r || !STATUS[newStatus]) return false;
      r.status = newStatus;
      return true;
    },
  };

  /* =========================================================
   *  Page Init
   * ========================================================= */
  let built = false;
  function initPage() {
    const pageEl = document.getElementById('page-hr-eval-round');
    if (!pageEl) return;
    pageEl.__onShow = () => {
      if (!built) {
        bindModals();
        built = true;
      }
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
