/* =========================================================
 * Page: 근태 관리 > 나의 근태현황 (비권한자 본인 시점)
 *
 *   기존 「근태 현황」 화면의 비권한자(STATE.isAdmin === false) 분기를
 *   별도 메뉴/페이지로 분리. 본인의 출퇴근·연장·휴가·신청 이력만 표시.
 *
 *   - 본인의 월별 캘린더 / 대시보드 토글
 *   - 본인의 KPI (근무일/지각/조퇴/연장/야간/휴가/결근)
 *   - 본인 신청 현황 (간단 카드)
 *   - 수동 새로고침 지원 (마지막 갱신 시각 표시)
 *
 *   ※ Mock 데이터·헬퍼는 App.AttStatus 에 노출된 공용 헬퍼를 그대로 재사용.
 *      신청 모달 등 풀 기능이 필요하면 본인은 「근태 현황」 의 모달도 사용 가능.
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* 표시 전용 날짜 포맷 — 원본(ISO)은 그대로 두고 렌더 시점에만 변환 (SWADPIA §1·§2) */
  function fmtD(s) {   /* ISO YYYY-MM-DD → YY/MM/DD */
    s = String(s || '');
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(2, 4) + '/' + s.slice(5, 7) + '/' + s.slice(8, 10) : s;
  }
  function fmtYM(s) {  /* ISO YYYY-MM → YY/MM */
    s = String(s || '');
    return /^\d{4}-\d{2}/.test(s) ? s.slice(2, 4) + '/' + s.slice(5, 7) : s;
  }
  function fmtDT(s) {  /* YYYY-MM-DD HH:MM → YY/MM/DD   HH:MM (공백 3칸) */
    s = String(s || '');
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    return m ? m[1].slice(2) + '/' + m[2] + '/' + m[3] + '   ' + m[4] + ':' + m[5] : s;
  }

  function ensureDeps() {
    return App.AttStatus && App.AttStatus.EMP_LIST && App.AttStatus.getRecords;
  }

  /* 근무조 불일치 — 등록 근무조 시작시간과 실제 출근시간이 30분 이상 차이날 경우 경고.
     반환: null(정상) 또는 { sched, actual, diff } */
  const MISMATCH_MIN = 30;
  function toMin(t) { if (!/^\d{2}:\d{2}$/.test(t || '')) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; }
  function shiftMismatch(r) {
    if (!r || r.kind !== 'work' || !r.shift || !r.checkIn) return null;
    const shift = App.AttShifts && App.AttShifts.get(r.shift);
    if (!shift) return null;
    const sched = toMin(shift.start), actual = toMin(r.checkIn);
    if (sched == null || actual == null) return null;
    const diff = actual - sched;
    if (Math.abs(diff) < MISMATCH_MIN) return null;
    return { code: r.shift, sched: shift.start, actual: r.checkIn, diff };
  }
  function mismatchCount(recs) { return recs.filter(r => shiftMismatch(r)).length; }

  /* 반차 미신청 — 반차 사용 정황(오전/오후)이 있으나 반차 신청서가 등록되지 않은 경우.
     반환: null / 'am'(오전 반차) / 'pm'(오후 반차) */
  function halfHint(r) {
    if (!r || r.kind !== 'work' || !r.halfSuspect) return null;
    const A = App.AttStatus;
    const docs = (A && A.appsByDate) ? (A.appsByDate(A.ME.id, r.date) || []) : [];
    if (docs.some(d => d.kind === 'leave')) return null;   /* 이미 반차/휴가 신청서 존재 */
    return r.halfSuspect;
  }
  function halfLabel(k) { return k === 'am' ? '오전 반차' : '오후 반차'; }
  function halfCount(recs) { return recs.filter(r => halfHint(r)).length; }

  /* 근무조 색상 클래스 — 전 근태 화면 공용 파스텔 팔레트(.shift-chip--c0~c9 / --day).
     근무스케줄 현황(page-att-shift)의 shiftColorCls 와 동일 규칙(근무조 목록 인덱스 % 10). */
  function shiftColorCls(code) {
    const list = (App.AttShifts && App.AttShifts.list) ? App.AttShifts.list() : [];
    const idx = list.findIndex(s => s.code === code);
    return idx >= 0 ? `shift-chip--c${idx % 10}` : 'shift-chip--day';
  }
  /* 근무조 라벨 칩(A조 등) — 근무조 색상 파스텔을 그대로 사용. (권한자 화면과 공유하는
     A.shiftChipHTML 대신 나의 근태현황 전용으로 근무조 색을 입힌 칩을 렌더) */
  function shiftChipLocal(code) {
    if (!code || code === '-') return '';
    const shift = (App.AttShifts && App.AttShifts.get) ? App.AttShifts.get(code) : null;
    const label = shift ? (shift.label || code) : code;
    const tip = shift ? `${shift.start}~${shift.end}${shift.isNight ? ' · 야간' : ''}` : '';
    return `<span class="att-cal__shiftc ${shiftColorCls(code)}" title="${esc(tip)}">${esc(label)}</span>`;
  }
  /* 근태 블록(bar) 마크업 — 텍스트는 ellipsis 되는 span. 색상 클래스만 갈아끼운다. */
  function blockHTML(colorCls, text, title) {
    const t = title ? ` title="${esc(title)}"` : '';
    return `<div class="att-cal__block ${colorCls}"${t}><span class="att-cal__block-txt">${text}</span></div>`;
  }
  /* 경고 출퇴근 블록 — 근무조 불일치/반차 미신청 등. 찐 다홍 solid + 느낌표. 클릭 시 안내 모달.
     warnData: { date, mm:{code,sched,actual}|null, half:'am'|'pm'|null } */
  function warnBlockHTML(checkIn, checkOut, warnData) {
    const attrs = ` data-mw-warn="${esc(warnData.date)}"`
      + (warnData.mm ? ` data-mm-code="${esc(warnData.mm.code)}" data-mm-sched="${esc(warnData.mm.sched)}" data-mm-actual="${esc(warnData.mm.actual)}"` : '')
      + (warnData.half ? ` data-warn-half="${esc(warnData.half)}"` : '');
    return `<div class="att-cal__block att-cal__block--warn is-clickable"${attrs} title="근태 경고 — 클릭하여 상세 확인">`
      + `<span class="att-cal__block-txt">출근 ${esc(checkIn)} 퇴근 ${esc(checkOut)}</span>`
      + `<span class="att-cal__mm">!</span></div>`;
  }

  const STATE = {
    level: 'status',      /* Level 1 탭: 'status'(근태 현황) | 'apps'(근태 신청 현황) */
    span: 'month',        /* 'month'(월간, 기본) | 'week'(주간 일자별 + 총합) */
    weekStart: null,      /* 주간 모드 현재 주의 월요일(YYYY-MM-DD). null=오늘 기준 */
    view: 'cal',          /* 'cal' | 'dashboard' — 근태 현황 탭 내부 뷰(월간 전용) */
    ym:   null,
    lastRefreshAt: null,
    appPage: 1,           /* 신청 내역 페이지 */
    appPageSize: 20,      /* 신청 내역 페이지당 건수 */
    appYm: null,          /* 신청 내역 조회 월(YYYY-MM) — 월별 필터 */
    dailySort: 'desc',    /* 일자별 기록 정렬 — 'desc'(최신순, 기본) | 'asc'(오래된순) */
    dailyFilter: null,    /* 대시보드 KPI 클릭 필터 — null | 'late'(지각) | 'early'(조퇴). 같은 카드 재클릭 시 해제 */
    /* 사원 유형(직군) — 'production'(생산직) | 'office'(사무직) | 'research'(연구직).
       · 생산직: 팀장·관리자가 팀원 근무스케줄을 변경 → 본인 '근무조 변경 신청' 버튼 미노출.
       · 사무직·연구직: 본인이 전자결재 승인을 통해 직접 근무조 변경 신청 가능 → 버튼 노출.
       데모용 직군 전환 토글(FAB)로 세 케이스를 한 화면에서 확인. 기본 사무직. */
    jobCat: 'office',
  };
  const JOBCATS = [
    { key: 'production', label: '생산직' },
    { key: 'office',     label: '사무직' },
    { key: 'research',   label: '연구직' },
  ];
  function jobCatLabel(k) { const j = JOBCATS.find(x => x.key === k); return j ? j.label : '사무직'; }
  /* 본인이 직접 근무조 변경 신청 가능한 직군 — 사무직·연구직만(생산직은 팀장·관리자가 변경) */
  function canSelfRequestShift() { return STATE.jobCat !== 'production'; }

  /* Level 1 탭 정의 — 좌측 탭 / 우측 신청 버튼 */
  const LEVELS = [
    { key: 'status', label: '근태 현황' },
    { key: 'apps',   label: '신청 내역' },
  ];

  function renderShell(pageEl) {
    pageEl.innerHTML = `
      <div class="att-page__tabbar" data-mw-tabbar></div>
      <header class="att-page__head" data-mw-head></header>
      <div class="att-page__body" data-mw-body></div>
      <div data-mw-legend></div>
    `;
  }

  /* ===== Level 1 탭바 — 좌측 큰 탭(.att-scope-tab, 권한자 근태현황과 동일) + 우측 신청 버튼 2개 ===== */
  function renderTabBar() {
    return `
      <div class="att-tabbar__tabs">
        ${LEVELS.map(l => `
          <button type="button" class="att-scope-tab ${STATE.level === l.key ? 'is-active' : ''}" data-mw-level="${l.key}">${esc(l.label)}</button>
        `).join('')}
      </div>
      <div class="att-page__tabbar-actions">
        <button class="btn btn--primary btn--sm" type="button" data-mw-act="apply-att">근태 신청</button>
        <button class="btn btn--sm" type="button" data-mw-act="apply-ot">초과근무 신청</button>
        ${canSelfRequestShift()
          ? `<button class="btn btn--sm" type="button" data-mw-act="shift-change">근무조 변경 신청</button>`
          : `<span class="t-muted" style="font-size:var(--fs-xs);align-self:center;" title="생산직은 팀장·관리자가 근무스케줄을 변경합니다.">근무조 변경은 팀장·관리자 문의</span>`}
      </div>
    `;
  }

  function shiftMonth(ym, delta) {
    const { pad2, parseYM } = App.AttStatus;
    const { y, m } = parseYM(ym);
    let nm = m + delta, ny = y;
    while (nm <= 0)  { nm += 12; ny -= 1; }
    while (nm > 12)  { nm -= 12; ny += 1; }
    return `${ny}-${pad2(nm)}`;
  }

  /* ===== 주간 헬퍼 (월요일 기준, 월 경계 무관 연속 이동) ===== */
  function pad2(n) { return App.AttStatus.pad2(n); }
  function parseYMD(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function ymdOf(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
  function mondayOf(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const wd = x.getDay(); x.setDate(x.getDate() + (wd === 0 ? -6 : 1 - wd)); return x; }
  function currentWeekStart() { return STATE.weekStart || ymdOf(mondayOf(parseYMD(App.AttStatus.TODAY))); }
  function shiftWeekBy(delta) {
    const b = parseYMD(currentWeekStart());
    const nx = new Date(b.getFullYear(), b.getMonth(), b.getDate() + 7 * delta);
    STATE.weekStart = ymdOf(nx);
    STATE.ym = `${nx.getFullYear()}-${pad2(nx.getMonth() + 1)}`;
  }
  function weekDates(start) {
    const b = parseYMD(start); const out = [];
    for (let i = 0; i < 7; i++) { const d = new Date(b.getFullYear(), b.getMonth(), b.getDate() + i); out.push(ymdOf(d)); }
    return out;
  }
  /* 현재 주 7일의 본인 일자별 레코드(월 경계 시 두 달치 조회) */
  function weekRecs() {
    const A = App.AttStatus; const empId = A.ME.id;
    const byM = {};
    return weekDates(currentWeekStart()).map(ds => {
      const ym = ds.slice(0, 7);
      if (!byM[ym]) byM[ym] = A.getRecords(empId, ym);
      return byM[ym].find(x => x.date === ds) || { date: ds, kind: 'future' };
    });
  }

  function renderHead() {
    const A = App.AttStatus;
    const refreshHTML = `
      <div class="att-tb__refresh" title="수동 새로고침으로 본인 근태현황을 갱신합니다">
        <span class="att-tb__refresh-stamp">
          ${STATE.lastRefreshAt ? `마지막 갱신 <strong>${esc(STATE.lastRefreshAt)}</strong>` : '갱신 전'}
        </span>
        <button class="btn btn--sm" type="button" data-mw-refresh aria-label="새로고침">
          ${(window.Icons && window.Icons.refresh) || '↻'} 새로고침
        </button>
      </div>
    `;
    const isWeek = STATE.span === 'week';
    const spanToggle = `
      <div class="tabs tabs--segmented" style="display:inline-flex;width:auto;">
        <div class="tabs__nav">
          <button type="button" class="tabs__tab ${!isWeek ? 'is-active' : ''}" data-mw-span="month">월간</button>
          <button type="button" class="tabs__tab ${isWeek ? 'is-active' : ''}" data-mw-span="week">주간</button>
        </div>
      </div>`;
    let titleHTML;
    if (isWeek) {
      const ds = weekDates(currentWeekStart());
      const a = parseYMD(ds[0]), b = parseYMD(ds[6]);
      const f = (d) => `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
      titleHTML = `<div class="att-tb__title" style="font-size:var(--fs-lg);">${f(a)} ~ ${f(b)}</div>`;
    } else {
      titleHTML = App.YmPicker.html({ name: 'status', ym: STATE.ym, todayYm: A.TODAY.slice(0, 7) });
    }
    const viewToggle = isWeek ? '' : `
      <div class="att-tb__views">
        ${A.VIEW_MODES.map(v => {
          const active = STATE.view === v.key ? 'is-active' : '';
          return `<button type="button" data-mw-view="${v.key}" class="${active}">${esc(v.label)}</button>`;
        }).join('')}
      </div>`;
    return `
      <div class="att-tb">
        <div class="att-tb__left">
          ${titleHTML}
          <div class="att-tb__nav">
            <button type="button" data-mw-ym-prev aria-label="${isWeek ? '이전 주' : '이전 달'}">‹</button>
            <button type="button" data-mw-today>오늘</button>
            <button type="button" data-mw-ym-next aria-label="${isWeek ? '다음 주' : '다음 달'}">›</button>
          </div>
          ${viewToggle}
        </div>
        <div style="flex:1;display:flex;justify-content:center;">${spanToggle}</div>
        <div class="att-tb__right">
          ${refreshHTML}
        </div>
      </div>
    `;
  }

  /* ----- 본문 (캘린더 or 대시보드) -----
   *  ※ 이름·사번·부서·직위·근무조 정보는 상단 toolbar 칩으로 통합 — 본문 띠지(att-emp-head) 제거 */
  function renderBody() {
    if (STATE.level === 'apps') return renderAppsView();
    const A = App.AttStatus;
    const empId = A.ME.id;

    /* 주간 — 현재 주 7일 일자별 기록 + 총합 (캘린더/대시보드 토글 없이 표 형태) */
    if (STATE.span === 'week') {
      const wrecs = weekRecs();
      return renderDashboard(A.monthStats(wrecs), empId, wrecs, { week: true });
    }

    const recs = A.getRecords(empId, STATE.ym);
    const stats = A.monthStats(recs);
    if (STATE.view === 'cal') return renderCalendar(empId, recs);
    return renderDashboard(stats, empId, recs);
  }

  /* ===== 근태 신청 현황 (Level 1 'apps') — 단일 통합 테이블 =====
     초과근무 + 근태 신청을 한 테이블에 모으고 '구분' 컬럼으로 초과근무/근태를 분리.
     (연차/휴가 신청 현황은 「나의 연차현황」에서 별도 관리)
     인사 발령/계약 관리 목록과 동일 톤: 흰 배경 + .toolbar + .grid-wrap/.grid-scroll + .tbl. */
  function renderAppsView() {
    const A = App.AttStatus;
    const codeLabel = A.codeLabel || ((c) => c);
    const ST = A.APP_STATUSES || {};
    if (!STATE.appYm) STATE.appYm = A.TODAY.slice(0, 7);
    const ym = STATE.appYm;
    const inMonth = (a) => {
      const from = (a.kind === 'ot' ? a.date : a.dateFrom) || '';
      const to   = (a.kind === 'ot' ? a.date : (a.dateTo || a.dateFrom)) || '';
      return from.slice(0, 7) === ym || to.slice(0, 7) === ym;
    };
    const list = ((A.myApps && A.myApps()) || []).filter(a => (a.kind === 'ot' || a.kind === 'att') && inMonth(a));
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
          const isOt = a.kind === 'ot';
          const stat = ST[a.status] || { label: a.status, tone: 'muted' };
          const kindPill = isOt
            ? `<span class="pill pill--warning">초과근무</span>`
            : `<span class="pill pill--info">근태</span>`;
          const typeMain = isOt ? (a.otKind === 'holiday' ? '휴일근무' : '연장근무') : (a.codeLabel || codeLabel(a.code));
          /* 종류는 명칭만 — 사유(초과근무=reasonCode / 근태=reason)는 사유 컬럼에만 노출(종류 중복 표기 금지) */
          const typeCol  = esc(typeMain);
          const reasonText = isOt ? (a.reasonCode || a.reason || '') : (a.reason || '');
          const dateCol = isOt
            ? `${esc(fmtD(a.date))} <span class="t-muted">${esc(a.startTime)}~${esc(a.endTime)}</span>`
            : (a.dateFrom === a.dateTo ? esc(fmtD(a.dateFrom)) : `${esc(fmtD(a.dateFrom))} ~ ${esc(fmtD(a.dateTo))}`);
          return `
            <tr class="is-clickable" data-mw-app-row="${esc(a.id)}">
              <td style="text-align:right;">${n - gi}</td>
              <td>${esc(a.no)}</td>
              <td style="text-align:center;"><a class="link-code" href="javascript:;" data-att-doc-open="${esc(a.id)}" title="결재문서 보기">${esc(a.docNo || a.no)}</a></td>
              <td style="text-align:center;">${kindPill}</td>
              <td style="white-space:nowrap;">${typeCol}</td>
              <td>${dateCol}</td>
              <td>${esc(reasonText)}</td>
              <td style="text-align:center;"><span class="pill pill--${stat.tone}">${esc(stat.label)}</span></td>
              <td>${a.status === 'rejected' ? esc(a.statusReason || '') : '<span class="t-muted">-</span>'}</td>
              <td>${esc(fmtDT(a.submittedAt))}</td>
              <td style="text-align:center;white-space:nowrap;">
                ${A.canWithdraw && A.canWithdraw(a) ? `<button class="btn btn--xs btn--soft-danger" type="button" data-mw-withdraw="${esc(a.id)}" title="승인 전 신청 회수">회수</button>` : ''}
                ${A.canCancel && A.canCancel(a) ? `<button class="btn btn--xs btn--soft-danger" type="button" data-mw-cancel="${esc(a.id)}" title="승인 후 취소 신청(전자결재)">취소</button>` : ''}
                ${(!(A.canWithdraw && A.canWithdraw(a)) && !(A.canCancel && A.canCancel(a))) ? '<span class="t-muted">-</span>' : ''}
              </td>
            </tr>
          `;
        }).join('')
      : `<tr><td colspan="11" style="text-align:center;padding:40px;color:var(--color-text-muted);">표시할 신청 내역이 없습니다.</td></tr>`;

    return `
      <div class="toolbar">
        <div class="toolbar__left">
          ${App.YmPicker.html({ name: 'apps', ym: ym, todayYm: A.TODAY.slice(0, 7), labelStyle: 'font-size:var(--fs-lg);' })}
          <div class="att-tb__nav">
            <button type="button" data-mw-app-prev aria-label="이전 달">‹</button>
            <button type="button" data-mw-app-today>오늘</button>
            <button type="button" data-mw-app-next aria-label="다음 달">›</button>
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
                  <th style="width:120px;text-align:center;">결재문서</th>
                  <th style="width:90px;text-align:center;">구분</th>
                  <th style="width:170px;">종류</th>
                  <th style="width:210px;">신청 일자/시간</th>
                  <th>사유</th>
                  <th style="width:90px;text-align:center;">상태</th>
                  <th style="min-width:180px;">상태 사유</th>
                  <th style="width:140px;">상신 일시</th>
                  <th style="width:80px;text-align:center;"></th>
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
    btns.push(`<button class="pagination__btn" data-mw-page="1" ${page === 1 ? 'disabled' : ''}>«</button>`);
    btns.push(`<button class="pagination__btn" data-mw-page="${Math.max(1, page - 1)}" ${page === 1 ? 'disabled' : ''}>‹</button>`);
    const win = 10;
    let s = Math.max(1, page - Math.floor(win / 2));
    let e = Math.min(totalPages, s + win - 1);
    if (e - s < win - 1) s = Math.max(1, e - win + 1);
    for (let i = s; i <= e; i++) {
      btns.push(`<button class="pagination__btn${i === page ? ' is-active' : ''}" data-mw-page="${i}">${i}</button>`);
    }
    btns.push(`<button class="pagination__btn" data-mw-page="${Math.min(totalPages, page + 1)}" ${page === totalPages ? 'disabled' : ''}>›</button>`);
    btns.push(`<button class="pagination__btn" data-mw-page="${totalPages}" ${page === totalPages ? 'disabled' : ''}>»</button>`);
    const sizeOpts = [20, 50, 100].map(v => `<option value="${v}" ${v === size ? 'selected' : ''}>${v}</option>`).join('');
    return `
      <div class="pagination">
        <div class="pagination__info">${info}</div>
        <div class="pagination__right">
          <div class="pagination__size">
            <label>페이지당</label>
            <select class="select" data-mw-pagesize>${sizeOpts}</select>
            <span>건</span>
          </div>
          <div class="pagination__list">${btns.join('')}</div>
        </div>
      </div>
    `;
  }

  function renderKpiCards(s) {
    const items = [
      { label: '근무일수',     val: s.workDays, suffix: '일', tone: 'brand' },
      { label: '지각',         val: s.lateCnt,  suffix: '회', tone: s.lateCnt > 0 ? 'warn' : 'muted',
        sub: s.lateCnt > 0 ? `총 ${s.lateMin}분` : '', le: s.lateCnt > 0 ? 'late' : '' },
      { label: '조퇴',         val: s.earlyCnt, suffix: '회', tone: s.earlyCnt > 0 ? 'warn' : 'muted',
        sub: s.earlyCnt > 0 ? `총 ${s.earlyMin}분` : '', le: s.earlyCnt > 0 ? 'early' : '' },
      { label: '결근',         val: s.absCnt,   suffix: '일', tone: s.absCnt > 0 ? 'danger' : 'muted' },
      { label: '연장 근무',    val: s.otExtra.toFixed(1),      suffix: 'h', tone: 'brand' },
      { label: '야간 근무',    val: s.otNight.toFixed(1),      suffix: 'h', tone: 'brand' },
      { label: '야간 연장 근무', val: s.otNightExtra.toFixed(1), suffix: 'h', tone: 'brand' },
      { label: '휴일 근무',    val: s.otHoliday.toFixed(1),    suffix: 'h', tone: 'muted' },
    ];
    return `
      <div class="att-kpi">
        ${items.map(it => `
          <div class="att-kpi__card att-kpi__card--${it.tone}${it.le && STATE.dailyFilter === it.le ? ' is-active' : ''}"${it.le ? ` data-mw-le="${it.le}" role="button" tabindex="0" title="${esc(it.label)} 내역 필터 (재클릭 시 해제)" style="cursor:pointer;"` : ''}>
            <div class="att-kpi__label">${esc(it.label)}</div>
            <div class="att-kpi__value">${it.val}<small>${esc(it.suffix)}</small></div>
            ${it.sub ? `<div class="att-kpi__sub">${esc(it.sub)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderDashboard(stats, empId, recs, opts) {
    const A = App.AttStatus;
    const isWeek = !!(opts && opts.week);
    const dash = '<span class="t-muted">-</span>';
    const hourCell = (v) => (v && v > 0) ? `${v.toFixed(1)}h` : dash;
    const minCell  = (v) => (v && v > 0) ? `${v}분` : dash;
    const divDot   = '<span style="margin:0 6px;color:var(--color-divider);">·</span>';

    const sorted = recs.slice().sort((a, b) => STATE.dailySort === 'desc'
      ? (b.date || '').localeCompare(a.date || '')
      : (a.date || '').localeCompare(b.date || ''));
    /* 대시보드 KPI(지각/조퇴) 클릭 필터 — 해당 기록만 노출. 미선택 시 전체. */
    const filtered = STATE.dailyFilter === 'late'  ? sorted.filter(r => r.isLate)
                   : STATE.dailyFilter === 'early' ? sorted.filter(r => r.isEarly)
                   : sorted;
    const rows = filtered.map(r => {
      const dateCell = esc(A.fmtDateDow ? A.fmtDateDow(r.date) : r.date);
      let gubun = dash, gubunColor = '';
      let ci = dash, co = dash, late = dash, early = dash, ext = dash, night = dash, nightExt = dash, hol = dash;
      let bigo = '';

      if (r.kind === 'work') {
        gubun = '출근';
        ci = esc(r.checkIn || '-'); co = esc(r.checkOut || '-');
        late = minCell(r.lateMin); early = minCell(r.earlyMin);
        ext = hourCell(r.ot && r.ot.extra); night = hourCell(r.ot && r.ot.night);
        hol = hourCell(r.ot && r.ot.holiday);
        /* 야간연장 — 별도 산정값 없음(mock) */
        const notes = [];
        const mm = shiftMismatch(r);
        if (mm) notes.push(`<span style="color:var(--color-danger);font-weight:var(--fw-medium);" title="등록 ${esc(mm.code)}조 ${esc(mm.sched)} · 실제 ${esc(mm.actual)}">근무조 불일치</span> <button type="button" class="btn btn--xs" data-mw-reason="${esc(r.date)}">사유서 작성</button>`);
        const half = halfHint(r);
        if (half) notes.push(`<span style="color:var(--color-warning);font-weight:var(--fw-medium);">${esc(halfLabel(half))} 미신청</span> <button type="button" class="btn btn--xs btn--primary" data-mw-half="${esc(half)}">신청서 작성</button>`);
        bigo = notes.join(divDot);
      } else if (r.kind === 'att') {
        const code = r.code || '';
        const isAbsent = code === 'HOLG02' || code === 'HOLG03';   /* 병가류 → 결근 */
        gubun = isAbsent ? '결근' : '휴가';
        gubunColor = isAbsent ? 'var(--color-danger)' : 'var(--color-info)';
        ci = r.checkIn ? esc(r.checkIn) : dash;
        co = r.checkOut ? esc(r.checkOut) : dash;
        bigo = esc((A.codeLabel && A.codeLabel(code)) || r.label || '');
      } else if (r.kind === 'holiday') {
        gubun = '휴일'; gubunColor = 'var(--color-text-muted)';
        hol = hourCell(r.holWork);
        bigo = esc(r.label || '');
      } else if (r.kind === 'future') {
        gubun = '예정'; gubunColor = 'var(--color-text-muted)';
      }

      return `<tr>
        <td>${dateCell}</td>
        <td${gubunColor ? ` style="color:${gubunColor};font-weight:var(--fw-medium);"` : ''}>${gubun}</td>
        <td>${ci}</td>
        <td>${co}</td>
        <td style="text-align:right;">${late}</td>
        <td style="text-align:right;">${early}</td>
        <td style="text-align:right;">${ext}</td>
        <td style="text-align:right;">${night}</td>
        <td style="text-align:right;">${nightExt}</td>
        <td style="text-align:right;">${hol}</td>
        <td>${bigo || dash}</td>
      </tr>`;
    }).join('');

    let capLabel;
    if (isWeek) {
      const ds = weekDates(currentWeekStart());
      const a = parseYMD(ds[0]), b = parseYMD(ds[6]);
      capLabel = `${pad2(a.getMonth() + 1)}/${pad2(a.getDate())} ~ ${pad2(b.getMonth() + 1)}/${pad2(b.getDate())}`;
    } else {
      capLabel = fmtYM(STATE.ym);
    }
    const totalRow = isWeek && !STATE.dailyFilter ? `
      <tr style="background:var(--color-surface-alt);font-weight:var(--fw-semibold);border-top:2px solid var(--color-border);">
        <td>총합</td><td>${dash}</td><td>${dash}</td><td>${dash}</td>
        <td style="text-align:right;">${stats.lateMin > 0 ? `${stats.lateMin}분` : dash}</td>
        <td style="text-align:right;">${stats.earlyMin > 0 ? `${stats.earlyMin}분` : dash}</td>
        <td style="text-align:right;">${hourCell(stats.otExtra)}</td>
        <td style="text-align:right;">${hourCell(stats.otNight)}</td>
        <td style="text-align:right;">${hourCell(stats.otNightExtra)}</td>
        <td style="text-align:right;">${hourCell(stats.otHoliday)}</td>
        <td>${dash}</td>
      </tr>` : '';
    return `
      ${renderKpiCards(stats)}
      <div class="table-card table-card--mt">
        <div class="table-card__cap"><strong>${capLabel} 근태 상세내역</strong>${STATE.dailyFilter ? `<span class="pill pill--warning" style="font-size:11px;">${STATE.dailyFilter === 'late' ? '지각' : '조퇴'}만 보기</span><button type="button" class="btn btn--xs" data-mw-le-clear>필터 해제</button>` : ''}<span class="t-muted" style="font-size:var(--fs-xs);">${filtered.length}일</span></div>
        <div class="table-card__body">
        <table class="prs-editor__table prs-editor__table--wide" style="width:100%;">
          <thead>
            <tr>
              <th style="width:104px;"><button class="th-sort ${STATE.dailySort === 'asc' ? 'is-asc' : 'is-desc'}" type="button" data-mw-daily-sort>날짜<span class="th-sort__ico" aria-hidden="true"></span></button></th>
              <th style="width:60px;">구분</th>
              <th style="width:66px;">출근</th>
              <th style="width:66px;">퇴근</th>
              <th style="width:60px;text-align:right;">지각</th>
              <th style="width:60px;text-align:right;">조퇴</th>
              <th style="width:60px;text-align:right;">연장</th>
              <th style="width:60px;text-align:right;">야간</th>
              <th style="width:76px;text-align:right;">야간연장</th>
              <th style="width:60px;text-align:right;">휴일</th>
              <th>비고</th>
            </tr>
          </thead>
          <tbody>${rows}${totalRow}</tbody>
        </table>
        </div>
      </div>
    `;
  }

  function renderCalendar(empId, recs) {
    const A = App.AttStatus;
    const { y, m } = A.parseYM(STATE.ym);
    const days = A.daysInMonth(y, m);
    const first = new Date(y, m - 1, 1);
    const leadBlanks = first.getDay();
    const DOW_KO = ['일','월','화','수','목','금','토'];
    const cells = [];
    for (let i = 0; i < leadBlanks; i++) cells.push(`<div class="att-cal__cell att-cal__cell--blank"></div>`);
    recs.forEach(r => { cells.push(renderCalCell(r)); });
    const total = leadBlanks + days;
    const trail = (7 - (total % 7)) % 7;
    for (let i = 0; i < trail; i++) cells.push(`<div class="att-cal__cell att-cal__cell--blank"></div>`);

    return `
      <div class="att-cal">
        <div class="att-cal__weekdays">
          ${DOW_KO.map((w, i) => `<div class="att-cal__wd ${i === 0 ? 'is-sun' : ''} ${i === 6 ? 'is-sat' : ''}">${w}</div>`).join('')}
        </div>
        <div class="att-cal__grid">
          ${cells.join('')}
        </div>
      </div>
    `;
  }

  /* 캘린더 범례 — 나의 연차현황과 동일하게 페이지 맨 아래 고정 바(.shift-grid-legend) 로 표시 */
  function calLegend() {
    return `
      <div class="shift-grid-legend">
        <strong>범례</strong>
        <span class="shift-grid-legend__item"><span class="att-cal__block shift-chip--c0 att-cal__sw"></span>출퇴근</span>
        <span class="shift-grid-legend__item"><span class="att-cal__block att-cal__block--warn att-cal__sw"></span>경고</span>
        <span class="shift-grid-legend__item"><span class="att-cal__block att-cal__block--late att-cal__sw"></span>지각<small class="t-muted">(분)</small></span>
        <span class="shift-grid-legend__item"><span class="att-cal__block att-cal__block--early att-cal__sw"></span>조퇴<small class="t-muted">(분)</small></span>
        <span class="shift-grid-legend__item"><span class="att-cal__block att-cal__block--ot att-cal__sw"></span>연장<small class="t-muted">(h)</small></span>
        <span class="shift-grid-legend__item"><span class="att-cal__block att-cal__block--night att-cal__sw"></span>야간<small class="t-muted">(h)</small></span>
        <span class="shift-grid-legend__item"><span class="att-cal__block att-cal__block--leave att-cal__sw"></span>휴가</span>
        <span class="shift-grid-legend__item"><span class="att-cal__doc-mark">📄</span>품의서</span>
      </div>
    `;
  }

  /* 신청 품의서 배지 — 본인 신청(연차/근태/초과근무) 이 있는 날에 📄 표시. 클릭 시 상세 모달(근태 현황 공용). */
  function docMarkHTML(dateStr) {
    const A = App.AttStatus;
    const docs = (A.appsByDate ? A.appsByDate(A.ME.id, dateStr) : []) || [];
    if (!docs.length) return '';
    const d0 = docs[0];
    const st = (A.APP_STATUSES && A.APP_STATUSES[d0.status]) ? A.APP_STATUSES[d0.status].label : d0.status;
    const title = (d0.codeLabel || (d0.otKind === 'night' ? '연장근무 신청서' : d0.otKind === 'holiday' ? '휴일근무 신청서' : '신청 품의서')) + ` (${st})`;
    return `<button type="button" class="att-cal__doc" data-att-doc-open="${esc(d0.id)}" title="${esc(title)}">📄${docs.length > 1 ? `<span class="att-cal__doc-more">+${docs.length - 1}</span>` : ''}</button>`;
  }

  function renderCalCell(r) {
    const A = App.AttStatus;
    const d = Number(r.date.split('-')[2]);
    const wd = new Date(r.date).getDay();
    const wdCls = wd === 0 ? 'is-sun' : wd === 6 ? 'is-sat' : '';
    const today = r.date === A.TODAY ? 'is-today' : '';
    const docMark = docMarkHTML(r.date);
    const chip = shiftChipLocal(r.shift);

    if (r.kind === 'holiday') {
      return `<div class="att-cal__cell att-cal__cell--off ${wdCls} ${today}">
        <div class="att-cal__day-row"><span class="att-cal__day">${d}</span><span class="att-cal__day-tail">${docMark}</span></div>
        <div class="att-cal__label t-muted">주말</div>
      </div>`;
    }
    if (r.kind === 'att') {
      const leaveTxt = (A && A.calLeaveLabel) ? A.calLeaveLabel(r) : `휴가: ${esc(r.label)}`;
      const leaveBlocks = [ blockHTML('att-cal__block--leave', leaveTxt, r.label) ];
      if (r.checkIn) leaveBlocks.push(blockHTML(shiftColorCls(r.shift), `출근 ${esc(r.checkIn)} 퇴근 ${esc(r.checkOut)}`, `출근 ${r.checkIn} · 퇴근 ${r.checkOut}`));
      return `<div class="att-cal__cell ${wdCls} ${today}">
        <div class="att-cal__day-row"><span class="att-cal__day">${d}</span><span class="att-cal__day-tail">${chip}${docMark}</span></div>
        <div class="att-cal__blocks">${leaveBlocks.join('')}</div>
      </div>`;
    }
    if (r.kind === 'future') {
      return `<div class="att-cal__cell att-cal__cell--future ${wdCls}">
        <div class="att-cal__day-row"><span class="att-cal__day">${d}</span><span class="att-cal__day-tail">${chip}${docMark}</span></div>
      </div>`;
    }
    /* 상태 블록(bar) 스택 — 출퇴근/지각/조퇴/연장/야간을 색상 블록으로 쌓아 즉시 인지 */
    const mm = shiftMismatch(r);
    const half = halfHint(r);
    const blocks = [];
    /* 1) 출퇴근 블록 — 평소엔 근무조 색상. 근무조 불일치 또는 반차 미신청이면 경고(찐 다홍) 블록 +
          느낌표(!). 경고 텍스트는 셀에 두지 않고, 블록을 누르면 안내 모달에서 상세 확인. */
    if (mm || half) {
      blocks.push(warnBlockHTML(r.checkIn, r.checkOut, {
        date: r.date,
        mm: mm ? { code: mm.code, sched: mm.sched, actual: mm.actual } : null,
        half: half || null,
      }));
    } else {
      blocks.push(blockHTML(shiftColorCls(r.shift), `출근 ${esc(r.checkIn)} 퇴근 ${esc(r.checkOut)}`, `출근 ${r.checkIn} · 퇴근 ${r.checkOut}`));
    }
    /* 2) 지각/조퇴/연장/야간 — 각각 블록으로 누적 (지각은 분, 연장/야간은 시간) */
    if (r.isLate)            blocks.push(blockHTML('att-cal__block--late',  `지각 ${r.lateMin || 0}분`));
    if (r.isEarly)           blocks.push(blockHTML('att-cal__block--early', `조퇴 ${r.earlyMin || 0}분`));
    if (r.ot && r.ot.extra)  blocks.push(blockHTML('att-cal__block--ot',    `연장 ${r.ot.extra}h`));
    if (r.ot && r.ot.night)  blocks.push(blockHTML('att-cal__block--night', `야간 ${r.ot.night}h`));
    return `
      <div class="att-cal__cell ${wdCls} ${today}">
        <div class="att-cal__day-row">
          <span class="att-cal__day">${d}</span>
          <span class="att-cal__day-tail">${chip}${docMark}</span>
        </div>
        <div class="att-cal__blocks">
          ${blocks.join('')}
        </div>
      </div>
    `;
  }

  function renderAll(pageEl) {
    pageEl.querySelector('[data-mw-tabbar]').innerHTML = renderTabBar();
    /* 근태 현황 탭에서만 월 이동·뷰 토글 toolbar 노출. 신청 현황 탭은 toolbar/그리드가 본문. */
    const headEl = pageEl.querySelector('[data-mw-head]');
    headEl.innerHTML = STATE.level === 'status' ? renderHead() : '';
    headEl.style.display = STATE.level === 'status' ? '' : 'none';
    /* 신청 현황 탭 — 인사 발령/계약 관리 목록과 동일하게 흰 배경 + 풀높이 그리드 레이아웃 */
    const bodyEl = pageEl.querySelector('[data-mw-body]');
    bodyEl.classList.toggle('att-page__body--apps', STATE.level === 'apps');
    bodyEl.innerHTML = renderBody();
    /* 캘린더 범례 — 근태 현황 탭 + 캘린더 뷰일 때만 페이지 하단 고정 바로 노출 */
    const legendSlot = pageEl.querySelector('[data-mw-legend]');
    if (legendSlot) legendSlot.innerHTML = (STATE.level === 'status' && STATE.span !== 'week' && STATE.view === 'cal') ? calLegend() : '';
    ensureJobcatFab(pageEl);
    updateJobcatFab(pageEl);
  }

  /* 근무조 불일치 지연 출근 사유서 — 전자결재(사유서 양식) 상신. (대시보드 / 캘린더 안내 모달 공용)
     mm(선택): { code, sched, actual } 가 있으면 지연 출근 상세를 사유서 본문에 미리 채운다. */
  function openReasonApproval(date, mm) {
    if (typeof App.openSystemApprovalModal !== 'function') {
      window.toast && window.toast('사유서 작성 화면을 준비 중입니다.', 'info');
      return;
    }
    const opts = {
      docName: '근무조 불일치 사유서',
      titlePrefix: '사유서',
      title: `지연 출근 사유서 — ${fmtD(date)}`,
      onSubmit() { window.toast && window.toast('사유서가 상신되었습니다.', 'success'); },
    };
    if (mm) {
      const shift = (App.AttShifts && App.AttShifts.get) ? App.AttShifts.get(mm.code) : null;
      const shiftName = (shift && shift.label) ? `${mm.code} ${shift.label}` : mm.code;
      const s = toMin(mm.sched), a = toMin(mm.actual);
      const diffMin = (s != null && a != null) ? a - s : null;
      const diffTxt = diffMin == null ? '' : (diffMin > 0 ? ` (${diffMin}분 지연)` : ` (${-diffMin}분 이른 출근)`);
      opts.defaultReason = '지연 출근';
      opts.content =
        `[근무조 불일치 — 지연 출근]\n`
        + `· 일자: ${fmtD(date)}\n`
        + `· 등록 근무조: ${shiftName} (${mm.sched} 시작)\n`
        + `· 실제 출근: ${mm.actual}${diffTxt}\n`
        + `· 사유: `;
    }
    App.openSystemApprovalModal(opts);
  }

  /* 근무조 불일치 안내(카드) 마크업 */
  function mmNoticeHTML(mm) {
    const shift = (App.AttShifts && App.AttShifts.get) ? App.AttShifts.get(mm.code) : null;
    const shiftName = (shift && shift.label) ? `${mm.code} ${shift.label}` : mm.code;
    const s = toMin(mm.sched), a = toMin(mm.actual);
    const diffMin = (s != null && a != null) ? a - s : null;
    const diffTxt = diffMin == null ? '' : (diffMin > 0 ? `${diffMin}분 지연 출근` : `${-diffMin}분 이른 출근`);
    return `
      <div class="att-notice">
        <div class="att-notice__hd"><span class="att-notice__ico">!</span>근무조 불일치<span class="att-notice__tag">확인 필요</span></div>
        <div class="att-notice__bd">
          <p class="att-notice__desc">등록된 근무조 시작시간과 실제 출근시간이 다릅니다. 착오가 아니라면 지연 출근 사유서를 작성해 주세요.</p>
          <dl class="att-notice__dl">
            <dt>등록 근무조</dt><dd>${esc(shiftName)} <span class="t-muted">(${esc(mm.sched)} 시작)</span></dd>
            <dt>실제 출근</dt><dd class="is-danger">${esc(mm.actual)}${diffTxt ? ` <span class="t-muted" style="font-weight:var(--fw-regular);">· ${esc(diffTxt)}</span>` : ''}</dd>
          </dl>
          <div class="att-notice__act"><button class="btn btn--sm btn--primary" type="button" data-mw-mm-reason>사유서 작성</button></div>
        </div>
      </div>`;
  }
  /* 반차 미신청 안내(카드) 마크업 */
  function halfNoticeHTML(half) {
    const hl = halfLabel(half);
    return `
      <div class="att-notice">
        <div class="att-notice__hd"><span class="att-notice__ico">!</span>${esc(hl)} 미신청<span class="att-notice__tag">확인 필요</span></div>
        <div class="att-notice__bd">
          <p class="att-notice__desc">${esc(hl)} 사용 정황이 있으나 휴가 신청서가 등록되지 않았습니다. 나의 연차현황에서 휴가 신청서를 작성해 주세요.</p>
          <div class="att-notice__act"><button class="btn btn--sm btn--primary" type="button" data-mw-half-apply>휴가 신청</button></div>
        </div>
      </div>`;
  }

  /* 근태 안내 모달 — 타이틀 '안내'. 근무조 불일치 / 반차 미신청 이슈를 카드로 표시.
     한 날에 둘 다 겹치면 두 카드를 세로로 함께 노출한다. payload = { date, mm, half } */
  function openAttNoticeModal(p) {
    const dateDisp = fmtD(p.date);
    const cards = [];
    if (p.mm)   cards.push(mmNoticeHTML(p.mm));
    if (p.half) cards.push(halfNoticeHTML(p.half));
    if (!cards.length) return;

    const prev = document.getElementById('mw-notice-modal'); if (prev) prev.remove();
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="modal-backdrop is-open" id="mw-notice-modal" style="z-index:1200;">
        <div class="modal" style="width:92vw;max-width:460px;display:flex;flex-direction:column;">
          <div class="modal__header">
            <div class="modal__title">안내</div>
            <button class="modal__close" type="button" data-mw-notice-close aria-label="닫기">✕</button>
          </div>
          <div class="modal__body">
            <p style="margin:0 0 14px;color:var(--color-text);line-height:1.6;">
              <strong>${esc(dateDisp)}</strong> 근태에 확인이 필요한 항목이 ${cards.length > 1 ? `<strong style="color:var(--color-danger);">${cards.length}건</strong> ` : ''}있습니다.
            </p>
            ${cards.join('')}
          </div>
          <div class="modal__footer">
            <button class="btn btn--sm" type="button" data-mw-notice-close>닫기</button>
          </div>
        </div>
      </div>`;
    const backdrop = wrap.firstElementChild;
    document.body.appendChild(backdrop);
    document.body.style.overflow = 'hidden';
    function close() {
      backdrop.remove();
      if (!document.querySelector('.modal-backdrop.is-open')) document.body.style.overflow = '';
    }
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.closest('[data-mw-notice-close]')) { close(); return; }
      if (e.target.closest('[data-mw-mm-reason]'))  { close(); openReasonApproval(p.date, p.mm); return; }
      /* 오후 반차 미신청 → 나의 연차현황의 '휴가 신청' 모달 재사용 (App.AttStatus.openApplyModal('hol')) */
      if (e.target.closest('[data-mw-half-apply]')) { close(); App.AttStatus && App.AttStatus.openApplyModal && App.AttStatus.openApplyModal('hol'); return; }
    });
  }

  function bind(pageEl) {
    if (pageEl.dataset.mwBound === '1') return;
    pageEl.dataset.mwBound = '1';
    pageEl.addEventListener('click', e => {
      const A = App.AttStatus;

      /* Level 1 탭 전환 (근태 현황 / 근태 신청 현황) */
      const lvl = e.target.closest('[data-mw-level]');
      if (lvl) { STATE.level = lvl.dataset.mwLevel; renderAll(pageEl); return; }

      /* 직군(사원 유형) 전환 (데모 FAB) — 근무조 변경 신청 버튼 노출 차이 확인 */
      const jc = e.target.closest('[data-mw-jobcat]');
      if (jc) {
        if (jc.dataset.mwJobcat !== STATE.jobCat) {
          STATE.jobCat = jc.dataset.mwJobcat;
          if (App.AttStatus && App.AttStatus.ME) App.AttStatus.ME.jobCat = STATE.jobCat;
          renderAll(pageEl);
        }
        return;
      }

      /* 일자별 기록 정렬 전환 */
      if (e.target.closest('[data-mw-daily-sort]')) { STATE.dailySort = STATE.dailySort === 'desc' ? 'asc' : 'desc'; renderAll(pageEl); return; }

      /* 신청 내역 월 이동 */
      if (e.target.closest('[data-mw-app-prev]'))  { STATE.appYm = shiftMonth(STATE.appYm || A.TODAY.slice(0, 7), -1); STATE.appPage = 1; renderAll(pageEl); return; }
      if (e.target.closest('[data-mw-app-next]'))  { STATE.appYm = shiftMonth(STATE.appYm || A.TODAY.slice(0, 7), +1); STATE.appPage = 1; renderAll(pageEl); return; }
      if (e.target.closest('[data-mw-app-today]')) { STATE.appYm = A.TODAY.slice(0, 7); STATE.appPage = 1; renderAll(pageEl); return; }

      /* 신청 내역 페이지 이동 */
      const pg = e.target.closest('[data-mw-page]');
      if (pg && !pg.disabled) {
        const p = Number(pg.dataset.mwPage);
        if (Number.isFinite(p)) { STATE.appPage = p; renderAll(pageEl); }
        return;
      }

      /* 신청 회수(승인 전) / 취소 신청(승인 후, 전자결재) */
      const wd = e.target.closest('[data-mw-withdraw]');
      if (wd) { e.stopPropagation(); A.withdrawApp && A.withdrawApp(wd.dataset.mwWithdraw, () => renderAll(pageEl)); return; }
      const cc = e.target.closest('[data-mw-cancel]');
      if (cc) { e.stopPropagation(); A.requestCancelApp && A.requestCancelApp(cc.dataset.mwCancel, () => renderAll(pageEl)); return; }

      /* 품의서 상세 — 캘린더 셀 배지 / 신청 현황 '상세' 버튼 모두 동일 모달 (공용 모달) */
      const appDoc = e.target.closest('[data-att-doc-open]');
      if (appDoc) { e.stopPropagation(); A.openDocModal && A.openDocModal(appDoc.dataset.attDocOpen); return; }
      const appRow = e.target.closest('[data-mw-app-row]');
      if (appRow && !e.target.closest('button, a, input, select, textarea, label')) {
        const sel = window.getSelection && window.getSelection();
        if (sel && sel.type === 'Range' && String(sel).length > 0) return;
        A.openDocModal && A.openDocModal(appRow.dataset.mwAppRow);
        return;
      }

      /* 지각/조퇴 KPI 카드 클릭 → 아래 근태 상세내역을 해당 기록만으로 필터. 같은 카드 재클릭 시 해제. */
      const leClear = e.target.closest('[data-mw-le-clear]');
      if (leClear) { STATE.dailyFilter = null; renderAll(pageEl); return; }
      const leCard = e.target.closest('[data-mw-le]');
      if (leCard) {
        const kind = leCard.dataset.mwLe;
        STATE.dailyFilter = (STATE.dailyFilter === kind) ? null : kind;
        renderAll(pageEl);
        return;
      }

      /* 월간/주간 토글 */
      const spanBtn = e.target.closest('[data-mw-span]');
      if (spanBtn) { const sp = spanBtn.dataset.mwSpan; if (sp !== STATE.span) { STATE.span = sp; STATE.dailyFilter = null; if (sp === 'week') STATE.weekStart = null; renderAll(pageEl); } return; }

      /* 월/주 이동 — 주간 모드면 같은 콘트롤러가 주 단위로 동작 */
      const isWeek = STATE.span === 'week';
      if (e.target.closest('[data-mw-ym-prev]')) { STATE.dailyFilter = null; if (isWeek) shiftWeekBy(-1); else STATE.ym = shiftMonth(STATE.ym, -1); renderAll(pageEl); return; }
      if (e.target.closest('[data-mw-ym-next]')) { STATE.dailyFilter = null; if (isWeek) shiftWeekBy(+1); else STATE.ym = shiftMonth(STATE.ym, +1); renderAll(pageEl); return; }
      if (e.target.closest('[data-mw-today]'))   { STATE.dailyFilter = null; STATE.ym = A.TODAY.slice(0, 7); STATE.weekStart = null; renderAll(pageEl); return; }
      const v = e.target.closest('[data-mw-view]');
      if (v && !v.disabled) { STATE.view = v.dataset.mwView; STATE.dailyFilter = null; renderAll(pageEl); return; }

      if (e.target.closest('[data-mw-refresh]')) {
        /* 캐시 비우기 — App.AttStatus.records 는 외부에서 접근 불가하므로 toast로만 안내.
           실제 새로고침은 페이지 재진입 또는 권한자 화면의 새로고침 사용. */
        STATE.lastRefreshAt = A.nowHMS();
        renderAll(pageEl);
        window.toast && window.toast('나의 근태현황을 갱신했습니다.', 'success');
        return;
      }

      /* 반차 미신청 안내 → 나의 연차현황의 '휴가 신청' 모달 재사용 */
      if (e.target.closest('[data-mw-half]')) {
        A.openApplyModal && A.openApplyModal('hol');
        return;
      }

      /* 캘린더 출퇴근 경고 블록(!) 클릭 → 안내 모달 (근무조 불일치 / 반차 미신청, 겹치면 함께) */
      const warnEl = e.target.closest('[data-mw-warn]');
      if (warnEl) {
        openAttNoticeModal({
          date: warnEl.dataset.mwWarn,
          mm:   warnEl.dataset.mmCode ? { code: warnEl.dataset.mmCode, sched: warnEl.dataset.mmSched, actual: warnEl.dataset.mmActual } : null,
          half: warnEl.dataset.warnHalf || null,
        });
        return;
      }

      /* 대시보드(표) 뷰의 근무조 불일치 → 사유서 작성 (전자결재 상신) */
      const reason = e.target.closest('[data-mw-reason]');
      if (reason) { openReasonApproval(reason.dataset.mwReason); return; }

      /* 신청 액션 — 근태 신청 / 초과근무 신청(상단 탭바) + 근무조 변경 신청(toolbar).
         모달 상신 처리 후 '근태 신청 현황' 탭은 진입 시 myApps() 를 새로 읽어 최신 내역을 반영한다. */
      const act = e.target.closest('[data-mw-act]');
      if (act) {
        const a = act.dataset.mwAct;
        if (a === 'apply-att')        A.openApplyModal && A.openApplyModal('att');
        else if (a === 'apply-ot')    A.openOtModal && A.openOtModal();
        else if (a === 'shift-change') A.openShiftChangeModal && A.openShiftChangeModal();
        return;
      }
    });

    /* 신청 내역 페이지당 건수 변경 */
    pageEl.addEventListener('change', e => {
      const ps = e.target.closest('[data-mw-pagesize]');
      if (ps) { STATE.appPageSize = Number(ps.value) || 20; STATE.appPage = 1; renderAll(pageEl); }
    });

    /* 연/월 피커(App.YmPicker) 월 선택 — 토글/연이동/바깥클릭은 전역 컨트롤러가 처리 */
    pageEl.addEventListener('ympick:change', e => {
      const { name, ym } = e.detail;
      if (name === 'status') { STATE.ym = ym; STATE.dailyFilter = null; renderAll(pageEl); }
      else if (name === 'apps') { STATE.appYm = ym; STATE.appPage = 1; renderAll(pageEl); }
    });
  }

  /* ============ 직군(사원 유형) 전환 토글 — 우측 하단 floating (데모) ============ */
  function ensureJobcatFab(pageEl) {
    if (pageEl.querySelector('[data-mw-jobcat-fab]')) return;
    const fab = document.createElement('div');
    fab.setAttribute('data-mw-jobcat-fab', '');
    fab.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:900;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-pill);box-shadow:var(--shadow-md);padding:6px 10px;display:flex;align-items:center;gap:8px;';
    fab.innerHTML = `
      <span style="font-size:var(--fs-xs);color:var(--color-text-muted);">사원 유형</span>
      ${JOBCATS.map(j => `<button type="button" class="btn btn--xs" data-mw-jobcat="${j.key}">${j.label}</button>`).join('')}`;
    pageEl.appendChild(fab);
  }
  function updateJobcatFab(pageEl) {
    pageEl.querySelectorAll('[data-mw-jobcat]').forEach(b => {
      b.classList.toggle('btn--primary', b.dataset.mwJobcat === STATE.jobCat);
    });
  }

  function initPage() {
    const pageEl = document.getElementById('page-att-my-work');
    if (!pageEl) return;
    pageEl.__onShow = () => {
      if (!ensureDeps()) {
        pageEl.innerHTML = `<div style="padding:24px;color:var(--color-text-muted);">근태 현황 모듈 로드 중...</div>`;
        return;
      }
      const A = App.AttStatus;
      if (!STATE.ym) STATE.ym = A.TODAY.slice(0, 7);
      if (!pageEl.dataset.mwShellMounted) {
        pageEl.dataset.mwShellMounted = '1';
        renderShell(pageEl);
        bind(pageEl);
        STATE.lastRefreshAt = A.nowHMS();
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
