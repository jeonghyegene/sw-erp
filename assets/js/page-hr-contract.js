/* =========================================================
 * Page: HR > 발령 및 계약 > 계약
 *   SCR-CTR-01 계약 목록 (체크박스 + 일괄 서명요청 발송)
 *   SCR-CTR-02 계약서 작성 (풀스크린 편집 — page-bar + split + doc-editor)
 *   SCR-CTR-05 계약서 상세 (풀스크린 split — 좌: 진행상황+이력+계약정보 / 우: 본문)
 *   + 무효화 사유 다이얼로그 / 직원 picker 모달
 *
 *  현재 로그인 사용자: HR 담당자 (데모 가정)
 *
 *  내부 view 전환:
 *   STATE.view = 'list' | 'editor' | 'detail'
 *   render 함수가 pageEl 의 내부 마크업을 통째로 재구성
 *
 *  UI Kit 재사용:
 *   .search, .toolbar, .btn(*)         — 목록 검색·액션
 *   .tbl + tr.is-attention/.is-row-danger — 만기 강조 (신규)
 *   .pill(*)                            — 상태·D-day 배지
 *   .page-bar / .doc-editor             — 풀스크린 화면 골격 (신규)
 *   .split / .split__left / .split__right — 좌우 분할
 *   .steps-v / .is-done / .is-current / .is-error — 진행 단계 (신규)
 *   .timeline / .tl-item                — 처리 이력
 *   .fm-tbl / .fm-tbl--compact          — 계약 정보 (label/value)
 *   .emp-chip / .picker-list            — 직원 선택 (신규)
 *   .modal                              — 무효화·picker 다이얼로그
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  /* ============ 현재 사용자 (데모) ============ */
  const ROLE = 'hr';
  const HR_NAME = '정혜진';
  const COMPANY = '주식회사 성원애드피아';
  const COMPANY_REPR = '윤성수'; // 대표이사
  const COMPANY_ADDR = '서울 강남구 테헤란로 100';

  /* ============ 회사 인감 (사전 등록 stub) ============
   * 실제 환경에서는 「시스템 설정 > 회사 인감 관리」 화면에서 등록.
   * 본 데모에서는 사전 등록되어 있다고 가정 (도장 이미지 없이 텍스트만). */
  const COMPANY_SEAL = {
    type: 'seal',                  // 'seal' (도장) | 'sig' (사인)
    text: '성원\n애드피아',          // 도장에 새겨질 문구
    registeredAt: '2026-01-15',
    registeredBy: '윤성수 (대표)',
  };

  /* ============ 상태 정의 ============
   *  draft   → signing (HR 발송, 회사 직인 자동 배치)
   *  signing → active  (직원 전자 서명 완료 = 계약 효력 발생 · 최종 단계)
   *  분기: rejected (직원 거부), expired (만료), voided (무효)
   *  ※ 대표이사 최종 승인 단계 없음 — 직원 전자서명 완료가 최종 단계다. */
  const STATUS = {
    /* 2상 status — 최종 단계는 직원 전자서명 완료(active). 대표이사 최종 승인 단계 없음.
         signing : 서명 대기 (회사 인감 배치 후 직원 서명 대기)
         active  : 서명 완료 (직원 서명 완료 → 계약 효력)
       draft 는 데모 시드/리스트에서 제외, signed 는 legacy 호환용 (목록에선 active 와 동일하게 표기). */
    draft:    { label: '초안',         pill: '' },
    signing:  { label: '서명 대기',    pill: 'info' },
    signed:   { label: '서명 완료',    pill: 'success' },  // legacy → 서명 완료 와 동일 취급
    active:   { label: '서명 완료',    pill: 'success' },
    /* 파생 상태(저장 X) — 서명완료(유효) 계약이 종료 30일 이내일 때 effectiveStatusCode 가 부여 */
    expiringSoon: { label: '만료 임박', pill: 'warning' },
    rejected: { label: '반려',         pill: 'danger' },
    expired:  { label: '만료',         pill: '' },
    voided:   { label: '무효',         pill: 'danger' },
    canceled: { label: '취소',         pill: 'muted' },   // 서명 대기(미서명) 계약을 HR 이 취소
  };
  const KINDS = ['근로계약서', '임금계약서'];

  /* ============ 직원 마스터 ============
   *   App.HRMembers(hr-members-data) 와 동일한 mock 데이터 공유.
   *   필드: id, name, dept, job, rank, position, empType, contractSubType, contractOut, jobCat, email
   *   contractSubType: '' (일반 계약직) | 'chotak' (촉탁) | 'intern' (인턴) — 계약직에만 적용
   *   colorIdx: 아바타 색 인덱스 (seed 기반 계산) — 공유 데이터에는 없으므로 여기서 부여
   *   공유 데이터 없을 때를 위한 fallback 하드코딩은 비상용 (실제 사용 시 hr-members-data 가 먼저 로드됨) */
  const EMPLOYEES = (function buildEmployees() {
    const members = (window.App && App.HRMembers && App.HRMembers.list)
      ? App.HRMembers.list()
      : [];
    if (!members.length) {
      /* fallback — hr-members-data 미로드 케이스 (방어용, 일반적으로 발생 안 함) */
      return [
        { id:'SW260101', name:'김지훈', dept:'경영지원본부', job:'인사', rank:'사원', position:'팀원', empType:'regular', contractSubType:'', contractOut:false, jobCat:'office', colorIdx:2, email:'kim.jh@swadpia.co.kr' },
      ];
    }
    const list = members.slice(0, 12).map((m, i) => ({
      id: m.id,
      name: m.name || (m.fname + m.gname),
      dept: m.dept,
      job: m.job,
      rank: m.rank,
      position: m.position,
      empType: m.empType,
      contractSubType: m.contractSubType || '',
      contractOut: !!m.contractOut,
      jobCat: m.jobCat,
      colorIdx: (i % 6) + 1,
      email: m.email,
    }));
    /* 정현우 — 인사정보카드 데모 쇼케이스 직원(정규직)으로 강제 보정.
       공유 데이터상 도급 분포(i%4===0)로 잡혀 계약 이력이 비어 보이는 문제를 맞춘다. */
    const jhw = list.find(e => e.name === '정현우');
    if (jhw) {
      jhw.empType = 'regular'; jhw.contractOut = false; jhw.contractSubType = '';
      jhw.dept = '인사팀'; jhw.job = '인사'; jhw.rank = '대리'; jhw.position = '팀원';
      jhw.jobCat = 'office'; jhw.site = jhw.site || '성수동';
    }
    return list;
  })();

  /* ============ 직원 정보 라벨 매핑 ============ */
  const EMP_TYPE_LABEL = { regular: '정규직', contract: '계약직', daily: '일용직' };
  const CONTRACT_SUB_LABEL = { chotak: '촉탁', intern: '인턴' };
  const JOB_CAT_LABEL  = { office: '사무직', production: '생산직', research: '연구직' };
  function empTypeDisplay(e) {
    if (!e) return '';
    const base = EMP_TYPE_LABEL[e.empType] || '';
    const sub = e.empType === 'contract' && CONTRACT_SUB_LABEL[e.contractSubType];
    return sub ? `${base} (${sub})` : base;
  }
  function affiliationDisplay(e) { return e && e.contractOut ? '도급' : '-'; }
  function jobCatDisplay(e)      { return e ? (JOB_CAT_LABEL[e.jobCat] || '-') : '-'; }
  function empAvatar(emp, size) {
    if (!emp) return '';
    const ch = (emp.name || '?').charAt(0);
    return `<span class="av av--${size || 'md'} av--c${emp.colorIdx || 1}">${esc(ch)}</span>`;
  }

  /* ============ 계약 서식 — HTML 기반 (PDF 같은 문서 구조) ============ */
  /** 근무시간 문자열("09:00 ~ 18:00")을 [시업, 종업] 으로 분리. 값이 없으면 ['','']. */
  function splitWorkTime(s) {
    const parts = String(s || '').split('~').map(x => x.trim());
    return [parts[0] || '', parts[1] || ''];
  }

  /** 급여 조항 렌더 — 임금계약서 제3조(급여) 전용 (근로계약서에는 급여를 두지 않음).
   *  근로계약서 샘플.xlsx 제4조 구조: ① 총연봉 ② 총월봉+구성표(기본급/연장근로수당/기타수당/월임금합계·산정식)
   *  ③ 지급 ④ 원천징수 ⑤ 결근공제 ⑥ 일할계산. 시급제(일용직)는 시급·주휴수당·계약시급 구성으로 대체. */
  function wageClauses(v) {
    const isHourly    = v.wageTypeKey === 'hourly';
    const isInclusive = v.wageContractKindKey === 'inclusive';
    const payDay = (String(v.지급일 || '').match(/\d+/) || ['10'])[0];
    let rows;
    let headLines;
    if (isHourly) {
      rows = `
    <tr><th>시급</th><td>${money(v.시급)}</td><td>기본 시급</td></tr>
    <tr><th>주휴수당</th><td>${money(v.주휴수당)}</td><td>시급 × 20%</td></tr>
    <tr class="is-total"><th>계약 시급</th><td>${money(v.계약금액)}</td><td>주휴수당 포함</td></tr>`;
      headLines = `<p class="doc-paper__cl">① '을'의 임금은 시급제로 하며, 임금의 구성은 다음과 같다.</p>`;
    } else {
      const baseAmt = v.월기본급;
      const otAmt   = isInclusive ? v.월고정연장근무수당 : v.월시간외수당;
      const otHours = v.fixedOTHours ? `${esc(v.fixedOTHours)}시간` : '';
      const otNote  = isInclusive ? '포괄임금' : (otHours || '');
      const monthlyTotal = sumMoney(baseAmt, otAmt);
      rows = `
    <tr><th>기본급</th><td>${money(baseAmt)}</td><td></td></tr>
    <tr><th>연장근로수당</th><td>${money(otAmt)}</td><td>${esc(otNote)}</td></tr>
    <tr><th>기타수당</th><td>-</td><td></td></tr>
    <tr class="is-total"><th>월임금합계</th><td>${monthlyTotal}</td><td></td></tr>`;
      headLines = `
<p class="doc-paper__cl">① '을'의 총연봉액은 <strong>${money(v.계약금액)}</strong> 원 이며, 이를 매월 지급한다.</p>
<p class="doc-paper__cl">② '을'의 총월봉액은 <strong>${monthlyTotal}</strong> 원 이며, 월급여의 구성은 다음과 같다.</p>`;
    }
    return `${headLines}
<table class="doc-paper__tbl doc-paper__tbl--wage">
  <thead><tr><th>항목</th><th>금액 (원)</th><th>산정식</th></tr></thead>
  <tbody>${rows}
  </tbody>
</table>
<p class="doc-paper__cl">③ 급여는 매월 1일부터 말일까지를 산정기간으로 하여, 익월 ${esc(payDay)}일(휴일인 경우 익일)에 '을' 본인명의의 계좌로 지급한다.</p>
<p class="doc-paper__cl">④ 월 급여 지급시 근로소득세 및 건강보험료, 국민연금, 고용보험 등의 제세공과금을 원천징수한 후 지급한다.</p>
<p class="doc-paper__cl">⑤ 결근일 및 지각, 조퇴, 임의외출 등으로 근무하지 않은 시간에 대해서는 무급을 원칙으로 하며, 해당 시간 및 일에 대한 임금을 공제할 수 있다.</p>
<p class="doc-paper__cl">⑥ 중도입사, 퇴사, 휴직, 복직 등으로 월급여 산정기간을 만근하지 못할 경우 전체 산정대상 기간 일수에 대한 근무일수를 일할계산하여 급여를 지급한다.</p>`;
  }

  function tplWork(v) {
    /* 근로계약서 — ㈜성원애드피아 표준 서식(근로계약서 샘플.xlsx) 기반 12개 조항 구조.
     *   종류(정규직/기간제)는 제1조 근로계약기간 문구로만 분기. 급여 상세는 임금계약서(tplWage)에만 둔다. */
    const docTitle = v.근로계약서종류
      || (((v.고용구분 || '').indexOf('정규직') >= 0 && v.무기) ? '정규직 근로계약서' : '기간제 근로계약서');
    const start = esc(v.시작일) || '____-__-__';
    const end   = esc(v.종료일) || '____-__-__';
    const period = v.무기
      ? `① '을'의 근로계약기간은 ${start} 부터 <strong>기한의 정함이 없는 근로계약</strong>을 체결한 것으로 한다.`
      : `① '을'의 근로계약기간은 ${start} ~ ${end} 로 한다.`;
    /* 근로시간 표 — 교대 모드면 '교대 근무표에 따름', 고정이면 근무시간 시업/종업 분리 */
    const shift = v.근무형태 === '교대';
    const wt = splitWorkTime(v.근무시간);
    const st  = shift ? '교대 근무표에 따름' : (wt[0] || '_____');
    const et  = shift ? '' : (wt[1] || '_____');
    const brk = v.휴게시간 || '12:00 ~ 13:00';
    const confirm = `<p class="doc-paper__confirm">내용 확인 및 동의 <em></em> (서명)</p>`;
    return `
<h2 class="doc-paper__title">${esc(docTitle)}</h2>

<p class="doc-paper__intro">「${esc(v.회사명) || '_______'}」(이하 '갑'이라 한다)는 근로자 「${esc(v.직원명) || '_______'}」(이하 '을'이라 한다)과(와) 아래와 같은 내용으로 근로계약을 체결한다.</p>
<p class="doc-paper__divider">■　　아　　래　　■</p>

<h3 class="doc-paper__art">제1조 (근로계약기간)</h3>
<p class="doc-paper__cl">${period}</p>
${v.무기 ? '' : `<p class="doc-paper__note">※ 계약직의 경우 별도의 계약 갱신이 이루어지지 않는 한 상기 근로계약기간의 만료로 근로관계가 자동 종료된다.</p>`}
<p class="doc-paper__cl">② '을'의 임금계약기간은 ${start} ~ ${v.무기 ? '<strong>기간의 정함 없음</strong>' : end} 로 한다.</p>
<p class="doc-paper__note">※ 새로운 임금계약이 체결되기 전까지 자동 갱신된다.</p>

<h3 class="doc-paper__art">제2조 (근무장소 및 직종)</h3>
<p class="doc-paper__cl">① '을'의 근무장소 및 직종은 <strong>${esc(v.근무지) || '_______'} / ${esc(v.부서) || '_______'}</strong> (으)로 한다.</p>
<p class="doc-paper__cl">② '갑'은 업무상 필요에 따라 '을'의 근무장소 및 직종을 변경할 수 있으며, '을'은 정당한 이유없이 이를 거부할 수 없다.</p>

<h3 class="doc-paper__art">제3조 (근로시간)</h3>
<p class="doc-paper__cl">① 근로시간은 일 8시간, 주 40시간을 원칙으로 한다.</p>
<p class="doc-paper__cl">② '을'의 기본 근로시간 및 휴게시간은 다음과 같으며, 시차출퇴근제 적용자는 회사가 지정하는 범위에서 근로자가 시업시각과 종업시각을 선택할 수 있다. 이 경우에도 휴게시간은 원칙적으로 12~13시로 한다.</p>
<table class="doc-paper__tbl doc-paper__tbl--center">
  <thead><tr><th>교대조</th><th>시업시각</th><th>종업시각</th><th>휴게시간</th></tr></thead>
  <tbody>
    <tr><td>주간조</td><td>${esc(st)}</td><td>${esc(et)}</td><td>${esc(brk)}</td></tr>
    ${shift ? `<tr><td>야간조</td><td colspan="3">교대 근무표에 따름</td></tr>` : ''}
  </tbody>
</table>
<p class="doc-paper__cl">③ '갑'은 업무상 스케줄 필요에 따라 근무시간을 조정(시업 및 종업시간, 휴게시간, 단축 및 연장)할 수 있으며, '을'은 주 12시간 한도 내에서 시간외 근로를 요구할 수 있다.</p>
${confirm}
<p class="doc-paper__cl">④ 시간외 근로는 회사의 지시와 승인을 받은 시간만을 인정하며, 임의적인 시간외근로는 근로시간으로 인정하지 아니한다.</p>
<p class="doc-paper__cl">⑤ 승인없이 소정근무일에 휴무를 하는 경우 사유불문하고 무단 결근으로 처리되며, 무단결근 3회 누적시 징계처리 될 수 있다.</p>
${confirm}


<h3 class="doc-paper__art">제4조 (퇴직금)</h3>
<p class="doc-paper__cl">① '을'의 계속근로연수가 1년 이상인 경우 '을'의 퇴직시에 계속근로연수 1년에 대하여 30일분의 평균임금을 퇴직금으로 지급한다.</p>
<p class="doc-paper__cl">② 전항의 퇴직급여와 관련하여 근로자 퇴직급여보장법 상의 요건에 따라 퇴직연금제를 도입하여 운영할 수 있다.</p>
<p class="doc-paper__cl">③ '갑'은 퇴직금 등 근로관계에서 발생한 일체의 금품을 '을'의 퇴직 후 14일 이내에 지급하도록 한다.</p>

<h3 class="doc-paper__art">제5조 (휴일)</h3>
<p class="doc-paper__cl">① 근로자의 날 및 주휴일을 유급휴일로 하며, 주휴일은 1주간 소정의 근로일을 개근한 경우 부여한다.</p>
<p class="doc-paper__cl">② 매주 토요일은 무급휴일로 한다.</p>

<h3 class="doc-paper__art">제6조 (연차휴가)</h3>
<p class="doc-paper__cl">1년 이내에 퇴직시 1개월 만근시 1일의 연차휴가를 산정(근로기준법 제60조 2항)하는 바, 이와 더불어 부여한 연차일수(회계년도기준 비례부여일수)는 총연차휴가일수에서 공제하며, 이미 초과 사용한 일수는 퇴직시 임금에서 공제한다.</p>
<p class="doc-paper__note">※ 1년 이상 근무의 경우도 퇴사시 입사일 기준으로 산정된 연차휴가보다 초과부여·사용시 동일 적용함.</p>
${confirm}

<h3 class="doc-paper__art">제7조 (근로계약의 해지)</h3>
<p class="doc-paper__cl">① '갑'은 '을'이 다음 각 호에 해당하는 때에는 근로계약기간 중이라도 중도에 해지할 수 있다.</p>
<p class="doc-paper__cl">&nbsp;&nbsp;1. 업무수행능력이 현저히 부족하거나 업무를 태만히 한 때(계약기간 중 '갑'은 '을'의 업무적격성을 평가한다)</p>
<p class="doc-paper__cl">&nbsp;&nbsp;2. 고의 또는 중대한 과실로 회사에 손해를 입혔을 때</p>
<p class="doc-paper__cl">&nbsp;&nbsp;3. 업무(량)의 변화, 사업의 종료 등의 사유로 계약의 해지가 불가피한 때</p>
<p class="doc-paper__cl">&nbsp;&nbsp;4. 입사시 제출한 학력이나 경력이 허위인 것으로 밝혀졌을 때</p>
<p class="doc-paper__cl">&nbsp;&nbsp;5. 기타 사회통념상 근로관계의 계속이 곤란한 사유가 있는 때</p>
<p class="doc-paper__note">※ 계속 5일 이상 또는 월 합계가 7일 이상 결근한 경우, 근로의사가 없는 것으로 간주 징계 절차없이 자동면직 한다.</p>
<p class="doc-paper__cl">② '갑'이 '을'과의 근로계약을 중도에 해지하고자 하는 경우 30일 이전에 예고하여야 하며, 계약의 해지(해고)에 대해 그 사유와 시기를 명시하여 서면으로 통보하여야 한다.</p>
<p class="doc-paper__cl">③ '을'이 계약기간 도중 사직하고자 하는 경우 최소 30일 전에 근로계약의 해지의사(사직원)를 '갑'에게 제출하여 승인을 받도록 하며, 업무인수인계에 지장이 없도록 협조하여야 하며, 이로 인해 손해가 발생한 경우 이를 배상하여야 한다.</p>
${confirm}
<p class="doc-paper__cl">④ '을'은 퇴직 시 지급물품 및 비품(출입카드, 법인카드, 사무용품 등)을 퇴직 당일 회사에 반납하여야 하며, 기타 '을'의 일방적인 계약 해지로 '갑'에게 손해가 발생한 경우 이를 배상하여야 한다.</p>
${confirm}

<h3 class="doc-paper__art">제8조 (준수사항)</h3>
<p class="doc-paper__cl">'을'은 다음 각 호의 사항을 엄수하여야 하며, 이를 위반할 경우 계약기간 중에라도 해고될 수 있다.</p>
<p class="doc-paper__cl">&nbsp;&nbsp;1. '을'은 직무 중 지득한 '갑'의 영업 기밀, 기타 사업과 관련된 주요 정보를 제3자에게 누설하여서는 아니된다.</p>
<p class="doc-paper__cl">&nbsp;&nbsp;2. '을'은 자신의 연봉액에 대한 기밀을 유지하여야 하며, 타인의 연봉액을 알게 될 경우 회사의 승인없이 제3자에게 유출하여서는 아니된다.</p>

<h3 class="doc-paper__art">제9조 (계약의 변경)</h3>
<p class="doc-paper__cl">'갑'은 계약기간 중 계약 내용을 변경하여야 할 중대하고 명백한 사정이 있는 경우 '을'과의 협의로 근로계약의 내용을 변경할 수 있다.</p>

<h3 class="doc-paper__art">제10조 (손해배상)</h3>
<p class="doc-paper__cl">'을'이 고의 또는 중대한 과실로 '갑'에게 손해를 끼친 경우 '을'은 이를 배상하여야 한다.</p>

<h3 class="doc-paper__art">제11조 (기타의 근로조건)</h3>
<p class="doc-paper__cl">본 계약에서 정하지 아니한 사항에 대하여는 노동관계법령 및 취업규칙의 내용에 따른다.</p>

<p class="doc-paper__cl">본 계약서는 근로자와 사용자가 날인한 후 '갑'과 '을'이 각 1부씩 보관한다.</p>

<h3 class="doc-paper__art">근로자 인적사항</h3>
<table class="doc-paper__tbl">
  <tr><th>성명</th><td>${esc(v.직원명) || ''}</td><th>사번</th><td>${esc(v.사번) || ''}</td></tr>
  <tr><th>소속</th><td>${esc(v.부서) || ''}</td><th>직위 / 직책</th><td>${esc(v.직위) || '_______'} / ${esc(v.직책) || '_______'}</td></tr>
  <tr><th>개인연락처</th><td></td><th>주민등록번호</th><td></td></tr>
  <tr><th>주소</th><td colspan="3"></td></tr>
</table>

<p class="doc-paper__signdate">작성일: ${esc(v.작성일) || todayStr()}</p>

[[SIGNATURES]]`;
  }
  function tplWage(v) {
    /* 임금계약서 — 근로계약서 샘플.xlsx 의 급여(제4조) 내용만 떼어 구성.
     *   급여 본문(제3조)은 wageClauses(v) 헬퍼로 렌더 (급여는 임금계약서에만 존재). */
    const start = esc(v.시작일) || '____-__-__';
    const end   = esc(v.종료일) || '____-__-__';
    return `
<h2 class="doc-paper__title">임 금 계 약 서</h2>

<p class="doc-paper__intro">「${esc(v.회사명) || '_______'}」(이하 '갑'이라 한다)는 근로자 「${esc(v.직원명) || '_______'}」(이하 '을'이라 한다)과(와) 아래와 같은 내용으로 임금계약을 체결한다.</p>
<p class="doc-paper__divider">■　　아　　래　　■</p>

<h3 class="doc-paper__art">제1조 (근로자 정보)</h3>
<table class="doc-paper__tbl">
  <tr><th>사번 / 성명</th><td>${esc(v.사번) || '_______'} / ${esc(v.직원명) || '_______'}</td></tr>
  <tr><th>소속 / 직책</th><td>${esc(v.부서) || '_______'} / ${esc(v.직책) || '_______'}</td></tr>
  <tr><th>직무 / 직위</th><td>${esc(v.직무) || '_______'} / ${esc(v.직위) || '_______'}</td></tr>
  <tr><th>고용 구분</th><td>${esc(v.고용구분) || '_______'}</td></tr>
</table>

<h3 class="doc-paper__art">제2조 (임금계약기간)</h3>
<p class="doc-paper__cl">'을'의 임금계약기간은 ${start} ~ ${v.무기 ? '<strong>기간의 정함 없음</strong>' : end} 로 한다.</p>
<p class="doc-paper__note">※ 새로운 임금계약이 체결되기 전까지 자동 갱신된다.</p>

<h3 class="doc-paper__art">제3조 (급여)</h3>
${wageClauses(v)}

<h3 class="doc-paper__art">제4조 (기타)</h3>
<p class="doc-paper__cl">본 계약서에 명시되지 않은 사항은 근로계약서 및 회사의 임금 규정, 관계 법령에 따른다.</p>

<p class="doc-paper__signdate">작성일: ${esc(v.작성일) || todayStr()}</p>

[[SIGNATURES]]`;
  }
  const TEMPLATES = { '근로계약서': tplWork, '임금계약서': tplWage };

  function money(s) {
    const n = Number(String(s || '').replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(n) || !n) return '_______';
    return n.toLocaleString();
  }
  function sumMoney(...nums) {
    let total = 0;
    nums.forEach(n => {
      const v = Number(String(n || '').replace(/[^\d]/g, ''));
      if (Number.isFinite(v)) total += v;
    });
    return total ? total.toLocaleString() : '_______';
  }

  /** 본문 + 서명 블록 합성 렌더 — body 의 [[SIGNATURES]] 마커를 sig-block-row HTML 로 치환
   *  옵션:
   *    eulClickable: 을 서명 영역 클릭 가능 여부 (직원 서명 페이지 true)
   *    eulDisabled:  을 서명 영역 비활성 여부 (스크롤 미완료 등)
   *  반환: { text: '본문 텍스트 (서명블록 자리 제거)', sigHtml: 'sig-block-row HTML' }
   *  또는 단일 HTML 로 합성하려면 renderContractHTML(row, opts) 사용 */
  function renderSignatureBlocks(row, opts) {
    opts = opts || {};
    const sealOn   = !!row.gapSignedAt;
    const eulOn    = !!row.eulSignedAt;
    const eulClk   = !!opts.eulClickable && !eulOn;
    const eulDis   = !!opts.eulDisabled;

    const gapBlock = `
      <div class="sig-block ${sealOn ? 'sig-block--signed' : ''}">
        <div class="sig-block__role">갑 — 사용자 (회사)</div>
        <div class="sig-block__info">
          <strong>${esc(COMPANY)}</strong>
          <small>대표이사: ${esc(COMPANY_REPR)}</small>
          <small>${esc(COMPANY_ADDR)}</small>
        </div>
        <div class="sig-block__sigarea">
          ${sealOn ? `
            <div class="sig-block__seal">${esc(COMPANY_SEAL.text).replace('\n', '<br>')}</div>
            <span class="sig-block__stamp-time">${esc(row.gapSignedAt)}</span>
          ` : `
            <span style="color:var(--color-text-muted);">회사 인감 미배치</span>
          `}
        </div>
      </div>`;

    const eulBlock = `
      <div class="sig-block ${eulOn ? 'sig-block--signed' : ''}" ${eulDis ? 'data-disabled="1"' : ''} ${eulClk ? 'data-eul-sign-target="1"' : ''} ${eulClk && !eulDis ? 'role="button" tabindex="0"' : ''}>
        <div class="sig-block__role">을 — 근로자</div>
        <div class="sig-block__info">
          <strong>${esc(row.empName)}</strong>
          <small>사번 ${esc(row.empId)} · ${esc(row.empDept)}</small>
        </div>
        <div class="sig-block__sigarea">
          ${eulOn ? `
            <div class="sig-block__sig">${esc(row.eulSignName || row.empName)}</div>
            <span class="sig-block__stamp-time">${esc(row.eulSignedAt)}</span>
          ` : eulDis ? `
            <span>스크롤 완료 후 서명 가능</span>
          ` : eulClk ? `
            <span>✍️ 여기를 클릭하여 서명</span>
          ` : `
            <span style="color:var(--color-text-muted);">근로자 서명 미완료</span>
          `}
        </div>
      </div>`;

    return `<div class="sig-block-row">${gapBlock}${eulBlock}</div>`;
  }

  /** body 의 [[SIGNATURES]] 마커를 서명 블록 HTML 로 치환
   *  body 는 신뢰된 HTML (템플릿 생성 시 사용자 데이터는 esc 처리됨)
   *  opts.omitSignatures: true 면 서명 블록 없이 본문만 반환
   *    — 직원 서명은 별도 캔버스(contract-sign.html)에서 받음. 편집기·작성 모달 미리보기에 사용 */
  function renderContractHTML(row, opts) {
    const body = row.body || '';
    if (opts && opts.omitSignatures) {
      return body.replace('[[SIGNATURES]]', '');
    }
    return body.replace('[[SIGNATURES]]', renderSignatureBlocks(row, opts));
  }

  /* ============ 헬퍼 ============ */
  function $(s, r=document) { return r.querySelector(s); }
  function $$(s, r=document) { return Array.from(r.querySelectorAll(s)); }
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function ymd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
  function todayStr() { return ymd(new Date('2026-05-12')); }
  function nowStamp() {
    const d = new Date('2026-05-12T09:00');
    return `${ymd(d)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  function daysBetween(fromYmd, toYmd) {
    return Math.round((new Date(toYmd) - new Date(fromYmd)) / 86400000);
  }
  /* ============ 날짜 표시 전용 헬퍼 (데이터 값은 ISO 유지, 화면 렌더 시점에만 변환) ============ */
  function dispYmd(s) {    /* 'YYYY-MM-DD' → 'YY/MM/DD' (그 외 문자열은 원본 유지) */
    s = String(s == null ? '' : s);
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(2, 4) + '/' + s.slice(5, 7) + '/' + s.slice(8, 10) : s;
  }
  function dispStamp(s) {  /* 'YYYY-MM-DD HH:MM' → 'YY/MM/DD   HH:MM' (일시 표준 공백 3칸) */
    s = String(s == null ? '' : s);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    return m ? `${m[1].slice(2)}/${m[2]}/${m[3]}   ${m[4]}:${m[5]}` : dispYmd(s);
  }

  /* ============ Mock 계약 데이터 ============ */
  function buildHistory(status, createdAt) {
    const base = createdAt || '2026-04-15';
    const plus = (days, hh, mm) => {
      const d = addDays(new Date(base), days);
      return `${ymd(d)} ${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
    };
    const h = [
      { at: plus(0, 10, 24), title: '계약서 작성', desc: 'HR 담당자 ' + HR_NAME, kind: '' },
    ];
    if (status === 'draft') return h;
    h.push({ at: plus(1, 9, 10), title: '서명 요청 발송', desc: '직원 이메일 발송', kind: '' });
    if (status === 'signing') return h;
    if (status === 'rejected') {
      h.push({ at: plus(2, 14, 2), title: '직원 서명 거부', desc: '사유: 근무지 변경 협의 필요', kind: 'danger' });
      return h;
    }
    h.push({ at: plus(2, 11, 5), title: '직원 전자 서명', desc: '서명자: 본인', kind: 'success' });
    /* 직원 전자 서명 완료가 최종 단계 — 대표이사 최종 승인 단계 없음. signed/active 모두 여기서 종료. */
    if (status === 'signed' || status === 'active') return h;
    if (status === 'expired') h.push({ at: '2026-02-12 00:00', title: '계약 만료', desc: '시스템 자동 전환', kind: '' });
    if (status === 'voided')  h.push({ at: '2026-05-01 16:30', title: '계약 무효 처리', desc: '사유: 계약 조건 오류 (HR ' + HR_NAME + ')', kind: 'danger' });
    return h;
  }
  function makeMock() {
    // 각 계약서는 독립된 법적 문서. "갱신" 이라는 개념은 시스템에 두지 않고,
    // 한 직원에 대해 시기별로 별도 계약서를 누적 보존. 동일 직원의 다른 계약은
    // 상세 화면에서 시간순으로 조회만 한다.
    /* ============ 계약 시드 — 공용 직원 마스터(App.HRMembers) 5명과 정합 ============
     *   EMPLOYEES = App.HRMembers.list().slice(0,12) → 실제 5명(정규직/정수습/정일용/김도급/하계약).
     *     emp:0 정규직(regular·무기)  emp:1 정수습(regular+수습·무기)
     *     emp:2 정일용(daily·기간제)   emp:3 김도급(도급 → contractOut 이라 아래 filter 제외)
     *     emp:4 하계약(contract·기간제)
     *   정책(정합성):
     *     · 최초 임직원 등록 시점(입사일)에 '근로계약서 1건 + 임금계약서 1건' 이 반드시 존재한다.
     *     · 임금계약서는 최초 근로계약서에 linkedLaborId 로 연결된다(연결 근로계약 컬럼 표기).
     *     · 계약 기간은 고용형태에 맞춘다 — 정규직/수습=무기, 일용/계약=기간제(직원 마스터와 동일). */
    const cases = [
      // 정규직 (emp:0) — 입사 2023-03-02. 최초 근로계약(무기) + 최초 임금계약(무기, 근로에 연결)
      // 무기 임금계약은 시작일을 다르게 갱신 가능 → 이후(2025-03-02) 임금 인상 계약을 동일 근로계약에 연결해 누적.
      { id:'CTR-2023-1001', kind:'근로계약서', emp:0, status:'active', start:'2023-03-02', end:'', indefinite:true, created:'2023-02-27' },
      { id:'CTR-2023-1002', kind:'임금계약서', emp:0, status:'active', start:'2023-03-02', end:'', indefinite:true, created:'2023-02-27', baseRaise:'5,420,000', linkedLaborId:'CTR-2023-1001' },
      { id:'CTR-2025-1009', kind:'임금계약서', emp:0, status:'active', start:'2025-03-02', end:'', indefinite:true, created:'2025-02-25', baseRaise:'5,700,000', linkedLaborId:'CTR-2023-1001' },

      // 정수습 (emp:1) — 입사 2026-05-04. 최초 근로계약(정규직·무기) + 최초 임금계약(무기, 근로에 연결)
      { id:'CTR-2026-1003', kind:'근로계약서', emp:1, status:'active', start:'2026-05-04', end:'', indefinite:true, created:'2026-04-30' },
      { id:'CTR-2026-1004', kind:'임금계약서', emp:1, status:'active', start:'2026-05-04', end:'', indefinite:true, created:'2026-04-30', baseRaise:'3,170,000', linkedLaborId:'CTR-2026-1003' },

      // 정일용 (emp:2) — 입사 2026-06-01. 최초 근로계약(일용직·기간제) + 최초 임금계약(시급제, 근로에 연결)
      { id:'CTR-2026-1005', kind:'근로계약서', emp:2, status:'active', start:'2026-06-01', end:'2026-12-31', created:'2026-05-29' },
      { id:'CTR-2026-1006', kind:'임금계약서', emp:2, status:'active', start:'2026-06-01', end:'2026-12-31', created:'2026-05-29', linkedLaborId:'CTR-2026-1005' },

      // 하계약 (emp:4) — 입사 2025-01-06. 최초 근로계약(계약직·기간제) + 최초 임금계약(근로에 연결)
      { id:'CTR-2025-1007', kind:'근로계약서', emp:4, status:'active', start:'2025-01-06', end:'2027-01-05', created:'2025-01-02' },
      { id:'CTR-2025-1008', kind:'임금계약서', emp:4, status:'active', start:'2025-01-06', end:'2027-01-05', created:'2025-01-02', baseRaise:'4,500,000', linkedLaborId:'CTR-2025-1007' },
    ];

    const hrUsers = ['정혜진', '윤민지', '정혜진', '정혜진', '윤민지'];
    /* 도급직(contractOut) 은 계약서 자체가 없음 — 해당 emp 인덱스의 mock 항목 제외 */
    const filtered = cases.filter(c => {
      const e = EMPLOYEES[c.emp];
      return e && !e.contractOut;
    });
    return filtered.map((c, idx) => {
      const emp = EMPLOYEES[c.emp];
      const v = {
        회사명: COMPANY, 직원명: emp.name, 사번: emp.id,
        부서: emp.dept, 직무: emp.job, 직위: emp.rank,
        직책:    emp.position || '',
        고용구분: empTypeDisplay(emp),
        소속형태: affiliationDisplay(emp),
        직군:    jobCatDisplay(emp),
        시작일: c.start, 종료일: c.end,
        무기: !!c.indefinite,
        근무지: '성수동', 근무시간: '09:00 ~ 18:00',
        기본급: c.baseRaise || '3,200,000', 직무수당: '300,000', 식대: '200,000',
        지급일: '매월 25일',
        작성일: c.created || c.start,
      };
      const body = (TEMPLATES[c.kind] || tplWork)(v);
      const h = buildHistory(c.status, c.created || c.start);
      const findH = (title) => (h.find(x => x.title === title) || {}).at || '';
      // 상태별 서명 시점 결정
      // draft         : 둘 다 없음
      // signing       : 갑(회사 직인) 완료, 을 미서명
      // signed/active : 갑·을 서명 완료 (직원 전자서명 완료 = 최종 단계, 대표 승인 없음)
      // rejected      : 갑 완료, 을 거부
      // expired/voided: 갑·을 완료 (이미 효력 발생했던 계약)
      /* 회사 인감(직인)은 서명 요청 발송과 동시에 자동 배치 — 발송 시점을 인감 시각으로 사용 */
      const gapSignedAt = ['signing','signed','active','rejected','expired','voided'].includes(c.status)
        ? findH('서명 요청 발송') : '';
      const eulSignedAt = ['signed','active','expired','voided'].includes(c.status)
        ? findH('직원 전자 서명') : '';
      /* 발송 담당자/일시 — 서명 요청 발송 단계에 도달한 경우만 (draft 는 빈 값).
       *   데모용으로 작성자와 다를 수 있게 hrUsers 의 다른 인덱스에서 배정 */
      const sentAt = ['signing','signed','active','rejected','expired','voided'].includes(c.status)
        ? findH('서명 요청 발송') : '';
      const sentBy = sentAt ? hrUsers[(idx + 1) % hrUsers.length] : '';
      /* 처리 방식 — 항상 개별 작성. (일괄 작성 기능 제거됨 — 상세에 노출되지 않아야 함) */
      const mode = 'individual';
      return {
        id: c.id, kind: c.kind, mode,
        empId: emp.id, empName: emp.name, empDept: emp.dept,
        startDate: c.start, endDate: c.end || '',
        indefinite: !!c.indefinite,
        status: c.status,
        body, history: h,
        createdAt: c.created || ((h[0] && h[0].at) ? h[0].at.slice(0, 10) : c.start),
        registeredBy: hrUsers[idx % hrUsers.length],   // 작성 담당자 (초안 임시저장 한 사람)
        sentBy, sentAt,                                // 발송 담당자 / 발송일시 (서명 요청 발송 단계 이후만)
        gapSignedAt, eulSignedAt,
        eulSignName: eulSignedAt ? emp.name : '',
        /* 임금계약서 → 최초 근로계약서 연결 (임금 계약 이력의 '연결 근로계약' 컬럼 표기용) */
        linkedLaborId: c.linkedLaborId || '',
        salary: { base: c.baseRaise || '3,200,000', allowance: '300,000', meal: '200,000', payday: '매월 25일' },
      };
    });
  }

  /* ============ STATE ============ */
  const STATE = {
    rows: [],
    filtered: [],
    page: 1, pageSize: 20,
    filter: null,
    selectedIds: new Set(),
    view: 'list',     // 'list' | 'editor' | 'detail'
    detailId: null,
  };
  /* 편집 화면 상태
   *   returnTo / returnEmpId — 외부 화면에서 진입한 경우, [목록] 버튼이 호출 화면으로 돌아가도록 보존.
   *     예: 'newcomer-detail' → 입사자 관리 detail 로 라우팅 (returnEmpId 사용) */
  const EDIT = {
    kind: '근로계약서', emp: null,
    mode: 'individual',  // 'individual' (개별 작성) | 'bulk' (일괄 작성)
    workDocType: 'permanent',  // 근로계약서 하위 종류: 'permanent'(정규직) | 'fixed'(기간제)
    startDate: '', endDate: '',
    indefinite: false,  // 기간의 정함이 없는 근로 계약 (정규직, 근로계약서만)
    /* 근로계약서 — 사용자 정의 11 필드 (인사정보카드의 근로 계약 정보와 동기화) */
    empType: '',            // regular|contract|daily|outsourced
    contractSubType: '',
    contractOut: false,
    jobCat: '',             // office|production|research
    job: '',
    site: '',
    workSchedule: 'fixed',  // fixed|shift
    workDays: '월 ~ 금',
    holidayDays: '토, 일',
    /* 소정 근로시간 — 부서 아래 노출되는 유일한 근로시간 항목(상세 정보 제거). 법정 기준 기본값, 수정 가능 */
    stdHoursDay: 8, stdHoursWeek: 40, stdHoursMonth: 209,
    shiftCode: '', shiftLabel: '', workHoursStr: '',
    workTimeStart: '', workTimeEnd: '',
    breakStart: '', breakEnd: '',
    breakStart2: '', breakEnd2: '',
    annualLeavePolicy: '근로기준법 및 취업규칙에 따름',
    /* 임금계약서 — 인사정보카드의 임금계약 정보 편집 모달과 동일한 항목 구조 */
    wageType: 'annual',              // annual|hourly (월급제 제거)
    contractAmount: '',              // 계약 금액 (연봉 / 시급제는 시급+주휴 절사)
    hourlyWage: '',                  // 시급제 기본 시급
    wageContractKind: 'fixedOT',     // fixedOT|inclusive (일반 제거)
    fixedOTHours: '',
    fixedOTRate: 1.5,
    baseSalary: '',                  // 월 기본급
    fixedOTAmount: '',               // 월 시간외수당 (fixedOT)
    inclusiveOTAmount: '',           // 월 고정연장근무수당 (inclusive)
    deductionPolicy: '근로기준법 및 취업규칙에 따름',
    payDay: 10,                      // read-only (시스템 관리자 설정)
    body: '', savedDraftId: null,
    returnTo: '', returnEmpId: '',
  };

  /* ============ 마스터 (info-mgmt 와 일치) ============ */
  const MASTER_EMP_TYPES = [
    ['regular', '정규직'], ['contract', '계약직'],
    ['daily', '일용직'],   ['outsourced', '도급직'],
  ];
  const MASTER_JOB_CATS = [['office','사무직'], ['production','생산직'], ['research','연구직']];
  const MASTER_JOBS  = ['인사','재무','총무','생산관리','품질관리','개발','디자인'];
  const MASTER_SITES = ['성수동','하남','인현동','충무로'];
  /* 임금계약 마스터 — info-mgmt 와 동일. 임금유형 2종(연봉제/시급제), 임금계약유형 2종(고정OT/포괄임금).
     · 정규직·계약직 → 연봉제만  · 일용직 → 시급제만 (renderKindFields 에서 empType 로 제약) */
  const MASTER_WAGE_TYPES = [['annual','연봉제'], ['hourly','시급제']];
  const MASTER_WAGE_KINDS = [['fixedOT','고정 OT'], ['inclusive','포괄임금']];
  const MASTER_WAGE_KIND_DESC = {
    fixedOT:   '매월 정해진 연장·야간·휴일근로 시간에 대한 수당을 정액으로 미리 지급하고, 약정 시간을 초과한 근로는 추가로 정산해요.',
    inclusive: '업무 특성상 실제 근로시간 산정이 어려운 경우, 기본급과 법정수당을 포함한 월 임금총액을 미리 정해 지급해요.',
  };
  const MASTER_WAGE_AMOUNT_PREFIX = { annual:'연봉', hourly:'시급' };

  function formatNumberWithCommas(n) {
    if (n === '' || n == null) return '';
    const num = Number(String(n).replace(/[^\d.-]/g, ''));
    return Number.isFinite(num) ? num.toLocaleString() : '';
  }
  function parseNumberStr(s) {
    if (s === '' || s == null) return '';
    const n = Number(String(s).replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : '';
  }
  const PICK = { keyword: '', selectedId: null };

  /* ============ D-day / 행 강조 ============ */
  function ddayBadge(row) {
    if (row.indefinite) return `<span class="pill pill--purple" title="기간의 정함이 없는 근로 계약">정규직</span>`;
    if (row.status !== 'active') return '';
    if (!row.endDate) return '';
    const d = daysBetween(todayStr(), row.endDate);
    if (d < 0)   return `<span class="pill pill--danger">만료</span>`;
    if (d === 0) return `<span class="pill pill--danger">D-Day</span>`;
    if (d <= 30) return `<span class="pill pill--warning">D-${d}</span>`;
    return `<span class="t-muted" style="font-size:var(--fs-sm);">D-${d}</span>`;
  }
  function statusPill(code) {
    const s = STATUS[code] || STATUS.draft;
    return `<span class="pill${s.pill ? ' pill--' + s.pill : ''}">${esc(s.label)}</span>`;
  }
  /* 화면 표기용 파생 상태 — 서명완료(유효) 계약이 종료일 30일 이내(아직 만료 전)면 '만료 임박'.
     무기계약 / 종료일 없음 / 이미 만료(d<0) / 그 외 상태는 본래 status 유지.
     (legacy 'signed' 는 'active' 로 정규화) */
  function effectiveStatusCode(row) {
    if (!row) return 'draft';
    const code = (row.status === 'signed') ? 'active' : row.status;
    if (code === 'active' && !row.indefinite && row.endDate) {
      const d = daysBetween(todayStr(), row.endDate);
      if (d >= 0 && d <= 30) return 'expiringSoon';
    }
    return code;
  }
  function rowAttentionClass(row) {
    if (row.indefinite) return '';
    if (row.status !== 'active') return '';
    if (!row.endDate) return '';
    const d = daysBetween(todayStr(), row.endDate);
    if (d <= 0)  return 'is-row-danger';
    if (d <= 30) return 'is-attention';
    return '';
  }
  function periodText(row) {
    if (row.indefinite) return `${dispYmd(row.startDate)} ~ (기간의 정함 없음)`;
    return `${dispYmd(row.startDate)} ~ ${dispYmd(row.endDate)}`;
  }
  /* 근로계약서 하위 종류별 대상 직원 매칭 (인사정보카드 근로 정보 + 계약 상태 기준)
   *   · 기간제(fixed)     — 계약직 / 일용직 / 정규직+수습기간 중, 이미 "만료"된 기간제는 제외
   *                          (만료된 기간제는 재발송 불필요 → 정규직 전환 대상으로 넘어감)
   *   · 정규직(permanent) — 정규직(수습 미체크) + 기간제가 "만료/만료임박"인 직원(정규직 전환 대상) */
  function matchesWorkDocType(empRow, docType) {
    if (!docType) return true;
    const et = empRow.empType;
    const prob = !!empRow.probation;
    const isFixedType = et === 'contract' || et === 'daily' || (et === 'regular' && prob);
    const isPermType  = et === 'regular' && !prob;
    /* 현재 근로계약 상태 코드 (unsigned/signing/signed/soon/expired) */
    let ctrCode = 'unsigned';
    if (window.App && App.HRInfoMgmt && App.HRInfoMgmt.contractCellState) {
      const st = App.HRInfoMgmt.contractCellState(empRow, 'labor') || {};
      ctrCode = (st.ctr || {}).code || 'unsigned';
    }
    if (docType === 'fixed')     return isFixedType && ctrCode !== 'expired';
    if (docType === 'permanent') {
      const existingFixed = !!empRow.contractEndDate || isFixedType;
      return isPermType || (existingFixed && (ctrCode === 'expired' || ctrCode === 'soon'));
    }
    return true;
  }

  /* 특정 직원의 해당 유형 계약 이력 — 최신 시작일 우선. 서명 대기(signing)는 이력에서 제외. */
  function empContractHistory(empId, kind) {
    return STATE.rows
      .filter(r => r.empId === empId && r.kind === kind && r.status !== 'signing')
      .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
  }

  /* ============ 필터 ============ */
  /** 선택된 조회 기준에 해당하는 행의 날짜 (YYYY-MM-DD) 를 반환 */
  function basisDateOf(r, basis) {
    if (basis === 'sentAt') {
      /* 새 필드 r.sentAt 우선, 없으면 history 에서 fallback */
      if (r.sentAt) return r.sentAt.slice(0, 10);
      const ev = (r.history || []).find(h => h.title === '서명 요청 발송');
      return ev && ev.at ? ev.at.slice(0, 10) : '';
    }
    if (basis === 'startDate')   return r.startDate || '';
    if (basis === 'endDate')     return r.endDate   || '';
    // 'createdAt' (기본)
    return r.createdAt || '';
  }

  function applyFilter() {
    const p = STATE.filter || {};
    const from = p.from || '', to = p.to || '';
    /* 조회 기준 컬럼 — 검색 패널 dateColumns 의 선택값(dateKey: createdAt/startDate/endDate).
       (구 p.basis 호환 유지) 미선택 시 작성일 기준. */
    const basis = p.dateKey || p.basis || 'createdAt';
    const cond = p.condition || 'empName';
    const kw   = (p.keyword || '').trim().toLowerCase();
    const kindSel    = (p.advanced && p.advanced.kind) || '';
    const flagList   = (p.checks && p.checks.flags) || [];
    /* 상태 다중 선택 — 'signing' = 서명 대기, 'active' = 서명 완료.
       legacy 'signed' 도 '서명 완료' 와 동일 취급. */
    const statusSel  = (p.checks && p.checks.status) || [];
    const activeOnly = flagList.includes('activeOnly');
    const indefOnly  = flagList.includes('indefinite');
    // 계약번호 검색은 특정 문서 조회 — 기간 제한을 적용하지 않는다
    const idLookup = (cond === 'id' && kw);

    STATE.filtered = STATE.rows.filter(r => {
      /* 초안(draft) 은 목록에서 노출하지 않음 — 발송된 계약만 표시. */
      if (r.status === 'draft') return false;
      if (kindSel && r.kind !== kindSel) return false;
      /* 상태 다중 필터 — 선택된 항목이 1개 이상일 때만 적용. 'active' 선택 시 legacy 'signed' 도 매칭. */
      if (statusSel.length) {
        /* 화면 표기와 동일한 파생 상태로 필터 (서명완료 ↔ 만료 임박 구분) */
        const effective = effectiveStatusCode(r);
        if (!statusSel.includes(effective)) return false;
      }
      if (activeOnly && r.status !== 'active') return false;
      if (indefOnly && !r.indefinite) return false;
      if (!idLookup) {
        const d = basisDateOf(r, basis);
        // 선택된 조회 기준의 날짜가 비어 있는 행(예: 발송일 기준인데 아직 미발송)
        // 은 기간을 지정한 조회에서 제외한다.
        if ((from || to) && !d) return false;
        if (from && d < from) return false;
        if (to   && d > to)   return false;
      }
      if (kw) {
        const t = cond === 'empId' ? r.empId
                : cond === 'id'    ? r.id
                : r.empName;
        if (!String(t).toLowerCase().includes(kw)) return false;
      }
      return true;
    });
    if (STATE.page > Math.ceil(STATE.filtered.length / STATE.pageSize)) STATE.page = 1;
  }

  /* =========================================================
   *  VIEW: LIST (SCR-CTR-01)
   * ========================================================= */
  function renderListView(pageEl) {
    STATE.view = 'list';
    const C = App.Components;
    const searchHTML = C.searchPanel({
      showDateRange: true,
      /* searchPanel 표준 prop — dateColumns: [{ key, label }]. 첫 항목이 default. */
      dateColumns: [
        { key: 'createdAt',  label: '작성일' },
        { key: 'startDate',  label: '계약 시작일' },
        { key: 'endDate',    label: '계약 종료일' },
      ],
      quick: ['today','week','m1','m6','y1'],
      conditions: [
        { value: 'empName', label: '성명' },
        { value: 'empId',   label: '사번' },
        { value: 'id',      label: '계약번호' },
      ],
      placeholder: '성명 / 사번 / 계약번호로 검색',
      cols: 2,
      advanced: [
        { name: 'kind', label: '계약 유형', options: KINDS },
      ],
      checkGroups: [
        /* 상태 — 다중 선택 (서명 대기 + 서명 완료) */
        { key: 'status', label: '상태', wide: true, items: [
          { value: 'signing',      label: '서명 대기' },
          { value: 'active',       label: '서명 완료' },
          { value: 'expiringSoon', label: '만료 임박' },
          { value: 'expired',      label: '만료' },
          { value: 'rejected',     label: '반려' },
          { value: 'voided',       label: '무효' },
        ]},
        { key: 'flags', label: '추가 조건', wide: false, items: [
          { value: 'activeOnly', label: '현재 유효 계약만 보기' },
          { value: 'indefinite', label: '기간의 정함 없음' },
        ]},
      ],
    });

    pageEl.innerHTML = `
      ${searchHTML}

      <div class="toolbar">
        <div class="toolbar__left">
          <span class="toolbar__count">총 <span data-count><strong>0</strong>건</span></span>
          <span style="color:var(--color-text-muted);font-size:var(--fs-sm);" data-sel-count></span>
        </div>
        <div class="toolbar__right">
          <button class="btn btn--sm btn--primary" type="button" data-ctr-create-individual>${window.Icons && window.Icons.plus || ''} 계약서 작성</button>
        </div>
      </div>

      <div class="grid-wrap" style="flex:1;min-height:0;">
        <div class="grid-scroll">
          <table class="tbl tbl--hover">
            <thead>
              <tr>
                <th style="width:40px;text-align:center;"><input type="checkbox" data-ctr-check-all aria-label="전체 선택" /></th>
                <th style="width:150px;">계약번호</th>
                <th style="width:110px;">유형</th>
                <th>대상자</th>
                <th style="width:210px;">계약 기간</th>
                <th style="width:120px;text-align:center;">상태</th>
                <th style="width:100px;">작성 담당자</th>
                <th style="width:110px;">작성일</th>
              </tr>
            </thead>
            <tbody id="ctr-list-body"></tbody>
          </table>
        </div>
        <div class="pagination">
          <div class="pagination__info" id="ctr-page-info"></div>
          <div class="pagination__right">
            <div class="pagination__size">
              <label>페이지당</label>
              <select class="select" id="ctr-page-size">
                <option value="20">20</option>
                <option value="40">40</option>
                <option value="60">60</option>
                <option value="80">80</option>
                <option value="100">100</option>
              </select>
              <span>건</span>
            </div>
            <div class="pagination__list" id="ctr-pagination"></div>
          </div>
        </div>
      </div>
    `;
    bindList(pageEl);
  }

  function bindList(pageEl) {
    /* 페이지 단위 delegation — 페이지 재진입(매 __onShow) 시 renderListView 가 다시 호출되면서
       pageEl.addEventListener 가 중복 누적되는 문제를 막기 위해 한 번만 바인딩. */
    const _alreadyBound = pageEl.dataset.ctrListBound === '1';
    App.Search.attach(pageEl.querySelector('[data-search]'), (params) => {
      const kw = (params.keyword || '').trim();
      // 계약번호 단건 조회 — 기간 제한을 적용하지 않거나 완화
      const idLookup = params.condition === 'id' && kw;

      if (!idLookup) {
        // 조회 기간 최대 3년 제한
        if (params.from && params.to) {
          const days = (new Date(params.to) - new Date(params.from)) / 86400000;
          if (days > 365 * 3) {
            window.toast && window.toast(
              `조회 기간은 최대 3년까지만 설정할 수 있습니다. (현재 약 ${(days/365).toFixed(1)}년)`,
              'danger', 4500
            );
            return;
          }
        }
        // 10년 초과 과거 계약서 조회 시 직원명/사번/계약번호 중 하나 이상 필수
        const tenYearsAgo = ymd(addDays(new Date(todayStr()), -365 * 10));
        if (params.from && params.from < tenYearsAgo && !kw) {
          window.toast && window.toast(
            '10년 초과 과거 계약서를 조회하려면 직원명/사번/계약번호 중 하나 이상 입력해 주세요.',
            'danger', 4500
          );
          return;
        }
      }

      STATE.filter = params;
      STATE.page = 1;
      applyFilter();
      renderTable();
    }, { defaultQuick: 'y1' });   /* 계약 기간 기본 = 최근 1년 */

    // 액션 버튼 — 1회만 바인딩 (pageEl 자체는 재생성되지 않으므로 누적 방지)
    if (!_alreadyBound) {
      pageEl.addEventListener('click', (e) => {
        /* 계약서 작성 — 바로 개별 작성(편집기)으로 진입 (일괄 작성 제거됨) */
        if (e.target.closest('[data-ctr-create-individual]')) {
          openEditor(null);
          return;
        }
        if (e.target.closest('[data-ctr-bulk-send]'))   { doBulkSendForSign(); return; }
        if (e.target.closest('[data-ctr-bulk-delete]')) { doBulkDelete(); return; }
      });
    }

    // 전체 선택
    $('[data-ctr-check-all]', pageEl).addEventListener('change', (e) => {
      const checked = e.target.checked;
      const pageRows = STATE.filtered.slice((STATE.page-1)*STATE.pageSize, STATE.page*STATE.pageSize);
      pageRows.forEach(r => {
        if (checked) STATE.selectedIds.add(r.id);
        else         STATE.selectedIds.delete(r.id);
      });
      renderTable();
    });

    // 체크박스 토글
    $('#ctr-list-body', pageEl).addEventListener('change', (e) => {
      const cb = e.target.closest('input[type="checkbox"]');
      if (!cb) return;
      const tr = cb.closest('[data-ctr-row]'); if (!tr) return;
      const id = tr.dataset.ctrRow;
      if (cb.checked) STATE.selectedIds.add(id);
      else            STATE.selectedIds.delete(id);
      tr.classList.toggle('is-selected', cb.checked);
      updateBulkButtons();
      updateCheckAll();
    });
    // 직원명 클릭 → 임직원 관리(info-mgmt) 인사카드 / 계약번호 클릭 → 상세 진입
    $('#ctr-list-body', pageEl).addEventListener('click', (e) => {
      /* 성명 클릭 — 임직원 관리(info-mgmt) 의 인사카드 Drawer 로 통일 */
      const empLink = e.target.closest('[data-ctr-emp-card]');
      if (empLink) {
        e.preventDefault();
        const tr = empLink.closest('[data-ctr-row]'); if (!tr) return;
        const row = STATE.rows.find(rr => rr.id === tr.dataset.ctrRow);
        if (!row) return;
        /* App.HRInfoMgmt.list() 에서 직원 마스터 조회 후 App.HRInfoMgmtCard.open() 로 위임 */
        const list = (window.App && App.HRInfoMgmt && App.HRInfoMgmt.list) ? App.HRInfoMgmt.list() : [];
        const src = list.find(r => r.id === row.empId);
        const member = EMPLOYEES.find(em => em.id === row.empId) || null;
        const empObj = src || Object.assign({
          id: row.empId, name: row.empName, dept: row.empDept,
          empType: 'regular', jobCat: 'office', site: '성수동', infoStatus: 'done',
        }, member || {});
        if (window.App && App.HRInfoMgmtCard && App.HRInfoMgmtCard.open) {
          App.HRInfoMgmtCard.open(empObj);
        } else if (window.App && App.HRInfoCard && App.HRInfoCard.open) {
          /* fallback — info-mgmt 미로드 환경 */
          App.HRInfoCard.open(empObj);
        }
        return;
      }
      /* 계약번호 클릭 — 상세 진입 */
      const link = e.target.closest('[data-ctr-row-open]');
      if (!link) return;
      e.preventDefault();
      const tr = link.closest('[data-ctr-row]'); if (!tr) return;
      openDetailView(tr.dataset.ctrRow);
    });

    // 페이지네이션
    $('#ctr-pagination', pageEl).addEventListener('click', (e) => {
      const btn = e.target.closest('.pagination__btn');
      if (!btn || btn.disabled) return;
      const p = Number(btn.dataset.page);
      if (Number.isFinite(p)) { STATE.page = p; renderTable(); }
    });
    $('#ctr-page-size', pageEl).addEventListener('change', (e) => {
      STATE.pageSize = Number(e.target.value);
      STATE.page = 1;
      renderTable();
    });
    pageEl.dataset.ctrListBound = '1';
  }

  function renderTable() {
    const total = STATE.filtered.length;
    const start = (STATE.page - 1) * STATE.pageSize;
    const rows = STATE.filtered.slice(start, start + STATE.pageSize);

    const body = $('#ctr-list-body'); if (!body) return;
    body.innerHTML = !rows.length
      ? `<tr><td colspan="9" style="text-align:center;color:var(--color-text-muted);padding:32px 0;">조건에 해당하는 계약서가 없습니다.</td></tr>`
      : rows.map(r => {
          const cls = rowAttentionClass(r);
          const sel = STATE.selectedIds.has(r.id);
          /* 성명 셀 — 인감 사용 화면 패턴 (24x24 사진 + 이름 + 직책 나란히). photo 는 EMPLOYEES master 조회 */
          const member = EMPLOYEES.find(em => em.id === r.empId) || null;
          const photo = (member && member.photoUrl) || '';
          const avatarHTML = photo
            ? `<img src="${esc(photo)}" alt="" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;" />`
            : `<span style="width:24px;height:24px;border-radius:50%;background:var(--color-active);color:var(--color-brand-primary);display:inline-flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;">${esc((r.empName || '?').charAt(0))}</span>`;
          const empPos  = (member && member.position) || '';
          const empRank = (member && member.rank) || '';
          /* 대상자 부제 — 팀·직위·직책 (값 있는 항목만, muted, 구두점 사이 여백 없이) */
          const empMeta = [r.empDept, empRank, empPos].filter(Boolean)
            .map(v => `<span style="color:var(--color-text-muted);font-size:var(--fs-xs);white-space:nowrap;">${esc(v)}</span>`)
            .join(`<span style="color:var(--color-text-muted);font-size:var(--fs-xs);">·</span>`);
          return `
            <tr data-ctr-row="${esc(r.id)}" class="${cls} ${sel ? 'is-selected' : ''}">
              <td style="text-align:center;"><input type="checkbox" ${sel ? 'checked' : ''} /></td>
              <td><a href="#" data-ctr-row-open class="link-code">${esc(r.id)}</a></td>
              <td>${esc(r.kind)}</td>
              <td>
                <div style="display:flex;align-items:center;gap:6px;min-width:0;">
                  ${avatarHTML}
                  <a href="#" data-ctr-emp-card style="color:var(--color-brand-primary);font-weight:var(--fw-medium);">${esc(r.empName)}</a>
                  <span style="display:inline-flex;align-items:center;min-width:0;">${empMeta}</span>
                </div>
              </td>
              <td>${esc(periodText(r))}</td>
              <td style="text-align:center;">${statusPill(effectiveStatusCode(r))}</td>
              <td>${esc(r.registeredBy || '-')}</td>
              <td>${esc(r.createdAt ? dispYmd(r.createdAt) : '-')}</td>
            </tr>`;
        }).join('');

    /* 계약 페이지 스코프 — 다른 페이지(발령/입사자 관리 등)의 동일 selector 와 충돌 방지 */
    const pageEl = document.getElementById('page-hr-contract');
    const cnt = pageEl && pageEl.querySelector('[data-count]');
    if (cnt) cnt.innerHTML = `<strong>${total.toLocaleString()}</strong>건`;

    // 페이지네이션
    const size = STATE.pageSize;
    const totalPages = Math.max(1, Math.ceil(total / size));
    if (STATE.page > totalPages) STATE.page = totalPages;
    $('#ctr-page-info').textContent = total === 0
      ? '0건'
      : `${start + 1}-${Math.min(start + size, total)} / ${total}건`;

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
    $('#ctr-pagination').innerHTML = btns.join('');

    const sel = $('#ctr-page-size'); if (sel) sel.value = String(STATE.pageSize);

    updateBulkButtons();
    updateCheckAll();
  }

  function updateBulkButtons() {
    const selected = STATE.rows.filter(r => STATE.selectedIds.has(r.id));
    const has = selected.length > 0;
    const allDraft = has && selected.every(r => r.status === 'draft');

    const pageEl = document.getElementById('page-hr-contract');
    const btnSend = pageEl && pageEl.querySelector('[data-ctr-bulk-send]');
    const btnDel  = pageEl && pageEl.querySelector('[data-ctr-bulk-delete]');
    if (btnSend) btnSend.disabled = !allDraft;
    if (btnDel)  btnDel.disabled  = !allDraft;

    const cnt = pageEl && pageEl.querySelector('[data-sel-count]');
    if (cnt) cnt.textContent = has ? ` · 선택 ${selected.length}건` : '';
  }
  function updateCheckAll() {
    const pageEl = document.getElementById('page-hr-contract');
    const all = pageEl && pageEl.querySelector('[data-ctr-check-all]'); if (!all) return;
    const pageRows = STATE.filtered.slice((STATE.page-1)*STATE.pageSize, STATE.page*STATE.pageSize);
    if (!pageRows.length) { all.checked = false; all.indeterminate = false; return; }
    const selectedCount = pageRows.filter(r => STATE.selectedIds.has(r.id)).length;
    all.checked = selectedCount === pageRows.length;
    all.indeterminate = selectedCount > 0 && selectedCount < pageRows.length;
  }

  /* ============ 일괄 액션 ============ */
  function doBulkSendForSign() {
    const selected = STATE.rows.filter(r => STATE.selectedIds.has(r.id));
    if (!selected.length) return;
    if (selected.some(r => r.status !== 'draft')) {
      window.toast && window.toast('초안 상태인 계약서만 발송할 수 있습니다.', 'danger'); return;
    }
    // 직원별 그룹화 (이메일 한 통에 여러 계약서를 묶어 발송)
    const byEmp = {};
    selected.forEach(r => {
      const k = r.empId;
      byEmp[k] = byEmp[k] || { name: r.empName, dept: r.empDept, kinds: [], rows: [] };
      byEmp[k].kinds.push(r.kind);
      byEmp[k].rows.push(r);
    });
    const empCount = Object.keys(byEmp).length;
    const empSummary = Object.values(byEmp).map(g =>
      `· ${g.name} (${g.dept}) — ${g.kinds.join(' + ')}`
    ).join('\n');

    window.sweet && window.sweet({
      icon: 'confirm',
      title: '서명 요청 일괄 발송',
      text: `선택한 ${selected.length}건을 직원 ${empCount}명에게 이메일로 발송합니다.\n` +
            `한 직원의 여러 계약서는 한 통의 이메일에 묶여 발송됩니다.\n\n` +
            `${empSummary}\n\n발송 후에는 계약 내용을 수정할 수 없습니다.`,
      cancelText: '취소', confirmText: `${empCount}명에게 발송`,
      onConfirm: () => {
        selected.forEach(r => {
          r.status = 'signing';
          r.gapSignedAt = nowStamp();  // 발송과 동시에 회사 인감 배치
          r.sentBy = HR_NAME;
          r.sentAt = nowStamp();
          r.history.push({ at: nowStamp(), title: '서명 요청 발송', desc: '이메일 일괄 발송 (HR ' + HR_NAME + ')', kind: '' });
          /* 인사정보카드(App.HRInfoMgmt) 동기화 — 발송일/기간/임금 반영 */
          syncToInfoMgmt(r.empId, {
            kind: r.kind, startDate: r.startDate, endDate: r.endDate,
            근무지: '', 근무시간: '',
            기본급: (r.salary && r.salary.base) || '',
            직무수당: (r.salary && r.salary.allowance) || '',
            식대:    (r.salary && r.salary.meal) || '',
            지급일:  (r.salary && r.salary.payday) || '',
          }, !!r.indefinite);
        });
        STATE.selectedIds.clear();
        applyFilter();
        renderTable();
        window.toast && window.toast(
          `${empCount}명에게 ${selected.length}건의 서명 요청 이메일 발송 완료`,
          'success', 4500
        );
      },
    });
  }
  function doBulkDelete() {
    const selected = STATE.rows.filter(r => STATE.selectedIds.has(r.id));
    if (!selected.length) return;
    if (selected.some(r => r.status !== 'draft')) {
      window.toast && window.toast('초안 상태인 계약서만 삭제할 수 있습니다.', 'danger'); return;
    }
    window.sweet && window.sweet({
      icon: 'confirm', title: '계약서 삭제',
      text: `선택한 ${selected.length}건의 초안 계약서를 삭제하시겠습니까? (복구 불가, 이력 보존)`,
      cancelText: '취소', confirmText: '삭제',
      onConfirm: () => {
        const ids = new Set(selected.map(r => r.id));
        STATE.rows = STATE.rows.filter(r => !ids.has(r.id));
        STATE.selectedIds.clear();
        applyFilter();
        renderTable();
        window.toast && window.toast(`${selected.length}건 삭제 완료`, 'success');
      },
    });
  }

  /* =========================================================
   *  VIEW: EDITOR (SCR-CTR-02) — 풀스크린 편집
   * ========================================================= */
  function openEditor(seedRow) {
    EDIT.kind      = seedRow ? seedRow.kind  : '근로계약서';
    /* 모드 — seedRow.mode 가 'bulk' 면 그대로, 아니면 개별. 신규 작성(seedRow=null) 은 항상 개별 */
    EDIT.mode      = (seedRow && seedRow.mode) || 'individual';
    EDIT.lockedKind = false;  /* 일반 진입은 계약 유형 자유 선택 가능 */
    /* 계약 관리 자체 진입 — 인사정보카드 오버레이(docOnly) 가 아닌 페이지 detail 로 렌더되도록 returnTo 초기화 */
    EDIT.returnTo  = null;
    EDIT.returnEmpId = null;
    EDIT.emp       = seedRow ? EMPLOYEES.find(e => e.id === seedRow.empId) || null : null;
    EDIT.previewHistId = null;
    EDIT.workDocType = 'permanent';
    EDIT.startDate = seedRow ? seedRow.startDate : '';
    EDIT.endDate   = seedRow ? seedRow.endDate   : '';
    EDIT.indefinite = seedRow ? !!seedRow.indefinite : false;
    /* 근무지 — 직원 마스터의 site 가 있으면 자동 prefill, 없으면 기본 성수동 */
    EDIT.근무지     = (EDIT.emp && EDIT.emp.site) || '성수동';
    EDIT.근무시간   = '09:00 ~ 18:00';
    EDIT.기본급     = '3,200,000';
    EDIT.직무수당   = '300,000';
    EDIT.식대       = '200,000';
    EDIT.지급일     = '매월 25일';
    EDIT.savedDraftId = seedRow ? seedRow.id : null;
    EDIT.body = TEMPLATES[EDIT.kind](currentFieldValues());

    STATE.view = 'editor';
    /* 개별 작성 — 콘텐츠 영역에 페이지 detail 로 렌더 (모달 아님) */
    renderEditorView();
  }
  function openCtrModal() {
    const m = document.getElementById('modal-ctr-view');
    if (!m) return;
    m.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    /* 닫기(✕)·오버레이(backdrop) — 작성 중 내용 확인 후 닫기(취소 버튼과 동일).
       전역 data-modal-close 핸들러가 없어 직접 바인딩. 헤더 ✕는 정적 요소라 1회만. */
    if (!m.dataset.closeBound) {
      m.dataset.closeBound = '1';
      m.querySelectorAll('[data-modal-close]').forEach(b => b.addEventListener('click', confirmLeaveEditor));
      m.addEventListener('click', (e) => { if (e.target === m) confirmLeaveEditor(); });
    }
  }
  function closeCtrModal() {
    const m = document.getElementById('modal-ctr-view');
    if (m) m.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  function currentFieldValues() {
    const e = EDIT.emp;
    /* 근로계약서 — EDIT 의 사용자 커스텀 값 우선, 비어있으면 emp 마스터로 fallback */
    const empType = EDIT.empType || (e ? e.empType : '');
    const empTypeStr = empType
      ? (EMP_TYPE_LABEL[empType] || empType) +
        (empType === 'contract' && EDIT.contractSubType && CONTRACT_SUB_LABEL[EDIT.contractSubType]
          ? ` (${CONTRACT_SUB_LABEL[EDIT.contractSubType]})`
          : '')
      : empTypeDisplay(e);
    const jobCatStr = EDIT.jobCat ? (JOB_CAT_LABEL[EDIT.jobCat] || EDIT.jobCat) : jobCatDisplay(e);
    /* 휴게시간 표시 — 휴게1 + (있을 시) 휴게2 */
    const b1 = (EDIT.breakStart && EDIT.breakEnd) ? `${EDIT.breakStart} ~ ${EDIT.breakEnd}` : '';
    const b2 = (EDIT.breakStart2 && EDIT.breakEnd2) ? `, ${EDIT.breakStart2} ~ ${EDIT.breakEnd2}` : '';
    const breakDisplay = b1 ? b1 + b2 : '';
    const workTimeDisplay = (EDIT.workTimeStart && EDIT.workTimeEnd)
      ? `${EDIT.workTimeStart} ~ ${EDIT.workTimeEnd}` : '';
    /* 근로계약서 종류 (3 포맷) + 기간 분기
     *   · 정규직 + 수습 X → 정규직 근로계약서 (기간의 정함 없음)
     *   · 정규직 + 수습 O → 기간제 근로계약서 (수습 시작일~종료일)
     *   · 계약직/일용직   → 근로계약서 (계약 시작~종료) */
    const ftIsReg  = empType === 'regular';
    const ftIsProb = EDIT.kind === '근로계약서' && ftIsReg && !!EDIT.probation;
    const ftDocTitle = (ftIsReg && !EDIT.probation) ? '정규직 근로계약서' : '기간제 근로계약서';
    const ftStart = ftIsProb ? (EDIT.probationStart || EDIT.startDate) : EDIT.startDate;
    const ftEnd   = ftIsProb ? (EDIT.probationEnd || EDIT.endDate) : EDIT.endDate;
    const ftIndef = EDIT.kind === '근로계약서' && ftIsReg && !EDIT.probation;   /* 정규직 무수습만 무기 */
    return {
      회사명: COMPANY, 직원명: e ? e.name : '', 사번: e ? e.id : '',
      부서: e ? e.dept : '', 직무: EDIT.job || (e ? e.job : ''), 직위: e ? e.rank : '',
      직책:    e ? (e.position || '') : '',
      고용구분: empTypeStr,
      소속형태: EDIT.contractOut || (e && e.contractOut) ? '도급' : '-',
      직군:    jobCatStr,
      시작일: ftStart, 종료일: ftEnd,
      /* 무기(기간의 정함 없음) — 근로계약서는 정규직 무수습만, 임금계약서는 EDIT.indefinite(wageIndefinite) 반영 */
      무기: EDIT.kind === '근로계약서' ? ftIndef : !!EDIT.indefinite,
      근로계약서종류: EDIT.kind === '근로계약서' ? ftDocTitle : '',
      근무지: EDIT.site || (e ? e.site : '') || '성수동',
      근무형태: EDIT.workSchedule === 'shift' ? '교대' : '고정',
      근무일: '월 ~ 금',
      휴일:   '토, 일',
      근무시간: workTimeDisplay,
      휴게시간: breakDisplay,
      소정근로시간: `1일 ${EDIT.stdHoursDay || 8}시간 · 1주 ${EDIT.stdHoursWeek || 40}시간 · 월 ${EDIT.stdHoursMonth || 209}시간`,
      연차유급휴가: EDIT.annualLeavePolicy || '근로기준법 및 취업규칙에 따름',
      shiftCode: EDIT.shiftCode || '',
      /* 임금계약서 — info-mgmt 임금계약 정보와 동일 항목 */
      임금유형: MASTER_WAGE_AMOUNT_PREFIX[EDIT.wageType] || '연봉',
      wageTypeKey: EDIT.wageType || 'annual',
      계약금액: EDIT.contractAmount,
      시급: EDIT.hourlyWage,
      주휴수당: (function(){ const b = Number(String(EDIT.hourlyWage||'').replace(/[^0-9]/g,''))||0; return b ? String(Math.floor(b*0.2)) : ''; })(),
      임금계약유형: ({ fixedOT:'고정 OT', inclusive:'포괄임금' })[EDIT.wageContractKind] || '고정 OT',
      wageContractKindKey: EDIT.wageContractKind || 'fixedOT',
      fixedOTHours: EDIT.fixedOTHours,
      fixedOTRate: EDIT.fixedOTRate,
      월기본급: EDIT.baseSalary,
      월시간외수당: EDIT.fixedOTAmount,
      월고정연장근무수당: EDIT.inclusiveOTAmount,
      공제안내: EDIT.deductionPolicy || '근로기준법 및 취업규칙에 따름',
      지급일: `매월 ${EDIT.payDay || 10}일`,
      작성일: todayStr(),
    };
  }

  function renderEditorView() {
    /* docOnly(인사정보카드 서명 요청)는 modal-ctr-view 오버레이, 개별 작성은 페이지(콘텐츠 영역) detail 로 렌더. */
    const modalEl = document.getElementById('modal-ctr-view');
    const isWork = EDIT.kind === '근로계약서';

    /* 모달 헤더 — 타이틀 갱신 */
    const titleEl = modalEl.querySelector('#ctr-view-title');
    if (titleEl) {
      titleEl.innerHTML = `계약서 작성`;
    }

    /* 모달 푸터 — 액션 버튼들 (초안 개념 제거 — 임시저장 버튼 없음) */
    const footEl = modalEl.querySelector('#ctr-view-footer');
    if (footEl) {
      footEl.innerHTML = `
        <button class="btn" type="button" data-ctr-edit-back>취소</button>
        <span style="flex:1;"></span>
        <span data-ctr-edit-hint style="align-self:center;margin-right:8px;color:var(--color-danger);font-size:12px;"></span>
        <button class="btn" type="button" data-ctr-edit-preview>PDF 미리보기</button>
        <button class="btn btn--primary" type="button" data-ctr-edit-send>서명 요청 발송</button>
      `;
      footEl.style.display = 'flex';
    }

    /* 본문 */
    const pageEl = modalEl.querySelector('#ctr-view-body');
    if (!pageEl) return;

    /* 인사정보카드 [서명 요청] 진입 — 모든 값이 인사정보카드에서 이미 채워져 있으므로
       좌측 입력 폼/대상 직원 정보를 숨기고 계약서 문서만 전체폭으로 띄워 발송한다.
       (요구사항: "계약서만 띄워서 발송, 왼쪽 정보·대상 직원 안 보여도 됨") */
    const docOnly = EDIT.returnTo === 'empi-card';
    if (docOnly) {
      if (titleEl) {
        titleEl.innerHTML = `${esc(EDIT.kind)} 서명 요청`;
      }
      pageEl.innerHTML = `
        <div class="doc-editor" style="height:100%;display:flex;flex-direction:column;min-height:0;">
          ${EDIT.kind === '근로계약서' ? (() => {
            const wReg  = (EDIT.empType || (EDIT.emp && EDIT.emp.empType)) === 'regular';
            const wProb = wReg && !!EDIT.probation;
            const dName = (wReg && !wProb) ? '정규직 근로계약서' : '기간제 근로계약서';
            const dCls  = (wReg && !wProb) ? 'pill--success' : 'pill--info';
            return `
            <div class="form-field" style="margin:0 0 12px;display:flex;align-items:center;gap:10px;flex:0 0 auto;flex-wrap:wrap;">
              <label class="form-label" style="margin:0;white-space:nowrap;">근로계약서 종류</label>
              <span class="pill ${dCls}">${dName}</span>
            </div>`;
          })() : ''}
          <div class="doc-editor__paper is-readonly" id="ctr-edit-preview" style="font-family:inherit;flex:1;min-height:0;overflow:auto;">${renderContractHTML(previewRow(), { omitSignatures: true })}</div>
        </div>
      `;
      /* 폼 입력 필드가 없으므로 bind 함수들은 모두 null-guard 로 안전하게 통과.
         footer 버튼(취소/미리보기/서명요청 발송) 바인딩 + 유효성 검사는 그대로 동작. */
      bindEditor(modalEl);
      validateEditor();
      return;
    }

    /* 좌/우 split 레이아웃 —
       좌: 계약 유형 · 근로계약서 종류 · 대상 직원 · 계약 이력 · 근로계약 정보(편집 포함)
       우: 계약서(미리보기). 계약 정보 편집은 승인 후 서명 요청 발송 가능. */
    const emp = EDIT.emp;
    const infoWhich = isWork ? 'labor' : 'wage';

    /* 인사정보카드 데이터 — 결재 대기 여부(편집 후 승인 전이면 발송 불가) */
    const src = (emp && window.App && App.HRInfoMgmt && App.HRInfoMgmt.list)
      ? App.HRInfoMgmt.list().find(r => r.id === emp.id) : null;
    const pending = src && (isWork ? !!src.contractApprovalPending : !!src.wageApprovalPending);

    /* 근로/임금 계약 정보 박스 (인사정보카드 sub-block 그대로, 편집 버튼 포함) */
    const infoBoxHTML = (emp && App.HRInfoMgmt && typeof App.HRInfoMgmt.contractInfoBox === 'function')
      ? App.HRInfoMgmt.contractInfoBox(emp.id, infoWhich) : '';

    /* 계약 이력 (좌측) — 해당 직원의 과거 동일 유형 계약. 행 클릭 시 우측에 미리보기 */
    const hist = emp ? empContractHistory(emp.id, EDIT.kind) : [];
    const historyPanel = !emp ? '' : (() => {
      const items = hist.length
        ? `<div style="border:1px solid var(--color-divider);border-radius:6px;overflow:hidden;max-height:220px;overflow-y:auto;">${
            hist.map((r, i) => {
              const active = EDIT.previewHistId === r.id;
              return `
                <div data-ctr-hist-preview="${esc(r.id)}" title="미리보기"
                  style="display:flex;align-items:center;gap:10px;padding:9px 11px;cursor:pointer;${i ? 'border-top:1px solid var(--color-divider);' : ''}${active ? 'background:var(--color-active);' : ''}">
                  <span style="flex:0 0 auto;">${statusPill(effectiveStatusCode(r))}</span>
                  <span style="flex:1;min-width:0;font-size:12px;color:var(--color-text-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(periodText(r))}</span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto;"><polyline points="9 18 15 12 9 6"/></svg>
                </div>`;
            }).join('')}</div>`
        : `<div style="font-size:12px;color:var(--color-text-muted);padding:4px 2px;">이전 계약 이력이 없습니다.</div>`;
      return items;
    })();

    /* 정규직/기간제 종류 pill (우측 계약서 헤더) */
    const typePill = (() => {
      if (!isWork) return '';
      const wReg  = (EDIT.empType || (emp && emp.empType)) === 'regular';
      const wProb = wReg && !!EDIT.probation;
      const dName = (wReg && !wProb) ? '정규직 근로계약서' : '기간제 근로계약서';
      const dCls  = (wReg && !wProb) ? 'pill--success' : 'pill--info';
      return `<span class="pill ${dCls}" style="font-size:11px;">${dName}</span>`;
    })();
    const pendingBanner = pending
      ? `<div style="flex:0 0 auto;margin-bottom:10px;padding:10px 14px;background:rgba(245,158,11,.08);border:1px solid var(--color-warning);border-radius:6px;color:var(--color-text-sub);font-size:13px;line-height:1.5;">
          계약 정보 변경이 <strong style="color:var(--color-text);">결재 승인 대기 중</strong>입니다. <strong style="color:var(--color-text);">승인이 완료되어야 ${esc(EDIT.kind)}를 발송</strong>할 수 있습니다.
        </div>` : '';

    /* 우측 본문 — 이력 미리보기 선택 시 해당 계약, 아니면 신규 계약 미리보기 */
    const previewHist = EDIT.previewHistId
      ? STATE.rows.find(r => r.id === EDIT.previewHistId && emp && r.empId === emp.id)
      : null;
    const rightBody = previewHist
      ? `<div style="flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;margin-bottom:10px;background:var(--color-surface-alt);border:1px solid var(--color-divider);border-radius:6px;">
            <span style="font-size:var(--fs-sm);color:var(--color-text-sub);">이력 미리보기 · <span class="link-code">${esc(previewHist.id)}</span> ${statusPill(effectiveStatusCode(previewHist))}</span>
            <button class="btn btn--xs" type="button" data-ctr-hist-close>← 신규 계약서 보기</button>
          </div>
          <div class="doc-editor__paper is-readonly" style="font-family:inherit;flex:1;min-height:0;overflow:auto;">${renderContractHTML(previewHist, { omitSignatures: true })}</div>`
      : (emp
        ? `${pendingBanner}<div class="doc-editor__paper is-readonly" id="ctr-edit-preview" style="font-family:inherit;flex:1;min-height:0;overflow:auto;">${renderContractHTML(previewRow(), { omitSignatures: true })}</div>`
        : `<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:var(--color-text-muted);background:var(--color-surface);border:1px dashed var(--color-divider);border-radius:8px;">
            ${(window.Icons && window.Icons.fileText) || '📄'}
            <span>대상 직원을 선택하면 계약서 미리보기가 표시됩니다.</span>
          </div>`);

    /* 좌측 패널 카드 — 인사정보카드 조직 정보 박스와 동일 스타일(border·shadow·radius·타이틀 하단 구분선) */
    const leftCard = (title, body, headerRight) => `
      <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:8px;margin-bottom:16px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,0.04);">
        <header style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;border-bottom:1px solid var(--color-divider);">
          <span style="font-size:15px;font-weight:var(--fw-semibold);color:var(--color-text);letter-spacing:-0.2px;">${title}</span>
          ${headerRight || ''}
        </header>
        <div style="padding:14px 16px;">${body}</div>
      </section>`;
    const segCard = (title, navHTML) => leftCard(title, `
      <div class="tabs tabs--segmented" style="display:inline-flex;width:auto;">
        <div class="tabs__nav">${navHTML}</div>
      </div>`);

    /* 개별 작성 — 콘텐츠 영역(페이지)에 detail 뷰로 렌더 (모달 아님 · GNB/LNB 유지) */
    const host = document.getElementById('page-hr-contract');
    if (!host) return;
    host.innerHTML = `
      <div class="page-bar">
        <button class="page-bar__back" type="button" data-ctr-edit-back aria-label="목록으로">←</button>
        <div class="page-bar__divider"></div>
        <div class="page-bar__title">계약서 작성</div>
        <span class="page-bar__spacer" style="flex:1;"></span>
        <span data-ctr-edit-hint style="align-self:center;margin-right:8px;color:var(--color-danger);font-size:12px;"></span>
        <button class="btn" type="button" data-ctr-edit-preview>PDF 미리보기</button>
        <button class="btn btn--primary" type="button" data-ctr-edit-send>서명 요청 발송</button>
      </div>
      <div style="flex:1;min-height:0;">
        <div class="split" style="--split-left:440px;height:100%;">
          <aside class="split__left">
            <div class="split__head"><h3>계약 작성</h3></div>
            <div class="split__body" style="background:var(--color-surface-alt);">
              ${EDIT.lockedKind ? '' : segCard('계약 유형', `
                <button type="button" class="tabs__tab ${isWork ? 'is-active' : ''}" data-ctr-kind="근로계약서">근로계약서</button>
                <button type="button" class="tabs__tab ${!isWork ? 'is-active' : ''}" data-ctr-kind="임금계약서">임금계약서</button>`)}
              ${isWork ? segCard('근로계약서 종류', `
                <button type="button" class="tabs__tab ${EDIT.workDocType === 'permanent' ? 'is-active' : ''}" data-ctr-workdoctype="permanent">정규직</button>
                <button type="button" class="tabs__tab ${EDIT.workDocType === 'fixed' ? 'is-active' : ''}" data-ctr-workdoctype="fixed">기간제</button>`) : ''}
              ${leftCard('대상 직원', `<div id="ctr-edit-emp"></div>`,
                emp ? `<button class="btn btn--xs" type="button" data-ctr-edit-pick>변경</button>` : '')}
              ${emp ? leftCard('계약 이력', historyPanel) : ''}
              ${emp ? infoBoxHTML : ''}
            </div>
          </aside>

          <section class="split__right">
            <div class="split__head">
              <h3 style="display:flex;align-items:center;gap:8px;">${esc(EDIT.kind)} ${typePill}</h3>
            </div>
            <div class="doc-editor" style="height:100%;display:flex;flex-direction:column;min-height:0;">
              ${rightBody}
            </div>
          </section>
        </div>
      </div>
    `;

    renderEmpChip();
    bindEditor(host);
    validateEditor();
  }

  /** 편집기 미리보기용 가상 row — 현재 폼 값으로 본문 합성
   *  갑(회사 인감) 은 사전 등록된 것으로 미리 박힌 상태로 표시 */
  function previewRow() {
    const e = EDIT.emp;
    EDIT.body = TEMPLATES[EDIT.kind](currentFieldValues());
    return {
      kind: EDIT.kind,
      empId:   e ? e.id   : '',
      empName: e ? e.name : '_______',
      empDept: e ? e.dept : '',
      body: EDIT.body,
      gapSignedAt: nowStamp(),   // 사전 등록된 회사 인감 미리 배치
      eulSignedAt: '',
    };
  }

  function renderEmpChip() {
    const host = $('#ctr-edit-emp'); if (!host) return;
    /* 인사정보카드 [서명 요청] overlay 진입 — 대상 직원 잠금 (변경 불가) */
    const locked = EDIT.returnTo === 'empi-card';
    if (!EDIT.emp) {
      host.innerHTML = `
        <div class="emp-chip emp-chip--empty" data-ctr-edit-pick role="button" tabindex="0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
          <span>대상 직원을 선택하세요</span>
        </div>`;
    } else {
      const e = EDIT.emp;
      const meta1 = [e.id, e.dept, `${e.rank}${e.position ? ' · ' + e.position : ''}`].filter(Boolean).join(' · ');
      /* 카드 박스/쉐브론 없이 컴팩트 1행 — 프로필 사진 클릭 시 인사정보카드 오픈 (영역 절약) */
      host.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;min-width:0;">
          <span data-ctr-edit-empcard role="button" tabindex="0" title="인사정보카드 보기" style="cursor:pointer;flex:0 0 auto;display:inline-flex;border-radius:50%;">${empAvatar(e, 'md')}</span>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:var(--fw-semibold);color:var(--color-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(e.name)}</div>
            <div style="font-size:12px;color:var(--color-text-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(meta1)}</div>
          </div>
        </div>`;
    }
  }

  function renderKindFields() {
    const host = $('#ctr-edit-kind-fields'); if (!host) return;
    if (EDIT.kind === '근로계약서') {
      const isFixed = EDIT.workSchedule === 'fixed';
      const isShift = EDIT.workSchedule === 'shift';
      const opt = (val, label, sel) => `<option value="${esc(val)}"${sel === val ? ' selected' : ''}>${esc(label)}</option>`;
      const empTypeOpts = '<option value="">선택</option>' + MASTER_EMP_TYPES.map(([v,l]) => opt(v,l,EDIT.empType || '')).join('');
      const jobCatOpts  = '<option value="">선택</option>' + MASTER_JOB_CATS.map(([v,l]) => opt(v,l,EDIT.jobCat || '')).join('');
      const jobOpts     = '<option value="">선택</option>' + MASTER_JOBS.map(j => opt(j,j,EDIT.job || '')).join('');
      const siteOpts    = '<option value="">선택</option>' + MASTER_SITES.map(s => opt(s,s,EDIT.site || '')).join('');
      /* 휴게시간 표시 — 휴게1 + (있을 시) 휴게2 */
      const b1 = (EDIT.breakStart && EDIT.breakEnd) ? `${EDIT.breakStart} ~ ${EDIT.breakEnd}` : '';
      const b2 = (EDIT.breakStart2 && EDIT.breakEnd2) ? `, ${EDIT.breakStart2} ~ ${EDIT.breakEnd2}` : '';
      const breakDisplay = b1 ? b1 + b2 : '-';
      const workTimeDisplay = (EDIT.workTimeStart && EDIT.workTimeEnd)
        ? `${EDIT.workTimeStart} ~ ${EDIT.workTimeEnd}` : '-';
      const shiftBtnLabel = EDIT.shiftCode ? '근무조 변경' : '근무조 선택';
      const shiftDisplay = EDIT.shiftCode
        ? `<span style="color:var(--color-text);">${esc(EDIT.shiftCode)}조${EDIT.workHoursStr ? ` (${esc(EDIT.workHoursStr)})` : ''}</span>`
        : `<span style="color:var(--color-text-muted);">선택된 근무조 없음</span>`;
      host.innerHTML = `
        <div class="form-field">
          <label class="form-label">근로 유형</label>
          <select class="select input--full" id="ctr-edit-emptype" style="width:100%;">${empTypeOpts}</select>
        </div>
        <div class="form-field">
          <label class="form-label">사원 유형</label>
          <select class="select input--full" id="ctr-edit-jobcat" style="width:100%;">${jobCatOpts}</select>
        </div>
        <div class="form-field">
          <label class="form-label">직무</label>
          <select class="select input--full" id="ctr-edit-job" style="width:100%;">${jobOpts}</select>
        </div>
        <div class="form-field">
          <label class="form-label">근무지</label>
          <select class="select input--full" id="ctr-edit-site" style="width:100%;">${siteOpts}</select>
        </div>`;
      /* 소정근로시간은 「소정근로시간 정보」에서 별도 등록 — 계약서 편집기 입력 제거.
         계약서 문서(제3조)에는 등록된 소정근로시간(없으면 법정 기본 8/40/209)이 자동 반영된다. */
    } else {
      /* 임금계약서 — 임금 유형은 사원 유형이 결정: 일용직 → 시급제 / 정규·계약직 → 연봉제.
         연봉제: 임금 계약 유형(고정OT/포괄)·월 기본급·월 고정연장근무수당.
         시급제: 시급 입력 → 계약 금액 = 시급 + 주휴수당(20% 절사). */
      const emp = EDIT.emp;
      const isDailyEmp = !!(emp && emp.empType === 'daily');
      let wt = EDIT.wageType || (isDailyEmp ? 'hourly' : 'annual');
      if (wt === 'monthly') wt = 'annual';
      if (isDailyEmp && wt !== 'hourly') wt = 'hourly';
      if (!isDailyEmp && wt === 'hourly') wt = 'annual';
      EDIT.wageType = wt;
      let kind = EDIT.wageContractKind || 'fixedOT';
      if (kind === 'general') kind = 'fixedOT';
      EDIT.wageContractKind = kind;
      const isHourly    = wt === 'hourly';
      const isFixedOT   = kind === 'fixedOT';
      const isInclusive = kind === 'inclusive';
      const holidayOf = (h) => Math.floor((Number(String(h).replace(/[^0-9]/g, '')) || 0) * 0.2);
      const baseHourly = Number(String(EDIT.hourlyWage || '').replace(/[^0-9]/g, '')) || 0;
      const wageTypeOpts = MASTER_WAGE_TYPES.map(([v,l]) => {
        const dis = (v === 'hourly' && !isDailyEmp) || (v === 'annual' && isDailyEmp);
        return `<option value="${esc(v)}"${wt === v ? ' selected' : ''}${dis ? ' disabled' : ''}>${esc(l)}${dis ? ' (선택 불가)' : ''}</option>`;
      }).join('');
      const kindRadios = MASTER_WAGE_KINDS.map(([v,l]) => `
        <label class="cb" style="display:flex;align-items:flex-start;gap:8px;line-height:1.5;padding:2px 0;">
          <input type="radio" name="ctr-edit-wagekind" value="${esc(v)}" ${kind === v ? 'checked' : ''} style="margin-top:3px;flex-shrink:0;" />
          <span style="display:flex;flex-direction:column;gap:1px;">
            <span style="font-weight:var(--fw-medium);color:var(--color-text);">${esc(l)}</span>
            <span style="font-size:11.5px;color:var(--color-text-muted);font-weight:var(--fw-regular);">${esc(MASTER_WAGE_KIND_DESC[v] || '')}</span>
          </span>
        </label>`).join('');
      const amountVal = isHourly ? (EDIT.hourlyWage || '') : EDIT.contractAmount;
      host.innerHTML = `
        <div class="form-field">
          <label class="form-label is-required" for="ctr-edit-wagetype">임금 유형</label>
          <select class="select input--full" id="ctr-edit-wagetype" style="width:100%;">${wageTypeOpts}</select>
          <div class="form-help">${isDailyEmp ? '일용직은 시급제만 선택할 수 있습니다.' : '정규직·계약직은 연봉제만 선택할 수 있습니다.'}</div>
        </div>
        <div class="form-field">
          <label class="form-label is-required" for="ctr-edit-amount">계약 금액</label>
          <div style="display:flex;gap:6px;align-items:center;">
            <span style="font-size:12px;color:var(--color-text-muted);min-width:32px;" id="ctr-edit-amount-prefix">${esc(MASTER_WAGE_AMOUNT_PREFIX[wt] || '')}</span>
            <input class="input" type="text" id="ctr-edit-amount" value="${esc(amountVal)}" inputmode="numeric" style="flex:1;text-align:right;" placeholder="0" />
            <span style="font-size:12px;color:var(--color-text-muted);">원</span>
          </div>
          <div data-ctr-edit-holiday-hint style="display:${isHourly ? 'flex' : 'none'};gap:4px;align-items:center;flex-wrap:wrap;margin-top:6px;font-size:12px;color:var(--color-text-sub);">
            ＋주휴수당 20% <strong data-ctr-edit-holiday-amt style="color:var(--color-text);">${holidayOf(baseHourly).toLocaleString()}</strong>원
            = 계약 시급 <strong data-ctr-edit-holiday-total style="color:var(--color-brand-primary);">${(baseHourly + holidayOf(baseHourly)).toLocaleString()}</strong>원
            <span style="color:var(--color-text-muted);">(원단위 절사)</span>
          </div>
        </div>
        <div class="form-field" data-ctr-edit-wagekind-row style="display:${isHourly ? 'none' : ''};">
          <label class="form-label is-required">임금 계약 유형</label>
          <div style="display:flex;flex-direction:column;gap:6px;">${kindRadios}</div>
          <div data-ctr-edit-fot-params style="display:${(!isHourly && isFixedOT) ? 'flex' : 'none'};gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px;padding:8px 10px;background:#f8fafc;border:1px solid var(--color-divider);border-radius:6px;">
            <span style="display:inline-flex;gap:4px;align-items:center;">
              <span style="font-size:12px;color:var(--color-text-muted);">기준 시간</span>
              <input class="input input--sm" type="number" min="0" step="1" id="ctr-edit-fot-hours" value="${esc(EDIT.fixedOTHours)}" style="width:74px;text-align:right;" placeholder="0" />
              <span style="font-size:12px;color:var(--color-text-muted);">시간</span>
            </span>
            <span style="display:inline-flex;gap:4px;align-items:center;">
              <span style="font-size:12px;color:var(--color-text-muted);">지급배율</span>
              <input class="input input--sm" type="number" min="1" step="0.1" id="ctr-edit-fot-rate" value="${esc(EDIT.fixedOTRate)}" style="width:64px;text-align:right;" />
              <span style="font-size:12px;color:var(--color-text-muted);">배</span>
            </span>
          </div>
        </div>
        <div class="form-field" data-ctr-edit-base-row style="display:${isHourly ? 'none' : ''};">
          <label class="form-label is-required" for="ctr-edit-base">월 기본급 (원)</label>
          <input class="input input--full" type="text" id="ctr-edit-base" value="${esc(EDIT.baseSalary)}" inputmode="numeric" />
        </div>
        <div class="form-field" data-ctr-edit-fot-row style="display:${(!isHourly && isFixedOT) ? '' : 'none'};">
          <label class="form-label" for="ctr-edit-fot-amount">월 고정연장근무수당 (원)</label>
          <input class="input input--full" type="text" id="ctr-edit-fot-amount" value="${esc(EDIT.fixedOTAmount)}" inputmode="numeric" />
        </div>
        <div class="form-field" data-ctr-edit-inc-row style="display:${(!isHourly && isInclusive) ? '' : 'none'};">
          <label class="form-label" for="ctr-edit-inc-amount">월 고정연장근무수당 (원)</label>
          <input class="input input--full" type="text" id="ctr-edit-inc-amount" value="${esc(EDIT.inclusiveOTAmount)}" inputmode="numeric" />
        </div>
        <div class="form-field">
          <label class="form-label">임금 지급일</label>
          <div style="color:var(--color-text);padding:6px 0;font-size:13px;">
            매월 ${esc(EDIT.payDay)}일
          </div>
        </div>
        <div class="form-field">
          <label class="form-label">임금 지급방법</label>
          <div style="color:var(--color-text);padding:6px 0;font-size:13px;">계좌이체</div>
        </div>`;
    }
  }

  function bindEditor(pageEl) {
    pageEl.querySelector('[data-ctr-edit-back]').addEventListener('click', onCancelEditor);

    pageEl.querySelectorAll('[data-ctr-kind]').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.ctrKind;
        if (k === EDIT.kind) return;
        EDIT.kind = k;
        EDIT.indefinite = false;
        /* 계약 유형 변경 시 대상 직원·이력 미리보기 초기화 → 새 유형 기준으로 다시 선택 */
        EDIT.emp = null;
        EDIT.previewHistId = null;
        renderEditorView(document.getElementById('modal-ctr-view'));
      });
    });

    /* 모달 단위 delegation — 매 render 마다 중복 부착 방지 */
    if (!pageEl.dataset.ctrEditDelegate) {
      pageEl.dataset.ctrEditDelegate = '1';
      pageEl.addEventListener('click', (e) => {
        /* 근로계약서 종류(정규직/기간제) 선택 — 변경 시 대상 직원 재선택 (필터 기준이 바뀜) */
        const wdt = e.target.closest('[data-ctr-workdoctype]');
        if (wdt) {
          const v = wdt.dataset.ctrWorkdoctype;
          if (v !== EDIT.workDocType) {
            EDIT.workDocType = v;
            EDIT.emp = null;
            EDIT.previewHistId = null;
            renderEditorView(document.getElementById('modal-ctr-view'));
          }
          return;
        }
        if (e.target.closest('[data-ctr-edit-pick]')) { openBulkPickForIndividual(); return; }
        /* 근로/임금 계약 정보 박스의 [편집] — 인사정보카드와 동일한 편집 모달을 띄움.
           편집 → 결재 승인 대기 → 승인 완료 후 서명 요청 발송 가능 (페이지 자동 재렌더). */
        const secAct = e.target.closest('[data-empi-card-section-act]');
        if (secAct) {
          const emp = EDIT.emp; if (!emp) return;
          const section = secAct.dataset.empiCardSection;   /* employment | wage */
          if (window.App && App.HRInfoMgmt && typeof App.HRInfoMgmt.openContractEdit === 'function') {
            App.HRInfoMgmt.openContractEdit(emp.id, {
              section,
              onSaved: () => {
                prefillFromInfoMgmt();
                EDIT.body = TEMPLATES[EDIT.kind](currentFieldValues());
                renderEditorView();
              },
            });
          }
          return;
        }
        /* 대상 직원 카드 클릭 → 인사정보카드 (변경 버튼은 위에서 먼저 처리되어 제외됨) */
        if (e.target.closest('[data-ctr-edit-empcard]')) {
          const emp = EDIT.emp;
          if (emp && window.App && App.HRInfoCard && typeof App.HRInfoCard.open === 'function') {
            const src = (App.HRInfoMgmt && App.HRInfoMgmt.list) ? App.HRInfoMgmt.list().find(r => r.id === emp.id) : null;
            App.HRInfoCard.open(src || emp);
            const cm = document.getElementById('modal-empi-card');
            if (cm) cm.style.zIndex = '1100';   /* 계약서 작성 모달(1000) 위 · 카드 내부 미리보기(1200) 아래 */
          }
          return;
        }
        /* 계약 이력 미리보기 토글 */
        const hp = e.target.closest('[data-ctr-hist-preview]');
        if (hp) { EDIT.previewHistId = hp.dataset.ctrHistPreview; renderEditorView(document.getElementById('modal-ctr-view')); return; }
        if (e.target.closest('[data-ctr-hist-close]')) { EDIT.previewHistId = null; renderEditorView(document.getElementById('modal-ctr-view')); return; }
      });
    }

    bindField('#ctr-edit-start', 'startDate');
    bindField('#ctr-edit-end',   'endDate');
    // 무기 계약 토글 (근로계약서만)
    const indEl = pageEl.querySelector('#ctr-edit-indefinite');
    if (indEl) {
      indEl.addEventListener('change', (ev) => {
        EDIT.indefinite = ev.target.checked;
        if (EDIT.indefinite) EDIT.endDate = '';
        renderEditorView(document.getElementById('modal-ctr-view'));  // 종료일 disable 상태 갱신
      });
    }
    /* 근로계약서 — 신규 dropdown 필드 */
    bindField('#ctr-edit-emptype', 'empType');
    bindField('#ctr-edit-jobcat',  'jobCat');
    bindField('#ctr-edit-job',     'job');
    bindField('#ctr-edit-site',    'site');
    /* 소정근로시간은 「소정근로시간 정보」에서 별도 등록 — 편집기 입력/바인딩 제거 (문서는 prefill 값 사용) */
    /* 근무 형태 라디오 — fixed/shift 전환 시 근무조/근무시간/휴게시간 영역 토글 */
    pageEl.querySelectorAll('[name="ctr-edit-worksch"]').forEach(r => {
      r.addEventListener('change', (ev) => {
        EDIT.workSchedule = ev.target.value;
        /* 교대 전환 시 — 근무조/근무시간/휴게시간 클리어 */
        if (EDIT.workSchedule === 'shift') {
          EDIT.shiftCode = ''; EDIT.shiftLabel = ''; EDIT.workHoursStr = '';
          EDIT.workTimeStart = ''; EDIT.workTimeEnd = '';
          EDIT.breakStart = ''; EDIT.breakEnd = '';
          EDIT.breakStart2 = ''; EDIT.breakEnd2 = '';
        }
        renderEditorView(document.getElementById('modal-ctr-view'));
      });
    });
    /* 근무조 선택 버튼 — App.AttShifts.list() 마스터 모달 호출 */
    const shiftPickBtn = pageEl.querySelector('[data-ctr-edit-shift-pick]');
    if (shiftPickBtn) {
      shiftPickBtn.addEventListener('click', () => openShiftPickForEditor());
    }
    /* 임금계약서 필드 — info-mgmt 임금계약 정보 편집 구조와 동일.
       계약 금액 / 임금 유형 / 임금 계약 유형 / OT 파라미터 변경 시 기본급 + (kind 별) 시간외수당 자동 산출. */
    bindField        ('#ctr-edit-base',       'baseSalary');         // user 직접 수정 가능
    bindFieldWithCalc('#ctr-edit-fot-hours',  'fixedOTHours');
    bindFieldWithCalc('#ctr-edit-fot-rate',   'fixedOTRate');
    bindField        ('#ctr-edit-fot-amount', 'fixedOTAmount');      // user 직접 수정 가능
    bindField        ('#ctr-edit-inc-amount', 'inclusiveOTAmount');
    bindField        ('#ctr-edit-deduction',  'deductionPolicy');    // 요소 없을 시 no-op
    /* 임금 유형 변경 → 화면 재렌더 (시급/연봉 영역 토글 + prefix 갱신) */
    const wageTypeEl = pageEl.querySelector('#ctr-edit-wagetype');
    if (wageTypeEl) {
      wageTypeEl.addEventListener('change', () => {
        EDIT.wageType = wageTypeEl.value;
        autoCalcWageEditor();
        renderEditorView(document.getElementById('modal-ctr-view'));
      });
    }
    /* 계약 금액 — 연봉제는 계약금액(연봉), 시급제는 기본 시급 입력 → 계약금액 = 시급 + 주휴수당(20% 절사) */
    const amtEl = pageEl.querySelector('#ctr-edit-amount');
    if (amtEl) {
      const onAmt = () => {
        if (EDIT.wageType === 'hourly') {
          EDIT.hourlyWage = amtEl.value;
          const base = Number(String(amtEl.value).replace(/[^0-9]/g, '')) || 0;
          const holiday = Math.floor(base * 0.2);
          EDIT.contractAmount = base ? String(base + holiday) : '';
          const hEl = pageEl.querySelector('[data-ctr-edit-holiday-amt]');   if (hEl) hEl.textContent = holiday.toLocaleString();
          const tEl = pageEl.querySelector('[data-ctr-edit-holiday-total]'); if (tEl) tEl.textContent = (base + holiday).toLocaleString();
        } else {
          EDIT.contractAmount = amtEl.value;
        }
        autoCalcWageEditor();
        syncBodyIfClean();
        validateEditor();
      };
      amtEl.addEventListener('input', onAmt);
      amtEl.addEventListener('change', onAmt);
    }
    /* 임금 계약 유형 라디오 — fixedOT/inclusive 파라미터/지급항목 행 토글 + 자동 산출 */
    pageEl.querySelectorAll('[name="ctr-edit-wagekind"]').forEach(r => {
      r.addEventListener('change', (ev) => {
        EDIT.wageContractKind = ev.target.value;
        autoCalcWageEditor();
        renderEditorView(document.getElementById('modal-ctr-view'));
      });
    });
    /* 첫 렌더 시에도 한 번 자동 산출 (prefill 또는 직원 선택 후) */
    autoCalcWageEditor();

    pageEl.querySelector('[data-ctr-edit-preview]').addEventListener('click', () => {
      window.toast && window.toast('PDF 미리보기 (데모: 미구현)', 'info');
    });
    pageEl.querySelector('[data-ctr-edit-send]').addEventListener('click', onSendForSign);
  }

  /* 근무조 선택 모달 — 인사정보카드의 modal-empi-shift-pick 재사용.
     인사정보카드 측 마스터 모달이 자기 자신의 hidden inputs 를 채우는데, 우리는
     클릭한 shift 객체만 받아 EDIT 에 직접 반영하면 됨. */
  function openShiftPickForEditor() {
    const list = (window.App && App.AttShifts && App.AttShifts.list)
      ? App.AttShifts.list() : [];
    const host = document.getElementById('empi-shift-pick-list');
    const modal = document.getElementById('modal-empi-shift-pick');
    if (!host || !modal) {
      window.toast && window.toast('근무조 마스터 모달을 불러올 수 없습니다.', 'danger');
      return;
    }
    if (!list.length) {
      host.innerHTML = `<p style="color:var(--color-text-muted);text-align:center;padding:24px 0;">등록된 근무조가 없습니다.</p>`;
    } else {
      const br1 = (s) => (s.breakStart && s.breakEnd) ? `${esc(s.breakStart)}~${esc(s.breakEnd)}` : '<span style="color:var(--color-text-muted);">-</span>';
      const br2 = (s) => (s.breakStart2 && s.breakEnd2) ? `${esc(s.breakStart2)}~${esc(s.breakEnd2)}` : '<span style="color:var(--color-text-muted);">-</span>';
      host.innerHTML = `
        <table class="tbl tbl--hover tbl--striped" style="width:100%;border-collapse:collapse;">
          <thead>
            <tr>
              <th style="width:80px;text-align:center;">근무조</th>
              <th style="width:80px;text-align:center;">출근</th>
              <th style="width:80px;text-align:center;">퇴근</th>
              <th style="width:80px;text-align:center;">근무시간</th>
              <th style="text-align:center;">휴게시간1</th>
              <th style="text-align:center;">휴게시간2</th>
              <th style="width:80px;"></th>
            </tr>
          </thead>
          <tbody>
            ${list.map(s => `
              <tr data-ctr-shift-pick-row="${esc(s.code)}" style="cursor:pointer;">
                <td style="text-align:center;font-weight:var(--fw-bold);color:var(--color-brand-primary);">${esc(s.code)}</td>
                <td style="text-align:center;">${esc(s.start)}</td>
                <td style="text-align:center;">${esc(s.end)}</td>
                <td style="text-align:center;">${esc(s.workHours || '-')}</td>
                <td style="text-align:center;">${br1(s)}</td>
                <td style="text-align:center;">${br2(s)}</td>
                <td style="text-align:center;"><button type="button" class="btn btn--xs btn--primary" data-ctr-shift-pick-confirm="${esc(s.code)}">선택</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;
    }
    /* 클릭 위임 — 1회만 바인딩 (ctr 컨텍스트 전용 키) */
    if (!host.dataset.ctrBound) {
      host.dataset.ctrBound = '1';
      host.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-ctr-shift-pick-confirm]') || e.target.closest('[data-ctr-shift-pick-row]');
        if (!btn) return;
        const code = btn.dataset.ctrShiftPickConfirm || btn.dataset.ctrShiftPickRow;
        const shift = (window.App && App.AttShifts && App.AttShifts.get) ? App.AttShifts.get(code) : null;
        if (!shift) return;
        applyShiftPickToEditor(shift);
      });
    }
    modal.style.setProperty('z-index', '1450', 'important');   /* over-oc !important 를 이기려면 inline important */
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function applyShiftPickToEditor(shift) {
    EDIT.shiftCode    = shift.code;
    EDIT.shiftLabel   = shift.label || '';
    EDIT.workHoursStr = shift.workHours || '';
    EDIT.workTimeStart = shift.start;
    EDIT.workTimeEnd   = shift.end;
    EDIT.breakStart    = shift.breakStart  || '';
    EDIT.breakEnd      = shift.breakEnd    || '';
    EDIT.breakStart2   = shift.breakStart2 || '';
    EDIT.breakEnd2     = shift.breakEnd2   || '';
    /* 모달 닫기 + 편집 화면 재렌더 */
    const m = document.getElementById('modal-empi-shift-pick');
    if (m) m.classList.remove('is-open');
    if (!document.querySelector('.modal-backdrop.is-open')) document.body.style.overflow = '';
    renderEditorView(document.getElementById('modal-ctr-view'));
    window.toast && window.toast(`${shift.code}조 — 근무·휴게시간 자동 채움`, 'success');
  }

  function bindField(sel, key) {
    const el = document.querySelector(sel); if (!el) return;
    const handler = () => {
      EDIT[key] = el.value;
      syncBodyIfClean();
      validateEditor();
    };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  }
  /* bindField + 임금계약서 자동 산출 트리거 (계약금액/임금유형/OT 파라미터 변경 시) */
  function bindFieldWithCalc(sel, key) {
    const el = document.querySelector(sel); if (!el) return;
    const handler = () => {
      EDIT[key] = el.value;
      autoCalcWageEditor();
      syncBodyIfClean();
      validateEditor();
    };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  }
  /* 임금계약서 자동 산출 — 계약 금액(연봉/월급) 기준으로 월 기본급 + (kind 별) 시간외수당 산출.
     info-mgmt 의 autoCalcPayItems 와 동일 산식 — 추가 지급 항목은 없으므로 단순화:
       M = wageType==='annual' ? amount/12 : amount   (월 환산 금액)
       H = hoursPerMonth (기본 209h)
       W = fixedOT: hours × rate / inclusive: 0 (포괄임금은 사용자 직접 입력)
       baseAuto    = M × H / (H + W)
       fixedOTAuto = M × W / (H + W)
     user 가 직접 base/OT 셀에 값을 입력한 후엔 그 값을 유지 (overrideUserEdit=false 일 때).
     기본 동작은 항상 덮어쓰기 — 임금유형/금액 변경 시 새 계산값으로 갱신. */
  function autoCalcWageEditor() {
    if (EDIT.kind !== '임금계약서') return;
    /* 시급제 — 월 기본급/시간외수당 자동 산출 대상 아님 (계약금액 = 시급+주휴만) */
    if (EDIT.wageType === 'hourly') return;
    const wt   = EDIT.wageType   || 'annual';
    const kind = EDIT.wageContractKind || 'general';
    const amount = Number(String(EDIT.contractAmount || '').replace(/[^0-9.-]/g, '')) || 0;
    if (!amount) return;
    const M = wt === 'annual' ? (amount / 12) : amount;
    const H = 209;
    let W = 0;
    if (kind === 'fixedOT') {
      const h = Number(EDIT.fixedOTHours || 0);
      const r = Number(EDIT.fixedOTRate  || 1.5);
      W = h * r;
    }
    const denom = H + W;
    const baseAuto = denom > 0 ? Math.round(M * H / denom) : Math.round(M);
    const otAuto   = denom > 0 ? Math.round(M * W / denom) : 0;
    /* EDIT 갱신 + 입력 필드 동기화 */
    EDIT.baseSalary = baseAuto ? baseAuto.toLocaleString() : '';
    const baseEl = document.querySelector('#ctr-edit-base');
    if (baseEl) baseEl.value = EDIT.baseSalary;
    if (kind === 'fixedOT') {
      EDIT.fixedOTAmount = otAuto ? otAuto.toLocaleString() : '';
      const fotEl = document.querySelector('#ctr-edit-fot-amount');
      if (fotEl) fotEl.value = EDIT.fixedOTAmount;
    }
    /* inclusive 는 사용자가 직접 입력 (포괄임금은 약정 시간 합산식이라 자동 산출 적용 X) */
  }
  function syncBodyIfClean() {
    EDIT.body = TEMPLATES[EDIT.kind](currentFieldValues());
    const pv = document.querySelector('#ctr-edit-preview');
    if (pv) pv.innerHTML = renderContractHTML(previewRow(), { omitSignatures: true });
  }
  function validateEditor() {
    const endMsg = $('#ctr-edit-end-msg');
    const empMsg = $('#ctr-edit-emp-msg');
    const send   = document.querySelector('[data-ctr-edit-send]');
    if (!send) return;

    /* 무기(기간의 정함 없음) — 근로/임금 공통. 무기면 종료일·종료일 순서 검증 생략 */
    const isIndef = !!EDIT.indefinite;
    let valid = true;
    const reasons = [];   /* 발송 비활성 사유 — 버튼 옆 힌트/툴팁으로 노출 */
    if (!EDIT.emp)       { valid = false; reasons.push('대상 직원을 선택해 주세요.'); }
    if (!EDIT.startDate) { valid = false; reasons.push('계약 시작일이 없습니다.'); }
    if (!isIndef && !EDIT.endDate) { valid = false; reasons.push('계약 종료일이 없습니다.'); }
    let dateErr = '';
    if (!isIndef && EDIT.startDate && EDIT.endDate && EDIT.endDate < EDIT.startDate) {
      dateErr = '종료일은 시작일 이후로 설정해 주세요.'; valid = false; reasons.push(dateErr);
    }
    if (endMsg) { endMsg.textContent = dateErr; endMsg.style.color = dateErr ? 'var(--color-danger)' : ''; }

    let dupErr = '';
    if (EDIT.emp && EDIT.startDate) {
      /* 동일 '시작일'의 유효 계약만 중복으로 본다 — 시작일이 다르면(기간의 정함 없음 포함) 재계약(신규)으로 허용 */
      const dup = STATE.rows.find(r => {
        if (r.id === EDIT.savedDraftId) return false;
        if (r.empId !== EDIT.emp.id || r.kind !== EDIT.kind) return false;
        if (['rejected','voided','expired'].includes(r.status)) return false;
        return (r.startDate || '') === EDIT.startDate;
      });
      if (dup) {
        const dupPeriod = dup.indefinite
          ? `${dup.startDate || '-'} ~ 기간의 정함 없음`
          : `${dup.startDate || '-'} ~ ${dup.endDate || '-'}`;
        dupErr = `이미 같은 시작일의 ${EDIT.kind}가 존재합니다 (${dup.id}, ${dupPeriod}). 시작일을 변경해 주세요.`;
        valid = false; reasons.push(dupErr);
      }
    }
    if (empMsg) { empMsg.textContent = dupErr; empMsg.style.color = dupErr ? 'var(--color-danger)' : ''; }

    if (EDIT.kind === '임금계약서') {
      if (EDIT.wageType === 'hourly') {
        /* 시급제 — 기본 시급 필수 (월 기본급 없음) */
        const hN = Number(String(EDIT.hourlyWage || '').replace(/[^\d]/g, ''));
        if (!hN) { valid = false; reasons.push('시급을 입력해 주세요.'); }
      } else {
        const baseN = Number(String(EDIT.baseSalary || EDIT.기본급 || '').replace(/[^\d]/g, ''));
        if (!baseN) { valid = false; reasons.push('월 기본급을 입력해 주세요.'); }
      }
    }

    /* 인사정보 카드의 정보 변경 결재는 근로/임금 계약과 무관 — '변경 승인 대기' 상태여도 서명 요청 발송 허용. */

    send.disabled = !valid;
    /* 비활성 사유 노출 — 버튼 옆 힌트 텍스트 + 툴팁 (조용히 꺼지는 문제 방지) */
    const hint = reasons[0] || '';
    document.querySelectorAll('[data-ctr-edit-hint]').forEach(el => { el.textContent = hint; });
    send.title = hint || '서명 요청 발송';
  }

  /* [취소] 버튼 — 인사정보카드 흐름(서명 요청 → 설정 모달 복귀)에서는 경고 없이 바로 이전 설정 모달로 복귀.
     그 외(계약 관리 개별 작성)에서는 헤더 X 와 동일하게 확인 후 이탈. */
  function onCancelEditor() {
    if (EDIT.reopenSection) { goList(); return; }
    confirmLeaveEditor();
  }
  function confirmLeaveEditor() {
    if (!EDIT.emp && !EDIT.startDate && !EDIT.endDate && !EDIT.savedDraftId) {
      goList(); return;
    }
    /* 인사정보카드에서 진입(설정 모달 → 서명 요청)한 경우엔 이전 설정 단계로 복귀, 그 외엔 목록으로 이탈 */
    const msg = EDIT.reopenSection
      ? '서명 요청을 발송하지 않고 닫으면 이전(계약 정보 설정) 단계로 돌아갑니다.\n작성한 계약서는 저장되지 않습니다. 계속하시겠습니까?'
      : '서명 요청을 발송하지 않고 나가면 작성한 계약서는 저장되지 않고 사라집니다.\n나가시겠습니까?';
    if (confirm(msg)) {
      goList();
    }
  }
  function goList() {
    /* 인사정보카드(empi-card) 위에 overlay 로 떠 있던 경우 — editor 만 닫고 카드 본문 재렌더.
       페이지(계약 관리) 전환 없이, 카드의 계약 상태가 미서명 → 서명진행중으로 즉시 갱신됨. */
    if (EDIT.returnTo === 'empi-card') {
      const reopenSection = EDIT.reopenSection;   /* 취소/닫기로 나가면 직전 계약 정보 설정 모달로 복귀 */
      const reopenEmpId   = EDIT.returnEmpId;
      EDIT.returnTo = ''; EDIT.returnEmpId = '';
      EDIT.lockedKind = false; EDIT.reopenSection = '';
      STATE.view = 'list';
      closeCtrModal();
      /* overlay 진입 시 설정한 inline z-index 초기화 — 다음 일반 open 시 영향 없도록 */
      const m = document.getElementById('modal-ctr-view');
      if (m) m.style.zIndex = '';
      /* 인사정보카드 본문 즉시 재렌더 — App.HRInfoMgmtCard.renderDrawer 또는 내부 renderCardBody 호출 */
      if (window.App && App.HRInfoMgmt && App.HRInfoMgmt._renderCardBody) {
        try { App.HRInfoMgmt._renderCardBody(); } catch (_) {}
      } else if (window.App && App.HRInfoMgmtCard && typeof App.HRInfoMgmtCard.renderDrawer === 'function') {
        try { App.HRInfoMgmtCard.renderDrawer(); } catch (_) {}
      }
      /* 서명 요청을 발송하지 않고 닫은 경우 — 직전 계약 정보 설정 모달을 다시 띄운다. */
      if (reopenSection && window.App && App.HRInfoMgmt && typeof App.HRInfoMgmt.reopenCardContractEdit === 'function') {
        try { App.HRInfoMgmt.reopenCardContractEdit(reopenEmpId, reopenSection); } catch (_) {}
      }
      return;
    }
    EDIT.returnTo = ''; EDIT.returnEmpId = '';
    EDIT.lockedKind = false;
    STATE.view = 'list';
    /* 모달 닫기 — editor / detail 모두 modal-ctr-view 사용 */
    closeCtrModal();
    const pageEl = document.getElementById('page-hr-contract');
    if (pageEl && !pageEl.querySelector('.toolbar')) {
      renderListView(pageEl);
    }
    applyFilter();
    renderTable();
  }

  function onTempSave() {
    /* 무기 근로계약은 endDate 가 비어있어야 정상 — indefinite 케이스 예외 처리 */
    const isIndef = EDIT.kind === '근로계약서' && EDIT.indefinite;
    if (!EDIT.emp || !EDIT.startDate || (!isIndef && !EDIT.endDate)) {
      window.toast && window.toast('필수 항목을 모두 입력해 주세요.', 'warning'); return;
    }
    upsertEditDraft('draft');
    window.toast && window.toast(`임시저장되었습니다. (${EDIT.savedDraftId})`, 'success');
    const sub = $('#ctr-edit-sub');
    if (sub) sub.textContent = `${EDIT.kind} · 마지막 저장 ${nowStamp()}`;
    const headBar = document.querySelector('.page-bar');
    if (headBar && !headBar.querySelector('[data-saved-pill]')) {
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.dataset.savedPill = '1';
      pill.textContent = '초안 ' + EDIT.savedDraftId;
      headBar.insertBefore(pill, headBar.querySelector('.page-bar__spacer'));
    }
  }

  function onSendForSign() {
    window.sweet && window.sweet({
      icon: 'confirm',
      title: '서명 요청 발송',
      text: `${EDIT.emp ? EDIT.emp.name + ' 님' : '직원'} 에게 ${EDIT.kind} 서명 요청 이메일을 발송합니다.\n` +
            `회사 인감이 자동 배치된 후 직원에게 발송되며, 이후에는 계약 내용을 수정할 수 없습니다.`,
      cancelText: '취소', confirmText: '발송',
      onConfirm: () => {
        const row = upsertEditDraft('signing');
        row.gapSignedAt = nowStamp();   // 회사 인감 배치
        row.sentBy = HR_NAME;
        row.sentAt = nowStamp();
        row.history.push({ at: nowStamp(), title: '서명 요청 발송', desc: '직원 이메일 발송', kind:'' });
        /* 인사정보카드(App.HRInfoMgmt) 동기화 — 발송일/기간/근로조건/임금 항목 반영 */
        if (EDIT.emp) {
          syncToInfoMgmt(EDIT.emp.id, {
            kind: EDIT.kind, startDate: EDIT.startDate, endDate: EDIT.endDate,
            /* 근로계약서 — 사용자 편집한 모든 필드 반영 */
            empType: EDIT.empType, contractSubType: EDIT.contractSubType, contractOut: EDIT.contractOut,
            jobCat: EDIT.jobCat, job: EDIT.job, site: EDIT.site,
            workSchedule: EDIT.workSchedule,
            shiftCode: EDIT.shiftCode, shiftLabel: EDIT.shiftLabel,
            workTimeStart: EDIT.workTimeStart, workTimeEnd: EDIT.workTimeEnd,
            breakStart: EDIT.breakStart, breakEnd: EDIT.breakEnd,
            breakStart2: EDIT.breakStart2, breakEnd2: EDIT.breakEnd2,
            annualLeavePolicy: EDIT.annualLeavePolicy,
            /* 임금계약서 — info-mgmt 임금계약 정보와 동일 항목 */
            wageType: EDIT.wageType, contractAmount: EDIT.contractAmount,
            wageContractKind: EDIT.wageContractKind,
            fixedOTHours: EDIT.fixedOTHours, fixedOTRate: EDIT.fixedOTRate,
            baseSalary: EDIT.baseSalary,
            fixedOTAmount: EDIT.fixedOTAmount, inclusiveOTAmount: EDIT.inclusiveOTAmount,
            deductionPolicy: EDIT.deductionPolicy,
          }, !!EDIT.indefinite);
        }
        window.toast && window.toast(`서명 요청 이메일 발송 완료 — ${row.id}`, 'success');
        EDIT.reopenSection = '';   /* 발송 완료 — 설정 모달로 복귀하지 않음 */
        goList();
      },
    });
  }

  /* 계약번호 생성 — CTR-{연도}-{일련번호4자리}.
     · 인사정보카드의 발령번호(APT-YYYY-####)·기존 시드(CTR-2024-1001 등)와 동일 컨벤션.
     · 일련번호 = 기존 모든 CTR 계약번호 중 최대 일련번호 + 1 (연도 무관 누적). */
  function makeContractId(empId, createdYmd) {
    const ymd = createdYmd || todayStr();
    let max = 1000;
    STATE.rows.forEach(r => {
      const m = /^CTR-\d{4}-(\d{4,})$/.exec(r.id || '');
      if (m) { const n = Number(m[1]); if (n > max) max = n; }
    });
    return `CTR-${ymd.slice(0, 4)}-${max + 1}`;
  }

  /* 특정 직원의 '현재 적용 중(최신)' 계약 — kind 별. 초안/반려/무효/취소 제외, 시작일(→작성일) 최신순 첫 건.
     · '근로계약서' : 임금계약의 연결 근로계약(linkedLaborId) 기준
     · '임금계약서' : 신규 임금계약 작성 시 시작일 기본값(현재 적용 중 최신 임금계약 시작일) 기준 */
  function latestContractOf(empId, kind) {
    /* 다른 조회 API 와 동일하게 lazy 시드 — 계약 관리 미방문 상태에서 호출돼도 이력이 비지 않도록 */
    if (!STATE.rows || !STATE.rows.length) STATE.rows = makeMock();
    return STATE.rows
      .filter(r => r.empId === empId && r.kind === kind
                && ['draft','rejected','voided','canceled'].indexOf(r.status) < 0)
      .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || '')
                   || (b.createdAt || '').localeCompare(a.createdAt || ''))[0] || null;
  }

  function upsertEditDraft(status) {
    /* 무기(기간의 정함 없음) — 근로/임금 공통. 임금계약도 무기 체크 시 그대로 반영한다. */
    const isIndef = !!EDIT.indefinite;
    let row = STATE.rows.find(r => r.id === EDIT.savedDraftId);
    const today = todayStr();
    /* 임금계약서 → 현재 적용 중(최신) 근로계약에 연결. 근로계약서는 연결 없음(''). */
    const computedLinkedId = (EDIT.kind === '임금계약서')
      ? ((latestContractOf(EDIT.emp.id, '근로계약서') || {}).id || '')
      : '';
    const salaryBlock = {
      base: EDIT.baseSalary || '',
      contractAmount: EDIT.contractAmount || '',
      wageType: EDIT.wageType || '',
      wageContractKind: EDIT.wageContractKind || '',
      fixedOTAmount: EDIT.fixedOTAmount || '',
      inclusiveOTAmount: EDIT.inclusiveOTAmount || '',
      payday: `매월 ${EDIT.payDay || 10}일`,
    };
    if (!row) {
      row = {
        id: makeContractId(EDIT.emp.id, today),
        kind: EDIT.kind,
        mode: EDIT.mode || 'individual',
        empId: EDIT.emp.id, empName: EDIT.emp.name, empDept: EDIT.emp.dept,
        startDate: EDIT.startDate, endDate: isIndef ? '' : EDIT.endDate,
        indefinite: isIndef,
        status, body: EDIT.body,
        history: [{ at: nowStamp(), title: '계약서 작성', desc: 'HR 담당자 ' + HR_NAME, kind: '' }],
        createdAt: today,
        registeredBy: HR_NAME,   // 작성 담당자 (초안)
        sentBy: '', sentAt: '',  // 발송 단계 도달 시 셋팅 (onSendForSign / 일괄 발송)
        linkedLaborId: computedLinkedId,
        salary: salaryBlock,
      };
      STATE.rows.unshift(row);
      EDIT.savedDraftId = row.id;
    } else {
      row.kind = EDIT.kind;
      row.empId = EDIT.emp.id; row.empName = EDIT.emp.name; row.empDept = EDIT.emp.dept;
      row.startDate = EDIT.startDate; row.endDate = isIndef ? '' : EDIT.endDate;
      row.indefinite = isIndef;
      row.body = EDIT.body; row.status = status;
      /* 기존 연결이 있으면 유지, 없으면 최신 근로계약으로 채움 (임금계약서만) */
      if (EDIT.kind === '임금계약서') row.linkedLaborId = row.linkedLaborId || computedLinkedId;
      row.salary = salaryBlock;
    }
    return row;
  }

  /* =========================================================
   *  직원 Picker — 전자결재 공용 직원 선택 OffCanvas (App.openEmpPicker) 사용
   *  ========================================================= */
  function openEmpPicker() {
    if (typeof App.openEmpPicker === 'function') {
      App.openEmpPicker({
        action: 'callback', multi: false,
        onConfirm(selected) {
          if (!selected || !selected[0]) return;
          const picked = selected[0];
          /* picker 가 반환하는 emp { id, name, dept, pos, photo } 를 EMPLOYEES 마스터와 머지 */
          const fromMaster = EMPLOYEES.find(e => e.id === picked.id) || null;
          EDIT.emp = fromMaster || {
            id: picked.id, name: picked.name, dept: picked.dept,
            rank: picked.rank || '', position: picked.pos || picked.position || '',
            photoUrl: picked.photo || picked.photoUrl || '',
            empType: picked.empType || 'regular', jobCat: picked.jobCat || 'office',
            site: picked.site || '성수동',
          };
          if (EDIT.emp && EDIT.emp.site) EDIT.근무지 = EDIT.emp.site;
          prefillFromInfoMgmt();
          EDIT.body = TEMPLATES[EDIT.kind](currentFieldValues());
          renderEditorView(document.getElementById('modal-ctr-view'));
        },
        onClose() { /* 취소 — 아무 처리 안 함 */ },
      });
      return;
    }
    /* fallback — App.openEmpPicker 미로드 환경 (legacy 로컬 picker) */
    PICK.keyword = '';
    PICK.selectedId = EDIT.emp ? EDIT.emp.id : null;
    const kwEl = $('#ctr-pick-kw');
    if (kwEl) {
      kwEl.value = '';
      renderEmpPickerList();
      const cf = $('[data-ctr-pick-confirm]');
      if (cf) cf.disabled = !PICK.selectedId;
      openModal('modal-ctr-emppick');
      setTimeout(() => kwEl.focus(), 50);
    }
  }
  function renderEmpPickerList() {
    const kw = (PICK.keyword || '').trim().toLowerCase();
    const list = EMPLOYEES.filter(e =>
      !kw ||
      e.name.toLowerCase().includes(kw) ||
      e.id.toLowerCase().includes(kw) ||
      e.dept.toLowerCase().includes(kw)
    );
    const host = $('#ctr-pick-list'); if (!host) return;
    host.innerHTML = !list.length
      ? `<div class="picker-empty">검색 결과가 없습니다.</div>`
      : list.map(e => {
          const meta = [e.id, e.dept, `${e.rank} · ${e.position || '-'}`, e.job, empTypeDisplay(e)].filter(Boolean).join(' · ');
          return `
            <div class="picker-item ${PICK.selectedId === e.id ? 'is-selected' : ''}" data-emp-id="${esc(e.id)}">
              ${empAvatar(e, 'sm')}
              <div class="picker-item__info">
                <div class="picker-item__name">${esc(e.name)}</div>
                <div class="picker-item__meta">${esc(meta)}</div>
              </div>
            </div>`;
        }).join('');
  }
  function bindEmpPickerModal() {
    const m = document.getElementById('modal-ctr-emppick'); if (!m) return;
    m.addEventListener('click', (e) => { if (e.target === m) closeAllModals(); });
    $('#ctr-pick-kw').addEventListener('input', (e) => {
      PICK.keyword = e.target.value;
      renderEmpPickerList();
    });
    $('#ctr-pick-list').addEventListener('click', (e) => {
      const it = e.target.closest('[data-emp-id]'); if (!it) return;
      PICK.selectedId = it.dataset.empId;
      renderEmpPickerList();
      $('[data-ctr-pick-confirm]').disabled = !PICK.selectedId;
    });
    $('#ctr-pick-list').addEventListener('dblclick', (e) => {
      const it = e.target.closest('[data-emp-id]'); if (!it) return;
      PICK.selectedId = it.dataset.empId; confirmEmpPick();
    });
    $('[data-ctr-pick-confirm]').addEventListener('click', confirmEmpPick);
  }
  function confirmEmpPick() {
    if (!PICK.selectedId) return;
    EDIT.emp = EMPLOYEES.find(e => e.id === PICK.selectedId) || null;
    /* 선택된 직원의 근무지로 자동 동기화 — 사용자가 따로 변경하지 않은 한 직원 마스터 따라감 */
    if (EDIT.emp && EDIT.emp.site) {
      EDIT.근무지 = EDIT.emp.site;
    }
    /* 인사정보카드(App.HRInfoMgmt) 의 기존 계약 정보 자동 prefill.
       있는 직원은 디폴트 값으로 채우고, 없는 직원은 빈값으로 둠 (수정 가능). */
    prefillFromInfoMgmt();
    /* 미리보기 본문 재생성 — prefill 된 폼 값으로 다시 렌더 */
    EDIT.body = TEMPLATES[EDIT.kind](currentFieldValues());
    /* emppick 만 닫고 편집 모달은 prefill 된 값으로 재렌더 */
    const pickerModal = document.getElementById('modal-ctr-emppick');
    if (pickerModal) pickerModal.classList.remove('is-open');
    renderEditorView(document.getElementById('modal-ctr-view'));
  }

  /* 선택된 직원의 인사정보카드 데이터로 EDIT 필드를 채움.
     - 근로계약서: 계약기간/근로유형/사원유형/직무/근무지/근무형태/근무시간/휴게시간/연차 일괄 prefill
     - 임금계약서: wageContractStart/End, baseSalary, jobAllowance, mealAllowance, payDay
     인사정보카드에 데이터가 없으면 빈값으로 두어 사용자가 직접 입력하게 함. */
  function prefillFromInfoMgmt() {
    if (!EDIT.emp) return;
    const list = (window.App && App.HRInfoMgmt && App.HRInfoMgmt.list)
      ? App.HRInfoMgmt.list() : [];
    const src = list.find(r => r.id === EDIT.emp.id);
    const fmt = (n) => (n === '' || n == null) ? '' : Number(n).toLocaleString();
    if (EDIT.kind === '근로계약서') {
      if (!src) {
        /* 인사정보 없음 — 빈값으로 reset */
        EDIT.startDate = ''; EDIT.endDate = ''; EDIT.indefinite = false;
        EDIT.empType = ''; EDIT.contractSubType = ''; EDIT.contractOut = false;
        EDIT.jobCat = ''; EDIT.job = ''; EDIT.site = '';
        EDIT.workSchedule = 'fixed';
        EDIT.shiftCode = ''; EDIT.shiftLabel = ''; EDIT.workHoursStr = '';
        EDIT.workTimeStart = ''; EDIT.workTimeEnd = '';
        EDIT.breakStart = ''; EDIT.breakEnd = '';
        EDIT.breakStart2 = ''; EDIT.breakEnd2 = '';
        EDIT.annualLeavePolicy = '근로기준법 및 취업규칙에 따름';
        EDIT.stdHoursDay = 8; EDIT.stdHoursWeek = 40; EDIT.stdHoursMonth = 209;
        return;
      }
      EDIT.startDate  = src.contractStartDate || src.joinDate || '';
      EDIT.endDate    = src.contractEndDate || '';
      EDIT.indefinite = src.empType === 'regular' && !src.contractEndDate;
      EDIT.empType         = src.empType || '';
      EDIT.contractSubType = src.contractSubType || '';
      EDIT.contractOut     = !!src.contractOut;
      /* 수습 — 정규직 + 수습 시 발급 근로계약서가 「기간제(수습기간)」 로 분기 */
      EDIT.probation       = !!src.probation;
      EDIT.probationStart  = src.probationStart || src.joinDate || '';
      EDIT.probationEnd    = src.probationEnd || '';
      EDIT.jobCat = src.jobCat || '';
      EDIT.job    = src.job    || '';
      EDIT.site   = src.site   || '';
      /* 근무 형태 — schedule legacy → fixed/shift 마이그레이션 */
      let ws = src.workSchedule || 'fixed';
      if (ws === 'schedule') ws = src.scheduleType === 'shift' ? 'shift' : 'fixed';
      EDIT.workSchedule  = ws;
      EDIT.shiftCode     = src.shiftCode     || '';
      EDIT.shiftLabel    = src.shiftLabel    || '';
      EDIT.workTimeStart = src.workTimeStart || '';
      EDIT.workTimeEnd   = src.workTimeEnd   || '';
      EDIT.breakStart    = src.breakStart    || '';
      EDIT.breakEnd      = src.breakEnd      || '';
      EDIT.breakStart2   = src.breakStart2   || '';
      EDIT.breakEnd2     = src.breakEnd2     || '';
      EDIT.annualLeavePolicy = src.annualLeavePolicy || '근로기준법 및 취업규칙에 따름';
      EDIT.stdHoursDay   = src.hoursPerDay   != null && src.hoursPerDay   !== '' ? src.hoursPerDay   : 8;
      EDIT.stdHoursWeek  = src.hoursPerWeek  != null && src.hoursPerWeek  !== '' ? src.hoursPerWeek  : 40;
      EDIT.stdHoursMonth = src.hoursPerMonth != null && src.hoursPerMonth !== '' ? src.hoursPerMonth : 209;
      /* 근무시간 표시 문자열 (편의용) */
      EDIT.workHoursStr  = (EDIT.workTimeStart && EDIT.workTimeEnd)
        ? `${EDIT.workTimeStart} ~ ${EDIT.workTimeEnd}` : '';
    } else {
      /* 임금계약서 — 인사정보카드의 임금계약 정보 편집 모달과 동일 항목 prefill.
         임금 유형은 사원 유형이 결정: 일용직 → 시급제 / 정규·계약직 → 연봉제. */
      const isDailyEmp = !!(EDIT.emp && EDIT.emp.empType === 'daily');
      if (!src) {
        EDIT.startDate = ''; EDIT.endDate = ''; EDIT.indefinite = false;
        EDIT.wageType = isDailyEmp ? 'hourly' : 'annual';
        EDIT.contractAmount = ''; EDIT.hourlyWage = '';
        EDIT.wageContractKind = 'fixedOT';
        EDIT.fixedOTHours = ''; EDIT.fixedOTRate = 1.5;
        EDIT.baseSalary = '';
        EDIT.fixedOTAmount = ''; EDIT.inclusiveOTAmount = '';
        EDIT.deductionPolicy = '근로기준법 및 취업규칙에 따름';
        EDIT.payDay = 10;
        return;
      }
      EDIT.startDate  = src.wageContractStartDate || src.contractStartDate || src.joinDate || '';
      /* 시작일 연동 — 신규 임금계약은 현재 적용 중(최신) 임금계약의 시작일을 기본값으로 채운다.
         (예: 최신 임금계약이 25/03/02 면 새 계약서 작성 시 시작일이 25/03/02 로 세팅됨. 사용자가 수정 가능) */
      const latestWage = latestContractOf(EDIT.emp.id, '임금계약서');
      if (latestWage && latestWage.startDate) EDIT.startDate = latestWage.startDate;
      /* 임금계약 무기(기간의 정함 없음) — 종료일 비움. 아니면 종료일 사용. */
      EDIT.indefinite = !!src.wageIndefinite;
      EDIT.endDate    = EDIT.indefinite ? '' : (src.wageContractEndDate || src.contractEndDate || '');
      /* 임금 유형 — 월급제(legacy)는 연봉제로, empType 로 최종 강제 */
      let wt = src.wageType || (isDailyEmp ? 'hourly' : 'annual');
      if (wt === 'monthly') wt = 'annual';
      if (isDailyEmp && wt !== 'hourly') wt = 'hourly';
      if (!isDailyEmp && wt === 'hourly') wt = 'annual';
      EDIT.wageType         = wt;
      EDIT.contractAmount   = src.contractAmount   != null && src.contractAmount !== '' ? fmt(src.contractAmount) : '';
      /* 시급제 기본 시급 — 저장값 우선, 없으면 계약금액(주휴 포함)에서 역산 */
      EDIT.hourlyWage       = src.hourlyWage != null && src.hourlyWage !== '' ? fmt(src.hourlyWage)
                            : (wt === 'hourly' && src.contractAmount ? fmt(Math.round(Number(src.contractAmount) / 1.2)) : '');
      EDIT.wageContractKind = (src.wageContractKind && src.wageContractKind !== 'general') ? src.wageContractKind : 'fixedOT';
      EDIT.fixedOTHours     = src.fixedOTHours     != null && src.fixedOTHours   !== '' ? src.fixedOTHours : '';
      EDIT.fixedOTRate      = src.fixedOTRate      != null && src.fixedOTRate    !== '' ? src.fixedOTRate  : 1.5;
      EDIT.baseSalary       = src.baseSalary       != null && src.baseSalary     !== '' ? fmt(src.baseSalary)       : '';
      EDIT.fixedOTAmount    = src.fixedOTAmount    != null && src.fixedOTAmount  !== '' ? fmt(src.fixedOTAmount)    : '';
      EDIT.inclusiveOTAmount = src.inclusiveOTAmount != null && src.inclusiveOTAmount !== '' ? fmt(src.inclusiveOTAmount) : '';
      EDIT.deductionPolicy  = src.deductionPolicy  || '근로기준법 및 취업규칙에 따름';
      EDIT.payDay           = src.payDay           != null && src.payDay         !== '' ? src.payDay : 10;
    }
  }

  /* =========================================================
   *  일괄 작성 모달 — 2-phase
   *
   *  Phase 1: 임직원 6컬럼 테이블에서 대상 직원 다중 선택
   *           (사번 / 성명 / 부서 / 직책 / 직위 / 재직상태 + checkbox)
   *  Phase 2: 선택 직원들을 13컬럼 inline-editable 테이블로 노출
   *           (사번 / 성명 / 계약기간 / 근로유형 / 사원유형 / 직무 / 근무지 /
   *            근무형태 / 근무일 / 휴일 / 근무시간 / 휴게시간 / 연차)
   *
   *  BULK.drafts[empId] 에 사용자 편집값을 누적 저장.
   *  근무 형태 '고정' 일 때 근무일 셀에 [근무조 선택] 버튼 노출 →
   *  선택 시 근무시간/휴게시간 자동 채움.
   * ========================================================= */
  const BULK = {
    phase: 1,
    kind: '근로계약서',
    keyword: '',
    deptId: 'C0',                 // 좌측 조직도 선택 부서 ('C0' = 전체)
    selectedIds: new Set(),
    drafts: {},
    single: false,                // true = 개별 작성용 단일 선택 모드 (선택 → 개별 편집기로)
    workDocType: null,            // 단일 모드 근로계약서 하위 종류 필터: 'permanent' | 'fixed' | null
    histOpen: new Set(),          // Phase 2에서 계약 이력 펼친 직원 id
    currentShiftPickEmpId: null,  // 행 단위 근무조 선택 모달 호출자 추적
  };

  /* 개별 작성 — 일괄 작성과 동일한 대상자 선택 테이블을 단일 선택 모드로 사용.
     선택 완료 시 Phase 2 대신 개별 계약서 편집기(미리보기)에 해당 직원을 적용한다. */
  function openBulkPickForIndividual() {
    BULK.single      = true;
    BULK.phase       = 1;
    BULK.kind        = EDIT.kind || '근로계약서';
    /* 근로계약서는 앞서 선택한 종류(정규직/기간제)에 맞춰 대상 직원 필터링. 임금계약서는 종류 없음. */
    BULK.workDocType = EDIT.kind === '근로계약서' ? (EDIT.workDocType || 'permanent') : null;
    BULK.keyword     = '';
    BULK.deptId      = 'C0';
    BULK.selectedIds = new Set();
    BULK.drafts      = {};
    BULK.histOpen    = new Set();
    document.querySelectorAll('#ctr-bulk-kind-tabs [data-ctr-bulk-kind]').forEach(b => {
      b.classList.toggle('is-active', b.dataset.ctrBulkKind === BULK.kind);
    });
    const kwEl = document.getElementById('ctr-bulk-kw');
    if (kwEl) kwEl.value = '';
    bindBulkModal();
    applyBulkPhase();
    /* 개별 편집기(modal-ctr-view) 위에 떠야 하므로 z-index 보정 + 단일 선택용으로 폭 축소 */
    const bm = document.getElementById('modal-ctr-bulk');
    if (bm) {
      bm.style.zIndex = '1300';
      const inner = bm.querySelector('.modal');
      if (inner) inner.style.maxWidth = '1040px';
      /* 조직도 패널 — 열 때마다 기본 접힘. 트랜지션을 잠깐 꺼서 모달 오픈 시 접힘 애니메이션이 보이지 않게 함 */
      const splitEl = bm.querySelector('#ctr-bulk-split');
      if (splitEl) {
        const prev = splitEl.style.transition;
        splitEl.style.transition = 'none';
        splitEl.classList.add('is-left-collapsed');
        void splitEl.offsetWidth;        /* reflow — 즉시 적용 후 트랜지션 복원 */
        splitEl.style.transition = prev || '';
      }
    }
  }

  /* 개별 작성 단일 선택 완료 → 선택 직원을 개별 계약서 편집기에 적용 (인사정보카드 데이터 prefill) */
  function confirmBulkSingle() {
    const id = Array.from(BULK.selectedIds)[0];
    if (!id) return;
    const m = document.getElementById('modal-ctr-bulk');
    if (m) m.classList.remove('is-open');
    BULK.single = false;
    EDIT.kind = BULK.kind || EDIT.kind || '근로계약서';
    let emp = EMPLOYEES.find(e => e.id === id);
    if (!emp) {
      const src = (window.App && App.HRInfoMgmt && App.HRInfoMgmt.list)
        ? App.HRInfoMgmt.list().find(r => r.id === id) : null;
      if (src) {
        emp = {
          id: src.id, name: src.name || ((src.fname || '') + (src.gname || '')),
          dept: src.dept, job: src.job, rank: src.rank, position: src.position,
          photoUrl: src.photoUrl, empType: src.empType, contractSubType: src.contractSubType || '',
          contractOut: !!src.contractOut, jobCat: src.jobCat, site: src.site,
        };
        EMPLOYEES.push(emp);
      }
    }
    EDIT.emp = emp || null;
    EDIT.previewHistId = null;
    if (EDIT.emp && EDIT.emp.site) EDIT.근무지 = EDIT.emp.site;
    prefillFromInfoMgmt();
    EDIT.body = TEMPLATES[EDIT.kind](currentFieldValues());
    renderEditorView(document.getElementById('modal-ctr-view'));
  }

  function openBulkModal() {
    BULK.single      = false;
    BULK.workDocType = null;
    /* 일괄(다중) 모드 — 단일 모드에서 축소했던 폭 원복 */
    const bmInner = document.querySelector('#modal-ctr-bulk .modal');
    if (bmInner) bmInner.style.maxWidth = '1700px';
    BULK.phase       = 1;
    BULK.kind        = '근로계약서';
    BULK.keyword     = '';
    BULK.deptId      = 'C0';
    BULK.selectedIds = new Set();
    BULK.drafts      = {};
    BULK.histOpen    = new Set();
    /* segmented tabs — 활성 탭 동기화 */
    document.querySelectorAll('#ctr-bulk-kind-tabs [data-ctr-bulk-kind]').forEach(b => {
      b.classList.toggle('is-active', b.dataset.ctrBulkKind === BULK.kind);
    });
    const kwEl = document.getElementById('ctr-bulk-kw');
    if (kwEl) kwEl.value = '';
    bindBulkModal();
    applyBulkPhase();
  }

  /* phase 1↔2 토글 — 헤더 타이틀 / 영역 / 푸터 버튼 노출 전환 */
  function applyBulkPhase() {
    const modal = document.getElementById('modal-ctr-bulk');
    if (!modal) return;
    const isPhase1 = BULK.phase === 1;
    const title    = modal.querySelector('#ctr-bulk-title');
    const phase1El = modal.querySelector('#ctr-bulk-phase1');
    const phase2El = modal.querySelector('#ctr-bulk-phase2');
    const nextBtn  = modal.querySelector('[data-ctr-bulk-next]');
    const backBtn  = modal.querySelector('[data-ctr-bulk-back]');
    const submit   = modal.querySelector('[data-ctr-bulk-submit]');
    const kwEl     = modal.querySelector('[data-ctr-bulk-phase1-only]');
    if (title)    title.textContent = BULK.single ? '대상 직원 선택'
                                    : (isPhase1 ? '계약서 일괄 작성' : `${BULK.kind} 일괄 작성`);
    if (phase1El) phase1El.style.display = isPhase1 ? 'flex' : 'none';
    if (phase2El) phase2El.style.display = isPhase1 ? 'none' : 'flex';
    if (nextBtn)  { nextBtn.style.display  = (isPhase1 && !BULK.single) ? '' : 'none'; nextBtn.textContent = '다음'; }
    /* 계약 유형 선택 바 — Phase 2(편집)·개별(단일) 모드에서는 숨김 (유형이 이미 결정됨) */
    const kindBar = modal.querySelector('[data-ctr-bulk-kindbar]');
    if (kindBar) kindBar.style.display = (isPhase1 && !BULK.single) ? '' : 'none';
    /* 헤더 카운트(총 N명 · 선택) — Phase 2 에서는 숨김 (선택 인원은 테이블 좌상단에 표시) */
    const counts = modal.querySelector('[data-ctr-bulk-counts]');
    if (counts) counts.style.display = isPhase1 ? '' : 'none';
    if (backBtn)  backBtn.style.display  = isPhase1 ? 'none' : '';
    if (submit)   submit.style.display   = isPhase1 ? 'none' : '';
    if (kwEl)     kwEl.style.display     = isPhase1 ? '' : 'none';
    if (isPhase1) renderBulkPhase1();
    else {
      const editCnt = modal.querySelector('[data-ctr-bulk-edit-count]');
      if (editCnt) editCnt.textContent = BULK.selectedIds.size;
      renderBulkPhase2();
    }
    if (!modal.classList.contains('is-open')) {
      modal.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    }
  }

  function bulkRowsSource() {
    /* 인사정보 관리(App.HRInfoMgmt) 의 재직중 직원만. fallback 으로 EMPLOYEES 사용. */
    const list = (window.App && App.HRInfoMgmt && App.HRInfoMgmt.list)
      ? App.HRInfoMgmt.list() : null;
    if (Array.isArray(list) && list.length) {
      return list.filter(r => r.status !== 'retired');
    }
    return EMPLOYEES.map(e => ({
      id: e.id, name: e.name, fname: (e.name || '').charAt(0), gname: (e.name || '').slice(1),
      nameFlip: false, dept: e.dept, rank: e.rank, position: e.position,
      empType: e.empType, contractSubType: e.contractSubType, contractOut: e.contractOut,
      jobCat: e.jobCat, joinDate: '2024-01-01', status: 'completed',
      photoUrl: e.photoUrl || '',
    }));
  }
  function bulkFilteredRows() {
    const kw = (BULK.keyword || '').trim().toLowerCase();
    let rows = bulkRowsSource();
    /* 좌측 조직도 — 선택 부서(자손 포함) 의 직원만 (전체 'C0' 면 미적용) */
    const HRI = window.App && App.HRInfoMgmt;
    if (BULK.deptId && BULK.deptId !== 'C0' && HRI && HRI.deptSubtreeIds && HRI.deptIdOf) {
      const ids = HRI.deptSubtreeIds(BULK.deptId);
      rows = rows.filter(r => ids.has(HRI.deptIdOf(r.dept)));
    }
    /* 개별(단일) 근로계약서 — 선택한 종류(정규직/기간제)에 해당하는 직원만 */
    if (BULK.workDocType) rows = rows.filter(r => matchesWorkDocType(r, BULK.workDocType));
    if (!kw) return rows;
    return rows.filter(r => {
      const nm = ((r.fname || '') + (r.gname || '')) || r.name || '';
      return nm.toLowerCase().includes(kw) || (r.id || '').toLowerCase().includes(kw);
    });
  }
  /* 성명 셀 — 사진 + 성명 + 부서·직책 (임직원 관리 성명 컬럼과 동일 패턴) */
  function bulkNameCell(r) {
    const photo = r.photoUrl || '';
    const av = photo
      ? `<img src="${esc(photo)}" alt="" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;" />`
      : `<span style="width:24px;height:24px;border-radius:50%;background:var(--color-active);color:var(--color-brand-primary);display:inline-flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;">${esc(bulkDisplayName(r).charAt(0))}</span>`;
    const dept = r.dept ? esc(r.dept) : '';
    const pos  = r.position ? esc(r.position) : '';
    const meta = (v) => v ? `<span style="color:var(--color-text-muted);font-size:11px;white-space:nowrap;">${v}</span>` : '';
    const dot  = (dept && pos) ? `<span style="color:var(--color-text-muted);font-size:11px;padding:0 2px;">·</span>` : '';
    return `
      <div style="display:flex;align-items:center;gap:8px;min-width:0;">
        ${av}
        <span style="font-weight:var(--fw-medium);white-space:nowrap;">${esc(bulkDisplayName(r))}</span>
        <span style="display:inline-flex;align-items:center;min-width:0;">${meta(dept)}${dot}${meta(pos)}</span>
      </div>`;
  }
  /* 좌측 조직도 렌더 — 임직원 관리(App.HRInfoMgmt)의 동일 트리 재사용 */
  function renderBulkTree() {
    const ul = document.getElementById('ctr-bulk-tree');
    if (!ul) return;
    const HRI = window.App && App.HRInfoMgmt;
    /* 대상 직원 선택 조직도 — 기본값 접기(collapsed). 루트만 펼친 채 시작 */
    ul.innerHTML = (HRI && HRI.deptTreeHTML) ? HRI.deptTreeHTML(BULK.deptId, { collapsed: true }) : '';
  }
  function bulkDisplayName(r) {
    if (r.name) return r.name;
    return r.nameFlip ? `${r.gname || ''}${r.fname || ''}` : `${r.fname || ''}${r.gname || ''}`;
  }
  function bulkStatusPill(r) {
    /* 일괄 작성 Phase 1 재직 상태 — 퇴사 / 재직 2분법.
       info-mgmt 의 'contractExpired' (계약직·일용직 자동 만료) 는 재직으로 머지. */
    if (r.status === 'retired') return '<span class="pill pill--soft-gray">퇴사</span>';
    return '<span class="pill pill--success">재직</span>';
  }

  /* 일괄 작성 대상 직원의 (등록 상태 × 계약 상태) — 인사정보카드와 동일 기준(단일 진실원).
     App.HRInfoMgmt.contractCellState 미로드 시 보수적으로 작성 가능(미등록·미서명) 처리. */
  function bulkCellState(r) {
    const kindKey = BULK.kind === '임금계약서' ? 'wage' : 'labor';
    let st;
    if (window.App && App.HRInfoMgmt && App.HRInfoMgmt.contractCellState) {
      st = App.HRInfoMgmt.contractCellState(r, kindKey);
    } else {
      st = { na:false,
        reg:{ code:'done', label:'등록완료', pill:'success' },
        ctr:{ code:'unsigned',     label:'미작성', pill:'warning' }, eligible:true };
    }
    /* 대상 직원 = 등록 상태 '등록완료' 인 직원만.
       (근로계약서 → 근로계약 정보 등록완료 / 임금계약서 → 임금계약 정보 등록완료)
       '등록중'·'미등록'·'변경승인 대기' 직원은 노출하지 않는다. */
    let eligible = !!st.eligible && st.reg && st.reg.code === 'done';
    /* 동일 유형의 서명 대기(signing) 계약이 이미 발송되어 있으면 작성 대상에서 제외 (중복 발송 방지) */
    if (eligible && STATE.rows.some(c => c.empId === r.id && c.kind === BULK.kind && c.status === 'signing')) {
      eligible = false;
    }
    return Object.assign({}, st, { eligible });
  }
  function bulkStatePill(s) {
    return `<span class="pill${s.pill ? ' pill--' + s.pill : ''}" style="font-size:11px;">${esc(s.label)}</span>`;
  }
  /* 근로계약서 종류 셀 — 기존 계약 상태로 종류 도출 (계약 상태 왼쪽 컬럼)
   *   미서명 → '-' (서명 요청 전) / 서명완료 → 정규직 / 만료·만료임박 → 기간제, + 미리보기 */
  function bulkDocTypeCell(r, st) {
    const code = st.ctr.code;
    if (code === 'unsigned') return '<span style="color:var(--color-text-muted);">-</span>';
    if (BULK.kind !== '근로계약서') return '<span style="font-size:12px;color:var(--color-text-sub);">임금계약서</span>';
    const type = code === 'signed' ? '정규직 근로계약서' : '기간제 근로계약서';
    return `<span style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap;">`
      + `<span style="font-size:12px;color:var(--color-text-sub);">${type}</span>`
      + `<button class="btn btn--xs" type="button" data-ctr-bulk-docpreview="${esc(r.id)}">미리보기</button>`
      + `</span>`;
  }
  /* 인사정보카드 근로 정보로 근로계약서 미리보기용 가상 row 합성 (서명 계약 row 없을 때 목업) */
  function buildMockContractRowForEmp(empId) {
    const src = (window.App && App.HRInfoMgmt && App.HRInfoMgmt.list)
      ? App.HRInfoMgmt.list().find(r => r.id === empId) : null;
    if (!src) return null;
    const reg = src.empType === 'regular';
    const indef = reg && !src.probation;   /* 정규직 무수습 = 무기(정규직 근로계약서) */
    const name = src.name || ((src.fname || '') + (src.gname || ''));
    const v = {
      회사명: COMPANY, 직원명: name, 사번: src.id,
      부서: src.dept, 직무: src.job, 직위: src.rank, 직책: src.position || '',
      고용구분: EMP_TYPE_LABEL[src.empType] || '',
      소속형태: src.contractOut ? '도급' : '-',
      직군: JOB_CAT_LABEL[src.jobCat] || '',
      시작일: src.contractStartDate || src.joinDate || '',
      종료일: indef ? '' : (src.contractEndDate || (reg && src.probation ? (src.probationEnd || '') : '')),
      무기: indef,
      근로계약서종류: indef ? '정규직 근로계약서' : '기간제 근로계약서',
      근무지: src.site || '성수동',
      근무형태: src.workSchedule === 'shift' ? '교대' : '고정',
      근무일: '월 ~ 금', 휴일: '토, 일',
      근무시간: (src.workTimeStart && src.workTimeEnd) ? `${src.workTimeStart} ~ ${src.workTimeEnd}` : '',
      휴게시간: '', 소정근로시간: '1일 8시간 · 1주 40시간 · 월 209시간',
      연차유급휴가: src.annualLeavePolicy || '근로기준법 및 취업규칙에 따름',
      shiftCode: src.shiftCode || '', 작성일: todayStr(),
    };
    return {
      kind: '근로계약서', empId: src.id, empName: name, empDept: src.dept,
      body: TEMPLATES['근로계약서'](v),
      gapSignedAt: nowStamp(), eulSignedAt: '',
    };
  }

  /* 대상 직원 선택 모달 — 근로계약서 미리보기 (자체 모달, picker 위).
     서명 계약 row 가 있으면 그것을, 없으면 인사정보카드 데이터로 목업 합성. */
  function openBulkDocPreview(empId) {
    const hist = empContractHistory(empId, '근로계약서');
    const row = hist[0] || buildMockContractRowForEmp(empId);
    if (!row) { window.toast && window.toast('미리볼 계약서가 없습니다.', 'info'); return; }
    let m = document.getElementById('ctr-bulk-docpreview');
    if (!m) {
      m = document.createElement('div');
      m.id = 'ctr-bulk-docpreview';
      m.className = 'modal-backdrop';
      m.style.zIndex = '1400';
      m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-dp-close]')) { m.classList.remove('is-open'); } });
      document.body.appendChild(m);
    }
    m.innerHTML = `
      <div class="modal modal--xl" style="width:96vw;max-width:880px;height:88vh;max-height:880px;display:flex;flex-direction:column;">
        <div class="modal__header">
          <div class="modal__title">${esc(row.kind)} 미리보기</div>
          <button class="modal__close" type="button" data-dp-close aria-label="닫기">✕</button>
        </div>
        <div class="modal__body" style="flex:1;min-height:0;overflow:auto;background:var(--color-surface-alt);padding:24px;display:flex;flex-direction:column;">
          <div class="doc-editor__paper is-readonly" style="font-family:inherit;max-width:760px;width:100%;margin:0 auto;">${renderContractHTML(row)}</div>
        </div>
        <div class="modal__footer"><button class="btn" type="button" data-dp-close>닫기</button></div>
      </div>`;
    m.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  /* Phase 1: 임직원 선택 테이블 — 등록 상태 / 계약 상태 노출 + 일괄 작성 자격 게이팅.
     자격 없는 행(해당없음 / 선행대기 / 변경승인 대기 / 서명진행중)은 체크박스 비활성. */
  function renderBulkPhase1() {
    renderBulkTree();
    renderBulkPhase1List();
  }
  /* 목록(데이터 영역)만 재렌더 — 조직도 트리는 그대로 두어 펼침/접힘 상태 보존 */
  function renderBulkPhase1List() {
    /* 작성 가능(등록 완료 등 자격 충족) 직원만 노출 — 비자격(회색) 행은 숨김.
       모든 노출 행이 자격 충족이므로 재직/등록 상태 컬럼은 생략하고 계약 상태만 표시. */
    const rows = bulkFilteredRows().filter(r => bulkCellState(r).eligible);
    const tbody = document.getElementById('ctr-bulk-body');
    if (!tbody) return;
    tbody.innerHTML = !rows.length
      ? `<tr><td colspan="5" style="text-align:center;color:var(--color-text-muted);padding:24px;">작성 가능한 직원이 없습니다.</td></tr>`
      : rows.map(r => {
          const st  = bulkCellState(r);
          const sel = BULK.selectedIds.has(r.id);
          /* 개별(단일) 모드 — 체크박스 없이 행 클릭으로 즉시 선택 */
          const firstCell = BULK.single ? '' : `<input type="checkbox" ${sel ? 'checked' : ''} />`;
          return `
            <tr data-ctr-bulk-row="${esc(r.id)}" class="${sel ? 'is-selected' : ''}${BULK.single ? ' is-clickable' : ''}" ${BULK.single ? 'style="cursor:pointer;"' : ''}>
              <td style="text-align:center;">${firstCell}</td>
              <td>${esc(r.id)}</td>
              <td>${bulkNameCell(r)}</td>
              <td>${bulkDocTypeCell(r, st)}</td>
              <td style="text-align:center;">${bulkStatePill(st.ctr)}</td>
            </tr>`;
        }).join('');
    const cnt = document.querySelector('[data-ctr-bulk-count]');
    if (cnt) cnt.innerHTML = `<strong>${rows.length}</strong>명`;
    const selSpan = document.querySelector('[data-ctr-bulk-sel]');
    if (selSpan) selSpan.textContent = BULK.selectedIds.size ? ` · 선택 ${BULK.selectedIds.size}명` : '';
    const nextBtn = document.querySelector('[data-ctr-bulk-next]');
    if (nextBtn) nextBtn.disabled = BULK.selectedIds.size === 0;
    const allCb = document.querySelector('[data-ctr-bulk-check-all]');
    if (allCb) {
      allCb.style.display = BULK.single ? 'none' : '';   /* 개별(단일) 모드 — 전체 선택 숨김 */
      allCb.checked = !BULK.single && rows.length > 0 && rows.every(r => BULK.selectedIds.has(r.id));
    }
  }

  /* 인사정보(App.HRInfoMgmt) → bulk draft 생성. 모든 신규 필드 prefill. */
  function buildBulkDraft(empRow) {
    const fmt = (n) => (n === '' || n == null) ? '' : Number(n).toLocaleString();
    let ws = empRow.workSchedule || 'fixed';
    if (ws === 'schedule') ws = empRow.scheduleType === 'shift' ? 'shift' : 'fixed';
    const d = {
      kind: BULK.kind,
      startDate: '', endDate: '', indefinite: false,
      /* 근로계약서 */
      empType: '', contractSubType: '', contractOut: false,
      jobCat: '', job: '', site: '',
      workSchedule: 'fixed',
      shiftCode: '', shiftLabel: '', workHoursStr: '',
      workTimeStart: '', workTimeEnd: '',
      breakStart: '', breakEnd: '',
      breakStart2: '', breakEnd2: '',
      annualLeavePolicy: '근로기준법 및 취업규칙에 따름',
      /* 임금계약서 (info-mgmt 임금계약 정보 편집 항목) */
      wageType: 'annual', contractAmount: '',
      wageContractKind: 'general',
      fixedOTHours: '', fixedOTRate: 1.5,
      baseSalary: '', fixedOTAmount: '', inclusiveOTAmount: '',
      deductionPolicy: '근로기준법 및 취업규칙에 따름',
      payDay: 10,
    };
    if (BULK.kind === '근로계약서') {
      d.startDate  = empRow.contractStartDate || empRow.joinDate || '';
      d.endDate    = empRow.contractEndDate || '';
      d.indefinite = empRow.empType === 'regular' && !empRow.contractEndDate;
      d.empType         = empRow.empType         || '';
      d.contractSubType = empRow.contractSubType || '';
      d.contractOut     = !!empRow.contractOut;
      d.jobCat = empRow.jobCat || '';
      d.job    = empRow.job    || '';
      d.site   = empRow.site   || '';
      d.workSchedule  = ws;
      d.shiftCode     = empRow.shiftCode     || '';
      d.shiftLabel    = empRow.shiftLabel    || '';
      d.workTimeStart = empRow.workTimeStart || '';
      d.workTimeEnd   = empRow.workTimeEnd   || '';
      d.workHoursStr  = (d.workTimeStart && d.workTimeEnd) ? `${d.workTimeStart} ~ ${d.workTimeEnd}` : '';
      d.breakStart    = empRow.breakStart    || '';
      d.breakEnd      = empRow.breakEnd      || '';
      d.breakStart2   = empRow.breakStart2   || '';
      d.breakEnd2     = empRow.breakEnd2     || '';
      d.annualLeavePolicy = empRow.annualLeavePolicy || '근로기준법 및 취업규칙에 따름';
    } else {
      d.startDate  = empRow.wageContractStartDate || empRow.contractStartDate || empRow.joinDate || '';
      d.endDate    = empRow.wageContractEndDate || empRow.contractEndDate || '';
      d.wageType         = empRow.wageType         || 'annual';
      d.contractAmount   = empRow.contractAmount   ? fmt(empRow.contractAmount)   : '';
      d.wageContractKind = empRow.wageContractKind || 'general';
      d.fixedOTHours     = empRow.fixedOTHours != null && empRow.fixedOTHours !== '' ? empRow.fixedOTHours : '';
      d.fixedOTRate      = empRow.fixedOTRate  != null && empRow.fixedOTRate  !== '' ? empRow.fixedOTRate  : 1.5;
      d.baseSalary       = empRow.baseSalary    ? fmt(empRow.baseSalary)    : '';
      d.fixedOTAmount    = empRow.fixedOTAmount ? fmt(empRow.fixedOTAmount) : '';
      d.inclusiveOTAmount = empRow.inclusiveOTAmount ? fmt(empRow.inclusiveOTAmount) : '';
      d.deductionPolicy  = empRow.deductionPolicy || '근로기준법 및 취업규칙에 따름';
      d.payDay           = empRow.payDay || 10;
    }
    return d;
  }

  /* Phase 2 — 성명 셀: 이름 클릭 시 인사정보카드 열기 (계약 이력은 카드 안에서 확인) */
  function bulkNameCardLink(empId, name) {
    return `<a href="javascript:;" data-ctr-bulk-empcard="${esc(empId)}" style="color:var(--color-brand-primary);font-weight:var(--fw-medium);">${esc(name || '-')}</a>`;
  }

  /* Phase 2: 선택 직원 인라인 편집 테이블 */
  function renderBulkPhase2() {
    const tbody = document.getElementById('ctr-bulk-edit-body');
    const thead = document.getElementById('ctr-bulk-edit-head');
    if (!tbody) return;
    /* 헤더 — kind 에 따라 컬럼 구성이 달라짐 */
    if (thead) {
      thead.innerHTML = BULK.kind === '임금계약서'
        ? `<tr>
            <th style="width:90px;">사번</th>
            <th style="width:110px;">성명</th>
            <th style="width:280px;">계약 기간</th>
            <th style="width:100px;">임금 유형</th>
            <th style="width:170px;">계약 금액</th>
            <th style="width:240px;">임금 계약 유형</th>
            <th style="width:160px;">월 기본급<br><small style="font-weight:var(--fw-regular);color:var(--color-text-muted);">(자동 산출)</small></th>
            <th style="width:160px;">월 시간외수당<br><small style="font-weight:var(--fw-regular);color:var(--color-text-muted);">(자동 산출)</small></th>
            <th style="width:170px;">월 고정연장수당</th>
            <th style="width:200px;">공제 안내</th>
            <th style="width:120px;">임금 지급일</th>
          </tr>`
        : `<tr>
            <th style="width:90px;">사번</th>
            <th style="width:110px;">성명</th>
            <th style="width:280px;">계약 기간</th>
            <th style="width:110px;">근로 유형</th>
            <th style="width:100px;">사원 유형</th>
            <th style="width:120px;">직무</th>
            <th style="width:130px;">근무지</th>
            <th style="width:110px;">근무 형태</th>
            <th style="width:170px;">근무일</th>
            <th style="width:90px;">휴일</th>
            <th style="width:160px;">근무시간</th>
            <th style="width:200px;">휴게시간</th>
            <th style="width:200px;">연차유급휴가</th>
          </tr>`;
    }
    const targets = Array.from(BULK.selectedIds);
    const allRows = bulkRowsSource();
    if (!targets.length) {
      tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;color:var(--color-text-muted);padding:24px;">선택된 직원이 없습니다.</td></tr>`;
      return;
    }
    /* 임금계약서 모드 — info-mgmt 임금계약 정보 편집 항목 기준 inline-editable 컬럼.
       11컬럼: 사번 / 성명 / 계약기간 / 임금유형 / 계약금액 / 임금계약유형(+고정OT 파라미터)
              / 월 기본급(자동) / 월 시간외수당(자동) / 월 고정연장수당 / 공제안내 / 지급일 */
    if (BULK.kind === '임금계약서') {
      const wageTypeOpts = (cur) => MASTER_WAGE_TYPES.map(([v,l]) =>
        `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('');
      const wageKindOpts = (cur) => MASTER_WAGE_KINDS.map(([v,l]) =>
        `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('');
      tbody.innerHTML = targets.map(empId => {
        const er = allRows.find(r => r.id === empId) || {};
        if (!BULK.drafts[empId]) BULK.drafts[empId] = buildBulkDraft(er);
        const d = BULK.drafts[empId];
        /* 행 초기 진입 시 자동 산출 1회 (prefill 된 계약금액 기준) */
        autoCalcBulkWageDraft(d);
        const isFixedOT  = d.wageContractKind === 'fixedOT';
        const isInclusive = d.wageContractKind === 'inclusive';
        const prefix = MASTER_WAGE_AMOUNT_PREFIX[d.wageType || 'annual'] || '연봉';
        return `
          <tr data-ctr-bulk-edit-row="${esc(empId)}">
            <td>${esc(er.id || empId)}</td>
            <td>${bulkNameCardLink(empId, bulkDisplayName(er))}</td>
            <td>
              <div style="display:flex;gap:6px;align-items:center;flex-wrap:nowrap;">
                <input class="input input--sm" type="date" data-ctr-bulk-f="startDate" value="${esc(d.startDate)}" style="width:128px;" />
                <span style="color:var(--color-text-muted);">~</span>
                <input class="input input--sm" type="date" data-ctr-bulk-f="endDate" value="${esc(d.endDate)}" style="width:128px;" />
              </div>
            </td>
            <td><select class="select select--sm" data-ctr-bulk-f="wageType" style="width:100%;">${wageTypeOpts(d.wageType || 'annual')}</select></td>
            <td>
              <div style="display:flex;gap:4px;align-items:center;">
                <span style="font-size:11px;color:var(--color-text-muted);min-width:24px;" data-ctr-bulk-amount-prefix>${esc(prefix)}</span>
                <input class="input input--sm" type="text" data-ctr-bulk-f="contractAmount" value="${esc(d.contractAmount)}" inputmode="numeric" style="flex:1;min-width:80px;text-align:right;" placeholder="0" />
                <span style="font-size:11px;color:var(--color-text-muted);">원</span>
              </div>
            </td>
            <td>
              <select class="select select--sm" data-ctr-bulk-f="wageContractKind" style="width:100%;">${wageKindOpts(d.wageContractKind || 'general')}</select>
              <div data-ctr-bulk-fot-params style="display:${isFixedOT ? 'flex' : 'none'};gap:6px;align-items:center;margin-top:4px;padding:6px 8px;background:#f8fafc;border:1px solid var(--color-divider);border-radius:4px;flex-wrap:nowrap;">
                <input class="input input--sm" type="text" inputmode="numeric" data-ctr-bulk-f="fixedOTHours" value="${esc(d.fixedOTHours)}" style="width:64px;text-align:right;flex-shrink:0;" placeholder="0" title="기준 시간(시)" />
                <span style="font-size:11px;color:var(--color-text-muted);flex-shrink:0;">시간 ×</span>
                <input class="input input--sm" type="text" inputmode="decimal" data-ctr-bulk-f="fixedOTRate" value="${esc(d.fixedOTRate)}" style="width:56px;text-align:right;flex-shrink:0;" placeholder="1.5" title="지급배율(배)" />
                <span style="font-size:11px;color:var(--color-text-muted);flex-shrink:0;">배</span>
              </div>
            </td>
            <td>
              <input class="input input--sm" type="text" data-ctr-bulk-f="baseSalary" data-ctr-bulk-base value="${esc(d.baseSalary)}" inputmode="numeric" style="width:100%;text-align:right;" placeholder="0" />
            </td>
            <td>
              <input class="input input--sm" type="text" data-ctr-bulk-f="fixedOTAmount" data-ctr-bulk-fot value="${esc(d.fixedOTAmount)}" inputmode="numeric" style="width:100%;text-align:right;${isFixedOT ? '' : 'background:var(--color-surface-alt);'}" placeholder="0" ${isFixedOT ? '' : 'disabled title="고정 OT 선택 시 사용"'} />
            </td>
            <td>
              <input class="input input--sm" type="text" data-ctr-bulk-f="inclusiveOTAmount" value="${esc(d.inclusiveOTAmount)}" inputmode="numeric" style="width:100%;text-align:right;${isInclusive ? '' : 'background:var(--color-surface-alt);'}" placeholder="0" ${isInclusive ? '' : 'disabled title="포괄임금 선택 시 사용"'} />
            </td>
            <td><input class="input input--sm" type="text" data-ctr-bulk-f="deductionPolicy" value="${esc(d.deductionPolicy)}" style="width:100%;" /></td>
            <td style="font-size:12px;color:var(--color-text);">매월 ${esc(d.payDay || 10)}일<br><span style="font-size:10px;color:var(--color-text-muted);">시스템 설정</span></td>
          </tr>`;
      }).join('');
      return;
    }
    /* 근로계약서 모드 — 13컬럼 inline-editable */
    const empTypeOpts = '<option value="">선택</option>' + MASTER_EMP_TYPES.map(([v,l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
    const jobCatOpts  = '<option value="">선택</option>' + MASTER_JOB_CATS.map(([v,l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
    const jobOpts     = '<option value="">선택</option>' + MASTER_JOBS.map(j => `<option value="${esc(j)}">${esc(j)}</option>`).join('');
    const siteOpts    = '<option value="">선택</option>' + MASTER_SITES.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    const wschOpts = `<option value="fixed">고정</option><option value="shift">교대</option>`;
    const selOpt = (html, val) => html.replace(`value="${esc(val)}"`, `value="${esc(val)}" selected`);
    tbody.innerHTML = targets.map(empId => {
      const er = allRows.find(r => r.id === empId) || {};
      if (!BULK.drafts[empId]) BULK.drafts[empId] = buildBulkDraft(er);
      const d = BULK.drafts[empId];
      const isFixed = d.workSchedule === 'fixed';
      const isShift = d.workSchedule === 'shift';
      const breakDisp = (() => {
        const b1 = (d.breakStart && d.breakEnd) ? `${d.breakStart} ~ ${d.breakEnd}` : '';
        const b2 = (d.breakStart2 && d.breakEnd2) ? `, ${d.breakStart2} ~ ${d.breakEnd2}` : '';
        return b1 ? b1 + b2 : '-';
      })();
      const workTimeDisp = (d.workTimeStart && d.workTimeEnd) ? `${d.workTimeStart} ~ ${d.workTimeEnd}` : '-';
      return `
        <tr data-ctr-bulk-edit-row="${esc(empId)}">
          <td>${esc(er.id || empId)}</td>
          <td>${bulkNameCardLink(empId, bulkDisplayName(er))}</td>
          <td>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:nowrap;">
              <input class="input input--sm" type="date" data-ctr-bulk-f="startDate" value="${esc(d.startDate)}" style="width:128px;" />
              <span style="color:var(--color-text-muted);">~</span>
              <input class="input input--sm" type="date" data-ctr-bulk-f="endDate" value="${esc(d.endDate)}" style="width:128px;" />
            </div>
          </td>
          <td><select class="select select--sm" data-ctr-bulk-f="empType" style="width:100%;">${selOpt(empTypeOpts, d.empType || '')}</select></td>
          <td><select class="select select--sm" data-ctr-bulk-f="jobCat"  style="width:100%;">${selOpt(jobCatOpts,  d.jobCat  || '')}</select></td>
          <td><select class="select select--sm" data-ctr-bulk-f="job"     style="width:100%;">${selOpt(jobOpts,     d.job     || '')}</select></td>
          <td><select class="select select--sm" data-ctr-bulk-f="site"    style="width:100%;">${selOpt(siteOpts,    d.site    || '')}</select></td>
          <td><select class="select select--sm" data-ctr-bulk-f="workSchedule" style="width:100%;">${selOpt(wschOpts, d.workSchedule || 'fixed')}</select></td>
          <td>
            <div style="display:flex;flex-direction:column;gap:2px;">
              <span style="font-size:12px;">월 ~ 금</span>
              <button type="button" class="btn btn--xs" data-ctr-bulk-shift-pick="${esc(empId)}" style="display:${isFixed ? 'inline-flex' : 'none'};">
                ${d.shiftCode ? `${esc(d.shiftCode)}조 변경` : '근무조 선택'}
              </button>
            </div>
          </td>
          <td style="text-align:center;font-size:12px;">토, 일</td>
          <td style="font-size:12px;">
            <span data-ctr-bulk-worktime style="display:${isFixed ? 'inline' : 'none'};">${esc(workTimeDisp)}</span>
            <span data-ctr-bulk-worktime-shift style="display:${isShift ? 'inline' : 'none'};color:var(--color-text-muted);">교대 근무표에 따름</span>
          </td>
          <td style="font-size:12px;">
            <span data-ctr-bulk-breaktime style="display:${isFixed ? 'inline' : 'none'};">${esc(breakDisp)}</span>
            <span data-ctr-bulk-breaktime-shift style="display:${isShift ? 'inline' : 'none'};color:var(--color-text-muted);">교대 근무표에 따름</span>
          </td>
          <td><input class="input input--sm" type="text" data-ctr-bulk-f="annualLeavePolicy" value="${esc(d.annualLeavePolicy)}" style="width:100%;" /></td>
        </tr>`;
    }).join('');
  }

  function bindBulkModal() {
    const modal = document.getElementById('modal-ctr-bulk');
    if (!modal || modal.dataset.bound) return;
    modal.dataset.bound = '1';
    /* 닫기(✕)·취소 버튼·오버레이(backdrop) — 전역 data-modal-close 핸들러가 없어 직접 닫는다. */
    const closeBulk = () => { modal.classList.remove('is-open'); document.body.style.overflow = ''; };
    modal.querySelectorAll('[data-modal-close]').forEach(b => b.addEventListener('click', closeBulk));
    modal.addEventListener('click', (e) => { if (e.target === modal) closeBulk(); });
    /* 계약 유형 segmented toggle — 탭 클릭 시 활성 상태 갱신 + drafts 리셋 + phase 재렌더 */
    modal.querySelectorAll('#ctr-bulk-kind-tabs [data-ctr-bulk-kind]').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.ctrBulkKind;
        if (v === BULK.kind) return;
        BULK.kind = v;
        BULK.drafts = {};
        /* 계약 유형이 바뀌면 작성 자격(등록/계약 상태)이 달라지므로 선택 초기화 */
        BULK.selectedIds = new Set();
        modal.querySelectorAll('#ctr-bulk-kind-tabs [data-ctr-bulk-kind]').forEach(b => {
          b.classList.toggle('is-active', b.dataset.ctrBulkKind === v);
        });
        applyBulkPhase();
      });
    });
    /* 조직도 패널 접기/펼치기 — 임직원 관리와 동일한 split--collapsible (is-left-collapsed) 토글.
       접으면 좌측이 0px 로 사라지고 우측 헤더의 작은 펼치기(›) 버튼만 노출 (CSS가 자동 처리). */
    const splitEl = modal.querySelector('#ctr-bulk-split');
    const collapseBtn = modal.querySelector('[data-ctr-tree-collapse]');
    if (collapseBtn) collapseBtn.addEventListener('click', () => splitEl && splitEl.classList.add('is-left-collapsed'));
    const expandBtn = modal.querySelector('[data-ctr-tree-expand]');
    if (expandBtn) expandBtn.addEventListener('click', () => splitEl && splitEl.classList.remove('is-left-collapsed'));

    /* Phase 1 좌측 조직도 — 부서 클릭 시 선택 + 대상 목록 필터 */
    const tree = modal.querySelector('#ctr-bulk-tree');
    if (tree) tree.addEventListener('click', (e) => {
      /* 셰브론 클릭 — 해당 노드만 펼치기/접기 (트리 재렌더 X → 상태 보존) */
      const tog = e.target.closest('.tree__toggle');
      if (tog) {
        const li = tog.closest('.tree__node');
        if (li && !li.classList.contains('is-leaf')) li.classList.toggle('is-open');
        return;
      }
      const node = e.target.closest('.tree__node');
      if (!node || !node.dataset.id) return;
      if (BULK.deptId === node.dataset.id) return;
      BULK.deptId = node.dataset.id;
      /* 선택 표시만 갱신 + 목록만 재렌더 — 트리 펼침 상태 유지 */
      tree.querySelectorAll('.tree__node.is-selected').forEach(n => n.classList.remove('is-selected'));
      node.classList.add('is-selected');
      renderBulkPhase1List();
    });
    /* Phase 1 검색 — 목록만 재렌더 (트리 펼침 상태 유지) */
    modal.querySelector('#ctr-bulk-kw').addEventListener('input', (e) => {
      BULK.keyword = e.target.value;
      if (BULK.phase === 1) renderBulkPhase1List();
    });
    /* Phase 1 행 체크박스 토글 */
    modal.querySelector('#ctr-bulk-body').addEventListener('change', (e) => {
      const cb = e.target.closest('input[type="checkbox"]'); if (!cb) return;
      const tr = cb.closest('[data-ctr-bulk-row]');           if (!tr) return;
      const id = tr.dataset.ctrBulkRow;
      /* 개별 작성(단일 선택) — 한 명만 선택되도록 기존 선택 해제 후 재렌더 */
      if (BULK.single) {
        BULK.selectedIds = new Set(cb.checked ? [id] : []);
        renderBulkPhase1();
        return;
      }
      if (cb.checked) BULK.selectedIds.add(id);
      else            BULK.selectedIds.delete(id);
      tr.classList.toggle('is-selected', cb.checked);
      const selSpan = document.querySelector('[data-ctr-bulk-sel]');
      if (selSpan) selSpan.textContent = BULK.selectedIds.size ? ` · 선택 ${BULK.selectedIds.size}명` : '';
      const nextBtn = document.querySelector('[data-ctr-bulk-next]');
      if (nextBtn) nextBtn.disabled = BULK.selectedIds.size === 0;
    });
    /* Phase 1 행 — 근로계약서 종류 셀의 [미리보기] (기존 서명 계약 미리보기) */
    modal.querySelector('#ctr-bulk-body').addEventListener('click', (e) => {
      const pv = e.target.closest('[data-ctr-bulk-docpreview]');
      if (pv) { e.stopPropagation(); openBulkDocPreview(pv.dataset.ctrBulkDocpreview); return; }
      /* 개별(단일) 모드 — 클릭 즉시 해당 직원 선택 → 개별 편집기 적용 */
      if (!BULK.single) return;
      if (e.target.closest('input, a, button, label')) return;
      const tr = e.target.closest('[data-ctr-bulk-row]'); if (!tr) return;
      BULK.selectedIds = new Set([tr.dataset.ctrBulkRow]);
      confirmBulkSingle();
    });
    /* Phase 1 전체 선택 — 작성 가능(eligible) 행만 대상. 개별(단일) 모드에서는 비활성 */
    modal.querySelector('[data-ctr-bulk-check-all]').addEventListener('change', (e) => {
      if (BULK.single) { e.target.checked = false; return; }
      const checked = e.target.checked;
      bulkFilteredRows().forEach(r => {
        if (!bulkCellState(r).eligible) return;
        if (checked) BULK.selectedIds.add(r.id);
        else         BULK.selectedIds.delete(r.id);
      });
      renderBulkPhase1();
    });
    /* Phase 전환 버튼 */
    modal.querySelector('[data-ctr-bulk-next]').addEventListener('click', () => {
      if (!BULK.selectedIds.size) return;
      if (BULK.single) { confirmBulkSingle(); return; }
      BULK.phase = 2;
      applyBulkPhase();
    });
    modal.querySelector('[data-ctr-bulk-back]').addEventListener('click', () => {
      BULK.phase = 1;
      applyBulkPhase();
    });
    modal.querySelector('[data-ctr-bulk-submit]').addEventListener('click', doBulkCreate);
    /* Phase 2 — 행 내 input/select 변경 사항 BULK.drafts 에 즉시 저장 */
    modal.querySelector('#ctr-bulk-edit-body').addEventListener('input',  handleBulkEditChange);
    modal.querySelector('#ctr-bulk-edit-body').addEventListener('change', handleBulkEditChange);
    modal.querySelector('#ctr-bulk-edit-body').addEventListener('click', (e) => {
      /* 성명 클릭 → 인사정보카드 (계약 이력은 카드 안에서 확인) */
      const cardLink = e.target.closest('[data-ctr-bulk-empcard]');
      if (cardLink) {
        const id = cardLink.dataset.ctrBulkEmpcard;
        const emp = (window.App && App.HRInfoMgmt && App.HRInfoMgmt.list)
          ? App.HRInfoMgmt.list().find(r => r.id === id) : null;
        if (emp && App.HRInfoCard && typeof App.HRInfoCard.open === 'function') {
          App.HRInfoCard.open(emp);
          /* 일괄 작성 모달(1000) 위에 카드가 보이도록 z-index 상향. 카드 내부 미리보기(1200)보다는 낮게. */
          const cm = document.getElementById('modal-empi-card');
          if (cm) cm.style.zIndex = '1100';
        }
        return;
      }
      const btn = e.target.closest('[data-ctr-bulk-shift-pick]');
      if (!btn) return;
      BULK.currentShiftPickEmpId = btn.dataset.ctrBulkShiftPick;
      openShiftPickForBulkRow();
    });
  }

  function handleBulkEditChange(e) {
    const tr = e.target.closest('[data-ctr-bulk-edit-row]');
    if (!tr) return;
    const empId = tr.dataset.ctrBulkEditRow;
    const d = BULK.drafts[empId]; if (!d) return;
    const target = e.target.closest('[data-ctr-bulk-f]');
    if (!target) return;
    const field = target.dataset.ctrBulkF;
    /* 금액 필드는 콤마 자동 포맷 — input value 와 캐럿 위치까지 동기화 */
    const MONEY_FIELDS = ['contractAmount','baseSalary','fixedOTAmount','inclusiveOTAmount'];
    if (MONEY_FIELDS.indexOf(field) >= 0 && target.tagName === 'INPUT') {
      const raw = String(target.value || '').replace(/[^\d]/g, '');
      const formatted = raw ? Number(raw).toLocaleString() : '';
      if (target.value !== formatted) {
        /* 캐럿 위치 유지 — 콤마 삽입 후 우측 길이 차이만큼 보정 */
        const caret = target.selectionStart || formatted.length;
        const diff  = formatted.length - target.value.length;
        target.value = formatted;
        try { target.setSelectionRange(caret + diff, caret + diff); } catch (_) {}
      }
      d[field] = formatted;
    } else {
      d[field] = target.value;
    }
    /* 근로계약서 — 근무 형태 변경 시 근무시간/휴게시간 셀 토글 + 교대 전환 시 근무조 값 클리어 */
    if (field === 'workSchedule') {
      if (d.workSchedule === 'shift') {
        d.shiftCode = ''; d.shiftLabel = ''; d.workHoursStr = '';
        d.workTimeStart = ''; d.workTimeEnd = '';
        d.breakStart = ''; d.breakEnd = '';
        d.breakStart2 = ''; d.breakEnd2 = '';
      }
      renderBulkPhase2();
      return;
    }
    /* 임금계약서 자동 산출 — 계약금액/임금유형/OT 파라미터 입력 시 기본급+시간외수당 갱신.
       임금계약유형 변경 시는 행 전체 재렌더 (fixedOT params / disabled 토글 필요). */
    if (BULK.kind === '임금계약서') {
      if (field === 'wageContractKind') {
        renderBulkPhase2();
        return;
      }
      if (['contractAmount','wageType','fixedOTHours','fixedOTRate'].indexOf(field) >= 0) {
        autoCalcBulkWageDraft(d);
        /* 행 안의 base/fot 표시값 동기화 (전체 재렌더 없이 입력 focus 유지) */
        const baseEl = tr.querySelector('[data-ctr-bulk-base]');
        if (baseEl && document.activeElement !== baseEl) baseEl.value = d.baseSalary || '';
        const fotEl = tr.querySelector('[data-ctr-bulk-fot]');
        if (fotEl && document.activeElement !== fotEl) fotEl.value = d.fixedOTAmount || '';
        /* 임금 유형 변경 시 prefix(연봉/월급) 텍스트도 갱신 */
        if (field === 'wageType') {
          const px = tr.querySelector('[data-ctr-bulk-amount-prefix]');
          if (px) px.textContent = MASTER_WAGE_AMOUNT_PREFIX[d.wageType] || '연봉';
        }
      }
    }
  }

  /* 임금계약서 bulk row 자동 산출 — info-mgmt / 개별 작성 editor 와 동일 산식.
       M = wageType==='annual' ? amount/12 : amount
       H = 209, W = (fixedOT) hours×rate / (그 외) 0
       baseAuto = M × H / (H + W),  fixedOTAuto = M × W / (H + W) */
  function autoCalcBulkWageDraft(d) {
    if (!d || d.kind !== '임금계약서') return;
    const wt = d.wageType || 'annual';
    const kind = d.wageContractKind || 'general';
    const amount = Number(String(d.contractAmount || '').replace(/[^0-9.-]/g, '')) || 0;
    if (!amount) return;
    const M = wt === 'annual' ? (amount / 12) : amount;
    const H = 209;
    let W = 0;
    if (kind === 'fixedOT') {
      const h = Number(d.fixedOTHours || 0);
      const r = Number(d.fixedOTRate  || 1.5);
      W = h * r;
    }
    const denom = H + W;
    const baseAuto = denom > 0 ? Math.round(M * H / denom) : Math.round(M);
    const otAuto   = denom > 0 ? Math.round(M * W / denom) : 0;
    d.baseSalary = baseAuto ? baseAuto.toLocaleString() : '';
    if (kind === 'fixedOT') {
      d.fixedOTAmount = otAuto ? otAuto.toLocaleString() : '';
    }
  }

  /* 행 단위 근무조 선택 — modal-empi-shift-pick 재사용 (ctr 컨텍스트 키).
     현재 선택 행은 BULK.currentShiftPickEmpId 로 추적. */
  function openShiftPickForBulkRow() {
    const list = (window.App && App.AttShifts && App.AttShifts.list) ? App.AttShifts.list() : [];
    const host = document.getElementById('empi-shift-pick-list');
    const modal = document.getElementById('modal-empi-shift-pick');
    if (!host || !modal) {
      window.toast && window.toast('근무조 마스터 모달을 불러올 수 없습니다.', 'danger');
      return;
    }
    if (!list.length) {
      host.innerHTML = `<p style="color:var(--color-text-muted);text-align:center;padding:24px 0;">등록된 근무조가 없습니다.</p>`;
    } else {
      const br1 = (s) => (s.breakStart && s.breakEnd) ? `${esc(s.breakStart)}~${esc(s.breakEnd)}` : '<span style="color:var(--color-text-muted);">-</span>';
      const br2 = (s) => (s.breakStart2 && s.breakEnd2) ? `${esc(s.breakStart2)}~${esc(s.breakEnd2)}` : '<span style="color:var(--color-text-muted);">-</span>';
      host.innerHTML = `
        <table class="tbl tbl--hover tbl--striped" style="width:100%;border-collapse:collapse;">
          <thead><tr>
            <th style="width:80px;text-align:center;">근무조</th>
            <th style="width:80px;text-align:center;">출근</th>
            <th style="width:80px;text-align:center;">퇴근</th>
            <th style="width:80px;text-align:center;">근무시간</th>
            <th style="text-align:center;">휴게시간1</th>
            <th style="text-align:center;">휴게시간2</th>
            <th style="width:80px;"></th>
          </tr></thead>
          <tbody>
            ${list.map(s => `
              <tr data-ctr-shift-pick-row="${esc(s.code)}" style="cursor:pointer;">
                <td style="text-align:center;font-weight:var(--fw-bold);color:var(--color-brand-primary);">${esc(s.code)}</td>
                <td style="text-align:center;">${esc(s.start)}</td>
                <td style="text-align:center;">${esc(s.end)}</td>
                <td style="text-align:center;">${esc(s.workHours || '-')}</td>
                <td style="text-align:center;">${br1(s)}</td>
                <td style="text-align:center;">${br2(s)}</td>
                <td style="text-align:center;"><button type="button" class="btn btn--xs btn--primary" data-ctr-shift-pick-confirm="${esc(s.code)}">선택</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;
    }
    /* 클릭 위임 — ctr 키. bulk 컨텍스트에서 호출됐을 때 applyShiftPickToBulkRow 로 분기 */
    if (!host.dataset.ctrBound) {
      host.dataset.ctrBound = '1';
      host.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-ctr-shift-pick-confirm]') || e.target.closest('[data-ctr-shift-pick-row]');
        if (!btn) return;
        const code = btn.dataset.ctrShiftPickConfirm || btn.dataset.ctrShiftPickRow;
        const shift = (window.App && App.AttShifts && App.AttShifts.get) ? App.AttShifts.get(code) : null;
        if (!shift) return;
        if (BULK.currentShiftPickEmpId) applyShiftPickToBulkRow(shift);
        else                            applyShiftPickToEditor(shift);
      });
    }
    modal.style.setProperty('z-index', '1450', 'important');   /* over-oc !important 를 이기려면 inline important */
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function applyShiftPickToBulkRow(shift) {
    const empId = BULK.currentShiftPickEmpId;
    if (!empId) return;
    const d = BULK.drafts[empId]; if (!d) return;
    d.shiftCode    = shift.code;
    d.shiftLabel   = shift.label || '';
    d.workHoursStr = shift.workHours || '';
    d.workTimeStart = shift.start;
    d.workTimeEnd   = shift.end;
    d.breakStart    = shift.breakStart  || '';
    d.breakEnd      = shift.breakEnd    || '';
    d.breakStart2   = shift.breakStart2 || '';
    d.breakEnd2     = shift.breakEnd2   || '';
    BULK.currentShiftPickEmpId = null;
    const m = document.getElementById('modal-empi-shift-pick');
    if (m) m.classList.remove('is-open');
    renderBulkPhase2();
    window.toast && window.toast(`${shift.code}조 — 근무·휴게시간 자동 채움`, 'success');
  }

  /* [선택 직원 일괄 발송] — Phase 2 BULK.drafts 기반 일괄 행 생성 + 인사정보카드 sync */
  function doBulkCreate() {
    if (!BULK.selectedIds.size) return;
    const targets = Array.from(BULK.selectedIds);
    const cnt = targets.length;
    if (!window.sweet) return doBulkCreateApply(targets);
    window.sweet({
      icon: 'confirm',
      title: '일괄 발송',
      text: `선택한 ${cnt}명에게 ${BULK.kind} 서명 요청 이메일을 발송합니다.\n발송 후에는 계약 내용을 수정할 수 없습니다.`,
      cancelText: '취소', confirmText: `${cnt}명에게 발송`,
      onConfirm: () => doBulkCreateApply(targets),
    });
  }
  function doBulkCreateApply(targets) {
    const today = todayStr();
    let createdCount = 0;
    const allRows = bulkRowsSource();
    targets.forEach((empId, idx) => {
      const empRow = allRows.find(r => r.id === empId);
      if (!empRow) return;
      const d = BULK.drafts[empId] || buildBulkDraft(empRow);
      const isIndef = d.kind === '근로계약서' && d.indefinite;
      if (!d.startDate || (!isIndef && !d.endDate)) {
        window.toast && window.toast(`${bulkDisplayName(empRow)} — 시작/종료일 누락 (건너뜀)`, 'warning');
        return;
      }
      /* 근로유형 라벨 + sub 표기 */
      const empTypeStr = (() => {
        if (!d.empType) return ({ regular:'정규직', contract:'계약직', daily:'일용직', outsourced:'도급직' })[empRow.empType] || '';
        const base = EMP_TYPE_LABEL[d.empType] || '정규직';
        return d.empType === 'contract' && d.contractSubType && CONTRACT_SUB_LABEL[d.contractSubType]
          ? `${base} (${CONTRACT_SUB_LABEL[d.contractSubType]})` : base;
      })();
      const b1 = (d.breakStart && d.breakEnd) ? `${d.breakStart} ~ ${d.breakEnd}` : '';
      const b2 = (d.breakStart2 && d.breakEnd2) ? `, ${d.breakStart2} ~ ${d.breakEnd2}` : '';
      const workTimeDisp = (d.workTimeStart && d.workTimeEnd) ? `${d.workTimeStart} ~ ${d.workTimeEnd}` : '';
      const v = {
        회사명: COMPANY, 직원명: bulkDisplayName(empRow), 사번: empRow.id,
        부서: empRow.dept || '', 직무: d.job || empRow.job || '', 직위: empRow.rank || '',
        직책: empRow.position || '',
        고용구분: empTypeStr,
        소속형태: (d.contractOut || empRow.contractOut) ? '도급' : '-',
        직군:    ({ office:'사무직', production:'생산직', research:'연구직' })[d.jobCat || empRow.jobCat] || '',
        시작일: d.startDate, 종료일: isIndef ? '' : d.endDate,
        무기: isIndef,
        근무지: d.site || empRow.site || '성수동',
        근무형태: d.workSchedule === 'shift' ? '교대' : '고정',
        근무일: '월 ~ 금', 휴일: '토, 일',
        근무시간: workTimeDisp, 휴게시간: b1 + b2,
        소정근로시간: '1일 8시간 · 1주 40시간 · 월 209시간',
        연차유급휴가: d.annualLeavePolicy || '근로기준법 및 취업규칙에 따름',
        shiftCode: d.shiftCode || '',
        /* 임금계약서 (info-mgmt 임금계약 정보 항목) */
        임금유형: MASTER_WAGE_AMOUNT_PREFIX[d.wageType] || '연봉',
        wageTypeKey: d.wageType || 'annual',
        계약금액: d.contractAmount,
        임금계약유형: ({ general:'일반', fixedOT:'고정 OT', inclusive:'포괄임금' })[d.wageContractKind] || '일반',
        wageContractKindKey: d.wageContractKind || 'general',
        fixedOTHours: d.fixedOTHours, fixedOTRate: d.fixedOTRate,
        월기본급: d.baseSalary,
        월시간외수당: d.fixedOTAmount,
        월고정연장근무수당: d.inclusiveOTAmount,
        공제안내: d.deductionPolicy || '근로기준법 및 취업규칙에 따름',
        지급일: `매월 ${d.payDay || 10}일`,
        작성일: today,
      };
      const body = TEMPLATES[d.kind](v);
      const stamp = nowStamp();
      const salaryBlock = d.kind === '임금계약서' ? {
        base: d.baseSalary || '',
        contractAmount: d.contractAmount || '',
        wageType: d.wageType || '',
        wageContractKind: d.wageContractKind || '',
        fixedOTAmount: d.fixedOTAmount || '',
        inclusiveOTAmount: d.inclusiveOTAmount || '',
        payday: `매월 ${d.payDay || 10}일`,
      } : { base: '', allowance: '', meal: '', payday: '' };
      const row = {
        id: makeContractId(empRow.id, today),
        kind: d.kind, mode: 'bulk',
        empId: empRow.id, empName: bulkDisplayName(empRow), empDept: empRow.dept || '',
        startDate: d.startDate, endDate: isIndef ? '' : d.endDate,
        indefinite: isIndef,
        status: 'signing', body,
        history: [
          { at: stamp, title: '계약서 작성', desc: `HR 담당자 ${HR_NAME}`, kind: '' },
          { at: stamp, title: '서명 요청 발송', desc: '이메일 발송 (HR ' + HR_NAME + ')', kind: '' },
        ],
        createdAt: today,
        registeredBy: HR_NAME,
        sentBy: HR_NAME, sentAt: stamp,
        gapSignedAt: stamp,
        salary: salaryBlock,
      };
      STATE.rows.unshift(row);
      createdCount++;
      syncToInfoMgmt(empRow.id, d, isIndef);
    });
    closeAllModals();
    applyFilter();
    renderTable();
    window.toast && window.toast(`${createdCount}건의 ${BULK.kind} 발송 완료`, 'success', 4500);
  }

  /* 계약 발송 시점에 인사정보카드(App.HRInfoMgmt) 의 해당 직원 행에 반영.
     - 근로계약서: contractStartDate / contractEndDate / contractSentDate / contractSentBy
     - 임금계약서: wageContractStartDate / wageContractEndDate / baseSalary 등
     contractLabor/contractWage 는 서명 완료 시점이 아닌 발송 시점이라 false 유지.
     데이터가 없으면 silent return. */
  function syncToInfoMgmt(empId, d, isIndef) {
    const list = (window.App && App.HRInfoMgmt && App.HRInfoMgmt.list)
      ? App.HRInfoMgmt.list() : null;
    if (!Array.isArray(list)) return;
    const src = list.find(r => r.id === empId);
    if (!src) return;
    const today = todayStr();
    const parseMoney = (s) => {
      if (s === '' || s == null) return '';
      const n = Number(String(s).replace(/[^\d]/g, ''));
      return isNaN(n) ? '' : n;
    };
    src.contractSentDate = today;
    src.contractSentBy   = HR_NAME;
    if (d.kind === '근로계약서') {
      src.contractStartDate = d.startDate || src.contractStartDate || '';
      src.contractEndDate   = isIndef ? '' : (d.endDate || src.contractEndDate || '');
      /* 신규 계약 정보 — 사용자 입력값으로 덮어쓰기 (개별 작성·일괄 작성 공통) */
      if (d.empType) src.empType = d.empType;
      if (d.contractSubType != null) src.contractSubType = d.contractSubType;
      if (d.contractOut != null) src.contractOut = !!d.contractOut;
      if (d.jobCat) src.jobCat = d.jobCat;
      if (d.job)    src.job    = d.job;
      if (d.site)   src.site   = d.site;
      else if (d.근무지) src.site = d.근무지; // legacy 호환
      if (d.workSchedule) src.workSchedule = d.workSchedule;
      if (d.shiftCode != null)  src.shiftCode  = d.shiftCode;
      if (d.shiftLabel != null) src.shiftLabel = d.shiftLabel;
      if (d.workTimeStart != null) src.workTimeStart = d.workTimeStart;
      if (d.workTimeEnd != null)   src.workTimeEnd   = d.workTimeEnd;
      if (d.breakStart != null)    src.breakStart    = d.breakStart;
      if (d.breakEnd != null)      src.breakEnd      = d.breakEnd;
      if (d.breakStart2 != null)   src.breakStart2   = d.breakStart2;
      if (d.breakEnd2 != null)     src.breakEnd2     = d.breakEnd2;
      if (d.annualLeavePolicy) src.annualLeavePolicy = d.annualLeavePolicy;
      /* 근로계약서 = 법정 기준 근무일/휴일 자동 적용.
         소정근로시간(hoursPerDay/Week/Month)은 「소정근로시간 정보」에서 별도 등록하므로 여기서 설정하지 않는다. */
      if (d.workSchedule === 'fixed' || d.workSchedule === 'shift') {
        src.workDays    = 'Mon,Tue,Wed,Thu,Fri';
        src.holidayDays = 'Sat,Sun';
      }
    } else {
      /* 임금계약서 — info-mgmt 임금계약 정보 편집 모달과 동일 항목 동기화 */
      src.wageContractStartDate = d.startDate || src.wageContractStartDate || '';
      /* 무기(기간의 정함 없음) 임금계약 — 종료일 비우고 무기 플래그 기록 (임금계약도 무기 지원) */
      src.wageIndefinite        = !!isIndef;
      src.wageContractEndDate   = isIndef ? '' : (d.endDate || src.wageContractEndDate || '');
      if (d.wageType) src.wageType = d.wageType;
      const amt = parseMoney(d.contractAmount);
      if (amt !== '') src.contractAmount = amt;
      if (d.wageContractKind) src.wageContractKind = d.wageContractKind;
      if (d.fixedOTHours != null && d.fixedOTHours !== '') src.fixedOTHours = Number(d.fixedOTHours);
      if (d.fixedOTRate  != null && d.fixedOTRate  !== '') src.fixedOTRate  = Number(d.fixedOTRate);
      const base = parseMoney(d.baseSalary);
      const fot  = parseMoney(d.fixedOTAmount);
      const inc  = parseMoney(d.inclusiveOTAmount);
      if (base !== '') src.baseSalary        = base;
      if (fot  !== '') src.fixedOTAmount     = fot;
      if (inc  !== '') src.inclusiveOTAmount = inc;
      if (d.deductionPolicy) src.deductionPolicy = d.deductionPolicy;
      /* 소득유형 — 근로소득 1종만 운영 */
      src.incomeType = 'earned';
      /* 지급일은 시스템 관리자만 설정 (편집 모달에서 read-only) — 변경 안 함 */
      /* 임금 — legacy 직무수당/식대 필드는 사용 안 함 (info-mgmt 모달 그림에 없음) */
    }
  }

  /* =========================================================
   *  VIEW: DETAIL (SCR-CTR-05) — 풀스크린 split
   * ========================================================= */
  function openDetailView(id) {
    const row = STATE.rows.find(r => r.id === id);
    if (!row) return;
    STATE.detailId = id;
    STATE.view = 'detail';
    /* Layer modal — 발령 상세와 동일 패턴. 본문은 modal__body 에 채움. */
    renderDetailView(document.getElementById('modal-ctr-view'));
    openCtrModal();
  }

  /** 진행 상황 — 처리 이력(과거) + 남은 단계(미래) 를 하나의 시퀀스로 통합 */
  function buildProgress(row) {
    const steps = [];

    // 1) 과거 이벤트 — history 그대로 (역순 아님, 시간순)
    row.history.forEach(h => {
      let state = 'done';
      if (/거부|무효 처리|회수|취소/.test(h.title)) state = 'error';
      steps.push({
        label: h.title,
        sub: dispStamp(h.at) + (h.desc ? ' · ' + h.desc : ''),
        state,
      });
    });

    // 2) 미래 단계 — 현재 status 기준 남은 워크플로우
    const remaining = remainingSteps(row.status);
    remaining.forEach((label, i) => {
      let sub = '';
      if (i === 0) {
        // 다음 단계는 'current' — 기한 안내 포함
        if (label === '직원 전자 서명')      sub = '대기 중 · 기한 ' + signDeadline(row);
        else if (label === '서명 요청 발송')   sub = '발송 대기';
      }
      steps.push({ label, sub, state: i === 0 ? 'current' : 'pending' });
    });

    return steps;
  }
  function remainingSteps(status) {
    /* 대표이사 최종 승인 단계 제거 — 서명 대기 → 서명 완료 2상 */
    return ({
      draft:    ['서명 요청 발송', '직원 전자 서명'],
      signing:  ['직원 전자 서명'],
      signed:   [],
      active:   [],
      expired:  [],
      voided:   [],
      rejected: [],
    })[status] || [];
  }
  function signDeadline(row) {
    const sent = (row.history.find(h => h.title === '서명 요청 발송') || {}).at;
    if (!sent) return '—';
    const d = new Date(sent.replace(' ', 'T'));
    d.setDate(d.getDate() + 7);
    return dispYmd(ymd(d));
  }

  /* 상세 — 임금계약서 '계약 정보' 요약 행.
   *   작성 화면(upsertEditDraft)이 저장하는 신(新) 임금 모델
   *   (임금유형·계약금액·월기본급·고정OT/포괄임금 수당)을 우선 표기해
   *   작성 화면 ↔ 상세 요약 ↔ 본문(tplWage) 표기를 일치시킨다.
   *   legacy mock(직무수당/식대) 데이터는 해당 필드가 없을 때만 fallback 표기. */
  const WAGE_CONTRACT_KIND_LABEL = { general: '일반', fixedOT: '고정 OT', inclusive: '포괄임금' };
  function wageInfoRows(salary) {
    if (!salary) return '';
    const r1  = (label, val) => `<div class="fm-tbl__row fm-tbl__row--1"><div class="fm-tbl__label">${esc(label)}</div><div class="fm-tbl__value">${val}</div></div>`;
    const won = (v) => { const s = formatNumberWithCommas(v); return s ? s + ' 원' : '-'; };
    /* 신 모델 판별 — 작성 화면이 저장하는 필드가 하나라도 있으면 신 모델로 렌더 */
    const isNew = !!(salary.contractAmount || salary.wageType || salary.wageContractKind
                    || salary.fixedOTAmount || salary.inclusiveOTAmount);
    if (isNew) {
      const prefix = MASTER_WAGE_AMOUNT_PREFIX[salary.wageType] || '연봉';
      const kind   = salary.wageContractKind || 'general';
      let h = '';
      h += r1(prefix, won(salary.contractAmount));
      h += r1('임금계약유형', esc(WAGE_CONTRACT_KIND_LABEL[kind] || '일반'));
      h += r1('월 기본급', won(salary.base));
      if (kind === 'fixedOT')   h += r1('월 시간외수당', won(salary.fixedOTAmount));
      if (kind === 'inclusive') h += r1('월 고정연장근무수당', won(salary.inclusiveOTAmount));
      h += r1('지급일', esc(salary.payday) || '-');
      return h;
    }
    /* legacy mock 모델 */
    return r1('기본급', won(salary.base))
         + r1('직무수당', won(salary.allowance))
         + r1('식대', won(salary.meal))
         + r1('지급일', esc(salary.payday) || '-');
  }

  function renderDetailView(modalEl) {
    /* modalEl 은 #modal-ctr-view. 본문은 #ctr-view-body, 푸터는 #ctr-view-footer. */
    const row = STATE.rows.find(r => r.id === STATE.detailId);
    if (!row) { goList(); return; }
    const isHR  = ROLE === 'hr';
    const isCEO = ROLE === 'ceo';
    const dday  = ddayBadge(row);
    const steps = buildProgress(row);

    const actBtns = [];
    if (isHR && row.status === 'draft') {
      /* [수정] 버튼이 [서명 요청 발송] 왼쪽 — 계약기간/조건 변경 필요 시 작성 화면으로 진입 */
      actBtns.push(`<button class="btn" type="button" data-ctr-d-edit>수정</button>`);
      actBtns.push(`<button class="btn btn--primary" type="button" data-ctr-d-send>서명 요청 발송</button>`);
    }
    if (['active','expired','voided'].includes(row.status))   actBtns.push(`<button class="btn" type="button" data-ctr-d-pdf>PDF 다운로드</button>`);
    if (isHR && row.status === 'signing')                     actBtns.push(`<button class="btn" type="button" data-ctr-d-recall>회수</button>`);
    if (isHR && row.status === 'signed')                      actBtns.push(`<button class="btn" type="button" data-ctr-d-cancelsign>서명 취소</button>`);
    if (isHR && row.status === 'active')                      actBtns.push(`<button class="btn btn--danger" type="button" data-ctr-d-void>무효화</button>`);

    // 데모 — 외부 사용자 화면 미리보기
    const demoBtns = [];
    if (row.status === 'signing') demoBtns.push(`<button class="btn btn--soft-primary" type="button" data-ctr-d-sign-preview title="직원이 이메일 링크로 받게 되는 서명 화면을 새 탭에서 엽니다.">직원 서명 화면 ↗</button>`);

    // 같은 직원의 다른 계약 (시간순 내림차순, 본 계약은 제외)
    const otherContracts = STATE.rows
      .filter(r => r.empId === row.empId && r.id !== row.id)
      .sort((a, b) => b.startDate.localeCompare(a.startDate));

    /* 모달 헤더 — 타이틀 갱신 */
    const titleEl = modalEl.querySelector('#ctr-view-title');
    if (titleEl) {
      titleEl.innerHTML = `${esc(row.empName)} · ${esc(row.kind)} <span style="margin-left:6px;">${statusPill(effectiveStatusCode(row))}</span>${dday ? ' ' + dday : ''}`;
    }

    /* 모달 푸터 — 닫기 + 액션 버튼들 */
    const footEl = modalEl.querySelector('#ctr-view-footer');
    if (footEl) {
      footEl.innerHTML = `
        <button class="btn" type="button" data-ctr-d-back>닫기</button>
        <span style="flex:1;"></span>
        ${demoBtns.join('')}
        ${actBtns.join('')}
      `;
      footEl.style.display = 'flex';
    }

    const pageEl = modalEl.querySelector('#ctr-view-body');
    if (!pageEl) return;
    pageEl.innerHTML = `
      <div class="split" style="--split-left:360px; height:100%;">
        <aside class="split__left">
          <div class="split__head"><h3>계약 정보</h3></div>
          <div class="split__body">

            <!-- 1. 계약 정보 -->
            <div class="fm-tbl fm-tbl--compact fm-tbl--bordered">
              <div class="fm-tbl__row fm-tbl__row--1"><div class="fm-tbl__label">계약번호</div><div class="fm-tbl__value">${esc(row.id)}</div></div>
              <div class="fm-tbl__row fm-tbl__row--1"><div class="fm-tbl__label">계약 유형</div><div class="fm-tbl__value">${esc(row.kind)}</div></div>
              <div class="fm-tbl__row fm-tbl__row--1"><div class="fm-tbl__label">직원</div><div class="fm-tbl__value">${esc(row.empName)} (${esc(row.empId)})</div></div>
              <div class="fm-tbl__row fm-tbl__row--1"><div class="fm-tbl__label">소속</div><div class="fm-tbl__value">${esc(row.empDept)}</div></div>
              <div class="fm-tbl__row fm-tbl__row--1"><div class="fm-tbl__label">계약 기간</div><div class="fm-tbl__value">${esc(periodText(row))}${row.indefinite ? ' <span class="pill pill--purple" style="margin-left:6px;">정규직</span>' : ''}</div></div>
              <div class="fm-tbl__row fm-tbl__row--1"><div class="fm-tbl__label">상태</div><div class="fm-tbl__value">${statusPill(effectiveStatusCode(row))}</div></div>
              ${row.kind === '임금계약서' ? wageInfoRows(row.salary) : ''}
            </div>

            <!-- 2. 진행 상황 -->
            <h3 style="margin-top:24px;padding-top:14px;border-top:1px solid var(--color-divider);font-size:var(--fs-md);font-weight:var(--fw-semibold);color:var(--color-text);margin-bottom:10px;">진행 상황</h3>
            <ol class="steps-v">
              ${steps.map(s => `
                <li class="steps-v__item ${s.state === 'done' ? 'is-done' : s.state === 'current' ? 'is-current' : s.state === 'error' ? 'is-error' : ''}">
                  <span class="steps-v__dot"></span>
                  <div class="steps-v__body">
                    <strong>${esc(s.label)}</strong>
                    ${s.sub ? `<small>${esc(s.sub)}</small>` : ''}
                  </div>
                </li>
              `).join('')}
            </ol>

            <!-- 3. 같은 직원의 다른 계약 -->
            ${otherContracts.length ? `
              <h3 style="margin-top:24px;padding-top:14px;border-top:1px solid var(--color-divider);font-size:var(--fs-md);font-weight:var(--fw-semibold);color:var(--color-text);margin-bottom:10px;">
                ${esc(row.empName)} 님의 다른 계약
                <span class="t-muted" style="font-size:var(--fs-xs);font-weight:var(--fw-regular);">(${otherContracts.length}건)</span>
              </h3>
              <div style="display:flex;flex-direction:column;gap:6px;">
                ${otherContracts.map(c => `
                  <a href="#" data-ctr-d-goto="${esc(c.id)}"
                     style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--color-divider);border-radius:var(--radius-md);background:var(--color-surface);font-size:var(--fs-sm);color:var(--color-text);text-decoration:none;">
                    <span style="font-size:var(--fs-xs);color:var(--color-text-muted);min-width:74px;">${esc(c.kind)}</span>
                    <span style="flex:1;color:var(--color-text-sub);font-size:var(--fs-xs);">${esc(periodText(c))}</span>
                    ${statusPill(effectiveStatusCode(c))}
                  </a>
                `).join('')}
              </div>
              <p class="t-muted" style="margin-top:8px;font-size:var(--fs-xs);line-height:1.5;">
                ※ 각 계약서는 독립된 법적 문서로 별도 보존됩니다.
              </p>
            ` : ''}
          </div>
        </aside>

        <section class="split__right">
          <div class="split__head">
            <h3>${esc(row.kind)} 본문</h3>
            <span class="t-muted" style="font-size:var(--fs-xs);">읽기 전용 (확정 시 PDF 다운로드)</span>
          </div>
          <div class="doc-editor">
            <div class="doc-editor__meta">
              <span>📄 ${esc(row.kind)}</span>
              <span class="t-muted">·</span>
              <span class="t-muted">${esc(row.id)}</span>
            </div>
            <div class="doc-editor__paper is-readonly" style="font-family:inherit;">${renderContractHTML(row)}</div>
          </div>
        </section>
      </div>
    `;

    /* bindDetailView 는 footer 의 버튼도 찾아야 하므로 modal 전체 전달 */
    bindDetailView(modalEl, row);
  }

  function bindDetailView(pageEl, row) {
    pageEl.querySelector('[data-ctr-d-back]').addEventListener('click', goList);

    const on = (sel, fn) => { const el = pageEl.querySelector(sel); if (el) el.addEventListener('click', fn); };

    on('[data-ctr-d-pdf]', () => {
      window.toast && window.toast('PDF 다운로드 (데모: 미구현)', 'info');
    });
    on('[data-ctr-d-edit]', () => {
      /* 초안 상태의 계약서를 작성 화면으로 진입해서 계약기간/조건 수정 */
      openEditor(row);
    });
    on('[data-ctr-d-send]', () => {
      window.sweet && window.sweet({
        icon: 'confirm', title: '서명 요청 발송',
        text: `${row.empName} 님에게 ${row.kind} 서명 요청 이메일을 발송합니다.\n` +
              `회사 인감이 자동 배치된 후 직원에게 발송되며, 이후에는 계약 내용을 수정할 수 없습니다.`,
        cancelText: '취소', confirmText: '발송',
        onConfirm: () => mutateAndRefresh(r => {
          r.status = 'signing';
          r.gapSignedAt = nowStamp();   // 발송과 동시에 회사 인감 배치
          r.sentBy = HR_NAME;
          r.sentAt = nowStamp();
          r.history.push({ at: nowStamp(), title: '서명 요청 발송', desc: '직원 이메일 발송 (HR ' + HR_NAME + ')', kind: '' });
          window.toast && window.toast(`서명 요청 발송 완료 — ${r.id}`, 'success');
        }),
      });
    });
    on('[data-ctr-d-recall]', () => {
      window.sweet && window.sweet({
        icon: 'confirm', title: '서명 요청 회수',
        text: '양 당사자 모두 미서명 시에만 회수할 수 있습니다. 회수 시 계약서는 초안 상태로 복귀합니다.',
        cancelText: '취소', confirmText: '회수',
        onConfirm: () => mutateAndRefresh(r => {
          r.status = 'draft';
          r.history.push({ at: nowStamp(), title: '서명 요청 회수', desc: 'HR 담당자 ' + HR_NAME, kind:'' });
          window.toast && window.toast('서명 요청이 회수되었습니다.', 'success');
        }),
      });
    });
    on('[data-ctr-d-cancelsign]', () => {
      window.sweet && window.sweet({
        icon: 'confirm', title: '직원 서명 취소',
        text: '직원 서명을 취소하시겠습니까? 상태가 「서명 대기」 로 복귀됩니다.',
        cancelText: '취소', confirmText: '서명 취소',
        onConfirm: () => mutateAndRefresh(r => {
          r.status = 'signing';
          r.eulSignedAt = '';
          r.eulSignName = '';
          r.history.push({ at: nowStamp(), title: '직원 서명 취소', desc: 'HR 담당자 ' + HR_NAME, kind: 'warning' });
          window.toast && window.toast('직원 서명이 취소되었습니다.', 'success');
        }),
      });
    });
    on('[data-ctr-d-void]', () => {
      $('#ctr-v-reason').value = '';
      $('[data-ctr-v-submit]').disabled = true;
      openModal('modal-ctr-void');
    });
    on('[data-ctr-d-sign-preview]', () => {
      injectPreview(row);
      window.open('contract-sign.html?id=' + encodeURIComponent(row.id), '_blank', 'noopener');
    });
    // "이 직원의 다른 계약" 링크 — 해당 계약 상세로 이동
    pageEl.querySelectorAll('[data-ctr-d-goto]').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        openDetailView(a.dataset.ctrDGoto);
      });
    });
  }

  function mutateAndRefresh(fn) {
    const row = STATE.rows.find(r => r.id === STATE.detailId);
    if (!row) return;
    fn(row);
    // 현재 detail 뷰 재렌더 (행 강조나 상태 칩 동기화)
    renderDetailView(document.getElementById('page-hr-contract'));
  }

  function injectPreview(row) {
    try {
      localStorage.setItem('ctr_preview_' + row.id, JSON.stringify({
        id: row.id, kind: row.kind,
        empId: row.empId, empName: row.empName, empDept: row.empDept,
        startDate: row.startDate, endDate: row.endDate,
        indefinite: !!row.indefinite,
        body: row.body || '',
        gapSignedAt:   row.gapSignedAt   || '',
        eulSignedAt:   row.eulSignedAt   || '',
        eulSignName:   row.eulSignName   || '',
        sentAt:        (row.history.find(h => h.title === '서명 요청 발송') || {}).at || '2026-05-10 09:30',
        signerName:    row.empName,
        signerAt:      row.eulSignedAt || '',
      }));
    } catch (e) {}
  }

  /* ============ 무효화 모달 ============ */
  function bindVoidModal() {
    const modal = document.getElementById('modal-ctr-void'); if (!modal) return;
    modal.querySelector('#ctr-v-reason').addEventListener('input', (e) => {
      $('[data-ctr-v-submit]').disabled = !e.target.value.trim();
    });
    modal.querySelector('[data-ctr-v-submit]').addEventListener('click', () => {
      const reason = $('#ctr-v-reason').value.trim();
      if (!reason) return;
      mutateAndRefresh(r => {
        r.status = 'voided';
        r.history.push({ at: nowStamp(), title: '계약 무효 처리', desc: '사유: ' + reason + ' (HR ' + HR_NAME + ')', kind:'danger' });
      });
      document.getElementById('modal-ctr-void').classList.remove('is-open');
      window.toast && window.toast('계약서가 무효 처리되었습니다.', 'success');
    });
  }

  /* ============ 모달 공통 ============ */
  function openModal(id) {
    const m = document.getElementById(id); if (!m) return;
    m.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeAllModals() {
    document.querySelectorAll('.modal-backdrop.is-open').forEach(m => m.classList.remove('is-open'));
    document.body.style.overflow = '';
  }
  function bindCommonModalClose() {
    ['modal-ctr-void','modal-ctr-emppick'].forEach(id => {
      const m = document.getElementById(id); if (!m) return;
      /* 오버레이(backdrop) 클릭 */
      m.addEventListener('click', (e) => { if (e.target === m) closeAllModals(); });
      /* 닫기(✕)·취소 버튼 (data-modal-close) — 전역 닫기 핸들러가 없어 직접 바인딩 */
      m.querySelectorAll('[data-modal-close]').forEach(b => b.addEventListener('click', closeAllModals));
    });
  }

  /* ============ 페이지 등록 ============ */
  function initContractPage() {
    const pageEl = document.getElementById('page-hr-contract');
    if (!pageEl) return;
    let built = false;
    pageEl.__onShow = () => {
      if (!built) {
        /* 외부 화면(임직원 등록 등)에서 이미 addRowFromExternal 로 추가된 계약이 있으면 보존.
           비어있을 때만 데모 mock 시드 (계약 관리 첫 진입 시 등록 계약이 지워지는 사고 방지) */
        if (!STATE.rows || !STATE.rows.length) STATE.rows = makeMock();
        bindVoidModal();
        bindEmpPickerModal();
        bindCommonModalClose();
        built = true;
      }
      /* 다른 화면(입사자 관리 2 등)에서 직원 + 계약 유형을 지정해 editor 로 진입 요청 시 */
      const pending = App.HRContract && App.HRContract.pendingEditor;
      if (pending) {
        App.HRContract.pendingEditor = null;
        openEditor({
          empId: pending.empId,
          kind: pending.kind,
          startDate: '',
          endDate: '',
          indefinite: false,
          id: null,
        });
        /* 호출 화면 컨텍스트 보존 — 작성 후 [목록] 클릭 시 호출 화면으로 돌아감 */
        EDIT.returnTo    = pending.returnTo || '';
        EDIT.returnEmpId = pending.returnEmpId || pending.empId || '';
        return;
      }
      // 탭 재진입 시 항상 list 부터 시작 (작성 중이던 내용은 임시저장으로만 보존)
      renderListView(pageEl);
      applyFilter();
      renderTable();
    };
  }

  const prev = App.initPages;
  App.initPages = function () {
    if (typeof prev === 'function') prev();
    initContractPage();
  };

  /* 다른 모듈에서 계약서 미리보기 / 템플릿을 재사용할 수 있도록 노출
   *   - 입사자 관리 2 의 계약·서류 패널에서 사용됨 */
  App.HRContract = {
    TEMPLATES,
    renderContractHTML,
    renderSignatureBlocks,
    COMPANY, COMPANY_REPR, COMPANY_SEAL, COMPANY_ADDR,
    HR_NAME,
    EMP_TYPE_LABEL, JOB_CAT_LABEL,
    money, sumMoney,
    todayStr, nowStamp,
    /* 직원별 서명 계약 이력 — 인사정보카드 「계약 이력」 섹션에서 사용.
       서명완료/만료(=서명 후 종료) 계약만. 각 항목에 미리보기 HTML 포함. */
    historyByEmp(empId) {
      const SIGNED = ['active', 'signed', 'expired'];
      return STATE.rows
        .filter(r => r.empId === empId && SIGNED.indexOf(r.status) >= 0)
        .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))
        .map(r => {
          const code = effectiveStatusCode(r);
          const meta = STATUS[code] || STATUS.draft;
          return {
            id: r.id, kind: r.kind, period: periodText(r),
            statusLabel: meta.label, statusPill: meta.pill || '',
            previewHTML: renderContractHTML(r),
          };
        });
    },
    /* 직원별 전체 계약 이력 — 인사정보카드 「근로/임금 계약 이력」 6컬럼 테이블에서 사용.
       초안(draft)만 제외하고 서명대기/서명완료/만료 등 모든 버전을 최신순으로 반환.
       (서명 요청 발송 즉시 'signing' 행이 만들어져 이력에 누적됨) */
    historyRowsByEmp(empId) {
      /* 계약 관리 페이지를 아직 방문 안 해 STATE.rows 가 비어 있어도 인사정보카드 이력이 보이도록 lazy 시드 */
      if (!STATE.rows || !STATE.rows.length) STATE.rows = makeMock();
      return STATE.rows
        .filter(r => r.empId === empId && r.status !== 'draft')
        .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || '')
                     || (b.createdAt || '').localeCompare(a.createdAt || ''))
        .map(r => {
          const code = effectiveStatusCode(r);
          const meta = STATUS[code] || STATUS.draft;
          return {
            id: r.id, kind: r.kind,
            startDate: r.startDate || '', endDate: r.endDate || '', indefinite: !!r.indefinite,
            period: periodText(r),
            statusLabel: meta.label, statusPill: meta.pill || '',
            registeredBy: r.registeredBy || '',
            createdAt: r.createdAt || '',
            /* 서명 대기(signing)만 취소 가능. 단 '임직원 등록 발송'(근로+임금 한 세트)은 개별 취소 불가 → 버튼 숨김 */
            canCancel: r.status === 'signing' && r.source !== '임직원 등록 발송',
            source: r.source || '',
            /* 임금계약서 — 연결된 근로계약 id (임금계약 이력의 '연결 근로계약' 컬럼 표기용) */
            linkedLaborId: r.linkedLaborId || '',
            previewHTML: renderContractHTML(r),
          };
        });
    },
    /* 서명 대기(signing) 계약 취소 — 인사정보카드 계약 이력의 [취소] 액션에서 호출.
       서명 완료·만료 등 다른 상태는 취소하지 않는다(방어). 취소 시 status='canceled'.
       반환: 취소 성공 여부(boolean). */
    cancelSigning(empId, id) {
      if (!STATE.rows || !STATE.rows.length) STATE.rows = makeMock();
      const r = STATE.rows.find(x => x.id === id && x.empId === empId);
      if (!r || r.status !== 'signing') return false;
      r.status = 'canceled';
      (r.history || (r.history = [])).push({ at: nowStamp(), title: '서명 요청 취소', desc: 'HR 담당자 ' + HR_NAME, kind: 'warning' });
      return true;
    },
    /* 금일 기준 '유효한' 근로 계약서 보유 여부 — 임금 계약서 작성 선행 조건 (실제 계약 이력 기준).
       유효 = 근로계약서 이력 중 서명완료(active/signed/만료 임박) + 오늘 계약기간 내(무기계약 또는 종료일 미도래).
       ※ contractLabor 같은 flag 가 아니라 실제 계약 이력(STATE.rows)을 진실원으로 판정한다.
         (근로 계약 이력이 하나도 없으면 false → 임금 계약서 작성 불가) */
    hasValidLaborContract(empId) {
      if (!STATE.rows || !STATE.rows.length) STATE.rows = makeMock();
      const today = todayStr();
      return STATE.rows.some(r => {
        if (r.empId !== empId || r.kind !== '근로계약서') return false;
        const code = effectiveStatusCode(r);
        if (code !== 'active' && code !== 'signed' && code !== 'expiringSoon') return false;
        if (!r.indefinite && r.endDate && r.endDate < today) return false;   // 만료 방어
        return true;
      });
    },
    /* 최신 임금 계약서 (서명 이력 기준) — 급여 정보 '정산 정보'의 임금 계약 연동 기간·상태 산출용.
       임금계약서 이력 중 서명완료(active/signed/만료)를 최신순 정렬해 첫 건 반환.
       반환: { id, startDate, endDate, indefinite, code, expired } | null
         · code    : effectiveStatusCode (active/expiringSoon/expired 등)
         · expired : 오늘 기준 만료 여부 (무기계약 제외 · 종료일 도과) */
    latestWageContract(empId) {
      if (!STATE.rows || !STATE.rows.length) STATE.rows = makeMock();
      const SIGNED = ['active', 'signed', 'expired'];   // 효력 발생했던(서명완료) 임금계약만
      const rows = STATE.rows
        .filter(r => r.empId === empId && r.kind === '임금계약서' && SIGNED.indexOf(r.status) >= 0)
        .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || '')
                     || (b.createdAt || '').localeCompare(a.createdAt || ''));
      if (!rows.length) return null;
      const r = rows[0];
      const code = effectiveStatusCode(r);
      const today = todayStr();
      const expired = (code === 'expired') || (!r.indefinite && !!r.endDate && r.endDate < today);
      return { id: r.id, startDate: r.startDate || '', endDate: r.endDate || '', indefinite: !!r.indefinite, code, expired };
    },
    /* 외부 화면(인사정보카드 등) 에서 서명요청 발송 시 STATE.rows 에 row 추가.
     *   spec: { emp, kind, startDate, endDate, indefinite, mode, status, salary }
     *     - emp: { id, name, dept, ... } 최소 식별자
     *     - kind: '근로계약서' | '임금계약서'
     *     - mode: 'individual' (기본) | 'bulk'
     *     - status: 기본 'signing' (이미 발송된 상태)
     *   STATE.rows.unshift 로 최신순 추가 + 계약 관리 진입 시 자동 노출. */
    addRowFromExternal(spec) {
      if (!spec || !spec.emp || !spec.kind) return null;
      const e = spec.emp;
      const empName = e.name || ((e.fname || '') + (e.gname || ''));
      const indefinite = !!spec.indefinite;
      const today = todayStr();
      const stamp = nowStamp();
      const v = {
        회사명: COMPANY, 직원명: empName, 사번: e.id,
        부서: e.dept || '', 직무: e.job || '', 직위: e.rank || '',
        직책: e.position || '',
        고용구분: { regular:'정규직', contract:'계약직', daily:'일용직', outsourced:'도급직' }[e.empType] || '',
        소속형태: e.contractOut ? '도급' : '-',
        직군:    ({ office:'사무직', production:'생산직', research:'연구직' })[e.jobCat] || '',
        시작일: spec.startDate || '', 종료일: indefinite ? '' : (spec.endDate || ''),
        무기: indefinite, 근무지: e.site || '성수동', 근무시간: '09:00 ~ 18:00',
        기본급: (spec.salary && spec.salary.base) || '',
        직무수당: (spec.salary && spec.salary.allowance) || '',
        식대:    (spec.salary && spec.salary.meal) || '',
        지급일:  (spec.salary && spec.salary.payday) || '',
        /* 임금계약서 급여(제3조) 표기용 — 임금 유형/계약금액/월 구성 (wageClauses 가 읽는 키) */
        wageTypeKey:         (spec.salary && spec.salary.wageType) || '',
        wageContractKindKey: (spec.salary && spec.salary.wageKind) || '',
        계약금액:            (spec.salary && spec.salary.contractAmount) || '',
        월기본급:            (spec.salary && spec.salary.base) || '',
        월시간외수당:        (spec.salary && spec.salary.fixedOT) || '',
        월고정연장근무수당:  (spec.salary && spec.salary.inclusiveOT) || '',
        시급:                (spec.salary && spec.salary.hourly) || '',
        주휴수당:            (spec.salary && spec.salary.holiday) || '',
        fixedOTHours:        (spec.salary && spec.salary.fixedOTHours) || '',
        작성일: today,
      };
      const body = (TEMPLATES[spec.kind] || tplWork)(v);
      const status = spec.status || 'signing';
      const history = [{ at: stamp, title: '계약서 작성', desc: spec.source || '인사정보카드 자동 작성', kind: '' }];
      if (status === 'signing') {
        history.push({ at: stamp, title: '서명 요청 발송', desc: spec.source || '인사정보카드에서 발송', kind: '' });
      }
      const row = {
        id: makeContractId(e.id, today),
        kind: spec.kind, mode: spec.mode || 'individual',
        empId: e.id, empName, empDept: e.dept || '',
        startDate: spec.startDate || '', endDate: indefinite ? '' : (spec.endDate || ''),
        indefinite,
        status, body, history,
        createdAt: today,
        registeredBy: spec.registeredBy || HR_NAME,
        sentBy: status === 'signing' ? (spec.sentBy || HR_NAME) : '',
        sentAt: status === 'signing' ? stamp : '',
        gapSignedAt: status === 'signing' ? stamp : '',
        salary: spec.salary || { base: '', allowance: '', meal: '', payday: '' },
        /* 발송 출처 — '임직원 등록 발송' 은 근로+임금 한 세트로 발송되므로 개별 취소 불가(취소 버튼 숨김). */
        source: spec.source || '',
        /* 임금계약서 → 연결된 근로계약 id. 임금계약은 근로계약에 의존하므로 어떤 근로계약 기준인지 보존.
           ※ 하나의 근로계약에 대해 임금계약을 여러 번 갱신 작성할 수 있다(동일 linkedLaborId 로 누적). */
        linkedLaborId: spec.linkedLaborId || '',
      };
      STATE.rows.unshift(row);
      /* 계약 관리 화면이 현재 활성 list view 면 즉시 재렌더 */
      if (STATE.view === 'list' && document.getElementById('ctr-list-body')) {
        applyFilter();
        renderTable();
      }
      return row;
    },
    /* 외부에서 editor 로 진입 — 호출 후 App.Nav.selectItem('hr-contract', ...) 으로 페이지 전환
     *   opts.returnTo: 작성 후 [목록] 클릭 시 돌아갈 화면 식별자 (예: 'newcomer-detail')
     *   opts.returnEmpId: 돌아갈 emp.id (생략 시 emp.id 사용) */
    startEditorForEmp(emp, kind, opts) {
      if (!emp || !emp.id) return;
      const o = opts || {};
      /* EMPLOYEES 에 없으면 newcomer 데이터를 가져와 합성 */
      if (!EMPLOYEES.find(e => e.id === emp.id)) {
        EMPLOYEES.push({
          id: emp.id,
          name: emp.name || ((emp.fname || '') + (emp.gname || '')),
          dept: emp.dept, job: emp.job, rank: emp.rank, position: emp.position,
          empType: emp.empType,
          contractSubType: emp.contractSubType || '',
          chotak: emp.contractSubType === 'chotak',
          contractOut: !!emp.contractOut,
          jobCat: emp.jobCat,
          colorIdx: emp.colorIdx || 1,
          email: emp.email,
        });
      }
      App.HRContract.pendingEditor = {
        empId: emp.id, kind: kind || '근로계약서',
        returnTo: o.returnTo || '',
        returnEmpId: o.returnEmpId || emp.id,
      };
    },
    /* 인사정보카드의 [서명 요청] 등 외부 호출자가 페이지 전환 없이
       계약서 작성 모달을 layer 로 띄우는 진입점. 호출 즉시 emp 가 EMPLOYEES 에 합성되고
       openEditor 가 실행되어 modal-ctr-view 가 다른 모달 위에 노출됨 (z-index 보정 포함).
       모든 필드는 prefillFromInfoMgmt 가 인사정보카드 데이터를 그대로 채움. */
    openEditorOverlay(emp, kind) {
      if (!emp || !emp.id) return;
      /* EMPLOYEES 합성 — 동일 로직 재사용 */
      if (!EMPLOYEES.find(e => e.id === emp.id)) {
        EMPLOYEES.push({
          id: emp.id,
          name: emp.name || ((emp.fname || '') + (emp.gname || '')),
          dept: emp.dept, job: emp.job, rank: emp.rank, position: emp.position,
          empType: emp.empType, contractSubType: emp.contractSubType || '',
          contractOut: !!emp.contractOut, jobCat: emp.jobCat,
          colorIdx: emp.colorIdx || 1, email: emp.email,
          site: emp.site, photoUrl: emp.photoUrl,
        });
      }
      const k = kind || '근로계약서';
      /* openEditor 가 EDIT.emp 를 EMPLOYEES.find 로 찾으므로 위 합성 후 안전하게 호출 가능.
         seedRow 로 empId 만 전달 — prefillFromInfoMgmt 가 인사정보카드의 모든 필드 자동 채움. */
      EDIT.kind = k;
      EDIT.mode = 'individual';
      EDIT.emp  = EMPLOYEES.find(e => e.id === emp.id) || null;
      EDIT.savedDraftId = null;
      EDIT.returnTo = 'empi-card';
      EDIT.returnEmpId = emp.id;
      /* 서명 요청 모달을 '취소/닫기'로 나가면 직전 계약 정보 설정 모달로 복귀시키기 위한 섹션 표시.
         (발송 성공 시에는 onSendForSign 이 이 값을 비워 복귀하지 않는다.) */
      EDIT.reopenSection = (k === '임금계약서') ? 'wage' : 'employment';
      /* 인사정보카드 측 [서명 요청] 진입 — 계약 유형이 이미 결정됐으므로 segmented 토글 숨김 */
      EDIT.lockedKind = true;
      /* 인사정보카드 fields 로 EDIT 전부 채움 (계약 시작일 ~ 연차 유급휴가) */
      prefillFromInfoMgmt();
      EDIT.body = TEMPLATES[k](currentFieldValues());
      STATE.view = 'editor';
      /* 모달 z-index 보정 — 이미 인사정보카드 모달이 열려있으면 그 위로 표시되도록 inline 적용.
         modal-empi-card (z 1000) → modal-ctr-view (z 1100) */
      const m = document.getElementById('modal-ctr-view');
      if (m) m.style.zIndex = '1200';
      renderEditorView(document.getElementById('modal-ctr-view'));
      openCtrModal();
    },
  };
})();
