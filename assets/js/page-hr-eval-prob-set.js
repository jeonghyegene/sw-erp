/* =========================================================
 * Page: HR > 설정 > 수습 평가 설정
 *
 *  개요
 *   - 수습 평가 화면(page-hr-eval-prob) 에서 사용되는 「직책자용 / 비직책자용」 두 양식을
 *     이 화면에서 직접 수정하고 라이트 버전 관리.
 *   - 회차/유형/요소 마스터와는 완전히 분리된 별도 시스템 (page-hr-eval-prob 가 양식 단일 소스).
 *
 *  View
 *   - 좌우 분할 없이 단일 페이지. 상단 탭으로 직책자용 / 비직책자용 전환.
 *   - 헤더(이름·설명·버전 메타) + 섹션 카드들(섹션명 + 문항 리스트) + 변경 사유 + 저장 액션
 *   - 우측 사이드 패널: 버전 히스토리 목록
 *
 *  데이터
 *   - App.HRProbEval.getTemplates() / .getTemplate(key) / .saveTemplate(key, draft, reason)
 *
 *  UI Kit 재사용
 *   .btn-toggle (양식 탭) / .form-field / .input / .pill / .acc (버전 히스토리)
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  /* ============ STATE ============ */
  const STATE = {
    topTab: 'stage',           // 'stage' (평가 단계 설정) | 'form' (양식 설정)
    activeKey: 'leader',       // 'leader' | 'staff' — 양식 설정 탭 내부 토글
    draft: null,               // 작업 중 폼 상태 — { name, description, scale, sections }
    dirty: false,
    stageDraft: null,          // 차수 설정 작업 상태 — { stages: [{criterion,value,weight}] }
    stageDirty: false,
    stageMeta: null,           // { version, updatedAt, updatedBy, history: [...] }
  };

  /* ============ Helpers ============ */
  function $(s, r = document) { return r.querySelector(s); }
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function uid(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
  }
  /* 표시 전용 — 'YYYY-MM-DD' → 'YY/MM/DD' (SWADPIA §1). 데이터 원본은 ISO 유지. */
  function fmtD(s) { if (!s) return s; const p = String(s).slice(0, 10).split('-'); return p.length < 3 ? s : `${p[0].slice(2)}/${p[1]}/${p[2]}`; }
  function getApi() {
    return (window.App && App.HRProbEval) ? App.HRProbEval : null;
  }

  /* 척도 옵션 — 평가요소 설정(page-hr-eval-element) 의 SCALES 와 동일 옵션 체계 */
  const SCALES = [
    { value: 3, label: '3점 척도', hint: '낮음 / 보통 / 높음' },
    { value: 5, label: '5점 척도', hint: '매우 미흡 ~ 매우 우수 (권장)' },
    { value: 7, label: '7점 척도', hint: '7단계 정밀 평가' },
  ];

  function defaultScaleLabels(n) {
    const api = getApi();
    if (api && typeof api.defaultScaleLabels === 'function') return api.defaultScaleLabels(n);
    return [];
  }

  /* draft.scaleLabels 정규화 — { 3:[..3], 5:[..5], 7:[..7] } 모든 척도에 대해 채워 둠 */
  function normalizeScaleLabels(d) {
    if (!d.scaleLabels || typeof d.scaleLabels !== 'object') d.scaleLabels = {};
    [3, 5, 7].forEach(n => {
      const arr = d.scaleLabels[n];
      if (!Array.isArray(arr) || arr.length !== n) {
        d.scaleLabels[n] = defaultScaleLabels(n);
      }
    });
  }

  /* 깊은 복사 — 양식 객체를 STATE.draft 로 옮길 때 원본 보호 */
  function cloneTemplate(t) {
    if (!t) return null;
    const cloned = {
      key: t.key,
      name: t.name || '',
      description: t.description || '',
      scale: t.scale || 5,
      scaleLabels: {},
      sections: (t.sections || []).map(sec => ({
        name: sec.name || '',
        items: (sec.items || []).map(it => ({ id: it.id, text: it.text || '' })),
      })),
      version: t.version,
      updatedAt: t.updatedAt,
      updatedBy: t.updatedBy,
      versionHistory: (t.versionHistory || []).slice(),
    };
    /* scaleLabels — 척도별 명칭 카피. 누락된 척도는 normalizeScaleLabels 에서 기본값으로 채움. */
    if (t.scaleLabels && typeof t.scaleLabels === 'object') {
      [3, 5, 7].forEach(n => {
        if (Array.isArray(t.scaleLabels[n])) cloned.scaleLabels[n] = t.scaleLabels[n].slice();
      });
    }
    normalizeScaleLabels(cloned);
    return cloned;
  }

  /* ============ 진입 — draft 초기화 ============ */
  function loadDraft() {
    const api = getApi();
    if (!api) return;
    const t = api.getTemplate(STATE.activeKey);
    STATE.draft = cloneTemplate(t);
    STATE.dirty = false;
  }
  function loadStageDraft() {
    const api = getApi();
    if (!api || typeof api.getStageConfig !== 'function') { STATE.stageDraft = { stages: [] }; return; }
    const cfg = api.getStageConfig();
    STATE.stageDraft = { stages: (cfg.stages || []).map(s => ({ criterion: s.criterion, value: s.value, weight: Number(s.weight) || 0 })) };
    STATE.stageMeta = { version: cfg.version, updatedAt: cfg.updatedAt, updatedBy: cfg.updatedBy, history: (cfg.history || []).slice() };
    STATE.stageDirty = false;
  }
  function stageWeightSum() {
    return ((STATE.stageDraft && STATE.stageDraft.stages) || []).reduce((a, s) => a + (Number(s.weight) || 0), 0);
  }
  function maxStages() {
    const api = getApi();
    return (api && typeof api.maxStages === 'function') ? api.maxStages() : 3;
  }
  function criterionValueOptions(criterion) {
    const api = getApi();
    if (api && typeof api.criterionValues === 'function') return api.criterionValues(criterion);
    return [];
  }
  function stageCriteriaList() {
    const api = getApi();
    if (api && typeof api.stageCriteria === 'function') return api.stageCriteria();
    return [{ key: 'role', label: '직책' }, { key: 'position', label: '직위' }];
  }
  function stageCritLabel(k) {
    const api = getApi();
    if (api && typeof api.criterionLabel === 'function') return api.criterionLabel(k);
    return k === 'position' ? '직위' : '직책';
  }

  /* ============ 공통 — 변경 이력 테이블 ============
     평가 단계 설정 / 양식 설정 두 탭이 동일 레이아웃으로 사용. rows: [{v, publishedAt, publisher, changeReason}] */
  function renderHistoryTable(title, rows, currentVer) {
    const list = (rows || []).slice().reverse();   // 최신이 위
    const bodyRows = list.length
      ? list.map((h, i) => {
          const no = list.length - i;   // No 내림차순 (도메인 표준)
          const isCur = h.v && h.v === currentVer;
          return `
            <tr>
              <td style="text-align:center;color:var(--color-text-sub);">${no}</td>
              <td style="text-align:center;white-space:nowrap;">${esc(h.v || '-')}${isCur ? ' <span class="pill pill--info" style="font-size:var(--fs-xs);">현재</span>' : ''}</td>
              <td>${esc(h.changeReason || '-')}</td>
              <td style="text-align:center;white-space:nowrap;">${esc(h.publisher || '-')}</td>
              <td style="text-align:center;white-space:nowrap;">${esc(fmtD(h.publishedAt) || '-')}</td>
            </tr>`;
        }).join('')
      : `<tr><td colspan="5" style="text-align:center;color:var(--color-text-muted);padding:24px 0;">변경 이력이 없습니다.</td></tr>`;
    return `
      <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden;margin-top:16px;">
        <header style="padding:12px 16px;border-bottom:1px solid var(--color-divider);">
          <strong style="font-size:var(--fs-md);color:var(--color-text);">${esc(title)}</strong>
        </header>
        <table class="tbl tbl--bordered" style="width:100%;">
          <thead>
            <tr>
              <th style="width:48px;text-align:center;">No</th>
              <th style="width:110px;text-align:center;">버전</th>
              <th>변경 사유</th>
              <th style="width:110px;text-align:center;">변경자</th>
              <th style="width:130px;text-align:center;">변경일시</th>
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </section>
    `;
  }

  /* ============ 공통 — 수정 사유 입력 모달 ============
     저장 시 사유를 입력받아 적용 → 변경 이력 누적. onConfirm(reason) 콜백 호출. */
  function openReasonModal(opts) {
    const o = opts || {};
    let host = document.getElementById('pset-reason-modal');
    if (!host) {
      host = document.createElement('div');
      host.id = 'pset-reason-modal';
      host.className = 'modal-backdrop';
      document.body.appendChild(host);
    }
    host.innerHTML = `
      <div class="modal" style="max-width:520px;">
        <div class="modal__header">
          <div class="modal__title">${esc(o.title || '수정 사유 입력')}</div>
          <button class="modal__close" type="button" data-reason-x aria-label="닫기">✕</button>
        </div>
        <div class="modal__body" style="background:var(--color-surface);padding:18px 20px;">
          <div class="form-field" style="margin-bottom:0;">
            <label class="form-label is-required">수정 사유</label>
            <textarea class="input input--full" rows="4" data-reason-input placeholder="${esc(o.placeholder || '변경 내용을 간단히 작성해주세요.')}"></textarea>
            <div class="field-error" data-reason-err style="display:none;margin-top:6px;">수정 사유를 입력해주세요.</div>
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn" type="button" data-reason-x>취소</button>
          <button class="btn btn--primary" type="button" data-reason-ok>저장</button>
        </div>
      </div>
    `;
    host.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    const close = () => { host.classList.remove('is-open'); document.body.style.overflow = ''; };
    host.onclick = (e) => { if (e.target === host) close(); };
    host.querySelectorAll('[data-reason-x]').forEach(b => b.addEventListener('click', close));
    const input = host.querySelector('[data-reason-input]');
    const errEl = host.querySelector('[data-reason-err]');
    host.querySelector('[data-reason-ok]').addEventListener('click', () => {
      const val = (input.value || '').trim();
      if (!val) {
        if (errEl) errEl.style.display = '';
        input.classList.add('is-invalid');
        input.focus();
        return;
      }
      close();
      if (typeof o.onConfirm === 'function') o.onConfirm(val);
    });
    if (input) {
      input.addEventListener('input', () => {
        input.classList.remove('is-invalid');
        if (errEl) errEl.style.display = 'none';
      });
      input.focus();
    }
  }

  /* ============ 렌더 ============ */
  function render(pageEl) {
    if (!STATE.stageDraft) loadStageDraft();
    if (!STATE.draft) loadDraft();

    /* 상단 탭 — 근태 설정(att-page__head + att-applist-tabs) 과 동일. 제목 없음. */
    const topBtn = (key, label) => `
      <button type="button" class="att-applist-tab ${STATE.topTab === key ? 'is-active' : ''}" data-pset-toptab="${esc(key)}">${esc(label)}</button>
    `;
    const header = `
      <header class="att-page__head">
        <div style="padding:16px 20px 14px;">
          <div class="att-applist-tabs" data-pset-toptab-host style="margin-bottom:0;">
            ${topBtn('stage', '평가 단계 설정')}
            ${topBtn('form',  '양식 설정')}
          </div>
        </div>
      </header>
    `;

    pageEl.innerHTML = header + (STATE.topTab === 'stage' ? renderStageView() : renderFormView(STATE.draft));
    bind(pageEl);
  }

  /* ── 양식 설정 탭 — 기존 양식 편집 UI (직책자용/비직책자용 토글 포함) ── */
  function renderFormView(d) {
    if (!d) {
      return `<div style="padding:32px;color:var(--color-text-muted);">수습 평가 모듈을 불러올 수 없습니다.</div>`;
    }
    const tabBtn = (key, label) => `
      <button class="btn btn--sm ${STATE.activeKey === key ? 'is-active' : ''}" type="button" data-pset-tab="${esc(key)}">${esc(label)}</button>
    `;
    return `
      <div style="flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:12px 24px;background:var(--color-surface);border-bottom:1px solid var(--color-divider);display:flex;align-items:center;gap:10px;">
          <span style="font-size:var(--fs-sm);color:var(--color-text-sub);font-weight:var(--fw-medium);">양식 종류</span>
          <div class="btn-toggle" data-pset-tab-host>
            ${tabBtn('staff',  '비직책자용')}
            ${tabBtn('leader', '직책자용')}
          </div>
          <span style="flex:1;"></span>
          <span style="font-size:var(--fs-xs);color:var(--color-text-muted);">현재 버전</span>
          <span class="pill" style="background:rgba(0,52,125,.08);color:var(--color-brand-primary);border:1px solid rgba(0,52,125,.2);font-size:var(--fs-xs);">${esc(d.version || '-')}</span>
          <small style="color:var(--color-text-muted);font-size:var(--fs-xs);">최종 수정 ${esc(fmtD(d.updatedAt) || '-')} · ${esc(d.updatedBy || '-')}</small>
        </div>

        <div style="flex:1;min-height:0;overflow-y:auto;padding:20px 24px 80px;background:var(--color-surface-alt);">
          <div data-pset-main>
            ${renderMain(d)}
          </div>
          ${renderHistoryTable('양식 변경 이력', d.versionHistory, d.version)}
        </div>

        <!-- 하단 액션 바 -->
        <div style="background:var(--color-surface);border-top:1px solid var(--color-divider);padding:12px 24px;display:flex;align-items:center;gap:12px;">
          <small style="color:var(--color-text-muted);" data-pset-dirty>${STATE.dirty ? '변경 사항 있음 — 저장 시 수정 사유 입력 후 새 버전이 생성됩니다.' : ''}</small>
          <span style="flex:1;"></span>
          <button class="btn" type="button" data-pset-reset>되돌리기</button>
          <button class="btn btn--primary" type="button" data-pset-save ${STATE.dirty ? '' : 'disabled'}>저장</button>
        </div>
      </div>
    `;
  }

  /* ── 평가 단계 설정 탭 — 평가유형 등록(평가 프로세스)과 동일 레이아웃 ──
     · 흰 카드 + surface-alt 헤더(플로우 칩) + 140px 라벨 그리드
     · 차수 행: 차수 배지 + 진행자 기준(직책/직위) + 값 셀렉트 + 비중(%) + 단계 삭제 */
  function renderStageView() {
    const draft = STATE.stageDraft || { stages: [] };
    const stages = draft.stages || [];
    const max = maxStages();
    const sum = stageWeightSum();
    const sumOk = sum === 100;
    const critList = stageCriteriaList();

    /* 헤더 플로우 칩 — 1차: 팀장(30%) → 2차: 본부장(70%) → 확정 */
    const flowChips = stages
      .map((s, i) => `${i + 1}차: ${esc(s.value || stageCritLabel(s.criterion))} (${Number(s.weight) || 0}%)`)
      .concat(['확정'])
      .map((label, i, arr) => `
        <span style="display:inline-flex;align-items:center;gap:4px;">
          <span style="padding:2px 8px;border-radius:var(--radius-pill);background:var(--color-surface);border:1px solid var(--color-border);font-size:var(--fs-xs);color:var(--color-text-sub);">${label}</span>
          ${i < arr.length - 1 ? '<span style="color:var(--color-text-muted);">→</span>' : ''}
        </span>
      `).join('');

    /* 차수 행 — 평가유형 등록의 평가자 단계 행과 동일 톤 (배지 + 셀렉트 + 비중 + 삭제) */
    const stagesHTML = stages.map((s, i) => {
      const isLast = (i === stages.length - 1);
      const critOpts = critList.map(c =>
        `<option value="${esc(c.key)}" ${s.criterion === c.key ? 'selected' : ''}>${esc(c.label)}</option>`).join('');
      const valOpts = criterionValueOptions(s.criterion).map(v =>
        `<option value="${esc(v)}" ${s.value === v ? 'selected' : ''}>${esc(v)}</option>`).join('');
      return `
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:var(--color-active);color:var(--color-brand-primary);font-size:var(--fs-xs);font-weight:var(--fw-semibold);">${i + 1}</span>
          <select class="select" data-pset-stage-crit-sel="${i}" style="width:88px;">${critOpts}</select>
          <select class="select" data-pset-stage-value="${i}" style="flex:1;max-width:200px;">${valOpts}</select>
          <span style="display:inline-flex;align-items:center;gap:5px;font-size:var(--fs-sm);color:var(--color-text-sub);">
            비중
            <input type="number" min="0" max="100" class="input" data-pset-stage-weight="${i}" value="${Number(s.weight) || 0}" style="width:68px;text-align:right;" />
            <span style="color:var(--color-text-muted);">%</span>
          </span>
          ${(isLast && stages.length > 1)
            ? `<button class="btn btn--xs btn--soft-danger" type="button" data-pset-stage-del="${i}">− 단계 삭제</button>`
            : ''}
        </div>
      `;
    }).join('');

    const weightTotalHTML = `<div data-pset-stage-weight-total style="margin-top:10px;font-size:var(--fs-sm);font-weight:var(--fw-medium);color:var(--color-text-sub);">
      평가 비율 합계: <strong data-pset-stage-weight-val style="color:${sumOk ? 'var(--color-success)' : 'var(--color-danger)'};">${sum}%</strong>
      <small style="color:var(--color-text-muted);">/ 100%</small>
      <small style="margin-left:6px;color:var(--color-text-muted);">예) 1차 30% · 2차 70%</small>
    </div>`;

    const addBtn = (stages.length < max)
      ? `<button class="btn btn--sm" type="button" data-pset-stage-add style="margin-top:10px;">+ 평가 단계 추가</button>`
      : `<div style="margin-top:10px;"><small style="color:var(--color-text-muted);font-size:var(--fs-xs);">최대 ${max}단계까지 추가할 수 있습니다.</small></div>`;

    return `
      <div style="flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;background:var(--color-surface-alt);">
        <div style="flex:1;min-height:0;overflow-y:auto;padding:20px 24px 80px;">
          <div style="border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden;background:var(--color-surface);">
            <header style="padding:10px 16px;background:var(--color-surface-alt);border-bottom:1px solid var(--color-border);display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
              <strong style="font-size:var(--fs-md);">평가 단계</strong>
              <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">${flowChips}</div>
            </header>
            <div style="padding:16px 20px;display:grid;grid-template-columns:140px 1fr;gap:16px 20px;align-items:start;">
              <label class="form-label" style="margin:0;padding-top:6px;">평가 단계</label>
              <div>
                <div style="display:flex;flex-direction:column;gap:8px;">${stagesHTML}</div>
                ${weightTotalHTML}
                ${addBtn}
                <div class="form-help" style="display:flex;align-items:flex-start;gap:6px;margin-top:12px;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;color:var(--color-info);"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                  <span>수습직원의 입사일을 기준으로 1개월마다 각 차수 진행자에게 평가 진행 알림이 발송됩니다.</span>
                </div>
              </div>
            </div>
          </div>

          ${renderHistoryTable('평가 단계 설정 변경 이력', (STATE.stageMeta && STATE.stageMeta.history) || [], STATE.stageMeta && STATE.stageMeta.version)}

          <!-- 변경 적용 기준 안내 (변경 이력 하단 · 회색 보조 문구) -->
          <div style="margin-top:10px;font-size:var(--fs-sm);color:var(--color-text-muted);line-height:1.6;">
            변경 사항은 변경일시 이후 '평가 가능' 상태로 전환되는 수습 직원부터 적용됩니다.<br>
            이미 평가 가능 상태로 전환된 직원, 평가 진행 중인 직원, 평가 완료된 직원은 변경 전 버전을 유지합니다.
          </div>
        </div>

        <!-- 하단 액션 바 -->
        <div style="background:var(--color-surface);border-top:1px solid var(--color-divider);padding:12px 24px;display:flex;align-items:center;gap:12px;">
          <small style="color:var(--color-text-muted);" data-pset-stage-dirty>${STATE.stageDirty ? '변경 사항 있음' : ''}</small>
          <span style="flex:1;"></span>
          <button class="btn" type="button" data-pset-stage-reset>되돌리기</button>
          <button class="btn btn--primary" type="button" data-pset-stage-save>저장</button>
        </div>
      </div>
    `;
  }

  /* 척도 + 척도별 명칭 패널 — 평가요소 설정(역량) 패턴과 동일 구조 */
  function renderScalePanel(d) {
    normalizeScaleLabels(d);
    const scaleRadios = SCALES.map(s => `
      <label class="cb cb--pill" style="padding:6px 16px;font-size:var(--fs-sm);">
        <input type="radio" name="pset-scale" value="${s.value}" ${d.scale === s.value ? 'checked' : ''} />
        <span>${esc(s.label)}</span>
      </label>
    `).join('');
    const labels = d.scaleLabels[d.scale] || [];
    const defaults = defaultScaleLabels(d.scale);
    const labelRows = labels.map((lab, i) => `
      <tr>
        <td style="text-align:center;color:var(--color-text-sub);">${i + 1}점</td>
        <td>
          <input type="text" class="input" data-pset-scale-label="${i}" value="${esc(lab)}" placeholder="${esc(defaults[i] || '')}" style="width:100%;" />
        </td>
      </tr>
    `).join('');
    const fieldLabel = (text, hint) => `
      <div style="margin-bottom:8px;">
        <span style="font-size:var(--fs-sm);color:var(--color-text-sub);font-weight:var(--fw-medium);">${esc(text)}</span>
        ${hint ? `<small style="margin-left:8px;color:var(--color-text-muted);font-size:var(--fs-xs);">${esc(hint)}</small>` : ''}
      </div>
    `;
    return `
      <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:18px 22px;margin-bottom:14px;">
        <header style="margin-bottom:14px;">
          <strong style="font-size:var(--fs-md);color:var(--color-text);">척도 설정</strong>
          <small style="margin-left:8px;color:var(--color-text-muted);font-size:var(--fs-xs);">평가자가 각 문항을 척도 단계로 평가합니다.</small>
        </header>
        <div style="margin-bottom:18px;">
          ${fieldLabel('척도')}
          <div style="display:flex;gap:6px;flex-wrap:wrap;">${scaleRadios}</div>
        </div>
        <div style="margin-bottom:0;">
          ${fieldLabel('척도별 명칭', '각 단계의 평가 명칭을 직접 지정합니다.')}
          <table class="tbl tbl--bordered" data-pset-scale-labels style="width:auto;max-width:420px;">
            <thead>
              <tr>
                <th style="width:80px;text-align:center;">단계</th>
                <th>명칭</th>
              </tr>
            </thead>
            <tbody>${labelRows}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderMain(d) {
    const sectionsHTML = (d.sections || []).map((sec, sIdx) => `
      <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:18px 22px;margin-bottom:14px;" data-pset-section="${sIdx}">
        <header style="display:flex;align-items:center;gap:10px;padding-bottom:12px;margin-bottom:12px;border-bottom:1px solid var(--color-divider);">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:var(--radius-sm);background:var(--color-brand-primary);color:#fff;font-size:var(--fs-xs);font-weight:var(--fw-bold);">${sIdx + 1}</span>
          <input class="input" type="text" data-pset-section-name value="${esc(sec.name || '')}" placeholder="섹션명 (예: 직무 역량)" style="flex:1;" />
          <button class="btn btn--sm" type="button" data-pset-section-remove title="섹션 삭제">삭제</button>
        </header>
        <div style="display:flex;flex-direction:column;gap:8px;" data-pset-items>
          ${(sec.items || []).map((it, iIdx) => `
            <div style="display:flex;align-items:center;gap:8px;" data-pset-item="${iIdx}">
              <span style="font-size:var(--fs-xs);color:var(--color-brand-primary);font-weight:var(--fw-semibold);min-width:46px;">Q${sIdx + 1}-${iIdx + 1}</span>
              <input class="input" type="text" data-pset-item-text value="${esc(it.text || '')}" placeholder="문항 텍스트" style="flex:1;" />
              <button class="btn btn--xs" type="button" data-pset-item-remove title="문항 삭제">✕</button>
            </div>
          `).join('')}
        </div>
        <div style="margin-top:10px;">
          <button class="btn btn--sm" type="button" data-pset-item-add>+ 문항 추가</button>
        </div>
      </section>
    `).join('');

    return `
      <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:18px 22px;margin-bottom:14px;">
        <div style="display:grid;grid-template-columns:1fr;gap:14px;">
          <div class="form-field" style="margin-bottom:0;">
            <label class="form-label">양식명</label>
            <input class="input input--full" type="text" data-pset-name value="${esc(d.name)}" />
          </div>
          <div class="form-field" style="margin-bottom:0;">
            <label class="form-label">설명</label>
            <input class="input input--full" type="text" data-pset-description value="${esc(d.description)}" placeholder="간단한 설명" />
          </div>
        </div>
      </section>

      ${renderScalePanel(d)}

      ${sectionsHTML || '<div style="padding:24px;text-align:center;color:var(--color-text-muted);background:var(--color-surface);border:1px dashed var(--color-border);border-radius:var(--radius-md);">섹션이 없습니다. 아래 버튼으로 추가하세요.</div>'}

      <div style="margin-top:6px;">
        <button class="btn" type="button" data-pset-section-add>+ 섹션 추가</button>
      </div>
    `;
  }

  /* ============ 이벤트 바인딩 ============ */
  function bind(pageEl) {
    const main = pageEl.querySelector('[data-pset-main]');

    /* 최상위 탭 — 평가 단계 설정 / 양식 설정 전환 */
    const topTabHost = pageEl.querySelector('[data-pset-toptab-host]');
    if (topTabHost) topTabHost.addEventListener('click', e => {
      const btn = e.target.closest('[data-pset-toptab]');
      if (!btn) return;
      const key = btn.dataset.psetToptab;
      if (key === STATE.topTab) return;
      /* 편집 중 내용 보호 — 떠나려는 탭에 미저장 변경이 있으면 확인 */
      const leavingDirty = (STATE.topTab === 'form' && STATE.dirty) || (STATE.topTab === 'stage' && STATE.stageDirty);
      if (leavingDirty && !confirm('편집 중인 내용이 있습니다. 탭을 전환하면 변경 사항이 사라집니다. 계속하시겠습니까?')) return;
      STATE.topTab = key;
      if (key === 'form') loadDraft(); else loadStageDraft();
      render(pageEl);
    });

    /* 평가 단계 설정 탭 바인딩 */
    if (STATE.topTab === 'stage') bindStageView(pageEl);

    /* 탭 — 직책자/비직책자 전환 */
    const tabHost = pageEl.querySelector('[data-pset-tab-host]');
    if (tabHost) tabHost.addEventListener('click', e => {
      const btn = e.target.closest('[data-pset-tab]');
      if (!btn) return;
      const key = btn.dataset.psetTab;
      if (key === STATE.activeKey) return;
      if (STATE.dirty && !confirm('편집 중인 내용이 있습니다. 양식을 전환하면 변경 사항이 사라집니다. 계속하시겠습니까?')) return;
      STATE.activeKey = key;
      loadDraft();
      render(pageEl);
    });

    /* 메인 폼 — 헤더 필드 */
    const nameEl = pageEl.querySelector('[data-pset-name]');
    if (nameEl) nameEl.addEventListener('input', () => { STATE.draft.name = nameEl.value; markDirty(pageEl); });
    const descEl = pageEl.querySelector('[data-pset-description]');
    if (descEl) descEl.addEventListener('input', () => { STATE.draft.description = descEl.value; markDirty(pageEl); });

    /* 척도 라디오 — 변경 시 척도별 명칭 테이블 다시 그림 (현재 척도에 매핑된 명칭만 노출) */
    pageEl.querySelectorAll('input[name="pset-scale"]').forEach(r => r.addEventListener('change', () => {
      if (!r.checked) return;
      STATE.draft.scale = Number(r.value);
      normalizeScaleLabels(STATE.draft);
      rerenderMain(pageEl);
      markDirty(pageEl);
    }));
    /* 척도별 명칭 — 입력 즉시 draft 반영 (재렌더 없이 surgical update) */
    pageEl.querySelectorAll('[data-pset-scale-label]').forEach(inp => inp.addEventListener('input', () => {
      const i = Number(inp.dataset.psetScaleLabel);
      normalizeScaleLabels(STATE.draft);
      STATE.draft.scaleLabels[STATE.draft.scale][i] = inp.value;
      markDirty(pageEl);
    }));

    /* 섹션/문항 변경 — input 이벤트 위임 */
    if (main) {
      main.addEventListener('input', e => {
        if (e.target.matches('[data-pset-section-name]')) {
          const sec = e.target.closest('[data-pset-section]');
          const sIdx = Number(sec.dataset.psetSection);
          STATE.draft.sections[sIdx].name = e.target.value;
          markDirty(pageEl);
        } else if (e.target.matches('[data-pset-item-text]')) {
          const sec = e.target.closest('[data-pset-section]');
          const item = e.target.closest('[data-pset-item]');
          const sIdx = Number(sec.dataset.psetSection);
          const iIdx = Number(item.dataset.psetItem);
          STATE.draft.sections[sIdx].items[iIdx].text = e.target.value;
          markDirty(pageEl);
        }
      });
      /* 클릭 — 추가/삭제 액션 */
      main.addEventListener('click', e => {
        const sec = e.target.closest('[data-pset-section]');
        const sIdx = sec ? Number(sec.dataset.psetSection) : -1;
        if (e.target.closest('[data-pset-item-add]')) {
          STATE.draft.sections[sIdx].items.push({ id: uid('it'), text: '' });
          markDirty(pageEl); rerenderMain(pageEl);
          return;
        }
        if (e.target.closest('[data-pset-item-remove]')) {
          const item = e.target.closest('[data-pset-item]');
          const iIdx = Number(item.dataset.psetItem);
          STATE.draft.sections[sIdx].items.splice(iIdx, 1);
          markDirty(pageEl); rerenderMain(pageEl);
          return;
        }
        if (e.target.closest('[data-pset-section-remove]')) {
          if (!confirm('이 섹션과 하위 문항을 모두 삭제하시겠습니까?')) return;
          STATE.draft.sections.splice(sIdx, 1);
          markDirty(pageEl); rerenderMain(pageEl);
          return;
        }
        if (e.target.closest('[data-pset-section-add]')) {
          STATE.draft.sections.push({ name: '새 섹션', items: [{ id: uid('it'), text: '' }] });
          markDirty(pageEl); rerenderMain(pageEl);
          return;
        }
      });
    }

    /* 저장 / 되돌리기 */
    const saveBtn = pageEl.querySelector('[data-pset-save]');
    if (saveBtn) saveBtn.addEventListener('click', () => {
      if (!STATE.dirty) return;
      /* 빈 섹션·문항 방어 */
      const cleaned = STATE.draft.sections
        .map(sec => ({
          name: (sec.name || '').trim() || '섹션',
          items: (sec.items || []).filter(it => (it.text || '').trim()).map(it => ({ id: it.id, text: it.text.trim() })),
        }))
        .filter(sec => sec.items.length > 0);
      if (!cleaned.length) { alert('최소 1개 이상의 섹션·문항이 필요합니다.'); return; }
      const api = getApi();
      if (!api) return;
      /* 수정 사유 모달 입력 후 적용 → 변경 이력 누적 */
      openReasonModal({
        title: '양식 수정 사유',
        placeholder: '이번 수정에서 무엇이 바뀌었는지 작성해주세요. (예: 문항 추가, 척도 변경)',
        onConfirm(reason) {
          api.saveTemplate(STATE.activeKey, {
            name: (STATE.draft.name || '').trim(),
            description: (STATE.draft.description || '').trim(),
            scale: STATE.draft.scale,
            scaleLabels: STATE.draft.scaleLabels,
            sections: cleaned,
          }, reason);
          window.toast && window.toast('수정되었습니다. 변경 이력에 반영됩니다.', 'success');
          loadDraft();
          render(pageEl);
        },
      });
    });
    const resetBtn = pageEl.querySelector('[data-pset-reset]');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      if (!STATE.dirty) return;
      if (!confirm('편집 내용을 되돌립니다. 계속하시겠습니까?')) return;
      loadDraft();
      render(pageEl);
    });
  }

  function rerenderMain(pageEl) {
    const main = pageEl.querySelector('[data-pset-main]');
    if (main) main.innerHTML = renderMain(STATE.draft);
  }
  function markDirty(pageEl) {
    STATE.dirty = true;
    const sm = pageEl.querySelector('[data-pset-dirty]');
    if (sm) sm.textContent = '변경 사항 있음 — 저장 시 새 버전이 생성됩니다.';
    const sb = pageEl.querySelector('[data-pset-save]');
    if (sb) sb.disabled = false;
  }

  /* ============ 평가 단계 설정 탭 바인딩 ============ */
  function markStageDirty(pageEl) {
    STATE.stageDirty = true;
    const sm = pageEl.querySelector('[data-pset-stage-dirty]');
    if (sm) sm.textContent = '변경 사항 있음';
  }
  /* 비율 합계 배지만 surgical 갱신 — 입력 중 포커스 유지 */
  function updateStageWeightBadge(pageEl) {
    const sum = stageWeightSum();
    const ok = sum === 100;
    const val = pageEl.querySelector('[data-pset-stage-weight-val]');
    if (val) {
      val.textContent = `${sum}%`;
      val.style.color = ok ? 'var(--color-success)' : 'var(--color-danger)';
    }
  }
  function rerenderStageView(pageEl) {
    /* 단계 추가/삭제/기준 변경 시 차수 영역만 다시 그림 (탭 헤더는 유지) */
    render(pageEl);
  }
  function bindStageView(pageEl) {
    const draft = STATE.stageDraft;
    if (!draft) return;
    const stages = draft.stages || [];

    /* 진행자 기준 셀렉트 (직책/직위) — 변경 시 값 셀렉트 옵션이 바뀌므로 첫 값으로 초기화 후 재렌더 */
    pageEl.querySelectorAll('[data-pset-stage-crit-sel]').forEach(sel => sel.addEventListener('change', e => {
      const i = Number(e.target.dataset.psetStageCritSel);
      if (!stages[i]) return;
      stages[i].criterion = e.target.value;
      const opts = criterionValueOptions(e.target.value);
      if (opts.indexOf(stages[i].value) === -1) stages[i].value = opts[0] || '';
      markStageDirty(pageEl);
      rerenderStageView(pageEl);
    }));
    /* 진행자 값 셀렉트 */
    pageEl.querySelectorAll('[data-pset-stage-value]').forEach(sel => sel.addEventListener('change', e => {
      const i = Number(e.target.dataset.psetStageValue);
      if (stages[i]) { stages[i].value = e.target.value; markStageDirty(pageEl); }
    }));
    /* 평가 비율 — 입력 중 합계 배지 surgical 갱신 */
    pageEl.querySelectorAll('[data-pset-stage-weight]').forEach(inp => inp.addEventListener('input', e => {
      const i = Number(e.target.dataset.psetStageWeight);
      let v = Number(e.target.value);
      if (!isFinite(v)) v = 0;
      v = Math.max(0, Math.min(100, v));
      if (stages[i]) { stages[i].weight = v; markStageDirty(pageEl); updateStageWeightBadge(pageEl); }
    }));
    /* 단계 추가 — 최대 max 까지. 신규 단계 비율 0 */
    const addBtn = pageEl.querySelector('[data-pset-stage-add]');
    if (addBtn) addBtn.addEventListener('click', () => {
      if (stages.length >= maxStages()) return;
      const firstCrit = (stageCriteriaList()[0] || { key: 'role' }).key;
      const opts = criterionValueOptions(firstCrit);
      stages.push({ criterion: firstCrit, value: opts[0] || '', weight: 0 });
      markStageDirty(pageEl);
      rerenderStageView(pageEl);
    });
    /* 단계 삭제 — 마지막 단계만(버튼이 마지막에만 노출). 최소 1단계 보장 */
    pageEl.querySelectorAll('[data-pset-stage-del]').forEach(b => b.addEventListener('click', e => {
      const i = Number(e.target.closest('[data-pset-stage-del]').dataset.psetStageDel);
      if (stages.length <= 1) return;
      stages.splice(i, 1);
      markStageDirty(pageEl);
      rerenderStageView(pageEl);
    }));

    /* 저장 — 비율 합계 100% + 값 미선택 단계 없음 검증 */
    const saveBtn = pageEl.querySelector('[data-pset-stage-save]');
    if (saveBtn) saveBtn.addEventListener('click', () => {
      if (!stages.length) { window.toast && window.toast('최소 1개 차수가 필요합니다.', 'warning'); return; }
      if (stages.some(s => !s.value)) {
        window.toast && window.toast('진행자가 지정되지 않은 차수가 있습니다.', 'warning');
        return;
      }
      const sum = stageWeightSum();
      if (sum !== 100) {
        /* 인라인 — 합계 배지 강조(이미 danger) + 안내 토스트 */
        updateStageWeightBadge(pageEl);
        window.toast && window.toast(`평가 비율 합계가 ${sum}% 입니다. 100% 로 맞춰주세요.`, 'warning');
        const val = pageEl.querySelector('[data-pset-stage-weight-val]');
        if (val) val.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      const api = getApi();
      if (!api || typeof api.saveStageConfig !== 'function') return;
      /* 수정 사유 모달 입력 후 적용 → 변경 이력 누적 */
      openReasonModal({
        title: '평가 단계 설정 수정 사유',
        placeholder: '평가 단계 · 비중 변경 사유를 작성해주세요. (예: 2차 평가 도입, 비중 조정)',
        onConfirm(reason) {
          api.saveStageConfig(stages.map(s => ({ criterion: s.criterion, value: s.value, weight: Number(s.weight) || 0 })), reason);
          window.toast && window.toast('평가 단계가 저장되었습니다. 변경 이력에 반영됩니다.', 'success');
          loadStageDraft();
          render(pageEl);
        },
      });
    });
    /* 되돌리기 */
    const resetBtn = pageEl.querySelector('[data-pset-stage-reset]');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      if (!STATE.stageDirty) return;
      if (!confirm('편집 내용을 되돌립니다. 계속하시겠습니까?')) return;
      loadStageDraft();
      render(pageEl);
    });
  }

  /* ============ Page Init ============ */
  function initPage() {
    const pageEl = document.getElementById('page-hr-eval-prob-set');
    if (!pageEl) return;
    pageEl.__onShow = () => {
      /* 매 진입마다 마스터에서 다시 로드 — 외부 화면 변경 시 동기화 */
      loadStageDraft();
      loadDraft();
      render(pageEl);
    };
  }
  const prev = App.initPages;
  App.initPages = function () {
    if (typeof prev === 'function') prev();
    initPage();
  };
})();
