/* =========================================================
 * Page: 업무보고 관리 > 업무보고 설정
 *
 *   기존 「근태 설정」 화면의 [업무보고 양식] 탭을 독립 메뉴/페이지로 분리.
 *   부서별 업무 분류(양식) 를 관리한다. — 「나의 업무보고」 작성 화면과
 *   「부서별 업무보고 현황」 의 행(섹션)이 본 양식을 참조한다.
 *
 *   ※ 데이터 단일 소스 — App.WorkReport (page-att-report-my.js 에서 정의).
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function section(title, body, opts) {
    opts = opts || {};
    return `
      <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:20px 24px 22px;margin-bottom:16px;">
        <header style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--color-divider);">
          <h3 style="font-size:var(--fs-lg);font-weight:var(--fw-semibold);color:var(--color-text);">${esc(title)}</h3>
          ${opts.sub ? `<small style="color:var(--color-text-muted);font-size:var(--fs-sm);">${esc(opts.sub)}</small>` : ''}
          ${opts.right || ''}
        </header>
        ${body}
      </section>`;
  }
  function fieldRow(label, inner, help) {
    return `
      <div class="fm-tbl__row fm-tbl__row--2" style="grid-template-columns:160px 1fr;">
        <div class="fm-tbl__label">${esc(label)}</div>
        <div class="fm-tbl__value" style="flex-direction:column;align-items:flex-start;gap:6px;">
          <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;">${inner}</div>
          ${help ? `<div class="form-help" style="white-space:normal;word-break:keep-all;line-height:1.5;">${esc(help)}</div>` : ''}
        </div>
      </div>`;
  }

  function deptList() {
    const emps = (App.AttStatus && App.AttStatus.EMP_LIST) ? App.AttStatus.EMP_LIST : [];
    return Array.from(new Set(emps.map(e => e.dept).filter(Boolean)));
  }

  function renderBody() {
    const WRR = App.WorkReport;
    const def = (WRR && WRR.defaultCategories) ? WRR.defaultCategories() : ['기본업무', '실천업무', '건의사항', '외근업무'];
    const forms = (WRR && WRR.forms) ? WRR.forms() : [];
    const configured = new Set(forms.map(f => f.dept));
    const addable = deptList().filter(d => !configured.has(d));

    const rows = forms.length ? forms.map(f => `
      <tr>
        <td style="white-space:nowrap;font-weight:var(--fw-medium);">${esc(f.dept)}</td>
        <td><input class="input" type="text" data-wrform-dept="${esc(f.dept)}" value="${esc(f.categories.join(', '))}" style="width:100%;"></td>
        <td style="text-align:center;"><button class="btn btn--xs" type="button" data-wrform-remove="${esc(f.dept)}">삭제</button></td>
      </tr>`).join('')
      : `<tr><td colspan="3" style="text-align:center;color:var(--color-text-muted);padding:20px 0;">부서별 양식이 없습니다. 모든 부서가 기본 항목을 사용합니다.</td></tr>`;

    const body = `
      <div class="fm-tbl fm-tbl--form" style="margin-bottom:18px;">
        ${fieldRow('기본 항목', `<input class="input" type="text" data-wrform-default value="${esc(def.join(', '))}" style="width:100%;max-width:520px;">`, '주간 업무 보고에 공통으로 표시되는 항목(섹션)입니다. 쉼표로 구분하며 최대 5개까지 입력할 수 있습니다. — 부서별 양식이 없으면 이 기본 항목이 「나의 업무보고」 작성 화면과 「부서별 업무보고 현황」의 행으로 표시됩니다.')}
      </div>
      <div style="font-weight:var(--fw-semibold);font-size:var(--fs-sm);color:var(--color-text-sub);margin:0 0 8px;">부서별 양식</div>
      <table class="tbl tbl--bordered">
        <thead><tr><th style="width:160px;">부서</th><th>보고 항목 (쉼표로 구분, 최대 5개)</th><th style="width:64px;text-align:center;">삭제</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="display:flex;align-items:center;gap:8px;margin-top:12px;">
        <select class="select select--sm" data-wrform-add-dept ${addable.length ? '' : 'disabled'} style="max-width:200px;">
          ${addable.length ? addable.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join('') : '<option>추가할 부서 없음</option>'}
        </select>
        <button class="btn btn--sm" type="button" data-wrform-add ${addable.length ? '' : 'disabled'}>${(window.Icons && window.Icons.plus) || '+'} 부서 양식 추가</button>
      </div>
      <div style="text-align:right;margin-top:16px;padding-top:14px;border-top:1px solid var(--color-divider);"><button class="btn btn--primary btn--sm" type="button" data-wrform-save>저장</button></div>
    `;
    return section('업무보고 양식', body, { sub: `기본 ${def.length}항목 · 부서별 ${forms.length}개` });
  }

  function renderShell(pageEl) {
    pageEl.innerHTML = `<div class="att-page__body" data-wrs-body style="flex:1;min-height:0;overflow:auto;"></div>`;
  }
  function renderAll(pageEl) {
    const box = pageEl.querySelector('[data-wrs-body]');
    if (box) box.innerHTML = renderBody();
  }

  function bind(pageEl) {
    if (pageEl.dataset.wrsBound === '1') return;
    pageEl.dataset.wrsBound = '1';
    pageEl.addEventListener('click', e => {
      /* 부서 양식 추가 */
      const addBtn = e.target.closest('[data-wrform-add]');
      if (addBtn) {
        const sel = pageEl.querySelector('[data-wrform-add-dept]');
        const dept = sel && sel.value;
        if (dept && App.WorkReport && App.WorkReport.setCategories) {
          App.WorkReport.setCategories(dept, App.WorkReport.defaultCategories());
          renderAll(pageEl);
        }
        return;
      }
      /* 부서 양식 삭제 */
      const rmBtn = e.target.closest('[data-wrform-remove]');
      if (rmBtn) {
        if (App.WorkReport && App.WorkReport.removeForm) App.WorkReport.removeForm(rmBtn.dataset.wrformRemove);
        renderAll(pageEl);
        return;
      }
      /* 저장 — 쉼표 구분 항목은 최대 5개. 초과 시 인라인 필드 에러(토스트 금지) */
      if (e.target.closest('[data-wrform-save]')) {
        const WRR = App.WorkReport;
        const MAX = 5;
        const parse = v => (v || '').split(',').map(s => s.trim()).filter(Boolean);
        if (App.Forms && App.Forms.clearAll) App.Forms.clearAll(pageEl);
        let ok = true;
        const defInp = pageEl.querySelector('[data-wrform-default]');
        const defCats = defInp ? parse(defInp.value) : [];
        if (defInp && defCats.length > MAX) {
          App.Forms && App.Forms.setFieldError(defInp, `항목은 최대 ${MAX}개까지 입력할 수 있습니다. (현재 ${defCats.length}개)`);
          ok = false;
        }
        const deptInps = Array.from(pageEl.querySelectorAll('[data-wrform-dept]')).map(inp => ({ inp, cats: parse(inp.value) }));
        deptInps.forEach(({ inp, cats }) => {
          if (cats.length > MAX) {
            App.Forms && App.Forms.setFieldError(inp, `항목은 최대 ${MAX}개까지 입력할 수 있습니다. (현재 ${cats.length}개)`);
            ok = false;
          }
        });
        if (!ok) return;   /* 인라인 에러만 — 저장/토스트 금지 */
        if (WRR) {
          if (defInp && WRR.setDefaultCategories) WRR.setDefaultCategories(defCats);
          deptInps.forEach(({ inp, cats }) => { if (cats.length && WRR.setCategories) WRR.setCategories(inp.dataset.wrformDept, cats); });
        }
        window.toast && window.toast('업무보고 양식이 저장되었습니다.', 'success');
        return;
      }
    });
    /* 입력 변경 시 해당 필드 검증 에러 자동 해제 */
    if (App.Forms && App.Forms.applyOnInput) App.Forms.applyOnInput(pageEl);
  }

  function initPage() {
    const pageEl = document.getElementById('page-att-wr-settings');
    if (!pageEl) return;
    pageEl.__onShow = () => {
      if (!pageEl.dataset.wrsShellMounted) {
        pageEl.dataset.wrsShellMounted = '1';
        renderShell(pageEl);
        bind(pageEl);
      }
      renderAll(pageEl);
    };
  }
  const prev = App.initPages;
  App.initPages = function () {
    if (typeof prev === 'function') prev();
    initPage();
  };
})();
