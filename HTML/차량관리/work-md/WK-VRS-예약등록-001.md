# Work MD — 차량 예약 등록

## 0) Meta

| 항목 | 내용 |
|------|------|
| Work ID | WK-VRS-예약등록-001 |
| Date | 2026-04-29 (updated) |
| Sources | vehicle_reservation_app.html (2026-04-28, /차량예약/) |

---

## 1) Summary

### One-liner

사용자가 날짜·차량·목적지를 선택하여 사내 차량을 예약하고, 출발 거리 및 계기판 사진을 함께 등록하는 업무

### Goals

- 목표 1: 사내 차량의 사용일자·차량·운행정보를 사전에 등록하여 차량 운영 효율화
- 목표 2: 출발 거리 기록을 통해 운행 이력의 연속성을 확보하고 갭(Gap) 관리

### Scope (In)

- ✅ 날짜 선택 (달력 UI, 월 단위 탐색)
- ✅ 차량 선택 (가용 차량 카드 리스트, 실사 이미지)
- ✅ 예약 정보 입력 (목적지, 사용목적, 예상 운행 시간, 메모)
- ✅ 운행 설정 (출발 거리 입력, 갭 계산, 갭 사유 입력, 계기판 사진 업로드)
- ✅ 예약 등록 완료 → 상태 '예약완료' 생성
- ✅ 모바일 반응형 UI (768px 이하 단일 컬럼 전환)

---

## 2) Terms

| Source term | Definition | Synonyms / Notes | Action | CommonRef |
|-------------|------------|------------------|--------|-----------|
| 예약 | 사용자가 특정 날짜에 특정 차량을 사용하겠다고 등록하는 행위 | Reservation | new | TERM-001 |
| 직전 등록 거리 | 해당 차량의 가장 최근 운행 종료 시 기록된 거리(km) | prevEndDist, lastEndDist | new | TERM-002 |
| 갭(Gap) | 직전 등록 거리와 실제 출발 거리의 차이(km) | gap, gapDist | new | TERM-003 |
| 갭 기준(Threshold) | 갭 허용 한도. 초과 시 관리자 자동 알림 발생 | GAP_THRESHOLD = 3km | new | TERM-004 |
| 계기판 사진 | 차량 출발 시 계기판 거리(km)를 촬영한 증빙 사진 | dashPhoto | new | TERM-005 |

---

## 3) Use Cases

| Use Case ID | Use Case 명 | 목적 | 시작 조건 | 종료 조건 | 통제 포인트 | 포함 Action | Evidence |
|-------------|-------------|------|----------|----------|------------|-------------|----------|
| UC-001 | 차량 예약 등록 | 사용자가 차량을 예약하고 출발 거리를 등록 | 사용자 로그인 상태 | 예약 데이터 생성 (status=예약완료) | 필수 입력값 검증, 갭 초과 시 알림 | AC-001~AC-007 | - |

---

## 4) Actions

### Use Case 포함 Actions

| Action ID | Action명 (영어) | Action명 (한글) | 설명 | 선행 조건 | 수행 권한 | Use Case |
|-----------|----------------|----------------|------|----------|----------|----------|
| AC-001 | Select Date | 날짜 선택 | 달력에서 사용 날짜를 클릭하여 선택. 해당 날짜의 예약 건수 표시 | - | 사용자 | UC-001 |
| AC-002 | View Available Vehicles | 가용 차량 조회 | 선택 날짜에 예약 가능한 차량 카드 리스트 노출. 예약 불가 차량은 비활성(disabled) 표시 | AC-001 완료 | 사용자 | UC-001 |
| AC-003 | Select Vehicle | 차량 선택 | 가용 차량 카드 클릭으로 선택. 선택 시 카드 하이라이트 + 예약 폼 활성화 | AC-002 완료 | 사용자 | UC-001 |
| AC-004 | Fill Reservation Info | 예약 정보 입력 | 목적지(필수), 사용목적, 예상 운행 시간, 메모 입력 | AC-003 완료 | 사용자 | UC-001 |
| AC-005 | Set Start Distance | 출발 거리 설정 | 실제 출발 거리(km) 입력. 직전 등록 거리와 자동 비교하여 갭 계산 | AC-003 완료 | 사용자 | UC-001 |
| AC-006 | Upload Dashboard Photo | 계기판 사진 업로드 | 계기판 거리 사진을 업로드 | AC-005 완료 | 사용자 | UC-001 |
| AC-007 | Submit Reservation | 예약 등록 | 필수 입력값 검증 후 예약 데이터 생성. 갭 초과 시 관리자 알림(Alert) 자동 발생 | AC-004~AC-006 완료 | 사용자 | UC-001 |

