/* =========================================================
 * Page: 근태 설정 모듈 — 두 화면을 한 모듈로 제공
 *
 *   1) 근무스케줄 관리 > 근무정책 설정 (page-att-work-policy)
 *        탭: 부서별 근무정책 설정(조직도 상속) + 근무조 설정(마스터·자동 채번 WT+D/N+일련번호)
 *        ※ 부서원 상세 편성은 「부서별 근무스케줄 현황 > 근무조 설정」(page-att-shift)
 *   2) 연차 관리   > 연차 설정       (page-att-leave-set)
 *        연차 부여 기준 · 산정 방식 · 이월/소멸 정책 (탭 없는 단일 화면)
 *
 *   ※ '업무보고 양식' 은 「업무보고 관리 > 업무보고 설정」(page-att-wr-settings) 으로 분리됨.
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function parseYMD(s) {
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(2026, 5, 11);
  }
  /* SWADPIA §1 — 그리드 일자 표기 YY/MM/DD */
  function fmtYMD2(d) { return `${pad2(d.getFullYear() % 100)}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`; }

  /* 산정 기준일 — 연차 발생 현황(미리보기) 계산 기준.
   *   1년 미만 입사자는 매월 개근 시 1일씩 자동 적립되므로, 입사일 → 기준일까지 경과한 개월 수만큼 발생분이 반영된다. */
  const NOW_DATE = '2026-06-11';
  /* 익일 문자열 — 「정책 적용일」 기본값(익일부터 적용) */
  function nextDayStr() {
    const d = parseYMD(NOW_DATE); d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  /* 근무정책 설정 탭 — 부서별 근무정책 설정(조직도 상속) / 근무조 설정(마스터·자동 채번) */
  const TABS = [
    { key: 'dept',  label: '부서별 근무정책 설정' },
    { key: 'shift', label: '근무조 설정' },
  ];
  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  /* wpTab — 근무정책 설정 활성 탭. applied/appliedDate — 연차 정책 적용 여부 및 적용일(YYYY-MM-DD).
     planDate — 미리보기/적용 시 사용할 「정책 적용일」(사용자가 날짜 선택, 기본=익일). */
  const STATE = {
    wpTab: 'dept', applied: true, appliedDate: '2026-01-01', planDate: nextDayStr(),
    /* 현재 적용 중인 정책 스냅샷 — 「현재 정책 기준 미리보기」에서 사용 (적용 시 readPolicy 로 갱신) */
    appliedPolicy: { base: 15, monthly: 1, addEvery: 2, addDays: 1, cap: 25, carryLimit: 0, carryOn: true, grant: 'fiscal' },
    /* 근무형태 설정 — 통상/교대별 정책 */
    workType: {
      regular: { daily: 8, weekly: 40, weekoff: '일' },
      shift:   { daily: 8, weekly: 40, weekoff: '일' },
    },
    /* 전사 기본 근무정책 — 부서 신설 시 상위 조직이 없으면 상속하는 기본값('regular' 통상 | 'shift' 교대).
       전사 기본 근무조는 App.AttShifts.globalDefault() 로 관리(근무조 설정 탭). */
    globalPolicy: 'regular',
    /* 상세 모달에서 편집 중인 부서명 (부서별 근무조 설정 그리드 → 상세) */
    wpEditDept: null,
    /* 근무조 설정 탭 — 수정 중인 근무조(있으면 그리드 대신 인-페이지 수정 화면 표시) */
    wpShiftEditCode: null,
    /* 부서별 근무조 설정 — 부서별 구성. lazy: { deptName: { inherit, policy:'regular'|'shift', codes:[근무조] } }
       · inherit=true → 상위 조직과 동일 기준(상속, 기본). false → 이 부서만의 별도 기준(예외).
       · policy — 근무정책(통상 'regular' / 교대 'shift'). codes — 연결된 근무조(복수). 기본 근무조는 deptMeta.defaultShift.
       · 생산본부 — 별도 기준·교대근무 예시(WTD04·WTD05 주간 + WTN01·WTN02 야간 로테이션).
       · 그 외 부서는 lazy 기본값(하위=상위 동일 기준 상속, 최상위=전사 기본 정책+코드)으로 자동 구성. */
    deptCfg: {
      /* 경영지원본부 — 통상근무 예시(주간 WTD01·WTD05). 하위 인사·재무·총무팀이 동일 기준 상속. */
      '경영지원본부': { inherit: false, policy: 'regular', codes: ['WTD01', 'WTD05'] },
      /* 생산본부 — 교대근무 예시(주간 WTD04·WTD05 + 야간 WTN01·WTN02 로테이션). 하위 팀 상속. */
      '생산본부':     { inherit: false, policy: 'shift', codes: ['WTD04', 'WTD05', 'WTN01', 'WTN02'] },
      /* 홍보팀 — 별도·통상근무지만 사용 가능한 근무조 미설정(예외) 예시 (계약 모달에서 경고 노출) */
      '홍보팀':       { inherit: false, policy: 'regular', codes: [] },
    },
    /* 부서 운영 메타 — 실제 부서별(파트 포함) 관리자/기본 근무조. lazy: { deptName: { manager, defaultShift } }
       · 모든 부서의 기본 근무조 초기값은 E조(WTD05) — 미시드 부서는 deptMeta() lazy 기본값으로 동일 적용 */
    deptMeta: {
      '경영지원본부': { manager: '', defaultShift: 'WTD05' },
      '생산본부':     { manager: '', defaultShift: 'WTD05' },
    },
    selectedDeptId: 'C0',
  };

  /* ============ 조직도 / 구성원 (임직원 관리 단일 소스) ============ */
  function HRI() { return window.App && (App.AttOrg || App.HRInfoMgmt); }
  function allEmps() {
    if (App.AttStatus && App.AttStatus.EMP_LIST && App.AttStatus.EMP_LIST.length) {
      return App.AttStatus.EMP_LIST.map(e => ({ id: e.id, name: e.name, dept: e.dept, rank: e.rank || '', position: e.position || '', shift: e.shift || 'WTD01' }));
    }
    if (App.Employees && App.Employees.length) return App.Employees.slice();
    return [];
  }
  function deptMembers(deptId) {
    const h = HRI();
    return (h && h.empsInDept) ? h.empsInDept(allEmps(), deptId) : allEmps();
  }
  function deptNameOf(deptId) {
    if (!deptId || deptId === 'C0') return '';
    const h = HRI();
    return (h && h.deptName && h.deptName(deptId)) || deptId;
  }
  /* 근무조 설정을 소유하는 상위 조직(본부/팀) id — 회사(C0) 직속 최상위 노드까지 부모를 거슬러 올라간다.
     공유 API 하위호환용으로 유지. */
  function controllingDeptId(deptId) {
    const h = HRI();
    if (!h || !h.deptParentId) return deptId;
    let id = deptId, pid = h.deptParentId(id);
    while (pid && pid !== 'C0') { id = pid; pid = h.deptParentId(id); }
    return id;
  }
  /* 바로 위(직속 부모) 부서명 — 회사(C0)가 부모면 최상위 조직이므로 '' 반환. 근무조 설정 상속의 기준. */
  function parentDeptName(deptName) {
    const h = HRI();
    if (!h || !h.deptIdOf || !h.deptParentId) return '';
    const id = h.deptIdOf(deptName);
    if (!id) return '';
    const pid = h.deptParentId(id);
    if (!pid || pid === 'C0') return '';
    return deptNameOf(pid);
  }
  /* 최상위 조직 여부 — 직속 부모가 없으면(회사 직속) true. 최상위는 상속 대상이 없어 항상 자체 설정. */
  function isTopDept(deptName) { return !parentDeptName(deptName); }
  /* 이 부서의 근무형태·스케줄 설정이 실제로 결정되는 소유 부서명.
     inherit=true 이고 상위가 있으면 상위로 거슬러 올라가 첫 자체설정(예외) 부서를 찾는다. */
  function effectiveSource(deptName) {
    let name = deptName, guard = 0;
    while (name && guard++ < 30) {
      const cfg = deptConfig(name);
      const parent = parentDeptName(name);
      if (!cfg.inherit || !parent) return name;
      name = parent;
    }
    return deptName;
  }
  /* 실제 적용되는 설정(상속 해석 결과). 화면 표시·공유 API 가 사용. */
  function effectiveConfig(deptName) { return deptConfig(effectiveSource(deptName)); }
  function shiftTreeHTML() {
    const h = HRI();
    return (h && h.deptTreeHTML) ? h.deptTreeHTML(STATE.selectedDeptId, { emps: allEmps() }) : '';
  }
  function isNewUnscheduled(emp) {
    const t = Number(String(emp.id).replace(/\D/g, '').slice(-2)) || 0;
    return t % 9 === 0;
  }
  /* 전사 기본 근무조 (근무조 설정 탭에서 지정) */
  function globalDefaultCode() {
    return (App.AttShifts && App.AttShifts.globalDefault) ? App.AttShifts.globalDefault() : '';
  }
  /* 부서별 근무조 설정 — { inherit, policy:'regular'|'shift', codes:[근무조] }.
     · 하위 조직은 기본적으로 상위와 동일 기준(inherit) 상속. 최상위는 상속 대상이 없어 자체 설정.
     · 최상위 자체설정 lazy 기본 = 전사 기본 근무정책 + 전사 기본 근무조(있으면 codes 에 1개). */
  function deptConfig(deptName) {
    let cfg = STATE.deptCfg[deptName];
    if (!cfg) {
      const top = isTopDept(deptName);
      const gcode = globalDefaultCode();
      cfg = STATE.deptCfg[deptName] = {
        inherit: !top,
        policy:  STATE.globalPolicy || 'regular',
        codes:   top && gcode ? [gcode] : [],
      };
    }
    /* 구 스키마(regular/shift/regularSchedules/shiftSchedules) 보정 → 신 스키마(policy/codes) 로 마이그레이션 */
    if (!cfg.policy) cfg.policy = (cfg.shift && !cfg.regular) ? 'shift' : 'regular';
    if (!cfg.codes) {
      cfg.codes = [].concat(cfg.regularSchedules || [], cfg.shiftSchedules || []);
    }
    if (cfg.inherit === undefined) cfg.inherit = !isTopDept(deptName);
    return cfg;
  }

  /* 부서 운영 메타 — 실제 부서별(파트 포함) 관리자/신규계약 기본 근무조 (lazy). */
  function deptMeta(deptName) {
    if (!deptName) return { manager: '', defaultShift: '' };
    if (!STATE.deptMeta[deptName]) STATE.deptMeta[deptName] = { manager: '', defaultShift: 'WTD05' };
    return STATE.deptMeta[deptName];
  }
  /* 부서 단위 관리자 기본값(자동 매칭) 산정 — 직책 우선순위(높은 순)로 첫 해당자를 매칭한다.
     본부→본부장 / 팀→팀장 / 파트→파트장이 각각 그 단위의 최고 직책으로 매칭되고,
     임원이 함께 있으면 임원이 최우선(동시 존재 가능). 리더 직책이 전무하면 첫 구성원으로 대체. */
  const LEADER_POSITIONS = ['임원', '본부장', '소장', '팀장', '파트장'];
  function defaultManagerId(members) {
    const list = members || [];
    for (let i = 0; i < LEADER_POSITIONS.length; i++) {
      const m = list.find(x => x.position === LEADER_POSITIONS[i]);
      if (m) return m.id;   /* 직책이 높은 순으로 첫 해당자 = 그 부서 단위의 최고 직책 */
    }
    return list[0] ? list[0].id : '';
  }

  /* ============ 섹션 (평가유형 설정과 동일 톤 — 흰 카드 + 타이틀 + 하단 divider) ============ */
  /* 라벨+값 1쌍(셀). 다중 컬럼 row(fmRow) 안에 넣어 2·3열 구성 */
  function fmCell(label, inner, help) {
    return `
      <div class="fm-tbl__label">${esc(label)}</div>
      <div class="fm-tbl__value" style="flex-direction:column;align-items:flex-start;gap:6px;">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;">${inner}</div>
        ${help ? `<div class="form-help" style="white-space:normal;word-break:keep-all;line-height:1.5;">${esc(help)}</div>` : ''}
      </div>`;
  }
  /* N개 셀을 한 행에 — cols(1~3) 컬럼 그리드. style 로 라벨 폭 조정 가능 */
  function fmRow(cells, cols, style) {
    return `<div class="fm-tbl__row fm-tbl__row--${cols || 1}"${style ? ` style="${style}"` : ''}>${cells.join('')}</div>`;
  }
  /* 단일 라벨+값 행 (라벨 160px) — 지각 허용 시간 등 단일 항목용 */
  function fieldRow(label, inner, help) {
    return fmRow([fmCell(label, inner, help)], 1, 'grid-template-columns:160px 1fr;');
  }
  function section(title, body, opts) {
    opts = opts || {};
    /* title 이 비면 헤더(타이틀·구분선) 생략 — 탭 콘텐츠처럼 탭바가 이미 맥락을 알려주는 경우 */
    const header = title ? `
        <header style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--color-divider);">
          <h3 style="font-size:var(--fs-lg);font-weight:var(--fw-semibold);color:var(--color-text);">${esc(title)}</h3>
          ${opts.sub ? `<small style="color:var(--color-text-muted);font-size:var(--fs-sm);">${esc(opts.sub)}</small>` : ''}
          ${opts.right || ''}
        </header>` : '';
    return `
      <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:20px 24px 22px;margin-bottom:16px;">
        ${header}
        ${body}
      </section>`;
  }

  /* 그리드 상단 툴바 — 좌측 카운트(테이블 위 왼쪽) + 우측 요약/액션. */
  function gridBar(unit, n, right) {
    return `
      <div style="display:flex;align-items:center;gap:12px 16px;flex-wrap:wrap;margin-bottom:12px;">
        <span style="font-size:var(--fs-sm);color:var(--color-text-sub);">총 <strong style="color:var(--color-text);">${n}</strong>${esc(unit)}</span>
        ${right ? `<div style="margin-left:auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">${right}</div>` : ''}
      </div>`;
  }

  /* 연차 설정 — 부여 기준 / 산정 방식 / 이월·소멸 정책 */
  function radioGroup(name, opts) {
    return `<div style="display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center;">
      ${opts.map(o => `
        <label class="cb"><input type="radio" name="${esc(name)}" value="${esc(o.value)}" ${o.checked ? 'checked' : ''}><span>${esc(o.label)}</span></label>`).join('')}
    </div>`;
  }
  function renderLeave() {
    const grant = section('연차 부여 기준', `
      <div class="fm-tbl fm-tbl--form">
        ${fieldRow('부여 기준', radioGroup('leave-grant', [
          { value: 'join',   label: '입사일 기준' },
          { value: 'fiscal', label: '회계연도(1월 1일) 기준', checked: true },
        ]))}
      </div>
    `);
    const col2 = 'grid-template-columns:140px 1fr 140px 1fr;';
    const calc = section('연차 산정 방식', `
      <div class="fm-tbl fm-tbl--form">
        ${fmRow([
          fmCell('1년 이상 기본', `<input class="input" type="number" value="15" min="0" data-pol-base style="max-width:100px;"> <span class="t-muted">일</span>`),
          fmCell('1년 미만', `<span class="t-muted">매 1개월 개근 시</span> <input class="input" type="number" value="1" min="0" data-pol-monthly style="max-width:80px;"> <span class="t-muted">일 (최대 11일)</span>`),
        ], 2, col2)}
        ${fmRow([
          fmCell('가산 휴가', `<span class="t-muted">매</span> <input class="input" type="number" value="2" min="1" data-pol-add-every style="max-width:70px;"> <span class="t-muted">년마다</span> <input class="input" type="number" value="1" min="0" data-pol-add-days style="max-width:70px;"> <span class="t-muted">일 가산</span>`),
          fmCell('연차 상한', `<input class="input" type="number" value="25" min="0" data-pol-cap style="max-width:100px;"> <span class="t-muted">일</span>`),
        ], 2, col2)}
      </div>
      <div class="form-help" style="margin-top:10px;">근로기준법 제60조 기준 — 1년 미만 월 1일, 1년 이상 15일 + 2년마다 1일 가산(상한 25일).</div>
    `, { sub: '근로기준법 제60조' });
    const expire = section('이월·소멸 정책', `
      <div class="fm-tbl fm-tbl--form">
        <div class="fm-tbl__row fm-tbl__row--1" style="grid-template-columns:140px 1fr;">
          <div class="fm-tbl__label">미사용 이월</div>
          <div class="fm-tbl__value">${radioGroup('leave-carry', [
            { value: 'on',  label: '이월 허용', checked: true },
            { value: 'off', label: '미허용(당해 소멸)' },
          ])}</div>
        </div>
        <div data-carry-detail>
          <div class="fm-tbl__row fm-tbl__row--2" style="grid-template-columns:140px 1fr 140px 1fr;">
            <div class="fm-tbl__label">이월 한도</div>
            <div class="fm-tbl__value">
              <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px 16px;">
                ${radioGroup('leave-carry-limit-mode', [
                  { value: 'off', label: '없음', checked: true },
                  { value: 'on',  label: '있음' },
                ])}
                <span data-carry-limit-field style="align-items:center;gap:6px;display:none;">
                  <input class="input" type="number" value="5" min="0" data-pol-carry-limit style="max-width:100px;"> <span class="t-muted">일</span>
                </span>
              </div>
            </div>
            <div class="fm-tbl__label">소멸 시점</div>
            <div class="fm-tbl__value">
              <select class="select" data-pol-expire style="max-width:100%;width:240px;">
                <option selected>이월 후 익년도 말일까지 (이후 소멸)</option>
                <option>부여일로부터 1년 경과 시</option>
                <option>회계연도 말(12월 31일)</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    `);
    const appliedInfo = STATE.applied
      ? `<span class="t-muted">현재 정책 적용일</span> <strong style="color:var(--color-brand-primary);">${fmtYMD2(parseYMD(STATE.appliedDate))}</strong>`
      : `<span class="t-muted">아직 적용된 정책이 없습니다.</span>`;
    return `
      <div style="max-width:1100px;">
        ${grant}${calc}${expire}
        <div style="display:flex;align-items:center;gap:12px;padding-top:4px;flex-wrap:wrap;">
          <div style="font-size:var(--fs-sm);">${appliedInfo}</div>
          <div style="margin-left:auto;display:flex;gap:6px;">
            <button class="btn btn--sm" type="button" data-leave-current>현재 정책 기준 미리보기</button>
            <button class="btn btn--primary btn--sm" type="button" data-leave-apply>미리보기 후 적용</button>
          </div>
        </div>
      </div>`;
  }

  /* ============ 연차 발생 현황 (모달) — 정책 + 산정 기준일 기반 결정적 산정 ============ */
  function nowDate() { return parseYMD(NOW_DATE); }
  /* 1년 이상 근속자 목업 — 입사자 명단(대부분 1년 미만)만으로는 가산·이월 케이스 확인이 어려워
     정책 검증용 장기 근속 예시를 함께 노출. (NOW_DATE 2026 기준 1~10년차 분포) */
  const TENURED_MOCK = [
    { id: 'SW16040101', name: '김상우', dept: '경영지원본부', joinDate: '2016-04-01' },
    { id: 'SW19030403', name: '이정민', dept: '생산본부',     joinDate: '2019-03-04' },
    { id: 'SW21071505', name: '박서연', dept: '개발팀',       joinDate: '2021-07-15' },
    { id: 'SW23010208', name: '최도윤', dept: '홍보팀',       joinDate: '2023-01-02' },
    { id: 'SW24092012', name: '정하늘', dept: '인사팀',       joinDate: '2024-09-20' },
  ];
  /* 미리보기 표시 목표 인원 — 전 직원 규모(약 150명)에서의 레이아웃/스크롤/검색 동작 확인용 */
  const PREVIEW_TARGET = 150;
  const FILLER_SUR = ['김','이','박','최','정','강','조','윤','장','임','한','오','서','신','권','황','안','송','전','홍','문','손','배','백','허'];
  const FILLER_GIV = ['민준','서연','도윤','지우','하준','지민','예준','수아','지호','서아','현우','지윤','우진','채원','준서','다은','시우','유진','은우','하린','지안','서준','하은','시윤','주원'];
  const FILLER_DEPT = ['경영지원본부','생산본부','개발팀','홍보팀','인사팀','영업1팀','영업2팀','품질팀','구매팀','물류팀','재무팀','기획팀'];
  /* 부족분만큼 결정적 목업 직원 생성 — SW 사번 통일, 입사일/근속 다양하게 분포 */
  function fillerEmployees(need) {
    const out = [];
    for (let i = 0; i < need; i++) {
      const name = FILLER_SUR[i % FILLER_SUR.length] + FILLER_GIV[(i * 7) % FILLER_GIV.length];
      const dept = FILLER_DEPT[i % FILLER_DEPT.length];
      const y = 2015 + (i % 11);             /* 2015~2025 — 1~10년차 + 1년 미만 혼재 */
      const mo = (i % 12) + 1;
      const da = ((i * 3) % 27) + 1;
      const seq = String((i % 60) + 1).padStart(2, '0');
      const id = `SW${String(y).slice(2)}${pad2(mo)}${pad2(da)}${seq}`;
      out.push({ id, name, dept, joinDate: `${y}-${pad2(mo)}-${pad2(da)}` });
    }
    return out;
  }
  /* 재직 임직원 — 임직원 관리(App.HRInfoMgmt) 기준. 입사일 보유자만 + 1년 이상 근속 목업.
     전 직원 규모(약 150명) 확인을 위해 부족분은 결정적 목업으로 채운다. */
  function empSource() {
    const h = window.App && App.HRInfoMgmt;
    const rows = (h && typeof h.list === 'function') ? h.list() : [];
    const real = rows.filter(r => r && r.status !== 'retired' && r.joinDate);
    const base = TENURED_MOCK.concat(real);
    const need = Math.max(0, PREVIEW_TARGET - base.length);
    return base.concat(fillerEmployees(need));
  }
  /* 좌측 폼에서 현재 정책 값 읽기 — 폼 미마운트 시 기본값 */
  function readPolicy() {
    const p = document.getElementById('page-att-leave-set');
    const num = (sel, def) => {
      const el = p && p.querySelector(sel);
      const v = el ? parseFloat(el.value) : NaN;
      return isNaN(v) ? def : v;
    };
    const carry = p && p.querySelector('input[name="leave-carry"]:checked');
    const grant = p && p.querySelector('input[name="leave-grant"]:checked');
    const limitMode = p && p.querySelector('input[name="leave-carry-limit-mode"]:checked');
    const limitOn = limitMode ? limitMode.value === 'on' : false;
    return {
      base:       num('[data-pol-base]', 15),
      monthly:    num('[data-pol-monthly]', 1),
      addEvery:   Math.max(1, num('[data-pol-add-every]', 2)),
      addDays:    num('[data-pol-add-days]', 1),
      cap:        num('[data-pol-cap]', 25),
      carryLimit: limitOn ? num('[data-pol-carry-limit]', 0) : 0,   /* 한도 '없음' → 0(제한 없음) */
      carryOn:    carry ? carry.value === 'on' : true,
      grant:      grant ? grant.value : 'fiscal',   /* join(입사일) | fiscal(회계연도) */
    };
  }
  /* 이월·소멸 정책 표시 토글 — '미허용' → 이월 한도·소멸 시점 숨김. 이월 한도 '있음' → 숫자 입력 노출 */
  function syncCarryUI(pageEl) {
    const root = pageEl || document.getElementById('page-att-leave-set');
    if (!root) return;
    const carryEl = root.querySelector('input[name="leave-carry"]:checked');
    const carryOn = carryEl ? carryEl.value !== 'off' : true;
    const detail = root.querySelector('[data-carry-detail]');
    if (detail) detail.style.display = carryOn ? '' : 'none';
    const limitEl = root.querySelector('input[name="leave-carry-limit-mode"]:checked');
    const limitOn = limitEl ? limitEl.value === 'on' : false;
    const limitField = root.querySelector('[data-carry-limit-field]');
    if (limitField) limitField.style.display = (carryOn && limitOn) ? 'inline-flex' : 'none';
  }
  function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, d.getDate()); }
  function addYears(d, n)  { return new Date(d.getFullYear() + n, d.getMonth(), d.getDate()); }
  /* 1인 발생 연차 산정 — 기준일 시점. (mock — 사번 끝 2자리로 사용/이월을 결정적 생성) */
  function computeLeave(emp, pol, ref) {
    const join = parseYMD(emp.joinDate);
    let months = (ref.getFullYear() - join.getFullYear()) * 12 + (ref.getMonth() - join.getMonth());
    if (ref.getDate() < join.getDate()) months -= 1;
    if (months < 0) months = 0;
    const years = Math.floor(months / 12);
    const under1 = years < 1;
    const tail = Number(String(emp.id).replace(/\D/g, '').slice(-2)) || 1;
    let granted, carried, used, nextDate, nextGrant, reason;
    if (under1) {
      /* 1년 미만 — 매 1개월 개근 시 1일(최대 11일) */
      granted = Math.min(months * pol.monthly, 11);
      carried = 0;
      used = months > 0 ? Math.min(tail % 2, granted) : 0;
      reason = `입사 ${months}개월 경과 · 매월 개근 시 ${pol.monthly}일 적립 (최대 11일)`;
      /* 다음 적립일 = 다음 월 입사 응당일. 12개월차면 1년 정규부여 시점. */
      nextDate = addMonths(join, months + 1);
      /* 다음 발생 연차 — 1년 도래(12개월차) 시 정규 부여(기본일수), 그 전엔 매월 적립분 */
      nextGrant = (months + 1 >= 12) ? pol.base : pol.monthly;
    } else {
      /* 1년 이상 — 기본 + 가산(N년마다), 상한 적용 */
      const addD = Math.floor((years - 1) / pol.addEvery) * pol.addDays;
      const raw = pol.base + addD;
      granted = Math.min(raw, pol.cap);
      carried = pol.carryOn ? Math.min(tail % 6, pol.carryLimit > 0 ? pol.carryLimit : 99) : 0;
      used = Math.min((tail * 2) % (granted + 1), granted + carried);
      reason = `${years}년차 · 기본 ${pol.base}일${addD > 0 ? ` + 가산 ${addD}일` : ''}${raw > pol.cap ? ` (상한 ${pol.cap}일 적용)` : ''}`;
      /* 다음 발생일 — 회계연도 기준: 익년 1/1, 입사일 기준: 다음 입사 응당일 */
      nextDate = pol.grant === 'fiscal'
        ? new Date(ref.getFullYear() + 1, 0, 1)
        : addYears(join, years + 1);
      /* 다음 발생 연차 — 다음 연차(years+1) 시 기본+가산, 상한 적용 */
      const addDnext = Math.floor(years / pol.addEvery) * pol.addDays;
      nextGrant = Math.min(pol.base + addDnext, pol.cap);
    }
    const avail = carried + granted - used;
    return { under1, granted, carried, used, avail, nextDate, nextGrant, reason };
  }
  /* 수동 조정용 숫자 input — 기본값은 계산값. (다음 발생 연차만 수동 조정 가능) */
  function lvInput(attr, val) {
    return `<input class="input" type="number" min="0" step="0.5" data-${attr} value="${val}"
      style="width:60px;text-align:right;padding:2px 6px;height:26px;">`;
  }
  function leaveRow(emp, c, editable) {
    const hold  = c.carried + c.granted;          /* 현재 보유 연차 = 이월 잔여 + 당해 발생 */
    const avail = hold - c.used;                  /* 사용 가능 연차 = 보유 - 사용 */
    const nextCell = (editable !== false) ? lvInput('lv-nextgrant', c.nextGrant) : `${c.nextGrant}`;
    return `<tr data-lv-row>
      <td style="white-space:nowrap;">${esc(emp.id)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px;min-width:0;">
          <span class="ssw-tbl__ava" style="width:24px;height:24px;flex:0 0 auto;">${esc((emp.name||'').slice(0,1))}</span>
          <span style="font-weight:var(--fw-medium);white-space:nowrap;">${esc(emp.name)}</span>
          ${(emp.dept||emp.position) ? `<span style="display:inline-flex;align-items:center;">${emp.dept?`<span style="color:var(--color-text-muted);font-size:var(--fs-xs);white-space:nowrap;">${esc(emp.dept)}</span>`:''}${(emp.dept&&emp.position)?`<span style="color:var(--color-text-muted);font-size:var(--fs-xs);padding:0 3px;">·</span>`:''}${emp.position?`<span style="color:var(--color-text-muted);font-size:var(--fs-xs);white-space:nowrap;">${esc(emp.position)}</span>`:''}</span>`:''}
        </div>
      </td>
      <td style="text-align:left;white-space:nowrap;">
        <strong style="color:var(--color-brand-primary);font-weight:var(--fw-semibold);">${hold}</strong>
        <span class="t-muted" style="font-size:var(--fs-xs);margin-left:6px;">(이월 ${c.carried} + 당해 ${c.granted})</span>
      </td>
      <td style="text-align:right;">${c.used}</td>
      <td style="text-align:right;font-weight:var(--fw-semibold);color:var(--color-brand-primary);">${avail}</td>
      <td style="text-align:center;white-space:nowrap;">${c.nextDate ? fmtYMD2(c.nextDate) : '-'}</td>
      <td style="text-align:right;">${nextCell}</td>
      <td style="font-size:var(--fs-xs);color:var(--color-text-sub);white-space:nowrap;">${esc(c.reason || '')}</td>
    </tr>`;
  }
  /* 정책 적용일 · 총원 + 검색 정보바 + 전 직원 발생 연차 테이블
     opts: { policy?, editable?, planDateEditable? }
       · 미리보기 후 적용  — policy=readPolicy, editable=true,  planDateEditable=true (적용일 선택)
       · 현재 정책 기준    — policy=appliedPolicy, editable=false, planDateEditable=false (적용일 고정 표기) */
  function leaveTableBlock(opts) {
    opts = opts || {};
    const pol = opts.policy || readPolicy();
    const editable = opts.editable !== false;
    const planEditable = opts.planDateEditable !== false;
    const ref = nowDate();
    const emps = empSource();
    const rows = emps.length
      ? emps.map(e => leaveRow(e, computeLeave(e, pol, ref), editable)).join('')
      : `<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--color-text-muted);">대상 임직원이 없습니다.</td></tr>`;
    const th = (label, align) => `<th style="position:sticky;top:0;z-index:1;${align ? 'text-align:' + align + ';' : ''}">${label}</th>`;
    const dot = `<span style="color:var(--color-divider);">·</span>`;
    const planCell = planEditable
      ? `<label style="display:flex;align-items:center;gap:6px;">
           <span>정책 적용일 <em style="color:var(--color-danger);font-style:normal;">*</em></span>
           <input type="date" class="input" data-leave-plan-date value="${esc(STATE.planDate)}" style="max-width:160px;height:30px;">
         </label>`
      : `<span>적용일 <strong style="color:var(--color-text);">${fmtYMD2(parseYMD(STATE.appliedDate))}</strong></span>`;
    const note = editable
      ? `<div class="t-muted" style="margin-top:6px;font-size:var(--fs-xs);">※ 다음 발생 연차는 계산된 기본값이며, 칸을 직접 수정해 수동 조정할 수 있습니다.</div>`
      : '';
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--color-surface);border:1px solid var(--color-divider);border-radius:var(--radius-sm);margin-bottom:10px;font-size:var(--fs-sm);color:var(--color-text-sub);flex-wrap:wrap;">
        ${planCell}
        ${dot}
        <span>총 <strong style="color:var(--color-text);">${emps.length}</strong>명</span>
        <span style="margin-left:auto;display:flex;align-items:center;gap:6px;">
          ${(window.Icons && window.Icons.search) || ''}
          <input class="input" type="search" data-leave-search placeholder="사번·성명 검색"
            style="max-width:220px;height:30px;" autocomplete="off">
        </span>
      </div>
      <div style="max-height:62vh;overflow:auto;border:1px solid var(--color-divider);border-radius:var(--radius-sm);">
        <table class="tbl tbl--bordered" style="border-left:0;border-right:0;">
          <thead><tr>
            ${th('사번')}${th('성명')}
            ${th('현재 보유 연차')}${th('사용한 연차', 'right')}${th('사용 가능 연차', 'right')}
            ${th('다음 발생 예정일', 'center')}${th('다음 발생 연차', 'right')}${th('발생 사유')}
          </tr></thead>
          <tbody data-leave-tbody>${rows}</tbody>
        </table>
      </div>
      ${note}`;
  }

  /* 연차 발생 미리보기 / 적용 확인 모달 (UI Kit .modal / .modal__footer 사용) */
  function ensureLeaveModal() {
    if (document.getElementById('leave-policy-modal')) return;
    const html = `
