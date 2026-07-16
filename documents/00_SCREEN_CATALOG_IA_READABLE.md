# 인사·근태 활성 화면 IA — 가독성 사본

> 원본 문서의 25개 Page와 86개 하위 UI를 가독성 중심으로 재배치한 사본입니다.
> 원본: [00_SCREEN_CATALOG_REVIEW.md](00_SCREEN_CATALOG_REVIEW.md) · 삭제 이력: [SCREEN_CATALOG_DELETE_HISTORY.md](SCREEN_CATALOG_DELETE_HISTORY.md)
> 기준일: 2026-07-15

## 1. 한눈에 보기

| 구분 | 수 | 비고 |
|---|---:|---|
| 전체 활성 UI | 114 | Page 25 + 하위 UI 89 |
| Page | 25 | 인사 17, 근태 8 |
| 하위 UI | 89 | Detail 20, Modal 65, OffCanvas 4 |
| 하위 UI 연결 Page | 22 | 25개 Page 중 22개 |
| 하위 UI 없는 Page | 3 | `ATT-MYW-001`, `ATT-SSV-001`, `ATT-MLV-001` |

### 메뉴 그룹별 분포

| 메뉴 그룹 | Page | 하위 UI | 합계 | Page ID |
|---|---:|---:|---:|---|
| GNB 프로필 | 1 | 2 | 3 | `SELF-HR-001` |
| 인사 > 인사 관리 | 3 | 13 | 16 | `HR-EMP-001`, `HR-EMP-002`, `HR-PRZ-001` |
| 인사 > 계약·발령·휴직 | 3 | 9 | 12 | `HR-CTR-001`, `HR-APT-001`, `HR-LOA-001` |
| 인사 > 평가 관리 | 5 | 24 | 29 | `HR-EVT-001`, `HR-EVR-001`, `HR-EVI-001`, `HR-PEV-001`, `HR-PES-001` |
| 인사 > 급여 관리 | 2 | 9 | 11 | `HR-PAY-001`, `HR-PSL-001` |
| 인사 > 복리후생 | 1 | 2 | 3 | `HR-MEAL-001` |
| 인사 > 퇴사 관리 | 2 | 4 | 6 | `HR-RSG-001`, `HR-PEN-001` |
| 근태 > 근태 관리 | 2 | 5 | 7 | `ATT-MYW-001`, `ATT-STS-001` |
| 근태 > 근무스케줄 관리 | 3 | 17 | 20 | `ATT-SSV-001`, `ATT-SSB-001`, `ATT-WPL-001` |
| 근태 > 휴무 관리 | 3 | 4 | 7 | `ATT-MLV-001`, `ATT-LVS-001`, `ATT-LVP-001` |

## 2. 읽는 방법

- 메뉴 그룹 아래에 Page를 먼저 표시하고, 해당 Page에 연결된 Detail·Modal·OffCanvas를 바로 이어서 표시한다.
- 기본 화면에서는 화면명·유형·위치·목적만 보여준다.
- 긴 분석 상태와 코드 근거는 각 Page의 **분석 상태·소스 근거 보기**를 펼쳐 확인한다.

## 3. 활성 화면 IA

### 3.1 GNB 프로필

> Page 1개 · 하위 UI 2개 · 합계 3개

#### SELF-HR-001 · 내 정보

| 항목 | 내용 |
|---|---|
| 메뉴 경로 | GNB 프로필 |
| 라우트 | `my-info → #page-my-info` |
| 프로세스 그룹 | 개인 인사정보 |
| 주요 목적 | 로그인 사용자의 인사정보·계약·입사서류 셀프서비스 |
| 주요 액션 | 조회, 정보 변경 요청, 계약 확인, 서류 다운로드·업로드·서명 |
| 하위 UI | **2건** |

| 하위 화면 ID | 화면명 | 유형 | 위치 | 주요 목적·액션 |
|---|---|---|---|---|
| SELF-HR-001-D01 | 내 인사정보카드 | Detail | `#page-my-info` 내부 | 공개·비공개 정보, 계약, 입사서류 조회·변경 요청 |
| SELF-HR-001-M02 | 서류 업로드 | Modal | `modal-myinfo-upload` | 입사서류 파일 업로드·삭제 |

<details>
<summary>분석 상태·소스 근거 보기</summary>

- **Page 분석 상태:** 확정
- **Page 소스:** `page-hr-info-mgmt.js`
- **Page 근거:** `app.js`의 `data-open-myinfo`, `initMyInfoPage()`
- **SELF-HR-001-D01** — 확정<br>근거: `mountMyInfo()`
- **SELF-HR-001-M02** — 확정<br>근거: `page-hr-info-mgmt.js`

</details>

### 3.2 인사 > 인사 관리

> Page 3개 · 하위 UI 13개 · 합계 16개

#### HR-EMP-001 · 임직원 현황

| 항목 | 내용 |
|---|---|
| 메뉴 경로 | 인사 > 인사 관리 |
| 라우트 | `hr-employee → #page-hr-employee` |
| 프로세스 그룹 | 조직·인사 운영 |
| 주요 목적 | 조직 트리와 카드 기반 재직자 현황 및 인사카드 조회 |
| 주요 액션 | 조직별 조회, 인사카드, 수정 요청, PDF |
| 하위 UI | **2건** |

| 하위 화면 ID | 화면명 | 유형 | 위치 | 주요 목적·액션 |
|---|---|---|---|---|
| HR-EMP-001-M03 | 부서 관리 | Modal | `modal-emp-dept-manage` | 부서 추가·수정·사용 중지·구조 관리 |
| HR-EMP-001-M05 | 조직도 변경 이력 | Modal | `modal-emp-org-history` | 저장된 조직 변경 이력과 처리 시점 조회 |

<details>
<summary>분석 상태·소스 근거 보기</summary>

- **Page 분석 상태:** 확정
- **Page 소스:** `page-hr-employee.js`
- **Page 근거:** `nav-data.js`, 파일 헤더 `SCR-EMP-01~05`
- **HR-EMP-001-M03** — 확정<br>근거: `index.html`, `App.HrDeptManage`
- **HR-EMP-001-M05** — 확정 — 임직원 현황 화면 「조직도 관리」 모달 footer 좌측 [변경 이력] 버튼에서 진입 (2026-07-15 소스 확인)<br>근거: `openOrgHistory()` (`index.html:522` 버튼(`data-emp-org-history`) → `page-hr-employee.js:1510` 바인딩 → `:1045` 정의)

</details>

#### HR-EMP-002 · 임직원 관리

| 항목 | 내용 |
|---|---|
| 메뉴 경로 | 인사 > 인사 관리 |
| 라우트 | `hr-info-mgmt → #page-hr-info-mgmt` |
| 프로세스 그룹 | 입사·인사 운영 |
| 주요 목적 | 입사자 등록부터 계정·정보·계약·서류 완료까지 관리 |
| 주요 액션 | 개별·일괄 등록, 상세, 계약 작성, 카드 편집, 부서 관리 |
| 하위 UI | **10건** |

