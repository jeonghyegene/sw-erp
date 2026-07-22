import { defineConfig } from 'vitepress'

/* 정책서 버전 — 원본 문서(성원애드피아_ERP_인사근태급여_통합정책서.md)와 동일하게 관리한다.
   원본 버전이 올라가면 이 값과 changelog.md 를 함께 갱신한다. */
const VERSION = 'v1.1'
const DOC_DATE = '2026-07-22'

/* GitHub 호환 slugify — 한글 heading ID 를 원본 문서의 앵커(#임직원-관리 등)와 일치시킨다.
   소문자화 → 문자/숫자/공백/하이픈 외 제거(·, 괄호 등) → 공백을 하이픈으로. */
function slugify(str) {
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} \-]/gu, '')
    .replace(/ +/g, '-')
}

export default defineConfig({
  lang: 'ko-KR',
  title: '성원애드피아 ERP 위키',
  description: '인사·근태·급여 통합 정책서 기반 사내 위키',
  cleanUrls: true,
  lastUpdated: true,

  /* Pretendard 웹폰트 로드 (가변 폰트 · 동적 서브셋 — 한글 글리프만 필요 시 로드) */
  head: [
    ['link', { rel: 'preconnect', href: 'https://cdn.jsdelivr.net' }],
    ['link', {
      rel: 'stylesheet',
      href: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css',
    }],
  ],

  markdown: {
    anchor: { slugify },
    lineNumbers: false,
  },

  themeConfig: {
    outline: { level: [2, 3], label: '목차' },
    docFooter: { prev: '이전', next: '다음' },
    returnToTopLabel: '맨 위로',
    sidebarMenuLabel: '메뉴',
    darkModeSwitchLabel: '다크 모드',
    lastUpdatedText: '마지막 수정',

    nav: [
      { text: '홈', link: '/' },
      { text: '인사', link: '/hr' },
      { text: '근태', link: '/attendance' },
      { text: '급여', link: '/payroll' },
      { text: '기타', link: '/etc' },
      {
        text: VERSION,
        items: [
          { text: `현재 버전 · ${VERSION} (${DOC_DATE})`, link: '/changelog' },
          { text: '변경 이력', link: '/changelog' },
        ],
      },
    ],

    sidebar: [
      {
        text: '인사',
        link: '/hr',
        collapsed: false,
        items: [
          { text: '임직원 관리', link: '/hr#임직원-관리' },
          { text: '임직원 현황', link: '/hr#임직원-현황' },
          { text: '계약', link: '/hr#계약' },
          { text: '고용 및 인사 변경', link: '/hr#고용-및-인사-변경' },
          { text: '인사정보카드', link: '/hr#인사정보카드' },
        ],
      },
      {
        text: '근태',
        link: '/attendance',
        collapsed: false,
        items: [
          { text: '용어 정의', link: '/attendance#용어-정의' },
          { text: '근무조', link: '/attendance#근무조' },
          { text: '근무정책', link: '/attendance#근무정책' },
          { text: '근무스케줄', link: '/attendance#근무스케줄' },
          { text: '근태 공통 정책', link: '/attendance#근태-공통-정책' },
          { text: '연차', link: '/attendance#연차' },
          { text: '초과근무', link: '/attendance#초과근무' },
          { text: '시간외수당', link: '/attendance#시간외수당' },
        ],
      },
      {
        text: '급여',
        link: '/payroll',
        collapsed: false,
        items: [
          { text: '임금 산정 정책', link: '/payroll#임금-산정-정책' },
          { text: '급여 정산', link: '/payroll#급여-정산' },
        ],
      },
      {
        text: '기타',
        link: '/etc',
        collapsed: false,
        items: [
          { text: '경조사', link: '/etc#경조사' },
          { text: '사번', link: '/etc#사번' },
        ],
      },
      {
        text: '문서 정보',
        collapsed: false,
        items: [
          { text: `변경 이력 (${VERSION})`, link: '/changelog' },
        ],
      },
    ],

    search: { provider: 'local' },

    footer: {
      message: `성원애드피아 ERP 인사·근태·급여 통합 정책서 · ${VERSION} (${DOC_DATE})`,
      copyright: '사내 문서 — 대외비',
    },
  },
})
