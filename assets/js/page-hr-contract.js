/* =========================================================
 * Page: HR > 발령 및 계약 > 계약
 *   SCR-CTR-01 계약 목록 (체크박스 + 일괄 서명요청 발송)
 *   SCR-CTR-02 계약서 작성 (풀스크린 편집 — page-bar + split + doc-editor)
 *   SCR-CTR-05 계약서 상세 (풀스크린 split — 좌: 진행상황+이력+계약정보 / 우: 본문)
 *   + 직원 picker 모달
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
 *   .modal                              — picker 다이얼로그
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  /* ============ 현재 사용자 (데모) ============ */
  const ROLE = 'hr';
  const HR_NAME = '정혜진';
  const COMPANY = '주식회사 성원애드피아';
  const COMPANY_REPR = '윤성수'; // 대표이사
  const COMPANY_ADDR = '서울 강남구 테헤란로 100';
  const COMPANY_BIZNO = '201-81-86819'; // 사업자등록번호 — 용역계약서 위탁자 표기용

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
    /* 계약 상태 흐름
         서명 대기(signing) → 서명 완료(active) → 계약 완료(completed)
         서명 대기 / 서명 완료 단계에서는 [회수] 가능 → 회수 완료(withdrawn)
       draft 는 데모 시드/리스트에서 제외, signed 는 legacy 호환용 (목록에선 active 와 동일하게 표기). */
    /* 색상 규칙 — 대기(분홍) → 서명 완료(황) → 계약 완료(녹) / 종료·회수(회색) */
    draft:    { label: '초안',         pill: 'muted' },
    signing:  { label: '서명 대기',    pill: 'pink' },
    signed:   { label: '서명 완료',    pill: 'warning' },  // legacy → 서명 완료 와 동일 취급
    active:   { label: '서명 완료',    pill: 'warning' },
    completed:{ label: '계약 완료',    pill: 'success' },  // 서명 완료 건을 HR 이 최종 확정
    withdrawn:{ label: '회수 완료',    pill: 'muted' },    // 서명 대기/서명 완료 건을 HR 이 회수
    /* 파생 상태(저장 X) — 유효 계약이 종료 30일 이내일 때 effectiveStatusCode 가 부여 */
    expiringSoon: { label: '만료 임박', pill: 'danger' },
    rejected: { label: '반려',         pill: 'danger' },
    expired:  { label: '만료',         pill: 'muted' },
    voided:   { label: '무효',         pill: 'danger' },
    canceled: { label: '취소',         pill: 'muted' },   // 서명 대기(미서명) 계약을 HR 이 취소
  };
  const KINDS = ['근로계약서', '임금계약서'];

  /* ============ 계약 화면용 직원 표시 캐시 ============
   *   단일 직원 마스터 App.HRInfoMgmt 에서 계약 화면에 필요한 필드만 투영한다.
   *   원본 저장소가 아니며, 신규 계약 작성 대상 목록은 bulkRowsSource()에서 최신 마스터를 직접 조회한다.
   *   필드: id, name, dept, job, rank, position, empType, contractSubType, contractOut, jobCat, email
   *   contractSubType: '' (일반 계약직) | 'chotak' (촉탁) | 'intern' (인턴) — 계약직에만 적용
   *   colorIdx: 아바타 색 인덱스 (seed 기반 계산) — 공유 데이터에는 없으므로 여기서 부여
   *   원본 데이터가 없을 때를 위한 fallback 하드코딩은 독립 실행 방어용이다. */
  const EMPLOYEES = (function buildEmployees() {
    const members = (window.App && App.HRInfoMgmt && App.HRInfoMgmt.list)
      ? App.HRInfoMgmt.list()
      : [];
    if (!members.length) {
      /* fallback — hr-members-data 미로드 케이스 (방어용, 일반적으로 발생 안 함) */
      return [
        { id:'SW260101', name:'김지훈', dept:'경영지원본부', job:'인사', rank:'사원', position:'팀원', empType:'regular', contractSubType:'', contractOut:false, jobCat:'office', colorIdx:2, email:'kim.jh@swadpia.co.kr' },
      ];
    }
    /* 전 직원 투영 — 계약 관리는 재직 전원을 다루므로 상한을 넉넉히 둔다(과거 slice(0,14) 로 신규 시드 직원이 누락됨) */
    const list = members.slice(0, 60).map((m, i) => ({
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
      photoUrl: m.photoUrl || '',   /* 목록 아바타 — 없으면 이니셜로 대체 */
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
  const EMP_TYPE_LABEL = { regular: '정규직', contract: '계약직', freelancer: '프리랜서', daily: '일용직' };
  const CONTRACT_SUB_LABEL = { chotak: '촉탁', intern: '인턴' };
  const JOB_CAT_LABEL  = { office: '사무직', production: '생산직', research: '연구직' };
  function empTypeDisplay(e) {
    if (!e) return '';
    const base = EMP_TYPE_LABEL[e.empType] || '';
    const sub = e.empType === 'contract' && CONTRACT_SUB_LABEL[e.contractSubType];
    return sub ? `${base} (${sub})` : base;
  }
  /* 계약 유형 표기 — 문서 종류명(docTitle)이 있으면 그것을, 없으면 kind 를 노출.
     임직원 등록에서 발송한 계약은 근로유형별 문서명('정규직 수습 근로계약서' 등)을 그대로 보여준다.
     검색 필터(계약 유형)는 kind 기준이라 분류는 그대로 유지된다. */
  function kindDisplay(r) { return (r && (r.docTitle || r.kind)) || ''; }
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

  /** 'YYYY-MM-DD' → 'YYYY년 M월 D일' — 연봉계약서·용역계약서 본문 표기(양식 원문 형식). */
  function dateK(s) {
    const m = String(s || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return '____년 __월 __일';
    return `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일`;
  }
  /** 지급일 문자열에서 일자만 추출 (없으면 10일) */
  function payDayOf(v) { return (String(v.지급일 || '').match(/\d+/) || ['10'])[0]; }

  /* ============ 계약서 양식 공통 조각 (계약서 양식.xlsx 5개 시트 공통 문구) ============ */
  const CIRCLED = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫'];
  /** 내용 확인 및 동의 (서명) — 조항 하단 우측 확인란 */
  const CONFIRM = `<p class="doc-paper__confirm">내용 확인 및 동의 <em></em> (서명)</p>`;

  /** 근로시간·휴게시간 표.
   *  withShift=true : 교대조 컬럼 포함 (근로계약서 / 수습계약서)
   *  withShift=false: 시업·종업·휴게 3열     (촉탁직 / 시급제계약서) */
  function workTimeTable(v, withShift) {
    const shift = v.근무형태 === '교대';
    const wt = splitWorkTime(v.근무시간);
    const st  = shift ? '교대 근무표에 따름' : (wt[0] || '_____');
    const et  = shift ? '' : (wt[1] || '_____');
    const brk = v.휴게시간 || '12:00 ~ 13:00';
    if (!withShift) {
      return `<table class="doc-paper__tbl doc-paper__tbl--center">
  <thead><tr><th>시업시각</th><th>종업시각</th><th>휴게시간</th></tr></thead>
  <tbody><tr><td>${esc(st)}</td><td>${esc(et)}</td><td>${esc(brk)}</td></tr></tbody>
</table>`;
    }
    return `<table class="doc-paper__tbl doc-paper__tbl--center">
  <thead><tr><th>교대조</th><th>시업시각</th><th>종업시각</th><th>휴게시간</th></tr></thead>
  <tbody>
    <tr><td>주간조</td><td>${esc(st)}</td><td>${esc(et)}</td><td>${esc(brk)}</td></tr>
    ${shift ? `<tr><td>야간조</td><td colspan="3">교대 근무표에 따름</td></tr>` : ''}
  </tbody>
</table>`;
  }

  /** 근로계약의 해지 — 해지 사유 5개 호 + 자동면직 주석 (계약서 양식 4종 공통) */
  const TERMINATION_REASONS = `
<p class="doc-paper__cl">&nbsp;&nbsp;1. 업무수행능력이 현저히 부족하거나 업무를 태만히 한 때(계약기간 중 '갑'은 '을'의 업무적격성을 평가한다)</p>
<p class="doc-paper__cl">&nbsp;&nbsp;2. 고의 또는 중대한 과실로 회사에 손해를 입혔을 때</p>
<p class="doc-paper__cl">&nbsp;&nbsp;3. 업무(량)의 변화, 사업의 종료 등의 사유로 계약의 해지가 불가피한 때</p>
<p class="doc-paper__cl">&nbsp;&nbsp;4. 입사시 제출한 학력이나 경력이 허위인 것으로 밝혀졌을 때</p>
<p class="doc-paper__cl">&nbsp;&nbsp;5. 기타 사회통념상 근로관계의 계속이 곤란한 사유가 있는 때</p>
<p class="doc-paper__note">※ 계속 5일 이상 또는 월 합계가 7일 이상 결근한 경우, 근로의사가 없는 것으로 간주 징계 절차없이 자동면직 한다.</p>`;

  /** 준수사항 / 비밀유지의무 2개 호 (계약서 양식 4종 공통) */
  const COMPLIANCE_ITEMS = `
<p class="doc-paper__cl">'을'은 다음 각 호의 사항을 엄수하여야 하며, 이를 위반할 경우 계약기간 중에라도 해고될 수 있다.</p>
<p class="doc-paper__cl">&nbsp;&nbsp;1. '을'은 직무 중 지득한 '갑'의 영업 기밀, 기타 사업과 관련된 주요 정보를 제3자에게 누설하여서는 아니된다.</p>
<p class="doc-paper__cl">&nbsp;&nbsp;2. '을'은 자신의 연봉액에 대한 기밀을 유지하여야 하며, 타인의 연봉액을 알게 될 경우 회사의 승인없이 제3자에게 유출하여서는 아니된다.</p>`;

  /** 계약의 변경 / 손해배상 / 기타의 근로조건 + 보관 문구 (계약서 양식 4종 공통 말미) */
  function closingClauses(art) {
    return `${art('계약의 변경')}
<p class="doc-paper__cl">'갑'은 계약기간 중 계약 내용을 변경하여야 할 중대하고 명백한 사정이 있는 경우 '을'과의 협의로 근로계약의 내용을 변경할 수 있다.</p>

${art('손해배상')}
<p class="doc-paper__cl">'을'이 고의 또는 중대한 과실로 '갑'에게 손해를 끼친 경우 '을'은 이를 배상하여야 한다.</p>

${art('기타의 근로조건')}
<p class="doc-paper__cl">본 계약에서 정하지 아니한 사항에 대하여는 노동관계법령 및 취업규칙의 내용에 따른다.</p>

<p class="doc-paper__cl">본 계약서는 근로자와 사용자가 날인한 후 '갑'과 '을'이 각 1부씩 보관한다.</p>`;
  }

  /** 근로자 인적사항 표 — 양식 원문 구조(성명 / 개인연락처 / 주민등록 No. / 주소) */
  function personTable(v) {
    return `<table class="doc-paper__tbl doc-paper__tbl--party">
  <tr><th>성　명</th><td>${esc(v.직원명) || ''}</td><th>개인연락처</th><td></td><th>주민등록 No.</th><td></td></tr>
  <tr><th>주　소</th><td colspan="5"></td></tr>
</table>`;
  }

  /** 급여 조항 렌더 — 근로/수습/촉탁직 계약서의 「급여」 조 및 임금계약서 공용.
   *  계약서 양식.xlsx 급여 조 구조: (①임금계약기간) ①총연봉 ②총월봉+구성표(기본급/연장근로수당/
   *  기타수당/월임금합계·산정식) ③지급 ④원천징수 ⑤결근공제 ⑥일할계산.
   *  시급제(일용직)는 tplDaily 가 시급·주휴수당 구성으로 별도 렌더한다.
   *  opts.wagePeriod: true 면 선두에 임금계약기간 항을 추가 (수습·촉탁직 양식). */
  function wageClauses(v, opts) {
    opts = opts || {};
    let _n = 0;
    const no = () => CIRCLED[_n++] || '';
    const isHourly    = v.wageTypeKey === 'hourly';
    const isInclusive = v.wageContractKindKey === 'inclusive';
    const payDay = payDayOf(v);
    let rows;
    let headLines = '';
    if (opts.wagePeriod) {
      const ws = esc(v.시작일) || '____-__-__';
      const we = esc(v.임금종료일 || v.종료일) || '____-__-__';
      headLines += `<p class="doc-paper__cl">${no()} '을'의 임금계약기간은 ${ws} ~ ${we} 로 한다.</p>\n`;
    }
    if (isHourly) {
      rows = `
    <tr><th>시급</th><td>${money(v.시급)}</td><td>기본 시급</td></tr>
    <tr><th>주휴수당</th><td>${money(v.주휴수당)}</td><td>시급 × 20%</td></tr>
    <tr class="is-total"><th>계약 시급</th><td>${money(v.계약금액)}</td><td>주휴수당 포함</td></tr>`;
      headLines += `<p class="doc-paper__cl">${no()} '을'의 임금은 시급제로 하며, 임금의 구성은 다음과 같다.</p>`;
    } else {
      const baseAmt = v.월기본급;
      const otAmt   = isInclusive ? v.월고정연장근무수당 : v.월시간외수당;
      const otHours = v.fixedOTHours ? `${esc(v.fixedOTHours)}h` : '29h';
      const otNote  = isInclusive ? `포괄임금 (시급 × ${otHours} × 1.5)` : `시급 × ${otHours} × 1.5`;
      const monthlyTotal = sumMoney(baseAmt, otAmt);
      rows = `
    <tr><th>기본급</th><td>${money(baseAmt)}</td><td>시급 × 209</td></tr>
    <tr><th>연장근로수당</th><td>${money(otAmt)}</td><td>${otNote}</td></tr>
    <tr><th>기타수당</th><td>-</td><td></td></tr>
    <tr class="is-total"><th>월임금합계</th><td>${monthlyTotal}</td><td></td></tr>`;
      headLines += `<p class="doc-paper__cl">${no()} '을'의 총연봉액은 <strong>${money(v.계약금액)}</strong> 원 이며, 이를 매월 지급한다.</p>
<p class="doc-paper__cl">${no()} '을'의 총월봉액은 <strong>${monthlyTotal}</strong> 원 이며, 월급여의 구성은 다음과 같다.</p>`;
    }
    return `${headLines}
<table class="doc-paper__tbl doc-paper__tbl--wage">
  <thead><tr><th>항목</th><th>금액 (원)</th><th>산정식</th></tr></thead>
  <tbody>${rows}
  </tbody>
</table>
<p class="doc-paper__cl">${no()} 급여는 매월 1일부터 말일까지를 산정기간으로 하여, 익월 ${esc(payDay)}일(휴일인 경우 익일)에 '을' 본인명의의 계좌로 지급한다.</p>
<p class="doc-paper__cl">${no()} 월 급여 지급시 근로소득세 및 건강보험료, 국민연금, 고용보험 등의 제세공과금을 원천징수한 후 지급한다.</p>
<p class="doc-paper__cl">${no()} 결근일 및 지각, 조퇴, 임의외출 등으로 근무하지 않은 시간에 대해서는 무급을 원칙으로 하며, 해당 시간 및 일에 대한 임금을 공제할 수 있다.</p>
<p class="doc-paper__cl">${no()} 중도입사, 퇴사, 휴직, 복직 등으로 월급여 산정기간을 만근하지 못할 경우 전체 산정대상 기간 일수에 대한 근무일수를 일할계산하여 급여를 지급한다.</p>`;
  }

  /* ============================================================
   *  근로계약서 — 계약서 양식.xlsx 「근로계약서」 시트
   *    적용: 정규직 전환 근로계약서 · 계약직 근로계약서
   *  급여(제4조)는 v.임금포함 이 true 일 때만 본문에 포함된다.
   *  조 번호는 art() 카운터로 부여해 급여 조항 포함 여부와 무관하게 항상 연속된다.
   * ============================================================ */
  function tplWork(v) {
    const docTitle = v.근로계약서종류
      || (((v.고용구분 || '').indexOf('정규직') >= 0 && v.무기) ? '정규직 근로계약서' : '기간제 근로계약서');
    const start = esc(v.시작일) || '____-__-__';
    const end   = esc(v.종료일) || '____-__-__';
    const period = v.무기
      ? `① '을'의 근로계약기간은 ${start} 부터 <strong>기한의 정함이 없는 근로계약</strong>을 체결한 것으로 한다.`
      : `① '을'의 근로계약기간은 ${start} ~ ${end} 로 한다.`;
    /* 제1조 ② 임금계약기간 — 원문 근로계약서 시트에 항상 존재하는 항이라 생략하지 않는다.
       근로계약이 무기(정규직 전환)여도 임금계약기간은 유한하게 정하며(매년 갱신),
       임금종료일이 없으면 근로계약 종료일 → 그것도 없으면 빈칸으로 노출해 미지정 사실이 드러나게 한다. */
    const wagePeriodEnd = esc(v.임금종료일) || (v.무기 ? '____-__-__' : end);
    let _artNo = 0;
    const art = (title) => `<h3 class="doc-paper__art">제${++_artNo}조 (${title})</h3>`;
    /* 소정근로시간 문구 — 일용직(1주 근로일수 지정)과 일반(주 40시간)을 분기 */
    const stdDay  = v.소정1일   || 8;
    const stdWeek = v.소정1주   || 40;
    const stdDays = v.소정주일수 || '';
    const stdText = stdDays
      ? `근로시간은 1일 ${esc(stdDay)}시간, 1주 ${esc(stdDays)}일을 소정근로로 한다.`
      : `근로시간은 일 ${esc(stdDay)}시간, 주 ${esc(stdWeek)}시간을 원칙으로 한다.`;
    return `
<h2 class="doc-paper__title">${esc(docTitle)}</h2>

<p class="doc-paper__intro">「${esc(v.회사명) || '_______'}」(이하 '갑'이라 한다)는 근로자 「${esc(v.직원명) || '_______'}」(이하 '을'이라 한다)과(와) 아래와 같은 내용으로 근로계약을 체결한다.</p>
<p class="doc-paper__divider">■　　아　　래　　■</p>

${art('근로계약기간')}
<p class="doc-paper__cl">${period}</p>
${v.무기 ? '' : `<p class="doc-paper__note">※ 계약직의 경우 별도의 계약 갱신이 이루어지지 않는 한 상기 근로계약기간의 만료로 근로관계가 자동 종료된다.</p>`}
<p class="doc-paper__cl">② '을'의 임금계약기간은 ${start} ~ ${wagePeriodEnd} 로 한다.</p>
<p class="doc-paper__note">※ 새로운 임금계약이 체결되기 전까지 자동 갱신된다.</p>

${art('근무장소 및 직종')}
<p class="doc-paper__cl">① '을'의 근무장소 및 직종은 <strong>${esc(v.근무지) || '_______'} / ${esc(v.부서) || '_______'}</strong> (으)로 한다.</p>
<p class="doc-paper__cl">② '갑'은 업무상 필요에 따라 '을'의 근무장소 및 직종을 변경할 수 있으며, '을'은 정당한 이유없이 이를 거부할 수 없다.</p>

${art('근로시간')}
<p class="doc-paper__cl">① ${stdText}</p>
<p class="doc-paper__cl">② '을'의 기본 근로시간 및 휴게시간은 다음과 같으며, 시차출퇴근제 적용자는 회사가 지정하는 범위에서 근로자가 시업시각과 종업시각을 선택할 수 있다. 이 경우에도 휴게시간은 원칙적으로 12~13시로 한다.</p>
${workTimeTable(v, true)}
<p class="doc-paper__cl">③ '갑'은 업무상 스케줄 필요에 따라 근무시간을 조정(시업 및 종업시간, 휴게시간, 단축 및 연장)할 수 있으며, '을'은 주 12시간 한도 내에서 시간외 근로를 요구할 수 있다.</p>
${CONFIRM}
<p class="doc-paper__cl">④ 시간외 근로는 회사의 지시와 승인을 받은 시간만을 인정하며, 임의적인 시간외근로는 근로시간으로 인정하지 아니한다.</p>
<p class="doc-paper__cl">⑤ 승인없이 소정근무일에 휴무를 하는 경우 사유불문하고 무단 결근으로 처리되며, 무단결근 3회 누적시 징계처리 될 수 있다.</p>
${CONFIRM}

${v.임금포함 ? `${art('급여')}
${wageClauses(v)}
` : ''}
${art('퇴직금')}
<p class="doc-paper__cl">① '을'의 계속근로연수가 1년 이상인 경우 '을'의 퇴직시에 계속근로연수 1년에 대하여 30일분의 평균임금을 퇴직금으로 지급한다.</p>
<p class="doc-paper__cl">② 전항의 퇴직급여와 관련하여 근로자 퇴직급여보장법 상의 요건에 따라 퇴직연금제를 도입하여 운영할 수 있다.</p>
<p class="doc-paper__cl">③ '갑'은 퇴직금 등 근로관계에서 발생한 일체의 금품을 '을'의 퇴직 후 14일 이내에 지급하도록 한다.</p>

${art('휴일')}
<p class="doc-paper__cl">① 근로자의 날 및 주휴일, 「관공서의 공휴일에 관한 규정」에 따른 공휴일 및 대체공휴일을 유급휴일로 하며, 주휴일은 1주간 소정의 근로일을 개근한 경우 부여한다.</p>
<p class="doc-paper__cl">② 매주 토요일은 무급휴일로 한다.</p>

${art('연차휴가')}
<p class="doc-paper__cl">1년 이내에 퇴직시 1개월 만근시 1일의 연차휴가를 산정(근로기준법 제60조 2항)하는 바, 이와 더불어 부여한 연차일수(회계년도기준 비례부여일수)는 총연차휴가일수에서 공제하며, 이미 초과 사용한 일수는 퇴직시 임금에서 공제한다.</p>
<p class="doc-paper__note">※ 1년 이상 근무의 경우도 퇴사시 입사일 기준으로 산정된 연차휴가보다 초과부여·사용시 동일 적용함.</p>
${CONFIRM}

${art('근로계약의 해지')}
<p class="doc-paper__cl">① '갑'은 '을'이 다음 각 호에 해당하는 때에는 근로계약기간 중이라도 중도에 해지할 수 있다.</p>
${TERMINATION_REASONS}
<p class="doc-paper__cl">② '갑'이 '을'과의 근로계약을 중도에 해지하고자 하는 경우 30일 이전에 예고하여야 하며, 계약의 해지(해고)에 대해 그 사유와 시기를 명시하여 서면으로 통보하여야 한다.</p>
<p class="doc-paper__cl">③ '을'이 계약기간 도중 사직하고자 하는 경우 최소 30일 전에 근로계약의 해지의사(사직원)를 '갑'에게 제출하여 승인을 받도록 하며, 업무인수인계에 지장이 없도록 협조하여야 하며, 이로 인해 손해가 발생한 경우 이를 배상하여야 한다.</p>
${CONFIRM}
<p class="doc-paper__cl">④ '을'은 퇴직 시 지급물품 및 비품(출입카드, 법인카드, 사무용품 등)을 퇴직 당일 회사에 반납하여야 하며, 기타 '을'의 일방적인 계약 해지로 '갑'에게 손해가 발생한 경우 이를 배상하여야 한다.</p>
${CONFIRM}

${art('준수사항')}
${COMPLIANCE_ITEMS}

${closingClauses(art)}

<h3 class="doc-paper__art">근로자 인적사항</h3>
${personTable(v)}

<p class="doc-paper__signdate">${dateK(v.작성일 || todayStr())}</p>

[[SIGNATURES]]`;
  }

  /* ============================================================
   *  수습(계약) 계약서 — 계약서 양식.xlsx 「수습계약서」 시트
   *    적용: 정규직 수습 근로계약서
   *  근로계약서와의 차이 — 제8조가 「수습기간 및 근로계약의 해지」 로 확장되어
   *  수습기간(3개월) 운영·수습평가 점수 기준(70/60점)·중도해지 절차를 담는다.
   * ============================================================ */
  function tplProbation(v) {
    const docTitle = v.근로계약서종류 || DOC_TITLES.probation;
    const start = esc(v.시작일) || '____-__-__';
    const end   = esc(v.종료일) || '____-__-__';
    const months = v.수습개월 || 3;
    let _artNo = 0;
    const art = (title) => `<h3 class="doc-paper__art">제${++_artNo}조 (${title})</h3>`;
    const stdDay  = v.소정1일 || 8;
    const stdWeek = v.소정1주 || 40;
    return `
<h2 class="doc-paper__title">${esc(docTitle)}</h2>

<p class="doc-paper__intro">「${esc(v.회사명) || '_______'}」(이하 '갑'이라 한다)는 근로자 「${esc(v.직원명) || '_______'}」(이하 '을'이라 한다)과(와) 아래와 같은 내용으로 근로계약을 체결한다.</p>
<p class="doc-paper__divider">■　　아　　래　　■</p>

${art('근로계약기간')}
<p class="doc-paper__cl">① '을'의 근로계약기간은 ${start} ~ ${end} 로 한다.</p>
<p class="doc-paper__note">※ 상기 기간은 수습기간이며, 수습기간 만료 시 평가 결과에 따라 기간의 정함이 없는 근로계약으로 전환된다.</p>
<p class="doc-paper__cl">② '을'의 임금계약기간은 ${start} ~ ${esc(v.임금종료일) || end} 로 한다.</p>

${art('근무장소 및 직종')}
<p class="doc-paper__cl">① '을'의 근무장소 및 직종은 <strong>${esc(v.근무지) || '_______'} / ${esc(v.부서) || '_______'}</strong> (으)로 한다.</p>
<p class="doc-paper__cl">② '갑'은 업무상 필요에 따라 '을'의 근무장소 및 직종을 변경할 수 있으며, '을'은 정당한 이유없이 이를 거부할 수 없다.</p>

${art('근로시간')}
<p class="doc-paper__cl">① 근로시간은 일 ${esc(stdDay)}시간, 주 ${esc(stdWeek)}시간을 원칙으로 한다.</p>
<p class="doc-paper__cl">② '을'의 기본 근로시간 및 휴게시간은 다음과 같으며, 시차출퇴근제 적용자는 회사가 지정하는 범위에서 근로자가 시업시각과 종업시각을 선택할 수 있다. 이 경우에도 휴게시간은 원칙적으로 12~13시로 한다.</p>
${workTimeTable(v, true)}
<p class="doc-paper__cl">③ '갑'은 업무상 스케줄 필요에 따라 근무시간을 조정(시업 및 종업시간, 휴게시간, 단축 및 연장)할 수 있으며, '을'은 주 12시간 한도 내에서 시간외 근로를 요구할 수 있다.</p>
${CONFIRM}
<p class="doc-paper__cl">④ 시간외 근로는 회사의 지시와 승인을 받은 시간만을 인정하며, 임의적인 시간외근로는 근로시간으로 인정하지 아니한다.</p>
<p class="doc-paper__cl">⑤ 승인없이 소정근무일에 휴무를 하는 경우 사유불문하고 무단 결근으로 처리되며, 무단결근 3회 누적시 징계처리 될 수 있다.</p>
${CONFIRM}

${art('급여')}
${wageClauses(v, { wagePeriod: true })}

${art('퇴직금')}
<p class="doc-paper__cl">① '을'의 계속근로연수가 1년 이상인 경우 '을'의 퇴직시에 계속근로연수 1년에 대하여 30일분의 평균임금을 퇴직금으로 지급한다.</p>
<p class="doc-paper__cl">② 전항의 퇴직급여와 관련하여 근로자 퇴직급여보장법 상의 요건에 따라 퇴직연금제를 도입하여 운영할 수 있다.</p>
<p class="doc-paper__cl">③ '갑'은 퇴직금 등 근로관계에서 발생한 일체의 금품을 '을'의 퇴직 후 14일 이내에 지급하도록 한다.</p>

${art('휴일')}
<p class="doc-paper__cl">① 근로자의 날 및 주휴일, 「관공서의 공휴일에 관한 규정」에 따른 공휴일 및 대체공휴일을 유급휴일로 하며, 주휴일은 1주간 소정의 근로일을 개근한 경우 부여한다.</p>
<p class="doc-paper__cl">② 매주 토요일은 무급휴일로 한다.</p>

${art('연차휴가')}
<p class="doc-paper__cl">1년 이내에 퇴직시 1개월 만근시 1일의 연차휴가를 산정(근로기준법 제60조 2항)하는 바, 이와 더불어 부여한 연차일수(회계년도기준 비례부여일수)는 총연차휴가일수에서 공제하며, 이미 초과 사용한 일수는 퇴직시 임금에서 공제한다.</p>
<p class="doc-paper__note">※ 1년 이상 근무의 경우도 퇴사시 입사일 기준으로 산정된 연차휴가보다 초과부여·사용시 동일 적용함.</p>
${CONFIRM}

${art('수습기간 및 근로계약의 해지')}
<p class="doc-paper__cl">① '갑'은 '을'이 다음 각 호에 해당하는 때에는 근로계약기간 중이라도 중도에 해지할 수 있다.</p>
${TERMINATION_REASONS}
<p class="doc-paper__cl">② '갑'이 '을'과의 수습계약을 중도에 해지하고자 하는 경우 계약의 해지(해고)에 대해 그 사유와 시기를 명시하여 서면으로 통보한다.</p>
<p class="doc-paper__cl">③ '갑'은 '을'의 직무적성과 업무수행능력 및 업무적격성을 판단하기 위하여 입사 후 <strong>${esc(months)}개월</strong>간의 수습기간을 두며, 회사가 필요하다고 인정하는 경우에는 기간을 단축·연장조정·면제 할 수 있다.</p>
<p class="doc-paper__cl">④ 수습 계약 기간 동안 수습 평가를 통해 정규직 채용여부를 결정하여 '을'에게 고지한다. 수습평가는 1개월 단위로 평가를 진행하며, 평가점수에 따라 정직원 전환, 수습연장, 즉시 수습종료로 진행 될 수 있다.</p>
<table class="doc-paper__tbl doc-paper__tbl--center">
  <thead><tr><th>평가점수</th><th>처리</th></tr></thead>
  <tbody>
    <tr><td>70점 이상</td><td>정규직 전환</td></tr>
    <tr><td>60점 이상 70점 미만</td><td>수습연장 또는 종료</td></tr>
    <tr><td>60점 미만</td><td>수습 종료</td></tr>
  </tbody>
</table>
<p class="doc-paper__cl">⑤ '을'이 계약기간 도중 사직하고자 하는 경우 최소 30일 전에 근로계약의 해지의사(사직원)를 '갑'에게 제출하여 승인을 받도록 하며, 업무인수인계에 지장이 없도록 협조하여야 하며, 이로 인해 손해가 발생한 경우 이를 배상하여야 한다.</p>
${CONFIRM}
<p class="doc-paper__cl">⑥ '을'은 퇴직 시 지급물품 및 비품(출입카드, 법인카드, 사무용품 등)을 퇴직 당일 회사에 반납하여야 하며, 기타 '을'의 일방적인 계약 해지로 '갑'에게 손해가 발생한 경우 이를 배상하여야 한다.</p>
${CONFIRM}

${art('준수사항')}
${COMPLIANCE_ITEMS}

${closingClauses(art)}

<h3 class="doc-paper__art">근로자 인적사항</h3>
${personTable(v)}

<p class="doc-paper__signdate">${dateK(v.작성일 || todayStr())}</p>

[[SIGNATURES]]`;
  }

  /* ============================================================
   *  촉탁직 근로계약서 — 계약서 양식.xlsx 「촉탁직계약서」 시트
   *    적용: 촉탁직 근로계약서
   *  근로계약서와의 차이 — 촉탁직 임용 절차 전문 / 제3조가 「근로일 및 근로시간」(월~금 명시,
   *  교대조 없는 3열 표) / 제5조가 「퇴직연금」(확정기여형 DC) / 휴일은 주휴일(일요일) 기준 /
   *  연차휴가는 근로기준법 + 회계연도 기준 재정산.
   * ============================================================ */
  function tplChotak(v) {
    const docTitle = v.근로계약서종류 || DOC_TITLES.chotak;
    const start = esc(v.시작일) || '____-__-__';
    const end   = esc(v.종료일) || '____-__-__';
    let _artNo = 0;
    const art = (title) => `<h3 class="doc-paper__art">제${++_artNo}조 (${title})</h3>`;
    const stdDay  = v.소정1일 || 8;
    const stdWeek = v.소정1주 || 40;
    return `
<h2 class="doc-paper__title">${esc(docTitle)}</h2>

<p class="doc-paper__intro">촉탁직 임용 절차에 의하여 「${esc(v.회사명) || '_______'}」(이하 '갑'이라 한다)는 촉탁직 근로자 「${esc(v.직원명) || '_______'}」(이하 '을'이라 한다)과(와) 아래와 같은 내용으로 근로계약을 체결한다.</p>
<p class="doc-paper__divider">■　　아　　래　　■</p>

${art('근로계약기간')}
<p class="doc-paper__cl">① '을'의 근로계약기간은 ${start} ~ ${end} 로 한다.</p>
<p class="doc-paper__note">※ 별도의 계약 갱신이 이루어지지 않는 한 상기 근로계약기간의 만료로 근로관계가 자동 종료된다.</p>
<p class="doc-paper__cl">② '을'의 임금계약기간은 ${start} ~ ${esc(v.임금종료일) || end} 로 한다.</p>
<p class="doc-paper__note">※ 새로운 임금계약이 체결되기 전까지 자동 갱신된다.</p>

${art('근무장소 및 직종')}
<p class="doc-paper__cl">① '을'의 근무장소 및 직종은 <strong>${esc(v.근무지) || '_______'} / ${esc(v.부서) || '_______'}</strong> (으)로 한다.</p>
<p class="doc-paper__cl">② '갑'은 업무상 필요에 따라 '을'의 근무장소 및 직종을 변경할 수 있으며, '을'은 정당한 이유없이 이를 거부할 수 없다.</p>

${art('근로일 및 근로시간')}
<p class="doc-paper__cl">① 소정근로일은 월~금요일이며, 근로시간은 일 ${esc(stdDay)}시간, 주 ${esc(stdWeek)}시간을 원칙으로 한다.</p>
<p class="doc-paper__cl">② '을'의 기본 근로시간 및 휴게시간은 다음과 같으며, 시차출퇴근제 적용자는 회사가 지정하는 범위에서 근로자가 시업시각과 종업시각을 선택할 수 있다. 이 경우에도 휴게시간은 원칙적으로 12~13시로 한다.</p>
${workTimeTable(v, false)}
<p class="doc-paper__cl">③ '갑'은 업무상 스케줄 필요에 따라 근무시간을 조정(시업 및 종업시간, 휴게시간, 단축 및 연장)할 수 있으며, '을'은 주 12시간 한도 내에서 시간외 근로를 요구할 수 있다.</p>
${CONFIRM}
<p class="doc-paper__cl">④ 시간외 근로는 회사의 지시와 승인을 받은 시간만을 인정하며, 임의적인 시간외근로는 근로시간으로 인정하지 아니한다.</p>
<p class="doc-paper__cl">⑤ 승인없이 소정근무일에 휴무를 하는 경우 사유불문하고 무단 결근으로 처리되며, 무단결근 3회 누적시 징계처리 될 수 있다.</p>
${CONFIRM}

${art('급여')}
${wageClauses(v, { wagePeriod: true })}

${art('퇴직연금')}
<p class="doc-paper__cl">① '갑'은 「근로자퇴직급여 보장법」에 따른 확정기여형 퇴직연금제도를 도입하여 운영한다.</p>
<p class="doc-paper__cl">② '을'의 계속근로연수가 1년 이상인 경우, '갑'은 연간 임금총액의 12분의 1 이상의 확정기여형 퇴직연금 부담금을 '을'의 계좌에 납입한다.</p>
<p class="doc-paper__cl">③ '갑'은 퇴직금 등 근로관계에서 발생한 일체의 금품을 '을'의 퇴직 후 14일 이내에 지급하도록 한다.</p>

${art('휴일')}
<p class="doc-paper__cl">① 근로자의 날 및 주휴일(일요일)을 유급휴일로 하며, 주휴일은 1주간 소정의 근로일을 개근한 경우 부여한다.</p>
<p class="doc-paper__cl">② 매주 토요일은 무급휴무일로 한다.</p>

${art('연차휴가')}
<p class="doc-paper__cl">연차휴가는 근로기준법 규정에 따른다. 다만, 회계연도기준으로 부여하고, 퇴사시에는 입사일 기준으로 재정산한다.</p>
${CONFIRM}

${art('근로계약의 해지')}
<p class="doc-paper__cl">① '갑'은 '을'이 다음 각 호에 해당하는 때에는 근로계약기간 중이라도 중도에 해지할 수 있다.</p>
${TERMINATION_REASONS}
<p class="doc-paper__cl">② '갑'이 '을'과의 근로계약을 중도에 해지하고자 하는 경우 30일 이전에 예고하여야 하며, 계약의 해지(해고)에 대해 그 사유와 시기를 명시하여 서면으로 통보하여야 한다.</p>
<p class="doc-paper__cl">③ '을'이 계약기간 도중 사직하고자 하는 경우 최소 30일 전에 근로계약의 해지의사(사직원)를 '갑'에게 제출하여 승인을 받도록 하며, 업무인수인계에 지장이 없도록 협조하여야 하며, 이로 인해 손해가 발생한 경우 이를 배상하여야 한다.</p>
${CONFIRM}
<p class="doc-paper__cl">④ '을'은 퇴직 시 지급물품 및 비품(출입카드, 법인카드, 사무용품 등)을 퇴직 당일 회사에 반납하여야 하며, 기타 '을'의 일방적인 계약 해지로 '갑'에게 손해가 발생한 경우 이를 배상하여야 한다.</p>
${CONFIRM}

${art('준수사항')}
${COMPLIANCE_ITEMS}

${closingClauses(art)}

<h3 class="doc-paper__art">근로자 인적사항</h3>
${personTable(v)}

<p class="doc-paper__signdate">${dateK(v.작성일 || todayStr())}</p>

[[SIGNATURES]]`;
  }

  /* ============================================================
   *  시급제 근로계약서 — 계약서 양식.xlsx 「시급제계약서」 시트
   *    적용: 일용직 근로계약서
   *  근로계약서와의 차이 — 제3조 스케줄 근무(휴일·근로일 변동) / 제4조 급여가 시급·주휴수당·
   *  상여금·기타급여·가산임금률 구성 / 제5조 퇴직급여 등(확정기여형 DC) / 해지 예고 10일 /
   *  제9조 비밀유지의무 · 제10조 준수사항(유니폼·용모) 분리 → 총 13개 조.
   * ============================================================ */
  function tplDaily(v) {
    const docTitle = v.근로계약서종류 || DOC_TITLES.daily;
    const start = esc(v.시작일) || '____-__-__';
    const end   = esc(v.종료일) || '____-__-__';
    const payDay = payDayOf(v);
    let _artNo = 0;
    const art = (title) => `<h3 class="doc-paper__art">제${++_artNo}조 (${title})</h3>`;
    const stdDay  = v.소정1일 || '___';
    const stdWeek = v.소정1주 || '___';
    return `
<h2 class="doc-paper__title">${esc(docTitle)}</h2>

<p class="doc-paper__intro">「${esc(v.회사명) || '_______'}」(이하 '갑'이라 한다)는 근로자 「${esc(v.직원명) || '_______'}」(이하 '을'이라 한다)과(와) 아래와 같은 내용으로 근로계약을 체결한다.</p>
<p class="doc-paper__divider">■　　아　　래　　■</p>

${art('근로계약기간')}
<p class="doc-paper__cl">① '을'의 근로계약기간은 ${start} ~ ${end} 로 한다.</p>
<p class="doc-paper__note">※ 별도의 계약 갱신이 이루어지지 않는 한 상기 근로계약기간의 만료로 근로관계가 자동 종료된다.</p>
<p class="doc-paper__cl">② '을'의 임금계약기간은 ${start} ~ ${esc(v.임금종료일) || end} 로 한다.</p>
<p class="doc-paper__note">※ 새로운 임금계약이 체결되기 전까지 자동 갱신된다.</p>

${art('근무장소 및 직종')}
<p class="doc-paper__cl">① '을'의 근무장소 및 직종은 <strong>${esc(v.근무지) || '_______'} / ${esc(v.부서) || '_______'}</strong> (으)로 한다.</p>
<p class="doc-paper__cl">② '갑'은 업무상 필요에 따라 '을'의 근무장소 및 직종을 변경할 수 있으며, '을'은 정당한 이유없이 이를 거부할 수 없다.</p>

${art('근로일 및 근로시간')}
<p class="doc-paper__cl">① 근로시간은 일 ${esc(stdDay)}시간, 주 ${esc(stdWeek)}시간을 원칙으로 하며 스케줄 근무에 따른 휴일 및 근로일이 달라질 수 있다.</p>
<p class="doc-paper__cl">② '을'의 기본 근로시간 및 휴게시간은 다음과 같다.</p>
${workTimeTable(v, false)}
<p class="doc-paper__cl">③ '갑'은 업무상 스케줄 필요에 따라 근무시간을 조정(시업 및 종업시각 조정, 휴게시간 단축/연장)할 수 있으며, '을'은 주 12시간 한도 내에서 시간외 근로를 요구할 수 있다.</p>
${CONFIRM}
<p class="doc-paper__cl">④ 시간외 근로는 회사의 지시와 승인을 받은 시간만을 인정하며, 임의적인 시간외근로는 근로시간으로 인정하지 아니한다.</p>
<p class="doc-paper__cl">⑤ 승인없이 소정근무일에 휴무를 하는 경우 사유불문하고 무단 결근으로 처리되며, 무단결근 3회 누적시 징계처리 될 수 있다.</p>
${CONFIRM}

${art('급여')}
<p class="doc-paper__cl">① 시간(일, 월)급 : <strong>${money(v.시급)}</strong> 원, 주휴수당 : <strong>${money(v.주휴수당)}</strong> 원</p>
<p class="doc-paper__cl">② 상여금 : <strong>${esc(v.상여금) || '없음'}</strong></p>
<p class="doc-paper__cl">③ 기타급여(제수당 등) : <strong>${esc(v.기타급여) || '없음'}</strong></p>
<p class="doc-paper__cl">④ 초과근로에 대한 가산임금률 : <strong>50%</strong></p>
<p class="doc-paper__cl">⑤ 급여는 매월 1일부터 말일까지를 산정기간으로 하여, 익월 ${esc(payDay)}일(휴일인 경우 익일)에 '을' 본인명의의 계좌로 지급한다.</p>
<p class="doc-paper__cl">⑥ 월 급여 지급시 근로소득세 및 건강보험료, 국민연금, 고용보험 등의 제세공과금을 원천징수한 후 지급한다.</p>
<p class="doc-paper__cl">⑦ 결근일 및 지각, 조퇴, 임의외출 등으로 근무하지 않은 시간에 대해서는 무급을 원칙으로 하며, 해당 시간 및 일에 대한 임금을 공제할 수 있다.</p>
<p class="doc-paper__cl">⑧ 중도입사, 퇴사, 휴직, 복직 등으로 월급여 산정기간을 만근하지 못할 경우 전체 산정대상 기간 일수에 대한 근무일수를 일할계산하여 급여를 지급한다.</p>

${art('퇴직급여 등')}
<p class="doc-paper__cl">① '을'의 계속근로연수가 1년 이상인 경우, '갑'은 연간 임금총액의 12분의 1 이상의 확정기여형 퇴직연금 부담금을 '을'의 계좌에 납입한다.</p>
<p class="doc-paper__cl">② '갑'은 근로관계에서 발생한 일체의 금품을 '을'의 퇴직 후 14일 이내에 지급하도록 한다.</p>

${art('휴일')}
<p class="doc-paper__cl">① 근로자의 날 및 주휴일(일요일)을 유급휴일로 하며, 주휴일은 1주간 소정의 근로일을 개근한 경우 부여한다.</p>
<p class="doc-paper__cl">② 매주 토요일은 무급휴무일로 한다.</p>

${art('연차휴가')}
<p class="doc-paper__cl">연차휴가는 근로기준법 규정에 따라 부여한다. 다만, 회계연도기준으로 부여하고, 퇴사시에는 입사일 기준으로 재정산한다.</p>
${CONFIRM}

${art('근로계약의 해지')}
<p class="doc-paper__cl">① '갑'은 '을'이 다음 각 호에 해당하는 때에는 근로계약기간 중이라도 중도에 해지할 수 있다.</p>
${TERMINATION_REASONS}
<p class="doc-paper__cl">② '갑'이 '을'과의 근로계약을 중도에 해지하고자 하는 경우 10일 이전에 예고하여야 하며, 계약의 해지(해고)에 대해 그 사유와 시기를 명시하여 서면으로 통보하여야 한다. 다만, 근로기준법에 따라 해고예고 적용제외사유에 해당하는 경우에는 해고예고를 하지 아니한다.</p>
<p class="doc-paper__cl">③ '을'이 계약기간 도중 사직하고자 하는 경우 최소 10일 전에 근로계약의 해지의사(사직원)를 '갑'에게 제출하여 승인을 받도록 하며, 업무인수인계에 지장이 없도록 협조하여야 하며, 이로 인해 손해가 발생한 경우 이를 배상하여야 한다.</p>
${CONFIRM}
<p class="doc-paper__cl">④ '을'은 퇴직 시 지급물품 및 비품(출입카드, 유니폼, 사무용품 등)을 퇴직 당일 회사에 반납하여야 하며, 기타 '을'의 일방적인 계약 해지로 '갑'에게 손해가 발생한 경우 이를 배상하여야 한다.</p>
${CONFIRM}

${art('비밀유지의무')}
${COMPLIANCE_ITEMS}

${art('준수사항')}
<p class="doc-paper__cl">'을'은 시업 시각부터 업무를 수행하여야 하며, 업무 시에는 유니폼 착용 및 단정한 용모 차림으로 정상적인 업무 수행에 차질이 없도록 하여야 한다.</p>

${closingClauses(art)}

<h3 class="doc-paper__art">근로자 인적사항</h3>
${personTable(v)}

<p class="doc-paper__signdate">${dateK(v.작성일 || todayStr())}</p>

[[SIGNATURES]]`;
  }

  /* ============================================================
   *  연봉 계약서 — 계약서 양식.xlsx 「연봉계약서」 시트
   *    적용: 정규직 연봉 계약서 (kind = 임금계약서)
   *  구성: 제1조 연봉계약기간 / 제2조 연봉액 및 월급여의 구성항목(기본급·연장·야간·휴일근로수당)
   *        / 제3조 급여의 계산방법 및 지급방법 / 제4조 기타 + 교부 확인란
   * ============================================================ */
  function tplWage(v) {
    const docTitle = v.근로계약서종류 || DOC_TITLES.annual;
    const payDay = payDayOf(v);
    const base   = v.월기본급;
    const ot     = (v.wageContractKindKey === 'inclusive') ? v.월고정연장근무수당 : v.월시간외수당;
    const monthlyTotal = sumMoney(base, ot);
    return `
<h2 class="doc-paper__title">${esc(docTitle)}</h2>

<p class="doc-paper__intro">「${esc(v.회사명) || '_______'}」(이하 "갑"이라고 한다)와 근로자 「${esc(v.직원명) || '_______'}」(이하 "을"이라 한다)은(는) 다음과 같이 연봉계약을 체결하고, 2부를 작성하여 각각 1부씩 보관한다.</p>

<h3 class="doc-paper__art">제1조 (연봉계약기간)</h3>
<p class="doc-paper__cl">연봉계약기간은 ${dateK(v.시작일)}부터 ${v.무기 ? '<strong>기간의 정함 없음</strong>' : dateK(v.종료일)}까지로 한다. 연봉기간 만료 후 새로운 연봉계약이 체결되지 않은 경우에는 직전 연봉액 기준을 준용한다.</p>

<h3 class="doc-paper__art">제2조 (연봉액 및 월급여의 구성항목)</h3>
<p class="doc-paper__cl">① "을"의 임금형태는 연봉제로 하며, 연봉액은 <strong>${money(v.계약금액)}</strong>원으로 한다.</p>
<p class="doc-paper__cl">② "을"의 월급여액은 <strong>${monthlyTotal}</strong>원으로 하며, 월급여의 구성항목은 다음과 같다.</p>
<table class="doc-paper__tbl doc-paper__tbl--wage">
  <thead><tr><th>항목</th><th>금액 (원)</th><th>산정식</th></tr></thead>
  <tbody>
    <tr><th>기본급</th><td>${money(base)}</td><td>월 209시간</td></tr>
    <tr><th>연장근로수당</th><td>${money(ot)}</td><td>월 ${esc(v.fixedOTHours) || 29}시간 × 통상시급 × 150%</td></tr>
    <tr><th>야간근로수당</th><td>${money(v.월야간수당)}</td><td>월 시간 × 통상시급 × 50%</td></tr>
    <tr><th>휴일근로수당</th><td>${money(v.월휴일수당)}</td><td>월 시간 × 통상시급 × 150%</td></tr>
    <tr class="is-total"><th>월임금합계</th><td>${monthlyTotal}</td><td></td></tr>
  </tbody>
</table>
<p class="doc-paper__cl">③ 연장·야간·휴일근로는 "갑"이 지시하거나 승인한 경우에만 인정되며, 상기 임금구성항목에 포함되어 있는 법정수당을 합산한 금액을 초과한 경우는 보상휴가를 부여한다.</p>
<p class="doc-paper__cl">④ 상기 구성항목 외의 임금은 임금관리규정에 따른다.</p>
<p class="doc-paper__cl">⑤ "을"이 결근일 및 지각, 조퇴, 임의외출 등으로 근무하지 않은 시간에 대해서는 무급을 원칙으로 하며, 해당 시간 및 일에 대한 임금을 공제할 수 있다.</p>
<p class="doc-paper__cl">⑥ 중도입사, 퇴사, 휴직, 복직 등으로 월급여 산정기간을 만근하지 못할 경우 전체 산정대상 기간 일수에 대한 근무일수를 일할계산하여 급여를 지급한다.</p>

<h3 class="doc-paper__art">제3조 (급여의 계산방법 및 지급방법)</h3>
<p class="doc-paper__cl">① 월급여액의 산정기간은 매월 1일부터 말일까지로 한다.</p>
<p class="doc-paper__cl">② 급여의 지급 시기는 익월 ${esc(payDay)}일(휴일인 경우 익일)로 하며, "을"이 지정하는 본인명의 계좌로 입금한다.</p>
<p class="doc-paper__cl">③ 월 급여 지급 시 근로소득세 및 건강보험료, 국민연금, 고용보험 등의 제세공과금을 원천징수한 후 지급한다.</p>

<h3 class="doc-paper__art">제4조 (기타)</h3>
<p class="doc-paper__cl">① "을"은 본인의 급여내역을 다른 직원 또는 제3자에게 누설하여서는 아니 된다.</p>
<p class="doc-paper__cl">② 이 계약에 정함이 없는 사항은 취업규칙, 급여규정 등 제규정과 노동관계법령에 따른다.</p>

<p class="doc-paper__signdate">${dateK(v.작성일 || todayStr())}</p>

[[SIGNATURES]]

<p class="doc-paper__cl">"을" 본인은 상기 내용을 충분히 이해하고 본 연봉계약을 체결하였으며, "갑"으로부터 연봉계약서 1부를 교부받았음을 확인합니다.</p>
${CONFIRM}`;
  }

  /* ============================================================
   *  용역계약서 — 용역계약서(서식).docx
   *    적용: 프리랜서 용역 위탁계약서
   *  근로계약이 아닌 프리랜서 용역 위탁 계약 — 위탁자/수탁자 당사자 표 + 12개 조로 구성.
   *  v.계약금액 = 총 용역대금, v.월지급액 = 월 용역비, v.계약개월 = 계약 개월 수.
   * ============================================================ */
  function tplService(v) {
    const docTitle = v.근로계약서종류 || DOC_TITLES.service;
    let _artNo = 0;
    const art = (title) => `<h3 class="doc-paper__art">제${++_artNo}조 (${title})</h3>`;
    const months = v.계약개월 ? `(${esc(v.계약개월)}개월)` : '';
    const payDay = payDayOf(v);
    const totalNote = v.계약금액 ? ` <span style="color:var(--color-text-muted);">(계약기간 총 ${money(v.계약금액)}원)</span>` : '';
    return `
<h2 class="doc-paper__title">${esc(docTitle)}</h2>

<table class="doc-paper__tbl doc-paper__tbl--party">
  <tr><th rowspan="3">위탁자</th><th>회사명</th><td>${esc(v.회사명) || COMPANY}</td><th rowspan="3">수탁자</th><th>성명</th><td>${esc(v.직원명) || ''}</td></tr>
  <tr><th>대표자</th><td>${esc(COMPANY_REPR)}</td><th>생년월일</th><td></td></tr>
  <tr><th>사업자번호</th><td>${esc(COMPANY_BIZNO)}</td><th>주소</th><td></td></tr>
</table>
<p class="doc-paper__intro">위탁자와 수탁자는 다음과 같이 계약(이하 '본 계약'이라 함)을 체결한다.</p>

${art('목적')}
<p class="doc-paper__cl">본 계약의 목적은 위탁자가 수탁자에게 <strong>${esc(v.직무) || '홍보 및 마케팅'}</strong> 업무를 위탁함에 있어 상호간의 권리·의무 및 기타 제반 사항을 규정함에 있다.</p>

${art('기본원칙')}
<p class="doc-paper__cl">위탁자와 수탁자는 상호 대등한 입장에서 신의성실의 원칙에 따라 자신의 권리를 행사하며 의무를 이행한다.</p>

${art('위탁 업무 내용')}
<p class="doc-paper__cl">① 수탁자는 위탁자가 요청한 업무를 성실히 수행하여야 하며, 변경사항이 있을 경우 사전 협의를 통해 조정한다.</p>
<p class="doc-paper__cl">② 수탁자는 위탁자가 요청하는 기일까지 보고서를 서면 또는 이메일로 제출하여야 한다.</p>
<p class="doc-paper__cl">③ 위탁자는 필요 시 추가 자료 제출이나 구두 보고를 요청할 수 있다.</p>
<p class="doc-paper__cl">④ 위탁자는 수탁자가 완성한 결과물의 검수 권한을 가지며, 그 결과가 위탁자의 요구나 계약 목적 또는 용역수행범위상의 품질·수준에 현저히 미달하거나, 수탁자가 정당한 사유 없이 보완요구에 응하지 않을 경우, 위탁자는 사전 서면 통지 후 계약을 해지할 수 있다.</p>

${art('계약조건')}
<p class="doc-paper__cl">① 계약내용</p>
<table class="doc-paper__tbl">
  <thead><tr><th>구분</th><th>세부 내용</th></tr></thead>
  <tbody>
    <tr><th>용역비</th><td>월 ${money(v.월지급액)}원${totalNote}</td></tr>
    <tr><th>계약기간</th><td>${dateK(v.시작일)} ~ ${dateK(v.종료일)} ${months}</td></tr>
    <tr><th>지급일</th><td>익월 ${esc(payDay)}일 (익월 ${esc(payDay)}일이 공휴일인 경우, 그 후 영업일)</td></tr>
    <tr><th>기타</th><td>지급 시 「소득세법」에 따른 3.3%의 사업소득세(지방소득세 포함)를 원천징수 후 지급한다.</td></tr>
  </tbody>
</table>
<p class="doc-paper__cl">② 본 계약은 1개월 단위로 운영되며, 계약기간 종료 시 업무 수행평가 결과 특별한 문제가 없고, 상호 이견이 없는 경우 동일 조건으로 자동 연장된 것으로 본다.</p>

${art('근무형태 및 장소')}
<p class="doc-paper__cl">① 위탁자와 수탁자의 상호 협의 하에 근무 형태, 지정된 장소 및 시간에 근무를 한다.</p>
<p class="doc-paper__cl">② 단, 위탁자의 요청이 있을 경우, 수탁자는 합리적인 범위 내에서 회의나 미팅에 참석할 수 있다.</p>
<p class="doc-paper__cl">③ 수탁자는 독립 사업자로서 업무 수행에 필요한 장비나 장소를 스스로 마련한다.</p>

${art('권리·의무 관계')}
<p class="doc-paper__cl">① 수탁자는 선량한 관리자의 주의의무를 다하여 업무를 수행하여야 하며, 이를 위반하여 손해가 발생한 경우 위탁자는 수탁자에게 손해배상을 청구할 수 있다.</p>
<p class="doc-paper__cl">② 업무 수행 중 수탁자의 과실로 물품 파손 등이 발생한 경우, 수탁자는 해당 가액을 위탁자에게 배상하며, 필요한 경우 월 용역비에서 공제할 수 있다.</p>

${art('비밀유지')}
<p class="doc-paper__cl">① 수탁자는 계약 수행 과정에서 알게 된 위탁자의 영업상, 기술상, 재무상, 인적 자원 관련 일체의 기밀정보를 제3자에게 누설하거나 본 계약 이외의 목적으로 사용해서는 안 된다.</p>
<p class="doc-paper__cl">② 본 조의 비밀유지 의무는 계약 기간을 포함하여 계약 종료 후에도 3년간 유효하다.</p>
<p class="doc-paper__cl">③ 이를 위반할 경우 위탁자는 수탁자에게 손해배상을 청구할 수 있다.</p>

${art('계약해지')}
<p class="doc-paper__cl">① 위탁자 또는 수탁자는 다음 각 호의 사유가 발생한 경우 서면 통지로 본 계약을 즉시 해지할 수 있다.</p>
<p class="doc-paper__cl">&nbsp;&nbsp;1. 계약 조건을 중대하게 위반한 경우</p>
<p class="doc-paper__cl">&nbsp;&nbsp;2. 업무를 성실히 수행하지 않거나 정당한 이유 없이 업무를 거부하는 경우</p>
<p class="doc-paper__cl">&nbsp;&nbsp;3. 파산, 회생절차 개시 등 정상적인 계약 이행이 불가능하다고 판단되는 경우</p>
<p class="doc-paper__cl">&nbsp;&nbsp;4. 수탁자의 용역결과가 위탁자의 요구나 계약목적 또는 용역수행범위상의 품질·수준에 현저히 미달하거나, 수탁자가 정당한 사유없이 보완 요구에 응하지 않을 경우</p>
<p class="doc-paper__cl">&nbsp;&nbsp;5. 기타 본 계약을 계속 수행할 수 없는 상황이 발생한 경우</p>
<p class="doc-paper__cl">&nbsp;&nbsp;6. 업무(량)의 변화, 프로젝트의 종료 등의 사유로 해지가 불가피한 때</p>
<p class="doc-paper__cl">② 계약 종료를 원하는 경우 수탁자 또는 위탁자는 계약 종료 예정일 기준 7일 전까지 상대방에게 서면, 문자, 이메일 또는 메신저 등의 방법으로 종료 의사를 통보하여야 한다.</p>
<p class="doc-paper__cl">③ 계약이 해지된 경우, 수탁자는 즉시 업무 수행을 중단하고 위탁자의 요구에 따라 관련 자료 및 기밀정보를 반환하여야 한다.</p>

${art('지식재산권')}
<p class="doc-paper__cl">① 수탁자가 본 계약의 수행 과정에서 작성·제작한 보고서, 문서, 데이터, 자료 및 산출물의 저작권 및 지식재산권은 별도의 서면 합의가 없는 한 위탁자에게 귀속된다.</p>
<p class="doc-paper__cl">② 단, 수탁자가 본 계약 이전부터 보유하고 있던 고유한 노하우, 저작물, 지식재산권은 수탁자에게 귀속된다.</p>
<p class="doc-paper__cl">③ 위탁자는 계약 목적 외의 용도로 수탁자의 고유한 지식재산을 사용할 수 없으며, 수탁자는 이에 대한 사용을 제한할 권리를 가진다.</p>

${art('손해배상 범위')}
<p class="doc-paper__cl">① 수탁자는 본 계약상의 의무를 고의 또는 중대한 과실로 위반하여 위탁자에게 손해를 발생시킨 경우에 한하여 그 손해를 배상한다.</p>
<p class="doc-paper__cl">② 손해배상의 범위는 통상 손해에 한하며, 특별한 손해는 수탁자가 그 발생 가능성을 알았거나 알 수 있었던 경우에 한하여 배상책임을 부담한다.</p>

${art('기타')}
<p class="doc-paper__cl">① 본 계약은 노동관계법령에 따른 각종 임금, 휴게·휴일·휴가·휴직, 해고, 퇴직금, 재해보상, 4대보험 등이 발생하지 않는 프리랜서 용역계약임을 수탁자는 인지하고 있으며, 독립사업자 지위와 배치되는 권리를 위탁자 또는 제3자에게 주장하지 않을 것임을 확인하고 이에 동의한다.</p>
<p class="doc-paper__confirm">동의 <em></em> (서명)</p>
<p class="doc-paper__cl">② 본 계약에 명시되지 않은 사항은 관련 법령 및 업계 관례에 따른다.</p>

${art('분쟁 해결')}
<p class="doc-paper__cl">① 본 계약에 관하여 분쟁이 발생할 경우, 위탁자와 수탁자는 우선적으로 상호 협의를 통해 원만히 해결하도록 노력한다.</p>
<p class="doc-paper__cl">② 협의로 해결되지 않는 경우, 본 계약과 관련된 모든 분쟁은 대한민국 법령을 준거법으로 하고, 위탁자의 본사 소재지를 관할하는 법원을 제1심 관할법원으로 한다.</p>

<p class="doc-paper__cl">본 계약을 증명하기 위하여 계약서 2통을 작성하여 쌍방이 서명 날인하고 각각 1통씩 보관한다.</p>

<p class="doc-paper__signdate">${dateK(v.작성일 || todayStr())}</p>

[[SIGNATURES]]`;
  }
  /* ============ 계약서 종류 (도메인 7종) ============
   *   근로/용역 계약  : 정규직 수습 · 정규직 전환 · 계약직 · 촉탁직 · 일용직 근로계약서 / 용역 위탁계약서
   *   임금 계약      : 정규직 연봉 계약서
   *   생성 시점
   *     · 임직원 등록 : 정규직 수습 / 계약직 / 촉탁직 / 일용직 근로계약서 / 용역 위탁계약서
   *     · 수습 해제   : 정규직 전환 근로계약서
   *     · 연봉 갱신   : 정규직 연봉 계약서
   *   kind(계약 관리 목록 분류)는 근로계약서 / 임금계약서 2종을 유지하고, 문서 종류명은 docTitle 로 관리한다. */
  const DOC_TITLES = {
    probation:  '정규직 수습 근로계약서',
    permanent:  '정규직 전환 근로계약서',
    annual:     '정규직 연봉 계약서',
    contract:   '계약직 근로계약서',
    chotak:     '촉탁직 근로계약서',
    daily:      '일용직 근로계약서',
    service:    '용역 위탁계약서',
  };
  /* 서식 레지스트리 — kind(계약 유형) 키 + 문서 종류(docTitle) 키 양쪽으로 조회된다.
     docTitle 키가 있으면 우선 적용. 각 서식은 「계약서 양식.xlsx」 시트 / 「용역계약서(서식).docx」 1:1 대응:
       근로계약서 시트   → 정규직 전환 · 계약직          (tplWork)
       수습계약서 시트   → 정규직 수습                   (tplProbation)
       촉탁직계약서 시트 → 촉탁직                        (tplChotak)
       시급제계약서 시트 → 일용직                        (tplDaily)
       연봉계약서 시트   → 정규직 연봉 (kind=임금계약서)  (tplWage)
       용역계약서 docx  → 프리랜서 용역 위탁             (tplService) */
  const TEMPLATES = {
    '근로계약서': tplWork,
    '임금계약서': tplWage,
    [DOC_TITLES.probation]: tplProbation,
    [DOC_TITLES.permanent]: tplWork,
    [DOC_TITLES.contract]:  tplWork,
    [DOC_TITLES.chotak]:    tplChotak,
    [DOC_TITLES.daily]:     tplDaily,
    [DOC_TITLES.annual]:    tplWage,
    [DOC_TITLES.service]:   tplService,
  };

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
    /* 용역 위탁계약서는 근로계약이 아니므로 당사자 호칭을 위탁자/수탁자로 표기 (용역계약서(서식).docx) */
    const isService = (row.docTitle || '') === DOC_TITLES.service;
    const gapRole = isService ? '갑 — 위탁자 (회사)' : '갑 — 사용자 (회사)';
    const eulRole = isService ? '을 — 수탁자' : '을 — 근로자';

    const gapBlock = `
      <div class="sig-block ${sealOn ? 'sig-block--signed' : ''}">
        <div class="sig-block__role">${gapRole}</div>
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
        <div class="sig-block__role">${eulRole}</div>
        <div class="sig-block__info">
          <strong>${esc(row.empName)}</strong>
          <small>${isService ? '관리번호' : '사번'} ${esc(row.empId)} · ${esc(row.empDept)}</small>
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
            <span style="color:var(--color-text-muted);">${isService ? '수탁자' : '근로자'} 서명 미완료</span>
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
      { at: plus(0, 10, 24), title: '계약서 작성', desc: HR_NAME, kind: '' },
    ];
    if (status === 'draft') return h;
    h.push({ at: plus(1, 9, 10), title: '서명 요청 발송', desc: '이메일 발송', kind: '' });
    if (status === 'signing') return h;
    if (status === 'rejected') {
      h.push({ at: plus(2, 14, 2), title: '직원 서명 거부', desc: '사유: 근무지 변경 협의 필요', kind: 'danger' });
      return h;
    }
    h.push({ at: plus(2, 11, 5), title: '직원 전자 서명', desc: '본인 서명', kind: 'success' });
    /* 직원 전자 서명 완료가 최종 단계 — 대표이사 최종 승인 단계 없음. signed/active 모두 여기서 종료. */
    if (status === 'signed' || status === 'active') return h;
    if (status === 'expired') h.push({ at: '2026-02-12 00:00', title: '계약 만료', desc: '시스템 자동 전환', kind: '' });
    if (status === 'voided')  h.push({ at: '2026-05-01 16:30', title: '계약 무효 처리', desc: '사유: 계약 조건 오류 · ' + HR_NAME, kind: 'danger' });
    return h;
  }
  /* 계약서 본문 렌더용 v 객체 빌더 — addRowFromExternal / amendSigningContract 공용.
     spec: { emp, startDate, endDate, indefinite, salary }. workDate = 작성일 표기. */
  function contractBodyValues(spec, workDate) {
    const e = (spec && spec.emp) || {};
    const s = (spec && spec.salary) || {};
    const indefinite = !!(spec && spec.indefinite);
    const empName = e.name || ((e.fname || '') + (e.gname || ''));
    return {
      회사명: COMPANY, 직원명: empName, 사번: e.id,
      부서: e.dept || '', 직무: e.job || '', 직위: e.rank || '',
      직책: e.position || '',
      고용구분: { regular:'정규직', contract:'계약직', freelancer:'프리랜서', daily:'일용직', outsourced:'도급직' }[e.empType] || '',
      소속형태: e.contractOut ? '도급' : '-',
      직군:    ({ office:'사무직', production:'생산직', research:'연구직' })[e.jobCat] || '',
      시작일: (spec && spec.startDate) || '', 종료일: indefinite ? '' : ((spec && spec.endDate) || ''),
      /* 임금계약 종료일 — 무기 근로계약(정규직 전환) 이라도 임금계약기간은 별도로 정한다 */
      임금종료일: (spec && spec.wageEndDate) || '',
      무기: indefinite, 근무지: e.site || '성수동', 근무시간: '09:00 ~ 18:00',
      기본급: s.base || '', 직무수당: s.allowance || '', 식대: s.meal || '', 지급일: s.payday || '',
      /* 임금계약서 급여(제3조) 표기용 — 임금 유형/계약금액/월 구성 (wageClauses 가 읽는 키) */
      wageTypeKey: s.wageType || '', wageContractKindKey: s.wageKind || '',
      계약금액: s.contractAmount || '', 월기본급: s.base || '',
      월시간외수당: s.fixedOT || '', 월고정연장근무수당: s.inclusiveOT || '',
      시급: s.hourly || '', 주휴수당: s.holiday || '', fixedOTHours: s.fixedOTHours || '',
      /* 문서 종류 — 임직원 등록에서 근로유형별 계약서명을 지정 (정규직 수습/계약직/일용직/용역 위탁) */
      근로계약서종류: (spec && spec.docTitle) || '',
      /* 임금포함 — 근로계약서 1부에 급여 조항까지 포함해 발송하는 경우 true */
      임금포함: !!(spec && spec.wageIncluded),
      /* 소정근로시간 — 근로시간 조항 문구 분기 (일용직은 1일 N시간 / 1주 N일) */
      소정1일: s.hoursPerDay || '', 소정1주: s.hoursPerWeek || '', 소정주일수: s.daysPerWeek || '',
      /* 용역 위탁 계약서 — 총 용역대금 / 월 지급액 / 계약 개월 수 */
      월지급액: s.monthlyAmount || '', 계약개월: s.contractMonths || '',
      작성일: workDate,
    };
  }
  /* 계약서 종류 파생 — 계약 행에 docTitle 이 없을 때 직원 유형·수습 여부로 7종 중 하나를 정한다.
   *   임금계약서 = 정규직 연봉 계약서 (연봉 갱신 전용 문서)
   *   근로/용역   = 정규직 수습 / 정규직 전환 / 계약직 / 촉탁직 / 일용직 / 용역 위탁
   *   시드 데이터와 legacy 행(docTitle 미보유)이 목록·이력에서 'kind' 로 노출되지 않게 하는 폴백. */
  function deriveDocTitle(emp, c) {
    if (c && c.docTitle) return c.docTitle;
    if (c && c.kind === '임금계약서') return DOC_TITLES.annual;
    switch (emp && emp.empType) {
      case 'regular':    return (c && c.probation) ? DOC_TITLES.probation : DOC_TITLES.permanent;
      case 'contract':   return (emp.contractSubType === 'chotak') ? DOC_TITLES.chotak : DOC_TITLES.contract;
      case 'daily':      return DOC_TITLES.daily;
      case 'freelancer': return DOC_TITLES.service;
      default:           return (c && c.kind) || '';
    }
  }

  function makeMock() {
    // 각 계약서는 독립된 법적 문서. "갱신" 이라는 개념은 시스템에 두지 않고,
    // 한 직원에 대해 시기별로 별도 계약서를 누적 보존. 동일 직원의 다른 계약은
    // 상세 화면에서 시간순으로 조회만 한다.
    /* ============ 계약 시드 — 임직원 통합 마스터(App.HRInfoMgmt) 와 정합 ============
     *   EMPLOYEES = App.HRInfoMgmt.list().slice(0,14)
     *     emp:0 정규직(regular)   emp:1 정수습(regular·수습)  emp:2 정일용(daily)
     *     emp:3 김도급(도급 → contractOut 이라 아래 filter 제외)  emp:4 하계약(contract)
     *     emp:5 김규직 · emp:6 김수습 (regular, 승인 전)   emp:11~13 프리랜서
     *   정책(계약서 종류 7종 기준):
     *     · 근로/용역 계약서는 임금 조건을 포함한 1부로 체결한다(wageIncluded) —
     *       정규직 수습 / 정규직 전환 / 계약직 / 촉탁직 / 일용직 근로계약서 / 용역 위탁계약서.
     *     · 임금계약서는 정규직의 연봉 갱신용 「정규직 연봉 계약서」 만 별도로 누적된다.
     *     · 정규직 입사 흐름: 수습 근로계약서(입사일~3개월) → 전환 근로계약서(무기) → 연봉 계약서(매년).
     *   각 행의 계약서 종류(docTitle)는 seedDocTitle() 이 직원 유형·수습 여부로 파생한다. */
    const cases = [
      // 정규직 (emp:0) — 입사 2023-03-02. 수습 3개월 → 정규직 전환(무기) → 연봉 계약 매년 갱신.
      { id:'CTR-2023-1000', kind:'근로계약서', emp:0, status:'expired', start:'2023-03-02', end:'2023-06-01', created:'2023-02-27', probation:true, wageIncluded:true },
      { id:'CTR-2023-1001', kind:'근로계약서', emp:0, status:'active',  start:'2023-06-02', end:'',           indefinite:true, created:'2023-05-30', wageIncluded:true, wageEndDate:'2024-02-29' },
      // 연봉 계약 — 첫 인상 기준일 = 2024-03-02 이상인 첫 2/28 = 2025-02-28 → 최초 연봉계약이 2년 가까이 됨.
      { id:'CTR-2023-1002', kind:'임금계약서', emp:0, status:'expired', start:'2023-03-02', end:'2025-02-28', created:'2023-02-27', baseRaise:'5,420,000' },
      { id:'CTR-2025-1009', kind:'임금계약서', emp:0, status:'expired', start:'2025-03-01', end:'2026-02-28', created:'2025-02-25', baseRaise:'5,700,000' },
      { id:'CTR-2026-1010', kind:'임금계약서', emp:0, status:'active',  start:'2026-03-01', end:'2027-02-28', created:'2026-02-24', baseRaise:'6,000,000' },

      // 정수습 (emp:1) — 입사 2026-02-04. 수습 근로계약서 1부(3개월, 만료). '수습 해제 → 정규직 전환' 대상 데모.
      { id:'CTR-2026-1003', kind:'근로계약서', emp:1, status:'expired', start:'2026-02-04', end:'2026-05-03', created:'2026-01-30', probation:true, wageIncluded:true, baseRaise:'3,170,000' },

      // 정일용 (emp:2) — 입사 2026-06-01. 일용직 근로계약서 1부(시급 조건 포함)
      { id:'CTR-2026-1005', kind:'근로계약서', emp:2, status:'active', start:'2026-06-01', end:'2026-12-31', created:'2026-05-29', wageIncluded:true },

      // 하계약 (emp:4) — 입사 2025-01-06. 계약직 근로계약서 1부
      { id:'CTR-2025-1007', kind:'근로계약서', emp:4, status:'active', start:'2025-01-06', end:'2027-01-05', created:'2025-01-02', wageIncluded:true, baseRaise:'4,500,000' },

      // 김규직 (emp:5) — 입사 2026-07-20. 승인 전. 임직원 등록 발송분(수습 근로계약서 1부) → 서명대기.
      { id:'CTR-2026-1201', kind:'근로계약서', emp:5, status:'signing', start:'2026-07-20', end:'2026-10-19', created:'2026-07-14', probation:true, wageIncluded:true, baseRaise:'3,170,000', source:'임직원 등록 발송' },
      // 김수습 (emp:6) — 입사 2026-07-21. 동일 흐름.
      { id:'CTR-2026-1203', kind:'근로계약서', emp:6, status:'signing', start:'2026-07-21', end:'2026-10-20', created:'2026-07-13', probation:true, wageIncluded:true, baseRaise:'3,170,000', source:'임직원 등록 발송' },

      // 프리랜서 (emp:11~13) — 용역 위탁계약서 1부(용역대금 포함), 1년 단위 계약기간.
      { id:'CTR-2025-1101', kind:'근로계약서', emp:11, status:'active', start:'2025-09-03', end:'2026-09-02', created:'2025-08-30', wageIncluded:true, baseRaise:'3,800,000' },
      { id:'CTR-2026-1103', kind:'근로계약서', emp:12, status:'active', start:'2026-02-02', end:'2027-02-01', created:'2026-01-29', wageIncluded:true, baseRaise:'5,000,000' },
      { id:'CTR-2025-1105', kind:'근로계약서', emp:13, status:'active', start:'2025-11-03', end:'2026-11-02', created:'2025-10-31', wageIncluded:true, baseRaise:'3,300,000' },

      /* ============ 계약 갱신 데모 — 근로유형별 5명 확보분 (emp:17~26) ============
       *   각 1부(임금 조건 포함). 계약 종료일이 오늘 기준 1~6개월 내에 분산되어
       *   [계약서 작성] 의 대상자 검색(계약종료일 향후 N개월)에 걸린다. */
      // 계약직 — 문계약(1개월) · 배계약(3개월) · 노촉탁(6개월, 촉탁직)
      { id:'CTR-2025-1301', kind:'근로계약서', emp:17, status:'expired', start:'2025-03-04', end:'2026-05-03', created:'2025-02-28', wageIncluded:true, baseRaise:'2,900,000' },
      { id:'CTR-2025-1302', kind:'근로계약서', emp:18, status:'expired', start:'2025-04-01', end:'2026-03-31', created:'2025-03-27', wageIncluded:true, baseRaise:'2,600,000' },
      { id:'CTR-2025-1303', kind:'근로계약서', emp:19, status:'expired', start:'2025-01-01', end:'2025-12-31', created:'2024-12-26', wageIncluded:true, baseRaise:'3,200,000' },
      // 일용직 — 강일용(1개월) · 표일용(3개월) · 연일용(6개월) · 천일용(6개월)
      { id:'CTR-2026-1311', kind:'근로계약서', emp:20, status:'expired', start:'2025-11-01', end:'2026-04-30', created:'2025-10-27', wageIncluded:true },
      { id:'CTR-2026-1312', kind:'근로계약서', emp:21, status:'expired', start:'2025-10-16', end:'2026-03-15', created:'2025-10-10', wageIncluded:true },
      { id:'CTR-2026-1313', kind:'근로계약서', emp:22, status:'expired', start:'2025-08-01', end:'2026-01-31', created:'2025-07-28', wageIncluded:true },
      { id:'CTR-2026-1314', kind:'근로계약서', emp:23, status:'expired', start:'2025-06-21', end:'2025-12-20', created:'2025-06-16', wageIncluded:true },
      // 프리랜서 — 민프리(1개월) · 탁프리(3개월)
      { id:'CTR-2025-1321', kind:'근로계약서', emp:24, status:'expired', start:'2025-11-06', end:'2026-05-05', created:'2025-10-31', wageIncluded:true, baseRaise:'6,000,000' },
      { id:'CTR-2026-1322', kind:'근로계약서', emp:25, status:'expired', start:'2025-09-01', end:'2026-02-28', created:'2025-08-27', wageIncluded:true, baseRaise:'8,000,000' },
      // 정규직 — 표정규: 수습(만료) → 전환(무기) → 연봉계약(향후 1개월 내 만료 → 갱신 대상)
      { id:'CTR-2024-1331', kind:'근로계약서', emp:26, status:'expired', start:'2024-02-05', end:'2024-05-04', created:'2024-01-30', probation:true, wageIncluded:true, baseRaise:'3,000,000' },
      { id:'CTR-2024-1332', kind:'근로계약서', emp:26, status:'active',  start:'2024-05-05', end:'', indefinite:true, created:'2024-05-02', wageIncluded:true, baseRaise:'3,600,000', wageEndDate:'2025-02-28' },
      { id:'CTR-2025-1333', kind:'임금계약서', emp:26, status:'expired', start:'2025-05-01', end:'2026-04-30', created:'2025-04-26', baseRaise:'4,200,000' },
      // 연수습 (emp:27) — 수습 근로계약서(3개월) 만료 + 수습평가 '수습 연장' → 수습 계약 재작성 대상
      { id:'CTR-2026-1341', kind:'근로계약서', emp:27, status:'expired', start:'2026-01-12', end:'2026-04-11', created:'2026-01-06', probation:true, wageIncluded:true, baseRaise:'2,550,000' },
    ];

    const hrUsers = ['정혜진', '윤민지', '정혜진', '정혜진', '윤민지'];
    /* 도급직(contractOut) 은 계약서 자체가 없음 — 해당 emp 인덱스의 mock 항목 제외 */
    const filtered = cases.filter(c => {
      const e = EMPLOYEES[c.emp];
      return e && !e.contractOut;
    });
    return filtered.map((c, idx) => {
      const emp = EMPLOYEES[c.emp];
      const docTitle = deriveDocTitle(emp, c);
      const isHourlySeed = emp.empType === 'daily';
      const isServiceSeed = emp.empType === 'freelancer';
      const v = {
        회사명: COMPANY, 직원명: emp.name, 사번: emp.id,
        부서: emp.dept, 직무: emp.job, 직위: emp.rank,
        직책:    emp.position || '',
        고용구분: empTypeDisplay(emp),
        소속형태: affiliationDisplay(emp),
        직군:    jobCatDisplay(emp),
        시작일: c.start, 종료일: c.end,
        /* 무기 근로계약(정규직 전환) 의 임금계약 종료일 — 제1조 ② 임금계약기간에 쓰인다 */
        임금종료일: c.wageEndDate || '',
        무기: !!c.indefinite,
        근무지: '성수동', 근무시간: '09:00 ~ 18:00',
        기본급: c.baseRaise || '3,200,000', 직무수당: '', 식대: '',
        지급일: '매월 10일',
        /* 계약서 종류 + 임금 조건 포함 여부 — 1부 체결분은 본문에 급여(용역대금) 조항까지 들어간다 */
        근로계약서종류: docTitle,
        임금포함: !!c.wageIncluded,
        wageTypeKey: isHourlySeed ? 'hourly' : 'annual',
        wageContractKindKey: 'fixedOT',
        계약금액: isServiceSeed ? '30,000,000' : (isHourlySeed ? '14,400' : '45,000,000'),
        월기본급: c.baseRaise || '3,200,000', 월시간외수당: '300,000',
        시급: isHourlySeed ? '12,000' : '', 주휴수당: isHourlySeed ? '2,400' : '',
        소정1일: isHourlySeed ? 8 : 8, 소정1주: isHourlySeed ? 40 : 40,
        소정주일수: isHourlySeed ? 5 : '',
        월지급액: isServiceSeed ? '2,500,000' : '', 계약개월: isServiceSeed ? 12 : '',
        작성일: c.created || c.start,
      };
      const body = (TEMPLATES[docTitle] || TEMPLATES[c.kind] || tplWork)(v);
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
        /* 계약서 종류 7종 — 목록·이력의 '종류' 컬럼 표기 및 서식 선택 기준 */
        docTitle, wageIncluded: !!c.wageIncluded,
        empId: emp.id, empName: emp.name, empDept: emp.dept,
        startDate: c.start, endDate: c.end || '',
        indefinite: !!c.indefinite,
        status: c.status,
        /* 발송 출처 — '임직원 등록 발송'(근로+임금 한 세트)은 인사카드에서 개별 취소 불가(canCancel 판정) */
        source: c.source || '',
        body, history: h,
        createdAt: c.created || ((h[0] && h[0].at) ? h[0].at.slice(0, 10) : c.start),
        registeredBy: hrUsers[idx % hrUsers.length],   // 작성 담당자 (초안 임시저장 한 사람)
        sentBy, sentAt,                                // 발송 담당자 / 발송일시 (서명 요청 발송 단계 이후만)
        gapSignedAt, eulSignedAt,
        eulSignName: eulSignedAt ? emp.name : '',
        /* 임금 스냅샷 — 근로유형별 구성(상세 좌측 「계약 정보」 · 본문 급여 조항과 동일 기준) */
        salary: isServiceSeed
          ? { payday: 10, wageType: 'service', contractAmount: 30000000, contractMonths: 12, monthlyAmount: 2500000 }
          : isHourlySeed
          ? { payday: 10, wageType: 'hourly', hourly: 12000, holiday: 2400, contractAmount: 14400,
              hoursPerDay: 8, daysPerWeek: 5, hoursPerWeek: 40 }
          : { payday: 10, wageType: 'annual', wageKind: 'fixedOT', contractAmount: 45000000,
              base: c.baseRaise || '3,200,000', fixedOT: 300000, fixedOTHours: 20,
              hoursPerDay: 8, hoursPerWeek: 40 },
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
  /* 작성 출처(source) 는 row 에 계속 기록하지만 목록에는 노출하지 않는다 —
     '일괄작성 / 개별작성 / 신규입사' 구분이 업무 판단에 쓰이지 않아 「구분」 컬럼을 제거함.
     (이력 desc 로만 남아 상세의 진행 이력에서 확인 가능) */
  /* 화면 표기용 파생 상태 — 서명완료(유효) 계약이 종료일 30일 이내(아직 만료 전)면 '만료 임박'.
     무기계약 / 종료일 없음 / 이미 만료(d<0) / 그 외 상태는 본래 status 유지.
     (legacy 'signed' 는 'active' 로 정규화) */
  function effectiveStatusCode(row) {
    if (!row) return 'draft';
    const code = (row.status === 'signed') ? 'active' : row.status;
    /* 계약 완료(completed) 도 효력 있는 계약이라 만료 임박 파생이 동일하게 적용된다 */
    if ((code === 'active' || code === 'completed') && !row.indefinite && row.endDate) {
      const d = daysBetween(todayStr(), row.endDate);
      if (d >= 0 && d <= 30) return 'expiringSoon';
    }
    return code;
  }
  /* 검색 필터용 상태 코드 — 파생 '만료 임박' 은 필터 항목에 없으므로 원래 상태(서명 완료/계약 완료)로 매칭 */
  function filterStatusCode(r) {
    const c = effectiveStatusCode(r);
    if (c !== 'expiringSoon') return c;
    return (r.status === 'signed') ? 'active' : r.status;
  }
  /* 계약 상태 전이 가능 여부 — 툴바 [회수] / [계약 완료] 활성 판정의 단일 진실원 */
  const SIGNED_CODES = ['active', 'signed'];
  function canWithdraw(r) { return !!r && (r.status === 'signing' || SIGNED_CODES.indexOf(r.status) >= 0); }
  function canComplete(r) { return !!r && SIGNED_CODES.indexOf(r.status) >= 0; }
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
  /* 목록 「계약 기간」 셀 — 무기 근로계약에 임금계약 종료일이 함께 있는 계약(정규직 전환 근로계약서)은
     근로계약 / 연봉계약 기간을 두 줄로 병행 표기한다. 한 문서가 두 기간을 담고 있기 때문. */
  function periodCellHTML(row) {
    if (row.indefinite && row.wageEndDate) {
      const lbl = 'display:inline-block;width:56px;color:var(--color-text-muted);font-size:var(--fs-xs);';
      return `
        <div style="display:flex;flex-direction:column;gap:2px;white-space:nowrap;">
          <span><span style="${lbl}">근로계약</span>${dispYmd(row.startDate)} ~ 기간의 정함 없음</span>
          <span><span style="${lbl}">연봉계약</span>${dispYmd(row.startDate)} ~ ${dispYmd(row.wageEndDate)}</span>
        </div>`;
    }
    return esc(periodText(row));
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
    /* 이력 노출 대상 — 진행 중(signing) 및 회수된 초안(draft)은 제외.
       회수 시 status='draft' 로 복귀하므로 draft 를 걸러야 회수 건이 이력에서 사라진다. */
    return STATE.rows
      .filter(r => r.empId === empId && r.kind === kind && r.status !== 'signing' && r.status !== 'draft')
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
    const docSel     = (p.advanced && p.advanced.docTitle) || '';   /* 계약서 종류 7종 */
    /* 계약 상태 다중 선택 — signing/active/completed/withdrawn/expired.
       legacy 'signed' 는 'active' 로, 파생 '만료 임박' 은 원래 상태(서명 완료/계약 완료)로 매칭한다. */
    const statusSel  = (p.checks && p.checks.status) || [];
    // 계약번호 검색은 특정 문서 조회 — 기간 제한을 적용하지 않는다
    const idLookup = (cond === 'id' && kw);

    STATE.filtered = STATE.rows.filter(r => {
      /* 초안(draft) 은 목록에서 노출하지 않음 — 발송된 계약만 표시. */
      if (r.status === 'draft') return false;
      if (docSel && kindDisplay(r) !== docSel) return false;
      /* 계약 상태 다중 필터 — 선택된 항목이 1개 이상일 때만 적용 */
      if (statusSel.length && !statusSel.includes(filterStatusCode(r))) return false;
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
      /* 기간 빠른칩 — 인사·근태 도메인 표준 6종 (오늘/1주일/1개월/3개월/6개월/1년) */
      quick: ['today','week','m1','m3','m6','y1'],
      conditions: [
        { value: 'empName', label: '성명' },
        { value: 'empId',   label: '사번' },
        { value: 'id',      label: '계약번호' },
      ],
      placeholder: '성명 / 사번 / 계약번호로 검색',
      /* cols:1 — 계약 상태(체크 5개)는 행 전체를 쓰는 wide 필드라, 2컬럼에 섞으면
         라벨만 남고 체크박스가 다음 줄로 떨어진다. 두 필드 모두 한 행씩 쓰게 한다. */
      cols: 1,
      advanced: [
        /* 계약서 종류 7종 — 목록 표기(docTitle) 와 동일 기준 */
        { name: 'docTitle', label: '계약서 종류', options: Object.values(DOC_TITLES) },
      ],
      checkGroups: [
        /* 계약 상태 — 다중 선택. 서명 대기 → 서명 완료 → 계약 완료 / 회수 완료 / 만료 */
        { key: 'status', label: '계약 상태', wide: true, items: [
          { value: 'signing',   label: '서명 대기' },
          { value: 'active',    label: '서명 완료' },
          { value: 'completed', label: '계약 완료' },
          { value: 'withdrawn', label: '회수 완료' },
          { value: 'expired',   label: '만료' },
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
          <!-- 계약 상태 전이 — 서명 대기/서명 완료 건 회수 · 서명 완료 건 최종 계약 완료 처리 -->
          <button class="btn btn--sm" type="button" data-ctr-bulk-withdraw disabled>회수</button>
          <button class="btn btn--sm" type="button" data-ctr-bulk-complete disabled>계약 완료</button>
          <span class="search__divider" style="height:20px;"></span>
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
                <!-- 계약서 종류 — 문서 종류명(정규직 수습 근로계약서 / 용역 위탁계약서 등)이 한 줄에 들어가는 폭 -->
                <th style="width:180px;">계약서 종류</th>
                <th>대상자</th>
                <th style="width:250px;">계약 기간</th>
                <th style="width:120px;text-align:center;">계약 상태</th>
                <th style="width:100px;">담당자</th>
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
        /* 계약서 작성 — 마법사(근로유형 → 계약서 종류 → 대상자 → 정보 입력 → 일괄 작성) 진입 */
        if (e.target.closest('[data-ctr-create-individual]')) {
          openNewCtr();
          return;
        }
        if (e.target.closest('[data-ctr-bulk-send]'))     { doBulkSendForSign(); return; }
        if (e.target.closest('[data-ctr-bulk-delete]'))   { doBulkDelete(); return; }
        /* 계약 상태 전이 */
        if (e.target.closest('[data-ctr-bulk-withdraw]')) { doBulkWithdraw(); return; }
        if (e.target.closest('[data-ctr-bulk-complete]')) { doBulkComplete(); return; }
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
        openEmpCard(row.empId, { name: row.empName, dept: row.empDept });
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

  /* ===== 성명 셀 (계약 관리 공통) — 임직원 관리 목록과 동일 표기.
       24×24 아바타(사진 없으면 이니셜) + 성명 링크 + 부서·직위·직책 muted 메타.
       linkAttr : 클릭 훅 속성 문자열 (예: `data-ctr-emp-card`, `data-ctrnew-emp-card="SW260101"`) ===== */
  function empAvatarHTML(emp, size) {
    const s = size || 24;
    const photo = (emp && emp.photoUrl) || '';
    if (photo) {
      return `<img src="${esc(photo)}" alt="" style="width:${s}px;height:${s}px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.style.background='#E5E7EB';this.removeAttribute('src');" />`;
    }
    const initial = ((emp && emp.name) || '?').charAt(0);
    return `<span style="width:${s}px;height:${s}px;border-radius:50%;background:var(--color-active);color:var(--color-brand-primary);display:inline-flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;">${esc(initial)}</span>`;
  }
  function empMetaHTML(parts) {
    const mu = 'color:var(--color-text-muted);font-size:var(--fs-xs);white-space:nowrap;';
    return (parts || []).filter(Boolean)
      .map(v => `<span style="${mu}">${esc(v)}</span>`)
      .join(`<span style="${mu}">·</span>`);
  }
  function empNameCellHTML(emp, linkAttr, metaParts) {
    const meta = empMetaHTML(metaParts || [emp.dept, emp.rank, emp.position]);
    /* 셀 폭을 넘는 메타는 잘라낸다 — 넘치면 옆 컬럼 위로 겹쳐 그려지는 사고 방지 */
    return `
      <div style="display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden;">
        ${empAvatarHTML(emp)}
        <a href="#" ${linkAttr} style="color:var(--color-brand-primary);font-weight:var(--fw-medium);white-space:nowrap;flex-shrink:0;">${esc(emp.name || '-')}</a>
        ${meta ? `<span style="display:inline-flex;align-items:center;min-width:0;overflow:hidden;">${meta}</span>` : ''}
      </div>`;
  }
  /* 인사정보카드 열기 — 직원 마스터(App.HRInfoMgmt.list) 우선, 없으면 계약 row 정보로 보완 */
  function openEmpCard(empId, fallback) {
    const list = (window.App && App.HRInfoMgmt && App.HRInfoMgmt.list) ? App.HRInfoMgmt.list() : [];
    const src = list.find(r => r.id === empId);
    const member = EMPLOYEES.find(em => em.id === empId) || null;
    const empObj = src || Object.assign({
      id: empId, name: (fallback && fallback.name) || '', dept: (fallback && fallback.dept) || '',
      empType: 'regular', jobCat: 'office', site: '성수동', infoStatus: 'done',
    }, member || {});
    if (window.App && App.HRInfoMgmtCard && App.HRInfoMgmtCard.open) App.HRInfoMgmtCard.open(empObj);
    else if (window.App && App.HRInfoCard && App.HRInfoCard.open) App.HRInfoCard.open(empObj);
  }

  function renderTable() {
    const total = STATE.filtered.length;
    const start = (STATE.page - 1) * STATE.pageSize;
    const rows = STATE.filtered.slice(start, start + STATE.pageSize);

    const body = $('#ctr-list-body'); if (!body) return;
    body.innerHTML = !rows.length
      ? `<tr><td colspan="8" style="text-align:center;color:var(--color-text-muted);padding:32px 0;">조건에 해당하는 계약서가 없습니다.</td></tr>`
      : rows.map(r => {
          const cls = rowAttentionClass(r);
          const sel = STATE.selectedIds.has(r.id);
          /* 성명 셀 — 임직원 관리 목록과 동일 표기 (아바타 + 성명 + 부서·직위·직책) */
          const member = EMPLOYEES.find(em => em.id === r.empId) || null;
          const nameCell = empNameCellHTML(
            Object.assign({ name: r.empName, dept: r.empDept }, member || {}, { name: r.empName }),
            'data-ctr-emp-card',
            [r.empDept, member && member.rank, member && member.position]);
          return `
            <tr data-ctr-row="${esc(r.id)}" class="${cls} ${sel ? 'is-selected' : ''}">
              <td style="text-align:center;"><input type="checkbox" ${sel ? 'checked' : ''} /></td>
              <td><a href="#" data-ctr-row-open class="link-code">${esc(r.id)}</a></td>
              <td style="white-space:nowrap;">${esc(kindDisplay(r))}</td>
              <td>${nameCell}</td>
              <td>${periodCellHTML(r)}</td>
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
    /* 회수 = 서명 대기 + 서명 완료 / 계약 완료 = 서명 완료 건만 */
    const btnWd = pageEl && pageEl.querySelector('[data-ctr-bulk-withdraw]');
    const btnCp = pageEl && pageEl.querySelector('[data-ctr-bulk-complete]');
    if (btnWd) btnWd.disabled = !(has && selected.every(canWithdraw));
    if (btnCp) btnCp.disabled = !(has && selected.every(canComplete));

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
  /* 회수 — 서명 대기 / 서명 완료 계약을 회수 완료로 전환 (직원에게 발송된 문서를 무효화) */
  function doBulkWithdraw() {
    const selected = STATE.rows.filter(r => STATE.selectedIds.has(r.id));
    if (!selected.length) return;
    if (!selected.every(canWithdraw)) {
      window.toast && window.toast('서명 대기 · 서명 완료 상태의 계약만 회수할 수 있습니다.', 'warning'); return;
    }
    window.sweet && window.sweet({
      icon: 'confirm', title: '계약 회수',
      text: `선택한 ${selected.length}건을 회수합니다.\n회수된 계약은 효력이 없으며, 필요하면 새 계약서를 작성해야 합니다.`,
      cancelText: '취소', confirmText: `${selected.length}건 회수`,
      onConfirm: () => {
        selected.forEach(r => {
          const was = STATUS[effectiveStatusCode(r)] ? STATUS[effectiveStatusCode(r)].label : '';
          r.status = 'withdrawn';
          (r.history || (r.history = [])).push({
            at: nowStamp(), title: '계약 회수', desc: `${was} 상태에서 회수 · ${HR_NAME}`, kind: 'warning' });
        });
        STATE.selectedIds.clear();
        applyFilter(); renderTable();
        window.toast && window.toast(`${selected.length}건 회수 완료`, 'success');
      },
    });
  }
  /* 계약 완료 — 서명 완료 계약을 최종 확정 (정상 프로세스의 마지막 단계) */
  function doBulkComplete() {
    const selected = STATE.rows.filter(r => STATE.selectedIds.has(r.id));
    if (!selected.length) return;
    if (!selected.every(canComplete)) {
      window.toast && window.toast('서명 완료 상태의 계약만 계약 완료 처리할 수 있습니다.', 'warning'); return;
    }
    window.sweet && window.sweet({
      icon: 'confirm', title: '계약 완료 처리',
      text: `선택한 ${selected.length}건을 계약 완료 처리합니다.\n서명이 모두 확인된 계약을 최종 확정하는 단계입니다.`,
      cancelText: '취소', confirmText: `${selected.length}건 완료 처리`,
      onConfirm: () => {
        selected.forEach(r => {
          r.status = 'completed';
          r.completedAt = nowStamp();
          (r.history || (r.history = [])).push({
            at: nowStamp(), title: '계약 완료', desc: `서명 확인 후 최종 확정 · ${HR_NAME}`, kind: 'success' });
        });
        STATE.selectedIds.clear();
        applyFilter(); renderTable();
        window.toast && window.toast(`${selected.length}건 계약 완료 처리했습니다.`, 'success');
      },
    });
  }
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
          r.history.push({ at: nowStamp(), title: '서명 요청 발송', desc: '이메일 일괄 발송 · ' + HR_NAME, kind: '' });
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
    EDIT.body = editTemplate()(currentFieldValues());

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

  /** 편집 중 계약의 문서 종류(docTitle) — 계약 유형 + 대상 직원의 근로유형·수습 여부로 7종 중 확정.
   *  (정규직 근로계약서는 수습 체크 여부로 '정규직 수습' / '정규직 전환' 이 갈린다) */
  function editDocTitleNow() {
    return deriveDocTitle(
      { empType: EDIT.empType || (EDIT.emp && EDIT.emp.empType), contractSubType: EDIT.contractSubType },
      { kind: EDIT.kind, probation: !!EDIT.probation });
  }
  /** 편집 중 계약에 적용할 서식 함수 — 문서 종류(7종) 우선, 없으면 계약 유형(kind)으로 폴백.
   *  근로계약서 kind 안에도 수습·촉탁직·시급제 서식이 각각 따로 있으므로 docTitle 로 골라야 한다. */
  function editTemplate() {
    return TEMPLATES[editDocTitleNow()] || TEMPLATES[EDIT.kind] || tplWork;
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
      /* 문서 제목 — 목록 표기(docTitle)와 동일한 7종 기준으로 통일 */
      근로계약서종류: editDocTitleNow(),
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
    EDIT.body = editTemplate()(currentFieldValues());
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
                EDIT.body = editTemplate()(currentFieldValues());
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
    EDIT.body = editTemplate()(currentFieldValues());
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
        row.history.push({ at: nowStamp(), title: '서명 요청 발송', desc: '이메일 발송', kind:'' });
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
    const salaryBlock = {
      base: EDIT.baseSalary || '',
      contractAmount: EDIT.contractAmount || '',
      wageType: EDIT.wageType || '',
      wageContractKind: EDIT.wageContractKind || '',
      fixedOTAmount: EDIT.fixedOTAmount || '',
      inclusiveOTAmount: EDIT.inclusiveOTAmount || '',
      payday: `매월 ${EDIT.payDay || 10}일`,
    };
    /* 계약서 종류 — 본문 렌더에 쓰인 서식과 동일 기준(7종) 으로 확정 */
    const editDocTitle = editDocTitleNow();
    if (!row) {
      row = {
        id: makeContractId(EDIT.emp.id, today),
        kind: EDIT.kind,
        docTitle: editDocTitle,
        mode: EDIT.mode || 'individual',
        empId: EDIT.emp.id, empName: EDIT.emp.name, empDept: EDIT.emp.dept,
        startDate: EDIT.startDate, endDate: isIndef ? '' : EDIT.endDate,
        indefinite: isIndef,
        status, body: EDIT.body,
        history: [{ at: nowStamp(), title: '계약서 작성', desc: HR_NAME, kind: '' }],
        createdAt: today,
        registeredBy: HR_NAME,   // 작성 담당자 (초안)
        sentBy: '', sentAt: '',  // 발송 단계 도달 시 셋팅 (onSendForSign / 일괄 발송)
        salary: salaryBlock,
      };
      STATE.rows.unshift(row);
      EDIT.savedDraftId = row.id;
    } else {
      row.kind = EDIT.kind;
      row.docTitle = editDocTitle;
      row.empId = EDIT.emp.id; row.empName = EDIT.emp.name; row.empDept = EDIT.emp.dept;
      row.startDate = EDIT.startDate; row.endDate = isIndef ? '' : EDIT.endDate;
      row.indefinite = isIndef;
      row.body = EDIT.body; row.status = status;
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
          EDIT.body = editTemplate()(currentFieldValues());
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
    EDIT.body = editTemplate()(currentFieldValues());
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
    EDIT.body = editTemplate()(currentFieldValues());
    renderEditorView(document.getElementById('modal-ctr-view'));
  }

  /* phase 1↔2 토글 — 헤더 타이틀 / 영역 / 푸터 버튼 노출 전환 */
  function applyBulkPhase() {
    const modal = document.getElementById('modal-ctr-bulk');
    if (!modal) return;
    const isPhase1 = BULK.phase === 1;
    const title    = modal.querySelector('#ctr-bulk-title');
    const phase1El = modal.querySelector('#ctr-bulk-phase1');
    const kwEl     = modal.querySelector('[data-ctr-bulk-phase1-only]');
    if (title)    title.textContent = BULK.single ? '대상 직원 선택'
                                    : (isPhase1 ? '계약서 일괄 작성' : `${BULK.kind} 일괄 작성`);
    if (phase1El) phase1El.style.display = isPhase1 ? 'flex' : 'none';
    /* 계약 유형 선택 바 — 개별(단일) 모드에서는 숨김 (유형이 이미 결정됨) */
    const kindBar = modal.querySelector('[data-ctr-bulk-kindbar]');
    if (kindBar) kindBar.style.display = (isPhase1 && !BULK.single) ? '' : 'none';
    /* 헤더 카운트(총 N명 · 선택) */
    const counts = modal.querySelector('[data-ctr-bulk-counts]');
    if (counts) counts.style.display = isPhase1 ? '' : 'none';
    if (kwEl)     kwEl.style.display     = isPhase1 ? '' : 'none';
    renderBulkPhase1();
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
    const allCb = document.querySelector('[data-ctr-bulk-check-all]');
    if (allCb) {
      allCb.style.display = BULK.single ? 'none' : '';   /* 개별(단일) 모드 — 전체 선택 숨김 */
      allCb.checked = !BULK.single && rows.length > 0 && rows.every(r => BULK.selectedIds.has(r.id));
    }
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
        else if (label === '계약 완료 처리')   sub = '서명 확인 후 최종 확정';
      }
      steps.push({ label, sub, state: i === 0 ? 'current' : 'pending' });
    });

    return steps;
  }
  function remainingSteps(status) {
    /* 정상 프로세스 — 서명 요청 발송 → 직원 전자 서명 → 계약 완료 처리.
       서명 대기·서명 완료 단계에서는 아직 '계약 완료' 가 남아 있다. */
    return ({
      draft:    ['서명 요청 발송', '직원 전자 서명', '계약 완료 처리'],
      signing:  ['직원 전자 서명', '계약 완료 처리'],
      signed:   ['계약 완료 처리'],
      active:   ['계약 완료 처리'],
      completed:  [],
      withdrawn:  [],
      expired:  [],
      voided:   [],
      rejected: [],
    })[status] || [];
  }
  function signDeadline(row) {
    /* 재발송(정정) 이 있으면 마지막 발송일 기준으로 기한을 계산한다 */
    const sends = (row.history || []).filter(h => h.title === '서명 요청 발송');
    const sent = (sends[sends.length - 1] || {}).at;
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
      h += r1('지급일', paydayText(salary.payday));
      return h;
    }
    /* legacy 모델 — 직무수당·식대 항목은 운영에서 사용하지 않아 표기하지 않는다 */
    return r1('기본급', won(salary.base))
         + r1('지급일', paydayText(salary.payday));
  }
  /* ===== 상세 좌측 「계약 정보」 — 근로유형(임금 유형)별 구성.
       임직원 등록 「계약 정보」 카드와 동일한 항목·용어를 쓴다.
         · 정규직/계약직/촉탁직 : 연봉 · 임금 산정 방식 · 월 기본급 · 월(고정연장/시간외)수당 · 소정근로시간
         · 일용직               : 시급 · 주휴수당 환산시급 · 계약 시급 · 소정근로(1일 N시간 · 1주 N일)
         · 프리랜서(용역)       : 계약금액 · 계약 개월 · 월 지급액                              ===== */
  function wageTypeOf(row) {
    const s = (row && row.salary) || {};
    if (s.wageType) return s.wageType;
    if (row && row.docTitle === DOC_TITLES.daily)   return 'hourly';
    if (row && row.docTitle === DOC_TITLES.service) return 'service';
    if (s.hourly) return 'hourly';
    if (s.contractMonths) return 'service';
    return 'annual';
  }
  function contractInfoRows(row) {
    const s = (row && row.salary) || {};
    if (!Object.keys(s).length) return '';
    const r1 = (label, val) => `<div class="fm-tbl__row fm-tbl__row--1"><div class="fm-tbl__label">${esc(label)}</div><div class="fm-tbl__value">${val}</div></div>`;
    const won = (v) => { const t = formatNumberWithCommas(v); return t ? t + ' 원' : '-'; };
    const type = wageTypeOf(row);
    let h = '';
    if (type === 'hourly') {
      h += r1('시급', won(s.hourly));
      h += r1('주휴수당 환산시급', won(s.holiday));
      h += r1('계약 시급', won(s.contractAmount));
      const d = Number(s.hoursPerDay || 0), w = Number(s.daysPerWeek || 0);
      h += r1('소정근로', (d || w) ? `1일 ${d || '-'}시간 · 1주 ${w || '-'}일` : '-');
    } else if (type === 'service') {
      h += r1('계약금액', won(s.contractAmount));
      h += r1('계약 개월', s.contractMonths ? `${Number(s.contractMonths)}개월` : '-');
      h += r1('월 지급액', won(s.monthlyAmount));
    } else {
      const kind = s.wageKind || s.wageContractKind || 'fixedOT';
      const inclusive = kind === 'inclusive';
      h += r1('연봉', won(s.contractAmount));
      h += r1('임금 산정 방식', inclusive ? '포괄임금' : '일반');
      h += r1('월 기본급', won(s.base));
      const ot = inclusive ? (s.inclusiveOT || s.inclusiveOTAmount) : (s.fixedOT || s.fixedOTAmount);
      h += r1(inclusive ? '월 고정연장근무수당' : '월 시간외수당', won(ot));
      if (s.fixedOTHours) h += r1('기준시간', `월 ${Number(s.fixedOTHours)}시간`);
      const d = Number(s.hoursPerDay || 8), w = Number(s.hoursPerWeek || 40);
      h += r1('소정근로시간', `1일 ${d}시간 · 1주 ${w}시간 · 월 209시간`);
    }
    h += r1('지급일', paydayText(s.payday));
    return h;
  }
  /* 지급일 표기 — 숫자(10) / 문자열('매월 10일') 모두 '매월 N일' 로 통일. 급여 지급일은 매월 10일. */
  function paydayText(v) {
    const s = String(v == null ? '' : v).trim();
    if (!s) return '매월 10일';
    const n = s.replace(/[^0-9]/g, '');
    return n ? `매월 ${Number(n)}일` : esc(s);
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
    if (['active','completed','expired','voided'].includes(row.status)) actBtns.push(`<button class="btn" type="button" data-ctr-d-pdf>PDF 다운로드</button>`);
    /* 정정 — 계약 완료 건은 직원과 합의해 조건을 고치고 다시 서명을 받는다(→ 서명 대기) */
    if (isHR && row.status === 'completed')                   actBtns.push(`<button class="btn btn--primary" type="button" data-ctr-d-amend>정정</button>`);
    /* 회수 — 계약 관리에서 직접 발송한 건만 가능. 신규입사(임직원 등록/인사카드 발송분, source 있음)는
       임직원 등록 측에서 세트로 관리되므로 회수 불가. */
    if (isHR && row.status === 'signing' && !row.source)      actBtns.push(`<button class="btn" type="button" data-ctr-d-recall>회수</button>`);
    if (isHR && row.status === 'signed')                      actBtns.push(`<button class="btn" type="button" data-ctr-d-cancelsign>서명 취소</button>`);

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
      titleEl.innerHTML = `${esc(row.empName)} · ${esc(kindDisplay(row))} <span style="margin-left:6px;">${statusPill(effectiveStatusCode(row))}</span>${dday ? ' ' + dday : ''}`;
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
              <div class="fm-tbl__row fm-tbl__row--1"><div class="fm-tbl__label">계약서 종류</div><div class="fm-tbl__value">${esc(kindDisplay(row))}</div></div>
              <div class="fm-tbl__row fm-tbl__row--1"><div class="fm-tbl__label">직원</div><div class="fm-tbl__value">${esc(row.empName)} (${esc(row.empId)})</div></div>
              <div class="fm-tbl__row fm-tbl__row--1"><div class="fm-tbl__label">소속</div><div class="fm-tbl__value">${esc(row.empDept)}</div></div>
              <div class="fm-tbl__row fm-tbl__row--1"><div class="fm-tbl__label">계약 기간</div><div class="fm-tbl__value">${periodCellHTML(row)}</div></div>
              <div class="fm-tbl__row fm-tbl__row--1"><div class="fm-tbl__label">계약 상태</div><div class="fm-tbl__value">${statusPill(effectiveStatusCode(row))}</div></div>
              ${contractInfoRows(row)}
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
    /* 정정 — 계약 완료 건의 조건을 고쳐 다시 서명 요청 (직원 합의 전제) */
    on('[data-ctr-d-amend]', () => { closeCtrModal(); openAmendCtr(row.id); });
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
          r.history.push({ at: nowStamp(), title: '서명 요청 발송', desc: '이메일 발송 · ' + HR_NAME, kind: '' });
          window.toast && window.toast(`서명 요청 발송 완료 — ${r.id}`, 'success');
        }),
      });
    });
    on('[data-ctr-d-recall]', () => {
      window.sweet && window.sweet({
        icon: 'confirm', title: '서명 요청 회수',
        text: '양 당사자 모두 미서명 시에만 회수할 수 있습니다. 회수 시 계약서는 초안 상태로 복귀합니다.',
        cancelText: '취소', confirmText: '회수',
        onConfirm: () => {
          /* 회수 → status='draft' 로 복귀. 초안은 목록·이력에서 숨겨지므로 detail 뷰를
             재렌더하지 않고 모달을 닫고 목록으로 복귀한다(재렌더 시 초안 상세가 열린 채 남는 문제 방지). */
          const r = STATE.rows.find(x => x.id === STATE.detailId);
          if (r) {
            r.status = 'draft';
            r.history.push({ at: nowStamp(), title: '서명 요청 회수', desc: HR_NAME, kind:'' });
          }
          goList();
          window.toast && window.toast('서명 요청이 회수되었습니다.', 'success');
        },
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
          r.history.push({ at: nowStamp(), title: '직원 서명 취소', desc: HR_NAME, kind: 'warning' });
          window.toast && window.toast('직원 서명이 취소되었습니다.', 'success');
        }),
      });
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
    ['modal-ctr-emppick'].forEach(id => {
      const m = document.getElementById(id); if (!m) return;
      /* 오버레이(backdrop) 클릭 */
      m.addEventListener('click', (e) => { if (e.target === m) closeAllModals(); });
      /* 닫기(✕)·취소 버튼 (data-modal-close) — 전역 닫기 핸들러가 없어 직접 바인딩 */
      m.querySelectorAll('[data-modal-close]').forEach(b => b.addEventListener('click', closeAllModals));
    });
  }

  /* =========================================================================
   *  SCR-CTR-06 계약서 작성 (마법사) — 근로유형 → 계약서 종류 → 대상자 → 정보 입력 → 일괄 작성
   *
   *  1. 근로유형 선택      : 정규직 / 계약직 / 촉탁직 / 일용직 / 프리랜서
   *  2. 계약서 종류 선택   : 근로유형별 라디오 (계약서 종류 7종 중)
   *     · 종류마다 대상자 검색조건이 다르다 (수습평가 결과 / 계약종료일 임박 등)
   *  3. 대상자 복수 선택   : 검색조건으로 좁힌 후보 중 체크박스 선택
   *  4. 정보 입력          : 계약 조건은 공통 입력, 금액은 대상자별 인라인 입력
   *  5. 일괄 작성          : 대상자별 동일 종류 계약서 1부씩 생성(서명 요청 발송 상태)
   * ========================================================================= */
  /* 근로유형 4종 — 촉탁직은 계약직의 세부유형이라 별도 유형으로 두지 않고
     「계약직」 선택 시 계약서 종류에서 계약직 / 촉탁직 근로계약서로 갈린다. */
  const NEW_TYPES = [
    ['regular',    '정규직'],
    ['contract',   '계약직'],
    ['daily',      '일용직'],
    ['freelancer', '프리랜서'],
  ];
  /* 근로유형 → 선택 가능한 계약서 종류 (배열 순서 = 화면 노출 순서. 가장 많이 쓰는 종류를 앞에) */
  const NEW_DOCS = {
    regular:    [DOC_TITLES.annual, DOC_TITLES.probation, DOC_TITLES.permanent],
    contract:   [DOC_TITLES.contract, DOC_TITLES.chotak],
    daily:      [DOC_TITLES.daily],
    freelancer: [DOC_TITLES.service],
  };
  /* 근로유형 선택 시 미리 선택되는 계약서 종류 — 종류가 1개면 자동,
     정규직은 「정규직 연봉 계약서」 / 계약직은 「계약직 근로계약서」 기본 (가장 빈도 높은 업무) */
  const NEW_DOC_DEFAULT = {
    regular:  DOC_TITLES.annual,
    contract: DOC_TITLES.contract,
  };
  function newDefaultDoc(empType) {
    const docs = NEW_DOCS[empType] || [];
    if (docs.length === 1) return docs[0];
    const d = NEW_DOC_DEFAULT[empType];
    return docs.indexOf(d) >= 0 ? d : '';
  }
  /* 계약서 종류별 — 대상자 풀 / 검색조건 / 임금 입력 형태 / 계약기간 규칙
   *   pool     : 'probEval'(수습평가 결과 기준) | 'annual'(연봉 갱신 대상) | 'emp'(근로유형 기준)
   *   rangeLabel : 기간 조회 기준 컬럼명. 전 종류 공통으로 '오늘로부터 과거 N개월' 을 조회한다
   *                (수습평가가 끝났거나 계약이 종료된 뒤에 새 계약서를 쓰는 흐름).
   *   wage     : 'annual'(연봉+임금산정방식) | 'hourly'(시급+소정근로) | 'service'(용역대금+개월)
   *   term     : 계약기간 규칙 — { months } 개월 고정 | { indefinite } 무기 | { pick } 사용자 선택 */
  const NEW_DOC_CFG = {
    /* 수습 연장 — 목적이 '기간 연장' 이라 계약기간만 새로 정하고 임금 조건은 기존 계약을 그대로 승계한다 */
    [DOC_TITLES.probation]: { kind:'근로계약서', pool:'probEval', evalResult:'hold',
      rangeLabel:'수습평가 완료일', wage:'annual', term:{ months:3 },
      lock:{ amount:true, cond:true }, inherit:true,
      desc:'수습연장 직원 대상' },
    /* 정규직 전환 — 근로계약은 기간의 정함 없음(무기). 단, 임금계약 종료일은 지정해야 하므로
       term.wageEnd 로 「종료일 입력 = 임금계약 종료일」 임을 표시한다. */
    [DOC_TITLES.permanent]: { kind:'근로계약서', pool:'probEval', evalResult:'pass',
      rangeLabel:'수습평가 완료일', wage:'annual', term:{ indefinite:true, wageEnd:true, months:12 },
      /* 근로계약은 입사일부터 기간의 정함 없음 — 임금계약 시작일도 입사일 고정(수정 불가) */
      startFrom:'join', lock:{ start:true },
      desc:'수습해제 직원 대상' },
    [DOC_TITLES.annual]:    { kind:'임금계약서', pool:'annual',
      rangeLabel:'계약 종료일', wage:'annual', term:{ months:12 }, joinFilter:true,
      desc:'연봉 갱신 · 변경' },
    [DOC_TITLES.contract]:  { kind:'근로계약서', pool:'emp', empType:'contract', sub:'',
      rangeLabel:'계약 종료일', wage:'annual', term:{ pick:true, months:12 },
      desc:'계약 갱신 · 변경' },
    [DOC_TITLES.chotak]:    { kind:'근로계약서', pool:'emp', empType:'contract', sub:'chotak',
      rangeLabel:'계약 종료일', wage:'annual', term:{ pick:true, months:12 },
      desc:'촉탁 계약 갱신 · 변경' },
    [DOC_TITLES.daily]:     { kind:'근로계약서', pool:'emp', empType:'daily',
      rangeLabel:'계약 종료일', wage:'hourly', term:{ pick:true, months:1 },   /* 일용직 기본 1개월 */
      inherit:true,                                                            /* 시급 기본값 = 기존 시급 */
      desc:'계약 갱신 · 변경' },
    [DOC_TITLES.service]:   { kind:'근로계약서', pool:'emp', empType:'freelancer',
      rangeLabel:'계약 종료일', wage:'service', term:{ pick:true, months:12 },
      desc:'용역 계약 갱신 · 변경' },
  };
  const NEW_RANGE   = [1, 3, 6];               /* 검색조건 기간 range (개월) — 기본 1 */
  const NEW_TERMS   = [1, 3, 6, 12];           /* 계약기간 일괄 적용 옵션 (개월) */
  /* 기준시간 카테고리 — 인사정보 관리의 임금 산정 방식 표와 동일 (지급배율 단일 진실원) */
  const NEW_OT_CATS = [
    { key:'extension',       label:'연장근로',         rate:1.5 },
    { key:'night',           label:'야간근로',         rate:0.5 },
    { key:'nightExt',        label:'야간연장근로',     rate:2.0 },
    { key:'holiday',         label:'휴일근로',         rate:1.5 },
    { key:'holidayExt',      label:'휴일연장근로',     rate:2.0 },
    { key:'holidayNight',    label:'휴일야간근로',     rate:2.0 },
    { key:'holidayNightExt', label:'휴일야간연장근로', rate:2.5 },
  ];
  const NEW = {
    step: 'pick', empType: '', docTitle: '',
    from: '', to: '', preset: 1,   /* 검색 기간 — 시작일 ~ 종료일 + 프리셋(과거 1·3·6개월) */
    joinFrom: '', joinTo: '',      /* 정규직 연봉 계약서 — 입사일 기간 필터(선택) */
    keyword: '',
    formChecked: new Set(),        /* 정보 입력 단계 — 일괄 적용 대상 행 */
    detailBulk: false,             /* 상세 조건 모달을 일괄(선택 행 전체) 모드로 열었는지 */
    searched: false,               /* [조회] 를 눌러야 대상자 목록을 표시 */
    selected: new Set(),
    termMonths: 12,
    wageKind: 'fixedOT',
    otHours: {},          /* 기준시간 — { catKey: hours } */
    stdDay: 8, stdWeek: 5,/* 일용직 소정근로 — 1일 N시간 / 1주 N일 */
    svcMonths: 12,        /* 용역 위탁 계약 개월 수 */
    amounts: {},          /* empId → 금액(연봉/시급/총 용역대금) */
    raisePct: {},         /* empId → 연봉 인상률(%) 입력값. 금액과 양방향 동기 — 표시용 원본 문자열 */
    bulkPct: '',          /* 일괄 적용 바의 인상률 입력값 */
    terms: {},            /* empId → { start, end, indefinite } 개별 지정 계약기간 */
    overrides: {},        /* empId → 개별 상세 조건 (임금 산정 방식·기준시간·소정근로 등) */
    detailEmpId: '',      /* 상세 조건 설정 모달 대상 */
    amendId: '',          /* 정정 모드 — 정정 대상 계약번호 (있으면 대상자 1명 고정) */
    bulkAmt: 0,           /* 일괄 적용 바 — 금액 입력값 (재렌더에도 유지) */
    bulkEnd: '',          /* 일괄 적용 — 종료일 직접 지정 값 */
    bulkTermMode: '',     /* '' | 'custom' — 계약기간 드롭다운에서 '직접입력' 선택 여부 */
    bulkTermApplied: 0,   /* 마지막으로 일괄 적용한 개월 수 (드롭다운 표시용) */
  };

  function newCfg() { return NEW_DOC_CFG[NEW.docTitle] || null; }
  /* YYYY-MM-DD ± N개월 (말일 보정) */
  function shiftMonths(ymd, n) {
    if (!ymd) return '';
    const d = new Date(ymd); if (isNaN(d.getTime())) return '';
    const day = d.getDate();
    d.setMonth(d.getMonth() + n);
    if (d.getDate() < day) d.setDate(0);
    return ymd2(d);
  }
  function ymd2(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function shiftDays(ymd, n) {
    if (!ymd) return '';
    const d = new Date(ymd); if (isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + n);
    return ymd2(d);
  }
  /* 특정 종류의 계약서 보유 여부 (서명완료·만료 포함) */
  function hasSignedDoc(empId, docTitle) {
    return STATE.rows.some(r => r.empId === empId && r.docTitle === docTitle
      && ['active','signed','expired'].indexOf(r.status) >= 0);
  }
  /* 근속 연수 (입사일 기준, 오늘까지) */
  function tenureYears(emp) {
    if (!emp || !emp.joinDate) return 0;
    return (new Date(todayStr()) - new Date(emp.joinDate)) / (365.25 * 86400000);
  }
  /* 현재(직전) 계약 — 계약 이력의 최신 근로/용역 계약서가 단일 진실원.
     만료된 계약도 갱신 대상이므로 expired 를 포함한다. 이력이 없으면 직원 마스터로 폴백. */
  /* 체결이 끝난 계약 중 기준이 되는 1건 —
       ① 「계약 완료」 처리된 것 중 가장 최신
       ② 없으면 서명 완료 / 만료 중 가장 최신
     (서명 대기 · 회수 완료 · 반려 · 무효 건은 애초에 후보에서 제외된다) */
  function pickBasisRow(rows) {
    const byNewest = (a, b) => (b.startDate || '').localeCompare(a.startDate || '')
                            || (b.createdAt || '').localeCompare(a.createdAt || '');
    const done = rows.filter(r => r.status === 'completed').sort(byNewest);
    if (done.length) return done[0];
    return rows.slice().sort(byNewest)[0] || null;
  }
  function currentTermRow(emp) {
    if (!STATE.rows || !STATE.rows.length) STATE.rows = makeMock();
    const rows = STATE.rows
      .filter(r => r.empId === emp.id && r.kind === '근로계약서'
                && ['completed','active','signed','expired'].indexOf(r.status) >= 0);
    return pickBasisRow(rows);
  }
  function currentTermEnd(emp) {
    const r = currentTermRow(emp);
    if (r) return r.indefinite ? '' : (r.endDate || '');
    return emp.contractEndDate || '';
  }
  /* 기존 계약기간 표기 — 'YY/MM/DD ~ YY/MM/DD' (무기 계약은 '기간의 정함 없음') */
  function currentTermText(emp) {
    const r = currentTermRow(emp);
    const s = r ? r.startDate : (emp.contractStartDate || '');
    const e = r ? (r.indefinite ? '' : r.endDate) : (emp.contractEndDate || '');
    const indef = r ? !!r.indefinite : (!e && !!s);
    if (!s) return '-';
    return `${dispYmd(s)} ~ ${indef ? '기간의 정함 없음' : (dispYmd(e) || '-')}`;
  }
  /* 정규직 연봉 계약서 대상자의 '기존 계약기간' — 근로계약(무기) 이 아니라 임금 계약 기준.
       ① 최신 정규직 연봉 계약서의 계약기간
       ② ① 이 없으면 정규직 전환 근로계약서에 기록된 임금계약기간 (wageEndDate)
     후보 산출 기준일(base) 과 같은 값을 쓰므로 "왜 이 사람이 조회됐는가" 가 화면에서 바로 읽힌다. */
  function annualPrevTerm(emp) {
    if (!emp) return null;
    if (!STATE.rows || !STATE.rows.length) STATE.rows = makeMock();
    const SIGNED = ['completed', 'active', 'signed', 'expired'];
    const rows = STATE.rows.filter(r => r.empId === emp.id && SIGNED.indexOf(r.status) >= 0);
    const a = pickBasisRow(rows.filter(r => r.docTitle === DOC_TITLES.annual || r.kind === '임금계약서'));
    if (a) return { row: a, start: a.startDate || '', end: a.endDate || '', indefinite: !!a.indefinite, source: 'annual' };
    const p = pickBasisRow(rows.filter(r => r.docTitle === DOC_TITLES.permanent));
    if (p) return { row: p, start: p.startDate || '', end: p.wageEndDate || '', indefinite: !p.wageEndDate, source: 'permanent' };
    return null;
  }
  /* 대상자 조회의 기준이 된 계약서 — 계약이 체결(서명 완료/계약 완료)된 것 중 가장 최신 1건.
     서명 대기·회수 완료·반려·무효 건은 기준이 되지 않는다.
     연봉 계약서 대상자는 임금 계약 기준(연봉 계약서 → 없으면 전환 근로계약서), 그 외는 근로/용역 계약. */
  function prevBasisRow(emp) {
    if ((newCfg() || {}).pool === 'annual') {
      const w = annualPrevTerm(emp);
      return (w && w.row) || null;
    }
    return currentTermRow(emp);
  }
  /* 기준 계약서 셀 — 「계약서 종류 (계약번호)」 한 줄 일반 텍스트.
     왜 이 대상자가 조회됐는지 근거를 한눈에 보여준다. */
  function prevBasisCellHTML(emp) {
    const r = prevBasisRow(emp);
    if (!r) return `<span style="color:var(--color-text-muted);">-</span>`;
    return `<a href="#" data-ctrnew-doc="${esc(r.id)}" title="계약서 보기"
              style="white-space:nowrap;color:var(--color-brand-primary);">${esc(kindDisplay(r))} (${esc(r.id)})</a>`;
  }
  function annualPrevTermText(emp) {
    const w = annualPrevTerm(emp);
    if (!w || (!w.start && !w.end)) return '연봉계약 미체결';
    const indef = w.indefinite && !w.end;
    return `${dispYmd(w.start) || '-'} ~ ${indef ? '기간의 정함 없음' : (dispYmd(w.end) || '-')}`;
  }
  /* 정정 모드 — 기존 계약 = 정정 대상 계약서 그 자체 */
  function amendRow() { return NEW.amendId ? (STATE.rows.find(r => r.id === NEW.amendId) || null) : null; }
  /* 계약서 종류에 맞는 '기존 계약' 기간 — 연봉 계약서는 임금 계약 기간, 그 외는 근로/용역 계약 기간 */
  function prevTermText(emp) {
    const ar = amendRow();
    if (ar) return periodText(ar);
    return (newCfg() || {}).pool === 'annual' ? annualPrevTermText(emp) : currentTermText(emp);
  }
  function prevTermLabel() {
    return (newCfg() || {}).pool === 'annual' ? '임금 계약 기간' : '계약기간';
  }

  /* 검색 기간 프리셋 — 오늘로부터 과거 N개월 (1·3·6개월). 전 계약서 종류 공통 규칙. */
  function newApplyPreset(months) {
    const today = todayStr();
    NEW.preset = months;
    NEW.from = shiftMonths(today, -months);
    NEW.to   = today;
  }
  /* 계약서 종류별 검색 기간 기본값 —
   *   정규직 연봉 계약서 : 연봉은 매년 2/28 기준으로 갱신되므로
   *       · 계약 종료일 = ~ 당해 2월 28일 (그날까지 종료되는 연봉계약)
   *       · 입사일     = ~ 당해-1년 2월 28일 (첫 인상 기준일 = 입사 1년 이상 경과)
   *   그 외 종류        : 오늘로부터 과거 1개월 */
  function newApplyDefaultRange() {
    const cfg = newCfg() || {};
    const y = Number(todayStr().slice(0, 4));
    if (cfg.pool === 'annual') {
      NEW.preset   = 0;
      NEW.from     = '';
      NEW.to       = `${y}-02-28`;
      NEW.joinFrom = '';
      NEW.joinTo   = `${y - 1}-02-28`;
      return;
    }
    NEW.joinFrom = ''; NEW.joinTo = '';
    newApplyPreset(1);
  }

  /* 대상자 후보 — 계약서 종류의 검색조건(기간 + 성명·사번)을 적용해 산출.
     반환: [{ emp, base(기준일: 평가완료일 또는 계약종료일), note }] */
  function newCandidates() {
    /* 정정 모드 — 검색 조건과 무관하게 정정 대상 계약의 직원 1명만 */
    if (NEW.amendId) { const c = amendCandidate(); return c ? [c] : []; }
    const cfg = newCfg(); if (!cfg) return [];
    const HRI = window.App && App.HRInfoMgmt;
    const all = ((HRI && HRI.list) ? HRI.list() : [])
      .filter(e => e && !e.contractOut && e.status !== 'retired');
    const from = NEW.from || '';
    const to   = NEW.to   || '';
    const inRange = (d) => !!d && (!from || d >= from) && (!to || d <= to);
    let rows = [];
    if (cfg.pool === 'probEval') {
      /* 수습평가 결과 기준 — 평가 완료일이 조회 기간 내인 직원 */
      const PE = window.App && App.HRProbEval;
      rows = all.filter(e => e.empType === 'regular').map(e => {
        const r = (PE && PE.getResult) ? PE.getResult(e.id) : null;
        const at = (r && r.submittedAt) ? String(r.submittedAt).slice(0, 10) : '';
        return { emp: e, result: r && r.result, base: at };
      }).filter(x => x.result === cfg.evalResult && inRange(x.base));
    } else if (cfg.pool === 'annual') {
      /* 연봉 갱신 대상 — 정규직 전환 근로계약서 보유 + (연봉계약 미체결 | 종료일이 조회 기간 내)
         + (선택) 입사일 기간 필터 — 갱신 차수를 입사 시기로 좁힐 때 사용 */
      const jf = NEW.joinFrom || '', jt = NEW.joinTo || '';
      rows = all.filter(e => e.empType === 'regular' && hasSignedDoc(e.id, DOC_TITLES.permanent))
        .map(e => {
          /* 기준일 = 표시되는 '임금 계약 기간' 의 종료일 (연봉 계약서 → 없으면 전환 계약서의 임금계약기간) */
          const w = annualPrevTerm(e);
          return { emp: e, base: (w && !w.indefinite) ? (w.end || '') : '',
                   note: (w && w.source === 'annual') ? '' : '연봉계약 미체결' };
        })
        .filter(x => !x.base ? true : inRange(x.base))
        .filter(x => {
          const j = x.emp.joinDate || '';
          if (jf && (!j || j < jf)) return false;
          if (jt && (!j || j > jt)) return false;
          return true;
        });
    } else {
      /* 근로유형 기준 — 현재 계약 종료일이 조회 기간 내(갱신 대상) */
      rows = all.filter(e => e.empType === cfg.empType
                          && (cfg.sub == null || (e.contractSubType || '') === cfg.sub))
        .map(e => ({ emp: e, base: currentTermEnd(e) }))
        .filter(x => inRange(x.base));
    }
    const kw = (NEW.keyword || '').trim().toLowerCase();
    if (kw) rows = rows.filter(x => (x.emp.name || '').toLowerCase().includes(kw)
                                 || (x.emp.id || '').toLowerCase().includes(kw));
    return rows.sort((a, b) => (a.base || '').localeCompare(b.base || ''));
  }

  /* 대상자별 계약기간 — 시작일 = 기존 계약(연봉계약) 종료일 다음날, 없으면 오늘.
     종료일 = 시작일 + 계약기간(개월) - 1일. 무기 계약이면 종료일 없음. */
  function newTermFor(cand) {
    const cfg = newCfg() || {};
    const indef   = !!(cfg.term && cfg.term.indefinite);
    const wageEnd = !!(cfg.term && cfg.term.wageEnd);   /* 무기 근로계약 + 임금계약 종료일 지정 */
    /* 대상자별로 직접 지정한 계약기간이 있으면 그것을 우선 사용 (스프레드시트 편집).
       무기/임금종료 여부는 계약서 종류가 정하므로 cfg 로 다시 판정한다. */
    const ov = NEW.terms[cand.emp.id];
    if (ov && (ov.start || ov.end)) {
      return { start: ov.start || '',
               end: (indef && !wageEnd) ? '' : (ov.end || ''),
               indefinite: indef, wageEnd };
    }
    const prevEnd = cfg.pool === 'annual' ? cand.base
                  : (cfg.pool === 'probEval' ? (currentTermEnd(cand.emp) || cand.base) : cand.base);
    /* 정규직 전환 — 근로계약이 입사일부터 기간의 정함 없음으로 전환되므로 임금계약 시작일도 입사일 */
    const start = (cfg.startFrom === 'join' && cand.emp.joinDate)
      ? cand.emp.joinDate
      : (prevEnd ? shiftDays(prevEnd, 1) : todayStr());
    if (indef) {
      /* 무기 근로계약 — 임금계약 종료일은 담당자가 직접 지정(기본 빈값) */
      return { start, end: '', indefinite: true, wageEnd };
    }
    const months = (cfg.term && cfg.term.pick) ? NEW.termMonths
                 : (cfg.wage === 'service' ? NEW.svcMonths : (cfg.term && cfg.term.months) || 12);
    const end = shiftDays(shiftMonths(start, months), -1);
    return { start, end, indefinite: false, wageEnd: false, months };
  }
  /* 대상자별 유효 조건 — 공통값 위에 개별 상세 조건(overrides)을 덮어쓴 결과 */
  function newCondFor(empId) {
    const base = {
      wageKind: NEW.wageKind, otHours: Object.assign({}, NEW.otHours),
      stdDay: NEW.stdDay, stdWeek: NEW.stdWeek, svcMonths: NEW.svcMonths,
    };
    return Object.assign(base, NEW.overrides[empId] || {});
  }
  /* 개별 상세 조건이 지정됐는지 (행 뱃지 표시용) */
  function newHasOverride(empId) {
    const o = NEW.overrides[empId];
    return !!(o && Object.keys(o).length);
  }
  function newNum(v) { return Number(String(v == null ? '' : v).replace(/[^0-9.]/g, '')) || 0; }

  /* 계약서 작성 상세(인페이지) 셸 — 계약 관리 페이지 콘텐츠를 page-bar + 스크롤 본문으로 교체.
     모달이 아니라 상세 화면이라 목록으로 돌아갈 때 renderListView 로 복원한다. */
  function renderNewCtrShell(pageEl) {
    STATE.view = 'new';
    pageEl.innerHTML = `
      <div class="page-bar">
        <!-- ← : 정보 입력 단계면 이전 단계(대상자 선택)로, 첫 단계면 목록으로 -->
        <button class="page-bar__back" type="button" data-ctrnew-backnav aria-label="이전으로">←</button>
        <div class="page-bar__divider"></div>
        <div class="page-bar__title" data-ctrnew-title>계약서 작성</div>
      </div>
      <div style="flex:1;min-height:0;display:flex;flex-direction:column;">
        <div data-ctrnew-body></div>
      </div>
      <!-- 하단 액션 바 — 발령 등록 모달의 [취소][등록] 과 동일한 위치 규칙 -->
      <div class="detail-footer">
        <span class="detail-footer__hint" data-ctrnew-hint></span>
        <div class="detail-footer__actions">
          <button class="btn" type="button" data-ctrnew-back hidden>이전</button>
          <button class="btn" type="button" data-ctrnew-close>취소</button>
          <button class="btn btn--primary" type="button" data-ctrnew-next disabled>다음 · 정보 입력</button>
          <button class="btn btn--primary" type="button" data-ctrnew-submit hidden>서명 요청 발송</button>
        </div>
      </div>`;
    wireNewCtr(pageEl);
  }
  /* 목록으로 복귀 */
  function closeNewCtr() {
    const pageEl = document.getElementById('page-hr-contract');
    if (!pageEl) return;
    NEW.amendId = '';           /* 정정 모드 해제 */
    renderListView(pageEl);
    applyFilter();
    renderTable();
  }

  /* 카드 셸 — 단계별 블록 */
  function newCard(title, body, hint) {
    return `
      <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:8px;margin-bottom:14px;box-shadow:0 1px 2px rgba(15,23,42,0.04);">
        <header style="padding:11px 16px;border-bottom:1px solid var(--color-divider);display:flex;align-items:center;gap:8px;">
          <span style="font-size:14px;font-weight:var(--fw-semibold);color:var(--color-text);">${title}</span>
          ${hint ? `<span style="font-size:12px;color:var(--color-text-muted);">${hint}</span>` : ''}
        </header>
        <div style="padding:14px 16px;">${body}</div>
      </section>`;
  }

  function renderNewCtr() {
    /* 정정 모드 — 페이지 상세가 아니라 모달 본문을 갱신한다 */
    if (NEW.amendId) { renderAmendCtr(); return; }
    const modal = document.getElementById('page-hr-contract');
    if (!modal || !modal.querySelector('[data-ctrnew-body]')) return;
    const cfg = newCfg();
    const titleEl = modal.querySelector('[data-ctrnew-title]');
    if (titleEl) titleEl.textContent = NEW.amendId
      ? `${NEW.docTitle} 정정 — ${NEW.amendId}`
      : (NEW.step === 'form' ? `${NEW.docTitle} 정보 입력` : '계약서 작성');
    const bodyEl = modal.querySelector('[data-ctrnew-body]');
    /* 단계별 본문 레이아웃 — 정보 입력 단계는 그리드 화면(툴바 고정 + 행만 스크롤) */
    bodyEl.style.cssText = NEW.step === 'form'
      ? 'flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;padding:0;background:var(--color-surface);'
      /* 대상자 선택 — 좌(조건 고정) | 우(목록 스크롤) split. 페이지 자체는 스크롤하지 않는다 */
      : 'flex:1;min-height:0;display:flex;overflow:hidden;padding:0;background:var(--color-surface);';
    bodyEl.innerHTML = NEW.step === 'form' ? renderNewForm() : renderNewPick();
    /* 2단 헤더 sticky — 두 번째 행이 붙을 위치(첫 행 높이) 를 실측해 주입 */
    const tbl = bodyEl.querySelector('[data-ctrnew-table]');
    if (tbl) {
      const h1 = tbl.querySelector('thead tr');
      if (h1) tbl.style.setProperty('--tbl-h2', Math.round(h1.getBoundingClientRect().height) + 'px');
    }
    /* 액션 버튼 상태 */
    const next = modal.querySelector('[data-ctrnew-next]');
    const back = modal.querySelector('[data-ctrnew-back]');
    const sub  = modal.querySelector('[data-ctrnew-submit]');
    const hint = modal.querySelector('[data-ctrnew-hint]');
    const isForm = NEW.step === 'form';
    const isAmend = !!NEW.amendId;
    next.hidden = isForm; back.hidden = !isForm || isAmend; sub.hidden = !isForm;
    next.disabled = !(NEW.docTitle && NEW.selected.size);
    /* 정정은 단계 이동이 없고 곧바로 재서명 요청 */
    sub.textContent = isAmend ? '정정 · 서명 요청 발송' : '서명 요청 발송';
    /* 하단 액션 바 좌측은 비워 둔다 — 대상자 수는 표 상단 카운트로, 생성 규칙(대상자별 1부)은
       모든 계약서에 동일하게 적용되어 안내가 불필요하다. */
    if (hint) hint.textContent = '';
  }

  /* ── STEP 1 : ① 계약서 선택(근로유형·종류) → ② 대상자 선택(검색조건 → 조회 → 목록) ──
       라벨은 전 행 공통 폭(NEW_LABEL_W)으로 좌측 정렬을 맞춘다. */
  const NEW_LABEL_W = 92;
  function newLabel(text) {
    return `<span style="display:inline-block;width:${NEW_LABEL_W}px;flex:0 0 ${NEW_LABEL_W}px;font-size:var(--fs-sm);color:var(--color-text-sub);">${text}</span>`;
  }
  function renderNewPick() {
    const cfg = newCfg();
    /* 좌측 패널(400px)은 폭이 좁아 라벨을 위에 두고 컨트롤을 아래 full-width 로 배치한다.
       aside 는 라벨 줄 우측에 붙는 보조 컨트롤(기간 프리셋 칩 등). */
    const row = (label, body, aside) =>
      `<div style="display:flex;flex-direction:column;gap:6px;">
         <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:22px;">
           <span style="font-size:var(--fs-sm);color:var(--color-text-sub);">${label}</span>
           ${aside || ''}
         </div>
         <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">${body}</div>
       </div>`;

    /* ===== ① 계약서 선택 ===== */
    const typeChips = NEW_TYPES.map(([v, l]) =>
      `<button class="chip-choice__item${NEW.empType === v ? ' is-active' : ''}" type="button" data-ctrnew-type="${v}">${l}</button>`).join('');
    const docs = NEW_DOCS[NEW.empType] || [];
    /* 계약서 종류 — 좁은 패널이라 라디오 나열 대신 드롭다운 1개 + 선택된 종류 설명 한 줄 */
    const docSelect = !NEW.empType
      ? `<span style="font-size:13px;color:var(--color-text-muted);">근로유형을 먼저 선택해 주세요.</span>`
      : `<select class="select" data-ctrnew-doc-select style="width:100%;">
           ${docs.map(d => `<option value="${esc(d)}" ${NEW.docTitle === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}
         </select>`;
    const pickDoc = `<div style="display:flex;flex-direction:column;gap:14px;">
        ${row('근로유형', `<div class="chip-choice chip-choice--sm">${typeChips}</div>`)}
        ${row('계약서 종류', `<div style="display:flex;flex-direction:column;gap:6px;width:100%;">${docSelect}</div>`)}
      </div>`;

    /* ===== ② 대상자 선택 — 검색조건 + 조회 + 목록 ===== */
    const dateRange = (fromAttr, fromVal, toAttr, toVal) => `
      <div style="display:flex;align-items:center;gap:6px;width:100%;">
        <input class="input input--date" type="date" ${fromAttr} value="${esc(fromVal)}" style="flex:1;min-width:0;" />
        <span style="color:var(--color-text-muted);flex-shrink:0;">~</span>
        <input class="input input--date" type="date" ${toAttr} value="${esc(toVal)}" style="flex:1;min-width:0;" />
      </div>`;
    /* 기간 프리셋 — 라벨 줄 우측에 붙여 기간 입력 한 줄을 온전히 쓰게 한다 */
    const rangeChips = `<div class="chip-choice chip-choice--sm">
        ${NEW_RANGE.map(m => `<button class="chip-choice__item${NEW.preset === m ? ' is-active' : ''}" type="button" data-ctrnew-range="${m}">${m}개월</button>`).join('')}
      </div>`;
    const cond = !cfg ? '' : `
        <div style="display:flex;flex-direction:column;gap:14px;">
          ${row(cfg.rangeLabel, dateRange('data-ctrnew-from', NEW.from, 'data-ctrnew-to', NEW.to), rangeChips)}
          ${cfg.joinFilter ? row('입사일', dateRange('data-ctrnew-joinfrom', NEW.joinFrom, 'data-ctrnew-jointo', NEW.joinTo)) : ''}
          ${row('성명 · 사번', `<input class="input input--search" type="text" data-ctrnew-kw value="${esc(NEW.keyword)}" placeholder="성명 · 사번 검색" style="width:100%;" />`)}
        </div>`;

    /* 대상자 목록 — [조회] 후에만 표시 */
    const cands = (NEW.searched && NEW.docTitle) ? newCandidates() : [];
    const allChecked = cands.length && cands.every(x => NEW.selected.has(x.emp.id));
    const rowsHTML = cands.length ? cands.map(x => `
      <tr>
        <td style="text-align:center;"><input type="checkbox" data-ctrnew-pick="${esc(x.emp.id)}" ${NEW.selected.has(x.emp.id) ? 'checked' : ''} /></td>
        <td style="text-align:center;">${esc(x.emp.id)}</td>
        <td>${empNameCellHTML(x.emp, `data-ctrnew-emp-card="${esc(x.emp.id)}" title="인사정보카드 열기"`)}</td>
        <td style="text-align:center;white-space:nowrap;">${esc(empTypeDisplay(x.emp) || '-')}</td>
        <td>${prevBasisCellHTML(x.emp)}</td>
        <td style="text-align:center;white-space:nowrap;">${prevTermText(x.emp)}${x.note ? ` <span style="color:var(--color-text-muted);font-size:11.5px;">(${esc(x.note)})</span>` : ''}</td>
      </tr>`).join('') : `<tr><td colspan="6" style="text-align:center;padding:30px 0;color:var(--color-text-muted);font-size:13px;">
        ${!NEW.searched ? '검색 조건을 선택하고 [조회] 를 눌러 주세요.' : '검색 조건에 해당하는 대상자가 없습니다. 기간을 넓혀 보세요.'}</td></tr>`;
    /* 대상자 목록 — 우측 패널에서 데이터 행만 세로 스크롤 (대상자가 수백 명이어도 조건 패널은 고정) */
    const list = `
      <table class="tbl tbl--hover tbl--sticky tbl--ellipsis" style="width:100%;min-width:820px;table-layout:fixed;">
        <colgroup>
          <col style="width:44px;" /><col style="width:104px;" /><col style="width:190px;" />
          <col style="width:90px;" /><col style="width:262px;" /><col />
        </colgroup>
        <thead><tr>
          <th style="text-align:center;"><input type="checkbox" data-ctrnew-pick-all ${allChecked ? 'checked' : ''} aria-label="전체 선택" /></th>
          <th style="text-align:center;">사번</th>
          <th>성명</th>
          <th style="text-align:center;">근로유형</th>
          <th>적용 중인 최근 계약서</th>
          <th style="text-align:center;">${prevTermLabel()}</th>
        </tr></thead>
        <tbody>${rowsHTML}</tbody>
      </table>`;

    /* 좌: 계약서 선택 + 검색조건(고정) / 우: 대상자 목록(스크롤) — 대상자가 많아도 조건을 다시 찾아 올라갈 필요가 없다 */
    return `
      <div class="split" style="--split-left:400px;height:100%;">
        <aside class="split__left" style="display:flex;flex-direction:column;min-height:0;">
          <!-- 좌측 패널 — 별도 헤드 없이 ① 계약서 선택 / ② 대상자 검색 두 그룹 카드로 구성 -->
          <div class="split__body" style="padding:14px;background:var(--color-surface-alt);">
            ${newCard('① 계약서 선택', pickDoc)}
            ${cfg ? newCard('② 대상자 검색', cond) : ''}
          </div>
          ${cfg ? `<div class="detail-footer" style="padding:10px 16px;">
            <div class="detail-footer__actions" style="width:100%;gap:8px;">
              <button class="btn" type="button" data-ctrnew-reset>초기화</button>
              <button class="btn btn--primary" type="button" data-ctrnew-search style="flex:1;justify-content:center;">${window.Icons && window.Icons.search || ''} 조회</button>
            </div>
          </div>` : ''}
        </aside>
        <section class="split__right" style="display:flex;flex-direction:column;min-height:0;">
          <div class="split__head">
            <div style="display:flex;align-items:baseline;gap:10px;min-width:0;">
              <!-- desc 가 '수습연장 직원 대상' 처럼 끝나면 '대상자' 와 겹치므로 꼬리말을 정리 -->
              <h3 style="white-space:nowrap;">${cfg && cfg.desc ? esc(String(cfg.desc).replace(/\s*대상$/, '')) + ' 대상자' : '대상자'}</h3>
              <span class="t-muted" style="font-size:var(--fs-sm);white-space:nowrap;">총 <strong style="color:var(--color-text);">${cands.length}</strong>명 · 선택 ${NEW.selected.size}명</span>
            </div>
          </div>
          <div style="flex:1;min-height:0;overflow:auto;">${list}</div>
        </section>
      </div>`;
  }

  /* ── 연봉 인상률(%) ↔ 연봉 금액 상호 변환 ──
     연봉은 실무에서 「기존 연봉 대비 몇 % 인상」 으로 협의되므로 인상률을 1차 입력값으로 둔다.
     둘 다 입력 가능(한쪽을 고치면 다른 쪽이 자동 갱신)하고, 저장되는 값은 금액(NEW.amounts) 이다.
     기준(기존 연봉)이 없는 대상자는 인상률을 산정할 수 없어 금액 직접 입력만 허용한다. */
  function newBaseAmount(emp) {
    if (!emp) return 0;
    const ar = amendRow();
    if (ar) return newNum((ar.salary || {}).contractAmount);
    const a = newNum(emp.contractAmount);
    if (a) return a;
    const r = prevBasisRow(emp);
    return newNum(r && r.salary && r.salary.contractAmount);
  }
  /** 인상률 → 연봉 금액 (기준 × (1 + pct/100), 원 단위 반올림). 기준·입력이 없으면 0 */
  function newAmountFromPct(base, pct) {
    const p = parseFloat(pct);
    if (!base || !Number.isFinite(p)) return 0;
    return Math.round(base * (1 + p / 100));
  }
  /** 연봉 금액 → 인상률 문자열 (소수 2자리까지, 불필요한 0 은 제거) */
  function newPctFromAmount(base, amt) {
    if (!base || !amt) return '';
    return String(Math.round((amt / base - 1) * 10000) / 100);
  }
  /** 인상률 입력 셀 — 기준 연봉이 없으면 입력 대신 안내를 노출 */
  function newPctCellHTML(emp) {
    if (!newBaseAmount(emp)) {
      return `<span style="font-size:12px;color:var(--color-text-muted);padding-left:8px;white-space:nowrap;"
                    title="기존 연봉이 없어 인상률을 산정할 수 없습니다. 연봉 금액을 직접 입력해 주세요.">기준 없음</span>`;
    }
    return `<div class="cell-unit">
      <input class="cell-input" type="text" inputmode="decimal" data-ctrnew-pct="${esc(emp.id)}"
             value="${esc(NEW.raisePct[emp.id] != null ? NEW.raisePct[emp.id] : '')}" placeholder="0" />
      <span class="cell-unit__unit">%</span>
    </div>`;
  }
  /** 금액/인상률 변경 후 파생 셀(연봉 금액·인상률·월 임금) 을 재렌더 없이 갱신 — 입력 포커스 유지 */
  function newSyncDerivedCells(modal, empId, opts) {
    opts = opts || {};
    if (opts.amount) {
      const ae = modal.querySelector(`[data-ctrnew-amt="${empId}"]`);
      if (ae) ae.value = NEW.amounts[empId] ? money(NEW.amounts[empId]) : '';
    }
    if (opts.pct) {
      const pe = modal.querySelector(`[data-ctrnew-pct="${empId}"]`);
      if (pe) pe.value = NEW.raisePct[empId] || '';
    }
    const wl = modal.querySelector(`[data-ctrnew-wage="${empId}"]`);
    if (wl) {
      const cand = newCandidates().find(x => x.emp.id === empId);
      wl.innerHTML = cand ? nextWageBreakHTML(cand) : '';
    }
  }

  /* 기존 계약 조건 표기 — 유형별로 비교에 필요한 값만 요약 (연봉/시급/용역대금 + 근로조건) */
  function newPrevAmountText(emp) {
    if (!emp) return '-';
    const cfg = newCfg() || {};
    const ar = amendRow();
    if (ar) {
      const s2 = ar.salary || {};
      if (cfg.wage === 'hourly') { const h = newNum(s2.hourly); return h ? `시급 ${money(h)}원` : '-'; }
      const a2 = newNum(s2.contractAmount); return a2 ? `${money(a2)}원` : '-';
    }
    if (cfg.wage === 'hourly') {
      const h = Number(emp.hourlyWage || 0) || (emp.contractAmount ? Math.round(Number(emp.contractAmount) / 1.2) : 0);
      return h ? `시급 ${money(h)}원` : '-';
    }
    if (cfg.wage === 'service') {
      const t = Number(emp.contractAmount || 0);
      return t ? `${money(t)}원` : '-';
    }
    const a = Number(emp.contractAmount || 0);
    return a ? `${money(a)}원` : '-';
  }
  function newPrevCondText(emp) {
    if (!emp) return '-';
    const cfg = newCfg() || {};
    const ar = amendRow();
    if (ar) {
      const s2 = ar.salary || {};
      if (cfg.wage === 'hourly') { const d = newNum(s2.hoursPerDay), w = newNum(s2.daysPerWeek);
        return (d || w) ? `1일 ${d || '-'}시간 · 1주 ${w || '-'}일` : '-'; }
      if (cfg.wage === 'service') { const m2 = newNum(s2.contractMonths); return m2 ? `${m2}개월` : '-'; }
      const k = (s2.wageKind || s2.wageContractKind) === 'inclusive' ? '포괄임금' : '일반';
      const h2 = newNum(s2.fixedOTHours);
      return `${k}${h2 ? ` · 기준 ${h2}시간` : ''}`;
    }
    if (cfg.wage === 'hourly') {
      const d = Number(emp.hoursPerDay || 0), w = Number(emp.daysPerWeek || 0);
      return (d || w) ? `1일 ${d || '-'}시간 · 1주 ${w || '-'}일` : '-';
    }
    if (cfg.wage === 'service') {
      /* 월 지급액은 계약금액 ÷ 개월로 파생되는 값이라 비교 표에는 개월 수만 노출 */
      const m = Number(emp.contractMonths || 0);
      return m ? `${m}개월` : '-';
    }
    const kind = emp.wageContractKind === 'inclusive' ? '포괄임금' : (emp.wageContractKind === 'fixedOT' ? '일반' : '');
    const hrs = Number(emp.fixedOTHours || emp.inclusiveHours || 0);
    if (!kind) return '-';
    return `${kind}${hrs ? ` · 기준 ${hrs}시간` : ''}`;
  }
  /* 월 임금 분해 표기 — 연봉제(정규직 수습·전환·연봉 / 계약직) 비교용.
     연봉만으로는 전·후 차이를 알기 어려워 「월 기본급 + 고정연장근무수당」 을 함께 보여준다. */
  /* 월 임금 = 월봉액 (연봉 ÷ 12). 기본급이 아니라 월 지급 총액이며,
     기본급 / 고정연장근무수당 분해는 임금 산정 조건에서 관리한다.
     연봉 정보가 없는 legacy 행만 기본급 + 수당 합으로 폴백. */
  function monthlyPayOf(s) {
    if (!s) return 0;
    /* 시드/외부 데이터는 '45,000,000' 처럼 콤마 문자열일 수 있어 숫자 파싱을 거친다 */
    const total  = newNum(s.contractAmount);
    /* 용역 위탁 — 월 지급액 = 총 용역대금 ÷ 계약 개월 */
    const months = newNum(s.contractMonths);
    if (months) return total ? Math.round(total / months) : newNum(s.monthlyAmount);
    if (total) return Math.round(total / 12);
    const base = newNum(s.base);
    if (!base) return 0;
    return base + newNum(s.inclusiveOT || s.inclusiveOTAmount || s.fixedOT || s.fixedOTAmount);
  }
  function wageBreakHTML(s) {
    const m = monthlyPayOf(s);
    if (!m) return `<span style="color:var(--color-text-muted);">-</span>`;
    return `<span style="white-space:nowrap;">${money(m)}</span>`;
  }
  function prevWageBreakHTML(emp) {
    /* 같은 행에 표기되는 기존 금액(newPrevAmountText) 과 동일한 소스를 써야 월 지급액이 어긋나지 않는다 */
    const ar = amendRow();
    if (ar) return wageBreakHTML(ar.salary);
    const cfg = newCfg() || {};
    const total = newNum(emp && emp.contractAmount);
    if (cfg.wage === 'service') {
      return wageBreakHTML({ contractAmount: total,
        contractMonths: newNum(emp && emp.contractMonths) || 12,
        monthlyAmount: newNum(emp && emp.monthlyAmount) });
    }
    if (total) return wageBreakHTML({ contractAmount: total });
    const r = prevBasisRow(emp);
    return wageBreakHTML(r && r.salary);
  }
  function nextWageBreakHTML(cand) {
    if (!(Number(NEW.amounts[cand.emp.id]) > 0)) return `<span style="color:var(--color-text-muted);">-</span>`;
    const spec = newRowSpec(cand);
    return wageBreakHTML(spec && spec.salary);
  }
  /* 신규 조건 표기 — 공통값 또는 개별 상세 조건 */
  function newNextCondText(empId) {
    const cfg = newCfg() || {};
    const c = newCondFor(empId);
    if (cfg.wage === 'hourly')  return `1일 ${c.stdDay || '-'}시간 · 1주 ${c.stdWeek || '-'}일`;
    if (cfg.wage === 'service') return `${c.svcMonths || '-'}개월`;
    const hrs = NEW_OT_CATS.reduce((s, cat) => s + (Number(c.otHours[cat.key]) || 0), 0);
    return `${c.wageKind === 'inclusive' ? '포괄임금' : '일반'}${hrs ? ` · 기준 ${hrs}시간` : ''}`;
  }

  /* ===== 엑셀(CSV) 양식 — 표에서 직접 입력하는 항목만 컬럼으로 구성한다.
       계약서 종류마다 입력 항목이 달라(수습=기간만 / 전환=임금계약 종료일+연봉 / 일용직=기간+시급 …)
       양식도 그에 맞춰 달라진다. 조건(임금 산정·소정근로·계약 개월)은 [설정] 모달 전용이라 제외. ===== */
  function newExcelCols() {
    const cfg = newCfg() || {};
    const lock = cfg.lock || {};
    const indef   = !!(cfg.term && cfg.term.indefinite);
    const wageEnd = !!(cfg.term && cfg.term.wageEnd);
    const isWageTerm = wageEnd || cfg.pool === 'annual';
    const amtLabel = cfg.wage === 'hourly' ? '시급' : (cfg.wage === 'service' ? '계약금액' : '연봉');
    const cols = [{ key: 'id', label: '사번' }, { key: 'name', label: '성명' }];
    if (!lock.start)          cols.push({ key: 'start',  label: isWageTerm ? '임금계약 시작일' : '계약시작일' });
    if (!(indef && !wageEnd)) cols.push({ key: 'end',    label: isWageTerm ? '임금계약 종료일' : '계약종료일' });
    if (!lock.amount)         cols.push({ key: 'amount', label: `${amtLabel} (원)` });
    return cols;
  }
  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function newExcelDownload() {
    const cands = newCandidates().filter(x => NEW.selected.has(x.emp.id));
    if (!cands.length) return;
    const cols = newExcelCols();
    const lines = [cols.map(c => csvCell(c.label)).join(',')];
    cands.forEach(x => {
      const t = newTermFor(x);
      const amt = Number(NEW.amounts[x.emp.id]) || '';
      lines.push(cols.map(c => csvCell(
        c.key === 'id'    ? x.emp.id
      : c.key === 'name'  ? x.emp.name
      : c.key === 'start' ? t.start
      : c.key === 'end'   ? ((t.indefinite && !t.wageEnd) ? '' : t.end)
      :                     amt
      )).join(','));
    });
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const fn = `${NEW.docTitle}_정보입력_${todayStr().replace(/-/g, '')}.csv`;
    if (App.downloadFile) App.downloadFile(fn, { blob, context: '계약서 정보 입력 양식' });
    window.toast && window.toast(`${cands.length}명 양식을 내려받았습니다.`, 'success');
  }
  /* CSV 한 줄 파싱 — 따옴표 안의 콤마를 보존 */
  function csvSplit(line) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
  }
  /* 날짜 정규화 — 2026-05-01 / 26/05/01 / 2026.5.1 모두 허용 */
  function normYmd(v) {
    const s = String(v == null ? '' : v).trim();
    if (!s) return '';
    const m = s.match(/^(\d{2,4})[-./](\d{1,2})[-./](\d{1,2})$/);
    if (!m) return '';
    const y = m[1].length === 2 ? '20' + m[1] : m[1];
    return `${y}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  }
  /* 업로드 — 사번으로 대상자를 찾아 계약기간·금액을 채운다. 조건(설정)은 업로드 대상이 아님 */
  function newExcelUpload(file) {
    if (!file) return;
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      window.toast && window.toast('엑셀 파일은 CSV 로 저장한 뒤 업로드해 주세요.', 'warning', 4000);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '').replace(/^﻿/, '');
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { window.toast && window.toast('내용이 없는 파일입니다.', 'warning'); return; }
      const head = csvSplit(lines[0]);
      const idxOf = (re) => head.findIndex(h => re.test(h));
      const iId = idxOf(/사번/), iStart = idxOf(/시작일/), iEnd = idxOf(/종료일/), iAmt = idxOf(/시급|연봉|계약금액/);
      if (iId < 0) { window.toast && window.toast('양식에 「사번」 열이 없습니다.', 'danger'); return; }
      const byId = {};
      newCandidates().filter(x => NEW.selected.has(x.emp.id)).forEach(x => { byId[x.emp.id] = x; });
      let ok = 0; const miss = [];
      lines.slice(1).forEach(line => {
        const c = csvSplit(line);
        const id = (c[iId] || '').trim();
        const cand = byId[id];
        if (!id) return;
        if (!cand) { miss.push(id); return; }
        const t = newTermFor(cand);
        const s = iStart >= 0 ? normYmd(c[iStart]) : '';
        const e = iEnd   >= 0 ? normYmd(c[iEnd])   : '';
        if (s || e) NEW.terms[id] = { start: s || t.start, end: (t.indefinite && !t.wageEnd) ? '' : (e || t.end) };
        if (iAmt >= 0) { const v = newNum(c[iAmt]); if (v > 0) NEW.amounts[id] = v; }
        ok++;
      });
      renderNewCtr();
      const msg = `${ok}명 반영 완료` + (miss.length ? ` · 대상자에 없는 사번 ${miss.length}건 제외` : '');
      window.toast && window.toast(msg, miss.length ? 'warning' : 'success', 4000);
    };
    reader.readAsText(file, 'utf-8');
  }

  /* ── STEP 2 : 계약서 정보 입력 — 툴바(선택 행 일괄 적용) + 기존/신규 비교 테이블 ── */
  function renderNewForm() {
    const cfg = newCfg() || {};
    const cands = newCandidates().filter(x => NEW.selected.has(x.emp.id));
    const amtLabel  = cfg.wage === 'hourly' ? '시급' : (cfg.wage === 'service' ? '계약금액' : '연봉');
    const condLabel = cfg.wage === 'hourly' ? '소정근로' : (cfg.wage === 'service' ? '계약 개월' : '임금 산정');
    const isSvc     = cfg.wage === 'service';
    const isAnn     = cfg.wage === 'annual';
    const isIndef   = !!(cfg.term && cfg.term.indefinite);
    const wageEnd   = !!(cfg.term && cfg.term.wageEnd);   /* 무기 근로계약 + 임금계약 종료일 지정 */
    const lock      = cfg.lock || {};                     /* 수정 불가 필드 (수습 연장·전환 등) */
    /* 임금계약 기간을 정하는 문서(전환·연봉 계약서)는 '임금계약 시작/종료일' 로 표기 */
    const isWageTerm = wageEnd || cfg.pool === 'annual';
    const startLabel = isWageTerm ? '임금계약 시작일' : '계약시작일';
    const endLabel   = isWageTerm ? '임금계약 종료일' : '계약종료일';
    /* 월 지급 금액 컬럼 — 연봉제는 월 임금(연봉÷12), 용역은 월 지급액(계약금액÷개월) */
    const hasMonthly  = isAnn || isSvc;
    const monthlyLabel = isSvc ? '월 지급액' : '월 임금';
    const checkedN  = cands.filter(x => NEW.formChecked.has(x.emp.id)).length;
    const allOn     = cands.length && checkedN === cands.length;

    /* 일괄 적용 — 행을 체크했을 때만 컨트롤이 나타난다(평소엔 안내 문구만).
       계약기간은 드롭다운(개월) + 직접입력 선택 시 날짜 + [적용]. */
    const bulkControls = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span class="bulkbar__title">일괄 적용</span>
        ${(isIndef && !wageEnd) ? '' : `
        <span class="bulkbar__field">
          <span class="bulkbar__title">${wageEnd ? '임금계약기간' : '계약기간'}</span>
          <select class="select" data-ctrnew-bulkterm-sel style="height:26px;min-width:100px;">
            <option value="">선택</option>
            ${NEW_TERMS.map(m => `<option value="${m}" ${NEW.bulkTermMode !== 'custom' && NEW.bulkTermApplied === m ? 'selected' : ''}>${m}개월</option>`).join('')}
            <option value="custom" ${NEW.bulkTermMode === 'custom' ? 'selected' : ''}>직접입력</option>
          </select>
          ${NEW.bulkTermMode === 'custom' ? `
            <input class="input input--date" type="date" data-ctrnew-bulkend value="${esc(NEW.bulkEnd)}" style="height:26px;" />
            <button class="btn btn--xs" type="button" data-ctrnew-bulkend-apply>적용</button>` : ''}
        </span>
        <span class="bulkbar__sep"></span>`}
        ${(lock.amount || !isAnn) ? '' : `
        <span class="bulkbar__field">
          <span class="bulkbar__title">인상률</span>
          <input class="bulkbar__num" type="text" inputmode="decimal" data-ctrnew-bulkpct
                 value="${esc(NEW.bulkPct || '')}" placeholder="0" title="인상률 입력 후 Enter" style="height:26px;" />
          <span class="bulkbar__unit">%</span>
          <button class="btn btn--xs" type="button" data-ctrnew-applypct>적용</button>
        </span>
        <span class="bulkbar__sep"></span>`}
        ${lock.amount ? '' : `
        <span class="bulkbar__field">
          <span class="bulkbar__title">${amtLabel}</span>
          <input class="bulkbar__num" type="text" inputmode="numeric" data-ctrnew-bulkamt
                 value="${NEW.bulkAmt ? esc(money(NEW.bulkAmt)) : ''}" placeholder="0" title="금액 입력 후 Enter" style="height:26px;" />
          <span class="bulkbar__unit">원</span>
          <button class="btn btn--xs" type="button" data-ctrnew-applyall>적용</button>
        </span>
        <span class="bulkbar__sep"></span>`}
        ${lock.cond ? '' : `
        <span class="bulkbar__field">
          <span class="bulkbar__title">${condLabel}</span>
          <button class="btn btn--xs" type="button" data-ctrnew-bulkdetail>설정</button>
        </span>`}
      </div>`;
    const countbar = `
      <!-- 툴바 높이를 고정(34px)해 체크 여부로 컨트롤이 나타나도 아래 표가 밀리지 않게 한다 -->
      <div class="toolbar" style="padding:0;gap:12px;flex-wrap:wrap;min-height:28px;align-items:center;">
        <div class="toolbar__left" style="gap:10px;flex-wrap:wrap;">
          <span class="toolbar__count">대상 <strong>${cands.length}</strong>명</span>
          ${checkedN
            ? `<span style="color:var(--color-text-muted);font-size:var(--fs-sm);">체크 ${checkedN}명</span>
               <span class="search__divider" style="height:16px;"></span>
               ${bulkControls}`
            : `<span style="font-size:var(--fs-sm);color:var(--color-text-muted);">행 체크 시 일괄 적용 가능</span>`}
        </div>
        <div class="toolbar__right" style="gap:6px;">
          <!-- 엑셀 양식은 계약서 종류별 입력 항목(기간·금액)에 맞춰 컬럼이 구성된다 -->
          <button class="btn btn--xs" type="button" data-ctrnew-xls-down>엑셀 양식</button>
          <button class="btn btn--xs" type="button" data-ctrnew-xls-up>엑셀 업로드</button>
          <input type="file" hidden data-ctrnew-xls-input accept=".csv,.xlsx,.xls" />
        </div>
      </div>
      ${wageEnd ? `<div style="font-size:var(--fs-sm);color:var(--color-text-sub);">근로계약은 <strong>기간의 정함 없음</strong> · 입력한 종료일은 <strong>임금계약 종료일</strong>입니다.</div>` : ''}`;

    /* 기존 ↔ 신규 비교 테이블 — 좌측 기존 계약(읽기), 우측 신규 계약(입력) */
    const rows = cands.map(x => {
      const t  = newTermFor(x);
      const ov = newHasOverride(x.emp.id);
      const on = NEW.formChecked.has(x.emp.id);
      return `
      <tr${on ? ' class="is-selected"' : ''}>
        <td style="text-align:center;"><input type="checkbox" data-ctrnew-fcheck="${esc(x.emp.id)}" ${on ? 'checked' : ''} /></td>
        <td style="text-align:center;white-space:nowrap;">${esc(x.emp.id)}</td>
        <td>${empNameCellHTML(x.emp, `data-ctrnew-emp-card="${esc(x.emp.id)}" title="인사정보카드 열기"`)}</td>
        <td style="white-space:nowrap;color:var(--color-text-sub);">${prevTermText(x.emp)}</td>
        <td style="text-align:right;white-space:nowrap;color:var(--color-text-sub);${isAnn ? '' : 'border-right:1px solid var(--color-divider);'}">${newPrevAmountText(x.emp)}</td>
        ${hasMonthly
          /* 금액 비교 문서 — 기존 계약은 「금액 · 월 지급액」 까지만 비교 (조건은 신규 입력 쪽에서 설정) */
          ? `<td style="text-align:right;color:var(--color-text-sub);border-right:1px solid var(--color-divider);">${prevWageBreakHTML(x.emp)}</td>`
          : `<td style="white-space:nowrap;color:var(--color-text-sub);border-right:1px solid var(--color-divider);">${esc(newPrevCondText(x.emp))}</td>`}
        <td style="padding:2px 4px;">
          ${lock.start
            /* 정규직 전환 — 임금계약 시작일 = 입사일 고정 */
            ? `<span style="color:var(--color-text-sub);padding-left:8px;white-space:nowrap;">${esc(dispYmd(t.start))}</span>`
            : `<input class="cell-input" type="date" data-ctrnew-start="${esc(x.emp.id)}" value="${esc(t.start)}" />`}
        </td>
        <td style="padding:2px 4px;">
          ${(t.indefinite && !t.wageEnd)
            ? `<span style="font-size:12px;color:var(--color-text-muted);padding-left:8px;white-space:nowrap;">기간의 정함 없음</span>`
            : `<input class="cell-input" type="date" data-ctrnew-end="${esc(x.emp.id)}" value="${esc(t.end)}" />`}
        </td>
        ${isAnn ? `<td style="padding:2px 4px;">${lock.amount
            /* 수습 연장 — 임금 조건을 그대로 승계하므로 인상률도 고정 */
            ? `<span style="font-size:12px;color:var(--color-text-muted);padding-left:8px;">승계</span>`
            : newPctCellHTML(x.emp)}</td>` : ''}
        <td style="padding:2px 4px;${lock.amount ? 'text-align:right;white-space:nowrap;' : ''}">
          ${lock.amount
            /* 수습 연장 — 기존 임금 조건을 그대로 승계하므로 금액 수정 불가 */
            ? `${money(Number(NEW.amounts[x.emp.id]) || 0)}`
            : `<input class="cell-input cell-input--num" type="text" inputmode="numeric" data-ctrnew-amt="${esc(x.emp.id)}"
                 value="${NEW.amounts[x.emp.id] != null ? esc(money(NEW.amounts[x.emp.id])) : ''}" placeholder="0" />`}
        </td>
        ${hasMonthly ? `<td data-ctrnew-wage="${esc(x.emp.id)}" style="text-align:right;color:var(--color-text);">${nextWageBreakHTML(x)}</td>` : ''}
        <td style="padding:4px 6px;">
          <!-- 조건 값 바로 옆에 [설정] — 값과 버튼이 한 묶음으로 읽히게 붙인다 -->
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="white-space:nowrap;color:${ov ? 'var(--color-brand-primary)' : 'var(--color-text-sub)'};font-weight:${ov ? 'var(--fw-semibold)' : 'var(--fw-regular)'};">
              ${esc(newNextCondText(x.emp.id))}${ov ? ' <span title="개별 지정">●</span>' : ''}
            </span>
            ${lock.cond ? '' : `<button class="btn btn--xs${ov ? ' btn--soft-primary' : ''}" type="button" data-ctrnew-detail="${esc(x.emp.id)}"
                    title="이 직원만 다르게 지정">설정</button>`}
          </div>
        </td>
        <td style="white-space:nowrap;padding:4px 20px 4px 6px;text-align:right;">
          <button class="btn btn--xs" type="button" data-ctrnew-preview="${esc(x.emp.id)}"
                  title="입력한 조건으로 계약서 미리 보기">계약서 미리보기</button>
        </td>
      </tr>`;
    }).join('');
    const prevBg = 'background:var(--color-surface-alt);';
    /* 컬럼 폭 — colgroup + table-layout:fixed. 조건 값과 [개별 설정][미리 보기] 는 별도 셀로 분리해
       한 줄에 나란히 놓는다. 마지막 「관리」 컬럼은 조건 값 셀 오른쪽.
       조건 컬럼의 값 길이가 계약서 종류마다 달라(용역 '12개월' / 일용직 '1일 8시간 · 1주 5일'
       / 연봉 '포괄임금 · 기준 20시간') 종류별로 폭을 배분한다. 합계는 화면 폭(약 1,318px) 이내. */
    const W = hasMonthly
      /* 금액 비교 문서(연봉제·용역) — 기존 [기간·금액·월 지급액],
         신규 [시작·종료·금액·월 지급액·조건(+설정)·미리보기]. 초과분은 데이터 영역만 가로 스크롤. */
      /* 연봉제는 [금액] 앞에 [인상률] 86px 가 추가된다 */
      ? (isAnn
        ? [56, 112, 207, 152, 118, 118, 128, 128, 86, 118, 118, 196, 138]
        : [56, 112, 207, 152, 118, 118, 128, 128, 118, 118, 150, 138])
      : [
        56, 112, 207,                                 /* 체크 · 사번 · 성명(부서·직위·직책 전체 표시) */
        152, 112,                                     /* 기존 계약: 기간 · 금액 */
        142,                                          /* 기존 계약: 조건 */
        128, 128, 112,                                /* 신규: 시작일 · 종료일 · 금액 */
        196,                                          /* 신규: 조건 값 + [설정] */
        138,                                          /* 계약서 미리보기 */
      ];
    const table = `
      <table class="tbl tbl--hover tbl--sticky tbl--edge tbl--ellipsis" data-ctrnew-table style="width:100%;min-width:${W.reduce((s, n) => s + n, 0)}px;table-layout:fixed;">
        <colgroup>${W.map(w => `<col style="width:${w}px;" />`).join('')}</colgroup>
        <thead>
          <tr>
            <th rowspan="2" style="text-align:center;vertical-align:middle;"><input type="checkbox" data-ctrnew-fcheck-all ${allOn ? 'checked' : ''} aria-label="전체 선택" /></th>
            <th rowspan="2" style="text-align:center;vertical-align:middle;">사번</th>
            <th rowspan="2" style="vertical-align:middle;">성명</th>
            <th colspan="3" style="text-align:center;${prevBg}color:var(--color-text-sub);">기존 계약</th>
            <th colspan="${hasMonthly ? (isAnn ? 7 : 6) : 5}" style="text-align:center;color:var(--color-brand-primary);">신규 계약</th>
          </tr>
          <tr>
            <th style="${prevBg}font-weight:var(--fw-regular);">${prevTermLabel()}</th>
            <th style="text-align:right;${prevBg}font-weight:var(--fw-regular);${hasMonthly ? '' : 'border-right:1px solid var(--color-divider);'}">${amtLabel}</th>
            ${hasMonthly
              ? `<th style="text-align:right;${prevBg}font-weight:var(--fw-regular);border-right:1px solid var(--color-divider);">${monthlyLabel}</th>`
              : `<th style="${prevBg}font-weight:var(--fw-regular);border-right:1px solid var(--color-divider);">${condLabel}</th>`}
            <th style="text-align:center;">${startLabel}</th>
            <th style="text-align:center;">${endLabel}</th>
            ${isAnn ? `<th style="text-align:center;">인상률</th>` : ''}
            <th style="text-align:center;">${amtLabel} (원)</th>
            ${hasMonthly ? `<th style="text-align:right;">${monthlyLabel}</th>` : ''}
            <th>${condLabel}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
    /* 박스(카드) 없이 그리드 레이아웃 — 카운트·일괄 적용 바는 고정, 데이터 행만 스크롤.
       표는 좌우 여백 없이 화면 폭을 가득 채우고 첫/마지막 셀만 .tbl--edge 로 ±20px 정렬 */
    return `
      <div style="display:flex;flex-direction:column;height:100%;min-height:0;">
        <div style="display:flex;flex-direction:column;gap:6px;padding:10px 20px 8px;">
          ${countbar}
        </div>
        <div style="flex:1;min-height:0;overflow:auto;">${table}</div>
      </div>`;
  }

  /* ── 계약서 미리 보기 모달 — 표에 입력한 조건 그대로 실제 서식을 렌더 (작성 전 확인) ── */
  function injectNewPreviewModal() {
    if (document.getElementById('modal-ctrnew-preview')) return;
    const html = `
<div class="modal-backdrop" id="modal-ctrnew-preview" data-modal-id="ctrnew-preview" style="z-index:1150;">
  <div class="modal modal--lg" style="display:flex;flex-direction:column;max-height:90vh;">
    <div class="modal__header">
      <div class="modal__title" data-ctrnewp-title>계약서 미리 보기</div>
      <button class="modal__close" type="button" data-ctrnewp-close aria-label="닫기">✕</button>
    </div>
    <div class="modal__body" style="background:var(--color-surface-alt);padding:16px 20px;overflow:auto;">
      <div class="doc-editor__paper is-readonly" data-ctrnewp-body
           style="font-family:inherit;max-width:760px;width:100%;margin:0 auto;"></div>
    </div>
    <div class="modal__footer">
      <span data-ctrnewp-hint style="margin-right:auto;font-size:var(--fs-xs);color:var(--color-text-muted);"></span>
      <button class="btn" type="button" data-ctrnewp-close>닫기</button>
    </div>
  </div>
</div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    const m = document.getElementById('modal-ctrnew-preview');
    m.addEventListener('click', (e) => {
      if (e.target === m || e.target.closest('[data-ctrnewp-close]')) {
        m.classList.remove('is-open');
        document.body.style.overflow = '';
      }
    });
  }
  /* 기존 계약서 보기 — 대상자 목록의 「적용 중인 최근 계약서」 클릭 시 실제 계약서 본문을 모달로 */
  function openRowDocPreview(rowId) {
    const r = STATE.rows.find(x => x.id === rowId);
    if (!r) return;
    injectNewPreviewModal();
    const m = document.getElementById('modal-ctrnew-preview');
    m.querySelector('[data-ctrnewp-title]').textContent = `${kindDisplay(r)} — ${r.empName} (${r.id})`;
    m.querySelector('[data-ctrnewp-body]').innerHTML = renderContractHTML(r);
    m.querySelector('[data-ctrnewp-hint]').textContent =
      `${periodText(r)} · ${(STATUS[effectiveStatusCode(r)] || {}).label || ''}`;
    m.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function openNewPreview(empId) {
    const cand = newCandidates().find(x => x.emp.id === empId);
    if (!cand) return;
    injectNewPreviewModal();
    const spec = newRowSpec(cand);
    const v = contractBodyValues(spec, todayStr());
    const body = (TEMPLATES[spec.docTitle] || TEMPLATES[spec.kind] || tplWork)(v);
    const m = document.getElementById('modal-ctrnew-preview');
    m.querySelector('[data-ctrnewp-title]').textContent = `${NEW.docTitle} 미리 보기 — ${cand.emp.name}`;
    m.querySelector('[data-ctrnewp-body]').innerHTML = String(body).replace('[[SIGNATURES]]', '');
    const amt = Number(NEW.amounts[empId]) || 0;
    m.querySelector('[data-ctrnewp-hint]').textContent = amt
      ? '표에 입력한 조건으로 렌더한 미리 보기입니다. 서명란은 작성 후 표시됩니다.'
      : '금액이 입력되지 않아 임금 조항이 비어 있습니다.';
    m.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  /* ── 개별 상세 조건 설정 모달 — 대상자 1명의 근로조건을 공통값과 다르게 지정 ── */
  function injectNewDetailModal() {
    if (document.getElementById('modal-ctrnew-detail')) return;
    const html = `
<div class="modal-backdrop" id="modal-ctrnew-detail" data-modal-id="ctrnew-detail" style="z-index:1150;">
  <div class="modal modal--lg" style="display:flex;flex-direction:column;max-height:88vh;">
    <div class="modal__header">
      <div class="modal__title" data-ctrnewd-title>상세 조건 설정</div>
      <button class="modal__close" type="button" data-ctrnewd-close aria-label="닫기">✕</button>
    </div>
    <div class="modal__body" style="background:var(--color-surface-alt);padding:16px 20px;overflow:auto;" data-ctrnewd-body></div>
    <div class="modal__footer">
      <button class="btn" type="button" data-ctrnewd-loadprev style="margin-right:auto;">기존 계약 조건 불러오기</button>
      <button class="btn" type="button" data-ctrnewd-close>취소</button>
      <button class="btn btn--primary" type="button" data-ctrnewd-save>적용</button>
    </div>
  </div>
</div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    const m = document.getElementById('modal-ctrnew-detail');
    m.addEventListener('click', (e) => {
      if (e.target === m || e.target.closest('[data-ctrnewd-close]')) { closeNewDetail(); return; }
      /* 기존 계약 조건 불러오기 — 직전 계약의 근로조건을 모달 입력값으로 채운다(적용 전) */
      if (e.target.closest('[data-ctrnewd-loadprev]')) { loadPrevCondToDetail(); return; }
      if (e.target.closest('[data-ctrnewd-save]')) { saveNewDetail(); return; }
    });
  }
  function closeNewDetail() {
    const m = document.getElementById('modal-ctrnew-detail');
    if (m) m.classList.remove('is-open');
    /* 작성 상세 화면은 그대로 유지 — body overflow 는 상세 화면이 관리하지 않으므로 복원만 */
    document.body.style.overflow = '';
    NEW.detailEmpId = '';
  }
  function openNewDetail(empId) {
    const cfg = newCfg() || {};
    const cand = newCandidates().find(x => x.emp.id === empId);
    if (!cand) return;
    injectNewDetailModal();
    NEW.detailEmpId = empId;
    const c = newCondFor(empId);
    const m = document.getElementById('modal-ctrnew-detail');
    const bulkN = NEW.detailBulk ? newCandidates().filter(x => NEW.formChecked.has(x.emp.id)).length : 0;
    m.querySelector('[data-ctrnewd-title]').textContent = NEW.detailBulk
      ? `조건 일괄 설정 — 선택한 ${bulkN}명`
      : `상세 조건 설정 — ${cand.emp.name} (${cand.emp.id})`;
    /* 일괄 모드에서는 기존 조건 불러오기 대신 선택 행 전체 적용만 제공 (대상이 여러 명) */
    const prevBtn = m.querySelector('[data-ctrnewd-loadprev]');
    if (prevBtn) prevBtn.hidden = !!NEW.detailBulk;
    const grid = 'display:grid;grid-template-columns:1fr 96px 60px;gap:6px;align-items:center;padding:6px 10px;';
    let body = '';
    if (cfg.wage === 'annual') {
      body = `
        <div class="fm-tbl fm-tbl--compact">
          <div class="fm-tbl__row fm-tbl__row--1">
            <div class="fm-tbl__label">임금 산정 방식</div>
            <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;gap:16px;min-height:44px;align-items:center;">
              <label class="cb"><input type="radio" name="ctrnewd-kind" value="fixedOT" ${c.wageKind === 'fixedOT' ? 'checked' : ''} /> 일반</label>
              <label class="cb"><input type="radio" name="ctrnewd-kind" value="inclusive" ${c.wageKind === 'inclusive' ? 'checked' : ''} /> 포괄임금</label>
            </div>
          </div>
        </div>
        <div style="border:1px solid var(--color-border);border-radius:6px;overflow:hidden;margin-top:10px;background:var(--color-surface);">
          <div style="${grid}background:var(--color-surface-alt);font-size:11.5px;font-weight:var(--fw-medium);color:var(--color-text-muted);">
            <div style="white-space:nowrap;">기준시간</div>
            <div style="text-align:right;white-space:nowrap;">기준시간(월)</div>
            <div style="text-align:right;white-space:nowrap;">지급배율</div>
          </div>
          ${NEW_OT_CATS.map(cat => `
          <div style="${grid}border-top:1px solid var(--color-divider);">
            <div style="font-size:12.5px;white-space:nowrap;">${esc(cat.label)}</div>
            <div style="text-align:right;"><input class="input" type="number" min="0" step="1" data-ctrnewd-ot="${cat.key}" value="${c.otHours[cat.key] || ''}" placeholder="0" style="width:92px;text-align:right;" /></div>
            <div style="text-align:right;font-size:12px;color:var(--color-text-muted);white-space:nowrap;">${cat.rate.toFixed(1)}배</div>
          </div>`).join('')}
        </div>`;
    } else if (cfg.wage === 'hourly') {
      body = `
        <div class="fm-tbl fm-tbl--compact">
          <div class="fm-tbl__row fm-tbl__row--1">
            <div class="fm-tbl__label">소정근로시간</div>
            <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;gap:14px;min-height:44px;align-items:center;flex-wrap:wrap;">
              <span style="display:inline-flex;align-items:center;gap:6px;">1일 <input class="input" type="number" min="0" max="24" data-ctrnewd-stdday value="${c.stdDay}" style="width:74px;text-align:right;" />시간</span>
              <span style="display:inline-flex;align-items:center;gap:6px;">1주 <input class="input" type="number" min="0" max="7" data-ctrnewd-stdweek value="${c.stdWeek}" style="width:74px;text-align:right;" />일</span>
            </div>
          </div>
        </div>`;
    } else {
      body = `
        <div class="fm-tbl fm-tbl--compact">
          <div class="fm-tbl__row fm-tbl__row--1">
            <div class="fm-tbl__label">계약 개월 수</div>
            <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;gap:8px;min-height:44px;align-items:center;">
              <input class="input" type="number" min="1" max="120" data-ctrnewd-svcmonths value="${c.svcMonths}" style="width:90px;text-align:right;" />
              <span style="font-size:12px;color:var(--color-text-muted);">개월 (월 지급액 산정 기준)</span>
            </div>
          </div>
        </div>`;
    }
    m.querySelector('[data-ctrnewd-body]').innerHTML = body
      + (NEW.detailBulk
        ? `<div style="margin-top:10px;font-size:11.5px;color:var(--color-text-muted);">체크한 대상자 전체에 동일하게 적용됩니다.</div>`
        : '');
    m.classList.add('is-open');
  }
  /* 기존 계약 조건 → 상세 조건 모달 입력값으로 채우기.
     '일괄 조건으로 되돌리기' 는 툴바에서 적용한 공통값으로 돌아가는 것이고,
     이 버튼은 직전 계약(기존 계약 컬럼) 과 동일한 조건을 그대로 쓰고 싶을 때 사용한다. */
  function loadPrevCondToDetail() {
    const cfg = newCfg() || {};
    const m = document.getElementById('modal-ctrnew-detail');
    const id = NEW.detailEmpId;
    if (!m || !id) return;
    const emp = (newCandidates().find(x => x.emp.id === id) || {}).emp;
    if (!emp) return;
    if (cfg.wage === 'annual') {
      const kind = emp.wageContractKind === 'inclusive' ? 'inclusive'
                 : (emp.wageContractKind === 'fixedOT' ? 'fixedOT' : '');
      if (!kind) { window.toast && window.toast('기존 계약의 임금 조건이 없습니다.', 'warning'); return; }
      const k = m.querySelector(`[name="ctrnewd-kind"][value="${kind}"]`);
      if (k) k.checked = true;
      /* 마스터에는 기준시간 합계만 보관 — 연장근로 기준시간으로 환원해 채운다 */
      const total = Number(emp.fixedOTHours || emp.inclusiveHours || 0) || 0;
      NEW_OT_CATS.forEach(cat => {
        const el = m.querySelector(`[data-ctrnewd-ot="${cat.key}"]`);
        if (el) el.value = cat.key === 'extension' ? (total || '') : '';
      });
    } else if (cfg.wage === 'hourly') {
      const d = Number(emp.hoursPerDay || 0), w = Number(emp.daysPerWeek || 0);
      if (!d && !w) { window.toast && window.toast('기존 계약의 소정근로 조건이 없습니다.', 'warning'); return; }
      const de = m.querySelector('[data-ctrnewd-stdday]'),  we = m.querySelector('[data-ctrnewd-stdweek]');
      if (de) de.value = d || '';
      if (we) we.value = w || '';
    } else {
      const mo = Number(emp.contractMonths || 0);
      if (!mo) { window.toast && window.toast('기존 계약의 계약 개월 수가 없습니다.', 'warning'); return; }
      const el = m.querySelector('[data-ctrnewd-svcmonths]');
      if (el) el.value = mo;
    }
    window.toast && window.toast('기존 계약 조건을 불러왔습니다. [적용] 을 눌러 반영하세요.', 'info');
  }

  function saveNewDetail() {
    const cfg = newCfg() || {};
    const m = document.getElementById('modal-ctrnew-detail');
    const id = NEW.detailEmpId;
    if (!m || !id) return;
    const o = {};
    if (cfg.wage === 'annual') {
      const k = m.querySelector('[name="ctrnewd-kind"]:checked');
      o.wageKind = k ? k.value : NEW.wageKind;
      o.otHours = {};
      NEW_OT_CATS.forEach(cat => {
        const el = m.querySelector(`[data-ctrnewd-ot="${cat.key}"]`);
        const v = newNum(el && el.value);
        if (v) o.otHours[cat.key] = v;
      });
    } else if (cfg.wage === 'hourly') {
      o.stdDay  = newNum((m.querySelector('[data-ctrnewd-stdday]')  || {}).value);
      o.stdWeek = newNum((m.querySelector('[data-ctrnewd-stdweek]') || {}).value);
    } else {
      o.svcMonths = newNum((m.querySelector('[data-ctrnewd-svcmonths]') || {}).value) || NEW.svcMonths;
    }
    if (NEW.detailBulk) {
      /* 일괄 모드 — 체크한 대상자 전체에 동일 조건 적용 */
      const targets = newCandidates().filter(x => NEW.formChecked.has(x.emp.id));
      targets.forEach(x => { NEW.overrides[x.emp.id] = Object.assign({}, o); });
      NEW.detailBulk = false;
      closeNewDetail(); renderNewCtr();
      window.toast && window.toast(`${targets.length}명에 조건을 일괄 적용했습니다.`, 'success');
      return;
    }
    NEW.overrides[id] = o;
    closeNewDetail();
    renderNewCtr();
    window.toast && window.toast('상세 조건을 적용했습니다.', 'success');
  }

  /* 계약기간 일괄 적용 — 체크한 행의 종료일 = 시작일 + N개월 - 1일 */
  function newApplyBulkTerm(months) {
    const m = Number(months) || 0;
    if (m <= 0) return false;
    const targets = newCandidates().filter(x => NEW.formChecked.has(x.emp.id));
    if (!targets.length) return false;
    targets.forEach(x => {
      const t = newTermFor(x);
      NEW.terms[x.emp.id] = { start: t.start, end: shiftDays(shiftMonths(t.start, m), -1), indefinite: false };
    });
    NEW.bulkTermApplied = m;
    NEW.bulkEnd = '';
    return true;
  }
  /* 종료일 일괄 지정 — 체크한 행의 종료일을 같은 날짜로 (개월 수 대신 날짜를 직접 지정) */
  function newApplyBulkEnd(ymd) {
    if (!ymd) return false;
    const targets = newCandidates().filter(x => NEW.formChecked.has(x.emp.id));
    if (!targets.length) return false;
    targets.forEach(x => {
      const t = newTermFor(x);
      NEW.terms[x.emp.id] = { start: t.start, end: ymd, indefinite: false };
    });
    NEW.bulkEnd = ymd;
    NEW.bulkTermApplied = 0;
    return true;
  }
  /* 금액 일괄 적용 — 체크한 행에만. 값이 없으면 입력 필드에 인라인 안내 */
  function newApplyBulkAmount(el) {
    const v = newNum(el && el.value);
    NEW.bulkAmt = v;
    if (v <= 0) {
      if (el && App.Forms) App.Forms.setFieldError(el, '일괄 적용할 금액을 입력해 주세요.');
      return false;
    }
    newCandidates().filter(x => NEW.formChecked.has(x.emp.id)).forEach(x => {
      NEW.amounts[x.emp.id] = v;
      /* 인상률 칸이 있는 연봉 문서는 역산값으로 함께 채워 두 값이 어긋나지 않게 한다 */
      NEW.raisePct[x.emp.id] = newPctFromAmount(newBaseAmount(x.emp), v);
    });
    return true;
  }
  /* 인상률 일괄 적용 — 체크한 행에만. 기존 연봉이 없는 대상자는 산정 기준이 없어 건너뛴다 */
  function newApplyBulkPct(el) {
    const raw = String((el && el.value) || '').replace(/[^\d.\-]/g, '');
    NEW.bulkPct = raw;
    const p = parseFloat(raw);
    if (!Number.isFinite(p)) {
      if (el && App.Forms) App.Forms.setFieldError(el, '일괄 적용할 인상률을 입력해 주세요.');
      return false;
    }
    let skipped = 0;
    newCandidates().filter(x => NEW.formChecked.has(x.emp.id)).forEach(x => {
      const base = newBaseAmount(x.emp);
      if (!base) { skipped++; return; }
      NEW.raisePct[x.emp.id] = raw;
      NEW.amounts[x.emp.id]  = newAmountFromPct(base, p);
    });
    if (skipped) window.toast && window.toast(`기존 연봉이 없는 ${skipped}명은 인상률을 적용할 수 없습니다. 연봉 금액을 직접 입력해 주세요.`, 'warning');
    return true;
  }

  function wireNewCtr(modal) {
    if (!modal) return;
    /* 위임 핸들러는 페이지 엘리먼트에 붙는다 — 작성 화면을 다시 열 때 중복 바인딩되면
       한 번의 [일괄 작성] 으로 계약이 2부 생성되므로 최초 1회만 바인딩한다. */
    if (modal.dataset.ctrnewBound) return;
    modal.dataset.ctrnewBound = '1';
    /* 일괄 적용 바 — Enter 로 바로 적용 (금액 / 계약기간 직접입력) */
    modal.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const t = e.target;
      if (t.hasAttribute && t.hasAttribute('data-ctrnew-bulkamt')) {
        e.preventDefault();
        if (newApplyBulkAmount(t)) renderNewCtr();
        return;
      }
      if (t.hasAttribute && t.hasAttribute('data-ctrnew-bulkpct')) {
        e.preventDefault();
        if (newApplyBulkPct(t)) renderNewCtr();
        return;
      }
    });
    modal.addEventListener('click', (e) => {
      if (e.target.closest('[data-ctrnew-close]')) {
        if (NEW.amendId) { closeAmendModal(); return; }
        closeNewCtr(); return;
      }
      /* 페이지바 ← — 정보 입력 단계에서는 이전 단계로, 대상자 선택 단계에서는 목록으로 */
      if (e.target.closest('[data-ctrnew-backnav]')) {
        /* 정정은 단계가 하나뿐이라 곧바로 목록으로 */
        if (NEW.step === 'form' && !NEW.amendId) { NEW.step = 'pick'; renderNewCtr(); } else { closeNewCtr(); }
        return;
      }
      /* 근로유형 칩 */
      const t = e.target.closest('[data-ctrnew-type]');
      if (t) {
        NEW.empType = t.dataset.ctrnewType;
        NEW.docTitle = newDefaultDoc(NEW.empType);
        newResetResult();
        if (NEW.docTitle) { newSyncDefaults(); newApplyDefaultRange(); }
        renderNewCtr(); return;
      }
      /* 검색 기간 프리셋 (과거 1·3·6개월) */
      const r = e.target.closest('[data-ctrnew-range]');
      if (r) { newApplyPreset(Number(r.dataset.ctrnewRange) || 1); newResetResult(); renderNewCtr(); return; }
      /* 조회 / 초기화 */
      if (e.target.closest('[data-ctrnew-search]')) {
        if (!NEW.docTitle) {
          window.toast && window.toast('계약서 종류를 먼저 선택해 주세요.', 'warning');
          return;
        }
        NEW.searched = true; NEW.selected.clear();
        renderNewCtr(); return;
      }
      if (e.target.closest('[data-ctrnew-reset]')) {
        NEW.keyword = '';
        newApplyDefaultRange(); newResetResult(); renderNewCtr(); return;
      }
      /* 대상자별 상세 조건 설정 / 선택 행 일괄 설정 */
      const dt = e.target.closest('[data-ctrnew-detail]');
      if (dt) { NEW.detailBulk = false; openNewDetail(dt.dataset.ctrnewDetail); return; }
      /* 정정 모달 — 푸터 [계약서 미리보기] */
      if (e.target.closest('[data-ctrnewa-preview]')) {
        const c = amendCandidate();
        if (c) openNewPreview(c.emp.id);
        return;
      }
      /* 계약서 미리 보기 — 표에 입력한 조건으로 실제 서식 렌더 */
      const pv = e.target.closest('[data-ctrnew-preview]');
      if (pv) { openNewPreview(pv.dataset.ctrnewPreview); return; }
      if (e.target.closest('[data-ctrnew-bulkdetail]')) {
        const first = newCandidates().find(x => NEW.formChecked.has(x.emp.id));
        if (first) { NEW.detailBulk = true; openNewDetail(first.emp.id); }
        return;
      }
      /* 엑셀 양식 다운로드 / 업로드 */
      if (e.target.closest('[data-ctrnew-xls-down]')) { newExcelDownload(); return; }
      if (e.target.closest('[data-ctrnew-xls-up]')) {
        const f = modal.querySelector('[data-ctrnew-xls-input]');
        if (f) { f.value = ''; f.click(); }
        return;
      }
      /* 계약기간 일괄 적용 — 종료일 직접입력 [적용] */
      if (e.target.closest('[data-ctrnew-bulkend-apply]')) {
        const el = modal.querySelector('[data-ctrnew-bulkend]');
        const v = el ? el.value : '';
        if (!v) { window.toast && window.toast('적용할 종료일을 선택해 주세요.', 'warning'); return; }
        if (newApplyBulkEnd(v)) renderNewCtr();
        return;
      }
      /* 대상자 목록 성명 클릭 — 인사정보카드 */
      const ec = e.target.closest('[data-ctrnew-emp-card]');
      if (ec) { e.preventDefault(); openEmpCard(ec.dataset.ctrnewEmpCard); return; }
      /* 적용 중인 최근 계약서 클릭 — 해당 계약서 본문 모달 */
      const dc = e.target.closest('[data-ctrnew-doc]');
      if (dc) { e.preventDefault(); openRowDocPreview(dc.dataset.ctrnewDoc); return; }
      /* 계약기간(개월) */
      const tm = e.target.closest('[data-ctrnew-term]');
      if (tm) {
        const m = Number(tm.dataset.ctrnewTerm) || 12;
        if ((newCfg() || {}).wage === 'service') NEW.svcMonths = m; else NEW.termMonths = m;
        renderNewCtr(); return;
      }
      /* 대상자 전체 선택 (조회 결과) */
      if (e.target.closest('[data-ctrnew-pick-all]')) {
        const on = e.target.checked;
        newCandidates().forEach(x => { if (on) NEW.selected.add(x.emp.id); else NEW.selected.delete(x.emp.id); });
        renderNewCtr(); return;
      }
      /* 정보 입력 단계 — 일괄 적용 대상 전체 선택 */
      if (e.target.closest('[data-ctrnew-fcheck-all]')) {
        const on = e.target.checked;
        NEW.formChecked = new Set();
        if (on) newCandidates().filter(x => NEW.selected.has(x.emp.id)).forEach(x => NEW.formChecked.add(x.emp.id));
        renderNewCtr(); return;
      }
      /* 인상률 일괄 적용 — 체크한 행에만 */
      if (e.target.closest('[data-ctrnew-applypct]')) {
        if (!newApplyBulkPct(modal.querySelector('[data-ctrnew-bulkpct]'))) return;
        renderNewCtr(); return;
      }
      /* 금액 일괄 적용 — 체크한 행에만 */
      if (e.target.closest('[data-ctrnew-applyall]')) {
        const el = modal.querySelector('[data-ctrnew-bulkamt]');
        if (!newApplyBulkAmount(el)) return;
        renderNewCtr(); return;
      }
      /* 단계 이동 */
      if (e.target.closest('[data-ctrnew-next]')) { NEW.step = 'form'; newPrefillAmounts(); renderNewCtr(); return; }
      if (e.target.closest('[data-ctrnew-back]')) { NEW.step = 'pick'; renderNewCtr(); return; }
      if (e.target.closest('[data-ctrnew-submit]')) { commitNewCtr(); return; }
    });
    modal.addEventListener('change', (e) => {
      const t = e.target;
      /* 계약서 종류 — 드롭다운(신규) / 라디오(legacy) 모두 허용 */
      if (t.name === 'ctrnew-doc' || (t.hasAttribute && t.hasAttribute('data-ctrnew-doc-select'))) {
        NEW.docTitle = t.value;
        newResetResult(); newSyncDefaults(); newApplyDefaultRange();
        renderNewCtr(); return;
      }
      /* 검색 기간 직접 입력 — 프리셋 활성 표시 해제 */
      if (t.hasAttribute && t.hasAttribute('data-ctrnew-from')) { NEW.from = t.value; NEW.preset = 0; newResetResult(); renderNewCtr(); return; }
      if (t.hasAttribute && t.hasAttribute('data-ctrnew-to'))   { NEW.to   = t.value; NEW.preset = 0; newResetResult(); renderNewCtr(); return; }
      /* 입사일 필터 (정규직 연봉 계약서) */
      if (t.hasAttribute && t.hasAttribute('data-ctrnew-joinfrom')) { NEW.joinFrom = t.value; newResetResult(); renderNewCtr(); return; }
      if (t.hasAttribute && t.hasAttribute('data-ctrnew-jointo'))   { NEW.joinTo   = t.value; newResetResult(); renderNewCtr(); return; }
      /* 엑셀 업로드 — 파일 선택 시 파싱해 계약기간·금액 반영 */
      if (t.hasAttribute && t.hasAttribute('data-ctrnew-xls-input')) {
        newExcelUpload(t.files && t.files[0]);
        return;
      }
      /* 일괄 적용 — 계약기간 드롭다운 (개월 선택 시 즉시 적용 / '직접입력' 은 날짜 + [적용] 노출) */
      if (t.hasAttribute && t.hasAttribute('data-ctrnew-bulkterm-sel')) {
        const v = t.value;
        if (v === 'custom') { NEW.bulkTermMode = 'custom'; renderNewCtr(); return; }
        NEW.bulkTermMode = '';
        if (Number(v) > 0) newApplyBulkTerm(Number(v));
        renderNewCtr(); return;
      }
      /* 종료일 직접 지정 — 값만 보관하고 [적용] 클릭 시 반영 */
      if (t.hasAttribute && t.hasAttribute('data-ctrnew-bulkend')) { NEW.bulkEnd = t.value; return; }
      /* 정보 입력 단계 — 행 체크 (일괄 적용 대상). 카운트·버튼 활성만 갱신해 체크 상태를 보존 */
      const fc = t.closest && t.closest('[data-ctrnew-fcheck]');
      if (fc) {
        const id = fc.dataset.ctrnewFcheck;
        if (fc.checked) NEW.formChecked.add(id); else NEW.formChecked.delete(id);
        renderNewCtr(); return;
      }
      /* 대상자별 계약기간 셀 — 시작일 / 종료일 직접 수정 */
      const sId = t.getAttribute && t.getAttribute('data-ctrnew-start');
      const eId = t.getAttribute && t.getAttribute('data-ctrnew-end');
      if (sId || eId) {
        const id = sId || eId;
        const cand = newCandidates().find(x => x.emp.id === id);
        const cur = NEW.terms[id] || (cand ? newTermFor(cand) : { start: '', end: '', indefinite: false });
        NEW.terms[id] = {
          start: sId ? t.value : cur.start,
          end:   eId ? t.value : cur.end,
          indefinite: !!cur.indefinite,
        };
        return;
      }
      const pick = t.closest && t.closest('[data-ctrnew-pick]');
      if (pick) {
        const id = pick.dataset.ctrnewPick;
        if (pick.checked) NEW.selected.add(id); else NEW.selected.delete(id);
        /* 행 체크는 부분 렌더 없이 카운트만 갱신 (체크박스 상태 유지) */
        const hint = modal.querySelector('[data-ctrnew-hint]');
        const nx = modal.querySelector('[data-ctrnew-next]');
        if (nx) nx.disabled = !(NEW.docTitle && NEW.selected.size);
        if (hint) hint.textContent = `${(newCfg() || {}).rangeLabel || ''} 기준 대상자 중 ${NEW.selected.size}명 선택`;
        return;
      }
    });
    modal.addEventListener('input', (e) => {
      const t = e.target;
      /* 검색어는 [조회] 시 반영 — 입력 중 재렌더로 포커스가 튀지 않게 상태만 보관 */
      if (t.hasAttribute && t.hasAttribute('data-ctrnew-kw')) { NEW.keyword = t.value; return; }
      /* 일괄 적용 바 — 인상률도 입력값만 보관 */
      if (t.hasAttribute && t.hasAttribute('data-ctrnew-bulkpct')) {
        const clean = t.value.replace(/[^\d.\-]/g, '');
        if (clean !== t.value) {
          const caret = Math.max(0, t.selectionStart - 1);
          t.value = clean; t.setSelectionRange(caret, caret);
        }
        NEW.bulkPct = clean;
        if (App.Forms) App.Forms.clearFieldError(t);
        return;
      }
      /* 일괄 적용 바 — 금액은 입력값만 보관(적용은 Enter / [적용] 클릭 시) */
      if (t.hasAttribute && t.hasAttribute('data-ctrnew-bulkamt')) {
        const n = newNum(t.value);
        NEW.bulkAmt = n;
        if (App.Forms) App.Forms.clearFieldError(t);
        const caretEnd = t.selectionStart === t.value.length;
        t.value = n ? money(n) : '';
        if (caretEnd) t.setSelectionRange(t.value.length, t.value.length);
        return;
      }
      if (t.hasAttribute && t.hasAttribute('data-ctrnew-ot')) {
        NEW.otHours[t.getAttribute('data-ctrnew-ot')] = newNum(t.value); return;
      }
      if (t.hasAttribute && t.hasAttribute('data-ctrnew-stdday'))  { NEW.stdDay  = newNum(t.value); return; }
      if (t.hasAttribute && t.hasAttribute('data-ctrnew-stdweek')) { NEW.stdWeek = newNum(t.value); return; }
      /* 연봉 인상률 입력 → 연봉 금액 자동 산출 (기존 연봉 × (1 + %/100)).
         숫자·소수점·음수(감액) 만 허용하고, 값은 사용자가 입력한 문자열 그대로 보존한다. */
      const pctId = t.hasAttribute && t.hasAttribute('data-ctrnew-pct') ? t.getAttribute('data-ctrnew-pct') : '';
      if (pctId) {
        const clean = t.value.replace(/[^\d.\-]/g, '');
        if (clean !== t.value) {
          const caret = Math.max(0, t.selectionStart - 1);
          t.value = clean;
          t.setSelectionRange(caret, caret);
        }
        NEW.raisePct[pctId] = clean;
        const cand = newCandidates().find(x => x.emp.id === pctId);
        NEW.amounts[pctId] = newAmountFromPct(newBaseAmount(cand && cand.emp), clean);
        newSyncDerivedCells(modal, pctId, { amount: true });
        return;
      }
      const amt = t.hasAttribute && t.hasAttribute('data-ctrnew-amt') ? t.getAttribute('data-ctrnew-amt') : '';
      if (amt) {
        const n = newNum(t.value);
        NEW.amounts[amt] = n;
        const caretEnd = t.selectionStart === t.value.length;
        t.value = n ? money(n) : '';
        if (caretEnd) t.setSelectionRange(t.value.length, t.value.length);
        /* 금액을 직접 고치면 인상률을 역산해 두 값이 어긋나지 않게 한다 */
        const cand2 = newCandidates().find(x => x.emp.id === amt);
        NEW.raisePct[amt] = newPctFromAmount(newBaseAmount(cand2 && cand2.emp), n);
        /* 인상률 · 월 임금 라인 즉시 갱신 — 재렌더 없이 포커스 유지 */
        newSyncDerivedCells(modal, amt, { pct: true });
      }
    });
  }

  /* 조회 결과·선택·개별 입력 초기화 — 검색 조건이 바뀌면 이전 결과를 남기지 않는다 */
  function newResetResult() {
    NEW.searched = false;
    NEW.selected = new Set();
    NEW.formChecked = new Set();
    NEW.amounts = {}; NEW.terms = {}; NEW.overrides = {}; NEW.raisePct = {};
    NEW.bulkAmt = 0; NEW.bulkPct = ''; NEW.bulkEnd = ''; NEW.bulkTermMode = ''; NEW.bulkTermApplied = 0;
  }

  /* 정보 입력 진입 시 금액 기본값 — 기존 계약과 동일한 금액을 미리 채운다.
       · 수습 연장(정규직 수습 근로계약서) : 임금 조건 승계 (수정 불가)
       · 일용직 근로계약서                 : 기존 시급과 동일한 값에서 시작 (수정 가능) */
  function newPrefillAmounts() {
    const cfg = newCfg() || {};
    if (!cfg.inherit) return;
    newCandidates().filter(x => NEW.selected.has(x.emp.id)).forEach(x => {
      if (NEW.amounts[x.emp.id] != null) return;
      const emp = x.emp;
      const v = cfg.wage === 'hourly'
        ? (newNum(emp.hourlyWage) || Math.round(newNum(emp.contractAmount) / 1.2))
        : newNum(emp.contractAmount);
      if (v > 0) {
        NEW.amounts[emp.id] = v;
        /* 기존과 동일 금액에서 시작하므로 인상률은 0% (기준 연봉이 있을 때만) */
        NEW.raisePct[emp.id] = newPctFromAmount(newBaseAmount(emp), v);
      }
    });
  }

  /* 계약서 종류에 맞는 기본값 — 기준시간(연장 20h) / 계약기간 / 개월 수 */
  function newSyncDefaults() {
    const cfg = newCfg() || {};
    if (cfg.wage === 'annual' && !Object.keys(NEW.otHours).length) NEW.otHours = { extension: 20 };
    if (cfg.term && cfg.term.pick) NEW.termMonths = cfg.term.months || 12;
    if (cfg.wage === 'service') NEW.svcMonths = cfg.term.months || 12;
  }

  function openNewCtr() {
    const pageEl = document.getElementById('page-hr-contract');
    if (!pageEl) return;
    NEW.step = 'pick'; NEW.empType = ''; NEW.docTitle = ''; NEW.amendId = '';
    NEW.from = ''; NEW.to = ''; NEW.preset = 1;
    NEW.joinFrom = ''; NEW.joinTo = ''; NEW.keyword = '';
    NEW.otHours = {};
    NEW.wageKind = 'fixedOT'; NEW.termMonths = 12; NEW.svcMonths = 12;
    NEW.stdDay = 8; NEW.stdWeek = 5;
    newResetResult();
    renderNewCtrShell(pageEl);
    renderNewCtr();
  }

  /* ── 계약 정정 — 계약 완료 건의 조건을 직원과 합의해 고치고 다시 서명 요청.
       정보 입력 화면(1명)을 그대로 재사용하고, 저장 시 같은 계약서를 갱신해 상태를 '서명 대기' 로 되돌린다.
       흐름: 계약서 작성 → 서명 요청 발송 → 직원 전자 서명 → 계약 완료 → [정정] → 서명 대기 ── */
  /* 정정 모달 — 정정은 대상자 1명·단계 없음이라 페이지 전환 대신 모달로 처리한다 */
  function injectAmendModal() {
    if (document.getElementById('modal-ctrnew-amend')) return;
    const html = `
<div class="modal-backdrop" id="modal-ctrnew-amend" data-modal-id="ctrnew-amend" style="z-index:1140;">
  <div class="modal modal--lg" style="display:flex;flex-direction:column;max-height:88vh;">
    <div class="modal__header">
      <div class="modal__title" data-ctrnewa-title>계약 정정</div>
      <button class="modal__close" type="button" data-ctrnew-close aria-label="닫기">✕</button>
    </div>
    <div class="modal__body" style="padding:0;background:var(--color-surface-alt);overflow:auto;min-height:0;" data-ctrnewa-body></div>
    <div class="modal__footer">
      <button class="btn" type="button" data-ctrnewa-preview style="margin-right:auto;">계약서 미리보기</button>
      <span data-ctrnew-hint hidden></span>
      <button class="btn" type="button" data-ctrnew-close>취소</button>
      <button class="btn btn--primary" type="button" data-ctrnew-submit>정정 · 서명 요청 발송</button>
    </div>
  </div>
</div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    const m = document.getElementById('modal-ctrnew-amend');
    m.addEventListener('click', (e) => { if (e.target === m) closeAmendModal(); });
    wireNewCtr(m);   /* 정보 입력 화면과 동일한 위임 핸들러를 모달에도 바인딩 */
  }
  function closeAmendModal() {
    const m = document.getElementById('modal-ctrnew-amend');
    if (m) m.classList.remove('is-open');
    if (!document.querySelector('.modal-backdrop.is-open')) document.body.style.overflow = '';
    NEW.amendId = '';
  }
  /* 정정 모달 본문 — 대상이 1명이라 표 대신 「기존 → 변경」 폼으로 구성한다.
     각 행은 좌측에 기존 계약 값, 우측에 변경 입력. 데이터 훅(data-ctrnew-*)은 정보 입력 화면과 동일. */
  function renderAmendForm() {
    const row = STATE.rows.find(r => r.id === NEW.amendId);
    const cand = amendCandidate();
    if (!row || !cand) return '';
    const cfg  = newCfg() || {};
    const lock = cfg.lock || {};
    const emp  = cand.emp;
    const t    = newTermFor(cand);
    const isSvc = cfg.wage === 'service';
    const isAnn = cfg.wage === 'annual';
    const hasMonthly = isAnn || isSvc;
    const wageEnd = !!(cfg.term && cfg.term.wageEnd);
    const isWageTerm = wageEnd || cfg.pool === 'annual';
    const amtLabel  = cfg.wage === 'hourly' ? '시급' : (isSvc ? '계약금액' : '연봉');
    const condLabel = cfg.wage === 'hourly' ? '소정근로' : (isSvc ? '계약 개월' : '임금 산정');
    const ov = newHasOverride(emp.id);

    const r1 = (label, val) => `
      <div class="fm-tbl__row fm-tbl__row--1">
        <div class="fm-tbl__label">${label}</div>
        <div class="fm-tbl__value">${val}</div>
      </div>`;
    /* 기존 값 → 변경 입력 한 줄 — 기존/화살표/변경 3열 그리드로 세로 정렬을 맞춘다 */
    const rChange = (label, prev, next) => r1(label, `
      <div style="display:grid;grid-template-columns:150px 18px 1fr;align-items:center;gap:8px;width:100%;">
        <span style="color:var(--color-text);">${prev}</span>
        <span style="color:var(--color-text-muted);text-align:center;">→</span>
        <span style="display:inline-flex;align-items:center;gap:6px;min-width:0;">${next}</span>
      </div>`);
    const dispOr = (v) => v ? esc(dispYmd(v)) : '-';
    const s = row.salary || {};

    const startCell = lock.start
      ? `<span>${dispOr(t.start)}</span><span style="font-size:var(--fs-xs);color:var(--color-text-muted);">(입사일 고정)</span>`
      : `<input class="input input--date" type="date" data-ctrnew-start="${esc(emp.id)}" value="${esc(t.start)}" style="width:170px;" />`;
    const endCell = (t.indefinite && !t.wageEnd)
      ? `<span style="color:var(--color-text-muted);">기간의 정함 없음</span>`
      : `<input class="input input--date" type="date" data-ctrnew-end="${esc(emp.id)}" value="${esc(t.end)}" style="width:170px;" />`;
    /* 연봉은 「기존 대비 % 인상」 이 1차 입력값 — 인상률 → 금액 자동 산출, 금액 직접 수정 시 % 역산 */
    const pctInput = `<input class="input" type="text" inputmode="decimal" data-ctrnew-pct="${esc(emp.id)}"
                value="${esc(NEW.raisePct[emp.id] != null ? NEW.raisePct[emp.id] : '')}" placeholder="0"
                style="width:80px;text-align:right;" /> %`;
    const amtInput = `<input class="input" type="text" inputmode="numeric" data-ctrnew-amt="${esc(emp.id)}"
                value="${NEW.amounts[emp.id] != null ? esc(money(NEW.amounts[emp.id])) : ''}" placeholder="0"
                style="width:170px;text-align:right;" /> 원`;
    const amtCell = lock.amount
      ? `<strong>${money(Number(NEW.amounts[emp.id]) || 0)}</strong> 원 <span style="font-size:var(--fs-xs);color:var(--color-text-muted);">(수습 연장 — 임금 조건 승계)</span>`
      : (isAnn && newBaseAmount(emp))
        ? `${pctInput} <span style="color:var(--color-text-muted);">→</span> ${amtInput}`
        : amtInput;

    return `
      <div style="padding:16px 20px;overflow:auto;">
        <div class="fm-tbl fm-tbl--compact fm-tbl--bordered fm-tbl--wide-label" style="margin-bottom:14px;">
          ${r1('직원', `
            <div style="display:flex;align-items:center;gap:8px;">
              ${empAvatarHTML(emp)}
              <a href="#" data-ctrnew-emp-card="${esc(emp.id)}" style="color:var(--color-brand-primary);font-weight:var(--fw-medium);">${esc(emp.name)}</a>
              <span style="color:var(--color-text-muted);font-size:var(--fs-sm);">${esc(emp.id)} · ${esc(emp.dept || '-')}${emp.rank ? ' · ' + esc(emp.rank) : ''}${emp.position ? ' · ' + esc(emp.position) : ''}</span>
            </div>`)}
          ${r1('정정 대상 계약', `
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span class="link-code" style="cursor:default;">${esc(row.id)}</span>
              <span style="color:var(--color-text-sub);">${esc(kindDisplay(row))}</span>
              <span style="color:var(--color-text);">${esc(periodText(row))}</span>
              ${statusPill(effectiveStatusCode(row))}
            </div>`)}
        </div>

        <div style="font-size:var(--fs-md);font-weight:var(--fw-semibold);color:var(--color-text);margin:0 0 8px;">변경 내용</div>
        <div class="fm-tbl fm-tbl--compact fm-tbl--bordered fm-tbl--wide-label">
          ${rChange(isWageTerm ? '임금계약 시작일' : '계약시작일', dispOr(row.startDate), startCell)}
          ${rChange(isWageTerm ? '임금계약 종료일' : '계약종료일',
              row.indefinite && !row.wageEndDate ? '기간의 정함 없음' : dispOr(row.wageEndDate || row.endDate), endCell)}
          ${rChange(amtLabel, newPrevAmountText(emp), amtCell)}
          ${hasMonthly ? r1(isSvc ? '월 지급액' : '월 임금', `
            <div style="display:grid;grid-template-columns:150px 18px 1fr;align-items:center;gap:8px;width:100%;">
              <span style="color:var(--color-text);">${wageBreakHTML(s)}</span>
              <span style="color:var(--color-text-muted);text-align:center;">→</span>
              <strong data-ctrnew-wage="${esc(emp.id)}" style="color:var(--color-brand-primary);">${nextWageBreakHTML(cand)}</strong>
            </div>`) : ''}
          ${rChange(condLabel, esc(newPrevCondText(emp)), `
            <span style="color:${ov ? 'var(--color-brand-primary)' : 'var(--color-text)'};font-weight:${ov ? 'var(--fw-semibold)' : 'var(--fw-regular)'};">${esc(newNextCondText(emp.id))}</span>
            <button class="btn btn--xs${ov ? ' btn--soft-primary' : ''}" type="button" data-ctrnew-detail="${esc(emp.id)}">설정</button>`)}
        </div>
      </div>`;
  }
  function renderAmendCtr() {
    const m = document.getElementById('modal-ctrnew-amend');
    if (!m) return;
    m.querySelector('[data-ctrnewa-title]').textContent = `${NEW.docTitle} 정정 — ${NEW.amendId}`;
    m.querySelector('[data-ctrnewa-body]').innerHTML = renderAmendForm();
    const hint = m.querySelector('[data-ctrnew-hint]');
    if (hint) hint.textContent = '직원과 합의한 조건으로 수정한 뒤 재서명을 요청합니다.';
  }
  function openAmendCtr(rowId) {
    const row = STATE.rows.find(r => r.id === rowId);
    if (!row) return;
    const s = row.salary || {};
    NEW.amendId = rowId;
    NEW.step = 'form';
    NEW.docTitle = row.docTitle || deriveDocTitle({ empType: 'regular' }, row);
    NEW.empType = (NEW_DOC_CFG[NEW.docTitle] || {}).empType || '';
    NEW.searched = true;
    NEW.selected = new Set([row.empId]);
    NEW.formChecked = new Set();
    NEW.amounts = {}; NEW.terms = {}; NEW.overrides = {}; NEW.raisePct = {};
    NEW.bulkAmt = 0; NEW.bulkPct = ''; NEW.bulkEnd = ''; NEW.bulkTermMode = ''; NEW.bulkTermApplied = 0;
    /* 현재 계약 조건을 그대로 채워 두고, 바꿀 값만 수정하게 한다 */
    NEW.terms[row.empId] = { start: row.startDate || '', end: row.wageEndDate || row.endDate || '' };
    const amt = newNum(s.contractAmount) || newNum(s.hourly);
    if (amt) {
      NEW.amounts[row.empId] = amt;
      /* 정정은 현재 계약 조건에서 출발하므로 인상률 0% */
      NEW.raisePct[row.empId] = newPctFromAmount(newNum(s.contractAmount), amt);
    }
    NEW.wageKind = s.wageKind || s.wageContractKind || 'fixedOT';
    NEW.otHours  = newNum(s.fixedOTHours) ? { extension: newNum(s.fixedOTHours) } : {};
    NEW.stdDay   = newNum(s.hoursPerDay) || 8;
    NEW.stdWeek  = newNum(s.daysPerWeek) || 5;
    NEW.svcMonths = newNum(s.contractMonths) || 12;
    injectAmendModal();
    renderAmendCtr();
    const m = document.getElementById('modal-ctrnew-amend');
    m.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  /* 정정 대상 계약 → 대상자 1명 (검색 조건과 무관) */
  function amendCandidate() {
    const row = STATE.rows.find(r => r.id === NEW.amendId);
    if (!row) return null;
    const list = (window.App && App.HRInfoMgmt && App.HRInfoMgmt.list) ? App.HRInfoMgmt.list() : [];
    const emp = list.find(e => e.id === row.empId)
      || EMPLOYEES.find(e => e.id === row.empId)
      || { id: row.empId, name: row.empName, dept: row.empDept };
    return { emp, base: row.endDate || '', row };
  }

  /* 대상자 1명의 계약 spec — 일괄 작성(commitNewCtr) 과 미리 보기가 같은 값을 쓰도록 한 곳에서 만든다.
     addRowFromExternal 이 받는 형태와 동일. */
  function newRowSpec(x) {
    const cfg = newCfg() || {};
    const emp = x.emp;
    const t = newTermFor(x);
    const amount = Number(NEW.amounts[emp.id]) || 0;
    const c = newCondFor(emp.id);
    const H = 209;                       /* 월 소정근로시간 (연봉제 기준) */
    let salary;
    if (cfg.wage === 'annual') {
      const W = NEW_OT_CATS.reduce((s, cat) => s + (Number(c.otHours[cat.key]) || 0) * cat.rate, 0);
      const M = amount / 12;
      const ot   = (H + W) > 0 ? Math.round(M * W / (H + W)) : 0;
      const base = (H + W) > 0 ? Math.round(M * H / (H + W)) : Math.round(M);
      salary = {
        base, payday: 10, wageType: 'annual', wageKind: c.wageKind,
        contractAmount: amount,
        fixedOT:     c.wageKind === 'fixedOT'   ? ot : '',
        inclusiveOT: c.wageKind === 'inclusive' ? ot : '',
        fixedOTHours: NEW_OT_CATS.reduce((s, cat) => s + (Number(c.otHours[cat.key]) || 0), 0),
        hoursPerDay: 8, hoursPerWeek: 40,
      };
    } else if (cfg.wage === 'hourly') {
      const holiday = Math.floor(amount * 0.2);
      salary = {
        payday: 10, wageType: 'hourly', contractAmount: amount + holiday,
        hourly: amount, holiday,
        hoursPerDay: c.stdDay, daysPerWeek: c.stdWeek, hoursPerWeek: c.stdDay * c.stdWeek,
      };
    } else {
      const months = c.svcMonths || 12;
      salary = { payday: 10, contractAmount: amount, contractMonths: months,
                 monthlyAmount: months ? Math.round(amount / months) : 0 };
    }
    return {
      emp: {
        id: emp.id, name: emp.name, dept: emp.dept, job: emp.job, rank: emp.rank, position: emp.position,
        empType: emp.empType, contractSubType: emp.contractSubType, contractOut: false,
        jobCat: emp.jobCat, site: emp.site,
      },
      kind: cfg.kind, docTitle: NEW.docTitle,
      /* 임금계약서(정규직 연봉 계약서)는 급여 전용 문서라 별도, 그 외는 임금 조건 포함 1부 */
      wageIncluded: cfg.kind !== '임금계약서',
      mode: 'bulk',
      startDate: t.start,
      endDate: t.indefinite ? '' : t.end,
      indefinite: !!t.indefinite,
      /* 무기 근로계약(정규직 전환) 은 근로계약기간이 없고, 입력한 종료일이 임금계약 종료일이다 */
      wageEndDate: (t.indefinite && t.wageEnd) ? (t.end || '') : '',
      status: 'signing', registeredBy: HR_NAME, sentBy: HR_NAME,
      source: '계약 일괄 작성',
      salary,
    };
  }

  /* 정보 입력 단계 필수값 검증 — 통과하면 true.
     실패 시 해당 입력에 .is-invalid 를 붙이고(스크롤 밖의 행도 표시가 남는다) 항목별 미입력 건수를 안내한다. */
  function newValidateForm(cands, cfg) {
    const lock = cfg.lock || {};
    const isWageTerm = !!(cfg.term && cfg.term.wageEnd) || cfg.pool === 'annual';
    const LABEL = {
      amt:   cfg.wage === 'hourly' ? '시급' : (cfg.wage === 'service' ? '계약금액' : '연봉'),
      start: isWageTerm ? '임금계약 시작일' : '계약시작일',
      end:   isWageTerm ? '임금계약 종료일' : '계약종료일',
    };
    const root = document.getElementById('page-hr-contract');
    /* 이전 검증 흔적 제거 — 고친 뒤 다시 누르면 빨간 테두리가 남지 않게 한다 */
    if (root) root.querySelectorAll('[data-ctrnew-amt].is-invalid, [data-ctrnew-start].is-invalid, [data-ctrnew-end].is-invalid')
      .forEach(el => el.classList.remove('is-invalid'));
    const bad = { amt: [], start: [], end: [] };
    cands.forEach(x => {
      const t = newTermFor(x);
      /* 금액은 승계(lock.amount) 여도 필수 — 승계값이 0 이면 계약서 급여 조항이 빈칸으로 나가므로
         이 화면에서 고칠 수 없더라도 발송을 막고 인사정보 쪽 임금 조건을 먼저 채우게 한다. */
      if (!(Number(NEW.amounts[x.emp.id]) > 0)) bad.amt.push(x.emp.id);
      if (!lock.start && !t.start) bad.start.push(x.emp.id);
      /* 종료일 입력칸이 화면에 노출되는 경우만 필수 — 무기 근로계약(임금계약 종료일 미사용)은 제외 */
      if (!(t.indefinite && !t.wageEnd) && !t.end) bad.end.push(x.emp.id);
    });
    const parts = [];
    ['start', 'end', 'amt'].forEach(k => {
      if (!bad[k].length) return;
      parts.push(`${LABEL[k]} ${bad[k].length}명`);
      if (root) bad[k].forEach(id => {
        const el = root.querySelector(`[data-ctrnew-${k === 'amt' ? 'amt' : k}="${id}"]`);
        if (el) el.classList.add('is-invalid');
      });
    });
    if (!parts.length) return true;
    window.toast && window.toast(`${parts.join(' · ')} 이(가) 입력되지 않았습니다.`, 'warning');
    return false;
  }

  /* 5 · 일괄 작성 — 대상자별 동일 종류 계약서 1부씩 생성 (서명 요청 발송 상태) */
  function commitNewCtr() {
    const cfg = newCfg(); if (!cfg) return;
    const cands = newCandidates().filter(x => NEW.selected.has(x.emp.id));
    if (!cands.length) return;
    /* 필수 입력 검증 — 금액 + 계약기간(시작일 / 화면에 노출된 종료일).
       계약서 본문 조항을 채우지 못하는 값은 여기서 막는다. 특히 정규직 전환 근로계약서는
       임금계약 종료일이 기본 빈값이라(newTermFor: 무기 → end:'') 비워 두면 제1조 ②
       임금계약기간을 쓸 수 없으므로 반드시 입력받는다.
       일괄 작업이라 대상이 여러 건 → 해당 입력에 .is-invalid 를 붙이고 항목별 건수를 토스트로 안내. */
    if (!newValidateForm(cands, cfg)) return;
    /* 정정 — 새 계약서를 만들지 않고 기존 계약서를 갱신한 뒤 상태를 '서명 대기' 로 되돌린다 */
    if (NEW.amendId) { commitAmendCtr(cands[0]); return; }
    const created = [];
    cands.forEach(x => {
      const row = App.HRContract.addRowFromExternal(newRowSpec(x));
      if (row) created.push(row.id);
    });
    const label = NEW.docTitle;
    closeNewCtr();   /* 목록으로 복귀 — 생성된 계약이 최신순 최상단에 노출된다 */
    window.toast && window.toast(`${label} ${created.length}부 작성 완료 — 서명 요청이 발송되었습니다.`, 'success');
  }
  /* 계약 정정 확정 — 조건·본문을 갱신하고 재서명 요청(서명 대기) 으로 되돌린다 */
  function commitAmendCtr(cand) {
    const r = STATE.rows.find(x => x.id === NEW.amendId);
    if (!r || !cand) return;
    const spec = newRowSpec(cand);
    const stamp = nowStamp();
    const v = contractBodyValues(Object.assign({}, spec, { docTitle: r.docTitle, wageIncluded: r.wageIncluded }), todayStr());
    r.body        = (TEMPLATES[r.docTitle] || TEMPLATES[r.kind] || tplWork)(v);
    r.startDate   = spec.startDate;
    r.endDate     = spec.endDate;
    r.indefinite  = spec.indefinite;
    r.wageEndDate = spec.wageEndDate || '';
    r.salary      = spec.salary;
    r.status      = 'signing';
    r.sentBy      = HR_NAME; r.sentAt = stamp;
    r.gapSignedAt = stamp;                 /* 회사 인감 재배치 */
    r.eulSignedAt = ''; r.eulSignName = ''; /* 직원 서명은 다시 받아야 한다 */
    delete r.completedAt;
    (r.history || (r.history = [])).push({ at: stamp, title: '계약 정정', desc: `조건 변경 후 재서명 요청 · ${HR_NAME}`, kind: 'warning' });
    r.history.push({ at: stamp, title: '서명 요청 발송', desc: '이메일 발송 · ' + HR_NAME, kind: '' });
    const id = r.id;
    closeAmendModal();
    applyFilter(); renderTable();
    window.toast && window.toast(`${id} 정정 후 서명 요청을 발송했습니다.`, 'success');
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
    DOC_TITLES,          /* 계약서 종류 7종 — 다른 화면이 문자열을 중복 정의하지 않도록 노출 */
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
            id: r.id, kind: r.kind, docTitle: r.docTitle || '', period: periodText(r),
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
            /* docTitle — 계약서 종류명(정규직 수습 근로계약서 / 용역 위탁계약서 등). 표기·조회 기준.
               분류 로직(kind)은 근로계약서/임금계약서 2종을 그대로 사용한다. */
            docTitle: r.docTitle || '', wageIncluded: !!r.wageIncluded,
            /* signedAt — 근로자 서명 완료 시점(= 계약 체결일). 미서명이면 빈 문자열. */
            signedAt: r.eulSignedAt || '',
            startDate: r.startDate || '', endDate: r.endDate || '', indefinite: !!r.indefinite,
            period: periodText(r),
            status: r.status,
            statusLabel: meta.label, statusPill: meta.pill || '',
            registeredBy: r.registeredBy || '',
            createdAt: r.createdAt || '',
            /* 서명 대기(signing)만 취소 가능. 단 '임직원 등록 발송'(근로+임금 한 세트)은 개별 취소 불가 → 버튼 숨김 */
            canCancel: r.status === 'signing' && r.source !== '임직원 등록 발송',
            source: r.source || '',
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
      (r.history || (r.history = [])).push({ at: nowStamp(), title: '서명 요청 취소', desc: HR_NAME, kind: 'warning' });
      return true;
    },
    /* 서명 대기(signing) 계약 정보 수정 — 인사정보카드 계약 이력의 [수정](최초 서명대기 계약) 에서 호출.
       서명 전이므로 계약 조건을 정정해 재서명 받을 수 있다. 계약 본문(body)·기간·급여 스냅샷을 갱신하고 이력에 기록.
       spec: addRowFromExternal 과 동일 형태({ emp, startDate, endDate, indefinite, salary }).
       반환: 수정 성공 여부(boolean). */
    amendSigningContract(empId, id, spec) {
      if (!STATE.rows || !STATE.rows.length) STATE.rows = makeMock();
      const r = STATE.rows.find(x => x.id === id && x.empId === empId);
      if (!r || r.status !== 'signing' || !spec || !spec.emp) return false;
      const indefinite = !!spec.indefinite;
      const start = spec.startDate || '';
      const end = indefinite ? '' : (spec.endDate || '');
      /* 문서 종류·임금포함 여부는 발송 당시 값을 유지 (spec 에 명시되면 그 값 우선) */
      const docTitle = spec.docTitle || r.docTitle || '';
      const wageIncluded = (spec.wageIncluded != null) ? !!spec.wageIncluded : !!r.wageIncluded;
      const v = contractBodyValues({ ...spec, docTitle, wageIncluded }, r.createdAt || todayStr());
      r.body = (TEMPLATES[docTitle] || TEMPLATES[r.kind] || tplWork)(v);
      r.docTitle = docTitle; r.wageIncluded = wageIncluded;
      r.startDate = start; r.endDate = end; r.indefinite = indefinite;
      if (spec.salary) r.salary = spec.salary;
      (r.history || (r.history = [])).push({ at: nowStamp(), title: '계약 정보 수정', desc: '서명 전 정보 수정 · ' + HR_NAME, kind: '' });
      return true;
    },
    /* 최신 임금 계약서 (서명 이력 기준) — 급여 정보 '정산 정보'의 임금 계약 연동 기간·상태 산출용.
       임금계약서 이력 중 서명완료(active/signed/만료)를 최신순 정렬해 첫 건 반환.
       반환: { id, startDate, endDate, indefinite, code, expired } | null
         · code    : effectiveStatusCode (active/expiringSoon/expired 등)
         · expired : 오늘 기준 만료 여부 (무기계약 제외 · 종료일 도과) */
    latestWageContract(empId) {
      if (!STATE.rows || !STATE.rows.length) STATE.rows = makeMock();
      const SIGNED = ['active', 'signed', 'expired'];   // 효력 발생했던(서명완료) 임금계약만
      /* 임금 조건을 담은 계약 = 임금계약서 + (임직원 등록에서 발송한) 임금 조건 포함 근로계약서(wageIncluded).
         임직원 등록이 계약서 1부(근로계약서에 급여 조항 포함)로 발송되므로 후자도 임금 계약으로 인정한다. */
      const rows = STATE.rows
        .filter(r => r.empId === empId && (r.kind === '임금계약서' || r.wageIncluded) && SIGNED.indexOf(r.status) >= 0)
        .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || '')
                     || (b.createdAt || '').localeCompare(a.createdAt || ''));
      if (!rows.length) return null;
      const r = rows[0];
      const code = effectiveStatusCode(r);
      const today = todayStr();
      /* 무기 근로계약(정규직 전환) 이라도 임금계약 종료일(wageEndDate) 이 있으면 그것이 임금계약 기간의 끝 */
      const end = r.wageEndDate || r.endDate || '';
      const indefinite = !!r.indefinite && !r.wageEndDate;
      const expired = (code === 'expired') || (!indefinite && !!end && end < today);
      return { id: r.id, startDate: r.startDate || '', endDate: end, indefinite, code, expired };
    },
    /* 외부 화면(인사정보카드 등) 에서 서명요청 발송 시 STATE.rows 에 row 추가.
     *   spec: { emp, kind, startDate, endDate, indefinite, mode, status, salary, docTitle, wageIncluded }
     *     - emp: { id, name, dept, ... } 최소 식별자
     *     - kind: '근로계약서' | '임금계약서'  (계약 관리 목록의 계약 유형 분류)
     *     - docTitle: 문서 종류명 (예: '정규직 수습 근로계약서' / '용역 위탁 계약서').
     *                 TEMPLATES 에 동일 키가 있으면 그 서식을 우선 사용한다.
     *     - wageIncluded: 근로계약서 1부에 급여 조항까지 포함(임직원 등록 표준)
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
      /* 계약서 종류 — 미지정이면 직원 유형으로 파생 (목록·이력이 kind 로 폴백되지 않게 한다) */
      spec = Object.assign({}, spec, {
        docTitle: spec.docTitle || deriveDocTitle(e, { kind: spec.kind, probation: !!spec.probation }),
      });
      const v = contractBodyValues(spec, today);
      const body = (TEMPLATES[spec.docTitle] || TEMPLATES[spec.kind] || tplWork)(v);
      const status = spec.status || 'signing';
      const history = [{ at: stamp, title: '계약서 작성', desc: spec.source || '인사정보카드 자동 작성', kind: '' }];
      if (status === 'signing') {
        history.push({ at: stamp, title: '서명 요청 발송', desc: spec.source || '인사정보카드에서 발송', kind: '' });
      }
      const row = {
        id: makeContractId(e.id, today),
        kind: spec.kind, mode: spec.mode || 'individual',
        /* 문서 종류명 — 목록·상세의 '계약 유형' 표기에 kind 대신 우선 사용 */
        docTitle: spec.docTitle || '',
        wageIncluded: !!spec.wageIncluded,
        empId: e.id, empName, empDept: e.dept || '',
        startDate: spec.startDate || '', endDate: indefinite ? '' : (spec.endDate || ''),
        indefinite,
        /* 임금계약 종료일 — 무기 근로계약(정규직 전환)의 임금계약기간 종료일 */
        wageEndDate: spec.wageEndDate || '',
        status, body, history,
        createdAt: today,
        registeredBy: spec.registeredBy || HR_NAME,
        sentBy: status === 'signing' ? (spec.sentBy || HR_NAME) : '',
        sentAt: status === 'signing' ? stamp : '',
        gapSignedAt: status === 'signing' ? stamp : '',
        salary: spec.salary || { base: '', allowance: '', meal: '', payday: '' },
        /* 발송 출처 — '임직원 등록 발송' 은 근로+임금 한 세트로 발송되므로 개별 취소 불가(취소 버튼 숨김). */
        source: spec.source || '',
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
