/* =========================================================
 * Page: 근태 > 업무 보고 > 나의 업무 보고
 *
 *  개요
 *   - 본인이 속한 부서의 "업무 분류"별로, 한 주(월~금) 동안 매일 어떤 업무를 했는지 작성.
 *   - 업무 분류는 부서마다 다름 → App.WorkReport.categoriesFor(dept) 단일 소스.
 *
 *  구성
 *   - toolbar: 주(週) 이동 + 작성자 칩 + [임시저장] / [제출]
 *   - 본문: 업무분류(행) × 요일(월~금, 열) 매트릭스. 각 칸에 수행 내용 입력.
 *
 *  ※ App.WorkReport — 업무보고 공용 데이터 모듈(본 파일에서 정의·노출).
 *     · 부서별 업무 분류 마스터 (근태 설정 > 업무보고 양식 에서 편집)
 *     · 주간 보고 엔트리 store (업무 보고 현황 에서 조회)
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});
  const TODAY = '2026-05-29';

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
  function parseYMD(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); }
  function mondayOf(dateStr) {
    const d = parseYMD(dateStr); const wd = d.getDay();
    d.setDate(d.getDate() + (wd === 0 ? -6 : 1 - wd));
    return ymd(d);
  }
  function shiftWeek(weekStart, deltaWeeks) { const d = parseYMD(weekStart); d.setDate(d.getDate() + deltaWeeks * 7); return ymd(d); }
  function weekDates(weekStart) {
    const out = []; const base = parseYMD(weekStart);
    for (let i = 0; i < 5; i++) { const dd = new Date(base); dd.setDate(base.getDate() + i); out.push(ymd(dd)); }
    return out;
  }
  const DOW5 = ['월', '화', '수', '목', '금'];

  /* =========================================================
   *  App.WorkReport — 공용 데이터 모듈
   * ========================================================= */
  if (!App.WorkReport) {
    /* 표준 업무 보고 항목 — 부서 미설정 시 공통 적용 */
    const DEFAULT_CATS = ['기본업무', '실천업무', '건의사항', '외근업무'];
    /* 부서별 업무 보고 항목(양식) 오버라이드 — 근태 설정 > 업무보고 양식에서 편집.
       미설정 부서는 DEFAULT_CATS(표준 4항목) 사용. */
    const FORMS = {
      '개발팀':  ['기능개발', '버그수정', '코드리뷰', '배포', '건의사항'],
      '생산1팀': ['생산계획', '작업', '설비점검', '품질', '안전'],
    };

    /* 주간 보고 엔트리 store — key: `${empId}|${weekStart}` */
    const ENTRIES = {};
    function key(empId, weekStart) { return `${empId}|${weekStart}`; }

    function empList() {
      return (App.AttStatus && App.AttStatus.EMP_LIST) ? App.AttStatus.EMP_LIST : [];
    }

    /* 결정적 시드 — 최근 2주, 일부 직원 제출 완료 */
    function seed() {
      const thisWeek = mondayOf(TODAY);
      const lastWeek = shiftWeek(thisWeek, -1);
      const emps = empList();
      emps.forEach((e, i) => {
        const cats = FORMS[e.dept] || DEFAULT_CATS;
        [lastWeek, thisWeek].forEach((wk, wi) => {
          /* 지난주: 대부분 제출 / 이번주: 약 절반만 제출 */
          const submitted = wi === 0 ? (i % 5 !== 0) : (i % 2 === 0);
          if (!submitted && wi === 1) return; /* 이번주 미작성은 엔트리 없음 */
          const dates = weekDates(wk);
          const data = {};
          cats.forEach((c, ci) => {
            data[c] = {};
            dates.forEach((dt, di) => {
              /* 결정적 더미 — 일부 칸만 채움 */
              data[c][dt] = ((ci + di + i) % 3 === 0) ? `${c} 관련 업무 진행` : '';
            });
          });
          ENTRIES[key(e.id, wk)] = {
            empId: e.id, name: e.name, dept: e.dept,
            weekStart: wk,
            status: submitted ? 'submitted' : 'draft',
            submittedAt: submitted ? `${dates[4]} 17:30` : '',
            data,
          };
        });
      });
    }
    let _seeded = false;
    function ensureSeed() { if (!_seeded) { _seeded = true; seed(); } }

    App.WorkReport = {
      DOW5,
      mondayOf, shiftWeek, weekDates,
      defaultCategories() { return DEFAULT_CATS.slice(); },
      setDefaultCategories(arr) { if (Array.isArray(arr) && arr.length) { DEFAULT_CATS.length = 0; arr.forEach(x => DEFAULT_CATS.push(x)); } },
      forms() { return Object.keys(FORMS).map(dept => ({ dept, categories: FORMS[dept].slice() })); },
      categoriesFor(dept) { return (FORMS[dept] || DEFAULT_CATS).slice(); },
      setCategories(dept, arr) { if (dept) FORMS[dept] = arr.slice(); },
      removeForm(dept) { delete FORMS[dept]; },
      list() { ensureSeed(); return Object.values(ENTRIES); },
      getEntry(empId, weekStart) { ensureSeed(); return ENTRIES[key(empId, weekStart)] || null; },
      saveEntry(empId, emp, weekStart, data, status) {
        ensureSeed();
        const dates = weekDates(weekStart);
        ENTRIES[key(empId, weekStart)] = {
          empId, name: emp.name, dept: emp.dept,
          weekStart,
          status: status || 'draft',
          submittedAt: status === 'submitted' ? `${dates[4]} ${new Date().getHours()}:${pad2(new Date().getMinutes())}` : '',
          data,
        };
        return ENTRIES[key(empId, weekStart)];
      },
    };
  }
  const WR = App.WorkReport;

  /* 업무 보고 항목 — 본인 부서 양식(없으면 표준 4항목) */
  function SECTIONS() { return WR.categoriesFor(me().dept); }

  /* ============ STATE ============ */
  const STATE = {
    weekStart: null,
    draft: null,   /* { [section]: text } */
    _status: 'none',
  };
  function me() {
    return (App.AttStatus && App.AttStatus.ME) ? App.AttStatus.ME : { id: 'SW22030101', name: '정혜진', dept: '인사팀', pos: '대리' };
  }

  function loadDraft() {
    const u = me();
    const entry = WR.getEntry(u.id, STATE.weekStart);
    const draft = {};
    SECTIONS().forEach(s => { draft[s] = (entry && entry.data && typeof entry.data[s] === 'string') ? entry.data[s] : ''; });
    STATE.draft = draft;
    STATE._status = entry ? entry.status : 'none';
  }

  /* ============ Render ============ */
  function fmtRange(weekStart) {
    const dates = WR.weekDates(weekStart);
    return `${weekStart.slice(2).replace(/-/g, '/')} ~ ${dates[4].slice(5).replace('-', '/')}`;
  }
  function renderHead() {
    const u = me();
    const statusPill = {
      submitted: '<span class="pill pill--success">제출 완료</span>',
      draft:     '<span class="pill pill--warning">임시저장</span>',
      none:      '<span class="pill pill--muted">미작성</span>',
    }[STATE._status] || '';
    return `
      <div class="att-tb">
        <div class="att-tb__left">
          <div class="att-tb__title">${esc(fmtRange(STATE.weekStart))}</div>
          <div class="att-tb__nav">
            <button type="button" data-wr-prev aria-label="이전주">‹</button>
            <button type="button" data-wr-today>이번주</button>
            <button type="button" data-wr-next aria-label="다음주">›</button>
          </div>
          <div class="att-target-chip" style="cursor:default;">
            <span class="att-target-chip__name">${esc(u.name)}</span>
            <span class="att-target-chip__meta">${esc(u.dept)}${u.pos ? ' · ' + esc(u.pos) : ''}</span>
          </div>
          ${statusPill}
        </div>
        <div class="att-tb__right">
          <button class="btn btn--sm" type="button" data-wr-save>임시저장</button>
          <button class="btn btn--sm btn--primary" type="button" data-wr-submit>제출</button>
        </div>
      </div>
    `;
  }

  function renderBody() {
    return SECTIONS().map(sec => `
      <div class="wrs__row">
        <div class="wrs__row-label">${esc(sec)}</div>
        <div class="wrs__row-body wrs__row-body--edit">
          <textarea class="wrs__input" data-wr-sec="${esc(sec)}" placeholder="${esc(sec)} 내용을 입력하세요">${esc(STATE.draft[sec] || '')}</textarea>
        </div>
      </div>`).join('');
  }

  function renderAll(pageEl) {
    pageEl.innerHTML = `
      <div class="wrm">
        <section class="wrs__main">
          <div class="wrm__head">${renderHead()}</div>
          <div class="wrs__content">${renderBody()}</div>
        </section>
      </div>`;
  }

  function bind(pageEl) {
    if (pageEl.dataset.wrBound === '1') return;
    pageEl.dataset.wrBound = '1';

    pageEl.addEventListener('click', e => {
      if (e.target.closest('[data-wr-prev]'))  { STATE.weekStart = WR.shiftWeek(STATE.weekStart, -1); loadDraft(); renderAll(pageEl); return; }
      if (e.target.closest('[data-wr-next]'))  { STATE.weekStart = WR.shiftWeek(STATE.weekStart, +1); loadDraft(); renderAll(pageEl); return; }
      if (e.target.closest('[data-wr-today]')) { STATE.weekStart = WR.mondayOf(TODAY); loadDraft(); renderAll(pageEl); return; }

      if (e.target.closest('[data-wr-save]')) {
        WR.saveEntry(me().id, me(), STATE.weekStart, STATE.draft, 'draft');
        STATE._status = 'draft';
        renderAll(pageEl);
        window.toast && window.toast('임시저장되었습니다.', 'success');
        return;
      }
      if (e.target.closest('[data-wr-submit]')) {
        WR.saveEntry(me().id, me(), STATE.weekStart, STATE.draft, 'submitted');
        STATE._status = 'submitted';
        renderAll(pageEl);
        window.toast && window.toast('주간 업무 보고를 제출했습니다.', 'success');
        return;
      }
    });

    pageEl.addEventListener('input', e => {
      const cell = e.target.closest('[data-wr-sec]');
      if (cell) { STATE.draft[cell.dataset.wrSec] = cell.value; }
    });
  }

  function initPage() {
    const pageEl = document.getElementById('page-att-report-my');
    if (!pageEl) return;
    pageEl.__onShow = () => {
      if (!STATE.weekStart) STATE.weekStart = WR.mondayOf(TODAY);
      loadDraft();
      if (!pageEl.dataset.wrBound) bind(pageEl);
      renderAll(pageEl);
    };
  }
  const prev = App.initPages;
  App.initPages = function () {
    if (typeof prev === 'function') prev();
    initPage();
  };
})();
