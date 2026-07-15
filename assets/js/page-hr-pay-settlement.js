/* =========================================================
 * Page: HR > 급여 관리 > 급여 정산
 *
 *  개요
 *   - 인사담당자가 급여 정산을 개설하고 정산 대상자를 확정하여 급여대장을 생성한다.
 *   - 평가 회차([평가 관리 > 평가 회차]) 패턴을 차용. 개설 후 [계산 → 검증 → 확정] 3-step 으로 진행.
 *
 *  View
 *   1) list   — 정산 회차 목록
 *   2) create — 신규 등록 (3-step 마법사: 기본 정보 → 정산 대상자(상용직/일용직 그룹) → 지급·공제 항목 구성)
 *   3) detail — 상세 (상태별 [계산/검증/확정] 액션 + 급여대장 그리드)
 *
 *  Status
 *   - registered : 등록   — 회차 설정 수정 가능, 삭제 가능
 *   - calculated : 계산   — 자동 산출 완료, 검증 가능
 *   - validated  : 검증   — 검토/수정 완료, 확정 가능
 *   - finalized  : 확정   — 잠금, 결과 보기만 가능
 *   - canceled   : 중단   — 폐기, 삭제 가능
 *
 *  ID 패턴
 *   - PR-YYMM-NNNN (예: PR-2605-0001) — 귀속월 YYMM + 4자리 시퀀스
 *
 *  UI Kit 재사용
 *   .search / .toolbar / .tbl / .pill / .pagination / .page-bar / .steps-h
 *   .form-field / .input / .select / .cb / .fm-tbl
 *   .dd.dd--row + .btn--kebab — 행 더보기 메뉴
 *   .modal — 지급항목 추가 (#modal-prs-additem)
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  /* ============ 환경 ============ */
  const TODAY   = '2026-05-27';
  const HR_NAME = '정혜진';

  /* ============ 상태 ============
   *   단순화된 모델: status 는 종착점만 표현 (pending/finalized/canceled).
   *   실제 진행도는 r.stage (0-4) 가 담당:
   *     stage 0 = 대상자  / 1 = 지급 / 2 = 공제 / 3 = 정산검토 / 4 = 정산완료
   *   "확정" 액션 → status = 'finalized' (stage 4 에서 발동)
   *   "중단" 액션 → status = 'canceled'  (stage 1+ 에서 발동) */
  const STATUS = {
    pending:    { label: '진행 중', pill: 'info'    },
    finalized:  { label: '확정',    pill: 'success' },
    canceled:   { label: '중단됨',  pill: 'danger'  },
  };
  const STATUS_OPTIONS = Object.keys(STATUS).map(k => ({ value: k, label: STATUS[k].label }));

  /* 정산 유형 — 정기 급여 / 기타.
   *   regular(정기 급여) : 임금 계약과 연동된 기본급·근태 초과수당 등을 포함. 초과근무 정산기간 필요.
   *   etc(기타)          : 기본급·근태 초과수당을 제외. 초과근무 정산기간 미노출. */
  const SETTLE_TYPE = {
    regular: { label: '정기 급여', desc: '임금 계약과 연동된 기본급, 근태 초과수당 등을 포함하여 정산합니다.' },
    etc:     { label: '기타',      desc: '기본급, 근태 초과수당을 제외하여 정산합니다.' },
  };
  const SETTLE_TYPE_OPTIONS = Object.keys(SETTLE_TYPE).map(k => ({ value: k, label: SETTLE_TYPE[k].label }));
  function settleTypeLabel(t) { return (SETTLE_TYPE[t] || SETTLE_TYPE.regular).label; }
  function isRegularSettle(f) { return (f && f.settlementType || 'regular') === 'regular'; }

  function isConfigEditable(f) { return f && f.status === 'pending' && (Number(f.stage) || 0) === 0; }
  function isDeletable(s)      { return s === 'pending' || s === 'canceled'; }
  /* 작업 단계 별 라벨 (다음 단계 = 액션 버튼 라벨) */
  /* 다음 단계 버튼 라벨 — 그룹별. 상용직 5단계 / 일용직 3단계(대상자→급여대장→확정) */
  /* 각 stage 에서 누르는 액션 버튼 라벨. 정산검토(STD 마지막 직전)/급여대장(일용직 마지막 직전)
   *   단계의 「정산 확정」 버튼이 곧 마감(finalized) → 정산완료 단계로 체크 이동. */
  const STAGE_NEXT_LABEL_STD   = ['지급항목 검토', '공제항목 검토', '정산 검토', '정산 확정'];
  const STAGE_NEXT_LABEL_DAILY = ['급여대장 산출', '정산 검토', '정산 확정'];
  function nextLabelsOf(f) { return isDailyGroup(f) ? STAGE_NEXT_LABEL_DAILY : STAGE_NEXT_LABEL_STD; }
  /* 등록 위저드 단계 수 — 1 기본정보 / 2 대상자 / 3 지급·공제 항목(나란히) */
  const WIZARD_LAST_STEP = 3;

  /* ============ 페이지바 아이콘 (인라인 SVG) ============ */
  const ICON_MORE     = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>`;
  const ICON_SAVE     = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`;
  const ICON_CANCEL   = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="5.5" y1="5.5" x2="18.5" y2="18.5"/></svg>`;
  const ICON_ARROW_R  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;
  const ICON_TRASH    = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;
  const ICON_FILTER   = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/><circle cx="9" cy="6" r="2.4" fill="var(--color-surface)"/><circle cx="16" cy="12" r="2.4" fill="var(--color-surface)"/><circle cx="11" cy="18" r="2.4" fill="var(--color-surface)"/></svg>`;

  /* ============ 작업 페이즈 (5단계) ============
   *   상세 화면 상단 가로 스텝퍼. 상태(계산/검증/확정)와는 별개의 「작업 단계」 라벨.
   *   - 대상자       → 정산 대상자 확인 (registered)
   *   - 지급         → 항목별 지급 산출 (calculated 진입)
   *   - 공제         → 공제 항목 산출/검토
   *   - 정산검토     → 전체 결과 검토 (validated 진입)
   *   - 정산완료     → 마감 (finalized) */
  /*  상용직(standard): 대상자 → 지급항목 검토 → 공제항목 검토 → 정산검토 → 정산완료 (5단계)
   *  일용직(daily):    대상자 → 급여대장 → 정산완료 (3단계)
   *    - 일용직은 「일당 × 근무일수」 구조라 지급/공제를 나누지 않고 단일 「급여대장」 테이블로 본다
   *      (엑셀 「일용직 급여대장」 시트 구성과 동일). */
  const PHASES_STD = [
    { key: 'target',  label: '대상자'   },
    { key: 'pay',     label: '지급항목 검토' },
    { key: 'deduct',  label: '공제항목 검토' },
    { key: 'review',  label: '정산검토' },
    { key: 'done',    label: '정산완료' },
  ];
  const PHASES_DAILY = [
    { key: 'target',  label: '대상자'   },
    { key: 'ledger',  label: '급여대장' },
    { key: 'review',  label: '정산검토' },
    { key: 'done',    label: '정산완료' },
  ];
  /* 정산 그룹이 일용직인지 — targetFilter.empGroup 기준 (round / form 공용) */
  function isDailyGroup(f) {
    return !!(f && f.targetFilter && f.targetFilter.empGroup === 'daily');
  }
  /* 그룹별 페이즈 배열 — 모든 단계/인덱스 계산의 단일 진실원 */
  function phasesOf(f) { return isDailyGroup(f) ? PHASES_DAILY : PHASES_STD; }
  /* 라운드 r 의 작업 단계 — 그룹 페이즈 수에 맞춰 클램프. finalized 면 마지막 단계 유지 */
  function stageOf(r) {
    const s = Number((r && r.stage) || 0);
    return Math.max(0, Math.min(phasesOf(r).length - 1, s));
  }
  function defaultPhaseByStage(stage, f) {
    const P = phasesOf(f);
    return P[Math.max(0, Math.min(P.length - 1, stage || 0))].key;
  }
  function phaseIndex(key, f) {
    const i = phasesOf(f).findIndex(p => p.key === key);
    return i < 0 ? 0 : i;
  }
  /* 진행도(완료 인덱스) — stage 와 일치. finalized 면 +1 (모든 페이즈가 done 으로 표시) */
  function progressIndex(r) {
    if (!r) return 0;
    if (r.status === 'finalized') return phasesOf(r).length;
    return stageOf(r);
  }

  /* ============ 코드 마스터 (대상자 필터) ============
   *   평가 회차([평가 회차] 화면)와 동일한 코드값을 사용 — 직원 조회 함수가 같은 키를 본다. */
  const EMP_STATUS_OPTIONS = [
    { value: 'active', label: '재직' },
    { value: 'leave',  label: '휴직' },
  ];
  const EMP_TYPE_OPTIONS = [
    { value: 'regular',  label: '정규직' },
    { value: 'contract', label: '계약직' },
    { value: 'daily',    label: '일용직' },
  ];
  const JOB_CAT_OPTIONS = [
    { value: 'office',     label: '사무직' },
    { value: 'production', label: '생산직' },
    { value: 'research',   label: '연구직' },
  ];
  const POSITION_OPTIONS = ['임원', '본부장', '소장', '팀장', '파트장', '팀원', '파트원'];
  const DEPT_OPTIONS     = ['경영지원본부', '경영지원본부 / 인사팀', '경영지원본부 / 재무팀',
                            '생산본부', '생산본부 / 생산1팀', '생산본부 / 생산2팀',
                            '연구소', '연구소 / R&D1팀', '연구소 / R&D2팀'];

  /* 기본 지급 항목 — 정산 개설 시 자동 시드. 사용자는 좌측 [+ 항목 추가] 로 더 추가 가능.
   * 코드는 [지급항목 설정] 마스터(App.HRPayItem) 와 일치. */
  const DEFAULT_PAY_ITEM_CODES = [
    'PAY-SYS-001', /* 기본급 */
    'PAY-SYS-002', /* 고정연장근무수당 */
    'PAY-SYS-003', /* 연장근무수당 (= 시간외수당) */
    'PAY-SYS-004', /* 야간근무수당 */
    'PAY-SYS-006', /* 야간연장근무수당 */
    'PAY-SYS-005', /* 휴일근무수당 */
    'PAY-SYS-020', /* 상여금 (수기 입력) */
    'PAY-SYS-021', /* 상여금2 — 주 52시간 초과 시 지급 (수기 입력) */
    'PAY-SYS-022', /* 연차수당 (수기 입력) */
    'PAY-SYS-023', /* 기타수당 (수기 입력) */
    'PAY-SYS-024', /* 소급분 — 임금 소급 인상분 (수기 입력) */
  ];
  /* 수기 입력 지급 항목 — 자동 산출 없이 사용자가 직접 입력(기본 0). */
  const MANUAL_PAY_ITEM_CODES = ['PAY-SYS-020', 'PAY-SYS-021', 'PAY-SYS-022', 'PAY-SYS-023', 'PAY-SYS-024'];
  /* 보호 항목 — 어디서도 삭제 불가 (사이드바·모달·마법사 공통). */
  const PROTECTED_PAY_ITEM_CODES = DEFAULT_PAY_ITEM_CODES.slice();
  function isPayItemProtected(code) { return PROTECTED_PAY_ITEM_CODES.includes(code); }

  /* 계약 동기화 항목 — 기본급/고정연장근무수당은 근로·임금 계약에서 산출되므로
   *   지급항목 검토·검증 단계에서도 셀 값을 직접 편집할 수 없다(읽기 전용). */
  const CONTRACT_LOCKED_PAY_CODES = ['PAY-SYS-001', 'PAY-SYS-002'];
  function isContractLockedPayCode(code) { return CONTRACT_LOCKED_PAY_CODES.includes(code); }

  /* 지급 페이즈 — 기준 임금 5 컬럼 (고정).
   *   지급 항목 컬럼은 f.payItemCodes 에 따라 동적으로 buildPayItemCols(codes) 가 생성. */
  const PAY_PHASE_BASE_COLS = [
    { key: 'baseDay',   label: '기본일급', group: 'base', width: 110 },
    { key: 'baseHr',    label: '기본시급', group: 'base', width: 100 },
    { key: 'normalAmt', label: '통상임금', group: 'base', width: 120 },
    { key: 'normalDay', label: '통상일급', group: 'base', width: 110 },
    { key: 'normalHr',  label: '통상시급', group: 'base', width: 100 },
  ];
  /* 기본 5 항목의 표시 폭 권장값 — 사용자 추가 항목은 기본 130. */
  const PAY_ITEM_COL_WIDTH = {
    'PAY-SYS-001': 120,  /* 기본급 */
    'PAY-SYS-002': 150,  /* 고정연장근무수당 */
    'PAY-SYS-003': 130,  /* 연장근무수당 */
    'PAY-SYS-004': 130,  /* 야간근무수당 */
    'PAY-SYS-006': 150,  /* 야간연장근무수당 */
    'PAY-SYS-005': 130,  /* 휴일근무수당 */
    'PAY-SYS-010': 110,  /* 식대 */
    'PAY-SYS-020': 110,  /* 상여금 */
    'PAY-SYS-021': 110,  /* 상여금2 */
    'PAY-SYS-022': 110,  /* 연차수당 */
    'PAY-SYS-023': 110,  /* 기타수당 */
    'PAY-SYS-024': 110,  /* 소급분 */
  };
  function buildPayItemCols(payItemCodes) {
    return (payItemCodes || []).map(code => {
      const it = payItemByCode(code);
      return {
        key:   'item:' + code,
        code,
        label: it ? it.name : code,
        group: 'item',
        width: PAY_ITEM_COL_WIDTH[code] || 130,
      };
    });
  }

  /* 지급 항목별 「근무시간」 컬럼 — 수당 컬럼 바로 좌측에 실제 근무시간(h)을 함께 노출.
   *   고정연장/연장/야간/야간연장/휴일 수당은 각각 대응 시간을 같이 보여줘야 금액 검증이 쉬움
   *   (레퍼런스 급여대장과 동일 구성). 시간 데이터는 row.otHoursBreakdown 기준. */
  const PAY_HOURS_LABEL = {
    'PAY-SYS-002': '고정연장근무시간',
    'PAY-SYS-003': '연장근무시간',
    'PAY-SYS-006': '야간연장근무시간',
    'PAY-SYS-004': '야간근무시간',
    'PAY-SYS-005': '휴일근무시간',
  };
  const PAY_HOURS_COL_WIDTH = {
    'PAY-SYS-002': 116,
    'PAY-SYS-003': 92,
    'PAY-SYS-006': 116,
    'PAY-SYS-004': 92,
    'PAY-SYS-005': 92,
  };
  function payItemHasHours(code) { return Object.prototype.hasOwnProperty.call(PAY_HOURS_LABEL, code); }
  function payHoursColWidth(code) { return PAY_HOURS_COL_WIDTH[code] || 92; }
  function payItemHoursOf(r, code) {
    const br = (r && r.otHoursBreakdown) || {};
    if (code === 'PAY-SYS-002') return Number(br.fixedOTCoverHrs) || 0;                 /* 고정연장 = 계약 약정시간 */
    if (code === 'PAY-SYS-003') return (Number(br.billRegularHr) || 0)
                                     + (Number(br.billHolidayHr) || 0)
                                     + (Number(br.billHolidayNightHr) || 0);            /* 연장 = 연장/휴일연장/휴일야간연장 청구시간 */
    if (code === 'PAY-SYS-006') return Number(br.billNightHr) || 0;                     /* 야간연장 */
    if (code === 'PAY-SYS-004') return (Number(br.nightWorkHr) || 0)
                                     + (Number(br.holidayNightHr) || 0);                /* 야간 = 야간근로 + 휴일야간 */
    if (code === 'PAY-SYS-005') return Number(br.holidayWorkHr) || 0;                   /* 휴일근로 */
    return 0;
  }
  /* 연차수당(PAY-SYS-022) 앞에는 「미사용 연차」 일수 보조 컬럼을 둔다 (시간 컬럼 패턴과 동일). */
  function payItemHasLeaveDays(code) { return code === 'PAY-SYS-022'; }
  function leaveDaysCellHTML(r) {
    return (r.workState === 'retired' && Number(r.unusedLeave) > 0)
      ? String(Number(r.unusedLeave))
      : '<span class="t-muted">-</span>';
  }
  /* 지급항목 컬럼이 차지하는 실제 sub-col 수 (시간/미사용연차 보조 컬럼 포함) */
  function payItemSubTotal(itemCols) {
    return (itemCols || []).reduce((a, c) =>
      a + 1 + (payItemHasHours(c.code) ? 1 : 0) + (payItemHasLeaveDays(c.code) ? 1 : 0), 0);
  }

  /* 합계 행을 패널 하단에 밀착시키기 위한 신축 filler 행 — 데이터가 적을 때 빈 공간을 흡수.
   *   colspan 999 는 브라우저가 실제 컬럼 수로 자동 클램프. (CSS .prs-row-fill 가 height 흡수) */
  const LEDGER_FILL_ROW = `<tr class="prs-row-fill" aria-hidden="true"><td colspan="999"></td></tr>`;
  function withFillRow(bodyHTML, hasRows) { return bodyHTML + (hasRows ? LEDGER_FILL_ROW : ''); }

  /* 근무시간 표기 — 단위(h) 없이 숫자만 (반차 0.5 단위는 그대로 표시). 헤더 「…시간」 이 단위 역할. */
  function hourNum(n) { n = Number(n) || 0; return String(Math.round(n * 10) / 10); }
  function fmtHourCell(hrs) { const n = Number(hrs) || 0; return n ? esc(hourNum(n)) : '<span class="t-muted">-</span>'; }

  /* 근로내역 — 사번/이름 바로 옆에 노출하는 「근로일수 · 총 근로시간」 (레퍼런스 급여대장).
   *   상용직 총근로시간 = workDays×8 + 연장/야간/휴일 시간. */
  function stdWorkHours(r) {
    return (Number(r.workDays) || 0) * 8
      + (Number(r.otHours) || 0) + (Number(r.nightHr) || 0) + (Number(r.holidayHr) || 0);
  }
  /* 근로시간 표기 — 반차(0.5h) 단위가 있어 소수점 첫째자리까지. 단위(h)는 컬럼 헤더로 대체. */
  function fmtHours(n) {
    n = Number(n);
    if (!isFinite(n)) n = 0;
    return (Math.round(n * 10) / 10).toFixed(1);
  }
  const WORK_SUMMARY_COLS = [
    { key: 'workDays',  label: '근로일수',    width: 90,  align: 'right', fmt: r => `${Number(r.workDays) || 0}` },
    { key: 'workHours', label: '총 근로시간', width: 110, align: 'right', fmt: r => fmtHours(stdWorkHours(r)) },
  ];
  function workSummaryHeads() {
    return WORK_SUMMARY_COLS.map(c => `<th class="prs-col prs-col--work" style="width:${c.width}px;">${esc(c.label)}</th>`).join('');
  }
  function workSummaryCells(r) {
    return WORK_SUMMARY_COLS.map(c => `<td class="prs-col prs-col--work" style="text-align:${c.align};">${c.fmt(r)}</td>`).join('');
  }

  /* ============ Helper ============ */
  function $(s, r = document) { return r.querySelector(s); }
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
  function fmtMoney(n) {
    n = Number(n);
    if (!isFinite(n)) return '0';
    return Math.round(n).toLocaleString();
  }
  function ymd(d) {
    const y  = d.getFullYear();
    const m  = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
  /* ============ 날짜 표시 전용 헬퍼 (데이터 값은 ISO 유지, 화면 렌더 시점에만 변환) ============ */
  function dispYmd(s) {   /* 'YYYY-MM-DD' → 'YY/MM/DD' */
    s = String(s == null ? '' : s);
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(2, 4) + '/' + s.slice(5, 7) + '/' + s.slice(8, 10) : s;
  }
  function dispYm(s) {    /* 'YYYY-MM' → 'YY/MM' */
    s = String(s == null ? '' : s);
    return /^\d{4}-\d{2}/.test(s) ? s.slice(2, 4) + '/' + s.slice(5, 7) : s;
  }
  function periodText(from, to) {
    if (!from && !to) return '-';
    return `${dispYmd(from) || '?'} ~ ${dispYmd(to) || '?'}`;
  }
  function ymToYYMM(ym) {
    if (!ym) return '0000';
    const [y, m] = String(ym).split('-');
    return String(y || '').slice(-2) + String(m || '').padStart(2, '0');
  }
  function statusPill(code) {
    const s = STATUS[code] || STATUS.registered;
    return `<span class="pill${s.pill ? ' pill--' + s.pill : ''}">${esc(s.label)}</span>`;
  }
  function sectionCard(num, title, body, opts) {
    const help = (opts && opts.help) || '';
    return `
      <section class="prs-section">
        <header class="prs-section__head">
          <span class="prs-section__num">${num}</span>
          <h3 class="prs-section__title">${esc(title)}</h3>
          ${help ? `<small class="prs-section__help">${esc(help)}</small>` : ''}
        </header>
        ${body}
      </section>
    `;
  }
  const REQ_MARK = `<span style="color:var(--color-danger);">*</span>`;

  /* ============ Key-Value 보기 (읽기 전용 — 정산 설정 상세 모달) ============
   *   폼(인풋) 대신 라벨-값을 깔끔하게 보여주는 뷰. items: [{ k, v, full }]
   *   - v 는 HTML 허용(pill/링크). k 는 텍스트.
   *   - full:true 면 한 줄 전체 폭, 아니면 한 행에 2쌍씩 묶음. */
  function kvCard(num, title, items, help) {
    let html = '';
    let buf = [];
    const flushPair = () => {
      if (!buf.length) return;
      const cells = buf.map(it => `<div class="prs-dl__k">${esc(it.k)}</div><div class="prs-dl__v">${it.v}</div>`).join('');
      const pad = buf.length === 1 ? `<div class="prs-dl__k prs-dl__k--empty"></div><div class="prs-dl__v"></div>` : '';
      html += `<div class="prs-dl__row prs-dl__row--2">${cells}${pad}</div>`;
      buf = [];
    };
    (items || []).forEach(it => {
      if (!it) return;
      if (it.full) {
        flushPair();
        html += `<div class="prs-dl__row prs-dl__row--1"><div class="prs-dl__k">${esc(it.k)}</div><div class="prs-dl__v">${it.v}</div></div>`;
      } else {
        buf.push(it);
        if (buf.length === 2) flushPair();
      }
    });
    flushPair();
    return sectionCard(num, title, `<div class="prs-dl">${html}</div>`, { help: help || '' });
  }

  /* ============ 정산번호 자동 채번 — PR-YYMM-NNNN ============
   *   귀속월 기준 4자리 시퀀스. 같은 귀속월 안에서만 시퀀스 충돌 검사. */
  function nextSettleId(rounds, accruedMonth) {
    const yymm = ymToYYMM(accruedMonth || TODAY.slice(0, 7));
    const re = new RegExp('^PR-' + yymm + '-(\\d+)$');
    const maxSeq = (rounds || []).reduce((m, r) => {
      const match = String(r.id || '').match(re);
      return match ? Math.max(m, Number(match[1])) : m;
    }, 0);
    return 'PR-' + yymm + '-' + String(maxSeq + 1).padStart(4, '0');
  }

  /* ============ 지급 항목 마스터 룩업 ============
   *   App.HRPayItem 미로드(독립 진입 등) 시에도 동작하도록 fallback mock 제공. */
  function defaultPayItemFallback() {
    return [
      { id: 'PAY-SYS-001', code: 'PAY-SYS-001', name: '기본급',           payMethod: 'fixed',    taxType: 'taxable', ordinaryWage: true },
      { id: 'PAY-SYS-002', code: 'PAY-SYS-002', name: '고정연장근무수당', payMethod: 'fixed',    taxType: 'taxable', ordinaryWage: false },
      { id: 'PAY-SYS-003', code: 'PAY-SYS-003', name: '연장근무수당',     payMethod: 'variable', taxType: 'taxable', ordinaryWage: false },
      { id: 'PAY-SYS-004', code: 'PAY-SYS-004', name: '야간근무수당',     payMethod: 'variable', taxType: 'taxable', ordinaryWage: false },
      { id: 'PAY-SYS-006', code: 'PAY-SYS-006', name: '야간연장근무수당', payMethod: 'variable', taxType: 'taxable', ordinaryWage: false },
      { id: 'PAY-SYS-005', code: 'PAY-SYS-005', name: '휴일근무수당',     payMethod: 'variable', taxType: 'taxable', ordinaryWage: false },
      { id: 'PAY-SYS-010', code: 'PAY-SYS-010', name: '식대',             payMethod: 'fixed',    taxType: 'nontax',  ordinaryWage: true },
      { id: 'PAY-SYS-020', code: 'PAY-SYS-020', name: '상여금',           payMethod: 'variable', taxType: 'taxable', ordinaryWage: false },
      { id: 'PAY-SYS-021', code: 'PAY-SYS-021', name: '상여금2',          payMethod: 'variable', taxType: 'taxable', ordinaryWage: false },
      { id: 'PAY-SYS-022', code: 'PAY-SYS-022', name: '연차수당',         payMethod: 'variable', taxType: 'taxable', ordinaryWage: false },
      { id: 'PAY-SYS-023', code: 'PAY-SYS-023', name: '기타수당',         payMethod: 'variable', taxType: 'taxable', ordinaryWage: false },
      { id: 'PAY-SYS-024', code: 'PAY-SYS-024', name: '소급분',           payMethod: 'variable', taxType: 'taxable', ordinaryWage: false },
    ];
  }
  /* 정산 단계에서 즉석 생성한 사용자 지정 지급 항목 (마스터에 영구 등록하지 않는 항목).
   *   { id, code, name, payMethod:'fixed', taxType, ordinaryWage } */
  const CUSTOM_PAY_ITEMS = [];
  let _customPaySeq = 0;
  function nextCustomPayItemCode() {
    _customPaySeq += 1;
    return `PAY-USR-${String(_customPaySeq).padStart(3, '0')}`;
  }
  function allPayItems() {
    const api = window.App && App.HRPayItem;
    let base;
    if (api && typeof api.getActiveItems === 'function') {
      const arr = api.getActiveItems();
      base = (arr && arr.length) ? arr : defaultPayItemFallback();
    } else {
      base = defaultPayItemFallback();
    }
    return CUSTOM_PAY_ITEMS.length ? base.concat(CUSTOM_PAY_ITEMS) : base;
  }
  function payItemByCode(code) {
    return allPayItems().find(x => x.code === code) || null;
  }

  /* ============ 직원 데이터 조회 (평가 회차와 동일 소스) ============
   *   급여 정산 대상은 「인사정보 관리」 정책상 「완료(completed)」 직원 한정.
   *   - completed = 계정등록 + 정보등록 + 근로계약 서명 + (계약직·일용직) 기간 유효
   *   - 추가 가드: 임금계약 서명완료(유효)까지 충족해야 급여 정산 대상 (canSettlePayroll)
   *   - 등록·진행중·계약만료·퇴사는 대상에서 제외 */
  function listEmployeesMatchingFilter(tf) {
    const IM = window.App && App.HRInfoMgmt;
    const all = (IM && typeof IM.list === 'function')
      ? IM.list()
      : ((window.App && App.HRMembers && App.HRMembers.list) ? App.HRMembers.list() : []);
    const isActive = (e) => e.status !== 'retired' && e.status !== 'contractExpired';
    const isPayrollEligible = (e) => e.status === 'completed';

    /* 급여 정산 자격 — 계정 등록완료 + 근로계약 서명완료 + 임금계약 서명완료(유효).
       직원 목록과 자격 판정 모두 단일 진실원인 App.HRInfoMgmt를 사용한다.
       (헬퍼 미로드 시 폴백: 기존 completed 가드만 적용) */
    const canSettle = IM && typeof IM.canSettlePayroll === 'function'
      ? (e) => IM.canSettlePayroll(e)
      : () => true;

    return all.filter(e => {
      /* 정책 가드 — 「완료」가 아닌 직원은 어떤 필터를 걸어도 대상에서 제외 */
      if (!isPayrollEligible(e)) return false;
      /* 임금계약 서명완료(유효) 미달자 제외 */
      if (!canSettle(e)) return false;
      if (tf.empStatus && tf.empStatus.length) {
        const ok = (tf.empStatus.includes('active') && isActive(e))
                || (tf.empStatus.includes('leave')  && !isActive(e));
        if (!ok) return false;
      }
      if (tf.empType && tf.empType.length && !tf.empType.includes(e.empType)) return false;
      if (tf.jobCat && tf.jobCat.length && !tf.jobCat.includes(e.jobCat)) return false;
      if (tf.position && e.position !== tf.position) return false;
      if (tf.dept) {
        const want = tf.dept;
        const wantTeam = want.includes(' / ') ? want.split(' / ').pop().trim() : null;
        const wantHead = want.split(' / ')[0].trim();
        const hit = (e.dept === want) || (wantTeam && e.dept === wantTeam) || (!wantTeam && e.dept === wantHead);
        if (!hit) return false;
      }
      return true;
    });
  }
  function defaultTargetFilter() {
    return {
      /* 대상자 조회 단계 기본값 — 풀세팅:
         정산 그룹=상용직 / 근로유형 정규·계약직 / 사원 유형(사무·생산·연구) 전체.
         대상은 항상 재직중 직원(입사일 조건 불요). */
      empGroup:  'standard',                 /* 'standard'(상용직) | 'daily'(일용직) — 그룹별 정산 방법 상이 */
      empStatus: ['active'],
      empType:   ['regular', 'contract'],
      jobCat:    ['office', 'production', 'research'],
      position:  '',
      dept:      '',
    };
  }

  /* ============ 초과근무 정산기간 산출 ============
   *   귀속월(YYYY-MM) 기준 「전월 26일 ~ 귀속월 25일」. (정기 급여 전용) */
  function otPeriodFromMonth(ym) {
    const [ys, ms] = String(ym || '').split('-');
    const y = Number(ys), m = Number(ms);       // m: 1-based
    if (!y || !m) return null;
    const p2 = (n) => String(n).padStart(2, '0');
    let pvy = y, pvm = m - 1;
    if (pvm < 1) { pvm = 12; pvy -= 1; }         // 전월 (연 경계 처리)
    return { from: `${pvy}-${p2(pvm)}-26`, to: `${y}-${p2(m)}-25` };
  }

  /* ============ 귀속월 기준 자동 채움 ============
   *   귀속월(accruedMonth)을 정하면 나머지 일자를 자동으로 채운다.
   *     · 지급일          = 익월 10일
   *     · 대상자 조회기간 = 귀속월 1일 ~ 말일
   *     · 초과근무 정산기간 = 전월 26일 ~ 귀속월 25일 (정기 급여만)
   *   예) 귀속월 2026-05 → 지급일 2026-06-10 · 조회 2026-05-01~05-31 · 초과 2026-04-26~05-25 */
  function applyAccruedMonthAutoFill(f) {
    if (!f || !f.accruedMonth) return;
    const [ys, ms] = String(f.accruedMonth).split('-');
    const y = Number(ys), m = Number(ms);        // m: 1-based
    if (!y || !m) return;
    const p2 = (n) => String(n).padStart(2, '0');

    /* 지급일 = 익월 10일 */
    let ny = y, nm = m + 1;
    if (nm > 12) { nm = 1; ny += 1; }
    f.payDate = `${ny}-${p2(nm)}-10`;

    /* 대상자 조회기간 = 귀속월 1일 ~ 말일 */
    const lastDay = new Date(y, m, 0).getDate();  // m(1-based) → 해당 월 말일
    f.targetFrom = `${y}-${p2(m)}-01`;
    f.targetTo   = `${y}-${p2(m)}-${p2(lastDay)}`;

    /* 초과근무 정산기간 = 전월 26일 ~ 귀속월 25일 (정기 급여만) */
    if (isRegularSettle(f)) {
      const ot = otPeriodFromMonth(f.accruedMonth);
      if (ot) { f.otFrom = ot.from; f.otTo = ot.to; }
    } else {
      f.otFrom = ''; f.otTo = '';
    }
  }

  /* ============ Mock 정산 데이터 ============ */
  function makeMock() {
    const cases = [
      /* status: 'pending'|'finalized'|'canceled' / stage: 0-4 / settlementType: 'regular'|'etc' */
      { name: '2026년 5월 정기 급여 정산', accruedMonth: '2026-05', payDate: '2026-06-10',
        status: 'pending',   stage: 0, settlementType: 'regular', payOffset: [-30, -1], otOffset: [-30, -1] },
      { name: '2026년 4월 정기 급여 정산', accruedMonth: '2026-04', payDate: '2026-05-10',
        status: 'finalized', stage: 4, settlementType: 'regular', payOffset: [-60, -31], otOffset: [-60, -31] },
      { name: '2026년 3월 정기 급여 정산', accruedMonth: '2026-03', payDate: '2026-04-10',
        status: 'finalized', stage: 4, settlementType: 'regular', payOffset: [-90, -61], otOffset: [-90, -61] },
      { name: '2026년 5월 상여금 정산', accruedMonth: '2026-05', payDate: '2026-06-15',
        status: 'pending',   stage: 2, settlementType: 'etc',     payOffset: [-30, -1], otOffset: [-30, -1] },
      { name: '2026년 5월 일용직 급여 정산', accruedMonth: '2026-05', payDate: '2026-06-12',
        status: 'pending',   stage: 1, settlementType: 'regular', payOffset: [-30, -1], otOffset: [-30, -1], empGroup: 'daily' },
    ];
    return cases.map((c, i) => {
      const payFrom = ymd(addDays(new Date(TODAY), c.payOffset[0]));
      const payTo   = ymd(addDays(new Date(TODAY), c.payOffset[1]));
      const otFrom  = ymd(addDays(new Date(TODAY), c.otOffset[0]));
      const otTo    = ymd(addDays(new Date(TODAY), c.otOffset[1]));
      const createdAt = ymd(addDays(new Date(TODAY), -3 - i * 7));
      const isInitial = c.status === 'pending' && c.stage === 0;
      const targetN   = isInitial ? 0 : (78 - i * 6);
      const round = {
        id:           `PR-${ymToYYMM(c.accruedMonth)}-${String(i + 1).padStart(4, '0')}`,
        name:         c.name,
        accruedMonth: c.accruedMonth,
        payDate:      c.payDate,
        settlementType: c.settlementType || 'regular',
        targetFrom:   payFrom, targetTo: payTo,
        otFrom:       c.settlementType === 'etc' ? '' : otFrom,
        otTo:         c.settlementType === 'etc' ? '' : otTo,
        description:  '',
        status:       c.status,
        stage:        c.stage,
        targetCount:  targetN,
        payItemCodes: DEFAULT_PAY_ITEM_CODES.slice(),
        targetFilter: c.empGroup === 'daily'
          ? Object.assign(defaultTargetFilter(), { empGroup: 'daily', empType: ['daily'] })
          : defaultTargetFilter(),
        targetEmpIds: null,
        ledger:       null,                       /* 계산 결과 — 단계 1+ 부터 사용 */
        createdBy:    ['정혜진', '윤민지'][i % 2],
        createdAt,
      };
      /* 단계 1+ (지급 단계 이후) 또는 확정 이면 ledger 미리 계산 (mock 데모용) */
      if ((round.status === 'pending' && round.stage >= 1) || round.status === 'finalized') {
        round.ledger = computeLedger(round);
      }
      return round;
    });
  }

  /* ============ STATE ============ */
  const STATE = {
    view: 'list',
    rounds: [],
    filtered: [],
    page: 1, pageSize: 20,
    filter: null,
    selectedIds: new Set(),
    editingId: null,
    form: null,
  };

  /* ============ 필터 ============ */
  function applyFilter() {
    const p = STATE.filter || {};
    const kw   = (p.keyword || '').trim().toLowerCase();
    const cond = p.condition || 'name';
    const statusSel = (p.advanced && p.advanced.status)       || '';
    const monthSel  = (p.advanced && p.advanced.accruedMonth) || '';
    const createdBy = (p.advanced && p.advanced.createdBy)    || '';

    STATE.filtered = STATE.rounds.filter(r => {
      if (statusSel && r.status       !== statusSel) return false;
      if (monthSel  && r.accruedMonth !== monthSel)  return false;
      if (createdBy && r.createdBy    !== createdBy) return false;
      if (kw) {
        const t = cond === 'id' ? r.id : r.name;
        if (!String(t).toLowerCase().includes(kw)) return false;
      }
      return true;
    });
    const totalPages = Math.max(1, Math.ceil(STATE.filtered.length / STATE.pageSize));
    if (STATE.page > totalPages) STATE.page = 1;
  }

  /* =========================================================
   *  VIEW: LIST
   * ========================================================= */
  function renderListView(pageEl) {
    STATE.view = 'list';
    const C = App.Components;

    const userOpts  = Array.from(new Set(STATE.rounds.map(r => r.createdBy))).filter(Boolean);
    const monthOpts = Array.from(new Set(STATE.rounds.map(r => r.accruedMonth))).filter(Boolean).sort().reverse();

    const searchHTML = C.searchPanel({
      showDateRange: false,
      conditions: [
        { value: 'name', label: '정산명' },
        { value: 'id',   label: '정산번호' },
      ],
      placeholder: '정산명 또는 정산번호 검색',
      cols: 3,
      advanced: [
        { name: 'accruedMonth', label: '귀속월',   options: monthOpts.map(m => ({ value: m, label: dispYm(m) })) },
        { name: 'status',       label: '진행 상태', options: STATUS_OPTIONS },
        { name: 'createdBy',    label: '생성자',   options: userOpts.map(u => ({ value: u, label: u })) },
      ],
    });

    pageEl.innerHTML = `
      ${searchHTML}

      <div class="toolbar">
        <div class="toolbar__left">
          <span class="toolbar__count">총 <span data-count><strong>0</strong>건</span></span>
          <span class="prs-sel-count" data-sel-count></span>
        </div>
        <div class="toolbar__right">
          <button class="btn btn--sm btn--primary" type="button" data-prs-new>${(window.Icons && window.Icons.plus) || '+'} 급여 정산 등록</button>
          <span style="width:1px;height:18px;background:var(--color-divider);margin:0 4px;align-self:center;"></span>
          <button class="btn btn--sm" type="button" data-prs-ded-upload="insurance">${(window.Icons && window.Icons.upload) || ''} 4대보험 월 고지액 업로드</button>
          <button class="btn btn--sm" type="button" data-prs-ded-upload="tax">${(window.Icons && window.Icons.upload) || ''} 간이세액표 업로드</button>
          <button class="btn btn--sm btn--danger" type="button" data-prs-delete disabled>삭제</button>
        </div>
      </div>

      <div class="grid-wrap" style="flex:1;min-height:0;">
        <div class="grid-scroll">
          <table class="tbl tbl--hover">
            <thead>
              <tr>
                <th style="width:40px;text-align:center;"><input type="checkbox" data-prs-check-all aria-label="전체 선택" /></th>
                <th style="width:140px;">정산번호</th>
                <th style="width:90px;text-align:center;">귀속월</th>
                <th style="width:100px;text-align:center;">지급일</th>
                <th style="width:100px;text-align:center;">정산유형</th>
                <th>정산명</th>
                <th style="width:200px;white-space:nowrap;text-align:center;">대상자 조회기간</th>
                <th style="width:200px;white-space:nowrap;text-align:center;">초과근무 정산기간</th>
                <th style="width:90px;text-align:right;">대상자 수</th>
                <th style="width:110px;text-align:center;">상태</th>
                <th style="width:120px;text-align:center;"></th>
              </tr>
            </thead>
            <tbody id="prs-list-body"></tbody>
          </table>
        </div>
        <div class="pagination">
          <div class="pagination__info" id="prs-page-info"></div>
          <div class="pagination__right">
            <div class="pagination__size">
              <label>페이지당</label>
              <select class="select" id="prs-page-size">
                <option value="20">20</option><option value="50">50</option><option value="100">100</option><option value="200">200</option>
              </select>
              <span>건</span>
            </div>
            <div class="pagination__list" id="prs-pagination"></div>
          </div>
        </div>
      </div>
    `;
    bindList(pageEl);
  }

  function bindList(pageEl) {
    App.Search.attach(pageEl.querySelector('[data-search]'), (params) => {
      STATE.filter = params;
      STATE.page = 1;
      applyFilter();
      renderTable();
    });

    pageEl.addEventListener('click', (e) => {
      if (e.target.closest('[data-prs-new]'))    { openCreate(); return; }
      if (e.target.closest('[data-prs-delete]')) { doDelete();   return; }
      /* 목록 툴바의 공제 자료 업로드 버튼 — 4대보험 / 간이세액표 모달 오픈 */
      const dedUpBtn = e.target.closest('[data-prs-ded-upload]');
      if (dedUpBtn) { openDeductUploadModal(dedUpBtn.dataset.prsDedUpload); return; }
    });

    pageEl.querySelector('[data-prs-check-all]').addEventListener('change', (e) => {
      const checked = e.target.checked;
      const pageRows = STATE.filtered.slice((STATE.page - 1) * STATE.pageSize, STATE.page * STATE.pageSize);
      pageRows.forEach(r => {
        if (checked) STATE.selectedIds.add(r.id);
        else         STATE.selectedIds.delete(r.id);
      });
      renderTable();
    });

    const body = $('#prs-list-body', pageEl);
    body.addEventListener('change', (e) => {
      const cb = e.target.closest('input[type="checkbox"][data-prs-row-cb]');
      if (!cb) return;
      const tr = cb.closest('[data-prs-row]'); if (!tr) return;
      const id = tr.dataset.prsRow;
      if (cb.checked) STATE.selectedIds.add(id);
      else            STATE.selectedIds.delete(id);
      tr.classList.toggle('is-selected', cb.checked);
      updateBulkButtons(); updateCheckAll();
    });
    body.addEventListener('click', (e) => {
      const link = e.target.closest('[data-prs-open]');
      if (link) { e.preventDefault(); const tr = link.closest('[data-prs-row]'); if (tr) openDetail(tr.dataset.prsRow); return; }
      const open = e.target.closest('[data-prs-row-open]');
      if (open) { openDetail(open.dataset.prsRowOpen); return; }
      const del = e.target.closest('[data-prs-row-delete]');
      if (del) { doDeleteOne(del.dataset.prsRowDelete); return; }
    });

    $('#prs-pagination', pageEl).addEventListener('click', (e) => {
      const btn = e.target.closest('.pagination__btn');
      if (!btn || btn.disabled) return;
      const p = Number(btn.dataset.page);
      if (Number.isFinite(p)) { STATE.page = p; renderTable(); }
    });
    $('#prs-page-size', pageEl).addEventListener('change', (e) => {
      STATE.pageSize = Number(e.target.value); STATE.page = 1; renderTable();
    });
  }

  function renderTable() {
    const pageEl = document.getElementById('page-hr-pay-settlement');
    if (!pageEl) return;
    const total = STATE.filtered.length;
    const start = (STATE.page - 1) * STATE.pageSize;
    const rows  = STATE.filtered.slice(start, start + STATE.pageSize);

    const body = $('#prs-list-body', pageEl); if (!body) return;
    body.innerHTML = !rows.length
      ? `<tr><td colspan="11" style="text-align:center;color:var(--color-text-muted);padding:32px 0;">조건에 해당하는 정산 회차가 없습니다.</td></tr>`
      : rows.map(r => {
          const sel = STATE.selectedIds.has(r.id);
          const actionBtn = (() => {
            if (r.status === 'finalized') return `<button class="btn btn--xs" type="button" data-prs-row-open="${esc(r.id)}">결과 보기</button>`;
            if (r.status === 'canceled')  return `<span class="t-muted" style="font-size:var(--fs-xs);">-</span>`;
            /* pending(진행 중) — 상세 보기 진입 */
            return `<button class="btn btn--xs" type="button" data-prs-row-open="${esc(r.id)}">상세 보기</button>`;
          })();
          return `
            <tr data-prs-row="${esc(r.id)}" class="${sel ? 'is-selected' : ''}">
              <td style="text-align:center;"><input type="checkbox" data-prs-row-cb ${sel ? 'checked' : ''} /></td>
              <td style="white-space:nowrap;">${esc(r.id)}</td>
              <td style="text-align:center;white-space:nowrap;">${esc(r.accruedMonth ? dispYm(r.accruedMonth) : '-')}</td>
              <td style="text-align:center;white-space:nowrap;">${esc(r.payDate ? dispYmd(r.payDate) : '-')}</td>
              <td style="text-align:center;white-space:nowrap;">${esc(settleTypeLabel(r.settlementType))}</td>
              <td style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px;"><a href="#" data-prs-open style="color:var(--color-brand-primary);font-weight:var(--fw-medium);">${esc(r.name)}</a></td>
              <td style="white-space:nowrap;text-align:center;">${esc(periodText(r.targetFrom, r.targetTo))}</td>
              <td style="white-space:nowrap;text-align:center;">${(r.settlementType || 'regular') === 'regular' ? esc(periodText(r.otFrom, r.otTo)) : '<span style="color:var(--color-text-muted);">-</span>'}</td>
              <td style="text-align:right;">${(r.targetCount || 0).toLocaleString()}</td>
              <td style="text-align:center;">${statusPill(r.status)}</td>
              <td style="text-align:center;">${actionBtn}</td>
            </tr>`;
        }).join('');

    const cnt = pageEl.querySelector('[data-count]');
    if (cnt) cnt.innerHTML = `<strong>${total.toLocaleString()}</strong>건`;

    const size = STATE.pageSize;
    const totalPages = Math.max(1, Math.ceil(total / size));
    if (STATE.page > totalPages) STATE.page = totalPages;
    $('#prs-page-info', pageEl).textContent = total === 0 ? '0건' : `${start + 1}-${Math.min(start + size, total)} / ${total}건`;

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
    $('#prs-pagination', pageEl).innerHTML = btns.join('');

    const sizeSel = $('#prs-page-size', pageEl); if (sizeSel) sizeSel.value = String(STATE.pageSize);
    updateBulkButtons(); updateCheckAll();
  }

  function updateBulkButtons() {
    const pageEl = document.getElementById('page-hr-pay-settlement'); if (!pageEl) return;
    const selected = STATE.rounds.filter(r => STATE.selectedIds.has(r.id));
    const has = selected.length > 0;
    const allDeletable = has && selected.every(r => isDeletable(r.status));
    const delBtn = pageEl.querySelector('[data-prs-delete]');
    if (delBtn) delBtn.disabled = !allDeletable;
    const cnt = pageEl.querySelector('[data-sel-count]');
    if (cnt) cnt.textContent = has ? ` · 선택 ${selected.length}건` : '';
  }
  function updateCheckAll() {
    const pageEl = document.getElementById('page-hr-pay-settlement');
    const all = pageEl && pageEl.querySelector('[data-prs-check-all]'); if (!all) return;
    const pageRows = STATE.filtered.slice((STATE.page - 1) * STATE.pageSize, STATE.page * STATE.pageSize);
    if (!pageRows.length) { all.checked = false; all.indeterminate = false; return; }
    const selCnt = pageRows.filter(r => STATE.selectedIds.has(r.id)).length;
    all.checked = selCnt === pageRows.length;
    all.indeterminate = selCnt > 0 && selCnt < pageRows.length;
  }

  /* ============ 목록 액션 ============ */
  function doDelete() {
    const targets = STATE.rounds.filter(r => STATE.selectedIds.has(r.id));
    if (!targets.length) return;
    if (targets.some(r => !isDeletable(r.status))) {
      window.toast && window.toast('「등록」 또는 「중단됨」 상태인 정산만 삭제할 수 있습니다.', 'danger'); return;
    }
    if (!confirm(`선택한 ${targets.length}건의 정산을 삭제하시겠습니까? (복구 불가)`)) return;
    STATE.rounds = STATE.rounds.filter(r => !STATE.selectedIds.has(r.id));
    STATE.selectedIds.clear();
    applyFilter(); renderTable();
    window.toast && window.toast(`${targets.length}건 삭제 완료`, 'success');
  }
  function doDeleteOne(id) {
    const r = STATE.rounds.find(x => x.id === id); if (!r) return;
    if (!isDeletable(r.status)) {
      window.toast && window.toast('「등록」 또는 「중단됨」 상태인 정산만 삭제할 수 있습니다.', 'danger'); return;
    }
    if (!confirm(`「${r.name}」(${r.id}) 정산을 삭제하시겠습니까?`)) return;
    STATE.rounds = STATE.rounds.filter(x => x.id !== id);
    STATE.selectedIds.delete(id);
    applyFilter(); renderTable();
    window.toast && window.toast('1건 삭제 완료', 'success');
  }

  /* =========================================================
   *  VIEW: DETAIL / CREATE (공용 폼)
   * ========================================================= */
  function openDetail(id) {
    const r = STATE.rounds.find(x => x.id === id); if (!r) return;
    STATE.view = 'detail';
    STATE.editingId = id;
    STATE.form = cloneRoundForEdit(r);
    renderFormView(document.getElementById('page-hr-pay-settlement'));
  }
  function openCreate() {
    STATE.view = 'create';
    STATE.editingId = null;
    STATE.form = newFormDefaults();
    renderFormView(document.getElementById('page-hr-pay-settlement'));
  }
  function exitForm() {
    STATE.view = 'list';
    STATE.editingId = null;
    STATE.form = null;
    renderListView(document.getElementById('page-hr-pay-settlement'));
    applyFilter(); renderTable();
  }

  function newFormDefaults() {
    const accruedMonth = TODAY.slice(0, 7);
    const f = {
      id:           nextSettleId(STATE.rounds, accruedMonth),
      name:         '',
      settlementType: 'regular',
      accruedMonth, payDate: '',
      targetFrom:   '', targetTo: '',
      otFrom:       '', otTo:    '',
      description:  '',
      status:       'pending',
      stage:        0,
      targetFilter: defaultTargetFilter(),
      targetEmpIds: null,
      payItemCodes: DEFAULT_PAY_ITEM_CODES.slice(),
      deductItemCodes: DEDUCT_DEFAULT_CODES.slice(),
      ledger:       null,
      step:         1,    /* 1: 기본정보 / 2: 대상자 / 3: 지급항목 / 4: 공제항목 */
    };
    applyAccruedMonthAutoFill(f);   /* 기본 귀속월 기준으로 지급일·조회기간·초과근무기간 초기 채움 */
    return f;
  }
  function cloneRoundForEdit(r) {
    const codes = (r.payItemCodes || DEFAULT_PAY_ITEM_CODES).slice();
    return {
      id:           r.id,
      name:         r.name,
      settlementType: r.settlementType || 'regular',
      accruedMonth: r.accruedMonth,
      payDate:      r.payDate,
      targetFrom:   r.targetFrom, targetTo: r.targetTo,
      otFrom:       r.otFrom,     otTo:    r.otTo,
      description:  r.description || '',
      status:       r.status,
      targetFilter: Object.assign({}, r.targetFilter || defaultTargetFilter()),
      targetEmpIds: r.targetEmpIds ? new Set(r.targetEmpIds) : null,
      payItemCodes: codes,
      deductItemCodes: (r.deductItemCodes || DEDUCT_DEFAULT_CODES).slice(),
      ledger:       r.ledger ? deepClone(r.ledger) : null,
      payslipDistributed: !!r.payslipDistributed,   /* 급여명세서 배부 완료 여부 */
      createdBy:    r.createdBy, createdAt: r.createdAt,
      step:         1,
      /* 작업 단계 (0-4) — r 객체에 저장된 stage 복제 */
      stage:        Number(r.stage || 0),
      /* 상세 화면 작업 상태 */
      activePhase:    defaultPhaseByStage(Number(r.stage || 0), r),
      activeItemCode: codes[0] || '__sum',
      staffFilter:    'active',  /* 재직자만 표시 — 「재직자 N명」 라벨과 일치 */
      configOpen:     false,
      sidebarOpen:    true,      /* 지급 페이즈에서만 보임. 기본 펼침, 토글로 접기 가능 */
      search:         '',        /* 사번/이름 검색 키워드 */
      filterOpen:     false,     /* 검색 필터 접기/펼치기 */
      workStateFilter:'all',     /* 재직 상태 필터 (all/active/leave/retired) */
    };
  }

  function renderFormView(pageEl) {
    const f = STATE.form;
    const isCreate = STATE.view === 'create';

    /* 페이지바 — 상세는 정산명만, 등록은 「급여 정산 등록」.
     *   - 서브타이틀·상태펠 미노출.
     *   - 상세 화면은 타이틀 옆 [상세] 버튼으로 「정산 설정」 모달 오픈.
     *   - 등록 화면은 마법사 서브타이틀을 위해 page-bar__sub 사용. */
    const titleText = isCreate ? '급여 정산 등록' : (f.name || '(이름 없음)');
    const wzSub = '';   /* 마법사 단계 안내 문구 미노출 */

    /* 액션 버튼 그룹 — 단계 기반:
     *   pending: [저장-icon] [중단-icon (stage 1+)] [<next stage label> →] (primary)
     *   finalized: [엑셀 ↓]
     *   canceled : [삭제] */
    const actionButtons = isCreate ? '' : (() => {
      const s = f.status;
      if (s === 'finalized') return f.payslipDistributed
        ? `<button class="btn btn--sm" type="button" disabled>급여명세서 배부 완료</button>`
        : `<button class="btn btn--sm btn--primary" type="button" data-prs-act="distribute">급여명세서 배부</button>`;
      if (s === 'canceled')  return `<button class="btn btn--sm" type="button" data-prs-form-delete>삭제</button>`;
      /* pending */
      const st = stageOf(f);
      const nextLabel = nextLabelsOf(f)[st] || '';
      const saveBtn   = `<button class="btn btn--sm" type="button" data-prs-form-save>임시 저장</button>`;
      const cancelBtn = st >= 1
        ? `<button class="btn btn--sm btn--soft-danger" type="button" data-prs-form-delete>삭제</button>`
        : '';
      const nextBtn   = `<button class="btn btn--sm btn--primary" type="button" data-prs-act="advance">${esc(nextLabel)} ${ICON_ARROW_R}</button>`;
      return `${saveBtn}${cancelBtn}${nextBtn}`;
    })();

    /* 페이지바 — detail 은 3-column 그리드 (left: 타이틀, center: 스텝퍼, right: actions + 상세)
     *   create 는 기존 flex 레이아웃 (타이틀 + 마법사 서브타이틀 + 스페이서) */
    const pageBarHTML = isCreate ? `
      <div class="page-bar">
        <button class="page-bar__back" type="button" data-prs-form-back>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          목록
        </button>
        <div class="page-bar__divider"></div>
        <div class="prs-title-bar">
          <div class="page-bar__title">${esc(titleText)}</div>
          ${wzSub ? `<div class="page-bar__sub" style="margin-left:8px;">${esc(wzSub)}</div>` : ''}
        </div>
        <div class="page-bar__spacer"></div>
      </div>
    ` : `
      <div class="page-bar page-bar--3col">
        <div class="prs-page-bar__left">
          <button class="page-bar__back" type="button" data-prs-form-back>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            목록
          </button>
          <div class="page-bar__divider"></div>
          <div class="page-bar__title">${esc(titleText)}</div>
          <button class="btn btn--sm prs-title-more" type="button" data-prs-config-modal title="정산 설정 상세" aria-label="정산 설정 상세">정보</button>
        </div>
        <div class="prs-page-bar__center prs-phases prs-phases--inline" data-prs-phases-host>
          ${renderPhaseStepperItems(f)}
        </div>
        <div class="prs-page-bar__right">
          ${actionButtons}
        </div>
      </div>
    `;

    pageEl.innerHTML = `
      ${pageBarHTML}
      ${isCreate ? renderWizard(f) : renderDetail(f)}
    `;
    bindForm(pageEl);
  }

  /* ============ 3단계 마법사 (create 전용) ============ */
  function renderWizard(f) {
    const cur = f.step || 1;
    const stepLabel = ['기본 정보', '정산 대상자', '지급·공제 항목'];
    const stepSub   = ['귀속월·지급일·기간', '조건·대상 확정', '지급·공제 항목 구성'];
    const LAST = stepLabel.length;
    const items = [1, 2, 3].map(n => {
      const cls = n < cur ? 'is-done' : (n === cur ? 'is-current' : '');
      /* 지난 단계는 항상 클릭 이동. 앞으로는 "바로 다음 단계" 만 (현재 단계 충족 시) 허용 — 단계 건너뛰기 차단 */
      let clickable = n < cur;
      if (n === cur + 1 && isStepComplete(cur)) clickable = true;
      return `
        <li class="steps-h__item ${cls}" ${clickable ? `data-prs-wz-goto="${n}" data-step-clickable` : ''}>
          <span class="steps-h__num">${n}</span>
          <div class="steps-h__body">
            <span class="steps-h__title">${stepLabel[n - 1]}</span>
            <small class="steps-h__sub">${stepSub[n - 1]}</small>
          </div>
        </li>`;
    }).join('');

    const bodyHTML = cur === 1 ? renderSectionBasic(f, true, true)
                  : cur === 2 ? renderTargetsWithEmployees(f)
                  : renderSectionPayDeduct(f, false);   /* 지급/공제 추가·삭제는 추후 기획 — 현재는 조회만 */

    const isLast = cur === LAST;
    const footerHTML = `
      <div class="prs-wz-footer">
        <button class="btn btn--sm" type="button" data-prs-wz-cancel>취소</button>
        <div style="display:flex;gap:8px;">
          <button class="btn btn--sm" type="button" data-prs-wz-prev ${cur === 1 ? 'disabled' : ''}>이전</button>
          ${isLast
            ? `<button class="btn btn--sm btn--primary" type="button" data-prs-form-save>등록</button>`
            : `<button class="btn btn--sm btn--primary" type="button" data-prs-wz-next>다음</button>`}
        </div>
      </div>
    `;

    return `
      <div class="prs-wz-stepbar">
        <ol class="steps-h">${items}</ol>
      </div>
      <div class="prs-form-body">${bodyHTML}</div>
      ${footerHTML}
    `;
  }

  /* =========================================================
   *  Detail 본문 — 작업 영역 (이미지 기준)
   *
   *   ┌─ Phase stepper (대상자 / 지급 / 검토 / … 8개) ─┐
   *   ├─ Notice 배너 ─────────────────────────────────┤
   *   ├─ 좌측 지급항목 트리 ─ 우측 항목별 직원 테이블 ─┤
   *
   *   - 상태(registered/calculated/validated/finalized) 별로 amount 셀의 수정 가능 여부와
   *     안내 배너 문구가 달라진다.
   *   - 「정산 설정」 토글 — 상단의 configToggle 로 기본정보/대상자조건 카드를 펼쳐 편집.
   * ========================================================= */
  function renderDetail(f) {
    /* 좌측 지급항목 사이드바 — 제거됨. 「지급항목 구성」 은 정산 설정 모달에서만 편집. */
    return `
      <div class="prs-detail">
        <div class="prs-work prs-work--no-sidebar">
          <main class="prs-work__main">${renderItemEditor(f)}</main>
        </div>
      </div>
    `;
  }

  /* 사이드바 접힘 상태 — 좁은 스트립. 펼치기 화살표 + 세로 라벨. */
  function renderSidebarCollapsed() {
    return `
      <div class="prs-tree prs-tree--collapsed">
        <button class="prs-tree__expand" type="button" data-prs-sidebar-toggle aria-label="지급 항목 펼치기" title="지급 항목 펼치기">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>
        <span class="prs-tree__vlabel">지급 항목</span>
      </div>
    `;
  }

  /* ============ Phase stepper ============
   *   - 페이지바 우측 (타이틀 옆) 에 인라인 표시.
   *   - renderPhaseStepperItems(f) 는 stepper 안 내용만, renderPhaseStepper(f) 는 wrap 포함. */
  function renderPhaseStepperItems(f) {
    const active = f.activePhase || defaultPhaseByStage(f.stage, f);
    const doneIdx = progressIndex(f);
    const activeIdx = phaseIndex(active, f);

    return phasesOf(f).map((p, i) => {
      let cls = '';
      if (i < doneIdx)     cls = 'is-done';
      if (i === activeIdx) cls = (cls ? cls + ' ' : '') + 'is-active';
      const num = i < doneIdx ? '✓' : (i + 1);
      return `
        <button class="prs-phase ${cls}" type="button" data-prs-phase="${p.key}">
          <span class="prs-phase__num">${num}</span>
          <span class="prs-phase__label">${esc(p.label)}</span>
        </button>
      `;
    }).join('<span class="prs-phase__sep" aria-hidden="true">→</span>');
  }
  function renderPhaseStepper(f) {
    return `<div class="prs-phases">${renderPhaseStepperItems(f)}</div>`;
  }

  /* ============ Notice (이미지 안내 배너) ============ */
  function renderNotice(f) {
    let kind = 'info', msg = '';
    if (f.status === 'registered') {
      kind = 'info'; msg = '계산 전입니다. 대상자 확정 후 상단 [계산] 버튼으로 급여를 산출하세요.';
    } else if (f.status === 'calculated') {
      kind = 'warning'; msg = '계산이 완료되었습니다. 좌측 지급 항목별로 결과를 검토·수정 후 [검증] 하세요.';
    } else if (f.status === 'validated') {
      kind = 'warning'; msg = '검증이 완료되었습니다. [확정] 시 마감되어 수정할 수 없습니다.';
    } else if (f.status === 'finalized') {
      kind = 'success'; msg = '확정된 정산입니다. 결과만 조회 가능합니다.';
    } else if (f.status === 'canceled') {
      kind = 'danger';  msg = '중단된 정산입니다. 더 이상 진행되지 않습니다.';
    }
    if (!msg) return '';
    return `<div class="prs-notice prs-notice--${kind}"><span class="prs-notice__icon" aria-hidden="true">!</span>${esc(msg)}</div>`;
  }

  /* ============ 지급 항목 트리 (좌측) ============
   *   합계 / 고정수당 / 변동수당 / 변동 추가수당 4그룹.
   *   - 고정/변동: 지급항목 마스터의 payMethod 별 분류
   *   - 변동 추가수당: 기본(DEFAULT_PAY_ITEM_CODES) 외의 variable 항목 */
  function categorizePayItems(codes) {
    const groups = { fixed: [], variable: [], additional: [] };
    (codes || []).forEach(code => {
      const it = payItemByCode(code);
      if (!it) return;
      if (it.payMethod === 'fixed')                       groups.fixed.push(it);
      else if (DEFAULT_PAY_ITEM_CODES.includes(code))     groups.variable.push(it);
      else                                                groups.additional.push(it);
    });
    return groups;
  }
  /* 트리 렌더링 — opts 로 컨텍스트 분기
   *   opts.editable: + 추가 / ✕ 버튼 노출 여부 (사이드바는 항상 false, 설정 모달은 stage 0 에서 true)
   *   opts.showCollapse: 사이드바의 접기 버튼 노출 (모달은 불요)
   *   보호 항목(PROTECTED_PAY_ITEM_CODES)은 editable 여부와 무관하게 ✕ 숨김. */
  function renderPayItemTree(f, opts) {
    opts = opts || {};
    const editable     = !!opts.editable;
    const showCollapse = !!opts.showCollapse;
    /* showAdd 옵션 — 좌측 사이드바에서는 [+ 추가] 버튼 숨김 (모달 진입으로만 추가).
     *   미지정 시 editable 값을 따른다. */
    const showAdd      = (opts.showAdd === undefined) ? editable : !!opts.showAdd;
    const groups       = categorizePayItems(f.payItemCodes);

    const renderGroup = (title, items) => {
      if (!items.length) return '';
      return `
        <div class="prs-tree__group">
          <div class="prs-tree__group-head">${esc(title)}</div>
          <ul class="prs-tree__list">
            ${items.map(it => {
              const showX = editable && !isPayItemProtected(it.code);
              return `
                <li class="prs-tree__item">
                  <span class="prs-tree__name" title="${esc(it.name)}">${esc(it.name)}</span>
                  ${showX ? `<button class="prs-tree__del" type="button" data-prs-pi-remove="${esc(it.code)}" aria-label="삭제" title="제거">✕</button>` : ''}
                </li>
              `;
            }).join('')}
          </ul>
        </div>
      `;
    };

    return `
      <div class="prs-tree">
        <div class="prs-tree__head">
          <strong>지급 항목</strong>
          <div class="prs-tree__head-actions">
            ${showAdd ? `<button class="btn btn--xs btn--primary" type="button" data-prs-pi-add>+ 추가</button>` : ''}
            ${showCollapse ? `<button class="prs-tree__collapse" type="button" data-prs-sidebar-toggle aria-label="접기" title="접기">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>` : ''}
          </div>
        </div>
        ${renderGroup('고정수당', groups.fixed)}
        ${renderGroup('변동수당', groups.variable)}
        ${renderGroup('변동 추가수당', groups.additional)}
      </div>
    `;
  }

  /* ============ 페이즈별 에디터 (우측 메인) ============
   *   activePhase 에 따라 테이블 컬럼 구성을 바꾼다.
   *   - target : 정산 대상자 명단 (사번/이름/부서/직책/고용구분/입사일)
   *   - pay    : 기준 임금 5 + 지급 항목 5 (= 10 컬럼) + 지급금액 sticky-right
   *   - deduct : 4대보험·소득세·지방세·공제총액 + 실지급액 sticky-right
   *   - review : 지급/공제/실지급 요약 + 비고
   *   - done   : review 와 동일 (마감 상태에서 read-only) */
  function renderItemEditor(f) {
    const phase = f.activePhase || defaultPhaseByStage(f.stage, f);
    /* 셀 입력 가능: 진행 중(status=pending) + 작업 단계 1-3.
     *   지급항목 검토(1) 단계에서도 지급항목 추가 + 산출 금액 편집(정산 권한)을 허용한다. */
    const editable = f.status === 'pending' && stageOf(f) >= 1 && stageOf(f) <= 3;
    const rows = collectRows(f);
    const totals = computeTotals(f, null, rows);

    /* 페이즈별 헤더 메타 */
    const phaseMeta = {
      target: { title: '대상자', sub: '정산 대상자 명단 — 조건 매칭 + 직접 체크된 대상' },
      pay:    { title: '지급항목 검토', sub: '기준 임금 + 지급 항목별 산출. 우측 [지급금액] 은 항상 표시됩니다.' },
      deduct: { title: '공제항목 검토', sub: '4대보험 + 소득세/지방세. 우측 [실지급액] 은 항상 표시됩니다.' },
      review: { title: '정산검토', sub: '지급·공제·실지급 요약. 검증 완료 후 [정산완료] 단계로 진행하세요.' },
      done:   { title: '정산완료', sub: '확정된 정산 결과입니다. 조회 전용.' },
      ledger: { title: '급여대장', sub: '일용직 급여대장 — 일자별 근무시간·과세급여·공제·실수령액을 한 표에서 확인합니다.' },
    };
    const meta = phaseMeta[phase] || phaseMeta.target;

    /* 검색 필터 — 접기/펼치기. 재직 상태 + 이름/사번 으로 행을 필터(일괄 입력 「필터 결과만」 연동). */
    const filterActive = !!((f.search && f.search.trim()) || (f.workStateFilter && f.workStateFilter !== 'all'));
    const filterToggleHTML = `
      <button class="btn btn--sm${f.filterOpen ? ' is-active' : ''}" type="button" data-prs-filter-toggle aria-expanded="${f.filterOpen ? 'true' : 'false'}">
        <span style="display:inline-flex;align-items:center;gap:5px;">${ICON_FILTER}<span>검색 필터</span>${filterActive ? '<span class="prs-filter-dot" aria-label="필터 적용 중"></span>' : ''}</span>
      </button>`;
    const WS_OPTS = [['all', '전체'], ['active', '재직'], ['leave', '휴직'], ['retired', '퇴직']];
    const filterBarHTML = f.filterOpen ? `
      <div class="prs-filter">
        <div class="prs-filter__field">
          <span class="prs-filter__label">재직 상태</span>
          <select class="select" data-prs-filter-state style="min-width:120px;">
            ${WS_OPTS.map(([v, l]) => `<option value="${v}" ${(f.workStateFilter || 'all') === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="prs-filter__field">
          <span class="prs-filter__label">이름/사번</span>
          <input class="input input--sm" type="search" placeholder="이름 또는 사번 검색" value="${esc(f.search || '')}" data-prs-filter-name aria-label="이름 또는 사번으로 검색" />
        </div>
        <button class="btn btn--sm" type="button" data-prs-filter-reset>초기화</button>
      </div>
    ` : '';

    /* 페이즈별 테이블 */
    let tableHTML = '';
    let kpiHTML = '';
    if (phase === 'target') {
      tableHTML = renderTargetTable(f, rows);
      kpiHTML = `<span class="prs-kv"><small class="t-muted">대상</small><strong>${rows.length.toLocaleString()}명</strong></span>`;
    } else if (isDailyGroup(f)) {   /* 일용직 — ledger / done 페이즈는 통합 급여대장 단일 테이블 */
      tableHTML = renderDailyLedgerTable(f, rows, editable);
      kpiHTML = `
        <span class="prs-kv"><small class="t-muted">대상</small><strong>${rows.length.toLocaleString()}명</strong></span>
        <span class="prs-kv"><small class="t-muted">지급 합계</small><strong style="color:var(--color-brand-primary);">${fmtMoney(totals.grand)}원</strong></span>
        <span class="prs-kv"><small class="t-muted">공제 합계</small><strong style="color:var(--color-warning);">${fmtMoney(totals.ded)}원</strong></span>
        <span class="prs-kv"><small class="t-muted">실지급 합계</small><strong style="color:var(--color-brand-primary);">${fmtMoney(totals.net)}원</strong></span>
      `;
    } else if (phase === 'pay') {
      tableHTML = renderPayTable(f, rows, editable);
      kpiHTML = `
        <span class="prs-kv"><small class="t-muted">대상</small><strong>${rows.length.toLocaleString()}명</strong></span>
        <span class="prs-kv"><small class="t-muted">지급 합계</small><strong style="color:var(--color-brand-primary);">${fmtMoney(totals.grand)}원</strong></span>
      `;
    } else if (phase === 'deduct') {
      tableHTML = renderDeductTable(f, rows, editable);
      kpiHTML = `
        <span class="prs-kv"><small class="t-muted">공제 합계</small><strong style="color:var(--color-warning);">${fmtMoney(totals.ded)}원</strong></span>
        <span class="prs-kv"><small class="t-muted">실지급 합계</small><strong style="color:var(--color-brand-primary);">${fmtMoney(totals.net)}원</strong></span>
      `;
    } else {  /* review / done */
      tableHTML = renderReviewTable(f, rows);
      kpiHTML = `
        <span class="prs-kv"><small class="t-muted">지급</small><strong>${fmtMoney(totals.grand)}원</strong></span>
        <span class="prs-kv"><small class="t-muted">공제</small><strong style="color:var(--color-warning);">${fmtMoney(totals.ded)}원</strong></span>
        <span class="prs-kv"><small class="t-muted">실지급</small><strong style="color:var(--color-brand-primary);">${fmtMoney(totals.net)}원</strong></span>
      `;
    }

    /* 공제 자료 업로드(4대보험 월 고지액 / 간이세액표) 버튼은 목록 툴바로 이동됨.
     *   엑셀 다운로드 아이콘 = 임직원 관리 「조직도 다운로드」와 동일(Icons.download). */
    const dlIcon = (window.Icons && window.Icons.download) || '';
    return `
      <div class="prs-editor">
        <div class="prs-editor__toolbar">
          <div class="prs-editor__toolbar-left">
            <span class="prs-round-meta">
              <span class="prs-round-meta__k">귀속월</span>
              <strong class="prs-round-meta__v">${esc(f.accruedMonth ? dispYm(f.accruedMonth) : '-')}</strong>
              <span class="prs-round-meta__sep">|</span>
              <span class="prs-round-meta__k">정산기간</span>
              <strong class="prs-round-meta__v">${esc(periodText(f.targetFrom, f.targetTo))}</strong>
            </span>
          </div>
          <div class="prs-editor__toolbar-right">
            ${filterToggleHTML}
            ${(editable && (phase === 'pay' || phase === 'deduct')) ? `<button class="btn btn--sm" type="button" data-prs-tool="bulk" title="상여금·기타수당 등 수기 입력 항목을 전 대상자에게 한 번에 입력">일괄 입력</button>` : ''}
            <span class="prs-toolbar-div" aria-hidden="true"></span>
            <button class="btn btn--sm" type="button" data-prs-tool="excel-down"><span style="display:inline-flex;align-items:center;gap:4px;">${dlIcon}<span>엑셀 다운로드</span></span></button>
            <button class="btn btn--sm" type="button" data-prs-tool="excel-down-ylw" title="영림원 ERP 업로드 양식으로 다운로드"><span style="display:inline-flex;align-items:center;gap:4px;">${dlIcon}<span>영림원용 엑셀 다운로드</span></span></button>
          </div>
        </div>
        ${filterBarHTML}

        ${tableHTML}
      </div>
    `;
  }

  /* ----- 공통: 사번/이름 좌측 sticky 컬럼 헤더 (체크박스 제거) ----- */
  function leftStickyHeads() {
    return `
      <th class="prs-sticky-left prs-sticky-left--empno" style="width:110px;">사번</th>
      <th class="prs-sticky-left prs-sticky-left--name" style="width:90px;">이름</th>
    `;
  }
  function leftStickyCells(r) {
    return `
      <td class="prs-sticky-left prs-sticky-left--empno">${esc(r.empId)}</td>
      <td class="prs-sticky-left prs-sticky-left--name">${empCardLink(r)}</td>
    `;
  }
  /* 성명 클릭 → 인사정보카드 연동. 어느 그리드(상용직/일용직)에서든 동일 링크 사용. */
  function empCardLink(r) {
    return `<a href="#" data-prs-emp-card="${esc(r.empId)}" style="color:var(--color-brand-primary);font-weight:var(--fw-medium);">${esc(r.name)}</a>`;
  }
  function openEmpInfoCard(empId) {
    if (!(window.App && App.HRInfoCard && App.HRInfoCard.open)) return;
    const member = (App.HRInfoMgmt && App.HRInfoMgmt.list)
      ? App.HRInfoMgmt.list().find(m => m.id === empId) : null;
    if (member) App.HRInfoCard.open(member);
    else        App.HRInfoCard.open({ id: empId });
  }

  /* ----- 배부 여부 컬럼 — 확정(finalized) 정산에서만 노출. 배부 완료 시 「완료」 pill ----- */
  function hasDistribCol(f) { return f && f.status === 'finalized'; }
  function distribHead(f)   { return hasDistribCol(f) ? `<th rowspan="2" style="width:90px;text-align:center;">배부 여부</th>` : ''; }
  function distribCell(f) {
    if (!hasDistribCol(f)) return '';
    return f.payslipDistributed
      ? `<td style="text-align:center;"><span class="pill pill--success">완료</span></td>`
      : `<td style="text-align:center;"><span class="pill pill--muted">미배부</span></td>`;
  }
  function distribFootCell(f) { return hasDistribCol(f) ? `<td></td>` : ''; }

  /* ----- 정산 대상자 근로 상태 (mock, 인덱스 결정적) -----
   *   대부분 재직, 약 10% 휴직 / 10% 퇴직으로 분포. 퇴직자는 미사용 연차(일수)가 남아
   *   연차수당(= 미사용연차 × 통상일급)이 발생한다. */
  function mockWorkState(i) {
    const m = i % 10;
    if (m === 9) return 'retired';
    if (m === 7) return 'leave';
    return 'active';
  }
  function mockUnusedLeave(i) { return 3 + (i % 8); }   /* 퇴직자 미사용 연차 3~10일 */
  const WORK_STATE_META = {
    active:  { label: '재직', pill: 'success' },
    leave:   { label: '휴직', pill: 'warning' },
    retired: { label: '퇴사', pill: 'muted'   },
  };
  function workStateCell(r) {
    const m = WORK_STATE_META[r.workState] || WORK_STATE_META.active;
    return `<span class="pill pill--${m.pill}">${m.label}</span>`;
  }
  /* 2행 헤더 그리드(지급/공제/검토)용 재직 상태 컬럼 — 사번/이름 다음에 rowspan=2 로 고정. */
  function workStateHead2() { return `<th rowspan="2" style="width:80px;text-align:center;">재직 상태</th>`; }
  function workStateBodyTd(r) { return `<td style="text-align:center;">${workStateCell(r)}</td>`; }
  function workStateFootTd() { return `<td></td>`; }

  /* ----- 페이즈: 대상자 ----- */
  function renderTargetTable(f, rows) {
    const empTypeLabel = (v) => ({ regular: '정규직', contract: '계약직', daily: '일용직' }[v] || v || '-');
    /* 근로내역(근로일수·근로시간) — 근태 자동 반영(mock). 일용직은 일자별 합계(workHours), 상용직은 기본+가산. */
    const workHoursOf = (r) => isDailyGroup(f) ? (Number(r.workHours) || (Number(r.workDays) || 0) * 8) : stdWorkHours(r);
    /* 미사용 연차 — 퇴직자 + 잔여 연차가 있을 때만 일수 표시(연차수당 정산 근거), 그 외 '-' */
    const unusedLeaveCell = (r) => (r.workState === 'retired' && Number(r.unusedLeave) > 0)
      ? `${Number(r.unusedLeave)}일`
      : '<span class="t-muted">-</span>';
    const bodyHTML = !rows.length
      ? `<tr><td colspan="9" class="prs-empty" style="padding:32px 16px;">표시할 대상자가 없습니다.</td></tr>`
      : rows.map(r => `
          <tr data-prs-ledger-row="${r._idx}" data-empno="${esc(r.empId)}" data-name="${esc(r.name)}" data-workstate="${esc(r.workState || 'active')}">
            ${leftStickyCells(r)}
            <td>${esc(r.dept || '-')}</td>
            <td style="text-align:center;">${esc(r.position || '-')}</td>
            <td style="text-align:center;">${esc(empTypeLabel(r.empType))}</td>
            <td style="text-align:right;">${Number(r.workDays) || 0}</td>
            <td style="text-align:right;">${fmtHours(workHoursOf(r))}</td>
            <td style="text-align:right;">${unusedLeaveCell(r)}</td>
            <td style="text-align:center;">${workStateCell(r)}</td>
            <td style="text-align:center;color:var(--color-text-muted);">정상</td>
          </tr>
        `).join('');
    return `
      <div class="prs-editor__table-wrap prs-table-wrap--scroll">
        <table class="prs-editor__table prs-editor__table--wide">
          <thead>
            <tr>
              ${leftStickyHeads()}
              <th style="width:240px;">부서</th>
              <th style="width:90px;text-align:center;">직책</th>
              <th style="width:90px;text-align:center;">근로 유형</th>
              <th style="width:90px;text-align:right;">근로일수</th>
              <th style="width:100px;text-align:right;">근로시간</th>
              <th style="width:100px;text-align:right;">미사용 연차</th>
              <th style="width:90px;text-align:center;">재직 상태</th>
              <th style="width:100px;text-align:center;">대상 검증</th>
            </tr>
          </thead>
          <tbody>${bodyHTML}</tbody>
        </table>
      </div>
    `;
  }

  /* ----- 페이즈: 지급 — 와이드 테이블 (2행 헤더: 기준 임금 / 지급) ----- */
  function renderPayTable(f, rows, editable) {
    const baseCols = PAY_PHASE_BASE_COLS;
    const itemCols = buildPayItemCols(f.payItemCodes);
    const itemSubTotal = payItemSubTotal(itemCols);

    /* 행 */
    const bodyHTML = !rows.length
      ? `<tr><td colspan="${baseCols.length + itemSubTotal + 6}" class="prs-empty" style="padding:32px 16px;">표시할 대상자가 없습니다.</td></tr>`
      : rows.map(r => {
          const baseCells = baseCols.map(c =>
            `<td class="prs-col prs-col--base" style="text-align:right;">${fmtMoney(r[c.key])}</td>`
          ).join('');
          const itemCells = itemCols.map(c => {
            const code = c.code;
            const amt = (r.amounts || {})[code] || 0;
            /* 시간외수당(연장/야간/휴일) 계산식은 셀 하단 여러 줄로 붙이면 행 높이가 제각각이 됨.
               → 지급항목 검토 단계에서는 금액 1줄로 통일하고, 시간 내역은 마우스오버 툴팁으로.
               (전체 계산식은 정산검토 단계의 「계산식」 컬럼에 그대로 표시됨) */
            const ftext = isReviewSplitCode(code) ? reviewFormulaText(r, code) : '';
            /* 수당 컬럼 좌측 보조 셀 — 고정연장/연장/야간/야간연장/휴일=근무시간, 연차수당=미사용 연차. */
            let hoursCell = '';
            if (payItemHasHours(code)) {
              const hrs = payItemHoursOf(r, code);
              hoursCell = `<td class="prs-col prs-col--hours" style="text-align:right;">${fmtHourCell(hrs)}</td>`;
            } else if (payItemHasLeaveDays(code)) {
              hoursCell = `<td class="prs-col prs-col--hours" style="text-align:right;">${leaveDaysCellHTML(r)}</td>`;
            }
            /* 기본급·고정연장근무수당 = 계약 동기화 → 편집 불가(읽기 전용) */
            let amtCell;
            if (editable && !isContractLockedPayCode(code)) {
              const tip = ftext ? ` title="${esc(ftext)}"` : '';
              amtCell = `<td class="prs-col prs-col--item" style="text-align:right;padding:2px 4px;"${tip}>
                <input type="number" class="input input--sm prs-amt-input" value="${amt}" min="0" step="1000" data-prs-amt="${r._idx}|${esc(code)}" />
              </td>`;
            } else {
              const lockTip = (editable && isContractLockedPayCode(code)) ? ' title="근로·임금 계약에서 산출되는 값으로 편집할 수 없습니다."' : '';
              if (ftext) {
                amtCell = `<td class="prs-col prs-col--item" style="text-align:right;">`
                  + `<span class="prs-amt-tip" title="${esc(ftext)}">${fmtMoney(amt)}</span></td>`;
              } else {
                amtCell = `<td class="prs-col prs-col--item" style="text-align:right;"${lockTip}>${fmtMoney(amt)}</td>`;
              }
            }
            return hoursCell + amtCell;
          }).join('');
          return `
            <tr data-prs-ledger-row="${r._idx}" data-empno="${esc(r.empId)}" data-name="${esc(r.name)}" data-workstate="${esc(r.workState || 'active')}">
              ${leftStickyCells(r)}
              ${workStateBodyTd(r)}
              ${workSummaryCells(r)}
              ${baseCells}
              ${itemCells}
              <td class="prs-sticky-right" style="text-align:right;">${fmtMoney(r.total)}</td>
            </tr>`;
        }).join('');

    /* ----- 합계 행 (sticky-bottom) ----- */
    const sumBase = baseCols.map(c => {
      const s = rows.reduce((a, r) => a + (Number(r[c.key]) || 0), 0);
      return `<td class="prs-col prs-col--base" style="text-align:right;">${fmtMoney(s)}</td>`;
    }).join('');
    const sumItem = itemCols.map(c => {
      const amt = rows.reduce((a, r) => a + (Number((r.amounts || {})[c.code]) || 0), 0);
      const amtTd = `<td class="prs-col prs-col--item" style="text-align:right;">${fmtMoney(amt)}</td>`;
      if (payItemHasHours(c.code)) {
        const hrs = rows.reduce((a, r) => a + payItemHoursOf(r, c.code), 0);
        return `<td class="prs-col prs-col--hours" style="text-align:right;">${hourNum(hrs)}</td>` + amtTd;
      }
      if (payItemHasLeaveDays(c.code)) {
        const days = rows.reduce((a, r) => a + (r.workState === 'retired' ? Number(r.unusedLeave) || 0 : 0), 0);
        return `<td class="prs-col prs-col--hours" style="text-align:right;">${days || '<span class="t-muted">-</span>'}</td>` + amtTd;
      }
      return amtTd;
    }).join('');
    const gTotal = rows.reduce((a, r) => a + (Number(r.total) || 0), 0);
    const footHTML = rows.length ? `
      <tfoot>
        <tr class="prs-row-sum">
          <td class="prs-sticky-left prs-sticky-left--empno">합계</td>
          <td class="prs-sticky-left prs-sticky-left--name">${rows.length}명</td>
          ${workStateFootTd()}
          <td class="prs-col prs-col--work" style="text-align:right;">${rows.reduce((a, r) => a + (Number(r.workDays) || 0), 0)}</td>
          <td class="prs-col prs-col--work" style="text-align:right;">${fmtHours(rows.reduce((a, r) => a + stdWorkHours(r), 0))}</td>
          ${sumBase}
          ${sumItem}
          <td class="prs-sticky-right" style="text-align:right;color:var(--color-brand-primary);">${fmtMoney(gTotal)}</td>
        </tr>
      </tfoot>
    ` : '';

    const itemHeadRow2 = itemCols.map(c => {
      const amtTh = `<th class="prs-col prs-col--item" style="width:${c.width}px;">${esc(c.label)}</th>`;
      if (payItemHasHours(c.code)) {
        return `<th class="prs-col prs-col--hours" style="width:${payHoursColWidth(c.code)}px;">${esc(PAY_HOURS_LABEL[c.code])}</th>` + amtTh;
      }
      if (payItemHasLeaveDays(c.code)) {
        return `<th class="prs-col prs-col--hours" style="width:90px;">미사용 연차</th>` + amtTh;
      }
      return amtTh;
    }).join('');

    return `
      <div class="prs-editor__table-wrap prs-table-wrap--scroll">
        <table class="prs-editor__table prs-editor__table--wide prs-editor__table--multi">
          <thead>
            <tr class="prs-th-row1">
              <th rowspan="2" class="prs-sticky-left prs-sticky-left--empno" style="width:110px;">사번</th>
              <th rowspan="2" class="prs-sticky-left prs-sticky-left--name" style="width:90px;">이름</th>
              ${workStateHead2()}
              <th colspan="${WORK_SUMMARY_COLS.length}" class="prs-th-group prs-th-group--work">근로내역</th>
              <th colspan="${baseCols.length}" class="prs-th-group prs-th-group--base">기준 임금</th>
              <th colspan="${itemSubTotal}" class="prs-th-group prs-th-group--pay">지급항목</th>
              <th rowspan="2" class="prs-sticky-right" style="width:140px;text-align:right;">지급합계</th>
            </tr>
            <tr class="prs-th-row2">
              ${workSummaryHeads()}
              ${baseCols.map(c => `<th class="prs-col prs-col--base" style="width:${c.width}px;">${esc(c.label)}</th>`).join('')}
              ${itemHeadRow2}
            </tr>
          </thead>
          <tbody>${withFillRow(bodyHTML, rows.length)}</tbody>
          ${footHTML}
        </table>
      </div>
    `;
  }

  /* ----- 페이즈: 공제 (2행 헤더: 공제 12 컬럼) ----- */
  /* 컬럼 정의 — 사용자가 지정한 12 항목 순서 그대로. width 는 헤더 라벨이 줄바꿈 없이 들어가는 최소치. */
  const DEDUCT_COLUMNS = [
    { key: 'pension',         code: 'DED-SYS-001', label: '국민연금',             width: 110 },
    { key: 'health',          code: 'DED-SYS-002', label: '건강보험',             width: 110 },
    { key: 'ltcare',          code: 'DED-SYS-003', label: '노인장기요양보험',     width: 140 },
    { key: 'employ',          code: 'DED-SYS-004', label: '고용보험',             width: 110 },
    { key: 'smeReduction',    code: 'DED-SYS-013', label: '중소기업 소득세 감면', width: 150, kind: 'rate' },
    { key: 'incomeTax',       code: 'DED-SYS-005', label: '소득세',               width: 100 },
    { key: 'localTax',        code: 'DED-SYS-006', label: '지방소득세',           width: 120 },
    { key: 'adjIncomeTax',    code: 'DED-SYS-014', label: '정산소득세',           width: 120, manual: true },
    { key: 'adjLocalTax',     code: 'DED-SYS-015', label: '정산지방소득세',       width: 140, manual: true },
    { key: 'adjIncomeTaxMid', code: 'DED-SYS-007', label: '정산소득세(중도)',     width: 140, manual: true },
    { key: 'adjLocalTaxMid',  code: 'DED-SYS-008', label: '정산지방소득세(중도)', width: 160, manual: true },
    { key: 'adjHealth',       code: 'DED-SYS-011', label: '정산건강보험',         width: 130, manual: true },
    { key: 'adjLtcare',       code: 'DED-SYS-012', label: '정산노인장기요양보험', width: 160, manual: true },
    { key: 'adjFarmTax',      code: 'DED-SYS-016', label: '정산농특세',           width: 120, manual: true },
    { key: 'debtCollect',     code: 'DED-SYS-017', label: '채권추심',             width: 110, manual: true, deletable: true },
    { key: 'tuition',         code: 'DED-SYS-009', label: '학자금공제',           width: 110, manual: true, deletable: true },
    { key: 'etcDed',          code: 'DED-SYS-010', label: '기타공제',             width: 100, manual: true, deletable: true },
  ];
  /* 법정 공제 — 필수(보호) 항목. */
  const DEDUCT_PROTECTED_KEYS = ['pension', 'health', 'ltcare', 'employ', 'incomeTax', 'localTax'];
  /* 정산 개설 시 기본 시드되는 공제 항목 — 법정 6종 + 정산 항목/기타 공제 전체(요구 세팅).
   *   smeReduction(감면율 표시)은 소득세에 종속된 표시 컬럼이라 선택 목록에서는 제외. */
  const DEDUCT_DEFAULT_CODES  = DEDUCT_COLUMNS.map(c => c.key).filter(k => k !== 'smeReduction');
  /* 삭제 가능 공제 — 채권추심 / 학자금공제 / 기타공제 (deletable 플래그). */
  function isDeductDeletable(key) { const c = deductColByKey(key); return !!(c && c.deletable); }
  function deductColByKey(key) { return DEDUCT_COLUMNS.find(c => c.key === key) || null; }
  function isDeductProtected(key) { return DEDUCT_PROTECTED_KEYS.indexOf(key) >= 0; }
  /* 그리드에 노출할 공제 컬럼 — 선택된 항목만. smeReduction 은 소득세가 선택돼 있으면 함께 노출. */
  function deductColsOf(f) {
    const sel = new Set((f && f.deductItemCodes) ? f.deductItemCodes : DEDUCT_DEFAULT_CODES);
    return DEDUCT_COLUMNS.filter(c => c.key === 'smeReduction' ? sel.has('incomeTax') : sel.has(c.key));
  }
  /* 공제 항목 컬럼에 계산된(0 이 아닌) 값이 하나라도 있는지 — 삭제 가능 여부 판단. */
  function deductHasValue(f, key) {
    const rows = (f.ledger && f.ledger.rows) || [];
    return rows.some(r => Number((r.deductions || {})[key]) > 0);
  }
  /* 공제 항목 삭제 시도 — 삭제 가능 항목이고 값이 없으면 제거, 값이 있으면 차단 메시지. */
  function tryRemoveDeductItem(f, key, pageEl) {
    if (!isDeductDeletable(key)) return;
    if (deductHasValue(f, key)) {
      window.toast && window.toast('이미 계산된 값이 있어 삭제할 수 없습니다.', 'warning');
      return;
    }
    const set = new Set(f.deductItemCodes || DEDUCT_DEFAULT_CODES);
    set.delete(key);
    f.deductItemCodes = DEDUCT_COLUMNS.map(c => c.key).filter(k => k !== 'smeReduction' && set.has(k));
    renderFormView(pageEl);
  }
  /* 컬럼 헤더용 삭제(휴지통) 버튼 — 삭제 가능 항목 + 편집 가능 단계에서만. */
  function dedColTrashBtn(c, editable) {
    if (!editable || !c.deletable) return '';
    return `<button class="prs-col-trash" type="button" data-prs-ded-colremove="${esc(c.key)}" title="삭제" aria-label="${esc(c.label)} 삭제">${ICON_TRASH}</button>`;
  }
  /* 공제 컬럼 헤더 라벨 — 삭제 가능 항목은 라벨 + 휴지통을 한 줄 가운데 정렬 래퍼로 감싼다. */
  function dedColHeadLabel(c, editable) {
    const trash = dedColTrashBtn(c, editable);
    return trash ? `<span class="prs-col-th">${esc(c.label)}${trash}</span>` : esc(c.label);
  }

  /* 공제 셀 본문 — 특수 컬럼 처리.
   *   · 중소기업 소득세 감면 : 감면율(50/70/90%) pill. 0 이면 '-'.
   *   · 소득세 : 감면 대상이면 감면 반영된 금액을 brand-primary(파랑)·굵게로 강조. */
  function dedCellHTML(r, c) {
    if (c.key === 'smeReduction') {
      const rate = Number(r.smeRate) || 0;
      return rate ? `<span class="pill pill--info">${rate}%</span>` : '<span class="t-muted">-</span>';
    }
    const v = (r.deductions || {})[c.key] || 0;
    if (c.key === 'incomeTax' && (Number(r.smeRate) || 0) > 0) {
      return `<span style="color:var(--color-brand-primary);font-weight:var(--fw-semibold);">${fmtMoney(v)}</span>`;
    }
    return v === 0 ? '<span class="t-muted">-</span>' : fmtMoney(v);
  }
  /* 공제 합계 셀 — 감면율 컬럼은 합산 의미 없으므로 공란. */
  function dedFootHTML(c, rows) {
    if (c.key === 'smeReduction') return '';
    const s = rows.reduce((a, r) => a + (Number((r.deductions || {})[c.key]) || 0), 0);
    return fmtMoney(s);
  }
  function renderDeductTable(f, rows, editable) {
    const dedCols = deductColsOf(f);
    const bodyHTML = !rows.length
      ? `<tr><td colspan="${dedCols.length + 8}" class="prs-empty" style="padding:32px 16px;">표시할 대상자가 없습니다.</td></tr>`
      : rows.map(r => {
          const cells = dedCols.map(c => {
            /* 수기 입력 공제 항목 — 편집 가능 단계에서 직접 입력. (법정 4대보험·소득세 등은 산출값) */
            if (editable && c.manual) {
              const v = (r.deductions || {})[c.key] || 0;
              return `<td class="prs-col prs-col--ded" style="text-align:right;padding:2px 4px;">`
                + `<input type="number" class="input input--sm prs-amt-input" value="${v}" min="0" step="100" data-prs-ded-amt="${r._idx}|${esc(c.key)}" /></td>`;
            }
            return `<td class="prs-col prs-col--ded" style="text-align:right;">${dedCellHTML(r, c)}</td>`;
          }).join('');
          return `
            <tr data-prs-ledger-row="${r._idx}" data-empno="${esc(r.empId)}" data-name="${esc(r.name)}" data-workstate="${esc(r.workState || 'active')}">
              ${leftStickyCells(r)}
              ${workStateBodyTd(r)}
              ${workSummaryCells(r)}
              <td style="text-align:right;color:var(--color-text-sub);">${fmtMoney(r.total)}</td>
              ${cells}
              <td style="text-align:right;font-weight:var(--fw-medium);color:var(--color-warning);" data-prs-dedtotal>${fmtMoney(r.dedTotal)}</td>
              <td class="prs-sticky-right" style="text-align:right;" data-prs-netpay>${fmtMoney(r.netPay)}</td>
            </tr>`;
        }).join('');

    /* ----- 합계 행 (sticky-bottom) ----- */
    const sum = (fn) => rows.reduce((a, r) => a + (Number(fn(r)) || 0), 0);
    const footHTML = rows.length ? `
      <tfoot>
        <tr class="prs-row-sum">
          <td class="prs-sticky-left prs-sticky-left--empno">합계</td>
          <td class="prs-sticky-left prs-sticky-left--name">${rows.length}명</td>
          ${workStateFootTd()}
          <td class="prs-col prs-col--work" style="text-align:right;">${sum(r => r.workDays)}</td>
          <td class="prs-col prs-col--work" style="text-align:right;">${fmtHours(rows.reduce((a, r) => a + stdWorkHours(r), 0))}</td>
          <td style="text-align:right;">${fmtMoney(sum(r => r.total))}</td>
          ${dedCols.map(c => `<td class="prs-col prs-col--ded" style="text-align:right;">${dedFootHTML(c, rows)}</td>`).join('')}
          <td style="text-align:right;color:var(--color-warning);">${fmtMoney(sum(r => r.dedTotal))}</td>
          <td class="prs-sticky-right" style="text-align:right;color:var(--color-brand-primary);">${fmtMoney(sum(r => r.netPay))}</td>
        </tr>
      </tfoot>
    ` : '';

    return `
      <div class="prs-editor__table-wrap prs-table-wrap--scroll">
        <table class="prs-editor__table prs-editor__table--wide prs-editor__table--multi">
          <thead>
            <tr class="prs-th-row1">
              <th rowspan="2" class="prs-sticky-left prs-sticky-left--empno" style="width:110px;">사번</th>
              <th rowspan="2" class="prs-sticky-left prs-sticky-left--name" style="width:90px;">이름</th>
              ${workStateHead2()}
              <th colspan="${WORK_SUMMARY_COLS.length}" class="prs-th-group prs-th-group--work">근로내역</th>
              <th rowspan="2" style="text-align:right;width:120px;">지급합계</th>
              <th colspan="${dedCols.length}" class="prs-th-group prs-th-group--ded">공제항목</th>
              <th rowspan="2" style="text-align:right;width:120px;">공제합계</th>
              <th rowspan="2" class="prs-sticky-right" style="width:140px;text-align:right;">실지급액</th>
            </tr>
            <tr class="prs-th-row2">
              ${workSummaryHeads()}
              ${dedCols.map(c => `<th class="prs-col prs-col--ded" style="width:${c.width}px;">${dedColHeadLabel(c, editable)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${withFillRow(bodyHTML, rows.length)}</tbody>
          ${footHTML}
        </table>
      </div>
    `;
  }

  /* ----- 페이즈: 정산검토 / 정산완료 -----
   *   지급(기준임금 5 + 지급 N, 수당은 좌측에 시간 컬럼 포함) + 공제(12) 전체를 한 테이블에 펼치고,
   *   우측에 지급총액 / 공제총액 / 실지급액(sticky) 3개 합계 컬럼.
   *   ※ 시간외수당의 시간 컬럼은 지급항목 검토 단계와 동일 구성으로 통일. */
  /* REVIEW_SPLIT_CODES — 지급항목 검토 단계의 셀 hover 툴팁(계산식)에만 사용. */
  const REVIEW_SPLIT_CODES = ['PAY-SYS-003', 'PAY-SYS-004', 'PAY-SYS-005'];
  function isReviewSplitCode(code) { return REVIEW_SPLIT_CODES.includes(code); }

  /* 시간외수당 계산식 텍스트 (HTML 라인) — row 의 otHoursBreakdown 기준.
   *   row 가 ledger 에서 온 경우만 breakdown 이 있음. 없으면 dash. */
  function reviewFormulaHTML(row, code) {
    const br = row.otHoursBreakdown || {};
    const wrap = (lines) => lines.length
      ? lines.map(l => `<div>${l}</div>`).join('')
      : '<span class="t-muted">-</span>';
    if (code === 'PAY-SYS-003') {
      const hasCover = (br.fixedOTCoverHrs || 0) > 0;   /* 고정연장수당 계약 — 약정시간 차감 */
      /* 지급(청구) 대상 시간 — 고정OT 계약은 약정 차감 후 초과분, 일반 계약은 실근무 전부 */
      const reg  = hasCover ? (br.billRegularHr || 0)      : (br.otRegularHr || 0);
      const ngt  = hasCover ? (br.billNightHr || 0)        : (br.otNightHr || 0);
      const hol  = hasCover ? (br.billHolidayHr || 0)      : (br.otHolidayHr || 0);
      const holN = hasCover ? (br.billHolidayNightHr || 0) : (br.otHolidayNightHr || 0);
      const lines = [];
      if (reg)  lines.push(`연장 <strong>${reg}h</strong> × 1.5`);
      if (ngt)  lines.push(`야간연장 <strong>${ngt}h</strong> × 2.0`);
      if (hol)  lines.push(`휴일연장 <strong>${hol}h</strong> × 2.0`);
      if (holN) lines.push(`휴일야간연장 <strong>${holN}h</strong> × 2.5`);
      return wrap(lines);
    }
    if (code === 'PAY-SYS-004') {
      const lines = [];
      if (br.nightWorkHr)   lines.push(`야간근로 <strong>${br.nightWorkHr}h</strong> × 1.5`);
      if (br.holidayNightHr) lines.push(`휴일야간 <strong>${br.holidayNightHr}h</strong> × 2.0`);
      return wrap(lines);
    }
    if (code === 'PAY-SYS-005') {
      const lines = [];
      if (br.holidayWorkHr)  lines.push(`휴일근로 <strong>${br.holidayWorkHr}h</strong> × 1.5`);
      return wrap(lines);
    }
    return '<span class="t-muted">-</span>';
  }

  /* 계산식 평문(툴팁용) — reviewFormulaHTML 의 HTML 라인을 ' · ' 로 이은 한 줄 텍스트.
   *   값이 없으면(‘-’) 빈 문자열 반환. 지급항목 검토 셀 title 에 사용. */
  function reviewFormulaText(row, code) {
    const html = reviewFormulaHTML(row, code);
    const txt = String(html)
      .replace(/<\/div>\s*<div>/g, ' · ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return (txt && txt !== '-') ? txt : '';
  }

  function renderReviewTable(f, rows) {
    const baseCols = PAY_PHASE_BASE_COLS;
    const itemCols = buildPayItemCols(f.payItemCodes);
    const itemSubTotal = payItemSubTotal(itemCols);
    const dedCols = deductColsOf(f);
    const totalCols = 2 + (hasDistribCol(f) ? 1 : 0) + 1 /* 재직 상태 */ + WORK_SUMMARY_COLS.length + baseCols.length + itemSubTotal + dedCols.length + 3;

    /* ----- 본문 ----- */
    const bodyHTML = !rows.length
      ? `<tr><td colspan="${totalCols}" class="prs-empty" style="padding:32px 16px;">표시할 대상자가 없습니다.</td></tr>`
      : rows.map(r => {
          const baseCells = baseCols.map(c =>
            `<td class="prs-col prs-col--base" style="text-align:right;">${fmtMoney(r[c.key])}</td>`
          ).join('');
          /* 지급항목 — 수당 컬럼 좌측에 「근무시간」 컬럼 (지급항목 검토 단계와 동일 구성). */
          const itemCells = itemCols.map(c => {
            const code = c.code;
            const amt = (r.amounts || {})[code] || 0;
            const amtTd = `<td class="prs-col prs-col--item" style="text-align:right;">${fmtMoney(amt)}</td>`;
            if (payItemHasHours(code)) {
              return `<td class="prs-col prs-col--hours" style="text-align:right;">${fmtHourCell(payItemHoursOf(r, code))}</td>` + amtTd;
            }
            if (payItemHasLeaveDays(code)) {
              return `<td class="prs-col prs-col--hours" style="text-align:right;">${leaveDaysCellHTML(r)}</td>` + amtTd;
            }
            return amtTd;
          }).join('');
          const dedCells = dedCols.map(c =>
            `<td class="prs-col prs-col--ded" style="text-align:right;">${dedCellHTML(r, c)}</td>`
          ).join('');
          return `
            <tr data-prs-ledger-row="${r._idx}" data-empno="${esc(r.empId)}" data-name="${esc(r.name)}" data-workstate="${esc(r.workState || 'active')}">
              ${leftStickyCells(r)}
              ${distribCell(f)}
              ${workStateBodyTd(r)}
              ${workSummaryCells(r)}
              ${baseCells}
              ${itemCells}
              ${dedCells}
              <td style="text-align:right;font-weight:var(--fw-semibold);color:var(--color-brand-primary);">${fmtMoney(r.total)}</td>
              <td style="text-align:right;font-weight:var(--fw-semibold);color:var(--color-warning);">${fmtMoney(r.dedTotal)}</td>
              <td class="prs-sticky-right" style="text-align:right;">${fmtMoney(r.netPay)}</td>
            </tr>`;
        }).join('');

    /* ----- 합계 행 ----- */
    const sumBase = baseCols.map(c => {
      const s = rows.reduce((a, r) => a + (Number(r[c.key]) || 0), 0);
      return `<td class="prs-col prs-col--base" style="text-align:right;font-weight:var(--fw-semibold);">${fmtMoney(s)}</td>`;
    }).join('');
    const sumItem = itemCols.map(c => {
      const code = c.code;
      const s = rows.reduce((a, r) => a + (Number((r.amounts || {})[code]) || 0), 0);
      const amtTd = `<td class="prs-col prs-col--item" style="text-align:right;font-weight:var(--fw-semibold);">${fmtMoney(s)}</td>`;
      if (payItemHasHours(code)) {
        const hrs = rows.reduce((a, r) => a + payItemHoursOf(r, code), 0);
        return `<td class="prs-col prs-col--hours" style="text-align:right;font-weight:var(--fw-semibold);">${hourNum(hrs)}</td>` + amtTd;
      }
      if (payItemHasLeaveDays(code)) {
        const days = rows.reduce((a, r) => a + (r.workState === 'retired' ? Number(r.unusedLeave) || 0 : 0), 0);
        return `<td class="prs-col prs-col--hours" style="text-align:right;font-weight:var(--fw-semibold);">${days || '<span class="t-muted">-</span>'}</td>` + amtTd;
      }
      return amtTd;
    }).join('');
    const sumDed = dedCols.map(c =>
      `<td class="prs-col prs-col--ded" style="text-align:right;font-weight:var(--fw-semibold);">${dedFootHTML(c, rows)}</td>`
    ).join('');
    const gTotal = rows.reduce((a, r) => a + (Number(r.total)    || 0), 0);
    const gDed   = rows.reduce((a, r) => a + (Number(r.dedTotal) || 0), 0);
    const gNet   = rows.reduce((a, r) => a + (Number(r.netPay)   || 0), 0);

    const footHTML = rows.length ? `
      <tfoot>
        <tr class="prs-row-sum">
          <td class="prs-sticky-left prs-sticky-left--empno">합계</td>
          <td class="prs-sticky-left prs-sticky-left--name">${rows.length}명</td>
          ${distribFootCell(f)}
          ${workStateFootTd()}
          <td class="prs-col prs-col--work" style="text-align:right;font-weight:var(--fw-semibold);">${rows.reduce((a, r) => a + (Number(r.workDays) || 0), 0)}</td>
          <td class="prs-col prs-col--work" style="text-align:right;font-weight:var(--fw-semibold);">${fmtHours(rows.reduce((a, r) => a + stdWorkHours(r), 0))}</td>
          ${sumBase}
          ${sumItem}
          ${sumDed}
          <td style="text-align:right;color:var(--color-brand-primary);">${fmtMoney(gTotal)}</td>
          <td style="text-align:right;color:var(--color-warning);">${fmtMoney(gDed)}</td>
          <td class="prs-sticky-right" style="text-align:right;">${fmtMoney(gNet)}</td>
        </tr>
      </tfoot>
    ` : '';

    /* ----- 헤더 (2행: 그룹 / 컬럼명) — 지급항목은 수당 좌측에 시간 컬럼 포함 ----- */
    const itemHeadRow2 = itemCols.map(c => {
      const amtTh = `<th class="prs-col prs-col--item" style="width:${c.width}px;">${esc(c.label)}</th>`;
      if (payItemHasHours(c.code)) {
        return `<th class="prs-col prs-col--hours" style="width:${payHoursColWidth(c.code)}px;">${esc(PAY_HOURS_LABEL[c.code])}</th>` + amtTh;
      }
      if (payItemHasLeaveDays(c.code)) {
        return `<th class="prs-col prs-col--hours" style="width:90px;">미사용 연차</th>` + amtTh;
      }
      return amtTh;
    }).join('');

    return `
      <div class="prs-editor__table-wrap prs-table-wrap--scroll">
        <table class="prs-editor__table prs-editor__table--wide prs-editor__table--multi">
          <thead>
            <tr class="prs-th-row1">
              <th rowspan="2" class="prs-sticky-left prs-sticky-left--empno" style="width:110px;">사번</th>
              <th rowspan="2" class="prs-sticky-left prs-sticky-left--name" style="width:90px;">이름</th>
              ${distribHead(f)}
              ${workStateHead2()}
              <th colspan="${WORK_SUMMARY_COLS.length}" class="prs-th-group prs-th-group--work">근로내역</th>
              <th colspan="${baseCols.length}" class="prs-th-group prs-th-group--base">기준 임금</th>
              <th colspan="${itemSubTotal}" class="prs-th-group prs-th-group--pay">지급항목</th>
              <th colspan="${dedCols.length}" class="prs-th-group prs-th-group--ded">공제항목</th>
              <th rowspan="2" style="text-align:right;width:120px;">지급합계</th>
              <th rowspan="2" style="text-align:right;width:120px;">공제합계</th>
              <th rowspan="2" class="prs-sticky-right" style="width:140px;text-align:right;">실지급액</th>
            </tr>
            <tr class="prs-th-row2">
              ${workSummaryHeads()}
              ${baseCols.map(c => `<th class="prs-col prs-col--base" style="width:${c.width}px;">${esc(c.label)}</th>`).join('')}
              ${itemHeadRow2}
              ${dedCols.map(c => `<th class="prs-col prs-col--ded" style="width:${c.width}px;">${esc(c.label)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${withFillRow(bodyHTML, rows.length)}</tbody>
          ${footHTML}
        </table>
      </div>
    `;
  }

  /* ----- 페이즈: 급여대장 (일용직 전용, 통합 단일 테이블) -----
   *   엑셀 「일용직 급여대장」 시트 구성을 그대로 옮김:
   *     정보(은행/계좌) · 1~말일 일별 근무시간 · 과세일수/근무시간/일당 ·
   *     과세급여/총지급액 · 공제 8종 · 공제총액 · 실수령액.
   *   - 일별 근무시간 칸은 「뉴ERP 근로일수 자동 반영」 값(근태 연동, mock).
   *   - 좌측 사번/이름 + 우측 실수령액 sticky, 일자 칸이 많아 가로 스크롤.
   *   - 초안: 조회 전용(셀 직접 수정 없음). 금액은 computeDailyLedger 산출값. */
  const DAILY_DED_COLS = [
    { key: 'incomeTax', label: '소득세',       width: 100 },
    { key: 'localTax',  label: '지방소득세',   width: 110 },
    { key: 'pension',   label: '국민연금',     width: 100 },
    { key: 'employ',    label: '고용보험',     width: 100 },
    { key: 'health',    label: '건강보험',     width: 100 },
    { key: 'ltcare',    label: '장기요양보험', width: 120 },
    { key: 'etc1',      label: '기타공제1',    width: 110 },
    { key: 'etc2',      label: '기타공제2',    width: 110 },
  ];
  function daysInMonthOf(ym) {
    if (!ym || ym.length < 7) return 31;
    const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
    const d = new Date(y, m, 0).getDate();
    return d || 31;
  }
  function renderDailyLedgerTable(f, rows, editable) {
    const dim = (f.ledger && f.ledger.daysInMonth) || daysInMonthOf(f.accruedMonth);
    const days = [];
    for (let d = 1; d <= dim; d++) days.push(d);
    const DAY_W = 34;
    const totalCols = 2 + (hasDistribCol(f) ? 1 : 0) + 1 + dim + 3 + 2 + DAILY_DED_COLS.length + 2;
    const money = (v) => (Number(v) === 0 ? '<span class="t-muted">-</span>' : fmtMoney(v));

    const bodyHTML = !rows.length
      ? `<tr><td colspan="${totalCols}" class="prs-empty" style="padding:32px 16px;">표시할 대상자가 없습니다. [대상자] 단계에서 일용직을 확정한 뒤 [급여대장 산출] 하세요.</td></tr>`
      : rows.map(r => {
          const hrs = r.dayHours || [];
          const dayCells = days.map(d => {
            const h = Number(hrs[d - 1] || 0);
            return `<td class="prs-col--day${h ? '' : ' is-zero'}" style="text-align:center;">${h ? h : '<span class="t-muted">·</span>'}</td>`;
          }).join('');
          const dedCells = DAILY_DED_COLS.map(c => {
            const v = (r.deductions || {})[c.key] || 0;
            return `<td class="prs-col prs-col--ded${v === 0 ? ' is-zero' : ''}" style="text-align:right;">${money(v)}</td>`;
          }).join('');
          return `
            <tr data-prs-ledger-row="${r._idx}" data-empno="${esc(r.empId)}" data-name="${esc(r.name)}" data-workstate="${esc(r.workState || 'active')}">
              <td class="prs-sticky-left prs-sticky-left--empno">${esc(r.empId)}</td>
              <td class="prs-sticky-left prs-sticky-left--name">${empCardLink(r)}</td>
              ${distribCell(f)}
              <td class="prs-col--info" style="text-align:right;">${fmtMoney(r.hourly)}</td>
              ${dayCells}
              <td class="prs-col--calc" style="text-align:right;">${r.workDays || 0}</td>
              <td class="prs-col--calc" style="text-align:right;">${r.workHours || 0}</td>
              <td class="prs-col--calc" style="text-align:right;">${fmtMoney(r.dailyWage)}</td>
              <td class="prs-col--pay" style="text-align:right;">${fmtMoney(r.taxablePay)}</td>
              <td class="prs-col--pay" style="text-align:right;font-weight:var(--fw-medium);color:var(--color-brand-primary);">${fmtMoney(r.total)}</td>
              ${dedCells}
              <td style="text-align:right;font-weight:var(--fw-medium);color:var(--color-warning);">${fmtMoney(r.dedTotal)}</td>
              <td class="prs-sticky-right" style="text-align:right;">${fmtMoney(r.netPay)}</td>
            </tr>`;
        }).join('');

    /* 합계 행 (sticky-bottom) */
    const sum = (fn) => rows.reduce((a, r) => a + (Number(fn(r)) || 0), 0);
    const footHTML = rows.length ? `
      <tfoot>
        <tr class="prs-row-sum">
          <td class="prs-sticky-left prs-sticky-left--empno">합계</td>
          <td class="prs-sticky-left prs-sticky-left--name">${rows.length}명</td>
          ${distribFootCell(f)}
          <td class="prs-col--info"></td>
          ${days.map(() => '<td class="prs-col--day"></td>').join('')}
          <td class="prs-col--calc" style="text-align:right;">${sum(r => r.workDays)}</td>
          <td class="prs-col--calc" style="text-align:right;">${sum(r => r.workHours)}</td>
          <td class="prs-col--calc"></td>
          <td class="prs-col--pay" style="text-align:right;">${fmtMoney(sum(r => r.taxablePay))}</td>
          <td class="prs-col--pay" style="text-align:right;color:var(--color-brand-primary);">${fmtMoney(sum(r => r.total))}</td>
          ${DAILY_DED_COLS.map(c => `<td class="prs-col prs-col--ded" style="text-align:right;">${fmtMoney(sum(r => (r.deductions || {})[c.key]))}</td>`).join('')}
          <td style="text-align:right;color:var(--color-warning);">${fmtMoney(sum(r => r.dedTotal))}</td>
          <td class="prs-sticky-right" style="text-align:right;">${fmtMoney(sum(r => r.netPay))}</td>
        </tr>
      </tfoot>
    ` : '';

    return `
      <div class="prs-editor__table-wrap prs-table-wrap--scroll">
        <table class="prs-editor__table prs-editor__table--wide prs-editor__table--multi prs-editor__table--daily">
          <thead>
            <tr class="prs-th-row1">
              <th rowspan="2" class="prs-sticky-left prs-sticky-left--empno" style="width:110px;">사번</th>
              <th rowspan="2" class="prs-sticky-left prs-sticky-left--name" style="width:90px;">이름</th>
              ${distribHead(f)}
              <th colspan="1" class="prs-th-group prs-th-group--info">사원정보</th>
              <th colspan="${dim + 3}" class="prs-th-group prs-th-group--day">근로내역 (일자별 근무시간)</th>
              <th colspan="2" class="prs-th-group prs-th-group--pay">지급항목</th>
              <th colspan="${DAILY_DED_COLS.length}" class="prs-th-group prs-th-group--ded">공제항목</th>
              <th rowspan="2" style="width:110px;text-align:right;">공제합계</th>
              <th rowspan="2" class="prs-sticky-right" style="width:140px;text-align:right;">실수령액</th>
            </tr>
            <tr class="prs-th-row2">
              <th class="prs-col--info" style="width:110px;text-align:right;">기본시급</th>
              ${days.map(d => `<th class="prs-col--day" style="width:${DAY_W}px;text-align:center;">${d}</th>`).join('')}
              <th class="prs-col--calc" style="width:90px;text-align:right;">과세일수</th>
              <th class="prs-col--calc" style="width:90px;text-align:right;">근무시간</th>
              <th class="prs-col--calc" style="width:110px;text-align:right;">일당</th>
              <th class="prs-col--pay" style="width:120px;text-align:right;">과세급여</th>
              <th class="prs-col--pay" style="width:120px;text-align:right;">총지급액</th>
              ${DAILY_DED_COLS.map(c => `<th class="prs-col--ded" style="width:${c.width}px;text-align:right;">${esc(c.label)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${withFillRow(bodyHTML, rows.length)}</tbody>
          ${footHTML}
        </table>
      </div>
    `;
  }

  /* ----- 행 데이터 모음 ----- */
  function collectRows(f) {
    /* 1) ledger 가 있으면 그 데이터를, 없으면 대상자 목록 + 기준 임금만 산출 (registered 상태 대비) */
    let baseRows = [];
    if (f.ledger && f.ledger.rows && f.ledger.rows.length) {
      baseRows = f.ledger.rows.map((r, i) => Object.assign({}, r, { _idx: i }));
    } else {
      const matched = listEmployeesMatchingFilter(f.targetFilter);
      const idSet = f.targetEmpIds
        ? (f.targetEmpIds instanceof Set ? f.targetEmpIds : new Set(f.targetEmpIds))
        : null;
      const targets = idSet ? matched.filter(e => idSet.has(e.id)) : matched;
      baseRows = targets.map((e, i) => {
        const baseAmt   = 3000000 + (i % 9) * 250000;
        const baseDay   = Math.round(baseAmt / 26);
        const baseHr    = Math.round(baseAmt / (26 * 8));
        const normalAmt = Math.round(baseAmt * 1.1);
        const normalDay = Math.round(normalAmt / 26);
        const normalHr  = Math.round(normalAmt / (26 * 8));
        return {
          _idx: i, empId: e.id, name: e.name, dept: e.dept, position: e.position,
          empStatus: e.status, empType: e.empType,
          workState: mockWorkState(i), unusedLeave: mockWorkState(i) === 'retired' ? mockUnusedLeave(i) : 0,
          baseAmt, baseDay, baseHr, normalAmt, normalDay, normalHr,
          otHours: 0, nightHr: 0, holidayHr: 0, workDays: 22,
          amounts: {}, total: 0,
          deductions: {
            pension: 0, health: 0, ltcare: 0, employ: 0,
            incomeTax: 0, localTax: 0,
            adjIncomeTaxMid: 0, adjLocalTaxMid: 0,
            tuition: 0, etcDed: 0,
            adjHealth: 0, adjLtcare: 0,
          },
          dedTotal: 0, netPay: 0,
        };
      });
    }
    /* 2) staffFilter (전체/재직/퇴직) — UI 칩 제거로 기본 'all' (필터 없음). 코드는 유지. */
    const sf = f.staffFilter || 'all';
    if (sf === 'active') baseRows = baseRows.filter(r => r.empStatus !== 'retired' && r.empStatus !== 'contractExpired');
    else if (sf === 'leave') baseRows = baseRows.filter(r => r.empStatus === 'retired' || r.empStatus === 'contractExpired');

    /* 3) 사번/이름 검색 */
    const kw = (f.search || '').trim().toLowerCase();
    if (kw) {
      baseRows = baseRows.filter(r =>
        String(r.empId || '').toLowerCase().includes(kw) ||
        String(r.name  || '').toLowerCase().includes(kw)
      );
    }
    return baseRows;
  }
  /* 호환 별칭 — 기존 호출(activeItemCode 인자) 보전. code 인자는 무시. */
  function collectRowsForItem(f, _code) { return collectRows(f); }
  function computeTotals(f, _code, rows) {
    const grand = rows.reduce((a, r) => a + (Number(r.total) || 0), 0);
    const ded   = rows.reduce((a, r) => a + (Number(r.dedTotal) || 0), 0);
    const net   = rows.reduce((a, r) => a + (Number(r.netPay) || 0), 0);
    return { grand, ded, net };
  }

  /* ============ 섹션 1. 기본 정보 ============
   *   필드 순서: 정산번호 · 정산유형 · 정산명 · 귀속월 · 지급일 · 대상자 조회기간 ·
   *              초과근무 정산기간(정기 급여만) · 설명. */
  function renderSectionBasic(f, editable, isCreate) {
    const dis = editable ? '' : 'disabled';
    const row2GT = 'grid-template-columns:130px 1fr 130px 1fr;';
    const row1GT = 'grid-template-columns:130px 1fr;';
    const isReg  = isRegularSettle(f);
    const curType = f.settlementType || 'regular';

    /* 정산유형 라디오 + 선택된 유형 안내(작게) */
    const typeRadio = (val) => `
      <label style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;">
        <input type="radio" name="prs-settle-type" data-prs-settle-type value="${val}" ${curType === val ? 'checked' : ''} ${dis} /> ${esc(SETTLE_TYPE[val].label)}
      </label>`;
    const typeCell = `
      <div style="display:flex;flex-direction:column;gap:5px;">
        <div style="display:flex;gap:18px;flex-wrap:wrap;">${typeRadio('regular')}${typeRadio('etc')}</div>
        <span class="form-help" style="font-size:var(--fs-xs);color:var(--color-text-muted);">${esc(SETTLE_TYPE[curType].desc)}</span>
      </div>`;

    /* 대상자 조회기간 / 초과근무 정산기간 행 —
       초과근무 정산기간은 정기 급여일 때만 노출. 기타는 대상자 조회기간만 1-col 로. */
    const otCell = `
      <div class="fm-tbl__value" style="gap:6px;">
        <input class="input" type="date" id="prs-f-ofrom" value="${esc(f.otFrom)}" ${dis} />
        <span style="color:var(--color-text-muted);">~</span>
        <input class="input" type="date" id="prs-f-oto" value="${esc(f.otTo)}" ${dis} />
      </div>`;
    const periodRow = isReg
      ? `<div class="fm-tbl__row fm-tbl__row--2" style="${row2GT}">
           <div class="fm-tbl__label">대상자 조회기간 ${REQ_MARK}</div>
           <div class="fm-tbl__value" style="gap:6px;">
             <input class="input" type="date" id="prs-f-tfrom" value="${esc(f.targetFrom)}" ${dis} />
             <span style="color:var(--color-text-muted);">~</span>
             <input class="input" type="date" id="prs-f-tto" value="${esc(f.targetTo)}" ${dis} />
           </div>
           <div class="fm-tbl__label">초과근무 정산기간 ${REQ_MARK}</div>
           ${otCell}
         </div>`
      : `<div class="fm-tbl__row fm-tbl__row--1" style="${row1GT}">
           <div class="fm-tbl__label">대상자 조회기간 ${REQ_MARK}</div>
           <div class="fm-tbl__value" style="gap:6px;">
             <input class="input" type="date" id="prs-f-tfrom" value="${esc(f.targetFrom)}" ${dis} />
             <span style="color:var(--color-text-muted);">~</span>
             <input class="input" type="date" id="prs-f-tto" value="${esc(f.targetTo)}" ${dis} />
           </div>
         </div>`;

    return sectionCard(1, '기본 정보', `
      <div class="fm-tbl fm-tbl--compact fm-tbl--bordered fm-tbl--form">
        <div class="fm-tbl__row fm-tbl__row--2" style="${row2GT}">
          <div class="fm-tbl__label">정산번호</div>
          <div class="fm-tbl__value">
            <input type="text" class="input" id="prs-f-id" value="${esc(f.id)}" style="width:100%;max-width:200px;background:var(--color-surface-alt);" disabled />
          </div>
          <div class="fm-tbl__label">정산유형 ${REQ_MARK}</div>
          <div class="fm-tbl__value">${typeCell}</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" style="${row1GT}">
          <div class="fm-tbl__label">정산명 ${REQ_MARK}</div>
          <div class="fm-tbl__value">
            <input class="input" type="text" id="prs-f-name" value="${esc(f.name)}" placeholder="예: 2026년 5월 정기 급여 정산" style="width:100%;max-width:480px;" ${dis} />
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--2" style="${row2GT}">
          <div class="fm-tbl__label">귀속월 ${REQ_MARK}</div>
          <div class="fm-tbl__value">
            <input class="input" type="month" id="prs-f-month" value="${esc(f.accruedMonth)}" style="width:160px;" ${dis} />
          </div>
          <div class="fm-tbl__label">지급일 ${REQ_MARK}</div>
          <div class="fm-tbl__value">
            <input class="input" type="date" id="prs-f-paydate" value="${esc(f.payDate)}" style="width:160px;" ${dis} />
          </div>
        </div>
        ${periodRow}
        <div class="fm-tbl__row fm-tbl__row--1" style="${row1GT}">
          <div class="fm-tbl__label">설명</div>
          <div class="fm-tbl__value">
            <input class="input" type="text" id="prs-f-desc" value="${esc(f.description)}" placeholder="정산에 대한 메모/안내" style="width:100%;" ${dis} />
          </div>
        </div>
        ${isCreate ? '' : `
          <div class="fm-tbl__row fm-tbl__row--2" style="${row2GT}">
            <div class="fm-tbl__label">생성자</div>
            <div class="fm-tbl__value">${esc(f.createdBy || '-')}</div>
            <div class="fm-tbl__label">생성일</div>
            <div class="fm-tbl__value">${esc(f.createdAt ? dispYmd(f.createdAt) : '-')}</div>
          </div>
        `}
      </div>
    `, { help: isCreate ? '정산유형·정산명·귀속월·지급일·기간을 입력하세요.' : '' });
  }

  /* ============ 섹션 2. 정산 대상자 (필터) ============ */
  /* 근로유형(상용직 하위) — 정규직 / 계약직 (일용직은 별도 그룹) */
  const WORK_TYPE_OPTIONS = EMP_TYPE_OPTIONS.filter(o => o.value !== 'daily');
  function renderSectionTargets(f, editable) {
    const tf = f.targetFilter;
    const dis = editable ? '' : 'disabled';
    const group = tf.empGroup || 'standard';
    const isDaily = group === 'daily';

    const chkboxes = (items, selected, name) => items.map(o => `
      <label class="cb"><input type="checkbox" data-prs-tf="${name}" value="${esc(o.value)}" ${selected.includes(o.value) ? 'checked' : ''} ${dis} /> ${esc(o.label)}</label>
    `).join('');
    const radio = (val, label) => `
      <label style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;">
        <input type="radio" name="prs-emp-group" data-prs-group value="${val}" ${group === val ? 'checked' : ''} ${dis} /> ${esc(label)}
      </label>`;
    const opts = (items, selected) => ['<option value="">전체</option>',
      ...items.map(v => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(v)}</option>`)
    ].join('');

    const row2GT = 'grid-template-columns:130px 1fr 110px 1fr;';

    /* 근로유형 셀 — 상용직이면 정규직/계약직 체크박스, 일용직이면 단일 유형 안내 */
    const workTypeCell = isDaily
      ? `<span class="t-muted" style="font-size:var(--fs-sm);">일용직 (단일 유형)</span>`
      : `<div style="display:flex;gap:14px;flex-wrap:wrap;">${chkboxes(WORK_TYPE_OPTIONS, tf.empType || [], 'empType')}</div>`;

    return sectionCard(2, '정산 대상자 조건', `
      <div class="fm-tbl fm-tbl--compact fm-tbl--bordered fm-tbl--form">
        <div class="fm-tbl__row fm-tbl__row--2" style="${row2GT}">
          <div class="fm-tbl__label">정산 그룹 ${REQ_MARK}</div>
          <div class="fm-tbl__value" style="gap:18px;flex-wrap:wrap;">${radio('standard', '상용직 그룹')}${radio('daily', '일용직 그룹')}</div>
          <div class="fm-tbl__label">근로유형</div>
          <div class="fm-tbl__value" style="gap:14px;flex-wrap:wrap;">${workTypeCell}</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--2" style="${row2GT}">
          <div class="fm-tbl__label">사원 유형</div>
          <div class="fm-tbl__value" style="gap:14px;flex-wrap:wrap;">${chkboxes(JOB_CAT_OPTIONS, tf.jobCat || [], 'jobCat')}</div>
          <div class="fm-tbl__label">직책</div>
          <div class="fm-tbl__value">
            <select class="select" id="prs-tf-position" style="width:100%;max-width:260px;" ${dis}>${opts(POSITION_OPTIONS, tf.position)}</select>
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" style="grid-template-columns:130px 1fr;">
          <div class="fm-tbl__label">부서</div>
          <div class="fm-tbl__value">
            <select class="select" id="prs-tf-dept" style="width:100%;max-width:340px;" ${dis}>${opts(DEPT_OPTIONS, tf.dept)}</select>
          </div>
        </div>
      </div>
    `, { help: '정산 기간 중 1일이라도 근무 이력이 있으면 재직·휴직·퇴직 구분 없이 대상자로 포함됩니다.' });
  }

  /* ============ Step 2 (create 전용) — 조건 카드 안에 직원 목록까지 같이 표시 ============ */
  function renderTargetsWithEmployees(f) {
    const card = renderSectionTargets(f, true);
    const list = renderTargetEmployees(f);
    return card.replace(/<\/section>\s*$/, list + '</section>');
  }

  function renderTargetEmployees(f) {
    const matched = listEmployeesMatchingFilter(f.targetFilter);
    const sel = f.targetEmpIds;
    const isSelected = (id) => sel ? sel.has(id) : true;
    const selCount = sel ? matched.filter(e => sel.has(e.id)).length : matched.length;
    const total = matched.length;
    const allChecked = total > 0 && selCount === total;
    const noneChecked = selCount === 0;
    const empTypeLabel = (v) => ({ regular: '정규직', contract: '계약직', daily: '일용직' }[v] || v || '-');
    const jobCatLabel  = (v) => ({ office: '사무직', production: '생산직', research: '연구직' }[v] || v || '-');

    const rowsHTML = !total
      ? `<tr><td colspan="7" style="text-align:center;color:var(--color-text-muted);padding:32px 0;">조건에 맞는 대상자가 없습니다. 위 조건을 조정하세요.</td></tr>`
      : matched.map(e => {
          const checked = isSelected(e.id);
          return `
            <tr data-prs-emp-row="${esc(e.id)}" class="${checked ? 'is-selected' : ''}">
              <td style="text-align:center;width:40px;"><input type="checkbox" data-prs-emp-cb value="${esc(e.id)}" ${checked ? 'checked' : ''} /></td>
              <td style="white-space:nowrap;">${esc(e.id)}</td>
              <td style="white-space:nowrap;">${esc(e.name)}</td>
              <td style="white-space:nowrap;">${esc(e.dept || '-')}</td>
              <td style="white-space:nowrap;">${esc(e.position || '-')}</td>
              <td style="white-space:nowrap;">${esc(empTypeLabel(e.empType))}</td>
              <td style="white-space:nowrap;">${esc(jobCatLabel(e.jobCat))}</td>
            </tr>`;
        }).join('');

    const blockLabel = `
      <div class="prs-block-head">
        <div>
          <span class="prs-block-head__label">대상자 목록</span>
          <small class="prs-block-head__help">조건에 매칭된 직원 중 정산 대상으로 포함할 사람을 체크합니다.</small>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="prs-block-head__count">선택 <strong>${selCount.toLocaleString()}</strong><span class="t-muted"> / ${total.toLocaleString()} 명</span></span>
          <span style="display:flex;gap:6px;">
            <button class="btn btn--xs" type="button" data-prs-emp-all>전체 선택</button>
            <button class="btn btn--xs" type="button" data-prs-emp-none>전체 해제</button>
          </span>
        </div>
      </div>`;

    const tableHTML = `
      <div class="prs-emp-wrap">
        <table class="tbl tbl--bordered tbl--compact tbl--hover" style="margin:0;">
          <thead>
            <tr>
              <th style="background:var(--color-surface-alt);text-align:center;width:48px;">
                <input type="checkbox" data-prs-emp-check-all ${allChecked ? 'checked' : ''} ${!total ? 'disabled' : ''} aria-label="전체 선택" />
              </th>
              <th style="background:var(--color-surface-alt);text-align:center;width:120px;">사번</th>
              <th style="background:var(--color-surface-alt);text-align:center;width:100px;">성명</th>
              <th style="background:var(--color-surface-alt);">부서</th>
              <th style="background:var(--color-surface-alt);text-align:center;width:90px;">직책</th>
              <th style="background:var(--color-surface-alt);text-align:center;width:90px;">고용구분</th>
              <th style="background:var(--color-surface-alt);text-align:center;width:90px;">직군</th>
            </tr>
          </thead>
          <tbody data-prs-emp-body>${rowsHTML}</tbody>
        </table>
      </div>
      ${noneChecked && total > 0 ? `<div class="prs-emp-warn">최소 1명 이상 선택해야 다음 단계로 이동할 수 있습니다.</div>` : ''}`;

    return `<div data-prs-sec="target-list" class="prs-target-list">${blockLabel}${tableHTML}</div>`;
  }

  /* ============ 섹션 3. 지급·공제 항목 구성 (위저드 3단계 — 나란히) ============
   *   왼쪽: 지급 항목 / 오른쪽: 공제 항목.
   *   - 지급 기본 항목은 보호(✕ 미노출), 추가 항목만 ✕ 로 제외 가능.
   *   - 공제 법정 필수(4대보험·소득세·지방소득세)는 제거 불가(✕ 미노출), 선택 공제는 ✕ 로 제외 가능. */
  function renderSectionPayDeduct(f, editable) {
    const all = allPayItems();
    const chosenPay = (f.payItemCodes || []).map(code => all.find(x => x.code === code) || { code, name: '(미정의)' });
    const selKeys = (f.deductItemCodes || DEDUCT_DEFAULT_CODES);
    const chosenDed = selKeys.map(k => deductColByKey(k)).filter(Boolean);

    const payCol = `
      <div class="prs-pi-left">
        <div class="prs-pi-left__head">
          <div><strong>지급 항목 (${chosenPay.length})</strong></div>
        </div>
        <ul class="prs-pi-list">
          ${chosenPay.map((it, idx) => renderPayItemRow(it, idx, editable)).join('')}
        </ul>
      </div>`;

    const dedCol = `
      <div class="prs-pi-left">
        <div class="prs-pi-left__head">
          <div><strong>공제 항목 (${chosenDed.length})</strong></div>
        </div>
        <ul class="prs-pi-list">
          ${chosenDed.map((c, idx) => renderDeductItemRow(c, idx, editable)).join('')}
        </ul>
      </div>`;

    return sectionCard(3, '지급·공제 항목 구성',
      `<div class="prs-pi-layout prs-pi-layout--even">${payCol}${dedCol}</div>`,
      { help: '' });
  }
  function renderDeductItemRow(c, idx, editable) {
    /* 공제 항목 — 지급 항목과 동일 포맷(코드 + 기본 항목). 법정 필수 뱃지는 노출하지 않음. */
    return `
      <li class="prs-pi-item" data-prs-ded-row="${esc(c.key)}">
        <span class="prs-pi-item__idx">${idx + 1}</span>
        <div class="prs-pi-item__body">
          <div class="prs-pi-item__name">${esc(c.label)}</div>
          <div class="prs-pi-item__meta">
            <code>${esc(c.code || c.key)}</code>
            <span class="prs-divider">·</span>
            <span class="t-muted">기본 항목</span>
          </div>
        </div>
        ${editable && c.deletable ? `<button class="btn btn--xs btn--soft-danger" type="button" data-prs-ded-remove="${esc(c.key)}" aria-label="삭제">✕</button>` : ''}
      </li>`;
  }

  function renderPayItemRow(it, idx, editable) {
    const taxLabel = it.taxType === 'taxable' ? '과세'
                   : it.taxType === 'nontax'  ? '비과세'
                   : it.taxType === 'partial' ? '일부 비과세' : '-';
    const methodLabel = it.payMethod === 'fixed' ? '고정' : (it.payMethod === 'variable' ? '변동' : '-');
    const ord = it.ordinaryWage ? '<span class="pill pill--info" style="margin-left:4px;">통상</span>' : '';
    const isDefault = DEFAULT_PAY_ITEM_CODES.includes(it.code);
    return `
      <li class="prs-pi-item" data-prs-pi-row="${esc(it.code)}">
        <span class="prs-pi-item__idx">${idx + 1}</span>
        <div class="prs-pi-item__body">
          <div class="prs-pi-item__name">${esc(it.name)} ${ord}</div>
          <div class="prs-pi-item__meta">
            <span>${esc(methodLabel)}</span>
            <span class="prs-divider">·</span>
            <span>${esc(taxLabel)}</span>
            <span class="prs-divider">·</span>
            <code>${esc(it.code)}</code>
            ${isDefault ? '<span class="prs-divider">·</span><span class="t-muted">기본 항목</span>' : ''}
          </div>
        </div>
        ${editable && !isPayItemProtected(it.code) ? `<button class="btn btn--xs btn--soft-danger" type="button" data-prs-pi-remove="${esc(it.code)}" aria-label="삭제">✕</button>` : ''}
      </li>
    `;
  }


  /* ============ 섹션 4. 급여대장 (계산 결과) ============ */
  function renderSectionLedger(f) {
    const ledger = f.ledger;
    if (!ledger || !ledger.rows || !ledger.rows.length) {
      const empty = `<div class="prs-empty">계산 결과가 없습니다.</div>`;
      return sectionCard(4, '급여대장', empty, { help: '' });
    }
    const editable = f.status === 'calculated';   /* 검증 단계 = 계산 결과 수정 가능 */
    const chosen = (f.payItemCodes || []).map(code => payItemByCode(code) || { code, name: '(미정의)' });

    const headPay = chosen.map(it => `<th style="text-align:right;min-width:110px;">${esc(it.name)}</th>`).join('');

    const totalsPay = chosen.map(it => {
      const sum = ledger.rows.reduce((a, r) => a + (Number((r.amounts || {})[it.code]) || 0), 0);
      return `<td style="text-align:right;font-weight:var(--fw-semibold);">${fmtMoney(sum)}</td>`;
    }).join('');
    const grandTotal = ledger.rows.reduce((a, r) => a + (Number(r.total) || 0), 0);

    const rowsHTML = ledger.rows.map((r, ri) => {
      const cells = chosen.map(it => {
        const v = (r.amounts || {})[it.code] || 0;
        /* 기본급·고정연장근무수당 = 계약 동기화 → 편집 불가(읽기 전용) */
        if (editable && !isContractLockedPayCode(it.code)) {
          return `<td style="text-align:right;padding:2px 4px;"><input type="number" class="input input--sm prs-amt-input" value="${v}" min="0" step="1000" data-prs-amt="${ri}|${esc(it.code)}" /></td>`;
        }
        const lockTip = (editable && isContractLockedPayCode(it.code)) ? ' title="근로·임금 계약에서 산출되는 값으로 편집할 수 없습니다."' : '';
        return `<td style="text-align:right;"${lockTip}>${fmtMoney(v)}</td>`;
      }).join('');
      return `
        <tr data-prs-ledger-row="${ri}">
          <td>${esc(r.empId)}</td>
          <td>${esc(r.name)}</td>
          <td>${esc(r.dept || '-')}</td>
          ${cells}
          <td style="text-align:right;font-weight:var(--fw-semibold);color:var(--color-brand-primary);" data-prs-row-total>${fmtMoney(r.total)}</td>
        </tr>`;
    }).join('');

    const body = `
      <div class="prs-ledger-summary">
        <div class="prs-kpi">
          <div class="prs-kpi__label">대상자</div>
          <div class="prs-kpi__value">${ledger.rows.length.toLocaleString()}<small>명</small></div>
        </div>
        <div class="prs-kpi">
          <div class="prs-kpi__label">지급 총액</div>
          <div class="prs-kpi__value">${fmtMoney(grandTotal)}<small>원</small></div>
        </div>
        <div class="prs-kpi">
          <div class="prs-kpi__label">평균 지급액</div>
          <div class="prs-kpi__value">${fmtMoney(grandTotal / (ledger.rows.length || 1))}<small>원</small></div>
        </div>
      </div>

      <div class="prs-ledger-wrap prs-ledger-wrap--full">
        <table class="tbl tbl--bordered tbl--compact tbl--hover" style="margin:0;">
          <thead>
            <tr>
              <th style="width:100px;">사번</th>
              <th style="width:80px;">성명</th>
              <th>부서</th>
              ${headPay}
              <th style="text-align:right;min-width:110px;">지급 총액</th>
            </tr>
          </thead>
          <tbody>${rowsHTML}</tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="text-align:right;font-weight:var(--fw-semibold);background:var(--color-surface-alt);">합계</td>
              ${totalsPay}
              <td style="text-align:right;font-weight:var(--fw-semibold);background:var(--color-surface-alt);color:var(--color-brand-primary);" data-prs-grand-total>${fmtMoney(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      ${editable ? '<small class="t-muted" style="display:block;margin-top:8px;">※ 「검증 완료」 전까지 셀 값을 직접 수정할 수 있습니다. 행 합계와 총계는 자동 갱신됩니다.</small>' : ''}
    `;

    return sectionCard(4, '급여대장', body, { help: f.status === 'finalized' ? '확정된 결과입니다.' : '' });
  }

  /* ============ Form 바인딩 ============ */
  function bindForm(pageEl) {
    const backBtn = pageEl.querySelector('[data-prs-form-back]');
    if (backBtn) backBtn.addEventListener('click', exitForm);

    const saveBtn = pageEl.querySelector('[data-prs-form-save]');
    if (saveBtn) saveBtn.addEventListener('click', saveForm);

    const delBtn = pageEl.querySelector('[data-prs-form-delete]');
    if (delBtn) delBtn.addEventListener('click', () => {
      if (!STATE.editingId) return;
      if (!confirm('이 정산을 삭제하시겠습니까?')) return;
      STATE.rounds = STATE.rounds.filter(r => r.id !== STATE.editingId);
      window.toast && window.toast('1건 삭제 완료', 'success');
      exitForm();
    });

    /* 액션 (advance / cancel / export) — 단계 기반 워크플로우 */
    pageEl.querySelectorAll('[data-prs-act]').forEach(b => b.addEventListener('click', e => {
      const action = e.currentTarget.dataset.prsAct;
      const r = STATE.rounds.find(x => x.id === STATE.editingId);
      if (!r) return;

      const refresh = () => {
        STATE.form = cloneRoundForEdit(r);
        renderFormView(pageEl);
      };

      if (action === 'advance') {
        const st = stageOf(r);
        /* stage 0 → 1 : 「지급」 전이 — 정산 설정 잠금 + ledger 산출. 모달 확인 필요 */
        if (st === 0) {
          if (!validateStep(1)) return;
          openCalcConfirmModal(r, () => {
            r.ledger = computeLedger(r);
            r.stage  = 1;
            window.toast && window.toast(`급여 계산 완료 — ${r.ledger.rows.length}명 산출`, 'success');
            refresh();
          });
          return;
        }
        /* 「정산 확정」 = 마지막 직전 단계(상용직 정산검토 stage3 / 일용직 급여대장 stage1)에서 발동.
         *   확정 시 최종 잠금(status=finalized) + 정산완료(마지막) 단계로 체크 이동. */
        if (st === phasesOf(r).length - 2) {
          openFinalizeConfirmModal(r, () => {
            if (STATE.form && STATE.form.ledger) r.ledger = deepClone(STATE.form.ledger);
            r.stage  = phasesOf(r).length - 1;   /* 정산완료 단계 체크 */
            r.status = 'finalized';
            window.toast && window.toast('정산 확정 완료', 'success');
            refresh();
          });
          return;
        }
        /* stage 1→2, 2→3 : 단순 단계 진행 */
        if (STATE.form && STATE.form.ledger) r.ledger = deepClone(STATE.form.ledger);
        r.stage = st + 1;
        window.toast && window.toast(`${phasesOf(r)[r.stage].label} 단계로 이동`, 'success');
        refresh();
      } else if (action === 'cancel') {
        openCancelConfirmModal(r, () => {
          r.status = 'canceled';
          window.toast && window.toast('정산 중단됨', 'info');
          refresh();
        });
      } else if (action === 'distribute') {
        if (!confirm('확정된 급여명세서를 대상자에게 배부하시겠습니까?')) return;
        r.payslipDistributed = true;
        window.toast && window.toast(`급여명세서 배부 완료 — ${(r.ledger && r.ledger.rows ? r.ledger.rows.length : 0)}명`, 'success');
        refresh();
      } else if (action === 'export') {
        window.toast && window.toast('급여대장 엑셀 다운로드 (mock)', 'info');
      } else if (action === 'export-ylw') {
        window.toast && window.toast('영림원 ERP 업로드용 엑셀 다운로드 (mock) — 영림원 계정/항목 코드 매핑 양식으로 변환됩니다.', 'info');
      }
    }));

    /* 페이지바 — 상세 모달 버튼 (detail 전용) */
    const cfgModalBtn = pageEl.querySelector('[data-prs-config-modal]');
    if (cfgModalBtn) cfgModalBtn.addEventListener('click', openConfigModal);

    /* 페이지바 — 페이즈 스텝퍼 클릭 (detail 전용).
     *   진행 정책: 「이전(완료된) 페이즈만 클릭 가능」.
     *   현재 활성 / 미완료(미래) 페이즈는 클릭 차단 — 액션 버튼(계산/검증/확정) 으로만 전진. */
    const phasesHost = pageEl.querySelector('[data-prs-phases-host]');
    if (phasesHost) phasesHost.addEventListener('click', e => {
      const b = e.target.closest('[data-prs-phase]');
      if (!b) return;
      const key = b.dataset.prsPhase;
      const f = STATE.form;
      if (!f) return;
      const idx     = phaseIndex(key, f);
      const doneIdx = progressIndex(f);
      if (idx >= doneIdx)         return;  /* 미완료 페이즈 → 클릭 차단 */
      if (key === f.activePhase)  return;  /* 이미 활성 */
      f.activePhase = key;
      phasesHost.innerHTML = renderPhaseStepperItems(f);
      refreshDetailSection(pageEl, 'work');
      const detail = pageEl.querySelector('.prs-detail');
      if (detail) applySearchToDOM(detail, f.search);
    });

    /* 마법사 네비게이션 (create 전용) */
    if (STATE.view === 'create') bindWizardNav(pageEl);

    /* 지급 항목 좌측 — 추가 / 제거 (wizard step 3 전용. detail 은 위임으로 처리) */
    if (STATE.view === 'create' && STATE.form && STATE.form.step === 3) bindPayItemActions(pageEl);

    /* Detail 작업 영역 — 클릭/입력 위임 핸들러 (한 번만 부착) */
    if (STATE.view === 'detail') bindDetailWorkArea(pageEl);

    const f = STATE.form;
    const editable = isConfigEditable(f) || STATE.view === 'create';
    if (!editable) return;

    const setVal = (sel, key) => {
      const el = pageEl.querySelector(sel); if (!el) return;
      el.addEventListener('input',  () => { f[key] = el.value; });
      el.addEventListener('change', () => { f[key] = el.value; });
    };
    setVal('#prs-f-name',    'name');
    /* #prs-f-month(귀속월) 는 아래 전용 핸들러에서 자동 채움과 함께 처리 */
    setVal('#prs-f-tfrom',   'targetFrom');
    setVal('#prs-f-tto',     'targetTo');
    setVal('#prs-f-ofrom',   'otFrom');
    setVal('#prs-f-oto',     'otTo');
    setVal('#prs-f-desc',    'description');

    /* 정산유형(정기 급여/기타) — 초과근무 정산기간 노출/안내 문구가 달라지므로 전체 재렌더 */
    pageEl.querySelectorAll('[data-prs-settle-type]').forEach(el => {
      el.addEventListener('change', () => {
        if (!el.checked) return;
        f.settlementType = el.value;
        if (f.settlementType !== 'regular') {
          f.otFrom = ''; f.otTo = '';       // 기타: 초과근무 정산기간 미사용
        } else {
          const ot = otPeriodFromMonth(f.accruedMonth);   // 정기 급여 전환 — 전월26~귀속월25 재계산
          if (ot) { f.otFrom = ot.from; f.otTo = ot.to; }
        }
        renderFormView(pageEl);
      });
    });

    /* 지급일 — 귀속월 기준으로 자동 설정되지만 수기 조정 허용 */
    const payEl = pageEl.querySelector('#prs-f-paydate');
    if (payEl) {
      payEl.addEventListener('input',  () => { f.payDate = payEl.value; });
      payEl.addEventListener('change', () => { f.payDate = payEl.value; });
    }

    /* 귀속월 — 지급일·대상자 조회기간·초과근무 정산기간 자동 채움 + 정산번호 재채번 */
    const monthEl = pageEl.querySelector('#prs-f-month');
    if (monthEl) monthEl.addEventListener('change', () => {
      f.accruedMonth = monthEl.value;
      applyAccruedMonthAutoFill(f);
      if (STATE.view === 'create') f.id = nextSettleId(STATE.rounds, f.accruedMonth);
      renderFormView(pageEl);   // 자동 채운 지급일·기간을 입력 폼에 반영
    });

    /* 대상자 필터 */
    const tf = f.targetFilter;
    /* 정산 그룹(상용직/일용직) 라디오 — 근로유형 셀 노출이 달라지므로 전체 재렌더 */
    pageEl.querySelectorAll('[data-prs-group]').forEach(el => {
      el.addEventListener('change', () => {
        if (!el.checked) return;
        tf.empGroup = el.value;
        tf.empType  = el.value === 'daily' ? ['daily'] : ['regular', 'contract'];
        renderFormView(pageEl);
      });
    });
    pageEl.querySelectorAll('[data-prs-tf]').forEach(el => {
      el.addEventListener('change', () => {
        const name = el.dataset.prsTf;
        tf[name] = Array.from(pageEl.querySelectorAll(`[data-prs-tf="${name}"]:checked`)).map(c => c.value);
        refreshTargetList(pageEl);
      });
    });
    const pos = pageEl.querySelector('#prs-tf-position');
    if (pos) pos.addEventListener('change', () => { tf.position = pos.value; refreshTargetList(pageEl); });
    const dept = pageEl.querySelector('#prs-tf-dept');
    if (dept) dept.addEventListener('change', () => { tf.dept = dept.value; refreshTargetList(pageEl); });

    /* Step 2 — 대상자 목록의 체크박스/툴바 */
    if (STATE.view === 'create' && f.step === 2) bindTargetEmployees(pageEl);

    /* Step 3 — 공제 항목 제외(✕). 삭제 가능 항목만 노출. 계산값 있으면 차단 메시지. */
    pageEl.querySelectorAll('[data-prs-ded-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        tryRemoveDeductItem(f, btn.dataset.prsDedRemove, pageEl);
      });
    });
    /* Step 3 — 지급 항목 제외(✕). 기본 항목은 보호되어 ✕ 미노출(방어적으로 처리) */
    pageEl.querySelectorAll('[data-prs-pi-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.dataset.prsPiRemove;
        if (isPayItemProtected(code)) { window.toast && window.toast('기본 지급 항목은 삭제할 수 없습니다.', 'warning'); return; }
        f.payItemCodes = (f.payItemCodes || []).filter(c => c !== code);
        renderFormView(pageEl);
      });
    });
  }

  function bindWizardNav(pageEl) {
    const f = STATE.form;
    const cancelBtn = pageEl.querySelector('[data-prs-wz-cancel]');
    if (cancelBtn) cancelBtn.addEventListener('click', exitForm);

    const prevBtn = pageEl.querySelector('[data-prs-wz-prev]');
    if (prevBtn) prevBtn.addEventListener('click', () => {
      if (f.step > 1) { f.step -= 1; renderFormView(pageEl); }
    });

    const nextBtn = pageEl.querySelector('[data-prs-wz-next]');
    if (nextBtn) nextBtn.addEventListener('click', () => {
      if (!validateStep(f.step)) return;
      if (f.step < WIZARD_LAST_STEP) { f.step += 1; renderFormView(pageEl); }
    });

    pageEl.querySelectorAll('[data-prs-wz-goto]').forEach(it => {
      it.addEventListener('click', () => {
        const target = Number(it.dataset.prsWzGoto);
        if (!Number.isFinite(target) || target === f.step) return;
        /* 뒤로는 자유 이동, 앞으로는 "바로 다음 단계" 만 허용 — 단계 건너뛰기 차단 */
        if (target < f.step) { f.step = target; renderFormView(pageEl); return; }
        if (target !== f.step + 1) return;          // 1→3 등 건너뛰기 차단
        if (!validateStep(f.step)) return;          // 현재 단계 미충족 시 안내 후 차단
        f.step = target;
        renderFormView(pageEl);
      });
    });
  }

  function validateStep(step) {
    const f = STATE.form;
    if (step === 1) {
      if (!(f.name || '').trim())    { window.toast && window.toast('정산명을 입력하세요.', 'warning'); return false; }
      if (!f.accruedMonth)           { window.toast && window.toast('귀속월을 입력하세요.', 'warning'); return false; }
      if (!f.payDate)                { window.toast && window.toast('지급일을 입력하세요.', 'warning'); return false; }
      if (!f.targetFrom || !f.targetTo) { window.toast && window.toast('대상자 조회기간을 입력하세요.', 'warning'); return false; }
      if (isRegularSettle(f) && (!f.otFrom || !f.otTo)) { window.toast && window.toast('초과근무 정산기간을 입력하세요.', 'warning'); return false; }
      return true;
    }
    if (step === 2) {
      const matched = listEmployeesMatchingFilter(f.targetFilter);
      if (!matched.length) { window.toast && window.toast('조건에 맞는 대상자가 없습니다.', 'warning'); return false; }
      const selCount = f.targetEmpIds ? matched.filter(e => f.targetEmpIds.has(e.id)).length : matched.length;
      if (selCount === 0) { window.toast && window.toast('대상자를 1명 이상 선택하세요.', 'warning'); return false; }
      return true;
    }
    if (step === 3) {
      if (!(f.payItemCodes || []).length)    { window.toast && window.toast('지급 항목을 1개 이상 추가하세요.', 'warning'); return false; }
      if (!(f.deductItemCodes || []).length) { window.toast && window.toast('공제 항목을 1개 이상 선택하세요.', 'warning'); return false; }
      return true;
    }
    return true;
  }

  /* validateStep 의 무토스트 버전 — 위저드 단계 클릭 이동 가능 여부 판정에 사용 */
  function isStepComplete(step) {
    const f = STATE.form;
    if (!f) return false;
    if (step === 1) {
      const otOk = !isRegularSettle(f) || (f.otFrom && f.otTo);
      return !!((f.name || '').trim() && f.accruedMonth && f.payDate
        && f.targetFrom && f.targetTo && otOk);
    }
    if (step === 2) {
      const matched = listEmployeesMatchingFilter(f.targetFilter);
      if (!matched.length) return false;
      const selCount = f.targetEmpIds ? matched.filter(e => f.targetEmpIds.has(e.id)).length : matched.length;
      return selCount > 0;
    }
    if (step === 3) return (f.payItemCodes || []).length > 0 && (f.deductItemCodes || []).length > 0;
    return true;
  }

  function refreshTargetList(pageEl) {
    if (STATE.view !== 'create' || (STATE.form && STATE.form.step !== 2)) return;
    const host = pageEl.querySelector('[data-prs-sec="target-list"]');
    if (!host) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = renderTargetEmployees(STATE.form);
    host.replaceWith(wrap.firstElementChild);
    bindTargetEmployees(pageEl);
  }

  function bindTargetEmployees(pageEl) {
    const f = STATE.form;
    const matched = listEmployeesMatchingFilter(f.targetFilter);
    const matchedIds = matched.map(e => e.id);

    const ensureSet = () => {
      if (!f.targetEmpIds) f.targetEmpIds = new Set(matchedIds);
      return f.targetEmpIds;
    };
    const updateHeader = () => {
      const sel = f.targetEmpIds;
      const cnt = sel ? matched.filter(e => sel.has(e.id)).length : matched.length;
      const head = pageEl.querySelector('[data-prs-sec="target-list"] .prs-block-head__count');
      if (head) head.innerHTML = `선택 <strong>${cnt.toLocaleString()}</strong><span class="t-muted"> / ${matched.length.toLocaleString()} 명</span>`;
      const all = pageEl.querySelector('[data-prs-emp-check-all]');
      if (all) {
        all.checked = matched.length > 0 && cnt === matched.length;
        all.indeterminate = cnt > 0 && cnt < matched.length;
      }
    };

    pageEl.querySelectorAll('[data-prs-emp-cb]').forEach(cb => {
      cb.addEventListener('change', () => {
        const set = ensureSet();
        if (cb.checked) set.add(cb.value);
        else            set.delete(cb.value);
        const tr = cb.closest('[data-prs-emp-row]');
        if (tr) tr.classList.toggle('is-selected', cb.checked);
        updateHeader();
      });
    });

    const allCb = pageEl.querySelector('[data-prs-emp-check-all]');
    if (allCb) allCb.addEventListener('change', () => {
      if (allCb.checked) f.targetEmpIds = new Set(matchedIds);
      else               f.targetEmpIds = new Set();
      pageEl.querySelectorAll('[data-prs-emp-cb]').forEach(cb => {
        cb.checked = allCb.checked;
        const tr = cb.closest('[data-prs-emp-row]');
        if (tr) tr.classList.toggle('is-selected', allCb.checked);
      });
      updateHeader();
    });

    const allBtn = pageEl.querySelector('[data-prs-emp-all]');
    if (allBtn) allBtn.addEventListener('click', () => { f.targetEmpIds = new Set(matchedIds); refreshTargetList(pageEl); });
    const noneBtn = pageEl.querySelector('[data-prs-emp-none]');
    if (noneBtn) noneBtn.addEventListener('click', () => { f.targetEmpIds = new Set(); refreshTargetList(pageEl); });
  }

  /* ============ Detail 작업 영역 바인딩 (이벤트 위임) ============
   *   .prs-detail 컨테이너에 한 번만 click / change / input 위임 핸들러를 단다.
   *   부분 재렌더(refreshDetailSection)는 자식 innerHTML 만 교체하므로 핸들러는 보존된다.
   *   (renderFormView 가 다시 호출되면 .prs-detail 자체가 새로 생기므로 dataset.prsBound 도 초기화) */
  function bindDetailWorkArea(pageEl) {
    const detail = pageEl.querySelector('.prs-detail');
    if (!detail || detail.dataset.prsBound === '1') return;
    detail.dataset.prsBound = '1';

    detail.addEventListener('click', e => {
      const f = STATE.form;
      if (!f) return;

      /* 성명 클릭 — 인사정보카드 오픈 (상용직/일용직 급여대장 공통) */
      const empCard = e.target.closest('[data-prs-emp-card]');
      if (empCard) { e.preventDefault(); openEmpInfoCard(empCard.dataset.prsEmpCard); return; }

      /* 공제 항목 컬럼 삭제(휴지통) — 삭제 가능 항목 + 계산값 없을 때만 */
      const dedColRm = e.target.closest('[data-prs-ded-colremove]');
      if (dedColRm) { tryRemoveDeductItem(f, dedColRm.dataset.prsDedColremove, pageEl); return; }

      /* 검색 필터 — 접기/펼치기 토글 (스크롤 위치 보존) */
      if (e.target.closest('[data-prs-filter-toggle]')) {
        f.filterOpen = !f.filterOpen;
        const sc = detail.querySelector('.prs-table-wrap--scroll');
        const sx = sc ? sc.scrollLeft : 0, sy = sc ? sc.scrollTop : 0;
        refreshDetailSection(pageEl, 'work');
        applyRowFilters(detail, f);
        const nsc = detail.querySelector('.prs-table-wrap--scroll');
        if (nsc) { nsc.scrollLeft = sx; nsc.scrollTop = sy; }
        return;
      }
      /* 검색 필터 — 초기화 */
      if (e.target.closest('[data-prs-filter-reset]')) {
        f.search = ''; f.workStateFilter = 'all';
        const nameEl = detail.querySelector('[data-prs-filter-name]'); if (nameEl) nameEl.value = '';
        const stEl   = detail.querySelector('[data-prs-filter-state]'); if (stEl) stEl.value = 'all';
        applyRowFilters(detail, f);
        return;
      }

      /* 사이드바 제거됨 — 토글 핸들러도 정리 (안전을 위해 selector 만 유지) */
      /* 지급항목 제거 (사이드바는 현재 read-only 라 안 보임. 방어적으로 유지) */
      const rmBtn = e.target.closest('[data-prs-pi-remove]');
      if (rmBtn) {
        const code = rmBtn.dataset.prsPiRemove;
        if (isPayItemProtected(code)) {
          window.toast && window.toast('기본 지급 항목은 삭제할 수 없습니다.', 'warning');
          return;
        }
        const item = payItemByCode(code);
        const name = item ? item.name : code;
        if (!confirm(`「${name}」 제거?`)) return;
        f.payItemCodes = (f.payItemCodes || []).filter(c => c !== code);
        if (f.activeItemCode === code) f.activeItemCode = (f.payItemCodes[0] || '__sum');
        refreshDetailSection(pageEl, 'work');
        window.toast && window.toast(`${name} 제거됨`, 'info');
        return;
      }
      /* 툴바 (엑셀 다운로드 / 일괄 입력) */
      const tool = e.target.closest('[data-prs-tool]');
      if (tool) {
        const t = tool.dataset.prsTool;
        if (t === 'bulk') { openBulkModal(); return; }
        if (t === 'excel-down') window.toast && window.toast('급여대장 엑셀 다운로드 (mock)', 'info');
        if (t === 'excel-down-ylw') window.toast && window.toast('영림원 ERP 업로드용 엑셀 다운로드 (mock) — 영림원 계정/항목 코드 매핑 양식으로 변환됩니다.', 'info');
        return;
      }
    });

    /* input — 검색 + 급여대장 셀 금액 */
    detail.addEventListener('input', e => {
      const f = STATE.form;
      if (!f) return;

      /* 검색 필터 — 이름/사번 입력. DOM 레벨에서 행 hide/show (포커스 유지). */
      const nIn = e.target.closest('[data-prs-filter-name]');
      if (nIn) {
        f.search = nIn.value;
        applyRowFilters(detail, f);
        return;
      }
      /* 검색 필터 — 재직 상태 선택 (select 는 input 이벤트로도 발화) */
      const wsSel = e.target.closest('[data-prs-filter-state]');
      if (wsSel) {
        f.workStateFilter = wsSel.value;
        applyRowFilters(detail, f);
        return;
      }

      /* 공제 항목 셀 직접 입력(수기) — 정산소득세·정산건강보험·채권추심 등 manual 공제 */
      const dInp = e.target.closest('[data-prs-ded-amt]');
      if (dInp) {
        if (!f.ledger) return;
        const [ri, key] = dInp.dataset.prsDedAmt.split('|');
        const drow = f.ledger.rows[Number(ri)];
        if (!drow) return;
        drow._idx = Number(ri);
        if (!drow.deductions) drow.deductions = {};
        drow.deductions[key] = Math.max(0, Number(dInp.value) || 0);
        drow.dedTotal = Object.keys(drow.deductions).reduce((a, k) => a + (Number(drow.deductions[k]) || 0), 0);
        drow.netPay = (Number(drow.total) || 0) - drow.dedTotal;
        const tr = dInp.closest('tr');
        if (tr) {
          const dt = tr.querySelector('[data-prs-dedtotal]'); if (dt) dt.textContent = fmtMoney(drow.dedTotal);
          const np = tr.querySelector('[data-prs-netpay]');   if (np) np.textContent = fmtMoney(drow.netPay);
        }
        return;
      }

      /* 셀 금액 직접 수정 (계산 완료 상태에서만) */
      const inp = e.target.closest('[data-prs-amt]');
      if (!inp) return;
      if (!f.ledger) return;
      const [rowIdx, code] = inp.dataset.prsAmt.split('|');
      if (isContractLockedPayCode(code)) return;   /* 기본급·고정연장근무수당 = 계약 동기화, 편집 불가 */
      const row = f.ledger.rows[Number(rowIdx)];
      if (!row) return;
      /* collectRows 가 렌더 시 부여한 _idx(=ledger 행 인덱스)는 원본 ledger 행에는 없으므로,
       * DOM 부분 갱신(refreshBaseCells 등)이 tr 를 찾을 수 있도록 여기서 인덱스를 세팅한다. */
      row._idx = Number(rowIdx);
      if (!row.amounts) row.amounts = {};
      row.amounts[code] = Math.max(0, Number(inp.value) || 0);
      /* 통상임금 포함 항목(기본급·식대·사용자 추가 통상수당)의 금액이 바뀌면
       *   ① 기준 임금(기본일급/기본시급/통상임금/통상일급/통상시급)을 다시 산출해 즉시 반영하고,
       *   ② 통상시급에 연동된 연장·야간·휴일근무수당 금액도 재계산해 해당 셀을 갱신한다.
       *   (포커스 중인 입력 셀은 건드리지 않고 base + 연동 OT 셀만 부분 갱신) */
      recomputeBaseWage(row, f.payItemCodes);
      const editedItem = payItemByCode(code);
      const isOrdinary = code === 'PAY-SYS-001' || (editedItem && editedItem.ordinaryWage);
      if (isOrdinary) {
        refreshBaseCells(detail, row);
        recomputeDependentOT(row, f.payItemCodes);
        refreshDependentPayCells(detail, row);
      }
      row.total = (f.payItemCodes || []).reduce((a, c) => a + (Number(row.amounts[c]) || 0), 0);
      refreshPayTotalCell(detail, row);
      const bandSum = detail.querySelector('.prs-summary-band__cell--money .prs-summary-band__value');
      if (bandSum) {
        const totals = computeTotals(f, f.activeItemCode || code, f.ledger.rows);
        bandSum.textContent = fmtMoney(totals.grand);
      }
    });
  }

  /* 기준 임금 재산출 — 셀 금액 직접 수정 시 호출.
   *   · 기본급   = 기본급 항목(PAY-SYS-001) 입력 금액 → 기본일급/기본시급 파생.
   *   · 통상임금 = 「통상임금 포함(ordinaryWage)」 항목들의 입력 금액 합계
   *                (기본급 + 식대 + 사용자가 통상임금 포함으로 추가한 고정 항목).
   *                변동 OT 항목(ordinaryWage=false)은 제외 → 통상일급/통상시급 파생.
   *   computeLedger 의 초기 산출식과 동일한 정의이므로 값이 일관 유지된다. */
  function recomputeBaseWage(row, codes) {
    const amounts = row.amounts || {};
    if (Object.prototype.hasOwnProperty.call(amounts, 'PAY-SYS-001')) {
      row.baseAmt = Math.max(0, Number(amounts['PAY-SYS-001']) || 0);
      row.baseDay = Math.round(row.baseAmt / 26);
      row.baseHr  = Math.round(row.baseDay / 8);
    }
    row.normalAmt = (codes || []).reduce((sum, c) => {
      const it = payItemByCode(c);
      return (it && it.ordinaryWage) ? sum + (Number(amounts[c]) || 0) : sum;
    }, 0);
    row.normalDay = Math.round(row.normalAmt / 26);
    row.normalHr  = Math.round(row.normalDay / 8);
  }
  /* 기준 임금 표시 셀(기본일급/기본시급/통상임금/통상일급/통상시급) 만 현재 row 값으로 DOM 교체.
   *   .prs-col--base 셀이 PAY_PHASE_BASE_COLS 순서와 1:1 일치하는 지급 페이즈에서만 동작. */
  function refreshBaseCells(scope, row) {
    if (!scope || !row) return;
    const tr = scope.querySelector(`tr[data-prs-ledger-row="${row._idx}"]`);
    if (!tr) return;
    const cells = tr.querySelectorAll('.prs-col--base');
    if (cells.length !== PAY_PHASE_BASE_COLS.length) return;
    PAY_PHASE_BASE_COLS.forEach((col, i) => {
      cells[i].textContent = fmtMoney(row[col.key]);
    });
  }

  /* 통상시급 연동 시간외수당 재산출 — 통상임금 포함 항목 금액이 바뀔 때 호출.
   *   computeLedger 의 시간외수당 산식과 동일하게 「통상시급 × 시간 × 배수」 로 재계산한다.
   *   대상: PAY-SYS-003 연장 / 004 야간 / 005 휴일근무수당 (해당 코드가 지급항목에 포함된 경우만). */
  function recomputeDependentOT(row, codes) {
    const br = row.otHoursBreakdown;
    if (!br || !row.amounts) return;
    const nh = row.normalHr || 0;
    const list = codes || [];
    if (list.indexOf('PAY-SYS-003') >= 0) {
      /* 고정연장수당 계약은 약정 차감 후 청구(초과) 시간, 일반 계약은 실근무 전부 */
      const hasCover = (br.fixedOTCoverHrs || 0) > 0;
      const reg  = hasCover ? (br.billRegularHr || 0)      : (br.otRegularHr || 0);
      const ngt  = hasCover ? (br.billNightHr || 0)        : (br.otNightHr || 0);
      const hol  = hasCover ? (br.billHolidayHr || 0)      : (br.otHolidayHr || 0);
      const holN = hasCover ? (br.billHolidayNightHr || 0) : (br.otHolidayNightHr || 0);
      row.amounts['PAY-SYS-003'] = Math.round(
        nh * reg  * 1.5 +
        nh * ngt  * 2.0 +
        nh * hol  * 2.0 +
        nh * holN * 2.5
      );
    }
    if (list.indexOf('PAY-SYS-004') >= 0) {
      /* 야간근무수당 = 야간근로*1.5 + 휴일야간*2.0 */
      row.amounts['PAY-SYS-004'] = Math.round(
        nh * (br.nightWorkHr || 0)   * 1.5 +
        nh * (br.holidayNightHr || 0) * 2.0
      );
    }
    if (list.indexOf('PAY-SYS-005') >= 0) {
      /* 휴일근무수당 = 휴일근로*1.5 */
      row.amounts['PAY-SYS-005'] = Math.round(nh * (br.holidayWorkHr || 0) * 1.5);
    }
  }
  /* 연동 재계산된 OT 입력 셀(연장/야간/휴일) 의 value 를 DOM 에 반영.
   *   포커스 중(사용자가 편집 중)인 입력은 건드리지 않는다. */
  function refreshDependentPayCells(scope, row) {
    if (!scope || !row) return;
    const tr = scope.querySelector(`tr[data-prs-ledger-row="${row._idx}"]`);
    if (!tr) return;
    ['PAY-SYS-003', 'PAY-SYS-004', 'PAY-SYS-005'].forEach(c => {
      const inp = tr.querySelector(`[data-prs-amt="${row._idx}|${c}"]`);
      if (inp && document.activeElement !== inp) inp.value = (row.amounts || {})[c] || 0;
    });
  }
  /* 우측 [지급금액] sticky 셀 갱신 */
  function refreshPayTotalCell(scope, row) {
    if (!scope || !row) return;
    const tr = scope.querySelector(`tr[data-prs-ledger-row="${row._idx}"]`);
    if (!tr) return;
    const cell = tr.querySelector('.prs-sticky-right');
    if (cell) cell.textContent = fmtMoney(row.total);
  }

  /* DOM 레벨 검색 필터 — tbody tr 의 data-empno/data-name 으로 hide/show.
   *   collectRows 가 데이터 레벨에서도 같은 필터를 적용하므로, 부분 재렌더 후에도 결과가 일관 유지됨. */
  /* 행 필터 — 이름/사번 키워드 + 재직 상태(전체/재직/휴직/퇴직)를 DOM 레벨에서 hide/show.
   *   data-workstate 속성으로 단계(ledger 유무) 무관하게 동작. */
  function applyRowFilters(detail, f) {
    if (!detail || !f) return;
    const kw = (f.search || '').trim().toLowerCase();
    const ws = f.workStateFilter || 'all';
    detail.querySelectorAll('tbody tr[data-prs-ledger-row]').forEach(tr => {
      const empno = (tr.dataset.empno || '').toLowerCase();
      const name  = (tr.dataset.name  || '').toLowerCase();
      const wsVal = tr.dataset.workstate || 'active';
      const nameOk = !kw || empno.includes(kw) || name.includes(kw);
      const wsOk   = ws === 'all' || wsVal === ws;
      tr.style.display = (nameOk && wsOk) ? '' : 'none';
    });
  }
  /* 호환 별칭 — 기존 호출부(search 인자) 보전. */
  function applySearchToDOM(detail) { applyRowFilters(detail, STATE.form); }
  /* row 객체가 현재 필터(이름+재직상태)를 통과하는지 — 일괄 입력 「필터 결과만」 대상 산정용. */
  function rowPassesFilter(r, f) {
    const kw = (f.search || '').trim().toLowerCase();
    const ws = f.workStateFilter || 'all';
    const nameOk = !kw || String(r.empId || '').toLowerCase().includes(kw) || String(r.name || '').toLowerCase().includes(kw);
    const wsOk   = ws === 'all' || (r.workState || 'active') === ws;
    return nameOk && wsOk;
  }

  /* 부분 재렌더 — 페이즈/트리/에디터/work 변경 시 .prs-detail 자식만 교체.
   *   handler 는 .prs-detail 에 위임되어 있어 자식 교체 후에도 살아있음.
   *   scope: 'phases' | 'editor' | 'tree' | 'work' */
  function refreshDetailSection(pageEl, scope) {
    const f = STATE.form;
    if (!f) return;
    const detail = pageEl.querySelector('.prs-detail');
    if (!detail) { renderFormView(pageEl); return; }

    const replace = (selector, html) => {
      const old = detail.querySelector(selector);
      if (!old) return;
      const wrap = document.createElement('div');
      wrap.innerHTML = html.trim();
      old.replaceWith(wrap.firstElementChild);
    };

    if (scope === 'phases') { replace('.prs-phases', renderPhaseStepper(f)); return; }
    if (scope === 'editor') {
      const main = detail.querySelector('.prs-work__main');
      if (main) main.innerHTML = renderItemEditor(f);
      return;
    }
    if (scope === 'tree') {
      /* 좌측 지급항목 사이드바 제거됨 — no-op (호출 호환을 위해 남겨둠) */
      return;
    }
    if (scope === 'work') {
      const work = detail.querySelector('.prs-work');
      if (work) {
        work.className = 'prs-work prs-work--no-sidebar';
        work.innerHTML = `<main class="prs-work__main">${renderItemEditor(f)}</main>`;
      }
      return;
    }
  }

  function bindPayItemActions(pageEl) {
    const f = STATE.form;
    if (!f) return;
    pageEl.querySelectorAll('[data-prs-pi-remove]').forEach(b => {
      b.addEventListener('click', e => {
        const code = e.currentTarget.dataset.prsPiRemove;
        if (isPayItemProtected(code)) {
          window.toast && window.toast('기본 지급 항목은 삭제할 수 없습니다.', 'warning');
          return;
        }
        const item = payItemByCode(code);
        const name = item ? item.name : code;
        if (!confirm(`「${name}」 제거?`)) return;
        f.payItemCodes = (f.payItemCodes || []).filter(c => c !== code);
        window.toast && window.toast(`${name} 제거됨`, 'info');
        renderFormView(pageEl);
      });
    });
  }

  function bindLedgerInputs(pageEl) {
    const f = STATE.form;
    if (!f || !f.ledger) return;
    pageEl.querySelectorAll('[data-prs-amt]').forEach(inp => {
      /* 디바운싱된 입력 — 셀 수정 중 포커스 유지하기 위해 즉시 재렌더하지 않고
       * 헤더 합계만 부분 업데이트. focus 이탈 시 안전하게 행 색상도 갱신. */
      inp.addEventListener('input', () => {
        const [rowIdx, code] = inp.dataset.prsAmt.split('|');
        const row = f.ledger.rows[Number(rowIdx)];
        if (!row) return;
        if (!row.amounts) row.amounts = {};
        row.amounts[code] = Math.max(0, Number(inp.value) || 0);
        row.total = (f.payItemCodes || []).reduce((a, c) => a + (Number(row.amounts[c]) || 0), 0);
        /* 요약 밴드 지급합계만 갱신 (셀 포커스 유지) */
        const bandSum = pageEl.querySelector('.prs-summary-band__cell--money .prs-summary-band__value');
        if (bandSum) {
          const totals = computeTotals(f, f.activeItemCode || code, f.ledger.rows);
          bandSum.textContent = fmtMoney(totals.grand);
        }
      });
    });
  }

  /* ============ 일괄 입력 (수기 항목 전 대상자 일괄) ============
   *   지급항목 검토 → 상여금/상여금2/연차수당/기타수당(+사용자 추가 수기 항목)
   *   공제항목 검토 → 정산소득세/정산건강보험/채권추심 등 manual 공제 항목
   *   - 항목 1개 + 금액 1개를 선택해 [전체] 또는 [검색 결과] 대상자에 동일 금액으로 채운다. */
  function bulkItemOptions(f) {
    const phase = f.activePhase;
    if (phase === 'deduct') {
      return deductColsOf(f).filter(c => c.manual)
        .map(c => ({ value: 'ded|' + c.key, label: c.label }));
    }
    /* pay — 수기 입력 항목(기본 상여금류) + 사용자 추가 항목. 계약 동기화(기본급·고정연장)는 제외. */
    return (f.payItemCodes || [])
      .filter(code => !isContractLockedPayCode(code)
        && (MANUAL_PAY_ITEM_CODES.includes(code) || (payItemByCode(code) || {})._custom))
      .map(code => { const it = payItemByCode(code); return { value: 'pay|' + code, label: it ? it.name : code }; });
  }
  function openBulkModal() {
    const f = STATE.form;
    if (!f) return;
    const modal = document.getElementById('modal-prs-bulk');
    const body  = modal && modal.querySelector('#prs-bulk-body');
    if (!modal || !body) return;
    const opts = bulkItemOptions(f);
    if (!opts.length) {
      window.toast && window.toast('일괄 입력할 수 있는 수기 항목이 없습니다.', 'info');
      return;
    }
    const rows  = (f.ledger && f.ledger.rows) || [];
    const filterActive = !!((f.search && f.search.trim()) || (f.workStateFilter && f.workStateFilter !== 'all'));
    const filtN = rows.filter(r => rowPassesFilter(r, f)).length;
    const phaseLabel = f.activePhase === 'deduct' ? '공제 항목' : '지급 항목';
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div>
          <label class="form-label" for="prs-bulk-item" style="display:block;margin-bottom:6px;font-weight:var(--fw-medium);">${esc(phaseLabel)}</label>
          <select class="select" id="prs-bulk-item" data-prs-bulk-item style="width:100%;">
            ${opts.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="form-label is-required" for="prs-bulk-amt" style="display:block;margin-bottom:6px;font-weight:var(--fw-medium);">금액(원)</label>
          <input class="input" type="number" id="prs-bulk-amt" data-prs-bulk-amt min="0" step="1000" placeholder="예: 500000" style="width:100%;text-align:right;" />
          <div class="field-error" data-prs-bulk-amt-err hidden style="margin-top:4px;"></div>
        </div>
        <div>
          <label class="form-label" style="display:block;margin-bottom:6px;font-weight:var(--fw-medium);">적용 대상</label>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="prs-bulk-scope" value="all" checked /> 전체 대상자 (${rows.length}명)</label>
            <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;${filterActive ? '' : 'opacity:.5;'}"><input type="radio" name="prs-bulk-scope" value="filtered" ${filterActive ? '' : 'disabled'} /> 필터 결과만 (${filtN}명)</label>
          </div>
          <div class="form-help" style="margin-top:8px;color:var(--color-text-muted);font-size:var(--fs-xs);line-height:1.6;">
            선택한 항목 컬럼이 대상자 전원에게 동일 금액으로 채워집니다.<br />이후 개별 셀에서 다시 수정할 수 있습니다.
          </div>
        </div>
      </div>
    `;
    openModal('modal-prs-bulk');
    if (!modal.dataset.prsBound) {
      modal.dataset.prsBound = '1';
      modal.addEventListener('click', e => { if (e.target === modal) closeModal('modal-prs-bulk'); });
      modal.querySelectorAll('[data-prs-bulk-close]').forEach(b => b.addEventListener('click', () => closeModal('modal-prs-bulk')));
      const okBtn = modal.querySelector('[data-prs-bulk-confirm]');
      if (okBtn) okBtn.addEventListener('click', confirmBulk);
    }
    const amtEl = modal.querySelector('[data-prs-bulk-amt]');
    if (amtEl) {
      amtEl.addEventListener('input', () => {
        amtEl.classList.remove('is-invalid');
        const err = modal.querySelector('[data-prs-bulk-amt-err]');
        if (err) err.hidden = true;
      });
      setTimeout(() => amtEl.focus(), 0);
    }
  }
  function confirmBulk() {
    const f = STATE.form;
    const modal = document.getElementById('modal-prs-bulk');
    if (!f || !modal || !f.ledger) return;
    const sel   = modal.querySelector('[data-prs-bulk-item]');
    const amtEl = modal.querySelector('[data-prs-bulk-amt]');
    const errEl = modal.querySelector('[data-prs-bulk-amt-err]');
    const raw   = (amtEl && amtEl.value || '').trim();
    /* 인라인 필드 검증 (도메인 표준 — 토스트 금지) */
    if (raw === '' || isNaN(Number(raw)) || Number(raw) < 0) {
      if (amtEl) { amtEl.classList.add('is-invalid'); amtEl.focus(); }
      if (errEl) { errEl.textContent = '0 이상의 금액을 입력해 주세요.'; errEl.hidden = false; }
      return;
    }
    const amount = Math.round(Number(raw));
    const [kind, key] = (sel && sel.value || '').split('|');
    const scope = (modal.querySelector('input[name="prs-bulk-scope"]:checked') || {}).value || 'all';
    let n = 0;
    f.ledger.rows.forEach(r => {
      if (scope === 'filtered' && !rowPassesFilter(r, f)) return;
      if (kind === 'pay') {
        if (!r.amounts) r.amounts = {};
        r.amounts[key] = amount;
        const it = payItemByCode(key);
        if (it && it.ordinaryWage) { recomputeBaseWage(r, f.payItemCodes); recomputeDependentOT(r, f.payItemCodes); }
        r.total = (f.payItemCodes || []).reduce((a, c) => a + (Number(r.amounts[c]) || 0), 0);
      } else {
        if (!r.deductions) r.deductions = {};
        r.deductions[key] = amount;
        r.dedTotal = Object.keys(r.deductions).reduce((a, k) => a + (Number(r.deductions[k]) || 0), 0);
      }
      r.netPay = (Number(r.total) || 0) - (Number(r.dedTotal) || 0);
      n++;
    });
    /* 원본 round 에도 반영 */
    if (STATE.editingId) {
      const src = STATE.rounds.find(x => x.id === STATE.editingId);
      if (src) src.ledger = deepClone(f.ledger);
    }
    const label = (sel.options[sel.selectedIndex] || {}).text || '';
    closeModal('modal-prs-bulk');
    const pageEl = document.getElementById('page-hr-pay-settlement');
    const detail = pageEl && pageEl.querySelector('.prs-detail');
    /* 재렌더 전 그리드 가로/세로 스크롤 위치 보존 — 일괄 입력 후 보던 컬럼 그대로 유지 */
    const prevScroll = detail && detail.querySelector('.prs-table-wrap--scroll');
    const sx = prevScroll ? prevScroll.scrollLeft : 0;
    const sy = prevScroll ? prevScroll.scrollTop : 0;
    refreshDetailSection(pageEl, 'work');
    if (detail) applySearchToDOM(detail, f.search);
    const newScroll = detail && detail.querySelector('.prs-table-wrap--scroll');
    if (newScroll) { newScroll.scrollLeft = sx; newScroll.scrollTop = sy; }
    window.toast && window.toast(`${label} ${fmtMoney(amount)}원 · ${n}명 일괄 입력 완료`, 'success');
  }

  /* ============ Save ============ */
  function saveForm() {
    const f = STATE.form;
    if (!validateStep(1)) return;
    if (STATE.view === 'create') {
      if (!validateStep(2)) return;
      if (!validateStep(3)) return;
      if (!validateStep(4)) return;
    }

    if (STATE.view === 'create') {
      const matched = listEmployeesMatchingFilter(f.targetFilter);
      const selectedIds = f.targetEmpIds
        ? matched.filter(e => f.targetEmpIds.has(e.id)).map(e => e.id)
        : matched.map(e => e.id);
      const newId = nextSettleId(STATE.rounds, f.accruedMonth);
      const isReg = isRegularSettle(f);
      STATE.rounds.unshift({
        id: newId, name: f.name,
        settlementType: f.settlementType || 'regular',
        accruedMonth: f.accruedMonth, payDate: f.payDate,
        targetFrom: f.targetFrom, targetTo: f.targetTo,
        otFrom: isReg ? f.otFrom : '', otTo: isReg ? f.otTo : '',
        description: f.description,
        status: 'pending',
        stage: 0,
        targetCount: selectedIds.length,
        payItemCodes: (f.payItemCodes || []).slice(),
        deductItemCodes: (f.deductItemCodes || DEDUCT_DEFAULT_CODES).slice(),
        targetFilter: f.targetFilter,
        targetEmpIds: selectedIds,
        ledger: null,
        createdBy: HR_NAME, createdAt: TODAY,
      });
      window.toast && window.toast(`${f.name} 정산이 생성되었습니다. (${newId} · 대상 ${selectedIds.length}명)`, 'success');
    } else if (STATE.editingId) {
      const r = STATE.rounds.find(x => x.id === STATE.editingId);
      if (r) {
        const isReg = isRegularSettle(f);
        Object.assign(r, {
          name: f.name,
          settlementType: f.settlementType || 'regular',
          accruedMonth: f.accruedMonth, payDate: f.payDate,
          targetFrom: f.targetFrom, targetTo: f.targetTo,
          otFrom: isReg ? f.otFrom : '', otTo: isReg ? f.otTo : '',
          description: f.description,
          targetFilter: f.targetFilter,
          payItemCodes: (f.payItemCodes || []).slice(),
          deductItemCodes: (f.deductItemCodes || DEDUCT_DEFAULT_CODES).slice(),
        });
        window.toast && window.toast('저장되었습니다.', 'success');
      }
    }
    exitForm();
  }

  /* ============ 계약 임금 동기화 ============
   *   지급항목 검토의 기본급/고정연장근무수당은 단일 진실원인
   *   「인사정보 관리(App.HRInfoMgmt)」의 임금계약을 사용한다.
   *   과거 정산 복제 등 직원 스냅샷이 전달된 경우에만 emp.id 로 최신 마스터 행을 보정 조회한다.
   *   계약 데이터가 없으면 emp.id 기반 결정적 값으로 폴백(정렬·필터 순서와 무관하게 항상 동일). */
  function _wageSeed(id) { let h = 0; const s = String(id || ''); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function contractWageOf(e) {
    let src = e;
    const IM = window.App && App.HRInfoMgmt;
    if (IM && typeof IM.list === 'function') {
      const row = IM.list().find(x => x.id === e.id);
      if (row) src = row;   /* 인사정보관리 임금계약 = 단일 진실원 */
    }
    const wageType = src.wageType || '';
    const contractAmt = Number(src.contractAmount || 0);
    const monthlyFromContract =
        wageType === 'annual'  ? Math.round(contractAmt / 12)
      : wageType === 'monthly' ? contractAmt
      : wageType === 'daily'   ? Math.round(contractAmt * 26)
      : wageType === 'hourly'  ? Math.round(contractAmt * (Number(src.hoursPerDay) || 8) * 26)
      : 0;
    const baseSalary = Number(src.baseSalary || 0);
    const baseAmt = baseSalary > 0 ? baseSalary
                  : (monthlyFromContract > 0 ? monthlyFromContract
                  : 3000000 + (_wageSeed(e.id) % 13) * 200000);
    /* 고정연장근무수당 = 계약(고정 OT / 포괄임금)에 명시된 월 정액. 일반 계약은 0. */
    const fixedOT = Number(src.fixedOTAmount || 0) || Number(src.inclusiveOTAmount || 0);
    /* 고정연장수당이 커버하는 약정 연장시간(월). 포괄임금/고정OT 계약만 유효. */
    const fixedOTHours = fixedOT > 0 ? (Number(src.fixedOTHours || 0) || 20) : 0;
    return { baseAmt, fixedOT, fixedOTHours, wageType, kind: src.wageContractKind || '' };
  }

  /* 원단위(10원) 절사 — 일용직 공제액은 엑셀과 동일하게 10원 미만 버림 */
  function _floor10(n) { return Math.floor((Number(n) || 0) / 10) * 10; }

  /* ============ Compute — 일용직 급여대장 (mock 산출) ============
   *   시급 = 인사정보관리 임금계약(시급제, wageType==='hourly')의 contractAmount 기준 → 「Σ 일별 근무시간 × 시급 = 총지급액」.
   *   (표시용 일당 = 시급 × 8h. 계약이 없으면 emp.id 결정적 폴백 시급 사용.)
   *   - 소득세 = Σ 일별 (일급 − 150,000) × 6% × 45%(세액공제 후) = (일급−150,000) × 2.7%
   *   - 지방소득세 = 소득세 × 10% / 국민연금 4.5% / 건강 3.545%(장기요양 12.81%) / 고용 0.9%
   *   - 모든 공제는 10원 절사(_floor10) — 엑셀 「일용직 급여대장」 예시와 정확히 일치.
   *   - 일별 근무시간은 뉴ERP 근태 자동반영(mock, emp.id 시드 기반 결정적).
   *   - 첫 행(i=0)은 엑셀 예시(신한 320,000원 · 8/9/4/8h)와 동일하게 셋팅. */
  function computeDailyLedger(r) {
    const matched = listEmployeesMatchingFilter(r.targetFilter);
    const idSet = r.targetEmpIds
      ? (r.targetEmpIds instanceof Set ? r.targetEmpIds : new Set(r.targetEmpIds))
      : null;
    const targets = idSet ? matched.filter(e => idSet.has(e.id)) : matched;
    const dim = daysInMonthOf(r.accruedMonth);
    const BANKS = ['신한은행', '국민은행', '우리은행', '하나은행', '농협'];
    /* 시급 — 인사정보관리 임금계약(시급제, wageType==='hourly')의 contractAmount 를 단일 진실원으로 사용.
     *   계약이 없으면 emp.id 결정적 폴백(11,000~14,000원). 일당(표시용) = 시급 × 8h. */
    const IM = window.App && App.HRInfoMgmt;
    const hourlyOf = (e, seed) => {
      if (IM && typeof IM.list === 'function') {
        const row = IM.list().find(x => x.id === e.id);
        if (row && row.wageType === 'hourly' && Number(row.contractAmount) > 0) return Math.round(Number(row.contractAmount));
      }
      return 11000 + (seed % 7) * 500;
    };

    const rows = targets.map((e, i) => {
      const seed = _wageSeed(e.id);
      let bank = BANKS[seed % BANKS.length];
      let account = `${110 + (seed % 800)}-${String((seed % 90) + 10).padStart(2, '0')}-${(seed % 9000) + 1000}`;
      let hourly = hourlyOf(e, seed);
      let dailyWage = hourly * 8;   /* 표시용 일당 (8h 기준) */

      /* 일별 근무시간 — 결정적 분포 (4~21일, 8~9h) */
      const dayHours = new Array(dim).fill(0);
      const nDays = 4 + (seed % Math.max(1, Math.min(18, dim - 4)));
      const stride = 1 + (seed % 2);
      let d = seed % 3, placed = 0;
      while (placed < nDays && d < dim) { dayHours[d] = 8 + ((seed >> placed) & 1); placed++; d += stride; }

      /* 첫 행 — 엑셀 예시 정합 (데모, 임금계약과 무관하게 override 유지) */
      if (i === 0) {
        bank = '신한은행'; account = '111-22-3333'; dailyWage = 320000; hourly = Math.round(320000 / 8);
        for (let k = 0; k < dim; k++) dayHours[k] = 0;
        dayHours[0] = 8; dayHours[1] = 9;
        if (dim > 17) dayHours[17] = 4;
        if (dim > 19) dayHours[19] = 8;
      }

      const workHours = dayHours.reduce((a, h) => a + h, 0);
      const workDays  = dayHours.filter(h => h > 0).length;
      const total = Math.round(workHours * hourly);
      const taxablePay = total;   /* 전액 과세 (mock) */

      /* 공제 (10원 절사) */
      let incomeTaxRaw = 0;
      dayHours.forEach(h => { if (h > 0) { const dw = h * hourly; incomeTaxRaw += Math.max(0, dw - 150000) * 0.027; } });
      const incomeTax = _floor10(incomeTaxRaw);
      const localTax  = _floor10(incomeTax * 0.1);
      const pension   = _floor10(total * 0.045);
      const employ    = _floor10(total * 0.009);
      const health    = _floor10(total * 0.03545);
      const ltcare    = _floor10(health * 0.1281);
      const etc1 = 0, etc2 = 0;
      const dedTotal = incomeTax + localTax + pension + employ + health + ltcare + etc1 + etc2;
      const netPay = total - dedTotal;

      return {
        empId: e.id, name: e.name, dept: e.dept, position: e.position, empStatus: e.status, empType: e.empType,
        workState: mockWorkState(i), unusedLeave: 0,
        bank, account, dayHours, workDays, workHours, dailyWage, hourly,
        total, taxablePay,
        deductions: { incomeTax, localTax, pension, employ, health, ltcare, etc1, etc2 },
        dedTotal, netPay,
      };
    });
    return { computedAt: TODAY, rows, daysInMonth: dim, isDaily: true };
  }

  /* ============ Compute (mock 산출) ============ */
  function computeLedger(r) {
    if (isDailyGroup(r)) return computeDailyLedger(r);   /* 일용직 — 별도 산출 */
    const matched = listEmployeesMatchingFilter(r.targetFilter);
    const idSet = r.targetEmpIds
      ? (r.targetEmpIds instanceof Set ? r.targetEmpIds : new Set(r.targetEmpIds))
      : null;
    const targets = idSet ? matched.filter(e => idSet.has(e.id)) : matched;
    const codes = r.payItemCodes || [];

    const rows = targets.map((e, i) => {
      /* === 기준 임금 — 「인사정보 관리」 임금계약과 동기화 (단일 진실원, emp.id 조인) ===
       *   기본급 = 계약 월 기본급(baseSalary) → 없으면 계약금액·임금유형 환산 → 결정적 폴백.
       *   고정연장근무수당 = 계약 명시 정액(fixedOTAmount / inclusiveOTAmount), 일반 계약은 0. */
      const wage = contractWageOf(e);
      const baseAmt = wage.baseAmt;
      /* 기본일급 = 기본급 / 월 가동일(26) | 기본시급 = 기본일급 / 8시간 */
      const baseDay   = Math.round(baseAmt / 26);
      const baseHr    = Math.round(baseDay / 8);
      /* 통상임금 = 기본급 + 통상임금 포함 고정수당 합계.
       *   기본급(PAY-SYS-001)은 baseAmt 로 이미 포함. 식대·사용자가 「통상임금 포함」 으로
       *   추가한 고정 항목(ordinaryWage=true)만 합산하고, 변동 OT 항목은 통상임금에서 제외. */
      const ordinaryAllowance = codes.reduce((sum, code) => {
        if (code === 'PAY-SYS-001') return sum;
        const it = payItemByCode(code);
        if (!it || !it.ordinaryWage) return sum;
        if (code === 'PAY-SYS-010') return sum + 200000;   /* 식대 */
        if (it.payMethod === 'fixed') return sum + 100000;  /* 고정 통상수당 (사용자 추가분 포함) */
        return sum;
      }, 0);
      const normalAmt = baseAmt + ordinaryAllowance;
      const normalDay = Math.round(normalAmt / 26);
      const normalHr  = Math.round(normalDay / 8);
      /* 근로 상태(재직/휴직/퇴직) — 퇴직자는 미사용 연차 정산 → 연차수당 발생(미사용연차 × 통상일급) */
      const workState     = mockWorkState(i);
      const unusedLeave   = workState === 'retired' ? mockUnusedLeave(i) : 0;
      const annualLeavePay = workState === 'retired' ? Math.round(unusedLeave * normalDay) : 0;
      const otHours   = (i % 6) * 2 + 4;    /* 연장 근무 시간 (mock) */
      const nightHr   = (i % 4 === 0) ? 4 : 0;
      const holidayHr = (i % 7 === 0) ? 8 : 0;
      /* 정산 검토 단계에서 사용할 세분 시간 — 연장/야간연장/휴일연장/휴일야간연장 / 휴일근로 / 휴일야간
       *   (mock) 직원 인덱스 기반으로 결정적이지만 다양하게 분포 */
      const otRegularHr      = otHours;                    /* 연장근로시간 */
      const otNightHr        = (i % 5 === 0) ? 2 : 0;      /* 야간+연장 중복 */
      const otHolidayHr      = (i % 7 === 0) ? 3 : 0;      /* 휴일연장 (= 휴일+연장 중복) */
      const otHolidayNightHr = (i % 11 === 0) ? 1 : 0;     /* 휴일야간연장 (야간+초과) */
      const nightWorkHr      = nightHr;                    /* 야간근로 */
      const holidayWorkHr    = (i % 7 === 0) ? 8 : 0;      /* 휴일근로 — 기본 8시간 */
      const holidayNightHr   = (i % 13 === 0) ? 2 : 0;     /* 휴일야간 */
      /* 고정연장근무수당 — 계약 임금에 명시된 월 정액 (고정 OT/포괄임금 계약, 일반 계약은 0) */
      const fixedOT = wage.fixedOT;

      /* === 시간외수당 계산식 (정산 검토 / 지급항목 검토 표시용) ===
       *   연장근무수당  = 연장근로*1.5 + 야간연장*2.0 + 휴일연장*2.0 + 휴일야간연장*2.5
       *                  (고정연장수당 계약자는 약정시간 차감 후 「초과분」만 지급)
       *   야간근무수당  = 야간근로*1.5 + 휴일야간*2.0
       *   휴일근무수당  = 휴일근로(8h 기본)*1.5            (모두 통상시급 곱) */
      /* 포괄임금/고정OT 약정시간(coverHrs) 을 연장 카테고리에서 순서대로 차감 → 초과분만 청구(billable). */
      const fixedOTCoverHrs = wage.fixedOTHours || 0;
      let _cover = fixedOTCoverHrs;
      const _bill = (hr) => { const b = Math.max(0, hr - _cover); _cover = Math.max(0, _cover - hr); return b; };
      const billRegularHr      = _bill(otRegularHr);
      const billNightHr        = _bill(otNightHr);
      const billHolidayHr      = _bill(otHolidayHr);
      const billHolidayNightHr = _bill(otHolidayNightHr);
      const actualOTHrs = otRegularHr + otNightHr + otHolidayHr + otHolidayNightHr;
      const excessOTHrs = Math.max(0, actualOTHrs - fixedOTCoverHrs);
      const otRegularPay      = Math.round(normalHr * billRegularHr      * 1.5);
      const otNightPay        = Math.round(normalHr * billNightHr        * 2.0);
      const otHolidayPay      = Math.round(normalHr * billHolidayHr      * 2.0);
      const otHolidayNightPay = Math.round(normalHr * billHolidayNightHr * 2.5);
      const otCalcTotal = otRegularPay + otNightPay + otHolidayPay + otHolidayNightPay;
      const nightWorkPay    = Math.round(normalHr * nightWorkHr   * 1.5);
      const holidayNightPay = Math.round(normalHr * holidayNightHr * 2.0);
      const nightCalcPay    = nightWorkPay + holidayNightPay;          /* 야간근무수당 = 야간근로 + 휴일야간 */
      const holidayWorkPay  = Math.round(normalHr * holidayWorkHr * 1.5);
      const holidayCalcTotal = holidayWorkPay;                         /* 휴일근무수당 = 휴일근로 */

      const amounts = {};
      codes.forEach(code => {
        const it = payItemByCode(code);
        const method = it && it.payMethod;
        if (code === 'PAY-SYS-001')                    amounts[code] = baseAmt;                        /* 기본급 = 계약 월 기본급 */
        else if (code === 'PAY-SYS-002')               amounts[code] = fixedOT;                         /* 고정연장근무수당 = 계약 명시 정액 (일반 계약=0) */
        else if (code === 'PAY-SYS-003')               amounts[code] = otCalcTotal - otNightPay;        /* 연장근무수당 = 연장/휴일연장/휴일야간연장 (야간연장 제외) */
        else if (code === 'PAY-SYS-006')               amounts[code] = otNightPay;                      /* 야간연장근무수당 = 야간+연장 중복분 (통상시급×2.0) */
        else if (code === 'PAY-SYS-004')               amounts[code] = nightCalcPay;
        else if (code === 'PAY-SYS-005')               amounts[code] = holidayCalcTotal;
        else if (code === 'PAY-SYS-010')               amounts[code] = 200000;
        else if (code === 'PAY-SYS-022')               amounts[code] = annualLeavePay;   /* 연차수당 — 퇴직자 미사용연차 정산 */
        else if (MANUAL_PAY_ITEM_CODES.includes(code)) amounts[code] = 0;   /* 수기 입력 — 기본 0 */
        else if (method === 'fixed')                   amounts[code] = 100000;
        else                                           amounts[code] = (i % 3 === 0) ? 50000 : 0;
      });
      const total = codes.reduce((a, c) => a + (Number(amounts[c]) || 0), 0);

      /* === 공제 (mock) — 12 항목 === */
      const pension          = Math.round(total * 0.045);
      const health           = Math.round(total * 0.0354);
      const ltcare           = Math.round(health * 0.1295);
      const employ           = Math.round(total * 0.009);
      /* 소득세 — 중소기업 취업자 소득세 감면(조특법 §30) 반영.
       *   감면전 소득세(incomeTaxBase)에 감면율(청년 90% / 그 외 50·70%)을 적용한 금액을 실제 공제. */
      const incomeTaxBase    = Math.round(total * 0.038);
      const SME_RATES        = [0, 90, 0, 70, 0, 0, 50, 0, 0, 0];
      const smeRate          = SME_RATES[i % SME_RATES.length];
      const incomeTax        = Math.round(incomeTaxBase * (1 - smeRate / 100));
      const localTax         = Math.round(incomeTax * 0.1);
      const adjIncomeTaxMid  = (i % 17 === 0) ? 12000 : 0;
      const adjLocalTaxMid   = Math.round(adjIncomeTaxMid * 0.1);
      const tuition          = (i % 23 === 0) ? 80000 : 0;
      const etcDed           = (i % 19 === 0) ? 50000 : 0;
      const adjHealth        = (i % 31 === 0) ? 8000  : 0;
      const adjLtcare        = (i % 31 === 0) ? 1000  : 0;
      /* 수기 입력 정산/기타 공제 — 기본 0 (담당자가 직접 입력). 채권추심은 값 없으므로 삭제 가능 데모. */
      const adjIncomeTax     = 0;
      const adjLocalTax      = 0;
      const adjFarmTax       = 0;
      const debtCollect      = 0;
      const dedTotal = pension + health + ltcare + employ
                     + incomeTax + localTax
                     + adjIncomeTax + adjLocalTax
                     + adjIncomeTaxMid + adjLocalTaxMid
                     + adjHealth + adjLtcare + adjFarmTax
                     + debtCollect + tuition + etcDed;
      const netPay    = total - dedTotal;

      return {
        empId: e.id, name: e.name, dept: e.dept, position: e.position, empStatus: e.status, empType: e.empType,
        workState, unusedLeave,
        baseAmt, baseDay, baseHr, normalAmt, normalDay, normalHr,
        otHours, nightHr, holidayHr, workDays: 22,
        /* 세분 시간 + 세분 금액 — 정산검토 「시간 × 통상시급」 계산식 표시용 */
        otHoursBreakdown: {
          otRegularHr, otNightHr, otHolidayHr, otHolidayNightHr,
          nightWorkHr, holidayWorkHr, holidayNightHr,
          /* 고정연장수당 약정 차감 — 청구(초과) 시간 + 약정/초과 메타 */
          fixedOTCoverHrs, actualOTHrs, excessOTHrs,
          billRegularHr, billNightHr, billHolidayHr, billHolidayNightHr,
        },
        otPayBreakdown: {
          otRegularPay, otNightPay, otHolidayPay, otHolidayNightPay,
          nightCalcPay, holidayWorkPay, holidayNightPay,
        },
        amounts, total,
        smeRate, incomeTaxBase,
        deductions: {
          pension, health, ltcare, employ,
          incomeTax, localTax,
          adjIncomeTax, adjLocalTax,
          adjIncomeTaxMid, adjLocalTaxMid,
          adjHealth, adjLtcare, adjFarmTax,
          debtCollect, tuition, etcDed,
        },
        dedTotal, netPay,
      };
    });
    return { computedAt: TODAY, rows };
  }

  /* ============ 공제 자료 업로드 모달 (4대보험 / 간이세액표) ============
   *   파일과 기간만 입력받고 — 어떤 파일이라도 업로드 시 mock 으로 공제 항목 자동 반영.
   *   - kind === 'insurance' → 국민연금/건강보험/장기요양/고용보험 4개 항목
   *   - kind === 'tax'       → 소득세/지방소득세 2개 항목 */
  /* 모달 별 첨부 파일 상태 — UI Kit Dropzone 패턴 (.dz / .dz-list / hidden input) 재사용 */
  const _dedFiles = { insurance: [], tax: [] };

  function _renderDedFileList(kind) {
    const list = document.querySelector(`[data-prs-ded-dz-list="${kind}"]`);
    if (!list) return;
    list.innerHTML = _dedFiles[kind].map((f, i) => `
      <div class="dz-file">
        <span>📄</span>
        <span class="dz-file__name">${esc(f.name)}</span>
        <span class="dz-file__size">${(f.size / 1024).toFixed(1)} KB</span>
        <button class="dz-file__remove" type="button" data-prs-ded-dz-remove="${kind}" data-i="${i}">제거</button>
      </div>
    `).join('');
  }

  function openDeductUploadModal(kind) {
    /* 4대보험·간이세액표 모두 좌우 split 화면(전용 엔진) — 적용 기간/업로드/미리보기/적용 자체 관리 */
    if (kind === 'insurance') { _insOpen(); return; }
    if (kind === 'tax') { _taxOpen(); return; }
    const f = STATE.form;
    const ym = (f && f.accruedMonth) || TODAY.slice(0, 7);
    const setVal = (sel, v) => { const el = document.querySelector(sel); if (el) el.value = v; };
    _dedFiles[kind] = [];
    _renderDedFileList(kind);
    const fileInput = document.querySelector(`[data-prs-ded-dz-input="${kind}"]`);
    if (fileInput) fileInput.value = '';
    setVal('#prs-ded-tax-from', ym);
    setVal('#prs-ded-tax-to',   ym);
    openModal('modal-prs-ded-tax');
  }

  /* 간이세액표 전용 — 4대보험은 _ins* 분할 화면의 [적용] 버튼으로 반영(_insApplyToLedger) */
  function confirmDeductUpload(kind) {
    const f = STATE.form;
    const hasFiles = _dedFiles[kind] && _dedFiles[kind].length;
    if (!hasFiles) {
      window.toast && window.toast('업로드할 파일을 먼저 선택하세요.', 'warning');
      return;
    }
    /* 목록 툴바에서 업로드(편집 중인 정산 없음) — 기준 자료만 등록(자동 반영 대상 없음) */
    if (!f) {
      closeModal('modal-prs-ded-tax');
      window.toast && window.toast('간이세액표 기준 자료 업로드 완료 — 정산 등록 시 자동 반영됩니다.', 'success');
      return;
    }
    /* ledger 미생성(stage 0) 단계라도 안전 동작 — 대상자에 대해 임시 ledger 생성 */
    if (!f.ledger || !f.ledger.rows || !f.ledger.rows.length) {
      const r = STATE.editingId ? STATE.rounds.find(x => x.id === STATE.editingId) : null;
      if (r) { r.ledger = computeLedger(r); f.ledger = deepClone(r.ledger); }
    }
    if (!f.ledger || !f.ledger.rows) {
      window.toast && window.toast('대상자가 없어 자동 반영할 수 없습니다.', 'warning');
      return;
    }
    f.ledger.rows.forEach(row => {
      row.deductions = row.deductions || {};
      const total = Number(row.total) || 0;
      row.deductions.incomeTax = Math.round(total * 0.038);
      row.deductions.localTax  = Math.round(row.deductions.incomeTax * 0.1);
      _insRecalcRow(row);
    });
    if (STATE.editingId) {
      const r = STATE.rounds.find(x => x.id === STATE.editingId);
      if (r) r.ledger = deepClone(f.ledger);
    }
    closeModal('modal-prs-ded-tax');
    window.toast && window.toast('간이세액표 업로드 — 공제 항목 자동 반영 완료', 'success');
    refreshDetailSection(document.getElementById('page-hr-pay-settlement'), 'editor');
  }

  /* =========================================================
   *  4대보험 월 고지액 — 보험별 탭(건강/국민연금/고용) 업로드 미리보기
   *    엑셀 파싱은 mock — 업로드 시 결정적 고지 내역(고지인원·보험료 총계 + 상세)을 표시.
   * ========================================================= */
  function _round10(n) { return Math.round((Number(n) || 0) / 10) * 10; }
  /* 공단 고지 파일의 대상자(외부 데이터) — 결정적 mock */
  const INS_PEOPLE = [
    { no: 1, name: '김민준', ssn: '880312-1******', wage: 3200000 },
    { no: 2, name: '이서연', ssn: '910725-2******', wage: 4500000 },
    { no: 3, name: '박지후', ssn: '950118-1******', wage: 2800000 },
    { no: 4, name: '최예준', ssn: '870905-1******', wage: 5200000 },
    { no: 5, name: '정하윤', ssn: '930412-2******', wage: 3600000 },
    { no: 6, name: '강도현', ssn: '891230-1******', wage: 4100000 },
    { no: 7, name: '윤서아', ssn: '960607-2******', wage: 2600000 },
    { no: 8, name: '장우진', ssn: '850814-1******', wage: 6000000 },
  ];

  /* 건강보험 — 1인당 건강/요양 2행. 산출(건강 7.09% · 요양=건강×12.95%) + 일부 연말정산. */
  function genHealth() {
    return INS_PEOPLE.map(p => {
      const health = _round10(p.wage * 0.0709);
      const ltcare = _round10(health * 0.1295);
      const adj = (p.no % 3 === 0);                                  /* 연말정산 대상 */
      const yearEnd = adj ? _round10(health * 0.08) * ((p.no % 2) ? 1 : -1) : 0;
      return {
        no: p.no, ssn: p.ssn, name: p.name, wage: p.wage,
        rows: [
          { gubun: '건강', sanchul: health, jeongsan: yearEnd, reason: adj ? '연말정산' : '', period: adj ? '2025-01 ~ 2025-12' : '', gamyeon: '', yearEnd: yearEnd, interest: 0, goji: health + yearEnd },
          { gubun: '요양', sanchul: ltcare, jeongsan: 0,        reason: '',                 period: '',                       gamyeon: '', yearEnd: 0,       interest: 0, goji: ltcare },
        ],
      };
    });
  }
  /* 국민연금 — 결정보험료(9%) + 근로자부담분 = 결정보험료 × 0.8/1.85 */
  function genPension() {
    return INS_PEOPLE.map(p => {
      const decided = _round10(p.wage * 0.09);
      const worker = Math.round(decided * 0.8 / 1.85);
      const adj = (p.no % 4 === 0);
      return { no: p.no, ssn: p.ssn, name: p.name, reason: adj ? '소득총액정산' : '', period: adj ? '2025-07 ~ 2026-06' : '', decided, worker };
    });
  }
  /* 고용보험 — 실업급여(0.9%+0.9%) + 고용안정·직업능력개발(사업주 0.25%) [상세 컬럼은 잠정] */
  function genEmployment() {
    return INS_PEOPLE.map(p => {
      const unemploy = _round10(p.wage * 0.018);
      const stable   = _round10(p.wage * 0.0025);
      return { no: p.no, ssn: p.ssn, name: p.name, wage: p.wage, unemploy, stable, goji: unemploy + stable };
    });
  }

  function _insSummary(count, total) {
    return `
      <div class="table-card" style="margin:14px 0 10px;">
        <table class="tbl">
          <thead><tr><th style="text-align:center;">고지인원</th><th style="text-align:right;">보험료 총계</th></tr></thead>
          <tbody><tr>
            <td style="text-align:center;">${count.toLocaleString()}명</td>
            <td style="text-align:right;font-weight:var(--fw-bold);color:var(--color-brand-primary);">${fmtMoney(total)}원</td>
          </tr></tbody>
        </table>
      </div>`;
  }
  const _dash = (v, money) => (v ? (money ? fmtMoney(v) : esc(v)) : '<span class="t-muted">-</span>');

  function renderInsHealth(data) {
    const total = data.reduce((s, p) => s + p.rows.reduce((a, r) => a + r.goji, 0), 0);
    const body = data.map(p => p.rows.map((r, idx) => `
      <tr>
        ${idx === 0 ? `
          <td rowspan="2" style="text-align:right;">${p.no}</td>
          <td rowspan="2" style="white-space:nowrap;">${esc(p.ssn)}</td>
          <td rowspan="2">${esc(p.name)}</td>
          <td rowspan="2" style="text-align:right;">${fmtMoney(p.wage)}</td>` : ''}
        <td style="text-align:center;white-space:nowrap;"><span class="pill pill--${r.gubun === '건강' ? 'info' : 'muted'}">${r.gubun}</span></td>
        <td style="text-align:right;">${fmtMoney(r.sanchul)}</td>
        <td style="text-align:right;${r.jeongsan ? 'color:var(--color-danger);' : ''}">${_dash(r.jeongsan, true)}</td>
        <td style="text-align:center;white-space:nowrap;">${_dash(r.period)}</td>
        <td style="text-align:right;">${_dash(r.yearEnd, true)}</td>
        <td style="text-align:right;">${_dash(r.interest, true)}</td>
        <td style="text-align:right;font-weight:var(--fw-semibold);">${fmtMoney(r.goji)}</td>
      </tr>`).join('')).join('');
    return _insSummary(data.length, total) + `
      <div class="table-card"><div class="table-card__body" style="max-height:340px;">
        <table class="tbl tbl--hover" style="min-width:980px;">
          <thead><tr>
            <th style="width:48px;text-align:right;">순번</th>
            <th style="width:130px;">주민번호</th>
            <th style="width:80px;">성명</th>
            <th style="width:110px;text-align:right;">보수월액</th>
            <th style="width:64px;text-align:center;">구분</th>
            <th style="width:100px;text-align:right;">산출보험료</th>
            <th style="width:100px;text-align:right;">정산보험료</th>
            <th style="width:150px;text-align:center;">정산적용기간</th>
            <th style="width:100px;text-align:right;">연말정산</th>
            <th style="width:90px;text-align:right;">환급금이자</th>
            <th style="width:110px;text-align:right;">고지보험료</th>
          </tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div></div>`;
  }
  function renderInsPension(data) {
    const total = data.reduce((s, p) => s + p.decided, 0);
    const body = data.map(p => `
      <tr>
        <td style="text-align:right;">${p.no}</td>
        <td style="white-space:nowrap;">${esc(p.ssn)}</td>
        <td>${esc(p.name)}</td>
        <td style="text-align:center;">${_dash(p.reason)}</td>
        <td style="text-align:center;white-space:nowrap;">${_dash(p.period)}</td>
        <td style="text-align:right;">${fmtMoney(p.decided)}</td>
        <td style="text-align:right;font-weight:var(--fw-semibold);">${fmtMoney(p.worker)}</td>
      </tr>`).join('');
    return _insSummary(data.length, total) + `
      <div class="table-card"><div class="table-card__body" style="max-height:340px;">
        <table class="tbl tbl--hover" style="min-width:760px;">
          <thead><tr>
            <th style="width:48px;text-align:right;">순번</th>
            <th style="width:130px;">주민번호</th>
            <th style="width:90px;">성명</th>
            <th style="width:120px;text-align:center;">정산사유</th>
            <th style="width:170px;text-align:center;">정산적용기간</th>
            <th style="width:120px;text-align:right;">결정보험료</th>
            <th style="width:120px;text-align:right;">근로자부담분</th>
          </tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div></div>`;
  }
  function renderInsEmployment(data) {
    const total = data.reduce((s, p) => s + p.goji, 0);
    const body = data.map(p => `
      <tr>
        <td style="text-align:right;">${p.no}</td>
        <td style="white-space:nowrap;">${esc(p.ssn)}</td>
        <td>${esc(p.name)}</td>
        <td style="text-align:right;">${fmtMoney(p.wage)}</td>
        <td style="text-align:right;">${fmtMoney(p.unemploy)}</td>
        <td style="text-align:right;">${fmtMoney(p.stable)}</td>
        <td style="text-align:right;font-weight:var(--fw-semibold);">${fmtMoney(p.goji)}</td>
      </tr>`).join('');
    return _insSummary(data.length, total) + `
      <div class="table-card"><div class="table-card__body" style="max-height:340px;">
        <table class="tbl tbl--hover" style="min-width:760px;">
          <thead><tr>
            <th style="width:48px;text-align:right;">순번</th>
            <th style="width:130px;">주민번호</th>
            <th style="width:90px;">성명</th>
            <th style="width:110px;text-align:right;">보수월액</th>
            <th style="width:120px;text-align:right;">실업급여</th>
            <th style="width:170px;text-align:right;">고용안정·직업능력개발</th>
            <th style="width:120px;text-align:right;">고지보험료</th>
          </tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div></div>`;
  }

  const _insGen    = { health: genHealth, pension: genPension, employment: genEmployment };
  const _insRender = { health: renderInsHealth, pension: renderInsPension, employment: renderInsEmployment };
  const _insLabel  = { health: '건강보험', pension: '국민연금', employment: '고용보험' };

  /* ============ 적용 기간/고지월 모델 (보험별 독립) ============
   *   _insStore[sub] = { periods:[ {id, from:'YYYY-MM', to:'YYYY-MM', uploads:{ 'YYYY-MM':{ fileName,fileSize,uploadedAt,data,applied } } } ],
   *                       selPeriodId, selMonth, newMode, newStart }
   *   - periods 는 from 오름차순 정렬 유지(마지막 = 최신 = 편집 가능 기간).
   *   - 과거 기간은 조회 전용(이력 보관). */
  const _insStore = {};
  let _insActiveSub = 'health';
  let _insPmTab = 'edit';   /* 적용 기간 관리 모달 탭: 'edit' | 'create' */
  let _insPeriodSeq = 0;

  /* YYYY-MM 산술/표기 — 문자열 비교로 대소 비교 가능(zero-pad). */
  function _ymParts(ym) { const [y, m] = String(ym).split('-').map(Number); return [y, m]; }
  function _ymOf(y, m) { return y + '-' + String(m).padStart(2, '0'); }
  function _ymAdd(ym, months) {
    const [y, m] = _ymParts(ym);
    const total = y * 12 + (m - 1) + months;
    return _ymOf(Math.floor(total / 12), (total % 12) + 1);
  }
  function _ymToYYMM2(ym) { const [y, m] = _ymParts(ym); return String(y).slice(-2) + '/' + String(m).padStart(2, '0'); }
  function _insPeriodLabel(p) { return _ymToYYMM2(p.from) + ' ~ ' + _ymToYYMM2(p.to); }
  function _insPeriodMonths(p) {
    const out = []; let cur = p.from;
    while (cur <= p.to) { out.push(cur); cur = _ymAdd(cur, 1); }
    return out;
  }
  /* 업로드 일시 — YY/MM/DD HH:MM */
  function _insStampNow() {
    const d = new Date();
    const p2 = n => String(n).padStart(2, '0');
    return `${String(d.getFullYear()).slice(-2)}/${p2(d.getMonth() + 1)}/${p2(d.getDate())}   ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  }
  function _insSeedStamp() { const [y, m, dd] = TODAY.split('-'); return `${y.slice(-2)}/${m}/${dd}   09:14`; }

  /* 보험별 최초 적용 기간 — 건강·고용: 당해 4월~익년 3월 / 국민연금: 당해 7월~익년 6월 */
  function _insInitialPeriod(sub) {
    const [y] = _ymParts(TODAY);
    return sub === 'pension' ? { from: _ymOf(y, 7), to: _ymOf(y + 1, 6) }
                             : { from: _ymOf(y, 4), to: _ymOf(y + 1, 3) };
  }
  function _insSeed() {
    const f = STATE.form;
    const ym = (f && f.accruedMonth) || TODAY.slice(0, 7);
    ['health', 'pension', 'employment'].forEach(sub => {
      _insPeriodSeq += 1;
      const per = _insInitialPeriod(sub);
      const p = { id: 'IPD-' + _insPeriodSeq, from: per.from, to: per.to, uploads: {} };
      const months = _insPeriodMonths(p);
      const selMonth = months.indexOf(ym) >= 0 ? ym : p.from;
      /* 데모용 시드 업로드 — 기본 고지월 1건(미적용). 우측 패널이 바로 채워지고 예외 흐름 시연 가능 */
      p.uploads[selMonth] = {
        fileName:   `${_insLabel[sub]}_월고지액_${selMonth}.xlsx`,
        fileSize:   28160,
        uploadedAt: _insSeedStamp(),
        data:       _insGen[sub](),
        applied:    false,
      };
      _insStore[sub] = { periods: [p], selPeriodId: p.id, selMonth, newMode: false, newStart: '', newEnd: '' };
    });
  }

  function _insSelPeriod(sub)    { const s = _insStore[sub]; return s.periods.find(p => p.id === s.selPeriodId) || s.periods[s.periods.length - 1]; }
  function _insLatestPeriod(sub) { const s = _insStore[sub]; return s.periods[s.periods.length - 1]; }

  /* 공제 합계/실지급액 재계산 — 보험/세액 반영 후 공통 호출 */
  function _insRecalcRow(row) {
    const d = row.deductions = row.deductions || {};
    row.dedTotal = (d.pension || 0) + (d.health || 0) + (d.ltcare || 0) + (d.employ || 0)
      + (d.incomeTax || 0) + (d.localTax || 0)
      + (d.adjIncomeTaxMid || 0) + (d.adjLocalTaxMid || 0)
      + (d.tuition || 0) + (d.etcDed || 0) + (d.adjHealth || 0) + (d.adjLtcare || 0);
    row.netPay = (Number(row.total) || 0) - row.dedTotal;
  }

  /* 적용 기간 관리 모달의 인라인 에러 — sel 로 대상 .field-error 지정 */
  function _insPmErr(sel, msg) {
    const el = document.querySelector('#modal-prs-ins-period ' + sel);
    if (el) { el.textContent = msg; el.hidden = false; }
  }

  function _insRenderAll(sub) { _insRenderCtx(sub); _insRenderLeft(sub); _insRenderRight(sub); }

  /* ============ 상단 컨텍스트 바 — 적용 기간은 좌측 패널(고지월 위)로 이동 ============ */
  function _insRenderCtx(sub) {
    const host = document.querySelector('[data-ins-ctx]'); if (!host) return;
    host.innerHTML = '';   /* 적용 기간/기간 관리는 _insRenderLeft 로 이동 */
  }

  /* ============ 좌측 패널 — 적용 기간 + 고지월 선택 + 엑셀 업로드 ============ */
  function _insRenderLeft(sub) {
    const host = document.querySelector('[data-ins-left]'); if (!host) return;
    const s = _insStore[sub];
    const latest = _insLatestPeriod(sub);
    const periodOpts = s.periods.slice().reverse().map(p =>
      `<option value="${esc(p.id)}" ${p.id === s.selPeriodId ? 'selected' : ''}>${esc(_insPeriodLabel(p))}${p.id === latest.id ? ' (현재)' : ''}</option>`).join('');
    const sel = _insSelPeriod(sub);
    const monthOpts = _insPeriodMonths(sel).map(m => {
      const up = sel.uploads[m];
      const tag = up ? (up.applied ? ' · 적용완료' : ' · 업로드됨') : '';
      return `<option value="${esc(m)}" ${m === s.selMonth ? 'selected' : ''}>${esc(_ymToYYMM2(m))}${tag}</option>`;
    }).join('');

    host.innerHTML = `
      <div style="padding:14px 12px;display:flex;flex-direction:column;gap:16px;">
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
            <label class="form-label" style="margin:0;">적용 기간 ${REQ_MARK}</label>
            <button class="btn btn--sm" type="button" data-ins-manage style="flex-shrink:0;">기간 관리</button>
          </div>
          <select class="select" data-ins-period style="width:100%;">${periodOpts}</select>
        </div>
        <div>
          <label class="form-label" style="display:block;margin-bottom:6px;">고지월 선택 ${REQ_MARK}</label>
          <select class="select" data-ins-month style="width:100%;">${monthOpts}</select>
        </div>
        <div>
          <label class="form-label" style="display:block;margin-bottom:6px;">엑셀 업로드</label>
          <div class="file-field">
            <div class="dz" data-ins-dz tabindex="0">
              <svg class="dz__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <div class="dz__title">엑셀을 끌어 놓거나 클릭하여 선택</div>
              <div class="dz__sub">엑셀(.xlsx/.xls) · CSV</div>
              <input type="file" hidden data-ins-dz-input accept=".xlsx,.xls,.csv" />
            </div>
          </div>
        </div>
      </div>`;
  }

  /* ============ 적용 기간 관리 모달 본문 — 탭(적용 기간 수정 | 적용 기간 생성) ============ */
  function _insRenderPeriodModal(sub) {
    const titleEl = document.querySelector('#modal-prs-ins-period [data-ins-pm-title]');
    if (titleEl) titleEl.textContent = `${_insLabel[sub]} 적용 기간 관리`;
    const host = document.querySelector('#modal-prs-ins-period [data-ins-pm-body]');
    if (!host) return;
    const latest = _insLatestPeriod(sub);
    const isEdit = _insPmTab !== 'create';
    const cs = _ymAdd(latest.to, 1);
    const ce = _ymAdd(cs, 11);

    const panel = isEdit ? `
      <label class="form-label" style="display:block;margin-bottom:6px;">현재 적용 기간 시작월 ${REQ_MARK}</label>
      <div style="display:flex;align-items:center;gap:8px;">
        <input class="input" type="month" data-ins-pm-start value="${esc(latest.from)}" style="flex:1;min-width:0;" />
        <span style="color:var(--color-text-muted);">~</span>
        <input class="input" type="month" data-ins-pm-end value="${esc(latest.to)}" disabled style="flex:1;min-width:0;background:var(--color-surface-alt);" />
      </div>
      <div class="field-error" data-ins-pm-err hidden></div>
      <p class="form-help" style="margin-top:6px;">시작월을 바꾸면 종료월이 1년 기간으로 맞춰집니다.</p>
    ` : `
      <label class="form-label" style="display:block;margin-bottom:6px;">신규 적용 기간 ${REQ_MARK}</label>
      <div style="display:flex;align-items:center;gap:8px;">
        <input class="input" type="month" data-ins-pm-cstart value="${esc(cs)}" style="flex:1;min-width:0;" />
        <span style="color:var(--color-text-muted);">~</span>
        <input class="input" type="month" data-ins-pm-cend value="${esc(ce)}" style="flex:1;min-width:0;" />
      </div>
      <div class="field-error" data-ins-pm-err hidden></div>
      <p class="form-help" style="margin-top:6px;">기존 기간의 업로드·적용 내역은 이력으로 보관됩니다.</p>
    `;

    host.innerHTML = `
      <div class="tabs" style="margin-bottom:16px;">
        <div class="tabs__nav">
          <button type="button" class="tabs__tab${isEdit ? ' is-active' : ''}" data-ins-pm-tab="edit">적용 기간 수정</button>
          <button type="button" class="tabs__tab${isEdit ? '' : ' is-active'}" data-ins-pm-tab="create">적용 기간 생성</button>
        </div>
      </div>
      <div>${panel}</div>`;
  }

  /* ============ 우측 패널 — 업로드 정보 + 직원별 고지액 내역 + [적용] ============ */
  function _insRenderRight(sub) {
    const host = document.querySelector('[data-ins-right]'); if (!host) return;
    const s = _insStore[sub];
    const sel = _insSelPeriod(sub);
    const up = sel.uploads[s.selMonth];

    if (!up) {
      host.innerHTML = `<div class="split__empty" style="flex-direction:column;gap:6px;text-align:center;line-height:1.6;">
        선택한 고지월(${esc(_ymToYYMM2(s.selMonth))})에 업로드된 월 고지 내역이 없습니다.<br>
        <span style="font-size:var(--fs-sm);">좌측에서 엑셀을 업로드하세요.</span>
      </div>`;
      return;
    }

    const head = `
      <div class="split__head" style="align-items:center;height:auto;min-height:44px;padding:10px 14px;">
        <div style="display:flex;flex-wrap:wrap;gap:4px 20px;font-size:var(--fs-sm);color:var(--color-text-sub);align-items:center;">
          <span>적용 기간 <strong style="color:var(--color-text);">${esc(_insPeriodLabel(sel))}</strong></span>
          <span>고지월 <strong style="color:var(--color-text);">${esc(_ymToYYMM2(s.selMonth))}</strong></span>
          <span>업로드일 <strong style="color:var(--color-text);">${esc(up.uploadedAt)}</strong></span>
          <span>파일 <a href="javascript:;" data-ins-download style="color:var(--color-brand-primary);">${esc(up.fileName)} <span style="font-size:10px;">↓</span></a></span>
        </div>
        ${up.applied ? '<span class="pill pill--success" style="flex-shrink:0;">적용 완료</span>' : ''}
      </div>`;

    const body = `<div class="split__body" style="padding:8px 12px;">${_insRender[sub](up.data)}</div>`;

    const foot = `
      <div style="padding:10px 14px;border-top:1px solid var(--color-divider);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-shrink:0;background:var(--color-surface);">
        <button class="btn btn--sm" type="button" data-ins-del-upload style="color:var(--color-danger);">업로드 삭제</button>
        <div style="display:flex;align-items:center;gap:12px;">
          <span class="form-help" style="margin:0;">${up.applied ? '이미 급여 정산에 반영되었습니다.' : '업로드만으로는 반영되지 않습니다. 내용 확인 후 [적용]하세요.'}</span>
          ${up.applied
            ? '<button class="btn btn--sm" type="button" disabled>적용됨</button>'
            : '<button class="btn btn--sm btn--primary" type="button" data-ins-apply>적용</button>'}
        </div>
      </div>`;

    host.innerHTML = head + body + foot;
  }

  /* ============ 동작 ============ */
  function _insOpen() {
    if (!_insStore.health) _insSeed();
    ['health', 'pension', 'employment'].forEach(sub => { _insStore[sub].newMode = false; });
    _insSetTab('health');
    openModal('modal-prs-ded-insurance');
  }
  function _insSetTab(sub) {
    _insActiveSub = sub;
    const m = document.getElementById('modal-prs-ded-insurance'); if (!m) return;
    m.querySelectorAll('[data-ins-tab]').forEach(b => b.classList.toggle('is-active', b.dataset.insTab === sub));
    _insStore[sub].newMode = false;
    _insRenderAll(sub);
  }

  /* 적용 기간 생성 탭 — 시작월 설정 즉시 순차/중복 검증(설정 시점 체크) */
  function _insPmLiveValidateCreate(sub) {
    const m = document.getElementById('modal-prs-ins-period'); if (!m) return;
    const errEl = m.querySelector('[data-ins-pm-err]'); if (!errEl) return;
    const latest = _insLatestPeriod(sub);
    const start = (m.querySelector('[data-ins-pm-cstart]') || {}).value || '';
    if (!start) { errEl.hidden = true; return; }
    if (start <= latest.to) { errEl.textContent = '이미 등록된 적용 기간과 중복되는 기간입니다. 기존 적용 기간과 겹치지 않는 기간으로 설정해주세요.'; errEl.hidden = false; return; }
    if (start !== _ymAdd(latest.to, 1)) { errEl.textContent = '적용기간은 이전 적용기간의 종료월 다음 달부터 순차적으로 생성해야 합니다.'; errEl.hidden = false; return; }
    errEl.hidden = true;
  }

  /* [적용] — 활성 탭에 따라 시작월 변경(예외①) 또는 신규 기간 생성(예외②③) */
  function _insPmApply(sub) {
    const m = document.getElementById('modal-prs-ins-period'); if (!m) return;
    if (_insPmTab === 'create') {
      const cs = (m.querySelector('[data-ins-pm-cstart]') || {}).value || '';
      const ce = (m.querySelector('[data-ins-pm-cend]')   || {}).value || '';
      _insCreatePeriodApply(sub, cs, ce);
    } else {
      const v = (m.querySelector('[data-ins-pm-start]') || {}).value || '';
      _insEditStartApply(sub, v);
    }
  }
  /* 적용 기간 수정 — 시작월 변경. 업로드 내역 있으면 변경 불가(예외 ①). */
  function _insEditStartApply(sub, newStart) {
    const latest = _insLatestPeriod(sub);
    if (!newStart) { _insPmErr('[data-ins-pm-err]', '시작월을 선택하세요.'); return; }
    const hasUploads = Object.keys(latest.uploads).length > 0;
    if (hasUploads && newStart !== latest.from) {
      _insPmErr('[data-ins-pm-err]', '해당 적용기간에 이미 업로드된 월 고지 내역이 있어 변경할 수 없습니다. 업로드된 월 고지내역을 삭제 후 변경해주세요.');
      return;
    }
    latest.from = newStart;
    latest.to   = _ymAdd(newStart, 11);
    const s = _insStore[sub];
    if (s.selPeriodId === latest.id && _insPeriodMonths(latest).indexOf(s.selMonth) < 0) s.selMonth = latest.from;
    closeModal('modal-prs-ins-period');
    _insRenderAll(sub);
    window.toast && window.toast(`적용 기간이 ${_insPeriodLabel(latest)}(으)로 설정되었습니다.`, 'success');
  }
  /* 적용 기간 생성 — 중복(②)·순차(③) 검증 후 신규 기간 추가. */
  function _insCreatePeriodApply(sub, start, end) {
    const s = _insStore[sub];
    const latest = _insLatestPeriod(sub);
    if (!start) { _insPmErr('[data-ins-pm-err]', '시작월을 선택하세요.'); return; }
    if (!end)   { _insPmErr('[data-ins-pm-err]', '종료월을 선택하세요.'); return; }
    if (end < start) { _insPmErr('[data-ins-pm-err]', '종료월은 시작월보다 빠를 수 없습니다.'); return; }
    if (start <= latest.to) {
      _insPmErr('[data-ins-pm-err]', '이미 등록된 적용 기간과 중복되는 기간입니다. 기존 적용 기간과 겹치지 않는 기간으로 설정해주세요.');
      return;
    }
    if (start !== _ymAdd(latest.to, 1)) {
      _insPmErr('[data-ins-pm-err]', '적용기간은 이전 적용기간의 종료월 다음 달부터 순차적으로 생성해야 합니다.');
      return;
    }
    if (!confirm('적용 기간을 생성하시겠습니까? 기존 적용기간의 업로드 및 적용 내역은 이력으로 보관됩니다.')) return;
    _insPeriodSeq += 1;
    const p = { id: 'IPD-' + _insPeriodSeq, from: start, to: end, uploads: {} };
    s.periods.push(p);
    s.selPeriodId = p.id;
    s.selMonth    = p.from;
    closeModal('modal-prs-ins-period');
    _insRenderAll(sub);
    window.toast && window.toast(`신규 적용 기간(${_insPeriodLabel(p)})이 생성되었습니다.`, 'success');
  }

  /* 엑셀 업로드 — 같은 고지월에 기존 파일이 있으면 재업로드 확인(예외 ③) */
  function _insAddFile(sub, file) {
    const s = _insStore[sub];
    const sel = _insSelPeriod(sub);
    const m = s.selMonth;
    if (sel.uploads[m]) {
      if (!confirm('해당 고지월에 이미 업로드된 월 고지 내역이 있습니다. 기존 파일을 삭제하고 새 파일로 다시 업로드하시겠습니까?')) return;
    }
    sel.uploads[m] = {
      fileName:   file ? file.name : `${_insLabel[sub]}_월고지액_${m}.xlsx`,
      fileSize:   file ? file.size : 28160,
      uploadedAt: _insStampNow(),
      data:       _insGen[sub](),
      applied:    false,
    };
    _insRenderLeft(sub); _insRenderRight(sub);
    window.toast && window.toast(`${_insLabel[sub]} ${_ymToYYMM2(m)} 월 고지액 업로드 완료`, 'success');
  }

  function _insDelUpload(sub) {
    const s = _insStore[sub];
    const sel = _insSelPeriod(sub);
    const m = s.selMonth;
    if (!sel.uploads[m]) return;
    if (!confirm(`${_ymToYYMM2(m)} 월 고지 내역을 삭제하시겠습니까?`)) return;
    delete sel.uploads[m];
    _insRenderLeft(sub); _insRenderRight(sub);
    window.toast && window.toast('월 고지 내역이 삭제되었습니다.', 'success');
  }

  function _insDownload(sub) {
    const sel = _insSelPeriod(sub);
    const up = sel.uploads[_insStore[sub].selMonth];
    if (up && typeof App.downloadFile === 'function') App.downloadFile(up.fileName, { context: _insLabel[sub] + ' 월 고지액' });
  }

  /* [적용] — 해당 고지월 고지액을 급여 정산(ledger)에 반영. 편집 중인 정산이 없으면 기준 자료로만 등록. */
  function _insApply(sub) {
    const s = _insStore[sub];
    const sel = _insSelPeriod(sub);
    const up = sel.uploads[s.selMonth];
    if (!up) return;
    up.applied = true;
    _insApplyToLedger(sub);
    _insRenderLeft(sub); _insRenderRight(sub);
    window.toast && window.toast(`${_insLabel[sub]} ${_ymToYYMM2(s.selMonth)} 고지액이 급여 정산에 반영되었습니다.`, 'success');
  }
  function _insApplyToLedger(sub) {
    const f = STATE.form;
    if (!f) return;   /* 목록 툴바 진입 — 반영할 정산 없음(기준 자료만 등록) */
    if (!f.ledger || !f.ledger.rows || !f.ledger.rows.length) {
      const r = STATE.editingId ? STATE.rounds.find(x => x.id === STATE.editingId) : null;
      if (r) { r.ledger = computeLedger(r); f.ledger = deepClone(r.ledger); }
    }
    if (!f.ledger || !f.ledger.rows) return;
    f.ledger.rows.forEach(row => {
      const d = row.deductions = row.deductions || {};
      const total = Number(row.total) || 0;
      if (sub === 'health')          { d.health = Math.round(total * 0.0354); d.ltcare = Math.round((d.health || 0) * 0.1295); }
      else if (sub === 'pension')    { d.pension = Math.round(total * 0.045); }
      else if (sub === 'employment') { d.employ = Math.round(total * 0.009); }
      _insRecalcRow(row);
    });
    if (STATE.editingId) {
      const r = STATE.rounds.find(x => x.id === STATE.editingId);
      if (r) r.ledger = deepClone(f.ledger);
    }
    refreshDetailSection(document.getElementById('page-hr-pay-settlement'), 'editor');
  }

  function _insOpenPeriodModal(sub) {
    _insPmTab = 'edit';
    _insRenderPeriodModal(sub);
    openModal('modal-prs-ins-period');
  }

  function bindInsPeriodModal() {
    const m = document.getElementById('modal-prs-ins-period');
    if (!m || m.dataset.insBound === '1') return;
    m.dataset.insBound = '1';
    m.addEventListener('click', e => {
      if (e.target === m || e.target.closest('[data-ins-pm-close]')) { closeModal('modal-prs-ins-period'); return; }
      const sub = _insActiveSub;
      const tab = e.target.closest('[data-ins-pm-tab]');
      if (tab) { _insPmTab = tab.dataset.insPmTab; _insRenderPeriodModal(sub); return; }
      if (e.target.closest('[data-ins-pm-apply]')) { _insPmApply(sub); return; }
    });
    /* 시작월 변경 시 종료월(=시작월+1년) 미리보기 갱신 — 커밋은 [적용] 시 */
    m.addEventListener('change', e => {
      if (e.target.matches('[data-ins-pm-start]') || e.target.matches('[data-ins-pm-cstart]')) {
        const v = e.target.value;
        const endSel = e.target.matches('[data-ins-pm-start]') ? '[data-ins-pm-end]' : '[data-ins-pm-cend]';
        const endEl = m.querySelector(endSel);
        if (endEl && v) endEl.value = _ymAdd(v, 11);
        if (e.target.matches('[data-ins-pm-cstart]')) _insPmLiveValidateCreate(_insActiveSub);
      }
    });
  }

  function bindInsuranceModal() {
    const m = document.getElementById('modal-prs-ded-insurance');
    if (!m || m.dataset.insBound === '1') return;
    m.dataset.insBound = '1';

    m.addEventListener('click', e => {
      const tab = e.target.closest('[data-ins-tab]'); if (tab) { _insSetTab(tab.dataset.insTab); return; }
      const sub = _insActiveSub;
      if (e.target.closest('[data-ins-dz]'))         { const inp = m.querySelector('[data-ins-dz-input]'); if (inp) inp.click(); return; }
      if (e.target.closest('[data-ins-manage]'))     { _insOpenPeriodModal(sub); return; }
      if (e.target.closest('[data-ins-apply]'))      { _insApply(sub); return; }
      if (e.target.closest('[data-ins-del-upload]')) { _insDelUpload(sub); return; }
      if (e.target.closest('[data-ins-download]'))   { e.preventDefault(); _insDownload(sub); return; }
    });

    m.addEventListener('change', e => {
      const sub = _insActiveSub;
      const s = _insStore[sub];
      if (e.target.matches('[data-ins-period]')) {
        s.selPeriodId = e.target.value;
        const p = _insSelPeriod(sub);
        if (_insPeriodMonths(p).indexOf(s.selMonth) < 0) s.selMonth = p.from;
        _insRenderLeft(sub); _insRenderRight(sub); return;
      }
      if (e.target.matches('[data-ins-month]'))     { s.selMonth = e.target.value; _insRenderLeft(sub); _insRenderRight(sub); return; }
      if (e.target.matches('[data-ins-dz-input]'))  { const file = e.target.files && e.target.files[0]; if (file) _insAddFile(sub, file); e.target.value = ''; return; }
    });

    /* 드래그&드롭 — dz 영역 위임 */
    m.addEventListener('dragover',  e => { const dz = e.target.closest('[data-ins-dz]'); if (dz) { e.preventDefault(); dz.classList.add('is-over'); } });
    m.addEventListener('dragleave', e => { const dz = e.target.closest('[data-ins-dz]'); if (dz) dz.classList.remove('is-over'); });
    m.addEventListener('drop',      e => {
      const dz = e.target.closest('[data-ins-dz]'); if (!dz) return;
      e.preventDefault(); dz.classList.remove('is-over');
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) _insAddFile(_insActiveSub, file);
    });
  }

  /* =========================================================
   *  간이세액표 업로드 — 4대보험과 동일한 분할 화면(적용 기간/업로드/미리보기/적용)
   *    단일 표(보험별 탭 없음). 업로드 시 미리보기, [적용] 시 정산 ledger 소득세/지방세 반영.
   * ========================================================= */
  /* 근로소득 간이세액표 미리보기 — 샘플 구간(월급여 천원 · 공제대상가족 1~5인 세액). mock. */
  const TAX_PREVIEW = [
    { wage: 2500, tax: [41630, 28600, 16530, 13990, 11450] },
    { wage: 3000, tax: [84850, 62460, 32490, 28720, 24950] },
    { wage: 3500, tax: [142220, 110920, 62600, 56500, 50400] },
    { wage: 4000, tax: [219500, 180220, 96850, 88840, 80830] },
    { wage: 4500, tax: [309480, 264150, 154860, 144860, 134860] },
    { wage: 5000, tax: [414520, 363590, 240070, 226240, 212410] },
    { wage: 6000, tax: [702940, 645510, 481200, 462840, 444480] },
    { wage: 8000, tax: [1411600, 1339880, 1095430, 1067430, 1039430] },
  ];
  /* versions: 적용 완료된 버전(이력, 삭제 불가) — applyFrom 내림차순. draft: 업로드만 된(미적용) 신규 파일. */
  const _taxStore = { versions: [], draft: null, seq: 0 };
  function _taxLatest() { return _taxStore.versions[0] || null; }

  function _taxSeed() {
    const f = STATE.form;
    const ym = (f && f.accruedMonth) || TODAY.slice(0, 7);
    const [y] = _ymParts(ym);
    /* 데모 — 직전 적용 버전 1건(이력 보관). 신규 업로드 시 새 버전으로 적용된다. */
    _taxStore.seq = 1;
    _taxStore.versions = [{ id: 'TAX-1', applyFrom: _ymOf(y, 1), fileName: `근로소득_간이세액표_${y}.xlsx`, fileSize: 36240, uploadedAt: _insSeedStamp() }];
    _taxStore.draft = null;
  }
  function _taxOpen() {
    if (!_taxStore.versions.length && !_taxStore.draft) _taxSeed();
    _taxRenderAll();
    openModal('modal-prs-ded-tax');
  }
  function _taxRenderAll() { _taxRenderCtx(); _taxRenderLeft(); _taxRenderRight(); }

  function _taxRenderCtx() {
    const host = document.querySelector('[data-tax-ctx]'); if (!host) return;
    host.innerHTML = `
      <div style="padding:10px 2px 12px;">
        <span class="form-help" style="margin:0;">국세청 <strong style="color:var(--color-text);">근로소득 간이세액표</strong>를 업로드하고, 우측에서 <strong style="color:var(--color-text);">반영 시작월</strong>을 지정해 [적용]하면 정산의 소득세·지방소득세에 반영됩니다.</span>
      </div>`;
  }
  function _taxRenderLeft() {
    const host = document.querySelector('[data-tax-left]'); if (!host) return;
    const d = _taxStore.draft;
    host.innerHTML = `
      <div class="split__head"><h3 style="font-size:var(--fs-md);">새 간이세액표 업로드</h3></div>
      <div class="split__body" style="padding:14px;">
        <label class="form-label" style="display:block;margin-bottom:6px;">엑셀 업로드</label>
        <div class="file-field">
          <div class="dz" data-tax-dz tabindex="0">
            <svg class="dz__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <div class="dz__title">파일을 끌어 놓거나 클릭하여 선택</div>
            <div class="dz__sub">엑셀(.xlsx/.xls) · CSV · PDF</div>
            <input type="file" hidden data-tax-dz-input accept=".xlsx,.xls,.csv,.pdf" />
          </div>
        </div>
        ${d ? `<div class="dz-file" style="margin-top:10px;"><span>📄</span><span class="dz-file__name">${esc(d.fileName)}</span><span class="dz-file__size">${(d.fileSize / 1024).toFixed(1)} KB</span><span class="pill pill--warning" style="margin-left:auto;font-size:11px;">미적용</span></div>` : ''}
        <p class="form-help" style="margin-top:8px;">업로드 후 우측에서 <strong>반영 시작월</strong>을 지정하고 [적용]하면 신규 버전으로 반영되며, 기존 버전은 이력으로 보관됩니다.</p>
      </div>`;
  }
  function _taxPreview() {
    const body = TAX_PREVIEW.map(r => `
      <tr>
        <td style="text-align:right;white-space:nowrap;">${fmtMoney(r.wage)}</td>
        ${r.tax.map(t => `<td style="text-align:right;">${fmtMoney(t)}</td>`).join('')}
      </tr>`).join('');
    return `
      <div class="table-card" style="margin:14px 0 10px;">
        <table class="tbl">
          <thead><tr><th style="text-align:center;">표기 구간</th><th style="text-align:center;">공제대상가족 수</th></tr></thead>
          <tbody><tr>
            <td style="text-align:center;">${TAX_PREVIEW.length}개 구간</td>
            <td style="text-align:center;">1인 ~ 5인</td>
          </tr></tbody>
        </table>
      </div>
      <div class="table-card"><div class="table-card__body" style="max-height:300px;">
        <table class="tbl tbl--hover" style="min-width:560px;">
          <thead><tr>
            <th style="width:120px;text-align:right;">월급여(천원)</th>
            <th style="text-align:right;">1인</th>
            <th style="text-align:right;">2인</th>
            <th style="text-align:right;">3인</th>
            <th style="text-align:right;">4인</th>
            <th style="text-align:right;">5인</th>
          </tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div></div>`;
  }
  /* 적용 이력 테이블 — 적용 완료 버전(삭제 불가) */
  function _taxHistory() {
    const vs = _taxStore.versions;
    if (!vs.length) return '';
    const rows = vs.map((v, i) => `
      <tr>
        <td style="text-align:center;">${_ymToYYMM2(v.applyFrom)} ~</td>
        <td><a href="javascript:;" data-tax-vdownload="${esc(v.id)}" style="color:var(--color-brand-primary);">${esc(v.fileName)} <span style="font-size:10px;">↓</span></a></td>
        <td style="text-align:center;white-space:nowrap;">${esc(v.uploadedAt)}</td>
        <td style="text-align:center;">${i === 0 ? '<span class="pill pill--success">현재 적용</span>' : '<span class="pill pill--muted">이력</span>'}</td>
      </tr>`).join('');
    return `
      <div class="table-card" style="margin-top:14px;">
        <div class="table-card__cap"><strong>적용 이력</strong><span class="t-muted" style="font-size:var(--fs-xs);">${vs.length}건 · 적용 완료 버전은 삭제할 수 없습니다</span></div>
        <div class="table-card__body" style="max-height:200px;">
          <table class="tbl" style="min-width:520px;">
            <thead><tr>
              <th style="width:120px;text-align:center;">반영 시작월</th>
              <th>파일</th>
              <th style="width:140px;text-align:center;">업로드일</th>
              <th style="width:90px;text-align:center;">상태</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  function _taxRenderRight() {
    const host = document.querySelector('[data-tax-right]'); if (!host) return;
    const d = _taxStore.draft;
    const latest = _taxLatest();

    if (!d && !latest) {
      host.innerHTML = `<div class="split__empty" style="flex-direction:column;gap:6px;text-align:center;line-height:1.6;">업로드된 간이세액표가 없습니다.<br><span style="font-size:var(--fs-sm);">좌측에서 엑셀을 업로드하세요.</span></div>`;
      return;
    }

    /* 헤더 — 미적용 신규(draft) 우선, 없으면 현재 적용 버전 */
    const head = d
      ? `<div class="split__head" style="align-items:center;height:auto;min-height:44px;padding:10px 14px;">
           <div style="display:flex;flex-wrap:wrap;gap:4px 20px;font-size:var(--fs-sm);color:var(--color-text-sub);align-items:center;">
             <span>신규 업로드 <strong style="color:var(--color-text);">${esc(d.fileName)}</strong></span>
             <span>업로드일 <strong style="color:var(--color-text);">${esc(d.uploadedAt)}</strong></span>
           </div>
           <span class="pill pill--warning" style="flex-shrink:0;">미적용</span>
         </div>`
      : `<div class="split__head" style="align-items:center;height:auto;min-height:44px;padding:10px 14px;">
           <div style="display:flex;flex-wrap:wrap;gap:4px 20px;font-size:var(--fs-sm);color:var(--color-text-sub);align-items:center;">
             <span>현재 적용 <strong style="color:var(--color-text);">${esc(latest.fileName)}</strong></span>
             <span>반영 시작 <strong style="color:var(--color-text);">${_ymToYYMM2(latest.applyFrom)}</strong></span>
           </div>
           <span class="pill pill--success" style="flex-shrink:0;">적용 완료</span>
         </div>`;

    const body = `<div class="split__body" style="padding:8px 12px;">${_taxPreview()}${_taxHistory()}</div>`;

    const foot = d
      ? `<div style="padding:10px 14px;border-top:1px solid var(--color-divider);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-shrink:0;background:var(--color-surface);">
           <button class="btn btn--sm" type="button" data-tax-del-upload style="color:var(--color-danger);">업로드 삭제</button>
           <div style="display:flex;align-items:center;gap:10px;">
             <label style="font-size:var(--fs-sm);color:var(--color-text-sub);white-space:nowrap;">반영 시작월</label>
             <input class="input" type="month" data-tax-applyfrom value="${esc(d.applyFrom)}" style="width:150px;" />
             <button class="btn btn--sm btn--primary" type="button" data-tax-apply>적용</button>
           </div>
         </div>`
      : `<div style="padding:10px 14px;border-top:1px solid var(--color-divider);display:flex;align-items:center;justify-content:flex-end;flex-shrink:0;background:var(--color-surface);">
           <span class="form-help" style="margin:0;">새 간이세액표는 좌측에서 업로드하세요. 적용 완료된 버전은 삭제할 수 없습니다.</span>
         </div>`;

    host.innerHTML = head + body + foot;
  }

  function _taxAddFile(file) {
    if (_taxStore.draft) {
      if (!confirm('업로드 대기 중인(미적용) 파일이 있습니다. 새 파일로 교체하시겠습니까?')) return;
    }
    const latest = _taxLatest();
    const defFrom = latest ? _ymAdd(latest.applyFrom, 1) : ((STATE.form && STATE.form.accruedMonth) || TODAY.slice(0, 7));
    const [y] = _ymParts(defFrom);
    _taxStore.draft = {
      fileName:   file ? file.name : `근로소득_간이세액표_${y}.xlsx`,
      fileSize:   file ? file.size : 36240,
      uploadedAt: _insStampNow(),
      applyFrom:  defFrom,
    };
    _taxRenderLeft(); _taxRenderRight();
    window.toast && window.toast('간이세액표 업로드 완료 — 반영 시작월 지정 후 [적용]하세요.', 'success');
  }
  /* 미적용(draft) 만 삭제 가능. 적용 완료 버전(versions)은 삭제 불가. */
  function _taxDelUpload() {
    if (!_taxStore.draft) return;
    if (!confirm('업로드한(미적용) 간이세액표를 삭제하시겠습니까?')) return;
    _taxStore.draft = null;
    _taxRenderLeft(); _taxRenderRight();
    window.toast && window.toast('미적용 간이세액표가 삭제되었습니다.', 'success');
  }
  function _taxDownload() {
    const f = _taxStore.draft || _taxLatest();
    if (f && typeof App.downloadFile === 'function') App.downloadFile(f.fileName, { context: '간이세액표' });
  }
  function _taxVDownload(id) {
    const v = _taxStore.versions.find(x => x.id === id);
    if (v && typeof App.downloadFile === 'function') App.downloadFile(v.fileName, { context: '간이세액표' });
  }
  /* [적용] — draft 를 신규 적용 버전으로 등록(이전 버전은 이력 보관) + 정산 ledger 소득세/지방세 반영 */
  function _taxApply() {
    const d = _taxStore.draft; if (!d) return;
    if (!d.applyFrom) { window.toast && window.toast('반영 시작월을 선택해 주세요.', 'warning'); return; }
    const latest = _taxLatest();
    if (latest && d.applyFrom <= latest.applyFrom) {
      window.toast && window.toast(`반영 시작월은 현재 적용 버전(${_ymToYYMM2(latest.applyFrom)}) 이후로 지정해 주세요.`, 'warning');
      return;
    }
    _taxStore.seq += 1;
    _taxStore.versions.unshift({ id: 'TAX-' + _taxStore.seq, applyFrom: d.applyFrom, fileName: d.fileName, fileSize: d.fileSize, uploadedAt: d.uploadedAt });
    _taxStore.versions.sort((a, b) => b.applyFrom.localeCompare(a.applyFrom));
    const fromTxt = _ymToYYMM2(d.applyFrom);
    _taxStore.draft = null;

    const f = STATE.form;
    if (f) {
      if (!f.ledger || !f.ledger.rows || !f.ledger.rows.length) {
        const r = STATE.editingId ? STATE.rounds.find(x => x.id === STATE.editingId) : null;
        if (r) { r.ledger = computeLedger(r); f.ledger = deepClone(r.ledger); }
      }
      if (f.ledger && f.ledger.rows) {
        f.ledger.rows.forEach(row => {
          const dd = row.deductions = row.deductions || {};
          const total = Number(row.total) || 0;
          dd.incomeTax = Math.round(total * 0.038);
          dd.localTax  = Math.round(dd.incomeTax * 0.1);
          _insRecalcRow(row);
        });
        if (STATE.editingId) { const r = STATE.rounds.find(x => x.id === STATE.editingId); if (r) r.ledger = deepClone(f.ledger); }
        refreshDetailSection(document.getElementById('page-hr-pay-settlement'), 'editor');
      }
    }
    _taxRenderLeft(); _taxRenderRight();
    window.toast && window.toast(f ? `간이세액표가 ${fromTxt}부터 급여 정산(소득세·지방소득세)에 반영됩니다.` : `간이세액표 등록 완료 — ${fromTxt}부터 정산 시 자동 반영됩니다.`, 'success');
  }

  function bindTaxModal() {
    const m = document.getElementById('modal-prs-ded-tax');
    if (!m || m.dataset.taxBound === '1') return;
    m.dataset.taxBound = '1';
    m.addEventListener('click', e => {
      if (e.target === m || e.target.closest('[data-tax-close]')) { closeModal('modal-prs-ded-tax'); return; }
      if (e.target.closest('[data-tax-dz]'))         { const inp = m.querySelector('[data-tax-dz-input]'); if (inp) inp.click(); return; }
      if (e.target.closest('[data-tax-apply]'))      { _taxApply(); return; }
      if (e.target.closest('[data-tax-del-upload]')) { _taxDelUpload(); return; }
      if (e.target.closest('[data-tax-download]'))   { e.preventDefault(); _taxDownload(); return; }
      const vdl = e.target.closest('[data-tax-vdownload]');
      if (vdl) { e.preventDefault(); _taxVDownload(vdl.dataset.taxVdownload); return; }
    });
    m.addEventListener('change', e => {
      if (e.target.matches('[data-tax-applyfrom]')) { if (_taxStore.draft) _taxStore.draft.applyFrom = e.target.value; return; }
      if (e.target.matches('[data-tax-dz-input]'))  { const file = e.target.files && e.target.files[0]; if (file) _taxAddFile(file); e.target.value = ''; return; }
    });
    m.addEventListener('dragover',  e => { const dz = e.target.closest('[data-tax-dz]'); if (dz) { e.preventDefault(); dz.classList.add('is-over'); } });
    m.addEventListener('dragleave', e => { const dz = e.target.closest('[data-tax-dz]'); if (dz) dz.classList.remove('is-over'); });
    m.addEventListener('drop',      e => {
      const dz = e.target.closest('[data-tax-dz]'); if (!dz) return;
      e.preventDefault(); dz.classList.remove('is-over');
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) _taxAddFile(file);
    });
  }

  function bindDeductUploadModals() {
    ['modal-prs-ded-insurance'].forEach(id => {
      const m = document.getElementById(id);
      if (!m) return;
      m.addEventListener('click', e => { if (e.target === m) closeModal(id); });
      m.querySelectorAll('[data-prs-ded-close]').forEach(b => b.addEventListener('click', () => closeModal(id)));
      m.querySelectorAll('[data-prs-ded-confirm]').forEach(b => b.addEventListener('click', () => {
        const kind = b.dataset.prsDedConfirm;
        confirmDeductUpload(kind);
      }));

      /* === Dropzone (UI Kit .dz / .dz-list 패턴) ===
       *   클릭 → hidden input 열기 / 드래그&드롭 / 파일 추가·제거.
       *   ui-kit.js 의 dropzone 코드와 동일 동작 — id 가 아닌 data-* 로 다중 인스턴스 지원. */
      const dz    = m.querySelector('[data-prs-ded-dz]');
      const input = m.querySelector('[data-prs-ded-dz-input]');
      const list  = m.querySelector('[data-prs-ded-dz-list]');
      if (!dz || !input || !list) return;
      const kind = dz.dataset.prsDedDz;
      const add = (fs) => {
        Array.from(fs || []).forEach(f => _dedFiles[kind].push(f));
        _renderDedFileList(kind);
      };
      dz.addEventListener('click',     () => input.click());
      dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('is-over'); });
      dz.addEventListener('dragleave', () => dz.classList.remove('is-over'));
      dz.addEventListener('drop',      e => {
        e.preventDefault();
        dz.classList.remove('is-over');
        add(e.dataTransfer && e.dataTransfer.files);
      });
      input.addEventListener('change', () => add(input.files));
      list.addEventListener('click', e => {
        const rm = e.target.closest('[data-prs-ded-dz-remove]');
        if (!rm) return;
        _dedFiles[kind].splice(Number(rm.dataset.i), 1);
        _renderDedFileList(kind);
      });
    });
  }

  /* ============ 모달 공통 ============ */
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
  function bindModals() {
    const cfgM = document.getElementById('modal-prs-config');
    if (cfgM) {
      cfgM.addEventListener('click', (e) => { if (e.target === cfgM) closeModal('modal-prs-config'); });
      cfgM.querySelectorAll('[data-prs-config-close]').forEach(b => b.addEventListener('click', () => closeModal('modal-prs-config')));
    }
    /* 계산 확인 모달 */
    const ccM = document.getElementById('modal-prs-calc-confirm');
    if (ccM) {
      const cancel = () => { STATE.calcCallback = null; closeModal('modal-prs-calc-confirm'); };
      ccM.addEventListener('click', e => { if (e.target === ccM) cancel(); });
      ccM.querySelectorAll('[data-prs-cc-close]').forEach(b => b.addEventListener('click', cancel));
      const okBtn = ccM.querySelector('[data-prs-cc-confirm]');
      if (okBtn) okBtn.addEventListener('click', () => {
        const cb = STATE.calcCallback;
        STATE.calcCallback = null;
        closeModal('modal-prs-calc-confirm');
        if (typeof cb === 'function') cb();
      });
    }
    /* 중단 확인 모달 */
    const cnM = document.getElementById('modal-prs-cancel-confirm');
    if (cnM) {
      const cancel = () => { STATE.cancelCallback = null; closeModal('modal-prs-cancel-confirm'); };
      cnM.addEventListener('click', e => { if (e.target === cnM) cancel(); });
      cnM.querySelectorAll('[data-prs-cnc-close]').forEach(b => b.addEventListener('click', cancel));
      const okBtn = cnM.querySelector('[data-prs-cnc-confirm]');
      if (okBtn) okBtn.addEventListener('click', () => {
        const cb = STATE.cancelCallback;
        STATE.cancelCallback = null;
        closeModal('modal-prs-cancel-confirm');
        if (typeof cb === 'function') cb();
      });
    }
    /* 확정 확인 모달 */
    const fcM = document.getElementById('modal-prs-finalize-confirm');
    if (fcM) {
      const cancel = () => { STATE.finalizeCallback = null; closeModal('modal-prs-finalize-confirm'); };
      fcM.addEventListener('click', e => { if (e.target === fcM) cancel(); });
      fcM.querySelectorAll('[data-prs-fc-close]').forEach(b => b.addEventListener('click', cancel));
      const okBtn = fcM.querySelector('[data-prs-fc-confirm]');
      if (okBtn) okBtn.addEventListener('click', () => {
        const cb = STATE.finalizeCallback;
        STATE.finalizeCallback = null;
        closeModal('modal-prs-finalize-confirm');
        if (typeof cb === 'function') cb();
      });
    }
  }

  /* ============ 계산 / 중단 / 확정 확인 모달 오픈 ============
   *   중요한 상태 전이는 브라우저 confirm 대신 UI Kit 스타일 모달로 안내. */
  function openCalcConfirmModal(r, onConfirm) {
    const modal = document.getElementById('modal-prs-calc-confirm');
    if (!modal) { if (onConfirm) onConfirm(); return; }
    STATE.calcCallback = onConfirm;
    const nameEl = modal.querySelector('#prs-cc-name');
    if (nameEl) nameEl.textContent = r.name || '';
    openModal('modal-prs-calc-confirm');
  }
  function openCancelConfirmModal(r, onConfirm) {
    const modal = document.getElementById('modal-prs-cancel-confirm');
    if (!modal) { if (onConfirm) onConfirm(); return; }
    STATE.cancelCallback = onConfirm;
    const nameEl = modal.querySelector('#prs-cnc-name');
    if (nameEl) nameEl.textContent = r.name || '';
    openModal('modal-prs-cancel-confirm');
  }
  function openFinalizeConfirmModal(r, onConfirm) {
    const modal = document.getElementById('modal-prs-finalize-confirm');
    if (!modal) { if (onConfirm) onConfirm(); return; }
    STATE.finalizeCallback = onConfirm;
    const nameEl = modal.querySelector('#prs-fc-name');
    if (nameEl) nameEl.textContent = r.name || '';
    openModal('modal-prs-finalize-confirm');
  }

  /* ============ 정산 설정 (상세) 모달 ============
   *   페이지바 [상세] 버튼으로 오픈. 정산 설정을 「보기 형식」(key-value)으로 노출 —
   *   기본 정보 · 대상자 조건 · 지급/공제 항목. (수정이 아닌 조회 용도라 폼 인풋 대신 KV 뷰) */
  function configGroupLabel(tf) { return (tf && tf.empGroup === 'daily') ? '일용직 그룹' : '상용직 그룹'; }
  function configLabelsFrom(options, values) {
    const set = values || [];
    const labels = options.filter(o => set.includes(o.value)).map(o => o.label);
    return labels.length ? labels.join(', ') : '전체';
  }
  function renderConfigBasicView(f) {
    const items = [
      { k: '정산번호', v: esc(f.id) },
      { k: '정산유형', v: esc(settleTypeLabel(f.settlementType)) },
      { k: '정산명',   v: esc(f.name || '-') },
      { k: '귀속월',   v: esc(f.accruedMonth ? dispYm(f.accruedMonth) : '-') },
      { k: '지급일',   v: esc(f.payDate ? dispYmd(f.payDate) : '-') },
      { k: '대상자 조회기간',   v: esc(periodText(f.targetFrom, f.targetTo)) },
    ];
    if (isRegularSettle(f)) items.push({ k: '초과근무 정산기간', v: esc(periodText(f.otFrom, f.otTo)) });
    items.push(
      { k: '생성자', v: esc(f.createdBy || '-') },
      { k: '생성일', v: esc(f.createdAt ? dispYmd(f.createdAt) : '-') },
    );
    if (f.description) items.push({ k: '설명', v: esc(f.description), full: true });
    return kvCard(1, '기본 정보', items);
  }
  function renderConfigTargetView(f) {
    const tf = f.targetFilter || {};
    const isDaily = tf.empGroup === 'daily';
    const items = [
      { k: '정산 그룹', v: esc(configGroupLabel(tf)) },
      { k: '근로유형', v: isDaily ? '일용직' : esc(configLabelsFrom(WORK_TYPE_OPTIONS, tf.empType)) },
      { k: '사원 유형', v: esc(configLabelsFrom(JOB_CAT_OPTIONS, tf.jobCat)) },
      { k: '직책', v: esc(tf.position || '전체') },
      { k: '부서', v: esc(tf.dept || '전체') },
      { k: '확정 인원', v: `${(f.targetCount || 0).toLocaleString()}<small style="color:var(--color-text-muted);font-weight:var(--fw-regular);"> 명</small>` },
    ];
    return kvCard(2, '정산 대상자 조건', items, '정산 기간 중 1일이라도 근무 이력이 있으면 재직·휴직·퇴직 구분 없이 대상자로 포함됩니다.');
  }
  /* 지급·공제 항목 — 보기 전용. 항목명을 칩(pill)으로 나열. */
  function renderConfigItemsView(f) {
    const all = allPayItems();
    const pays = (f.payItemCodes || []).map(c => (all.find(x => x.code === c) || { name: c }).name);
    const deds = (f.deductItemCodes || DEDUCT_DEFAULT_CODES).map(k => (deductColByKey(k) || {}).label).filter(Boolean);
    const chips = (arr) => arr.length
      ? `<div class="prs-chiplist">${arr.map(n => `<span class="pill">${esc(n)}</span>`).join('')}</div>`
      : '<span class="t-muted">-</span>';
    const items = [
      { k: `지급 항목 (${pays.length})`, v: chips(pays), full: true },
      { k: `공제 항목 (${deds.length})`, v: chips(deds), full: true },
    ];
    return kvCard(3, '지급·공제 항목', items, '급여대장에 포함되는 지급/공제 항목입니다.');
  }
  function openConfigModal() {
    const f = STATE.form;
    if (!f) return;
    const modal = document.getElementById('modal-prs-config');
    if (!modal) return;
    const body = modal.querySelector('#prs-config-body');
    if (!body) return;
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:14px;">
        ${renderConfigBasicView(f)}
        ${renderConfigTargetView(f)}
        ${renderConfigItemsView(f)}
      </div>
    `;
    openModal('modal-prs-config');
  }

  /* =========================================================
   *  Public API
   * ========================================================= */
  /* 외부 페이지(예: 급여 명세서 조회)에서 정산 페이지를 한 번도 진입하지 않은 상태로
   *   API 를 호출할 수 있도록 — STATE.rounds 가 비어 있으면 즉시 mock 시드. */
  function ensureRoundsSeeded() {
    if (!STATE.rounds || !STATE.rounds.length) STATE.rounds = makeMock();
    return STATE.rounds;
  }
  App.HRPaySettlement = {
    list:         () => ensureRoundsSeeded().slice(),
    listByStatus: (statuses) => ensureRoundsSeeded().filter(r => (statuses || []).includes(r.status)),
    get:          (id) => ensureRoundsSeeded().find(r => r.id === id) || null,
    statusLabel:  (code) => STATUS[code] || null,
  };

  /* =========================================================
   *  Page Init
   * ========================================================= */
  let built = false;
  function initPage() {
    const pageEl = document.getElementById('page-hr-pay-settlement');
    if (!pageEl) return;
    pageEl.__onShow = () => {
      if (!built) {
        STATE.rounds = makeMock();
        bindModals();
        bindDeductUploadModals();
        bindInsuranceModal();
        bindInsPeriodModal();
        bindTaxModal();
        built = true;
      }
      renderListView(pageEl);
      applyFilter();
      renderTable();
    };
  }
  const prev = App.initPages;
  App.initPages = function () {
    if (typeof prev === 'function') prev();
    initPage();
  };
})();