| 하위 화면 ID | 화면명 | 유형 | 위치 | 주요 목적·액션 |
|---|---|---|---|---|
| HR-EMP-002-D01 | 임직원 개별 등록 | Detail | `#modal-empi-create` (풀스크린 상세, page-bar) | 입사 기본정보 등록, 계정·계약 단계 시작 |
| HR-EMP-002-M05 | 인사정보카드 | Modal | `modal-empi-card` (임직원 현황·계약·발령·포상징계 등 공통 진입) | 기본 정보·인사 정보·급여 정보·이력·현황·서류 보관함 5탭 조회, PDF 출력, 섹션 편집, 계정 승인·반려 |
| HR-EMP-002-M03 | 인사카드 정보 편집 | Modal | `modal-empi-card-edit` | 근로·임금·소속·기본·계좌·근무정보 섹션 편집 |
| HR-EMP-002-M04 | 계약서 미리보기·서명 요청 | Modal | `modal-empi-ctr-preview` | 계약서 확인 후 발송·서명 요청 |
| HR-EMP-002-M06 | 계정 등록 안내 재발송 사유 | Modal | `data-resend-modal-host` | 재발송 사유 입력 후 계정 등록 안내 재발송 |
| HR-EMP-002-M07 | 계정 등록 안내 재발송 이력 | Modal | `data-resend-hist-host` | 재발송 시점·사유·발송자 이력 조회 |
| HR-EMP-002-M08 | SMS 발송 | Modal | `modal-empi-sms` | 문자 템플릿·메시지 편집 후 발송 |
| HR-EMP-002-M09 | 개인 인사표 편집 | Modal | `modal-empi-ptable` | 개인 인사표 행 추가·수정·삭제 |
| HR-EMP-002-M10 | 세액 감면 정보 편집 | Modal | `modal-empi-tax` | 세액 감면 구분·기간·율 등 급여 세무 정보 편집 |
| HR-EMP-002-M12 | 인사 문서 미리보기 | Modal | `modal-empi-doc-preview` | 계약서 등 인사 문서 조회·인쇄·PDF 출력 |

<details>
<summary>분석 상태·소스 근거 보기</summary>

- **Page 분석 상태:** 확정
- **Page 소스:** `page-hr-info-mgmt.js`
- **Page 근거:** 파일 헤더 `SCR-EMP-01~04`, `buildPage()`
- **HR-EMP-002-D01** — 확정 (타입 정정 2026-07-14)<br>근거: `openCreateModal()`, `injectCreateModal()` — id·fn 은 레거시 네이밍(실제 모달 아님)
- **HR-EMP-002-M05** — 확정<br>근거: `injectCardModal()`, `openCardModal()`, `App.HRInfoMgmtCard.open()`
- **HR-EMP-002-M03** — 확정<br>근거: `openCardSectionEdit()`
- **HR-EMP-002-M04** — 확정<br>근거: `openContractPreview()`
- **HR-EMP-002-M06** — 확정 — 임직원 목록 그리드 계정등록 「기능」 컬럼의 [재발송] 버튼(등록대기 행·일 2회 한도 미소진 시 노출)에서 진입 (2026-07-15 소스 확인)<br>근거: `openResendModal()` (`page-hr-info-mgmt.js:949` 버튼(`data-row-act="resend"`) → `:1528` 바인딩(리스트 `:1517` 위임) → `:1752` 정의)
- **HR-EMP-002-M07** — 확정 — 임직원 목록 그리드 계정등록 「기능」 컬럼의 [재발송 이력] 버튼(등록대기 행)에서 진입 (2026-07-15 소스 확인)<br>근거: `openResendHistModal()` (`page-hr-info-mgmt.js:952` 버튼(`data-row-act="resend-hist"`) → `:1530` 바인딩 → `:1812` 정의)
- **HR-EMP-002-M08** — 확정 — 「개별 등록」 모달 [등록] 클릭 시 진입: 도급직은 SMS 발송 모달 즉시 표시, 그 외 고용형은 계약서 미리보기 [서명 요청 발송]을 거쳐 표시 (2026-07-15 소스 확인). ※ 미사용 목록 행 [문자 발송] 버튼(`rowActionsHTML`)·대량발송(`doSmsSend`) 死코드는 제거함 (2026-07-15)<br>근거: `openSmsModal()` (개별등록 [등록] `page-hr-info-mgmt.js:3255` → `:9913` 바인딩 → 도급직 `:10221` 호출 / 계약서미리보기 [서명 요청 발송] `:10290` → `:10303` 바인딩 → `:10309` 호출 → `:2187` 정의)
- **HR-EMP-002-M09** — 확정 — 인사정보카드(modal-empi-card) 「인사 정보」 탭 표 섹션(학력·경력·자격증·어학·가족 등)의 [편집]/[+추가] 버튼에서 진입(인사담당자 권한 시. 본인 접근 시엔 변경요청으로 분기) (2026-07-15 소스 확인)<br>근거: `openPersonalTableEdit()` (`page-hr-info-mgmt.js:3425` 버튼(`data-empi-card-section-act`) → `:6818` 바인딩 → 분기 `:6924` → `:4308` 정의)
- **HR-EMP-002-M10** — 확정 — 인사정보카드 「급여 정보」 탭 > 공제 정보 > "중소기업 소득세 감면 정보"(payroll-tax) 서브블록의 [편집]/[+추가] 버튼에서 진입(인사담당자 권한 시. 본인 접근 시엔 신청으로 분기) (2026-07-15 소스 확인)<br>근거: `openPayrollTaxEdit()` (`page-hr-info-mgmt.js:3425` 버튼(payroll-tax 액션 `:5368`) → `:6818` 바인딩 → 분기 `:6932` → `:5502` 정의)
- **HR-EMP-002-M12** — 확정 — 인사정보카드에서 서명완료 문서 [미리보기] 버튼에서 진입: (a)「근무·계약 정보」탭 근로/임금 계약, (b) 계약 이력 행, (c) 서류보관함 탭 서명완료 서류 (2026-07-15 소스 확인)<br>근거: `openDocPreviewModal()` (계약 미리보기 `page-hr-info-mgmt.js:4857`/`:4967` → `:6750` 바인딩(`data-empi-contract-preview`); 서류 미리보기 `:11334` → `:11540`/`:6803` 바인딩(`data-empi-doc-preview`) → `:10464` 정의)

</details>

#### HR-PRZ-001 · 포상·징계

| 항목 | 내용 |
|---|---|
| 메뉴 경로 | 인사 > 인사 관리 |
| 라우트 | `hr-prize-discipline → #page-hr-prize-discipline` |
| 프로세스 그룹 | 인사 운영 |
| 주요 목적 | 활성 직원의 포상·징계 이력 관리 |
| 주요 액션 | 조회, 포상·징계 등록·수정, 대상자 선택, 인사카드 |
| 하위 UI | **1건** |

| 하위 화면 ID | 화면명 | 유형 | 위치 | 주요 목적·액션 |
|---|---|---|---|---|
| HR-PRZ-001-M01 | 포상·징계 편집 | Modal | `modal-pd-editor` | 유형·대상자·통보일·사유·결과 등록·수정 |

<details>
<summary>분석 상태·소스 근거 보기</summary>

- **Page 분석 상태:** 확정
- **Page 소스:** `page-hr-prize-discipline.js`
- **Page 근거:** `nav-data.js`, 파일 헤더
- **HR-PRZ-001-M01** — 확정<br>근거: `openEditor()`

</details>

### 3.3 인사 > 계약·발령·휴직

> Page 3개 · 하위 UI 9개 · 합계 12개

#### HR-CTR-001 · 계약 관리

| 항목 | 내용 |
|---|---|
| 메뉴 경로 | 인사 > 계약·발령·휴직 |
| 라우트 | `hr-contract → #page-hr-contract` |
| 프로세스 그룹 | 계약 운영 |
| 주요 목적 | 근로·임금계약 작성, 발송, 서명, 이력, 무효화 |
| 주요 액션 | 조회, 개별·일괄 작성, 서명 요청, 상세, 무효화 |
| 하위 UI | **4건** |

| 하위 화면 ID | 화면명 | 유형 | 위치 | 주요 목적·액션 |
|---|---|---|---|---|
| HR-CTR-001-D01 | 계약서 작성 | Detail | Page 내부 `STATE.view='editor'` | 근로·임금계약 작성·미리보기·저장·발송 |
| HR-CTR-001-D02 | 계약서 상세 | Modal | `modal-ctr-view` | 진행 단계, 계약정보, 본문, 처리 이력 조회 |
| HR-CTR-001-M02 | 계약서 작성 대상 직원 선택 | Modal | `modal-ctr-bulk` | 개별 계약서 작성 대상 직원 단일 선택 |
| HR-CTR-001-M03 | 계약 무효화 | Modal | `modal-ctr-void` | 무효화 사유 입력 후 상태 변경 |

<details>
<summary>분석 상태·소스 근거 보기</summary>

