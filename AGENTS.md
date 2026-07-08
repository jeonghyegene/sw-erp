# AGENTS.md — AI 에이전트 작업 지침

본 파일은 Codex / 다른 AI 어시스턴트가 본 프로젝트에서 화면을 만들 때 따라야 할 규칙입니다.
사용자가 명시적으로 면제하지 않는 한, 모든 화면 작업에 자동 적용됩니다.

---

## 🎯 작업 철학 — 사용자 인지 비용 최소화

모든 UIUX 결정의 최상위 기준이자, 아래의 모든 세부 규칙이 충돌하거나 모호할 때 판단의 기준이 된다.

> **항상 최적화된 구조와 간결한 정보 구성으로, 사용자가 인지하기 쉽고 사용하기 편리한 화면을 만든다.**

이 철학을 적용하는 4 가지 원칙:

### 1. 간결한 정보 구성 (Less is More)
- 한 화면에 노출하는 정보 항목 수를 **최소화**한다. 모든 필드를 다 보여주는 게 아니라 **사용자가 그 순간 필요한 것**만 보여준다.
- 파생·중복·부가 정보는 인라인 요약 행(`.po-info` 패턴) 또는 상세 OC 로 분리한다.
- 그리드 컬럼이 18개 이상이면 "정말 한 줄에 다 봐야 하는가?" 를 다시 묻는다. 자주 쓰지 않는 컬럼은 상세 OC 로 옮긴다.

### 2. 최적화된 구조 (Natural Flow)
- 시선의 자연스러운 흐름을 따른다: **좌→우, 상→하, 핵심→부가**.
- 그리드 컬럼 정렬: 식별자(좌) → 본질 정보(중) → 메타·액션(우).
- 폼: 필수·핵심 필드 위, 선택·부가 필드 아래. 자동 채움 필드는 트리거 필드 바로 옆 또는 아래.

### 3. 즉시 인지 (Recognize, Don't Read)
- 라벨·아이콘·색상 pill 등으로 의미가 **단어를 읽기 전에 전달**되도록.
  - 상태 pill: success(녹)/warning(주)/danger(적)/info(청)/muted(회) 의미 일관 유지.
  - 자재구분 pill: 원자재=info / 부자재=success (전 화면 통일).
  - 사유 pill: 같은 사유면 어디서든 같은 색.
- 강조: 식별자·금액·핵심 수치는 brand-primary 색 또는 굵게. 보조 정보는 muted.

### 4. 클릭 비용 최소화 (Minimize Friction)
- 자주 쓰는 액션은 노출(툴바·행 직접 버튼), 드물게 쓰는 액션은 상세 OC 내부로 숨김.
- 자동 채움 가능한 모든 필드는 자동 채운다. 사용자가 다시 입력하지 않게 한다.
- "발주 동일" 같은 단축 토글이 가능한 곳은 항상 제공한다.

### 의심스러우면 빼라 (When in doubt, leave it out)
"있으면 좋을 것 같은" 정보·버튼·옵션은 **추가하지 않는다**. 정말 필요해진 시점에 추가하는 편이, 처음부터 노출해서 인지 부담을 늘리는 것보다 항상 낫다.

---

## 🚨 최우선 3축 규칙

### ① 모든 화면 UI/UX 작업 시 [ui-kit.html](ui-kit.html) 을 **최우선 참고원** 으로 사용한다.
### ② UI Kit 에 없거나 신규로 구성되는 UI/Component 는 반드시 UI Kit 에 **먼저 추가** 한 뒤 화면에 적용한다.
### ③ 화면 요소의 표기·정렬·동작은 [`uiux rule/`](uiux%20rule/) 폴더의 규칙 문서를 반드시 준수한다.

이 세 규칙은 한 묶음이며, 어느 하나도 생략될 수 없습니다.
- **UI Kit** = 시각/구현의 진실 공급원
- **uiux rule/** = 표기·정렬·동작·UX의 진실 공급원

---

## UIUX 규칙 문서 (필수 참조)

| 파일 | 내용 |
|---|---|
| [`uiux rule/SWADPIA_BE_UIUX_1.1.md`](uiux%20rule/SWADPIA_BE_UIUX_1.1.md) | 성원 애드피아 MES/ERP UIUX 공통 가이드 27개 카테고리 (날짜·금액·그리드·폼·버튼·상태·검색·코드·권한·파일·로딩·포커스·오류·결재·알림·이력·다중선택·탭·트리·도움말·즐겨찾기·엑셀·권한별UI·Breadcrumb·뒤로가기·메모·설정) |
| [`uiux rule/UI_Mapping_Rule_Guide_v2.md`](uiux%20rule/UI_Mapping_Rule_Guide_v2.md) | UI Mapping Rule Guide v2.0 — 컴포넌트(COMP-*) + 패턴(P-001 Search List, P-002 Simple Form, P-003 Detail View, P-004 Grid Management, P-010 Search+Detail, P-012 Master-Detail, P-013 Multi-Tab Detail, P-014 Wizard Form…) + 업무 유형 코드 + 상태 코드 |

### 작업 시작 시 자동 수행할 사전 절차 (3단계)

화면 생성·수정 요청을 받으면 즉시 코드를 작성하지 말고 먼저:

```
STEP 1. 📖 uiux rule/ 폴더 검토 (Grep / Read)
   → 작업 대상 요소가 다루는 카테고리를 SWADPIA 가이드에서 확인
     예: 그리드 컬럼 → §3 그리드 표시 규격 (정렬·행높이·페이징)
     예: 검색 영역  → §7 검색 및 필터 규격
     예: 상태 뱃지  → §6.1 상태 뱃지
   → UI Mapping Rule 에서 패턴 식별 (P-001 ~ P-014 등)

STEP 2. 🎨 UI Kit 검토 (ui-kit.html / ui-kit.css / components.css)
   → STEP 1 에서 식별한 규칙·패턴을 구현할 컴포넌트가 있는지 확인
   → 일치 → 그대로 사용
   → 유사 → .cls--variant 수정자로 확장
   → 신규 → UI Kit 등록 절차 진입

STEP 3. ✅ 화면 적용
   → UI Kit 클래스 + uiux rule 규칙 모두 만족하는 코드 작성
   → 응답 시 어떤 룰/패턴/클래스를 따랐는지 명시
```

이 사전 검토를 건너뛰고 화면 코드부터 작성하지 말 것.

### SWADPIA §3.1 컬럼 정렬 룰 (Grid 작업 시 자동 적용)

| 정렬 | 데이터 종류 | 예시 |
|---|---|---|
| **좌측** | 텍스트·명칭·ID·이메일·이름 | 이름, 부서, 사번, 계좌번호, 이메일 |
| **중앙** | 체크박스·아이콘·버튼·상태·코드·날짜·유형, **No(행 번호)** | 상태, 입사일, 코드, 발령 유형, **No** |
| **우측** | 숫자·금액·수량 | 단가, 잔액, 수량, 금리 |

⚠️ **No 컬럼 예외 — 중앙 정렬 (도메인 표준, 2026-05-29 확정)**

No 는 SWADPIA 일반 룰의 "숫자→우측" 에서 제외하고 **중앙 정렬**로 통일. 이유:
- No 는 데이터 값(수량·금액)이 아니라 *행 번호* 라는 메타 정보이기 때문에 좌·우 정렬보다 중앙 정렬이 시각적으로 균형 잡힘
- 첫 컬럼이라 페이지 +20px 라인 정렬이 적용됨 → 우측 정렬이면 헤더·데이터가 좁은 컬럼 안에서 우측으로 몰려 인식이 어색해짐
- grid-schemas.js 의 모든 `key: 'no'` 컬럼은 `align: 'center'` 로 통일

### No 컬럼 — 내림차순 표시 표준 ⚠️ **모든 그리드 적용**

그리드 첫 컬럼의 **No 값은 항상 내림차순 (N → 1)** 으로 부여한다. 데이터의 등록 시점 / 정렬 방향과 무관하게 첫 행이 가장 큰 No, 마지막 행이 1 인 형태로 일관 표시 — **최신 행이 위쪽**으로 보이는 도메인 표준.

```js
// ✅ 권장 (도메인 표준)
list() {
  if (!_store) _store = _seed();
  _store.forEach((r, i) => r.no = _store.length - i);   // N → 1 (최신이 위로)
  return _store;
}

// ❌ 금지 — 오름차순 (No 1번을 위로)
_store.forEach((r, i) => r.no = i + 1);
```

**이유** — No 는 행 위치를 시각적으로 파악하는 보조 정보이자 누적 등록 건수를 빠르게 인지하는 신호. 내림차순 통일로 (1) 사용자가 "맨 위가 가장 최근에 등록된 N번째 건" 임을 직관 학습, (2) 첫 행의 No 값이 곧 총 등록 건수로 읽힘. 데이터 정렬 자체는 store 의 순서 (시드 정렬 / 정렬 컬럼) 로 제어하고 No 는 행 위치 기반으로 부여한다.

`grid-schemas.js` 에 새 컬럼 추가 시 이 룰을 무조건 적용. 검증 스크립트:

```bash
node -e "/* schemas 의 columns 룰 매칭 검사 (자세한 내용 README 참고) */"
```

### Grid 레이아웃 룰 — 영역 분할 (Fix / Scroll) ⚠️ **모든 그리드에 적용**

모든 그리드 화면(표준 `table.data`, Product Grid, Activity List 등 종류 무관)은 영역별로 **고정(Fix) / 스크롤(Scroll)** 동작을 분리한다.

| 영역 | 동작 | 설명 |
|---|---|---|
| **조회 영역** (검색 패널) | **🔒 Fix** | 페이지 상단 고정 (스크롤 시 함께 움직이지 않음) |
| **툴바 영역** (총 N건 · 엑셀 · 등록 버튼) | **🔒 Fix** | 조회 영역 바로 아래 고정 |
| **그리드 헤더** (컬럼명 행) | **🔒 Fix** | 데이터 스크롤 시 `position: sticky; top:0` 으로 항상 보임 |
| **데이터 행 (Data Row)** | **🔓 Scroll ↕↔** | **유일하게 스크롤되는 영역** — 행이 많거나 컬럼이 넓으면 수직·수평 스크롤 |
| **페이지네이션 영역** (페이지당 · 1 2 3 ›) | **🔒 Fix** | 페이지 하단 고정 (그리드 스크롤과 무관하게 항상 노출) |

```
┌────────────────────────────────────────┐
│ [조회: 기간·검색조건·검색어·조회 버튼]      │  ← 🔒 Fix
├────────────────────────────────────────┤
│ [툴바: 총 N건 · [엑셀] [+ 등록]]            │  ← 🔒 Fix
├────────────────────────────────────────┤
│ [컬럼 헤더: No · 신청번호 · 자재명 · …]       │  ← 🔒 Fix (sticky top)
│ ┌────────────────────────────────────┐ │
│ │ 행 1                                │ │
│ │ 행 2                                │ │  ← 🔓 Data Row 만 SCROLL ↕↔
│ │ 행 N                                │ │
│ └────────────────────────────────────┘ │
├────────────────────────────────────────┤
│ [페이지네이션: 0-0/총 0건 · 페이지당 20]     │  ← 🔒 Fix (bottom)
└────────────────────────────────────────┘
```

**❌ 금지 패턴** — 페이지 전체가 스크롤되어 조회 영역·툴바·헤더·페이지네이션이 데이터와 함께 위/아래로 움직임. 사용자가 결과를 보면서 다시 조회하려면 위로 스크롤해야 하고, 페이지 이동도 끝까지 내려가야 하는 최악의 UX.

**✅ 권장 구현** —
- 페이지 마운트는 `class="page"` 만 사용 (NOT `page--scroll`). `page--scroll` 은 전체 페이지를 스크롤되게 만들어 본 룰을 위배함.
- 페이지 컨테이너는 `display: flex; flex-direction: column; height: 100%` 로 깔고, 데이터 행 영역만 `flex: 1; overflow: auto` 로 늘어나도록 한다.
- 그리드 헤더는 `position: sticky; top: 0; z-index: 1` 로 데이터 행 스크롤 시 상단 고정.

#### 그리드 컬럼 정렬 — **데이터는 §3.1, 헤더는 데이터 동일, 첫·마지막 컬럼은 ±20px 라인 강제**

| 항목 | 규칙 |
|---|---|
| **데이터 정렬** | SWADPIA §3.1 표준 — schema 의 `align` 그대로 (텍스트→좌, 코드/상태/날짜/일시→중, 숫자/금액→우) |
| **헤더 정렬** | 데이터와 *항상 동일 방향* — schema 의 col-* 클래스를 헤더·데이터가 공유 |
| **첫 컬럼 위치** | 헤더·데이터 중 *더 긴 쪽*의 **좌측 끝** X = 페이지 +20px 라인 |
| **마지막 컬럼 위치** | 헤더·데이터 중 *더 긴 쪽*의 **우측 끝** X = 페이지 -20px 라인 |

**핵심** — text-align 을 강제로 left/right 로 바꾸지 않는다 (헤더가 데이터와 다른 방향이 되면 안 됨). 대신 첫·마지막 컬럼의 셀 폭을 콘텐츠 폭(`max(header, data) + paddings`) 으로 축소시켜, 좌/중/우 어느 정렬이든 더 긴 쪽의 outer edge 가 자동으로 ±20px 라인에 도달하도록 한다.

**왜 이렇게?**
- 헤더가 우측인데 데이터가 좌측이면 시각적으로 따로 노는 사고 → 헤더는 항상 데이터 방향과 동일
- 텍스트 컬럼(메모, 미팅내용)은 좌측 정렬이 자연스러움 → 헤더도 좌측
- 날짜 컬럼(등록일시)은 중앙 정렬이 §3.1 표준 → 헤더도 중앙
- 숫자 컬럼(금액, No)은 우측 정렬이 §3.1 → 헤더도 우측
- 첫/마지막 컬럼의 콘텐츠 가장자리만 페이지 ±20px 라인에 맞춰 검색 패널·툴바·페이지네이션과 시각 정렬

```
✅ 자료실 예시 — 데이터 §3.1 정렬, 헤더 동일, 양 끝 ±20px 정렬
┌────────────────────────────────────────────────┐
│  [기간 ▾] [검색조건 ▾] [검색어]    [조회]        │  ← +20px / -20px
│  총 N건                  [엑셀] [+ 등록]         │
├────────────────────────────────────────────────┤
│ No │카테고리│  제목  │ 파일 │  등록자  │   등록일시 │  ← §3.1 + 동일방향
│  4 │업무협조│Q2 결산  │  1  │ 이수정 │26/05/25 15:08│
│(우) │  (중) │  (좌)  │ (중) │  (좌) │     (중)   │
├────────────────────────────────────────────────┤
│  1-4/총 7건                       [« ‹ 1 › »]   │
└────────────────────────────────────────────────┘
   ↑                                              ↑
   페이지 +20px (No 헤더 좌측끝)             페이지 -20px (등록일시 데이터 우측끝)
