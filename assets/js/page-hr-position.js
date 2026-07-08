/* =========================================================
 * Page: HR > 설정 > 직위·직책 설정
 *
 *   시스템 「코드 관리」 화면(page-code-mgmt) 과 동일한 UI 언어로 구성.
 *     · .code-mgmt-bar (제목 + 집계) + .code-mgmt 컬럼 레이아웃
 *     · 좌: 직위(rank) / 우: 직책(position) — 각 컬럼 = .code-mgmt__col
 *     · 행: 정렬 핸들 · 코드명 · ID · 상태(Y/N) · 수정 / 드래그로 순서 변경
 *     · 등록·수정은 코드 관리와 동일한 .code-field 모달 (코드명/코드ID/사용여부/설명)
 *
 *   ※ Mock — 모듈 내 STATE 배열(순서=표시 순서). 임직원 직위/직책 선택지의 단일 진실원(데모).
 *
 *   UI Kit: .code-mgmt / .code-mgmt__col / .code-mgmt__row / .code-field / .btn-toggle / .modal
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function toast(msg, kind) { (App.flashToast || window.toast || function () {})(msg, kind); }

  /* ============ Mock 마스터 (배열 순서 = 표시 순서) ============ */
  const STATE = {
    rank: [
      { id: 'P01', code: 'P01', name: '대표이사', use: 'Y', desc: '' },
      { id: 'P02', code: 'P02', name: '부대표이사', use: 'Y', desc: '' },
      { id: 'P03', code: 'P03', name: '전무이사', use: 'Y', desc: '' },
      { id: 'P04', code: 'P04', name: '상무이사', use: 'Y', desc: '' },
      { id: 'P05', code: 'P05', name: '부장', use: 'Y', desc: '' },
      { id: 'P06', code: 'P06', name: '차장', use: 'Y', desc: '' },
      { id: 'P07', code: 'P07', name: '과장', use: 'Y', desc: '' },
      { id: 'P08', code: 'P08', name: '대리', use: 'Y', desc: '' },
      { id: 'P09', code: 'P09', name: '주임', use: 'Y', desc: '' },
      { id: 'P10', code: 'P10', name: '사원', use: 'Y', desc: '신입·일반 직원' },
    ],
    position: [
      { id: 'J01', code: 'J01', name: '임원', use: 'Y', desc: '등기·비등기 임원' },
      { id: 'J02', code: 'J02', name: '본부장', use: 'Y', desc: '본부 단위 책임자' },
      { id: 'J03', code: 'J03', name: '소장', use: 'Y', desc: '사업소·공장 책임자' },
      { id: 'J04', code: 'J04', name: '팀장', use: 'Y', desc: '팀 단위 책임자' },
      { id: 'J05', code: 'J05', name: '파트장', use: 'Y', desc: '파트 단위 책임자' },
      { id: 'J06', code: 'J06', name: '팀원', use: 'Y', desc: '팀 실무 담당' },
      { id: 'J07', code: 'J07', name: '파트원', use: 'Y', desc: '파트 실무 담당' },
    ],
    modal: { kind: 'rank', isEdit: false, editId: null },
    drag: { kind: null, id: null, fromIndex: -1 },
  };
  const KIND = {
    rank:     { label: '직위', badge: '위', badgeCls: '1', sub: '호칭·승진 단계 (사원·대리·과장 등)', placeholder: '대리' },
    position: { label: '직책', badge: '책', badgeCls: '2', sub: '조직상 역할 (팀원·팀장·본부장 등)', placeholder: '팀장' },
  };
  const KINDS = ['rank', 'position'];
  function listOf(kind) { return STATE[kind]; }

  /* ============ 렌더 ============ */
  function rowHTML(row, kind) {
    const useCls = row.use === 'Y' ? 'code-mgmt__use--y' : 'code-mgmt__use--n';
    const nameCls = row.use === 'Y' ? '' : ' is-disabled';
    return `
      <div class="code-mgmt__row" draggable="true" data-kind="${esc(kind)}" data-id="${esc(row.id)}">
        <span class="code-mgmt__handle" aria-hidden="true">⋮⋮</span>
        <span class="code-mgmt__name${nameCls}" title="${esc(row.name)}">${esc(row.name)}</span>
        <span class="code-mgmt__code-id">${esc(row.code)}</span>
        <span class="code-mgmt__use ${useCls}">${esc(row.use)}</span>
        <button class="code-mgmt__row-edit" type="button" data-pos-edit data-kind="${esc(kind)}" data-id="${esc(row.id)}" aria-label="수정">✎</button>
      </div>`;
  }
  function renderColumn(pageEl, kind) {
    const body = pageEl.querySelector(`[data-pos-body="${kind}"]`);
    if (!body) return;
    const list = listOf(kind);
    body.innerHTML = list.length
      ? list.map(r => rowHTML(r, kind)).join('')
      : `<div class="code-mgmt__empty"><div class="code-mgmt__empty-icon">＋</div><div class="code-mgmt__empty-text">등록된 ${esc(KIND[kind].label)}가 없습니다</div></div>`;
  }
  function renderAll(pageEl) {
    const meta = pageEl.querySelector('[data-pos-meta]');
    if (meta) {
      meta.textContent = `직위 ${STATE.rank.length} · 직책 ${STATE.position.length} 건`;
    }
    KINDS.forEach(k => renderColumn(pageEl, k));
  }

  function colHTML(kind) {
    const m = KIND[kind];
    return `
      <div class="code-mgmt__col" data-pos-col="${kind}">
        <div class="code-mgmt__col-head">
          <div class="code-mgmt__col-title">
            ${esc(m.label)}
            <span style="color:var(--color-text-muted);font-weight:var(--fw-regular);font-size:var(--fs-xs);">${esc(m.sub)}</span>
          </div>
          <button class="btn btn--xs btn--primary" type="button" data-pos-add="${kind}">＋ 추가</button>
        </div>
        <div class="code-mgmt__col-thead">
          <div aria-label="정렬"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg></div>
          <div>명칭</div>
          <div>ID</div>
          <div>상태</div>
          <div>관리</div>
        </div>
        <div class="code-mgmt__col-body" data-pos-body="${kind}"></div>
      </div>`;
  }
  function html() {
    return `
      <div class="code-mgmt-bar">
        <div class="code-mgmt-bar__title"><strong>직위·직책 설정</strong> <span style="color:var(--color-text-muted);font-size:var(--fs-sm);">· 임직원 직위/직책 선택 항목</span></div>
        <div class="code-mgmt-bar__meta" data-pos-meta></div>
      </div>
      <div class="code-mgmt">
        ${colHTML('rank')}
        ${colHTML('position')}
      </div>`;
  }

  /* ============ 등록/수정 모달 (코드 관리와 동일 구성) ============ */
  let _modal = null;
  function buildModal() {
    if (_modal) return _modal;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="modal-backdrop" data-pos-modal-host>
        <div class="modal" style="max-width:520px;">
          <div class="modal__header">
            <div>
              <div class="modal__title" data-pos-modal-title>직위 등록</div>
              <div style="margin-top:4px;font-size:var(--fs-xs);color:var(--color-text-muted);" data-pos-modal-sub></div>
            </div>
            <button class="modal__close" type="button" data-pos-modal-close aria-label="닫기">✕</button>
          </div>
          <div class="modal__body" style="display:flex;flex-direction:column;gap:18px;">
            <div class="code-field">
              <label class="code-field__label">명칭 <em>*</em></label>
              <div class="code-field__wrap">
                <span class="code-field__lang">한국어</span>
                <input class="input" type="text" data-pos-input-name placeholder="예) 대리">
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
              <div class="code-field">
                <label class="code-field__label">코드 ID <em>*</em></label>
                <input class="input" type="text" data-pos-input-id maxlength="3" style="text-transform:uppercase;" placeholder="영문/숫자 1~3자">
                <p class="code-field__help" data-pos-id-help>영문 대문자+숫자, 1~3자</p>
              </div>
              <div class="code-field">
                <label class="code-field__label">사용 여부</label>
                <div class="btn-toggle btn-toggle--block" data-pos-use-toggle role="tablist" aria-label="사용 여부">
                  <button class="btn btn--sm is-active" type="button" data-pos-use="Y" role="tab" aria-selected="true">사용 (Y)</button>
                  <button class="btn btn--sm" type="button" data-pos-use="N" role="tab" aria-selected="false">미사용 (N)</button>
                </div>
              </div>
            </div>
            <div class="code-field">
              <label class="code-field__label">설명 <span style="color:var(--color-text-muted);font-weight:var(--fw-regular);">(선택)</span></label>
              <textarea class="input" data-pos-input-desc maxlength="200" rows="3" placeholder="항목에 대한 설명을 입력하세요" style="height:84px;min-height:84px;resize:vertical;"></textarea>
              <div style="text-align:right;font-size:var(--fs-xs);color:var(--color-text-muted);margin-top:4px;"><span data-pos-desc-count>0</span> / 200자</div>
            </div>
          </div>
          <div class="modal__footer">
            <button class="btn" type="button" data-pos-modal-close>취소</button>
            <button class="btn btn--primary" type="button" data-pos-modal-save>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;vertical-align:-2px;"><polyline points="20 6 9 17 4 12"/></svg>저장
            </button>
          </div>
        </div>
      </div>`;
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    _modal = document.querySelector('[data-pos-modal-host]');
    _modal.addEventListener('click', e => {
      if (e.target === _modal || e.target.closest('[data-pos-modal-close]')) { closeModal(); return; }
      if (e.target.closest('[data-pos-modal-save]')) { saveFromModal(); return; }
      const useBtn = e.target.closest('[data-pos-use]');
      if (useBtn) {
        _modal.querySelectorAll('[data-pos-use]').forEach(b => {
          const on = b === useBtn;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
      }
    });
    _modal.addEventListener('input', e => {
      const t = e.target;
      if (t.matches('[data-pos-input-id]')) {
        t.value = t.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
        _modal.querySelector('[data-pos-id-help]').classList.remove('is-error');
      } else if (t.matches('[data-pos-input-desc]')) {
        if (t.value.length > 200) t.value = t.value.slice(0, 200);
        _modal.querySelector('[data-pos-desc-count]').textContent = String(t.value.length);
      }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && _modal && _modal.classList.contains('is-open')) closeModal();
    });
    return _modal;
  }
  function openModal(kind, editId) {
    const bd = buildModal();
    const isEdit = !!editId;
    const m = KIND[kind];
    let row = null;
    if (isEdit) { row = listOf(kind).find(x => x.id === editId); if (!row) return; }
    STATE.modal = { kind, isEdit, editId: editId || null };

    bd.querySelector('[data-pos-modal-title]').textContent = `${m.label} ${isEdit ? '수정' : '등록'}`;
    bd.querySelector('[data-pos-modal-sub]').textContent = `직위·직책 설정 · ${m.label}`;
    const nameInp = bd.querySelector('[data-pos-input-name]');
    const idInp   = bd.querySelector('[data-pos-input-id]');
    const descInp = bd.querySelector('[data-pos-input-desc]');
    const descCnt = bd.querySelector('[data-pos-desc-count]');
    const help    = bd.querySelector('[data-pos-id-help]');
    nameInp.value = row ? row.name : '';
    idInp.value   = row ? row.code : '';
    descInp.value = row && row.desc ? row.desc : '';
    descCnt.textContent = String(descInp.value.length);
    idInp.readOnly = isEdit;
    idInp.style.background = isEdit ? 'var(--color-surface-alt)' : '';
    idInp.style.color = isEdit ? 'var(--color-text-muted)' : '';
    help.classList.remove('is-error');
    help.textContent = isEdit ? '등록 후 코드 ID 는 변경할 수 없습니다.' : '영문 대문자+숫자, 1~3자';
    nameInp.placeholder = `예) ${m.placeholder}`;

    const useVal = row ? row.use : 'Y';
    bd.querySelectorAll('[data-pos-use]').forEach(btn => {
      const on = btn.dataset.posUse === useVal;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    bd.classList.add('is-open');
    setTimeout(() => nameInp.focus(), 30);
  }
  function closeModal() { if (_modal) _modal.classList.remove('is-open'); }
  function saveFromModal() {
    const bd = _modal;
    if (!bd) return;
    const { kind, isEdit, editId } = STATE.modal;
    const name = bd.querySelector('[data-pos-input-name]').value.trim();
    const code = bd.querySelector('[data-pos-input-id]').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
    const desc = bd.querySelector('[data-pos-input-desc]').value.trim();
    const useBtn = bd.querySelector('[data-pos-use].is-active');
    const use = useBtn ? useBtn.dataset.posUse : 'Y';

    if (!name) { toast('명칭을 입력해 주세요.', 'warning'); return; }
    if (!code) { toast('코드 ID 를 입력해 주세요.', 'warning'); return; }
    const list = listOf(kind);
    if (!isEdit && list.some(r => r.code === code)) {
      const help = bd.querySelector('[data-pos-id-help]');
      help.textContent = '이미 존재하는 코드 ID 입니다.';
      help.classList.add('is-error');
      return;
    }
    if (isEdit) {
      const row = list.find(r => r.id === editId);
      if (!row) return;
      row.name = name; row.use = use; row.desc = desc;
    } else {
      list.push({ id: code, code, name, use, desc });
    }
    closeModal();
    const pageEl = document.getElementById('page-hr-position');
    if (pageEl) renderAll(pageEl);
    toast(`${KIND[kind].label} 「${name}」 ${isEdit ? '수정' : '등록'}되었습니다.`, 'success');
  }

  /* ============ Drag & Drop (컬럼 내 순서 변경) ============ */
  function clearDragLines(pageEl) {
    pageEl.querySelectorAll('.is-drop-top, .is-drop-bottom').forEach(el => el.classList.remove('is-drop-top', 'is-drop-bottom'));
  }
  function bindBodyDnD(pageEl, bodyEl, kind) {
    bodyEl.addEventListener('dragstart', e => {
      const row = e.target.closest('.code-mgmt__row');
      if (!row) return;
      const id = row.dataset.id;
      STATE.drag = { kind, id, fromIndex: listOf(kind).findIndex(x => x.id === id) };
      row.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', id); } catch (_) {}
    });
    bodyEl.addEventListener('dragend', () => {
      clearDragLines(pageEl);
      bodyEl.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging'));
      STATE.drag = { kind: null, id: null, fromIndex: -1 };
    });
    bodyEl.addEventListener('dragover', e => {
      if (STATE.drag.kind !== kind) return;
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
      if (STATE.drag.kind !== kind) return;
      e.preventDefault();
      const row = e.target.closest('.code-mgmt__row');
      clearDragLines(pageEl);
      if (!row) return;
      const list = listOf(kind);
      const targetId = row.dataset.id;
      if (targetId === STATE.drag.id) return;
      const rect = row.getBoundingClientRect();
      const insertAfter = e.clientY >= rect.top + rect.height / 2;
      const fromIdx = list.findIndex(x => x.id === STATE.drag.id);
      if (fromIdx < 0) return;
      const [moved] = list.splice(fromIdx, 1);
      const toIdx = list.findIndex(x => x.id === targetId);
      list.splice(insertAfter ? toIdx + 1 : toIdx, 0, moved);
      renderColumn(pageEl, kind);
    });
  }

  function bind(pageEl) {
    pageEl.innerHTML = html();
    pageEl.addEventListener('click', e => {
      const editBtn = e.target.closest('[data-pos-edit]');
      if (editBtn) { e.stopPropagation(); openModal(editBtn.dataset.kind, editBtn.dataset.id); return; }
      const addBtn = e.target.closest('[data-pos-add]');
      if (addBtn) { openModal(addBtn.dataset.posAdd, null); return; }
      /* 행 클릭 → 수정 (코드 관리는 선택이지만, 직위/직책은 계층이 없어 행 클릭=수정) */
      const row = e.target.closest('.code-mgmt__row');
      if (row && !e.target.closest('button')) { openModal(row.dataset.kind, row.dataset.id); return; }
    });
    KINDS.forEach(k => {
      const body = pageEl.querySelector(`[data-pos-body="${k}"]`);
      if (body) bindBodyDnD(pageEl, body, k);
    });
    buildModal();
  }

  function initPage() {
    const pageEl = document.getElementById('page-hr-position');
    if (!pageEl) return;
    pageEl.__onShow = () => {
      if (!pageEl.dataset.posInited) { pageEl.dataset.posInited = '1'; bind(pageEl); }
      renderAll(pageEl);
    };
  }

  /* 공개 — 임직원 정보 등에서 직위/직책 선택지로 참조 (데모) */
  App.HRPositions = {
    ranks:     () => STATE.rank.filter(x => x.use === 'Y').map(x => x.name),
    positions: () => STATE.position.filter(x => x.use === 'Y').map(x => x.name),
  };

  const prev = App.initPages;
  App.initPages = function () {
    if (typeof prev === 'function') prev();
    initPage();
  };
})();
