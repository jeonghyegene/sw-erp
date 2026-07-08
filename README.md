# 그룹웨어 관리자 템플릿 — 공통 가이드

반응형 ERP/그룹웨어 관리자 페이지의 **공통 골격(스켈레톤)** 입니다.
팀원이 새 화면을 만들 때 본 템플릿의 구조·규약을 그대로 따르면, 동일한 UX/UI를 보장할 수 있습니다.

> 🟦 Primary `#00347D` · 🟧 Accent `#F38200` (로고 컬러 기반)

---

## 🚨 팀 최우선 규약 — UI Kit First + UIUX 규칙 준수

> ### ① **모든 화면 UI/UX 생성·수정 시 [UI Kit](ui-kit.html) 을 최우선 참고원으로 사용한다.**
> ### ② **UI Kit 에 없거나 신규로 구성되는 UI/Component 는 반드시 UI Kit 에 먼저 추가한 뒤 화면에 적용한다.**
> ### ③ **모든 화면 요소의 동작·표기·정렬은 [`uiux rule/`](uiux%20rule/) 폴더의 규칙 문서를 반드시 준수한다.**

UI Kit 은 **시각/구현의 단일 진실 공급원**이고, `uiux rule/` 폴더는 **동작·표기·UX 규칙의 단일 진실 공급원**입니다. 두 축이 동시에 만족되어야 화면이 완성됩니다.

### 📚 UIUX 규칙 문서 (`uiux rule/` 폴더)

| 파일 | 내용 | 적용 우선순위 |
|---|---|---|
| [`uiux rule/SWADPIA_BE_UIUX_1.1.md`](uiux%20rule/SWADPIA_BE_UIUX_1.1.md) | **성원 애드피아 MES/ERP UIUX 공통 가이드** — 날짜/시간 표시, 금액 표기, 그리드 정렬, 폼 규격, 버튼, 상태/알림, 검색, 코드 체계, 권한, 파일, 로딩, 포커스, 오류/빈 상태, 결재, 알림, 이력/로그, 다중 선택, 탭, 트리, 도움말, 즐겨찾기, 엑셀, 권한별 UI, Breadcrumb, 메모, 설정 — **27개 카테고리** | **필수 준수** |
| [`uiux rule/UI_Mapping_Rule_Guide_v2.md`](uiux%20rule/UI_Mapping_Rule_Guide_v2.md) | **UI Mapping Rule Guide v2.0** — 컴포넌트 카탈로그(COMP-*) + UI 패턴 카탈로그(P-001 Search List, P-002 Simple Form, P-003 Detail View, P-004 Grid Management, P-010 Search+Detail, P-012 Master-Detail, P-013 Multi-Tab Detail, P-014 Wizard Form 등) + 업무 유형 코드 + 상태 코드 | **필수 준수** |

### 작업 시 적용 순서 (3축 결합)

```
새 화면 / 컴포넌트 작업 시:

1️⃣  uiux rule/ 폴더 먼저 확인
    └─ SWADPIA 가이드: 날짜는 YY/MM/DD? 금액은 우측 정렬? 그리드 행 높이는?
    └─ UI Mapping: 어떤 패턴인지(P-001/P-010 등) 파악

2️⃣  UI Kit 에서 해당 패턴을 구현할 컴포넌트 탐색
    └─ ui-kit.html 좌측 TOC 검토
    └─ 동일 → 사용, 유사 → 수정자 확장, 신규 → UI Kit 등록 후 적용

3️⃣  화면에 적용
    └─ uiux rule 의 표기/동작 규칙 + UI Kit 의 시각 스타일 모두 만족
```

### SWADPIA 가이드의 핵심 규칙 (자주 위반되는 항목)

