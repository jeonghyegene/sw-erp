# Work MD — 공통 레이아웃 및 네비게이션

## 0) Meta

| 항목 | 내용 |
|------|------|
| Work ID | WK-VRS-공통-000 |
| Date | 2026-04-29 (updated) |
| Sources | vehicle_reservation_app.html (2026-04-28, /차량예약/) |

---

## 1) Summary

### One-liner

사내 차량 예약 관리 시스템의 공통 레이아웃(헤더, 사이드바, 메인 영역)과 전역 컴포넌트(토스트, 모달, OffCanvas, 풀팝업)를 정의

### Goals

- 목표 1: 전체 화면에 일관된 레이아웃·네비게이션·컴포넌트 제공
- 목표 2: 데스크톱/모바일 반응형 대응

---

## 2) Terms

| Source term | Definition | Synonyms / Notes | Action | CommonRef |
|-------------|------------|------------------|--------|-----------|
| OffCanvas | 우측 슬라이드 인 패널 (width:500px) | 상세 보기용 | new | TERM-010 |
| 풀팝업 | 전체 화면 오버레이 팝업 (max-width:1500px) | 정비/운행이력 리스트용 | new | TERM-011 |
| 좌측 확장 패널 | OffCanvas 좌측에 인접하는 이미지 미리보기 패널 | oc-expand-panel | new | TERM-012 |
| 사진 Lightbox | 이미지 hover/클릭 시 전체 화면 확대 오버레이 | z-index:400 | new | TERM-013 |
| Toast | 하단 우측 일시 알림 메시지 (3초 후 자동 소멸) | - | new | TERM-014 |

---

## 전역 레이아웃 구조

```
┌─────────────────────────────────────────────────┐
│ app-header (56px, sticky top, z:100)            │
│  [로고/타이틀]                    [사용자 배지]   │
├─────────┬───────────────────────────────────────┤
│ sidebar │ main-content                          │
│ (220px) │  [page 영역 — SPA 방식 화면 전환]      │
│         │                                       │
│ 메뉴:   │                                       │
│ · 차량예약│                                       │
│ · 내 예약│                                       │
│ · 차량관리│                                       │
│ · 예외알림│                                       │
└─────────┴───────────────────────────────────────┘
```

---

## 사이드바 메뉴 구성

| 순서 | 메뉴명 | 페이지 ID | 아이콘 | 배지 |
|------|--------|----------|--------|------|
| 1 | 차량 예약 | page-reservation | 📅 | - |
| 2 | 내 예약 목록 | page-my-reservations | 📋 | - |
| 3 | 차량 관리 | page-vehicle-mgmt | 🚗 | - |
| 4 | 예외 알림 | page-alerts | ⚠️ | 미확인 건수 (빨간 배지) |

---

## 전역 컴포넌트

### Toast

| 항목 | Spec |
|------|------|
| 위치 | 하단 우측 (bottom:24px, right:24px) |
| 타입 | success(green), error(red), info(blue) |
| 소멸 | 3초 후 자동 제거 |
| z-index | 300 |

### OffCanvas (예약/정비/운행 상세)

| 항목 | Spec |
|------|------|
| 위치 | 우측 슬라이드 인 |
| 폭 | 500px (모바일: 100vw) |
| z-index | overlay:300, panel:301 |
| 구조 | header(타이틀+닫기) + body(스크롤) + footer(액션 버튼) |
| 카드 | oc-card — flex-shrink:0 (컨텐츠 잘림 방지) |

### 풀팝업

| 항목 | Spec |
|------|------|
| 오버레이 | 전체 화면, rgba(0,0,0,.35) |
| 컨텐츠 | max-width:1500px, max-height:90vh, overflow:auto |
| z-index | 250 |
| 페이지네이션 | 10건 단위, 5페이지 그룹 |

### 사진 Lightbox

| 항목 | Spec |
|------|------|
| 트리거 | 사진 hover (운행 상세) 또는 클릭 |
| z-index | 400 |
| 구조 | 전체 화면 오버레이 + 중앙 이미지 + 하단 캡션 |

