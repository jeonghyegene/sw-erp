# 인사·근태 화면 삭제 이력

> 활성 화면 IA에서 분리한 삭제·제외 화면의 보존 문서다.
> 활성 화면 목록: [00_SCREEN_CATALOG_REVIEW.md](00_SCREEN_CATALOG_REVIEW.md)
> 기준일: 2026-07-15

## 1. 집계 요약

| 구분 | 수 | 비고 |
|---|---:|---|
| 전체 삭제·제외 이력 | 31 | Page 8 + 업무성 하위 UI 23 |
| 삭제된 Page | 8 | 인사 1, 근태 7 |
| 삭제된 Detail·Modal·OffCanvas | 23 | Modal 20, OffCanvas 3 |

현재 활성 화면 수에는 포함하지 않는다. 최신 코드에서 제거됐거나 도달할 수 없게 된 UI, 또는 업무 검토에서 현행 화면이 아닌 것으로 확인된 UI를 기록한다.

## 2. 삭제된 Page 목록

| 화면 ID | 메뉴 경로 | 화면명 | 유형 | 상위 화면 | 라우트 | 소스 파일 | 주요 목적 | 프로세스 그룹 | 주요 액션 | 분석 상태 | 근거 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ~~HR-COD-001~~ | 공통 코드로 이관 | ~~직위·직책 설정~~ | ~~Page~~ | 없음 | ~~`#page-hr-position`~~ | ~~`page-hr-position.js`~~ | ~~직위·직책 코드와 사용 여부·순서 관리~~ | 기초 설정 | ~~조회, 등록, 수정, 순서 변경, 사용 중지~~ | ❌ 삭제됨 — 파일·DOM·script 제거, `App.HRPositions` 소비처 0 (2026-07-14) | ~~`page-hr-position.js`~~ |
| ~~ATT-SSA-001~~ | 다른 화면에서 진입 | ~~근무스케줄 배치~~ | ~~Page~~ | ATT-SSV-001 | ~~`att-shift → #page-att-shift`~~ | ~~`page-att-shift.js`~~ | ~~부서원 일별 근무조 배정표 작성·제출~~ | 근무스케줄 | ~~주·월 조회, 일별 변경, 일괄 변경, 월 복사, 제출, 변경 이력~~ | ❌ 삭제됨 — `page-att-shift.js` 제거, 기능은 ATT-SSB 편성 + `att-shift-data.js` 모듈로 흡수 (2026-07-14) | ~~`nav-data.js` hidden~~ |
| ~~ATT-LPS-001~~ | 삭제됨 | ~~연차 설정~~ | ~~Page~~ | 없음 | ~~`#page-att-leave-set`~~ | ~~`page-att-settings.js`~~ | ~~연차 부여·가산·이월·소멸 정책 설정과 발생 미리보기~~ | 기초 설정 | ~~정책 편집, 미리보기, 적용일 지정, 확정~~ | ❌ 삭제됨 — `page-att-settings.js` 내 leave-set 코드·DOM 제거 (WPL은 유지) (2026-07-14) | ~~`initLeaveSetPage()`~~ |
| ~~ATT-EVT-001~~ | 삭제됨 | ~~경조사 현황~~ | ~~Page~~ | 없음 | ~~`#page-att-event`~~ | ~~`page-att-event.js`~~ | ~~승인 완료 경조사 신청의 인사총무 처리 큐~~ | 경조사 운영 | ~~조회, 결재문서 확인, 경조휴가·경조금·화환 처리·취소~~ | ❌ 삭제됨 — 파일·DOM·script 제거, `App.AttEvent` 소비처 0 (2026-07-14) | ~~파일 헤더~~ |
| ~~ATT-WRM-001~~ | 삭제됨 | ~~주간 업무보고 작성~~ | ~~Page~~ | 없음 | ~~`#page-att-report-my`~~ | ~~`page-att-report-my.js`~~ | ~~부서 업무분류별 주간 업무보고 작성~~ | 업무보고 | ~~주 이동, 입력, 임시저장, 제출~~ | ❌ 삭제됨 — 파일·DOM·script 제거 (업무보고 3종 묶음) (2026-07-14) | ~~파일 헤더~~ |
| ~~ATT-WRS-001~~ | 삭제됨 | ~~주간 업무보고 현황~~ | ~~Page~~ | 없음 | ~~`#page-att-report-status`~~ | ~~`page-att-report-status.js`~~ | ~~부서·구성원별 주간 업무보고와 제출률 조회~~ | 업무보고 | ~~주·부서·구성원 전환, 제출 상태·내용 조회~~ | ❌ 삭제됨 — 파일·DOM·script 제거 (업무보고 3종 묶음) (2026-07-14) | ~~파일 헤더~~ |
| ~~ATT-WRC-001~~ | 삭제됨 | ~~업무보고 설정~~ | ~~Page~~ | 없음 | ~~`#page-att-wr-settings`~~ | ~~`page-att-wr-settings.js`~~ | ~~부서별 업무 분류 양식 관리~~ | 업무보고 기초 설정 | ~~부서 선택, 분류 추가·수정·삭제·저장~~ | ❌ 삭제됨 — 파일·DOM·script 제거. `App.WorkReport` 소비처는 삭제된 report 2종뿐 (2026-07-14) | ~~`App.WorkReport`~~ |
| ~~ATT-COD-001~~ | 시스템 관리로 이관 | ~~근태코드 설정~~ | ~~Page~~ | 없음 | ~~`#page-att-code`~~ | ~~`page-att-code.js`~~ | ~~근태·휴가 3단계 사유 코드와 연차 차감 여부 관리~~ | 기초 설정 | ~~조회, 중·소분류 등록·수정, 순서 변경, 사용 여부 관리~~ | ❌ 삭제됨 — 파일·DOM·script 제거, `App.AttCodes` 소비처 0 (2026-07-14) | ~~파일 헤더~~ |

