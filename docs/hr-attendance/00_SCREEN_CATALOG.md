# 인사·근태 전체 화면 목록

## 1. 문서 기준

- 분석 기준일: 2026-07-14
- 분석 범위: `index.html`, `assets/js/page-hr-*.js`, `assets/js/page-att-*.js`, `assets/js/nav-data.js`와 각 화면이 직접 참조하는 인사·근태 데이터 모듈
- 라우트 표기: 이 프로젝트는 URL 라우터가 아니라 `NAV_DATA`의 item ID와 `#page-*` DOM을 연결하므로 `메뉴 item ID → DOM ID` 형식으로 기록한다.
- 분석 상태: 화면·탭·버튼·프론트엔드 동작이 소스에 있으면 `확정`, 업무상 필요하지만 연결 구현이 없으면 프로세스 문서에서 `구현 갭`으로 구분한다.
- 제외: 단순 Confirm, Toast, 인라인 오류, 도움말은 독립 화면으로 세지 않는다.

## 2. 집계 요약

| 구분 | 수 | 비고 |
|---|---:|---|
| 전체 식별 UI (활성) | 84 | Page 25 + 업무성 하위 UI 59 |
| Page 수준 화면 (활성) | 25 | 인사 17, 근태 8 |
| 현재 메뉴 노출 Page | 24 | 인사 16, 근태 8 |
| 프로필 진입 Page | 1 | 내 정보 |
| 별도 업무성 Detail·Modal·OffCanvas (활성) | 59 | Detail 19, Modal 37, OffCanvas 3 |
| └ 삭제 (§3·§4 취소선, 이력 보존) | 26 | Page 8, Modal 15, OffCanvas 3 |

> `page-hr-eval-history.js`는 독립 Page가 아니라 평가 회차 결과 Modal 공급자이므로 4절에 포함했다.

## 3. Page 수준 전체 목록

> **취소선(~~텍스트~~)** 은 삭제된 화면을 뜻한다. 이력 추적을 위해 행을 지우지 않고 분석 상태 열에 사유를 남긴다.