---

## 디자인 시스템

### Color Tokens

| Token | Value | Usage |
|-------|-------|-------|
| --primary | #2563eb | 주요 액션, 링크, 선택 상태 |
| --primary-dark | #1d4ed8 | hover, 강조 텍스트 |
| --primary-light | #dbeafe | 배경, 배지 |
| --success | #16a34a | 완료, 정상 상태 |
| --warning | #d97706 | 경고, 주의 상태 |
| --danger | #dc2626 | 오류, 삭제, 예외 |
| --info | #0891b2 | 운행 중, 정보 |
| --gray-50~900 | 9단계 | 배경, 텍스트, 구분선 |

### Typography

| 용도 | Size | Weight |
|------|------|--------|
| 헤더 타이틀 | 18px | 700 |
| 카드 헤더 | 16px | 700 |
| 카드 제목 | 15-16px | 800 |
| 본문 | 14px | 400 |
| 라벨 | 11-13px | 600 |
| 힌트/캡션 | 10-12px | 400 |

### Radius

| 용도 | Radius |
|------|--------|
| 카드 | 16px |
| 카드 내 이미지 | 12px |
| 입력 필드 | 10-12px |
| 배지/pill | 20px |
| 테이블 이미지 | 10px |
| 버튼 | 6-14px |

---

## 반응형 Breakpoints

| Breakpoint | 적용 범위 |
|------------|----------|
| ≤768px | 모바일: 사이드바 숨김, 3패널→1컬럼, 폼 필드 풀폭, OffCanvas 100vw |
| ≤1000px | 태블릿: 내 예약 그리드 2컬럼 |
| ≤1400px | 소형 데스크톱: 내 예약 그리드 3컬럼 |
| >1400px | 대형 데스크톱: 내 예약 그리드 4컬럼 |

---

## 차량 기준 데이터

| Vehicle ID | 차량명 | 차량번호(plate) | 차종(type) | 대표색 | 운행상태(driveStatus) | 이미지 파일 |
|------------|--------|---------------|-----------|--------|---------------------|-----------|
| V001 | 쏘나타 | 12가3456 | 세단 | #3b82f6 | 운행가능 | sonata.avif → JPEG base64 |
| V002 | 카니발 | 34나5678 | SUV | #8b5cf6 | 운행가능 | carnival.avif → JPEG base64 |
| V003 | 스타리아 | 56다7890 | 밴 | #06b6d4 | 운행가능 | stria.avif → JPEG base64 |
| V004 | 아반떼 | 78라1234 | 세단 | #f59e0b | 운행가능 | avante.avif → JPEG base64 |

### 운행상태(driveStatus) 코드값

| 코드 | 명칭 | 예약 가능 여부 | 배지 스타일 | Notes |
|------|------|-------------|-----------|-------|
| 운행가능 | 운행가능 | ✅ 가능 | success(green) — ds-ok | 기본값 |
| 운행불가 | 운행불가 | ❌ 불가 | danger(red) — ds-off | 관리자 지정 |
| 정비중 | 정비중 | ❌ 불가 | warning(yellow) — ds-maint | 관리자 지정 |

### 이미지 처리 규칙

| 항목 | Spec |
|------|------|
| 원본 형식 | AVIF |
| 변환 | AVIF → JPEG (Pillow, 600px width, quality 75%) |
| 저장 | data:image/jpeg;base64 인라인 임베딩 |
| Fallback | SVG 차량 일러스트 (차종별 3종: 세단/SUV/밴) |
| 바인딩 | data-vehicle-src 속성 → bindVehicleImages() 지연 바인딩 |

---

## 사용자 기준 데이터

| User ID | 이름 | 부서 |
|---------|------|------|
| U001 | 윤성수 | 기획팀 |
| U002 | 김민수 | 개발팀 |
| U003 | 이지현 | 영업팀 |
| U004 | 박철호 | 경영지원팀 |
