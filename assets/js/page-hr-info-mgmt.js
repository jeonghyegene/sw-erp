/* =========================================================
 * Page: HR > 인사 관리 > 인사정보 관리
 *   ※ 「임직원 현황」 화면을 기반으로 분기한 신규 디벨롭용 페이지.
 *     데이터·exports 는 모두 독립 네임스페이스(App.HRInfoMgmt / App.HRInfoMgmtCard)로 분리되어
 *     기존 임직원 현황 페이지에 영향을 주지 않는다.
 *   SCR-EMP-01 입사자 현황 (메인)
 *   SCR-EMP-02 개별 등록 (모달)
 *   SCR-EMP-03 일괄 등록 (모달)
 *   SCR-EMP-04 인사정보카드 Drawer (3탭)
 *
 *  UI Kit 컴포넌트 재사용:
 *   .search / .field / .input / .select       (App.Search + Components.searchPanel)
 *   .toolbar / .btn / .btn--primary / --danger / --xs  (액션 버튼)
 *   .tbl / .tbl--hover / --striped / --compact / --bordered  (테이블)
 *   .pill (--info / --warning / --mint / --purple / --success / --danger / --dark)
 *   .pagination / .pagination__size / __list   (페이지네이션)
 *   .modal / .modal--lg / .modal__footer       (모달)
 *   .offcanvas / .offcanvas--lg                (인사정보카드 Drawer)
 *   .tabs / .tabs--underline / .tabs__nav / .tabs__tab / .tabs__panel  (Drawer 탭)
 *   .form-field / .form-label / .input--full   (Base Input)
 *   .dz / .dz__icon                            (Dropzone — 일괄 등록)
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
    sites:     ['', '성수동', '하남', '인현동', '충무로'],
    /* 도급 소속회사 — 실제는 거래처 마스터(자산·업체)에서 가져와야 함. 데모용 하드코딩. */
    contractCompanies: ['(주)성원파트너스', '(주)성원로지스', '(주)성원테크', '(주)성원에듀', 'HR솔루션㈜', '바른인력㈜'],
  };

  /* ============ 상태값 (입사자 관리 — v3 정책) ============
   *  메인 status 5코드 (단순):
   *   registered      → 등록 (이메일 미발송)
   *   inProgress      → 진행중 (이메일~서류 제출완료, 세부 단계는 마일스톤 필드로 추적)
   *   completed       → 완료 (isComplete 정책 충족 = 인사카드 생성)
   *   contractExpired → 계약만료 (근로/임금/수습 어느 것이든 만료 — 통합 라벨)
   *   retired         → 퇴사 (본 화면 리스트에서 자동 숨김)
   *
   *  진행중의 세부 7단계는 별도 필드로 판정 (MILESTONES) — 검색 필터 세부 체크박스용. */
  const STATUS = {
    registered:      { label: '등록',     pill: ''        },
    inProgress:      { label: '진행중',   pill: 'info'    },
    completed:       { label: '완료',     pill: 'success' },
    contractExpired: { label: '계약만료', pill: 'warning' },
    retired:         { label: '퇴사',     pill: ''        },
  };

  /* 진행 마일스톤 — 검색 필터 「진행중 세부」 체크박스용.
   *  각 단계 도달 여부는 별도 필드(timestamp/boolean)로 판정.
   *  현재 메인 status 가 inProgress 일 때만 의미가 있다 (등록/완료/만료 행은 미적용). */
  const MILESTONES = {
    mailSent:       (r) => !!r.emailSentDate,
    idDone:         (r) => !!r.userId,
    infoDone:       (r) => r.infoStatus === 'done',
    contractSent:   (r) => !!r.contractSentDate,
    contractSigned: (r) => !!r.contractLabor,
    docsSent:       (r) => !!r.docsSentDate,
    docsSubmitted:  (r) => (r.docsSent || 0) > 0 && (r.docSigned || 0) >= (r.docsSent || 0),
  };
  /* 진행 마일스톤 라벨 — 검색 필터 / 표시용 */
  const MILESTONE_LABEL = {
    mailSent:       '이메일 발송완료',
    idDone:         '계정등록 완료',
    infoDone:       '정보등록 완료',
    contractSent:   '계약 발송',
    contractSigned: '계약 서명완료',
    docsSent:       '서류 발송',
    docsSubmitted:  '서류 제출완료',
  };
  /* 가장 최근 도달한 마일스톤 키 반환 (없으면 null) — detail / 툴팁용 */
  function latestMilestone(r) {
    const order = ['docsSubmitted','docsSent','contractSigned','contractSent','infoDone','idDone','mailSent'];
    for (const k of order) if (MILESTONES[k](r)) return k;
    return null;
  }

  const FAIL_LABEL = {
    badEmail:    '잘못된 이메일',
    rejected:    '수신 거부',
    systemError: '시스템 오류',
  };

  const EMP_TYPE_LABEL = { regular: '정규직', contract: '계약직', daily: '일용직', outsourced: '도급직' };
  const JOB_CAT_LABEL  = { office:  '사무직', production: '생산직', research: '연구직' };
  /* 외부 인력 — 도급은 직접 고용이 아니라 계약 N/A 처리 */
  const EXTERNAL_EMP_TYPES = ['outsourced'];
  /* 계정 등록 안내 재발송 정책 — 하루 2회 + 재발송 간 5분 쿨다운.
   *   (OTP 가 아니라 온보딩 안내 문자라 짧은 쿨다운. 번호 수정 후 재발송 케이스를 막지 않도록 시간 단위 X) */
  const RESEND_DAILY_MAX  = 2;
  const RESEND_COOLDOWN_MS = 5 * 60 * 1000;
  /* 계약직 세부유형 — 빈 문자열('') = 일반 계약직 / chotak = 촉탁 / intern = 인턴 */
  const CONTRACT_SUB_LABEL = { chotak: '촉탁', intern: '인턴' };

  /* ============ 「완료」 판정 정책 — 입사자 관리 / 인사 관리 공용 ============
   *   정책:
   *     · 도급직: 계정등록(userId) + 정보등록(infoStatus='done')
   *     · 정규직: 위 + 근로계약 서명(contractLabor=true). 무기 계약이므로 기간 체크 없음
   *     · 계약직: 위 + 근로계약 기간 유효 (contractEndDate >= today)
   *     · 일용직: 위 + 근로계약 기간 유효 (contractEndDate >= today)
   *
   *   임금계약(contractWage) 은 「완료」 판정에 영향을 주지 않는다.
   *   임금은 보상 조건이라 갱신은 별도 흐름이며, 만료 시에도 재직 자체는 유지된다.
   *   임금계약 만료 임박/도과 신호는 detail / 인사카드에서 별도 표시. */
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
   *  데이터 로드/액션 후 호출.
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
    /* 이미 contractExpired 인 상태에서 종료일이 미래로 갱신된 케이스는 아래 흐름에서 재평가됨 */
    if (emp.status === 'contractExpired') {
      /* 만료 상태였는데 위 1번 분기를 통과 = 종료일이 다시 미래거나 비어있음.
       *   isComplete/마일스톤 기준으로 재정규화하도록 fall-through */
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

  /* ============ Mock ============ */
  /* 데모 직원 30명 프로필 사진 — assets/img/employees/{m01~m10,f01~f10}.png 로컬 한국인 증명사진 풀(20장).
     · 약 13%(4명: idx 4·13·20·27) 는 빈 값 → 성 이니셜 + 색상 placeholder 렌더
     · 나머지 26명 은 성별별로 10장씩 우선 1회 소진 후 나머지 3명씩만 재사용 (각 얼굴 최대 2회). */
  const MOCK_PHOTO_URL = [
    'assets/img/employees/m01.png', // 0  서준호
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
    /* ============ 데모 시드 — 임직원 현황 직원 DB (고용형태 대표 5명) ============
     *   기존 30명 시드를 제거하고, 고용형태별 대표 5명만 시드한다.
     *   전원 계정 등록완료 + 근로/임금 계약 서명완료 상태 (도급직은 계약 해당없음).
     *     · 정규직 — 정규직        (개발팀 · 과장)
     *     · 정수습 — 정규직(수습)   (홍보팀 · 사원)
     *     · 정일용 — 일용직        (생산본부 · 시급제)
     *     · 김도급 — 도급직        (외부 인력 → 근로/임금 계약 해당없음)
     *     · 하계약 — 계약직        (재무팀 · 대리 · 기간제)
     *   부서·직위·직책·직무는 마스터에서 임의 배정.
     *   status='registered' 는 임시값 — 하단 normalizeStatus 가 isComplete() 통과로 'completed' 보정.
     *   임금 금액(연봉/기본급 등)은 하단 seedWageContract() 가 직위 기준으로 자동 채움. */
    const HR = '정혜진';
    /* 공통 완료 필드 — 근로계약(발송·서명) / 임금계약(서명) / 입사서류(5종 제출) 완료 상태 기본값 */
    function base(o) {
      return Object.assign({
        nameFlip: false, cname: '', ename: '', innerTel: '',
        registeredBy: HR,
        infoStatus: 'done',
        contractSentBy: HR,
        docsSent: 5, docSigned: 5, docsSentBy: HR,
        emailSentBy: HR,
        mailFailCode: '',
        contractSubType: '',
        contractOut: false, contractCompany: '',
        probation: false, probationStart: '', probationEnd: '',
        ssn: '900101-1******',
        onLeave: false,
        contractLabor: true, contractWage: true,
        /* 계정 등록 / 승인 워크플로 (임직원 관리 그리드 컬럼)
         *   acctReg  : 'waiting'(대기중) | 'done'(등록완료)
         *   approval : 'none'(-) | 'pending'(승인 대기 → 승인/반려) | 'approved'(승인완료) | 'rejected'(반려)
         *   resendHistory : [{ at, reason, by }] — 계정 등록 안내 재발송 이력 */
        acctReg: 'done', approval: 'approved', resendHistory: [],
        /* 근무 상세 — isContractInfoComplete 통과용 (통상근무 09~18 / 휴게 12~13) */
        workSchedule: 'fixed',
        workTimeStart: '09:00', workTimeEnd: '18:00',
        breakStart: '12:00', breakEnd: '13:00',
        hoursPerDay: 8, hoursPerWeek: 40, hoursPerMonth: 209,
        status: 'registered',
      }, o);
    }
    /* 재발송 이력 레코드 — 표시용 at(YY/MM/DD   HH:MM) + 정렬/한도 계산용 ts(epoch) 동시 생성 */
    function rh(iso, reason, by) {
      const d = new Date(iso);
      const p = (n) => String(n).padStart(2, '0');
      const at = `${String(d.getFullYear()).slice(-2)}/${p(d.getMonth() + 1)}/${p(d.getDate())}   ${p(d.getHours())}:${p(d.getMinutes())}`;
      return { at, ts: d.getTime(), reason, by };
    }
    const rows = [
      base({
        id: 'SW23030201', name: '정규직', fname: '정', gname: '규직', gender: 'M',
        dept: '개발팀', job: '개발', rank: '과장', position: '팀원', jobCat: 'research', site: '성수동',
        empType: 'regular',
        joinDate: '2023-03-02', registeredAt: '2023-02-25',
        phone: '010-2431-8842', email: 'jung.jg@company.co.kr', birth: '1988-04-12',
        photoUrl: 'assets/img/employees/m01.png', userId: 'jung.jg',
        emailSentDate: '2023-02-20',
        contractStartDate: '2023-03-02', contractEndDate: '',   // 정규직 무기계약
        contractSentDate: '2023-02-27', docsSentDate: '2023-03-01',
      }),
      base({
        id: 'SW26050401', name: '정수습', fname: '정', gname: '수습', gender: 'F',
        dept: '홍보팀', job: '디자인', rank: '사원', position: '파트원', jobCat: 'office', site: '성수동',
        empType: 'regular',
        joinDate: '2026-05-04', registeredAt: '2026-04-28',
        phone: '010-5567-1290', email: 'jung.ss@company.co.kr', birth: '1998-09-23',
        photoUrl: 'assets/img/employees/f01.png', userId: 'jung.ss',
        ssn: '980923-2******',
        emailSentDate: '2026-04-24',
        contractStartDate: '2026-05-04', contractEndDate: '',   // 정규직(수습) 무기계약
        contractSentDate: '2026-04-30', docsSentDate: '2026-05-03',
        probation: true, probationStart: '2026-05-04', probationEnd: '2026-08-04',
      }),
      base({
        id: 'SW26060101', name: '정일용', fname: '정', gname: '일용', gender: 'M',
        dept: '생산본부', job: '생산관리', rank: '사원', position: '팀원', jobCat: 'production', site: '하남',
        empType: 'daily',
        joinDate: '2026-06-01', registeredAt: '2026-05-28',
        phone: '010-3382-7741', email: 'jung.iy@company.co.kr', birth: '1995-02-08',
        photoUrl: 'assets/img/employees/m02.png', userId: 'jung.iy',
        emailSentDate: '2026-05-24',
        contractStartDate: '2026-06-01', contractEndDate: '2026-12-31',   // 일용직 기간제
        contractSentDate: '2026-05-29', docsSentDate: '2026-05-31',
      }),
      base({
        id: 'SW26041501', name: '김도급', fname: '김', gname: '도급', gender: 'M',
        dept: '생산본부', job: '품질관리', rank: '주임', position: '파트원', jobCat: 'production', site: '인현동',
        empType: 'outsourced',
        joinDate: '2026-04-15', registeredAt: '2026-04-10',
        phone: '010-9921-4408', email: 'kim.dg@company.co.kr', birth: '1992-11-30',
        photoUrl: 'assets/img/employees/m03.png', userId: 'kim.dg',
        emailSentDate: '2026-04-06',
        /* 도급직 — 외부 인력. 근로/임금 계약 해당없음. 계정등록 + 정보등록으로 「완료」 */
        contractLabor: false, contractWage: false,
        contractOut: true, contractCompany: '(주)성원파트너스',
        contractStartDate: '2026-04-15', contractEndDate: '2027-04-14',
        contractSentDate: '', docsSentDate: '2026-04-14',
      }),
      base({
        id: 'SW25010601', name: '하계약', fname: '하', gname: '계약', gender: 'F',
        dept: '재무팀', job: '재무', rank: '대리', position: '팀원', jobCat: 'office', site: '성수동',
        empType: 'contract',
        joinDate: '2025-01-06', registeredAt: '2024-12-30',
        phone: '010-7714-3025', email: 'ha.ga@company.co.kr', birth: '1991-07-17',
        photoUrl: 'assets/img/employees/f02.png', userId: 'ha.ga',
        ssn: '910717-2******',
        emailSentDate: '2024-12-26',
        contractStartDate: '2025-01-06', contractEndDate: '2027-01-05',   // 계약직 기간제
        contractSentDate: '2025-01-02', docsSentDate: '2025-01-05',
      }),
      /* ============ 온보딩 진행 6명 — 계정 등록 → 승인 워크플로 데모 ============
       *   계정 미등록/등록완료 · 승인 대기/완료/반려 상태를 그리드에서 확인하기 위한 시드.
       *   근로/임금 계약 이전 단계라 계약 필드는 비우고 docs 도 미발송(0). */
      base({
        id: 'SW26071401', name: '김규직', fname: '김', gname: '규직', gender: 'M',
        dept: '개발팀', job: '개발', rank: '사원', position: '팀원', jobCat: 'research', site: '성수동',
        empType: 'regular',
        joinDate: '2026-07-20', registeredAt: '2026-07-14',
        phone: '010-4402-1187', email: 'kim.gj@company.co.kr', birth: '1996-03-14',
        photoUrl: '', userId: '', infoStatus: 'progress',
        emailSentDate: '2026-07-14',
        contractLabor: false, contractWage: false, docsSent: 0, docSigned: 0,
        contractStartDate: '', contractEndDate: '', contractSentDate: '',
        acctReg: 'waiting', approval: 'none',
        resendHistory: [
          rh('2026-07-14T09:12:00', '입력하신 이메일 주소 오류로 미수신 — 휴대폰으로 재안내', '정혜진'),
        ],
      }),
      base({
        id: 'SW26071301', name: '김수습', fname: '김', gname: '수습', gender: 'F',
        dept: '홍보팀', job: '디자인', rank: '사원', position: '파트원', jobCat: 'office', site: '성수동',
        empType: 'regular',
        joinDate: '2026-07-21', registeredAt: '2026-07-13',
        phone: '010-5518-9930', email: 'kim.ss@company.co.kr', birth: '1999-11-02', ssn: '991102-2******',
        photoUrl: '', userId: '', infoStatus: 'progress',
        emailSentDate: '2026-07-13',
        contractLabor: false, contractWage: false, docsSent: 0, docSigned: 0,
        contractStartDate: '', contractEndDate: '', contractSentDate: '',
        probation: true,
        acctReg: 'waiting', approval: 'none',
        resendHistory: [
          rh('2026-07-14T10:05:00', '가입 기한 임박 재안내', '정혜진'),
          rh('2026-07-13T14:30:00', '안내 메일 미확인 상태 — 재발송', '윤민지'),
        ],
      }),
      base({
        id: 'SW26071204', name: '송계약', fname: '송', gname: '계약', gender: 'M',
        dept: '재무팀', job: '재무', rank: '대리', position: '팀원', jobCat: 'office', site: '성수동',
        empType: 'contract',
        joinDate: '2026-07-15', registeredAt: '2026-07-12',
        phone: '010-6621-4471', email: 'song.gy@company.co.kr', birth: '1993-05-28',
        photoUrl: '', userId: 'song.gy', infoStatus: 'done',
        emailSentDate: '2026-07-12',
        contractLabor: false, contractWage: false, docsSent: 0, docSigned: 0,
        contractStartDate: '', contractEndDate: '', contractSentDate: '',
        acctReg: 'done', approval: 'pending',
      }),
      base({
        id: 'SW26071203', name: '하도급1', fname: '하', gname: '도급1', gender: 'M',
        dept: '생산본부', job: '품질관리', rank: '주임', position: '파트원', jobCat: 'production', site: '하남',
        empType: 'outsourced',
        joinDate: '2026-07-15', registeredAt: '2026-07-12',
        phone: '010-7712-3320', email: 'ha.dg1@company.co.kr', birth: '1990-08-19',
        photoUrl: '', userId: 'ha.dg1', infoStatus: 'done',
        emailSentDate: '2026-07-12',
        contractOut: true, contractCompany: '(주)성원로지스',
        contractLabor: false, contractWage: false, docsSent: 0, docSigned: 0,
        contractStartDate: '', contractEndDate: '', contractSentDate: '',
        acctReg: 'done', approval: 'pending',
      }),
      base({
        id: 'SW26071202', name: '하도급2', fname: '하', gname: '도급2', gender: 'F',
        dept: '생산본부', job: '생산관리', rank: '사원', position: '파트원', jobCat: 'production', site: '인현동',
        empType: 'outsourced',
        joinDate: '2026-07-13', registeredAt: '2026-07-10',
        phone: '010-8830-5567', email: 'ha.dg2@company.co.kr', birth: '1994-01-07', ssn: '940107-2******',
        photoUrl: '', userId: 'ha.dg2', infoStatus: 'done',
        emailSentDate: '2026-07-10',
        contractOut: true, contractCompany: '(주)성원테크',
        contractLabor: false, contractWage: false, docsSent: 0, docSigned: 0,
        contractStartDate: '', contractEndDate: '', contractSentDate: '',
        acctReg: 'done', approval: 'approved',
      }),
      base({
        id: 'SW26071201', name: '하도급3', fname: '하', gname: '도급3', gender: 'M',
        dept: '생산본부', job: '품질관리', rank: '사원', position: '파트원', jobCat: 'production', site: '충무로',
        empType: 'outsourced',
        joinDate: '2026-07-16', registeredAt: '2026-07-09',
        phone: '010-9943-2201', email: 'ha.dg3@company.co.kr', birth: '1991-12-25',
        photoUrl: '', userId: '', infoStatus: 'progress',
        emailSentDate: '2026-07-09',
        contractOut: true, contractCompany: '(주)성원파트너스',
        contractLabor: false, contractWage: false, docsSent: 0, docSigned: 0,
        contractStartDate: '', contractEndDate: '', contractSentDate: '',
        acctReg: 'waiting', approval: 'rejected',
        resendHistory: [
          rh('2026-07-11T16:45:00', '미가입 상태 재안내 (반려 검토 중)', '정혜진'),
          rh('2026-07-09T11:20:00', '최초 안내 발송', '정혜진'),
        ],
      }),
    ];
    rows.forEach(r => { r.sentDate = r.emailSentDate; });   // 이메일 발송일 (기존 호환 필드)
    return rows;
  }

  /* 계약만료 데모 보정 — 계약직 3건을 만료 상태로, 일반/촉탁/인턴 각 1건씩 노출.
   *   - 입사 완료 후 계약 종료일을 지난 행을 표현
   *   - 입사 플로우 필드(서명/서류 등)는 모두 충족된 모습으로 보정 */
  function applyContractExpiredDemo(rows) {
    const today = new Date();
    /* 도급(contractOut) 계약직은 정규직 전환 대상이 아니므로 만료 데모에서도 제외.
     *   「작성중」 데모로 사용되는 직원들은 만료 후보에서 제외. */
    const draftingNames = new Set(['최예린', '오민서', '윤도현', '서지원']);
    const contractRows = rows.filter(r =>
      r.empType === 'contract' && !r.contractOut && !draftingNames.has(r.name)
    );
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
    /* 만료 임박 데모 — 만료 직원 다음 계약직 2건을 「서명완료 + 종료 30일 이내」 로 보정.
     *   인사카드 계약 상태 / 그리드 근로·임금 컬럼이 '만료 임박' 으로 표시되는지 확인용.
     *   종료일 D-10 / D-25 (둘 다 30일 이내, 아직 만료 전 → '만료 임박'). */
    const soonTargets = contractRows.slice(3, 5);
    soonTargets.forEach((r, idx) => {
      r.status = 'completed';
      r.contractLabor = true;
      r.contractWage = true;
      r.contractSentDate = r.contractSentDate || new Date(today.getTime() - 86400000 * 700).toISOString().slice(0, 10);
      r.docsSent = 5;
      r.docSigned = 5;
      r.infoStatus = 'done';
      r.userId = r.userId || `${r.name.replace(/[가-힣]/g, 'u')}u`;
      r.ssn = '900101-1******';
      const soonDate = new Date(today.getTime() + 86400000 * (10 + idx * 15));
      r.contractEndDate = soonDate.toISOString().slice(0, 10);
    });
    /* 나머지 계약직·일용직 행: 미래 종료일 부여.
     *   isComplete() 가 계약직·일용직에 한해 기간 유효 여부 (contractEndDate >= today) 를
     *   검사하므로, 종료일이 과거이면 모든 단계 충족해도 「완료」 판정 안 됨.
     *   시드 입사일이 최대 89일 과거까지 분포하므로 일용직 +30일 정도로는 부족 →
     *   일용직 +120일 / 계약직 +365일 로 모두 미래 만료일을 갖도록 보정. */
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

  /* ============ 일괄작성 자격 매트릭스 — 전 조합 대표 직원 배치 ============
   *   인사정보카드 고용·계약 정보 탭의 (등록 상태 × 계약 상태) 조합을 직원별로 명시 시드.
   *   seedWageContract 다음·최종 normalizeStatus 직전에 실행되어 앞선 패스를 덮어쓴다(결정론적).
   *
   *   직원 ↔ 셀 매핑
   *     신예원                      — 근로 [미등록·미서명]           / 임금 [선행대기]
   *     권상우                      — 근로 [등록중·미서명]           / 임금 [선행대기]
   *     노은서                      — 근로 [등록완료·미서명]         / 임금 [미등록]
   *     전민재                      — 근로 [등록완료·미서명]         / 임금 [등록중]
   *     피현재                      — 근로 [등록완료·서명완료]       / 임금 [등록완료·서명진행중]
   *     이서연                      — 근로 [변경승인대기·서명완료]    / 임금 [변경승인대기·서명완료]
   *     서준호·박민준·정현우(별도)   — 근로 [등록완료·서명완료]       / 임금 [등록완료·서명완료]
   *     최예린·오민서·윤도현·서지원  — 근로 [등록완료·서명진행중]      / 임금 [등록완료·서명진행중]
   *     조하늘·류재훈·구도윤         — 근로 [등록완료·만료]           / 임금 [등록완료·만료]
   *     남윤서·반지호               — 근로 [등록완료·만료임박]        / 임금 [등록완료·만료임박]
   *     강나래(도급)                — 근로 [해당없음]                / 임금 [해당없음]
   *     한지수(일용)                — 근로 [등록완료·서명완료]        / 임금 [등록완료·서명완료·시급제]
   */
  function applyContractMatrixDemo(rows) {
    const todayMs = Date.now();
    const DAY = 86400000;
    const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
    const find = (nm) => rows.find(r => r.name === nm);

    /* 계약 관련 필드 전체 초기화 — 진행도(progress) 기반 잔여값 제거로 결정론 보장 */
    function resetContract(r) {
      r.contractStartDate = ''; r.contractEndDate = '';
      r.contractSentDate = ''; r.contractSentBy = '';
      r.contractLabor = false; r.contractApprovalPending = false;
      r.contractCompany = r.contractCompany || '';
      r.wageContractStartDate = ''; r.wageContractEndDate = ''; r.wageContractSentDate = '';
      r.incomeType = ''; r.wageType = ''; r.contractAmount = ''; r.baseSalary = '';
      r.wageContractKind = ''; r.payDay = '';
      r.contractWage = false; r.wageApprovalPending = false;
    }
    /* 근로계약 필수 정보 + 입사 마일스톤 보장 (등록완료 판정용) */
    function ensureLaborFields(r) {
      r.jobCat = r.jobCat || 'office';
      r.job = r.job || '경영지원';
      r.site = r.site || '성수동';
      r.infoStatus = 'done';
      r.userId = r.userId || `${r.name.replace(/[가-힣]/g, 'u')}u`;
      r.ssn = r.ssn || '900101-1******';
      /* 상세 정보(근무시간 등) — 고정 근무 기본값. isContractInfoComplete 가 근무시간을 요구하므로
         이 값이 있어야 '등록완료' 로 판정되어 계약 관리 대상 직원으로 노출됨. */
      r.workSchedule  = r.workSchedule  || 'fixed';
      r.workTimeStart = r.workTimeStart || '09:00';
      r.workTimeEnd   = r.workTimeEnd   || '18:00';
      r.breakStart    = r.breakStart    || '12:00';
      r.breakEnd      = r.breakEnd      || '13:00';
    }
    /* 임금계약 정보 채움 (등록완료). signed=서명완료 여부, sentDate=발송일(있으면 서명진행중 신호) */
    function fillWage(r, opts) {
      r.incomeType = 'earned';
      r.wageType = 'annual';
      r.contractAmount = r.contractAmount || 54000000;
      r.baseSalary = r.baseSalary || 4500000;
      /* 임금 계약 유형 — '일반' 제거 → 고정 OT 기본. 고정 OT 기준시간/수당 함께 시드 */
      r.wageContractKind = 'fixedOT';
      r.fixedOTHoursDetail = r.fixedOTHoursDetail || { extension: 12, night: 8 };
      r.fixedOTHours  = r.fixedOTHours || 20;
      r.fixedOTAmount = r.fixedOTAmount || (Math.round((r.baseSalary || 4500000) * 0.12 / 1000) * 1000);
      r.payDay = 10;
      r.wageContractStartDate = r.contractStartDate || r.joinDate || '2025-01-01';
      r.wageContractEndDate = opts.endDate;
      if (opts.sentDate) r.wageContractSentDate = opts.sentDate;
      r.contractWage = !!opts.signed;
    }

    let r;
    /* 근로 미등록 / 임금 선행대기 — 근로유형 미입력(hasLaborInfo=false) */
    if ((r = find('신예원'))) {
      resetContract(r); r.empType = ''; r.contractOut = false;
      r.infoStatus = 'progress'; r.userId = r.userId || 'shinu13';
    }
    /* 근로 등록중(필수 미충족) / 임금 선행대기 — empType 만 있고 시작일 등 누락 */
    if ((r = find('권상우'))) {
      resetContract(r); r.empType = 'regular'; r.contractOut = false;
      r.jobCat = 'office'; r.infoStatus = 'progress';
    }
    /* 근로 등록완료·미서명 / 임금 미등록 */
    if ((r = find('노은서'))) {
      resetContract(r); r.empType = 'regular'; r.contractOut = false;
      ensureLaborFields(r);
      r.contractStartDate = '2025-09-01';   // 정규직 무기 → 시작일만으로 등록완료
    }
    /* 근로 등록완료·미서명 / 임금 등록중(부분 입력) */
    if ((r = find('전민재'))) {
      resetContract(r); r.empType = 'regular'; r.contractOut = false;
      ensureLaborFields(r);
      r.contractStartDate = '2025-07-01';
      r.wageType = 'annual'; r.contractAmount = 50000000;   // 종료일·기본급 등 누락 → 등록중
    }
    /* 근로 서명완료 / 임금 등록완료·서명진행중 */
    if ((r = find('피현재'))) {
      resetContract(r); r.empType = 'regular'; r.contractOut = false;
      ensureLaborFields(r);
      r.contractStartDate = '2024-01-01';
      r.contractLabor = true; r.contractSentDate = '2023-12-20'; r.contractSentBy = '정혜진';
      fillWage(r, { signed: false, endDate: iso(todayMs + DAY * 300), sentDate: iso(todayMs - DAY * 10) });
    }
    /* 근로·임금 변경승인 대기 (서명완료 상태에서 변경 결재중) */
    if ((r = find('이서연'))) {
      resetContract(r); r.empType = 'regular'; r.contractOut = false;
      ensureLaborFields(r);
      r.contractStartDate = '2023-03-01';
      r.contractLabor = true; r.contractSentDate = '2023-02-25'; r.contractSentBy = '정혜진';
      r.contractApprovalPending = true;
      fillWage(r, { signed: true, endDate: iso(todayMs + DAY * 200) });
      r.wageApprovalPending = true;
    }
    /* 정규직 임원 — 근로·임금 등록완료·서명완료 (도급 분포 덮어씀) */
    if ((r = find('서준호'))) {
      resetContract(r); r.empType = 'regular'; r.contractOut = false; r.jobCat = 'office';
      ensureLaborFields(r);
      r.contractStartDate = '2015-01-01';
      r.contractLabor = true; r.contractSentDate = '2014-12-20'; r.contractSentBy = '정혜진';
      fillWage(r, { signed: true, endDate: iso(todayMs + DAY * 250) });
      r.contractAmount = 130000000; r.baseSalary = 10800000;
    }
    /* 근로·임금 등록완료·서명완료 */
    if ((r = find('박민준'))) {
      resetContract(r); r.empType = 'regular'; r.contractOut = false;
      ensureLaborFields(r);
      r.contractStartDate = '2020-05-01';
      r.contractLabor = true; r.contractSentDate = '2020-04-25'; r.contractSentBy = '윤민지';
      fillWage(r, { signed: true, endDate: iso(todayMs + DAY * 220) });
    }
    /* 근로·임금 등록완료·서명진행중 (근로+임금 동시 발송, 미서명) */
    ['최예린', '오민서', '윤도현', '서지원'].forEach(nm => {
      const e = find(nm); if (!e) return;
      resetContract(e);
      if (!e.empType) e.empType = 'contract';
      e.contractOut = false;
      ensureLaborFields(e);
      e.contractStartDate = '2026-04-01';
      if (e.empType !== 'regular') e.contractEndDate = iso(todayMs + DAY * 400);
      e.contractSentDate = '2026-05-18'; e.contractSentBy = '정혜진';
      fillWage(e, { signed: false, endDate: e.contractEndDate || iso(todayMs + DAY * 300), sentDate: '2026-05-18' });
    });
    /* 근로·임금 등록완료·만료 (만료 종료일은 applyContractExpiredDemo 가 이미 설정) */
    ['조하늘', '류재훈', '구도윤'].forEach(nm => {
      const e = find(nm); if (!e) return;
      ensureLaborFields(e);
      e.contractStartDate = e.contractStartDate || '2023-01-01';
    });
    /* 근로·임금 등록완료·만료임박 (임박 종료일은 applyContractExpiredDemo 가 이미 설정) */
    ['남윤서', '반지호'].forEach(nm => {
      const e = find(nm); if (!e) return;
      ensureLaborFields(e);
      e.contractStartDate = e.contractStartDate || '2024-01-01';
      e.wageContractStartDate = e.wageContractStartDate || e.contractStartDate;
    });
    /* 도급직 — 근로·임금 해당없음 (등록완료) */
    if ((r = find('강나래'))) {
      resetContract(r); r.empType = 'outsourced'; r.contractOut = true; r.jobCat = r.jobCat || 'office';
      ensureLaborFields(r);
      r.contractCompany = '(주)성원파트너스';
      r.contractStartDate = '2025-01-01'; r.contractEndDate = iso(todayMs + DAY * 400);
    }
    /* 일용직 — 근로 등록완료·서명완료 / 임금(시급제) 등록완료·서명완료.
       → 급여 정보 탭 '정산 정보' 가 일용직(시급·주휴수당 + 임금 계약 연동 기간) 으로 노출되는 쇼케이스. */
    if ((r = find('한지수'))) {
      resetContract(r); r.empType = 'daily'; r.contractOut = false;
      ensureLaborFields(r);
      r.contractStartDate = '2026-01-05'; r.contractEndDate = iso(todayMs + DAY * 90);
      r.contractLabor = true; r.contractSentDate = '2026-01-02'; r.contractSentBy = '정혜진';
      /* 시급제 임금계약 서명완료 — 계약기간은 근로계약과 동일(임금 계약 연동 기간) */
      r.incomeType = 'earned';
      r.wageType = 'hourly';
      r.hourlyWage = 12000;
      r.holidayAllowance = Math.floor(12000 * 0.2);          // 2,400 (시급의 20%)
      r.contractAmount = 12000 + Math.floor(12000 * 0.2);    // 14,400 (주휴 포함 계약 시급)
      r.baseSalary = '';
      r.wageContractKind = '';
      r.payDay = 10;
      r.hoursPerDay = 8; r.hoursPerWeek = 40; r.hoursPerMonth = 209;
      r.wageContractStartDate = r.contractStartDate;
      r.wageContractEndDate = r.contractEndDate;             // 근로계약과 동일 기간
      r.wageIndefinite = false;
      r.contractWage = true;
      r.wageContractSentDate = '2026-01-02';
      r.wageContractSignedDate = '2026-01-04';
    }
    return rows;
  }

  const STATE = {
    rows: [],
    filtered: [],
    selectedIds: new Set(),
    page: 1,
    pageSize: 20,
    filter: null,
    /* 입사자 관리 2 — 화면 모드 (페이지 전환) */
    view: 'list',             // 'list' | 'detail'
    detailEmpId: null,        // 상세 페이지에서 보고 있는 사원 id
    /* 상세 페이지 내부 탭 (Drawer 와 동일 키 재사용) */
    drawerEmpId: null,
    drawerTab: 'public',
    drawerEditMode: false,
    drawerDirty: false,
    drawerPatch: {},
    currentRole: 'manager',   // 인사팀장 — 데모 기본값
    /* 조직도 트리 — 좌측 패널 (page-hr-employee 와 동일 정책) */
    selectedDeptId: 'C0',     // 트리에서 선택된 부서 id ('C0' = 전체)
    showInactive: false,      // 비활성 부서 노출 여부 (트리 좌측 체크박스)
    leftCollapsed: false,     // 좌측 조직도 패널 접힘 여부
  };

  /* ============ 헬퍼 ============ */
  function $(s, r=document) { return r.querySelector(s); }
  function $$(s, r=document) { return Array.from(r.querySelectorAll(s)); }
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function nz(v) { return v === '' || v == null ? '-' : esc(v); }
  /* 표시 전용 날짜 포맷 — ISO(YYYY-MM-DD) → YY/MM/DD (SWADPIA §1). 데이터 key/비교/정렬엔 사용 금지. */
  function dispYmd(s) {
    if (!s) return s;
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1].slice(2)}/${m[2]}/${m[3]}` : String(s);
  }
  function displayName(r) {
    return r.nameFlip ? `${r.gname}${r.fname}` : `${r.fname}${r.gname}`;
  }
  /* 행 단위 작은 아바타 — detailHrCardHTML 의 seed/색상 규칙과 동일.
     데모용 외국인 stock 사진(i.pravatar) fallback 은 제거 — 사진 없으면 이니셜 + 색상. */
  function rowAvatarHTML(emp, opts) {
    /* 인감 사용 화면 직원 행 아바타와 동일 — 24x24 원형, photo 또는 이니셜 */
    const size = (opts && opts.size) || 24;
    const photoUrl = emp.photoUrl || '';
    if (photoUrl) {
      return `<img src="${esc(photoUrl)}" alt="" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.style.background='#E5E7EB';this.removeAttribute('src');" />`;
    }
    const initial = (displayName(emp) || '?').charAt(0);
    return `<span style="width:${size}px;height:${size}px;border-radius:50%;background:var(--color-active);color:var(--color-brand-primary);display:inline-flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;">${esc(initial)}</span>`;
  }
  /* 인사정보카드 전용 증명사진 — 인물을 축소하고 단색 배경 여백을 키운 3:4 변형
   *   (assets/img/employees/card/). 목록 썸네일·아바타는 원본을 그대로 사용한다. */
  function cardPhotoUrl(url) {
    return url ? url.replace('/employees/', '/employees/card/') : '';
  }
  function currentUserName() {
    /* 데모 — 실제 세션 사용자 명 */
    return (window.App && App.HRContract && App.HRContract.HR_NAME) || '정혜진';
  }
  function empTypeLabel(r) {
    if (!r.empType) return '-';
    /* 인사정보 관리 — sub 라벨(촉탁/인턴/수습) 미노출. 모두 「기타」 컬럼 pill 로만 표시. */
    return EMP_TYPE_LABEL[r.empType] || '-';
  }

  function applyFilter() {
    const p = STATE.filter || {};
    const from = p.from || '';
    const to   = p.to   || '';
    const cond = p.condition || 'name';
    const kw   = (p.keyword || '').trim().toLowerCase();
    /* 계정 상태 — 'registered' = 등록완료 (MILESTONES.idDone), 'unregistered' = 미등록 */
    const accountVal = (p.advanced && p.advanced.account) || '';
    const empTypeVal = (p.advanced && p.advanced.empType) || '';
    /* 근로/임금 계약 — 서명 상태(unsigned/signing/signed/soon/expired) 로 매칭.
     *   contractCellState 의 ctr.code 와 직접 비교. 해당없음(도급직) 은 어느 값에도 매칭 안 됨 → 자동 제외. */
    const laborInfoVal = (p.advanced && p.advanced.laborInfo) || '';
    const wageInfoVal  = (p.advanced && p.advanced.wageInfo)  || '';
    const probationOnly = !!(p.checks && Array.isArray(p.checks.probation) && p.checks.probation.includes('on'));
    /* 계약직 세부 (촉탁/인턴) — 체크된 sub-type 행만 통과 */
    const subTypeChecked = (p.checks && Array.isArray(p.checks.contractSubType)) ? p.checks.contractSubType : [];

    /* 트리에서 선택된 부서 subtree (자손 포함). 'C0' (전체) 면 미적용. */
    let treeDeptIds = null;
    if (STATE.selectedDeptId && STATE.selectedDeptId !== 'C0') {
      treeDeptIds = new Set([STATE.selectedDeptId]);
      (function collect(id) { deptChildren(id).forEach(c => { treeDeptIds.add(c.id); collect(c.id); }); })(STATE.selectedDeptId);
    }

    STATE.filtered = STATE.rows.filter(r => {
      /* 퇴사자는 본 화면에서 자동 숨김 */
      if (r.status === 'retired') return false;
      /* 트리 부서 필터 — 선택 부서 + 그 하위 부서의 사원만 통과 */
      if (treeDeptIds && !treeDeptIds.has(DEPT_NAME_TO_ID[r.dept] || '')) return false;
      /* 계정 상태 — 등록완료(idDone) / 등록실패(반려) / 등록대기(그 외).
         등록대기 필터에서는 반려(등록실패) 건을 제외한다. */
      if (accountVal === 'registered'   && !MILESTONES.idDone(r)) return false;
      if (accountVal === 'unregistered' && (MILESTONES.idDone(r) || r.approval === 'rejected')) return false;
      if (accountVal === 'failed'       &&  r.approval !== 'rejected') return false;
      /* 근로 계약 — 서명 상태 코드 매칭. unsigned(미발송)·signing(발송후 미서명) 은
         사용자 표기상 모두 '서명대기(signing)' 로 정규화하여 함께 매칭. na 는 '해당없음' 값에만 매칭. */
      if (laborInfoVal) {
        const st = contractCellState(r, 'labor');
        const code = st.na ? 'na' : (st.ctr.code === 'unsigned' ? 'signing' : st.ctr.code);
        if (code !== laborInfoVal) return false;
      }
      /* 임금 계약 — 위와 동일 규칙. 일용직은 시급제 대상. */
      if (wageInfoVal) {
        const st = contractCellState(r, 'wage');
        const code = st.na ? 'na' : (st.ctr.code === 'unsigned' ? 'signing' : st.ctr.code);
        if (code !== wageInfoVal) return false;
      }
      if (empTypeVal && r.empType !== empTypeVal) return false;
      if (probationOnly && !r.probation) return false;
      if (subTypeChecked.length > 0 && !subTypeChecked.includes(r.contractSubType)) return false;
      if (from && r.joinDate < from) return false;
      if (to   && r.joinDate > to)   return false;
      if (kw) {
        const target = cond === 'id' ? (r.id || '') : displayName(r);
        if (!target.toLowerCase().includes(kw)) return false;
      }
      return true;
    });
    if (STATE.page > Math.ceil(STATE.filtered.length / STATE.pageSize)) STATE.page = 1;
  }

  /* ============ 상태 pill — v3 4단 단순화 ============
   *   등록 / 진행중 / 완료 / 계약만료 (+ 메일 실패 시 별도 표시) */
  function statusPill(r) {
    /* 이메일 발송 실패 — 메일만 시도하고 계정등록 전 단계에 머문 행 */
    if (r.mailFailCode && r.status === 'inProgress' && !MILESTONES.idDone(r)) {
      const reason = FAIL_LABEL[r.mailFailCode] || '오류';
      return `<span class="pill pill--danger" title="이메일 발송 실패 — 재발송이 필요합니다">이메일 실패 · ${esc(reason)}</span>`;
    }
    const s = STATUS[r.status] || STATUS.registered;
    return `<span class="pill${s.pill ? ' pill--' + s.pill : ''}">${esc(s.label)}</span>`;
  }

  /* 인사정보 상태 — 발송완료 / 등록완료 / -
   *   진행중: 메일 발송됐으나 본인 정보 미입력
   *   등록완료: 본인 인사정보 입력 완료 (MILESTONES.infoDone) */
  function infoStatusBadge(r) {
    if (MILESTONES.infoDone(r))   return `<span class="pill pill--success">등록완료</span>`;
    if (MILESTONES.mailSent(r))   return `<span class="pill pill--info">진행중</span>`;
    return `<span style="color:var(--color-text-muted);">-</span>`;
  }

  /* 근로계약 상태 — 도급직만 해당없음. 일용직은 근로계약 대상(기간제). 계약직 만료는 별도 표시.
     상태값 표기 통일: 서명대기 / 서명완료 / 만료 / 만료임박 / 해당없음 (미발송은 '-' 플레이스홀더). */
  function laborBadge(r) {
    if (r.contractOut) {
      return `<span class="pill" title="도급직 — 근로계약 해당없음">해당없음</span>`;
    }
    if (r.status === 'contractExpired' && (r.empType === 'contract' || r.empType === 'daily')) {
      return `<span class="pill pill--danger">만료</span>`;
    }
    if (!MILESTONES.contractSent(r)) return `<span style="color:var(--color-text-muted);">-</span>`;
    if (r.contractLabor) {
      /* 만료임박 — 종료일 30일 이내(아직 만료 전). 무기계약(종료일 없음)은 제외. */
      const end = r.contractEndDate || '';
      if (end) {
        const today = (window.App && App.HRContract && App.HRContract.todayStr)
          ? App.HRContract.todayStr() : new Date().toISOString().slice(0, 10);
        if (end >= today) {
          const days = Math.round((new Date(end) - new Date(today)) / 86400000);
          if (days <= 30) return `<span class="pill pill--warning">만료임박</span>`;
        }
      }
      return `<span class="pill pill--success">서명완료</span>`;
    }
    return `<span class="pill pill--info">서명대기</span>`;
  }

  /* 임금계약 상태 — 도급직은 해당없음. 일용직은 시급제 임금계약 대상.
   *   상태값 표기 통일: 서명대기 / 서명완료 / 만료 / 만료임박 / 해당없음 (미발송은 '-' 플레이스홀더). */
  function wageBadge(r) {
    if (r.contractOut) {
      return `<span class="pill" title="도급직 — 임금계약 해당없음">해당없음</span>`;
    }
    /* 임금계약 만료 — 메인 status 와 무관하게 컬럼에만 표시 */
    const wage = wageContractStatus(r);
    if (wage && wage.kind === 'expired') return `<span class="pill pill--danger">만료</span>`;
    if (r.status === 'contractExpired' && r.empType === 'contract') {
      return `<span class="pill pill--danger">만료</span>`;
    }
    /* 만료임박 — 서명완료(유효) 임금계약이 종료 30일 이내. 인사카드 statusBadge 와 동일 기준. */
    if (wage && wage.kind === 'soon') return `<span class="pill pill--warning">만료임박</span>`;
    if (!MILESTONES.contractSent(r)) return `<span style="color:var(--color-text-muted);">-</span>`;
    if (r.contractWage) return `<span class="pill pill--success">서명완료</span>`;
    return `<span class="pill pill--info">서명대기</span>`;
  }

  /* 입사서류 상태 — 미발송 / 진행중 / 제출완료 */
  function docBadge(r) {
    const sent = r.docsSent || 0;
    const signed = r.docSigned || 0;
    if (sent === 0) return `<span style="color:var(--color-text-muted);">-</span>`;
    const tip = `입사서류 ${sent}건 발송 · ${signed}건 제출완료`;
    if (signed >= sent) return `<span class="pill pill--success" title="${esc(tip)}">제출완료</span>`;
    return `<span class="pill pill--info" title="${esc(tip)}">진행중</span>`;
  }

  /* 계약/서류 서명 완료 판정 헬퍼 — 재발송 버튼 노출 조건에 사용
   *   계약: 도급직은 계약 없음 (재발송 N/A), 일용직은 근로계약서 + 시급제 임금계약 모두 대상 */
  function isContractAllSigned(r) {
    if (r.contractOut) return true;          // 계약 자체가 없으므로 '재발송 N/A' 로 취급
    const wageRequired = true;               // 일용직 포함 전 사원 임금계약 대상 (도급직만 위에서 제외)
    return !!r.contractLabor && (!wageRequired || !!r.contractWage);
  }
  function isDocsAllSigned(r) {
    const sent = r.docsSent || 0;
    return sent > 0 && (r.docSigned || 0) >= sent;
  }

  /* 행 액션 — 입사자 관리 2 는 목록 화면에서 [이메일 발송 / 재발송] 만 노출.
   *   계약/서류 진행, 정규직 전환 등 다른 액션은 [상세] 페이지에서 처리.
   *
   *   재발송 노출 조건: 이메일은 발송됐지만 입사자가 인사정보 등록을 끝내지 않은 상태
   *     - mailSent : 메일 발송, 입사자가 아직 계정 등록 안 함
   *     - idDone   : 계정 등록은 했지만 정보 미입력
   *   인사정보 등록완료(infoDone) 이후엔 이메일의 목적이 끝났으므로 재발송 의미 없음 → '-' */
  function rowActionsHTML(r) {
    /* 인사정보 관리 — 기능 컬럼: 「이메일 발송」 + 「문자 발송」.
     *   · 이메일: 계정 미등록(MILESTONES.idDone === false) + 발송 가능(registered / 메일발송) 행만.
     *     계정등록완료 행은 이메일의 목적(계정 설정 안내)이 끝났으므로 노출 안 함.
     *   · 문자  : 휴대전화 번호가 등록된 행이면 계정 상태와 무관하게 노출.
     *   · 퇴직 행은 둘 다 의미 없음 → '-'. */
    if (r.status === 'retired') {
      return `<span style="color:var(--color-text-muted);">-</span>`;
    }
    const btns = [];
    /* 이메일 발송 버튼 제거 — 액션 컬럼은 문자 발송만 노출 */
    if ((r.phone || '').trim()) {
      btns.push(`<button class="btn btn--xs" type="button" data-row-act="sms-send">문자 발송</button>`);
    }
    if (!btns.length) return `<span style="color:var(--color-text-muted);">-</span>`;
    /* 이메일 발송 · 문자 발송 — 한 줄에 나란히(줄바꿈 없이) */
    return `<div style="display:flex;flex-wrap:nowrap;gap:4px;justify-content:center;white-space:nowrap;">${btns.join('')}</div>`;
  }

  /* ============ 새 컬럼 헬퍼 — 인사정보 관리 ============
   *   재직 상태  : 퇴직(retired) / 휴직(onLeave) / 재직(기본)
   *   계정 상태  : 등록완료(MILESTONES.idDone) / 미등록
   *   기타       : 우선순위 수습 > 도급 > 촉탁 > 인턴 > 일반
   *   성명 셀    : 36px 원형 썸네일 + 이름 + (부서·직책 sub) — 부서·직책 모두 빈값이면 sub 미노출 */
  function employmentStatusPill(r) {
    if (r.status === 'retired') return `<span class="pill">퇴직</span>`;
    if (r.onLeave)              return `<span class="pill pill--warning">휴직</span>`;
    return `<span class="pill pill--success">재직</span>`;
  }
  function accountStatusPill(r) {
    if (MILESTONES.idDone(r))      return `<span class="pill pill--info">등록완료</span>`;
    if (r.approval === 'rejected') return `<span class="pill pill--danger">등록실패</span>`;
    return `<span class="pill pill--warning">등록대기</span>`;
  }
  /* 계정 등록 상태 코드 — 등록완료(done) / 등록실패(failed·반려) / 등록대기(waiting) */
  function acctRegCode(r) {
    if (r.acctReg === 'done')      return 'done';
    if (r.approval === 'rejected') return 'failed';
    return 'waiting';
  }
  /* 계정 등록 컬럼 — 본인 계정/정보 등록 진행 상태(pill 만). 액션은 「기능」 컬럼으로 분리.
   *   · 등록대기 : 안내 발송됐으나 본인 미등록
   *   · 등록완료 : 본인 등록 완료
   *   · 등록실패 : HR 검토에서 반려됨(재발송 시 등록대기로 복귀) */
  function acctRegCellHTML(r) {
    switch (acctRegCode(r)) {
      case 'done':   return `<span class="pill pill--info">등록완료</span>`;
      case 'failed': return `<span class="pill pill--danger">등록실패</span>`;
      default:       return `<span class="pill pill--warning">등록대기</span>`;
    }
  }
  /* 기능 컬럼 — 계정 등록 상태에 따른 액션.
   *   · 대기중       : [재발송] [재발송 이력]
   *   · 등록완료+승인대기 : [검토]
   *   · 그 외         : - */
  function acctActionCellHTML(r) {
    if (r.acctReg !== 'done') {
      /* 재발송 — 하루 2회 한도 소진 시 버튼 비활성(툴팁 안내), 잔여 시 툴팁으로 사용 횟수 표기 */
      const used = resendsToday(r);
      const resendBtn = (used >= RESEND_DAILY_MAX)
        ? `<button class="btn btn--xs" type="button" disabled title="오늘 재발송 한도(${RESEND_DAILY_MAX}회) 소진 · 내일 다시 가능">재발송</button>`
        : `<button class="btn btn--xs" type="button" data-row-act="resend" title="오늘 ${used}/${RESEND_DAILY_MAX}회 사용">재발송</button>`;
      return `<div style="display:flex;flex-wrap:nowrap;gap:4px;align-items:center;justify-content:center;white-space:nowrap;">`
        + resendBtn
        + `<button class="btn btn--xs" type="button" data-row-act="resend-hist">재발송 이력</button>`
        + `</div>`;
    }
    if (r.approval === 'pending') {
      return `<button class="btn btn--xs" type="button" data-row-act="review">검토</button>`;
    }
    return `<span style="color:var(--color-text-muted);">-</span>`;
  }
  /* ===== 재발송 정책 헬퍼 — 하루 2회 + 5분 쿨다운 ===== */
  /* 오늘(현지 기준) 재발송 건수 — resendHistory 의 ts(epoch) 기준 */
  function resendsToday(emp) {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
    return (emp.resendHistory || []).filter(h => {
      if (!h.ts) return false;
      const t = new Date(h.ts);
      return t.getFullYear() === y && t.getMonth() === m && t.getDate() === d;
    }).length;
  }
  /* 마지막 재발송 시각(epoch). 이력 없으면 0 */
  function lastResendTs(emp) {
    const list = emp.resendHistory || [];
    return list.reduce((mx, h) => Math.max(mx, h.ts || 0), 0);
  }
  /* 재발송 가능 여부 판정 — { ok } | { ok:false, msg } */
  function resendGate(emp) {
    if (resendsToday(emp) >= RESEND_DAILY_MAX) {
      return { ok: false, msg: `오늘 재발송 한도(${RESEND_DAILY_MAX}회)를 모두 사용했습니다. 내일 다시 시도해 주세요.` };
    }
    const last = lastResendTs(emp);
    const elapsed = Date.now() - last;
    if (last && elapsed < RESEND_COOLDOWN_MS) {
      const minsLeft = Math.max(1, Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 60000));
      return { ok: false, msg: `최근 재발송 후 5분이 지나야 재발송할 수 있습니다. (약 ${minsLeft}분 후 가능)` };
    }
    return { ok: true };
  }
  /* 승인 상태 컬럼 — 계정 등록완료 건에 대한 HR 검토 결과.
   *   승인 전(muted, 계정 등록 전이라 아직 검토 단계 아님) / [승인][반려](검토 대기)
   *   / 승인완료 / 반려(삭제 가능) */
  function approvalCellHTML(r) {
    switch (r.approval) {
      case 'pending':
        return `<div style="display:flex;flex-wrap:nowrap;gap:4px;justify-content:center;white-space:nowrap;">`
          + `<button class="btn btn--xs btn--primary" type="button" data-row-act="approve">승인</button>`
          + `<button class="btn btn--xs btn--danger" type="button" data-row-act="reject">반려</button>`
          + `</div>`;
      case 'approved':
        return `<span class="pill pill--success">승인완료</span>`;
      case 'rejected':
        return `<span class="pill pill--danger">반려</span>`;
      default:
        /* none — 계정 등록 전이라 아직 승인 대상 아님. 빈 셀/대시 대신 muted pill 로
         *   상태를 명시해 컬럼 전체가 일관된 pill 체계가 되도록 함. */
        return `<span class="pill pill--muted">승인 전</span>`;
    }
  }
  /* 근로 계약 — 서명 상태(미작성/서명대기/서명완료/만료/만료 임박). 도급직은 해당없음.
   *   contractCellState(labor).ctr 를 단일 진실원으로 사용 (인사카드 상태 뱃지와 동일 기준). */
  function laborInfoPill(r) { return signPillHTML(r, 'labor'); }
  /* 임금 계약 — 서명 상태(미작성/서명대기/서명완료/만료/만료 임박). 도급직은 해당없음.
   *   일용직은 시급제 임금계약 대상. contractCellState(wage).ctr 기준. */
  function wageInfoPill(r) { return signPillHTML(r, 'wage'); }
  /* 근로계약 / 임금계약 정보 — 필터 판정 헬퍼.
   *   해당없음(도급직) 행은 미등록 필터에서도 제외 (세팅 대상 아님). 일용직은 대상. */
  function isLaborInfoApplicable(r) { return !r.contractOut; }
  function isWageInfoApplicable(r)  { return !r.contractOut; }
  function otherStatusLabel(r) {
    /* 기타 — 도급/파견은 「근로 유형」 컬럼에서 자체적으로 표시되므로 여기서 중복 노출 안함.
     *   수습 / 촉탁 / 인턴 / 일반 만 노출. */
    if (r.probation)                    return `<span>수습</span>`;
    if (r.contractSubType === 'chotak') return `<span>촉탁</span>`;
    if (r.contractSubType === 'intern') return `<span>인턴</span>`;
    if (r.empType)                      return `<span>일반</span>`;
    return `<span style="color:var(--color-text-muted);">-</span>`;
  }
  function nameCellHTML(r) {
    /* 사진 + 이름  팀·직위·직책 한 줄 inline.
     *   이름과 메타 사이는 여백(8px)만.
     *   팀·직위·직책 각 항목 사이는 구두점(·)으로만 구분 — 구두점 앞뒤 여백 없이 붙임. 색상은 muted. */
    const parts = [r.dept, r.rank, r.position].filter(Boolean).map(esc);   // 팀 · 직위 · 직책
    const dot = `<span style="color:var(--color-text-muted);font-size:var(--fs-xs);" aria-hidden="true">·</span>`;
    const meta = (v) => `<span style="color:var(--color-text-muted);font-size:var(--fs-xs);white-space:nowrap;">${v}</span>`;
    return `
      <div style="display:flex;align-items:center;gap:8px;min-width:0;">
        ${rowAvatarHTML(r, { size: 24 })}
        <a href="#" data-emp-card-link style="color:var(--color-brand-primary);font-weight:var(--fw-medium);white-space:nowrap;">${esc(displayName(r))}</a>
        <span style="display:inline-flex;align-items:center;gap:0;min-width:0;">
          ${parts.map(meta).join(dot)}
        </span>
      </div>
    `;
  }

  /* ============ 조직도 트리 — page-hr-employee.js 의 구조 이식 ============
   *   본 페이지 전용 STATE.selectedDeptId 로 부서 필터 연동. 'C0'(루트) 선택 = 전체. */
  const DEPTS = [
    { id: 'C0',  parentId: null, name: '(주)성원애드피아', type: 'root', active: true },
    { id: 'T1',  parentId: 'C0', name: '경영지원본부',     type: 'hq',   active: true },
    { id: 'T2',  parentId: 'C0', name: '생산본부',          type: 'hq',   active: true },
    { id: 'T3',  parentId: 'C0', name: '개발팀',            type: 'team', active: true },
    { id: 'T4',  parentId: 'C0', name: '홍보팀',            type: 'team', active: true },
    { id: 'P11', parentId: 'T1', name: '인사팀',            type: 'part', active: true },
    { id: 'P12', parentId: 'T1', name: '재무팀',            type: 'part', active: true },
    { id: 'P13', parentId: 'T1', name: '총무팀',            type: 'part', active: true },
    { id: 'P21', parentId: 'T2', name: '생산1팀',           type: 'part', active: true },
    { id: 'P22', parentId: 'T2', name: '품질팀',            type: 'part', active: true },
    { id: 'P14', parentId: 'T1', name: '구매파트',          type: 'part', active: false },
  ];
  const DEPT_NAME_TO_ID = {
    '경영지원본부': 'T1', '생산본부': 'T2', '개발팀': 'T3', '홍보팀': 'T4',
    '인사팀': 'P11', '재무팀': 'P12', '총무팀': 'P13', '생산1팀': 'P21', '품질팀': 'P22',
  };
  /* 공유 DEPTS 동기화 — 임직원 현황(page-hr-employee) 의 부서 관리 모달이 변경한 DEPTS 를
     본 페이지로 복사. App.HrDeptManage.getDepts() 가 없으면 no-op. */
  function syncDeptsFromShared() {
    const api = window.App && App.HrDeptManage;
    if (!api || typeof api.getDepts !== 'function') return;
    const shared = api.getDepts();
    if (!Array.isArray(shared) || !shared.length) return;
    DEPTS.length = 0;
    shared.forEach(d => DEPTS.push(d));
    /* DEPT_NAME_TO_ID 재구성 — 부서명 변경/추가/삭제 즉시 반영 */
    Object.keys(DEPT_NAME_TO_ID).forEach(k => delete DEPT_NAME_TO_ID[k]);
    DEPTS.forEach(d => { if (d.type !== 'root') DEPT_NAME_TO_ID[d.name] = d.id; });
  }
  const ICON_CHEVRON_L = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
  const ICON_CHEVRON_R = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
  function deptTypeIcon(type) {
    if (type === 'root') return '🏢';
    if (type === 'hq')   return '🏛️';
    if (type === 'team') return '👥';
    return '📄';
  }
  function deptChildren(parentId) {
    return DEPTS.filter(d => d.parentId === parentId && (STATE.showInactive || d.active !== false));
  }
  function getEmpsInDept(deptId) {
    if (deptId === 'C0') return STATE.rows.filter(r => r.status !== 'retired');
    const acc = new Set([deptId]);
    (function collect(id) { deptChildren(id).forEach(c => { acc.add(c.id); collect(c.id); }); })(deptId);
    return STATE.rows.filter(r => r.status !== 'retired' && acc.has(DEPT_NAME_TO_ID[r.dept] || ''));
  }
  function findDept(id) { return DEPTS.find(d => d.id === id); }
  function renderTreeNodeHTML(d, isRoot) {
    const kids = deptChildren(d.id);
    const hasKids = kids.length > 0;
    const empCnt = getEmpsInDept(d.id).length;
    const isSel = STATE.selectedDeptId === d.id;
    const cls = ['tree__node',
      isRoot || hasKids ? 'is-open' : 'is-leaf',
      isSel ? 'is-selected' : '',
      d.active === false ? 'is-inactive' : ''
    ].filter(Boolean).join(' ');
    const inactiveTag = d.active === false ? ' <span class="pill pill--soft-gray" style="font-size:10px;">비활성</span>' : '';
    const countLabel = isRoot ? `전체 ${empCnt}명` : `${empCnt}명`;
    return `<li class="${cls}" data-id="${d.id}" data-type="${esc(d.type)}" style="${d.active === false ? 'opacity:0.55;' : ''}">
      <div class="tree__row">
        <span class="tree__toggle">${(isRoot || hasKids) ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>' : ''}</span>
        <span class="tree__icon">${deptTypeIcon(d.type)}</span>
        <span class="tree__label">${esc(d.name)}${inactiveTag} <span class="tree__count">${countLabel}</span></span>
      </div>
      ${(isRoot || hasKids) ? `<ul>${kids.map(k => renderTreeNodeHTML(k, false)).join('')}</ul>` : ''}
    </li>`;
  }

  /* ===== 외부 공용 — 다른 화면(계약 일괄 작성 등)이 동일한 조직도를 그릴 수 있도록 ===== */
  function deptSubtreeIds(deptId) {
    const acc = new Set([deptId]);
    (function collect(id) { deptChildren(id).forEach(c => { acc.add(c.id); collect(c.id); }); })(deptId);
    return acc;
  }
  /* 부서 id → 부서명 (외부 화면이 선택 노드 제목을 표시할 때 사용) */
  function deptName(id) { const d = findDept(id); return d ? d.name : ''; }
  /* 외부 employee 배열을 선택 부서(자손 포함)로 필터 — 근태/연차/근무스케줄 현황 공용.
     deptId 'C0'/빈값이면 전체. emp.dept(부서명) → DEPT_NAME_TO_ID 매핑으로 판정. */
  function empsInDept(emps, deptId) {
    if (!deptId || deptId === 'C0') return (emps || []).slice();
    const ids = deptSubtreeIds(deptId);
    return (emps || []).filter(e => ids.has(DEPT_NAME_TO_ID[e.dept] || ''));
  }
  /* selectedId 를 인자로 받는 트리 렌더 (renderTreeNodeHTML 과 동일 마크업, STATE 비의존).
     opts.emps 가 주어지면 각 노드 인원 수를 그 배열 기준으로 집계(부서명→id 매핑, 자손 롤업) —
     화면별로 다른 임직원 데이터를 쓰더라도 트리 구조는 임직원 관리와 100% 동일하게 유지. */
  function renderDeptTreeHTML(selectedId, opts) {
    opts = opts || {};
    const sel = selectedId || 'C0';
    let countFn;
    if (Array.isArray(opts.emps)) {
      const direct = {};
      opts.emps.forEach(e => { const id = DEPT_NAME_TO_ID[e.dept]; if (id) direct[id] = (direct[id] || 0) + 1; });
      countFn = (deptId) => {
        if (deptId === 'C0') return opts.emps.length;
        let n = 0; deptSubtreeIds(deptId).forEach(id => { n += direct[id] || 0; }); return n;
      };
    } else {
      countFn = (deptId) => getEmpsInDept(deptId).length;
    }
    function node(d, isRoot) {
      const kids = deptChildren(d.id);
      const hasKids = kids.length > 0;
      const empCnt = countFn(d.id);
      const isSel = sel === d.id;
      /* collapsed 옵션 — 기본 접힘. 루트만 펼치고, 하위 부모 노드는 접힌 채(셰브론 노출) 시작 */
      const openCls = opts.collapsed
        ? (isRoot ? 'is-open' : (hasKids ? '' : 'is-leaf'))
        : (isRoot || hasKids ? 'is-open' : 'is-leaf');
      const cls = ['tree__node',
        openCls,
        isSel ? 'is-selected' : '',
        d.active === false ? 'is-inactive' : ''
      ].filter(Boolean).join(' ');
      const countLabel = isRoot ? `전체 ${empCnt}명` : `${empCnt}명`;
      return `<li class="${cls}" data-id="${d.id}" data-type="${esc(d.type)}">
        <div class="tree__row">
          <span class="tree__toggle">${(isRoot || hasKids) ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>' : ''}</span>
          <span class="tree__icon">${deptTypeIcon(d.type)}</span>
          <span class="tree__label">${esc(d.name)} <span class="tree__count">${countLabel}</span></span>
        </div>
        ${(isRoot || hasKids) ? `<ul>${kids.map(k => node(k, false)).join('')}</ul>` : ''}
      </li>`;
    }
    const root = findDept('C0');
    return root ? node(root, true) : '';
  }
  function renderTreeOnly() {
    const ul = document.querySelector('#page-hr-info-mgmt #empi-tree');
    if (!ul) return;
    const root = findDept('C0');
    ul.innerHTML = root ? renderTreeNodeHTML(root, true) : '';
  }
  function updateDeptTitle() {
    const titleEl = document.querySelector('#page-hr-info-mgmt #empi-dept-title');
    if (!titleEl) return;
    const d = findDept(STATE.selectedDeptId);
    titleEl.textContent = (!d || d.id === 'C0') ? '전체' : d.name;
  }

  /* ============ 모바일(≤768px) — 좌측 조직도 드로어 상태 동기화 ============
   *   CSS 미디어쿼리(max-width:768px)와 동일 기준으로 판정해, 모바일이면 조직도를
   *   접힌(드로어 닫힘) 상태를 디폴트로 둔다. 데스크탑이면 상시 펼침.
   *   window.innerWidth 대신 matchMedia 로 CSS 뷰포트 기준과 일치시켜 경계 오판을 막는다. */
  const EMPI_MOBILE_BP = 768;
  function empiIsMobileWidth() { return window.matchMedia('(max-width: ' + EMPI_MOBILE_BP + 'px)').matches; }
  function applyEmpiMobileSplitState(pageEl) {
    const root = (pageEl || document).querySelector('#empi-split');
    if (!root) return;
    if (empiIsMobileWidth()) { root.classList.add('is-left-collapsed'); STATE.leftCollapsed = true; }
    else                     { root.classList.remove('is-left-collapsed'); STATE.leftCollapsed = false; }
  }
  /* 페이지 외부에서 한 번만 바인딩 — resize 로 모바일↔데스크탑 전환 시 모바일이면 접기 */
  if (!window.__empiResizeBound) {
    window.__empiResizeBound = true;
    window.addEventListener('resize', () => {
      const root = document.querySelector('#page-hr-info-mgmt #empi-split');
      if (!root) return;
      if (empiIsMobileWidth() && !root.classList.contains('is-left-collapsed')) {
        root.classList.add('is-left-collapsed');
        STATE.leftCollapsed = true;
      }
    });
  }

  /* ============ 메인 페이지 빌드 ============ */
  function buildPage(pageEl) {
    const C = App.Components;
    let searchHTML = C.searchPanel({
      showDateRange: true,
      dateColumns: [{ key: 'joinDate', label: '입사일' }],
      quick: ['week','m1','m3','m6','y1'],
      conditions: [
        { value: 'name', label: '성명' },
        { value: 'id',   label: '사번' },
      ],
      /* placeholder 미지정 — 공통 기본값('검색어를 입력하세요') 사용.
         검색조건 드롭다운(성명/사번)이 바뀔 때마다 문구가 흔들리지 않도록 전 화면 공통 워딩으로 통일. */
      advanced: [
        { name: 'account', label: '계정 상태', options: [
          { value: 'unregistered', label: '등록대기' },
          { value: 'registered',   label: '등록완료' },
          { value: 'failed',       label: '등록실패' },
        ]},
        { name: 'empType', label: '근로 유형', options: [
          { value: 'regular',    label: '정규직' },
          { value: 'contract',   label: '계약직' },
          { value: 'daily',      label: '일용직' },
          { value: 'outsourced', label: '도급직' },
        ]},
        /* 부서 필터는 상세검색에서 제외 — 좌측 조직도 트리(STATE.selectedDeptId) 가 부서 필터를 담당해 중복. */
        /* 근로/임금 계약 — 서명 상태 5단계(미작성/서명대기/서명완료/만료/만료 임박).
         *   해당없음 행(도급직) 은 어느 상태값에도 매칭되지 않아 자동 제외. */
        { name: 'laborInfo', label: '근로 계약', options: SIGN_FILTER_OPTIONS.slice() },
        { name: 'wageInfo',  label: '임금 계약', options: SIGN_FILTER_OPTIONS.slice() },
      ],
      checkGroups: [
        /* 계약직 세부 — 근로 유형=계약직 선택 시만 활성 */
        { key: 'contractSubType', label: '계약직 세부', wide: false, items: [
          { value: 'chotak', label: '촉탁' },
          { value: 'intern', label: '인턴' },
        ]},
        /* 수습 — 근로 유형=정규직 한정 */
        { key: 'probation', label: '수습여부', wide: false, items: [
          { value: 'on', label: '수습 적용' },
        ]},
      ],
    });

    /* 기간 필드 — 컬럼 select 대신 정적 라벨('입사일')로 표시. 본 페이지는 입사일 단일 기준이므로
     *   select 불필요. App.Search 가 readParams 에서 [data-date-col] 을 optional chain 으로 읽으므로
     *   해당 select 제거해도 동작에 영향 없음. */
    searchHTML = searchHTML.replace(
      /<select class="select" data-date-col[\s\S]*?<\/select>/,
      '<span class="field__label">입사일</span>'
    );

    /* 임직원 관리 — 좌측 조직도 트리 + 우측 그리드 (page-hr-employee 의 split 레이아웃 패턴 재사용).
     *   좌측: 조직도 (부서 클릭 → 우측 필터) + [부서 관리] 모달 진입점
     *   우측: 검색 → 툴바 → 그리드 → 페이지네이션. 성명 클릭 시 detail pane(offcanvas) 우측 슬라이드 인. */
    pageEl.innerHTML = `
      <div class="split split--collapsible" id="empi-split" style="--split-left:280px;height:100%;">
        <aside class="split__left">
          <div class="split__head">
            <h3>조직도</h3>
            <div style="flex:1"></div>
            <button class="btn btn--sm" type="button" data-empi-dept-manage title="부서 관리">부서 관리</button>
            <button class="split__collapser" type="button" data-split-collapse="empi-split" title="조직도 접기">
              ${ICON_CHEVRON_L}
            </button>
          </div>
          <div class="split__body" style="display:flex;flex-direction:column;padding:0;">
            <div style="display:flex;align-items:center;padding:8px 12px;border-bottom:1px solid var(--color-divider);flex-shrink:0;background:var(--color-surface-alt);">
              <label class="chk" style="font-size:var(--fs-sm);margin:0;display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
                <input type="checkbox" id="empi-show-inactive" />
                <span>비활성화 부서 보기</span>
              </label>
            </div>
            <ul class="tree tree--selectable" id="empi-tree" style="flex:1;overflow:auto;padding:8px 10px;margin:0;"></ul>
          </div>
        </aside>
        <section class="split__right" style="min-width:0;overflow:hidden;">
          <div class="split__head">
            <button class="split__expander" type="button" data-split-expand="empi-split" title="조직도 펼치기">
              <span>조직도</span>${ICON_CHEVRON_R}
            </button>
            <h3 id="empi-dept-title" style="min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">전체</h3>
          </div>
          <div class="split__body" style="padding:0;overflow:hidden;display:flex;flex-direction:column;min-height:0;">
            ${searchHTML}

            <div class="toolbar">
              <div class="toolbar__left">
                <span class="toolbar__count">총 <span data-count><strong>0</strong>건</span></span>
                <span style="color:var(--color-text-muted);font-size:var(--fs-sm);" data-sel-count></span>
              </div>
              <div class="toolbar__right">
                <button class="btn btn--sm btn--primary" type="button" data-act="create">${window.Icons && window.Icons.plus || '+'} 임직원 등록</button>
                <span style="width:1px;height:20px;background:var(--color-border);margin:0 4px;"></span>
                <button class="btn btn--sm" type="button" data-act="org-download"><span style="display:inline-flex;align-items:center;gap:4px;">${(window.Icons && window.Icons.download) || ''}<span>조직도 다운로드</span></span></button>
                <button class="btn btn--sm" type="button" data-act="list-download"><span style="display:inline-flex;align-items:center;gap:4px;">${(window.Icons && window.Icons.download) || ''}<span>리스트 다운로드</span></span></button>
                <span style="width:1px;height:20px;background:var(--color-border);margin:0 4px;"></span>
                <button class="btn btn--sm" type="button" data-act="bulk-approve" disabled>승인</button>
                <button class="btn btn--sm btn--danger" type="button" data-act="delete" disabled>삭제</button>
                <!-- 모바일(≤768px) 전용 — 위 액션들을 케밥(⋮) 팝오버 하나로 대체 (CSS 로 표시 전환) -->
                <span class="dd dd--row empi-toolbar-more" data-dd>
                  <button class="btn--kebab" type="button" aria-label="더보기 액션">${window.Icons && window.Icons.moreVertical || '⋮'}</button>
                  <div class="dd__menu">
                    <button class="dd__item" type="button" data-act="create">임직원 등록</button>
                    <div class="dd__divider"></div>
                    <button class="dd__item" type="button" data-act="org-download">조직도 다운로드</button>
                    <button class="dd__item" type="button" data-act="list-download">리스트 다운로드</button>
                    <div class="dd__divider"></div>
                    <button class="dd__item" type="button" data-act="bulk-approve" disabled>승인</button>
                    <button class="dd__item dd__item--danger" type="button" data-act="delete" disabled>삭제</button>
                  </div>
                </span>
              </div>
            </div>

            <div class="grid-wrap" style="flex:1;min-height:0;">
              <div class="grid-scroll">
                <table class="tbl tbl--hover">
                  <thead>
                    <tr>
                      <th style="width:36px"><input type="checkbox" data-check-all /></th>
                      <th style="width:48px;text-align:center;">No</th>
                      <th>사번</th>
                      <th>성명</th>
                      <th style="width:96px;">근무지</th>
                      <th style="width:84px;text-align:center;">재직 상태</th>
                      <th style="width:84px;text-align:center;">계정 등록</th>
                      <th style="width:170px;text-align:center;">기능</th>
                      <th style="width:150px;text-align:center;">승인 상태</th>
                    </tr>
                  </thead>
                  <tbody id="empi-list-body"></tbody>
                </table>
              </div>
              <div class="pagination">
                <div class="pagination__info" id="empi-page-info"></div>
                <div class="pagination__right">
                  <div class="pagination__size">
                    <label>페이지당</label>
                    <select class="select" id="empi-page-size">
                      <option value="20">20</option>
                      <option value="40">40</option>
                      <option value="60">60</option>
                      <option value="80">80</option>
                      <option value="100">100</option>
                    </select>
                    <span>건</span>
                  </div>
                  <div class="pagination__list" id="empi-pagination"></div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

    `;
    renderTreeOnly();
    updateDeptTitle();
    bindMain(pageEl);
    applyEmpiMobileSplitState(pageEl);   /* 모바일 진입 시 조직도 자동 접힘(디폴트) */
  }

  /* 인사정보카드는 modal-empi-card(5탭 layer modal)로 통일됨 — 구 Drawer(oc-empi-card) /
   *   입사자 상세 패널(empi-detail-pane) 제거. 모달은 자체 핸들러로 갱신하므로 재렌더 훅 불요(no-op). */
  function refreshActiveCardView() {}

  function bindMain(pageEl) {
    /* ====== 좌측 조직도 트리 ====== */
    const splitRoot = pageEl.querySelector('#empi-split');
    /* split 접기/펼치기 */
    pageEl.addEventListener('click', (e) => {
      const collapseBtn = e.target.closest('[data-split-collapse="empi-split"]');
      if (collapseBtn && splitRoot) { splitRoot.classList.add('is-left-collapsed'); STATE.leftCollapsed = true; return; }
      const expandBtn = e.target.closest('[data-split-expand="empi-split"]');
      if (expandBtn && splitRoot) { splitRoot.classList.remove('is-left-collapsed'); STATE.leftCollapsed = false; return; }
    });
    /* 트리 노드 클릭 — 선택 + 부서 필터 + 그리드 재렌더 */
    const treeEl = pageEl.querySelector('#empi-tree');
    if (treeEl) {
      treeEl.addEventListener('click', (e) => {
        const li = e.target.closest('.tree__node');
        if (!li) return;
        if (e.target.closest('.tree__toggle') && !li.classList.contains('is-leaf')) {
          li.classList.toggle('is-open');
          return;
        }
        STATE.selectedDeptId = li.dataset.id;
        STATE.page = 1;
        STATE.selectedIds.clear();
        renderTreeOnly();
        updateDeptTitle();
        applyFilter();
        renderTable();
        /* 모바일 — 부서 선택 후 조직도(드로어) 자동 닫기 */
        if (empiIsMobileWidth() && splitRoot) {
          splitRoot.classList.add('is-left-collapsed');
          STATE.leftCollapsed = true;
        }
      });
    }
    /* 모바일 — 조직도 드로어가 열려있을 때 우측(그리드/딤) 클릭 시 닫기.
     *   capture 단계에서 받아 그리드 클릭 핸들러보다 먼저 처리. 펼치기 버튼 클릭은 통과. */
    const rightSection = pageEl.querySelector('#empi-split .split__right');
    if (rightSection) {
      rightSection.addEventListener('click', (e) => {
        if (!empiIsMobileWidth() || !splitRoot) return;
        if (splitRoot.classList.contains('is-left-collapsed')) return;
        if (e.target.closest('[data-split-expand="empi-split"]')) return;
        splitRoot.classList.add('is-left-collapsed');
        STATE.leftCollapsed = true;
        e.stopPropagation();
      }, true);
    }
    /* 비활성화 부서 보기 토글 */
    const inactiveCb = pageEl.querySelector('#empi-show-inactive');
    if (inactiveCb) {
      inactiveCb.addEventListener('change', (e) => {
        STATE.showInactive = e.target.checked;
        renderTreeOnly();
      });
    }
    /* 부서 관리 버튼 — 임직원 현황(page-hr-employee) 의 공유 모달 호출.
       모달 종료 시 DEPTS sync + 트리·그리드 재렌더로 변경 즉시 반영. */
    const deptMgrBtn = pageEl.querySelector('[data-empi-dept-manage]');
    if (deptMgrBtn) {
      deptMgrBtn.addEventListener('click', () => {
        const api = window.App && App.HrDeptManage;
        if (!api || typeof api.open !== 'function') {
          window.toast && window.toast('부서 관리 모달을 불러올 수 없습니다.', 'danger');
          return;
        }
        api.open({
          onClose: () => {
            syncDeptsFromShared();
            /* 선택된 부서가 삭제됐을 가능성 — 없는 id 면 루트로 복귀 */
            if (!findDept(STATE.selectedDeptId)) STATE.selectedDeptId = 'C0';
            renderTreeOnly();
            updateDeptTitle();
            applyFilter();
            renderTable();
          },
        });
      });
    }

    /* ====== 우측 검색·툴바·그리드 ====== */
    const searchRoot = pageEl.querySelector('[data-search]');
    const onSearch = (params) => {
      STATE.filter = params;
      STATE.page = 1;
      STATE.selectedIds.clear();
      applyFilter();
      renderTable();
    };
    App.Search.attach(searchRoot, onSearch);

    /* 이 페이지는 기간 필터 기본값 없음 — attach 가 m1 을 강제 적용하므로 즉시 제거 */
    setupNoDefaultRange(searchRoot, onSearch);

    /* 고용 형태 ↔ 계약직 세부 연동 — 정규직/일용직 선택 시 촉탁·인턴 체크박스 숨김.
     *   숨길 때 체크 상태도 초기화하여 필터에 잔류하지 않도록 함. */
    bindEmpTypeSubLink(searchRoot, onSearch);

    /* 상세 검색 — 고용 형태(계약직/일용직) 선택 시 수습 필터 비활성 */
    setupProbationGate(searchRoot, onSearch);

    pageEl.addEventListener('click', (e) => {
      /* 툴바 액션 — 인사정보 관리: 개별 등록 / 엑셀 다운로드 / 이메일 발송 / 삭제 */
      const tb = e.target.closest('.toolbar [data-act]');
      if (tb && !tb.disabled) {
        const act = tb.dataset.act;
        if (act === 'create')               openCreateModal();
        else if (act === 'org-download')    doOrgChartDownload();
        else if (act === 'list-download')   doExcelDownload();
        else if (act === 'bulk-approve')    doApproveBulk(getSelectedRows());
        else if (act === 'delete')          doDeleteBulk(getSelectedRows());
        return;
      }
    });

    $('[data-check-all]', pageEl).addEventListener('change', (e) => {
      const checked = e.target.checked;
      const pageRows = getPageRows();
      pageRows.forEach(r => {
        if (checked) STATE.selectedIds.add(r.id); else STATE.selectedIds.delete(r.id);
      });
      renderTable();
    });

    $('#empi-list-body', pageEl).addEventListener('change', (e) => {
      const cb = e.target.closest('input[type="checkbox"]');
      if (!cb) return;
      const tr = cb.closest('[data-emp-row]');
      if (!tr) return;
      const id = tr.dataset.empRow;
      if (cb.checked) STATE.selectedIds.add(id);
      else STATE.selectedIds.delete(id);
      tr.classList.toggle('is-selected', cb.checked);
      updateActionButtons();
    });

    $('#empi-list-body', pageEl).addEventListener('click', (e) => {
      // 행 단위 인라인 액션 — 계정 등록(재발송/재발송 이력/검토) · 승인 상태(승인/반려)
      const actBtn = e.target.closest('[data-row-act]');
      if (actBtn) {
        e.preventDefault();
        e.stopPropagation();
        const tr = actBtn.closest('[data-emp-row]');
        if (!tr) return;
        const emp = STATE.rows.find(r => r.id === tr.dataset.empRow);
        if (!emp) return;
        const act = actBtn.dataset.rowAct;
        if (act === 'resend') {
          openResendModal(emp);
        } else if (act === 'resend-hist') {
          openResendHistModal(emp);
        } else if (act === 'review') {
          openCardModal(emp);            // 등록 정보 검토 — 인사정보카드 열기
        } else if (act === 'approve') {
          doApproveAccount(emp);
        } else if (act === 'reject') {
          doRejectAccount(emp);
        } else if (act === 'sms-send') {
          if (!(emp.phone || '').trim()) {
            window.toast && window.toast('등록된 휴대전화 번호가 없습니다.', 'warning');
            return;
          }
          openSmsModal([emp]);
        }
        return;
      }
      // 성명/사번 클릭 — 신규 인사정보카드 모달 (기존 OC drawer 와 병행, 트리거만 교체)
      const link = e.target.closest('[data-emp-card-link]');
      if (!link) return;
      e.preventDefault();
      const tr = link.closest('[data-emp-row]');
      if (!tr) return;
      const emp = STATE.rows.find(r => r.id === tr.dataset.empRow);
      if (emp) openCardModal(emp);
    });

    $('#empi-pagination', pageEl).addEventListener('click', (e) => {
      const btn = e.target.closest('.pagination__btn');
      if (!btn || btn.disabled) return;
      const p = Number(btn.dataset.page);
      if (!Number.isFinite(p)) return;
      STATE.page = p;
      renderTable();
    });
    $('#empi-page-size', pageEl).addEventListener('change', (e) => {
      STATE.pageSize = Number(e.target.value);
      STATE.page = 1;
      renderTable();
    });
  }

  /* 기간 필터 기본값 제거 + 'type=date' 인풋에 '기간 입력' placeholder 부여
   *   - type='text' 일 때 placeholder 가 보이고, 포커스 시 type='date' 로 전환되어 달력 UI 사용
   *   - 값이 비어있는 상태로 블러되면 다시 type='text' 로 복귀 */
  function setupNoDefaultRange(searchRoot, onSearch) {
    if (!searchRoot) return;
    const fromEl = searchRoot.querySelector('[data-from]');
    const toEl   = searchRoot.querySelector('[data-to]');
    if (!fromEl || !toEl) return;

    const reset = () => {
      [fromEl, toEl].forEach(el => {
        el.value = '';
        el.type = 'text';
        el.placeholder = '기간 입력';
      });
      searchRoot.querySelectorAll('[data-quick]').forEach(b => b.classList.remove('is-active'));
    };
    reset();

    [fromEl, toEl].forEach(el => {
      el.addEventListener('focus', () => { el.type = 'date'; });
      el.addEventListener('blur',  () => { if (!el.value) { el.type = 'text'; el.placeholder = '기간 입력'; } });
    });

    /* [초기화] 버튼이 m1 으로 되돌리므로, reset 후 다시 우리 기본(빈 값)으로 복귀 */
    const resetBtn = searchRoot.querySelector('[data-reset]');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => { setTimeout(() => { reset(); onSearch && onSearch(App.Search.readParams(searchRoot)); }, 0); });
    }

    /* m1 으로 한번 필터된 상태를 비워서 다시 조회 */
    onSearch && onSearch(App.Search.readParams(searchRoot));
  }

  /* 고용 형태 select 와 계약직 세부 체크박스 행의 연동
   *   - empType = 'regular' (정규직) | 'daily' (일용직) → 계약직 세부 체크박스 행 숨김 + 체크 해제
   *   - empType = '' (전체) | 'contract' (계약직) → 표시 */
  function bindEmpTypeSubLink(searchRoot, onSearch) {
    if (!searchRoot) return;
    const empTypeSel = searchRoot.querySelector('[data-name="empType"]');
    const firstSubCheck = searchRoot.querySelector('[data-check="contractSubType"]');
    const subRow = firstSubCheck ? firstSubCheck.closest('.search__adv-field') : null;
    if (!empTypeSel || !subRow) return;

    function apply() {
      const v = empTypeSel.value;
      const hide = (v === 'regular' || v === 'daily');
      subRow.style.display = hide ? 'none' : '';
      if (hide) {
        /* 체크 해제 + 필터 즉시 재조회 (잔류 필터 제거) */
        let anyChecked = false;
        searchRoot.querySelectorAll('[data-check="contractSubType"]').forEach(cb => {
          if (cb.checked) { cb.checked = false; anyChecked = true; }
        });
        if (anyChecked) onSearch && onSearch(App.Search.readParams(searchRoot));
      }
    }
    empTypeSel.addEventListener('change', apply);
    apply();  // 초기 1회 적용
  }

  /* 상세검색 — 고용 형태이 계약직/일용직이면 수습 체크박스 행 자체를 숨김.
   *  수습은 정규직 전용 개념이므로 잘못된 조합 입력 자체를 막는다 */
  function setupProbationGate(searchRoot, onSearch) {
    if (!searchRoot) return;
    const empTypeSel = searchRoot.querySelector('.search__advanced [data-name="empType"]');
    const firstProbCb = searchRoot.querySelector('.search__advanced [data-check="probation"]');
    const probRow = firstProbCb ? firstProbCb.closest('.search__adv-field') : null;
    if (!empTypeSel || !probRow) return;
    const sync = () => {
      const v = empTypeSel.value;
      const hide = (v === 'contract' || v === 'daily');
      probRow.style.display = hide ? 'none' : '';
      if (hide) {
        let anyChecked = false;
        searchRoot.querySelectorAll('[data-check="probation"]').forEach(cb => {
          if (cb.checked) { cb.checked = false; anyChecked = true; }
        });
        if (anyChecked && onSearch) onSearch(App.Search.readParams(searchRoot));
      }
    };
    empTypeSel.addEventListener('change', sync);
    sync();
  }

  function getPageRows() {
    const start = (STATE.page - 1) * STATE.pageSize;
    return STATE.filtered.slice(start, start + STATE.pageSize);
  }
  function getSelectedRows() {
    return STATE.rows.filter(r => STATE.selectedIds.has(r.id));
  }

  function renderTable() {
    const total = STATE.filtered.length;
    const rows = getPageRows();
    const body = $('#empi-list-body');
    if (!body) return;

    /* No — 도메인 표준: 내림차순(N→1). 첫 행이 총 건수, 페이지를 넘겨도 전체 기준 연속 */
    const startIdx = (STATE.page - 1) * STATE.pageSize;
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--color-text-muted);padding:32px 0;">조회 결과가 없습니다.</td></tr>`;
    } else {
      body.innerHTML = rows.map((r, i) => {
        return `
          <tr data-emp-row="${esc(r.id)}" class="${STATE.selectedIds.has(r.id) ? 'is-selected' : ''}">
            <td><input type="checkbox" ${STATE.selectedIds.has(r.id) ? 'checked' : ''} /></td>
            <td style="text-align:center;color:var(--color-text-muted);">${total - (startIdx + i)}</td>
            <td><a href="#" data-emp-card-link class="link-code">${esc(r.id)}</a></td>
            <td>${nameCellHTML(r)}</td>
            <td style="white-space:nowrap;">${nz(r.site)}</td>
            <td style="text-align:center;">${employmentStatusPill(r)}</td>
            <td style="text-align:center;">${acctRegCellHTML(r)}</td>
            <td style="text-align:center;">${acctActionCellHTML(r)}</td>
            <td style="text-align:center;">${approvalCellHTML(r)}</td>
          </tr>
        `;
      }).join('');
    }

    /* 셀렉터 페이지 스코프 — 입사자 관리 1 의 동일 [data-count] 와 충돌 방지 */
    const pageEl = document.getElementById('page-hr-info-mgmt');
    const cnt = pageEl && pageEl.querySelector('[data-count]');
    if (cnt) cnt.innerHTML = `<strong>${total.toLocaleString()}</strong>건`;
    const selCnt = pageEl && pageEl.querySelector('[data-sel-count]');
    if (selCnt) selCnt.textContent = STATE.selectedIds.size > 0 ? ` · 선택 ${STATE.selectedIds.size}건` : '';

    const size = STATE.pageSize;
    const totalPages = Math.max(1, Math.ceil(total / size));
    if (STATE.page > totalPages) STATE.page = totalPages;
    const start = (STATE.page - 1) * size;
    $('#empi-page-info').textContent = total === 0
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
    $('#empi-pagination').innerHTML = btns.join('');

    const sel = $('#empi-page-size');
    if (sel) sel.value = String(STATE.pageSize);

    const all = pageEl && pageEl.querySelector('[data-check-all]');
    if (all) all.checked = rows.length > 0 && rows.every(r => STATE.selectedIds.has(r.id));

    updateActionButtons();
  }

  /* 삭제 정책 (v4) ====================================================
   *   · 종료 라이프사이클(contractExpired / retired) — 삭제 가능 (흔적 보존 불필요)
   *   · 입사확정(completed) — 본 화면에서 삭제 불가. [퇴사 처리] 후 삭제 (별도 화면: 인사 관리)
   *   · 온보딩(계정 등록 승인 워크플로) 진행 중(registered / inProgress) —
   *       승인 '반려'(rejected) 건만 삭제 가능.
   *       승인 전(none) / 승인 대기(pending) / 승인완료(approved) 는 삭제 불가 (진행 중 데이터 보호). */
  function isDeletable(r) {
    if (r.status === 'contractExpired' || r.status === 'retired') return true;
    if (r.status === 'completed') return false;
    return r.approval === 'rejected';   // 온보딩 진행 중 — 반려 건만 삭제 가능
  }
  /* 삭제 불가 사유 (blocked 안내 문구용) */
  function deleteBlockReason(r) {
    if (r.status === 'completed') return '입사확정 — 퇴사 처리 후 삭제 가능';
    const ap = { none: '승인 전', pending: '승인 대기', approved: '승인완료' }[r.approval] || '승인 전';
    return `${ap} — 반려 건만 삭제 가능`;
  }

  /* ============ 계정 등록 안내 재발송 / 승인 워크플로 ============ */
  /* 재발송 — 사유 입력 모달 → (전송) → '휴대폰 번호로 전송됩니다' alert + 이력 기록.
   *   사유 조회는 [재발송 이력] 모달에서만 가능. */
  function openResendModal(emp) {
    if (!emp) return;
    /* 재발송 정책 게이트 — 하루 2회 + 5분 쿨다운. 불가 시 모달을 열지 않고 토스트 안내 */
    const gate = resendGate(emp);
    if (!gate.ok) { window.toast && window.toast(gate.msg, 'warning'); return; }
    const bd = _buildResendModal();
    bd.querySelector('[data-rs-name]').textContent = displayName(emp);
    bd.querySelector('[data-rs-phone]').textContent = emp.phone || '(휴대폰 번호 없음)';
    const ta = bd.querySelector('[data-rs-reason]');
    const errEl = bd.querySelector('[data-rs-error]');
    ta.value = '';
    errEl.style.display = 'none';
    ta.classList.remove('is-invalid');
    ta.oninput = () => { if (ta.value.trim()) { ta.classList.remove('is-invalid'); errEl.style.display = 'none'; } };

    function close() {
      bd.classList.remove('is-open');
      bd.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    }
    function submit() {
      const reason = ta.value.trim();
      if (!reason) {
        ta.classList.add('is-invalid');
        errEl.style.display = 'block';
        ta.focus();
        return;
      }
      emp.resendHistory = emp.resendHistory || [];
      emp.resendHistory.unshift({ at: nowStamp(), ts: Date.now(), reason, by: '정혜진' });
      /* 새 초대 링크 재발송 — 반려(등록실패) 상태였다면 등록대기로 복귀 (재등록 기회 부여) */
      if (emp.approval === 'rejected') emp.approval = 'none';
      close();
      /* 버튼 상태(한도 소진/툴팁) 즉시 갱신 */
      applyFilter();
      renderTable();
      /* 발송 결과 — 휴대폰 번호로 전송 안내 alert */
      if (window.App && typeof App.sweetAlert === 'function') {
        App.sweetAlert({
          icon: 'success',
          title: '재발송 완료',
          message: `${displayName(emp)} 님에게 등록된 휴대폰 번호(${emp.phone || '-'})로 전송됩니다.`,
        });
      } else {
        window.alert('등록된 휴대폰 번호로 전송됩니다.');
      }
    }
    function onClick(e) {
      if (e.target === bd) { close(); return; }
      if (e.target.closest('[data-rs-close], [data-rs-cancel]')) { close(); return; }
      if (e.target.closest('[data-rs-submit]')) { submit(); return; }
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    bd.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    bd.classList.add('is-open');
    setTimeout(() => ta.focus(), 30);
  }

  /* 재발송 이력 모달 — 사유·일시·발송자 목록 (사유 조회는 여기서만) */
  function openResendHistModal(emp) {
    if (!emp) return;
    const bd = _buildResendHistModal();
    bd.querySelector('[data-rh-name]').textContent = displayName(emp);
    const list = (emp.resendHistory || []);
    const body = bd.querySelector('[data-rh-body]');
    body.innerHTML = list.length
      ? list.map(h => `
          <tr>
            <td style="text-align:center;white-space:nowrap;">${esc(h.at || '-')}</td>
            <td>${esc(h.reason || '-')}</td>
            <td style="text-align:center;white-space:nowrap;">${esc(h.by || '-')}</td>
          </tr>`).join('')
      : `<tr><td colspan="3" style="text-align:center;color:var(--color-text-muted);padding:24px 0;">재발송 이력이 없습니다.</td></tr>`;

    function close() {
      bd.classList.remove('is-open');
      bd.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    }
    function onClick(e) {
      if (e.target === bd) { close(); return; }
      if (e.target.closest('[data-rh-close]')) { close(); return; }
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    bd.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    bd.classList.add('is-open');
  }

  /* 대상자 컨텍스트 칩 — 확인 모달 제목 아래 '사번 · 부서 · 직위' 를 pill 로 노출 (누구를 처리하는지 즉시 인지) */
  function acctConfirmContextHTML(emp) {
    const sep = ` <span style="color:var(--color-divider);">·</span> `;
    const parts = [
      `<span style="color:var(--color-text);font-weight:var(--fw-medium);">${esc(emp.id)}</span>`,
      emp.dept ? esc(emp.dept) : '',
      emp.rank ? esc(emp.rank) : '',
    ].filter(Boolean);
    return `<span style="display:inline-flex;align-items:center;flex-wrap:wrap;justify-content:center;gap:2px 4px;padding:5px 12px;background:var(--color-surface-alt);border-radius:var(--radius-pill);font-size:var(--fs-sm);color:var(--color-text-sub);">${parts.join(sep)}</span>`;
  }
  /* 승인 — 계정 등록완료 건을 승인 처리 */
  function doApproveAccount(emp, opts) {
    if (!emp) return;
    opts = opts || {};
    const run = () => {
      emp.approval = 'approved';
      applyFilter();
      renderTable();
      if (opts.fromCard) closeModal('modal-empi-card');   // 카드에서 승인 시 카드 닫기
      window.toast && window.toast(`${displayName(emp)} 님의 계정 등록을 승인했습니다.`, 'success');
    };
    /* 카드 검토 승인 — 누락/미완료 항목이 있으면 확인 문구로 한 번 더 안내(승인 자체는 허용) */
    const miss = opts.fromCard ? cardReviewMissingCount(emp) : 0;
    const bodyText = miss > 0
      ? `누락되었거나 미완료된 항목이 ${miss}건 있습니다.\n그래도 승인하면 계정 등록이 완료되며, ERP에 로그인할 수 있습니다.`
      : '승인하면 계정 등록이 완료되며, ERP에 로그인할 수 있습니다.';
    openAcctConfirm({
      icon: miss > 0 ? 'warning' : 'success',
      titleHTML: `<strong style="color:var(--color-brand-primary);">${esc(displayName(emp))}</strong>님의 계정 등록을 승인하시겠습니까?`,
      contextHTML: acctConfirmContextHTML(emp),
      bodyText, confirmText: '승인', onConfirm: run,
    });
  }
  /* 반려 — 계정 등록 요청 반려. 반려 시 approval=rejected + '등록대기' 복귀 →
   *   기능 컬럼에 [재발송]·[재발송 이력] 재노출(새 초대 링크). 반려 건은 삭제 가능. */
  function doRejectAccount(emp, opts) {
    if (!emp) return;
    opts = opts || {};
    const run = (reason) => {
      emp.approval = 'rejected';
      emp.acctReg = 'waiting';
      emp.rejectReason = reason || '';   // 반려 사유 기록 (재발송 시 참고)
      applyFilter();
      renderTable();
      if (opts.fromCard) closeModal('modal-empi-card');   // 카드에서 반려 시 카드 닫기
      window.toast && window.toast(`${displayName(emp)} 님의 계정 등록을 반려했습니다.`, 'success');
    };
    openAcctConfirm({
      icon: 'warning',
      titleHTML: `<strong style="color:var(--color-brand-primary);">${esc(displayName(emp))}</strong>님의 계정 등록 요청을 반려하시겠습니까?`,
      contextHTML: acctConfirmContextHTML(emp),
      bodyText: '반려하면 계정 등록이 완료되지 않습니다.\n필요한 경우 새 초대 링크를 다시 발송할 수 있으며,\n반려된 요청은 목록에서 삭제할 수 있습니다.',
      reason: { required: true, label: '반려 사유', placeholder: '반려 사유를 입력해 주세요 (예: 계좌번호 형식 오류)', errorText: '반려 사유를 입력해 주세요.' },
      confirmText: '반려', danger: true, onConfirm: run,
    });
  }
  /* 일괄 승인 — 툴바 [승인]. 선택 행 중 '등록완료 + 승인 대기' 건만 승인 처리. */
  function doApproveBulk(targets) {
    const list = (targets || []).filter(r => r.acctReg === 'done' && r.approval === 'pending');
    if (!list.length) {
      window.toast && window.toast('승인 대기 상태의 선택 건이 없습니다.', 'warning');
      return;
    }
    const head = list.length === 1
      ? `${esc(displayName(list[0]))} (${esc(list[0].id)})`
      : `${esc(displayName(list[0]))} 외 ${list.length - 1}명`;
    const run = () => {
      list.forEach(r => { r.approval = 'approved'; });
      applyFilter();
      renderTable();
      window.toast && window.toast(`${list.length}건 승인 완료`, 'success');
    };
    openAcctConfirm({
      icon: 'success',
      titleHTML: `선택한 <strong style="color:var(--color-brand-primary);">${list.length}명</strong>의 계정 등록을 승인하시겠습니까?`,
      contextHTML: `<span style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;background:var(--color-surface-alt);border-radius:var(--radius-pill);font-size:var(--fs-sm);color:var(--color-text-sub);">${head}</span>`,
      bodyText: '승인하면 선택한 대상의 계정 등록이 완료되며, ERP에 로그인할 수 있습니다.',
      confirmText: `${list.length}건 승인`, onConfirm: run,
    });
  }

  /* ============ 계정 승인/반려 확인 모달 (sweet 스타일 — 아이콘 + 중앙 정렬) ============
   *   UI Kit 의 .sweet-icon / .sweet-body 컴포넌트를 조합. 신규 클래스 없음. */
  let _acctConfirmEl = null;
  function _buildAcctConfirmModal() {
    if (_acctConfirmEl) return _acctConfirmEl;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="modal-backdrop" data-acct-confirm-host style="z-index:1160;">
        <div class="modal" style="max-width:420px;">
          <div class="modal__body" style="padding:28px 24px 8px;text-align:center;">
            <div class="sweet-icon" data-ac-icon style="margin:0 auto;"></div>
            <div class="sweet-body">
              <div class="sweet-body__title" data-ac-title style="line-height:1.45;"></div>
              <div data-ac-context style="margin:12px 0 2px;"></div>
              <div class="sweet-body__text" data-ac-text style="white-space:pre-line;line-height:1.6;margin-top:10px;"></div>
              <div data-ac-reason style="display:none;text-align:left;margin-top:16px;">
                <label class="form-label" data-ac-reason-label style="display:block;margin-bottom:6px;"></label>
                <textarea class="input" data-ac-reason-input rows="2" style="width:100%;height:52px;min-height:52px;resize:vertical;"></textarea>
                <div class="field-error" data-ac-reason-error style="display:none;"></div>
              </div>
            </div>
          </div>
          <div class="modal__footer" style="justify-content:center;gap:8px;padding-bottom:22px;">
            <button class="btn" type="button" data-ac-cancel style="min-width:84px;">취소</button>
            <button class="btn btn--primary" type="button" data-ac-confirm style="min-width:84px;">확인</button>
          </div>
        </div>
      </div>`;
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    _acctConfirmEl = document.querySelector('[data-acct-confirm-host]');
    return _acctConfirmEl;
  }
  const _ACCT_GLYPH = { success: '✓', warning: '!', danger: '✕', info: 'i', question: '?' };
  function openAcctConfirm(opts) {
    opts = opts || {};
    const bd = _buildAcctConfirmModal();
    const icon = opts.icon || (opts.danger ? 'warning' : 'success');
    const iconEl = bd.querySelector('[data-ac-icon]');
    iconEl.className = 'sweet-icon sweet-icon--' + icon;
    iconEl.textContent = _ACCT_GLYPH[icon] || 'i';
    bd.querySelector('[data-ac-title]').innerHTML = opts.titleHTML || '';
    const ctxEl = bd.querySelector('[data-ac-context]');
    ctxEl.innerHTML = opts.contextHTML || '';
    ctxEl.style.display = opts.contextHTML ? '' : 'none';
    bd.querySelector('[data-ac-text]').textContent = opts.bodyText || '';
    const confirmBtn = bd.querySelector('[data-ac-confirm]');
    confirmBtn.textContent = opts.confirmText || '확인';
    confirmBtn.className = 'btn ' + (opts.danger ? 'btn--danger' : 'btn--primary');
    bd.querySelector('[data-ac-cancel]').textContent = opts.cancelText || '취소';

    /* 사유 입력 — opts.reason 이 있으면 textarea 노출(필드 검증은 인라인 .field-error 로).
     *   opts.reason = { required, label, placeholder, errorText } */
    const reasonWrap  = bd.querySelector('[data-ac-reason]');
    const reasonInput = bd.querySelector('[data-ac-reason-input]');
    const reasonError = bd.querySelector('[data-ac-reason-error]');
    const reasonLabel = bd.querySelector('[data-ac-reason-label]');
    if (opts.reason) {
      const req = opts.reason.required !== false;
      reasonWrap.style.display = '';
      reasonInput.value = '';
      reasonInput.placeholder = opts.reason.placeholder || '';
      reasonInput.classList.remove('is-invalid');
      reasonLabel.innerHTML = (req ? '<em style="color:var(--color-danger);">*</em> ' : '') + esc(opts.reason.label || '사유');
      reasonError.textContent = opts.reason.errorText || '사유를 입력해 주세요.';
      reasonError.style.display = 'none';
      reasonInput.oninput = () => { reasonInput.classList.remove('is-invalid'); reasonError.style.display = 'none'; };
    } else {
      reasonWrap.style.display = 'none';
    }

    function close() {
      bd.classList.remove('is-open');
      bd.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    }
    function onClick(e) {
      if (e.target === bd) { close(); return; }
      if (e.target.closest('[data-ac-cancel]')) { close(); return; }
      if (e.target.closest('[data-ac-confirm]')) {
        let reasonVal;
        if (opts.reason) {
          reasonVal = (reasonInput.value || '').trim();
          if (opts.reason.required !== false && !reasonVal) {
            /* 필드 검증 실패 — 토스트가 아닌 인라인 안내(도메인 표준) */
            reasonInput.classList.add('is-invalid');
            reasonError.style.display = '';
            reasonInput.focus();
            return;   // 모달 닫지 않음
          }
        }
        close();
        if (typeof opts.onConfirm === 'function') opts.onConfirm(reasonVal);
      }
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    bd.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    bd.classList.add('is-open');
  }

  /* 재발송 사유 입력 모달 DOM — 최초 1회 생성 후 재사용 */
  let _resendModalEl = null;
  function _buildResendModal() {
    if (_resendModalEl) return _resendModalEl;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="modal-backdrop" data-resend-modal-host style="z-index:1150;">
        <div class="modal" style="max-width:460px;">
          <div class="modal__header">
            <h3 class="modal__title">계정 등록 안내 재발송</h3>
            <button class="modal__close" type="button" data-rs-close aria-label="닫기">&times;</button>
          </div>
          <div class="modal__body">
            <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;color:var(--color-text-sub);font-size:var(--fs-sm);">
              <div><span style="color:var(--color-text-muted);">대상</span> &nbsp;<strong data-rs-name style="color:var(--color-text);"></strong></div>
              <div><span style="color:var(--color-text-muted);">휴대폰</span> &nbsp;<span data-rs-phone></span></div>
            </div>
            <label class="form-label"><em style="color:var(--color-danger);">*</em> 재발송 사유</label>
            <textarea class="input" data-rs-reason rows="3" style="width:100%;resize:vertical;" placeholder="재발송 사유를 입력해 주세요"></textarea>
            <div class="field-error" data-rs-error style="display:none;">재발송 사유를 입력해 주세요.</div>
            <p class="form-help" style="margin-top:8px;">전송 시 대상자의 등록된 휴대폰 번호로 안내가 발송됩니다.</p>
          </div>
          <div class="modal__footer">
            <button class="btn" type="button" data-rs-cancel>취소</button>
            <button class="btn btn--primary" type="button" data-rs-submit>전송</button>
          </div>
        </div>
      </div>`;
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    _resendModalEl = document.querySelector('[data-resend-modal-host]');
    return _resendModalEl;
  }
  /* 재발송 이력 모달 DOM — 최초 1회 생성 후 재사용 */
  let _resendHistModalEl = null;
  function _buildResendHistModal() {
    if (_resendHistModalEl) return _resendHistModalEl;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="modal-backdrop" data-resend-hist-host style="z-index:1150;">
        <div class="modal" style="max-width:560px;">
          <div class="modal__header">
            <h3 class="modal__title">재발송 이력 — <span data-rh-name></span></h3>
            <button class="modal__close" type="button" data-rh-close aria-label="닫기">&times;</button>
          </div>
          <div class="modal__body">
            <table class="tbl">
              <thead>
                <tr>
                  <th style="width:150px;text-align:center;">일시</th>
                  <th>사유</th>
                  <th style="width:90px;text-align:center;">발송자</th>
                </tr>
              </thead>
              <tbody data-rh-body></tbody>
            </table>
          </div>
          <div class="modal__footer">
            <button class="btn btn--primary" type="button" data-rh-close>확인</button>
          </div>
        </div>
      </div>`;
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    _resendHistModalEl = document.querySelector('[data-resend-hist-host]');
    return _resendHistModalEl;
  }
  /* 현재 시각 스탬프 'YY/MM/DD   HH:MM' (SWADPIA §2 일시 표기) — 재발송 이력 기록용 */
  function nowStamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${String(d.getFullYear()).slice(-2)}/${p(d.getMonth() + 1)}/${p(d.getDate())}   ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function updateActionButtons() {
    const sel = getSelectedRows();
    const has = sel.length > 0;
    const allDeletable = has && sel.every(isDeletable);
    /* 승인 — 계정 등록완료 + 승인 대기(pending) 행이 1건 이상 선택되면 활성 (일괄 승인) */
    const anyApprovable = has && sel.some(r => r.acctReg === 'done' && r.approval === 'pending');

    const pageEl = document.getElementById('page-hr-info-mgmt');
    /* 데스크탑 인라인 버튼 + 모바일 케밥 메뉴 항목 모두 동일 data-act 를 가지므로 전부 동기화 */
    const setDisabled = (act, off) => {
      pageEl && pageEl.querySelectorAll(`.toolbar [data-act="${act}"]`).forEach(el => { el.disabled = off; });
    };
    setDisabled('bulk-approve', !anyApprovable);
    setDisabled('delete',       !allDeletable);

    /* 선택 카운트 — 체크 시 즉시 반영되도록 renderTable 외부에서도 갱신 */
    const selCnt = pageEl && pageEl.querySelector('[data-sel-count]');
    if (selCnt) selCnt.textContent = has ? ` · 선택 ${sel.length}건` : '';
  }

  /* ============ 이메일 발송 / 재발송 ============ */
  function doMailSend(isResend) {
    const sel = getSelectedRows();
    if (!sel.length) return;
    openMailModal(sel, isResend);
  }
  /* 재발송 쿨다운 — 발송일(sentDate)이 오늘이면 24시간 미경과로 간주.
   *   대상 중 단 한 명이라도 오늘 발송된 행이 있으면 안내 후 차단. */
  function isMailResendBlocked(targets) {
    const today = new Date().toISOString().slice(0, 10);
    return targets.some(r => r.sentDate && r.sentDate >= today);
  }
  function openMailModal(targets, isResend) {
    if (isResend && isMailResendBlocked(targets)) {
      window.toast && window.toast('하루 후에 재발송 가능합니다.', 'warning');
      return;
    }
    STATE._mailTargets = targets;
    STATE._mailIsResend = !!isResend;
    $('#empi-mail-title').textContent = isResend ? '이메일 재발송' : '이메일 발송';
    $('#empi-mail-target').textContent = targets.length === 1
      ? `${displayName(targets[0])} (${targets[0].email})`
      : `${displayName(targets[0])} 외 ${targets.length - 1}명`;
    $('#empi-mail-days').value = 7;
    openModal('modal-empi-mail');
  }
  function bindMailModal() {
    const modal = document.getElementById('modal-empi-mail');
    if (!modal) return;
    modal.querySelector('[data-empi-mail-submit]').addEventListener('click', () => {
      const days = Math.max(1, Math.min(30, Number(modal.querySelector('#empi-mail-days').value) || 7));
      const today = new Date().toISOString().slice(0, 10);
      const sel = STATE._mailTargets || [];
      let fail = 0;
      sel.forEach((r, i) => {
        r.emailSentDate = today;
        r.sentDate = today;
        if (i % 10 === 9) {
          r.mailFailCode = 'badEmail';
          fail++;
        } else {
          r.mailFailCode = '';
        }
        normalizeStatus(r);
      });
      STATE.selectedIds.clear();
      applyFilter();
      renderTable();
      closeAllModals();
      window.toast && window.toast(
        `${STATE._mailIsResend ? '재발송' : '발송'} 완료 (유효 ${days}일) — 성공 ${sel.length - fail}건${fail ? ` / 실패 ${fail}건` : ''}`,
        fail ? 'warning' : 'success'
      );
    });
  }

  /* ============ 문자(SMS) 발송 ============
   *   UI Kit 「문자 발송」 패턴(폼 + 변수 chip) 재사용 — 수신자 / 템플릿 / 내용 / 단축어 chip.
   *   휴대전화 번호가 등록된 선택 행만 대상으로 한다. */
  const SMS_TEMPLATES = {
    'info-request': `안녕하세요 {name}님, (주)성원애드피아입니다.\n입사 인사정보 등록 안내드립니다.\n아래 링크에서 본인 정보를 입력해 주세요.\n{link}`,
    'welcome':      `{name}님, (주)성원애드피아 입사를 환영합니다.\n입사일 관련 안내는 담당자가 별도로 연락드릴 예정입니다.`,
    'notice':       `안녕하세요 {name}님, 인사팀입니다.\n전달드릴 안내 사항이 있어 연락드립니다.`,
  };
  function doSmsSend() {
    const sel = getSelectedRows().filter(r => (r.phone || '').trim());
    if (!sel.length) {
      window.toast && window.toast('휴대전화 번호가 등록된 대상이 없습니다.', 'warning');
      return;
    }
    openSmsModal(sel);
  }
  function openSmsModal(targets) {
    injectSmsModal();
    bindSmsModal();
    STATE._smsTargets = targets;
    const t = document.getElementById('empi-sms-target');
    if (t) t.textContent = targets.length === 1
      ? `${displayName(targets[0])} (${targets[0].phone})`
      : `${displayName(targets[0])} 외 ${targets.length - 1}명`;
    const tplSel = document.getElementById('empi-sms-template');
    const body   = document.getElementById('empi-sms-body');
    if (tplSel) tplSel.value = 'info-request';
    if (body)   body.value = SMS_TEMPLATES['info-request'];
    updateSmsCounter();
    openModal('modal-empi-sms');
  }
  function updateSmsCounter() {
    const body = document.getElementById('empi-sms-body');
    const cnt  = document.getElementById('empi-sms-count');
    if (!body || !cnt) return;
    const len = body.value.length;
    cnt.textContent = `${len}자 · ${len > 45 ? 'LMS' : 'SMS'} 발송`;
  }
  function injectSmsModal() {
    if (document.getElementById('modal-empi-sms')) return;
    const html = `
<div class="modal-backdrop" id="modal-empi-sms" data-modal-id="empi-sms" style="z-index:1050;">
  <div class="modal modal--md">
    <div class="modal__header">
      <div class="modal__title">문자 발송</div>
      <button class="modal__close" data-modal-close type="button" aria-label="닫기">✕</button>
    </div>
    <div class="modal__body">
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div>
          <label style="display:block;font-size:var(--fs-sm);margin-bottom:6px;color:var(--color-text);">수신자</label>
          <div id="empi-sms-target" class="input" style="width:100%;background:var(--color-surface-alt);display:flex;align-items:center;">—</div>
        </div>
        <div>
          <label style="display:block;font-size:var(--fs-sm);margin-bottom:6px;color:var(--color-text);">메시지 템플릿</label>
          <select class="select" id="empi-sms-template" style="width:100%;">
            <option value="info-request">인사정보 등록 안내</option>
            <option value="welcome">입사 환영 안내</option>
            <option value="notice">일반 안내</option>
          </select>
        </div>
        <div>
          <label style="display:block;font-size:var(--fs-sm);margin-bottom:6px;color:var(--color-text);">메시지 내용</label>
          <textarea class="input" id="empi-sms-body" style="width:100%;min-height:150px;"></textarea>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:var(--fs-xs);color:var(--color-text-muted);">
            <span id="empi-sms-count">0자 · SMS 발송</span>
            <span>한글 45자 초과 시 LMS로 발송됩니다.</span>
          </div>
        </div>
        <div>
          <div style="font-size:var(--fs-sm);color:var(--color-text);margin-bottom:8px;">단축어 추가</div>
          <div class="var-chip-group">
            <button class="var-chip" type="button" data-empi-sms-var="{name}">성명 <span class="var-chip__var">{name}</span></button>
            <button class="var-chip" type="button" data-empi-sms-var="{empno}">사번 <span class="var-chip__var">{empno}</span></button>
            <button class="var-chip" type="button" data-empi-sms-var="{dept}">부서 <span class="var-chip__var">{dept}</span></button>
            <button class="var-chip" type="button" data-empi-sms-var="{link}">정보등록 링크 <span class="var-chip__var">{link}</span></button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal__footer">
      <button class="btn" type="button" data-modal-close>취소</button>
      <button class="btn btn--primary" type="button" data-empi-sms-submit>문자 발송</button>
    </div>
  </div>
</div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
  }
  function bindSmsModal() {
    const modal = document.getElementById('modal-empi-sms');
    if (!modal || modal.dataset.bound === '1') return;
    modal.dataset.bound = '1';
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-modal-close]')) { closeModal('modal-empi-sms'); return; }
      const chip = e.target.closest('[data-empi-sms-var]');
      if (chip) {
        const body = modal.querySelector('#empi-sms-body');
        if (body) {
          const v = chip.dataset.empiSmsVar;
          const s = body.selectionStart || body.value.length;
          body.value = body.value.slice(0, s) + v + body.value.slice(body.selectionEnd || s);
          body.focus();
          updateSmsCounter();
        }
        return;
      }
    });
    const tplSel = modal.querySelector('#empi-sms-template');
    if (tplSel) tplSel.addEventListener('change', () => {
      const body = modal.querySelector('#empi-sms-body');
      if (body) { body.value = SMS_TEMPLATES[tplSel.value] || ''; updateSmsCounter(); }
    });
    const body = modal.querySelector('#empi-sms-body');
    if (body) body.addEventListener('input', updateSmsCounter);
    modal.querySelector('[data-empi-sms-submit]').addEventListener('click', () => {
      const sel = STATE._smsTargets || [];
      const txt = (modal.querySelector('#empi-sms-body').value || '').trim();
      if (!txt) {
        if (window.App && App.Forms) App.Forms.setFieldError(modal.querySelector('#empi-sms-body'), '메시지 내용을 입력해 주세요.');
        return;
      }
      STATE.selectedIds.clear();
      renderTable();
      closeModal('modal-empi-sms');
      window.toast && window.toast(`문자 발송 완료 — ${sel.length}건`, 'success');
    });
  }

  /* ============ 계약 관리(App.HRContract) 동기화 ============
   *   인사정보카드에서 계약서 작성·발송 시 계약 관리 STATE.rows 에 row 추가.
   *   kind: 'labor' (근로계약서) | 'wage' (임금계약서)
   *   CTR_EDIT.labor / CTR_EDIT.wage 의 폼 값에서 startDate/endDate/금액을 가져온다. */
  function pushContractToCtrModule(emp, kind) {
    if (!emp || !window.App || !App.HRContract || typeof App.HRContract.addRowFromExternal !== 'function') return;
    const data = kind === 'labor' ? CTR_EDIT.labor : CTR_EDIT.wage;
    if (!data) return;
    const empPayload = {
      id: emp.id,
      name: displayName(emp),
      fname: emp.fname, gname: emp.gname,
      dept: emp.dept, job: emp.job, rank: emp.rank, position: emp.position,
      empType: emp.empType, contractSubType: emp.contractSubType,
      contractOut: !!emp.contractOut, jobCat: emp.jobCat,
      site: data.근무지 || emp.site || '성수동',
    };
    /* 임금계약서는 최신 근로계약을 자동 기준으로 연결한다(직원이 별도 선택하지 않음).
       ※ 하나의 근로계약에 임금계약을 여러 번 갱신 작성 가능 — 모두 동일 근로계약번호로 연결된다. */
    let linkedLaborId = '';
    if (kind === 'wage' && typeof App.HRContract.historyRowsByEmp === 'function') {
      const laborRows = (App.HRContract.historyRowsByEmp(emp.id) || []).filter(it => it.kind === '근로계약서');
      linkedLaborId = laborRows.length ? laborRows[0].id : '';   // 최신순 정렬 → 첫 건이 최신 근로계약
    }
    App.HRContract.addRowFromExternal({
      emp: empPayload,
      kind: kind === 'labor' ? '근로계약서' : '임금계약서',
      mode: 'individual',
      startDate: data.startDate || emp.joinDate || '',
      endDate:   data.endDate || '',
      indefinite: kind === 'labor' && !!data.indefinite,
      status: 'signing',
      registeredBy: currentUserName(),
      sentBy: currentUserName(),
      source: '인사정보카드 발송',
      linkedLaborId: linkedLaborId,
      salary: kind === 'wage' ? {
        base:      data.기본급 || '',
        allowance: data.직무수당 || '',
        meal:      data.식대 || '',
        payday:    data.지급일 || '',
      } : { base: '', allowance: '', meal: '', payday: '' },
    });
  }

  /* ============ 계약서·서류 재발송 ============
   *   kind: 'contract' → 계약서 재발송 / 'docs' → 서류 재발송
   *   - 미서명 행만 처리 (서명 완료된 행은 자동 스킵)
   *   - 발송일 갱신 + 발송 담당자 = 현재 사용자 + toast */
  function doResend(targets, kind) {
    if (!targets || !targets.length) return;
    const today = new Date().toISOString().slice(0, 10);
    const me = currentUserName();
    const valid = targets.filter(r => kind === 'contract'
      ? (MILESTONES.contractSent(r) && !isContractAllSigned(r))
      : (MILESTONES.docsSent(r) && !isDocsAllSigned(r)));
    if (!valid.length) {
      window.toast && window.toast('재발송 대상 행이 없습니다 (이미 서명 완료).', 'warning');
      return;
    }
    const label = kind === 'contract' ? '계약서' : '서류';
    const head = valid.length === 1
      ? `${displayName(valid[0])} (${valid[0].id})`
      : `${displayName(valid[0])} 외 ${valid.length - 1}명`;
    const apply = () => {
      valid.forEach(r => {
        if (kind === 'contract') {
          r.contractSentDate = today;
          r.contractSentBy = me;
        } else {
          r.docsSentDate = today;
          r.docsSentBy = me;
        }
      });
      renderTable();
      window.toast && window.toast(`${label} 재발송 — ${valid.length}건 완료`, 'success');
    };
    const text = `${head} 에게 ${label}를 재발송하시겠습니까?`;
    if (window.sweet) {
      window.sweet({
        icon: 'confirm',
        title: `${label} 재발송`,
        text,
        cancelText: '취소', confirmText: '재발송',
        onConfirm: apply,
      });
    } else if (confirm(text)) {
      apply();
    }
  }

  /* ============ 정규직 전환 (계약만료 상태만) ============
   *   계약직(계약만료) → 정규직(입사확정) 전환.
   *   - empType 'regular' 로 변경, contractSubType / contractEndDate 초기화
   *   - 같은 행에서 상태 복귀 → normalizeStatus 가 isComplete 통과 시 'completed' 로 셋팅
   *   - 새 근로계약서 작성은 별도 발령/계약 화면에서 처리 (본 화면 범위 밖) */
  function doConvertToRegular(emp) {
    const apply = () => {
      emp.empType = 'regular';
      emp.contractSubType = '';
      emp.contractEndDate = '';
      emp.status = 'inProgress';   // 종착 contractExpired 해제
      normalizeStatus(emp);        // 충족 조건 검사 → completed 자동 전이
      applyFilter();
      renderTable();
      window.toast && window.toast(`${displayName(emp)} — 정규직 전환 완료`, 'success');
    };
    const text = `${displayName(emp)} (${emp.id}) 을(를) 정규직으로 전환하시겠습니까?\n전환 후 새 근로계약서는 [발령 및 계약] 메뉴에서 작성해주세요.`;
    if (window.sweet) {
      window.sweet({
        icon: 'confirm',
        title: '정규직 전환',
        text,
        cancelText: '취소', confirmText: '전환',
        onConfirm: apply,
      });
    } else if (confirm(text)) {
      apply();
    }
  }

  /* ============ 삭제 (등록 / 계약만료 / 퇴사 / 입사취소 행만) ============ */
  /* ============ 엑셀 다운로드 ============
   *   현재 필터 적용된 STATE.filtered 를 CSV (UTF-8 BOM) 로 즉시 다운로드.
   *   토글·검색·정렬 결과를 그대로 반영. 빈 결과면 토스트 안내. */
  function doExcelDownload() {
    const rows = STATE.filtered.length ? STATE.filtered : [];
    if (!rows.length) {
      window.toast && window.toast('다운로드할 데이터가 없습니다.', 'warning');
      return;
    }
    /* 현재 목록 테이블에 노출되는 마스터 프로필 항목을 그대로 출력 */
    const headers = ['사번','성명','부서','직위','직책','근무지','사원 유형','근로 유형',
                     '이메일','휴대폰번호','지급계좌번호'];
    const dataRows = rows.map(r => [
      r.id, displayName(r), r.dept || '', r.rank || '', r.position || '', r.site || '',
      JOB_CAT_LABEL[r.jobCat] || '',
      EMP_TYPE_LABEL[r.empType] || '',
      r.email || '',
      r.phone || '',
      r.bankAccount || '',
    ]);
    /* 도메인 표준 Excel 생성기(App.xlsxDownload — SpreadsheetML, 외부 라이브러리 무의존).
     *   근태집계 등 타 화면과 동일하게 .xls 로 저장 → Excel 이 형식 경고 없이 그대로 연다.
     *   헤더행은 hdr 스타일(굵게 + 음영). */
    const stamp = new Date().toISOString().slice(2,10).replace(/-/g,'');   // YYMMDD
    const sheets = [{ name: '임직원', rows: [{ style: 'hdr', cells: headers }].concat(dataRows) }];
    App.xlsxDownload(`임직원_관리_${stamp}.xls`, sheets, { context: '임직원 관리 리스트' });
    window.toast && window.toast(`${rows.length}건 다운로드되었습니다.`, 'success');
  }

  /* ============ 조직도 다운로드 (PDF) ============
   *   부서 계층(DEPTS)을 가로 트리 차트(연결선 + 노드 박스) 로 렌더하고,
   *   각 부서 노드 박스 아래에 직속 구성원(성명·직위) 명단을 리스트로 붙인다.
   *   새 창으로 열어 인쇄 → "PDF로 저장".
   *   (도메인 PDF 패턴: 서버 변환 대신 브라우저 인쇄 대화상자 사용 — 문서 미리보기와 동일) */
  function deptDirectMembers(deptId) {
    return STATE.rows.filter(r => r.status !== 'retired' && (DEPT_NAME_TO_ID[r.dept] || '') === deptId);
  }
  function orgNodeColor(type) {
    return type === 'root' ? '#00347D'
         : type === 'hq'   ? '#2563EB'
         : type === 'team' ? '#F38200'
         : '#16A34A';
  }
  /* 트리 노드 = 부서 헤더(부서명 + 직속 인원수) 박스 + 그 아래 직속 구성원 명단 리스트.
   *   하위 부서는 트리 연결선으로 이어지는 자식 노드로 재귀 렌더. */
  function renderOrgNodeHTML(dept) {
    const kids = deptChildren(dept.id);
    const members = deptDirectMembers(dept.id);
    const headColor = orgNodeColor(dept.type);
    /* 구성원 명단은 div 로 렌더 — .org-tree 의 ul/li(가로 flex + 연결선) 룰이
     *   안쪽 명단에 적용돼 이름이 또 가로 트리처럼 퍼지는 것을 방지. */
    const memberHTML = members.length
      ? `<div class="org-node__members">${members.map(m => `
          <div class="org-node__member">
            <span class="org-node__mname">${esc(displayName(m))}</span>
            <span class="org-node__mrank">${esc(m.rank || '')}</span>
            <span class="org-node__msite">${esc(m.site || '미지정')}</span>
          </div>`).join('')}</div>`
      : `<div class="org-node__empty">직속 구성원 없음</div>`;
    const node = `
      <div class="org-node">
        <div class="org-node__head" style="background:${headColor};">
          <span class="org-node__name">${esc(dept.name)}</span>
          <span class="org-node__cnt">${members.length}명</span>
        </div>
        <div class="org-node__body">${memberHTML}</div>
      </div>`;
    return `<li>${node}${kids.length ? `<ul>${kids.map(renderOrgNodeHTML).join('')}</ul>` : ''}</li>`;
  }
  function doOrgChartDownload() {
    syncDeptsFromShared();
    const root = DEPTS.find(d => d.parentId === null);
    if (!root) { window.toast && window.toast('조직도 정보를 불러올 수 없습니다.', 'warning'); return; }
    const total = STATE.rows.filter(r => r.status !== 'retired').length;
    const stamp = new Date();
    const stampStr = `${stamp.getFullYear()}.${String(stamp.getMonth()+1).padStart(2,'0')}.${String(stamp.getDate()).padStart(2,'0')}`;
    /* 표시 전용 — 출력일 렌더는 YY/MM/DD (stampStr 은 파일명 생성용이라 원본 유지) */
    const stampDisp = `${String(stamp.getFullYear()).slice(-2)}/${String(stamp.getMonth()+1).padStart(2,'0')}/${String(stamp.getDate()).padStart(2,'0')}`;
    const treeHTML = `<ul class="org-tree">${renderOrgNodeHTML(root)}</ul>`;
    const css = `
      * { box-sizing: border-box; }
      body { margin: 0; padding: 24px; font-family: 'Malgun Gothic','맑은 고딕',sans-serif; color: #1a1a1a; background:#fff; }
      .org-doc__head { display:flex; align-items:baseline; justify-content:space-between; border-bottom:2px solid #00347D; padding-bottom:10px; margin-bottom:24px; }
      .org-doc__title { font-size:22px; font-weight:700; color:#00347D; }
      .org-doc__meta { font-size:12px; color:#666; }
      .org-doc__legend { display:flex; gap:14px; font-size:11px; color:#444; margin-bottom:18px; }
      .org-doc__legend span { display:inline-flex; align-items:center; gap:5px; }
      .org-doc__legend i { width:12px; height:12px; border-radius:3px; display:inline-block; }
      /* ===== 가로 트리 (pure CSS org chart) ===== */
      .org-tree, .org-tree ul { display:flex; padding:0; margin:0; list-style:none; padding-top:18px; position:relative; justify-content:center; }
      .org-tree li { position:relative; padding:18px 10px 0; text-align:center; }
      .org-tree li::before, .org-tree li::after { content:''; position:absolute; top:0; right:50%; border-top:1px solid #bbb; width:50%; height:18px; }
      .org-tree li::after { right:auto; left:50%; border-left:1px solid #bbb; }
      .org-tree li:only-child::before, .org-tree li:only-child::after { display:none; }
      .org-tree li:only-child { padding-top:0; }
      .org-tree li:first-child::before, .org-tree li:last-child::after { border:0 none; }
      .org-tree li:last-child::before { border-right:1px solid #bbb; }
      .org-tree ul ul::before { content:''; position:absolute; top:0; left:50%; border-left:1px solid #bbb; width:0; height:18px; }
      /* ===== 노드 박스 + 박스 아래 직속 구성원 명단 ===== */
      .org-node { display:inline-block; min-width:170px; max-width:250px; border:1px solid #ccc; border-radius:6px; overflow:hidden; background:#fff; vertical-align:top; box-shadow:0 1px 2px rgba(0,0,0,.06); text-align:left; page-break-inside:avoid; break-inside:avoid; }
      .org-node__head { display:flex; align-items:center; justify-content:space-between; gap:6px; padding:6px 9px; color:#fff; }
      .org-node__name { font-size:12px; font-weight:700; }
      .org-node__cnt { font-size:10px; background:rgba(255,255,255,.25); border-radius:10px; padding:1px 7px; white-space:nowrap; }
      .org-node__body { padding:4px 8px 6px; background:#fff; }
      .org-node__members { margin:0; padding:0; }
      .org-node__member { display:flex; align-items:center; gap:6px; padding:3px 1px; font-size:11px; border-bottom:1px solid #f2f2f2; }
      .org-node__member:last-child { border-bottom:0; }
      .org-node__mname { font-weight:600; color:#222; white-space:nowrap; }
      .org-node__mrank { color:#888; font-size:10px; white-space:nowrap; }
      .org-node__msite { margin-left:auto; color:#aaa; font-size:10px; white-space:nowrap; }
      .org-node__empty { padding:5px 1px; font-size:10px; color:#bbb; text-align:center; }
      @page { size: A4 landscape; margin: 12mm; }
      @media print { body { padding:0; } }
    `;
    const w = window.open('', '_blank', 'width=1200,height=820');
    if (!w) { window.toast && window.toast('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해 주세요.', 'warning'); return; }
    w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8">
      <title>조직도_${stampStr.replace(/\./g,'')}</title><style>${css}</style></head>
      <body>
        <div class="org-doc__head">
          <div class="org-doc__title">(주)성원애드피아 조직도</div>
          <div class="org-doc__meta">출력일 ${stampDisp} · 총 인원 ${total}명</div>
        </div>
        <div class="org-doc__legend">
          <span><i style="background:#2563EB;"></i>본부</span>
          <span><i style="background:#F38200;"></i>팀</span>
          <span><i style="background:#16A34A;"></i>파트</span>
        </div>
        ${treeHTML}
        <script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script>
      </body></html>`);
    w.document.close();
    window.toast && window.toast('조직도를 새 창에서 열었습니다. 인쇄 대화상자에서 "PDF로 저장"을 선택하세요.', 'info');
  }

  function doDeleteBulk(targets) {
    if (!targets || !targets.length) return;
    const blocked = targets.filter(r => !isDeletable(r));
    if (blocked.length) {
      const msg = `다음은 삭제할 수 없습니다.\n계정 등록 승인 워크플로는 '반려' 건만, 입사확정자는 퇴사 처리 후 삭제할 수 있습니다.\n\n` +
        blocked.slice(0, 5).map(r => `· ${displayName(r)} (${r.id}) — ${deleteBlockReason(r)}`).join('\n') +
        (blocked.length > 5 ? `\n... 외 ${blocked.length - 5}명` : '');
      window.sweet ? window.sweet({ icon: 'warn', title: '삭제 불가', text: msg, confirmText: '확인' })
                   : alert(msg);
      return;
    }
    const head = targets.length === 1
      ? `${displayName(targets[0])} (${targets[0].id})`
      : `${displayName(targets[0])} 외 ${targets.length - 1}명`;
    /* 계정 삭제 경고 — 본인 로그인 계정(userId)을 보유한 단계(idDone~)는 계정 함께 삭제됨 */
    const hasAccount = targets.some(r => !!r.userId);
    const confirmText = hasAccount
      ? `${head} 을(를) 삭제하시겠습니까?\n계정이 삭제됩니다. (복구 불가)`
      : `${head} 을(를) 삭제하시겠습니까? (복구 불가)`;
    const removeAll = () => {
      const ids = new Set(targets.map(r => r.id));
      STATE.rows = STATE.rows.filter(r => !ids.has(r.id));
      ids.forEach(id => STATE.selectedIds.delete(id));
      applyFilter();
      renderTable();
      window.toast && window.toast(`${targets.length}명 삭제 완료`, 'success');
    };
    window.sweet ? window.sweet({
      icon: 'confirm',
      title: '입사자 삭제',
      text: confirmText,
      cancelText: '취소', confirmText: '삭제',
      onConfirm: removeAll,
    }) : (confirm(confirmText) && removeAll());
  }

  /* ============ 계약서 작성 모달 (CTR 연계) ============ */
  const CTR_DOCS = [
    { key: 'd1', label: '개인정보 수집·이용 동의서' },
    { key: 'd2', label: '비밀유지 서약서' },
    { key: 'd3', label: '취업 규칙 동의서' },
    { key: 'd4', label: '4대보험 가입 신청서' },
    { key: 'd5', label: '급여계좌·세금 정보 동의서' },
  ];
  /* CTR 편집 상태 — '계약서 작성' / '서류 발송' 모달의 현재 값
   *   mode: 'initial'  — 계약서 + 서류 (일반직 infoDone, 단일 대상)
   *        'docsOnly' — 서류만 (도급직 infoDone, 일반직 contractSent, 또는 일괄 발송)
   *   targets: 발송 대상 배열 (단일 또는 다중) */
  const CTR_EDIT = {
    targets: [],
    emp: null,         // backward compat — targets[0]
    mode: 'initial',
    tab: 'labor',
    labor: { startDate: '', endDate: '', indefinite: false, 근무지: '', 근무시간: '09:00 ~ 18:00' },
    wage:  { startDate: '', endDate: '', 기본급: '', 직무수당: '', 식대: '', 지급일: '매월 25일' },
    docsChecked: [],
  };

  /* 일반직 infoDone — 계약서 + 서류 작성 모달 (단일 대상) */
  function openContractModal(emp) {
    if (!emp) return;
    setupCtrModal([emp], 'initial');
  }

  /* 서류만 발송 — 도급직 infoDone, 일반직 contractSent, 또는 멀티 대상 일괄 발송 */
  function openSendDocsModal(targets) {
    if (!targets || !targets.length) return;
    setupCtrModal(targets, 'docsOnly');
  }

  function setupCtrModal(targets, mode) {
    const primary = targets[0];
    CTR_EDIT.targets = targets;
    CTR_EDIT.emp = primary;
    CTR_EDIT.mode = mode;
    CTR_EDIT.tab = (mode === 'docsOnly') ? 'docs' : 'labor';

    // 폼 기본값 (initial 모드 = 단일 대상 기준)
    CTR_EDIT.labor = { startDate: primary.joinDate || '', endDate: '', indefinite: primary.empType === 'regular', 근무지: primary.site || '', 근무시간: '09:00 ~ 18:00' };
    CTR_EDIT.wage  = { startDate: primary.joinDate || '', endDate: '', 기본급: '', 직무수당: '', 식대: '', 지급일: '매월 25일' };
    /* 서류 체크 기본값 — 초기(infoDone 일반직)는 다 체크, docsOnly 는 다 미체크 (사용자가 선택) */
    CTR_EDIT.docsChecked = CTR_DOCS.map(() => mode === 'initial');

    /* 대상 정보 표시 분기:
     *   1) 단일 대상 또는 initial 모드 → 상단 info-wrap 에 한 줄 표시
     *   2) 멀티 docsOnly → 상단 info-wrap 숨김 + docs 패널을 좌우 스플릿으로 재구성
     *      (좌: 발송 대상 테이블 / 우: 입사서류 5종 체크리스트) */
    const isMultiDocsOnly = mode === 'docsOnly' && targets.length > 1;
    const infoWrap = $('#empi-ctr-info-wrap');
    const paneDocs = $('#empi-ctr-pane-docs');

    if (isMultiDocsOnly) {
      if (infoWrap) { infoWrap.style.display = 'none'; infoWrap.innerHTML = ''; }
      if (paneDocs) {
        paneDocs.style.padding = '0';
        paneDocs.style.overflow = 'hidden';
        paneDocs.innerHTML = `
          <div class="split" style="--split-left:520px;flex:1;min-height:0;height:100%;">
            <aside class="split__left">
              <div class="split__head"><h3>발송 대상 (${targets.length}명)</h3></div>
              <div class="split__body" style="padding:0;">
                <table class="tbl tbl--striped" style="margin:0;">
                  <thead>
                    <tr>
                      <th style="width:100px;">사번</th>
                      <th style="width:80px;">성명</th>
                      <th>부서</th>
                      <th style="width:80px;">직군</th>
                      <th style="width:60px;text-align:center;">도급</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${targets.map(t => `
                      <tr>
                        <td>${esc(t.id)}</td>
                        <td>${esc(displayName(t))}</td>
                        <td>${esc(t.dept || '-')}</td>
                        <td>${esc(JOB_CAT_LABEL[t.jobCat] || '-')}</td>
                        <td style="text-align:center;">${t.contractOut ? '<span class="pill pill--warning">도급</span>' : '<span style="color:var(--color-text-muted);">-</span>'}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </aside>
            <section class="split__right">
              <div class="split__head"><h3>입사서류 (5종)</h3></div>
              <div class="split__body">
                <p style="font-size:var(--fs-sm);color:var(--color-text-sub);margin-bottom:12px;">
                  선택한 서류가 ${targets.length}명 전원에게 발송됩니다.
                </p>
                <div id="empi-ctr-doclist" style="display:flex;flex-direction:column;gap:6px;"></div>
              </div>
            </section>
          </div>
        `;
      }
    } else {
      /* 단일/initial — info-wrap 한 줄 + pane-docs 단순 세로 스택 (원래 구조) */
      if (infoWrap) {
        infoWrap.style.display = '';
        infoWrap.innerHTML = `
          <div class="fm-tbl fm-tbl--compact" style="background:var(--color-surface);border-radius:var(--radius-md);overflow:hidden;border:1px solid var(--color-border);">
            <div class="fm-tbl__row fm-tbl__row--3">
              <div class="fm-tbl__label">직원</div>
              <div class="fm-tbl__value">${esc(displayName(primary))} (${esc(primary.id)})</div>
              <div class="fm-tbl__label">소속</div>
              <div class="fm-tbl__value">${esc(primary.dept || '-')}</div>
              <div class="fm-tbl__label">고용 형태</div>
              <div class="fm-tbl__value">${esc(EMP_TYPE_LABEL[primary.empType] || '-')}${primary.contractOut ? ' <span class="pill pill--warning" style="margin-left:6px;">도급</span>' : ''}</div>
            </div>
          </div>
        `;
      }
      if (paneDocs) {
        paneDocs.style.padding = '20px';
        paneDocs.style.overflow = 'auto';
        paneDocs.innerHTML = `
          <p style="font-size:var(--fs-sm);color:var(--color-text-sub);margin-bottom:12px;">
            입사자에게 이메일로 발송되어 전자 서명을 받을 서류 5종입니다. 발송 후 입사자가 모두 서명하면 입사확정 상태로 전환됩니다.
          </p>
          <div id="empi-ctr-doclist" style="display:flex;flex-direction:column;gap:6px;"></div>
        `;
      }
    }

    // 회사 인감 카드
    const HC = (window.App && App.HRContract) || {};
    const seal = HC.COMPANY_SEAL || { text: '', registeredAt: '' };
    $('#empi-ctr-seal').innerHTML = esc(seal.text || '').replace(/\n/g, '<br>');
    $('#empi-ctr-company').textContent = HC.COMPANY || '—';
    $('#empi-ctr-company-sub').textContent = `대표이사 ${HC.COMPANY_REPR || ''} · 사전 등록 ${seal.registeredAt || ''}`;

    /* 탭 표시/숨김 — docsOnly 는 계약 탭들 숨김 */
    const laborTab = document.querySelector('#modal-empi-contract [data-empi-tab="labor"]');
    const wageTab  = $('#empi-ctr-wage-tab');
    if (mode === 'docsOnly') {
      if (laborTab) laborTab.style.display = 'none';
      if (wageTab)  wageTab.style.display  = 'none';
    } else {
      if (laborTab) laborTab.style.display = '';
      if (wageTab)  wageTab.style.display  = '';   // 일용직 포함 전 사원 임금계약(시급제) 탭 노출
    }

    /* 모달 타이틀 — docsOnly 면 '서류 발송', initial 이면 기본 */
    const titleEl = $('#empi-ctr-modal-title');
    if (titleEl) titleEl.textContent = (mode === 'docsOnly') ? '서류 발송' : '계약서 작성 · 입사서류 발송';

    /* 제출 버튼 라벨 */
    const submitBtn = document.querySelector('#modal-empi-contract [data-empi-ctr-submit]');
    if (submitBtn) submitBtn.textContent = (mode === 'docsOnly') ? '서류 발송' : '일괄 발송';

    setCtrTab(CTR_EDIT.tab);
    renderCtrDocList();
    openModal('modal-empi-contract');
  }

  function setCtrTab(tab) {
    CTR_EDIT.tab = tab;
    // 탭 버튼 활성화
    document.querySelectorAll('#modal-empi-contract [data-empi-tab]').forEach(b => {
      b.classList.toggle('is-active', b.dataset.empiTab === tab);
    });
    const editorPane = $('#empi-ctr-pane-editor');
    const docsPane   = $('#empi-ctr-pane-docs');
    if (tab === 'docs') {
      editorPane.style.display = 'none';
      docsPane.style.display = '';
    } else {
      editorPane.style.display = '';
      docsPane.style.display = 'none';
      renderCtrEditor();
    }
  }

  function renderCtrEditor() {
    const kind = CTR_EDIT.tab === 'wage' ? '임금계약서' : '근로계약서';
    const data = CTR_EDIT.tab === 'wage' ? CTR_EDIT.wage : CTR_EDIT.labor;

    $('#empi-ctr-preview-title').textContent = `${kind} 미리보기`;
    $('#empi-ctr-preview-meta').textContent  = `📄 ${kind}`;

    $('#empi-ctr-start').value = data.startDate || '';
    $('#empi-ctr-end').value   = data.endDate || '';

    // 기간의 정함 없는 근로 — 근로계약서에서만 보이고 적용됨
    const indefWrap = $('#empi-ctr-indef-wrap');
    const indefEl   = $('#empi-ctr-indefinite');
    if (CTR_EDIT.tab === 'labor') {
      indefWrap.style.display = '';
      indefEl.checked = !!data.indefinite;
      $('#empi-ctr-end').disabled = !!data.indefinite;
    } else {
      indefWrap.style.display = 'none';
      indefEl.checked = false;
      $('#empi-ctr-end').disabled = false;
    }

    // 종류별 추가 필드
    const host = $('#empi-ctr-kind-fields');
    if (CTR_EDIT.tab === 'labor') {
      host.innerHTML = `
        <div class="form-field">
          <label class="form-label" for="empi-ctr-site">근무지</label>
          <input class="input input--full" type="text" id="empi-ctr-site" value="${esc(data.근무지)}" />
        </div>
        <div class="form-field">
          <label class="form-label" for="empi-ctr-hours">근로 시간</label>
          <input class="input input--full" type="text" id="empi-ctr-hours" value="${esc(data.근무시간)}" placeholder="예: 09:00 ~ 18:00" />
        </div>`;
    } else {
      host.innerHTML = `
        <div class="form-field">
          <label class="form-label is-required" for="empi-ctr-base">기본급 (원)</label>
          <input class="input input--full" type="text" id="empi-ctr-base" value="${esc(data.기본급)}" inputmode="numeric" />
        </div>
        <div class="form-field">
          <label class="form-label" for="empi-ctr-allowance">직무수당 (원)</label>
          <input class="input input--full" type="text" id="empi-ctr-allowance" value="${esc(data.직무수당)}" inputmode="numeric" />
        </div>
        <div class="form-field">
          <label class="form-label" for="empi-ctr-meal">식대 (원)</label>
          <input class="input input--full" type="text" id="empi-ctr-meal" value="${esc(data.식대)}" inputmode="numeric" />
        </div>
        <div class="form-field">
          <label class="form-label" for="empi-ctr-payday">지급일</label>
          <input class="input input--full" type="text" id="empi-ctr-payday" value="${esc(data.지급일)}" placeholder="예: 매월 25일" />
        </div>`;
    }

    renderCtrPreview();
  }

  function readCtrFormToState() {
    const tab = CTR_EDIT.tab;
    if (tab === 'docs') return;
    const data = tab === 'wage' ? CTR_EDIT.wage : CTR_EDIT.labor;
    data.startDate = $('#empi-ctr-start')?.value || '';
    data.endDate   = $('#empi-ctr-end')?.value || '';
    if (tab === 'labor') {
      data.indefinite = $('#empi-ctr-indefinite')?.checked || false;
      data.근무지   = $('#empi-ctr-site')?.value   || '';
      data.근무시간 = $('#empi-ctr-hours')?.value || '';
    } else {
      data.기본급   = $('#empi-ctr-base')?.value      || '';
      data.직무수당 = $('#empi-ctr-allowance')?.value || '';
      data.식대    = $('#empi-ctr-meal')?.value      || '';
      data.지급일  = $('#empi-ctr-payday')?.value    || '';
    }
  }

  function renderCtrPreview() {
    const HC = (window.App && App.HRContract) || {};
    if (!HC.TEMPLATES || !HC.renderContractHTML) {
      $('#empi-ctr-preview').innerHTML = '<p style="color:var(--color-text-muted);text-align:center;padding:40px 0;">계약서 미리보기 모듈을 불러오지 못했습니다.</p>';
      return;
    }
    const kind = CTR_EDIT.tab === 'wage' ? '임금계약서' : '근로계약서';
    const v = buildPreviewValues(kind);
    const body = HC.TEMPLATES[kind](v);
    const row = {
      kind,
      empId:   CTR_EDIT.emp ? CTR_EDIT.emp.id : '',
      empName: CTR_EDIT.emp ? displayName(CTR_EDIT.emp) : '_______',
      empDept: CTR_EDIT.emp ? (CTR_EDIT.emp.dept || '') : '',
      body,
      gapSignedAt: HC.nowStamp ? HC.nowStamp() : '',
      eulSignedAt: '',
    };
    /* 작성 모달 미리보기 — 서명 블록 제외 (직원이 별도 캔버스로 서명함) */
    $('#empi-ctr-preview').innerHTML = HC.renderContractHTML(row, { omitSignatures: true });
  }

  function buildPreviewValues(kind) {
    const HC = (window.App && App.HRContract) || {};
    const emp = CTR_EDIT.emp || {};
    const data = kind === '임금계약서' ? CTR_EDIT.wage : CTR_EDIT.labor;
    const common = {
      회사명:   HC.COMPANY || '',
      직원명:   displayName(emp),
      사번:     emp.id || '',
      부서:     emp.dept || '',
      직무:     emp.job  || '',
      직위:     emp.rank || '',
      직책:     emp.position || '',
      '고용 형태': EMP_TYPE_LABEL[emp.empType] || '',
      소속형태: emp.contractOut ? '도급' : '-',
      직군:     emp.jobCat === 'production' ? '생산직' : (emp.jobCat === 'research' ? '연구직' : '사무직'),
      작성일:   HC.todayStr ? HC.todayStr() : '',
      시작일:   data.startDate || '',
      종료일:   data.endDate || '',
    };
    if (kind === '근로계약서') {
      return Object.assign(common, {
        무기:     !!data.indefinite,
        근무지:   data.근무지 || '',
        근무시간: data.근무시간 || '',
      });
    }
    return Object.assign(common, {
      기본급:   data.기본급 || '',
      직무수당: data.직무수당 || '',
      식대:     data.식대 || '',
      지급일:   data.지급일 || '',
    });
  }

  function renderCtrDocList() {
    const emp = CTR_EDIT.emp;
    $('#empi-ctr-doclist').innerHTML = CTR_DOCS.map((d, i) => {
      const checked = CTR_EDIT.docsChecked[i] ? 'checked' : '';
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--color-divider);border-radius:var(--radius-md);">
          <label class="cb" style="display:flex;align-items:center;gap:10px;flex:1;cursor:pointer;">
            <input type="checkbox" data-empi-doc-idx="${i}" ${checked} />
            <span style="flex:1;">${esc(d.label)}</span>
          </label>
          <span class="pill pill--info">발송 예정</span>
          <button class="btn btn--xs" type="button" data-empi-ctr-doc-preview="${esc(d.key)}">미리보기</button>
        </div>
      `;
    }).join('');
  }

  function bindContractModal() {
    const modal = document.getElementById('modal-empi-contract');
    if (!modal) return;

    // 탭 전환
    modal.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('[data-empi-tab]');
      if (tabBtn) {
        readCtrFormToState();
        setCtrTab(tabBtn.dataset.empiTab);
        return;
      }
      /* 입사서류 행 [미리보기] — 발송 전이라도 서식 미리 확인 가능 */
      const docPv = e.target.closest('[data-empi-ctr-doc-preview]');
      if (docPv) {
        const key = docPv.dataset.empiCtrDocPreview;
        if (CTR_EDIT.emp) openDocPreviewModal(CTR_EDIT.emp, 'doc', key);
        return;
      }
    });

    // 폼 변경 → 미리보기 갱신 (editor 패널 내부 input/select 만)
    modal.addEventListener('input', (e) => {
      if (CTR_EDIT.tab === 'docs') return;
      if (!e.target.closest('#empi-ctr-pane-editor')) return;
      // 무기 체크박스는 'change' 로 별도 처리
      if (e.target.id === 'empi-ctr-indefinite') return;
      readCtrFormToState();
      renderCtrPreview();
    });
    modal.addEventListener('change', (e) => {
      if (e.target.id === 'empi-ctr-indefinite') {
        CTR_EDIT.labor.indefinite = e.target.checked;
        if (e.target.checked) CTR_EDIT.labor.endDate = '';
        renderCtrEditor();   // 종료일 disabled 상태 갱신
        return;
      }
      // 서류 체크박스
      const docCb = e.target.closest('[data-empi-doc-idx]');
      if (docCb) {
        const idx = Number(docCb.dataset.empiDocIdx);
        CTR_EDIT.docsChecked[idx] = docCb.checked;
        return;
      }
      // 날짜 등 change-only 인풋도 미리보기 갱신
      if (CTR_EDIT.tab !== 'docs' && e.target.closest('#empi-ctr-pane-editor')) {
        readCtrFormToState();
        renderCtrPreview();
      }
    });

    // 일괄 발송 / 서류 발송
    modal.querySelector('[data-empi-ctr-submit]').addEventListener('click', () => {
      readCtrFormToState();
      const targets = CTR_EDIT.targets || [];
      if (!targets.length) return;
      const selectedDocs = CTR_EDIT.docsChecked.filter(Boolean).length;
      const today = new Date().toISOString().slice(0, 10);
      const me = currentUserName();

      if (CTR_EDIT.mode === 'docsOnly') {
        /* 서류 발송 — 적어도 1건 선택 필수, 멀티 대상 지원 */
        if (selectedDocs < 1) {
          window.toast && window.toast('발송할 입사서류를 1건 이상 선택해 주세요.', 'warning');
          return;
        }
        targets.forEach(t => {
          /* 서류 발송 — docsSent 마일스톤 도달 + status normalize */
          t.docsSent  = Math.max(t.docsSent  || 0, selectedDocs);
          t.docSigned = 0;
          t.docsSentDate = today;
          t.docsSentBy = me;
          normalizeStatus(t);
        });
        applyFilter();
        renderTable();
        closeAllModals();
        const msg = targets.length === 1
          ? `입사서류 ${selectedDocs}건 발송 완료`
          : `${targets.length}명에게 입사서류 ${selectedDocs}건씩 발송 완료`;
        window.toast && window.toast(msg, 'success');
        return;
      }

      /* initial 모드 — 단일 대상 (일반직 infoDone) 의 계약서 + 서류 발송 */
      const emp = targets[0];
      /* 임금계약 검증 — 일용직은 시급제(무기한 허용): 시작일 + 시급(기본급 필드)만 필수.
       *   그 외(연봉/월급제)는 시작일 + 종료일 + 기본급 필수. */
      const wageOk  = emp.empType === 'daily'
        ? !!(CTR_EDIT.wage.startDate && CTR_EDIT.wage.기본급)
        : !!(CTR_EDIT.wage.startDate && CTR_EDIT.wage.endDate && CTR_EDIT.wage.기본급);
      const laborOk = CTR_EDIT.labor.startDate && (CTR_EDIT.labor.indefinite || CTR_EDIT.labor.endDate);
      if (!laborOk || !wageOk) {
        window.toast && window.toast('계약서 필수 항목을 모두 입력해 주세요.', 'warning');
        return;
      }

      emp.contractLabor = false;
      emp.contractWage = false;   // 발송 시 서명 전 상태로 초기화 — 일용직 포함 전 사원 동일
      emp.docsSent = selectedDocs;
      emp.docSigned = 0;
      emp.contractSentDate = today;
      emp.contractSentBy = me;
      /* 발송된 계약서를 계약 관리(App.HRContract) STATE.rows 에 등록 — 계약 관리 화면에서 즉시 노출 */
      pushContractToCtrModule(emp, 'labor');
      pushContractToCtrModule(emp, 'wage');   // 일용직(시급제) 포함 전 사원 임금계약 등록

      if (selectedDocs === 0) {
        normalizeStatus(emp);
        applyFilter(); renderTable(); closeAllModals();
        window.toast && window.toast('계약서 발송 완료 — 입사서류는 [서류 발송]에서 발송할 수 있습니다.', 'success');
      } else {
        emp.docsSentDate = today;
        emp.docsSentBy = me;
        normalizeStatus(emp);
        applyFilter(); renderTable(); closeAllModals();
        window.toast && window.toast(`계약서 + 입사서류 ${selectedDocs}건 발송 완료`, 'success');
      }
    });
  }

  /* ============ SCR-EMP-02 개별 등록 — 인사정보 관리 신규 구성 ============
   *   구조: 「필수 정보」(기본 정보) 아코디언 펼친 상태 + 「선택 정보」(소속/고용) 접힌 상태.
   *   필수 입력: 입사일 / 성 / 이름 / 개인 이메일 (사번은 자동채번 — 시스템 자동 부여).
   *   선택 입력: 사진·영문성명·생년월일·휴대전화·주소·소속(직무·직위·부서·직책)·고용(고용 형태·도급·직군·근무지). */
  function injectCreateModal() {
    if (document.getElementById('modal-empi-create')) return;
    /* 사업장 옵션은 MASTER.sites 단일 진실원 사용 — 등록 모달과 카드 편집 모달의 옵션 셋이
     *   분리돼 있으면 등록 시 선택한 값이 편집 모달의 dropdown 에 매칭되지 않아 사라진다. */
    const siteOptions = MASTER.sites.filter(s => s)
      .map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    /* 도급 소속회사 옵션 — 「도급직 여부=해당」 선택 시 노출 */
    const companyOptions = MASTER.contractCompanies
      .map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    /* 상세 화면 카드 헬퍼 — 흰 카드(제목 헤더 + 본문). 계약서 작성 화면의 leftCard 스타일과 동일.
       overflow:visible — 부서 콤보 등 드롭다운(absolute 패널)이 카드 밖으로 펼쳐질 수 있게 한다. */
    const card = (title, body, attr) => `
      <section${attr || ''} style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:8px;overflow:visible;box-shadow:0 1px 2px rgba(15,23,42,0.04);">
        <header style="padding:12px 16px;border-bottom:1px solid var(--color-divider);">
          <span style="font-size:15px;font-weight:var(--fw-semibold);color:var(--color-text);letter-spacing:-0.2px;">${title}</span>
        </header>
        <div style="padding:14px 16px;">${body}</div>
      </section>`;

    /* ===== 1. 필수 정보 (펼침) — 사진/입사일/사번/성명/연락처 ===== */
    const bodyRequired = `
          <!-- 사진 + 사번(자동) + 입사일 -->
          <div class="empi-c-idrow" style="display:flex;gap:16px;align-items:flex-start;background:var(--color-surface);border:1px solid var(--color-divider);border-radius:var(--radius-md);padding:12px 14px;margin-bottom:8px;">
            <div class="id-photo-uploader id-photo-uploader--inline" data-photo-uploader id="empi-c-photo-uploader" style="padding-top:2px;">
              <div class="id-photo-uploader__photo">
                <div class="id-photo id-photo--xl" data-photo-preview>
                  <div class="id-photo-uploader__placeholder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>
                    <span>사진 없음</span>
                  </div>
                </div>
              </div>
              <div class="id-photo-uploader__actions">
                <button class="btn btn--xs" type="button" data-photo-upload>업로드</button>
                <button class="btn btn--xs" type="button" data-photo-remove disabled>삭제</button>
              </div>
              <div class="id-photo-uploader__hint">JPG · PNG · 최대 2MB</div>
              <input type="file" accept="image/png,image/jpeg" hidden data-photo-input id="empi-c-photo-input" />
            </div>

            <div class="fm-tbl fm-tbl--compact" style="flex:1;min-width:0;">
              <div class="fm-tbl__row fm-tbl__row--2">
                <div class="fm-tbl__label"><span style="color:var(--color-danger);">*</span> 입사일</div>
                <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;"><input class="input" type="date" id="empi-c-joindate" style="width:100%;" /></div>
                <div class="fm-tbl__label"><span style="color:var(--color-danger);">*</span> 사번</div>
                <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;">
                  <input class="input" id="empi-c-empno" value="자동 부여" disabled style="width:100%;background:var(--color-surface-alt);" />
                </div>
              </div>
              <div class="fm-tbl__row fm-tbl__row--2">
                <div class="fm-tbl__label"><span style="color:var(--color-danger);">*</span> 성</div>
                <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;"><input class="input" type="text" id="empi-c-fname" placeholder="홍" style="width:100%;" /></div>
                <div class="fm-tbl__label"><span style="color:var(--color-danger);">*</span> 이름</div>
                <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;"><input class="input" type="text" id="empi-c-gname" placeholder="길동" style="width:100%;" /></div>
              </div>
              <div class="fm-tbl__row fm-tbl__row--1">
                <div class="fm-tbl__label">이름 순서</div>
                <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;min-height:44px;">
                  <label class="cb"><input type="checkbox" id="empi-c-name-flip" /> 이름 + 성 순서로 표기</label>
                </div>
              </div>
            </div>
          </div>

          <!-- 개인 이메일 (필수) + 휴대전화 (필수) -->
          <div class="fm-tbl fm-tbl--compact">
            <div class="fm-tbl__row fm-tbl__row--1">
              <div class="fm-tbl__label"><span style="color:var(--color-danger);">*</span> 개인 이메일</div>
              <div class="fm-tbl__value" style="background:var(--color-surface);flex-direction:column;align-items:stretch;padding:6px 12px;">
                <input class="input" type="email" id="empi-c-email" placeholder="user@gmail.com" style="width:100%;" />
                <small data-empi-email-msg style="color:var(--color-danger);font-size:var(--fs-xs);display:none;margin-top:4px;"></small>
              </div>
            </div>
            <div class="fm-tbl__row fm-tbl__row--1">
              <div class="fm-tbl__label"><span style="color:var(--color-danger);">*</span> 휴대전화</div>
              <div class="fm-tbl__value" style="background:var(--color-surface);flex-direction:column;align-items:stretch;padding:6px 12px;">
                <input class="input" type="text" id="empi-c-phone" placeholder="01000000000" style="width:100%;" />
                <small data-empi-phone-msg style="color:var(--color-danger);font-size:var(--fs-xs);display:none;margin-top:4px;"></small>
              </div>
            </div>
          </div>

`;

    /* ===== 2. 근무 정보 (펼침) — 도급직/사원유형/근무지/부서/직위/직책/직무 ===== */
    const bodyWork = `
          <!-- 도급직 여부 — '해당' 시 소속회사 노출. 사원 유형·근무지·부서·직위·직책·직무는 상시 노출 -->
          <div class="fm-tbl fm-tbl--compact" style="border-top:0;">
            <div class="fm-tbl__row fm-tbl__row--1">
              <div class="fm-tbl__label"><span style="color:var(--color-danger);">*</span> 도급직 여부</div>
              <div class="fm-tbl__value" style="background:var(--color-surface);gap:20px;min-height:44px;align-items:center;padding:6px 12px;">
                <label class="cb"><input type="radio" name="empi-c-outsourced" value="" checked /> 해당 없음</label>
                <label class="cb"><input type="radio" name="empi-c-outsourced" value="1" /> 해당</label>
              </div>
            </div>
            <div class="fm-tbl__row fm-tbl__row--1" id="empi-c-contract-company-row" style="display:none;">
              <div class="fm-tbl__label"><span style="color:var(--color-danger);">*</span> 소속회사</div>
              <div class="fm-tbl__value" style="background:var(--color-surface);flex-direction:column;align-items:stretch;padding:6px 12px;">
                <select class="select" id="empi-c-contract-company" style="width:100%;">
                  <option value="">선택</option>
                  ${companyOptions}
                </select>
                <div class="field-error" data-empi-c-err="company" hidden style="width:100%;"></div>
              </div>
            </div>
            <div class="fm-tbl__row fm-tbl__row--1" id="empi-c-jobcat-row">
              <div class="fm-tbl__label"><span style="color:var(--color-danger);">*</span> 사원 유형</div>
              <div class="fm-tbl__value" style="background:var(--color-surface);gap:20px;min-height:44px;align-items:center;flex-wrap:wrap;padding:6px 12px;">
                <label class="cb"><input type="radio" name="empi-c-jobcat" value="office" /> 사무직</label>
                <label class="cb"><input type="radio" name="empi-c-jobcat" value="production" /> 생산직</label>
                <label class="cb"><input type="radio" name="empi-c-jobcat" value="research" /> 연구직</label>
                <div class="field-error" data-empi-c-err="jobcat" hidden style="width:100%;"></div>
              </div>
            </div>
          </div>

          <!-- 근무지 / 부서 -->
          <div class="fm-tbl fm-tbl--compact">
            <div class="fm-tbl__row fm-tbl__row--2">
              <div class="fm-tbl__label"><span style="color:var(--color-danger);">*</span> 근무지</div>
              <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;">
                <select class="select" id="empi-c-site" style="width:100%;">
                  <option value="">선택</option>
                  ${siteOptions}
                </select>
              </div>
              <div class="fm-tbl__label"><span style="color:var(--color-danger);">*</span> 부서</div>
              <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;">
                <div class="combo" id="empi-c-dept" data-empi-c-dept-combo>
                  <button class="combo__field" type="button"><span class="combo__value combo__value--placeholder">선택</span></button>
                  <div class="combo__panel">
                    <input class="combo__search" placeholder="본부·팀·파트 검색">
                    <div class="combo__list"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 직위 / 직책 / 직무 -->
          <div class="fm-tbl fm-tbl--compact">
            <div class="fm-tbl__row fm-tbl__row--2">
              <div class="fm-tbl__label"><span style="color:var(--color-danger);">*</span> 직위</div>
              <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;"><select class="select" id="empi-c-rank" style="width:100%;"></select></div>
              <div class="fm-tbl__label"><span style="color:var(--color-danger);">*</span> 직책</div>
              <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;"><select class="select" id="empi-c-position" style="width:100%;"></select></div>
            </div>
            <div class="fm-tbl__row fm-tbl__row--2">
              <div class="fm-tbl__label"><span style="color:var(--color-danger);">*</span> 직무</div>
              <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;"><select class="select" id="empi-c-job" style="width:100%;"></select></div>
              <div class="fm-tbl__label"></div>
              <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;"></div>
            </div>
          </div>`;

    /* ===== 3·4. 근로/임금 계약 정보 — body 는 openCreateModal 에서 동적 렌더
       (renderCardEditEmployment / renderCardEditWage 재사용). 도급직=해당 시 섹션 숨김. ===== */
    const bodyLabor = `<div data-empi-c-labor-body></div>`;
    const bodyWage  = `<div data-empi-c-wage-body></div>`;

    /* ===== 5. 선택 정보 (접힘) — 개인 정보(영문 이름 / 생년월일 / 주소) ===== */
    const bodySelect = `
          <div class="fm-tbl fm-tbl--compact">
            <div class="fm-tbl__row fm-tbl__row--2">
              <div class="fm-tbl__label">영문 이름</div>
              <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;"><input class="input" type="text" id="empi-c-ename" placeholder="Hong Gildong" style="width:100%;" /></div>
              <div class="fm-tbl__label">생년월일</div>
              <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;"><input class="input" type="date" id="empi-c-birth" style="width:100%;" /></div>
            </div>
            <div class="fm-tbl__row fm-tbl__row--1">
              <div class="fm-tbl__label">주소</div>
              <div class="fm-tbl__value" style="background:var(--color-surface);flex-direction:column;align-items:stretch;padding:6px 12px;gap:6px;">
                <div style="display:flex;gap:6px;align-items:center;">
                  <input class="input" type="text" id="empi-c-zipcode" placeholder="우편번호" style="width:120px;" readonly />
                  <button class="btn btn--sm" type="button" data-empi-zipcode-search>주소 검색</button>
                </div>
                <input class="input" type="text" id="empi-c-address-base" placeholder="기본 주소" style="width:100%;" readonly />
                <input class="input" type="text" id="empi-c-address-detail" placeholder="상세 주소를 입력해 주세요" style="width:100%;" />
              </div>
            </div>
          </div>`;

    /* 임직원 등록 — 모달이 아닌 '계약서 작성'과 동일한 풀스크린 상세 화면(page-bar + 스크롤 본문).
       #page-hr-info-mgmt(.page: flex column) 의 자식으로 렌더 → 열릴 때 목록 형제를 숨기고 상세만 노출. */
    const html = `
<div id="modal-empi-create" class="empi-create-detail" style="display:none;flex:1;min-height:0;flex-direction:column;background:var(--color-surface);">
  <div class="page-bar">
    <button class="page-bar__back" type="button" data-empi-detail-close aria-label="목록으로">←</button>
    <div class="page-bar__divider"></div>
    <div class="page-bar__title">임직원 등록</div>
    <span class="page-bar__spacer"></span>
    <span data-empi-create-hint style="align-self:center;margin-right:8px;color:var(--color-danger);font-size:12px;"></span>
    <button class="btn" type="button" data-empi-detail-close>취소</button>
    <button class="btn btn--primary" type="button" data-empi-create-submit>등록</button>
  </div>
  <div class="empi-create-detail__body" style="flex:1;min-height:0;overflow:auto;background:var(--color-surface-alt);padding:18px 22px;">
    <!-- 전 항목 펼침 · 상세 화면 폭을 꽉 채우는 2열 카드 그리드 (좁으면 1열로 접힘) -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(460px,1fr));gap:16px;align-items:start;max-width:1680px;margin:0 auto;">
      <!-- 좌: 기본 · 근무 · 근로 계약 -->
      <div style="display:flex;flex-direction:column;gap:16px;min-width:0;">
        ${card('기본 정보', bodyRequired)}
        ${card('근무 정보', bodyWork)}
        ${card('근로 계약 정보', bodyLabor, ' id="empi-c-labor-section"')}
      </div>
      <!-- 우: 임금 계약 · 개인 정보(선택) -->
      <div style="display:flex;flex-direction:column;gap:16px;min-width:0;">
        ${card('임금 계약 정보', bodyWage, ' id="empi-c-wage-section"')}
        ${card('개인 정보 <span style=\"font-size:12px;color:var(--color-text-muted);font-weight:var(--fw-regular);\">(선택)</span>', bodySelect)}
      </div>
    </div>
  </div>
</div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    const host = document.getElementById('page-hr-info-mgmt') || document.body;
    while (wrap.firstChild) host.appendChild(wrap.firstChild);
  }

  /* 상세 화면 열기/닫기 — 목록(형제 노드)을 숨기고 상세만 노출 (page.is-active 유지, GNB/LNB 그대로) */
  function showCreateDetail() {
    const detail = document.getElementById('modal-empi-create');
    const page = document.getElementById('page-hr-info-mgmt');
    if (!detail) return;
    if (page && detail.parentElement === page) {
      Array.from(page.children).forEach(ch => {
        if (ch === detail) return;
        ch.dataset.empiPrevDisplay = ch.style.display || '';
        ch.style.display = 'none';
      });
    }
    detail.style.display = 'flex';
    const body = detail.querySelector('.empi-create-detail__body');
    if (body) body.scrollTop = 0;
  }
  function closeCreateDetail() {
    const detail = document.getElementById('modal-empi-create');
    const page = document.getElementById('page-hr-info-mgmt');
    if (detail) detail.style.display = 'none';
    if (page) {
      Array.from(page.children).forEach(ch => {
        if (ch === detail) return;
        if ('empiPrevDisplay' in ch.dataset) {
          ch.style.display = ch.dataset.empiPrevDisplay;
          delete ch.dataset.empiPrevDisplay;
        }
      });
    }
  }

  /* =================================================================
   * ============ 인사정보카드 (Layer Modal) — 신규 개편 ============
   * =================================================================
   *   기존 OC drawer(`#empi-detail-pane`) 와 병행. 임직원 성명/사번 클릭 시
   *   본 모달을 우선 사용. 5탭 구조 (기본 정보 / 인사 정보 / 급여 정보 / 이력·현황 / 입사 서류).
   *
   *   1단계 구현 범위:
   *     · 모달 스캐폴드 (5탭 nav + 권한 토글)
   *     · 「1. 인사 정보」 탭 전체 (8 메인 섹션 + 서브 섹션 + 테이블 / label-value 필드 + 권한별 가시성·마스킹)
   *     · 나머지 4개 탭은 placeholder ("준비중") — 다음 단계에서 채움
   *
   *   권한 정책 (데모 — 모달 상단 토글로 즉시 전환 가능):
   *     · hr_admin : 모든 비공개 섹션 노출 + 주민번호 마스킹 해제(눈 아이콘) 가능
   *     · employee : 비공개 섹션은 「권한이 없어 비공개 처리된 항목입니다」 안내로 대체 + 주민번호 마스킹 고정
   * ================================================================= */

  /* --- 카드 STATE (모달 인스턴스 단위) --- */
  const CARD_STATE = {
    emp: null,             // 현재 보고있는 emp
    tab: 'personal',       // personal | contract | payroll | history | docs
    historyTab: 'appoint', // 인사 이력 탭 sub-tab: appoint | attendance | evaluation | event | retirement
    role: 'hr_admin',      // hr_admin | employee
    rrnRevealed: false,    // 주민번호 마스킹 해제 여부 (hr_admin 만)
    histPages: {},         // 이력·현황 탭 — 표(현황/이력)별 현재 페이지 {key: page}
    cardRoot: null,        // 렌더 루트 — null 이면 모달, 값이 있으면 해당 컨테이너(내 정보 페이지)
    reviewDockMin: false,  // 등록 검토 Floating Dock 접힘 여부 (검토 진입 시에만 노출)
  };
  /* 카드 렌더 루트 — 모달(기본) 또는 내 정보 페이지 컨테이너. 헤더/본문/이벤트 위임이 공유한다. */
  function cardRootEl() { return CARD_STATE.cardRoot || document.getElementById('modal-empi-card'); }
  function canViewPrivate() { return CARD_STATE.role === 'hr_admin'; }
  /* 인사 정보 탭 편집 권한 — 당사자(본인) 만 수정·추가 가능. 데모에서는 employee role 을 당사자로 매핑.
   *   당사자가 편집해도 그대로 적용되지 않고 인사담당자 결재가 필요(변경 승인 요청 모달). */
  function canEditPersonal() { return CARD_STATE.role === 'employee'; }
  /* 고용·계약 정보 탭 편집 권한 — 인사담당자만. (당사자는 발령/계약 변경 권한 없음) */
  function canEditEmployment() { return CARD_STATE.role === 'hr_admin'; }
  /* 내 정보(셀프서비스) 화면 여부 — GNB 프로필 > 내 정보로 진입한 본인 카드.
   *   이 화면은 열람 전용: 각 섹션의 편집/추가/서명요청 등 수정 액션과 일부 관리용 섹션을 숨긴다. */
  function isMyInfoView() {
    return CARD_STATE.selfService === true
      || !!(CARD_STATE.cardRoot && CARD_STATE.cardRoot.id === 'page-my-info');
  }

  /* --- 모달 HTML 스캐폴드 --- */
  function injectCardModal() {
    if (document.getElementById('modal-empi-card')) return;
    const html = `
<div class="modal-backdrop" id="modal-empi-card" data-modal-id="empi-card">
  <div class="modal modal--xl" style="max-width:1280px;height:92vh;display:flex;flex-direction:column;padding:0;border-radius:10px;overflow:hidden;">
    <!-- 헤더 -->
    <div class="modal__header" style="padding:18px 22px;display:flex;align-items:center;gap:16px;border-bottom:1px solid var(--color-divider);background:var(--color-surface);">
      <div style="display:flex;align-items:center;gap:14px;flex:1;min-width:0;">
        <span data-empi-card-avatar style="flex-shrink:0;display:inline-block;padding:3px;background:var(--color-surface);border:1px solid var(--color-divider);border-radius:6px;line-height:0;"></span>
        <div style="min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <div class="modal__title" style="font-size:18px;margin:0;font-weight:var(--fw-semibold);letter-spacing:-0.3px;" data-empi-card-name></div>
            <span data-empi-card-dday></span>
          </div>
          <div style="color:var(--color-text-muted);font-size:13px;margin-top:3px;" data-empi-card-sub></div>
        </div>
      </div>
      <button type="button" data-empi-card-pdf title="인사기록카드 PDF 출력" style="flex-shrink:0;display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--color-text-sub);background:transparent;border:1px solid var(--color-border);padding:4px 10px;border-radius:5px;cursor:pointer;line-height:1;">${(window.Icons && window.Icons.printer || '').replace('width="16" height="16"', 'width="14" height="14"')}PDF 출력</button>
      <button class="modal__close" data-modal-close type="button" aria-label="닫기" style="font-size:18px;">✕</button>
    </div>
    <!-- 탭 네비 (UI Kit .tabs.tabs--underline + .tabs__nav 구조 준수)
         tab 버튼 padding 을 14px 16px 로 살짝 키워 인사정보카드 전용으로만 탭 높이 확대. -->
    <div style="border-bottom:1px solid var(--color-divider);background:var(--color-surface);padding:0 22px;">
      <div class="tabs tabs--underline" data-empi-card-tabs>
        <div class="tabs__nav">
          <button type="button" class="tabs__tab is-active" data-tab="personal" style="padding:14px 18px;font-size:var(--fs-base);">기본 정보</button>
          <button type="button" class="tabs__tab" data-tab="contract" style="padding:14px 18px;font-size:var(--fs-base);">인사 정보</button>
          <button type="button" class="tabs__tab" data-tab="payroll" style="padding:14px 18px;font-size:var(--fs-base);">급여 정보</button>
          <button type="button" class="tabs__tab" data-tab="history" style="padding:14px 18px;font-size:var(--fs-base);">이력·현황</button>
          <button type="button" class="tabs__tab" data-tab="docs" style="padding:14px 18px;font-size:var(--fs-base);">서류 보관함</button>
        </div>
      </div>
    </div>
    <!-- 탭 본문 (스크롤) -->
    <div class="modal__body" style="flex:1;overflow:auto;background:var(--color-surface-alt);padding:20px 22px;" data-empi-card-body></div>
  </div>
</div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
  }

  /* --- 공통 헬퍼 — 디자인 리프레시 --- */
  /* SVG 아이콘 (인사정보카드 전용 소형 아이콘) */
  const ICO_LOCK = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
  const ICO_EYE  = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const ICO_EYE_OFF = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
  const ICO_EYE_LG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;

  /* 비공개 라벨만 표시 — 공개는 기본값이라 라벨 생략 (시각 노이즈 감소).
   *   회색 글씨 + 회색 테두리 + 소형 radius (subtle / muted) */
  function visibilityPill(vis) {
    /* 일반 직원은 타인 인사카드를 볼 수 없어 공개/비공개 구분이 불필요 → 라벨 미표시. */
    return '';
  }
  function tagPill(text) {
    if (!text) return '';
    return `<span style="display:inline-flex;align-items:center;padding:2px 8px;border:1px solid var(--color-border);border-radius:5px;color:var(--color-text-muted);font-size:11px;font-weight:var(--fw-regular);background:var(--color-surface);line-height:1.5;">${esc(text)}</span>`;
  }

  /* 섹션 헤더 우측 액션 버튼 — Flex 스타일 [변경]/[추가] 차용. 데모는 [편집] 단일 ghost.
   *   opts.actionsDisabled === true 인 경우 버튼을 disabled + 회색 톤으로 렌더. */
  function sectionActionsHTML(opts) {
    const actions = opts.actions || (opts.editable ? ['edit'] : []);
    if (!actions.length) return '';
    const dis = !!opts.actionsDisabled;
    const baseStyle = dis
      ? 'font-size:12px;color:var(--color-text-muted);background:var(--color-surface-alt);border:1px solid var(--color-border);padding:3px 10px;border-radius:5px;cursor:not-allowed;opacity:0.6;'
      : 'font-size:12px;color:var(--color-text-sub);background:transparent;border:1px solid var(--color-border);padding:3px 10px;border-radius:5px;cursor:pointer;';
    const disAttr = dis ? ' disabled' : '';
    const btn = (a) => {
      if (a === 'edit') return `<button type="button"${disAttr} data-empi-card-section-act="edit" data-empi-card-section="${esc(opts.key || '')}" style="${baseStyle}">편집</button>`;
      if (a === 'add')  return `<button type="button"${disAttr} data-empi-card-section-act="add"  data-empi-card-section="${esc(opts.key || '')}" style="${baseStyle}">+ 추가</button>`;
      if (a === 'log')  return `<button type="button"${disAttr} data-empi-card-section-act="log"  data-empi-card-section="${esc(opts.key || '')}" style="${baseStyle}">이력</button>`;
      /* 변경 요청 — 내 정보(셀프서비스) 전용. 기존 편집 버튼과 동일 스타일. */
      if (a === 'request') return `<button type="button" data-empi-card-section-act="request" data-empi-card-section="${esc(opts.key || '')}" style="${baseStyle}">변경 요청</button>`;
      /* 신청 — 내 정보(셀프서비스) 전용. 전자결재 상신(서류 첨부) → 인사담당자 적용. */
      if (a === 'apply') return `<button type="button" data-empi-card-section-act="apply" data-empi-card-section="${esc(opts.key || '')}" style="${baseStyle}">신청</button>`;
      return '';
    };
    return `<div style="display:flex;align-items:center;gap:4px;">${actions.map(btn).join('')}</div>`;
  }

  function sectionShellHTML(opts) {
    /* 섹션 카드 — Flex 스타일 참고. 메인(level 1) / 서브(level 2) 일관된 톤.
     *   헤더: 타이틀 (+ optional 설명) | 가시성 pill / tag / 액션 버튼 */
    const pill = visibilityPill(opts.visibility);
    const tag  = opts.tag ? tagPill(opts.tag) : '';
    const acts = sectionActionsHTML(opts);
    /* descBlock — 설명 문구를 타이틀 오른쪽 인라인이 아니라 타이틀 아래 줄로 표시
       (긴 설명이 타이틀 옆에서 어색하게 줄바꿈되는 것을 방지. 예: 서류 보관함의 회사/제출 서류) */
    const descBlock = !!opts.descBlock;
    const desc = opts.description
      ? `<span style="font-size:12px;color:var(--color-text-muted);${descBlock ? 'line-height:1.5;' : 'margin-left:8px;'}font-weight:var(--fw-regular);">${esc(opts.description)}</span>`
      : '';
    /* 타이틀+설명 컨테이너 — descBlock 이면 세로 스택(타이틀 위 / 설명 아래) */
    const titleWrap = descBlock
      ? 'display:flex;flex-direction:column;align-items:flex-start;gap:3px;min-width:0;flex:1;'
      : 'display:flex;align-items:baseline;gap:8px;min-width:0;flex:1;';
    const level = opts.level || 1;
    if (level === 1) {
      return `
        <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:8px;margin-bottom:16px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,0.04);">
          <header style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--color-divider);gap:10px;">
            <div style="${titleWrap}">
              <span style="font-size:15px;font-weight:var(--fw-semibold);color:var(--color-text);letter-spacing:-0.2px;">${esc(opts.title)}</span>
              ${desc}
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
              <div style="display:flex;align-items:center;gap:6px;">${pill}${tag}</div>
              ${acts}
            </div>
          </header>
          <div style="padding:14px 18px 18px;">${opts.body || ''}</div>
        </section>
      `;
    }
    return `
      <section style="border:1px solid var(--color-divider);border-radius:6px;margin-top:14px;overflow:hidden;background:var(--color-surface);">
        <header style="display:flex;align-items:center;justify-content:space-between;padding:9px 14px;border-bottom:1px solid var(--color-divider);background:var(--color-surface-alt);gap:10px;">
          <div style="${titleWrap}">
            <span style="font-size:13px;font-weight:var(--fw-semibold);color:var(--color-text);">${esc(opts.title)}</span>
            ${desc}
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
            <div style="display:flex;align-items:center;gap:6px;">${pill}${tag}</div>
            ${acts}
          </div>
        </header>
        <div style="padding:12px 14px;background:var(--color-surface);">${opts.body || ''}</div>
      </section>
    `;
  }

  function privateBlockedHTML(label) {
    return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--color-text-muted);padding:36px 16px;background:var(--color-surface-alt);border:1px dashed var(--color-divider);border-radius:6px;">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      <span style="font-size:13px;">권한이 없어 비공개 처리된 항목입니다</span>
    </div>`;
  }

  function fieldRowHTML(label, value, opts) {
    /* label + value 한 줄. opts: { required, full, html, mono }
     *   - 점선 borders 제거하고 padding 으로 리듬 형성 + 호버시 hover bg */
    const o = opts || {};
    const reqMark = o.required ? `<em style="color:var(--color-danger);margin-right:4px;font-style:normal;">*</em>` : '';
    const inner = o.html ? value : (value == null || value === '' ? `<span style="color:var(--color-text-muted);">-</span>` : esc(value));
    const colWidth = o.full ? '100%' : '50%';
    const valStyle = o.mono ? 'font-family:monospace;letter-spacing:0.3px;' : '';
    return `
      <div class="empi-fld" style="display:flex;align-items:center;padding:9px 0;width:${colWidth};box-sizing:border-box;${o.full ? '' : 'padding-right:24px;'}min-height:36px;border-bottom:1px solid var(--color-divider);">
        <div class="empi-fld__label" style="width:120px;flex-shrink:0;color:var(--color-text-muted);font-size:13px;">${reqMark}${esc(label)}</div>
        <div class="empi-fld__val" style="flex:1;font-size:14px;color:var(--color-text);min-width:0;overflow-wrap:break-word;font-weight:var(--fw-medium);${valStyle}">${inner}</div>
      </div>
    `;
  }
  function fieldGridHTML(rows, opts) {
    const o = opts || {};
    const grid = `<div class="empi-fldgrid" style="display:flex;flex-wrap:wrap;">
      ${rows.map(r => fieldRowHTML(r[0], r[1], r[2])).join('')}
    </div>`;
    /* scroll — 좁은 폭(≤580px)에서 라벨+값 칸이 으스러지며 값/버튼이 줄바꿈되는 것을 막기 위해
       가로 스크롤 래퍼로 감싼다. 그리드에 min-width 가 적용돼 값이 자연스러운 폭을 유지한다.
       (계약 정보처럼 상태 pill + 다중 버튼이 한 행에 들어가는 섹션에 사용) */
    return o.scroll ? `<div class="empi-fldscroll">${grid}</div>` : grid;
  }

  /* === Flex 스타일 row — 아이콘 + 라벨 + 인라인 다중값 (Flex 인사카드 톤 차용) === */
  const ICO = {
    user:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>`,
    at:        `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/></svg>`,
    briefcase: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
    id:        `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="9" cy="12" r="2.5"/><path d="M14 10h5M14 14h5"/></svg>`,
    globe:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
    phone:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.63 2.61a2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6.09 6.09l1.47-1.29a2 2 0 0 1 2.11-.45c.84.3 1.71.51 2.61.63A2 2 0 0 1 22 16.92z"/></svg>`,
    pin:       `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
    type:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>`,
    cake:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/><path d="M2 21h20"/><path d="M7 8v3M12 8v3M17 8v3M7 4h.01M12 4h.01M17 4h.01"/></svg>`,
    layers:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
    map:       `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>`,
    hash:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>`,
    calendar:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  };

  /* 2-col / 1-col flex 셀 헬퍼 — 한 row 안에 좌·우 두 cell 또는 풀폭 1 cell.
   *   각 cell 구조: 아이콘(18px) + 라벨(100px muted) + 콘텐츠(flex). 셀 사이에 수직 hairline divider. */
  function flexCell(icon, label, content) {
    return `
      <div class="empi-cell" style="display:flex;align-items:center;padding:14px 18px;gap:10px;min-height:48px;flex:1;min-width:0;">
        <span style="width:18px;color:var(--color-text-muted);flex-shrink:0;display:flex;align-items:center;justify-content:center;line-height:0;">${icon || ''}</span>
        <span style="width:100px;font-size:13px;color:var(--color-text-muted);flex-shrink:0;">${esc(label)}</span>
        <span style="flex:1;font-size:14px;color:var(--color-text);min-width:0;display:inline-flex;align-items:center;flex-wrap:wrap;">${content}</span>
      </div>
    `;
  }
  function flex2ColRow(left, right, opts) {
    const o = opts || {};
    const borderTop = o.first ? '' : 'border-top:1px solid var(--color-divider);';
    return `
      <div class="empi-row2" style="display:flex;align-items:stretch;${borderTop}">
        ${flexCell(left.icon, left.label, left.content)}
        <div class="empi-cell__div" style="width:1px;background:var(--color-surface-alt);"></div>
        ${right ? flexCell(right.icon, right.label, right.content) : '<div class="empi-cell empi-cell--empty" style="flex:1;"></div>'}
      </div>
    `;
  }
  function flex1ColRow(icon, label, content, opts) {
    const o = opts || {};
    const borderTop = o.first ? '' : 'border-top:1px solid var(--color-divider);';
    return `<div style="${borderTop}">${flexCell(icon, label, content)}</div>`;
  }
  function valOrPlaceholder(v) {
    return v ? esc(v) : '<span style="color:var(--color-text-muted);font-style:italic;">입력하기</span>';
  }

  /* 인라인 다중값 빌더 — 한 row 안에서 여러 sub-label/value 페어를 가로로 배치.
   *   items: [{ label?, value, raw? }, ...] — raw=true 면 esc 안하고 그대로 HTML 사용
   *   값 span 도 inline-flex 로 만들어 안쪽 button/pill/text 가 vertical 중앙 정렬되도록 보장. */
  function flexInline(items) {
    return items.map(it => {
      let html = '';
      if (it.label)  html += `<span style="color:var(--color-text-muted);font-size:13px;margin-right:6px;">${esc(it.label)}</span>`;
      if (it.value != null) {
        const v = it.raw ? it.value : (it.value === '' ? '<span style="color:var(--color-text-muted);font-style:italic;">입력하기</span>' : esc(it.value));
        html += `<span style="display:inline-flex;align-items:center;gap:0;">${v}</span>`;
      }
      return `<span style="display:inline-flex;align-items:center;white-space:nowrap;">${html}</span>`;
    }).join('<span style="display:inline-block;width:24px;flex-shrink:0;"></span>');
  }
  /* Flex row — 아이콘 + 라벨 + 콘텐츠 (한 줄 inline flex, hairline 하단 보더, 충분한 vertical breathing) */
  function flexRow(icon, label, contentHTML, opts) {
    const o = opts || {};
    return `
      <div style="display:flex;align-items:center;padding:14px 18px;border-top:1px solid var(--color-divider);min-height:48px;gap:10px;${o.first ? 'border-top:none;' : ''}">
        <div style="width:20px;color:var(--color-text-muted);flex-shrink:0;display:flex;align-items:center;justify-content:center;line-height:0;">${icon || ''}</div>
        <div style="width:140px;flex-shrink:0;font-size:13px;color:var(--color-text-muted);">${esc(label)}</div>
        <div style="flex:1;font-size:14px;color:var(--color-text);min-width:0;display:flex;flex-wrap:wrap;align-items:center;">${contentHTML}</div>
      </div>
    `;
  }
  /* 작은 pill 모음 — Flex 스타일 (소형, 부드러운 톤) */
  function pillWarm(text) {
    return `<span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:5px;background:#FFF4E0;color:#C17900;font-size:11px;font-weight:var(--fw-medium);margin-left:6px;line-height:1.5;">${esc(text)}</span>`;
  }
  function pillCircle(text) {
    return `<span style="display:inline-flex;align-items:center;padding:1px 7px;border:1px solid var(--color-border);border-radius:50px;font-size:11px;color:var(--color-text-muted);background:var(--color-surface);margin-left:6px;line-height:1.5;">${esc(text)}</span>`;
  }
  function pillChip(text) {
    return `<span style="display:inline-flex;align-items:center;padding:2px 8px;border:1px solid var(--color-border);border-radius:5px;font-size:11px;color:var(--color-text-muted);background:var(--color-surface);margin-left:6px;line-height:1.5;">${esc(text)}</span>`;
  }
  /* 재직 기간 계산 — 입사일로부터 오늘까지 */
  function workDurationText(joinDate) {
    if (!joinDate) return '';
    const join = new Date(joinDate);
    if (isNaN(join.getTime())) return '';
    const now = new Date('2026-05-21');  // 데모: 현재 날짜 고정
    let years  = now.getFullYear() - join.getFullYear();
    let months = now.getMonth() - join.getMonth();
    let days   = now.getDate() - join.getDate();
    if (days < 0)   { months -= 1; days += 30; }
    if (months < 0) { years -= 1; months += 12; }
    const parts = [];
    if (years > 0)  parts.push(`${years}년`);
    if (months > 0) parts.push(`${months}개월`);
    parts.push(`${Math.max(0, days)}일`);
    return parts.join(' ') + ' 재직';
  }

  function dataTableHTML(headers, rows, opts) {
    /* 일반 테이블 — striped/hover 없는 깔끔한 hairline 톤. 빈 데이터면 placeholder. */
    if (!rows || !rows.length) {
      return `<div style="text-align:center;color:var(--color-text-muted);font-size:13px;padding:24px;background:var(--color-surface-alt);border:1px dashed var(--color-divider);border-radius:6px;">등록된 내용이 없습니다.</div>`;
    }
    const thStyle = 'font-size:12px;font-weight:var(--fw-semibold);color:var(--color-text-muted);text-align:left;padding:10px 12px;border-bottom:1px solid var(--color-border);background:var(--color-surface-alt);';
    const tdStyle = 'font-size:13px;color:var(--color-text);padding:11px 12px;border-bottom:1px solid var(--color-divider);';
    return `<div class="empi-tblwrap"><table class="empi-tbl empi-tbl--data" style="width:100%;border-collapse:collapse;background:var(--color-surface);border:1px solid var(--color-divider);border-radius:6px;overflow:hidden;">
      <thead><tr>${headers.map(h => `<th style="${thStyle}">${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r, i) => {
        const isLast = i === rows.length - 1;
        const rowTd = isLast ? tdStyle.replace('border-bottom:1px solid var(--color-divider);', 'border-bottom:none;') : tdStyle;
        return `<tr>${r.map(c => `<td style="${rowTd}">${c == null || c === '' ? '<span style="color:var(--color-text-muted);">-</span>' : esc(c)}</td>`).join('')}</tr>`;
      }).join('')}</tbody>
    </table></div>`;
  }

  /* 속성 테이블 — label/value 스펙 시트 형태. 기본/고용/소속 정보 등 키-값 데이터에 사용.
   *   rows: [[label, value, opts?], ...]  opts: { html, full }
   *   tableOpts: { cols } — 1(기본) 또는 2 (label-value 페어 두 쌍을 한 행에 배치). full 옵션 행은 colspan 전체. */
  function kvTableHTML(rows, tableOpts) {
    if (!rows || !rows.length) return '';
    const cols = (tableOpts && tableOpts.cols === 2) ? 2 : 1;
    const labelBase = 'color:var(--color-text-muted);font-size:13px;padding:11px 14px;vertical-align:top;background:var(--color-surface-alt);';
    const valueBase = 'font-size:13px;color:var(--color-text);padding:11px 14px;font-weight:var(--fw-medium);word-break:break-all;';
    const lTd = (last) => labelBase + (last ? '' : 'border-bottom:1px solid var(--color-divider);');
    const vTd = (last) => valueBase + (last ? '' : 'border-bottom:1px solid var(--color-divider);');
    const cellPair = (r) => {
      const o = r[2] || {};
      const inner = o.html ? r[1] : (r[1] == null || r[1] === '' ? '<span style="color:var(--color-text-muted);">-</span>' : esc(r[1]));
      return { label: esc(r[0]), value: inner, full: !!o.full };
    };

    if (cols === 1) {
      return `<div class="empi-tblwrap"><table class="empi-tbl" style="width:100%;border-collapse:collapse;background:var(--color-surface);border:1px solid var(--color-divider);border-radius:6px;overflow:hidden;">
        <colgroup><col style="width:140px;"><col></colgroup>
        <tbody>${rows.map((r, i) => {
          const last = i === rows.length - 1;
          const p = cellPair(r);
          return `<tr><td style="${lTd(last)}">${p.label}</td><td style="${vTd(last)}">${p.value}</td></tr>`;
        }).join('')}</tbody>
      </table></div>`;
    }

    /* cols === 2 : label-value 페어 두 쌍을 한 행에. opts.full 인 행은 colspan=3 으로 전체 폭. */
    const lines = [];
    let buf = null;
    rows.forEach(r => {
      const p = cellPair(r);
      if (p.full) {
        if (buf) { lines.push([buf, null]); buf = null; }
        lines.push([p, 'full']);
      } else if (buf) {
        lines.push([buf, p]); buf = null;
      } else {
        buf = p;
      }
    });
    if (buf) lines.push([buf, null]);
    const trs = lines.map((line, i) => {
      const last = i === lines.length - 1;
      const [a, b] = line;
      if (b === 'full') {
        return `<tr><td style="${lTd(last)}">${a.label}</td><td style="${vTd(last)}" colspan="3">${a.value}</td></tr>`;
      }
      return `<tr>
        <td style="${lTd(last)}">${a.label}</td>
        <td style="${vTd(last)}">${a.value}</td>
        <td style="${lTd(last)}">${b ? b.label : ''}</td>
        <td style="${vTd(last)}">${b ? b.value : ''}</td>
      </tr>`;
    });
    return `<div class="empi-tblwrap"><table class="empi-tbl empi-tbl--2col" style="width:100%;border-collapse:collapse;background:var(--color-surface);border:1px solid var(--color-divider);border-radius:6px;overflow:hidden;table-layout:fixed;">
      <colgroup>
        <col style="width:140px;"><col>
        <col style="width:140px;"><col>
      </colgroup>
      <tbody>${trs.join('')}</tbody>
    </table></div>`;
  }

  /* --- 주민번호 mock + 마스킹 --- */
  function mockRRN(emp) {
    /* 생년월일에서 YYMMDD 만들고 뒷자리는 emp.id 시드로 7자리 생성 — 데모용 */
    const birth = emp.birth || '1990-01-01';
    const [y,m,d] = birth.split('-');
    const yy = (y || '1990').slice(-2);
    const mm = (m || '01').padStart(2,'0');
    const dd = (d || '01').padStart(2,'0');
    const seed = String(emp.id || '').replace(/\D/g,'').slice(-4) || '0001';
    const back = (Number(seed) % 9 === 0 ? '2' : '1') + seed.padStart(6,'0').slice(0,6);
    return `${yy}${mm}${dd}-${back}`;
  }
  function rrnFieldValueHTML(emp) {
    /* 신규 등록 — 주민번호 미입력 시 mock 대신 빈값 '-' 표시 */
    if (emp._noMock && !emp.ssn) {
      return `<span style="color:var(--color-text-muted);">-</span>`;
    }
    const full = emp.ssn || mockRRN(emp);
    /* 주민번호는 항상 마스킹 고정 — 권한과 무관하게 앞 6자리 + 성별 1자리만 노출, 뒷자리는 노출 불가 (눈 토글 제거) */
    const masked = full.slice(0, 8) + '●●●●●●';
    /* vertical 중앙 정렬 — 텍스트·외부 pill 이 한 baseline 위에 떨어지도록 inline-flex 로 감쌈. */
    return `<span style="display:inline-flex;align-items:center;font-family:'SF Mono','Consolas',monospace;letter-spacing:1px;line-height:1.5;">${esc(masked)}</span>`;
  }

  /* --- Mock seed 테이블 데이터 (학력·경력·가족·자격·어학 등) --- */
  function seedNum(id, salt) {
    const base = String(id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return Math.abs(base + (salt || 0));
  }
  function mockEducation(emp) {
    const n = seedNum(emp.id, 1) % 3;
    const list = [
      ['서울대학교',     '컴퓨터공학과', '2014-03', '2018-02', '졸업'],
      ['고려대학교 대학원','경영학과',     '2018-03', '2020-08', '졸업'],
    ];
    return list.slice(0, n + 1);
  }
  function mockCareer(emp) {
    const n = seedNum(emp.id, 2) % 3;
    const list = [
      ['(주)네이버',     '2018-03 ~ 2021-05', '대리',    '백엔드 서비스 개발'],
      ['카카오엔터프라이즈','2021-06 ~ 2023-12', '과장',    'B2B 솔루션 PM'],
    ];
    return list.slice(0, n + 1);
  }
  function mockFamily(emp) {
    const n = seedNum(emp.id, 3) % 3;
    const list = [
      ['배우자', '김미영', '여', '1992-04-12', 'Y'],
      ['자녀',   '홍준서', '남', '2020-07-21', 'Y'],
      ['모',     '박순자', '여', '1962-11-03', 'N'],
    ];
    return list.slice(0, n + 1);
  }
  function mockLicenses(emp) {
    const n = seedNum(emp.id, 4) % 3;
    const list = [
      ['정보처리기사',     '국가기술자격',  '2017-05-22', '한국산업인력공단'],
      ['SQLD',             '국가공인',      '2019-09-14', '한국데이터산업진흥원'],
    ];
    return list.slice(0, n + 1);
  }
  function mockLanguages(emp) {
    const n = seedNum(emp.id, 5) % 3;
    const list = [
      ['영어',  '상', '상', '상'],
      ['일본어','중', '중', '상'],
    ];
    return list.slice(0, n + 1);
  }

  /* === 인사 이력 탭 mock 데이터 (모두 연동 데이터 가정 — 데모용 seed 기반 생성) === */
  /* 서준호(경영지원본부 임원) — 장기근속 임원 데모용 풍부한 이력/현황 (페이지네이션 시연용).
   *   각 표에 5건 초과 데이터를 넣어 페이지네이션 동작을 보여준다. */
  function isExecDemo(emp) { return emp && emp.name === '서준호'; }

  function mockAppointHistory(emp) {
    /* 입사 이후 발령 이력. 현재 발령은 항상 첫 행(최신·재직중). */
    if (isExecDemo(emp)) {
      return [
        ['경영지원본부', '2024-01-01 ~ 재직중',      '전무', '경영지원 총괄'],
        ['경영지원본부', '2021-01-01 ~ 2023-12-31', '상무', '경영기획·예산'],
        ['기획조정실',   '2018-01-01 ~ 2020-12-31', '이사', '중장기 경영전략'],
        ['재무팀',       '2015-01-01 ~ 2017-12-31', '부장', '재무·자금관리'],
        ['인사팀',       '2012-01-01 ~ 2014-12-31', '차장', '인사·노무 총괄'],
        ['인사팀',       '2009-01-01 ~ 2011-12-31', '과장', '채용·평가'],
        ['총무팀',       '2006-01-01 ~ 2008-12-31', '대리', '총무·자산관리'],
        ['총무팀',       '2003-03-01 ~ 2005-12-31', '사원', '총무 일반'],
      ];
    }
    const join = emp.joinDate || '2022-01-01';
    const list = [{ dept: emp.dept || '경영지원본부', period: `${join} ~ 재직중`, rank: emp.rank || '사원', job: emp.job || '인사' }];
    const extra = seedNum(emp.id, 10) % 3;
    if (extra >= 1) list.unshift({ dept: '생산본부', period: '2022-03-01 ~ 2023-12-31', rank: '대리', job: '품질관리' });
    if (extra >= 2) list.unshift({ dept: '개발팀',  period: '2020-01-01 ~ 2022-02-28', rank: '사원', job: '개발' });
    return list.map(r => [r.dept, r.period, r.rank, r.job]);
  }
  function mockWorksiteHistory(emp) {
    /* 근무지 변경 이력 — 첫 행이 현재 근무지(최신). emp.site 를 현재 근무지로 사용.
       컬럼: 변경일 / 기존 근무지 / 신규 근무지. */
    const cur = emp.site || '성수동';
    if (isExecDemo(emp)) {
      return [
        ['2024-01-01', '강남사옥', cur],
        ['2021-07-01', '평택공장', '강남사옥'],
        ['2018-03-01', '본사',     '평택공장'],
        ['2015-01-01', '-',        '본사'],
      ];
    }
    const join = emp.joinDate || '2022-01-01';
    const seed = seedNum(emp.id, 12) % 3;
    if (seed === 0) {
      /* 변경 이력 없음 — 입사 시 배치 1건 */
      return [[join, '-', cur]];
    }
    if (seed === 1) {
      return [
        ['2024-07-01', '평택공장', cur],
        [join,         '-',        '평택공장'],
      ];
    }
    return [
      ['2025-01-01', '본사',     cur],
      ['2023-03-01', '평택공장', '본사'],
      [join,         '-',        '평택공장'],
    ];
  }
  function mockAttendance(emp) {
    /* 최근 N개월 — 월별 지각(분)/조퇴(분)/결근(일). 단위는 컬럼 헤더에 표기. */
    const months = isExecDemo(emp) ? 30 : 18;   // 임원은 30개월치(6페이지) 시연
    const rows = [];
    let y = 2026, mo = 5;
    for (let i = 0; i < months; i++) {
      const seed = seedNum(emp.id || '서준호', 11) + i;
      rows.push([`${y}-${String(mo).padStart(2, '0')}`, `${(seed * 7) % 60}`, `${(seed * 3) % 30}`, `${seed % 2}일`]);
      mo--; if (mo === 0) { mo = 12; y--; }
    }
    return rows;
  }
  function mockLeaveStatus(emp) {
    /* 연차 — 첫 행은 진행중. 임원은 7년치 시연. */
    if (isExecDemo(emp)) {
      return [
        ['2026', '2026-01-01', '25일', '6일',  '19일', '진행중'],
        ['2025', '2025-01-01', '24일', '20일', '4일',  '이월'],
        ['2024', '2024-01-01', '23일', '23일', '0일',  '소진'],
        ['2023', '2023-01-01', '22일', '18일', '4일',  '이월'],
        ['2022', '2022-01-01', '21일', '21일', '0일',  '소진'],
        ['2021', '2021-01-01', '20일', '17일', '3일',  '이월'],
        ['2020', '2020-01-01', '20일', '20일', '0일',  '소진'],
      ];
    }
    const years = ['2026','2025','2024'];
    return years.map((y, i) => {
      const total = 15 + (seedNum(emp.id, 12) % 5);
      const used  = i === 0 ? (seedNum(emp.id, 12) % 8) : total - (seedNum(emp.id, 12 + i) % 4);
      const remaining = Math.max(0, total - used);
      return [y, `${y}-01-01`, `${total}일`, `${used}일`, `${remaining}일`, i === 0 ? '진행중' : (remaining === 0 ? '소진' : '이월')];
    });
  }
  function mockEvaluation(emp) {
    /* 평가 — 점수 + S/A/B/C 등급. 임원은 10년치 시연. */
    if (isExecDemo(emp)) {
      return [
        ['2024', '97점', 'S'], ['2023', '95점', 'S'], ['2022', '92점', 'S'],
        ['2021', '88점', 'A'], ['2020', '90점', 'S'], ['2019', '86점', 'A'],
        ['2018', '84점', 'A'], ['2017', '82점', 'A'], ['2016', '79점', 'B'],
        ['2015', '85점', 'A'],
      ];
    }
    const years = ['2024','2023'];
    return years.map((y, i) => {
      const score = 75 + ((seedNum(emp.id, 13) + i * 7) % 25);
      const grade = score >= 90 ? 'S' : score >= 80 ? 'A' : score >= 70 ? 'B' : 'C';
      return [y, `${score}점`, grade];
    });
  }
  function mockReward(emp) {
    if (isExecDemo(emp)) {
      return [
        ['포상', '2024-12-30', '경영혁신 기여 — 원가절감 목표 초과 달성', '대표이사 표창 + 부상'],
        ['포상', '2023-12-29', '연말 우수 경영진 선정',                  '특별상 + 인센티브'],
        ['포상', '2021-11-15', '신규 사업 안착 공로',                    '공로패'],
        ['포상', '2019-06-20', '근속 15주년 장기근속',                   '근속 표창 + 부상'],
        ['징계', '2018-09-03', '안전관리 책임 — 협력사 사고 관리감독',   '주의'],
        ['포상', '2016-12-28', '인사제도 개편 기여',                     '우수상'],
        ['포상', '2014-05-10', '노사 상생 협약 체결 공로',               '표창'],
      ];
    }
    const n = seedNum(emp.id, 14) % 3;
    const list = [
      ['포상', '2024-12-30', '연말 우수사원 선정', '특별상 + 부상'],
      ['징계', '2023-05-12', '근태 불량', '경고'],
    ];
    return list.slice(0, n);
  }
  function mockEventHistory(emp) {
    if (isExecDemo(emp)) {
      return [
        ['2025-09-14', '자녀 결혼',   '5일', '500,000원', '100,000원', ''],
        ['2024-10-12', '본인 회갑',   '3일', '300,000원', '100,000원', ''],
        ['2023-03-22', '부친 별세',   '5일', '500,000원', '200,000원', '경조사 휴가 사용'],
        ['2021-07-08', '모친 칠순',   '2일', '200,000원', '50,000원',  ''],
        ['2019-11-30', '자녀 대학입학', '0일', '100,000원', '-',        '축하금'],
        ['2017-02-18', '본인 결혼기념(은혼)', '0일', '200,000원', '-',  '복지포인트 별도'],
      ];
    }
    const n = seedNum(emp.id, 15) % 3;
    const list = [
      ['2024-10-12', '본인 결혼', '5일', '500,000원', '100,000원', ''],
      ['2023-03-22', '부친 별세', '5일', '500,000원', '200,000원', '경조사 휴가 사용'],
    ];
    return list.slice(0, n);
  }
  /* 퇴직연금 현황(월별 납입 내역) — [퇴사 관리 > 퇴직연금 관리] 와 동일한 단일 소스(App.HRPension).
     관리 화면에서 월별 엑셀을 업로드하면 인사카드 퇴직 탭에도 그대로 반영된다.
     컬럼: 납입월 · 기준 임금(월) · 월 부담금 · 실제 납입금액 · 납입일 · 상태 */
  function mockPension(emp) {
    if (window.App && App.HRPension && App.HRPension.paymentRows) {
      return App.HRPension.paymentRows(emp.id) || [];
    }
    /* App.HRPension 미로드 시 폴백 (정상 환경에서는 도달하지 않음) */
    return [
      ['26/04', '3,500,000원', '291,666원', '291,666원', '26/04/20', '정상'],
      ['26/03', '3,500,000원', '291,666원', '291,666원', '26/03/20', '정상'],
    ];
  }
  function mockRetirement(emp) {
    /* 재직자는 빈 테이블, 퇴사자만 1행 */
    if (emp.status !== 'retired') return [];
    return [['2025-03-31', '개인 사정']];
  }
  /* 휴직 이력 — 전자결재 휴직 신청(육아휴직 본인/배우자·가족돌봄휴직) 승인 건의 누적.
     [계약·발령·휴직 > 휴직 관리] 화면과 동일한 흐름의 데이터(데모용 seed 생성).
     컬럼: 휴직유형 · 휴직기간 · 기간(일) · 복직(예정)일 · 현황 */
  function loaIsoMinus(iso, n) {
    const d = new Date(iso); if (isNaN(d.getTime())) return iso;
    d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10);
  }
  function mockLoaHistory(emp) {
    const rows = [];
    /* 현재 휴직중 — emp.onLeave/leaveReturnDate 기반 1행 구성 (육아휴직 1년 가정) */
    if (emp.onLeave && emp.leaveReturnDate) {
      const ret = emp.leaveReturnDate;            // 복직 예정일 (YYYY-MM-DD)
      const start = loaIsoMinus(ret, 365);
      const end   = loaIsoMinus(ret, 1);
      rows.push(['육아휴직(본인)', `${start} ~ ${end}`, '365일', ret, '휴직중']);
    }
    if (isExecDemo(emp)) {
      /* 임원 데모 — 과거 가족돌봄휴직 1건(복직완료) */
      rows.push(['가족돌봄휴직', '2016-04-01 ~ 2016-05-30', '60일', '2016-05-31', '복직완료']);
      return rows;
    }
    /* 과거 복직완료 이력 — seed 로 0~2건 */
    const n = seedNum(emp.id, 17) % 3;
    const past = [
      ['육아휴직(본인)',   '2023-03-04 ~ 2023-09-03', '184일', '2023-09-04', '복직완료'],
      ['가족돌봄휴직',     '2021-07-01 ~ 2021-08-29', '60일',  '2021-08-30', '복직완료'],
    ];
    return rows.concat(past.slice(0, n));
  }
  /* 퇴직연금 중도인출 이력 — [퇴사 관리 > 퇴직연금 관리] 와 동일한 단일 소스(App.HRPension) 사용.
     해당 화면에서 등록/삭제한 내역이 인사카드 퇴직 탭에 그대로 반영된다. 컬럼: 인출일자 · 인출금액 · 인출사유 */
  function mockPensionSettle(emp) {
    if (!window.App || !App.HRPension || !App.HRPension.withdrawalRows) return [];
    return App.HRPension.withdrawalRows(emp.id) || [];
  }
  /* 급여 계약 변동 이력 — 임금 계약 정보(임금형태·계약금액)가 바뀐 시점만 기록 (민감정보, 권한자 전용).
   *   월별 급여명세가 아니라 「임금 계약」 의 변경 이력 — 신규 계약 / 임금 조정 / 재계약 등.
   *   컬럼: 적용일 · 변경 구분 · 임금형태 · 계약금액 · 인상률 · 비고 */
  function mockWageContractHistory(emp) {
    /* 도급직은 회사 임금계약 대상 외 → 빈 테이블 */
    if (emp.contractOut) return [];
    const wageLabel = WAGE_TYPE_LABEL[emp.wageType] || '월급제';
    const unit = emp.wageType === 'hourly' ? '원/시급'
               : emp.wageType === 'annual' ? '원/연' : '원/월';
    /* 현재(가장 최근) 계약금액 — 계약 단위(시급/연봉/월급) 그대로 */
    let amt = (() => {
      const a = Number(String(emp.contractAmount || '').replace(/[^0-9]/g, ''));
      if (a) return a;
      const base = Number(String(emp.baseSalary || '').replace(/[^0-9]/g, ''));
      if (base && emp.wageType !== 'hourly') return base;
      if (emp.wageType === 'hourly') return 11000 + (seedNum(emp.id, 21) % 5) * 500;
      if (emp.wageType === 'annual') return (3000000 + (seedNum(emp.id, 21) % 20) * 100000) * 12;
      return 3000000 + (seedNum(emp.id, 21) % 20) * 100000;
    })();
    const count = isExecDemo(emp) ? 3 : 2;   /* 임원 데모는 변동 이력 1건 더 */
    const baseYear = 2026;
    const rows = [];
    for (let i = 0; i < count; i++) {
      const applyDate = `${baseYear - i}-01-01`;
      if (i === count - 1) {
        /* 가장 과거 = 신규(최초) 임금계약 */
        rows.push([applyDate, wageLabel, `${formatMoney(amt)}${unit}`]);
      } else {
        const prevAmt = Math.round(amt / 1.04);   /* 직전 대비 약 4% 인상 가정 */
        rows.push([applyDate, wageLabel, `${formatMoney(amt)}${unit}`]);
        amt = prevAmt;
      }
    }
    return rows;
  }

  /* =====================================================================
   * ============ 인사 정보 탭 — 8 메인 섹션 렌더링 ============
   * ===================================================================== */
  function renderSectionBasic(emp) {
    /* 증명사진 — 보편적인 3:4 비율 사각형(96×128). */
    const photoUrl = emp.photoUrl || '';
    const photoInner = photoUrl
      ? `<img src="${esc(photoUrl)}" alt="${esc(displayName(emp))}" style="width:100%;height:100%;object-fit:cover;display:block;" />`
      : `<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:var(--color-text-muted);background:var(--color-surface-alt);">
           <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>
           <span style="font-size:11px;">사진 없음</span>
         </div>`;

    /* Flex 스타일 — 아이콘 + 라벨 + 인라인 다중값. 페어를 의미 있게 그룹화. */
    const companyEmail = MILESTONES.idDone(emp) && emp.userId ? `${emp.userId}@swadpia.co.kr` : '';
    const name = displayName(emp);
    const ename = emp.ename || '';

    /* 입사 정보 — 입사일 + 재직기간 pill */
    const joinHTML = emp.joinDate
      ? `<span>${esc(dispYmd(emp.joinDate))}</span>${pillWarm(workDurationText(emp.joinDate))}`
      : `<span style="color:var(--color-text-muted);font-style:italic;">입력하기</span>`;

    /* 주민번호 — 마스킹 + 성별 circle pill + 생일 */
    const genderText = emp.gender === 'F' ? '여' : '남';
    const rrnInline = `${rrnFieldValueHTML(emp)}${pillCircle(genderText)}`;
    const birthHTML = emp.birth ? esc(dispYmd(emp.birth)) : '<span style="color:var(--color-text-muted);">-</span>';

    /* 주소 — 우편번호 chip (있으면) + 주소 본문 */
    let addressHTML;
    if (emp.address) {
      const zipMatch = String(emp.address).match(/^\[(\d{5})\]\s*(.*)$/);
      if (zipMatch) addressHTML = `<span>${esc(zipMatch[2])}</span>${pillChip(`우 ${zipMatch[1]}`)}`;
      else          addressHTML = esc(emp.address);
    } else {
      addressHTML = '<span style="color:var(--color-text-muted);font-style:italic;">입력하기</span>';
    }

    /* 영문 이름 */
    let namingHTML;
    if (ename)                 namingHTML = esc(ename);
    else                       namingHTML = '<span style="color:var(--color-text-muted);">-</span>';

    /* 인라인 정렬 보장 — 복합 값(텍스트 + pill/button)은 inline-flex 컨테이너로 감싸 vertical-align 통일 */
    const wrapInline = (html) => `<span style="display:inline-flex;align-items:center;">${html}</span>`;
    const joinCell    = emp.joinDate ? wrapInline(`${esc(dispYmd(emp.joinDate))}${pillWarm(workDurationText(emp.joinDate))}`) : '';
    /* 주민등록번호 빈값(미입력)이면 성별 pill 도 숨긴다 — 주민번호에서 성별이 파생되기 때문. */
    const rrnEmpty = !!(emp._noMock && !emp.ssn);
    const rrnCell     = rrnEmpty
      ? rrnFieldValueHTML(emp)
      : wrapInline(`${rrnFieldValueHTML(emp)}${pillCircle(emp.gender === 'F' ? '여' : '남')}`);
    const addrCell    = (() => {
      if (!emp.address) return '';
      const z = String(emp.address).match(/^\[(\d{5})\]\s*(.*)$/);
      if (z) return wrapInline(`${esc(z[2])}${pillChip(`우 ${z[1]}`)}`);
      return esc(emp.address);
    })();
    /* 재직 상태 pill — 퇴직(muted) / 휴직(warning) / 재직(success) */
    const statusCell = (() => {
      if (emp.status === 'retired') return '<span class="pill">퇴직</span>';
      if (emp.onLeave)              return '<span class="pill pill--warning">휴직</span>';
      return '<span class="pill pill--success">재직</span>';
    })();

    /* fieldGridHTML — 라벨 120px / 9px vertical padding / hairline border.
     *   페어 구성: 재직 상태 | 사번 / 입사일 | 이름 / 영문 이름 | 회사 이메일
     *           / 개인 이메일 | 생년월일 / 주민등록번호 | 휴대전화 / 주소(full) */
    const rows = [
      ['재직 상태',   statusCell,    { html: true  }],
      ['사번',         emp.id || '',  { html: false }],
      ['입사일',       joinCell,      { html: true  }],
      ['이름',         name || '',    { html: false }],
      ['영문 이름',    namingHTML,    { html: true  }],
      ['회사 이메일',  companyEmail ? esc(companyEmail) : '<span style="color:var(--color-text-muted);">아이디 미설정</span>', { html: true }],
      ['개인 이메일',  emp.email || '', { html: false }],
      ['생년월일',     birthHTML,     { html: true  }],
      ['주민등록번호', rrnCell,       { html: true  }],
      ['휴대전화',     emp.phone || '', { html: false }],
      ['주소',         addrCell,      { html: true, full: true }],
    ];

    /* 사진 + 필드 영역 — 좌·우 컬럼. 사진은 3:4 비율 96×128.
     *   ≤580px(empi-basic) 에서는 사진이 위, 신상정보가 아래로 세로 스택 (CSS 제어). */
    return `
      <div class="empi-basic" style="display:flex;gap:22px;align-items:flex-start;">
        <div class="empi-basic__photo" style="flex-shrink:0;width:96px;">
          <div style="width:96px;height:128px;background:var(--color-surface);border:1px solid var(--color-divider);border-radius:4px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,0.04);">
            ${photoInner}
          </div>
        </div>
        <div class="empi-basic__fields" style="flex:1;min-width:0;">${fieldGridHTML(rows)}</div>
      </div>
    `;
  }
  /* 인라인 서브 블록 — 카드 wrapper 없이 헤더 + 본문만 일자로 나열. 메인 섹션 내부에 평탄하게 들어감.
   *   actions 지원 — 헤더 우측에 [편집]/[+ 추가]/[이력] 버튼 노출. */
  function subBlockHTML(opts) {
    const pill = visibilityPill(opts.visibility);
    const tag  = opts.tag ? tagPill(opts.tag) : '';
    const acts = sectionActionsHTML(opts);
    const badge = opts.badge || '';
    return `
      <div style="margin-top:${opts.first ? '0' : '18px'};">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:8px;min-width:0;">
            <span style="font-size:13px;font-weight:var(--fw-semibold);color:var(--color-text);">${esc(opts.title)}</span>
            ${pill}${tag}
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">${badge}${acts}</div>
        </div>
        <div>${opts.body || ''}</div>
      </div>
    `;
  }
  function renderSectionPersonalDetail(emp) {
    /* 개인 정보 메인 — 서브 섹션 4개(장애 / 신체 / 병역 / 가족). 모두 행 단위 CRUD.
     *   장애=공개, 신체·병역·가족=비공개(권한 없으면 잠금). 인사담당자는 직접 편집. */
    return personalTableSubBlock(emp, 'disability', { first: true })
         + personalTableSubBlock(emp, 'bodyInfo')
         + personalTableSubBlock(emp, 'military')
         + personalTableSubBlock(emp, 'family');
  }
  /* renderSectionEmployment 는 「근로 계약」 sub-block 으로 통합되어 더 이상 별도 호출 없음 */
  function renderSectionWorkInfo(emp) {
    /* 근무 정보 — 등록 상태 + 도급직 여부(+소속회사·사원 유형) + 근무지 / 부서 / 직위 / 직책 / 직무.
     *   등록완료(모든 항목 입력) 시 근무지만 직접 수정, 나머지는 발령(발령 관리).
     *   미등록(하나라도 없음) 시 전체 편집 가능(승인 불요) — 이때 도급직 여부도 여기서 지정.
     *   ※ 도급직도 근무지/부서/직위/직책/직무는 그대로 유지, 도급직 전용 소속회사·사원 유형만 추가. */
    const isOut = !!(emp.contractOut || emp.empType === 'outsourced');
    /* 등록완료 판정 — 근무 정보 필수 항목(사원 유형 포함, hasWorkInfo) + (도급직이면 소속회사까지).
       (등록 상태 pill 은 노출하지 않음 — 안내 문구 노출 조건으로만 사용) */
    const done = hasWorkInfo(emp) && (!isOut || !!emp.contractCompany);
    const rows = [
      ['도급직 여부', isOut ? '해당' : '해당 없음'],
    ];
    if (isOut) rows.push(['소속회사', emp.contractCompany || '-']);
    /* 사원 유형(사무/생산/연구) — 도급 여부와 무관하게 항상 표시 */
    rows.push(['사원 유형', JOB_CAT_LABEL[emp.jobCat] || '-']);
    rows.push(['근무지', emp.site || '-']);
    rows.push(['부서',   emp.dept || '-']);
    rows.push(['직위',   emp.rank || '-']);
    rows.push(['직책',   emp.position || '-']);
    rows.push(['직무',   emp.job  || '-']);
    /* 안내 문구 — 등록완료 상태에서만 (근무지 외 항목은 발령 관리) */
    const note = (done && !isMyInfoView() && canEditEmployment())
      ? `<div style="margin-top:10px;font-size:12px;color:var(--color-text-muted);line-height:1.5;">
          부서는 <strong style="color:var(--color-text-sub);">발령 관리 &gt; '전보'</strong>로 변경할 수 있습니다.
        </div>`
      : '';
    return fieldGridHTML(rows, { scroll: true }) + note;
  }

  /* ============ 인사정보카드 「기본 정보」 탭 — 표 섹션 직접 편집 (인사담당자) ============
   *   학력·경력·자격·어학·가족·장애·신체·병역 — 모두 행 단위 표. 인사담당자는 행 추가/수정/삭제를
   *   결재 없이 직접 수행한다(당사자 본인은 기존대로 변경 승인 요청).
   *   데이터 단일 소스: emp['_pt_'+key] (행=배열). 비어있으면 데모 mock 으로 시드. */
  const PERSONAL_TABLE_SPECS = {
    education: { title:'학력 사항', private:true,  headers:['학교명','학과명','입학년월','졸업년월','졸업여부'],
      fields:[{type:'text'},{type:'text'},{type:'month'},{type:'month'},{type:'select',options:['졸업','재학','중퇴','수료','휴학']}],
      mock: (emp) => mockEducation(emp) },
    career:    { title:'경력 사항', private:false, headers:['회사명','기간','최종 직급','담당 업무'],
      fields:[{type:'text'},{type:'text'},{type:'text'},{type:'text'}],
      mock: (emp) => mockCareer(emp) },
    licenses:  { title:'자격 면허', private:true,  headers:['종류','등급','취득일','발행기관'],
      fields:[{type:'text'},{type:'text'},{type:'date'},{type:'text'}],
      mock: (emp) => mockLicenses(emp) },
    languages: { title:'어학 능력', private:true,  headers:['종류','회화','작문','독해'],
      fields:[{type:'text'},{type:'select',options:['상','중','하']},{type:'select',options:['상','중','하']},{type:'select',options:['상','중','하']}],
      mock: (emp) => mockLanguages(emp) },
    family:    { title:'가족 사항', private:true,  headers:['관계','성명','성별','생년월일','동거유무'],
      fields:[{type:'select',options:['배우자','자녀','부','모','형제','자매','조부','조모','기타']},{type:'text'},{type:'select',options:['남','여']},{type:'date'},{type:'select',options:['Y','N']}],
      mock: (emp) => mockFamily(emp) },
    disability:{ title:'장애 여부', private:false, headers:['구분','장애등급','장애등록번호','등록일자','장애인등록증'],
      fields:[{type:'text'},{type:'text'},{type:'text'},{type:'date'},{type:'select',options:['등록완료','신청중','미등록']}],
      mock: (emp) => (seedNum(emp.id, 6) % 4 === 0) ? [['지체장애','5급','D-2024-0123','2024-03-15','등록완료']] : [] },
    bodyInfo:  { title:'신체 정보', private:true,  headers:['구분(보훈여부)','혈액형','시력','색맹','기타'],
      fields:[{type:'text'},{type:'text'},{type:'text'},{type:'text'},{type:'text'}],
      mock: () => [['일반','A형 Rh+','좌 1.0 / 우 1.0','정상','비흡연']] },
    military:  { title:'병역 정보', private:true,  headers:['구분','병역기간','미필사유'],
      fields:[{type:'select',options:['군필','미필','면제','복무중','비대상자']},{type:'text'},{type:'text'}],
      mock: (emp) => (seedNum(emp.id, 7) % 2 === 0) ? [['비대상자','-','여성']] : [['군필','2010-03 ~ 2012-01','-']] },
  };
  /* 표 섹션 데이터 — 저장값(emp['_pt_'+key]) 우선, 없으면 mock 시드(읽기 전용 표시용) */
  function personalRows(emp, key) {
    const spec = PERSONAL_TABLE_SPECS[key];
    if (!spec) return [];
    const stored = emp['_pt_' + key];
    if (Array.isArray(stored)) return stored;
    /* 신규 등록 임직원(_noMock) — 데모 mock 시드 없이 빈 표로 시작 (입력한 내용만 표시) */
    if (emp._noMock) return [];
    return spec.mock(emp) || [];
  }
  /* 표 섹션 액션 — 인사담당자=[편집](직접 CRUD), 당사자 본인=[+추가](결재 요청), 그 외=없음 */
  function personalTableActions() {
    if (isMyInfoView()) return [];   // 내 정보(셀프서비스) — 열람 전용
    if (canEditEmployment()) return ['edit'];
    if (canEditPersonal())   return ['add'];
    return [];
  }
  /* 표 섹션 sub-block — 권한 없으면 잠금(편집 숨김), 있으면 저장값 기반 표 + 액션 */
  function personalTableSubBlock(emp, key, opts) {
    const spec = PERSONAL_TABLE_SPECS[key];
    const locked = spec.private && !canViewPrivate();
    const body = locked ? privateBlockedHTML(spec.title) : dataTableHTML(spec.headers, personalRows(emp, key));
    const acts = locked ? [] : personalTableActions();
    return subBlockHTML(Object.assign({
      key, title: spec.title, visibility: spec.private ? 'private' : 'public', actions: acts, body,
    }, opts || {}));
  }

  /* 편집 모달 — 한 행 = 입력 셀들 + 삭제 버튼. 하단 [+ 행 추가]. */
  function ptRowHTML(spec, values) {
    const vals = values || [];
    const cells = spec.fields.map((f, i) => {
      const v = vals[i] == null ? '' : vals[i];
      let inner;
      if (f.type === 'select') {
        inner = `<select class="select" data-pt-cell style="width:100%;"><option value=""></option>` +
          f.options.map(o => `<option ${String(o) === String(v) ? 'selected' : ''}>${esc(o)}</option>`).join('') +
          `</select>`;
      } else {
        const t = f.type === 'month' ? 'month' : (f.type === 'date' ? 'date' : 'text');
        inner = `<input class="input" type="${t}" data-pt-cell value="${esc(v)}" style="width:100%;" />`;
      }
      /* data-label — ≤700px 카드 전환 시 ::before 로 필드명 표기 (모바일 입력 라벨) */
      return `<td class="pt-edit__cell" data-label="${esc(spec.headers[i] || '')}" style="padding:6px;vertical-align:top;">${inner}</td>`;
    }).join('');
    return `<tr data-pt-row>${cells}<td class="pt-edit__del" style="padding:6px;text-align:center;vertical-align:middle;">
      <button type="button" data-pt-del title="행 삭제" style="border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-danger);border-radius:5px;padding:5px 9px;font-size:12px;cursor:pointer;">삭제</button>
    </td></tr>`;
  }
  function renderPersonalTableEditBody(emp, sec) {
    const spec = PERSONAL_TABLE_SPECS[sec];
    const rows = personalRows(emp, sec);
    const thStyle = 'font-size:12px;font-weight:var(--fw-semibold);color:var(--color-text-muted);text-align:left;padding:8px 10px;border-bottom:1px solid var(--color-border);background:var(--color-surface-alt);';
    const headTh = spec.headers.map(h => `<th style="${thStyle}">${esc(h)}</th>`).join('') + `<th style="${thStyle}width:64px;"></th>`;
    const bodyRows = rows.map(r => ptRowHTML(spec, r)).join('');
    return `
      <div style="overflow-x:auto;">
        <table class="pt-edit" style="width:100%;border-collapse:collapse;">
          <thead><tr>${headTh}</tr></thead>
          <tbody data-pt-rows>${bodyRows}</tbody>
        </table>
      </div>
      <button type="button" data-pt-add class="btn" style="margin-top:12px;">+ 행 추가</button>
    `;
  }
  function injectPersonalTableModal() {
    if (document.getElementById('modal-empi-ptable')) return;
    const html = `
<div class="modal-backdrop" id="modal-empi-ptable" data-modal-id="empi-ptable" style="z-index:1150;">
  <div class="modal modal--lg">
    <div class="modal__header">
      <div class="modal__title" data-empi-pt-title>정보 편집</div>
      <button class="modal__close" data-modal-close type="button" aria-label="닫기">✕</button>
    </div>
    <div class="modal__body" style="background:var(--color-surface-alt);padding:18px 20px;" data-empi-pt-body></div>
    <div class="modal__footer">
      <button class="btn" type="button" data-modal-close>취소</button>
      <button class="btn btn--primary" type="button" data-empi-pt-save>완료</button>
    </div>
  </div>
</div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    bindPersonalTableModal();
  }
  function bindPersonalTableModal() {
    const modal = document.getElementById('modal-empi-ptable');
    if (!modal || modal.__ptBound) return;
    modal.__ptBound = true;
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-modal-close]')) {
        closeModal('modal-empi-ptable'); return;
      }
      const del = e.target.closest('[data-pt-del]');
      if (del) { const tr = del.closest('[data-pt-row]'); if (tr) tr.remove(); return; }
      const add = e.target.closest('[data-pt-add]');
      if (add) {
        const spec = PERSONAL_TABLE_SPECS[CARD_STATE.ptSection];
        const tbody = modal.querySelector('[data-pt-rows]');
        if (spec && tbody) tbody.insertAdjacentHTML('beforeend', ptRowHTML(spec, []));
        return;
      }
      if (!e.target.closest('[data-empi-pt-save]')) return;
      const emp = CARD_STATE.emp;
      const sec = CARD_STATE.ptSection;
      if (!emp || !sec) { closeModal('modal-empi-ptable'); return; }
      /* 행 수집 — 셀 전부 빈 행은 제외 */
      const rows = Array.from(modal.querySelectorAll('[data-pt-row]')).map(tr =>
        Array.from(tr.querySelectorAll('[data-pt-cell]')).map(el => (el.value || '').trim())
      ).filter(cells => cells.some(c => c !== ''));
      emp['_pt_' + sec] = rows;
      if (typeof applyFilter === 'function') applyFilter();
      if (typeof renderTable === 'function') renderTable();
      renderCardBody();
      closeModal('modal-empi-ptable');
      const spec = PERSONAL_TABLE_SPECS[sec];
      window.toast && window.toast(`${spec ? spec.title : '정보'}가 저장되었습니다.`, 'success');
    });
  }
  function openPersonalTableEdit(sec) {
    const emp = CARD_STATE.emp;
    const spec = PERSONAL_TABLE_SPECS[sec];
    if (!emp || !spec) return;
    injectPersonalTableModal();
    const modal = document.getElementById('modal-empi-ptable');
    CARD_STATE.ptSection = sec;
    modal.querySelector('[data-empi-pt-title]').textContent = `${spec.title} 편집`;
    modal.querySelector('[data-empi-pt-body]').innerHTML = renderPersonalTableEditBody(emp, sec);
    openModal('modal-empi-ptable');
  }

  /* 메인 + 서브 섹션 트리 정의 (인사 정보 탭).
   *   편집/추가 액션 — 인사담당자는 직접 편집(CRUD), 당사자(employee) 본인은 변경 승인 요청. */
  function renderTabPersonal(emp) {
    const sections = [];
    /* 신상 정보(basic) 편집 — 인사담당자는 직접 수정, 당사자(본인)는 변경 승인 요청.
     *   학력·경력·자격 [+ 추가] 는 당사자 본인만(addAct). */
    /* 내 정보(셀프서비스)는 열람 전용 — 직접 편집·추가 대신 섹션별 [변경 요청](전자결재 상신) 노출.
     *   HR 인사정보카드 모달은 기존대로 편집/추가. */
    const myInfo = isMyInfoView();
    const editAct = (!myInfo && (canEditPersonal() || canEditEmployment())) ? ['edit'] : [];
    const addAct  = (!myInfo && canEditPersonal()) ? ['add']  : [];
    const reqAct  = myInfo ? ['request'] : [];

    sections.push(sectionShellHTML({ key:'basic', level: 1, title: '신상 정보', visibility: 'public', actions: myInfo ? reqAct : editAct, body: renderSectionBasic(emp) }));

    /* 섹션 순서: 신상 정보 → 학력·경력 → 자격·역량 → 개인 정보 (요청: 학력 → 경력 → 자격 → 개인정보) */

    /* 학력·경력 정보 — 학력 사항(비공개) + 경력 사항(공개). 행 단위 CRUD(personalTableSubBlock). */
    const eduCareerBody = personalTableSubBlock(emp, 'education', { first: true }) + personalTableSubBlock(emp, 'career');
    sections.push(sectionShellHTML({ key:'edu-career', level: 1, title: '학력·경력', visibility: 'public', actions: reqAct, body: eduCareerBody }));

    /* 가족 정보는 「개인 정보 > 가족 사항」 sub-block 으로 통합됨 (renderSectionPersonalDetail) */

    /* 자격/역량 정보 — 자격 면허 + 어학 능력 (둘 다 비공개) */
    let qualBody;
    if (canViewPrivate()) {
      qualBody = personalTableSubBlock(emp, 'licenses', { first: true }) + personalTableSubBlock(emp, 'languages');
    } else {
      qualBody = privateBlockedHTML('자격·역량');
    }
    sections.push(sectionShellHTML({ key:'qualifications', level: 1, title: '자격·역량', visibility: 'private', actions: reqAct, body: qualBody }));

    /* 개인 정보 — 학력·경력·자격 다음(맨 아래)에 배치 */
    sections.push(sectionShellHTML({ key:'personal', level: 1, title: '개인 정보', visibility: 'public', actions: reqAct, body: renderSectionPersonalDetail(emp) }));

    return sections.join('');
  }

  /* === 근로 계약 정보 표시용 포맷터 — 인사정보카드 본문 행 전용 === */
  const WEEK_LABEL_KO = { Mon:'월', Tue:'화', Wed:'수', Thu:'목', Fri:'금', Sat:'토', Sun:'일' };
  function formatDaysCSV(csv) {
    if (!csv) return '';
    return String(csv).split(',').map(d => WEEK_LABEL_KO[d.trim()] || '').filter(Boolean).join('·');
  }
  function formatContractPeriod(emp) {
    const start = emp.contractStartDate || '';
    const end   = emp.contractEndDate || '';
    const ext = EXTERNAL_EMP_TYPES.indexOf(emp.empType) >= 0;
    if (!start && !end) return ext ? '해당없음' : '';
    if (emp.empType === 'regular' && !end) return `${start || '-'} ~ 무기 계약`;
    return `${start || '-'} ~ ${end || '-'}`;
  }
  function formatProbationPeriod(emp) {
    if (!emp.probation) return '미적용';
    return `${emp.probationStart || '-'} ~ ${emp.probationEnd || '-'}`;
  }
  function formatWorkSchedule(emp) {
    /* legacy 데이터 마이그레이션 — workSchedule='schedule' + scheduleType='shift' → '교대' */
    let v = emp.workSchedule;
    if (v === 'schedule' && emp.scheduleType === 'shift') v = 'shift';
    if (!v) return '';
    if (v === 'fixed')    return '고정';
    if (v === 'shift')    return '교대';
    if (v === 'schedule') return '스케줄 근무';
    return '';
  }
  function formatStandardHours(emp) {
    let v = emp.workSchedule;
    if (v === 'schedule' && emp.scheduleType === 'shift') v = 'shift';
    if (v === 'schedule') return '회사가 정한 근무표에 따름';
    if (v === 'fixed' || v === 'shift') return '1일 8시간 · 1주 40시간 · 월 209시간';
    if (emp.hoursPerDay == null || emp.hoursPerDay === '') return '';
    return `1일 ${emp.hoursPerDay}시간 · 1주 ${emp.hoursPerWeek || '-'}시간 · 월 ${emp.hoursPerMonth || '-'}시간`;
  }
  function formatWorkDays(emp) {
    let v = emp.workSchedule;
    if (v === 'schedule' && emp.scheduleType === 'shift') v = 'shift';
    if (v === 'schedule') return '회사가 정한 근무표에 따름';
    if (v === 'fixed' || v === 'shift') return '월 ~ 금';
    return formatDaysCSV(emp.workDays);
  }
  function formatWorkTime(emp) {
    let v = emp.workSchedule;
    if (v === 'schedule' && emp.scheduleType === 'shift') v = 'shift';
    if (v === 'schedule') return '회사가 정한 근무시간에 따름';
    if (v === 'shift')    return '교대 근무표에 따름';
    if (!emp.workTimeStart && !emp.workTimeEnd) return '';
    return `${emp.workTimeStart || '-'} ~ ${emp.workTimeEnd || '-'}`;
  }
  function formatBreakTime(emp) {
    let v = emp.workSchedule;
    if (v === 'schedule' && emp.scheduleType === 'shift') v = 'shift';
    if (v === 'schedule') return '회사가 정한 근무 기준에 따름';
    if (v === 'shift')    return '교대 근무표에 따름';
    if (!emp.breakStart && !emp.breakEnd) return '';
    const b1 = `${emp.breakStart || '-'} ~ ${emp.breakEnd || '-'}`;
    const b2 = (emp.breakStart2 && emp.breakEnd2) ? `, ${emp.breakStart2} ~ ${emp.breakEnd2}` : '';
    return b1 + b2;
  }
  function formatHolidayDays(emp) {
    let v = emp.workSchedule;
    if (v === 'schedule' && emp.scheduleType === 'shift') v = 'shift';
    if (v === 'schedule') return '회사가 정한 근무 기준에 따름';
    if (v === 'fixed' || v === 'shift') return '토, 일';
    return formatDaysCSV(emp.holidayDays);
  }

  /* === 임금 계약 정보 — 마스터 / 포맷터 / 완성도 판정 ===
   *   - 임금 유형 4종 + 소득 유형 1종(근로소득만) + 임금 계약 유형 3종 (연봉/월급제만 사용) */
  const INCOME_TYPES = [['earned','근로소득']];
  /* 임금 유형 — 연봉제 / 시급제 2종. (월급제 제거)
     · 정규직·계약직 → 연봉제만  · 일용직 → 시급제만 (renderCardEditWage 에서 empType 로 제약) */
  const WAGE_TYPES   = [['annual','연봉제'], ['hourly','시급제']];
  /* 임금 계약 유형 — 고정 OT / 포괄임금 2종. (일반 제거 — 연봉제는 둘 중 하나 필수) */
  const WAGE_KINDS   = [['fixedOT','고정 OT'], ['inclusive','포괄임금']];
  /* 임금 계약 유형별 한 줄 설명 — 라디오 옵션 아래 노출되며 관리자가 의미를 빠르게 이해하도록 돕는다. */
  const WAGE_KIND_DESC = {
    general:   '기본 근로시간에 대한 임금을 지급하고, 실제 발생한 연장·야간·휴일근로는 매월 실적에 따라 별도로 계산해 지급해요.',
    fixedOT:   '매월 정해진 연장·야간·휴일근로 시간에 대한 수당을 정액으로 미리 지급하고, 약정 시간을 초과한 근로는 추가로 정산해요.',
    inclusive: '업무 특성상 실제 근로시간 산정이 어려운 경우, 기본급과 법정수당을 포함한 월 임금총액을 미리 정해 지급해요.',
  };
  /* 포괄계약 근로시간 — 지급배율(통상시급 대비 배수)과 카테고리.
   *   가산시간 = 시간 × 지급배율 (포괄임금에 포함되는 환산 OT 시간 합계 산정용). */
  const INCLUSIVE_OT_CATEGORIES = [
    { key: 'extension',         label: '연장근로수당',          rate: 1.5 },
    { key: 'night',             label: '야간근로수당',          rate: 1.5 },
    { key: 'nightExt',          label: '야간연장근로수당',      rate: 2.0 },
    { key: 'holiday',           label: '휴일근로수당',          rate: 1.5 },
    { key: 'holidayExt',        label: '휴일연장근로수당',      rate: 2.0 },
    { key: 'holidayNight',      label: '휴일야간근로수당',      rate: 2.0 },
    { key: 'holidayNightExt',   label: '휴일야간연장근로수당',  rate: 2.5 },
  ];
  const INCOME_TYPE_LABEL    = { earned:'근로소득', business:'사업소득', other:'기타소득' };
  const WAGE_TYPE_LABEL      = { annual:'연봉제', monthly:'월급제', daily:'일급제', hourly:'시급제' };
  const WAGE_AMOUNT_PREFIX   = { annual:'연봉', monthly:'월급', daily:'일급', hourly:'시급' };
  const WAGE_KIND_LABEL      = { general:'일반', fixedOT:'고정 OT', inclusive:'포괄임금' };

  function formatMoney(v) {
    if (v == null || v === '') return '';
    const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
    if (!Number.isFinite(n)) return String(v);
    return n.toLocaleString();
  }
  function formatWagePeriod(emp) {
    const start = emp.wageContractStartDate || '';
    const end   = emp.wageContractEndDate || '';
    const ext = EXTERNAL_EMP_TYPES.indexOf(emp.empType) >= 0;
    if (!start && !end && !emp.wageIndefinite) return ext ? '해당없음' : '';
    if (emp.wageIndefinite) return `${start || '-'} ~ 기간의 정함 없음`;
    return `${start || '-'} ~ ${end || '-'}`;
  }
  function formatContractAmount(emp) {
    if (!emp.wageType || !emp.contractAmount) return '';
    return `${WAGE_AMOUNT_PREFIX[emp.wageType] || ''} ${formatMoney(emp.contractAmount)}원`.trim();
  }
  /* 임금 계약서 완료(서명)일 — 급여 정보 「계약일」 표시의 단일 소스.
   *   서명 완료된 경우만 완료일을 가지며, 미완료면 빈 문자열. */
  function wageContractDoneDate(emp) {
    if (emp.wageContractSignedDate) return emp.wageContractSignedDate;
    if (emp.contractWage) return emp.wageContractStartDate || emp.contractStartDate || '';
    return '';
  }
  function formatWageKind(emp) {
    if (!emp.wageType || ['annual','monthly'].indexOf(emp.wageType) < 0) return '';
    const k = WAGE_KIND_LABEL[emp.wageContractKind] || '';
    if (!k) return '';
    if (emp.wageContractKind === 'fixedOT' && emp.fixedOTHours) {
      return `${k} (기준 ${emp.fixedOTHours}시간)`;
    }
    if (emp.wageContractKind === 'inclusive' && emp.inclusiveHours) return `${k} (근로시간 ${emp.inclusiveHours}시간)`;
    return k;
  }
  function computeHourlyEquivalent(emp) {
    if (emp.wageType !== 'daily') return '';
    const amount = Number(emp.contractAmount || 0);
    const hours  = Number(emp.hoursPerDay || 0);
    if (!amount || !hours) return '';
    return `${formatMoney(Math.round(amount / hours))}원/시간`;
  }
  function formatMonthlyBase(emp) {
    if (emp.wageType === 'annual') {
      const amount = Number(emp.contractAmount || 0);
      if (!amount) return '';
      return `${formatMoney(Math.round(amount / 12))}원/월`;
    }
    if (emp.wageType === 'monthly') {
      const amount = Number(emp.contractAmount || 0);
      if (!amount) return '';
      return `${formatMoney(amount)}원/월`;
    }
    return '';
  }

  /* 임금 계약 정보 — 작성 상태 판정.
   *   외부(도급)만 임금 계약 N/A → 완료 판정 면제 (pill 자체 미노출).
   *   일용직은 시급제 임금계약 대상. 그 외는 wageDetailComplete flag 가 명시적으로 true 여야 작성완료. */
  function isWageContractApplicable(emp) {
    const ext = EXTERNAL_EMP_TYPES.indexOf(emp.empType) >= 0;
    return !ext;
  }
  function isWageInfoComplete(emp) {
    if (!isWageContractApplicable(emp)) return true; // 해당없음 → 완료 취급
    /* 필수: 시작일·종료일·소득 유형·임금 유형·계약 금액·임금 지급일.
     *   연봉/월급제는 추가로 임금 계약 유형·기본급 필수. */
    const baseFilled = !!(
      emp.wageContractStartDate && (emp.wageContractEndDate || emp.wageIndefinite) &&
      emp.incomeType && emp.wageType && emp.contractAmount && emp.payDay
    );
    if (!baseFilled) return false;
    if (['annual','monthly'].indexOf(emp.wageType) >= 0) {
      return !!(emp.wageContractKind && emp.baseSalary);
    }
    return true;
  }

  /* 근로 계약 정보 — '작성 상태' 판정 (데이터 기반).
   *   필수 정보(계약기간 + 근로유형 + 사원유형 + 직무 + 근무지)가 모두 채워졌는지로 판정.
   *   - 외부 인력은 종료일도 필수. 도급직은 추가로 소속회사 필수.
   *   - 정규직은 종료일 미입력=무기 계약으로 인정 → 시작일만 채워지면 OK.
   *   필수 정보가 모두 비어 있던 신규 employee → 작성중 → 첫 저장(필수 채움) → 작성완료 → 이후 편집은 결재 흐름. */
  function isContractInfoComplete(emp) {
    const ext = EXTERNAL_EMP_TYPES.indexOf(emp.empType) >= 0;
    /* 부서는 근로 계약 정보에서 지정 — 필수 완료 항목에 포함 */
    const baseFilled = !!(emp.dept && emp.empType && emp.jobCat && emp.job && emp.site && emp.contractStartDate);
    if (!baseFilled) return false;
    if (ext) {
      if (!emp.contractEndDate) return false;
      if (emp.empType === 'outsourced' && !emp.contractCompany) return false;
      return true;
    }
    /* 내부: 정규직은 무기 계약 허용. 그 외는 종료일 필수. */
    const indef = emp.empType === 'regular' && !emp.contractEndDate;
    if (!(indef || !!emp.contractEndDate)) return false;
    /* 상세 정보 — 통상근무는 근무조(근무시간)가 채워져야 완료. 교대근무는 근무조 없이도 완료(근무표에 따름). */
    let ws = emp.workSchedule || 'fixed';
    if (ws === 'schedule') ws = emp.scheduleType === 'shift' ? 'shift' : 'fixed';
    if (ws !== 'shift' && !(emp.workTimeStart && emp.workTimeEnd)) return false;
    return true;
  }

  /* 근로 계약 이력 존재 여부 — 임금 계약 정보 입력의 선행 조건.
     정책: 실제 근로계약서가 1건이라도 작성/발송(=근로 계약 이력 등록)되어 있어야 임금 계약을 입력할 수 있다.
     빠른 경로: 발송/서명 플래그(contractSentDate/contractLabor). 없으면 App.HRContract 이력을 조회. */
  function hasLaborContractHistory(emp) {
    if (!emp) return false;
    if (emp.contractLabor || emp.contractSentDate) return true;
    if (window.App && App.HRContract && typeof App.HRContract.historyRowsByEmp === 'function') {
      const rows = App.HRContract.historyRowsByEmp(emp.id) || [];
      return rows.some(it => it.kind === '근로계약서');
    }
    return false;
  }

  /* 임금 계약서 작성 선행 조건 (정책) — 금일(오늘) 기준 '유효한' 근로 계약서가 존재해야 한다.
     유효한 근로 계약서 = 근로 계약 이력 중 서명완료 + 오늘 계약기간 내(만료 아님). '만료 임박'도 아직 유효하므로 포함.
       · 판정은 실제 근로 계약 이력(App.HRContract) 을 진실원으로 한다 — 근로 계약 이력이 하나도 없으면 false.
         (contractLabor 같은 flag 만 있고 실제 이력이 없는 경우 작성 불가.)
       · App.HRContract 미로드 시에만 flag(isSignValid) 로 폴백.
     (도급직은 근로계약 해당없음 → 애초에 임금 계약 자체가 없어 이 게이트에 도달하지 않음) */
  function hasValidLaborContract(emp) {
    if (!emp) return false;
    if (window.App && App.HRContract && typeof App.HRContract.hasValidLaborContract === 'function') {
      return App.HRContract.hasValidLaborContract(emp.id);
    }
    return isSignValid(emp, 'labor') === true;   // 폴백 — 계약 이력 모듈 미로드 환경
  }

  /* 임금 계약 이력 존재 여부 — 급여 정산(정산 정보) 자동 세팅의 선행 조건.
     정책: 실제 임금계약서가 이력(App.HRContract)에 1건이라도 있어야 정산 정보를 세팅한다.
     이력이 비어 있으면 emp 필드(contractWage 등)만으로 정산 정보를 채우지 않는다 —
     '계약 이력 없음' 과 '정산 정보 노출' 의 정합성 유지. */
  function hasWageContractHistory(emp) {
    if (!emp) return false;
    if (window.App && App.HRContract && typeof App.HRContract.historyRowsByEmp === 'function') {
      const rows = App.HRContract.historyRowsByEmp(emp.id) || [];
      return rows.some(it => it.kind === '임금계약서');
    }
    /* 이력 소스 부재(비데모) 시에는 emp 필드 기준으로 판정 */
    return !!(emp.contractWage || emp.wageContractSentDate);
  }

  /* 중복 계약 판정 — 신규 계약서 작성 시 '동일 시작일'의 유효 계약만 중복으로 본다.
     시작일이 다르면(기간의 정함 없음 포함) 재계약(신규)으로 간주해 허용한다.
     유효 = App.HRContract 이력 중 만료/반려/무효가 아닌 계약. */
  /* 신규 계약 기간이 기존(유효) 계약과 겹치는지 검사 — 겹치면 추가 작성 불가.
     유효 = 만료/반려/무효/취소 가 아닌 계약. 무기(기간의 정함 없음)는 종료일을 +∞ 로 본다.
     end/indef 미전달 시 시작일 하루짜리로 간주(기존 호출 호환). */
  function findOverlappingContract(emp, kind, start, end, indef) {
    if (!emp || !start) return null;
    if (!(window.App && App.HRContract && typeof App.HRContract.historyRowsByEmp === 'function')) return null;
    const rows = (App.HRContract.historyRowsByEmp(emp.id) || [])
      .filter(it => it.kind === kind && ['만료', '반려', '무효', '취소'].indexOf(it.statusLabel) < 0);
    const INF = '9999-12-31';
    const aS = start, aE = indef ? INF : (end || start);
    return rows.find(it => {
      const bS = it.startDate || '';
      if (!bS) return false;
      const bE = it.indefinite ? INF : (it.endDate || bS);
      return aS <= bE && bS <= aE;   // 기간 겹침 (aS≤bE && bS≤aE)
    }) || null;
  }
  /* 동일 '시작일' 계약 판정 — 임금계약 전용. 임금계약은 시작일이 다르면 항상 재계약(갱신)으로 허용하고,
     시작일이 완전히 같은 유효 계약만 중복으로 본다(무기 계약끼리도 시작일이 다르면 허용).
     ※ 근로계약은 기간 겹침(findOverlappingContract)으로 판정하지만, 임금은 새 계약이 이전 계약을
       자동 대체하므로(무기 갱신 포함) 기간 겹침이 아니라 시작일 일치만 중복으로 본다. */
  function findSameStartContract(emp, kind, start) {
    if (!emp || !start) return null;
    if (!(window.App && App.HRContract && typeof App.HRContract.historyRowsByEmp === 'function')) return null;
    return (App.HRContract.historyRowsByEmp(emp.id) || [])
      .filter(it => it.kind === kind && ['만료', '반려', '무효', '취소'].indexOf(it.statusLabel) < 0)
      .find(it => (it.startDate || '') === start) || null;
  }
  /* 중복 계약 안내용 기간 문자열 — 'YY/MM/DD ~ YY/MM/DD' 또는 'YY/MM/DD ~ 기간의 정함 없음' */
  function dupPeriodText(it) {
    if (!it) return '';
    const s = dispYmd(it.startDate) || '-';
    return it.indefinite ? `${s} ~ 기간의 정함 없음` : `${s} ~ ${dispYmd(it.endDate) || '-'}`;
  }

  /* 소정근로시간 정보 등록 여부 — 임금 계약 정보 입력의 또 다른 선행 조건.
     1일 / 1주 / 월 소정근로시간이 모두 입력되어 있어야 등록완료로 본다. */
  function hasStandardHours(emp) {
    return !!(emp && Number(emp.hoursPerDay) && Number(emp.hoursPerWeek) && Number(emp.hoursPerMonth));
  }

  /* 근무 정보 등록 여부 — 사원 유형·근무지·부서·직위·직책·직무가 모두 있어야 등록완료.
     하나라도 없으면 미등록(전체 편집 가능·승인 불요). 등록완료면 근무지만 수정 가능.
     ※ 근로계약서 작성 선행 조건이기도 하다(등록완료 후 근로계약서 작성 가능). */
  function hasWorkInfo(emp) {
    return !!(emp && emp.dept && emp.rank && emp.position && emp.job && emp.site && emp.jobCat);
  }
  /* 근로/임금 계약서 서명 대기(서명진행중) 여부 — 발송됐으나 아직 서명 전.
     서명 대기 중에는 근무 정보 편집을 막는다(계약서 내용과 근무 정보가 어긋나는 것을 방지). */
  function contractSigningInProgress(emp) {
    if (!emp) return false;
    const laborSigning = !emp.contractLabor && !!emp.contractSentDate;
    const wageSigning  = !emp.contractWage  && !!emp.wageContractSentDate;
    return laborSigning || wageSigning;
  }

  /* === (등록 상태 × 계약 상태) 파생 — 인사정보카드와 동일 기준의 단일 진실원.
   *   계약 관리 「일괄 작성」 등 외부 화면이 직원별 상태를 동일하게 표시·게이팅하도록 공용.
   *   kind: 'labor' (근로) | 'wage' (임금)
   *   반환: { na, reg:{code,label,pill}, ctr:{code,label,pill}, eligible }
   *     reg.code: unregistered(미등록) | drafting(등록중) | done(등록완료)
   *               | changePending(변경승인 대기) | gated(선행대기) | na(해당없음)
   *     ctr.code: unsigned(미서명) | signing(서명진행중) | signed(서명완료)
   *               | soon(만료 임박) | expired(만료) | na(해당없음)
   *   eligible: 일괄 작성 가능 — reg ∈ {미등록·등록중·등록완료} AND ctr ∈ {미서명·서명완료·만료임박·만료}.
   *             (해당없음 / 선행대기 / 변경승인 대기 / 서명진행중 은 일괄 작성 대상에서 제외) */
  function contractCellState(emp, kind) {
    const today = new Date().toISOString().slice(0, 10);
    const ext = EXTERNAL_EMP_TYPES.indexOf(emp.empType) >= 0;
    /* 계약 상태(서명) 공통 판정 — renderSectionContract.statusBadge 와 동일 룰 */
    function sign(signed, end, signing) {
      if (!signed) return signing ? { code:'signing', label:'서명대기', pill:'info' }
                                   : { code:'unsigned', label:'서명대기', pill:'info' };
      if (end && end < today) return { code:'expired', label:'만료', pill:'danger' };
      if (end) {
        const d = Math.round((new Date(end) - new Date(today)) / 86400000);
        if (d >= 0 && d <= 30) return { code:'soon', label:'만료임박', pill:'warning' };
      }
      return { code:'signed', label:'서명완료', pill:'success' };
    }
    const ELIGIBLE_REG = ['unregistered','drafting','done'];
    const ELIGIBLE_CTR = ['unsigned','signed','soon','expired'];
    const NA = { na:true, reg:{ code:'na', label:'해당없음', pill:'' }, ctr:{ code:'na', label:'해당없음', pill:'' }, eligible:false };

    if (kind === 'wage') {
      if (!isWageContractApplicable(emp)) return NA;
      /* 선행 조건 (정책) — 근로 계약 정보 완료 + 금일 기준 '유효한' 근로 계약서 존재.
         (소정근로시간은 임금 계약 모달에서 함께 입력)
         근로계약이 미작성/서명대기/만료면 임금 계약 작성 불가 → '선행대기'. */
      const laborDone   = isContractInfoComplete(emp) && hasValidLaborContract(emp);
      const hasWageInfo = !!(emp.wageContractStartDate || emp.wageContractEndDate || emp.wageType || emp.contractAmount || emp.contractWage);
      const wageSigned  = !!emp.contractWage;
      const wageSigning = !wageSigned && !!emp.wageContractSentDate;
      const wageEnd     = emp.contractWageEndDate || emp.contractEndDate || '';
      const ctr = sign(wageSigned, wageEnd, wageSigning);
      let reg;
      /* 선행 미충족은 아직 임금 정보가 없을 때만 '선행대기'. 이미 서명/등록된 임금계약은 실제 상태 유지. */
      if (!laborDone && !hasWageInfo)   reg = { code:'gated',         label:'선행대기',     pill:'' };
      else if (!hasWageInfo)            reg = { code:'unregistered',  label:'미등록',       pill:'' };
      else if (emp.wageApprovalPending) reg = { code:'changePending', label:'변경승인 대기', pill:'warning' };
      else if (isWageInfoComplete(emp)) reg = { code:'done',          label:'등록완료',     pill:'success' };
      else                              reg = { code:'drafting',      label:'등록중',       pill:'warning' };
      const eligible = ELIGIBLE_REG.indexOf(reg.code) >= 0 && ELIGIBLE_CTR.indexOf(ctr.code) >= 0;
      return { na:false, reg, ctr, eligible };
    }

    /* labor (근로) */
    if (ext) return NA;
    const hasLaborInfo = !!(emp.contractStartDate || emp.contractEndDate || emp.contractLabor || emp.empType);
    const laborSigned  = !!emp.contractLabor;
    const laborSigning = !laborSigned && !!emp.contractSentDate;
    const laborEnd     = emp.contractEndDate || '';
    const ctr = sign(laborSigned, laborEnd, laborSigning);
    let reg;
    if (!hasLaborInfo)                    reg = { code:'unregistered',  label:'미등록',       pill:'' };
    else if (emp.contractApprovalPending) reg = { code:'changePending', label:'변경승인 대기', pill:'warning' };
    else if (isContractInfoComplete(emp)) reg = { code:'done',          label:'등록완료',     pill:'success' };
    else                                  reg = { code:'drafting',      label:'등록중',       pill:'warning' };
    const eligible = ELIGIBLE_REG.indexOf(reg.code) >= 0 && ELIGIBLE_CTR.indexOf(ctr.code) >= 0;
    return { na:false, reg, ctr, eligible };
  }

  /* ============ 계약 서명 상태 pill — 그리드/필터 공용 단일 진실원 ============
   *   contractCellState(emp, kind).ctr.code → 사용자 표기 라벨.
   *   상태값 5종: 서명대기(signing·unsigned) / 서명완료(signed) / 만료(expired) / 만료임박(soon) / 해당없음(na)
   *   ※ 미발송(unsigned)·발송후 미서명(signing) 은 사용자 표기상 모두 '서명대기' 로 통일. */
  const SIGN_PILL = {
    unsigned: { label: '서명대기', pill: 'info'    },
    signing:  { label: '서명대기', pill: 'info'    },
    signed:   { label: '서명완료', pill: 'success' },
    soon:     { label: '만료임박', pill: 'warning' },
    expired:  { label: '만료',     pill: 'danger'  },
    na:       { label: '해당없음', pill: ''        },
  };
  /* 계약 서명 상태 값(옵션) — 상세검색 필터 / 컬럼 pill 공통 사용.
   *   unsigned 은 signing 으로 정규화되어 '서명대기' 필터에 함께 매칭된다(아래 필터 로직 참고). */
  const SIGN_FILTER_OPTIONS = [
    { value: 'signing',  label: '서명대기' },
    { value: 'signed',   label: '서명완료' },
    { value: 'soon',     label: '만료임박' },
    { value: 'expired',  label: '만료' },
    { value: 'na',       label: '해당없음' },
  ];
  function signPillHTML(emp, kind) {
    const st = contractCellState(emp, kind);
    const code = st.na ? 'na' : (st.ctr.code || 'unsigned');
    const meta = SIGN_PILL[code] || SIGN_PILL.unsigned;
    if (code === 'na') {
      const tip = kind === 'wage' ? '도급직 — 임금계약 해당없음' : '도급직 — 근로계약 해당없음';
      return `<span class="pill" title="${esc(tip)}">${meta.label}</span>`;
    }
    return `<span class="pill${meta.pill ? ' pill--' + meta.pill : ''}">${esc(meta.label)}</span>`;
  }

  /* ============ 자격 판정 — 임직원 현황 카드 등록 / 급여 정산 대상 ============
   *   서명완료(유효) = 서명완료(signed) + 만료 임박(soon). 만료 임박은 아직 계약이 유효하므로 자격 인정.
   *   · canRegisterCard : 계정 등록완료 + 근로계약 서명완료(유효). 도급직은 근로계약 N/A → 계정 등록만으로 대상.
   *   · canSettlePayroll: 위 + 임금계약 서명완료(유효). 도급직은 임금계약 N/A → 급여 정산 대상 아님. */
  function isSignValid(emp, kind) {
    const st = contractCellState(emp, kind);
    if (st.na) return null;                 // 해당없음 — 요건 판정 대상 아님
    return st.ctr.code === 'signed' || st.ctr.code === 'soon';
  }
  function canRegisterCard(emp) {
    if (!emp) return false;
    if (!MILESTONES.idDone(emp)) return false;       // 계정 등록완료 필수
    const labor = isSignValid(emp, 'labor');
    if (labor === null) return true;                 // 도급직 — 근로계약 해당없음
    return labor === true;                            // 근로계약 서명완료(유효)
  }
  /* 정산 정보 '표시' 대상 — 서명완료된(효력 발생했던) 임금계약 이력이 1건이라도 있으면 표시(만료 포함).
     급여 정산 자격(canSettlePayroll)과 달리, 임금계약이 만료돼도 정산 정보는 표시하고
     연동 기간 상태를 '만료'로 나타낸다. App.HRContract 이력 우선, 미로드 시 emp.contractWage flag 폴백. */
  function hasSignedWageContract(emp) {
    if (!emp) return false;
    if (window.App && App.HRContract && typeof App.HRContract.latestWageContract === 'function') {
      return !!App.HRContract.latestWageContract(emp.id);
    }
    return !!emp.contractWage;
  }
  function canSettlePayroll(emp) {
    if (!emp) return false;
    if (!canRegisterCard(emp)) return false;
    const wage = isSignValid(emp, 'wage');
    if (wage === null) return false;                 // 도급직 — 임금계약 해당없음 → 급여정산 대상 아님
    if (!wage) return false;                          // 임금계약 서명완료(유효) 아님
    /* 정합성 — 실제 임금 계약 이력이 없으면 정산 정보를 세팅하지 않는다.
       (근로/임금 계약 이력이 모두 비어 있는데 정산 정보만 노출되는 사고 방지) */
    return hasWageContractHistory(emp);
  }

  /* === 근무·계약 정보 탭 — 근무 정보(고용+소속 sub-block) + 계약 정보 2개 메인 섹션 ===
   *   근무 정보: 조직 정보(부서/직위/직책) sub-block 만 포함.
   *   계약 정보: 근로 계약 (근로유형/사원유형/직무/근무지/소속회사 + 상태/계약기간)
   *           + 임금 계약 (상태/계약기간). 외부 인력은 N/A. */
  function renderSectionContract(emp, opts) {
    /* hideActs — 계약 관리 개별 작성 페이지에서 박스 재사용 시, 박스 내부의
       서명요청/미리보기/최신정보로 서명요청 버튼은 숨김 (페이지 자체의 발송 버튼이 그 역할). [편집] 은 유지. */
    const hideActs = !!(opts && opts.hideContractActions);
    /* selfView — 내 정보(셀프서비스) 열람 전용: 편집/최신정보 서명요청/계약 이력 숨김 */
    const selfView = !!(opts && opts.selfView);
    /* asSection — 박스를 level-1 섹션 카드(조직 정보 박스처럼: border·shadow·radius·타이틀 하단 구분선)로 렌더 */
    const asSection = !!(opts && opts.asSection);
    const blockFn = (o) => asSection ? sectionShellHTML(Object.assign({ level: 1 }, o)) : subBlockHTML(o);
    const ext = EXTERNAL_EMP_TYPES.indexOf(emp.empType) >= 0;
    const today = new Date().toISOString().slice(0, 10);
    function statusBadge(signed, endDate, opts) {
      const o = opts || {};
      if (o.na) return '<span class="pill" style="font-size:11px;">해당없음</span>';
      if (!signed) {
        /* 미발송(미작성)·발송후 미서명 모두 사용자 표기상 '서명대기' 로 통일 */
        return '<span class="pill pill--info" style="font-size:11px;">서명대기</span>';
      }
      if (endDate && endDate < today) return '<span class="pill pill--danger" style="font-size:11px;">만료</span>';
      /* 만료임박 — 서명완료(유효) 계약이 종료 30일 이내(아직 만료 전). 계약 관리 화면과 동일 기준. */
      if (endDate) {
        const d = Math.round((new Date(endDate) - new Date(today)) / 86400000);
        if (d >= 0 && d <= 30) return '<span class="pill pill--warning" style="font-size:11px;">만료임박</span>';
      }
      return '<span class="pill pill--success" style="font-size:11px;">서명완료</span>';
    }
    /* 근로 계약 — 고용 조건 필드(근로유형/사원유형/직무/근무지/소속회사) + 계약 상태 */
    const empTypeText = EMP_TYPE_LABEL[emp.empType] || '';
    const subTypeText = emp.empType === 'contract' && CONTRACT_SUB_LABEL[emp.contractSubType] ? `(${CONTRACT_SUB_LABEL[emp.contractSubType]})` : '';
    const empTypeHTML = `${esc(empTypeText)} ${esc(subTypeText)}`;
    const jobCatText = JOB_CAT_LABEL[emp.jobCat] || '';
    const isOutsourced = emp.empType === 'outsourced';
    const laborSigned = !!emp.contractLabor;
    const laborEnd = emp.contractEndDate || '';
    /* 서명진행중 — 계약서가 발송되었으나 아직 서명 전 (contractSentDate 만 있고 contractLabor=false) */
    const laborSigning = !laborSigned && !!emp.contractSentDate;
    let laborStatusHTML = ext
      ? statusBadge(false, '', { na:true })
      : statusBadge(laborSigned, laborEnd, { signing: laborSigning });
    /* 등록 상태 — 근로 유형별로 완료 기준이 다름.
     *   - 내부 인력 (정규/계약/일용): 상세 정보까지 본 모달에서 저장된 적 있어야 완료 (contractDetailComplete)
     *   - 외부 인력 (도급/파견): 상세 정보 섹션 자체가 없으므로, 필수 정보 6종이 채워지면 완료
     *   - 변경 결재 대기 중에는 「변경승인 대기」 로 표시 (등록완료보다 우선) */
    const isDetailComplete = isContractInfoComplete(emp);
    const draftStatusHTML = emp.contractApprovalPending
      ? `<span class="pill pill--warning" style="font-size:11px;">변경승인 대기</span>`
      : (isDetailComplete
          ? `<span class="pill pill--success" style="font-size:11px;">등록완료</span>`
          : `<span class="pill pill--warning" style="font-size:11px;">등록중</span>`);
    /* [서명 요청] 버튼 노출 조건 — 등록 상태 = 등록완료 AND 계약 상태 = 미서명.
       (변경승인 대기 / 등록중 / 외부인력 / 서명진행중 / 서명완료) 는 모두 미노출. */
    const showLaborSignReq = isDetailComplete && !emp.contractApprovalPending
                          && !ext && !laborSigned && !laborSigning;
    if (showLaborSignReq && !hideActs) {
      laborStatusHTML += ` <button class="btn btn--xs btn--outline-primary" type="button" data-empi-request-sign="labor" style="margin-left:6px;">서명 요청</button>`;
    }
    /* 서명완료(만료·만료 임박 포함) 계약은 서명 완료본을 미리보기로 확인 */
    if (laborSigned && !hideActs) {
      laborStatusHTML += ` <button class="btn btn--xs" type="button" data-empi-contract-preview="labor" style="margin-left:6px;">미리보기</button>`;
      /* 계약 정보 편집·승인 후 기존 서명본과 달라질 수 있으므로 최신 정보로 재서명 요청.
         등록 상태가 '등록완료'(상세 포함 완료 + 결재 대기 아님)일 때만 노출. */
      if (isDetailComplete && !emp.contractApprovalPending && !selfView) {
        laborStatusHTML += ` <button class="btn btn--xs" type="button" data-empi-request-sign="labor" style="margin-left:6px;">최신 정보로 서명 요청</button>`;
      }
    }

    /* 인사정보카드 본문 — 근로 계약 정보 행 구성
     *   모달에서 입력하는 모든 필드를 빠짐없이 노출. 내부 인력(정규/계약/일용)만 상세 정보 추가. */
    const isInternal = ['regular','contract','daily'].indexOf(emp.empType) >= 0;
    /* 근로 계약 정보 — 계약 고유 항목만 노출.
       등록 상태 / 계약 기간 / 근로 유형 / 사원 유형
       (부서·직무·근무지는 「근무 정보」 섹션으로 이관 — 중복 제거) */
    const laborRows = [
      ['등록 상태', draftStatusHTML,            { html: true }],
      ['계약 기간', formatContractPeriod(emp)],
      ['근로 유형', empTypeHTML,                { html: true }],
      ['사원 유형', jobCatText],
    ];

    /* 임금 계약 — 도급직(ext)만 N/A. 일용직은 시급제 임금계약 대상. */
    const wageSigned = !!emp.contractWage;
    const wageEnd = emp.contractWageEndDate || emp.contractEndDate || '';
    /* 서명진행중 — 임금계약서 발송되었으나 미서명 (wageContractSentDate 만 있고 contractWage=false).
     *   현재는 별도 발송일 필드가 없으므로 false 로 떨어지지만, 추후 필드 추가 시 자동 반영. */
    const wageSigning = !wageSigned && !!emp.wageContractSentDate;
    let wageStatusHTML = ext
      ? statusBadge(false, '', { na:true })
      : statusBadge(wageSigned, wageEnd, { signing: wageSigning });
    /* [서명 요청] 버튼 노출은 임금 등록완료 판정 후 아래에서 처리 — wageStatusHTML 갱신. */
    const wagePeriod = ext ? '해당없음'
                     : (wageEnd ? `~ ${wageEnd}` : '미입력');

    /* 근로 계약 정보 존재 여부 — 핵심 필드(시작일/종료일/서명/근로유형) 중 하나라도 있으면 편집,
     *   아예 비어 있으면 신규 입력 시그널로 [+ 추가] 노출.
     *
     * 버튼 상태 매트릭스 (등록상태 × 계약상태):
     *   미등록      + 미서명           → [+ 추가] 활성
     *   등록완료    + 미서명/서명완료    → [편집] 활성
     *   등록완료    + 서명진행중        → [편집] 비활성
     *   변경승인대기 + 미서명/서명완료    → [편집] 비활성
     */
    const hasLaborInfo = !!(emp.contractStartDate || emp.contractEndDate || emp.contractLabor || emp.empType);
    /* 선행 조건 — 근무 정보(근무지·부서·직위·직책·직무)가 등록되어야 근로 계약 정보 입력 가능. */
    const orgSet = !!(emp.dept && emp.rank && emp.position && emp.job && emp.site);
    const empAct = (!selfView && canEditEmployment() && orgSet) ? (hasLaborInfo ? ['edit'] : ['add']) : [];
    const empActDisabled = canEditEmployment() && hasLaborInfo &&
      (!!emp.contractApprovalPending || laborSigning);
    /* '승인 대기중' 뱃지 제거 — 등록 상태 pill('변경승인 대기') 로 이미 표현되어 중복이므로 노출하지 않음 */
    const pendingBadge = '';
    const labor = blockFn({
      first: true, key:'employment', title: '근로 계약 정보', visibility: 'public', actions: empAct,
      actionsDisabled: empActDisabled,
      badge: pendingBadge,
      body: !orgSet ? laborOrgGatedHTML()
                    : (hasLaborInfo ? fieldGridHTML(laborRows, { scroll: true }) : laborContractEmptyHTML()),
    });
    /* 임금 계약 정보 — 도급직(외부)만 N/A 표시. 일용직 포함 그 외는 본 모달의 입력 항목을 전부 노출.
     *   선행 조건: 근로 계약 정보 '작성완료' + 근로 계약 이력(실제 근로계약서) 존재 시에만 임금 계약 입력 가능 (정책).
     *   액션:
     *     · N/A → 액션 없음
     *     · 근로 계약 미완료 → 액션 없음 + 안내 박스
     *     · 데이터 없음 → [+ 추가]
     *     · 데이터 있음 → [편집]
     *   '승인 대기중' 뱃지는 wageApprovalPending 기준. */
    const wageApplicable = isWageContractApplicable(emp);
    /* 선행 조건 (정책) — (1) 근로 계약 정보 완료 (2) 금일 기준 유효한 근로 계약서 존재.
       소정근로시간은 임금 계약 모달에서 함께 입력하므로 별도 선행 조건이 아니다. */
    const laborInfoDone   = isContractInfoComplete(emp);
    const laborHistExists = hasValidLaborContract(emp);
    const laborDone = laborInfoDone && laborHistExists;
    const hasWageInfo = !!(emp.wageContractStartDate || emp.wageContractEndDate || emp.wageType || emp.contractAmount || emp.contractWage);
    const wageAct = (!selfView && canEditEmployment() && wageApplicable && laborDone) ? (hasWageInfo ? ['edit'] : ['add']) : [];
    /* 버튼 매트릭스 — 근로계약과 동일 (등록상태 × 계약상태):
     *   변경승인 대기 또는 서명진행중 → [편집] 비활성 */
    const wageActDisabled = (canEditEmployment() && wageApplicable && laborDone && hasWageInfo) &&
      (!!emp.wageApprovalPending || wageSigning);
    /* '승인 대기중' 뱃지 제거 — 등록 상태 pill('변경승인 대기') 로 이미 표현되어 중복이므로 노출하지 않음 */
    const wagePendingBadge = '';

    let wageBody;
    if (!wageApplicable) {
      wageBody = fieldGridHTML([
        ['계약 상태', wageStatusHTML, { html: true }],
        ['계약 기간', '해당없음'],
      ], { scroll: true });
    } else if (!hasWageInfo && !laborDone) {
      /* 임금 정보가 아직 없고 선행 조건(근로 정보 + 근로 계약 이력) 미충족 → 입력 차단 안내 */
      wageBody = wageGatedHTML(!laborInfoDone ? 'info' : 'history');
    } else if (!hasWageInfo) {
      wageBody = wageContractEmptyHTML();
    } else {
      const wageDraftHTML = emp.wageApprovalPending
        ? `<span class="pill pill--warning" style="font-size:11px;">변경승인 대기</span>`
        : (isWageInfoComplete(emp)
            ? `<span class="pill pill--success" style="font-size:11px;">등록완료</span>`
            : `<span class="pill pill--warning" style="font-size:11px;">등록중</span>`);
      /* [서명 요청] 버튼 노출 조건 — 등록 상태 = 등록완료 AND 계약 상태 = 미서명 */
      /* 임금계약 서명 요청 — 근로계약이 서명완료(laborSigned) 된 후에만 가능.
         근로계약 서명진행중/미서명 단계에서는 요청 불가. */
      const wageReqReady = isWageInfoComplete(emp) && !emp.wageApprovalPending
                        && !ext && !wageSigned && !wageSigning;
      if (wageReqReady && laborSigned && !hideActs) {
        wageStatusHTML += ` <button class="btn btn--xs btn--outline-primary" type="button" data-empi-request-sign="wage" style="margin-left:6px;">서명 요청</button>`;
      } else if (wageReqReady && !laborSigned && !hideActs) {
        wageStatusHTML += ` <span style="font-size:11px;color:var(--color-text-muted);margin-left:6px;">근로계약 서명완료 후 요청 가능</span>`;
      }
      /* 서명완료(만료·만료 임박 포함) 계약은 서명 완료본을 미리보기로 확인 */
      if (wageSigned && !hideActs) {
        wageStatusHTML += ` <button class="btn btn--xs" type="button" data-empi-contract-preview="wage" style="margin-left:6px;">미리보기</button>`;
        /* 임금 계약 정보 편집·승인 후 최신 정보로 재서명 요청.
           근로계약 서명완료 + 등록 상태 '등록완료'(완료 + 결재 대기 아님) 일 때만 노출. */
        if (laborSigned && isWageInfoComplete(emp) && !emp.wageApprovalPending && !selfView) {
          wageStatusHTML += ` <button class="btn btn--xs" type="button" data-empi-request-sign="wage" style="margin-left:6px;">최신 정보로 서명 요청</button>`;
        }
      }
      /* 요청: 임금 계약 정보 노출 항목 정리.
         공통      : 등록 상태 / 계약 기간 / 임금 유형 / 계약 금액 / 임금 지급일 / 임금 지급방법
         연봉제 전용 : 임금 계약 유형 / 월 기본급 / 월 고정연장근무수당 / 월 지급 기준액
         시급제 전용 : 시급 / 주휴수당 */
      const wageTypeText = WAGE_TYPE_LABEL[emp.wageType] || '';
      const isAM = ['annual','monthly'].indexOf(emp.wageType) >= 0;
      const isHourly = emp.wageType === 'hourly';
      /* 시급제 표시값 — 시급(기본) / 주휴수당(=시급 20% 절사). 저장값 우선, 없으면 계약금액에서 역산. */
      const dispHourly  = emp.hourlyWage != null && emp.hourlyWage !== '' ? Number(emp.hourlyWage)
                        : (isHourly && emp.contractAmount ? Math.round(Number(emp.contractAmount) / 1.2) : 0);
      const dispHoliday = emp.holidayAllowance != null && emp.holidayAllowance !== '' ? Number(emp.holidayAllowance)
                        : Math.floor(dispHourly * 0.2);

      const wageRows = [
        ['등록 상태', wageDraftHTML,            { html: true }],
        ['계약 기간', formatWagePeriod(emp)],
        ['임금 유형', wageTypeText],
        ['계약 금액', isHourly
          ? (emp.contractAmount ? `${formatMoney(emp.contractAmount)}원 <span style="color:var(--color-text-muted);font-size:12px;">(주휴수당 포함)</span>` : '')
          : formatContractAmount(emp), { html: true }],
      ];
      if (isAM) {
        wageRows.push(['임금 계약 유형', formatWageKind(emp)]);
        wageRows.push(['월 기본급',      emp.baseSalary ? `${formatMoney(emp.baseSalary)}원` : '']);
        const otAmt = emp.wageContractKind === 'inclusive' ? emp.inclusiveOTAmount : emp.fixedOTAmount;
        wageRows.push(['월 고정연장근무수당', otAmt ? `${formatMoney(otAmt)}원` : '']);
        wageRows.push(['월 지급 기준액', formatMonthlyBase(emp)]);
      }
      if (isHourly) {
        wageRows.push(['시급',     dispHourly  ? `${formatMoney(dispHourly)}원` : '']);
        wageRows.push(['주휴수당', dispHoliday ? `${formatMoney(dispHoliday)}원 <span style="color:var(--color-text-muted);font-size:12px;">(시급의 20%)</span>` : '', { html: true }]);
      }
      wageRows.push(['임금 지급일',   emp.payDay   ? `매월 ${emp.payDay}일` : '']);
      wageRows.push(['임금 지급방법', emp.payMethod || '계좌이체']);
      wageBody = fieldGridHTML(wageRows, { scroll: true });
    }

    const wage = blockFn({
      key:'wage', title: '임금 계약 정보', visibility: 'public', actions: wageAct,
      actionsDisabled: wageActDisabled,
      badge: wagePendingBadge,
      body: wageBody,
    });

    /* 계약 이력 — 근로/임금 각각 별도 6컬럼 테이블로 분리해 해당 정보 섹션 바로 아래에 배치.
       App.HRContract 가 단일 진실원. 초안(draft) 제외 전 상태(서명대기/서명완료/만료)를 최신순 누적.
       → 서명 요청 발송 즉시 'signing' 행이 만들어져 이력에 쌓인다. */
    const allHist = (window.App && App.HRContract && typeof App.HRContract.historyRowsByEmp === 'function')
      ? App.HRContract.historyRowsByEmp(emp.id) : [];
    /* '+ 계약서 작성' 버튼 — [서명 요청] 과 동일한 계약서 작성 오버레이(openEditorOverlay) 진입.
       근로: 외부인력 아님 + 조직정보(직위·직책) 등록 시. 임금: 임금계약 대상 + 근로계약 작성완료 시. */
    /* '+ 계약서 작성' 버튼 — 인사정보 카드의 정보 변경 결재는 근로/임금 계약과 무관하므로
       '변경 승인 대기' 상태여도 계약서 작성은 항상 가능하게 활성화한다. */
    const newCtrBtn = (kindKey, show, disabled, disabledTitle) => {
      if (!(show && !selfView && !hideActs && canEditEmployment())) return '';
      if (disabled) {
        const t = disabledTitle || '변경 승인 대기 중에는 계약서를 작성할 수 없습니다. 승인 완료 후 작성해 주세요.';
        return `<button type="button" disabled title="${esc(t)}" style="font-size:12px;color:var(--color-text-muted);background:transparent;border:1px solid var(--color-border);padding:3px 10px;border-radius:5px;cursor:not-allowed;opacity:0.5;">+ 계약서 작성</button>`;
      }
      return `<button type="button" data-empi-ctr-new="${kindKey}" style="font-size:12px;color:var(--color-text-sub);background:transparent;border:1px solid var(--color-border);padding:3px 10px;border-radius:5px;cursor:pointer;">+ 계약서 작성</button>`;
    };
    const laborHist = subBlockHTML({
      first: true, key:'ctrhist-labor', title: '근로 계약 이력', visibility: 'public',
      badge: newCtrBtn('labor', !ext && orgSet, false),
      body: contractHistoryTableHTML(allHist.filter(it => it.kind === '근로계약서')),
    });
    /* 임금 계약 이력 [+ 계약서 작성] — 버튼은 활성 상태로 노출하고, 클릭 시 선행 조건을 검사한다.
       정책: 금일 기준 유효한 근로 계약서가 없으면 클릭 시 안내가 뜨고 진입이 막힌다(아래 click 핸들러).
       (버튼을 비활성화하면 클릭이 안 돼 안내도 뜨지 않으므로 항상 활성 유지.) */
    const wageHist = subBlockHTML({
      key:'ctrhist-wage', title: '임금 계약 이력', visibility: 'public',
      badge: newCtrBtn('wage', wageApplicable, false),
      body: contractHistoryTableHTML(allHist.filter(it => it.kind === '임금계약서'), { showLinkedLabor: true }),
    });

    /* 외부(계약 관리 개별 작성) 에서 단일 박스만 재사용 — opts.only: 'labor' | 'wage' | 'hist' */
    if (opts && opts.only === 'labor') return labor;
    if (opts && opts.only === 'wage')  return wage;
    if (opts && opts.only === 'hist')  return laborHist + wageHist;
    /* 계약 정보 = 근로 계약 이력 + 임금 계약 이력.
       근로/임금 계약 정보 설정은 각 이력의 [+ 계약서 작성] 흐름에서 처리(설정 모달 → 서명 요청).
       내 정보(셀프서비스) 는 [+ 계약서 작성] 등 관리 액션만 숨기고(각 버튼의 !selfView 게이트),
       이력 테이블 자체는 노출한다 — 직원이 본인 근로/임금 계약서를 열람·인쇄(이력 행 클릭 → 미리보기
       모달의 [인쇄]/[PDF 다운로드]) 할 수 있어야 하기 때문. */
    return laborHist + wageHist;
  }

  /* 조직 정보(부서·직위·직책) 미등록 — 근로 계약 정보 입력 선행 조건 안내 */
  function laborOrgGatedHTML() {
    return `<div style="padding:18px 16px;background:var(--color-surface-alt);border:1px dashed var(--color-divider);border-radius:6px;color:var(--color-text-muted);font-size:13px;text-align:center;line-height:1.6;">
      근무 정보(근무지·부서·직위·직책·직무) 작성이 완료된 후<br/>근로 계약 정보를 입력할 수 있습니다.
    </div>`;
  }
  /* 근로 계약 정보 미입력 상태 — '추가' 액션으로 진입 유도 */
  function laborContractEmptyHTML() {
    return `<div style="padding:18px 16px;background:var(--color-surface-alt);border:1px dashed var(--color-divider);border-radius:6px;color:var(--color-text-muted);font-size:13px;text-align:center;">
      등록된 근로 계약 정보가 없습니다. 우측 [+ 추가] 버튼을 눌러 입력해 주세요.
    </div>`;
  }
  /* 임금 계약 정보 미입력 상태 */
  function wageContractEmptyHTML() {
    return `<div style="padding:18px 16px;background:var(--color-surface-alt);border:1px dashed var(--color-divider);border-radius:6px;color:var(--color-text-muted);font-size:13px;text-align:center;">
      등록된 임금 계약 정보가 없습니다. 우측 [+ 추가] 버튼을 눌러 입력해 주세요.
    </div>`;
  }
  /* 임금 계약 정보 — 근로 계약이 작성중일 때 진입 차단 안내 */
  /* 소정근로시간 미등록 상태 — '추가' 액션으로 진입 유도 */
  function stdHoursEmptyHTML() {
    return `<div style="padding:14px 16px;background:var(--color-surface-alt);border:1px dashed var(--color-divider);border-radius:6px;color:var(--color-text-muted);font-size:13px;text-align:center;">
      등록된 소정근로시간이 없습니다. 우측 [+ 추가] 버튼을 눌러 입력해 주세요.
    </div>`;
  }
  /* 소정근로시간 — 근로 계약 정보 미완료 시 진입 차단 안내 */
  function stdHoursGatedHTML() {
    return `<div style="padding:18px 16px;background:var(--color-surface-alt);border:1px dashed var(--color-divider);border-radius:6px;color:var(--color-text-muted);font-size:13px;text-align:center;line-height:1.6;">
      근로 계약 정보 작성이 완료된 후<br/>소정근로시간을 입력할 수 있습니다.
    </div>`;
  }
  function wageGatedHTML(reason) {
    /* reason: 'info' — 근로 계약 정보 미완료 / 'history' — 서명완료(유효) 근로 계약서 부재 / 'stdhours' — 소정근로시간 미등록 */
    const msg = reason === 'history'
      ? '금일 기준 유효한 근로 계약서가 있어야<br/>임금 계약 정보를 입력할 수 있습니다. 근로계약서 서명·유효기간을 먼저 확인해 주세요.'
      : reason === 'stdhours'
      ? '소정근로시간을 먼저 등록해 주세요.<br/>소정근로시간 정보가 등록된 후 임금 계약 정보를 입력할 수 있습니다.'
      : '근로 계약 정보 작성이 완료된 후<br/>임금 계약 정보를 입력할 수 있습니다.';
    return `<div style="padding:18px 16px;background:var(--color-surface-alt);border:1px dashed var(--color-divider);border-radius:6px;color:var(--color-text-muted);font-size:13px;text-align:center;line-height:1.6;">
      ${msg}
    </div>`;
  }
  /* 근로/임금 계약 이력 — 6컬럼 테이블 (계약번호 | 유형 | 계약 기간 | 상태 | 작성 담당자 | 작성일).
     · 날짜: SWADPIA §1 YY/MM/DD.  · §3.1 정렬: 계약번호·유형·기간·상태·작성일=중앙 / 작성 담당자(이름)=좌.
     · 계약번호는 link-code — 행 클릭(is-clickable) 시 서명본 미리보기(data-empi-ctrhist-preview). */
  function contractHistoryTableHTML(rows, opts) {
    const o = opts || {};
    /* 임금계약 이력만 '연결 근로계약' 컬럼 노출 — 임금계약은 근로계약에 의존하므로 어떤 근로계약 기준인지 표기. */
    const showLinked = !!o.showLinkedLabor;
    if (!rows || !rows.length) {
      return `<div style="padding:14px 16px;background:var(--color-surface-alt);border:1px dashed var(--color-divider);border-radius:6px;color:var(--color-text-muted);font-size:13px;text-align:center;">등록된 계약 이력이 없습니다.</div>`;
    }
    const yy = (s) => s ? esc(s.slice(2).replace(/-/g, '/')) : '-';   // 2026-05-10 → 26/05/10
    const period = (it) => {
      const s = yy(it.startDate);
      if (it.indefinite) return `${s} ~ <span style="color:var(--color-text-muted);">기간의 정함 없음</span>`;
      return `${s} ~ ${yy(it.endDate)}`;
    };
    /* 서명 대기(canCancel)만 [취소] 노출 — 서명 완료·만료·등록 세트 발송분은 취소 불가.
       버튼은 행 미리보기(preview)와 분리 — 클릭 핸들러가 취소 액션을 먼저 처리한다. */
    const cancelBtn = (it) => it.canCancel
      ? ` <button class="btn btn--xs btn--soft-danger" type="button" data-empi-ctrhist-cancel="${esc(it.id)}" title="서명 대기 계약을 취소합니다.">취소</button>`
      : '';
    /* 계약번호를 눌러야 미리보기 — 행 전체 클릭으로는 열지 않는다.
       임금계약 이력의 '연결 근로계약' 번호를 누르면 연결된 근로계약서 미리보기가 열린다. */
    const linkedCell = (it) => showLinked
      ? `<td class="col-center">${it.linkedLaborId ? `<span class="link-code" data-empi-ctrhist-preview="${esc(it.linkedLaborId)}" style="cursor:pointer;" title="연결된 근로계약서 미리보기">${esc(it.linkedLaborId)}</span>` : '<span style="color:var(--color-text-muted);">-</span>'}</td>`
      : '';
    const body = rows.map(it => `
      <tr>
        <td class="col-center"><span class="link-code" data-empi-ctrhist-preview="${esc(it.id)}" style="cursor:pointer;" title="${esc(it.kind)} 미리보기">${esc(it.id)}</span></td>
        <td class="col-center">${esc(it.kind)}</td>
        <td class="col-center">${period(it)}</td>
        ${linkedCell(it)}
        <td class="col-center"><span class="pill${it.statusPill ? ' pill--' + it.statusPill : ''}" style="font-size:11px;">${esc(it.statusLabel)}</span>${cancelBtn(it)}</td>
        <td>${esc(it.registeredBy || '-')}</td>
        <td class="col-center">${yy(it.createdAt)}</td>
      </tr>`).join('');
    return `<div style="overflow-x:auto;">
      <table class="grid" style="width:100%;">
        <thead><tr>
          <th class="col-center">계약번호</th>
          <th class="col-center">유형</th>
          <th class="col-center">계약 기간</th>
          ${showLinked ? '<th class="col-center">연결 근로계약</th>' : ''}
          <th class="col-center">상태</th>
          <th>작성 담당자</th>
          <th class="col-center">작성일</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
  }

  function renderTabContract(emp) {
    const sections = [];

    /* 근무 정보 — 근무지/부서/직위/직책/직무. 근무지만 편집, 부서·직위·직책·직무는 발령 관리. */
    const myInfo = isMyInfoView();
    const worksiteAct = (!myInfo && canEditEmployment()) ? ['edit'] : [];
    /* 근로/임금 계약서 서명 대기 중에는 근무 정보 편집 잠금 (편집 버튼 비활성 + 안내) */
    const worksiteLocked = contractSigningInProgress(emp);
    sections.push(sectionShellHTML({
      key:'worksite', level: 1, title: '근무 정보', visibility: 'public',
      actions: worksiteAct, actionsDisabled: worksiteLocked,
      description: worksiteLocked ? '근로·임금 계약서 서명 대기 중에는 수정할 수 없습니다.' : '',
      body: renderSectionWorkInfo(emp),
    }));

    /* 계약 정보 — 근로 계약(고용 조건+상태) + 임금 계약. 근로 계약 sub-block 에 [편집] 부착.
     *   내 정보(셀프서비스)는 열람 전용 — 편집·최신정보 서명요청·계약 이력 숨김(selfView).
     *   ※ 도급직은 근로/임금 계약 자체가 없으므로(해당없음) 계약 정보 섹션을 노출하지 않는다.
     *     도급직 여부/소속회사/사원 유형은 위 「근무 정보」 섹션에서 확인. */
    const isOut = !!(emp.contractOut || emp.empType === 'outsourced');
    if (!isOut) {
      sections.push(sectionShellHTML({ key:'contract', level: 1, title: '계약 정보', visibility: 'public', body: renderSectionContract(emp, { selfView: myInfo }) }));
    }

    return sections.join('');
  }

  /* === 급여 정보 탭 ===
   *   계약 체결된 임금 계약 정보를 기준으로 자동 세팅.
   *   - 정산 정보: 계약 요약(계약 금액·계약일=임금 계약서 완료일) + 임금 정보 + 지급 항목
   *   - 지급 정보: 지급 계좌 + 지급일 (계좌는 사용자 입력, 지급일은 임금 계약에서 가져옴) */
  /* 임금 계약 연동 기간 — 정책: 항상 최신 유효(서명완료/만료 임박) 임금계약서를 기준으로 자동 표시.
   *   급여 정산은 이 기간을 단일 소스로 사용한다. 상태값은 '적용 중' / '만료'.
   *   - 시급제(일용직) 등 무기한 계약은 '기간의 정함 없음 · 적용 중'.
   *   - 새 임금계약서가 서명 대기 중(아직 미반영)이고 기간이 다르면 '최신 계약 반영 예정' 안내 배지(클릭 액션 없음). */
  function wageLinkedPeriodBody(emp) {
    const today = (window.App && App.HRContract && App.HRContract.todayStr)
      ? App.HRContract.todayStr() : new Date().toISOString().slice(0, 10);
    /* 연동 기간·상태 = 실제 '최신 임금 계약서'(서명완료, 만료 포함) 기준.
       최신 임금계약이 만료면 상태도 '만료'. App.HRContract 이력 우선, 미로드 시 emp 필드 폴백. */
    const latest = (window.App && App.HRContract && typeof App.HRContract.latestWageContract === 'function')
      ? App.HRContract.latestWageContract(emp.id) : null;
    let start, end, indef, expired;
    if (latest) {
      start   = latest.startDate;
      indef   = latest.indefinite;
      end     = indef ? '' : latest.endDate;
      expired = latest.expired;
    } else {
      start   = emp.wageContractStartDate || emp.contractStartDate || emp.joinDate || '';
      end     = emp.wageContractEndDate || emp.contractWageEndDate || '';
      indef   = !!emp.wageIndefinite || !end;
      expired = !indef && !!end && end < today;
    }
    const period = indef
      ? `${dispYmd(start) || '-'} ~ 기간의 정함 없음`
      : `${dispYmd(start) || '-'} ~ ${dispYmd(end) || '-'}`;
    /* 임금계약 번호 — 연결된 임금계약서 번호. 누르면 서명본 미리보기 모달(data-empi-ctrhist-preview).
       상태(적용 중/만료) 표기는 제거 — 계약 기간 + 계약 번호만 노출. */
    const wageId = latest ? latest.id : (emp.wageContractId || '');
    const idCell = wageId
      ? `<span class="link-code" data-empi-ctrhist-preview="${esc(wageId)}" style="cursor:pointer;" title="임금계약서 미리보기">${esc(wageId)}</span>`
      : '<span style="color:var(--color-text-muted);">-</span>';
    return fieldGridHTML([
      ['계약 기간',    period],
      ['임금계약 번호', idCell, { html: true }],
    ]);
  }

  function renderTabPayroll(emp) {
    /* 도급직 — 임금 계약 자체가 N/A */
    if (!isWageContractApplicable(emp)) {
      return sectionShellHTML({
        key: 'payroll-na', level: 1, title: '급여 정보', visibility: 'public',
        body: `<div style="padding:18px 16px;background:var(--color-surface-alt);border:1px dashed var(--color-divider);border-radius:6px;color:var(--color-text-muted);font-size:13px;text-align:center;">
          도급직은 임금 계약이 없어 급여 정보가 별도 관리되지 않습니다.
        </div>`,
      });
    }
    /* 세금/원천징수 정보 · 지급 정보 — 정산 정보 유무와 무관하게 항상 노출되는 고정 블록 */
    const taxSection = renderPayrollTaxSection(emp);
    const paySection = renderPayrollPaySection(emp);

    /* 내 정보(셀프서비스) — 지급 정보만 노출 (정산 정보·세금/원천징수 정보 숨김) */
    const myInfo = isMyInfoView();

    /* 정산 정보 게이팅 — 계정 등록완료 + 근로계약 서명완료 + '서명완료된 임금계약 이력 존재'.
     *   임금계약이 만료돼도 정산 정보는 표시하고, 연동 기간 상태를 '만료'로 나타낸다.
     *   (미작성/서명대기 임금계약은 정산 정보 미세팅. 세금·지급 정보는 항상 표시.) */
    if (!(canRegisterCard(emp) && hasSignedWageContract(emp))) {
      if (myInfo) return taxSection + paySection;   /* 내 정보 — 공제 정보(신청) + 지급 정보 */
      const settleGated = sectionShellHTML({
        key: 'payroll-settle', level: 1, title: '정산 정보', visibility: 'public',
        body: `<div style="padding:18px 16px;background:var(--color-surface-alt);border:1px dashed var(--color-divider);border-radius:6px;color:var(--color-text-muted);font-size:13px;text-align:center;line-height:1.6;">
          계정 등록과 근로계약·임금계약 서명이 모두 완료된 후<br/>정산 정보가 자동으로 설정됩니다.
        </div>`,
      });
      return settleGated + taxSection + paySection;
    }

    /* 계약 요약 — 계약 금액 + 계약일(임금 계약서 완료된 날짜 기준). 정산 정보 최상단에 표시. */
    const contractAmt = formatContractAmount(emp);
    const contractDoneDate = wageContractDoneDate(emp);
    const contractSummaryBody = fieldGridHTML([
      ['계약 금액', contractAmt || '-'],
      ['계약일',   dispYmd(contractDoneDate) || '-'],
    ]);
    const periodBody = wageLinkedPeriodBody(emp);

    let settleSection;
    if (emp.wageType === 'hourly') {
      /* === 일용직(시급제) — 계약 금액(계약 요약) + 기본시급 / 주휴수당 === */
      const hourly  = Number(emp.hourlyWage || 0)
                    || (emp.contractAmount ? Math.round(Number(emp.contractAmount) / 1.2) : 0);
      const holiday = Number(emp.holidayAllowance || 0) || Math.floor(hourly * 0.2);
      const wageInfoBody = fieldGridHTML([
        ['기본시급', `${formatMoney(hourly)}원`],
        ['주휴수당', `${formatMoney(holiday)}원 <span style="color:var(--color-text-muted);font-size:12px;">(시급의 20%)</span>`, { html: true }],
      ]);
      settleSection = sectionShellHTML({
        key: 'payroll-settle', level: 1, title: '정산 정보', visibility: 'public',
        body:
          subBlockHTML({ first: true, title: '계약 요약', body: contractSummaryBody }) +
          subBlockHTML({ title: '임금 계약 연동 기간', body: periodBody }) +
          subBlockHTML({ title: '임금 정보', body: wageInfoBody }),
      });
    } else {
      /* === 정규직·계약직(연봉제) — 계약 금액(계약 요약) + 기본급 / 월 고정연장근무수당 / 통상임금 / 통상시급 === */
      const H    = Number(emp.hoursPerMonth || 209);
      const base = Number(emp.baseSalary   || 0);
      const hourlyBase = H ? Math.round(base / H) : 0;   /* 통상시급 = 통상임금 / 월 소정근로시간 */
      const otAmount = emp.wageContractKind === 'fixedOT'   ? Number(emp.fixedOTAmount     || 0)
                     : emp.wageContractKind === 'inclusive' ? Number(emp.inclusiveOTAmount || 0)
                     : 0;
      const wageInfoBody = fieldGridHTML([
        ['기본급',            `${formatMoney(base)}원/월`],
        ['월 고정연장근무수당', `${formatMoney(otAmount)}원/월`],
        ['통상임금',          `${formatMoney(base)}원/월`],
        ['통상시급',          `${formatMoney(hourlyBase)}원`],
      ]);
      settleSection = sectionShellHTML({
        key: 'payroll-settle', level: 1, title: '정산 정보', visibility: 'public',
        body:
          subBlockHTML({ first: true, title: '계약 요약', body: contractSummaryBody }) +
          subBlockHTML({ title: '임금 계약 연동 기간', body: periodBody }) +
          subBlockHTML({ title: '임금 정보', body: wageInfoBody }),
      });
    }

    /* 내 정보(셀프서비스) — 공제 정보(신청) + 지급 정보 노출 (정산 정보는 숨김) */
    if (myInfo) return taxSection + paySection;
    return settleSection + taxSection + paySection;
  }

  /* 지급 정보 — 지급 계좌 + 지급일 (정산 정보 유무와 무관하게 항상 표시되는 고정 블록) */
  function renderPayrollPaySection(emp) {
    const bankBody = fieldGridHTML([
      ['은행',     emp.bankName    || ''],
      ['계좌번호', emp.bankAccount || ''],
      ['예금주',   emp.bankHolder  || displayName(emp)],
    ]);
    return sectionShellHTML({
      key: 'payroll-pay', level: 1, title: '지급 정보', visibility: 'private',
      actions: isMyInfoView() ? ['request'] : (canEditEmployment() ? ['edit'] : []),
      body:
        subBlockHTML({ first: true, title: '지급 계좌', body: bankBody }),
    });
  }

  /* 공제 정보 — 부양가족 정보 + 중소기업 소득세 감면 정보 2개 소블록.
   *   · 내 정보(셀프서비스): 각 소블록 [신청] → 전자결재 상신(서류 첨부) → 인사담당자 적용.
   *   · 인사담당자(HR): [+추가]/[편집] 으로 직접 적용.
   *   데이터: 부양가족 emp.dependents / 감면 emp.taxReduction. */
  function renderPayrollTaxSection(emp) {
    const editable = canEditEmployment();
    const myInfo = isMyInfoView();
    const emptyBox = (msg) => `<div style="padding:18px 16px;background:var(--color-surface-alt);border:1px dashed var(--color-divider);border-radius:6px;color:var(--color-text-muted);font-size:13px;text-align:center;line-height:1.6;">${msg}</div>`;

    /* ── 소블록 1) 부양가족 정보 — 신청/적용 데이터(emp.dependents) ── */
    const dep = emp.dependents || null;
    const hasDep = !!(dep && Number(dep.count));
    let depBody;
    if (!hasDep) {
      depBody = emptyBox(`등록된 부양가족 공제 정보가 없습니다.${myInfo ? '<br/>서류 보관함 탭에서 가족관계증명서 등을 첨부한 후 우측 [신청] 버튼으로 부양가족 공제를 신청하세요.' : ''}`);
    } else {
      depBody = fieldGridHTML([
        ['부양가족 수', `${Number(dep.count) || 0}명`],
      ], { scroll: true });
    }
    const depActions = myInfo ? ['apply'] : (editable ? [hasDep ? 'edit' : 'add'] : []);
    const depBlock = subBlockHTML({ first: true, key: 'dependents', title: '부양가족 정보', visibility: 'private', actions: depActions, body: depBody });

    /* ── 소블록 2) 중소기업 소득세 감면 정보 ── */
    const tx = emp.taxReduction || {};
    const hasData = !!(tx.enabled || tx.type || tx.rate || tx.startDate || tx.endDate || tx.annualLimit);
    let taxBody;
    if (!hasData) {
      taxBody = emptyBox(`등록된 소득세 감면 정보가 없습니다.${myInfo ? '<br/>서류 보관함 탭에서 중소기업 소득세 감면 통지서 등을 첨부한 후 우측 [신청] 버튼으로 감면을 신청하세요.' : ''}`);
    } else {
      const isTarget = tx.enabled === 'Y';
      const enabledPill = isTarget
        ? '<span class="pill pill--success">대상</span>'
        : (tx.enabled === 'N' ? '<span class="pill pill--muted">비대상</span>' : '');
      taxBody = fieldGridHTML([
        ['대상 여부', enabledPill, { html: true, full: true }],
        ['감면 유형',     isTarget ? (tx.type || '') : ''],
        ['감면율',        isTarget && tx.rate ? `${tx.rate}%` : ''],
        ['감면 시작일',   isTarget ? (tx.startDate || '') : ''],
        ['감면 종료일',   isTarget ? (tx.endDate || '') : ''],
        ['연간 감면한도', isTarget ? `${formatMoney(TAX_ANNUAL_LIMIT)}원` : ''],
        ['감면 누계액',   isTarget ? `${formatMoney(tx.accumAmount || 0)}원` : ''],
      ]);
    }
    const taxActions = myInfo ? ['apply'] : (editable ? [hasData ? 'edit' : 'add'] : []);
    const taxBlock = subBlockHTML({
      key: 'payroll-tax', title: '중소기업 소득세 감면 정보', visibility: 'private',
      actions: taxActions, body: taxBody,
    });

    return sectionShellHTML({
      key: 'payroll-deduction', level: 1, title: '공제 정보', visibility: 'private',
      body: depBlock + taxBlock,
    });
  }

  /* 공제 정보 신청 — 내 정보(셀프서비스) 전용. 전자결재 상신 + 서류 첨부 → 인사담당자 적용. */
  function openDeductionRequest(sec) {
    const emp = CARD_STATE.emp;
    if (!emp) return;
    if (!(window.App && typeof App.openSystemApprovalModal === 'function')) {
      window.toast && window.toast('결재 모듈이 준비되지 않았습니다.', 'warning');
      return;
    }
    const label   = sec === 'dependents' ? '부양가족 공제' : '중소기업 소득세 감면';
    const content = [
      `· 대상자: ${displayName(emp)} (${emp.id}, ${emp.dept || '-'})`,
      `· 신청 구분: ${label} 신청`,
      '',
      '[신청 내용]',
      '※ 관련 서류를 본인의 서류 보관함에 첨부해 주세요.',
      '※ 인사담당자 확인 후 급여에 적용됩니다.',
    ].join('\n');
    App.openSystemApprovalModal({
      docName: `${label} 신청`,
      titlePrefix: `${label} 신청`,
      codeLabel: '신청 구분',
      nameLabel: '대상자',
      matCode: `${label} 신청`,
      matName: `${displayName(emp)} (${emp.id})`,
      customReasons: ['신규 신청', '변경 신청', '정정', '기타'],
      defaultReason: '신규 신청',
      defaultApprovers: [],
      title: `${label} 신청 — ${displayName(emp)}`,
      content,
      attachments: [],
      payload: { empId: emp.id, section: sec, action: 'deduction-apply' },
      onSubmit() {
        window.toast && window.toast(`${label} 신청이 접수되었습니다. 인사담당자 확인 후 적용됩니다.`, 'success');
      },
    });
  }

  /* 섹션 편집 본문 — 부양가족 정보 (인사담당자 적용용). 부양가족 수만 입력. */
  function renderCardEditDependents(emp) {
    const cellPad = 'background:var(--color-surface);padding:6px 12px;';
    const dep = emp.dependents || {};
    const v = (x) => (x != null && x !== '' ? esc(x) : '');
    return `
      <div class="fm-tbl fm-tbl--compact">
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label">부양가족 수</div>
          <div class="fm-tbl__value" style="${cellPad}gap:6px;align-items:center;"><input class="input" type="number" min="0" step="1" data-empi-dep-count value="${v(dep.count)}" style="width:100px;text-align:right;" placeholder="0" /> 명</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label"></div>
          <div class="fm-tbl__value" style="background:transparent;padding:2px 0;">
            <div class="form-help">본인 [신청]의 첨부 서류를 확인한 뒤 인사담당자가 적용합니다.</div>
          </div>
        </div>
      </div>
    `;
  }

  /* ============ 세금/원천징수 정보 편집 모달 (modal-empi-tax) ============
   *   중소기업 취업자 소득세 감면 정보. 기본값 없음 — [+추가]/[편집] 동일 모달.
   *   '비대상' 선택 시 하위 입력은 비활성. 결재 없이 emp.taxReduction 에 직접 저장. */
  const TAX_REDUCTION_TYPES = ['청년', '60세 이상', '장애인', '경력단절 여성'];
  const TAX_ANNUAL_LIMIT = 2000000;   /* 연간 감면한도 — 법정 200만원 고정 */
  function injectPayrollTaxModal() {
    if (document.getElementById('modal-empi-tax')) return;
    const lblStyle = 'display:block;font-size:var(--fs-sm);margin-bottom:6px;color:var(--color-text);';
    const typeOpts = ['<option value="">선택</option>']
      .concat(TAX_REDUCTION_TYPES.map(t => `<option value="${esc(t)}">${esc(t)}</option>`)).join('');
    const html = `
<div class="modal-backdrop" id="modal-empi-tax" data-modal-id="empi-tax" style="z-index:1150;">
  <div class="modal modal--md">
    <div class="modal__header">
      <div class="modal__title">중소기업 소득세 감면 정보</div>
      <button class="modal__close" data-modal-close type="button" aria-label="닫기">✕</button>
    </div>
    <div class="modal__body">
      <div class="empi-tax-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:14px 16px;">
        <div data-empi-tax-dep>
          <label style="${lblStyle}">감면 유형</label>
          <select class="select" data-empi-tax-type style="width:100%;">${typeOpts}</select>
        </div>
        <div data-empi-tax-dep>
          <label style="${lblStyle}">감면율</label>
          <select class="select" data-empi-tax-rate style="width:100%;">
            <option value="">선택</option>
            <option value="90">90%</option>
            <option value="70">70%</option>
          </select>
        </div>
        <div data-empi-tax-dep>
          <label style="${lblStyle}">감면 시작일</label>
          <input type="date" class="input" data-empi-tax-start style="width:100%;">
        </div>
        <div data-empi-tax-dep>
          <label style="${lblStyle}">감면 종료일</label>
          <input type="date" class="input" data-empi-tax-end style="width:100%;">
        </div>
        <div data-empi-tax-dep>
          <label style="${lblStyle}">연간 감면한도</label>
          <div class="input" style="width:100%;background:var(--color-surface-alt);display:flex;align-items:center;color:var(--color-text);">${formatMoney(TAX_ANNUAL_LIMIT)}원</div>
          <div class="form-help">법정 한도 (200만원 고정).</div>
        </div>
        <div data-empi-tax-dep>
          <label style="${lblStyle}">감면 누계액</label>
          <div style="display:flex;align-items:center;gap:8px;">
            <input type="text" inputmode="numeric" class="input" data-empi-tax-accum placeholder="0" readonly tabindex="-1" style="flex:1;background:var(--color-surface-alt);color:var(--color-text-muted);cursor:default;">
            <span style="color:var(--color-text-sub);">원</span>
          </div>
          <div class="form-help">급여 정산 시 자동 누적됩니다 (수기 입력 불가).</div>
        </div>
      </div>
    </div>
    <div class="modal__footer">
      <button class="btn" type="button" data-modal-close>취소</button>
      <button class="btn btn--primary" type="button" data-empi-tax-submit>저장</button>
    </div>
  </div>
</div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
  }
  function openPayrollTaxEdit() {
    const emp = CARD_STATE.emp;
    if (!emp) return;
    injectPayrollTaxModal();
    const modal = document.getElementById('modal-empi-tax');
    if (!modal) return;
    const tx = emp.taxReduction || {};
    modal.querySelector('[data-empi-tax-type]').value  = tx.type || '';
    modal.querySelector('[data-empi-tax-rate]').value  = tx.rate || '';
    modal.querySelector('[data-empi-tax-start]').value = tx.startDate || '';
    modal.querySelector('[data-empi-tax-end]').value   = tx.endDate || '';
    modal.querySelector('[data-empi-tax-accum]').value = formatMoney(tx.accumAmount || 0);   /* 기본 0원 */
    if (window.App && App.Forms && App.Forms.clearAll) App.Forms.clearAll(modal);
    openModal('modal-empi-tax');
  }
  function bindPayrollTaxModal() {
    injectPayrollTaxModal();
    const modal = document.getElementById('modal-empi-tax');
    if (!modal || modal.dataset.bound === '1') return;
    modal.dataset.bound = '1';
    /* 감면 누계액 — 입력 시 천 단위 콤마 */
    const accumInput = modal.querySelector('[data-empi-tax-accum]');
    if (accumInput) accumInput.addEventListener('input', () => {
      const digits = accumInput.value.replace(/[^0-9]/g, '');
      accumInput.value = digits ? Number(digits).toLocaleString() : '';
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-modal-close]')) { closeModal('modal-empi-tax'); return; }
      if (!e.target.closest('[data-empi-tax-submit]')) return;
      const emp = CARD_STATE.emp;
      if (!emp) { closeModal('modal-empi-tax'); return; }
      const F = window.App && App.Forms;
      if (F && F.clearAll) F.clearAll(modal);
      const typeEl  = modal.querySelector('[data-empi-tax-type]');
      const rateEl  = modal.querySelector('[data-empi-tax-rate]');
      const startEl = modal.querySelector('[data-empi-tax-start]');
      const endEl   = modal.querySelector('[data-empi-tax-end]');
      const accumEl  = modal.querySelector('[data-empi-tax-accum]');

      /* 등록/편집은 곧 감면 대상 등록이므로 항상 대상(Y)으로 저장 */
      let ok = true;
      if (!typeEl.value)  { if (F) F.setFieldError(typeEl, '감면 유형을 선택해 주세요.'); ok = false; }
      if (!startEl.value) { if (F) F.setFieldError(startEl, '감면 시작일을 선택해 주세요.'); ok = false; }
      if (startEl.value && endEl.value && endEl.value < startEl.value) {
        if (F) F.setFieldError(endEl, '종료일은 시작일 이후여야 합니다.'); ok = false;
      }
      if (!ok) return;
      const tx = {
        enabled: 'Y',
        type: typeEl.value,
        rate: rateEl.value,
        startDate: startEl.value,
        endDate: endEl.value,
        annualLimit: TAX_ANNUAL_LIMIT,   /* 200만원 고정 */
        accumAmount: Number((accumEl.value || '').replace(/[^0-9]/g, '')) || 0,   /* 누계액 — 기본 0원 */
      };

      function commitTax() {
        emp.taxReduction = tx;
        renderCardBody();
        closeModal('modal-empi-tax');
        window.toast && window.toast('소득세 감면 정보가 저장되었습니다.', 'success');
      }

      /* 감면 시작일·종료일은 저장 후 수정 불가 → 저장 전 재확인.
       *   confirmModal 호스트는 기본 z-index 1100 이라 1150 인 감면 모달 뒤에 가려짐 → 위로 올림. */
      if (window.App && typeof App.confirmModal === 'function') {
        App.confirmModal({
          title: '감면 정보 저장',
          message: '감면 시작일과 감면 종료일은 저장 후 수정할 수 없습니다. 이대로 저장하시겠습니까?',
          confirmText: '저장',
          cancelText: '취소',
          onConfirm: commitTax,
        });
        const host = document.querySelector('[data-confirm-modal-host]');
        if (host) host.style.zIndex = '1200';
      } else {
        commitTax();
      }
    });
  }

  /* === 인사 이력 탭 — sub-tab 으로 분리 ===
   *   각 이력은 데이터가 누적될 수 있어 한 화면에 모두 나열 시 스크롤이 길어진다.
   *   pill-soft 변형 sub-tab 으로 5개 그룹으로 묶어 한 번에 한 그룹만 표시.
   *
   *   sub-tab 그룹:
   *     · appoint    — 발령 이력
   *     · attendance — 근태 현황 + 연차 현황
   *     · evaluation — 평가 이력 + 포상·징계 이력
   *     · event      — 경조사 이력
   *     · loa        — 휴직 이력 (전자결재 휴직 신청 승인 건)
   *     · retirement — 퇴직연금 현황 + 퇴직 사항 (둘 다 비공개)
   *
   *   메인 탭(.tabs--underline) 과 시각적으로 구분되도록 .tabs--pill-soft 사용. */
  const HISTORY_SUBTABS = [
    { key: 'appoint',    label: '발령 이력' },
    { key: 'worksite',   label: '근무지 변경' },
    { key: 'attendance', label: '근태·연차' },
    { key: 'payroll',    label: '급여' },
    { key: 'evaluation', label: '평가·상벌' },
    { key: 'event',      label: '경조사' },
    { key: 'loa',        label: '휴직' },
    { key: 'retirement', label: '퇴직' },
  ];

  /* 이력·현황 탭 공통 — 현황/이력 표는 데이터가 누적될 수 있어 페이지네이션 적용.
   *   페이지당 5건, 5건 초과 시에만 페이지 버튼 노출 (5건 이하는 단일 표).
   *   표마다 고유 key 로 CARD_STATE.histPages[key] 에 현재 페이지 유지.
   *   페이지 버튼: data-empi-hist-key(표 식별) + data-empi-hist-page(이동 페이지). */
  const HIST_PAGE_SIZE = 5;
  function paginatedHistTableHTML(key, headers, rows, opts) {
    const all = rows || [];
    const totalPages = Math.max(1, Math.ceil(all.length / HIST_PAGE_SIZE));
    let page = (CARD_STATE.histPages && CARD_STATE.histPages[key]) || 1;
    if (page > totalPages) page = totalPages;
    const start = (page - 1) * HIST_PAGE_SIZE;
    const pageRows = all.slice(start, start + HIST_PAGE_SIZE);
    const table = dataTableHTML(headers, pageRows, opts);
    if (totalPages <= 1) return table;
    const k = esc(key);
    const btns = [];
    btns.push(`<button class="pagination__btn" type="button" data-empi-hist-key="${k}" data-empi-hist-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>‹</button>`);
    for (let i = 1; i <= totalPages; i++) {
      btns.push(`<button class="pagination__btn${i === page ? ' is-active' : ''}" type="button" data-empi-hist-key="${k}" data-empi-hist-page="${i}">${i}</button>`);
    }
    btns.push(`<button class="pagination__btn" type="button" data-empi-hist-key="${k}" data-empi-hist-page="${page + 1}" ${page === totalPages ? 'disabled' : ''}>›</button>`);
    return `${table}
      <div class="pagination__list" style="display:flex;justify-content:flex-end;gap:4px;margin-top:10px;">${btns.join('')}</div>`;
  }
  function renderHistorySub_appoint(emp) {
    return sectionShellHTML({
      key:'appoint', level: 1, title: '발령 이력', visibility: 'public',
      body: paginatedHistTableHTML('appoint', ['부서명','기간','최종 직급','직무'], mockAppointHistory(emp)),
    });
  }
  function renderHistorySub_worksite(emp) {
    return sectionShellHTML({
      key:'worksite', level: 1, title: '근무지 변경 이력', visibility: 'public',
      body: paginatedHistTableHTML('worksite', ['변경일','기존 근무지','신규 근무지'], mockWorksiteHistory(emp)),
    });
  }
  function renderHistorySub_attendance(emp) {
    return sectionShellHTML({
      key:'attendance', level: 1, title: '근태 현황', visibility: 'public',
      body: paginatedHistTableHTML('attendance', ['월별', '지각(분)', '조퇴(분)', '결근'], mockAttendance(emp)),
    }) + sectionShellHTML({
      key:'leave', level: 1, title: '연차 현황', visibility: 'public',
      body: paginatedHistTableHTML('leave', ['년도','발생일','발생연차','사용연차','잔여연차','비고'], mockLeaveStatus(emp)),
    });
  }
  function renderHistorySub_payroll(emp) {
    return sectionShellHTML({
      key:'payroll', level: 1, title: '급여 계약 변동 이력', visibility: 'private',
      body: canViewPrivate()
        ? paginatedHistTableHTML('payroll',
            ['적용일','임금형태','계약금액'],
            mockWageContractHistory(emp))
        : privateBlockedHTML('급여 계약 변동 이력'),
    });
  }
  function renderHistorySub_evaluation(emp) {
    return sectionShellHTML({
      key:'evaluation', level: 1, title: '평가 이력', visibility: 'public',
      body: paginatedHistTableHTML('evaluation', ['년도','점수','등급'], mockEvaluation(emp)),
    }) + sectionShellHTML({
      key:'reward', level: 1, title: '포상·징계 이력', visibility: 'public',
      body: paginatedHistTableHTML('reward', ['종류','통보일','사유','결과'], mockReward(emp)),
    });
  }
  function renderHistorySub_event(emp) {
    return sectionShellHTML({
      key:'event', level: 1, title: '경조사 이력', visibility: 'public',
      body: paginatedHistTableHTML('event', ['발생일','경조내용','휴가일','경조금','화환비','비고'], mockEventHistory(emp)),
    });
  }
  function renderHistorySub_loa(emp) {
    return sectionShellHTML({
      key:'loa', level: 1, title: '휴직 이력', visibility: 'public',
      body: paginatedHistTableHTML('loa', ['휴직유형','휴직기간','기간(일)','복직(예정)일','현황'], mockLoaHistory(emp)),
    });
  }
  function renderHistorySub_retirement(emp) {
    return sectionShellHTML({
      key:'pension', level: 1, title: '퇴직연금 현황', visibility: 'private',
      body: canViewPrivate()
        ? paginatedHistTableHTML('pension', ['납입월','기준 임금(월)','월 부담금','실제 납입금액','납입일','상태'], mockPension(emp))
        : privateBlockedHTML('퇴직연금 현황'),
    }) + sectionShellHTML({
      key:'pension-settle', level: 1, title: '퇴직연금 중도인출 이력', visibility: 'private',
      body: canViewPrivate()
        ? paginatedHistTableHTML('pension-settle', ['인출일자','인출금액','인출사유'], mockPensionSettle(emp))
        : privateBlockedHTML('퇴직연금 중도인출 이력'),
    }) + sectionShellHTML({
      key:'retirement', level: 1, title: '퇴직 사항', visibility: 'private',
      body: canViewPrivate()
        ? paginatedHistTableHTML('retirement', ['퇴직일','퇴직사유'], mockRetirement(emp))
        : privateBlockedHTML('퇴직 사항'),
    });
  }
  function renderHistorySubBody(emp) {
    switch (CARD_STATE.historyTab) {
      case 'appoint':    return renderHistorySub_appoint(emp);
      case 'worksite':   return renderHistorySub_worksite(emp);
      case 'attendance': return renderHistorySub_attendance(emp);
      case 'payroll':    return renderHistorySub_payroll(emp);
      case 'evaluation': return renderHistorySub_evaluation(emp);
      case 'event':      return renderHistorySub_event(emp);
      case 'loa':        return renderHistorySub_loa(emp);
      case 'retirement': return renderHistorySub_retirement(emp);
      default:           return renderHistorySub_appoint(emp);
    }
  }
  /* 내 정보(셀프서비스)에서 숨기는 이력·현황 sub-tab
   *   · attendance(근태·연차) — '나의 근태현황 / 나의 연차현황' 전용 화면과 중복
   *   · payroll(급여)         — '급여 정보' 탭과 중복
   *   · evaluation(평가·상벌)  — 평가 원본·징계는 민감 → HR 전용 */
  const HISTORY_SUBTABS_HIDDEN_MYINFO = ['attendance', 'payroll', 'evaluation'];
  function renderTabHistory(emp) {
    const myInfo = isMyInfoView();
    const subtabs = myInfo
      ? HISTORY_SUBTABS.filter(t => HISTORY_SUBTABS_HIDDEN_MYINFO.indexOf(t.key) < 0)
      : HISTORY_SUBTABS;
    /* 숨긴 sub-tab 이 현재 선택돼 있으면 첫 노출 탭으로 보정 (잔여 상태 desync 방지) */
    if (myInfo && HISTORY_SUBTABS_HIDDEN_MYINFO.indexOf(CARD_STATE.historyTab) >= 0) {
      CARD_STATE.historyTab = (subtabs[0] && subtabs[0].key) || 'appoint';
    }
    const navHTML = subtabs.map(t => {
      const active = t.key === CARD_STATE.historyTab;
      return `<button type="button" class="tabs__tab${active ? ' is-active' : ''}" data-history-tab="${esc(t.key)}">${esc(t.label)}</button>`;
    }).join('');
    return `
      <div class="tabs tabs--pill-soft" data-empi-card-history-tabs style="margin-bottom:14px;">
        <div class="tabs__nav" style="flex-wrap:wrap;">${navHTML}</div>
      </div>
      <div data-empi-card-history-body>${renderHistorySubBody(emp)}</div>
    `;
  }

  /* --- 나머지 3개 탭은 placeholder (다음 단계에서 구현) --- */
  function renderTabPlaceholder(label) {
    return `<div style="background:var(--color-surface);border:1px dashed var(--color-divider);border-radius:var(--radius-md);padding:60px 20px;text-align:center;color:var(--color-text-muted);">
      <div style="font-size:var(--fs-lg);font-weight:var(--fw-semibold);margin-bottom:8px;">${esc(label)}</div>
      <div style="font-size:var(--fs-sm);">탭 콘텐츠는 다음 단계에서 구성됩니다.</div>
    </div>`;
  }

  /* --- 서류 보관함 탭 — 내 정보(셀프서비스) 와 동일 레이아웃(회사 서류 + 본인 제출 서류).
         · 내 정보(본인) → 보관/서명/업로드/삭제 가능 (selfService)
         · HR 인사정보카드(타인 열람) → view 전용(readonly): 라이브러리 보관·업로드·서명·삭제 등
           수정/업데이트 액션 제거, 미리보기·다운로드 등 열람만 허용. */
  function renderTabDocs(emp) {
    seedDemoJoinDocsOnce();   // 데모 — 권상우 보관함 시드 1회 (App.JoinDocs 로드 후 첫 렌더 시점)
    /* 렌더 대상이 내 정보 페이지인지 둘 중 하나라도 참이면 셀프서비스 (desync 방지). */
    const onMyInfoPage = !!(CARD_STATE.cardRoot && CARD_STATE.cardRoot.id === 'page-my-info');
    const selfService = CARD_STATE.selfService || onMyInfoPage;
    return renderTabDocsSelfService(emp, !selfService);
  }

  /* ===== 데모 시드 — 권상우 「서류 보관함」 (서명완료·보관·업로드) 1회 주입 =====
   *   page-hr-info-mgmt.js 는 page-hr-joindocs.js 보다 먼저 로드되므로 모듈 초기화 시점엔
   *   App.JoinDocs 가 없다. 서류 보관함 탭이 처음 렌더되는 시점(둘 다 로드 완료)에 지연 시드. */
  let _demoDocsSeeded = false;
  function seedDemoJoinDocsOnce() {
    if (_demoDocsSeeded) return;
    if (!joinDocsReady() || typeof App.JoinDocs.addUpload !== 'function') return;
    _demoDocsSeeded = true;
    const ver = {};
    App.JoinDocs.masterDocs().forEach(d => { ver[d.key] = d.activeVersion || 'v1'; });

    /* --- 권상우 보관함 (회사 서류 서명완료 2종 + 보관 1종, 업로드 2건) --- */
    const kwon = STATE.rows.find(r => r.name === '권상우');
    if (kwon) {
      App.JoinDocs.recordSignature(kwon.id, 'sec',  { signedAt: '26/05/02   10:24', version: ver.sec  || 'v1' });
      App.JoinDocs.recordSignature(kwon.id, 'priv', { signedAt: '26/05/02   10:31', version: ver.priv || 'v1' });
      App.JoinDocs.keepDoc(kwon.id, 'pledge');
      if (!App.JoinDocs.getUploads(kwon.id).length) {
        App.JoinDocs.addUpload(kwon.id, { docType: '주민등록등본', fileName: '주민등록등본_권상우.pdf', size: 184320, uploadedAt: '26/05/03   09:12' });
        App.JoinDocs.addUpload(kwon.id, { docType: '통장사본',     fileName: '통장사본_권상우.jpg',     size:  96256, uploadedAt: '26/05/03   09:15' });
      }
    }

    /* --- 윤성수(현재 로그인 사용자) 보관함 — 회사 서류 서명완료 3종 + 보관(미서명) 1종, 업로드 4건 --- */
    const yoon = STATE.rows.find(r => r.name === '윤성수');
    if (yoon) {
      App.JoinDocs.recordSignature(yoon.id, 'sec',  { signedAt: '26/03/04   09:48', version: ver.sec  || 'v1' });
      App.JoinDocs.recordSignature(yoon.id, 'priv', { signedAt: '26/03/04   09:52', version: ver.priv || 'v1' });
      App.JoinDocs.recordSignature(yoon.id, 'wage', { signedAt: '26/03/05   14:10', version: ver.wage || 'v1' });
      App.JoinDocs.keepDoc(yoon.id, 'pledge');   // 보관(미서명)
      if (!App.JoinDocs.getUploads(yoon.id).length) {
        App.JoinDocs.addUpload(yoon.id, { docType: '주민등록등본',   fileName: '주민등록등본_윤성수.pdf',   size: 201728, uploadedAt: '26/03/04   09:20' });
        App.JoinDocs.addUpload(yoon.id, { docType: '통장사본',       fileName: '통장사본_윤성수.jpg',       size:  88064, uploadedAt: '26/03/04   09:23' });
        App.JoinDocs.addUpload(yoon.id, { docType: '졸업증명서',     fileName: '졸업증명서_윤성수.pdf',     size: 156672, uploadedAt: '26/03/04   09:31' });
        App.JoinDocs.addUpload(yoon.id, { docType: '경력증명서',     fileName: '경력증명서_윤성수.pdf',     size: 142336, uploadedAt: '26/03/05   11:05' });
      }
    }
  }

  /* 입사 서류 양식이 본 직원에게 적용되는지 — 대상 태그(전체/생산직 등) vs 직원 속성 */
  function docApplicableToEmp(d, emp) {
    const tags = Array.isArray(d.targetTags) ? d.targetTags : [];
    if (!tags.length) return true;
    const empTags = new Set();
    if (emp.empType === 'regular')    empTags.add('정규직');
    if (emp.empType === 'contract')   empTags.add('계약직');
    if (emp.empType === 'daily')      empTags.add('일용직');
    if (emp.empType === 'commission') empTags.add('촉탁직');
    if (emp.jobCat === 'production')  empTags.add('생산직');
    if (emp.contractOut)              empTags.add('도급직');
    return tags.some(t => empTags.has(t));
  }

  /* ===== 내 정보 > 입사 서류 (셀프서비스) =====
   *   입사서류관리(App.JoinDocs) 라이브러리에서 필요한 서류를 '보관' → 서명 → 미리보기/PDF 다운로드.
   *   보관/서명 상태는 입사서류관리와 공유하는 단일 소스(App.JoinDocs). */
  function joinDocsReady() {
    return !!(window.App && App.JoinDocs && typeof App.JoinDocs.masterDocs === 'function'
      && typeof App.JoinDocs.getKept === 'function');
  }
  function renderTabDocsSelfService(emp, readonly) {
    if (!joinDocsReady()) {
      return sectionShellHTML({ key:'docs', level:1, title:'회사 서류', visibility:'public',
        body: emptyBox('서류 보관함 모듈을 불러올 수 없습니다.') });
    }
    const dash = '<span style="color:var(--color-text-muted);">-</span>';
    const thStyle = 'font-size:12px;font-weight:var(--fw-semibold);color:var(--color-text-muted);text-align:left;padding:10px 12px;border-bottom:1px solid var(--color-border);background:var(--color-surface-alt);';
    const tdBase  = 'font-size:13px;color:var(--color-text);padding:11px 12px;';

    /* ── 본인 제출 서류 (업로드) ── 주민등록등본·원천징수영수증 등 직접 업로드 */
    const uploads = App.JoinDocs.getUploads(emp.id);
    /* readonly(HR 열람) — 업로드 버튼 숨김 */
    const upToolbar = readonly ? '' : `<div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
      <button class="btn btn--sm btn--primary" type="button" data-myinfo-upload-open>+ 서류 업로드</button>
    </div>`;
    const upRows = uploads.map((u, i) => {
      const isLast = i === uploads.length - 1;
      const td = tdBase + (isLast ? '' : 'border-bottom:1px solid var(--color-divider);');
      const sizeTxt = u.size ? `${(u.size / 1024).toFixed(0)} KB` : '-';
      /* readonly — 삭제(수정) 액션 숨김. 다운로드(열람)는 허용. */
      const upAct = readonly ? dash : `<button class="btn btn--xs btn--soft-danger" type="button" data-myinfo-upload-del="${esc(u.id)}">삭제</button>`;
      return `<tr>
        <td style="${td}text-align:center;color:var(--color-text-muted);">${i + 1}</td>
        <td style="${td}font-weight:var(--fw-medium);">${esc(u.docType || '-')}</td>
        <td style="${td}"><a href="javascript:;" data-myinfo-upload-dl="${esc(u.id)}" style="color:var(--color-brand-primary);">${esc(u.fileName || '-')} <span style="font-size:10px;">↓</span></a></td>
        <td style="${td}text-align:right;color:var(--color-text-muted);">${esc(sizeTxt)}</td>
        <td style="${td}">${esc(u.uploadedAt || '-')}</td>
        <td style="${td}text-align:center;">${upAct}</td>
      </tr>`;
    }).join('');
    const emptyUpMsg = readonly
      ? '제출한 서류가 없습니다.'
      : '업로드한 서류가 없습니다.<br/><strong>[+ 서류 업로드]</strong>로 필요한 서류를 등록하세요.';
    const upTable = uploads.length ? `<div class="empi-tblwrap"><table class="empi-tbl empi-tbl--data" style="width:100%;border-collapse:collapse;background:var(--color-surface);border:1px solid var(--color-divider);border-radius:6px;overflow:hidden;">
      <thead><tr>
        <th style="${thStyle}width:40px;text-align:center;">No</th>
        <th style="${thStyle}width:160px;">서류 유형</th>
        <th style="${thStyle}">파일명</th>
        <th style="${thStyle}width:90px;text-align:right;">크기</th>
        <th style="${thStyle}width:150px;">업로드일시</th>
        <th style="${thStyle}width:80px;text-align:center;">관리</th>
      </tr></thead>
      <tbody>${upRows}</tbody>
    </table></div>` : `<div style="padding:32px 16px;background:var(--color-surface-alt);border-radius:var(--radius-md);text-align:center;color:var(--color-text-muted);font-size:var(--fs-sm);line-height:1.7;">
          ${emptyUpMsg}
        </div>`;
    const uploadSection = sectionShellHTML({
      key: 'uploads', level: 1, title: '제출 서류', descBlock: true,
      description: readonly
        ? ''
        : '회사에 제출해야하는 서류를 업로드합니다.',
      visibility: 'public', body: upToolbar + upTable,
    });

    return uploadSection;
  }

  /* ===== 본인 제출 서류 업로드 모달 — 주민등록등본·원천징수영수증 등 ===== */
  const MY_UPLOAD_TYPES = ['주민등록등본', '가족관계증명서', '원천징수영수증', '통장 사본', '자격증 사본', '경력증명서', '건강검진 결과', '기타'];
  function injectMyInfoUploadModal() {
    if (document.getElementById('modal-myinfo-upload')) return;
    const opts = MY_UPLOAD_TYPES.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
    const lbl = 'display:block;font-size:var(--fs-sm);margin-bottom:6px;color:var(--color-text);';
    const html = `
<div class="modal-backdrop" id="modal-myinfo-upload" data-modal-id="myinfo-upload" style="z-index:1200;">
  <div class="modal modal--md">
    <div class="modal__header">
      <div class="modal__title">서류 업로드</div>
      <button class="modal__close" data-modal-close type="button" aria-label="닫기">✕</button>
    </div>
    <div class="modal__body">
      <div style="margin-bottom:16px;">
        <label style="${lbl}">서류 유형 <em style="color:var(--color-danger);font-style:normal;">*</em></label>
        <select class="select" data-myinfo-up-type style="width:100%;">${opts}</select>
      </div>
      <div data-myinfo-up-etc-wrap style="margin-bottom:16px;display:none;">
        <label style="${lbl}">서류명 직접 입력</label>
        <input class="input" type="text" data-myinfo-up-etc placeholder="예: 자기소개서" style="width:100%;" />
      </div>
      <div>
        <label style="${lbl}">파일 <em style="color:var(--color-danger);font-style:normal;">*</em></label>
        <label style="display:flex;align-items:center;gap:10px;border:1px dashed var(--color-border);border-radius:8px;padding:14px 16px;cursor:pointer;background:var(--color-surface-alt);">
          <span class="btn btn--sm">파일 선택</span>
          <span data-myinfo-up-fname style="font-size:13px;color:var(--color-text-muted);">선택된 파일 없음</span>
          <input type="file" data-myinfo-up-file style="display:none;" />
        </label>
        <div class="form-help">PDF·이미지 등 본인 증빙 파일을 선택하세요.</div>
      </div>
    </div>
    <div class="modal__footer">
      <button class="btn" type="button" data-modal-close>취소</button>
      <button class="btn btn--primary" type="button" data-myinfo-up-submit disabled>업로드</button>
    </div>
  </div>
</div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    bindMyInfoUploadModal();
  }
  function bindMyInfoUploadModal() {
    const modal = document.getElementById('modal-myinfo-upload');
    if (!modal || modal.dataset.bound === '1') return;
    modal.dataset.bound = '1';
    const fileInput = modal.querySelector('[data-myinfo-up-file]');
    const submitBtn = modal.querySelector('[data-myinfo-up-submit]');
    modal.addEventListener('change', (e) => {
      if (e.target.closest('[data-myinfo-up-type]')) {
        const isEtc = e.target.value === '기타';
        modal.querySelector('[data-myinfo-up-etc-wrap]').style.display = isEtc ? '' : 'none';
        return;
      }
      if (e.target.closest('[data-myinfo-up-file]')) {
        const f = fileInput.files && fileInput.files[0];
        modal.querySelector('[data-myinfo-up-fname]').textContent = f ? f.name : '선택된 파일 없음';
        if (submitBtn) submitBtn.disabled = !f;
      }
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-modal-close]')) { closeModal('modal-myinfo-upload'); return; }
      if (e.target.closest('[data-myinfo-up-submit]')) {
        const emp = CARD_STATE.emp;
        const f = fileInput.files && fileInput.files[0];
        if (!emp || !f) return;
        let docType = modal.querySelector('[data-myinfo-up-type]').value || '기타';
        if (docType === '기타') {
          const etcEl = modal.querySelector('[data-myinfo-up-etc]');
          const etc = (etcEl && etcEl.value || '').trim();
          if (etc) docType = etc;
        }
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const stamp = `${String(now.getFullYear()).slice(-2)}/${pad(now.getMonth() + 1)}/${pad(now.getDate())}   ${pad(now.getHours())}:${pad(now.getMinutes())}`;
        App.JoinDocs.addUpload(emp.id, { docType, fileName: f.name, size: f.size, uploadedAt: stamp, blob: f });
        closeModal('modal-myinfo-upload');
        renderCardBody();
        window.toast && window.toast(`'${docType}' 서류가 업로드되었습니다.`, 'success');
        return;
      }
    });
  }
  function openMyInfoUploadModal() {
    if (!joinDocsReady()) return;
    injectMyInfoUploadModal();
    const modal = document.getElementById('modal-myinfo-upload');
    /* 초기화 */
    const fileInput = modal.querySelector('[data-myinfo-up-file]');
    if (fileInput) fileInput.value = '';
    modal.querySelector('[data-myinfo-up-fname]').textContent = '선택된 파일 없음';
    modal.querySelector('[data-myinfo-up-type]').selectedIndex = 0;
    modal.querySelector('[data-myinfo-up-etc-wrap]').style.display = 'none';
    const etc = modal.querySelector('[data-myinfo-up-etc]'); if (etc) etc.value = '';
    const submitBtn = modal.querySelector('[data-myinfo-up-submit]'); if (submitBtn) submitBtn.disabled = true;
    openModal('modal-myinfo-upload');
  }

  /* 입사 서류 전자 서명 모달 (내 정보 셀프서비스)
   *   본문 끝까지 확인(스크롤 게이트) → 서명란에 마우스/터치로 직접 서명(sig-canvas, 면적 검증)
   *   → [서명 완료 및 제출]. UI Kit .sig-canvas 컴포넌트 + 통합 서명 페이지(page-contract-sign) 패턴 재사용. */
  const MY_SIGN = { scrollOk: false, sigOk: false };
  function injectMyInfoSignModal() {
    if (document.getElementById('modal-myinfo-sign')) return;
    const html = `
<div class="modal-backdrop" id="modal-myinfo-sign" data-modal-id="myinfo-sign" style="z-index:1200;">
  <div class="modal modal--lg" style="display:flex;flex-direction:column;max-height:92vh;">
    <div class="modal__header">
      <div class="modal__title" data-myinfo-sign-title>서류 서명</div>
      <span style="flex:1;"></span>
      <span class="t-muted" data-myinfo-sign-progress style="font-size:var(--fs-xs);margin-right:10px;">읽음 0%</span>
      <button class="modal__close" data-modal-close type="button" aria-label="닫기">✕</button>
    </div>
    <div class="modal__body" style="background:var(--color-surface-alt);flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:14px;">
      <div class="doc-editor" data-myinfo-sign-scroll style="flex:1;min-height:0;overflow:auto;border-radius:8px;">
        <div class="doc-editor__paper is-readonly" data-myinfo-sign-body style="font-family:inherit;white-space:pre-wrap;"></div>
      </div>
      <div style="flex-shrink:0;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <strong style="font-size:13px;">서명란 <em style="color:var(--color-danger);font-style:normal;">*</em></strong>
          <span class="t-muted" style="font-size:var(--fs-xs);" data-myinfo-sign-hint>본문을 끝까지 확인하신 후 서명할 수 있습니다.</span>
        </div>
        <div class="sig-canvas sig-canvas--sm" data-myinfo-sig data-disabled="1">
          <canvas class="sig-canvas__pad" data-myinfo-sig-canvas></canvas>
          <div class="sig-canvas__placeholder" data-myinfo-sig-ph>📖 본문 전체 확인 후 서명할 수 있습니다</div>
          <div class="sig-canvas__bar">
            <span class="sig-canvas__hint" data-myinfo-sig-msg>서명란에 정확히 서명해 주세요 (최소 면적 기준 적용)</span>
            <button type="button" class="sig-canvas__clear" data-myinfo-sig-clear disabled>지우기</button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal__footer" style="justify-content:space-between;">
      <a href="javascript:;" data-myinfo-sign-dl style="font-size:12px;color:var(--color-brand-primary);align-self:center;">원본 다운로드 ↓</a>
      <div style="display:flex;gap:8px;">
        <button class="btn" type="button" data-modal-close>취소</button>
        <button class="btn btn--primary" type="button" data-myinfo-sign-confirm disabled>서명 완료 및 제출</button>
      </div>
    </div>
  </div>
</div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    bindMyInfoSignModalStatic();
  }
  /* 정적 바인딩 (1회) — 닫기 / 다운로드 / 제출 */
  function bindMyInfoSignModalStatic() {
    const modal = document.getElementById('modal-myinfo-sign');
    if (!modal || modal.dataset.bound === '1') return;
    modal.dataset.bound = '1';
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-modal-close]')) { closeModal('modal-myinfo-sign'); return; }
      if (e.target.closest('[data-myinfo-sign-dl]')) {
        const name = CARD_STATE._signDocName || '입사서류';
        if (App.downloadFile) App.downloadFile(`${name}.pdf`, { context: name });
        return;
      }
      if (e.target.closest('[data-myinfo-sign-confirm]')) {
        if (!(MY_SIGN.scrollOk && MY_SIGN.sigOk)) return;
        const emp = CARD_STATE.emp;
        const key = CARD_STATE._signDocKey;
        if (!emp || !key) { closeModal('modal-myinfo-sign'); return; }
        /* 본인 서명 보관 — emp.docSignatures[key] = { signedAt, version } */
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const stamp = `${String(now.getFullYear()).slice(-2)}/${pad(now.getMonth() + 1)}/${pad(now.getDate())}   ${pad(now.getHours())}:${pad(now.getMinutes())}`;
        let version = '';
        if (App.JoinDocs && App.JoinDocs.masterDocs) {
          const m = App.JoinDocs.masterDocs().find(x => x.key === key);
          version = m ? m.activeVersion : '';
        }
        /* 단일 소스(입사서류관리와 공유)에 본인 서명 기록 → 양쪽 현황 일치 */
        if (App.JoinDocs && App.JoinDocs.recordSignature) {
          App.JoinDocs.recordSignature(emp.id, key, { signedAt: stamp, version });
        } else {
          emp.docSignatures = emp.docSignatures || {};
          emp.docSignatures[key] = { signedAt: stamp, version };
        }
        closeModal('modal-myinfo-sign');
        renderCardBody();        // 입사 서류 탭 재렌더 (상태 → 서명완료)
        window.toast && window.toast(`'${CARD_STATE._signDocName}' 전자 서명이 완료되었습니다.`, 'success');
        return;
      }
    });
  }
  function myInfoSignUpdateSubmit(modal) {
    const btn = modal.querySelector('[data-myinfo-sign-confirm]');
    if (btn) btn.disabled = !(MY_SIGN.scrollOk && MY_SIGN.sigOk);
  }
  /* 본문 스크롤 진행률 게이트 — 끝까지(99%+) 읽어야 서명란 활성 */
  function myInfoSignSetupScroll(modal) {
    const el = modal.querySelector('[data-myinfo-sign-scroll]');
    const sig = modal.querySelector('[data-myinfo-sig]');
    const ph  = modal.querySelector('[data-myinfo-sig-ph]');
    const hint = modal.querySelector('[data-myinfo-sign-hint]');
    if (!el) return;
    const update = () => {
      const max = el.scrollHeight - el.clientHeight;
      const pct = max <= 0 ? 100 : Math.min(100, Math.round((el.scrollTop / max) * 100));
      const prog = modal.querySelector('[data-myinfo-sign-progress]');
      if (prog) prog.textContent = `읽음 ${pct}%`;
      const was = MY_SIGN.scrollOk;
      MY_SIGN.scrollOk = pct >= 99;
      if (MY_SIGN.scrollOk !== was) {
        if (MY_SIGN.scrollOk) {
          sig.removeAttribute('data-disabled');
          if (ph) ph.textContent = '✍️ 마우스 또는 터치로 서명해 주세요';
          if (hint) hint.textContent = '서명란에 서명해 주세요. 면적 기준 통과 시 제출 버튼이 활성화됩니다.';
        } else {
          sig.setAttribute('data-disabled', '1');
          if (ph) ph.textContent = '📖 본문 전체 확인 후 서명할 수 있습니다';
        }
        myInfoSignUpdateSubmit(modal);
      }
    };
    el.scrollTop = 0;
    el.onscroll = update;
    requestAnimationFrame(update);
  }
  /* 서명 캔버스 — 마우스/터치 드로잉 + 면적 검증 (page-contract-sign 패턴) */
  function myInfoSignSetupCanvas(modal) {
    const canvas = modal.querySelector('[data-myinfo-sig-canvas]');
    const wrap   = modal.querySelector('[data-myinfo-sig]');
    const ph     = modal.querySelector('[data-myinfo-sig-ph]');
    const clearBtn = modal.querySelector('[data-myinfo-sig-clear]');
    const msg    = modal.querySelector('[data-myinfo-sig-msg]');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (ph) ph.style.display = '';
    wrap.classList.remove('is-signed', 'is-invalid', 'is-drawing');
    clearBtn.disabled = true;
    MY_SIGN.sigOk = false;
    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = Math.max(1, Math.round(rect.width  * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.strokeStyle = '#1F2937'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    }
    let drawing = false, last = null, dirty = false;
    const pt = (e) => { const r = canvas.getBoundingClientRect(); const t = (e.touches && e.touches[0]) || e; return { x: t.clientX - r.left, y: t.clientY - r.top }; };
    function start(e) { if (wrap.getAttribute('data-disabled') === '1') return; e.preventDefault(); drawing = true; last = pt(e); if (ph) ph.style.display = 'none'; wrap.classList.add('is-drawing'); }
    function move(e) { if (!drawing) return; e.preventDefault(); const p = pt(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; if (!dirty) { dirty = true; clearBtn.disabled = false; } }
    function end() { if (!drawing) return; drawing = false; last = null; validate(); }
    function validate() {
      const w = canvas.width, h = canvas.height;
      if (!w || !h) { MY_SIGN.sigOk = false; return; }
      const data = ctx.getImageData(0, 0, w, h).data;
      let inked = 0;
      for (let i = 3; i < data.length; i += 16) { if (data[i] > 0) inked++; }
      const ratio = inked / ((w * h) / 4);
      MY_SIGN.sigOk = ratio >= 0.010;
      if (MY_SIGN.sigOk) {
        wrap.classList.add('is-signed'); wrap.classList.remove('is-invalid');
        if (msg) { msg.textContent = '✅ 서명이 인식되었습니다. 「서명 완료 및 제출」 을 눌러 제출하세요.'; msg.className = 'sig-canvas__hint t-success'; }
      } else {
        wrap.classList.remove('is-signed'); wrap.classList.add('is-invalid');
        if (msg) { msg.textContent = '⚠️ 서명이 너무 짧습니다. 서명란에 충분히 다시 서명해 주세요.'; msg.className = 'sig-canvas__hint t-danger'; }
      }
      wrap.classList.remove('is-drawing');
      myInfoSignUpdateSubmit(modal);
    }
    function clearAll() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      dirty = false; if (ph) ph.style.display = '';
      wrap.classList.remove('is-signed', 'is-invalid', 'is-drawing');
      clearBtn.disabled = true; MY_SIGN.sigOk = false;
      if (msg) { msg.textContent = '서명란에 정확히 서명해 주세요 (최소 면적 기준 적용)'; msg.className = 'sig-canvas__hint'; }
      myInfoSignUpdateSubmit(modal);
    }
    canvas.onmousedown = start; canvas.onmousemove = move;
    /* mouseup 은 window 레벨 — 모달 재오픈 시 중복 누적 방지(이전 핸들러 제거 후 재등록) */
    if (MY_SIGN._mouseup) window.removeEventListener('mouseup', MY_SIGN._mouseup);
    MY_SIGN._mouseup = end;
    window.addEventListener('mouseup', end);
    canvas.ontouchstart = start; canvas.ontouchmove = move; canvas.ontouchend = end;
    clearBtn.onclick = clearAll;
    requestAnimationFrame(resize);
  }
  function openMyInfoSignModal(docKey, docName) {
    injectMyInfoSignModal();
    const modal = document.getElementById('modal-myinfo-sign');
    if (!modal) return;
    CARD_STATE._signDocKey = docKey;
    CARD_STATE._signDocName = docName || '입사서류';
    MY_SIGN.scrollOk = false; MY_SIGN.sigOk = false;
    modal.querySelector('[data-myinfo-sign-title]').textContent = `${CARD_STATE._signDocName} 전자 서명`;
    const body = (window.App && App.JoinDocs && App.JoinDocs.docBody) ? App.JoinDocs.docBody(docKey) : '';
    modal.querySelector('[data-myinfo-sign-body]').textContent = body || '문서 본문을 불러올 수 없습니다.';
    const prog = modal.querySelector('[data-myinfo-sign-progress]'); if (prog) prog.textContent = '읽음 0%';
    const btn = modal.querySelector('[data-myinfo-sign-confirm]'); if (btn) btn.disabled = true;
    openModal('modal-myinfo-sign');
    /* 모달이 표시된 뒤 캔버스/스크롤 셋업 (getBoundingClientRect 정확성 위해 다음 프레임) */
    requestAnimationFrame(() => { myInfoSignSetupScroll(modal); myInfoSignSetupCanvas(modal); });
  }

  /* --- 탭 본문 렌더 디스패처 --- */
  function renderCardBody() {
    const root  = cardRootEl();
    const body  = root && root.querySelector('[data-empi-card-body]');
    const emp   = CARD_STATE.emp;
    if (!body || !emp) return;
    switch (CARD_STATE.tab) {
      case 'personal': body.innerHTML = renderTabPersonal(emp);  break;
      case 'contract': body.innerHTML = renderTabContract(emp);  break;
      case 'payroll':  body.innerHTML = renderTabPayroll(emp); break;
      case 'history':  body.innerHTML = renderTabHistory(emp); break;
      case 'docs':     body.innerHTML = renderTabDocs(emp); break;
    }
    body.scrollTop = 0;
  }
  function renderCardHeader() {
    const modal = cardRootEl();
    if (!modal) return;
    const emp = CARD_STATE.emp;
    const av = modal.querySelector('[data-empi-card-avatar]');
    const nm = modal.querySelector('[data-empi-card-name]');
    const sb = modal.querySelector('[data-empi-card-sub]');
    if (av) {
      /* 증명사진 — 3:4 비율 (48×64). 사진 없으면 성 이니셜 placeholder. */
      const photoUrl = emp.photoUrl || '';
      av.innerHTML = photoUrl
        ? `<img src="${esc(photoUrl)}" alt="${esc(displayName(emp))}" style="width:48px;height:64px;border-radius:4px;object-fit:cover;display:block;" />`
        : `<span style="width:48px;height:64px;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;background:var(--color-surface-alt);color:var(--color-text-muted);font-size:20px;font-weight:var(--fw-semibold);">${esc(displayName(emp).charAt(0))}</span>`;
    }
    if (nm) nm.textContent = displayName(emp);
    /* 재직 상태 배지 — 휴직 / 재직 / 퇴직 만 구분 표시 (복직 D-day 표기 제거) */
    const dd = modal.querySelector('[data-empi-card-dday]');
    if (dd) {
      dd.innerHTML = emp.status === 'retired'
        ? '<span class="pill">퇴직</span>'
        : (emp.onLeave ? '<span class="pill pill--warning">휴직</span>' : '<span class="pill pill--success">재직</span>');
    }
    if (sb) {
      const dept = emp.dept || '';
      const pos  = emp.position || '';
      const rank = emp.rank || '';
      const parts = [emp.id];
      if (dept) parts.push(dept);
      if (pos)  parts.push(pos);
      else if (rank) parts.push(rank);
      sb.textContent = parts.join(' · ');
    }
    /* 권한 토글 active 상태 동기화 */
    modal.querySelectorAll('[data-empi-card-role-toggle] [data-role]').forEach(btn => {
      const active = btn.dataset.role === CARD_STATE.role;
      btn.style.background = active ? 'var(--color-brand-primary)' : '#fff';
      btn.style.color      = active ? '#fff' : 'var(--color-text)';
    });
    /* 탭 active 상태 동기화 */
    modal.querySelectorAll('[data-empi-card-tabs] [data-tab]').forEach(t => {
      t.classList.toggle('is-active', t.dataset.tab === CARD_STATE.tab);
    });
  }

  /* ============ 인사정보카드 — 등록 검토 Floating Dock (승인 / 반려) ============
   *   임직원 관리 [검토] 진입(계정 등록완료 + HR 승인 대기) 시 카드 우하단에 떠서,
   *   신상 정보(주소·이메일·휴대전화)와 지급 정보(계좌)의 누락·형식 오류를 체크리스트로 보여주고
   *   카드 안에서 바로 승인·반려한다.
   *   · 그룹 클릭 → 해당 탭으로 이동(누락 항목 즉시 확인)
   *   · 접기(—) 토글로 최소화 — 카드 본문을 가리지 않게
   *   내 정보(셀프서비스) 뷰·모달 외 컨테이너에서는 노출하지 않는다. */
  const ICO_CHK_OK   = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
  const ICO_CHK_MISS = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16.5" x2="12" y2="16.5"/></svg>`;
  const ICO_CHK_NA   = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="6" y1="12" x2="18" y2="12"/></svg>`;

  /* 검토 대상 여부 — 계정 등록완료 + HR 승인 대기 (모달에서만; 내 정보 뷰 제외) */
  function cardReviewActive(emp) {
    return !!emp && !isMyInfoView() && emp.acctReg === 'done' && emp.approval === 'pending';
  }
  /* 검토 체크리스트 — 각 항목 {label, state:'ok'|'bad'|'na', note} (note = 문제 사유: '미입력' | '형식 오류')
   *   계정 등록·계약 정보처럼 시스템상 반드시 채워지는 값은 제외하고,
   *   본인이 입력해 누락·형식 오류가 날 수 있는 항목만 확인한다.
   *   · 신상 정보 : 주소(미입력) / 개인 이메일·휴대전화(형식)
   *   · 지급 정보 : 은행·계좌번호·예금주(미입력) / 계좌번호(숫자만, 하이픈 없이) */
  function cardReviewChecklist(emp) {
    const filled  = (v) => !!(v != null && String(v).trim());
    const ok      = (label) => ({ label, state: 'ok' });
    const bad     = (label, note) => ({ label, state: 'bad', note });
    const na      = (label) => ({ label, state: 'na' });
    /* 형식 검증 — 값이 있을 때만 형식을 따진다(빈 값은 '미입력'). */
    const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());
    const phoneOk = (v) => /^01[016789]\d{7,8}$/.test(String(v).replace(/[\s-]/g, ''));   // 010… 숫자 10~11자리
    const acctOk  = (v) => /^\d+$/.test(String(v).trim());                                 // 계좌번호 — 하이픈 없이 숫자만
    const checkFmt = (label, v, fmtOk) => !filled(v) ? bad(label, '미입력') : (fmtOk(v) ? ok(label) : bad(label, '형식 오류'));

    const groups = [];

    /* 신상 정보 — 주소(미입력) + 개인 이메일·휴대전화(형식) */
    groups.push({
      key: 'personal', tab: 'personal', title: '신상 정보',
      items: [
        filled(emp.address) ? ok('주소') : bad('주소', '미입력'),
        checkFmt('개인 이메일', emp.email, emailOk),
        checkFmt('휴대전화',   emp.phone, phoneOk),
      ],
    });

    /* 지급 정보 — 계좌 미입력 + 계좌번호 형식(숫자만). 임금계약 비해당(도급직)은 해당없음. */
    if (!isWageContractApplicable(emp)) {
      groups.push({ key: 'pay', tab: 'payroll', title: '지급 정보', items: [na('지급 계좌')] });
    } else {
      groups.push({
        key: 'pay', tab: 'payroll', title: '지급 정보',
        items: [
          filled(emp.bankName) ? ok('은행') : bad('은행', '미입력'),
          checkFmt('계좌번호', emp.bankAccount, acctOk),
          filled(emp.bankHolder || displayName(emp)) ? ok('예금주') : bad('예금주', '미입력'),
        ],
      });
    }
    return groups;
  }
  /* 전체 누락/형식오류 건수 */
  function cardReviewMissingCount(emp) {
    return cardReviewChecklist(emp).reduce((n, g) => n + g.items.filter(i => i.state === 'bad').length, 0);
  }

  /* Dock 껍데기 style (접힘/펼침 공통) */
  function reviewDockShellStyle() {
    return 'position:absolute;right:20px;bottom:20px;width:340px;max-width:calc(100% - 40px);z-index:6;'
         + 'background:var(--color-surface);border:1px solid var(--color-border);border-radius:10px;'
         + 'box-shadow:0 10px 32px rgba(15,23,42,0.20);display:flex;flex-direction:column;overflow:hidden;';
  }
  /* Dock 내부 HTML */
  function reviewDockInnerHTML(emp) {
    const groups = cardReviewChecklist(emp);
    const totalMiss = groups.reduce((n, g) => n + g.items.filter(i => i.state === 'miss').length, 0);
    const min = !!CARD_STATE.reviewDockMin;

    /* 헤더 — 타이틀 + (접힘 시 상태 pill) + 접기/펼치기 토글 */
    const headStatusPill = min
      ? (totalMiss > 0
          ? `<span class="pill pill--warning" style="font-size:11px;">${totalMiss}건 확인</span>`
          : `<span class="pill pill--success" style="font-size:11px;">이상 없음</span>`)
      : '';
    const chevron = min
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
    const header = `
      <div style="display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:${min ? '0' : '1px solid var(--color-divider)'};background:var(--color-surface-alt);">
        <span style="display:inline-flex;color:var(--color-brand-primary);">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        </span>
        <span style="font-size:13px;font-weight:var(--fw-semibold);color:var(--color-text);flex:1;min-width:0;">등록 정보 검토</span>
        ${headStatusPill}
        <button type="button" data-review-dock-min title="${min ? '펼치기' : '접기'}"
          style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border:1px solid var(--color-border);border-radius:5px;background:var(--color-surface);color:var(--color-text-sub);cursor:pointer;flex-shrink:0;">${chevron}</button>
      </div>`;

    if (min) return header;

    /* 체크리스트 — 그룹 단위(클릭 시 해당 탭 이동). 문제 항목만 하단에 빨간 글씨로 사유와 함께 표기. */
    const rowHTML = (g) => {
      const bad = g.items.filter(i => i.state === 'bad');
      const allNa = g.items.every(i => i.state === 'na');
      let ico, color, statusText;
      if (bad.length)       { ico = ICO_CHK_MISS; color = 'var(--color-danger)';  statusText = `${bad.length}건 확인`; }
      else if (allNa)       { ico = ICO_CHK_NA;   color = 'var(--color-text-muted)'; statusText = '해당없음'; }
      else                  { ico = ICO_CHK_OK;   color = 'var(--color-success)'; statusText = '이상 없음'; }
      const detail = bad.length
        ? `<div style="margin:3px 0 0 23px;font-size:11.5px;color:var(--color-danger);line-height:1.5;">${esc(bad.map(i => `${i.label} ${i.note}`).join(', '))}</div>`
        : '';
      return `
        <li data-review-jump="${esc(g.tab)}" title="클릭하면 ‘${esc(g.title)}’ 항목으로 이동합니다"
            style="list-style:none;padding:8px 14px;border-bottom:1px solid var(--color-divider);cursor:pointer;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="display:inline-flex;color:${color};flex-shrink:0;">${ico}</span>
            <span style="font-size:12.5px;font-weight:var(--fw-medium);color:var(--color-text);flex:1;min-width:0;">${esc(g.title)}</span>
            <span style="font-size:11.5px;color:${color};flex-shrink:0;">${statusText}</span>
          </div>
          ${detail}
        </li>`;
    };
    const list = `<ul style="margin:0;padding:0;max-height:44vh;overflow:auto;">${groups.map(rowHTML).join('')}</ul>`;

    /* 요약 + 액션 */
    const summary = totalMiss > 0
      ? `<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--color-warning);margin-bottom:10px;">
           <span style="display:inline-flex;">${ICO_CHK_MISS}</span>${totalMiss}건 확인이 필요합니다.</div>`
      : `<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--color-success);margin-bottom:10px;">
           <span style="display:inline-flex;">${ICO_CHK_OK}</span>모든 항목이 확인되었습니다.</div>`;
    const footer = `
      <div style="padding:12px 14px;border-top:1px solid var(--color-divider);background:var(--color-surface);">
        ${summary}
        <div style="display:flex;gap:8px;">
          <button type="button" class="btn btn--sm btn--danger" data-review-act="reject" style="flex:1;">반려</button>
          <button type="button" class="btn btn--sm btn--primary" data-review-act="approve" style="flex:1;">승인</button>
        </div>
      </div>`;

    return header + list + footer;
  }
  /* Dock 렌더 — 검토 대상이면 카드에 주입/갱신, 아니면 제거 */
  function renderCardReviewDock() {
    const modal = document.getElementById('modal-empi-card');
    if (!modal) return;
    const card = modal.querySelector('.modal');
    if (!card) return;
    let dock = card.querySelector('[data-review-dock]');
    const emp = CARD_STATE.emp;
    if (!cardReviewActive(emp)) { if (dock) dock.remove(); return; }
    card.style.position = 'relative';   // Dock 의 absolute 기준
    if (!dock) {
      dock = document.createElement('div');
      dock.setAttribute('data-review-dock', '');
      card.appendChild(dock);
    }
    dock.setAttribute('style', reviewDockShellStyle());
    dock.innerHTML = reviewDockInnerHTML(emp);
  }

  /* --- 모달 open/close --- */
  function openCardModal(emp) {
    if (!emp) return;
    injectCardModal();
    CARD_STATE.cardRoot = null;  // 모달 렌더 (내 정보 페이지에서 설정한 컨테이너 루트 해제)
    CARD_STATE.selfService = false;  // 모달은 HR 관점 — 입사 서류 탭은 조회용
    CARD_STATE.emp = emp;
    CARD_STATE.tab = 'personal';
    CARD_STATE.rrnRevealed = false;
    CARD_STATE.histPages = {};   // 모달 재오픈 시 이력·현황 표 페이지 초기화
    CARD_STATE.reviewDockMin = false;   // 검토 Dock 은 펼친 상태로 시작
    /* role 은 직전 세션 토글값 유지 (모달 재오픈 시 사용자가 마지막 선택한 권한으로 시작) */
    renderCardHeader();
    renderCardBody();
    openModal('modal-empi-card');
    renderCardReviewDock();   // 검토 대상(등록완료+승인대기)이면 우하단 승인/반려 Dock 노출
  }

  /* ============ 내 정보 페이지 — 인사정보카드 내용을 풀페이지로 이식 ============
   *   GNB 우측 프로필 > [내 정보] 클릭 시 진입. 모달과 동일한 헤더/탭/본문을 페이지 컨테이너에 렌더.
   *   본인 카드이므로 전체 섹션 열람(role=hr_admin). 클릭 위임은 모달과 동일 핸들러(cardRootClickHandler) 공유. */
  function cardPageScaffoldHTML() {
    /* 내 정보 — 상단 프로필 헤더(이름·사번·재직 뱃지·인쇄) 제거. 탭부터 바로 노출. */
    return `
      <div style="display:flex;flex-direction:column;height:100%;background:var(--color-surface);min-height:0;">
        <div style="border-bottom:1px solid var(--color-divider);background:var(--color-surface);padding:0 22px;flex-shrink:0;">
          <div class="tabs tabs--underline" data-empi-card-tabs>
            <div class="tabs__nav">
              <button type="button" class="tabs__tab is-active" data-tab="personal" style="padding:14px 18px;font-size:var(--fs-base);">기본 정보</button>
              <button type="button" class="tabs__tab" data-tab="contract" style="padding:14px 18px;font-size:var(--fs-base);">인사 정보</button>
              <button type="button" class="tabs__tab" data-tab="payroll" style="padding:14px 18px;font-size:var(--fs-base);">급여 정보</button>
              <button type="button" class="tabs__tab" data-tab="history" style="padding:14px 18px;font-size:var(--fs-base);">이력·현황</button>
              <button type="button" class="tabs__tab" data-tab="docs" style="padding:14px 18px;font-size:var(--fs-base);">서류 보관함</button>
            </div>
          </div>
        </div>
        <div style="flex:1;overflow:auto;background:var(--color-surface-alt);padding:20px 22px;min-height:0;" data-empi-card-body></div>
      </div>
    `;
  }
  /* 현재 로그인 사용자(데모) — designateCurrentUser 가 지정한 emp. 미지정 시 첫 재직자. */
  function currentUserEmp() {
    if (MY_EMP_ID) {
      const found = STATE.rows.find(r => r.id === MY_EMP_ID);
      if (found) return found;
    }
    return STATE.rows.find(r => r.status !== 'retired') || STATE.rows[0] || null;
  }
  function mountMyInfo(container) {
    if (!container) return;
    const emp = currentUserEmp();
    if (!emp) {
      container.innerHTML = '<div style="padding:48px;text-align:center;color:var(--color-text-muted);">내 정보를 불러올 수 없습니다.</div>';
      return;
    }
    /* 편집 모달들 인젝션·바인딩 보장 (임직원 관리 페이지 미방문 상태에서도 편집 동작) */
    injectCardEditModal(); bindCardEditModal();
    injectPayrollTaxModal(); bindPayrollTaxModal();
    injectDocPreviewModal(); bindDocPreviewModal();
    CARD_STATE.emp = emp;
    CARD_STATE.tab = 'personal';
    CARD_STATE.role = 'hr_admin';   // 본인 카드 — 전체 섹션 열람 (인사정보카드 내용 그대로 이식)
    CARD_STATE.rrnRevealed = false;
    CARD_STATE.histPages = {};
    CARD_STATE.cardRoot = container;
    CARD_STATE.selfService = true;  // 내 정보 — 입사 서류 탭을 본인 다운로드·서명 프로세스로 렌더
    container.innerHTML = cardPageScaffoldHTML();
    bindCardRoot(container);
    renderCardHeader();
    renderCardBody();
  }

  /* --- 모달 바인딩 (1회) --- */
  /* ============ 인사기록카드 인쇄 (PDF) ============
   *   현재 탭과 무관하게 「기본 정보」 탭 내용만 추려 새 창에 「인사기록카드」 타이틀로 출력.
   *   앱 스타일시트를 그대로 복사해 카드 톤을 유지하고, 편집/추가 등 인터랙션 버튼은 인쇄 시 숨긴다. */
  function printEmployeeCard() {
    const emp = CARD_STATE.emp;
    if (!emp) {
      window.toast && window.toast('인쇄할 직원 정보가 없습니다.', 'warning');
      return;
    }
    const content = renderTabPersonal(emp);   /* 기본 정보 탭 내용 */
    const name = displayName(emp);
    const d = new Date();
    const stamp = `${String(d.getFullYear()).slice(-2)}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    /* 앱 스타일 복사 — 외부 CSS는 절대경로 link 로, 인라인 <style> 은 그대로 */
    const headStyles = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map(l => `<link rel="stylesheet" href="${l.href}">`)
      .concat(Array.from(document.querySelectorAll('style')).map(s => s.outerHTML))
      .join('\n');

    const w = window.open('', '_blank', 'width=900,height=1000');
    if (!w) { window.toast && window.toast('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해 주세요.', 'warning'); return; }
    w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8">
      <title>인사기록카드_${esc(name)}</title>
      ${headStyles}
      <style>
        @page { size: A4; margin: 14mm; }
        html, body { background:#fff !important; padding:0; margin:0; }
        .hrcard-print { max-width:760px; margin:0 auto; padding:8px 0 24px; }
        .hrcard-print__head { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; border-bottom:2px solid #333; padding-bottom:10px; margin-bottom:18px; }
        .hrcard-print__title { font-size:24px; font-weight:700; letter-spacing:6px; color:#222; }
        .hrcard-print__meta { font-size:12px; color:#666; text-align:right; line-height:1.6; }
        /* 인쇄용 평탄화 — 그림자 제거, 페이지 분할 시 카드 보존 */
        .hrcard-print section { box-shadow:none !important; break-inside:avoid; }
        /* 인터랙션 버튼(편집/추가/이력 등)은 기록카드에 불필요 → 숨김 */
        .hrcard-print [data-empi-card-section-act] { display:none !important; }
        /* 신상정보 필드 — 인쇄 시 폰트 축소 + 정렬 정리 (날짜·칩 줄바꿈 방지) */
        .hrcard-print .empi-fld { padding:5px 0 !important; min-height:26px !important; }
        .hrcard-print .empi-fld__label { width:92px !important; font-size:11px !important; }
        .hrcard-print .empi-fld__val { font-size:11.5px !important; word-break:keep-all !important; overflow-wrap:break-word !important; }
        .hrcard-print .empi-fld__val .pill { font-size:10px !important; padding:1px 6px !important; }
        /* 학력·경력·자격 표 — 동일 톤으로 폰트 축소 */
        .hrcard-print table { font-size:11.5px !important; }
        .hrcard-print th, .hrcard-print td { padding:5px 8px !important; }
        @media print { .hrcard-print { max-width:none; } }
      </style></head>
      <body>
        <div class="hrcard-print">
          <div class="hrcard-print__head">
            <div class="hrcard-print__title">인사기록카드</div>
            <div class="hrcard-print__meta">성명 ${esc(name)} · 사번 ${esc(emp.id || '-')}<br>출력일 ${stamp}</div>
          </div>
          ${content}
        </div>
        <script>window.onload=function(){setTimeout(function(){window.print();},400);};<\/script>
      </body></html>`);
    w.document.close();
    window.toast && window.toast('인사기록카드를 새 창에서 열었습니다. 인쇄 대화상자에서 "PDF로 저장"을 선택하세요.', 'info');
  }

  function bindCardModal() {
    injectCardModal();
    const modal = document.getElementById('modal-empi-card');
    if (!modal) return;
    if (modal.dataset.bound === '1') return;
    modal.dataset.bound = '1';
    modal.addEventListener('click', cardRootClickHandler);
  }
  /* 카드 루트(모달 또는 내 정보 페이지) 컨테이너에 동일 위임 핸들러 부착 */
  function bindCardRoot(el) {
    if (!el || el.__cardRootBound) return;
    el.__cardRootBound = true;
    el.addEventListener('click', cardRootClickHandler);
  }
  /* 카드 클릭 위임 — 모달/페이지 공용. 내부 DOM 조회는 cardRootEl() 기준. */
  function cardRootClickHandler(e) {
      /* 닫기 — backdrop / 닫기 버튼 (모달에서만 의미; 페이지에는 해당 요소 없음) */
      const modalEl = document.getElementById('modal-empi-card');
      if ((modalEl && e.target === modalEl) || e.target.closest('[data-modal-close]')) {
        closeModal('modal-empi-card');
        return;
      }
      /* PDF 출력 — 인사기록카드(기본 정보)를 새 창으로 열어 인쇄 → "PDF로 저장" */
      if (e.target.closest('[data-empi-card-pdf]')) {
        printEmployeeCard();
        return;
      }
      /* 등록 검토 Dock — 접기/펼치기 토글 */
      if (e.target.closest('[data-review-dock-min]')) {
        CARD_STATE.reviewDockMin = !CARD_STATE.reviewDockMin;
        renderCardReviewDock();
        return;
      }
      /* 등록 검토 Dock — 그룹 클릭 시 해당 탭으로 이동(누락 항목 즉시 확인) */
      const reviewJump = e.target.closest('[data-review-jump]');
      if (reviewJump) {
        CARD_STATE.tab = reviewJump.dataset.reviewJump;
        CARD_STATE.rrnRevealed = false;
        renderCardHeader();
        renderCardBody();
        return;
      }
      /* 등록 검토 Dock — 승인 / 반려 */
      const reviewAct = e.target.closest('[data-review-act]');
      if (reviewAct) {
        const emp = CARD_STATE.emp;
        if (!emp) return;
        if (reviewAct.dataset.reviewAct === 'approve') doApproveAccount(emp, { fromCard: true });
        else doRejectAccount(emp, { fromCard: true });
        return;
      }
      /* 탭 네비 클릭 */
      const tabBtn = e.target.closest('[data-empi-card-tabs] [data-tab]');
      if (tabBtn) {
        CARD_STATE.tab = tabBtn.dataset.tab;
        CARD_STATE.rrnRevealed = false;  // 탭 전환 시 마스킹 복귀
        renderCardHeader();
        renderCardBody();
        return;
      }
      /* 인사 이력 — sub-tab 클릭 (body 만 부분 갱신, 메인 탭 상태는 유지) */
      const histTabBtn = e.target.closest('[data-empi-card-history-tabs] [data-history-tab]');
      if (histTabBtn) {
        CARD_STATE.historyTab = histTabBtn.dataset.historyTab;
        CARD_STATE.histPages = {};   // sub-tab 전환 시 모든 표 페이지 초기화
        const emp = CARD_STATE.emp;
        if (!emp) return;
        cardRootEl().querySelectorAll('[data-empi-card-history-tabs] [data-history-tab]').forEach(t => {
          t.classList.toggle('is-active', t.dataset.historyTab === CARD_STATE.historyTab);
        });
        const body = cardRootEl().querySelector('[data-empi-card-history-body]');
        if (body) body.innerHTML = renderHistorySubBody(emp);
        return;
      }
      /* 이력·현황 표 페이지네이션 (표별 key 단위) */
      const histPageBtn = e.target.closest('[data-empi-hist-page]');
      if (histPageBtn) {
        const p = Number(histPageBtn.dataset.empiHistPage);
        const key = histPageBtn.dataset.empiHistKey;
        const emp = CARD_STATE.emp;
        if (p && key && emp) {
          if (!CARD_STATE.histPages) CARD_STATE.histPages = {};
          CARD_STATE.histPages[key] = p;
          const body = cardRootEl().querySelector('[data-empi-card-history-body]');
          if (body) body.innerHTML = renderHistorySubBody(emp);
        }
        return;
      }
      /* 권한 토글 */
      const roleBtn = e.target.closest('[data-empi-card-role-toggle] [data-role]');
      if (roleBtn) {
        CARD_STATE.role = roleBtn.dataset.role;
        if (CARD_STATE.role !== 'hr_admin') CARD_STATE.rrnRevealed = false;
        renderCardHeader();
        renderCardBody();
        return;
      }
      /* 미서명 → 서명 요청 — 계약서 작성 모달을 인사정보카드 위에 layer 로 띄움.
         페이지 전환 없이 그대로 작업하고, 닫으면 인사정보카드로 돌아옴.
         모든 필드(계약 시작일 ~ 연차 유급휴가)는 인사정보카드 데이터로 자동 prefill. */
      const signBtn = e.target.closest('[data-empi-request-sign]');
      if (signBtn) {
        const emp = CARD_STATE.emp; if (!emp) return;
        const kind = signBtn.dataset.empiRequestSign === 'wage' ? '임금계약서' : '근로계약서';
        /* 임금계약 서명 요청은 근로계약 서명완료 후에만 가능 — 우회 클릭 방어 */
        if (kind === '임금계약서' && !emp.contractLabor) {
          if (window.App && typeof App.sweetAlert === 'function') {
            App.sweetAlert({ icon: 'info', title: '근로계약 서명 필요', message: '근로계약 서명완료 후 임금계약 서명을 요청할 수 있습니다.' });
          } else {
            window.alert('근로계약 서명완료 후 임금계약 서명을 요청할 수 있습니다.');
          }
          return;
        }
        if (window.App && App.HRContract && typeof App.HRContract.openEditorOverlay === 'function') {
          App.HRContract.openEditorOverlay(emp, kind);
        } else if (window.App && App.HRContract && typeof App.HRContract.startEditorForEmp === 'function') {
          /* legacy fallback — 페이지 전환 방식 */
          App.HRContract.startEditorForEmp(emp, kind, { returnTo: 'empi-card', returnEmpId: emp.id });
          if (App.Nav && typeof App.Nav.selectItem === 'function') {
            closeModal('modal-empi-card');
            App.Nav.selectItem('hr-contract', '계약 관리', 'page-hr-contract');
          }
        } else {
          window.toast && window.toast('계약 관리 모듈을 불러올 수 없습니다.', 'danger');
        }
        return;
      }
      /* 근로/임금 계약 이력 — [+ 계약서 작성] : 서명 요청과 동일한 계약서 작성 오버레이 진입.
         발송 완료 시 해당 이력 테이블에 새 계약(서명대기) 행이 누적된다. */
      const newCtrBtn = e.target.closest('[data-empi-ctr-new]');
      if (newCtrBtn) {
        const emp = CARD_STATE.emp; if (!emp) return;
        const isWageBtn = newCtrBtn.dataset.empiCtrNew === 'wage';
        const alertInfo = (title, message) => {
          if (window.App && typeof App.sweetAlert === 'function') App.sweetAlert({ icon: 'info', title, message });
          else window.alert(message);
        };
        /* 인사정보 카드의 정보 변경 결재는 근로/임금 계약과 무관 — '변경 승인 대기' 상태여도 계약서 작성 허용. */

        if (!isWageBtn) {
          /* 근로계약서 — 근무 정보 완료 후 근로 계약 정보 설정 모달 → (완료) → 서명 요청 모달 */
          if (!hasWorkInfo(emp)) {
            alertInfo('근무 정보 필요', '근무 정보(근무지·부서·직위·직책·직무) 작성 완료 후 근로계약서를 작성할 수 있습니다.');
            return;
          }
          CARD_STATE.newContractFlow = 'labor';
          openCardSectionEdit('employment');
          return;
        }

        /* 임금계약서 — 정책: 금일 기준 유효한 근로계약서가 있어야 작성 가능.
           유효 = 서명완료 + 오늘 계약기간 내(만료 아님). 미작성/서명대기/만료 근로계약만으로는 작성 불가. */
        if (!hasValidLaborContract(emp)) {
          alertInfo('유효한 근로 계약서 필요', '금일 기준 유효한 근로 계약서가 있어야 임금계약서를 작성할 수 있습니다. 근로계약서 서명·유효기간을 먼저 확인해 주세요.');
          return;
        }
        /* 도급직 — 임금 계약 해당 없음 */
        if (EXTERNAL_EMP_TYPES.indexOf(emp.empType) >= 0) {
          alertInfo('임금 계약 해당 없음', '도급직은 임금 계약 해당 사항이 없습니다.');
          return;
        }
        /* 최근 근로계약서 일자 — 이력 최신순 첫 행 기준 */
        const laborHistRows = (window.App && App.HRContract && App.HRContract.historyRowsByEmp)
          ? (App.HRContract.historyRowsByEmp(emp.id) || []).filter(it => it.kind === '근로계약서')
          : [];
        const latest = laborHistRows[0];
        const baseDate = latest ? (latest.createdAt || latest.startDate || '') : '';
        const yy = baseDate ? baseDate.slice(2).replace(/-/g, '/') : '';
        const proceedWage = () => {
          CARD_STATE.newContractFlow = 'wage';
          openCardSectionEdit('wage');
        };
        if (window.sweet) {
          window.sweet({
            icon: 'info', title: '임금계약서 작성',
            text: `${yy ? yy + ' 일자 ' : '최근 '}근로계약서 내용을 기준으로 임금계약서를 작성합니다.`,
            cancelText: '취소', confirmText: '확인', onConfirm: proceedWage,
          });
        } else {
          proceedWage();
        }
        return;
      }
      /* 본인 제출 서류 — 업로드 모달 열기 */
      if (e.target.closest('[data-myinfo-upload-open]')) {
        openMyInfoUploadModal();
        return;
      }
      /* 본인 제출 서류 — 다운로드 (업로드한 실제 파일 blob) */
      const upDl = e.target.closest('[data-myinfo-upload-dl]');
      if (upDl) {
        e.preventDefault();
        const emp = CARD_STATE.emp; if (!emp) return;
        const u = App.JoinDocs.getUpload && App.JoinDocs.getUpload(emp.id, upDl.dataset.myinfoUploadDl);
        if (u && typeof App.downloadFile === 'function') App.downloadFile(u.fileName, { blob: u.blob, context: u.docType });
        return;
      }
      /* 본인 제출 서류 — 삭제 */
      const upDel = e.target.closest('[data-myinfo-upload-del]');
      if (upDel) {
        const emp = CARD_STATE.emp; if (!emp) return;
        const id = upDel.dataset.myinfoUploadDel;
        const u = App.JoinDocs.getUpload && App.JoinDocs.getUpload(emp.id, id);
        const doDel = () => { App.JoinDocs.removeUpload(emp.id, id); renderCardBody(); window.toast && window.toast('서류가 삭제되었습니다.', 'success'); };
        if (window.sweet) window.sweet({ icon:'warn', title:'서류 삭제', text:`'${u ? u.docType : '서류'}' 을(를) 삭제하시겠습니까?`, cancelText:'취소', confirmText:'삭제', onConfirm: doDel });
        else doDel();
        return;
      }
      /* 내 정보 입사 서류 — 다운로드 (도메인 표준 App.downloadFile) */
      const myDlBtn = e.target.closest('[data-myinfo-doc-dl]');
      if (myDlBtn) {
        const baseName = myDlBtn.dataset.myinfoDocName || '입사서류';
        const fileName = myDlBtn.dataset.myinfoDocSigned === '1' ? `${baseName}_서명본.pdf` : `${baseName}.pdf`;
        if (App.downloadFile) App.downloadFile(fileName, { context: baseName });
        else window.toast && window.toast('다운로드 모듈을 불러올 수 없습니다.', 'warning');
        return;
      }
      /* 내 정보 입사 서류 — 서명 (본문 확인 + 동의 모달) */
      const mySignBtn = e.target.closest('[data-myinfo-doc-sign]');
      if (mySignBtn) {
        openMyInfoSignModal(mySignBtn.dataset.myinfoDocSign, mySignBtn.dataset.myinfoDocName);
        return;
      }
      /* 계약서 미리보기 — 인사 정보 탭의 근로/임금 계약(서명완료) [미리보기] */
      const ctrPreviewBtn = e.target.closest('[data-empi-contract-preview]');
      if (ctrPreviewBtn) {
        const emp = CARD_STATE.emp; if (!emp) return;
        openDocPreviewModal(emp, 'contract', ctrPreviewBtn.dataset.empiContractPreview);
        return;
      }
      /* 계약 이력 취소 — 서명 대기(signing) 계약만 취소 가능. 행 미리보기보다 먼저 처리. */
      const ctrCancelBtn = e.target.closest('[data-empi-ctrhist-cancel]');
      if (ctrCancelBtn) {
        e.stopPropagation();
        const emp = CARD_STATE.emp; if (!emp) return;
        const id = ctrCancelBtn.dataset.empiCtrhistCancel;
        const doCancel = () => {
          const ok = (window.App && App.HRContract && typeof App.HRContract.cancelSigning === 'function')
            ? App.HRContract.cancelSigning(emp.id, id) : false;
          if (ok) {
            renderCardBody();
            window.App && App.flashToast && App.flashToast(`서명 요청이 취소되었습니다 — ${id}`, 'success');
          } else {
            window.App && App.flashToast && App.flashToast('취소할 수 없는 계약입니다.', 'danger');
          }
        };
        if (window.sweet) {
          window.sweet({
            icon: 'confirm', title: '서명 요청 취소',
            text: `${id} 서명 대기 계약을 취소하시겠습니까?\n취소 후에는 새 계약서를 다시 작성해야 합니다.`,
            cancelText: '닫기', confirmText: '취소',
            onConfirm: doCancel,
          });
        } else {
          doCancel();
        }
        return;
      }
      /* 계약 이력 미리보기 — 계약 정보 > 계약 이력 행의 [미리보기] (App.HRContract 의 서명 완료본) */
      const ctrHistBtn = e.target.closest('[data-empi-ctrhist-preview]');
      if (ctrHistBtn) {
        const emp = CARD_STATE.emp; if (!emp) return;
        const list = (window.App && App.HRContract && App.HRContract.historyRowsByEmp)
          ? App.HRContract.historyRowsByEmp(emp.id)
          : ((window.App && App.HRContract && App.HRContract.historyByEmp) ? App.HRContract.historyByEmp(emp.id) : []);
        const item = list.find(x => x.id === ctrHistBtn.dataset.empiCtrhistPreview);
        if (item) {
          injectDocPreviewModal();
          const t = document.getElementById('empi-doc-preview-title');
          const b = document.getElementById('empi-doc-preview-body');
          if (t) t.textContent = `${item.kind} — ${displayName(emp)} (${item.id})`;
          if (b) b.innerHTML = item.previewHTML;
          openModal('modal-empi-doc-preview');
        }
        return;
      }
      /* 입사 서류 미리보기 — 입사 서류 탭의 서명완료 행 [미리보기] */
      const docPreviewBtn = e.target.closest('[data-empi-doc-preview]');
      if (docPreviewBtn) {
        const emp = CARD_STATE.emp; if (!emp) return;
        const [type, key] = docPreviewBtn.dataset.empiDocPreview.split(':');
        openDocPreviewModal(emp, type || 'doc', key, {
          name: docPreviewBtn.dataset.empiDocName || '',
          signed: docPreviewBtn.dataset.empiDocSigned === '1',
        });
        return;
      }

      /* 섹션 액션 버튼:
       *   · employment/belonging (근무·계약 정보 탭) → 인사담당자 변경 승인 요청 (발령 결재)
       *   · basic/family/education/career/licenses/languages (인사 정보 탭) → 당사자 본인 정보 변경 승인 요청
       *   · 그 외 → 토스트 안내 */
      const actBtn = e.target.closest('[data-empi-card-section-act]');
      if (actBtn) {
        const act = actBtn.dataset.empiCardSectionAct;
        const sec = actBtn.dataset.empiCardSection;
        /* 변경 요청 — 내 정보(셀프서비스) 전용. 전자결재 승인 요청 모달(첨부 가능) 상신. */
        if (act === 'request') {
          openPersonalChangeRequest(sec, 'edit');
          return;
        }
        /* 공제 정보 신청(내 정보 셀프서비스) — 전자결재 상신 + 서류 첨부 → 인사담당자 적용 */
        if (act === 'apply' && (sec === 'dependents' || sec === 'payroll-tax')) {
          openDeductionRequest(sec);
          return;
        }
        /* 부양가족 정보 — 인사담당자 직접 적용(결재 없이 저장) */
        if ((act === 'edit' || act === 'add') && sec === 'dependents') {
          openCardSectionEdit('dependents');
          return;
        }
        /* 근무 정보 — 미등록이면 전체 편집(근무지/부서/직위/직책/직무), 등록완료면 근무지만 편집 */
        if ((act === 'edit' || act === 'add') && sec === 'worksite') {
          const emp = CARD_STATE.emp;
          /* 근로/임금 계약서 서명 대기 중에는 편집 차단 */
          if (contractSigningInProgress(emp)) {
            const m = '근로·임금 계약서 서명이 진행 중입니다. 서명 완료 후 근무 정보를 수정할 수 있습니다.';
            if (window.App && typeof App.sweetAlert === 'function') App.sweetAlert({ icon: 'info', title: '수정 불가', message: m });
            else window.toast && window.toast(m, 'warning');
            return;
          }
          openCardSectionEdit(hasWorkInfo(emp) ? 'worksite' : 'workinfo');
          return;
        }
        /* 소정근로시간 정보 — 근로 계약 정보 완료 후 등록/편집 가능 */
        if ((act === 'edit' || act === 'add') && sec === 'stdhours') {
          const emp = CARD_STATE.emp;
          if (emp && !isContractInfoComplete(emp)) {
            const m = '근로 계약 정보 작성 완료 후 소정근로시간을 입력할 수 있습니다.';
            if (window.App && typeof App.sweetAlert === 'function') App.sweetAlert({ icon: 'info', title: '근로 계약 정보 필요', message: m });
            else window.alert(m);
            return;
          }
          openCardSectionEdit('stdhours');
          return;
        }
        if ((act === 'edit' || act === 'add') && (sec === 'employment' || sec === 'wage' || sec === 'belonging')) {
          const emp = CARD_STATE.emp;
          /* 근로 계약은 근무 정보(근무지·부서·직위·직책·직무)가 등록되어야 진입 가능 */
          if (sec === 'employment' && emp && !(emp.dept && emp.rank && emp.position && emp.job && emp.site)) {
            const m = '근무 정보(근무지·부서·직위·직책·직무) 작성 완료 후 근로 계약 정보를 입력할 수 있습니다.';
            if (window.App && typeof App.sweetAlert === 'function') App.sweetAlert({ icon: 'info', title: '근무 정보 필요', message: m });
            else window.alert(m);
            return;
          }
          /* 임금 계약은 근로 계약 정보 작성완료 + 근로 계약 이력(실제 근로계약서) 존재 시 진입 가능 — 우회 클릭 방어 가드. */
          if (sec === 'wage' && emp && !isContractInfoComplete(emp)) {
            if (window.App && typeof App.sweetAlert === 'function') {
              App.sweetAlert({
                icon: 'info',
                title: '근로 계약 정보 필요',
                message: '근로 계약 정보 작성 완료 후 임금 계약 정보를 입력할 수 있습니다.',
              });
            } else {
              window.alert('근로 계약 정보 작성 완료 후 임금 계약 정보를 입력할 수 있습니다.');
            }
            return;
          }
          /* 정책 — 임금 계약은 금일 기준 유효한 근로 계약서가 있어야 진입 가능 (우회 클릭 방어). */
          if (sec === 'wage' && emp && !hasValidLaborContract(emp)) {
            const m = '금일 기준 유효한 근로 계약서가 있어야 임금 계약을 작성할 수 있습니다. 근로계약서 서명·유효기간을 먼저 확인해 주세요.';
            if (window.App && typeof App.sweetAlert === 'function') App.sweetAlert({ icon: 'info', title: '유효한 근로 계약서 필요', message: m });
            else window.alert(m);
            return;
          }
          if (sec === 'wage' && emp && !hasStandardHours(emp)) {
            const m = '소정근로시간을 먼저 등록해 주세요. 소정근로시간 정보가 등록된 후 임금 계약 정보를 입력할 수 있습니다.';
            if (window.App && typeof App.sweetAlert === 'function') App.sweetAlert({ icon: 'info', title: '소정근로시간 필요', message: m });
            else window.alert(m);
            return;
          }
          /* 결재 대기 중에는 추가 편집을 막고 안내 alert 노출.
           *   결재 완료(승인/반려)되면 pending flag 가 해제되어 정상 진입. */
          const pendingFlag = sec === 'employment' ? 'contractApprovalPending'
                            : sec === 'wage'       ? 'wageApprovalPending'
                            : null;
          if (pendingFlag && emp && emp[pendingFlag]) {
            if (window.App && typeof App.sweetAlert === 'function') {
              App.sweetAlert({
                icon: 'info',
                title: '결재 진행 중',
                message: '승인이 결정나야 진행할 수 있습니다.',
              });
            } else {
              window.alert('승인이 결정나야 진행할 수 있습니다.');
            }
            return;
          }
          openCardSectionEdit(sec);
          return;
        }
        /* 기본 정보 탭 편집 — 인사담당자는 결재 없이 직접 편집, 당사자(본인)는 변경 승인 요청.
         *   · basic            → 신상 정보 직접 편집 모달
         *   · 표 섹션(학력/경력/자격/어학/가족/장애/신체/병역) → 행 CRUD 모달 */
        const TABLE_SECS = ['education','career','licenses','languages','family','disability','bodyInfo','military'];
        if (act === 'edit' || act === 'add') {
          if (canEditEmployment()) {
            if (sec === 'basic')                   { openCardSectionEdit('basic'); return; }
            if (TABLE_SECS.indexOf(sec) >= 0)      { openPersonalTableEdit(sec);   return; }
          }
          if (sec === 'basic' || TABLE_SECS.indexOf(sec) >= 0) {
            openPersonalChangeRequest(sec, act);
            return;
          }
        }
        /* 세금/원천징수 정보 — 직접 편집(결재 없이 저장). 기본값 없음, 추가/편집 모두 동일 모달. */
        if ((act === 'edit' || act === 'add') && sec === 'payroll-tax') {
          openPayrollTaxEdit();
          return;
        }
        /* 지급 정보(지급 계좌) — 인사담당자 직접 편집. 지급일은 임금 계약 관할이라 제외. */
        if (act === 'edit' && sec === 'payroll-pay' && canEditEmployment()) {
          openCardSectionEdit('payroll-pay');
          return;
        }
        const label = ({ edit:'편집', add:'추가', log:'이력' })[act] || act;
        window.toast && window.toast(`${label} 기능은 후속 단계에서 제공됩니다 (섹션: ${sec || '-'}).`, 'info');
        return;
      }
  }

  /* 당사자(본인) 인사 정보 변경 요청 — 인사담당자에게 결재 상신.
   *   섹션·액션 별로 모달 제목/사유 옵션을 약간 다르게 prefill. 본문은 사용자가 직접 작성. */
  function openPersonalChangeRequest(sec, act) {
    const emp = CARD_STATE.emp;
    if (!emp) return;
    if (!(window.App && typeof App.openSystemApprovalModal === 'function')) {
      window.toast && window.toast('결재 모듈이 준비되지 않았습니다.', 'warning');
      return;
    }
    const SEC_LABEL = {
      basic: '신상 정보', family: '가족 사항', education: '학력 사항',
      career: '경력 사항', licenses: '자격 면허', languages: '어학 능력',
      disability: '장애 여부', bodyInfo: '신체 정보', military: '병역 정보',
      /* 내 정보 섹션 단위 변경 요청 (전자결재) — 섹션 키 라벨 */
      'edu-career': '학력·경력', qualifications: '자격·역량',
      personal: '개인 정보', 'payroll-pay': '지급 계좌',
    };
    const secLabel = SEC_LABEL[sec] || sec;
    const actLabel = act === 'add' ? '추가' : '변경';
    const content = [
      `· 대상자: ${displayName(emp)} (${emp.id}, ${emp.dept || '-'})`,
      `· 요청 구분: 본인 ${secLabel} ${actLabel}`,
      '',
      '[요청 내용]',
      `※ 본문에 ${secLabel} ${actLabel} 사항을 상세히 작성해 주세요.`,
    ].join('\n');
    App.openSystemApprovalModal({
      docName: '본인 정보 변경',
      titlePrefix: `본인 ${secLabel} ${actLabel}`,
      codeLabel: '요청 구분',
      nameLabel: '대상자',
      matCode: `${secLabel} ${actLabel}`,
      matName: `${displayName(emp)} (${emp.id})`,
      customReasons: ['본인 정보 수정', '정보 정정', '신규 등록', '기타'],
      defaultReason: '본인 정보 수정',
      defaultApprovers: [],
      title: `본인 ${secLabel} ${actLabel} 요청 — ${displayName(emp)}`,
      content,
      attachments: [],
      payload: { empId: emp.id, section: sec, action: act },
      onSubmit() {
        window.toast && window.toast(`${secLabel} ${actLabel} 요청이 접수되었습니다.`, 'success');
      },
    });
  }

  /* ===== 인사정보카드 — 고용/소속 정보 섹션 편집 모달 =====
   *   modal-empi-card-edit : 단일 모달, 섹션 키(employment/belonging) 에 따라
   *   필드 구성이 달라진다. 저장 시 CARD_STATE.emp 를 in-place 갱신 후
   *   renderCardBody() 로 카드 모달 본문을 다시 그린다.
   *   - 고용 정보  : 근로 유형 / (계약직 세부 / 정규직 수습 / 도급 소속회사) / 사원 유형 / 근무지
   *   - 소속 정보  : 직무 / 직위 / 부서 / 직책
   *   재직 상태(휴직/퇴직)는 퇴직 처리 등 별도 결재 흐름이라 본 모달에서 제외. */
  function injectCardEditModal() {
    if (document.getElementById('modal-empi-card-edit')) return;
    const html = `
<div class="modal-backdrop" id="modal-empi-card-edit" data-modal-id="empi-card-edit" style="z-index:1150;">
  <div class="modal modal--lg">
    <div class="modal__header">
      <div class="modal__title" data-empi-cedit-title>정보 편집</div>
      <button class="modal__close" data-modal-close type="button" aria-label="닫기">✕</button>
    </div>
    <div class="modal__body" style="background:var(--color-surface-alt);padding:18px 20px;" data-empi-cedit-body></div>
    <div class="modal__footer">
      <button class="btn" type="button" data-modal-close>취소</button>
      <button class="btn btn--primary" type="button" data-empi-cedit-save>완료</button>
    </div>
  </div>
</div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
  }

  /* 섹션 편집 본문 — 근로 계약 정보 설정
   *   필수 정보  : 계약기간 / 근로 유형 / 사원 유형 / 직무 / 근무지
   *   상세 정보  : 근무형태 / 소정 근로시간 / 근무일·시간 / 휴게시간 / 휴일 / 연차유급휴가
   *               (정규직·계약직·일용직 선택 시에만 노출. 도급·파견은 외부 인력이라 N/A) */
  function renderCardEditEmployment(emp) {
    const sites = MASTER.sites.filter(s => s);
    const siteOptions = '<option value="">선택</option>' +
      sites.map(s => `<option value="${esc(s)}" ${emp.site === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
    /* 부서 — 근로 계약 정보에서 지정. 선택 시 부서 정책(근무형태/근무조)이 즉시 반영된다. */
    const deptOptions = '<option value="">선택</option>' +
      (MASTER.depts || []).filter(d => d).map(d => `<option value="${esc(d)}" ${emp.dept === d ? 'selected' : ''}>${esc(d)}</option>`).join('');
    const companyOptions = '<option value="">선택</option>' +
      MASTER.contractCompanies.map(c => `<option value="${esc(c)}" ${emp.contractCompany === c ? 'selected' : ''}>${esc(c)}</option>`).join('');
    const jobOptions = '<option value="">선택</option>' +
      MASTER.jobs.filter(j => j).map(j => `<option value="${esc(j)}" ${emp.job === j ? 'selected' : ''}>${esc(j)}</option>`).join('');
    /* 근로 유형 — 도급직은 임직원 등록 단계의 「도급직 여부」에서 지정하므로 근로 계약 설정에서는 제외.
       (도급직은 근로/임금 계약 자체가 없어 이 폼에 진입하지 않는다.) */
    const empTypes = [
      ['regular', '정규직'], ['contract', '계약직'], ['daily', '일용직'],
    ];
    const jobCats = [['office','사무직'], ['production','생산직'], ['research','연구직']];
    const radio = (name, value, label, checked) =>
      `<label class="cb"><input type="radio" name="${name}" value="${esc(value)}" ${checked ? 'checked' : ''} /> ${esc(label)}</label>`;
    const checkbox = (name, value, label, checked) =>
      `<label class="cb"><input type="checkbox" name="${name}" value="${esc(value)}" ${checked ? 'checked' : ''} /> ${esc(label)}</label>`;

    const isContract = emp.empType === 'contract';
    const isOutsourced = emp.empType === 'outsourced';
    const isRegular = emp.empType === 'regular';
    const csubGeneralChecked = !emp.contractSubType;
    const showDetail = ['regular','contract','daily'].indexOf(emp.empType) >= 0;
    /* 근로 유형 잠금 조건 —
       (1) 계약 관리 개별 작성(계약서 종류 선택으로 근로 유형이 이미 결정됨), 또는
       (2) 실제 근로계약서 이력이 1건 이상 존재하는 경우(최초 계약서 작성 때만 근로 유형 선택 가능).
       ※ hasLaborContractHistory 는 flag(contractLabor 등) 폴백이 있어 이력이 0건이어도 true 가 될 수 있으므로,
         잠금 판정은 반드시 '실제 근로계약서 이력 행 수' 로만 한다.
       잠금 시 근로 유형은 고정되고 계약 기간만 수정할 수 있다. */
    const laborHistCount = (window.App && App.HRContract && typeof App.HRContract.historyRowsByEmp === 'function')
      ? (App.HRContract.historyRowsByEmp(emp.id) || []).filter(it => it.kind === '근로계약서').length
      : 0;
    const lockType = !!CARD_STATE.contractEditLockType || laborHistCount > 0;
    const typeDis = lockType ? ' disabled' : '';
    const lockMsg = CARD_STATE.contractEditLockType
      ? '계약서 종류 선택에 따라 근로 유형은 변경할 수 없습니다.'
      : '이미 근로계약서가 있어 근로 유형은 변경할 수 없습니다. 계약 기간만 수정할 수 있습니다.';

    /* 근무 패턴 기본값 — 신규 입력 시 정책상 권장값.
       workSchedule 2 종: 'fixed' = 고정, 'shift' = 교대.
       '스케줄 근무' 은 두 모드의 상위 카테고리 라벨 (별도 모드 아님).
       legacy 데이터 마이그레이션:
         · workSchedule='schedule' + scheduleType='shift' → 'shift'
         · workSchedule='schedule' (그 외) → 'fixed' (기본값) */
    let workSchedule = emp.workSchedule || 'fixed';
    if (workSchedule === 'schedule') workSchedule = emp.scheduleType === 'shift' ? 'shift' : 'fixed';
    /* 부서별 근무정책 — 근무형태(통상/교대)는 부서 정책이 단독 결정한다(사용자 선택 없음, 읽기 전용 표시).
       근무조는 부서에 연결된 근무조로 채운다. 미설정 부서는 전사 기본 근무조로 대체(deptShiftCodes). */
    const wpPolicy = (window.App && App.AttWorkPolicy && App.AttWorkPolicy.deptPolicy)
      ? App.AttWorkPolicy.deptPolicy(emp.dept) : { regular: true, shift: false, codes: [] };
    /* 근무형태 = 부서 정책. 부서 미선택이면 통상 기본. */
    if (emp.dept) workSchedule = wpPolicy.shift ? 'shift' : 'fixed';
    const isFixed = workSchedule === 'fixed';
    const isShift = workSchedule === 'shift';
    /* 소정 근로시간 / 근무일 / 휴일 / 연차 — 모두 read-only 고정값.
       법정 기준 (1일 8시간, 1주 40시간, 월 209시간, 월~금 근무, 토일 휴일) 을 모든 사원에 적용. */
    let workStart   = emp.workTimeStart || '';
    let workEnd     = emp.workTimeEnd   || '';
    let breakStart  = emp.breakStart    || '';
    let breakEnd    = emp.breakEnd      || '';
    let breakStart2 = emp.breakStart2   || '';
    let breakEnd2   = emp.breakEnd2     || '';
    let shiftCode   = emp.shiftCode     || '';
    let shiftLabel  = emp.shiftLabel    || '';
    /* 부서에 연결된 근무조 목록(미설정이면 전사 기본으로 대체). 2개 이상이면 '근무조 선택' 버튼 노출. */
    const deptCodes = deptShiftCodes(emp.dept);
    const multiCode = deptCodes.length >= 2;
    /* 근무조 확정 — 미선택 or 현재 코드가 부서 허용 밖이면 부서 기본 근무조(없으면 첫 코드)로 채운다.
       "선택된 근무조 없음" 상태는 만들지 않는다(전사/부서 기본 근무조가 항상 존재). */
    if (!shiftCode || deptCodes.indexOf(shiftCode) < 0) {
      const dft = (window.App && App.AttWorkPolicy && App.AttWorkPolicy.deptDefaultShift)
        ? App.AttWorkPolicy.deptDefaultShift(emp.dept) : '';
      shiftCode = (dft && deptCodes.indexOf(dft) >= 0) ? dft : (deptCodes[0] || '');
      const s = shiftCode && window.App && App.AttShifts && App.AttShifts.get ? App.AttShifts.get(shiftCode) : null;
      if (s) {
        shiftLabel = s.label || (s.code + '조');
        if (isFixed) {
          workStart = s.start; workEnd = s.end;
          breakStart = s.breakStart || ''; breakEnd = s.breakEnd || '';
          breakStart2 = s.breakStart2 || ''; breakEnd2 = s.breakEnd2 || '';
        }
      } else {
        shiftLabel = '';
      }
    } else if (!shiftLabel && window.App && App.AttShifts && App.AttShifts.get) {
      const s = App.AttShifts.get(shiftCode);
      if (s) shiftLabel = s.label || (s.code + '조');
    }
    /* 휴게시간 표시 텍스트 — 휴게1 + (있을 시) 휴게2 */
    const breakDisplayText = (() => {
      const b1 = (breakStart && breakEnd) ? `${breakStart} ~ ${breakEnd}` : '';
      const b2 = (breakStart2 && breakEnd2) ? `, ${breakStart2} ~ ${breakEnd2}` : '';
      return b1 ? b1 + b2 : '-';
    })();
    /* 소정근로시간(1일/1주/월)은 「소정근로시간 정보」 섹션에서 별도 등록 — 본 모달에서 제외 */

    /* 정규직 + 종료일 미입력 = 무기 계약. 신규/기존 모두 default 체크.
     *   다른 근로유형은 아예 노출되지 않으므로 false 로 두면 됨. */
    const indefiniteChecked = isRegular && !emp.contractEndDate;

    /* 근로계약서 종류(서명 요청 정보 미리보기) 초기값
     *   · 정규직 + 수습 X            → 정규직 근로계약서
     *   · 정규직 + 수습 O / 계약직 / 일용직 → 기간제 근로계약서 */
    const initDocType = (isRegular && !emp.probation) ? '정규직 근로계약서' : '기간제 근로계약서';

    const reqMark = `<em style="color:var(--color-danger);font-style:normal;margin-right:2px;">*</em>`;
    const sectionDivider = (title, first) => `
      <div style="display:flex;align-items:center;gap:10px;margin:${first ? '0' : '20px 0 0'};padding:0 0 10px;">
        <span style="font-size:13px;font-weight:var(--fw-semibold);color:var(--color-text);letter-spacing:-0.2px;">${esc(title)}</span>
        <span style="flex:1;height:1px;background:var(--color-divider);"></span>
      </div>
    `;
    const scheduleNotice = (text) => `<span style="color:var(--color-text-muted);font-size:13px;">${esc(text)}</span>`;
    const cellPad = 'background:var(--color-surface);padding:6px 12px;';

    return `
      ${sectionDivider('필수 정보', true)}
      <div class="fm-tbl fm-tbl--compact">
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label">${reqMark}계약기간</div>
          <div class="fm-tbl__value" style="${cellPad}display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <input class="input" type="date" data-empi-ce-contract-start value="${esc(emp.contractStartDate || emp.joinDate || '')}" style="width:160px;" />
            <span style="color:var(--color-text-muted);">~</span>
            <input class="input" type="date" data-empi-ce-contract-end value="${esc(isRegular ? '' : (emp.contractEndDate || ''))}" style="width:160px;display:${isRegular ? 'none' : ''};" />
            <span data-empi-ce-indef-text style="display:${isRegular ? 'inline' : 'none'};color:var(--color-text);">기간의 정함 없음</span>
            <!-- 정규직 = 기간의 정함 없음(무기) 자동. 저장/검증 호환용 hidden flag -->
            <input type="checkbox" data-empi-ce-indefinite ${isRegular ? 'checked' : ''} hidden />
            <div class="field-error" data-empi-ce-err="period" hidden style="width:100%;"></div>
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label">${reqMark}근로 유형</div>
          <div class="fm-tbl__value" style="${cellPad}gap:14px;flex-wrap:wrap;min-height:44px;align-items:center;">
            ${empTypes.map(([v,l]) => `<label class="cb"><input type="radio" name="empi-ce-emptype" value="${esc(v)}" ${emp.empType === v ? 'checked' : ''}${typeDis} /> ${esc(l)}</label>`).join('')}
            <span data-empi-ce-csubtype-wrap style="display:${isContract ? 'inline-flex' : 'none'};padding-left:14px;border-left:1px solid var(--color-divider);gap:14px;align-items:center;">
              <label class="cb"><input type="radio" name="empi-ce-csubtype" value="" ${csubGeneralChecked ? 'checked' : ''}${typeDis} /> 일반</label>
              <label class="cb"><input type="radio" name="empi-ce-csubtype" value="chotak" ${emp.contractSubType === 'chotak' ? 'checked' : ''}${typeDis} /> 촉탁</label>
              <label class="cb"><input type="radio" name="empi-ce-csubtype" value="intern" ${emp.contractSubType === 'intern' ? 'checked' : ''}${typeDis} /> 인턴</label>
            </span>
            <span data-empi-ce-probation-wrap style="display:${isRegular ? 'inline-flex' : 'none'};padding-left:14px;border-left:1px solid var(--color-divider);gap:8px;align-items:center;">
              <label class="cb"><input type="checkbox" data-empi-ce-probation ${emp.probation ? 'checked' : ''}${typeDis} /> 수습</label>
              <span data-empi-ce-probation-period style="display:${emp.probation ? 'inline-flex' : 'none'};gap:6px;align-items:center;">
                <input class="input" type="date" data-empi-ce-probation-start value="${esc(emp.probationStart || emp.joinDate || '')}" style="width:140px;background:var(--color-surface-alt);" readonly title="수습 시작일은 입사일로 자동 설정" />
                <span style="color:var(--color-text-muted);">~</span>
                <input class="input" type="date" data-empi-ce-probation-end value="${esc(emp.probationEnd || '')}" style="width:140px;" />
              </span>
            </span>
            <div class="field-error" data-empi-ce-err="emptype" hidden style="width:100%;"></div>
            <div class="field-error" data-empi-ce-err="probend" hidden style="width:100%;"></div>
            ${lockType ? `<span style="width:100%;font-size:12px;color:var(--color-text-muted);">${lockMsg}</span>` : ''}
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" data-empi-ce-company-row style="display:${isOutsourced ? '' : 'none'};">
          <div class="fm-tbl__label">${reqMark}도급 회사</div>
          <div class="fm-tbl__value" style="${cellPad}">
            <select class="select" data-empi-ce-contract-company style="width:100%;">${companyOptions}</select>
            <div class="field-error" data-empi-ce-err="company" hidden style="width:100%;"></div>
          </div>
        </div>
        <!-- 사원 유형(사무/생산/연구) 은 「근무 정보」 섹션에서 관리 — 근로 계약 정보 모달에서 제외.
             부서·직무·근무지도 「근무 정보」 섹션에서 관리 — 근로 계약 정보 모달에서 제외.
             근무조/근무시간은 저장된 emp.dept 기준으로 자동 파생된다. -->
      </div>

      <!-- 소정근로시간은 별도 「소정근로시간 정보」 섹션에서 등록 (근로 계약 정보에서 분리).
           상세 정보(근무형태·근무조·근무시간·휴게시간·근무일·휴일·연차)는 UI 에서 제거.
           근무형태/근무조/근무시간/휴게시간은 부서 근무정책에서 자동 파생되어 값만 보존한다(hidden). -->
      <div data-empi-ce-detail-wrap hidden aria-hidden="true">
        <input type="hidden" data-empi-ce-worksch value="${esc(workSchedule)}" />
        <input type="hidden" data-empi-ce-shift-code value="${esc(shiftCode)}" />
        <input type="hidden" data-empi-ce-shift-label value="${esc(shiftLabel)}" />
        <input type="hidden" data-empi-ce-work-start value="${esc(workStart)}" />
        <input type="hidden" data-empi-ce-work-end value="${esc(workEnd)}" />
        <input type="hidden" data-empi-ce-break-start  value="${esc(breakStart)}" />
        <input type="hidden" data-empi-ce-break-end    value="${esc(breakEnd)}" />
        <input type="hidden" data-empi-ce-break-start2 value="${esc(breakStart2)}" />
        <input type="hidden" data-empi-ce-break-end2   value="${esc(breakEnd2)}" />
        <div class="field-error" data-empi-ce-err="shift" hidden></div>
      </div>

      <div data-empi-ce-sign-wrap style="display:${['regular','contract','daily'].indexOf(emp.empType) >= 0 ? '' : 'none'};">
        ${sectionDivider('서명 요청 정보', false)}
        <div class="fm-tbl fm-tbl--compact">
          <div class="fm-tbl__row fm-tbl__row--1">
            <div class="fm-tbl__label" style="white-space:nowrap;">근로계약서 종류</div>
            <div class="fm-tbl__value" style="${cellPad}min-height:44px;flex-direction:column;align-items:flex-start;justify-content:center;gap:3px;">
              <span data-empi-ce-doctype-pill style="font-weight:var(--fw-semibold);color:var(--color-text);">${initDocType}</span>
              <span style="font-size:12px;color:var(--color-text-muted);" data-empi-ce-doctype-hint>서명 요청 발송 시 이 종류의 근로계약서로 생성됩니다.</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* 섹션 편집 본문 — 임금 계약 정보 설정
   *   필수 정보: 계약기간 / 소득 유형 / 임금 유형 / 계약 금액
   *   유형별 추가:
   *     · 연봉제/월급제 → 임금 계약 유형 / 지급 항목 (기본급, 시간외/포괄수당) / 월 고정 지급 기준 / 공제 안내
   *     · 일급제 → 근로시간 정보 (1일) / 환산 시급 / 기타 안내
   *     · 시급제 → 근로시간 정보 (1일·1주) / 기타 안내
   *   공통: 임금 지급일(기본 10, 설정 안내) / 임금 지급방법(계좌이체 고정) */
  function renderCardEditWage(emp) {
    const radio = (name, value, label, checked) =>
      `<label class="cb"><input type="radio" name="${name}" value="${esc(value)}" ${checked ? 'checked' : ''} /> ${esc(label)}</label>`;

    /* 기본값 — 신규 입력 시 권장값. 기존 값이 있으면 그대로 사용. */
    const startDate = emp.wageContractStartDate || emp.contractStartDate || emp.joinDate || '';
    const endDate   = emp.wageContractEndDate   || emp.contractEndDate   || '';
    const incomeType = emp.incomeType || 'earned';
    /* 임금 유형 — 사원 유형이 결정한다: 일용직 → 시급제 / 정규·계약직 → 연봉제.
       (월급제는 제거. legacy monthly 데이터는 연봉제로 마이그레이션) */
    const isDailyEmp = emp.empType === 'daily';
    let wageType     = emp.wageType || (isDailyEmp ? 'hourly' : 'annual');
    if (wageType === 'monthly') wageType = 'annual';
    if (isDailyEmp && wageType !== 'hourly') wageType = 'hourly';
    if (!isDailyEmp && wageType === 'hourly') wageType = 'annual';
    const isAnnual   = wageType === 'annual';
    const isMonthly  = false;   /* 월급제 제거 — 항상 false (하위 분기 호환용) */
    const isHourly   = wageType === 'hourly';
    const isAM       = isAnnual;   /* '연봉/월급' 그룹 = 연봉제만 */
    /* 기간의 정함 없음 — 시작일만 있고 종료일이 없으면 무기 계약으로 간주 (명시 플래그 우선) */
    const wageIndefinite = emp.wageIndefinite != null
      ? !!emp.wageIndefinite
      : (!!emp.wageContractStartDate && !emp.wageContractEndDate && emp.wageType === 'annual');
    /* 임금 계약 유형 — '일반' 제거 → 기본값 고정 OT. legacy general 은 고정 OT 로 마이그레이션 */
    let wageKind     = emp.wageContractKind || 'fixedOT';
    if (wageKind === 'general') wageKind = 'fixedOT';
    /* 시급제 — 기본 시급(hourlyWage). 계약 금액 = 시급 + 주휴수당(시급 20% 절사). */
    const HOLIDAY = (h) => Math.floor((Number(h) || 0) * 0.2);
    const hourlyWage = emp.hourlyWage != null && emp.hourlyWage !== '' ? emp.hourlyWage
                     : (isHourly && emp.contractAmount ? Math.round(Number(emp.contractAmount) / 1.2) : '');
    /* 계약 금액 입력칸 값 — 연봉제는 계약금액(연봉), 시급제는 기본 시급 */
    const amountFieldVal = isHourly ? hourlyWage : (emp.contractAmount || '');
    const fixedOTHours    = emp.fixedOTHours    || '';
    const fixedOTRate     = emp.fixedOTRate != null && emp.fixedOTRate !== '' ? Number(emp.fixedOTRate) : 1.5;
    /* 고정 OT 7종 카테고리별 기준시간 — { 카테고리키: 시간 } 맵 */
    const fixedOTDetail   = (emp.fixedOTHoursDetail && typeof emp.fixedOTHoursDetail === 'object') ? emp.fixedOTHoursDetail : {};
    const inclusiveHours  = emp.inclusiveHours  || '';
    const contractAmount  = emp.contractAmount  || '';
    const baseSalary      = emp.baseSalary      || '';
    const fixedOTAmount   = emp.fixedOTAmount   || '';
    const inclusiveOT     = emp.inclusiveOTAmount || '';
    /* 마스터에서 가져온 추가 지급 항목 — [{code, name, amount, taxType, ordinaryWage}] */
    const additionalPayItems = Array.isArray(emp.additionalPayItems) ? emp.additionalPayItems : [];
    const deductionPolicy = emp.deductionPolicy || '근로기준법 및 취업규칙에 따름';
    const payDay     = emp.payDay    != null && emp.payDay !== '' ? emp.payDay : 10;
    const payMethod  = emp.payMethod || '계좌이체';
    const hoursPerDay  = emp.hoursPerDay  || '';
    const hoursPerWeek = emp.hoursPerWeek || '';
    /* 소정근로시간 — 임금 계약 모달에 포함. 기본 1일 8 / 1주 40 / 월 209, 수정 가능. */
    const stdDay   = emp.hoursPerDay   != null && emp.hoursPerDay   !== '' ? emp.hoursPerDay   : 8;
    const stdWeek  = emp.hoursPerWeek  != null && emp.hoursPerWeek  !== '' ? emp.hoursPerWeek  : 40;
    const stdMonth = emp.hoursPerMonth != null && emp.hoursPerMonth !== '' ? emp.hoursPerMonth : 209;

    const reqMark = `<em style="color:var(--color-danger);font-style:normal;margin-right:2px;">*</em>`;
    const sectionDivider = (title, first) => `
      <div style="display:flex;align-items:center;gap:10px;margin:${first ? '0' : '20px 0 0'};padding:0 0 10px;">
        <span style="font-size:13px;font-weight:var(--fw-semibold);color:var(--color-text);letter-spacing:-0.2px;">${esc(title)}</span>
        <span style="flex:1;height:1px;background:var(--color-divider);"></span>
      </div>
    `;
    const cellPad = 'background:var(--color-surface);padding:6px 12px;';
    const helpHTML = (text) => `<div style="margin-top:6px;color:var(--color-text-muted);font-size:12px;line-height:1.5;">${esc(text)}</div>`;

    /* 월 지급 기준 — 미리보기 (계약 금액 변경 시 JS 가 갱신) */
    const previewMonthly = (() => {
      const n = Number(contractAmount || 0);
      if (!n) return '';
      if (isAnnual)  return `${formatMoney(Math.round(n/12))}원/월`;
      if (isMonthly) return `${formatMoney(n)}원/월`;
      return '';
    })();

    return `
      ${sectionDivider('필수 정보', true)}
      <div class="fm-tbl fm-tbl--compact">
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label">${reqMark}계약기간</div>
          <div class="fm-tbl__value" style="${cellPad}display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <input class="input" type="date" data-empi-cw-start value="${esc(startDate)}" style="width:160px;" />
            <span style="color:var(--color-text-muted);">~</span>
            <input class="input" type="date" data-empi-cw-end value="${esc(wageIndefinite ? '' : endDate)}" style="width:160px;${wageIndefinite ? 'background:var(--color-surface-alt);' : ''}" ${wageIndefinite ? 'disabled' : ''} />
            <label class="cb" style="margin-left:4px;">
              <input type="checkbox" data-empi-cw-indefinite ${wageIndefinite ? 'checked' : ''} /> 기간의 정함 없음
            </label>
            <div class="field-error" data-empi-cw-err="period" hidden style="width:100%;"></div>
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label">${reqMark}임금 유형</div>
          <div class="fm-tbl__value" style="${cellPad}gap:14px;flex-wrap:wrap;min-height:44px;align-items:center;">
            ${WAGE_TYPES.map(([v,l]) => {
              const disabled = (v === 'hourly' && !isDailyEmp) || (v === 'annual' && isDailyEmp);
              return `<label class="cb"${disabled ? ' style="opacity:0.45;"' : ''}><input type="radio" name="empi-cw-wagetype" value="${esc(v)}" ${wageType === v ? 'checked' : ''}${disabled ? ' disabled' : ''} /> ${esc(l)}</label>`;
            }).join('')}
            <span style="font-size:11px;color:var(--color-text-muted);">${isDailyEmp ? '일용직은 시급제만 선택 가능' : '정규직·계약직은 연봉제만 선택 가능'}</span>
            <div class="field-error" data-empi-cw-err="wagetype" hidden style="width:100%;"></div>
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label">${reqMark}계약 금액</div>
          <div class="fm-tbl__value" style="${cellPad}gap:8px;flex-wrap:wrap;align-items:center;min-height:44px;">
            <span data-empi-cw-amount-prefix style="font-size:12px;color:var(--color-text-muted);min-width:32px;">${esc(WAGE_AMOUNT_PREFIX[wageType] || '')}</span>
            <input class="input" type="text" inputmode="numeric" data-empi-cw-amount value="${esc(formatMoney(amountFieldVal))}" style="width:200px;text-align:right;" placeholder="0" />
            <span style="font-size:12px;color:var(--color-text-muted);">원</span>
            <span data-empi-cw-amount-sep-hint hidden style="font-size:11px;color:var(--color-warning);padding:2px 8px;background:rgba(217,119,6,0.06);border-radius:10px;"></span>
            <span data-empi-cw-holiday-hint style="display:${isHourly ? 'inline-flex' : 'none'};align-items:center;gap:4px;flex-wrap:wrap;font-size:12px;color:var(--color-text-sub);">
              ＋주휴수당 20% <strong data-empi-cw-holiday-amt style="color:var(--color-text);">${esc(formatMoney(HOLIDAY(hourlyWage)))}</strong>원
              = 계약 시급 <strong data-empi-cw-holiday-total style="color:var(--color-brand-primary);">${esc(formatMoney((Number(hourlyWage) || 0) + HOLIDAY(hourlyWage)))}</strong>원
              <span style="color:var(--color-text-muted);">(원단위 절사)</span>
            </span>
            <div class="field-error" data-empi-cw-err="amount" hidden style="width:100%;"></div>
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label">${reqMark}소정 근로시간</div>
          <div class="fm-tbl__value" style="${cellPad}gap:12px;flex-wrap:wrap;align-items:center;min-height:44px;color:var(--color-text);">
            <span style="display:inline-flex;align-items:center;gap:5px;">1일 <input class="input" type="number" min="0" step="1" data-empi-cw-hours-day value="${esc(stdDay)}" style="width:60px;text-align:right;" />시간</span>
            <span style="display:inline-flex;align-items:center;gap:5px;">1주 <input class="input" type="number" min="0" step="1" data-empi-cw-hours-week value="${esc(stdWeek)}" style="width:60px;text-align:right;" />시간</span>
            <span style="display:inline-flex;align-items:center;gap:5px;">월 <input class="input" type="number" min="0" step="1" data-empi-cw-hours-month value="${esc(stdMonth)}" style="width:68px;text-align:right;" />시간</span>
            <div class="field-error" data-empi-cw-err="stdhours" hidden style="width:100%;"></div>
          </div>
        </div>
      </div>

      <!-- ===== 연봉제 / 월급제 ===== -->
      <div data-empi-cw-am-wrap style="display:${isAM ? '' : 'none'};">
        ${sectionDivider('임금 계약 유형', false)}
        <div class="fm-tbl fm-tbl--compact fm-tbl--wide-label">
          <div class="fm-tbl__row fm-tbl__row--1">
            <div class="fm-tbl__label">${reqMark}임금 계약 유형</div>
            <div class="fm-tbl__value" style="${cellPad}gap:8px;flex-direction:column;align-items:stretch;flex-wrap:nowrap;min-height:44px;">
              <div style="display:flex;flex-direction:column;gap:6px;">
                ${WAGE_KINDS.map(([v,l]) => `
                  <label class="cb" style="display:flex;align-items:flex-start;gap:8px;line-height:1.5;padding:2px 0;">
                    <input type="radio" name="empi-cw-kind" value="${esc(v)}" ${wageKind === v ? 'checked' : ''} style="margin-top:3px;flex-shrink:0;" />
                    <span style="display:flex;flex-direction:column;gap:1px;">
                      <span style="font-weight:var(--fw-medium);color:var(--color-text);">${esc(l)}</span>
                      <span style="font-size:11.5px;color:var(--color-text-muted);font-weight:var(--fw-regular);">${esc(WAGE_KIND_DESC[v] || '')}</span>
                    </span>
                  </label>
                  ${v === 'fixedOT' ? `
                  <div data-empi-cw-fot-wrap style="display:${wageKind === 'fixedOT' ? 'block' : 'none'};margin:2px 0 4px 26px;font-size:11.5px;color:var(--color-text-muted);">
                    아래 <strong>고정 OT 기준 시간</strong> 표에 근로 종류별 월 약정 시간을 입력하세요. 지급배율은 법정 가산율로 고정됩니다.
                  </div>` : ''}
                `).join('')}
              </div>
              <div class="field-error" data-empi-cw-err="kind" hidden style="width:100%;"></div>
            </div>
          </div>
        </div>

        ${wageHoursTableHTML('fixedOT', fixedOTDetail, wageKind === 'fixedOT')}
        ${wageHoursTableHTML('inclusive', emp.inclusiveOTHours, wageKind === 'inclusive')}

        <div data-empi-cw-payitems-wrap style="display:${contractAmount ? '' : 'none'};">
          ${sectionDivider('지급 항목', false)}
          <div class="fm-tbl fm-tbl--compact fm-tbl--wide-label">
            <div class="fm-tbl__row fm-tbl__row--1">
              <div class="fm-tbl__label">${reqMark}월 기본급</div>
              <div class="fm-tbl__value" style="${cellPad}gap:8px;align-items:center;flex-wrap:wrap;">
                <input class="input" type="text" inputmode="numeric" data-empi-cw-base data-auto-pay="1" value="${esc(baseSalary)}" style="width:200px;text-align:right;" placeholder="0" />
                <span style="font-size:12px;color:var(--color-text-muted);">원/월</span>
                <span data-empi-cw-base-tag style="font-size:11px;color:var(--color-text-muted);padding:2px 8px;border:1px solid var(--color-border);border-radius:10px;background:var(--color-surface-alt);">자동 산출</span>
                <div class="field-error" data-empi-cw-err="base" hidden style="width:100%;"></div>
              </div>
            </div>
            <div class="fm-tbl__row fm-tbl__row--1" data-empi-cw-fot-row style="display:${wageKind === 'fixedOT' ? '' : 'none'};">
              <div class="fm-tbl__label">월 고정연장근무수당</div>
              <div class="fm-tbl__value" style="${cellPad}gap:8px;align-items:center;flex-wrap:wrap;">
                <input class="input" type="text" inputmode="numeric" data-empi-cw-fot-amount data-auto-pay="1" value="${esc(fixedOTAmount)}" style="width:200px;text-align:right;" placeholder="0" />
                <span style="font-size:12px;color:var(--color-text-muted);">원/월</span>
                <span data-empi-cw-fot-amount-tag style="font-size:11px;color:var(--color-text-muted);padding:2px 8px;border:1px solid var(--color-border);border-radius:10px;background:var(--color-surface-alt);">자동 산출</span>
              </div>
            </div>
            <div class="fm-tbl__row fm-tbl__row--1" data-empi-cw-inc-row style="display:${wageKind === 'inclusive' ? '' : 'none'};">
              <div class="fm-tbl__label">월 고정연장근무수당</div>
              <div class="fm-tbl__value" style="${cellPad}gap:8px;align-items:center;flex-wrap:wrap;">
                <input class="input" type="text" inputmode="numeric" data-empi-cw-inc-amount data-auto-pay="1" value="${esc(inclusiveOT)}" style="width:200px;text-align:right;" placeholder="0" />
                <span style="font-size:12px;color:var(--color-text-muted);">원/월</span>
                <span data-empi-cw-inc-amount-tag style="font-size:11px;color:var(--color-text-muted);padding:2px 8px;border:1px solid var(--color-border);border-radius:10px;background:var(--color-surface-alt);">자동 산출</span>
              </div>
            </div>
            <!-- 마스터에서 추가된 지급 항목 — JS 가 renderAddedPayItems() 로 채움 -->
            <div data-empi-cw-extra-items></div>
          </div>
        </div>

        ${sectionDivider('월 고정 지급 기준', false)}
        <div style="padding:14px 16px;background:var(--color-surface-alt);border:1px solid var(--color-divider);border-radius:8px;">
          <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px;">
            <span style="font-size:12px;color:var(--color-text-muted);">월 지급 기준액</span>
            <strong data-empi-cw-monthly style="font-size:15px;color:var(--color-brand-primary);">${esc(previewMonthly || '-')}</strong>
          </div>
          <div data-empi-cw-monthly-help style="font-size:12px;color:var(--color-text-muted);line-height:1.6;">
            ${esc(isAnnual ? '계약 연봉을 12개월로 나누어 매월 지급합니다.' : (isMonthly ? '계약 월급을 매월 지급합니다.' : ''))}
          </div>
          <div data-empi-cw-fot-help style="display:${wageKind === 'fixedOT' ? 'block' : 'none'};margin-top:4px;font-size:12px;color:var(--color-text-muted);">
            · 고정 OT 기준시간에 해당하는 시간외수당이 포함됩니다.
          </div>
          <div data-empi-cw-inc-help style="display:${wageKind === 'inclusive' ? 'block' : 'none'};margin-top:4px;font-size:12px;color:var(--color-text-muted);">
            · 포괄근로계약시간에 해당하는 고정연장근무수당이 포함됩니다.
          </div>
        </div>

        <div style="margin-top:14px;">
          <div class="fm-tbl fm-tbl--compact">
            <div class="fm-tbl__row fm-tbl__row--1">
              <div class="fm-tbl__label">공제 안내</div>
              <div class="fm-tbl__value" style="${cellPad}">
                <input class="input" type="text" data-empi-cw-deduction value="${esc(deductionPolicy)}" style="width:100%;" placeholder="근로기준법 및 취업규칙에 따름" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 시급제 ===== (시급은 위 [계약 금액] 에 입력 — 소정근로시간/월환산 항목 제거) -->
      <div data-empi-cw-hourly-wrap style="display:none;"></div>

      ${sectionDivider('지급 정보', false)}
      <div class="fm-tbl fm-tbl--compact">
        <div class="fm-tbl__row fm-tbl__row--2">
          <div class="fm-tbl__label">임금 지급일</div>
          <div class="fm-tbl__value" style="${cellPad}gap:6px;align-items:center;color:var(--color-text);" title="지급일은 시스템 관리자만 변경할 수 있습니다.">
            <span>매월 ${esc(payDay)}일</span>
            <input type="hidden" data-empi-cw-payday value="${esc(payDay)}" />
          </div>
          <div class="fm-tbl__label">임금 지급방법</div>
          <div class="fm-tbl__value" style="${cellPad}">
            <select class="select" data-empi-cw-paymethod style="width:100%;" disabled title="설정에서 옵션을 관리할 수 있습니다.">
              <option value="계좌이체" selected>계좌이체</option>
            </select>
          </div>
        </div>
      </div>
    `;
  }

  /* 포괄임금 — 월 통상시급 (연봉제는 ÷12, 월급제는 그대로 / 월 소정근로시간 또는 209h 기본) */
  function computeBaseHourly(contractAmount, wageType, hoursPerMonth) {
    const amount = Number(contractAmount || 0);
    const hpm    = Number(hoursPerMonth || 209);
    if (!amount || !hpm) return 0;
    if (wageType === 'annual')  return amount / 12 / hpm;
    if (wageType === 'monthly') return amount / hpm;
    return 0;
  }
  /* 근로 종류별 기준시간 표 — 고정 OT / 포괄임금 공통 컴포넌트.
   *   구조·컬럼·동작은 동일하게 통일하고, 제목과 data-key 만 계약유형별로 분기한다.
   *   카테고리/배율: INCLUSIVE_OT_CATEGORIES (연장/야간/야간연장/휴일/휴일연장/휴일야간/휴일야간연장).
   *   가산시간 = 기준시간 × 지급배율(법정 가산율 고정). 합계 가산시간(W)이 통상시급 산식 분모에 반영된다. */
  const WAGE_HOURS_TABLE_CFG = {
    fixedOT: {
      title: '고정 OT 기준시간', wrapAttr: 'data-empi-cw-fot-table-wrap',
      hPrefix: 'data-empi-cw-foth', aPrefix: 'data-empi-cw-fota',
      hTotal: 'data-empi-cw-fot-htotal', wTotal: 'data-empi-cw-fot-wtotal',
    },
    inclusive: {
      title: '포괄근로계약시간', wrapAttr: 'data-empi-cw-inc-detail-row',
      hPrefix: 'data-empi-cw-inch', aPrefix: 'data-empi-cw-inca',
      hTotal: 'data-empi-cw-inc-hours-total', wTotal: 'data-empi-cw-inc-amount-total',
    },
  };
  function wageHoursTableHTML(kind, detailMap, show) {
    const cfg = WAGE_HOURS_TABLE_CFG[kind];
    if (!cfg) return '';
    const map = detailMap || {};
    const cols = 'grid-template-columns:1fr 140px 100px 140px;';
    const cellStyle = `display:grid;${cols}gap:8px;align-items:center;padding:8px 12px;`;
    const fmtHours = (n) => Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
    let totalH = 0, totalW = 0;
    const rowsHTML = INCLUSIVE_OT_CATEGORIES.map(c => {
      const h = Number(map[c.key] || 0);
      const w = h * c.rate;
      totalH += h; totalW += w;
      return `
        <div style="${cellStyle}border-bottom:1px solid var(--color-divider);">
          <div style="font-size:13px;">${esc(c.label.replace('수당', ''))}</div>
          <div style="text-align:right;">
            <input class="input" type="number" min="0" step="1" ${cfg.hPrefix}-${c.key}
                   value="${h ? esc(h) : ''}" placeholder="0" style="width:90px;text-align:right;" />
          </div>
          <div style="text-align:right;font-size:13px;color:var(--color-text-muted);">${c.rate.toFixed(1)}배</div>
          <div style="text-align:right;font-size:13px;" ${cfg.aPrefix}-${c.key}>${w ? fmtHours(w) + '시간' : '-'}</div>
        </div>`;
    }).join('');
    return `
      <div ${cfg.wrapAttr} style="display:${show ? '' : 'none'};margin-top:8px;">
        <div class="fm-tbl fm-tbl--compact fm-tbl--wide-label">
          <div class="fm-tbl__row fm-tbl__row--1">
            <div class="fm-tbl__label">${esc(cfg.title)}</div>
            <div class="fm-tbl__value" style="background:var(--color-surface);padding:0;flex-direction:column;align-items:stretch;gap:0;">
              <div style="${cellStyle}background:var(--color-surface-alt);border-bottom:1px solid var(--color-divider);font-size:12px;font-weight:var(--fw-medium);color:var(--color-text-muted);">
                <div>근로 종류</div>
                <div style="text-align:right;">기준 시간 (월)</div>
                <div style="text-align:right;">지급배율</div>
                <div style="text-align:right;display:inline-flex;align-items:center;justify-content:flex-end;gap:4px;">
                  가산시간
                  <span data-empi-cw-inca-info tabindex="0" role="button" aria-label="가산시간 설명"
                    style="position:relative;display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;border:1px solid var(--color-text-muted);color:var(--color-text-muted);font-size:9px;font-weight:var(--fw-bold);cursor:help;font-style:italic;line-height:1;">
                    i
                    <span data-empi-cw-inca-pop hidden
                      style="position:absolute;bottom:calc(100% + 8px);right:-8px;width:260px;padding:10px 12px;background:var(--color-text);color:#fff;font-size:11.5px;font-weight:var(--fw-regular);font-style:normal;line-height:1.55;text-align:left;border-radius:6px;box-shadow:0 6px 20px rgba(0,0,0,0.18);z-index:60;letter-spacing:0;">
                      <strong style="display:block;margin-bottom:3px;color:#fff;">가산시간 = 기준시간 × 지급배율</strong>
                      약정 시간외근로를 정상 근로시간으로 환산한 합계로, 통상시급 산정의 분모(소정근로시간)와 합쳐 기본급/시간외수당 비율을 정합니다.
                    </span>
                  </span>
                </div>
              </div>
              ${rowsHTML}
              <div style="${cellStyle}background:var(--color-surface-alt);font-weight:var(--fw-semibold);">
                <div>합계</div>
                <div style="text-align:right;"><span ${cfg.hTotal}>${fmtHours(totalH)}</span>시간</div>
                <div></div>
                <div style="text-align:right;"><span ${cfg.wTotal}>${fmtHours(totalW)}</span>시간</div>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  /* 임금 계약 정보 설정 — 임금 유형 변경 시 분기 + 임금 계약 유형 sub-input 동기화 + 미리보기 갱신 */
  function wireWageEditDeps(modal) {
    const $1 = (sel) => modal.querySelector(sel);
    const $$ = (sel) => modal.querySelectorAll(sel);
    const toggle = (el, on, mode) => { if (el) el.style.display = on ? (mode || '') : 'none'; };

    /* 시급제 — 주휴수당(시급 20% 절사) + 계약 시급(시급+주휴) 실시간 갱신 */
    const refreshHoliday = () => {
      const v = ($1('[name="empi-cw-wagetype"]:checked') || {}).value || '';
      const hint = $1('[data-empi-cw-holiday-hint]');
      if (hint) hint.style.display = (v === 'hourly') ? 'inline-flex' : 'none';
      if (v !== 'hourly') return;
      const base = Number(String(($1('[data-empi-cw-amount]') || {}).value || '').replace(/[^0-9]/g, '')) || 0;
      const holiday = Math.floor(base * 0.2);
      const amtEl = $1('[data-empi-cw-holiday-amt]');   if (amtEl) amtEl.textContent = formatMoney(holiday);
      const totEl = $1('[data-empi-cw-holiday-total]'); if (totEl) totEl.textContent = formatMoney(base + holiday);
    };

    /* 임금 유형 — 연봉제 → am-wrap, 시급제 → hourly-wrap + 주휴 계산 */
    const syncWageType = () => {
      const v = ($1('[name="empi-cw-wagetype"]:checked') || {}).value || '';
      const isAM = ['annual','monthly'].indexOf(v) >= 0;
      toggle($1('[data-empi-cw-am-wrap]'), isAM);
      toggle($1('[data-empi-cw-hourly-wrap]'), v === 'hourly');
      const prefix = $1('[data-empi-cw-amount-prefix]');
      if (prefix) prefix.textContent = WAGE_AMOUNT_PREFIX[v] || '';
      refreshHoliday();
      refreshPreview();
    };

    /* 임금 계약 유형 — 일반/고정OT/포괄 sub-input + 안내 + 상세표 노출 토글 */
    const syncWageKind = () => {
      const v = ($1('[name="empi-cw-kind"]:checked') || {}).value || '';
      toggle($1('[data-empi-cw-fot-wrap]'),  v === 'fixedOT', 'block');
      toggle($1('[data-empi-cw-fot-table-wrap]'), v === 'fixedOT');
      toggle($1('[data-empi-cw-inc-wrap]'),  v === 'inclusive', 'inline-flex');
      toggle($1('[data-empi-cw-fot-row]'),   v === 'fixedOT');
      toggle($1('[data-empi-cw-inc-row]'),   v === 'inclusive');
      toggle($1('[data-empi-cw-fot-help]'),  v === 'fixedOT', 'block');
      toggle($1('[data-empi-cw-inc-help]'),  v === 'inclusive', 'block');
      toggle($1('[data-empi-cw-inc-detail-row]'), v === 'inclusive');
      if (v === 'fixedOT')   refreshFixedOT();
      if (v === 'inclusive') refreshInclusive();
      /* 계약 유형 변경 → 가중시간 산정 기준이 바뀌므로 지급 항목 자동 산출 재실행 */
      if (typeof autoCalcPayItems === 'function') autoCalcPayItems();
    };

    /* 고정 OT 7종 표 — 카테고리별 가산시간(시간×배율) + 합계 갱신 */
    const computeFixedOTWeighted = () => {
      let w = 0;
      INCLUSIVE_OT_CATEGORIES.forEach(c => {
        const h = Number(($1(`[data-empi-cw-foth-${c.key}]`) || {}).value || 0);
        w += h * c.rate;
      });
      return w;
    };
    const refreshFixedOT = () => {
      let totalH = 0, totalW = 0;
      INCLUSIVE_OT_CATEGORIES.forEach(c => {
        const inp  = $1(`[data-empi-cw-foth-${c.key}]`);
        const cell = $1(`[data-empi-cw-fota-${c.key}]`);
        const h = inp ? Number(inp.value || 0) : 0;
        const w = h * c.rate;
        if (cell) cell.textContent = w ? fmtHrs(w) + '시간' : '-';
        totalH += h; totalW += w;
      });
      const ht = $1('[data-empi-cw-fot-htotal]');
      const wt = $1('[data-empi-cw-fot-wtotal]');
      if (ht) ht.textContent = fmtHrs(totalH);
      if (wt) wt.textContent = fmtHrs(totalW);
    };

    /* 포괄계약 근로시간 표 — 카테고리별 시간 입력 → 가산시간(시간 × 지급배율) + 합계 갱신
     *   합계 시간은 52시간을 초과할 수 없음 (근로기준법 주 52시간 기준 월 환산). */
    const fmtHrs = (n) => Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
    const refreshInclusive = () => {
      let totalH = 0, totalWeighted = 0;
      INCLUSIVE_OT_CATEGORIES.forEach(c => {
        const inp = $1(`[data-empi-cw-inch-${c.key}]`);
        const cell = $1(`[data-empi-cw-inca-${c.key}]`);
        const h = inp ? Number(inp.value || 0) : 0;
        const weighted = h * c.rate;
        if (cell) cell.textContent = weighted ? fmtHrs(weighted) + '시간' : '-';
        totalH        += h;
        totalWeighted += weighted;
      });
      const hTot = $1('[data-empi-cw-inc-hours-total]');
      const aTot = $1('[data-empi-cw-inc-amount-total]');
      if (hTot) {
        hTot.textContent = fmtHrs(totalH);
        hTot.style.color = totalH > 52 ? 'var(--color-danger)' : '';
      }
      if (aTot) aTot.textContent = fmtHrs(totalWeighted);
      /* 합계 시간 52h 초과 시 인라인 경고 (slot 동적 생성) */
      const hostRow = $1('[data-empi-cw-inc-detail-row]');
      if (hostRow) {
        let warn = hostRow.querySelector('[data-empi-cw-inc-limit-warn]');
        if (totalH > 52) {
          if (!warn) {
            warn = document.createElement('div');
            warn.setAttribute('data-empi-cw-inc-limit-warn', '');
            warn.style.cssText = 'padding:8px 12px;background:rgba(220,38,38,.06);border-top:1px solid var(--color-divider);color:var(--color-danger);font-size:12px;';
            const valueCell = hostRow.querySelector('.fm-tbl__value');
            if (valueCell) valueCell.appendChild(warn);
          }
          warn.textContent = `합계 ${fmtHrs(totalH)}시간 — 포괄계약 근로시간은 월 52시간을 초과할 수 없습니다.`;
        } else if (warn) {
          warn.remove();
        }
      }
      /* 자동 산출 트리거 */
      autoCalcPayItems();
    };

    /* 지급 항목 자동 산출 — 월 기본급 / 월 시간외수당 / 월 고정연장근무수당
     *
     *   변수
     *     M   = 월 지급총액 = 연봉/12 또는 월급 그대로
     *     H   = 월 소정근로시간 (근로계약)
     *     W   = 가중시간 = 시간 × 지급배율 (고정OT 또는 포괄 7종 합계)
     *     E_o = 통상임금 산입 추가항목 합계 (식대 등 ordinaryWage=true)
     *     E_n = 통상임금 미산입 추가항목 합계
     *
     *   사용자 정의 산식 (제약식 + 도출):
     *     월 지급총액 = 기본급 + E_o + E_n + 고정OT수당          ─ 제약식
     *     통상임금 산정 기준금액 N = 기본급 + E_o                ─ 통상임금 정의
     *     통상시급 = N / H
     *     고정OT수당 = 통상시급 × W = N × W / H
     *
     *   대수 풀이:
     *     M = (N - E_o) + E_o + E_n + N × W/H
     *     M - E_n = N × (1 + W/H) = N × (H+W)/H
     *     → N         = (M - E_n) × H / (H + W)
     *       기본급    = N - E_o    = (M - E_n) × H / (H + W) - E_o
     *       고정OT수당 = N × W / H = (M - E_n) × W / (H + W)
     *       통상시급  = N / H      = (M - E_n) / (H + W)
     *
     *   결과
     *     · 월 지급총액 (M) 은 사용자가 입력한 계약금액 자체 (제약식이 항상 성립)
     *     · 통상임금 포함 추가항목(식대) 추가 → 기본급만 차감, 고정OT수당 변동 없음
     *     · 통상임금 미포함 추가항목 추가 → 기본급/고정OT수당 비례 차감
     *     · 소정근로시간 H 는 분모(H+W)에 직접 들어가 기본급·OT 비율을 결정
     *
     *   user 가 직접 수정한 셀은 data-auto-pay="0" 으로 변환 → 자동 산출에서 제외. */
    const autoCalcPayItems = () => {
      const wt   = ($1('[name="empi-cw-wagetype"]:checked') || {}).value || '';
      const kind = ($1('[name="empi-cw-kind"]:checked') || {}).value || '';
      if (['annual','monthly'].indexOf(wt) < 0) return;
      const amountEl = $1('[data-empi-cw-amount]');
      const C = Number((amountEl && amountEl.value || '').replace(/[^0-9.\-]/g, '')) || 0;
      if (!C) return;
      const M = wt === 'annual' ? (C / 12) : C;
      const emp = CARD_STATE.emp;
      const H = Number((emp && emp.hoursPerMonth) || 209);

      let W = 0;
      if (kind === 'fixedOT') {
        /* 고정 OT 7종 카테고리별 가산시간(시간 × 법정배율) 합계 */
        W = computeFixedOTWeighted();
      } else if (kind === 'inclusive') {
        INCLUSIVE_OT_CATEGORIES.forEach(c => {
          const h = Number(($1(`[data-empi-cw-inch-${c.key}]`) || {}).value || 0);
          W += h * c.rate;
        });
      }

      /* 추가 지급 항목 합계 — 「연봉/월급 포함」 항목만 산식에 반영. 「별도 지급」 은 제외.
       *   포함 항목 안에서 통상임금 산입 여부로 다시 분리 (E_o / E_n).
       *   별도 지급 항목의 합계(E_sep)는 산식 밖에서 「월 지급 기준」 표시에만 가산. */
      let E_o = 0, E_n = 0, E_sep = 0, sepCount = 0;
      const API = window.App && App.HRPayItem;
      modal.querySelectorAll('[data-empi-cw-item-row]').forEach(row => {
        const inp = row.querySelector('[data-empi-cw-item-amount]');
        const amt = inp ? (Number(String(inp.value).replace(/[^0-9]/g, '')) || 0) : 0;
        if (row.dataset.empiCwItemIncl === '0') {
          E_sep += amt;
          sepCount += 1;
          return;
        }
        const code = row.dataset.empiCwItemRow;
        const meta = (API && typeof API.getByCode === 'function') ? API.getByCode(code) : null;
        if (meta && meta.ordinaryWage) E_o += amt;
        else                            E_n += amt;
      });

      const denom    = H + W;
      const otAuto   = denom > 0 ? Math.round((M - E_n) * W / denom) : 0;
      const baseAuto = denom > 0 ? Math.round((M - E_n) * H / denom - E_o) : Math.round(M - E_o - E_n);

      const setIfAuto = (sel, val) => {
        const el = $1(sel);
        if (!el) return;
        if (el.dataset.autoPay === '1') el.value = val ? formatMoney(val) : '';
      };
      setIfAuto('[data-empi-cw-base]', baseAuto);
      if (kind === 'fixedOT')   setIfAuto('[data-empi-cw-fot-amount]', otAuto);
      if (kind === 'inclusive') setIfAuto('[data-empi-cw-inc-amount]', otAuto);

      /* 월 지급 기준액 = 계약금액 월 환산(M) + 별도 지급 합계(E_sep).
       *   「연봉/월급 포함」 항목들은 M 안에서 분배되므로 합계엔 영향 X.
       *   「별도 지급」 항목은 M 밖이라 합계에 가산되어 실제 매월 지급액 반영. */
      const monthlyTotal = M + E_sep;
      const monthlyEl = $1('[data-empi-cw-monthly]');
      if (monthlyEl) monthlyEl.textContent = monthlyTotal > 0 ? `${formatMoney(Math.round(monthlyTotal))}원/월` : '-';

      /* 월 지급 기준 도움말 — 별도 지급이 있으면 내역 노출 */
      const helpEl = $1('[data-empi-cw-monthly-help]');
      if (helpEl) {
        const baseText = wt === 'annual'  ? '계약 연봉을 12개월로 나누어 매월 지급합니다.'
                       : wt === 'monthly' ? '계약 월급을 매월 지급합니다.'
                       : '';
        const sepText = E_sep > 0
          ? ` 「별도 지급」 ${sepCount}건 합계 ${formatMoney(Math.round(E_sep))}원/월 이 추가됩니다.`
          : '';
        helpEl.textContent = baseText + sepText;
      }

      /* 계약금액 라인 — 별도 지급 합계 힌트 (계약금액 입력은 변경하지 않음, 시각 안내만) */
      const sepHint = $1('[data-empi-cw-amount-sep-hint]');
      if (sepHint) {
        if (E_sep > 0) {
          const annual = E_sep * 12;
          sepHint.textContent = `+ 별도 지급 ${sepCount}건 (월 ${formatMoney(Math.round(E_sep))}원 / 연 ${formatMoney(Math.round(annual))}원)`;
          sepHint.hidden = false;
        } else {
          sepHint.hidden = true;
          sepHint.textContent = '';
        }
      }
    };

    /* picker 의 추가/삭제/금액 변경에서 호출할 수 있도록 modal 에 노출 */
    modal._empiCwAutoCalc = autoCalcPayItems;

    /* 사용자가 직접 수정 시 자동 산출 해제 — '자동 산출' 태그 → '직접 입력' 으로 변경.
     *   또한 사용자 입력 직후에도 「월 지급 기준액」 합계가 갱신되도록 autoCalcPayItems 호출. */
    ['[data-empi-cw-base]','[data-empi-cw-fot-amount]','[data-empi-cw-inc-amount]'].forEach(sel => {
      const el = $1(sel);
      if (!el) return;
      el.addEventListener('input', () => {
        if (el.dataset.autoPay === '1') {
          el.dataset.autoPay = '0';
          const tagSel = sel.replace(']', '-tag]');
          const tag = $1(tagSel);
          if (tag) { tag.textContent = '직접 입력'; tag.style.color = 'var(--color-brand-primary)'; tag.style.borderColor = 'var(--color-brand-primary)'; }
        }
        /* 직접 입력 값 변경 후에도 월 지급 기준액 합계 다시 계산 */
        autoCalcPayItems();
      });
    });

    /* 고정 OT 7종 카테고리별 기준시간 변경 → 가산시간 합계 갱신 + 자동 산출 재계산 */
    INCLUSIVE_OT_CATEGORIES.forEach(c => {
      const fotInp = $1(`[data-empi-cw-foth-${c.key}]`);
      if (fotInp) fotInp.addEventListener('input', () => {
        refreshFixedOT();
        autoCalcPayItems();
      });
      const incInp = $1(`[data-empi-cw-inch-${c.key}]`);
      if (incInp) incInp.addEventListener('input', () => {
        refreshInclusive();
        autoCalcPayItems();
      });
    });

    /* 기간의 정함 없음 — 체크 시 종료일 비활성 + 클리어 (근로계약 모달과 동일 동작) */
    const indefEl = $1('[data-empi-cw-indefinite]');
    if (indefEl) indefEl.addEventListener('change', () => {
      const endEl = $1('[data-empi-cw-end]');
      if (!endEl) return;
      endEl.disabled = indefEl.checked;
      if (indefEl.checked) { endEl.value = ''; endEl.style.background = 'var(--color-surface-alt)'; }
      else endEl.style.background = '';
    });

    /* 계약 금액 변경 → 지급 항목 노출 + 월 지급 기준액 표시 갱신
     *   월 지급 기준액 = 계약금액의 월 환산 (M). 기본급/OT/추가항목 합계는 제약식에 의해 항상 M 과 같다. */
    const refreshPreview = () => {
      const wt = ($1('[name="empi-cw-wagetype"]:checked') || {}).value || '';
      const amount = Number(String(($1('[data-empi-cw-amount]') || {}).value || '').replace(/[^0-9.\-]/g, '')) || 0;
      const payItems = $1('[data-empi-cw-payitems-wrap]');
      if (payItems) payItems.style.display = (amount > 0 && ['annual','monthly'].indexOf(wt) >= 0) ? '' : 'none';
      const monthly = $1('[data-empi-cw-monthly]');
      if (monthly) {
        if (wt === 'annual' && amount)        monthly.textContent = `${formatMoney(Math.round(amount/12))}원/월`;
        else if (wt === 'monthly' && amount)  monthly.textContent = `${formatMoney(amount)}원/월`;
        else                                  monthly.textContent = '-';
      }
      const monthlyHelp = $1('[data-empi-cw-monthly-help]');
      if (monthlyHelp) {
        monthlyHelp.textContent = wt === 'annual'
          ? '계약 연봉을 12개월로 나누어 매월 지급합니다.'
          : wt === 'monthly' ? '계약 월급을 매월 지급합니다.' : '';
      }
      /* 포괄 상세표 — 금액·임금유형 변동 시 통상시급 기준이 바뀌므로 함께 갱신 */
      refreshInclusive();
    };

    $$('[name="empi-cw-wagetype"]').forEach(r => r.addEventListener('change', syncWageType));
    $$('[name="empi-cw-kind"]').forEach(r => r.addEventListener('change', syncWageKind));
    const amount = $1('[data-empi-cw-amount]');
    if (amount) {
      /* 입력 즉시 천 단위 콤마 자동 포맷 — 우측 정렬 입력란이므로 커서는 끝으로 자연 이동 */
      amount.addEventListener('input', () => {
        const raw = String(amount.value).replace(/[^0-9]/g, '');
        amount.value = raw ? Number(raw).toLocaleString() : '';
        refreshHoliday();
        refreshPreview();
      });
    }

    /* 임금 지급일 — 수정 시 toast 안내 (정책상 설정에서 관리) */
    const payday = $1('[data-empi-cw-payday]');
    if (payday) {
      let warned = false;
      payday.addEventListener('input', () => {
        if (!warned && window.toast) {
          window.toast('임금 지급일은 [설정]에서 일괄 관리할 수 있습니다.', 'info');
          warned = true;
        }
      });
    }

    /* 사용자가 다시 입력/선택하면 해당 필드 인라인 오류 자동 클리어 */
    const errAttrs = {
      'data-empi-cw-start':  'period',
      'data-empi-cw-end':    'period',
      'data-empi-cw-amount': 'amount',
      'data-empi-cw-base':   'base',
      'data-empi-cw-payday': 'payday',
    };
    const errRadios = {
      'empi-cw-income':    'income',
      'empi-cw-wagetype':  'wagetype',
      'empi-cw-kind':      'kind',
    };
    const clearErr = (key, el) => {
      const slot = modal.querySelector(`[data-empi-cw-err="${key}"]`);
      if (slot) { slot.textContent = ''; slot.hidden = true; }
      if (el && el.classList) el.classList.remove('is-invalid');
    };
    Object.keys(errAttrs).forEach(attr => {
      modal.querySelectorAll(`[${attr}]`).forEach(el => {
        const ev = (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'radio') ? 'change' : 'input';
        el.addEventListener(ev, () => clearErr(errAttrs[attr], el));
      });
    });
    Object.keys(errRadios).forEach(name => {
      modal.querySelectorAll(`[name="${name}"]`).forEach(r => {
        r.addEventListener('change', () => clearErr(errRadios[name]));
      });
    });

    /* ============ 가산시간 ⓘ 헬프 popover ============
     *   포괄임금 테이블 헤더의 ⓘ 아이콘에 hover/focus 시 짧은 설명을 노출. */
    $$('[data-empi-cw-inca-info]').forEach(incaInfo => {
      const incaPop = incaInfo.querySelector('[data-empi-cw-inca-pop]');
      const showPop = () => { if (incaPop) incaPop.hidden = false; };
      const hidePop = () => { if (incaPop) incaPop.hidden = true; };
      incaInfo.addEventListener('mouseenter', showPop);
      incaInfo.addEventListener('mouseleave', hidePop);
      incaInfo.addEventListener('focus', showPop);
      incaInfo.addEventListener('blur', hidePop);
    });

    /* ============ 마스터 지급항목 picker ============
     *   - 우측 [+ 지급항목 추가] 버튼 → popover 토글
     *   - popover 에는 App.HRPayItem.getActiveItems('fixed') 결과 중 이미 추가된 항목 + 기본급/시간외수당 제외
     *   - 클릭 시 [data-empi-cw-extra-items] 안에 row 추가 (금액 input + 삭제 버튼) */
    wireExtraPayItemsPicker(modal);

    /* 초기 1회 — 현재 계약유형 기준 파생 표시 갱신 (고정OT / 포괄임금 가산시간) */
    const _initKind = ($1('[name="empi-cw-kind"]:checked') || {}).value;
    if (_initKind === 'fixedOT')   refreshFixedOT();
    if (_initKind === 'inclusive') refreshInclusive();
  }

  /* 마스터에서 가져온 추가 지급 항목 row 마크업
   *   includedInBase (기본 true):
   *     true  — 연봉/월급 안에 포함 (기존 산식 그대로 분배)
   *     false — 연봉/월급과 별개로 지급 (계산 산식과 독립, 명세서에만 노출)
   *   통상임금 포함 여부(ordinaryWage)와는 별개의 축. */
  function renderExtraItemRow(item) {
    const taxBadge = item.taxType === 'taxable'
      ? '<span style="font-size:11px;color:var(--color-text-muted);padding:2px 6px;border:1px solid var(--color-border);border-radius:10px;">과세</span>'
      : '<span style="font-size:11px;color:var(--color-success);padding:2px 6px;border:1px solid var(--color-success);border-radius:10px;">비과세</span>';
    /* 기본값 true — 기존 데이터(이 필드 없음) 도 「포함」 으로 해석 */
    const incl = item.includedInBase !== false;
    const separateBadge = !incl
      ? '<span data-empi-cw-sep-badge style="font-size:11px;color:var(--color-warning);padding:2px 6px;border:1px solid var(--color-warning);border-radius:10px;" title="연봉/월급 산식 밖에서 별도 지급">별도</span>'
      : '';
    return `
      <div class="fm-tbl__row fm-tbl__row--1" data-empi-cw-item-row="${esc(item.code)}" data-empi-cw-item-incl="${incl ? '1' : '0'}">
        <div class="fm-tbl__label" style="display:flex;align-items:center;gap:6px;">
          <span>${esc(item.name)}</span>
        </div>
        <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;gap:8px;align-items:center;flex-wrap:wrap;">
          <input class="input" type="text" inputmode="numeric" data-empi-cw-item-amount value="${esc(item.amount ? Number(item.amount).toLocaleString() : '')}" style="width:160px;text-align:right;" placeholder="0" />
          <span style="font-size:12px;color:var(--color-text-muted);">원/월</span>
          <select class="select" data-empi-cw-item-incl-select title="연봉/월급 산식 포함 여부" style="height:30px;font-size:12px;padding:0 24px 0 8px;min-width:130px;">
            <option value="1" ${incl ? 'selected' : ''}>연봉/월급 포함</option>
            <option value="0" ${!incl ? 'selected' : ''}>별도 지급</option>
          </select>
          ${taxBadge}
          ${item.ordinaryWage ? '<span style="font-size:11px;color:var(--color-brand-primary);padding:2px 6px;border:1px solid var(--color-brand-primary);border-radius:10px;">통상임금</span>' : ''}
          ${separateBadge}
          <span style="flex:1;"></span>
          <button type="button" data-empi-cw-item-del title="삭제"
            style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:6px;border:1px solid var(--color-border);background:var(--color-surface);cursor:pointer;color:var(--color-text-muted);">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
          </button>
        </div>
      </div>
    `;
  }

  /* extra-items 컨테이너 전체 재렌더 — 초기 진입 시 emp 의 기존 추가 항목 표시 */
  function renderExtraPayItems(modal) {
    const host = modal.querySelector('[data-empi-cw-extra-items]');
    if (!host) return;
    const emp = CARD_STATE.emp || {};
    const items = Array.isArray(emp.additionalPayItems) ? emp.additionalPayItems : [];
    host.innerHTML = items.map(renderExtraItemRow).join('');
  }

  /* popover 마크업 — 마스터 항목 중 이미 추가된 코드 제외 후 노출 */
  function renderPayItemPopover(modal) {
    const pop = modal.querySelector('[data-empi-cw-payitem-pop]');
    if (!pop) return;
    const API = window.App && App.HRPayItem;
    const all = (API && typeof API.getActiveItems === 'function') ? API.getActiveItems('fixed') : [];
    /* 시스템 자동 산출 항목(기본급/고정연장근무수당)은 폼에서 별도 input 으로 다루므로 picker 에서 제외 */
    const EXCLUDED_CODES = ['PAY-SYS-001', 'PAY-SYS-002'];
    const addedCodes = Array.from(modal.querySelectorAll('[data-empi-cw-item-row]'))
      .map(r => r.dataset.empiCwItemRow);
    const list = all
      .filter(x => EXCLUDED_CODES.indexOf(x.code) < 0)
      .filter(x => addedCodes.indexOf(x.code) < 0);

    if (!list.length) {
      pop.innerHTML = `<div style="padding:18px 12px;text-align:center;color:var(--color-text-muted);font-size:12px;">추가할 수 있는 지급항목이 없습니다.</div>`;
      return;
    }
    pop.innerHTML = `
      <div style="padding:6px 8px 8px;border-bottom:1px solid var(--color-divider);font-size:11px;color:var(--color-text-muted);">
        지급항목 마스터 (고정)
      </div>
      ${list.map(it => `
        <button type="button" data-empi-cw-pick="${esc(it.code)}"
          style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;background:var(--color-surface);border:0;text-align:left;cursor:pointer;border-radius:4px;transition:background .12s;">
          <span style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:var(--fw-medium);color:var(--color-text);">${esc(it.name)}</div>
            <div style="font-size:11px;color:var(--color-text-muted);margin-top:1px;">
              ${it.taxType === 'taxable' ? '과세' : '비과세'}
              ${it.ordinaryWage ? ' · 통상임금' : ''}
            </div>
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-brand-primary);"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
        </button>
      `).join('')}
    `;
    /* hover 효과 — inline 으로 부드럽게 */
    pop.querySelectorAll('[data-empi-cw-pick]').forEach(btn => {
      btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--color-surface-alt)'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = '#fff'; });
    });
  }

  function wireExtraPayItemsPicker(modal) {
    const addBtn = modal.querySelector('[data-empi-cw-payitem-add]');
    const pop    = modal.querySelector('[data-empi-cw-payitem-pop]');
    if (!addBtn || !pop) return;

    /* 초기 렌더 — 기존 emp.additionalPayItems 로드 */
    renderExtraPayItems(modal);

    /* popover 토글 */
    const openPop = () => {
      renderPayItemPopover(modal);
      pop.hidden = false;
    };
    const closePop = () => { pop.hidden = true; };
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      pop.hidden ? openPop() : closePop();
    });
    /* 외부 클릭 시 닫기 — 한 번만 부착 */
    if (!modal.dataset.empiCwPopBound) {
      modal.dataset.empiCwPopBound = '1';
      document.addEventListener('click', (e) => {
        if (pop.hidden) return;
        if (pop.contains(e.target) || addBtn.contains(e.target)) return;
        closePop();
      });
    }

    /* 자동 산출 재계산 — modal._empiCwAutoCalc 가 wireWageEditDeps 에서 노출됨 */
    const recalc = () => { if (typeof modal._empiCwAutoCalc === 'function') modal._empiCwAutoCalc(); };

    /* picker 항목 클릭 → row 추가 */
    pop.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-empi-cw-pick]');
      if (!btn) return;
      const code = btn.dataset.empiCwPick;
      const API = window.App && App.HRPayItem;
      const meta = API && API.getByCode ? API.getByCode(code) : null;
      if (!meta) return;
      const host = modal.querySelector('[data-empi-cw-extra-items]');
      if (!host) return;
      const wrap = document.createElement('div');
      wrap.innerHTML = renderExtraItemRow({
        code: meta.code, name: meta.name, amount: '',
        taxType: meta.taxType, ordinaryWage: meta.ordinaryWage,
        includedInBase: true,   /* 기본값 — 연봉/월급 포함. 사용자가 「별도 지급」 으로 변경 가능 */
      });
      host.appendChild(wrap.firstElementChild);
      closePop();
      recalc(); /* 새 row 추가 → 기본급/OT 분배 갱신 */
    });

    /* row 삭제 + 금액 input 콤마 포맷 — 이벤트 위임 */
    const host = modal.querySelector('[data-empi-cw-extra-items]');
    if (host && !host.dataset.empiCwBound) {
      host.dataset.empiCwBound = '1';
      host.addEventListener('click', (e) => {
        const del = e.target.closest('[data-empi-cw-item-del]');
        if (!del) return;
        const row = del.closest('[data-empi-cw-item-row]');
        if (row) row.remove();
        recalc(); /* row 삭제 → 잔액 증가 → 기본급/OT 재분배 */
      });
      host.addEventListener('input', (e) => {
        const inp = e.target.closest('[data-empi-cw-item-amount]');
        if (!inp) return;
        const raw = String(inp.value).replace(/[^0-9]/g, '');
        inp.value = raw ? Number(raw).toLocaleString() : '';
        recalc(); /* 금액 변경 → 잔액 변동 → 기본급/OT 재분배 */
      });
      /* 연봉/월급 포함 ↔ 별도 지급 토글 */
      host.addEventListener('change', (e) => {
        const sel = e.target.closest('[data-empi-cw-item-incl-select]');
        if (!sel) return;
        const row = sel.closest('[data-empi-cw-item-row]');
        if (!row) return;
        row.dataset.empiCwItemIncl = sel.value;
        /* 별도 뱃지 토글 — 「별도」 텍스트 span 가 select 다음에 위치 */
        const valueCell = row.querySelector('.fm-tbl__value');
        const existing = valueCell && valueCell.querySelector('[data-empi-cw-sep-badge]');
        if (sel.value === '0' && !existing && valueCell) {
          const badge = document.createElement('span');
          badge.setAttribute('data-empi-cw-sep-badge', '');
          badge.style.cssText = 'font-size:11px;color:var(--color-warning);padding:2px 6px;border:1px solid var(--color-warning);border-radius:10px;';
          badge.title = '연봉/월급 산식 밖에서 별도 지급';
          badge.textContent = '별도';
          /* select 바로 뒤 + 통상임금 뱃지 뒤에 삽입 — 마지막 spacer 직전 */
          const spacer = valueCell.querySelector('span[style*="flex:1"]');
          valueCell.insertBefore(badge, spacer);
        } else if (sel.value === '1' && existing) {
          existing.remove();
        }
        recalc();
      });
    }

    /* 초기 로드 — 기존 emp.additionalPayItems 가 있다면 한 번 재계산해 시각 일치 */
    recalc();
  }

  /* 임금 계약 정보 설정 — 필수 정보 인라인 검증 */
  function validateWageForm(modal) {
    /* 클리어 */
    modal.querySelectorAll('[data-empi-cw-err]').forEach(s => { s.textContent = ''; s.hidden = true; });
    modal.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));

    const firstInvalid = [];
    const showErr = (key, msg, focusEl) => {
      const slot = modal.querySelector(`[data-empi-cw-err="${key}"]`);
      if (slot) { slot.textContent = msg; slot.hidden = false; }
      if (focusEl) {
        focusEl.classList.add('is-invalid');
        firstInvalid.push(focusEl);
      } else if (slot) {
        firstInvalid.push(slot);
      }
    };

    const startEl = modal.querySelector('[data-empi-cw-start]');
    const endEl   = modal.querySelector('[data-empi-cw-end]');
    /* 기간의 정함 없음 체크 시 종료일 미입력 허용 (무기 계약) */
    const wageIndef = !!(modal.querySelector('[data-empi-cw-indefinite]') || {}).checked;
    if (!startEl.value)               showErr('period', '계약 시작일을 선택해 주세요.', startEl);
    else if (!wageIndef && !endEl.value)   showErr('period', '계약 종료일을 선택하거나 「기간의 정함 없음」을 선택해 주세요.', endEl);
    else if (!wageIndef && endEl.value < startEl.value) showErr('period', '종료일은 시작일 이후로 설정해 주세요.', endEl);
    else if (CARD_STATE.newContractFlow === 'wage') {
      /* 신규 임금계약 작성 — 동일 '시작일'의 유효 임금계약서가 있으면 안내(작성 차단). 시작일이 다르면
         재계약(갱신)으로 허용 — 무기(기간의 정함 없음) 임금계약끼리도 시작일이 다르면 허용한다. */
      const dup = findSameStartContract(CARD_STATE.emp, '임금계약서', startEl.value);
      if (dup) showErr('period', `이미 같은 시작일의 임금계약서가 존재합니다 (${dup.id}, ${dupPeriodText(dup)}). 시작일을 변경해 주세요.`, startEl);
    }

    /* 소득 유형 필드 제거 — 검증하지 않음 (저장 시 'earned' 근로소득 고정) */
    const wt = (modal.querySelector('[name="empi-cw-wagetype"]:checked') || {}).value || '';
    if (!wt) showErr('wagetype', '임금 유형을 선택해 주세요.');

    const amountEl = modal.querySelector('[data-empi-cw-amount]');
    const amount = Number(String(amountEl.value || '').replace(/[^0-9.\-]/g, ''));
    if (!amount || amount <= 0) showErr('amount', wt === 'hourly' ? '시급을 입력해 주세요.' : '계약 금액을 입력해 주세요.', amountEl);

    /* 소정근로시간 — 1일/1주/월 모두 필수 */
    const hn = (sel) => Number(String((modal.querySelector(sel) || {}).value || '').replace(/[^0-9.\-]/g, ''));
    if (!(hn('[data-empi-cw-hours-day]') > 0 && hn('[data-empi-cw-hours-week]') > 0 && hn('[data-empi-cw-hours-month]') > 0)) {
      showErr('stdhours', '소정근로시간(1일·1주·월)을 모두 입력해 주세요.');
    }

    if (['annual','monthly'].indexOf(wt) >= 0) {
      const kind = (modal.querySelector('[name="empi-cw-kind"]:checked') || {}).value || '';
      if (!kind) showErr('kind', '임금 계약 유형을 선택해 주세요.');
      const baseEl = modal.querySelector('[data-empi-cw-base]');
      const base = Number(String(baseEl.value || '').replace(/[^0-9.\-]/g, ''));
      if (!base || base <= 0) showErr('base', '월 기본급을 입력해 주세요.', baseEl);
      /* 포괄임금 — 합계 시간 52시간 초과 금지 */
      if (kind === 'inclusive') {
        let totalH = 0;
        INCLUSIVE_OT_CATEGORIES.forEach(c => {
          totalH += Number((modal.querySelector(`[data-empi-cw-inch-${c.key}]`) || {}).value || 0);
        });
        if (totalH > 52) {
          showErr('kind', '포괄계약 근로시간 합계는 월 52시간을 초과할 수 없습니다.');
        }
      }
    }

    const paydayEl = modal.querySelector('[data-empi-cw-payday]');
    const payday = Number(paydayEl.value);
    if (!payday || payday < 1 || payday > 31) showErr('payday', '임금 지급일은 1~31일 사이의 값을 입력해 주세요.', paydayEl);

    const ok = firstInvalid.length === 0;
    if (!ok) {
      const focus = firstInvalid[0];
      if (focus && focus.scrollIntoView) focus.scrollIntoView({ behavior:'smooth', block:'center' });
    }
    return ok;
  }

  /* 섹션 편집 본문 — 조직 정보 (부서·직위·직책. 직무는 고용 정보로 이동) */
  function renderCardEditBelonging(emp) {
    const selOpts = (list, cur) => '<option value="">선택</option>' +
      list.filter(s => s).map(s => `<option value="${esc(s)}" ${cur === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
    /* 부서는 근로 계약 정보(설정)에서 지정 — 조직 정보 편집기는 직위·직책만. */
    return `
      <div class="fm-tbl fm-tbl--compact">
        <div class="fm-tbl__row fm-tbl__row--2">
          <div class="fm-tbl__label">직위</div>
          <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;">
            <select class="select" data-empi-ce-rank style="width:100%;">${selOpts(MASTER.ranks, emp.rank)}</select>
          </div>
          <div class="fm-tbl__label">직책</div>
          <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;">
            <select class="select" data-empi-ce-position style="width:100%;">${selOpts(MASTER.positions, emp.position)}</select>
          </div>
        </div>
      </div>
    `;
  }

  /* 섹션 편집 본문 — 신상 정보 (인사담당자 직접 수정)
   *   수정 가능: 이름(성/이름)·영문 이름·성별·생년월일·주민등록번호·휴대전화·개인 이메일·주소
   *   수정 불가(read-only): 재직 상태(발령/퇴직)·사번(시스템)·입사일(계약)·회사 이메일(아이디 파생) */
  function renderCardEditBasic(emp) {
    const v = (s) => esc(s == null ? '' : s);
    const g = emp.gender === 'F' ? 'F' : 'M';
    return `
      <div class="fm-tbl fm-tbl--compact">
        <div class="fm-tbl__row fm-tbl__row--2">
          <div class="fm-tbl__label"><em style="color:var(--color-danger);font-style:normal;">*</em> 성</div>
          <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;">
            <input class="input" type="text" data-empi-cb-fname value="${v(emp.fname)}" placeholder="홍" style="width:100%;" />
          </div>
          <div class="fm-tbl__label"><em style="color:var(--color-danger);font-style:normal;">*</em> 이름</div>
          <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;">
            <input class="input" type="text" data-empi-cb-gname value="${v(emp.gname)}" placeholder="길동" style="width:100%;" />
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--2">
          <div class="fm-tbl__label">영문 이름</div>
          <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;">
            <input class="input" type="text" data-empi-cb-ename value="${v(emp.ename)}" placeholder="HONG GIL DONG" style="width:100%;" />
          </div>
          <div class="fm-tbl__label">성별</div>
          <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;">
            <div style="display:flex;gap:18px;align-items:center;">
              <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;"><input type="radio" name="empi-cb-gender" value="M" ${g === 'M' ? 'checked' : ''}/> 남</label>
              <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;"><input type="radio" name="empi-cb-gender" value="F" ${g === 'F' ? 'checked' : ''}/> 여</label>
            </div>
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--2">
          <div class="fm-tbl__label">생년월일</div>
          <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;">
            <input class="input" type="date" data-empi-cb-birth value="${v(emp.birth)}" style="width:100%;" />
          </div>
          <div class="fm-tbl__label">주민등록번호</div>
          <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;">
            <input class="input" type="text" data-empi-cb-ssn value="${v(emp.ssn)}" placeholder="900101-1******" style="width:100%;" />
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--2">
          <div class="fm-tbl__label">휴대전화</div>
          <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;">
            <input class="input" type="text" data-empi-cb-phone value="${v(emp.phone)}" placeholder="010-0000-0000" style="width:100%;" />
          </div>
          <div class="fm-tbl__label">개인 이메일</div>
          <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;">
            <input class="input" type="email" data-empi-cb-email value="${v(emp.email)}" placeholder="user@example.com" style="width:100%;" />
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label">주소</div>
          <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;">
            <input class="input" type="text" data-empi-cb-address value="${v(emp.address)}" placeholder="[우편번호] 주소" style="width:100%;" />
          </div>
        </div>
      </div>
    `;
  }

  /* 섹션 편집 본문 — 지급 정보 (인사담당자 직접 수정)
   *   수정 가능: 은행·계좌번호·예금주. */
  function renderCardEditBank(emp) {
    const v = (s) => esc(s == null ? '' : s);
    return `
      <div class="fm-tbl fm-tbl--compact">
        <div class="fm-tbl__row fm-tbl__row--2">
          <div class="fm-tbl__label">은행</div>
          <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;">
            <input class="input" type="text" data-empi-pp-bankname value="${v(emp.bankName)}" placeholder="○○은행" style="width:100%;" />
          </div>
          <div class="fm-tbl__label">예금주</div>
          <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;">
            <input class="input" type="text" data-empi-pp-bankholder value="${v(emp.bankHolder || displayName(emp))}" style="width:100%;" />
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label">계좌번호</div>
          <div class="fm-tbl__value" style="background:var(--color-surface);padding:6px 12px;">
            <input class="input" type="text" data-empi-pp-bankaccount value="${v(emp.bankAccount)}" placeholder="'-' 없이 숫자만 입력" style="width:100%;" />
          </div>
        </div>
      </div>
    `;
  }

  /* 섹션 편집 모달 오픈 — sectionKey: 'employment' | 'wage' | 'belonging' | 'basic' | 'payroll-pay'
     opts.lockEmpType — 계약 관리 개별 작성에서 호출 시, 근로 유형(정규직/기간제 종류)을 잠금. */
  /* 섹션 편집 본문 — 소정근로시간 정보 설정 (1일 / 1주 / 월). 근로 계약 정보와 분리된 별도 섹션. */
  function renderCardEditStdHours(emp) {
    const reqMark = `<em style="color:var(--color-danger);font-style:normal;margin-right:2px;">*</em>`;
    const cellPad = 'background:var(--color-surface);padding:6px 12px;';
    const d = emp.hoursPerDay   != null && emp.hoursPerDay   !== '' ? emp.hoursPerDay   : 8;
    const w = emp.hoursPerWeek  != null && emp.hoursPerWeek  !== '' ? emp.hoursPerWeek  : 40;
    const m = emp.hoursPerMonth != null && emp.hoursPerMonth !== '' ? emp.hoursPerMonth : 209;
    return `
      <div class="fm-tbl fm-tbl--compact">
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label">${reqMark}소정 근로시간</div>
          <div class="fm-tbl__value" style="${cellPad}gap:12px;flex-wrap:wrap;align-items:center;min-height:44px;color:var(--color-text);">
            <span style="display:inline-flex;align-items:center;gap:5px;">1일 <input class="input" type="number" min="0" step="1" data-empi-sh-day value="${esc(d)}" style="width:64px;text-align:right;" />시간</span>
            <span style="display:inline-flex;align-items:center;gap:5px;">1주 <input class="input" type="number" min="0" step="1" data-empi-sh-week value="${esc(w)}" style="width:64px;text-align:right;" />시간</span>
            <span style="display:inline-flex;align-items:center;gap:5px;">월 <input class="input" type="number" min="0" step="1" data-empi-sh-month value="${esc(m)}" style="width:72px;text-align:right;" />시간</span>
            <div class="field-error" data-empi-sh-err hidden style="width:100%;"></div>
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label"></div>
          <div class="fm-tbl__value" style="background:transparent;padding:2px 0;">
            <div class="form-help">법정 기준: 1일 8시간 · 1주 40시간 · 월 209시간</div>
          </div>
        </div>
      </div>
    `;
  }

  /* 섹션 편집 본문 — 근무 정보 최초 등록 (미등록 상태). 근무지/부서/직위/직책/직무 전체 입력, 승인 불요. */
  function renderCardEditWorkInfo(emp) {
    const cellPad = 'background:var(--color-surface);padding:6px 12px;';
    const reqMark = `<em style="color:var(--color-danger);font-style:normal;margin-right:2px;">*</em>`;
    const selOpts = (list, cur) => '<option value="">선택</option>' +
      (list || []).filter(s => s).map(s => `<option value="${esc(s)}" ${cur === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
    /* 도급직 여부 — 근무 정보 최초 등록(미등록) 단계에서 지정/변경 가능.
       '해당' 선택 시 소속회사(도급 전용) 노출·필수. 사원 유형(사무/생산/연구)은 도급 여부와 무관하게 항상 노출·필수. */
    const isOut = !!(emp.contractOut || emp.empType === 'outsourced');
    return `
      <div class="fm-tbl fm-tbl--compact">
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label">${reqMark}도급직 여부</div>
          <div class="fm-tbl__value" style="${cellPad}gap:20px;min-height:44px;align-items:center;">
            <label class="cb"><input type="radio" name="empi-wi-out" value="" ${isOut ? '' : 'checked'} /> 해당 없음</label>
            <label class="cb"><input type="radio" name="empi-wi-out" value="1" ${isOut ? 'checked' : ''} /> 해당</label>
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" data-empi-wi-company-row style="display:${isOut ? '' : 'none'};">
          <div class="fm-tbl__label">${reqMark}소속회사</div>
          <div class="fm-tbl__value" style="${cellPad}">
            <select class="select" data-empi-wi-company style="width:100%;">${selOpts(MASTER.contractCompanies, emp.contractCompany)}</select>
            <div class="field-error" data-empi-wi-company-err hidden style="width:100%;"></div>
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" data-empi-wi-jobcat-row>
          <div class="fm-tbl__label">${reqMark}사원 유형</div>
          <div class="fm-tbl__value" style="${cellPad}gap:20px;min-height:44px;align-items:center;flex-wrap:wrap;">
            <label class="cb"><input type="radio" name="empi-wi-jobcat" value="office" ${emp.jobCat === 'office' ? 'checked' : ''} /> 사무직</label>
            <label class="cb"><input type="radio" name="empi-wi-jobcat" value="production" ${emp.jobCat === 'production' ? 'checked' : ''} /> 생산직</label>
            <label class="cb"><input type="radio" name="empi-wi-jobcat" value="research" ${emp.jobCat === 'research' ? 'checked' : ''} /> 연구직</label>
            <div class="field-error" data-empi-wi-jobcat-err hidden style="width:100%;"></div>
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--2">
          <div class="fm-tbl__label">${reqMark}근무지</div>
          <div class="fm-tbl__value" style="${cellPad}"><select class="select" data-empi-wi-site style="width:100%;">${selOpts(MASTER.sites, emp.site)}</select></div>
          <div class="fm-tbl__label">${reqMark}부서</div>
          <div class="fm-tbl__value" style="${cellPad}"><select class="select" data-empi-wi-dept style="width:100%;">${selOpts(MASTER.depts, emp.dept)}</select></div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--2">
          <div class="fm-tbl__label">${reqMark}직위</div>
          <div class="fm-tbl__value" style="${cellPad}"><select class="select" data-empi-wi-rank style="width:100%;">${selOpts(MASTER.ranks, emp.rank)}</select></div>
          <div class="fm-tbl__label">${reqMark}직책</div>
          <div class="fm-tbl__value" style="${cellPad}"><select class="select" data-empi-wi-position style="width:100%;">${selOpts(MASTER.positions, emp.position)}</select></div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label">${reqMark}직무</div>
          <div class="fm-tbl__value" style="${cellPad}"><select class="select" data-empi-wi-job style="width:100%;">${selOpts(MASTER.jobs, emp.job)}</select></div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label"></div>
          <div class="fm-tbl__value" style="background:transparent;padding:2px 0;flex-direction:column;align-items:stretch;">
            <div class="form-help">등록 후 부서 변경은 발령 관리 &gt; '전보'로 처리됩니다. (직위 · 직책 · 직무는 전자결재 승인 후 변경 가능)</div>
            <div class="field-error" data-empi-wi-err hidden style="width:100%;margin-top:6px;"></div>
          </div>
        </div>
      </div>
    `;
  }

  /* 섹션 편집 본문 — 근무 정보 수정 (등록완료 후).
     · 근무지 · 사원 유형 → 결재 없이 즉시 반영
     · 직위 · 직책 · 직무   → 전자결재 승인 후 반영
     · 부서                 → 발령 관리 > '전보'에서만 변경 (여기서는 편집 불가) */
  function renderCardEditWorksite(emp) {
    const cellPad = 'background:var(--color-surface);padding:6px 12px;';
    const selOpts = (list, cur) => '<option value="">선택</option>' +
      (list || []).filter(s => s).map(s => `<option value="${esc(s)}" ${cur === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
    return `
      <div class="fm-tbl fm-tbl--compact">
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label">근무지</div>
          <div class="fm-tbl__value" style="${cellPad}">
            <select class="select" data-empi-ws-site style="width:100%;">${selOpts(MASTER.sites, emp.site)}</select>
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label">사원 유형</div>
          <div class="fm-tbl__value" style="${cellPad}gap:20px;min-height:44px;align-items:center;flex-wrap:wrap;">
            <label class="cb"><input type="radio" name="empi-ws-jobcat" value="office" ${emp.jobCat === 'office' ? 'checked' : ''} /> 사무직</label>
            <label class="cb"><input type="radio" name="empi-ws-jobcat" value="production" ${emp.jobCat === 'production' ? 'checked' : ''} /> 생산직</label>
            <label class="cb"><input type="radio" name="empi-ws-jobcat" value="research" ${emp.jobCat === 'research' ? 'checked' : ''} /> 연구직</label>
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--2">
          <div class="fm-tbl__label">직위</div>
          <div class="fm-tbl__value" style="${cellPad}"><select class="select" data-empi-ws-rank style="width:100%;">${selOpts(MASTER.ranks, emp.rank)}</select></div>
          <div class="fm-tbl__label">직책</div>
          <div class="fm-tbl__value" style="${cellPad}"><select class="select" data-empi-ws-position style="width:100%;">${selOpts(MASTER.positions, emp.position)}</select></div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label">직무</div>
          <div class="fm-tbl__value" style="${cellPad}"><select class="select" data-empi-ws-job style="width:100%;">${selOpts(MASTER.jobs, emp.job)}</select></div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label"></div>
          <div class="fm-tbl__value" style="background:transparent;padding:2px 0;">
            <div class="form-help">직위 · 직책 · 직무 변경은 <strong style="color:var(--color-text-sub);">전자결재 승인</strong> 후 반영됩니다. 부서는 발령 관리 &gt; '전보'로 변경할 수 있습니다.</div>
          </div>
        </div>
      </div>
    `;
  }

  function openCardSectionEdit(sectionKey, opts) {
    CARD_STATE.contractEditLockType = !!(opts && opts.lockEmpType);
    const emp = CARD_STATE.emp;
    if (!emp) return;
    injectCardEditModal();
    const modal = document.getElementById('modal-empi-card-edit');
    if (!modal) return;
    CARD_STATE.editSection = sectionKey;
    CARD_STATE._workinfoConfirmed = false;   /* 근무 정보 저장 시 도급직 여부 확인 모달 재요구 */
    const TITLE = {
      employment: '근로 계약 정보 설정',
      wage:       '임금 계약 정보 설정',
      stdhours:   '소정근로시간 정보 설정',
      dependents: '부양가족 정보 적용',
      workinfo:   '근무 정보 등록',
      worksite:   '근무 정보 수정',
      belonging:  '조직 정보 등록',
      basic:      '신상 정보 수정',
      'payroll-pay': '지급 정보 수정',
    };
    modal.querySelector('[data-empi-cedit-title]').textContent = TITLE[sectionKey] || '정보 편집';
    let bodyHTML;
    if      (sectionKey === 'employment')   bodyHTML = renderCardEditEmployment(emp);
    else if (sectionKey === 'wage')         bodyHTML = renderCardEditWage(emp);
    else if (sectionKey === 'stdhours')     bodyHTML = renderCardEditStdHours(emp);
    else if (sectionKey === 'dependents')   bodyHTML = renderCardEditDependents(emp);
    else if (sectionKey === 'workinfo')     bodyHTML = renderCardEditWorkInfo(emp);
    else if (sectionKey === 'worksite')     bodyHTML = renderCardEditWorksite(emp);
    else if (sectionKey === 'basic')        bodyHTML = renderCardEditBasic(emp);
    else if (sectionKey === 'payroll-pay')  bodyHTML = renderCardEditBank(emp);
    else                                    bodyHTML = renderCardEditBelonging(emp);
    modal.querySelector('[data-empi-cedit-body]').innerHTML = bodyHTML;
    if      (sectionKey === 'employment') wireEmploymentEditDeps(modal);
    else if (sectionKey === 'wage')       wireWageEditDeps(modal);
    else if (sectionKey === 'workinfo')   wireWorkInfoEditDeps(modal);
    openModal('modal-empi-card-edit');
  }

  /* 근무 정보 편집 — 도급직 여부 토글: '해당' 시 소속회사(도급 전용) 노출, '해당 없음' 시 숨김·초기화.
     사원 유형(사무/생산/연구)은 도급 여부와 무관하게 항상 노출 — 여기서 숨기거나 초기화하지 않는다. */
  function wireWorkInfoEditDeps(modal) {
    modal.querySelectorAll('[name="empi-wi-out"]').forEach(el => {
      el.addEventListener('change', () => {
        const isOut = (modal.querySelector('[name="empi-wi-out"]:checked') || {}).value === '1';
        const companyRow = modal.querySelector('[data-empi-wi-company-row]');
        if (companyRow) companyRow.style.display = isOut ? '' : 'none';
        if (!isOut) {
          const companySel = modal.querySelector('[data-empi-wi-company]');
          if (companySel) companySel.value = '';
        }
      });
    });
  }

  /* 근로 계약 정보 설정 — 필수 정보 인라인 검증
   *   - 에러 슬롯: 각 .fm-tbl__value 내부의 [data-empi-ce-err="<key>"] div
   *   - 입력에는 .is-invalid 클래스로 빨간 테두리 (UI Kit 표준)
   *   - 통과 시 true, 실패 시 첫 오류 필드로 스크롤하고 false 반환 */
  function validateEmploymentForm(modal) {
    clearEmploymentErrors(modal);
    const firstInvalid = [];
    const showErr = (key, msg, focusEl) => {
      const slot = modal.querySelector(`[data-empi-ce-err="${key}"]`);
      if (slot) { slot.textContent = msg; slot.hidden = false; }
      if (focusEl) {
        focusEl.classList.add('is-invalid');
        firstInvalid.push(focusEl);
      } else if (slot) {
        firstInvalid.push(slot);
      }
    };

    const startEl = modal.querySelector('[data-empi-ce-contract-start]');
    const endEl   = modal.querySelector('[data-empi-ce-contract-end]');
    const empType = (modal.querySelector('[name="empi-ce-emptype"]:checked') || {}).value || '';
    const indef   = !!(modal.querySelector('[data-empi-ce-indefinite]') || {}).checked;
    const isRegular = empType === 'regular';

    /* 계약기간 — 신규 근로계약 작성 시 기존(유효) 근로계약과 기간이 겹치면 추가 작성 불가.
       (겹치지 않는 이후 기간이면 재계약으로 허용) */
    if (!startEl.value) {
      showErr('period', '계약 시작일을 선택해 주세요.', startEl);
    } else if (!(isRegular && indef)) {
      if (!endEl.value) {
        showErr('period', '계약 종료일을 선택해 주세요.', endEl);
      } else if (endEl.value < startEl.value) {
        showErr('period', '종료일은 시작일 이후로 설정해 주세요.', endEl);
      } else if (CARD_STATE.newContractFlow === 'labor') {
        const dup = findOverlappingContract(CARD_STATE.emp, '근로계약서', startEl.value, endEl.value, false);
        if (dup) showErr('period', `이미 해당 기간에 근로계약서가 존재합니다 (${dup.id}, ${dupPeriodText(dup)}). 기존 계약 종료 이후 기간으로 설정해 주세요.`, startEl);
      }
    } else if (isRegular && indef && CARD_STATE.newContractFlow === 'labor') {
      /* 정규직 무기계약 — 기존 유효 근로계약이 있으면 기간이 겹치므로 추가 작성 불가 */
      const dup = findOverlappingContract(CARD_STATE.emp, '근로계약서', startEl.value, '', true);
      if (dup) showErr('period', `이미 유효한 근로계약서가 존재합니다 (${dup.id}, ${dupPeriodText(dup)}). 기존 계약을 종료한 뒤 작성해 주세요.`, startEl);
    }

    /* 부서는 「근무 정보」에서 관리 — 근로 계약 정보 모달에서 검증하지 않음. */

    /* 근로 유형 */
    if (!empType) {
      showErr('emptype', '근로 유형을 선택해 주세요.');
    }

    /* 도급 회사 — 도급직 선택 시만 */
    if (empType === 'outsourced') {
      const compEl = modal.querySelector('[data-empi-ce-contract-company]');
      if (!compEl.value) showErr('company', '도급 회사를 선택해 주세요.', compEl);
    }

    /* 수습 종료일 — 정규직 + 수습 ON 일 때만 (시작일은 입사일로 강제됨) */
    if (isRegular) {
      const probOn = !!(modal.querySelector('[data-empi-ce-probation]') || {}).checked;
      if (probOn) {
        const probEnd = modal.querySelector('[data-empi-ce-probation-end]');
        if (!probEnd.value) showErr('probend', '수습 종료일을 선택해 주세요.', probEnd);
      }
    }

    /* 사원 유형(사무/생산/연구)·부서·직무·근무지는 「근무 정보」에서 관리 — 근로 계약 정보 모달에서 검증하지 않음.
       근무조/근무시간은 emp.dept 기준으로 자동 파생되므로 별도 검증 불요. */

    const ok = firstInvalid.length === 0;
    if (!ok) {
      const focus = firstInvalid[0];
      if (focus && focus.scrollIntoView) focus.scrollIntoView({ behavior:'smooth', block:'center' });
    }
    return ok;
  }
  function clearEmploymentErrors(modal) {
    modal.querySelectorAll('[data-empi-ce-err]').forEach(s => { s.textContent = ''; s.hidden = true; });
    modal.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
  }

  /* 근로 계약 정보 설정 — '기간의 정함 없음' 토글 적용 */
  function applyIndefiniteEnd(modal, on) {
    const endEl = modal.querySelector('[data-empi-ce-contract-end]');
    if (!endEl) return;
    endEl.disabled = !!on;
    if (on) {
      endEl.value = '';
      endEl.style.background = 'var(--color-surface-alt)';
    } else {
      endEl.style.background = '';
    }
  }

  /* 근로 계약 정보 설정 — 근로 유형 변경 시 sub-row + 상세 정보 가시성 동기화, 근무형태 분기 */
  function wireEmploymentEditDeps(modal) {
    /* 서명 요청 정보 — 근로계약서 종류 미리보기 (텍스트)
     *   · 정규직 + 수습 X            → 정규직 근로계약서
     *   · 정규직 + 수습 O / 계약직 / 일용직 → 기간제 근로계약서 */
    const updateDocType = () => {
      const el = modal.querySelector('[data-empi-ce-doctype-pill]');
      if (!el) return;
      const empType = (modal.querySelector('[name="empi-ce-emptype"]:checked') || {}).value || '';
      const probCb  = modal.querySelector('[data-empi-ce-probation]');
      const isProbation = empType === 'regular' && !!(probCb && probCb.checked);
      const isPermanent = empType === 'regular' && !isProbation;
      el.textContent = isPermanent ? '정규직 근로계약서' : '기간제 근로계약서';
      const hint = modal.querySelector('[data-empi-ce-doctype-hint]');
      if (hint) {
        if (isProbation) {
          const ps = (modal.querySelector('[data-empi-ce-probation-start]') || {}).value || '';
          const pe = (modal.querySelector('[data-empi-ce-probation-end]') || {}).value || '';
          hint.textContent = `수습 기간(${ps || '—'} ~ ${pe || '—'}) 의 기간제 근로계약서로 생성됩니다.`;
        } else if (isPermanent) {
          hint.textContent = '기간의 정함 없는 정규직 근로계약서로 생성됩니다. (수습 계약이 필요하면 위 「수습」을 체크하세요.)';
        } else {
          hint.textContent = '서명 요청 발송 시 이 종류의 근로계약서로 생성됩니다.';
        }
      }
    };
    const sync = () => {
      const v = (modal.querySelector('[name="empi-ce-emptype"]:checked') || {}).value || '';
      const csub   = modal.querySelector('[data-empi-ce-csubtype-wrap]');
      const prob   = modal.querySelector('[data-empi-ce-probation-wrap]');
      const probCb = modal.querySelector('[data-empi-ce-probation]');
      const probP  = modal.querySelector('[data-empi-ce-probation-period]');
      const compR  = modal.querySelector('[data-empi-ce-company-row]');
      const compS  = modal.querySelector('[data-empi-ce-contract-company]');
      const detail = modal.querySelector('[data-empi-ce-detail-wrap]');
      const endEl     = modal.querySelector('[data-empi-ce-contract-end]');
      const indefText = modal.querySelector('[data-empi-ce-indef-text]');
      const indefCb   = modal.querySelector('[data-empi-ce-indefinite]');

      if (csub) csub.style.display = (v === 'contract') ? 'inline-flex' : 'none';
      if (v !== 'contract') {
        const gen = modal.querySelector('[name="empi-ce-csubtype"][value=""]');
        if (gen) gen.checked = true;
      }
      if (prob) prob.style.display = (v === 'regular') ? 'inline-flex' : 'none';
      if (v !== 'regular') {
        if (probCb) probCb.checked = false;
        if (probP)  probP.style.display = 'none';
      }
      if (compR) compR.style.display = (v === 'outsourced') ? '' : 'none';
      if (v !== 'outsourced' && compS) compS.value = '';
      /* 소정 근로시간 · 서명 요청 정보 — 정규/계약/일용직만 노출 (도급직 등 외부 인력은 근로계약서 미작성) */
      const isInternal = ['regular','contract','daily'].indexOf(v) >= 0;
      if (detail) detail.style.display = isInternal ? '' : 'none';   /* hidden 값 보존 컨테이너 — 표시 영향 없음 */
      const signWrap = modal.querySelector('[data-empi-ce-sign-wrap]');
      if (signWrap) signWrap.style.display = isInternal ? '' : 'none';
      /* 계약기간 — 정규직 = 기간의 정함 없음(무기) 자동: 종료일 입력 숨김 + "기간의 정함 없음" 텍스트.
       *   계약직/일용직/외부 = 종료일 입력 노출. */
      const reg = v === 'regular';
      if (endEl)     { endEl.style.display = reg ? 'none' : ''; if (reg) endEl.value = ''; }
      if (indefText) indefText.style.display = reg ? 'inline' : 'none';
      if (indefCb)   indefCb.checked = reg;
      updateDocType();
    };
    modal.querySelectorAll('[name="empi-ce-emptype"]').forEach(r => r.addEventListener('change', sync));

    /* 정규직 = 기간의 정함 없음(무기) 자동 처리 — 별도 체크박스 핸들러 불필요 (sync 가 관리) */

    updateDocType();   /* 초기 1회 */

    const probCb = modal.querySelector('[data-empi-ce-probation]');
    if (probCb) {
      probCb.addEventListener('change', () => {
        const probP = modal.querySelector('[data-empi-ce-probation-period]');
        if (probP) probP.style.display = probCb.checked ? 'inline-flex' : 'none';
        /* 수습 ON → 시작일=입사일 강제. readonly 라 사용자가 수정 불가. 종료일은 시작일+3개월. */
        if (probCb.checked) {
          const emp = CARD_STATE.emp;
          const startEl = modal.querySelector('[data-empi-ce-probation-start]');
          const endEl   = modal.querySelector('[data-empi-ce-probation-end]');
          const joinDate = (emp && emp.joinDate) || '';
          if (startEl) startEl.value = joinDate;
          if (endEl && joinDate && !endEl.value) {
            endEl.value = (typeof addMonths === 'function') ? addMonths(joinDate, 3) : joinDate;
          }
        }
        /* 수습 여부 → 정규직 근로계약서 ↔ 기간제 근로계약서 종류 갱신 */
        updateDocType();
      });
    }
    /* 수습 종료일 변경 시 — 기간제 근로계약서 수습 기간 표시 갱신 */
    const probEndEl = modal.querySelector('[data-empi-ce-probation-end]');
    if (probEndEl) probEndEl.addEventListener('input', updateDocType);

    /* 계약 시작일이 수습 종료일 이후이면 수습 자동 해제 → 정규직 근로계약서로 전환.
       (재계약/추가 작성: 최초 수습이 이미 끝난 뒤 시작하는 근로계약은 수습이 없는 정규직 계약이다.) */
    const ceStartEl = modal.querySelector('[data-empi-ce-contract-start]');
    if (ceStartEl) {
      const autoDropProbation = () => {
        const v = (modal.querySelector('[name="empi-ce-emptype"]:checked') || {}).value || '';
        if (v !== 'regular') return;
        const pc = modal.querySelector('[data-empi-ce-probation]');
        if (!pc || !pc.checked) return;
        const pe = (modal.querySelector('[data-empi-ce-probation-end]') || {}).value || '';
        const s  = ceStartEl.value || '';
        if (pe && s && s > pe) {
          pc.checked = false;
          const probP = modal.querySelector('[data-empi-ce-probation-period]');
          if (probP) probP.style.display = 'none';
          updateDocType();   // 정규직 근로계약서로 갱신
        }
      };
      ceStartEl.addEventListener('change', autoDropProbation);
      ceStartEl.addEventListener('input', autoDropProbation);
    }

    /* 근무형태 (고정/교대) — 영역별 노출 토글.
     *   - 고정: 근무조 row 노출, 근무시간/휴게시간 = 근무조에서 채워진 시·분 표시
     *   - 교대: 근무조 row 숨김, 근무시간/휴게시간 = '교대 근무표에 따름' 안내 텍스트
     *   소정 근로시간/근무일/휴일/연차는 두 모드 동일 (법정 기준 고정값) — 토글 불필요. */
    const setDisp = (sel, mode) => {
      const el = modal.querySelector(sel); if (!el) return;
      el.style.display = mode;
    };
    const syncSchedule = () => {
      const v = (modal.querySelector('[data-empi-ce-worksch]') || {}).value || 'fixed';
      const isFixed = v === 'fixed';
      const isShift = v === 'shift';
      /* 근무조 row 는 통상/교대 모두 노출 — 부서 근무조가 곧 근무조.
         근무시간/휴게: 통상 = 선택 근무조 시간, 교대 = '교대 근무표에 따름'. */
      setDisp('[data-empi-ce-shift-row]',        '');
      setDisp('[data-empi-ce-worktime-fixed]',   isFixed ? 'inline-flex' : 'none');
      setDisp('[data-empi-ce-worktime-shift]',   isShift ? 'inline-block' : 'none');
      setDisp('[data-empi-ce-break-fixed]',      isFixed ? 'inline-flex' : 'none');
      setDisp('[data-empi-ce-break-shift]',      isShift ? 'inline-block' : 'none');
    };

    /* 부서 변경 → 부서 정책 즉시 재적용.
     *   - 근무형태(통상/교대) = 부서 정책 단독 결정 → 텍스트/hidden 갱신 (사용자 선택 없음)
     *   - 근무조 = 부서 근무조로 자동 채움. 코드 2개 이상이면 '근무조 선택' 버튼 노출, 1개 이하면 숨김. */
    const deptSel = modal.querySelector('[data-empi-ce-dept]');
    if (deptSel) {
      deptSel.addEventListener('change', () => {
        const pol = (window.App && App.AttWorkPolicy && App.AttWorkPolicy.deptPolicy)
          ? App.AttWorkPolicy.deptPolicy(deptSel.value) : { regular: true, shift: false };
        const ws = pol.shift ? 'shift' : 'fixed';
        const wsInput = modal.querySelector('[data-empi-ce-worksch]');
        if (wsInput) wsInput.value = ws;
        const wsText = modal.querySelector('[data-empi-ce-worksch-text]');
        if (wsText) wsText.textContent = ws === 'shift' ? '교대근무' : '통상근무';
        applyDeptShiftAuto(modal);
        syncSchedule();
      });
    }

    /* 근무조 선택 버튼 — App.AttShifts.list() 마스터를 보여주고 선택 시 근무·휴게시간 자동 채움 */
    const shiftPickBtn = modal.querySelector('[data-empi-ce-shift-pick]');
    if (shiftPickBtn) {
      shiftPickBtn.addEventListener('click', () => openShiftPickModal());
    }

    /* 사용자가 다시 입력/선택하면 해당 필드 인라인 오류 자동 클리어 */
    const errMap = {
      'data-empi-ce-contract-start': 'period',
      'data-empi-ce-contract-end':   'period',
      'data-empi-ce-indefinite':     'period',
      'data-empi-ce-contract-company': 'company',
      'data-empi-ce-job':            'job',
      'data-empi-ce-site':           'site',
      'data-empi-ce-probation-end':  'probend',
      'data-empi-ce-probation':      'probend',
    };
    const radioErrMap = {
      'empi-ce-emptype': 'emptype',
    };
    const clearOne = (key, el) => {
      const slot = modal.querySelector(`[data-empi-ce-err="${key}"]`);
      if (slot) { slot.textContent = ''; slot.hidden = true; }
      if (el && el.classList) el.classList.remove('is-invalid');
    };
    Object.keys(errMap).forEach(attr => {
      modal.querySelectorAll(`[${attr}]`).forEach(el => {
        const ev = (el.type === 'checkbox' || el.type === 'radio' || el.tagName === 'SELECT') ? 'change' : 'input';
        el.addEventListener(ev, () => clearOne(errMap[attr], el));
      });
    });
    Object.keys(radioErrMap).forEach(name => {
      modal.querySelectorAll(`[name="${name}"]`).forEach(r => {
        r.addEventListener('change', () => clearOne(radioErrMap[name]));
      });
    });
  }

  /* ============ 근무조 선택 모달 (modal-empi-shift-pick) ============
   *   App.AttShifts.list() 마스터를 카드 리스트로 노출.
   *   행 클릭 시 인사정보카드 편집 모달의 근무시간/휴게시간 hidden inputs 채움 + 표시 텍스트 갱신.
   *
   *   호출 흐름:
   *     [근무조 선택] 버튼 → openShiftPickModal() → modal-empi-shift-pick 오픈
   *     → 카드 클릭 → applyShiftPick(shift) → modal-empi-card-edit 의 hidden inputs/표시 갱신 + 모달 close */
  /* 부서에 연결된 근무조 목록. 미설정(빈 목록)이면 전사 기본 근무조로 대체.
     길이 ≥2 → '근무조 선택' 버튼 노출(택1), ≤1 → 자동 확정(버튼 숨김). */
  function deptShiftCodes(dept) {
    const pol = (window.App && App.AttWorkPolicy && App.AttWorkPolicy.deptPolicy)
      ? App.AttWorkPolicy.deptPolicy(dept) : null;
    let codes = (pol && pol.codes) ? pol.codes.slice() : [];
    if (!codes.length && window.App && App.AttShifts && App.AttShifts.globalDefault) {
      const g = App.AttShifts.globalDefault();
      if (g) codes = [g];
    }
    return codes;
  }

  /* 부서 근무조 자동 적용 — 부서 변경 시 근무조를 부서 기본 근무조(없으면 첫 코드)로 채우고,
     '근무조 선택' 버튼은 근무조가 2개 이상일 때만 노출한다. "선택된 근무조 없음" 상태는 만들지 않는다. */
  function applyDeptShiftAuto(modal) {
    if (!modal) return;
    const deptSel = modal.querySelector('[data-empi-ce-dept]');
    const dept = deptSel ? deptSel.value : '';
    const codes = deptShiftCodes(dept);
    const multiCode = codes.length >= 2;
    const pickBtn = modal.querySelector('[data-empi-ce-shift-pick]');
    if (pickBtn) pickBtn.style.display = multiCode ? '' : 'none';
    /* 채울 근무조 — 부서 기본 근무조(사용 코드 내) 우선, 없으면 첫 코드 */
    const dft = (window.App && App.AttWorkPolicy && App.AttWorkPolicy.deptDefaultShift)
      ? App.AttWorkPolicy.deptDefaultShift(dept) : '';
    const code = (dft && codes.indexOf(dft) >= 0) ? dft : (codes[0] || '');
    const s = code && window.App && App.AttShifts && App.AttShifts.get ? App.AttShifts.get(code) : null;
    if (s) {
      setEmpShiftFields(modal, s);
      if (pickBtn) pickBtn.textContent = '근무조 변경';
    } else {
      /* 근무조가 전혀 없는 극단 케이스 — 표시만 비움(경고는 두지 않음) */
      const setVal = (sel, v) => { const el = modal.querySelector(sel); if (el) el.value = v || ''; };
      ['[data-empi-ce-shift-code]','[data-empi-ce-shift-label]','[data-empi-ce-work-start]','[data-empi-ce-work-end]',
       '[data-empi-ce-break-start]','[data-empi-ce-break-end]','[data-empi-ce-break-start2]','[data-empi-ce-break-end2]'].forEach(x => setVal(x, ''));
      const disp = modal.querySelector('[data-empi-ce-shift-display]');
      if (disp) { disp.textContent = '근무조 미설정'; disp.style.color = 'var(--color-text-muted)'; }
    }
  }

  /* 근무조 → 편집 모달 필드 반영 (hidden inputs + 표시 텍스트). close/toast 없음 — 자동/수동 공용. */
  function setEmpShiftFields(modal, shift) {
    if (!modal || !shift) return;
    const setVal = (sel, v) => { const el = modal.querySelector(sel); if (el) el.value = v || ''; };
    setVal('[data-empi-ce-shift-code]',   shift.code);
    setVal('[data-empi-ce-shift-label]',  shift.label || (shift.code + '조'));
    setVal('[data-empi-ce-work-start]',   shift.start);
    setVal('[data-empi-ce-work-end]',     shift.end);
    setVal('[data-empi-ce-break-start]',  shift.breakStart  || '');
    setVal('[data-empi-ce-break-end]',    shift.breakEnd    || '');
    setVal('[data-empi-ce-break-start2]', shift.breakStart2 || '');
    setVal('[data-empi-ce-break-end2]',   shift.breakEnd2   || '');
    const dispEl = modal.querySelector('[data-empi-ce-shift-display]');
    if (dispEl) {
      dispEl.textContent = `${shift.label || (shift.code + '조')}${shift.workHours ? ` (${shift.workHours})` : ''}`;
      dispEl.style.color = 'var(--color-text)';
    }
    const setTxt = (sel, v) => { const el = modal.querySelector(sel); if (el) el.textContent = v || '-'; };
    setTxt('[data-empi-ce-work-start-text]',  shift.start);
    setTxt('[data-empi-ce-work-end-text]',    shift.end);
    const breakTextEl = modal.querySelector('[data-empi-ce-break-text]');
    if (breakTextEl) {
      const b1 = (shift.breakStart && shift.breakEnd) ? `${shift.breakStart} ~ ${shift.breakEnd}` : '-';
      const b2 = (shift.breakStart2 && shift.breakEnd2) ? `, ${shift.breakStart2} ~ ${shift.breakEnd2}` : '';
      breakTextEl.textContent = b1 + b2;
    }
    const errSlot = modal.querySelector('[data-empi-ce-err="shift"]');
    if (errSlot) { errSlot.textContent = ''; errSlot.hidden = true; }
  }

  function openShiftPickModal() {
    let list = (window.App && App.AttShifts && App.AttShifts.list)
      ? App.AttShifts.list() : [];
    /* 부서에 연결된 근무조로 제한 — 그 부서에서 고를 수 있는 근무조만 노출.
       부서는 계약 모달에서 (아직 저장 전) 선택될 수 있으므로 모달의 현재 select 값 우선. */
    const emp = CARD_STATE.emp;
    const editModal = document.getElementById('modal-empi-card-edit');
    const selDept = editModal ? ((editModal.querySelector('[data-empi-ce-dept]') || {}).value || '') : '';
    const deptName = selDept || (emp && emp.dept) || '';
    const codes = deptShiftCodes(deptName);
    if (codes.length) {
      const allow = new Set(codes);
      const filtered = list.filter(s => allow.has(s.code));
      if (filtered.length) list = filtered;
    }
    const host = document.getElementById('empi-shift-pick-list');
    if (!host) return;
    /* 사용자 정의 표 — 근무조 / 출근 / 퇴근 / 근무시간 / 휴게1 / 휴게2 / 선택 버튼 */
    if (!list.length) {
      host.innerHTML = `<p style="color:var(--color-text-muted);text-align:center;padding:24px 0;">등록된 근무조가 없습니다. [근태 > 근무스케줄 현황] 에서 등록 후 다시 시도하세요.</p>`;
    } else {
      const br1 = (s) => (s.breakStart && s.breakEnd) ? `${esc(s.breakStart)}~${esc(s.breakEnd)}` : '<span style="color:var(--color-text-muted);">-</span>';
      const br2 = (s) => (s.breakStart2 && s.breakEnd2) ? `${esc(s.breakStart2)}~${esc(s.breakEnd2)}` : '<span style="color:var(--color-text-muted);">-</span>';
      host.innerHTML = `
        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
        <table class="tbl tbl--hover tbl--striped" style="width:100%;min-width:640px;border-collapse:collapse;">
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
              <tr data-empi-shift-pick-row="${esc(s.code)}" style="cursor:pointer;">
                <td style="text-align:center;font-weight:var(--fw-bold);color:var(--color-brand-primary);">${esc(s.code)}</td>
                <td style="text-align:center;">${esc(s.start)}</td>
                <td style="text-align:center;">${esc(s.end)}</td>
                <td style="text-align:center;">${esc(s.workHours || '-')}</td>
                <td style="text-align:center;">${br1(s)}</td>
                <td style="text-align:center;">${br2(s)}</td>
                <td style="text-align:center;">
                  <button type="button" class="btn btn--xs btn--primary" data-empi-shift-pick-confirm="${esc(s.code)}">선택</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        </div>
      `;
    }
    /* 행/버튼 클릭 위임 — 1회만 바인딩 */
    if (!host.dataset.bound) {
      host.dataset.bound = '1';
      host.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-empi-shift-pick-confirm]')
                 || e.target.closest('[data-empi-shift-pick-row]');
        if (!btn) return;
        const code = btn.dataset.empiShiftPickConfirm || btn.dataset.empiShiftPickRow;
        const shift = (window.App && App.AttShifts && App.AttShifts.get) ? App.AttShifts.get(code) : null;
        if (!shift) return;
        applyShiftPick(shift);
      });
    }
    /* 근로 계약 정보 설정(card-edit, z 1150) 위로. .modal-backdrop--over-oc 의 z-index:1100!important 를
       이기려면 inline 도 !important 로 지정해야 함. */
    const sm = document.getElementById('modal-empi-shift-pick');
    if (sm) sm.style.setProperty('z-index', '1450', 'important');
    openModal('modal-empi-shift-pick');
  }

  /* 선택된 근무조를 인사정보카드 편집 모달의 필드에 반영
     hidden inputs (readCardEditPatch 가 읽음) + 표시 텍스트 + 인라인 오류 클리어.
     휴게시간 2개일 경우 둘 다 반영. */
  function applyShiftPick(shift) {
    const modal = document.getElementById('modal-empi-card-edit');
    if (!modal || !shift) return;
    setEmpShiftFields(modal, shift);
    const pickBtn = modal.querySelector('[data-empi-ce-shift-pick]');
    if (pickBtn) pickBtn.textContent = '근무조 변경';
    closeModal('modal-empi-shift-pick');
    window.toast && window.toast(`${shift.code}조 — 근무·휴게시간 자동 채움`, 'success');
  }

  /* 폼에서 새 값 읽기 — section 별 patch 객체 생성 */
  function readCardEditPatch(modal, sectionKey) {
    if (sectionKey === 'dependents') {
      const raw = (modal.querySelector('[data-empi-dep-count]') || {}).value || '';
      const n = Number(String(raw).replace(/[^0-9.\-]/g, ''));
      return { dependents: { count: Number.isFinite(n) ? n : 0 } };
    }
    if (sectionKey === 'workinfo') {
      const val = (sel) => (modal.querySelector(sel) || {}).value || '';
      const cur = CARD_STATE.emp || {};
      /* 도급직 여부 → 고용 형태 파생. '해당'이면 outsourced + 소속회사·사원 유형, 아니면 초기화.
         '해당 없음'으로 되돌리면 기존 도급 값(outsourced/소속회사)은 비우고, empType 은 미지정('')으로 두어
         이후 근로 계약 정보 설정에서 정규/계약/일용을 지정하도록 한다. */
      const isOut = (modal.querySelector('[name="empi-wi-out"]:checked') || {}).value === '1';
      return {
        site:     val('[data-empi-wi-site]'),
        dept:     val('[data-empi-wi-dept]'),
        rank:     val('[data-empi-wi-rank]'),
        position: val('[data-empi-wi-position]'),
        job:      val('[data-empi-wi-job]'),
        contractOut:     isOut,
        empType:         isOut ? 'outsourced' : (cur.empType === 'outsourced' ? '' : (cur.empType || '')),
        contractCompany: isOut ? val('[data-empi-wi-company]') : '',
        /* 사원 유형(사무/생산/연구) — 도급 여부와 무관하게 항상 라디오 값으로 저장 */
        jobCat:          (modal.querySelector('[name="empi-wi-jobcat"]:checked') || {}).value || (cur.jobCat || ''),
      };
    }
    if (sectionKey === 'worksite') {
      const cur = CARD_STATE.emp || {};
      return {
        site:   (modal.querySelector('[data-empi-ws-site]') || {}).value || '',
        /* 사원 유형(사무/생산/연구) — 근무지와 함께 언제든 수정 가능 */
        jobCat: (modal.querySelector('[name="empi-ws-jobcat"]:checked') || {}).value || (cur.jobCat || ''),
        /* 직위 · 직책 · 직무 — 변경 시 전자결재 승인 필요(저장 핸들러에서 분기). 빈 값은 기존값 유지. */
        rank:     (modal.querySelector('[data-empi-ws-rank]')     || {}).value || (cur.rank || ''),
        position: (modal.querySelector('[data-empi-ws-position]') || {}).value || (cur.position || ''),
        job:      (modal.querySelector('[data-empi-ws-job]')      || {}).value || (cur.job || ''),
      };
    }
    if (sectionKey === 'stdhours') {
      const num = (sel, dft) => {
        const v = (modal.querySelector(sel) || {}).value || '';
        if (v === '') return dft;
        const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
        return Number.isFinite(n) ? n : dft;
      };
      return {
        hoursPerDay:   num('[data-empi-sh-day]',   8),
        hoursPerWeek:  num('[data-empi-sh-week]',  40),
        hoursPerMonth: num('[data-empi-sh-month]', 209),
      };
    }
    if (sectionKey === 'payroll-pay') {
      const val = (sel) => (modal.querySelector(sel) || {}).value || '';
      return {
        bankName:    val('[data-empi-pp-bankname]').trim(),
        bankHolder:  val('[data-empi-pp-bankholder]').trim(),
        bankAccount: val('[data-empi-pp-bankaccount]').trim(),
      };
    }
    if (sectionKey === 'basic') {
      const val   = (sel) => (modal.querySelector(sel) || {}).value || '';
      const radio = (name) => (modal.querySelector(`[name="${name}"]:checked`) || {}).value || '';
      return {
        fname:   val('[data-empi-cb-fname]').trim(),
        gname:   val('[data-empi-cb-gname]').trim(),
        ename:   val('[data-empi-cb-ename]').trim(),
        gender:  radio('empi-cb-gender') || 'M',
        birth:   val('[data-empi-cb-birth]'),
        ssn:     val('[data-empi-cb-ssn]').trim(),
        phone:   val('[data-empi-cb-phone]').trim(),
        email:   val('[data-empi-cb-email]').trim(),
        address: val('[data-empi-cb-address]').trim(),
      };
    }
    if (sectionKey === 'employment') {
      const val   = (sel) => (modal.querySelector(sel) || {}).value || '';
      const radio = (name) => (modal.querySelector(`[name="${name}"]:checked`) || {}).value || '';
      const empType = radio('empi-ce-emptype');
      const csub    = radio('empi-ce-csubtype');
      const probOn  = !!(modal.querySelector('[data-empi-ce-probation]') || {}).checked;
      const isDetailed = ['regular','contract','daily'].indexOf(empType) >= 0;
      const workSchedule = isDetailed ? (val('[data-empi-ce-worksch]') || 'fixed') : '';
      const isFixed = workSchedule === 'fixed';
      const indefiniteOn = !!(modal.querySelector('[data-empi-ce-indefinite]') || {}).checked;
      /* 소정근로시간(hoursPerDay/Week/Month)은 「소정근로시간 정보」 섹션에서 별도 저장 — 근로 계약 저장에서 제외.
         근무일/휴일은 법정 기준 고정값으로 계속 저장. */
      const stdWorkDays    = isDetailed ? 'Mon,Tue,Wed,Thu,Fri' : '';
      const stdHolidayDays = isDetailed ? 'Sat,Sun'             : '';
      /* 근무조 — 통상/교대 모두 선택. (시간은 통상만 채움, 교대는 근무표에 따름) */
      const shiftCode  = isDetailed ? val('[data-empi-ce-shift-code]')  : '';
      const shiftLabel = isDetailed ? val('[data-empi-ce-shift-label]') : '';
      return {
        /* 부서/직무/근무지는 「근무 정보」에서 관리 — 근로 계약 저장에서 제외(덮어쓰지 않음) */
        contractStartDate: val('[data-empi-ce-contract-start]'),
        /* 정규직 + 기간의 정함 없음 → 종료일은 빈 값으로 저장 (무기 계약) */
        contractEndDate:   (empType === 'regular' && indefiniteOn) ? '' : val('[data-empi-ce-contract-end]'),
        empType,
        contractSubType: empType === 'contract' ? csub : '',
        contractOut:     EXTERNAL_EMP_TYPES.indexOf(empType) >= 0,
        contractCompany: empType === 'outsourced' ? val('[data-empi-ce-contract-company]') : '',
        probation:       empType === 'regular' && probOn,
        probationStart:  (empType === 'regular' && probOn) ? val('[data-empi-ce-probation-start]') : '',
        probationEnd:    (empType === 'regular' && probOn) ? val('[data-empi-ce-probation-end]')   : '',
        /* jobCat(사원 유형)·job·site 는 「근무 정보」에서 관리 — 근로 계약 저장에서 제외(덮어쓰지 않음) */
        /* 상세 정보 — 정규/계약/일용직에서만 의미. 그 외는 빈값으로 정리 */
        workSchedule:  isDetailed ? workSchedule : '',
        /* legacy 필드 정리 — 신규 모델은 workSchedule 만으로 판정 */
        scheduleType:  '',
        scheduleUnit:  '',
        /* hoursPerDay/Week/Month 는 「소정근로시간 정보」 섹션에서 별도 저장 — 여기서 건드리지 않음 */
        workDays:      isDetailed ? stdWorkDays    : '',
        holidayDays:   isDetailed ? stdHolidayDays : '',
        /* 근무시간·휴게시간 — 고정만 실값(근무조에서 채워짐), 교대는 빈값.
           휴게시간은 1·2 2개까지 보존 (근무조에 따라 1개 또는 2개) */
        workTimeStart: isFixed ? val('[data-empi-ce-work-start]') : '',
        workTimeEnd:   isFixed ? val('[data-empi-ce-work-end]')   : '',
        breakStart:    isFixed ? val('[data-empi-ce-break-start]')  : '',
        breakEnd:      isFixed ? val('[data-empi-ce-break-end]')    : '',
        breakStart2:   isFixed ? val('[data-empi-ce-break-start2]') : '',
        breakEnd2:     isFixed ? val('[data-empi-ce-break-end2]')   : '',
        /* 근무조 — 고정에서만 의미 */
        shiftCode,
        shiftLabel,
        /* 연차유급휴가 — 항상 법정 기준 고정 */
        annualLeavePolicy: isDetailed ? '근로기준법 및 취업규칙에 따름' : '',
      };
    }
    if (sectionKey === 'wage') {
      const val   = (sel) => (modal.querySelector(sel) || {}).value || '';
      const radio = (name) => (modal.querySelector(`[name="${name}"]:checked`) || {}).value || '';
      const num   = (sel) => {
        const v = val(sel);
        if (!v) return '';
        const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
        return Number.isFinite(n) ? n : '';
      };
      const wageType = radio('empi-cw-wagetype');
      const wageKind = radio('empi-cw-kind');
      const isAM = ['annual','monthly'].indexOf(wageType) >= 0;
      const isHourly = wageType === 'hourly';
      /* 시급제 — 계약 금액 입력칸은 기본 시급. 계약 금액 = 시급 + 주휴수당(시급 20% 절사). */
      const amountRaw     = num('[data-empi-cw-amount]');
      const hourlyWageVal = isHourly ? amountRaw : '';
      const holidayPayVal = isHourly ? Math.floor((Number(amountRaw) || 0) * 0.2) : '';
      const contractAmountVal = isHourly
        ? ((Number(amountRaw) || 0) + Math.floor((Number(amountRaw) || 0) * 0.2))
        : amountRaw;
      /* 기간의 정함 없음 — 체크 시 종료일은 빈 값으로 저장 (무기 계약) */
      const wageIndefinite = !!(modal.querySelector('[data-empi-cw-indefinite]') || {}).checked;
      /* 포괄임금 카테고리별 시간 — 객체로 수집 + 합계 계산 */
      let inclusiveOTHours = null, inclusiveHoursTotal = 0;
      if (isAM && wageKind === 'inclusive') {
        inclusiveOTHours = {};
        INCLUSIVE_OT_CATEGORIES.forEach(c => {
          const v = num(`[data-empi-cw-inch-${c.key}]`);
          if (v) {
            inclusiveOTHours[c.key] = v;
            inclusiveHoursTotal += Number(v) || 0;
          }
        });
      }
      /* 고정 OT 7종 카테고리별 기준시간 — 객체로 수집 + 원시 합계 시간 계산.
       *   지급배율은 법정 가산율 고정이므로 별도 저장하지 않는다. */
      let fixedOTHoursDetail = null, fixedOTRawTotal = 0;
      if (isAM && wageKind === 'fixedOT') {
        fixedOTHoursDetail = {};
        INCLUSIVE_OT_CATEGORIES.forEach(c => {
          const v = num(`[data-empi-cw-foth-${c.key}]`);
          if (v) {
            fixedOTHoursDetail[c.key] = v;
            fixedOTRawTotal += Number(v) || 0;
          }
        });
      }
      return {
        wageContractStartDate: val('[data-empi-cw-start]'),
        wageContractEndDate:   wageIndefinite ? '' : val('[data-empi-cw-end]'),
        wageIndefinite,
        incomeType:    'earned',   /* 소득 유형 필드 제거 — 근로소득 고정 */
        wageType,
        contractAmount: contractAmountVal,
        hourlyWage:      hourlyWageVal,      /* 시급제 기본 시급 (연봉제는 '') */
        holidayAllowance: holidayPayVal,     /* 시급제 주휴수당 = 시급 20% 절사 */
        wageContractKind: isAM ? wageKind : '',
        fixedOTHours:        (isAM && wageKind === 'fixedOT') ? fixedOTRawTotal : '',
        fixedOTHoursDetail:  (isAM && wageKind === 'fixedOT') ? fixedOTHoursDetail : null,
        fixedOTRate:         '',
        inclusiveOTHours,
        inclusiveHours:   (isAM && wageKind === 'inclusive') ? inclusiveHoursTotal : '',
        baseSalary:       isAM ? num('[data-empi-cw-base]') : '',
        fixedOTAmount:    (isAM && wageKind === 'fixedOT')   ? num('[data-empi-cw-fot-amount]') : '',
        inclusiveOTAmount:(isAM && wageKind === 'inclusive') ? num('[data-empi-cw-inc-amount]') : '',
        deductionPolicy:  isAM ? val('[data-empi-cw-deduction]') : '',
        payDay:    num('[data-empi-cw-payday]') || 10,
        payMethod: val('[data-empi-cw-paymethod]') || '계좌이체',
        /* 소정근로시간 — 임금 계약 모달에서 함께 저장 (기본 8/40/209) */
        hoursPerDay:   num('[data-empi-cw-hours-day]')   || 8,
        hoursPerWeek:  num('[data-empi-cw-hours-week]')  || 40,
        hoursPerMonth: num('[data-empi-cw-hours-month]') || 209,
        /* 마스터에서 추가된 지급 항목 — 각 row 에서 코드 + 금액 수집. 금액 0/빈값도 허용 (입력 중간 단계). */
        additionalPayItems: Array.from(modal.querySelectorAll('[data-empi-cw-item-row]')).map(row => {
          const code = row.dataset.empiCwItemRow;
          const amtEl = row.querySelector('[data-empi-cw-item-amount]');
          const amount = amtEl ? Number(String(amtEl.value).replace(/[^0-9]/g, '')) || 0 : 0;
          const meta = (window.App && App.HRPayItem && App.HRPayItem.getByCode) ? App.HRPayItem.getByCode(code) : null;
          return {
            code,
            name: meta ? meta.name : '',
            amount,
            taxType: meta ? meta.taxType : '',
            ordinaryWage: meta ? !!meta.ordinaryWage : false,
            includedInBase: row.dataset.empiCwItemIncl !== '0',  /* 연봉/월급 포함 여부 */
          };
        }),
      };
    }
    /* belonging (조직 정보) — 직위/직책 (부서는 근로 계약 정보에서 지정, 직무는 고용 정보로 이관) */
    return {
      rank:     (modal.querySelector('[data-empi-ce-rank]')     || {}).value || '',
      position: (modal.querySelector('[data-empi-ce-position]') || {}).value || '',
    };
  }

  /* 변경 라벨 — 발령 승인 content 의 사람이 읽기 좋은 한 줄로 포맷 */
  const CARD_EDIT_FIELD_LABEL = {
    empType: '근로 유형', contractSubType: '계약직 세부', contractCompany: '소속회사',
    jobCat: '사원 유형', site: '근무지',
    probation: '수습', probationStart: '수습 시작일', probationEnd: '수습 종료일',
    job: '직무', rank: '직위', dept: '부서', position: '직책',
    contractStartDate: '계약 시작일', contractEndDate: '계약 종료일',
    workSchedule: '근무형태', scheduleType: '스케줄 유형', scheduleUnit: '스케줄 적용 단위',
    hoursPerDay: '소정근로시간(1일)', hoursPerWeek: '소정근로시간(1주)', hoursPerMonth: '소정근로시간(월)',
    workDays: '근무일', workTimeStart: '근무 시작 시간', workTimeEnd: '근무 종료 시간',
    breakStart: '휴게 시작 시간', breakEnd: '휴게 종료 시간',
    holidayDays: '휴일', annualLeavePolicy: '연차유급휴가',
    /* 임금 계약 정보 */
    wageContractStartDate: '임금 계약 시작일', wageContractEndDate: '임금 계약 종료일',
    wageIndefinite: '기간의 정함 없음',
    incomeType: '소득 유형', wageType: '임금 유형', contractAmount: '계약 금액',
    wageContractKind: '임금 계약 유형', fixedOTHours: '고정 OT 기준 시간', fixedOTRate: '고정 OT 지급배율',
    fixedOTHoursDetail: '고정 OT 기준 시간 내역',
    inclusiveHours: '포괄계약 근로시간', inclusiveOTHours: '포괄계약 시간 내역',
    baseSalary: '월 기본급', fixedOTAmount: '월 고정연장근무수당', inclusiveOTAmount: '월 고정연장근무수당',
    deductionPolicy: '공제 안내', payDay: '임금 지급일', payMethod: '임금 지급방법',
  };
  function formatCardEditValue(field, v) {
    if (field === 'empType')         return EMP_TYPE_LABEL[v] || (v || '미지정');
    if (field === 'contractSubType') return CONTRACT_SUB_LABEL[v] || (v || '일반');
    if (field === 'jobCat')          return JOB_CAT_LABEL[v] || (v || '미지정');
    if (field === 'probation')       return v ? '적용' : '미적용';
    if (field === 'incomeType')      return INCOME_TYPE_LABEL[v] || (v || '미지정');
    if (field === 'wageType')        return WAGE_TYPE_LABEL[v] || (v || '미지정');
    if (field === 'wageContractKind')return WAGE_KIND_LABEL[v] || (v || '미지정');
    if (['contractAmount','baseSalary','fixedOTAmount','inclusiveOTAmount'].indexOf(field) >= 0) {
      return v ? `${formatMoney(v)}원` : '-';
    }
    if (field === 'wageIndefinite')  return v ? '적용' : '미적용';
    if (field === 'inclusiveOTHours' || field === 'fixedOTHoursDetail') {
      if (!v || typeof v !== 'object') return '-';
      const parts = INCLUSIVE_OT_CATEGORIES
        .map(c => v[c.key] ? `${c.label} ${v[c.key]}h` : '')
        .filter(Boolean);
      return parts.length ? parts.join(' · ') : '-';
    }
    return v || '-';
  }
  /* 카드 본문 — 고정 OT 7종 카테고리별 기준시간 한 줄 요약 (HTML, 가산시간 작은 글씨) */
  function formatFixedOTBreakdown(emp) {
    const map = emp.fixedOTHoursDetail || {};
    const fmt = (n) => Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
    const parts = INCLUSIVE_OT_CATEGORIES.map(c => {
      const h = Number(map[c.key] || 0);
      if (!h) return '';
      const weighted = h * c.rate;
      return `<span style="display:inline-block;margin-right:10px;"><span style="color:var(--color-text-muted);">${esc(c.label)}</span> <strong>${fmt(h)}h</strong><span style="color:var(--color-text-muted);"> × ${c.rate.toFixed(1)}배 = ${fmt(weighted)}h</span></span>`;
    }).filter(Boolean);
    return parts.length ? parts.join('') : '';
  }
  /* 카드 본문 — 포괄임금 카테고리별 시간 한 줄 요약 (HTML, 가산시간 작은 글씨) */
  function formatInclusiveOTBreakdown(emp) {
    const map = emp.inclusiveOTHours || {};
    const fmt = (n) => Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
    const parts = INCLUSIVE_OT_CATEGORIES.map(c => {
      const h = Number(map[c.key] || 0);
      if (!h) return '';
      const weighted = h * c.rate;
      return `<span style="display:inline-block;margin-right:10px;"><span style="color:var(--color-text-muted);">${esc(c.label)}</span> <strong>${fmt(h)}h</strong><span style="color:var(--color-text-muted);"> × ${c.rate.toFixed(1)}배 = ${fmt(weighted)}h</span></span>`;
    }).filter(Boolean);
    return parts.length ? parts.join('') : '';
  }

  /* 발령 종류 자동 판정 — 부서 변경=전보, 직위 상승=승진, 그 외=null (시스템 승인만 등록) */
  function decideAppointmentKind(emp, patch) {
    if ('dept' in patch && patch.dept && patch.dept !== emp.dept) return '전보';
    if ('rank' in patch && patch.rank && patch.rank !== emp.rank) {
      /* MASTER.ranks 는 상위(idx 0 = 대표이사) → 하위 순서. idx 가 작아지면 승진. */
      const fromIdx = MASTER.ranks.indexOf(emp.rank);
      const toIdx   = MASTER.ranks.indexOf(patch.rank);
      if (fromIdx >= 0 && toIdx >= 0 && toIdx < fromIdx) return '승진';
    }
    /* 근로 유형(신분) 변경 = 발령. 정규직 전환 / 그 외 근로유형 변경 */
    if ('empType' in patch && patch.empType && patch.empType !== emp.empType) {
      return patch.empType === 'regular' ? '정규직 전환' : '근로유형 변경';
    }
    return null;
  }

  function bindCardEditModal() {
    injectCardEditModal();
    const modal = document.getElementById('modal-empi-card-edit');
    if (!modal) return;
    if (modal.dataset.bound === '1') return;
    modal.dataset.bound = '1';
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-modal-close]')) {
        CARD_STATE.externalOnSaved = null;   /* 저장 없이 닫으면 외부 콜백 폐기 */
        CARD_STATE.externalDirectApply = false;
        CARD_STATE.newContractFlow = null;   /* [+계약서 작성] 흐름 취소 */
        closeModal('modal-empi-card-edit');
        return;
      }
      if (!e.target.closest('[data-empi-cedit-save]')) return;
      const emp = CARD_STATE.emp;
      const section = CARD_STATE.editSection;
      if (!emp || !section) { closeModal('modal-empi-card-edit'); return; }

      /* 필수 정보 인라인 검증 — 섹션별 검증 함수 호출.
       *   실패 시 더 진행하지 않고 사용자가 잘못된 필드를 수정하도록 유도. */
      if (section === 'employment' && !validateEmploymentForm(modal)) return;
      if (section === 'wage'       && !validateWageForm(modal))       return;
      if (section === 'stdhours') {
        const n = (sel) => Number(String((modal.querySelector(sel) || {}).value || '').replace(/[^0-9.\-]/g, ''));
        if (!(n('[data-empi-sh-day]') > 0 && n('[data-empi-sh-week]') > 0 && n('[data-empi-sh-month]') > 0)) {
          const slot = modal.querySelector('[data-empi-sh-err]');
          if (slot) { slot.textContent = '1일 / 1주 / 월 소정근로시간을 모두 입력해 주세요.'; slot.hidden = false; }
          return;
        }
      }
      if (section === 'workinfo') {
        const v = (sel) => (modal.querySelector(sel) || {}).value || '';
        if (!(v('[data-empi-wi-site]') && v('[data-empi-wi-dept]') && v('[data-empi-wi-rank]') && v('[data-empi-wi-position]') && v('[data-empi-wi-job]'))) {
          const slot = modal.querySelector('[data-empi-wi-err]');
          if (slot) { slot.textContent = '근무지 · 부서 · 직위 · 직책 · 직무를 모두 선택해 주세요.'; slot.hidden = false; }
          return;
        }
        let reqOk = true;
        /* 사원 유형(사무/생산/연구) — 도급 여부와 무관하게 항상 필수 */
        const jcSlot = modal.querySelector('[data-empi-wi-jobcat-err]');
        if (!modal.querySelector('[name="empi-wi-jobcat"]:checked')) {
          if (jcSlot) { jcSlot.textContent = '사원 유형을 선택해 주세요.'; jcSlot.hidden = false; }
          reqOk = false;
        } else if (jcSlot) { jcSlot.hidden = true; }
        /* 도급직=해당 → 소속회사 필수 */
        const isOut = (modal.querySelector('[name="empi-wi-out"]:checked') || {}).value === '1';
        if (isOut) {
          const compSlot = modal.querySelector('[data-empi-wi-company-err]');
          if (!v('[data-empi-wi-company]')) {
            if (compSlot) { compSlot.textContent = '소속회사를 선택해 주세요.'; compSlot.hidden = false; }
            reqOk = false;
          } else if (compSlot) { compSlot.hidden = true; }
        }
        if (!reqOk) return;
        /* 근무 정보 등록 확인 — 도급직 여부는 등록 후 수정할 수 없으므로 한 번 더 확인 */
        if (!CARD_STATE._workinfoConfirmed) {
          const proceed = () => {
            CARD_STATE._workinfoConfirmed = true;
            const btn = modal.querySelector('[data-empi-cedit-save]');
            if (btn) btn.click();
          };
          const msg = '도급직 여부는 등록 후 수정할 수 없습니다. 이대로 저장하시겠습니까?';
          if (window.sweet) {
            window.sweet({ icon:'warn', title:'도급직 여부 확인', text: msg, cancelText:'취소', confirmText:'저장', onConfirm: proceed });
          } else if (confirm(msg)) {
            proceed();
          }
          return;
        }
      }
      if (section === 'basic') {
        /* 성/이름은 필수 — 둘 다 비면 저장 중단(인라인 표시 대신 토스트로 간단 안내) */
        const fn = (modal.querySelector('[data-empi-cb-fname]') || {}).value || '';
        const gn = (modal.querySelector('[data-empi-cb-gname]') || {}).value || '';
        if (!fn.trim() && !gn.trim()) {
          window.toast && window.toast('성명을 입력해 주세요.', 'warning');
          return;
        }
      }

      /* [+ 계약서 작성] 2단계 흐름 — 설정 모달 완료 시 결재 없이 즉시 반영 후
         계약서 서명 요청 오버레이(editor)로 체이닝. (근로/임금 공통) */
      if (CARD_STATE.newContractFlow && (section === 'employment' || section === 'wage')) {
        const patchNC = readCardEditPatch(modal, section);
        Object.keys(patchNC).forEach(k => { emp[k] = patchNC[k]; });
        if (typeof normalizeStatus === 'function') normalizeStatus(emp);
        if (typeof applyFilter === 'function') applyFilter();
        if (typeof renderTable === 'function') renderTable();
        renderCardHeader(); renderCardBody();
        const flowKind = CARD_STATE.newContractFlow;
        CARD_STATE.newContractFlow = null;
        closeModal('modal-empi-card-edit');
        const docKind = flowKind === 'wage' ? '임금계약서' : '근로계약서';
        if (window.App && App.HRContract && typeof App.HRContract.openEditorOverlay === 'function') {
          App.HRContract.openEditorOverlay(emp, docKind);
        } else {
          window.toast && window.toast('계약 관리 모듈을 불러올 수 없습니다.', 'danger');
        }
        return;
      }

      const SECTION_LABEL_MAP = {
        employment: '근로 계약 정보',
        wage:       '임금 계약 정보',
        stdhours:   '소정근로시간 정보',
        dependents: '부양가족 정보',
        workinfo:   '근무 정보',
        worksite:   '근무 정보',
        belonging:  '조직 정보',
        basic:      '신상 정보',
        'payroll-pay': '지급 정보',
      };
      const sectionLabel = SECTION_LABEL_MAP[section] || '정보';
      const patch = readCardEditPatch(modal, section);

      /* 변경된 필드만 추출. 변경이 있을 때만 후속 흐름 진입.
       *   - 변경 없음 → [완료] 클릭은 그냥 닫기 (별도 알림 없음)
       *   - 변경 있음 → 작성 상태에 따라 분기 (아래)
       *   오브젝트 필드(inclusiveOTHours 등)는 JSON 직렬화로 비교. */
      const eqPatch = (a, b) => {
        if (a === b) return true;
        if ((typeof a === 'object' && a !== null) || (typeof b === 'object' && b !== null)) {
          return JSON.stringify(a || null) === JSON.stringify(b || null);
        }
        return (a || '') === (b || '');
      };
      let diffs = Object.keys(patch).filter(k => !eqPatch(patch[k], emp[k]));
      if (diffs.length === 0) {
        closeModal('modal-empi-card-edit');
        return;
      }

      /* 근무 정보 수정(worksite) — 채널 분리:
       *   · 근무지 · 사원 유형(site/jobCat) → 결재 없이 즉시 반영
       *   · 직위 · 직책 · 직무(rank/position/job) → 전자결재 승인 후 반영
       *   직접 반영분은 먼저 적용하고, 승인 대상만 남겨 아래 승인 경로로 흘려보낸다. */
      if (section === 'worksite') {
        const APPROVAL_KEYS = ['rank', 'position', 'job'];
        const directDiffs   = diffs.filter(k => APPROVAL_KEYS.indexOf(k) < 0);
        const approvalDiffs = diffs.filter(k => APPROVAL_KEYS.indexOf(k) >= 0);

        /* 근무지 · 사원 유형은 즉시 반영 */
        directDiffs.forEach(k => { emp[k] = patch[k]; });

        if (!approvalDiffs.length) {
          /* 직위 · 직책 · 직무 변경 없음 → 즉시 반영으로 종료 */
          if (typeof normalizeStatus === 'function') normalizeStatus(emp);
          if (typeof applyFilter === 'function') applyFilter();
          if (typeof renderTable === 'function') renderTable();
          renderCardHeader(); renderCardBody();
          closeModal('modal-empi-card-edit');
          window.toast && window.toast('근무 정보가 변경되었습니다.', 'success');
          return;
        }

        /* 직위 · 직책 · 직무 변경 → 승인 경로. 직접 반영분은 카드에 먼저 갱신. */
        if (directDiffs.length) { renderCardHeader(); renderCardBody(); }
        diffs = approvalDiffs;   /* 아래 승인 모달은 직위 · 직책 · 직무만 대상으로 한다 */
      }

      /* 결재 우회 vs 변경 승인 분기 — 정책:
       *   · 작성중 상태(필수 정보 미완)에서 저장 → 어떤 필드든 결재 없이 직접 저장 (draft 단계)
       *   · 작성완료 상태에서 저장 → 어떤 변경이든 변경 승인 요청 모달 진입
       *   판정은 isContractInfoComplete / isWageInfoComplete 만으로 단순화. */
      const wasComplete = section === 'employment' ? isContractInfoComplete(emp)
                       : section === 'wage'       ? isWageInfoComplete(emp)
                       : true;
      /* 조직 정보(belonging) — 최초 등록(부서·직위·직책 미설정)일 때만 직접 저장.
       *   이미 설정된 경우 카드에 편집 버튼이 없으므로 이 경로로 진입하지 않으며,
       *   변경은 발령(발령 관리)으로만 처리된다. */
      const orgWasSet = !!(emp.rank && emp.position);
      /* directApply — 계약 관리 개별 작성에서 편집한 경우 결재 없이 즉시 반영.
         단, 근로 유형(신분) 변경은 '발령'이므로 즉시 반영하지 않고 승인 요청 경로로 보낸다. */
      const empTypeChanged = section === 'employment' && diffs.indexOf('empType') >= 0;
      const directApply = !!CARD_STATE.externalDirectApply && !empTypeChanged;
      const bypass = ((section === 'employment' || section === 'wage') && !wasComplete)
                  || (section === 'belonging' && !orgWasSet)
                  || section === 'basic'         /* 신상 정보 — 인사담당자 권한으로 결재 없이 직접 저장 */
                  || section === 'payroll-pay'   /* 지급 정보(계좌) — 동일하게 직접 저장 */
                  || section === 'stdhours'      /* 소정근로시간 정보 — 결재 없이 직접 저장 */
                  || section === 'workinfo'      /* 근무 정보 최초 등록 — 결재 없이 직접 저장 */
                  || section === 'dependents'    /* 부양가족 정보 — 인사담당자 직접 적용 */
                  || directApply;

      if (bypass) {
        diffs.forEach(k => { emp[k] = patch[k]; });
        /* 성/이름 수정 시 표시용 통합 name 동기화 (그리드·헤더가 emp.name / displayName 사용) */
        if (section === 'basic' && (diffs.indexOf('fname') >= 0 || diffs.indexOf('gname') >= 0)) {
          emp.name = displayName(emp);
        }
        if (typeof normalizeStatus === 'function') normalizeStatus(emp);
        if (typeof applyFilter === 'function') applyFilter();
        if (typeof renderTable === 'function') renderTable();
        renderCardHeader(); renderCardBody();
        closeModal('modal-empi-card-edit');
        /* 외부(계약 관리 개별 작성) 콜백 — 즉시 반영된 값으로 계약서 미리보기/페이지 재렌더 */
        if (CARD_STATE.externalOnSaved) {
          const cb = CARD_STATE.externalOnSaved;
          CARD_STATE.externalOnSaved = null;
          CARD_STATE.externalDirectApply = false;
          try { cb(emp, section); } catch (_) {}
        }
        if (section === 'belonging') {
          window.toast && window.toast('조직 정보가 등록되었습니다. 이후 변경은 발령으로 처리됩니다.', 'success');
        } else if (section === 'basic') {
          window.toast && window.toast('신상 정보가 저장되었습니다.', 'success');
        } else if (section === 'payroll-pay') {
          window.toast && window.toast('지급 정보가 저장되었습니다.', 'success');
        } else if (section === 'stdhours') {
          window.toast && window.toast('소정근로시간 정보가 저장되었습니다.', 'success');
        } else if (section === 'dependents') {
          window.toast && window.toast('부양가족 정보가 적용되었습니다.', 'success');
        } else if (section === 'workinfo') {
          window.toast && window.toast('근무 정보가 등록되었습니다.', 'success');
        } else {
          const nowComplete = section === 'employment' ? isContractInfoComplete(emp) : isWageInfoComplete(emp);
          const msg = directApply ? `${sectionLabel}가 반영되었습니다.`
                    : nowComplete ? `${sectionLabel} 작성이 완료되었습니다.` : `${sectionLabel} 저장되었습니다.`;
          window.toast && window.toast(msg, 'success');
        }
        return;
      }

      /* 발령 모듈이 로드되지 않은 환경 — 폴백으로 직접 저장 (개발 편의용) */
      const hasApprovalModal = !!(window.App && typeof App.openSystemApprovalModal === 'function');
      if (!hasApprovalModal) {
        diffs.forEach(k => { emp[k] = patch[k]; });
        if (typeof normalizeStatus === 'function') normalizeStatus(emp);
        if (typeof applyFilter === 'function') applyFilter();
        if (typeof renderTable === 'function') renderTable();
        renderCardHeader(); renderCardBody();
        closeModal('modal-empi-card-edit');
        window.toast && window.toast(`${sectionLabel} 저장 완료 (결재 모듈 미연결)`, 'warning');
        return;
      }

      /* 시스템 발령 승인 모달 호출 — 발령 모달 위로 띄우기 위해 편집 모달은 잠시 숨김 */
      const kind = decideAppointmentKind(emp, patch);
      const matCode = kind || '정보 변경';
      const contentLines = [
        `· 대상자: ${displayName(emp)} (${emp.id}, ${emp.dept || '-'})`,
        `· 변경 섹션: ${sectionLabel}`,
        '',
        '[변경 내역]',
      ].concat(diffs.map(k => {
        const label = CARD_EDIT_FIELD_LABEL[k] || k;
        const before = formatCardEditValue(k, emp[k]);
        const after  = formatCardEditValue(k, patch[k]);
        return `· ${label}: ${before} → ${after}`;
      }));

      /* 결재 모달은 body 후순위로 append 되어 같은 z-index 에서 자동 오버레이 — 부모 모달을
       *   visibility:hidden 으로 잠시 가리던 기존 트릭은 stale inline-style 로 다음 액션을
       *   가로채는 버그를 일으켰음 → 별도 hide 없이 진행. */
      App.openSystemApprovalModal({
        docName: '인사정보 변경',
        zIndex: 1450,   /* 근로/임금 계약 정보 편집 모달(1150) 위로 — 계약 관리 개별 작성/카드 모두 동일 */
        titlePrefix: `${sectionLabel} 변경`,
        codeLabel: '발령 유형',
        nameLabel: '대상자',
        matCode,
        matName: `${displayName(emp)} (${emp.id})`,
        customReasons: ['정기 인사', '수시 인사', '조직 개편', '기타'],
        defaultReason: '수시 인사',
        defaultApprovers: [],
        title: `${sectionLabel} 변경 승인 요청 — ${displayName(emp)}`,
        content: contentLines.join('\n'),
        attachments: [],
        payload: { empId: emp.id, section, patch, kind },
        onSubmit() {
          /* 결재 요청 접수 — 실제 emp 데이터는 결재 완료 시점에 적용된다.
           *   본 화면에서는 변경 사항을 직접 mutate 하지 않고, 발령 row 만 pending 상태로
           *   기록한다(승인이 떨어지면 발령 관리 화면에서 'done' 으로 전이되며 emp 도 갱신). */
          if (kind && window.App && App.HRAppoint && typeof App.HRAppoint.addAppointment === 'function') {
            const seq = String(Date.now()).slice(-4);
            const stamp = (new Date()).toISOString().slice(0,16).replace('T',' ');
            let content;
            if (kind === '전보') {
              content = {
                text: `${emp.dept || '-'} → ${patch.dept}`,
                fromDept: emp.dept, toDept: patch.dept,
                toRank: patch.rank || emp.rank, toPosition: patch.position || emp.position,
              };
            } else if (kind === '승진') {
              content = {
                text: `${emp.rank || '-'} → ${patch.rank}`,
                toDept: patch.dept || emp.dept, toRank: patch.rank,
                toPosition: patch.position || emp.position,
              };
            } else { /* 정규직 전환 / 근로유형 변경 */
              content = {
                text: `${EMP_TYPE_LABEL[emp.empType] || emp.empType || '-'} → ${EMP_TYPE_LABEL[patch.empType] || patch.empType}`,
                toDept: emp.dept, toRank: emp.rank, toPosition: emp.position, toEmpType: patch.empType,
              };
            }
            App.HRAppoint.addAppointment({
              id: `APT-2026-${seq}`,
              kind,
              empId: emp.id,
              empName: displayName(emp),
              empDept: emp.dept,
              empRank: emp.rank,
              empJob:  emp.job,
              empPosition: emp.position,
              content,
              contentText: content.text,
              effectDate: stamp.slice(0,10),
              status: 'pending',
              registeredBy: '정혜진',
              registeredAt: stamp,
            });
          }
          /* 결재 대기 상태 표시 — 해당 섹션에 [승인 대기중] 뱃지 노출.
           *   실제 데이터 반영은 결재 완료 시점에 외부 모듈이 수행 (현 단계는 시그널만 기록). */
          if (section === 'employment') emp.contractApprovalPending = true;
          if (section === 'wage')       emp.wageApprovalPending     = true;
          if (section === 'employment' || section === 'wage') renderCardBody();
          closeModal('modal-empi-card-edit');
          /* 외부(계약 관리 개별 작성 페이지)에서 편집 모달을 띄운 경우 — 해당 화면 재렌더 콜백 실행 */
          if (CARD_STATE.externalOnSaved) {
            const cb = CARD_STATE.externalOnSaved;
            CARD_STATE.externalOnSaved = null;
            CARD_STATE.externalDirectApply = false;
            try { cb(emp, section); } catch (_) {}
          }
          window.toast && window.toast(`${sectionLabel} 변경 승인 요청이 접수되었습니다. 결재 완료 후 반영됩니다.`, 'success');
        },
      });
    });
  }

  /* --- 외부 노출 API — 다른 화면에서 동일하게 호출 가능 --- */
  App.HRInfoMgmtModal = {
    open: openCardModal,
    close: () => closeModal('modal-empi-card'),
  };

  /* ============ SCR-EMP-02 개별 등록 ============ */
  function fillSelect(id, options, withEmpty = true) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = (withEmpty ? '<option value="">선택</option>' : '') +
      options.filter(o => o).map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
  }
  /* 부서 콤보박스 — 본부·팀·파트 구분을 prefix 로 표기한 평탄 옵션으로 노출.
   *   기존 자재 신청 dropdown 컴포넌트 (App.Components.attachCombo) 재사용.
   *   - Korean 초성 검색 지원 (예: 'ㄱㅇㅈㅇ' → '경영지원본부')
   *   - placeholder/검색 UI 동일 */
  function deptComboOptions() {
    return MASTER.depts.filter(d => d).map(name => {
      const cat = /본부$/.test(name) ? '[본부]'
                : /파트$/.test(name) ? '[파트]'
                : /팀$/.test(name)   ? '[팀]'
                : '';
      return { value: name, label: cat ? `${cat} ${name}` : name };
    });
  }
  let _deptCombo = null;
  function setupDeptCombo() {
    const host = document.getElementById('empi-c-dept');
    if (!host) return;
    if (!(window.App && App.Components && App.Components.attachCombo)) return;
    /* 모달 재오픈 시 동일 host 에 다시 attach 되는데, attachCombo 내부에서
     *   기존 핸들러를 그대로 재사용하므로 중복 부착 방지 — instance 가 있으면 재초기화만. */
    if (_deptCombo) {
      _deptCombo.setOptions(deptComboOptions());
      _deptCombo.setValue('');
    } else {
      _deptCombo = App.Components.attachCombo(host, {
        placeholder: '선택',
        searchPlaceholder: '본부·팀·파트 검색',
        options: deptComboOptions(),
        value: '',
      });
    }
  }
  /* 등록 모달 — 근로/임금 계약 입력용 합성 emp. 재사용 render/wire 함수가 emp 파라미터 +
     CARD_STATE.emp 를 읽으므로 등록 세션 동안 이 객체를 CARD_STATE.emp 로 지정한다.
     (등록 모달은 인사카드가 열려있지 않은 상태에서 진입 → CARD_STATE 덮어써도 안전. 다음 카드 오픈 시 재설정됨) */
  let _createEmp = null;
  function newCreateEmp() {
    return {
      id: '(신규)', joinDate: '', empType: '', contractSubType: '',
      contractStartDate: '', contractEndDate: '', probation: false, probationStart: '', probationEnd: '',
      dept: '', site: '', job: '', rank: '', position: '',
      wageType: '', contractAmount: '', wageContractStartDate: '', wageContractEndDate: '',
    };
  }
  /* 근로/임금 계약 body 를 인사카드 설정 폼(renderCardEditEmployment / renderCardEditWage)으로 렌더 + 와이어링.
     매 오픈/재렌더마다 innerHTML 을 새로 써서 이전 리스너를 폐기 노드와 함께 정리한다. */
  function renderCreateLaborBody(modal) {
    const host = modal.querySelector('[data-empi-c-labor-body]');
    if (!host) return;
    host.innerHTML = renderCardEditEmployment(_createEmp);
    wireEmploymentEditDeps(modal);
    lockCreateContractStart(modal);
    /* 수습 종료일 = 입사일 + 3개월 자동, 편집 불가 (수습 시작일은 렌더에서 이미 readonly) */
    const pe = host.querySelector('[data-empi-ce-probation-end]');
    if (pe) {
      pe.readOnly = true;
      pe.style.background = 'var(--color-surface-alt)';
      pe.title = '수습 종료일은 입사일로부터 3개월로 자동 설정됩니다.';
    }
  }
  function renderCreateWageBody(modal) {
    const host = modal.querySelector('[data-empi-c-wage-body]');
    if (!host) return;
    host.innerHTML = renderCardEditWage(_createEmp);
    wireWageEditDeps(modal);
    stripWageExtras(host);
    lockCreateContractStart(modal);
  }
  /* 임직원 등록의 임금 계약 정보에서는 '지급 정보(지급일/방법)'와 '공제 안내'를 노출하지 않는다.
     (재사용한 임금 계약 설정 폼에서 해당 노드만 제거 — 값은 저장 시 기본값으로 대체) */
  function stripWageExtras(host) {
    /* 공제 안내 — 입력이 속한 fm-tbl 블록(+ 감싼 margin 래퍼) 제거 */
    const ded = host.querySelector('[data-empi-cw-deduction]');
    if (ded) {
      const tbl = ded.closest('.fm-tbl');
      const wrap = tbl && tbl.parentElement;
      (wrap && wrap.children.length === 1 ? wrap : tbl || ded).remove();
    }
    /* 지급 정보 — 지급일/방법 fm-tbl + 바로 앞 섹션 구분선 제거 */
    const pay = host.querySelector('[data-empi-cw-payday]');
    if (pay) {
      const tbl = pay.closest('.fm-tbl');
      const divider = tbl && tbl.previousElementSibling;
      if (divider) divider.remove();
      if (tbl) tbl.remove();
    }
  }
  function renderCreateContractBodies() {
    const modal = document.getElementById('modal-empi-create');
    if (!modal) return;
    CARD_STATE.emp = _createEmp;
    CARD_STATE.contractEditLockType = false;
    CARD_STATE.newContractFlow = null;
    renderCreateLaborBody(modal);
    renderCreateWageBody(modal);
  }
  /* 계약 시작일 = 입사일 (편집 불가) — 근로/임금 시작일 모두 readonly + 입사일 값 동기화 */
  function lockCreateContractStart(modal) {
    const join = (modal.querySelector('#empi-c-joindate') || {}).value || '';
    ['[data-empi-ce-contract-start]', '[data-empi-cw-start]'].forEach(sel => {
      const el = modal.querySelector(sel);
      if (!el) return;
      el.value = join;
      el.readOnly = true;
      el.style.background = 'var(--color-surface-alt)';
      el.title = '계약 시작일은 입사일과 동일합니다.';
    });
  }
  /* 도급직 여부 → 근로/임금 계약 섹션 표시 토글 (도급직은 근로/임금 계약 없음) */
  function toggleCreateContractSections(modal) {
    const isOut = (modal.querySelector('[name="empi-c-outsourced"]:checked') || {}).value === '1';
    const laborSec = modal.querySelector('#empi-c-labor-section');
    const wageSec  = modal.querySelector('#empi-c-wage-section');
    if (laborSec) laborSec.style.display = isOut ? 'none' : '';
    if (wageSec)  wageSec.style.display  = isOut ? 'none' : '';
  }
  /* 섹션 표시/재렌더로 본문 높이가 바뀔 때 스크롤이 맨 위로 튀지 않도록 —
     기준 요소(사용자가 조작한 컨트롤)의 화면상 위치를 토글 전후 동일하게 유지한다. */
  function preserveDetailScroll(modal, anchorEl, fn) {
    const body = modal.querySelector('.empi-create-detail__body');
    const has = anchorEl && typeof anchorEl.getBoundingClientRect === 'function';
    const before = has ? anchorEl.getBoundingClientRect().top : 0;
    fn();
    if (body && has) {
      const after = anchorEl.getBoundingClientRect().top;
      body.scrollTop += (after - before);
    }
  }

  function openCreateModal() {
    /* 모달 첫 사용 시점 동적 주입 — index.html 에 markup 두지 않고 페이지 자체에서 관리 */
    injectCreateModal();
    _createEmp = newCreateEmp();
    setupDeptCombo();
    fillSelect('empi-c-job',      MASTER.jobs);
    fillSelect('empi-c-rank',     MASTER.ranks);
    fillSelect('empi-c-position', MASTER.positions);
    ['empi-c-fname','empi-c-gname','empi-c-birth','empi-c-phone','empi-c-email','empi-c-ename','empi-c-joindate',
     'empi-c-zipcode','empi-c-address-base','empi-c-address-detail']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    /* 부서 콤보박스는 setupDeptCombo() 가 value:'' 로 초기화. 나머지 select 만 reset */
    ['empi-c-job','empi-c-rank','empi-c-position','empi-c-site','empi-c-contract-company']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    /* 고용 형태 / 직군 — 기본 선택 없음. 사용자가 명시적으로 선택해야 함. */
    document.querySelectorAll('[name="empi-c-emptype"]').forEach(el => { el.checked = false; });
    document.querySelectorAll('[name="empi-c-jobcat"]').forEach(el => { el.checked = false; });
    const flip = document.getElementById('empi-c-name-flip'); if (flip) flip.checked = false;
    /* 아코디언 상태 초기화 — 매 오픈 시 필수 정보 펼침 / 선택 정보 접힘.
     *   chevron: 펼침=90도 회전(⌄), 접힘=0도(>) */
    const modal = document.getElementById('modal-empi-create');
    if (modal) {
      const accs = modal.querySelectorAll('[data-empi-acc]');
      accs.forEach((acc, idx) => {
        const isFirst = idx === 0;
        const body = acc.querySelector('[data-empi-acc-body]');
        const chev = acc.querySelector('[data-empi-acc-chev]');
        if (isFirst) {
          acc.classList.add('is-open');
          if (body) body.style.display = '';
          if (chev) chev.style.transform = 'rotate(90deg)';
        } else {
          acc.classList.remove('is-open');
          if (body) body.style.display = 'none';
          if (chev) chev.style.transform = '';
        }
      });
    }
    const csubGeneral = document.querySelector('[name="empi-c-csubtype"][value=""]');
    if (csubGeneral) csubGeneral.checked = true;
    const csubWrap = document.getElementById('empi-c-csubtype-wrap'); if (csubWrap) csubWrap.style.display = 'none';

    /* 수습: 기본 미적용. 근로 유형 미선택 상태이므로 wrap 자체도 숨김.
     *   정규직 선택 시 emptype change 핸들러가 wrap 노출. */
    const probCb = document.getElementById('empi-c-probation');
    if (probCb) probCb.checked = false;
    const probPeriod = document.getElementById('empi-c-probation-period');
    if (probPeriod) probPeriod.style.display = 'none';
    ['empi-c-probation-start','empi-c-probation-end'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    const probWrap = document.getElementById('empi-c-probation-wrap');
    if (probWrap) probWrap.style.display = 'none';

    /* 도급직 여부: 기본 '해당 없음'. 사원 유형은 상시 노출(선택 초기화만), 소속회사 행만 숨김 + 값 초기화 */
    const outNo = document.querySelector('[name="empi-c-outsourced"][value=""]');
    if (outNo) outNo.checked = true;
    const jobcatRow = document.getElementById('empi-c-jobcat-row');
    if (jobcatRow) jobcatRow.style.display = '';
    const companyRow = document.getElementById('empi-c-contract-company-row');
    if (companyRow) companyRow.style.display = 'none';
    const companySel = document.getElementById('empi-c-contract-company');
    if (companySel) companySel.value = '';

    setFieldMsg('[data-empi-phone-msg]', '');
    setFieldMsg('[data-empi-email-msg]', '');
    /* 사진 업로더 초기화 — 매번 모달 열 때 placeholder 상태로 복원 */
    const photoHost = document.getElementById('empi-c-photo-uploader');
    if (photoHost && window.App && App.PhotoUploader) App.PhotoUploader.reset(photoHost);
    $('[data-empi-create-submit]').disabled = false;
    /* 근로/임금 계약 body 렌더(인사카드 설정 폼 재사용) + 도급직 여부 기준 섹션 표시 */
    renderCreateContractBodies();
    if (modal) toggleCreateContractSections(modal);
    /* 이전 인라인 오류 제거 */
    if (window.App && App.Forms && App.Forms.clearAll) App.Forms.clearAll(document.getElementById('modal-empi-create'));
    showCreateDetail();
  }

  /* 입사일 기반으로 수습기간 강제 동기화.
   *   - 수습 시작일 = 입사일
   *   - 수습 종료일 = 입사일 + 3개월
   *   호출 시점: 수습 체크 ON / 입사일 변경 — 둘 다 입사일 값을 기준으로 덮어쓴다. */
  function syncProbationPeriod(modal) {
    const join = modal.querySelector('#empi-c-joindate');
    const startEl = modal.querySelector('#empi-c-probation-start');
    const endEl   = modal.querySelector('#empi-c-probation-end');
    if (!join || !startEl || !endEl) return;
    const j = join.value || '';
    if (!j) return;
    startEl.value = j;
    endEl.value   = addMonths(j, 3);
  }

  /* 입사일 + 3개월 (말일 보정) */
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

  /* form-field 검증 메시지 표시/숨김 — 빈 문자열이면 숨겨서 행 높이 변동 없음 */
  function setFieldMsg(selector, text) {
    const el = (typeof selector === 'string') ? document.querySelector(selector) : selector;
    if (!el) return;
    el.textContent = text || '';
    el.style.display = text ? '' : 'none';
  }

  function bindCreateModal() {
    /* 모달이 아직 DOM 에 없으면 즉시 주입 (initPage 시점에 한 번 보장) */
    injectCreateModal();
    const modal = document.getElementById('modal-empi-create');
    if (!modal) return;

    /* 아코디언 클릭 토글 + 주소 검색 버튼 — 단일 위임 핸들러.
     *   SVG chevron 은 기본(`>`) 모양이며, 펼침 시 90도 회전하여 (`⌄`) 형태가 됨. */
    modal.addEventListener('click', (e) => {
      /* 상세 화면 닫기 (← 뒤로 / 취소) — 목록으로 복귀 */
      if (e.target.closest('[data-empi-detail-close]')) { e.preventDefault(); closeCreateDetail(); return; }
      /* 주소 검색 — 데모 mock (실제 환경에서는 Daum 우편번호 API 등 연동) */
      const zipBtn = e.target.closest('[data-empi-zipcode-search]');
      if (zipBtn) {
        e.preventDefault();
        const zip  = modal.querySelector('#empi-c-zipcode');
        const base = modal.querySelector('#empi-c-address-base');
        if (zip)  zip.value = '04793';
        if (base) base.value = '서울특별시 성동구 성수이로 113';
        const detail = modal.querySelector('#empi-c-address-detail');
        if (detail) detail.focus();
        window.toast && window.toast('주소가 입력되었습니다. 상세 주소를 작성해 주세요.', 'info');
        return;
      }
      /* 아코디언 토글 */
      const head = e.target.closest('[data-empi-acc-head]');
      if (!head) return;
      const acc = head.closest('[data-empi-acc]');
      if (!acc) return;
      const body = acc.querySelector('[data-empi-acc-body]');
      const chev = acc.querySelector('[data-empi-acc-chev]');
      const open = !acc.classList.contains('is-open');
      acc.classList.toggle('is-open', open);
      if (body) body.style.display = open ? '' : 'none';
      if (chev) chev.style.transform = open ? 'rotate(90deg)' : '';
    });

    const required = ['empi-c-fname','empi-c-gname','empi-c-email','empi-c-joindate','empi-c-phone'];
    function isDup(field, val) {
      return STATE.rows.some(r => r[field] === val);
    }
    /* 등록 버튼은 항상 활성화 (도메인 표준 — AS 등록 모달 등과 동일).
     *   submit 클릭 시 App.Forms 로 빨간 테두리 + 필드 하단 메시지를 인라인 표시. */
    function checkRequired() {
      $('[data-empi-create-submit]').disabled = false;
    }
    /* input 변경 시 해당 필드의 인라인 오류만 즉시 해제 (전체 다시 검증 아님) */
    if (window.App && App.Forms && App.Forms.applyOnInput) App.Forms.applyOnInput(modal);
    required.forEach(id => {
      const el = modal.querySelector('#' + id);
      if (el) el.addEventListener('input', checkRequired);
    });

    const phoneEl = modal.querySelector('#empi-c-phone');
    if (phoneEl) phoneEl.addEventListener('input', (e) => {
      // 하이픈 자동 제거 — 숫자만 입력받는다
      const stripped = e.target.value.replace(/-/g, '');
      if (stripped !== e.target.value) e.target.value = stripped;
      const v = e.target.value.trim();
      const msg = modal.querySelector('[data-empi-phone-msg]');
      if (!v) { setFieldMsg(msg, ''); checkRequired(); return; }
      setFieldMsg(msg, isDup('phone', v) ? '이미 등록된 휴대전화 번호입니다.' : '');
      checkRequired();
    });
    const emailEl = modal.querySelector('#empi-c-email');
    if (emailEl) emailEl.addEventListener('input', (e) => {
      const v = e.target.value.trim();
      const msg = modal.querySelector('[data-empi-email-msg]');
      if (!v) { setFieldMsg(msg, ''); checkRequired(); return; }
      setFieldMsg(msg, isDup('email', v) ? '이미 등록된 이메일 주소입니다.' : '');
      checkRequired();
    });

    modal.querySelectorAll('[name="empi-c-emptype"]').forEach(el => {
      el.addEventListener('change', () => {
        const v = (modal.querySelector('[name="empi-c-emptype"]:checked') || {}).value;
        /* 계약직 sub-types — display 는 inline-flex 로 명시 (gap·align-items 적용 위해) */
        const wrap = modal.querySelector('#empi-c-csubtype-wrap');
        if (v === 'contract') { wrap.style.display = 'inline-flex'; }
        else {
          wrap.style.display = 'none';
          const gen = modal.querySelector('[name="empi-c-csubtype"][value=""]');
          if (gen) gen.checked = true;
        }
        /* 수습은 정규직 전용 — 계약직/일용직 선택 시 행 자체를 숨기고 체크 해제 */
        const probWrap = modal.querySelector('#empi-c-probation-wrap');
        const probPeriod = modal.querySelector('#empi-c-probation-period');
        const probCb = modal.querySelector('#empi-c-probation');
        if (v === 'regular') {
          if (probWrap) probWrap.style.display = 'inline-flex';
        } else {
          if (probWrap) probWrap.style.display = 'none';
          if (probCb) probCb.checked = false;
          if (probPeriod) probPeriod.style.display = 'none';
        }
        /* 소속회사 — 근로 유형=도급직 선택 시만 노출. 다른 유형 선택 시 값 초기화 */
        const companyRow = modal.querySelector('#empi-c-contract-company-row');
        const companySel = modal.querySelector('#empi-c-contract-company');
        if (v === 'outsourced') {
          if (companyRow) companyRow.style.display = '';
        } else {
          if (companyRow) companyRow.style.display = 'none';
          if (companySel) companySel.value = '';
        }
      });
    });

    /* 도급직 여부 토글 — '해당' 선택 시 소속회사 행 노출 + 근로/임금 계약 섹션 숨김(도급직은 계약 없음).
       사원 유형은 상시 노출(숨기지 않음). '해당 없음' 시 소속회사 숨김·초기화 + 계약 섹션 노출. */
    modal.querySelectorAll('[name="empi-c-outsourced"]').forEach(el => {
      el.addEventListener('change', () => {
        preserveDetailScroll(modal, el, () => {
          const isOut = (modal.querySelector('[name="empi-c-outsourced"]:checked') || {}).value === '1';
          const companyRow = modal.querySelector('#empi-c-contract-company-row');
          if (companyRow) companyRow.style.display = isOut ? '' : 'none';
          if (!isOut) {
            const companySel = modal.querySelector('#empi-c-contract-company');
            if (companySel) companySel.value = '';
          }
          /* 도급직=해당 → 근로 유형은 외부인력(outsourced)으로 파생, 계약 섹션 숨김 */
          if (_createEmp) _createEmp.empType = isOut ? 'outsourced' : '';
          toggleCreateContractSections(modal);
        });
      });
    });

    /* 근로 유형(근로 계약 정보) 변경 → 임금 유형 파생: 일용직=시급제 / 정규·계약직=연봉제.
       renderCardEditWage 가 empType 로 임금유형·분기를 결정하므로 임금 body 를 재렌더한다.
       (근로 계약 body 의 표시 동기화는 wireEmploymentEditDeps 가 별도 처리) */
    modal.addEventListener('change', (e) => {
      const t = e.target;
      if (t && t.name === 'empi-ce-emptype') {
        preserveDetailScroll(modal, t, () => {
          if (_createEmp) _createEmp.empType = (modal.querySelector('[name="empi-ce-emptype"]:checked') || {}).value || '';
          renderCreateWageBody(modal);
        });
      }
    });

    /* 수습 체크박스 토글 → 기간 입력 표시 + 기본값(입사일 ~ 입사일+3개월) 자동 채움 */
    const probCb = modal.querySelector('#empi-c-probation');
    if (probCb) {
      probCb.addEventListener('change', () => {
        const period = modal.querySelector('#empi-c-probation-period');
        if (probCb.checked) {
          if (period) period.style.display = 'inline-flex';
          syncProbationPeriod(modal);
        } else {
          if (period) period.style.display = 'none';
        }
      });
    }

    /* 입사일 변경 → (1) 합성 emp 갱신, (2) 근로/임금 계약 시작일(=입사일, readonly) 동기화,
       (3) 수습 적용 중이면 수습 기간을 입사일 기반으로 갱신 */
    const joinEl = modal.querySelector('#empi-c-joindate');
    if (joinEl) {
      joinEl.addEventListener('change', () => {
        const j = joinEl.value || '';
        if (_createEmp) _createEmp.joinDate = j;
        lockCreateContractStart(modal);
        /* 근로 계약 body 의 수습 기간(readonly 시작일 = 입사일) 동기화 */
        const probCe = modal.querySelector('[data-empi-ce-probation]');
        if (probCe && probCe.checked) {
          const ps = modal.querySelector('[data-empi-ce-probation-start]');
          const pe = modal.querySelector('[data-empi-ce-probation-end]');
          if (ps) ps.value = j;
          if (pe && j) pe.value = addMonths(j, 3);
        }
      });
    }

    /* (구) 도급 체크 토글 핸들러 제거 — 도급직/파견직은 근로 유형 radio 자체에 포함됨 */

    modal.querySelector('[data-empi-create-submit]').addEventListener('click', () => {
      const F = window.App && App.Forms;
      if (F) F.clearAll(modal);
      let ok = true;
      const firstInvalid = [];

      /* 필수 필드 인라인 검증 — 인사정보 관리: 입사일/성/이름/개인 이메일/휴대전화 필수.
       *   생년월일·부서 등은 선택 입력 (선택 정보 아코디언). */
      const requireMap = [
        { id: 'empi-c-joindate', msg: '입사일을 선택해 주세요.' },
        { id: 'empi-c-fname',    msg: '성(姓)을 입력해 주세요.' },
        { id: 'empi-c-gname',    msg: '이름을 입력해 주세요.' },
        { id: 'empi-c-email',    msg: '개인 이메일을 입력해 주세요.' },
        { id: 'empi-c-phone',    msg: '휴대전화 번호를 입력해 주세요.' },
      ];
      requireMap.forEach(({ id, msg }) => {
        const el = modal.querySelector('#' + id);
        if (el && !(el.value || '').trim()) {
          if (F) F.setFieldError(el, msg);
          ok = false;
          firstInvalid.push(el);
        }
      });
      /* 부서는 선택 입력 — 값 있을 때만 사용 */
      const deptCurVal = (_deptCombo && _deptCombo.getValue) ? (_deptCombo.getValue() || '') : '';

      const phoneEl = modal.querySelector('#empi-c-phone');
      const phone = phoneEl ? phoneEl.value.trim() : '';
      const email = modal.querySelector('#empi-c-email').value.trim();
      if (phone && isDup('phone', phone)) {
        if (F) F.setFieldError(phoneEl, '이미 등록된 휴대전화 번호입니다.');
        ok = false;
      }
      if (email && isDup('email', email)) {
        if (F) F.setFieldError(modal.querySelector('#empi-c-email'), '이미 등록된 이메일입니다.');
        ok = false;
      }

      /* ===== 근무 정보 — 전 항목 필수 (사원 유형 / 근무지 / 부서 / 직위 / 직책 / 직무, 도급직=해당 시 소속회사) ===== */
      const outChecked = (modal.querySelector('[name="empi-c-outsourced"]:checked') || {}).value === '1';
      const reqSelects = [
        { id: 'empi-c-site',     msg: '근무지를 선택해 주세요.' },
        { id: 'empi-c-rank',     msg: '직위를 선택해 주세요.' },
        { id: 'empi-c-position', msg: '직책을 선택해 주세요.' },
        { id: 'empi-c-job',      msg: '직무를 선택해 주세요.' },
      ];
      reqSelects.forEach(({ id, msg }) => {
        const el = modal.querySelector('#' + id);
        if (el && !el.value) { if (F) F.setFieldError(el, msg); ok = false; firstInvalid.push(el); }
      });
      /* 부서 (콤보) */
      if (!deptCurVal) {
        const deptHost = modal.querySelector('#empi-c-dept');
        if (F && deptHost) F.setFieldError(deptHost, '부서를 선택해 주세요.');
        ok = false; if (deptHost) firstInvalid.push(deptHost);
      }
      /* 사원 유형 (라디오) — 상시 필수 */
      const jobcatErr = modal.querySelector('[data-empi-c-err="jobcat"]');
      if (!modal.querySelector('[name="empi-c-jobcat"]:checked')) {
        if (jobcatErr) { jobcatErr.textContent = '사원 유형을 선택해 주세요.'; jobcatErr.hidden = false; }
        ok = false; firstInvalid.push(modal.querySelector('#empi-c-jobcat-row'));
      } else if (jobcatErr) { jobcatErr.hidden = true; }
      /* 도급직=해당 → 소속회사 필수 */
      if (outChecked) {
        const companySel = modal.querySelector('#empi-c-contract-company');
        if (companySel && !companySel.value) {
          if (F) F.setFieldError(companySel, '소속회사를 선택해 주세요.');
          ok = false; firstInvalid.push(companySel);
        }
      }

      /* ===== 근로/임금 계약 검증 (도급직=해당없음일 때만 — 도급직은 계약 없음) ===== */
      const numOf = (v) => Number(String(v == null ? '' : v).replace(/[^0-9.]/g, '')) || 0;
      const showCErr = (slotSel, msg, focusEl) => {
        const slot = modal.querySelector(slotSel);
        if (slot) { slot.textContent = msg; slot.hidden = false; }
        if (focusEl) { focusEl.classList.add('is-invalid'); firstInvalid.push(focusEl); }
        else if (slot) { firstInvalid.push(slot); }
        ok = false;
      };
      const ceType    = (modal.querySelector('[name="empi-ce-emptype"]:checked') || {}).value || '';
      const ceEndEl   = modal.querySelector('[data-empi-ce-contract-end]');
      const ceProbCb  = modal.querySelector('[data-empi-ce-probation]');
      const ceProbEnd = modal.querySelector('[data-empi-ce-probation-end]');
      const cwTypeEl  = modal.querySelector('[name="empi-cw-wagetype"]:checked');
      const cwAmountEl= modal.querySelector('[data-empi-cw-amount]');
      const cwEndEl   = modal.querySelector('[data-empi-cw-end]');
      const cwIndefEl = modal.querySelector('[data-empi-cw-indefinite]');
      const cwKindEl  = modal.querySelector('[name="empi-cw-kind"]:checked');
      const cwHDayEl  = modal.querySelector('[data-empi-cw-hours-day]');
      const cwHWeekEl = modal.querySelector('[data-empi-cw-hours-week]');
      const cwHMonEl  = modal.querySelector('[data-empi-cw-hours-month]');
      const joinValForC = (modal.querySelector('#empi-c-joindate') || {}).value || '';
      if (!outChecked) {
        /* 근로 유형 필수 */
        if (!ceType) showCErr('[data-empi-ce-err="emptype"]', '근로 유형을 선택해 주세요.');
        const ceProbOn = ceType === 'regular' && !!(ceProbCb && ceProbCb.checked);
        /* 계약 종료일 규칙 —
           · 정규직 + 수습 O → 수습 종료일 필수 / 정규직 + 수습 X → 기간의 정함 없음(종료일 불요)
           · 계약직(일반·촉탁·인턴) / 일용직 → 종료일 필수 & 시작일 이후 */
        if (ceType === 'regular') {
          if (ceProbOn) {
            if (ceProbEnd && !ceProbEnd.value) showCErr('[data-empi-ce-err="probend"]', '수습 종료일을 선택해 주세요.', ceProbEnd);
            else if (ceProbEnd && joinValForC && ceProbEnd.value <= joinValForC) showCErr('[data-empi-ce-err="probend"]', '수습 종료일은 입사일 이후로 설정해 주세요.', ceProbEnd);
          }
        } else if (ceType === 'contract' || ceType === 'daily') {
          if (ceEndEl && !ceEndEl.value) showCErr('[data-empi-ce-err="period"]', '계약 종료일을 선택해 주세요.', ceEndEl);
          else if (ceEndEl && joinValForC && ceEndEl.value <= joinValForC) showCErr('[data-empi-ce-err="period"]', '종료일은 시작일 이후로 설정해 주세요.', ceEndEl);
        }
        /* 임금 — 계약 금액 필수 */
        if (cwAmountEl && numOf(cwAmountEl.value) <= 0) showCErr('[data-empi-cw-err="amount"]', '계약 금액을 입력해 주세요.', cwAmountEl);
        /* 임금 계약 종료일 — 기간의 정함 없음 아니면 시작일보다 미래 필수 */
        if (!(cwIndefEl && cwIndefEl.checked)) {
          if (cwEndEl && !cwEndEl.value) showCErr('[data-empi-cw-err="period"]', '임금 계약 종료일을 선택해 주세요.', cwEndEl);
          else if (cwEndEl && joinValForC && cwEndEl.value <= joinValForC) showCErr('[data-empi-cw-err="period"]', '종료일은 시작일보다 미래로 설정해 주세요.', cwEndEl);
        }
        /* 소정 근로시간 (1일·1주·월) */
        if (cwHDayEl && numOf(cwHDayEl.value) <= 0) showCErr('[data-empi-cw-err="stdhours"]', '소정 근로시간을 입력해 주세요.', cwHDayEl);
        else if (cwHWeekEl && numOf(cwHWeekEl.value) <= 0) showCErr('[data-empi-cw-err="stdhours"]', '소정 근로시간을 입력해 주세요.', cwHWeekEl);
        else if (cwHMonEl && numOf(cwHMonEl.value) <= 0) showCErr('[data-empi-cw-err="stdhours"]', '소정 근로시간을 입력해 주세요.', cwHMonEl);
        /* 연봉제 — 임금 계약 유형(고정 OT / 포괄임금) 필수 */
        if ((cwTypeEl || {}).value === 'annual' && !cwKindEl) showCErr('[data-empi-cw-err="kind"]', '임금 계약 유형을 선택해 주세요.');
      }

      if (!ok) {
        /* 오류가 접힌 아코디언 안에 있으면 펼쳐서 보이게 한다 */
        const focus = firstInvalid[0] || modal.querySelector('.is-invalid');
        const acc = focus && focus.closest ? focus.closest('[data-empi-acc]') : null;
        if (acc && !acc.classList.contains('is-open')) {
          acc.classList.add('is-open');
          const ab = acc.querySelector('[data-empi-acc-body]'); if (ab) ab.style.display = '';
          const ac = acc.querySelector('[data-empi-acc-chev]'); if (ac) ac.style.transform = 'rotate(90deg)';
        }
        focus?.scrollIntoView({ behavior:'smooth', block:'center' });
        return;
      }

      /* 직책 1명 제한 — 파트장·팀장·본부장 은 각 부서에 1명만 지정 가능 */
      const positionVal = modal.querySelector('#empi-c-position').value;
      const deptVal     = deptCurVal;
      const UNIQUE_POSITIONS = ['파트장', '팀장', '본부장'];
      if (UNIQUE_POSITIONS.includes(positionVal) && deptVal) {
        const occupant = STATE.rows.find(r =>
          r.dept === deptVal && r.position === positionVal && r.status !== 'retired'
        );
        if (occupant) {
          window.toast && window.toast(`${deptVal} ${positionVal}은(는) 이미 ${occupant.name || occupant.fname + occupant.gname} 님이 지정되어 있습니다.`, 'warning');
          return;
        }
      }

      /* 사번 채번은 입사일 기준 — 같은 입사일에 등록된 건수에 +1 한 일련번호.
       *   입사일이 '2026-05-19' 면 SW260519{seq} 형태. */
      const today = new Date();
      const joinValRaw = modal.querySelector('#empi-c-joindate').value || '';
      const [jY, jM, jD] = joinValRaw.split('-');
      const yy = (jY || '').slice(-2);
      const mm = jM || '';
      const dd = jD || '';
      const seq = String(STATE.rows.filter(r => r.id.startsWith('SW'+yy+mm+dd)).length + 1).padStart(2,'0');
      const empId = `SW${yy}${mm}${dd}${seq}`;
      /* 고용 형태 파생.
       *   · 도급직=해당      → empType='outsourced', contractOut=true (근로/임금 계약 없음)
       *   · 도급직=해당없음  → empType = 근로 계약 정보의 근로 유형(정규/계약/일용) */
      const isOut = outChecked;
      const empType = isOut ? 'outsourced' : ceType;
      const contractSubType = (!isOut && ceType === 'contract')
        ? ((modal.querySelector('[name="empi-ce-csubtype"]:checked') || {}).value || '') : '';
      const contractOut = isOut;
      const contractCompany = isOut ? ((modal.querySelector('#empi-c-contract-company') || {}).value || '') : '';
      /* 사원 유형(사무/생산/연구)은 근무 정보에서 상시 입력 → 도급 여부와 무관하게 저장 */
      const jobCat = (modal.querySelector('[name="empi-c-jobcat"]:checked') || {}).value || '';
      /* 등록일은 오늘 — 채번용 yy/mm/dd 는 입사일이므로 별도 계산 */
      const todayYmd = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
      const fname = modal.querySelector('#empi-c-fname').value.trim();
      const gname = modal.querySelector('#empi-c-gname').value.trim();
      /* 수습은 정규직 한정 (도급/파견 등 외부 인력은 수습 개념 자체 없음) */
      const probationOn = empType === 'regular' && !!(ceProbCb && ceProbCb.checked);
      const joinVal = joinValForC;
      const probationStart = probationOn ? (((modal.querySelector('[data-empi-ce-probation-start]') || {}).value) || joinVal) : '';
      const probationEnd   = probationOn ? (((ceProbEnd || {}).value) || addMonths(joinVal, 3)) : '';

      /* 계약 기간 — 시작일 = 입사일. 종료일: 정규직=무기(''), 계약직/일용직=입력값 */
      const contractStartDate = isOut ? '' : joinVal;
      const contractEndDate = (!isOut && (ceType === 'contract' || ceType === 'daily'))
        ? ((ceEndEl && ceEndEl.value) || '') : '';

      /* 임금 계약 필드 수집 (도급직=해당없음일 때만) */
      let wageFields = {};
      if (!isOut) {
        const cwType = (cwTypeEl || {}).value || (empType === 'daily' ? 'hourly' : 'annual');
        const isHourly = cwType === 'hourly';
        const amountRaw = numOf(cwAmountEl && cwAmountEl.value);
        /* 시급제 계약 금액 = 시급 + 주휴수당(시급 20% 원단위 절사) */
        const hourlyWage = isHourly ? amountRaw : '';
        const contractAmount = isHourly ? (amountRaw + Math.floor(amountRaw * 0.2)) : amountRaw;
        /* 고정 OT / 포괄 기준시간 상세 — 카테고리별 입력 수집 */
        const readHours = (attrPrefix) => {
          const m = {};
          (typeof INCLUSIVE_OT_CATEGORIES !== 'undefined' ? INCLUSIVE_OT_CATEGORIES : []).forEach(c => {
            const el = modal.querySelector(`[${attrPrefix}-${c.key}]`);
            const n = el ? numOf(el.value) : 0;
            if (n) m[c.key] = n;
          });
          return m;
        };
        wageFields = {
          incomeType: 'earned',
          wageType: cwType,
          contractAmount, hourlyWage,
          wageContractKind: isHourly ? '' : ((cwKindEl || {}).value || 'fixedOT'),
          fixedOTHoursDetail: readHours('data-empi-cw-foth'),
          inclusiveOTHours:   readHours('data-empi-cw-inch'),
          baseSalary:        numOf((modal.querySelector('[data-empi-cw-base]')       || {}).value),
          fixedOTAmount:     numOf((modal.querySelector('[data-empi-cw-fot-amount]') || {}).value),
          inclusiveOTAmount: numOf((modal.querySelector('[data-empi-cw-inc-amount]') || {}).value),
          deductionPolicy: (modal.querySelector('[data-empi-cw-deduction]') || {}).value || '근로기준법 및 취업규칙에 따름',
          payDay:    numOf((modal.querySelector('[data-empi-cw-payday]')    || {}).value) || 10,
          payMethod: (modal.querySelector('[data-empi-cw-paymethod]') || {}).value || '계좌이체',
          hoursPerDay:   numOf((cwHDayEl  || {}).value),
          hoursPerWeek:  numOf((cwHWeekEl || {}).value),
          hoursPerMonth: numOf((cwHMonEl  || {}).value),
          wageContractStartDate: joinVal,
          wageContractEndDate:   (cwIndefEl && cwIndefEl.checked) ? '' : ((cwEndEl && cwEndEl.value) || ''),
          wageIndefinite: !!(cwIndefEl && cwIndefEl.checked),
        };
      }

      /* 사진 업로더에서 dataURL 추출 — 미업로드면 빈 문자열, 기존 mock 사진 흐름과 동일하게 emp.photoUrl 로 저장 */
      const photoHost = document.getElementById('empi-c-photo-uploader');
      const photoUrl = (window.App && App.PhotoUploader) ? App.PhotoUploader.getDataURL(photoHost) : '';

      const row = {
        id: empId,
        fname, gname,
        name: `${fname}${gname}`,
        photoUrl,
        nameFlip: modal.querySelector('#empi-c-name-flip').checked,
        cname: '',
        ename: modal.querySelector('#empi-c-ename').value.trim(),
        dept:     deptVal,
        job:      modal.querySelector('#empi-c-job').value,
        rank:     modal.querySelector('#empi-c-rank').value,
        position: modal.querySelector('#empi-c-position').value,
        joinDate: modal.querySelector('#empi-c-joindate').value,
        registeredAt: todayYmd,
        registeredBy: '정혜진',
        phone,
        email,
        address: (() => {
          /* 주소: [우편번호] 기본주소 상세주소 형식으로 결합. 빈값 컴포넌트는 자동 생략. */
          const zip   = (modal.querySelector('#empi-c-zipcode')        || {}).value || '';
          const base  = (modal.querySelector('#empi-c-address-base')   || {}).value || '';
          const detail= (modal.querySelector('#empi-c-address-detail') || {}).value || '';
          const parts = [];
          if (zip)    parts.push(`[${zip.trim()}]`);
          if (base)   parts.push(base.trim());
          if (detail) parts.push(detail.trim());
          return parts.join(' ');
        })(),
        innerTel: '',
        birth: modal.querySelector('#empi-c-birth').value,
        gender: 'M',
        status: 'registered',
        sentDate: '',
        mailFailCode: '',
        empType,
        contractSubType,
        contractOut,
        contractCompany,
        jobCat,
        site: (modal.querySelector('#empi-c-site') || {}).value || '',
        infoStatus: 'none',
        /* 근로/임금 계약 — 등록과 동시에 서명 요청 발송 → 서명진행중.
           서명진행중 판정 = contractLabor/contractWage=false + *SentDate 존재 (도급직은 계약 없음 → 미발송) */
        contractLabor: false,
        contractWage: false,
        contractStartDate,
        contractEndDate,
        contractSentDate:     isOut ? '' : todayYmd,
        wageContractSentDate: isOut ? '' : todayYmd,
        docSigned: 0,
        ssn: '',
        probation: probationOn,
        probationStart,
        probationEnd,
        /* 신규 등록 — 인사카드의 학력·경력/자격·역량/개인정보(장애·신체·병역·가족)/주민번호를
           데모 mock 없이 빈값으로 시작 (입력한 내용만 표시). 표 데이터도 명시적 빈 배열로 고정. */
        _noMock: true,
        _pt_education: [], _pt_career: [], _pt_licenses: [], _pt_languages: [],
        _pt_family: [], _pt_disability: [], _pt_bodyInfo: [], _pt_military: [],
        ...wageFields,
      };

      /* 근로계약 종료일: 정규직 무기=미지정, 수습=수습종료일, 계약/일용=계약종료일 */
      let laborEndForPush = '', laborIndef = false;
      if (empType === 'regular') {
        if (probationOn) { laborEndForPush = probationEnd; laborIndef = false; }
        else { laborEndForPush = ''; laborIndef = true; }
      } else if (empType === 'contract' || empType === 'daily') { laborEndForPush = contractEndDate; laborIndef = false; }

      /* 커밋에 필요한 정보 보관 — 도급직이면 계약 없이 바로 등록, 그 외엔 계약서 미리보기 모달을 거쳐 발송 */
      _pendingCreate = { row, isOut, empId, joinVal, laborEndForPush, laborIndef };

      if (isOut) {
        commitCreate();   // 도급직 — 근로/임금 계약 없음 → 즉시 등록
      } else {
        openContractPreview();   // 근로계약서·임금계약서 미리보기 → [서명 요청 발송] 로 확정
      }
    });
  }

  /* ============ 임직원 등록 — 근로/임금 계약서 미리보기 → 서명 요청 발송 ============ */
  let _pendingCreate = null;

  /* 미리보기용 계약서 문서 HTML — App.HRContract.TEMPLATES + renderContractHTML 재사용(미커밋) */
  function buildCreateContractDoc(kind) {
    const HRC = window.App && App.HRContract;
    const pc = _pendingCreate;
    if (!HRC || !HRC.TEMPLATES || !pc) return '<div style="padding:24px;color:var(--color-text-muted);">미리보기를 생성할 수 없습니다.</div>';
    const r = pc.row;
    const isLabor = kind === '근로계약서';
    const empTypeLabel = { regular:'정규직', contract:'계약직', daily:'일용직', outsourced:'도급직' }[r.empType] || '';
    const jobCatLabel  = { office:'사무직', production:'생산직', research:'연구직' }[r.jobCat] || '';
    const startDate = isLabor ? (r.contractStartDate || pc.joinVal) : (r.wageContractStartDate || pc.joinVal);
    const endDate   = isLabor ? pc.laborEndForPush : (r.wageContractEndDate || '');
    const indef     = isLabor ? pc.laborIndef : !!r.wageIndefinite;
    const v = {
      회사명: HRC.COMPANY, 직원명: r.name, 사번: r.id,
      부서: r.dept || '', 직무: r.job || '', 직위: r.rank || '', 직책: r.position || '',
      고용구분: empTypeLabel, 소속형태: r.contractOut ? '도급' : '-', 직군: jobCatLabel,
      시작일: startDate || '', 종료일: indef ? '' : (endDate || ''), 무기: indef,
      근무지: r.site || '성수동', 근무시간: '09:00 ~ 18:00',
      기본급: r.baseSalary || '', 직무수당: '', 식대: '', 지급일: r.payDay || '',
      /* 임금계약서 급여(제3조) — wageClauses 가 읽는 임금 모델 키 */
      wageTypeKey: r.wageType || '', wageContractKindKey: r.wageContractKind || '',
      계약금액: r.contractAmount || '', 월기본급: r.baseSalary || '',
      월시간외수당: r.fixedOTAmount || '', 월고정연장근무수당: r.inclusiveOTAmount || '',
      시급: r.hourlyWage || '', 주휴수당: r.hourlyWage ? Math.floor(Number(r.hourlyWage) * 0.2) : '',
      fixedOTHours: '',
      작성일: r.registeredAt || '',
    };
    const tpl = HRC.TEMPLATES[kind];
    if (!tpl) return '<div style="padding:24px;color:var(--color-text-muted);">계약서 템플릿을 찾을 수 없습니다.</div>';
    return HRC.renderContractHTML({ body: tpl(v) }, { omitSignatures: true });
  }

  function injectContractPreviewModal() {
    if (document.getElementById('modal-empi-ctr-preview')) return;
    const html = `
<div class="modal-backdrop" id="modal-empi-ctr-preview" data-modal-id="empi-ctr-preview" style="z-index:1150;">
  <div class="modal modal--lg" style="height:90vh;display:flex;flex-direction:column;">
    <div class="modal__header">
      <div class="modal__title">계약서 미리보기 · 서명 요청</div>
      <button class="modal__close" data-empi-ctrpv-close type="button" aria-label="닫기">✕</button>
    </div>
    <div style="border-bottom:1px solid var(--color-divider);background:var(--color-surface);padding:0 20px;">
      <div class="tabs tabs--underline">
        <div class="tabs__nav">
          <button type="button" class="tabs__tab is-active" data-empi-ctrpv-tab="근로계약서">근로계약서</button>
          <button type="button" class="tabs__tab" data-empi-ctrpv-tab="임금계약서">임금계약서</button>
        </div>
      </div>
    </div>
    <div class="modal__body" style="flex:1;min-height:0;overflow:auto;background:var(--color-surface-alt);padding:18px 20px;">
      <div data-empi-ctrpv-doc="근로계약서" class="doc-editor__paper is-readonly" style="font-family:inherit;"></div>
      <div data-empi-ctrpv-doc="임금계약서" class="doc-editor__paper is-readonly" style="font-family:inherit;display:none;"></div>
    </div>
    <div class="modal__footer">
      <span style="flex:1;font-size:12px;color:var(--color-text-muted);align-self:center;">발송 시 근로계약서·임금계약서 2건의 전자 서명 요청이 함께 전송됩니다.</span>
      <button class="btn" type="button" data-empi-ctrpv-close>취소</button>
      <button class="btn btn--primary" type="button" data-empi-ctrpv-send>서명 요청 발송</button>
    </div>
  </div>
</div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    /* 이벤트 위임 — 탭 전환 / 닫기 / 발송 (1회 바인딩) */
    const modal = document.getElementById('modal-empi-ctr-preview');
    modal.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-empi-ctrpv-tab]');
      if (tab) { setContractPreviewTab(tab.dataset.empiCtrpvTab); return; }
      if (e.target.closest('[data-empi-ctrpv-close]') || e.target === modal) { closeModal('modal-empi-ctr-preview'); return; }
      if (e.target.closest('[data-empi-ctrpv-send]')) { commitCreate(); closeModal('modal-empi-ctr-preview'); return; }
    });
  }
  function setContractPreviewTab(kind) {
    const modal = document.getElementById('modal-empi-ctr-preview');
    if (!modal) return;
    modal.querySelectorAll('[data-empi-ctrpv-tab]').forEach(t => t.classList.toggle('is-active', t.dataset.empiCtrpvTab === kind));
    modal.querySelectorAll('[data-empi-ctrpv-doc]').forEach(d => { d.style.display = d.dataset.empiCtrpvDoc === kind ? '' : 'none'; });
  }
  function openContractPreview() {
    injectContractPreviewModal();
    const modal = document.getElementById('modal-empi-ctr-preview');
    if (!modal) { commitCreate(); return; }   // 미리보기 불가 시 폴백 — 바로 등록
    modal.querySelector('[data-empi-ctrpv-doc="근로계약서"]').innerHTML = buildCreateContractDoc('근로계약서');
    modal.querySelector('[data-empi-ctrpv-doc="임금계약서"]').innerHTML = buildCreateContractDoc('임금계약서');
    setContractPreviewTab('근로계약서');
    openModal('modal-empi-ctr-preview');
  }

  /* 실제 등록 확정 — STATE 행 추가 + (도급직 아니면) 근로·임금 계약서 서명 요청 발송(계약 이력 signing 누적) */
  function commitCreate() {
    const pc = _pendingCreate;
    if (!pc) return;
    const { row, isOut, empId, joinVal, laborEndForPush, laborIndef } = pc;
    STATE.rows.unshift(row);
    if (!isOut && window.App && App.HRContract && typeof App.HRContract.addRowFromExternal === 'function') {
      const empPayload = {
        id: empId, name: row.name, fname: row.fname, gname: row.gname,
        dept: row.dept, job: row.job, rank: row.rank, position: row.position,
        empType: row.empType, contractSubType: row.contractSubType, contractOut: false, jobCat: row.jobCat,
        site: row.site || '성수동',
      };
      /* 근로계약서 먼저 발송 → 반환된 계약번호를 임금계약서의 '연결 근로계약'으로 연결.
         (임금계약은 근로계약에 의존 — 최신 근로계약 기준으로 자동 연결, 직원이 별도 선택하지 않음) */
      const laborRow = App.HRContract.addRowFromExternal({
        emp: empPayload, kind: '근로계약서', mode: 'individual',
        startDate: joinVal, endDate: laborEndForPush, indefinite: laborIndef,
        status: 'signing', registeredBy: '정혜진', sentBy: '정혜진', source: '임직원 등록 발송',
        salary: { base: '', allowance: '', meal: '', payday: '' },
      });
      App.HRContract.addRowFromExternal({
        emp: empPayload, kind: '임금계약서', mode: 'individual',
        startDate: joinVal, endDate: row.wageContractEndDate || '', indefinite: !!row.wageIndefinite,
        status: 'signing', registeredBy: '정혜진', sentBy: '정혜진', source: '임직원 등록 발송',
        linkedLaborId: laborRow && laborRow.id,   // 연결된 근로계약번호
        salary: {
          base: row.baseSalary || '', allowance: '', meal: '', payday: row.payDay || '',
          wageType: row.wageType || '', wageKind: row.wageContractKind || '',
          contractAmount: row.contractAmount || '',
          fixedOT: row.fixedOTAmount || '', inclusiveOT: row.inclusiveOTAmount || '',
          hourly: row.hourlyWage || '', holiday: row.hourlyWage ? Math.floor(Number(row.hourlyWage) * 0.2) : '',
        },
      });
    }
    _pendingCreate = null;
    applyFilter();
    renderTable();
    closeCreateDetail();
    window.toast && window.toast(
      isOut ? `등록 완료 — 사번 ${empId}` : `등록 완료 — 사번 ${empId} · 근로·임금 계약서 서명 요청 발송`,
      'success');
  }


  /* ============ 서류 미리보기 모달 — 계약서/입사서류 공용 ============
   *   계약서: App.HRContract.TEMPLATES 재사용
   *   입사서류 5종: generic 동의서 템플릿 (storyboard) */
  function buildDocPreviewHTML(emp, type, key, opts) {
    const HC = (window.App && App.HRContract) || {};
    const empName = displayName(emp);
    const company = HC.COMPANY || '주식회사 성원애드피아';
    const today = HC.todayStr ? HC.todayStr() : new Date().toISOString().slice(0, 10);

    if (type === 'contract') {
      const kind = key === 'wage' ? '임금계약서' : '근로계약서';
      if (!HC.TEMPLATES || !HC.renderContractHTML) {
        return `<p style="color:var(--color-text-muted);text-align:center;padding:40px;">계약서 미리보기 모듈을 불러올 수 없습니다.</p>`;
      }
      const signed = key === 'wage' ? !!emp.contractWage : !!emp.contractLabor;
      const v = {
        회사명: company, 직원명: empName, 사번: emp.id,
        부서: emp.dept || '', 직무: emp.job || '', 직위: emp.rank || '', 직책: emp.position || '',
        '고용 형태': EMP_TYPE_LABEL[emp.empType] || '',
        소속형태: emp.contractOut ? '도급' : '-',
        직군: emp.jobCat === 'production' ? '생산직' : (emp.jobCat === 'research' ? '연구직' : '사무직'),
        작성일: emp.contractSentDate || today,
        시작일: emp.joinDate || today,
        종료일: '',
        무기: emp.empType === 'regular',
        근무지: emp.site || '', 근무시간: '09:00 ~ 18:00',
        기본급: '3,200,000', 직무수당: '200,000', 식대: '200,000', 지급일: '매월 25일',
      };
      const body = HC.TEMPLATES[kind](v);
      const row = {
        kind, empId: emp.id, empName, empDept: emp.dept || '', body,
        gapSignedAt: HC.nowStamp ? HC.nowStamp() : '',
        eulSignedAt: signed ? `${dispYmd(emp.joinDate || today)}   10:25` : '',
        eulSignName: signed ? empName : '',
      };
      return HC.renderContractHTML(row);
    }

    /* 입사서류 5종 — generic 동의서 템플릿.
       opts.name / opts.signed 가 전달되면(입사 서류 탭) 우선 사용, 없으면 CTR_DOCS 매핑 fallback. */
    const o = opts || {};
    const docMeta = CTR_DOCS.find(d => d.key === key);
    const docName = o.name || (docMeta ? docMeta.label : '입사서류');
    const docIdx  = CTR_DOCS.findIndex(d => d.key === key);
    const signed  = (o.signed != null) ? !!o.signed : (docIdx >= 0 && docIdx < (emp.docSigned || 0));
    /* 입사서류관리 본문 사용 — 특정 버전(o.version) 우선, 없으면 현행 본문. 없으면 기본 조항. */
    let verBody = '';
    if (window.App && App.JoinDocs) {
      verBody = (o.version && App.JoinDocs.getVersionBody) ? App.JoinDocs.getVersionBody(key, o.version)
              : (App.JoinDocs.docBody ? App.JoinDocs.docBody(key) : '');
    }
    const bodyHTML = verBody
      ? `<div style="white-space:pre-wrap;font-size:14px;line-height:1.85;color:var(--color-text);margin:14px 0 20px;">${esc(verBody)}</div>`
      : `<h3 class="doc-paper__art">제1조 (목적)</h3>
         <p class="doc-paper__cl">본 문서는 ${esc(docName)} 의 목적을 명시하며, 근로자는 그 내용을 충분히 확인하고 자발적으로 동의합니다.</p>
         <h3 class="doc-paper__art">제2조 (효력)</h3>
         <p class="doc-paper__cl">본 동의는 근로계약 기간 동안 유효하며, 관련 법령 및 회사 규정에 따라 처리됩니다.</p>`;
    const verTag = o.version ? ` <span style="font-size:13px;color:var(--color-text-muted);font-weight:var(--fw-regular);">(${esc(o.version)})</span>` : '';
    const sigStamp = o.signedAt || (dispYmd(emp.joinDate || today) + '   10:25');
    return `
      <h2 class="doc-paper__title">${esc(docName)}${verTag}</h2>
      <p class="doc-paper__intro">「${esc(company)}」(이하 "회사")는 「${esc(empName)}」(이하 "근로자") 와 본 문서에 명시된 내용에 대해 다음과 같이 합의·동의합니다.</p>
      ${bodyHTML}
      <div class="sig-block-row">
        <div class="sig-block sig-block--signed">
          <div class="sig-block__role">갑 — 사용자 (회사)</div>
          <div class="sig-block__info"><strong>${esc(company)}</strong></div>
          <div class="sig-block__sigarea">
            <div class="sig-block__seal">${esc(HC.COMPANY_SEAL && HC.COMPANY_SEAL.text || '').replace(/\n/g, '<br>')}</div>
          </div>
        </div>
        <div class="sig-block ${signed ? 'sig-block--signed' : ''}">
          <div class="sig-block__role">을 — 근로자</div>
          <div class="sig-block__info"><strong>${esc(empName)}</strong><small>사번 ${esc(emp.id)} · ${esc(emp.dept || '')}</small></div>
          <div class="sig-block__sigarea">
            ${signed
              ? `<div class="sig-block__sig">${esc(empName)}</div><span class="sig-block__stamp-time">${esc(sigStamp)}</span>`
              : `<span style="color:var(--color-text-muted);">근로자 서명 미완료</span>`}
          </div>
        </div>
      </div>
    `;
  }

  function openDocPreviewModal(emp, type, key, opts) {
    const o = opts || {};
    const docMeta = type === 'doc' ? CTR_DOCS.find(d => d.key === key) : null;
    const title = type === 'contract'
      ? (key === 'wage' ? '임금계약서' : '근로계약서')
      : (o.name || (docMeta ? docMeta.label : '입사서류'));
    $('#empi-doc-preview-title').textContent = `${title} — ${displayName(emp)} (${emp.id})`;
    $('#empi-doc-preview-body').innerHTML = buildDocPreviewHTML(emp, type, key, o);
    /* .modal-backdrop--over-oc 의 z-index:1100!important 를 이겨 다른 모달(서명 이력 1195 등) 위로 올림 */
    const pm = document.getElementById('modal-empi-doc-preview');
    if (pm) pm.style.setProperty('z-index', '1460', 'important');
    openModal('modal-empi-doc-preview');
  }

  /* 서류/계약서 미리보기 모달 — 마크업이 정적으로 없으므로 최초 1회 주입.
     인사정보카드는 외부 페이지(계약/발령 등)에서도 열리므로 카드 오픈 시에도 보장 주입. */
  function injectDocPreviewModal() {
    if (document.getElementById('modal-empi-doc-preview')) return;
    const html = `
<div class="modal-backdrop modal-backdrop--over-oc" id="modal-empi-doc-preview" data-modal-id="empi-doc-preview" style="z-index:1200;">
  <div class="modal modal--xl" style="width:96vw;max-width:960px;height:88vh;max-height:880px;display:flex;flex-direction:column;">
    <div class="modal__header">
      <div class="modal__title" id="empi-doc-preview-title">문서 미리보기</div>
      <button class="modal__close" data-modal-close type="button" aria-label="닫기">✕</button>
    </div>
    <div class="modal__body" style="flex:1;min-height:0;overflow:auto;background:var(--color-surface-alt);padding:24px;">
      <div class="doc-editor__paper is-readonly" id="empi-doc-preview-body" style="font-family:inherit;max-width:760px;margin:0 auto;"></div>
    </div>
    <div class="modal__footer">
      <button class="btn" type="button" data-modal-close>닫기</button>
      <button class="btn" type="button" data-empi-doc-print>인쇄</button>
      <button class="btn btn--primary" type="button" data-empi-doc-pdf>PDF 다운로드</button>
    </div>
  </div>
</div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
  }

  function bindDocPreviewModal() {
    injectDocPreviewModal();
    const modal = document.getElementById('modal-empi-doc-preview');
    if (!modal || modal.dataset.bound === '1') return;
    modal.dataset.bound = '1';
    /* 닫기 — 백드롭/닫기 버튼 (외부 페이지에서 열려 bindModalClose 미적용 케이스 대비 자체 처리) */
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-modal-close]')) closeModal('modal-empi-doc-preview');
    });
    modal.querySelector('[data-empi-doc-print]').addEventListener('click', () => {
      /* 인쇄 — 미리보기 본문만 새 창으로 열어 인쇄 (전체 페이지 인쇄 회피) */
      const body = $('#empi-doc-preview-body');
      const title = $('#empi-doc-preview-title').textContent || '문서';
      if (!body) return;
      const w = window.open('', '_blank', 'width=820,height=1000');
      if (!w) { window.toast && window.toast('팝업이 차단되었습니다.', 'warning'); return; }
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
        <link rel="stylesheet" href="assets/css/ui-kit.css">
        <style>body { padding: 24px; background: #fff; }</style>
        </head><body>${body.innerHTML}<script>window.onload=function(){window.print();}<\/script></body></html>`);
      w.document.close();
    });
    modal.querySelector('[data-empi-doc-pdf]').addEventListener('click', () => {
      /* 미리보기 서류를 PDF 로 다운로드 (도메인 표준 App.downloadFile — 데모는 placeholder 파일 생성) */
      const title = (($('#empi-doc-preview-title').textContent || '문서').split('—')[0] || '문서').trim();
      if (typeof App.downloadFile === 'function') App.downloadFile(`${title}_서명본.pdf`, { context: title });
      else window.toast && window.toast('다운로드 모듈을 불러올 수 없습니다.', 'warning');
    });
  }

  /* 인사정보카드 사진 placeholder — 정보입력완료 여부와 무관하게 항상 표시
   *   데모: 실제 업로드 사진 대신 성(姓) 이니셜 + 시드 기반 색상 placeholder
   *   실제 환경: emp.photoUrl 있으면 <img>, 없으면 placeholder */
  const PHOTO_COLORS = ['#00347D','#F38200','#16A34A','#2563EB','#9333EA','#DC2626'];
  function renderCardPhoto(emp) {
    const el = document.getElementById('oc-empi-card-photo');
    if (!el) return;
    if (emp.photoUrl) {
      el.style.background = '';
      el.innerHTML = `<img src="${esc(emp.photoUrl)}" alt="${esc(displayName(emp))} 사진" />`;
      return;
    }
    const seed = Number(String(emp.id || '').slice(-2)) || 1;
    const ch = (displayName(emp) || '?').charAt(0);
    el.style.background = PHOTO_COLORS[seed % PHOTO_COLORS.length];
    el.style.color = '#fff';
    el.style.fontWeight = 'var(--fw-bold)';
    el.style.fontSize = '24px';
    el.textContent = ch;
  }

  /* ============ SCR-EMP-04 인사정보카드 Drawer ============
   *   외부 페이지(인사 관리/조직 관리)에서도 호출 가능 — App.HRInfoMgmtCard.open(emp, opts)
   *   opts.onSave: 저장/수정상신 후 호출되는 콜백 (호출 페이지가 자기 화면 재렌더할 때 사용)
   *   opts.external: true 면 입사자 관리의 STATE.rows 와 무관한 emp 로 인식 (인사·조직 관리 호출 케이스) */

  /* 입사자 작성 항목 mock 데이터 — infoDone 이상에서 사용 (데모용 결정론 생성)
   *   같은 입사자는 같은 값으로 일관되게 표시되도록 emp.id 의 끝 두 자리 seed 사용 */
  function personalMock(emp) {
    const seed = Number(String(emp.id || '').slice(-2)) || 1;
    const pick = (arr) => arr[seed % arr.length];
    const isMale = emp.gender === 'M';
    const lastName = (emp.fname || '김');
    return {
      body: {
        신장:     pick(['170 cm','175 cm','165 cm','180 cm','172 cm','168 cm']),
        체중:     pick(['62 kg','70 kg','55 kg','75 kg','68 kg','58 kg']),
        혈액형:   pick(['A형','B형','O형','AB형']) + (seed % 2 ? ' Rh+' : ' Rh+'),
        시력:     pick(['좌 1.0 / 우 1.0','좌 0.8 / 우 0.9','좌 1.2 / 우 1.0','좌 0.6 / 우 0.7']),
        색맹:     '정상',
        보훈여부: seed % 11 === 0 ? '보훈가족' : '해당없음',
      },
      military: isMale
        ? { 병역구분: pick(['군필','군필','군필','면제']), 군별: pick(['육군','해군','공군','해병대']),
            계급: pick(['병장','상병','병장','상사(예)']), 병역기간: '2014-03-04 ~ 2016-01-15' }
        : { 병역구분: '비대상', 군별: '-', 계급: '-', 병역기간: '-' },
      family: [
        { 관계: '부', 성명: lastName + '아버지', 생년월일: '1960-05-12', 직업: '회사원' },
        { 관계: '모', 성명: '이어머니',         생년월일: '1962-08-23', 직업: '주부'   },
      ].concat(seed % 3 === 0 ? [{ 관계: '배우자', 성명: '박배우자', 생년월일: '1992-04-07', 직업: '디자이너' }] : []),
      education: [
        { 학교: '서울고등학교',  전공: '인문계',       기간: '2007-03 ~ 2010-02', 졸업여부: '졸업' },
        { 학교: pick(['서울대학교','연세대학교','고려대학교','한양대학교','성균관대학교']),
          전공: pick(['경영학과','컴퓨터공학과','전자공학과','산업디자인과','경제학과']),
          기간: '2010-03 ~ 2014-02', 졸업여부: '졸업' },
      ],
      certs: seed % 7 === 0 ? [] : [
        { 자격증: pick(['정보처리기사','컴퓨터활용능력 1급','SQLD','PMP','워드프로세서 1급']),
          발급기관: '한국산업인력공단', 취득일: '2015-05-12' },
      ],
      langs: seed % 5 === 0 ? [] : [
        { 언어: '영어', 시험: 'TOEIC', 점수: String(700 + (seed * 13) % 200), 취득일: '2016-03-15' },
      ],
      career: [
        { 회사명: pick(['(주)이전직장','(주)테크원','(주)현대디지털','(주)나우솔루션']),
          기간: '2020-03 ~ 2024-12', 최종직위: pick(['대리','과장','주임','사원']),
          담당업무: pick(['HR 운영','SW 개발','회계 관리','품질관리','마케팅']) },
        { 회사명: pick(['(주)초기직장','(주)미래시스템','(주)코어플랜','(주)한길']),
          기간: '2018-06 ~ 2020-02', 최종직위: '사원',
          담당업무: pick(['HR 보조','개발 인턴','경영지원','품질 보조']) },
      ],
      /* === 이하 입사확정 이후 연동 데이터 (confirmed/retired 에서만 렌더) === */
      kyungjo: seed % 4 === 0 ? [{ 구분: '본인 결혼', 일자: '2024-09-21', 지원: '경조사비 30만원', 비고: '-' }] : [],
      포상:   seed % 6 === 0 ? [{ 포상명: '우수사원', 일자: '2024-12-30', 사유: '4분기 우수 실적', 비고: '-' }] : [],
      eval:   [{ 평가연도: '2024', 등급: pick(['S','A','A','B+','B','B']), 평가자: '김부서장', 평가일: '2024-12-15' }],
      attend: { 기준월: '2026-04', 출근일: '20일', 지각: seed % 5 === 0 ? '1회' : '0회', 결근: '0회', 연장근로: pick(['8h','12h','4h','16h','0h']) },
      leave:  { 총연차: 15, 사용: 5 + (seed % 6), 잔여: 15 - (5 + (seed % 6)), 사용률: ((5 + (seed % 6)) / 15 * 100).toFixed(0) + '%' },
      wageChange: [
        { 변경일: '2025-01-01', 항목: '기본급', 변경전: '3,000,000', 변경후: '3,200,000', 사유: '연봉 협상' },
      ],
      payouts: [
        { 지급월: '2026-04', 기본급: '3,200,000', 직무수당: '200,000', 식대: '200,000', 상여: '0', 합계: '3,600,000' },
        { 지급월: '2026-03', 기본급: '3,200,000', 직무수당: '200,000', 식대: '200,000', 상여: '0', 합계: '3,600,000' },
      ],
      pension: { 가입일: '2026-05-15', 총누계액: '6,400,000', 중도정산일: '-' },
      retire:  { 퇴직일: '2026-04-30', 퇴직사유: pick(['본인 사유','계약 만료','정년 퇴직','권고 사직']) },
    };
  }

  /* 섹션 (제목 + 본문) 한 블록 — .fm-section / .fm-section__title 로 통일
   *   ex) `.fm-tbl--compact` 또는 `.tbl tbl--striped` 가 본문으로 들어옴 */
  function infoSection(title, bodyHTML, opts) {
    const o = opts || {};
    const subHTML = o.sub ? ` <small style="color:var(--color-text-muted);font-weight:var(--fw-regular);font-size:var(--fs-xs);">${esc(o.sub)}</small>` : '';
    /* opts.actions — 섹션 헤더 우측 액션 HTML (예: '전체 발송' 버튼). 있을 때만 flex 헤더로 전환 */
    if (o.actions) {
      return `<section class="fm-section">
        <div class="fm-section__title" style="display:flex;align-items:center;gap:8px;">
          <span style="flex:1;min-width:0;">${esc(title)}${subHTML}</span>
          <div style="display:flex;gap:6px;flex-shrink:0;">${o.actions}</div>
        </div>
        ${bodyHTML}
      </section>`;
    }
    return `<section class="fm-section">
      <div class="fm-section__title">${esc(title)}${subHTML}</div>
      ${bodyHTML}
    </section>`;
  }

  /* 빈 상태 박스 — 가운데 정렬 + 톤 다운된 배경, 모든 섹션의 empty state 통일
   *   text: 표시할 안내 문구 (기본값: '아직 제출된 정보가 없습니다.') */
  function emptyBox(text) {
    const msg = text || '아직 제출된 정보가 없습니다.';
    return `<div style="
      padding: 28px 16px;
      background: var(--color-surface-alt);
      border-radius: var(--radius-md);
      text-align: center;
      color: var(--color-text-muted);
      font-size: var(--fs-sm);
    ">${esc(msg)}</div>`;
  }
  /* 후방호환 — 기존 infoEmpty 호출처 */
  function infoEmpty() { return emptyBox(); }

  /* read 모드 셀 값 — 빈 값은 muted '-' */
  function readVal(v) {
    if (v === '' || v == null) return `<span style="color:var(--color-text-muted);">-</span>`;
    return esc(v);
  }
  /* fm-tbl 한 셀 — read 모드면 텍스트, edit 모드면 input/select 가 .fm-tbl__value 안에 들어감
   *   edit 옵션:
   *     null/undefined           — read only
   *     { name: 'k' }            — text input (data-empi-field="k")
   *     { name:'k', type:'date'} — typed input
   *     { name:'k', options:[…]} — select */
  function fmCell(label, value, edit) {
    let valHTML;
    if (edit) {
      if (edit.options) {
        /* options 는 string 배열 (그대로 value/label) 이거나 {value,label} 객체 배열 — 둘 다 허용 */
        const opts = (edit.options || []).map(o => {
          const v = (o && typeof o === 'object') ? o.value : o;
          const l = (o && typeof o === 'object') ? o.label : o;
          return `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(l || '선택')}</option>`;
        }).join('');
        valHTML = `<select class="select" data-empi-field="${esc(edit.name)}" style="width:100%;">${opts}</select>`;
      } else {
        const t = edit.type || 'text';
        valHTML = `<input class="input" type="${esc(t)}" data-empi-field="${esc(edit.name)}" value="${esc(value || '')}" style="width:100%;" />`;
      }
    } else {
      valHTML = (typeof value === 'string' && value.indexOf('<') === 0) ? value : readVal(value);
    }
    /* input/select 가 들어갈 때만 수직 패딩 살짝 줄여 input 자체 높이와 균형 */
    const valStyle = edit ? ' style="padding-top:6px;padding-bottom:6px;"' : '';
    return `<div class="fm-tbl__label">${esc(label)}</div><div class="fm-tbl__value"${valStyle}>${valHTML}</div>`;
  }

  /* fm-tbl 한 행 (row--N) — cells 배열 (fmCell 결과들) */
  function fmRowOf(cells) {
    return `<div class="fm-tbl__row fm-tbl__row--${cells.length}">${cells.join('')}</div>`;
  }

  /* 후방호환 — 기존 fmRow([['라벨', 값], ...]) 형태 (read 전용) */
  function fmRow(pairs) {
    return fmRowOf(pairs.map(([l, v]) => fmCell(l, v)));
  }

  function field(label, value, editable, name, opts) {
    const v = value === '' || value == null ? '' : value;
    if (!editable) {
      return `<div class="form-field">
        <label class="form-label">${esc(label)}</label>
        <div style="padding:6px 0;color:var(--color-text);">${v === '' ? '<span style="color:var(--color-text-muted);">-</span>' : esc(v)}</div>
      </div>`;
    }
    const o = opts || {};
    if (o.type === 'select') {
      const options = (o.options || []).map(op =>
        `<option value="${esc(op)}" ${op === v ? 'selected' : ''}>${op || '선택'}</option>`
      ).join('');
      return `<div class="form-field">
        <label class="form-label">${esc(label)}</label>
        <select class="select input--full" data-empi-field="${esc(name)}" style="width:100%">${options}</select>
      </div>`;
    }
    const type = o.type || 'text';
    return `<div class="form-field">
      <label class="form-label">${esc(label)}</label>
      <input class="input input--full" type="${type}" data-empi-field="${esc(name)}" value="${esc(v)}" />
    </div>`;
  }

  /* 공개정보 신상사항 — read/edit 통합 (.fm-tbl--compact 구조 유지)
   *   editing 일 때 각 셀의 .fm-tbl__value 안에 input/select 가 직접 들어감 */
  function renderPublicGrid(emp, editing) {
    const empTypeText = empTypeLabel(emp).replace(/<[^>]+>/g, '');
    const genderText = emp.gender === 'M' ? '남' : (emp.gender === 'F' ? '여' : '');
    /* e(편집옵션) — editing 모드일 때만 활성, 아니면 read */
    const e = (opts) => editing ? opts : null;
    /* 아이디 — 본인이 설정하는 값이라 HR 수정 불가, 아이디설정완료 이상에서만 표시 */
    const idRow = emp.userId ? fmRowOf([fmCell('아이디', emp.userId)]) : '';
    /* 수습 — 정규직 한정 (계약직/일용직에는 해당 없음) */
    const probRow = emp.empType === 'regular'
      ? fmRowOf([fmCell('수습', renderProbationValue(emp))])
      : '';

    /* select 옵션 — 고용 형태/성별은 코드↔라벨 매핑이므로 {value,label} 객체 배열 */
    const empTypeOptions = Object.keys(EMP_TYPE_LABEL).map(k => ({ value: k, label: EMP_TYPE_LABEL[k] }));
    const genderOptions  = [{ value: 'M', label: '남' }, { value: 'F', label: '여' }];

    /* 사번(시스템 식별자)·아이디(본인 설정) 외 신상사항 전 필드는 인사담당자 수정 가능.
     *   부서/직무/직위/직책/고용 형태(CRITICAL_FIELDS)는 저장 시 승인 모달로 라우팅(인사팀장 결재). */

    /* 성명(한글) — 편집 시 성/이름 분리 입력. 좁은 Drawer 폭을 고려해 전용 행으로 분리. */
    const nameBlock = editing
      ? fmRowOf([fmCell('사번', emp.id)]) +
        `<div class="fm-tbl__row fm-tbl__row--1">
           <div class="fm-tbl__label">성명(한글)</div>
           <div class="fm-tbl__value" style="padding-top:6px;padding-bottom:6px;">
             <div style="display:flex;gap:6px;">
               <input class="input" type="text" data-empi-field="fname" value="${esc(emp.fname || '')}" placeholder="성" style="width:90px;" />
               <input class="input" type="text" data-empi-field="gname" value="${esc(emp.gname || '')}" placeholder="이름" style="flex:1;" />
             </div>
           </div>
         </div>`
      : fmRowOf([fmCell('사번', emp.id), fmCell('성명(한글)', displayName(emp))]);

    return `
      <div class="fm-tbl fm-tbl--compact">
        ${nameBlock}
        ${idRow}
        ${fmRowOf([fmCell('성명(영문)', emp.ename, e({ name:'ename' })), fmCell('성별', editing ? emp.gender : genderText, e({ name:'gender', options: genderOptions }))])}
        ${fmRowOf([fmCell('생년월일', emp.birth, e({ name:'birth', type:'date' })), fmCell('입사일', emp.joinDate, e({ name:'joinDate', type:'date' }))])}
        ${fmRowOf([fmCell('부서', emp.dept, e({ name:'dept', options: MASTER.depts.filter(Boolean) })), fmCell('직무', emp.job, e({ name:'job', options: MASTER.jobs.filter(Boolean) }))])}
        ${fmRowOf([fmCell('직위', emp.rank, e({ name:'rank', options: MASTER.ranks.filter(Boolean) })), fmCell('직책', emp.position, e({ name:'position', options: MASTER.positions.filter(Boolean) }))])}
        ${fmRowOf([fmCell('고용 형태', editing ? emp.empType : empTypeText, e({ name:'empType', options: empTypeOptions }))])}
        ${probRow}
        ${fmRowOf([fmCell('연락처', emp.phone, e({ name:'phone' })), fmCell('E-Mail', emp.email, e({ name:'email', type:'email' }))])}
        ${fmRowOf([fmCell('사업장', emp.site, e({ name:'site', options: MASTER.sites }))])}
        ${fmRowOf([fmCell('주소', emp.address || '<span style="color:var(--color-text-muted);">미등록</span>', e({ name:'address' }))])}
      </div>
    `;
  }

  /** 수습 적용 여부 + 기간을 한 셀에 표시 — fmCell 은 '<'로 시작하면 HTML 그대로 사용 */
  function renderProbationValue(emp) {
    if (!emp.probation) {
      return '<span style="color:var(--color-text-muted);">미적용</span>';
    }
    const hasPeriod = emp.probationStart && emp.probationEnd;
    const period = hasPeriod
      ? ` <span style="color:var(--color-text-muted);font-size:var(--fs-sm);">${esc(emp.probationStart)} ~ ${esc(emp.probationEnd)}</span>`
      : '';
    return `<span class="pill pill--success">적용</span>${period}`;
  }

  function renderPublicPanel(emp) {
    const canEdit = emp.status !== 'retired';
    const editing = STATE.drawerEditMode && canEdit;
    const personalGrid = renderPublicGrid(emp, editing);
    const done = emp.infoStatus === 'done';
    const m = done ? personalMock(emp) : null;
    const confirmedOrRetired = ['completed','contractExpired','retired'].includes(emp.status);

    const careerHTML = (done && m.career.length) ? `
      <table class="tbl tbl--striped">
        <thead><tr><th>회사명</th><th>기간</th><th>최종직위</th><th>담당업무</th></tr></thead>
        <tbody>
          ${m.career.map(c => `<tr><td>${esc(c.회사명)}</td><td>${esc(c.기간)}</td><td>${esc(c.최종직위)}</td><td>${esc(c.담당업무)}</td></tr>`).join('')}
        </tbody>
      </table>
    ` : infoEmpty();

    const appointHTML = confirmedOrRetired ? `
      <table class="tbl tbl--striped">
        <thead><tr><th>부서명</th><th>기간</th><th>최종직위</th><th>담당업무</th></tr></thead>
        <tbody><tr><td>${esc(emp.dept || '-')}</td><td>${esc(dispYmd(emp.joinDate))} ~ 현재</td><td>${esc(emp.rank || '-')}</td><td>${esc(emp.job || '-')}</td></tr></tbody>
      </table>
    ` : emptyBox('입사 확정 후 데이터가 연동됩니다.');

    const disabilityHTML = done
      ? `<div class="fm-tbl fm-tbl--compact">${fmRow([['장애여부','해당없음'],['장애등급','-']])}${fmRow([['장애등록번호','-'],['등록일자','-']])}</div>`
      : emptyBox();

    const linkedEmpty = emptyBox('입사 확정 후 데이터가 연동됩니다.');

    /* 연동 섹션들 — confirmed/retired 에서만 mock 데이터 표시 */
    /* 경조사 컬럼: 발생일 | 경조내용 | 경조금 | 화환비 | 비고 — 금액 셀은 white-space:nowrap 으로 줄바꿈 방지 */
    const kyungjoHTML = (confirmedOrRetired && m && m.kyungjo.length) ? `
      <table class="tbl tbl--striped">
        <thead><tr><th style="width:110px;">발생일</th><th>경조내용</th><th style="width:130px;text-align:right;white-space:nowrap;">경조금</th><th style="width:120px;text-align:right;white-space:nowrap;">화환비</th><th>비고</th></tr></thead>
        <tbody>${m.kyungjo.map(k => `<tr><td>${esc(k.일자)}</td><td>${esc(k.구분)}</td><td style="text-align:right;white-space:nowrap;">${esc(k.지원 || '-')}</td><td style="text-align:right;white-space:nowrap;">${esc(k.화환비 || '-')}</td><td>${esc(k.비고 || '-')}</td></tr>`).join('')}</tbody>
      </table>
    ` : (confirmedOrRetired ? emptyBox('등록된 경조 기록이 없습니다.') : linkedEmpty);

    /* 포상 컬럼: 종류 | 통보일 | 사유 | 결과 */
    const posangHTML = (confirmedOrRetired && m && m.포상.length) ? `
      <table class="tbl tbl--striped">
        <thead><tr><th style="width:120px;">종류</th><th style="width:110px;">통보일</th><th>사유</th><th style="width:140px;">결과</th></tr></thead>
        <tbody>${m.포상.map(p => `<tr><td>${esc(p.포상명)}</td><td>${esc(p.일자)}</td><td>${esc(p.사유)}</td><td>${esc(p.결과 || p.비고 || '-')}</td></tr>`).join('')}</tbody>
      </table>
    ` : (confirmedOrRetired ? emptyBox('등록된 포상 기록이 없습니다.') : linkedEmpty);

    /* 평가 컬럼: 연도 | 점수 | 등급 */
    const evalHTML = (confirmedOrRetired && m) ? `
      <table class="tbl tbl--striped">
        <thead><tr><th style="width:120px;">연도</th><th style="width:120px;text-align:right;">점수</th><th>등급</th></tr></thead>
        <tbody>${m.eval.map(v => `<tr><td>${esc(v.평가연도)}</td><td style="text-align:right;">${esc(v.점수 || '-')}</td><td><span class="pill pill--soft-blue">${esc(v.등급)}</span></td></tr>`).join('')}</tbody>
      </table>
    ` : linkedEmpty;

    /* 근태: 섹션 헤더 우측에 YY/MM select + 귀속연도 YY (한 줄, vertical 가운데, 왼쪽 여백) */
    const attendYear = (m && m.attend && m.attend.year) || (emp.joinDate || '').slice(0,4) || '2026';
    const attendActions = (confirmedOrRetired && m) ? `
      <div style="display:inline-flex;align-items:center;gap:8px;margin-left:12px;">
        <select class="select select--sm" style="width:120px;flex-shrink:0;">
          <option>${esc(attendYear)}/01</option><option>${esc(attendYear)}/02</option><option>${esc(attendYear)}/03</option><option>${esc(attendYear)}/04</option><option selected>${esc(attendYear)}/05</option>
        </select>
        <small style="color:var(--color-text-muted);font-size:var(--fs-xs);white-space:nowrap;line-height:1;">귀속연도 ${esc(attendYear)}</small>
      </div>
    ` : '';
    const attendHTML = (confirmedOrRetired && m) ? `
      <table class="tbl tbl--striped">
        <thead><tr><th style="width:90px;">월별</th><th style="width:120px;text-align:right;">지각(분)</th><th style="width:120px;text-align:right;">조퇴(분)</th><th style="width:120px;text-align:right;">결근(일)</th></tr></thead>
        <tbody>
          ${(m.attend.monthly || [
            { 월: attendYear + '/04', 지각: 0,  조퇴: 0,  결근: 0 },
            { 월: attendYear + '/05', 지각: 15, 조퇴: 0,  결근: 0 },
          ]).map(row => `<tr><td>${esc(row.월)}</td><td style="text-align:right;">${esc(row.지각)}</td><td style="text-align:right;">${esc(row.조퇴)}</td><td style="text-align:right;">${esc(row.결근)}</td></tr>`).join('')}
        </tbody>
      </table>
    ` : linkedEmpty;

    /* 연차: 해당연도 | 발생일 | 발생연차 | 사용연차 | 최종연차 | 비고 */
    const leaveHTML = (confirmedOrRetired && m) ? `
      <table class="tbl tbl--striped">
        <thead><tr><th style="width:90px;">해당연도</th><th style="width:110px;">발생일</th><th style="width:100px;text-align:right;">발생연차</th><th style="width:100px;text-align:right;">사용연차</th><th style="width:100px;text-align:right;">최종연차</th><th>비고</th></tr></thead>
        <tbody>
          ${(m.leave.rows || [
            { 해당연도: '2025', 발생일: '2025-01-01', 발생: m.leave.총연차, 사용: m.leave.사용, 최종: m.leave.잔여, 비고: '-' },
          ]).map(row => `<tr><td>${esc(row.해당연도)}</td><td>${esc(row.발생일)}</td><td style="text-align:right;">${esc(row.발생)}일</td><td style="text-align:right;">${esc(row.사용)}일</td><td style="text-align:right;">${esc(row.최종)}일</td><td>${esc(row.비고 || '-')}</td></tr>`).join('')}
        </tbody>
      </table>
    ` : linkedEmpty;

    return `
      ${infoSection('신상사항', personalGrid)}
      ${infoSection('경력사항', careerHTML)}
      ${infoSection('발령사항', appointHTML)}
      ${infoSection('장애여부', disabilityHTML)}
      ${infoSection('경조', kyungjoHTML)}
      ${infoSection('포상·징계', posangHTML)}
      ${infoSection('평가', evalHTML)}
      ${infoSection('근태', attendHTML, attendActions ? { actions: attendActions } : null)}
      ${infoSection('연차', leaveHTML)}
    `;
  }

  function renderPrivatePanel(emp) {
    /* 민감정보 — read-only. 공개정보 탭에 이미 있는 사번/성명/성별은 중복 제거, 주민등록번호만 남김
     * 정책 (안내 문구는 표시하지 않음): 본 탭은 인사팀원·인사팀장·대표이사만 접근, 주민등록번호 마스킹 표시 */
    /* 주민등록번호 — 항상 마스킹 (앞 6자리 + 성별 1자리만, 뒷자리 노출 불가) */
    const ssn = emp.ssn ? (emp.ssn.slice(0, 8) + '●●●●●●') : '';
    return `
      ${infoSection('민감정보', `
        <div class="fm-tbl fm-tbl--compact">
          ${fmRowOf([fmCell('주민등록번호', ssn)])}
        </div>
      `)}

      ${renderPersonalSections(emp)}

      ${renderLinkedSections(emp)}
    `;
  }

  /* 연동 섹션들 (비공개 탭) — 임금변동·급상여·퇴직연금·퇴직사항 각각 분리
   *   confirmed/retired 면 mock 데이터, 아니면 emptyBox */
  function renderLinkedSections(emp) {
    const confirmedOrRetired = ['completed','contractExpired','retired'].includes(emp.status);
    const retired = emp.status === 'retired';
    const m = confirmedOrRetired ? personalMock(emp) : null;
    const linkedEmpty = emptyBox('입사 확정 후 데이터가 연동됩니다.');

    const wageHTML = (m && m.wageChange.length) ? `
      <table class="tbl tbl--striped">
        <thead><tr><th>변경일</th><th>항목</th><th>변경 전</th><th>변경 후</th><th>사유</th></tr></thead>
        <tbody>${m.wageChange.map(w => `<tr><td>${esc(w.변경일)}</td><td>${esc(w.항목)}</td><td style="text-align:right;">${esc(w.변경전)}</td><td style="text-align:right;">${esc(w.변경후)}</td><td>${esc(w.사유)}</td></tr>`).join('')}</tbody>
      </table>
    ` : linkedEmpty;

    const payHTML = (m && m.payouts.length) ? `
      <table class="tbl tbl--striped">
        <thead><tr><th>지급월</th><th>기본급</th><th>직무수당</th><th>식대</th><th>상여</th><th>합계</th></tr></thead>
        <tbody>${m.payouts.map(p => `<tr>
          <td>${esc(p.지급월)}</td>
          <td style="text-align:right;">${esc(p.기본급)}</td>
          <td style="text-align:right;">${esc(p.직무수당)}</td>
          <td style="text-align:right;">${esc(p.식대)}</td>
          <td style="text-align:right;">${esc(p.상여)}</td>
          <td style="text-align:right;font-weight:var(--fw-semibold);">${esc(p.합계)}</td>
        </tr>`).join('')}</tbody>
      </table>
    ` : linkedEmpty;

    const pensionHTML = (m && m.pension) ? `
      <div class="fm-tbl fm-tbl--compact">
        ${fmRow([['가입일', m.pension.가입일], ['중도정산일', m.pension.중도정산일]])}
        ${fmRow([['총누계액', m.pension.총누계액 + ' 원'], ['-', '-']])}
      </div>
    ` : linkedEmpty;

    const retireHTML = retired
      ? `<div class="fm-tbl fm-tbl--compact">${fmRow([['퇴직일', m.retire.퇴직일], ['퇴직사유', m.retire.퇴직사유]])}</div>`
      : emptyBox('퇴직 처리 후 표시됩니다.');

    return `
      ${infoSection('임금변동', wageHTML)}
      ${infoSection('급상여',   payHTML)}
      ${infoSection('퇴직연금', pensionHTML)}
      ${infoSection('퇴직사항', retireHTML)}
    `;
  }

  /* 입사자 작성 6개 섹션 — 신체 / 병역 / 가족 / 학력 / 자격 / 어학
   *   infoDone 이상이면 mock 채워 표시, 그 이전엔 섹션별 '아직 제출된 정보가 없습니다' */
  function renderPersonalSections(emp) {
    const done = emp.infoStatus === 'done';
    const m = done ? personalMock(emp) : null;

    // 신체사항 (.fm-tbl--compact)
    const bodyHTML = done ? `
      <div class="fm-tbl fm-tbl--compact">
        ${fmRow([['신장', m.body.신장], ['체중', m.body.체중]])}
        ${fmRow([['혈액형', m.body.혈액형], ['시력', m.body.시력]])}
        ${fmRow([['색맹', m.body.색맹], ['보훈여부', m.body.보훈여부]])}
      </div>
    ` : infoEmpty();

    // 병역사항 (.fm-tbl--compact)
    const militaryHTML = done ? `
      <div class="fm-tbl fm-tbl--compact">
        ${fmRow([['병역구분', m.military.병역구분], ['군별', m.military.군별]])}
        ${fmRow([['계급', m.military.계급], ['병역기간', m.military.병역기간]])}
      </div>
    ` : infoEmpty();

    // 가족사항 (.tbl tbl--striped)
    const familyHTML = (done && m.family.length) ? `
      <table class="tbl tbl--striped">
        <thead><tr><th style="width:80px;">관계</th><th>성명</th><th>생년월일</th><th>직업</th></tr></thead>
        <tbody>
          ${m.family.map(f => `<tr><td>${esc(f.관계)}</td><td>${esc(f.성명)}</td><td>${esc(f.생년월일)}</td><td>${esc(f.직업)}</td></tr>`).join('')}
        </tbody>
      </table>
    ` : infoEmpty();

    // 학력사항 (.tbl tbl--striped)
    const eduHTML = (done && m.education.length) ? `
      <table class="tbl tbl--striped">
        <thead><tr><th>학교</th><th>전공</th><th>기간</th><th style="width:80px;">졸업여부</th></tr></thead>
        <tbody>
          ${m.education.map(e => `<tr><td>${esc(e.학교)}</td><td>${esc(e.전공)}</td><td>${esc(e.기간)}</td><td>${esc(e.졸업여부)}</td></tr>`).join('')}
        </tbody>
      </table>
    ` : infoEmpty();

    // 자격사항 (.tbl tbl--striped)
    const certsHTML = (done && m.certs.length) ? `
      <table class="tbl tbl--striped">
        <thead><tr><th>자격증</th><th>발급기관</th><th>취득일</th></tr></thead>
        <tbody>
          ${m.certs.map(c => `<tr><td>${esc(c.자격증)}</td><td>${esc(c.발급기관)}</td><td>${esc(c.취득일)}</td></tr>`).join('')}
        </tbody>
      </table>
    ` : (done ? emptyBox('등록된 자격이 없습니다.') : emptyBox());

    // 어학사항 (.tbl tbl--striped)
    const langsHTML = (done && m.langs.length) ? `
      <table class="tbl tbl--striped">
        <thead><tr><th style="width:80px;">언어</th><th>시험</th><th>점수</th><th>취득일</th></tr></thead>
        <tbody>
          ${m.langs.map(l => `<tr><td>${esc(l.언어)}</td><td>${esc(l.시험)}</td><td>${esc(l.점수)}</td><td>${esc(l.취득일)}</td></tr>`).join('')}
        </tbody>
      </table>
    ` : (done ? emptyBox('등록된 어학 정보가 없습니다.') : emptyBox());

    return [
      infoSection('신체사항', bodyHTML),
      infoSection('병역사항', militaryHTML),
      infoSection('가족사항', familyHTML),
      infoSection('학력사항', eduHTML),
      infoSection('자격사항', certsHTML),
      infoSection('어학사항', langsHTML),
    ].join('');
  }

  /* OC drawer 의 계약·서류 탭 — 외부 호출 (인사 관리/조직 관리) 케이스. read-only.
   *   미리보기만 가능, 발송/재발송/작성 액션 없음. */
  function renderDocsPanel(emp) {
    /* OC drawer 의 계약·서류 탭 — 외부 호출(인사 관리/입사 서류 관리 등)에서도
     * 작성/발송/재발송/미리보기 액션이 모두 활성화되도록 readOnly 플래그를 끔. */
    return renderContractDocsPanel(emp);
  }

  /* ============ 이력 패널 — 입사자 관리 detail 전용 (Drawer 미노출) ============
   *   인사정보·이메일 발송/재발송, 계약서 발송/재발송, 입사서류 발송/재발송 등
   *   사원 단위로 발생한 액션 로그를 일시 역순 테이블로 표시.
   *
   *   데모: emp 의 발송일/담당자 필드를 기반으로 이벤트를 생성. 실제 시스템에서는
   *   별도 audit 로그 테이블을 조회하여 채운다. */
  function renderHistoryPanel(emp) {
    const events = buildHistoryEvents(emp);
    if (!events.length) {
      return infoSection('이력', emptyBox('아직 발생한 이력이 없습니다.'));
    }
    const body = `
      <table class="tbl tbl--striped">
        <thead>
          <tr>
            <th style="width:170px;">일시</th>
            <th>내용</th>
            <th style="width:120px;">담당자</th>
          </tr>
        </thead>
        <tbody>
          ${events.map(ev => `
            <tr>
              <td>${esc(ev.at)}</td>
              <td>
                <strong style="color:var(--color-text);">${esc(ev.title)}</strong>
                ${ev.detail ? `<div style="font-size:var(--fs-xs);color:var(--color-text-muted);margin-top:2px;">${esc(ev.detail)}</div>` : ''}
              </td>
              <td>${esc(ev.actor || '-')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    return infoSection(`이력 (${events.length}건)`, body);
  }

  /* 이력 이벤트 빌더 — { at, title, detail, actor } 객체 배열을 일시 역순으로 반환.
   *   - at:    YYYY-MM-DD HH:MM (사번 seed 기반 합성 시각, 같은 날짜도 순서 구분)
   *   - title: 표 「내용」 열 본문
   *   - detail: 부가 설명 (사유·수신처 등, 작은 글씨로 한 줄 더 표시)
   *   - actor: 표 「담당자」 열 (액션 수행자) */
  function buildHistoryEvents(emp) {
    const events = [];
    const seed = Number(String(emp.id || '').slice(-2)) || 1;
    function stamp(date, offsetIdx) {
      if (!date) return '';
      const h = String(8 + ((seed + offsetIdx * 3) % 10)).padStart(2, '0');
      const m = String(((seed + offsetIdx * 7) * 11) % 60).padStart(2, '0');
      return `${dispYmd(date)}   ${h}:${m}`;
    }
    /* 1) 등록 */
    if (emp.registeredAt) {
      events.push({
        at: stamp(emp.registeredAt, 0),
        title: '입사자 등록',
        detail: '시스템 신규 등록',
        actor: emp.registeredBy || '',
      });
    }
    /* 2) 이메일 발송 / 재발송 */
    if (emp.emailSentDate) {
      events.push({
        at: stamp(emp.emailSentDate, 1),
        title: '인사정보 등록 안내 이메일 발송',
        detail: `수신: ${emp.email || '-'}`,
        actor: emp.emailSentBy || '',
      });
      if (emp.mailFailCode && MILESTONES.idDone(emp)) {
        events.push({
          at: stamp(emp.emailSentDate, 2),
          title: '인사정보 등록 안내 이메일 재발송',
          detail: `사유: ${FAIL_LABEL[emp.mailFailCode] || '발송 실패'}`,
          actor: emp.emailSentBy || '',
        });
      }
    }
    /* 3) 아이디 설정 완료 — 마일스톤 도달 행만 (userId 있음) */
    if (MILESTONES.idDone(emp)) {
      events.push({
        at: stamp(emp.emailSentDate || emp.registeredAt, 3),
        title: '아이디 설정 완료',
        detail: `로그인 아이디: ${emp.userId}`,
        actor: '본인',
      });
    }
    /* 4) 정보 등록 완료 */
    if (MILESTONES.infoDone(emp)) {
      events.push({
        at: stamp(emp.contractSentDate || emp.docsSentDate || emp.emailSentDate, 4),
        title: '인사정보 등록 완료',
        detail: '본인 입력·제출',
        actor: '본인',
      });
    }
    /* 5) 계약서 발송 / 재발송 (도급직 제외) */
    if (emp.contractSentDate && !emp.contractOut) {
      events.push({
        at: stamp(emp.contractSentDate, 5),
        title: '근로계약서·임금계약서 발송',
        detail: '',
        actor: emp.contractSentBy || '',
      });
      if ((seed % 5) === 2) {
        events.push({
          at: stamp(emp.contractSentDate, 6),
          title: '계약서 재발송',
          detail: '사유: 근로자 요청 — 직무·근무지 정정 후 재발송',
          actor: emp.contractSentBy || '',
        });
      }
      if (emp.contractLabor || emp.contractWage) {
        const laborTxt = emp.contractLabor ? '근로계약서 서명완료' : '근로계약서 미서명';
        const wageTxt  = emp.contractWage ? '임금계약서 서명완료' : '임금계약서 미서명';
        events.push({
          at: stamp(emp.contractSentDate, 7),
          title: '계약서 서명 완료',
          detail: `${laborTxt} · ${wageTxt}`,
          actor: '본인',
        });
      }
    }
    /* 6) 입사서류 발송 / 재발송 / 서명 완료 */
    if (emp.docsSentDate && (emp.docsSent || 0) > 0) {
      events.push({
        at: stamp(emp.docsSentDate, 8),
        title: `입사서류 ${emp.docsSent}건 발송`,
        detail: '',
        actor: emp.docsSentBy || '',
      });
      if ((seed % 6) === 1) {
        events.push({
          at: stamp(emp.docsSentDate, 9),
          title: '입사서류 재발송',
          detail: '사유: 일부 항목 누락 — 재제출 안내',
          actor: emp.docsSentBy || '',
        });
      }
      if ((emp.docSigned || 0) > 0) {
        events.push({
          at: stamp(emp.docsSentDate, 10),
          title: `입사서류 ${emp.docSigned}건 서명 완료`,
          detail: '근로자 전자 서명',
          actor: '본인',
        });
      }
    }
    /* 7) 입사 확정 (completed = 인사카드 생성) */
    if (emp.status === 'completed') {
      events.push({
        at: stamp(emp.contractSentDate || emp.docsSentDate, 11),
        title: '입사 확정',
        detail: '정책 조건 충족 — 인사카드 생성',
        actor: '시스템',
      });
    }
    /* 8) 계약 만료 */
    if (emp.status === 'contractExpired') {
      events.push({
        at: stamp(emp.contractEndDate, 12),
        title: '계약 만료',
        detail: `종료일 ${dispYmd(emp.contractEndDate) || '-'} — 정규직 전환 검토 대상`,
        actor: '시스템',
      });
    }
    /* 9) 퇴사 */
    if (emp.status === 'retired') {
      events.push({ at: stamp(emp.updatedAt || emp.registeredAt, 14), title: '퇴사 처리', detail: '', actor: 'HR' });
    }
    return events.filter(e => e.at).sort((a, b) => b.at.localeCompare(a.at));
  }

  /* ============ 계약·서류 패널 — 입사자 관리 detail + 인사정보카드 drawer 공용 ============
   *   상태값 — 입사 서류 관리 화면(joindocs)과 동일 명칭:
   *     미발송(unsent) / 미제출(pending) / 제출완료(completed) / 재서명 필요(resign)
   *
   *   opts.readOnly (default: false)
   *     false → 입사자 관리 detail 모드: 서류 행에 [발송]/[재발송] 액션 노출.
   *             클릭 시 emp.docsSentDate / docsSentBy / docs[i].status 갱신.
   *     true  → 인사 관리·조직 관리 drawer 모드: 미리보기만 가능. 발송 액션 없음.
   *
   *   계약서 행 ([근로/임금계약서]):
   *     · 미발송: readOnly=false 면 [작성] (계약 메뉴 라우팅), readOnly=true 면 액션 없음
   *     · 미제출/제출완료/만료: [미리보기] (양쪽 동일)
   *
   *   서류 데이터 소스 우선순위:
   *     1) App.JoinDocs.getEmps() 의 동일 사번 emp.docs (joindocs 가 단일 소스)
   *     2) emp.docsSent / emp.docSigned 카운트 (fallback) */
  function renderContractDocsPanel(emp, opts) {
    const readOnly = !!(opts && opts.readOnly);
    const wageRequired = !emp.contractOut && emp.empType !== 'outsourced';  // 일용직 포함 — 도급직만 임금계약 제외
    const isExpired = emp.status === 'contractExpired';
    const isContractType = emp.empType === 'contract' || emp.empType === 'daily';

    /* 한 행의 표준 HTML — 우측 상태 + 액션(있을 때만). meta 가 비었으면 .doc-card__meta 자체를 생략 */
    function rowHTML(opts) {
      const { label, pill, meta, actions } = opts;
      const metaHTML = meta ? `<div class="doc-card__meta">${meta}</div>` : '';
      return `
        <div class="doc-card">
          <div class="doc-card__main">
            <div class="doc-card__name">${esc(label)}</div>
            ${metaHTML}
          </div>
          <div class="doc-card__side">
            ${pill}
            ${actions || ''}
          </div>
        </div>
      `;
    }

    /* 4단계 상태 → pill HTML */
    function pillFor(status) {
      if (status === 'completed') return '<span class="pill pill--success">제출완료</span>';
      if (status === 'pending')   return '<span class="pill pill--warning">미제출</span>';
      if (status === 'resign')    return '<span class="pill pill--danger">재서명 필요</span>';
      return '<span class="pill">미발송</span>';
    }

    /* 계약서 한 행 — 서명완료 플래그 우선, 그 다음 발송일로 미발송·작성중·서명완료 매핑.
     *   · 미발송: [작성] 버튼 → 계약 메뉴로 라우팅 (해당 직원 자동 선택)
     *   · 작성중: [미리보기] (발송 후 서명 대기)
     *   · 서명완료: [미리보기] (서명 완료본 확인) */
    function contractPillFor(status) {
      if (status === 'completed') return '<span class="pill pill--success">서명완료</span>';
      if (status === 'pending')   return '<span class="pill pill--info">작성중</span>';
      return '<span class="pill">미발송</span>';
    }
    function contractRow(label, kind, signed) {
      /* 계약만료 — 발송·서명 여부와 무관하게 별도 표시 */
      if (isExpired && isContractType) {
        return rowHTML({
          label,
          pill: '<span class="pill pill--warning">계약만료</span>',
          meta: emp.contractEndDate ? `<span class="doc-card__meta-item">만료 ${esc(dispYmd(emp.contractEndDate))}</span>` : '',
          actions: `<button class="btn btn--xs" type="button" data-empi-contract-preview="${esc(kind)}">미리보기</button>`,
        });
      }
      const sent = !!emp.contractSentDate;
      const sentTxt = emp.contractSentDate ? `발송 ${esc(dispYmd(emp.contractSentDate))}${emp.contractSentBy ? ' · ' + esc(emp.contractSentBy) : ''}` : '';
      const status = signed ? 'completed' : (sent ? 'pending' : 'unsent');
      let actions = '';
      if (status === 'unsent') {
        /* 계약서는 [작성] = 계약 메뉴 라우팅 — read-only 에서는 액션 자체 없음 */
        if (!readOnly) {
          actions = `<button class="btn btn--xs btn--primary" type="button" data-empi-contract-write="${esc(kind)}">작성</button>`;
        }
      } else if (status === 'pending' || status === 'completed') {
        actions = `<button class="btn btn--xs" type="button" data-empi-contract-preview="${esc(kind)}">미리보기</button>`;
      }
      return rowHTML({
        label,
        pill: contractPillFor(status),
        meta: sentTxt ? `<span class="doc-card__meta-item">${sentTxt}</span>` : '',
        actions,
      });
    }

    /* 서류 단위 status 조회 — App.JoinDocs 우선, 없으면 docsSent/docSigned 카운트 기반 fallback */
    function lookupDocStatus(docKey, idx) {
      if (window.App && App.JoinDocs && typeof App.JoinDocs.getEmps === 'function') {
        try { App.JoinDocs.ensureInit && App.JoinDocs.ensureInit(); } catch (_) {}
        const empsAll = App.JoinDocs.getEmps() || [];
        const found = empsAll.find(e => e.id === emp.id);
        if (found && Array.isArray(found.docs)) {
          const d = found.docs.find(x => x.key === docKey);
          if (d) return { status: d.status, signedAt: d.signedAt || '' };
        }
      }
      const sent = idx < (emp.docsSent || 0);
      const signed = idx < (emp.docSigned || 0);
      return {
        status: !sent ? 'unsent' : (signed ? 'completed' : 'pending'),
        signedAt: '',
      };
    }

    function docRow(d, i) {
      const { status, signedAt } = lookupDocStatus(d.key, i);
      const sent = status !== 'unsent';
      const sentTxt = sent && emp.docsSentDate
        ? `발송 ${esc(dispYmd(emp.docsSentDate))}${emp.docsSentBy ? ' · ' + esc(emp.docsSentBy) : ''}`
        : '';
      const signedTxt = signedAt ? `서명 ${esc(signedAt)}` : '';
      const metaParts = [sentTxt && `<span class="doc-card__meta-item">${sentTxt}</span>`,
                        signedTxt && `<span class="doc-card__meta-item">${signedTxt}</span>`].filter(Boolean);
      /* 액션 결정 — readOnly=true 면 제출완료만 [미리보기], 그 외 액션 없음.
       *   readOnly=false 면 상태별로 [발송]/[재발송]/[미리보기] 노출. */
      let actions = '';
      if (readOnly) {
        if (status === 'completed') {
          actions = `<button class="btn btn--xs" type="button" data-empi-doc-preview="doc:${esc(d.key)}">미리보기</button>`;
        }
      } else {
        if (status === 'unsent') {
          actions = `<button class="btn btn--xs btn--primary" type="button" data-empi-doc-send="${esc(d.key)}">발송</button>`;
        } else if (status === 'pending') {
          actions = `<button class="btn btn--xs" type="button" data-empi-doc-preview="doc:${esc(d.key)}">미리보기</button>
                     <button class="btn btn--xs" type="button" data-empi-doc-resend="${esc(d.key)}">재발송</button>`;
        } else if (status === 'resign') {
          actions = `<button class="btn btn--xs btn--primary" type="button" data-empi-doc-send="${esc(d.key)}">재발송 (v2)</button>`;
        } else if (status === 'completed') {
          actions = `<button class="btn btn--xs" type="button" data-empi-doc-preview="doc:${esc(d.key)}">미리보기</button>`;
        }
      }
      return rowHTML({
        label: d.label,
        pill: pillFor(status),
        meta: metaParts.join(''),
        actions,
      });
    }

    /* 1) 계약 현황 — 도급직만 근로/임금 모두 해당없음. 일용직은 근로계약(기간제) + 임금계약(시급제) 모두 대상. */
    let contractBody;
    const isOutType = emp.empType === 'outsourced' || emp.contractOut;
    const laborNA = isOutType;   // 근로계약 해당없음 = 도급직만 (일용직은 근로계약 대상)
    const wageNA  = isOutType;   // 임금계약 해당없음 = 도급직만
    const naRow = (label, kindTxt, who) => rowHTML({
      label,
      pill: '<span class="pill">해당없음</span>',
      meta: `<span class="doc-card__meta-item">${who} — ${kindTxt} 해당없음</span>`,
      actions: '',
    });
    contractBody = [
      laborNA ? naRow('근로계약서', '근로계약', '도급직')
              : contractRow('근로계약서', 'labor', !!emp.contractLabor),
      wageNA  ? naRow('임금계약서', '임금계약', '도급직')
              : contractRow('임금계약서', 'wage', !!emp.contractWage),
    ].join('');

    /* 2) 서류 현황 */
    const docStatuses = CTR_DOCS.map((d, i) => lookupDocStatus(d.key, i).status);
    const sendableCount = docStatuses.filter(s => s === 'unsent' || s === 'resign').length;
    const docsBody = CTR_DOCS.map((d, i) => docRow(d, i)).join('');
    const docsBulkBtn = sendableCount > 0
      ? `<button class="btn btn--xs" type="button" data-empi-docs-bulk-send>전체 발송 (${sendableCount})</button>`
      : `<button class="btn btn--xs" type="button" disabled title="발송할 서류가 없습니다.">전체 발송</button>`;

    /* 임금계약 만료 신호 — 「완료」 판정과는 분리. 임박/도과 시 안내 배너 */
    const wageStatus = wageContractStatus(emp);
    let wageBanner = '';
    if (wageStatus && wageStatus.kind === 'soon') {
      wageBanner = `
        <div style="margin:0 0 10px;padding:10px 12px;background:rgba(245,158,11,.08);border-left:3px solid var(--color-warning);border-radius:0 var(--radius-md) var(--radius-md) 0;font-size:var(--fs-sm);">
          ⏳ 임금계약 만료 임박 — <strong>${esc(wageStatus.end)}</strong> (D-${wageStatus.days}). 새 임금계약서 작성이 필요합니다.
        </div>`;
    } else if (wageStatus && wageStatus.kind === 'expired') {
      wageBanner = `
        <div style="margin:0 0 10px;padding:10px 12px;background:rgba(220,38,38,.08);border-left:3px solid var(--color-danger);border-radius:0 var(--radius-md) var(--radius-md) 0;font-size:var(--fs-sm);">
          ⚠ 임금계약 만료 — <strong>${esc(wageStatus.end)}</strong>. 임금 잠정 유지 중. 새 임금계약서 작성 필요. (재직 자체는 유지)
        </div>`;
    }

    /* section 옵션 — 인사정보카드의 「계약」/「입사서류」 탭 분리 노출용.
     *   'contracts' → 계약 현황 (근로/임금계약서) 만
     *   'docs'      → 서류 현황 (입사서류 5종) 만
     *   'all'/생략  → 둘 다 (기본·외부 호출 호환) */
    const section = (opts && opts.section) || 'all';
    let html = '';
    if (section === 'contracts' || section === 'all') {
      html += wageBanner + infoSection('계약 현황', contractBody);
    }
    if (section === 'docs' || section === 'all') {
      html += infoSection('서류 현황', docsBody, { actions: docsBulkBtn });
    }
    return html;
  }

  /* 인사정보카드 탭 — 「계약」 단독 패널 (근로계약서·임금계약서) */
  function renderInfoCardContractsTab(emp) {
    return renderContractDocsPanel(emp, { section: 'contracts' });
  }
  /* 인사정보카드 탭 — 「입사서류」 단독 패널 (5종) */
  function renderInfoCardDocsTab(emp) {
    return renderContractDocsPanel(emp, { section: 'docs' });
  }

  /* host 인자: 입사자 관리 2 의 detail pane body (없으면 Drawer offcanvas body 사용)
   *   → 같은 패널 마크업을 페이지 전환 / Drawer 양쪽에서 동일 핸들러로 처리 */
  function bindDrawerEdits(emp, host) {
    const body = host || $('#oc-empi-card-body');
    if (!body) return;
    body.addEventListener('input', (e) => {
      const el = e.target.closest('[data-empi-field]');
      if (!el) return;
      const key = el.dataset.empiField;
      STATE.drawerPatch[key] = el.value;
      STATE.drawerDirty = true;
      const saveBtn = $('[data-empi-drawer-save]');
      const submitBtn = $('[data-empi-drawer-submit]');
      if (saveBtn) saveBtn.disabled = false;
      if (submitBtn) submitBtn.disabled = false;
    });
    body.addEventListener('change', (e) => {
      const el = e.target.closest('[data-empi-field]');
      if (!el) return;
      const key = el.dataset.empiField;
      STATE.drawerPatch[key] = el.value;
      STATE.drawerDirty = true;
      const saveBtn = $('[data-empi-drawer-save]');
      const submitBtn = $('[data-empi-drawer-submit]');
      if (saveBtn) saveBtn.disabled = false;
      if (submitBtn) submitBtn.disabled = false;
    });

    /* 서류·계약 행 액션 click 핸들러는 v2 Drawer 에서도 동일하게 동작해야 하므로
     *   별도 함수로 분리 + App.HRInfoMgmtCard 로 노출. */
    bindDocsClicks(emp, body);
  }

  /* 계약·서류 패널 안의 행 단위 액션 click 핸들러 (delegated)
   *   - 서류 [발송] / [재발송] / [미리보기] / [삭제]
   *   - 계약서 [작성·발송] (계약 페이지 editor 이동) / [미리보기] (modal) */
  /* joindocs 마스터 동기화 — 같은 사번 emp 의 docs[key].status 를 변경.
   *   입사자 관리 detail 에서 발송 / 재발송 액션 시 호출되어 입사 서류 화면도 일관 동기화. */
  function syncJoinDocsStatus(empId, docKey, newStatus) {
    if (!(window.App && App.JoinDocs && typeof App.JoinDocs.getEmps === 'function')) return;
    try { App.JoinDocs.ensureInit && App.JoinDocs.ensureInit(); } catch (_) {}
    const list = App.JoinDocs.getEmps() || [];
    const found = list.find(e => e.id === empId);
    if (!found || !Array.isArray(found.docs)) return;
    const d = found.docs.find(x => x.key === docKey);
    if (!d) return;
    d.status = newStatus;
    if (newStatus === 'pending') {
      found.sent = true;
      if (!found.sentAt) found.sentAt = new Date().toISOString().slice(0, 10);
    }
    if (newStatus === 'completed') {
      d.signedVersion = d.targetVersion || d.signedVersion || '';
      d.signedAt = new Date().toISOString().slice(0, 10) + ' 10:00';
    }
  }

  function bindDocsClicks(emp, hostEl) {
    if (!hostEl || hostEl.__empiDocsBound) return;
    hostEl.__empiDocsBound = true;
    hostEl.addEventListener('click', (e) => {
      /* 전체 발송 — 서류 현황 섹션 헤더의 일괄 발송 버튼 */
      const bulkBtn = e.target.closest('[data-empi-docs-bulk-send]');
      if (bulkBtn) {
        const sendBtns = Array.from(hostEl.querySelectorAll('[data-empi-doc-send]'));
        if (!sendBtns.length) {
          window.toast && window.toast('발송할 서류가 없습니다.', 'info');
          return;
        }
        const today = new Date().toISOString().slice(0, 10);
        const doBulk = () => {
          sendBtns.forEach(btn => {
            const docKey = btn.dataset.empiDocSend;
            emp.docsSent = (emp.docsSent || 0) + 1;
            emp.docsSentDate = today;
            emp.docsSentBy = currentUserName();
            normalizeStatus(emp);
            syncJoinDocsStatus(emp.id, docKey, 'pending');
          });
          applyFilter();
          renderTable();
          refreshActiveCardView();
          window.toast && window.toast(`${sendBtns.length}건 일괄 발송 완료`, 'success');
        };
        window.sweet ? window.sweet({
          icon: 'confirm',
          title: '서류 전체 발송',
          text: `미발송/재서명 대상 ${sendBtns.length}건을 ${displayName(emp)} 에게 일괄 발송하시겠습니까?`,
          cancelText: '취소',
          confirmText: '전체 발송',
          onConfirm: doBulk,
        }) : (confirm(`${sendBtns.length}건 일괄 발송하시겠습니까?`) && doBulk());
        return;
      }

      const sendBtn = e.target.closest('[data-empi-doc-send]');
      if (sendBtn) {
        const docKey = sendBtn.dataset.empiDocSend;
        const docMeta = CTR_DOCS.find(d => d.key === docKey);
        const docName = docMeta ? docMeta.label : '서류';
        const doSend = () => {
          emp.docsSent = (emp.docsSent || 0) + 1;
          emp.docsSentDate = new Date().toISOString().slice(0, 10);
          emp.docsSentBy = currentUserName();
          normalizeStatus(emp);
          syncJoinDocsStatus(emp.id, docKey, 'pending');
          applyFilter();
          renderTable();
          refreshActiveCardView();
          window.toast && window.toast(`${docName} 발송 완료`, 'success');
        };
        window.sweet ? window.sweet({
          icon: 'confirm', title: '서류 발송',
          text: `「${docName}」 을(를) ${displayName(emp)} 에게 발송하시겠습니까?`,
          cancelText: '취소', confirmText: '발송',
          onConfirm: doSend,
        }) : (confirm(`${docName} 발송?`) && doSend());
        return;
      }
      const previewBtn = e.target.closest('[data-empi-doc-preview]');
      if (previewBtn) {
        const [type, key] = previewBtn.dataset.empiDocPreview.split(':');
        openDocPreviewModal(emp, type, key);
        return;
      }
      const delBtn = e.target.closest('[data-empi-doc-delete]');
      if (delBtn) {
        const docKey = delBtn.dataset.empiDocDelete;
        const docMeta = CTR_DOCS.find(d => d.key === docKey);
        const docName = docMeta ? docMeta.label : '서류';
        const doDelete = () => {
          emp.docSigned = Math.max(0, (emp.docSigned || 0) - 1);
          emp.docsSent  = Math.max(0, (emp.docsSent  || 0) - 1);
          refreshActiveCardView();
          window.toast && window.toast(`${docName} 삭제 완료`, 'success');
        };
        window.sweet ? window.sweet({
          icon: 'confirm', title: '서류 삭제',
          text: `${docName} 을(를) 삭제하시겠습니까? (서명 이력 포함 영구 삭제)`,
          cancelText: '취소', confirmText: '삭제',
          onConfirm: doDelete,
        }) : (confirm(`${docName} 삭제?`) && doDelete());
        return;
      }
      const docResendBtn = e.target.closest('[data-empi-doc-resend]');
      if (docResendBtn) {
        const docKey = docResendBtn.dataset.empiDocResend;
        const docMeta = CTR_DOCS.find(d => d.key === docKey);
        const docName = docMeta ? docMeta.label : '서류';
        const doResendOne = () => {
          emp.docsSentDate = new Date().toISOString().slice(0, 10);
          emp.docsSentBy = currentUserName();
          /* 재발송 — joindocs 마스터의 status 도 'pending' 으로 재설정 (resign → pending 변경 포함) */
          syncJoinDocsStatus(emp.id, docKey, 'pending');
          refreshActiveCardView();
          window.toast && window.toast(`${docName} 재발송 완료`, 'success');
        };
        window.sweet ? window.sweet({
          icon: 'confirm', title: '서류 재발송',
          text: `「${docName}」 을(를) 재발송하시겠습니까?`,
          cancelText: '취소', confirmText: '재발송',
          onConfirm: doResendOne,
        }) : (confirm(`${docName} 재발송?`) && doResendOne());
        return;
      }
      const ctrWriteBtn = e.target.closest('[data-empi-contract-write]');
      if (ctrWriteBtn) {
        const kindKey = ctrWriteBtn.dataset.empiContractWrite;
        goToContractEditor(emp, kindKey === 'wage' ? '임금계약서' : '근로계약서');
        return;
      }
      const ctrPreviewBtn = e.target.closest('[data-empi-contract-preview]');
      if (ctrPreviewBtn) {
        const kindKey = ctrPreviewBtn.dataset.empiContractPreview;
        openDocPreviewModal(emp, 'contract', kindKey);
        return;
      }
    });
  }

  /* ============ 계약 페이지 editor 로 이동 ============
   *   emp 정보 + 계약 유형(근로/임금) 을 page-hr-contract 모듈에 넘기고
   *   App.Nav.selectItem 으로 계약 메뉴 활성화 → __onShow 에서 editor 진입. */
  function goToContractEditor(emp, kind) {
    if (!window.App || !App.HRContract || typeof App.HRContract.startEditorForEmp !== 'function') {
      window.toast && window.toast('계약 모듈이 로드되지 않았습니다.', 'warning');
      return;
    }
    if (!App.Nav || typeof App.Nav.selectItem !== 'function') {
      window.toast && window.toast('내비게이션 모듈이 로드되지 않았습니다.', 'warning');
      return;
    }
    /* 인사 관리 등에서 열린 인사정보카드 Drawer 가 떠있으면 닫기 — 페이지 전환되는데 Drawer 가
     *   잔존하면 새 페이지 위에 떠 있는 어색한 상태가 됨. */
    if (App.HRInfoMgmtCard && typeof App.HRInfoMgmtCard.close === 'function') {
      App.HRInfoMgmtCard.close();
    }
    /* 입사자 detail 화면에서 호출된 경우 → 작성 후 [목록] 클릭 시 detail 로 복귀.
     *   drawer 호출(인사관리/조직관리) 케이스는 returnTo 없이 — 계약 목록으로 정상 복귀. */
    const opts = (STATE.view === 'detail')
      ? { returnTo: 'newcomer-detail', returnEmpId: emp.id }
      : {};
    App.HRContract.startEditorForEmp(emp, kind, opts);
    App.Nav.selectItem('hr-contract', '계약', 'page-hr-contract');
  }

  function bindDrawerFooter(emp) {
    const editBtn = $('[data-empi-drawer-edit]');
    const cancelBtn = $('[data-empi-drawer-cancel]');
    const saveBtn = $('[data-empi-drawer-save]');
    const submitBtn = $('[data-empi-drawer-submit]');

    if (editBtn) {
      editBtn.addEventListener('click', () => {
        STATE.drawerEditMode = true;
        STATE.drawerDirty = false;
        STATE.drawerPatch = {};
        refreshActiveCardView();
      });
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        STATE.drawerEditMode = false;
        STATE.drawerDirty = false;
        STATE.drawerPatch = {};
        refreshActiveCardView();
      });
    }
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const { critical, general } = splitCriticalPatch(STATE.drawerPatch);
        const hasCritical = Object.keys(critical).length > 0;
        const commitGeneral = () => {
          commitPatch(emp, general);
        };
        const finalizeImmediate = () => {
          STATE.drawerDirty = false;
          STATE.drawerPatch = {};
          STATE.drawerEditMode = false;
          /* 외부 호출 케이스: 호출 페이지 콜백만 실행 (입사자 관리 그리드는 갱신 안 함) */
          if (STATE.drawerExternal) {
            if (STATE.drawerOnSave) STATE.drawerOnSave(emp);
          } else {
            applyFilter();
            renderTable();
          }
          refreshActiveCardView();
        };
        if (!hasCritical) {
          commitGeneral();
          finalizeImmediate();
          window.toast && window.toast('인사정보 저장 완료', 'success');
          return;
        }
        /* 핵심 5개 변경 — 일반 항목은 즉시 반영, 핵심은 승인 모달로 라우팅 */
        openApprovalModal(emp, critical,
          /* onApprove */ () => {
            commitGeneral();
            finalizeImmediate();
            const n = Object.keys(critical).length;
            window.toast && window.toast(
              `${n}개 항목 승인 요청 완료 — 인사팀장 결재 후 반영됩니다.`,
              'info', 4500
            );
          },
          /* onCancel — 편집 모드/패치 유지: 사용자가 다시 [저장] 누를 수 있음 */
          () => {}
        );
      });
    }
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        const totalChanges = Object.keys(STATE.drawerPatch).length;
        if (!totalChanges) return;
        const { critical, general } = splitCriticalPatch(STATE.drawerPatch);
        const hasCritical = Object.keys(critical).length > 0;

        /* 핵심 5개 변경 — 신규 승인 모달 우선 라우팅
         *   일반 항목은 즉시 반영, 핵심은 승인 모달로. */
        if (hasCritical) {
          openApprovalModal(emp, critical,
            /* onApprove */ () => {
              commitPatch(emp, general);
              STATE.drawerPatch = {};
              STATE.drawerDirty = false;
              STATE.drawerEditMode = false;
              if (STATE.drawerExternal) {
                if (STATE.drawerOnSave) STATE.drawerOnSave(emp);
              } else {
                applyFilter();
                renderTable();
              }
              refreshActiveCardView();
              const n = Object.keys(critical).length;
              window.toast && window.toast(
                `${n}개 항목 승인 요청 완료 — 인사팀장 결재 후 반영됩니다.`,
                'info', 4500
              );
            },
            /* onCancel — 편집 모드/패치 유지 */
            () => {}
          );
          return;
        }

        /* 일반 항목만 — 기존 [수정 상신] sweet 시뮬레이션 유지 */
        STATE.drawerEditMode = false;
        closeAllOC();
        window.toast && window.toast(
          `수정 상신 완료 — ${totalChanges}개 항목 · 인사팀장 승인 후 자동 반영됩니다.`,
          'info', 4500
        );
        setTimeout(() => {
          window.sweet && window.sweet({
            icon: 'confirm',
            title: '[데모] 결재 승인 시뮬레이션',
            text: '실제 환경에서는 인사팀장이 결재 모듈에서 승인합니다. 데모를 위해 즉시 반영하시겠습니까?',
            cancelText: '대기 유지', confirmText: '즉시 반영',
            onConfirm: () => {
              commitPatch(emp, STATE.drawerPatch);
              STATE.drawerPatch = {};
              if (STATE.drawerExternal) {
                if (STATE.drawerOnSave) STATE.drawerOnSave(emp);
              } else {
                applyFilter();
                renderTable();
              }
              window.toast && window.toast('수정 반영 완료', 'success');
            },
          });
        }, 800);
      });
    }
  }

  /* ============ 인사정보 변경 승인 요청 모달 ============
   *   부서·직무·직위·직책·고용 형태 변경 시 인사팀장(부서장) 결재 후 반영.
   *   [승인 요청] 클릭 시 변경 사항은 보류 — drawerPatch 의 핵심 5키만 폐기,
   *   일반 항목은 즉시 반영, 토스트로 안내. */
  const CRITICAL_FIELDS = {
    dept:     '부서',
    job:      '직무',
    rank:     '직위',
    position: '직책',
    empType:  '고용 형태',
  };
  /* 패치를 emp 에 반영 — 성/이름 수정 시 표시용 통합 name 도 함께 동기화.
   *   (그리드·헤더 등은 emp.name / displayName 을 사용하므로 fname/gname 만 바꾸면 불일치 발생) */
  function commitPatch(emp, patch) {
    Object.keys(patch || {}).forEach(k => { emp[k] = patch[k]; });
    if (patch && ('fname' in patch || 'gname' in patch)) {
      emp.name = displayName(emp);
    }
  }
  /* drawerPatch 를 핵심/일반으로 분리 — 객체 두 개 반환 */
  function splitCriticalPatch(patch) {
    const critical = {}, general = {};
    Object.keys(patch || {}).forEach(k => {
      if (Object.prototype.hasOwnProperty.call(CRITICAL_FIELDS, k)) critical[k] = patch[k];
      else general[k] = patch[k];
    });
    return { critical, general };
  }
  /* 항목별 표시값 포맷 — empType 같은 enum 코드는 한글 라벨로 표시 */
  function formatFieldValue(key, value) {
    if (value === '' || value == null) return '-';
    if (key === 'empType') return EMP_TYPE_LABEL[value] || value;
    return String(value);
  }

  /* 승인 모달 열기 — emp 대상, criticalPatch 항목으로 비교 테이블 렌더,
   *   [승인 요청] 시 onApprove 콜백, [취소]/X 시 onCancel 콜백 호출 */
  function openApprovalModal(emp, criticalPatch, onApprove, onCancel) {
    const modal = document.getElementById('modal-empi-approval');
    if (!modal) return;
    modal.querySelector('[data-empi-approval-target]').textContent =
      `${displayName(emp)} (${emp.id})`;
    const rows = Object.keys(criticalPatch).map(k => {
      const before = formatFieldValue(k, emp[k]);
      const after  = formatFieldValue(k, criticalPatch[k]);
      return `<tr>
        <td>${esc(CRITICAL_FIELDS[k])}</td>
        <td><span style="color:var(--color-text-muted);">${esc(before)}</span></td>
        <td><strong>${esc(after)}</strong></td>
      </tr>`;
    }).join('');
    modal.querySelector('[data-empi-approval-changes]').innerHTML = rows;
    const reasonEl = modal.querySelector('#empi-approval-reason');
    if (reasonEl) reasonEl.value = '';
    const submitBtn = modal.querySelector('[data-empi-approval-submit]');
    if (submitBtn) submitBtn.disabled = true;
    STATE._approval = { emp, criticalPatch, onApprove, onCancel };
    openModal('modal-empi-approval');
  }

  function bindApprovalModal() {
    const modal = document.getElementById('modal-empi-approval');
    if (!modal) return;
    const reasonEl = modal.querySelector('#empi-approval-reason');
    const submitBtn = modal.querySelector('[data-empi-approval-submit]');
    /* 사유 입력 필수 — 한 글자라도 있으면 활성화 */
    if (reasonEl && submitBtn) {
      reasonEl.addEventListener('input', () => {
        submitBtn.disabled = !reasonEl.value.trim();
      });
    }
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        const ctx = STATE._approval; if (!ctx) return;
        const reason = (reasonEl && reasonEl.value.trim()) || '';
        if (!reason) return;
        closeModal('modal-empi-approval');
        STATE._approval = null;
        if (typeof ctx.onApprove === 'function') ctx.onApprove(reason);
      });
    }
    /* ✕ / 취소 / 배경 클릭 시 — 모달 닫기 + onCancel 콜백 호출.
     *   전역 data-modal-close 핸들러가 없으므로 closeModal 로 직접 닫아야 한다. */
    modal.addEventListener('click', (e) => {
      const closer = e.target.closest('[data-modal-close]');
      const backdrop = e.target === modal;
      if (!closer && !backdrop) return;
      closeModal('modal-empi-approval');
      const ctx = STATE._approval;
      STATE._approval = null;
      if (ctx && typeof ctx.onCancel === 'function') ctx.onCancel();
    });
  }

  /* ============ Modal / OffCanvas 공통 ============ */
  function openModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeAllModals() {
    document.querySelectorAll('.modal-backdrop.is-open').forEach(m => m.classList.remove('is-open'));
    document.body.style.overflow = '';
  }
  /* 개별 모달만 닫기 — 스택된 모달 위에서 ESC/닫기 눌렀을 때 아래 모달은 유지 */
  function closeModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.remove('is-open');
    /* 다른 모달이 열려있지 않을 때만 body 스크롤 잠금 해제 */
    if (!document.querySelector('.modal-backdrop.is-open')) {
      document.body.style.overflow = '';
    }
  }
  function bindModalClose() {
    /* modal-empi-create 는 모달이 아닌 인페이지 상세 화면 → 여기서 제외 (자체 닫기 핸들러 사용) */
    ['modal-empi-mail','modal-empi-contract','modal-empi-doc-preview','modal-empi-card-edit','modal-empi-shift-pick'].forEach(id => {
      const m = document.getElementById(id);
      if (!m) return;
      m.addEventListener('click', (e) => {
        if (e.target === m || e.target.closest('[data-modal-close]')) {
          closeModal(id);
        }
      });
    });
  }
  function openOC(id) {
    const oc = document.getElementById(id);
    const bd = document.querySelector(`[data-oc-host="${id}"]`);
    if (!oc) return;
    oc.classList.add('is-open');
    bd && bd.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeAllOC() {
    document.querySelectorAll('.offcanvas.is-open, .oc-backdrop.is-open').forEach(el => el.classList.remove('is-open'));
    document.body.style.overflow = '';
  }
  /* 인사정보카드 Drawer(oc-empi-card) / 입사자 상세 패널(empi-detail-pane) 제거됨 — OC 리스너 불요. */
  function bindOC() {}

  /* ============ 공유 mock 데이터 — script load 시점에 즉시 생성 ============
   *   다른 페이지(계약/발령/인사/조직)가 IIFE 단계에서 App.HRInfoMgmt.list() 를 호출하므로
   *   __onShow 가 아닌 모듈 로드 시점에 한 번만 STATE.rows 를 채워둔다. */
  /* 5명 고정 시드 — makeMock() 이 이미 완료 상태로 반환하므로 만료 데모 래퍼(applyContractExpiredDemo)는
     적용하지 않는다. 아래 이름 기반 데모 보정 IIFE 들은 5명 시드에 매칭되는 이름이 없어 자동 no-op 이며,
     seedWageContract() 만 서명완료 직원의 임금 필드를 직위 기준으로 채운다. */
  STATE.rows = makeMock();
  /* 데모 보정 — 「작성중」 상태 직원 노출용.
   *   contractSentDate 만 셋팅하고 contractLabor=false 로 두어 grid/drawer 에서
   *   근로/임금계약 컬럼이 「작성중」 pill 로 표시되도록 함. */
  (function adjustDrafting() {
    const draftingNames = ['최예린', '오민서', '윤도현', '서지원'];
    const todayMs = Date.now();
    draftingNames.forEach(nm => {
      const r = STATE.rows.find(rr => rr.name === nm);
      if (!r) return;
      /* 외부 인력(도급/파견) · 일용직은 계약 N/A 대상이므로 작성중 보정 안 함 */
      if (r.contractOut || r.empType === 'daily' || EXTERNAL_EMP_TYPES.indexOf(r.empType) >= 0) return;
      r.status = 'inProgress';
      r.contractLabor = false;
      r.contractWage = false;
      if (!r.contractSentDate && r.joinDate) {
        const sentDate = new Date(new Date(r.joinDate).getTime() - 86400000 * 3);
        r.contractSentDate = sentDate.toISOString().slice(0, 10);
        r.contractSentBy = r.registeredBy || '정혜진';
      }
      /* 만료 흔적 제거 — 종료일이 과거면 +1년 으로 갱신 (계약직만) */
      if (r.contractEndDate && new Date(r.contractEndDate).getTime() < todayMs) {
        if (r.empType === 'contract' || r.empType === 'daily') {
          const join = new Date(r.joinDate || new Date().toISOString().slice(0, 10));
          r.contractEndDate = new Date(join.getTime() + 86400000 * 365).toISOString().slice(0, 10);
        } else {
          r.contractEndDate = '';
        }
      }
      r.contractSubType = r.contractSubType || '';
    });
  })();
  /* ============ 정현우 — 데모용 완전 등록 직원 ============
   *   급여 정산 검증용 — 근로계약 + 임금계약 모두 등록된 정규직으로 강제 보정.
   *   makeMock() 의 인덱스 기반 분포(4번 → 도급직)를 덮어 인사팀 대리 정규직으로 변경.
   *   이 보정 다음 단계의 seedWageContract() 가 임금계약 필드를 자동 채움. */
  (function seedJunghyunwoo() {
    const r = STATE.rows.find(rr => rr.name === '정현우');
    if (!r) return;
    /* 조직 & 고용 형태 — 인사팀 대리 정규직 */
    r.empType        = 'regular';
    r.contractOut    = false;
    r.contractSubType = '';
    r.dept           = '인사팀';
    r.job            = '인사';
    r.rank           = '대리';
    r.position       = '팀원';
    r.jobCat         = 'office';
    r.probation      = false;
    r.probationStart = '';
    r.probationEnd   = '';
    /* 마일스톤 — 전 단계 충족 (등록 완료 직원) */
    r.infoStatus     = 'done';
    r.userId         = r.userId || 'junghyunwoo4';
    r.ssn            = '900101-1******';
    /* 근로 계약 — 서명 완료. 데모용으로 명확한 시작·종료일을 노출.
     *   (정규직은 무기계약이 일반적이나, 데모상 계약기간 표기를 위해 3년 단위로 시드) */
    r.contractLabor       = true;
    r.contractStartDate   = '2024-03-01';
    r.contractEndDate     = '2027-02-28';
    r.contractSentDate    = '2024-02-26';
    r.contractSentBy      = r.registeredBy || '정혜진';
    /* 임금 계약 — contractWage=true 만 켜두면 다음 seedWageContract() 가
     *   직위(대리=5,400만) 기반으로 wageType/contractAmount/baseSalary 등 모두 자동 시드. */
    r.contractWage = true;
    /* 서류 — 5종 모두 발송·서명 완료 */
    r.docsSent   = 5;
    r.docSigned  = 5;
    r.docsSentDate = r.docsSentDate || (r.joinDate
      ? new Date(new Date(r.joinDate).getTime() - 86400000 * 1).toISOString().slice(0, 10)
      : '2024-02-28');
    /* status 는 다음 단계 normalizeStatus 가 isComplete() 통과로 'completed' 로 보정 */
    r.status = 'registered';
  })();

  /* ============ 임금 계약 mock 시드 ============
   *   contractWage === true 인 직원에 대해 실제 임금 계약 필드(wageType / contractAmount /
   *   baseSalary / payDay 등)를 채워둔다.
   *   - 급여 정산 페이지가 emp.baseSalary 등을 직접 사용해 지급액을 산출하므로 필요.
   *   - 직위(rank) 기준으로 연봉 시드. 도급직은 임금계약 N/A. 일용직은 시급제(hourly) 시드. */
  (function seedWageContract() {
    const ANNUAL_BY_RANK = {
      '대표이사':   180000000, '부대표이사': 150000000,
      '전무이사':   130000000, '상무이사':   115000000,
      '부장':        92000000, '차장':        78000000,
      '과장':        65000000, '대리':        54000000,
      '주임':        46000000, '사원':        38000000,
    };
    STATE.rows.forEach((r, idx) => {
      if (!r.contractWage) return;                                    // 미서명 → 시드 안 함
      if (r.contractOut || EXTERNAL_EMP_TYPES.indexOf(r.empType) >= 0) return; // 도급 N/A
      if (r.empType === 'daily') {
        /* 일용직 — 시급제(hourly). 기본 시급 11,000~14,000원 + 주휴수당(20% 절사) = 계약 금액 */
        const baseHourly = 11000 + (idx % 7) * 500;                   // 11,000 ~ 14,000
        const holiday    = Math.floor(baseHourly * 0.2);
        r.incomeType = 'earned';
        r.wageType   = 'hourly';
        r.hourlyWage       = baseHourly;
        r.holidayAllowance = holiday;
        r.contractAmount   = baseHourly + holiday;                    // 주휴수당 포함 계약 시급
        r.baseSalary = '';
        r.wageContractKind = '';
        r.payDay   = 10;
        r.payMethod = '계좌이체';
        r.hoursPerDay  = 8;
        r.hoursPerWeek = 40;
        r.hoursPerMonth = 209;
        r.wageContractStartDate = r.contractStartDate || r.joinDate || '';
        r.wageContractEndDate   = '';
        r.wageIndefinite = true;                                      // 시급제 무기한
        r.deductionPolicy = '4대보험·소득세 일괄 공제';
        return;
      }
      /* 정규직·계약직 — 전원 연봉제(월급제 제거). 동일 직위라도 사원별 ±5% 변동 (idx 기반 결정적) */
      const baseAnnual = ANNUAL_BY_RANK[r.rank] || 40000000;
      const variance   = 1 + ((idx % 11) - 5) * 0.01;                 // -5% ~ +5%
      const annual     = Math.round(baseAnnual * variance / 10000) * 10000;
      r.incomeType = 'earned';
      r.wageType   = 'annual';
      r.contractAmount = annual;
      r.baseSalary     = Math.round(annual / 12 / 10000) * 10000;     // 월 기본급
      /* 임금 계약 유형 — '일반' 제거 → 고정 OT / 포괄임금 중 배정 */
      r.wageContractKind = (idx % 3 === 0) ? 'inclusive' : 'fixedOT';
      if (r.wageContractKind === 'fixedOT') {
        /* 고정 OT 7종 카테고리별 기준시간 — 데모: 연장 12h + 야간 8h = 20h */
        r.fixedOTHoursDetail = { extension: 12, night: 8 };
        r.fixedOTHours  = 20;          // 합계 시간 (표시용)
        r.fixedOTRate   = '';
        r.fixedOTAmount = Math.round(r.baseSalary * 0.12 / 1000) * 1000;
      } else {
        /* 포괄임금 — 데모: 연장 10h */
        r.inclusiveOTHours  = { extension: 10 };
        r.inclusiveHours    = 10;
        r.inclusiveOTAmount = Math.round(r.baseSalary * 0.10 / 1000) * 1000;
      }
      r.payDay   = 10;
      r.payMethod = '계좌이체';
      r.wageContractStartDate = r.contractStartDate || r.joinDate || '';
      r.wageContractEndDate   = r.contractEndDate   || '';
      r.deductionPolicy = '4대보험·소득세 일괄 공제';
    });
  })();

  /* 일괄작성 자격 매트릭스 — 전 조합 대표 직원 배치 (앞 시드 패스 덮어씀) */
  STATE.rows = applyContractMatrixDemo(STATE.rows);

  /* ============ 도급직 분포 보정 — 의도치 않은 도급 지정 해제 ============
   *   makeMock() 은 인덱스 분포(i % 4 === 0)로 여러 명을 도급직으로 시드하지만,
   *   데모상 도급직은 강나래·홍수아 2명만 두어 계약 '해당없음' 대표로 삼고,
   *   나머지(임유나·백지윤·진보영·채영호)는 직접고용으로 되돌려 계약 '미작성'(미등록·미서명)
   *   상태로 노출한다. (도급직만 근로/임금 계약 '해당없음' — 그 외는 미작성)
   *   ※ applyContractExpiredDemo(makeMock) 실행 이후에 되돌려야 만료/만료임박 데모의
   *     계약직 자동 선택 순서가 흐트러지지 않으므로 파이프라인 맨 끝에서 처리한다. */
  (function revertUnintendedOutsourced() {
    const REVERT = { '임유나': 'regular', '백지윤': 'regular', '진보영': 'regular', '채영호': 'contract' };
    STATE.rows.forEach(r => {
      if (!(r.name in REVERT)) return;
      r.empType = REVERT[r.name];
      r.contractOut = false;
      /* 계약 관련 필드 초기화 — '미작성' 상태로 노출 (도급 → 직접고용 전환) */
      r.contractLabor = false; r.contractWage = false;
      r.contractStartDate = ''; r.contractEndDate = '';
      r.contractSentDate = ''; r.contractSentBy = '';
      r.wageContractStartDate = ''; r.wageContractEndDate = ''; r.wageContractSentDate = '';
      r.contractApprovalPending = false; r.wageApprovalPending = false;
    });
  })();

  /* 임금 계약서 완료(서명)일 시드 — 서명완료(contractWage) 직원에게 완료일 부여.
   *   별도 필드가 없던 기존 데이터 보정용. 급여 정보 탭 「계약일」 표시의 단일 소스. */
  STATE.rows.forEach(r => {
    if (r.contractWage && !r.wageContractSignedDate) {
      r.wageContractSignedDate = r.wageContractStartDate || r.contractStartDate || r.joinDate || '';
    }
  });

  /* 소정근로시간 시드 — 근로 계약(발송/서명)이 있는 직원은 소정근로시간을 등록완료(법정 기준 8/40/209)로 둔다.
     근로 계약 이력이 없는 직원은 미등록으로 남겨 「근로계약 → 소정근로시간 → 임금계약」 선행 흐름을 데모한다. */
  STATE.rows.forEach(r => {
    if (r.contractLabor || r.contractSentDate) {
      if (!Number(r.hoursPerDay))   r.hoursPerDay   = 8;
      if (!Number(r.hoursPerWeek))  r.hoursPerWeek  = 40;
      if (!Number(r.hoursPerMonth)) r.hoursPerMonth = 209;
    }
  });

  /* 정현우 — 데모 쇼케이스 직원: 근무정보 / 근로계약 / 소정근로시간 / 임금계약(연봉제) /
     공제 정보(부양가족·중소기업 소득세 감면) 가 모두 적용된 상태로 최종 보정 (매트릭스 이후 실행). */
  (function seedJunghyunwooShowcase() {
    const r = STATE.rows.find(rr => rr.name === '정현우');
    if (!r) return;
    /* 근무 정보 완료 (근무지·부서·직위·직책·직무) */
    r.empType = 'regular'; r.contractOut = false; r.contractSubType = '';
    r.dept = '인사팀'; r.job = '인사'; r.rank = '대리'; r.position = '팀원'; r.jobCat = 'office';
    r.site = r.site || '성수동';
    /* 근로계약 서명완료 + 소정근로시간 */
    r.contractLabor = true; r.contractWage = true;
    r.hoursPerDay = 8; r.hoursPerWeek = 40; r.hoursPerMonth = 209;
    /* 임금계약(연봉제) — 정산 정보 연봉제 필드(기본급/월 고정연장근무수당/통상임금/통상시급) 데모 */
    r.wageType = 'annual';
    r.contractAmount = Number(r.contractAmount) || 54000000;
    r.baseSalary     = Number(r.baseSalary)     || 4500000;
    if (!r.wageContractKind || r.wageContractKind === 'general') {
      r.wageContractKind   = 'fixedOT';
      r.fixedOTHoursDetail = r.fixedOTHoursDetail || { extension: 12, night: 8 };
      r.fixedOTHours       = r.fixedOTHours || 20;
      r.fixedOTAmount      = r.fixedOTAmount || 540000;
    }
    /* 공제 정보 — 부양가족 2명 + 중소기업 취업자 소득세 감면(청년, 90%) 대상 */
    r.dependents = { count: 2 };
    r.taxReduction = {
      enabled: 'Y', type: '청년', rate: 90,
      startDate: '2024-03-01', endDate: '2029-02-28', accumAmount: 480000,
    };
  })();

  /* 휴직 데모 — 재직 중 직접고용 직원 1명을 육아휴직(휴직) 상태로 부여.
   *   D-day 표기는 제거하고 휴직/재직만 구분 표시. leaveReturnDate 는 휴직 이력 표(복직예정일)용으로 유지. */
  (function applyLeaveDemo() {
    const cand = STATE.rows.filter(r => r.status !== 'retired' && !r.contractOut);
    const today = new Date();
    const plusDays = (n) => {
      const x = new Date(today); x.setDate(x.getDate() + n);
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    };
    /* 휴직 데모 비활성 — 5명 시드는 전원 재직 상태로 노출 */
    void cand; void plusDays;
  })();

  /* 시드 로드 후 status 정규화 — 마일스톤·isComplete 기반으로 메인 status 보정 */
  STATE.rows.forEach(normalizeStatus);

  /* 현재 로그인 사용자(데모) 지정 — GNB 프로필(윤성수)과 일치하도록 완성 프로필 직원 1명을 '윤성수'로.
   *   내 정보 페이지(App.HRInfoMgmtCard.mountMyInfo)가 이 직원의 인사정보카드를 렌더한다. */
  let MY_EMP_ID = '';
  (function designateCurrentUser() {
    const me = STATE.rows.find(r => r.status === 'completed' && r.empType === 'regular' && !r.contractOut)
            || STATE.rows.find(r => r.status !== 'retired')
            || STATE.rows[0];
    if (me) {
      /* 이름은 유지 — 현재 로그인 사용자 포인터만 지정 (내 정보 페이지 렌더용) */
      MY_EMP_ID = me.id;
    }
  })();

  /* ============ 페이지 등록 ============ */
  function initPage() {
    const pageEl = document.getElementById('page-hr-info-mgmt');
    if (!pageEl) return;
    let built = false;
    pageEl.__onShow = () => {
      /* 페이지 진입 시 — 다른 페이지의 부서 관리 모달에서 변경된 DEPTS 동기화.
         buildPage 가 트리를 렌더하기 전에 sync 해야 최신 부서 데이터로 그려진다. */
      syncDeptsFromShared();
      if (!built) {
        buildPage(pageEl);
        bindCreateModal();
        bindMailModal();
        bindContractModal();
        bindDocPreviewModal();
        bindApprovalModal();
        bindCardModal();          // 신규 인사정보카드 모달
        bindCardEditModal();      // 인사정보카드 — 고용/소속 정보 편집 모달
        bindPayrollTaxModal();    // 인사정보카드 — 세금/원천징수 정보 편집 모달
        bindModalClose();
        bindOC();
        built = true;
      } else {
        /* 재진입 — 등록 상세가 열려 있었다면 목록으로 복귀 후 트리·그리드 재렌더 */
        closeCreateDetail();
        if (!findDept(STATE.selectedDeptId)) STATE.selectedDeptId = 'C0';
        renderTreeOnly();
        updateDeptTitle();
        applyFilter();
        renderTable();
      }
    };
  }
  /* 내 정보 페이지 — 진입 시마다 현재 사용자 인사정보카드를 풀페이지로 렌더 */
  function initMyInfoPage() {
    const pageEl = document.getElementById('page-my-info');
    if (!pageEl) return;
    pageEl.__onShow = () => { mountMyInfo(pageEl); };
  }

  const prev = App.initPages;
  App.initPages = function () {
    if (typeof prev === 'function') prev();
    initPage();
    initMyInfoPage();
  };

  /* ============ 외부 페이지에서 호출하는 공식 API ============
   *   · App.HRInfoMgmt.list()           — 공유 입사자 데이터(같은 배열 인스턴스)
   *   · App.HRInfoMgmtCard.open(emp, opts) — 인사정보카드 Drawer 열기 (외부 emp 객체 허용)
   *   · App.HRInfoMgmtCard.close()         — Drawer 닫기
   *   · App.HRInfoMgmtCard.docsPanel       — 계약·서류 패널 렌더 함수 (다른 페이지의 인사카드에서도 동일 사용)
   *   · App.HRInfoMgmtCard.bindDocsClicks  — 위 패널의 click 핸들러 위임 바인더 */
  App.HRInfoMgmt = {
    list: () => STATE.rows,
    /* 정책 기준 「완료」 판정 — 입사자 관리 / 인사 관리 공용
     *   계정등록 + 정보등록 + (도급직 아니면) 근로계약 서명 + (계약직·일용직이면) 기간 유효 */
    isComplete,
    /* 임금계약 만료 신호 — 「완료」 판정과는 분리. detail / 인사카드에서 별도 표시용 */
    wageContractStatus,
    /* (등록 상태 × 계약 상태) 파생 + 일괄 작성 자격 — 계약 관리 일괄 작성 등 공용 */
    contractCellState,
    /* 자격 판정 — 임직원 현황 카드 등록(계정등록+근로서명완료) / 급여 정산(+임금서명완료).
       서명완료(유효)에는 '만료 임박'(아직 유효)도 포함. 도급직은 근로 면제·임금 정산 제외. */
    canRegisterCard,
    canSettlePayroll,
    /* 조직도 트리 — 계약 일괄 작성 / 근태·연차·근무스케줄 현황 등에서 임직원 관리와 동일한 트리 재사용 */
    deptTreeHTML: renderDeptTreeHTML,
    deptSubtreeIds,
    deptIdOf: (name) => DEPT_NAME_TO_ID[name] || '',
    deptName,
    /* 부서 id → 상위(부모) 부서 id. 루트는 null. 근무조 설정 상속 판정 등에 사용. */
    deptParentId: (id) => { const d = findDept(id); return d ? d.parentId : null; },
    empsInDept,
    /* 최상위 조직(본부/팀) 목록 — 루트 직속 노드. 업무보고 현황 등 본부 단위 그룹핑용. */
    topDepts: () => deptChildren('C0').map(d => ({ id: d.id, name: d.name })),
    /* 전체 조직 목록 — 트리 DFS 순서. [{ id, name, parentId, type(hq|team|part), level }].
       근무정책 설정(부서별 그리드)에서 모든 본부/팀/파트를 리스트업할 때 사용. */
    deptsOrdered: () => {
      const out = [];
      (function walk(pid, level) {
        deptChildren(pid).forEach(d => { out.push({ id: d.id, name: d.name, parentId: d.parentId, type: d.type, level: level }); walk(d.id, level + 1); });
      })('C0', 0);
      return out;
    },
    /* 계약 관리 개별 작성 — 인사정보카드의 '근로/임금 계약 정보' 박스를 그대로 재사용.
       which: 'labor'(근로) | 'wage'(임금). 편집 버튼(data-empi-card-section-act) 마크업 포함. */
    contractInfoBox(empId, which) {
      const emp = STATE.rows.find(r => r.id === empId);
      if (!emp) return '';
      let html = renderSectionContract(emp, { only: which === 'wage' ? 'wage' : 'labor', hideContractActions: true, asSection: true });
      /* 계약 관리 좌측 패널(좁음)에 들어가므로 모든 필드 행을 1열(전체폭)로 강제 — 값 줄바꿈 방지 */
      return html.replace(/width:50%/g, 'width:100%');
    },
    /* 서명 요청 모달을 취소/닫기로 나갔을 때 — 직전 계약 정보 설정 모달(근로/임금)을 다시 띄운다.
       section: 'employment'(근로) | 'wage'(임금). 재완료 시 다시 서명 요청으로 체이닝되도록 newContractFlow 복원. */
    reopenCardContractEdit(empId, section) {
      const emp = STATE.rows.find(r => r.id === empId);
      if (!emp) return;
      const sec = section === 'wage' ? 'wage' : 'employment';
      CARD_STATE.emp = emp;
      CARD_STATE.newContractFlow = sec === 'wage' ? 'wage' : 'labor';
      openCardSectionEdit(sec);
    },
    /* 계약 관리 개별 작성 — 인사정보카드 [편집] 과 동일한 편집 모달을 외부에서 호출.
       opts: { section:'employment'|'wage', onSaved(emp,section) } — 카드와 동일한 선행 가드 적용. */
    openContractEdit(empId, opts) {
      opts = opts || {};
      const emp = STATE.rows.find(r => r.id === empId);
      if (!emp) return;
      const sec = opts.section === 'wage' ? 'wage' : 'employment';
      const alert = (title, message) => {
        if (window.App && typeof App.sweetAlert === 'function') App.sweetAlert({ icon: 'info', title, message });
        else window.alert(message);
      };
      /* 근무 정보(근무지·부서·직위·직책·직무) 선행 */
      if (sec === 'employment' && !(emp.dept && emp.rank && emp.position && emp.job && emp.site)) {
        alert('근무 정보 필요', '근무 정보(근무지·부서·직위·직책·직무) 작성 완료 후 근로 계약 정보를 입력할 수 있습니다.'); return;
      }
      if (sec === 'wage' && !isContractInfoComplete(emp)) {
        alert('근로 계약 정보 필요', '근로 계약 정보 작성 완료 후 임금 계약 정보를 입력할 수 있습니다.'); return;
      }
      /* 정책 — 임금 계약은 금일 기준 유효한 근로 계약서가 있어야 진입 가능. */
      if (sec === 'wage' && !hasValidLaborContract(emp)) {
        alert('유효한 근로 계약서 필요', '금일 기준 유효한 근로 계약서가 있어야 임금 계약을 작성할 수 있습니다. 근로계약서 서명·유효기간을 먼저 확인해 주세요.'); return;
      }
      if (sec === 'wage' && !hasStandardHours(emp)) {
        alert('소정근로시간 필요', '소정근로시간을 먼저 등록해 주세요. 소정근로시간 정보가 등록된 후 임금 계약 정보를 입력할 수 있습니다.'); return;
      }
      const pendingFlag = sec === 'employment' ? 'contractApprovalPending' : 'wageApprovalPending';
      if (emp[pendingFlag]) { alert('결재 진행 중', '승인이 결정나야 진행할 수 있습니다.'); return; }
      CARD_STATE.emp = emp;
      CARD_STATE.externalOnSaved = typeof opts.onSaved === 'function' ? opts.onSaved : null;
      /* 계약 관리에서 편집해도 인사정보카드와 동일하게 변경 승인 요청(발령 결재)을 거친다.
         (즉시 반영 안 함 — 등록완료 계약의 변경은 결재 후 반영) */
      CARD_STATE.externalDirectApply = false;
      bindCardEditModal();
      /* 근로 유형도 자유 편집 — 계약직→정규직 전환 등 */
      openCardSectionEdit(sec);
    },
    /* 인사정보카드 본문 재렌더 — 외부(계약 관리 발송 후)에서 호출.
       카드가 열려있을 때 본문(인사정보 탭 등) 을 재렌더해 계약 상태 등 즉시 반영. */
    _renderCardBody() {
      const m = document.getElementById('modal-empi-card');
      if (!m || !m.classList.contains('is-open')) return;
      if (typeof renderCardBody === 'function') renderCardBody();
    },
  };
  App.HRInfoMgmtCard = {
    /* 인사정보카드 — 외부 페이지(계약/발령/포상징계/임직원 현황 등) 에서 호출하는 공식 진입점.
       내부적으로 `modal-empi-card` (5탭 layer modal) 로 통일. */
    open(emp, opts) {
      if (!emp) return;
      /* 외부 페이지에서 fname/gname 누락 시 emp.name 에서 분리 */
      if (!emp.fname && emp.name) {
        emp = Object.assign({}, emp, {
          fname: emp.name.charAt(0),
          gname: emp.name.slice(1),
        });
      }
      /* 외부 호출 직원 — App.HRInfoMgmt.list() 에 등록되지 않은 emp 도 STATE.rows 에 임시 push.
         renderCardBody 가 STATE.rows 를 직접 참조하므로 누락 시 본문이 비어버림. */
      const list = STATE.rows;
      const existing = list.find(r => r.id === emp.id);
      if (!existing) {
        const merged = Object.assign({
          status: 'completed', infoStatus: 'done',
          dept: '-', job: '-', rank: '-', position: '',
          empType: 'regular', jobCat: 'office', site: '성수동',
          joinDate: emp.joinDate || '',
        }, emp);
        list.push(merged);
        emp = merged;
      } else {
        /* 외부 emp 의 추가 필드(예: photoUrl)를 기존 row 에 머지하여 카드가 완전히 표시되도록 */
        Object.keys(emp).forEach(k => {
          if (existing[k] == null || existing[k] === '') existing[k] = emp[k];
        });
        emp = existing;
      }
      /* info-mgmt 페이지 init 이 아직 안 됐어도 카드가 열리도록 모달 인젝션·바인딩 보장 */
      injectCardModal();
      injectCardEditModal();
      injectDocPreviewModal();
      bindCardModal();
      bindCardEditModal();
      bindPayrollTaxModal();
      bindDocPreviewModal();
      /* 외부 호출 콜백 (onSave) 저장 — renderCardBody 의 후처리 훅에 활용 */
      CARD_STATE.externalOnSave = (opts && typeof opts.onSave === 'function') ? opts.onSave : null;
      openCardModal(emp);
    },
    close() {
      const m = document.getElementById('modal-empi-card');
      if (m) m.classList.remove('is-open');
      if (!document.querySelector('.modal-backdrop.is-open')) document.body.style.overflow = '';
    },
    /* 내 정보 페이지 — 인사정보카드 내용을 풀페이지로 렌더 (GNB 프로필 > 내 정보) */
    mountMyInfo,
    currentUser: currentUserEmp,
    /* 호환 — 옛 호출자(docsPanel/bindDocsClicks) 노출 */
    docsPanel: renderContractDocsPanel,
    bindDocsClicks,
  };
  /* ============ 인사카드 통일 ============
     모든 페이지(계약·발령·포상징계·퇴사·평가·서류 등) 의 인사카드 호출을
     임직원 관리 인사카드 (modal-empi-card 5-tab) 로 라우팅. */
  App.HRInfoCard = App.HRInfoMgmtCard;
  App.HrCard     = App.HRInfoMgmtCard;
})();
