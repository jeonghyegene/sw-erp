/* =========================================================
 * Page: 근태 관리 > 연차 계획
 *
 *   「근태 현황」 레이아웃을 그대로 차용 — 좌측 조직도 + 우측(헤더 + 캘린더/대시보드 토글).
 *
 *   · 본인 시점
 *       - 툴바에서 본인에게 발생한 연차(발생 15일)를 "언제 쓸지" 계획 작성.
 *       - [내 연차 계획] 모달에서 계획 추가 / 수정 / 삭제. 잔여(발생 − 계획) 초과 차단.
 *   · 팀장 시점
 *       - 좌측 조직도에서 팀/부서 선택 → 구성원들의 연차 사용 계획을
 *         캘린더(인원 pill) / 대시보드(KPI + 목록) 로 조회.
 *
 *   ※ Mock — App.AttStatus.EMP_LIST / ME / 캘린더 헬퍼 재사용. 계획은 STATE.plans 인메모리.
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  /* 표시 전용 — 'YYYY-MM' → 'YY/MM' (데이터/비교값은 원본 ISO 유지) */
  function fmtYM(s) { s = String(s || ''); return s.length >= 7 ? s.slice(2, 4) + '/' + s.slice(5, 7) : s; }
  function nowHMS() { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; }
  function ensureDeps() { return App.AttStatus && App.AttStatus.EMP_LIST && App.AttStatus.ME; }

  const DOW_KO = ['일','월','화','수','목','금','토'];
  const GRANTED_ME = 15;   /* 본인 발생 연차(요청 사양 — 15일 보유) */

  /* type: 'full'(연차·종일) | 'am'(오전 반차) | 'pm'(오후 반차) */
  function typeLabel(t) { return t === 'am' ? '오전 반차' : t === 'pm' ? '오후 반차' : '연차'; }
  function typeShort(t) { return t === 'am' ? '오전' : t === 'pm' ? '오후' : '종일'; }
  function isHalf(t) { return t === 'am' || t === 'pm'; }

  const STATE = {
    span: 'month',            /* 'month'(월간, 기본) | 'year'(연간 다이어리) */
    view: 'cal',              /* 'cal' | 'dash' (월간 모드 내부 뷰) */
    ym: null,                 /* 'YYYY-MM' */
    plans: null,              /* lazy seed */
    form: null,               /* 모달 추가/수정 폼 draft */
    lastRefreshAt: null,
    _pageEl: null,
  };

  /* ============ 날짜 헬퍼 ============ */
  function parseYM(s) { const [y, m] = s.split('-').map(Number); return { y, m }; }
  function parseYMD(s) { const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function fmtRange(p) {
    const A = App.AttStatus;
    const f = A.fmtDateDow ? A.fmtDateDow(p.dateFrom) : p.dateFrom;
    if (p.dateFrom === p.dateTo) return f;
    const t = A.fmtDateDow ? A.fmtDateDow(p.dateTo) : p.dateTo;
    return `${f} ~ ${t}`;
  }
  /* 평일 수(주말 제외) — mock 기준 연차 일수 산정. 반차는 0.5 */
  function weekdayCount(from, to) {
    const a = parseYMD(from), b = parseYMD(to);
    if (!a || !b || b < a) return 0;
    let n = 0;
    for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
      const w = d.getDay();
      if (w !== 0 && w !== 6) n++;
    }
    return n;
  }
  function planDays(p) { return isHalf(p.type) ? 0.5 : weekdayCount(p.dateFrom, p.dateTo); }

  /* 인원별 색상 인덱스(1~6) — 캘린더 pill 색 일관 */
  function colorIdx(empId) {
    let h = 0; const s = String(empId);
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return (h % 6) + 1;
  }

  /* ============ 인원 / 계획 ============ */
  const ME = () => App.AttStatus.ME;
  /* 자기 팀(본인 소속 부서) mock 팀원 — 실 HR 데이터에 같은 부서 인원이 적어 데모용으로 보강.
     dept 는 본인 소속을 그대로 사용하여 '자기 팀만' 보기에서 함께 노출된다. (다른 화면엔 영향 없음) */
  function teamMockMembers() {
    const dept = ME().dept;
    return [
      { id: 'SW21050201', name: '김서연', dept, rank: '과장', position: '팀원', _mock: true },
      { id: 'SW21080302', name: '박준호', dept, rank: '대리', position: '팀원', _mock: true },
      { id: 'SW22110403', name: '이하늘', dept, rank: '사원', position: '팀원', _mock: true },
      { id: 'SW23020504', name: '최민지', dept, rank: '사원', position: '팀원', _mock: true },
    ];
  }
  /* 본인 + 임직원 명단 + 자기 팀 mock(중복 제거) */
  function people() {
    const me = ME();
    const list = [{ id: me.id, name: me.name, dept: me.dept, rank: me.pos, position: '팀원' }];
    const seen = new Set([me.id]);
    App.AttStatus.EMP_LIST.forEach(e => { if (!seen.has(e.id)) { seen.add(e.id); list.push(e); } });
    teamMockMembers().forEach(e => { if (!seen.has(e.id)) { seen.add(e.id); list.push(e); } });
    return list;
  }
  function buildSeedPlans() {
    const me = ME();
    const out = []; let seq = 1;
    const mk = (emp, type, from, to, memo) => out.push({
      id: 'LP-' + String(seq++).padStart(3, '0'),
      empId: emp.id, empName: emp.name, dept: emp.dept,
      type, dateFrom: from, dateTo: to, memo: memo || '',
    });
    /* 본인 — 2건(수정/삭제 데모). 발생 15일 중 일부만 계획 → 잔여 노출 */
    mk(me, 'full', '2026-06-15', '2026-06-16', '여름 휴가 1차');
    mk(me, 'am',   '2026-05-22', '2026-05-22', '오전 병원 진료');
    /* 자기 팀(같은 부서) 팀원 — 결정적 분산(5·6·7월). 기본 진입 월(5월)에 다수 노출 */
    const months = [5, 6, 7];
    const team = people().filter(e => e.dept === me.dept && e.id !== me.id);
    team.forEach((e, i) => {
      const m = months[i % 3];
      const startDay = ((i * 5) % 22) + 3;               /* 3 ~ 24 */
      const len = (i % 3 === 0) ? 2 : 1;
      const toD = new Date(2026, m - 1, startDay + len - 1);
      mk(e, (i % 4 === 0 ? 'pm' : 'full'),
         `2026-${pad2(m)}-${pad2(startDay)}`,
         `2026-${pad2(m)}-${pad2(toD.getDate())}`, '');
    });
    return out;
  }
  function getPlans() { if (!STATE.plans) STATE.plans = buildSeedPlans(); return STATE.plans; }
  function myPlans() { return getPlans().filter(p => p.empId === ME().id); }
  function myPlannedDays(excludeId) {
    return myPlans().filter(p => p.id !== excludeId).reduce((a, p) => a + planDays(p), 0);
  }
  function myRemain(excludeId) { return Number((GRANTED_ME - myPlannedDays(excludeId)).toFixed(1)); }

  /* 자기 팀(본인 소속 부서)의 인원 + 그 인원들의 계획 — 조직도 제거로 범위는 본인 소속 고정 */
  function scopeEmps() {
    const myDept = ME().dept;
    return people().filter(e => e.dept === myDept);
  }
  function scopedPlans() {
    const ids = new Set(scopeEmps().map(e => e.id));
    return getPlans().filter(p => ids.has(p.empId));
  }
  function selectedScopeName() {
    return ME().dept || '내 팀';
  }

  function shiftMonth(ym, delta) {
    const { y, m } = parseYM(ym);
    let nm = m + delta, ny = y;
    while (nm <= 0) { nm += 12; ny -= 1; }
    while (nm > 12) { nm -= 12; ny += 1; }
    return `${ny}-${pad2(nm)}`;
  }

  /* =========================================================
   *  Shell — 좌 조직도 + 우(헤더 + 본문)
   * ========================================================= */
  function renderShell(pageEl) {
    /* 조직도 제거 — 본인 소속(자기 팀) 범위로 고정, 전체 폭 단일 패널 */
    pageEl.innerHTML = `
      <div style="height:100%;display:flex;flex-direction:column;">
        <header class="att-page__head" data-lp-head></header>
        <div class="att-page__body" data-lp-body style="flex:1;min-height:0;overflow:auto;"></div>
      </div>
    `;
  }

  /* ============ 헤더(툴바) ============ */
  function renderHead() {
    const A = App.AttStatus;
    const scopeName = selectedScopeName();
    const cnt = scopeEmps().length;
    const remain = myRemain();
    const planned = myPlannedDays();
    const isYear = STATE.span === 'year';
    const year = parseYM(STATE.ym).y;
    const title = isYear ? `${year}년` : fmtYM(STATE.ym);
    const nav = isYear
      ? `<button type="button" data-lp-year-prev aria-label="이전 해">‹</button>
         <button type="button" data-lp-today>오늘</button>
         <button type="button" data-lp-year-next aria-label="다음 해">›</button>`
      : `<button type="button" data-lp-ym-prev aria-label="이전">‹</button>
         <button type="button" data-lp-today>오늘</button>
         <button type="button" data-lp-ym-next aria-label="다음">›</button>`;
    return `
      <div class="att-tb">
        <div class="att-tb__left">
          <div class="att-tb__title">${title}</div>
          <div class="att-tb__nav">${nav}</div>
          <div class="att-target-chip" style="cursor:default;">
            <span class="att-target-chip__name">${esc(scopeName)}</span>
            <span class="att-target-chip__meta">${cnt}명</span>
          </div>
        </div>
        <div class="tabs tabs--segmented" style="display:inline-flex;width:auto;flex:0 0 auto;margin-left:auto;">
          <div class="tabs__nav">
            <button type="button" class="tabs__tab ${!isYear ? 'is-active' : ''}" data-lp-span="month">월간</button>
            <button type="button" class="tabs__tab ${isYear ? 'is-active' : ''}" data-lp-span="year">연간</button>
          </div>
        </div>
        <div class="att-tb__right">
          <span class="att-plan-mychip" title="본인 발생 연차 ${GRANTED_ME}일 기준">
            내 연차 <strong>${remain}</strong><span class="t-muted">/${GRANTED_ME}일</span>
            <span class="t-muted" style="font-size:var(--fs-xs);">계획 ${planned}일</span>
          </span>
          ${isYear ? '' : `
          <div class="att-tb__views">
            ${A.VIEW_MODES.map(v => {
              const active = STATE.view === v.key ? 'is-active' : '';
              return `<button type="button" data-lp-view="${v.key}" class="${active}">${esc(v.label)}</button>`;
            }).join('')}
          </div>`}
          <button class="btn btn--primary btn--sm" type="button" data-lp-manage>
            ${(window.Icons && window.Icons.plus) || '+'} 내 연차 계획
          </button>
        </div>
      </div>
    `;
  }

  /* ============ 본문 ============ */
  function renderBody() {
    if (STATE.span === 'year') return renderYearGrid();
    if (STATE.view === 'cal') return renderCalendar();
    return renderDashboard();
  }

  /* ----- 연간 다이어리 그리드 — 가로 1~12월 / 세로 1~31일 ----- */
  const MONTH_LABELS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  function renderYearGrid() {
    const A = App.AttStatus;
    const year = parseYM(STATE.ym).y;
    const plans = scopedPlans();
    const meId = ME().id;
    const head = `<th class="lp-year__daycol">일</th>` + MONTH_LABELS.map(ml => `<th>${ml}</th>`).join('');
    let rows = '';
    for (let d = 1; d <= 31; d++) {
      let tds = `<th class="lp-year__daycol">${d}</th>`;
      for (let m = 1; m <= 12; m++) {
        const dim = A.daysInMonth(year, m);
        if (d > dim) { tds += `<td class="lp-year__cell lp-year__cell--na"></td>`; continue; }
        const ds = `${year}-${pad2(m)}-${pad2(d)}`;
        const wd = new Date(year, m - 1, d).getDay();
        const weCls = wd === 0 ? ' lp-year__cell--sun' : wd === 6 ? ' lp-year__cell--sat' : '';
        const isToday = ds === A.TODAY;
        const todayCls = isToday ? ' is-today' : '';
        const todayTag = isToday ? '<span class="lp-year__today">오늘</span>' : '';
        const day = plans.filter(p => p.dateFrom <= ds && ds <= p.dateTo);
        if (!day.length) { tds += `<td class="lp-year__cell${weCls}${todayCls}">${todayTag}</td>`; continue; }
        const mine = day.some(p => p.empId === meId);
        /* 한 줄 = 첫 인원 이름, 초과분은 +N. 전체 명단은 hover popover(data-lp-names) */
        const extra = day.length - 1;
        const cellInner = `<span class="lp-year__nms">${todayTag}${esc(day[0].empName)}${extra > 0 ? ` <span class="lp-year__more">+${extra}</span>` : ''}</span>`;
        const names = day.map(p => `${p.empName} · ${typeLabel(p.type)}${p.memo ? ' · ' + p.memo : ''}`).join('|');
        tds += `<td class="lp-year__cell lp-year__cell--has${mine ? ' is-mine' : ''}${todayCls}" data-lp-year-cell="${esc(ds)}" data-lp-names="${esc(names)}">${cellInner}</td>`;
      }
      rows += `<tr>${tds}</tr>`;
    }
    return `
      <div class="lp-year">
        <table class="lp-year__tbl">
          <thead><tr>${head}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="margin-top:8px;font-size:var(--fs-xs);color:var(--color-text-muted);">
<span class="lp-year__today" style="vertical-align:middle;">오늘</span> 오늘 · <span style="display:inline-block;width:10px;height:10px;border-radius:2px;box-shadow:inset 0 0 0 2px var(--color-brand-primary);vertical-align:middle;"></span> 본인 포함 · 주말(<span style="color:#d33;">일</span>/<span style="color:#3366cc;">토</span>)은 음영 표시 · 셀 클릭 시 상세.
      </div>
    `;
  }

  /* ----- 캘린더 ----- */
  function renderCalendar() {
    const A = App.AttStatus;
    const { y, m } = parseYM(STATE.ym);
    const days = A.daysInMonth(y, m);
    const first = new Date(y, m - 1, 1);
    const lead = first.getDay();
    const plans = scopedPlans();
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(`<div class="att-cal__cell att-cal__cell--blank"></div>`);
    for (let d = 1; d <= days; d++) cells.push(renderCalCell(`${y}-${pad2(m)}-${pad2(d)}`, d, plans));
    const total = lead + days;
    const trail = (7 - (total % 7)) % 7;
    for (let i = 0; i < trail; i++) cells.push(`<div class="att-cal__cell att-cal__cell--blank"></div>`);
    return `
      <div class="att-cal">
        <div class="att-cal__weekdays">
          ${DOW_KO.map((w, i) => `<div class="att-cal__wd ${i === 0 ? 'is-sun' : ''} ${i === 6 ? 'is-sat' : ''}">${w}</div>`).join('')}
        </div>
        <div class="att-cal__grid">${cells.join('')}</div>
        <div class="att-cal__legend">
          <span style="color:var(--color-text-muted);font-size:var(--fs-xs);">셀의 인원 표시를 클릭하면 상세를 확인할 수 있습니다.</span>
        </div>
      </div>
    `;
  }
  function renderCalCell(dateStr, d, plans) {
    const A = App.AttStatus;
    const wd = new Date(dateStr).getDay();
    const wdCls = wd === 0 ? 'is-sun' : wd === 6 ? 'is-sat' : '';
    const today = dateStr === A.TODAY ? 'is-today' : '';
    const todays = plans.filter(p => p.dateFrom <= dateStr && dateStr <= p.dateTo);
    const MAX = 3;
    const meId = ME().id;
    const pills = todays.slice(0, MAX).map(p => {
      const mine = p.empId === meId;
      const ci = colorIdx(p.empId);
      const tip = `${p.empName} · ${typeLabel(p.type)}${p.memo ? ' · ' + p.memo : ''}`;
      return `<button type="button" class="att-plan-pill att-plan-pill--c${ci} ${mine ? 'is-mine' : ''}" data-lp-pill="${esc(p.id)}" title="${esc(tip)}">${mine ? '<span class="att-plan-pill__me">본인</span>' : ''}${esc(p.empName)}<span class="att-plan-pill__tag">${esc(typeShort(p.type))}</span></button>`;
    }).join('');
    const more = todays.length > MAX ? `<span class="att-plan-more">+${todays.length - MAX}명</span>` : '';
    return `
      <div class="att-cal__cell ${wdCls} ${today}">
        <div class="att-cal__day-row"><span class="att-cal__day">${d}</span></div>
        <div class="att-plan-list">${pills}${more}</div>
      </div>
    `;
  }

  /* ----- 대시보드 ----- */
  function kpiCard(title, value, color) {
    return `
      <div style="padding:14px 16px;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);">
        <div style="font-size:var(--fs-xs);color:var(--color-text-muted);">${esc(title)}</div>
        <div style="font-size:var(--fs-2xl);font-weight:var(--fw-bold);margin-top:4px;color:${color || 'var(--color-text)'};">${value}</div>
      </div>`;
  }
  function unit(t) { return `<small style="font-size:var(--fs-sm);font-weight:var(--fw-regular);color:var(--color-text-muted);margin-left:4px;">${esc(t)}</small>`; }
  function renderDashboard() {
    const A = App.AttStatus;
    const emps = scopeEmps();
    const plans = scopedPlans().slice().sort((a, b) => a.dateFrom < b.dateFrom ? -1 : a.dateFrom > b.dateFrom ? 1 : 0);
    const totalDays = Number(plans.reduce((a, p) => a + planDays(p), 0).toFixed(1));
    const planners = new Set(plans.map(p => p.empId)).size;
    const meId = ME().id;
    const kpis = [
      { l: '대상 인원', v: `${emps.length}${unit('명')}`, c: 'var(--color-brand-primary)' },
      { l: '계획 인원', v: `${planners}${unit('명')}`, c: 'var(--color-text)' },
      { l: '총 계획 일수', v: `${totalDays}${unit('일')}`, c: 'var(--color-brand-primary)' },
      { l: '계획 건수', v: `${plans.length}${unit('건')}`, c: 'var(--color-text)' },
    ];
    const tbody = plans.length ? plans.map(p => {
      const mine = p.empId === meId;
      return `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:8px;min-width:0;">
              <span class="ssw-tbl__ava" style="width:24px;height:24px;flex:0 0 auto;">${esc((p.empName || '').slice(0, 1))}</span>
              <span style="font-weight:var(--fw-medium);white-space:nowrap;">${esc(p.empName)}</span>
              ${mine ? '<span class="pill pill--info" style="font-size:10px;">본인</span>' : ''}
            </div>
          </td>
          <td>${esc(p.dept || '-')}</td>
          <td style="text-align:center;"><span class="pill ${isHalf(p.type) ? 'pill--warning' : 'pill--info'}">${esc(typeLabel(p.type))}</span></td>
          <td>${esc(fmtRange(p))}</td>
          <td style="text-align:right;">${planDays(p)}일</td>
          <td>${esc(p.memo || '-')}</td>
          <td style="text-align:center;">${mine
            ? `<button class="btn btn--xs" type="button" data-lp-edit="${esc(p.id)}">수정</button>
               <button class="btn btn--xs btn--soft-danger" type="button" data-lp-del="${esc(p.id)}">삭제</button>`
            : '<span class="t-muted" style="font-size:var(--fs-xs);">—</span>'}</td>
        </tr>`;
    }).join('') : `<tr><td colspan="7" style="text-align:center;color:var(--color-text-muted);padding:28px;">등록된 연차 계획이 없습니다.</td></tr>`;
    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:14px;">
        ${kpis.map(k => kpiCard(k.l, k.v, k.c)).join('')}
      </div>
      <div class="table-card">
        <div class="table-card__cap">
          <strong>${esc(selectedScopeName())} 연차 계획</strong>
          <span class="t-muted" style="font-size:var(--fs-xs);">${plans.length}건</span>
        </div>
        <div class="table-card__body">
          <table class="prs-editor__table prs-editor__table--wide" style="width:100%;">
            <thead>
              <tr>
                <th style="width:140px;text-align:left;">성명</th>
                <th style="min-width:110px;text-align:left;">부서</th>
                <th style="width:90px;text-align:center;">구분</th>
                <th style="width:180px;text-align:left;">기간</th>
                <th style="width:70px;text-align:right;">일수</th>
                <th style="text-align:left;">메모</th>
                <th style="width:120px;text-align:center;">관리</th>
              </tr>
            </thead>
            <tbody>${tbody}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  /* ----- 연간 그리드 셀 hover popover — 전체 명단 표시 (스크롤 컨테이너 clip 회피 위해 body 부착) ----- */
  let _pop = null;
  function ensurePop() {
    if (_pop) return _pop;
    _pop = document.createElement('div');
    _pop.className = 'lp-year-pop';
    _pop.style.display = 'none';
    document.body.appendChild(_pop);
    return _pop;
  }
  function showPop(cell) {
    const raw = cell.getAttribute('data-lp-names') || '';
    if (!raw) return;
    const p = ensurePop();
    p.innerHTML = raw.split('|').map(n => `<div class="lp-year-pop__item">${esc(n)}</div>`).join('');
    p.style.display = 'block';
    const r = cell.getBoundingClientRect();
    const pw = p.offsetWidth, ph = p.offsetHeight;
    let left = r.left + r.width / 2 - pw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
    let top = r.bottom + 6;
    if (top + ph > window.innerHeight - 8) top = r.top - ph - 6;
    p.style.left = left + 'px';
    p.style.top = top + 'px';
  }
  function hidePop() { if (_pop) _pop.style.display = 'none'; }

  function renderAll(pageEl) {
    hidePop();
    pageEl.querySelector('[data-lp-head]').innerHTML = renderHead();
    pageEl.querySelector('[data-lp-body]').innerHTML = renderBody();
  }

  /* =========================================================
   *  내 연차 계획 모달 — 요약 + 목록(수정/삭제) + 추가/수정 폼
   * ========================================================= */
  function ensureModal() {
    if (document.getElementById('lp-modal')) return;
    const html = `
<div class="modal-backdrop" id="lp-modal" data-modal-id="lp-modal" style="z-index:1200;">
  <div class="modal modal--lg" style="width:92vw;max-width:760px;height:86vh;max-height:760px;display:flex;flex-direction:column;">
    <div class="modal__header">
      <div class="modal__title" data-lp-modal-title>내 연차 계획</div>
      <button class="modal__close" type="button" data-lp-modal-close aria-label="닫기">✕</button>
    </div>
    <div class="modal__body" data-lp-modal-body style="flex:1;min-height:0;overflow:auto;background:var(--color-surface-alt);padding:18px;"></div>
  </div>
</div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    const modal = document.getElementById('lp-modal');
    modal.addEventListener('click', onModalClick);
    modal.addEventListener('input', onModalInput);
    modal.addEventListener('change', onModalInput);
  }
  function openModal() { ensureModal(); document.getElementById('lp-modal').classList.add('is-open'); document.body.style.overflow = 'hidden'; renderModal(); }
  function closeModal() {
    const m = document.getElementById('lp-modal');
    if (m) m.classList.remove('is-open');
    if (!document.querySelector('.modal-backdrop.is-open')) document.body.style.overflow = '';
  }

  function freshForm() { return { id: null, type: 'full', from: App.AttStatus.TODAY, to: App.AttStatus.TODAY, memo: '' }; }
  function startAdd() { STATE.form = freshForm(); }
  function startEdit(id) {
    const p = myPlans().find(x => x.id === id);
    if (!p) return;
    STATE.form = { id: p.id, type: p.type, from: p.dateFrom, to: p.dateTo, memo: p.memo };
  }

  function renderModal() {
    const modal = document.getElementById('lp-modal');
    if (!modal) return;
    const me = ME();
    const planned = myPlannedDays();
    const remain = myRemain();
    modal.querySelector('[data-lp-modal-title]').textContent = '내 연차 계획';

    const rows = myPlans().slice().sort((a, b) => a.dateFrom < b.dateFrom ? -1 : 1).map(p => `
      <tr>
        <td style="text-align:center;"><span class="pill ${isHalf(p.type) ? 'pill--warning' : 'pill--info'}">${esc(typeLabel(p.type))}</span></td>
        <td>${esc(fmtRange(p))}</td>
        <td style="text-align:right;">${planDays(p)}일</td>
        <td>${esc(p.memo || '-')}</td>
        <td style="text-align:center;white-space:nowrap;">
          <button class="btn btn--xs" type="button" data-lp-edit="${esc(p.id)}">수정</button>
          <button class="btn btn--xs btn--soft-danger" type="button" data-lp-del="${esc(p.id)}">삭제</button>
        </td>
      </tr>`).join('');
    const listHTML = myPlans().length
      ? `<table class="prs-editor__table prs-editor__table--wide" style="width:100%;">
           <thead><tr>
             <th style="width:90px;text-align:center;">구분</th>
             <th style="width:170px;text-align:left;">기간</th>
             <th style="width:70px;text-align:right;">일수</th>
             <th style="text-align:left;">메모</th>
             <th style="width:120px;text-align:center;">관리</th>
           </tr></thead>
           <tbody>${rows}</tbody>
         </table>`
      : `<div style="padding:20px;text-align:center;color:var(--color-text-muted);">등록된 계획이 없습니다. 아래에서 추가하세요.</div>`;

    modal.querySelector('[data-lp-modal-body]').innerHTML = `
      <!-- 요약 -->
      <div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:14px 16px;margin-bottom:14px;">
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;font-size:var(--fs-md);">
          <span>발생 <strong>${GRANTED_ME}일</strong></span>
          <span style="color:var(--color-divider);">|</span>
          <span>계획 <strong style="color:var(--color-warning);">${planned}일</strong></span>
          <span style="color:var(--color-divider);">|</span>
          <span>잔여 <strong style="color:var(--color-brand-primary);">${remain}일</strong></span>
        </div>
      </div>

      <!-- 목록 -->
      <div class="table-card" style="margin-bottom:14px;">
        <div class="table-card__cap"><strong>계획 목록</strong><span class="t-muted" style="font-size:var(--fs-xs);">${myPlans().length}건</span></div>
        <div class="table-card__body">${listHTML}</div>
      </div>

      <!-- 추가/수정 폼 -->
      ${STATE.form ? renderForm() : `
        <div style="text-align:center;">
          <button class="btn btn--primary btn--sm" type="button" data-lp-add>${(window.Icons && window.Icons.plus) || '+'} 계획 추가</button>
        </div>`}
    `;
    if (STATE.form) {
      const formRoot = modal.querySelector('[data-lp-form]');
      if (formRoot && App.Forms) App.Forms.applyOnInput(formRoot);
    }
  }

  function renderForm() {
    const f = STATE.form;
    const editing = !!f.id;
    const days = isHalf(f.type) ? 0.5 : weekdayCount(f.from, f.to);
    const remainIfSaved = Number((GRANTED_ME - myPlannedDays(f.id) - days).toFixed(1));
    return `
      <div class="table-card" data-lp-form>
        <div class="table-card__cap"><strong>${editing ? '계획 수정' : '계획 추가'}</strong></div>
        <div class="table-card__body" style="padding:14px 16px;">
          <div class="att-apply__form">
            <div class="att-apply__row">
              <div class="att-apply__lbl">구분<span style="color:var(--color-danger);">*</span></div>
              <div class="att-apply__val">
                <select class="select" data-lp-f-type style="width:160px;">
                  <option value="full" ${f.type === 'full' ? 'selected' : ''}>연차(종일)</option>
                  <option value="am" ${f.type === 'am' ? 'selected' : ''}>오전 반차</option>
                  <option value="pm" ${f.type === 'pm' ? 'selected' : ''}>오후 반차</option>
                </select>
              </div>
            </div>
            <div class="att-apply__row">
              <div class="att-apply__lbl">기간<span style="color:var(--color-danger);">*</span></div>
              <div class="att-apply__val att-apply__val--inline">
                <input type="date" class="input" data-lp-f-from value="${esc(f.from)}" />
                <span class="t-muted" style="margin:0 6px;">~</span>
                <input type="date" class="input" data-lp-f-to value="${esc(f.to)}" ${isHalf(f.type) ? 'disabled' : ''} />
                ${isHalf(f.type) ? `<span class="t-muted" style="margin-left:8px;font-size:var(--fs-xs);">반차는 당일만 선택</span>` : ''}
              </div>
            </div>
            <div class="att-apply__row">
              <div class="att-apply__lbl">메모</div>
              <div class="att-apply__val">
                <input type="text" class="input" data-lp-f-memo value="${esc(f.memo)}" placeholder="사유·메모(선택)" style="width:100%;" />
              </div>
            </div>
            <div class="att-apply__row" style="align-items:center;">
              <div class="att-apply__lbl" style="padding-top:0;">일수</div>
              <div class="att-apply__val" style="display:flex;align-items:baseline;">
                <strong style="font-size:var(--fs-lg);color:var(--color-brand-primary);">${days}일</strong>
                <span class="t-muted" style="margin-left:10px;font-size:var(--fs-xs);">저장 시 잔여 ${remainIfSaved}일</span>
              </div>
            </div>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">
            <button class="btn btn--sm" type="button" data-lp-cancel>취소</button>
            <button class="btn btn--primary btn--sm" type="button" data-lp-save>${editing ? '수정 저장' : '추가'}</button>
          </div>
        </div>
      </div>
    `;
  }

  /* 폼 입력 → draft 갱신 + 부분 재렌더(일수 갱신) */
  function onModalInput(e) {
    if (!STATE.form) return;
    const t = e.target.closest('[data-lp-f-type]');
    const fr = e.target.closest('[data-lp-f-from]');
    const to = e.target.closest('[data-lp-f-to]');
    const mm = e.target.closest('[data-lp-f-memo]');
    if (t)  { STATE.form.type = t.value; if (isHalf(STATE.form.type)) STATE.form.to = STATE.form.from; renderModal(); return; }
    if (fr) { STATE.form.from = fr.value; if (isHalf(STATE.form.type) || STATE.form.to < fr.value) STATE.form.to = fr.value; renderModal(); return; }
    if (to) { STATE.form.to = to.value; renderModal(); return; }
    if (mm) { STATE.form.memo = mm.value; return; }   /* 메모는 재렌더 불필요 */
  }

  function onModalClick(e) {
    const modal = document.getElementById('lp-modal');
    if (e.target === modal || e.target.closest('[data-lp-modal-close]')) { closeModal(); return; }
    if (e.target.closest('[data-lp-add]'))    { startAdd(); renderModal(); return; }
    if (e.target.closest('[data-lp-cancel]')) { STATE.form = null; renderModal(); return; }
    const ed = e.target.closest('[data-lp-edit]');
    if (ed) { startEdit(ed.dataset.lpEdit); renderModal(); return; }
    const del = e.target.closest('[data-lp-del]');
    if (del) { deletePlan(del.dataset.lpDel); return; }
    if (e.target.closest('[data-lp-save]')) { savePlan(); return; }
  }

  function savePlan() {
    const f = STATE.form;
    const modal = document.getElementById('lp-modal');
    const formRoot = modal.querySelector('[data-lp-form]');
    const fromEl = formRoot.querySelector('[data-lp-f-from]');
    const toEl = formRoot.querySelector('[data-lp-f-to]');
    if (App.Forms) App.Forms.clearAll(formRoot);
    let ok = true;
    if (!f.from) { setErr(fromEl, '시작일을 선택하세요'); ok = false; }
    if (isHalf(f.type)) { f.to = f.from; }
    else {
      if (!f.to) { setErr(toEl, '종료일을 선택하세요'); ok = false; }
      else if (f.to < f.from) { setErr(toEl, '종료일은 시작일 이후여야 합니다'); ok = false; }
    }
    const days = isHalf(f.type) ? 0.5 : weekdayCount(f.from, f.to);
    if (ok && days <= 0) { setErr(fromEl, '평일 기준 사용 일수가 없습니다(주말만 선택됨)'); ok = false; }
    const rem = myRemain(f.id);   /* 본인 잔여(수정 중 항목 제외) */
    if (ok && days > rem) { setErr(isHalf(f.type) ? fromEl : toEl, `잔여 연차 ${rem}일을 초과합니다 (${days}일 신청)`); ok = false; }
    if (!ok) return;

    const me = ME();
    if (f.id) {
      const p = getPlans().find(x => x.id === f.id);
      if (p) { p.type = f.type; p.dateFrom = f.from; p.dateTo = f.to; p.memo = f.memo; }
      window.toast && window.toast('연차 계획을 수정했습니다.', 'success');
    } else {
      const seq = getPlans().length + 1;
      getPlans().push({
        id: 'LP-' + String(Date.now()).slice(-6) + '-' + seq,
        empId: me.id, empName: me.name, dept: me.dept,
        type: f.type, dateFrom: f.from, dateTo: f.to, memo: f.memo,
      });
      window.toast && window.toast('연차 계획을 추가했습니다.', 'success');
    }
    STATE.form = null;
    renderModal();
    if (STATE._pageEl) renderAll(STATE._pageEl);
  }

  function deletePlan(id) {
    const plans = getPlans();
    const i = plans.findIndex(p => p.id === id);
    if (i < 0) return;
    plans.splice(i, 1);
    if (STATE.form && STATE.form.id === id) STATE.form = null;
    window.toast && window.toast('연차 계획을 삭제했습니다.', 'success');
    renderModal();
    if (STATE._pageEl) renderAll(STATE._pageEl);
  }

  function setErr(el, msg) {
    if (el && App.Forms) App.Forms.setFieldError(el, msg);
    else window.toast && window.toast(msg, 'warning');
  }

  /* =========================================================
   *  바인딩
   * ========================================================= */
  function bind(pageEl) {
    if (pageEl.dataset.lpBound === '1') return;
    pageEl.dataset.lpBound = '1';
    /* 연간 그리드 셀 hover → 전체 명단 popover */
    pageEl.addEventListener('mouseover', e => {
      const c = e.target.closest('[data-lp-year-cell]');
      if (c) showPop(c);
    });
    pageEl.addEventListener('mouseout', e => {
      const c = e.target.closest('[data-lp-year-cell]');
      if (!c) return;
      if (e.relatedTarget && c.contains(e.relatedTarget)) return;
      hidePop();
    });
    pageEl.addEventListener('click', e => {
      /* 월간/연간 전환 */
      const span = e.target.closest('[data-lp-span]');
      if (span) { if (span.dataset.lpSpan !== STATE.span) { STATE.span = span.dataset.lpSpan; renderAll(pageEl); } return; }

      if (e.target.closest('[data-lp-ym-prev]')) { STATE.ym = shiftMonth(STATE.ym, -1); renderAll(pageEl); return; }
      if (e.target.closest('[data-lp-ym-next]')) { STATE.ym = shiftMonth(STATE.ym, +1); renderAll(pageEl); return; }
      /* 연간 — 해 단위 이동 (월 유지) */
      if (e.target.closest('[data-lp-year-prev]')) { STATE.ym = shiftMonth(STATE.ym, -12); renderAll(pageEl); return; }
      if (e.target.closest('[data-lp-year-next]')) { STATE.ym = shiftMonth(STATE.ym, +12); renderAll(pageEl); return; }
      if (e.target.closest('[data-lp-today]'))   { STATE.ym = App.AttStatus.TODAY.slice(0, 7); renderAll(pageEl); return; }

      /* 연간 그리드 셀 클릭 → 해당 일자 계획 상세(본인 포함 시 편집 진입) */
      const yc = e.target.closest('[data-lp-year-cell]');
      if (yc) {
        const ds = yc.dataset.lpYearCell;
        const day = scopedPlans().filter(p => p.dateFrom <= ds && ds <= p.dateTo);
        const mineP = day.find(p => p.empId === ME().id);
        if (mineP) { startEdit(mineP.id); openModal(); }
        else if (day.length) {
          const A = App.AttStatus;
          const dLabel = A.fmtDateDow ? A.fmtDateDow(ds) : ds;
          window.toast && window.toast(`${dLabel} · ` + day.map(p => `${p.empName}(${typeLabel(p.type)})`).join(', '), 'info');
        }
        return;
      }

      const v = e.target.closest('[data-lp-view]');
      if (v && !v.disabled) { STATE.view = v.dataset.lpView; renderAll(pageEl); return; }

      /* 툴바 [내 연차 계획] → 모달(추가 폼 닫힌 기본 상태 — 목록 + [계획 추가] 버튼) */
      if (e.target.closest('[data-lp-manage]')) { STATE.form = null; openModal(); return; }

      /* 캘린더 인원 pill 클릭 — 본인이면 수정 모달, 타인이면 안내 */
      const pill = e.target.closest('[data-lp-pill]');
      if (pill) {
        const p = getPlans().find(x => x.id === pill.dataset.lpPill);
        if (!p) return;
        if (p.empId === ME().id) { startEdit(p.id); openModal(); }
        else window.toast && window.toast(`${p.empName} · ${typeLabel(p.type)} · ${fmtRange(p)}`, 'info');
        return;
      }

      /* 대시보드 목록 — 본인 행 수정/삭제 */
      const ed = e.target.closest('[data-lp-edit]');
      if (ed) { startEdit(ed.dataset.lpEdit); openModal(); return; }
      const del = e.target.closest('[data-lp-del]');
      if (del) { deletePlan(del.dataset.lpDel); return; }
    });
  }

  function initPage() {
    const pageEl = document.getElementById('page-att-leave-plan');
    if (!pageEl) return;
    pageEl.__onShow = () => {
      if (!ensureDeps()) {
        pageEl.innerHTML = `<div style="padding:24px;color:var(--color-text-muted);">근태 현황 모듈 로드 중...</div>`;
        return;
      }
      App.AttStatus.syncEmpList && App.AttStatus.syncEmpList();
      STATE._pageEl = pageEl;
      if (!STATE.ym) STATE.ym = App.AttStatus.TODAY.slice(0, 7);
      if (!pageEl.dataset.lpShellMounted) {
        pageEl.dataset.lpShellMounted = '1';
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
