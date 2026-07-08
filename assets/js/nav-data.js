/* =========================================================
 * Navigation Data
 * GNB 카테고리 ↔ LNB 2Depth/3Depth 매핑 정의
 *  ※ 본 데이터는 "그룹웨어 IA.xlsx" (3depth IA 시트) 기준
 *
 * [팀 공통 규칙]
 *  - 화면 추가 시 반드시 여기에 등록한다.
 *  - id 는 전 카테고리에 걸쳐 유일해야 한다. (Tab 식별자로 사용)
 *  - page: 본문 영역에 매칭되는 .page DOM의 id
 *  - icon: LNB 2Depth 그룹 타이틀 앞 아이콘 (assets/js/icons.js 의 키)
 * ========================================================= */
window.NAV_DATA = [
  /* ============ 1. 홈 ============ */
  {
    id: 'home', label: '홈',
    groups: [
      { label: '대시보드', icon: 'dashboard', items: [
        { id: 'dashboard',        label: '임원 전용', page: 'page-dashboard' },
        { id: 'dashboard-lead',   label: '팀장 전용', page: 'page-dashboard-lead' },
        { id: 'dashboard-member', label: '팀원 전용', page: 'page-dashboard-member' },
      ]},
      { label: '생산현황', icon: 'chart', items: [
        { id: 'prod-stats',    label: '생산통계', page: 'page-prod-stats' },
        { id: 'machine-stats', label: '기기 통계', page: 'page-machine-stats' },
      ]},
    ],
  },

  /* ============ 2. 인사 ============
   * erp-storyboard 인사 IA 이식. 실제 화면 구현체는 page-hr-*.js 에 분리.
   * page 가 page-generic 인 항목은 아직 구현 안 됨 (fallback). */
  {
    id: 'hr', label: '인사',
    groups: [
      { label: '인사 관리', icon: 'user', items: [
        { id: 'hr-employee',          label: '임직원 현황',  page: 'page-hr-employee' },
        { id: 'hr-info-mgmt',         label: '임직원 관리',  page: 'page-hr-info-mgmt' },
        /* 「조직 관리」 — 「임직원 관리」 화면의 부서 관리 모달로 완전 통합 (페이지 제거됨). */
        { id: 'hr-prize-discipline',  label: '포상·징계',    page: 'page-hr-prize-discipline' },
      ]},
      { label: '계약·발령·휴직', icon: 'shuffle', items: [
        { id: 'hr-contract',    label: '계약 관리',         page: 'page-hr-contract' },
        { id: 'hr-appoint',     label: '발령 관리',         page: 'page-hr-appoint' },
        { id: 'hr-loa',         label: '휴직 관리',         page: 'page-hr-loa' },
      ]},
      /* 「입사 서류 양식 설정」 — 「설정」 그룹으로 이동. */
      { label: '평가 관리', icon: 'star', items: [
        { id: 'hr-eval-round',    label: '역량평가 회차', page: 'page-hr-eval-round' },
        { id: 'hr-eval-input',    label: '역량평가 진행', page: 'page-hr-eval-input' },
        { id: 'hr-eval-set-type', label: '역량평가 설정', page: 'page-hr-eval-type' },
        { id: 'hr-eval-prob',     label: '수습평가 진행', page: 'page-hr-eval-prob' },
        { id: 'hr-eval-set-prob', label: '수습평가 설정', page: 'page-hr-eval-prob-set' },
      ]},
      { label: '급여 관리', icon: 'wallet', items: [
        { id: 'hr-pay-settlement', label: '급여 정산',       page: 'page-hr-pay-settlement' },
        { id: 'hr-payslip',        label: '급여 명세서 조회', page: 'page-hr-payslip' },
        /* 「급여 관리·급여 기준 설정·지급항목 설정」 — 화면 제거. 데이터/모달 모듈만
           hr-paysettings-data.js / hr-payitem-data.js 로 분리되어 급여 정산이 호출. */
      ]},
      { label: '복리후생', icon: 'heart', items: [
        { id: 'hr-meal', label: '식권 정산', page: 'page-hr-meal' },
      ]},
      { label: '퇴사 관리', icon: 'exit', items: [
        { id: 'hr-leave',        label: '퇴사 현황',   page: 'page-hr-leave' },
        { id: 'hr-pension',      label: '퇴직연금 관리', page: 'page-hr-pension' },
        /* 「퇴사 처리」 — 「퇴사 현황」 화면의 [+ 퇴사 처리] 모달로 완전 통합 (nav 항목 제거됨).
           데이터는 hr-resign-data.js 의 App.HRResign 이 단일 소스로 보존. */
      ]},
      { label: '설정', icon: 'cog', items: [
        { id: 'hr-position',          label: '직위·직책 설정',      page: 'page-hr-position' },
        /* 「입사 서류 양식 설정」(page-hr-doctemplates) — 화면 제거됨. 서류 마스터 데이터는
           hr-joindocs-data.js 의 App.JoinDocsRegistry 가 단일 소스로 보존. */
        /* 「평가유형 설정」·「수습 평가 설정」 — 「평가 관리」 그룹의 각 평가 항목 바로 아래로 이동. */
      ]},
    ],
  },

  /* ============ 3. 근태 ============ */
  {
    id: 'attendance', label: '근태',
    groups: [
      { label: '근태 관리', icon: 'clock', items: [
        /* 나의 근태현황 — 비권한자(본인) 시점. 권한자는 「부서별 근태현황」 사용. 신청/신청현황 포함. */
        { id: 'att-my-work',        label: '나의 근태현황',   page: 'page-att-my-work' },
        /* 부서별 근태현황 — 권한자 시점. 전체 / 임직원별 / 부서별 뷰. 수동 새로고침 지원. */
        { id: 'att-status',         label: '부서별 근태현황', page: 'page-att-status' },
      ]},
      { label: '근무조 관리', icon: 'shuffle', items: [
        /* 부서별 근무조 현황 — 전체 / 임직원별 / 부서별 뷰. [근무조 설정] 버튼으로도 편성 detail 진입. */
        { id: 'att-shift-status', label: '부서별 근무조 현황', page: 'page-att-shift-status' },
        /* 근무정책 설정 — 근무조 마스터(시간대 정의) + 지각 허용 시간. */
        { id: 'att-work-policy',  label: '근무정책 설정',     page: 'page-att-work-policy' },
        /* 근무조 배치 — 부서장이 부서원 월별 근무조 배치(배정표). 근무조 현황의 [근무조 배치] 버튼으로 진입. */
        { id: 'att-shift',        label: '근무조 배치',       page: 'page-att-shift', hidden: true },
      ]},
      { label: '연차 관리', icon: 'calendar', items: [
        /* 나의 연차현황 — 본인 연차 발생/사용/잔여 + 사용 이력 (본인 시점 전용). */
        { id: 'att-my-leave',   label: '나의 연차현황',   page: 'page-att-my-leave' },
        /* 부서별 연차현황 — 권한자 시점. 전체 / 임직원별 / 부서별 뷰. */
        { id: 'att-leave',      label: '부서별 연차현황', page: 'page-att-leave' },
        /* 연차 계획서 — 본인 연차 사용 계획 작성/수정/삭제 + 팀장은 구성원 계획을 캘린더/대시보드로 조회. */
        { id: 'att-leave-plan', label: '연차 계획서',     page: 'page-att-leave-plan' },
        /* ⏸ 임시 숨김 (2026-07-06) — 연차 설정 비노출. 다시 노출하려면 주석 해제.
           연차 설정 — 연차 부여 기준 · 산정 방식 · 이월/소멸 정책.
        { id: 'att-leave-set',  label: '연차 설정',       page: 'page-att-leave-set' }, */
      ]},
      /* ⏸ 임시 숨김 (2026-07-06) — 요청에 따라 근태 > 경조사 관리 / 업무보고 관리 메뉴 비노출.
         페이지·스키마 코드는 유지. 다시 노출하려면 아래 두 그룹 주석을 해제. */
      /*
      { label: '경조사 관리', icon: 'heart', items: [
        // 경조사 현황 — 본인 경조사 신청 + 전체 신청 내역 조회 (HR 목록 패턴).
        { id: 'att-event', label: '경조사 현황', page: 'page-att-event' },
      ]},
      { label: '업무보고 관리', icon: 'report', items: [
        // 나의 업무보고 — 본인 부서 업무 분류별 주간 보고 작성.
        { id: 'att-report-my',     label: '주간 업무보고 작성',   page: 'page-att-report-my' },
        // 부서별 업무보고 현황 — 전체 / 임직원별 / 부서별 주간 보고 조회.
        { id: 'att-report-status', label: '주간 업무보고 현황',   page: 'page-att-report-status' },
        // 업무보고 설정 — 부서별 업무 분류(양식). 업무 보고 작성/현황이 참조.
        { id: 'att-wr-set',        label: '업무보고 설정',       page: 'page-att-wr-settings' },
      ]},
      */
      { label: '설정', icon: 'cog', items: [
        /* 근태코드 설정 — 근태(ATT) · 휴가(HOL) 신청 사유 코드 마스터. */
        { id: 'att-code', label: '근태코드 설정', page: 'page-att-code' },
      ]},
    ],
  },

  /* ============ 4. 회계 ============ */
  {
    id: 'accounting', label: '회계',
    groups: [
      { label: '비용관리', icon: 'coin', items: [
        { id: 'acc-cost-click', label: '클릭비',   page: 'page-click-fee' },
        { id: 'acc-cost-rent',  label: '임차자산', page: 'page-grid' },
      ]},
      { label: '금융 관리', icon: 'wallet', items: [
        { id: 'acc-fin-loan',           label: '대출 계좌 현황 관리',    page: 'page-grid' },
        { id: 'acc-fin-card',           label: '법인카드 승인내역 조회', page: 'page-grid' },
        { id: 'acc-fin-deposit',        label: '예적금 계좌 현황 관리',  page: 'page-grid' },
        { id: 'acc-fin-deposit-report', label: '예적금 시재보고서',      page: 'page-grid' },
        { id: 'acc-fin-fx-tx',          label: '외화계좌 거래내역',      page: 'page-grid' },
        { id: 'acc-fin-fx-report',      label: '외화계좌 시재보고서',    page: 'page-grid' },
        { id: 'acc-fin-acc-tx',         label: '일반계좌 거래내역 조회', page: 'page-grid' },
        { id: 'acc-fin-acc-report',     label: '일반계좌 시재보고서',    page: 'page-grid' },
        { id: 'acc-fin-acc-balance',    label: '일반계좌 잔액 조회',     page: 'page-grid' },
      ]},
    ],
  },

  /* ============ 5. 자재 ============ */
  {
    id: 'material', label: '자재',
    groups: [
      { label: '구매·발주', icon: 'truck', items: [
        { id: 'mat-buy-req-form', label: '구매 신청', page: 'page-grid' },
        { id: 'mat-buy-req',      label: '신청 내역', page: 'page-grid' },
        { id: 'mat-buy-po',       label: '발주 내역', page: 'page-grid' },
        { id: 'mat-buy-vendor-po',label: '업체 발주 내역', page: 'page-mat-vendor-po' },
      ]},
      { label: '입·출고', icon: 'box', items: [
        { id: 'mat-io-in',    label: '입고 조회',     page: 'page-grid' },
        { id: 'mat-io-stock', label: '출고 신청',     page: 'page-grid' },
        { id: 'mat-io-req',   label: '신청 내역',     page: 'page-grid' },
        { id: 'mat-io-out',   label: '출고 내역',     page: 'page-grid' },
      ]},
      { label: '자재', icon: 'list', items: [
        { id: 'mat-main-status', label: '자재현황',    page: 'page-grid' },
        { id: 'mat-sub-status',  label: '부자재현황',  page: 'page-grid' },
        { id: 'mat-main-price',  label: '자재 단가',   page: 'page-grid' },
        { id: 'mat-sub-price',   label: '부자재 단가', page: 'page-grid' },
        { id: 'mat-main-info',   label: '자재 정보',   page: 'page-mat-info' },
        { id: 'mat-sub-info',    label: '부자재 정보', page: 'page-mat-sub-info' },
        { id: 'mat-scrap',       label: '폐자재',      page: 'page-mat-scrap' },
      ]},
      { label: '재고', icon: 'archive', items: [
        { id: 'mat-stock-raw', label: '원자재 재고', page: 'page-mat-stock-raw' },
        { id: 'mat-stock-sub', label: '부자재 재고', page: 'page-mat-stock-sub' },
      ]},
      { label: '설정', icon: 'cog', items: [
        { id: 'mat-cfg-safe',  label: '안전재고',   page: 'page-mat-safety-stock' },
      ]},
    ],
  },

  /* ============ 6. 자산·업체 ============ */
  {
    id: 'asset', label: '자산·업체',
    groups: [
      { label: '소모품', icon: 'box', items: [
        { id: 'as-buy-req',        label: '구매 신청',      page: 'page-grid' },
        { id: 'as-buy-req-list',   label: '신청 내역',      page: 'page-grid' },
        { id: 'as-buy-po',         label: '발주 내역',      page: 'page-grid' },
        { id: 'as-buy-vendor-po',  label: '업체 발주 내역', page: 'page-grid' },
        { id: 'as-io-in',          label: '입고 조회',      page: 'page-grid' },
        { id: 'as-out-req',        label: '출고 신청',      page: 'page-grid' },
        { id: 'as-out-req-list',   label: '신청 내역',      page: 'page-grid' },
        { id: 'as-io-out',         label: '출고 내역',      page: 'page-grid' },
        { id: 'as-status-consume', label: '소모품 현황',    page: 'page-grid' },
      ]},
      { label: '동산', icon: 'building', items: [
        { id: 'as-io',           label: '입/출고 현황', page: 'page-grid' },
        { id: 'as-status-asset', label: '동산 현황',    page: 'page-movable-status' },
      ]},
      { label: '부동산', icon: 'pin', items: [
        { id: 'as-realty-land',  label: '토지',     page: 'page-grid' },
        { id: 'as-realty-bldg',  label: '건물',     page: 'page-grid' },
      ]},
      { label: '업체', icon: 'briefcase', items: [
        { id: 'as-vendor',       label: '거래처 현황', page: 'page-vendor-status' },
        { id: 'as-vendor-maker', label: '제조 업체',   page: 'page-vendor-maker' },
      ]},
    ],
  },

  /* ============ 7. 장비/부품 ============ */
  {
    id: 'equipment', label: '장비·부품',
    groups: [
      { label: '장비', icon: 'tool', items: [
        { id: 'eq-list',  label: '장비 현황', page: 'page-eq-status' },
        { id: 'eq-as',    label: 'AS 내역',  page: 'page-eq-as' },
        { id: 'eq-close', label: '월마감',   page: 'page-eq-close' },
      ]},
      { label: '부품 관리', icon: 'cog', items: [
        { id: 'eq-parts-status', label: '부품 현황', page: 'page-eq-parts-status' },
        { id: 'eq-parts-in',     label: '부품 입고', page: 'page-eq-parts-in' },
        { id: 'eq-parts-out',    label: '부품 출고', page: 'page-eq-parts-out' },
        { id: 'eq-parts-swap',   label: '부품 교체', page: 'page-eq-parts-replace' },
      ]},
      { label: '칼/철형', icon: 'scissors', items: [
        { id: 'eq-knife-status', label: '칼/철형 현황', page: 'page-eq-knife-status' },
        { id: 'eq-knife-swap',   label: '칼 교체 현황', page: 'page-eq-knife-replace' },
        { id: 'eq-knife-close',  label: '월마감',       page: 'page-eq-knife-close' },
      ]},
    ],
  },

  /* ============ 8. 시스템 ============ */
  {
    id: 'system', label: '시스템',
    groups: [
      { label: '코드 관리', icon: 'code', items: [
        { id: 'sys-code-raw',    label: '원자재 코드', page: 'page-code-mgmt' },
        { id: 'sys-code-sub',    label: '부자재 코드', page: 'page-code-mgmt' },
        { id: 'sys-code-equip',  label: '장비 코드',   page: 'page-code-mgmt' },
        { id: 'sys-code-parts',  label: '부품 코드',   page: 'page-code-mgmt' },
        { id: 'sys-code-asset',  label: '자산 코드',   page: 'page-code-mgmt' },
        { id: 'sys-code-common', label: '공통 코드',   page: 'page-code-mgmt' },
      ]},
      { label: '권한 관리', icon: 'lock', items: [
        { id: 'sys-role',       label: '권한 관리',   page: 'page-role-mgmt' },
        { id: 'sys-role-admin', label: '관리자 지정', page: 'page-role-admin' },
      ]},
      { label: '기준 정보', icon: 'building', items: [
        { id: 'sys-location',   label: '장소 관리',   page: 'page-location' },
      ]},
    ],
  },

  /* ============ 9. 전자결재 ============ */
  {
    id: 'approval', label: '전자결재',
    groups: [
      { label: '기안', icon: 'fileCheck', items: [
        { id: 'apr-draft-write', label: '문서작성',    page: 'page-doc-write' },
        { id: 'apr-draft-sent',  label: '결재 요청함', page: 'page-grid' },
        { id: 'apr-draft-temp',  label: '임시저장함',  page: 'page-grid' },
      ]},
      { label: '결재', icon: 'checkSquare', items: [
        { id: 'apr-inbox',  label: '결재 대기', page: 'page-grid' },
        { id: 'apr-done',   label: '결재 완료', page: 'page-grid' },
        { id: 'apr-reject', label: '결재 반려', page: 'page-grid' },
      ]},
      { label: '참조', icon: 'share', items: [
        { id: 'apr-ref', label: '수신/참조', page: 'page-grid' },
      ]},
      { label: '관리', icon: 'cog', items: [
        { id: 'apr-delegate', label: '권한 위임',     page: 'page-grid' },
        { id: 'apr-line',     label: '결재선 등록',   page: 'page-grid' },
        { id: 'apr-stamp',    label: '인감 사용',     page: 'page-grid' },
        // 2026-06-12 메뉴 숨김 처리 (삭제 X, 추후 재사용 가능). hidden:true → 네비/권한관리 양쪽 모두 노출 제외.
        { id: 'apr-category', label: '문서/양식', page: 'page-apr-category', hidden: true },
      ]},
    ],
  },

  /* ============ 10. 보안·시설·차량 ============ */
  {
    id: 'security', label: '보안·시설·차량',
    groups: [
      { label: '보안 관리', icon: 'shield', items: [
        { id: 'sec-guard',     label: '경비 근무 일지', page: 'page-sec-guard' },
        // 2026-06-12 메뉴 숨김 처리 (삭제 X, 추후 재사용 가능). hidden:true → 네비/권한관리 양쪽 모두 노출 제외.
        { id: 'sec-visitor',   label: '방문자 등록',    page: 'page-sec-visitor',   hidden: true },
        { id: 'sec-blacklist', label: '블랙리스트',     page: 'page-sec-blacklist', hidden: true },
      ]},
      { label: '시설 관리', icon: 'building', items: [
        { id: 'sec-facility-monthly', label: '월간 현황', page: 'page-facility-monthly' },
        { id: 'sec-facility-list',    label: '점검 목록', page: 'page-facility-list' },
        { id: 'sec-facility-fix',     label: '수리 내역', page: 'page-facility-fix' },
      ]},
      { label: '차량 관리', icon: 'car', items: [
        { id: 'sec-car-book',   label: '차량예약',     page: 'page-vehicle-res' },
        { id: 'sec-car-my',     label: '내 예약 목록', page: 'page-vehicle-myres' },
        { id: 'sec-car-manage', label: '차량 관리',    page: 'page-vehicle-mgmt' },
        { id: 'sec-car-alert',  label: '예외 알림',    page: 'page-vehicle-alerts' },
        { id: 'sec-car-fuel',   label: '유류비 정산',  page: 'page-vehicle-fuel' },
      ]},
    ],
  },

  /* ============ 11. 경영 및 홍보 ============ */
  {
    id: 'biz', label: '경영·홍보',
    groups: [
      { label: '스케쥴/공지', icon: 'calendar', items: [
        { id: 'biz-schedule', label: '스케쥴',   page: 'page-schedule' },
        { id: 'biz-notice',   label: '사내공지', page: 'page-grid' },
      ]},
      { label: '현황', icon: 'chart', items: [
        { id: 'biz-visit',    label: '기업 방문', page: 'page-grid' },
        { id: 'biz-safety',   label: '산업안전',  page: 'page-grid' },
        { id: 'biz-plan',     label: '기획물',    page: 'page-grid' },
        { id: 'biz-incident', label: '사건사고',  page: 'page-grid' },
      ]},
      { label: '자료실/문서', icon: 'archive', items: [
        { id: 'biz-archive', label: '자료실/문서', page: 'page-grid' },
      ]},
    ],
  },
];
