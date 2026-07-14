/* =========================================================
 * Page: HR > 발령 및 계약 > 발령
 *
 * 입사자 관리(App.HRMembers)에서 입사확정된 사람에 대해
 * 전보 / 승진 / 수습해제 발령을 처리하는 화면.
 *
 *   목록 view(list):
 *     그리드: 체크박스 + No + 발령번호 + 성명(링크) + 발령유형 + 발령내용
 *           + 발령일 + 상태 + 발령 담당자 + 작성일시
 *     [발령] 버튼     → 신규 발령 작성 화면(editor) 진입
 *     [발령 취소] 버튼 → 선택된 「예정」 항목을 「취소」 상태로 변경
 *     성명 클릭       → 사령장(전보·수습해제) / 임명장(승진) OffCanvas 미리보기
 *     검색 필터: 작성일 기본 1개월 / 성명·사번·발령번호 / 발령유형 5종 + 상태 3종
 *
 *   작성 view(editor) — 근로계약서 작성 화면과 동일한 풀스크린 split 패턴:
 *     좌: 발령 정보 폼(유형 segmented tabs / 대상자 picker / 발령일 / 유형별 필드)
 *     우: 사령장/임명장 실시간 미리보기 (doc-paper)
 *     [발령 등록] → 발령일 기준 status 자동 결정 (오늘/과거=완료, 미래=예정)
 *
 *   상태:
 *     pending(예정)   : 미래 발령일로 등록된 건 (취소 가능)
 *     done(완료)      : 시행 완료 (수정·취소 불가)
 *     cancelled(취소) : 예정 상태에서 취소된 건
 *
 * UI Kit 재사용:
 *   .search / .toolbar / .tbl / .pill / .pagination
 *   .page-bar / .split / .doc-editor / .doc-paper / .sig-block
 *   .emp-chip / .picker-list / .modal / .offcanvas / .tabs--segmented
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  /* ============ 환경 / 회사 정보 ============ */
  const HR_NAME = '정혜진';
  const COMPANY = '주식회사 성원애드피아';
  const COMPANY_REPR = '윤성수';
  const COMPANY_SEAL_TEXT = '성원\n애드피아';
  const TODAY = '2026-05-13';

  /* ============ 발령 상태 / 유형 ============ */
  const STATUS = {
    pending:   { label: '예정', pill: 'info' },
    done:      { label: '완료', pill: 'success' },
    cancelled: { label: '취소', pill: 'danger' },
  };

  /* 발령 유형 5가지 — 사령장/임명장 구분 포함 */
  /* 수습해제는 별도 발령 종류로 처리하지 않음 — 「수습 평가」 후속 처리에서 자동 수행되도록 통합됨. */
  const KIND_LIST = ['전보', '승진'];
  const KIND_DOC = {
    '전보':     '사령장',
    '승진':     '임명장',
    '수습해제': '사령장',
  };

  /* ============ 마스터 (입사자/조직 데이터에서 수집) ============ */
  const DEPTS = ['경영지원본부', '생산본부', '개발팀', '홍보팀', '인사팀', '재무팀'];
  const RANKS = ['대표이사', '부대표이사', '전무이사', '상무이사', '부장', '차장', '과장', '대리', '주임', '사원'];
  const POSITIONS = ['임원', '본부장', '소장', '팀장', '파트장', '팀원', '파트원'];
  const JOBS = ['인사', '재무', '총무', '생산관리', '품질관리', '개발', '디자인'];

  /* 부서별 근무 정책(App.AttWorkPolicy) — 전보 시 새 부서의 근무형태/사용 스케줄 산출. */
  function deptPolicyOf(deptName) {
    const WP = window.App && App.AttWorkPolicy;
    return (WP && WP.deptPolicy && deptName) ? WP.deptPolicy(deptName)
      : { regular: false, shift: false, regularSchedules: [], shiftSchedules: [] };
  }
  /* 부서 × 근무형태(regular/shift) 의 사용 근무조 코드 */
  function typeSchedCodes(deptName, type) {
    const p = deptPolicyOf(deptName);
    return type === 'shift' ? (p.shiftSchedules || []) : type === 'regular' ? (p.regularSchedules || []) : [];
  }
  function shiftLabelOf(code) {
    if (!code) return '';
    const s = (window.App && App.AttShifts && App.AttShifts.get) ? App.AttShifts.get(code) : null;
    return s ? (s.label || (code + '조')) : (code + '조');
  }
  /* 근무조 옵션 라벨 — 이름 + 시간 (예: A조 (07:00~16:00 · 야간)) */
  function shiftOptionLabel(code) {
    const s = (window.App && App.AttShifts && App.AttShifts.get) ? App.AttShifts.get(code) : null;
    if (!s) return code + '조';
    return `${s.label || (code + '조')} (${s.start}~${s.end}${s.isNight ? ' · 야간' : ''})`;
  }
  const HR_USERS = ['정혜진', '윤민지', '정혜진', '정혜진', '윤민지'];

  /* ============ 헬퍼 ============ */
  function $(s, r=document) { return r.querySelector(s); }
  function $$(s, r=document) { return Array.from(r.querySelectorAll(s)); }
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function ymd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
  /* 표시 전용 날짜 포맷 (데이터/키 변형 금지 — 화면 렌더 시점에서만 사용) */
  function fmtD(s) {
    if (!s) return s;
    const m = String(s).match(/^(\d{4})[-./](\d{2})[-./](\d{2})/);
    return m ? m[1].slice(2) + '/' + m[2] + '/' + m[3] : s;
  }
  function fmtDT(s) {
    if (!s) return s;
    const m = String(s).match(/^(\d{4})[-./](\d{2})[-./](\d{2})[ T]?(\d{2}:\d{2})?/);
    if (!m) return s;
    const d = m[1].slice(2) + '/' + m[2] + '/' + m[3];
    return m[4] ? d + '   ' + m[4] : d;
  }
  function nowStamp() {
    const d = new Date(TODAY + 'T09:00');
    return `${ymd(d)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  function pick(arr, i) { return arr[i % arr.length]; }
  function statusPill(code) {
    const s = STATUS[code] || STATUS.pending;
    return `<span class="pill pill--${s.pill}">${esc(s.label)}</span>`;
  }
  function empAvatar(emp, size) {
    if (!emp) return '';
    const ch = (emp.name || '?').charAt(0);
    const idx = ((emp.colorIdx || (emp.id || '').charCodeAt(2) % 6) + 1);
    return `<span class="av av--${size || 'md'} av--c${idx}">${esc(ch)}</span>`;
  }

  /* ============ 입사자 데이터 (App.HRMembers 공유) ============
   *   입사확정된 사람만 발령 대상 — status === 'completed' (인사카드 생성 완료)
   *   미로드/없을 때를 위한 fallback 내장 */
  function loadEmployees() {
    const members = (window.App && App.HRMembers && App.HRMembers.list)
      ? App.HRMembers.list()
      : [];
    const completed = members.filter(m => m.status === 'completed');
    if (completed.length) {
      return completed.map((m, i) => Object.assign({}, m, { colorIdx: (i % 6) + 1 }));
    }
    /* fallback — hr-members-data 미로드 케이스 (방어용, 일반적으로 발생 안 함) */
    return [
      { id:'SW260101', name:'김지훈', dept:'경영지원본부', job:'인사',     rank:'사원',   position:'팀원', colorIdx:1 },
      { id:'SW260102', name:'이서연', dept:'생산본부',     job:'생산관리', rank:'대리',   position:'팀원', colorIdx:2 },
      { id:'SW260103', name:'박민준', dept:'개발팀',       job:'개발',     rank:'과장',   position:'팀장', colorIdx:3 },
      { id:'SW260104', name:'최예린', dept:'홍보팀',       job:'디자인',   rank:'사원',   position:'팀원', colorIdx:4 },
      { id:'SW260105', name:'정현우', dept:'인사팀',       job:'인사',     rank:'대리',   position:'팀원', colorIdx:5 },
      { id:'SW260106', name:'한지수', dept:'재무팀',       job:'재무',     rank:'차장',   position:'본부장', colorIdx:6 },
    ];
  }
  let EMPLOYEES = [];

  /* ============ Mock 발령 데이터 ============ */
  function buildContent(kind, emp, i) {
    if (kind === '전보') {
      const toDept = pick(DEPTS.filter(d => d !== emp.dept), i);
      return { text: `${emp.dept} → ${toDept}`, fromDept: emp.dept, toDept, toRank: emp.rank, toPosition: emp.position };
    }
    if (kind === '승진') {
      /* RANKS 는 상위(idx 0=대표이사) 부터 하위(idx 끝=사원) 순서 — 승진은 idx-1 */
      const fromIdx = RANKS.indexOf(emp.rank);
      const toRank = fromIdx > 0 ? RANKS[fromIdx - 1] : emp.rank;
      const toPosition = pick(POSITIONS, i);
      return { text: `${emp.rank} → ${toRank}`, toRank, toPosition, toDept: emp.dept };
    }
    if (kind === '수습해제') {
      return { text: '수습 해제 (정규직 전환)', toDept: emp.dept, toRank: emp.rank, toPosition: emp.position };
    }
    return { text: '' };
  }

  function makeMock() {
    if (!EMPLOYEES.length) return [];

    /* 작성일 1개월 내 범위에 기본 검색에서 잘 잡히도록 분포.
       수습해제는 「수습 평가」 화면의 후속 처리로 자동 수행되므로 발령 목록에서 제외. */
    const cases = [
      { kind:'전보',     status:'pending',   regOffset:-2,  effectOffset:7  },
      { kind:'승진',     status:'pending',   regOffset:-1,  effectOffset:14 },
      { kind:'전보',     status:'done',      regOffset:-18, effectOffset:-10 },
      { kind:'승진',     status:'cancelled', regOffset:-7,  effectOffset:3  },
      { kind:'전보',     status:'pending',   regOffset:-4,  effectOffset:8  },
      { kind:'승진',     status:'done',      regOffset:-25, effectOffset:-18 },
      { kind:'전보',     status:'done',      regOffset:-15, effectOffset:-8 },
      { kind:'승진',     status:'pending',   regOffset:-2,  effectOffset:13 },
      { kind:'전보',     status:'pending',   regOffset:-1,  effectOffset:9  },
    ];

    return cases.map((c, i) => {
      const emp = EMPLOYEES[i % EMPLOYEES.length];
      const regDate = ymd(addDays(new Date(TODAY), c.regOffset));
      const effectDate = ymd(addDays(new Date(TODAY), c.effectOffset));
      const reg = `${regDate} ${String(9 + (i % 8)).padStart(2,'0')}:${String((i * 7) % 60).padStart(2,'0')}`;
      const content = buildContent(c.kind, emp, i);
      const seq = String(i + 1).padStart(4, '0');
      return {
        id: `APT-2026-${seq}`,
        kind: c.kind,
        empId: emp.id,
        empName: emp.name,
        empDept: emp.dept,
        empRank: emp.rank,
        empJob: emp.job,
        empPosition: emp.position,
        content,
        contentText: content.text,
        effectDate,
        status: c.status,
        registeredBy: HR_USERS[i % HR_USERS.length],
        registeredAt: reg,
      };
    });
  }

  /* ============ STATE ============ */
  const STATE = {
    rows: [],
    filtered: [],
    page: 1,
    pageSize: 20,
    filter: null,
    selectedIds: new Set(),
    view: 'list',        // 'list' | 'editor'
  };

  /* ============ EDIT (작성 화면) ============
   *   emps: 대상 직원 배열 (1명 이상). 1건 등록 시 전 직원에게 동일 발령이 일괄 적용된다.
   *   유형별 추가 정보(toDept/toRank/...)는 전 직원 공통값으로 사용. */
  const EDIT = {
    kind: '전보',
    emps: [],
    effectDate: TODAY,
    /* 유형별 추가 정보 */
    toDept: '',
    toRank: '',
    toPosition: '',
  };

  /* ============ 필터 ============ */
  function applyFilter() {
    const p = STATE.filter || {};
    const from  = p.from || '';
    const to    = p.to || '';
    const basis = p.dateKey || p.basis || 'registeredAt';   // 'registeredAt'(작성일) | 'effectDate'(발령일)
    const cond  = p.condition || 'empName';
    const kw    = (p.keyword || '').trim().toLowerCase();
    const kindSel = (p.advanced && p.advanced.kind) || '';
    const statusSel = (p.advanced && p.advanced.statusText) || '';

    STATE.filtered = STATE.rows.filter(r => {
      const basisDate = basis === 'effectDate'
        ? (r.effectDate || '')
        : (r.registeredAt || '').slice(0, 10);
      if (from && basisDate < from) return false;
      if (to   && basisDate > to)   return false;
      if (kindSel && r.kind !== kindSel) return false;
      if (statusSel) {
        const stLabel = (STATUS[r.status] || {}).label;
        if (stLabel !== statusSel) return false;
      }
      if (kw) {
        const t = cond === 'empId' ? r.empId
                : cond === 'id'    ? r.id
                : r.empName;
        if (!String(t).toLowerCase().includes(kw)) return false;
      }
      return true;
    });
    const totalPages = Math.max(1, Math.ceil(STATE.filtered.length / STATE.pageSize));
    if (STATE.page > totalPages) STATE.page = 1;
  }

  /* =========================================================
   *  VIEW: LIST (목록)
   * ========================================================= */
  function renderListView(pageEl) {
    STATE.view = 'list';
    const C = App.Components;
    const searchHTML = C.searchPanel({
      showDateRange: true,
      /* 기간 기준 컬럼 dropdown (계약 관리와 동일한 표준 prop). 첫 항목이 기본.
         기본 1개월 범위가 자동 적용되므로, 예정(미래) 발령도 보이도록 기본은 작성일 기준. */
      dateColumns: [
        { key: 'registeredAt', label: '작성일' },
        { key: 'effectDate',   label: '발령일' },
      ],
      quick: ['today','week','m1','m3','m6','y1'],
      conditions: [
        { value: 'empName', label: '성명' },
        { value: 'empId',   label: '사번' },
        { value: 'id',      label: '발령번호' },
      ],
      placeholder: '성명 / 사번 / 발령번호로 검색',
      cols: 2,
      advanced: [
        { name: 'kind',       label: '유형', options: KIND_LIST },
        { name: 'statusText', label: '상태',     options: ['예정','완료','취소'] },
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
          <button class="btn btn--sm btn--primary" type="button" data-apt-new>
            ${window.Icons && window.Icons.plus || ''} 발령
          </button>
          <button class="btn btn--sm btn--danger" type="button" data-apt-cancel disabled>발령 취소</button>
        </div>
      </div>

      <div class="grid-wrap" style="flex:1;min-height:0;">
        <div class="grid-scroll">
          <table class="tbl tbl--hover">
            <thead>
              <tr>
                <th style="width:40px;text-align:center;"><input type="checkbox" data-apt-check-all aria-label="전체 선택" /></th>
                <th style="width:140px;">발령번호</th>
                <th style="width:90px;text-align:center;">유형</th>
                <th style="width:160px;">성명</th>
                <th>발령 내용</th>
                <th style="width:110px;text-align:center;">발령일</th>
                <th style="width:80px;text-align:center;">상태</th>
                <th style="width:100px;">발령 담당자</th>
                <th style="width:150px;">작성일시</th>
              </tr>
            </thead>
            <tbody id="apt-list-body"></tbody>
          </table>
        </div>
        <div class="pagination">
          <div class="pagination__info" id="apt-page-info"></div>
          <div class="pagination__right">
            <div class="pagination__size">
              <label>페이지당</label>
              <select class="select" id="apt-page-size">
                <option value="20">20</option>
                <option value="40">40</option>
                <option value="60">60</option>
                <option value="100">100</option>
              </select>
              <span>건</span>
            </div>
            <div class="pagination__list" id="apt-pagination"></div>
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
    }, { defaultQuick: 'y1' });   /* 발령일 기본 기간 = 최근 1년 */

    pageEl.addEventListener('click', (e) => {
      if (e.target.closest('[data-apt-new]'))    { openEditor(); return; }
      if (e.target.closest('[data-apt-cancel]')) { doCancel(); return; }
    });

    $('[data-apt-check-all]', pageEl).addEventListener('change', (e) => {
      const checked = e.target.checked;
      const pageRows = STATE.filtered.slice((STATE.page-1)*STATE.pageSize, STATE.page*STATE.pageSize);
      pageRows.forEach(r => {
        if (checked) STATE.selectedIds.add(r.id);
        else         STATE.selectedIds.delete(r.id);
      });
      renderTable();
    });

    $('#apt-list-body', pageEl).addEventListener('change', (e) => {
      const cb = e.target.closest('input[type="checkbox"]');
      if (!cb) return;
      const tr = cb.closest('[data-apt-row]'); if (!tr) return;
      const id = tr.dataset.aptRow;
      if (cb.checked) STATE.selectedIds.add(id);
      else            STATE.selectedIds.delete(id);
      tr.classList.toggle('is-selected', cb.checked);
      updateBulkButtons();
      updateCheckAll();
    });

    $('#apt-list-body', pageEl).addEventListener('click', (e) => {
      /* 성명 클릭 — 인사정보카드 offcanvas 열기 */
      const empLink = e.target.closest('[data-apt-emp-card]');
      if (empLink) {
        e.preventDefault();
        const tr = empLink.closest('[data-apt-row]'); if (!tr) return;
        const row = STATE.filtered.find(r => r.id === tr.dataset.aptRow);
        if (!row) return;
        const member = EMPLOYEES.find(em => em.id === row.empId) || null;
        if (window.App && App.HRInfoCard && App.HRInfoCard.open) {
          App.HRInfoCard.open(Object.assign({
            id: row.empId, name: row.empName, dept: row.empDept,
            rank: row.empRank, position: row.empPosition, job: row.empJob,
            empType: 'regular', jobCat: 'office', site: '성수동', infoStatus: 'done',
          }, member || {}));
        }
        return;
      }
      /* 발령번호 클릭 — 사령장/임명장 미리보기 */
      const link = e.target.closest('[data-apt-doc-open]');
      if (!link) return;
      e.preventDefault();
      const tr = link.closest('[data-apt-row]'); if (!tr) return;
      openDocPreview(tr.dataset.aptRow);
    });

    $('#apt-pagination', pageEl).addEventListener('click', (e) => {
      const btn = e.target.closest('.pagination__btn');
      if (!btn || btn.disabled) return;
      const p = Number(btn.dataset.page);
      if (Number.isFinite(p)) { STATE.page = p; renderTable(); }
    });
    $('#apt-page-size', pageEl).addEventListener('change', (e) => {
      STATE.pageSize = Number(e.target.value);
      STATE.page = 1;
      renderTable();
    });
  }

  function renderTable() {
    const total = STATE.filtered.length;
    const start = (STATE.page - 1) * STATE.pageSize;
    const rows = STATE.filtered.slice(start, start + STATE.pageSize);

    const body = $('#apt-list-body'); if (!body) return;
    body.innerHTML = !rows.length
      ? `<tr><td colspan="9" style="text-align:center;color:var(--color-text-muted);padding:32px 0;">조건에 해당하는 발령이 없습니다.</td></tr>`
      : rows.map(r => {
          const sel = STATE.selectedIds.has(r.id);
          /* 성명 셀 — 24x24 사진 + 이름만 (부제 회색글씨 없음). photo 는 EMPLOYEES master 에서 조회. */
          const member = EMPLOYEES.find(e => e.id === r.empId) || null;
          const photo = (member && member.photoUrl) || '';
          const avatarHTML = photo
            ? `<img src="${esc(photo)}" alt="" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;" />`
            : `<span style="width:24px;height:24px;border-radius:50%;background:var(--color-active);color:var(--color-brand-primary);display:inline-flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;">${esc((r.empName || '?').charAt(0))}</span>`;
          return `
            <tr data-apt-row="${esc(r.id)}" class="${sel ? 'is-selected' : ''}">
              <td style="text-align:center;"><input type="checkbox" ${sel ? 'checked' : ''} /></td>
              <td><a href="#" data-apt-doc-open class="link-code">${esc(r.id)}</a></td>
              <td style="text-align:center;">${esc(r.kind)}</td>
              <td>
                <div style="display:flex;align-items:center;gap:6px;">
                  ${avatarHTML}
                  <a href="#" data-apt-emp-card style="color:var(--color-brand-primary);font-weight:var(--fw-medium);">${esc(r.empName)}</a>
                </div>
              </td>
              <td>${esc(r.contentText)}</td>
              <td style="text-align:center;">${esc(fmtD(r.effectDate))}</td>
              <td style="text-align:center;">${statusPill(r.status)}</td>
              <td>${esc(r.registeredBy || '-')}</td>
              <td>${esc(fmtDT(r.registeredAt))}</td>
            </tr>`;
        }).join('');

    const cnt = $('[data-count]');
    if (cnt) cnt.innerHTML = `<strong>${total.toLocaleString()}</strong>건`;

    const size = STATE.pageSize;
    const totalPages = Math.max(1, Math.ceil(total / size));
    if (STATE.page > totalPages) STATE.page = totalPages;
    $('#apt-page-info').textContent = total === 0
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
    $('#apt-pagination').innerHTML = btns.join('');

    const sel = $('#apt-page-size'); if (sel) sel.value = String(STATE.pageSize);

    updateBulkButtons();
    updateCheckAll();
  }

  function updateBulkButtons() {
    const selected = STATE.rows.filter(r => STATE.selectedIds.has(r.id));
    const has = selected.length > 0;
    const allPending = has && selected.every(r => r.status === 'pending');

    const btnCxl = $('[data-apt-cancel]');
    if (btnCxl) btnCxl.disabled = !allPending;

    /* 선택된 행이 있으면 [발령] 신규 생성은 비활성 — 발령 취소만 허용 */
    const btnNew = $('[data-apt-new]');
    if (btnNew) btnNew.disabled = has;

    const cnt = $('[data-sel-count]');
    if (cnt) cnt.textContent = has ? ` · 선택 ${selected.length}건` : '';
  }
  function updateCheckAll() {
    const all = $('[data-apt-check-all]'); if (!all) return;
    const pageRows = STATE.filtered.slice((STATE.page-1)*STATE.pageSize, STATE.page*STATE.pageSize);
    if (!pageRows.length) { all.checked = false; all.indeterminate = false; return; }
    const selectedCount = pageRows.filter(r => STATE.selectedIds.has(r.id)).length;
    all.checked = selectedCount === pageRows.length;
    all.indeterminate = selectedCount > 0 && selectedCount < pageRows.length;
  }

  /* ============ 발령 취소 (목록) ============ */
  function doCancel() {
    const selected = STATE.rows.filter(r => STATE.selectedIds.has(r.id));
    if (!selected.length) return;
    if (selected.some(r => r.status !== 'pending')) {
      window.toast && window.toast('「예정」 상태인 발령만 취소할 수 있습니다.', 'danger'); return;
    }
    window.sweet && window.sweet({
      icon: 'confirm',
      title: '발령 취소',
      text: `선택한 ${selected.length}건의 발령을 취소하시겠습니까?\n취소된 발령은 「취소」 상태로 보존됩니다.`,
      cancelText: '닫기', confirmText: `${selected.length}건 취소`,
      onConfirm: () => {
        selected.forEach(r => { r.status = 'cancelled'; });
        STATE.selectedIds.clear();
        applyFilter();
        renderTable();
        window.toast && window.toast(`${selected.length}건의 발령이 취소되었습니다.`, 'success');
      },
    });
  }

  /* =========================================================
   *  VIEW: EDITOR (발령 작성 — 풀스크린 split)
   * ========================================================= */
  function openEditor() {
    /* 기본값 초기화 */
    EDIT.kind = '전보';
    EDIT.emps = [];
    EDIT.effectDate = TODAY;
    EDIT.toDept = '';
    EDIT.toRank = '';
    EDIT.toPosition = '';
    EDIT.toDuty = '';
    /* Layer modal 패턴 — 페이지 전환 없이 모달로 발령 등록 폼 표시 */
    renderEditorView(document.getElementById('page-hr-appoint'));
    openAptModal();
  }
  function openAptModal() {
    const m = document.getElementById('modal-apt-create');
    if (!m) return;
    m.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    /* 닫기(✕)·취소 버튼 + 오버레이(backdrop) 클릭 → 작성 중 내용 확인 후 닫기.
       헤더/푸터 버튼은 index.html 정적 요소라 1회만 바인딩(중복 방지 플래그). */
    if (!m.dataset.closeBound) {
      m.dataset.closeBound = '1';
      m.querySelectorAll('[data-modal-close]').forEach(b => b.addEventListener('click', confirmLeaveEditor));
      m.addEventListener('click', (e) => { if (e.target === m) confirmLeaveEditor(); });
    }
  }
  function closeAptModal() {
    const m = document.getElementById('modal-apt-create');
    if (m) m.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  /* 발령 등록은 모달로 띄움. 본문(split: 좌측 폼 + 우측 미리보기) 을 modal__body 에 채운다.
   *   - 모달 footer 의 [발령 등록] 클릭 → 시스템 전자결재 모달 호출.
   *   - 기존 EDIT/EDIT.emps 등 상태는 그대로 사용. */
  function renderEditorView(pageEl) {
    const modal = document.getElementById('modal-apt-create');
    if (!modal) return;
    const body = modal.querySelector('#apt-edit-body');
    if (!body) return;

    body.innerHTML = `
      <div class="split" style="--split-left:380px;height:100%;">
        <aside class="split__left" style="display:flex;flex-direction:column;min-height:0;">
          <div class="split__head"><h3>발령 정보</h3></div>
          <div class="split__body">

            <div class="form-field">
              <label class="form-label is-required">유형</label>
              <div class="tabs tabs--segmented">
                <div class="tabs__nav">
                  ${KIND_LIST.map(k => `
                    <button type="button" class="tabs__tab ${EDIT.kind === k ? 'is-active' : ''}" data-apt-kind="${esc(k)}">${esc(k)}</button>
                  `).join('')}
                </div>
              </div>
            </div>

            <div class="form-field">
              <label class="form-label is-required">대상 직원
                <span class="t-muted" style="font-size:var(--fs-xs);font-weight:var(--fw-regular);margin-left:6px;">${esc(empScopeHint(EDIT.kind))}</span>
              </label>
              <div id="apt-edit-emp"></div>
              <div class="form-help" id="apt-edit-emp-msg"></div>
            </div>

            <div class="form-field">
              <label class="form-label is-required" for="apt-edit-effect">발령일</label>
              <input class="input input--full" type="date" id="apt-edit-effect" value="${esc(EDIT.effectDate)}" />
              <div class="form-help" id="apt-edit-effect-msg" style="color:var(--color-text-muted);">발령일이 미래면 「예정」, 오늘/과거면 「완료」 상태로 등록됩니다.</div>
            </div>

            <div id="apt-edit-kind-fields"></div>
          </div>
        </aside>

        <section class="split__right" style="display:flex;flex-direction:column;min-height:0;">
          <div class="split__head">
            <h3>${esc(KIND_DOC[EDIT.kind] || '사령장')} 미리보기</h3>
            <span class="t-muted" style="font-size:var(--fs-xs);">폼 값 변경 시 자동 반영</span>
          </div>
          <div class="doc-editor" style="flex:1;min-height:0;overflow:auto;">
            <div class="doc-editor__meta">
              <span>📄 ${esc(KIND_DOC[EDIT.kind] || '사령장')}</span>
              <span class="t-muted">·</span>
              <span class="t-muted">승인 후 PDF 자동 변환</span>
            </div>
            <div id="apt-edit-preview">${renderDocHTML(buildEditPreviewRow(), KIND_DOC[EDIT.kind] || '사령장', EDIT.kind === '승진')}</div>
          </div>
        </section>
      </div>
    `;

    renderEmpChip();
    renderKindFields();
    bindEditor(modal);
    validateEditor();
  }

  /** 작성 중인 EDIT 값을 미리보기용 row 형태로 변환
   *  대상자가 여러 명일 때는 대표 1명(첫 직원) 기준으로 헤더/푸터를 구성하고,
   *  대상자 표는 별도 renderDocHTML 에서 multiEmps 를 사용해 그린다. */
  function buildEditPreviewRow() {
    const emps = EDIT.emps;
    const e = emps[0] || null;
    const content = {
      text: '',
      fromDept: e ? e.dept : '',
      /* 전보 — 발령 부서/직무는 (대표)직원의 직원별 값 */
      toDept: EDIT.kind === '전보' ? (e ? (e.toDept || e.dept) : '') : (EDIT.toDept || (e ? e.dept : '')),
      /* 승진 — 직위/직책은 (대표)직원의 직원별 값 */
      toRank: EDIT.kind === '승진' ? (e ? (e.toRank || e.rank) : '') : (EDIT.toRank || (e ? e.rank : '')),
      toPosition: EDIT.kind === '승진' ? (e ? (e.toPosition || e.position) : '') : (EDIT.toPosition || (e ? e.position : '')),
      fromJob: e ? e.job : '',
      toJob: EDIT.kind === '전보' ? (e ? (e.toJob || e.job) : '') : (EDIT.toJob || (e ? e.job : '')),
    };
    return {
      id: '(자동 부여)',
      kind: EDIT.kind,
      empId:   e ? e.id   : '_______',
      empName: e ? e.name : '_______',
      empDept: e ? e.dept : '_______',
      empRank: e ? e.rank : '_______',
      empPosition: e ? e.position : '',
      content,
      effectDate: EDIT.effectDate || '____-__-__',
      status: 'pending',
      _multiEmps: emps,  // 미리보기 전용 — 대상자 표를 다중행으로 그리기 위한 hint
    };
  }

  /** 유형별 대상 직원 선택 범위 안내 문구 */
  function empScopeHint(kind) {
    return '';
  }

  function renderEmpChip() {
    const host = $('#apt-edit-emp'); if (!host) return;
    if (!EDIT.emps.length) {
      host.innerHTML = `
        <div class="emp-chip emp-chip--empty" data-apt-edit-pick role="button" tabindex="0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
          <span>대상 직원을 선택하세요 (다중 선택 가능)</span>
        </div>`;
      return;
    }

    const rowsHTML = EDIT.emps.map(e => `
      <tr data-apt-edit-emp-row="${esc(e.id)}">
        <td style="white-space:nowrap;">${empAvatar(e, 'sm')}</td>
        <td>
          <div style="font-weight:var(--fw-semibold);color:var(--color-text);">${esc(e.name)}</div>
          <div style="font-size:var(--fs-xs);color:var(--color-text-muted);">${esc(e.id)}</div>
        </td>
        <td style="font-size:var(--fs-sm);">${esc(e.dept || '-')}</td>
        <td style="font-size:var(--fs-sm);">${esc(e.rank || '-')}${e.position ? ' · ' + esc(e.position) : ''}</td>
        <td style="text-align:center;">
          <button class="btn btn--xs btn--ghost" type="button" data-apt-edit-emp-remove="${esc(e.id)}" title="제외" aria-label="제외">✕</button>
        </td>
      </tr>`).join('');

    host.innerHTML = `
      <div class="grid-wrap" style="border:1px solid var(--color-divider);border-radius:var(--radius-md);max-height:240px;">
        <div class="grid-scroll" style="max-height:240px;">
          <table class="tbl tbl--hover" style="font-size:var(--fs-sm);">
            <thead>
              <tr>
                <th style="width:36px;"></th>
                <th>성명</th>
                <th style="width:90px;">부서</th>
                <th style="width:110px;">직위</th>
                <th style="width:40px;"></th>
              </tr>
            </thead>
            <tbody>${rowsHTML}</tbody>
          </table>
        </div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;margin-top:8px;">
        <button class="btn btn--xs" type="button" data-apt-edit-pick>직원 추가 / 변경</button>
        <span class="t-muted" style="font-size:var(--fs-xs);">선택 ${EDIT.emps.length}명</span>
      </div>`;
  }

  /** 발령 유형별 추가 입력 필드
   *  다중 대상일 때는 첫 직원의 현재 값을 placeholder/기본값으로만 사용 — 실제 발령값은 전 직원 공통으로 적용된다 */
  function renderKindFields() {
    const host = $('#apt-edit-kind-fields'); if (!host) return;
    const e = EDIT.emps[0] || null;
    const curDept = e ? e.dept : '';
    const curRank = e ? e.rank : '';
    const curPos  = e ? e.position : '';
    const curJob  = e ? e.job : '';

    /* 전보·승진은 직원별 이전 값(부서/직무·직위/직책)이 다르므로 EDIT 공유값이 아닌 직원별 값으로 처리한다. */

    const sectionHead = (txt) => `<h4 style="margin-top:18px;padding-top:14px;border-top:1px solid var(--color-divider);font-size:var(--fs-sm);font-weight:var(--fw-semibold);color:var(--color-text);margin-bottom:8px;">${esc(txt)}</h4>`;
    /* 테이블 셀용 bare select */
    const cellSelect = (attr, id, options, value) =>
      `<select class="select input--sm" ${attr}="${esc(id)}" style="width:100%;">
         ${options.map(o => `<option value="${esc(o)}"${o === value ? ' selected' : ''}>${esc(o)}</option>`).join('')}
       </select>`;

    if (EDIT.kind === '전보') {
      /* 전보 — 직원별 발령 부서/직무. 기본값 = 각자의 이전 부서/직무(그대로 유지).
       *   부서만 / 직무만 / 둘 다 변경 모두 가능. 다중 선택 시 「일괄 적용」 으로 전 직원 동일 적용. */
      EDIT.emps.forEach(em => {
        if (em.toDept == null) em.toDept = em.dept;
        if (em.toJob  == null) em.toJob  = em.job;
        /* 근무형태/근무조 — 새 부서의 '기본 근무조' 기준으로 기본값 산정 (없으면 첫 허용 형태) */
        const pol = deptPolicyOf(em.toDept);
        const allowed = [pol.regular ? 'regular' : null, pol.shift ? 'shift' : null].filter(Boolean);
        const dft = (window.App && App.AttWorkPolicy && App.AttWorkPolicy.deptDefaultShift) ? App.AttWorkPolicy.deptDefaultShift(em.toDept) : '';
        const dftType = dft ? ((pol.regularSchedules || []).indexOf(dft) >= 0 ? 'regular'
                            : (pol.shiftSchedules || []).indexOf(dft) >= 0 ? 'shift' : '') : '';
        if (em.toWorkType == null || allowed.indexOf(em.toWorkType) < 0) {
          em.toWorkType = dftType || allowed[0] || '';
        }
        const codes = typeSchedCodes(em.toDept, em.toWorkType);
        const dftFits = dft && codes.indexOf(dft) >= 0 ? dft : '';
        if (em.toShift == null) em.toShift = dftFits;
        else if (em.toShift && codes.indexOf(em.toShift) < 0) em.toShift = dftFits;
      });
      /* 근무형태·근무조는 화면에 노출하지 않는다 — 발령 부서에 배정된 「기본 근무조」가
         자동 적용된다(위 forEach 가 em.toWorkType/toShift 를 부서 기본값으로 정규화). */
      host.innerHTML = `
        ${sectionHead('발령 부서 / 직무')}
        ${EDIT.emps.length
          ? `${EDIT.emps.length > 1
              ? `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;padding:8px 10px;background:var(--color-surface-alt);border-radius:var(--radius-md);">
                   <span style="font-size:var(--fs-xs);color:var(--color-text);font-weight:var(--fw-semibold);">일괄 적용</span>
                   <select class="select input--sm" data-apt-bulk-dept style="width:auto;"><option value="">발령 부서…</option>${DEPTS.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select>
                   <select class="select input--sm" data-apt-bulk-job style="width:auto;"><option value="">발령 직무…</option>${JOBS.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select>
                   <span style="font-size:var(--fs-xs);color:var(--color-text-muted);">선택 시 전 직원 동일 적용</span>
                 </div>`
              : ''}
             <div class="grid-wrap" style="border:1px solid var(--color-divider);border-radius:var(--radius-md);">
               <div class="grid-scroll">
                 <table class="tbl" style="font-size:var(--fs-sm);">
                   <thead><tr>
                     <th>성명</th>
                     <th style="width:74px;">이전 부서</th><th style="width:104px;">발령 부서</th>
                     <th style="width:64px;">이전 직무</th><th style="width:96px;">발령 직무</th>
                   </tr></thead>
                   <tbody>
                     ${EDIT.emps.map(em => `
                       <tr>
                         <td>${esc(em.name)} <span style="color:var(--color-text-muted);font-size:var(--fs-xs);">${esc(em.id)}</span></td>
                         <td style="color:var(--color-text-muted);">${esc(em.dept || '-')}</td>
                         <td>${cellSelect('data-apt-todept', em.id, DEPTS, em.toDept)}</td>
                         <td style="color:var(--color-text-muted);">${esc(em.job || '-')}</td>
                         <td>${cellSelect('data-apt-tojob', em.id, JOBS, em.toJob)}</td>
                       </tr>`).join('')}
                   </tbody>
                 </table>
               </div>
             </div>`
          : `<p class="form-help">대상 직원을 선택하세요.</p>`}
      `;
    } else if (EDIT.kind === '승진') {
      /* 승진 — 직원별 승진 직위/직책. 기본값 = 각자의 이전 직위/직책.
       *   직위만 / 직책만 / 둘 다 변경 가능. 다중 선택 시 「일괄 적용」 으로 전 직원 동일 적용. */
      EDIT.emps.forEach(em => {
        if (em.toRank     == null) em.toRank     = em.rank;
        if (em.toPosition == null) em.toPosition = em.position;
      });
      host.innerHTML = `
        ${sectionHead('승진 후 직위 / 직책')}
        ${EDIT.emps.length
          ? `${EDIT.emps.length > 1
              ? `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;padding:8px 10px;background:var(--color-surface-alt);border-radius:var(--radius-md);">
                   <span style="font-size:var(--fs-xs);color:var(--color-text);font-weight:var(--fw-semibold);">일괄 적용</span>
                   <select class="select input--sm" data-apt-bulk-rank style="width:auto;"><option value="">승진 직위…</option>${RANKS.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select>
                   <select class="select input--sm" data-apt-bulk-pos style="width:auto;"><option value="">승진 직책…</option>${POSITIONS.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select>
                   <span style="font-size:var(--fs-xs);color:var(--color-text-muted);">선택 시 전 직원 동일 적용</span>
                 </div>`
              : ''}
             <div class="grid-wrap" style="border:1px solid var(--color-divider);border-radius:var(--radius-md);">
               <div class="grid-scroll">
                 <table class="tbl" style="font-size:var(--fs-sm);">
                   <thead><tr>
                     <th>성명</th>
                     <th style="width:64px;">이전 직위</th><th style="width:100px;">승진 직위</th>
                     <th style="width:64px;">이전 직책</th><th style="width:96px;">승진 직책</th>
                   </tr></thead>
                   <tbody>
                     ${EDIT.emps.map(em => `
                       <tr>
                         <td>${esc(em.name)} <span style="color:var(--color-text-muted);font-size:var(--fs-xs);">${esc(em.id)}</span></td>
                         <td style="color:var(--color-text-muted);">${esc(em.rank || '-')}</td>
                         <td>${cellSelect('data-apt-torank-row', em.id, RANKS, em.toRank)}</td>
                         <td style="color:var(--color-text-muted);">${esc(em.position || '-')}</td>
                         <td>${cellSelect('data-apt-topos-row', em.id, POSITIONS, em.toPosition)}</td>
                       </tr>`).join('')}
                   </tbody>
                 </table>
               </div>
             </div>
             <p class="t-muted" style="font-size:var(--fs-xs);margin-top:6px;">승진 직위·직책 기본값은 각 직원의 이전 값입니다. 바꿀 항목만 변경하세요 (직책 그대로 두면 직책은 유지됩니다).</p>`
          : `<p class="form-help">대상 직원을 선택하세요.</p>`}
      `;
    }
  }
  function bindEditor(pageEl) {
    /* 발령 유형 segmented tabs */
    pageEl.querySelectorAll('[data-apt-kind]').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.aptKind;
        if (k === EDIT.kind) return;
        EDIT.kind = k;
        /* 유형 변경 시 유형별 필드 값 및 선택된 직원 초기화. */
        EDIT.toDept = '';
        EDIT.toJob  = '';
        EDIT.toRank = '';
        EDIT.toPosition = '';
        EDIT.toDuty = '';
        EDIT.emps = [];
        renderEditorView(pageEl);
      });
    });

    /* 직원 picker + 행별 제외 버튼 */
    pageEl.addEventListener('click', (e) => {
      if (e.target.closest('[data-apt-edit-pick]')) { openEmpPicker(); return; }
      const rm = e.target.closest('[data-apt-edit-emp-remove]');
      if (rm) {
        const id = rm.dataset.aptEditEmpRemove;
        EDIT.emps = EDIT.emps.filter(x => x.id !== id);
        renderEmpChip();
        renderKindFields();
        bindKindFieldInputs();
        syncPreview();
        validateEditor();
        return;
      }
    });

    /* 발령일 */
    bindField('#apt-edit-effect', 'effectDate');

    /* 유형별 필드 (전보·승진=직원별 발령/승진 값) */
    bindKindFieldInputs();

    /* 발령 등록 버튼 — #modal-apt-create 는 body 직속 모달이라 pageEl 하위가 아님.
     *   document 스코프로 조회해야 하고, 중복 바인딩 방지를 위해 dataset.bound 플래그 사용. */
    const submitBtn = document.querySelector('[data-apt-edit-submit]');
    if (submitBtn && !submitBtn.dataset.bound) {
      submitBtn.dataset.bound = '1';
      submitBtn.addEventListener('click', onSubmit);
    }
  }
  /** 전보·승진 — 직원별 발령/승진 값 select + 일괄 적용 select 바인딩 */
  function bindTransferInputs() {
    /* 행별 select (key = EDIT.emps[i] 의 속성명) */
    const rowBind = (attr, key) => document.querySelectorAll(`[${attr}]`).forEach(sel => {
      const h = () => { const em = EDIT.emps.find(x => x.id === sel.getAttribute(attr)); if (em) em[key] = sel.value; syncPreview(); validateEditor(); };
      sel.addEventListener('change', h);
    });
    /* 전보 발령 부서 변경 — 새 부서의 기본 근무조가 다르므로 재렌더(init forEach 가 근무형태·근무조를 부서 기본값으로 정규화). */
    document.querySelectorAll('[data-apt-todept]').forEach(sel => {
      sel.addEventListener('change', () => {
        const em = EDIT.emps.find(x => x.id === sel.getAttribute('data-apt-todept'));
        if (!em) return;
        em.toDept = sel.value;
        em.toWorkType = null; em.toShift = null;   /* 새 부서의 기본 근무조 기준으로 재산정 */
        renderKindFields(); bindTransferInputs(); syncPreview(); validateEditor();
      });
    });
    rowBind('data-apt-tojob',      'toJob');       // 전보
    rowBind('data-apt-torank-row', 'toRank');      // 승진
    rowBind('data-apt-topos-row',  'toPosition');  // 승진

    /* 일괄 적용 — 전 직원 동일 값으로 설정 후 테이블 재렌더 */
    const bulkBind = (attr, key) => {
      const sel = document.querySelector(`[${attr}]`);
      if (sel) sel.addEventListener('change', () => {
        if (!sel.value) return;
        EDIT.emps.forEach(em => { em[key] = sel.value; });
        renderKindFields(); bindTransferInputs(); syncPreview(); validateEditor();
      });
    };
    /* 일괄 발령 부서 — 전 직원 toDept 설정 후 재렌더(init forEach 가 근무형태·근무조 정규화) */
    const bulkDeptSel = document.querySelector('[data-apt-bulk-dept]');
    if (bulkDeptSel) bulkDeptSel.addEventListener('change', () => {
      if (!bulkDeptSel.value) return;
      EDIT.emps.forEach(em => { em.toDept = bulkDeptSel.value; em.toWorkType = null; em.toShift = null; });
      renderKindFields(); bindTransferInputs(); syncPreview(); validateEditor();
    });
    bulkBind('data-apt-bulk-job',  'toJob');       // 전보
    bulkBind('data-apt-bulk-rank', 'toRank');      // 승진
    bulkBind('data-apt-bulk-pos',  'toPosition');  // 승진
  }
  function bindField(sel, key) {
    const el = document.querySelector(sel); if (!el) return;
    const handler = () => {
      EDIT[key] = el.value;
      syncPreview();
      validateEditor();
    };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  }
  function syncPreview() {
    const pv = $('#apt-edit-preview');
    if (!pv) return;
    const docName = KIND_DOC[EDIT.kind] || '사령장';
    pv.innerHTML = renderDocHTML(buildEditPreviewRow(), docName, EDIT.kind === '승진');
  }

  function validateEditor() {
    const submit = $('[data-apt-edit-submit]');
    if (!submit) return;

    let valid = true;
    let empMsg = '';
    if (!EDIT.emps.length) valid = false;
    if (!EDIT.effectDate)  valid = false;

    /* 유형별 필수값. 전보/승진은 직원 원래 값을 기본으로 채우므로 (이전 부서/직무·직위/직책)
     *   동일값 차단은 하지 않고, 값이 채워졌는지(non-empty)만 확인한다. */
    if (EDIT.kind === '전보') {
      /* 직원별 발령 부서/직무가 모두 채워져 있고, 직원당 부서·직무 중 1개 이상은 변경되어야 함 */
      if (EDIT.emps.some(x => !x.toDept || !x.toJob)) valid = false;
      else if (EDIT.emps.some(x => x.toDept === x.dept && x.toJob === x.job)) {
        empMsg = '부서·직무가 모두 이전과 동일한 직원이 있습니다. (변경 사항이 없는 전보)';
        valid = false;
      }
    }
    if (EDIT.kind === '승진') {
      /* 직원별 승진 직위가 채워져 있고, 직원당 직위·직책 중 1개 이상은 변경되어야 함 */
      if (EDIT.emps.some(x => !x.toRank)) valid = false;
      else if (EDIT.emps.some(x => x.toRank === x.rank && (x.toPosition || x.position) === x.position)) {
        empMsg = '직위·직책이 모두 이전과 동일한 직원이 있습니다. (변경 사항이 없는 승진)';
        valid = false;
      }
    }

    const msgEl = $('#apt-edit-emp-msg');
    if (msgEl) {
      msgEl.textContent = empMsg;
      msgEl.style.color = empMsg ? 'var(--color-danger)' : '';
    }

    /* 발령일 상태 미리 안내 */
    const effMsg = $('#apt-edit-effect-msg');
    if (effMsg && EDIT.effectDate) {
      const willBe = EDIT.effectDate > TODAY ? '「예정」' : '「완료」';
      effMsg.textContent = `등록 시 ${willBe} 상태로 처리됩니다.`;
      effMsg.style.color = 'var(--color-text-muted)';
    }

    submit.disabled = !valid;

    /* page-bar 부제 */
    const sub = $('#apt-edit-sub');
    if (sub) {
      const n = EDIT.emps.length;
      if (n === 0)      sub.textContent = `${EDIT.kind} · 새 발령`;
      else if (n === 1) sub.textContent = `${EDIT.kind} · ${EDIT.emps[0].name} (${EDIT.emps[0].dept})`;
      else              sub.textContent = `${EDIT.kind} · ${EDIT.emps[0].name} 외 ${n - 1}명`;
    }
  }

  function confirmLeaveEditor() {
    if (!EDIT.emps.length) { goList(); return; }
    if (confirm('작성 중인 내용이 사라질 수 있습니다. 목록으로 돌아가시겠습니까?')) {
      goList();
    }
  }
  function goList() {
    STATE.view = 'list';
    closeAptModal();
    const pageEl = document.getElementById('page-hr-appoint');
    if (pageEl && !pageEl.querySelector('.toolbar')) {
      renderListView(pageEl);
    }
    applyFilter();
    renderTable();
  }

  /* [발령 등록] 클릭 → 시스템 전자결재 모달 호출. 결재선 지정 후 onSubmit 콜백에서
   *   실제 STATE.rows 에 발령 row 추가 + 목록 갱신. */
  function onSubmit() {
    if (!EDIT.emps.length) return;
    if (!(window.App && typeof App.openSystemApprovalModal === 'function')) {
      window.toast && window.toast('전자결재 모듈이 준비되지 않았습니다.', 'warning');
      return;
    }
    const n = EDIT.emps.length;
    const targetSummary = n === 1
      ? `${EDIT.emps[0].name} (${EDIT.emps[0].id})`
      : `${EDIT.emps[0].name} 외 ${n - 1}명`;
    const titleText = `${EDIT.kind} 발령 — ${targetSummary}`;
    const contentLines = [
      `· 발령 유형: ${EDIT.kind}`,
      `· 발령일: ${EDIT.effectDate}`,
      `· 대상자(${n}명): ${EDIT.emps.map(e => `${e.name}(${e.id}, ${e.dept || '-'})`).join(', ')}`,
    ];
    if (EDIT.kind === '전보') {
      EDIT.emps.forEach(e => {
        const td = e.toDept || e.dept, tj = e.toJob || e.job;
        const parts = [];
        if (td !== e.dept) parts.push(`부서 ${e.dept}→${td}`);
        if (tj !== e.job)  parts.push(`직무 ${e.job}→${tj}`);
        contentLines.push(`· ${e.name}: ${parts.join(', ') || '부서·직무 유지'}`);
      });
    } else if (EDIT.kind === '승진') {
      EDIT.emps.forEach(e => {
        const tr = e.toRank || e.rank, tp = e.toPosition || e.position;
        const parts = [];
        if (tr !== e.rank)     parts.push(`직위 ${e.rank}→${tr}`);
        if (tp !== e.position) parts.push(`직책 ${e.position || '-'}→${tp || '-'}`);
        contentLines.push(`· ${e.name}: ${parts.join(', ') || '직위·직책 유지'}`);
      });
    }

    /* 발령 모달은 열어둔 채로 전자결재 모달이 위에 표시되도록 일시 숨김 */
    const aptModal = document.getElementById('modal-apt-create');
    if (aptModal) aptModal.style.visibility = 'hidden';

    App.openSystemApprovalModal({
      docName: '발령',
      titlePrefix: '발령',          /* "발령 승인 요청" */
      codeLabel: '발령 유형',
      nameLabel: '대상자',
      matCode: EDIT.kind,
      matName: targetSummary,
      customReasons: ['정기 인사', '수시 인사', '조직 개편', '기타'],
      defaultReason: '정기 인사',
      defaultApprovers: [],
      title: titleText,
      content: contentLines.join('\n'),
      attachments: [],
      payload: {
        kind: EDIT.kind,
        effectDate: EDIT.effectDate,
        emps: EDIT.emps.map(e => ({ id: e.id, name: e.name, dept: e.dept, rank: e.rank, position: e.position })),
        toDept: EDIT.toDept,
        toRank: EDIT.toRank,
        toPosition: EDIT.toPosition,
      },
      onSubmit(rec) {
        /* 승인 요청 등록 완료 — 실제 발령 row 도 추가 (status 는 결재 대기, 발령일이 미래면 예정 / 과거면 완료 처리는
         *   기존 createRows 로직 사용) */
        const rows = createRows();
        rows.forEach(r => STATE.rows.unshift(r));
        window.toast && window.toast(`발령 ${rows.length}건 등록 + 승인 요청이 접수되었습니다.`, 'success');
        goList();
      },
    });

    /* 사용자가 전자결재 모달을 취소했을 때를 대비해 — 시스템 모달 닫힘 감지 후 복귀 처리.
     *   App.openSystemApprovalModal 내부에 onClose 콜백 없음 → 별도 폴링 대신
     *   모달이 다시 열렸을 때 보이도록 timeout 으로 강제 복원하지 않는다.
     *   (사용자가 취소 후 발령 등록을 다시 누르면 자연스럽게 새로 열림) */
    setTimeout(() => {
      const sysapr = document.querySelector('[data-sysapr-host]');
      if (!sysapr || !sysapr.classList.contains('is-open')) {
        if (aptModal) aptModal.style.visibility = '';
      }
    }, 250);
  }

  /** 선택된 모든 직원에 대해 동일 발령(EDIT)을 적용한 row 배열 생성 */
  function createRows() {
    const status = EDIT.effectDate > TODAY ? 'pending' : 'done';
    let maxSeq = STATE.rows.reduce((m, r) => {
      const n = Number((r.id.match(/-(\d+)$/) || [])[1] || 0);
      return Math.max(m, n);
    }, 0);
    const stamp = nowStamp();
    return EDIT.emps.map(e => {
      let content;
      if (EDIT.kind === '전보') {
        /* 전보 — 직원별 발령 부서/직무 (이전 값 그대로면 유지). 직위/직책은 변하지 않음. */
        const toDept = e.toDept || e.dept;
        const toJob  = e.toJob  || e.job;
        const parts = [];
        if (toDept !== e.dept) parts.push(`${e.dept} → ${toDept}`);
        if (toJob  !== e.job)  parts.push(`직무 ${e.job} → ${toJob}`);
        const wtLabel = e.toWorkType === 'shift' ? '교대근무' : e.toWorkType === 'regular' ? '통상근무' : '';
        if (e.toShift)      parts.push(`${wtLabel ? wtLabel + ' ' : ''}${shiftLabelOf(e.toShift)}`);
        else if (wtLabel)   parts.push(wtLabel);
        content = {
          text: parts.join(' / ') || `${toDept} (부서·직무 유지)`,
          fromDept: e.dept, toDept,
          fromJob: e.job, toJob,
          toWorkType: e.toWorkType || '',
          toShift: e.toShift || '', toShiftLabel: e.toShift ? shiftLabelOf(e.toShift) : '',
          toRank: e.rank, toPosition: e.position,
        };
      } else if (EDIT.kind === '승진') {
        /* 승진 — 직원별 승진 직위/직책 (직책 그대로면 유지) */
        const toRank = e.toRank || e.rank;
        const toPos  = e.toPosition || e.position;
        const parts = [];
        if (toRank !== e.rank) parts.push(`${e.rank} → ${toRank}`);
        if (toPos  !== e.position) parts.push(`직책 ${e.position || '-'} → ${toPos || '-'}`);
        content = {
          text: parts.join(' / ') || `${toRank}`,
          toDept: e.dept, toRank, toPosition: toPos,
        };
      } else if (EDIT.kind === '수습해제') {
        content = { text: '수습 해제 (정규직 전환)', toDept: e.dept, toRank: e.rank, toPosition: e.position };
      } else {
        content = { text: '' };
      }
      maxSeq += 1;
      const seq = String(maxSeq).padStart(4, '0');
      return {
        id: `APT-2026-${seq}`,
        kind: EDIT.kind,
        empId: e.id,
        empName: e.name,
        empDept: e.dept,
        empRank: e.rank,
        empJob: e.job,
        empPosition: e.position,
        content,
        contentText: content.text,
        effectDate: EDIT.effectDate,
        status,
        registeredBy: HR_NAME,
        registeredAt: stamp,
      };
    });
  }

  /* =========================================================
   *  대상 직원 Picker — 전자결재 결재자 지정과 동일한 OffCanvas(App.openEmpPicker) 재사용.
   *   발령 화면 자체 마스터(App.HRMembers 기반 EMPLOYEES)를 ctx.employees 로 주입하므로
   *   dept/rank(직위)/position(직책)/job(직무) 가 드롭다운 옵션과 1:1 일치한다.
   *   (조직 전체 picker 데이터는 pos 단일 필드만 제공 → 직위·직책 중복/옵션 불일치 발생)
   *
   *   후보 풀: 전보/승진 모두 입사확정된 전체 직원 */
  function openEmpPicker() {
    if (!(window.App && typeof App.openEmpPicker === 'function')) {
      window.toast && window.toast('직원 선택 모듈이 준비되지 않았습니다.', 'warning');
      return;
    }
    /* 후보 빌드. 이미 선택된 직원은 세션 편집값(toDept/toJob/toRank 등)을 보존하기 위해
     *   기존 EDIT.emps 객체를 그대로 재사용하고, 신규 후보는 복사본으로 만들어 마스터 오염을 막는다. */
    const keep = new Map(EDIT.emps.map(x => [x.id, x]));
    const base = EMPLOYEES.map(e => Object.assign({}, e));   // 전보·승진 — 전체 직원(복사본)
    const candidates = base.map(e => keep.get(e.id) || e);
    /* off-canvas 표시용 필드(pos/photo) 보강 — 우리 데이터(rank/position/job)는 그대로 유지 */
    candidates.forEach(e => {
      if (!e.pos) e.pos = [e.rank, e.position].filter(Boolean).join(' · ');
      if (!e.photo) e.photo = e.photoUrl || '';
    });

    /* off-canvas 를 발령 모달(z 1000) 위에 표시 */
    const pickerOc = document.getElementById('emp-picker-oc');
    const pickerBd = document.querySelector('[data-emp-picker-host]');
    if (pickerOc) pickerOc.classList.add('offcanvas--over-modal');
    if (pickerBd) pickerBd.classList.add('oc-backdrop--over-modal');
    function restoreZ() {
      if (pickerOc) pickerOc.classList.remove('offcanvas--over-modal');
      if (pickerBd) pickerBd.classList.remove('oc-backdrop--over-modal');
    }

    App.openEmpPicker({
      action: 'callback',
      multi: true,
      employees: candidates,                        // ← 발령 대상 후보(입사확정 전체 직원)
      preselectedIds: EDIT.emps.map(x => x.id),     // 재진입 시 기존 선택 유지
      onConfirm(selected) {
        restoreZ();
        if (!selected) return;
        /* selected 는 주입한 candidates 객체 그대로 — full fields 보존 */
        EDIT.emps = selected.slice();
        renderEmpChip();
        renderKindFields();
        bindKindFieldInputs();
        syncPreview();
        validateEditor();
      },
      onClose: restoreZ,
    });
  }
  /** renderKindFields 가 select DOM 을 다시 그린 뒤 유형별 입력을 재바인딩 (공통 헬퍼) */
  function bindKindFieldInputs() {
    bindTransferInputs();     // 전보·승진 — 직원별 발령/승진 값 + 일괄 적용
  }

  /* =========================================================
   *  사령장 / 임명장 — OffCanvas Drawer (목록의 성명 클릭)
   *  + 작성 화면의 미리보기에서도 동일하게 활용
   * ========================================================= */
  function openDocPreview(id) {
    const row = STATE.rows.find(r => r.id === id); if (!row) return;
    const docName = KIND_DOC[row.kind] || '사령장';
    const isAppoint = docName === '임명장';

    const titleEl = $('#oc-appoint-doc-title');
    const bodyEl  = $('#oc-appoint-doc-body');
    const footEl  = $('#oc-appoint-doc-footer');
    if (!titleEl || !bodyEl) return;

    titleEl.textContent = docName;
    bodyEl.innerHTML = `<article class="doc-editor__paper is-readonly" style="font-family:inherit;">${renderDocHTML(row, docName, isAppoint)}</article>`;
    footEl.innerHTML = `
      <button class="btn" type="button" data-oc-close>닫기</button>
      <button class="btn btn--primary" type="button" data-apt-doc-print>인쇄</button>
    `;
    openDrawer();
  }

  /** 사령장/임명장 본문 HTML 생성 — doc-paper 스타일
   *  목록(OffCanvas) 과 작성 미리보기에서 공통 사용 */
  function renderDocHTML(row, docName, isAppoint) {
    const c = row.content || {};

    const headline = isAppoint ? '임 명 장' : '사 령 장';

    const isMulti = !!(row._multiEmps && row._multiEmps.length > 1);

    let detailRows = '';
    if (row.kind === '전보') {
      /* 전보 — 이전/발령 부서·직무. 다중 대상자는 직원별로 상이하므로 대상자 표에 표기하고 여기선 생략. */
      detailRows = isMulti ? '' : `
        <tr><th>이전 부서</th><td>${esc(c.fromDept || row.empDept || '-')}</td></tr>
        <tr><th>발령 부서</th><td>${esc(c.toDept || '_______')}</td></tr>
        <tr><th>이전 직무</th><td>${esc(c.fromJob || row.empJob || '-')}</td></tr>
        <tr><th>발령 직무</th><td>${esc(c.toJob || '_______')}</td></tr>
      `;
    } else if (row.kind === '승진') {
      /* 승진 — 소속 부서는 표기하지 않음. 다중 대상자는 직원별 직위/직책을 대상자 표에 표기하고 여기선 생략. */
      detailRows = isMulti ? '' : `
        <tr><th>승진 직위</th><td>${esc(c.toRank || '_______')}</td></tr>
        <tr><th>승진 직책</th><td>${esc(c.toPosition || '-')}</td></tr>
      `;
    } else if (row.kind === '수습해제') {
      detailRows = `
        <tr><th>소속 부서</th><td>${esc(c.toDept || row.empDept)}</td></tr>
        <tr><th>전환 구분</th><td>수습 → 정규직</td></tr>
      `;
    }

    const intro = isAppoint
      ? `다음의 자를 아래와 같이 <strong>임명</strong>한다.`
      : `다음의 자에게 아래와 같이 <strong>${esc(row.kind)}</strong>을(를) 명한다.`;

    return `
      <p style="text-align:right;font-size:var(--fs-sm);color:var(--color-text-muted);margin:0 0 10px;">
        발령번호: <strong style="color:var(--color-text);">${esc(row.id)}</strong>
      </p>

      <h2 class="doc-paper__title">${headline}</h2>

      <p class="doc-paper__intro">${intro}</p>

      <h3 class="doc-paper__art">대상자${row._multiEmps && row._multiEmps.length > 1 ? ` (${row._multiEmps.length}명)` : ''}</h3>
      ${isMulti
        ? (row.kind === '전보'
          /* 전보 — 직원별 이전/발령 부서·직무를 한 표에 표시 (직위/직책은 변동 없으므로 생략) */
          ? `<table class="doc-paper__tbl">
              <thead>
                <tr><th style="width:36px;">No</th><th>성명</th><th style="width:90px;">사번</th><th>이전 부서</th><th>발령 부서</th><th>이전 직무</th><th>발령 직무</th></tr>
              </thead>
              <tbody>
                ${row._multiEmps.map((e, i) => {
                  const td = e.toDept || e.dept, tj = e.toJob || e.job;
                  const mark = (v, changed) => changed ? `<strong style="color:var(--color-brand-primary);">${esc(v)}</strong>` : esc(v);
                  return `
                    <tr>
                      <td style="text-align:center;">${i + 1}</td>
                      <td>${esc(e.name)}</td>
                      <td>${esc(e.id)}</td>
                      <td>${esc(e.dept || '-')}</td>
                      <td>${mark(td || '-', td !== e.dept)}</td>
                      <td>${esc(e.job || '-')}</td>
                      <td>${mark(tj || '-', tj !== e.job)}</td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>`
          : row.kind === '승진'
          /* 승진 — 직원별 이전/승진 직위·직책을 한 표에 표시 */
          ? `<table class="doc-paper__tbl">
              <thead>
                <tr><th style="width:36px;">No</th><th>성명</th><th style="width:90px;">사번</th><th>소속</th><th>이전 직위</th><th>승진 직위</th><th>이전 직책</th><th>승진 직책</th></tr>
              </thead>
              <tbody>
                ${row._multiEmps.map((e, i) => {
                  const tr = e.toRank || e.rank, tp = e.toPosition || e.position;
                  const mark = (v, changed) => changed ? `<strong style="color:var(--color-brand-primary);">${esc(v)}</strong>` : esc(v);
                  return `
                    <tr>
                      <td style="text-align:center;">${i + 1}</td>
                      <td>${esc(e.name)}</td>
                      <td>${esc(e.id)}</td>
                      <td>${esc(e.dept || '-')}</td>
                      <td>${esc(e.rank || '-')}</td>
                      <td>${mark(tr || '-', tr !== e.rank)}</td>
                      <td>${esc(e.position || '-')}</td>
                      <td>${mark(tp || '-', tp !== e.position)}</td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>`
          : `<table class="doc-paper__tbl">
              <thead>
                <tr><th style="width:40px;">No</th><th>성명</th><th style="width:100px;">사번</th><th>현 소속</th><th style="width:120px;">현 직위 / 직책</th></tr>
              </thead>
              <tbody>
                ${row._multiEmps.map((e, i) => `
                  <tr>
                    <td style="text-align:center;">${i + 1}</td>
                    <td>${esc(e.name)}</td>
                    <td>${esc(e.id)}</td>
                    <td>${esc(e.dept || '-')}</td>
                    <td>${esc(e.rank || '-')} / ${esc(e.position || '-')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>`)
        : `<table class="doc-paper__tbl">
            <tr><th>성명</th><td>${esc(row.empName)}</td></tr>
            <tr><th>사번</th><td>${esc(row.empId)}</td></tr>
            <tr><th>현 소속</th><td>${esc(row.empDept)}</td></tr>
            <tr><th>현 직위 / 직책</th><td>${esc(row.empRank || '-')} / ${esc(row.empPosition || '-')}</td></tr>
          </table>`}

      <h3 class="doc-paper__art">발령 사항</h3>
      <table class="doc-paper__tbl">
        <tr><th>유형</th><td>${esc(row.kind)}</td></tr>
        <tr><th>발령 일자</th><td>${esc(fmtD(row.effectDate))}</td></tr>
        ${detailRows}
      </table>

      <p class="doc-paper__cl" style="margin-top:24px;">
        위와 같이 ${esc(row.kind === '승진' ? '임명' : '발령')}하오니, 발령일부터 본 직무에 임함을 명한다.
      </p>

      <p class="doc-paper__signdate">발령일: ${esc(fmtD(row.effectDate))}</p>

      <div class="sig-block-row" style="margin-top:12px;">
        <div class="sig-block sig-block--signed" style="grid-column:1 / -1;">
          <div class="sig-block__role">발령권자 — 회사</div>
          <div class="sig-block__info">
            <strong>${esc(COMPANY)}</strong>
            <small>대표이사: ${esc(COMPANY_REPR)}</small>
          </div>
          <div class="sig-block__sigarea">
            <div class="sig-block__seal">${esc(COMPANY_SEAL_TEXT).replace('\n','<br>')}</div>
            <span class="sig-block__stamp-time">${row.status === 'done' ? esc(fmtD(row.effectDate)) + ' 시행' : '시행 예정'}</span>
          </div>
        </div>
      </div>
    `;
  }

  /* ============ OffCanvas 제어 ============ */
  function openDrawer() {
    const oc = $('#oc-appoint-doc');
    const bd = document.querySelector('.oc-backdrop[data-oc-host="oc-appoint-doc"]');
    if (oc) { oc.hidden = false; oc.classList.add('is-open'); }
    if (bd) bd.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeDrawer() {
    const oc = $('#oc-appoint-doc');
    const bd = document.querySelector('.oc-backdrop[data-oc-host="oc-appoint-doc"]');
    if (oc) { oc.classList.remove('is-open'); }
    if (bd) bd.classList.remove('is-open');
    document.body.style.overflow = '';
  }
  function bindOC() {
    document.addEventListener('click', (e) => {
      const oc = $('#oc-appoint-doc');
      if (!oc || !oc.classList.contains('is-open')) return;
      if (e.target.closest('#oc-appoint-doc [data-oc-close]')) { closeDrawer(); return; }
      if (e.target.closest('[data-oc-host="oc-appoint-doc"]')) { closeDrawer(); return; }
      if (e.target.closest('[data-apt-doc-print]')) {
        window.toast && window.toast('인쇄 기능은 데모 환경에서 제공되지 않습니다.', 'info');
        return;
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const oc = $('#oc-appoint-doc');
      if (oc && oc.classList.contains('is-open')) closeDrawer();
    });
  }

  /* =========================================================
   *  Page Init
   * ========================================================= */
  let built = false;
  function initPage() {
    const pageEl = document.getElementById('page-hr-appoint');
    if (!pageEl) return;
    pageEl.__onShow = () => {
      if (!built) {
        EMPLOYEES = loadEmployees();
        STATE.rows = makeMock();
        renderListView(pageEl);
        bindOC();
        built = true;
      } else if (STATE.view === 'list') {
        /* 다른 탭에서 돌아왔을 때 list view 가 유지되어 있다면 그대로 */
      }
    };
  }

  /* =========================================================
   *  Public API — 다른 페이지(예: 정규직 전환 관리)에서 발령 작성 화면을 모달로 띄울 때 사용.
   *   · KIND_LIST / KIND_DOC — 발령 유형 마스터
   *   · renderDocHTML(row, docName, isAppoint) — 사령장/임명장 미리보기 HTML
   *   · addAppointment(row) — 외부에서 작성한 발령을 발령 목록에 등록 */
  App.HRAppoint = {
    KIND_LIST,
    KIND_DOC,
    renderDocHTML,
    addAppointment(row) {
      STATE.rows = STATE.rows || [];
      STATE.rows.unshift(row);
      return row;
    },
  };

  const prev = App.initPages;
  App.initPages = function () {
    if (typeof prev === 'function') prev();
    initPage();
  };
})();
