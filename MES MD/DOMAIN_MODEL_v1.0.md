# DOMAIN_MODEL — MES (생산관리)

> **버전**: v1.2
> **최종 갱신**: 2026-04-16
> **목적**: MES 어드민 6개 Work MD(WK-PRD-COM/PRC/FAB/PKG/MON/AUD)의 Entity와 Cross-Work-MD Relation을 통합 정의한다.
> **참조 원칙**: 본 문서는 Work MD에 정의된 Entity의 통합 뷰일 뿐, 속성 변경 권한은 각 Work MD에 있다. 본 문서를 단독으로 수정하지 않는다.
> **갱신 주기**: 3~5개 Work MD 누적 시 배치 갱신 (현재는 Phase 1 6개 일괄 통합).

---

## 1. Entity 인벤토리 (소속 Work MD별)

### 1.1 공통 (WK-PRD-COM)

| Entity | 영문 | SoT | 비고 |
|--------|------|-----|------|
| 사용자 | User | GW.인사 (READ) | 사번/소속/권한 |
| 장비 | Equipment | GW.장비운영 (READ) + MES (현재상태 WRITE) | 인쇄·가공·포장 공통 마스터 |
| 알림 | Notification | MES | 푸시·인앱 알림 |
| 공지사항 | Notice | MES | 게시판 |
| 캘린더일정 | CalendarEvent | GW (READ) | 휴가·외부일정 |
| 감리일정 | InspectionSchedule | MES (WRITE) | v3.0: 감리거부 상태 삭제. 상태=감리대기/감리승인/감리완료 |
| 자재신청 | MaterialRequest | **단계별 SoT 분리**: 신청 단계 SoT=MES (신청 레코드 생성·제출 — 담기=즉시 신청, v1.4.0 DEC-22), 처리 단계 SoT=GW.자재관리 (승인·반려·출고) | PKG에서도 동일 Entity 사용. 낙관적 잠금(LR-024)·재신청 허용(LR-036, 전 상태 독립 신청) |
| 작업로그 | WorkLog | MES (SoT) | 전공정 공통 이력 |
| 감사로그 | AuditLog | MES (SoT) | POL-MES-001. WHO/WHEN/WHAT/WHY 영구 보관 |

### 1.2 인쇄 (WK-PRD-PRC)

| Entity | 영문 | SoT | 비고 |
|--------|------|-----|------|
| 장비(인쇄) | Equipment | GW.장비운영 (READ) + MES (현재상태 WRITE) | 인쇄/옵셋/출력 유형 |
| 조판정보 | JobOrder | 조판시스템 (READ) | 조판번호 = 스캔 키 |
| 작업로그 | WorkLog | MES (SoT) | 인쇄 공정 이력 |
| 업무요청 | WorkRequest | 접수/생산시스템 (READ) + MES (처리상태 WRITE) | 회신: 확인완료/진행불가/기타 |

### 1.3 가공 (WK-PRD-FAB)

| Entity | 영문 | SoT | 비고 |
|--------|------|-----|------|
| 가공작업 | ProcessingJob | MES | 가공 단위 작업 (품목 헤더) |
| 가공유형작업 | ProcessingJobItem | MES | 품목 하위, 가공유형(코팅/박/제본/오시/접지/타공/형압 등) 단위 독립 Row. 자체 상태·재작업 플래그 보유 (POL-PRD-121) |
| 가공기기 | ProcessingMachine | GW.장비운영 (READ) + MES (현재상태 WRITE) | — |
| 가공상태이력 | ProcessingLog | MES (SoT) | 상태 전이 이력 |
| 가공마스터 | ProcessingMaster | MES | 가공 유형·완료 단위 정의(POL-DATA-006) |

### 1.4 포장 (WK-PRD-PKG)

| Entity | 영문 | SoT | 비고 |
|--------|------|-----|------|
| 포장작업 | PackagingJob | MES | 포장 단위 작업 |
| 포장기기 | PackagingMachine | GW.장비운영 (READ) | 라벨 프린터 포함 |
| 포장출력 | PackagingOutput | MES | 송장·라벨 출력물 |
| 관리자메모 | AdminMemo | MES | POL-ADM-030 |
| 포장이력 | PackagingLog | MES (SoT) | 상태 전이 이력 |
| 자재신청 | MaterialRequest | 단계별 SoT (신청=MES, 처리=GW) | WK-PRD-COM과 동일 Entity |

### 1.5 모니터링 (WK-PRD-MON)

