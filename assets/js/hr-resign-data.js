/* =========================================================
 * Data module: 퇴사 데이터 (App.HRResign) — 구 page-hr-resign
 *   ※ 「퇴사 처리」 화면은 제거됨. 퇴사 처리 UI 는 「퇴사 현황」(page-hr-leave)의
 *      [+ 퇴사 처리] 모달로 통합. 본 파일은 App.HRResign 데이터 모듈을 단일 소스로 제공한다.
 *      (하단에 구 화면 렌더 코드가 남아 있으나 마운트되지 않아 비활성/inert.)
 *
 *  개요
 *   - 재직 중인 직원을 선택해 퇴사 처리. 동시에 ERP 계정 회수·자산 반납 등 부수 처리.
 *   - 처리된 결과는 App.HRResign 에 누적되며 「퇴사 현황」 화면이 이 데이터를 단일 소스로 사용.
 *
 *  View
 *   1) list  — 재직 중 직원 검색·선택 (좌측) + 퇴사 처리 폼 (우측 split layout)
 *   2) detail (모달) — 처리 결과 미리보기 + 최종 확인
 *
 *  데이터
 *   - 재직 직원: App.HRMembers.list().filter(active) — App.HRInfoMgmt 호환 조회
 *   - 퇴사 이력: App.HRResign.list() — 본 모듈이 단일 소스 (mock seed + 동적 추가)
 *
 *  UI Kit 재사용
 *   .split / .split--collapsible 패턴
 *   .toolbar / .tbl / .pill / .switch / .cb
 *   .modal / .modal-backdrop / .form-field
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  /* ============ 환경 ============ */
  const TODAY = '2026-05-18';
  const HR_NAME = '정혜진';

  /* ============ 퇴사 사유 ============ */
  const RESIGN_KINDS = [
    { value: 'self',          label: '본인 사정 (자발)',     voluntary: true  },
    { value: 'career',        label: '이직 (자발)',          voluntary: true  },
    { value: 'family',        label: '가정 사유 (자발)',     voluntary: true  },
    { value: 'health',        label: '건강 사유',            voluntary: true  },
    { value: 'retirement',    label: '정년',                 voluntary: false },
    { value: 'contract_end',  label: '계약 만료',            voluntary: false },
    { value: 'probation_end', label: '수습 종료 (미전환)',   voluntary: false },
    { value: 'dismissal',     label: '징계 해고',            voluntary: false },
    { value: 'layoff',        label: '권고 사직 (구조조정)', voluntary: false },
    { value: 'other',         label: '기타',                 voluntary: true  },
  ];
  function kindLabel(v) { return (RESIGN_KINDS.find(k => k.value === v) || {}).label || v; }
  function kindVoluntary(v) { return !!(RESIGN_KINDS.find(k => k.value === v) || {}).voluntary; }

  /* ============ HRResign 모듈 (단일 소스) ============
   *  · 다른 페이지(퇴사 현황, 정규직 전환 관리, 인사카드 등)가 모두 이 모듈을 통해 퇴사 데이터를 읽고/쓴다.
   *  · mock seed — 통계 화면용 기초 데이터 (직원의 status 와는 무관한 「과거 이력」 으로 가정)
   *
   *  ── [개인정보 보관 정책] ─────────────────────────────────────────
   *  퇴사일(retiredAt) 로부터 5년 동안만 인사 정보 보관.
   *  5년 경과 후에는 본 모듈의 레코드(이름·연락처·주민번호·계약정보 등 개인정보)를 파기하고,
   *  통계용 익명화 집계값(부서·사유·근속일수 등)만 별도 테이블로 이관해야 한다.
   *  실서비스에서는 야간 배치 또는 정기 점검에서 RESIGNS.filter(r => diffYears(today, r.retiredAt) > 5) 대상 파기.
   *  스토리보드에서는 미구현. */
  function ymd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }

  /* mock seed — 12개월치 분포로 통계 화면이 비어보이지 않게.
   *  실서비스에서는 모든 퇴사 데이터가 본 테이블에서 옴. */
  function makeSeed() {
    const names = [
      '김지영','이성호','박나래','정승현','한가영','오재호','윤혜린','강민석','조하림','홍지수',
      '서영준','문아연','임도하','신예나','권태현','류재인','노아영','배준호','전수민','진다영',
      '백승원','구지원','남시현','심하영','피우진','왕재은','반민서','채주현','목하연','우민기',
      '천세진','형도원','윤서윤','류미정','양수현',
    ];
    const depts = [
      '경영지원본부 / 인사팀','경영지원본부 / 재무팀','경영지원본부 / 총무팀',
      '생산본부 / 생산1팀','생산본부 / 생산2팀','생산본부 / 품질팀',
      '연구소 / R&D1팀','연구소 / R&D2팀',
      '홍보팀','개발팀',
    ];
    const positions = ['팀원','파트원','팀장','파트장','본부장'];
    const kinds = ['self','career','family','health','retirement','contract_end','probation_end','dismissal','layoff','self','career','self'];
    const today = new Date(TODAY);
    return names.map((nm, i) => {
      /* 12개월 분포 — 0~360일 전 사이. 일부는 최근에 몰리도록 */
      const offset = -(i * 10 + (i % 4) * 3 + 5);
      const retiredAt = ymd(addDays(today, offset));
      const joinYearsAgo = 1 + (i % 12);
      const joinDate = ymd(addDays(today, offset - joinYearsAgo * 365 - (i % 90)));
      const kind = kinds[i % kinds.length];
      /* 사번 — 입사자 관리 마스터(SW{yy}{mm}{dd}{nn}) 형식 */
      const empId = `SW${joinDate.slice(2,4)}${joinDate.slice(5,7)}${joinDate.slice(8,10)}${String((i % 30) + 1).padStart(2,'0')}`;
      return {
        id: `RSG-${retiredAt.slice(0,4)}-${String(i + 1).padStart(4, '0')}`,
        empId,
        name: nm,
        dept: depts[i % depts.length],
        position: positions[i % positions.length],
        rank: ['사원','주임','대리','과장','차장','부장'][i % 6],
        joinDate,
        retiredAt,
        reasonKind: kind,
        voluntary: kindVoluntary(kind),
        reason: '',
        erpRevoked: true,
        assetReturnRequested: true,
        handoverDone: true,
        processedBy: ['정혜진','윤민지'][i % 2],
        processedAt: retiredAt,
        tenureDays: Math.abs(Math.round((new Date(retiredAt) - new Date(joinDate)) / 86400000)),
      };
    });
  }

  /* 보관기간 경과(퇴사일+5년) 데모용 레거시 퇴사 이력 — 「퇴사 현황」의 [삭제] 버튼이
     활성화되는 케이스를 확인할 수 있도록 5년 이상 지난 레코드 일부를 시드에 포함. */
  function makeLegacySeed() {
    const today = new Date(TODAY);
    const legacy = [
      { nm: '하동훈', dept: '생산본부 / 생산1팀', position: '팀원', rank: '대리', kind: 'career',     years: 7 },
      { nm: '오세영', dept: '경영지원본부 / 총무팀', position: '파트원', rank: '주임', kind: 'self',   years: 6 },
      { nm: '문상필', dept: '연구소 / R&D1팀',   position: '팀장', rank: '과장', kind: 'retirement',  years: 5 },
    ];
    return legacy.map((s, i) => {
      const retiredAt = ymd(addDays(today, -(s.years * 365 + i * 20 + 30)));
      const joinDate  = ymd(addDays(new Date(retiredAt), -(3 + i) * 365));
      const empId = `SW${joinDate.slice(2,4)}${joinDate.slice(5,7)}${joinDate.slice(8,10)}${String((i % 30) + 1).padStart(2,'0')}`;
      return {
        id: `RSG-${retiredAt.slice(0,4)}-${String(900 + i + 1).padStart(4, '0')}`,
        empId, name: s.nm, dept: s.dept, position: s.position, rank: s.rank,
        joinDate, retiredAt,
        reasonKind: s.kind, voluntary: kindVoluntary(s.kind), reason: '',
        erpRevoked: true, assetReturnRequested: true, handoverDone: true,
        processedBy: ['정혜진','윤민지'][i % 2], processedAt: retiredAt,
        tenureDays: Math.abs(Math.round((new Date(retiredAt) - new Date(joinDate)) / 86400000)),
      };
    });
  }

  let RESIGNS = makeSeed().concat(makeLegacySeed());

  App.HRResign = {
    list: () => RESIGNS.slice(),
    add(rec) {
      const id = `RSG-${(rec.retiredAt || TODAY).slice(0,4)}-${String(RESIGNS.length + 1).padStart(4,'0')}`;
      const full = Object.assign({
        id,
        empId: rec.empId, name: rec.name,
        dept: rec.dept, position: rec.position, rank: rec.rank,
        joinDate: rec.joinDate, retiredAt: rec.retiredAt,
        reasonKind: rec.reasonKind, voluntary: kindVoluntary(rec.reasonKind),
        reason: rec.reason || '',
        erpRevoked: !!rec.erpRevoked,
        assetReturnRequested: !!rec.assetReturnRequested,
        handoverDone: !!rec.handoverDone,
        processedBy: rec.processedBy || HR_NAME,
        processedAt: rec.processedAt || TODAY,
        tenureDays: rec.joinDate && rec.retiredAt
          ? Math.abs(Math.round((new Date(rec.retiredAt) - new Date(rec.joinDate)) / 86400000))
          : null,
      }, rec);
      RESIGNS.unshift(full);
      return full;
    },
    /* 개인정보 보관 정책(상단 주석 참고) — 퇴사일+5년 경과 레코드 파기.
       「퇴사 현황」의 [삭제] 버튼이 삭제 가능일 도달 시 호출. */
    remove(id) {
      const before = RESIGNS.length;
      RESIGNS = RESIGNS.filter(r => r.id !== id);
      return RESIGNS.length < before;
    },
    kinds: () => RESIGN_KINDS.slice(),
    kindLabel,
    kindVoluntary,
  };
})();
