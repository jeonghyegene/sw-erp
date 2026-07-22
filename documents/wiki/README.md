# 성원애드피아 ERP 위키 (VitePress)

`documents/성원애드피아_ERP_인사근태급여_통합정책서.md` 를 기반으로 만든 사내 위키입니다.

## 구성

| 파일 | 내용 |
|---|---|
| `index.md` | 홈(랜딩) |
| `hr.md` | 인사 |
| `attendance.md` | 근태 |
| `payroll.md` | 급여 |
| `etc.md` | 기타 |
| `.vitepress/config.mjs` | 사이트 설정(네비·사이드바·검색·한글 앵커 slugify) |

## 실행 방법

> ⚠️ 이 폴더의 상위 경로에 공백과 `&` 문자가 있어 `npm run dev` 같은 npm 스크립트가 Windows에서 실패합니다.
> 아래처럼 **node로 vitepress를 직접 실행**하세요. (Git Bash / PowerShell 모두 동일)

```bash
cd documents/wiki

# 최초 1회 의존성 설치
npm install

# 개발 서버 (실시간 미리보기, http://localhost:5173)
node ./node_modules/vitepress/bin/vitepress.js dev

# 정적 사이트 빌드 → .vitepress/dist/ 에 HTML 생성
# ⚠️ OneDrive 동기화 폴더라 이전 산출물이 잠겨 빌드가 exit 127 로 죽을 수 있음.
#    빌드 전 캐시·산출물을 먼저 지우면 안정적으로 빌드됨.
rm -rf .vitepress/dist .vitepress/cache node_modules/.vite
node ./node_modules/vitepress/bin/vitepress.js build

# 빌드 결과 미리보기
node ./node_modules/vitepress/bin/vitepress.js preview
```

## 산출물(HTML)

빌드하면 `.vitepress/dist/` 에 정적 HTML이 생성됩니다. 웹서버에 이 폴더를 배포하거나
`preview` 로 확인하세요. (파일을 직접 `file://` 로 열면 절대경로 자산이 로드되지 않으므로 서버로 서빙 필요)

`.vitepress/dist/` 와 `node_modules/` 는 `.gitignore` 로 커밋에서 제외되어 있습니다.
빌드 HTML을 저장소에 함께 두려면 `.gitignore` 에서 `.vitepress/dist/` 줄을 지우세요.

## 버전 관리

- 현재 버전: **v1.1 (2026-07-22)** — 원본 정책서와 동일하게 관리합니다.
- 버전 표기 위치: 상단 네비 드롭다운(`v1.1`) · 하단 푸터 · 홈 히어로 · [변경 이력](./changelog.md).
- 버전을 올릴 때 함께 수정할 곳:
  1. 원본 문서 상단 `문서 버전` / `최종 수정일`
  2. `.vitepress/config.mjs` 의 `VERSION` / `DOC_DATE`
  3. `changelog.md` 에 새 버전 행 추가

## 원본과의 관계

- 현재 단일 진실원은 **`documents/성원애드피아_ERP_인사근태급여_통합정책서_v1.1.md`** 입니다. (v1.0 원본 `성원애드피아_ERP_인사근태급여_통합정책서.md` 는 아카이브로 보존)
- 본 위키 페이지들은 원본을 상위 섹션(인사·근태·급여·기타) 기준으로 분할한 것입니다.
- 원본이 갱신되면 페이지를 다시 분할·반영해야 합니다. (섹션 경계는 `## ` 헤딩 기준)