| Entity | 영문 | SoT | 비고 |
|--------|------|-----|------|
| 기기 | Device | GW.장비운영 (READ) | 마스터 (View) |
| 기기상태 | DeviceStatus | MES (실시간) | RUN/PAUSED/OFFLINE/DONE |
| 가동현황집계 | ProductionSummary | MES | 일자별 집계 |
| 타임라인작업 | TimelineJob | MES | 작업 카드 단위 |
| 중단알림 | StopAlert | MES | 중단 사유 알림 |

### 1.6 감리 (WK-PRD-AUD)

| Entity | 영문 | SoT | 비고 |
|--------|------|-----|------|
| 감리접수 | AuditRequest | MES | 감리 단위. 감리상태/진행상태/감리유형 |
| 감리담당자 | AuditStaff | GW.인사 (READ) | P_MES_WORKER 권한 |
| 감리일정이벤트 | AuditScheduleEvent | MES | 캘린더 카드 |
| 알림톡이력 | AlimtalkHistory | MES | POL-EXC-002 Fallback 3회 |
| 감리이력 | AuditHistory | MES (SoT) | POL-MES-001 영구 보관 |

---

## 2. Entity 통합 매핑 (중복·동의어)

| 표준 명칭 | 별칭 / 동의어 | 사용 Work MD | 비고 |
|----------|-------------|-------------|------|
| Equipment / 장비 | Device(MON), 가공기기(FAB), 포장기기(PKG) | COM/PRC/FAB/PKG/MON | GW.장비운영 단일 마스터, 화면 컨텍스트별 세분화 명칭 사용 |
| WorkLog / 작업로그 | ProcessingLog(FAB), PackagingLog(PKG) | COM/PRC/FAB/PKG | 공정별 SoT 분리 운용. 감사 필드 표준은 POL-MES-001 |
| MaterialRequest / 자재신청 | — | COM/PKG | 동일 Entity. PKG는 포장 자재 신청 시 호출 |
| AuditRequest / 감리접수 | InspectionSchedule(COM) | COM(요약 보유) / AUD(상세 SoT) | AUD가 SoT. COM Entity는 캘린더 표시용 요약 |

> **원칙**: Equipment 마스터 속성 변경은 GW에서만 수행. MES는 현재상태(RUN/PAUSED/OFFLINE/DONE)만 WRITE한다.

---

## 3. Cross-Work-MD Relations

| ID | From (Work MD : Entity) | 관계 | To (Work MD : Entity) | Type | Trigger |
|----|------------------------|------|----------------------|------|---------|
| GR-001 | WK-PRD-PRC : 작업로그 | 인쇄 완료 → 가공 대기 PUSH | WK-PRD-FAB : 가공작업 | TRIGGER OUT | AC-016 (인쇄 완료) |
| GR-002 | WK-PRD-FAB : 가공작업 | 가공 완료 → 포장 대기 PUSH | WK-PRD-PKG : 포장작업 | TRIGGER OUT | 가공 완료 시 |
| GR-003 | WK-PRD-PRC : 작업로그 | 옵셋 인쇄 시작 전 CTP 완료 확인 | (MES-CTP) | READ | 옵셋 시작 시 |
| GR-004 | WK-PRD-PKG : 포장작업 | 출고 PUSH | (배송시스템) | OUT | 송장 발급 후 |
| GR-005 | WK-PRD-AUD : 감리접수 | 감리 대상 작업 카드 배지 표시 | WK-PRD-PRC : 작업로그 / WK-PRD-FAB : 가공작업 | READ (depends_by) | 작업 목록 조회 시 |
| GR-006 | WK-PRD-PRC : 작업로그 | 인쇄 공정 생산 진행 → 감리완료 자동 트리거 (POL-MES-010 정방향) | WK-PRD-AUD : 감리접수 | TRIGGER OUT | 인쇄 진행 시 |
| GR-007 | WK-PRD-FAB : 가공유형작업 | 감리 대상 가공유형 완료 → 감리완료 자동 트리거 (POL-MES-010 정방향) | WK-PRD-AUD : 감리접수 | TRIGGER OUT | 가공 완료 시 |
| GR-008 | WK-PRD-MON : 기기상태 | 실시간 상태 구독 | WK-PRD-PRC/FAB/PKG : 작업로그 | READ (Stream) | WebSocket 실시간 |
| GR-009 | WK-PRD-MON : 타임라인작업 | 작업 진행 정보 구독 | WK-PRD-PRC : 작업로그 | READ | 타임라인 조회 시 |
| GR-010 | WK-PRD-COM : 자재신청 | 포장 자재 신청 호출 | WK-PRD-PKG : 자재신청 | INHERIT | 포장 화면에서 호출 |
| GR-011 | WK-PRD-COM : 사용자 | 권한·로그인 INHERIT | 전 Work MD | INHERIT | 모든 화면 |
| GR-012 | WK-PRD-COM : 감사로그 | 모든 상태변경 기록 | 전 Work MD | INHERIT (POL-MES-001) | 모든 상태변경 시 |
| GR-013 | WK-PRD-AUD : 감리접수 | 감리승인 시 캘린더 이벤트 생성 | WK-PRD-COM : 캘린더일정 / 감리일정 | WRITE | 감리승인 시 |
| GR-014 | WK-PRD-PRC : 작업로그 | 인쇄 완료취소 → 감리 롤백 TRIGGER (감리승인→감리대기 원점복귀 + 감리자 알림 / 감리완료 Terminal 유지 + 알림만) (POL-MES-010 역방향) | WK-PRD-AUD : 감리접수 | TRIGGER OUT (ROLLBACK) | 인쇄 완료취소 시 |
| GR-015 | WK-PRD-FAB : 가공유형작업 | 감리 대상 가공유형 완료취소 → 감리 롤백 TRIGGER (동일 3-way 처리) (POL-MES-010 역방향) | WK-PRD-AUD : 감리접수 | TRIGGER OUT (ROLLBACK) | 가공 완료취소 시 |

