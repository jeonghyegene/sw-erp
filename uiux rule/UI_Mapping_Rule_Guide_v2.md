# UI Mapping Rule Guide v2.0

> **버전**: v2.0.0  
> **작성일**: 2026-03-10  
> **상태**: 확정  
> **적용 대상**: 기획자 / 퍼블리셔 / 프론트엔드 개발자  
> **적용 시스템**: ERP / SCM / MES / Admin / Groupware

---

## 목차

1. [문서 목적 및 적용 범위](#1-문서-목적-및-적용-범위)
2. [용어 정의](#2-용어-정의)
3. [UI 구성 요소 (Component) 카탈로그](#3-ui-구성-요소-component-카탈로그)
4. [UI Pattern 카탈로그](#4-ui-pattern-카탈로그)
5. [UI 자동 매핑 결정 모델](#5-ui-자동-매핑-결정-모델)
6. [이벤트 기반 UI 행위 정의](#6-이벤트-기반-ui-행위-정의)
7. [정책/규칙 → UI 제어 매핑](#7-정책규칙--ui-제어-매핑)
8. [화면 간 흐름 (Navigation) 정의](#8-화면-간-흐름-navigation-정의)
9. [반응형 / 접근성 기준](#9-반응형--접근성-기준)
10. [예외 처리 및 Edge Case](#10-예외-처리-및-edge-case)
11. [사용성(Usability) 평가 기준](#11-사용성usability-평가-기준)
12. [화면 설계 템플릿](#12-화면-설계-템플릿)
13. [UI 결정 의사결정 트리](#13-ui-결정-의사결정-트리)
14. [UIUX Guide 코드 체계 매핑](#14-uiux-guide-코드-체계-매핑)
15. [부록](#15-부록)

---

## 1. 문서 목적 및 적용 범위

### 1.1 목적

본 문서는 업무 정의서(Work MD)에 정의된 업무 유형, 데이터 구조, 사용자 행동, 상태 흐름, 정책/규칙, 예외 처리를 **다차원 분석**하여 적합한 UI Pattern 및 Component 조합을 자동으로 결정하기 위한 표준 규칙을 정의한다.

기존 v1.0은 업무 유형 → UI Pattern의 1:1 단선 매핑에 머물렀으나, v2.0은 다음 확장을 포함한다.

| 차원 | v1.0 | v2.0 |
|------|------|------|
| 매핑 기준 | 업무 유형 단독 | 6차원 복합 조건 (업무유형+데이터+처리+행동+상태+Exception) |
| 구성 요소 | Pattern 18개 | Component 150+개 → Pattern 40+개 2단 구조 |
| 필드 타입 | 미정의 | 38개 Field-Level Component + 필드 타입 결정 매트릭스 |
| 이벤트 | 미정의 | 6분류 35+개 이벤트 유형 + 조건부/비동기 처리 |
| 상태 흐름 | 미정의 | State → UI 전환 매트릭스 |
| 정책 연동 | 미정의 | Local/Common Rules → UI 제어 변환 15패턴 |
| Exception | 미정의 | 6가지 처리 원칙 → 피드백 UI 시퀀스 |
| 권한 | 미정의 | Actor/Role → UI 요소별 표시/숨김/조건부 매트릭스 |
| 복합 화면 | 미지원 | Component 조합 + Variant 9유형 |
| Navigation | 미정의 | Journey → 화면 전환 규칙 + 계층 + Breadcrumb |
| 추적성 | 미정의 | 화면 ID ↔ Work MD ↔ Evidence 완전 추적 |

### 1.2 적용 범위

- 신규 화면 개발 시 UI Pattern 결정 및 Component 선택 기준
- 이벤트(조회/등록/수정/삭제/승인 등) 발생 시 화면 전환 규칙
- 정책/규칙에 따른 필드 제어 및 조건부 UI 규칙
- 기획자 ↔ 퍼블리셔 ↔ 개발자 간 협업 기준 문서
- **ERP 모듈**: 영업, 구매, 재고, 생산, 품질, 회계/정산
- **SCM/MES 모듈**: 생산계획, 작업지시, 실행, 모니터링
- **그룹웨어 모듈**: 전자결재, 공지사항, 게시판, 일정관리
- **Admin 시스템**: 사용자관리, 권한관리, 코드관리, 시스템설정

> ⚠️ B2C 고객 대면 서비스(쇼핑몰, 모바일 앱)는 별도 가이드를 참조한다.

### 1.3 선행 조건

| 조건 | 필수 여부 | 설명 |
|------|----------|------|
| Work MD 템플릿 v1.2 확정 | 필수 | 섹션 0~12 구조가 확정되어 있어야 함 |
| Common Rules 최신 버전 | 필수 | 전사 공통 규칙(개인정보, 감사로그, 세션 등) 정의 |
| Common Terms 최신 버전 | 필수 | 용어 표준화 선행 |
| 기존 시스템 화면 인벤토리 | 권장 | 역방향 검증 시 필요 |
| 디자인 시스템 (있는 경우) | 권장 | 기술 스택 독립이나 참조 가능 |

### 1.4 핵심 설계 원칙

**원칙 1: 업무 유형 단독으로 UI를 결정하지 않는다**  
업무 유형은 1차 필터일 뿐이다. 데이터 구조, 처리 방식, 사용자 역할, 상태 흐름, 정책 제약이 복합적으로 작용하여 최종 UI Pattern이 결정된다.

**원칙 2: 화면은 정적 구조와 동적 행위로 나누어 정의한다**  
정적 구조(레이아웃, 영역 배치)와 동적 행위(이벤트에 따른 화면 전환, 요소 표시/숨김, 데이터 갱신)를 분리하여 정의한다.

**원칙 3: 복합 화면은 구성 요소(Component)의 조합으로 표현한다**  
하나의 화면이 하나의 Pattern에 1:1 대응하지 않을 수 있다. Grid + Form + Popup이 결합된 복합 화면은 Component 조합으로 정의한다.

**원칙 4: 정책/규칙이 UI 행위를 제어한다**  
필드 활성화/비활성화, 버튼 표시/숨김, 입력값 제약 등은 Work MD의 Local Rules와 Common Rules에서 도출한다.

**원칙 5: Exception 처리 원칙이 피드백 UI를 결정한다**  
Work MD 섹션 6의 처리 원칙(BLOCK/RETRY/DEFER/COMPENSATE/FALLBACK/MANUAL)이 에러 상태의 UI 행위를 결정한다.

**원칙 6: 마스터 데이터가 입력 UI 타입을 강제한다**  
Master Data Values가 정의되고 선택 제약 규칙이 있으면 해당 필드는 반드시 Dropdown 또는 Lookup으로 제한한다.

**원칙 7: 화면 ID와 Work MD ID가 추적 가능해야 한다**  
모든 화면(SCR-XXX)은 Work MD(WK-XXX)로, 모든 UI 이벤트는 Action(AC-XXX)으로, 모든 UI 제어는 Rule(LR-XXX)로 역추적 가능해야 한다.

**원칙 8: 사용자 사용성(Usability)이 최우선이다**  
기술적 편의보다 사용자의 업무 효율, 학습 비용 최소화, 인지 부하 감소, 일관된 경험을 우선한다. 판별이 불분명한 경우 사용자에게 상황과 선택지를 제시한다.

### 1.5 UX Architecture 7단계 정렬

본 문서는 UX Architecture의 **Interface** 레이어에 위치한다.

```
목표(Goal) → 사람(Who) → 업무흐름(How) → 데이터(What) → 기능/UI(Interface) → 정책/규칙(Rule) → 연계(System) → 운영(Run)
                                                              ↑ 본 문서의 위치
```

| UX 단계 | Work MD 섹션 | UI 결정에 기여하는 정보 |
|---------|-------------|----------------------|
| Goal | 섹션 1 (Summary) Goals, Scope | 화면 목적, 범위 경계 |
| Who | 섹션 3 (Use Cases) Actor | 사용자 역할별 화면 분리/권한 기준 |
| How | 섹션 4 (Actions), 섹션 11 (Journeys) | 화면 흐름, 단계별 UI 전환, Action 시퀀스 |
| What | 섹션 9 (Business Objects), 섹션 10 (Relations) | 데이터 구조, 관계 → 레이아웃 결정 |
| Interface | **UI Pattern 결정** | **본 문서의 핵심 영역** |
| Rule | 섹션 5 (Local Rules), Common Rules | 입력 제약, 유효성 검증, 조건부 UI |
| System | 섹션 8 (Integrations) | 외부 데이터 로딩, Lookup, 비동기 처리 UI |
| Run | 섹션 6 (Exceptions), 섹션 7 (Risks) | 에러 UI, 모니터링, Exception 피드백 |

---

## 2. 용어 정의

### 2.1 핵심 용어

| 용어 | 영문 | 정의 |
|------|------|------|
| 업무 MD (Work MD) | Work MD | 화면 단위 업무 기능을 정의한 Markdown 명세 문서. 섹션 0~12로 구성 |
| 구성 요소 | Component | 화면을 구성하는 원자적 UI 요소. Grid, Form, Button, Field 등 |
| 패턴 | Pattern | Component의 표준 조합. 특정 업무 유형에 대응하는 화면 구성 단위 |
| 변형 | Variant | 동일 Pattern 내에서 조건(상태, 권한, 모드)에 따라 달라지는 변형 |
| 영역 | Zone | 화면 내의 논리적 영역 구분 (Search Area, Content Area 등) |
| 이벤트 | Event | 사용자 행위 또는 시스템 행위로 인한 상태/화면 변경 유발 요소 |
| 필드 제어 | Field Control | 필드의 표시/숨김, 활성/비활성, 필수/선택, 읽기전용 등 제어 |
| 상태 기반 UI | State-driven UI | 비즈니스 객체 상태에 따라 달라지는 UI 구성 |
| 트리거 | Trigger | 이벤트를 발생시키는 선행 조건 또는 사용자 액션 |
| 피드백 | Feedback | 시스템이 사용자에게 제공하는 응답 (Toast, Dialog, Message 등) |
| 네비게이션 | Navigation | 화면 간 이동 흐름 |
| 바인딩 | Binding | UI Component와 데이터 간의 연결 관계 |
| 인라인 편집 | Inline Edit | 별도 Form 전환 없이 Grid 셀 내에서 직접 편집하는 방식 |
| 룩업 | Lookup | 코드/데이터를 검색 팝업으로 선택하여 반환하는 행위 |
| 스켈레톤 | Skeleton UI | 데이터 로딩 중 레이아웃 형태를 미리 표시하는 플레이스홀더 |
| 빈 상태 | Empty State | 데이터가 없을 때 표시하는 안내 화면 |
| 부분 성공 | Partial Success | 일괄 처리 중 일부만 성공하고 일부 실패한 상태 |
| 가상 스크롤 | Virtual Scroll | 대량 데이터를 화면에 보이는 행만 렌더링하는 기법 |
| 의사결정 트리 | Decision Tree | 조건 분기를 따라 최종 결정에 도달하는 규칙 구조 |

### 2.2 UI Component 분류 체계

| 분류 코드 | 분류명 | 설명 | 예시 |
|----------|--------|------|------|
| LAYOUT | 레이아웃 | 화면 영역 배치 구조 | Search Area, Split Panel, Tab, Accordion |
| DISPLAY | 데이터 표시 | 데이터를 시각화하여 보여주는 요소 | Grid, Card, Chart, Timeline, Badge |
| INPUT | 입력 (Container) | 데이터 입력을 담는 컨테이너 | Form, Inline Edit Grid, File Upload |
| FIELD | 입력 필드 | 개별 데이터 입력 요소 | Text Input, DatePicker, Dropdown, Toggle |
| NAV | 탐색/선택 | 데이터 검색·선택·이동 요소 | Lookup Popup, Tree Select, Transfer List |
| FEEDBACK | 피드백/상태 | 시스템 응답·상태 표시 요소 | Toast, Alert, Validation, Progress |
| ACTION | 액션 | 사용자 행위 실행 요소 | Button, Toolbar, Context Menu |
| NAVIGATE | 네비게이션 | 화면 간 이동 요소 | Breadcrumb, Pagination, Side Menu |

### 2.3 업무 유형 코드 체계

| 유형 코드 | 업무 유형명 | 설명 | 주요 특징 |
|----------|-----------|------|---------|
| TYPE-01 | 목록 조회 | 다건 데이터 검색/조회 | 검색 필터 + Grid |
| TYPE-02 | 단건 조회 | 특정 항목 상세 확인 | ReadOnly Form/Detail |
| TYPE-03 | 등록 | 새로운 데이터 입력/저장 | Input Form |
| TYPE-04 | 수정 | 기존 데이터 변경/저장 | Input Form (일부 잠금) |
| TYPE-05 | 승인/반려 | 결재 및 상태 전이 | 다중 선택 + 사유 입력 |
| TYPE-06 | 업로드 | 파일/대량 데이터 입력 | File Upload + 미리보기 Grid |
| TYPE-07 | 다단계 처리 | 여러 단계의 복합 업무 | Wizard Step |
| TYPE-08 | 대시보드 | 요약 통계/현황 | 위젯 Grid, KPI Card |
| TYPE-09 | 설정/관리 | 시스템 환경 설정 | Master-Detail, Key-Value |
| TYPE-10 | 선택/검색 | 다른 화면에서 호출 | Lookup Popup |
| TYPE-11 | 이력/로그 | 변경/작업 이력 조회 | Timeline, Audit Trail |
| TYPE-12 | 모니터링 | 실시간 상태 확인 | Auto Refresh, KPI |
| TYPE-13 | 비교/분석 | 데이터 대조/분석 | Split View, Diff |
| TYPE-14 | 배치 작업 | 예약/자동 대량 처리 | Progress, Schedule |
| TYPE-15 | 인쇄/출력 | 리포트/문서 출력 | Print Preview |

> ⚠️ 삭제(Delete)는 독립 화면 유형이 아니다. 목록/상세 화면의 **이벤트(EVT-DEL)**로 처리한다.

### 2.4 상태(State) 코드 체계

| 상태 코드 | 상태명 | 색상 코드 (배경/텍스트) | 적용 업무 |
|---------|-------|---------------------|---------|
| `DRFT` | 임시저장 | `#FFF7ED` / `#D97706` | 기안, 발주, 전표 |
| `WAIT` | 대기 | `#FEF3C7` / `#D97706` | 결재대기, 처리대기 |
| `PROC` | 진행중 | `#DBEAFE` / `#2563EB` | 결재진행, 발주진행 |
| `APPR` | 승인 | `#DCFCE7` / `#16A34A` | 결재승인, 구매승인 |
| `DONE` | 완료 | `#DCFCE7` / `#16A34A` | 처리완료, 입고완료 |
| `REJC` | 반려 | `#FEE2E2` / `#DC2626` | 결재반려, 구매반려 |
| `HOLD` | 보류 | `#F3F4F6` / `#6B7280` | 보류처리 |
| `CNCL` | 취소 | `#F3F4F6` / `#6B7280` | 발주취소, 신청취소 |
| `EXPD` | 만료 | `#FEE2E2` / `#9CA3AF` | 계약만료, 세션만료 |

---

# Chapter 3. UI 구성 요소 (Component) 카탈로그

> **목적**: 화면을 구성하는 원자적 요소를 정의한다. Pattern은 이 요소들의 조합이다.  
> **작성 기준**: 각 구성 요소마다 ID, 명칭, 분류, 용도, 속성, 이벤트, 바인딩, 정책 제어 포인트를 정의한다.

---

## 3.1 레이아웃 요소 (COMP-LAYOUT)

| Component ID | 명칭 (영문/한글) | 용도 | 구성 속성 | 주요 이벤트 | Work MD 매핑 근거 |
|-------------|----------------|------|----------|-----------|-----------------|
| COMP-LAYOUT-001 | Search Area / 검색 조건 영역 | 검색 필터 입력 + 조회/초기화 버튼 영역 | 필드 배치(2~4열), 접기/펼치기, 초기값 | 조회 클릭, 초기화, 조건 변경 | 섹션 4 Actions에 Search 존재 시 |
| COMP-LAYOUT-002 | Content Area / 본문 영역 | Grid, Form 등 주요 콘텐츠 배치 영역 | 너비(Full/Split), 스크롤 여부 | 데이터 로딩, 갱신 | 모든 화면에 필수 |
| COMP-LAYOUT-003 | Split Panel / 분할 영역 | 좌우 또는 상하로 2개 영역을 분할 | 분할 방향, 비율(4:8 등), 리사이즈 | 영역 선택, 리사이즈 | 섹션 10 Relations에 1:N 존재 시 |
| COMP-LAYOUT-004 | Tab Panel / 탭 영역 | 다중 콘텐츠를 탭으로 분리 표시 | 탭 수, 탭 라벨, 활성 탭, 동적 탭 여부 | 탭 전환, 탭 닫기 | 섹션 9 Objects 2개 이상(독립) |
| COMP-LAYOUT-005 | Sidebar / 사이드바 | 좌측 또는 우측 고정 패널 (메뉴, 필터) | 너비, 접기/펼치기, 고정 여부 | 토글, 메뉴 선택 | 설정/관리(TYPE-09) |
| COMP-LAYOUT-006 | Wizard Step / 단계 영역 | 단계별 진행 콘텐츠 표시 | Step 수, 현재 Step, Step 라벨 | Step 이동, 유효성 검증 | 섹션 11 Journey가 3+ Step |
| COMP-LAYOUT-007 | Accordion / 아코디언 | 접기/펼치기 가능한 섹션 그룹 | 섹션 수, 멀티 열림 여부, 기본 상태 | 섹션 토글 | 상세 정보가 그룹핑 필요 시 |
| COMP-LAYOUT-008 | Drawer / 서랍 패널 | 화면 가장자리에서 슬라이드하여 나오는 패널 | 방향(좌/우/하), 너비/높이, Dimmed | 열기, 닫기, ESC | 상세 조회 시 컨텍스트 유지 |
| COMP-LAYOUT-009 | Header / Title Bar / 헤더 | 화면 상단 제목 + 상태 배지 + 부가 정보 | 제목, 부제, 상태 Badge, 액션 | - | 모든 화면에 필수 |
| COMP-LAYOUT-010 | Footer / 푸터 | 화면 하단 요약 정보 또는 고정 액션 | 요약 정보, 고정 버튼 | - | Form/Detail에서 총합 표시 시 |
| COMP-LAYOUT-011 | Sticky Bar / 고정 바 | 스크롤 시에도 상단/하단 고정되는 영역 | 위치(상/하), 고정 조건 | 스크롤 감지 | 긴 Form의 액션 버튼 고정 |
| COMP-LAYOUT-012 | Section Divider / 구분선 | 논리적 영역 간 시각적 구분 | 스타일(실선/점선), 라벨 여부 | - | Form 내 Fieldset 구분 |
| COMP-LAYOUT-013 | Responsive Container / 반응형 컨테이너 | 브레이크포인트별 레이아웃 전환 | 브레이크포인트, 열 수 | 리사이즈 | 모든 화면에 내재 |
| COMP-LAYOUT-014 | Card Container / 카드 컨테이너 | 카드형 콘텐츠를 그리드 배치 | 카드 수, 열 수, 간격 | 카드 클릭 | 대시보드(TYPE-08) |
| COMP-LAYOUT-015 | Modal Container / 모달 컨테이너 | 배경 Dimmed + 전면 레이어 | 크기, 닫기 방식, 중첩 허용 | 열기, 닫기, ESC | Popup Pattern 시 |

---

## 3.2 데이터 표시 요소 (COMP-DISPLAY)

| Component ID | 명칭 | 용도 | 구성 속성 | 주요 이벤트 | Work MD 매핑 근거 |
|-------------|------|------|----------|-----------|-----------------|
| COMP-DISPLAY-001 | Data Grid / 데이터 그리드 | 다건 데이터 목록 표시 | 컬럼 정의, 페이징, 정렬, 필터, 체크박스, 행 높이 | 행 클릭, 더블클릭, 체크, 정렬, 페이지 | 섹션 9 Objects가 목록형 |
| COMP-DISPLAY-002 | Tree Grid / 트리 그리드 | 계층 데이터 트리+그리드 복합 | 계층 컬럼, 들여쓰기, 펼치기/접기 | 노드 토글, 노드 선택, 드래그 | 섹션 10 Self-referencing 관계 |
| COMP-DISPLAY-003 | Detail View / 상세 보기 | 단건 데이터 읽기 전용 표시 | 필드 배치(Label:Value), 그룹핑 | - | TYPE-02 단건 조회 |
| COMP-DISPLAY-004 | Card List / 카드 목록 | 카드형 목록 표시 | 카드 구성, 열 수, 정렬 | 카드 클릭, 더보기 | 모바일 대응 또는 시각화 필요 시 |
| COMP-DISPLAY-005 | Summary Panel / 요약 패널 | 핵심 지표 요약 (KPI) | 지표 수, 레이아웃, 색상 코드 | 클릭 시 상세 이동 | TYPE-08 대시보드 |
| COMP-DISPLAY-006 | Timeline / 타임라인 | 시간 순서 이벤트 표시 | 정렬 방향, 이벤트 유형, 아이콘 | 이벤트 클릭 | 이력 데이터 존재 시 |
| COMP-DISPLAY-007 | Chart / 차트 | 데이터 시각화 (Bar, Line, Pie, Area, Donut, Scatter, Combo, Radar, Treemap, Heatmap, Funnel, Waterfall, Gauge) | 차트 타입, 축 정의, 범례, 색상 | 데이터 포인트 클릭, 줌, 호버 | TYPE-08 대시보드 |
| COMP-DISPLAY-008 | Status Indicator / 상태 표시 | 상태 뱃지/Pill (색상 코드) | 상태값 매핑, 색상 매핑, 크기 | - | 섹션 9 States 존재 시 |
| COMP-DISPLAY-009 | KPI Tile / KPI 타일 | 단일 지표 (수치 + 변화량 + 트렌드) | 값, 단위, 변화율, 아이콘, 색상 | 클릭 시 상세 | TYPE-08 대시보드 |
| COMP-DISPLAY-010 | Description List / 항목-값 리스트 | Key-Value 쌍 표시 | 항목 수, 열 수, 정렬 | - | 단건 상세(TYPE-02) |
| COMP-DISPLAY-011 | Tag / Badge / 태그·뱃지 | 분류 태그, 수량 뱃지 | 텍스트, 색상, 크기, 제거 가능 여부 | 태그 클릭, 제거 | 분류/카테고리 표시 |
| COMP-DISPLAY-012 | Avatar / User Info / 사용자 정보 | 사용자 이름, 부서, 역할 표시 | 이미지, 이름, 부서, 상태 | 클릭 시 프로필 | 담당자 표시 |
| COMP-DISPLAY-013 | Image / Thumbnail / 이미지 | 이미지/썸네일 표시 | 크기, 비율, 대체 텍스트, 확대 | 클릭 시 확대 | 제품 이미지, 도면 등 |
| COMP-DISPLAY-014 | File List / 첨부파일 목록 | 파일 목록 표시 + 다운로드 | 파일명, 크기, 유형, 업로드일 | 다운로드, 삭제, 미리보기 | 섹션 9에 File 속성 존재 시 |
| COMP-DISPLAY-015 | Diff View / 변경 비교 | 변경 전/후 비교 표시 | 좌우 분할, 변경 하이라이트 | - | 이력 비교 필요 시 |
| COMP-DISPLAY-016 | Approval History / 승인 이력 | 승인선, 의견, 시간 이력 표시 | 승인 단계, 승인자, 의견, 시간 | 단계 클릭 | TYPE-05 승인 시 |
| COMP-DISPLAY-017 | Audit Trail / 변경 이력 | 누가, 언제, 무엇을 변경 로그 | 시간, 사용자, 변경 필드, 전/후 값 | 필터, 상세 | Common Rules 감사 로그 |
| COMP-DISPLAY-018 | Progress Bar / 진행률 | 진행률 표시 바 | 현재값, 최대값, 색상, 라벨 | - | 배치 처리, 업로드 |
| COMP-DISPLAY-019 | Stepper Indicator / 단계 표시 | 단계별 진행 상태 | 전체 단계, 현재 단계, 완료 상태 | 단계 클릭 | TYPE-07 다단계 |
| COMP-DISPLAY-020 | Empty State / 빈 상태 | 데이터 없음 안내 | 아이콘, 메시지, 액션 버튼 | 액션 클릭 | 조회 결과 0건 |
| COMP-DISPLAY-021 | Skeleton Loader / 스켈레톤 | 로딩 중 뼈대 표시 | 형태(Grid, Form, Card), 행 수 | - | 데이터 로딩 |
| COMP-DISPLAY-022 | Tooltip / 툴팁 | 마우스 오버 시 부가 정보 | 위치, 지연시간, 최대 너비 | 마우스 진입/이탈 | 필드 도움말 |
| COMP-DISPLAY-023 | Popover / 팝오버 | 클릭 시 부가 정보 패널 | 크기, 위치, 닫기 방식 | 클릭 토글 | 상세 미리보기 |
| COMP-DISPLAY-024 | Notification Badge / 알림 뱃지 | 알림 카운트 표시 | 숫자, 최대값(99+), 색상 | 클릭 | 알림/결재 대기 건수 |
| COMP-DISPLAY-025 | Gantt Chart / 간트 차트 | 일정/공정 타임라인 | 작업 목록, 기간, 의존관계 | 드래그, 줌, 클릭 | 생산계획, 프로젝트 |
| COMP-DISPLAY-026 | Map View / 지도 | 지도 기반 위치 표시 | 좌표, 마커, 영역 | 마커 클릭, 줌, 이동 | 물류, 배송 추적 |
| COMP-DISPLAY-027 | Print Preview / 인쇄 미리보기 | 인쇄 최적화 레이아웃 미리보기 | 용지 크기, 방향, 여백 | 인쇄, 닫기 | TYPE-15 인쇄/출력 |
| COMP-DISPLAY-028 | Calendar View / 달력 보기 | 달력 기반 일정/이벤트 표시 | 보기 모드(월/주/일), 이벤트 | 날짜 클릭, 이벤트 클릭, 드래그 | 일정 관리 |
| COMP-DISPLAY-029 | Kanban Board / 칸반 보드 | 상태별 컬럼 카드 배치 | 컬럼(상태), 카드 구성, 드래그 | 카드 드래그, 클릭 | 상태 기반 업무 |
| COMP-DISPLAY-030 | Carousel / 캐러셀 | 슬라이드형 콘텐츠 순환 | 슬라이드 수, 자동 재생, 인디케이터 | 이전/다음, 인디케이터 클릭 | 이미지 갤러리, 배너 |
| COMP-DISPLAY-031 | Video Player / 비디오 | 비디오 재생 | 소스, 자동 재생, 컨트롤 | 재생, 일시정지, 시간 이동 | 교육, 매뉴얼 |
| COMP-DISPLAY-032 | Gallery / 갤러리 | 이미지/파일 갤러리 그리드 | 컬럼 수, 썸네일 크기, 라이트박스 | 이미지 클릭, 확대, 이동 | 제품 이미지, 도면 |
| COMP-DISPLAY-033 | Typography / 타이포그래피 | 텍스트 계층 구조 표시 | 제목(H1~H6), 본문, 캡션, 인용 | - | 콘텐츠 페이지 |

---

## 3.3 입력 요소 — Container Level (COMP-INPUT)

| Component ID | 명칭 | 용도 | 구성 속성 | 주요 이벤트 | Work MD 매핑 근거 |
|-------------|------|------|----------|-----------|-----------------|
| COMP-INPUT-001 | Input Form / 입력 폼 | 단일/다중 필드 입력 컨테이너 | 필드 배치(열 수), Fieldset, 유효성 규칙 | Submit, Reset, 필드 Change | 섹션 4 Actions에 Create/Update |
| COMP-INPUT-002 | Inline Edit Grid / 인라인 편집 그리드 | Grid 셀 내 직접 편집 | 편집 가능 컬럼, 행 추가/삭제, 유효성 | 셀 클릭, 값 변경, 행 추가/삭제 | 상세 품목 입력 (1:N Detail) |
| COMP-INPUT-003 | File Upload Area / 파일 업로드 | 드래그앤드롭 파일 업로드 영역 | 허용 확장자, 최대 크기, 다중 여부 | 파일 선택, 드래그, 업로드 시작/완료/실패 | TYPE-06 업로드 |
| COMP-INPUT-004 | Rich Text Editor / WYSIWYG 편집기 | 서식 있는 텍스트 편집 | 툴바 구성, 이미지 삽입, 최대 길이 | 내용 변경, 이미지 삽입 | 공지사항, 게시판 |
| COMP-INPUT-005 | Multi-Row Add Form / 동적 행 폼 | 동적으로 행 추가/삭제 가능한 폼 | 최대 행 수, 필드 구성, 순서 변경 | 행 추가, 행 삭제, 행 이동 | 섹션 5 "최대 N개" 제약 |
| COMP-INPUT-006 | Code Editor / 코드 편집기 | 코드/스크립트 입력 (하이라이팅) | 언어, 행 번호, 자동완성 | 내용 변경, 실행 | 시스템 설정(수식, SQL) |
| COMP-INPUT-007 | Signature Pad / 서명 패드 | 전자 서명 입력 | 크기, 색상, 지우기 | 서명 완료, 지우기 | 계약, 검수 |
| COMP-INPUT-008 | Comment / Note Area / 의견 영역 | 의견·메모 입력 + 이력 표시 | 입력 폼, 이력 목록, 답글 | 등록, 수정, 삭제 | 섹션 4 Actions에 Comment |

---

## 3.4 입력 필드 타입 — Field Level (COMP-FIELD)

### 3.4.1 텍스트/숫자 입력

| Component ID | 명칭 | 용도 | 데이터 타입 | 속성 | 유효성 기본 규칙 |
|-------------|------|------|-----------|------|---------------|
| COMP-FIELD-001 | Text Input / 텍스트 입력 | 50자 이내 단문 입력 | String | maxLength, placeholder, prefix, suffix | 필수 검사, 길이 검사 |
| COMP-FIELD-002 | Textarea / 다행 텍스트 | 50자 초과 장문 입력 | String | maxLength, rows, 자동 높이 | 필수 검사, 길이 검사 |
| COMP-FIELD-003 | Number Input / 숫자 입력 | 정수/소수 입력 | Number | min, max, step, 소수점 자릿수 | 범위 검사, 형식 검사 |
| COMP-FIELD-004 | Currency Input / 통화 입력 | 금액 입력 (천단위 콤마, 우측 정렬) | Number | 통화 기호, 소수점, 음수 허용 | 범위 검사, 형식 자동 포맷 |
| COMP-FIELD-005 | Email Input / 이메일 입력 | 이메일 형식 | String | 도메인 제한 | 이메일 형식 검사 |
| COMP-FIELD-006 | Phone Input / 전화번호 입력 | 전화번호 (자동 하이픈) | String | 국가 코드, 자동 포맷 | 전화번호 형식 검사 |
| COMP-FIELD-007 | URL Input / URL 입력 | URL 형식 | String | 프로토콜 포함 | URL 형식 검사 |
| COMP-FIELD-008 | Password Input / 비밀번호 | 비밀번호 (마스킹) | String | 강도 표시, 눈 토글 | 강도 검사, 일치 검사 |

### 3.4.2 날짜/시간 입력

| Component ID | 명칭 | 용도 | 속성 | 유효성 기본 규칙 |
|-------------|------|------|------|---------------|
| COMP-FIELD-009 | Date Picker / 날짜 선택 | 단일 날짜 선택 | 최소일, 최대일, 비활성 날짜, 형식 | 범위 검사 |
| COMP-FIELD-010 | Date Range Picker / 기간 선택 | 시작일~종료일 | 최소 간격, 최대 간격, 빠른 선택 | 시작 ≤ 종료 검사 |
| COMP-FIELD-011 | Time Picker / 시간 선택 | 시/분 선택 | 간격(15분/30분), 24H/12H | 범위 검사 |
| COMP-FIELD-012 | DateTime Picker / 날짜+시간 | 날짜+시간 복합 선택 | 날짜 속성 + 시간 속성 | 복합 범위 검사 |

### 3.4.3 선택 입력

| Component ID | 명칭 | 용도 | 사용 조건 | 속성 |
|-------------|------|------|---------|------|
| COMP-FIELD-013 | Dropdown Select / 드롭다운 | 단일 선택 (선택지 4~10개) | 고정 목록, 중간 크기 | 옵션 목록, 기본값, placeholder |
| COMP-FIELD-014 | Multi Select / 다중 선택 | 복수 선택 허용 | 여러 항목 동시 선택 | 옵션 목록, 최대 선택 수, 태그 표시 |
| COMP-FIELD-015 | Combobox / 콤보박스 | 검색 가능한 드롭다운 (11~30개) | 검색+선택 복합 | 옵션 목록, 검색 지원, 자동완성 |
| COMP-FIELD-016 | Radio Button Group / 라디오 | 단일 선택 (2~3개) | 소수 선택지 | 옵션 목록, 방향(가로/세로) |
| COMP-FIELD-017 | Checkbox / 체크박스 | 단일 Boolean 선택 | 동의, 사용여부 | 라벨, 기본값 |
| COMP-FIELD-018 | Checkbox Group / 체크박스 그룹 | 다중 선택 | 여러 항목 중 복수 선택 | 옵션 목록, 최소/최대 선택, 방향 |
| COMP-FIELD-019 | Toggle Switch / 토글 | On/Off 이진 설정 | Boolean (Active/Inactive) | 라벨(On/Off), 크기 |
| COMP-FIELD-020 | Slider / 슬라이더 | 연속 값 범위 선택 | 범위 값 | min, max, step, 눈금 표시 |
| COMP-FIELD-021 | Range Slider / 범위 슬라이더 | 최소~최대 범위 선택 | 이중 범위 | min, max, step, 간격 제약 |
| COMP-FIELD-022 | Star Rating / 별점 | 평점 입력 | 평가 | 최대 값, 반개 허용, 크기 |
| COMP-FIELD-023 | Color Picker / 색상 선택 | 색상 값 선택 | 색상 지정 | 팔레트, 자유선택, 형식(HEX/RGB) |
| COMP-FIELD-024 | Segmented Control / 세그먼트 | 2~5개 옵션 토글 선택 (버튼형) | 뷰 모드 전환 | 옵션 목록, 기본값, 크기 |

### 3.4.4 파일 입력

| Component ID | 명칭 | 용도 | 속성 |
|-------------|------|------|------|
| COMP-FIELD-025 | File Input / 파일 선택 | 단일 파일 선택 | 허용 확장자, 최대 크기 |
| COMP-FIELD-026 | Multi File Input / 다중 파일 | 다중 파일 선택 | 허용 확장자, 최대 크기, 최대 개수 |
| COMP-FIELD-027 | Image Upload / 이미지 업로드 | 이미지 업로드 + 미리보기 | 허용 형식, 크기 제한, 크롭 |

### 3.4.5 검색/연동 입력

| Component ID | 명칭 | 용도 | 속성 | 연동 패턴 |
|-------------|------|------|------|----------|
| COMP-FIELD-028 | Lookup Field / 룩업 필드 | 검색 팝업 연동 (코드+명칭) | 팝업 ID, 반환 필드, 표시 형식 | 클릭 → Popup → 선택 → 자동 채움 |
| COMP-FIELD-029 | Auto-Complete Field / 자동완성 | 입력 시 자동 제안 | API, 최소 입력 길이, 최대 결과 | 입력 → API → 드롭다운 → 선택 |
| COMP-FIELD-030 | Address Input / 주소 입력 | 우편번호 검색 연동 | 우편번호, 기본주소, 상세주소 | 검색 → 팝업 → 선택 → 분리 입력 |

### 3.4.6 특수 입력

| Component ID | 명칭 | 용도 | 속성 |
|-------------|------|------|------|
| COMP-FIELD-031 | Masked Input / 마스킹 입력 | 형식 제한 입력 (사업자번호, 주민번호) | 마스크 패턴, 구분자 |
| COMP-FIELD-032 | Hidden Field / 숨겨진 필드 | 시스템 값 저장 (화면 비노출) | 기본값, 자동 설정 |
| COMP-FIELD-033 | Read-Only Field / 읽기 전용 | 값 표시만 (입력 불가) | 표시 형식, 복사 가능 여부 |
| COMP-FIELD-034 | Calculated Field / 자동 계산 | 다른 필드 기반 자동 계산 값 표시 | 계산식, 종속 필드 |
| COMP-FIELD-035 | Conditional Field / 조건부 필드 | 조건에 따라 표시/숨김 전환 | 표시 조건, 기본 상태 |
| COMP-FIELD-036 | Dependent Field / 종속 필드 | 상위 필드 값에 따라 옵션 변경 | 상위 필드 ID, 종속 API |
| COMP-FIELD-037 | Tag Input / 태그 입력 | 자유 태그 입력 (자동완성 지원) | 기존 태그, 최대 개수, 자유 입력 허용 |
| COMP-FIELD-038 | OTP Input / OTP 입력 | N자리 분리 일회용 비밀번호 | 자릿수, 자동 포커스 이동 |
| COMP-FIELD-039 | CAPTCHA / 자동입력 방지 | 봇 방지 인증 | 유형(이미지/reCAPTCHA) |

---

## 3.5 탐색/선택 요소 (COMP-NAV)

| Component ID | 명칭 | 용도 | 구성 속성 | 주요 이벤트 |
|-------------|------|------|----------|-----------|
| COMP-NAV-001 | Lookup Popup / 검색 팝업 | 데이터 검색 후 선택 반환 | 검색 조건, Grid, 단일/다중 선택, 반환 필드 | 검색, 행 선택, 확인, 취소 |
| COMP-NAV-002 | Tree Select / 트리 선택 | 계층 구조 선택 (조직, 카테고리) | 트리 데이터, 단일/다중 선택, 검색 | 노드 토글, 선택, 검색 |
| COMP-NAV-003 | Transfer List / 이동 선택 | 좌→우 항목 이동 선택 | 좌 목록, 우 목록, 검색, 전체선택 | 항목 이동, 검색, 정렬 |
| COMP-NAV-004 | Cascading Select / 계층 드롭다운 | 단계별 종속 선택 (시/군/구) | 레벨 수, 레벨별 데이터 | 상위 선택 → 하위 갱신 |
| COMP-NAV-005 | Recent / Favorite / 최근·즐겨찾기 | 최근 사용/즐겨찾기 목록 | 최대 개수, 정렬 | 항목 선택, 즐겨찾기 토글 |
| COMP-NAV-006 | Search Suggest / 글로벌 검색 | 글로벌 검색 + 자동 제안 | 검색 범위, 카테고리, 최근 검색 | 입력, 제안 선택, 검색 실행 |

---

## 3.6 피드백/상태 요소 (COMP-FEEDBACK)

| Component ID | 명칭 | 용도 | 유형 | 자동 소멸 | 사용자 중단 |
|-------------|------|------|------|---------|-----------|
| COMP-FEEDBACK-001 | Toast / Snackbar / 토스트 | 일시적 알림 | Success / Warning / Error / Info | O (3~5초, Error 제외) | 없음 |
| COMP-FEEDBACK-002 | Confirm Dialog / 확인 대화 | 비가역적 처리 전 확인 | 예/아니오, 위험 확인 | X | 있음 (작업 차단) |
| COMP-FEEDBACK-003 | Alert Dialog / 경고 대화 | 에러/경고 안내 (확인만) | 정보, 경고, 에러 | X | 있음 (확인 필수) |
| COMP-FEEDBACK-004 | Progress Indicator / 진행 표시 | 로딩·진행 상태 | Spinner / Bar / Skeleton | - | 부분적 |
| COMP-FEEDBACK-005 | Validation Message / 유효성 메시지 | 필드 단위 인라인 오류/안내 | Error / Warning / Success / Info | X | 없음 |
| COMP-FEEDBACK-006 | Form Error Summary / 폼 에러 요약 | 폼 전체 오류 목록 | 오류 필드 목록 + 카운트 | X | 없음 |
| COMP-FEEDBACK-007 | Empty State / 빈 상태 | 데이터 없음 안내 + 액션 유도 | 조건/데이터 없음 | X | 없음 |
| COMP-FEEDBACK-008 | Error State / 에러 상태 | 에러 발생 안내 + 재시도 유도 | 네트워크/서버/권한 | X | 없음 |
| COMP-FEEDBACK-009 | Success State / 성공 상태 | 완료 성공 안내 | 등록/수정/삭제 완료 | X | 없음 |
| COMP-FEEDBACK-010 | Warning Banner / 경고 배너 | 영역 상단 경고 | 데이터 경고, 시스템 안내 | X | 없음 |
| COMP-FEEDBACK-011 | Info Banner / 정보 배너 | 정보 안내 | 공지, 가이드 | X | 닫기 가능 |
| COMP-FEEDBACK-012 | Inline Help / 인라인 도움말 | 필드 옆 도움말 아이콘+설명 | 마우스 오버 또는 클릭 | - | 없음 |
| COMP-FEEDBACK-013 | Notification Panel / 알림 패널 | 알림 목록 | 전체/안읽음, 카테고리 | X | 없음 |
| COMP-FEEDBACK-014 | System Message / 시스템 메시지 | 전역 긴급 메시지 | 점검, 긴급 알림 | X | 없음 |
| COMP-FEEDBACK-015 | Countdown Timer / 카운트다운 | 남은 시간 표시 | 세션 만료, 처리 제한 | 자동 트리거 | 없음 |
| COMP-FEEDBACK-016 | Unsaved Warning / 미저장 경고 | 미저장 변경 이탈 방지 | 페이지 이탈 시 | X | 있음 |
| COMP-FEEDBACK-017 | Offline Indicator / 오프라인 표시 | 네트워크 연결 상태 | 배너 형태 | 연결 시 자동 해제 | 없음 |

---

## 3.7 액션 요소 (COMP-ACTION)

| Component ID | 명칭 | 용도 | 속성 | 배치 위치 |
|-------------|------|------|------|---------|
| COMP-ACTION-001 | Primary Button / 주요 버튼 | 핵심 액션 (저장, 등록, 확인) | `#2563EB` 배경, `#FFFFFF` 텍스트 | Form 하단 우측, 팝업 Footer 우측 |
| COMP-ACTION-002 | Secondary Button / 보조 버튼 | 보조 액션 (취소, 목록) | `#64748B` 배경, `#FFFFFF` 텍스트 | Primary 좌측 |
| COMP-ACTION-003 | Danger Button / 위험 버튼 | 위험 액션 (삭제, 반려) | `#DC2626` 배경, `#FFFFFF` 텍스트 | Primary와 분리 배치 |
| COMP-ACTION-004 | Ghost Button / 고스트 버튼 | 부가 액션 | `transparent` 배경, `#2563EB` 텍스트 | 보조적 위치 |
| COMP-ACTION-005 | Link Button / 링크 버튼 | 페이지 이동, 상세 보기 | `none` 배경, `#2563EB` 텍스트, underline hover | Grid 셀 내, 인라인 |
| COMP-ACTION-006 | Icon Button / 아이콘 버튼 | 편집, 삭제, 복사, 다운로드 | 아이콘만, 호버 시 배경 | Grid 행 우측, Toolbar |
| COMP-ACTION-007 | Action Button Group / 액션 그룹 | 관련 버튼 모음 | 간격, 정렬, 크기 통일 | Grid 상단, Form 하단 |
| COMP-ACTION-008 | Toolbar / 도구 모음 | 아이콘+텍스트 도구 모음 | 구분선, 그룹핑 | 화면 상단 |
| COMP-ACTION-009 | Context Menu / 우클릭 메뉴 | 우클릭 시 액션 목록 | 메뉴 항목, 아이콘, 비활성화 | Grid 행 우클릭 |
| COMP-ACTION-010 | Bulk Action Bar / 일괄 액션 바 | 다중 선택 시 하단 고정 액션 | 선택 건수, 액션 목록 | Grid 하단 (선택 시) |
| COMP-ACTION-011 | Floating Action Button / FAB | 우하단 부유 버튼 | 아이콘, 색상, 확장 메뉴 | 우하단 고정 |
| COMP-ACTION-012 | Dropdown Button / 드롭다운 버튼 | 버튼+드롭다운 (Split) | 기본 액션 + 추가 옵션 | Toolbar, 액션 그룹 |
| COMP-ACTION-013 | Export Button / 내보내기 | 엑셀/PDF/CSV 다운로드 | 형식 선택, 범위 선택 | Grid 상단 우측 |
| COMP-ACTION-014 | Print Button / 인쇄 | 인쇄 실행 | 미리보기 여부 | Grid 상단 우측 |
| COMP-ACTION-015 | Quick Action / 행 내 즉시 액션 | 행 우측 즉시 실행 버튼 | 아이콘, 툴팁 | Grid 행 마지막 컬럼 |

### 버튼 크기 기준

| 크기 | 높이 | 수평 패딩 | 폰트 | 용도 |
|------|------|---------|------|------|
| Large | 44px | 16px | 15px | Form 하단 주요 액션 |
| Medium | 36px | 12px | 14px | Grid 상단 일반 |
| Small | 28px | 8px | 12px | Grid 셀 내 인라인 |

### 버튼 계층 규칙

1. **Primary 버튼은 한 화면에 최대 1개**
2. Modal/Popup Footer: 우측 정렬, 주요 액션이 맨 우측
3. Form 하단: `[저장(Primary)]` `[취소(Secondary)]` `[삭제(Danger)]`
4. Grid 상단 좌측: 등록, 업로드 등 생성 액션
5. Grid 상단 우측: 엑셀 다운로드, 인쇄 등 보조 액션

### 버튼 상태

| 상태 | 시각 표현 | 설명 |
|------|---------|------|
| Default | 정상 색상 | 기본 |
| Hover | 배경색 진하게 | 마우스 오버 |
| Active | 배경색 더 진하게 | 클릭 중 |
| Disabled | `opacity: 0.4`, `cursor: not-allowed` | 비활성화 |
| Loading | Spinner 아이콘 + Disabled | API 처리 중 |

---

## 3.8 네비게이션 요소 (COMP-NAVIGATE)

| Component ID | 명칭 | 용도 | 구성 속성 | 주요 이벤트 |
|-------------|------|------|----------|-----------|
| COMP-NAVIGATE-001 | Breadcrumb / 경로 표시 | 현재 위치 계층 경로 | 경로 항목, 구분자, 현재 위치 | 항목 클릭 |
| COMP-NAVIGATE-002 | Side Menu / 좌측 메뉴 | 좌측 메뉴 네비게이션 | 메뉴 계층, 접기/펼치기, 활성 항목 | 메뉴 클릭, 토글 |
| COMP-NAVIGATE-003 | Top Menu / 상단 메뉴 | 상단 메뉴 네비게이션 | 메뉴 항목, 하위 메뉴, Mega Menu | 메뉴 클릭, 호버 |
| COMP-NAVIGATE-004 | Navbar / 네비게이션 바 | 상단 고정 전역 네비게이션 | 로고, 메뉴, 사용자 정보, 알림 | 메뉴 클릭, 프로필 |
| COMP-NAVIGATE-005 | Pagination / 페이지네이션 | 페이지 이동 | 현재 페이지, 총 페이지, 페이지당 건수 | 페이지 변경, 건수 변경 |
| COMP-NAVIGATE-006 | Infinite Scroll / 무한 스크롤 | 스크롤 시 추가 데이터 로딩 | 트리거 지점, 로딩 상태 | 스크롤 트리거 |
| COMP-NAVIGATE-007 | Back Button / 뒤로 가기 | 이전 화면 복귀 | 대상 화면, 라벨 | 클릭 |
| COMP-NAVIGATE-008 | Step Navigator / 단계 이동 | 이전/다음 단계 이동 | 전체 단계, 현재 단계, 비활성 단계 | 이전, 다음, 단계 클릭 |
| COMP-NAVIGATE-009 | Anchor Link / 앵커 링크 | 페이지 내 특정 영역 이동 | 대상 영역 ID | 클릭 |
| COMP-NAVIGATE-010 | Quick Navigation / 빠른 이동 | 섹션 목차형 이동 | 섹션 목록, 현재 위치 | 섹션 클릭 |
| COMP-NAVIGATE-011 | Tabs / 탭 | 탭 형태 네비게이션 | 탭 항목, 활성 탭, 배지 | 탭 클릭 |

---

## 3.9 확장 Component 참조

### 인증/계정 관련 (COMP-AUTH)

| Component ID | 명칭 | 용도 | 적용 화면 |
|-------------|------|------|---------|
| COMP-AUTH-001 | Login Form / 로그인 폼 | 사용자 인증 입력 | 로그인 페이지 |
| COMP-AUTH-002 | Register Form / 가입 폼 | 회원 가입 입력 | 회원가입 페이지 |
| COMP-AUTH-003 | Password Reset / 비밀번호 재설정 | 비밀번호 변경/재설정 | 비밀번호 찾기 |
| COMP-AUTH-004 | Lock Screen / 잠금 화면 | 세션 잠금 후 재인증 | 잠금 화면 |
| COMP-AUTH-005 | 2FA / MFA Input / 다중 인증 | 2단계 인증 코드 입력 | 2차 인증 |
| COMP-AUTH-006 | Profile Card / 프로필 카드 | 사용자 프로필 정보 | 프로필 페이지 |

### 페이지/레이아웃 관련 (COMP-PAGE)

| Component ID | 명칭 | 용도 | 적용 화면 |
|-------------|------|------|---------|
| COMP-PAGE-001 | Maintenance Page / 점검 안내 | 시스템 점검 중 안내 | 점검 페이지 |
| COMP-PAGE-002 | Error 404 Page / 404 페이지 | 페이지 미발견 | 에러 페이지 |
| COMP-PAGE-003 | Error 500 Page / 500 페이지 | 서버 오류 | 에러 페이지 |
| COMP-PAGE-004 | Pricing Table / 가격표 | 요금제/플랜 비교 | 가격 페이지 |
| COMP-PAGE-005 | FAQ Accordion / FAQ | 자주 묻는 질문 | FAQ 페이지 |
| COMP-PAGE-006 | Notification Page / 알림 목록 | 알림 전체 목록 | 알림 페이지 |
| COMP-PAGE-007 | Treeview Page / 트리뷰 | 트리 구조 전체 화면 | 조직도, 카테고리 |
| COMP-PAGE-008 | Starter Page / 시작 화면 | 빈 시작 화면 템플릿 | 초기 화면 |
| COMP-PAGE-009 | Email Template / 이메일 템플릿 | 이메일 발송 템플릿 | 이메일 작성 |

### 아이콘/멀티미디어 (COMP-MEDIA)

| Component ID | 명칭 | 용도 |
|-------------|------|------|
| COMP-MEDIA-001 | Icon Set / 아이콘 세트 | 시스템 전역 아이콘 (Line/Solid/Outline) |
| COMP-MEDIA-002 | Illustration / 일러스트 | Empty State, 에러 페이지 등에 사용하는 일러스트 |

---

# Chapter 4. UI Pattern 카탈로그

> **목적**: Component의 표준 조합인 Pattern을 정의한다. 각 Pattern은 특정 업무 유형·데이터 구조의 조합에 대응한다.

---

## 4.1 단일 목적 Pattern

### P-001 Search List (검색 + 목록 조회)

**적용 조건**: 업무 유형 TYPE-01(목록 조회), 단일 엔티티, 다건 조회

```
┌──────────────────────────────────────┐
│ [Zone A] Header / Title Bar          │
│  화면명 + Breadcrumb                  │
├──────────────────────────────────────┤
│ [Zone B] Search Area                 │
│  검색 조건 입력 [조회] [초기화]        │
│  [접기/펼치기]                        │
├──────────────────────────────────────┤
│ [Zone C] Action Bar                  │
│  좌: [등록] [삭제]  우: [엑셀] [인쇄]  │
├──────────────────────────────────────┤
│ [Zone D] Data Grid                   │
│  총 N건 | 페이지당 건수               │
│  컬럼 정렬 | 필터 | 체크박스(선택적)  │
├──────────────────────────────────────┤
│ [Zone E] Pagination                  │
│  < 1 2 3 4 5 >                       │
└──────────────────────────────────────┘
```

| Zone | Component | 이벤트 | 조건부 표시 |
|------|-----------|--------|-----------|
| A | COMP-LAYOUT-009, COMP-NAVIGATE-001 | - | 항상 |
| B | COMP-LAYOUT-001, COMP-FIELD-* | 검색, 초기화 | 항상 |
| C | COMP-ACTION-007 | 등록, 삭제, 내보내기 | 권한별 버튼 차이 |
| D | COMP-DISPLAY-001 | 행 클릭, 정렬, 필터 | 항상 |
| E | COMP-NAVIGATE-005 | 페이지 변경 | 항상 |

**Variant**: Bulk (GRID-04 + COMP-ACTION-010)

---

### P-002 Simple Form (단건 등록/수정)

**적용 조건**: TYPE-03(등록) 또는 TYPE-04(수정), 단일 엔티티, 속성 20개 이하

```
┌──────────────────────────────────────┐
│ [Zone A] Header / Title Bar          │
│  화면명 + 상태 Badge(수정 시)         │
├──────────────────────────────────────┤
│ [Zone B] Form Area                   │
│  [Fieldset 1] 기본 정보              │
│  Label | Input  | Label | Input      │
│  Label | Input  | Label | Input      │
│  ─────────────────────────────       │
│  [Fieldset 2] 상세 정보              │
│  Label | Input  | Label | Input      │
├──────────────────────────────────────┤
│ [Zone C] Action Bar (Sticky)         │
│  [저장(Primary)] [취소] [삭제(조건부)] │
└──────────────────────────────────────┘
```

| Zone | Component | 이벤트 | 조건부 표시 |
|------|-----------|--------|-----------|
| A | COMP-LAYOUT-009, COMP-DISPLAY-008 | - | 항상 (Badge는 수정 시) |
| B | COMP-INPUT-001, COMP-FIELD-* | Change, Blur(유효성) | 항상 |
| C | COMP-ACTION-007, COMP-LAYOUT-011 | 저장, 취소, 삭제 | 삭제는 수정 모드 + 권한 |

**Variant**: Read-Only (TYPE-02 단건 조회 시 모든 필드 ReadOnly)

---

### P-003 Detail View (단건 상세 조회)

**적용 조건**: TYPE-02(단건 조회), 읽기 전용

```
┌──────────────────────────────────────┐
│ [Zone A] Header                      │
│  화면명 + 상태 Badge + [수정] [인쇄]  │
├──────────────────────────────────────┤
│ [Zone B] Detail Area                 │
│  항목명 : 값  |  항목명 : 값          │
│  항목명 : 값  |  항목명 : 값          │
├──────────────────────────────────────┤
│ [Zone C] Tab Area (선택적)           │
│  [이력] [첨부파일] [관련 데이터]      │
├──────────────────────────────────────┤
│ [Zone D] Action Bar                  │
│  [목록] [수정] [삭제] [인쇄]          │
└──────────────────────────────────────┘
```

---

### P-004 Grid Management (그리드 기반 관리)

**적용 조건**: TYPE-09(설정/관리), 단일 엔티티, 인라인 편집 적합

```
┌──────────────────────────────────────┐
│ [Zone A] Header                      │
├──────────────────────────────────────┤
│ [Zone B] Action Bar                  │
│  [행 추가] [행 삭제] [저장] [초기화]  │
├──────────────────────────────────────┤
│ [Zone C] Inline Edit Grid            │
│  셀 클릭 → 직접 편집                 │
│  행 추가/삭제 가능                    │
├──────────────────────────────────────┤
│ [Zone D] Footer                      │
│  총 N건 | 변경 N건                    │
└──────────────────────────────────────┘
```

---

### P-005 Config / Settings (설정/환경 관리)

**적용 조건**: TYPE-09(설정), Key-Value 형태

```
┌──────────────────────────────────────┐
│ [Zone A] Header                      │
├──────────┬───────────────────────────┤
│ [Zone B] │ [Zone C] Setting Form     │
│ Category │ Key1 : Value1             │
│ Menu     │ Key2 : Value2             │
│ (Tree/   │ Key3 : Value3             │
│  List)   │                           │
│          │ [저장] [초기화]             │
└──────────┴───────────────────────────┘
```

---

## 4.2 복합 목적 Pattern

### P-010 Search + Detail (목록 + 상세)

**적용 조건**: TYPE-01 + TYPE-02 복합, 단일 엔티티, 목록 조회 후 상세 확인 필요

```
┌──────────────────────────────────────┐
│ [Zone A] Header / Breadcrumb         │
├──────────────────────────────────────┤
│ [Zone B] Search Area                 │
├──────────────────────────────────────┤
│ [Zone C] Action Bar                  │
├──────────────────────────────────────┤
│ [Zone D] Data Grid                   │
│  행 클릭 → Detail 열림              │
├──────────────────────────────────────┤
│ [Zone E] Pagination                  │
└──────────────────────────────────────┘

        ↓ 행 클릭 이벤트

┌──────────────────────────────────────┐
│ [Zone F] Detail Popup / Drawer       │
│  상세 정보 (Tab 가능)                │
│  [Zone F-1] 승인 이력 (조건부)       │
│  [Zone F-2] 첨부파일 (조건부)        │
│  [수정] [삭제] [인쇄] [닫기]          │
└──────────────────────────────────────┘
```

**Happy Path**: 검색 → Grid 표시 → 행 클릭 → Detail Popup → 확인 → 닫기  
**Exception Path**: 검색 → 0건 → Empty State → 조건 초기화/등록 유도

---

### P-011 Search + Form (목록 + 등록/수정)

**적용 조건**: TYPE-01 + TYPE-03/04 복합 (관리 CRUD), 같은 화면에서 조회 + 입력 전환

```
[목록 모드]                           [편집 모드]
┌────────────────────┐                ┌────────────────────┐
│ Search Area        │                │ Form Area          │
│ Grid               │   ←→ 전환      │  입력 필드          │
│ [등록] 클릭 시     │                │  [저장] [취소]      │
└────────────────────┘                └────────────────────┘
```

---

### P-012 Master-Detail (마스터 + 종속 상세)

**적용 조건**: 데이터 구조 1:N, Master Grid + Detail Grid/Form

```
┌──────────────────────────────────────┐
│ [Zone A] Header                      │
├──────────────────────────────────────┤
│ [Zone B] Search Area (Master)        │
├──────────────────────────────────────┤
│ [Zone C] Master Grid                 │
│  행 클릭 → Detail 갱신              │
├──────────────────────────────────────┤
│ [Zone D] Detail Area                 │
│  ┌──────────────────────────────┐   │
│  │ Detail Grid / Form           │   │
│  │ [행 추가] [행 삭제] [저장]   │   │
│  └──────────────────────────────┘   │
└──────────────────────────────────────┘
```

| Zone | Component | 데이터 | 이벤트 |
|------|-----------|--------|--------|
| C | COMP-DISPLAY-001 (GRID-03) | Master 목록 | 행 클릭 → Detail 갱신 |
| D | COMP-INPUT-002 또는 COMP-DISPLAY-001 | Detail 목록 (1:N) | 행 추가/삭제/편집 |

**Variant**: 
- Read-Only (조회 전용)
- Editable (Detail 인라인 편집)
- Expandable (행 펼치기 Sub-Grid)

---

### P-013 Multi-Tab Detail (상세 내 다중 탭)

**적용 조건**: 등록/수정(TYPE-03/04), 속성 20개 이상 또는 독립 엔티티 2개 이상

```
┌──────────────────────────────────────┐
│ [Zone A] Header + Status Badge       │
├──────────────────────────────────────┤
│ [Zone B] Tab Navigation              │
│  [기본정보] [상세정보] [관련데이터]    │
├──────────────────────────────────────┤
│ [Zone C] Active Tab Content          │
│  Form / Grid (탭별 상이)             │
├──────────────────────────────────────┤
│ [Zone D] Action Bar (Sticky)         │
│  [저장] [취소] [삭제]                 │
└──────────────────────────────────────┘
```

---

### P-014 Wizard Form (단계별 입력)

**적용 조건**: TYPE-07(다단계), Journey 3+ Step, 단계별 유효성 검증

```
┌──────────────────────────────────────┐
│ [Zone A] Header                      │
├──────────────────────────────────────┤
│ [Zone B] Step Indicator              │
│  ① 기본정보 → ② 상세정보 → ③ 확인  │
├──────────────────────────────────────┤
│ [Zone C] Step Content                │
│  현재 Step의 입력 Form               │
├──────────────────────────────────────┤
│ [Zone D] Step Navigation             │
│  [이전] [임시저장]       [다음/완료]  │
└──────────────────────────────────────┘
```

| Step 유형 | 화면 구성 | 버튼 |
|---------|---------|------|
| 입력 Step | Input Form | 이전, 다음, 임시저장, 취소 |
| 확인 Step | ReadOnly Summary | 이전, 완료 |
| 완료 Step | Success State | 목록이동, 연관화면 |

---

### P-015 Split View (좌우/상하 분할 동시 조회)

**적용 조건**: TYPE-09 + TYPE-02/04 복합, Master-Detail 좌우 분할

```
┌──────────────────────────────────────┐
│ [Zone A] Header                      │
├──────────┬───────────────────────────┤
│ [Zone B] │ [Zone C] Detail/Edit      │
│ List     │ 선택 항목의 상세/편집     │
│ Grid     │                           │
│ (4col)   │ (8col)                    │
│          │ [저장] [삭제]              │
└──────────┴───────────────────────────┘
```

---

### P-016 Nested Master-Detail (3단계 계층)

**적용 조건**: 데이터 1:N:N 관계 (3단계 이상)

```
┌──────────────────────────────────────┐
│ [Zone A] Level 1 Grid                │
│  행 클릭 → Level 2 갱신             │
├──────────────────────────────────────┤
│ [Zone B] Level 2 Grid                │
│  행 클릭 → Level 3 갱신             │
├──────────────────────────────────────┤
│ [Zone C] Level 3 Grid / Form         │
└──────────────────────────────────────┘
```

---

### P-017 Cross-Reference View (N:N 관계 매핑)

**적용 조건**: 데이터 M:N 관계, 중간 매핑 관리

```
┌──────────────────────────────────────┐
│ [Zone A] Header                      │
├──────────┬───────────────────────────┤
│ [Zone B] │ [Zone C] Assigned List    │
│ Available│ (우측: 할당된 항목)        │
│ List     │                           │
│ (좌측)   │  [← 제거]  [추가 →]       │
└──────────┴───────────────────────────┘
```

---

## 4.3 특수 목적 Pattern

### P-020 Approval Process (승인/결재)

**적용 조건**: TYPE-05(승인/반려), State Transition 필수

```
┌──────────────────────────────────────┐
│ [Zone A] Header + Status Badge       │
├──────────────────────────────────────┤
│ [Zone B] Document Detail             │
│  기안 내용 (ReadOnly)                │
├──────────────────────────────────────┤
│ [Zone C] Approval Line               │
│  결재선: 기안자 → 1차 → 2차 → 최종  │
│  각 단계 상태 + 의견                 │
├──────────────────────────────────────┤
│ [Zone D] Comment Area                │
│  승인/반려 의견 입력                  │
├──────────────────────────────────────┤
│ [Zone E] Action Bar                  │
│  [승인] [반려] [보류] [회수]          │
└──────────────────────────────────────┘
```

**상태별 UI**:

| State | 화면 모드 | 활성 버튼 | 비활성 필드 | 표시 영역 |
|-------|----------|----------|-----------|----------|
| DRFT | 편집 | 저장, 상신, 삭제 | - | 편집 Form |
| WAIT | 읽기전용 | 회수(기안자만) | 모든 필드 | Document + 결재선 |
| PROC | 읽기전용+승인자 편집 | 승인, 반려 | 모든 필드(의견 제외) | Document + 결재선 + 의견 |
| APPR | 완전 읽기전용 | 인쇄, 복사 | 모든 필드 | 전체 이력 |
| REJC | 편집 복귀 | 수정, 재상신 | - | 편집 Form + 반려 사유 |

---

### P-021 Dashboard (통계/KPI)

**적용 조건**: TYPE-08(대시보드), 읽기 전용 통계

```
┌──────────────────────────────────────────────┐
│ [Zone A] Header + 기간 선택 + 새로고침       │
├────────────┬────────────┬────────────────────┤
│ KPI Card   │ KPI Card   │ KPI Card           │
│ (span-4)   │ (span-4)   │ (span-4)           │
├────────────┴────────────┼────────────────────┤
│ Chart Widget (span-6)   │ Chart Widget (6)   │
├─────────────────────────┴────────────────────┤
│ Data Grid Widget (span-12)                   │
└──────────────────────────────────────────────┘
```

---

### P-022 Excel Upload (대량 등록)

**적용 조건**: TYPE-06(업로드), 파일 기반 대량 데이터

```
┌──────────────────────────────────────┐
│ [Zone A] Header                      │
├──────────────────────────────────────┤
│ [Zone B] Upload Area                 │
│  [양식 다운로드] [파일 선택/드래그]   │
├──────────────────────────────────────┤
│ [Zone C] Validation Result           │
│  성공 N건 / 오류 N건                 │
├──────────────────────────────────────┤
│ [Zone D] Preview Grid                │
│  업로드 데이터 미리보기               │
│  오류 행 하이라이트 (빨간 배경)       │
├──────────────────────────────────────┤
│ [Zone E] Action Bar                  │
│  [저장] [취소]                        │
└──────────────────────────────────────┘
```

---

### P-023 Bulk Action Grid (일괄 처리)

**적용 조건**: 다건 선택 + 일괄 상태 변경/삭제

```
┌──────────────────────────────────────┐
│ [Zone A~C] = P-001과 동일            │
├──────────────────────────────────────┤
│ [Zone D] Multi-Select Grid           │
│  ☑ 전체선택 | 컬럼 | 컬럼 | 컬럼    │
│  ☑ Row 1                            │
│  ☐ Row 2                            │
│  ☑ Row 3                            │
├──────────────────────────────────────┤
│ [Zone F] Bulk Action Bar (Sticky)    │
│  3건 선택 | [상태변경] [삭제] [취소]  │
└──────────────────────────────────────┘
```

---

### P-024 Lookup Popup (선택용 검색 팝업)

**적용 조건**: TYPE-10(선택), 다른 화면에서 호출

```
┌──────────────────────────────────────┐
│ Popup Header              [X]        │
├──────────────────────────────────────┤
│ Search Area                          │
│  검색 조건 + [조회]                  │
├──────────────────────────────────────┤
│ Data Grid                            │
│  단일선택 (Radio) 또는 다중 (Check)   │
├──────────────────────────────────────┤
│ Pagination                           │
├──────────────────────────────────────┤
│ Footer          [취소] [선택(Primary)]│
└──────────────────────────────────────┘
```

---

### P-025 Calendar View (일정/스케줄)

**적용 조건**: 날짜 기반 데이터 관리 (일정, 생산 스케줄)

```
┌──────────────────────────────────────┐
│ [Zone A] Header + 보기 전환          │
│  [월] [주] [일] + < 2026년 3월 >     │
├──────────────────────────────────────┤
│ [Zone B] Calendar Grid               │
│  월/주/일 보기 + 이벤트 표시         │
│  날짜 클릭 → 등록                    │
│  이벤트 클릭 → 상세                  │
│  드래그 → 날짜 변경                  │
└──────────────────────────────────────┘
```

---

### P-026 Kanban Board (상태 기반 카드)

**적용 조건**: 상태 전이가 핵심인 업무, 시각적 상태 관리

```
┌──────────────────────────────────────────┐
│ [Zone A] Header + 필터                   │
├──────────┬───────────┬───────────┬───────┤
│ 대기     │ 진행중    │ 검토중    │ 완료  │
│ ┌──────┐ │ ┌──────┐ │ ┌──────┐ │       │
│ │Card 1│ │ │Card 3│ │ │Card 5│ │       │
│ └──────┘ │ └──────┘ │ └──────┘ │       │
│ ┌──────┐ │ ┌──────┐ │         │       │
│ │Card 2│ │ │Card 4│ │         │       │
│ └──────┘ │ └──────┘ │         │       │
│          │          │         │       │
│ 드래그 → │ → 드래그  │         │       │
└──────────┴───────────┴───────────┴───────┘
```

---

### P-027 Comparison View (비교/대조)

**적용 조건**: TYPE-13(비교/분석), 2건 이상 데이터 대조

```
┌──────────────────────────────────────┐
│ [Zone A] Header                      │
├──────────────────────────────────────┤
│ [Zone B] Selection Bar               │
│  대상 A: [선택] | 대상 B: [선택]      │
├──────────┬───────────────────────────┤
│ [Zone C] │ [Zone D]                  │
│ 항목 A   │ 항목 B                    │
│ 상세     │ 상세                      │
│          │                           │
│ 차이점 하이라이트                     │
└──────────┴───────────────────────────┘
```

---

### P-028 History / Audit Trail (변경 이력)

**적용 조건**: TYPE-11(이력/로그), 이력 데이터

```
┌──────────────────────────────────────┐
│ [Zone A] Header + 기간 필터          │
├──────────────────────────────────────┤
│ [Zone B] Timeline / Audit Grid       │
│  시간 | 사용자 | 변경 내용 | 전→후   │
├──────────────────────────────────────┤
│ [Zone C] Detail (선택 시)            │
│  변경 전/후 비교 (Diff View)         │
└──────────────────────────────────────┘
```

---

### P-029 Monitoring Dashboard (실시간 모니터링)

**적용 조건**: TYPE-12(모니터링), 자동 갱신

P-021 Dashboard와 유사하되 **Auto Refresh**, **Alert**, **Status Card**가 추가됨

---

### P-030 Report Viewer (리포트/출력물)

**적용 조건**: TYPE-15(인쇄/출력)

```
┌──────────────────────────────────────┐
│ [Zone A] Header + [인쇄] [PDF]       │
├──────────────────────────────────────┤
│ [Zone B] Report Parameter            │
│  조건 입력 + [생성]                  │
├──────────────────────────────────────┤
│ [Zone C] Report Preview              │
│  인쇄 최적화 레이아웃                │
└──────────────────────────────────────┘
```

---

### P-031 Batch Job Monitor (배치 작업)

**적용 조건**: TYPE-14(배치), 예약/자동 처리

---

### P-032 Tree Management (트리 구조 관리)

**적용 조건**: 계층 구조(Self-ref), 조직도, 카테고리

```
┌──────────────────────────────────────┐
│ [Zone A] Header                      │
├──────────┬───────────────────────────┤
│ [Zone B] │ [Zone C] Detail/Edit      │
│ Tree     │ 선택 노드의 상세/편집     │
│ (Drag &  │                           │
│  Drop    │ [저장] [삭제]              │
│  지원)   │ [하위 추가]               │
└──────────┴───────────────────────────┘
```

---

## 4.4 Popup / Modal Pattern

| Pattern ID | 명칭 | 크기 | 용도 | 닫기 방식 |
|-----------|------|------|------|---------|
| P-040 | Info Popup | 600~900px | 정보 표시 (읽기 전용) | X, ESC |
| P-041 | Edit Popup | 600~900px | 편집 Form 포함 | X, 취소, ESC |
| P-042 | Confirm Popup | 400px | 확인/선택 (예/아니오) | 취소, ESC (POP-01 제외) |
| P-043 | Multi-Step Popup | 900px | 단계별 Wizard 내장 | X, 취소 |
| P-044 | Preview Popup | 900~1200px | 미리보기 (문서, 이미지) | X, ESC |
| P-045 | Nested Popup | - | 팝업 내 팝업 (최대 2단계) | 내부 먼저 닫기 |

**Popup 공통 규칙**:
- Header: 제목 + X(닫기) 버튼
- Body: 스크롤 가능 영역
- Footer: 액션 버튼 우측 정렬 (주요 액션 맨 우측)
- 배경 Dimmed (`rgba(0,0,0,0.5)`)
- **최대 2 depth** — 3단계 이상 시 화면 분리 검토

---

## 4.5 Pattern Variant 정의

| Variant 유형 | 적용 조건 | 설명 | 추가 Component |
|-------------|----------|------|---------------|
| Read-Only | 조회 전용 모드 | 편집 Component 비활성화 | COMP-FIELD-033 |
| Editable | 편집 가능 모드 | 인라인 편집 또는 Form 활성화 | COMP-INPUT-002 |
| Bulk | 일괄 처리 모드 | 체크박스 + Bulk Action Bar | COMP-ACTION-010 |
| State-Driven | 상태에 따라 UI 변화 | 상태별 버튼/필드 제어 | COMP-DISPLAY-008 |
| Role-Based | 역할에 따라 UI 변화 | 역할별 표시/숨김 매트릭스 | - |
| Expandable | 확장 가능 행 | Grid 행 펼치기 Sub-Grid | COMP-LAYOUT-007 |
| Draggable | 순서 변경 가능 | Drag & Drop 행 이동 | - |
| Print-Optimized | 인쇄 최적화 | 인쇄 시 레이아웃 변형 | COMP-DISPLAY-027 |
| Compact | 좁은 화면 대응 | 컬럼 축소, 카드 전환 | COMP-DISPLAY-004 |

---

## 4.6 업무 유형별 주요 버튼 조합

| 업무 유형 | 필수 버튼 | 선택 버튼 |
|---------|---------|---------|
| TYPE-01 목록 조회 | [조회] [등록] | [엑셀] [인쇄] |
| TYPE-02 단건 조회 | [수정] [목록] | [삭제] [인쇄] [복사] |
| TYPE-03 등록 | [저장] [취소] | [임시저장] |
| TYPE-04 수정 | [저장] [취소] | [삭제] [이력] |
| TYPE-05 승인/반려 | [승인] [반려] | [보류] [상세] |
| TYPE-06 업로드 | [파일선택] [업로드] [저장] | [양식 다운로드] |
| TYPE-07 다단계 | [다음] [이전] [완료] [취소] | [임시저장] |
| TYPE-08 대시보드 | [기간선택] [새로고침] | [전체보기] |
| TYPE-09 설정/관리 | [저장] [초기화] | [추가] [삭제] |

---

# Chapter 5. UI 자동 매핑 결정 모델

> **목적**: Work MD의 정보를 입력으로 받아 UI Pattern을 결정하는 다차원 규칙을 정의한다.  
> **결정 우선순위**: Popup 여부 → 특수 업무 → 데이터 구조 → 업무 유형+처리 방식 → 사용자 행동+상태 → Exception

---

## 5.1 1차 분류: 업무 유형 (Work MD 섹션 1, 3, 4 기반)

### 업무 유형 판별 기준

Work MD 섹션 1(Summary), 섹션 3(Use Cases), 섹션 4(Actions)에서 키워드를 추출하여 업무 유형을 판별한다.

| 업무 유형 | 판별 키워드 (Work MD Actions/Summary) | 복합 판별 |
|----------|--------------------------------------|----------|
| 조회 | "Search", "View", "List", "조회", "검색", "목록" | 단독 또는 관리의 일부 |
| 상세 | "Detail", "Get", "상세", 단건 대상 | 조회의 하위 |
| 등록 | "Create", "Register", "Insert", "등록", "생성", "추가" | 단독 또는 관리의 일부 |
| 수정 | "Update", "Edit", "Modify", "수정", "변경", "편집" | 단독 또는 관리의 일부 |
| 삭제 | "Delete", "Remove", "삭제", "제거" | 이벤트로 처리 (독립 화면 아님) |
| 관리 | 동일 대상 CRUD 중 2개 이상 존재 | CRUD 통합 |
| 승인 | "Approve", "Reject", "Submit", "결재", "승인", "반려", "상신" | State Transition 필수 동반 |
| 업로드 | "Upload", "Import", "일괄등록", "대량 입력" | 파일 기반 |
| 통계 | "분석", "통계", "집계", "리포트", "Report", "Analytics" | 읽기 전용 |
| 모니터링 | "실시간", "모니터링", "현황", "대시보드", "Dashboard" | Timer/Auto Refresh |
| 선택 | 다른 화면에서 호출 (Integration Direction=in) | Popup 형태 |
| 설정 | "설정", "환경", "Config", "Setting", Key-Value | 보통 단독 |
| 배치 | "Batch", "Schedule", "자동", "예약", System Actor | 모니터링 동반 |
| 비교 | "비교", "대조", "Compare", "Diff" | 2건 이상 |
| 이력 | "이력", "로그", "History", "Audit", "Trail" | 읽기 전용 |

> ⚠️ **복합 판별**: 하나의 화면에 2개 이상 업무 유형이 존재할 수 있다. 이 경우 복합 Pattern(P-010~P-017)을 검토한다.

---

## 5.2 2차 분류: 데이터 구조 (Work MD 섹션 9, 10 기반)

### 데이터 구조 판별 기준

| 데이터 구조 | 판별 기준 (Work MD) | UI 영향 |
|------------|---------------------|---------|
| 단일 엔티티 | Business Objects 1개, 주 엔티티만 사용 | Form/Grid 단일 |
| 다중 엔티티 (독립) | Objects 2개+, Relations에 직접 관계 없음 | Tab 분리 후보 |
| Master-Detail (1:N) | Relations에 1:N 관계 | Master Grid + Detail Grid |
| 다단계 계층 (1:N:N) | 1:N 관계 2단계 이상 | Nested Grid / 3단 Split |
| 계층 구조 (Self-ref) | 자기 참조 관계 | Tree 필수 |
| N:N 관계 | M:N 관계 (중간 매핑 테이블) | Transfer List / Cross-Ref |
| 마스터 데이터 | Master Data Values 서브섹션 존재 | Dropdown/Lookup 강제 |
| 이력 데이터 | 생성일시, 변경일시, 생성자 등 감사 속성 | Timeline / Audit Trail |

### 마스터 데이터 → 입력 UI 결정 규칙

| Master Data Values 개수 | 입력 UI Component | 판별 불명 시 사용자 질문 |
|------------------------|-------------------|----------------------|
| Boolean (2개: Yes/No, Active/Inactive) | COMP-FIELD-019 Toggle Switch | - |
| 2~3개 | COMP-FIELD-016 Radio Button Group | - |
| 4~10개 | COMP-FIELD-013 Dropdown Select | - |
| 11~30개 | COMP-FIELD-015 Combobox (검색 가능) | - |
| 31개 이상 | COMP-NAV-001 Lookup Popup | - |
| 불명확 | - | "해당 항목의 선택 가능한 값은 몇 개 수준입니까? (3개 이하 / 4~10개 / 10~30개 / 30개 초과)" |

### 속성 수 → Form 크기 판별

| Attributes 수 | Form 구성 | Pattern |
|-------------|----------|---------|
| 1~5개 | Popup Form | P-041 Edit Popup |
| 6~12개 | Simple Form (1~2 Fieldset) | P-002 Simple Form |
| 13~20개 | Multi-Section Form | P-002 (3+ Fieldset) |
| 21개 이상 | Multi-Tab Form | P-013 Multi-Tab Detail |

---

## 5.3 3차 분류: 처리 방식 (Work MD 섹션 4, 5 기반)

| 처리 방식 | 판별 기준 | UI 영향 |
|----------|----------|---------|
| 단건 | Actions 대상 데이터가 단일 건 | Form 기반 |
| 다건 조회 | 목록 조회 후 선택 | Grid 기반 |
| 다건 편집 | 복수 건 개별 편집 | Inline Edit Grid (COMP-INPUT-002) |
| 일괄 | 복수 건 선택 후 한 번에 처리 | Bulk Action (COMP-ACTION-010) |
| 단계별 | Journey 3+ Step, 중간 저장 필요 | Wizard (COMP-LAYOUT-006) |
| 자동 | System Actor, 자동 생성/계산 | 결과 표시 + Progress |
| 예약 | 예약/스케줄 처리 | Calendar 또는 DateTime 입력 |
| 비동기 | Integration에 비동기 연동 | Progress + Notification |

---

## 5.4 4차 분류: 사용자 행동 (Work MD 섹션 3, 11 기반)

| 사용자 행동 | 판별 기준 | UI 영향 |
|------------|----------|---------|
| 탐색 중심 | Journey 대부분 조회/검색 Step | Search Area 강화, 필터 다양화 |
| 입력 중심 | Journey 대부분 데이터 입력 Step | Form 최적화, Tab 순서 |
| 판단/승인 | 의사결정 분기점, State Transition에 승인/반려 | Approval History, 의견 |
| 비교/분석 | Actions에 비교, 분석, 대조 키워드 | Split View, Diff |
| 모니터링 | 반복적 상태 확인 | 자동 갱신, KPI Tile |
| 외부 연동 | Integration 3개 이상 | 연동 상태 표시, 비동기 피드백 |

---

## 5.5 5차 분류: 상태 흐름 (Work MD 섹션 9 States 기반)

| 상태 복잡도 | 판별 기준 | UI 영향 |
|------------|----------|---------|
| 무상태 | States 미정의 | 상태 표시 불필요 |
| 단순 (2~3 상태) | States 2~3개, 선형 전이 | 상태 뱃지 + 기본 버튼 제어 |
| 복잡 (4+ 상태) | States 4개+, 분기 전이 | 상태별 UI 전체 분기 필요 |
| 병렬 상태 | 독립 상태 축 2개 이상 | 복합 상태 표시기 |
| 상태별 Action 제어 | Transition에 Condition 존재 | 상태→버튼/필드 활성화 매트릭스 |
| 상태별 화면 구조 변경 | 특정 상태에서 Zone 자체 추가/제거 | Variant 분기 |

---

## 5.6 6차 분류: Exception 처리 유형 (Work MD 섹션 6 기반)

| Exception 처리 원칙 | UI 피드백 패턴 |
|-------------------|---------------|
| BLOCK | Alert Dialog → 해당 Action 취소 → 이전 상태 유지 |
| RETRY | Error State + 재시도 버튼 → N회 초과 시 MANUAL 전환 |
| DEFER | Toast (대기 알림) → Status Indicator 변경 → 조건 충족 시 Notification |
| COMPENSATE | Confirm Dialog (보상 확인) → Progress → Toast (완료) |
| FALLBACK | Info Banner (대체 처리 안내) → 대체 기능 실행 → Toast |
| MANUAL | Alert (운영자 확인) → Notification 발송 → 화면 잠금/대기 |

---

## 5.7 복합 조건 결정 매트릭스

### 결정 우선순위 흐름

```
0순위: Popup 여부 (다른 화면에서 호출? → P-040~P-045)
1순위: 특수 업무 유형 (승인/모니터링/업로드/선택/배치/설정)
       → 해당 특수 Pattern 직행
2순위: 데이터 구조 (Master-Detail, 계층, N:N, 다단계)
       → 데이터 구조가 레이아웃 강제
3순위: 업무 유형 + 처리 방식 조합
       → 일반 Pattern 결정
4순위: 사용자 행동 + 상태 복잡도
       → Variant 결정
5순위: Exception 유형
       → 피드백 UI 구성
```

### 매트릭스

| 업무 유형 | 데이터 구조 | 처리 방식 | 결정 Pattern | Variant | Exception UI |
|----------|------------|----------|-------------|---------|-------------|
| 조회 | 단일 | 다건 | P-001 Search List | - | Error State |
| 조회 | 단일 | 다건+상세 | P-010 Search+Detail | - | Error State |
| 조회 | Master-Detail | 다건 | P-012 Master-Detail | Read-Only | Error State |
| 관리 | 단일 | 단건 | P-011 Search+Form | - | Confirm+Toast |
| 관리 | 단일 | 다건편집 | P-004 Grid Management | Editable | Inline Validation |
| 관리 | Master-Detail | 단건+다건 | P-012 Master-Detail | Editable | Confirm+Toast |
| 관리 | 계층 (Self-ref) | 다건 | P-032 Tree Management | Draggable | Confirm+Toast |
| 관리 | N:N | 다건 | P-017 Cross-Reference | - | Confirm+Toast |
| 등록 | 단일 (속성 ≤5) | 단건 | P-041 Edit Popup | - | Validation+Toast |
| 등록 | 단일 (속성 6~20) | 단건 | P-002 Simple Form | - | Validation+Toast |
| 등록 | 단일 (속성 21+) | 단건 | P-013 Multi-Tab | - | Validation+Toast |
| 등록 | 단일 | 단계별 | P-014 Wizard Form | - | Step Validation |
| 등록 | 다중(독립) | 단건 | P-013 Multi-Tab | - | Tab별 Validation |
| 등록 | 대량 | 일괄 | P-022 Excel Upload | - | Preview+Error List |
| 수정 | 단일 | 단건 | P-002 Simple Form | State-Driven | Confirm+Toast |
| 수정 | 다건 | 일괄 | P-023 Bulk Action | - | Confirm+Progress |
| 승인 | 모든 구조 | 단건 | P-020 Approval | State-Driven | Alert+History |
| 통계 | 모든 구조 | 읽기전용 | P-021 Dashboard | - | Empty State |
| 모니터링 | 모든 구조 | 자동 | P-029 Monitoring | - | Offline Indicator |
| 선택 | 단일/다건 | 선택 | P-024 Lookup Popup | - | Empty State |
| 설정 | 단일 | 단건 | P-005 Config/Settings | - | Confirm+Toast |
| 배치 | 자동 | 예약 | P-031 Batch Monitor | - | Progress+Notification |
| 비교 | 2건 | 읽기 | P-027 Comparison | - | Empty State |
| 이력 | 이력 데이터 | 다건 | P-028 History/Audit | - | Empty State |
| 일정 | 날짜 기반 | 일정관리 | P-025 Calendar | - | Confirm+Toast |
| 상태관리 | 상태 전이 핵심 | 시각적 | P-026 Kanban Board | Draggable | Confirm+Toast |

---

## 5.8 판별 불명 시 사용자 질의 기준

UI Pattern을 자동 결정할 수 없는 경우, 아래 질문을 사용자에게 제시하여 선택을 유도한다.

### 질의 트리거 조건 및 질문

| 상황 | 질문 | 선택지 |
|------|------|--------|
| 업무 유형 불명확 | "이 화면의 주요 목적은 무엇입니까?" | ① 데이터 조회/검색 ② 데이터 등록/수정 ③ 승인/결재 ④ 현황/통계 확인 ⑤ 시스템 설정 |
| 상세 보기 방식 불명확 | "목록에서 상세 정보를 어떻게 확인하시겠습니까?" | ① 같은 화면 하단에 표시 (Panel) ② 팝업으로 표시 ③ 별도 페이지로 이동 ④ 오른쪽 사이드 패널 |
| 편집 방식 불명확 | "데이터 편집을 어떻게 진행하시겠습니까?" | ① 목록에서 직접 편집 (인라인) ② 별도 Form 화면에서 편집 ③ 팝업에서 편집 |
| 일괄 처리 필요 여부 | "여러 건을 한 번에 처리해야 합니까?" | ① 건별 처리만 ② 다중 선택 후 일괄 처리 필요 ③ 엑셀 업로드로 대량 처리 |
| 데이터 관계 불명확 | "이 데이터에 종속 데이터(하위 목록)가 있습니까?" | ① 없음 (단일 데이터) ② 있음 (1:N 관계) ③ 계층 구조 (조직도 등) ④ 다대다 매핑 |
| 상태 흐름 불명확 | "이 업무에 상태 전이(예: 작성→진행→완료)가 있습니까?" | ① 없음 ② 단순 (2~3개 상태) ③ 복잡 (4개 이상 상태, 분기) |
| 검색 필드 개수 | "검색 조건이 몇 개 필요합니까?" | ① 1~3개 (기본) ② 4~6개 (접기/펼치기) ③ 7개 이상 (고급 검색) |
| 마스터 데이터 값 개수 | "선택 가능한 값이 몇 개입니까?" | ① 2~3개 ② 4~10개 ③ 10~30개 ④ 30개 초과 |
| 모바일 대응 필요 여부 | "모바일/태블릿에서도 사용해야 합니까?" | ① PC 전용 ② 태블릿 대응 ③ 모바일 대응 필수 |
| 인쇄 필요 여부 | "이 화면의 내용을 인쇄해야 합니까?" | ① 불필요 ② 목록 인쇄 ③ 상세 인쇄 (리포트형) |

### 질의 응답 → Pattern 결정 예시

```
Q: 주요 목적? → ① 데이터 조회/검색
Q: 상세 보기 방식? → ④ 오른쪽 사이드 패널
Q: 일괄 처리? → ② 다중 선택 후 일괄 처리
→ 결정: P-010 Search+Detail (Drawer Variant) + Bulk Variant
→ COMP-LAYOUT-008 (Drawer) + COMP-ACTION-010 (Bulk Action Bar)
```

---

## 5.9 UI 결정 Summary Template

Pattern 결정 후 아래 형식으로 요약한다.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UI Pattern 결정 Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Work MD ID    : WK-XXX-XXX-001
업무명        : 주문 조회
────────────────────────────────────
1차 업무 유형 : 조회 (TYPE-01)
2차 데이터 구조: 단일 엔티티 (Order)
3차 처리 방식 : 다건 조회 + 상세 보기
4차 사용자 행동: 탐색 중심
5차 상태 흐름 : 복잡 (DRFT→WAIT→PROC→APPR/REJC)
6차 Exception : RETRY (네트워크 오류)
────────────────────────────────────
결정 Pattern  : P-010 Search + Detail
Variant      : State-Driven, Bulk
Detail 방식  : PANEL-01 (Side Panel)
Exception UI : Error State + 재시도 버튼
────────────────────────────────────
화면 ID       : SCR-ORD-LIST-001
Detail Popup  : SCR-ORD-LIST-001-M01
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

# Chapter 6. 이벤트 기반 UI 행위 정의

> **목적**: 화면의 정적 구조 위에서 발생하는 동적 행위를 표준화한다.

---

## 6.1 이벤트 유형 분류

### 사용자 입력 이벤트

| 이벤트 코드 | 이벤트 | 설명 | Work MD 근거 |
|------------|--------|------|-------------|
| EVT-CLK | Click | 버튼, 행, 링크 클릭 | 섹션 4 Actions Trigger |
| EVT-DBLCLK | Double Click | 행 더블클릭 → 상세 진입 | 섹션 4 Actions |
| EVT-CHG | Change | 입력값 변경, 드롭다운 선택 | 섹션 5 Local Rules |
| EVT-BLR | Blur | 필드 포커스 아웃 → 유효성 검증 | 섹션 5 Validation |
| EVT-SUB | Submit | 폼 제출 | 섹션 4 Actions |
| EVT-DND | Drag & Drop | 순서 변경, 파일 업로드 | 섹션 4 Actions |
| EVT-KEY | Key Press | 키보드 단축키 (Enter=검색, Esc=닫기) | 공통 규칙 |

### 탐색 이벤트

| 이벤트 코드 | 이벤트 | 설명 |
|------------|--------|------|
| EVT-SRCH | Search | 검색 실행 |
| EVT-PAGE | Page Change | 페이지 이동 |
| EVT-SORT | Sort | 정렬 변경 |
| EVT-FILT | Filter | 필터 적용/해제 |
| EVT-TAB | Tab Switch | 탭 전환 |
| EVT-EXPD | Expand/Collapse | 행 펼치기/접기, 트리 토글 |
| EVT-SCRL | Scroll | 무한 스크롤 트리거 |

### 시스템 이벤트

| 이벤트 코드 | 이벤트 | 설명 |
|------------|--------|------|
| EVT-INIT | Init Load | 화면 초기 로딩 |
| EVT-RFSH | Refresh | 수동 데이터 갱신 |
| EVT-AUTO | Auto Refresh | 주기적 자동 갱신 |
| EVT-NOTI | Notification | 외부 알림 수신 |
| EVT-SESS | Session Timeout | 세션 만료 |
| EVT-NET | Network Error | 네트워크 끊김 |

### 데이터 이벤트

| 이벤트 코드 | 이벤트 | 설명 |
|------------|--------|------|
| EVT-LOAD | Data Loaded | 비동기 데이터 로딩 완료 |
| EVT-DERR | Data Error | 데이터 로딩 실패 |
| EVT-DCHG | Data Changed | 다른 사용자 데이터 변경 (충돌) |
| EVT-VPASS | Validation Pass | 유효성 검증 통과 |
| EVT-VFAIL | Validation Fail | 유효성 검증 실패 |

### 상태 전이 이벤트

| 이벤트 코드 | 이벤트 | 설명 |
|------------|--------|------|
| EVT-STCHG | State Change | 비즈니스 객체 상태 변경 |
| EVT-APSUB | Approval Submit | 승인 상신 |
| EVT-APAPR | Approval Approve | 승인 완료 |
| EVT-APREJ | Approval Reject | 반려 |
| EVT-LOCK | Lock/Unlock | 데이터 편집 잠금/해제 |

### 파일 이벤트

| 이벤트 코드 | 이벤트 | 설명 |
|------------|--------|------|
| EVT-FSEL | File Selected | 파일 선택됨 |
| EVT-UPST | Upload Start | 업로드 시작 |
| EVT-UPPG | Upload Progress | 업로드 진행 중 |
| EVT-UPDN | Upload Complete | 업로드 완료 |
| EVT-UPERR | Upload Error | 업로드 실패 |

---

## 6.2 주요 이벤트 처리 시퀀스

### EVT-01: 조회 버튼 클릭

```
1. 버튼 Loading 상태 + Disabled (중복 방지)
2. Grid 영역 Skeleton Row 5개 표시
3. API 호출
4a. 성공 → 데이터 바인딩 + 총 건수 갱신 + 버튼 정상화
4b. 결과 0건 → Empty State ("조회된 데이터가 없습니다")
4c. 실패 → Toast Error + 버튼 정상화
```

### EVT-02: Row 클릭 / 선택

| Grid 유형 | 동작 |
|---------|------|
| GRID-01 (표시전용) | 반응 없음 |
| GRID-03 (단일선택) | Row Highlight(`#EFF6FF`) + Detail 영역/Popup 갱신 |
| GRID-04 (다중선택) | Checkbox 토글 + 선택 건수 갱신 |
| 더블 클릭 | 상세 페이지 이동 또는 Popup 오픈 |

### EVT-03: 등록 버튼 클릭

| 조건 | 처리 방식 |
|------|---------|
| 입력 필드 5개 이하 | Popup Form (P-041) 오픈 |
| 입력 필드 6개 이상 | 등록 전용 페이지 이동 (P-002) |
| Master-Detail | 등록 페이지 이동 (P-012) |

### EVT-04: 저장 버튼 클릭 (완전한 처리 흐름)

```
1. 버튼 Disabled + Loading Spinner (중복 클릭 방지)
2. 클라이언트 유효성 검사
   ├─ 실패: 첫 번째 오류 필드 자동 포커스
   │        다중 오류: 상단 Summary ("N개의 필수 항목을 확인해 주세요")
   │        버튼 정상화
   └─ 통과: 다음 단계
3. Confirm Dialog (비가역적 처리 시): "저장하시겠습니까?"
4. API 호출 (버튼 Disabled 유지)
5a. 성공: Toast Success "저장되었습니다" + 목록 이동/ReadOnly 전환
5b. Partial Success: Toast Warning + Summary Modal (성공 N건 / 실패 N건 + 사유)
5c. 실패: 버튼 정상화 + Toast Error 또는 Alert Dialog
```

### EVT-05: 삭제 버튼 클릭

```
1. Confirm Dialog: "삭제된 데이터는 복구할 수 없습니다. 삭제하시겠습니까?"
   (Danger 스타일: 삭제 버튼 빨간색)
2. 확인 → API 호출
3a. 성공 → Toast Success "삭제되었습니다" + 목록으로 이동/Grid 갱신
3b. 실패 → Alert Dialog (에러 메시지)
```

### EVT-06: 승인 / 반려

```
1. 선택 건수 확인 (0건: Toast Warning "처리할 항목을 선택해 주세요")
2. 반려/보류 시: Form Popup으로 사유 입력 (필수값)
3. Confirm Dialog: "N건을 [승인/반려] 처리하시겠습니까?"
4. API 호출
5a. 성공: Grid 상태값 갱신 + Toast Success
5b. Partial Success: Toast Warning + Summary 팝업
```

### EVT-07: 페이지 이동 (페이지네이션)

```
1. 페이지 번호 클릭 → 해당 페이지 API 조회
2. Scroll Top 처리
3. 선택 Row 상태 초기화
4. 검색 조건 유지
```

### EVT-08: 컬럼 정렬

```
1. 컬럼 헤더 클릭 → 정렬 토글
   기본(아이콘 흐림) → ASC(▲) → DESC(▼) → 기본
2. 단일 컬럼 정렬 (다중 미지원, 필요 시 명세에 명시)
3. 정렬 변경 시 1페이지 이동
```

### EVT-09: 검색 조건 초기화

```
1. 모든 검색 필드 기본값으로 초기화
2. Grid 결과: 이전 결과 유지 (재조회 안 함)
3. Toast Info (선택적): "검색 조건이 초기화되었습니다"
```

### EVT-10: 엑셀 다운로드

```
1. 권한 확인 (없음: Toast Warning)
2. 1,000건 초과: 범위 선택 팝업 (현재 페이지 / 전체)
3. 10,000건 초과: 백그라운드 처리 + 완료 시 Toast 알림
4. 버튼 Loading → 파일 생성 → 자동 다운로드
5. 파일명: [화면명]_YYYYMMDD_HHMMSS.xlsx
```

### EVT-11: 미저장 이탈 감지

```
감지 조건: Form 변경 후 저장 없이 이탈 시도
이탈 유형: 목록 버튼/뒤로가기/탭 닫기/새로고침

Confirm Dialog: "저장하지 않은 변경사항이 있습니다. 페이지를 벗어나시겠습니까?"
├─ 확인: 이탈 허용
└─ 취소: 현재 페이지 유지
```

---

## 6.3 상태 전이 → UI 전환 매핑

Work MD 섹션 9의 State Transitions를 UI 제어로 변환한다.

| State | 화면 모드 | 활성 버튼 | 비활성 필드 | 표시 영역 | 숨김 영역 | 색상 코드 |
|-------|----------|----------|-----------|----------|----------|----------|
| DRFT | 편집 | 저장, 상신, 삭제 | - | 편집 Form | 승인 이력 | `#6B7280` |
| WAIT | 읽기전용 | 회수(조건부) | 모든 입력 | 읽기전용+결재선+진행상태 | 편집/삭제 | `#2563EB` |
| PROC | 읽기전용+승인자편집 | 승인, 반려, 의견 | 모든 입력(의견 제외) | 읽기전용+결재선+의견입력 | 편집 | `#D97706` |
| APPR | 완전 읽기전용 | 인쇄, 복사 | 모든 필드 | 최종 승인+전체 이력 | 수정/삭제/승인 | `#16A34A` |
| REJC | 편집 복귀 | 수정, 재상신, 삭제 | - | 편집Form+반려사유 | - | `#DC2626` |
| CNCL | 완전 읽기전용 | - | 모든 필드 | 취소 사유+이력 | 모든 액션 | `#6B7280` |

---

## 6.4 조건부 이벤트 처리

| 이벤트 | 조건 | 충족 시 | 미충족 시 | 근거 |
|--------|------|--------|----------|------|
| 저장 | 필수 필드 모두 입력 | API 호출 | Error Summary + 하이라이트 | 섹션 5 Validation |
| 삭제 | 상태 DRAFT/REJECTED | Confirm 표시 | 삭제 버튼 비활성 | 섹션 9 States |
| 승인 | 현재 사용자=현 단계 승인자 | 승인/반려 활성 | 승인 버튼 숨김 | 섹션 3 Actor |
| 엑셀 다운로드 | 1,000건 초과 | 비동기+Progress | 즉시 다운로드 | Common Rules |
| 인라인 편집 | 행 상태=편집 가능 | 셀 편집 모드 | 읽기전용 유지 | 섹션 9 States |

---

## 6.5 비동기/연동 이벤트 처리

| 연동 유형 | UI 처리 패턴 |
|----------|-------------|
| 동기 (Sync) | Progress Indicator → 즉시 반영 |
| 비동기 (Async) | Toast (요청 접수) → Notification (완료) → 수동 갱신 |
| 실시간 (Real-time) | Auto Refresh (N초) 또는 WebSocket Push |
| 대량 처리 | Progress Bar (%) → 완료 Toast → 결과 리포트 |

---

## 6.6 공통 이벤트 처리 규칙

| 상황 | 처리 방식 | Component |
|------|---------|-----------|
| API 호출 중 | 버튼 Disabled + Spinner | Loading 상태 |
| 네트워크 오류 | "일시적 오류. 다시 시도해주세요" | Toast Error |
| 세션 만료 | 로그인 Redirect + 안내 | Alert Dialog |
| 권한 없음 (403) | "접근 권한이 없습니다" | Alert + 이전 페이지 |
| 서버 오류 (500) | "일시적 오류. 잠시 후 다시 시도해주세요" | Alert Dialog |
| 필수값 미입력 | Red Border + 하단 메시지 + 포커스 | Inline Validation |
| 변경사항+이탈 | 이탈 확인 팝업 | Confirm Dialog |
| 동시 편집 충돌 | "다른 사용자가 변경했습니다. 최신 데이터를 불러오시겠습니까?" | Confirm |
| 오프라인 | 상단 배너 "인터넷 연결이 끊겼습니다" | Warning Banner |

---

---

# Chapter 7. 정책/규칙 → UI 제어 매핑

> **목적**: Work MD의 Local Rules, Common Rules, Exception 처리를 UI 제어 규칙으로 변환한다.

---

## 7.1 Local Rules → 필드 제어

| Rule 패턴 | 판별 키워드 | UI 제어 | Component |
|-----------|-----------|---------|-----------|
| 필수 입력 | "반드시", "필수", "비워둘 수 없다" | Required Mark (*) + Validation Message | COMP-FEEDBACK-005 |
| 형식 검증 | "형식", "패턴", "~자리", "~자 이내" | Input Mask + Validation | COMP-FIELD-031 |
| 범위 검증 | "이상", "이하", "~에서 ~까지" | Number Input 범위 제한 | COMP-FIELD-003 |
| 고유성 | "중복 불가", "유일해야" | 중복 확인 버튼/Blur 검증 | COMP-ACTION-006 |
| 선택 제약 | "마스터에서 선택", "목록 중 하나" | Dropdown/Lookup 강제 | COMP-FIELD-013/028 |
| 조건부 필수 | "~인 경우에만 필수" | 조건부 Required Mark | COMP-FIELD-035 |
| 조건부 활성 | "~인 경우에만 입력 가능" | Enable/Disable | COMP-FIELD-035 |
| 조건부 표시 | "~인 경우에만 표시" | Show/Hide | COMP-FIELD-035 |
| 최대 개수 | "최대 N개까지" | 행 추가 제한 + Counter | COMP-INPUT-005 |
| 역할 제어 | "~권한자만", "관리자만" | Show/Hide + Role 조건 | 권한 매트릭스 |
| 실행 전 검증 | "~전에 검증", "실행 전 확인" | Blur/Submit 전 검증 | COMP-FEEDBACK-005 |
| 자동 계산 | "~후에 자동 계산" | Calculated Field 갱신 | COMP-FIELD-034 |
| 종속 필드 | "~를 선택하면 ~가 변경" | Dependent Field 연동 | COMP-FIELD-036 |
| 표시 형식 | "~형식으로 표시", "마스킹" | ReadOnly + 포맷 | COMP-FIELD-033/031 |

---

## 7.2 마스터 데이터 규칙 → 입력 UI 강제

| 마스터 규칙 패턴 | UI 변환 | 예시 |
|----------------|---------|------|
| 패턴 1: 선택 제약 | 값 개수에 따라 Radio/Dropdown/Lookup, 직접 입력 차단 | 고용형태 5개 → Dropdown |
| 패턴 2: 참조 무결성 | 자유 입력 차단, Lookup/Dropdown만 허용 | 고객코드 → Lookup Only |
| 패턴 3: 활성 상태 제약 | 비활성 항목 제외 또는 비활성 표시+선택불가 | 비활성 직급 회색 |
| 패턴 4: 개수 제약 | 변경 시 개수 초과 방지 Alert | 직급 7개 초과 추가 시 Alert |

---

## 7.3 Common Rules → 공통 UI 제어

| Common Rule | UI 제어 | 적용 범위 |
|-------------|---------|----------|
| 개인정보 마스킹 | Masked Input (주민번호, 전화번호) | 모든 개인정보 필드 |
| 감사 로그 | Audit Trail (CUD 시 자동 기록) | 모든 CUD 화면 |
| 세션 타임아웃 | Countdown Timer + 자동 로그아웃 경고 | 전역 |
| 동시 편집 방지 | Warning Banner ("다른 사용자 편집 중") | 편집 화면 |
| 대량 데이터 | Progress Bar + 비동기 처리 | 1,000건 이상 |
| 파일 업로드 제한 | Validation ("최대 10MB") | 모든 Upload |
| 입력값 자동 저장 | Toast ("자동 저장됨") | Wizard/장시간 입력 |
| 미저장 이탈 방지 | Unsaved Changes Warning | 모든 편집 화면 |

---

## 7.4 권한 기반 UI 제어 매트릭스

| UI 요소 | 일반 사용자 | 관리자 | 승인권자 | 시스템 |
|---------|-----------|--------|---------|--------|
| 등록 버튼 | ◯ | ◯ | △ | × |
| 수정 버튼 | △ 본인 건만 | ◯ | × | × |
| 삭제 버튼 | × | ◯ | × | × |
| 승인 버튼 | × | × | ◯ | × |
| 전체 조회 | △ 본인/부서 | ◯ 전체 | ◯ 전체 | ◯ |
| 엑셀 다운로드 | △ 조건부 | ◯ | ◯ | × |
| 설정 메뉴 | × | ◯ | × | × |
| 개인정보 비마스킹 | × | △ 조건부 | × | × |

> ◯ 항상 표시, △ 조건부, × 숨김/비활성

---

## 7.5 Exception 처리 원칙 → 피드백 UI 시퀀스

| 처리 원칙 | UI 피드백 시퀀스 |
|----------|----------------|
| BLOCK | ① Alert Dialog → ② Action 취소 → ③ 이전 상태 유지 |
| RETRY | ① Error State (재시도 횟수 안내) → ② 재시도 버튼 → ③ N회 초과 시 MANUAL |
| DEFER | ① Toast (대기 알림) → ② Status "보류" → ③ 조건 충족 시 Notification |
| COMPENSATE | ① Confirm (보상 확인) → ② Progress → ③ Toast (완료) |
| FALLBACK | ① Info Banner (대체 안내) → ② 대체 기능 실행 → ③ Toast |
| MANUAL | ① Alert (운영자 확인 필요) → ② Notification → ③ 화면 잠금/대기 |

---

## 7.6 데이터 유효성 → Validation UI 매핑

| Validation 유형 | 검증 시점 | UI 표현 | 메시지 위치 |
|---------------|----------|---------|-----------|
| 필수 입력 | Submit (또는 Blur) | 빨간 테두리 + 인라인 메시지 | 필드 하단 |
| 형식 오류 | Blur (또는 실시간) | 빨간 테두리 + 형식 안내 | 필드 하단 |
| 범위 초과 | Change | 주황 테두리 + 범위 안내 | 필드 하단 |
| 중복 | Blur (서버 검증) | 필드 옆 아이콘 (✕/✓) | 필드 우측 |
| 서버 검증 | Submit | 상단 Error Summary + 필드 하이라이트 | 폼 상단+필드 |
| 비즈니스 규칙 | Submit | Confirm/Alert Dialog | 팝업 |
| 경고 (차단 아님) | Blur/Submit | Warning Banner (무시 가능) | 폼 상단/필드 하단 |

---

# Chapter 8. 화면 간 흐름 (Navigation) 정의

> **목적**: Work MD 섹션 11(User Journeys)의 Step을 화면 간 이동 흐름으로 변환한다.

---

## 8.1 Journey 기반 화면 전환 규칙

| Journey Step 유형 | 화면 전환 방식 | UI 요소 |
|------------------|-------------|---------|
| 다른 화면 이동 | Page Navigation (URL 변경) | Breadcrumb 갱신 |
| 상세 보기 | Popup/Drawer 열기 | P-040~P-045 |
| 편집 모드 전환 | 동일 화면 모드 전환 | 버튼+Zone 변경 (Variant 전환) |
| 승인 단계 이동 | 상태 전이 + 화면 새로고침 | Status Indicator + Toast |
| 외부 시스템 이동 | 새 탭/창 열기 또는 Redirect | Link Button + Confirm |
| 이전 단계 복귀 | 뒤로가기 또는 Step Navigator | Back Button/Step Nav |

---

## 8.2 화면 계층 구조

```
L0: 대시보드/홈
  L1: 메뉴 목록 화면 (Search List)
    L2: 상세/편집 화면 (Form, Detail)
      L3: Popup (Lookup, Confirm, 서브 상세)
        L4: Nested Popup (최대 2단계)
```

---

## 8.3 Breadcrumb / 뒤로가기 규칙

| 상황 | Breadcrumb 표시 | 뒤로가기 동작 |
|------|---------------|-------------|
| L0 → L1 | 홈 > 메뉴명 | 홈으로 이동 |
| L1 → L2 | 홈 > 메뉴명 > 상세명 | L1으로 이동 (목록 유지) |
| L2에서 Popup | Breadcrumb 변경 없음 | Popup 닫기 |
| Wizard Step | 홈 > 메뉴명 > Step N | 이전 Step으로 이동 |
| 미저장 + 뒤로 | - | Unsaved Changes Warning |

---

## 8.4 화면 간 데이터 전달

| 전달 유형 | 방법 | 예시 |
|---------|------|------|
| 목록 → 상세 | 선택 행 ID를 Parameter 전달 | order_id=ORD-001 |
| 상세 → Popup | Context 데이터 전달 | 현재 Order의 customer_id |
| Popup → 부모 | 선택 값 Callback 전달 | 선택된 고객 코드+명칭 |
| Wizard Step 간 | Step State 유지 | 이전 Step 입력값 보존 |
| 화면 간 새로고침 | 목록 화면 돌아올 때 자동 갱신 | 등록/수정 후 목록 갱신 |

---

---

# Chapter 10. UI 결정 의사결정 트리 (Decision Tree)

> **목적**: Work MD를 입력으로 받아 순차적 질문을 통해 최종 UI Pattern을 결정한다.

---

## 10.1 전체 의사결정 트리

```
START: Work MD 입력
  │
  ├─ Q0: 다른 화면에서 호출되는가? (Integration Direction=in)
  │   ├─ 예 → Popup 계열
  │   │   ├─ Q0-1: 편집 필요?
  │   │   │   ├─ 예 → P-041 Edit Popup
  │   │   │   └─ 아니오
  │   │   │       ├─ Q0-2: 선택 반환?
  │   │   │       │   ├─ 예 → P-024 Lookup Popup
  │   │   │       │   └─ 아니오 → P-040 Info Popup
  │   │   │       └─
  │   └─ 아니오 → Q1로
  │
  ├─ Q1: 특수 업무 유형인가?
  │   ├─ 승인/결재 → P-020 Approval Process
  │   ├─ 통계/분석 → P-021 Dashboard
  │   ├─ 모니터링 → P-029 Monitoring Dashboard
  │   ├─ 엑셀 업로드 → P-022 Excel Upload
  │   ├─ 배치 작업 → P-031 Batch Job Monitor
  │   ├─ 설정/환경 → P-005 Config/Settings
  │   ├─ 리포트/출력 → P-030 Report Viewer
  │   ├─ 일정/스케줄 → P-025 Calendar View
  │   ├─ 칸반/상태보드 → P-026 Kanban Board
  │   └─ 아니오 → Q2로
  │
  ├─ Q2: 데이터 구조는?
  │   ├─ Master-Detail (1:N)
  │   │   └─ Q2-1: 2단계 이상?
  │   │       ├─ 예 → P-016 Nested Master-Detail
  │   │       └─ 아니오 → P-012 Master-Detail
  │   ├─ 계층 (Self-ref) → P-032 Tree Management
  │   ├─ N:N → P-017 Cross-Reference View
  │   └─ 단일/독립 → Q3로
  │
  ├─ Q3: 업무 유형은?
  │   ├─ 조회 전용
  │   │   ├─ Q3-1: 상세 보기 필요?
  │   │   │   ├─ 예 → P-010 Search+Detail
  │   │   │   └─ 아니오 → P-001 Search List
  │   │   └─
  │   ├─ 등록/수정
  │   │   ├─ Q3-2: 단계별 입력? → 예: P-014 Wizard
  │   │   ├─ Q3-3: 속성 수는?
  │   │   │   ├─ 1~5개 → P-041 Edit Popup
  │   │   │   ├─ 6~20개 → P-002 Simple Form
  │   │   │   └─ 21개+ → P-013 Multi-Tab Detail
  │   │   └─ Q3-4: 비교 필요? → 예: P-027 Comparison View
  │   ├─ 관리 (CRUD)
  │   │   ├─ Q3-5: 인라인 편집 적합? (데이터 단순, 항목 소수)
  │   │   │   ├─ 예 → P-004 Grid Management
  │   │   │   └─ 아니오 → P-011 Search+Form
  │   │   └─
  │   └─ 이력 조회 → P-028 History/Audit Trail
  │
  ├─ Q4: Variant 결정
  │   ├─ 일괄 처리 필요? → +Bulk Variant
  │   ├─ 상태 흐름 복잡? → +State-Driven Variant
  │   ├─ 역할별 UI 차이? → +Role-Based Variant
  │   ├─ 행 펼치기 필요? → +Expandable Variant
  │   ├─ 순서 변경 필요? → +Draggable Variant
  │   ├─ 이력 탭 필요? → +History Tab
  │   └─ 인쇄 필요? → +Print-Optimized Variant
  │
  ├─ Q5: Exception UI 결정
  │   ├─ BLOCK → Alert Dialog
  │   ├─ RETRY → Error State + 재시도
  │   ├─ DEFER → Toast + Status 변경
  │   ├─ COMPENSATE → Confirm + Undo
  │   ├─ FALLBACK → Info Banner
  │   └─ MANUAL → Alert + Notification
  │
  └─ END: Pattern + Variant + Exception UI 확정
```

---

## 10.2 판별 불명 분기점

의사결정 트리에서 자동 판별이 불가능한 지점에서는 사용자에게 질의한다.

| 분기점 | 자동 판별 불가 조건 | 사용자 질문 | 선택지 |
|-------|------------------|-----------|--------|
| Q0 | Integration 정보 미정의 | "이 화면은 다른 화면에서 팝업으로 호출됩니까?" | ① 예 ② 아니오 |
| Q2 | Relations 미정의 | "종속 데이터(하위 목록)가 있습니까?" | ① 없음 ② 1:N ③ 계층 ④ N:N |
| Q3-1 | Detail 방식 불명확 | "상세 정보를 어떻게 확인합니까?" | ① 팝업 ② 사이드 패널 ③ 별도 페이지 ④ 불필요 |
| Q3-3 | Attributes 수 미정의 | "입력 필드가 대략 몇 개입니까?" | ① 5개 이하 ② 6~20개 ③ 20개 초과 |
| Q3-5 | 편집 방식 불명확 | "데이터 편집을 어떻게 하시겠습니까?" | ① 목록에서 직접 ② 별도 Form ③ 팝업 |
| Variant | 일괄 처리 여부 불명확 | "여러 건 동시 처리가 필요합니까?" | ① 건별만 ② 일괄 필요 |

---

## 10.3 결정 결과 출력 형식

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  UI Pattern 결정 결과                ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃ Work MD    : WK-ORD-MGMT-001       ┃
┃ 업무명     : 주문 관리              ┃
┃ ────────────────────────────────── ┃
┃ Pattern    : P-012 Master-Detail    ┃
┃ Variant    : Editable, State-Driven ┃
┃ Layout     : L-02 (좌우 분할)       ┃
┃ Detail     : Inline Edit Grid       ┃
┃ Popup      : P-024 (고객 Lookup)    ┃
┃ Exception  : RETRY (네트워크)       ┃
┃ ────────────────────────────────── ┃
┃ 화면 ID    : SCR-ORD-MGMT-001      ┃
┃ Popup ID   : SCR-ORD-MGMT-001-M01  ┃
┃ ────────────────────────────────── ┃
┃ 결정 경로:                          ┃
┃ Q0(아니오) → Q1(아니오) → Q2(1:N)  ┃
┃ → P-012 → Q4(Editable+State)      ┃
┃ → Q5(RETRY)                        ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

---

# 화면 설계 템플릿

> UI Pattern이 결정된 후 실제 화면 설계서를 작성할 때 사용하는 표준 양식

---

## 기본 정보

| 항목 | 내용 |
|------|------|
| 화면 ID | SCR-[도메인]-[업무]-[번호] |
| 화면명 | |
| Work MD 참조 | WK-XXX-XXX-001 |
| UI Pattern | P-XXX (+ Variant명) |
| Layout | L-XX |
| URL/경로 | |
| 접근 권한 | |
| 부모 화면 | SCR-XXX (또는 "없음") |
| 연결 Popup | SCR-XXX-M01, SCR-XXX-M02 |

---

## 레이아웃 구조

```
[Pattern의 Zone 기반 와이어프레임을 여기에 작성]
```

---

## Zone별 상세

### Zone A: [영역명]

**Component**: [Component ID, 명]  
**데이터 바인딩**: [바인딩 대상]  
**조건부 표시**: [조건 또는 "항상"]

| 항목명 | Field Component | 필수 | 기본값 | 데이터 소스 | 제약 조건 | 조건부 제어 | 참조 Rule |
|--------|----------------|------|--------|-----------|----------|-----------|----------|
| | | | | | | | |

### Zone B: [영역명]

(동일 형식 반복)

---

## 이벤트 정의

| 이벤트 ID | 이벤트명 | 트리거 | 선행 조건 | UI 변화 | 데이터 처리 | 피드백 | 참조 Rule |
|-----------|---------|--------|----------|---------|------------|--------|----------|
| | | | | | | | |

---

## 상태별 UI 제어

| State | 화면 모드 | 활성 버튼 | 비활성 필드 | 표시/숨김 영역 | 색상 코드 | 참조 Rule |
|-------|----------|----------|-----------|-------------|----------|----------|
| | | | | | | |

---

## 권한별 UI 제어

| UI 요소 | 역할1 | 역할2 | 역할3 | 참조 Rule |
|---------|-------|-------|-------|----------|
| | | | | |

---

## 유효성 검증

| 필드 | 검증 유형 | 조건 | 검증 시점 | 메시지 | 참조 Rule |
|------|----------|------|----------|--------|----------|
| | | | | | |

---

## Exception 처리

| Exception ID | 발생 조건 | 처리 원칙 | UI 피드백 시퀀스 | 참조 EX |
|-------------|----------|----------|----------------|---------|
| | | | | |

---

## Navigation

| 이동 대상 | 트리거 | 전환 방식 | 뒤로가기 |
|----------|--------|----------|---------|
| | | | |

---

## 참조

- Work MD: [파일 링크]
- Use Cases: [UC-XXX]
- Actions: [AC-XXX]
- Local Rules: [LR-XXX]
- Common Rules: [CR-XXX]
- Exceptions: [EX-XXX]
- Evidence: [EVID-XXX]

---

---

# Chapter 9. 반응형 / 접근성 기준

> **목적**: 다양한 디바이스 환경과 접근성 요구에 대응하는 UI 기준을 정의한다.

---

## 9.1 반응형 Break Point

| 구분 | 범위 | 주요 대응 |
|------|------|---------|
| Desktop | 1280px 이상 | 전체 레이아웃 적용, 다열 Form, 좌우 분할 |
| Tablet | 768px ~ 1279px | 2열 Form, 상하 분할 전환, Step 축약 |
| Mobile | 767px 이하 | 1열 Form, 카드 뷰 전환, Bottom Sheet |

## 9.2 레이아웃별 반응형 대응

| 레이아웃 (Pattern) | Desktop | Tablet | Mobile |
|------------------|---------|--------|--------|
| P-001 Search List | 검색 4열 + Grid | 검색 2열 + Grid | 검색 1열 + 카드 뷰 |
| P-012 Master-Detail / P-015 Split View | 좌우 4:8 분할 | 상하 분할 | 탭 방식 전환 |
| P-002 Simple Form / P-013 Multi-Tab | 3열 Form | 2열 Form | 1열 Form |
| P-014 Wizard | Step 텍스트 전체 | Step 번호+축약 | 진행률 Bar 대체 |
| P-021 Dashboard | 다열 위젯 배치 | 2열 위젯 | 1열 스택 |
| Popup (P-040~P-045) | 원본 크기 유지 | 90% 너비 | Bottom Sheet 전환 |

## 9.3 모바일 팝업 대체 규칙

| 원본 팝업 | 모바일 대체 |
|---------|-----------|
| P-040 Info Popup (600~900px) | PANEL Bottom Sheet (60~80% 높이) |
| P-041 Edit Popup (600~900px) | PANEL Bottom Sheet 또는 전체 페이지 |
| P-042 Confirm Popup (400px) | PANEL Bottom Sheet (40% 높이) |
| P-044 Preview (900~1200px) | 전체 화면 페이지 이동 |
| P-024 Lookup Popup (800px) | PANEL Bottom Sheet (80% 높이) |

## 9.4 접근성 기준 (WCAG 2.1 AA)

| 항목 | 기준 |
|------|------|
| 색상 대비 | 일반 텍스트 4.5:1 이상, 대형 텍스트 3:1 이상 |
| 키보드 탐색 | Tab 순서 논리적 배치, Enter 실행, ESC 팝업 닫기 |
| ARIA 속성 | `role`, `aria-label`, `aria-required`, `aria-invalid`, `aria-live` 필수 |
| 포커스 표시 | `2px solid #2563EB` outline |
| 스크린 리더 | 아이콘 버튼 `aria-label` 필수, 상태 변경 시 `aria-live` 알림 |
| 터치 영역 | 최소 44×44px (모바일) |
| 폰트 크기 | 최소 12px, 본문 권장 14px |

---

---

# Chapter 10. 예외 처리 및 Edge Case

> **목적**: 비정상 상황에서의 UI 처리를 10가지 패턴으로 표준화한다.

---

## 10.1 Empty State (데이터 없음)

| 원인 | 메시지 | 하단 액션 |
|------|-------|---------|
| 조회 조건 미일치 | "조건을 변경하여 다시 조회해보세요" | [조건 초기화] 버튼 |
| 데이터 자체 없음 | "아직 등록된 데이터가 없습니다" | [등록하기] 버튼 |

## 10.2 Loading 상태

| 사용 | 적용 조건 |
|------|---------|
| Skeleton UI | 레이아웃 예측 가능 (Grid, 카드, Form) |
| Spinner | 즉시 처리 예상 (1초 미만, 버튼 클릭) |
| 진행률 Bar | 대용량 파일 업로드/다운로드, 일괄 처리 |

## 10.3 HTTP 상태 코드별 처리

| 코드 | 처리 방식 | Component |
|------|---------|-----------|
| 400 Bad Request | Form 오류 필드 인라인 표시 | COMP-FEEDBACK-005 |
| 403 Forbidden | Alert "접근 권한이 없습니다" + 이전 페이지 | COMP-FEEDBACK-003 |
| 404 Not Found | "요청한 데이터를 찾을 수 없습니다" + 목록 이동 | COMP-PAGE-002 |
| 409 Conflict | Alert "다른 사용자가 수정 중입니다" | COMP-FEEDBACK-003 |
| 500 Server Error | Alert "일시적 오류. 잠시 후 다시 시도해주세요" | COMP-PAGE-003 |

## 10.4 타임아웃 처리

- API 타임아웃 기준: **30초**
- 표시: Toast Error + "재시도" 버튼
- 3회 재시도 실패 시 MANUAL 처리 전환

## 10.5 대용량 데이터 (10,000건 이상)

- 가상 스크롤 (Virtual Scroll) 적용
- 페이지 로딩: 최대 100건 단위
- 엑셀 다운로드: 백그라운드 처리 + 완료 Notification

## 10.6 동시 편집 충돌 (Optimistic Lock)

```
수정 저장 시 버전 충돌 감지
→ Confirm: "다른 사용자가 변경했습니다. 최신 데이터를 불러오시겠습니까?"
  ├─ 확인: 최신 데이터 재조회
  └─ 취소: 현재 입력 유지 (저장 불가 상태)
```

## 10.7 팝업 중첩

- **최대 2 depth 원칙**: 팝업 위에 Confirm(P-042)만 허용
- 3 depth 이상 필요 시 화면 분리 검토

## 10.8 Partial Success (부분 성공)

```
일괄 처리 시 일부만 성공:
→ Toast Warning "N건 성공 / M건 실패"
→ Summary Modal: 성공 N건 목록 + 실패 M건 목록+사유
```

## 10.9 오프라인 상태

```
오프라인 감지 → 상단 배너: "인터넷 연결이 끊겼습니다" (#FEF3C7)
오프라인 중 액션 → Toast Warning "오프라인 상태에서는 사용할 수 없습니다"
재연결 → Toast Info "연결되었습니다" + 배너 자동 제거
```

## 10.10 세션 타임아웃

```
만료 5분 전: 상단 Countdown Timer + "세션이 곧 만료됩니다" 경고
만료 시: 로그인 페이지 Redirect + Alert "세션이 만료되었습니다"
```

---

---

# Chapter 11. 사용성(Usability) 평가 기준

> **목적**: UI Pattern 결정 시 사용자 사용성을 최우선으로 고려하기 위한 평가 기준을 정의한다.

---

## 11.1 사용성 4대 평가 기준

| 기준 | 설명 | 측정 지표 |
|------|------|----------|
| 학습 비용 (Learnability) | 사용자가 처음 접했을 때 업무 수행까지 걸리는 시간 | 첫 사용 완료 시간, 도움말 참조 횟수 |
| 인지 부하 (Cognitive Load) | 한 화면에서 사용자가 처리해야 하는 정보량 | 화면 내 필드 수, 동시 표시 Zone 수, 선택지 수 |
| 작업 효율 (Efficiency) | 반복적 업무 수행 시 소요되는 클릭/입력 횟수 | 목표 완료까지 클릭 수, 화면 전환 횟수, 키보드 단축키 지원 |
| 오류 방지 (Error Prevention) | 사용자 실수를 사전에 방지하는 정도 | 유효성 검증 커버리지, 되돌리기 가능 여부, Confirm 적절성 |

## 11.2 Pattern별 사용성 고려 포인트

| Pattern | 학습 비용 | 인지 부하 | 작업 효율 | 오류 방지 | 핵심 고려 |
|---------|---------|---------|---------|---------|---------|
| P-001 Search List | 낮음 | 낮음 | 높음 | 중간 | 검색 조건 기본값 설정, 자주 쓰는 조건 즐겨찾기 |
| P-002 Simple Form | 낮음 | 중간 | 중간 | 높음 | Tab 순서 최적화, 필수 필드 명확 표시, 자동 포커스 |
| P-012 Master-Detail | 중간 | 중간 | 높음 | 중간 | Master 선택 시 Detail 자동 갱신, 선택 상태 명확 표시 |
| P-014 Wizard | 중간 | 낮음 | 중간 | 높음 | Step 간 되돌아가기 허용, 임시저장, 진행률 표시 |
| P-020 Approval | 높음 | 높음 | 중간 | 높음 | 결재선 시각화, 현재 단계 강조, 승인/반려 사유 필수화 |
| P-021 Dashboard | 낮음 | 중간 | 높음 | 낮음 | 핵심 KPI 상단 배치, 드릴다운 클릭 지원 |
| P-022 Excel Upload | 높음 | 높음 | 높음 | 높음 | 양식 다운로드 버튼 우선 노출, 오류 행 즉시 하이라이트 |

## 11.3 사용성 기반 UI 결정 보완 규칙

| 상황 | 사용성 우선 규칙 |
|------|---------------|
| Form 필드 20개 이상 | 한 화면에 모두 노출하지 않고 Tab/Wizard로 분할하여 인지 부하 감소 |
| 검색 조건 7개 이상 | 기본 3개 노출 + 고급 검색 접기/펼치기로 학습 비용 감소 |
| 일괄 처리 + 비가역적 | 반드시 Confirm 거치고 결과 Summary 제공하여 오류 방지 |
| 동일 업무 반복 수행 | 마지막 검색 조건 유지, 키보드 단축키 지원으로 효율 향상 |
| 모바일 사용 환경 | 터치 영역 확보, 입력 최소화, 드롭다운 우선 사용으로 학습 비용 감소 |
| Lookup 빈번한 필드 | 최근 사용/즐겨찾기 목록 제공 (COMP-NAV-005) |

---

---

# Chapter 14. UIUX Guide 코드 체계 매핑

> **목적**: 기존 UIUX_GUIDE_METHODOLOGY.md에서 정의한 코드 체계와 본 문서 v2.0 코드 체계 간 양방향 매핑을 제공한다.

---

## 14.1 레이아웃 코드 매핑 (L-코드 ↔ Pattern)

| UIUX Guide 코드 | UIUX Guide 명칭 | v2.0 Pattern | v2.0 명칭 | 적용 업무 유형 |
|----------------|---------------|-------------|----------|-------------|
| L-01 | Single Panel | P-001, P-023 | Search List, Bulk Action | TYPE-01, TYPE-05 |
| L-02 | Master-Detail (좌우) | P-012, P-015, P-032 | Master-Detail, Split View, Tree | TYPE-02, TYPE-04, TYPE-09 |
| L-03 | Full Form | P-002, P-013 | Simple Form, Multi-Tab | TYPE-03, TYPE-04 |
| L-04 | Wizard (Step) | P-014 | Wizard Form | TYPE-07 |
| L-05 | Dashboard Grid | P-021, P-029 | Dashboard, Monitoring | TYPE-08, TYPE-12 |

## 14.2 Grid 유형 상세 정의 (GRID-코드 ↔ Component)

| UIUX Guide 코드 | 명칭 | v2.0 Component | 정의 | 적용 조건 |
|----------------|------|---------------|------|---------|
| GRID-01 | 표시 전용 Grid | COMP-DISPLAY-001 (ReadOnly Variant) | 순수 데이터 표시, 클릭/선택 반응 없음 (`cursor: default`) | 결과 미리보기, 이력 조회, 급여명세 |
| GRID-02 | 인라인 편집 Grid | COMP-INPUT-002 | 셀 클릭 시 직접 편집, 행 추가/삭제 가능 | 상세 품목 입력 (발주, 예산) |
| GRID-03 | 단일 선택 Grid | COMP-DISPLAY-001 (Selectable Variant) | Row 클릭 시 Highlight(`#EFF6FF`) + 상세 연동 (`cursor: pointer`) | Master-Detail 패턴 (코드관리, 메뉴관리) |
| GRID-04 | 다중 선택 Grid | COMP-DISPLAY-001 (Checkbox Variant) | 첫 컬럼 Checkbox, 헤더 전체선택 지원 | 일괄 처리 (결재 일괄승인, 삭제) |
| GRID-05 | 트리 Grid | COMP-DISPLAY-002 | 계층 구조, 펼치기/접기, 들여쓰기 | 조직도, 계정과목 |
| GRID-06 | 피벗/통계 Grid | COMP-DISPLAY-001 (Pivot Variant) | 집계 행/열, 합계/소계 강조, 컬럼 고정 | 부서별 예산, 통계 리포트 |

> ⚠️ **GRID-01과 GRID-03의 핵심 차이**: GRID-01은 클릭해도 반응 없는 순수 표시 전용, GRID-03은 Row 클릭 시 Highlight + 상세 연동

## 14.3 Popup/Panel 코드 매핑 (POP/PANEL-코드 ↔ Pattern)

### Modal 계열

| UIUX Guide 코드 | 명칭 | 크기 | v2.0 Pattern | 용도 | 닫기 방식 |
|----------------|------|------|-------------|------|---------|
| POP-01 | Alert | 400px | P-042 (Alert variant) | 처리 완료, 단순 오류 | 확인 버튼만 (ESC 미지원) |
| POP-02 | Confirm | 400px | P-042 (Confirm variant) | 삭제 확인, 저장 확인 | 취소 버튼, ESC |
| POP-03 | Form Popup | 600px | P-041 (Small variant) | 소규모 입력 (승인 사유) | X, 취소, ESC |
| POP-04 | Search Popup | 800px | P-024 | 코드/데이터 검색 선택 | X, 취소, ESC |
| POP-05 | Detail Popup | 900px | P-040 | 컨텍스트 유지 상세 조회 | X, ESC |
| POP-06 | Full Popup | 1200px | P-041 (Full variant) | 복잡한 입력, 다수 탭 | X, 취소 |

### Panel 계열

| UIUX Guide 코드 | 명칭 | 크기 | v2.0 Component | 용도 | Dimmed |
|----------------|------|------|---------------|------|--------|
| PANEL-01 | Side Panel | 480px (Desktop), 100% (Mobile) | COMP-LAYOUT-008 (Right variant) | 목록 컨텍스트 유지+상세/편집 | 선택적 |
| PANEL-02 | Bottom Sheet | 60~80% 높이 | COMP-LAYOUT-008 (Bottom variant) | Mobile에서 POP-03~05 대체 | 있음 |

### Popup vs Panel 선택 기준

| 조건 | 선택 |
|------|------|
| 컨텍스트 유지 + 단순 조회/편집 | PANEL-01 |
| 비가역적 처리 확인 | POP-02 (P-042) |
| 데이터 검색 후 선택 | POP-04 (P-024) |
| 복잡한 입력 (다수 필드/탭) | POP-06 (P-041 Full) |
| 단순 알림 (수동 닫기) | POP-01 (P-042 Alert) |
| Mobile 환경 | PANEL-02 (Bottom Sheet) |

## 14.4 이벤트 코드 교차 참조

| UIUX Guide 코드 | 명칭 | v2.0 코드 | v2.0 참조 섹션 |
|----------------|------|----------|-------------|
| EVT-01 | 조회 버튼 클릭 | EVT-SRCH | Ch6.2 조회 시퀀스 |
| EVT-02 | Row 클릭/선택 | EVT-CLK (Row) | Ch6.2 Row 클릭 |
| EVT-03 | 등록 버튼 클릭 | EVT-CLK (Register) | Ch6.2 등록 |
| EVT-04 | 저장 버튼 클릭 | EVT-SUB | Ch6.2 저장 시퀀스 |
| EVT-05 | 삭제 버튼 클릭 | EVT-CLK (Delete) | Ch6.2 삭제 시퀀스 |
| EVT-06 | 승인/반려 | EVT-STCHG | Ch6.2 승인/반려 |
| EVT-07 | 페이지 이동 | EVT-PAGE | Ch6.2 페이지 |
| EVT-08 | 컬럼 정렬 | EVT-SORT | Ch6.2 정렬 |
| EVT-09 | 검색 초기화 | EVT-CLK (Reset) | Ch6.2 초기화 |
| EVT-10 | 엑셀 다운로드 | EVT-CLK (Export) | Ch6.2 엑셀 |
| EVT-11 | 페이지 이탈 감지 | EVT-CLK (Navigate) | Ch6.2 미저장 이탈 |

---

## 14.5 확장 Component 상세 (AUTH / PAGE / MEDIA)

### 인증/계정 (COMP-AUTH)

| Component ID | 명칭 | 구성 요소 | 주요 이벤트 | 적용 패턴 |
|-------------|------|---------|-----------|---------|
| COMP-AUTH-001 | Login Form | ID 입력(COMP-FIELD-001), PW 입력(COMP-FIELD-008), 로그인 버튼(COMP-ACTION-001), 자동 로그인 체크(COMP-FIELD-017), 비밀번호 찾기 링크(COMP-ACTION-005) | Submit, Enter | 독립 페이지 |
| COMP-AUTH-002 | Register Form | 입력 필드 그룹, 약관 동의(COMP-FIELD-017), 가입 버튼, 중복 확인(Blur 검증) | Submit, 중복 확인 | P-014 Wizard 또는 독립 |
| COMP-AUTH-003 | Password Reset | 이메일/휴대폰 입력, 인증 코드(COMP-FIELD-038), 새 비밀번호(COMP-FIELD-008 ×2) | 인증 요청, 확인 | 독립 페이지 |
| COMP-AUTH-004 | Lock Screen | 사용자 정보 표시, PW 재입력 | Submit | 독립 페이지 |
| COMP-AUTH-005 | 2FA Input | OTP 입력(COMP-FIELD-038), 타이머(COMP-FEEDBACK-015), 재전송 | 확인, 재전송 | Popup 또는 독립 |
| COMP-AUTH-006 | Profile Card | 아바타(COMP-DISPLAY-012), 정보 표시(COMP-DISPLAY-010), 편집 버튼 | 편집, 저장 | 독립 페이지 |

### 페이지 특수 (COMP-PAGE)

| Component ID | 명칭 | 구성 요소 | 적용 |
|-------------|------|---------|------|
| COMP-PAGE-001 | Maintenance | 일러스트 + 안내 메시지 + 예상 복구 시간 | 시스템 점검 |
| COMP-PAGE-002 | Error 404 | 일러스트 + "페이지를 찾을 수 없습니다" + 홈 이동 버튼 | URL 오류 |
| COMP-PAGE-003 | Error 500 | 일러스트 + "일시적 오류" + 재시도/홈 이동 버튼 | 서버 오류 |
| COMP-PAGE-004 | Pricing Table | 플랜별 카드(COMP-DISPLAY-004) + 비교 테이블 + CTA 버튼 | 가격 비교 |
| COMP-PAGE-005 | FAQ | 아코디언(COMP-LAYOUT-007) + 검색 | 자주 묻는 질문 |
| COMP-PAGE-006 | Notification List | 알림 목록(COMP-DISPLAY-001) + 필터(전체/안읽음) + 읽음 처리 | 알림 목록 |
| COMP-PAGE-007 | Treeview | Tree Grid(COMP-DISPLAY-002) + Detail Panel | 조직도, 카테고리 |
| COMP-PAGE-009 | Email Template | Rich Text(COMP-INPUT-004) + 변수 삽입 + 미리보기 | 이메일 작성 |

### 아이콘/멀티미디어 (COMP-MEDIA)

| Component ID | 명칭 | 속성 | 적용 |
|-------------|------|------|------|
| COMP-MEDIA-001 | Icon Set | 스타일(Line/Solid/Duotone), 크기(16/20/24px), 색상 상속 | 전역 |
| COMP-MEDIA-002 | Illustration | SVG/PNG, 크기(200~400px), Empty State/Error 용 | 특수 상태 페이지 |
| COMP-MEDIA-003 | Map View | 지도 API, 마커, 경로, 영역 | 물류 추적, 위치 관리 |

---

```
COMP-[분류]-[순번 3자리]

분류 코드:
  LAYOUT    레이아웃 요소
  DISPLAY   데이터 표시 요소
  INPUT     입력 (Container-Level)
  FIELD     입력 필드 (Field-Level)
  NAV       탐색/선택 요소
  FEEDBACK  피드백/상태 요소
  ACTION    액션 요소
  NAVIGATE  네비게이션 요소
  AUTH      인증/계정 요소
  PAGE      페이지/특수 요소
  MEDIA     미디어/아이콘 요소

예시:
  COMP-FIELD-013  = 입력 필드 13번 = Dropdown Select
  COMP-DISPLAY-001 = 데이터 표시 1번 = Data Grid
  COMP-ACTION-001  = 액션 1번 = Primary Button
```

확장 시 해당 분류의 마지막 번호 다음 번호를 사용한다.  
예: COMP-FIELD-039 다음은 COMP-FIELD-040

---

# 부록 B: 화면 ID 채번 규칙

```
SCR-[도메인 3자리]-[업무 약어]-[순번 3자리]

도메인 코드:
  ORD   주문/영업 (Sales/Order)
  CUS   고객 (Customer)
  PRD   제품 (Product)
  PRO   생산 (Production)
  INV   재고 (Inventory)
  PUR   구매 (Procurement)
  LOG   물류 (Logistics)
  FIN   정산/회계 (Finance)
  QUA   품질 (Quality)
  SYS   시스템 (System)
  GRP   그룹웨어 (Groupware)

업무 약어 예시:
  LIST  목록 조회
  REG   등록
  EDIT  수정
  MGMT  관리
  APPR  승인
  DASH  대시보드
  CONF  설정
  MON   모니터링
  HIST  이력

하위 화면 접미사:
  -M01, -M02  Modal/Popup (순번)
  -T01, -T02  Tab (순번)
  -S01, -S02  Sub-화면/Step (순번)

예시:
  SCR-ORD-LIST-001       주문 목록
  SCR-ORD-LIST-001-M01   주문 상세 팝업
  SCR-ORD-REG-001        주문 등록
  SCR-ORD-REG-001-S01    주문 등록 Step 1
  SCR-SYS-CONF-001       시스템 설정
```

---

# 부록 C: 필드 타입 결정 매트릭스

| 데이터 특성 | 입력 형태 | 선택 가능 값 | 결정 Component |
|-----------|----------|------------|---------------|
| 자유 텍스트, 단일 행, 100자 이내 | 키보드 입력 | 없음 | COMP-FIELD-001 Text Input |
| 자유 텍스트, 다중 행 | 키보드 입력 | 없음 | COMP-FIELD-002 Textarea |
| 숫자 (정수/소수) | 키보드 입력 | 범위 제한 | COMP-FIELD-003 Number Input |
| 금액 | 키보드 입력 | 범위 제한 | COMP-FIELD-004 Currency Input |
| 이메일 | 키보드 입력 | 없음 | COMP-FIELD-005 Email Input |
| 전화번호 | 키보드 입력 | 없음 | COMP-FIELD-006 Phone Input |
| URL | 키보드 입력 | 없음 | COMP-FIELD-007 URL Input |
| 비밀번호 | 키보드 입력 | 없음 | COMP-FIELD-008 Password Input |
| 날짜 | 달력 선택 | 날짜 범위 | COMP-FIELD-009 Date Picker |
| 기간 (시작~종료) | 달력 선택 2개 | 날짜 범위 | COMP-FIELD-010 Date Range Picker |
| 시간 | 시간 선택 | 시간 범위 | COMP-FIELD-011 Time Picker |
| 날짜+시간 | 복합 선택 | 범위 | COMP-FIELD-012 DateTime Picker |
| 코드값 Boolean | 토글/체크 | 2개 (Yes/No) | COMP-FIELD-019 Toggle / COMP-FIELD-017 Checkbox |
| 코드값 2~3개 | 선택 | 고정 목록 | COMP-FIELD-016 Radio Button |
| 코드값 4~10개 | 선택 | 고정 목록 | COMP-FIELD-013 Dropdown |
| 코드값 11~30개 | 검색+선택 | 고정 목록 | COMP-FIELD-015 Combobox |
| 코드값 31+개 | 팝업 검색 | 대량 | COMP-NAV-001 Lookup Popup |
| 다중 선택 (코드값) | 다중 체크 | 목록 | COMP-FIELD-018 / COMP-FIELD-014 |
| 파일 (단일) | 파일 선택 | 없음 | COMP-FIELD-025 File Input |
| 파일 (다중) | 파일 선택 | 없음 | COMP-FIELD-026 Multi File Input |
| 이미지 | 파일+미리보기 | 없음 | COMP-FIELD-027 Image Upload |
| 주소 | 검색+입력 | 우편번호 DB | COMP-FIELD-030 Address Input |
| 마스킹 (주민번호 등) | 키보드 | 형식 제한 | COMP-FIELD-031 Masked Input |
| 시스템 자동 생성 | 표시 전용 | 없음 | COMP-FIELD-034 Calculated Field |
| 다른 필드에 종속 | 조건부 | 상위 값 기반 | COMP-FIELD-036 Dependent Field |
| 태그 | 태그 입력 | 기존+자유 | COMP-FIELD-037 Tag Input |
| 읽기 전용 | 표시만 | 없음 | COMP-FIELD-033 Read-Only Field |
| 숨김 (시스템 값) | 비노출 | 없음 | COMP-FIELD-032 Hidden Field |

---

# 부록 D: Work MD 섹션별 UI 추출 체크리스트

| Work MD 섹션 | 추출 항목 | UI 결정 기여 | 확인 |
|-------------|----------|-------------|------|
| 0) Meta | Work ID, Sources | 화면 ID 기준, 추적 연결 | [ ] |
| 1) Summary | One-liner, Goals, Scope (In/Out) | 업무 유형 1차 판별, 화면 목적/범위 | [ ] |
| 2) Terms | 모든 용어 | UI 라벨링 (필드명, 버튼명) | [ ] |
| 3) Use Cases | Actor, 시작/종료 조건, 통제 포인트 | 역할별 화면/권한, 진입/이탈 조건 | [ ] |
| 4) Actions | CRUD 유형, 트리거, 포함 여부 | 이벤트 정의, 업무유형 세분화 | [ ] |
| 5) Local Rules | Validation, Constraint, Authorization, Timing, Dependency | 필드 제어, 유효성 UI, 조건부 UI | [ ] |
| 6) Exceptions | 발생 조건, 처리 원칙 (6가지), 재시도 | 에러 UI, 피드백 시퀀스 | [ ] |
| 7) Risks | 탐지 방식, 완화 기준 | 경고/알림 UI, 모니터링 지표 | [ ] |
| 8) Integrations | 외부 시스템, Direction, When | Lookup, 비동기 UI, 동기/비동기 선택 | [ ] |
| 9) Business Objects | Object 수, Attributes, Master Data, States, Transitions | 데이터 구조, 필드 목록, 상태 UI, 입력 UI 강제 | [ ] |
| 10) Relations | Cardinality, Self-ref | Master-Detail/계층/N:N 판별 | [ ] |
| 11) User Journeys | Journey Type, Step 수/순서, 분기점, Actor 변경 | 화면 흐름, Navigation, 단계별 UI | [ ] |
| 12) Evidence | Source File | 추적 가능성 확보 | [ ] |

---

# 변경 이력

| 버전 | 날짜 | 변경 내용 | 구분 |
|------|------|---------|------|
| v1.0 | - | 업무 유형 → UI Pattern 1:1 매핑 (18개 Pattern) | 원천 |
| v2.0.0 | 2026-03-10 | 6차원 복합 매핑 모델, 150+ Component, 40+ Pattern, 이벤트/정책/Navigation 전체 신규 | 전면 개편 |
| v2.0.1 | 2026-03-10 | 검증 보정: Ch9 반응형/접근성, Ch10 Edge Case, Ch11 사용성 평가, Ch14 UIUX Guide 코드 매핑, GRID 6유형 상세, POP/PANEL 상세, 확장 Component 상세화, 부록 번호 정리, 문서 구조 통합 | 검증 보정 |

---

*본 문서는 프로젝트 진행 중 신규 Pattern/Component 추가 또는 기준 변경 시 즉시 갱신합니다.*  
*변경 시 기획/개발/디자인 3자 리뷰 후 확정합니다.*