## 3. 삭제된 Detail·Modal·OffCanvas 목록

| 화면 ID | 상위 화면 | 화면명 | 유형 | 화면 위치·라우트 | 주요 목적·액션 | 분석 상태 | 근거 소스 |
|---|---|---|---|---|---|---|---|
| ~~SELF-HR-001-M01~~ | SELF-HR-001 | ~~서류 자료실~~ | ~~Modal~~ | ~~`modal-myinfo-lib`~~ | ~~적용 서류 다운로드·보관~~ | ❌ 현행 화면 제외 — 업무 담당자 확인 (2026-07-14), 관련 코드 잔존 여부 별도 확인 | ~~`page-hr-info-mgmt.js`~~ |
| ~~SELF-HR-001-M03~~ | SELF-HR-001 | ~~서류 서명~~ | ~~Modal~~ | ~~`modal-myinfo-sign`~~ | ~~서류 내용 확인·전자서명~~ | ❌ 현행 화면 제외 — 업무 담당자 확인 (2026-07-14), 관련 코드 잔존 여부 별도 확인 | ~~`page-hr-info-mgmt.js`~~ |
| ~~HR-EMP-001-D01~~ | HR-EMP-001 | ~~인사카드 상세~~ | ~~OffCanvas~~ | ~~`oc-hr-card`~~ | ~~권한별 인사정보·계약·이력 조회~~ | ❌ 삭제됨 — `modal-empi-card` 로 통합, 미사용 코드 제거 (2026-07-14) | ~~`index.html`, `page-hr-employee.js`~~ |
| ~~HR-EMP-001-M01~~ | HR-EMP-001 | ~~인사정보 수정 요청~~ | ~~Modal~~ | ~~`modal-hr-edit`~~ | ~~수정 항목·변경값·사유·증빙 제출~~ | ❌ 삭제됨 — 미사용 코드 제거 (2026-07-14) | ~~`index.html`~~ |
| ~~HR-EMP-001-M02~~ | HR-EMP-001 | ~~인사카드 PDF 출력~~ | ~~Modal~~ | ~~`modal-hr-pdf`~~ | ~~출력 섹션 선택, 인쇄·PDF~~ | ❌ 삭제됨 — 미사용 코드 제거 (2026-07-14) | ~~`index.html`~~ |
| ~~HR-EMP-001-M04~~ | HR-EMP-001 | ~~사원 부서 이동~~ | ~~Modal~~ | ~~`modal-org-move`~~ | ~~대상 사원의 소속 이동과 조직 변경 승인 요청~~ | ❌ 삭제됨 — DOM 고아(참조 JS 0), index.html 제거 (2026-07-14) | ~~`index.html`, `page-hr-employee.js`~~ |
| ~~HR-EMP-002-M02~~ | HR-EMP-002 | ~~임직원 일괄 등록~~ | ~~Modal~~ | ~~`modal-empi-bulk`~~ | ~~업로드 파일 검증·대상 일괄 등록~~ | ❌ 삭제됨 — DOM 미생성·opener 미호출, 코드 제거 (2026-07-14) | ~~`bindBulkModal()`, `openBulkModal()`~~ |
| ~~HR-EMP-002-O01~~ | HR-EMP-002 | ~~입사자 상세 패널~~ | ~~OffCanvas~~ | ~~`empi-detail-pane`~~ | ~~입사 마일스톤·계약·서류·계정 상태 관리~~ | ❌ 삭제됨 — 트리거(gotoDetail) 호출 0, 행클릭이 카드모달로 대체, 코드 제거 (2026-07-14) | ~~`renderDetailPane()` 계열~~ |
| ~~HR-EMP-002-O02~~ | HR-EMP-002 | ~~인사정보카드~~ | ~~OffCanvas~~ | ~~`oc-empi-card`~~ | ~~공개·비공개·계약·입사서류 탭 조회·편집~~ | ❌ 삭제됨 — `modal-empi-card` 로 통일, openDrawer/renderDrawer·export 제거 (2026-07-14) | ~~`openDrawer()`, `renderDrawer()`~~ |
| ~~HR-PAY-001-M06~~ | HR-PAY-001 | ~~지급항목 편집~~ | ~~Modal~~ | ~~`modal-pi-editor`, `modal-prs-additem`~~ | ~~지급항목 추가·정책 편집·정산 회차 반영~~ | ❌ 삭제됨 — +추가 버튼 렌더 경로 없음(도달 불가), DOM·opener 제거 (2026-07-14) | ~~`hr-payitem-data.js`, `openAddItemModal()`~~ |
| ~~HR-RSG-001-M01~~ | HR-RSG-001 | ~~퇴사 처리~~ | ~~Modal~~ | ~~`modal-lv-resign`~~ | ~~대상자·퇴사일·사유·연차정산·계정회수·자산반납 처리~~ | ❌ 삭제됨 — 여는 버튼 미렌더(도달 불가), 사용자 확인 후 DOM·opener 제거 (2026-07-14) | ~~`commitResign()`~~ |
| ~~HR-COD-001-M01~~ | HR-COD-001 | ~~직위·직책 코드 편집~~ | ~~Modal~~ | ~~페이지 생성 Modal~~ | ~~코드명·ID·설명·사용 여부 등록·수정~~ | ❌ 삭제됨 — 페이지 메뉴 이관(도달 불가), 편집 모달 클러스터 제거 (2026-07-14) | ~~`openModal(kind, editId)`~~ |
| ~~ATT-STS-001-M04~~ | ATT-STS-001 | ~~신청 현황~~ | ~~Modal~~ | ~~`modal-att-applist`~~ | ~~연차·초과근무·근태 신청과 승인 상태 조회~~ | ❌ 삭제됨 — 트리거 미렌더, opener·export 항목 제거 (App.AttStatus 유지) (2026-07-14) | ~~`openAppListModal()`~~ |
| ~~ATT-SSA-001-M01~~ | ATT-SSA-001 | ~~근무조 일괄 변경~~ | ~~Modal~~ | ~~`modal-shift-bulk`~~ | ~~선택 직원·기간의 근무조 일괄 변경~~ | ❌ 삭제됨 — page-att-shift.js 모듈화로 제거 (2026-07-14) | ~~`applyBulk()`~~ |
| ~~ATT-SSA-001-M02~~ | ATT-SSA-001 | ~~근무조 월 복사~~ | ~~Modal~~ | ~~`modal-shift-copy`~~ | ~~원본월을 대상월로 복사~~ | ❌ 삭제됨 — page-att-shift.js 모듈화로 제거 (2026-07-14) | ~~`applyCopyMonth()`~~ |
| ~~ATT-SSA-001-M03~~ | ATT-SSA-001 | ~~근무조 마스터~~ | ~~Modal~~ | ~~`modal-shift-master`~~ | ~~근무조 목록·사용부서 조회와 편집 진입~~ | ❌ 삭제됨 — page-att-shift.js 모듈화로 제거 (2026-07-14) | ~~`openMasterModal()`~~ |
| ~~ATT-LPS-001-M01~~ | ATT-LPS-001 | ~~연차 발생 미리보기~~ | ~~Modal~~ | ~~`leave-policy-modal`~~ | ~~적용 정책 기준 전 직원 발생량 검증·수동 조정~~ | ❌ 삭제됨 — 숨김 페이지, opener·미리보기 버튼 제거 (2026-07-14) | ~~`openLeaveMode()`~~ |
| ~~ATT-EVT-001-M01~~ | ATT-EVT-001 | ~~경조사 업무 처리~~ | ~~Modal~~ | ~~`modal-evt-proc`~~ | ~~경조휴가·경조금·화환 처리 완료·취소~~ | ❌ 삭제됨 — 숨김 페이지, DOM·opener·트리거 제거 (2026-07-14) | ~~`openProcModal()`~~ |
| ~~ATT-COD-001-M01~~ | ATT-COD-001 | ~~근태코드 편집~~ | ~~Modal~~ | ~~페이지 생성 Modal~~ | ~~중·소분류 코드와 연차 차감 여부 등록·수정~~ | ❌ 삭제됨 — 페이지 메뉴 이관, 편집 모달 클러스터 제거 (2026-07-14) | ~~`openModal(depth, editId)`~~ |
| ~~HR-EMP-002-M11~~ | HR-EMP-002 | ~~근무조 선택~~ | ~~Modal~~ | ~~`modal-empi-shift-pick`~~ | ~~사용 중인 근무조 선택과 근무시간 자동 반영~~ | ❌ 삭제됨 — 호출 트리거가 없어진 死 `openShiftPickModal()`·`applyShiftPick()`·DOM 제거. 근무조/근무시간은 부서 근무정책에서 자동 파생·hidden 보존 (2026-07-15) | ~~`openShiftPickModal()`~~ |
| ~~HR-EMP-002-M13~~ | HR-EMP-002 | ~~중요 인사정보 변경 승인 요청~~ | ~~Modal~~ | ~~`modal-empi-approval`~~ | ~~중요 변경값 비교·사유 입력·승인 요청~~ | ❌ 삭제됨 — 도달 불가 死코드(구 OC Drawer 잔재). `openApprovalModal()`·`bindApprovalModal()`·미호출 `bindDrawerFooter()`와 전용 헬퍼(`splitCriticalPatch`·`formatFieldValue`·`commitPatch`·`CRITICAL_FIELDS`)·init 바인딩을 삭제. 내 정보 [변경 요청]은 이 모달이 아니라 공통 전자결재 모달(`App.openSystemApprovalModal()`) 사용 (2026-07-15) | ~~`openApprovalModal()`~~ |
| ~~HR-PAY-001-M07~~ | HR-PAY-001 | ~~급여 정산 회차 복사~~ | ~~Modal~~ | ~~`modal-prs-copy`~~ | ~~기존 급여 정산 회차의 기준·항목을 복사~~ | ❌ 삭제됨 — 트리거(`data-prs-row-copy`) 미구현으로 열 수 없던 죽은 코드. 모달 DOM·핸들러·`openCopyModal()`/`confirmCopy()` 삭제 (2026-07-15) | ~~`openCopyModal()`~~ |
| ~~HR-PAY-001-M08~~ | HR-PAY-001 | ~~연장근로수당 산식 설정~~ | ~~Modal~~ | ~~`modal-ps-ot`~~ | ~~연장·야간·휴일근로 수당 산식과 배율 편집~~ | ❌ 삭제됨 — 트리거(`data-prs-ot-settings`) 미구현으로 열 수 없던 죽은 코드. 모달 DOM·핸들러·`App.HRPaySettings.openOtModal()`(+전용 render/bind 헬퍼) 삭제. 가산배율·지급일 조회 API는 유지 (2026-07-15) | ~~`App.HRPaySettings.openOtModal()`~~ |

