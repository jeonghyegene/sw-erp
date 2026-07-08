/* =========================================================
 * App 부트스트랩
 *  - GNB 유틸 이벤트 (알림 / 풀스크린 / 프로필 / 바로가기)
 *  - LNB collapse, 모바일 토글
 *  - 페이지 onShow 훅 등록 지점
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});
  const $ = (s, r = document) => r.querySelector(s);

  function bindGNBUtilities() {
    // Fullscreen
    $('#btn-fullscreen').addEventListener('click', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    });
    // 다크모드 토글 (해/달) — <html data-theme="dark"> + localStorage 영속
    bindThemeToggle();
    // 알림 — 진입은 App.Notifications 가 담당 (notifications.js)
    // 바로가기
    $('#btn-shortcut').addEventListener('click', () => {
      window.open('about:blank', '_blank');
    });
    // 프로필 드롭다운
    const profile = $('#gnb-profile');
    profile.addEventListener('click', (e) => {
      e.stopPropagation();
      profile.classList.toggle('is-open');
    });
    document.addEventListener('click', () => profile.classList.remove('is-open'));
    // 내 정보 — 인사정보카드 내용을 풀페이지로 (page-my-info). page-hr-info-mgmt.js 가 __onShow 로 렌더.
    const myInfoBtn = profile.querySelector('[data-open-myinfo]');
    if (myInfoBtn) myInfoBtn.addEventListener('click', () => {
      if (App.Tabs && App.Tabs.open) App.Tabs.open({ id: 'my-info', label: '내 정보', page: 'page-my-info' });
    });
    profile.querySelector('[data-logout]').addEventListener('click', () => {
      App.openLogin && App.openLogin();
    });
  }

  /* =========================================================
   * Theme — 다크모드 토글
   *  - <html data-theme="dark"|"light"> 로 토큰 오버라이드 (variables.css)
   *  - localStorage('sw-theme') 에 사용자 선택 영속
   *  - 저장값 없으면 OS 설정(prefers-color-scheme) 따름
   * ========================================================= */
  const THEME_KEY = 'sw-theme';

  function resolveInitialTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    const isDark = theme === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    const btn = $('#btn-theme');
    if (btn) {
      btn.setAttribute('aria-pressed', String(isDark));
      btn.setAttribute('title', isDark ? '라이트모드 전환' : '다크모드 전환');
      btn.setAttribute('aria-label', isDark ? '라이트모드 전환' : '다크모드 전환');
    }
  }

  App.setTheme = function (theme) {
    applyTheme(theme);
    localStorage.setItem(THEME_KEY, theme === 'dark' ? 'dark' : 'light');
  };

  function bindThemeToggle() {
    applyTheme(resolveInitialTheme());
    $('#btn-theme').addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      App.setTheme(next);
    });
  }

  /* =========================================================
   * Login — 풀스크린 로그인 레이어 (UI Kit .login)
   *  - 로그아웃 클릭 → 노출 / 로그인 성공 → 홈 Default(임원 전용) 노출
   *  - 데모 계정: qwer / 1234
   *  - 검증 실패는 인라인 .field-error (App.Forms) — 토스트 금지 (도메인 표준)
   * ========================================================= */
  const LOGIN_ID = 'qwer', LOGIN_PW = '1234';

  function bindLogin() {
    const screen = $('#login-screen');
    if (!screen) return;
    const form = $('#login-form');
    const idEl = $('#login-id');
    const pwEl = $('#login-pw');
    const F = App.Forms;

    App.openLogin = function () {
      F && F.clearAll(screen);
      idEl.value = '';
      pwEl.value = '';
      screen.hidden = false;
      setTimeout(() => idEl.focus(), 0);
    };

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      F && F.clearAll(screen);
      let ok = true;
      if (!idEl.value.trim()) { F && F.setFieldError(idEl, '아이디를 입력해 주세요'); ok = false; }
      if (!pwEl.value)        { F && F.setFieldError(pwEl, '비밀번호를 입력해 주세요'); ok = false; }
      if (!ok) return;
      if (idEl.value.trim() !== LOGIN_ID || pwEl.value !== LOGIN_PW) {
        F && F.setFieldError(pwEl, '아이디 또는 비밀번호가 올바르지 않습니다.');
        return;
      }
      screen.hidden = true;
      App.Nav.selectCategory('home');   // 로그인 성공 — 홈 Default(임원 전용 대시보드) 노출
    });

    // 재입력 시 해당 필드 인라인 에러 자동 클리어
    F && F.applyOnInput(screen);
  }

  const MOBILE_MQ = '(max-width: 1280px)';
  const isMobile = () => window.matchMedia(MOBILE_MQ).matches;

  function bindLNBControls() {
    const appEl = $('.app');
    const hamburger = $('#btn-hamburger');
    const scrim = $('#lnb-scrim');

    const setOpen = (open) => {
      appEl.classList.toggle('is-lnb-open', open);
      hamburger?.setAttribute('aria-expanded', String(open));
    };
    App.toggleMobileDrawer = setOpen;     // 외부(네비게이션)에서 닫기 호출용

    // LNB 헤더 버튼: 데스크톱=아이콘레일 collapse, 모바일=드로어 닫기
    $('#btn-collapse-lnb').addEventListener('click', () => {
      if (isMobile()) setOpen(false);
      else appEl.classList.toggle('is-lnb-collapsed');
    });

    // 햄버거: 모바일 드로어 토글
    hamburger?.addEventListener('click', () => setOpen(!appEl.classList.contains('is-lnb-open')));
    // 스크림 클릭 → 닫기
    scrim?.addEventListener('click', () => setOpen(false));
    // ESC → 닫기
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
    // 데스크톱 폭으로 복귀하면 드로어 상태 초기화
    window.matchMedia(MOBILE_MQ).addEventListener('change', (e) => { if (!e.matches) setOpen(false); });
  }

  App.boot = function () {
    bindGNBUtilities();
    bindLogin();
    bindLNBControls();
    App.Tabs.init();
    App.Nav.init();
    // 알림함
    App.Notifications && App.Notifications.init();
    // 페이지별 초기화 (등록된 화면에 한해)
    if (typeof App.initPages === 'function') App.initPages();
  };

  document.addEventListener('DOMContentLoaded', App.boot);
})();
