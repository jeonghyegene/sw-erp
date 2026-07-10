/* =========================================================
 * Page: 근태 관리 > 연차 현황
 *
 *   기존 「근태 현황」 화면의 [신청 현황] 모달에 통합되어 있던 연차 현황을
 *   별도 메뉴/페이지로 분리. 전체 / 임직원별 / 부서별 3개 뷰.
 *
 *   - KPI: 발생/사용/잔여/사용률
 *   - 전체: 전직원 연차 그리드
 *   - 임직원별: 좌측 임직원 리스트 + 우측 본인 발생/사용 이력
 *   - 부서별: 부서별 합계 + 부서원 그리드
 *
 *   ※ Mock — App.AttStatus.EMP_LIST 를 기반으로 결정적(deterministic) 시드.
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  /* 표시 전용 — ISO(YYYY-MM-DD) → YY/MM/DD (원본 데이터/비교 키는 변경하지 않음) */
  function fmtYMD(s) {
    return (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s))
      ? s.slice(2, 4) + '/' + s.slice(5, 7) + '/' + s.slice(8, 10) : (s == null ? '' : s);
  }
  function nowHMS() {
    const d = new Date();
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  }

  const STATE = {
    selectedDeptId: 'C0',      /* 임직원 관리와 동일 부서 id ('C0'=전체) */
    targetEmp: null,
    targetDept: null,
    leave: null,               /* lazy: { byEmp: [...], byDept: [...] } */
    lastRefreshAt: null,
    year: 2026,
    /* 통계(KPI) 패널 접힘 상태 — 「근태 현황」 과 동일한 접기/펼치기 UX */
    statOpen: true,
    /* 부서 선택 시 뷰 — 'cal'(캘린더형) | 'dash'(대시보드형). 대시보드형은 구성원별 발생/사용/잔여. */
    viewMode: 'cal',
    /* 캘린더형 — 월별 전환 (팀원 각자의 연차/외근 사용을 한 달 단위로 조회) */
    calYm: '2026-05',
    /* 권한 — true: 관리자(캘린더/대시보드 모두) / false: 팀원(캘린더형만) */
    isManager: true,
    /* 직원별 연차 현황 모달 — 나의 연차현황 미러(연차 현황/신청 내역 탭 + 캘린더/대시보드) */
    modalEmpId: null,
    modalTab:  'status',   /* 'status'(연차 현황) | 'apps'(신청 내역) */
    modalView: 'cal',      /* 'cal' | 'dash' */
    modalCalYm: '2026-05',
  };
  const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];
  function daysInMonth(ym) { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); }
  function dowOfDate(ym, d) { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, d).getDay(); }
  function shiftMonth(ym, delta) {
    const [y, m] = ym.split('-').map(Number);
    let nm = m + delta, ny = y;
    while (nm <= 0) { nm += 12; ny -= 1; }
    while (nm > 12) { nm -= 12; ny += 1; }
    return `${ny}-${pad2(nm)}`;
  }

  function ensureDeps() { return App.AttStatus && App.AttStatus.EMP_LIST; }
  function HRI() { return window.App && (App.AttOrg || App.HRInfoMgmt); }
  /* 조직도 선택 부서(자손 포함) 의 byEmp 행만 */
  function selectedRows() {
    const { byEmp } = getLeave();
    const h = HRI();
    if (!h || !h.empsInDept || STATE.selectedDeptId === 'C0') return byEmp.slice();
    const allow = new Set(h.empsInDept(byEmp.map(r => r.emp), STATE.selectedDeptId).map(e => e.id));
    return byEmp.filter(r => allow.has(r.emp.id));
  }
  function selectedScopeName() {
    if (STATE.selectedDeptId === 'C0') return '성원애드피아 전체';
    const h = HRI();
    return (h && h.deptName && h.deptName(STATE.selectedDeptId)) || STATE.selectedDeptId;
  }

  /* ============ Mock 연차 계산 (결정적) ============ */
  function buildLeave() {
    const A = App.AttStatus;
    const byEmp = A.EMP_LIST.map((e, i) => {
      const tail = Number(String(e.id).slice(-2)) || (i + 1);
      const carry   = tail % 5;                /* 이월 잔여 0~4 */
      const granted = 15 + (tail % 6);        /* 당해 발생 15~20 */
      const used    = (tail * 3) % (granted + 1);
      const halfUsed = ((tail * 2) % 4) / 2;  /* 0, 0.5, 1, 1.5 */
      return {
        emp: e,
        carry,
        granted,
        used: Number((used + halfUsed).toFixed(1)),
        get total() { return Number((this.carry + this.granted).toFixed(1)); },        /* 총 연차 = 이월 + 당해 */
        get remain() { return Number((this.total - this.used).toFixed(1)); },          /* 잔여 = 총 - 사용 */
        get rate() { return this.total > 0 ? Math.round(this.used / this.total * 100) : 0; },
      };
    });
    const deptSet = new Set();
    byEmp.forEach(r => deptSet.add(r.emp.dept));
    const byDept = Array.from(deptSet).map(d => {
      const rows = byEmp.filter(r => r.emp.dept === d);
      const c = rows.reduce((a, x) => a + x.carry, 0);
      const g = rows.reduce((a, x) => a + x.granted, 0);
      const t = Number((c + g).toFixed(1));
      const u = Number(rows.reduce((a, x) => a + x.used, 0).toFixed(1));
      const r = Number((t - u).toFixed(1));
      return { dept: d, count: rows.length, carry: c, granted: g, total: t, used: u, remain: r, rate: t > 0 ? Math.round(u / t * 100) : 0 };
    });
    return { byEmp, byDept };
  }
  function getLeave() {
    if (!STATE.leave) STATE.leave = buildLeave();
    return STATE.leave;
  }

  /* 결정적 이력 mock — 임직원 1인당 5건 */
  function buildHistory(emp) {
    const tail = Number(String(emp.id).slice(-2)) || 1;
    const types = ['연차', '연차', '반차(오전)', '반차(오후)', '연차'];
    const reasons = ['휴식', '가족 행사', '병원 진료', '개인 사정', '여행'];
    const out = [];
    for (let i = 0; i < 5; i++) {
      const m = ((tail + i) % 6) + 1;
      const d = ((tail * (i + 2)) % 27) + 1;
      out.push({
        type: types[i],
        date: `${STATE.year}-${pad2(m)}-${pad2(d)}`,
        days: types[i].startsWith('반차') ? 0.5 : 1,
        reason: reasons[i],
        status: '승인',
      });
    }
    return out;
  }

  /* 결정적 외근/출장/교육 mock — 캘린더형에서 연차와 함께 노출. 임직원 1인당 3건 */
  function buildFieldwork(emp) {
    const tail = Number(String(emp.id).slice(-2)) || 1;
    const kinds = ['출장', '외근', '교육'];
    const reasons = ['대외 미팅', '현장 점검', '사외 교육', '시장 조사', '거래처 방문'];
    const out = [];
    for (let i = 0; i < 3; i++) {
      const m = ((tail + i * 2) % 6) + 1;
      const d = ((tail * (i + 3)) % 26) + 2;
      out.push({
        type: kinds[(tail + i) % kinds.length],
        date: `${STATE.year}-${pad2(m)}-${pad2(d)}`,
        reason: reasons[(tail + i) % reasons.length],
      });
    }
    return out;
  }

  /* 캘린더형 이벤트 — 선택 부서 구성원의 연차/반차 + 외근/출장/교육 을 일자별로 묶는다.
     반환: { 'YYYY-MM-DD': [ { name, label, cls, reason } ] } (선택 월만) */
  const CAL_CHIP = {
    '연차':      { cls: 'leave', label: '휴가: 연차' },
    '반차(오전)': { cls: 'half',  label: '휴가: 오전 반차' },
    '반차(오후)': { cls: 'half',  label: '휴가: 오후 반차' },
    '출장':      { cls: 'trip',  label: '출장' },
    '외근':      { cls: 'field', label: '외근' },
    '교육':      { cls: 'edu',   label: '교육' },
  };
  function buildCalEvents(members, ym) {
    const map = {};
    const push = (date, ev) => { if (!date.startsWith(ym)) return; (map[date] = map[date] || []).push(ev); };
    members.forEach(r => {
      const emp = r.emp;
      buildHistory(emp).forEach(h => {
        const meta = CAL_CHIP[h.type] || { cls: 'leave', label: `휴가: ${h.type}` };
        push(h.date, { name: emp.name, label: meta.label, cls: meta.cls, reason: h.reason });
      });
      buildFieldwork(emp).forEach(f => {
        const meta = CAL_CHIP[f.type] || { cls: 'field', label: f.type };
        push(f.date, { name: emp.name, label: meta.label, cls: meta.cls, reason: f.reason });
      });
    });
    return map;
  }

  /* ============ Header ============ */
  function renderHead() {
    const scopeName = selectedScopeName();
    const cnt = selectedRows().length;
    /* 팀원 — 「연차 계획」 상단 타이틀과 동일하게: 연월 + 월 이동 + 스코프 칩.
       (팀원은 항상 캘린더형이므로 월 이동을 타이틀에 둔다) */
    const isDept = STATE.selectedDeptId && STATE.selectedDeptId !== 'C0';
    const mode = STATE.viewMode;
    const chipHTML = `
          <div class="att-target-chip" style="cursor:default;">
            <span class="att-target-chip__name">${esc(scopeName)}</span>
            <span class="att-target-chip__meta">${cnt}명</span>
          </div>`;
    /* 월 이동 ‹오늘› — 캘린더로 과거 연차현황을 조회. 부서 선택(또는 팀원) 시 노출 */
    const monthNav = `
          ${App.YmPicker.html({ name: 'cal', ym: STATE.calYm, todayYm: App.AttStatus.TODAY.slice(0, 7) })}
          <div class="att-tb__nav">
            <button type="button" data-lv-cal-prev aria-label="이전">‹</button>
            <button type="button" data-lv-cal-today>오늘</button>
            <button type="button" data-lv-cal-next aria-label="다음">›</button>
          </div>`;
    /* 캘린더 | 대시보드 토글 — 부서 선택 시에만. 성원애드피아(전사)는 대시보드 고정(토글 없음) */
    const viewsHTML = `
          <div class="att-tb__views">
            <button type="button" data-lv-view="cal"  class="${mode === 'cal'  ? 'is-active' : ''}">캘린더</button>
            <button type="button" data-lv-view="dash" class="${mode === 'dash' ? 'is-active' : ''}">대시보드</button>
          </div>`;
    /* 전사(C0) — 연 단위 과거 탐색: 연도 + ‹오늘› 연도 이동 (대시보드 고정, 토글 없음) */
    const yearNav = `
          <div class="att-tb__title">${STATE.year}년</div>
          <div class="att-tb__nav">
            <button type="button" data-lv-year-prev aria-label="이전 연도">‹</button>
            <button type="button" data-lv-year-today>오늘</button>
            <button type="button" data-lv-year-next aria-label="다음 연도">›</button>
          </div>`;
    const leftHTML = !STATE.isManager
      ? `${monthNav}${chipHTML}`
      : isDept
        ? `${monthNav}${viewsHTML}${chipHTML}`
        : `${yearNav}${chipHTML}`;
    return `
      <div class="att-tb">
        <div class="att-tb__left">${leftHTML}</div>
      </div>
    `;
  }

  /* ============ KPI — 「근태 현황」 통계 패널과 동일 톤(흰 카드 4열 그리드 + 접기/펼치기) ============ */
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
  function renderKpi(rows) {
    const c = rows.reduce((a, x) => a + x.carry, 0);
    const g = rows.reduce((a, x) => a + x.granted, 0);
    const t = Number((c + g).toFixed(1));
    const u = Number(rows.reduce((a, x) => a + x.used, 0).toFixed(1));
    const r = Number((t - u).toFixed(1));
    const rate = t > 0 ? Math.round(u / t * 100) : 0;
    const items = [
      { label: '대상 인원',     value: `${rows.length}${_kpiUnit('명')}`, color: 'var(--color-brand-primary)' },
      { label: '총 이월 잔여',  value: `${c}${_kpiUnit('일')}`,           color: 'var(--color-info)' },
      { label: '총 당해 발생',  value: `${g}${_kpiUnit('일')}`,           color: 'var(--color-brand-primary)' },
      { label: '총 연차',       value: `${t}${_kpiUnit('일')}`,           color: 'var(--color-brand-primary)' },
      { label: '총 사용 연차',  value: `${u}${_kpiUnit('일')}`,           color: 'var(--color-warning)' },
      { label: '총 잔여 연차',  value: `${r}${_kpiUnit('일')}`,           color: 'var(--color-success)' },
      { label: '평균 사용률',   value: `${rate}${_kpiUnit('%')}`,         color: 'var(--color-text)' },
    ];
    const open = STATE.statOpen;
    const arrowSvg = open
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
    return `
      <div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);margin-bottom:14px;overflow:hidden;">
        <button type="button" data-lv-stat-toggle
          style="width:100%;display:flex;align-items:center;gap:8px;padding:10px 16px;border:0;background:transparent;cursor:pointer;text-align:left;border-bottom:${open ? '1px solid var(--color-divider)' : '0'};">
          <strong style="font-size:var(--fs-sm);color:var(--color-text);">연차 통계</strong>
          <span style="flex:1;"></span>
          <span style="display:inline-flex;align-items:center;gap:4px;color:var(--color-text-muted);font-size:var(--fs-xs);">
            ${open ? '접기' : '펼치기'} ${arrowSvg}
          </span>
        </button>
        <div style="padding:14px 16px;${open ? '' : 'display:none;'}">
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;">
            ${items.map(it => kpiCard(it.label, it.value, it.color)).join('')}
          </div>
        </div>
      </div>
    `;
  }

  /* ============ Views ============ */
  /* 전사(C0) — 근태현황과 동일하게 부서별 요약으로 표시(부서명 클릭 시 해당 부서로 드릴다운) */
  function renderAllView() {
    const { byEmp } = getLeave();
    const deptNames = [];
    byEmp.forEach(r => { if (!deptNames.includes(r.emp.dept)) deptNames.push(r.emp.dept); });
    const byDept = deptNames.map(name => {
      const rs = byEmp.filter(r => r.emp.dept === name);
      const carry   = rs.reduce((a, r) => a + r.carry, 0);
      const granted = rs.reduce((a, r) => a + r.granted, 0);
      const used    = Number(rs.reduce((a, r) => a + r.used, 0).toFixed(1));
      const total   = Number((carry + granted).toFixed(1));
      const remain  = Number((total - used).toFixed(1));
      return { name, count: rs.length, carry, granted, total, used, remain };
    });
    return `
      ${renderKpi(byEmp)}
      <div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden;">
      <div class="toolbar">
        <div class="toolbar__left"><span class="toolbar__count">총 <strong>${byDept.length}</strong>개 부서</span></div>
      </div>
      <div class="grid-wrap">
        <div class="grid-scroll">
        <table class="tbl tbl--hover">
          <thead>
            <tr>
              <th style="min-width:160px;">부서</th>
              <th style="width:64px;text-align:right;">인원</th>
              <th style="width:90px;text-align:right;">이월 잔여</th>
              <th style="width:90px;text-align:right;">당해 발생</th>
              <th style="width:80px;text-align:right;">총 연차</th>
              <th style="width:80px;text-align:right;">사용 연차</th>
              <th style="width:80px;text-align:right;">잔여 연차</th>
            </tr>
          </thead>
          <tbody>
            ${byDept.map(d => `
              <tr>
                <td><a href="#" data-lv-dept-open="${esc(d.name)}" style="color:var(--color-brand-primary);font-weight:var(--fw-medium);">${esc(d.name)}</a></td>
                <td style="text-align:right;">${d.count}</td>
                <td style="text-align:right;color:var(--color-info);">${d.carry}일</td>
                <td style="text-align:right;">${d.granted}일</td>
                <td style="text-align:right;font-weight:var(--fw-semibold);">${d.total}일</td>
                <td style="text-align:right;color:var(--color-warning);">${d.used}일</td>
                <td style="text-align:right;color:var(--color-success);font-weight:var(--fw-semibold);">${d.remain}일</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        </div>
      </div>
      </div>
    `;
  }

  /* 임직원별 — 대상자 변경은 「근태 현황」 과 동일하게 상단 toolbar 칩(변경) → 직원 선택 picker.
     좌측 사이드바 목록 제거, 본문은 선택된 직원의 연차 상세를 전체 폭으로 표시. */
  /* 직원별 연차 상세 — 모달 본문 (연차 현황 / 신청 내역 탭) */
  function renderEmpDetailContent() {
    const empId = STATE.modalEmpId;
    const { byEmp } = getLeave();
    const me = byEmp.find(x => x.emp.id === empId) || byEmp[0];
    const tabs = [['status', '연차 현황'], ['apps', '신청 내역']];
    /* 이름 뱃지는 모달 타이틀로 이동 — 본문 상단은 탭만 노출(상단 여백 축소) */
    const head = `
      <div class="att-scope-tabs" style="margin:-8px -18px 14px;background:transparent;">
        ${tabs.map(([k, l]) => `<button type="button" class="att-scope-tab ${STATE.modalTab === k ? 'is-active' : ''}" data-lv-emp-tab="${k}">${esc(l)}</button>`).join('')}
      </div>
    `;
    return head + (STATE.modalTab === 'apps' ? renderEmpAppsTab(me) : renderEmpStatusTab(me));
  }

  /* 연차 현황 탭 — 나의 연차현황 미러: 캘린더 / 대시보드(KPI + 사용 이력) 토글 */
  function renderEmpStatusTab(me) {
    const A = App.AttStatus;
    const view = STATE.modalView;
    /* 월 이동 ‹오늘› + 연월 + 캘린더/대시보드 토글을 한 줄 좌측 정렬.
       월 이동은 두 뷰 모두 항상 노출 — 대시보드로 전환해도 조회 월(연월)은 유지된다. */
    const toggle = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <span class="att-tb__nav">
          <button type="button" data-lv-emp-cal-prev aria-label="이전 달">‹</button>
          <button type="button" data-lv-emp-cal-today>오늘</button>
          <button type="button" data-lv-emp-cal-next aria-label="다음 달">›</button>
        </span>
        <span class="att-tb__title">${STATE.modalCalYm.slice(2).replace('-', '/')}</span>
        <div class="att-tb__views">
          <button type="button" data-lv-emp-view="cal"  class="${view === 'cal'  ? 'is-active' : ''}">캘린더</button>
          <button type="button" data-lv-emp-view="dash" class="${view === 'dash' ? 'is-active' : ''}">대시보드</button>
        </div>
      </div>
    `;
    if (view === 'cal') return toggle + renderCalView([me], STATE.modalCalYm);

    const history = buildHistory(me.emp);
    const cards = [
      { label: '이월 잔여 연차', value: `${me.carry}${_kpiUnit('일')}`,   color: 'var(--color-info)' },
      { label: '당해 발생 연차', value: `${me.granted}${_kpiUnit('일')}`, color: 'var(--color-brand-primary)' },
      { label: '총 연차',        value: `${me.total}${_kpiUnit('일')}`,   color: 'var(--color-brand-primary)' },
      { label: '사용 연차',      value: `${me.used}${_kpiUnit('일')}`,    color: 'var(--color-warning)' },
      { label: '잔여 연차',      value: `${me.remain}${_kpiUnit('일')}`,  color: 'var(--color-success)' },
    ];
    return toggle + `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-bottom:14px;">
        ${cards.map(c => kpiCard(c.label, c.value, c.color)).join('')}
      </div>
      <div class="table-card">
        <div class="table-card__cap"><strong>사용 이력</strong></div>
        <div class="table-card__body">
        <table class="prs-editor__table prs-editor__table--wide" style="width:100%;">
          <thead>
            <tr>
              <th style="width:120px;">일자</th>
              <th style="width:90px;">구분</th>
              <th style="width:70px;text-align:right;">일수</th>
              <th>사유</th>
              <th style="width:80px;text-align:center;">상태</th>
            </tr>
          </thead>
          <tbody>
            ${history.map(h => `
              <tr>
                <td>${esc(A.fmtDateDow ? A.fmtDateDow(h.date) : h.date)}</td>
                <td>${esc(h.type)}</td>
                <td style="text-align:right;">${h.days}일</td>
                <td>${esc(h.reason)}</td>
                <td style="text-align:center;"><span class="pill pill--success">${esc(h.status)}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        </div>
      </div>
    `;
  }

  /* 신청 내역 탭 — 연차/휴가 신청 목록. 인사팀은 사용일자 도래 전 건을 승인/반려 수정 가능. */
  function renderEmpAppsTab(me) {
    const A = App.AttStatus;
    const codeLabel = A.codeLabel || ((c) => c);
    const ST = A.APP_STATUSES || {};
    const TODAY = A.TODAY;
    const canEdit = A.isHR && A.isHR();
    const ym = STATE.modalCalYm;
    const inMonth = (a) => ((a.dateFrom || '').slice(0, 7) === ym || (a.dateTo || a.dateFrom || '').slice(0, 7) === ym);
    const list = ((A.appsForEmp && A.appsForEmp(me.emp.id)) || []).filter(a => a.kind === 'leave' && inMonth(a));
    list.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
    const n = list.length;
    const rows = n ? list.map((a, i) => {
      const stat = ST[a.status] || { label: a.status, tone: 'muted' };
      const dateCol = a.dateFrom === a.dateTo ? esc(fmtYMD(a.dateFrom)) : `${esc(fmtYMD(a.dateFrom))} ~ ${esc(fmtYMD(a.dateTo))}`;
      /* 사용일자 도래 전(신청 시작일 > 오늘) + 인사팀이면 승인/반려 수정 가능 */
      const beforeUse = (a.dateFrom || '') > TODAY;
      const editable = canEdit && beforeUse;
      const editCell = editable
        ? `<div style="display:inline-flex;gap:4px;">
             <button class="btn btn--xs btn--soft-success" type="button" data-lv-app-edit="${esc(a.id)}" data-lv-app-to="approved">승인</button>
             <button class="btn btn--xs btn--soft-danger" type="button" data-lv-app-edit="${esc(a.id)}" data-lv-app-to="rejected">반려</button>
           </div>`
        : `<span class="t-muted" style="font-size:var(--fs-xs);">${beforeUse ? '' : '사용일자 경과'}</span>`;
      return `
        <tr class="is-clickable" data-lv-app-row="${esc(a.id)}">
          <td style="text-align:right;">${n - i}</td>
          <td>${esc(a.no)}</td>
          <td>${esc(a.codeLabel || codeLabel(a.code))}</td>
          <td style="white-space:nowrap;">${dateCol}</td>
          <td style="word-break:keep-all;overflow-wrap:anywhere;">${esc(a.reason)}</td>
          <td style="text-align:center;"><span class="pill pill--${stat.tone}">${esc(stat.label)}</span></td>
          <td style="word-break:keep-all;overflow-wrap:anywhere;">${a.status === 'rejected' ? esc(a.statusReason || '') : '<span class="t-muted">-</span>'}</td>
          <td style="white-space:nowrap;">${esc(a.submittedAt)}</td>
          <td style="text-align:center;"><button class="btn btn--xs" type="button" data-lv-app-doc="${esc(a.id)}">상세</button></td>
          <td style="text-align:center;">${editCell}</td>
        </tr>`;
    }).join('') : `<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--color-text-muted);">표시할 신청 내역이 없습니다.</td></tr>`;
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="att-tb__nav">
            <button type="button" data-lv-emp-cal-prev aria-label="이전 달">‹</button>
            <button type="button" data-lv-emp-cal-today>오늘</button>
            <button type="button" data-lv-emp-cal-next aria-label="다음 달">›</button>
          </div>
          <div class="att-tb__title" style="font-size:var(--fs-lg);">${ym.slice(2).replace('-', '/')}</div>
        </div>
        <button class="btn btn--sm" type="button" data-lv-modal-apps-dl="${esc(me.emp.id)}" title="신청 내역 다운로드">${(window.Icons && window.Icons.download) || '↓'} 신청내역 다운로드</button>
      </div>
      <div style="overflow:auto;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);">
        <table class="tbl tbl--hover" style="min-width:1380px;table-layout:fixed;">
          <thead>
            <tr>
              <th style="width:48px;text-align:right;">No</th>
              <th style="width:130px;">신청번호</th>
              <th style="width:130px;">종류</th>
              <th style="width:200px;white-space:nowrap;">신청 일자</th>
              <th style="width:220px;">사유</th>
              <th style="width:80px;text-align:center;">상태</th>
              <th style="width:220px;">상태 사유</th>
              <th style="width:150px;white-space:nowrap;">상신 일시</th>
              <th style="width:56px;text-align:center;"></th>
              <th style="width:116px;text-align:center;">상태 수정</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function ensureLvModal() {
    if (document.getElementById('lv-modal')) return;
    const html = `
<div class="modal-backdrop" id="lv-modal" data-modal-id="lv-modal" style="z-index:1200;">
  <div class="modal modal--lg" style="width:90vw;max-width:880px;height:82vh;max-height:820px;display:flex;flex-direction:column;">
    <div class="modal__header">
      <div class="modal__title" data-lv-modal-title>직원별 연차 현황</div>
      <button class="modal__close" type="button" data-lv-modal-close aria-label="닫기">✕</button>
    </div>
    <div class="modal__body" data-lv-modal-body style="flex:1;min-height:0;overflow:auto;background:var(--color-surface-alt);padding:18px;"></div>
  </div>
</div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    const modal = document.getElementById('lv-modal');
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-lv-modal-close]')) {
        modal.classList.remove('is-open');
        if (!document.querySelector('.modal-backdrop.is-open')) document.body.style.overflow = '';
        return;
      }
      /* 탭 전환 (연차 현황 / 신청 내역) */
      const tab = e.target.closest('[data-lv-emp-tab]');
      if (tab) { STATE.modalTab = tab.dataset.lvEmpTab; rerenderEmpModal(); return; }
      /* 캘린더/대시보드 토글 */
      const view = e.target.closest('[data-lv-emp-view]');
      if (view) { STATE.modalView = view.dataset.lvEmpView; rerenderEmpModal(); return; }
      /* 캘린더 월 이동 */
      if (e.target.closest('[data-lv-emp-cal-prev]'))  { STATE.modalCalYm = shiftMonth(STATE.modalCalYm, -1); rerenderEmpModal(); return; }
      if (e.target.closest('[data-lv-emp-cal-next]'))  { STATE.modalCalYm = shiftMonth(STATE.modalCalYm, +1); rerenderEmpModal(); return; }
      if (e.target.closest('[data-lv-emp-cal-today]')) { STATE.modalCalYm = '2026-05'; rerenderEmpModal(); return; }
      /* 인사팀 — 승인/반려 수정 → 사유 입력 모달 */
      const edit = e.target.closest('[data-lv-app-edit]');
      if (edit) { e.stopPropagation(); openReasonModal(edit.dataset.lvAppEdit, edit.dataset.lvAppTo); return; }
      /* 신청 내역 탭 — 다운로드(표시 전체) */
      const mApps = e.target.closest('[data-lv-modal-apps-dl]');
      if (mApps) { e.preventDefault(); dlLeaveApps(mApps.dataset.lvModalAppsDl, false); return; }
      /* 신청 상세(품의서) — 버튼 또는 행 클릭 */
      const docBtn = e.target.closest('[data-lv-app-doc]');
      if (docBtn) { e.stopPropagation(); App.AttStatus.openDocModal && App.AttStatus.openDocModal(docBtn.dataset.lvAppDoc); return; }
      const appRow = e.target.closest('[data-lv-app-row]');
      if (appRow && !e.target.closest('button, a, input, select, textarea, label')) {
        const sel = window.getSelection && window.getSelection();
        if (sel && sel.type === 'Range' && String(sel).length > 0) return;
        App.AttStatus.openDocModal && App.AttStatus.openDocModal(appRow.dataset.lvAppRow);
        return;
      }
    });
  }
  function rerenderEmpModal() {
    const modal = document.getElementById('lv-modal');
    if (modal) modal.querySelector('[data-lv-modal-body]').innerHTML = renderEmpDetailContent();
  }
  function openEmpDetailModal(empId) {
    const A = App.AttStatus;
    const emp = A.EMP_LIST.find(e => e.id === empId);
    STATE.modalEmpId = empId;
    STATE.modalTab = 'status';
    STATE.modalView = 'cal';
    STATE.modalCalYm = STATE.calYm || '2026-05';
    ensureLvModal();
    const modal = document.getElementById('lv-modal');
    const meta = emp ? ` (${emp.name}·${emp.id}·${emp.dept}·${emp.rank || '-'}·${emp.position || '-'})` : '';
    modal.querySelector('[data-lv-modal-title]').textContent = `직원별 연차 현황${meta}`;
    modal.querySelector('[data-lv-modal-body]').innerHTML = renderEmpDetailContent();
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  /* ============ 인사팀 상태 수정 — 사유 입력 모달 ============
     승인으로 수정 → '상태 수정 사유 입력' / 반려로 수정 → '반려 사유 입력'.
     사유 작성 후 저장하면 상태·사유가 반영되고, 이후 다시 승인/반려로 재수정 가능. */
  let _reasonTarget = null;   /* { appId, status } */
  function ensureReasonModal() {
    if (document.getElementById('lv-reason-modal')) return;
    const html = `
<div class="modal-backdrop" id="lv-reason-modal" data-modal-id="lv-reason-modal" style="z-index:1300;">
  <div class="modal" style="width:90vw;max-width:460px;display:flex;flex-direction:column;">
    <div class="modal__header">
      <div class="modal__title" data-lvr-title>상태 수정 사유 입력</div>
      <button class="modal__close" type="button" data-lvr-close aria-label="닫기">✕</button>
    </div>
    <div class="modal__body" style="padding:18px;">
      <div class="fm-tbl__row fm-tbl__row--1">
        <div class="fm-tbl__label" data-lvr-label>사유 <em style="color:var(--color-danger);">*</em></div>
        <div class="fm-tbl__value">
          <input class="input" type="text" data-lvr-input maxlength="100" placeholder="사유를 한 줄로 입력해 주세요">
        </div>
      </div>
    </div>
    <div class="offcanvas__footer offcanvas__footer--between" style="padding:14px 18px;">
      <span class="t-muted" style="font-size:var(--fs-xs);" data-lvr-hint></span>
      <span style="display:inline-flex;gap:8px;">
        <button class="btn btn--sm" type="button" data-lvr-close>취소</button>
        <button class="btn btn--sm btn--primary" type="button" data-lvr-save>저장</button>
      </span>
    </div>
  </div>
</div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    const modal = document.getElementById('lv-reason-modal');
    const close = () => { modal.classList.remove('is-open'); if (!document.querySelector('.modal-backdrop.is-open')) document.body.style.overflow = ''; };
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-lvr-close]')) { close(); return; }
      if (e.target.closest('[data-lvr-save]')) {
        const input = modal.querySelector('[data-lvr-input]');
        const reason = (input.value || '').trim();
        if (!reason) { App.Forms ? App.Forms.setFieldError(input, '사유를 입력해 주세요') : input.classList.add('is-invalid'); return; }
        if (_reasonTarget) {
          App.AttStatus.setAppStatus(_reasonTarget.appId, _reasonTarget.status, reason);
          rerenderEmpModal();
          const label = _reasonTarget.status === 'approved' ? '승인' : '반려';
          window.toast && window.toast(`신청을 ${label} 처리했습니다.`, 'success');
        }
        close();
      }
    });
    if (App.Forms && App.Forms.applyOnInput) App.Forms.applyOnInput(modal);
  }
  function openReasonModal(appId, status) {
    ensureReasonModal();
    _reasonTarget = { appId, status };
    const modal = document.getElementById('lv-reason-modal');
    const isApprove = status === 'approved';
    modal.querySelector('[data-lvr-title]').textContent = isApprove ? '상태 수정 사유 입력' : '반려 사유 입력';
    modal.querySelector('[data-lvr-hint]').textContent = isApprove ? '승인으로 수정합니다.' : '반려로 수정합니다.';
    const input = modal.querySelector('[data-lvr-input]');
    /* 기존 사유가 있으면 미리 채워 재수정 편의 제공 */
    const app = (App.AttStatus.appsForEmp(STATE.modalEmpId) || []).find(a => a.id === appId);
    input.value = (app && app.statusReason) || '';
    if (App.Forms && App.Forms.clearAll) App.Forms.clearAll(modal);
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => input.focus(), 0);
  }

  /* 직원 1명의 연차 신청내역 CSV 다운로드. approvedOnly=true 시 '승인'건만. */
  function dlLeaveApps(empId, approvedOnly) {
    const A = App.AttStatus || {};
    const ST = A.APP_STATUSES || {};
    const cl = A.codeLabel || ((c) => c);
    const emp = (A.EMP_LIST || []).find(e => e.id === empId) || {};
    let list = ((A.appsForEmp && A.appsForEmp(empId)) || []).filter(a => a.kind === 'leave');
    if (approvedOnly) list = list.filter(a => a.status === 'approved');
    list.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
    if (!list.length) { window.toast && window.toast('다운로드할 신청 내역이 없습니다.', 'warning'); return; }
    const head = ['신청번호', '종류', '신청 일자', '사유', '상태', '상태 사유', '상신 일시'];
    const body = list.map(a => {
      const dateCol = a.dateFrom === a.dateTo ? a.dateFrom : `${a.dateFrom} ~ ${a.dateTo}`;
      const stat = (ST[a.status] || {}).label || a.status;
      const statReason = a.status === 'rejected' ? (a.statusReason || '') : '';
      return [a.no, a.codeLabel || cl(a.code), dateCol, a.reason || '', stat, statReason, a.submittedAt || ''];
    });
    const tag = approvedOnly ? '_승인' : '';
    const fn = `연차신청내역${tag}_${emp.dept || ''}_${emp.name || empId}.csv`;
    App.csvDownload(fn, [head].concat(body), { context: '연차 신청내역' });
  }

  function renderDeptView() {
    const members = selectedRows();
    const dlIcon = (window.Icons && window.Icons.download) || '↓';
    return `
      <div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden;">
        <div class="toolbar">
          <div class="toolbar__left"><span class="toolbar__count">총 <strong>${members.length}</strong>명</span></div>
        </div>
        <div class="grid-wrap">
          <div class="grid-scroll">
            <table class="tbl tbl--hover">
              <thead>
                <tr>
                  <th style="width:100px;">사번</th>
                  <th style="width:160px;">성명</th>
                  <th style="width:70px;">직책</th>
                  <th style="width:90px;text-align:right;">이월 잔여</th>
                  <th style="width:90px;text-align:right;">당해 발생</th>
                  <th style="width:80px;text-align:right;">총 연차</th>
                  <th style="width:80px;text-align:right;">사용 연차</th>
                  <th style="width:80px;text-align:right;">잔여 연차</th>
                  <th style="width:160px;text-align:center;">다운로드</th>
                </tr>
              </thead>
              <tbody>
                ${members.map(r => `
                  <tr>
                    <td>${esc(r.emp.id)}</td>
                    <td>
                      <div data-lv-emp-open="${esc(r.emp.id)}" style="display:flex;align-items:center;gap:8px;min-width:0;cursor:pointer;">
                        <span class="ssw-tbl__ava" style="width:24px;height:24px;flex:0 0 auto;">${esc((r.emp.name || '').slice(0, 1))}</span>
                        <span style="font-weight:var(--fw-medium);white-space:nowrap;color:var(--color-brand-primary);">${esc(r.emp.name)}</span>
                        ${(r.emp.dept || r.emp.rank) ? `<span style="display:inline-flex;align-items:center;">${r.emp.dept ? `<span style="color:var(--color-text-muted);font-size:var(--fs-xs);white-space:nowrap;">${esc(r.emp.dept)}</span>` : ''}${(r.emp.dept && r.emp.rank) ? `<span style="color:var(--color-text-muted);font-size:var(--fs-xs);padding:0 3px;">·</span>` : ''}${r.emp.rank ? `<span style="color:var(--color-text-muted);font-size:var(--fs-xs);white-space:nowrap;">${esc(r.emp.rank)}</span>` : ''}</span>` : ''}
                      </div>
                    </td>
                    <td style="white-space:nowrap;">${esc(r.emp.position || '-')}</td>
                    <td style="text-align:right;color:var(--color-info);">${r.carry}일</td>
                    <td style="text-align:right;">${r.granted}일</td>
                    <td style="text-align:right;font-weight:var(--fw-semibold);">${r.total}일</td>
                    <td style="text-align:right;color:var(--color-warning);">${r.used}일</td>
                    <td style="text-align:right;color:var(--color-success);font-weight:var(--fw-semibold);">${r.remain}일</td>
                    <td style="text-align:center;white-space:nowrap;">
                      <button class="btn btn--xs" type="button" data-lv-emp-apps-dl="${esc(r.emp.id)}" title="${esc(r.emp.name)} 연차 신청내역(승인건) 다운로드">${dlIcon} 연차 신청내역</button>
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

  /* ============ 캘린더형 — 팀원별 연차/외근을 월별로 ============ */
  /* 범례 — 근무스케줄 현황 범례와 동일하게 화면 하단 고정 바(.shift-grid-legend) 로 표시 */
  function calLegend() {
    const items = [
      ['leave', '휴가(연차)'], ['half', '휴가(반차)'], ['trip', '출장'], ['field', '외근'], ['edu', '교육'],
    ];
    return `
      <div class="shift-grid-legend">
        <strong>범례</strong>
        ${items.map(([c, l]) => `<span class="shift-grid-legend__item"><span class="lv-cal__chip lv-cal__chip--${c}">${esc(l)}</span></span>`).join('')}
      </div>
    `;
  }
  function renderCalView(members, ymArg) {
    const ym = ymArg || STATE.calYm;
    const events = buildCalEvents(members, ym);
    const [y, m] = ym.split('-').map(Number);
    const days = daysInMonth(ym);
    const leadBlanks = new Date(y, m - 1, 1).getDay();
    const cells = [];
    for (let i = 0; i < leadBlanks; i++) cells.push(`<div class="att-cal__cell att-cal__cell--blank"></div>`);
    for (let d = 1; d <= days; d++) {
      const dateStr = `${ym}-${pad2(d)}`;
      const wd = dowOfDate(ym, d);
      const wdCls = wd === 0 ? 'is-sun' : wd === 6 ? 'is-sat' : '';
      const evs = events[dateStr] || [];
      const chips = evs.map(ev => `
        <div class="lv-cal__chip lv-cal__chip--${ev.cls}" title="${esc(ev.name + ' · ' + ev.label + (ev.reason ? ' · ' + ev.reason : ''))}">
          <span class="lv-cal__chip-name">${esc(ev.name)}</span> ${esc(ev.label)}
        </div>`).join('');
      cells.push(`
        <div class="att-cal__cell ${wdCls}">
          <div class="att-cal__day-row">
            <span class="att-cal__day">${d}</span>
            ${evs.length ? `<span class="lv-cal__count">${evs.length}</span>` : ''}
          </div>
          <div class="lv-cal__chips">${chips}</div>
        </div>`);
    }
    const total = leadBlanks + days;
    const trail = (7 - (total % 7)) % 7;
    for (let i = 0; i < trail; i++) cells.push(`<div class="att-cal__cell att-cal__cell--blank"></div>`);
    return `
      <div class="att-cal">
        <div class="att-cal__weekdays">
          ${DOW_KO.map((w, i) => `<div class="att-cal__wd ${i === 0 ? 'is-sun' : ''} ${i === 6 ? 'is-sat' : ''}">${w}</div>`).join('')}
        </div>
        <div class="att-cal__grid">${cells.join('')}</div>
      </div>
    `;
  }

  /* 부서 선택 시 — 뷰 토글(캘린더/대시보드) + 본문. 팀원 권한은 캘린더형만.
     상단 바는 우측 정렬 한 줄: (캘린더형일 때) 월 이동 ‹오늘› + 연월 / (관리자) 뷰 토글.
     스코프 명·인원수는 헤더 칩에서 이미 표기하므로 중복 노출하지 않는다. */
  function renderDeptScope() {
    const members = selectedRows();
    /* 월 이동·뷰 토글은 상단 헤더(renderHead)로 이동. 본문은 뷰 내용만 렌더.
       캘린더 = 달력 / 대시보드 = 연차 통계 카드 + 인원별 요약 테이블 */
    const mode = STATE.isManager ? STATE.viewMode : 'cal';
    if (mode === 'cal') return renderCalView(members);
    return `${renderKpi(members)}${renderDeptView()}`;
  }
  /* 캘린더형 + 부서 스코프일 때만 하단 고정 범례를 노출 */
  function legendVisible() {
    const isDeptScope = (!STATE.isManager || (STATE.selectedDeptId && STATE.selectedDeptId !== 'C0'));
    const mode = STATE.isManager ? STATE.viewMode : 'cal';
    return isDeptScope && mode === 'cal';
  }

  function renderBody() {
    /* 부서 선택 또는 팀원 권한 → 스코프 뷰(캘린더/대시보드). 전사(C0) + 관리자 → 전체 그리드 */
    if (!STATE.isManager || (STATE.selectedDeptId && STATE.selectedDeptId !== 'C0')) return renderDeptScope();
    return renderAllView();
  }

  /* 레이아웃 — 관리자: 좌측 조직도 + 우측 본문 / 팀원: 조직도 없이 본문만.
     범례는 본문 스크롤 영역 밖(하단)에 고정 슬롯으로 둔다(캘린더형일 때만 채움). */
  function layoutHTML() {
    const right = `
      <section class="split__right">
        <header class="att-page__head" data-lv-head></header>
        <div class="att-page__body" data-lv-body style="flex:1;min-height:0;overflow:auto;"></div>
        <div data-lv-legend></div>
      </section>`;
    if (STATE.isManager) {
      return `
        <div class="split" style="--split-left:240px;height:100%;">
          <aside class="split__left">
            <div class="split__head"><h3>조직도</h3></div>
            <div class="split__body" style="padding:0;display:flex;flex-direction:column;min-height:0;">
              <ul class="tree tree--selectable" data-lv-tree style="flex:1;overflow:auto;padding:8px 10px;margin:0;"></ul>
            </div>
          </aside>
          ${right}
        </div>`;
    }
    /* 팀원 — 조직도(좌측 트리) 숨김 */
    return `<div style="display:flex;flex-direction:column;height:100%;min-height:0;">${right}</div>`;
  }
  function renderShell(pageEl) {
    pageEl.innerHTML = `<div data-lv-root style="height:100%;min-height:0;"></div>`;
    ensureFloatingToggle(pageEl);
  }

  /* ============ 권한 토글 — 우측 하단 floating (관리자/팀원) ============
     팀원 권한은 캘린더형만 볼 수 있다. 토글로 권한 시점을 전환해 확인한다. */
  function ensureFloatingToggle(pageEl) {
    if (pageEl.querySelector('[data-lv-perm-fab]')) return;
    const fab = document.createElement('div');
    fab.setAttribute('data-lv-perm-fab', '');
    fab.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:900;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-pill);box-shadow:var(--shadow-md);padding:6px 10px;display:flex;align-items:center;gap:8px;';
    fab.innerHTML = `
      <span style="font-size:var(--fs-xs);color:var(--color-text-muted);">권한</span>
      <button type="button" class="btn btn--xs" data-lv-perm="manager">관리자</button>
      <button type="button" class="btn btn--xs" data-lv-perm="member">팀원</button>`;
    pageEl.appendChild(fab);
  }
  function updateFloatingToggle(pageEl) {
    pageEl.querySelectorAll('[data-lv-perm]').forEach(b => {
      const on = (b.dataset.lvPerm === 'manager') === STATE.isManager;
      b.classList.toggle('btn--primary', on);
    });
  }

  function renderAll(pageEl) {
    const root = pageEl.querySelector('[data-lv-root]');
    if (root) root.innerHTML = layoutHTML();
    const tree = pageEl.querySelector('[data-lv-tree]');
    const h = HRI();
    if (tree && h && h.deptTreeHTML) {
      tree.innerHTML = h.deptTreeHTML(STATE.selectedDeptId, { emps: App.AttStatus.EMP_LIST });
    }
    pageEl.querySelector('[data-lv-head]').innerHTML = renderHead();
    pageEl.querySelector('[data-lv-body]').innerHTML = renderBody();
    const legendSlot = pageEl.querySelector('[data-lv-legend]');
    if (legendSlot) legendSlot.innerHTML = legendVisible() ? calLegend() : '';
    updateFloatingToggle(pageEl);
  }

  function bind(pageEl) {
    if (pageEl.dataset.lvBound === '1') return;
    pageEl.dataset.lvBound = '1';

    /* 연/월 피커(App.YmPicker) 월 선택 — 부서/팀원 캘린더 뷰 */
    pageEl.addEventListener('ympick:change', e => {
      if (e.detail.name === 'cal') { STATE.calYm = e.detail.ym; renderAll(pageEl); }
    });

    pageEl.addEventListener('click', e => {
      /* 권한 토글 (우측 하단 floating) */
      const perm = e.target.closest('[data-lv-perm]');
      if (perm) {
        const wantManager = perm.dataset.lvPerm === 'manager';
        if (wantManager !== STATE.isManager) {
          STATE.isManager = wantManager;
          /* 팀원 전환 — 캘린더형 고정. 전사(C0) 상태면 첫 부서로 좁혀 본인 부서 시점을 흉내낸다. */
          if (!wantManager) {
            STATE.viewMode = 'cal';
            if (STATE.selectedDeptId === 'C0') {
              const first = (getLeave().byEmp[0] || {}).emp;
              const h = HRI();
              if (first && h && h.deptIdOf) STATE.selectedDeptId = h.deptIdOf(first.dept) || STATE.selectedDeptId;
            }
          }
          renderAll(pageEl);
        }
        return;
      }

      /* 뷰 토글 (캘린더/대시보드) — 관리자만 */
      const view = e.target.closest('[data-lv-view]');
      if (view) { STATE.viewMode = view.dataset.lvView; renderAll(pageEl); return; }

      /* 캘린더형 월 전환 */
      if (e.target.closest('[data-lv-cal-prev]'))  { STATE.calYm = shiftMonth(STATE.calYm, -1); renderAll(pageEl); return; }
      if (e.target.closest('[data-lv-cal-next]'))  { STATE.calYm = shiftMonth(STATE.calYm, +1); renderAll(pageEl); return; }
      if (e.target.closest('[data-lv-cal-today]')) { STATE.calYm = '2026-05'; renderAll(pageEl); return; }

      /* 전사(C0) 연도 이동 — 과거 연차현황 탐색 */
      if (e.target.closest('[data-lv-year-prev]'))  { STATE.year -= 1; renderAll(pageEl); return; }
      if (e.target.closest('[data-lv-year-next]'))  { STATE.year += 1; renderAll(pageEl); return; }
      if (e.target.closest('[data-lv-year-today]')) { STATE.year = 2026; renderAll(pageEl); return; }

      /* 좌측 조직도 — 임직원 관리와 동일 트리. 노드 클릭 시 data-id 로 선택 부서 전환 */
      const treeNode = e.target.closest('.tree__node[data-id]');
      if (treeNode) {
        STATE.selectedDeptId = treeNode.dataset.id;
        STATE.viewMode = 'cal';   /* 부서 선택 시 캘린더 기본 (전사는 대시보드 고정) */
        renderAll(pageEl);
        return;
      }

      /* 부서별 요약(전사 뷰) 부서명 클릭 → 해당 부서로 드릴다운 (캘린더 기본) */
      const deptOpen = e.target.closest('[data-lv-dept-open]');
      if (deptOpen) {
        e.preventDefault();
        const h = HRI();
        STATE.selectedDeptId = (h && h.deptIdOf && h.deptIdOf(deptOpen.dataset.lvDeptOpen)) || STATE.selectedDeptId;
        STATE.viewMode = 'cal';
        renderAll(pageEl);
        return;
      }

      /* 통계 패널 접기/펼치기 */
      if (e.target.closest('[data-lv-stat-toggle]')) { STATE.statOpen = !STATE.statOpen; renderAll(pageEl); return; }

      /* 다운로드 — 직원 연차 신청내역(승인건만) */
      const lvAppsDl = e.target.closest('[data-lv-emp-apps-dl]');
      if (lvAppsDl) { e.preventDefault(); dlLeaveApps(lvAppsDl.dataset.lvEmpAppsDl, true); return; }

      /* 직원 이름 클릭 → 직원별 연차 현황 모달 */
      const emp = e.target.closest('[data-lv-emp-open]');
      if (emp) { e.preventDefault(); openEmpDetailModal(emp.dataset.lvEmpOpen); return; }
    });
  }

  /* 임직원별 — 전자결재 구성원 picker 호출. 선택 시 그 직원의 연차로 전환. (근태 현황과 동일) */
  function openEmpPicker(pageEl) {
    const A = App.AttStatus;
    if (typeof App.openEmpPicker !== 'function') {
      window.toast && window.toast('직원 선택 다이얼로그를 사용할 수 없습니다.', 'warning');
      return;
    }
    App.openEmpPicker({
      action: 'callback',
      multi: false,
      onConfirm(selected) {
        if (selected && selected[0]) {
          const e = selected[0];
          /* picker 가 반환한 직원이 EMP_LIST 에 없으면 동적 추가 후 연차 재계산 (mock 환경) */
          if (!A.EMP_LIST.find(x => x.id === e.id)) {
            A.EMP_LIST.push({ id: e.id, name: e.name, dept: e.dept || '-', shift: 'WTD01' });
            STATE.leave = null;
          }
          STATE.targetEmp = e.id;
          STATE.scope = 'emp';
          renderAll(pageEl);
        }
      },
    });
  }

  function initPage() {
    const pageEl = document.getElementById('page-att-leave');
    if (!pageEl) return;
    pageEl.__onShow = () => {
      if (!ensureDeps()) {
        pageEl.innerHTML = `<div style="padding:24px;color:var(--color-text-muted);">근태 현황 모듈 로드 중...</div>`;
        return;
      }
      /* 임직원 관리 명단과 동기화 — 변경 시 연차 캐시 무효화 */
      if (App.AttStatus.syncEmpList && App.AttStatus.syncEmpList()) STATE.leave = null;
      if (!pageEl.dataset.lvShellMounted) {
        pageEl.dataset.lvShellMounted = '1';
        renderShell(pageEl);
        bind(pageEl);
        STATE.lastRefreshAt = nowHMS();
      }
      renderAll(pageEl);
    };
  }

  const prev = App.initPages;
  App.initPages = function () {
    if (typeof prev === 'function') prev();
    initPage();
  };
})();
