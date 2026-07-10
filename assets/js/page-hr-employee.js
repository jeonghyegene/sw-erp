/* =========================================================
 * Page: HR > 인사 정보 > 인사 관리
 *   SCR-EMP-01 인사 관리 메인 (조직 트리 + 카드뷰)
 *   SCR-EMP-02 인사카드 상세 (탭형 — 권한별 섹션)
 *   SCR-EMP-03 인사정보 수정 요청 (모달)
 *   SCR-EMP-05 PDF 출력 옵션 (모달)
 *
 *  UI Kit 컴포넌트 재사용:
 *   .tree.tree--selectable, .tree__count       (조직 트리)
 *   .split, .split__left/__right/__head/__body (좌·우 분할 레이아웃)
 *   .user-cards / .user-card / .av             (사원 카드 그리드)
 *   .chk                                       (재직자 토글 칩)
 *   .tabs--underline                           (인사카드 상세 탭)
 *   .tbl tbl--striped tbl--hover               (학력/자격/가족/급여 등 표)
 *   .form-field, .form-label, .input--full     (Base Input — 수정 요청)
 *   .dz, .dz__icon                             (증빙 첨부)
 *   .pill, --info/--warning/--success/--danger (수정요청 상태 뱃지)
 *   .modal, .modal--lg                         (수정요청/PDF 모달)
 *   .chk, .check-group                         (PDF 섹션 체크박스/칩)
 *   .pagination                                (카드 그리드 페이지네이션)
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  /* ============ 권한 mock ============ */
  // 데모: 현재 로그인 사용자 역할
  //  hr_admin = 인사담당자, exec = 임원/경영진, manager = 부서장/팀장, employee = 일반사원
  const CURRENT_ROLE = 'hr_admin';  // 기본 인사담당자 (데모)
  const CURRENT_USER_ID = 'E001';   // 일반사원 모드일 때 본인 한정 조회 기준

  const ROLE = {
    canViewAll:        () => CURRENT_ROLE === 'hr_admin' || CURRENT_ROLE === 'exec',
    canViewSensitive:  () => CURRENT_ROLE === 'hr_admin',
    canViewPayroll:    () => CURRENT_ROLE === 'hr_admin' || CURRENT_ROLE === 'exec',
    canEditAll:        () => CURRENT_ROLE === 'hr_admin',
    canEditLimited:    () => CURRENT_ROLE === 'employee',
    canApprove:        () => CURRENT_ROLE === 'manager' || CURRENT_ROLE === 'hr_admin',
    canPrintPDF:       () => CURRENT_ROLE === 'hr_admin' || CURRENT_ROLE === 'exec',
    canViewHistory:    () => CURRENT_ROLE === 'hr_admin' || CURRENT_ROLE === 'manager',
  };

  /* ============ Mock 데이터 ============ */
  // 부서 트리 (page-hr-org 의 트리 구조와 유사)
  /* 부서 트리 — 조직 관리(page-hr-org.js) 와 동일한 ID/타입 체계를 사용.
     root → hq(본부) → part(팀), 회사 직속 team 도 동일. 아이콘은 typeIcon 매핑에 위임. */
  const DEPTS = [
    { id: 'C0',  parentId: null, name: '(주)성원애드피아', type: 'root', active: true },
    { id: 'T1',  parentId: 'C0', name: '경영지원본부',     type: 'hq',   active: true },
    { id: 'T2',  parentId: 'C0', name: '생산본부',          type: 'hq',   active: true },
    { id: 'T3',  parentId: 'C0', name: '개발팀',            type: 'team', active: true },
    { id: 'T4',  parentId: 'C0', name: '홍보팀',            type: 'team', active: true },
    { id: 'P11', parentId: 'T1', name: '인사팀',            type: 'part', active: true },
    { id: 'P12', parentId: 'T1', name: '재무팀',            type: 'part', active: true },
    { id: 'P13', parentId: 'T1', name: '총무팀',            type: 'part', active: true },
    { id: 'P21', parentId: 'T2', name: '생산1팀',           type: 'part', active: true },
    { id: 'P22', parentId: 'T2', name: '품질팀',            type: 'part', active: true },
    /* 비활성화 부서 데모 — '비활성화 부서 보기' 체크 시에만 트리에 노출 */
    { id: 'P14', parentId: 'T1', name: '구매파트',          type: 'part', active: false },
  ];
  /* 입사자 관리 dept(한글) → 본 화면 deptId 매핑 — 조직관리 deptNameToId 와 일치 */
  const DEPT_NAME_TO_ID = {
    '경영지원본부': 'T1',
    '생산본부':     'T2',
    '개발팀':       'T3',
    '홍보팀':       'T4',
    '인사팀':       'P11',
    '재무팀':       'P12',
    '총무팀':       'P13',
    '생산1팀':      'P21',
    '품질팀':       'P22',
  };

  /* 직원 데이터 — 임직원 관리(App.HRInfoMgmt) 가 단일 소스.
   *   임직원 관리와 동일한 직원 마스터(임금/휴직/작성중 등 풍부한 상태 포함)를 공유한다.
   *   info-mgmt 미로드 시 App.HRMembers 로 폴백.
   *   ...m spread 로 원본 모든 필드 보존 (docsSent / docsSentDate / contractSentDate / status 등도 함께).
   *   인사관리 전용 추가 필드(deptId/photo/color/address/emergency) 만 합성. */
  function makeEmployees() {
    const useMgmt = !!(window.App && App.HRInfoMgmt && App.HRInfoMgmt.list);
    let members = useMgmt ? App.HRInfoMgmt.list()
                : (window.App && App.HRMembers && App.HRMembers.list) ? App.HRMembers.list()
                : [];
    /* 임직원 현황 카드 등록 자격 필터 — 계정 등록완료 + 근로계약 서명완료(유효, 만료 임박 포함).
       도급직은 근로계약 해당없음이라 계정 등록만으로 대상. (자격 헬퍼 미로드 시 폴백: 전체 노출) */
    if (useMgmt && typeof App.HRInfoMgmt.canRegisterCard === 'function') {
      members = members.filter(m => App.HRInfoMgmt.canRegisterCard(m));
    }
    return members.map((m, i) => {
      const deptId = DEPT_NAME_TO_ID[m.dept] || 'C0';
      const dept = DEPTS.find(d => d.id === deptId);
      const seed = Number(String(m.id || '').slice(-2)) || (i + 1);
      /* 사진은 입사자 관리 마스터(m.photoUrl) 가 단일 소스 — 모든 화면 동일.
       *   누락 시 이니셜 + 색상 placeholder 가 자동 렌더 (외국인 stock 사진 fallback 제거). */
      const photo = m.photoUrl || '';
      return Object.assign({}, m, {
        deptId,
        deptName:  dept ? dept.name : (m.dept || ''),
        active:    m.status !== 'retired',
        birth:     m.birth || '1990-01-' + String(1 + (seed % 28)).padStart(2, '0'),
        address:   '서울특별시 강남구 테헤란로 ' + (100 + (seed % 200)),
        emergency: `010-${String(3000 + (seed * 29 % 6999)).padStart(4,'0')}-${String(2000 + (seed * 41 % 7999)).padStart(4,'0')}`,
        color:     ((seed % 6) + 1),
        photo,
      });
    });
  }

  /* ============ 수정 요청 mock ============ */
  function makeRequests(emps) {
    const fields = [
      { key: 'address', label: '주소' },
      { key: 'phone',   label: '연락처' },
      { key: 'emergency', label: '긴급연락처' },
    ];
    const statuses = ['pending', 'approved', 'rejected', 'withdrawn', 'onhold'];
    const today = new Date();
    return emps.slice(0, 18).map((e, i) => {
      const f = fields[i % fields.length];
      const st = statuses[i % statuses.length];
      const reqDate = new Date(today.getTime() - (i * 86400000 * 0.7));
      const elapsed = Math.floor((today.getTime() - reqDate.getTime()) / 86400000);
      return {
        reqNo: 'REQ' + String(20260500 + i).padStart(8, '0'),
        empId: e.id,
        empName: e.name,
        field: f.key,
        fieldLabel: f.label,
        before: e[f.key],
        after: (f.key === 'phone' || f.key === 'emergency')
                ? '010-' + String(9000 + i).padStart(4, '0') + '-' + String(1000 + i).padStart(4, '0')
                : '경기도 성남시 분당구 판교로 ' + (200 + i),
        reason: '본인 정보 변경에 따른 인사카드 수정 요청',
        reqDate: reqDate.toISOString().slice(0, 10),
        elapsed,
        status: st,
        rejectReason: st === 'rejected' ? '증빙 자료 부족' : '',
        escalated: st === 'pending' && elapsed > 5,
      };
    });
  }

  const STATE = {
    employees: [],
    requests:  [],
    selectedDeptId: 'C0',
    showInactive: false,
    keyword: '',
    leftCollapsed: false,             // 좌측 조직도 패널 접힘 여부
    favorites: new Set(),             // 즐겨찾기 한 사원 id (mock — 페이지 reload 시 초기화)
    showOnlyFav: false,               // 즐겨찾기만 보기 토글
    showOnlyOutsource: false,         // 도급직만 보기 토글
    selectedEmpId: null,
    activeTab: 'public',              // public | private (drawer 탭)
    currentEditField: '',             // SCR-EMP-03 modal context
  };

  /* ============ 헬퍼 ============ */
  function $(s, r=document) { return r.querySelector(s); }
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  /* 표시 전용 날짜 포맷 — ISO(YYYY-MM-DD) → YY/MM/DD (SWADPIA §1). 데이터 key/비교/정렬엔 사용 금지. */
  function dispYmd(s) {
    if (!s) return s;
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1].slice(2)}/${m[2]}/${m[3]}` : String(s);
  }
  function children(parentId) {
    return DEPTS.filter(d => d.parentId === parentId && (STATE.showInactive || d.active !== false));
  }
  function findDept(id) { return DEPTS.find(d => d.id === id); }
  function findEmp(id)  { return STATE.employees.find(e => e.id === id); }

  // 부서 + 하위 부서의 모든 사원
  function getEmpsInDept(deptId) {
    if (deptId === 'C0') return STATE.employees.slice();
    const all = new Set([deptId]);
    function collect(id) { children(id).forEach(c => { all.add(c.id); collect(c.id); }); }
    collect(deptId);
    return STATE.employees.filter(e => all.has(e.deptId));
  }

  /* ============ 트리 렌더 ============
     아이콘 매핑은 조직 관리(page-hr-org.js) 와 동일 — root=🏢 / hq=🏛️ / team=👥 / part=📄 */
  function typeIcon(type) {
    if (type === 'root') return '🏢';
    if (type === 'hq')   return '🏛️';
    if (type === 'team') return '👥';
    if (type === 'part') return '📄';
    return '📄';
  }
  function renderTreeHTML(rootId) {
    const root = findDept(rootId);
    if (!root) return '';
    const cnt = STATE.employees.length;
    return `<li class="tree__node is-open${STATE.selectedDeptId === root.id ? ' is-selected' : ''}" data-id="${root.id}" data-type="${esc(root.type)}">
      <div class="tree__row">
        <span class="tree__toggle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span>
        <span class="tree__icon">${typeIcon(root.type)}</span>
        <span class="tree__label">${esc(root.name)} <span class="tree__count">전체 ${cnt}명</span></span>
      </div>
      <ul>${children(rootId).map(renderTreeNode).join('')}</ul>
    </li>`;
  }
  function renderTreeNode(d) {
    const kids = children(d.id);
    const hasKids = kids.length > 0;
    const empCnt = getEmpsInDept(d.id).length;
    const cls = ['tree__node',
      !hasKids ? 'is-leaf' : 'is-open',
      STATE.selectedDeptId === d.id ? 'is-selected' : '',
      d.active === false ? 'is-inactive' : ''
    ].filter(Boolean).join(' ');
    const inactiveTag = d.active === false ? ' <span class="pill pill--soft-gray" style="font-size:10px;">비활성</span>' : '';
    return `<li class="${cls}" data-id="${d.id}" data-type="${esc(d.type)}" style="${d.active === false ? 'opacity:0.55;' : ''}">
      <div class="tree__row">
        <span class="tree__toggle">${hasKids ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>' : ''}</span>
        <span class="tree__icon">${typeIcon(d.type)}</span>
        <span class="tree__label">${esc(d.name)}${inactiveTag} <span class="tree__count">${empCnt}명</span></span>
      </div>
      ${hasKids ? `<ul>${kids.map(renderTreeNode).join('')}</ul>` : ''}
    </li>`;
  }

  /* ============ SCR-EMP-01 메인 (조직 트리 + 부서 가로 스크롤 카드뷰) ============
   *  - 좌측 조직도 패널은 .split--collapsible 로 접기/펼치기 가능
   *  - 우측은 .dept-scroll 가로 스크롤 컨테이너 안에 부서별 .dept-strip 컬럼
   *  - 좌측 트리 선택 시 해당 부서 strip 으로 가로 앵커 스크롤 + 강조
   *  - 카드는 UI Kit .hr-card (밸런스형 인사카드) 사용
   * ============================================================ */

  /* SVG 아이콘 (전역 1회 정의) */
  const ICON_PHONE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.63 2.61a2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6.09 6.09l1.47-1.29a2 2 0 0 1 2.11-.45c.84.3 1.71.51 2.61.63A2 2 0 0 1 22 16.92z"/></svg>`;
  const ICON_MAIL  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="m22 6-10 7L2 6"/></svg>`;
  const ICON_CHEVRON_L = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
  const ICON_CHEVRON_R = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

  // 우측에 strip 으로 노출할 leaf-level 부서 (자식 없는 부서 + 'team' 타입)
  function getStripDepts() {
    return DEPTS.filter(d => d.type !== 'root' && children(d.id).length === 0);
  }
  // 트리에서 선택된 노드 → 앵커할 strip 부서 결정
  function resolveTargetStrip(deptId) {
    const strips = getStripDepts();
    if (!strips.length) return null;
    const direct = strips.find(s => s.id === deptId);
    if (direct) return direct;
    // 본부/루트 선택 시 — 첫 자식 leaf
    if (deptId === 'C0') return strips[0];
    // 자식 strip 부서 중 첫 번째
    const kids = children(deptId);
    const firstKidStrip = kids.find(k => strips.some(s => s.id === k.id));
    return firstKidStrip || strips[0];
  }
  function matchesKeyword(e) {
    if (!STATE.keyword) return true;
    const kw = STATE.keyword.toLowerCase();
    return e.name.toLowerCase().includes(kw) || e.id.toLowerCase().includes(kw);
  }

  function buildMainView(pageEl) {
    pageEl.innerHTML = `
      <div class="split split--collapsible is-left-collapsed" id="hr-emp-split" style="--split-left:280px; height:100%;">
        <aside class="split__left">
          <div class="split__head">
            <h3>조직도</h3>
            <div style="flex:1"></div>
            <button class="split__collapser" type="button" data-split-collapse="hr-emp-split" title="조직도 접기">
              ${ICON_CHEVRON_L}
            </button>
          </div>
          <div class="split__body" style="display:flex;flex-direction:column;padding:0;">
            <ul class="tree tree--selectable" id="hr-emp-tree" style="flex:1;overflow:auto;padding:8px 10px;margin:0;"></ul>
          </div>
        </aside>
        <section class="split__right" style="min-width:0;overflow:hidden;">
          <div class="split__head">
            <button class="split__expander" type="button" data-split-expand="hr-emp-split" title="조직도 펼치기">
              <span>조직도</span>${ICON_CHEVRON_R}
            </button>
            <h3 id="hr-emp-dept-title" style="min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">전체</h3>
            <div style="flex:1"></div>
            <span class="toolbar__count" style="font-size:var(--fs-sm);color:var(--color-text-muted);white-space:nowrap;">총 <span data-emp-count><strong>0</strong>명</span></span>
            <input class="input input--search" type="text" id="hr-emp-keyword" placeholder="성명·사원번호 검색" />
            <label class="chk">
              <input type="checkbox" id="hr-emp-fav-only" />
              <span>즐겨찾기</span>
            </label>
            <label class="chk">
              <input type="checkbox" id="hr-emp-outsource-only" />
              <span>도급직</span>
            </label>
            <div style="display:inline-flex;gap:4px;margin-left:4px;">
              <button class="split__collapser" type="button" data-strip-scroll="-1" title="이전 부서로">${ICON_CHEVRON_L}</button>
              <button class="split__collapser" type="button" data-strip-scroll="1" title="다음 부서로">${ICON_CHEVRON_R}</button>
            </div>
          </div>
          <div class="split__body" style="padding:0;overflow:hidden;min-width:0;min-height:0;">
            <div class="dept-scroll" id="hr-emp-strips"></div>
          </div>
        </section>
      </div>
    `;
    bindMain(pageEl);
    renderMainAll();
    applyMobileSplitState(pageEl);  /* 모바일 진입 시 트리 자동 닫기 */
  }

  /* 모바일 폭(<=768px) 이면 좌측 조직도를 자동으로 접고,
   *   resize 로 데스크탑↔모바일 전환 시에도 일관 동작. */
  const MOBILE_BP = 768;
  /* CSS 미디어쿼리(max-width:768px)와 동일 기준으로 판정.
     window.innerWidth 는 세로 스크롤바 폭을 포함해 CSS 뷰포트 기준과 어긋나는 경계 구간이 생기는데,
     그 구간에서 CSS 는 모바일(드로어=position:absolute)인데 JS 가 데스크톱으로 오판하면
     is-left-collapsed 가 풀려 열린 드로어가 카드 위를 덮는 클릭 차단 사고가 난다. */
  function isMobileWidth() { return window.matchMedia('(max-width: ' + MOBILE_BP + 'px)').matches; }
  /* 좌측 조직도 상태를 폭에 맞춰 양방향 동기화.
     - 모바일: is-left-collapsed 유지(드로어 닫힘 → 카드 위를 덮지 않음)
     - 데스크톱: is-left-collapsed 제거(트리 상시 노출)
     마크업 기본값이 is-left-collapsed(닫힘) 라, JS 가 못 돌아도 드로어가 카드를 덮지 않는다. */
  function applyMobileSplitState(pageEl) {
    const root = pageEl ? pageEl.querySelector('#hr-emp-split') : document.getElementById('hr-emp-split');
    if (!root) return;
    if (isMobileWidth()) {
      root.classList.add('is-left-collapsed');
      STATE.leftCollapsed = true;
    } else {
      root.classList.remove('is-left-collapsed');
      STATE.leftCollapsed = false;
    }
  }
  /* 페이지 외부에서 한 번만 바인딩 — resize 시 모바일이면 접기 */
  if (!window.__hrEmpResizeBound) {
    window.__hrEmpResizeBound = true;
    window.addEventListener('resize', () => {
      const root = document.getElementById('hr-emp-split');
      if (!root) return;
      if (isMobileWidth() && !root.classList.contains('is-left-collapsed')) {
        root.classList.add('is-left-collapsed');
        STATE.leftCollapsed = true;
      }
      // 창 크기 변경 시 카드 세로 행 수 재계산 (가용 높이 변동 반영)
      applyStripRows();
    });
  }

  function bindMain(pageEl) {
    // split 접기/펼치기 + 가로 스크롤 보조 버튼 (ui-kit.js 가 main 앱에 로드되지 않으므로 자체 처리)
    pageEl.addEventListener('click', (e) => {
      const collapseBtn = e.target.closest('[data-split-collapse]');
      if (collapseBtn) {
        const root = $('#hr-emp-split', pageEl);
        if (root) {
          root.classList.add('is-left-collapsed');
          STATE.leftCollapsed = true;
        }
        return;
      }
      const expandBtn = e.target.closest('[data-split-expand]');
      if (expandBtn) {
        const root = $('#hr-emp-split', pageEl);
        if (root) {
          root.classList.remove('is-left-collapsed');
          STATE.leftCollapsed = false;
        }
        return;
      }
      // ◀ ▶ 화살표 — 이전/다음 부서 strip 으로 앵커 (한 부서씩 이동)
      const scrollBtn = e.target.closest('[data-strip-scroll]');
      if (scrollBtn) {
        const dir = Number(scrollBtn.dataset.stripScroll) || 1;
        gotoAdjacentStrip(dir);
      }
    });

    // 트리
    $('#hr-emp-tree', pageEl).addEventListener('click', (e) => {
      const li = e.target.closest('.tree__node');
      if (!li) return;
      if (e.target.closest('.tree__toggle') && !li.classList.contains('is-leaf')) {
        li.classList.toggle('is-open');
        return;
      }
      STATE.selectedDeptId = li.dataset.id;
      renderTreeOnly();
      const target = resolveTargetStrip(STATE.selectedDeptId);
      updateDeptTitle();
      scrollToStrip(target ? target.id : null);
      /* 모바일에서는 선택 후 트리(overlay) 자동 닫기 */
      if (isMobileWidth()) {
        const root = $('#hr-emp-split', pageEl);
        if (root) { root.classList.add('is-left-collapsed'); STATE.leftCollapsed = true; }
      }
    });
    /* 모바일 — 트리가 열려있을 때 우측(카드/backdrop) 클릭 시 트리 닫기.
     *   .split__right 위의 모든 클릭을 받되, 정상 데스크탑이면 무시. */
    const rightSection = pageEl.querySelector('#hr-emp-split .split__right');
    if (rightSection) {
      rightSection.addEventListener('click', (e) => {
        if (!isMobileWidth()) return;
        const root = $('#hr-emp-split', pageEl);
        if (!root || root.classList.contains('is-left-collapsed')) return;
        /* expander 버튼(트리 펼치기) 자체 클릭은 통과 */
        if (e.target.closest('[data-split-expand]')) return;
        root.classList.add('is-left-collapsed');
        STATE.leftCollapsed = true;
        e.stopPropagation();
      }, true);  /* capture — 카드 클릭 핸들러보다 먼저 받기 */
    }
    // 검색
    $('#hr-emp-keyword', pageEl).addEventListener('input', (e) => {
      STATE.keyword = e.target.value.trim();
      renderStrips();
    });
    // 즐겨찾기만 보기 토글
    $('#hr-emp-fav-only', pageEl).addEventListener('change', (e) => {
      STATE.showOnlyFav = e.target.checked;
      renderStrips();
    });
    // 도급직만 보기 토글
    $('#hr-emp-outsource-only', pageEl).addEventListener('change', (e) => {
      STATE.showOnlyOutsource = e.target.checked;
      renderStrips();
    });
    // 부서 관리 버튼 — Notion 스타일 부서 관리 모달 열기
    const deptMgrBtn = pageEl.querySelector('[data-emp-dept-manage]');
    if (deptMgrBtn) {
      deptMgrBtn.addEventListener('click', () => {
        if (typeof openDeptManageModal === 'function') openDeptManageModal();
      });
    }
    // 카드 클릭 → 인사카드 drawer (전화/메일 액션 영역 클릭은 제외)
    $('#hr-emp-strips', pageEl).addEventListener('click', (e) => {
      if (e.target.closest('[data-emp-action]')) return;
      if (e.target.closest('.hr-card__fav')) return;
      const card = e.target.closest('[data-emp-card]');
      if (!card) return;
      STATE.selectedEmpId = card.dataset.empCard;
      STATE.activeTab = 'public';
      openDetailDrawer(findEmp(card.dataset.empCard));
    });
    // 즐겨찾기 토글 — STATE.favorites 에 저장 (필터/유지)
    $('#hr-emp-strips', pageEl).addEventListener('click', (e) => {
      const fav = e.target.closest('.hr-card__fav');
      if (!fav) return;
      e.stopPropagation();
      const card = fav.closest('[data-emp-card]');
      if (!card) return;
      const id = card.dataset.empCard;
      if (STATE.favorites.has(id)) STATE.favorites.delete(id);
      else STATE.favorites.add(id);
      fav.classList.toggle('is-active');
      // 즐겨찾기만 필터 활성 상태에서 해제 시 즉시 사라지도록 strip 재렌더
      if (STATE.showOnlyFav) renderStrips();
    });

    // 마우스 휠 → 가로 스크롤 변환 (pageEl 위임)
    //  - 매번 buildMainView 가 innerHTML 을 갱신해도 pageEl 자체는 동일하므로 위임이 안정적
    //  - 일반 마우스 휠은 deltaY 만 발생 → 가로 스크롤 가능 시 scrollLeft 로 변환
    //  - 트랙패드 가로 스와이프 (deltaX 우세) 는 기본 동작 유지
    //  - deltaMode 별 단위 정규화 (LINE=1 → ~40px, PAGE=2 → clientWidth)
    if (!pageEl.__wheelBound) {
      pageEl.addEventListener('wheel', (e) => {
        const host = e.target.closest('#hr-emp-strips');
        if (!host) return;
        if (host.scrollWidth <= host.clientWidth + 1) return;
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        const dy = e.deltaY;
        if (dy === 0) return;
        e.preventDefault();
        const factor = e.deltaMode === 1 ? 40 : (e.deltaMode === 2 ? host.clientWidth : 1);
        host.scrollLeft += dy * factor;
      }, { passive: false });
      pageEl.__wheelBound = true;
    }
  }

  function renderMainAll() {
    renderTreeOnly();
    updateDeptTitle();
    renderStrips();
    // 초기 / 선택 변경 시 대상 strip 강조
    const target = resolveTargetStrip(STATE.selectedDeptId);
    if (target) highlightStrip(target.id);
  }
  function renderTreeOnly() {
    $('#hr-emp-tree').innerHTML = renderTreeHTML('C0');
  }
  function updateDeptTitle() {
    const dept = findDept(STATE.selectedDeptId);
    $('#hr-emp-dept-title').textContent = dept ? dept.name : '전체';
  }

  function getCardListInDept(deptId) {
    let list = getEmpsInDept(deptId);
    if (STATE.showOnlyFav) list = list.filter(e => STATE.favorites.has(e.id));
    if (STATE.showOnlyOutsource) list = list.filter(e => !!e.contractOut);
    list = list.filter(matchesKeyword);
    return list;
  }

  function renderStrips() {
    const strips = getStripDepts();
    const target = resolveTargetStrip(STATE.selectedDeptId);
    const targetId = target ? target.id : null;
    const html = strips.map(d => renderStripHTML(d, d.id === targetId)).join('');
    $('#hr-emp-strips').innerHTML = html;
    // 전체 사원 카운트 (선택 부서 기준)
    const total = getCardListInDept(STATE.selectedDeptId).length;
    $('[data-emp-count]').innerHTML = `<strong>${total.toLocaleString()}</strong>명`;
    // 카드 세로 stack 행 수를 가용 화면 높이에 맞춰 자동 산정 → 가로 스크롤 최소화
    applyStripRows();
    // 진입 직후 레이아웃이 아직 안 잡혔을 수 있어 다음 프레임에 1회 재계산
    requestAnimationFrame(applyStripRows);
  }

  /* dept-strip 한 열에 세로로 채울 카드 수를 가용 높이에 맞춰 계산.
   *  - .dept-strip__cards 의 grid-template-rows(기본 repeat(5,auto)) 를 inline 으로 override.
   *  - 데스크탑만 적용. 모바일(<=768px)은 CSS 미디어쿼리(세로 단일 stack) 를 그대로 두기 위해 inline 제거.
   *  - 측정 불가(페이지 비표시·카드 없음) 시엔 CSS 기본값(5행) 유지. */
  const STRIP_MIN_ROWS = 3;            // 너무 적게 잡혀 가로로만 늘어나는 것 방지
  const STRIP_ROW_GAP = 12;            // .dept-strip__cards 의 행 gap (gap: 12px 14px)
  const STRIP_HEAD_GAP = 10;           // .dept-strip head ↔ cards 간 gap
  const STRIP_BOTTOM_RESERVE = 16;     // 하단 가로 스크롤바(~10px)+여백 — 마지막 카드가 잘리지 않게
  function applyStripRows() {
    const host = $('#hr-emp-strips');
    if (!host) return;
    const cardsEls = host.querySelectorAll('.dept-strip__cards');
    if (!cardsEls.length) return;
    // 모바일은 CSS(세로 단일 stack)에 위임 — inline override 제거
    if (isMobileWidth()) {
      cardsEls.forEach(el => { el.style.gridTemplateRows = ''; });
      return;
    }
    const card = host.querySelector('.hr-card');
    const head = host.querySelector('.dept-strip__head');
    const cardH = card ? card.offsetHeight : 0;
    if (!cardH) return;                  // 카드 미측정 → CSS 기본값 유지
    // 가용 높이는 flex 높이 체인에 의존하지 않고 뷰포트 기준 절대 좌표로 잰다.
    //  - host(.dept-scroll) 는 height:auto(콘텐츠 기반)라 clientHeight 가 "현재 카드 높이"를 돌려주는
    //    자기참조 문제가 있고, 부모 .split__body 도 환경에 따라 콘텐츠 높이로 잡힐 수 있다.
    //  - host 의 화면상 top 부터 뷰포트 하단까지가 실제 카드가 쓸 수 있는 세로 공간.
    const hostTop = host.getBoundingClientRect().top;
    const availH = window.innerHeight - hostTop - STRIP_BOTTOM_RESERVE;
    if (availH <= 0) return;             // 비표시 → CSS 기본값 유지
    const headH = head ? head.offsetHeight : 0;
    const usable = availH - headH - STRIP_HEAD_GAP;
    // n*cardH + (n-1)*gap <= usable  →  n <= (usable+gap)/(cardH+gap)
    let rows = Math.floor((usable + STRIP_ROW_GAP) / (cardH + STRIP_ROW_GAP));
    rows = Math.max(STRIP_MIN_ROWS, rows);
    // repeat(N, auto) 를 인라인 style 로 주면 일부 브라우저 CSSOM 이 거부 → 트랙을 명시적으로 펼쳐서 적용.
    const tracks = Array(rows).fill('auto').join(' ');
    cardsEls.forEach(el => { el.style.gridTemplateRows = tracks; });
  }

  function renderStripHTML(dept, isTarget) {
    const emps = getCardListInDept(dept.id);
    const emptyMsg = STATE.keyword            ? '검색 결과 없음'
                    : STATE.showOnlyOutsource ? '도급직 사원 없음'
                    : STATE.showOnlyFav       ? '즐겨찾기한 사원 없음'
                    :                           '소속 사원 없음';
    const cardHTML = emps.length
      ? emps.map(renderHrCard).join('')
      : `<div class="dept-strip__empty">${emptyMsg}</div>`;
    return `
      <div class="dept-strip${isTarget ? ' is-target' : ''}" data-dept-id="${esc(dept.id)}">
        <div class="dept-strip__head">
          <span class="dept-strip__name">${esc(dept.name)}</span>
          <span class="dept-strip__count">${emps.length}</span>
        </div>
        <div class="dept-strip__cards">${cardHTML}</div>
      </div>
    `;
  }

  /* 근태 기반 현재 근무상태 — 사원의 "오늘" 출퇴근 상태를 표시.
   *   재직/퇴직(e.active) 과 무관하며, 근태에서 출근·퇴근 체크한 결과를 반영하는 자리.
   *   ⚠️ 데모: 사원별 결정적 mock. 실데이터 연동 시 사원별 오늘 근태 조회 API로 교체.
   *     예) App.Attendance.todayState(e.id) → 'in' | 'out' | 'absent' | 'leave' */
  function attendanceState(e) {
    const seed = String(e.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const m = seed % 10;
    if (m <= 5) return { label: '출근',  cls: 'hr-card__status--success' };  // 출근 체크 후 근무 중
    if (m <= 7) return { label: '퇴근',  cls: 'hr-card__status--muted' };    // 퇴근 체크 완료
    if (m === 8) return { label: '휴가', cls: 'hr-card__status--info' };     // 연차/휴가
    return { label: '미출근', cls: 'hr-card__status--warning' };             // 아직 출근 전
  }

  function renderHrCard(e) {
    const avatarInner = e.photo
      ? `<img src="${esc(e.photo)}" alt="${esc(e.name)}" />`
      : esc(e.name.charAt(0));
    const avatarCls = e.photo ? 'hr-card__avatar' : `hr-card__avatar av--c${e.color}`;
    // 카드뷰 상태 — 근태 기반 (출근/퇴근/미출근/휴가)
    const att = attendanceState(e);
    const statusCls = `hr-card__status ${att.cls}`;
    const statusLabel = att.label;
    const isWorking = att.label === '출근';   // 현재 근무 중 여부 (아바타 presence dot 기준)
    // 직위·직책을 가운뎃점(·)으로 묶어 단일 chip 으로 표시
    const rankPosition = e.position ? `${esc(e.rank)} · ${esc(e.position)}` : esc(e.rank);
    const favActive = STATE.favorites.has(e.id) ? ' is-active' : '';
    const outsourceChip = e.contractOut ? '<span class="hr-card__chip hr-card__chip--outsource" title="도급직">도급</span>' : '';
    return `
      <div class="hr-card" data-emp-card="${esc(e.id)}">
        <div class="${avatarCls}">
          ${avatarInner}
          ${isWorking ? '' : '<span class="av__dot av__dot--off"></span>'}
        </div>
        <div class="hr-card__body">
          <div class="hr-card__head">
            <div class="hr-card__name">${esc(e.name)}</div>
            <span class="hr-card__chip hr-card__chip--primary">${rankPosition}</span>
            ${outsourceChip}
            <span class="${statusCls}">${statusLabel}</span>
          </div>
          <div class="hr-card__contact">
            <div class="hr-card__contact-item">
              <a class="hr-card__contact-icon" href="tel:${esc(e.phone)}" data-emp-action="call" title="전화">${ICON_PHONE}</a>
              <a class="hr-card__contact-value hr-card__contact-value--emphasis" href="tel:${esc(e.phone)}" data-emp-action="call" title="전화 걸기">${esc(e.phone)}</a>
            </div>
            <div class="hr-card__contact-item">
              <a class="hr-card__contact-icon" href="mailto:${esc(e.email)}" data-emp-action="mail" title="메일">${ICON_MAIL}</a>
              <a class="hr-card__contact-value" href="mailto:${esc(e.email)}" data-emp-action="mail" title="메일 보내기">${esc(e.email)}</a>
            </div>
          </div>
        </div>
        <button class="hr-card__fav${favActive}" type="button" title="즐겨찾기">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.8l2.54 5.15 5.68.83-4.11 4.01.97 5.66L12 16.76 6.92 19.45l.97-5.66-4.11-4.01 5.68-.83L12 3.8z"/></svg>
        </button>
      </div>
    `;
  }

  function highlightStrip(deptId) {
    const host = $('#hr-emp-strips');
    if (!host) return;
    host.querySelectorAll('.dept-strip').forEach(el => {
      el.classList.toggle('is-target', el.dataset.deptId === deptId);
    });
  }
  function scrollToStrip(deptId) {
    if (!deptId) return;
    highlightStrip(deptId);
    const host = $('#hr-emp-strips');
    const el = host && host.querySelector(`[data-dept-id="${deptId}"]`);
    if (!host || !el) return;
    // dept-scroll 컨테이너 스크롤을 직접 계산 — scrollIntoView 가 외곽 스크롤 컨테이너를 잘못 잡는 경우 회피.
    // 모바일(<=768px)은 strip 이 세로로 stack 되므로 세로(top), 데스크탑은 가로(left) 로 앵커.
    const hostRect = host.getBoundingClientRect();
    const elRect   = el.getBoundingClientRect();
    if (isMobileWidth()) {
      const delta = elRect.top - hostRect.top;
      host.scrollTo({ top: host.scrollTop + delta - 8, behavior: 'smooth' });
    } else {
      const delta = elRect.left - hostRect.left;
      host.scrollTo({ left: host.scrollLeft + delta - 8, behavior: 'smooth' });
    }
  }

  /* ◀ ▶ — 현재 앵커된 부서 strip 기준 이전(-1)/다음(+1) 부서로 이동.
   *   트리 선택과 동일하게 selectedDeptId·트리 하이라이트·타이틀을 함께 갱신한 뒤 앵커. */
  function gotoAdjacentStrip(dir) {
    const strips = getStripDepts();
    if (!strips.length) return;
    const cur = resolveTargetStrip(STATE.selectedDeptId);
    let idx = cur ? strips.findIndex(s => s.id === cur.id) : 0;
    if (idx < 0) idx = 0;
    const nextIdx = Math.min(strips.length - 1, Math.max(0, idx + dir));
    if (nextIdx === idx) return;            // 양 끝에서는 더 이동하지 않음
    const target = strips[nextIdx];
    STATE.selectedDeptId = target.id;
    renderTreeOnly();
    updateDeptTitle();
    renderStrips();                          // 선택 부서 기준 카운트·타겟 강조 갱신
    scrollToStrip(target.id);
  }

  /* ============ 인사정보카드 — 공식 컴포넌트(App.HRInfoCard) 사용 ============
   *   입사자 관리의 풍부한 카드를 공통 사용.
   *   ...e spread 로 원본 필드 그대로 보존 — docsSent/docsSentDate/contractSentDate/status/userId 등이
   *   drawer 의 「완료」 판정 + 계약·서류 패널의 docs 상태 조회에 그대로 사용된다. */
  function toHrInfoCardEmp(e) {
    if (!e) return null;
    const name = e.name || '';
    return Object.assign({}, e, {
      fname: e.fname || name.charAt(0),
      gname: e.gname || name.slice(1),
      nameFlip: e.nameFlip || false,
      dept: e.deptName || e.dept || '',
      photoUrl: e.photoUrl || e.photo || '',
      site: e.site || '본사',
      empType: e.empType || 'regular',
      jobCat: e.jobCat || 'office',
      /* 인사 관리에 노출된 사원은 이미 isComplete 통과 — 누락 필드만 안전 기본값 */
      infoStatus: e.infoStatus || 'done',
      ssn: e.ssn || '900101-1******',
    });
  }
  function openDetailDrawer(emp) {
    if (!emp) return;
    /* 임직원 관리(info-mgmt) 의 인사카드 Drawer 로 통일 — 더 풍부한 본문(근로·임금 계약 정보 등) 노출.
       App.HRInfoMgmt.list() 에서 최신 직원 데이터를 우선 조회 (실시간 동기화). */
    const list = (window.App && App.HRInfoMgmt && App.HRInfoMgmt.list) ? App.HRInfoMgmt.list() : [];
    const src = list.find(r => r.id === emp.id);
    const empObj = src || toHrInfoCardEmp(emp);
    if (window.App && App.HRInfoMgmtCard && App.HRInfoMgmtCard.open) {
      App.HRInfoMgmtCard.open(empObj, { onSave: () => { renderStrips(); } });
      return;
    }
    /* fallback — info-mgmt 미로드 환경에서는 employee 자체 인사카드 */
    if (window.App && App.HRInfoCard) {
      App.HRInfoCard.open(toHrInfoCardEmp(emp), {
        onSave: () => { renderStrips(); },
      });
    }
  }

  // drawer 위임 핸들러 — 1회만 바인딩 (init 에서 호출)
  function bindDrawerOnce() {
    const oc = document.getElementById('oc-hr-card');
    if (!oc) return;
    // 탭 클릭 (body 내 위임)
    oc.querySelector('#oc-hr-card-body').addEventListener('click', (e) => {
      const tab = e.target.closest('[data-hr-card-tabs] [data-tab]');
      if (!tab || tab.disabled) return;
      const emp = STATE._drawerEmp;
      if (!emp) return;
      oc.querySelectorAll('[data-hr-card-tabs] .tabs__tab').forEach(t => t.classList.toggle('is-active', t === tab));
      renderCardPanel(emp, tab.dataset.tab);
    });
    // 푸터 액션 (footer 내 위임)
    oc.querySelector('#oc-hr-card-footer').addEventListener('click', (e) => {
      const emp = STATE._drawerEmp; if (!emp) return;
      if (e.target.closest('[data-hr-card-edit]')) openEditModal(emp);
      if (e.target.closest('[data-hr-card-pdf]'))  openPDFModal(emp, {});
    });
  }

  /* ===== Form Table 헬퍼 ===== */
  // row: [{ label, value, span? }] — 2 pair / row 가 기본
  function fmRow(items) {
    // items 길이 1, 2 모두 지원. 2칸일 때 row--2, 1칸일 때 row--1
    if (items.length === 1) {
      const it = items[0];
      return `<div class="fm-tbl__row fm-tbl__row--1">
        <div class="fm-tbl__label">${esc(it.label)}</div>
        <div class="fm-tbl__value">${it.html || esc(it.value || '-')}</div>
      </div>`;
    }
    return `<div class="fm-tbl__row fm-tbl__row--2">
      <div class="fm-tbl__label">${esc(items[0].label)}</div>
      <div class="fm-tbl__value">${items[0].html || esc(items[0].value || '-')}</div>
      <div class="fm-tbl__label">${esc(items[1].label)}</div>
      <div class="fm-tbl__value">${items[1].html || esc(items[1].value || '-')}</div>
    </div>`;
  }
  function fmSection(title, rows) {
    return `<section class="fm-section">
      <div class="fm-section__title">${esc(title)}</div>
      <div class="fm-tbl fm-tbl--compact">${rows}</div>
    </section>`;
  }

  function renderCardPanel(emp, tab) {
    const panel = $('#hr-card-panel');
    if (!panel) return;
    if (tab === 'public') panel.innerHTML = renderPublicPanel(emp);
    else                  panel.innerHTML = renderPrivatePanel(emp);
  }

  /* ===== 기본 정보 패널 ===== */
  function renderPublicPanel(emp) {
    // ■신상사항
    const personal = fmSection('신상사항',
      fmRow([{ label:'사번', value: emp.id }, { label:'성명(한글)', value: emp.name }]) +
      fmRow([{ label:'성명(영문)', value: emp.name.replace(/[가-힣]/g, '') || 'HONG GIL DONG' }, { label:'성명(한자)', value: '洪吉童' }]) +
      fmRow([{ label:'생년월일', value: dispYmd(emp.birth) }, { label:'입사일', value: dispYmd(emp.joinDate) }]) +
      fmRow([{ label:'소속', value: emp.deptName }, { label:'직무', value: emp.job }]) +
      fmRow([{ label:'직위', value: emp.rank }, { label:'직책', value: emp.position || '-' }]) +
      fmRow([{ label:'근무형태', value: '정규직' }, { label:'사업장', value: '본사' }]) +
      fmRow([{ label:'연락처', value: emp.phone }, { label:'E-Mail', value: emp.email }]) +
      fmRow([{ label:'주소', value: emp.address }])
    );

    // ■학력사항 — table
    const edu = `<section class="fm-section">
      <div class="fm-section__title">학력사항</div>
      <table class="tbl tbl--striped">
        <thead><tr><th>학교명</th><th>학과명</th><th>입학년월</th><th>졸업년월</th><th>졸업여부</th></tr></thead>
        <tbody>
          <tr><td>서울대학교</td><td>경영학과</td><td>08/03</td><td>12/02</td><td>졸업</td></tr>
          <tr><td>한국고등학교</td><td>-</td><td>05/03</td><td>08/02</td><td>졸업</td></tr>
        </tbody>
      </table>
    </section>`;

    // ■경력사항
    const career = `<section class="fm-section">
      <div class="fm-section__title">경력사항</div>
      <table class="tbl tbl--striped">
        <thead><tr><th>회사명</th><th>기간</th><th>최종직위</th><th>담당업무</th><th>퇴직일</th></tr></thead>
        <tbody>
          <tr><td>전 직장 (주)A</td><td>12/03 ~ 16/02</td><td>대리</td><td>${esc(emp.job)}</td><td>16/02/28</td></tr>
        </tbody>
      </table>
    </section>`;

    // ■자격면허
    const cert = `<section class="fm-section">
      <div class="fm-section__title">자격면허</div>
      <table class="tbl tbl--striped">
        <thead><tr><th>종류</th><th>등급</th><th>취득일</th><th>발행기관</th></tr></thead>
        <tbody>
          <tr><td>정보처리기사</td><td>-</td><td>15/06/30</td><td>한국산업인력공단</td></tr>
          <tr><td>운전면허</td><td>1종 보통</td><td>09/03/15</td><td>도로교통공단</td></tr>
        </tbody>
      </table>
    </section>`;

    // ■어학능력
    const lang = `<section class="fm-section">
      <div class="fm-section__title">어학능력</div>
      <table class="tbl tbl--striped">
        <thead><tr><th>언어</th><th>회화</th><th>작문</th><th>독해</th><th>비고</th></tr></thead>
        <tbody>
          <tr><td>영어</td><td>상</td><td>중</td><td>상</td><td>TOEIC 880</td></tr>
          <tr><td>일본어</td><td>중</td><td>중</td><td>중</td><td>JLPT N2</td></tr>
        </tbody>
      </table>
    </section>`;

    // ■발령사항
    const appoint = `<section class="fm-section">
      <div class="fm-section__title">발령사항</div>
      <table class="tbl tbl--striped">
        <thead><tr><th>발령일</th><th>구분</th><th>발령상태</th><th>이전</th><th>이후</th></tr></thead>
        <tbody>
          <tr><td>${esc(dispYmd(emp.joinDate))}</td><td>입사</td><td>${emp.active ? '재직' : '퇴직'}</td><td>-</td><td>${esc(emp.deptName)} ${esc(emp.rank)}</td></tr>
          <tr><td>24/01/01</td><td>승진</td><td>재직</td><td>대리</td><td>${esc(emp.rank)}</td></tr>
        </tbody>
      </table>
    </section>`;

    // ■경조사현황
    const event = `<section class="fm-section">
      <div class="fm-section__title">경조사현황</div>
      <table class="tbl tbl--striped">
        <thead><tr><th>발생일</th><th>경조내용</th><th>휴가일</th><th>경조금</th><th>화환비</th></tr></thead>
        <tbody>
          <tr><td>19/08/29</td><td>부친상</td><td>5일</td><td>400,000원</td><td>45,000원</td></tr>
        </tbody>
      </table>
    </section>`;

    // ■연차현황
    const annual = `<section class="fm-section">
      <div class="fm-section__title">연차현황</div>
      <table class="tbl tbl--striped">
        <thead><tr><th>해당년도</th><th>발생연차</th><th>사용연차</th><th>최종연차</th><th>연차수당</th></tr></thead>
        <tbody>
          <tr><td>2026</td><td>21일</td><td>1.5일</td><td>19.5일</td><td>-</td></tr>
          <tr><td>2025</td><td>20일</td><td>18.5일</td><td>1.5일</td><td>지급</td></tr>
        </tbody>
      </table>
    </section>`;

    return personal + edu + career + cert + lang + appoint + event + annual;
  }

  /* ===== 비공개 정보 패널 ===== */
  function renderPrivatePanel(emp) {
    // 권한 안내 배너
    const banner = `<div style="padding:10px 12px;background:rgba(220,38,38,.08);border-left:3px solid var(--color-danger);border-radius:0 var(--radius-md) var(--radius-md) 0;font-size:var(--fs-sm);color:var(--color-text-sub);margin-bottom:18px;">
      🔒 본 화면은 권한자만 열람 가능한 민감 정보를 포함합니다. 조회 이력은 자동으로 기록됩니다.
    </div>`;

    // 권한별 섹션 노출
    const showAll      = ROLE.canViewSensitive();
    const showPayroll  = ROLE.canViewPayroll();
    const showFamily   = showAll || CURRENT_ROLE === 'manager';

    let html = banner;

    // ■신상사항 (주민번호)
    html += fmSection('신상사항 (민감)',
      fmRow([{ label:'주민등록번호', value: showAll ? '900101-1******' : '권한 없음 ●●●●●●' }])
    );

    // ■가족사항
    if (showFamily) {
      html += `<section class="fm-section">
        <div class="fm-section__title">가족사항</div>
        <table class="tbl tbl--striped">
          <thead><tr><th>관계</th><th>성명</th><th>성별</th><th>생년월일</th><th>동거유무</th></tr></thead>
          <tbody>
            <tr><td>배우자</td><td>홍OO</td><td>여</td><td>91/04/15</td><td>Y</td></tr>
            <tr><td>자녀</td><td>홍△△</td><td>남</td><td>18/08/22</td><td>Y</td></tr>
          </tbody>
        </table>
      </section>`;

      // ■병역사항
      html += fmSection('병역사항',
        fmRow([{ label:'병역구분', value:'군필' }, { label:'군별', value:'육군' }]) +
        fmRow([{ label:'계급', value:'병장' }, { label:'병역기간', value:'10/03 ~ 12/02' }])
      );
    }

    // ■장애여부
    if (showAll) {
      html += fmSection('장애여부',
        fmRow([{ label:'장애여부', value:'N' }, { label:'장애등급', value:'-' }]) +
        fmRow([{ label:'장애등록번호', value:'-' }, { label:'등록일자', value:'-' }])
      );

      // ■신체사항
      html += fmSection('신체사항',
        fmRow([{ label:'신장', value:'175 cm' }, { label:'체중', value:'68 kg' }]) +
        fmRow([{ label:'혈액형', value:'RH+ AB' }, { label:'시력', value:'좌(1.0) 우(1.0)' }]) +
        fmRow([{ label:'색맹', value:'N' }, { label:'보훈여부', value:'N' }])
      );
    }

    // ■급여현황
    if (showPayroll) {
      html += `<section class="fm-section">
        <div class="fm-section__title">급여현황</div>
        <table class="tbl tbl--striped">
          <thead><tr><th>기준일</th><th>구분</th><th>기본급</th><th>시간외수당</th><th>월급여</th><th>연봉</th></tr></thead>
          <tbody>
            <tr><td>26/01/01</td><td>정기</td><td>4,200,000</td><td>800,000</td><td>5,000,000</td><td>54,000,000</td></tr>
          </tbody>
        </table>
      </section>`;

      // ■임금변동현황
      html += `<section class="fm-section">
        <div class="fm-section__title">임금변동현황 (OT시수: 52)</div>
        <table class="tbl tbl--striped">
          <thead><tr><th>변동일</th><th>구분</th><th>변동 전</th><th>변동 후</th><th>시급</th></tr></thead>
          <tbody>
            <tr><td>26/01/01</td><td>정기인상</td><td>50,400,000</td><td>54,000,000</td><td>25,000</td></tr>
          </tbody>
        </table>
      </section>`;

      // ■급상여현황
      html += `<section class="fm-section">
        <div class="fm-section__title">급상여현황</div>
        <table class="tbl tbl--striped">
          <thead><tr><th>귀속년월</th><th>구분</th><th>초과근무</th><th>기타수당</th><th>총지급액</th><th>공제액</th><th>실지급액</th></tr></thead>
          <tbody>
            <tr><td>26/04</td><td>급여</td><td>250,000</td><td>550,000</td><td>5,000,000</td><td>620,000</td><td>4,380,000</td></tr>
            <tr><td>26/03</td><td>급여</td><td>180,000</td><td>470,000</td><td>4,850,000</td><td>610,000</td><td>4,240,000</td></tr>
          </tbody>
        </table>
      </section>`;
    }

    // ■평가현황
    if (showAll || CURRENT_ROLE === 'manager') {
      html += `<section class="fm-section">
        <div class="fm-section__title">평가현황</div>
        <table class="tbl tbl--striped">
          <thead><tr><th>년도</th><th>등급</th><th>점수</th><th>비고</th></tr></thead>
          <tbody>
            <tr><td>2025</td><td>A등급</td><td>90점</td><td>-</td></tr>
            <tr><td>2024</td><td>B등급</td><td>85점</td><td>-</td></tr>
          </tbody>
        </table>
      </section>`;
    }

    // ■근태현황
    if (showAll) {
      html += `<section class="fm-section">
        <div class="fm-section__title">근태현황</div>
        <table class="tbl tbl--striped">
          <thead><tr><th>월별</th><th>지각(분)</th><th>조퇴(분)</th><th>결근(일)</th></tr></thead>
          <tbody>
            <tr><td>26/04</td><td>0</td><td>0</td><td>0</td></tr>
            <tr><td>26/03</td><td>15</td><td>0</td><td>0</td></tr>
          </tbody>
        </table>
      </section>`;

      // ■포상징계현황
      html += `<section class="fm-section">
        <div class="fm-section__title">포상징계현황</div>
        <table class="tbl tbl--striped">
          <thead><tr><th>구분</th><th>종류</th><th>통보일</th><th>결과</th><th>사유</th></tr></thead>
          <tbody>
            <tr><td>포상</td><td>최우수사원선정</td><td>25/12/20</td><td>성과급 500,000</td><td>-</td></tr>
          </tbody>
        </table>
      </section>`;
    }

    // ■퇴직연금현황
    if (showPayroll) {
      html += fmSection('퇴직연금현황',
        fmRow([{ label:'퇴직연금 총누계액', value:'18,400,000원' }, { label:'중도정산일', value:'18/12' }])
      );
    }

    // ■퇴직사항 (퇴직자만 의미있음)
    if (!emp.active) {
      html += fmSection('퇴직사항',
        fmRow([{ label:'퇴직일', value:'25/12/31' }, { label:'퇴직사유', value:'개인사정' }])
      );
    }

    return html;
  }

  /* ===== OffCanvas open/close — 메인 앱에는 ui-kit.js 가 없으므로 자체 구현 ===== */
  function openOC(id) {
    const oc = document.getElementById(id);
    const bd = document.querySelector(`[data-oc-host="${id}"]`);
    if (!oc) return;
    oc.classList.add('is-open');
    bd && bd.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeAllOC() {
    document.querySelectorAll('.offcanvas.is-open, .oc-backdrop.is-open').forEach(el => el.classList.remove('is-open'));
    document.body.style.overflow = '';
  }
  function bindOCClose() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-oc-close]')) closeAllOC();
      if (e.target.matches('.oc-backdrop')) closeAllOC();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.querySelector('.offcanvas.is-open')) closeAllOC();
    });
  }

  /* ============ SCR-EMP-03 수정 요청 모달 ============ */
  function openEditModal(emp) {
    // 권한별 수정 가능 항목
    const FIELDS_HR_ADMIN = [
      { key:'name', label:'성명' },
      { key:'address', label:'주소' },
      { key:'phone', label:'연락처' },
      { key:'emergency', label:'긴급연락처' },
      { key:'email', label:'이메일' },
      { key:'rank', label:'직위' },
      { key:'position', label:'직책' },
    ];
    const FIELDS_EMPLOYEE = [
      { key:'address', label:'주소' },
      { key:'phone', label:'연락처' },
      { key:'emergency', label:'긴급연락처' },
    ];
    const fields = ROLE.canEditAll() ? FIELDS_HR_ADMIN : FIELDS_EMPLOYEE;

    $('#hr-edit-target').textContent = `${emp.name} (${emp.id})`;
    const sel = $('#hr-edit-field');
    sel.innerHTML = '<option value="">선택하세요</option>' +
      fields.map(f => `<option value="${f.key}">${f.label}</option>`).join('');
    $('#hr-edit-before').value = '';
    $('#hr-edit-after').value = '';
    $('#hr-edit-reason').value = '';
    $('[data-hr-edit-reason-msg]').textContent = '';
    $('#hr-edit-dz-title').textContent = '파일을 끌어 놓거나 클릭하여 선택';
    $('[data-hr-edit-submit]').disabled = true;
    STATE.currentEditField = '';
    // 컨텍스트 저장 (submit 에서 사용)
    STATE._editTargetEmp = emp;
    openModal('modal-hr-edit');
  }
  function bindEditModal() {
    const modal = document.getElementById('modal-hr-edit');
    if (!modal) return;

    modal.querySelector('#hr-edit-field').addEventListener('change', (e) => {
      STATE.currentEditField = e.target.value;
      const emp = STATE._editTargetEmp;
      if (!emp || !e.target.value) {
        $('#hr-edit-before').value = '';
        $('#hr-edit-after').value = '';
      } else {
        $('#hr-edit-before').value = emp[e.target.value] || '';
        $('#hr-edit-after').value = '';
      }
      checkSubmit();
    });
    modal.querySelector('#hr-edit-after').addEventListener('input', checkSubmit);
    modal.querySelector('#hr-edit-reason').addEventListener('input', (e) => {
      const v = e.target.value.trim();
      const msg = $('[data-hr-edit-reason-msg]');
      if (v.length === 0) { msg.textContent = ''; }
      else if (v.length < 10) {
        msg.textContent = `${10 - v.length}자 더 입력해주세요.`;
        msg.style.color = 'var(--color-warning)';
      } else {
        msg.textContent = '';
      }
      checkSubmit();
    });
    function checkSubmit() {
      const field  = $('#hr-edit-field').value;
      const after  = $('#hr-edit-after').value.trim();
      const reason = $('#hr-edit-reason').value.trim();
      $('[data-hr-edit-submit]').disabled = !(field && after && reason.length >= 10);
    }

    // 드롭존
    const dz = modal.querySelector('#hr-edit-dz');
    const input = modal.querySelector('#hr-edit-dz-input');
    dz.addEventListener('click', () => input.click());
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('is-drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('is-drag'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault(); dz.classList.remove('is-drag');
      const f = e.dataTransfer.files[0];
      if (f) $('#hr-edit-dz-title').textContent = '첨부됨: ' + f.name;
    });
    input.addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (f) $('#hr-edit-dz-title').textContent = '첨부됨: ' + f.name;
    });

    modal.querySelector('[data-hr-edit-submit]').addEventListener('click', () => {
      const emp = STATE._editTargetEmp;
      const field  = $('#hr-edit-field').value;
      const after  = $('#hr-edit-after').value.trim();
      const reason = $('#hr-edit-reason').value.trim();
      // 동일 항목 요청중 건 검증
      const dup = STATE.requests.some(r => r.empId === emp.id && r.field === field && r.status === 'pending');
      if (dup) {
        window.toast && window.toast('이미 처리 중인 수정 요청이 있습니다. 기존 요청 처리 후 다시 시도해 주세요.', 'danger', 4500);
        return;
      }
      const fieldLabel = $('#hr-edit-field option:checked').textContent;
      const today = new Date().toISOString().slice(0, 10);
      const reqNo = 'REQ' + new Date().toISOString().replace(/[-:T.Z]/g,'').slice(0, 14);
      STATE.requests.unshift({
        reqNo, empId: emp.id, empName: emp.name,
        field, fieldLabel,
        before: emp[field] || '',
        after, reason,
        reqDate: today, elapsed: 0,
        status: 'pending', rejectReason: '', escalated: false,
      });
      closeAllModals();
      window.toast && window.toast(`수정 요청 제출 완료 — 요청번호 ${reqNo}`, 'success');
    });
  }

  /* ============ SCR-EMP-05 PDF 출력 모달 ============ */
  const PDF_SECTIONS = [
    { key:'basic',    label:'기본정보',    requireRole:null },
    { key:'edu',      label:'학력·경력',   requireRole:['hr_admin','manager'] },
    { key:'cert',     label:'자격·어학',   requireRole:['hr_admin','manager'] },
    { key:'family',   label:'가족·병역',   requireRole:['hr_admin','manager'] },
    { key:'payroll',  label:'급여·임금',   requireRole:['hr_admin','exec'] },
    { key:'appoint',  label:'발령이력',    requireRole:null },
    { key:'contract', label:'계약이력',    requireRole:null },
    { key:'physical', label:'신체사항',    requireRole:['hr_admin'] },
  ];
  function openPDFModal(emp, showSection) {
    $('#hr-pdf-target').textContent = `${emp.name} (${emp.id})`;
    const role = CURRENT_ROLE;
    const info = role === 'exec'
      ? '임원 권한: 급여·임금 포함 출력 가능. 학력·자격·가족·병역·신체사항은 출력 불가.'
      : role === 'hr_admin'
        ? '인사담당자: 모든 섹션 출력 가능. (민감 정보 포함)'
        : '권한 외 섹션은 자동 비활성됩니다.';
    $('#hr-pdf-info').textContent = info;
    $('#hr-pdf-sections').innerHTML = PDF_SECTIONS.map(sec => {
      const allowed = !sec.requireRole || sec.requireRole.includes(role);
      return `<label class="chk" ${!allowed ? 'style="opacity:0.45;cursor:not-allowed;"' : ''}>
        <input type="checkbox" value="${sec.key}" ${allowed ? 'checked' : 'disabled'} />
        <span>${esc(sec.label)}</span>
      </label>`;
    }).join('');
    updatePDFButtons();
    openModal('modal-hr-pdf');
  }
  function updatePDFButtons() {
    const cnt = document.querySelectorAll('#hr-pdf-sections input[type="checkbox"]:checked').length;
    $('[data-hr-pdf-download]').disabled = cnt === 0;
    $('[data-hr-pdf-print]').disabled    = cnt === 0;
  }
  function bindPDFModal() {
    const modal = document.getElementById('modal-hr-pdf');
    if (!modal) return;
    modal.addEventListener('change', (e) => {
      if (e.target.matches('input[type="checkbox"]')) updatePDFButtons();
    });
    modal.querySelector('[data-hr-pdf-download]').addEventListener('click', () => {
      const sel = Array.from(modal.querySelectorAll('#hr-pdf-sections input:checked')).map(i => i.value);
      closeAllModals();
      window.toast && window.toast(`PDF 다운로드 — 섹션 ${sel.length}개 (${sel.join(', ')})`, 'success', 4000);
    });
    modal.querySelector('[data-hr-pdf-print]').addEventListener('click', () => {
      closeAllModals();
      window.toast && window.toast('브라우저 인쇄 다이얼로그를 호출합니다.', 'info');
    });
  }

  /* ============ 모달 공통 open/close ============ */
  function openModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeAllModals() {
    document.querySelectorAll('.modal-backdrop.is-open').forEach(m => m.classList.remove('is-open'));
    document.body.style.overflow = '';
  }
  function bindCommonClose() {
    ['modal-hr-edit','modal-hr-pdf'].forEach(id => {
      const m = document.getElementById(id); if (!m) return;
      /* 오버레이(backdrop) 클릭 */
      m.addEventListener('click', (e) => { if (e.target === m) closeAllModals(); });
      /* 닫기(✕)·취소 버튼 (data-modal-close) — 전역 닫기 핸들러가 없어 페이지에서 직접 바인딩 */
      m.querySelectorAll('[data-modal-close]').forEach(b => b.addEventListener('click', closeAllModals));
    });
  }

  /* ============ 인사카드 drawer 외부 공개 API ============
   *  다른 페이지(예: 입사자 관리) 에서 호출 가능:
   *    App.HrCard.open(empObject)
   *  empObject 의 부족한 필드는 normalize 에서 기본값으로 채움 (사번/이름만 필수)
   */
  let _hrCardInited = false;
  function ensureHrCardInit() {
    if (_hrCardInited) return;
    bindEditModal();
    bindPDFModal();
    bindCommonClose();
    bindOCClose();
    bindDrawerOnce();
    _hrCardInited = true;
  }
  function normalizeEmpForCard(e) {
    if (!e) return null;
    const name = e.name || '';
    return {
      id:        e.id        || '-',
      name,
      deptName:  e.deptName  || e.dept || '-',
      rank:      e.rank      || '-',
      position:  e.position  || '',
      job:       e.job       || '-',
      joinDate:  e.joinDate  || '-',
      phone:     e.phone     || '-',
      email:     e.email     || '-',
      active:    e.active !== false,
      birth:     e.birth     || '-',
      address:   e.address   || '-',
      emergency: e.emergency || '-',
      color:     e.color     || ((name ? name.charCodeAt(0) % 6 : 0) + 1),
      photo:     e.photo     || '',
    };
  }
  /* 인사카드 통일 — 임직원 관리(info-mgmt) 카드로 라우팅.
     openDetailDrawer 가 이미 App.HRInfoMgmtCard.open() 으로 위임하므로 외부 API 호환만 유지. */
  App.HrCard = {
    open(rawEmp) {
      if (window.App && App.HRInfoMgmtCard && App.HRInfoMgmtCard.open) {
        App.HRInfoMgmtCard.open(normalizeEmpForCard(rawEmp));
        return;
      }
      ensureHrCardInit();
      openDetailDrawer(normalizeEmpForCard(rawEmp));
    },
  };

  /* ============ Notion-style 부서 관리 모달 ============
   *   - 트리 행 hover → 우측에 [+] [⋮] 버튼 노출
   *   - [+] 클릭 → 자식 노드로 추가 가능한 타입 선택 popover
   *     · 루트(C0): 본부 / 팀 (회사 직속)
   *     · 본부(hq): 팀 / 파트 (기본 팀)
   *     · 팀(team): 파트
   *     · 파트(part): (4단계 금지)
   *   - [⋮] 클릭 → 이름 변경 / 비활성 토글 / 삭제
   *   - 추가/이름변경은 인라인 input 으로 처리 후 Enter/blur 로 확정
   *   ================================================== */
  let DEPT_SEQ = 100;
  function genDeptId() { return 'D' + (++DEPT_SEQ); }
  function deptTypeIcon(type) {
    if (type === 'root') return '🏢';
    if (type === 'hq')   return '🏛️';
    if (type === 'team') return '👥';
    if (type === 'part') return '📄';
    return '📁';
  }
  function deptTypeLabel(t) {
    return t === 'hq' ? '본부' : t === 'team' ? '팀' : t === 'part' ? '파트' : t === 'root' ? '루트' : '—';
  }
  /* 자식으로 추가 가능한 타입 — 페이지 정책과 일관 */
  function allowedChildTypes(parentType) {
    if (parentType === 'root') return ['hq', 'team'];
    if (parentType === 'hq')   return ['team', 'part'];   // 기본 팀, 파트 선택 가능
    if (parentType === 'team') return ['part'];
    return [];
  }
  /* 모달 상태 — selectedId 가 있으면 우측 패널 모드 표시.
   *   mode: 'empty'  → 안내 문구
   *         'edit'   → 기존 부서 정보 + 저장/삭제/비활성화
   *         'create' → 방금 + 로 추가된 신규 노드(트리에 이미 push 됨) → 추가/취소
   *
   *   create 모드에서도 노드는 이미 DEPTS 에 들어가 있다 (트리에 즉시 보임).
   *   사용자가 [추가] 누르면 단순히 mode → 'edit' 로 전환.
   *   [취소] 누르면 방금 추가한 노드를 DEPTS 에서 제거하고 mode → 'empty'. */
  const DEPT_MGR = {
    selectedId: null,
    mode: 'empty',
  };

  /* ============ 조직도 스냅샷 / 변경 이력 ============
   *   - DEPT_BASELINE: 모달 진입(또는 마지막 [조직도 저장]) 시점의 DEPTS 스냅샷.
   *   - 추가/이름변경/이동/구분변경/상태변경/삭제는 즉시 DEPTS 에 반영되지만,
   *     "확정" 은 [조직도 저장] 을 눌러 스냅샷을 찍고 변경 내역을 ORG_HISTORY 에 기록할 때 발생.
   *   - 부서 정보 패널의 [저장] 버튼은 해당 노드의 폼(이름/구분)이 변경됐을 때만 노출. */
  let DEPT_BASELINE = null;
  const ORG_HISTORY = [];
  const ORG_CHANGE_META = {
    add:    { label: '추가',    cls: 'pill--soft-success', tl: 'tl-item--success' },
    remove: { label: '삭제',    cls: 'pill--soft-danger',  tl: 'tl-item--danger'  },
    rename: { label: '이름변경', cls: 'pill--soft-blue',    tl: '' },
    move:   { label: '이동',    cls: 'pill--soft-warning', tl: 'tl-item--warning' },
    retype: { label: '구분변경', cls: 'pill--soft-warning', tl: '' },
    active: { label: '상태변경', cls: 'pill',               tl: '' },
    shift:  { label: '근무조변경', cls: 'pill--soft-blue',   tl: '' },
  };
  function cloneDepts() { return DEPTS.map(d => Object.assign({}, d)); }
  function deptNameById(list, id) { const d = list.find(x => x.id === id); return d ? d.name : '—'; }
  /* 근무조 코드 → 표시 라벨(예: WTD05 → E조). 미지정은 '미지정'. */
  function shiftLabelOf(code) {
    if (!code) return '미지정';
    const A = window.App || {};
    const s = (A.AttShifts && A.AttShifts.get) ? A.AttShifts.get(code) : null;
    return s ? (s.label || code) : code;
  }
  /* 모달 진입 시 DEPTS 각 노드에 기본 근무조(deptMeta 저장값)를 실어 diff/변경건수 추적 대상에 포함 */
  function syncNodeDefaultShifts() {
    const A = window.App || {};
    const get = (A.AttWorkPolicy && A.AttWorkPolicy.rawDeptDefaultShift) ? A.AttWorkPolicy.rawDeptDefaultShift : null;
    DEPTS.forEach(d => { d.defaultShift = get ? (get(d.name) || '') : (d.defaultShift || ''); });
  }
  /* baseline ↔ 현재 DEPTS 비교 → 변경 항목 배열 */
  function diffOrg(base, cur) {
    const changes = [];
    const baseMap = new Map(base.map(d => [d.id, d]));
    const curMap  = new Map(cur.map(d => [d.id, d]));
    cur.forEach(d => {
      if (!baseMap.has(d.id)) changes.push({ kind: 'add', name: d.name, detail: `${deptTypeLabel(d.type)} · 상위 ${deptNameById(cur, d.parentId)}` });
    });
    base.forEach(d => {
      if (!curMap.has(d.id)) changes.push({ kind: 'remove', name: d.name, detail: deptTypeLabel(d.type) });
    });
    cur.forEach(d => {
      const b = baseMap.get(d.id);
      if (!b) return;
      if ((b.name || '') !== (d.name || '')) changes.push({ kind: 'rename', name: d.name, detail: `${b.name} → ${d.name}` });
      if ((b.parentId || '') !== (d.parentId || '')) changes.push({ kind: 'move', name: d.name, detail: `${deptNameById(base, b.parentId)} → ${deptNameById(cur, d.parentId)}` });
      if (b.type !== d.type) changes.push({ kind: 'retype', name: d.name, detail: `${deptTypeLabel(b.type)} → ${deptTypeLabel(d.type)}` });
      if ((b.active !== false) !== (d.active !== false)) changes.push({ kind: 'active', name: d.name, detail: d.active !== false ? '비활성 → 활성' : '활성 → 비활성' });
      if ((b.defaultShift || '') !== (d.defaultShift || '')) changes.push({ kind: 'shift', name: d.name, detail: `${shiftLabelOf(b.defaultShift)} → ${shiftLabelOf(d.defaultShift)}` });
    });
    return changes;
  }
  /* footer 의 [조직도 저장] 버튼 활성/dirty 표식 동기화 */
  function recomputeOrgDirty() {
    const modal = document.getElementById('modal-emp-dept-manage');
    if (!modal) return [];
    const changes = DEPT_BASELINE ? diffOrg(DEPT_BASELINE, DEPTS) : [];
    const saveBtn = modal.querySelector('[data-emp-org-save]');
    const dirtyEl = modal.querySelector('[data-emp-org-dirty]');
    const cntEl   = modal.querySelector('[data-emp-org-dirty-cnt]');
    if (saveBtn) saveBtn.disabled = changes.length === 0 || isDeptApprovalPending();
    if (dirtyEl) dirtyEl.style.display = changes.length ? '' : 'none';
    if (cntEl)   cntEl.textContent = String(changes.length);
    return changes;
  }
  /* 부서 정보 폼(이름/구분)이 노드 원본과 다른가 — [저장] 버튼 노출 판단 */
  function nodeFormDirty() {
    if (DEPT_MGR.mode !== 'edit' || !DEPT_MGR.selectedId) return false;
    const node = DEPTS.find(d => d.id === DEPT_MGR.selectedId);
    if (!node || node.type === 'root') return false;
    const nameEl = document.getElementById('emp-dept-name');
    const typeSel = document.getElementById('emp-dept-type-select');
    const nameChanged = nameEl && (nameEl.value || '').trim() !== (node.name || '');
    const typeChanged = typeSel && typeSel.style.display !== 'none' && typeSel.value && typeSel.value !== node.type;
    /* 기본 근무조 변경도 [저장] 노출 대상 — select 값이 노드 작업값과 다르면 dirty */
    const dfSel = document.getElementById('emp-dept-default-shift');
    const defaultChanged = dfSel && dfSel.value !== (node.defaultShift || '');
    return !!(nameChanged || typeChanged || defaultChanged);
  }
  function updateNodeSaveVisibility() {
    const saveBtn = document.querySelector('#emp-dept-foot [data-emp-dept-save]');
    if (!saveBtn) return;
    /* edit 모드에서 폼 변경이 있을 때만 노출 (수정 시에만 보임). create 모드는 별도 [추가] 버튼 사용 */
    saveBtn.style.display = (DEPT_MGR.mode === 'edit' && nodeFormDirty()) ? '' : 'none';
  }
  /* [조직도 저장] — 즉시 확정하지 않고 전자결재 수정 승인으로 상신.
   *   근로계약 정보 편집과 동일한 전자결재 승인 모달(App.openSystemApprovalModal)을 사용한다.
   *   상신(접수) 후 결재 승인(자동, mock) 시에만 스냅샷 확정 + 변경 이력 기록이 일어난다. */
  function saveOrgSnapshot() {
    if (guardDeptApproval()) return;
    if (DEPT_MGR.mode === 'create') {
      window.toast && window.toast('추가 중인 부서를 먼저 [추가] 또는 [취소] 해주세요.', 'warning');
      return;
    }
    const changes = DEPT_BASELINE ? diffOrg(DEPT_BASELINE, DEPTS) : [];
    if (!changes.length) { window.toast && window.toast('변경된 내용이 없습니다.', 'info'); return; }

    /* 결재 모듈 미연결 환경 — 폴백으로 즉시 확정 저장 */
    if (!(window.App && typeof App.openSystemApprovalModal === 'function')) {
      ORG_HISTORY.unshift({ savedAt: new Date(), savedBy: '정혜진', changes, snapshot: cloneDepts() });
      DEPT_BASELINE = cloneDepts();
      recomputeOrgDirty();
      window.toast && window.toast(`조직도 저장 완료 — 변경 ${changes.length}건 기록 (결재 모듈 미연결)`, 'warning');
      return;
    }

    /* 근로계약 정보 변경과 동일하게 변경 내역을 본문으로 정리 */
    const content = ['[조직도 변경 내역]'].concat(changes.map(c => {
      const meta = ORG_CHANGE_META[c.kind] || { label: c.kind };
      return `· [${meta.label}] ${c.name}${c.detail ? ' — ' + c.detail : ''}`;
    })).join('\n');

    App.openSystemApprovalModal({
      docName: '조직 변경',
      titlePrefix: '조직 변경',
      codeLabel: '변경 유형',
      nameLabel: '대상',
      matCode: '조직도 변경',
      matName: `변경 ${changes.length}건`,
      customReasons: ['조직 개편', '정기 인사', '수시 인사', '기타'],
      defaultReason: '조직 개편',
      defaultApprovers: [],
      title: `조직도 변경 승인 요청 — 변경 ${changes.length}건`,
      content,
      attachments: [],
      payload: { kind: 'org-change', changeCount: changes.length },
      onSubmit() {
        /* 상신 접수 완료 → 결재 대기(편집 잠금) 후 (mock) 자동 승인 시 확정 */
        DEPT_APPROVAL.pending = { changes };
        applyDeptLock(true);
        if (DEPT_APPROVAL.timer) clearTimeout(DEPT_APPROVAL.timer);
        DEPT_APPROVAL.timer = setTimeout(approveDeptPending, 2000);
      },
    });
  }

  /* ============ 전자결재 수정 승인 — [조직도 저장] 게이트 ============
   *   조직도 변경(추가/이름/이동/구분/상태/삭제)은 트리에 staged 되지만, [조직도 저장] 시
   *   바로 확정하지 않고 전자결재로 상신한다(근로계약 정보 편집과 동일한 승인 모달).
   *   결재 승인 시에만 변경 이력(ORG_HISTORY) + 조직도 스냅샷(baseline)이 확정된다.
   *   승인 대기 중에는 편집을 잠근다. (mock: 상신 후 자동 승인으로 시연) */
  let DEPT_APPROVAL = { pending: null, timer: null };
  function isDeptApprovalPending() { return !!DEPT_APPROVAL.pending; }
  function guardDeptApproval() {
    if (isDeptApprovalPending()) {
      window.toast && window.toast('승인 요청 중입니다. 결재 완료 후 편집할 수 있습니다.', 'warning');
      return true;
    }
    return false;
  }
  function approveDeptPending() {
    if (!DEPT_APPROVAL.pending) return;
    DEPT_APPROVAL.pending = null;
    if (DEPT_APPROVAL.timer) { clearTimeout(DEPT_APPROVAL.timer); DEPT_APPROVAL.timer = null; }
    const changes = DEPT_BASELINE ? diffOrg(DEPT_BASELINE, DEPTS) : [];
    if (changes.length) {
      ORG_HISTORY.unshift({ savedAt: new Date(), savedBy: '정혜진', changes, snapshot: cloneDepts() });
      DEPT_BASELINE = cloneDepts();
    }
    applyDeptLock(false);
    recomputeOrgDirty();
    window.toast && window.toast(`전자결재 승인 완료 — 조직도 변경 ${changes.length}건이 확정·이력에 기록되었습니다.`, 'success', 4000);
  }
  /* 편집 잠금/해제 — 배너 + 부서 관리 모달 편집 컨트롤 비활성화 */
  function applyDeptLock(locked) {
    const modal = document.getElementById('modal-emp-dept-manage');
    if (!modal) return;
    const banner = document.getElementById('emp-dept-lock-banner');
    if (banner) banner.style.display = locked ? 'flex' : 'none';
    const sels = [
      '[data-emp-dept-save]', '[data-emp-dept-delete]', '[data-emp-dept-toggle-active]',
      '[data-emp-dept-create]', '[data-emp-dept-cancel]', '[data-emp-dept-move-up]', '[data-emp-dept-move-down]',
      '[data-emp-org-save]', '#emp-dept-name', '#emp-dept-type-select', '#emp-dept-parent-select',
      '#emp-dept-default-shift',
    ];
    sels.forEach(s => modal.querySelectorAll(s).forEach(el => { el.disabled = !!locked; }));
    const tree = modal.querySelector('#emp-dept-tree');
    if (tree) { tree.style.opacity = locked ? '0.55' : ''; tree.style.pointerEvents = locked ? 'none' : ''; }
    if (!locked) recomputeOrgDirty();
  }
  /* ===== 변경 이력 보기 모달 (동적 주입) ===== */
  function injectOrgHistoryModal() {
    if (document.getElementById('modal-emp-org-history')) return;
    const html = `
<div class="modal-backdrop" id="modal-emp-org-history" data-modal-id="emp-org-history" style="z-index:1050;">
  <div class="modal modal--xl" style="width:96vw;max-width:1000px;height:580px;max-height:82vh;display:flex;flex-direction:column;">
    <div class="modal__header">
      <div class="modal__title">조직도 변경 이력</div>
      <button class="modal__close" data-emp-org-history-close type="button" aria-label="닫기">✕</button>
    </div>
    <div class="modal__body" id="emp-org-history-body" style="overflow:auto;padding:18px 20px;"></div>
    <div class="modal__footer"><button class="btn" type="button" data-emp-org-history-close>닫기</button></div>
  </div>
</div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    const modal = document.getElementById('modal-emp-org-history');
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-emp-org-history-close]')) {
        modal.classList.remove('is-open');
      }
    });
  }
  function renderHistoryItem(h) {
    const t = h.savedAt;
    const ts = `${String(t.getFullYear()).slice(2)}/${String(t.getMonth()+1).padStart(2,'0')}/${String(t.getDate()).padStart(2,'0')}   ${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
    const rows = h.changes.map(c => {
      const m = ORG_CHANGE_META[c.kind] || { label: c.kind, cls: 'pill' };
      return `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;flex-wrap:wrap;">
        <span class="pill ${m.cls}" style="font-size:10px;">${m.label}</span>
        <span style="font-weight:var(--fw-medium);">${esc(c.name)}</span>
        <span style="color:var(--color-text-muted);font-size:var(--fs-sm);">${esc(c.detail)}</span>
      </div>`;
    }).join('');
    return `<div class="tl-item tl-item--success">
      <div class="tl-item__dot"></div>
      <div class="tl-item__time">${ts}</div>
      <div class="tl-item__title">조직도 저장 · 변경 ${h.changes.length}건 <span style="font-weight:var(--fw-regular);color:var(--color-text-muted);font-size:var(--fs-sm);">· ${esc(h.savedBy)}</span></div>
      <div class="tl-item__desc">${rows}</div>
    </div>`;
  }
  function openOrgHistory() {
    injectOrgHistoryModal();
    const body = document.getElementById('emp-org-history-body');
    if (body) {
      body.innerHTML = ORG_HISTORY.length
        ? `<div class="timeline">${ORG_HISTORY.map(renderHistoryItem).join('')}</div>`
        : `<p style="text-align:center;color:var(--color-text-muted);padding:44px 0;line-height:1.7;">저장된 변경 이력이 없습니다.<br>조직도를 변경한 뒤 <strong>[조직도 저장]</strong> 을 누르면 이력이 기록됩니다.</p>`;
    }
    const modal = document.getElementById('modal-emp-org-history');
    if (modal) { modal.classList.add('is-open'); document.body.style.overflow = 'hidden'; }
  }

  function deptParentPath(parentId) {
    const stack = [];
    let cur = DEPTS.find(d => d.id === parentId);
    while (cur) {
      stack.unshift(cur.name);
      cur = cur.parentId ? DEPTS.find(d => d.id === cur.parentId) : null;
    }
    return stack.join(' › ') || '—';
  }
  function renderNTreeNode(d, depth) {
    /* 부서 관리 모달은 비활성 부서까지 표시 (활성 토글 가능) */
    const kids = DEPTS.filter(x => x.parentId === d.id);
    const hasKids = kids.length > 0;
    const cnt = getEmpsInDept(d.id).length;
    const allowed = allowedChildTypes(d.type);
    const isSelected = DEPT_MGR.selectedId === d.id;
    const cls = ['ntree__node',
      hasKids ? 'is-open' : 'is-leaf',
      d.active === false ? 'is-inactive' : '',
      isSelected ? 'is-selected' : ''
    ].filter(Boolean).join(' ');
    return `
      <li class="${cls}" data-id="${d.id}">
        <div class="ntree__row" data-row>
          <span class="ntree__chev" data-ntree-toggle>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </span>
          <span class="ntree__icon">${deptTypeIcon(d.type)}</span>
          <span class="ntree__name" data-ntree-name>${esc(d.name)}</span>
          ${d.type !== 'root' ? `<span class="ntree__type ntree__type--${d.type}">${deptTypeLabel(d.type)}</span>` : ''}
          <span class="ntree__count">${cnt}명</span>
          <span class="ntree__actions">
            ${allowed.length ? `<button class="ntree__add" type="button" data-ntree-add title="하위 추가">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>` : ''}
          </span>
        </div>
        ${hasKids ? `<ul>${kids.map(k => renderNTreeNode(k, depth+1)).join('')}</ul>` : ''}
      </li>
    `;
  }
  function renderNTree() {
    const host = document.getElementById('emp-dept-tree');
    if (!host) return;
    const root = DEPTS.find(d => d.parentId === null);
    if (!root) return;
    host.innerHTML = `<ul>${renderNTreeNode(root, 0)}</ul>`;
    /* 모든 변경(추가/이름변경/이동/구분/상태/삭제)은 renderNTree 를 거치므로 여기서 dirty 동기화 */
    recomputeOrgDirty();
  }

  /* ============ 우측 상세 패널 렌더 ============ */
  function renderDeptDetail() {
    const titleEl = document.getElementById('emp-dept-form-title');
    const emptyEl = document.getElementById('emp-dept-detail');
    const formEl  = document.getElementById('emp-dept-form');
    const footEl  = document.getElementById('emp-dept-foot');
    const actionsEdit   = document.getElementById('emp-dept-actions-edit');
    const actionsCreate = document.getElementById('emp-dept-actions-create');
    if (!emptyEl || !formEl || !footEl) return;

    if (DEPT_MGR.mode === 'empty' || !DEPT_MGR.selectedId) {
      emptyEl.style.display = '';
      formEl.style.display = 'none';
      footEl.style.display = 'none';
      if (titleEl) titleEl.textContent = '부서 정보';
      return;
    }

    const node = DEPTS.find(d => d.id === DEPT_MGR.selectedId);
    if (!node) {
      DEPT_MGR.mode = 'empty';
      DEPT_MGR.selectedId = null;
      renderDeptDetail();
      return;
    }
    const parentId = node.parentId;
    const isRoot   = node.type === 'root';

    emptyEl.style.display = 'none';
    formEl.style.display  = '';
    footEl.style.display  = '';

    if (DEPT_MGR.mode === 'create') {
      if (titleEl) titleEl.textContent = '새 부서 추가';
      actionsEdit.style.display = 'none';
      actionsCreate.style.display = 'flex';
    } else {
      if (titleEl) titleEl.textContent = '부서 정보';
      actionsEdit.style.display = 'flex';
      actionsCreate.style.display = 'none';
    }

    /* 구분 — 부모가 허용하는 타입이 2개 이상이면 select, 아니면 pill 만 */
    const typeEl  = document.getElementById('emp-dept-type');
    const typeSel = document.getElementById('emp-dept-type-select');
    const parentNode = DEPTS.find(d => d.id === parentId);
    const allowed = parentNode ? allowedChildTypes(parentNode.type) : [];
    const canChangeType = !isRoot && allowed.length >= 2;
    if (typeEl) {
      typeEl.className = 'pill ' +
        (node.type === 'hq'   ? 'pill--soft-blue'
        : node.type === 'team' ? 'pill--soft-orange'
        : node.type === 'part' ? 'pill--soft-success'
        : 'pill--soft-gray');
      typeEl.textContent = isRoot ? '회사' : deptTypeLabel(node.type);
      typeEl.style.display = canChangeType ? 'none' : '';
    }
    if (typeSel) {
      if (canChangeType) {
        typeSel.innerHTML = allowed.map(t =>
          `<option value="${t}"${t === node.type ? ' selected' : ''}>${deptTypeLabel(t)}</option>`
        ).join('');
        typeSel.style.display = '';
        typeSel.disabled = false;
      } else {
        typeSel.style.display = 'none';
      }
    }

    /* 부서명 — root 는 read-only */
    const nameEl = document.getElementById('emp-dept-name');
    if (nameEl) {
      nameEl.value = node.name || '';
      nameEl.disabled = isRoot;
    }

    /* 상위 소속 — root 가 아니면 select 로 부모 변경 가능 (자기 자신/자손은 옵션에서 제외) */
    const parentEl = document.getElementById('emp-dept-parent');
    const parentSel = document.getElementById('emp-dept-parent-select');
    if (parentEl && parentSel) {
      if (isRoot) {
        parentEl.style.display = '';
        parentEl.textContent = '—';
        parentSel.style.display = 'none';
      } else {
        /* select 옵션 — 자신과 자손 트리는 제외 (cycle 방지) */
        const descendants = new Set([node.id]);
        function collect(pid) { DEPTS.forEach(d => { if (d.parentId === pid) { descendants.add(d.id); collect(d.id); } }); }
        collect(node.id);
        const candidates = DEPTS.filter(d => !descendants.has(d.id));
        /* 타입 정책 — 새 부모의 type 이 현재 노드 type 을 허용해야 함 */
        const canHostType = (parentType, childType) => allowedChildTypes(parentType).includes(childType) || (childType === 'team' && parentType === 'root');
        parentSel.innerHTML = candidates
          .filter(c => canHostType(c.type, node.type))
          .map(c => `<option value="${esc(c.id)}"${c.id === parentId ? ' selected' : ''}>${esc(deptParentPath(c.id))}</option>`).join('');
        parentEl.style.display = 'none';
        parentSel.style.display = '';
      }
    }

    /* 기본 근무조 — 근무조 설정(App.AttShifts) 마스터에서 선택. 부서(부서명) 기준 저장. 회사(root)는 미적용. */
    const dfShiftField = document.getElementById('emp-dept-default-shift-field');
    const dfShiftEl = document.getElementById('emp-dept-default-shift');
    if (dfShiftField) dfShiftField.style.display = isRoot ? 'none' : '';
    if (dfShiftEl && !isRoot) {
      const A = window.App || {};
      const master = (A.AttShifts && A.AttShifts.list) ? A.AttShifts.list() : [];
      /* 모달 세션 동안은 node.defaultShift 가 작업 기준값(변경건수 diff 대상) */
      const cur = node.defaultShift || '';
      dfShiftEl.innerHTML = `<option value="" disabled${cur ? '' : ' selected'}>선택하세요</option>` + master.map(s =>
        `<option value="${esc(s.code)}"${s.code === cur ? ' selected' : ''}>${esc(s.code)} · ${esc(s.label || s.code)} (${esc(s.start)}~${esc(s.end)}${s.isNight ? ' · 야간' : ''})</option>`
      ).join('');
    }

    /* 상태 + 인원 */
    const statusEl  = document.getElementById('emp-dept-status');
    const memberEl  = document.getElementById('emp-dept-member-count');
    if (statusEl) {
      const active = node.active !== false;
      statusEl.className = active ? 'pill pill--success' : 'pill pill--soft-gray';
      statusEl.textContent = active ? '활성' : '비활성';
    }
    if (memberEl) memberEl.textContent = `${getEmpsInDept(node.id).length}명`;

    /* 좌측 head 위/아래 순서 버튼 활성화 — root 가 아니고, 형제 노드 사이에서 이동 가능할 때만 */
    const modalEl = document.getElementById('modal-emp-dept-manage');
    const upBtn = modalEl && modalEl.querySelector('[data-emp-dept-move-up]');
    const dnBtn = modalEl && modalEl.querySelector('[data-emp-dept-move-down]');
    if (upBtn && dnBtn) {
      if (isRoot || !DEPT_MGR.selectedId) {
        upBtn.disabled = true; dnBtn.disabled = true;
      } else {
        const siblings = DEPTS.filter(d => d.parentId === parentId);
        const idx = siblings.findIndex(d => d.id === node.id);
        upBtn.disabled = idx <= 0;
        dnBtn.disabled = idx < 0 || idx >= siblings.length - 1;
      }
    }

    /* edit 모드 footer — 비활성화/활성화 버튼 라벨 동기화, root 면 일부 액션 비활성 */
    if (DEPT_MGR.mode === 'edit') {
      const toggleBtn = footEl.querySelector('[data-emp-dept-toggle-active]');
      const deleteBtn = footEl.querySelector('[data-emp-dept-delete]');
      /* 소속 인원(자손 포함)이 1명이라도 있으면 비활성화·삭제 불가 */
      const hasMembers = getEmpsInDept(node.id).length > 0;
      const isActive = node.active !== false;
      if (toggleBtn) {
        toggleBtn.textContent = isActive ? '비활성화' : '활성화';
        /* 비활성화는 인원 있으면 불가. 활성화는 항상 허용. */
        toggleBtn.disabled = isRoot || (isActive && hasMembers);
        toggleBtn.title = (isActive && hasMembers) ? '소속 인원이 있어 비활성화할 수 없습니다.' : '';
      }
      if (deleteBtn) {
        deleteBtn.disabled = isRoot || hasMembers;
        deleteBtn.title = hasMembers ? '소속 인원이 있어 삭제할 수 없습니다.' : '';
      }
      /* [저장] 버튼은 폼(이름/구분)이 변경됐을 때만 노출 */
      updateNodeSaveVisibility();
    }
  }

  function selectDept(id) {
    DEPT_MGR.selectedId = id;
    DEPT_MGR.mode = 'edit';
    renderNTree();
    renderDeptDetail();
  }
  /* 같은 부모 안에서 형제 노드 위/아래로 이동 (dir = -1 위, +1 아래) */
  function moveDept(dir) {
    if (!DEPT_MGR.selectedId) return;
    const node = DEPTS.find(d => d.id === DEPT_MGR.selectedId);
    if (!node || node.type === 'root') return;
    /* DEPTS 안에서 같은 parentId 형제 인덱스 swap. 두 절대 인덱스도 함께 swap. */
    const sameParent = DEPTS.filter(d => d.parentId === node.parentId);
    const siblingIdx = sameParent.indexOf(node);
    const target = sameParent[siblingIdx + dir];
    if (!target) return;
    const a = DEPTS.indexOf(node);
    const b = DEPTS.indexOf(target);
    DEPTS[a] = target;
    DEPTS[b] = node;
    renderNTree();
    renderDeptDetail();
    if (document.getElementById('hr-emp-tree')) renderTreeOnly();
  }
  function clearDeptSelection() {
    DEPT_MGR.selectedId = null;
    DEPT_MGR.mode = 'empty';
    renderNTree();
    renderDeptDetail();
  }

  function openDeptManageModal() {
    /* 진입 시점의 조직 상태를 baseline 으로 스냅샷 — 이후 변경분을 diff 로 추적 */
    syncNodeDefaultShifts();
    DEPT_BASELINE = cloneDepts();
    clearDeptSelection();
    renderNTree();
    recomputeOrgDirty();
    openModal('modal-emp-dept-manage');
  }

  /* + 클릭 → 즉시 트리에 신규 노드 추가 (DEPTS 에 push) 후 우측 패널에 create 모드.
   *   - 부모가 허용하는 첫 번째 타입을 기본값으로 사용 (예: hq → 'team')
   *   - 사용자가 우측 패널의 타입 select 로 변경 가능
   *   - 부서명은 우측 패널 input 에서 자동 select 되어 즉시 입력 가능
   *   - [추가] → edit 모드로 전환, [취소] → 방금 추가한 노드 제거 */
  function startCreateChild(parentId) {
    const parent = DEPTS.find(d => d.id === parentId);
    if (!parent) return;
    const allowed = allowedChildTypes(parent.type);
    if (!allowed.length) return;
    const type = allowed[0];
    const defaultName = type === 'hq' ? '새 본부'
                      : type === 'team' ? '새 팀'
                      : type === 'part' ? '새 파트' : '새 부서';
    const id = genDeptId();
    const node = { id, parentId, name: defaultName, type, active: true };
    DEPTS.push(node);
    /* 부모 노드가 트리에서 펼쳐져 있어야 신규 자식이 보임 */
    DEPT_MGR.selectedId = id;
    DEPT_MGR.mode = 'create';
    renderNTree();
    /* 부모 li 가 닫혀있으면 펼치기 */
    const host = document.getElementById('emp-dept-tree');
    if (host) {
      const parentLi = host.querySelector(`li[data-id="${parent.id}"]`);
      if (parentLi) parentLi.classList.add('is-open');
    }
    renderDeptDetail();
    setTimeout(() => {
      const nameEl = document.getElementById('emp-dept-name');
      if (nameEl) { nameEl.focus(); nameEl.select(); }
    }, 0);
  }
  /* [추가] 버튼 — 폼 값(부서명/타입) 적용 후 create→edit 전환. 노드는 이미 DEPTS 에 있음. */
  function commitCreate() {
    if (DEPT_MGR.mode !== 'create') return;
    const node = DEPTS.find(d => d.id === DEPT_MGR.selectedId);
    if (!node) return;
    const nameEl = document.getElementById('emp-dept-name');
    const typeSel = document.getElementById('emp-dept-type-select');
    const v = (nameEl?.value || '').trim();
    if (!v) {
      window.toast && window.toast('부서명을 입력해주세요.', 'warning');
      nameEl?.focus();
      return;
    }
    node.name = v;
    if (typeSel && typeSel.style.display !== 'none' && typeSel.value) {
      node.type = typeSel.value;
    }
    /* 기본 근무조 필수 — 미선택 시 추가 차단, 최종 부서명 기준으로 저장 */
    const dfSel = document.getElementById('emp-dept-default-shift');
    const dfCode = dfSel ? dfSel.value : '';
    if (!dfCode) {
      window.toast && window.toast('기본 근무조를 선택해주세요.', 'warning');
      dfSel && dfSel.focus();
      return;
    }
    node.defaultShift = dfCode;
    if (window.App && App.AttWorkPolicy && App.AttWorkPolicy.setDeptDefaultShift) {
      App.AttWorkPolicy.setDeptDefaultShift(node.name, dfCode);
    }
    DEPT_MGR.mode = 'edit';
    renderNTree();
    renderDeptDetail();
    if (document.getElementById('hr-emp-tree')) renderTreeOnly();
    window.toast && window.toast(`${deptTypeLabel(node.type)} "${v}" 추가됨`, 'success');
  }
  /* [취소] 버튼 — 방금 추가한 노드 제거 + empty 모드로 복귀 */
  function cancelCreate() {
    if (DEPT_MGR.mode !== 'create') return;
    const idx = DEPTS.findIndex(d => d.id === DEPT_MGR.selectedId);
    if (idx >= 0) DEPTS.splice(idx, 1);
    clearDeptSelection();
  }
  function saveEdit() {
    if (DEPT_MGR.mode !== 'edit') return;
    const node = DEPTS.find(d => d.id === DEPT_MGR.selectedId);
    if (!node) return;
    if (node.type === 'root') return;  /* root 는 편집 불가 */
    const nameEl = document.getElementById('emp-dept-name');
    const typeSel = document.getElementById('emp-dept-type-select');
    const v = (nameEl?.value || '').trim();
    if (!v) {
      window.toast && window.toast('부서명을 입력해주세요.', 'warning');
      nameEl?.focus();
      return;
    }
    /* 기본 근무조 필수 — 미선택 시 저장 차단 */
    const dfSel = document.getElementById('emp-dept-default-shift');
    const dfCode = dfSel ? dfSel.value : '';
    if (!dfCode) {
      window.toast && window.toast('기본 근무조를 선택해주세요.', 'warning');
      dfSel && dfSel.focus();
      return;
    }
    const A = window.App || {};
    /* 노드 작업값 기준으로 기본 근무조 변경 여부 판정 (변경건수 diff 반영) */
    const defaultChanged = dfCode !== (node.defaultShift || '');
    let changed = false;
    if (v !== node.name) { node.name = v; changed = true; }
    if (typeSel && typeSel.style.display !== 'none' && typeSel.value && typeSel.value !== node.type) {
      node.type = typeSel.value;
      changed = true;
    }
    /* 노드에 기본 근무조 반영(변경건수 추적) + 최종 부서명 기준으로 저장소 반영 */
    node.defaultShift = dfCode;
    if (A.AttWorkPolicy && A.AttWorkPolicy.setDeptDefaultShift) {
      A.AttWorkPolicy.setDeptDefaultShift(node.name, dfCode);
    }
    if (changed || defaultChanged) {
      renderNTree();
      renderDeptDetail();
      if (document.getElementById('hr-emp-tree')) renderTreeOnly();
      window.toast && window.toast('부서 정보가 반영되었습니다. [조직도 저장]을 눌러 변경 이력에 기록하세요.', 'success');
    }
  }
  function toggleActive(id) {
    const d = DEPTS.find(x => x.id === id);
    if (!d) return;
    if (d.type === 'root') return;
    /* 비활성화는 소속 인원이 있으면 불가 (활성화는 허용) */
    if (d.active !== false && getEmpsInDept(id).length > 0) {
      window.toast && window.toast('소속 인원이 있는 부서는 비활성화할 수 없습니다.', 'warning');
      return;
    }
    d.active = (d.active === false);
    renderNTree();
    renderDeptDetail();
    if (document.getElementById('hr-emp-tree')) renderTreeOnly();
  }
  function deleteNode(id) {
    const d = DEPTS.find(x => x.id === id);
    if (!d) return;
    if (d.type === 'root') return;
    const hasKids = DEPTS.some(x => x.parentId === id);
    const hasEmps = getEmpsInDept(id).length > 0;
    if (hasKids) {
      window.toast && window.toast('하위 부서가 있는 부서는 삭제할 수 없습니다. 먼저 하위를 정리해주세요.', 'warning');
      return;
    }
    if (hasEmps) {
      window.toast && window.toast('소속 인원이 있는 부서는 삭제할 수 없습니다.', 'warning');
      return;
    }
    if (!confirm('이 부서를 삭제할까요?')) return;
    const idx = DEPTS.findIndex(x => x.id === id);
    if (idx >= 0) DEPTS.splice(idx, 1);
    clearDeptSelection();
    if (document.getElementById('hr-emp-tree')) renderTreeOnly();
  }
  function bindNTree() {
    const modal = document.getElementById('modal-emp-dept-manage');
    if (!modal || modal.dataset.bound) return;
    modal.dataset.bound = '1';

    /* 트리 클릭 — 행 선택/펼침, + 버튼 */
    modal.addEventListener('click', (e) => {
      /* 승인 대기 중 — 편집성 동작 차단 (선택/펼침/이력/닫기는 허용) */
      if (isDeptApprovalPending() && e.target.closest('[data-ntree-add],[data-emp-dept-save],[data-emp-dept-delete],[data-emp-dept-toggle-active],[data-emp-dept-create],[data-emp-dept-cancel],[data-emp-org-save],[data-emp-dept-move-up],[data-emp-dept-move-down]')) {
        guardDeptApproval();
        return;
      }
      const li = e.target.closest('li[data-id]');
      if (li) {
        const id = li.dataset.id;
        const node = DEPTS.find(d => d.id === id);
        if (!node) return;
        if (e.target.closest('[data-ntree-toggle]')) {
          li.classList.toggle('is-open');
          return;
        }
        if (e.target.closest('[data-ntree-add]')) {
          /* + 버튼 → 즉시 하위 노드 추가 (트리에 push, 우측 패널 create 모드) */
          e.stopPropagation();
          startCreateChild(id);
          return;
        }
        /* 행 (이름/아이콘) 클릭 — 선택 + 우측 패널 표시 */
        if (e.target.closest('[data-row]') && !e.target.closest('input,button')) {
          selectDept(id);
          return;
        }
      }

      /* 우측 패널 action 버튼 */
      if (e.target.closest('[data-emp-dept-save]')) { saveEdit(); return; }
      if (e.target.closest('[data-emp-dept-delete]')) {
        if (DEPT_MGR.selectedId) deleteNode(DEPT_MGR.selectedId);
        return;
      }
      if (e.target.closest('[data-emp-dept-toggle-active]')) {
        if (DEPT_MGR.selectedId) toggleActive(DEPT_MGR.selectedId);
        return;
      }
      if (e.target.closest('[data-emp-dept-create]')) { commitCreate(); return; }
      if (e.target.closest('[data-emp-dept-cancel]')) { cancelCreate(); return; }

      /* footer — 조직도 전체 저장(스냅샷+이력) / 변경 이력 보기 */
      if (e.target.closest('[data-emp-org-save]'))    { saveOrgSnapshot(); return; }
      if (e.target.closest('[data-emp-org-history]')) { openOrgHistory(); return; }

      /* 좌측 head — 순서 위/아래 + split 폴딩 */
      if (e.target.closest('[data-emp-dept-move-up]'))   { moveDept(-1); return; }
      if (e.target.closest('[data-emp-dept-move-down]')) { moveDept(+1); return; }
      const collapseBtn = e.target.closest('[data-split-collapse]');
      if (collapseBtn) {
        const root = modal.querySelector('#emp-dept-split');
        if (root) root.classList.add('is-left-collapsed');
        return;
      }
      const expandBtn = e.target.closest('[data-split-expand]');
      if (expandBtn) {
        const root = modal.querySelector('#emp-dept-split');
        if (root) root.classList.remove('is-left-collapsed');
        return;
      }

      /* 모달 외부/X 클릭 — create 모드라면 자동 취소(노드 제거) */
      if (e.target.matches('[data-modal-close]') || e.target === modal) {
        if (DEPT_MGR.mode === 'create') cancelCreate();
        /* 저장(스냅샷)하지 않은 변경이 있으면 닫기 전에 확인 */
        const pending = DEPT_BASELINE ? diffOrg(DEPT_BASELINE, DEPTS) : [];
        if (pending.length && !window.confirm(`저장하지 않은 조직도 변경이 ${pending.length}건 있습니다.\n변경 이력에 저장하지 않고 닫을까요?`)) {
          return;
        }
        closeAllModals();
      }
    });

    /* 상위 소속 select 변경 — 즉시 트리 반영 */
    const parentSel = document.getElementById('emp-dept-parent-select');
    if (parentSel) {
      parentSel.addEventListener('change', () => {
        const node = DEPTS.find(d => d.id === DEPT_MGR.selectedId);
        if (!node || node.type === 'root') return;
        if (parentSel.value && parentSel.value !== node.parentId) {
          node.parentId = parentSel.value;
          renderNTree();
          renderDeptDetail();
          if (document.getElementById('hr-emp-tree')) renderTreeOnly();
        }
      });
    }

    /* 부서명 입력 — 노드 원본과 달라지면 [저장] 버튼 노출 (수정 시에만 보임) */
    const nameInput = document.getElementById('emp-dept-name');
    if (nameInput) nameInput.addEventListener('input', updateNodeSaveVisibility);

    /* 우측 패널 타입 select 변경 — 즉시 미리보기 (실제 반영은 [추가]/[저장] 시) */
    const typeSel = document.getElementById('emp-dept-type-select');
    if (typeSel) {
      typeSel.addEventListener('change', () => {
        /* 트리에 있는 신규/기존 노드 type 즉시 갱신 */
        const node = DEPTS.find(d => d.id === DEPT_MGR.selectedId);
        if (!node) return;
        if (typeSel.value && typeSel.value !== node.type) {
          node.type = typeSel.value;
          renderNTree();
          renderDeptDetail();
        }
      });
    }

    /* 기본 근무조 select 변경 — 즉시 저장하지 않고 [저장] 버튼을 노출(실제 반영은 [저장] 시) */
    const dfShiftSel = document.getElementById('emp-dept-default-shift');
    if (dfShiftSel) {
      dfShiftSel.addEventListener('change', updateNodeSaveVisibility);
    }
  }

  function initEmployeePage() {
    const pageEl = document.getElementById('page-hr-employee');
    if (!pageEl) return;
    let built = false;
    pageEl.__onShow = () => {
      if (!built) {
        /* 임직원 관리(App.HRInfoMgmt)와 동일 범위 — 퇴사자만 제외하고 전원 노출 */
        STATE.employees = makeEmployees().filter(e => e && e.active !== false);
        STATE.requests  = makeRequests(STATE.employees);
        ensureHrCardInit();
        bindNTree();
        built = true;
      }
      // 매번 메인 뷰로 진입
      buildMainView(pageEl);
    };
  }

  /* ============ 공유 API — 다른 페이지(예: 임직원 관리) 에서 부서 관리 모달 호출 ============
     · open(opts)  — 모달 오픈. opts.onClose 콜백은 모달 종료 시 1회 호출.
     · getDepts()  — 현재 DEPTS 배열 (live reference) — 다른 페이지가 부서 변경을 동기화하는 용도. */
  App.HrDeptManage = {
    open(opts) {
      /* 임직원 현황 페이지가 한 번도 진입되지 않았어도 동작하도록 핸들러 바인딩 보장.
         ensureHrCardInit / bindNTree 는 모두 멱등 가드가 있어 중복 호출 안전. */
      ensureHrCardInit();
      bindNTree();
      openDeptManageModal();
      const cb = opts && opts.onClose;
      if (typeof cb === 'function') {
        const modal = document.getElementById('modal-emp-dept-manage');
        if (!modal) return;
        const observer = new MutationObserver(() => {
          if (!modal.classList.contains('is-open')) {
            observer.disconnect();
            try { cb(); } catch (_) { /* swallow */ }
          }
        });
        observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
      }
    },
    getDepts() { return DEPTS; },
  };

  const prev = App.initPages;
  App.initPages = function () {
    if (typeof prev === 'function') prev();
    initEmployeePage();
  };
})();