| 항목 | 규칙 | UI Kit 적용 위치 |
|---|---|---|
| 날짜 표시 | `YY/MM/DD` (예: 26/05/12) | 그리드 컬럼·검색 영역 |
| 일시 표시 | `YY/MM/DD   HH:MM` (공백 3칸) | 등록/수정 일시 |
| 금액 정렬 | 우측 정렬 + 천 단위 콤마 | 그리드 컬럼 `align: 'right'` |
| 그리드 컬럼 정렬 | 텍스트·ID·이메일·이름 → 좌측 / 체크박스·아이콘·상태·코드·날짜·유형 → 중앙 / 숫자·금액·수량 → 우측 | `grid-schemas.js` 의 `align` |
| 행 높이 | 기본 42px / 컴팩트 36px / 여유 48px | `.grid` 패딩 |
| 페이지 크기 | 기본 20건, 옵션 20/50/100/200/500/1,000 | `grid.js` `PAGE_SIZES` |
| 필수 입력 | 라벨 우측 `*` 빨간색 | `.search__adv-label em` |
| 필수 안내 | "필수 입력 항목입니다" | Validation 메시지 |
| 검색 영역 | 드롭다운 + 검색어 + 검색 버튼 / 상세검색 접기·펼치기 | `Components.searchPanel` |
| 자동완성 | 2글자 이상부터, 최대 10개 | Typeahead |
| 토스트 | 성공(녹·3초)/오류(적·수동)/정보(청·5초) | `window.toast` |
| 상태 뱃지 | 진행중(청)·완료(녹)·대기(회)·취소(적) | `.pill--info/--success/--warning/--danger` |
| 알림함 | 우측 슬라이드 패널, 최대 400px | `.notif-drawer` |
| 페이지네이션 | "1-20 / 총 156건" 표기, `《 〈 ... 〉 》` 컨트롤 | `grid.js` 페이지네이션 |

### UI Mapping Rule 패턴 카탈로그 (대표 패턴)

| 패턴 ID | 이름 | UI Kit 에서의 구현 |
|---|---|---|
| **P-001** | Search List (검색 + 목록 조회) | `Components.searchPanel` + `App.Grid.create` |
| **P-002** | Simple Form (단건 등록/수정) | Form Table (`.fm-card` + `.fm-tbl`) |
| **P-003** | Detail View (단건 상세 조회) | OffCanvas (`.offcanvas`) + `.fm-card` |
| **P-004** | Grid Management (그리드 기반 관리) | page-grid + Toolbar 액션 |
| **P-010** | Search + Detail (목록 + 상세) | page-grid + OffCanvas 결합 |
| **P-012** | Master-Detail (마스터 + 종속 상세) | 좌 grid + 우 detail card |
| **P-013** | Multi-Tab Detail (상세 내 다중 탭) | `.tabs` + tab panels |
| **P-014** | Wizard Form (단계별 입력) | Timeline + Tab Pills |

### 작업 시작 전 반드시 확인할 것

1. **[UI Kit](ui-kit.html) 좌측 TOC 전체를 훑어본다** — 만들려는 UI 와 동일·유사 컴포넌트가 있는지 식별
2. **변형이 필요하면 `.cls--variant` 수정자(modifier)로 확장** — 새 컴포넌트를 만들기 전에 기존 확장으로 해결 가능한지 검토
3. **확장으로도 안 되면** 그제서야 신규 컴포넌트 등록 절차에 들어감

### 화면 작업 의사결정 트리

```
새 UI 가 필요하다
  │
  ├─ ① UI Kit에 같은 게 있는가? ──── YES ──→ 해당 클래스 그대로 사용 (끝)
  │                                NO
  │                                 ↓
  ├─ ② UI Kit에 유사한 게 있는가? ── YES ──→ `.cls--variant` 수정자로 확장
  │                                       (변형 등록 → 화면 적용)
  │                                NO
  │                                 ↓
  └─ ③ 완전히 새로운 패턴 ──────────────→ ❶ UI Kit에 신규 등록
                                          ❷ 그 다음 화면에 동일 클래스 적용
                                          (등록 없이 화면에 직접 작성 금지)
```

### ❶ UI Kit 신규 등록 체크리스트

```
□ assets/css/ui-kit.css            — 컴포넌트 스타일 추가
                                      · 디자인 토큰 var(--...) 사용 (직접 hex 금지)
                                      · 클래스명 BEM (.block__elem--mod)
                                      · 상태 클래스 .is-active / .is-open 등
□ ui-kit.html                       — 데모 섹션 (<section id="..." class="uk-section">)
                                      · 실제로 동작하는 인터랙티브 데모
                                      · 사용 클래스 레퍼런스 표 권장
□ ui-kit.html #uk-toc              — 좌측 TOC 에 적절한 카테고리로 링크 추가
                                      (앱 레이아웃 / 기본 / 콘텐츠 / 상호작용 / 폼 / 데이터)
□ assets/js/ui-kit.js              — 인터랙션 필요 시 이벤트/렌더 로직
□ assets/js/components.js          — 데이터 주도 재사용이 잦으면 빌더 함수 추가
                                      (App.Components.* 네임스페이스)
```

### ❷ 화면 적용

UI Kit 등록 완료 후에야 다음 단계로 진행:

