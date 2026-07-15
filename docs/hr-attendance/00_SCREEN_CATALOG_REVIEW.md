# 인사·근태 전체 화면 목록 — 검토용 사본

> 최신 `index.html`·`assets` 코드 기준 검토본입니다. 기존 `00_SCREEN_CATALOG.md`는 수정하지 않았습니다.  
> 기준 커밋: `eae0ad4` (`안쓰는 코드 삭제 수정`, 2026-07-14 18:19 KST)

## 1. 문서 기준

- 분석 기준일: 2026-07-15
- 분석 범위: `index.html`, `assets/js/page-hr-*.js`, `assets/js/page-att-*.js`, `assets/js/nav-data.js`와 각 화면이 직접 참조하는 인사·근태 데이터 모듈
- 라우트 표기: 이 프로젝트는 URL 라우터가 아니라 `NAV_DATA`의 item ID와 `#page-*` DOM을 연결하므로 `메뉴 item ID → DOM ID` 형식으로 기록한다.
- 분석 상태: 화면·탭·버튼·프론트엔드 동작이 소스에 있으면 `확정`, 업무상 필요하지만 연결 구현이 없으면 프로세스 문서에서 `구현 갭`으로 구분한다.
- 제외: 단순 Confirm, Toast, 인라인 오류, 도움말은 독립 화면으로 세지 않는다.

## 2. 집계 요약

| 구분 | 수 | 비고 |
|---|---:|---|
| 전체 식별 UI (활성) | 108 | Page 25 + 업무성 하위 UI 83 |
| Page 수준 화면 (활성) | 25 | 인사 17, 근태 8 |
| 현재 메뉴 노출 Page | 24 | 인사 16, 근태 8 |
| 프로필 진입 Page | 1 | 내 정보 |
| 별도 업무성 Detail·Modal·OffCanvas (활성) | 83 | Detail 16, Modal 63, OffCanvas 4 |
| 삭제 이력 (별도 문서) | 31 | Page 8, Modal 20, OffCanvas 3 · [삭제 이력](SCREEN_CATALOG_DELETE_HISTORY.md) |

> `page-hr-eval-history.js`는 독립 Page가 아니라 평가 회차 결과 Modal 공급자이므로 3절의 `HR-EVR-001` 하위 UI에 포함했다.

## 3. 활성 화면 IA (Page → 하위 UI)

25개 Page와 83개 업무성 하위 UI를 상위·하위 관계로 합친 IA다. 하위 UI는 부모 Page의 메뉴 경로와 프로세스 그룹을 상속한다.

- 83개 하위 UI는 모두 25개 Page 중 하나에 연결된다.
- 하위 UI가 있는 Page는 22개이며, 하위 UI가 없는 Page는 `ATT-MYW-001`, `ATT-SSV-001`, `ATT-MLV-001` 3개다.