- **Page 분석 상태:** 확정
- **Page 소스:** `page-hr-contract.js`
- **Page 근거:** 파일 헤더 `SCR-CTR-01/02/05`, `STATE.view`
- **HR-CTR-001-D01** — 확정<br>근거: `renderEditorView()`
- **HR-CTR-001-D02** — 확정<br>근거: `openViewModal()`, `modal-ctr-view`
- **HR-CTR-001-M02** — 확정<br>근거: `openBulkPickForIndividual()`, `bindBulkModal()`, `confirmBulkSingle()`
- **HR-CTR-001-M03** — 확정<br>근거: `index.html`, `bindVoidModal()`

</details>

#### HR-APT-001 · 발령 관리

| 항목 | 내용 |
|---|---|
| 메뉴 경로 | 인사 > 계약·발령·휴직 |
| 라우트 | `hr-appoint → #page-hr-appoint` |
| 프로세스 그룹 | 발령 운영 |
| 주요 목적 | 전보·승진·수습해제 등 발령 등록과 예정 건 취소 |
| 주요 액션 | 조회, 발령 작성, 대상자 선택, 예정 발령 취소, 문서 미리보기 |
| 하위 UI | **3건** |

| 하위 화면 ID | 화면명 | 유형 | 위치 | 주요 목적·액션 |
|---|---|---|---|---|
| HR-APT-001-D01 | 발령 작성 | Modal | `modal-apt-create` | 발령 유형·대상·시행일 입력, 문서 미리보기, 등록 |
| HR-APT-001-O02 | 발령 대상 직원 선택 | OffCanvas | `emp-picker-oc` | 조직 트리·검색을 이용한 완료 상태 직원 단일·다중 선택 |
| HR-APT-001-O01 | 사령장·임명장 미리보기 | OffCanvas | `oc-appoint-doc` | 발령문 조회·인쇄 |

<details>
<summary>분석 상태·소스 근거 보기</summary>

- **Page 분석 상태:** 확정
- **Page 소스:** `page-hr-appoint.js`
- **Page 근거:** 파일 헤더, `loadEmployees()`
- **HR-APT-001-D01** — 확정<br>근거: `openEditor()`, `openAptModal()`
- **HR-APT-001-O02** — 확정<br>근거: `App.EmployeePicker.open()`, `page-hr-appoint.js`
- **HR-APT-001-O01** — 확정<br>근거: `openDrawer()`

</details>

#### HR-LOA-001 · 휴직 관리

| 항목 | 내용 |
|---|---|
| 메뉴 경로 | 인사 > 계약·발령·휴직 |
| 라우트 | `hr-loa → #page-hr-loa` |
| 프로세스 그룹 | 휴직·복직 |
| 주요 목적 | 승인된 휴직·출산휴가 이력과 기간 기준 상태 관리 |
| 주요 액션 | 조회, 상세, 승인 문서 확인, 인사카드 |
| 하위 UI | **2건** |

| 하위 화면 ID | 화면명 | 유형 | 위치 | 주요 목적·액션 |
|---|---|---|---|---|
| HR-LOA-001-M01 | 휴직 상세 | Modal | `modal-loa-detail` | 휴직 기간·현황·복직예정일·자동 전환 안내 |
| HR-LOA-001-M02 | 휴직 승인문서 상세 | Modal | `modal-loa-approval` | 전자결재 신청·승인 정보 조회 |

<details>
<summary>분석 상태·소스 근거 보기</summary>

- **Page 분석 상태:** 확정
- **Page 소스:** `page-hr-loa.js`
- **Page 근거:** 파일 헤더, `computeStatus()`
- **HR-LOA-001-M01** — 확정<br>근거: `openDetail()`
- **HR-LOA-001-M02** — 확정<br>근거: `openApprovalDetail()`

</details>

### 3.4 인사 > 평가 관리

> Page 5개 · 하위 UI 24개 · 합계 29개

#### HR-EVT-001 · 역량평가 설정

| 항목 | 내용 |
|---|---|
| 메뉴 경로 | 인사 > 평가 관리 |
| 라우트 | `hr-eval-set-type → #page-hr-eval-type` |
| 프로세스 그룹 | 평가 기초 설정 |
| 주요 목적 | 평가 양식과 전역 평가 단계·등급 설정 |
| 주요 액션 | 양식 등록·수정·복제·삭제, 단계·등급 설정, PDF |
| 하위 UI | **5건** |

| 하위 화면 ID | 화면명 | 유형 | 위치 | 주요 목적·액션 |
|---|---|---|---|---|
| HR-EVT-001-D01 | 평가 양식 등록·수정 | Detail | Page 내부 `STATE.view='editor'` | 척도·분야·문항·배점 편집과 저장 |
| HR-EVT-001-D02 | 평가 양식 상세 | Detail | Page 내부 `STATE.view='detail'` | 양식·적용 회차·수정 이력 조회, 복제·PDF |
| HR-EVT-001-D03 | 평가 단계·등급 설정 | Detail | Page 내부 `STATE.view='stageGrade'` | 전역 평가자 단계·배분율·직군 등급 설정 |
| HR-EVT-001-M01 | 평가 양식 수정 사유 | Modal | `et-reason-modal` | 평가 양식 저장 전 변경 사유 입력 |
| HR-EVT-001-M02 | 평가 단계·등급 설정 수정 사유 | Modal | `hret-reason-modal` | 평가 단계·등급 설정 저장 전 변경 사유 입력 |

<details>
<summary>분석 상태·소스 근거 보기</summary>

- **Page 분석 상태:** 확정
- **Page 소스:** `page-hr-eval-type.js`
- **Page 근거:** `nav-data.js`, 파일 헤더
- **HR-EVT-001-D01** — 확정<br>근거: `renderEditorView()`
- **HR-EVT-001-D02** — 확정<br>근거: `renderDetailView()`
- **HR-EVT-001-D03** — 확정<br>근거: `renderStageGradeView()`
- **HR-EVT-001-M01** — 확정 — 역량평가 설정(평가 양식) 화면에서 기존 양식 수정 후 [저장] 클릭 시 진입(신규 등록은 즉시 저장되어 모달 미표시, 기존 수정만 사유 게이트) (2026-07-15 소스 확인)<br>근거: `openReasonModal()` (`page-hr-eval-type.js:1035` 버튼(`data-et-save`) → `:1802` 바인딩(performSave) → 조건부 호출 `:2023` → `:2065` 정의)
- **HR-EVT-001-M02** — 확정 — 역량평가 설정 「단계·등급 설정」 뷰에서 배분율/등급 수정 후 [저장] 클릭 시(합계·명칭 검증 통과 후) 진입 (2026-07-15 소스 확인)<br>근거: `openConfigReasonModal()` (`page-hr-eval-type.js:2777` 버튼(`data-cfg-save`) → `:2832` 바인딩(saveStageGrade) → 호출 `:2859` → `:2615` 정의)

</details>

#### HR-EVR-001 · 역량평가 회차

| 항목 | 내용 |
|---|---|
| 메뉴 경로 | 인사 > 평가 관리 |
| 라우트 | `hr-eval-round → #page-hr-eval-round` |
| 프로세스 그룹 | 평가 운영 |
| 주요 목적 | 평가 회차 개설, 대상·평가자 확정, 시작·종료·확정 |
| 주요 액션 | 등록, 수정, 복제, 시작, 중단, 진행 현황, 확정, 결과 |
| 하위 UI | **11건** |