---

## 4. 공정 흐름 다이어그램 (텍스트)

```
[접수/조판] → [WK-PRD-PRC 인쇄] → [WK-PRD-FAB 가공]* → [WK-PRD-PKG 포장] → [출고]
                    ↕ TRIGGER (POL-MES-010)   ↕ TRIGGER (POL-MES-010)
              [WK-PRD-AUD 감리완료 자동 전이 / 롤백 TRIGGER 수신]

  정방향: PRC/FAB 완료 → AUD 감리완료 자동 전이
  역방향: PRC/FAB 완료취소 → AUD 롤백 TRIGGER (3-way 처리)

[WK-PRD-MON 모니터링] ← READ ← (PRC/FAB/PKG 실시간 상태)
[WK-PRD-COM 공통] ← INHERIT ← (전 Work MD: 사용자/권한/감사로그/알림)

* 가공은 가공옵션이 있는 품목만 경유. 미해당 시 인쇄→포장 직행.
```

---

## 5. SoT (Source of Truth) 정합성 규칙

| 데이터 종류 | SoT | 참조하는 Work MD |
|------------|-----|-----------------|
| 사용자 마스터 | GW.인사 | 전 Work MD (READ) |
| 장비 마스터 | GW.장비운영 | 전 Work MD (READ) |
| 자재 마스터/재고 | GW.자재관리 | COM, PKG (READ) |
| 코드/공통코드 | GW.코드관리 | 전 Work MD (READ) |
| 조판정보 | 조판시스템 | PRC (READ) |
| 접수/품목정보 | 접수시스템 | PRC (READ) |
| 인쇄 작업 이력 | MES.WorkLog (PRC) | PRC, MON (READ) |
| 가공 작업 이력 | MES.ProcessingLog (FAB) | FAB, MON (READ) |
| 포장 작업 이력 | MES.PackagingLog (PKG) | PKG, MON (READ) |
| 감리 이력 | MES.AuditHistory (AUD) | AUD |
| 모든 상태변경 감사로그 | MES.AuditLog (COM) | 전 Work MD (INHERIT) |

---

## 6. 변경 이력

| 버전 | 일자 | 변경 내용 |
|------|------|----------|
| v1.0 | 2026-04-14 | Phase 2-1 초안 작성. WK-PRD-COM/PRC/FAB/PKG/MON/AUD 6개 Work MD의 Entity 28종 통합, Cross-Work-MD Relation 13건 정의. v3.0 감리거부 삭제 반영 |
| v1.2 | 2026-04-16 | Medium/Low 보강: 자재신청(MaterialRequest) Entity SoT를 단계별 분리 명시 — 신청 단계 SoT=MES, 처리 단계 SoT=GW. 낙관적 잠금(LR-024) 참조 추가 |
| v1.1 | 2026-04-16 | Safety Scan 보강 반영. §1.3 ProcessingJobItem Entity 신설(POL-PRD-121). §2 기기 상태 코드 4종 표준화(RUN/PAUSED/OFFLINE/DONE). §3 GR-006/007 양방향 명시 + GR-014/015 역방향 롤백 TRIGGER 신설(POL-MES-010). §4 다이어그램 양방향 화살표 반영 |