---

## 5) Local Rules

### 업무 특수 규칙

| Rule ID | Rule statement | Applies to Action | Timing | Evidence |
|---------|----------------|-------------------|--------|----------|
| LR-001 | 목적지는 필수 입력이며, 미입력 시 예약 등록 불가 | AC-007 Submit Reservation | before | - |
| LR-002 | 실제 출발 거리(km)는 필수 입력이며, 숫자만 허용 | AC-005 Set Start Distance | before | - |
| LR-003 | 갭(Gap) = |실제 출발 거리 - 직전 등록 거리|. 갭 > GAP_THRESHOLD(3km) 시 '기준 초과' 경고 표시 및 갭 사유 필수 입력 | AC-005 Set Start Distance | after | - |
| LR-004 | 갭 > GAP_THRESHOLD(3km) 시 예약 등록과 동시에 예외 알림(Alert) 자동 생성. type='GAP', status='미확인' | AC-007 Submit Reservation | after | - |
| LR-005 | 계기판 사진은 필수 업로드 항목 | AC-006 Upload Dashboard Photo | before | - |
| LR-006 | 사용 목적 선택지: 출장, 외근, 납품, 기타 | AC-004 Fill Reservation Info | any | - |
| LR-007 | 예상 운행 시간 선택지: 반일(오전/오후), 종일, 1박 이상 | AC-004 Fill Reservation Info | any | - |
| LR-008 | 직전 운행 기록이 없는 차량의 경우 출발 거리를 직접 입력 (경고 메시지 노출) | AC-005 Set Start Distance | any | - |
| LR-009 | 동일 날짜에 이미 예약된 차량(status: 예약완료/운행시작)은 '예약불가' 상태로 비활성 표시 | AC-002 View Available Vehicles | any | - |
| LR-010 | driveStatus가 '운행가능'이 아닌 차량(운행불가/정비중)은 예약 불가로 비활성 표시. 비가용 사유를 driveStatus 값으로 표시 | AC-002 View Available Vehicles | any | v1.1 추가 |
| LR-011 | 가용 차량 = driveStatus === '운행가능' AND 해당 날짜 예약 없음. 두 조건 모두 충족해야 예약 가능 | AC-002 View Available Vehicles | any | v1.1 추가 |

---

## 6) Exceptions

| Exception ID | Action | 발생 조건 | 처리 원칙 | 재시도 | 알림 | Evidence |
|-------------|--------|----------|----------|-------|------|----------|
| EX-001 | AC-007 | 목적지 미입력 | BLOCK — 등록 차단, 입력 안내 | 무제한 | N | - |
| EX-002 | AC-007 | 출발 거리 미입력 또는 비숫자 | BLOCK — 등록 차단, 입력 안내 | 무제한 | N | - |
| EX-003 | AC-005 | 갭 > GAP_THRESHOLD 이나 갭 사유 미입력 | BLOCK — 갭 사유 입력 필수 안내 | 무제한 | N | - |
| EX-004 | AC-002 | 선택 날짜에 가용 차량 없음 | FALLBACK — '예약 가능한 차량이 없습니다' 메시지 | - | N | - |

---

## 7) Risks