| 화면 ID | 메뉴 경로 | 화면명 | 유형 | 상위 화면 | 라우트 | 소스 파일 | 주요 목적 | 프로세스 그룹 | 주요 액션 | 분석 상태 | 근거 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SELF-HR-001 | GNB 프로필 | 내 정보 | Page | 없음 | `my-info → #page-my-info` | `page-hr-info-mgmt.js` | 로그인 사용자의 인사정보·계약·입사서류 셀프서비스 | 개인 인사정보 | 조회, 정보 변경 요청, 계약 확인, 서류 다운로드·업로드·서명 | 확정 | `app.js`의 `data-open-myinfo`, `initMyInfoPage()` |
| HR-EMP-001 | 인사 > 인사 관리 | 임직원 현황 | Page | 없음 | `hr-employee → #page-hr-employee` | `page-hr-employee.js` | 조직 트리와 카드 기반 재직자 현황 및 인사카드 조회 | 조직·인사 운영 | 조직별 조회, 인사카드, 수정 요청, PDF | 확정 | `nav-data.js`, 파일 헤더 `SCR-EMP-01~05` |
| HR-EMP-002 | 인사 > 인사 관리 | 임직원 관리 | Page | 없음 | `hr-info-mgmt → #page-hr-info-mgmt` | `page-hr-info-mgmt.js` | 입사자 등록부터 계정·정보·계약·서류 완료까지 관리 | 입사·인사 운영 | 개별·일괄 등록, 상세, 계약 작성, 카드 편집, 부서 관리 | 확정 | 파일 헤더 `SCR-EMP-01~04`, `buildPage()` |
| ~~HR-COD-001~~ | 공통 코드로 이관 | ~~직위·직책 설정~~ | ~~Page~~ | 없음 | ~~`#page-hr-position`~~ | ~~`page-hr-position.js`~~ | ~~직위·직책 코드와 사용 여부·순서 관리~~ | 기초 설정 | ~~조회, 등록, 수정, 순서 변경, 사용 중지~~ | ❌ 삭제됨 — 파일·DOM·script 제거, `App.HRPositions` 소비처 0 (2026-07-14) | ~~`page-hr-position.js`~~ |
| HR-PRZ-001 | 인사 > 인사 관리 | 포상·징계 | Page | 없음 | `hr-prize-discipline → #page-hr-prize-discipline` | `page-hr-prize-discipline.js` | 활성 직원의 포상·징계 이력 관리 | 인사 운영 | 조회, 포상·징계 등록·수정, 대상자 선택, 인사카드 | 확정 | `nav-data.js`, 파일 헤더 |
| HR-CTR-001 | 인사 > 계약·발령·휴직 | 계약 관리 | Page | 없음 | `hr-contract → #page-hr-contract` | `page-hr-contract.js` | 근로·임금계약 작성, 발송, 서명, 이력, 무효화 | 계약 운영 | 조회, 개별·일괄 작성, 서명 요청, 상세, 무효화 | 확정 | 파일 헤더 `SCR-CTR-01/02/05`, `STATE.view` |
| HR-APT-001 | 인사 > 계약·발령·휴직 | 발령 관리 | Page | 없음 | `hr-appoint → #page-hr-appoint` | `page-hr-appoint.js` | 전보·승진·수습해제 등 발령 등록과 예정 건 취소 | 발령 운영 | 조회, 발령 작성, 대상자 선택, 예정 발령 취소, 문서 미리보기 | 확정 | 파일 헤더, `loadEmployees()` |
| HR-LOA-001 | 인사 > 계약·발령·휴직 | 휴직 관리 | Page | 없음 | `hr-loa → #page-hr-loa` | `page-hr-loa.js` | 승인된 휴직·출산휴가 이력과 기간 기준 상태 관리 | 휴직·복직 | 조회, 상세, 승인 문서 확인, 인사카드 | 확정 | 파일 헤더, `computeStatus()` |
| HR-EVT-001 | 인사 > 평가 관리 | 역량평가 설정 | Page | 없음 | `hr-eval-set-type → #page-hr-eval-type` | `page-hr-eval-type.js` | 평가 양식과 전역 평가 단계·등급 설정 | 평가 기초 설정 | 양식 등록·수정·복제·삭제, 단계·등급 설정, PDF | 확정 | `nav-data.js`, 파일 헤더 |
| HR-EVR-001 | 인사 > 평가 관리 | 역량평가 회차 | Page | 없음 | `hr-eval-round → #page-hr-eval-round` | `page-hr-eval-round.js` | 평가 회차 개설, 대상·평가자 확정, 시작·종료·확정 | 평가 운영 | 등록, 수정, 복제, 시작, 중단, 진행 현황, 확정, 결과 | 확정 | 파일 헤더, `App.HREvalRounds` |
| HR-EVI-001 | 인사 > 평가 관리 | 역량평가 진행 | Page | 없음 | `hr-eval-input → #page-hr-eval-input` | `page-hr-eval-input.js` | 구성원이 자신에게 배정된 평가를 입력·제출 | 평가 실행 | 참여 회차 조회, 평가 입력, 임시저장, 제출, 이전 단계 확인 | 확정 | 파일 헤더, `STATE.view` |
| HR-PEV-001 | 인사 > 평가 관리 | 수습평가 진행 | Page | 없음 | `hr-eval-prob → #page-hr-eval-prob` | `page-hr-eval-prob.js` | 수습 종료 임박 직원 평가와 전환·연장·종료 후속 요청 | 수습 운영 | 평가, 임시저장, 제출, 후속 처리 승인 요청, 결과 조회 | 확정 | 파일 헤더, `POSTACTION` |
| HR-PES-001 | 인사 > 평가 관리 | 수습평가 설정 | Page | 없음 | `hr-eval-set-prob → #page-hr-eval-prob-set` | `page-hr-eval-prob-set.js` | 직책자·비직책자 수습평가 양식과 버전 관리 | 평가 기초 설정 | 양식 전환, 문항 편집, 변경 사유 입력, 저장, 버전 조회 | 확정 | 파일 헤더, `App.HRProbEval.saveTemplate()` |
| HR-PAY-001 | 인사 > 급여 관리 | 급여 정산 | Page | 없음 | `hr-pay-settlement → #page-hr-pay-settlement` | `page-hr-pay-settlement.js` | 정산 회차 개설과 계산·검증·확정, 급여대장 생성 | 급여 운영 | 등록, 복제, 대상 선정, 계산, 수정·검증, 확정, 중단, 업로드 | 확정 | 파일 헤더, 상태 5종, `App.HRPaySettlement` |
| HR-PSL-001 | 인사 > 급여 관리 | 급여 명세서 조회 | Page | 없음 | `hr-payslip → #page-hr-payslip` | `page-hr-payslip.js` | 로그인 사용자의 정산 원장 기반 급여 명세서 조회 | 급여 셀프서비스 | 기간 조회, 상세, 엑셀, 인쇄 | 확정 | 파일 헤더, `App.HRPaySettlement.list()` |
| HR-MEAL-001 | 인사 > 복리후생 | 식권 정산 | Page | 없음 | `hr-meal → #page-hr-meal` | `page-hr-meal.js` | 근무조·근무일 기준 다음 달 식권 선지급과 전월 차감 정산 | 복리후생 | 월별 조회, 정산 생성, 상세, 인원별 지급·차감 확인 | 확정 | 파일 헤더, `App.AttShifts`, `App.AttStatus` |
| HR-RSG-001 | 인사 > 퇴사 관리 | 퇴사 현황 | Page | 없음 | `hr-leave → #page-hr-leave` | `page-hr-leave.js`, `hr-resign-data.js` | 퇴사 통계·목록과 퇴사 처리 통합 | 퇴사 운영 | 조회, 퇴사 처리, 승인 문서, 인사카드, 보존기간 경과 삭제 | 확정 | `nav-data.js`, `App.HRResign` |
| HR-PEN-001 | 인사 > 퇴사 관리 | 퇴직연금 관리 | Page | 없음 | `hr-pension → #page-hr-pension` | `page-hr-pension.js` | 기업부담금 월별 업로드·적용, 직원별 누계·중도인출 관리 | 퇴직연금 | 업로드, 검증, 적용, 누계 조회, 중도인출 등록·수정·삭제, 다운로드 | 확정 | 파일 헤더, `App.HRPension` |
| ATT-MYW-001 | 근태 > 근태 관리 | 나의 근태현황 | Page | 없음 | `att-my-work → #page-att-my-work` | `page-att-my-work.js` | 본인의 출퇴근·지각·조퇴·연장·휴가·신청 이력 조회 | 근태 셀프서비스 | 캘린더·대시보드, 신청 이력, 새로고침, 소명 승인 요청 | 확정 | `nav-data.js`, 파일 헤더 |
| ATT-STS-001 | 근태 > 근태 관리 | 부서별 근태현황 | Page | 없음 | `att-status → #page-att-status` | `page-att-status.js` | 전체·임직원·부서 근태 조회와 근태·휴가·초과근무 신청 | 근태 운영 | 조회, 다운로드, 근태·휴가·초과근무·근무조 변경 신청, 신청 현황 | 확정 | 파일 헤더, `App.AttStatus` |
| ATT-SSV-001 | 근태 > 근무스케줄 관리 | 부서별 근무스케줄 현황 | Page | 없음 | `att-shift-status → #page-att-shift-status` | `page-att-shift-status.js` | 직원·부서의 월별 근무조 배치 조회 | 근무스케줄 | 전체·임직원·부서 조회, 새로고침, 근무스케줄 배치 진입 | 확정 | `nav-data.js`, 파일 헤더 |
| ATT-SSB-001 | 근태 > 근무스케줄 관리 | 부서별 근무스케줄 편성 | Page | 없음 | `att-shift-batch → #page-att-shift-batch` | `page-att-shift-batch.js` | 부서 기본 근무조와 월별 근무스케줄 생성·제출·변경 | 근무스케줄 | 기본 배정, 일괄 변경, 월 편성 생성·복제·삭제, 상세 편집, 이력 | 확정 | 파일 헤더, `STATE.tab/view` |
| ATT-WPL-001 | 근태 > 근무스케줄 관리 | 근무정책 설정 | Page | 없음 | `att-work-policy → #page-att-work-policy` | `page-att-settings.js` | 조직 상속형 근무정책과 근무조 마스터 관리 | 기초 설정 | 부서 정책 설정, 근무조 등록·수정·중지, 기본 근무조 지정 | 확정 | 파일 헤더, `App.AttWorkPolicy` |
| ~~ATT-SSA-001~~ | 다른 화면에서 진입 | ~~근무스케줄 배치~~ | ~~Page~~ | ATT-SSV-001 | ~~`att-shift → #page-att-shift`~~ | ~~`page-att-shift.js`~~ | ~~부서원 일별 근무조 배정표 작성·제출~~ | 근무스케줄 | ~~주·월 조회, 일별 변경, 일괄 변경, 월 복사, 제출, 변경 이력~~ | ❌ 삭제됨 — `page-att-shift.js` 제거, 기능은 ATT-SSB 편성 + `att-shift-data.js` 모듈로 흡수 (2026-07-14) | ~~`nav-data.js` hidden~~ |
| ATT-MLV-001 | 근태 > 휴무 관리 | 나의 연차현황 | Page | 없음 | `att-my-leave → #page-att-my-leave` | `page-att-my-leave.js` | 본인의 연차 발생·사용·잔여와 일정 조회 | 연차 셀프서비스 | 대시보드·캘린더, 사용 이력, 새로고침 | 확정 | `nav-data.js`, 파일 헤더 |
| ATT-LVS-001 | 근태 > 휴무 관리 | 부서별 연차현황 | Page | 없음 | `att-leave → #page-att-leave` | `page-att-leave.js` | 전체·직원·부서 연차 발생·사용·잔여 관리 | 연차 운영 | 조회, 직원 상세, 신청 상태 수정, 처리 이력, 다운로드 | 확정 | 파일 헤더, `buildLeave()` |
| ATT-LVP-001 | 근태 > 휴무 관리 | 연차 계획서 | Page | 없음 | `att-leave-plan → #page-att-leave-plan` | `page-att-leave-plan.js` | 본인 연차 사용계획 작성과 팀 단위 계획 조회 | 연차 계획 | 계획 등록·수정·삭제, 캘린더·대시보드, 팀 조회 | 확정 | 파일 헤더, `STATE.plans` |
| ~~ATT-LPS-001~~ | 삭제됨 | ~~연차 설정~~ | ~~Page~~ | 없음 | ~~`#page-att-leave-set`~~ | ~~`page-att-settings.js`~~ | ~~연차 부여·가산·이월·소멸 정책 설정과 발생 미리보기~~ | 기초 설정 | ~~정책 편집, 미리보기, 적용일 지정, 확정~~ | ❌ 삭제됨 — `page-att-settings.js` 내 leave-set 코드·DOM 제거 (WPL은 유지) (2026-07-14) | ~~`initLeaveSetPage()`~~ |
| ~~ATT-EVT-001~~ | 삭제됨 | ~~경조사 현황~~ | ~~Page~~ | 없음 | ~~`#page-att-event`~~ | ~~`page-att-event.js`~~ | ~~승인 완료 경조사 신청의 인사총무 처리 큐~~ | 경조사 운영 | ~~조회, 결재문서 확인, 경조휴가·경조금·화환 처리·취소~~ | ❌ 삭제됨 — 파일·DOM·script 제거, `App.AttEvent` 소비처 0 (2026-07-14) | ~~파일 헤더~~ |
| ~~ATT-WRM-001~~ | 삭제됨 | ~~주간 업무보고 작성~~ | ~~Page~~ | 없음 | ~~`#page-att-report-my`~~ | ~~`page-att-report-my.js`~~ | ~~부서 업무분류별 주간 업무보고 작성~~ | 업무보고 | ~~주 이동, 입력, 임시저장, 제출~~ | ❌ 삭제됨 — 파일·DOM·script 제거 (업무보고 3종 묶음) (2026-07-14) | ~~파일 헤더~~ |
| ~~ATT-WRS-001~~ | 삭제됨 | ~~주간 업무보고 현황~~ | ~~Page~~ | 없음 | ~~`#page-att-report-status`~~ | ~~`page-att-report-status.js`~~ | ~~부서·구성원별 주간 업무보고와 제출률 조회~~ | 업무보고 | ~~주·부서·구성원 전환, 제출 상태·내용 조회~~ | ❌ 삭제됨 — 파일·DOM·script 제거 (업무보고 3종 묶음) (2026-07-14) | ~~파일 헤더~~ |
| ~~ATT-WRC-001~~ | 삭제됨 | ~~업무보고 설정~~ | ~~Page~~ | 없음 | ~~`#page-att-wr-settings`~~ | ~~`page-att-wr-settings.js`~~ | ~~부서별 업무 분류 양식 관리~~ | 업무보고 기초 설정 | ~~부서 선택, 분류 추가·수정·삭제·저장~~ | ❌ 삭제됨 — 파일·DOM·script 제거. `App.WorkReport` 소비처는 삭제된 report 2종뿐 (2026-07-14) | ~~`App.WorkReport`~~ |
| ~~ATT-COD-001~~ | 시스템 관리로 이관 | ~~근태코드 설정~~ | ~~Page~~ | 없음 | ~~`#page-att-code`~~ | ~~`page-att-code.js`~~ | ~~근태·휴가 3단계 사유 코드와 연차 차감 여부 관리~~ | 기초 설정 | ~~조회, 중·소분류 등록·수정, 순서 변경, 사용 여부 관리~~ | ❌ 삭제됨 — 파일·DOM·script 제거, `App.AttCodes` 소비처 0 (2026-07-14) | ~~파일 헤더~~ |