```

❌ **금지** —
- 헤더와 데이터의 정렬 방향이 다른 케이스 (예: 헤더=우측 / 데이터=중앙)
- text-align: right/left 를 첫·마지막 컬럼에 강제 적용 (schema 의 §3.1 정렬을 깨뜨림)

**두 단계 적용**:

| 단계 | 적용 대상 | 효과 |
|---|---|---|
| **Stage 1** | 모든 그리드 (좁은+와이드 공통) | 첫 셀 `padding-left: 20px`, 마지막 셀 `padding-right: 20px` — content 가장자리를 페이지 ±20px 라인에 정렬 |
| **Stage 2** | 좁은 그리드만 (`:not([style*="min-width"])`) | `width: 1% !important` → 셀이 콘텐츠 폭으로 축소되어 좌/중/우 정렬 모두에서 더 긴 쪽의 outer edge 가 ±20px 라인 도달 |

**와이드 그리드 처리** — `<table class="grid" style="min-width:max-content;">` 처럼 가로 스크롤되는 그리드(예: 자재 > 업체발주내역, 자재정보, 부자재정보)는:
- **Stage 1 적용 O** — 첫 컬럼 content 좌측이 페이지 +20px 라인에 정렬됨 (첫 컬럼의 cell_left = page_left 이라 padding-left: 20px 가 정확히 작동)
- **Stage 2 적용 X** — `width: 1%` 가 schema 의 inline width 와 충돌해 컬럼 간격이 벌어지는 사고를 일으키므로 제외. 가로 스크롤이라 페이지 -20px 라인 자체가 의미 없어 마지막 컬럼의 outer edge 정렬은 보장하지 않음.

**Flex 컬럼 휴리스틱 — 잉여 폭 흡수 (컬럼 간격 최적화)**

좁은 그리드(table width: 100%)에서 schema 컬럼 width 합이 페이지 폭보다 작으면 잉여 폭이 모든 컬럼에 분산되어 간격이 넓어지는 사고가 발생. 이를 막기 위해 [grid.js](assets/js/grid.js) `_findFlexColumnIdx()` 가 *한 컬럼을 flex 로 지정* 해 잉여 폭을 그 컬럼이 단독 흡수하도록 한다.

선정 우선순위:
1. schema 에 `flex: true` 명시된 컬럼 (최우선)
2. (없으면) 좌측 정렬 컬럼 중 `width` 가 가장 큰 컬럼 — 주로 "제목/자재명/메모/대응 계획" 같은 본문 컬럼

flex 컬럼은 inline `width` 가 생략되어 브라우저 auto-layout 이 잉여 폭을 그 컬럼에 할당 → 다른 컬럼은 schema width 를 그대로 유지. schema 에 widest 좌측 컬럼이 없거나 자동 선정이 부적절하면 `flex: true` 를 명시로 지정.

**구현 (단일 진실원)** — `assets/css/components.css`:
```css
/* Stage 1 — 모든 그리드 (첫/마지막 셀 paddings) */
.grid thead th:first-child,
.grid tbody td:first-child  { padding-left: 20px; }
.grid thead th:last-child,
.grid tbody td:last-child   { padding-right: 20px; }

/* Stage 2a — 첫 컬럼 셀 축소 (모든 그리드, 와이드 포함) */
.grid thead th:first-child { width: 1% !important; white-space: nowrap; }

/* Stage 2b — 마지막 컬럼 셀 축소 (좁은 그리드만) */
.grid:not([style*="min-width"]) thead th:last-child {
  width: 1% !important;
  white-space: nowrap;
}

/* Stage 2c — 와이드 그리드의 모든 중간 컬럼 콘텐츠 폭 축소 (컬럼 간격 최적화)
   schema inline width 가 콘텐츠보다 크면 셀 내부 빈 공간으로 컬럼 간격이 넓어 보이는 사고 방지. */