| 하위 화면 ID | 화면명 | 유형 | 위치 | 주요 목적·액션 |
|---|---|---|---|---|
| HR-EVR-001-D01 | 평가 회차 등록·상세 | Detail | Page 내부 `create/edit/detail` | 회차 기본정보, 대상자, 평가자 배정, 등록·수정 |
| HR-EVR-001-D02 | 평가 진행 현황 | Detail | Page 내부 `STATE.view='progress'` | 대상자별 평가 단계·담당자·완료율 관리 |
| HR-EVR-001-M01 | 평가 결과 | Modal | `modal-evh-result` | 확정 회차 등급 분포·대상자별 결과와 상세 조회 |
| HR-EVR-001-M02 | 평가 회차 복사 | Modal | `modal-evr-copy` | 기존 평가 회차의 조건을 복사해 신규 회차 생성 |
| HR-EVR-001-M04 | 평가 양식 미리보기 | Modal | `evr-form-preview-modal` | 평가 문항·배점·단계 구성을 읽기 전용으로 확인 |
| HR-EVR-001-M05 | 평가 회차 수정 사유 | Modal | `evr-reason-modal` | 평가 회차 저장 전 변경 사유 필수 입력 |
| HR-EVR-001-M06 | 평가 회차 정보 | Modal | `evr-info-modal` | 회차 기본정보·대상자·평가자·변경 이력 조회 |
| HR-EVR-001-M07 | 평가 입력기간 재개 | Modal | `evr-reopen-modal` | 종료된 평가의 신규 입력기간 설정 후 재개 |
| HR-EVR-001-M08 | 대체 평가자 재배정 | Modal | `evr-reassign-modal` | 대상 평가의 대체 평가자 선택·재배정 |
| HR-EVR-001-M09 | 평가 진행 대상자 상세 | Modal | `evr-prog-detail-modal` | 대상자별 평가 단계·평가자·진행 상태 조회 |
| HR-EVR-001-M10 | 평가 결과 대상자 상세 | Modal | `data-evh-detail-modal` | 대상자별 점수·등급·평가 의견 상세 조회 |

<details>
<summary>분석 상태·소스 근거 보기</summary>

- **Page 분석 상태:** 확정
- **Page 소스:** `page-hr-eval-round.js`
- **Page 근거:** 파일 헤더, `App.HREvalRounds`
- **HR-EVR-001-D01** — 확정<br>근거: `renderFormView()`
- **HR-EVR-001-D02** — 확정<br>근거: `renderProgressView()`
- **HR-EVR-001-M01** — 확정<br>근거: `page-hr-eval-history.js`
- **HR-EVR-001-M02** — 확정 — 회차 목록 각 행의 「더보기」 케밥 드롭다운 [복제] 클릭 시 진입 (2026-07-15 소스 확인)<br>근거: `openCopyModal()` (`page-hr-eval-round.js:841` 버튼(복제) → `:772` 바인딩(리스트 클릭 위임) → `:985` 정의; `confirmCopy()` `:996`, 확인버튼 `:2216`)
- **HR-EVR-001-M04** — 확정 — 등록/수정 폼·상세 화면 「평가 정보」 섹션의 양식 select 옆 [미리보기] 버튼(또는 양식 링크) 클릭 시 진입 (2026-07-15 소스 확인)<br>근거: `openFormPreviewModal()` (`page-hr-eval-round.js:1277` 버튼(`data-evr-type-preview`) → `:1770` 바인딩 → `:2240` 정의; 양식 링크 `:1504`)
- **HR-EVR-001-M05** — 확정 — 수정(edit) 위저드 [수정 저장] 클릭 → saveForm() 검증 통과 후(신규 아님) 변경 사유 입력 게이트로 진입 (2026-07-15 소스 확인)<br>근거: `openEditReasonModal()` (`page-hr-eval-round.js:1231` 버튼(`data-evr-form-save`) → `:1707` 바인딩(saveForm `:2091`, 호출 `:2101`) → `:2105` 정의)
- **HR-EVR-001-M06** — 확정 — 진행 현황(progress) 화면 상단 회차 헤더 툴바 [정보] 버튼 클릭 시 진입 (2026-07-15 소스 확인)<br>근거: `openRoundInfoModal()` (`page-hr-eval-round.js:2538` 버튼(`data-evr-prog-info`) → `:2606` 바인딩 → `:2451` 정의)
- **HR-EVR-001-M07** — 확정 — 「평가 종료」 회차 진행 현황 툴바 [입력기간 재오픈]에서 진입 (2026-07-15 실측)<br>근거: `openReopenModal()` (`page-hr-eval-round.js:2525` 버튼 → `:2623` 바인딩 → `:2992`)
- **HR-EVR-001-M08** — 확정 — 진행 현황 화면에서 미제출 대상자 행의 후속조치 케밥 메뉴 [대체 평가자 지정] 클릭 시 진입(인사담당자 canActNow+canReassign 조건) (2026-07-15 소스 확인)<br>근거: `openReassignPicker()` (`page-hr-eval-round.js:2707` 버튼(`data-prog-reassign`) → `:2657` 바인딩(진행표 클릭 위임) → `:2922` 정의)
- **HR-EVR-001-M09** — 확정 — 진행 현황 화면 대상자 행의 [상세] 버튼 클릭(또는 행 클릭) 시 진입 (2026-07-15 소스 확인)<br>근거: `openProgressDetail()` (`page-hr-eval-round.js:2727` 버튼(`data-prog-detail`) → `:2659` 바인딩 → `:3086` 정의; 행 클릭 `:2712`(`data-prog-row`) → `:2664`)
- **HR-EVR-001-M10** — 확정 — [결과 보기]로 평가 결과 모달을 연 뒤 결과표의 대상자 성명 링크 클릭 시 진입(모달 제공자 page-hr-eval-history.js) (2026-07-15 소스 확인)<br>근거: `openDetailModal()` (`page-hr-eval-history.js:553` 성명 링크(`data-evh-open-detail`, 행 `:547`) → `:836` 바인딩(ensureRootDelegation `:833`) → `:317` 정의)

</details>

#### HR-EVI-001 · 역량평가 진행

| 항목 | 내용 |
|---|---|
| 메뉴 경로 | 인사 > 평가 관리 |
| 라우트 | `hr-eval-input → #page-hr-eval-input` |
| 프로세스 그룹 | 평가 실행 |
| 주요 목적 | 구성원이 자신에게 배정된 평가를 입력·제출 |
| 주요 액션 | 참여 회차 조회, 평가 입력, 임시저장, 제출, 이전 단계 확인 |
| 하위 UI | **3건** |

| 하위 화면 ID | 화면명 | 유형 | 위치 | 주요 목적·액션 |
|---|---|---|---|---|
| HR-EVI-001-D01 | 회차별 내 평가 할 일 | Detail | Page 내부 `STATE.view='round'` | 자신에게 배정된 대상·단계 목록 조회 |
| HR-EVI-001-O01 | 역량평가 입력 | OffCanvas | `data-evi-eval-modal` | 문항 점수·의견 입력, 임시저장·제출 |
| HR-EVI-001-M01 | 이전 평가 단계 조회 | Modal | `data-evi-prior-modal` | 이전 평가자의 점수·의견을 읽기 전용으로 조회 |

<details>
<summary>분석 상태·소스 근거 보기</summary>

- **Page 분석 상태:** 확정
- **Page 소스:** `page-hr-eval-input.js`
- **Page 근거:** 파일 헤더, `STATE.view`
- **HR-EVI-001-D01** — 확정<br>근거: `renderRoundView()`
- **HR-EVI-001-O01** — 확정<br>근거: `openEvaluate()` 계열
- **HR-EVI-001-M01** — 확정 — 역량평가 진행 화면 평가 OffCanvas 상단 단계 진행바에서 제출된 이전 단계의 [평가내용 보기] 버튼 클릭 시 진입 (2026-07-15 소스 확인)<br>근거: `openPriorStage()` (`page-hr-eval-input.js:1046` 버튼(`data-evi-prior`) → `:590` 위임 바인딩 → `:1139` 정의)

</details>

#### HR-PEV-001 · 수습평가 진행

| 항목 | 내용 |
|---|---|
| 메뉴 경로 | 인사 > 평가 관리 |
| 라우트 | `hr-eval-prob → #page-hr-eval-prob` |
| 프로세스 그룹 | 수습 운영 |
| 주요 목적 | 수습 종료 임박 직원 평가와 전환·연장·종료 후속 요청 |
| 주요 액션 | 평가, 임시저장, 제출, 후속 처리 승인 요청, 결과 조회 |
| 하위 UI | **3건** |

