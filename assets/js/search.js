/* =========================================================
 * Search Panel (검색 영역)
 *
 * 마크업 규약:
 *   <section class="search" data-search>
 *     ├ 기본 행: [data-from] [data-to] [data-quick] [data-cond] [data-keyword] [data-advanced-toggle] [data-submit] [data-reset]
 *     └ 상세검색: <div class="search__advanced">...</div>
 *
 * 사용:
 *   Search.attach(rootEl, (params) => { ... });
 *   - params: { from, to, condition, keyword, advanced: {...} }
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  const QUICK_RANGES = {
    today:  () => [0, 0],
    week:   () => [7, 0],
    m1:     () => [30, 0],
    m3:     () => [90, 0],
    m6:     () => [180, 0],
    y1:     () => [365, 0],
  };

  function fmt(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  function addDays(date, days) {
    const d = new Date(date); d.setDate(d.getDate() + days); return d;
  }

  function applyQuick(root, key) {
    const fromEl = root.querySelector('[data-from]');
    if (!fromEl) return;   // year/month 모드 — 일자 input 미존재 시 no-op
    const [back] = QUICK_RANGES[key]();
    const today = new Date();
    fromEl.value = fmt(addDays(today, -back));
    root.querySelector('[data-to]').value = fmt(today);
    root.querySelectorAll('[data-quick]').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.quick === key);
    });
  }

  function readParams(root) {
    const adv = {};
    // 단일 select 필드 (data-name 이 SELECT 인 경우)
    root.querySelectorAll('.search__advanced select[data-name]').forEach(el => {
      adv[el.dataset.name] = el.value;
    });
    // 다중 선택 (multi-select) — 체크된 값들 배열로 수집
    root.querySelectorAll('.search__advanced [data-multi-select][data-name]').forEach(wrap => {
      const checked = Array.from(wrap.querySelectorAll('[data-multi-option]:checked')).map(c => c.value);
      adv[wrap.dataset.name] = checked;   // [] = 전체
    });
    // 체크박스 필터: 같은 data-check 키로 묶어 배열로 수집 (다중 선택)
    const checks = {};
    root.querySelectorAll('.search__advanced [data-check]').forEach(el => {
      const key = el.dataset.check;
      checks[key] = checks[key] || [];
      if (el.checked) checks[key].push(el.value);
    });
    // 라디오 칩: 그룹당 단일 값
    const radios = {};
    root.querySelectorAll('.search__advanced [data-radio]:checked').forEach(el => {
      radios[el.dataset.radio] = el.value;
    });
    // 텍스트/숫자 인풋
    const inputs = {};
    root.querySelectorAll('.search__advanced [data-input]').forEach(el => {
      if (el.value !== '') inputs[el.dataset.input] = el.value;
    });
    return {
      from:      root.querySelector('[data-from]')?.value || '',
      to:        root.querySelector('[data-to]')?.value || '',
      dateKey:   root.querySelector('[data-date-col]')?.value || '',   // 일자 컬럼 기준
      year:      root.querySelector('[data-year]')?.value || '',       // yearMonth 모드
      month:     root.querySelector('[data-month]')?.value || '',
      condition: root.querySelector('[data-cond]')?.value || '',
      keyword:   root.querySelector('[data-keyword]')?.value || '',
      advanced:  adv,
      checks:    checks,
      radios:    radios,
      inputs:    inputs,
    };
  }

  function attach(root, onSearch, opts) {
    opts = opts || {};
    // 기본 퀵 기간: opts.defaultQuick 지정 시 그 값, 아니면 1개월 (기존 동작 유지).
    //   defaultQuick: null → 초기 퀵 미적용(칩 선택 없음 · 기간 비움 · 전체 조회)
    if (opts.defaultQuick !== null) applyQuick(root, opts.defaultQuick || 'm1');

    // 퀵 버튼
    root.querySelectorAll('[data-quick]').forEach(btn => {
      btn.addEventListener('click', () => applyQuick(root, btn.dataset.quick));
    });

    // 상세검색 토글 — 외부의 [상세검색] 버튼과 내부의 [닫기] 버튼 모두 동작
    const adv = root.querySelector('.search__advanced');
    if (adv) {
      root.querySelectorAll('[data-advanced-toggle]').forEach(btn => {
        btn.addEventListener('click', () => {
          adv.classList.toggle('is-open');
          // 외부 토글 버튼이 있다면 aria-expanded 동기화
          root.querySelectorAll('[data-advanced-toggle][aria-expanded]').forEach(b =>
            b.setAttribute('aria-expanded', adv.classList.contains('is-open'))
          );
        });
      });
    }

    // 조회
    const submit = root.querySelector('[data-submit]');
    submit && submit.addEventListener('click', () => onSearch && onSearch(readParams(root)));

    // 엔터로도 조회
    root.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') onSearch && onSearch(readParams(root));
      });
    });

    // 초기화
    const reset = root.querySelector('[data-reset]');
    reset && reset.addEventListener('click', () => {
      root.querySelectorAll('input, select').forEach(el => {
        if (el.tagName === 'SELECT') el.selectedIndex = 0;
        else if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
        else el.value = '';
      });
      if (opts.defaultQuick !== null) applyQuick(root, opts.defaultQuick || 'm1');
      // 년/월 모드 — 당해 년월 디폴트 복원 (기간 기본값과 동일한 의미)
      const yearEl  = root.querySelector('[data-year]');
      const monthEl = root.querySelector('[data-month]');
      if (yearEl && monthEl) {
        const now = new Date();
        yearEl.value  = String(now.getFullYear());
        monthEl.value = String(now.getMonth() + 1).padStart(2, '0');
      }
      onSearch && onSearch(readParams(root));
    });

    // 최초 조회
    onSearch && onSearch(readParams(root));
  }

  App.Search = { attach, readParams };
})();