| IA 구조 | 메뉴 경로·상위 | 화면명 | 유형 | 라우트·위치 | 프로세스 그룹 | 주요 목적·액션 | 소스·근거 | 분석 상태 |
|---|---|---|---|---|---|---|---|---|
| **SELF-HR-001**<br>하위 UI 2건 | GNB 프로필 | **내 정보** | Page | `my-info → #page-my-info` | 개인 인사정보 | 로그인 사용자의 인사정보·계약·입사서류 셀프서비스<br>**주요 액션:** 조회, 정보 변경 요청, 계약 확인, 서류 다운로드·업로드·서명 | `page-hr-info-mgmt.js`<br>`app.js`의 `data-open-myinfo`, `initMyInfoPage()` | 확정 |
| ├─ SELF-HR-001-D01 | ↳ SELF-HR-001 | 내 인사정보카드 | Detail | `#page-my-info` 내부 | 상위 Page 상속 | 공개·비공개 정보, 계약, 입사서류 조회·변경 요청 | `mountMyInfo()` | 확정 |
| └─ SELF-HR-001-M02 | ↳ SELF-HR-001 | 서류 업로드 | Modal | `modal-myinfo-upload` | 상위 Page 상속 | 입사서류 파일 업로드·삭제 | `page-hr-info-mgmt.js` | 확정 |
| **HR-EMP-001**<br>하위 UI 2건 | 인사 > 인사 관리 | **임직원 현황** | Page | `hr-employee → #page-hr-employee` | 조직·인사 운영 | 조직 트리와 카드 기반 재직자 현황 및 인사카드 조회<br>**주요 액션:** 조직별 조회, 인사카드, 수정 요청, PDF | `page-hr-employee.js`<br>`nav-data.js`, 파일 헤더 `SCR-EMP-01~05` | 확정 |
| ├─ HR-EMP-001-M03 | ↳ HR-EMP-001 | 부서 관리 | Modal | `modal-emp-dept-manage` | 상위 Page 상속 | 부서 추가·수정·사용 중지·구조 관리 | `index.html`, `App.HrDeptManage` | 확정 |
| └─ HR-EMP-001-M05 | ↳ HR-EMP-001 | 조직도 변경 이력 | Modal | `modal-emp-org-history` | 상위 Page 상속 | 저장된 조직 변경 이력과 처리 시점 조회 | `openOrgHistory()` (`index.html:522` 버튼(`data-emp-org-history`) → `page-hr-employee.js:1510` 바인딩 → `:1045` 정의) | 확정 — 임직원 현황 화면 「조직도 관리」 모달 footer 좌측 [변경 이력] 버튼에서 진입 (2026-07-15 소스 확인) |
| **HR-EMP-002**<br>하위 UI 10건 | 인사 > 인사 관리 | **임직원 관리** | Page | `hr-info-mgmt → #page-hr-info-mgmt` | 입사·인사 운영 | 입사자 등록부터 계정·정보·계약·서류 완료까지 관리<br>**주요 액션:** 개별·일괄 등록, 상세, 계약 작성, 카드 편집, 부서 관리 | `page-hr-info-mgmt.js`<br>파일 헤더 `SCR-EMP-01~04`, `buildPage()` | 확정 |
| ├─ HR-EMP-002-D01 | ↳ HR-EMP-002 | 임직원 개별 등록 | Detail | `#modal-empi-create` (풀스크린 상세, page-bar) | 상위 Page 상속 | 입사 기본정보 등록, 계정·계약 단계 시작 | `openCreateModal()`, `injectCreateModal()` — id·fn 은 레거시 네이밍(실제 모달 아님) | 확정 (타입 정정 2026-07-14) |
| ├─ HR-EMP-002-M05 | ↳ HR-EMP-002 | 인사정보카드 | Modal | `modal-empi-card` (임직원 현황·계약·발령·포상징계 등 공통 진입) | 상위 Page 상속 | 기본 정보·인사 정보·급여 정보·이력·현황·서류 보관함 5탭 조회, PDF 출력, 섹션 편집, 계정 승인·반려 | `injectCardModal()`, `openCardModal()`, `App.HRInfoMgmtCard.open()` | 확정 |
| ├─ HR-EMP-002-M03 | ↳ HR-EMP-002 | 인사카드 정보 편집 | Modal | `modal-empi-card-edit` | 상위 Page 상속 | 근로·임금·소속·기본·계좌·근무정보 섹션 편집 | `openCardSectionEdit()` | 확정 |
| ├─ HR-EMP-002-M04 | ↳ HR-EMP-002 | 계약서 미리보기·서명 요청 | Modal | `modal-empi-ctr-preview` | 상위 Page 상속 | 계약서 확인 후 발송·서명 요청 | `openContractPreview()` | 확정 |
| ├─ HR-EMP-002-M06 | ↳ HR-EMP-002 | 계정 등록 안내 재발송 사유 | Modal | `data-resend-modal-host` | 상위 Page 상속 | 재발송 사유 입력 후 계정 등록 안내 재발송 | `openResendModal()` (`page-hr-info-mgmt.js:949` 버튼(`data-row-act="resend"`) → `:1528` 바인딩(리스트 `:1517` 위임) → `:1752` 정의) | 확정 — 임직원 목록 그리드 계정등록 「기능」 컬럼의 [재발송] 버튼(등록대기 행·일 2회 한도 미소진 시 노출)에서 진입 (2026-07-15 소스 확인) |
| ├─ HR-EMP-002-M07 | ↳ HR-EMP-002 | 계정 등록 안내 재발송 이력 | Modal | `data-resend-hist-host` | 상위 Page 상속 | 재발송 시점·사유·발송자 이력 조회 | `openResendHistModal()` (`page-hr-info-mgmt.js:952` 버튼(`data-row-act="resend-hist"`) → `:1530` 바인딩 → `:1812` 정의) | 확정 — 임직원 목록 그리드 계정등록 「기능」 컬럼의 [재발송 이력] 버튼(등록대기 행)에서 진입 (2026-07-15 소스 확인) |
| ├─ HR-EMP-002-M08 | ↳ HR-EMP-002 | SMS 발송 | Modal | `modal-empi-sms` | 상위 Page 상속 | 문자 템플릿·메시지 편집 후 발송 | `openSmsModal()` (개별등록 [등록] `page-hr-info-mgmt.js:3255` → `:9913` 바인딩 → 도급직 `:10221` 호출 / 계약서미리보기 [서명 요청 발송] `:10290` → `:10303` 바인딩 → `:10309` 호출 → `:2187` 정의) | 확정 — 「개별 등록」 모달 [등록] 클릭 시 진입: 도급직은 SMS 발송 모달 즉시 표시, 그 외 고용형은 계약서 미리보기 [서명 요청 발송]을 거쳐 표시 (2026-07-15 소스 확인). ※ 미사용 목록 행 [문자 발송] 버튼(`rowActionsHTML`)·대량발송(`doSmsSend`) 死코드는 제거함 (2026-07-15) |
| ├─ HR-EMP-002-M09 | ↳ HR-EMP-002 | 개인 인사표 편집 | Modal | `modal-empi-ptable` | 상위 Page 상속 | 개인 인사표 행 추가·수정·삭제 | `openPersonalTableEdit()` (`page-hr-info-mgmt.js:3425` 버튼(`data-empi-card-section-act`) → `:6818` 바인딩 → 분기 `:6924` → `:4308` 정의) | 확정 — 인사정보카드(modal-empi-card) 「인사 정보」 탭 표 섹션(학력·경력·자격증·어학·가족 등)의 [편집]/[+추가] 버튼에서 진입(인사담당자 권한 시. 본인 접근 시엔 변경요청으로 분기) (2026-07-15 소스 확인) |
| ├─ HR-EMP-002-M10 | ↳ HR-EMP-002 | 세액 감면 정보 편집 | Modal | `modal-empi-tax` | 상위 Page 상속 | 세액 감면 구분·기간·율 등 급여 세무 정보 편집 | `openPayrollTaxEdit()` (`page-hr-info-mgmt.js:3425` 버튼(payroll-tax 액션 `:5368`) → `:6818` 바인딩 → 분기 `:6932` → `:5502` 정의) | 확정 — 인사정보카드 「급여 정보」 탭 > 공제 정보 > "중소기업 소득세 감면 정보"(payroll-tax) 서브블록의 [편집]/[+추가] 버튼에서 진입(인사담당자 권한 시. 본인 접근 시엔 신청으로 분기) (2026-07-15 소스 확인) |
| └─ HR-EMP-002-M12 | ↳ HR-EMP-002 | 인사 문서 미리보기 | Modal | `modal-empi-doc-preview` | 상위 Page 상속 | 계약서 등 인사 문서 조회·인쇄·PDF 출력 | `openDocPreviewModal()` (계약 미리보기 `page-hr-info-mgmt.js:4857`/`:4967` → `:6750` 바인딩(`data-empi-contract-preview`); 서류 미리보기 `:11334` → `:11540`/`:6803` 바인딩(`data-empi-doc-preview`) → `:10464` 정의) | 확정 — 인사정보카드에서 서명완료 문서 [미리보기] 버튼에서 진입: (a)「근무·계약 정보」탭 근로/임금 계약, (b) 계약 이력 행, (c) 서류보관함 탭 서명완료 서류 (2026-07-15 소스 확인) |
| **HR-PRZ-001**<br>하위 UI 1건 | 인사 > 인사 관리 | **포상·징계** | Page | `hr-prize-discipline → #page-hr-prize-discipline` | 인사 운영 | 활성 직원의 포상·징계 이력 관리<br>**주요 액션:** 조회, 포상·징계 등록·수정, 대상자 선택, 인사카드 | `page-hr-prize-discipline.js`<br>`nav-data.js`, 파일 헤더 | 확정 |
| └─ HR-PRZ-001-M01 | ↳ HR-PRZ-001 | 포상·징계 편집 | Modal | `modal-pd-editor` | 상위 Page 상속 | 유형·대상자·통보일·사유·결과 등록·수정 | `openEditor()` | 확정 |
| **HR-CTR-001**<br>하위 UI 4건 | 인사 > 계약·발령·휴직 | **계약 관리** | Page | `hr-contract → #page-hr-contract` | 계약 운영 | 근로·임금계약 작성, 발송, 서명, 이력, 무효화<br>**주요 액션:** 조회, 개별·일괄 작성, 서명 요청, 상세, 무효화 | `page-hr-contract.js`<br>파일 헤더 `SCR-CTR-01/02/05`, `STATE.view` | 확정 |
| ├─ HR-CTR-001-D01 | ↳ HR-CTR-001 | 계약서 작성 | Detail | Page 내부 `STATE.view='editor'` | 상위 Page 상속 | 근로·임금계약 작성·미리보기·저장·발송 | `renderEditorView()` | 확정 |
| ├─ HR-CTR-001-D02 | ↳ HR-CTR-001 | 계약서 상세 | Modal | `modal-ctr-view` | 상위 Page 상속 | 진행 단계, 계약정보, 본문, 처리 이력 조회 | `openViewModal()`, `modal-ctr-view` | 확정 |
| ├─ HR-CTR-001-M02 | ↳ HR-CTR-001 | 계약서 작성 대상 직원 선택 | Modal | `modal-ctr-bulk` | 상위 Page 상속 | 개별 계약서 작성 대상 직원 단일 선택 | `openBulkPickForIndividual()`, `bindBulkModal()`, `confirmBulkSingle()` | 확정 |
| └─ HR-CTR-001-M03 | ↳ HR-CTR-001 | 계약 무효화 | Modal | `modal-ctr-void` | 상위 Page 상속 | 무효화 사유 입력 후 상태 변경 | `index.html`, `bindVoidModal()` | 확정 |
| **HR-APT-001**<br>하위 UI 3건 | 인사 > 계약·발령·휴직 | **발령 관리** | Page | `hr-appoint → #page-hr-appoint` | 발령 운영 | 전보·승진·수습해제 등 발령 등록과 예정 건 취소<br>**주요 액션:** 조회, 발령 작성, 대상자 선택, 예정 발령 취소, 문서 미리보기 | `page-hr-appoint.js`<br>파일 헤더, `loadEmployees()` | 확정 |
| ├─ HR-APT-001-D01 | ↳ HR-APT-001 | 발령 작성 | Modal | `modal-apt-create` | 상위 Page 상속 | 발령 유형·대상·시행일 입력, 문서 미리보기, 등록 | `openEditor()`, `openAptModal()` | 확정 |
| ├─ HR-APT-001-O02 | ↳ HR-APT-001 | 발령 대상 직원 선택 | OffCanvas | `emp-picker-oc` | 상위 Page 상속 | 조직 트리·검색을 이용한 완료 상태 직원 단일·다중 선택 | `App.EmployeePicker.open()`, `page-hr-appoint.js` | 확정 |
| └─ HR-APT-001-O01 | ↳ HR-APT-001 | 사령장·임명장 미리보기 | OffCanvas | `oc-appoint-doc` | 상위 Page 상속 | 발령문 조회·인쇄 | `openDrawer()` | 확정 |
| **HR-LOA-001**<br>하위 UI 2건 | 인사 > 계약·발령·휴직 | **휴직 관리** | Page | `hr-loa → #page-hr-loa` | 휴직·복직 | 승인된 휴직·출산휴가 이력과 기간 기준 상태 관리<br>**주요 액션:** 조회, 상세, 승인 문서 확인, 인사카드 | `page-hr-loa.js`<br>파일 헤더, `computeStatus()` | 확정 |
| ├─ HR-LOA-001-M01 | ↳ HR-LOA-001 | 휴직 상세 | Modal | `modal-loa-detail` | 상위 Page 상속 | 휴직 기간·현황·복직예정일·자동 전환 안내 | `openDetail()` | 확정 |
| └─ HR-LOA-001-M02 | ↳ HR-LOA-001 | 휴직 승인문서 상세 | Modal | `modal-loa-approval` | 상위 Page 상속 | 전자결재 신청·승인 정보 조회 | `openApprovalDetail()` | 확정 |
| **HR-EVT-001**<br>하위 UI 5건 | 인사 > 평가 관리 | **역량평가 설정** | Page | `hr-eval-set-type → #page-hr-eval-type` | 평가 기초 설정 | 평가 양식과 전역 평가 단계·등급 설정<br>**주요 액션:** 양식 등록·수정·복제·삭제, 단계·등급 설정, PDF | `page-hr-eval-type.js`<br>`nav-data.js`, 파일 헤더 | 확정 |
| ├─ HR-EVT-001-D01 | ↳ HR-EVT-001 | 평가 양식 등록·수정 | Detail | Page 내부 `STATE.view='editor'` | 상위 Page 상속 | 척도·분야·문항·배점 편집과 저장 | `renderEditorView()` | 확정 |
| ├─ HR-EVT-001-D02 | ↳ HR-EVT-001 | 평가 양식 상세 | Detail | Page 내부 `STATE.view='detail'` | 상위 Page 상속 | 양식·적용 회차·수정 이력 조회, 복제·PDF | `renderDetailView()` | 확정 |
| ├─ HR-EVT-001-D03 | ↳ HR-EVT-001 | 평가 단계·등급 설정 | Detail | Page 내부 `STATE.view='stageGrade'` | 상위 Page 상속 | 전역 평가자 단계·배분율·직군 등급 설정 | `renderStageGradeView()` | 확정 |
| ├─ HR-EVT-001-M01 | ↳ HR-EVT-001 | 평가 양식 수정 사유 | Modal | `et-reason-modal` | 상위 Page 상속 | 평가 양식 저장 전 변경 사유 입력 | `openReasonModal()` (`page-hr-eval-type.js:1035` 버튼(`data-et-save`) → `:1802` 바인딩(performSave) → 조건부 호출 `:2023` → `:2065` 정의) | 확정 — 역량평가 설정(평가 양식) 화면에서 기존 양식 수정 후 [저장] 클릭 시 진입(신규 등록은 즉시 저장되어 모달 미표시, 기존 수정만 사유 게이트) (2026-07-15 소스 확인) |
| └─ HR-EVT-001-M02 | ↳ HR-EVT-001 | 평가 단계·등급 설정 수정 사유 | Modal | `hret-reason-modal` | 상위 Page 상속 | 평가 단계·등급 설정 저장 전 변경 사유 입력 | `openConfigReasonModal()` (`page-hr-eval-type.js:2777` 버튼(`data-cfg-save`) → `:2832` 바인딩(saveStageGrade) → 호출 `:2859` → `:2615` 정의) | 확정 — 역량평가 설정 「단계·등급 설정」 뷰에서 배분율/등급 수정 후 [저장] 클릭 시(합계·명칭 검증 통과 후) 진입 (2026-07-15 소스 확인) |
| **HR-EVR-001**<br>하위 UI 11건 | 인사 > 평가 관리 | **역량평가 회차** | Page | `hr-eval-round → #page-hr-eval-round` | 평가 운영 | 평가 회차 개설, 대상·평가자 확정, 시작·종료·확정<br>**주요 액션:** 등록, 수정, 복제, 시작, 중단, 진행 현황, 확정, 결과 | `page-hr-eval-round.js`<br>파일 헤더, `App.HREvalRounds` | 확정 |
| ├─ HR-EVR-001-D01 | ↳ HR-EVR-001 | 평가 회차 등록·상세 | Detail | Page 내부 `create/edit/detail` | 상위 Page 상속 | 회차 기본정보, 대상자, 평가자 배정, 등록·수정 | `renderFormView()` | 확정 |
| ├─ HR-EVR-001-D02 | ↳ HR-EVR-001 | 평가 진행 현황 | Detail | Page 내부 `STATE.view='progress'` | 상위 Page 상속 | 대상자별 평가 단계·담당자·완료율 관리 | `renderProgressView()` | 확정 |
| ├─ HR-EVR-001-M01 | ↳ HR-EVR-001 | 평가 결과 | Modal | `modal-evh-result` | 상위 Page 상속 | 확정 회차 등급 분포·대상자별 결과와 상세 조회 | `page-hr-eval-history.js` | 확정 |
| ├─ HR-EVR-001-M02 | ↳ HR-EVR-001 | 평가 회차 복사 | Modal | `modal-evr-copy` | 상위 Page 상속 | 기존 평가 회차의 조건을 복사해 신규 회차 생성 | `openCopyModal()` (`page-hr-eval-round.js:841` 버튼(복제) → `:772` 바인딩(리스트 클릭 위임) → `:985` 정의; `confirmCopy()` `:996`, 확인버튼 `:2216`) | 확정 — 회차 목록 각 행의 「더보기」 케밥 드롭다운 [복제] 클릭 시 진입 (2026-07-15 소스 확인) |
| ├─ HR-EVR-001-M04 | ↳ HR-EVR-001 | 평가 양식 미리보기 | Modal | `evr-form-preview-modal` | 상위 Page 상속 | 평가 문항·배점·단계 구성을 읽기 전용으로 확인 | `openFormPreviewModal()` (`page-hr-eval-round.js:1277` 버튼(`data-evr-type-preview`) → `:1770` 바인딩 → `:2240` 정의; 양식 링크 `:1504`) | 확정 — 등록/수정 폼·상세 화면 「평가 정보」 섹션의 양식 select 옆 [미리보기] 버튼(또는 양식 링크) 클릭 시 진입 (2026-07-15 소스 확인) |
| ├─ HR-EVR-001-M05 | ↳ HR-EVR-001 | 평가 회차 수정 사유 | Modal | `evr-reason-modal` | 상위 Page 상속 | 평가 회차 저장 전 변경 사유 필수 입력 | `openEditReasonModal()` (`page-hr-eval-round.js:1231` 버튼(`data-evr-form-save`) → `:1707` 바인딩(saveForm `:2091`, 호출 `:2101`) → `:2105` 정의) | 확정 — 수정(edit) 위저드 [수정 저장] 클릭 → saveForm() 검증 통과 후(신규 아님) 변경 사유 입력 게이트로 진입 (2026-07-15 소스 확인) |
| ├─ HR-EVR-001-M06 | ↳ HR-EVR-001 | 평가 회차 정보 | Modal | `evr-info-modal` | 상위 Page 상속 | 회차 기본정보·대상자·평가자·변경 이력 조회 | `openRoundInfoModal()` (`page-hr-eval-round.js:2538` 버튼(`data-evr-prog-info`) → `:2606` 바인딩 → `:2451` 정의) | 확정 — 진행 현황(progress) 화면 상단 회차 헤더 툴바 [정보] 버튼 클릭 시 진입 (2026-07-15 소스 확인) |
| ├─ HR-EVR-001-M07 | ↳ HR-EVR-001 | 평가 입력기간 재개 | Modal | `evr-reopen-modal` | 상위 Page 상속 | 종료된 평가의 신규 입력기간 설정 후 재개 | `openReopenModal()` (`page-hr-eval-round.js:2525` 버튼 → `:2623` 바인딩 → `:2992`) | 확정 — 「평가 종료」 회차 진행 현황 툴바 [입력기간 재오픈]에서 진입 (2026-07-15 실측) |
| ├─ HR-EVR-001-M08 | ↳ HR-EVR-001 | 대체 평가자 재배정 | Modal | `evr-reassign-modal` | 상위 Page 상속 | 대상 평가의 대체 평가자 선택·재배정 | `openReassignPicker()` (`page-hr-eval-round.js:2707` 버튼(`data-prog-reassign`) → `:2657` 바인딩(진행표 클릭 위임) → `:2922` 정의) | 확정 — 진행 현황 화면에서 미제출 대상자 행의 후속조치 케밥 메뉴 [대체 평가자 지정] 클릭 시 진입(인사담당자 canActNow+canReassign 조건) (2026-07-15 소스 확인) |
| ├─ HR-EVR-001-M09 | ↳ HR-EVR-001 | 평가 진행 대상자 상세 | Modal | `evr-prog-detail-modal` | 상위 Page 상속 | 대상자별 평가 단계·평가자·진행 상태 조회 | `openProgressDetail()` (`page-hr-eval-round.js:2727` 버튼(`data-prog-detail`) → `:2659` 바인딩 → `:3086` 정의; 행 클릭 `:2712`(`data-prog-row`) → `:2664`) | 확정 — 진행 현황 화면 대상자 행의 [상세] 버튼 클릭(또는 행 클릭) 시 진입 (2026-07-15 소스 확인) |
| └─ HR-EVR-001-M10 | ↳ HR-EVR-001 | 평가 결과 대상자 상세 | Modal | `data-evh-detail-modal` | 상위 Page 상속 | 대상자별 점수·등급·평가 의견 상세 조회 | `openDetailModal()` (`page-hr-eval-history.js:553` 성명 링크(`data-evh-open-detail`, 행 `:547`) → `:836` 바인딩(ensureRootDelegation `:833`) → `:317` 정의) | 확정 — [결과 보기]로 평가 결과 모달을 연 뒤 결과표의 대상자 성명 링크 클릭 시 진입(모달 제공자 page-hr-eval-history.js) (2026-07-15 소스 확인) |
| **HR-EVI-001**<br>하위 UI 3건 | 인사 > 평가 관리 | **역량평가 진행** | Page | `hr-eval-input → #page-hr-eval-input` | 평가 실행 | 구성원이 자신에게 배정된 평가를 입력·제출<br>**주요 액션:** 참여 회차 조회, 평가 입력, 임시저장, 제출, 이전 단계 확인 | `page-hr-eval-input.js`<br>파일 헤더, `STATE.view` | 확정 |
| ├─ HR-EVI-001-D01 | ↳ HR-EVI-001 | 회차별 내 평가 할 일 | Detail | Page 내부 `STATE.view='round'` | 상위 Page 상속 | 자신에게 배정된 대상·단계 목록 조회 | `renderRoundView()` | 확정 |
| ├─ HR-EVI-001-O01 | ↳ HR-EVI-001 | 역량평가 입력 | OffCanvas | `data-evi-eval-modal` | 상위 Page 상속 | 문항 점수·의견 입력, 임시저장·제출 | `openEvaluate()` 계열 | 확정 |
| └─ HR-EVI-001-M01 | ↳ HR-EVI-001 | 이전 평가 단계 조회 | Modal | `data-evi-prior-modal` | 상위 Page 상속 | 이전 평가자의 점수·의견을 읽기 전용으로 조회 | `openPriorStage()` (`page-hr-eval-input.js:1046` 버튼(`data-evi-prior`) → `:590` 위임 바인딩 → `:1139` 정의) | 확정 — 역량평가 진행 화면 평가 OffCanvas 상단 단계 진행바에서 제출된 이전 단계의 [평가내용 보기] 버튼 클릭 시 진입 (2026-07-15 소스 확인) |
| **HR-PEV-001**<br>하위 UI 3건 | 인사 > 평가 관리 | **수습평가 진행** | Page | `hr-eval-prob → #page-hr-eval-prob` | 수습 운영 | 수습 종료 임박 직원 평가와 전환·연장·종료 후속 요청<br>**주요 액션:** 평가, 임시저장, 제출, 후속 처리 승인 요청, 결과 조회 | `page-hr-eval-prob.js`<br>파일 헤더, `POSTACTION` | 확정 |
| ├─ HR-PEV-001-O01 | ↳ HR-PEV-001 | 수습평가 입력 | OffCanvas | `data-pep-eval-modal` | 상위 Page 상속 | 차수별 점수·종합의견·최종 결과 입력 | `openEvalModal()` | 확정 |
| ├─ HR-PEV-001-M01 | ↳ HR-PEV-001 | 수습평가 후속 처리 | Modal | `data-pep-followup-modal` | 상위 Page 상속 | 수습 해제·연장·종료 정보 입력과 승인 요청 | `POSTACTION`, `submitFollowupApproval()` | 확정 |
| └─ HR-PEV-001-M02 | ↳ HR-PEV-001 | 이전 수습평가 조회 | Modal | `data-pep-prior-modal` | 상위 Page 상속 | 이전 차수 수습평가 결과를 읽기 전용으로 조회 | `openPriorModal()` (`page-hr-eval-prob.js:1426` 버튼(`data-pep-prior`) → `:925` 위임 바인딩 → `:1034` 정의) | 확정 — 수습평가 진행 화면 평가 OffCanvas 차수 진행바에서 제출 완료된 이전 차수의 [평가내용 보기] 버튼 클릭 시 진입 (2026-07-15 소스 확인) |
| **HR-PES-001**<br>하위 UI 2건 | 인사 > 평가 관리 | **수습평가 설정** | Page | `hr-eval-set-prob → #page-hr-eval-prob-set` | 평가 기초 설정 | 직책자·비직책자 수습평가 양식과 버전 관리<br>**주요 액션:** 양식 전환, 문항 편집, 변경 사유 입력, 저장, 버전 조회 | `page-hr-eval-prob-set.js`<br>파일 헤더, `App.HRProbEval.saveTemplate()` | 확정 |
| ├─ HR-PES-001-D01 | ↳ HR-PES-001 | 수습평가 양식 편집 | Detail | Page 본문 | 상위 Page 상속 | 직책자·비직책자 문항·버전·변경 사유 관리 | `saveTemplate()` | 확정 |
| └─ HR-PES-001-M01 | ↳ HR-PES-001 | 수습평가 설정 수정 사유 | Modal | `pset-reason-modal` | 상위 Page 상속 | 수습평가 양식·단계 설정 저장 전 변경 사유 입력 | `openReasonModal()` (양식 `page-hr-eval-prob-set.js:295`(`data-pset-save`) → `:603` 바인딩 → `:616` 호출 / 단계 `:393`(`data-pset-stage-save`) → `:722` 바인딩 → `:741` 호출 → `:182` 정의) | 확정 — 수습평가 설정에서 [저장] 클릭 시 진입, 경로 2개: (a) 양식 편집 [저장](`data-pset-save`), (b) 「단계 설정」 뷰 [저장](`data-pset-stage-save`) — 검증 통과 후 동일 모달 재사용 (2026-07-15 소스 확인) |
| **HR-PAY-001**<br>하위 UI 7건 | 인사 > 급여 관리 | **급여 정산** | Page | `hr-pay-settlement → #page-hr-pay-settlement` | 급여 운영 | 정산 회차 개설과 계산·검증·확정, 급여대장 생성<br>**주요 액션:** 등록, 복제, 대상 선정, 계산, 수정·검증, 확정, 중단, 업로드 | `page-hr-pay-settlement.js`<br>파일 헤더, 상태 5종, `App.HRPaySettlement` | 확정 |
| ├─ HR-PAY-001-D01 | ↳ HR-PAY-001 | 급여 정산 등록 마법사 | Detail | Page 내부 `STATE.view='create'` | 상위 Page 상속 | 기본정보, 대상자, 지급·공제 항목 구성 | `renderWizard()` | 확정 |
| ├─ HR-PAY-001-D02 | ↳ HR-PAY-001 | 급여 정산 상세 | Detail | Page 내부 `STATE.view='detail'` | 상위 Page 상속 | 계산·검증·확정 단계와 급여대장 관리 | `renderDetail()` | 확정 |
| ├─ HR-PAY-001-M01 | ↳ HR-PAY-001 | 정산 설정 | Modal | `modal-prs-config` | 상위 Page 상속 | 기본정보·대상자·지급·공제 항목 수정 | `openConfigModal()` | 확정 |
| ├─ HR-PAY-001-M02 | ↳ HR-PAY-001 | 수기 지급항목 일괄 입력 | Modal | `modal-prs-bulk` | 상위 Page 상속 | 상여·기타수당 등의 대상자 일괄 입력 | `openBulkModal()` | 확정 |
| ├─ HR-PAY-001-M03 | ↳ HR-PAY-001 | 4대보험 고지액 업로드 | Modal | `modal-prs-ded-insurance` | 상위 Page 상속 | 파일 업로드·검증·적용 | `openDeductUploadModal()` 계열 | 확정 |
| ├─ HR-PAY-001-M04 | ↳ HR-PAY-001 | 간이세액표 업로드 | Modal | `modal-prs-ded-tax` | 상위 Page 상속 | 세액표 업로드·검증·적용 | `openDeductUploadModal()` | 확정 |
| └─ HR-PAY-001-M05 | ↳ HR-PAY-001 | 보험 적용기간 관리 | Modal | `modal-prs-ins-period` | 상위 Page 상속 | 보험료 자료의 적용 시작·종료기간 관리 | `openInsPeriodModal()` 계열 | 확정 |
| **HR-PSL-001**<br>하위 UI 1건 | 인사 > 급여 관리 | **급여 명세서 조회** | Page | `hr-payslip → #page-hr-payslip` | 급여 셀프서비스 | 로그인 사용자의 정산 원장 기반 급여 명세서 조회<br>**주요 액션:** 기간 조회, 상세, 엑셀, 인쇄 | `page-hr-payslip.js`<br>파일 헤더, `App.HRPaySettlement.list()` | 확정 |
| └─ HR-PSL-001-D01 | ↳ HR-PSL-001 | 급여 명세서 상세 | Detail | Page 내부 `STATE.view='detail'` | 상위 Page 상속 | 지급·공제·실지급액·산정내역 조회, 인쇄 | `renderDetail()` | 확정 |
| **HR-MEAL-001**<br>하위 UI 2건 | 인사 > 복리후생 | **식권 정산** | Page | `hr-meal → #page-hr-meal` | 복리후생 | 근무조·근무일 기준 다음 달 식권 선지급과 전월 차감 정산<br>**주요 액션:** 월별 조회, 정산 생성, 상세, 인원별 지급·차감 확인 | `page-hr-meal.js`<br>파일 헤더, `App.AttShifts`, `App.AttStatus` | 확정 |
| ├─ HR-MEAL-001-D01 | ↳ HR-MEAL-001 | 식권 정산 상세 | Detail | Page 내부 | 상위 Page 상속 | 대상자별 지급량·차감·정산 단계 조회 | `renderDetailView()` | 확정 |
| └─ HR-MEAL-001-M01 | ↳ HR-MEAL-001 | 식권 정산 생성 | Modal | `modal-meal-new` | 상위 Page 상속 | 정산 기준월·대상 범위 입력 후 회차 생성 | `openCreateModal()` | 확정 |
| **HR-RSG-001**<br>하위 UI 1건 | 인사 > 퇴사 관리 | **퇴사 현황** | Page | `hr-leave → #page-hr-leave` | 퇴사 운영 | 퇴사 통계·목록과 퇴사 처리 통합<br>**주요 액션:** 조회, 퇴사 처리, 승인 문서, 인사카드, 보존기간 경과 삭제 | `page-hr-leave.js`, `hr-resign-data.js`<br>`nav-data.js`, `App.HRResign` | 확정 |
| └─ HR-RSG-001-M02 | ↳ HR-RSG-001 | 퇴사 승인문서 상세 | Modal | `lv-appr-backdrop` | 상위 Page 상속 | 승인된 퇴사 문서와 결재선·처리 이력 조회 | `openResignApprovalDetail()` (`page-hr-leave.js:442` 승인번호 링크(`data-lv-appr`) → `:541` 바인딩(위임 `:537`) → `:319` 정의) | 확정 — 퇴사 현황 목록 테이블의 [결재 승인번호] 링크(`resignApprovalNo`) 클릭 시 진입 (2026-07-15 소스 확인). ※ 실제 함수명은 `openResignApprovalDetail()` (showResignApprovalDetail은 구 명칭) |
| **HR-PEN-001**<br>하위 UI 3건 | 인사 > 퇴사 관리 | **퇴직연금 관리** | Page | `hr-pension → #page-hr-pension` | 퇴직연금 | 기업부담금 월별 업로드·적용, 직원별 누계·중도인출 관리<br>**주요 액션:** 업로드, 검증, 적용, 누계 조회, 중도인출 등록·수정·삭제, 다운로드 | `page-hr-pension.js`<br>파일 헤더, `App.HRPension` | 확정 |
| ├─ HR-PEN-001-D01 | ↳ HR-PEN-001 | 직원별 퇴직연금 상세 | Modal | `data-pen-detail-host` | 상위 Page 상속 | 월별 납입·중도인출·누계 조회 | `openDetail()`, `renderDetailBody()` | 확정 |
| ├─ HR-PEN-001-M01 | ↳ HR-PEN-001 | 부담금 파일 업로드 | Modal | 페이지 생성 Modal | 상위 Page 상속 | 기준월 파일 업로드·검증·적용 | `openUploadModal()` | 확정 |
| └─ HR-PEN-001-M02 | ↳ HR-PEN-001 | 중도인출 편집 | Modal | 페이지 생성 Modal | 상위 Page 상속 | 일자·금액·사유·첨부 등록·수정 | `openWdPopup()` | 확정 |
| **ATT-MYW-001**<br>하위 UI 0건 | 근태 > 근태 관리 | **나의 근태현황** | Page | `att-my-work → #page-att-my-work` | 근태 셀프서비스 | 본인의 출퇴근·지각·조퇴·연장·휴가·신청 이력 조회<br>**주요 액션:** 캘린더·대시보드, 신청 이력, 새로고침, 소명 승인 요청 | `page-att-my-work.js`<br>`nav-data.js`, 파일 헤더 | 확정 |
| **ATT-STS-001**<br>하위 UI 5건 | 근태 > 근태 관리 | **부서별 근태현황** | Page | `att-status → #page-att-status` | 근태 운영 | 전체·임직원·부서 근태 조회와 근태·휴가·초과근무 신청<br>**주요 액션:** 조회, 다운로드, 근태·휴가·초과근무·근무조 변경 신청, 신청 현황 | `page-att-status.js`<br>파일 헤더, `App.AttStatus` | 확정 |
| ├─ ATT-STS-001-M01 | ↳ ATT-STS-001 | 근태·휴가 신청 | Modal | `modal-att-apply` | 상위 Page 상속 | 근태·휴가 코드, 기간, 사유, 첨부, 결재선 입력·상신 | `submitApply()` | 확정 |
| ├─ ATT-STS-001-M02 | ↳ ATT-STS-001 | 초과근무 신청 | Modal | `modal-att-ot` | 상위 Page 상속 | 연장·휴일근무 시간·휴게·사유 입력·상신 | `submitOt()` | 확정 |
| ├─ ATT-STS-001-M03 | ↳ ATT-STS-001 | 근무조 변경 신청 | Modal | `modal-att-shiftchg` | 상위 Page 상속 | 변경 근무조·기간·사유 입력·상신 | `submitShiftChange()` | 확정 |
| ├─ ATT-STS-001-M05 | ↳ ATT-STS-001 | 직원별 근태 상세 | Modal | `att-modal` | 상위 Page 상속 | 근태·신청·일별 상세와 다운로드 | `openAttModal()` 계열 | 확정 |
| └─ ATT-STS-001-M06 | ↳ ATT-STS-001 | 근태·휴가 신청문서 상세 | Modal | `modal-att-doc` | 상위 Page 상속 | 근태·휴가 결재문서 조회와 첨부파일 다운로드 | `openDocModal()` (`page-att-status.js:3331` 링크(`data-att-doc-open`) → `:3094` 바인딩(행 클릭 `:3099`) → `:2851` 정의) | 확정 — 부서별 근태현황 > 직원별 모달 「신청 내역」 탭의 결재문서 링크(문서번호, `data-att-doc-open`) 또는 행 클릭 시 진입. 추가 진입: 근태 캘린더 셀 📄 품의서 아이콘(본인 행) (2026-07-15 소스 확인) |
| **ATT-SSV-001**<br>하위 UI 0건 | 근태 > 근무스케줄 관리 | **부서별 근무스케줄 현황** | Page | `att-shift-status → #page-att-shift-status` | 근무스케줄 | 직원·부서의 월별 근무조 배치 조회<br>**주요 액션:** 전체·임직원·부서 조회, 새로고침, 근무스케줄 배치 진입 | `page-att-shift-status.js`<br>`nav-data.js`, 파일 헤더 | 확정 |
| **ATT-SSB-001**<br>하위 UI 7건 | 근태 > 근무스케줄 관리 | **부서별 근무스케줄 편성** | Page | `att-shift-batch → #page-att-shift-batch` | 근무스케줄 | 부서 기본 근무조와 월별 근무스케줄 생성·제출·변경<br>**주요 액션:** 기본 배정, 일괄 변경, 월 편성 생성·복제·삭제, 상세 편집, 이력 | `page-att-shift-batch.js`<br>파일 헤더, `STATE.tab/view` | 확정 |
| ├─ ATT-SSB-001-M01 | ↳ ATT-SSB-001 | 기본 근무스케줄 설정 | Modal | `modal-sb-base` | 상위 Page 상속 | 직원별 기본 근무조 변경 | `openBaseModal()` | 확정 |
| ├─ ATT-SSB-001-M02 | ↳ ATT-SSB-001 | 기본 근무조 일괄 변경 | Modal | `modal-sb-basebulk` | 상위 Page 상속 | 다수 직원의 기본 근무조 일괄 변경 | `openBaseBulkModal()` | 확정 |
| ├─ ATT-SSB-001-D01 | ↳ ATT-SSB-001 | 월별 근무스케줄 상세 | Detail | Page 내부 `STATE.view='detail'` | 상위 Page 상속 | 주차·일자별 근무조 편집과 과거일 잠금 | `renderDetail()` | 확정 |
| ├─ ATT-SSB-001-M03 | ↳ ATT-SSB-001 | 월별 근무스케줄 생성 | Modal | `modal-sb-create` | 상위 Page 상속 | 대상월·제목 지정 후 기본조 기준 편성 생성 | `openCreateModal()` | 확정 |
| ├─ ATT-SSB-001-M04 | ↳ ATT-SSB-001 | 스케줄 변경 내용 저장 | Modal | `modal-sb-apply` | 상위 Page 상속 | 변경 사유 입력 후 저장·이력 생성 | `submitApply()` | 확정 |
| ├─ ATT-SSB-001-M05 | ↳ ATT-SSB-001 | 스케줄 변경 이력 | Modal | `modal-sb-log` | 상위 Page 상속 | 변경일시·적용내용·처리자 조회 | `openLog()` | 확정 |
| └─ ATT-SSB-001-M06 | ↳ ATT-SSB-001 | 월별 근무조 일괄 변경 | Modal | `modal-sb-bulk` | 상위 Page 상속 | 상세 편성의 다수 일자·직원 근무조 변경 | `openBulk()` | 확정 |
| **ATT-WPL-001**<br>하위 UI 5건 | 근태 > 근무스케줄 관리 | **근무정책 설정** | Page | `att-work-policy → #page-att-work-policy` | 기초 설정 | 조직 상속형 근무정책과 근무조 마스터 관리<br>**주요 액션:** 부서 정책 설정, 근무조 등록·수정·중지, 기본 근무조 지정 | `page-att-settings.js`<br>파일 헤더, `App.AttWorkPolicy` | 확정 |
| ├─ ATT-WPL-001-M01 | ↳ ATT-WPL-001 | 부서 근무정책 설정 | Modal | `wp-dept-modal` | 상위 Page 상속 | 상위 조직 상속·별도 정책, 근무조·관리자·기본조 설정 | `renderDeptModal()` | 확정 |
| ├─ ATT-WPL-001-M02 | ↳ ATT-WPL-001 | 근무조 추가 | Modal | `modal-shift-editor` | 상위 Page 상속 | 신규 근무조 시간·휴게·사용부서·색상 등록 | `App.AttShifts.openEditor(null)` → `openAddModal()`, 트리거 `data-shift-act="add"` | 확정 |
| ├─ ATT-WPL-001-D01 | ↳ ATT-WPL-001 | 근무조 수정 | Detail | `page-att-work-policy` 내부 host (인-페이지) | 상위 Page 상속 | 기존 근무조 시간·휴게·사용부서·상태 수정 (적용 시작일·사유 인라인 검증) | `App.AttShifts.editInto(host, code)`, `renderEditInto()` | 확정 |
| ├─ ATT-WPL-001-M03 | ↳ ATT-WPL-001 | 근무조 마스터 변경 이력 | Modal | `shift-log-modal` | 상위 Page 상속 | 전체 근무조 코드의 변경 이력 조회 | `openCodeLogModal()` (`page-att-settings.js:298` 버튼(`data-shift-log`) → `:961` 바인딩 → `:396` 정의) | 확정 — 근무정책 설정 > 근무조 관리 목록 toolbar 우측 [변경 이력] 버튼 클릭 시 진입 (2026-07-15 소스 확인) |
| └─ ATT-WPL-001-M04 | ↳ ATT-WPL-001 | 근무조 사용 이력 | Modal | `shift-history-modal` | 상위 Page 상속 | 특정 근무조의 사용·상태 변경 이력 조회 | `openHistoryModal()` (`att-shift-data.js:558`(잠금)/`:563`(편집) 버튼(`data-shift-history`) → `:587` 바인딩 → `:691` 정의) | 확정 — 근무정책 설정 > 근무조 편집(인-페이지 수정) 화면 footer [사용 이력] 버튼 클릭 시 진입(잠금/편집 레이아웃 모두 노출) (2026-07-15 소스 확인). ※ 함수·버튼은 데이터 모듈 att-shift-data.js에 위치 |
| **ATT-MLV-001**<br>하위 UI 0건 | 근태 > 휴무 관리 | **나의 연차현황** | Page | `att-my-leave → #page-att-my-leave` | 연차 셀프서비스 | 본인의 연차 발생·사용·잔여와 일정 조회<br>**주요 액션:** 대시보드·캘린더, 사용 이력, 새로고침 | `page-att-my-leave.js`<br>`nav-data.js`, 파일 헤더 | 확정 |
| **ATT-LVS-001**<br>하위 UI 3건 | 근태 > 휴무 관리 | **부서별 연차현황** | Page | `att-leave → #page-att-leave` | 연차 운영 | 전체·직원·부서 연차 발생·사용·잔여 관리<br>**주요 액션:** 조회, 직원 상세, 신청 상태 수정, 처리 이력, 다운로드 | `page-att-leave.js`<br>파일 헤더, `buildLeave()` | 확정 |
| ├─ ATT-LVS-001-M01 | ↳ ATT-LVS-001 | 직원별 연차 상세 | Modal | `lv-modal` | 상위 Page 상속 | 발생·사용·잔여와 신청 내역 조회 | `openEmpDetailModal()` | 확정 |
| ├─ ATT-LVS-001-M02 | ↳ ATT-LVS-001 | 연차 신청 상태 수정 | Modal | `lv-reason-modal` | 상위 Page 상속 | 승인·반려·취소 상태와 사유 입력 | `openReasonModal()` | 확정 |
| └─ ATT-LVS-001-M03 | ↳ ATT-LVS-001 | 연차 신청 처리 이력 | Modal | `lv-hist-modal` | 상위 Page 상속 | 연차 신청의 승인·반려·취소 이력 조회 | `openHistModal()` (`page-att-leave.js:570` 버튼(`hasHist`일 때만 노출) → `:661` 바인딩 → `:825`) | 확정 — 직원별 연차 상세 모달(`lv-modal`) > 신청 내역 탭 > 처리 이력이 있는 건의 [이력] 버튼에서 진입 (2026-07-15 소스 확인) |
| **ATT-LVP-001**<br>하위 UI 1건 | 근태 > 휴무 관리 | **연차 계획서** | Page | `att-leave-plan → #page-att-leave-plan` | 연차 계획 | 본인 연차 사용계획 작성과 팀 단위 계획 조회<br>**주요 액션:** 계획 등록·수정·삭제, 캘린더·대시보드, 팀 조회 | `page-att-leave-plan.js`<br>파일 헤더, `STATE.plans` | 확정 |
| └─ ATT-LVP-001-M01 | ↳ ATT-LVP-001 | 내 연차 계획 | Modal | `lp-modal` | 상위 Page 상속 | 계획 일자·일수 등록·수정·삭제 | `openModal()` | 확정 |

## 4. 문서 해석

- `확정`은 화면 존재와 프론트엔드 동작이 소스에서 확인됐다는 뜻이며, 실제 백엔드 저장·권한 검증까지 확정한다는 뜻이 아니다.
- 업무성 하위 UI 83건은 전부 상위 Page ID가 확인됐으며, 25개 Page 중 22개에 연결된다.
- `ATT-MYW-001`(나의 근태현황), `ATT-SSV-001`(부서별 근무스케줄 현황), `ATT-MLV-001`(나의 연차현황)은 별도 Detail·Modal·OffCanvas 없이 Page 자체에서 업무가 완료된다.
- `page-hr-eval-history.js`는 독립 Page가 아니라 `HR-EVR-001`의 평가 결과 Modal 공급자다.
- 삭제된 화면과 코드 정리 근거는 [SCREEN_CATALOG_DELETE_HISTORY.md](SCREEN_CATALOG_DELETE_HISTORY.md)에서 관리한다.
