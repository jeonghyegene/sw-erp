/* =========================================================
 * Page: 휴가 관리 > 나의 연차현황 (본인 시점 전용)
 *
 *   「부서별 연차현황」(page-att-leave) 이 권한자(전체/부서/임직원별) 뷰라면,
 *   본 화면은 로그인 사용자(App.AttStatus.ME) 본인의 연차만 보여준다.
 *
 *   - 대시보드: KPI(이월/당해/총/사용/잔여) + 사용 이력
 *   - 캘린더: 본인 연차·반차·외근·출장·교육을 월별로 조회 (부서별 연차현황과 동일 톤)
 *   - 수동 새로고침 (마지막 갱신 시각 표시)
 *
 *   ※ Mock — page-att-leave 와 동일한 결정적(deterministic) 산정 로직을 본인에게 적용.
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  /* 표시 전용 포맷터 — 데이터/비교값은 원본 ISO 유지 */
  function fmtYM(s) { s = String(s || ''); return s.length >= 7 ? s.slice(2, 4) + '/' + s.slice(5, 7) : s; }
  function fmtYMD(s) { s = String(s || ''); return s.length >= 10 ? s.slice(2, 4) + '/' + s.slice(5, 7) + '/' + s.slice(8, 10) : s; }
  function fmtDateTime(s) { s = String(s || ''); if (s.length < 10) return s; const d = s.slice(2, 4) + '/' + s.slice(5, 7) + '/' + s.slice(8, 10); const t = s.slice(11).trim(); return t ? d + '   ' + t : d; }
  function nowHMS() {
    const d = new Date();
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  }
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

  const STATE = {
    year: 2026,
    lastRefreshAt: null,
    leave: null,         /* lazy: { carry, granted, total, used, remain, rate } */
    history: null,       /* lazy */
    level: 'status',     /* Level 1 탭: 'status'(연차 현황) | 'apps'(신청 내역) */
    viewMode: 'cal',     /* 'cal'(캘린더, 기본) | 'dash'(대시보드) — 연차 현황 탭 내부 뷰 */
    calYm: '2026-05',
    appPage: 1,          /* 신청 내역 페이지 */
    appPageSize: 20,     /* 신청 내역 페이지당 건수 */
    appYm: null,         /* 신청 내역 조회 월(YYYY-MM) — 월별 필터 */
  };

  /* Level 1 탭 정의 — 나의 근태현황과 동일 톤(.att-scope-tab) */
  const LEVELS = [
    { key: 'status', label: '연차 현황' },
    { key: 'apps',   label: '신청 내역' },
  ];

  function ensureDeps() { return App.AttStatus && App.AttStatus.ME; }

  /* 로그인 사용자 — EMP_LIST 에 있으면 그 레코드, 없으면 ME 기본값 */
  function meEmp() {
    const A = App.AttStatus;
    return (A.EMP_LIST && A.EMP_LIST.find(e => e.id === A.ME.id)) || A.ME;
  }

  /* ============ Mock 연차 계산 (이월 + 당해 발생 = 총, 총 - 사용 = 잔여) ============ */
  function buildLeave() {
    const carry = 3;                                     /* 이월 잔여 연차 */
    const granted = 15;                                  /* 당해 발생 연차 */
    const total = Number((carry + granted).toFixed(1));  /* 총 연차 */
    const used = 4;                                      /* 사용 연차 */
    const remain = Number((total - used).toFixed(1));    /* 잔여 연차 */
    const rate = total > 0 ? Math.round(used / total * 100) : 0;
    return { carry, granted, total, used, remain, rate };
  }
  function getLeave() {
    if (!STATE.leave) STATE.leave = buildLeave();
    return STATE.leave;
  }

  /* 결정적 사용 이력 mock — 5건 (연차 3 + 반차 2 = 4일, 사용 연차와 일치) */
  function buildHistory() {
    const emp = meEmp();
    const tail = Number(String(emp.id).replace(/\D/g, '').slice(-2)) || 1;
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
    /* 일자 오름차순 정렬 */
    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
  }
  function getHistory() {
    if (!STATE.history) STATE.history = buildHistory();
    return STATE.history;
  }

  /* 결정적 외근/출장/교육 mock — 캘린더형에서 연차와 함께 노출. 3건 */
  function buildFieldwork() {
    const emp = meEmp();
    const tail = Number(String(emp.id).replace(/\D/g, '').slice(-2)) || 1;
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

  /* 캘린더형 이벤트 — 본인 연차/반차 + 외근/출장/교육 을 일자별로 묶는다. */
  const CAL_CHIP = {
    '연차':      { cls: 'leave', label: '연차' },
    '반차(오전)': { cls: 'half',  label: '오전반차' },
    '반차(오후)': { cls: 'half',  label: '오후반차' },
    '출장':      { cls: 'trip',  label: '출장' },
    '외근':      { cls: 'field', label: '외근' },
    '교육':      { cls: 'edu',   label: '교육' },
  };
  function buildCalEvents(ym) {
    const map = {};
    const push = (date, ev) => { if (!date.startsWith(ym)) return; (map[date] = map[date] || []).push(ev); };
    getHistory().forEach(h => {
      const meta = CAL_CHIP[h.type] || { cls: 'leave', label: h.type };
      push(h.date, { label: meta.label, cls: meta.cls, reason: h.reason });
    });
    buildFieldwork().forEach(f => {
      const meta = CAL_CHIP[f.type] || { cls: 'field', label: f.type };
      push(f.date, { label: meta.label, cls: meta.cls, reason: f.reason });
    });
    return map;
  }

  /* ===== Level 1 탭바 — 좌측 큰 탭(연차 현황 / 신청 내역) + 우측 휴가 신청 버튼 ===== */
  function renderTabBar() {
    return `
      <div class="att-tabbar__tabs">
        ${LEVELS.map(l => `
          <button type="button" class="att-scope-tab ${STATE.level === l.key ? 'is-active' : ''}" data-myl-level="${l.key}">${esc(l.label)}</button>
        `).join('')}
      </div>
      <div class="att-page__tabbar-actions">
        <button class="btn btn--primary btn--sm" type="button" data-myl-apply-hol>휴가 신청</button>
      </div>
    `;
  }

  /* ============ Header (연차 현황 탭 전용 toolbar) ============
     좌측: (캘린더) 연월 + 월 이동 ‹오늘› / (대시보드) 타이틀 → 캘린더·대시보드 토글
     우측: 새로고침. 이름 뱃지는 노출하지 않음(본인 화면). */
  function renderHead() {
    const mode = STATE.viewMode;
    const showMonth = mode === 'cal';
    return `
      <div class="att-tb">
        <div class="att-tb__left">
          ${showMonth ? `
            ${App.YmPicker.html({ name: 'cal', ym: STATE.calYm, todayYm: App.AttStatus.TODAY.slice(0, 7) })}
            <div class="att-tb__nav">
              <button type="button" data-myl-cal-prev aria-label="이전 달">‹</button>
              <button type="button" data-myl-cal-today>오늘</button>
              <button type="button" data-myl-cal-next aria-label="다음 달">›</button>
            </div>
          ` : `
            <div class="att-tb__title">${STATE.year}년 나의 연차</div>
          `}
          <div class="att-tb__views">
            <button type="button" data-myl-view="cal"  class="${mode === 'cal'  ? 'is-active' : ''}">캘린더</button>
            <button type="button" data-myl-view="dash" class="${mode === 'dash' ? 'is-active' : ''}">대시보드</button>
          </div>
        </div>
      </div>
    `;
  }

  /* ============ KPI (이월/당해/총/사용/잔여) ============ */
  function _kpiUnit(t) {
    return `<small style="font-size:var(--fs-sm);font-weight:var(--fw-regular);color:var(--color-text-muted);margin-left:4px;">${esc(t)}</small>`;
  }
  function kpiCard(title, value, valueColor) {
    return `
      <div style="padding:16px 18px;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);">
        <div style="font-size:var(--fs-xs);color:var(--color-text-muted);">${esc(title)}</div>
        <div style="font-size:var(--fs-2xl);font-weight:var(--fw-bold);margin-top:4px;color:${valueColor || 'var(--color-text)'};">${value}</div>
      </div>
    `;
  }
  function renderKpi() {
    const lv = getLeave();
    const items = [
      { label: '이월 잔여 연차', value: `${lv.carry}${_kpiUnit('일')}`,   color: 'var(--color-info)' },
      { label: '당해 발생 연차', value: `${lv.granted}${_kpiUnit('일')}`, color: 'var(--color-brand-primary)' },
      { label: '총 연차',        value: `${lv.total}${_kpiUnit('일')}`,   color: 'var(--color-brand-primary)' },
      { label: '사용 연차',      value: `${lv.used}${_kpiUnit('일')}`,    color: 'var(--color-warning)' },
      { label: '잔여 연차',      value: `${lv.remain}${_kpiUnit('일')}`,  color: 'var(--color-success)' },
    ];
    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:16px;">
        ${items.map(it => kpiCard(it.label, it.value, it.color)).join('')}
      </div>
    `;
  }

  /* ============ 대체 휴가 (사무직 전용) ============
     사무직은 휴일근무 시 대체 휴가가 발생한다. 연차 KPI 와 성격이 다르므로
     구분선으로 분리하고 별도 카드 묶음(발생/사용/잔여)으로 노출한다. */
  function renderCompLeave() {
    const A = App.AttStatus;
    if (!A || !A.compLeave || !A.ME || A.ME.jobCat !== 'office') return '';
    const c = A.compLeave();
    const items = [
      { label: '발생 대체 휴가', value: `${c.earned}${_kpiUnit('일')}`, color: 'var(--color-brand-primary)' },
      { label: '사용 대체 휴가', value: `${c.used}${_kpiUnit('일')}`,   color: 'var(--color-warning)' },
      { label: '잔여 대체 휴가', value: `${c.balance}${_kpiUnit('일')}`, color: 'var(--color-success)' },
    ];
    return `
      <div style="border-top:1px solid var(--color-divider);margin:4px 0 12px;padding-top:16px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <strong style="font-size:var(--fs-md);">대체 휴가</strong>
          <span class="t-muted" style="font-size:var(--fs-xs);">사무직 휴일근무로 발생한 대체 휴가입니다.</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:16px;">
          ${items.map(it => kpiCard(it.label, it.value, it.color)).join('')}
        </div>
      </div>
    `;
  }

  /* ============ 사용 이력 ============ */
  function renderHistory() {
    const A = App.AttStatus;
    const history = getHistory();
    return `
      <div class="table-card">
        <div class="table-card__cap">
          <strong>사용 이력</strong>
          <span class="t-muted" style="font-size:var(--fs-xs);">${history.length}건</span>
        </div>
        <div class="table-card__body">
          <table class="prs-editor__table prs-editor__table--wide" style="width:100%;">
            <thead>
              <tr>
                <th style="width:140px;">일자</th>
                <th style="width:100px;">구분</th>
                <th style="width:80px;text-align:right;">일수</th>
                <th>사유</th>
                <th style="width:90px;text-align:center;">상태</th>
              </tr>
            </thead>
            <tbody>
              ${history.length ? history.map(h => `
                <tr>
                  <td>${esc(A.fmtDateDow ? A.fmtDateDow(h.date) : h.date)}</td>
                  <td>${esc(h.type)}</td>
                  <td style="text-align:right;">${h.days}일</td>
                  <td>${esc(h.reason)}</td>
                  <td style="text-align:center;"><span class="pill pill--success">${esc(h.status)}</span></td>
                </tr>
              `).join('') : `<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--color-text-muted);">사용 이력이 없습니다.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /* ============ 캘린더형 — 본인 연차/외근을 월별로 ============ */
  function calLegend() {
    const items = [
      ['leave', '연차'], ['half', '반차'], ['trip', '출장'], ['field', '외근'], ['edu', '교육'],
    ];
    return `
      <div class="shift-grid-legend">
        <strong>범례</strong>
        ${items.map(([c, l]) => `<span class="shift-grid-legend__item"><span class="lv-cal__chip lv-cal__chip--${c}">${esc(l)}</span></span>`).join('')}
      </div>
    `;
  }
  function renderCalView() {
    const ym = STATE.calYm;
    const events = buildCalEvents(ym);
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
        <div class="lv-cal__chip lv-cal__chip--${ev.cls}" title="${esc(ev.label + (ev.reason ? ' · ' + ev.reason : ''))}">
          ${esc(ev.label)}
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

  /* ============ 신청 내역 (Level 1 'apps') — 본인 연차/휴가 신청 품의 목록 ============
     인사 발령/계약 관리 목록과 동일 톤: 흰 배경 + .toolbar + .grid-wrap/.grid-scroll + .tbl. */
  function renderAppsView() {
    const A = App.AttStatus;
    const codeLabel = A.codeLabel || ((c) => c);
    const ST = A.APP_STATUSES || {};
    if (!STATE.appYm) STATE.appYm = A.TODAY.slice(0, 7);
    const ym = STATE.appYm;
    const inMonth = (a) => ((a.dateFrom || '').slice(0, 7) === ym || (a.dateTo || a.dateFrom || '').slice(0, 7) === ym);
    const list = ((A.myApps && A.myApps()) || []).filter(a => a.kind === 'leave' && inMonth(a));
    list.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
    const n = list.length;   /* No — 내림차순(N→1) */

    /* 페이지네이션 — 현재 페이지 구간만 렌더 */
    const size = STATE.appPageSize;
    const totalPages = Math.max(1, Math.ceil(n / size));
    if (STATE.appPage > totalPages) STATE.appPage = totalPages;
    if (STATE.appPage < 1) STATE.appPage = 1;
    const start = (STATE.appPage - 1) * size;
    const pageRows = list.slice(start, start + size);

    const rows = pageRows.length
      ? pageRows.map((a, i) => {
          const gi = start + i;
          const stat = ST[a.status] || { label: a.status, tone: 'muted' };
          const dateCol = a.dateFrom === a.dateTo
            ? esc(fmtYMD(a.dateFrom))
            : `${esc(fmtYMD(a.dateFrom))} ~ ${esc(fmtYMD(a.dateTo))}`;
          return `
            <tr class="is-clickable" data-myl-app-row="${esc(a.id)}">
              <td style="text-align:right;">${n - gi}</td>
              <td>${esc(a.no)}</td>
              <td>${esc(a.codeLabel || codeLabel(a.code))}</td>
              <td>${dateCol}</td>
              <td>${esc(a.reason)}</td>
              <td style="text-align:center;"><span class="pill pill--${stat.tone}">${esc(stat.label)}</span></td>
              <td>${a.status === 'rejected' ? esc(a.statusReason || '') : '<span class="t-muted">-</span>'}</td>
              <td>${esc(fmtDateTime(a.submittedAt))}</td>
              <td style="text-align:center;white-space:nowrap;">
                <button class="btn btn--xs" type="button" data-att-doc-open="${esc(a.id)}">상세</button>
                ${A.canWithdraw && A.canWithdraw(a) ? `<button class="btn btn--xs btn--soft-danger" type="button" data-myl-withdraw="${esc(a.id)}" title="승인 전 신청 회수">회수</button>` : ''}
                ${A.canCancel && A.canCancel(a) ? `<button class="btn btn--xs btn--soft-danger" type="button" data-myl-cancel="${esc(a.id)}" title="승인 후 취소 신청(전자결재)">취소</button>` : ''}
              </td>
            </tr>
          `;
        }).join('')
      : `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--color-text-muted);">표시할 신청 내역이 없습니다.</td></tr>`;

    return `
      <div class="toolbar">
        <div class="toolbar__left">
          ${App.YmPicker.html({ name: 'apps', ym: ym, todayYm: App.AttStatus.TODAY.slice(0, 7), labelStyle: 'font-size:var(--fs-lg);' })}
          <div class="att-tb__nav">
            <button type="button" data-myl-app-prev aria-label="이전 달">‹</button>
            <button type="button" data-myl-app-today>오늘</button>
            <button type="button" data-myl-app-next aria-label="다음 달">›</button>
          </div>
        </div>
      </div>
      <div class="table-card table-card--fill">
        <div class="toolbar">
          <div class="toolbar__left"><span class="toolbar__count">총 <strong>${n}</strong>건</span></div>
        </div>
        <div class="grid-wrap">
          <div class="grid-scroll">
            <table class="tbl tbl--hover">
              <thead>
                <tr>
                  <th style="width:56px;text-align:right;">No</th>
                  <th style="width:140px;">신청번호</th>
                  <th style="width:170px;">종류</th>
                  <th style="width:210px;">신청 일자</th>
                  <th>사유</th>
                  <th style="width:90px;text-align:center;">상태</th>
                  <th style="min-width:180px;">상태 사유</th>
                  <th style="width:140px;">상신 일시</th>
                  <th style="width:64px;text-align:center;"></th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          ${renderAppsPager(n, start, size)}
        </div>
      </div>
    `;
  }

  /* 신청 내역 페이지네이션 — 휴직 관리(page-hr-loa) 와 동일 마크업/동작 */
  function renderAppsPager(total, start, size) {
    const totalPages = Math.max(1, Math.ceil(total / size));
    const page = STATE.appPage;
    const info = total === 0 ? '0건' : `${start + 1}-${Math.min(start + size, total)} / ${total}건`;
    const btns = [];
    btns.push(`<button class="pagination__btn" data-myl-page="1" ${page === 1 ? 'disabled' : ''}>«</button>`);
    btns.push(`<button class="pagination__btn" data-myl-page="${Math.max(1, page - 1)}" ${page === 1 ? 'disabled' : ''}>‹</button>`);
    const win = 10;
    let s = Math.max(1, page - Math.floor(win / 2));
    let e = Math.min(totalPages, s + win - 1);
    if (e - s < win - 1) s = Math.max(1, e - win + 1);
    for (let i = s; i <= e; i++) {
      btns.push(`<button class="pagination__btn${i === page ? ' is-active' : ''}" data-myl-page="${i}">${i}</button>`);
    }
    btns.push(`<button class="pagination__btn" data-myl-page="${Math.min(totalPages, page + 1)}" ${page === totalPages ? 'disabled' : ''}>›</button>`);
    btns.push(`<button class="pagination__btn" data-myl-page="${totalPages}" ${page === totalPages ? 'disabled' : ''}>»</button>`);
    const sizeOpts = [20, 50, 100].map(v => `<option value="${v}" ${v === size ? 'selected' : ''}>${v}</option>`).join('');
    return `
      <div class="pagination">
        <div class="pagination__info">${info}</div>
        <div class="pagination__right">
          <div class="pagination__size">
            <label>페이지당</label>
            <select class="select" data-myl-pagesize>${sizeOpts}</select>
            <span>건</span>
          </div>
          <div class="pagination__list">${btns.join('')}</div>
        </div>
      </div>
    `;
  }

  /* ============ Shell / Render ============ */
  function renderShell(pageEl) {
    pageEl.innerHTML = `
      <div class="att-page__tabbar" data-myl-tabbar></div>
      <header class="att-page__head" data-myl-head></header>
      <div class="att-page__body" data-myl-body></div>
      <div data-myl-legend></div>
    `;
  }
  function renderBody() {
    if (STATE.level === 'apps') return renderAppsView();
    if (STATE.viewMode === 'cal') return renderCalView();
    return `${renderKpi()}${renderCompLeave()}${renderHistory()}`;
  }
  function renderAll(pageEl) {
    pageEl.querySelector('[data-myl-tabbar]').innerHTML = renderTabBar();
    /* 연차 현황 탭에서만 월 이동·뷰 토글 toolbar 노출. 신청 내역 탭은 toolbar/그리드가 본문. */
    const headEl = pageEl.querySelector('[data-myl-head]');
    headEl.innerHTML = STATE.level === 'status' ? renderHead() : '';
    headEl.style.display = STATE.level === 'status' ? '' : 'none';
    /* 신청 내역 탭 — 인사 발령/계약 관리 목록과 동일하게 흰 배경 + 풀높이 그리드 레이아웃 */
    const bodyEl = pageEl.querySelector('[data-myl-body]');
    bodyEl.classList.toggle('att-page__body--apps', STATE.level === 'apps');
    bodyEl.innerHTML = renderBody();
    const legendSlot = pageEl.querySelector('[data-myl-legend]');
    if (legendSlot) legendSlot.innerHTML = (STATE.level === 'status' && STATE.viewMode === 'cal') ? calLegend() : '';
  }

  function bind(pageEl) {
    if (pageEl.dataset.mylBound === '1') return;
    pageEl.dataset.mylBound = '1';
    /* 연/월 피커(App.YmPicker) 월 선택 — 캘린더 뷰(cal) / 신청 내역(apps) */
    pageEl.addEventListener('ympick:change', e => {
      const { name, ym } = e.detail;
      if (name === 'cal') { STATE.calYm = ym; renderAll(pageEl); }
      else if (name === 'apps') { STATE.appYm = ym; STATE.appPage = 1; renderAll(pageEl); }
    });
    pageEl.addEventListener('click', e => {
      const A = App.AttStatus;

      /* Level 1 탭 전환 (연차 현황 / 신청 내역) */
      const lvl = e.target.closest('[data-myl-level]');
      if (lvl) { STATE.level = lvl.dataset.mylLevel; renderAll(pageEl); return; }

      /* 신청 내역 월 이동 */
      if (e.target.closest('[data-myl-app-prev]'))  { STATE.appYm = shiftMonth(STATE.appYm || A.TODAY.slice(0, 7), -1); STATE.appPage = 1; renderAll(pageEl); return; }
      if (e.target.closest('[data-myl-app-next]'))  { STATE.appYm = shiftMonth(STATE.appYm || A.TODAY.slice(0, 7), +1); STATE.appPage = 1; renderAll(pageEl); return; }
      if (e.target.closest('[data-myl-app-today]')) { STATE.appYm = A.TODAY.slice(0, 7); STATE.appPage = 1; renderAll(pageEl); return; }

      /* 신청 내역 페이지 이동 */
      const pg = e.target.closest('[data-myl-page]');
      if (pg && !pg.disabled) {
        const p = Number(pg.dataset.mylPage);
        if (Number.isFinite(p)) { STATE.appPage = p; renderAll(pageEl); }
        return;
      }

      /* 뷰 토글 (캘린더 / 대시보드) */
      const view = e.target.closest('[data-myl-view]');
      if (view) { STATE.viewMode = view.dataset.mylView; renderAll(pageEl); return; }

      /* 휴가 신청 — 「근태 현황」(App.AttStatus) 의 공용 신청 모달(휴가 전용 모드) 재사용 */
      if (e.target.closest('[data-myl-apply-hol]')) {
        A && A.openApplyModal && A.openApplyModal('hol');
        return;
      }

      /* 신청 회수(승인 전) / 취소 신청(승인 후, 전자결재) */
      const wd = e.target.closest('[data-myl-withdraw]');
      if (wd) { e.stopPropagation(); A && A.withdrawApp && A.withdrawApp(wd.dataset.mylWithdraw, () => renderAll(pageEl)); return; }
      const cc = e.target.closest('[data-myl-cancel]');
      if (cc) { e.stopPropagation(); A && A.requestCancelApp && A.requestCancelApp(cc.dataset.mylCancel, () => renderAll(pageEl)); return; }

      /* 신청 내역 — 상세 버튼 / 행 클릭 모두 품의서 상세 모달(공용) */
      const appDoc = e.target.closest('[data-att-doc-open]');
      if (appDoc) { e.stopPropagation(); A && A.openDocModal && A.openDocModal(appDoc.dataset.attDocOpen); return; }
      const appRow = e.target.closest('[data-myl-app-row]');
      if (appRow && !e.target.closest('button, a, input, select, textarea, label')) {
        const sel = window.getSelection && window.getSelection();
        if (sel && sel.type === 'Range' && String(sel).length > 0) return;
        A && A.openDocModal && A.openDocModal(appRow.dataset.mylAppRow);
        return;
      }

      /* 캘린더형 월 전환 */
      if (e.target.closest('[data-myl-cal-prev]'))  { STATE.calYm = shiftMonth(STATE.calYm, -1); renderAll(pageEl); return; }
      if (e.target.closest('[data-myl-cal-next]'))  { STATE.calYm = shiftMonth(STATE.calYm, +1); renderAll(pageEl); return; }
      if (e.target.closest('[data-myl-cal-today]')) { STATE.calYm = '2026-05'; renderAll(pageEl); return; }
    });

    /* 신청 내역 페이지당 건수 변경 */
    pageEl.addEventListener('change', e => {
      const ps = e.target.closest('[data-myl-pagesize]');
      if (ps) { STATE.appPageSize = Number(ps.value) || 20; STATE.appPage = 1; renderAll(pageEl); }
    });
  }

  function initPage() {
    const pageEl = document.getElementById('page-att-my-leave');
    if (!pageEl) return;
    pageEl.__onShow = () => {
      if (!ensureDeps()) {
        pageEl.innerHTML = `<div style="padding:24px;color:var(--color-text-muted);">근태 모듈 로드 중...</div>`;
        return;
      }
      if (!pageEl.dataset.mylShellMounted) {
        pageEl.dataset.mylShellMounted = '1';
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