| 작업 | 수정할 파일 |
|---|---|
| 그리드형 화면 추가 | `nav-data.js` 메뉴 등록 + `grid-schemas.js` 스키마 등록 |
| 신규 페이지 타입 | `index.html` 마운트 포인트 + `pages.js` init |
| 새 컴포넌트 사용 | UI Kit 에 등록된 동일 클래스를 화면 코드에서 호출 |

> **UI Kit 클래스를 변형 없이 화면에서 그대로 쓰는 것이 정답.** 화면 코드 안에 `style="..."` 인라인 스타일이나 화면 전용 새 CSS 룰을 작성하지 말 것.

### 예외 — UI Kit 변경 없이 진행 가능한 경우

| 작업 | 사유 |
|---|---|
| `grid-schemas.js` 컬럼/필터/Mock 정의 | UI 가 아니라 데이터 스키마 |
| `nav-data.js` 메뉴 항목 추가 | 데이터, UI 가 아님 |
| 기존 컴포넌트의 텍스트/문구 교체 | 컨텐츠, 스타일 변경 없음 |
| 디자인 토큰만 교체 (`var(--color-...)`) | 토큰 시스템 내 변경 |

### 코드 리뷰 거부 사유

- ❌ 화면 코드 안에 인라인 `style="..."` 가 있다 → UI Kit 등록 또는 토큰 사용으로 이전
- ❌ UI Kit 에 없는 새 CSS 클래스가 화면 전용으로 추가됐다 → UI Kit 에 먼저 등록 요구
- ❌ "비슷한 게 있는데 그냥 직접 작성" → 기존 클래스 또는 수정자로 재구성
- ✅ UI Kit 에 등록된 클래스만 사용 / 변형이 필요한 부분도 UI Kit 에 동시 PR

### AI 어시스턴트(Claude 등) 가 작업 시 행동 규칙

본 프로젝트에서 AI 가 화면 작업을 수행할 때 자동으로 따라야 할 규칙은 [CLAUDE.md](CLAUDE.md) 에 명세되어 있습니다. 사용자가 "UI Kit 등록은 생략" 이라고 명시적으로 지시하지 않는 한 위 워크플로가 자동 적용됩니다.

---

## 1. 폴더 구조

```
1. Templet/
├─ index.html              ← 진입점 (레이아웃 전체 마크업)
├─ README.md               ← 본 가이드
├─ logo.svg                ← (원본)
└─ assets/
   ├─ img/
   │  └─ logo.svg
   ├─ css/
   │  ├─ variables.css     ← 디자인 토큰 (색상, 간격, 폰트, z-index)
   │  ├─ reset.css         ← 리셋 + 베이스
   │  ├─ layout.css        ← GNB / LNB / TabBar / Body 레이아웃
   │  └─ components.css    ← 버튼, 인풋, 검색영역, 그리드, 페이지네이션, 카드 …
   └─ js/
      ├─ icons.js          ← 인라인 SVG 아이콘 집합 (46종)
      ├─ components.js     ← UI 빌더 (searchPanel/toolbar/kpiCard/card/dashboardPage)
      ├─ nav-data.js       ← GNB↔LNB 메뉴 매핑 데이터 (✏️ 화면 추가 시 수정)
      ├─ navigation.js     ← GNB/LNB 렌더 & 동기화
      ├─ tabs.js           ← Story Tab Bar
      ├─ search.js         ← 검색 영역 동작 (기간/퀵/입력/상세/체크박스)
      ├─ grid.js           ← 데이터 그리드 + 페이지네이션
      ├─ grid-schemas.js   ← 그리드 스키마 레지스트리 (✏️ 신규 그리드 등록 위치)
      ├─ notifications.js  ← 알림함 Drawer
      ├─ pages.js          ← 페이지별 초기화 (Components/Schemas 호출)
      └─ app.js            ← 부트스트랩 (GNB 유틸 / LNB 토글 / 초기화)
```

---

## 2. 레이아웃 구조

```
┌────────────────────────────────────────────────────────────────┐
│  GNB  [브랜드]  [홈│인사│근태│…│경영/홍보]   [바로가기 알림 풀스크린 프로필] │  56px
├──────────┬─────────────────────────────────────────────────────┤
│          │  Story Tab Bar  [대시보드 ×][사원 정보 ×] …          │  40px
│   LNB    ├─────────────────────────────────────────────────────┤
│ 2/3depth │                                                     │
│ 아코디언  │            Body (page · 검색 + 그리드)               │  1fr
│  240px   │                                                     │
└──────────┴─────────────────────────────────────────────────────┘
```

