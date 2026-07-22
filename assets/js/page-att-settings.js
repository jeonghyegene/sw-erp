/* =========================================================
 * Page: 근무스케줄 관리 > 근무정책 설정 (page-att-work-policy)
 *
 *   탭: 부서별 근무정책 설정(조직도 상속) + 근무조 설정(마스터·자동 채번 WT+D/N+일련번호)
 *   ※ 근무조 마스터 편집은 App.AttShifts(att-shift-data.js) 모듈을 재사용한다.
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

  /* 근무정책 설정 탭 — 부서별 근무정책 설정(조직도 상속) / 근무조 설정(마스터·자동 채번) / 휴일 관리(공휴일·회사 지정 휴무일) */
  const TABS = [
    { key: 'dept',    label: '부서별 근무정책 설정' },
    { key: 'shift',   label: '근무조 설정' },
    { key: 'holiday', label: '휴일 관리' },
  ];
  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  /* wpTab — 근무정책 설정 활성 탭. */
  const STATE = {
    wpTab: 'dept',
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
    /* ===== 휴일 관리 탭 =====
       · holView — 'month'(월간 캘린더) | 'year'(연간 그리드)
       · holYm   — 조회 기준 'YYYY-MM'. 연간 뷰는 이 값의 연도를 사용.
       · holidays — 회사 휴일 목록. 하루 1건.
         { id, date:'YYYY-MM-DD', name, source:'public'(공휴일)|'company'(회사지정), memo, status:'approved'|'pending' }
         근로그룹의 통상 휴일구분(토/일)은 여기서 관리하지 않음(주말은 캘린더 음영으로만 표시).

       ===== 휴일 승인(전자결재) 정책 ★ =====
       1) [적용] → 변경분(추가·수정)을 「휴일 관리 변경」 전자결재로 상신하면, 해당 휴일은 즉시 확정되지 않고
          '승인대기(status:pending)' 상태로 캘린더에 표시된다. 승인대기 휴일은 아직 효력이 없어
          근무일(소정근로일) 산정에 반영하지 않는다 → App.AttHolidays.isHoliday() 는 'approved' 만 true.
       2) 결재 승인 시점에 'pending' → 'approved' 로 전환되어 정식 휴일로 효력이 발생한다.
       3) 지난 날짜 반려(void) 정책 — 상신 후 승인이 나기 전에 해당 휴일의 날짜가 이미 지나버리면,
          (승인이 늦게 나더라도) 그 날짜는 휴일로 인정하지 않고 반려(void)한다. 이미 지난 근태·급여는
          확정되어 소급 적용하지 않기 때문 → "승인 시점에 날짜가 지났으면 = 승인 나도 휴일 아님(빠꾸)".
          판정 헬퍼: holIsVoided(h) (승인대기 + 날짜 경과). 승인 처리(결재자 측)는 본 화면 밖에서 수행되며,
          여기서는 승인대기 표시 + 반려 대상 시각화 + 정책만 관리한다.
       4) 삭제는 상신 즉시 목록에서 제거(반영)한다. 재지정은 새 요청으로 상신한다. */
    holView: 'month',
    holYm: NOW_DATE.slice(0, 7),
    holEditId: null,   /* 휴일 등록/수정 모달에서 편집 중인 휴일 id(신규는 null) */
    /* 편집 모드 — false=조회(읽기전용), true=편집(추가/수정/삭제는 holDraft 에 임시 반영, [적용] 시 전자결재 상신) */
    holEditMode: false,
    holDraft: null,    /* 편집 중 작업 사본. [적용]→상신 후 변경분 pending 커밋, [취소]→폐기 */
    holidays: [
      { id: 'HOL-260615', date: '2026-06-15', name: '창립기념일', source: 'company', memo: '회사 창립 기념일', status: 'approved' },
      { id: 'HOL-261015', date: '2026-10-15', name: '체육대회',   source: 'company', memo: '전사 체육대회',    status: 'approved' },
    ],
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
        <td style="text-align:right;">${num(s.nightOtMin !== undefined ? fmtMinLocal(s.nightOtMin) : '')}</td>
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
                <th style="width:46px;text-align:right;">야간</th>
                <th style="width:62px;text-align:right;">야간연장</th>
                <th style="width:210px;text-align:center;">휴게</th>
                <th style="width:auto;">사용 부서</th>
                <th style="width:84px;text-align:center;">상태</th>
              </tr>
            </thead>
            <tbody>
              ${list.length ? list.map(shiftRow).join('') : `<tr><td colspan="12" style="text-align:center;padding:30px;color:var(--color-text-muted);">등록된 근무조가 없습니다.</td></tr>`}
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
  /* 사용 가능한 근무조 후보 — 모든 부서가 주간·야간 근무조를 모두 사용할 수 있다(근무정책 무관).
     야간조 사용은 교대/통상 여부와 무관하므로 정책으로 거르지 않는다. 비활성 코드만 제외. */
  function codesForPolicy(policy) {
    return ((App.AttShifts && App.AttShifts.list) ? App.AttShifts.list() : []).filter(s => s.active !== false);
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
      /* 교대근무 부서만 부서명 옆에 표시 (통상근무는 표시 없음 — 근무정책 컬럼 대체) */
      const shiftTag = ((cfg.policy || 'regular') === 'shift')
        ? `<span class="pill pill--purple" style="font-size:10px;" title="교대근무 부서">교대근무</span>`
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
        <td><span style="display:inline-flex;align-items:center;gap:6px;min-width:0;">${branch}<span style="${inheriting ? 'color:var(--color-text-sub);' : 'font-weight:var(--fw-medium);'}white-space:nowrap;">${esc(name)}</span>${tag}${shiftTag}</span></td>
        <td style="text-align:center;"><span class="pill pill--muted">${unitLabel(o.type, name)}</span></td>
        <td>${mgr ? esc(mgr) : '<span class="t-muted">미지정</span>'}</td>
        <td>${codesCell}</td>
        <td style="text-align:center;">${def ? `<strong style="color:var(--color-brand-primary);">${esc(def)}</strong>${defS ? ` <span class="t-muted">${esc(defS.label || '')}</span>` : ''}` : '<span class="t-muted">미지정</span>'}</td>
        <td style="text-align:center;white-space:nowrap;">${snackCell}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--color-text-muted);">조직 정보가 없습니다.</td></tr>`;

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

    /* ② 교대근무 여부 — 통상/교대 택1 대신 '교대근무 해당' 단일 체크. 체크=교대(shift) / 해제=통상(regular). */
    const policyContent = `
      <label class="cb"><input type="checkbox" data-wpm-shift ${policy === 'shift' ? 'checked' : ''} ${inherit ? 'disabled' : ''}><span>교대근무에 해당</span></label>
      <div class="t-muted" style="font-size:var(--fs-xs);margin-top:4px;">체크 시 순번에 따라 근무조가 주마다 교대 편성됩니다. 야간조는 체크 여부와 무관하게 사용할 수 있습니다.${inherit ? ' (상위 조직 설정 상속)' : ''}</div>`;

    /* ③ 사용 가능한 근무조 — 근무조 설정 그리드와 동일 컬럼(구분·출근·퇴근·총 근무시간·연장·야간·야간연장·휴게).
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
      <th style="width:52px;text-align:right;">야간</th>
      <th style="width:64px;text-align:right;">야간연장</th>
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
        <td style="text-align:right;">${num(s.nightOtMin)}</td>
        <td style="text-align:center;white-space:nowrap;">${rest}</td>`;
    };
    const inheritRow = (c) => {
      const s = App.AttShifts.get ? App.AttShifts.get(c) : null;
      if (!s) return `<tr><td class="shift-tbl__code">${esc(c)}</td><td colspan="9" class="t-muted">-</td></tr>`;
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
      ${wpField('교대근무 여부', '', policyContent)}
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
      /* 교대근무 여부 — 체크=교대(shift) / 해제=통상(regular). 변경 시 후보 밖 코드 정리 */
      const pol = e.target.closest('[data-wpm-shift]');
      if (pol) {
        STATE.wpCodeErr = '';
        cfg.policy = pol.checked ? 'shift' : 'regular';
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

  /* =========================================================
   * 휴일 관리 탭 — 공휴일·회사 지정 휴무일을 캘린더로 조회/등록
   *   · 월간(att-cal) / 연간(lp-year 그리드) 뷰 토글
   *   · 하루 1건. 휴일(공휴일·회사지정) = 근무일(소정근로일) 아님
   *   · [공휴일 적용] — 해당 연도 법정공휴일 일괄 등록(중복 날짜 제외)
   *   ※ 근로그룹 통상 휴일구분(토/일)은 여기서 관리하지 않음(주말은 음영 표시만)
   * ========================================================= */
  const HOL_MONTH_LABELS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
  /* 양력 고정 공휴일 — 매년 동일 */
  const HOL_SOLAR = [
    ['01-01', '신정'], ['03-01', '삼일절'], ['05-01', '근로자의날'], ['05-05', '어린이날'],
    ['06-06', '현충일'], ['08-15', '광복절'], ['10-03', '개천절'], ['10-09', '한글날'], ['12-25', '성탄절'],
  ];
  /* 음력 기반 공휴일(설날·부처님오신날·추석) — 연도별 사전. 미등재 연도는 양력 공휴일만 적용. */
  const HOL_LUNAR = {
    2025: [['2025-01-28', '설날 연휴'], ['2025-01-29', '설날'], ['2025-01-30', '설날 연휴'], ['2025-05-05', '부처님오신날'], ['2025-10-06', '추석 연휴'], ['2025-10-07', '추석'], ['2025-10-08', '추석 연휴']],
    2026: [['2026-02-16', '설날 연휴'], ['2026-02-17', '설날'], ['2026-02-18', '설날 연휴'], ['2026-05-24', '부처님오신날'], ['2026-09-24', '추석 연휴'], ['2026-09-25', '추석'], ['2026-09-26', '추석 연휴']],
    2027: [['2027-02-06', '설날 연휴'], ['2027-02-07', '설날'], ['2027-02-08', '설날 연휴'], ['2027-05-13', '부처님오신날'], ['2027-09-14', '추석 연휴'], ['2027-09-15', '추석'], ['2027-09-16', '추석 연휴']],
  };
  function krPublicHolidays(year) {
    const out = HOL_SOLAR.map(([md, nm]) => ({ date: year + '-' + md, name: nm }));
    (HOL_LUNAR[year] || []).forEach(([d, nm]) => out.push({ date: d, name: nm }));
    return out;
  }

  /* holStore — 렌더/변경이 참조하는 활성 목록. 편집 모드면 작업 사본(holDraft), 아니면 커밋본(STATE.holidays). */
  function holStore() { return STATE.holEditMode ? STATE.holDraft : STATE.holidays; }
  /* 지난 날짜 — 오늘 이전(오늘 포함 X)은 소급 지정 불가. 근태/급여가 이미 확정된 기간이라 공휴일 불러오기·휴무일 설정 차단. */
  function isPastDate(ds) { return ds < NOW_DATE; }
  function holDaysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
  function holidayById(id) { return holStore().find(h => h.id === id) || null; }
  function holidayOn(dateStr) { return holStore().find(h => h.date === dateStr) || null; }
  function newHolId(date) {
    /* HOL-YYMMDD 기본. 편집으로 id 와 날짜가 어긋난 경우 대비해 중복이면 접미사(-2, -3 …) 부여. */
    const base = 'HOL-' + String(date).replace(/-/g, '').slice(2);
    let id = base, n = 1;
    while (holStore().some(h => h.id === id)) id = base + '-' + (++n);
    return id;
  }
  function holCount() {
    const arr = holStore();
    if (STATE.holView === 'year') return arr.filter(h => h.date.slice(0, 4) === STATE.holYm.slice(0, 4)).length;
    return arr.filter(h => h.date.slice(0, 7) === STATE.holYm).length;
  }
  function rerenderHoliday() {
    const pageEl = document.getElementById('page-att-work-policy');
    if (pageEl && pageEl.dataset.wpShellMounted && STATE.wpTab === 'holiday') renderWpAll(pageEl);
  }
  /* ----- 편집 모드 전환/저장 ----- */
  function holNorm(arr) {
    return arr.map(h => `${h.date}|${h.name}|${h.source}|${h.memo || ''}`).sort().join('~');
  }
  function holDraftDirty() {
    return !!STATE.holDraft && holNorm(STATE.holDraft) !== holNorm(STATE.holidays);
  }
  function enterHolEdit() {
    STATE.holEditMode = true;
    STATE.holDraft = STATE.holidays.map(h => Object.assign({}, h));   /* 작업 사본 */
    rerenderHoliday();
  }
  /* 승인대기 여부 / 반려(void) 판정 — 위 「휴일 승인 정책」 참조.
     holIsPending: 상신 후 결재 미완료(효력 없음). holIsVoided: 승인대기인데 날짜가 이미 지남 → 승인 나도 휴일 아님. */
  function holIsPending(h) { return !!(h && h.status === 'pending'); }
  function holIsVoided(h) { return holIsPending(h) && isPastDate(h.date); }

  /* 상신 반영 — 전자결재 「휴일 관리 변경」 승인 요청을 접수한 뒤 호출.
     변경분(추가·수정)은 즉시 확정하지 않고 '승인대기(pending)'로 표시. (확정 전환·지난 날짜 반려는 결재 승인 시점 처리) */
  function commitHolEdit() {
    const prevById = STATE.holidays.reduce((m, h) => (m[h.id] = h, m), {});
    STATE.holidays = (STATE.holDraft || []).map(h => {
      const prev = prevById[h.id];
      const changed = !prev || prev.date !== h.date || prev.name !== h.name || (prev.memo || '') !== (h.memo || '');
      /* 추가·수정된 건 → 승인대기. 변경 없는 건 기존 상태 유지. */
      return Object.assign({}, h, { status: changed ? 'pending' : (h.status || 'approved') });
    });
    STATE.holDraft = null;
    STATE.holEditMode = false;
    rerenderHoliday();
  }
  /* 커밋 전 변경 요약 — 전자결재 본문/제목에 노출 (추가·수정·삭제) */
  function holDiffSummary() {
    const committed = STATE.holidays, draft = STATE.holDraft || [];
    const idMap = arr => arr.reduce((m, h) => (m[h.id] = h, m), {});
    const cM = idMap(committed), dM = idMap(draft);
    const added = draft.filter(h => !cM[h.id]);
    const deleted = committed.filter(h => !dM[h.id]);
    const modified = draft.filter(h => cM[h.id] && (cM[h.id].date !== h.date || cM[h.id].name !== h.name || (cM[h.id].memo || '') !== (h.memo || '')))
      .map(h => ({ before: cM[h.id], after: h }));
    const cap = (list) => list.length > 10 ? list.slice(0, 10).concat([`외 ${list.length - 10}건`]) : list;
    const lines = [];
    if (added.length)    lines.push(`· 추가 ${added.length}건: ${cap(added.map(h => `${h.name}(${h.date})`)).join(', ')}`);
    if (modified.length) lines.push(`· 수정 ${modified.length}건: ${cap(modified.map(m => `${m.after.name}(${m.before.date === m.after.date ? m.after.date : m.before.date + '→' + m.after.date})`)).join(', ')}`);
    if (deleted.length)  lines.push(`· 삭제 ${deleted.length}건: ${cap(deleted.map(h => `${h.name}(${h.date})`)).join(', ')}`);
    return { added, modified, deleted, text: lines.join('\n') };
  }
  /* [적용] — 변경분을 「휴일 관리 변경」 문서로 시스템 전자결재 상신. 승인 요청 접수 후 커밋. */
  function applyHolEdit() {
    if (!holDraftDirty()) {   /* 변경 없음 → 승인 불필요, 편집만 종료 */
      STATE.holDraft = null; STATE.holEditMode = false;
      window.toast && window.toast('변경 사항이 없어 편집을 종료했습니다.', 'info');
      rerenderHoliday();
      return;
    }
    const year = STATE.holYm.slice(0, 4);
    const diff = holDiffSummary();
    if (window.App && typeof App.openSystemApprovalModal === 'function') {
      App.openSystemApprovalModal({
        docName: '휴일 관리 변경',
        titlePrefix: '휴일 관리 변경',
        codeLabel: '분류',
        nameLabel: '대상',
        matCode: '휴일 관리',
        matName: `${year}년`,
        customReasons: ['휴일 지정 변경', '법정공휴일 반영', '회사 지정 휴무일 변경', '기타'],
        defaultReason: '휴일 지정 변경',
        title: `휴일 관리 변경 승인 요청 — ${year}년 (추가 ${diff.added.length} · 수정 ${diff.modified.length} · 삭제 ${diff.deleted.length})`,
        content: diff.text,
        payload: { kind: 'holiday-change', year: year },
        onSubmit: commitHolEdit,   /* 상신 접수 시 변경 반영(mock — 실서비스는 결재 승인 콜백에서 반영) */
      });
    } else {
      commitHolEdit();   /* 결재 모듈 미연결 — 즉시 반영 */
      window.toast && window.toast('휴일 설정이 저장되었습니다.', 'success');
    }
  }
  function cancelHolEdit() {
    const dirty = holDraftDirty();
    STATE.holDraft = null;
    STATE.holEditMode = false;
    window.toast && window.toast(dirty ? '변경 사항을 취소했습니다.' : '편집을 종료했습니다.', 'info');
    rerenderHoliday();
  }
  function moveHol(dir) {
    if (STATE.holView === 'year') {
      STATE.holYm = (+STATE.holYm.slice(0, 4) + dir) + '-' + STATE.holYm.slice(5, 7);
    } else {
      const d = new Date(+STATE.holYm.slice(0, 4), +STATE.holYm.slice(5, 7) - 1 + dir, 1);
      STATE.holYm = d.getFullYear() + '-' + pad2(d.getMonth() + 1);
    }
  }

  /* ----- 툴바 ----- */
  function renderHolToolbar() {
    const year = +STATE.holYm.slice(0, 4);
    const isYear = STATE.holView === 'year';
    const picker = isYear
      ? `<span class="att-tb__title" style="font-size:var(--fs-lg);font-weight:var(--fw-bold);">${year}년</span>`
      : App.YmPicker.html({ name: 'hol', ym: STATE.holYm, todayYm: NOW_DATE.slice(0, 7), labelStyle: 'font-size:var(--fs-lg);' });
    const scope = isYear ? `${year}년` : `${year}년 ${+STATE.holYm.slice(5, 7)}월`;
    const plus = (window.Icons && window.Icons.plus) || '+';
    /* 우측 액션 — 조회 모드: [편집] 하나. 편집 모드: 불러오기·추가 + [취소]/[적용]. */
    const right = STATE.holEditMode
      ? `
          <button class="btn btn--sm" type="button" data-hol-apply-public>공휴일 불러오기</button>
          <button class="btn btn--sm" type="button" data-hol-add>${plus} 휴일 추가</button>
          <span class="hol-tb__divider"></span>
          <button class="btn btn--sm" type="button" data-hol-cancel>취소</button>
          <button class="btn btn--sm btn--primary" type="button" data-hol-save>적용${holDraftDirty() ? ' <span style="color:var(--color-brand-accent);">•</span>' : ''}</button>`
      : `<button class="btn btn--sm btn--primary" type="button" data-hol-edit>${(window.Icons && window.Icons.edit) || '✎'} 편집</button>`;
    return `
      <div class="toolbar">
        <div class="toolbar__left" style="gap:10px;">
          ${picker}
          <div class="att-tb__nav">
            <button type="button" data-hol-prev aria-label="이전">‹</button>
            <button type="button" data-hol-today>오늘</button>
            <button type="button" data-hol-next aria-label="다음">›</button>
          </div>
          <span class="toolbar__count">${esc(scope)} 휴일 <strong>${holCount()}</strong>건</span>
        </div>
        <div class="toolbar__right" style="gap:8px;">
          <div class="att-tb__views">
            <button type="button" data-hol-view="month" class="${isYear ? '' : 'is-active'}">월간</button>
            <button type="button" data-hol-view="year" class="${isYear ? 'is-active' : ''}">연간</button>
          </div>
          ${right}
        </div>
      </div>`;
  }

  function holChipHTML(h, editable) {
    const pending = holIsPending(h), voided = holIsVoided(h);
    const stateTip = voided ? ' · 반려(기간 경과)' : pending ? ' · 승인대기' : '';
    const tip = `${h.name}${h.source === 'public' ? ' · 공휴일' : ''}${stateTip}${h.memo ? ' · ' + h.memo : ''}`;
    const cls = 'hol-chip' + (voided ? ' hol-chip--voided' : pending ? ' hol-chip--pending' : '');
    const wait = voided ? '<span class="hol-chip__wait hol-chip__wait--void">반려</span>'
      : pending ? '<span class="hol-chip__wait">승인대기</span>' : '';
    const tag = editable ? 'button' : 'span';
    const attr = editable ? ` type="button" data-hol-chip="${esc(h.id)}"` : ' style="cursor:default;"';
    return `<${tag} class="${cls}"${attr} title="${esc(tip)}">${wait}<span class="hol-chip__name">${esc(h.name)}</span></${tag}>`;
  }

  /* ----- 월간 캘린더 ----- */
  function renderHolMonth() {
    const y = +STATE.holYm.slice(0, 4), m = +STATE.holYm.slice(5, 7);
    const days = holDaysInMonth(y, m);
    const lead = new Date(y, m - 1, 1).getDay();
    const editable = STATE.holEditMode;
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push('<div class="att-cal__cell att-cal__cell--blank"></div>');
    for (let d = 1; d <= days; d++) {
      const ds = `${y}-${pad2(m)}-${pad2(d)}`;
      const wd = new Date(y, m - 1, d).getDay();
      const wdCls = wd === 0 ? 'is-sun' : wd === 6 ? 'is-sat' : '';
      const today = ds === NOW_DATE ? 'is-today' : '';
      const past = isPastDate(ds);
      const h = holidayOn(ds);
      const canEdit = editable && !past;   /* 지난 날짜는 편집 모드라도 추가·수정 불가(읽기 전용) */
      const lockedNow = editable && past;
      cells.push(`
        <div class="att-cal__cell ${canEdit ? 'att-cal__cell--addable' : ''} ${lockedNow ? 'att-cal__cell--locked' : ''} ${wdCls} ${today} ${h ? 'att-cal__cell--hol' : ''}" ${canEdit ? `data-hol-cell="${ds}"` : ''}>
          <div class="att-cal__day-row"><span class="att-cal__day">${d}</span>${lockedNow ? '<span class="hol-lock" title="지난 날짜 — 수정할 수 없습니다">🔒</span>' : ''}</div>
          ${h ? holChipHTML(h, canEdit) : (canEdit ? '<span class="att-cal__add">+ 휴일</span>' : '')}
        </div>`);
    }
    const trail = (7 - ((lead + days) % 7)) % 7;
    for (let i = 0; i < trail; i++) cells.push('<div class="att-cal__cell att-cal__cell--blank"></div>');
    return `
      <div class="att-cal">
        <div class="att-cal__weekdays">
          ${WEEKDAYS.map((w, i) => `<div class="att-cal__wd ${i === 0 ? 'is-sun' : ''} ${i === 6 ? 'is-sat' : ''}">${w}</div>`).join('')}
        </div>
        <div class="att-cal__grid">${cells.join('')}</div>
      </div>`;
  }

  /* ----- 연간 그리드 (가로 1~12월 / 세로 1~31일) ----- */
  function renderHolYear() {
    const year = +STATE.holYm.slice(0, 4);
    const editable = STATE.holEditMode;
    const head = `<th class="lp-year__daycol">일</th>` + HOL_MONTH_LABELS.map(ml => `<th>${ml}</th>`).join('');
    let rows = '';
    for (let d = 1; d <= 31; d++) {
      let tds = `<th class="lp-year__daycol">${d}</th>`;
      for (let m = 1; m <= 12; m++) {
        if (d > holDaysInMonth(year, m)) { tds += '<td class="lp-year__cell lp-year__cell--na"></td>'; continue; }
        const ds = `${year}-${pad2(m)}-${pad2(d)}`;
        const wd = new Date(year, m - 1, d).getDay();
        const weCls = wd === 0 ? ' lp-year__cell--sun' : wd === 6 ? ' lp-year__cell--sat' : '';
        const todayCls = ds === NOW_DATE ? ' is-today' : '';
        const todayTag = ds === NOW_DATE ? '<span class="lp-year__today">오늘</span>' : '';
        const past = isPastDate(ds);
        const canEdit = editable && !past;   /* 지난 날짜는 편집 모드라도 추가·수정 불가 */
        const locked = editable && past;
        const lockCls = locked ? ' lp-year__cell--locked' : '';
        const lockIco = locked ? '<span class="lp-year__lock" title="지난 날짜 — 수정할 수 없습니다">🔒</span>' : '';
        const h = holidayOn(ds);
        if (!h) { tds += `<td class="lp-year__cell${weCls}${todayCls}${lockCls}" ${canEdit ? `data-hol-cell="${ds}" style="cursor:pointer;"` : ''}>${todayTag}${lockIco}</td>`; continue; }
        const pending = holIsPending(h), voided = holIsVoided(h);
        const holStateCls = voided ? ' lp-year__cell--holvoid' : pending ? ' lp-year__cell--holpending' : '';
        const stateTip = voided ? ' · 반려(기간 경과)' : pending ? ' · 승인대기' : '';
        tds += `<td class="lp-year__cell lp-year__cell--hol${holStateCls}${todayCls}${lockCls}" ${canEdit ? `data-hol-chip="${esc(h.id)}"` : 'style="cursor:default;"'} title="${esc(h.name)}${stateTip}${locked ? ' · 수정 불가' : ''}">${todayTag}<span class="lp-year__holnm">${locked ? '🔒 ' : ''}${esc(h.name)}</span></td>`;
      }
      rows += `<tr>${tds}</tr>`;
    }
    return `
      <div class="lp-year">
        <table class="lp-year__tbl">
          <thead><tr>${head}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderHoliday() {
    const isYear = STATE.holView === 'year';
    const body = isYear ? renderHolYear() : renderHolMonth();
    const editbar = STATE.holEditMode
      ? `<div class="hol-editbar">✎ <span>편집 중입니다. 휴일을 추가·수정·삭제한 뒤 우측 상단 <strong>[적용]</strong>을 누르면 <strong>전자결재 승인 요청</strong>으로 상신됩니다.</span></div>`
      : '';
    /* 구조: 툴바(고정) + 편집배너(고정) + hol-body(유일한 스크롤 영역).
       월간은 여백 유지, 연간은 여백/라운드 제거로 그리드가 본문을 꽉 채움. */
    return `${renderHolToolbar()}${editbar}
      <div class="hol-body${isYear ? ' hol-body--year' : ''}" style="flex:1;min-height:0;overflow:auto;">
        ${body}
      </div>`;
  }

  /* ----- 공휴일 일괄 적용 ----- */
  function applyPublicHolidays() {
    const year = +STATE.holYm.slice(0, 4);
    const store = holStore();
    const pubs = krPublicHolidays(year);
    let added = 0, dup = 0, past = 0;
    pubs.forEach(p => {
      if (isPastDate(p.date)) { past++; return; }               /* 지난 날짜는 소급 불러오기 제외 */
      if (store.some(h => h.date === p.date)) { dup++; return; }
      store.push({ id: newHolId(p.date), date: p.date, name: p.name, source: 'public', memo: '법정공휴일(자동 등록)' });
      added++;
    });
    let msg = `${year}년 공휴일 ${added}건을 불러왔습니다. [적용] 시 저장됩니다.`;
    const ex = [];
    if (dup) ex.push(`이미 등록 ${dup}건`);
    if (past) ex.push(`지난 날짜 ${past}건`);
    if (ex.length) msg += ` (${ex.join(' · ')} 제외)`;
    window.toast && window.toast(msg, 'info');
    if (!HOL_LUNAR[year]) window.toast && window.toast(`${year}년 음력 공휴일(설날·추석·부처님오신날)은 데이터가 없어 양력 공휴일만 불러왔습니다.`, 'warning');
    rerenderHoliday();
  }

  /* ----- 휴일 등록/수정 모달 ----- */
  function ensureHolModal() {
    if (document.getElementById('hol-modal')) return;
    const el = document.createElement('div');
    el.className = 'modal-backdrop';
    el.id = 'hol-modal';
    el.style.zIndex = '1200';
    el.innerHTML = `
      <div class="modal" style="width:94vw;max-width:520px;max-height:88vh;display:flex;flex-direction:column;">
        <div class="modal__header">
          <div class="modal__title" data-holm-title>휴일 추가</div>
          <button class="modal__close" type="button" data-holm-close aria-label="닫기">✕</button>
        </div>
        <div class="modal__body" data-holm-body style="flex:1;min-height:0;overflow:auto;padding:18px 20px;"></div>
        <div class="offcanvas__footer offcanvas__footer--between" style="padding:12px 20px;border-top:1px solid var(--color-divider);">
          <span class="t-muted" style="font-size:var(--fs-xs);">하루에 한 개의 휴일만 등록할 수 있습니다.</span>
          <div style="display:flex;gap:8px;">
            <button class="btn btn--sm btn--soft-danger" type="button" data-holm-del style="display:none;">삭제</button>
            <button class="btn btn--sm" type="button" data-holm-close>취소</button>
            <button class="btn btn--sm btn--primary" type="button" data-holm-save>등록</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    bindHolModal();
  }
  function renderHolModalBody() {
    const editing = STATE.holEditId ? holidayById(STATE.holEditId) : null;
    const date = editing ? editing.date : (STATE.holAddDate || NOW_DATE);
    const name = editing ? editing.name : '';
    const memo = editing ? editing.memo : '';
    const isPublic = !!(editing && editing.source === 'public');
    return `
      <div class="fm-tbl fm-tbl--form">
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label">휴일명 <em style="color:var(--color-danger);">*</em></div>
          <div class="fm-tbl__value"><input class="input" type="text" data-hol-name maxlength="40" value="${esc(name)}" placeholder="예: 창립기념일"></div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label">일자 <em style="color:var(--color-danger);">*</em></div>
          <div class="fm-tbl__value"><input class="input" type="date" data-hol-date value="${esc(date)}" min="${NOW_DATE}" style="max-width:200px;"></div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label">비고</div>
          <div class="fm-tbl__value"><textarea class="input" data-hol-memo rows="2" style="height:56px;min-height:56px;resize:vertical;" placeholder="메모(선택)">${esc(memo)}</textarea></div>
        </div>
        ${isPublic ? '<div class="fm-tbl__row fm-tbl__row--1"><div class="fm-tbl__label">종류</div><div class="fm-tbl__value"><span class="pill pill--info">법정공휴일</span></div></div>' : ''}
      </div>`;
  }
  function openHolModal(opts) {
    ensureHolModal();
    opts = opts || {};
    STATE.holEditId = opts.id || null;
    STATE.holAddDate = opts.date || null;
    const m = document.getElementById('hol-modal');
    const editing = STATE.holEditId ? holidayById(STATE.holEditId) : null;
    m.querySelector('[data-holm-title]').textContent = editing ? '휴일 수정' : '휴일 추가';
    m.querySelector('[data-holm-body]').innerHTML = renderHolModalBody();
    m.querySelector('[data-holm-del]').style.display = editing ? '' : 'none';
    m.querySelector('[data-holm-save]').textContent = editing ? '수정' : '등록';
    App.Forms && App.Forms.applyOnInput && App.Forms.applyOnInput(m);
    m.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeHolModal() {
    const m = document.getElementById('hol-modal');
    if (m) m.classList.remove('is-open');
    if (!document.querySelector('.modal-backdrop.is-open')) document.body.style.overflow = '';
  }
  function saveHoliday() {
    const m = document.getElementById('hol-modal');
    const nameEl = m.querySelector('[data-hol-name]');
    const dateEl = m.querySelector('[data-hol-date]');
    const memoEl = m.querySelector('[data-hol-memo]');
    App.Forms && App.Forms.clearAll && App.Forms.clearAll(m);
    const name = (nameEl.value || '').trim();
    const date = (dateEl.value || '').trim();
    let ok = true;
    if (!name) { App.Forms.setFieldError(nameEl, '휴일명을 입력해 주세요.'); ok = false; }
    if (!date) { App.Forms.setFieldError(dateEl, '일자를 선택해 주세요.'); ok = false; }
    if (date && isPastDate(date)) { App.Forms.setFieldError(dateEl, '지난 날짜에는 휴일을 설정할 수 없습니다. 오늘 이후 날짜를 선택해 주세요.'); ok = false; }
    if (date && !isPastDate(date)) {
      const dup = holStore().find(h => h.date === date && h.id !== STATE.holEditId);
      if (dup) { App.Forms.setFieldError(dateEl, `${date} 에는 이미 「${dup.name}」 휴일이 등록되어 있습니다. 하루에 한 개만 등록할 수 있습니다.`); ok = false; }
    }
    if (!ok) return;
    const memo = (memoEl.value || '').trim();
    if (STATE.holEditId) {
      const h = holidayById(STATE.holEditId);
      if (h) { h.date = date; h.name = name; h.memo = memo; }
      window.toast && window.toast(`「${name}」 휴일을 수정했습니다. [적용] 시 저장됩니다.`, 'info');
    } else {
      holStore().push({ id: newHolId(date), date: date, name: name, source: 'company', memo: memo });
      window.toast && window.toast(`「${name}」 휴일을 추가했습니다. [적용] 시 저장됩니다.`, 'info');
    }
    STATE.holYm = date.slice(0, 7);   /* 등록/수정한 달이 보이도록 조회 월 이동 */
    closeHolModal();
    rerenderHoliday();
  }
  function deleteHoliday() {
    const h = holidayById(STATE.holEditId);
    if (!h) { closeHolModal(); return; }
    const store = holStore();
    const idx = store.findIndex(x => x.id === h.id);
    if (idx >= 0) store.splice(idx, 1);   /* holDraft 를 제자리 변경(참조 유지) */
    window.toast && window.toast(`「${h.name}」 휴일을 삭제했습니다. [적용] 시 저장됩니다.`, 'info');
    closeHolModal();
    rerenderHoliday();
  }
  function bindHolModal() {
    const m = document.getElementById('hol-modal');
    if (!m || m.dataset.bound) return;
    m.dataset.bound = '1';
    m.addEventListener('click', e => {
      if (e.target === m || e.target.closest('[data-holm-close]')) { closeHolModal(); return; }
      if (e.target.closest('[data-holm-save]')) { saveHoliday(); return; }
      if (e.target.closest('[data-holm-del]')) { deleteHoliday(); return; }
    });
  }

  /* ----- 공유 API — 휴일(근무일/급여 산정에서 참조) ----- */
  App.AttHolidays = {
    /* year 지정 시 해당 연도만, 없으면 전체. 날짜 오름차순. */
    list(year) {
      const arr = year ? STATE.holidays.filter(h => h.date.slice(0, 4) === String(year)) : STATE.holidays.slice();
      return arr.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    },
    get(dateStr) { return holidayOn(dateStr); },
    /* 휴일 여부 — 승인(approved)된 휴일만 효력. 승인대기/반려는 근무일(소정근로일) 산정에 미반영. */
    isHoliday(dateStr) { const h = holidayOn(dateStr); return !!(h && h.status !== 'pending'); },
    /* 승인대기(전자결재 결과 미확정) 여부 */
    isPending(dateStr) { return holIsPending(holidayOn(dateStr)); },
    /* 반려(void) 여부 — 승인대기인 채로 날짜가 지남 → 승인 나도 휴일 아님(위 휴일 승인 정책 3항) */
    isVoided(dateStr) { return holIsVoided(holidayOn(dateStr)); },
  };

  /* ============ 근무정책 설정 (page-att-work-policy) ============ */
  function renderWpBody() {
    if (STATE.wpTab === 'shift') return renderShift();
    if (STATE.wpTab === 'holiday') return renderHoliday();
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

      /* ===== 휴일 관리 탭 ===== */
      const hv = e.target.closest('[data-hol-view]');
      if (hv) { STATE.holView = hv.dataset.holView; renderWpAll(pageEl); return; }
      if (e.target.closest('[data-hol-prev]')) { moveHol(-1); renderWpAll(pageEl); return; }
      if (e.target.closest('[data-hol-next]')) { moveHol(1); renderWpAll(pageEl); return; }
      if (e.target.closest('[data-hol-today]')) { STATE.holYm = NOW_DATE.slice(0, 7); renderWpAll(pageEl); return; }
      /* 편집 모드 전환/저장 */
      if (e.target.closest('[data-hol-edit]')) { enterHolEdit(); return; }
      if (e.target.closest('[data-hol-save]')) { applyHolEdit(); return; }
      if (e.target.closest('[data-hol-cancel]')) { cancelHolEdit(); return; }
      if (e.target.closest('[data-hol-apply-public]')) { applyPublicHolidays(); return; }
      if (e.target.closest('[data-hol-add]')) {
        const ym = STATE.holView === 'year' ? (STATE.holYm.slice(0, 4) + '-01') : STATE.holYm;
        const cand = ym === NOW_DATE.slice(0, 7) ? NOW_DATE : ym + '-01';
        openHolModal({ date: isPastDate(cand) ? NOW_DATE : cand });   /* 지난 달을 보고 있으면 오늘로 기본값 */
        return;
      }
      const hchip = e.target.closest('[data-hol-chip]');
      if (hchip) { openHolModal({ id: hchip.dataset.holChip }); return; }
      const hcell = e.target.closest('[data-hol-cell]');
      if (hcell) {
        const h = holidayOn(hcell.dataset.holCell);
        if (h) openHolModal({ id: h.id }); else openHolModal({ date: hcell.dataset.holCell });
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
    /* 휴일 관리 — 연/월 피커(App.YmPicker) 월 선택 */
    pageEl.addEventListener('ympick:change', e => {
      if (e.detail && e.detail.name === 'hol') { STATE.holYm = e.detail.ym; renderWpAll(pageEl); }
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

  const prev = App.initPages;
  App.initPages = function () {
    if (typeof prev === 'function') prev();
    initWorkPolicyPage();
  };
})();
