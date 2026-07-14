/* =========================================================
 * Page: 근태 > 근무스케줄 관리 > 부서별 근무스케줄 편성
 *
 *  소속 팀의 권한자(부서장)가 본인 부서의 근무조를 편성한다. 조직도 없음(부서 = 소속 팀 고정).
 *  두 개 탭으로 구성:
 *
 *  [기본 근무스케줄 편성] — 직원별 기본 근무조 배정 화면 (상시 유효한 baseline).
 *    · 직원별 근무조는 부서 기본 근무조로 배정.
 *    · 생산직: 직원별로 근무조를 바꿔 주/야 교대를 세팅 가능(정책 반영 — 월별 편성 기본값에 직접 반영).
 *    · 사무직/연구직: 근무조 변경 승인 내역을 'YY/MM ~ YY/MM 반영 예정'으로 표시(해당 기간 자동 산정 반영).
 *
 *  [월별 근무스케줄 편성] — 기본 근무조대로 월별 근무조를 제출(당월~미래, 여러 달 미리 제출 가능).
 *    · 그리드: 월 | 제목 | 상태(제출 완료/마감) | 관리(복제/삭제) | [상세 보기].
 *    · 상태는 날짜 기준 자동: 월 전체가 지나면 '마감'(근태 산정 완료·조회만), 그 외 '제출 완료'.
 *    · 삭제: 미래(도래 전) 월만 가능. 당월·지난 달은 삭제 불가.
 *    · 편성 안 한 월/미생성 기간은 기본 근무조로 자동 산정(soft fallback).
 *    · 상세 편집: 오늘 이전 날짜/주간은 수정 불가(근태 산정 완료). 편집 저장 시 '적용 내용' 입력 →
 *      변경 이력(편집 일시 | 적용 내용 | 처리자) 관리. '변경 이력' 버튼은 '편집' 왼쪽.
 *
 *  UI Kit 재사용: .tabs.tabs--underline / .toolbar / .tbl.tbl--hover / .pagination / .pill /
 *                .dd.dd--row(.btn--kebab) / .modal / .ssw-tbl / .shift-chip / .tabs--segmented /
 *                .po-info / .callout / .fm-tbl (신규 컴포넌트 없음).
 *  공용 소스: App.AttShifts / App.AttWorkPolicy / App.AttStatus.EMP_LIST / App.HRInfoMgmt(jobCat).
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  /* ============ 환경 ============ */
  const TODAY   = '2026-05-28';   /* 근태 산정 기준일 */
  const HR_NAME = '정혜진';
  const APPROVER = '김상무';
  const PAGE_ID = 'page-att-shift-batch';

  /* ============ Helper ============ */
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function toast(msg, kind) { if (App.flashToast) App.flashToast(msg, kind); else if (window.toast) window.toast(msg, kind); }
  function daysInMonth(ym) { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); }
  function parseYMD(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function ymdOf(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
  function mondayOf(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const wd = x.getDay(); x.setDate(x.getDate() + (wd === 0 ? -6 : 1 - wd)); return x; }
  function weekDates7(start) { const b = parseYMD(start); const out = []; for (let i = 0; i < 7; i++) { const d = new Date(b.getFullYear(), b.getMonth(), b.getDate() + i); out.push(ymdOf(d)); } return out; }
  function mmdd(ds) { const p = ds.split('-'); return `${p[1]}/${p[2]}`; }
  const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];
  const CUR_YM = TODAY.slice(0, 7);
  function ymSlash(ym) { return `${ym.slice(2, 4)}/${ym.slice(5, 7)}`; }
  function ymTitle(ym, dept) { return `${ym.slice(2, 4)}/${ym.slice(5, 7)} ${dept} 근무스케줄`; }
  function shiftMonth(ym, delta) { let [y, m] = ym.split('-').map(Number); m += delta; while (m <= 0) { m += 12; y -= 1; } while (m > 12) { m -= 12; y += 1; } return `${y}-${pad2(m)}`; }
  function nowStamp() { const d = new Date(); const p = TODAY.split('-'); return `${p[0].slice(2)}/${p[1]}/${p[2]}   ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
  function monthLastDate(ym) { return `${ym}-${pad2(daysInMonth(ym))}`; }

  /* ============ 인원 / 부서 (조직도 없음 — 부서명으로 직접 필터) ============ */
  function allEmps() {
    if (App.AttStatus && App.AttStatus.EMP_LIST && App.AttStatus.EMP_LIST.length)
      return App.AttStatus.EMP_LIST.map(e => ({ id: e.id, name: e.name, dept: e.dept, rank: e.rank || '', position: e.position || '', shift: e.shift || 'WTD01' }));
    if (App.Employees && App.Employees.length) return App.Employees.slice();
    return [];
  }
  function deptEmps(deptName) { return allEmps().filter(e => e.dept === deptName); }
  function deptAllowedCodes(deptName) {
    if (!deptName) return [];
    const P = App.AttWorkPolicy;
    if (P && P.deptPolicy) { const c = (P.deptPolicy(deptName).codes || []); if (c.length) return c.slice(); }
    return (App.AttShifts && App.AttShifts.forDept) ? App.AttShifts.forDept(deptName).map(s => s.code) : [];
  }
  function deptDefaultOf(deptName) { const P = App.AttWorkPolicy; return (deptName && P && P.deptDefaultShift) ? (P.deptDefaultShift(deptName) || '') : ''; }
  function policyOf(deptName) { const P = App.AttWorkPolicy; return (deptName && P && P.deptPolicy) ? (P.deptPolicy(deptName).policy || 'regular') : 'regular'; }

  /* 로그인 사용자(부서장) 소속 팀 — 데모: 근무조가 배정된 첫 부서. 실서비스에선 세션 사용자 소속으로 대체. */
  /* 전용 근무조(useDepts)로 실제 교대 편성되는 부서 목록 — 데모 기본값 우선순위용. */
  function shiftDeptList() {
    const set = [];
    const list = (App.AttShifts && App.AttShifts.list) ? App.AttShifts.list() : [];
    list.forEach(s => (s.useDepts || []).forEach(d => { if (d && set.indexOf(d) < 0) set.push(d); }));
    return set;
  }
  function resolveMyDept() {
    const emps = allEmps();
    const me = emps.find(e => e.name === HR_NAME);
    /* 로그인 사용자 부서가 실제 교대 편성 부서면 우선 사용 */
    const shiftDepts = shiftDeptList();
    if (me && me.dept && shiftDepts.indexOf(me.dept) >= 0) return me.dept;
    /* 데모 기본값 — 임원실 같은 비교대 부서 대신 전용 근무조가 있는 첫 부서(예: 개발1팀) */
    if (shiftDepts.length) return shiftDepts[0];
    if (me && me.dept && deptAllowedCodes(me.dept).length) return me.dept;
    const depts = (App.AttShifts && App.AttShifts.depts) ? App.AttShifts.depts() : [];
    return depts.find(d => deptAllowedCodes(d).length) || (me && me.dept) || depts[0] || (emps[0] && emps[0].dept) || '개발1팀';
  }

  /* ============ 직무구분(직군) — HR 마스터의 jobCat ============ */
  function jobCatMap() {
    const m = {};
    const h = App.HRInfoMgmt;
    if (h && h.list) { try { h.list().forEach(r => { if (r && r.id) m[r.id] = r.jobCat || 'office'; }); } catch (e) { /* noop */ } }
    return m;
  }
  function jobCatLabel(jc) { return jc === 'production' ? '생산직' : jc === 'research' ? '연구직' : '사무직'; }
  function jobCatPill(jc) { const cls = jc === 'production' ? 'pill--purple' : jc === 'research' ? 'pill--success' : 'pill--info'; return `<span class="pill ${cls}">${esc(jobCatLabel(jc))}</span>`; }

  /* ============ 기본 근무조 / 승인 반영 → 편성 산출 ============ */
  /* 기본 근무스케줄 편성은 주차(1~5주차)별 근무조로 구성 — 교대(생산직)는 주마다 다른 코드로 로테이션. */
  const WEEKS_N = 5;
  function deptDefaultCode(dept) { return deptDefaultOf(dept) || (deptAllowedCodes(dept)[0]) || 'WTD01'; }
  /* 직원의 주차별 기본 근무조 배열(길이 WEEKS_N). 구 스키마(단일 문자열)는 자동 보정. */
  function empWeekCodes(emp) {
    const def = deptDefaultCode(emp.dept) || emp.shift || 'WTD01';
    let arr = STATE.baseCodes && STATE.baseCodes[emp.id];
    if (!Array.isArray(arr)) {
      const single = (typeof arr === 'string' && arr) ? arr : def;
      arr = Array.from({ length: WEEKS_N }, () => single);
      if (STATE.baseCodes) STATE.baseCodes[emp.id] = arr;
    }
    return arr;
  }
  function empWeekCode(emp, w) { return empWeekCodes(emp)[Math.min(Math.max(0, w), WEEKS_N - 1)] || deptDefaultCode(emp.dept); }
  /* 대표(1주차) 기본 근무조 — 승인 반영 등 단일 근무조가 필요한 곳에서 사용. */
  function empBaseCode(emp) { return empWeekCode(emp, 0); }
  /* 월(月) 내 주차 인덱스(0-based) — 일요일이 지날 때마다 +1 (근무스케줄 현황 weekIdx 와 동일 규칙). */
  function weekIdxOfMonth(ds) {
    const [y, m, d] = ds.split('-').map(Number);
    let idx = 0;
    for (let dd = 2; dd <= d; dd++) { if (new Date(y, m - 1, dd).getDay() === 0) idx++; }
    return idx;
  }
  /* 근무조 변경 승인 — 해당 일자가 승인 반영 기간(fromYm~toYm)에 들면 승인 근무조로 산정. */
  function approvalAt(empId, ds) {
    const a = STATE.approvals && STATE.approvals[empId];
    if (!a) return null;
    return (ds >= `${a.fromYm}-01` && ds <= monthLastDate(a.toYm)) ? a : null;
  }
  function basePlanCode(emp, ds) {
    const wd = parseYMD(ds).getDay();
    if (wd === 0 || wd === 6) return '-';
    const ap = approvalAt(emp.id, ds);
    if (ap) return ap.toCode;
    return empWeekCode(emp, weekIdxOfMonth(ds));
  }

  /* ============ 근무조 칩 — 부서별 근무스케줄 현황과 동일한 감성 소프트 카드 ============
     코드별 색상(파스텔 hex)의 은은한 틴트 배경(0.28) + 좌측 색상 액센트 바(3px) + 다크 텍스트. */
  function hexToRgba(hex, a) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) return hex || 'transparent';
    return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
  }
  /* appr: 개인 근무조 변경 승인 오버라이드 {code, from, reason, ...} 있으면 '승인' 배지 + 잠금 톤 */
  function chip(code, full, appr) {
    if (!code || code === '-') return '<span class="shift-chip shift-chip--off">휴무</span>';
    const s = App.AttShifts && App.AttShifts.get(code);
    if (!s) return `<span class="shift-chip">${esc(code)}</span>`;
    const night = s.isNight;
    const nm = s.label || s.code;
    /* 근무조 칩 색상 — 근무조 설정에 매핑된 코드별 색상(파스텔 hex). 현황과 동일 톤. */
    const hex = (App.AttShifts && App.AttShifts.colorHex) ? App.AttShifts.colorHex(s.color) : '';
    const styleAttr = hex
      ? ` style="background:${hexToRgba(hex, 0.28)};border:1px solid ${hexToRgba(hex, 0.42)};border-left:3px solid ${hex};color:var(--color-text);"`
      : '';
    let title = `${esc(nm)} (${esc(s.code)}) ${esc(s.start)}~${esc(s.end)}${night ? ' · 야간' : ''}`;
    if (appr) title += ` · 근무조 변경 승인${appr.from ? ` (${appr.from}→${s.code})` : ''}${appr.reason ? ' · ' + appr.reason : ''} · 편집 잠금`;
    const apprHTML = appr ? `<span class="shift-chip__appr" title="근무조 변경 승인 — 편집 잠금">승인</span>` : '';
    const hd = `<span class="shift-chip__hd"><strong class="shift-chip__code">${esc(s.code)}</strong> <span class="shift-chip__nm">${esc(nm)}</span></span>`;
    const inner = full ? `${apprHTML}${hd}<span class="shift-chip__t">${esc(s.start)}~${esc(s.end)}</span>` : `${apprHTML}${hd}`;
    return `<span class="shift-chip${appr ? ' shift-chip--appr' : ''}"${styleAttr} title="${esc(title)}">${inner}</span>`;
  }
  function personCell(emp) {
    const sub = [emp.dept, emp.rank, emp.position].filter(Boolean).map(esc).join('·');   // 팀·직위·직책
    const ch = esc((emp.name || '').slice(0, 1));
    return `<div class="ssw-tbl__person"><span class="ssw-tbl__ava">${ch}</span>
      <div class="ssw-tbl__nm"><div class="ssw-tbl__nm-top"><span class="ssw-tbl__name">${esc(emp.name)}</span></div>${sub ? `<div class="ssw-tbl__nm-sub">${sub}</div>` : ''}</div></div>`;
  }
  /* 편성 select 옵션 — 부서 근무조 + 휴무. baseCode 와 같은 코드는 '(기본 근무조)' 표기. */
  function optionsHTML(deptName, val, baseCode) {
    const codes = deptAllowedCodes(deptName);
    return `<option value="-" ${val === '-' ? 'selected' : ''}>휴무</option>` +
      codes.map(c => { const s = App.AttShifts && App.AttShifts.get(c); const bs = (baseCode && c === baseCode) ? ' (기본 근무조)' : ''; return `<option value="${esc(c)}" ${val === c ? 'selected' : ''}>${esc(c)} ${esc(s ? (s.label || '') : '')}${bs}</option>`; }).join('');
  }
  /* 기본 근무조 select (휴무 제외 — 기본 편성은 반드시 근무조) */
  function codeOptionsHTML(deptName, val) {
    return deptAllowedCodes(deptName).map(c => { const s = App.AttShifts && App.AttShifts.get(c); return `<option value="${esc(c)}" ${val === c ? 'selected' : ''}>${esc(c)} ${esc(s ? (s.label || '') : '')}</option>`; }).join('');
  }

  /* ============ 근무정책 배너 (.po-info) ============ */
  function policyPillHTML(policy) { return policy === 'shift' ? '<span class="pill pill--purple">교대근무</span>' : '<span class="pill pill--info">통상근무</span>'; }
  function codeInlineHTML(code) { const s = (App.AttShifts && App.AttShifts.get) ? App.AttShifts.get(code) : null; const lbl = s ? (s.label || code) : code; const tm = s ? `<span class="t-muted" style="font-weight:var(--fw-regular);">${esc(s.start)}~${esc(s.end)}</span>` : ''; return `<span class="ss-codeitem"><span class="po-info__code">${esc(code)}</span> ${esc(lbl)} ${tm}</span>`; }
  function renderPolicyBar(deptName) {
    if (!deptName) return '';
    const P = App.AttWorkPolicy; const cfg = (P && P.deptPolicy) ? P.deptPolicy(deptName) : { policy: 'regular', codes: [] };
    const codes = cfg.codes || [];
    const codeVal = codes.length ? codes.map(codeInlineHTML).join('<span class="ss-codesep">·</span>') : '<span class="t-muted" style="font-weight:var(--fw-regular);">미설정</span>';
    return `<div class="po-info" style="min-height:34px;width:max-content;max-width:100%;flex:0 0 auto;">
      <span class="po-info__pill"><span class="po-info__pill-label">근무정책</span><span class="po-info__pill-value">${policyPillHTML(cfg.policy)}</span></span>
      <span class="po-info__sep">|</span>
      <span class="po-info__pill"><span class="po-info__pill-label">사용 가능한 근무조</span><span class="po-info__pill-value">${codeVal}</span></span>
    </div>`;
  }

  /* ============ STATE ============ */
  const STATE = {
    deptName: null,
    baseCodes: null,         /* { empId: [c0..c4] } — 기본 근무스케줄 편성(주차별 근무조, 1~5주차) */
    approvals: null,         /* { empId: { fromCode, toCode, fromYm, toYm, approvedAt, by } } — 근무조 변경 승인 반영 */
    records: null,           /* 월별 회차 [{ id, ym, dept, plan{}, log[] }] (ym 내림차순) */
    tab: 'monthly',          /* 'monthly' (기본 근무스케줄은 모달로 분리) */
    baseModalOpen: false,    /* 기본 근무스케줄 설정 모달 열림 여부 */
    view: 'list',            /* monthly 내부: 'list' | 'detail' */
    detailId: null,
    weekIdx: 0,
    editMode: false,
    editSnapshot: null,
    selected: new Set(),     /* 편집 모드 일괄 변경 대상 empId (기본/월별 공용) */
    bulk: null,              /* 월별 일괄 변경 draft { code, scope } */
    baseEdit: false,         /* 기본 근무스케줄 편성 편집 모드 */
    baseSnapshot: null,      /* 기본 근무스케줄 편성 편집 취소용 baseCodes 스냅샷 */
    baseLog: [],             /* 기본 근무스케줄 편성 변경 이력 [{ at, content, by }] */
    baseBulk: null,          /* 기본 근무조 일괄 변경 draft { code, weeks:[] } */
    page: 1,
    pageSize: 20,
  };

  /* 회차 상태 — 날짜 기준 자동. 월 전체가 오늘 이전이면 '마감'(근태 산정 완료), 그 외 '제출 완료'. */
  function recStatus(rec) { return monthLastDate(rec.ym) < TODAY ? 'closed' : 'submitted'; }
  const STATUS = { submitted: { label: '편성 완료', pill: 'success' }, closed: { label: '마감', pill: 'muted' } };
  function statusPill(st) { const s = STATUS[st] || STATUS.submitted; return `<span class="pill pill--${s.pill}">${esc(s.label)}</span>`; }
  /* 삭제 가능 — 미래(도래 전) 월만. 당월·지난 달은 불가. */
  function deletable(rec) { return rec.ym > CUR_YM; }

  /* ============ 시드 ============ */
  function ensureRecordSeed(rec) {
    const emps = deptEmps(rec.dept);
    const days = daysInMonth(rec.ym);
    rec.plan = rec.plan || {};
    emps.forEach(emp => {
      for (let d = 1; d <= days; d++) {
        const ds = `${rec.ym}-${pad2(d)}`;
        const key = `${emp.id}|${ds}`;
        if (rec.plan[key] === undefined) rec.plan[key] = basePlanCode(emp, ds);
      }
    });
  }
  function seedBase(dept) {
    const codes = deptAllowedCodes(dept);
    const def = deptDefaultOf(dept) || codes[0] || 'WTD01';
    const jm = jobCatMap();
    const map = {};
    deptEmps(dept).forEach((e, ei) => {
      const jc = jm[e.id] || 'office';
      /* 생산직(교대) — 부서 사용 가능한 근무조를 주차마다 순환 배정(직원별 시작조 stagger). 그 외는 기본 근무조 고정. */
      map[e.id] = (jc === 'production' && codes.length > 1)
        ? Array.from({ length: WEEKS_N }, (_, w) => codes[(ei + w) % codes.length])
        : Array.from({ length: WEEKS_N }, () => def);
    });
    return map;
  }
  function seedApprovals(dept) {
    const jm = jobCatMap();
    const codes = deptAllowedCodes(dept);
    const ap = {};
    const targets = deptEmps(dept).filter(e => { const jc = jm[e.id]; return jc === 'office' || jc === 'research'; }).slice(0, 2);
    targets.forEach((e, i) => {
      const base = empBaseCode(e);
      const alt = codes.find(c => c !== base);
      if (!alt) return;
      const fromYm = shiftMonth(CUR_YM, 1 + i);
      const toYm = shiftMonth(fromYm, 2);
      ap[e.id] = { fromCode: base, toCode: alt, fromYm, toYm, approvedAt: nowStamp(), by: APPROVER };
    });
    return ap;
  }
  function seedRecords(dept) {
    const months = [shiftMonth(CUR_YM, -2), shiftMonth(CUR_YM, -1), CUR_YM, shiftMonth(CUR_YM, 1)];
    const recs = months.map(ym => ({ id: ym, ym, dept, plan: {}, log: [] }));
    recs.forEach(ensureRecordSeed);
    /* 데모 변경 이력 — 이번 달 회차 1건 */
    const cur = recs.find(r => r.ym === CUR_YM);
    if (cur) cur.log = [{ at: '26/05/20   09:05', content: '주간 표준조 로테이션 일부 조정 (설비 점검 대응)', by: HR_NAME }];
    return recs;
  }
  function ensureLoaded() {
    if (!STATE.deptName) STATE.deptName = resolveMyDept();
    if (STATE.baseCodes === null) STATE.baseCodes = seedBase(STATE.deptName);
    if (STATE.approvals === null) STATE.approvals = seedApprovals(STATE.deptName);
    if (STATE.records === null) STATE.records = seedRecords(STATE.deptName);
    if (!STATE.baseLog || !STATE.baseLog.length) {
      /* 데모 변경 이력 — 기본 근무스케줄 편성 1건 */
      STATE.baseLog = [{ at: '26/05/12   10:20', content: '생산 2조 주·야 교대 주기 조정 (2주 → 1주 로테이션)', by: HR_NAME }];
    }
  }
  function recordById(id) { ensureLoaded(); return STATE.records.find(r => r.id === id) || null; }
  function sortRecords() { STATE.records.sort((a, b) => (a.ym < b.ym ? 1 : a.ym > b.ym ? -1 : 0)); }

  /* 데모 — 이 부서 사무·연구직 1명에게 '하루짜리' 근무조 변경 승인을 App.AttShiftOverrides 에 주입(1회).
     전자결재 배선 전에도 월별 상세에서 '승인'(편집 잠금) 셀을 확인할 수 있게 한다. 실서비스에선 결재 승인이 직접 기록. */
  let _ovSeeded = false;
  function ensureDemoOverride() {
    const O = App.AttShiftOverrides;
    if (_ovSeeded || !O || !O.approve || !O.get) return;
    _ovSeeded = true;
    const jm = jobCatMap();
    const emp = deptEmps(STATE.deptName).find(e => { const jc = jm[e.id]; return jc === 'office' || jc === 'research'; });
    if (!emp) return;
    const days = daysInMonth(CUR_YM);
    let target = null;
    for (let d = 1; d <= days; d++) { const ds = `${CUR_YM}-${pad2(d)}`; const wd = parseYMD(ds).getDay(); if (wd !== 0 && wd !== 6 && ds > TODAY) { target = ds; break; } }
    if (!target || O.get(emp.id, target)) return;
    const codes = deptAllowedCodes(STATE.deptName);
    const base = empWeekCode(emp, weekIdxOfMonth(target));
    const alt = codes.find(c => c !== base) || base;
    O.approve({ empId: emp.id, fromShift: base, toShift: alt, dateFrom: target, dateTo: target, reason: '개인 사정 근무조 조정', reqId: `SC-${CUR_YM.replace('-', '')}-D1`, approvedAt: `${CUR_YM}-10   09:30` });
  }

  /* 편성 대상 부서 목록 — 소속 인원이 있는 부서(임직원 관리 기준). */
  function deptOptionList() {
    const set = [];
    allEmps().forEach(e => { if (e && e.dept && set.indexOf(e.dept) < 0) set.push(e.dept); });
    if (STATE.deptName && set.indexOf(STATE.deptName) < 0) set.unshift(STATE.deptName);
    return set;
  }
  /* 부서 선택 — 편성 대상 부서를 직접 전환(드롭다운). 부서명 + 인원수. */
  function deptSelectHTML() {
    const cur = STATE.deptName;
    const opts = deptOptionList().map(d => `<option value="${esc(d)}" ${d === cur ? 'selected' : ''}>${esc(d)} (${deptEmps(d).length}명)</option>`).join('');
    return `<label style="display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;">
      <span class="t-muted" style="font-size:var(--fs-xs);">부서</span>
      <select class="select" data-sb-dept style="width:auto;min-width:150px;">${opts}</select>
    </label>`;
  }
  /* =========================================================
   *  기본 근무스케줄 편성 — 월별 툴바 [기본 근무스케줄 설정] 버튼으로 진입하는 모달 본문
   * ========================================================= */
  function renderBaseTab() {
    ensureLoaded();
    const dept = STATE.deptName;
    const emps = deptEmps(dept);
    const jm = jobCatMap();
    const editing = STATE.baseEdit;
    const selN = STATE.selected.size;

    /* 주차(1~5주차) 헤더 — 근무스케줄 현황 월간 뷰(.ssw-tbl__wk)와 동일 톤 */
    const wkHead = Array.from({ length: WEEKS_N }, (_, w) =>
      `<th class="ssw-tbl__wk"><span class="ssw-tbl__wk-no">${w + 1}주차</span></th>`).join('');

    const rows = emps.map(emp => {
      const jc = jm[emp.id] || 'office';
      const prod = jc === 'production';
      const codes = empWeekCodes(emp);
      /* 주차별 근무조 셀 — 근무스케줄 현황 월간 뷰(.ssw-tbl__wk > .ssw-wk 블록 카드)와 동일 톤.
         편집 모드의 생산직(교대)은 셀마다 근무조 선택, 그 외는 고정 칩(주차 무관 동일 코드) */
      const wkCells = Array.from({ length: WEEKS_N }, (_, w) => {
        const code = codes[w] || deptDefaultCode(dept);
        const inner = (editing && prod)
          ? `<div class="ssw-edit">${chip(code, true)}<select class="ssw-edit__sel" data-sb-base="${esc(emp.id)}" data-sb-bweek="${w}">${codeOptionsHTML(dept, code)}</select></div>`
          : chip(code, true);
        return `<td class="ssw-tbl__wk"><div class="ssw-wk">${inner}</div></td>`;
      }).join('');
      const ap = STATE.approvals[emp.id];
      const apCell = (!prod && ap)
        ? `<span style="display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;">${chip(ap.fromCode, false)}<span class="t-muted">→</span>${chip(ap.toCode, false)}<span class="t-muted" style="font-size:var(--fs-xs);">${esc(ymSlash(ap.fromYm))} ~ ${esc(ymSlash(ap.toYm))}</span><span class="pill pill--warning">반영 예정</span></span>`
        : '<span class="t-muted">-</span>';
      const nameCell = editing
        ? `<td class="ssw-tbl__namecell"><label class="cb" style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" data-sb-emp="${esc(emp.id)}" ${STATE.selected.has(emp.id) ? 'checked' : ''}>${personCell(emp)}</label></td>`
        : `<td class="ssw-tbl__namecell">${personCell(emp)}</td>`;
      return `<tr>
        ${nameCell}
        <td style="text-align:center;">${jobCatPill(jc)}</td>
        ${wkCells}
        <td>${apCell}</td>
      </tr>`;
    }).join('');
    const colspan = WEEKS_N + 3;
    const bodyRows = emps.length ? rows : `<tr><td colspan="${colspan}" style="text-align:center;color:var(--color-text-muted);padding:32px 0;">${esc(dept)} 부서에 등록된 인원이 없습니다.</td></tr>`;

    const allChecked = emps.length && emps.every(e => STATE.selected.has(e.id));
    const nameHead = editing
      ? `<th class="ssw-tbl__namecell-h"><label class="cb" style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" data-sb-all ${allChecked ? 'checked' : ''}>성명</label></th>`
      : `<th class="ssw-tbl__namecell-h">성명</th>`;

    /* 툴바 우측 액션 — 편집 시 취소/저장, 조회 시 변경 이력/편집 */
    const actions = editing
      ? `<button class="btn btn--sm" type="button" data-sb-base-cancel>취소</button><button class="btn btn--sm btn--primary" type="button" data-sb-base-save>저장</button>`
      : `<button class="btn btn--sm" type="button" data-sb-base-log>변경 이력${STATE.baseLog.length ? ` (${STATE.baseLog.length})` : ''}</button><button class="btn btn--sm btn--primary" type="button" data-sb-base-edit>편집</button>`;

    /* 선택 시 '총 N명' 우측에 일괄 변경 버튼 노출 (월별과 동일한 .toolbar__left 안에 배치) */
    const bulkBar = (editing && selN)
      ? `<span style="display:flex;align-items:center;gap:8px;margin-left:6px;"><span class="t-muted" style="font-size:var(--fs-xs);">선택 <strong style="color:var(--color-brand-primary);">${selN}</strong>명</span><button class="btn btn--sm btn--primary" type="button" data-sb-base-bulk>근무조 일괄 변경</button><button class="btn btn--sm" type="button" data-sb-base-selclear>선택 해제</button></span>`
      : '';

    const host = document.getElementById('sb-base-body');
    if (!host) return;
    host.innerHTML = `
      <div class="toolbar">
        <div class="toolbar__left" style="gap:14px;">
          <span class="toolbar__count">부서 <strong>${esc(dept)}</strong> · 총 <strong>${emps.length}</strong>명</span>
          ${bulkBar}
        </div>
        <div class="toolbar__right">${actions}</div>
      </div>
      <div class="grid-wrap" style="flex:1;min-height:0;">
        <div class="ssw-wrap">
          <table class="ssw-tbl ssw-tbl--sched ssw-tbl--month${editing ? ' ssw-tbl--edit' : ''}">
            <thead><tr>
              ${nameHead}
              <th style="width:90px;text-align:center;">사원 유형</th>
              ${wkHead}
              <th style="min-width:240px;">근무조 변경 승인 반영</th>
            </tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>
      </div>`;
  }

  /* 기본 근무스케줄 편성 — 편집 진입/취소 */
  function enterBaseEdit() {
    STATE.baseEdit = true;
    STATE.baseSnapshot = JSON.parse(JSON.stringify(STATE.baseCodes || {}));
    STATE.selected.clear();
    renderBaseTab();
  }
  function cancelBaseEdit() {
    if (STATE.baseSnapshot) STATE.baseCodes = STATE.baseSnapshot;
    STATE.baseEdit = false;
    STATE.baseSnapshot = null;
    STATE.selected.clear();
    renderBaseTab();
  }
  function commitBaseEdit() {
    const ta = document.querySelector('#modal-sb-apply [data-sba-content]');
    const content = (ta && ta.value.trim()) || '';
    if (!content) { if (App.Forms && App.Forms.setFieldError) App.Forms.setFieldError(ta, '적용 내용을 입력해 주세요.'); else if (ta) ta.classList.add('is-invalid'); return; }
    STATE.baseLog = STATE.baseLog || [];
    STATE.baseLog.unshift({ at: nowStamp(), content, by: HR_NAME });
    STATE.baseEdit = false;
    STATE.baseSnapshot = null;
    STATE.selected.clear();
    closeModal('modal-sb-apply');
    renderBaseTab();
    toast('기본 근무스케줄 편성을 저장했습니다.', 'success');
  }

  /* 기본 근무조 일괄 변경 — 선택 구성원 × 선택 주차에 근무조 일괄 배정 */
  function ensureBaseBulkModal() {
    if (document.getElementById('modal-sb-basebulk')) return;
    const html = `
<div class="modal-backdrop" id="modal-sb-basebulk">
  <div class="modal" style="width:92vw;max-width:480px;">
    <div class="modal__header">
      <div class="modal__title">근무조 일괄 변경</div>
      <button class="modal__close" type="button" data-sbbb-close aria-label="닫기">✕</button>
    </div>
    <div class="modal__body" style="padding:18px 20px;" id="sb-basebulk-body"></div>
    <div class="modal__footer">
      <button class="btn" type="button" data-sbbb-close>취소</button>
      <button class="btn btn--primary" type="button" data-sbbb-go>적용</button>
    </div>
  </div>
</div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    const modal = document.getElementById('modal-sb-basebulk');
    modal.addEventListener('click', e => {
      if (e.target === modal || e.target.closest('[data-sbbb-close]')) { closeModal('modal-sb-basebulk'); return; }
      const wk = e.target.closest('[data-sbbb-week]');
      if (wk) {
        const w = Number(wk.dataset.sbbbWeek);
        const arr = STATE.baseBulk.weeks;
        const i = arr.indexOf(w);
        if (i >= 0) arr.splice(i, 1); else arr.push(w);
        renderBaseBulkBody();
        return;
      }
      if (e.target.closest('[data-sbbb-go]')) { applyBaseBulk(); return; }
    });
    modal.addEventListener('change', e => { const s = e.target.closest('[data-sbbb-code]'); if (s) STATE.baseBulk.code = s.value; });
  }
  function renderBaseBulkBody() {
    const body = document.getElementById('sb-basebulk-body');
    if (!body) return;
    const dept = STATE.deptName;
    const b = STATE.baseBulk;
    const weekChips = Array.from({ length: WEEKS_N }, (_, w) =>
      `<button type="button" class="chip-choice__item ${b.weeks.includes(w) ? 'is-active' : ''}" data-sbbb-week="${w}">${w + 1}주차</button>`).join('');
    body.innerHTML = `
      <div style="background:var(--color-active);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:16px;font-size:var(--fs-sm);color:var(--color-text-sub);">
        선택 <strong style="color:var(--color-brand-primary);">${STATE.selected.size}</strong>명에게 적용합니다.
      </div>
      <div class="fm-tbl fm-tbl--compact fm-tbl--bordered fm-tbl--form">
        <div class="fm-tbl__row fm-tbl__row--1" style="grid-template-columns:96px 1fr;">
          <div class="fm-tbl__label">적용 주차</div>
          <div class="fm-tbl__value"><div class="chip-choice">${weekChips}</div></div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" style="grid-template-columns:96px 1fr;">
          <div class="fm-tbl__label">근무조</div>
          <div class="fm-tbl__value"><select class="select" data-sbbb-code style="width:100%;">${codeOptionsHTML(dept, b.code)}</select></div>
        </div>
      </div>`;
  }
  function openBaseBulk() {
    if (!STATE.selected.size) { toast('먼저 대상 구성원을 선택해 주세요.', 'warning'); return; }
    STATE.baseBulk = { code: deptDefaultCode(STATE.deptName), weeks: [0, 1, 2, 3, 4] };
    ensureBaseBulkModal();
    renderBaseBulkBody();
    openModal('modal-sb-basebulk');
  }
  function applyBaseBulk() {
    const b = STATE.baseBulk;
    const ids = Array.from(STATE.selected);
    if (!ids.length) { toast('대상 구성원이 없습니다.', 'warning'); return; }
    if (!b.weeks.length) { toast('적용할 주차를 선택해 주세요.', 'warning'); return; }
    const emps = deptEmps(STATE.deptName);
    ids.forEach(id => {
      const emp = emps.find(x => x.id === id) || { id, dept: STATE.deptName };
      const arr = empWeekCodes(emp);
      b.weeks.forEach(w => { arr[Math.min(Math.max(0, w), WEEKS_N - 1)] = b.code; });
    });
    closeModal('modal-sb-basebulk');
    renderBaseTab();
    const s = App.AttShifts && App.AttShifts.get ? App.AttShifts.get(b.code) : null;
    const codeLabel = `${b.code}${s && s.label ? ' ' + s.label : ''}`;
    const wkLabel = b.weeks.length === WEEKS_N ? '전체 주차' : b.weeks.slice().sort((a, c) => a - c).map(w => `${w + 1}주차`).join('·');
    toast(`${ids.length}명 · ${wkLabel} → ${codeLabel} 적용`, 'success');
  }

  /* =========================================================
   *  MODAL — 기본 근무스케줄 설정 (월별 툴바에서 진입 · 부서는 현재 선택 부서 고정)
   *    기존 '기본 근무스케줄' 탭 화면을 그대로 모달 본문(#sb-base-body)으로 이관.
   * ========================================================= */
  function ensureBaseModal() {
    if (document.getElementById('modal-sb-base')) return;
    const html = `
<div class="modal-backdrop" id="modal-sb-base">
  <div class="modal" style="width:96vw;max-width:1080px;height:72vh;min-height:520px;max-height:88vh;display:flex;flex-direction:column;">
    <div class="modal__header">
      <div class="modal__title">기본 근무스케줄 설정</div>
      <button class="modal__close" type="button" data-sbase-close aria-label="닫기">✕</button>
    </div>
    <div class="modal__body" id="sb-base-body" style="padding:0;display:flex;flex-direction:column;min-height:0;flex:1;"></div>
  </div>
</div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    const modal = document.getElementById('modal-sb-base');
    modal.addEventListener('click', e => {
      if (e.target === modal || e.target.closest('[data-sbase-close]')) { closeBaseModal(); return; }
      if (e.target.closest('[data-sb-base-edit]'))     { enterBaseEdit(); return; }
      if (e.target.closest('[data-sb-base-cancel]'))   { cancelBaseEdit(); return; }
      if (e.target.closest('[data-sb-base-save]'))     { openApplyModal(); return; }
      if (e.target.closest('[data-sb-base-log]'))      { openBaseLogModal(); return; }
      if (e.target.closest('[data-sb-base-bulk]'))     { openBaseBulk(); return; }
      if (e.target.closest('[data-sb-base-selclear]')) { STATE.selected.clear(); renderBaseTab(); return; }
    });
    modal.addEventListener('change', e => {
      /* 직원별(교대) 주차 근무조 변경 */
      const baseSel = e.target.closest('[data-sb-base]');
      if (baseSel) {
        const id = baseSel.dataset.sbBase;
        const w = Number(baseSel.dataset.sbBweek || 0);
        const emp = deptEmps(STATE.deptName).find(x => x.id === id) || { id, dept: STATE.deptName };
        empWeekCodes(emp)[Math.min(Math.max(0, w), WEEKS_N - 1)] = baseSel.value;
        renderBaseTab();
        toast(`${w + 1}주차 기본 근무조를 변경했습니다.`, 'success');
        return;
      }
      /* 전체 선택 */
      const allCb = e.target.closest('[data-sb-all]');
      if (allCb) {
        const emps = deptEmps(STATE.deptName);
        if (allCb.checked) emps.forEach(x => STATE.selected.add(x.id)); else STATE.selected.clear();
        renderBaseTab();
        return;
      }
      /* 개별 선택 */
      const empCb = e.target.closest('[data-sb-emp]');
      if (empCb) {
        if (empCb.checked) STATE.selected.add(empCb.dataset.sbEmp); else STATE.selected.delete(empCb.dataset.sbEmp);
        renderBaseTab();
        return;
      }
    });
  }
  function openBaseModal() {
    ensureLoaded();
    ensureBaseModal();
    STATE.baseModalOpen = true;
    STATE.baseEdit = false;
    STATE.baseSnapshot = null;
    STATE.selected.clear();
    renderBaseTab();
    openModal('modal-sb-base');
  }
  function closeBaseModal() {
    STATE.baseModalOpen = false;
    STATE.baseEdit = false;
    STATE.baseSnapshot = null;
    STATE.selected.clear();
    closeModal('modal-sb-base');
  }

  /* =========================================================
   *  TAB 2 — 월별 근무스케줄 편성 (목록)
   * ========================================================= */
  function bannerHTML() {
    /* 이번 달 회차가 없으면 기본 근무조로 산정됨을 안내 */
    if (STATE.records.some(r => r.ym === CUR_YM)) return '';
    return `<div style="flex:0 0 auto;padding:12px 20px 0;">
      <div class="callout callout--warning">
        <span class="callout__icon">⚠</span>
        <div class="callout__body">
          <div class="callout__title">이번 달 ${esc(ymSlash(CUR_YM))} 근무조가 아직 편성되지 않았습니다.</div>
          <div>편성 전까지는 <strong>부서 기본 근무조</strong>로 자동 산정됩니다. [월별 근무스케줄 편성]으로 제출해 확정하세요.</div>
        </div>
      </div>
    </div>`;
  }

  function renderMonthlyList(pageEl) {
    ensureLoaded();
    sortRecords();
    pageEl.innerHTML = `
      ${bannerHTML()}
      <div class="toolbar">
        <div class="toolbar__left" style="gap:14px;">
          ${deptSelectHTML()}
          <span class="toolbar__count">총 <span data-sb-count><strong>0</strong>건</span></span>
        </div>
        <div class="toolbar__right">
          <button class="btn btn--sm btn--primary" type="button" data-sb-new>${(window.Icons && window.Icons.plus) || '+'} 월별 근무스케줄 편성</button>
          <button class="btn btn--sm" type="button" data-sb-base-open>기본 근무스케줄 설정</button>
        </div>
      </div>
      <div class="grid-wrap" style="flex:1;min-height:0;">
        <div class="grid-scroll">
          <table class="tbl tbl--hover">
            <thead>
              <tr>
                <th style="width:100px;text-align:center;">월</th>
                <th>제목</th>
                <th style="width:120px;text-align:center;">상태</th>
                <th style="width:70px;text-align:center;">관리</th>
                <th style="width:120px;text-align:center;"></th>
              </tr>
            </thead>
            <tbody id="sb-list-body"></tbody>
          </table>
        </div>
        <div class="pagination">
          <div class="pagination__info" id="sb-page-info"></div>
          <div class="pagination__right">
            <div class="pagination__size">
              <label>페이지당</label>
              <select class="select" id="sb-page-size"><option value="20">20</option><option value="50">50</option><option value="100">100</option></select>
              <span>건</span>
            </div>
            <div class="pagination__list" id="sb-pagination"></div>
          </div>
        </div>
      </div>`;
    renderListBody(pageEl);
  }

  function renderListBody(pageEl) {
    const total = STATE.records.length;
    const start = (STATE.page - 1) * STATE.pageSize;
    const rows = STATE.records.slice(start, start + STATE.pageSize);
    const body = pageEl.querySelector('#sb-list-body');
    if (!body) return;
    const kebab = (window.Icons && window.Icons.moreVertical) || '⋮';
    body.innerHTML = !rows.length
      ? `<tr><td colspan="5" style="text-align:center;color:var(--color-text-muted);padding:32px 0;">편성된 월별 근무조가 없습니다. [월별 근무스케줄 편성]으로 등록하세요.</td></tr>`
      : rows.map(r => {
          const del = deletable(r);
          const delAttr = del ? '' : 'disabled title="당월·지난 달 근무조는 삭제할 수 없습니다."';
          return `
          <tr class="is-clickable" data-sb-row="${esc(r.id)}">
            <td style="text-align:center;white-space:nowrap;">${esc(ymSlash(r.ym))}</td>
            <td style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:360px;"><a href="#" data-sb-open="${esc(r.id)}" style="color:var(--color-brand-primary);font-weight:var(--fw-medium);">${esc(ymTitle(r.ym, r.dept))}</a></td>
            <td style="text-align:center;">${statusPill(recStatus(r))}</td>
            <td style="text-align:center;">
              <span class="dd dd--row" data-dd>
                <button class="btn--kebab" type="button" aria-label="더보기">${kebab}</button>
                <div class="dd__menu">
                  <button class="dd__item" type="button" data-sb-copy="${esc(r.id)}">복제</button>
                  <button class="dd__item dd__item--danger" type="button" data-sb-delete="${esc(r.id)}" ${delAttr}>삭제</button>
                </div>
              </span>
            </td>
            <td style="text-align:center;"><button class="btn btn--xs" type="button" data-sb-open="${esc(r.id)}">상세 보기</button></td>
          </tr>`;
        }).join('');

    const cnt = pageEl.querySelector('[data-sb-count]');
    if (cnt) cnt.innerHTML = `<strong>${total.toLocaleString()}</strong>건`;

    const totalPages = Math.max(1, Math.ceil(total / STATE.pageSize));
    if (STATE.page > totalPages) STATE.page = totalPages;
    const info = pageEl.querySelector('#sb-page-info');
    if (info) info.textContent = total === 0 ? '0건' : `${start + 1}-${Math.min(start + STATE.pageSize, total)} / ${total}건`;

    const pag = pageEl.querySelector('#sb-pagination');
    if (pag) {
      const btns = [];
      btns.push(`<button class="pagination__btn" data-page="1" ${STATE.page === 1 ? 'disabled' : ''}>«</button>`);
      btns.push(`<button class="pagination__btn" data-page="${Math.max(1, STATE.page - 1)}" ${STATE.page === 1 ? 'disabled' : ''}>‹</button>`);
      for (let i = 1; i <= totalPages; i++) btns.push(`<button class="pagination__btn${i === STATE.page ? ' is-active' : ''}" data-page="${i}">${i}</button>`);
      btns.push(`<button class="pagination__btn" data-page="${Math.min(totalPages, STATE.page + 1)}" ${STATE.page === totalPages ? 'disabled' : ''}>›</button>`);
      btns.push(`<button class="pagination__btn" data-page="${totalPages}" ${STATE.page === totalPages ? 'disabled' : ''}>»</button>`);
      pag.innerHTML = btns.join('');
    }
  }

  function doDelete(id) {
    const rec = recordById(id); if (!rec) return;
    if (!deletable(rec)) { toast('당월·지난 달 근무조는 삭제할 수 없습니다.', 'warning'); return; }
    if (!confirm(`${ymTitle(rec.ym, rec.dept)} 회차를 삭제하시겠습니까?`)) return;
    STATE.records = STATE.records.filter(r => r.id !== id);
    renderListBody(document.getElementById(PAGE_ID));
    toast('월별 근무조 회차를 삭제했습니다.', 'success');
  }

  /* =========================================================
   *  TAB 2 — 상세 (주간 배치표)
   * ========================================================= */
  const CHEV_L = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`;

  function weeksOfMonth(ym) {
    const [y, m] = ym.split('-').map(Number);
    const days = daysInMonth(ym);
    const seen = {}; const weeks = [];
    for (let d = 1; d <= days; d++) {
      const mon = ymdOf(mondayOf(new Date(y, m - 1, d)));
      if (!seen[mon]) { seen[mon] = true; weeks.push({ idx: weeks.length, monday: mon }); }
    }
    return weeks;
  }
  function planAt(rec, emp, ds) {
    const key = `${emp.id}|${ds}`;
    if (rec.plan[key] !== undefined) return rec.plan[key];
    const v = basePlanCode(emp, ds);
    rec.plan[key] = v;
    return v;
  }
  /* 개인 근무조 변경 승인(일자별) — 전사 승인 저장소 App.AttShiftOverrides. 있으면 그 근무조로 확정(편집 잠금). */
  function overrideAt(emp, ds) { const O = App.AttShiftOverrides; return (O && O.get) ? O.get(emp.id, ds) : null; }
  function effAt(rec, emp, ds) { const ov = overrideAt(emp, ds); return ov ? { code: ov.code, ov } : { code: planAt(rec, emp, ds), ov: null }; }
  /* 선택 주(週)의 이 달(月) 소속 날짜만 — 인접 월 날짜('타 월')는 표시하지 않음 */
  function weekMonthDates(rec, week) { return weekDates7(week.monday).filter(ds => ds.slice(0, 7) === rec.ym); }

  function renderWeekTable(rec, week, editable) {
    const emps = deptEmps(rec.dept);
    /* 항상 7칸(월~일) 유지 — 부분 주차의 월 밖 날짜는 비활성 플레이스홀더로 채워 그리드 일관성 확보 */
    const dates = weekDates7(week.monday);
    const inMonth = (ds) => ds.slice(0, 7) === rec.ym;
    const dayHead = dates.map(ds => {
      const dt = parseYMD(ds); const wd = dt.getDay();
      const other = !inMonth(ds);
      const cls = (wd === 0 ? 'is-sun' : wd === 6 ? 'is-sat' : '') + (other ? ' is-other' : '');
      return `<th class="ssw-tbl__day ${cls}"${other ? ' style="opacity:.4;"' : ''}><span class="ssw-tbl__dnum">${pad2(dt.getMonth() + 1)}/${pad2(dt.getDate())}</span><span class="ssw-tbl__dw">(${DOW_KO[wd]})</span></th>`;
    }).join('');
    const rows = emps.map(emp => {
      const cells = dates.map(ds => {
        const dt = parseYMD(ds); const wd = dt.getDay();
        const other = !inMonth(ds);
        const cls = (wd === 0 ? 'is-sun' : wd === 6 ? 'is-sat' : '') + (other ? ' is-other' : '');
        if (other) return `<td class="ssw-tbl__day ${cls}" style="opacity:.4;"><span class="t-muted">·</span></td>`;
        if (wd === 0 || wd === 6) return `<td class="ssw-tbl__day ${cls}">${chip('-', true)}</td>`;
        const eff = effAt(rec, emp, ds);
        /* 개인 근무조 변경 승인일 — 셀 중앙 우측에 '승인' 배지(자물쇠 자리) + 편집 잠금(부서장 임의 변경 불가) */
        if (eff.ov) {
          const ov = eff.ov;
          const apTitle = `근무조 변경 승인${ov.from ? ` (${ov.from}→${ov.code})` : ''}${ov.reason ? ' · ' + ov.reason : ''} · 편집 잠금`;
          return `<td class="ssw-tbl__day ${cls} ssw-tbl__day--locked">${chip(eff.code, true)}<span class="ssw-lock ssw-lock--appr" title="${esc(apTitle)}">승인</span></td>`;
        }
        const code = eff.code;
        /* 해당 일자가 속한 주차의 기본 근무조 — 옵션에 '(기본 근무조)' 표기 */
        const base = empWeekCode(emp, weekIdxOfMonth(ds));
        const locked = !editable || ds < TODAY;
        if (locked) {
          /* 편집 모드에서 오늘 이전(근태 산정 완료) 셀 — 셀 중앙 우측에 잠금 아이콘 */
          const lock = (editable && ds < TODAY) ? `<span class="ssw-lock" title="근태 산정 완료 — 수정 불가">🔒</span>` : '';
          return `<td class="ssw-tbl__day ${cls}${lock ? ' ssw-tbl__day--locked' : ''}">${chip(code, true)}${lock}</td>`;
        }
        return `<td class="ssw-tbl__day ${cls} ssw-tbl__day--editable"><div class="ssw-edit">${chip(code, true)}<select class="ssw-edit__sel" data-sb-cell="${esc(emp.id)}|${esc(ds)}">${optionsHTML(rec.dept, code, base)}</select></div></td>`;
      }).join('');
      const nameCell = editable
        ? `<td class="ssw-tbl__namecell"><label class="cb" style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" data-sb-emp="${esc(emp.id)}" ${STATE.selected.has(emp.id) ? 'checked' : ''}>${personCell(emp)}</label></td>`
        : `<td class="ssw-tbl__namecell">${personCell(emp)}</td>`;
      return `<tr>${nameCell}${cells}</tr>`;
    }).join('');
    const rowsHTML = emps.length ? rows : `<tr><td colspan="${dates.length + 1}" style="text-align:center;padding:30px;color:var(--color-text-muted);">${esc(rec.dept)} 부서에 등록된 인원이 없습니다.</td></tr>`;
    const allChecked = emps.length && emps.every(e => STATE.selected.has(e.id));
    const nameHead = editable
      ? `<th class="ssw-tbl__namecell-h"><label class="cb" style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" data-sb-all ${allChecked ? 'checked' : ''}>성명</label></th>`
      : `<th class="ssw-tbl__namecell-h">성명</th>`;
    return `<table class="ssw-tbl ssw-tbl--sched${editable ? ' ssw-tbl--edit' : ''}">
      <thead><tr>${nameHead}${dayHead}</tr></thead>
      <tbody>${rowsHTML}</tbody>
    </table>`;
  }

  function renderDetail(pageEl) {
    ensureLoaded();
    const rec = recordById(STATE.detailId);
    if (!rec) { STATE.view = 'list'; renderMonthlyList(pageEl); return; }
    const st = recStatus(rec);
    const weeks = weeksOfMonth(rec.ym);
    if (STATE.weekIdx >= weeks.length) STATE.weekIdx = 0;
    const week = weeks[STATE.weekIdx];
    const editable = st === 'submitted' && STATE.editMode;
    if (!editable && STATE.selected.size) STATE.selected.clear();

    const weekTabs = weeks.map(w =>
      `<button type="button" class="tabs__tab ${w.idx === STATE.weekIdx ? 'is-active' : ''}" data-sb-week="${w.idx}">${w.idx + 1}주차</button>`).join('');
    const wkDates = weekMonthDates(rec, week);
    const wa = mmdd(wkDates[0]), wb = mmdd(wkDates[wkDates.length - 1]);

    let actions;
    if (st === 'closed') actions = `<button class="btn btn--sm" type="button" data-sb-log>변경 이력</button>`;
    else if (STATE.editMode) actions = `<button class="btn btn--sm" type="button" data-sb-edit-cancel>취소</button><button class="btn btn--sm btn--primary" type="button" data-sb-edit-save>저장</button>`;
    else actions = `<button class="btn btn--sm" type="button" data-sb-log>변경 이력</button><button class="btn btn--sm btn--primary" type="button" data-sb-edit>편집</button>`;

    let capText;
    if (st === 'closed') capText = '근태 산정이 완료된 지난 근무조입니다. 조회만 가능합니다.';
    else if (!editable) capText = '근무조 배정이 확정된 상태입니다. [편집]으로 수정할 수 있습니다.';
    else capText = '';

    /* 편집 모드 + 선택 시 '총 N명' 우측에 일괄 변경 버튼 노출 (다른 탭과 동일하게 .toolbar__left 안에 배치) */
    const selN = STATE.selected.size;
    const bulkBar = (editable && selN)
      ? `<span style="display:flex;align-items:center;gap:8px;margin-left:6px;"><span class="t-muted" style="font-size:var(--fs-xs);">선택 <strong style="color:var(--color-brand-primary);">${selN}</strong>명</span><button class="btn btn--sm btn--primary" type="button" data-sb-bulk-open>근무조 일괄 변경</button><button class="btn btn--sm" type="button" data-sb-sel-clear>선택 해제</button></span>`
      : '';

    pageEl.innerHTML = `
      <header class="att-page__head">
        <div class="att-tb">
          <div class="att-tb__left">
            <button class="page-bar__back" type="button" data-sb-back title="목록으로 돌아가기">${CHEV_L}목록</button>
            <div class="att-tb__title">${esc(ymTitle(rec.ym, rec.dept))}</div>
            <span class="t-muted" style="font-size:var(--fs-sm);">${esc(wa)} ~ ${esc(wb)}</span>
          </div>
          <div style="flex:1;display:flex;justify-content:center;">
            <div class="tabs tabs--segmented" style="display:inline-flex;width:auto;"><div class="tabs__nav">${weekTabs}</div></div>
          </div>
          <div class="att-tb__right">
            ${statusPill(st)}
          </div>
        </div>
      </header>
      <div class="toolbar">
        <div class="toolbar__left" style="gap:14px;">
          <span class="toolbar__count">총 <strong>${deptEmps(rec.dept).length}</strong>명</span>
          ${capText ? `<span class="t-muted" style="font-size:var(--fs-xs);">${esc(capText)}</span>` : ''}
          ${bulkBar}
        </div>
        <div class="toolbar__right">${actions}</div>
      </div>
      <div class="grid-wrap" style="flex:1;min-height:0;">
        <div class="ssw-wrap">${renderWeekTable(rec, week, editable)}</div>
      </div>`;
  }

  function openDetail(id) {
    const rec = recordById(id); if (!rec) return;
    ensureRecordSeed(rec);
    STATE.tab = 'monthly';
    STATE.view = 'detail';
    STATE.detailId = id;
    STATE.editMode = false;
    STATE.editSnapshot = null;
    const weeks = weeksOfMonth(rec.ym);
    const idx = weeks.findIndex(w => weekDates7(w.monday).some(ds => ds === TODAY));
    STATE.weekIdx = idx >= 0 ? idx : 0;
    render(document.getElementById(PAGE_ID));
  }
  function exitDetail(pageEl) {
    STATE.view = 'list';
    STATE.detailId = null;
    STATE.editMode = false;
    STATE.editSnapshot = null;
    STATE.selected.clear();
    render(pageEl);
  }
  function enterEdit(pageEl) {
    const rec = recordById(STATE.detailId); if (!rec || recStatus(rec) !== 'submitted') return;
    STATE.editMode = true;
    STATE.editSnapshot = JSON.parse(JSON.stringify(rec.plan));
    STATE.selected.clear();
    renderDetail(pageEl);
  }
  function cancelEdit(pageEl) {
    const rec = recordById(STATE.detailId);
    if (rec && STATE.editSnapshot) rec.plan = STATE.editSnapshot;
    STATE.editMode = false;
    STATE.editSnapshot = null;
    STATE.selected.clear();
    renderDetail(pageEl);
  }

  /* =========================================================
   *  MODAL — 월별 근무스케줄 편성 (신규, 월 범위 · 캘린더)
   * ========================================================= */
  function ensureCreateModal() {
    if (document.getElementById('modal-sb-create')) return;
    const html = `
<div class="modal-backdrop" id="modal-sb-create">
  <div class="modal" style="width:92vw;max-width:480px;">
    <div class="modal__header">
      <div class="modal__title">월별 근무스케줄 편성</div>
      <button class="modal__close" type="button" data-sbc-close aria-label="닫기">✕</button>
    </div>
    <div class="modal__body" style="padding:18px 20px;" id="sb-create-body"></div>
    <div class="modal__footer">
      <button class="btn" type="button" data-sbc-close>취소</button>
      <button class="btn btn--primary" type="button" data-sbc-go>편성</button>
    </div>
  </div>
</div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    const modal = document.getElementById('modal-sb-create');
    modal.addEventListener('click', e => {
      if (e.target === modal || e.target.closest('[data-sbc-close]')) { closeModal('modal-sb-create'); return; }
      if (e.target.closest('[data-sbc-go]')) { doCreate(); return; }
    });
    modal.addEventListener('change', e => {
      const f = e.target.closest('#sb-create-from'), t = e.target.closest('#sb-create-to');
      if (f || t) { const err = modal.querySelector('[data-sbc-err]'); if (err) err.hidden = true;
        /* 종료월이 시작월보다 앞서면 종료월을 시작월로 맞춤 */
        const fromEl = modal.querySelector('#sb-create-from'), toEl = modal.querySelector('#sb-create-to');
        if (fromEl && toEl && toEl.value && fromEl.value && toEl.value < fromEl.value) toEl.value = fromEl.value;
      }
    });
  }
  function renderCreateBody() {
    const body = document.getElementById('sb-create-body');
    if (!body) return;
    const dept = STATE.deptName;
    body.innerHTML = `
      <div class="fm-tbl fm-tbl--compact fm-tbl--bordered fm-tbl--form">
        <div class="fm-tbl__row fm-tbl__row--1" style="grid-template-columns:96px 1fr;">
          <div class="fm-tbl__label">편성 기간 <span style="color:var(--color-danger);">*</span></div>
          <div class="fm-tbl__value" style="gap:8px;align-items:center;flex-wrap:wrap;">
            <input type="month" class="input" id="sb-create-from" min="${CUR_YM}" value="${CUR_YM}" style="max-width:170px;">
            <span class="t-muted">~</span>
            <input type="month" class="input" id="sb-create-to" min="${CUR_YM}" value="${CUR_YM}" style="max-width:170px;">
          </div>
        </div>
      </div>
      <div class="field-error" data-sbc-err hidden style="margin-top:10px;">편성 기간을 올바르게 선택해 주세요.</div>`;
  }
  function openCreateModal() { ensureLoaded(); ensureCreateModal(); renderCreateBody(); openModal('modal-sb-create'); }
  function monthsInRange(from, to) { const out = []; let m = from; let guard = 0; while (m <= to && guard < 240) { out.push(m); m = shiftMonth(m, 1); guard++; } return out; }
  function doCreate() {
    const modal = document.getElementById('modal-sb-create');
    const from = modal.querySelector('#sb-create-from').value;
    const to = modal.querySelector('#sb-create-to').value;
    const err = modal.querySelector('[data-sbc-err]');
    if (!from || !to || to < from || from < CUR_YM) { if (err) err.hidden = false; return; }
    const dept = STATE.deptName;
    let created = 0, skipped = 0, firstNew = null;
    monthsInRange(from, to).forEach(ym => {
      if (STATE.records.some(r => r.ym === ym)) { skipped++; return; }
      const rec = { id: ym, ym, dept, plan: {}, log: [] };
      ensureRecordSeed(rec);
      STATE.records.push(rec);
      created++; if (!firstNew) firstNew = ym;
    });
    sortRecords();
    closeModal('modal-sb-create');
    if (!created) { toast('선택한 기간은 이미 편성되어 있습니다.', 'warning'); render(document.getElementById(PAGE_ID)); return; }
    toast(`${created}개월 근무조를 편성했습니다.${skipped ? ` (${skipped}개월은 이미 존재)` : ''}`, 'success');
    /* 상세로 진입하지 않고 목록에 새 회차가 추가된 상태로 표시 */
    STATE.tab = 'monthly'; STATE.view = 'list';
    render(document.getElementById(PAGE_ID));
  }

  /* =========================================================
   *  복제 — 모달 없이 곧바로 '다음 달'로 복제 (월 순서대로 쌓여 조회 편의)
   * ========================================================= */
  /* startYm 이상, 당월 이상, 미등록인 첫 월 */
  function nextAvailFrom(startYm) { let m = startYm < CUR_YM ? CUR_YM : startYm; let g = 0; while (g < 240) { if (!STATE.records.some(r => r.ym === m)) return m; m = shiftMonth(m, 1); g++; } return m; }
  function doCopyNext(id) {
    ensureLoaded();
    const src = recordById(id); if (!src) return;
    ensureRecordSeed(src);
    const dstYm = nextAvailFrom(shiftMonth(src.ym, 1));   /* 원본 다음 달부터 비어있는 첫 월 */
    const emps = deptEmps(src.dept);
    const srcWeeks = weeksOfMonth(src.ym);
    const dstWeeks = weeksOfMonth(dstYm);
    const plan = {};
    emps.forEach(emp => {
      const srcMap = {};
      srcWeeks.forEach(w => weekDates7(w.monday).forEach(ds => { if (ds.slice(0, 7) === src.ym) srcMap[`${w.idx}|${parseYMD(ds).getDay()}`] = planAt(src, emp, ds); }));
      dstWeeks.forEach(w => weekDates7(w.monday).forEach(ds => {
        if (ds.slice(0, 7) !== dstYm) return;
        const wd = parseYMD(ds).getDay();
        if (wd === 0 || wd === 6) return;
        const v = srcMap[`${w.idx}|${wd}`];
        plan[`${emp.id}|${ds}`] = (v === undefined ? basePlanCode(emp, ds) : v);
      }));
    });
    const rec = { id: dstYm, ym: dstYm, dept: src.dept, plan, log: [] };
    ensureRecordSeed(rec);
    STATE.records.push(rec);
    sortRecords();
    renderMonthlyList(document.getElementById(PAGE_ID));
    toast(`${ymSlash(src.ym)} 편성을 다음 달 ${ymSlash(dstYm)}(으)로 복제했습니다.`, 'success');
  }

  /* =========================================================
   *  MODAL — 편집 저장 시 '적용 내용' 입력
   * ========================================================= */
  function ensureApplyModal() {
    if (document.getElementById('modal-sb-apply')) return;
    const html = `
<div class="modal-backdrop" id="modal-sb-apply">
  <div class="modal" style="width:92vw;max-width:460px;">
    <div class="modal__header">
      <div class="modal__title">변경 내용 저장</div>
      <button class="modal__close" type="button" data-sba-close aria-label="닫기">✕</button>
    </div>
    <div class="modal__body" style="padding:18px 20px;">
      <div class="form-help" style="margin-bottom:8px;">편집한 근무조의 <strong>적용 내용</strong>을 입력하세요. 변경 이력에 기록됩니다.</div>
      <textarea class="input" data-sba-content rows="3" placeholder="예: 이수민 5/29~5/31 야간(I조) 전환 — 설비 점검 대응" style="width:100%;height:76px;min-height:76px;resize:vertical;"></textarea>
    </div>
    <div class="modal__footer">
      <button class="btn" type="button" data-sba-close>취소</button>
      <button class="btn btn--primary" type="button" data-sba-go>저장</button>
    </div>
  </div>
</div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    const modal = document.getElementById('modal-sb-apply');
    modal.addEventListener('click', e => {
      if (e.target === modal || e.target.closest('[data-sba-close]')) { closeModal('modal-sb-apply'); return; }
      if (e.target.closest('[data-sba-go]')) { (STATE.baseModalOpen ? commitBaseEdit : commitEdit)(); return; }
    });
  }
  function openApplyModal() {
    ensureApplyModal();
    const ta = document.querySelector('#modal-sb-apply [data-sba-content]');
    if (ta) { ta.value = ''; App.Forms && App.Forms.clearAll && App.Forms.clearAll(document.getElementById('modal-sb-apply')); }
    openModal('modal-sb-apply');
    if (ta) setTimeout(() => ta.focus(), 30);
  }
  function commitEdit() {
    const rec = recordById(STATE.detailId); if (!rec) return;
    const ta = document.querySelector('#modal-sb-apply [data-sba-content]');
    const content = (ta && ta.value.trim()) || '';
    if (!content) { if (App.Forms && App.Forms.setFieldError) App.Forms.setFieldError(ta, '적용 내용을 입력해 주세요.'); else if (ta) ta.classList.add('is-invalid'); return; }
    rec.log = rec.log || [];
    rec.log.unshift({ at: nowStamp(), content, by: HR_NAME });
    STATE.editMode = false;
    STATE.editSnapshot = null;
    STATE.selected.clear();
    closeModal('modal-sb-apply');
    renderDetail(document.getElementById(PAGE_ID));
    toast('변경 내용을 저장했습니다.', 'success');
  }

  /* =========================================================
   *  MODAL — 변경 이력 (편집 일시 | 적용 내용 | 처리자)
   * ========================================================= */
  function ensureLogModal() {
    if (document.getElementById('modal-sb-log')) return;
    const html = `
<div class="modal-backdrop" id="modal-sb-log">
  <div class="modal" style="width:92vw;max-width:640px;">
    <div class="modal__header">
      <div class="modal__title">변경 이력</div>
      <button class="modal__close" type="button" data-sbl-close aria-label="닫기">✕</button>
    </div>
    <div class="modal__body" style="padding:0;max-height:60vh;overflow:auto;" id="sb-log-body"></div>
    <div class="modal__footer"><button class="btn" type="button" data-sbl-close>닫기</button></div>
  </div>
</div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    const modal = document.getElementById('modal-sb-log');
    modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-sbl-close]')) closeModal('modal-sb-log'); });
  }
  function logTableHTML(log) {
    return `
      <table class="tbl">
        <thead><tr>
          <th style="width:160px;text-align:center;">편집 일시</th>
          <th>적용 내용</th>
          <th style="width:90px;text-align:center;">처리자</th>
        </tr></thead>
        <tbody>
          ${(log && log.length)
            ? log.map(l => `<tr>
                <td style="text-align:center;white-space:nowrap;">${esc(l.at)}</td>
                <td>${esc(l.content)}</td>
                <td style="text-align:center;">${esc(l.by)}</td>
              </tr>`).join('')
            : `<tr><td colspan="3" style="text-align:center;color:var(--color-text-muted);padding:28px 0;">변경 이력이 없습니다.</td></tr>`}
        </tbody>
      </table>`;
  }
  function openLogModal(id) {
    const rec = recordById(id); if (!rec) return;
    ensureLogModal();
    document.getElementById('sb-log-body').innerHTML = logTableHTML(rec.log || []);
    openModal('modal-sb-log');
  }
  function openBaseLogModal() {
    ensureLogModal();
    document.getElementById('sb-log-body').innerHTML = logTableHTML(STATE.baseLog || []);
    openModal('modal-sb-log');
  }

  /* =========================================================
   *  MODAL — 근무조 일괄 변경 (편집 모드, 선택 구성원)
   * ========================================================= */
  const BULK_SCOPES = [{ v: 'week', l: '표시 중인 주' }, { v: 'month', l: '이번 달 전체' }];
  function ensureBulkModal() {
    if (document.getElementById('modal-sb-bulk')) return;
    const html = `
<div class="modal-backdrop" id="modal-sb-bulk">
  <div class="modal" style="width:92vw;max-width:480px;">
    <div class="modal__header">
      <div class="modal__title">근무조 일괄 변경</div>
      <button class="modal__close" type="button" data-sbb-close aria-label="닫기">✕</button>
    </div>
    <div class="modal__body" style="padding:18px 20px;" id="sb-bulk-body"></div>
    <div class="modal__footer">
      <button class="btn" type="button" data-sbb-close>취소</button>
      <button class="btn btn--primary" type="button" data-sbb-go>적용</button>
    </div>
  </div>
</div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    const modal = document.getElementById('modal-sb-bulk');
    modal.addEventListener('click', e => {
      if (e.target === modal || e.target.closest('[data-sbb-close]')) { closeModal('modal-sb-bulk'); return; }
      const sc = e.target.closest('[data-sbb-scope]');
      if (sc) { STATE.bulk.scope = sc.dataset.sbbScope; renderBulkBody(); return; }
      if (e.target.closest('[data-sbb-go]')) { applyBulk(); return; }
    });
    modal.addEventListener('change', e => { const s = e.target.closest('[data-sbb-code]'); if (s) STATE.bulk.code = s.value; });
  }
  function renderBulkBody() {
    const body = document.getElementById('sb-bulk-body');
    if (!body) return;
    const rec = recordById(STATE.detailId);
    const b = STATE.bulk;
    const def = deptDefaultOf(rec.dept) || deptAllowedCodes(rec.dept)[0] || '';
    const scopeChips = BULK_SCOPES.map(s => `<button type="button" class="chip-choice__item ${b.scope === s.v ? 'is-active' : ''}" data-sbb-scope="${s.v}">${esc(s.l)}</button>`).join('');
    body.innerHTML = `
      <div style="background:var(--color-active);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:16px;font-size:var(--fs-sm);color:var(--color-text-sub);">
        선택 <strong style="color:var(--color-brand-primary);">${STATE.selected.size}</strong>명에게 적용합니다. <span class="t-muted">(오늘 이전 날짜·주말 제외)</span>
      </div>
      <div class="fm-tbl fm-tbl--compact fm-tbl--bordered fm-tbl--form">
        <div class="fm-tbl__row fm-tbl__row--1" style="grid-template-columns:96px 1fr;">
          <div class="fm-tbl__label">적용 범위</div>
          <div class="fm-tbl__value"><div class="chip-choice">${scopeChips}</div></div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" style="grid-template-columns:96px 1fr;">
          <div class="fm-tbl__label">근무조</div>
          <div class="fm-tbl__value"><select class="select" data-sbb-code style="width:100%;">${optionsHTML(rec.dept, b.code, def)}</select></div>
        </div>
      </div>`;
  }
  function openBulkModal() {
    const rec = recordById(STATE.detailId); if (!rec) return;
    if (!STATE.selected.size) { toast('먼저 대상 구성원을 선택해 주세요.', 'warning'); return; }
    STATE.bulk = { scope: 'week', code: deptDefaultOf(rec.dept) || deptAllowedCodes(rec.dept)[0] || '-' };
    ensureBulkModal();
    renderBulkBody();
    openModal('modal-sb-bulk');
  }
  /* 일괄 적용 대상 날짜 — 이 달 평일 중 오늘 이후 (범위: 표시 중인 주 / 이번 달 전체) */
  function bulkDates(rec, scope) {
    let dates;
    if (scope === 'week') { const week = weeksOfMonth(rec.ym)[STATE.weekIdx]; dates = weekMonthDates(rec, week); }
    else { dates = []; const days = daysInMonth(rec.ym); for (let d = 1; d <= days; d++) dates.push(`${rec.ym}-${pad2(d)}`); }
    return dates.filter(ds => { const wd = parseYMD(ds).getDay(); return wd !== 0 && wd !== 6 && ds >= TODAY; });
  }
  function applyBulk() {
    const rec = recordById(STATE.detailId); if (!rec) return;
    const b = STATE.bulk;
    const ids = Array.from(STATE.selected);
    const dates = bulkDates(rec, b.scope);
    if (!ids.length || !dates.length) { toast('적용할 수 있는 날짜가 없습니다.', 'warning'); return; }
    ids.forEach(id => dates.forEach(ds => { if (overrideAt({ id: id }, ds)) return; /* 승인일 보존 */ rec.plan[`${id}|${ds}`] = b.code; }));
    closeModal('modal-sb-bulk');
    renderDetail(document.getElementById(PAGE_ID));
    const codeLabel = b.code === '-' ? '휴무' : `${b.code} ${(App.AttShifts && App.AttShifts.labelOf) ? App.AttShifts.labelOf(b.code) : ''}`.trim();
    const scopeLabel = b.scope === 'week' ? '표시 중인 주' : '이번 달 전체';
    toast(`${ids.length}명 · ${scopeLabel} → ${codeLabel} 적용`, 'success');
  }

  /* ============ 모달 공통 ============ */
  function openModal(id) { const m = document.getElementById(id); if (!m) return; m.classList.add('is-open'); document.body.style.overflow = 'hidden'; }
  function closeModal(id) { const m = document.getElementById(id); if (m) m.classList.remove('is-open'); if (!document.querySelector('.modal-backdrop.is-open')) document.body.style.overflow = ''; }

  /* =========================================================
   *  이벤트 위임 (단일 바인딩)
   * ========================================================= */
  function bindPage(pageEl) {
    if (pageEl.dataset.sbBound === '1') return;
    pageEl.dataset.sbBound = '1';

    pageEl.addEventListener('click', e => {
      /* 기본 근무스케줄 설정 모달 열기 */
      if (e.target.closest('[data-sb-base-open]')) { openBaseModal(); return; }

      if (STATE.view === 'detail') {
        if (e.target.closest('[data-sb-back]')) { exitDetail(pageEl); return; }
        const wk = e.target.closest('[data-sb-week]');
        if (wk) { STATE.weekIdx = Number(wk.dataset.sbWeek); renderDetail(pageEl); return; }
        if (e.target.closest('[data-sb-edit]')) { enterEdit(pageEl); return; }
        if (e.target.closest('[data-sb-edit-cancel]')) { cancelEdit(pageEl); return; }
        if (e.target.closest('[data-sb-edit-save]')) { openApplyModal(); return; }
        if (e.target.closest('[data-sb-log]')) { openLogModal(STATE.detailId); return; }
        if (e.target.closest('[data-sb-bulk-open]')) { openBulkModal(); return; }
        if (e.target.closest('[data-sb-sel-clear]')) { STATE.selected.clear(); renderDetail(pageEl); return; }
        return;
      }

      {
        if (e.target.closest('[data-sb-new]')) { openCreateModal(); return; }
        const copy = e.target.closest('[data-sb-copy]');
        if (copy) { doCopyNext(copy.dataset.sbCopy); return; }
        const del = e.target.closest('[data-sb-delete]');
        if (del) { if (!del.disabled) doDelete(del.dataset.sbDelete); return; }
        const open = e.target.closest('[data-sb-open]');
        if (open) { e.preventDefault(); openDetail(open.dataset.sbOpen); return; }
        const pgBtn = e.target.closest('#sb-pagination .pagination__btn');
        if (pgBtn) { if (pgBtn.disabled) return; const p = Number(pgBtn.dataset.page); if (Number.isFinite(p)) { STATE.page = p; renderListBody(pageEl); } return; }
        if (e.target.closest('button, a, input, select, textarea, label, [data-dd]')) return;
        const row = e.target.closest('[data-sb-row]');
        if (row) { openDetail(row.dataset.sbRow); return; }
      }
    });

    pageEl.addEventListener('change', e => {
      /* 편성 대상 부서 전환 — 부서별 캐시(기본조/승인/월별기록) 재시드 후 재렌더 */
      const deptSel = e.target.closest('[data-sb-dept]');
      if (deptSel) {
        STATE.deptName = deptSel.value;
        STATE.baseCodes = null; STATE.approvals = null; STATE.records = null;
        STATE.selected.clear();
        STATE.baseEdit = false; STATE.detailId = null; STATE.view = 'list';
        ensureLoaded();
        _ovSeeded = false; ensureDemoOverride();   /* 새 부서에도 승인 데모 1건 반영 */
        render(pageEl);
        return;
      }
      /* 월별 상세 편집 — 전체 선택 */
      const allCb = e.target.closest('[data-sb-all]');
      if (allCb) {
        const emps = recordById(STATE.detailId) ? deptEmps(recordById(STATE.detailId).dept) : [];
        if (allCb.checked) emps.forEach(x => STATE.selected.add(x.id)); else STATE.selected.clear();
        renderDetail(pageEl);
        return;
      }
      /* 월별 상세 편집 — 개별 선택 */
      const empCb = e.target.closest('[data-sb-emp]');
      if (empCb) {
        if (empCb.checked) STATE.selected.add(empCb.dataset.sbEmp); else STATE.selected.delete(empCb.dataset.sbEmp);
        renderDetail(pageEl);
        return;
      }
      /* 월별 상세 — 셀 편성 */
      const cell = e.target.closest('[data-sb-cell]');
      if (cell && STATE.view === 'detail') { const rec = recordById(STATE.detailId); if (rec) { rec.plan[cell.dataset.sbCell] = cell.value; renderDetail(pageEl); } return; }
      /* 목록 — 페이지 크기 */
      const size = e.target.closest('#sb-page-size');
      if (size) { STATE.pageSize = Number(size.value); STATE.page = 1; renderListBody(pageEl); return; }
    });
  }

  /* =========================================================
   *  라우팅
   * ========================================================= */
  function render(pageEl) {
    if (STATE.view === 'detail') renderDetail(pageEl);
    else renderMonthlyList(pageEl);
    bindPage(pageEl);
  }

  /* =========================================================
   *  Page Init
   * ========================================================= */
  function initPage() {
    const pageEl = document.getElementById(PAGE_ID);
    if (!pageEl) return;
    pageEl.__onShow = () => {
      ensureLoaded();
      /* 개인 근무조 변경 승인(일자별) 반영 — 전사 저장소 시드 + 데모 1건 + 변경 구독 */
      if (App.AttShiftOverrides) {
        if (App.AttShiftOverrides.ensureSeed) App.AttShiftOverrides.ensureSeed();
        ensureDemoOverride();
        if (!pageEl.dataset.sbOvBound && App.AttShiftOverrides.onChange) {
          pageEl.dataset.sbOvBound = '1';
          App.AttShiftOverrides.onChange(() => { const el = document.getElementById(PAGE_ID); if (el && el.dataset.sbBound) render(el); });
        }
      }
      render(pageEl);
    };
  }
  const prev = App.initPages;
  App.initPages = function () { if (typeof prev === 'function') prev(); initPage(); };
})();