## 4. 별도 업무성 Detail·Modal·OffCanvas 목록

아래 UI는 자체 입력·저장·검증이 있거나 독립적인 상세 업무를 수행한다. 부모 Page의 메뉴 경로와 라우트를 상속한다.

> **취소선(~~텍스트~~)** 은 삭제되었거나 현재 미사용인 화면을 뜻한다. 이력 추적을 위해 행을 지우지 않고 표시만 남긴다. 마지막 열에 사유를 기록한다.

| 화면 ID | 상위 화면 | 화면명 | 유형 | 화면 위치·라우트 | 주요 목적·액션 | 분석 상태 | 근거 소스 |
|---|---|---|---|---|---|---|---|
| SELF-HR-001-D01 | SELF-HR-001 | 내 인사정보카드 | Detail | `#page-my-info` 내부 | 공개·비공개 정보, 계약, 입사서류 조회·변경 요청 | 확정 | `mountMyInfo()` |
| SELF-HR-001-M01 | SELF-HR-001 | 서류 자료실 | Modal | `modal-myinfo-lib` | 적용 서류 다운로드·보관 | 확정 | `page-hr-info-mgmt.js` |
| SELF-HR-001-M02 | SELF-HR-001 | 서류 업로드 | Modal | `modal-myinfo-upload` | 입사서류 파일 업로드·삭제 | 확정 | `page-hr-info-mgmt.js` |
| SELF-HR-001-M03 | SELF-HR-001 | 서류 서명 | Modal | `modal-myinfo-sign` | 서류 내용 확인·전자서명 | 확정 | `page-hr-info-mgmt.js` |
| ~~HR-EMP-001-D01~~ | HR-EMP-001 | ~~인사카드 상세~~ | ~~OffCanvas~~ | ~~`oc-hr-card`~~ | ~~권한별 인사정보·계약·이력 조회~~ | ❌ 삭제됨 — `modal-empi-card` 로 통합, 미사용 코드 제거 (2026-07-14) | ~~`index.html`, `page-hr-employee.js`~~ |
| ~~HR-EMP-001-M01~~ | HR-EMP-001 | ~~인사정보 수정 요청~~ | ~~Modal~~ | ~~`modal-hr-edit`~~ | ~~수정 항목·변경값·사유·증빙 제출~~ | ❌ 삭제됨 — 미사용 코드 제거 (2026-07-14) | ~~`index.html`~~ |
| ~~HR-EMP-001-M02~~ | HR-EMP-001 | ~~인사카드 PDF 출력~~ | ~~Modal~~ | ~~`modal-hr-pdf`~~ | ~~출력 섹션 선택, 인쇄·PDF~~ | ❌ 삭제됨 — 미사용 코드 제거 (2026-07-14) | ~~`index.html`~~ |
| HR-EMP-001-M03 | HR-EMP-001 | 부서 관리 | Modal | `modal-emp-dept-manage` | 부서 추가·수정·사용 중지·구조 관리 | 확정 | `index.html`, `App.HrDeptManage` |
| ~~HR-EMP-001-M04~~ | HR-EMP-001 | ~~사원 부서 이동~~ | ~~Modal~~ | ~~`modal-org-move`~~ | ~~대상 사원의 소속 이동과 조직 변경 승인 요청~~ | ❌ 삭제됨 — DOM 고아(참조 JS 0), index.html 제거 (2026-07-14) | ~~`index.html`, `page-hr-employee.js`~~ |
| ~~HR-EMP-002-M01~~ HR-EMP-002-D01 | HR-EMP-002 | 임직원 개별 등록 | ~~Modal~~ Detail | ~~페이지 생성 Modal~~ `#modal-empi-create` (풀스크린 상세, page-bar) | 입사 기본정보 등록, 계정·계약 단계 시작 | 확정 (타입 정정 2026-07-14) | `openCreateModal()`, `injectCreateModal()` — id·fn 은 레거시 네이밍(실제 모달 아님) |
| ~~HR-EMP-002-M02~~ | HR-EMP-002 | ~~임직원 일괄 등록~~ | ~~Modal~~ | ~~`modal-empi-bulk`~~ | ~~업로드 파일 검증·대상 일괄 등록~~ | ❌ 삭제됨 — DOM 미생성·opener 미호출, 코드 제거 (2026-07-14) | ~~`bindBulkModal()`, `openBulkModal()`~~ |
| ~~HR-EMP-002-O01~~ | HR-EMP-002 | ~~입사자 상세 패널~~ | ~~OffCanvas~~ | ~~`empi-detail-pane`~~ | ~~입사 마일스톤·계약·서류·계정 상태 관리~~ | ❌ 삭제됨 — 트리거(gotoDetail) 호출 0, 행클릭이 카드모달로 대체, 코드 제거 (2026-07-14) | ~~`renderDetailPane()` 계열~~ |
| ~~HR-EMP-002-O02~~ | HR-EMP-002 | ~~인사정보카드~~ | ~~OffCanvas~~ | ~~`oc-empi-card`~~ | ~~공개·비공개·계약·입사서류 탭 조회·편집~~ | ❌ 삭제됨 — `modal-empi-card` 로 통일, openDrawer/renderDrawer·export 제거 (2026-07-14) | ~~`openDrawer()`, `renderDrawer()`~~ |
| HR-EMP-002-M03 | HR-EMP-002 | 인사카드 정보 편집 | Modal | `modal-empi-card-edit` | 근로·임금·소속·기본·계좌·근무정보 섹션 편집 | 확정 | `openCardSectionEdit()` |
| HR-EMP-002-M04 | HR-EMP-002 | 계약서 미리보기·서명 요청 | Modal | `modal-empi-ctr-preview` | 계약서 확인 후 발송·서명 요청 | 확정 | `openContractPreview()` |
| HR-CTR-001-D01 | HR-CTR-001 | 계약서 작성 | Detail | Page 내부 `STATE.view='editor'` | 근로·임금계약 작성·미리보기·저장·발송 | 확정 | `renderEditorView()` |
| HR-CTR-001-D02 | HR-CTR-001 | 계약서 상세 | Detail | Page 내부 `STATE.view='detail'` | 진행 단계, 계약정보, 본문, 처리 이력 조회 | 확정 | `renderDetailView()` |
| ~~HR-CTR-001-M01~~ | HR-CTR-001 | ~~계약서 일괄 작성~~ | ~~Modal~~ | ~~`modal-ctr-bulk`~~ | ~~조직·직원 선택, 공통·개별 조건 편집, 일괄 생성~~ | ❌ 삭제됨 — 死 `openBulkModal()` 제거 (DOM·bindBulkModal 은 개별계약 대상자 선택에서 재사용 → 유지) (2026-07-14) | ~~`openBulkModal()`~~ |
| HR-CTR-001-M02 | HR-CTR-001 | 계약 대상 직원 선택 | Modal | `modal-ctr-emppick` | 계약 대상 단일 직원 선택 | 확정 | `bindEmpPickerModal()` |
| HR-CTR-001-M03 | HR-CTR-001 | 계약 무효화 | Modal | `modal-ctr-void` | 무효화 사유 입력 후 상태 변경 | 확정 | `index.html`, `bindVoidModal()` |
| HR-APT-001-D01 | HR-APT-001 | 발령 작성 | Detail | Page 내부 `STATE.view='editor'` | 발령 유형·대상·시행일 입력, 문서 미리보기, 등록 | 확정 | `renderEditorView()` |
| HR-APT-001-M01 | HR-APT-001 | 발령 대상 직원 선택 | Modal | `modal-apt-emppick` | 완료 상태 직원 단일·다중 선택 | 확정 | `loadEmployees()`, `index.html` |
| HR-APT-001-O01 | HR-APT-001 | 사령장·임명장 미리보기 | OffCanvas | `oc-appoint-doc` | 발령문 조회·인쇄 | 확정 | `openDrawer()` |
| HR-LOA-001-M01 | HR-LOA-001 | 휴직 상세 | Modal | `modal-loa-detail` | 휴직 기간·현황·복직예정일·자동 전환 안내 | 확정 | `openDetail()` |
| HR-LOA-001-M02 | HR-LOA-001 | 휴직 승인문서 상세 | Modal | `modal-loa-approval` | 전자결재 신청·승인 정보 조회 | 확정 | `openApprovalDetail()` |
| HR-PRZ-001-M01 | HR-PRZ-001 | 포상·징계 편집 | Modal | `modal-pd-editor` | 유형·대상자·통보일·사유·결과 등록·수정 | 확정 | `openEditor()` |
| HR-EVT-001-D01 | HR-EVT-001 | 평가 양식 등록·수정 | Detail | Page 내부 `STATE.view='editor'` | 척도·분야·문항·배점 편집과 저장 | 확정 | `renderEditorView()` |
| HR-EVT-001-D02 | HR-EVT-001 | 평가 양식 상세 | Detail | Page 내부 `STATE.view='detail'` | 양식·적용 회차·수정 이력 조회, 복제·PDF | 확정 | `renderDetailView()` |
| HR-EVT-001-D03 | HR-EVT-001 | 평가 단계·등급 설정 | Detail | Page 내부 `STATE.view='stageGrade'` | 전역 평가자 단계·배분율·직군 등급 설정 | 확정 | `renderStageGradeView()` |
| HR-EVR-001-D01 | HR-EVR-001 | 평가 회차 등록·상세 | Detail | Page 내부 `create/edit/detail` | 회차 기본정보, 대상자, 평가자 배정, 등록·수정 | 확정 | `renderFormView()` |
| HR-EVR-001-D02 | HR-EVR-001 | 평가 진행 현황 | Detail | Page 내부 `STATE.view='progress'` | 대상자별 평가 단계·담당자·완료율 관리 | 확정 | `renderProgressView()` |
| HR-EVR-001-M01 | HR-EVR-001 | 평가 결과 | Modal | `modal-evh-result` | 확정 회차 등급 분포·대상자별 결과와 상세 조회 | 확정 | `page-hr-eval-history.js` |
| HR-EVI-001-D01 | HR-EVI-001 | 회차별 내 평가 할 일 | Detail | Page 내부 `STATE.view='round'` | 자신에게 배정된 대상·단계 목록 조회 | 확정 | `renderRoundView()` |
| HR-EVI-001-O01 | HR-EVI-001 | 역량평가 입력 | OffCanvas | `data-evi-eval-modal` | 문항 점수·의견 입력, 임시저장·제출 | 확정 | `openEvaluate()` 계열 |
| HR-PEV-001-O01 | HR-PEV-001 | 수습평가 입력 | OffCanvas | `data-pep-eval-modal` | 차수별 점수·종합의견·최종 결과 입력 | 확정 | `openEvalModal()` |
| HR-PEV-001-M01 | HR-PEV-001 | 수습평가 후속 처리 | Modal | `data-pep-followup-modal` | 수습 해제·연장·종료 정보 입력과 승인 요청 | 확정 | `POSTACTION`, `submitFollowupApproval()` |
| HR-PES-001-D01 | HR-PES-001 | 수습평가 양식 편집 | Detail | Page 본문 | 직책자·비직책자 문항·버전·변경 사유 관리 | 확정 | `saveTemplate()` |
| HR-PAY-001-D01 | HR-PAY-001 | 급여 정산 등록 마법사 | Detail | Page 내부 `STATE.view='create'` | 기본정보, 대상자, 지급·공제 항목 구성 | 확정 | `renderWizard()` |
| HR-PAY-001-D02 | HR-PAY-001 | 급여 정산 상세 | Detail | Page 내부 `STATE.view='detail'` | 계산·검증·확정 단계와 급여대장 관리 | 확정 | `renderDetail()` |
| HR-PAY-001-M01 | HR-PAY-001 | 정산 설정 | Modal | `modal-prs-config` | 기본정보·대상자·지급·공제 항목 수정 | 확정 | `openConfigModal()` |
| HR-PAY-001-M02 | HR-PAY-001 | 수기 지급항목 일괄 입력 | Modal | `modal-prs-bulk` | 상여·기타수당 등의 대상자 일괄 입력 | 확정 | `openBulkModal()` |
| HR-PAY-001-M03 | HR-PAY-001 | 4대보험 고지액 업로드 | Modal | `modal-prs-ded-insurance` | 파일 업로드·검증·적용 | 확정 | `openDeductUploadModal()` 계열 |
| HR-PAY-001-M04 | HR-PAY-001 | 간이세액표 업로드 | Modal | `modal-prs-ded-tax` | 세액표 업로드·검증·적용 | 확정 | `openDeductUploadModal()` |
| HR-PAY-001-M05 | HR-PAY-001 | 보험 적용기간 관리 | Modal | `modal-prs-ins-period` | 보험료 자료의 적용 시작·종료기간 관리 | 확정 | `openInsPeriodModal()` 계열 |
| ~~HR-PAY-001-M06~~ | HR-PAY-001 | ~~지급항목 편집~~ | ~~Modal~~ | ~~`modal-pi-editor`, `modal-prs-additem`~~ | ~~지급항목 추가·정책 편집·정산 회차 반영~~ | ❌ 삭제됨 — +추가 버튼 렌더 경로 없음(도달 불가), DOM·opener 제거 (2026-07-14) | ~~`hr-payitem-data.js`, `openAddItemModal()`~~ |
| HR-PSL-001-D01 | HR-PSL-001 | 급여 명세서 상세 | Detail | Page 내부 `STATE.view='detail'` | 지급·공제·실지급액·산정내역 조회, 인쇄 | 확정 | `renderDetail()` |
| HR-MEAL-001-D01 | HR-MEAL-001 | 식권 정산 상세 | Detail | Page 내부 | 대상자별 지급량·차감·정산 단계 조회 | 확정 | `renderDetailView()` |
| HR-MEAL-001-M01 | HR-MEAL-001 | 식권 정산 생성 | Modal | 페이지 생성 Modal | 정산 기준월·대상 범위 입력 후 회차 생성 | 확정 | `openCreateModal()` |
| ~~HR-RSG-001-M01~~ | HR-RSG-001 | ~~퇴사 처리~~ | ~~Modal~~ | ~~`modal-lv-resign`~~ | ~~대상자·퇴사일·사유·연차정산·계정회수·자산반납 처리~~ | ❌ 삭제됨 — 여는 버튼 미렌더(도달 불가), 사용자 확인 후 DOM·opener 제거 (2026-07-14) | ~~`commitResign()`~~ |
| HR-PEN-001-D01 | HR-PEN-001 | 직원별 퇴직연금 상세 | Detail | Page 내부 | 월별 납입·중도인출·누계 조회 | 확정 | `renderDetailBody()` |
| HR-PEN-001-M01 | HR-PEN-001 | 부담금 파일 업로드 | Modal | 페이지 생성 Modal | 기준월 파일 업로드·검증·적용 | 확정 | `openUploadModal()` |
| HR-PEN-001-M02 | HR-PEN-001 | 중도인출 편집 | Modal | 페이지 생성 Modal | 일자·금액·사유·첨부 등록·수정 | 확정 | `openWdPopup()` |
| ~~HR-COD-001-M01~~ | HR-COD-001 | ~~직위·직책 코드 편집~~ | ~~Modal~~ | ~~페이지 생성 Modal~~ | ~~코드명·ID·설명·사용 여부 등록·수정~~ | ❌ 삭제됨 — 페이지 메뉴 이관(도달 불가), 편집 모달 클러스터 제거 (2026-07-14) | ~~`openModal(kind, editId)`~~ |
| ATT-STS-001-M01 | ATT-STS-001 | 근태·휴가 신청 | Modal | `modal-att-apply` | 근태·휴가 코드, 기간, 사유, 첨부, 결재선 입력·상신 | 확정 | `submitApply()` |
| ATT-STS-001-M02 | ATT-STS-001 | 초과근무 신청 | Modal | `modal-att-ot` | 연장·휴일근무 시간·휴게·사유 입력·상신 | 확정 | `submitOt()` |
| ATT-STS-001-M03 | ATT-STS-001 | 근무조 변경 신청 | Modal | `modal-att-shiftchg` | 변경 근무조·기간·사유 입력·상신 | 확정 | `submitShiftChange()` |
| ~~ATT-STS-001-M04~~ | ATT-STS-001 | ~~신청 현황~~ | ~~Modal~~ | ~~`modal-att-applist`~~ | ~~연차·초과근무·근태 신청과 승인 상태 조회~~ | ❌ 삭제됨 — 트리거 미렌더, opener·export 항목 제거 (App.AttStatus 유지) (2026-07-14) | ~~`openAppListModal()`~~ |
| ATT-STS-001-M05 | ATT-STS-001 | 직원별 근태 상세 | Modal | `att-modal` | 근태·신청·일별 상세와 다운로드 | 확정 | `openAttModal()` 계열 |
| ATT-WPL-001-M01 | ATT-WPL-001 | 부서 근무정책 설정 | Modal | `wp-dept-modal` | 상위 조직 상속·별도 정책, 근무조·관리자·기본조 설정 | 확정 | `renderDeptModal()` |
| ATT-WPL-001-M02 | ATT-WPL-001 | 근무조 추가 | Modal | `modal-shift-editor` | 신규 근무조 시간·휴게·사용부서·색상 등록 | 확정 | `App.AttShifts.openEditor(null)` → `openAddModal()`, 트리거 `data-shift-act="add"` |
| ATT-WPL-001-D01 | ATT-WPL-001 | 근무조 수정 | Detail | `page-att-work-policy` 내부 host (인-페이지) | 기존 근무조 시간·휴게·사용부서·상태 수정 (적용 시작일·사유 인라인 검증) | 확정 | `App.AttShifts.editInto(host, code)`, `renderEditInto()` |
| ATT-SSB-001-M01 | ATT-SSB-001 | 기본 근무스케줄 설정 | Modal | `modal-sb-base` | 직원별 기본 근무조 변경 | 확정 | `openBaseModal()` |
| ATT-SSB-001-M02 | ATT-SSB-001 | 기본 근무조 일괄 변경 | Modal | `modal-sb-basebulk` | 다수 직원의 기본 근무조 일괄 변경 | 확정 | `openBaseBulkModal()` |
| ATT-SSB-001-D01 | ATT-SSB-001 | 월별 근무스케줄 상세 | Detail | Page 내부 `STATE.view='detail'` | 주차·일자별 근무조 편집과 과거일 잠금 | 확정 | `renderDetail()` |
| ATT-SSB-001-M03 | ATT-SSB-001 | 월별 근무스케줄 생성 | Modal | `modal-sb-create` | 대상월·제목 지정 후 기본조 기준 편성 생성 | 확정 | `openCreateModal()` |
| ATT-SSB-001-M04 | ATT-SSB-001 | 스케줄 변경 내용 저장 | Modal | `modal-sb-apply` | 변경 사유 입력 후 저장·이력 생성 | 확정 | `submitApply()` |
| ATT-SSB-001-M05 | ATT-SSB-001 | 스케줄 변경 이력 | Modal | `modal-sb-log` | 변경일시·적용내용·처리자 조회 | 확정 | `openLog()` |
| ATT-SSB-001-M06 | ATT-SSB-001 | 월별 근무조 일괄 변경 | Modal | `modal-sb-bulk` | 상세 편성의 다수 일자·직원 근무조 변경 | 확정 | `openBulk()` |
| ~~ATT-SSA-001-M01~~ | ATT-SSA-001 | ~~근무조 일괄 변경~~ | ~~Modal~~ | ~~`modal-shift-bulk`~~ | ~~선택 직원·기간의 근무조 일괄 변경~~ | ❌ 삭제됨 — page-att-shift.js 모듈화로 제거 (2026-07-14) | ~~`applyBulk()`~~ |
| ~~ATT-SSA-001-M02~~ | ATT-SSA-001 | ~~근무조 월 복사~~ | ~~Modal~~ | ~~`modal-shift-copy`~~ | ~~원본월을 대상월로 복사~~ | ❌ 삭제됨 — page-att-shift.js 모듈화로 제거 (2026-07-14) | ~~`applyCopyMonth()`~~ |
| ~~ATT-SSA-001-M03~~ | ATT-SSA-001 | ~~근무조 마스터~~ | ~~Modal~~ | ~~`modal-shift-master`~~ | ~~근무조 목록·사용부서 조회와 편집 진입~~ | ❌ 삭제됨 — page-att-shift.js 모듈화로 제거 (2026-07-14) | ~~`openMasterModal()`~~ |
| ATT-LVS-001-M01 | ATT-LVS-001 | 직원별 연차 상세 | Modal | `lv-modal` | 발생·사용·잔여와 신청 내역 조회 | 확정 | `openEmpDetailModal()` |
| ATT-LVS-001-M02 | ATT-LVS-001 | 연차 신청 상태 수정 | Modal | `lv-reason-modal` | 승인·반려·취소 상태와 사유 입력 | 확정 | `openReasonModal()` |
| ATT-LVP-001-M01 | ATT-LVP-001 | 내 연차 계획 | Modal | `lp-modal` | 계획 일자·일수 등록·수정·삭제 | 확정 | `openModal()` |
| ~~ATT-LPS-001-M01~~ | ATT-LPS-001 | ~~연차 발생 미리보기~~ | ~~Modal~~ | ~~`leave-policy-modal`~~ | ~~적용 정책 기준 전 직원 발생량 검증·수동 조정~~ | ❌ 삭제됨 — 숨김 페이지, opener·미리보기 버튼 제거 (2026-07-14) | ~~`openLeaveMode()`~~ |
| ~~ATT-EVT-001-M01~~ | ATT-EVT-001 | ~~경조사 업무 처리~~ | ~~Modal~~ | ~~`modal-evt-proc`~~ | ~~경조휴가·경조금·화환 처리 완료·취소~~ | ❌ 삭제됨 — 숨김 페이지, DOM·opener·트리거 제거 (2026-07-14) | ~~`openProcModal()`~~ |
| ~~ATT-COD-001-M01~~ | ATT-COD-001 | ~~근태코드 편집~~ | ~~Modal~~ | ~~페이지 생성 Modal~~ | ~~중·소분류 코드와 연차 차감 여부 등록·수정~~ | ❌ 삭제됨 — 페이지 메뉴 이관, 편집 모달 클러스터 제거 (2026-07-14) | ~~`openModal(depth, editId)`~~ |