| 영역 | DOM | 책임 |
|---|---|---|
| GNB | `header.gnb` | 카테고리(좌), 유틸리티(우) |
| LNB | `aside.lnb` | 선택된 카테고리의 2/3 depth |
| Tab Bar | `#tabbar.tabbar` | 진입한 화면을 탭으로 보관 |
| Body | `main.main > section.page` | 화면 컨텐츠 |

반응형:
- `≤ 1024px` : LNB 자동 collapse, 프로필 이름 숨김
- `≤ 768px`  : LNB 슬라이드 패널화, GNB 카테고리 메뉴는 햄버거 처리(추후)

---

## 3. 인터랙션 시나리오 (요구사항 매핑)

| 시나리오 | 처리 위치 |
|---|---|
| GNB 카테고리 클릭 → LNB 2/3depth 재노출 | `navigation.js` `selectCategory()` |
| LNB 첫번째 2Depth & 3Depth 자동 Active | `navigation.js` `selectCategory()` → 첫 group `is-open` + 첫 item `selectItem()` |
| 화면 진입 시 Tab Bar에 탭 생성 | `tabs.js` `open()` |
| 탭 클릭 시 화면 전환 + LNB 동기화 | `tabs.js` `activate()` → `Nav.syncTo()` |
| 탭 "×" 클릭 시 닫기 (최초 진입 탭은 불가) | `tabs.js` `close()` — `HOME_TAB_ID = 'dashboard'` |
| 기간 검색 + 퀵 버튼(오늘/1주/1개월/3개월/6개월) | `search.js` `QUICK_RANGES` |
| 입력 검색(셀렉트 + 키워드) | `search.js` `readParams()` |
| 상세 검색(영역 확장) | `[data-advanced-toggle]` → `.search__advanced.is-open` |
| 데이터 그리드 헤더 + 페이지네이션 고정, 데이터만 스크롤 | `layout.css` `.page` + `components.css` `.grid-scroll` |
| 페이지당 노출 건수 20/40/60/80/100 | `grid.js` `PAGE_SIZES` |
| 페이지네이션 최대 10p + 처음/끝/이전/다음 | `grid.js` `PAGE_BLOCK = 10` |

---

## 4. 컴포넌트 & 그리드 스키마 시스템

### 4.1 Components (UI 빌더)

`assets/js/components.js` 의 `App.Components` 네임스페이스. 모든 함수는 HTML 문자열을 리턴합니다.

| 함수 | 용도 |
|---|---|
| `searchPanel(spec)`   | 기간/퀵/입력검색/상세검색(셀렉트·체크박스) 패널 |
| `toolbar(spec)`       | 카운트 + 액션 버튼 영역 |
| `gridPage(spec)`      | `searchPanel` + `toolbar` + `<div class="grid-wrap">` 한 번에 |
| `kpiCard({label,value,delta,deltaKind})` | 대시보드 지표 카드 |
| `card({title,meta,body})` | 일반 카드 |
| `statusPill(text, kind)` | 상태 chip (success/warning/danger/info) |
| `dashboardPage({id, kpis, cards})` | KPI + 카드 그리드 페이지 |
| `mount(target, html)` | DOM 마운트 헬퍼 |
| `html` / `raw` / `escapeHTML` | XSS 안전 보간 태그드 템플릿 |

### 4.2 GridSchemas (그리드 스키마 레지스트리)

`assets/js/grid-schemas.js` 의 `App.GridSchemas`. 활성 LNB 항목 id 에 매핑된 스키마를 조회합니다.

```js
{
  columns:  [{ key, label, align?, width?, format?(v,row) }, ...],
  mock:     (n) => rows[],                            // mock 데이터 생성기
  search:   { conditions, advanced, checkGroups },    // 검색 패널 spec
  filter:   (rows, params) => filteredRows,           // 필터 함수
}
```

페이지가 활성화되면 `pages.js` 가 `App.GridSchemas.get(itemId)` 로 스키마를 받아 `Components.searchPanel` + `Components.toolbar` + `App.Grid.create` 를 자동 조립합니다.

기본 제공 스키마 (11종):
- `hr-employee` (default), `hr-appoint`
- `att-status`
- `acc-fin-loan`
- `mat-io-in`
- `as-status-facility`
- `eq-list`
- `sys-code-raw`
- `apr-draft-sent`
- `sec-guard`
- `biz-visit`

