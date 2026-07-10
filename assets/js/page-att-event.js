/* =========================================================
 * Page: 근태 > 경조사 > 경조사 내역  (인사총무 담당자 업무 처리 화면)
 *
 *  개요
 *   - 전자결재 '승인' 완료된 경조사만 쌓이는 인사총무 담당자의 처리 큐.
 *   - 전자결재 번호 클릭 → 결재 문서 상세(전자결재 내용). 처리번호 클릭 → 업무 처리 모달
 *     (경조 구분별 경조휴가/경조금/화환 처리). 처리 완료도에 따라 '처리 상태' 컬럼 갱신.
 *
 *  구성
 *   1) 검색 패널 (App.Components.searchPanel) — 신청일 기간 / 성명·사번 / 경조 구분·처리 상태
 *   2) 툴바 — 총 N건
 *   3) 그리드 (.tbl tbl--hover) — 전자결재번호 · 처리번호 · 신청자 · 경조구분 · 화환 · 경조휴가/금 · 처리담당자 · 처리상태
 *   4) 전자결재 문서 상세 모달 (modal-evt-doc) — 전자결재 신청 내용 + 결재 내역
 *   5) 업무 처리 모달 (modal-evt-proc) — 경조 구분별 처리 항목 토글(처리/완료 취소)
 *
 *  데이터: App.AttEvent.list()/kinds() (본 파일에서 정의·노출)
 *  ※ 직원 명단은 App.AttStatus.EMP_LIST 재사용. 처리 담당자는 인사총무팀 풀에서 결정적 배정.
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  /* ============ 환경 ============ */
  const TODAY = '2026-05-29';

  /* ============ 경조 구분 마스터 — 사내 경조 규정표 기준 ============
     cat: 대분류 / leaveDays: 경조휴가 / amount: 경조금(정규직 100% 기준) / wreath: 화환 / doc: 증빙
     wreath: 'congrat' 축하화환 / 'condol' 근조화환 / null 화환 없음 */
  const KINDS = [
    /* 결혼 */
    { value: 'wedding_self',     cat: '결혼', label: '본인 결혼',            leaveDays: 5,  amount: 500000,  wreath: 'congrat', doc: '혼인관계증명서' },
    { value: 'wedding_child',    cat: '결혼', label: '자녀 결혼',            leaveDays: 1,  amount: 200000,  wreath: 'congrat', doc: '주민등록등본 / 가족관계증명서 / 혼인관계증명서 중 1' },
    { value: 'wedding_sibling',  cat: '결혼', label: '본인·배우자 형제자매 결혼', leaveDays: 1, amount: 0,   wreath: 'congrat', doc: '' },
    /* 출산 */
    { value: 'birth_self',       cat: '출산', label: '본인 출산',            leaveDays: 0,  amount: 200000,  wreath: null,      doc: '출생증명서' },
    { value: 'birth_spouse',     cat: '출산', label: '배우자 출산',          leaveDays: 10, amount: 200000,  wreath: null,      doc: '' },
    /* 조의 */
    { value: 'death_self',       cat: '조의', label: '본인 사망',            leaveDays: 0,  amount: 1000000, wreath: 'condol',  doc: '' },
    { value: 'death_spouse',     cat: '조의', label: '배우자 사망',          leaveDays: 5,  amount: 500000,  wreath: 'condol',  doc: '주민등록등본 / 가족관계증명서 + 사망진단서' },
    { value: 'death_child',      cat: '조의', label: '자녀 사망',            leaveDays: 5,  amount: 500000,  wreath: 'condol',  doc: '' },
    { value: 'death_parent',     cat: '조의', label: '본인·배우자 부모 사망',  leaveDays: 5,  amount: 400000,  wreath: 'condol',  doc: '' },
    { value: 'death_sibling',    cat: '조의', label: '본인·배우자 형제자매 사망', leaveDays: 3, amount: 200000, wreath: 'condol', doc: '' },
    { value: 'death_grandparent',cat: '조의', label: '본인·배우자 조부모 사망',  leaveDays: 2,  amount: 200000,  wreath: 'condol',  doc: '' },
  ];
  function kindMeta(v) { return KINDS.find(k => k.value === v) || null; }
  function kindLabel(v) { const k = kindMeta(v); return k ? k.label : v; }
  /* 화환 종류 메타 — 그리드 pill / 처리 모달 공용 */
  const WREATHS = {
    congrat: { label: '축하화환', tone: 'success', place: '예식장' },
    condol:  { label: '근조화환', tone: 'muted',   place: '장례식장' },
  };
  function wreathMeta(v) { const k = kindMeta(v); return (k && k.wreath) ? WREATHS[k.wreath] : null; }

  /* 경조금 지급률 — 수습직 70% / 정규직 100% (규정). att 명단엔 고용형태가 없어 기본 정규직. */
  const PAY_RATE = { probation: 0.7, regular: 1.0 };
  function payRateOf(empType) { return empType === 'probation' ? PAY_RATE.probation : PAY_RATE.regular; }

  /* 경조 구분 대분류 pill 톤 */
  const CAT_TONE = { '결혼': 'info', '출산': 'success', '조의': 'muted' };
  /* 전자결재 문서 유형 — event(경조 신청서) / wreath(화환 신청서) */
  const DOC_LABEL = { event: '경조 신청서', wreath: '화환 신청서' };

  /* 업무 처리 태스크 — 문서 유형별. 경조 신청서: 경조휴가/경조금 / 화환 신청서: 화환 발송 */
  function tasksFor(r) {
    const k = kindMeta(r.kind) || {};
    if (r.docType === 'wreath') return ['wreath'];
    const t = [];
    if (k.leaveDays > 0) t.push('leave');
    if (k.amount > 0)    t.push('pay');
    return t;
  }
  function procDone(r) {
    const ts = tasksFor(r);
    const p = r.proc || {};
    return ts.filter(t => p[t]).length;
  }
  /* 신청 내용 — 문서 유형별 요약 (경조휴가·경조금 / 화환 종류) */
  function applyContent(r) {
    const k = kindMeta(r.kind) || {};
    if (r.docType === 'wreath') { const wr = wreathMeta(r.kind); return wr ? `${wr.label} 발송` : '화환 발송'; }
    const parts = [];
    if (k.leaveDays > 0) parts.push(`경조휴가 ${k.leaveDays}일`);
    if (k.amount > 0)    parts.push(`경조금 ${won(k.amount)}원`);
    return parts.join(' · ') || '-';
  }

  const STATUSES = {
    pending:  { label: '결재대기', tone: 'warning' },
    approved: { label: '승인',     tone: 'success' },
    rejected: { label: '반려',     tone: 'danger'  },
  };

  /* ============ 처리 담당자 풀 (인사총무팀) — 사번 기반 결정적 배정 ============ */
  const HANDLERS = [
    { id: 'SW22030101', name: '정혜진', pos: '대리' },
    { id: 'SW19050203', name: '윤민지', pos: '과장' },
    { id: 'SW21010402', name: '오선재', pos: '주임' },
  ];
  function handlerOf(empId) {
    const t = Number(String(empId).replace(/\D/g, '').slice(-3)) || 1;
    return HANDLERS[t % HANDLERS.length];
  }

  /* ============ Store (mock) ============ */
  let _store = null;
  let _seq = 0;
  function _empList() {
    return (App.AttStatus && App.AttStatus.EMP_LIST) ? App.AttStatus.EMP_LIST : [];
  }
  /* att EMP_LIST 에는 직책이 없어 사번 기반 결정적 mock 직책 부여 */
  const POS_POOL = ['사원', '주임', '대리', '과장', '차장', '팀장'];
  function posOf(empId) {
    const t = Number(String(empId).slice(-2)) || 1;
    return POS_POOL[t % POS_POOL.length];
  }
  /* 전자결재 문서번호 — 경조 신청서. 신청일 기준. */
  function _eaNo(appliedAt, seq) {
    const yy = (appliedAt || TODAY).slice(2, 4);
    return `EA-${yy}-${String(2000 + seq).slice(1)}`;
  }
  /* 화환 신청서 전자결재 문서번호 — 경조 신청서와 별개 문서(화환 구분 건만). */
  function _wreathEaNo(occuredAt, seq) {
    const yy = (occuredAt || TODAY).slice(2, 4);
    return `EAW-${yy}-${String(2500 + seq).slice(1)}`;
  }
  /* 처리번호 — 결재 승인 건에만 부여(처리 대상). 발생일 기준. */
  function _procNo(occuredAt, seq) {
    const yy = (occuredAt || TODAY).slice(2, 4);
    return `PRC-${yy}-${String(3000 + seq).slice(1)}`;
  }
  /* 결재선 — 신청자 팀장 → 인사총무팀장(승인 시 완결). 상태에 따라 진행 단계 표시. */
  function _approvers(handler, status, submittedAt, decidedAt) {
    const line = [
      { stage: 1, name: '부서장',            status: '결재', at: submittedAt },
      { stage: 2, name: `${handler.name} ${handler.pos}`, status: '결재', at: decidedAt },
    ];
    if (status === 'pending')  { line[1].status = '대기'; line[1].at = ''; }
    if (status === 'rejected') { line[1].status = '반려'; }
    return line;
  }
  /* 한 경조 발생 → 전자결재 문서 1~2건(경조 신청서 + 화환 신청서)으로 각각 행 생성. */
  function _makeDoc(docType, ev, proc) {
    const k = kindMeta(ev.kind) || { leaveDays: 0, amount: 0 };
    const handler = handlerOf(ev.emp.id);
    _seq++;
    const submittedAt = `${ev.appliedAt} 09:${String(10 + _seq).slice(-2)}`;
    const decidedAt   = `${ev.occuredAt} 14:${String(20 + _seq).slice(-2)}`;
    const base = {
      id: `EVT-${TODAY.slice(2, 4)}-${String(1000 + _seq).slice(1)}`,
      docType,
      eaNo: docType === 'wreath' ? _wreathEaNo(ev.occuredAt, _seq) : _eaNo(ev.appliedAt, _seq),
      procNo: _procNo(ev.occuredAt, _seq),
      empId: ev.emp.id, name: ev.emp.name, dept: ev.emp.dept, position: posOf(ev.emp.id),
      empType: 'regular',
      cat: k.cat, kind: ev.kind,
      occuredAt: ev.occuredAt, appliedAt: ev.appliedAt,
      note: '',
      status: 'approved',
      handler, submittedAt, decidedAt,
      processedAt: '',
      proc: Object.assign(docType === 'wreath' ? { wreath: false } : { leave: false, pay: false }, proc || {}),
    };
    const ts = tasksFor(base);
    if (ts.length && ts.every(t => base.proc[t])) base.processedAt = ev.occuredAt;
    return base;
  }
  function _seed() {
    _seq = 0;
    const emps = _empList();
    const pick = (i) => emps[i % emps.length] || { id: 'SW22030101', name: '정혜진', dept: '인사팀' };
    /* 전자결재 '승인' 완료된 경조사만 쌓이는 인사총무 처리 큐. 화환 구분은 화환 신청서가 별도 문서로 추가됨. */
    const events = [
      { emp: pick(1),  kind: 'wedding_self',     occuredAt: '2026-05-24', appliedAt: '2026-05-12', ep: { leave: true,  pay: false }, wp: { wreath: true  } },
      { emp: pick(3),  kind: 'death_parent',     occuredAt: '2026-05-20', appliedAt: '2026-05-20', ep: { leave: true,  pay: true  }, wp: { wreath: true  } },
      { emp: pick(0),  kind: 'birth_spouse',     occuredAt: '2026-05-18', appliedAt: '2026-05-15', ep: { leave: false, pay: false } },
      { emp: pick(6),  kind: 'wedding_child',    occuredAt: '2026-05-09', appliedAt: '2026-05-04', ep: { leave: false, pay: false }, wp: { wreath: false } },
      { emp: pick(8),  kind: 'death_grandparent',occuredAt: '2026-04-28', appliedAt: '2026-04-28', ep: { leave: true,  pay: true  }, wp: { wreath: true  } },
      { emp: pick(4),  kind: 'death_spouse',     occuredAt: '2026-04-15', appliedAt: '2026-04-15', ep: { leave: true,  pay: false }, wp: { wreath: true  } },
      { emp: pick(10), kind: 'birth_self',       occuredAt: '2026-04-03', appliedAt: '2026-03-30', ep: { pay: true } },
      { emp: pick(2),  kind: 'wedding_sibling',  occuredAt: '2026-03-21', appliedAt: '2026-03-16', ep: { leave: true }, wp: { wreath: true } },
      { emp: pick(7),  kind: 'death_sibling',    occuredAt: '2026-03-08', appliedAt: '2026-03-08', ep: { leave: true,  pay: true  }, wp: { wreath: true  } },
      { emp: pick(5),  kind: 'death_child',      occuredAt: '2026-02-19', appliedAt: '2026-02-18', ep: { leave: true,  pay: true  }, wp: { wreath: true  } },
    ];
    const out = [];
    events.forEach(ev => {
      const k = kindMeta(ev.kind) || {};
      out.push(_makeDoc('event', ev, ev.ep));
      if (k.wreath) out.push(_makeDoc('wreath', ev, ev.wp));
    });
    return out;
  }
  function getStore() {
    if (!_store) _store = _seed();
    return _store;
  }

  App.AttEvent = {
    kinds() { return KINDS.slice(); },
    kindLabel,
    list() { return getStore(); },
    add(rec) {
      const ev = {
        emp: { id: rec.empId, name: rec.name, dept: rec.dept },
        kind: rec.kind,
        occuredAt: rec.occuredAt,
        appliedAt: rec.appliedAt || TODAY,
      };
      const k = kindMeta(rec.kind) || {};
      const docs = [_makeDoc('event', ev, {})];
      if (k.wreath) docs.push(_makeDoc('wreath', ev, {}));
      docs.forEach(d => getStore().unshift(d));
      return docs[0];
    },
  };

  /* ============ Helpers ============ */
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function won(n) { return (Number(n) || 0).toLocaleString('ko-KR'); }
  /* 표시 전용 날짜/일시 포맷 (원본 ISO 값은 불변 — 비교·정렬·키에 사용) */
  function fmtDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    return m ? `${m[1].slice(2)}/${m[2]}/${m[3]}` : (s == null ? '' : String(s));
  }
  function fmtDateTime(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s || ''));
    return m ? `${m[1].slice(2)}/${m[2]}/${m[3]}   ${m[4]}:${m[5]}` : fmtDate(s);
  }

  /* ============ STATE ============ */
  const STATE = {
    filter: { keyword: '', condition: 'name', kind: '', status: '', from: '', to: '' },
    page: 1, pageSize: 20,
  };

  /* ============ 필터 ============ */
  function applyFilter() {
    const p = STATE.filter;
    const kw = (p.keyword || '').trim().toLowerCase();
    return getStore().filter(r => {
      if (kw) {
        const t = p.condition === 'empId' ? r.empId : r.name;
        if (!String(t).toLowerCase().includes(kw)) return false;
      }
      if (p.kind && r.kind !== p.kind) return false;
      if (p.status && procState(r).key !== p.status) return false;
      if (p.from && (r.appliedAt || '') < p.from) return false;
      if (p.to   && (r.appliedAt || '') > p.to)   return false;
      return true;
    }).sort((a, b) => (b.appliedAt || '').localeCompare(a.appliedAt || ''));
  }

  /* 처리 상태 — 처리 항목 완료도 기준 (미처리 / 진행중 / 처리완료) */
  function procState(r) {
    const total = tasksFor(r).length;
    const done = procDone(r);
    if (total === 0 || done >= total) return { key: 'done',        label: '처리완료', tone: 'success' };
    if (done > 0)                     return { key: 'progress',    label: '진행중',  tone: 'info'    };
    return                                   { key: 'unprocessed', label: '미처리',  tone: 'warning' };
  }

  /* =========================================================
   *  VIEW
   * ========================================================= */
  function render(pageEl) {
    const C = App.Components;
    const kindOpts = KINDS.map(k => ({ value: k.value, label: k.label }));
    const searchHTML = C.searchPanel({
      showDateRange: true,
      dateColumns: [{ key: 'appliedAt', label: '신청일' }],
      quick: ['week', 'm1', 'm3', 'm6', 'y1'],
      conditions: [
        { value: 'name',  label: '성명' },
        { value: 'empId', label: '사번' },
      ],
      placeholder: '성명 또는 사번 검색',
      cols: 2,
      advanced: [
        { name: 'kind',   label: '경조 구분', options: kindOpts },
        { name: 'status', label: '처리 상태', options: [
          { value: 'unprocessed', label: '미처리' },
          { value: 'progress',    label: '진행중' },
          { value: 'done',        label: '처리완료' },
        ]},
      ],
    });

    pageEl.innerHTML = `
      ${searchHTML}

      <div style="flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;">
        <div class="toolbar">
          <div class="toolbar__left">
            <span class="toolbar__count">총 <strong data-evt-count>0</strong>건</span>
          </div>
        </div>
        <div class="grid-wrap" style="flex:1;min-height:0;">
          <div class="grid-scroll">
            <table class="tbl tbl--hover">
              <thead>
                <tr>
                  <th style="width:122px;">전자결재 번호</th>
                  <th style="width:120px;">처리 번호</th>
                  <th style="width:96px;">사번</th>
                  <th style="min-width:200px;">성명</th>
                  <th style="width:86px;text-align:center;">경조 구분</th>
                  <th style="width:150px;">경조 내용</th>
                  <th style="min-width:200px;">신청 내용</th>
                  <th style="width:104px;">신청일</th>
                  <th style="width:104px;">발생일</th>
                  <th style="width:104px;">처리일</th>
                  <th style="width:96px;">처리 담당자</th>
                  <th style="width:90px;text-align:center;">처리 상태</th>
                  <th style="width:90px;text-align:center;"></th>
                </tr>
              </thead>
              <tbody data-evt-body></tbody>
            </table>
          </div>
          <div class="pagination">
            <div class="pagination__info" data-evt-info></div>
            <div class="pagination__right">
              <div class="pagination__size">
                <label>페이지당</label>
                <select class="select" data-evt-pagesize>
                  <option value="20">20</option><option value="40">40</option><option value="60">60</option><option value="100">100</option>
                </select>
                <span>건</span>
              </div>
              <div class="pagination__list" data-evt-pagination></div>
            </div>
          </div>
        </div>
      </div>
    `;

    refreshTable(pageEl);
    bind(pageEl);
  }

  /* 성명 셀 아바타 — 발령 관리(page-hr-appoint) 패턴: 24x24 사진 또는 이니셜 원형 */
  function avatarHTML(r) {
    const member = (App.HRMembers && App.HRMembers.list) ? App.HRMembers.list().find(m => m.id === r.empId) : null;
    const photo = (member && member.photoUrl) || '';
    return photo
      ? `<img src="${esc(photo)}" alt="" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.style.background='#E5E7EB';this.removeAttribute('src');" />`
      : `<span style="width:24px;height:24px;border-radius:50%;background:var(--color-active);color:var(--color-brand-primary);display:inline-flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;">${esc((r.name || '?').charAt(0))}</span>`;
  }
  function renderRows(rows) {
    if (!rows.length) {
      return `<tr><td colspan="13" style="text-align:center;color:var(--color-text-muted);padding:32px 0;">조건에 해당하는 경조사 처리 건이 없습니다.</td></tr>`;
    }
    return rows.map(r => {
      const handler = r.handler || handlerOf(r.empId);
      const ps = procState(r);
      const catTone = CAT_TONE[r.cat] || 'muted';

      /* 전자결재 번호 클릭 → 결재 문서. 처리번호/상세 클릭 → 업무 처리. 행 클릭 → 결재 문서. 성명 → 인사카드 */
      return `
        <tr class="is-clickable" data-evt-row="${esc(r.id)}">
          <td style="white-space:nowrap;"><a href="#" class="link-code" data-evt-doc="${esc(r.id)}">${esc(r.eaNo || '-')}</a></td>
          <td style="white-space:nowrap;"><a href="#" class="link-code" data-evt-proc="${esc(r.id)}">${esc(r.procNo || '-')}</a></td>
          <td style="white-space:nowrap;">${esc(r.empId)}</td>
          <td>
            <div style="display:flex;align-items:center;gap:6px;min-width:0;">
              ${avatarHTML(r)}
              <a href="#" data-evt-card="${esc(r.empId)}" style="color:var(--color-brand-primary);font-weight:var(--fw-medium);white-space:nowrap;">${esc(r.name)}</a>
              ${r.position ? `<span style="color:var(--color-text-muted);font-size:var(--fs-xs);margin-left:2px;">${esc(r.position)}</span>` : ''}
              <span style="color:var(--color-text-muted);font-size:var(--fs-xs);">·</span>
              <span style="color:var(--color-text-muted);font-size:var(--fs-xs);white-space:nowrap;">${esc(r.dept || '-')}</span>
            </div>
          </td>
          <td style="text-align:center;"><span class="pill pill--${catTone}" style="font-size:var(--fs-xs);">${esc(r.cat || '-')}</span></td>
          <td style="white-space:nowrap;">${esc(kindLabel(r.kind))}</td>
          <td>${esc(applyContent(r))}</td>
          <td style="white-space:nowrap;">${r.appliedAt ? esc(fmtDate(r.appliedAt)) : '-'}</td>
          <td style="white-space:nowrap;">${r.occuredAt ? esc(fmtDate(r.occuredAt)) : '-'}</td>
          <td style="white-space:nowrap;">${r.processedAt ? esc(fmtDate(r.processedAt)) : '<span class="t-muted">-</span>'}</td>
          <td style="white-space:nowrap;">${esc(handler.name)}</td>
          <td style="text-align:center;"><span class="pill pill--${ps.tone}" style="font-size:var(--fs-xs);">${esc(ps.label)}</span></td>
          <td style="text-align:center;"><button class="btn btn--xs" type="button" data-evt-proc="${esc(r.id)}">상세 보기</button></td>
        </tr>
      `;
    }).join('');
  }

  function refreshTable(pageEl) {
    const filtered = applyFilter();
    const start = (STATE.page - 1) * STATE.pageSize;
    const rows = filtered.slice(start, start + STATE.pageSize);
    const body = pageEl.querySelector('[data-evt-body]');
    if (body) body.innerHTML = renderRows(rows);
    const cnt = pageEl.querySelector('[data-evt-count]');
    if (cnt) cnt.textContent = filtered.length;
    renderPagination(pageEl, filtered);
  }

  function renderPagination(pageEl, filtered) {
    const total = filtered.length;
    const size = STATE.pageSize;
    const totalPages = Math.max(1, Math.ceil(total / size));
    if (STATE.page > totalPages) STATE.page = totalPages;
    const start = (STATE.page - 1) * size;

    const info = pageEl.querySelector('[data-evt-info]');
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
    const pp = pageEl.querySelector('[data-evt-pagination]');
    if (pp) pp.innerHTML = btns.join('');

    const sel = pageEl.querySelector('[data-evt-pagesize]');
    if (sel) sel.value = String(STATE.pageSize);
  }

  function bind(pageEl) {
    if (App.Search && App.Search.attach) {
      App.Search.attach(pageEl.querySelector('[data-search]'), (params) => {
        const adv = params.advanced || {};
        STATE.filter.keyword   = (params.keyword || '').trim();
        STATE.filter.condition = params.condition || 'name';
        STATE.filter.kind      = adv.kind || '';
        STATE.filter.status    = adv.status || '';
        STATE.filter.from      = params.from || '';
        STATE.filter.to        = params.to || '';
        STATE.page = 1;
        refreshTable(pageEl);
      }, { defaultQuick: 'y1' });   /* 기간 필터 기본값 — 최근 1년 */
    }

    const pp = pageEl.querySelector('[data-evt-pagination]');
    if (pp) pp.addEventListener('click', e => {
      const b = e.target.closest('.pagination__btn');
      if (!b || b.disabled) return;
      const p = Number(b.dataset.page);
      if (Number.isFinite(p)) { STATE.page = p; refreshTable(pageEl); }
    });
    const ps = pageEl.querySelector('[data-evt-pagesize]');
    if (ps) ps.addEventListener('change', e => { STATE.pageSize = Number(e.target.value); STATE.page = 1; refreshTable(pageEl); });

    /* 행/번호/성명 클릭 위임 */
    const body = pageEl.querySelector('[data-evt-body]');
    if (body && !body.dataset.cardBound) {
      body.dataset.cardBound = '1';
      body.addEventListener('click', e => {
        /* 전자결재 번호 클릭 → 결재 문서 상세 */
        const docLink = e.target.closest('[data-evt-doc]');
        if (docLink) { e.preventDefault(); openDocModal(docLink.dataset.evtDoc); return; }

        /* 처리번호 클릭 → 업무 처리 모달 */
        const procLink = e.target.closest('[data-evt-proc]');
        if (procLink) { e.preventDefault(); openProcModal(procLink.dataset.evtProc); return; }

        /* 성명 클릭 — 인사정보카드 (발령 관리와 동일) */
        const link = e.target.closest('[data-evt-card]');
        if (link) {
        e.preventDefault();
          if (!(window.App && App.HRInfoCard && App.HRInfoCard.open)) return;
          const empId = link.dataset.evtCard;
          const member = (App.HRMembers && App.HRMembers.list) ? App.HRMembers.list().find(m => m.id === empId) : null;
          if (member) {
            App.HRInfoCard.open(Object.assign({
              empType: member.empType || 'regular', jobCat: member.jobCat || 'office',
              site: member.site || '본사', infoStatus: 'done',
            }, member));
            return;
          }
          const rec = getStore().find(r => r.empId === empId);
          if (!rec) { window.toast && window.toast('인사 정보를 찾을 수 없습니다.', 'info'); return; }
          App.HRInfoCard.open({
            id: rec.empId, name: rec.name, dept: rec.dept || '', position: rec.position || '', rank: '',
            empType: 'regular', jobCat: 'office', site: '본사', infoStatus: 'done',
          });
          return;
        }

        /* 행 빈 영역 클릭 → 문서 상세 (텍스트 드래그 선택 중 제외) */
        const sel = window.getSelection && window.getSelection();
        if (sel && sel.type === 'Range' && String(sel).length > 0) return;
        const row = e.target.closest('[data-evt-row]');
        if (row) { openDocModal(row.dataset.evtRow); return; }
      });
    }
  }

  /* ============ 모달 공통 ============ */
  function openModalEl(id) { const m = document.getElementById(id); if (!m) return; m.classList.add('is-open'); document.body.style.overflow = 'hidden'; }
  function closeModalEl(id) { const m = document.getElementById(id); if (m) m.classList.remove('is-open'); if (!document.querySelector('.modal-backdrop.is-open')) document.body.style.overflow = ''; }

  const GT2 = 'grid-template-columns:110px 1fr 110px 1fr;';
  const GT1 = 'grid-template-columns:110px 1fr;';

  /* =========================================================
   *  전자결재 문서 상세 모달 — 전자결재 관련 내용만 (신청 내용 + 결재 내역)
   * ========================================================= */
  function openDocModal(recId) {
    const r = getStore().find(x => x.id === recId);
    if (!r) return;
    const titleEl = document.getElementById('evt-doc-title');
    if (titleEl) titleEl.textContent = `${DOC_LABEL[r.docType] || '경조 신청서'} — ${r.name}`;
    const body = document.getElementById('evt-doc-body');
    if (body) body.innerHTML = renderDocBody(r);
    const modal = document.getElementById('modal-evt-doc');
    if (modal && !modal.dataset.bound) {
      modal.dataset.bound = '1';
      modal.addEventListener('click', e => { if (e.target === modal) closeModalEl('modal-evt-doc'); });
      modal.querySelectorAll('[data-modal-close], [data-evt-doc-close]').forEach(b => b.addEventListener('click', () => closeModalEl('modal-evt-doc')));
      modal.addEventListener('click', e => {
        const dl = e.target.closest('[data-evt-dl]');
        if (dl) { e.preventDefault(); App.downloadFile && App.downloadFile(dl.dataset.evtDl, { context: '경조사 첨부' }); }
      });
    }
    openModalEl('modal-evt-doc');
  }

  /* 결재선 HTML — 두 신청서 공용 */
  function aprHTML(r) {
    const handler = r.handler || handlerOf(r.empId);
    return _approvers(handler, r.status, r.submittedAt, r.decidedAt).map(s => `
      <div class="att-doc-apr">
        <div class="att-doc-apr__stage">${s.stage}차</div>
        <div class="att-doc-apr__name">${esc(s.name)}</div>
        <div class="att-doc-apr__status">
          <span class="pill pill--${s.status === '결재' ? 'success' : s.status === '반려' ? 'danger' : 'warning'}">${esc(s.status)}</span>
          ${s.at ? `<small class="t-muted" style="margin-left:6px;">${esc(fmtDateTime(s.at))}</small>` : ''}
        </div>
      </div>
    `).join('');
  }

  /* 경조 신청서 폼 (직원 상신 — 경조휴가/경조금) */
  function eventFormHTML(r) {
    const st = STATUSES[r.status] || { label: r.status, tone: 'muted' };
    const k = kindMeta(r.kind) || {};
    const docName = `${kindLabel(r.kind)}_증빙.pdf`;
    return `
      <div class="fm-tbl fm-tbl--compact fm-tbl--bordered fm-tbl--form">
        <div class="fm-tbl__row fm-tbl__row--2" style="${GT2}">
          <div class="fm-tbl__label">전자결재 번호</div>
          <div class="fm-tbl__value"><strong>${esc(r.eaNo || '-')}</strong></div>
          <div class="fm-tbl__label">결재 상태</div>
          <div class="fm-tbl__value"><span class="pill pill--${st.tone}">${esc(st.label)}</span></div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--2" style="${GT2}">
          <div class="fm-tbl__label">기안자</div>
          <div class="fm-tbl__value">${esc(r.name)} <span class="t-muted" style="margin-left:4px;">${esc(r.empId)}</span></div>
          <div class="fm-tbl__label">부서/직책</div>
          <div class="fm-tbl__value">${esc(r.dept || '-')}${r.position ? ' · ' + esc(r.position) : ''}</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--2" style="${GT2}">
          <div class="fm-tbl__label">경조 구분</div>
          <div class="fm-tbl__value">${esc(kindLabel(r.kind))}</div>
          <div class="fm-tbl__label">발생일</div>
          <div class="fm-tbl__value">${r.occuredAt ? esc(fmtDate(r.occuredAt)) : '-'}</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--2" style="${GT2}">
          <div class="fm-tbl__label">경조휴가</div>
          <div class="fm-tbl__value">${k.leaveDays ? k.leaveDays + '일' : '-'}</div>
          <div class="fm-tbl__label">경조금</div>
          <div class="fm-tbl__value">${k.amount ? won(k.amount) + '원' : '-'}</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--2" style="${GT2}">
          <div class="fm-tbl__label">상신 일시</div>
          <div class="fm-tbl__value">${r.submittedAt ? esc(fmtDateTime(r.submittedAt)) : '-'}</div>
          <div class="fm-tbl__label">처리 일시</div>
          <div class="fm-tbl__value">${r.decidedAt ? esc(fmtDateTime(r.decidedAt)) : '-'}</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" style="${GT1}">
          <div class="fm-tbl__label">증빙 서류</div>
          <div class="fm-tbl__value">
            <a href="javascript:;" class="link-code" data-evt-dl="${esc(docName)}">${esc(docName)} <span style="font-size:10px;">↓</span></a>
            ${k.doc ? `<span class="t-muted" style="font-size:var(--fs-xs);margin-left:8px;">제출 서류: ${esc(k.doc)}</span>` : ''}
          </div>
        </div>
        ${r.note ? `<div class="fm-tbl__row fm-tbl__row--1" style="${GT1}">
          <div class="fm-tbl__label">사유/비고</div>
          <div class="fm-tbl__value">${esc(r.note)}</div>
        </div>` : ''}
      </div>
      <div style="margin-top:14px;">
        <div style="font-weight:var(--fw-semibold);margin-bottom:6px;">결재 내역</div>
        <div class="att-doc-aprs">${aprHTML(r)}</div>
      </div>
    `;
  }

  /* 화환 신청서 폼 (별도 전자결재 문서 — 화환 발송) */
  function wreathFormHTML(r) {
    const st = STATUSES[r.status] || { label: r.status, tone: 'muted' };
    const wr = wreathMeta(r.kind);
    const reqName = `화환발송요청서.pdf`;
    return `
      <div class="fm-tbl fm-tbl--compact fm-tbl--bordered fm-tbl--form">
        <div class="fm-tbl__row fm-tbl__row--2" style="${GT2}">
          <div class="fm-tbl__label">전자결재 번호</div>
          <div class="fm-tbl__value"><strong>${esc(r.eaNo || '-')}</strong></div>
          <div class="fm-tbl__label">결재 상태</div>
          <div class="fm-tbl__value"><span class="pill pill--${st.tone}">${esc(st.label)}</span></div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--2" style="${GT2}">
          <div class="fm-tbl__label">대상자</div>
          <div class="fm-tbl__value">${esc(r.name)} <span class="t-muted" style="margin-left:4px;">${esc(r.empId)}</span></div>
          <div class="fm-tbl__label">경조 구분</div>
          <div class="fm-tbl__value">${esc(kindLabel(r.kind))}</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--2" style="${GT2}">
          <div class="fm-tbl__label">화환 종류</div>
          <div class="fm-tbl__value"><span class="pill pill--${wr.tone}">${esc(wr.label)}</span></div>
          <div class="fm-tbl__label">발송 예정일</div>
          <div class="fm-tbl__value">${r.occuredAt ? esc(fmtDate(r.occuredAt)) : '-'}</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" style="${GT1}">
          <div class="fm-tbl__label">배송지</div>
          <div class="fm-tbl__value">${esc(r.name)} ${esc(kindLabel(r.kind))} · ${esc(wr.place)}</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" style="${GT1}">
          <div class="fm-tbl__label">리본 문구</div>
          <div class="fm-tbl__value">성원애드피아 임직원 일동</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" style="${GT1}">
          <div class="fm-tbl__label">요청서</div>
          <div class="fm-tbl__value">
            <a href="javascript:;" class="link-code" data-evt-dl="${esc(reqName)}">${esc(reqName)} <span style="font-size:10px;">↓</span></a>
          </div>
        </div>
      </div>
      <div style="margin-top:14px;">
        <div style="font-weight:var(--fw-semibold);margin-bottom:6px;">결재 내역</div>
        <div class="att-doc-aprs">${aprHTML(r)}</div>
      </div>
    `;
  }

  function renderDocBody(r) {
    /* 1 행 = 1 전자결재 문서. 문서 유형에 따라 해당 신청서만 표시. */
    return r.docType === 'wreath' ? wreathFormHTML(r) : eventFormHTML(r);
  }

  /* =========================================================
   *  업무 처리 모달 — 경조 구분별 처리 항목(경조휴가/경조금/화환)
   * ========================================================= */
  const TASK_META = {
    leave:  { label: '경조휴가 등록' },
    pay:    { label: '경조금 지급' },
    wreath: { label: '화환 발송' },
  };

  function openProcModal(recId) {
    const r = getStore().find(x => x.id === recId);
    if (!r || r.status !== 'approved') return;
    const titleEl = document.getElementById('evt-proc-title');
    if (titleEl) titleEl.textContent = `업무 처리 — ${r.name} · ${DOC_LABEL[r.docType] || ''}`;
    const body = document.getElementById('evt-proc-body');
    if (body) body.innerHTML = renderProcBody(r);
    const modal = document.getElementById('modal-evt-proc');
    if (modal && !modal.dataset.bound) {
      modal.dataset.bound = '1';
      modal.addEventListener('click', e => { if (e.target === modal) closeModalEl('modal-evt-proc'); });
      modal.querySelectorAll('[data-modal-close], [data-evt-proc-close]').forEach(b => b.addEventListener('click', () => closeModalEl('modal-evt-proc')));
      modal.addEventListener('click', e => {
        const t = e.target.closest('[data-evt-task]');
        if (t) { toggleTask(t.dataset.evtId, t.dataset.evtTask); return; }
      });
    }
    openModalEl('modal-evt-proc');
  }

  function procTaskRow(r, task) {
    const done = !!(r.proc && r.proc[task]);
    const meta = TASK_META[task];
    const k = kindMeta(r.kind) || {};
    let detail = '';
    if (task === 'leave') {
      detail = `경조휴가 <strong>${k.leaveDays}일</strong> · 발생일(${esc(fmtDate(r.occuredAt))}) 기준 사용`;
    } else if (task === 'pay') {
      const rate = payRateOf(r.empType);
      const pay = Math.round((k.amount || 0) * rate);
      detail = `경조금 <strong>${won(pay)}원</strong> <span class="t-muted" style="font-size:var(--fs-xs);">(${r.empType === 'probation' ? '수습직 70%' : '정규직 100%'} · 기준 ${won(k.amount)}원)</span>`;
    } else if (task === 'wreath') {
      const wr = wreathMeta(r.kind);
      detail = `${esc(wr.label)} · 배송지 ${esc(wr.place)} · 리본 「성원애드피아 임직원 일동」`;
    }
    return `
      <div class="fm-tbl__row fm-tbl__row--1" style="${GT1}">
        <div class="fm-tbl__label">${esc(meta.label)}</div>
        <div class="fm-tbl__value" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <span>${detail}</span>
          <span style="display:inline-flex;align-items:center;gap:8px;">
            <span class="pill pill--${done ? 'success' : 'warning'}" style="font-size:var(--fs-xs);">${done ? '처리완료' : '미처리'}</span>
            <button class="btn btn--xs ${done ? '' : 'btn--primary'}" type="button" data-evt-task="${task}" data-evt-id="${esc(r.id)}">${done ? '완료 취소' : '처리'}</button>
          </span>
        </div>
      </div>`;
  }

  function renderProcBody(r) {
    const handler = r.handler || handlerOf(r.empId);
    const tasks = tasksFor(r);
    const total = tasks.length;
    const done = procDone(r);
    const allDone = total > 0 && done >= total;

    return `
      <div class="fm-tbl fm-tbl--compact fm-tbl--bordered fm-tbl--form">
        <div class="fm-tbl__row fm-tbl__row--2" style="${GT2}">
          <div class="fm-tbl__label">처리번호</div>
          <div class="fm-tbl__value"><strong>${esc(r.procNo || '-')}</strong></div>
          <div class="fm-tbl__label">처리 현황</div>
          <div class="fm-tbl__value"><span class="pill pill--${allDone ? 'success' : done ? 'info' : 'muted'}" style="font-size:var(--fs-xs);">${allDone ? '처리완료' : done + '/' + total}</span></div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--2" style="${GT2}">
          <div class="fm-tbl__label">대상자</div>
          <div class="fm-tbl__value">${esc(r.name)} <span class="t-muted" style="margin-left:4px;">${esc(r.empId)}</span></div>
          <div class="fm-tbl__label">처리 담당자</div>
          <div class="fm-tbl__value">${esc(handler.name)} <span class="t-muted" style="font-size:var(--fs-xs);">인사총무팀</span></div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--2" style="${GT2}">
          <div class="fm-tbl__label">경조 내용</div>
          <div class="fm-tbl__value">${esc(kindLabel(r.kind))} <span class="t-muted" style="font-size:var(--fs-xs);">(${esc(DOC_LABEL[r.docType] || '')} ${esc(r.eaNo)})</span></div>
          <div class="fm-tbl__label">발생일</div>
          <div class="fm-tbl__value">${r.occuredAt ? esc(fmtDate(r.occuredAt)) : '-'}</div>
        </div>
      </div>

      <div style="margin-top:14px;">
        <div style="font-weight:var(--fw-semibold);margin-bottom:6px;">처리 항목</div>
        <div class="fm-tbl fm-tbl--compact fm-tbl--bordered fm-tbl--form" data-evt-tasks>
          ${tasks.map(t => procTaskRow(r, t)).join('')}
        </div>
        <div class="form-help" style="margin-top:8px;">경조금은 수습직 70% · 정규직 100% 지급. 경조휴가는 경조 발생일 기준 사용(발생일이 휴일이면 휴가일수 포함, 배우자 출산 제외).</div>
      </div>
    `;
  }

  function toggleTask(recId, task) {
    const r = getStore().find(x => x.id === recId);
    if (!r) return;
    if (!r.proc) r.proc = {};
    r.proc[task] = !r.proc[task];
    /* 모든 처리 항목 완료 시 처리일 기록(=처리완료), 아니면 해제 */
    const ts = tasksFor(r);
    r.processedAt = (ts.length && ts.every(t => r.proc[t])) ? TODAY : '';
    const body = document.getElementById('evt-proc-body');
    if (body) body.innerHTML = renderProcBody(r);
    const pageEl = document.getElementById('page-att-event');
    if (pageEl) refreshTable(pageEl);
    const meta = TASK_META[task];
    window.toast && window.toast(`${meta.label} ${r.proc[task] ? '처리 완료' : '처리 취소'}`, r.proc[task] ? 'success' : 'info');
  }

  /* =========================================================
   *  Page Init
   * ========================================================= */
  function initPage() {
    const pageEl = document.getElementById('page-att-event');
    if (!pageEl) return;
    pageEl.__onShow = () => { render(pageEl); };
  }
  const prev = App.initPages;
  App.initPages = function () {
    if (typeof prev === 'function') prev();
    initPage();
  };
})();