.grid[style*="min-width"] thead th {
  width: 1% !important;
  white-space: nowrap;
}
```

**`.pgrid` (CSS grid 기반, 자재정보·부자재정보 등)** — `_buildProductGridPage` 의 head 와 각 row 가 별개 grid 컨테이너라 CSS 만으로 첫 컬럼 폭 동기화 불가. [pages.js](assets/js/pages.js) `_syncFirstColumnWidth()` 가 매 렌더 후 head + 모든 row 의 첫 셀 콘텐츠 폭을 측정해 max 값으로 통일 → 첫 컬럼이 콘텐츠 폭으로 축소되어 `.pgrid__head/__row` 의 `padding: 14px 20px` 가 +20px 라인에 content 좌측 끝을 정렬.

**원리 (수학적 검증)**:
- 셀이 `max(header, data) + paddings` 폭으로 축소 (`width: 1%` + `white-space: nowrap`)
- 좌측 정렬: 둘 다 cell_left + pl 위치 = 좌측 끝 공유
- 우측 정렬: 둘 다 cell_right - pr 위치 = 우측 끝 공유
- 중앙 정렬: inner area 폭 = 더 긴 쪽 폭 → 더 긴 쪽이 inner area 를 가득 채움 → 양 끝이 cell_left+pl / cell_right-pr 에 도달
- 첫 컬럼: pl=20 → 좌측 끝 = +20px / 마지막 컬럼: pr=20 → 우측 끝 = -20px (last col 의 cell_right = page_right)

**Product Grid (.pgrid)** — `_buildProductGridPage()` 의 standard 변형(`<table class="grid">`)은 위 .grid 룰 자동 적용. 비표준 .pgrid 변형은 `grid-template-columns` 구조라 행 padding `14px 20px` (`assets/css/ui-kit.css`) 로 좌·우 외곽 일관 처리.

### Grid 유형 선택 룰 — 이미지 컬럼이 있는 경우

행 단위로 **이미지가 포함되는 그리드**는 표준 `table.data` 가 아닌 UI Kit 의 전용 패턴을 사용한다 (작은 썸네일 / 아바타가 텍스트 옆에 inline 으로 들어가는 단순 케이스는 제외).

| 이미지 종류 | 사용할 UI Kit 패턴 | UI Kit 데모 | 적용 예시 |
|---|---|---|---|
| **제품·장비 이미지** (썸네일 카드) | **Product Grid** (`#product-grid`) | [ui-kit.html#product-grid](ui-kit.html#product-grid) | 자재 마스터, 부품 카탈로그, 장비 목록, 폐자재 카드 |
| **프로필 이미지** (사용자·인물) | **Activity List** (`#activity-list`) | [ui-kit.html#activity-list](ui-kit.html#activity-list) | 인사 명단, 결재 이력, 신청자 목록, 알림 발신자 |

**판단 기준** — 그리드 컬럼 중 한 칸이라도 위 두 종류의 이미지를 노출해야 한다면 표준 그리드 대신 위 패턴 중 하나로 전체 그리드를 구성한다. 두 종류 모두 들어가면 주(主) 식별자가 무엇인지 기준으로 선택 (예: "제품 + 담당자" → Product Grid).

#### Product Grid / Activity List 적용 시 핵심 규칙

| 영역 | 규칙 |
|---|---|
| **컬럼 구성** | 원래 그리드의 **전체 컬럼을 그대로 유지** — Product Grid 데모처럼 8개로 줄이지 말 것. 컬럼 수가 화면 폭을 초과하면 그리드 영역만 **수평 스크롤** 허용. |
| **데이터 행 시각** | 행 자체에만 `.pgrid__row` 스타일 적용 — 점선 하단 보더 / 호버 배경 / `is-selected` 강조 등 Product Grid 데모의 *행 UX* 만 가져온다. 컬럼 셀 내용은 그대로 (이미지 셀만 `.pgrid__thumb` 56×56 라운드 썸네일). |
| **헤더 영역** | 항상 **fix** — 그리드 영역 위에 `position: sticky; top: 0` 으로 고정. 데이터 스크롤 시 절대 같이 움직이지 않음. |
| **페이지네이션 영역** | 항상 **fix** — 페이지 하단 바로 위에 고정. 그리드 스크롤과 무관하게 항상 노출. |
| **스크롤 영역** | **데이터 행 영역만** 스크롤 (수직/수평) — `.page` 가 flex 컬럼 (`height:100%`) 으로 깔리고, 내부 `[data-pgrid-scroll]` 만 `flex:1; overflow:auto` 로 늘어남. |

```
┌────────────────────────────────────────┐
│ [검색 패널]                                │  ← 固定
├────────────────────────────────────────┤
│ [툴바: 카운트 · 엑셀 · 등록]                 │  ← 固定
├────────────────────────────────────────┤
│ [그리드 헤더: No · 이미지 · 자재코드 · …]       │  ← sticky top (固定)
│ ┌────────────────────────────────────┐ │
│ │ 행 1 (.pgrid__row 스타일)             │ │
│ │ 행 2                                │ │  ← 데이터 영역 SCROLL ↕↔
│ │ 행 N                                │ │
│ └────────────────────────────────────┘ │
├────────────────────────────────────────┤
│ [페이지네이션 1~10 / 페이지당 20]            │  ← 固定 bottom
└────────────────────────────────────────┘
```

**구현 메모** —
- `index.html` 페이지 마운트는 `class="page"` 만 사용 (NOT `page--scroll`). `page--scroll` 은 전체 페이지가 스크롤되어 헤더/페이지네이션이 같이 움직이게 함 → Product Grid 화면에는 금지.
- 헤더와 행은 **동일한 `grid-template-columns`** 를 inline style 로 공유해야 컬럼이 1:1 정렬됨. JS 에서 `_gridTemplate()` 헬퍼로 한 곳에서 계산해 양쪽에 주입.
- `.pgrid__thumb` (56×56 라운드) 는 이미지 컬럼 셀 안에만 배치. 다른 셀은 일반 텍스트/pill 그대로.

`grid-schemas.js` 에서 schema 정의 시 `gridType: 'product-grid'` 또는 `gridType: 'activity-list'` 메타를 명시할 수도 있지만, 현 도메인 구현은 별도 init 함수(`initMatInfoPage`, `initMatSubInfoPage` 등)에서 공용 헬퍼 `_buildProductGridPage(pageEl, config)` 를 호출하는 방식을 채택. 신규 화면 추가 시 본 헬퍼를 재사용한다.

### 상세검색 1~4 컬럼 레이아웃 — 그리드 전체 폭 Full-fill 표준 ⚠️ **모든 화면 적용**

상세검색 패널의 각 입력 셀은 **그리드 전체 폭을 균등 분할(1fr)** 하여 행을 가득 채운다. 우측 잉여 공간 없이 검색 패널 전체를 활용. 1·2·3·4 컬럼 배치 모두 동일.

| `cols` | grid-template-columns | 입력 폭 | 비고 |
|---|---|---|---|
| **1** | `110px minmax(0, 1fr)` | 풀폭 (`width:100%`) | 라벨 + 입력 1쌍이 행 전체 |
| **2** | `110px 1fr 110px 1fr` | **`width:100%; flex:1`** | 입력 셀 2개가 행 균등 분할 |
| **3** | `110px 1fr 110px 1fr 110px 1fr` | 동일 | 입력 셀 3개가 행 균등 분할 |
| **4** | `110px 1fr 110px 1fr 110px 1fr 110px 1fr` | 동일 | 입력 셀 4개가 행 균등 분할 |

```
┌── 상세검색 (cols=3, 필드 3개) ──────────────────────────────────┐
│ 분류 [전체     ▾] 재단유형 [전체     ▾] 재고상태 [전체     ▾]    │  ← 1fr 균등 분할 (전체 폭 가득 채움)
└─────────────────────────────────────────────────────────────────┘
```

**핵심 룰**
1. **컨테이너는 항상 `width: 100%`** — 우측 잉여 공간 금지
2. **각 입력 셀은 `1fr` 균등 분할** — 행을 가득 채움
3. **`spec.cols` 값은 실제 필드 수와 일치하거나 그 이하** — 더 크면 자동 축소 (auto-cap)
4. **필드 수에 따라 자동 적응**: 필드 3개일 때 `cols: 4` 로 지정해도 `data-cols="3"` 으로 렌더되어 3개 셀이 행을 균등 분할

❌ **금지 패턴**
- 검색 패널 우측에 잉여 공간이 보이는 경우 — `cols` 값이 실제 필드 수보다 크게 설정된 것
- inline `style="width:300px"` 같은 고정 폭 입력 셀 — 1fr 균등 분할 깨짐
- 화면별 `.search__adv-*` CSS 재정의 — 도메인 단일 진실원(`components.css`) 만 사용

✅ **구현 (도메인 표준 — 자동화됨)**
- **CSS**: `assets/css/components.css` `.search__adv-tbl[data-cols="N"]` 정의 — 라벨 110px 고정 + 입력 셀 1fr 균등 분할, 컨테이너 `width: 100%` (단일 진실원)
- **JS**: `assets/js/components.js` `searchPanel(spec)` — `data-cols` 를 자동 계산.
  ```js
  // cols 자동 축소 (auto-cap): 실제 필드 수가 spec.cols 보다 적으면 필드 수에 맞춤
  const totalFields = adv.length + inputs.length + checkGroups.length + radioGroups.length;
  const cols = Math.min(spec.cols || 2, Math.max(1, totalFields));
  ```
- **결과**: schema 의 `search.cols` 값은 안전 한계(최대 4) 로 작성. 필드를 늘리거나 줄여도 자동 적응. 1~4개 컬럼 모두 항상 행 전체 폭 가득 채움.

**신규 화면 적용 체크리스트**
- [ ] `spec.cols` 1~4 중 지정 (또는 미지정 시 기본 2)
- [ ] `advanced` 배열에 N개 필드 정의 — 자동으로 `data-cols="N"` 으로 렌더
- [ ] inline style 로 입력 폭 강제 지정 금지
- [ ] 화면 폭 1280px 이하 반응형 fold 는 CSS 미디어쿼리가 자동 처리 (수정 불요)

### SWADPIA §1, §2 표기 규칙 (자주 위반)

| 룰 | 적용 | 클래스/위치 |
|---|---|---|
| 일자 `YY/MM/DD` (예: 26/05/12) | 그리드 컬럼·검색 조건 | grid format 함수 |
| 일시 `YY/MM/DD   HH:MM` (공백 3칸) | 등록/수정 일시 | format 함수 |
| 금액 우측 정렬 + 천 단위 콤마 | 모든 금액 컬럼 | `align: 'right'` + `toLocaleString()` |
| 페이지 크기 옵션 20/50/100/200/500/1000 | 페이지네이션 | `grid.js` `PAGE_SIZES` |
| 필수 입력 라벨 `*` 빨간색 | 폼 | `<em>*</em>` |

### 📥 파일 등록 항목 다운로드 표준 ⚠️ **모든 파일 첨부 필드 적용**

**모든 파일 등록 항목(첨부파일, 사업자등록증, 통장사본, 계약서, 이미지, 이력 첨부 등)은 다운로드 가능해야 한다.** 사용자가 등록한 파일을 다시 받을 수 없으면 데이터 소실 위험 + 검토 불가.

**호출 API (도메인 단일 진실원)**
```js
App.downloadFile(fileName, opts);
// opts:
//   url   — 실제 파일 URL (있을 시 우선 사용)
//   blob  — Blob 객체 (URL 없을 때 직접 전달)
//   context — 디버그용 컨텍스트 (예: '사업자등록증', '통장사본')
// 동작:
//   1) url 있으면 <a download> 트리거
//   2) blob 있으면 URL.createObjectURL 후 다운로드
//   3) 둘 다 없으면(mock) 파일 메타정보 텍스트 placeholder Blob 생성·다운로드
//      → 데모 환경에서도 실제 파일이 받아져 다운로드 동작 검증 가능
```

**구현 패턴**
```html
<!-- 마크업 — data-*-download 속성에 파일명 + 컨텍스트 -->
<a href="javascript:;" data-eqd-download="${fileName}" data-eqd-ctx="사업자등록증"
   style="color:var(--color-brand-primary);">
  ${fileName} <span style="font-size:10px;">↓</span>
</a>
```

```js
// JS — 단일 위임 핸들러
const dl = e.target.closest('[data-eqd-download]');
if (dl) {
  e.preventDefault();
  App.downloadFile(dl.dataset.eqdDownload, { context: dl.dataset.eqdCtx });
  return;
}
```

**적용 대상 (예외 없음)**
- 사업자등록증, 통장사본, 계약서, 영수증, 명함 이미지
- 첨부파일 (모든 폼·결재·메모·이력)
- 수정이력/금액변경이력 등 이력 테이블의 ↓ 아이콘

❌ **금지** — `<a href="javascript:;">파일명</a>` 만 표시하고 클릭 무동작. 다운로드 트리거 없으면 시각적 거짓말.

✅ **권장** — 파일명 뒤에 `↓` 아이콘 + `title="다운로드"` 표시로 클릭 가능 단서 제공.

### Toast / 알림 노출 위치 규칙

| 항목 | 규칙 |
|---|---|
| 위치 | **좌측 하단** (`bottom: 24px; left: 24px;`) 고정 |
| 진입 방향 | 좌측에서 슬라이드 인 (`translateX(-20px) → 0`) |
| 정렬 | 새 토스트가 아래에 쌓이도록 `flex-direction: column-reverse` |
| z-index | 1100 (모달보다 위, 결재 다이얼로그 위) |
| 호출 API | UI Kit 페이지: `window.toast(msg, kind)` · 메인앱: `App.flashToast(msg, kind)` |

⚠️ **금지** — 토스트를 우상단/중앙/우하단에 표시하지 말 것. 단일 좌하단 정책을 유지해야 사용자가 알림 위치를 학습합니다. 새 toast 변형이 필요하면 위치는 그대로 두고 `--variant` 만 추가하세요.

### 토스트 vs. 인라인 필드 검증 — 사용 영역 분리 (도메인 표준)

알림 채널은 두 가지로 분리하며 **혼용 금지**.

| 상황 | 채널 | UI Kit |
|---|---|---|
| **입력 필드 검증 실패** (필수 미입력, 형식 오류, 잔량/한도 초과, 중복 등) | **인라인** 필드 하단에 `.field-error` 메시지 + 입력에 `.is-invalid` | `ui-kit.html#field-error` |
| **액션 결과 알림** (등록 완료, 처리 완료, 삭제 완료, 저장 실패 등) | **좌하단 토스트** (`App.flashToast` / `window.toast`) | `ui-kit.html#toast` |
| 진행 중 안내·정상 도움말 | `.form-help` (회색 보조 텍스트) | 동일 섹션 |

❌ **금지** — `if (!dest) flashToast('목적지를 입력해 주세요','danger')` 처럼 필드 검증을 토스트로 띄우는 패턴. 사용자가 어떤 필드가 잘못됐는지 다시 시선을 옮겨 찾아야 한다.

✅ **권장** — `if (!dest) { App.Forms.setFieldError(destEl, '목적지를 입력해 주세요'); return; }` — 잘못된 필드 바로 아래에 빨간색 안내가 떠서 즉시 인지된다.

#### 사용 패턴 (도메인 전체에 동일하게 적용)

```html
<!-- 마크업 — fm-tbl 안이든 자유 폼이든 동일 -->
<div class="fm-tbl__value">
  <input class="input" data-x-dest type="text" placeholder="목적지를 입력해 주세요">
  <!-- .field-error 는 setFieldError() 호출 시 자동 삽입됨. 미리 둘 필요 없음 -->
</div>
```

```js
// JS — App.Forms 헬퍼 사용
const destEl = root.querySelector('[data-x-dest]');

// 제출 시
App.Forms.clearAll(root);           // 이전 에러 일괄 제거
let ok = true;
if (!destEl.value.trim()) {
  App.Forms.setFieldError(destEl, '목적지를 입력해 주세요');
  ok = false;
}
if (!ok) return;                    // 토스트 금지 — 인라인만
// ... 실제 등록 ...
flashToast('예약이 등록되었습니다.', 'success');   // 완료 알림은 토스트 OK

// 사용자가 다시 입력하면 자동으로 해당 필드 에러 클리어
App.Forms.applyOnInput(root);       // 폼 마운트 직후 한 번
```

**적용 대상** — `.input` / `.select` / `textarea` / `.combo` / `.multi-select` / `.input-pw` 모두 동일하게 `.is-invalid` 가 적용된다. 헬퍼가 알맞은 래퍼를 자동 식별한다.

**기존 코드 업데이트 지침** — 신규/수정 화면에서 `flashToast(...,'danger'|'warning')` 호출이 필드 누락·형식 오류 메시지인 경우, 반드시 `App.Forms.setFieldError(필드, 메시지)` 로 치환할 것. 토스트 호출은 등록·삭제·처리 등 **이미 일어난 결과**의 알림에만 남긴다.

---

## Form UI 설계 지침 (등록 / 상세 / OffCanvas / 모달)

등록·상세·OffCanvas·모달 폼은 컨테이너 폭이 좁기 때문에 **컬럼 수가 늘어날수록 깨지기 쉽다**.
좁은 컨테이너 안에서 코드(`RM-1002`)·짧은 명칭(`PP-02`) 같은 값이 줄바꿈되어 표시되는 사고를 막기 위해 다음 원칙을 따른다.

### 📐 컨테이너 폭에 맞는 최적 레이아웃 설계 (Form UIUX 제1원칙) ⚠️ **모든 폼 설계 시 필수 확인**

**Form 을 설계하기 전에 먼저 "어떤 컨테이너에 들어가는가" 를 정의하라.** 컨테이너 폭이 결정되면 그 폭에 맞는 컬럼 수·행 구조·라벨 폭이 정해진다. 같은 폼을 모달·OffCanvas·전체 페이지 어디에 넣든 동일하게 적용하면 안 된다.

#### 설계 순서 (체크리스트)

1. **컨테이너 정의** — 이 폼은 어디에 들어가는가?
   - 우측 슬라이드 OffCanvas (400-480px) / 모달 (480-960px) / 모달 `--lg` (~960px) / 모달 `--xl` (~1280-1800px) / 전체 페이지
2. **콘텐츠 폭 산정** — 라벨 폭(보통 110-120px) 을 제외한 입력 영역의 실제 사용 가능 폭
3. **컬럼 수 결정** — 콘텐츠 폭 / 한 셀에 안전하게 표시 가능한 최소 폭(~180px) = 권장 최대 컬럼 수
4. **필드별 폭 변동성 평가** — 각 필드 값이 가변 폭인가? (이름·부서·URL·긴 텍스트 → 1-col 분리 필요)
5. **검증** — 화면을 좁혀봐도(1280px 이하) 어떤 값도 줄바꿈 없이 표시되는가?

#### 컨테이너 폭 → 안전한 컬럼 수 매핑

| 컨테이너 | 실제 콘텐츠 폭 | 라벨 110px × n + 값 ≥ 120px × n 적용 시 안전한 컬럼 수 |
|---|---|---|
| **OffCanvas** ~480px | ~360px | **1-col 기본, 2-col 은 값이 모두 짧은 경우만** (예: 코드·번호·짧은 명칭) |
| **Modal** 일반 (~640px) | ~520px | **2-col 기본**. 3-col 은 값이 모두 ≤8자일 때만 |
| **Modal `--lg`** (~960px) | ~800px | **3-col 가능**. 4-col 은 라벨 짧고 값 짧을 때만 |
| **Modal `--xl`** (~1280px+) | ~1100px+ | **4-col 가능**. 다단 그리드 자유 |
| **전체 페이지** (1280px+) | 자유 | 자유 |

#### 위반 사례 (실제 사고)

❌ **OffCanvas 안에 `fm-tbl__row--3` 사용** → 값 셀 폭 ~40px → `12가3456` 가 `12가/3456` 식으로 세로 깨짐 (실제 사고 — 유류비 정산 상세 OC)
❌ **모달에 가변 폭 필드를 2-col 로 묶음** → 부서명/긴 텍스트가 잘림 또는 줄바꿈
❌ **컨테이너를 결정하지 않고 폼만 먼저 설계** → 컨테이너 변경(Modal → OC)시 전체 다시 작업

#### ✅ 올바른 접근

폼 코드를 작성하기 전에 **반드시 컨테이너의 실제 폭을 확인**하고, 그 폭에 맞는 권장 컬럼 수를 적용한다. 의심스러우면 한 단계 좁은 레이아웃을 선택하라 (`--3` 망설여지면 `--2`, `--2` 망설여지면 `--1`).

**관련 표준 — 상세검색 패널의 컬럼 풀-필 룰** ([상세검색 1~4 컬럼 레이아웃](#상세검색-1-4-컬럼-레이아웃--그리드-전체-폭-full-fill-표준) 참고) — 페이지 폭 그리드에서는 1~4컬럼 모두 1fr 균등 분할 풀-필 표준이 별도로 정의되어 있다.

### 컨테이너별 최대 컬럼 수

| 컨테이너 | 콘텐츠 폭 (라벨 제외) | 권장 최대 | 비고 |
|---|---|---|---|
| **OffCanvas** (`.offcanvas`) | ~400-440px | `fm-tbl__row--2` | 3컬럼 사용 금지 (코드 줄바꿈 사고) |
| **Modal** (중간 크기) | ~500-600px | `fm-tbl__row--2` | 동일 |
| **Modal** (`--lg` 이상 800px+) | ~700px+ | `fm-tbl__row--3` 가능 | 라벨 짧은 경우만 |
| **전체 페이지 폼** (예: 문서작성) | 1fr (≥800px) | `fm-tbl__row--3` 가능 | 다단 가능 |

⚠️ **OffCanvas 안에서 `fm-tbl__row--3` 금지**. 라벨 너비(~80px) × 3 + 값 셀 × 3 = 한 셀당 100px 미만이 되어 영문/숫자 코드가 줄바꿈된다.

### 2컬럼도 깨질 수 있는 경우 — 가변 폭 콘텐츠는 1컬럼 분리

좁은 OffCanvas 에서는 `fm-tbl__row--2` 라도 셀 폭이 ~180px 수준이라 다음 콘텐츠는 줄바꿈 사고를 낸다:

- **라디오 그룹** 2개 이상 (예: "원자재 / 부자재") — 원/자/재 식으로 글자가 끊김
- **체크박스 그룹** 옵션이 많을 때
- 긴 옵션 텍스트가 들어가는 **셀렉트박스**
- 입력 + 단위 인라인 + 추가 안내 같은 **다중 요소 묶음**

이런 경우 두 필드를 같은 행에 묶지 말고 **각각 별도 `fm-tbl__row--1` 행**으로 분리한다.

#### ❌ 깨지는 예 (OffCanvas 2-col)

```html
<div class="fm-tbl__row fm-tbl__row--2">
  <div class="fm-tbl__label">구분 *</div>
  <div class="fm-tbl__value"><input type="radio">원자재 <input type="radio">부자재</div>  <!-- 셀이 좁아 "원자/재" 로 끊김 -->
  <div class="fm-tbl__label">자재 선택 *</div>
  <div class="fm-tbl__value"><select>...</select></div>
</div>
```

#### ✅ 안정적 (각각 1-col 행)

```html
<div class="fm-tbl__row fm-tbl__row--1">
  <div class="fm-tbl__label">구분 *</div>
  <div class="fm-tbl__value">
    <div style="display:flex; gap:18px;">
      <label><input type="radio">원자재</label>
      <label><input type="radio">부자재</label>
    </div>
  </div>
</div>
<div class="fm-tbl__row fm-tbl__row--1">
  <div class="fm-tbl__label">자재 선택 *</div>
  <div class="fm-tbl__value"><select style="width:100%;">...</select></div>
</div>
```

**핵심 원칙** — 데이터가 깨지지 않고 사용자가 한눈에 확인 가능한 것이 최우선. 폼 행을 줄이는 것보다 **각 필드가 안정적으로 표시되는 것**이 더 중요하다. 의심스러우면 행을 분리하라.

### 컨테이너별 가변 폭 콘텐츠 처리 가이드

| 컨테이너 | 라디오 2개 | 라디오 3+ | 셀렉트(긴 옵션) | 입력+단위+안내 |
|---|---|---|---|---|
| OffCanvas / 좁은 모달 | **1-col 분리** | 1-col 분리 | 1-col 분리 | 1-col 분리 |
| 모달 lg+ / 전체 페이지 | 2-col 가능 | **1-col 분리** | 2-col 가능 | 2-col 가능 |

### 자동 채움 / 파생 read-only 필드의 표현

선택 → 자동 채움되는 부속 정보(예: 자재 선택 → 자재코드 / 분류 / 단위)는 **개별 form 행으로 나열하지 말고**, 소스 필드 아래에 **인라인 정보 라인** 또는 **단일 요약 행** 으로 표시한다.

#### ✅ 권장 — 인라인 요약 행 (1 row)

```html
<div class="fm-tbl__row fm-tbl__row--1">
  <div class="fm-tbl__label">자재 정보</div>
  <div class="fm-tbl__value">
    <div style="display:flex; flex-wrap:wrap; gap:6px 16px; align-items:center; color:var(--color-text-sub);">
      <span><a class="link-code">RM-1002</a></span>
      <span style="color:var(--color-divider);">|</span>
      <span>PP-02</span>
      <span style="color:var(--color-divider);">|</span>
      <span>수지</span>
      <span style="color:var(--color-divider);">|</span>
      <span style="color:var(--color-text-muted);">단위: KG</span>
    </div>
  </div>
</div>
```

#### ❌ 금지 — 3컬럼 분리

```html
<div class="fm-tbl__row fm-tbl__row--3">           <!-- OffCanvas 안에서 화면이 깨진다 -->
  <div class="fm-tbl__label">자재코드</div>
  <div class="fm-tbl__value"><input ...></div>
  <div class="fm-tbl__label">자재명</div>
  <div class="fm-tbl__value"><input ...></div>
  <div class="fm-tbl__label">분류</div>
  <div class="fm-tbl__value"><input ...></div>
</div>
```

### 입력 + 자동 계산 패턴 (예: 수량 × 단가 = 금액)

자동 계산되는 결과 값은 별도 행에 우측 정렬 강조 표시.

```html
<div class="fm-tbl__row fm-tbl__row--2">
  <div class="fm-tbl__label">수량</div>
  <div class="fm-tbl__value"><input ... data-qty></div>
  <div class="fm-tbl__label">단가(원)</div>
  <div class="fm-tbl__value"><input ... data-price></div>
</div>
<div class="fm-tbl__row fm-tbl__row--1">
  <div class="fm-tbl__label">금액(원)</div>
  <div class="fm-tbl__value" style="text-align:right;">
    <strong style="font-size:var(--fs-lg); color:var(--color-brand-primary);">{auto}</strong>
  </div>
</div>
```

### 그 외 폼 설계 원칙

| 원칙 | 설명 |
|---|---|
| **라벨 폭 일관** | 같은 폼 안에서 라벨 폭은 자동 grid 가 정렬. 라벨 텍스트 길이는 7자 이내로 (긴 라벨은 줄바꿈 사고) |
| **필수 표시** | 라벨 우측에 `<em style="color:var(--color-danger)">*</em>` |
| **read-only 시각 구분** | `background:var(--color-surface-alt)` 로 입력 가능 필드와 시각적 분리 |
| **textarea 기본 높이** | OffCanvas 사용 시 `height:50px; min-height:50px; resize:vertical` (요청 시 키울 수 있게) |
| **첨부파일** | UI Kit `.file-field` + `.dz` + `.dz-list` — 본 폼과 분리된 카드 박스로 |
| **저장/취소 위치** | `.offcanvas__footer.offcanvas__footer--between` — 좌측 안내 / 우측 [취소][등록] |
| **자동 발급 번호 / 일시** | UI 입력 X — 등록 시점 시스템 자동 채움 (예: `REQ-YYMM-###`, `registeredAt`) |

### 적용 체크리스트

새 OffCanvas / 모달 폼을 만들거나 기존 폼을 수정할 때:

1. [ ] OffCanvas 안에 `fm-tbl__row--3` 가 없는가? — 있다면 1/2컬럼 + 인라인 요약 행으로 재구성
2. [ ] 자동 채움 read-only 필드 3개 이상이 한 행에 줄지어 있지 않은가? — 인라인 요약 행으로 결합
3. [ ] 자동 계산 결과 필드가 입력 필드와 같은 행이 아닌가? — 별도 행에 강조 표시
4. [ ] **OffCanvas 의 2컬럼 행에 라디오/체크박스/긴 셀렉트가 들어있지 않은가?** — 있다면 각각 1컬럼 행으로 분리
5. [ ] 라벨 텍스트가 모두 7자 이내인가?
6. [ ] 필수 입력 `*` 표시가 되어 있는가?
7. [ ] 화면을 좁혀봐도(브라우저 폭 1280px 이하) 어떤 값도 줄바꿈으로 깨지지 않는가?

> **설계 원칙** — 폼 행 수를 줄이는 것보다 **각 필드가 안정적으로 표시되는 것**이 최우선. 데이터가 깨지지 않고 사용자가 한눈에 확인할 수 있어야 한다. 의심스러우면 무조건 행을 분리하라.

---

## 그리드 행 클릭 → 상세 (도메인 표준)

상세화면이 존재하는 그리드는 **"상세" 버튼 클릭** 과 **데이터 ROW 클릭** 두 가지 입력 모두로 동일한 상세화면을 연다. 사용자가 행 어디를 눌러도 의도한 결과(상세)에 도달하게 하기 위한 표준 동작.

| 상황 | 동작 |
|---|---|
| 행의 "상세" 버튼 클릭 | 상세 OC/모달 오픈 |
| 행 안 빈 영역 / 셀 텍스트 클릭 | 동일한 상세 OC/모달 오픈 |
| 행 안 인터랙티브 요소(체크박스·링크·다른 버튼·셀렉트·pill 클릭) | 해당 요소의 본래 액션만 실행 (상세 안 열림) |
| 셀 텍스트 드래그 선택 중 | 상세 안 열림 (사용자 의도 보호) |

### 동작 원리 — 자동 적용 (App.Grid 사용 시 별도 코드 불필요)

`assets/js/grid.js` 의 `App.Grid.create()` 가 행 클릭을 감지하면 같은 행 안에 있는 `data-*-detail` 트리거(예: `data-matin-detail`, `data-approval-detail`, `data-doc-detail`)를 자동으로 찾아 프로그래밍 방식 클릭한다. 따라서 기존 "상세" 버튼 핸들러가 그대로 실행된다 — **별도 와이어링 없이** 상세 진입이 양쪽 입력에서 모두 작동한다.

행에 상세 트리거가 발견되면 자동으로 `tr.is-clickable` 클래스가 붙어 마우스 커서가 포인터로 변한다 (시각 피드백).

### 손으로 만든 테이블(App.Grid 미사용)에 적용하는 패턴

`pages.js` 의 차량 정비/운행 풀팝업처럼 `<table class="grid">` 를 직접 렌더하는 경우, 다음 두 가지만 챙기면 동일한 동작을 얻는다.

```js
// 1) 행에 클래스 + row-id 데이터 속성
return `<tr class="is-clickable" data-foo-row="${item.id}">
  …셀들…
  <td class="col-center"><button … data-foo-detail="${item.id}">상세</button></td>
</tr>`;

// 2) 컨테이너 click 위임에 row 분기 추가
container.addEventListener('click', (e) => {
  // 기존 — 버튼 클릭
  const btn = e.target.closest('[data-foo-detail]');
  if (btn) { openFooDetail(btn.dataset.fooDetail); return; }
  // 신규 — 행 클릭 (인터랙티브 요소·텍스트 선택 중 제외)
  if (e.target.closest('button, a, input, select, textarea, label')) return;
  const sel = window.getSelection && window.getSelection();
  if (sel && sel.type === 'Range' && String(sel).length > 0) return;
  const row = e.target.closest('[data-foo-row]');
  if (row) { openFooDetail(row.dataset.fooRow); return; }
});
```

### 적용 체크리스트

새 그리드/리스트를 만들 때:

1. [ ] 상세화면이 있는가? → 있으면 본 규칙 적용 대상
2. [ ] **App.Grid 사용** → 별도 작업 불요 (자동). `data-*-detail` 명명만 지킬 것
3. [ ] **수동 테이블** → `tr.is-clickable` + `data-X-row` + click 위임 분기 추가
4. [ ] 행 안의 다른 인터랙티브 요소(체크박스 / 인라인 셀렉트 / pill 토글 등)는 e.preventDefault 또는 `_INTERACTIVE` 셀렉터 범위에 들어가는가? 행 클릭으로 상세가 잘못 열리지 않는지 확인
5. [ ] 모바일/터치 — `:hover` 가 없는 환경에서도 행 클릭이 발화하는지 확인 (click 이벤트는 터치에서도 동작)

❌ **금지** — 일부 화면은 행 클릭, 일부 화면은 버튼 전용 식의 혼용. 사용자가 화면마다 클릭 위치를 다르게 학습해야 하므로 인지 비용이 늘어난다. 상세화면이 있으면 무조건 양쪽 입력 지원.

---

## 의사결정 트리

```
새 UI 가 필요하다
  │
  ├─ ① UI Kit에 동일한 것이 있는가?
  │     └─ YES → 그대로 사용 (작업 끝)
  │
  ├─ ② 유사한 것이 있는가?
  │     └─ YES → `.cls--variant` 수정자(modifier) 추가하여 확장
  │              (예: .btn--soft-success, .tabs--pill-solid, .pill--purple)
  │              ui-kit.css 에 수정자 + ui-kit.html 에 데모 행 추가 후 사용
  │
  └─ ③ 완전히 새로운 패턴인가?
        ┌─→ STEP 1: UI Kit에 신규 컴포넌트 등록 (아래 절차)
        └─→ STEP 2: 등록 완료 후에야 화면 코드에 적용
        (등록 없이 화면에만 작성 금지)
```

---

## 신규 컴포넌트 UI Kit 등록 절차

다섯 곳에 변경이 필요하며, 순서대로 진행한다:

### 1. CSS — `assets/css/ui-kit.css`

```css
.my-comp {
  background: var(--color-surface);      /* ✓ 디자인 토큰 사용 */
  border-radius: var(--radius-md);
  padding: 16px;
  /* background: #fff;  ✗ 직접 hex 금지 */
}
.my-comp--accent { color: var(--color-brand-accent); }
.my-comp.is-active { background: var(--color-active); }
```

**규칙:**
- 색상은 반드시 `var(--color-...)` 토큰 사용. 새 색이 필요하면 `variables.css` 에 토큰 먼저 추가.
- 클래스 네이밍은 BEM: `.block`, `.block__element`, `.block--modifier`.
- 상태는 `is-` 접두사: `.is-active`, `.is-open`, `.is-loading`.

### 2. HTML 데모 섹션 — `ui-kit.html`

```html
<section id="my-comp" class="uk-section">
  <div class="uk-section__head">
    <h2>My Component</h2>
    <small>한 줄 설명</small>
  </div>
  <div class="uk-demo">
    <!-- 실제로 동작하는 데모 -->
    <div class="my-comp">데모 콘텐츠</div>
    <div class="my-comp my-comp--accent is-active">변형 + 활성</div>
  </div>
</section>
```

**섹션 위치는 카테고리에 맞춰:**
- 앱 레이아웃 (App Shell)
- 기본 (Typography, Icon, Button, Helper Classes)
- 콘텐츠 (Avatar, Card, List, Timeline …)
- 상호작용 (Modal, Tooltip, Dropdown, Tabs …)
- 폼 (Input, Checkbox, Form Table …)
- 데이터 (Table, Pagination, Charts …)

### 3. TOC 링크 — `ui-kit.html` 의 `#uk-toc` 안

```html
<div class="uk-toc__group">콘텐츠</div>
<a href="#my-comp">My Component</a>
```

### 4. 인터랙션 (선택) — `assets/js/ui-kit.js`

```js
document.querySelectorAll('[data-mycomp-toggle]').forEach(btn => {
  btn.addEventListener('click', () => btn.closest('.my-comp').classList.toggle('is-active'));
});
```

**`data-*` 속성 hook 권장.** 클래스로 동작을 식별하지 말 것.

### 5. 빌더 함수 (선택) — `assets/js/components.js`

재사용 빈도가 높은 패턴이면 `App.Components.*` 네임스페이스에 빌더 추가:

```js
App.Components.myComp = function({ title, body, accent }) {
  return html`<div class="my-comp${accent ? ' my-comp--accent' : ''}">…</div>`;
};
```

---

## 등록 후에야 화면 작업

UI Kit 등록이 끝난 뒤 다음 위치에서 화면 적용:

| 작업 종류 | 수정 파일 |
|---|---|
| 그리드형 화면 추가 | `nav-data.js` 메뉴 등록 + `grid-schemas.js` 컬럼/필터 등록 |
| 신규 페이지 타입 | `index.html` 에 `<section class="page" id="...">` 마운트 + `pages.js` init 등록 |
| 컴포넌트 적용 | 화면 마크업에 UI Kit 에 등록된 클래스 그대로 사용 |
| 메뉴 변경 | `nav-data.js` 만 수정 |

**금지 사항:**
- ❌ 화면 코드 안에 `style="..."` 인라인 CSS
- ❌ 화면 전용으로만 사용되는 CSS 클래스를 따로 작성
- ❌ UI Kit 에 없는 디자인 패턴을 즉흥적으로 화면에 작성
- ❌ "이번 한 번만" 식의 1회용 스타일

**예외 — UI Kit 등록 없이 진행 가능:**
- 데이터 정의 (`grid-schemas.js`, `nav-data.js`)
- 기존 컴포넌트의 문구/라벨/Mock 데이터 교체
- 디자인 토큰만 다르게 사용 (예: 같은 `.btn` 에 `--accent` 적용)

---

## 디자인 토큰 (`assets/css/variables.css`)

직접 hex/픽셀 값을 화면이나 컴포넌트에 작성하지 말고 토큰을 통한다:

- **색상**: `--color-brand-primary` `--color-brand-accent` `--color-success` `--color-warning` `--color-danger` `--color-info` `--color-text` `--color-text-sub` `--color-text-muted` `--color-surface` `--color-surface-alt` `--color-border` `--color-divider` `--color-hover` `--color-active` `--color-focus`
- **간격/라운드**: `--radius-sm/md/lg/pill` `--shadow-sm/md/lg`
- **타이포**: `--fs-xs/sm/md/base/lg/xl/2xl/3xl` `--fw-regular/medium/semibold/bold` `--font-family`
- **전환**: `--t-fast/base/slow`
- **레이아웃**: `--gnb-height` `--lnb-width` `--tabbar-height`
- **z-index**: `--z-gnb/lnb/tabbar/modal/toast`

**새 색이 필요하면 `variables.css` 에 토큰을 먼저 추가**하고 그 토큰을 사용.

---

## 변경 후 검증

작업 완료 후 다음을 자동 수행:

```bash
# JS 문법 체크
node -e "new Function(require('fs').readFileSync('assets/js/<수정한파일>.js','utf8'))"

# 신규 클래스가 ui-kit.css + ui-kit.html 양쪽에 모두 존재하는지
node -e "
  const fs = require('fs');
  const css = fs.readFileSync('assets/css/ui-kit.css','utf8');
  const html = fs.readFileSync('ui-kit.html','utf8');
  const cls = '.my-comp';
  console.log(css.includes(cls) && html.includes(cls.slice(1)) ? 'OK' : 'MISSING');
"
```

---

## 사용자 요청 처리 흐름

사용자가 화면/컴포넌트 작업을 요청하면:

1. **요청이 UI 변경인가?**
   - YES → UI Kit 사전 검토 → 의사결정 트리 진행
   - NO  → 데이터/로직 변경으로 처리

2. **사용자가 "일회용이니 UI Kit 등록 생략"이라고 했는가?**
   - YES → UI Kit 등록 생략 가능 (그래도 한번 확인 권장)
   - NO  → 위 절차 완전 준수

3. **변경 한 클래스가 다른 화면에도 영향을 주는가?**
   - 전역 CSS 수정 시 → 영향 범위를 명시적으로 사용자에게 보고

4. **응답 시 명시할 것:**
   - "UI Kit 의 `.xxx` 를 사용했습니다"
   - 또는 "UI Kit 에 `.xxx` 를 신규 등록한 후 화면에 적용했습니다"
   - 또는 "기존 `.yyy` 에 `--variant` 수정자를 추가했습니다"

---

## CSS / JS 컨벤션 요약

| 항목 | 규칙 |
|---|---|
| 클래스명 | BEM: `.block` `.block__elem` `.block--mod` |
| 상태 클래스 | `.is-*` (active/open/loading/disabled …) |
| DOM 훅 | `data-*` 속성 (클래스로 동작 식별 금지) |
| JS 네임스페이스 | `window.App.*` (App.Components, App.Tabs, App.Notifications …) |
| 모듈 패턴 | IIFE 로 감싸기 `(function(){...})()` |
| 이벤트 위임 | 부모에 한 번 바인딩 → `e.target.closest('[data-...]')` |
| 색상 사용 | `var(--color-...)` 토큰만, 직접 hex 금지 |

---

## 핵심 파일 위치

| 파일 | 용도 |
|---|---|
| `ui-kit.html` | UI Kit 전체 데모 + TOC (최우선 참고원) |
| `assets/css/ui-kit.css` | UI Kit 컴포넌트 스타일 |
| `assets/css/components.css` | 메인 앱에서 사용되는 공통 컴포넌트 |
| `assets/css/layout.css` | 앱 셸 (GNB/LNB/Tab Bar) 레이아웃 |
| `assets/css/variables.css` | 디자인 토큰 |
| `assets/js/components.js` | 빌더 함수 (`App.Components.*`) |
| `assets/js/charts.js` | SVG 차트 헬퍼 (`window.Charts.*`) |
| `assets/js/ui-kit.js` | UI Kit 데모 인터랙션 |
| `assets/js/icons.js` | 인라인 SVG 아이콘 (`window.Icons.*`) |
| `nav-data.js` / `grid-schemas.js` | 데이터 정의 (UI Kit 불요) |
| `pages.js` | 화면별 init 등록 위치 |

작업할 때는 위 파일들의 변경 흐름을 추적하면서 진행한다.

## Imported Claude Cowork project instructions

# 📘 통합 업무/화면 상세 요건 정의서 — 워크플로우 지침

- **Project** : 성원애드피아 통합 ERP/SCM/MES 구축
- **Version** : **v2.1**
- **Author** : 기획팀
- **Date** : 2026-06-25

---

## 문서 목적

본 문서는 **실제 구현 화면(HTML + JS 소스)** 과 업무 정의서를 기반으로
업무 흐름 및 화면 기능 중심의 상세 요건을 정의한다.

> ※ 본 문서는 기획 기준 명세서이며, 개발 기술 설계(API/DB/아키텍처)는 별도 상세설계 단계에서 수행한다.

---

## 변경 이력

| 버전 | 일자 | 변경 내용 |
|------|------|----------|
| v1.0 | - | 초기 작성 |
| v1.1 | - | 트리거 키워드 및 6단계 워크플로우 정의 |
| v2.0 | 2026-02-06 | 워크플로우 8단계로 확장(Gap분석/보안분석/질의답변 추가), 검증 루프 도입, 산출물 구조 개선 |
| **v2.1** | **2026-06-25** | **화면 진실 공급원을 Figma → 실제 HTML+JS 소스로 전환. Step 1 입력 소스·화면 식별 기준·추출 위치 매핑·ID↔page id 매핑·산출 경로 치환. 8단계 흐름과 스킬 세트는 그대로 유지.** |

> **v2.0 → v2.1 변경 요지**
> - 화면 단위의 기준이 **Figma Frame → `index.html`의 `<section class="page" id="…">` + `nav-data.js` 메뉴 노드**로 바뀜
> - Step 1 입력이 **Figma 파일/스크린샷/URL → HTML+JS 소스 세트**로 바뀜 (이미지 관찰 기반 → 소스 정의 기반)
> - figma-screen-spec 스킬은 **그대로 사용**하되, 입력 해석 규칙(추출 위치 매핑)을 본 지침에 추가
> - **Step 2~8 및 스킬 세트(figma-screen-spec / function-unit-decomposer / screen-fu-mapper / req-completeness-checker / req-gap-analyzer / req-security-analyzer / erp-classifier / req-inquiry-generator / req-spec-generator)는 변경 없음**

---

# 1. 자동 실행 규칙

## 1.1 트리거 키워드별 자동 워크플로우

### 전체 분석 워크플로우

**트리거:**
- "전체 분석"
- "요구사항 분석"
- "통합 워크플로우 실행"
- "요구사항 보완"
- "자료 분석해서 정리"
- "자료 분석해서 요구사항 보완"
- "처음부터 끝까지 다 해줘"
- "요구사항 분석 프로세스 시작"
- "#full-analysis"
- "#요구사항분석"
- "#통합워크플로우"

---

## 1.2 통합 워크플로우 실행 절차

### 워크플로우 전체 흐름 (v2.1 — 8단계, 흐름 불변)

```
[1단계] 화면 분석 (figma-screen-spec) ★ 입력만 HTML+JS 소스로 치환
    ↓
[2단계] 업무 정의 추출 (function-unit-decomposer)
    ↓
[3단계] 화면-업무 매핑 검증 (screen-fu-mapper)
    ↓
[4단계] 완전성 검증 (req-completeness-checker)
    ↓
[5단계] Gap/보안 분석 (req-gap-analyzer + req-security-analyzer)
    ↓
[6단계] 업무 표준화/재분류 (erp-classifier)
    ↓
[7단계] 질의리스트 생성 및 답변 수집 (req-inquiry-generator)
    ↓
[8단계] 최종 요구사항 정의서 생성 (req-spec-generator)
```

> **v2.1에서 바뀐 것은 [1단계]의 입력 소스와 화면 식별 기준뿐이다. 단계 구성·순서·스킬은 v2.0과 동일하다.**

### 단계별 상세

| 단계 | 스킬명 | 입력 | 출력 (산출물) |
|------|--------|------|---------------|
| **Step 1** | **figma-screen-spec** | **HTML+JS 소스 세트** (아래 §1.4 참조)<br>· `index.html` (page 섹션)<br>· `nav-data.js` (메뉴/IA)<br>· `grid-schemas.js` (컬럼·필터)<br>· `pages.js` / `page-*.js` (폼·버튼·모달·상태)<br>· `ui-kit.html` (컴포넌트 사전) | 01_화면명세표.md |
| Step 2 | function-unit-decomposer | 회의록, RFP, 요구사항서 등 비정형 문서 | 02_업무정의표.md |
| Step 3 | screen-fu-mapper | Step 1 + Step 2 산출물 | 03_화면업무매핑표.md |
| Step 4 | req-completeness-checker | Step 2 산출물 | 04_완전성검증표.md |
| Step 5 | req-gap-analyzer + req-security-analyzer | Step 2 + Step 4 산출물 | 05_Gap분석표.md + 05-1_보안분석표.md |
| Step 6 | erp-classifier | Step 2 산출물 | 06_업무표준화표.md |
| Step 7 | req-inquiry-generator | Step 3~6 전체 산출물 (누락/미흡/충돌/보안 항목 종합) | 07_통합질의리스트.md + 08_질의답변결과.md |
| Step 8 | req-spec-generator | Step 1~7 모든 산출물 (질의 답변 확정 포함) | 09_요구사항_정의서_v1.0.md |

### 필수 입력 요건

| 단계 | 필수 입력 | 선택 입력 |
|------|-----------|-----------|
| **Step 1** | **`index.html` + `nav-data.js` + `grid-schemas.js`** | **`page-*.js`, `pages.js`, `ui-kit.html` (상세 폼·모달·상태까지 명세할 때)** |
| Step 2 | 회의록/RFP/요구사항서 | - |
| Step 3 | Step 1, 2 결과 | - |
| Step 4 | Step 2 결과 | Step 1, 3 결과 |
| Step 5 | Step 2, 4 결과 | Step 1, 3 결과 |
| Step 6 | Step 2 결과 | - |
| Step 7 | Step 3, 4, 5 결과 (누락/Gap/보안 항목) | Step 6 결과 |
| Step 8 | Step 1~7 전체 결과 (질의 답변 확정 포함) | - |

### 산출물 파일 구조 (v2.1)

> 경로는 환경 비의존 경로(`/mnt/user-data/outputs/`) 대신 **실제 작업 폴더 하위**에 생성한다.

```
{프로젝트 루트}/요구사항_분석_산출물/
├── 01_화면명세표.md
├── 02_업무정의표.md
├── 03_화면업무매핑표.md
├── 04_완전성검증표.md
├── 05_Gap분석표.md
├── 05-1_보안분석표.md
├── 06_업무표준화표.md
├── 07_통합질의리스트.md
├── 08_질의답변결과.md
└── 09_요구사항_정의서_v1.0.md
```

---

## 1.3 실행 모드

### 전체 자동 실행 모드

트리거 키워드 입력 시:

1. **소스 세트 확인** (`index.html` · `nav-data.js` · `grid-schemas.js` 존재 여부 + 분석 대상 메뉴/page id 범위)
2. Step 1~6 순차 실행 (분석 단계 — 자동)
3. **Step 7: 질의리스트 생성 후 사용자에게 질의 방식 선택 요청**
   - **구글폼**: 질의서 생성 → 응답 수집 대기 → 응답 입력 후 Step 8 진행
   - **대화형**: 즉시 Q&A 진행(1개씩) → 답변 완료 후 Step 8 진행
4. **Step 8: 질의 답변이 확정된 후 최종 정의서 생성**
5. 최종 산출물 제공

### 부분 실행 모드

| 사용자 요청 | 실행 단계 |
|-------------|-----------|
| "화면 분석만 해줘" (+ 메뉴/page id 범위 지정, 예: "인사 > 사원정보 화면만") | Step 1만 |
| "업무 정의만 추출해줘" | Step 2만 |
| "매핑 검증해줘" | Step 3만 |
| "Gap 분석해줘" | Step 4 + 5 |
| "보안 분석해줘" | Step 5 (보안만) |
| "질의리스트 만들어줘" | Step 7만 (이전 산출물 참조) |
| "요건 정의서 생성해줘" | Step 8만 (이전 산출물 참조) |

> **Step 1 범위 지정** — 소스 전체가 아니라 특정 메뉴/모듈만 분석할 때는 대상 `page id` 또는 `nav-data.js` 메뉴 경로를 함께 지정한다 (예: `id="hr-employee"`, "인사 > 사원정보").

### 재실행 모드

이전 완료 단계를 건너뛰고 특정 단계부터 실행:

- "Step 5부터 해줘" → Step 1~4 산출물 참조, Step 5부터 실행
- "질의 답변 반영해서 정의서 다시 만들어줘" → Step 7 답변 기반 Step 8 재실행

---

## 1.4 Step 1 소스 분석 모드 (figma-screen-spec 재활용) ★ v2.1 신규

figma-screen-spec **스킬 본문은 수정하지 않는다.** 다만 이 프로젝트에서는 Figma 이미지 대신
**HTML+JS 소스를 입력**으로 사용하므로, 스킬의 "UI 요소 추출 규칙"을 아래 소스 위치로 치환하여
동일한 명세 테이블(화면ID · 화면명 · 목적 · 주요기능 · 입력 · 출력 · 사용자액션)을 생성한다.

### 화면 단위(Frame) 식별 기준

| 기존 (Figma) | 현 프로젝트 (HTML+JS) |
|---|---|
| Figma Frame 1개 = 화면 1개 | `index.html`의 `<section class="page" id="X">` 1개 = 화면 1개 |
| 프레임명 | `nav-data.js`의 해당 메뉴 라벨 |

### 추출 위치 매핑 (스킬의 UI 요소 추출 규칙 ↔ 소스)

| 스킬의 추출 대상 | 소스에서 읽을 위치 |
|---|---|
| Frame (화면) | `index.html` `<section class="page" id="X">` + `nav-data.js` 메뉴명 |
| Button / 액션 | `page-X.js`의 `data-*` 핸들러, 툴바·행 버튼 |
| Input Field | `grid-schemas.js`의 `search` 필터 + `page-X.js` 폼(`fm-tbl`) |
| Table (목록) | `grid-schemas.js`의 `columns` 정의 |
| Modal / OffCanvas | `page-X.js`의 상세 OC / 모달 마크업 |
| Tab / 상태 | `page-X.js` 탭 구성 + 상태 pill (`success/warning/danger/info/muted`) |
| 컴포넌트 의미 확정 | `ui-kit.html` + `components.js` 빌더 (시각 추측 대신 정의 참조) |

### 화면ID 채번

- 형식 `SCR-{순번 3자리}`는 **유지**한다 (예: SCR-001).
- 단, 명세표 비고열에 **실제 `page id`와 1:1 매핑**을 함께 기재한다.
  - 예: `SCR-012 ↔ id="hr-employee"`
- 모달/OffCanvas: `SCR-012-M01`, 탭 전환: `SCR-012-T01`

### 분석 방식

| 방식 | 설명 | 사용 시점 |
|---|---|---|
| **(A) 정적 분석** | `Read` / `Grep`으로 위 소스에서 화면·필드·컬럼·버튼·모달·상태 추출 | **기본** |
| (B) 렌더 캡처 | `index.html`을 브라우저로 열어 화면 캡처 후 시각 레이아웃 보완 | 정적 분석만으로 레이아웃·노출 조건 판단이 어려울 때만 |

### 작성 원칙 (스킬 원칙 + 소스 기반 보강)

1. **정의 기반 작성** — 이미지 관찰·추측이 아니라 소스에 정의된 요소만 명세에 포함 (소스가 진실 공급원).
2. **목적 추론** — `nav-data.js` 메뉴명 + `page-X.js` 제목/구성으로 "목적" 한 줄 작성.
3. **기능 동사형** — 주요 기능은 동사형(신규 등록 / 목록 조회 / 상세 수정 / 엑셀 다운로드 등).
4. **입력 구체화** — `grid-schemas.js` 필터 라벨, `fm-tbl` 폼 라벨을 그대로 기재.
5. **출력 구체화** — `grid-schemas.js`의 컬럼명을 나열.
6. **액션 흐름** — 행 클릭 → 상세, 툴바 액션 등 `data-*` 핸들러 기준으로 순서대로 기재.

---

## 1.5 Step 7 질의리스트 생성 상세 규칙

### 질의 소스 통합 순서

```
[Step 3 매핑 검증] ──→ 누락(화면없음/업무없음) + 충돌 항목
         ↓
[Step 4 완전성 검증] ──→ 6대 누락 영역 (승인/상태/예외/권한/책임/취소)
         ↓
[Step 5 Gap 분석] ──→ 도메인 표준 대비 누락/미흡/모호/충돌
         ↓
[Step 5-1 보안 분석] ──→ 🔴 높음 보안 취약점
         ↓
[패턴 기반 필수 질문] ──→ 업무 패턴(CRUD/워크플로우/거래 등)별 필수 질문
         ↓
     ┌─────────────────┐
     │   중복 제거      │
     │   우선순위 정렬   │
     │   AI 추천 생성   │
     └─────────────────┘
         ↓
     07_통합질의리스트.md
```

### 질의 도출 원칙

> **질의 = AI가 추론 불가한 "사람만 답할 수 있는" 질문만**

| 질문 필요 (도출) | AI 추론 가능 (질문 금지) |
|-----------------|----------------------|
| 업무 목적, 현행 방식, 범위 | 화면 필드 구성, 목록/상세 구조 |
| 설계 결정, 비즈니스 규칙 | 버튼 배치, UI 레이아웃 |
| 정책 선택, 승인 기준 | API 구조, DB 스키마 |
| 연동 대상, 정산 방식 | 기술 스택, 개발 방식 |
| 과실 비율, 비용 부담 주체 | 계산 로직 구현 방식 |

> **v2.1 참고** — 화면 필드·목록/상세 구조는 이미 소스에 정의되어 있으므로 질문 대상에서 더욱 명확히 제외된다. 질의는 소스에서 읽을 수 없는 **업무 의도·정책·연동·책임** 영역에 집중한다.

### 질의 우선순위

| 등급 | 기준 | 표시 |
|------|------|------|
| 🔴 필수 확인 | 미정의 시 업무 설계 불가 또는 운영 리스크 높음 | 즉시 확인 |
| 🟡 추가 확인 | 업무 수행 가능하나 상세 규칙 미확정 | 검토 권장 |
| 🔵 의사결정 | 두 가지 이상 선택지 중 비즈니스 판단 필요 | 선택 필요 |

### AI 추천 답변 생성 규칙

- 모든 질문에 AI 추천 답변 포함 (도메인 표준/일반 관행 기반)
- 2~3개 선택지(A안/B안/C안) 형태로 제시
- 조직 고유 정책은 "직접 정의 필요" 표기
- 강제가 아닌 제안 톤 유지

### 질의 답변 수집 방식

| 방식 | 장점 | 적합 상황 |
|------|------|----------|
| 구글폼 | 여러 담당자 배포, 비동기 수집 | 다부서 검토 필요 시 |
| 대화형 | 즉시 확정, AI 추천 활용, 추가 논의 | 담당자 1인 즉시 확정 시 |

### 답변 후 Step 8 전달 규칙

- 질의 답변 결과(08_질의답변결과.md)를 Step 8 입력에 포함
- [미정의] 태그 항목 중 답변으로 확정된 항목 → 정의서에 **확정값** 반영
- [미정의] 태그 항목 중 보류된 항목 → 정의서에 **[보류]** 태그로 유지
- 질의에서 **신규 도출된 업무/화면/규칙** → 정의서에 신규 항목으로 추가

---

## 1.6 오류 처리 규칙

| 오류 상황 | 처리 방법 |
|-----------|-----------|
| **입력 소스 없음** | **"분석할 소스(`index.html` / `nav-data.js` / `grid-schemas.js`)를 확인해주세요" 안내** |
| **page id ↔ 메뉴 매핑 불일치** | **불일치 목록 제시 후 `nav-data.js` 기준으로 정렬, 누락 화면 별도 표기** |
| 중간 단계 실패 | 해당 단계까지 산출물 제공, 에러 원인 설명 |
| 스킬 실행 불가 | 해당 스킬의 SKILL.md 확인, 트리거 재시도 안내 |
| 질의 답변 보류 다수 | 보류 항목 목록 제공, "추가 질의 진행" 또는 "보류 상태로 정의서 생성" 선택 |
| 질의 중 신규 요건 발견 | 해당 요건을 별도 기록 후 Step 8에서 신규 업무/화면으로 추가 |

---

## 1.7 품질 체크리스트 (v2.1)

### 산출물 품질

| 점검 항목 | 확인 |
|-----------|------|
| 모든 산출물(최대 10개)이 생성되었는가? | □ |
| 각 산출물이 표 형식인가? | □ |
| 최종 요구사항 정의서가 .md 파일인가? | □ |
| 누락된 단계가 없는가? | □ |
| 사용자가 다운로드할 수 있는가? | □ |

### Step 1 소스 분석 품질 (v2.1 신규)

| 점검 항목 | 확인 |
|-----------|------|
| 화면명세표의 모든 화면이 실제 `page id`와 매핑되었는가? | □ |
| `nav-data.js` 메뉴에 있으나 화면명세에 누락된 화면이 없는가? | □ |
| 입력/출력 항목이 `grid-schemas.js`(필터·컬럼) 정의와 일치하는가? | □ |
| 상세 폼·모달·상태가 `page-*.js` 기준으로 반영되었는가? | □ |
| 추측으로 작성된(소스에 근거 없는) 요소가 없는가? | □ |

### 질의 답변 품질

| 점검 항목 | 확인 |
|-----------|------|
| 모든 🔴 필수 확인 질문에 답변이 완료되었는가? | □ |
| AI 추천 답변이 모든 질문에 포함되었는가? | □ |
| 질의 답변이 정의서에 정확히 반영되었는가? | □ |
| [미정의] 태그가 답변 확정 항목에서 제거되었는가? | □ |
| 질의 중 신규 도출된 업무/규칙이 정의서에 추가되었는가? | □ |
| 보류 항목이 [보류] 태그로 명시되었는가? | □ |

### 정의서 완성도

| 점검 항목 | 확인 |
|-----------|------|
| 정의서 내 [미정의] 항목이 10건 이하인가? | □ |
| 모든 업무에 Actor, Trigger, 처리 절차가 완비되었는가? | □ |
| 상태 전이 규칙이 허용/차단 매트릭스로 정의되었는가? | □ |
| 상태별 허용 액션 매트릭스가 포함되었는가? | □ |
| 처리 규칙에 질의 답변 출처(Q-번호)가 표기되었는가? | □ |
| 연동 시스템이 명시되었는가? | □ |

---

## 1.8 워크플로우 핵심 규칙

1. **순차 실행** — 각 단계는 이전 단계의 산출물에 의존
2. **중간 산출물 저장** — 각 단계의 결과를 파일로 저장
3. **에러 핸들링** — 한 단계 실패 시 해당 단계까지만 산출물 제공
4. **사용자 확인** — Step 7(질의 답변)은 **반드시 사용자 확인 후** Step 8 진행
5. **질의 답변 → 정의서 반영 추적** — 정의서 내 처리 규칙/정책에 질의 출처(Q-번호) 표기
6. **신규 요건 수용** — 질의 답변에서 기존 분석에 없던 신규 업무/화면/규칙이 도출되면 정의서에 추가
7. **요구사항 정의서** — 최종 산출물의 09 요구사항정의서는 01화면명세표, 02업무정의표, 03화면업무매핑표 내용 포함
8. **소스 진실 공급원 (v2.1)** — 화면 관련 사실은 `index.html` / `nav-data.js` / `grid-schemas.js` / `page-*.js` / `ui-kit.html`을 단일 진실 공급원으로 삼고, 소스와 어긋나는 추측은 명세에 넣지 않는다.

---

# 2. 범위(Scope)

## 포함
- 업무 프로세스
- 사용자 역할
- 화면 기능
- 입력/출력 항목
- 처리 규칙
- 정책/조건
- 예외 처리
- 상태 흐름
- 연동 시스템 (업무 관점)
- 접수금액 배부 구조 (업무 관점)

## 제외
- DB 스키마
- API 명세
- 인터페이스 기술 규격
- 배치/아키텍처 설계
- 프로그램 로직
- **소스 코드 구현 방식 (HTML/JS 자체의 코딩 패턴·리팩터링은 본 분석 범위 밖)**

---

# 3. 사용자/역할 정의

| 역할 | 설명 | 주요 책임 | 권한 관리 |
|--------|-----------|---------------------------|-----------|
| 고객 | 주문/결제 수행 | 주문 등록, 결제, 파일수정 요청, 디자인수정 요청 | 홈페이지 회원 |
| 접수 담당자 | 주문 검수 | 접수 배정, 접수 수정, 파일 처리, 문자/메일 발송 | 시스템 권한관리 CUD 기반 |
| 디자이너 | 디자인 작업 | 디자인 의뢰건 접수, 교정파일 처리, 디자인수정 응대 | 디자인팀 소속 여부로 판별 |
| 관리자 | 운영 관리 | 정책/코드/승인, 수동 접수 생성 | 시스템 권한관리 CUD 기반 |

---

# 4. 전체 업무 프로세스

## 업무 흐름

1. 주문 접수 (홈페이지 결제 완료 → 데이터 자동 생성)
2. 접수 배정 (접수가져오기 1회 15건)
3. 접수 처리 (파일 확인, 접수 수정, 긴급 설정 등)
4. 생산 진행 (조판 → 출력 → 인쇄 → 가공 → 포장)
5. 출고/배송 (송장 발급 → 배송 → 완료)
6. 사후 처리 (재작업: 전액환불/부분환불/재작업(신규접수건))

---

# 5~12. (기존 섹션 유지, 상세 내용은 09_요구사항_정의서 참조)

---

# ✅ 문서 작성 원칙 (Claude 필수 준수)

- 서술 ❌
- 표 중심 ✅
- 업무/화면 중심 ✅
- 개발 용어 금지 (API/DB/테이블/엔드포인트 등)
- 기획자/사용자 관점만 기술
- 바로 공유 가능한 완성 문서 수준 유지
- 질의 답변 출처(Q-번호) 처리 규칙/정책에 표기 ✅
- [미정의] 항목은 질의 후 확정, 확정 후 태그 제거 ✅
- 질의에서 신규 도출된 요건은 정의서에 즉시 추가 ✅
- **(v2.1) 화면 사실은 소스(HTML+JS)에 근거하여 작성, 추측 금지 ✅**
