# Work MD — 예외 알림

## 0) Meta

| 항목 | 내용 |
|------|------|
| Work ID | WK-VRS-예외알림-004 |
| Date | 2026-04-28 |
| Sources | vehicle_reservation_app.html (2026-04-28, /차량예약/) |
| Depends On | WK-VRS-예약등록-001 |

---

## 1) Summary

### One-liner

갭(Gap) 초과 등 운행 예외 상황을 관리자가 확인하고 처리하는 예외 알림 관리 화면

### Goals

- 목표 1: 갭 초과 발생 건을 즉시 인지하고 관리자가 확인 처리
- 목표 2: 미확인 예외 건수를 사이드바 배지로 실시간 표시하여 누락 방지

### Scope (In)

- ✅ 예외 알림 목록 테이블 (발생일시, 차량, 예약자, 유형, 갭 거리, 상태, 관리자 처리)
- ✅ 미확인 건수 사이드바 배지 표시
- ✅ 관리자 확인 처리 (메모 입력 + 상태 변경)

---

## 3) Use Cases

| Use Case ID | Use Case 명 | 목적 | 시작 조건 | 종료 조건 | 통제 포인트 | 포함 Action |
|-------------|-------------|------|----------|----------|------------|-------------|
| UC-006 | 예외 알림 관리 | 갭 초과 예외 확인 및 처리 | 예외 발생 | 관리자 확인 완료 | - | AC-040~AC-042 |

---

## 4) Actions

| Action ID | Action명 (영어) | Action명 (한글) | 설명 | 선행 조건 | 수행 권한 | Use Case |
|-----------|----------------|----------------|------|----------|----------|----------|
| AC-040 | View Alerts | 예외 알림 조회 | 전체 예외 알림 목록 테이블 (최신순) | - | 관리자/사용자 | UC-006 |
| AC-041 | Confirm Alert | 예외 확인 처리 | 미확인 건 → 관리자 메모 입력 → status '확인완료' 전환 | status=미확인 | 관리자 | UC-006 |
| AC-042 | Generate Alert | 예외 자동 생성 | 예약 등록 시 갭 > GAP_THRESHOLD → Alert 자동 생성 | 갭 초과 | 시스템 | UC-006 |

---

## 5) Local Rules

| Rule ID | Rule statement | Applies to Action | Timing | Evidence |
|---------|----------------|-------------------|--------|----------|
| LR-040 | Alert 자동 생성 조건: gap > GAP_THRESHOLD(3km) | AC-042 | after reservation | - |
| LR-041 | Alert.type = 'GAP', 초기 status = '미확인' | AC-042 | any | - |
| LR-042 | 사이드바 '예외 알림' 메뉴에 미확인 건수를 빨간 배지로 표시 | AC-040 | any | - |
| LR-043 | 확인 처리 시 관리자 메모(adminNote) 입력 필수 | AC-041 | before | - |

---

## 9) Business Objects

> Alert 객체는 WK-VRS-예약등록-001 Section 9 참조

### States: Alert (알림 상태)

| State | Meaning (한글) | Final? | Notes |
|-------|---------------|--------|-------|
| 미확인 | 발생 후 미처리 | No | 사이드바 배지 카운트 대상 |
| 확인완료 | 관리자 확인 처리 | Yes | adminNote 필수 |

---

## 12) UI Spec

### 예외 알림 테이블

| 컬럼 | 설명 |
|------|------|
| 발생일시 | createdAt |
| 차량 | vehicleId → 차량명 |
| 예약자 | userId → 사용자명 |
| 유형 | type (GAP) |
| 직전 종료 거리 | prevEnd km |
| 실제 출발 거리 | currStart km |
| 갭 거리 | gapDist km |
| 상태 | 미확인(위험 배지) / 확인완료(성공 배지) |
| 관리자 메모 | adminNote 또는 '-' |
| 관리 | '확인' 버튼 (미확인 건만) |
