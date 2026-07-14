/* =========================================================
 * Data module: 지급항목 마스터 (App.HRPayItem) — 구 page-hr-payitem
 *   ※ 「지급항목 설정」 단독 화면은 제거됨. App.HRPayItem 모듈(데이터 +
 *      renderInline + 편집 모달)을 급여 정산·명세서·임직원관리 등이 호출한다.
 *      (구 풀페이지 list 뷰 코드는 남아 있으나 마운트되지 않아 inert.)
 *
 *  지급항목 마스터 = 임금계약·급여 정산 시 사용할 항목 마스터.
 *  기본 항목은 시스템 제공(삭제 불가, 일부 필드 잠금), 사용자 추가 항목은
 *  미사용 시 자유롭게 수정·삭제 가능. 임금계약/정산에 사용된 추가 항목은
 *  삭제 대신 「임금계약 작성 시 사용 여부」를 OFF 로 전환한다.
 *
 *  목록 (list)
 *   · 검색: 지급항목명 / 항목코드
 *   · 상세검색: 지급 방식 · 항목 유형 · 과세 여부
 *   · 그리드: 지급항목명 / 항목유형 / 지급방식 / 과세여부 / 비과세유형 / 비과세한도
 *            / 통상임금 / 임금계약 사용 / 사용 계약 수
 *   · 행 클릭 → 수정 모달, [+ 지급항목 추가] → 신규 모달
 *
 *  편집 (modal-pi-editor)
 *   · 한 화면에 컴팩트하게: 기본 정보 / 과세 정보 / 정책
 *   · 기본 항목 — 잠금 필드 disabled
 *   · 사용 중 추가 항목 — 「삭제」 비활성, 「임금계약 사용 OFF」 안내
 *
 *  UI Kit 재사용
 *   .modal / .modal--lg / .modal__header / .modal__body / .modal__footer
 *   .toolbar / .tbl / .pill / .switch / .cb / .cb--pill / .cb-card / .pagination
 *   .fm-tbl / .input / .select / .field-error
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  /* ============ 환경 ============ */
  const TODAY   = '2026-05-17';
  const HR_NAME = '정혜진';

  /* ============ 코드 테이블 ============ */
  const PAY_METHODS = [
    { key: 'fixed',    label: '고정' },
    { key: 'variable', label: '변동' },
  ];
  const ITEM_TYPES = [
    { key: 'system', label: '기본 항목' },
    { key: 'custom', label: '추가 항목' },
  ];
  const TAX_TYPES = [
    { key: 'taxable', label: '과세' },
    { key: 'nontax',  label: '비과세' },
  ];
  /* 비과세 유형 — 「과세 여부」가 비과세일 때만 노출 */
  const NONTAX_KINDS = [
    { key: 'meal',      label: '식대',           limitMonthly: 200000 },
    { key: 'vehicle',   label: '자가운전보조금', limitMonthly: 200000 },
    { key: 'maternity', label: '출산/보육수당',  limitMonthly: 200000 },
    { key: 'etc',       label: '기타',           limitMonthly: 0 },
  ];

  /* ============ 기본 지급 항목 — 모든 설정 잠금 + 임금계약 사용 무조건 ON ============ */
  const BASE_ITEM_CODES = ['PAY-SYS-001', 'PAY-SYS-002', 'PAY-SYS-003', 'PAY-SYS-004', 'PAY-SYS-006', 'PAY-SYS-005'];
  function isBaseItem(code) { return BASE_ITEM_CODES.includes(code); }

  /* ============ Helper ============ */
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
  function fmtMoney(n) { n = Number(n); if (!isFinite(n) || n <= 0) return '-'; return n.toLocaleString() + '원'; }
  function methodLabel(k) { return (PAY_METHODS.find(x => x.key === k) || {}).label || '-'; }
  function ntKind(k)      { return NONTAX_KINDS.find(x => x.key === k); }
  function ntKindLabel(k) { const x = ntKind(k); return x ? x.label : ''; }

  /* 사용자 추가 항목 코드 자동 채번 — PAY-CUS-YYYY-NNNN */
  function nextCustomCode(items) {
    const year = String(TODAY).slice(0, 4);
    const re = new RegExp('^PAY-CUS-' + year + '-(\\d+)$');
    const maxSeq = (items || []).reduce((m, x) => {
      const match = String(x.code || '').match(re);
      return match ? Math.max(m, Number(match[1])) : m;
    }, 0);
    return 'PAY-CUS-' + year + '-' + String(maxSeq + 1).padStart(4, '0');
  }

  /* ============ Mock ============
   * 시스템 기본 항목 (스펙 §5 / §6) + 사용자 추가 예시.
   * lock* 플래그로 편집 가능 범위, canDelete 로 삭제 가능 여부를 표현.
   * usedInContract / usedInSettlement 가 1 이상이면 사용자 추가 항목도 삭제 불가. */
  function makeMock() {
    return [
      /* ===== 고정 지급항목 (기본) ===== */
      {
        id: 'PAY-SYS-001', code: 'PAY-SYS-001', name: '기본급',
        itemType: 'system', payMethod: 'fixed', taxType: 'taxable',
        nonTaxKind: '', nonTaxLimit: 0,
        ordinaryWage: true, useYn: true,
        lockName: true, lockMethod: true, lockTax: true, lockOrdinary: true, lockUseYn: true,
        canDelete: false,
        usedInContract: 47, usedInSettlement: 184,
        updatedAt: TODAY, updatedBy: 'SYSTEM',
      },
      {
        id: 'PAY-SYS-002', code: 'PAY-SYS-002', name: '고정연장근무수당',
        itemType: 'system', payMethod: 'fixed', taxType: 'taxable',
        nonTaxKind: '', nonTaxLimit: 0,
        ordinaryWage: false, useYn: true,
        lockName: true, lockMethod: true, lockTax: false, lockOrdinary: true, lockUseYn: true,
        canDelete: false,
        usedInContract: 22, usedInSettlement: 88,
        updatedAt: TODAY, updatedBy: 'SYSTEM',
      },
      /* ===== 변동 지급항목 (기본) ===== */
      {
        id: 'PAY-SYS-003', code: 'PAY-SYS-003', name: '연장근무수당',
        itemType: 'system', payMethod: 'variable', taxType: 'taxable',
        nonTaxKind: '', nonTaxLimit: 0,
        ordinaryWage: false, useYn: true,
        lockName: true, lockMethod: true, lockTax: false, lockOrdinary: true, lockUseYn: false,
        canDelete: false,
        usedInContract: 0, usedInSettlement: 154,
        updatedAt: TODAY, updatedBy: 'SYSTEM',
      },
      {
        id: 'PAY-SYS-004', code: 'PAY-SYS-004', name: '야간근무수당',
        itemType: 'system', payMethod: 'variable', taxType: 'taxable',
        nonTaxKind: '', nonTaxLimit: 0,
        ordinaryWage: false, useYn: true,
        lockName: true, lockMethod: true, lockTax: false, lockOrdinary: true, lockUseYn: false,
        canDelete: false,
        usedInContract: 0, usedInSettlement: 96,
        updatedAt: TODAY, updatedBy: 'SYSTEM',
      },
      {
        id: 'PAY-SYS-006', code: 'PAY-SYS-006', name: '야간연장근무수당',
        itemType: 'system', payMethod: 'variable', taxType: 'taxable',
        nonTaxKind: '', nonTaxLimit: 0,
        ordinaryWage: false, useYn: true,
        lockName: true, lockMethod: true, lockTax: false, lockOrdinary: true, lockUseYn: false,
        canDelete: false,
        usedInContract: 0, usedInSettlement: 64,
        updatedAt: TODAY, updatedBy: 'SYSTEM',
      },
      {
        id: 'PAY-SYS-005', code: 'PAY-SYS-005', name: '휴일근무수당',
        itemType: 'system', payMethod: 'variable', taxType: 'taxable',
        nonTaxKind: '', nonTaxLimit: 0,
        ordinaryWage: false, useYn: true,
        lockName: true, lockMethod: true, lockTax: false, lockOrdinary: true, lockUseYn: false,
        canDelete: false,
        usedInContract: 0, usedInSettlement: 72,
        updatedAt: TODAY, updatedBy: 'SYSTEM',
      },
      /* ===== 수기 입력 지급항목 (기본) — 급여 정산에서 직접 입력 ===== */
      {
        id: 'PAY-SYS-020', code: 'PAY-SYS-020', name: '상여금',
        itemType: 'system', payMethod: 'variable', taxType: 'taxable',
        nonTaxKind: '', nonTaxLimit: 0,
        ordinaryWage: false, useYn: true,
        lockName: true, lockMethod: true, lockTax: false, lockOrdinary: true, lockUseYn: false,
        canDelete: false,
        usedInContract: 0, usedInSettlement: 0,
        updatedAt: TODAY, updatedBy: 'SYSTEM',
      },
      {
        id: 'PAY-SYS-021', code: 'PAY-SYS-021', name: '상여금2',
        itemType: 'system', payMethod: 'variable', taxType: 'taxable',
        nonTaxKind: '', nonTaxLimit: 0,
        ordinaryWage: false, useYn: true,
        lockName: true, lockMethod: true, lockTax: false, lockOrdinary: true, lockUseYn: false,
        canDelete: false,
        /* 주 52시간 초과하는 경우 지급되는 항목 */
        usedInContract: 0, usedInSettlement: 0,
        updatedAt: TODAY, updatedBy: 'SYSTEM',
      },
      {
        id: 'PAY-SYS-022', code: 'PAY-SYS-022', name: '연차수당',
        itemType: 'system', payMethod: 'variable', taxType: 'taxable',
        nonTaxKind: '', nonTaxLimit: 0,
        ordinaryWage: false, useYn: true,
        lockName: true, lockMethod: true, lockTax: false, lockOrdinary: true, lockUseYn: false,
        canDelete: false,
        usedInContract: 0, usedInSettlement: 0,
        updatedAt: TODAY, updatedBy: 'SYSTEM',
      },
      {
        id: 'PAY-SYS-023', code: 'PAY-SYS-023', name: '기타수당',
        itemType: 'system', payMethod: 'variable', taxType: 'taxable',
        nonTaxKind: '', nonTaxLimit: 0,
        ordinaryWage: false, useYn: true,
        lockName: true, lockMethod: true, lockTax: false, lockOrdinary: true, lockUseYn: false,
        canDelete: false,
        usedInContract: 0, usedInSettlement: 0,
        updatedAt: TODAY, updatedBy: 'SYSTEM',
      },
      {
        id: 'PAY-SYS-024', code: 'PAY-SYS-024', name: '소급분',
        itemType: 'system', payMethod: 'variable', taxType: 'taxable',
        nonTaxKind: '', nonTaxLimit: 0,
        ordinaryWage: false, useYn: true,
        lockName: true, lockMethod: true, lockTax: false, lockOrdinary: true, lockUseYn: false,
        canDelete: false,
        /* 임금 소급 인상분 — 급여 정산에서 직접 입력 */
        usedInContract: 0, usedInSettlement: 0,
        updatedAt: TODAY, updatedBy: 'SYSTEM',
      },
    ];
  }

  /* ============ STATE ============ */
  const STATE = {
    items: [],
    filter: { keyword: '' },
    /* editor */
    editingId: null,       /* null = 신규, id = 수정 */
    form: null,
  };

  /* (구 page-hr-payitem 풀페이지 list 뷰 — renderListView/bindListView — 화면 제거로 삭제됨.
     카드 렌더는 App.HRPayItem.renderInline() 이 renderCards() 를 호출해 임베드 호스트에 그린다.) */

  function filteredList() {
    const kw = (STATE.filter.keyword || '').trim().toLowerCase();
    if (!kw) return STATE.items;
    return STATE.items.filter(m => String(m.name || '').toLowerCase().includes(kw));
  }

  /* 카드에 표시할 한 줄 설명 — 과세 속성 + 비과세 유형(있을 때).
   * 통상임금 포함 여부는 카드 푸터에 별도 표기. */
  function buildSubtitle(m) {
    const parts = [];
    if (m.taxType === 'nontax') {
      parts.push('비과세');
      const k = ntKindLabel(m.nonTaxKind);
      if (k) parts.push(k);
    } else {
      parts.push('과세');
    }
    return parts.join(' · ');
  }

  /* 정렬 — 기본 항목 → 사용자 추가 항목, 같은 그룹 내에서는 코드 오름차순 */
  function sortItems(arr) {
    return arr.slice().sort((a, b) => {
      if (a.itemType !== b.itemType) return a.itemType === 'system' ? -1 : 1;
      return String(a.code).localeCompare(String(b.code));
    });
  }

  function renderCards() {
    /* #pi-cards-host 는 page-hr-payitem 페이지 또는 page-hr-pay-settings 의 인라인 임베드 위치
     *   둘 중 어디든 있을 수 있으므로 document 레벨로 조회. 동시에 두 곳에 존재하지 않음 (단일 활성 탭). */
    const host = document.getElementById('pi-cards-host');
    if (!host) return;

    const list = sortItems(filteredList());
    const total = list.length;

    /* 총 N건 — [data-count] 표시 위치가 있을 때만 업데이트 (인라인 모드는 카운트 표시 없음) */
    const cntStrong = document.querySelector('#page-hr-payitem [data-count] strong');
    if (cntStrong) cntStrong.textContent = String(total);

    if (!total) {
      host.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:64px 20px;color:var(--color-text-muted);">
          <div style="font-size:var(--fs-md);margin-bottom:6px;">조건에 해당하는 지급항목이 없습니다.</div>
          <small style="font-size:var(--fs-sm);">검색 조건을 변경하거나 새 지급항목을 추가하세요.</small>
        </div>
      `;
      return;
    }

    const fixed    = list.filter(m => m.payMethod === 'fixed');
    const variable = list.filter(m => m.payMethod === 'variable');

    const gridStyle = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;';
    const groupHeader = (title, desc, count) => `
      <header style="display:flex;align-items:baseline;gap:10px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--color-divider);flex-wrap:wrap;">
        <h3 style="font-size:var(--fs-lg);font-weight:var(--fw-semibold);color:var(--color-text);margin:0;">${esc(title)}</h3>
        <span style="color:var(--color-text-sub);font-size:var(--fs-sm);">총 <strong style="color:var(--color-brand-primary);">${count}</strong>건</span>
        <span style="color:var(--color-text-muted);font-size:var(--fs-xs);">${esc(desc)}</span>
      </header>
    `;

    const groupSection = (title, desc, items) => {
      if (!items.length) return '';
      return `
        <section>
          ${groupHeader(title, desc, items.length)}
          <div style="${gridStyle}">${items.map(renderCard).join('')}</div>
        </section>
      `;
    };

    host.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:24px;">
        ${groupSection('고정 지급항목', '매월 동일 지급되는 금액입니다', fixed)}
        ${groupSection('변동 지급항목', '매월 지급 금액이 달라집니다', variable)}
      </div>
    `;
  }

  function renderCard(m) {
    const subtitle = buildSubtitle(m);

    /* 통상임금 — 포함 시 brand 색상 강조, 미포함 시 muted */
    const ordIndicator = m.ordinaryWage
      ? `<span style="display:inline-flex;align-items:center;gap:4px;color:var(--color-brand-primary);font-size:var(--fs-sm);font-weight:var(--fw-medium);">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
           통상임금 포함
         </span>`
      : `<span style="color:var(--color-text-muted);font-size:var(--fs-sm);">통상임금 미포함</span>`;

    const baseBadge = isBaseItem(m.code)
      ? `<span style="display:inline-flex;align-items:center;padding:1px 6px;border:1px solid var(--color-brand-primary);border-radius:var(--radius-sm);font-size:10px;font-weight:var(--fw-semibold);color:var(--color-brand-primary);line-height:1.4;flex-shrink:0;">기본</span>`
      : '';
    return `
      <article class="card" data-pi-row="${esc(m.id)}" style="padding:16px;display:flex;flex-direction:column;cursor:pointer;gap:6px;">
        <div style="display:flex;align-items:center;gap:6px;min-width:0;">
          <div style="flex:1;min-width:0;font-size:var(--fs-lg);font-weight:var(--fw-semibold);color:var(--color-brand-primary);line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(m.name)}</div>
          ${baseBadge}
        </div>
        <div style="color:var(--color-text-muted);font-size:var(--fs-sm);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(subtitle)}</div>
        <div style="margin-top:8px;padding-top:10px;border-top:1px solid var(--color-divider);">${ordIndicator}</div>
      </article>
    `;
  }

  /* =========================================================
   *  MODAL: 지급항목 등록/수정
   * ========================================================= */
  function newFormDefaults() {
    return {
      id: '', code: '', name: '',
      itemType: 'custom',
      payMethod: 'fixed',
      taxType: 'taxable',
      nonTaxKind: '',
      nonTaxLimit: 0,
      ordinaryWage: false,
      useYn: true,
      lockName: false, lockMethod: false, lockTax: false, lockOrdinary: false, lockUseYn: false,
      canDelete: true,
      usedInContract: 0, usedInSettlement: 0,
    };
  }

  function closeEditor() {
    closeModalEl('modal-pi-editor');
    STATE.editingId = null;
    STATE.form = null;
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

  function renderEditorModal() {
    const modal = document.getElementById('modal-pi-editor');
    if (!modal) return;
    const body = modal.querySelector('#pi-editor-body');
    const foot = modal.querySelector('#pi-editor-footer');
    const titleEl = modal.querySelector('#pi-editor-title');
    if (!body || !foot) return;

    const f = STATE.form;
    const isEdit = !!STATE.editingId;
    const isSys  = f.itemType === 'system';
    const usedTotal = (f.usedInContract || 0) + (f.usedInSettlement || 0);

    /* 제목 */
    if (titleEl) {
      titleEl.textContent = !isEdit ? '지급항목 추가'
        : `지급항목 수정 — ${f.name || '(이름 없음)'}`;
    }

    /* 알림 — 기본 항목 안내: 잠금 아이콘 + 한 줄 (배너/배경 없이 미니멀하게) */
    let notice = '';
    if (isSys) {
      notice = `<div style="margin:0 0 12px;display:inline-flex;align-items:center;gap:6px;font-size:var(--fs-xs);color:var(--color-text-muted);">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        기본 항목 — 일부 필드는 정책에 따라 잠겨 있습니다.
      </div>`;
    } else if (usedTotal > 0) {
      notice = `<div style="margin:0 0 14px;padding:10px 14px;background:rgba(217,119,6,.06);border-left:3px solid var(--color-warning);border-radius:var(--radius-sm);font-size:var(--fs-sm);color:var(--color-text-sub);">
        <strong style="color:var(--color-warning);">사용 중</strong> — ${f.usedInContract}건의 임금계약 · ${f.usedInSettlement}건의 급여 정산에 사용 중입니다. 변경은 신규 계약/정산부터 반영됩니다.
      </div>`;
    }

    body.innerHTML = `
      ${notice}
      <div style="display:flex;flex-direction:column;gap:14px;">
        ${sectionBasic(f, isEdit)}
        ${sectionTax(f)}
        ${sectionPolicy(f)}
      </div>
    `;

    /* 푸터 — 좌측: 삭제(가능 시) / 우측: 취소 / 저장 */
    let delBtnHTML = '';
    if (isEdit) {
      if (isSys || !f.canDelete) {
        delBtnHTML = `<button class="btn btn--soft-danger" type="button" disabled title="기본 항목은 삭제할 수 없습니다.">삭제</button>`;
      } else if (usedTotal > 0) {
        delBtnHTML = `<button class="btn btn--soft-danger" type="button" disabled title="사용 중 (${f.usedInContract}건 계약 · ${f.usedInSettlement}건 정산) — 삭제 불가. 「임금계약 사용 OFF」 로 전환해 주세요.">삭제</button>`;
      } else {
        delBtnHTML = `<button class="btn btn--danger" type="button" data-pi-delete>삭제</button>`;
      }
    }

    foot.innerHTML = `
      ${delBtnHTML}<span style="flex:1;"></span>
      <button class="btn" type="button" data-pi-cancel>취소</button>
      <button class="btn btn--primary" type="button" data-pi-save>${isEdit ? '저장' : '등록'}</button>
    `;
    foot.style.display = 'flex';

    bindEditorModal(modal);
  }

  /* ============ § 1 기본 정보 ============ */
  function sectionBasic(f, isEdit) {
    const req = `<span style="color:var(--color-danger);">*</span>`;
    const row2GT = 'grid-template-columns:110px 1fr 110px 1fr;';
    const row1GT = 'grid-template-columns:110px 1fr;';

    const methodRadios = PAY_METHODS.map(p => `
      <label class="cb cb--pill" style="padding:5px 14px;font-size:var(--fs-sm);">
        <input type="radio" name="pi-f-method" value="${esc(p.key)}" ${f.payMethod === p.key ? 'checked' : ''} ${f.lockMethod && isEdit ? 'disabled' : ''} />
        <span>${esc(p.label)}</span>
      </label>
    `).join('');

    const nameDisabled = f.lockName && isEdit;
    const nameInput = `<input type="text" class="input" id="pi-f-name" value="${esc(f.name)}" placeholder="예: 차량주유비, 직책수당, 보육수당" style="width:100%;${nameDisabled ? 'background:var(--color-surface-alt);' : ''}" maxlength="40" ${nameDisabled ? 'disabled' : ''} />`;

    return sectionWrap(1, '기본 정보', `
      <div class="fm-tbl fm-tbl--compact fm-tbl--bordered fm-tbl--form">
        <div class="fm-tbl__row fm-tbl__row--2" style="${row2GT}">
          <div class="fm-tbl__label">항목 코드</div>
          <div class="fm-tbl__value" style="color:var(--color-text-sub);font-size:var(--fs-sm);">${esc(f.code || '(자동 채번)')}</div>
          <div class="fm-tbl__label">항목 유형</div>
          <div class="fm-tbl__value">
            ${f.itemType === 'system'
              ? '<span class="pill pill--info">기본 항목</span>'
              : '<span class="pill pill--purple">추가 항목</span>'}
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" style="${row1GT}">
          <div class="fm-tbl__label">지급항목명 ${req}</div>
          <div class="fm-tbl__value">${nameInput}</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1" style="${row1GT}">
          <div class="fm-tbl__label">지급 방식 ${req}</div>
          <div class="fm-tbl__value">
            <div style="display:flex;gap:8px;align-items:center;">${methodRadios}
              <small style="margin-left:6px;color:var(--color-text-muted);font-size:var(--fs-xs);">
                ${f.payMethod === 'fixed' ? '임금계약 시 금액 확정, 매월 동일 지급' : '근태·실적·정산 결과에 따라 매월 금액이 달라짐'}
              </small>
            </div>
          </div>
        </div>
      </div>
    `);
  }

  /* ============ § 2 과세 정보 ============ */
  function sectionTax(f) {
    const req = `<span style="color:var(--color-danger);">*</span>`;
    const row1GT = 'grid-template-columns:110px 1fr;';
    const row2GT = 'grid-template-columns:110px 1fr 110px 1fr;';
    const isEdit = !!STATE.editingId;
    const disableTax = isEdit && f.lockTax;

    const taxRadios = TAX_TYPES.map(t => `
      <label class="cb cb--pill" style="padding:5px 14px;font-size:var(--fs-sm);">
        <input type="radio" name="pi-f-tax" value="${esc(t.key)}" ${f.taxType === t.key ? 'checked' : ''} ${disableTax ? 'disabled' : ''} />
        <span>${esc(t.label)}</span>
      </label>
    `).join('');

    const showNonTax = f.taxType === 'nontax';
    const ntOpts = NONTAX_KINDS.map(n => `<option value="${esc(n.key)}" ${f.nonTaxKind === n.key ? 'selected' : ''}>${esc(n.label)}</option>`).join('');

    const ntKindRow = `
      <div class="fm-tbl__row fm-tbl__row--2" data-pi-nt-row style="${row2GT};${showNonTax ? '' : 'display:none;'}">
        <div class="fm-tbl__label">비과세 유형 ${req}</div>
        <div class="fm-tbl__value">
          <select class="select" id="pi-f-nontax-kind" style="width:100%;max-width:240px;">
            <option value="">선택</option>
            ${ntOpts}
          </select>
        </div>
        <div class="fm-tbl__label">비과세 한도 ${req}</div>
        <div class="fm-tbl__value">
          <div style="display:flex;align-items:center;gap:6px;">
            <input type="number" class="input" id="pi-f-nontax-limit" value="${Number(f.nonTaxLimit) || 0}" min="0" step="10000" style="width:140px;text-align:right;" />
            <span style="color:var(--color-text-sub);font-size:var(--fs-sm);">원/월</span>
          </div>
        </div>
      </div>
    `;

    return sectionWrap(2, '과세 정보', `
      <div class="fm-tbl fm-tbl--compact fm-tbl--bordered fm-tbl--form">
        <div class="fm-tbl__row fm-tbl__row--1" style="${row1GT}">
          <div class="fm-tbl__label">과세 여부 ${req}</div>
          <div class="fm-tbl__value">
            <div style="display:flex;gap:8px;flex-wrap:wrap;">${taxRadios}</div>
          </div>
        </div>
        ${ntKindRow}
      </div>
      <small style="display:block;margin-top:8px;color:var(--color-text-muted);font-size:var(--fs-xs);">
        ※ 비과세 한도 초과분은 과세로 처리됩니다. 세법상 요건을 충족하는 경우에만 비과세를 설정하세요.
      </small>
    `);
  }

  /* ============ § 3 정책 (통상임금 / 사용 여부) ============ */
  function sectionPolicy(f) {
    const req = `<span style="color:var(--color-danger);">*</span>`;
    const row2GT = 'grid-template-columns:110px 1fr 110px 1fr;';
    const isEdit = !!STATE.editingId;
    const disOrd = isEdit && f.lockOrdinary;
    const disUse = isEdit && f.lockUseYn;

    return sectionWrap(3, '정책', `
      <div class="fm-tbl fm-tbl--compact fm-tbl--bordered fm-tbl--form">
        <div class="fm-tbl__row fm-tbl__row--2" style="${row2GT}">
          <div class="fm-tbl__label">통상임금 ${req}</div>
          <div class="fm-tbl__value">
            <div style="display:flex;gap:8px;">
              <label class="cb cb--pill" style="padding:5px 14px;font-size:var(--fs-sm);"><input type="radio" name="pi-f-ord" value="Y" ${f.ordinaryWage ? 'checked' : ''} ${disOrd ? 'disabled' : ''} /><span>포함</span></label>
              <label class="cb cb--pill" style="padding:5px 14px;font-size:var(--fs-sm);"><input type="radio" name="pi-f-ord" value="N" ${!f.ordinaryWage ? 'checked' : ''} ${disOrd ? 'disabled' : ''} /><span>미포함</span></label>
            </div>
          </div>
          <div class="fm-tbl__label">임금계약 사용 ${req}</div>
          <div class="fm-tbl__value">
            <label class="switch switch--lg">
              <input type="checkbox" id="pi-f-useyn" ${f.useYn ? 'checked' : ''} ${disUse ? 'disabled' : ''} />
              <span class="switch__box"></span>
              <span style="margin-left:8px;font-size:var(--fs-sm);color:var(--color-text-sub);" data-pi-use-label>${f.useYn ? 'ON' : 'OFF'}</span>
            </label>
          </div>
        </div>
      </div>
      <small style="display:block;margin-top:8px;color:var(--color-text-muted);font-size:var(--fs-xs);">
        ※ 임금계약 사용을 OFF 로 전환해도 이미 등록된 임금계약 및 정산 이력에는 영향을 주지 않습니다.
      </small>
    `);
  }

  function sectionWrap(num, title, body) {
    return `
      <section style="border:1px solid var(--color-border);border-radius:var(--radius-md);padding:14px 16px;background:var(--color-surface);">
        <header style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--color-divider);">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:var(--radius-sm);background:var(--color-brand-primary);color:#fff;font-size:var(--fs-xs);font-weight:var(--fw-bold);">${num}</span>
          <h3 style="font-size:var(--fs-md);font-weight:var(--fw-semibold);margin:0;color:var(--color-text);">${esc(title)}</h3>
        </header>
        ${body}
      </section>
    `;
  }

  /* ============ Modal 바인딩 ============ */
  function bindEditorModal(modal) {
    /* 닫기 / 취소 */
    modal.querySelectorAll('[data-modal-close], [data-pi-cancel]').forEach(b => {
      b.addEventListener('click', () => closeEditor());
    });
    /* 배경 클릭 닫기 — 모달 backdrop 자체 클릭만 */
    if (!modal.dataset.piBackdropBound) {
      modal.addEventListener('click', e => { if (e.target === modal) closeEditor(); });
      modal.dataset.piBackdropBound = '1';
    }

    /* 저장 */
    const saveBtn = modal.querySelector('[data-pi-save]');
    if (saveBtn) saveBtn.addEventListener('click', saveForm);

    /* 삭제 */
    const delBtn = modal.querySelector('[data-pi-delete]');
    if (delBtn) delBtn.addEventListener('click', attemptDeleteFromModal);

    const f = STATE.form;

    /* 지급항목명 */
    const name = modal.querySelector('#pi-f-name');
    if (name) name.addEventListener('input', () => {
      f.name = name.value;
      App.Forms && App.Forms.clearFieldError && App.Forms.clearFieldError(name);
    });

    /* 지급 방식 */
    modal.querySelectorAll('input[name="pi-f-method"]').forEach(r => r.addEventListener('change', () => {
      f.payMethod = r.value;
    }));

    /* 과세 여부 — 변경 시 비과세 행 토글 + 기본 한도 자동 채움 */
    modal.querySelectorAll('input[name="pi-f-tax"]').forEach(r => r.addEventListener('change', () => {
      f.taxType = r.value;
      const showNT = f.taxType === 'nontax';
      const ntRow = modal.querySelector('[data-pi-nt-row]');
      if (ntRow) ntRow.style.display = showNT ? '' : 'none';
      if (!showNT) { f.nonTaxKind = ''; f.nonTaxLimit = 0; }
      const ntKindSel = modal.querySelector('#pi-f-nontax-kind');
      const ntLimit   = modal.querySelector('#pi-f-nontax-limit');
      if (ntKindSel) ntKindSel.value = f.nonTaxKind;
      if (ntLimit)   ntLimit.value   = String(f.nonTaxLimit || 0);
    }));

    /* 비과세 유형 — 선택 시 한도 자동 채움 (사용자 입력 안된 경우만) */
    const ntKindSel = modal.querySelector('#pi-f-nontax-kind');
    if (ntKindSel) ntKindSel.addEventListener('change', () => {
      f.nonTaxKind = ntKindSel.value;
      const meta = ntKind(f.nonTaxKind);
      if (meta && meta.limitMonthly && (!f.nonTaxLimit || f.nonTaxLimit === 0)) {
        f.nonTaxLimit = meta.limitMonthly;
        const ntLimit = modal.querySelector('#pi-f-nontax-limit');
        if (ntLimit) ntLimit.value = String(meta.limitMonthly);
      }
    });

    /* 비과세 한도 */
    const ntLimit = modal.querySelector('#pi-f-nontax-limit');
    if (ntLimit) ntLimit.addEventListener('input', () => {
      f.nonTaxLimit = Math.max(0, Number(ntLimit.value) || 0);
    });

    /* 통상임금 */
    modal.querySelectorAll('input[name="pi-f-ord"]').forEach(r => r.addEventListener('change', () => {
      f.ordinaryWage = r.value === 'Y';
    }));

    /* 임금계약 사용 여부 */
    const useYn = modal.querySelector('#pi-f-useyn');
    if (useYn) useYn.addEventListener('change', () => {
      f.useYn = useYn.checked;
      const lab = modal.querySelector('[data-pi-use-label]');
      if (lab) lab.textContent = f.useYn ? 'ON' : 'OFF';
    });
  }

  /* ============ Save ============ */
  function saveForm() {
    const f = STATE.form;
    const modal = document.getElementById('modal-pi-editor');
    if (!modal) return;

    /* 인라인 필드 검증 — 토스트 금지 */
    App.Forms && App.Forms.clearAll && App.Forms.clearAll(modal);
    let ok = true;
    const nameEl = modal.querySelector('#pi-f-name');
    if (!f.name || !f.name.trim()) {
      if (App.Forms && App.Forms.setFieldError && nameEl) App.Forms.setFieldError(nameEl, '지급항목명을 입력해 주세요.');
      ok = false;
    }
    /* 중복 검사 — 같은 이름이 이미 존재 */
    const dupName = STATE.items.find(m => m.id !== STATE.editingId && m.name === (f.name || '').trim());
    if (dupName && nameEl) {
      if (App.Forms && App.Forms.setFieldError) App.Forms.setFieldError(nameEl, `이미 사용 중인 지급항목명입니다: ${dupName.code}`);
      ok = false;
    }
    /* 비과세 필드 — 과세 여부가 비과세면 유형/한도 필수 */
    if (f.taxType === 'nontax') {
      const ntKindEl = modal.querySelector('#pi-f-nontax-kind');
      const ntLimitEl = modal.querySelector('#pi-f-nontax-limit');
      if (!f.nonTaxKind) {
        if (App.Forms && App.Forms.setFieldError && ntKindEl) App.Forms.setFieldError(ntKindEl, '비과세 유형을 선택해 주세요.');
        ok = false;
      }
      if (!(Number(f.nonTaxLimit) > 0)) {
        if (App.Forms && App.Forms.setFieldError && ntLimitEl) App.Forms.setFieldError(ntLimitEl, '비과세 한도를 입력해 주세요.');
        ok = false;
      }
    }
    if (!ok) return;

    /* 비과세 정리 — 과세이면 비과세 필드 클리어 */
    if (f.taxType === 'taxable') {
      f.nonTaxKind = '';
      f.nonTaxLimit = 0;
    }
    f.name = f.name.trim();

    /* 코드 자동 채번(신규) — 저장 시점 한 번 더 */
    if (!STATE.editingId) {
      f.code = nextCustomCode(STATE.items);
    }

    if (STATE.editingId) {
      const src = STATE.items.find(m => m.id === STATE.editingId);
      if (src) {
        Object.assign(src, deepClone(f), {
          id: src.id, code: src.code, itemType: src.itemType,
          lockName: src.lockName, lockMethod: src.lockMethod, lockTax: src.lockTax,
          lockOrdinary: src.lockOrdinary, lockUseYn: src.lockUseYn,
          canDelete: src.canDelete,
          usedInContract: src.usedInContract, usedInSettlement: src.usedInSettlement,
          updatedAt: TODAY, updatedBy: HR_NAME,
        });
      }
      window.toast && window.toast(`${f.name} 지급항목이 저장되었습니다.`, 'success');
    } else {
      const newRec = deepClone(f);
      newRec.id = f.code;
      newRec.itemType = 'custom';
      newRec.canDelete = true;
      newRec.usedInContract = 0;
      newRec.usedInSettlement = 0;
      newRec.updatedAt = TODAY;
      newRec.updatedBy = HR_NAME;
      STATE.items.unshift(newRec);
      window.toast && window.toast(`${f.name} 지급항목이 등록되었습니다.`, 'success');
    }
    closeEditor();
    renderCards();
  }

  /* ============ Delete (모달 안에서) ============ */
  function attemptDeleteFromModal() {
    const id = STATE.editingId;
    const m = STATE.items.find(x => x.id === id);
    if (!m) return;
    if (m.itemType === 'system' || !m.canDelete) {
      window.toast && window.toast('기본 항목은 삭제할 수 없습니다.', 'warning');
      return;
    }
    const usedTotal = (m.usedInContract || 0) + (m.usedInSettlement || 0);
    if (usedTotal > 0) {
      window.toast && window.toast(`이미 임금계약/정산에 사용된 지급항목은 삭제할 수 없습니다.`, 'warning');
      return;
    }
    if (!confirm(`「${m.name}」(${m.code}) 지급항목을 삭제하시겠습니까?`)) return;
    STATE.items = STATE.items.filter(x => x.id !== id);
    window.toast && window.toast(`${m.name} 삭제 완료`, 'success');
    closeEditor();
    renderCards();
  }

  /* =========================================================
   *  Public API — 임금계약 작성 화면에서 사용 가능한 지급항목 룩업
   * ========================================================= */
  function ensureItemsLoaded() {
    if (!STATE.items || !STATE.items.length) {
      STATE.items = makeMock();
      /* 기본 5종(001~005) — 모든 설정 잠금 + useYn 강제 ON.
       *   mock 의 lock 플래그가 일부 false 인 경우(예: 003~005 의 lockUseYn)도 일괄 보정. */
      STATE.items.forEach(m => {
        if (isBaseItem(m.code)) {
          m.lockName = true;
          m.lockMethod = true;
          m.lockTax = true;
          m.lockOrdinary = true;
          m.lockUseYn = true;
          m.useYn = true;
        }
      });
    }
  }
  App.HRPayItem = {
    /* 신규 임금계약 작성 시 선택 가능한 지급항목 목록 (useYn ON 만) */
    getActiveItems(method) {
      ensureItemsLoaded();
      return STATE.items
        .filter(m => m.useYn && (!method || m.payMethod === method))
        .map(m => ({ id: m.id, code: m.code, name: m.name, payMethod: m.payMethod, taxType: m.taxType, ordinaryWage: m.ordinaryWage }));
    },
    /* 코드 기반 단건 조회 — 명세서·정산 화면 룩업용 */
    getByCode(code) {
      ensureItemsLoaded();
      return STATE.items.find(m => m.code === code) || null;
    },
    /* 마스터 「최근 수정」 정보 — 「급여 기준 설정」 카드의 메타 표시용 */
    lastUpdated() {
      ensureItemsLoaded();
      const latest = STATE.items.reduce((acc, m) => {
        if (!m.updatedAt) return acc;
        if (!acc || String(m.updatedAt) > String(acc.updatedAt)) return m;
        return acc;
      }, null);
      return latest
        ? { date: latest.updatedAt, user: latest.updatedBy || '-' }
        : { date: '-', user: '-' };
    },
  };

  /* 데이터 모듈 — 페이지 init 없음. 소비처(급여 정산·명세서·임직원관리)가
     App.HRPayItem 메서드를 호출하면 ensureItemsLoaded() 가 지연 시드한다. */
})();