| 하위 화면 ID | 화면명 | 유형 | 위치 | 주요 목적·액션 |
|---|---|---|---|---|
| HR-PEV-001-O01 | 수습평가 입력 | OffCanvas | `data-pep-eval-modal` | 차수별 점수·종합의견·최종 결과 입력 |
| HR-PEV-001-M01 | 수습평가 후속 처리 | Modal | `data-pep-followup-modal` | 수습 해제·연장·종료 정보 입력과 승인 요청 |
| HR-PEV-001-M02 | 이전 수습평가 조회 | Modal | `data-pep-prior-modal` | 이전 차수 수습평가 결과를 읽기 전용으로 조회 |

<details>
<summary>분석 상태·소스 근거 보기</summary>

- **Page 분석 상태:** 확정
- **Page 소스:** `page-hr-eval-prob.js`
- **Page 근거:** 파일 헤더, `POSTACTION`
- **HR-PEV-001-O01** — 확정<br>근거: `openEvalModal()`
- **HR-PEV-001-M01** — 확정<br>근거: `POSTACTION`, `submitFollowupApproval()`
- **HR-PEV-001-M02** — 확정 — 수습평가 진행 화면 평가 OffCanvas 차수 진행바에서 제출 완료된 이전 차수의 [평가내용 보기] 버튼 클릭 시 진입 (2026-07-15 소스 확인)<br>근거: `openPriorModal()` (`page-hr-eval-prob.js:1426` 버튼(`data-pep-prior`) → `:925` 위임 바인딩 → `:1034` 정의)

</details>

#### HR-PES-001 · 수습평가 설정

| 항목 | 내용 |
|---|---|
| 메뉴 경로 | 인사 > 평가 관리 |
| 라우트 | `hr-eval-set-prob → #page-hr-eval-prob-set` |
| 프로세스 그룹 | 평가 기초 설정 |
| 주요 목적 | 직책자·비직책자 수습평가 양식과 버전 관리 |
| 주요 액션 | 양식 전환, 문항 편집, 변경 사유 입력, 저장, 버전 조회 |
| 하위 UI | **2건** |

| 하위 화면 ID | 화면명 | 유형 | 위치 | 주요 목적·액션 |
|---|---|---|---|---|
| HR-PES-001-D01 | 수습평가 양식 편집 | Detail | Page 본문 | 직책자·비직책자 문항·버전·변경 사유 관리 |
| HR-PES-001-M01 | 수습평가 설정 수정 사유 | Modal | `pset-reason-modal` | 수습평가 양식·단계 설정 저장 전 변경 사유 입력 |

<details>
<summary>분석 상태·소스 근거 보기</summary>

- **Page 분석 상태:** 확정
- **Page 소스:** `page-hr-eval-prob-set.js`
- **Page 근거:** 파일 헤더, `App.HRProbEval.saveTemplate()`
- **HR-PES-001-D01** — 확정<br>근거: `saveTemplate()`
- **HR-PES-001-M01** — 확정 — 수습평가 설정에서 [저장] 클릭 시 진입, 경로 2개: (a) 양식 편집 [저장](`data-pset-save`), (b) 「단계 설정」 뷰 [저장](`data-pset-stage-save`) — 검증 통과 후 동일 모달 재사용 (2026-07-15 소스 확인)<br>근거: `openReasonModal()` (양식 `page-hr-eval-prob-set.js:295`(`data-pset-save`) → `:603` 바인딩 → `:616` 호출 / 단계 `:393`(`data-pset-stage-save`) → `:722` 바인딩 → `:741` 호출 → `:182` 정의)

</details>

### 3.5 인사 > 급여 관리

> Page 2개 · 하위 UI 8개 · 합계 10개

#### HR-PAY-001 · 급여 정산

| 항목 | 내용 |
|---|---|
| 메뉴 경로 | 인사 > 급여 관리 |
| 라우트 | `hr-pay-settlement → #page-hr-pay-settlement` |
| 프로세스 그룹 | 급여 운영 |
| 주요 목적 | 상용직·일용직 정산 회차 개설과 계산·검증·확정, 급여대장 생성 (상용직 5단계 / 일용직 3단계) |
| 주요 액션 | 등록, 복제, 대상 선정(상용직/일용직), 계산, 수정·검증, 확정, 중단, 업로드 |
| 하위 UI | **8건** |

| 하위 화면 ID | 화면명 | 유형 | 위치 | 주요 목적·액션 |
|---|---|---|---|---|
| HR-PAY-001-D01 | 급여 정산 등록 마법사 | Detail | Page 내부 `STATE.view='create'` | 기본정보, 대상자(상용직/일용직 그룹), 지급·공제 항목 구성 |
| HR-PAY-001-D02 | 급여 정산 상세 (상용직) | Detail | Page 내부 `STATE.view='detail'` (`empGroup='standard'`) | 상용직 5단계 계산·검증·확정과 급여대장 관리 |
| HR-PAY-001-D03 | 일용직 급여대장 | Detail | Page 내부 `STATE.view='detail'` (`empGroup='daily'`) | 일용직 3단계(대상자→급여대장→확정). 일자별 근무시간·과세급여·공제·실수령액 단일 급여대장 산출·검토·확정 |
| HR-PAY-001-M01 | 정산 설정 | Modal | `modal-prs-config` | 기본정보·대상자·지급·공제 항목 수정 |
| HR-PAY-001-M02 | 수기 지급항목 일괄 입력 | Modal | `modal-prs-bulk` | 상여·기타수당 등의 대상자 일괄 입력 |
| HR-PAY-001-M03 | 4대보험 고지액 업로드 | Modal | `modal-prs-ded-insurance` | 파일 업로드·검증·적용 |
| HR-PAY-001-M04 | 간이세액표 업로드 | Modal | `modal-prs-ded-tax` | 세액표 업로드·검증·적용 |
| HR-PAY-001-M05 | 보험 적용기간 관리 | Modal | `modal-prs-ins-period` | 보험료 자료의 적용 시작·종료기간 관리 |

<details>
<summary>분석 상태·소스 근거 보기</summary>

- **Page 분석 상태:** 확정
- **Page 소스:** `page-hr-pay-settlement.js`
- **Page 근거:** 파일 헤더, 상태 5종, `App.HRPaySettlement`, `isDailyGroup()`(`:105`)
- **HR-PAY-001-D01** — 확정<br>근거: `renderWizard()`
- **HR-PAY-001-D02** — 확정 (상용직 상세, `empGroup='standard'`)<br>근거: `renderDetail()`, `PHASES_STD`(`:91`)
- **HR-PAY-001-D03** — 확정 — 정산 회차 `targetFilter.empGroup='daily'` 일 때 상세 뷰가 일용직 급여대장으로 분기. 일용직 3단계(대상자→급여대장→확정), 「일당 × 근무일수」 통합 급여대장(엑셀 「일용직 급여대장」 시트 구성) (2026-07-16 소스 확인)<br>근거: `renderDailyLedgerTable()`(`:1916`), `PHASES_DAILY`(`:98`), `STAGE_NEXT_LABEL_DAILY`(`:67`)
- **HR-PAY-001-M01** — 확정<br>근거: `openConfigModal()`
- **HR-PAY-001-M02** — 확정<br>근거: `openBulkModal()`
- **HR-PAY-001-M03** — 확정<br>근거: `openDeductUploadModal()` 계열
- **HR-PAY-001-M04** — 확정<br>근거: `openDeductUploadModal()`
- **HR-PAY-001-M05** — 확정<br>근거: `openInsPeriodModal()` 계열

</details>

#### HR-PSL-001 · 급여 명세서 조회

| 항목 | 내용 |
|---|---|
| 메뉴 경로 | 인사 > 급여 관리 |
| 라우트 | `hr-payslip → #page-hr-payslip` |
| 프로세스 그룹 | 급여 셀프서비스 |
| 주요 목적 | 로그인 사용자의 정산 원장 기반 급여 명세서 조회 |
| 주요 액션 | 기간 조회, 상세, 엑셀, 인쇄 |
| 하위 UI | **1건** |