스키마가 등록되지 않은 LNB 항목이 `page-grid` 를 가리키면 자동으로 default(사원 정보)로 fallback 합니다.

---

## 5. 화면 추가 워크플로 (팀 공통 규약)

### 케이스 A — **그리드형 화면 추가** (가장 많은 케이스)

`page-grid` 마운트 포인트를 재사용하므로 index.html 은 건드릴 필요 없음.

**단계 1.** `nav-data.js` 에서 해당 항목의 `page` 를 `'page-grid'` 로 지정
```js
{ id: 'mat-io-in', label: '입고 조회', page: 'page-grid' }
```

**단계 2.** `grid-schemas.js` 에 스키마 등록 (한 블록만 추가)
```js
'mat-io-in': {
  columns: [
    { key: 'inDate', label: '입고일', align: 'center', width: '110px' },
    { key: 'sku',    label: 'SKU',    align: 'center' },
    { key: 'item',   label: '품목명' },
    { key: 'qty',    label: '수량',   align: 'right' },
    { key: 'status', label: '상태',   align: 'center' },
  ],
  mock(n = 100) { /* mock 데이터 또는 빈 배열 */ return rows; },
  search: {
    conditions: [{ value: 'all', label: '전체' }, { value: 'sku', label: 'SKU' }],
    advanced:   [{ name: 'vendor', label: '공급사', options: [...] }],
    checkGroups:[{ key: 'status',  label: '상태',   items: [...] }],
  },
  filter(rows, params) {
    // params: { from, to, condition, keyword, advanced, checks }
    return rows; // 필터링 후 리턴
  },
}
```

끝. LNB 항목을 클릭하면 자동으로 검색 + 그리드 + 페이지네이션이 해당 스키마로 빌드됩니다.

> 스키마를 등록하지 않으면 default(사원 정보) 스키마로 동작합니다.

### 케이스 B — **신규 페이지 타입 추가** (대시보드/카드형 등)

`page-grid` 와 다른 레이아웃이 필요한 경우.

**단계 1.** `index.html` 본문에 비어있는 마운트 포인트 추가
```html
<section id="page-my-screen" class="page page--scroll"></section>
```

**단계 2.** `pages.js` 에서 Components 로 채움
```js
function initMyScreenPage() {
  const pageEl = document.getElementById('page-my-screen');
  const html = App.Components.dashboardPage({
    id: 'inner', kpis: [...], cards: [...],
  });
  // mount inner children into pageEl
  const tmp = document.createElement('div'); tmp.innerHTML = html;
  pageEl.replaceChildren(...tmp.firstElementChild.children);
}
```

**단계 3.** `nav-data.js` 에서 `page: 'page-my-screen'` 지정.

기본 클래스:
- `.page` : 기본 (내부 영역 직접 레이아웃)
- `.page.page--scroll` : 길이가 길어 자체 스크롤이 필요한 화면(대시보드 등)
- 그리드 화면은 `.grid-wrap` 자식이 스크롤을 담당하므로 **`page--scroll` 붙이지 말 것**

> **타이틀 영역 없음.** 화면 식별은 LNB 의 Active 항목과 Story Tab 으로 충분합니다.  
> 페이지 액션(신규 등록, 엑셀 다운로드 등)은 `.toolbar` 우측에 배치합니다.

---

## 5. 검색 영역 마크업 규약

```html
<section class="search" data-search>
  <div class="search__row">
    <!-- 기간 -->
    <input data-from type="date"> ~ <input data-to type="date">

    <!-- 퀵 -->
    <button data-quick="today">오늘</button>
    <button data-quick="week">1주일</button>
    <button data-quick="m1">1개월</button>
    <button data-quick="m3">3개월</button>
    <button data-quick="m6">6개월</button>

    <!-- 입력 검색 -->
    <select data-cond>...</select>
    <input  data-keyword type="text">

    <!-- 상세 검색 토글 -->
    <button data-advanced-toggle>상세검색</button>

    <!-- 액션 -->
    <button data-reset>초기화</button>
    <button data-submit>조회</button>
  </div>

  <!-- 상세 검색 (확장) -->
  <div class="search__advanced">
    <div class="search__adv-grid">
      <select data-name="dept">...</select>
      <select data-name="pos">...</select>
    </div>

    <!-- 체크박스 필터 (복수 선택 가능) -->
    <div class="search__adv-checks">
      <div class="check-group">
        <span class="check-group__label">근무 유형</span>
        <div class="check-group__items">
          <label class="chk"><input type="checkbox" data-check="worktype" value="정규직"><span>정규직</span></label>
          <label class="chk"><input type="checkbox" data-check="worktype" value="계약직"><span>계약직</span></label>
        </div>
      </div>
    </div>
  </div>
</section>
```