## 5. 메뉴 노출 상태 해석

- `확정`은 화면 존재와 프론트엔드 동작이 소스에서 확인됐다는 뜻이며, 실제 백엔드 저장·권한 검증까지 확정한다는 뜻이 아니다.
- ~~`ATT-SSA-001` 근무스케줄 배치~~ Page 는 `page-att-shift.js` 삭제로 제거됐다. 부서원 근무조 배정 기능은 근무스케줄 편성(`ATT-SSB-001`)·현황(`ATT-SSV-001`)과 `att-shift-data.js` 공용 모듈로 흡수됐다. (2026-07-14)
- 2026-07-14 미사용 정리 — §4 취소선 18건(Modal 15·OffCanvas 3)은 DOM·opener·트리거를 실제 코드에서 제거했다. 유지 판정된 중도인출 편집(`HR-PEN-001-M02`)·계약 무효화(`HR-CTR-001-M03`)·임직원 개별 등록(`HR-EMP-002-D01`, Modal→인-페이지 Detail 정정)은 활성이다. `HR-CTR-001-M01`은 死 `openBulkModal()` 만 제거하고 공유 DOM `modal-ctr-bulk`·`bindBulkModal()`은 개별계약 대상자 선택에서 재사용하므로 유지했다.
- ~~`HR-COD-001`, `ATT-LPS-001`, `ATT-EVT-001`, `ATT-WRM-001`, `ATT-WRS-001`, `ATT-WRC-001`, `ATT-COD-001`~~ 7개 Page 는 2026-07-14 전부 삭제됐다 (JS 파일·DOM section·script 태그·init 제거). 단 `ATT-LPS-001`(연차 설정)은 `page-att-settings.js` 를 `ATT-WPL-001`(근무정책, 활성)과 공유하므로 파일은 유지하고 leave-set 코드(233–591·1482–1512)만 도려냈다. 각 export(`App.HRPositions`·`App.AttEvent`·`App.AttCodes`·`App.WorkReport`)는 살아있는 소비처가 없어(WorkReport는 삭제된 report 2종만 참조) 함께 제거해도 안전했다.
- 제거된 독립 Page인 입사서류 관리, 지급항목 설정, 급여 기준 설정, 퇴사 처리 화면은 데이터 모듈 또는 부모 화면 Modal로 통합되어 Page 수에서 제외했다.