| 하위 화면 ID | 화면명 | 유형 | 위치 | 주요 목적·액션 |
|---|---|---|---|---|
| HR-PSL-001-D01 | 급여 명세서 상세 | Detail | Page 내부 `STATE.view='detail'` | 지급·공제·실지급액·산정내역 조회, 인쇄 |

<details>
<summary>분석 상태·소스 근거 보기</summary>

- **Page 분석 상태:** 확정
- **Page 소스:** `page-hr-payslip.js`
- **Page 근거:** 파일 헤더, `App.HRPaySettlement.list()`
- **HR-PSL-001-D01** — 확정<br>근거: `renderDetail()`

</details>

### 3.6 인사 > 복리후생

> Page 1개 · 하위 UI 2개 · 합계 3개

#### HR-MEAL-001 · 식권 정산

| 항목 | 내용 |
|---|---|
| 메뉴 경로 | 인사 > 복리후생 |
| 라우트 | `hr-meal → #page-hr-meal` |
| 프로세스 그룹 | 복리후생 |
| 주요 목적 | 근무조·근무일 기준 다음 달 식권 선지급과 전월 차감 정산 |
| 주요 액션 | 월별 조회, 정산 생성, 상세, 인원별 지급·차감 확인 |
| 하위 UI | **2건** |

| 하위 화면 ID | 화면명 | 유형 | 위치 | 주요 목적·액션 |
|---|---|---|---|---|
| HR-MEAL-001-D01 | 식권 정산 상세 | Detail | Page 내부 | 대상자별 지급량·차감·정산 단계 조회 |
| HR-MEAL-001-M01 | 식권 정산 생성 | Modal | `modal-meal-new` | 정산 기준월·대상 범위 입력 후 회차 생성 |

<details>
<summary>분석 상태·소스 근거 보기</summary>

- **Page 분석 상태:** 확정
- **Page 소스:** `page-hr-meal.js`
- **Page 근거:** 파일 헤더, `App.AttShifts`, `App.AttStatus`
- **HR-MEAL-001-D01** — 확정<br>근거: `renderDetailView()`
- **HR-MEAL-001-M01** — 확정<br>근거: `openCreateModal()`

</details>

### 3.7 인사 > 퇴사 관리

> Page 2개 · 하위 UI 4개 · 합계 6개

#### HR-RSG-001 · 퇴사 현황

| 항목 | 내용 |
|---|---|
| 메뉴 경로 | 인사 > 퇴사 관리 |
| 라우트 | `hr-leave → #page-hr-leave` |
| 프로세스 그룹 | 퇴사 운영 |
| 주요 목적 | 퇴사 통계·목록과 퇴사 처리 통합 |
| 주요 액션 | 조회, 퇴사 처리, 승인 문서, 인사카드, 보존기간 경과 삭제 |
| 하위 UI | **1건** |

| 하위 화면 ID | 화면명 | 유형 | 위치 | 주요 목적·액션 |
|---|---|---|---|---|
| HR-RSG-001-M02 | 퇴사 승인문서 상세 | Modal | `lv-appr-backdrop` | 승인된 퇴사 문서와 결재선·처리 이력 조회 |

<details>
<summary>분석 상태·소스 근거 보기</summary>

- **Page 분석 상태:** 확정
- **Page 소스:** `page-hr-leave.js`, `hr-resign-data.js`
- **Page 근거:** `nav-data.js`, `App.HRResign`
- **HR-RSG-001-M02** — 확정 — 퇴사 현황 목록 테이블의 [결재 승인번호] 링크(`resignApprovalNo`) 클릭 시 진입 (2026-07-15 소스 확인). ※ 실제 함수명은 `openResignApprovalDetail()` (showResignApprovalDetail은 구 명칭)<br>근거: `openResignApprovalDetail()` (`page-hr-leave.js:442` 승인번호 링크(`data-lv-appr`) → `:541` 바인딩(위임 `:537`) → `:319` 정의)

</details>

#### HR-PEN-001 · 퇴직연금 관리

| 항목 | 내용 |
|---|---|
| 메뉴 경로 | 인사 > 퇴사 관리 |
| 라우트 | `hr-pension → #page-hr-pension` |
| 프로세스 그룹 | 퇴직연금 |
| 주요 목적 | 기업부담금 월별 업로드·적용, 직원별 누계·중도인출 관리 |
| 주요 액션 | 업로드, 검증, 적용, 누계 조회, 중도인출 등록·수정·삭제, 다운로드 |
| 하위 UI | **3건** |

| 하위 화면 ID | 화면명 | 유형 | 위치 | 주요 목적·액션 |
|---|---|---|---|---|
| HR-PEN-001-D01 | 직원별 퇴직연금 상세 | Modal | `data-pen-detail-host` | 월별 납입·중도인출·누계 조회 |
| HR-PEN-001-M01 | 부담금 파일 업로드 | Modal | 페이지 생성 Modal | 기준월 파일 업로드·검증·적용 |
| HR-PEN-001-M02 | 중도인출 편집 | Modal | 페이지 생성 Modal | 일자·금액·사유·첨부 등록·수정 |

<details>
<summary>분석 상태·소스 근거 보기</summary>

- **Page 분석 상태:** 확정
- **Page 소스:** `page-hr-pension.js`
- **Page 근거:** 파일 헤더, `App.HRPension`
- **HR-PEN-001-D01** — 확정<br>근거: `openDetail()`, `renderDetailBody()`
- **HR-PEN-001-M01** — 확정<br>근거: `openUploadModal()`
- **HR-PEN-001-M02** — 확정<br>근거: `openWdPopup()`

</details>

### 3.8 근태 > 근태 관리

> Page 2개 · 하위 UI 5개 · 합계 7개

#### ATT-MYW-001 · 나의 근태현황

| 항목 | 내용 |
|---|---|
| 메뉴 경로 | 근태 > 근태 관리 |
| 라우트 | `att-my-work → #page-att-my-work` |
| 프로세스 그룹 | 근태 셀프서비스 |
| 주요 목적 | 본인의 출퇴근·지각·조퇴·연장·휴가·신청 이력 조회 |
| 주요 액션 | 캘린더·대시보드, 신청 이력, 새로고침, 소명 승인 요청 |
| 하위 UI | **0건** |

> 별도 하위 UI 없음 — Page 안에서 업무가 완료됩니다.

<details>
<summary>분석 상태·소스 근거 보기</summary>

- **Page 분석 상태:** 확정
- **Page 소스:** `page-att-my-work.js`
- **Page 근거:** `nav-data.js`, 파일 헤더

</details>

#### ATT-STS-001 · 부서별 근태현황

| 항목 | 내용 |
|---|---|
| 메뉴 경로 | 근태 > 근태 관리 |
| 라우트 | `att-status → #page-att-status` |
| 프로세스 그룹 | 근태 운영 |
| 주요 목적 | 전체·임직원·부서 근태 조회와 근태·휴가·초과근무 신청 |
| 주요 액션 | 조회, 다운로드, 근태·휴가·초과근무·근무조 변경 신청, 신청 현황 |
| 하위 UI | **5건** |

| 하위 화면 ID | 화면명 | 유형 | 위치 | 주요 목적·액션 |
|---|---|---|---|---|
| ATT-STS-001-M01 | 근태·휴가 신청 | Modal | `modal-att-apply` | 근태·휴가 코드, 기간, 사유, 첨부, 결재선 입력·상신 |
| ATT-STS-001-M02 | 초과근무 신청 | Modal | `modal-att-ot` | 연장·휴일근무 시간·휴게·사유 입력·상신 |
| ATT-STS-001-M03 | 근무조 변경 신청 | Modal | `modal-att-shiftchg` | 변경 근무조·기간·사유 입력·상신 |
| ATT-STS-001-M05 | 직원별 근태 상세 | Modal | `att-modal` | 근태·신청·일별 상세와 다운로드 |
| ATT-STS-001-M06 | 근태·휴가 신청문서 상세 | Modal | `modal-att-doc` | 근태·휴가 결재문서 조회와 첨부파일 다운로드 |

