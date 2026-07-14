/* =========================================================
 * Page: HR > 인사 관리 > 포상·징계
 *
 *  단일 페이지에 「포상」/「징계」 탭이 함께 존재.
 *   - 메뉴 진입 시점에 'hr-prize' → 포상 탭 자동선택, 'hr-discipline' → 징계 탭 자동선택
 *   - 두 탭은 데이터·UI 구조가 동일 (KIND 만 다름)
 *
 *  대상자
 *   - 현재 활성 직원만 (status !== 'retired', !== 'contractExpired')
 *
 *  레코드 필드
 *   - 통보일 (date)
 *   - 사유 (textarea)
 *   - 결과 (select)
 *   - 등록일/등록자
 *
 *  Mock
 *   - 페이지 로드 시 결정적 mock 데이터 (포상 12건 + 징계 12건)
 *
 *  UI Kit 재사용
 *   .tabs / .tabs--pill-soft
 *   .toolbar / .tbl / .pill / .pagination
 *   .modal / .modal-backdrop / .modal--lg
 *   .form-field / .input / .select / .picker-list / .picker-item
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  /* ============ 환경 ============ */
  const TODAY = '2026-05-18';

  /* ============ KIND ============ */
  const KINDS = {
    prize: {
      label: '포상',
      icon: '🏆',
      color: 'inherit',
      pill: 'pill--info',
      results: [
        { value: 'leave_extra', label: '휴가' },
        { value: 'incentive',   label: '인센티브' },
        { value: 'promotion',   label: '승진' },
      ],
    },
    discipline: {
      label: '징계',
      icon: '⚠️',
      color: 'inherit',
      pill: 'pill--warning',
      results: [
        { value: 'writeup',  label: '시말서' },
        { value: 'warning',  label: '경고' },
        { value: 'dismissal',label: '해고' },
      ],
    },
  };

  /* ============ STATE ============ */
  const STATE = {
    view: 'list',               /* 'list' | 'editor' */
    records: [],                /* 통합 레코드 — {id, kind, empId, ...} */
    filter: { kind: '', keyword: '', condition: 'empName', from: '', to: '' },
    page: 1, pageSize: 20,
    /* 편집 중 폼 */
    editing: null,
    editingId: null,            /* 수정 모드면 id, 신규면 null */
  };

  /* ============ Helpers ============ */
  function $(s, r = document) { return r.querySelector(s); }
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function ymd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
  /* 표시 전용 날짜 포맷 (데이터/키 변형 금지 — 화면 렌더 시점에서만 사용) */
  function fmtD(s) {
    if (!s) return s;
    const m = String(s).match(/^(\d{4})[-./](\d{2})[-./](\d{2})/);
    return m ? m[1].slice(2) + '/' + m[2] + '/' + m[3] : s;
  }
  function allMembers() {
    return (window.App && App.HRMembers && App.HRMembers.list) ? App.HRMembers.list() : [];
  }
  function activeMembers() {
    return allMembers().filter(e => e.status !== 'retired' && e.status !== 'contractExpired');
  }
  function memberById(id) { return allMembers().find(e => e.id === id) || null; }
  function nextSeq(kind) {
    const prefix = kind === 'prize' ? 'PRZ' : 'DSC';
    const year = TODAY.slice(0, 4);
    const re = new RegExp('^' + prefix + '-' + year + '-(\\d+)$');
    const max = STATE.records.reduce((m, r) => {
      const match = String(r.id || '').match(re);
      return match ? Math.max(m, Number(match[1])) : m;
    }, 0);
    return `${prefix}-${year}-${String(max + 1).padStart(4, '0')}`;
  }
  function resultLabel(kind, value) {
    const m = (KINDS[kind].results.find(r => r.value === value) || {});
    return m.label || value || '-';
  }

  /* ============ Mock 데이터 — 최근 10년 범위로 분포 ============ */
  function makeMock() {
    const emps = activeMembers();
    if (!emps.length) return [];

    /* 포상 시나리오 (사유 한 줄 — 결과는 휴가/인센티브/승진 3종) */
    const prizeSamples = [
      { result: 'leave_extra', reason: '신제품 출시 프로젝트 성공적 완수 기여',  offset: -15   },
      { result: 'incentive',   reason: '월간 생산성 1위 달성',                  offset: -32   },
      { result: 'leave_extra', reason: '장기근속 5년 도래',                    offset: -90   },
      { result: 'incentive',   reason: '안전사고 무재해 1년 달성',              offset: -180  },
      { result: 'promotion',   reason: '리더십 우수 — 본부 KPI 130%',           offset: -260  },
      { result: 'incentive',   reason: '품질 클레임 제로 분기',                offset: -340  },
      { result: 'leave_extra', reason: '신입사원 멘토링 우수',                 offset: -420  },
      { result: 'incentive',   reason: '사내 교육 우수 강사',                  offset: -500  },
      { result: 'promotion',   reason: '대형 거래처 신규 확보',                offset: -700  },
      { result: 'leave_extra', reason: '회사 명예 향상 외부 수상',              offset: -880  },
      { result: 'incentive',   reason: '연간 KPI 145% 초과 달성',              offset: -1050 },
      { result: 'leave_extra', reason: '근속 10년 기념',                       offset: -1280 },
      { result: 'promotion',   reason: '핵심 인력 유지 — 승진 발탁',            offset: -1500 },
      { result: 'incentive',   reason: '특허 출원 기여',                       offset: -1820 },
      { result: 'leave_extra', reason: '재해 구호 활동 봉사',                  offset: -2100 },
      { result: 'incentive',   reason: '비용 절감 아이디어 채택',              offset: -2400 },
      { result: 'promotion',   reason: '신규 라인 안정화 공로',                offset: -2700 },
      { result: 'leave_extra', reason: '근속 15년 도래',                       offset: -3000 },
      { result: 'incentive',   reason: '전사 우수사원 선정',                  offset: -3300 },
      { result: 'promotion',   reason: '경영 혁신 사례 발굴',                  offset: -3600 },
    ];
    /* 징계 시나리오 (결과는 시말서/경고/해고 3종) */
    const discSamples = [
      { result: 'warning',    reason: '근태 불량 — 월 3회 지각',                offset: -8    },
      { result: 'writeup',    reason: '근무지 무단이탈',                        offset: -25   },
      { result: 'warning',    reason: '보고 누락 — 반복',                      offset: -50   },
      { result: 'writeup',    reason: '안전수칙 위반으로 인한 사고 발생',         offset: -85   },
      { result: 'writeup',    reason: '동료 간 갈등 유발',                     offset: -160  },
      { result: 'warning',    reason: '복장 규정 위반 반복',                   offset: -240  },
      { result: 'writeup',    reason: '품질 기준 미준수',                      offset: -360  },
      { result: 'dismissal',  reason: '거래처와의 부적절한 접대 수수',          offset: -540  },
      { result: 'writeup',    reason: '관리 책임 미흡 — 부하 직원 사고',        offset: -720  },
      { result: 'warning',    reason: '회의 무단 결석 다수',                   offset: -900  },
      { result: 'writeup',    reason: '회사 자산 사적 사용',                   offset: -1200 },
      { result: 'dismissal',  reason: '기밀자료 외부 유출',                    offset: -1500 },
      { result: 'warning',    reason: '협업 미이행',                          offset: -1900 },
      { result: 'writeup',    reason: '음주 후 출근',                         offset: -2300 },
      { result: 'warning',    reason: '업무 지시 불이행',                      offset: -2800 },
      { result: 'dismissal',  reason: '횡령 의혹 확인',                       offset: -3400 },
    ];

    const out = [];
    prizeSamples.forEach((s, i) => {
      const emp = emps[(i * 3 + 1) % emps.length];
      const date = ymd(addDays(new Date(TODAY), s.offset));
      out.push({
        id: `PRZ-${date.slice(0,4)}-${String(i + 1).padStart(4,'0')}`,
        kind: 'prize',
        empId: emp.id, empName: emp.name, empDept: emp.dept, empPosition: emp.position,
        noticeDate: date,
        reason: s.reason,
        result: s.result,
        registeredBy: ['정혜진','윤민지'][i % 2],
        registeredAt: date,
      });
    });
    discSamples.forEach((s, i) => {
      const emp = emps[(i * 5 + 7) % emps.length];
      const date = ymd(addDays(new Date(TODAY), s.offset));
      out.push({
        id: `DSC-${date.slice(0,4)}-${String(i + 1).padStart(4,'0')}`,
        kind: 'discipline',
        empId: emp.id, empName: emp.name, empDept: emp.dept, empPosition: emp.position,
        noticeDate: date,
        reason: s.reason,
        result: s.result,
        registeredBy: ['정혜진','윤민지'][i % 2],
        registeredAt: date,
      });
    });
    /* 최신 통보일 우선 */
    out.sort((a, b) => (b.noticeDate || '').localeCompare(a.noticeDate || ''));
    return out;
  }

  /* ============ 필터 ============ */
  function applyFilter() {
    const p = STATE.filter;
    const kw = (p.keyword || '').trim().toLowerCase();
    return STATE.records.filter(r => {
      if (p.kind && r.kind !== p.kind) return false;
      if (kw) {
        const t = p.condition === 'empId' ? r.empId : (p.condition === 'reason' ? r.reason : r.empName);
        if (!String(t).toLowerCase().includes(kw)) return false;
      }
      if (p.from && (r.noticeDate || '') < p.from) return false;
      if (p.to   && (r.noticeDate || '') > p.to)   return false;
      return true;
    });
  }

  /* =========================================================
   *  VIEW
   * ========================================================= */
  function render(pageEl) {
    /* Layer modal 전환 — editor view 는 모달에서 렌더되므로 페이지는 항상 list view */
    renderListView(pageEl);
  }

  function renderListView(pageEl) {
    const C = App.Components;

    const searchHTML = C.searchPanel({
      showDateRange: true,
      dateLabel: '통보일',
      quick: ['week','m1','m6','y1'],
      conditions: [
        { value: 'empName', label: '성명' },
        { value: 'empId',   label: '사번' },
        { value: 'reason',  label: '사유' },
      ],
      placeholder: '성명/사번/사유 검색',
      cols: 2,
      advanced: [
        { name: 'kind',   label: '구분', options: [
          { value: 'prize',      label: '포상' },
          { value: 'discipline', label: '징계' },
        ]},
      ],
    });

    const filtered = applyFilter();
    const start = (STATE.page - 1) * STATE.pageSize;
    const rows = filtered.slice(start, start + STATE.pageSize);

    pageEl.innerHTML = `
      ${searchHTML}

      <div style="flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;">
        <div class="toolbar">
          <div class="toolbar__left">
            <span class="toolbar__count">총 <strong>${filtered.length}</strong>건</span>
          </div>
          <div class="toolbar__right">
            <button class="btn btn--sm btn--primary" type="button" data-pd-new>+ 신규 등록</button>
          </div>
        </div>

        <div class="grid-wrap" style="flex:1;min-height:0;">
          <div class="grid-scroll">
            <table class="tbl tbl--hover">
              <thead>
                <tr>
                  <th style="width:140px;">번호</th>
                  <th style="width:80px;text-align:center;">구분</th>
                  <th style="width:110px;">사번</th>
                  <th style="min-width:240px;">성명</th>
                  <th style="width:120px;">통보일</th>
                  <th>사유</th>
                  <th style="width:140px;text-align:center;">결과</th>
                  <th style="width:90px;">등록자</th>
                  <th style="width:80px;text-align:center;">관리</th>
                </tr>
              </thead>
              <tbody data-pd-body>${renderRows(rows)}</tbody>
            </table>
          </div>

          <div class="pagination">
            <div class="pagination__info" data-pd-info></div>
            <div class="pagination__right">
              <div class="pagination__size">
                <label>페이지당</label>
                <select class="select" data-pd-pagesize>
                  <option value="20">20</option><option value="40">40</option><option value="60">60</option><option value="100">100</option>
                </select>
                <span>건</span>
              </div>
              <div class="pagination__list" data-pd-pagination></div>
            </div>
          </div>
        </div>
      </div>
    `;
    bind(pageEl);
    renderPagination(pageEl, filtered);
  }

  function renderRows(rows) {
    if (!rows.length) {
      return `<tr><td colspan="9" style="text-align:center;color:var(--color-text-muted);padding:32px 0;">
        조건에 맞는 포상·징계 이력이 없습니다.
      </td></tr>`;
    }
    return rows.map(r => {
      const meta = KINDS[r.kind];
      /* 성명 셀 — 임직원 관리 성명 컬럼과 동일: 사진 + 이름 + 팀·직위·직책(muted inline) */
      const member = memberById(r.empId);
      const photo = (member && member.photoUrl) || '';
      const avatarHTML = photo
        ? `<img src="${esc(photo)}" alt="" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;" />`
        : `<span style="width:24px;height:24px;border-radius:50%;background:var(--color-active);color:var(--color-brand-primary);display:inline-flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;">${esc((r.empName || '?').charAt(0))}</span>`;
      /* 부제 — 팀·직위·직책 (값 있는 항목만, muted, 구두점 사이 여백 없이) */
      const pdMeta = [r.empDept, (member && member.rank) || '', r.empPosition || (member && member.position) || '']
        .filter(Boolean)
        .map(v => `<span style="color:var(--color-text-muted);font-size:var(--fs-xs);white-space:nowrap;">${esc(v)}</span>`)
        .join(`<span style="color:var(--color-text-muted);font-size:var(--fs-xs);">·</span>`);
      return `
        <tr data-pd-row="${esc(r.id)}">
          <td style="white-space:nowrap;">${esc(r.id)}</td>
          <td style="text-align:center;">${esc(meta.label)}</td>
          <td style="white-space:nowrap;">${esc(r.empId)}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px;min-width:0;">
              ${avatarHTML}
              <a href="#" data-pd-emp-card="${esc(r.empId)}" style="color:var(--color-brand-primary);font-weight:var(--fw-medium);white-space:nowrap;">${esc(r.empName)}</a>
              <span style="display:inline-flex;align-items:center;gap:0;min-width:0;">${pdMeta}</span>
            </div>
          </td>
          <td style="white-space:nowrap;">${esc(fmtD(r.noticeDate))}</td>
          <td style="max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(r.reason)}">${esc(r.reason)}</td>
          <td style="text-align:center;">${esc(resultLabel(r.kind, r.result))}</td>
          <td>${esc(r.registeredBy || '-')}</td>
          <td style="text-align:center;">
            <button class="btn btn--xs" type="button" data-pd-edit="${esc(r.id)}">수정</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderPagination(pageEl, filtered) {
    const total = filtered.length;
    const start = (STATE.page - 1) * STATE.pageSize;
    const size = STATE.pageSize;
    const totalPages = Math.max(1, Math.ceil(total / size));
    if (STATE.page > totalPages) STATE.page = totalPages;

    const info = pageEl.querySelector('[data-pd-info]');
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
    const pp = pageEl.querySelector('[data-pd-pagination]');
    if (pp) pp.innerHTML = btns.join('');

    const sel = pageEl.querySelector('[data-pd-pagesize]');
    if (sel) sel.value = String(STATE.pageSize);
  }

  function refreshTable(pageEl) {
    const filtered = applyFilter();
    const start = (STATE.page - 1) * STATE.pageSize;
    const rows = filtered.slice(start, start + STATE.pageSize);
    const body = pageEl.querySelector('[data-pd-body]');
    if (body) body.innerHTML = renderRows(rows);
    renderPagination(pageEl, filtered);
    const count = pageEl.querySelector('.toolbar__count');
    if (count) count.innerHTML = `총 <strong>${filtered.length}</strong>건`;
  }

  function bind(pageEl) {
    /* 검색 */
    App.Search.attach(pageEl.querySelector('[data-search]'), (params) => {
      const adv = params.advanced || {};
      STATE.filter.keyword   = (params.keyword || '').trim();
      STATE.filter.condition = params.condition || 'empName';
      STATE.filter.kind      = adv.kind || '';
      STATE.filter.from      = params.from || '';
      STATE.filter.to        = params.to || '';
      STATE.page = 1;
      refreshTable(pageEl);
    }, { defaultQuick: 'y1' });   /* 통보일 기본 기간 = 최근 1년 */

    /* 신규 등록 */
    const newBtn = pageEl.querySelector('[data-pd-new]');
    if (newBtn) newBtn.addEventListener('click', () => openEditor());

    /* 페이지네이션 */
    const pp = pageEl.querySelector('[data-pd-pagination]');
    if (pp) pp.addEventListener('click', e => {
      const b = e.target.closest('.pagination__btn');
      if (!b || b.disabled) return;
      const p = Number(b.dataset.page);
      if (Number.isFinite(p)) { STATE.page = p; refreshTable(pageEl); }
    });
    const ps = pageEl.querySelector('[data-pd-pagesize]');
    if (ps) ps.addEventListener('change', e => { STATE.pageSize = Number(e.target.value); STATE.page = 1; refreshTable(pageEl); });
  }

  /* root delegation — 수정 버튼 + 성명 클릭 시 인사정보카드 */
  function ensureRootDelegation(pageEl) {
    if (pageEl.dataset.pdDelegated === '1') return;
    pageEl.dataset.pdDelegated = '1';
    pageEl.addEventListener('click', e => {
      const card = e.target.closest('[data-pd-emp-card]');
      if (card) {
        e.preventDefault();
        const empId = card.dataset.pdEmpCard;
        const emp = memberById(empId);
        if (emp && window.App && App.HRInfoCard && typeof App.HRInfoCard.open === 'function') {
          App.HRInfoCard.open(emp);
        }
        return;
      }
      const edit = e.target.closest('[data-pd-edit]');
      if (edit) openEditor(edit.dataset.pdEdit);
    });
  }

  /* =========================================================
   *  Editor: 신규 등록 / 수정 — 모달이 아닌 별도 view (계약서 작성과 동일 패턴)
   * ========================================================= */
  function openEditor(recordId) {
    const isEdit = !!recordId;
    const rec = isEdit ? STATE.records.find(r => r.id === recordId) : null;
    const initKind = isEdit ? rec.kind : 'prize';
    STATE.editingId = isEdit ? recordId : null;
    STATE.editing = isEdit
      ? Object.assign({ targets: [{ id: rec.empId, name: rec.empName, dept: rec.empDept, position: rec.empPosition }] }, rec)
      : {
        id: nextSeq(initKind),
        kind: initKind,
        /* 다중 선택 — 신규 등록 시 N명 한 번에 등록 가능. 저장 시 N건 레코드 생성. */
        targets: [],
        noticeDate: TODAY,
        reason: '',
        result: '',
        registeredBy: '정혜진',
        registeredAt: TODAY,
      };
    renderEditorModal();
    openPDModal();
  }
  function openPDModal() {
    const m = document.getElementById('modal-pd-editor');
    if (!m) return;
    m.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closePDModal() {
    const m = document.getElementById('modal-pd-editor');
    if (m) m.classList.remove('is-open');
    document.body.style.overflow = '';
  }
  function exitEditor() {
    STATE.editingId = null;
    STATE.editing = null;
    closePDModal();
    render(document.getElementById('page-hr-prize-discipline'));
  }

  /* Layer modal 안에 본문/푸터를 렌더한다.
   *   - modal__header 의 title 도 함께 갱신
   *   - modal__body : 3 섹션 (기본 정보 / 대상 직원 / 사유)
   *   - modal__footer : 취소 / 등록·저장 / (수정 시 삭제) */
  function renderEditorModal() {
    const modal = document.getElementById('modal-pd-editor');
    if (!modal) return;
    const body = modal.querySelector('#pd-editor-body');
    const foot = modal.querySelector('#pd-editor-footer');
    const titleEl = modal.querySelector('#pd-editor-title');
    if (!body || !foot) return;

    const f = STATE.editing;
    const isEdit = !!STATE.editingId;
    const meta = KINDS[f.kind];
    const resultOpts = ['<option value="">선택하세요</option>']
      .concat(meta.results.map(o => `<option value="${esc(o.value)}" ${o.value === f.result ? 'selected' : ''}>${esc(o.label)}</option>`))
      .join('');

    /* 신규 등록 시 구분 선택 가능, 수정 시는 잠금(텍스트만) */
    const kindFieldHTML = isEdit
      ? `<div class="fm-tbl__value">${esc(meta.label)}</div>`
      : `<div class="fm-tbl__value">
          <select class="select" id="pd-f-kind" style="width:160px;">
            <option value="prize"      ${f.kind === 'prize'      ? 'selected' : ''}>포상</option>
            <option value="discipline" ${f.kind === 'discipline' ? 'selected' : ''}>징계</option>
          </select>
        </div>`;

    if (titleEl) titleEl.textContent = isEdit ? `${meta.label} 수정` : '신규 포상·징계 등록';

    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px;">
        <section>
          <header style="display:flex;align-items:center;gap:10px;padding-bottom:12px;margin-bottom:12px;border-bottom:1px solid var(--color-divider);">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:var(--radius-sm);background:var(--color-brand-primary);color:#fff;font-size:var(--fs-xs);font-weight:var(--fw-bold);">1</span>
            <h3 style="font-size:var(--fs-md);font-weight:var(--fw-semibold);margin:0;">기본 정보</h3>
          </header>

          <div class="fm-tbl fm-tbl--bordered fm-tbl--form fm-tbl--compact">
            <div class="fm-tbl__row fm-tbl__row--2" style="grid-template-columns:120px 1fr 120px 1fr;">
              <div class="fm-tbl__label">구분 <span style="color:var(--color-danger);">*</span></div>
              ${kindFieldHTML}
              <div class="fm-tbl__label">번호</div>
              <div class="fm-tbl__value">${esc(f.id)}</div>
            </div>
            <div class="fm-tbl__row fm-tbl__row--2" style="grid-template-columns:120px 1fr 120px 1fr;">
              <div class="fm-tbl__label">통보일 <span style="color:var(--color-danger);">*</span></div>
              <div class="fm-tbl__value"><input type="date" class="input" id="pd-f-date" value="${esc(f.noticeDate)}"/></div>
              <div class="fm-tbl__label">결과 <span style="color:var(--color-danger);">*</span></div>
              <div class="fm-tbl__value"><select class="select" id="pd-f-result" style="width:100%;max-width:240px;">${resultOpts}</select></div>
            </div>
          </div>
        </section>

        <section>
          <header style="display:flex;align-items:center;gap:10px;padding-bottom:12px;margin-bottom:12px;border-bottom:1px solid var(--color-divider);">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:var(--radius-sm);background:var(--color-brand-primary);color:#fff;font-size:var(--fs-xs);font-weight:var(--fw-bold);">2</span>
            <h3 style="font-size:var(--fs-md);font-weight:var(--fw-semibold);margin:0;">대상 직원</h3>
            <small style="color:var(--color-text-muted);font-size:var(--fs-xs);">${isEdit ? '수정 시 대상은 변경할 수 없습니다.' : '여러 명을 선택하면 동일한 내용으로 N건이 일괄 등록됩니다.'}</small>
            <span style="flex:1;"></span>
            ${isEdit ? '' : `<button class="btn btn--sm" type="button" data-pd-pick>+ 직원 선택</button>`}
          </header>

          <div id="pd-f-emp-display">${renderTargetChips(f.targets || [], isEdit)}</div>
        </section>

        <section>
          <header style="display:flex;align-items:center;gap:10px;padding-bottom:12px;margin-bottom:12px;border-bottom:1px solid var(--color-divider);">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:var(--radius-sm);background:var(--color-brand-primary);color:#fff;font-size:var(--fs-xs);font-weight:var(--fw-bold);">3</span>
            <h3 style="font-size:var(--fs-md);font-weight:var(--fw-semibold);margin:0;">사유 <span style="color:var(--color-danger);font-weight:var(--fw-regular);">*</span></h3>
          </header>

          <input class="input input--full" type="text" id="pd-f-reason" value="${esc(f.reason)}" placeholder="${f.kind === 'prize' ? '예: 신제품 출시 프로젝트 성공적 완수 기여' : '예: 근태 불량 — 월 3회 지각'}"/>
        </section>

        <div style="padding:10px 14px;background:rgba(0,52,125,.04);border-radius:var(--radius-md);font-size:var(--fs-xs);color:var(--color-text-sub);">
          ※ 본 기록은 인사카드의 「포상·징계」 이력에 자동 반영됩니다.${f.kind === 'discipline' ? ' 징계 처분은 사규에 따라 결재선 승인을 거쳐 효력이 발생합니다.' : ''}
        </div>
      </div>
    `;

    foot.innerHTML = `
      ${isEdit ? `<button class="btn btn--danger" type="button" data-pd-delete>삭제</button><span style="flex:1;"></span>` : '<span style="flex:1;"></span>'}
      <button class="btn" type="button" data-pd-back>취소</button>
      <button class="btn btn--primary" type="button" data-pd-save>${isEdit ? '저장' : '등록'}</button>
    `;
    foot.style.display = 'flex';

    bindEditor(modal);
  }

  /* 다중 선택된 대상 직원 chip 렌더 */
  function renderTargetChips(targets, locked) {
    if (!targets.length) {
      return `<div style="padding:14px;background:var(--color-surface-alt);border-radius:var(--radius-md);text-align:center;color:var(--color-text-muted);font-size:var(--fs-sm);">선택된 직원이 없습니다. 우측 「+ 직원 선택」 으로 추가하세요.</div>`;
    }
    return `
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${targets.map(t => `
          <span class="tag tag--primary" style="display:inline-flex;align-items:center;gap:6px;padding:6px 4px 6px 12px;font-size:var(--fs-sm);" data-pd-emp-chip="${esc(t.id)}">
            <strong>${esc(t.name)}</strong>
            <small style="color:var(--color-text-muted);font-weight:var(--fw-regular);">${esc(t.id)} · ${esc(t.dept || '-')}</small>
            ${locked ? '' : `<button class="tag__close" type="button" data-pd-emp-remove="${esc(t.id)}" style="border:0;background:transparent;cursor:pointer;color:var(--color-text-muted);padding:0 6px;font-size:var(--fs-md);">×</button>`}
          </span>
        `).join('')}
      </div>
      <small style="display:block;margin-top:8px;color:var(--color-text-muted);font-size:var(--fs-xs);">총 ${targets.length}명 선택</small>
    `;
  }

  function bindEditor(pageEl) {
    const f = STATE.editing;
    pageEl.querySelectorAll('[data-pd-back]').forEach(b => b.addEventListener('click', exitEditor));
    /* 모달 ✕(닫기) — 전역 data-modal-close 핸들러가 없으므로 직접 닫는다.
     *   exitEditor 가 STATE 정리 + 모달 닫기 + 목록 복귀를 모두 수행(취소 버튼과 동일). */
    pageEl.querySelectorAll('[data-modal-close]').forEach(b => b.addEventListener('click', exitEditor));
    /* 오버레이(backdrop) 클릭으로도 닫기 — 모달 요소에 1회만 바인딩 */
    const pdModalEl = document.getElementById('modal-pd-editor');
    if (pdModalEl && !pdModalEl.dataset.pdBackdropBound) {
      pdModalEl.dataset.pdBackdropBound = '1';
      pdModalEl.addEventListener('click', (e) => { if (e.target === pdModalEl) exitEditor(); });
    }

    /* 구분 select — 변경 시 기본번호/결과 옵션 새로 가져오기 위해 본문 재렌더 */
    const kindSel = pageEl.querySelector('#pd-f-kind');
    if (kindSel) kindSel.addEventListener('change', () => {
      /* 사용자 입력값 보존 — 사유/통보일 등 */
      STATE.editing.noticeDate = (pageEl.querySelector('#pd-f-date') || {}).value || STATE.editing.noticeDate;
      STATE.editing.reason     = (pageEl.querySelector('#pd-f-reason') || {}).value || STATE.editing.reason;
      STATE.editing.kind   = kindSel.value;
      STATE.editing.id     = nextSeq(kindSel.value);
      STATE.editing.result = '';
      renderEditorModal();
    });

    /* 직원 선택 — 다중 선택 picker */
    const pickBtn = pageEl.querySelector('[data-pd-pick]');
    if (pickBtn) pickBtn.addEventListener('click', openPickerModal);

    /* chip 제거 (다중 선택 모드) */
    pageEl.querySelectorAll('[data-pd-emp-remove]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.dataset.pdEmpRemove;
      f.targets = (f.targets || []).filter(t => t.id !== id);
      const host = pageEl.querySelector('#pd-f-emp-display');
      if (host) host.innerHTML = renderTargetChips(f.targets, false);
      bindEditor(pageEl);  /* 새 chip 들의 remove 핸들러 재바인딩 (포커스 손실 없이) */
    }));

    /* 저장 */
    pageEl.querySelector('[data-pd-save]').addEventListener('click', () => {
      f.noticeDate = pageEl.querySelector('#pd-f-date').value;
      f.result     = pageEl.querySelector('#pd-f-result').value;
      f.reason     = (pageEl.querySelector('#pd-f-reason').value || '').trim();
      const targets = f.targets || [];
      if (!targets.length) { window.toast && window.toast('대상 직원을 선택하세요.', 'warning'); return; }
      if (!f.noticeDate)   { window.toast && window.toast('통보일을 입력하세요.', 'warning'); return; }
      if (!f.result)       { window.toast && window.toast('결과를 선택하세요.', 'warning'); return; }
      if (!f.reason)       { window.toast && window.toast('사유를 입력하세요.', 'warning'); return; }

      if (STATE.editingId) {
        /* 수정 모드 — 대상자 단일 유지 (변경 불가) */
        const idx = STATE.records.findIndex(r => r.id === STATE.editingId);
        if (idx >= 0) {
          STATE.records[idx] = Object.assign({}, STATE.records[idx], {
            kind: f.kind, noticeDate: f.noticeDate, result: f.result, reason: f.reason,
          });
        }
        window.toast && window.toast('저장되었습니다.', 'success');
      } else {
        /* 신규 등록 — 다중 선택된 N명에 대해 동일 내용으로 N건 일괄 생성 */
        targets.forEach(t => {
          const id = nextSeq(f.kind);
          STATE.records.unshift({
            id, kind: f.kind,
            empId: t.id, empName: t.name, empDept: t.dept || '', empPosition: t.position || '',
            noticeDate: f.noticeDate,
            reason: f.reason,
            result: f.result,
            registeredBy: f.registeredBy,
            registeredAt: f.registeredAt,
          });
        });
        window.toast && window.toast(`${KINDS[f.kind].label} ${targets.length}건이 등록되었습니다.`, 'success');
      }
      exitEditor();
    });

    /* 삭제 */
    const delBtn = pageEl.querySelector('[data-pd-delete]');
    if (delBtn) delBtn.addEventListener('click', () => {
      if (!confirm('이 기록을 삭제하시겠습니까?')) return;
      STATE.records = STATE.records.filter(r => r.id !== STATE.editingId);
      window.toast && window.toast('삭제되었습니다.', 'info');
      exitEditor();
    });
  }

  /* =========================================================
   *  MODAL: 직원 선택 picker
   *   전자결재(문서작성)의 공용 Employee Picker(App.openEmpPicker) 를 재사용.
   *   callback 모드 + multi:true → 선택된 직원 배열을 onConfirm 으로 받음.
   *
   *   App.Employees 의 직원 객체 필드: { id, name, dept, pos, photo }
   *   포상·징계 target 필드           : { id, name, dept, position }
   *   → pos → position 매핑.
   *
   *   picker 는 항상 빈 상태로 열림(내부에서 pickerSelected.clear()).
   *   따라서 + 직원 선택 클릭 시점에 기존 target 과 머지(중복 제거) 한다.
   * ========================================================= */
  function openPickerModal() {
    if (!(window.App && typeof App.openEmpPicker === 'function')) {
      window.toast && window.toast('직원 선택 모듈이 아직 준비되지 않았습니다.', 'warning');
      return;
    }
    App.openEmpPicker({
      action: 'callback',
      multi: true,
      onConfirm(selected) {
        if (!selected || !selected.length) return;
        const existing = (STATE.editing.targets || []).slice();
        const seen = new Set(existing.map(t => t.id));
        selected.forEach(e => {
          if (seen.has(e.id)) return;
          existing.push({
            id: e.id,
            name: e.name,
            dept: e.dept || '',
            position: e.pos || e.position || '',
          });
          seen.add(e.id);
        });
        STATE.editing.targets = existing;
        /* Layer modal 안의 chip 영역 갱신 + 리바인드 */
        const modal = document.getElementById('modal-pd-editor');
        const host = modal ? modal.querySelector('#pd-f-emp-display') : null;
        if (host) host.innerHTML = renderTargetChips(existing, false);
        if (modal) bindEditor(modal);
      },
    });
  }

  /* =========================================================
   *  Modal 공통
   * ========================================================= */
  function buildModal(id, html) {
    let modal = document.getElementById(id);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = id;
      modal.className = 'modal-backdrop';
      modal.dataset.modalId = id;
      modal.addEventListener('click', e => { if (e.target === modal) closeModal(id); });
      document.body.appendChild(modal);
    }
    modal.innerHTML = html;
    return modal;
  }
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

  /* =========================================================
   *  Page Init
   * ========================================================= */
  let built = false;
  function initPage() {
    const pageEl = document.getElementById('page-hr-prize-discipline');
    if (!pageEl) return;
    pageEl.__onShow = () => {
      if (!built) {
        STATE.records = makeMock();
        built = true;
      }
      STATE.page = 1;
      render(pageEl);
      ensureRootDelegation(pageEl);
    };
  }
  const prev = App.initPages;
  App.initPages = function () {
    if (typeof prev === 'function') prev();
    initPage();
  };
})();