| Risk ID | Category | 위험 설명 | 영향 범위 | 탐지 방식 | 완화 기준 | Evidence |
|---------|----------|----------|----------|----------|----------|----------|
| RS-001 | Data Integrity | 출발 거리 허위 입력으로 갭 관리 무력화 | 운행 이력 신뢰도 | 계기판 사진과 거리 교차 확인 | 관리자 사후 검증 | - |
| RS-002 | Operational Misuse | 다른 사용자 명의 예약 불가 — 현재 로그인 사용자로 고정 | 책임 추적 | userId 자동 바인딩 | - | - |

---

## 8) Integrations

| External System | Direction | Purpose (한글) | When | Notes | Evidence |
|-----------------|-----------|----------------|------|-------|----------|
| (없음 — 단일 HTML 앱) | - | - | - | 향후 사내 시스템 연동 시 확장 | - |

---

## 9) Business Objects

| Object | Meaning (한글) | 식별 기준 | 주요 항목 | Notes |
|--------|---------------|----------|----------|-------|
| Reservation | 차량 예약 | id (R + 3자리 일련번호) | id(예약ID), userId(예약자ID), vehicleId(차량ID), date(사용일자), destination(목적지), purpose(사용목적), memo(메모), status(상태), createdAt(등록일시) | 아래 상태 참조 (9-1) |
| Vehicle | 차량 기준정보 | id (V + 3자리) | id(차량ID), name(차량명), plate(차량번호), type(차종), color(대표색), driveStatus(운행상태), img(차량이미지 base64) | 마스터 데이터. driveStatus: 운행가능/운행불가/정비중 |
| Operation | 운행 기록 | id (OP + 3자리) | id(운행ID), resId(예약ID), startDist(출발거리), prevEndDist(직전종료거리), endDist(도착거리), gap(갭), startPhotos(출발사진배열), endPhotos(도착사진배열), startedAt(운행시작일시), endedAt(운행종료일시), gapReason(갭사유) | Reservation 1:1 |
| Alert | 예외 알림 | id (AL + 3자리) | id(알림ID), vehicleId(차량ID), resId(예약ID), type(유형), gapDist(갭거리), prevEnd(직전종료), currStart(실제출발), userId(발생자ID), status(상태), adminNote(관리자메모), createdAt(발생일시) | 갭 초과 시 자동 생성 |

### 9-1) Master Data Values: Vehicle.type (차종)

| 코드 | 명칭 | 사용 여부 | Notes |
|------|------|----------|-------|
| 세단 | 세단 | Active | 쏘나타, 아반떼 |
| SUV | SUV | Active | 카니발 |
| 밴 | 밴 | Active | 스타리아 |

### 9-2) Master Data Values: Reservation.purpose (사용목적)

| 코드 | 명칭 | 사용 여부 | Notes |
|------|------|----------|-------|
| 출장 | 출장 | Active | - |
| 외근 | 외근 | Active | - |
| 납품 | 납품 | Active | - |
| 기타 | 기타 | Active | - |

### 9-3) States: Reservation (예약 상태)

| State | Meaning (한글) | Final? | Notes |
|-------|---------------|--------|-------|
| 예약완료 | 예약이 확정된 상태 | No | 초기 등록 상태 |
| 운행시작 | 사용일자 도래 시 자동 전환 | No | Operation 자동 생성 |
| 운행종료 | 운행이 종료된 상태 | No | 도착 거리 입력 완료 |
| 반납대기 | 반납 처리 대기 중 | No | - |
| 반납완료 | 차량 반납 완료 | Yes | 최종 완료 상태 |
| 예약취소 | 사용자가 예약을 취소 | Yes | 사용일 전에만 가능 |

### 9-4) State Transitions: Reservation

