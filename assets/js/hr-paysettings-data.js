/* =========================================================
 * Data module: 급여 기준 (App.HRPaySettings) — 구 page-hr-pay-settings
 *   ※ 「급여 기준 설정」 화면은 제거됨. App.HRPaySettings(가산배율 조회 +
 *      openOtModal 시간외수당 모달)를 급여 정산 화면이 호출한다.
 *      (구 좌우 split 패널 렌더 코드는 남아 있으나 마운트되지 않아 inert.)
 * -----------------------------------------------------------
 * (원본 헤더) Page: HR > 급여 관리 > 급여 관련 설정
 *
 *  시간외수당 가산배율과 기본 지급일 등 급여 정산에 적용되는
 *  계산 기준 마스터를 관리하는 설정 화면.
 *
 *  메인 화면
 *   · 설정 카드 2장
 *     - 시간외수당 계산식 설정 (연장·야간·휴일 가산배율 7종)
 *     - 기본 지급일 설정 (매월 N일 / 주말·공휴일 처리 규칙)
 *
 *  시간외수당 모달
 *   · 7개 계산 기준 표
 *   · 현재 가산배율(input) → 총 지급배율(readonly, 1 + 가산배율) + 계산식 즉시 갱신
 *   · 법정 최소 미만 시 인라인 경고
 *
 *  기본 지급일 모달
 *   · 매월 N일 / 마지막 영업일
 *   · 주말·공휴일 처리 (전 영업일 / 익 영업일 / 그대로)
 *
 *  UI Kit 재사용
 *   .card / .modal / .tbl / .fm-tbl / .input / .select / .switch / .pill
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  /* ============ 환경 ============ */
  const TODAY   = '2026-05-17';
  const HR_NAME = '정혜진';

  /* ============ 시간외수당 계산 기준 마스터 ============
   * 근로기준법 §56 가산임금 규정 기준. 법정 최소 가산배율을 보유하고,
   * 회사는 그 이상으로 자유롭게 올릴 수 있다. 총 지급배율 = 1 + 가산배율.
   *
   * 각 row 의 hoursVar 는 계산식 표시용 변수명. saved 는 회사가 설정한 현재값. */
  const OT_RATE_DEFS = [
    { key: 'overtime',         name: '연장근로수당',         condition: '법정근로시간 초과 근로',     legalMin: 0.5, hoursVar: '연장근로시간' },
    { key: 'night',            name: '야간근로수당',         condition: '22:00~06:00 근로',           legalMin: 0.5, hoursVar: '야간근로시간' },
    { key: 'nightOvertime',    name: '야간연장근로수당',     condition: '연장근로 + 야간근로 중복',   legalMin: 1.0, hoursVar: '야간연장근로시간' },
    { key: 'holiday',          name: '휴일근로수당',         condition: '휴일근로 8시간 이내',        legalMin: 0.5, hoursVar: '휴일근로시간' },
    { key: 'holidayOvertime',  name: '휴일연장근로수당',     condition: '휴일근로 8시간 초과분',      legalMin: 1.0, hoursVar: '휴일 8시간 초과근로시간' },
    { key: 'holidayNight',     name: '휴일야간근로수당',     condition: '휴일 8시간 이내 + 야간근로', legalMin: 1.0, hoursVar: '휴일야간근로시간' },
    { key: 'holidayNightOt',   name: '휴일야간연장근로수당', condition: '휴일 8시간 초과 + 야간근로', legalMin: 1.5, hoursVar: '휴일야간연장근로시간' },
  ];


  /* ============ Helper ============ */
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
  function fmtRate(n) {
    n = Number(n);
    if (!isFinite(n)) return '-';
    /* 0.5 / 1.5 / 2.0 처럼 1자리 소수 — 0.05 단위까지 허용해 0.55 등도 표시 */
    return Math.abs(n - Math.round(n * 10) / 10) < 1e-9 ? n.toFixed(1) : n.toFixed(2);
  }
  function openModalEl(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeModalEl(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('is-open');
    if (!document.querySelector('.modal-backdrop.is-open')) document.body.style.overflow = '';
  }

  /* ============ STATE ============ */
  const STATE = {
    /* 좌우 스플릿 — 우측 패널에 펼쳐 보일 활성 설정 */
    activeKey: 'ot',      /* 'ot' | 'payday' | 'payitem' */
    /* 시간외수당 — saved: 저장값 / draft: 인라인 편집 임시값 */
    otRates: {},          /* { [key]: 현재 가산배율 } */
    otDraft: null,
    /* 기본 지급일 */
    payday: {
      kind: 'fixed',
      dayOfMonth: 25,
      weekendRule: 'prev',
    },
    paydayDraft: null,
    /* 메타 */
    otUpdatedAt: '2026-02-12', otUpdatedBy: '정혜진',
    paydayUpdatedAt: '2025-12-22', paydayUpdatedBy: '정혜진',
  };

  function ensureLoaded() {
    if (Object.keys(STATE.otRates).length) return;
    /* 초기값 = 법정 최소 가산배율 */
    OT_RATE_DEFS.forEach(d => { STATE.otRates[d.key] = d.legalMin; });
  }


  /* =========================================================
   *  MODAL: 시간외수당 계산식 설정
   * ========================================================= */
  function openOtModal() {
    /* draft 초기화 — 저장값에서 시작 */
    STATE.otDraft = {};
    OT_RATE_DEFS.forEach(d => { STATE.otDraft[d.key] = STATE.otRates[d.key]; });
    renderOtModal();
    openModalEl('modal-ps-ot');
  }
  function closeOtModal() {
    closeModalEl('modal-ps-ot');
    STATE.otDraft = null;
  }

  function renderOtModal() {
    const modal = document.getElementById('modal-ps-ot');
    if (!modal) return;
    const body = modal.querySelector('#ps-ot-body');
    const foot = modal.querySelector('#ps-ot-footer');
    if (!body || !foot) return;

    const draft = STATE.otDraft || {};

    body.innerHTML = `
      <div style="margin-bottom:14px;display:flex;align-items:flex-start;gap:8px;color:var(--color-text-sub);font-size:var(--fs-sm);">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;color:var(--color-info);"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
        <span><strong style="color:var(--color-text);">가산배율</strong>만 입력하면 총 지급배율과 계산식은 자동으로 갱신됩니다. 법정 최소 미만으로는 설정할 수 없습니다.</span>
      </div>

      <table class="tbl tbl--bordered" style="font-size:var(--fs-sm);table-layout:fixed;width:100%;">
        <colgroup>
          <col style="width:34%;" />
          <col style="width:18%;" />
          <col style="width:16%;" />
          <col style="width:32%;" />
        </colgroup>
        <thead>
          <tr>
            <th>계산 기준</th>
            <th style="text-align:center;">가산배율</th>
            <th style="text-align:center;">총 지급배율</th>
            <th>계산식</th>
          </tr>
        </thead>
        <tbody id="ps-ot-tbody">
          ${OT_RATE_DEFS.map(d => renderOtRow(d, draft[d.key])).join('')}
        </tbody>
      </table>
    `;

    foot.innerHTML = `
      <button class="btn btn--sm" type="button" data-ps-ot-reset>법정 최소로 초기화</button>
      <span style="flex:1;"></span>
      <button class="btn" type="button" data-ps-ot-cancel>취소</button>
      <button class="btn btn--primary" type="button" data-ps-ot-save>저장</button>
    `;
    foot.style.display = 'flex';

    bindOtModal(modal);
  }

  function renderOtRow(d, currentRate) {
    const total = 1 + Number(currentRate || 0);
    const belowMin = Number(currentRate) < d.legalMin - 1e-9;
    const isCustom = Math.abs(Number(currentRate) - d.legalMin) > 1e-9 && !belowMin;

    return `
      <tr data-ps-ot-row="${esc(d.key)}">
        <td style="padding:6px 10px;">
          <div style="font-weight:var(--fw-semibold);color:var(--color-text);font-size:var(--fs-sm);">${esc(d.name)}</div>
          <div style="color:var(--color-text-muted);font-size:var(--fs-xs);margin-top:1px;">${esc(d.condition)}</div>
        </td>
        <td style="text-align:center;padding:6px 6px;">
          <div style="display:inline-flex;align-items:center;gap:4px;">
            <input type="number" class="input input--sm" data-ps-ot-input="${esc(d.key)}"
              value="${fmtRate(currentRate)}" min="${d.legalMin}" max="3" step="0.05"
              style="width:64px;text-align:right;font-family:var(--font-family);${belowMin ? 'border-color:var(--color-danger);' : ''}" />
            <span style="color:var(--color-text-muted);font-size:var(--fs-xs);">배</span>
          </div>
          <div data-ps-ot-hint="${esc(d.key)}" style="margin-top:2px;font-size:var(--fs-xs);${belowMin ? 'color:var(--color-danger);font-weight:var(--fw-medium);' : isCustom ? 'color:var(--color-warning);' : 'color:var(--color-text-muted);'}">
            ${belowMin ? '⚠ 법정 최소 미만' : (isCustom ? `회사 가산 (법정 ${fmtRate(d.legalMin)})` : `법정 최소 ${fmtRate(d.legalMin)}`)}
          </div>
        </td>
        <td style="text-align:center;padding:6px 6px;">
          <span data-ps-ot-total="${esc(d.key)}"
            style="display:inline-block;min-width:56px;padding:3px 10px;border-radius:var(--radius-pill);background:rgba(0,52,125,.08);color:var(--color-brand-primary);font-weight:var(--fw-bold);font-size:var(--fs-sm);font-family:var(--font-family);">${fmtRate(total)}배</span>
        </td>
        <td data-ps-ot-formula="${esc(d.key)}" style="padding:6px 10px;color:var(--color-text-sub);font-size:var(--fs-xs);line-height:1.4;">
          <span style="color:var(--color-text-muted);">시간급 통상임금</span>
          <span style="margin:0 3px;color:var(--color-text-muted);">×</span>
          <strong style="color:var(--color-brand-primary);font-family:var(--font-family);">${fmtRate(total)}</strong>
          <span style="margin:0 3px;color:var(--color-text-muted);">×</span>
          <span style="color:var(--color-text);">${esc(d.hoursVar)}</span>
        </td>
      </tr>
    `;
  }

  function bindOtModal(modal) {
    /* 닫기 */
    modal.querySelectorAll('[data-modal-close], [data-ps-ot-cancel]').forEach(b => {
      b.addEventListener('click', () => closeOtModal());
    });
    if (!modal.dataset.psBackdropBound) {
      modal.addEventListener('click', e => { if (e.target === modal) closeOtModal(); });
      modal.dataset.psBackdropBound = '1';
    }

    /* 가산배율 input — 즉시 총 배율/계산식/힌트 갱신 */
    modal.querySelectorAll('[data-ps-ot-input]').forEach(inp => {
      inp.addEventListener('input', () => {
        const key = inp.dataset.psOtInput;
        const def = OT_RATE_DEFS.find(d => d.key === key);
        if (!def) return;
        const val = Number(inp.value);
        STATE.otDraft[key] = isFinite(val) ? val : 0;

        const cur = STATE.otDraft[key];
        const total = 1 + cur;
        const belowMin = cur < def.legalMin - 1e-9;
        const isCustom = Math.abs(cur - def.legalMin) > 1e-9 && !belowMin;

        /* 총 지급배율 (pill span) */
        const totalEl = modal.querySelector(`[data-ps-ot-total="${CSS.escape(key)}"]`);
        if (totalEl) totalEl.textContent = fmtRate(total) + '배';

        /* 계산식 — 가운데 숫자(strong)만 surgical update */
        const formulaEl = modal.querySelector(`[data-ps-ot-formula="${CSS.escape(key)}"]`);
        if (formulaEl) {
          const strong = formulaEl.querySelector('strong');
          if (strong) strong.textContent = fmtRate(total);
        }

        /* 가산배율 input 빨강 보더 */
        inp.style.borderColor = belowMin ? 'var(--color-danger)' : '';

        /* 힌트 라벨 — 법정 최소 / 회사 가산 / 미만 경고 */
        const hintEl = modal.querySelector(`[data-ps-ot-hint="${CSS.escape(key)}"]`);
        if (hintEl) {
          if (belowMin) {
            hintEl.textContent = '⚠ 법정 최소 미만';
            hintEl.style.color = 'var(--color-danger)';
            hintEl.style.fontWeight = 'var(--fw-medium)';
          } else if (isCustom) {
            hintEl.textContent = `회사 가산 (법정 ${fmtRate(def.legalMin)})`;
            hintEl.style.color = 'var(--color-warning)';
            hintEl.style.fontWeight = '';
          } else {
            hintEl.textContent = `법정 최소 ${fmtRate(def.legalMin)}`;
            hintEl.style.color = 'var(--color-text-muted)';
            hintEl.style.fontWeight = '';
          }
        }
      });
    });

    /* 법정 최소로 초기화 */
    const resetBtn = modal.querySelector('[data-ps-ot-reset]');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      if (!confirm('모든 항목을 법정 최소 가산배율로 초기화하시겠습니까?')) return;
      OT_RATE_DEFS.forEach(d => { STATE.otDraft[d.key] = d.legalMin; });
      renderOtModal();
    });

    /* 저장 */
    const saveBtn = modal.querySelector('[data-ps-ot-save]');
    if (saveBtn) saveBtn.addEventListener('click', () => {
      /* 법정 최소 미만 검증 */
      const invalid = OT_RATE_DEFS.filter(d => STATE.otDraft[d.key] < d.legalMin - 1e-9);
      if (invalid.length) {
        window.toast && window.toast(`${invalid[0].name} 등 ${invalid.length}개 항목의 가산배율이 법정 최소 미만입니다.`, 'warning');
        return;
      }
      OT_RATE_DEFS.forEach(d => { STATE.otRates[d.key] = STATE.otDraft[d.key]; });
      STATE.otUpdatedAt = TODAY;
      STATE.otUpdatedBy = HR_NAME;
      window.toast && window.toast('시간외수당 계산식이 저장되었습니다.', 'success');
      closeOtModal();
    });
  }

  /* =========================================================
   *  Public API — 급여 정산 화면에서 가산배율/지급일 룩업
   * ========================================================= */
  App.HRPaySettings = {
    /* 시간외수당 가산배율 조회 — key: 'overtime'|'night'|... */
    getOtRate(key) {
      ensureLoaded();
      return STATE.otRates[key];
    },
    /* 총 지급배율 (1 + 가산배율) */
    getOtMultiplier(key) {
      ensureLoaded();
      const r = STATE.otRates[key];
      return isFinite(r) ? 1 + r : 1;
    },
    /* 전체 가산배율 정의 + 현재값 */
    getOtAll() {
      ensureLoaded();
      return OT_RATE_DEFS.map(d => Object.assign({}, d, {
        currentRate: STATE.otRates[d.key],
        totalMultiplier: 1 + STATE.otRates[d.key],
      }));
    },
    /* 기본 지급일 */
    getPayday() {
      return deepClone(STATE.payday);
    },
    /* 시간외수당 계산식 설정 모달 오픈 — 급여 정산의 「지급」 스텝에서 호출.
       페이지 init 이 없어도 로드되도록 ensureLoaded 후 모달 render → open. */
    openOtModal() {
      ensureLoaded();
      openOtModal();
    },
  };

})();