<div class="modal-backdrop" id="leave-policy-modal" data-modal-id="leave-policy-modal" style="z-index:1200;">
  <div class="modal modal--lg" style="width:94vw;max-width:1180px;max-height:88vh;display:flex;flex-direction:column;">
    <div class="modal__header">
      <div class="modal__title" data-leave-modal-title>연차 발생 미리보기</div>
      <button class="modal__close" type="button" data-leave-modal-close aria-label="닫기">✕</button>
    </div>
    <div class="modal__body" style="flex:1;min-height:0;overflow:auto;background:var(--color-surface-alt);padding:18px;">
      <div data-leave-modal-banner></div>
      <div data-leave-modal-table></div>
    </div>
    <div class="modal__footer" data-leave-modal-footer></div>
  </div>
</div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    const modal = document.getElementById('leave-policy-modal');
    modal.addEventListener('click', e => {
      if (e.target === modal || e.target.closest('[data-leave-modal-close]')) { closeLeaveModal(); return; }
      if (e.target.closest('[data-leave-to-confirm]')) { openLeaveConfirm(); return; }
    });
    /* 정책 적용일 / 검색 필터 / 수동 조정 입력 — 한 번에 위임 처리 */
    modal.addEventListener('input', e => {
      /* 정책 적용일 선택 — 모달 안에서 적용일 지정(미리보기·확정 공용) */
      const planDt = e.target.closest('[data-leave-plan-date]');
      if (planDt) { STATE.planDate = planDt.value || STATE.planDate; return; }
      /* 사번·성명 검색 — 전 직원(150명+) 중 빠르게 찾기 */
      const search = e.target.closest('[data-leave-search]');
      if (search) {
        const kw = (search.value || '').trim().toLowerCase();
        modal.querySelectorAll('[data-lv-row]').forEach(tr => {
          const txt = ((tr.children[0] && tr.children[0].textContent) + ' ' + (tr.children[1] && tr.children[1].textContent)).toLowerCase();
          tr.style.display = (!kw || txt.indexOf(kw) >= 0) ? '' : 'none';
        });
        return;
      }
    });
  }
  function closeLeaveModal() {
    const m = document.getElementById('leave-policy-modal');
    if (!m) return;
    m.classList.remove('is-open');
    if (!document.querySelector('.modal-backdrop.is-open')) document.body.style.overflow = '';
  }
  function openLeaveMode(mode) {
    ensureLeaveModal();
    const m = document.getElementById('leave-policy-modal');
    if (mode === 'current') {
      /* 현재 적용 중인 정책 기준 — 읽기 전용 현황 (적용일 고정, 다음 발생 연차 수정 불가, 적용 버튼 없음) */
      m.querySelector('[data-leave-modal-title]').textContent = '현재 정책 기준 연차 현황';
      m.querySelector('[data-leave-modal-banner]').innerHTML = STATE.applied
        ? `<div style="font-size:var(--fs-sm);color:var(--color-text-sub);margin-bottom:12px;">
             현재 적용 중인 정책(<strong style="color:var(--color-text);">${fmtYMD2(parseYMD(STATE.appliedDate))}</strong> 적용) 기준 전 직원 연차 현황입니다.
           </div>`
        : `<div style="font-size:var(--fs-sm);color:var(--color-text-sub);margin-bottom:12px;">아직 적용된 정책이 없습니다.</div>`;
      m.querySelector('[data-leave-modal-footer]').innerHTML = `
        <button class="btn btn--sm" type="button" data-leave-modal-close>닫기</button>`;
      m.querySelector('[data-leave-modal-table]').innerHTML = leaveTableBlock({ policy: STATE.appliedPolicy, editable: false, planDateEditable: false });
    } else {
      m.querySelector('[data-leave-modal-title]').textContent = '연차 발생 미리보기';
      m.querySelector('[data-leave-modal-banner]').innerHTML = `
        <div style="font-size:var(--fs-sm);color:var(--color-text-sub);margin-bottom:12px;">
          아래 <strong>정책 적용일</strong>이 되면 다음 기준으로 부여됩니다.
        </div>`;
      m.querySelector('[data-leave-modal-footer]').innerHTML = `
        <button class="btn btn--sm" type="button" data-leave-modal-close>닫기</button>
        <button class="btn btn--primary btn--sm" type="button" data-leave-to-confirm>적용</button>`;
      m.querySelector('[data-leave-modal-table]').innerHTML = leaveTableBlock();
    }
    m.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  /* ===== 정책 확정 모달 — 미리보기 「적용」 클릭 시. 전 직원 표 대신 정책 요약만 보여주고 확정 ===== */
  /* 좌측 폼 현재 값으로 정책 요약 HTML 생성 */
  function policySummaryHTML() {
    const pol = readPolicy();
    const p = document.getElementById('page-att-leave-set');
    const expSel = p && p.querySelector('[data-pol-expire]');
    const expireText = (expSel && expSel.options[expSel.selectedIndex]) ? expSel.options[expSel.selectedIndex].text : '-';
    const grantText = pol.grant === 'join' ? '입사일 기준' : '회계연도(1월 1일) 기준';
    const carryText = pol.carryOn
      ? `허용${pol.carryLimit > 0 ? ` · 이월 한도 ${pol.carryLimit}일` : ' · 한도 없음'}`
      : '미허용 (당해 소멸)';
    const row = (label, val) => `
      <div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--color-divider);">
        <div style="width:110px;flex:0 0 auto;color:var(--color-text-sub);font-size:var(--fs-sm);">${label}</div>
        <div style="color:var(--color-text);font-size:var(--fs-sm);">${val}</div>
      </div>`;
    return `
      <div style="border:1px solid var(--color-divider);border-radius:var(--radius-sm);padding:2px 14px;">
        ${row('부여 기준', esc(grantText))}
        ${row('1년 이상 기본', `${pol.base}일`)}
        ${row('1년 미만', `매 1개월 개근 시 ${pol.monthly}일 (최대 11일)`)}
        ${row('가산 휴가', `매 ${pol.addEvery}년마다 ${pol.addDays}일 가산`)}
        ${row('연차 상한', `${pol.cap}일`)}
        ${row('미사용 이월', esc(carryText))}
        ${pol.carryOn ? row('소멸 시점', esc(expireText)) : ''}
      </div>`;
  }
  function ensureLeaveConfirmModal() {
    if (document.getElementById('leave-confirm-modal')) return;
    const html = `
<div class="modal-backdrop" id="leave-confirm-modal" data-modal-id="leave-confirm-modal" style="z-index:1300;">
  <div class="modal" style="width:92vw;max-width:520px;">
    <div class="modal__header">
      <div class="modal__title">정책을 확정하시겠습니까?</div>
      <button class="modal__close" type="button" data-leave-confirm-close aria-label="닫기">✕</button>
    </div>
    <div class="modal__body">
      <div style="font-size:var(--fs-sm);color:var(--color-text-sub);margin-bottom:14px;" data-leave-confirm-msg></div>
      <div data-leave-confirm-summary></div>
    </div>
    <div class="modal__footer">
      <button class="btn btn--sm" type="button" data-leave-confirm-close>닫기</button>
      <button class="btn btn--primary btn--sm" type="button" data-leave-do-confirm>확정하기</button>
    </div>
  </div>
</div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    const modal = document.getElementById('leave-confirm-modal');
    modal.addEventListener('click', e => {
      if (e.target === modal || e.target.closest('[data-leave-confirm-close]')) { closeLeaveConfirm(); return; }
      if (e.target.closest('[data-leave-do-confirm]')) { closeLeaveConfirm(); applyPolicy(); return; }
    });
  }
  function openLeaveConfirm() {
    ensureLeaveConfirmModal();
    const m = document.getElementById('leave-confirm-modal');
    m.querySelector('[data-leave-confirm-msg]').innerHTML =
      `<strong style="color:var(--color-text);">${fmtYMD2(parseYMD(STATE.planDate))}</strong>이 되면 아래 정책으로 연차가 부여됩니다.`;
    m.querySelector('[data-leave-confirm-summary]').innerHTML = policySummaryHTML();
    m.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeLeaveConfirm() {
    const m = document.getElementById('leave-confirm-modal');
    if (!m) return;
    m.classList.remove('is-open');
    if (!document.querySelector('.modal-backdrop.is-open')) document.body.style.overflow = '';
  }
  function applyPolicy() {
    STATE.applied = true;
    STATE.appliedDate = STATE.planDate;
    STATE.appliedPolicy = readPolicy();   /* 적용 시점 정책 스냅샷 → 「현재 정책 기준 미리보기」에서 사용 */
    closeLeaveModal();
    const pageEl = document.getElementById('page-att-leave-set');
    if (pageEl && pageEl.dataset.lsShellMounted) renderLsAll(pageEl);
    window.toast && window.toast(`연차 정책이 확정되었습니다. ${fmtYMD2(parseYMD(STATE.appliedDate))}부터 적용됩니다.`, 'success');
  }

  /* 근무조를 사용 중인 부서 목록(직원 배정 기준) */
  function shiftUseDepts(code) {
    return Array.from(new Set(allEmps().filter(e => e && e.shift === code).map(e => e.dept).filter(Boolean)));
  }
  /* 근무조 마스터 행 — 사용 중(직원 배정)이면 수정·삭제 불가. No 는 내림차순(도메인 표준).
     total/idx 로 No 부여, 전사 기본 근무조면 근무조 명 옆 '기본' 뱃지 표시. */
  function shiftRow(s) {
    const dash = '<span class="t-muted">-</span>';
    /* 휴게시간 — 등록된 휴게 구간(1·2회) 을 표시하고, 우측에 총 분(muted) 병기 */
    const brk = [];
    if (s.breakStart && s.breakEnd)   brk.push(`${esc(s.breakStart)}~${esc(s.breakEnd)}`);
    if (s.breakStart2 && s.breakEnd2) brk.push(`${esc(s.breakStart2)}~${esc(s.breakEnd2)}`);
    const restCell = brk.length
      ? `${brk.join(' · ')} <span class="t-muted" style="font-size:11px;">(${s.breakMin || 0}분)</span>`
      : dash;
    const kind = s.isNight ? '<span class="pill pill--purple">야간</span>' : '<span class="pill pill--info">주간</span>';
    const num = (v) => (v && v !== '0:00') ? esc(v) : dash;
    const A = App.AttShifts || {};
    /* 사용 부서 — 부서별 근무정책 연결 + 직원 배정의 합집합. 한 줄 표기, 넘치면 말줄임(…) + hover 로 전체 표시. */
    const teams = (A.usingDepts ? A.usingDepts(s.code) : []).filter(Boolean);
    const teamsText = teams.join(', ');
    const deptCell = teams.length
      ? `<span title="${esc(teamsText)}" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(teamsText)}</span>`
      : dash;
    /* 전사 기본 근무조 — 근무조 명 옆 '기본' 뱃지로 표기(별도 비고 컬럼 없음). */
    const gdef = A.globalDefault ? A.globalDefault() : '';
    const isDefault = (s.isGlobalDefault || s.code === gdef);
    /* 상태/이력 — 정책 단일 소스(App.AttShifts.codeFlags). 상태 뱃지(사용 부서 수 기준) + 마커(별도 축). */
    const fl = A.codeFlags ? A.codeFlags(s.code) : { status: 'unused', active: true, everUsed: false, inUse: false };
    /* 근무조 명 옆 뱃지: 기본(전사 기본) / 비활성(폐기) / 사용 이력(과거 배치·현재 미배치). */
    const marker = !fl.active
      ? ' <span class="pill pill--slate" style="font-size:10px;padding:1px 7px;" title="비활성 — 배치 후보에서 제외됨">비활성</span>'
      : ((fl.everUsed && !fl.inUse) ? ' <span class="pill pill--brown" style="font-size:10px;padding:1px 7px;" title="근무스케줄 배치에 사용된 이력이 있어 수정·삭제 불가">사용 이력</span>' : '');
    /* 근무조 명 옆 컬러칩 — 코드별 색상(기본 회색). */
    const chipHex = A.colorHex ? A.colorHex(s.color) : '#DDE1E6';
    const colorChip = `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${chipHex};box-shadow:0 0 0 1px var(--color-border);vertical-align:middle;margin-right:7px;flex:0 0 auto;"></span>`;
    const nameCell = `${colorChip}${esc(s.label || s.code)}${isDefault ? ' <span class="pill pill--success" style="font-size:10px;padding:1px 7px;">기본</span>' : ''}${marker}`;
    const statusCell = fl.status === 'pending'
      ? `<span class="pill pill--warning" style="white-space:nowrap;">승인대기</span>`
      : (fl.status === 'inuse'
          ? `<span class="pill pill--success" style="white-space:nowrap;">사용 중</span>`
          : `<span class="pill pill--muted" style="white-space:nowrap;">미사용</span>`);
    const dim = (!fl.active) ? ' style="opacity:.62;"' : '';
    return `
      <tr class="shift-tbl__row is-clickable" data-shift-card="${esc(s.code)}"${dim}>
        <td class="shift-tbl__code">${esc(s.code)}</td>
        <td style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${nameCell}</td>
        <td style="text-align:center;">${kind}</td>
        <td style="text-align:center;">${esc(s.start)}</td>
        <td style="text-align:center;">${esc(s.end)}</td>
        <td style="text-align:right;font-weight:var(--fw-medium);">${esc(s.workHours || '-')}</td>
        <td style="text-align:right;">${num(s.otMin !== undefined ? fmtMinLocal(s.otMin) : '')}</td>
        <td style="text-align:right;">${num(s.nightMin !== undefined ? fmtMinLocal(s.nightMin) : '')}</td>
        <td style="text-align:center;white-space:nowrap;">${restCell}</td>
        <td>${deptCell}</td>
        <td style="text-align:center;">${statusCell}</td>
      </tr>`;
  }
  /* 분 → 'H:MM' (근무조 마스터 표기용) */
  function fmtMinLocal(mins) {
    mins = Math.max(0, Math.round(Number(mins) || 0));
    return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
  }
  function renderShift() {
    /* 수정 모드 — 그리드 대신 인-페이지 수정 화면(host). renderWpAll 이 이 host 에 App.AttShifts.editInto 로 마운트. */
    if (STATE.wpShiftEditCode) {
      return `<div style="flex:1;min-height:0;overflow:auto;padding:16px 20px;background:var(--color-surface-alt);">
        <div data-wp-shift-edit-host style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:18px 20px;"></div>
      </div>`;
    }
    const list = (App.AttShifts && App.AttShifts.list) ? App.AttShifts.list() : [];
    const logN = (App.AttShifts && App.AttShifts.changeLog) ? App.AttShifts.changeLog().length : 0;
    const right = `
      <button class="btn btn--sm" type="button" data-shift-log>변경 이력${logN ? ` (${logN})` : ''}</button>
      <button class="btn btn--sm btn--primary" type="button" data-shift-act="add">${(window.Icons && window.Icons.plus) || '+'} 근무조 추가</button>`;
    return `
      <div class="toolbar">
        <div class="toolbar__left"><span class="toolbar__count">총 <strong>${list.length}</strong>개</span></div>
        <div class="toolbar__right">${right}</div>
      </div>
      <div class="grid-wrap">
        <div class="grid-scroll">
          <table class="shift-tbl" style="width:100%;table-layout:fixed;">
            <thead>
              <tr>
                <th style="width:64px;">근무조</th>
                <th style="width:150px;">근무조 명</th>
                <th style="width:50px;text-align:center;">구분</th>
                <th style="width:50px;text-align:center;">출근</th>
                <th style="width:50px;text-align:center;">퇴근</th>
                <th style="width:58px;text-align:right;">총 근무</th>
                <th style="width:46px;text-align:right;">연장</th>
                <th style="width:46px;text-align:right;">심야</th>
                <th style="width:210px;text-align:center;">휴게</th>
                <th style="width:auto;">사용 부서</th>
                <th style="width:84px;text-align:center;">상태</th>
              </tr>
            </thead>
            <tbody>
              ${list.length ? list.map(shiftRow).join('') : `<tr><td colspan="11" style="text-align:center;padding:30px;color:var(--color-text-muted);">등록된 근무조가 없습니다.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /* ----- 근무조 변경 이력 모달 — 추가/삭제/미사용/재개 전자결재 승인 내역 (중요도 낮아 모달로 분리) ----- */
  function codeLogTableHTML() {
    const log = (App.AttShifts && App.AttShifts.changeLog) ? App.AttShifts.changeLog() : [];
    const typePill = (t) => {
      if (t === '삭제')   return '<span class="pill pill--danger">삭제</span>';
      if (t === '비활성') return '<span class="pill pill--slate">비활성화</span>';
      if (t === '활성')   return '<span class="pill pill--teal">활성화</span>';
      return `<span class="pill pill--muted">${esc(t)}</span>`;
    };
    const rows = log.length
      ? log.map((h) => `
        <tr>
          <td style="text-align:center;white-space:nowrap;">${esc(h.at)}</td>
          <td class="shift-tbl__code">${esc(h.code)}</td>
          <td>${esc(h.label || '-')}</td>
          <td style="text-align:center;">${typePill(h.type)}</td>
          <td style="white-space:normal;word-break:keep-all;">${esc(h.reason || '-')}</td>
          <td style="white-space:nowrap;">${esc(h.by || '-')}</td>
          <td style="white-space:nowrap;">${esc(h.approver || '-')}</td>
        </tr>`).join('')
      : `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--color-text-muted);">변경 이력이 없습니다.</td></tr>`;
    return `
      <div class="shift-tbl-wrap" style="border:1px solid var(--color-divider);border-radius:var(--radius-sm);">
        <table class="shift-tbl" style="min-width:max-content;">
          <thead>
            <tr>
              <th style="min-width:130px;text-align:center;">변경일시</th>
              <th style="width:80px;">대상 근무조</th>
              <th style="min-width:90px;">근무조 명</th>
              <th style="width:84px;text-align:center;">변경 유형</th>
              <th style="min-width:220px;">변경 사유</th>
              <th style="width:80px;">변경자</th>
              <th style="width:80px;">승인자</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }
  function ensureCodeLogModal() {
    if (document.getElementById('shift-log-modal')) return;
    const el = document.createElement('div');
    el.className = 'modal-backdrop';
    el.id = 'shift-log-modal';
    el.style.zIndex = '1200';
    el.innerHTML = `
      <div class="modal modal--lg" style="width:94vw;max-width:900px;max-height:86vh;display:flex;flex-direction:column;">
        <div class="modal__header">
          <div class="modal__title">근무조 변경 이력</div>
          <button class="modal__close" type="button" data-slog-close aria-label="닫기">✕</button>
        </div>
        <div class="modal__body" data-slog-body style="flex:1;min-height:0;overflow:auto;padding:16px 20px;">
          <div data-slog-tbl></div>
        </div>
        <div class="modal__footer"><button class="btn btn--sm" type="button" data-slog-close>닫기</button></div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => {
      if (e.target === el || e.target.closest('[data-slog-close]')) {
        el.classList.remove('is-open');
        if (!document.querySelector('.modal-backdrop.is-open')) document.body.style.overflow = '';
      }
    });
  }
  function openCodeLogModal() {
    ensureCodeLogModal();
    const el = document.getElementById('shift-log-modal');
    el.querySelector('[data-slog-tbl]').innerHTML = codeLogTableHTML();
    el.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  /* ----- 근무형태 설정 (통상/교대 정책) ----- */
  function renderWorkType() {
    const wt = STATE.workType;
    const card = (key, title, desc) => {
      const c = wt[key];
      const opts = WEEKDAYS.map(d => `<option value="${d}" ${c.weekoff === d ? 'selected' : ''}>${d}요일</option>`).join('');
      const body = `
        <div class="fm-tbl fm-tbl--form">
          <div class="fm-tbl__row fm-tbl__row--2" style="grid-template-columns:150px 1fr 150px 1fr;">
            <div class="fm-tbl__label">1일 소정근로시간</div>
            <div class="fm-tbl__value" style="gap:6px;align-items:center;"><input class="input" type="number" min="0" max="24" step="0.5" value="${c.daily}" data-wt="daily" data-wt-key="${key}" style="max-width:110px;"><span class="t-muted">시간</span></div>
            <div class="fm-tbl__label">주 소정근로시간</div>
            <div class="fm-tbl__value" style="gap:6px;align-items:center;"><input class="input" type="number" min="0" max="68" step="1" value="${c.weekly}" data-wt="weekly" data-wt-key="${key}" style="max-width:110px;"><span class="t-muted">시간</span></div>
          </div>
          <div class="fm-tbl__row fm-tbl__row--1" style="grid-template-columns:150px 1fr;">
            <div class="fm-tbl__label">주휴일</div>
            <div class="fm-tbl__value"><select class="select" data-wt="weekoff" data-wt-key="${key}" style="max-width:140px;">${opts}</select></div>
          </div>
        </div>`;
      return section(title, body, { sub: desc });
    };
    return `
      ${card('regular', '통상근무', '정해진 출·퇴근 시간에 근무 (주간 고정)')}
      ${card('shift', '교대근무', '근무스케줄로 주·야 교대 근무')}
      <div style="text-align:right;"><button class="btn btn--primary btn--sm" type="button" data-wt-save>저장</button></div>
    `;
  }

  /* ----- 부서별 근무조 설정 (조직도 + 동일/별도 기준 · 사용 가능한 근무조 복수연결 · 기본 근무조 · 적용 부서 · 구성원) ----- */
  /* 전체 조직 부서명 — 조직도(HRInfoMgmt) 기준 전 조직. (직원 없는 부서도 포함해 적용 부서 집계에 반영) */
  function allDeptNames() {
    const h = HRI();
    if (h && h.deptsOrdered) return h.deptsOrdered().map(o => o.name);
    const set = new Set();
    allEmps().forEach(e => { if (e.dept) set.add(e.dept); });
    return Array.from(set);
  }
  /* 특정 소유(source) 부서의 근무조 기준을 그대로 적용받는 부서 목록 —
     자기 자신 + 「동일 기준(상속)」으로 연결된 하위 부서들 (합체 리스트). */
  function appliedDeptList(sourceName) {
    const out = allDeptNames().filter(d => effectiveSource(d) === sourceName);
    if (out.indexOf(sourceName) < 0) out.unshift(sourceName);
    return out;
  }
  /* 근무조 칩 (라벨 + 시간 + 주/야) — 요약/기본 표시용 */
  function codePill(code, opts) {
    opts = opts || {};
    const s = (App.AttShifts && App.AttShifts.get) ? App.AttShifts.get(code) : null;
    const lbl = s ? (s.label || code) : code;
    const tm  = s ? ` ${esc(s.start)}~${esc(s.end)}` : '';
    const tone = opts.tone || ((s && s.isNight) ? 'pill--purple' : 'pill--info');
    const star = opts.def ? '★ ' : '';
    return `<span class="pill ${tone}" style="font-weight:var(--fw-regular);">${star}<strong>${esc(code)}</strong> ${esc(lbl)}<span class="t-muted">${tm}</span></span>`;
  }

  /* 근무정책 뱃지 — 통상(info) / 교대(purple) */
  function policyPill(p) {
    return p === 'shift'
      ? '<span class="pill pill--purple">교대근무</span>'
      : '<span class="pill pill--info">통상근무</span>';
  }
  /* 부서 단위(본부/팀/파트) — 조직 type 우선, 없으면 이름 접미사로 추정 */
  function unitLabel(type, name) {
    if (type === 'hq') return '본부';
    if (type === 'part') return '파트';
    if (type === 'team') return '팀';
    return /본부$/.test(name) ? '본부' : /파트$/.test(name) ? '파트' : '팀';
  }
  /* 부서 관리자(담당자) 표시명 — 미지정이면 부서장 추정값 */
  function managerNameOf(deptName) {
    const id = App.AttWorkPolicy.deptManager(deptName);
    if (!id) return '';
    const e = allEmps().find(x => x.id === id);
    return e ? e.name : '';
  }
  /* 근무정책에 맞는 근무조 후보 — 통상=주간(WTD)만 / 교대=전체(주·야). 비활성 코드는 선택 후보에서 제외. */
  function codesForPolicy(policy) {
    const all = ((App.AttShifts && App.AttShifts.list) ? App.AttShifts.list() : []).filter(s => s.active !== false);
    return policy === 'shift' ? all : all.filter(s => !s.isNight);
  }

  /* ----- 부서별 근무조 설정 — 전체 조직을 그리드로 리스트업 ----- */
  function renderDept() {
    const orgs = (HRI() && HRI().deptsOrdered) ? HRI().deptsOrdered() : [];
    const rowsHtml = orgs.length ? orgs.map(o => {
      const name = o.name;
      const own = deptConfig(name);
      const inheriting = !isTopDept(name) && own.inherit;
      const cfg = effectiveConfig(name);
      const srcName = effectiveSource(name);
      const def = App.AttWorkPolicy.deptDefaultShift(name);
      const defS = def && App.AttShifts.get ? App.AttShifts.get(def) : null;
      const mgr = managerNameOf(name);
      /* 부서명 트리 — depth(레벨) 만큼 들여쓰고 하위는 └ 브랜치. 상속 행은 muted(뱃지 생략), 예외(별도) 하위만 '별도' 뱃지. */
      const depth = o.level || 0;
      const branch = depth > 0
        ? `<span style="flex:0 0 auto;display:inline-block;width:${depth * 18}px;text-align:right;padding-right:4px;color:var(--color-divider);">└</span>`
        : '';
      const tag = (!inheriting && !isTopDept(name))
        ? `<span class="pill pill--info" style="font-size:10px;" title="상위와 다르게 별도 설정">별도</span>`
        : '';
      /* 사용 가능한 근무조 — 이 부서에 연결된 근무조(복수). 기본 근무조와 동일 스타일(코드 brand-primary + 명칭 muted). */
      const codes = (cfg.codes || []);
      const codesCell = codes.length
        ? `<div style="display:flex;flex-wrap:wrap;gap:4px 14px;">${codes.map(c => { const cs = App.AttShifts.get ? App.AttShifts.get(c) : null; return `<span style="white-space:nowrap;" title="${cs ? esc(cs.start + '~' + cs.end) : ''}"><strong style="color:var(--color-brand-primary);">${esc(c)}</strong>${cs && cs.label ? ` <span class="t-muted">${esc(cs.label)}</span>` : ''}</span>`; }).join('')}</div>`
        : '<span class="t-muted">미지정</span>';
      /* 간식시간(참고) — 부서별 deptMeta 저장값. 시작~종료 또는 미설정('-'). */
      const dm = deptMeta(name);
      const snackCell = (dm.snackStart && dm.snackEnd) ? `${esc(dm.snackStart)}~${esc(dm.snackEnd)}` : '<span class="t-muted">-</span>';
      return `<tr class="shift-tbl__row is-clickable" data-dept-row="${esc(name)}">
        <td><span style="display:inline-flex;align-items:center;gap:6px;min-width:0;">${branch}<span style="${inheriting ? 'color:var(--color-text-sub);' : 'font-weight:var(--fw-medium);'}white-space:nowrap;">${esc(name)}</span>${tag}</span></td>
        <td style="text-align:center;"><span class="pill pill--muted">${unitLabel(o.type, name)}</span></td>
        <td>${mgr ? esc(mgr) : '<span class="t-muted">미지정</span>'}</td>
        <td style="text-align:center;">${policyPill(cfg.policy || 'regular')}</td>
        <td>${codesCell}</td>
        <td style="text-align:center;">${def ? `<strong style="color:var(--color-brand-primary);">${esc(def)}</strong>${defS ? ` <span class="t-muted">${esc(defS.label || '')}</span>` : ''}` : '<span class="t-muted">미지정</span>'}</td>
        <td style="text-align:center;white-space:nowrap;">${snackCell}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--color-text-muted);">조직 정보가 없습니다.</td></tr>`;

    return `
      <div class="toolbar">
        <div class="toolbar__left"><span class="toolbar__count">총 <strong>${orgs.length}</strong>개</span></div>
      </div>
      <div class="grid-wrap">
        <div class="grid-scroll">
          <table class="shift-tbl">
            <thead>
              <tr>
                <th style="min-width:160px;">부서명</th>
                <th style="width:70px;text-align:center;">부서단위</th>
                <th style="width:104px;">관리자</th>
                <th style="width:96px;text-align:center;">근무정책</th>
                <th style="min-width:180px;">사용 가능한 근무조</th>
                <th style="min-width:130px;text-align:center;">기본 근무조</th>
                <th style="width:120px;text-align:center;">간식시간</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>`;
  }

  /* ============ 부서 상세 모달 본문 — 관리자·근무정책·근무조 복수·기본코드 ============ */
  /* 필드 그룹 — 굵은 소제목 + 보조설명, 상단 얇은 구분선. */
  function wpField(title, sub, content, first) {
    return `
      <div style="${first ? '' : 'padding-top:16px;margin-top:16px;border-top:1px solid var(--color-divider);'}">
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:10px;">
          <span style="font-weight:var(--fw-semibold);">${title}</span>
          ${sub ? `<span class="t-muted" style="font-size:var(--fs-xs);">${sub}</span>` : ''}
        </div>
        ${content}
      </div>`;
  }
  /* 간식시간 시/분 select — 분은 10분 단위(00·10·…·50). 미지정(--) 허용. data-wpm-snack="ss-h|ss-m|se-h|se-m". */
  function snackTimeSelect(idp, val) {
    const p = /^(\d{1,2}):(\d{2})/.exec(val || '');
    const hh = p ? pad2(p[1]) : '', mnt = p ? p[2] : '';
    let hs = '<option value="">--</option>';
    for (let i = 0; i < 24; i++) { const v = pad2(i); hs += `<option value="${v}"${v === hh ? ' selected' : ''}>${v}</option>`; }
    const mm = ['00', '10', '20', '30', '40', '50'];
    const ms = '<option value="">--</option>' + mm.map(v => `<option value="${v}"${v === mnt ? ' selected' : ''}>${v}</option>`).join('');
    return `<span style="display:inline-flex;align-items:center;gap:4px;">
      <select class="select" data-wpm-snack="${idp}-h" style="width:64px;">${hs}</select><span class="t-muted">:</span>
      <select class="select" data-wpm-snack="${idp}-m" style="width:64px;">${ms}</select></span>`;
  }
  /* 이 부서(+ 같은 기준 적용 부서)에서 해당 근무조가 배정된 직원 — 사용 가능한 근무조 해제 차단 판정 */
  function codeAssignedEmps(code, name) {
    if (!code || !name) return [];
    const src = effectiveSource(name);
    const depts = new Set(appliedDeptList(src));
    depts.add(name);
    return allEmps().filter(e => e && e.shift === code && depts.has(e.dept));
  }
  function deptModalBodyHTML() {
    const name = STATE.wpEditDept;
    if (!name) return '';
    const REQ = '<em style="color:var(--color-danger);font-style:normal;">*</em>';
    const parentName = parentDeptName(name);
    const own = deptConfig(name);
    const inherit = !!parentName && own.inherit;
    const cfg = inherit ? effectiveConfig(name) : own;      /* 상속 시 상위(소유) 설정 표시 */
    const srcName = effectiveSource(name);
    const policy = cfg.policy || 'regular';
    const selectedCodes = (cfg.codes || []).slice();
    const dmeta = deptMeta(name);
    /* 관리자 기본값 = 부서장 */
    if (!dmeta.manager) {
      const did = App.AttWorkPolicy.deptManager(name);
      if (did) { const dm = allEmps().find(x => x.id === did); if (dm) { dmeta.manager = did; dmeta.managerName = dm.name; dmeta.managerSub = [dm.id, dm.position || dm.rank].filter(Boolean).join(' · '); } }
    }
    /* 기본 근무조는 「부서 관리」에서 관리 — 사용 가능한 근무조에 없더라도 임의로 비우지 않는다(부서 관리 값 유지·연동). */
    const effDefault = App.AttWorkPolicy.deptDefaultShift(name);
    const dis = inherit ? 'disabled' : '';

    /* ① 근무조 기준 (동일/별도) — 상위 조직이 있을 때만. 최상위는 항상 자체 설정이라 생략. */
    const basisContent = parentName
      ? `<div style="display:flex;gap:8px;flex-wrap:wrap;">
           <label class="cb cb--pill"><input type="radio" name="wpm-basis" data-wpm-basis value="same" ${inherit ? 'checked' : ''}><span>상위 조직과 동일</span></label>
           <label class="cb cb--pill"><input type="radio" name="wpm-basis" data-wpm-basis value="own" ${!inherit ? 'checked' : ''}><span>별도 설정</span></label>
         </div>`
      : '';

    /* ② 근무정책 (통상/교대) */
    const policyContent = inherit
      ? `<div>${policyPill(policy)}</div>`
      : `<div style="display:flex;gap:8px;flex-wrap:wrap;">
           <label class="cb cb--pill"><input type="radio" name="wpm-policy" data-wpm-policy value="regular" ${policy !== 'shift' ? 'checked' : ''}><span>통상근무</span></label>
           <label class="cb cb--pill"><input type="radio" name="wpm-policy" data-wpm-policy value="shift" ${policy === 'shift' ? 'checked' : ''}><span>교대근무</span></label>
         </div>`;

    /* ③ 사용 가능한 근무조 — 근무조 설정 그리드와 동일 컬럼(구분·출근·퇴근·총 근무시간·연장·심야·휴게).
       · 별도 설정 — 편집 테이블([사용] 체크)
       · 상속 — 상위에서 사용하는 근무조만 읽기 전용 표시
       · 기본 근무조는 여기서 지정하지 않고 「부서 관리」에서 설정 → 상단 「기본 근무조」 행에 읽기 전용 표시 */
    const cand = codesForPolicy(policy);
    /* 근태 산정 공용 컬럼 헤더 / 셀 (근무조 설정 그리드와 동일) */
    const metaHead = `
      <th style="width:52px;text-align:center;">구분</th>
      <th style="width:60px;text-align:center;">출근</th>
      <th style="width:60px;text-align:center;">퇴근</th>
      <th style="width:78px;text-align:right;">총 근무시간</th>
      <th style="width:52px;text-align:right;">연장</th>
      <th style="width:52px;text-align:right;">심야</th>
      <th style="min-width:120px;text-align:center;">휴게</th>`;
    const metaCells = (s) => {
      const dash = '<span class="t-muted">-</span>';
      const num = (mins) => { const v = fmtMinLocal(mins); return (v && v !== '0:00') ? v : dash; };
      const brk = [];
      if (s.breakStart && s.breakEnd)   brk.push(`${esc(s.breakStart)}~${esc(s.breakEnd)}`);
      if (s.breakStart2 && s.breakEnd2) brk.push(`${esc(s.breakStart2)}~${esc(s.breakEnd2)}`);
      const rest = brk.length ? `${brk.join(' · ')} <span class="t-muted" style="font-size:11px;">(${s.breakMin || 0}분)</span>` : dash;
      return `
        <td style="text-align:center;">${s.isNight ? '<span class="pill pill--purple">야간</span>' : '<span class="pill pill--info">주간</span>'}</td>
        <td style="text-align:center;">${esc(s.start)}</td>
        <td style="text-align:center;">${esc(s.end)}</td>
        <td style="text-align:right;font-weight:var(--fw-medium);">${esc(s.workHours || '-')}</td>
        <td style="text-align:right;">${num(s.otMin)}</td>
        <td style="text-align:right;">${num(s.nightMin)}</td>
        <td style="text-align:center;white-space:nowrap;">${rest}</td>`;
    };
    const inheritRow = (c) => {
      const s = App.AttShifts.get ? App.AttShifts.get(c) : null;
      if (!s) return `<tr><td class="shift-tbl__code">${esc(c)}</td><td colspan="8" class="t-muted">-</td></tr>`;
      const isDef = c === effDefault;
      return `<tr>
        <td class="shift-tbl__code">${esc(c)}</td>
        <td><span style="display:inline-flex;align-items:center;gap:8px;"><span>${esc(s.label || c)}</span>${isDef ? '<span class="pill pill--soft-blue" style="font-size:10px;padding:1px 8px;">기본</span>' : ''}</span></td>
        ${metaCells(s)}
      </tr>`;
    };
    const codeTable = inherit
      ? (selectedCodes.length
          ? `<div class="shift-tbl-wrap" style="overflow:auto;border:1px solid var(--color-divider);border-radius:var(--radius-sm);">
              <table class="shift-tbl" style="min-width:max-content;">
                <thead><tr>
                  <th style="width:72px;">근무조</th>
                  <th style="min-width:120px;">근무조명</th>
                  ${metaHead}
                </tr></thead>
                <tbody>${selectedCodes.map(inheritRow).join('')}</tbody>
              </table>
            </div>`
          : `<span class="t-muted" style="font-size:var(--fs-sm);">상위 조직에 연결된 근무조가 없습니다.</span>`)
      : (cand.length ? `
      <div data-wpd-scroll class="shift-tbl-wrap" style="max-height:78vh;overflow:auto;border:1px solid var(--color-divider);border-radius:var(--radius-sm);">
        <table class="shift-tbl" style="min-width:max-content;">
          <thead>
            <tr>
              <th style="width:72px;">근무조</th>
              <th style="min-width:110px;">근무조명</th>
              ${metaHead}
              <th style="width:52px;text-align:center;">사용</th>
            </tr>
          </thead>
          <tbody>
            ${cand.map(s => {
              const sel = selectedCodes.indexOf(s.code) >= 0;
              return `<tr class="${sel ? 'is-selected' : ''}">
                <td class="shift-tbl__code">${esc(s.code)}</td>
                <td>${esc(s.label || s.code)}</td>
                ${metaCells(s)}
                <td style="text-align:center;"><label class="cb" style="justify-content:center;"><input type="checkbox" data-wpm-code="${esc(s.code)}" ${sel ? 'checked' : ''} ${dis}></label></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`
      : `<span class="t-muted" style="font-size:var(--fs-sm);">등록된 근무조가 없습니다. 「근무조 설정」 탭에서 먼저 추가하세요.</span>`);

    /* ⑤ 관리자 (담당자) */
    const mName = dmeta.managerName || (allEmps().find(m => m.id === dmeta.manager) || {}).name || '';
    const mSub  = dmeta.managerSub  || '';
    const managerArea = mName
      ? `<div data-wpm-manager role="button" tabindex="0" title="클릭하여 관리자 변경" style="display:flex;align-items:center;gap:10px;min-width:0;max-width:440px;border:1px solid var(--color-border);border-radius:var(--radius-md);padding:8px 12px;background:var(--color-surface);cursor:pointer;">
          <span class="ssw-tbl__ava" style="width:36px;height:36px;flex:0 0 auto;">${esc((mName || '').slice(0, 1))}</span>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:var(--fw-semibold);color:var(--color-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(mName)}</div>
            <div style="font-size:12px;color:var(--color-text-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(mSub)}</div>
          </div>
          <span style="font-size:var(--fs-xs);color:var(--color-text-muted);flex:0 0 auto;">변경</span>
        </div>`
      : `<div data-wpm-manager role="button" tabindex="0" title="관리자 지정" style="display:inline-flex;align-items:center;gap:8px;max-width:440px;border:1px dashed var(--color-border);border-radius:var(--radius-md);padding:10px 14px;background:var(--color-surface);cursor:pointer;color:var(--color-text-sub);">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
          <span>관리자 지정</span>
        </div>`;

    /* 사용 가능한 근무조 해제 차단 안내 (배정된 코드 해제 시도) */
    const codeErr = STATE.wpCodeErr ? `<div class="field-error" style="margin-top:8px;">${esc(STATE.wpCodeErr)}</div>` : '';

    /* ④ 기본 근무조 (읽기 전용) — 부서 관리에서 설정한 값을 표시만 한다. 근무조 명(코드 brand-primary + 명칭 muted + 시간). */
    /* 부서 관리에서 설정한 기본 근무조(원본값)를 그대로 표시 — 미설정 부서는 lazy 기본값 E조(WTD05). 부서 관리 모달과 동일 소스(deptMeta). */
    const defCode = (App.AttWorkPolicy.rawDeptDefaultShift(name) || effDefault) || '';
    const defS = (defCode && App.AttShifts.get) ? App.AttShifts.get(defCode) : null;
    const defaultShiftContent = `
      <div>${defCode
        ? `<span style="white-space:nowrap;"><strong style="color:var(--color-brand-primary);">${esc(defCode)}</strong>${defS && defS.label ? ` <span class="t-muted">${esc(defS.label)}</span>` : ''}${defS ? ` <span class="t-muted" style="font-weight:var(--fw-regular);">${esc(defS.start)}~${esc(defS.end)}</span>` : ''}</span>`
        : `<span class="t-muted">미설정</span>`}</div>`;

    /* ⑥ 간식시간 (참고정보) — 부서 안내용, 급여 산정과 무관. 10분 단위. deptMeta 에 부서별 저장. */
    const snackContent = `
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        ${snackTimeSelect('ss', dmeta.snackStart)}
        <span class="t-muted">~</span>
        ${snackTimeSelect('se', dmeta.snackEnd)}
      </div>`;

    /* ⑦ 적용 부서 — 이 기준을 함께 상속받는 다른 부서 (소유=현재 보고 있는 부서라 제외) */
    const appliedList = appliedDeptList(srcName).filter(d => d !== srcName);
    const appliedContent = appliedList.length
      ? `<div style="display:flex;flex-wrap:wrap;gap:6px;">${appliedList.map(d => `<span class="pill pill--muted" style="font-size:11px;white-space:nowrap;">${esc(d)}</span>`).join('')}</div>`
      : `<span class="t-muted" style="font-size:var(--fs-sm);">이 부서에만 적용됩니다.</span>`;

    return `
      ${wpField('근무스케줄 관리자', '', managerArea, true)}
      ${parentName ? wpField('근무조 기준', '', basisContent) : ''}
      ${wpField(`근무정책 ${REQ}`, '', policyContent)}
      ${wpField('기본 근무조', '기본 근무조는 부서 관리에서 가능합니다.', defaultShiftContent)}
      ${wpField(`사용 가능한 근무조 ${REQ}`, '', codeTable + codeErr)}
      ${wpField('간식시간', '참고정보', snackContent)}
      ${inherit ? '' : wpField('적용 부서', `${appliedList.length}개`, appliedContent)}`;
  }

  /* 근무스케줄 관리자 지정 — 전자결재 공용 직원 선택 OffCanvas 재사용. 상세 모달의 편집 대상(STATE.wpEditDept)에 반영. */
  function openManagerPicker() {
    if (typeof App.openEmpPicker !== 'function') {
      window.toast && window.toast('직원 선택 다이얼로그를 사용할 수 없습니다.', 'warning');
      return;
    }
    App.openEmpPicker({
      action: 'callback',
      multi: false,
      /* 부서 상세 모달(z-index 1200) 위로 올린다 (미지정 시 뒤에 떠 보이지 않음) */
      zIndex: 1300,
      onConfirm(sel) {
        const e = sel && sel[0];
        if (!e || !STATE.wpEditDept) return;
        const m = deptMeta(STATE.wpEditDept);
        m.manager = e.id;
        m.managerName = e.name || '';
        m.managerSub = [e.id, e.position || e.rank || e.dept].filter(Boolean).join(' · ');
        renderDeptModal();
      },
    });
  }

  /* ============ 부서 상세 모달 ============ */
  function ensureWpModals() {
    if (document.getElementById('wp-dept-modal')) return;
    const html = `
<div class="modal-backdrop" id="wp-dept-modal" data-modal-id="wp-dept-modal" style="z-index:1200;">
  <div class="modal modal--lg" style="width:96vw;max-width:1080px;max-height:88vh;display:flex;flex-direction:column;">
    <div class="modal__header">
      <div class="modal__title" data-wpd-title>부서 근무정책 설정</div>
      <button class="modal__close" type="button" data-wpd-close aria-label="닫기">✕</button>
    </div>
    <div class="modal__body" data-wpd-body style="flex:1;min-height:0;overflow:auto;padding:18px 20px;"></div>
    <div class="modal__footer">
      <button class="btn btn--sm" type="button" data-wpd-close>취소</button>
      <button class="btn btn--primary btn--sm" type="button" data-wpd-save>저장</button>
    </div>
  </div>
</div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    bindDeptModal();
  }
  function closeWpModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('is-open');
    if (!document.querySelector('.modal-backdrop.is-open')) document.body.style.overflow = '';
  }
  /* ----- 부서 상세 모달 ----- */
  /* preserveScroll=true 면 근무조 테이블/모달 본문 스크롤 위치를 유지(체크박스 토글 시 최상단 튐 방지) */
  function renderDeptModal(preserveScroll) {
    const m = document.getElementById('wp-dept-modal');
    if (!m || !STATE.wpEditDept) return;
    const name = STATE.wpEditDept;
    const h = HRI();
    const unit = (h && h.deptsOrdered) ? (h.deptsOrdered().find(o => o.name === name) || {}) : {};
    const bodyEl = m.querySelector('[data-wpd-body]');
    let sSc = null, sBody = null;
    if (preserveScroll && bodyEl) {
      const sc = bodyEl.querySelector('[data-wpd-scroll]');
      sSc = sc ? sc.scrollTop : null;
      sBody = bodyEl.scrollTop;
    }
    m.querySelector('[data-wpd-title]').innerHTML =
      `${esc(name)} <span class="pill pill--muted" style="font-size:11px;margin-left:4px;">${unitLabel(unit.type, name)}</span>`;
    bodyEl.innerHTML = deptModalBodyHTML();
    if (preserveScroll && bodyEl) {
      const sc2 = bodyEl.querySelector('[data-wpd-scroll]');
      if (sc2 && sSc != null) sc2.scrollTop = sSc;
      if (sBody != null) bodyEl.scrollTop = sBody;
    }
  }
  function openDeptModal(name) {
    ensureWpModals();
    STATE.wpEditDept = name;
    STATE.wpCodeErr = '';
    /* 모달 오픈 시점의 '이미 연결된(커밋된) 근무조' 스냅샷 — 해제 차단은 이 코드에만 적용.
       (이번 세션에 새로 체크했다가 해제하는 코드는 자유롭게 해제 가능) */
    STATE.wpOrigCodes = new Set((deptConfig(name).codes || []).slice());
    renderDeptModal();
    const m = document.getElementById('wp-dept-modal');
    m.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function bindDeptModal() {
    const m = document.getElementById('wp-dept-modal');
    if (!m || m.dataset.bound) return;
    m.dataset.bound = '1';
    /* 닫기 / 저장 / 관리자 지정 */
    m.addEventListener('click', e => {
      if (e.target === m || e.target.closest('[data-wpd-close]')) { closeWpModal('wp-dept-modal'); return; }
      if (e.target.closest('[data-wpm-manager]')) { openManagerPicker(); return; }
      if (e.target.closest('[data-wpd-save]')) {
        const name = STATE.wpEditDept;
        const cfg = deptConfig(name);
        if (!cfg.inherit || isTopDept(name)) {
          if (!(cfg.codes || []).length) { window.toast && window.toast('사용 가능한 근무조를 하나 이상 선택해 주세요.', 'warning'); return; }
          /* 기본 근무조는 「부서 관리」에서 설정 — 이 모달에서는 표시만 하므로 저장 검증에서 제외 */
        }
        closeWpModal('wp-dept-modal');
        const pageEl = document.getElementById('page-att-work-policy');
        if (pageEl && pageEl.dataset.wpShellMounted && STATE.wpTab === 'dept') renderWpAll(pageEl);
        window.toast && window.toast(`「${name}」 근무조 설정이 저장되었습니다.`, 'success');
        return;
      }
    });
    /* 기준(동일/별도) · 근무정책 · 근무조 복수 (기본 근무조는 부서 관리에서 설정) */
    m.addEventListener('change', e => {
      const name = STATE.wpEditDept;
      if (!name) return;
      const cfg = deptConfig(name);
      /* 동일/별도 */
      const basis = e.target.closest('[data-wpm-basis]');
      if (basis) {
        STATE.wpCodeErr = '';
        const wantOwn = basis.value === 'own';
        if (wantOwn && cfg.inherit) {          /* 별도 전환 — 상속 값 복사 */
          const eff = effectiveConfig(name);
          cfg.policy = eff.policy || 'regular';
          cfg.codes  = (eff.codes || []).slice();
          const ed = App.AttWorkPolicy.deptDefaultShift(name);
          if (ed && !deptMeta(name).defaultShift) deptMeta(name).defaultShift = ed;
        }
        cfg.inherit = !wantOwn;
        renderDeptModal();
        return;
      }
      /* 간식시간(참고) — 상속 여부와 무관하게 부서별 편집 가능. 재렌더 없이 상태만 갱신(드롭다운 UX 유지). */
      const snack = e.target.closest('[data-wpm-snack]');
      if (snack) {
        const mo = document.getElementById('wp-dept-modal');
        const gv = (k) => { const el = mo && mo.querySelector(`[data-wpm-snack="${k}"]`); return el ? el.value : ''; };
        const hm = (h, mn) => (h && mn) ? `${h}:${mn}` : '';
        deptMeta(name).snackStart = hm(gv('ss-h'), gv('ss-m'));
        deptMeta(name).snackEnd   = hm(gv('se-h'), gv('se-m'));
        return;
      }
      if (cfg.inherit) return;                 /* 상속 중이면 이하 편집 불가 */
      /* 근무정책 — 통상/교대. 정책 변경 시 후보 밖 코드 정리 */
      const pol = e.target.closest('[data-wpm-policy]');
      if (pol) {
        STATE.wpCodeErr = '';
        cfg.policy = pol.value === 'shift' ? 'shift' : 'regular';
        const allow = new Set(codesForPolicy(cfg.policy).map(s => s.code));
        cfg.codes = (cfg.codes || []).filter(c => allow.has(c));
        if (deptMeta(name).defaultShift && cfg.codes.indexOf(deptMeta(name).defaultShift) < 0) deptMeta(name).defaultShift = '';
        renderDeptModal();
        return;
      }
      /* 사용 가능한 근무조 복수 — 해제(uncheck) 시 이미 배정된 코드는 차단(배정이 꼬이는 문제 방지) */
      const code = e.target.closest('[data-wpm-code]');
      if (code) {
        const cd = code.dataset.wpmCode;
        /* 해제 차단은 '이미 연결돼 있던(커밋된) 코드' + '직원 배정 존재' 일 때만.
           이번 세션에 새로 체크했다 해제하는 코드는 배정과 무관하게 자유 해제. */
        if (!code.checked && STATE.wpOrigCodes && STATE.wpOrigCodes.has(cd)) {
          const assigned = codeAssignedEmps(cd, name);
          if (assigned.length) {
            const lbl = (App.AttShifts && App.AttShifts.labelOf) ? App.AttShifts.labelOf(cd) : cd;
            STATE.wpCodeErr = `${lbl}(${cd}) 근무조는 ${assigned.length}명에게 이미 배정되어 있어 해제할 수 없습니다. 「근무스케줄 배치」에서 해당 직원의 배정을 먼저 변경하세요.`;
            renderDeptModal(true);   /* 체크 상태 복원(코드는 cfg.codes 에 그대로) + 오류 표시 */
            return;
          }
        }
        STATE.wpCodeErr = '';
        const set = new Set(cfg.codes || []);
        if (code.checked) set.add(cd); else set.delete(cd);
        cfg.codes = Array.from(set);
        if (deptMeta(name).defaultShift && cfg.codes.indexOf(deptMeta(name).defaultShift) < 0) deptMeta(name).defaultShift = '';
        renderDeptModal(true);   /* 스크롤 위치 유지 */
        return;
      }
      /* 기본 근무조는 「부서 관리」에서 설정 — 이 모달에는 선택 UI 없음(읽기 전용 표시만) */
    });
  }

  /* ============ 근무정책 설정 (page-att-work-policy) ============ */
  function renderWpBody() {
    if (STATE.wpTab === 'shift') return renderShift();
    return renderDept();
  }
  function renderWpHead() {
    return `
      <div class="att-tabbar__tabs">
        ${TABS.map(t => `<button type="button" class="att-scope-tab ${STATE.wpTab === t.key ? 'is-active' : ''}" data-wp-tab="${t.key}">${esc(t.label)}</button>`).join('')}
      </div>
    `;
  }
  function renderWpShell(pageEl) {
    pageEl.innerHTML = `
      <div class="att-page__tabbar" data-wp-head></div>
      <div class="att-page__body" data-wp-body></div>
    `;
  }
  function renderWpAll(pageEl) {
    pageEl.querySelector('[data-wp-head]').innerHTML = renderWpHead();
    const bodyEl = pageEl.querySelector('[data-wp-body]');
    bodyEl.innerHTML = renderWpBody();
    /* 근무조 수정 화면 — 그리드 대신 host 에 인-페이지로 마운트 (앱 레이아웃 유지) */
    if (STATE.wpTab === 'shift' && STATE.wpShiftEditCode && App.AttShifts && App.AttShifts.editInto) {
      const host = bodyEl.querySelector('[data-wp-shift-edit-host]');
      if (host) App.AttShifts.editInto(host, STATE.wpShiftEditCode, {
        onBack: () => { STATE.wpShiftEditCode = null; renderWpAll(pageEl); },
      });
      else { STATE.wpShiftEditCode = null; }   /* host 없음(코드 삭제 등) → 그리드 */
    }
  }
  function bindWp(pageEl) {
    if (pageEl.dataset.wpBound === '1') return;
    pageEl.dataset.wpBound = '1';
    pageEl.addEventListener('click', e => {
      const tab = e.target.closest('[data-wp-tab]');
      if (tab) { STATE.wpTab = tab.dataset.wpTab; renderWpAll(pageEl); return; }

      if (e.target.closest('[data-set-goto-shift]')) {
        if (App.Tabs && typeof App.Tabs.open === 'function') App.Tabs.open({ id: 'att-shift', label: '근무조 설정', page: 'page-att-shift' });
        return;
      }

      /* 근무조 마스터 — 추가 / 편집 (모달 재사용) */
      if (e.target.closest('[data-shift-act="add"]')) { App.AttShifts && App.AttShifts.openEditor && App.AttShifts.openEditor(null); return; }
      /* 근무조 변경 이력 모달 */
      if (e.target.closest('[data-shift-log]')) { openCodeLogModal(); return; }
      /* 근무조 행 클릭 → 상세(수정·삭제·미사용·사용 전환은 상세 내부에서 처리) */
      const scard = e.target.closest('[data-shift-card]');
      if (scard) {
        if (e.target.closest('button, a, input, select, textarea, label')) return;
        STATE.wpShiftEditCode = scard.dataset.shiftCard; renderWpAll(pageEl); return;
      }
      if (e.target.closest('[data-set-save]')) {
        window.toast && window.toast('설정이 저장되었습니다.', 'success');
        return;
      }
      /* 부서별 근무조 설정 — 상세 버튼 → 부서 상세 모달 */
      const ddet = e.target.closest('[data-dept-detail]');
      if (ddet) { e.stopPropagation(); openDeptModal(ddet.dataset.deptDetail); return; }
      /* 부서별 근무조 설정 — 행 클릭 → 부서 상세 모달 (인터랙티브 요소·텍스트 선택 중 제외) */
      const drow = e.target.closest('[data-dept-row]');
      if (drow) {
        if (e.target.closest('button, a, input, select, textarea, label')) return;
        const selText = window.getSelection && window.getSelection();
        if (selText && selText.type === 'Range' && String(selText).length > 0) return;
        openDeptModal(drow.dataset.deptRow);
        return;
      }
    });
    pageEl.addEventListener('change', e => {
      /* 근무형태 설정(잔존 화면) 정책 입력 */
      const wt = e.target.closest('[data-wt]');
      if (wt) {
        const key = wt.dataset.wtKey, field = wt.dataset.wt;
        if (STATE.workType[key]) STATE.workType[key][field] = (field === 'weekoff') ? wt.value : (Number(wt.value) || 0);
        return;
      }
    });
  }
  /* =========================================================
   *  공유 API — 부서별 근무정책/근무조 (근로계약 작성·발령 등에서 참조)
   *    deptPolicy(deptName) → { regular, shift, regularSchedules, shiftSchedules, policy, codes }
   *    · 근무정책(policy)은 통상('regular') XOR 교대('shift') 택1. codes = 연결된 근무조(복수).
   *    · 하위 조직(inherit)은 상위 정책을 상속, 별도 설정 부서는 자체 정책 사용. 최상위 미설정은 전사 기본.
   *    · 하위호환: regular/shift 불리언 + regularSchedules/shiftSchedules(정책에 따라 codes 를 한쪽에 매핑). */
  App.AttWorkPolicy = {
    deptPolicy(deptName) {
      if (!deptName) return { regular: true, shift: false, regularSchedules: [], shiftSchedules: [], policy: 'regular', codes: [] };
      const cfg = effectiveConfig(deptName);
      const codes = (cfg.codes || []).slice();
      const isShift = cfg.policy === 'shift';
      return {
        regular:          !isShift,
        shift:            isShift,
        regularSchedules: isShift ? [] : codes,
        shiftSchedules:   isShift ? codes : [],
        policy:           cfg.policy || 'regular',
        codes:            codes,
      };
    },
    /* 이 부서의 정책이 실제로 결정되는 소유 부서명 — 별도 설정 부서면 자기 자신, 아니면 상속한 상위 부서. */
    controllingDeptName(deptName) {
      if (!deptName) return deptName;
      return effectiveSource(deptName) || deptName;
    },
    /* 부서 정책 저장 — 단일 진실원(deptCfg)에 기록. 정책이 실제 결정되는 소유 부서 기준으로 저장.
       patch: { policy?, codes?, inherit? } (하위호환: regular/shift/regularSchedules/shiftSchedules 도 허용). */
    setDeptPolicy(deptName, patch) {
      if (!deptName || !patch) return null;
      deptName = App.AttWorkPolicy.controllingDeptName(deptName);
      const cfg = deptConfig(deptName);
      if ('inherit' in patch) cfg.inherit = !!patch.inherit;
      if ('policy'  in patch) cfg.policy  = patch.policy === 'shift' ? 'shift' : 'regular';
      if ('codes'   in patch) cfg.codes   = (patch.codes || []).slice();
      /* 하위호환 patch — 구 스키마로 들어오면 policy/codes 로 변환 */
      if (!('policy' in patch) && ('regular' in patch || 'shift' in patch)) {
        cfg.policy = patch.shift && !patch.regular ? 'shift' : 'regular';
      }
      if (!('codes' in patch) && ('regularSchedules' in patch || 'shiftSchedules' in patch)) {
        cfg.codes = [].concat(patch.regularSchedules || [], patch.shiftSchedules || []);
      }
      /* 부서별 근무조 설정 탭이 열려 있으면 인라인 갱신 */
      const wpEl = document.getElementById('page-att-work-policy');
      if (wpEl && wpEl.dataset.wpShellMounted && STATE.wpTab === 'dept') {
        try { renderWpAll(wpEl); } catch (e) { /* noop */ }
      }
      return cfg;
    },
    /* 부서 관리자(emp id) — 미지정이면 부서장 추정값. 근무스케줄 현황 '근무스케줄 배치' 권한 판정에 사용. */
    deptManager(deptName) {
      if (!deptName) return '';
      const m = deptMeta(deptName);
      if (m.manager) return m.manager;
      const h = HRI();
      const members = (h && h.empsInDept && h.deptIdOf)
        ? h.empsInDept(allEmps(), h.deptIdOf(deptName)) : [];
      return defaultManagerId(members);
    },
    /* 기본 근무조(code) — 해당 부서 사용 스케줄 내 값만 유효. 본인 미설정 시 상위 본부/팀 설정 상속. 없으면 ''. */
    deptDefaultShift(deptName) {
      if (!deptName) return '';
      const pol = App.AttWorkPolicy.deptPolicy(deptName);
      const used = [].concat(pol.regular ? pol.regularSchedules : [], pol.shift ? pol.shiftSchedules : []);
      let val = deptMeta(deptName).defaultShift;
      if (!val) {
        const ctrl = App.AttWorkPolicy.controllingDeptName(deptName);
        if (ctrl && ctrl !== deptName) val = deptMeta(ctrl).defaultShift;
      }
      if (val && used.indexOf(val) >= 0) return val;
      /* 저장된 기본 근무조가 없거나 연결 근무조에 포함되지 않으면 — 연결된 근무조 중 첫 번째를 기본으로 사용.
         (기본 근무조는 부서 관리에서 지정되며, 미지정 시 사용 가능한 근무조의 첫 항목으로 자동 대체 → 미지정 표시 방지) */
      return used.length ? used[0] : '';
    },
    /* 부서에 저장된 기본 근무조 원본값(유효성/상속 미적용) — 부서 관리 편집 UI 의 select 초기값 round-trip 용. */
    rawDeptDefaultShift(deptName) {
      if (!deptName) return '';
      return deptMeta(deptName).defaultShift || '';
    },
    /* 부서 기본 근무조 저장 — 부서 관리(임직원 관리) 에서 근무조 마스터 값을 부서(부서명) 기준으로 기록. */
    setDeptDefaultShift(deptName, code) {
      if (!deptName) return;
      deptMeta(deptName).defaultShift = code || '';
      /* 근무정책 설정 탭이 열려 있으면 인라인 갱신 */
      const wpEl = document.getElementById('page-att-work-policy');
      if (wpEl && wpEl.dataset.wpShellMounted && STATE.wpTab === 'dept') {
        try { renderWpAll(wpEl); } catch (e) { /* noop */ }
      }
    },
    /* 근무조가 어느 부서에든 연결(사용)되어 있는지 — 운영 중 수정 시 사유·적용일 필수 판정에 사용. */
    codeLinked(code) {
      if (!code) return false;
      return allDeptNames().some(name => (App.AttWorkPolicy.deptPolicy(name).codes || []).indexOf(code) >= 0);
    },
    /* 이 근무조를 사용(연결)하는 부서명 목록 — 근무조 설정 '사용 부서' 표기 · 미사용/삭제 제한 판정 공용. */
    deptsUsingCode(code) {
      if (!code) return [];
      return allDeptNames().filter(name => (App.AttWorkPolicy.deptPolicy(name).codes || []).indexOf(code) >= 0);
    },
  };

  function initWorkPolicyPage() {
    const pageEl = document.getElementById('page-att-work-policy');
    if (!pageEl) return;
    /* 근무조 마스터(추가/수정/삭제) 변경 시 근무조 탭이 열려있으면 인라인 테이블 갱신 */
    if (App.AttShifts && App.AttShifts.onChange) {
      App.AttShifts.onChange(() => {
        if (STATE.wpTab === 'shift' && pageEl.dataset.wpShellMounted) renderWpAll(pageEl);
      });
    }
    pageEl.__onShow = () => {
      if (!pageEl.dataset.wpShellMounted) {
        pageEl.dataset.wpShellMounted = '1';
        renderWpShell(pageEl);
        bindWp(pageEl);
      }
      renderWpAll(pageEl);
    };
  }

  /* ============ 연차 설정 (page-att-leave-set) — 단일 화면 ============ */
  function renderLsShell(pageEl) {
    pageEl.innerHTML = `<div class="att-page__body" data-ls-body style="padding:16px 20px;overflow:auto;"></div>`;
  }
  function renderLsAll(pageEl) {
    pageEl.querySelector('[data-ls-body]').innerHTML = renderLeave();
    syncCarryUI(pageEl);
  }
  function bindLs(pageEl) {
    if (pageEl.dataset.lsBound === '1') return;
    pageEl.dataset.lsBound = '1';
    pageEl.addEventListener('click', e => {
      /* 현재 정책 기준 미리보기 — 현재 적용 중인 정책 기준 전 직원 연차 현황(읽기 전용) */
      if (e.target.closest('[data-leave-current]')) { openLeaveMode('current'); return; }
      /* 미리보기 후 적용 — 미리보기 모달 진입(모달에서 적용일 선택 + 확정) */
      if (e.target.closest('[data-leave-apply]')) { openLeaveMode('preview'); return; }
    });
    /* 이월·소멸 정책 토글 */
    pageEl.addEventListener('change', e => {
      const carry = e.target.closest('input[name="leave-carry"]');
      if (carry) { syncCarryUI(pageEl); return; }
      const limitMode = e.target.closest('input[name="leave-carry-limit-mode"]');
      if (limitMode) { syncCarryUI(pageEl); return; }
    });
  }
  function initLeaveSetPage() {
    const pageEl = document.getElementById('page-att-leave-set');
    if (!pageEl) return;
    pageEl.__onShow = () => {
      if (!pageEl.dataset.lsShellMounted) {
        pageEl.dataset.lsShellMounted = '1';
        renderLsShell(pageEl);
        bindLs(pageEl);
      }
      renderLsAll(pageEl);
    };
  }

  const prev = App.initPages;
  App.initPages = function () {
    if (typeof prev === 'function') prev();
    initWorkPolicyPage();
    initLeaveSetPage();
  };
})();