JS 연결 (한 줄):

```js
App.Search.attach(pageEl.querySelector('[data-search]'), (params) => {
  // params: {
  //   from, to, condition, keyword,
  //   advanced: { dept, pos, ... },     // 단일 선택 (select / input)
  //   checks:   { worktype: [...], office: [...] }  // 복수 선택 (체크박스)
  // }
  // → 필터링 → grid.setRows(result)
});
```

**체크박스 필터 규약**
- `data-check="<그룹키>"` · 같은 그룹키는 배열로 묶여 들어옴
- 같은 그룹 내부: **OR** (선택한 값 중 하나라도 일치하면 통과)
- 그룹 간: **AND** (모든 그룹 조건을 동시에 만족해야 함)

---

## 6. 데이터 그리드 사용

```js
const grid = App.Grid.create({
  mount: pageEl.querySelector('.grid-wrap'),
  pageSize: 20,
  columns: [
    { key: 'no',     label: 'No',     align: 'center', width: '60px' },
    { key: 'name',   label: '이름' },
    { key: 'status', label: '상태',
      format: (v, row) => `<span class="pill pill--success">${v}</span>` },
  ],
  rows: [...]
});

// 검색 후 갱신
grid.setRows(filteredRows);
```

상태 표시 컴포넌트(`<span class="pill ...">`):
- `pill--success` 정상/재직
- `pill--warning` 보류/경고
- `pill--danger`  반려/퇴직
- `pill--info`    정보

---

## 7. 디자인 토큰 (CSS Variables)

> **하드코딩된 색상값/크기값을 직접 쓰지 말 것.** 반드시 `var(--...)` 사용.

자주 쓰는 토큰:

```css
/* 브랜드 */
var(--color-brand-primary)   /* #00347D — 메인 */
var(--color-brand-accent)    /* #F38200 — 강조/뱃지 */

/* 텍스트 */
var(--color-text)            /* 본문 */
var(--color-text-sub)        /* 보조 */
var(--color-text-muted)      /* 비활성 */

/* 면 */
var(--color-surface)         /* 카드/패널 */
var(--color-bg)              /* 페이지 배경 */
var(--color-border)          /* 라인 */

/* 상태 */
var(--color-hover) / --color-active / --color-focus

/* 사이즈 */
var(--gnb-height)   /* 56 */
var(--tabbar-height)/* 40 */
var(--lnb-width)    /* 240 */
```

---

## 8. 코드 컨벤션

- **CSS 클래스**: BEM 스타일 (`.search__row`, `.gnb__icon-btn`). 페이지 내 상태는 `.is-*` (예: `.is-active`, `.is-open`).
- **JS 네임스페이스**: 모든 모듈은 `window.App` 하위에. (예: `App.Nav`, `App.Tabs`, `App.Search`, `App.Grid`)
- **DOM 훅 속성**: 동작용 DOM은 `data-*` 로 식별 (`data-search`, `data-submit`, `data-quick`). 클래스로 동작 식별 금지.
- **유일 id**: nav-data 의 `id` 는 전역 유일. 신규 추가 전 검색해서 충돌 확인.
- **컬러**: 직접 hex 사용 금지. `variables.css` 에 토큰 추가 후 참조.
- **스크롤**: 페이지 내 내부 스크롤은 `min-height: 0; overflow: auto` 패턴 사용.

---

## 9. 실행

별도 빌드 도구가 필요 없습니다. `index.html` 을 브라우저로 열면 됩니다.
정적 서버가 필요한 경우 (보안 정책 등):

```bash
# Node 가 있으면
npx serve .

# Python 이 있으면
python -m http.server 8080
```

---

## 10. 다음 단계 (확장 포인트)

- [ ] 실 API 연동 (`fetch` 래퍼 `App.Api` 모듈 추가)
- [ ] 라우팅(URL hash 또는 history) → 새로고침 시 마지막 화면 복원
- [ ] 다국어(i18n) — nav-data 의 `label` 을 키로 분리
- [ ] 다크 테마 — `:root[data-theme="dark"]` 토큰 분기
- [ ] 권한별 메뉴 노출 제어 (nav-data 에 `roles: []` 속성 추가)
- [ ] 그리드 정렬/컬럼 리사이즈/Excel 다운로드 실제 구현
#   s w - e r p  
 