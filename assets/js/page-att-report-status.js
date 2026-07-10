/* =========================================================
 * Page: 근태 > 업무 보고 > 업무 보고 현황 (주간업무보고)
 *
 *   좌측: 월/주차 네비 + 부서 목록(부서별 제출 완료율 %)
 *   우측: 선택 부서의 구성원 탭 + 업무 보고 섹션(기본업무/실천업무/건의사항/외근업무)
 *
 *   인터랙션
 *    - 본문 휠 스크롤 → 이전/다음 구성원 탭으로 자동 전환
 *    - 처음/마지막 탭에서 더 스크롤 → 좌측 패널의 이전/다음 부서로 전환
 *
 *   데이터: App.WorkReport (제출 상태) + App.AttStatus.EMP_LIST (명단)
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});
  const TODAY = '2026-05-29';

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function WR() { return App.WorkReport; }
  function HRI() { return window.App && (App.AttOrg || App.HRInfoMgmt); }
  function emps() { return (App.AttStatus && App.AttStatus.EMP_LIST) ? App.AttStatus.EMP_LIST : []; }

  /* 좌측 패널 그룹 — 최상위 조직(본부/팀). HRInfoMgmt 없으면 부서명 distinct 로 fallback. */
  function groups() {
    const h = HRI();
    if (h && h.topDepts) {
      const t = h.topDepts();
      if (t && t.length) return t;
    }
    return Array.from(new Set(emps().map(e => e.dept).filter(Boolean))).map(n => ({ id: n, name: n }));
  }
  /* 그룹(본부/팀) 소속 구성원 — 하위 파트 전체 포함. 파트 → 직급 순 정렬. */
  function membersOf(group) {
    if (!group) return [];
    const h = HRI();
    let list;
    if (h && h.empsInDept) list = h.empsInDept(emps(), group.id);
    else list = emps().filter(e => e.dept === group.name);
    return list.slice().sort((a, b) =>
      String(a.dept || '').localeCompare(String(b.dept || ''))
      || rankIdx(rankOf(a)) - rankIdx(rankOf(b))
      || String(a.id).localeCompare(String(b.id)));
  }

  /* 직급 — EMP_LIST 에 직급이 없으면 사번 기반 결정적 mock. */
  const RANKS = ['팀장', '차장', '과장', '대리', '주임', '사원'];
  function rankOf(emp) { return emp.position || emp.rank || (function () { const t = Number(String(emp.id).slice(-2)) || 1; return RANKS[t % RANKS.length]; })(); }
  function rankIdx(r) { const i = RANKS.indexOf(r); return i < 0 ? 99 : i; }

  /* 업무 보고 항목 — 부서별 양식(없으면 표준 4항목) */
  function sectionsFor(dept) { return (WR() && WR().categoriesFor) ? WR().categoriesFor(dept) : ['기본업무', '실천업무', '건의사항', '외근업무']; }
  const SAMPLE = {
    '기본업무': ['주간 정기 업무 수행', '담당 보고서 작성 및 검토', '부서 협업 회의 참석', '데이터 정리 및 백업'],
    '실천업무': ['개선 과제 실행', '프로세스 점검 및 정리', '신규 양식 적용'],
    '건의사항': ['업무 도구 라이선스 추가 요청', '회의실 예약 시스템 개선 건의'],
    '외근업무': ['거래처 방문 미팅', '현장 점검 및 자료 수집'],
  };

  const STATE = {
    ym: TODAY.slice(0, 7),   /* 'YYYY-MM' */
    weekStart: null,         /* 선택 주차의 월요일 */
    groupId: null,           /* 선택 본부/팀 id */
    memberId: null,
  };
  function curGroup() { const gs = groups(); return gs.find(g => g.id === STATE.groupId) || gs[0] || null; }

  /* ============ 날짜/주차 ============ */
  function pad2(n) { return String(n).padStart(2, '0'); }
  function weeksOfMonth(ym) {
    const [y, m] = ym.split('-').map(Number);
    const last = new Date(y, m, 0);
    const monStart = WR().mondayOf(`${ym}-01`);
    const out = [];
    let d = new Date(monStart.slice(0, 4), Number(monStart.slice(5, 7)) - 1, Number(monStart.slice(8, 10)));
    while (d <= last) {
      out.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`);
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
    }
    return out;
  }
  function shiftMonth(ym, delta) {
    let [y, m] = ym.split('-').map(Number);
    m += delta; while (m <= 0) { m += 12; y--; } while (m > 12) { m -= 12; y++; }
    return `${y}-${pad2(m)}`;
  }

  /* ============ 데이터 헬퍼 ============ */
  function statusOf(empId) {
    const e = WR().getEntry(empId, STATE.weekStart);
    return e ? e.status : 'none';
  }
  function groupPct(group) {
    const ms = membersOf(group);
    if (!ms.length) return null;
    const done = ms.filter(m => statusOf(m.id) === 'submitted').length;
    return Math.round((done / ms.length) * 100);
  }
  function sectionText(emp, sec) {
    const entry = WR().getEntry(emp.id, STATE.weekStart);
    if (!entry || entry.status === 'none') return '';
    const seed = Number(String(emp.id).replace(/\D/g, '').slice(-2)) || 0;
    const pool = SAMPLE[sec] || [];
    let n = (seed + sectionsFor(emp.dept).indexOf(sec)) % (pool.length + 1);
    if ((sec === '건의사항' || sec === '외근업무') && n === 0) return '';
    n = Math.max(1, n);
    return pool.slice(0, n).map(t => `· ${t}`).join('\n');
  }

  /* ============ 좌측 패널 ============ */
  function renderSide() {
    const weeks = weeksOfMonth(STATE.ym);
    const [y, m] = STATE.ym.split('-').map(Number);
    const weekTabs = weeks.map((wk, i) => `
      <button type="button" class="wrs__week ${wk === STATE.weekStart ? 'is-active' : ''}" data-wrs-week="${wk}">${i + 1}주차</button>`).join('');

    const deptItems = groups().map(g => {
      const pct = groupPct(g);
      return `
        <li class="wrs__dept ${g.id === STATE.groupId ? 'is-active' : ''}" data-wrs-group="${esc(g.id)}">
          <span class="wrs__dept-name">${esc(g.name)}</span>
          ${pct === null ? '' : `<span class="wrs__pct ${pct < 100 ? 'is-low' : ''}">${pct}%</span>`}
        </li>`;
    }).join('');

    return `
      <aside class="wrs__side">
        <div class="wrs__side-title">주간업무보고</div>
        <div class="wrs__month">
          <span class="wrs__month-label">${String(y).slice(-2)}/${pad2(m)}</span>
          <span class="wrs__month-nav">
            <button type="button" data-wrs-month="-1" aria-label="이전 달">‹</button>
            <button type="button" data-wrs-month="1" aria-label="다음 달">›</button>
          </span>
        </div>
        <div class="wrs__weeks">${weekTabs}</div>
        <ul class="wrs__depts">${deptItems || '<li class="wrs__dept-empty">부서 정보가 없습니다.</li>'}</ul>
      </aside>`;
  }

  /* ============ 우측 본문 ============ */
  function renderMain() {
    const group = curGroup();
    const members = membersOf(group);
    if (!members.length) {
      return `<section class="wrs__main"><div class="att-empty" style="margin:auto;">${esc(group ? group.name : '')} 소속 구성원이 없습니다.</div></section>`;
    }
    if (!STATE.memberId || !members.find(m => m.id === STATE.memberId)) STATE.memberId = members[0].id;
    const cur = members.find(m => m.id === STATE.memberId) || members[0];

    const tabs = members.map(m => {
      const unsubmitted = statusOf(m.id) !== 'submitted';
      return `
        <button type="button" class="wrs__tab ${m.id === STATE.memberId ? 'is-active' : ''}" data-wrs-member="${esc(m.id)}">
          <span class="wrs__tab-name">${unsubmitted ? '<span class="wrs__tab-dot" title="미제출"></span>' : ''}${esc(m.name)}</span>
          <span class="wrs__tab-meta">${esc(m.dept)} · ${esc(rankOf(m))}</span>
        </button>`;
    }).join('');

    const rows = sectionsFor(cur.dept).map(sec => {
      const txt = sectionText(cur, sec);
      return `
        <div class="wrs__row">
          <div class="wrs__row-label">${esc(sec)}</div>
          <div class="wrs__row-body">${txt ? esc(txt) : ''}</div>
        </div>`;
    }).join('');

    return `
      <section class="wrs__main">
        <div class="wrs__tabs" data-wrs-tabs>${tabs}</div>
        <div class="wrs__content" data-wrs-content>${rows}</div>
      </section>`;
  }

  function renderAll(pageEl) {
    const gs = groups();
    if (!STATE.groupId || !gs.find(g => g.id === STATE.groupId)) STATE.groupId = gs[0] && gs[0].id;
    pageEl.innerHTML = `<div class="wrs">${renderSide()}${renderMain()}</div>`;
    /* 활성 멤버 탭을 보이도록 스크롤 */
    const activeTab = pageEl.querySelector('.wrs__tab.is-active');
    if (activeTab && activeTab.scrollIntoView) activeTab.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  /* ============ 스크롤 → 탭/조직 전환 ============ */
  function stepMember(dir, pageEl) {
    const members = membersOf(curGroup());
    let idx = members.findIndex(m => m.id === STATE.memberId);
    if (idx < 0) idx = 0;
    const next = idx + dir;
    if (next >= 0 && next < members.length) {
      STATE.memberId = members[next].id;
      renderAll(pageEl);
      return;
    }
    /* 처음/마지막 탭 → 이전/다음 조직(본부/팀)으로 전환 */
    const gs = groups();
    const gi = gs.findIndex(g => g.id === STATE.groupId);
    const ngi = gi + dir;
    if (ngi >= 0 && ngi < gs.length) {
      STATE.groupId = gs[ngi].id;
      const nm = membersOf(gs[ngi]);
      STATE.memberId = dir > 0 ? (nm[0] && nm[0].id) : (nm.length ? nm[nm.length - 1].id : null);
      renderAll(pageEl);
    }
  }

  /* ============ Bind ============ */
  function bind(pageEl) {
    if (pageEl.dataset.wrsBound === '1') return;
    pageEl.dataset.wrsBound = '1';

    pageEl.addEventListener('click', e => {
      const mo = e.target.closest('[data-wrs-month]');
      if (mo) {
        STATE.ym = shiftMonth(STATE.ym, Number(mo.dataset.wrsMonth));
        STATE.weekStart = weeksOfMonth(STATE.ym)[0];
        renderAll(pageEl);
        return;
      }
      const wk = e.target.closest('[data-wrs-week]');
      if (wk) { STATE.weekStart = wk.dataset.wrsWeek; renderAll(pageEl); return; }

      const dp = e.target.closest('[data-wrs-group]');
      if (dp) {
        STATE.groupId = dp.dataset.wrsGroup;
        const nm = membersOf(curGroup());
        STATE.memberId = nm[0] && nm[0].id;
        renderAll(pageEl);
        return;
      }
      const mb = e.target.closest('[data-wrs-member]');
      if (mb) { STATE.memberId = mb.dataset.wrsMember; renderAll(pageEl); return; }
    });

    /* 휠 스크롤 → 탭 전환 (디바운스 + 쿨다운) */
    let accum = 0, lock = false;
    pageEl.addEventListener('wheel', e => {
      const content = e.target.closest('[data-wrs-content]');
      if (!content) return;
      e.preventDefault();
      if (lock) return;
      accum += e.deltaY;
      if (Math.abs(accum) < 60) return;
      const dir = accum > 0 ? 1 : -1;
      accum = 0;
      lock = true;
      setTimeout(() => { lock = false; }, 420);
      stepMember(dir, pageEl);
    }, { passive: false });
  }

  function initPage() {
    const pageEl = document.getElementById('page-att-report-status');
    if (!pageEl) return;
    pageEl.__onShow = () => {
      if (!(App.WorkReport && App.AttStatus && App.AttStatus.EMP_LIST)) {
        pageEl.innerHTML = `<div style="padding:24px;color:var(--color-text-muted);">업무 보고 모듈 로드 중...</div>`;
        return;
      }
      if (!STATE.weekStart) {
        STATE.ym = TODAY.slice(0, 7);
        const weeks = weeksOfMonth(STATE.ym);
        const mon = WR().mondayOf(TODAY);
        STATE.weekStart = weeks.includes(mon) ? mon : weeks[0];
      }
      bind(pageEl);
      renderAll(pageEl);
    };
  }
  const prev = App.initPages;
  App.initPages = function () {
    if (typeof prev === 'function') prev();
    initPage();
  };
})();