<details>
<summary>분석 상태·소스 근거 보기</summary>

- **Page 분석 상태:** 확정
- **Page 소스:** `page-att-status.js`
- **Page 근거:** 파일 헤더, `App.AttStatus`
- **ATT-STS-001-M01** — 확정<br>근거: `submitApply()`
- **ATT-STS-001-M02** — 확정<br>근거: `submitOt()`
- **ATT-STS-001-M03** — 확정<br>근거: `submitShiftChange()`
- **ATT-STS-001-M05** — 확정<br>근거: `openAttModal()` 계열
- **ATT-STS-001-M06** — 확정 — 부서별 근태현황 > 직원별 모달 「신청 내역」 탭의 결재문서 링크(문서번호, `data-att-doc-open`) 또는 행 클릭 시 진입. 추가 진입: 근태 캘린더 셀 📄 품의서 아이콘(본인 행) (2026-07-15 소스 확인)<br>근거: `openDocModal()` (`page-att-status.js:3331` 링크(`data-att-doc-open`) → `:3094` 바인딩(행 클릭 `:3099`) → `:2851` 정의)

</details>

### 3.9 근태 > 근무스케줄 관리

> Page 3개 · 하위 UI 15개 · 합계 18개

#### ATT-SSV-001 · 부서별 근무스케줄 현황

| 항목 | 내용 |
|---|---|
| 메뉴 경로 | 근태 > 근무스케줄 관리 |
| 라우트 | `att-shift-status → #page-att-shift-status` |
| 프로세스 그룹 | 근무스케줄 |
| 주요 목적 | 직원·부서의 월별 근무조 배치 조회 |
| 주요 액션 | 전체·임직원·부서 조회, 새로고침, 근무스케줄 배치 진입 |
| 하위 UI | **0건** |

> 별도 하위 UI 없음 — Page 안에서 업무가 완료됩니다.

<details>
<summary>분석 상태·소스 근거 보기</summary>

- **Page 분석 상태:** 확정
- **Page 소스:** `page-att-shift-status.js`
- **Page 근거:** `nav-data.js`, 파일 헤더

</details>

#### ATT-SSB-001 · 부서별 근무스케줄 편성

| 항목 | 내용 |
|---|---|
| 메뉴 경로 | 근태 > 근무스케줄 관리 |
| 라우트 | `att-shift-batch → #page-att-shift-batch` |
| 프로세스 그룹 | 근무스케줄 |
| 주요 목적 | 부서 기본 근무조와 월별 근무스케줄 생성·제출·변경 |
| 주요 액션 | 기본 배정, 일괄 변경, 월 편성 생성·복제·삭제, 상세 편집, 이력 |
| 하위 UI | **7건** |

| 하위 화면 ID | 화면명 | 유형 | 위치 | 주요 목적·액션 |
|---|---|---|---|---|
| ATT-SSB-001-M01 | 기본 근무스케줄 설정 | Modal | `modal-sb-base` | 직원별 기본 근무조 변경 |
| ATT-SSB-001-M02 | 기본 근무조 일괄 변경 | Modal | `modal-sb-basebulk` | 다수 직원의 기본 근무조 일괄 변경 |
| ATT-SSB-001-D01 | 월별 근무스케줄 상세 | Detail | Page 내부 `STATE.view='detail'` | 주차·일자별 근무조 편집과 과거일 잠금 |
| ATT-SSB-001-M03 | 월별 근무스케줄 생성 | Modal | `modal-sb-create` | 대상월·제목 지정 후 기본조 기준 편성 생성 |
| ATT-SSB-001-M04 | 스케줄 변경 내용 저장 | Modal | `modal-sb-apply` | 변경 사유 입력 후 저장·이력 생성 |
| ATT-SSB-001-M05 | 스케줄 변경 이력 | Modal | `modal-sb-log` | 변경일시·적용내용·처리자 조회 |
| ATT-SSB-001-M06 | 월별 근무조 일괄 변경 | Modal | `modal-sb-bulk` | 상세 편성의 다수 일자·직원 근무조 변경 |

<details>
<summary>분석 상태·소스 근거 보기</summary>

- **Page 분석 상태:** 확정
- **Page 소스:** `page-att-shift-batch.js`
- **Page 근거:** 파일 헤더, `STATE.tab/view`
- **ATT-SSB-001-M01** — 확정<br>근거: `openBaseModal()`
- **ATT-SSB-001-M02** — 확정<br>근거: `openBaseBulkModal()`
- **ATT-SSB-001-D01** — 확정<br>근거: `renderDetail()`
- **ATT-SSB-001-M03** — 확정<br>근거: `openCreateModal()`
- **ATT-SSB-001-M04** — 확정<br>근거: `submitApply()`
- **ATT-SSB-001-M05** — 확정<br>근거: `openLog()`
- **ATT-SSB-001-M06** — 확정<br>근거: `openBulk()`

</details>

#### ATT-WPL-001 · 근무정책 설정

| 항목 | 내용 |
|---|---|
| 메뉴 경로 | 근태 > 근무스케줄 관리 |
| 라우트 | `att-work-policy → #page-att-work-policy` |
| 프로세스 그룹 | 기초 설정 |
| 주요 목적 | 조직 상속형 근무정책·근무조 마스터·공휴일 및 회사 지정 휴무일 관리 (탭 3개: 부서별 근무정책 설정 / 근무조 설정 / 휴일 관리) |
| 주요 액션 | 부서 정책 설정, 근무조 등록·수정·중지, 기본 근무조 지정, 휴일 조회·편집·공휴일 불러오기·전자결재 상신 |
| 하위 UI | **10건** |

| 하위 화면 ID | 화면명 | 유형 | 위치 | 주요 목적·액션 |
|---|---|---|---|---|
| ATT-WPL-001-D03 | 부서별 근무정책 설정 (탭) | Detail | `page-att-work-policy` 내부 `STATE.wpTab='dept'` (기본 탭) | 조직 상속형 부서별 근무정책·사용 근무조·기본 근무조를 조직 그리드로 조회·관리 |
| ATT-WPL-001-M01 | 부서 근무정책 설정 | Modal | `wp-dept-modal` | 상위 조직 상속·별도 정책, 근무조·관리자·기본조 설정 |
| ATT-WPL-001-D04 | 근무조 설정 (탭) | Detail | `page-att-work-policy` 내부 `STATE.wpTab='shift'` | 근무조 마스터 목록 조회, 근무조 등록·수정·중지·기본조 지정 (부서 관리 기본 근무조 선택의 선행 마스터) |
| ATT-WPL-001-M02 | 근무조 추가 | Modal | `modal-shift-editor` | 신규 근무조 시간·휴게·사용부서·색상 등록 |
| ATT-WPL-001-D01 | 근무조 수정 | Detail | `page-att-work-policy` 내부 host (인-페이지) | 기존 근무조 시간·휴게·사용부서·상태 수정 (적용 시작일·사유 인라인 검증) |
| ATT-WPL-001-M03 | 근무조 마스터 변경 이력 | Modal | `shift-log-modal` | 전체 근무조 코드의 변경 이력 조회 |
| ATT-WPL-001-M04 | 근무조 사용 이력 | Modal | `shift-history-modal` | 특정 근무조의 사용·상태 변경 이력 조회 |
| ATT-WPL-001-D02 | 휴일 관리 | Detail | `page-att-work-policy` 내부 `STATE.wpTab='holiday'` | 월간·연간 캘린더로 공휴일·회사 지정 휴무일 조회, 편집 모드, 공휴일 일괄 불러오기, 승인대기·기한 경과 반려 상태 확인 |
| ATT-WPL-001-M05 | 휴일 추가·수정 | Modal | `hol-modal` (페이지 생성 Modal) | 휴일명·일자·비고 입력, 신규 등록·수정·삭제, 지난 날짜·동일 날짜 중복 검증 |
| ATT-WPL-001-M06 | 휴일 관리 변경 승인 요청 | Modal | `[data-sysapr-host]` 공통 전자결재 Modal | 휴일 추가·수정·삭제 변경분 확인, 사유·결재선·첨부 입력 후 승인 요청 |

