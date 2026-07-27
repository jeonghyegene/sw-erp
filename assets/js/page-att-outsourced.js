/* =========================================================
 * Page: 근태 > 근태 관리 > 도급직 근태현황
 *
 *   목적 — 도급직(empType='outsourced')만 필터하여, 소속회사(협력사) 단위로
 *          월 근태 집계 / 근태 상세내역을 다운로드한다. (도급비 정산용)
 *
 *   레이아웃 — 「부서별 근태현황(page-att-status)」의 우측 패널 레이아웃을 그대로 재사용.
 *     · 헤더(att-tb): 조회 월 피커 + 이전/오늘/다음 + 소속회사 필터
 *     · 본문       : 근태 통계 요약(합계) + 직원별 월 집계 테이블 + 다운로드 2종
 *
 *   엔진 — 레코드/집계/다운로드/직원 상세 모달은 App.AttStatus 를 재사용(단일 진실원).
 *          도급직 대상·소속회사 축만 본 파일에서 결정. 집계 항목은 부서별 근태현황과 100% 동일.
 *
 *   소속회사 마스터 — App.HRInfoMgmt.contractCompanies() (임직원 등록 화면과 동일 소스).
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  function A() { return App.AttStatus; }

  /* ============ Helper ============ */
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function shiftMonth(ym, delta) {
    let [y, m] = ym.split('-').map(Number); m += delta;
    while (m <= 0) { m += 12; y -= 1; } while (m > 12) { m -= 12; y += 1; }
    return `${y}-${pad2(m)}`;
  }
  /* 'YYYY-MM' → 'YY/MM' (표시 전용) */
  function fmtYM(s) {
    const m = String(s || '').match(/^(\d{4})-(\d{2})/);
    return m ? `${m[1].slice(2)}/${m[2]}` : s;
  }
  /* 'YYYY-MM-DD' → 'YY/MM/DD' (표시 전용) */
  function fmtDisp(s) {
    const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1].slice(2)}/${m[2]}/${m[3]}` : s;
  }
  function parseYMD(s) { const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(); }
  function ymd(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

  /* ============ 주간/월간/연간 — 부서별 근태현황(전사 뷰)과 동일 로직 ============ */
  function mondayOf(dateStr) { const d = parseYMD(dateStr); const wd = d.getDay(); const diff = (wd === 0 ? 6 : wd - 1); return ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff)); }
  function todayYm() { return (A() && A().TODAY ? A().TODAY.slice(0, 7) : STATE.ym); }
  function defaultWeekMonday() {
    const today = (A() && A().TODAY) ? A().TODAY : (STATE.ym + '-01');
    return (STATE.ym === today.slice(0, 7)) ? mondayOf(today) : mondayOf(STATE.ym + '-01');
  }
  function curWeekMonday() { return STATE.weekMonday || defaultWeekMonday(); }
  function weekDates(monday) { const b = parseYMD(monday); const out = []; for (let i = 0; i < 7; i++) out.push(ymd(new Date(b.getFullYear(), b.getMonth(), b.getDate() + i))); return out; }
  function weekOfMonthInfo(monday) { const b = parseYMD(monday); const thu = new Date(b.getFullYear(), b.getMonth(), b.getDate() + 3); return { ym: `${thu.getFullYear()}-${pad2(thu.getMonth() + 1)}`, week: Math.floor((thu.getDate() - 1) / 7) + 1 }; }
  function shiftWeek(delta) { const b = parseYMD(curWeekMonday()); const nx = new Date(b.getFullYear(), b.getMonth(), b.getDate() + 7 * delta); STATE.weekMonday = ymd(nx); STATE.ym = `${nx.getFullYear()}-${pad2(nx.getMonth() + 1)}`; }
  function shiftYear(delta) { STATE.ym = `${(+STATE.ym.slice(0, 4)) + delta}-${STATE.ym.slice(5, 7)}`; }

  /* 기간 스코프 레코드/집계 — getRecords + monthStats 재사용(엔진). 주=7일 필터, 연=12개월 합산 */
  function periodRecords(empId) {
    if (STATE.mode === 'week') {
      const dates = new Set(weekDates(curWeekMonday()));
      const months = Array.from(new Set(Array.from(dates).map(d => d.slice(0, 7))));
      const out = []; months.forEach(mm => A().getRecords(empId, mm).forEach(r => { if (dates.has(r.date)) out.push(r); })); return out;
    }
    if (STATE.mode === 'year') {
      const y = STATE.ym.slice(0, 4); const out = [];
      for (let m = 1; m <= 12; m++) A().getRecords(empId, `${y}-${pad2(m)}`).forEach(r => out.push(r)); return out;
    }
    return A().getRecords(empId, STATE.ym);
  }
  function periodStats(empId) { return A().monthStats(periodRecords(empId)); }
  /* 기간 라벨(툴바·타이틀) / 파일명 태그 */
  function periodLabel() {
    if (STATE.mode === 'week') { const wk = weekOfMonthInfo(curWeekMonday()); return `${fmtYM(wk.ym)} ${wk.week}주차`; }
    if (STATE.mode === 'year') return `${STATE.ym.slice(0, 4)}년`;
    return fmtYM(STATE.ym);
  }
  function periodTag() {
    if (STATE.mode === 'week') return curWeekMonday().replace(/-/g, '');
    if (STATE.mode === 'year') return STATE.ym.slice(0, 4);
    return STATE.ym.replace('-', '');
  }

  /* ============ STATE ============ */
  const STATE = {
    ym:      (A() && A().TODAY ? A().TODAY.slice(0, 7) : '2026-05'),
    company: '',        /* '' = 전체 도급직 / 그 외 = 소속회사명 */
    mode:    'month',   /* 'week' | 'month' | 'year' — 부서별 근태현황(전사)과 동일 */
    weekMonday: null,   /* 주간 모드 기준 월요일. null 이면 조회월/오늘 기준 자동 */
  };

  /* ============ 데이터 ============ */
  /* 도급직 명단 — 임직원 관리 동기화 결과(App.AttStatus.EMP_LIST)에서 outsourced 만 추출 */
  function outsourcedAll() {
    const list = (A() && A().EMP_LIST) || [];
    return list.filter(e => e && e.empType === 'outsourced');
  }
  /* 소속회사 옵션 — 임직원 등록 화면과 동일 마스터. 없으면 도급직 명단의 distinct 로 폴백. */
  function companyOptions() {
    const h = window.App && App.HRInfoMgmt;
    let cos = (h && typeof h.contractCompanies === 'function') ? h.contractCompanies() : [];
    if (!cos || !cos.length) {
      const seen = new Set(); cos = [];
      outsourcedAll().forEach(e => { if (e.contractCompany && !seen.has(e.contractCompany)) { seen.add(e.contractCompany); cos.push(e.contractCompany); } });
    }
    return cos;
  }
  /* 현재 필터가 적용된 도급직 명단 */
  function targetEmps() {
    const all = outsourcedAll();
    return STATE.company ? all.filter(e => e.contractCompany === STATE.company) : all;
  }
  function scopeName() { return STATE.company || '도급직 전체'; }

  /* ============ 다운로드 — 부서별 근태현황과 동일 포맷(집계 항목 100% 동일) ============
     엔진 함수는 App.AttStatus 재사용. '부서' 컬럼은 도급직 원 소속부서(homeDept)를 사용. */
  function shiftLabelOf(e) {
    const sh = App.AttShifts && App.AttShifts.get && App.AttShifts.get(e.shift);
    return sh ? (sh.label || sh.code) : '';
  }
  const _kindLabel = () => (STATE.mode === 'week' ? '주' : STATE.mode === 'year' ? '연' : '월');
  /* [근태 집계 다운로드] — 대상 도급직의 기간(주/월/연) 요약 1개 파일 */
  function dlMonth() {
    const emps = targetEmps();
    if (!emps.length) { window.toast && window.toast('집계할 인원이 없습니다.', 'warning'); return; }
    const head = ['사번', '성명', '소속회사', '부서', '근무조', '근무일', '지각(회)', '지각(분)', '조퇴(회)', '조퇴(분)', '결근(일)', '연장(h)', '야간(h)', '야간연장(h)', '휴일(h)'];
    const body = emps.map(e => {
      const st = periodStats(e.id);
      return [e.id, e.name, e.contractCompany || '', e.homeDept || '', shiftLabelOf(e), st.workDays, st.lateCnt, st.lateMin,
        st.earlyCnt, st.earlyMin, st.absCnt, st.otExtra.toFixed(1), st.otNight.toFixed(1),
        (st.otNightExtra || 0).toFixed(1), st.otHoliday.toFixed(1)];
    });
    const fn = `도급직근태${_kindLabel()}집계_${scopeName()}_${periodTag()}.csv`;
    App.csvDownload(fn, [head].concat(body), { context: `도급직 근태 ${_kindLabel()} 집계` });
  }
  /* 특정 직원의 기간 일자별 상세 행 — 월/연은 empDailyBody 합산, 주는 7일 필터 */
  function empDetailRows(empId) {
    if (STATE.mode === 'week') {
      const dates = new Set(weekDates(curWeekMonday()));
      const months = Array.from(new Set(Array.from(dates).map(d => d.slice(0, 7))));
      const rows = [];
      months.forEach(mm => A().empDailyBody(empId, mm).forEach(r => { if (dates.has(r[0])) rows.push(r); }));
      return rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    }
    if (STATE.mode === 'year') {
      const y = STATE.ym.slice(0, 4); const rows = [];
      for (let m = 1; m <= 12; m++) A().empDailyBody(empId, `${y}-${pad2(m)}`).forEach(r => rows.push(r));
      return rows;
    }
    return A().empDailyBody(empId, STATE.ym);
  }
  /* [근태 상세내역 다운로드] — 대상 도급직별 일자별 상세를 직원별 섹션으로 1개 파일 */
  function dlDetail() {
    const emps = targetEmps();
    if (!emps.length) { window.toast && window.toast('대상 인원이 없습니다.', 'warning'); return; }
    const DAILY_HEAD = A().DAILY_HEAD;
    const rows = [];
    emps.forEach((e, idx) => {
      if (idx > 0) { rows.push([]); rows.push([]); }   /* 직원 간 구분(빈 줄) */
      const label = shiftLabelOf(e);
      rows.push([`■ ${e.name} (${e.id}) · ${e.contractCompany || ''}${e.homeDept ? ' · ' + e.homeDept : ''}${label ? ' · ' + label : ''} · ${periodLabel()}`]);
      rows.push(DAILY_HEAD);
      empDetailRows(e.id).forEach(r => rows.push(r));
    });
    const fn = `도급직근태상세내역_${scopeName()}_${periodTag()}.csv`;
    App.csvDownload(fn, rows, { context: '도급직 근태 상세내역' });
  }

  /* ============ 렌더 ============ */
  function renderHead() {
    const isYear = STATE.mode === 'year';
    const isWeek = STATE.mode === 'week';
    let weekLabel = '';
    if (isWeek) {
      const mon = curWeekMonday(); const ds = weekDates(mon); const wk = weekOfMonthInfo(mon);
      weekLabel = `<div class="att-tb__weekrange">${esc(fmtYM(wk.ym))} ${wk.week}주차 · ${esc(fmtDisp(ds[0]))} ~ ${esc(fmtDisp(ds[ds.length - 1]))}</div>`;
    }
    const seg = (key, label) => `<button type="button" class="tabs__tab ${STATE.mode === key ? 'is-active' : ''}" data-out-mode="${key}">${label}</button>`;
    const modeToggle = `
      <div style="flex:1;display:flex;justify-content:center;">
        <div class="tabs tabs--segmented" style="display:inline-flex;width:auto;">
          <div class="tabs__nav">${seg('week', '주간')}${seg('month', '월간')}${seg('year', '연간')}</div>
        </div>
      </div>`;
    const periodCtrl = isYear
      ? `<span class="att-tb__title" style="font-size:var(--fs-lg);font-weight:var(--fw-semibold);">${STATE.ym.slice(0, 4)}년</span>`
      : App.YmPicker.html({ name: 'out', ym: STATE.ym, todayYm: todayYm() });
    const navAria = isYear ? ['이전 해', '다음 해'] : isWeek ? ['이전 주', '다음 주'] : ['이전 달', '다음 달'];
    return `
      <div class="att-tb">
        <div class="att-tb__left">
          ${periodCtrl}
          <div class="att-tb__nav">
            <button type="button" data-out-ym-prev aria-label="${navAria[0]}">‹</button>
            <button type="button" data-out-today>오늘</button>
            <button type="button" data-out-ym-next aria-label="${navAria[1]}">›</button>
          </div>
          ${weekLabel}
        </div>
        ${modeToggle}
        <div class="att-tb__right"></div>
      </div>
    `;
  }

  /* 좌측 소속회사 트리 — 부서별 근태현황 조직도(.tree tree--selectable)와 동일 구조.
     루트 '도급직 전체' + 각 소속회사 리프. 선택 시 STATE.company 갱신. */
  /* 부서 트리와 동일하게 이모지 아이콘 사용(.tree__icon svg 사이즈 규칙이 없어 이모지가 정합). 🏢 회사 */
  function companyIcon() { return '🏢'; }
  function renderTree() {
    const all = outsourcedAll();
    const cos = companyOptions();
    const chevron = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
    const items = cos.map(c => {
      const n = all.filter(e => e.contractCompany === c).length;
      const sel = STATE.company === c ? 'is-selected' : '';
      return `<li class="tree__node is-leaf ${sel}" data-out-company="${esc(c)}">
        <div class="tree__row">
          <span class="tree__toggle"></span>
          <span class="tree__icon">${companyIcon()}</span>
          <span class="tree__label">${esc(c)} <span class="tree__count">${n}명</span></span>
        </div>
      </li>`;
    }).join('');
    const rootSel = STATE.company === '' ? 'is-selected' : '';
    return `<li class="tree__node is-open ${rootSel}" data-out-company="">
      <div class="tree__row">
        <span class="tree__toggle">${chevron}</span>
        <span class="tree__icon">${companyIcon()}</span>
        <span class="tree__label">도급직 전체 <span class="tree__count">전체 ${all.length}명</span></span>
      </div>
      <ul>${items}</ul>
    </li>`;
  }

  function renderBody() {
    const emps = targetEmps();
    if (!emps.length) {
      return `
        <div class="att-dept-head">
          <strong style="font-size:var(--fs-lg);">${esc(scopeName())}</strong>
          <span class="t-muted" style="margin-left:8px;">0명</span>
        </div>
        <div class="att-empty">${esc(scopeName())} 에 해당하는 도급직 인원이 없습니다.</div>
      `;
    }
    const rows = emps.map(e => {
      const st = periodStats(e.id);
      const shift = App.AttShifts && App.AttShifts.get(e.shift);
      return { emp: e, shift, st };
    });
    return renderList(rows);
  }

  /* 직원별 월 집계 테이블 — 부서별 근태현황 renderDeptList 레이아웃 재사용(소속회사 컬럼 추가) */
  function renderList(rows) {
    const dlIcon = (window.Icons && window.Icons.download) || '↓';
    /* 소속회사 컬럼 — '도급직 전체' 뷰에서만 노출(텍스트). 특정 회사 선택(회사별) 시에는
       모든 행이 동일 회사이므로 컬럼 자체를 생략한다. */
    const showCompany = !STATE.company;
    /* 연간은 집계만(부서별 근태현황 전사 뷰와 동일 — 상세내역은 주/월만) */
    const detailBtn = STATE.mode === 'year' ? '' :
      `<button class="btn btn--sm" type="button" data-out-detail-dl title="대상 도급직별 ${esc(periodLabel())} 근태 상세내역을 직원별 섹션으로 1개 파일에 다운로드">${dlIcon} 근태 상세내역 다운로드</button>`;
    const toolbarBtns = `
      <button class="btn btn--sm" type="button" data-out-month-dl title="대상 도급직의 ${esc(periodLabel())} 근태 요약을 1개 파일로 다운로드">${dlIcon} ${esc(_kindLabel())} 근태 집계 다운로드</button>
      ${detailBtn}`;
    return `
      <div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden;">
        <div class="toolbar">
          <div class="toolbar__left"><span class="toolbar__count">총 <strong>${rows.length}</strong>명 · ${esc(scopeName())} · ${esc(periodLabel())}</span></div>
          <div class="toolbar__right" style="display:flex;gap:6px;">
            ${toolbarBtns}
          </div>
        </div>
        <div class="grid-wrap">
          <div class="grid-scroll">
            <table class="prs-editor__table prs-editor__table--wide" style="width:100%;">
              <thead>
                <tr>
                  <th style="width:100px;">사번</th>
                  <th style="width:90px;">성명</th>
                  ${showCompany ? `<th style="width:130px;">소속회사</th>` : ''}
                  <th style="width:110px;">근무조</th>
                  <th style="text-align:right;width:64px;">근무일</th>
                  <th style="text-align:right;width:100px;">지각</th>
                  <th style="text-align:right;width:100px;">조퇴</th>
                  <th style="text-align:right;width:56px;">결근</th>
                  <th style="text-align:right;width:70px;">연장</th>
                  <th style="text-align:right;width:70px;">야간</th>
                  <th style="text-align:right;width:80px;">야간 연장</th>
                  <th style="text-align:right;width:70px;">휴일</th>
                  <th style="text-align:center;width:220px;">다운로드</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(r => `
                  <tr class="is-clickable" data-out-row="${esc(r.emp.id)}">
                    <td>${esc(r.emp.id)}</td>
                    <td><div style="display:flex;align-items:center;gap:8px;min-width:0;"><span class="ssw-tbl__ava" style="width:24px;height:24px;flex:0 0 auto;">${esc((r.emp.name || '').slice(0, 1))}</span><a href="#" data-out-emp-open="${esc(r.emp.id)}" style="color:var(--color-brand-primary);font-weight:var(--fw-medium);white-space:nowrap;">${esc(r.emp.name)}</a>${(() => { const p = [r.emp.homeDept, r.emp.rank, r.emp.position].filter(Boolean); return p.length ? `<span style="display:inline-flex;align-items:center;">${p.map(v => `<span style="color:var(--color-text-muted);font-size:var(--fs-xs);white-space:nowrap;">${esc(v)}</span>`).join(`<span style="color:var(--color-text-muted);font-size:var(--fs-xs);">·</span>`)}</span>` : ''; })()}</div></td>
                    ${showCompany ? `<td>${r.emp.contractCompany ? esc(r.emp.contractCompany) : '-'}</td>` : ''}
                    <td>${r.shift ? `<span class="pill pill--info">${esc(r.shift.label || r.shift.code)}</span>` : '-'}</td>
                    <td style="text-align:right;">${r.st.workDays}</td>
                    <td style="text-align:right;white-space:nowrap;">${r.st.lateCnt > 0 ? `<a href="#" data-out-le="late" data-out-le-emp="${esc(r.emp.id)}" title="지각 기록 보기" style="color:var(--color-warning);font-weight:var(--fw-medium);">${r.st.lateCnt}회 (${r.st.lateMin}분)</a>` : '<span style="color:var(--color-text-muted);">0회</span>'}</td>
                    <td style="text-align:right;white-space:nowrap;">${r.st.earlyCnt > 0 ? `<a href="#" data-out-le="early" data-out-le-emp="${esc(r.emp.id)}" title="조퇴 기록 보기" style="color:var(--color-warning);font-weight:var(--fw-medium);">${r.st.earlyCnt}회 (${r.st.earlyMin}분)</a>` : '<span style="color:var(--color-text-muted);">0회</span>'}</td>
                    <td style="text-align:right;color:${r.st.absCnt > 0 ? 'var(--color-danger)' : 'var(--color-text-muted)'};">${r.st.absCnt}</td>
                    <td style="text-align:right;">${r.st.otExtra.toFixed(1)}h</td>
                    <td style="text-align:right;">${r.st.otNight.toFixed(1)}h</td>
                    <td style="text-align:right;">${(r.st.otNightExtra || 0).toFixed(1)}h</td>
                    <td style="text-align:right;">${r.st.otHoliday.toFixed(1)}h</td>
                    <td style="text-align:center;white-space:nowrap;">
                      <button class="btn btn--xs" type="button" data-out-emp-daily-dl="${esc(r.emp.id)}" title="${esc(r.emp.name)} 근태 상세내역 다운로드">${dlIcon} 근태 상세내역</button>
                      <button class="btn btn--xs" type="button" data-out-emp-apps-dl="${esc(r.emp.id)}" title="${esc(r.emp.name)} 근태 신청내역(승인건) 다운로드">${dlIcon} 신청내역</button>
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

  function renderAll(pageEl) {
    pageEl.innerHTML = `
      <div class="split" style="--split-left:240px;height:100%;">
        <aside class="split__left">
          <div class="split__head"><h3>소속회사</h3></div>
          <div class="split__body" style="padding:0;display:flex;flex-direction:column;min-height:0;">
            <ul class="tree tree--selectable" style="flex:1;overflow:auto;padding:8px 10px;margin:0;">${renderTree()}</ul>
          </div>
        </aside>
        <section class="split__right">
          <header class="att-page__head">${renderHead()}</header>
          <div class="att-page__body" style="flex:1;min-height:0;overflow:auto;">${renderBody()}</div>
        </section>
      </div>
    `;
  }

  /* ============ 이벤트 ============ */
  /* 지각/조퇴 링크 → 기록 리스트 모달(엔진 재사용) */
  function openLateEarly(empId, kind) {
    const emp = targetEmps().find(e => e.id === empId) || outsourcedAll().find(e => e.id === empId);
    A().openLateEarlyModal({
      name: emp ? emp.name : '',
      periodLabel: periodLabel(),
      recs: periodRecords(empId), kind,
    });
  }
  const _INTERACTIVE = 'button, a, input, select, textarea, label';

  function bind(pageEl) {
    /* 조회 월 피커 — 월 변경 시 주간 기준 월요일 초기화 */
    pageEl.addEventListener('ympick:change', (e) => {
      if (e.detail.name !== 'out') return;
      STATE.ym = e.detail.ym; STATE.weekMonday = null; renderAll(pageEl);
    });
    pageEl.addEventListener('click', (e) => {
      /* 좌측 소속회사 트리 선택 */
      const coNode = e.target.closest('[data-out-company]');
      if (coNode) { STATE.company = coNode.dataset.outCompany || ''; renderAll(pageEl); return; }

      /* 주간/월간/연간 모드 토글 */
      const modeBtn = e.target.closest('[data-out-mode]');
      if (modeBtn) { STATE.mode = modeBtn.dataset.outMode; if (STATE.mode === 'week') STATE.weekMonday = null; renderAll(pageEl); return; }

      /* 기간 이동 — 연간=연 / 주간=주 / 월간=월 단위 */
      if (e.target.closest('[data-out-ym-prev]')) { if (STATE.mode === 'year') shiftYear(-1); else if (STATE.mode === 'week') shiftWeek(-1); else STATE.ym = shiftMonth(STATE.ym, -1); renderAll(pageEl); return; }
      if (e.target.closest('[data-out-ym-next]')) { if (STATE.mode === 'year') shiftYear(+1); else if (STATE.mode === 'week') shiftWeek(+1); else STATE.ym = shiftMonth(STATE.ym, +1); renderAll(pageEl); return; }
      if (e.target.closest('[data-out-today]'))   { STATE.ym = (A() && A().TODAY ? A().TODAY.slice(0, 7) : STATE.ym); STATE.weekMonday = null; renderAll(pageEl); return; }

      /* 다운로드 — 월 집계 / 상세내역 */
      if (e.target.closest('[data-out-month-dl]'))  { e.preventDefault(); dlMonth(); return; }
      if (e.target.closest('[data-out-detail-dl]')) { e.preventDefault(); dlDetail(); return; }

      /* 직원 개별 다운로드 */
      const dDaily = e.target.closest('[data-out-emp-daily-dl]');
      if (dDaily) { e.preventDefault(); A().dlEmpDaily(dDaily.dataset.outEmpDailyDl, STATE.ym); return; }
      const dApps = e.target.closest('[data-out-emp-apps-dl]');
      if (dApps) { e.preventDefault(); A().dlEmpApps(dApps.dataset.outEmpAppsDl, true); return; }

      /* 지각/조퇴 기록 모달 */
      const le = e.target.closest('[data-out-le]');
      if (le) { e.preventDefault(); openLateEarly(le.dataset.outLeEmp, le.dataset.outLe); return; }

      /* 성명 클릭 → 직원별 근태 현황 모달(엔진 재사용) */
      const empLink = e.target.closest('[data-out-emp-open]');
      if (empLink) { e.preventDefault(); A().openEmpDetailModal(empLink.dataset.outEmpOpen); return; }

      /* 행 클릭 → 상세 (인터랙티브 요소·텍스트 선택 중 제외) — 도메인 표준 */
      if (e.target.closest(_INTERACTIVE)) return;
      const selr = window.getSelection && window.getSelection();
      if (selr && selr.type === 'Range' && String(selr).length > 0) return;
      const row = e.target.closest('[data-out-row]');
      if (row) { A().openEmpDetailModal(row.dataset.outRow); return; }
    });
  }

  /* ============ init ============ */
  function initPage() {
    const pageEl = document.getElementById('page-att-outsourced');
    if (!pageEl) return;
    pageEl.__onShow = () => {
      if (A() && A().syncEmpList) A().syncEmpList();   /* 임직원 관리 명단과 재동기화 */
      if (!pageEl.dataset.outBound) { pageEl.dataset.outBound = '1'; bind(pageEl); }
      renderAll(pageEl);
    };
  }

  const prev = App.initPages;
  App.initPages = function () {
    if (typeof prev === 'function') prev();
    initPage();
  };
})();