## 4. 정리 이력 및 해석

- ~~`ATT-SSA-001` 근무스케줄 배치~~ Page 는 `page-att-shift.js` 삭제로 제거됐다. 부서원 근무조 배정 기능은 근무스케줄 편성(`ATT-SSB-001`)·현황(`ATT-SSV-001`)과 `att-shift-data.js` 공용 모듈로 흡수됐다. (2026-07-14)
- 2026-07-14 미사용 정리 — §3 삭제 목록은 19건(Modal 16·OffCanvas 3)이다. 기존 17건은 DOM·opener·트리거가 제거됐고, `SELF-HR-001-M01`·`SELF-HR-001-M03` 2건은 업무 담당자 확인으로 현행 화면 목록에서 제외했으며 관련 코드 잔존 여부는 별도 확인 대상이다. 유지 판정된 중도인출 편집(`HR-PEN-001-M02`)·계약 무효화(`HR-CTR-001-M03`)·임직원 개별 등록(`HR-EMP-002-D01`, Modal→인-페이지 Detail 정정)은 활성이다. `modal-ctr-bulk`는 일괄 작성 기능은 제거됐지만 개별 계약서 작성 대상 직원 선택에 재사용되므로 활성 목록으로 복귀했다.
- 2026-07-15 미사용 정리 — 계약 일괄 작성의 도달 불가 Phase 2(일괄 편집 테이블) 서브시스템을 전면 제거했다. `page-hr-contract.js`의 死 함수 `renderBulkPhase2`·`handleBulkEditChange`·`autoCalcBulkWageDraft`·`buildBulkDraft`·`bulkNameCardLink`·`doBulkCreate`/`doBulkCreateApply`·`openShiftPickForBulkRow`/`applyShiftPickToBulkRow`와 `index.html` 마크업 `#ctr-bulk-phase2`·`#modal-ctr-bulk-preview`·일괄 footer 버튼(다음/이전/발송)을 삭제했다. `modal-ctr-bulk`의 Phase 1(직원 선택)과 공유 헬퍼(`syncToInfoMgmt`·`openBulkDocPreview`)는 개별 작성 흐름에서 계속 사용하므로 유지. 이로써 `modal-empi-shift-pick`(`HR-EMP-002-M11`)은 호출 경로가 완전히 사라져 함께 제거됐다.
- 2026-07-15 검토 확정·이관 — 기존 누락 가능 항목의 「검토 필요」 UI를 소스 실측으로 전수 확인했다. `HR-EMP-002-M13`(중요 인사정보 변경 승인 요청)은 도달 불가 死코드로 확인되어 `openApprovalModal()`·`bindApprovalModal()`·미호출 `bindDrawerFooter()`와 전용 헬퍼(`splitCriticalPatch`·`formatFieldValue`·`commitPatch`·`CRITICAL_FIELDS`)·init 바인딩을 `page-hr-info-mgmt.js`에서 제거했다(내 정보 [변경 요청]은 공통 전자결재 모달 `App.openSystemApprovalModal()` 사용 — 무관). 아울러 `HR-EMP-002-M08`의 미렌더 목록 행 [문자 발송] 死코드(`rowActionsHTML`·`doSmsSend`·행 액션 `sms-send` 분기)를 제거했다(개별 등록 흐름의 `openSmsModal`은 유지). `HR-EMP-002-M11`·`HR-PAY-001-M07`·`HR-PAY-001-M08`·`HR-EMP-002-M13` 4건은 §3 삭제 목록으로 이관했다(§3 Modal 16→20, 삭제 이력 합계 27→31). 실제 트리거 경로가 확인된 나머지 25건은 활성 화면 IA로 이관했다.
- ~~`HR-COD-001`, `ATT-LPS-001`, `ATT-EVT-001`, `ATT-WRM-001`, `ATT-WRS-001`, `ATT-WRC-001`, `ATT-COD-001`~~ 7개 Page 는 2026-07-14 전부 삭제됐다 (JS 파일·DOM section·script 태그·init 제거). 단 `ATT-LPS-001`(연차 설정)은 `page-att-settings.js` 를 `ATT-WPL-001`(근무정책, 활성)과 공유하므로 파일은 유지하고 leave-set 코드(233–591·1482–1512)만 도려냈다. 각 export(`App.HRPositions`·`App.AttEvent`·`App.AttCodes`·`App.WorkReport`)는 살아있는 소비처가 없어(WorkReport는 삭제된 report 2종만 참조) 함께 제거해도 안전했다.
- 제거된 독립 Page인 입사서류 관리, 지급항목 설정, 급여 기준 설정, 퇴사 처리 화면은 데이터 모듈 또는 부모 화면 Modal로 통합되어 Page 수에서 제외했다.