| Current State | Event | Next State | Condition | Timing | Action | Notes |
|---------------|-------|------------|-----------|--------|--------|-------|
| 예약완료 | date_reached | 운행시작 | 사용일자 ≤ 오늘 | 자동 | Auto-create Operation | 페이지 로드 시 자동 전환 |
| 예약완료 | user_cancel | 예약취소 | 사용일자 > 오늘 | 사용자 액션 | Cancel Reservation | 사용일 이전에만 가능 |
| 운행시작 | end_drive | 운행종료 | 도착 거리 입력 완료 | 사용자 액션 | Save End Drive | - |
| 운행종료 | return_vehicle | 반납대기 | - | 사용자 액션 | Return Vehicle | - |
| 반납대기 | admin_confirm | 반납완료 | 관리자 확인 | 관리자 액션 | Confirm Return | - |

---

## 10) Relations (업무 간 연결 계약)

| From | Relation (한글) | To | Cardinality | 트리거 | 조건 | 결과 | Notes | Evidence |
|------|-----------------|-----|-------------|--------|------|------|-------|----------|
| Reservation | 운행 기록을 생성한다 | Operation | 1:1 | 사용일자 도래 | status=예약완료 | Operation 자동 생성, status→운행시작 | - | - |
| Reservation | 예외 알림을 발생시킨다 | Alert | 1:0..1 | 예약 등록 시 | gap > GAP_THRESHOLD | Alert 생성 (type=GAP) | 갭 초과 시에만 | - |
| Operation | 반납 기록을 생성한다 | Return | 1:0..1 | 운행 종료 후 | 반납 처리 시 | Return 데이터 생성 | - | - |

---

## 11) User Journeys

### Overview

| Journey ID | Journey Name | Actor(s) | Start Trigger | End State | Priority | Type |
|------------|-------------|----------|---------------|-----------|----------|------|
| UJ-001 | 차량 예약부터 반납까지 | 사용자 | 예약 필요 인식 | 반납완료 | High | Happy Path |

### UJ-001: 차량 예약부터 반납까지

```
사용자 → 날짜 선택(달력) → 가용 차량 확인 → 차량 카드 선택
→ 목적지·사용목적·메모 입력 → 출발 거리 입력 + 계기판 사진 촬영
→ 예약 등록 → [사용일 도래] → 운행시작 (자동)
→ 운행종료 (도착 거리 + 사진 입력) → 반납 처리 → 반납완료
```

---

## 12) UI Spec

### 화면 구성 — 3패널 레이아웃 (Desktop)

| 패널 | 영역 | 폭 | 주요 컴포넌트 |
|------|------|----|-------------|
| Panel 1 | 날짜 선택 | 300px | 달력(월 탐색, 날짜 클릭), 선택일 예약 건수 표시 |
| Panel 2 | 차량 선택 | 400px | 차량 카드 리스트 (이미지, 차량명-번호, 예약가능 배지, 직전 등록 거리) |
| Panel 3 | 예약 및 운행 설정 | 1fr (나머지) | 선택 차량 정보, 예약 폼, 운행 설정 폼, 등록 버튼 |

### 화면 구성 — 모바일 (≤768px)

| 영역 | 변경사항 |
|------|---------|
| 전체 | 3패널 → 세로 1컬럼 스택 |
| 사이드바 | 숨김 |
| Panel 3 | 날짜 선택 + 차량 선택 드롭다운 인라인 상단 노출. 입력 필드 풀폭, 폰트/패딩 확대 |
| 메모 | 글자수 카운터 (0/1000자) 노출 |

### 차량 카드 UI Spec

| 항목 | Spec |
|------|------|
| 카드 | border-radius:16px, border:1.5px solid gray-200, overflow:hidden |
| 이미지 영역 | margin:12px, border-radius:12px, aspect-ratio:16/10, object-fit:cover |
| 차량명 | font-weight:800, 15px |
| 번호판 | font-weight:500, gray-500, 14px |
| 배지 | 예약가능(blue pill) / 예약불가(gray pill), border-radius:20px |
| 하단 | 직전 등록 거리 라벨 + 값(font-weight:800), 상단 구분선 |
| Hover | border-color:primary, translateY(-2px), box-shadow |
| Selected | border-color:primary, box-shadow 3px ring |
