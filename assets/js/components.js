/* =========================================================
 * Components (UI 빌더)
 *
 * 모든 함수는 HTML 문자열을 리턴한다.
 * 페이지/섹션 단위로 데이터-주도로 만들 때 사용한다.
 *
 *  - Components.html(strings, ...values)   : 안전 보간(이스케이프) 태그
 *  - Components.searchPanel(spec)
 *  - Components.toolbar(spec)
 *  - Components.gridPage(spec)             : 검색 + 툴바 + 그리드 마운트 포인트
 *  - Components.kpiCard(spec)
 *  - Components.card(spec)
 *  - Components.statusPill(text, kind)
 *  - Components.dashboardPage(spec)
 *  - Components.mount(target, html)
 *
 * spec 의 사양은 각 함수 상단 주석 참고.
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  /** XSS 안전 보간 (HTML escape) */
  function escapeHTML(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** 태그드 템플릿: 보간되는 값을 자동 이스케이프 (이미 안전한 HTML 은 raw() 로 표시) */
  function html(strings, ...values) {
    let out = '';
    strings.forEach((s, i) => {
      out += s;
      if (i < values.length) {
        const v = values[i];
        // raw marker: 빈 문자열도 raw 일 수 있으므로 'in' 으로 검사
        if (v && typeof v === 'object' && '__raw' in v) out += v.__raw;
        else if (Array.isArray(v)) out += v.join('');
        else if (v == null) out += '';
        else out += escapeHTML(v);
      }
    });
    return out;
  }
  function raw(s) { return { __raw: s == null ? '' : String(s) }; }

  /** ---------- 검색 패널 ----------
   * spec = {
   *   showDateRange:   true,                     // 기본 true
   *   quick:           ['today','week','m1','m3','m6'],   // 기본 위 그대로
   *   conditions:      [{ value, label }, ...],  // 입력검색 셀렉트 옵션
   *   placeholder:     '검색어를 입력하세요',
   *
   *   cols:            2,                        // 상세검색 컬럼 수 (1~4, 기본 2)
   *
   *   advanced:        [{ name, label, required?, wide?, w2?, options:[...] }, ...],
   *   inputs:          [{ name, label, required?, wide?, w2?, type?, placeholder?, min?, max? }, ...],
   *   radioGroups:     [{ key, label, required?, wide?, defaultValue?, items:[...] }, ...],
   *   checkGroups:     [{ key, label, required?, wide?, items:[...] }, ...],
   *
   *   - required: 라벨 우측 * 빨간색 표시
   *   - wide: true 면 input 셀이 행 전체를 차지 (라디오/체크 기본값)
   *   - w2:   true 면 input 셀이 2 pair 차지
   * }
   */
  function searchPanel(spec = {}) {
    const showDateRange = spec.showDateRange !== false;
    const quick = spec.quick || ['today','week','m1','m3','m6'];
    const conds = spec.conditions || [{ value: 'all', label: '전체' }];
    const ph    = spec.placeholder || '검색어를 입력하세요';
    const adv   = spec.advanced || [];
    const inputs = spec.inputs || [];
    const chks  = spec.checkGroups || [];
    const radios = spec.radioGroups || [];
    // 도메인 표준 — 상세검색 컬럼 수는 실제 필드 수와 동일하게 자동 조정 (1~4).
    //   · cols 가 실제 필드 수보다 크면, 우측에 빈 공간이 생기지 않도록 자동 축소.
    //   · 필드가 1개면 cols=1, 2개면 cols=2 … 그래야 1fr 균등 분할이 100% 폭을 채움.
    const totalFields = (spec.advanced || []).length + (spec.inputs || []).length + (spec.checkGroups || []).length + (spec.radioGroups || []).length;
    const _specCols = Math.min(4, Math.max(1, spec.cols || 2));
    const cols  = totalFields > 0 ? Math.min(_specCols, Math.max(1, totalFields)) : _specCols;

    const QUICK_LABEL = { today:'오늘', week:'1주일', m1:'1개월', m3:'3개월', m6:'6개월', y1:'1년' };

    // ===== 기간 필터의 일자 컬럼 자동 감지 =====
    // spec.dateColumns: [{ key, label }] · 명시 지정
    // 또는 spec.columns 자동 스캔 (label 에 '일' 포함된 컬럼)
    let dateCols = Array.isArray(spec.dateColumns) ? spec.dateColumns.slice() : [];
    if (!dateCols.length && Array.isArray(spec.columns)) {
      dateCols = spec.columns
        .filter(c => c && c.label && /일|일자|일시/.test(c.label))
        .map(c => ({ key: c.key, label: c.label }));
    }

    // 기간 조회 옵션 라벨은 "일시"/"일자" 도 "일" 로 표기
    const toPeriodLabel = (lbl) => String(lbl || '').replace(/일시$/, '일').replace(/일자$/, '일');
    const dateFieldLabelHTML = dateCols.length
      ? `<select class="select" data-date-col aria-label="기간 기준 컬럼">
           ${dateCols.map((c, i) => `<option value="${escapeHTML(c.key)}"${i === 0 ? ' selected' : ''}>${escapeHTML(toPeriodLabel(c.label))}</option>`).join('')}
         </select>`
      : `<span class="field__label">${escapeHTML(toPeriodLabel(spec.dateLabel) || '기안일')}</span>`;   /* fallback — spec.dateLabel 지정 시 그 라벨, 없으면 '기안일' */

    // 년/월 모드 — 월마감 등 월단위 집계 화면용. spec.yearMonth = true | { years: [...] }
    //   true 면 기본 옵션 (당해년 ±3); { years: [...] } 로 직접 지정 가능 (내림차순 정렬)
    let dateField = '';
    if (spec.yearMonth) {
      const ymCfg = (spec.yearMonth === true) ? {} : spec.yearMonth;
      const _now = new Date();
      const _curY = _now.getFullYear();
      const _curM = String(_now.getMonth() + 1).padStart(2, '0');
      const years = Array.isArray(ymCfg.years) && ymCfg.years.length
        ? ymCfg.years.slice().map(Number)
        : [_curY + 1, _curY, _curY - 1, _curY - 2, _curY - 3];
      if (!years.includes(_curY)) years.push(_curY);   // 당해년 미포함 시 보강
      years.sort((a, b) => b - a);
      const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
      // 디폴트 — 당해 년월 (페이지 진입 시 자동 선택)
      // 빈 옵션('년'/'월' placeholder) 없음 — 항상 구체 년월 선택 (디폴트 = 당해 년월)
      dateField = html`
        <div class="field">
          <select class="select" data-year aria-label="년">
            ${raw(years.map(y => `<option value="${y}"${y === _curY ? ' selected' : ''}>${y}</option>`).join(''))}
          </select>
          <select class="select" data-month aria-label="월">
            ${raw(months.map(m => `<option value="${m}"${m === _curM ? ' selected' : ''}>${m}</option>`).join(''))}
          </select>
        </div>
        <div class="search__divider"></div>
      `;
    } else if (showDateRange) {
      dateField = html`
        <div class="field">
          ${raw(dateFieldLabelHTML)}
          <input class="input input--date" type="date" data-from />
          <span style="color:var(--color-text-muted)">~</span>
          <input class="input input--date" type="date" data-to />
        </div>
        <div class="search__quick">
          ${raw(quick.map(k => `<button class="btn btn--sm" type="button" data-quick="${k}">${QUICK_LABEL[k] || k}</button>`).join(''))}
        </div>
        <div class="search__divider"></div>
      `;
    }

    const condField = html`
      <div class="field">
        <select class="select" data-cond>
          ${raw(conds.map(o => `<option value="${escapeHTML(o.value)}">${escapeHTML(o.label)}</option>`).join(''))}
        </select>
        <input class="input input--search" type="text" placeholder="${ph}" data-keyword />
      </div>
    `;

    // ===== Form Table 통합 렌더링 (selects + inputs + radio + check) =====
    function labelHTML(f) {
      return `<div class="search__adv-label">${escapeHTML(f.label)}${f.required ? '<em>*</em>' : ''}</div>`;
    }
    function inputCellHTML(inner, wide) {
      const cls = ['search__adv-input'];
      if (wide === true) cls.push('search__adv-input--wide');
      else if (wide === 'w2') cls.push('search__adv-input--w2');
      return `<div class="${cls.join(' ')}">${inner}</div>`;
    }

    const fieldsHTML = [];

    // 1) Select 필드 (단일/다중)
    adv.forEach(f => {
      let inner;
      if (f.multi) {
        // 다중 선택 드롭다운 (multi-select 컴포넌트)
        const items = (f.options || []).map(o => {
          const v = o.value ?? o;
          const lbl = o.label ?? o;
          return `<label class="chk"><input type="checkbox" data-multi-option value="${escapeHTML(v)}"><span>${escapeHTML(lbl)}</span></label>`;
        }).join('');
        inner = `<div class="multi-select" data-multi-select data-name="${escapeHTML(f.name)}">
          <button class="multi-select__field" type="button" data-multi-trigger>
            <span class="multi-select__chips" data-multi-chips></span>
            <span class="multi-select__placeholder" data-multi-placeholder>${escapeHTML(f.placeholder || '전체')}</span>
            <span class="multi-select__caret">▾</span>
          </button>
          <div class="multi-select__menu">${items}</div>
        </div>`;
      } else {
        const opts = `<option value="">전체</option>` +
          (f.options || []).map(o => `<option value="${escapeHTML(o.value ?? o)}">${escapeHTML(o.label ?? o)}</option>`).join('');
        inner = `<select class="select" data-name="${escapeHTML(f.name)}">${opts}</select>`;
      }
      const wide = f.wide ? true : (f.w2 ? 'w2' : false);
      fieldsHTML.push(`<div class="search__adv-field">${labelHTML(f)}${inputCellHTML(inner, wide)}</div>`);
    });

    // 2) Input 필드 (텍스트/숫자/날짜)
    inputs.forEach(f => {
      const type = f.type || 'text';
      const min = f.min != null ? ` min="${escapeHTML(f.min)}"` : '';
      const max = f.max != null ? ` max="${escapeHTML(f.max)}"` : '';
      const inp = `<input class="input" type="${escapeHTML(type)}" data-input="${escapeHTML(f.name)}" placeholder="${escapeHTML(f.placeholder || '')}"${min}${max}>`;
      const wide = f.wide ? true : (f.w2 ? 'w2' : false);
      fieldsHTML.push(`<div class="search__adv-field">${labelHTML(f)}${inputCellHTML(inp, wide)}</div>`);
    });

    // 3) Radio 그룹 (단일 선택, 기본 wide)
    radios.forEach(g => {
      const def = g.defaultValue;
      const items = (g.items || []).map(it => {
        const v = it.value ?? it;
        const lbl = it.label ?? it;
        const checked = (v === def) ? ' checked' : '';
        return `<label class="chk">
          <input type="radio" name="rg-${escapeHTML(g.key)}" data-radio="${escapeHTML(g.key)}" value="${escapeHTML(v)}"${checked}>
          <span>${escapeHTML(lbl)}</span>
        </label>`;
      }).join('');
      const wide = g.wide === false ? false : true;
      fieldsHTML.push(`<div class="search__adv-field">${labelHTML(g)}${inputCellHTML(items, wide)}</div>`);
    });

    // 4) Checkbox 그룹 (다중 선택, 기본 wide)
    chks.forEach(g => {
      const items = (g.items || []).map(it => `
        <label class="chk">
          <input type="checkbox" data-check="${escapeHTML(g.key)}" value="${escapeHTML(it.value ?? it)}">
          <span>${escapeHTML(it.label ?? it)}</span>
        </label>
      `).join('');
      const wide = g.wide === false ? false : true;
      fieldsHTML.push(`<div class="search__adv-field">${labelHTML(g)}${inputCellHTML(items, wide)}</div>`);
    });

    const advHTML    = fieldsHTML.length ? `<div class="search__adv-tbl" data-cols="${cols}">${fieldsHTML.join('')}</div>` : '';
    const checksHTML = ''; // 이제 모두 통합되었으므로 빈 문자열로 유지 (기존 advanced 결합 로직 유지)

    // alwaysOpenAdvanced — 상세검색 버튼 비노출 + 상세 필터를 항상 펼친 상태로 표시
    const alwaysOpen = !!spec.alwaysOpenAdvanced;

    const advanced = (advHTML || checksHTML) ? `
      <div class="search__advanced${alwaysOpen ? ' is-open' : ''}">
        ${advHTML}
        ${checksHTML}
        ${alwaysOpen ? '' : `<div class="search__adv-actions">
          <button class="btn btn--ghost btn--sm" type="button" data-advanced-toggle>닫기</button>
        </div>`}
      </div>
    ` : '';

    return html`
      <section class="search" data-search aria-label="검색">
        <div class="search__row">
          ${raw(dateField)}
          ${raw(condField)}
          ${((advHTML || checksHTML) && !alwaysOpen) ? raw(`
            <button class="btn" type="button" data-advanced-toggle aria-expanded="false">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              상세검색
            </button>
          `) : ''}
          <div style="margin-left:auto; display:flex; gap:6px;">
            <button class="btn" type="button" data-reset>초기화</button>
            <button class="btn btn--primary" type="button" data-submit>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
              조회
            </button>
          </div>
        </div>
        ${raw(advanced)}
      </section>
    `;
  }

  /** ---------- 툴바 ----------
   * spec = { showCount: true, actions: [{ label, kind?, icon?, onClick? }] }
   *  - kind: 'primary' | 'ghost' | undefined
   *  - icon: 'plus' | 'download' | 'refresh' | ...   (icons.js 의 키)
   */
  function toolbar(spec = {}) {
    const showCount = spec.showCount !== false;
    const actions   = spec.actions || [];

    const actionsHTML = actions.map((a, i) => {
      const kindCls = a.kind === 'primary' ? ' btn--primary' :
                      a.kind === 'ghost'   ? ' btn--ghost'   : '';
      const ico = a.icon && window.Icons && window.Icons[a.icon] ? window.Icons[a.icon] : '';
      const keyAttr = a.key ? ` data-action-key="${escapeHTML(a.key)}"` : '';
      return `<button class="btn btn--sm${kindCls}" type="button" data-action-index="${i}"${keyAttr}>${ico}${escapeHTML(a.label)}</button>`;
    }).join('');

    return html`
      <div class="toolbar">
        <div class="toolbar__left">
          ${raw(showCount ? `<span class="toolbar__count">총 <span data-count><strong>0</strong>건</span></span>` : '')}
        </div>
        <div class="toolbar__right">${raw(actionsHTML)}</div>
      </div>
    `;
  }

  /** ---------- 그리드 페이지 (search + toolbar + grid) ----------
   * spec = {
   *   id,                    // section id
   *   search:  searchPanelSpec | false,
   *   toolbar: toolbarSpec  | false,
   * }
   */
  function gridPage(spec) {
    const search  = spec.search  === false ? '' : searchPanel(spec.search);
    const tb      = spec.toolbar === false ? '' : toolbar(spec.toolbar);
    return html`
      <section id="${spec.id}" class="page">
        ${raw(search)}
        ${raw(tb)}
        <div class="grid-wrap"></div>
      </section>
    `;
  }

  /** ---------- KPI 카드 ----------
   * spec = { label, value, delta?, deltaKind? ('up'|'down') }
   */
  function kpiCard({ label, value, delta, deltaKind }) {
    return html`
      <div class="kpi">
        <div class="kpi__label">${label}</div>
        <div class="kpi__value">${value}</div>
        ${raw(delta ? `<div class="kpi__delta ${deltaKind === 'down' ? 'down' : 'up'}">${escapeHTML(delta)}</div>` : '')}
      </div>
    `;
  }

  /** ---------- 일반 카드 ---------- */
  function card({ title, meta, body }) {
    return html`
      <article class="card">
        <div class="card__title">${title}</div>
        ${raw(meta ? `<div class="card__meta">${escapeHTML(meta)}</div>` : '')}
        ${raw(body ? `<div class="card__body">${body.__raw ?? escapeHTML(body)}</div>` : '')}
      </article>
    `;
  }

  /** ---------- 상태 pill ----------
   *  kind: 'success' | 'warning' | 'danger' | 'info' | '' (default)
   */
  function statusPill(text, kind = '') {
    const cls = kind ? ` pill--${kind}` : '';
    return `<span class="pill${cls}">${escapeHTML(text)}</span>`;
  }

  /** ---------- 대시보드 페이지 ----------
   * spec = { id, kpis: [...], cards: [...] }
   */
  function dashboardPage(spec) {
    const kpis  = (spec.kpis  || []).map(kpiCard).join('');
    const cards = (spec.cards || []).map(card).join('');
    return html`
      <section id="${spec.id}" class="page page--scroll">
        ${raw(kpis  ? `<div class="dashboard">${kpis}</div>` : '')}
        ${raw(cards ? `<div class="cards">${cards}</div>`     : '')}
      </section>
    `;
  }

  /** target 자리에 html 문자열을 마운트 (replaceChildren로 안전 치환) */
  function mount(target, htmlStr) {
    const t = (typeof target === 'string') ? document.querySelector(target) : target;
    if (!t) return null;
    const wrap = document.createElement('div');
    wrap.innerHTML = htmlStr;
    t.replaceChildren(...wrap.children);
    return t;
  }

  /* ============ Multi Select (다중 선택 드롭다운) ============
   * 마크업: <div class="multi-select" data-multi-select data-name="key">
   *           <button data-multi-trigger>... <span data-multi-chips></span> <span data-multi-placeholder>...</span></button>
   *           <div class="multi-select__menu">
   *             <label class="chk"><input type="checkbox" data-multi-option value="A"><span>A</span></label> ... </div>
   *         </div>
   * 값 읽기: root.querySelectorAll('[data-multi-select][data-name]') 각각 .checked .value 수집
   */
  function refreshMultiSelect(root) {
    const chips = root.querySelector('[data-multi-chips]');
    const placeholder = root.querySelector('[data-multi-placeholder]');
    const checked = root.querySelectorAll('[data-multi-option]:checked');
    if (!checked.length) {
      if (chips) chips.innerHTML = '';
      if (placeholder) placeholder.style.display = '';
    } else {
      if (placeholder) placeholder.style.display = 'none';
      if (chips) chips.innerHTML = Array.from(checked).map(c => {
        const lbl = c.parentElement.querySelector('span')?.textContent || c.value;
        return `<span class="multi-select__chip">${escapeHTML(lbl)}<button type="button" class="multi-select__chip-x" data-multi-remove="${escapeHTML(c.value)}" aria-label="제거">✕</button></span>`;
      }).join('');
    }
  }

  function initMultiSelect() {
    // 초기 chip 동기화
    document.querySelectorAll('[data-multi-select]').forEach(refreshMultiSelect);

    // 전역 위임 (이미 바인딩되었으면 skip)
    if (window.__msInit) return;
    window.__msInit = true;

    document.addEventListener('click', (e) => {
      // 외부 클릭 → 모든 multi-select 닫기
      const inside = e.target.closest('[data-multi-select]');
      document.querySelectorAll('[data-multi-select].is-open').forEach(ms => {
        if (ms !== inside) ms.classList.remove('is-open');
      });

      // chip ✕ 클릭 → 해당 옵션 uncheck (트리거 토글보다 먼저 처리)
      // 칩이 트리거 버튼 내부에 있어, 트리거 토글이 먼저 실행되면 X 가 무시되고 메뉴만 토글됨.
      const rmBtn = e.target.closest('[data-multi-remove]');
      if (rmBtn) {
        e.preventDefault();
        e.stopPropagation();
        const wrap = rmBtn.closest('[data-multi-select]');
        const val = rmBtn.getAttribute('data-multi-remove');
        const cb = wrap?.querySelector(`[data-multi-option][value="${CSS.escape(val)}"]`);
        if (cb) { cb.checked = false; refreshMultiSelect(wrap); wrap.dispatchEvent(new Event('change', { bubbles: true })); }
        return;
      }

      // 트리거 클릭 → 토글
      const trig = e.target.closest('[data-multi-trigger]');
      if (trig) {
        const wrap = trig.closest('[data-multi-select]');
        if (wrap) wrap.classList.toggle('is-open');
        return;
      }
    });

    document.addEventListener('change', (e) => {
      if (e.target.matches('[data-multi-option]')) {
        const wrap = e.target.closest('[data-multi-select]');
        if (wrap) refreshMultiSelect(wrap);
      }
    });
  }

  /* ============ Combo (Searchable Select) helper ============
   * 사용:
   *   const combo = App.Components.attachCombo(rootEl, {
   *     options: [{ value, label }, ...],
   *     value: '',                                   // 초기 선택값
   *     placeholder: '선택',
   *     searchPlaceholder: '검색',
   *     onChange(value, option) { ... },
   *   });
   *   combo.getValue() / setValue(v) / setOptions([...]) / destroy()
   *
   * rootEl 은 UI Kit `.combo` 마크업 (트리거 + 패널) 을 포함해야 한다.
   * (CSS: ui-kit.css `.combo`)
   * ====================================================== */
  function attachCombo(root, opts) {
    opts = opts || {};
    const state = {
      options: (opts.options || []).slice(),
      value: opts.value || '',
      placeholder: opts.placeholder || '선택',
      searchPlaceholder: opts.searchPlaceholder || '검색',
      onChange: typeof opts.onChange === 'function' ? opts.onChange : null,
      open: false,
      query: '',
      focusIndex: -1,
    };

    const field   = root.querySelector('.combo__field');
    const valueEl = root.querySelector('.combo__value');
    const panel   = root.querySelector('.combo__panel');
    const search  = root.querySelector('.combo__search');
    const list    = root.querySelector('.combo__list');
    if (!field || !valueEl || !panel || !search || !list) {
      console.warn('[attachCombo] required .combo markup missing in root', root);
      return null;
    }
    if (opts.searchPlaceholder) search.placeholder = opts.searchPlaceholder;

    function escHTML(s) {
      return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    // ── 한글 초성 검색 지원 ─────────────────────────────────────
    // 입력이 자음만(예: 'ㅇㅅㄷ') 이면 라벨의 초성 시퀀스(예: '용산대리점' → 'ㅇㅅㄷㄹㅈ') 부분일치로 매칭
    const CHOSUNG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
    function _toChosung(s) {
      let out = '';
      const str = String(s || '');
      for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if (code >= 0xAC00 && code <= 0xD7A3) {
          out += CHOSUNG[Math.floor((code - 0xAC00) / 588)];
        } else if (code >= 0x3131 && code <= 0x314E) {
          // 이미 자음(호환 자모) — 그대로 사용
          out += str[i];
        } else {
          out += str[i];
        }
      }
      return out;
    }
    function _isChosungQuery(q) {
      // 쿼리가 호환 자모(ㄱ-ㅎ) 만으로 구성되어 있는지
      return /^[ㄱ-ㅎ]+$/.test(q);
    }
    function highlight(label, q) {
      if (!q) return escHTML(label);
      // 초성 검색일 경우 — 매칭 위치를 일반 글자 단위로 찾아 highlight
      if (_isChosungQuery(q)) {
        const labelCho = _toChosung(label);
        const idx = labelCho.indexOf(q);
        if (idx < 0) return escHTML(label);
        return escHTML(label.slice(0, idx))
          + '<mark>' + escHTML(label.slice(idx, idx + q.length)) + '</mark>'
          + escHTML(label.slice(idx + q.length));
      }
      const idx = label.toLowerCase().indexOf(q.toLowerCase());
      if (idx < 0) return escHTML(label);
      return escHTML(label.slice(0, idx))
        + '<mark>' + escHTML(label.slice(idx, idx + q.length)) + '</mark>'
        + escHTML(label.slice(idx + q.length));
    }
    function filtered() {
      const q = state.query.trim().toLowerCase();
      if (!q) return state.options;
      const isCho = _isChosungQuery(q);
      return state.options.filter(o => {
        const lbl = String(o.label || '');
        const val = String(o.value || '');
        if (isCho) {
          // 초성만 입력 — 라벨/값의 초성 시퀀스 부분일치
          return _toChosung(lbl).includes(q) || _toChosung(val).includes(q);
        }
        return lbl.toLowerCase().includes(q) || val.toLowerCase().includes(q);
      });
    }
    function syncValueLabel() {
      const sel = state.options.find(o => String(o.value) === String(state.value));
      if (sel) {
        valueEl.textContent = sel.label;
        valueEl.classList.remove('combo__value--placeholder');
      } else {
        valueEl.textContent = state.placeholder;
        valueEl.classList.add('combo__value--placeholder');
      }
    }
    function renderList() {
      const rows = filtered();
      if (!rows.length) {
        list.innerHTML = `<div class="combo__empty">검색 결과가 없습니다</div>`;
        return;
      }
      list.innerHTML = rows.map((o, i) => {
        const isActive = String(o.value) === String(state.value);
        const isFocus  = i === state.focusIndex;
        return `<button class="combo__option${isActive ? ' is-active' : ''}${isFocus ? ' is-focus' : ''}" type="button" data-combo-opt="${escHTML(o.value)}">${highlight(o.label, state.query)}</button>`;
      }).join('');
    }
    function open() {
      if (state.open) return;
      state.open = true;
      root.classList.add('is-open');
      state.focusIndex = -1;
      renderList();
      // 외부 클릭 닫기
      setTimeout(() => document.addEventListener('mousedown', onOutsideClick, true), 0);
      // 검색 입력에 포커스
      setTimeout(() => { try { search.focus(); search.select(); } catch(_) {} }, 0);
    }
    function close() {
      if (!state.open) return;
      state.open = false;
      root.classList.remove('is-open');
      state.query = '';
      search.value = '';
      state.focusIndex = -1;
      document.removeEventListener('mousedown', onOutsideClick, true);
    }
    function onOutsideClick(e) {
      if (!root.contains(e.target)) close();
    }
    function selectOption(value) {
      if (String(state.value) === String(value)) {
        close();
        return;
      }
      const opt = state.options.find(o => String(o.value) === String(value));
      state.value = value;
      syncValueLabel();
      close();
      if (state.onChange) state.onChange(value, opt || null);
    }
    function moveFocus(delta) {
      const rows = filtered();
      if (!rows.length) return;
      state.focusIndex = ((state.focusIndex + delta) + rows.length) % rows.length;
      renderList();
      // 포커스 옵션이 보이도록 스크롤
      const el = list.querySelector('.combo__option.is-focus');
      if (el) el.scrollIntoView({ block: 'nearest' });
    }

    // 이벤트 바인딩
    field.addEventListener('click', () => state.open ? close() : open());
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        open();
      }
    });
    search.addEventListener('input', () => {
      state.query = search.value;
      state.focusIndex = filtered().length ? 0 : -1;
      renderList();
    });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(-1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const rows = filtered();
        const i = state.focusIndex >= 0 ? state.focusIndex : 0;
        if (rows[i]) selectOption(rows[i].value);
      }
      else if (e.key === 'Escape') { e.preventDefault(); close(); field.focus(); }
    });
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-combo-opt]');
      if (btn) selectOption(btn.dataset.comboOpt);
    });
    list.addEventListener('mouseover', (e) => {
      const btn = e.target.closest('[data-combo-opt]');
      if (!btn) return;
      const rows = filtered();
      const idx = rows.findIndex(o => String(o.value) === btn.dataset.comboOpt);
      if (idx >= 0 && idx !== state.focusIndex) {
        state.focusIndex = idx;
        renderList();
      }
    });

    // 초기 렌더
    syncValueLabel();

    return {
      getValue() { return state.value; },
      setValue(v, silent) {
        const opt = state.options.find(o => String(o.value) === String(v));
        state.value = v || '';
        syncValueLabel();
        if (!silent && state.onChange) state.onChange(state.value, opt || null);
      },
      setOptions(arr) {
        state.options = (arr || []).slice();
        // 현재 값이 새 옵션에 없으면 초기화
        if (state.value && !state.options.some(o => String(o.value) === String(state.value))) {
          state.value = '';
        }
        syncValueLabel();
        if (state.open) renderList();
      },
      open, close,
      destroy() {
        close();
        // 핸들러는 root 가 DOM 제거되면 GC 됨
      },
    };
  }

  /* ============ Org Combo (조직도 트리 드롭다운) helper ============
   * 사용:
   *   const oc = App.Components.attachOrgCombo(rootEl, {
   *     nodes: [
   *       { name: '임원실' },
   *       { name: '경영지원본부', children: [
   *         { name: '회계팀' }, { name: '인사총무팀' },
   *       ]},
   *       ...
   *     ],
   *     value: '인사총무팀',
   *     placeholder: '부서를 선택해 주세요',
   *     searchable: true,
   *     onChange(value, node) { ... },
   *   });
   *   oc.getValue() / setValue(v) / open() / close() / destroy()
   *
   * 노드 클릭(그룹·리프 모두) → 선택 + 패널 닫힘. .tree__toggle 클릭 → 그룹 펼침/접기.
   * 검색 입력 시 매칭 노드 + 모든 조상 표시, 나머지 숨김.
   *
   * rootEl: UI Kit `.org-combo` 마크업 (field/panel/search/body 포함)
   * (CSS: ui-kit.css `.org-combo`)
   * ====================================================================== */
  function attachOrgCombo(root, opts) {
    opts = opts || {};
    const state = {
      nodes: Array.isArray(opts.nodes) ? opts.nodes : [],
      value: opts.value || '',
      placeholder: opts.placeholder || '선택',
      searchable: opts.searchable !== false,
      onChange: typeof opts.onChange === 'function' ? opts.onChange : null,
      open: false,
      query: '',
    };
    const field   = root.querySelector('.org-combo__field');
    const input   = root.querySelector('[data-org-combo-input]');
    const panel   = root.querySelector('.org-combo__panel');
    const body    = root.querySelector('[data-org-combo-body]');
    const search  = root.querySelector('[data-org-combo-search]');
    if (!field || !input || !panel || !body) {
      console.warn('[attachOrgCombo] required .org-combo markup missing in root', root);
      return null;
    }
    if (input.placeholder !== state.placeholder) input.placeholder = state.placeholder;
    if (search && !state.searchable) search.closest('.org-combo__search')?.remove();

    function escHTML(s) {
      return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function renderNodes(nodes, level) {
      level = level || 0;
      if (!nodes.length) return '';
      return '<ul>' + nodes.map(n => {
        const hasChildren = Array.isArray(n.children) && n.children.length > 0;
        const isLeaf = !hasChildren;
        const selected = state.value && state.value === n.name;
        return `<li class="tree__node${hasChildren ? ' is-open' : ' is-leaf'}" data-org-node="${escHTML(n.name)}">
          <div class="tree__row${selected ? ' is-selected' : ''}" data-org-pick="${escHTML(n.name)}">
            <span class="tree__toggle" data-org-toggle>${hasChildren
              ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`
              : ''}</span>
            <span class="tree__icon">${hasChildren ? '📁' : '📄'}</span>
            <span>${escHTML(n.name)}</span>
          </div>
          ${hasChildren ? renderNodes(n.children, level + 1) : ''}
        </li>`;
      }).join('') + '</ul>';
    }

    function renderBody() {
      if (!state.nodes.length) {
        body.innerHTML = '<div class="org-combo__empty">조직 데이터가 없습니다.</div>';
        return;
      }
      body.innerHTML = `<div class="tree">${renderNodes(state.nodes, 0)}</div>`;
      applyFilter();
    }

    // 검색어 매칭: 노드명에 q 포함이면 자기 + 모든 조상 표시. 매칭 없으면 전체 표시 (기본 상태)
    function applyFilter() {
      const q = state.query.trim().toLowerCase();
      const nodeEls = body.querySelectorAll('[data-org-node]');
      if (!q) {
        nodeEls.forEach(el => el.classList.remove('is-hidden'));
        return;
      }
      // 1) 매칭된 노드 표시 + 모든 조상 표시
      const visible = new Set();
      nodeEls.forEach(el => {
        const name = el.dataset.orgNode.toLowerCase();
        if (name.includes(q)) {
          visible.add(el);
          let p = el.parentElement;
          while (p && p !== body) {
            if (p.matches('[data-org-node]')) visible.add(p);
            p = p.parentElement;
          }
        }
      });
      nodeEls.forEach(el => {
        if (visible.has(el)) {
          el.classList.remove('is-hidden');
          // 매칭된 조상은 펼친 상태로
          if (!el.classList.contains('is-leaf')) el.classList.add('is-open');
        } else {
          el.classList.add('is-hidden');
        }
      });
    }

    function syncInput() {
      input.value = state.value || '';
    }

    function open() {
      if (state.open) return;
      state.open = true;
      root.classList.add('is-open');
      renderBody();
      if (search) { search.value = ''; state.query = ''; setTimeout(() => search.focus(), 30); }
      document.addEventListener('mousedown', onDocDown, true);
      document.addEventListener('keydown', onDocKey, true);
    }
    function close() {
      if (!state.open) return;
      state.open = false;
      root.classList.remove('is-open');
      document.removeEventListener('mousedown', onDocDown, true);
      document.removeEventListener('keydown', onDocKey, true);
    }
    function onDocDown(e) { if (!root.contains(e.target)) close(); }
    function onDocKey(e)  { if (e.key === 'Escape') close(); }

    field.addEventListener('click', () => { state.open ? close() : open(); });

    if (search) {
      search.addEventListener('input', () => {
        state.query = search.value;
        applyFilter();
      });
    }

    body.addEventListener('click', (e) => {
      // 토글 화살표 클릭 — 그룹 펼침/접기
      const toggle = e.target.closest('[data-org-toggle]');
      if (toggle) {
        const node = toggle.closest('[data-org-node]');
        if (node && !node.classList.contains('is-leaf')) {
          e.stopPropagation();
          node.classList.toggle('is-open');
          return;
        }
      }
      // 노드 본문 클릭 — 선택
      const pick = e.target.closest('[data-org-pick]');
      if (pick) {
        const name = pick.dataset.orgPick;
        state.value = name;
        syncInput();
        // visual 선택 갱신
        body.querySelectorAll('.tree__row.is-selected').forEach(r => r.classList.remove('is-selected'));
        pick.classList.add('is-selected');
        // 노드 찾기 (onChange 콜백용)
        let found = null;
        (function walk(arr) { for (const n of arr) { if (n.name === name) { found = n; return; } if (n.children) walk(n.children); } })(state.nodes);
        if (state.onChange) state.onChange(state.value, found);
        close();
      }
    });

    syncInput();

    return {
      getValue() { return state.value; },
      setValue(v) {
        state.value = v || '';
        syncInput();
        if (state.open) renderBody();
      },
      open, close,
      destroy() {
        close();
      },
    };
  }

  /* ============ MultiSelect (Chips + Search Dropdown) helper ============
   * 사용:
   *   const ms = App.Components.attachMultiSelect(rootEl, {
   *     options: [{ value, title, meta?, code? }, ...],
   *     values: [],
   *     placeholder: '검색...',
   *     onChange(values, items) { ... },
   *   });
   *   ms.getValues() / setValues(arr) / setOptions(arr) / addValue(v) / removeValue(v) / destroy()
   *
   * rootEl: UI Kit `.mselect` 마크업 (field + panel) 포함된 컨테이너
   * (CSS: ui-kit.css `.mselect`)
   * ====================================================================== */
  function attachMultiSelect(root, opts) {
    opts = opts || {};
    const state = {
      options: (opts.options || []).slice(),
      values: (opts.values || []).slice(),
      placeholder: opts.placeholder || '검색...',
      onChange: typeof opts.onChange === 'function' ? opts.onChange : null,
      open: false,
      query: '',
      focusIndex: -1,
    };

    const field  = root.querySelector('.mselect__field');
    const search = root.querySelector('.mselect__search');
    const panel  = root.querySelector('.mselect__panel');
    const list   = root.querySelector('.mselect__list');
    if (!field || !search || !panel || !list) {
      console.warn('[attachMultiSelect] required .mselect markup missing in root', root);
      return null;
    }
    search.placeholder = state.placeholder;

    function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function highlight(text, q) {
      if (!q) return esc(text);
      const idx = String(text).toLowerCase().indexOf(q.toLowerCase());
      if (idx < 0) return esc(text);
      return esc(text.slice(0, idx))
        + '<mark>' + esc(text.slice(idx, idx + q.length)) + '</mark>'
        + esc(text.slice(idx + q.length));
    }
    function matches(opt, q) {
      if (!q) return true;
      const k = q.toLowerCase();
      return String(opt.title || '').toLowerCase().includes(k)
          || String(opt.meta || '').toLowerCase().includes(k)
          || String(opt.code || '').toLowerCase().includes(k)
          || String(opt.value || '').toLowerCase().includes(k);
    }
    function selectedSet() { return new Set(state.values.map(String)); }
    function filtered() {
      const q = state.query.trim();
      return state.options.filter(o => matches(o, q));
    }
    function getOption(value) {
      return state.options.find(o => String(o.value) === String(value)) || null;
    }

    function renderChips() {
      // 기존 칩 제거 (input 만 남김)
      Array.from(field.querySelectorAll('.mselect__chip')).forEach(el => el.remove());
      const sel = selectedSet();
      const chipsHTML = state.values.map(v => {
        const opt = getOption(v);
        if (!opt) return '';
        return `<span class="mselect__chip" data-mselect-chip="${esc(opt.value)}">
          <span><strong>${esc(opt.title)}</strong>${opt.meta ? `<em>${esc(opt.meta)}</em>` : ''}</span>
          <button class="mselect__chip-remove" type="button" data-mselect-remove="${esc(opt.value)}" aria-label="제거">✕</button>
        </span>`;
      }).join('');
      // 칩을 search 앞에 삽입
      search.insertAdjacentHTML('beforebegin', chipsHTML);
    }

    function renderList() {
      const rows = filtered();
      const sel = selectedSet();
      if (!rows.length) {
        list.innerHTML = `<div class="mselect__empty">검색 결과가 없습니다</div>`;
        return;
      }
      list.innerHTML = rows.map((o, i) => {
        const isSelected = sel.has(String(o.value));
        const isFocus = i === state.focusIndex;
        const mainHTML = `<strong>${highlight(o.title || '', state.query)}</strong>${o.meta ? `<span>${highlight(o.meta, state.query)}</span>` : ''}`;
        const codeHTML = o.code ? `<span class="mselect__option-code">${highlight(o.code, state.query)}</span>` : '';
        return `<button class="mselect__option${isSelected ? ' is-selected' : ''}${isFocus ? ' is-focus' : ''}" type="button" data-mselect-opt="${esc(o.value)}" ${isSelected ? 'aria-disabled="true"' : ''}>
          <span class="mselect__option-main">${mainHTML}</span>
          ${codeHTML}
        </button>`;
      }).join('');
    }
    function refresh() { renderChips(); renderList(); }

    function open() {
      if (state.open) return;
      state.open = true;
      root.classList.add('is-open');
      state.focusIndex = -1;
      renderList();
      setTimeout(() => document.addEventListener('mousedown', onOutside, true), 0);
    }
    function close() {
      if (!state.open) return;
      state.open = false;
      root.classList.remove('is-open');
      state.query = '';
      search.value = '';
      state.focusIndex = -1;
      document.removeEventListener('mousedown', onOutside, true);
    }
    function onOutside(e) { if (!root.contains(e.target)) close(); }

    function addValue(v) {
      const opt = getOption(v);
      if (!opt) return;
      if (selectedSet().has(String(v))) return;
      state.values.push(opt.value);
      refresh();
      // 옵션이 선택되어도 패널은 열린 상태 유지 (연속 선택 가능)
      search.focus();
      if (state.onChange) state.onChange(state.values.slice(), state.values.map(getOption).filter(Boolean));
    }
    function removeValue(v) {
      const before = state.values.length;
      state.values = state.values.filter(x => String(x) !== String(v));
      if (state.values.length === before) return;
      refresh();
      if (state.onChange) state.onChange(state.values.slice(), state.values.map(getOption).filter(Boolean));
    }
    function moveFocus(delta) {
      const rows = filtered();
      if (!rows.length) return;
      // is-selected 항목은 건너뛰기
      const sel = selectedSet();
      let i = state.focusIndex;
      for (let n = 0; n < rows.length; n++) {
        i = ((i + delta) + rows.length) % rows.length;
        if (!sel.has(String(rows[i].value))) break;
      }
      state.focusIndex = i;
      renderList();
      const el = list.querySelector('.mselect__option.is-focus');
      if (el) el.scrollIntoView({ block: 'nearest' });
    }

    // 이벤트 바인딩
    field.addEventListener('click', (e) => {
      // 칩 제거 버튼은 별도 처리
      if (e.target.closest('[data-mselect-remove]')) return;
      if (!state.open) open();
      search.focus();
    });
    field.addEventListener('mousedown', (e) => {
      // 입력 외 영역 클릭 시 포커스가 search 로 가도록
      if (e.target !== search && !e.target.closest('.mselect__chip-remove')) {
        // preventDefault 안 함 — 클릭 흐름 유지
      }
    });
    field.addEventListener('click', (e) => {
      const rm = e.target.closest('[data-mselect-remove]');
      if (rm) { e.preventDefault(); e.stopPropagation(); removeValue(rm.dataset.mselectRemove); }
    });
    search.addEventListener('focus', open);
    search.addEventListener('input', () => {
      state.query = search.value;
      const rows = filtered();
      const sel = selectedSet();
      // 첫 비선택 항목으로 포커스
      state.focusIndex = rows.findIndex(r => !sel.has(String(r.value)));
      renderList();
    });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(-1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const rows = filtered();
        const i = state.focusIndex >= 0 ? state.focusIndex : 0;
        if (rows[i] && !selectedSet().has(String(rows[i].value))) addValue(rows[i].value);
      }
      else if (e.key === 'Escape') { e.preventDefault(); close(); field.focus(); }
      else if (e.key === 'Backspace' && search.value === '' && state.values.length > 0) {
        e.preventDefault();
        removeValue(state.values[state.values.length - 1]);
      }
    });
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-mselect-opt]');
      if (!btn) return;
      const v = btn.dataset.mselectOpt;
      if (selectedSet().has(String(v))) return; // 이미 선택됨 — 무시
      addValue(v);
    });
    list.addEventListener('mouseover', (e) => {
      const btn = e.target.closest('[data-mselect-opt]');
      if (!btn) return;
      const rows = filtered();
      const idx = rows.findIndex(o => String(o.value) === btn.dataset.mselectOpt);
      if (idx >= 0 && idx !== state.focusIndex) {
        state.focusIndex = idx;
        renderList();
      }
    });

    // 초기 렌더
    refresh();

    return {
      getValues() { return state.values.slice(); },
      setValues(arr, silent) {
        state.values = (arr || []).slice();
        refresh();
        if (!silent && state.onChange) state.onChange(state.values.slice(), state.values.map(getOption).filter(Boolean));
      },
      setOptions(arr) {
        state.options = (arr || []).slice();
        // 새 옵션에 없는 selected 값은 제거
        const valid = new Set(state.options.map(o => String(o.value)));
        state.values = state.values.filter(v => valid.has(String(v)));
        refresh();
      },
      addValue, removeValue,
      open, close,
      destroy() { close(); /* DOM 제거 시 GC */ },
    };
  }

  /* =========================================================
   * imagePickerGrid — 다중 이미지 업로드 그리드 HTML 빌더 (상태 기반)
   *   UI Kit: .image-picker-grid (ui-kit.html#image-picker-grid)
   *
   *   opts.images : [{ url, name }]   현재 등록된 이미지 배열
   *   opts.max    : 최대 장수 (기본 10)
   *   opts.hook   : data-{hook}-* 네임스페이스 (기본 'img')
   *                 → data-{hook}-grid / -thumb="i" / -remove="i" / -add / -input
   *
   *   썸네일 클릭 → App.openImageLightbox 로 확대, ✕ → 개별 삭제.
   *   호출 측에서 change(input)·click(remove/thumb) 이벤트를 위임 처리하고
   *   상태 갱신 후 폼을 재렌더한다.
   * ========================================================= */
  function imagePickerGrid(opts) {
    opts = opts || {};
    const imgs = Array.isArray(opts.images) ? opts.images : [];
    const max  = opts.max || 10;
    const hook = opts.hook || 'img';
    const full = imgs.length >= max;
    const items = imgs.map((im, i) =>
      '<div class="image-picker-grid__item" data-' + hook + '-thumb="' + i + '" title="클릭하여 확대">' +
        '<img class="image-picker-grid__img" src="' + escapeHTML(im.url || '') + '" alt="' + escapeHTML(im.name || '') + '">' +
        '<button class="image-picker-grid__remove" type="button" data-' + hook + '-remove="' + i + '" aria-label="이미지 삭제">✕</button>' +
      '</div>').join('');
    const addTile = full ? '' :
      '<label class="image-picker-grid__add" data-' + hook + '-add>' +
        '<span class="image-picker-grid__add-plus">+</span>' +
        '<span class="image-picker-grid__add-text">사진 추가</span>' +
        '<input type="file" class="image-picker-grid__input" accept="image/*" multiple data-' + hook + '-input>' +
      '</label>';
    return '<div class="image-picker-grid' + (full ? ' is-full' : '') + '" data-' + hook + '-grid>' + items + addTile + '</div>';
  }

  App.Components = {
    html, raw, escapeHTML,
    searchPanel, toolbar, gridPage,
    kpiCard, card, statusPill, dashboardPage,
    imagePickerGrid,
    mount,
    initMultiSelect, refreshMultiSelect,
    attachCombo,
    attachOrgCombo,
    attachMultiSelect,
  };

  /* =========================================================
   * App.Forms — 인라인 필드 검증 헬퍼 (도메인 표준)
   *
   * 입력 필드 검증 메시지는 항상 항목 하단에 인라인으로 표시한다.
   * 토스트는 등록/처리 완료 같은 액션 결과 알림 용도로만 사용.
   *
   *   App.Forms.setFieldError(inputEl, '메시지')   — is-invalid + .field-error 표시
   *   App.Forms.clearFieldError(inputEl)            — 메시지 제거 + 클래스 해제
   *   App.Forms.clearAll(rootEl)                    — root 하위 모든 필드 검증 상태 초기화
   *   App.Forms.applyOnInput(rootEl)                — 입력 변경 시 자동 clear (위임)
   *
   * 검증 타깃 — 일반 input / select / textarea 외에도 .combo / .multi-select / .input-pw 호환.
   * 메시지 DOM — 입력 바로 다음 형제 노드로 .field-error 를 삽입/갱신한다.
   *              aria-invalid="true" 와 aria-describedby 도 함께 설정 (스크린리더 호환).
   * ========================================================= */
  function _validationHost(el) {
    if (!el) return null;
    // combo / multi-select / input-pw 는 래퍼에 is-invalid 를 붙여야 시각이 잡힘
    return el.closest('.combo, .multi-select, .input-pw') || el;
  }
  function _ensureId(el) {
    if (!el.id) el.id = 'fld-' + Math.random().toString(36).slice(2, 9);
    return el.id;
  }
  function setFieldError(inputEl, message) {
    if (!inputEl) return;
    const host = _validationHost(inputEl);
    host.classList.add('is-invalid');
    inputEl.setAttribute('aria-invalid', 'true');
    // 메시지 노드 — host 의 바로 다음 형제 .field-error 를 찾거나 생성
    let msg = host.nextElementSibling;
    if (!msg || !msg.classList || !msg.classList.contains('field-error')) {
      msg = document.createElement('div');
      msg.className = 'field-error';
      host.parentNode.insertBefore(msg, host.nextSibling);
    }
    msg.id = msg.id || (_ensureId(inputEl) + '-err');
    msg.textContent = message || '';
    msg.hidden = false;
    inputEl.setAttribute('aria-describedby', msg.id);
  }
  function clearFieldError(inputEl) {
    if (!inputEl) return;
    const host = _validationHost(inputEl);
    host.classList.remove('is-invalid');
    inputEl.removeAttribute('aria-invalid');
    const msg = host.nextElementSibling;
    if (msg && msg.classList && msg.classList.contains('field-error')) {
      msg.textContent = '';
      msg.hidden = true;
    }
    inputEl.removeAttribute('aria-describedby');
  }
  function clearAllFieldErrors(rootEl) {
    const root = rootEl || document;
    root.querySelectorAll('.is-invalid').forEach(h => h.classList.remove('is-invalid'));
    root.querySelectorAll('[aria-invalid="true"]').forEach(i => {
      i.removeAttribute('aria-invalid');
      i.removeAttribute('aria-describedby');
    });
    root.querySelectorAll('.field-error').forEach(m => { m.textContent = ''; m.hidden = true; });
    root.querySelectorAll('.field-success').forEach(m => { m.textContent = ''; m.hidden = true; });
  }
  // 성공 메시지 — .field-error 와 동일 위치(host 다음 형제) 에 .field-success 노드 삽입.
  //   동시에 .field-error 는 클리어 (한 필드는 error 또는 success 중 하나만 표시).
  function setFieldSuccess(inputEl, message) {
    if (!inputEl) return;
    clearFieldError(inputEl);
    const host = _validationHost(inputEl);
    // 메시지 노드 탐색 — host 의 다음 형제에서 .field-success 우선 / 없으면 다음 .field-error 자리 다음
    let cursor = host.nextElementSibling;
    // .field-error 가 있다면 그 뒤로 넘기기 (clearFieldError 가 hidden 처리만 함)
    if (cursor && cursor.classList && cursor.classList.contains('field-error')) {
      cursor = cursor.nextElementSibling;
    }
    let msg = cursor && cursor.classList && cursor.classList.contains('field-success') ? cursor : null;
    if (!msg) {
      msg = document.createElement('div');
      msg.className = 'field-success';
      // .field-error 뒤 (있을 때) 또는 host 다음 위치에 삽입
      const errSib = host.nextElementSibling;
      const anchor = (errSib && errSib.classList && errSib.classList.contains('field-error')) ? errSib.nextSibling : host.nextSibling;
      host.parentNode.insertBefore(msg, anchor);
    }
    msg.textContent = message || '';
    msg.hidden = false;
  }
  function clearFieldSuccess(inputEl) {
    if (!inputEl) return;
    const host = _validationHost(inputEl);
    let cursor = host.nextElementSibling;
    while (cursor) {
      if (cursor.classList && cursor.classList.contains('field-success')) {
        cursor.textContent = ''; cursor.hidden = true;
        return;
      }
      // .field-error 는 건너뛰기
      if (cursor.classList && cursor.classList.contains('field-error')) {
        cursor = cursor.nextElementSibling;
        continue;
      }
      break;
    }
  }
  function applyOnInput(rootEl) {
    if (!rootEl || rootEl.__fieldErrorWired) return;
    rootEl.__fieldErrorWired = true;
    const handler = (e) => {
      const t = e.target;
      if (!t) return;
      if (t.matches && t.matches('input, select, textarea')) {
        clearFieldError(t);
        clearFieldSuccess(t);
      }
    };
    rootEl.addEventListener('input', handler);
    rootEl.addEventListener('change', handler);
  }
  /* =========================================================
   * 천단위 구분 입력 (도메인 표준)
   *
   * 금액·수량 입력 필드는  type="text" inputmode="numeric" data-thousands  로 표기한다.
   * 전역 input 위임 리스너가 사용자 입력 시 정수부에 콤마를 자동 삽입한다(캐럿 위치 보존).
   * 개별 화면에서 별도 배선은 불필요 — 마크업에 data-thousands 만 붙이면 동작한다.
   *
   *   data-thousands        → 정수 (예: 금액·단가·수량·재고)        예) 1,200,000
   *   data-thousands="dec"  → 소수 허용 (정수부만 콤마, 소수부 그대로) 예) 1,234.56
   *
   * 값 읽기   : App.Forms.parseNum(el | '1,200,000')  →  Number (콤마 제거, NaN→0)
   * 값 주입후 : App.Forms.applyThousands(root)         →  root 하위 data-thousands 입력 표시 갱신
   *            (el.value = String(n) 처럼 프로그래밍 방식으로 값을 넣은 뒤 호출)
   * ========================================================= */
  function parseNum(v) {
    if (v && v.nodeType === 1) v = v.value;                  // input 엘리먼트 전달 허용
    const n = parseFloat(String(v == null ? '' : v).replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  }
  function _fmtThousands(raw, allowDec) {
    let s = String(raw == null ? '' : raw);
    const neg = /^\s*-/.test(s);
    s = s.replace(allowDec ? /[^\d.]/g : /[^\d]/g, '');
    if (allowDec) {                                          // 소수점 1개만 허용
      const i = s.indexOf('.');
      if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '');
    }
    if (s === '' || s === '.') return s;                     // 빈/소수점만 → 그대로 (입력 중)
    let int = s, dec = null;
    if (allowDec && s.indexOf('.') !== -1) { const p = s.split('.'); int = p[0]; dec = p[1]; }
    int = int.replace(/^0+(?=\d)/, '');                      // 선두 0 제거 (단 단일 0 은 유지)
    let out = (int === '' ? '0' : int).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (dec !== null) out += '.' + dec;
    return (neg ? '-' : '') + out;
  }
  function formatField(el) {
    if (!el || !el.matches || !el.matches('input[data-thousands]')) return;
    el.value = _fmtThousands(el.value, el.dataset.thousands === 'dec');
  }
  function applyThousands(root) {
    (root || document).querySelectorAll('input[data-thousands]').forEach(formatField);
  }
  let _thousandsWired = false;
  function _wireThousands() {
    if (_thousandsWired) return;
    _thousandsWired = true;
    // 전역 위임 — 동적으로 렌더되는 모든 data-thousands 입력에 자동 적용
    document.addEventListener('input', function (e) {
      const el = e.target;
      if (!el || !el.matches || !el.matches('input[data-thousands]')) return;
      const before = el.value;
      const formatted = _fmtThousands(before, el.dataset.thousands === 'dec');
      if (formatted === before) return;
      // 캐럿 위치 보존 — 캐럿 앞의 '숫자 개수' 기준으로 재계산
      const caret = el.selectionStart == null ? before.length : el.selectionStart;
      const digitsBeforeCaret = before.slice(0, caret).replace(/[^\d]/g, '').length;
      el.value = formatted;
      let pos = 0, seen = 0;
      while (pos < formatted.length && seen < digitsBeforeCaret) {
        if (/\d/.test(formatted[pos])) seen++;
        pos++;
      }
      try { el.setSelectionRange(pos, pos); } catch (_) {}
    });
    // 동적 렌더 자동 포맷 — DOM 에 새로 삽입되는 data-thousands 입력의 prefill 값에 콤마 적용.
    //   화면 init/render(innerHTML)로 value 가 주입된 경우 input 이벤트가 없으므로 표시가 안 되던 문제를 해결.
    //   포커스 중인 필드는 건드리지 않음(입력 방해 방지). value 변경은 childList 변동이 아니라 재진입 없음.
    if (typeof MutationObserver === 'function') {
      const _fmtIdle = (el) => {
        if (!el || el === document.activeElement) return;
        if (el.value === '' || el.value == null) return;
        formatField(el);
      };
      new MutationObserver((muts) => {
        for (const mu of muts) {
          for (const node of mu.addedNodes) {
            if (!node || node.nodeType !== 1) continue;
            if (node.matches && node.matches('input[data-thousands]')) _fmtIdle(node);
            if (node.querySelectorAll) node.querySelectorAll('input[data-thousands]').forEach(_fmtIdle);
          }
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    }
  }
  _wireThousands();

  App.Forms = {
    setFieldError, clearFieldError, setFieldSuccess, clearFieldSuccess,
    clearAll: clearAllFieldErrors, applyOnInput,
    parseNum, formatField, applyThousands,
  };
})();

/* =========================================================
 * App.YmPicker — 연/월 선택 팝오버 (재사용 공유 컴포넌트)
 *
 *   달력/근태/연차 등 월 단위로 조회하는 화면의 "YY/MM ∨" 타이틀에 부착.
 *   ‹ › 로 연 이동, 월 그리드 클릭으로 원하는 달로 즉시 점프한다.
 *   (기존 ‹ 오늘 › 한칸 이동 화살표와 병행 — 화면마다 그대로 유지)
 *
 *   ── 사용법 ────────────────────────────────────────────
 *   // 1) 타이틀 자리에 마크업 삽입
 *   html`${App.YmPicker.html({ name: 'status', ym: STATE.ym, todayYm: A.TODAY.slice(0,7) })}`
 *
 *   // 2) 페이지 컨테이너에서 변경 이벤트 수신 (한 번만 바인딩)
 *   pageEl.addEventListener('ympick:change', (e) => {
 *     if (e.detail.name === 'status') { STATE.ym = e.detail.ym; renderAll(pageEl); }
 *   });
 *
 *   opts:
 *     ym         — 현재 선택된 'YYYY-MM' (필수)
 *     name       — 같은 페이지 내 여러 피커 구분용 키 (이벤트 detail.name 으로 전달)
 *     todayYm    — 오늘 강조용 'YYYY-MM' (선택, 없으면 강조 없음)
 *     labelClass — 라벨 span 클래스 (기본 'att-tb__title')
 *     labelStyle — 라벨 span inline style (선택, 예: 'font-size:var(--fs-lg);')
 *
 *   전역 컨트롤러(문서 클릭 위임)는 로드시 1회 설치되어 토글/연이동/바깥클릭을
 *   스스로 처리하고, 월 선택 시 래퍼에서 'ympick:change' (bubbles) 를 디스패치한다.
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});
  function pad2(n) { return String(n).padStart(2, '0'); }

  /* 팝오버 패널 내부(연 헤더 + 월 그리드) — 연 이동 시에도 재사용 */
  function panelInner(viewYear, selectedYm, todayYm) {
    const sel = String(selectedYm || '');
    const selY = parseInt(sel.slice(0, 4), 10), selM = parseInt(sel.slice(5, 7), 10);
    let cells = '';
    for (let m = 1; m <= 12; m++) {
      const ym = viewYear + '-' + pad2(m);
      const cls = [];
      if (viewYear === selY && m === selM) cls.push('is-active');
      if (ym === todayYm) cls.push('is-today');
      cells += '<button type="button" class="ym-picker__month ' + cls.join(' ') + '" data-ympick-pick="' + ym + '">' + m + '월</button>';
    }
    return '<div class="ym-picker__head">'
      + '<button type="button" class="ym-picker__nav" data-ympick-year="-1" aria-label="이전 해">‹</button>'
      + '<span class="ym-picker__year">' + viewYear + '</span>'
      + '<button type="button" class="ym-picker__nav" data-ympick-year="1" aria-label="다음 해">›</button>'
      + '</div><div class="ym-picker__grid">' + cells + '</div>';
  }

  function html(opts) {
    opts = opts || {};
    const ym = String(opts.ym || '');
    const todayYm = opts.todayYm || '';
    const name = opts.name || '';
    const labelClass = opts.labelClass || 'att-tb__title';
    const labelStyle = opts.labelStyle ? (' style="' + opts.labelStyle + '"') : '';
    const label = opts.label != null ? opts.label : (ym.slice(2, 4) + '/' + ym.slice(5, 7));
    const chev = (window.Icons && window.Icons.chev) || '▾';
    const viewYear = parseInt(ym.slice(0, 4), 10);
    return '<div class="ym-picker" data-ympick data-ympick-name="' + name + '" data-ym="' + ym + '" data-today="' + todayYm + '">'
      + '<button type="button" class="ym-picker__trigger" data-ympick-toggle aria-label="연/월 선택">'
      + '<span class="' + labelClass + '"' + labelStyle + '>' + label + '</span>'
      + '<span class="ym-picker__caret">' + chev + '</span>'
      + '</button>'
      + '<div class="ym-picker__panel">' + panelInner(viewYear, ym, todayYm) + '</div>'
      + '</div>';
  }

  function closeAll(except) {
    document.querySelectorAll('.ym-picker.is-open').forEach(o => { if (o !== except) o.classList.remove('is-open'); });
  }

  function install() {
    if (install._done) return; install._done = true;
    document.addEventListener('click', function (e) {
      const toggle = e.target.closest('[data-ympick-toggle]');
      if (toggle) {
        const w = toggle.closest('[data-ympick]');
        const opening = !w.classList.contains('is-open');
        closeAll(w);
        w.classList.toggle('is-open');
        if (opening) {
          w.querySelector('.ym-picker__panel').innerHTML =
            panelInner(parseInt(String(w.dataset.ym).slice(0, 4), 10), w.dataset.ym, w.dataset.today || '');
        }
        return;
      }
      const yb = e.target.closest('[data-ympick-year]');
      if (yb) {
        const w = yb.closest('[data-ympick]');
        const p = w.querySelector('.ym-picker__panel');
        const curY = parseInt(p.querySelector('.ym-picker__year').textContent, 10);
        p.innerHTML = panelInner(curY + Number(yb.dataset.ympickYear), w.dataset.ym, w.dataset.today || '');
        return;
      }
      const pk = e.target.closest('[data-ympick-pick]');
      if (pk) {
        const w = pk.closest('[data-ympick]');
        const ym = pk.dataset.ympickPick;
        w.dataset.ym = ym;
        w.classList.remove('is-open');
        w.dispatchEvent(new CustomEvent('ympick:change', {
          bubbles: true, detail: { name: w.dataset.ympickName || '', ym: ym },
        }));
        return;
      }
      /* 바깥 클릭 — 클릭 지점을 포함하지 않는 열린 피커만 닫기 */
      document.querySelectorAll('.ym-picker.is-open').forEach(o => {
        if (!o.contains(e.target)) o.classList.remove('is-open');
      });
    });
  }
  install();

  App.YmPicker = { html: html, panelInner: panelInner, install: install };
})();
