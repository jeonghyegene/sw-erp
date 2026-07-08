/* =========================================================
 * HR 직원 마스터 데이터 모듈 (공용 데이터 계층)
 *   · 구 page-hr-newcomer-3.js(입사자 관리 2) 의 화면은 제거되었고,
 *     해당 화면이 보유하던 공유 직원 마스터 데이터(App.HRMembers)만 본 모듈로 분리·보존.
 *   · 계약/발령/인사/조직/퇴사/평가/급여/연금/경조사 등 16개 화면이
 *     IIFE 로드 시점 또는 init 시점에 App.HRMembers.list() 로 동일 배열을 공유한다.
 *
 *  공식 API:
 *   · App.HRMembers.list()              — 공유 직원 데이터(같은 배열 인스턴스)
 *   · App.HRMembers.isComplete(emp)     — 「완료」 판정 정책 (입사자/인사 관리 공용)
 *   · App.HRMembers.wageContractStatus(emp) — 임금계약 만료 신호
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  /* ============ 마스터 ============ */
  const MASTER = {
    depts:     ['', '경영지원본부', '생산본부', '개발팀', '홍보팀', '인사팀', '재무팀'],
    jobs:      ['', '인사', '재무', '총무', '생산관리', '품질관리', '개발', '디자인'],
    /* 직위 — 상위직급부터: 이사급 → 부장 → 사원 */
    ranks:     ['', '대표이사', '부대표이사', '전무이사', '상무이사', '부장', '차장', '과장', '대리', '주임', '사원'],
    /* 직책 — 임원·본부장·소장·팀장·파트장·팀원·파트원 */
    positions: ['', '임원', '본부장', '소장', '팀장', '파트장', '팀원', '파트원'],
    sites:     ['', '본사', '안성공장', '음성공장', '평택지점'],
    /* 도급 소속회사 — 실제는 거래처 마스터(자산·업체)에서 가져와야 함. 데모용 하드코딩. */
    contractCompanies: ['(주)성원파트너스', '(주)성원로지스', '(주)성원테크', '(주)성원에듀', 'HR솔루션㈜', '바른인력㈜'],
  };

  /* 진행 마일스톤 — 메인 status(inProgress/completed/...) 정규화 판정에 사용. */
  const MILESTONES = {
    mailSent:       (r) => !!r.emailSentDate,
    idDone:         (r) => !!r.userId,
    infoDone:       (r) => r.infoStatus === 'done',
    contractSent:   (r) => !!r.contractSentDate,
    contractSigned: (r) => !!r.contractLabor,
    docsSent:       (r) => !!r.docsSentDate,
    docsSubmitted:  (r) => (r.docsSent || 0) > 0 && (r.docSigned || 0) >= (r.docsSent || 0),
  };

  /* ============ 「완료」 판정 정책 — 입사자 관리 / 인사 관리 공용 ============
   *   정책:
   *     · 도급직: 계정등록(userId) + 정보등록(infoStatus='done')
   *     · 정규직: 위 + 근로계약 서명(contractLabor=true). 무기 계약이므로 기간 체크 없음
   *     · 계약직: 위 + 근로계약 기간 유효 (contractEndDate >= today)
   *     · 일용직: 위 + 근로계약 기간 유효 (contractEndDate >= today)
   *
   *   임금계약(contractWage) 은 「완료」 판정에 영향을 주지 않는다. */
  function isComplete(emp) {
    if (!emp) return false;
    if (emp.active === false) return false;
    /* 1) 정보등록 완료 필수 (모든 유형 공통) */
    if (emp.infoStatus !== 'done') return false;
    /* 2) 계정등록 완료 — userId 가 있어야 함 (모든 유형 공통) */
    if (!emp.userId) return false;
    /* 3) 도급직: 계약 자체가 없음 → 여기까지 통과하면 「완료」 */
    if (emp.contractOut) return true;
    /* 4) 일반직: 근로계약 서명 완료 필수 */
    if (!emp.contractLabor) return false;
    /* 5) 계약직·일용직: 근로계약 기간 유효 (정규직은 무기계약이라 종료일 없음) */
    if (emp.empType === 'contract' || emp.empType === 'daily') {
      if (!emp.contractEndDate) return false;
      const today = (window.App && App.HRContract && App.HRContract.todayStr)
        ? App.HRContract.todayStr() : new Date().toISOString().slice(0, 10);
      if (emp.contractEndDate < today) return false;
    }
    return true;
  }

  /* status 정규화 — 마일스톤·정책에 따라 메인 status 를 일관되게 재계산.
   *  종착 상태(retired) 는 유지. 그 외는 다음 우선순위로 갱신:
   *   1) 계약직·일용직이 종료일 지남 → contractExpired (자동 전이)
   *   2) isComplete() 통과            → completed
   *   3) 마일스톤이 하나라도 도달      → inProgress
   *   4) 아무것도 없음               → registered */
  function normalizeStatus(emp) {
    if (!emp) return;
    if (emp.status === 'retired') return;
    /* 1) 만료 자동 전이 — 정규직(무기계약)·도급(계약 없음) 제외 */
    if (emp.empType === 'contract' || emp.empType === 'daily') {
      if (emp.contractEndDate) {
        const today = (window.App && App.HRContract && App.HRContract.todayStr)
          ? App.HRContract.todayStr() : new Date().toISOString().slice(0, 10);
        if (emp.contractEndDate < today) { emp.status = 'contractExpired'; return; }
      }
    }
    if (isComplete(emp)) { emp.status = 'completed'; return; }
    const hasAny = Object.keys(MILESTONES).some(k => MILESTONES[k](emp));
    emp.status = hasAny ? 'inProgress' : 'registered';
  }

  /* 임금계약 만료 신호용 — 정규직/계약직/일용직 대상. 일용직은 시급제 임금계약. 도급직은 계약 N/A.
   *   data.contractWageEndDate 가 있으면 그 기준, 없으면 contractEndDate 와 동일 기간으로 가정. */
  function wageContractStatus(emp) {
    if (!emp || emp.contractOut) return null;
    if (!emp.contractWage) return { kind: 'unsigned' };   // 임금계약 미서명
    const end = emp.contractWageEndDate || emp.contractEndDate || '';
    if (!end) return { kind: 'valid', end: '' };          // 무기/만료일 미상 → 정상
    const today = (window.App && App.HRContract && App.HRContract.todayStr)
      ? App.HRContract.todayStr() : new Date().toISOString().slice(0, 10);
    if (end < today) return { kind: 'expired', end };
    const days = Math.round((new Date(end) - new Date(today)) / 86400000);
    if (days <= 30) return { kind: 'soon', end, days };
    return { kind: 'valid', end };
  }

  /* ymd 문자열에 개월 수 가산 — makeMock 의 수습 종료일 계산용 */
  function addMonths(ymdStr, months) {
    if (!ymdStr) return '';
    const d = new Date(ymdStr);
    if (isNaN(d.getTime())) return '';
    const day = d.getDate();
    d.setMonth(d.getMonth() + months);
    if (d.getDate() < day) d.setDate(0);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${dd}`;
  }

  /* ============ Mock ============ */
  /* 데모 직원 30명 프로필 사진 — assets/img/employees/{m01~m10,f01~f10}.png 로컬 한국인 증명사진 풀(20장).
     · 약 13%(4명: idx 4·13·20·27) 는 빈 값 → 성 이니셜 + 색상 placeholder 렌더
     · 나머지 26명 은 성별별로 10장씩 우선 1회 소진 후 나머지 3명씩만 재사용 (각 얼굴 최대 2회). */
  const MOCK_PHOTO_URL = [
    'assets/img/employees/m01.png', // 0  김지훈
    'assets/img/employees/f01.png', // 1  이서연
    'assets/img/employees/m02.png', // 2  박민준
    'assets/img/employees/f02.png', // 3  최예린
    '',                              // 4  정현우 (no photo)
    'assets/img/employees/f03.png', // 5  한지수
    'assets/img/employees/m03.png', // 6  오민서
    'assets/img/employees/f04.png', // 7  윤도현
    'assets/img/employees/m04.png', // 8  강나래
    'assets/img/employees/f05.png', // 9  조하늘
    'assets/img/employees/m05.png', // 10 서지원
    'assets/img/employees/f06.png', // 11 문성호
    'assets/img/employees/m06.png', // 12 임유나
    '',                              // 13 신예원 (no photo)
    'assets/img/employees/m07.png', // 14 권상우
    'assets/img/employees/f07.png', // 15 류재훈
    'assets/img/employees/m08.png', // 16 홍수아
    'assets/img/employees/f08.png', // 17 배준석
    'assets/img/employees/m09.png', // 18 노은서
    'assets/img/employees/f09.png', // 19 전민재
    '',                              // 20 백지윤 (no photo)
    'assets/img/employees/f10.png', // 21 구도윤
    'assets/img/employees/m10.png', // 22 남윤서
    'assets/img/employees/f01.png', // 23 심하준 (재사용)
    'assets/img/employees/m01.png', // 24 진보영 (재사용)
    'assets/img/employees/f02.png', // 25 피현재 (재사용)
    'assets/img/employees/m02.png', // 26 왕서준 (재사용)
    '',                              // 27 반지호 (no photo)
    'assets/img/employees/m03.png', // 28 채영호 (재사용)
    'assets/img/employees/f03.png', // 29 목은비 (재사용)
  ];

  function makeMock() {
    const names = ['김지훈','이서연','박민준','최예린','정현우','한지수','오민서','윤도현','강나래','조하늘',
                   '서지원','문성호','임유나','신예원','권상우','류재훈','홍수아','배준석','노은서','전민재',
                   '백지윤','구도윤','남윤서','심하준','진보영','피현재','왕서준','반지호','채영호','목은비'];
    /* 시드 분포 — progress 정수로 어느 마일스톤까지 도달했는지 표현.
     *   0=registered, 1=mailSent, 2=idDone, 3=infoDone, 4=contractSent, 5=contractSigned, 6=docsSent, 7=docsSubmitted
     *   normalizeStatus 가 마지막에 isComplete()/마일스톤 기반으로 메인 status 를 보정. */
    const fails = ['', '', '', '', 'badEmail', 'rejected', 'systemError'];
    const today = new Date();
    const empTypes = ['regular','regular','regular','contract','contract','daily'];
    const jobCats  = ['office','office','production','production','research'];
    const hrUsers  = ['정혜진','윤민지','정혜진','정혜진','윤민지'];
    /* 데모용 부서 배정 — 개발팀 10명(임직원 현황 카드 자동 맞춤: 한 열 6명+ 검증용),
       나머지 20명은 개발팀 제외 부서에 균등 배분. */
    const otherDepts = MASTER.depts.filter(d => d && d !== '개발팀');
    return names.map((nm, i) => {
      const progress = i % 8;  // 0~7 — 마일스톤 진행도
      /* 도급직 분포 — 약 1/4 비율 */
      const isOut = (i % 4 === 0);
      /* 마일스톤 도달 여부 */
      const reached_mailSent       = progress >= 1;
      const reached_idDone         = progress >= 2;
      const reached_infoDone       = progress >= 3;
      const reached_contractSent   = progress >= 4 && !isOut;   // 도급은 계약 단계 스킵
      const reached_contractSigned = progress >= 5 && !isOut;
      const reached_docsSent       = progress >= 6;
      const reached_docsSubmitted  = progress >= 7;
      /* 이메일 발송 실패 — mailSent 단계에 머무는 행만 (idDone 이상은 정상 전이) */
      const failCode = (progress === 1) ? fails[i % fails.length] : '';
      const back = (i * 3) % 90;
      const join = new Date(today.getTime() - back * 86400000);
      const regBack = back + (i % 4) + 1;
      const reg  = new Date(today.getTime() - regBack * 86400000);
      const ymd = (d) => d.toISOString().slice(0, 10);
      const emailSentDate = reached_mailSent ? ymd(new Date(join.getTime() - 86400000 * 7)) : '';
      const contractSentDate = reached_contractSent ? ymd(new Date(join.getTime() - 86400000 * 3)) : '';
      const docsSentDate = reached_docsSent ? ymd(new Date(join.getTime() - 86400000 * 1)) : '';
      const sender = hrUsers[i % hrUsers.length];
      /* 아이디설정완료 이상이면 본인이 설정한 로그인 아이디 보유 */
      const userId = reached_idDone ? `${nm.replace(/[가-힣]/g,'u')}${i}` : '';
      /* 프로필 사진 — MOCK_PHOTO_URL[i] 매핑.
         빈 문자열이면 자동으로 성(姓) 이니셜 + 색상 placeholder 렌더.
         실 서비스에서는 회사 사진 마스터(인사정보 입력 단계의 사진 업로드) 로 교체. */
      const gender = i % 2 === 0 ? 'M' : 'F';
      const photoUrl = MOCK_PHOTO_URL[i] || '';
      const yy = String(join.getFullYear()).slice(-2);
      const mm = String(join.getMonth() + 1).padStart(2,'0');
      const dd = String(join.getDate()).padStart(2,'0');
      const empType = empTypes[i % empTypes.length];
      /* 인사정보 등록 상태: infoDone 이상 = done, idDone = progress, 그 이전 = none */
      let infoStatus = 'none';
      if (reached_infoDone) infoStatus = 'done';
      else if (reached_idDone) infoStatus = 'progress';
      /* 계약 서명 — 도급직은 계약 없음 (둘 다 false 유지) */
      let contractLabor = false, contractWage = false;
      if (reached_contractSigned) {
        contractLabor = true;
        /* 임금계약 — 일용직(시급제) 포함 전 사원 대상. 도급직만 위에서 제외. 약 2/3 비율로 서명완료 (다양성) */
        contractWage = (i % 3 !== 2);
      }
      /* 서류 발송 건수 — docsSent 도달 시 1~5건, docsSubmitted 도달 시 5건 전부 */
      const docsSent = reached_docsSubmitted ? 5
                     : reached_docsSent ? ((i % 5) + 1)
                     : 0;
      const docSigned = reached_docsSubmitted ? docsSent
                      : reached_docsSent ? Math.max(0, docsSent - ((i % 3)))
                      : 0;

      return {
        id: `SW${yy}${mm}${dd}${String(1 + (i % 30)).padStart(2,'0')}`,
        fname: nm.charAt(0),
        gname: nm.slice(1),
        name:  nm,
        nameFlip: false,
        cname: '',
        ename: '',
        dept:     (i < 10) ? '개발팀' : otherDepts[i % otherDepts.length],
        job:      MASTER.jobs [1 + (i % (MASTER.jobs.length  - 1))],
        rank:     MASTER.ranks[1 + (i % (MASTER.ranks.length - 1))],
        position: MASTER.positions[1 + (i % (MASTER.positions.length - 1))],
        joinDate: ymd(join),
        registeredAt: ymd(reg),
        registeredBy: hrUsers[i % hrUsers.length],
        phone:    `010-${String(1000 + (i*37 % 8999)).padStart(4,'0')}-${String(1000 + (i*53 % 8999)).padStart(4,'0')}`,
        email:    `${nm.replace(/[가-힣]/g,'u')}${i}@company.co.kr`,
        innerTel: '',
        birth: '1990-' + String((i % 12) + 1).padStart(2,'0') + '-' + String((i % 27) + 1).padStart(2,'0'),
        gender,
        photoUrl,
        status:   'registered',   // 임시값 — makeMock 후 normalizeStatus 가 마일스톤 기반으로 보정
        sentDate: emailSentDate,  // 이메일 발송일 (기존 호환)
        emailSentDate, emailSentBy: emailSentDate ? sender : '',
        contractSentDate, contractSentBy: contractSentDate ? sender : '',
        docsSentDate,     docsSentBy:     docsSentDate     ? sender : '',
        mailFailCode: failCode,
        empType,
        /* 계약직만 세부유형 보유 — 분포: 일반 5/7, 촉탁 1/7, 인턴 1/7 */
        contractSubType: empType === 'contract'
          ? (i % 7 === 0 ? 'chotak' : (i % 7 === 1 ? 'intern' : ''))
          : '',
        contractOut: isOut,
        jobCat: jobCats[i % jobCats.length],
        site: MASTER.sites[1 + (i % (MASTER.sites.length - 1))],
        userId,             // 본인 설정 로그인 아이디 (아이디설정완료 이상)
        infoStatus,         // 'none' | 'progress' | 'done'
        contractLabor,      // 근로계약서 서명완료 여부
        contractWage,       // 임금계약서 서명완료 여부
        docsSent,           // 입사서류 5종 중 발송된 건수 (0~5)
        docSigned,          // 발송된 것 중 서명완료 건수
        contractEndDate: '',      // 계약직 종료일 — 아래 2차 패스에서 채움
        // 본인 제출 정보 (Drawer 작성 섹션) — 데모용 비어있음
        ssn: reached_infoDone ? '900101-1******' : '',
        /* 수습 — 직접 고용 + 정규직 한정. 도급직(isOut)은 수습 개념 자체 없음.
         *   데모: 직접 고용 정규직 중 약 1/3 이 수습 적용 */
        probation: empType === 'regular' && !isOut && (i % 3 === 0),
        probationStart: empType === 'regular' && !isOut && (i % 3 === 0) ? ymd(join) : '',
        probationEnd:   empType === 'regular' && !isOut && (i % 3 === 0) ? addMonths(ymd(join), 3) : '',
      };
    });
  }

  /* 계약만료 데모 보정 — 계약직 3건을 만료 상태로, 일반/촉탁/인턴 각 1건씩 노출. */
  function applyContractExpiredDemo(rows) {
    const today = new Date();
    /* 도급(contractOut) 계약직은 정규직 전환 대상이 아니므로 만료 데모에서도 제외 */
    const contractRows = rows.filter(r => r.empType === 'contract' && !r.contractOut);
    const targets = contractRows.slice(0, 3);
    const subVariants = ['', 'chotak', 'intern'];
    targets.forEach((r, idx) => {
      r.status = 'contractExpired';
      r.contractSubType = subVariants[idx];
      r.contractLabor = true;
      r.contractWage = true;
      r.docsSent = 5;
      r.docSigned = 5;
      r.infoStatus = 'done';
      r.userId = r.userId || `${r.name.replace(/[가-힣]/g,'u')}u`;
      r.ssn = '900101-1******';
      const expDate = new Date(today.getTime() - 86400000 * (30 + idx * 30));
      r.contractEndDate = expDate.toISOString().slice(0, 10);
    });
    /* 나머지 계약직·일용직 행: 미래 종료일 부여 (isComplete 기간 유효 통과용). */
    rows.forEach(r => {
      if ((r.empType === 'contract' || r.empType === 'daily') && !r.contractEndDate) {
        const join = new Date(r.joinDate);
        const addDays = r.empType === 'daily' ? 120 : 365;
        const expDate = new Date(join.getTime() + 86400000 * addDays);
        r.contractEndDate = expDate.toISOString().slice(0, 10);
      }
    });
    return rows;
  }

  /* ============ 공유 mock 데이터 — script load 시점에 즉시 생성 ============
   *   다른 페이지(계약/발령/인사/조직)가 IIFE 단계에서 App.HRMembers.list() 를 호출하므로
   *   모듈 로드 시점에 한 번만 rows 를 채워둔다. */
  const rows = applyContractExpiredDemo(makeMock());
  /* 일용직 시급제 임금계약 시드 — 임금유형 hourly + 시급(contractAmount, 11,000~14,000 결정적) 부여.
   *   급여 정산 등에서 임금계약 시급을 조인해 사용할 수 있도록 한다 (시급제는 종료일 없이 무기한). */
  rows.forEach((r, i) => {
    if (r.empType !== 'daily') return;
    r.wageType = 'hourly';
    r.contractAmount = 11000 + (i % 7) * 500;          // 11,000 ~ 14,000
    r.wageContractStartDate = r.wageContractStartDate || r.joinDate || '';
    r.wageContractEndDate = '';
    r.wageIndefinite = true;
  });
  /* 시드 로드 후 status 정규화 — 마일스톤·isComplete 기반으로 메인 status 보정 */
  rows.forEach(normalizeStatus);

  /* ============ 외부 페이지에서 호출하는 공식 API ============ */
  App.HRMembers = {
    list: () => rows,
    /* 정책 기준 「완료」 판정 — 입사자 관리 / 인사 관리 공용 */
    isComplete,
    /* 임금계약 만료 신호 — 「완료」 판정과는 분리. detail / 인사카드에서 별도 표시용 */
    wageContractStatus,
  };
})();