<details>
<summary>분석 상태·소스 근거 보기</summary>

- **Page 분석 상태:** 확정
- **Page 소스:** `page-att-settings.js`
- **Page 근거:** 파일 헤더, `TABS`(`:33` — dept/shift/holiday), `App.AttWorkPolicy`, `App.AttHolidays`
- **ATT-WPL-001-D03** — 확정 — 근무정책 설정 진입 시 기본 탭(`STATE.wpTab='dept'`). 조직 상속형 부서별 근무정책 그리드 (2026-07-16 소스 확인)<br>근거: `renderDept()`(`page-att-settings.js:509`), `renderWpBody()`(`:1386`)
- **ATT-WPL-001-M01** — 확정<br>근거: `renderDeptModal()`
- **ATT-WPL-001-D04** — 확정 — 「근무조 설정」 탭(`STATE.wpTab='shift'`). 근무조 마스터 목록·등록·수정·중지. 부서 관리 기본 근무조 선택의 선행 마스터 (2026-07-16 소스 확인)<br>근거: `renderShift()`(`page-att-settings.js:317`), `renderWpBody()`(`:1387`)
- **ATT-WPL-001-M02** — 확정<br>근거: `App.AttShifts.openEditor(null)` → `openAddModal()`, 트리거 `data-shift-act="add"`
- **ATT-WPL-001-D01** — 확정<br>근거: `App.AttShifts.editInto(host, code)`, `renderEditInto()`
- **ATT-WPL-001-M03** — 확정 — 근무정책 설정 > 근무조 관리 목록 toolbar 우측 [변경 이력] 버튼 클릭 시 진입 (2026-07-15 소스 확인)<br>근거: `openCodeLogModal()` (`page-att-settings.js:298` 버튼(`data-shift-log`) → `:961` 바인딩 → `:396` 정의)
- **ATT-WPL-001-M04** — 확정 — 근무정책 설정 > 근무조 편집(인-페이지 수정) 화면 footer [사용 이력] 버튼 클릭 시 진입(잠금/편집 레이아웃 모두 노출) (2026-07-15 소스 확인). ※ 함수·버튼은 데이터 모듈 att-shift-data.js에 위치<br>근거: `openHistoryModal()` (`att-shift-data.js:558`(잠금)/`:563`(편집) 버튼(`data-shift-history`) → `:587` 바인딩 → `:691` 정의)
- **ATT-WPL-001-D02** — 확정 — 근무정책 설정 「휴일 관리」 탭에서 진입<br>근거: `TABS`, `renderHoliday()`, `renderHolMonth()`, `renderHolYear()`, `App.AttHolidays`
- **ATT-WPL-001-M05** — 확정 — 편집 모드의 [휴일 추가], 날짜 셀, 휴일 칩에서 진입<br>근거: `ensureHolModal()`, `openHolModal()`, `saveHoliday()`, `deleteHoliday()`
- **ATT-WPL-001-M06** — 확정 — [적용]에서 승인 요청 Modal 진입 · 구현 갭 — 최종 승인 후 `pending→approved` 전환과 기한 경과 반려 처리는 본 화면 밖<br>근거: `applyHolEdit()`, `App.openSystemApprovalModal()`, `_buildSysAprModal()`, `commitHolEdit()`

</details>

### 3.10 근태 > 휴무 관리

> Page 3개 · 하위 UI 4개 · 합계 7개

#### ATT-MLV-001 · 나의 연차현황

| 항목 | 내용 |
|---|---|
| 메뉴 경로 | 근태 > 휴무 관리 |
| 라우트 | `att-my-leave → #page-att-my-leave` |
| 프로세스 그룹 | 연차 셀프서비스 |
| 주요 목적 | 본인의 연차 발생·사용·잔여와 일정 조회 |
| 주요 액션 | 대시보드·캘린더, 사용 이력, 새로고침 |
| 하위 UI | **0건** |

> 별도 하위 UI 없음 — Page 안에서 업무가 완료됩니다.

<details>
<summary>분석 상태·소스 근거 보기</summary>

- **Page 분석 상태:** 확정
- **Page 소스:** `page-att-my-leave.js`
- **Page 근거:** `nav-data.js`, 파일 헤더

</details>

#### ATT-LVS-001 · 부서별 연차현황

| 항목 | 내용 |
|---|---|
| 메뉴 경로 | 근태 > 휴무 관리 |
| 라우트 | `att-leave → #page-att-leave` |
| 프로세스 그룹 | 연차 운영 |
| 주요 목적 | 전체·직원·부서 연차 발생·사용·잔여 관리 |
| 주요 액션 | 조회, 직원 상세, 신청 상태 수정, 처리 이력, 다운로드 |
| 하위 UI | **3건** |

| 하위 화면 ID | 화면명 | 유형 | 위치 | 주요 목적·액션 |
|---|---|---|---|---|
| ATT-LVS-001-M01 | 직원별 연차 상세 | Modal | `lv-modal` | 발생·사용·잔여와 신청 내역 조회 |
| ATT-LVS-001-M02 | 연차 신청 상태 수정 | Modal | `lv-reason-modal` | 승인·반려·취소 상태와 사유 입력 |
| ATT-LVS-001-M03 | 연차 신청 처리 이력 | Modal | `lv-hist-modal` | 연차 신청의 승인·반려·취소 이력 조회 |

<details>
<summary>분석 상태·소스 근거 보기</summary>

- **Page 분석 상태:** 확정
- **Page 소스:** `page-att-leave.js`
- **Page 근거:** 파일 헤더, `buildLeave()`
- **ATT-LVS-001-M01** — 확정<br>근거: `openEmpDetailModal()`
- **ATT-LVS-001-M02** — 확정<br>근거: `openReasonModal()`
- **ATT-LVS-001-M03** — 확정 — 직원별 연차 상세 모달(`lv-modal`) > 신청 내역 탭 > 처리 이력이 있는 건의 [이력] 버튼에서 진입 (2026-07-15 소스 확인)<br>근거: `openHistModal()` (`page-att-leave.js:570` 버튼(`hasHist`일 때만 노출) → `:661` 바인딩 → `:825`)

</details>

#### ATT-LVP-001 · 연차 계획서

| 항목 | 내용 |
|---|---|
| 메뉴 경로 | 근태 > 휴무 관리 |
| 라우트 | `att-leave-plan → #page-att-leave-plan` |
| 프로세스 그룹 | 연차 계획 |
| 주요 목적 | 본인 연차 사용계획 작성과 팀 단위 계획 조회 |
| 주요 액션 | 계획 등록·수정·삭제, 캘린더·대시보드, 팀 조회 |
| 하위 UI | **1건** |

| 하위 화면 ID | 화면명 | 유형 | 위치 | 주요 목적·액션 |
|---|---|---|---|---|
| ATT-LVP-001-M01 | 내 연차 계획 | Modal | `lp-modal` | 계획 일자·일수 등록·수정·삭제 |

<details>
<summary>분석 상태·소스 근거 보기</summary>

- **Page 분석 상태:** 확정
- **Page 소스:** `page-att-leave-plan.js`
- **Page 근거:** 파일 헤더, `STATE.plans`
- **ATT-LVP-001-M01** — 확정<br>근거: `openModal()`

</details>

## 4. 참고

- `확정`은 화면 존재와 프론트엔드 동작이 소스에서 확인됐다는 뜻이며, 백엔드 저장·권한 검증까지 확정한다는 뜻은 아니다.
- 삭제되거나 현행 화면에서 제외된 항목은 [SCREEN_CATALOG_DELETE_HISTORY.md](SCREEN_CATALOG_DELETE_HISTORY.md)에서 확인한다.
