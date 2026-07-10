/* =========================================================
 * Page: 근태 > 설정 > 근태코드 설정
 *
 *   「시스템 > 코드 관리 > 원자재 코드」(page-code-mgmt) 와 동일한 3단계 계층 코드 UI.
 *     · 1차 대분류 — 근태 / 휴가 (고정 2종, 수정/추가 불가)
 *     · 2차 중분류 — (근태) 출장·교육·조퇴·외출·근무시간변경·기타 / (휴가) 경조·연차·반차·출산휴가·청원·공가·보건·기타
 *     · 3차 소분류 — 중분류별 세부 사유 (예: 출장 → (국내)행사참석 …)
 *
 *   휴가 3차 소분류는 「연차 차감 여부」(차감 / 미차감) 옵션을 가진다.
 *     예) 연차·반차 = 차감 / 공가·보건 = 미차감. 행에 pill 로 표시, 수정 모달에서 선택.
 *
 *   ※ Mock — 모듈 내 D1/D2/D3 (배열 순서 = 표시 순서). 근태/휴가 신청 사유 선택지의 단일 진실원(데모).
 *   UI Kit: .code-mgmt / .code-mgmt__col / .code-mgmt__row / .code-field / .btn-toggle / .modal / .pill
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function toast(msg, kind) { (App.flashToast || window.toast || function () {})(msg, kind); }

  /* ============ 1차 대분류 — 근태/휴가 고정 ============ */
  const D1 = [
    { id: 'att', code: 'ATT', name: '근태', use: 'Y' },
    { id: 'hol', code: 'HOL', name: '휴가', use: 'Y' },
  ];
  const DEDUCT = { Y: { label: '연차 차감', pill: 'pill--warning' }, N: { label: '연차 미차감', pill: 'pill--muted' } };

  /* ============ 2차 중분류 (대분류별) ============ */
  const D2 = {
    att: [
      { id: 'att-A', code: 'A', name: '출장',         use: 'Y', desc: '' },
      { id: 'att-B', code: 'B', name: '교육',         use: 'Y', desc: '' },
      { id: 'att-C', code: 'C', name: '조퇴',         use: 'Y', desc: '' },
      { id: 'att-D', code: 'D', name: '외출',         use: 'Y', desc: '' },
      { id: 'att-E', code: 'E', name: '근무시간변경', use: 'Y', desc: '' },
      { id: 'att-Z', code: 'Z', name: '기타',         use: 'Y', desc: '' },
    ],
    hol: [
      { id: 'hol-A', code: 'A', name: '경조',     use: 'Y', desc: '' },
      { id: 'hol-B', code: 'B', name: '연차',     use: 'Y', desc: '' },
      { id: 'hol-C', code: 'C', name: '반차',     use: 'Y', desc: '' },
      { id: 'hol-D', code: 'D', name: '출산/휴가', use: 'Y', desc: '' },
      { id: 'hol-E', code: 'E', name: '청원',     use: 'Y', desc: '' },
      { id: 'hol-F', code: 'F', name: '공가',     use: 'Y', desc: '' },
      { id: 'hol-G', code: 'G', name: '보건',     use: 'Y', desc: '' },
      { id: 'hol-Z', code: 'Z', name: '기타',     use: 'Y', desc: '' },
    ],
  };

  /* ============ 3차 소분류 (중분류 id 별) — 휴가는 deduct(Y/N) 보유 ============ */
  const D3 = {
    'att-A': [
      { id: 'ATTA01', code: 'ATTA01', name: '(국내)행사참석', use: 'Y', desc: '' },
      { id: 'ATTA02', code: 'ATTA02', name: '(국내)시장조사', use: 'Y', desc: '' },
      { id: 'ATTA03', code: 'ATTA03', name: '(해외)행사참석', use: 'Y', desc: '' },
      { id: 'ATTA04', code: 'ATTA04', name: '(해외)시장조사', use: 'Y', desc: '' },
      { id: 'ATTA05', code: 'ATTA05', name: '대외미팅', use: 'Y', desc: '' },
      { id: 'ATTA06', code: 'ATTA06', name: '내부미팅', use: 'Y', desc: '' },
      { id: 'ATTA07', code: 'ATTA07', name: '국내구매', use: 'Y', desc: '' },
    ],
    'att-B': [
      { id: 'ATTB01', code: 'ATTB01', name: '사내', use: 'Y', desc: '' },
      { id: 'ATTB02', code: 'ATTB02', name: '사외', use: 'Y', desc: '' },
    ],
    'att-C': [
      { id: 'ATTC01', code: 'ATTC01', name: '병가(산재)', use: 'Y', desc: '' },
      { id: 'ATTC02', code: 'ATTC02', name: '병가(무급)', use: 'Y', desc: '' },
      { id: 'ATTC03', code: 'ATTC03', name: '개인사정', use: 'Y', desc: '' },
    ],
    'att-D': [
      { id: 'ATTD01', code: 'ATTD01', name: '병가(산재)', use: 'Y', desc: '' },
      { id: 'ATTD02', code: 'ATTD02', name: '병가(무급)', use: 'Y', desc: '' },
      { id: 'ATTD03', code: 'ATTD03', name: '개인사정', use: 'Y', desc: '' },
    ],
    'att-E': [
      { id: 'ATTE01', code: 'ATTE01', name: '대체근무', use: 'Y', desc: '' },
      { id: 'ATTE02', code: 'ATTE02', name: '임신단축근무', use: 'Y', desc: '' },
    ],
    'att-Z': [
      { id: 'ATTZ01', code: 'ATTZ01', name: '기타', use: 'Y', desc: '' },
    ],
    'hol-A': [
      { id: 'HOLA01', code: 'HOLA01', name: '본인 결혼', use: 'Y', desc: '', deduct: 'N' },
      { id: 'HOLA02', code: 'HOLA02', name: '자녀 결혼', use: 'Y', desc: '', deduct: 'N' },
      { id: 'HOLA03', code: 'HOLA03', name: '본인(배우자) 형제자매 결혼', use: 'Y', desc: '', deduct: 'N' },
      { id: 'HOLA04', code: 'HOLA04', name: '본인 사망', use: 'Y', desc: '', deduct: 'N' },
      { id: 'HOLA05', code: 'HOLA05', name: '배우자 사망', use: 'Y', desc: '', deduct: 'N' },
      { id: 'HOLA06', code: 'HOLA06', name: '자녀 사망', use: 'Y', desc: '', deduct: 'N' },
      { id: 'HOLA07', code: 'HOLA07', name: '본인(배우자) 부모 사망', use: 'Y', desc: '', deduct: 'N' },
      { id: 'HOLA08', code: 'HOLA08', name: '본인(배우자) 형제자매 사망', use: 'Y', desc: '', deduct: 'N' },
      { id: 'HOLA09', code: 'HOLA09', name: '본인(배우자) 외가/친가 조부모 사망', use: 'Y', desc: '', deduct: 'N' },
    ],
    'hol-B': [
      { id: 'HOLB01', code: 'HOLB01', name: '연차', use: 'Y', desc: '하루 종일', deduct: 'Y' },
    ],
    'hol-C': [
      { id: 'HOLC01', code: 'HOLC01', name: '오전', use: 'Y', desc: '09:00 ~ 14:00', deduct: 'Y' },
      { id: 'HOLC02', code: 'HOLC02', name: '오후', use: 'Y', desc: '14:00 ~ 18:00', deduct: 'Y' },
    ],
    'hol-D': [
      { id: 'HOLD01', code: 'HOLD01', name: '본인', use: 'Y', desc: '출산휴가', deduct: 'N' },
      { id: 'HOLD02', code: 'HOLD02', name: '배우자', use: 'Y', desc: '배우자 출산휴가', deduct: 'N' },
      { id: 'HOLD03', code: 'HOLD03', name: '육아휴직/본인', use: 'Y', desc: '', deduct: 'N' },
      { id: 'HOLD04', code: 'HOLD04', name: '육아휴직/배우자', use: 'Y', desc: '', deduct: 'N' },
    ],
    'hol-E': [
      { id: 'HOLE01', code: 'HOLE01', name: '청원', use: 'Y', desc: '', deduct: 'N' },
    ],
    'hol-F': [
      { id: 'HOLF01', code: 'HOLF01', name: '예비군', use: 'Y', desc: '', deduct: 'N' },
      { id: 'HOLF02', code: 'HOLF02', name: '민방위', use: 'Y', desc: '', deduct: 'N' },
    ],
    'hol-G': [
      { id: 'HOLG01', code: 'HOLG01', name: '전염병', use: 'Y', desc: '', deduct: 'N' },
      { id: 'HOLG02', code: 'HOLG02', name: '병가(산재)', use: 'Y', desc: '', deduct: 'N' },
      { id: 'HOLG03', code: 'HOLG03', name: '병가(무급)', use: 'Y', desc: '', deduct: 'N' },
      { id: 'HOLG05', code: 'HOLG05', name: '가족돌봄휴가', use: 'Y', desc: '', deduct: 'N' },
      { id: 'HOLG06', code: 'HOLG06', name: '가족돌봄휴직', use: 'Y', desc: '', deduct: 'N' },
    ],
    'hol-Z': [
      { id: 'HOLZ01', code: 'HOLZ01', name: '기타', use: 'Y', desc: '', deduct: 'N' },
    ],
  };

  const DEPTH_NAMES = ['', '대분류', '중분류', '소분류'];
  const STATE = {
    selectedD1: D1[0],   /* 기본 — 근태 선택 */
    selectedD2: null,
    modal: { depth: 0, isEdit: false, editId: null },
    drag: { depth: null, id: null },
  };

  function isHolSel() { return STATE.selectedD1 && STATE.selectedD1.id === 'hol'; }
  function listOf(depth) {
    if (depth === 1) return D1;
    if (depth === 2) return STATE.selectedD1 ? (D2[STATE.selectedD1.id] = D2[STATE.selectedD1.id] || []) : null;
    if (depth === 3) return STATE.selectedD2 ? (D3[STATE.selectedD2.id] = D3[STATE.selectedD2.id] || []) : null;
    return null;
  }

  /* 신규 코드 제안 — 2차: 사용 안 한 다음 알파벳 / 3차: 접두어+중분류+2자리 일련번호 */
  function suggestD2Code() {
    const used = new Set((listOf(2) || []).map(r => r.code));
    for (let c = 65; c <= 89; c++) { const ch = String.fromCharCode(c); if (!used.has(ch)) return ch; }
    return 'Z';
  }
  function suggestD3Code() {
    const d1 = STATE.selectedD1, d2 = STATE.selectedD2;
    if (!d1 || !d2) return '';
    const prefix = d1.code + d2.code;
    let max = 0;
    (listOf(3) || []).forEach(r => {
      const m = String(r.code).match(new RegExp('^' + prefix + '(\\d+)$'));
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return prefix + String(max + 1).padStart(2, '0');
  }

  /* ============ 렌더 ============ */
  function rowHTML(row, depth, opts) {
    opts = opts || {};
    const useCls = row.use === 'Y' ? 'code-mgmt__use--y' : 'code-mgmt__use--n';
    const nameCls = row.use === 'Y' ? '' : ' is-disabled';
    /* 휴가 3차 — 연차 차감 여부 pill 을 이름 옆에 표시 */
    let deductPill = '';
    if (opts.deduct) {
      const d = DEDUCT[row.deduct === 'Y' ? 'Y' : 'N'];
      deductPill = ` <span class="pill ${d.pill}" style="font-size:10px;vertical-align:middle;">${d.label}</span>`;
    }
    const editCell = opts.fixed
      ? `<span aria-hidden="true"></span>`
      : `<button class="code-mgmt__row-edit" type="button" data-code-edit data-depth="${depth}" data-id="${esc(row.id)}" aria-label="수정">✎</button>`;
    return `
      <div class="code-mgmt__row${opts.selected ? ' is-active' : ''}"${opts.fixed ? '' : ' draggable="true"'} data-depth="${depth}" data-id="${esc(row.id)}">
        <span class="code-mgmt__handle" aria-hidden="true">⋮⋮</span>
        <span class="code-mgmt__name${nameCls}" title="${esc(row.name)}">${esc(row.name)}${deductPill}</span>
        <span class="code-mgmt__code-id">${esc(row.code)}</span>
        <span class="code-mgmt__use ${useCls}">${esc(row.use)}</span>
        ${editCell}
      </div>`;
  }
  function emptyHTML(text, icon) {
    return `<div class="code-mgmt__empty"><div class="code-mgmt__empty-icon">${icon || '←'}</div><div class="code-mgmt__empty-text">${esc(text)}</div></div>`;
  }
  function renderColumn(pageEl, depth) {
    const body = pageEl.querySelector(`[data-att-body="${depth}"]`);
    const addBtn = pageEl.querySelector(`[data-att-add="${depth}"]`);
    if (!body) return;
    if (depth === 2 && !STATE.selectedD1) { body.innerHTML = emptyHTML('1차 대분류를 선택해주세요'); if (addBtn) addBtn.disabled = true; return; }
    if (depth === 3 && !STATE.selectedD2) { body.innerHTML = emptyHTML('2차 중분류를 선택해주세요'); if (addBtn) addBtn.disabled = true; return; }
    if (addBtn) addBtn.disabled = false;

    const list = listOf(depth) || [];
    if (!list.length) { body.innerHTML = emptyHTML('등록된 코드가 없습니다', '＋'); return; }

    const selId = depth === 1 ? (STATE.selectedD1 && STATE.selectedD1.id)
      : depth === 2 ? (STATE.selectedD2 && STATE.selectedD2.id) : null;
    const deduct = depth === 3 && isHolSel();
    body.innerHTML = list.map(r => rowHTML(r, depth, { selected: selId === r.id, fixed: depth === 1, deduct })).join('');
  }
  function renderAll(pageEl) {
    const meta = pageEl.querySelector('[data-att-meta]');
    if (meta) {
      const d2n = Object.values(D2).reduce((a, b) => a + (b ? b.length : 0), 0);
      const d3n = Object.values(D3).reduce((a, b) => a + (b ? b.length : 0), 0);
      meta.textContent = `1차 ${D1.length} · 2차 ${d2n} · 3차 ${d3n} 건`;
    }
    [1, 2, 3].forEach(d => renderColumn(pageEl, d));
  }

  function colHTML(depth, title, sub, addable) {
    return `
      <div class="code-mgmt__col" data-att-col="${depth}">
        <div class="code-mgmt__col-head">
          <div class="code-mgmt__col-title">
            ${esc(title)}
            <span style="color:var(--color-text-muted);font-weight:var(--fw-regular);font-size:var(--fs-xs);">${esc(sub)}</span>
          </div>
          ${addable ? `<button class="btn btn--xs btn--primary" type="button" data-att-add="${depth}">＋ 추가</button>` : ''}
        </div>
        <div class="code-mgmt__col-thead">
          <div aria-label="정렬"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg></div>
          <div>${depth === 3 ? '사유 · 차감' : '코드명'}</div>
          <div>코드</div>
          <div>상태</div>
          <div>관리</div>
        </div>
        <div class="code-mgmt__col-body" data-att-body="${depth}"></div>
      </div>`;
  }
  function html() {
    return `
      <div class="code-mgmt-bar">
        <div class="code-mgmt-bar__title"><strong>근태코드 설정</strong></div>
        <div class="code-mgmt-bar__meta" data-att-meta></div>
      </div>
      <div class="code-mgmt">
        ${colHTML(1, '1차 · 대분류', '근태 / 휴가 (고정)', false)}
        ${colHTML(2, '2차 · 중분류', '대분류별 분류', true)}
        ${colHTML(3, '3차 · 소분류', '세부 사유', true)}
      </div>`;
  }

  /* ============ 등록/수정 모달 ============ */
  let _modal = null;
  function buildModal() {
    if (_modal) return _modal;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="modal-backdrop" data-att-modal-host>
        <div class="modal" style="max-width:520px;">
          <div class="modal__header">
            <div>
              <div class="modal__title" data-att-modal-title>코드 등록</div>
              <div style="margin-top:4px;font-size:var(--fs-xs);color:var(--color-text-muted);" data-att-modal-bc></div>
            </div>
            <button class="modal__close" type="button" data-att-modal-close aria-label="닫기">✕</button>
          </div>
          <div class="modal__body" style="display:flex;flex-direction:column;gap:18px;">
            <div class="code-field">
              <label class="code-field__label">코드명 <em>*</em></label>
              <div class="code-field__wrap">
                <span class="code-field__lang">한국어</span>
                <input class="input" type="text" data-att-input-name placeholder="예) 대외미팅">
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
              <div class="code-field">
                <label class="code-field__label">코드 <em>*</em></label>
                <input class="input" type="text" data-att-input-id maxlength="8" style="text-transform:uppercase;" placeholder="예) ATTA08">
                <p class="code-field__help" data-att-id-help>코드는 자동 제안됩니다.</p>
              </div>
              <div class="code-field">
                <label class="code-field__label">사용 여부</label>
                <div class="btn-toggle btn-toggle--block" data-att-use-toggle role="tablist" aria-label="사용 여부">
                  <button class="btn btn--sm is-active" type="button" data-att-use="Y" role="tab" aria-selected="true">사용 (Y)</button>
                  <button class="btn btn--sm" type="button" data-att-use="N" role="tab" aria-selected="false">미사용 (N)</button>
                </div>
              </div>
            </div>
            <div class="code-field" data-att-deduct-field style="display:none;">
              <label class="code-field__label">연차 차감 여부 <em>*</em></label>
              <div class="btn-toggle btn-toggle--block" data-att-deduct-toggle role="tablist" aria-label="연차 차감 여부">
                <button class="btn btn--sm" type="button" data-att-deduct="Y" role="tab" aria-selected="false">연차 차감</button>
                <button class="btn btn--sm is-active" type="button" data-att-deduct="N" role="tab" aria-selected="true">연차 미차감</button>
              </div>
              <p class="code-field__help">연차·반차는 차감, 공가·보건 등 법정·약정 휴가는 미차감으로 설정합니다.</p>
            </div>
            <div class="code-field">
              <label class="code-field__label">설명 <span style="color:var(--color-text-muted);font-weight:var(--fw-regular);">(선택)</span></label>
              <textarea class="input" data-att-input-desc maxlength="200" rows="3" placeholder="코드에 대한 설명을 입력하세요" style="height:84px;min-height:84px;resize:vertical;"></textarea>
              <div style="text-align:right;font-size:var(--fs-xs);color:var(--color-text-muted);margin-top:4px;"><span data-att-desc-count>0</span> / 200자</div>
            </div>
          </div>
          <div class="modal__footer">
            <button class="btn" type="button" data-att-modal-close>취소</button>
            <button class="btn btn--primary" type="button" data-att-modal-save>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;vertical-align:-2px;"><polyline points="20 6 9 17 4 12"/></svg>저장
            </button>
          </div>
        </div>
      </div>`;
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    _modal = document.querySelector('[data-att-modal-host]');
    _modal.addEventListener('click', e => {
      if (e.target === _modal || e.target.closest('[data-att-modal-close]')) { closeModal(); return; }
      if (e.target.closest('[data-att-modal-save]')) { saveFromModal(); return; }
      const useBtn = e.target.closest('[data-att-use]');
      if (useBtn) { toggleGroup('[data-att-use]', useBtn); return; }
      const dedBtn = e.target.closest('[data-att-deduct]');
      if (dedBtn) { toggleGroup('[data-att-deduct]', dedBtn); return; }
    });
    _modal.addEventListener('input', e => {
      const t = e.target;
      if (t.matches('[data-att-input-id]')) {
        t.value = t.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
        _modal.querySelector('[data-att-id-help]').classList.remove('is-error');
      } else if (t.matches('[data-att-input-desc]')) {
        if (t.value.length > 200) t.value = t.value.slice(0, 200);
        _modal.querySelector('[data-att-desc-count]').textContent = String(t.value.length);
      }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && _modal && _modal.classList.contains('is-open')) closeModal();
    });
    return _modal;
  }
  function toggleGroup(sel, activeBtn) {
    _modal.querySelectorAll(sel).forEach(b => {
      const on = b === activeBtn;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }
  function openModal(depth, editId) {
    const bd = buildModal();
    const isEdit = !!editId;
    let row = null;
    if (isEdit) { row = (listOf(depth) || []).find(x => x.id === editId); if (!row) return; }
    STATE.modal = { depth, isEdit, editId: editId || null };

    bd.querySelector('[data-att-modal-title]').textContent = `${depth}차 ${DEPTH_NAMES[depth]} 코드 ${isEdit ? '수정' : '등록'}`;
    /* breadcrumb — 상위 경로 */
    const chain = [];
    if (depth >= 2 && STATE.selectedD1) chain.push(STATE.selectedD1);
    if (depth >= 3 && STATE.selectedD2) chain.push(STATE.selectedD2);
    bd.querySelector('[data-att-modal-bc]').innerHTML = chain.length
      ? '상위: ' + chain.map(c => `<strong style="color:var(--color-brand-primary);">${esc(c.name)}(${esc(c.code)})</strong>`).join(' › ')
      : '최상위 코드';

    const nameInp = bd.querySelector('[data-att-input-name]');
    const idInp   = bd.querySelector('[data-att-input-id]');
    const descInp = bd.querySelector('[data-att-input-desc]');
    const descCnt = bd.querySelector('[data-att-desc-count]');
    const help    = bd.querySelector('[data-att-id-help]');
    const idMax   = depth === 2 ? 1 : 8;
    nameInp.value = row ? row.name : '';
    idInp.value   = row ? row.code : (depth === 2 ? suggestD2Code() : suggestD3Code());
    idInp.maxLength = idMax;
    idInp.setAttribute('placeholder', depth === 2 ? '예) F' : '예) ATTA08');
    descInp.value = row && row.desc ? row.desc : '';
    descCnt.textContent = String(descInp.value.length);
    idInp.readOnly = isEdit;
    idInp.style.background = isEdit ? 'var(--color-surface-alt)' : '';
    idInp.style.color = isEdit ? 'var(--color-text-muted)' : '';
    help.classList.remove('is-error');
    help.textContent = isEdit ? '등록 후 코드는 변경할 수 없습니다.' : (depth === 2 ? '중분류 코드(영문 1자) · 자동 제안' : '접두어+중분류+일련번호 · 자동 제안');

    toggleGroup('[data-att-use]', bd.querySelector(`[data-att-use="${row ? row.use : 'Y'}"]`));

    /* 연차 차감 여부 — 휴가 3차에서만 노출 */
    const deductField = bd.querySelector('[data-att-deduct-field]');
    const showDeduct = depth === 3 && isHolSel();
    deductField.style.display = showDeduct ? '' : 'none';
    if (showDeduct) toggleGroup('[data-att-deduct]', bd.querySelector(`[data-att-deduct="${row && row.deduct === 'Y' ? 'Y' : 'N'}"]`));

    bd.classList.add('is-open');
    setTimeout(() => nameInp.focus(), 30);
  }
  function closeModal() { if (_modal) _modal.classList.remove('is-open'); }
  function saveFromModal() {
    const bd = _modal;
    if (!bd) return;
    const { depth, isEdit, editId } = STATE.modal;
    const name = bd.querySelector('[data-att-input-name]').value.trim();
    const code = bd.querySelector('[data-att-input-id]').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, depth === 2 ? 1 : 8);
    const desc = bd.querySelector('[data-att-input-desc]').value.trim();
    const useBtn = bd.querySelector('[data-att-use].is-active');
    const use = useBtn ? useBtn.dataset.attUse : 'Y';
    const help = bd.querySelector('[data-att-id-help]');
    const showDeduct = depth === 3 && isHolSel();
    const dedBtn = bd.querySelector('[data-att-deduct].is-active');
    const deduct = dedBtn ? dedBtn.dataset.attDeduct : 'N';

    if (!name) { toast('코드명을 입력해 주세요.', 'warning'); return; }
    if (!code) { help.textContent = '코드를 입력해 주세요.'; help.classList.add('is-error'); return; }
    const list = listOf(depth);
    if (!list) { toast('상위 코드를 먼저 선택해 주세요.', 'warning'); return; }
    if (!isEdit && list.some(r => r.code === code)) { help.textContent = '이미 존재하는 코드입니다.'; help.classList.add('is-error'); return; }

    if (isEdit) {
      const row = list.find(r => r.id === editId);
      if (!row) return;
      row.name = name; row.use = use; row.desc = desc;
      if (showDeduct) row.deduct = deduct;
    } else {
      const rec = { id: code, code, name, use, desc };
      if (depth === 2) { D3[code] = D3[code] || []; }   /* 신규 중분류 → 빈 소분류 슬롯 */
      if (showDeduct) rec.deduct = deduct;
      list.push(rec);
    }
    closeModal();
    const pageEl = document.getElementById('page-att-code');
    if (pageEl) renderAll(pageEl);
    toast(`${DEPTH_NAMES[depth]} 코드 「${name}」 ${isEdit ? '수정' : '등록'}되었습니다.`, 'success');
  }

  /* ============ Drag & Drop (같은 컬럼 내 순서 변경 — 2·3차) ============ */
  function clearDragLines(pageEl) {
    pageEl.querySelectorAll('.is-drop-top, .is-drop-bottom').forEach(el => el.classList.remove('is-drop-top', 'is-drop-bottom'));
  }
  function bindBodyDnD(pageEl, bodyEl, depth) {
    bodyEl.addEventListener('dragstart', e => {
      const row = e.target.closest('.code-mgmt__row');
      if (!row || !row.getAttribute('draggable')) return;
      STATE.drag = { depth, id: row.dataset.id };
      row.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', row.dataset.id); } catch (_) {}
    });
    bodyEl.addEventListener('dragend', () => {
      clearDragLines(pageEl);
      bodyEl.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging'));
      STATE.drag = { depth: null, id: null };
    });
    bodyEl.addEventListener('dragover', e => {
      if (STATE.drag.depth !== depth) return;
      e.preventDefault();
      const row = e.target.closest('.code-mgmt__row');
      if (!row) return;
      e.dataTransfer.dropEffect = 'move';
      clearDragLines(pageEl);
      const rect = row.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) row.classList.add('is-drop-top');
      else row.classList.add('is-drop-bottom');
    });
    bodyEl.addEventListener('drop', e => {
      if (STATE.drag.depth !== depth) return;
      e.preventDefault();
      const row = e.target.closest('.code-mgmt__row');
      clearDragLines(pageEl);
      if (!row) return;
      const list = listOf(depth);
      if (!list) return;
      const targetId = row.dataset.id;
      if (targetId === STATE.drag.id) return;
      const fromIdx = list.findIndex(x => x.id === STATE.drag.id);
      if (fromIdx < 0) return;
      const rect = row.getBoundingClientRect();
      const insertAfter = e.clientY >= rect.top + rect.height / 2;
      const [moved] = list.splice(fromIdx, 1);
      const toIdx = list.findIndex(x => x.id === targetId);
      list.splice(insertAfter ? toIdx + 1 : toIdx, 0, moved);
      renderColumn(pageEl, depth);
    });
  }

  function bind(pageEl) {
    pageEl.innerHTML = html();
    pageEl.addEventListener('click', e => {
      const editBtn = e.target.closest('[data-att-edit]');
      if (editBtn) { e.stopPropagation(); openModal(Number(editBtn.dataset.depth), editBtn.dataset.id); return; }
      const addBtn = e.target.closest('[data-att-add]');
      if (addBtn && !addBtn.disabled) { openModal(Number(addBtn.dataset.attAdd), null); return; }
      /* 행 클릭 — 1·2차는 선택(하위 로드), 3차는 수정 */
      const row = e.target.closest('.code-mgmt__row');
      if (row && !e.target.closest('button')) {
        const depth = Number(row.dataset.depth);
        if (depth === 1) { STATE.selectedD1 = D1.find(x => x.id === row.dataset.id) || null; STATE.selectedD2 = null; renderAll(pageEl); }
        else if (depth === 2) { STATE.selectedD2 = (listOf(2) || []).find(x => x.id === row.dataset.id) || null; renderAll(pageEl); }
        else openModal(3, row.dataset.id);
      }
    });
    [2, 3].forEach(d => {
      const body = pageEl.querySelector(`[data-att-body="${d}"]`);
      if (body) bindBodyDnD(pageEl, body, d);
    });
    buildModal();
  }

  function initPage() {
    const pageEl = document.getElementById('page-att-code');
    if (!pageEl) return;
    pageEl.__onShow = () => {
      if (!pageEl.dataset.attInited) { pageEl.dataset.attInited = '1'; bind(pageEl); }
      renderAll(pageEl);
    };
  }

  /* 공개 — 근태/휴가 신청 사유 선택지로 참조 (데모). 사용(Y) 소분류만, 중분류명 group 으로.
     hol 은 deduct(연차 차감 여부) 포함. */
  function flatten(d1id) {
    const out = [];
    (D2[d1id] || []).forEach(g => {
      (D3[g.id] || []).forEach(r => {
        if (r.use !== 'Y') return;
        const item = { code: r.code, group: g.name, label: r.name };
        if (d1id === 'hol') item.deduct = r.deduct === 'Y';
        out.push(item);
      });
    });
    return out;
  }
  App.AttCodes = {
    att: () => flatten('att'),
    hol: () => flatten('hol'),
    /* 코드의 연차 차감 여부 (휴가 코드) — true=차감 / false=미차감 / null=알 수 없음 */
    deducts(code) {
      for (const gid in D3) {
        const r = (D3[gid] || []).find(x => x.code === code);
        if (r) return gid.indexOf('hol-') === 0 ? r.deduct === 'Y' : false;
      }
      return null;
    },
  };

  const prev = App.initPages;
  App.initPages = function () {
    if (typeof prev === 'function') prev();
    initPage();
  };
})();
