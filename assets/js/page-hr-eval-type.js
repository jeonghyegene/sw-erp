/* =========================================================
 * Page: HR > 역량평가 설정  (2탭: 양식 설정 / 단계·등급 설정)
 *
 *  ※ 피드백 반영 — 평가자 단계·방식·비중을 자유롭게 추가/삭제하던
 *     구조가 과하다 → 「양식」은 문항(척도·분야·항목·배점)만 담당하고,
 *     평가자 단계·등급은 고정 구조의 전역 단일 설정(App.HREvalConfig)으로 분리.
 *
 *  [Tab 1] 양식 설정 (STATE.settingsTab = 'form')
 *   · 목록 View (list)   — 양식명/행 클릭 → 상세, [양식 등록] / 행 더보기(복제·삭제)
 *   · 등록·수정 View     — 단일 화면(위저드 아님): 기본 정보 + 평가 양식(척도·명칭·분야·항목·배점)
 *   · 상세 View          — read-only + 수정 이력/적용 회차 + [PDF 출력](A4)
 *   · 회차 연결(appliedRounds>0) 양식 → 수정·삭제 불가(복제·PDF 만). 미연결 → 수정(사유 모달+이력)·삭제.
 *   · 복제는 항상 가능. App.HREvalType.listForms()/getForm() 로 회차가 소비.
 *
 *  [Tab 2] 단계·등급 설정 (STATE.settingsTab = 'stageGrade', STATE.view='stageGrade')
 *   · App.HREvalConfig 전역 설정을 편집 — 평가자 단계(본인/1차/2차/대표이사) + 직군별 등급 tier.
 *
 *  UI Kit 재사용
 *   .att-page__head / .att-applist-tabs (수습평가 설정·근태 설정과 동일 상단 탭)
 *   .toolbar / .tbl / .pill / .cb--pill / .fm-tbl / .page-bar / .input / .select / .modal (수정 사유)
 *
 *  ⚠ 아래 프로세스/등급/고급 관련 렌더 함수(sectionProcess, section5Grading,
 *     section6Advanced, renderGrade*, renderAdvanced*, openAdvEditModal 등)와
 *     GRADING_MODES/EVALUATOR_ROLES/GROUP_FIELDS 상수는 구조 단순화로 더 이상
 *     호출되지 않는다(inert). 회귀 방지를 위해 즉시 삭제하지 않고 남겨둠 — 추후 정리 대상.
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  /* ============ 환경 ============ */
  const TODAY   = '2026-05-14';
  const HR_NAME = '정혜진';

  /* ============ 평가요소 — 역량 단일 ============ */
  const EL = '역량';

  /* ============ 척도 옵션 (역량 양식) ============ */
  const SCALES = [
    { value: 3, label: '3점 척도', hint: '낮음 / 보통 / 높음' },
    { value: 5, label: '5점 척도', hint: '매우 미흡 ~ 매우 우수 (권장)' },
    { value: 7, label: '7점 척도', hint: '7단계 정밀 평가' },
  ];
  const DEFAULT_SCALE_LABELS = {
    3: ['낮음', '보통', '높음'],
    5: ['매우 미흡', '미흡', '보통', '우수', '매우 우수'],
    7: ['매우 미흡', '미흡', '다소 미흡', '보통', '다소 우수', '우수', '매우 우수'],
  };
  function defScaleLabels() {
    return { 3: DEFAULT_SCALE_LABELS[3].slice(), 5: DEFAULT_SCALE_LABELS[5].slice(), 7: DEFAULT_SCALE_LABELS[7].slice() };
  }

  /* ============ 평가자 유형 ============ */
  const EVALUATOR_ROLES = [
    { key: 'part_lead', label: '파트장' },
    { key: 'team_lead', label: '팀장' },
    { key: 'hq_lead',   label: '본부장' },
    { key: 'direct_assign', label: '직접 지정' },
  ];
  function roleLabel(k) {
    if (k === 'ceo') return '대표이사';
    return (EVALUATOR_ROLES.find(r => r.key === k) || {}).label || '-';
  }

  /* ============ 등급 산정 방식 ============ */
  const GRADING_MODES = [
    { key: 'absolute', label: '절대평가', desc: '점수 구간에 따라 등급 결정' },
    { key: 'relative', label: '상대평가', desc: '총점 순위 비율에 따라 등급 결정' },
    { key: 'mixed',    label: '혼합평가', desc: '절대평가 조건 우선 적용 후 잔여 대상자에 상대평가 적용' },
  ];
  function gradingModeLabel(k) { return (GRADING_MODES.find(m => m.key === k) || {}).label || '-'; }

  /* ============ 그룹 조건 필드 (고급 설정 — 그룹별 등급 기준) ============ */
  const GROUP_FIELDS = [
    { key: 'jobCategory', label: '직군', values: ['사무직', '연구직', '생산직', '도급직'] },
    { key: 'position',    label: '직위', values: ['대표이사', '부대표이사', '전무이사', '상무이사', '부장', '차장', '과장', '대리', '주임', '사원'] },
    { key: 'role',        label: '직책', values: ['임원', '본부장', '소장', '팀장', '파트장', '팀원', '파트원'] },
  ];
  function fieldByKey(k) { return GROUP_FIELDS.find(f => f.key === k) || null; }
  function conditionText(cond) {
    if (!cond || !cond.field) return '전체';
    const f = fieldByKey(cond.field);
    if (!f) return '전체';
    if (!cond.values || !cond.values.length) return f.label + ' (값 미선택)';
    return f.label + ' = ' + cond.values.join(', ');
  }

  /* ============ 헬퍼 ============ */
  function $(s, r = document) { return r.querySelector(s); }
  function $$(s, r = document) { return Array.from(r.querySelectorAll(s)); }
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
  function nowDate() { return TODAY; }
  function clamp(n, min, max) { n = Number(n); if (!isFinite(n)) n = 0; return Math.max(min, Math.min(max, n)); }
  function clamp100(n) { return clamp(n, 0, 100); }
  function uid(prefix) { return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

  function infoTip(text, pos) {
    const dir = pos === 'bottom' ? 'tip--bottom' : pos === 'left' ? 'tip--left' : pos === 'right' ? 'tip--right' : 'tip--top';
    return `<span class="tip ${dir}" style="display:inline-flex;vertical-align:middle;margin-left:4px;color:var(--color-text-muted);cursor:help;">`
      + `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`
      + `<span class="tip__bubble" style="white-space:normal;width:max-content;max-width:260px;text-align:left;font-weight:var(--fw-regular);line-height:1.5;word-break:keep-all;">${esc(text)}</span>`
      + `</span>`;
  }

  /* 척도별 명칭 정규화 — competency.scaleLabels 가 없으면 기본값으로 채움 */
  function normalizeScaleLabels(comp) {
    if (!comp) return;
    if (!comp.scaleLabels) comp.scaleLabels = {};
    [3, 5, 7].forEach(n => {
      const arr = comp.scaleLabels[n];
      if (!Array.isArray(arr) || arr.length !== n) comp.scaleLabels[n] = DEFAULT_SCALE_LABELS[n].slice();
    });
  }

  /* ============ 배점/비중 정규화 ============
   *   · 분야 배점 — 미지정(undefined) 분야가 있으면 합계 100점으로 균등 배분(나머지는 마지막 분야).
   *   · 항목 배점 — 분야 내 미지정 항목이 있으면 분야 배점을 항목 수로 균등 배분.
   *   · 명시적으로 0 을 입력한 값은 보존(미지정 == null 만 채움). */
  function distribute(total, n) {
    if (n <= 0) return [];
    const base = Math.floor(total / n);
    const arr = new Array(n).fill(base);
    arr[n - 1] = total - base * (n - 1);
    return arr;
  }
  function normalizeCompScores(comp) {
    if (!comp) return;
    const secs = comp.sections || [];
    if (!secs.length) return;
    if (secs.some(s => s.score == null)) {
      const d = distribute(100, secs.length);
      secs.forEach((s, i) => { s.score = d[i]; });
    }
    secs.forEach(s => {
      const its = s.items || [];
      if (!its.length) return;
      if (its.some(it => it.score == null)) {
        const d = distribute(Number(s.score) || 0, its.length);
        its.forEach((it, i) => { it.score = d[i]; });
      }
    });
  }
  /* 평가자 단계 + (사용 시) 자기평가의 비중을 합계 100% 로 정규화.
     미지정(undefined)이 하나라도 있을 때만 균등 배분 — 명시 입력값은 보존. */
  function normalizeStageWeights(proc) {
    if (!proc) return;
    const stages = proc.stages || [];
    const hasSelf = !!proc.selfEval;
    if (!stages.length && !hasSelf) return;
    const selfMissing = hasSelf && proc.selfWeight == null;
    const stageMissing = stages.some(s => s.weight == null);
    if (selfMissing || stageMissing) {
      const slots = (hasSelf ? 1 : 0) + stages.length;
      const d = distribute(100, slots);
      let i = 0;
      if (hasSelf) proc.selfWeight = d[i++];
      stages.forEach(s => { s.weight = d[i++]; });
    }
  }
  function sumSectionScores(comp) {
    return ((comp && comp.sections) || []).reduce((s, sec) => s + (Number(sec.score) || 0), 0);
  }
  function sumItemScores(sec) {
    return ((sec && sec.items) || []).reduce((s, it) => s + (Number(it.score) || 0), 0);
  }
  function sumStageWeights(proc) {
    return ((proc && proc.stages) || []).reduce((s, st) => s + (Number(st.weight) || 0), 0);
  }
  /* 자기평가(사용 시) + 평가자 단계 비중 총합 — 100% 검증 기준 */
  function procTotalWeight(proc) {
    if (!proc) return 0;
    return (proc.selfEval ? (Number(proc.selfWeight) || 0) : 0) + sumStageWeights(proc);
  }
  /* 분야 배점 합계 배지 — 100 이면 success, 아니면 danger */
  function renderScoreTotalBadge(comp) {
    const sum = sumSectionScores(comp);
    const ok = sum === 100;
    return `<span data-et-score-total style="font-size:var(--fs-sm);font-weight:var(--fw-medium);color:var(--color-text-sub);">
      분야 배점 합계: <strong data-et-score-total-val style="color:${ok ? 'var(--color-success)' : 'var(--color-danger)'};">${sum}</strong>
      <small style="color:var(--color-text-muted);">/ 100점</small>
    </span>`;
  }
  /* 분야별 항목 배점 합계 표기 — 분야 배점과 일치하면 muted, 아니면 danger */
  function itemSumBadge(sec) {
    const sum = sumItemScores(sec);
    const target = Number(sec.score) || 0;
    const ok = sum === target;
    return `<span data-et-sec-itemsum style="font-size:var(--fs-xs);font-weight:var(--fw-medium);color:${ok ? 'var(--color-text-muted)' : 'var(--color-danger)'};">
      항목 합계 <strong data-et-sec-itemsum-val>${sum}</strong> / ${target}점
    </span>`;
  }

  /* ============ Mock ============ */
  function makeMock() {
    return [
      {
        id: 'ET-001',
        name: '정기 인사평가',
        description: '전사 정규직 대상 정기 역량 평가',
        useYn: true,
        competency: {
          scale: 5,
          scaleLabels: defScaleLabels(),
          sections: [
            { id: uid('sec'), name: '리더십', items: [
              { id: uid('it'), text: '구성원들을 잘 이끌 수 있다.' },
              { id: uid('it'), text: '의사결정이 명확하고 책임감 있다.' },
            ]},
            { id: uid('sec'), name: '커뮤니케이션', items: [
              { id: uid('it'), text: '동료·상급자와 적극적으로 소통한다.' },
              { id: uid('it'), text: '의견을 논리적으로 전달한다.' },
            ]},
            { id: uid('sec'), name: '문제해결', items: [
              { id: uid('it'), text: '문제의 본질을 파악하고 해결안을 제시한다.' },
            ]},
          ],
        },
        process: { '역량': { selfEval: true, stages: [{ role: 'part_lead' }, { role: 'team_lead' }] } },
        grading: {
          mode: 'absolute',
          grades: [
            { key: 'S', name: 'S', mode: 'absolute', minScore: 90, ratio: 0 },
            { key: 'A', name: 'A', mode: 'absolute', minScore: 80, ratio: 0 },
            { key: 'B', name: 'B', mode: 'absolute', minScore: 70, ratio: 0 },
            { key: 'C', name: 'C', mode: 'absolute', minScore: 60, ratio: 0 },
            { key: 'D', name: 'D', mode: 'absolute', minScore: 0,  ratio: 0 },
          ],
        },
        advanced: { groupGrading: false, gradingRows: [] },
        versionHistory: [
          { v: 'v1', publishedAt: '2024-01-10', publisher: '정혜진', changeReason: '최초 등록', kind: 'create' },
          { v: 'v2', publishedAt: '2025-01-08', publisher: '윤민지', changeReason: '문항 조정', kind: 'version' },
        ],
        appliedRounds: [
          { round: 'EVR-2024-0001', version: 'v1' },
          { round: 'EVR-2026-0001', version: 'v2' },
        ],
        version: 'v2',
        active: true,
        updatedAt: '2025-01-08', updatedBy: '윤민지',
      },
      {
        id: 'ET-003',
        name: '승진 평가',
        description: '직위·직책 승진 대상자 역량 평가.',
        useYn: true,
        competency: {
          scale: 5,
          scaleLabels: defScaleLabels(),
          sections: [
            { id: uid('sec'), name: '비전 제시', items: [
              { id: uid('it'), text: '조직 비전을 명확히 제시한다.' },
              { id: uid('it'), text: '구성원에게 동기를 부여한다.' },
            ]},
            { id: uid('sec'), name: '의사결정', items: [
              { id: uid('it'), text: '데이터에 기반한 의사결정을 내린다.' },
            ]},
          ],
        },
        process: { '역량': { selfEval: true, stages: [{ role: 'part_lead' }, { role: 'team_lead' }, { role: 'hq_lead' }] } },
        grading: {
          mode: 'mixed',
          grades: [
            { key: 'S', name: 'S', mode: 'relative', minScore: 0,  ratio: 10 },
            { key: 'A', name: 'A', mode: 'relative', minScore: 0,  ratio: 20 },
            { key: 'B', name: 'B', mode: 'relative', minScore: 0,  ratio: 50 },
            { key: 'C', name: 'C', mode: 'relative', minScore: 0,  ratio: 20 },
            { key: 'D', name: 'D', mode: 'absolute', minScore: 60, ratio: 0  },
          ],
        },
        advanced: { groupGrading: false, gradingRows: [] },
        versionHistory: [{ v: 'v1', publishedAt: '2026-02-20', publisher: '정혜진', changeReason: '최초 등록', kind: 'create' }],
        appliedRounds: [],
        version: 'v1',
        active: true,
        updatedAt: '2026-02-20', updatedBy: '정혜진',
      },
      {
        id: 'ET-004',
        name: '2024 정기평가',
        description: '구버전 보존용. 신규 회차에서 선택 불가.',
        useYn: false,
        competency: {
          scale: 5,
          scaleLabels: defScaleLabels(),
          sections: [
            { id: uid('sec'), name: '핵심역량', items: [
              { id: uid('it'), text: '담당 직무를 능숙하게 수행한다.' },
              { id: uid('it'), text: '책임감 있게 업무를 완수한다.' },
            ]},
          ],
        },
        process: { '역량': { selfEval: false, stages: [{ role: 'part_lead' }] } },
        grading: {
          mode: 'absolute',
          grades: [
            { key: 'A', name: 'A', mode: 'absolute', minScore: 80, ratio: 0 },
            { key: 'B', name: 'B', mode: 'absolute', minScore: 60, ratio: 0 },
            { key: 'C', name: 'C', mode: 'absolute', minScore: 0,  ratio: 0 },
          ],
        },
        advanced: { groupGrading: false, gradingRows: [] },
        versionHistory: [{ v: 'v1', publishedAt: '2024-01-01', publisher: '정혜진', changeReason: '최초 등록', kind: 'create' }],
        appliedRounds: [{ round: 'EVR-2024-0001', version: 'v1' }],
        version: 'v1',
        active: false,
        updatedAt: '2024-01-01', updatedBy: '정혜진',
      },
    ];
  }

  /* ============ STATE ============ */
  const STATE = {
    view: 'list',           /* 'list' | 'editor' | 'detail' | 'stageGrade' */
    settingsTab: 'form',    /* 'form' (양식 설정) | 'stageGrade' (단계·등급 설정) */
    types: [],
    selectedIds: new Set(),
    filter: { condition: 'name', keyword: '', useYn: '', gradingMode: '' },
    page: 1,
    pageSize: 20,

    /* editor */
    editingId: null,        /* null = 신규, id = 수정 */
    isNewVersion: false,
    form: null,             /* 편집 중인 평가유형 사본 */
    step: 1,                /* 1 = 양식 설정, 2 = 상세 설정 */

    /* §6 그룹별 등급 기준 편집 모달 draft */
    advEditDraft: null,

    /* detail */
    detailId: null,

    /* 단계·등급 설정 편집 draft */
    configDraft: null,
  };

  function summarizeForm(t) {
    const comp = t.competency || { scale: 5, sections: [] };
    const sections = comp.sections || [];
    const itemCnt = sections.reduce((s, sec) => s + (sec.items || []).length, 0);
    return `${comp.scale || 5}점 · 분야 ${sections.length} · 항목 ${itemCnt}`;
  }

  /* mock 지연 빌드 — 회차 화면이 API(App.HREvalType)로 먼저 조회할 수 있어 필요 시 즉시 빌드 */
  function ensureBuilt() {
    if (!built) { STATE.types = makeMock(); built = true; }
    return STATE.types;
  }

  /* =========================================================
   *  「역량평가 설정」 2탭 셸 (.tabs--underline) — 양식 설정 / 단계·등급 설정
   * ========================================================= */
  function settingsTabBar(active) {
    /* 수습평가 설정(page-hr-eval-prob-set) · 근태 설정과 동일한 상단 탭 — att-page__head + att-applist-tabs */
    const topBtn = (key, label) => `
      <button type="button" class="att-applist-tab${active === key ? ' is-active' : ''}" data-et-tab="${key}">${label}</button>`;
    return `
      <header class="att-page__head">
        <div style="padding:16px 20px 14px;">
          <div class="att-applist-tabs" data-et-settings-tabs style="margin-bottom:0;">
            ${topBtn('form', '양식 설정')}
            ${topBtn('stageGrade', '단계·등급 설정')}
          </div>
        </div>
      </header>`;
  }
  function bindSettingsTabs(pageEl) {
    pageEl.querySelectorAll('[data-et-settings-tabs] .att-applist-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const to = tab.dataset.etTab;
        if (to === STATE.settingsTab && (STATE.view === 'list' || STATE.view === 'stageGrade')) return;
        STATE.settingsTab = to;
        if (to === 'stageGrade') { STATE.view = 'stageGrade'; renderStageGradeView(pageEl); }
        else { STATE.view = 'list'; renderListView(pageEl); }
      });
    });
  }

  /* =========================================================
   *  VIEW: LIST
   * ========================================================= */
  function renderListView(pageEl) {
    STATE.view = 'list';
    STATE.settingsTab = 'form';
    const C = App.Components;
    const searchHTML = C.searchPanel({
      showDateRange: false,
      conditions: [
        { value: 'name', label: '양식명' },
        { value: 'id',   label: '양식 번호' },
      ],
      placeholder: '양식명 또는 양식 번호 검색',
      cols: 2,
      advanced: [
        { name: 'useYn', label: '사용 여부', options: [
          { value: 'Y', label: '사용' },
          { value: 'N', label: '미사용' },
        ]},
      ],
    });

    pageEl.innerHTML = `
      ${settingsTabBar('form')}
      ${searchHTML}

      <div class="toolbar">
        <div class="toolbar__left">
          <span class="toolbar__count">총 <span data-count><strong>0</strong>건</span></span>
        </div>
        <div class="toolbar__right">
          <button class="btn btn--sm btn--primary" type="button" data-et-act="add">${(window.Icons && window.Icons.plus) || '+'} 양식 등록</button>
        </div>
      </div>

      <div class="grid-wrap" style="flex:1;min-height:0;">
        <div class="grid-scroll">
          <table class="tbl tbl--hover">
            <thead>
              <tr>
                <th style="width:110px;">양식 번호</th>
                <th style="min-width:200px;">양식명</th>
                <th>설명</th>
                <th style="width:90px;text-align:center;">사용 여부</th>
                <th style="width:220px;">양식 구성</th>
                <th style="width:110px;text-align:right;">적용 평가회차</th>
                <th style="width:90px;">수정자</th>
                <th style="width:120px;">최근 수정일</th>
                <th style="width:40px;text-align:center;" aria-label="더보기"></th>
              </tr>
            </thead>
            <tbody id="et-list-body"></tbody>
          </table>
        </div>
        <div class="pagination">
          <div class="pagination__info" id="et-page-info"></div>
          <div class="pagination__right">
            <div class="pagination__size">
              <label>페이지당</label>
              <select class="select" id="et-page-size">
                <option value="20">20</option><option value="40">40</option><option value="60">60</option><option value="100">100</option>
              </select>
              <span>건</span>
            </div>
            <div class="pagination__list" id="et-pagination"></div>
          </div>
        </div>
      </div>
    `;
    bindListView(pageEl);
    renderTable();
  }

  function bindListView(pageEl) {
    bindSettingsTabs(pageEl);
    App.Search.attach(pageEl.querySelector('[data-search]'), (params) => {
      STATE.filter.condition   = params.condition || 'name';
      STATE.filter.keyword     = params.keyword   || '';
      STATE.filter.useYn       = (params.advanced && params.advanced.useYn)       || '';
      STATE.page = 1;
      renderTable();
    });

    pageEl.querySelector('[data-et-act="add"]').addEventListener('click', () => openEditor(null));

    pageEl.querySelector('#et-list-body').addEventListener('click', (e) => {
      if (e.target.closest('.btn--kebab')) return;
      const copyBtn = e.target.closest('[data-et-row-copy]');
      if (copyBtn) { attemptCopy(copyBtn.dataset.etRowCopy); return; }
      const delBtn = e.target.closest('[data-et-row-delete]');
      if (delBtn) { attemptDelete(delBtn.dataset.etRowDelete); return; }
      const row = e.target.closest('[data-et-row]');
      if (!row) return;
      openDetail(row.dataset.etRow);
    });

    pageEl.querySelector('#et-pagination').addEventListener('click', (e) => {
      const btn = e.target.closest('.pagination__btn');
      if (!btn || btn.disabled) return;
      const p = Number(btn.dataset.page);
      if (Number.isFinite(p)) { STATE.page = p; renderTable(); }
    });
    pageEl.querySelector('#et-page-size').addEventListener('change', (e) => {
      STATE.pageSize = Number(e.target.value);
      STATE.page = 1;
      renderTable();
    });
  }

  function filteredTypes() {
    const kw   = (STATE.filter.keyword || '').trim().toLowerCase();
    const cond = STATE.filter.condition || 'name';
    return STATE.types.filter(t => {
      if (STATE.filter.useYn) {
        const want = STATE.filter.useYn === 'Y';
        if (!!t.useYn !== want) return false;
      }
      if (kw) {
        const hay = cond === 'id' ? String(t.id || '').toLowerCase() : String(t.name || '').toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }

  function renderTable() {
    const pageEl = document.getElementById('page-hr-eval-type');
    if (!pageEl) return;
    const body = pageEl.querySelector('#et-list-body');
    if (!body) return;
    const list = filteredTypes();
    const total = list.length;

    const totalPages = Math.max(1, Math.ceil(total / STATE.pageSize));
    if (STATE.page > totalPages) STATE.page = totalPages;
    const startIdx = (STATE.page - 1) * STATE.pageSize;
    const rows = list.slice(startIdx, startIdx + STATE.pageSize);

    body.innerHTML = rows.length
      ? rows.map(t => renderListRow(t)).join('')
      : `<tr><td colspan="9" style="text-align:center;color:var(--color-text-muted);padding:32px 0;">조건에 해당하는 양식이 없습니다.</td></tr>`;

    const cntStrong = pageEl.querySelector('[data-count] strong');
    if (cntStrong) cntStrong.textContent = String(total);

    const info = pageEl.querySelector('#et-page-info');
    if (info) {
      info.textContent = total ? `${startIdx + 1}–${Math.min(startIdx + STATE.pageSize, total)} / 총 ${total}건` : '';
    }
    const pager = pageEl.querySelector('#et-pagination');
    if (pager) {
      const btns = [];
      btns.push(`<button class="pagination__btn" data-page="1" ${STATE.page === 1 ? 'disabled' : ''}>«</button>`);
      btns.push(`<button class="pagination__btn" data-page="${Math.max(1, STATE.page - 1)}" ${STATE.page === 1 ? 'disabled' : ''}>‹</button>`);
      const lo = Math.max(1, STATE.page - 2), hi = Math.min(totalPages, lo + 4);
      for (let i = lo; i <= hi; i++) {
        btns.push(`<button class="pagination__btn${i === STATE.page ? ' is-active' : ''}" data-page="${i}">${i}</button>`);
      }
      btns.push(`<button class="pagination__btn" data-page="${Math.min(totalPages, STATE.page + 1)}" ${STATE.page === totalPages ? 'disabled' : ''}>›</button>`);
      btns.push(`<button class="pagination__btn" data-page="${totalPages}" ${STATE.page === totalPages ? 'disabled' : ''}>»</button>`);
      pager.innerHTML = btns.join('');
    }
  }

  function renderListRow(t) {
    const applied = (t.appliedRounds || []).length;
    const usePill = t.useYn ? '<span class="pill pill--success">사용</span>' : '<span class="pill">미사용</span>';
    const deletable = applied === 0;
    const moreIco = (window.Icons && window.Icons.moreVertical) || '⋮';
    const kebabHTML = `
      <span class="dd dd--row" data-dd>
        <button class="btn--kebab" type="button" aria-label="더보기">${moreIco}</button>
        <div class="dd__menu">
          <button class="dd__item" type="button" data-et-row-copy="${esc(t.id)}">복제</button>
          <button class="dd__item dd__item--danger" type="button" data-et-row-delete="${esc(t.id)}" ${deletable ? '' : `disabled title="${applied}개 회차에 적용 중 — 삭제 불가"`}>삭제</button>
        </div>
      </span>`;

    return `
      <tr data-et-row="${esc(t.id)}" style="cursor:pointer;">
        <td>${esc(t.id)}</td>
        <td><strong style="color:var(--color-brand-primary);font-weight:var(--fw-medium);">${esc(t.name)}</strong></td>
        <td style="color:var(--color-text-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px;">${esc(t.description || '-')}</td>
        <td style="text-align:center;">${usePill}</td>
        <td style="color:var(--color-text-sub);">${esc(summarizeForm(t))}</td>
        <td style="text-align:right;">${applied > 0 ? `<strong>${applied}</strong>건` : '<span class="t-muted">-</span>'}</td>
        <td>${esc(t.updatedBy || '-')}</td>
        <td>${esc(t.updatedAt || '-')}</td>
        <td style="text-align:center;">${kebabHTML}</td>
      </tr>
    `;
  }

  /* ============ 목록 액션 ============ */
  function attemptCopy(id) {
    const src = STATE.types.find(r => r.id === id);
    if (!src) return;
    const dup = deepClone(src);
    dup.id = generateId();
    dup.name = `${src.name} (복제)`;
    dup.appliedRounds = [];
    dup.version = 'v1';
    dup.versionHistory = [{ v: 'v1', publishedAt: nowDate(), publisher: HR_NAME, changeReason: '복제 등록', kind: 'create' }];
    dup.updatedAt = nowDate();
    dup.updatedBy = HR_NAME;
    STATE.types.unshift(dup);
    if (STATE.view === 'list') renderTable();
    window.toast && window.toast(`${src.name} → ${dup.id} 로 복제됨`, 'success');
  }

  function attemptDelete(id) {
    const t = STATE.types.find(r => r.id === id);
    if (!t) return;
    const applied = (t.appliedRounds || []).length;
    if (applied > 0) {
      window.toast && window.toast(`${t.name} — ${applied}개 회차에 적용 중이라 삭제할 수 없습니다.`, 'warning');
      return;
    }
    window.sweet ? window.sweet({
      icon: 'warning',
      title: '양식 삭제',
      text: `「${t.name}」 양식을 삭제합니다. 적용 회차가 없어 안전하게 삭제됩니다.`,
      cancelText: '취소', confirmText: '삭제',
      onConfirm: () => {
        STATE.types = STATE.types.filter(r => r.id !== id);
        STATE.selectedIds.delete(id);
        renderTable();
        window.toast && window.toast(`${t.name} 삭제 완료`, 'info');
      },
    }) : null;
  }

  /* =========================================================
   *  § 고급 — 그룹별 등급 기준 편집 모달
   * ========================================================= */
  function openAdvEditModal(rowId) {
    const row = STATE.form.advanced.gradingRows.find(r => r.id === rowId);
    if (!row) return;
    const initMode = row.gradingMode || 'absolute';
    STATE.advEditDraft = {
      rowId: rowId,
      name: row.name || '예외 그룹',
      mode: initMode,
      grades: deepClone(row.grades || []),
    };
    if (STATE.advEditDraft.grades.length === 0) {
      if (initMode === 'relative') {
        STATE.advEditDraft.grades = [
          { key: uid('g'), name: 'A', mode: 'relative', minScore: 0, ratio: 30 },
          { key: uid('g'), name: 'B', mode: 'relative', minScore: 0, ratio: 50 },
          { key: uid('g'), name: 'C', mode: 'relative', minScore: 0, ratio: 20 },
        ];
      } else {
        STATE.advEditDraft.grades = [
          { key: uid('g'), name: 'A', mode: 'absolute', minScore: 80, ratio: 0 },
          { key: uid('g'), name: 'B', mode: 'absolute', minScore: 60, ratio: 0 },
          { key: uid('g'), name: 'C', mode: 'absolute', minScore: 0,  ratio: 0 },
        ];
      }
    }
    renderAdvEditModal();
  }

  function closeAdvEditModal() {
    STATE.advEditDraft = null;
    const m = document.getElementById('et-adv-edit-modal');
    if (m) { m.classList.remove('is-open'); document.body.style.overflow = ''; }
  }

  function saveAdvEdit() {
    const d = STATE.advEditDraft;
    if (!d) return;
    if (d.grades.length < 3 || d.grades.length > 10) {
      window.toast && window.toast('등급은 최소 3개, 최대 10개입니다.', 'warning'); return;
    }
    if (!d.grades.every(g => g.name && g.name.trim())) {
      window.toast && window.toast('등급명을 모두 입력해주세요.', 'warning'); return;
    }
    if (d.mode === 'relative' || d.mode === 'mixed') {
      const sum = d.grades.reduce((s, g) => {
        if (d.mode === 'relative') return s + (Number(g.ratio) || 0);
        if (g.mode === 'relative') return s + (Number(g.ratio) || 0);
        return s;
      }, 0);
      const hasRelative = (d.mode === 'relative') || d.grades.some(g => g.mode === 'relative');
      if (hasRelative && sum !== 100) {
        window.toast && window.toast(`상대평가 비율 합계가 100% 가 아닙니다. (현재 ${sum}%)`, 'warning'); return;
      }
    }
    const row = STATE.form.advanced.gradingRows.find(r => r.id === d.rowId);
    if (row) {
      row.gradingMode = d.mode;
      row.grades = deepClone(d.grades);
    }
    closeAdvEditModal();
    reRender();
    window.toast && window.toast(`「${d.name}」 등급 기준 저장됨`, 'success');
  }

  function renderAdvEditModal() {
    const d = STATE.advEditDraft;
    if (!d) return;
    let modal = document.getElementById('et-adv-edit-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'et-adv-edit-modal';
      modal.className = 'modal-backdrop';
      modal.addEventListener('click', (e) => { if (e.target === modal) closeAdvEditModal(); });
      document.body.appendChild(modal);
    }
    modal.innerHTML = buildAdvEditModalHTML(d);
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    bindAdvEditModal(modal);
  }

  function buildAdvEditModalHTML(d) {
    const modeCards = GRADING_MODES.map((m, i) => `
      <label class="cb-card" style="${i > 0 ? 'margin-left:10px;' : ''}flex:1;">
        <input type="radio" name="et-advm-mode" value="${esc(m.key)}" ${d.mode === m.key ? 'checked' : ''} />
        <div class="cb-card__body">
          <span class="cb-card__title">${esc(m.label)}</span>
          <span class="cb-card__desc">${esc(m.desc)}</span>
        </div>
      </label>
    `).join('');

    const mixedHint = d.mode === 'mixed' ? `
      <div style="padding:10px 14px;margin-bottom:12px;background:rgba(0,52,125,.04);border-left:3px solid var(--color-brand-primary);border-radius:0 var(--radius-md) var(--radius-md) 0;font-size:var(--fs-sm);">
        혼합평가는 절대평가 조건을 먼저 적용한 뒤, 남은 대상자에게 상대평가 비율을 적용합니다.
      </div>` : '';

    return `
      <div class="modal modal--lg">
        <header class="modal__header">
          <div class="modal__title">${esc(d.name)} — 등급 기준 편집</div>
          <button class="modal__close" type="button" data-et-advm-close aria-label="닫기">✕</button>
        </header>
        <div class="modal__body">
          <div style="display:flex;gap:10px;margin-bottom:14px;">${modeCards}</div>
          ${mixedHint}
          ${buildAdvGradeTable(d)}
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;gap:10px;flex-wrap:wrap;">
            <button class="btn btn--sm" type="button" data-et-advm-grade-add ${d.grades.length >= 10 ? 'disabled' : ''}>+ 등급 추가</button>
            <div style="font-size:var(--fs-xs);color:var(--color-text-muted);">등급은 최소 3개, 최대 10개까지.</div>
          </div>
        </div>
        <footer class="modal__footer">
          <button class="btn" type="button" data-et-advm-cancel>취소</button>
          <button class="btn btn--primary" type="button" data-et-advm-save>저장</button>
        </footer>
      </div>
    `;
  }

  function buildAdvGradeTable(d) {
    const mode = d.mode;
    const headExtra =
      mode === 'absolute' ? `<th>점수 조건</th>` :
      mode === 'relative' ? `<th>상위 % (누적 범위)</th>` :
      `<th style="width:120px;">산정 방식</th><th>기준값</th>`;
    let cum = 0;
    const bodyRows = d.grades.map((g, i) => {
      const gMode = mode === 'mixed' ? (g.mode || 'relative') : mode;
      let cumStart = cum, cumEnd = cum;
      if (gMode === 'relative') { cumEnd = cum + (Number(g.ratio) || 0); cum = cumEnd; }
      return buildAdvGradeRow(g, i, d.grades, mode, gMode, cumStart, cumEnd);
    }).join('');
    return `
      <table class="tbl tbl--bordered">
        <thead>
          <tr>
            <th style="width:140px;">등급명</th>
            ${headExtra}
            <th style="width:90px;text-align:center;">삭제</th>
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    `;
  }

  function buildAdvGradeRow(g, i, all, mode, gMode, cumStart, cumEnd) {
    const nameCell = `<td>
      <input type="text" class="input" value="${esc(g.name || '')}" data-et-advm-grade-name="${i}" placeholder="예: S" style="width:120px;" />
    </td>`;
    const rangeSpan = (text) => `<span data-et-advm-grade-range="${i}" class="t-muted" style="margin-left:8px;font-size:var(--fs-xs);">${esc(text)}</span>`;

    let middleCell = '';
    if (mode === 'absolute') {
      const lo = Number(g.minScore) || 0;
      const next = all[i + 1];
      const range = next ? `~ ${Math.max(0, Number(next.minScore) || 0)}점 미만` : `(최저)`;
      middleCell = `<td>
        <span style="display:inline-flex;align-items:center;gap:6px;">
          <input type="number" class="input" value="${lo}" data-et-advm-grade-min="${i}" min="0" max="100" step="1" style="width:80px;text-align:right;" />
          <span style="color:var(--color-text-sub);">점 이상</span>
          ${rangeSpan(range)}
        </span>
      </td>`;
    } else if (mode === 'relative') {
      middleCell = `<td>
        <span style="display:inline-flex;align-items:center;gap:6px;">
          <span style="color:var(--color-text-sub);">상위</span>
          <input type="number" class="input" value="${Number(g.ratio) || 0}" data-et-advm-grade-ratio="${i}" min="0" max="100" step="1" style="width:80px;text-align:right;" />
          <span style="color:var(--color-text-sub);">%</span>
          ${rangeSpan(`(상위 ${cumStart}% ~ ${cumEnd}%)`)}
        </span>
      </td>`;
    } else { /* mixed */
      const opt = `<option value="absolute" ${gMode === 'absolute' ? 'selected' : ''}>절대평가</option><option value="relative" ${gMode === 'relative' ? 'selected' : ''}>상대평가</option>`;
      let valueInput = '';
      if (gMode === 'absolute') {
        valueInput = `
          <input type="number" class="input" value="${Number(g.minScore) || 0}" data-et-advm-grade-min="${i}" min="0" max="100" step="1" style="width:80px;text-align:right;" />
          <span style="color:var(--color-text-sub);margin-left:6px;">점 미만</span>
          ${rangeSpan(`(이 점수 미만 → 이 등급으로 먼저 분류)`)}
        `;
      } else {
        valueInput = `
          <span style="color:var(--color-text-sub);">상위</span>
          <input type="number" class="input" value="${Number(g.ratio) || 0}" data-et-advm-grade-ratio="${i}" min="0" max="100" step="1" style="width:80px;text-align:right;margin-left:6px;" />
          <span style="color:var(--color-text-sub);margin-left:6px;">%</span>
          ${rangeSpan(`(상위 ${cumStart}% ~ ${cumEnd}%)`)}
        `;
      }
      middleCell = `
        <td><select class="select" data-et-advm-grade-mode="${i}">${opt}</select></td>
        <td><span style="display:inline-flex;align-items:center;gap:0;">${valueInput}</span></td>
      `;
    }

    const delCell = `<td style="text-align:center;">
      <button class="btn btn--xs btn--soft-danger" type="button" data-et-advm-grade-del="${i}" ${all.length <= 3 ? 'disabled' : ''}>삭제</button>
    </td>`;

    return `<tr data-et-advm-grade-row="${i}">${nameCell}${middleCell}${delCell}</tr>`;
  }

  function bindAdvEditModal(modal) {
    modal.querySelectorAll('[data-et-advm-close], [data-et-advm-cancel]').forEach(b => b.addEventListener('click', closeAdvEditModal));
    modal.querySelector('[data-et-advm-save]').addEventListener('click', saveAdvEdit);

    modal.querySelectorAll('input[name="et-advm-mode"]').forEach(r => r.addEventListener('change', () => {
      const v = modal.querySelector('input[name="et-advm-mode"]:checked').value;
      STATE.advEditDraft.mode = v;
      STATE.advEditDraft.grades.forEach(g => {
        if (v === 'absolute') g.mode = 'absolute';
        else if (v === 'relative') g.mode = 'relative';
        else if (!g.mode) g.mode = 'relative';
      });
      renderAdvEditModal();
    }));

    modal.querySelectorAll('[data-et-advm-grade-name]').forEach(inp => inp.addEventListener('input', e => {
      const i = Number(e.target.dataset.etAdvmGradeName);
      if (STATE.advEditDraft.grades[i]) STATE.advEditDraft.grades[i].name = e.target.value;
    }));
    modal.querySelectorAll('[data-et-advm-grade-min]').forEach(inp => inp.addEventListener('input', e => {
      const i = Number(e.target.dataset.etAdvmGradeMin);
      if (STATE.advEditDraft.grades[i]) STATE.advEditDraft.grades[i].minScore = clamp100(e.target.value);
      updateAdvGradeRanges(modal);
    }));
    modal.querySelectorAll('[data-et-advm-grade-ratio]').forEach(inp => inp.addEventListener('input', e => {
      const i = Number(e.target.dataset.etAdvmGradeRatio);
      const draft = STATE.advEditDraft;
      const grades = draft && draft.grades;
      if (!grades || !grades[i]) return;
      const isRelativeMode = draft.mode === 'relative' || (draft.mode === 'mixed' && grades[i].mode === 'relative');
      let v = clamp100(e.target.value);
      if (isRelativeMode) {
        const othersSum = grades.reduce((s, g, idx) => {
          if (idx === i) return s;
          const cnt = (draft.mode === 'relative' || g.mode === 'relative');
          return s + (cnt ? (Number(g.ratio) || 0) : 0);
        }, 0);
        const remaining = Math.max(0, 100 - othersSum);
        if (v > remaining) {
          v = remaining;
          e.target.value = v;
          window.toast && window.toast(`상대평가 누적 합이 100%를 초과할 수 없습니다. (가용 ${remaining}%)`, 'warning');
        }
      }
      grades[i].ratio = v;
      updateAdvGradeRanges(modal);
    }));
    modal.querySelectorAll('[data-et-advm-grade-mode]').forEach(sel => sel.addEventListener('change', e => {
      const i = Number(e.target.dataset.etAdvmGradeMode);
      if (STATE.advEditDraft.grades[i]) {
        STATE.advEditDraft.grades[i].mode = e.target.value;
        renderAdvEditModal();
      }
    }));
    modal.querySelectorAll('[data-et-advm-grade-del]').forEach(b => b.addEventListener('click', e => {
      const i = Number(e.currentTarget.dataset.etAdvmGradeDel);
      if (STATE.advEditDraft.grades.length > 3) {
        STATE.advEditDraft.grades.splice(i, 1);
        renderAdvEditModal();
      }
    }));
    const addBtn = modal.querySelector('[data-et-advm-grade-add]');
    if (addBtn) addBtn.addEventListener('click', () => {
      if (STATE.advEditDraft.grades.length >= 10) return;
      const defaultMode = STATE.advEditDraft.mode === 'absolute' ? 'absolute' : 'relative';
      STATE.advEditDraft.grades.push({ key: uid('g'), name: '', mode: defaultMode, minScore: 0, ratio: 0 });
      renderAdvEditModal();
    });
  }

  function updateAdvGradeRanges(modal) {
    const d = STATE.advEditDraft;
    if (!d) return;
    let cum = 0;
    d.grades.forEach((g, i) => {
      const span = modal.querySelector(`[data-et-advm-grade-range="${i}"]`);
      if (!span) return;
      const gMode = (d.mode === 'mixed') ? (g.mode || 'relative') : d.mode;
      let text = '';
      if (gMode === 'absolute') {
        if (d.mode === 'mixed') {
          text = `(이 점수 미만 → 이 등급으로 먼저 분류)`;
        } else {
          const next = d.grades[i + 1];
          text = next ? `~ ${Math.max(0, Number(next.minScore) || 0)}점 미만` : `(최저)`;
        }
      } else {
        const r = Number(g.ratio) || 0;
        text = `(상위 ${cum}% ~ ${cum + r}%)`;
        cum += r;
      }
      span.textContent = text;
    });
  }

  /* =========================================================
   *  EDITOR — 2단계 위저드
   * ========================================================= */
  function newFormDefaults() {
    return {
      id: '',
      name: '',
      description: '',
      useYn: true,
      competency: {
        scale: 5,
        scaleLabels: defScaleLabels(),
        sections: [{ id: uid('sec'), name: '', items: [{ id: uid('it'), text: '' }] }],
      },
      version: 'v1',
      versionHistory: [],
      appliedRounds: [],
      active: true,
    };
  }

  function normalizeForm(f) {
    if (!f.competency) f.competency = newFormDefaults().competency;
    normalizeScaleLabels(f.competency);
    if (!Array.isArray(f.competency.sections) || !f.competency.sections.length) {
      f.competency.sections = [{ id: uid('sec'), name: '', items: [{ id: uid('it'), text: '' }] }];
    }
  }

  function openEditor(id) {
    STATE.view = 'editor';
    STATE.editingId = id;
    STATE.isNewVersion = false;
    STATE.step = 1;

    if (id) {
      const src = STATE.types.find(t => t.id === id);
      if (!src) { STATE.view = 'list'; return; }
      /* 회차에 연결된 양식은 수정 불가 — 상세보기로 되돌림 (버튼은 이미 숨김, 방어적 처리) */
      if ((src.appliedRounds || []).length > 0) { openDetail(id); return; }
      STATE.form = deepClone(src);
      normalizeForm(STATE.form);
    } else {
      STATE.form = newFormDefaults();
    }
    renderEditorView(document.getElementById('page-hr-eval-type'));
  }

  function exitEditor() {
    const proceed = () => {
      STATE.view = 'list';
      STATE.editingId = null;
      STATE.form = null;
      renderListView(document.getElementById('page-hr-eval-type'));
    };
    if (window.sweet) {
      window.sweet({
        icon: 'confirm', title: '편집 취소',
        text: '편집 중인 내용이 사라질 수 있습니다. 목록으로 돌아가시겠습니까?',
        cancelText: '계속 편집', confirmText: '목록으로',
        onConfirm: proceed,
      });
    } else if (confirm('편집 중인 내용이 사라질 수 있습니다. 목록으로 돌아가시겠습니까?')) {
      proceed();
    }
  }

  /* 에디터 마지막 렌더 단계 — 같은 단계 재렌더 시 스크롤 위치를 보존하기 위한 기준 */
  let _etRenderedStep = null;
  function reRender() {
    const pageEl = document.getElementById('page-hr-eval-type');
    if (!pageEl) return;
    /* 단계 추가/삭제·비중 변경 등 같은 단계 내 재렌더에서는 스크롤이 위로 튀지 않도록 보존.
       단계 자체가 바뀌면(다음/이전/goto) 새 단계 상단부터 보여준다. */
    const prevBody = pageEl.querySelector('#et-wz-body');
    const savedTop = prevBody ? prevBody.scrollTop : 0;
    const sameStep = _etRenderedStep === (STATE.step || 1);
    renderEditorView(pageEl);
    const nextBody = pageEl.querySelector('#et-wz-body');
    if (nextBody && sameStep) nextBody.scrollTop = savedTop;
  }

  /* 양식은 회차 연결 시 애초에 편집기에 진입하지 않으므로 잠금 개념 불필요 (항상 편집 가능) */
  function isLocked() { return false; }

  function renderEditorView(pageEl) {
    const f = STATE.form;
    const locked = false;

    const title = !STATE.editingId ? '양식 등록' : `양식 수정 — ${f.name}`;
    const saveLabel = STATE.editingId ? '저장' : '등록';

    pageEl.innerHTML = `
      <div class="page-bar">
        <button class="page-bar__back" type="button" data-et-back>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          목록
        </button>
        <div class="page-bar__divider"></div>
        <div>
          <div class="page-bar__title">${esc(title)}</div>
          <div class="page-bar__sub">척도 · 분야 · 항목 · 배점으로 평가 양식을 구성합니다. 평가자 단계·등급은 「단계·등급 설정」에서 관리됩니다.</div>
        </div>
      </div>

      <div id="et-wz-body" style="flex:1;min-height:0;overflow:auto;padding:18px 28px 28px;display:flex;flex-direction:column;gap:16px;background:var(--color-surface-alt);">
        ${renderFormStep1(f, locked)}
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:12px 28px;border-top:1px solid var(--color-divider);background:var(--color-surface);">
        <button class="btn btn--sm" type="button" data-et-back>취소</button>
        <button class="btn btn--sm btn--primary" type="button" data-et-save>${saveLabel}</button>
      </div>
    `;
    bindEditor(pageEl);
    _etRenderedStep = 1;
  }

  function sectionWrap(num, title, sub, body, opts) {
    const showCheck = !!(opts && opts.valid);
    const status = (opts && opts.status) || '';
    const help = (opts && opts.help) || '';
    const right = showCheck
      ? `<span data-et-check style="margin-left:auto;display:inline-flex;align-items:center;gap:5px;color:var(--color-success);font-size:var(--fs-sm);font-weight:var(--fw-semibold);">
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
           완료
         </span>`
      : (status ? `<span style="margin-left:auto;font-size:var(--fs-sm);color:var(--color-text-sub);">${status}</span>` : '');

    return `
      <section data-et-section="${num}" style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:20px 24px 22px;">
        <header style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--color-divider);">
          <span style="display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;padding:0 8px;border-radius:var(--radius-sm);background:var(--color-brand-primary);color:#fff;font-size:var(--fs-sm);font-weight:var(--fw-bold);">${num}</span>
          <h3 style="font-size:var(--fs-lg);font-weight:var(--fw-semibold);color:var(--color-text);">${esc(title)}</h3>
          ${help}
          ${sub ? `<small style="color:var(--color-text-muted);font-size:var(--fs-sm);">${esc(sub)}</small>` : ''}
          ${right}
        </header>
        ${body}
      </section>
    `;
  }

  /* =========================================================
   *  Step 1 — 양식 설정 (역량)
   * ========================================================= */
  function isFormValid(f) {
    const secs = (f.competency && f.competency.sections) || [];
    if (!secs.length) return false;
    if (secs.some(s => !s.name || !s.name.trim())) return false;
    if (secs.some(s => !(s.items || []).length)) return false;
    if (secs.some(s => s.items.some(it => !it.text || !it.text.trim()))) return false;
    /* 배점 — 분야 합계 100점, 각 분야의 항목 배점 합계 = 분야 배점 */
    if (sumSectionScores(f.competency) !== 100) return false;
    if (secs.some(s => sumItemScores(s) !== (Number(s.score) || 0))) return false;
    return true;
  }

  function renderFormStep1(f, locked) {
    const comp = f.competency;
    normalizeScaleLabels(comp);
    normalizeCompScores(comp);
    const curLabels = comp.scaleLabels[comp.scale];

    const scaleHTML = SCALES.map(s => `
      <label class="cb cb--pill" style="padding:6px 16px;font-size:var(--fs-sm);">
        <input type="radio" name="et-f-scale" value="${s.value}" ${comp.scale === s.value ? 'checked' : ''} ${locked ? 'disabled' : ''} />
        <span>${esc(s.label)}</span>
      </label>
    `).join('');

    const labelRows = curLabels.map((lab, i) => `
      <tr>
        <td style="text-align:center;color:var(--color-text-sub);">${i + 1}점</td>
        <td>
          <input type="text" class="input" data-et-f-scale-label="${i}" value="${esc(lab)}" placeholder="${esc(DEFAULT_SCALE_LABELS[comp.scale][i] || '')}" style="width:100%;" ${locked ? 'disabled' : ''} />
        </td>
      </tr>
    `).join('');

    const sectionsHTML = comp.sections.map((sec, si) => renderCompSection(sec, si, comp.scale, comp.sections.length, curLabels, locked)).join('');

    const fieldLabel = (text, hint) => `
      <div style="margin-bottom:8px;">
        <span style="font-size:var(--fs-sm);color:var(--color-text-sub);font-weight:var(--fw-medium);">${esc(text)}</span>
        ${hint ? `<small style="margin-left:8px;color:var(--color-text-muted);font-size:var(--fs-xs);">${esc(hint)}</small>` : ''}
      </div>
    `;

    return sectionBasic(f, locked) + sectionWrap(2, '평가 양식 — 역량', '', `
      <div style="margin-bottom:18px;">
        ${fieldLabel('척도', '평가자가 각 항목을 척도 단계로 평가합니다.')}
        <div style="display:flex;gap:6px;flex-wrap:wrap;">${scaleHTML}</div>
      </div>
      <div style="margin-bottom:18px;">
        ${fieldLabel('척도별 명칭', '각 단계의 평가 명칭을 직접 지정합니다.')}
        <table class="tbl tbl--bordered" data-et-scale-labels style="width:auto;max-width:420px;">
          <thead>
            <tr>
              <th style="width:80px;text-align:center;">단계</th>
              <th>명칭</th>
            </tr>
          </thead>
          <tbody>${labelRows}</tbody>
        </table>
      </div>
      <div style="margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        ${fieldLabel('분야 · 항목 배점', '분야 배점의 합계는 100점이어야 하며, 각 분야의 항목 배점 합계는 분야 배점과 같아야 합니다.')}
        ${renderScoreTotalBadge(comp)}
      </div>
      <div data-et-sections style="display:flex;flex-direction:column;gap:14px;">
        ${sectionsHTML}
      </div>
      ${locked ? '' : `<button class="btn btn--sm" type="button" data-et-sec-add style="margin-top:12px;">+ 분야 추가</button>`}
    `, { valid: isFormValid(f), help: '' });
  }

  function renderCompSection(sec, si, scale, total, labels, locked) {
    const itemsHTML = (sec.items || []).map((it, ii) => renderCompItem(it, si, ii, scale, sec.items.length, labels, locked)).join('');
    return `
      <div data-et-sec="${si}" style="border:1px solid var(--color-border);border-radius:var(--radius-md);padding:14px 16px;background:var(--color-surface);">
        <header style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:var(--radius-sm);background:var(--color-surface-alt);font-size:var(--fs-xs);font-weight:var(--fw-semibold);color:var(--color-text-sub);">${si + 1}</span>
          <input type="text" class="input" data-et-sec-name="${si}" value="${esc(sec.name || '')}" placeholder="분야명 (예: 리더십)" style="flex:1;max-width:320px;font-weight:var(--fw-semibold);" ${locked ? 'disabled' : ''} />
          <span style="display:inline-flex;align-items:center;gap:5px;font-size:var(--fs-sm);color:var(--color-text-sub);">
            배점
            <input type="number" min="0" max="100" class="input" data-et-sec-score="${si}" value="${Number(sec.score) || 0}" style="width:72px;text-align:right;" ${locked ? 'disabled' : ''} />
            <span style="color:var(--color-text-muted);">점</span>
          </span>
          <span style="flex:1;"></span>
          ${locked ? '' : `<button class="btn btn--xs btn--soft-danger" type="button" data-et-sec-del="${si}" ${total <= 1 ? 'disabled' : ''}>분야 삭제</button>`}
        </header>
        <table class="tbl tbl--bordered" style="margin-bottom:8px;">
          <thead>
            <tr>
              <th style="width:40px;text-align:center;">#</th>
              <th>평가 항목</th>
              <th style="width:90px;text-align:center;">배점</th>
              <th style="width:240px;text-align:center;">미리보기 (${scale}점)</th>
              ${locked ? '' : `<th style="width:60px;text-align:center;">삭제</th>`}
            </tr>
          </thead>
          <tbody>${itemsHTML}</tbody>
        </table>
        <div data-et-sec-itemsum-wrap="${si}" style="margin-bottom:8px;text-align:right;">${itemSumBadge(sec)}</div>
        ${locked ? '' : `<button class="btn btn--xs" type="button" data-et-item-add="${si}">+ 항목 추가</button>`}
      </div>
    `;
  }

  function renderCompItem(it, si, ii, scale, total, labels, locked) {
    const safeLabels = (Array.isArray(labels) && labels.length === scale) ? labels : (DEFAULT_SCALE_LABELS[scale] || []);
    let preview = '';
    for (let i = 0; i < scale; i++) {
      const label = safeLabels[i] || String(i + 1);
      const display = (scale === 5 && label === DEFAULT_SCALE_LABELS[5][i]) ? esc(label).replace(' ', '<br>') : esc(label);
      preview += `<label class="cb" style="display:inline-flex;flex-direction:column;align-items:center;margin:0 2px;font-size:10px;color:var(--color-text-muted);min-width:38px;line-height:1.15;">
        <input type="radio" name="et-prev-${si}-${ii}" disabled />
        <span data-et-prev-lab="${i}" style="margin-top:2px;text-align:center;">${display}</span>
      </label>`;
    }
    return `
      <tr data-et-item-row="${si}-${ii}">
        <td style="text-align:center;color:var(--color-text-muted);font-size:var(--fs-xs);">${ii + 1}</td>
        <td>
          <input type="text" class="input" data-et-item-text="${si}-${ii}" value="${esc(it.text || '')}" placeholder="평가 항목 문장 (예: 구성원들을 잘 이끌 수 있다.)" style="width:100%;" ${locked ? 'disabled' : ''} />
        </td>
        <td style="text-align:center;">
          <input type="number" min="0" max="100" class="input" data-et-item-score="${si}-${ii}" value="${Number(it.score) || 0}" style="width:64px;text-align:right;" ${locked ? 'disabled' : ''} />
        </td>
        <td style="text-align:center;">${preview}</td>
        ${locked ? '' : `<td style="text-align:center;">
          <button class="btn btn--xs btn--soft-danger" type="button" data-et-item-del="${si}-${ii}" ${total <= 1 ? 'disabled' : ''}>삭제</button>
        </td>`}
      </tr>
    `;
  }

  function bindStep1(pageEl) {
    const f = STATE.form;
    const comp = f.competency;

    /* 척도 변경 — 미리보기 재렌더 */
    pageEl.querySelectorAll('input[name="et-f-scale"]').forEach(r => r.addEventListener('change', () => {
      comp.scale = Number(r.value);
      reRender();
    }));
    /* 척도별 명칭 — 입력 즉시 미리보기 surgical 반영 */
    pageEl.querySelectorAll('[data-et-f-scale-label]').forEach(inp => inp.addEventListener('input', () => {
      const i = Number(inp.dataset.etFScaleLabel);
      normalizeScaleLabels(comp);
      comp.scaleLabels[comp.scale][i] = inp.value;
      const shown = inp.value || String(i + 1);
      pageEl.querySelectorAll(`[data-et-prev-lab="${i}"]`).forEach(span => { span.textContent = shown; });
    }));
    /* 분야 추가 — 신규 분야/항목 배점은 0 으로(기존 배점 보존, 부족분은 배지로 안내) */
    const addSec = pageEl.querySelector('[data-et-sec-add]');
    if (addSec) addSec.addEventListener('click', () => {
      comp.sections.push({ id: uid('sec'), name: '', score: 0, items: [{ id: uid('it'), text: '', score: 0 }] });
      reRender();
    });

    const host = pageEl.querySelector('[data-et-sections]');
    if (!host) return;
    host.addEventListener('input', (e) => {
      const sn = e.target.closest('[data-et-sec-name]');
      if (sn) { comp.sections[Number(sn.dataset.etSecName)].name = sn.value; return; }
      const it = e.target.closest('[data-et-item-text]');
      if (it) {
        const [si, ii] = it.dataset.etItemText.split('-').map(Number);
        comp.sections[si].items[ii].text = it.value;
        return;
      }
      /* 분야 배점 — 합계 배지 surgical 갱신 (포커스 유지를 위해 reRender 안 함) */
      const ss = e.target.closest('[data-et-sec-score]');
      if (ss) {
        const si = Number(ss.dataset.etSecScore);
        comp.sections[si].score = clampScore(ss.value);
        updateScoreIndicators(pageEl);
        return;
      }
      /* 항목 배점 */
      const is = e.target.closest('[data-et-item-score]');
      if (is) {
        const [si, ii] = is.dataset.etItemScore.split('-').map(Number);
        comp.sections[si].items[ii].score = clampScore(is.value);
        updateScoreIndicators(pageEl);
        return;
      }
    });
    host.addEventListener('click', (e) => {
      const secDel = e.target.closest('[data-et-sec-del]');
      if (secDel) {
        const si = Number(secDel.dataset.etSecDel);
        if (comp.sections.length <= 1) return;
        if (!confirm(`「${comp.sections[si].name || '분야'}」 분야를 삭제하시겠습니까?`)) return;
        comp.sections.splice(si, 1);
        reRender();
        return;
      }
      const itAdd = e.target.closest('[data-et-item-add]');
      if (itAdd) {
        const si = Number(itAdd.dataset.etItemAdd);
        comp.sections[si].items.push({ id: uid('it'), text: '', score: 0 });
        reRender();
        return;
      }
      const itDel = e.target.closest('[data-et-item-del]');
      if (itDel) {
        const [si, ii] = itDel.dataset.etItemDel.split('-').map(Number);
        const items = comp.sections[si].items;
        if (items.length <= 1) return;
        items.splice(ii, 1);
        reRender();
      }
    });
    /* 배점 입력 확정(blur) 시 위저드 충족 여부 재계산 위해 reRender */
    host.addEventListener('change', (e) => {
      if (e.target.closest('[data-et-sec-score]') || e.target.closest('[data-et-item-score]')) reRender();
    });
  }

  /* 정수 0~100 클램프 */
  function clampScore(v) {
    let n = parseInt(v, 10);
    if (isNaN(n)) n = 0;
    return Math.max(0, Math.min(100, n));
  }
  /* 분야 배점 합계 + 분야별 항목 합계 배지 surgical 갱신 (포커스 유지) */
  function updateScoreIndicators(pageEl) {
    const comp = STATE.form && STATE.form.competency;
    if (!comp) return;
    const totVal = pageEl.querySelector('[data-et-score-total-val]');
    if (totVal) {
      const sum = sumSectionScores(comp);
      totVal.textContent = sum;
      totVal.style.color = (sum === 100) ? 'var(--color-success)' : 'var(--color-danger)';
    }
    (comp.sections || []).forEach((sec, si) => {
      const wrap = pageEl.querySelector(`[data-et-sec-itemsum-wrap="${si}"]`);
      if (wrap) wrap.innerHTML = itemSumBadge(sec);
    });
  }
  /* 평가자 배분율 합계 배지 surgical 갱신 */
  function updateWeightIndicator(pageEl) {
    const proc = STATE.form && STATE.form.process && STATE.form.process[EL];
    if (!proc) return;
    const el = pageEl.querySelector('[data-et-weight-total-val]');
    if (!el) return;
    const sum = procTotalWeight(proc);
    el.textContent = sum + '%';
    el.style.color = (sum === 100) ? 'var(--color-success)' : 'var(--color-danger)';
  }

  /* =========================================================
   *  Step 2 — 상세 설정 (기본정보 / 프로세스 / 등급 / 고급)
   * ========================================================= */
  function renderDetailStep2(f, locked) {
    return `
      ${sectionProcess(f, locked)}
      ${section5Grading(f, locked)}
      ${section6Advanced(f, locked)}
    `;
  }

  /* ===== 기본 정보 ===== */
  function isBasicValid(f) { return !!(f.name && f.name.trim()); }
  function sectionBasic(f, locked) {
    const req = `<span style="color:var(--color-danger);">*</span>`;
    const idValue = !STATE.editingId ? generateId() : (f.id || '-');
    return sectionWrap(1, '기본 정보', '', `
      <div class="fm-tbl fm-tbl--compact fm-tbl--bordered fm-tbl--form">
        <div class="fm-tbl__row fm-tbl__row--2">
          <div class="fm-tbl__label">양식 번호</div>
          <div class="fm-tbl__value">
            <input type="text" class="input" value="${esc(idValue)}" style="width:100%;max-width:200px;background:var(--color-surface-alt);" disabled />
          </div>
          <div class="fm-tbl__label">사용 여부 ${req}</div>
          <div class="fm-tbl__value">
            <div style="display:flex;gap:8px;">
              <label class="cb cb--pill" style="padding:5px 14px;font-size:var(--fs-sm);"><input type="radio" name="et-f-use" value="Y" ${f.useYn ? 'checked' : ''} ${locked ? 'disabled' : ''} /><span>사용</span></label>
              <label class="cb cb--pill" style="padding:5px 14px;font-size:var(--fs-sm);"><input type="radio" name="et-f-use" value="N" ${!f.useYn ? 'checked' : ''} ${locked ? 'disabled' : ''} /><span>미사용</span></label>
            </div>
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label">양식명 ${req}</div>
          <div class="fm-tbl__value">
            <input type="text" class="input" id="et-f-name" value="${esc(f.name)}" placeholder="예: 정기 인사평가" style="width:100%;max-width:480px;" ${locked ? 'disabled' : ''} />
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label">설명</div>
          <div class="fm-tbl__value">
            <input type="text" class="input" id="et-f-desc" value="${esc(f.description)}" placeholder="양식에 대한 설명 (선택)" style="width:100%;" ${locked ? 'disabled' : ''} />
          </div>
        </div>
      </div>
    `, { valid: isBasicValid(f) });
  }

  /* ===== 평가 프로세스 (역량) ===== */
  function isProcessValid(f) {
    const proc = f.process && f.process[EL];
    if (!proc || !(proc.stages || []).length) return false;
    if (!proc.stages.every(s => !!s.role)) return false;
    /* 자기평가(사용 시) + 평가자별 배분율(비중) 합계는 100% 여야 함 */
    if (procTotalWeight(proc) !== 100) return false;
    return true;
  }
  function ensureProc() {
    if (!STATE.form.process) STATE.form.process = {};
    if (!STATE.form.process[EL]) STATE.form.process[EL] = { selfEval: false, stages: [{ role: 'part_lead', weight: 100 }] };
  }
  function sectionProcess(f, locked) {
    const proc = (f.process && f.process[EL]) || { selfEval: false, stages: [{ role: 'part_lead', weight: 100 }] };
    normalizeStageWeights(proc);
    const stages = proc.stages || [];

    const flowChips = []
      .concat(proc.selfEval ? [`본인 (${Number(proc.selfWeight) || 0}%)`] : [])
      .concat(stages.map((s, i) => `${i + 1}단계: ${roleLabel(s.role)} (${Number(s.weight) || 0}%)`))
      .concat(['확정'])
      .map((label, i, arr) => `
        <span style="display:inline-flex;align-items:center;gap:4px;">
          <span style="padding:2px 8px;border-radius:var(--radius-pill);background:var(--color-surface);border:1px solid var(--color-border);font-size:var(--fs-xs);color:var(--color-text-sub);">${esc(label)}</span>
          ${i < arr.length - 1 ? '<span style="color:var(--color-text-muted);">→</span>' : ''}
        </span>
      `).join('');

    const stagesHTML = stages.map((s, i) => {
      const opts = EVALUATOR_ROLES.map(r => `<option value="${esc(r.key)}" ${s.role === r.key ? 'selected' : ''}>${esc(r.label)}</option>`).join('');
      const isLast = (i === stages.length - 1);
      return `
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:var(--color-active);color:var(--color-brand-primary);font-size:var(--fs-xs);font-weight:var(--fw-semibold);">${i + 1}</span>
          <select class="select" data-et-stage="${i}" style="flex:1;max-width:260px;" ${locked ? 'disabled' : ''}>${opts}</select>
          <span style="display:inline-flex;align-items:center;gap:5px;font-size:var(--fs-sm);color:var(--color-text-sub);">
            비중
            <input type="number" min="0" max="100" class="input" data-et-stage-weight="${i}" value="${Number(s.weight) || 0}" style="width:68px;text-align:right;" ${locked ? 'disabled' : ''} />
            <span style="color:var(--color-text-muted);">%</span>
          </span>
          ${(isLast && stages.length > 1 && !locked)
            ? `<button class="btn btn--xs btn--soft-danger" type="button" data-et-stage-del>− 단계 삭제</button>`
            : ''}
        </div>
      `;
    }).join('');

    const wsum = procTotalWeight(proc);
    const wOk = wsum === 100;
    const weightTotalHTML = `<div data-et-weight-total style="margin-top:10px;font-size:var(--fs-sm);font-weight:var(--fw-medium);color:var(--color-text-sub);">
      배분율(비중) 합계: <strong data-et-weight-total-val style="color:${wOk ? 'var(--color-success)' : 'var(--color-danger)'};">${wsum}%</strong>
      <small style="color:var(--color-text-muted);">/ 100% ${proc.selfEval ? '(자기평가 포함)' : ''}</small>
      <small style="margin-left:6px;color:var(--color-text-muted);">예) 자기 10% · 1차 30% · 2차 60%</small>
    </div>`;

    const addBtn = (stages.length < 3 && !locked)
      ? `<button class="btn btn--sm" type="button" data-et-stage-add style="margin-top:10px;">+ 평가자 단계 추가</button>`
      : '';

    return sectionWrap(3, '평가 프로세스', '', `
      <div style="border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden;">
        <header style="padding:10px 16px;background:var(--color-surface-alt);border-bottom:1px solid var(--color-border);display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <strong style="font-size:var(--fs-md);">역량</strong>
          <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">${flowChips}</div>
        </header>
        <div style="padding:16px 20px;display:grid;grid-template-columns:140px 1fr;gap:16px 20px;align-items:start;">
          <label class="form-label" style="margin:0;padding-top:6px;">자기평가</label>
          <div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              <label class="cb cb--pill" style="padding:6px 14px;font-size:var(--fs-sm);"><input type="radio" name="et-f-self" value="Y" data-et-self ${proc.selfEval ? 'checked' : ''} ${locked ? 'disabled' : ''} /><span>사용</span></label>
              <label class="cb cb--pill" style="padding:6px 14px;font-size:var(--fs-sm);"><input type="radio" name="et-f-self" value="N" data-et-self ${!proc.selfEval ? 'checked' : ''} ${locked ? 'disabled' : ''} /><span>미사용</span></label>
              ${proc.selfEval ? `<span style="display:inline-flex;align-items:center;gap:5px;margin-left:8px;font-size:var(--fs-sm);color:var(--color-text-sub);">
                비중
                <input type="number" min="0" max="100" class="input" data-et-self-weight value="${Number(proc.selfWeight) || 0}" style="width:68px;text-align:right;" ${locked ? 'disabled' : ''} />
                <span style="color:var(--color-text-muted);">%</span>
              </span>` : ''}
            </div>
            <div class="form-help">자기평가는 평가자 단계와 별개로 본인이 먼저 입력하는 사전 단계이며, 비중은 평가자 단계와 합산하여 100% 가 되어야 합니다.</div>
          </div>

          <label class="form-label" style="margin:0;padding-top:6px;">평가자 단계</label>
          <div>
            <div style="display:flex;flex-direction:column;gap:8px;">${stagesHTML}</div>
            ${weightTotalHTML}
            ${addBtn}
          </div>
        </div>
      </div>
    `, { valid: isProcessValid(f) });
  }

  /* ===== 평가 등급 산정 ===== */
  function isSection5Valid(f) {
    const grades = (f.grading.grades || []);
    if (grades.length < 3 || grades.length > 10) return false;
    if (!grades.every(g => g.name && g.name.trim())) return false;
    if (f.grading.mode === 'relative') {
      if (!grades.every(g => Number(g.ratio) > 0)) return false;
      const sum = grades.reduce((s, g) => s + (Number(g.ratio) || 0), 0);
      if (sum !== 100) return false;
    } else if (f.grading.mode === 'mixed') {
      const relGrades = grades.filter(g => g.mode === 'relative');
      if (relGrades.length) {
        if (!relGrades.every(g => Number(g.ratio) > 0)) return false;
        const sum = relGrades.reduce((s, g) => s + (Number(g.ratio) || 0), 0);
        if (sum !== 100) return false;
      }
    }
    return true;
  }

  function section5Grading(f, locked) {
    const mode = f.grading.mode || 'absolute';
    const modeHTML = GRADING_MODES.map((m, i) => `
      <label class="cb-card" style="${i > 0 ? 'margin-left:10px;' : ''}flex:1;">
        <input type="radio" name="et-f-grademode" value="${esc(m.key)}" ${mode === m.key ? 'checked' : ''} ${locked ? 'disabled' : ''} />
        <div class="cb-card__body">
          <span class="cb-card__title">${esc(m.label)}</span>
          <span class="cb-card__desc">${esc(m.desc)}</span>
        </div>
      </label>
    `).join('');

    const grades = f.grading.grades || [];
    const tableHTML = renderGradeTable(grades, mode, locked);

    return sectionWrap(4, '평가 등급 산정', '', `
      <div style="display:flex;gap:10px;margin-bottom:14px;">${modeHTML}</div>
      ${mode === 'mixed' ? `
        <div style="padding:10px 14px;margin-bottom:12px;background:rgba(0,52,125,.04);border-left:3px solid var(--color-brand-primary);border-radius:0 var(--radius-md) var(--radius-md) 0;font-size:var(--fs-sm);color:var(--color-text);">
          혼합평가는 절대평가 조건을 먼저 적용한 뒤, 남은 대상자에게 상대평가 비율을 적용합니다.
        </div>
      ` : ''}
      ${tableHTML}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;gap:10px;flex-wrap:wrap;">
        <button class="btn btn--sm" type="button" data-et-grade-add ${(grades.length >= 10 || locked) ? 'disabled' : ''}>+ 등급 추가</button>
        ${(mode === 'relative' || mode === 'mixed') ? `
          <div data-et-grade-sum style="font-size:var(--fs-sm);color:var(--color-text-sub);font-weight:var(--fw-medium);">
            상대평가 비율 합계: <strong data-et-grade-sum-value style="color:var(--color-text);">0%</strong> <small style="color:var(--color-text-muted);">/ 100%</small>
          </div>
        ` : ''}
        <div style="font-size:var(--fs-xs);color:var(--color-text-muted);">등급은 최소 3개, 최대 10개까지.</div>
      </div>
    `, { valid: isSection5Valid(f) });
  }

  function updateGradeSumIndicator() {
    const pageEl = document.getElementById('page-hr-eval-type');
    if (!pageEl || !STATE.form) return;
    const mode = STATE.form.grading.mode;
    if (mode !== 'relative' && mode !== 'mixed') return;
    const grades = STATE.form.grading.grades || [];
    let hasZero = false;
    pageEl.querySelectorAll('[data-et-grade-ratio]').forEach((inp) => {
      const i = Number(inp.dataset.etGradeRatio);
      const g = grades[i];
      if (!g) return;
      const isRel = mode === 'relative' || g.mode === 'relative';
      if (!isRel) { inp.style.borderColor = ''; return; }
      const v = Number(g.ratio) || 0;
      if (v <= 0) { inp.style.borderColor = 'var(--color-danger)'; hasZero = true; }
      else { inp.style.borderColor = ''; }
    });

    const sum = grades.reduce((s, g) => {
      const include = mode === 'relative' || g.mode === 'relative';
      return s + (include ? (Number(g.ratio) || 0) : 0);
    }, 0);
    const valEl = pageEl.querySelector('[data-et-grade-sum-value]');
    if (!valEl) return;
    const wrap = valEl.closest('[data-et-grade-sum]');
    if (wrap) {
      let hint = wrap.querySelector('[data-et-grade-sum-hint]');
      if (hasZero) {
        if (!hint) {
          hint = document.createElement('div');
          hint.dataset.etGradeSumHint = '';
          hint.style.cssText = 'margin-top:4px;font-size:var(--fs-xs);color:var(--color-danger);';
          wrap.appendChild(hint);
        }
        hint.textContent = '⚠ 비율이 0% 인 등급이 있습니다. 모든 상대평가 등급은 0보다 크게 설정해야 합니다.';
      } else if (hint) { hint.remove(); }
    }
    valEl.textContent = sum + '%';
    if (sum === 100 && !hasZero) valEl.style.color = 'var(--color-success)';
    else if (sum > 100) valEl.style.color = 'var(--color-danger)';
    else valEl.style.color = 'var(--color-warning)';
  }

  function renderGradeTable(grades, mode, locked) {
    const headExtra =
      mode === 'absolute' ? `<th>점수 조건</th>` :
      mode === 'relative' ? `<th>상위 % (누적 범위)</th>` :
      `<th style="width:120px;">산정 방식</th><th>기준값</th>`;
    return `
      <table class="tbl tbl--bordered" data-et-grade-tbl>
        <thead>
          <tr>
            <th style="width:140px;">등급명</th>
            ${headExtra}
            <th style="width:90px;text-align:center;">삭제</th>
          </tr>
        </thead>
        <tbody>${renderGradeRows(grades, mode, locked)}</tbody>
      </table>
    `;
  }

  function renderGradeRows(grades, mode, locked) {
    let cum = 0;
    return grades.map((g, i) => {
      const gMode = (mode === 'mixed') ? (g.mode || 'relative') : mode;
      let cumStart = cum, cumEnd = cum;
      if (gMode === 'relative') { cumEnd = cum + (Number(g.ratio) || 0); cum = cumEnd; }
      return renderGradeRow(g, i, grades, mode, locked, { cumStart, cumEnd, gMode });
    }).join('');
  }

  function renderGradeRow(g, i, all, mode, locked, ctx) {
    const cumStart = (ctx && ctx.cumStart) || 0;
    const cumEnd   = (ctx && ctx.cumEnd)   || 0;
    const gMode    = (ctx && ctx.gMode)    || mode;

    const nameCell = `<td>
      <input type="text" class="input" value="${esc(g.name || '')}" data-et-grade-name="${i}" placeholder="예: S" style="width:120px;" ${locked ? 'disabled' : ''} />
    </td>`;
    function rangeSpan(text) {
      return `<span data-et-grade-range="${i}" class="t-muted" style="margin-left:8px;font-size:var(--fs-xs);">${esc(text)}</span>`;
    }

    let middleCell = '';
    if (mode === 'absolute') {
      const lo = Number(g.minScore) || 0;
      const next = all[i + 1];
      const range = next ? `~ ${Math.max(0, (Number(next.minScore) || 0))}점 미만` : `(최저)`;
      middleCell = `<td>
        <span style="display:inline-flex;align-items:center;gap:6px;">
          <input type="number" class="input" value="${lo}" data-et-grade-min="${i}" min="0" max="100" step="1" style="width:80px;text-align:right;" ${locked ? 'disabled' : ''} />
          <span style="color:var(--color-text-sub);">점 이상</span>
          ${rangeSpan(range)}
        </span>
      </td>`;
    } else if (mode === 'relative') {
      const range = `(상위 ${cumStart}% ~ ${cumEnd}%)`;
      middleCell = `<td>
        <span style="display:inline-flex;align-items:center;gap:6px;">
          <span style="color:var(--color-text-sub);">상위</span>
          <input type="number" class="input" value="${Number(g.ratio) || 0}" data-et-grade-ratio="${i}" min="0" max="100" step="1" style="width:80px;text-align:right;" ${locked ? 'disabled' : ''} />
          <span style="color:var(--color-text-sub);">%</span>
          ${rangeSpan(range)}
        </span>
      </td>`;
    } else { /* mixed */
      const opt = `<option value="absolute" ${gMode === 'absolute' ? 'selected' : ''}>절대평가</option><option value="relative" ${gMode === 'relative' ? 'selected' : ''}>상대평가</option>`;
      let valueInput = '';
      if (gMode === 'absolute') {
        const cutoff = Number(g.minScore) || 0;
        valueInput = `
          <input type="number" class="input" value="${cutoff}" data-et-grade-min="${i}" min="0" max="100" step="1" style="width:80px;text-align:right;" ${locked ? 'disabled' : ''} />
          <span style="color:var(--color-text-sub);margin-left:6px;">점 미만</span>
          ${rangeSpan(`(이 점수 미만 → 이 등급으로 먼저 분류)`)}
        `;
      } else {
        const range = `(상위 ${cumStart}% ~ ${cumEnd}%)`;
        valueInput = `
          <span style="color:var(--color-text-sub);">상위</span>
          <input type="number" class="input" value="${Number(g.ratio) || 0}" data-et-grade-ratio="${i}" min="0" max="100" step="1" style="width:80px;text-align:right;margin-left:6px;" ${locked ? 'disabled' : ''} />
          <span style="color:var(--color-text-sub);margin-left:6px;">%</span>
          ${rangeSpan(range)}
        `;
      }
      middleCell = `
        <td><select class="select" data-et-grade-mode="${i}" ${locked ? 'disabled' : ''}>${opt}</select></td>
        <td><span style="display:inline-flex;align-items:center;gap:0;">${valueInput}</span></td>
      `;
    }

    const delCell = `<td style="text-align:center;">
      <button class="btn btn--xs btn--soft-danger" type="button" data-et-grade-del="${i}" ${(all.length <= 3 || locked) ? 'disabled' : ''}>삭제</button>
    </td>`;

    return `<tr data-et-grade-row="${i}">${nameCell}${middleCell}${delCell}</tr>`;
  }

  function updateGradeRanges() {
    const pageEl = document.getElementById('page-hr-eval-type');
    if (!pageEl || !STATE.form) return;
    const grades = STATE.form.grading.grades || [];
    const mode = STATE.form.grading.mode || 'absolute';
    let cum = 0;
    grades.forEach((g, i) => {
      const span = pageEl.querySelector(`[data-et-grade-range="${i}"]`);
      if (!span) return;
      const gMode = (mode === 'mixed') ? (g.mode || 'relative') : mode;
      let text = '';
      if (gMode === 'absolute') {
        if (mode === 'mixed') {
          text = `(이 점수 미만 → 이 등급으로 먼저 분류)`;
        } else {
          const next = grades[i + 1];
          text = next ? `~ ${Math.max(0, (Number(next.minScore) || 0))}점 미만` : `(최저)`;
        }
      } else {
        const r = Number(g.ratio) || 0;
        text = `(상위 ${cum}% ~ ${cum + r}%)`;
        cum += r;
      }
      span.textContent = text;
    });
  }

  function onChangeGradeMode(mode) {
    STATE.form.grading.mode = mode;
    (STATE.form.grading.grades || []).forEach(g => {
      if (mode === 'absolute') g.mode = 'absolute';
      else if (mode === 'relative') g.mode = 'relative';
      else if (!g.mode) g.mode = 'relative';
    });
    reRender();
  }

  /* ===== 고급 설정 — 그룹별 등급 기준 ===== */
  function isSection6Valid(f) {
    if (!f.advanced || !f.advanced.groupGrading) return true;
    const adv = f.advanced.gradingRows || [];
    for (const r of adv) {
      if (!r.name || !r.name.trim()) return false;
      if (!r.condField || !(r.condValues || []).length) return false;
      if (!(r.grades && r.grades.length >= 3)) return false;
    }
    return true;
  }

  function section6Advanced(f, locked) {
    const on = !!f.advanced.groupGrading;
    const adv = (f.advanced.gradingRows || []).filter(r => r.id !== 'default');

    const s5Mode = gradingModeLabel(f.grading.mode || 'absolute');
    const s5Count = (f.grading.grades || []).length;
    const s5SummaryBox = on ? `
      <div style="margin-top:14px;padding:12px 14px;background:rgba(0,52,125,.04);border-left:3px solid var(--color-brand-primary);border-radius:0 var(--radius-md) var(--radius-md) 0;font-size:var(--fs-sm);">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <strong>기본 등급 기준:</strong>
          <span class="pill pill--soft-blue">${esc(s5Mode)}</span>
          <span class="t-muted">${s5Count}등급</span>
        </div>
      </div>
    ` : '';

    const advBody = on ? `
      ${s5SummaryBox}
      <table class="tbl tbl--bordered" style="margin-top:14px;">
        <thead>
          <tr>
            <th style="width:80px;text-align:center;">우선순위</th>
            <th style="width:140px;">기준명</th>
            <th>적용 조건</th>
            <th style="width:220px;text-align:center;" colspan="2">등급 정의</th>
            <th style="width:90px;text-align:center;">삭제</th>
          </tr>
        </thead>
        <tbody>${renderAdvancedRows(adv, locked)}</tbody>
      </table>
      ${locked ? '' : `<button class="btn btn--sm" type="button" data-et-adv-add style="margin-top:10px;">+ 그룹 추가</button>`}
    ` : '';

    return sectionWrap(5, '고급 설정', '', `
      <label class="switch" style="${locked ? 'opacity:.6;cursor:not-allowed;' : ''}">
        <input type="checkbox" data-et-adv-toggle ${on ? 'checked' : ''} ${locked ? 'disabled' : ''} />
        <span class="switch__box"></span>
        <span style="margin-left:8px;font-weight:var(--fw-medium);">그룹별 등급 기준 별도 적용</span>
      </label>
      <div class="form-help">일부 그룹에만 다른 등급 체계를 적용하고 싶을 때 사용합니다. (예: 생산직만 상/중/하)</div>
      ${advBody}
    `, { valid: isSection6Valid(f) });
  }

  function renderAdvancedRows(adv, locked) {
    if (!adv.length) {
      return `<tr><td colspan="6" style="text-align:center;color:var(--color-text-muted);padding:14px;">예외 그룹이 없습니다. [+ 그룹 추가] 로 추가하세요.</td></tr>`;
    }
    const sorted = adv.slice().sort((a, b) => (a.priority || 99) - (b.priority || 99));
    return sorted.map(r => {
      const priority = `<td style="text-align:center;">
        <input type="number" class="input" value="${r.priority || 1}" min="1" max="98" data-et-adv-priority="${esc(r.id)}" style="width:55px;text-align:center;" ${locked ? 'disabled' : ''} />
      </td>`;
      const name = `<td><input type="text" class="input" value="${esc(r.name || '')}" data-et-adv-name="${esc(r.id)}" style="width:130px;" ${locked ? 'disabled' : ''} /></td>`;
      const cond = `<td>${renderAdvancedConditionEditor(r, locked)}</td>`;
      const gradeModeLabelText = gradingModeLabel(r.gradingMode);
      const gradeCount = (r.grades || []).length;
      const editLabel = gradeCount > 0 ? `${esc(gradeModeLabelText)} · ${gradeCount}등급 편집` : `등급 미정 · 편집`;
      const editCell = `<td style="text-align:center;" colspan="2">
        <button class="btn btn--sm ${gradeCount === 0 ? 'btn--soft-warning' : 'btn--soft-primary'}" type="button" data-et-adv-edit="${esc(r.id)}" ${locked ? 'disabled' : ''}>${editLabel}</button>
      </td>`;
      const delCell = `<td style="text-align:center;"><button class="btn btn--xs btn--soft-danger" type="button" data-et-adv-del="${esc(r.id)}" ${locked ? 'disabled' : ''}>삭제</button></td>`;
      return `<tr data-et-adv-row="${esc(r.id)}">${priority}${name}${cond}${editCell}${delCell}</tr>`;
    }).join('');
  }

  function renderAdvancedConditionEditor(r, locked) {
    const fld = r.condField;
    const fieldOpts = `<option value="">조건 없음</option>` + GROUP_FIELDS.map(gf =>
      `<option value="${esc(gf.key)}" ${fld === gf.key ? 'selected' : ''}>${esc(gf.label)}</option>`
    ).join('');
    const valuesHTML = fld ? (() => {
      const ff = fieldByKey(fld); if (!ff) return '';
      return `
        <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
          ${ff.values.map(v => {
            const checked = (r.condValues || []).includes(v);
            return `
              <label class="cb cb--pill">
                <input type="checkbox" data-et-adv-cond-value="${esc(r.id)}|${esc(v)}" ${checked ? 'checked' : ''} ${locked ? 'disabled' : ''} />
                <span>${esc(v)}</span>
              </label>
            `;
          }).join('')}
        </div>
      `;
    })() : '';
    return `
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <select class="select" data-et-adv-cond-field="${esc(r.id)}" style="width:90px;" ${locked ? 'disabled' : ''}>${fieldOpts}</select>
        ${fld ? `<span style="color:var(--color-text-muted);">=</span>` : ''}
        ${valuesHTML}
      </div>
    `;
  }

  /* =========================================================
   *  EDITOR — Bind (step 별)
   * ========================================================= */
  function bindEditor(pageEl) {
    pageEl.querySelectorAll('[data-et-back]').forEach(b => b.addEventListener('click', exitEditor));

    const saveBtn = pageEl.querySelector('[data-et-save]');
    if (saveBtn) saveBtn.addEventListener('click', performSave);

    /* 섹션별 완료 체크 surgical update */
    const editorBody = pageEl.querySelector('#et-wz-body');
    if (editorBody) {
      editorBody.addEventListener('input',  () => updateSectionChecks());
      editorBody.addEventListener('change', () => updateSectionChecks());
    }

    bindBasic(pageEl);
    bindStep1(pageEl);
  }

  /* 기본 정보 바인딩 — Step 1 (기본 정보 섹션) */
  function bindBasic(pageEl) {
    const nameEl = pageEl.querySelector('#et-f-name');
    if (nameEl) nameEl.addEventListener('input', e => { STATE.form.name = e.target.value; });
    const descEl = pageEl.querySelector('#et-f-desc');
    if (descEl) descEl.addEventListener('input', e => { STATE.form.description = e.target.value; });
    pageEl.querySelectorAll('input[name="et-f-use"]').forEach(r => r.addEventListener('change', () => {
      const v = pageEl.querySelector('input[name="et-f-use"]:checked').value;
      STATE.form.useYn = (v === 'Y');
    }));
  }

  function bindStep2(pageEl) {
    /* 평가 프로세스 */
    pageEl.querySelectorAll('[data-et-self]').forEach(inp => inp.addEventListener('change', e => {
      if (!e.target.checked) return;
      ensureProc();
      const proc = STATE.form.process[EL];
      proc.selfEval = (e.target.value === 'Y');
      /* 자기평가를 켜면 비중 슬롯이 생기므로 기존 단계 비중을 덮어쓰지 않도록 0 으로 초기화 */
      if (proc.selfEval && proc.selfWeight == null) proc.selfWeight = 0;
      reRender();
    }));
    /* 자기평가 비중 — input 중 합계 배지 갱신, blur(change) 시 위저드 충족 재계산 */
    const selfW = pageEl.querySelector('[data-et-self-weight]');
    if (selfW) {
      selfW.addEventListener('input', () => {
        ensureProc();
        STATE.form.process[EL].selfWeight = clampScore(selfW.value);
        updateWeightIndicator(pageEl);
      });
      selfW.addEventListener('change', () => reRender());
    }
    pageEl.querySelectorAll('[data-et-stage]').forEach(sel => sel.addEventListener('change', e => {
      ensureProc();
      const stages = STATE.form.process[EL].stages;
      const i = Number(e.target.dataset.etStage);
      if (stages[i]) stages[i].role = e.target.value;
      reRender();
    }));
    /* 평가자별 배분율(비중) — input 중에는 합계 배지만 surgical 갱신, blur(change) 시 위저드 충족 재계산 */
    pageEl.querySelectorAll('[data-et-stage-weight]').forEach(inp => {
      inp.addEventListener('input', e => {
        ensureProc();
        const stages = STATE.form.process[EL].stages;
        const i = Number(e.target.dataset.etStageWeight);
        if (stages[i]) stages[i].weight = clampScore(e.target.value);
        updateWeightIndicator(pageEl);
      });
      inp.addEventListener('change', () => reRender());
    });
    const stageAdd = pageEl.querySelector('[data-et-stage-add]');
    if (stageAdd) stageAdd.addEventListener('click', () => {
      ensureProc();
      const stages = STATE.form.process[EL].stages;
      if (stages.length < 3) { stages.push({ role: 'part_lead', weight: 0 }); reRender(); }
    });
    const stageDel = pageEl.querySelector('[data-et-stage-del]');
    if (stageDel) stageDel.addEventListener('click', () => {
      ensureProc();
      const stages = STATE.form.process[EL].stages;
      if (stages.length > 1) { stages.pop(); reRender(); }
    });

    /* 평가 등급 산정 */
    pageEl.querySelectorAll('input[name="et-f-grademode"]').forEach(r => r.addEventListener('change', () => {
      const v = pageEl.querySelector('input[name="et-f-grademode"]:checked').value;
      onChangeGradeMode(v);
    }));
    pageEl.querySelectorAll('[data-et-grade-name]').forEach(inp => inp.addEventListener('input', e => {
      const i = Number(e.target.dataset.etGradeName);
      if (STATE.form.grading.grades[i]) STATE.form.grading.grades[i].name = e.target.value;
    }));
    pageEl.querySelectorAll('[data-et-grade-min]').forEach(inp => inp.addEventListener('input', e => {
      const i = Number(e.target.dataset.etGradeMin);
      if (STATE.form.grading.grades[i]) STATE.form.grading.grades[i].minScore = clamp100(e.target.value);
      updateGradeRanges();
    }));
    pageEl.querySelectorAll('[data-et-grade-ratio]').forEach(inp => inp.addEventListener('input', e => {
      const i = Number(e.target.dataset.etGradeRatio);
      const grades = STATE.form.grading.grades;
      if (!grades[i]) return;
      const isRelativeMode = STATE.form.grading.mode === 'relative'
        || (STATE.form.grading.mode === 'mixed' && grades[i].mode === 'relative');
      let v = clamp100(e.target.value);
      if (isRelativeMode) {
        const othersSum = grades.reduce((s, g, idx) => {
          if (idx === i) return s;
          const cnt = (STATE.form.grading.mode === 'relative' || g.mode === 'relative');
          return s + (cnt ? (Number(g.ratio) || 0) : 0);
        }, 0);
        const remaining = Math.max(0, 100 - othersSum);
        if (v > remaining) {
          v = remaining;
          e.target.value = v;
          window.toast && window.toast(`상대평가 누적 합이 100%를 초과할 수 없습니다. (가용 ${remaining}%)`, 'warning');
        }
      }
      grades[i].ratio = v;
      updateGradeRanges();
      updateGradeSumIndicator();
    }));
    pageEl.querySelectorAll('[data-et-grade-mode]').forEach(sel => sel.addEventListener('change', e => {
      const i = Number(e.target.dataset.etGradeMode);
      if (STATE.form.grading.grades[i]) { STATE.form.grading.grades[i].mode = e.target.value; reRender(); }
    }));
    pageEl.querySelectorAll('[data-et-grade-del]').forEach(b => b.addEventListener('click', e => {
      const i = Number(e.currentTarget.dataset.etGradeDel);
      if (STATE.form.grading.grades.length > 3) { STATE.form.grading.grades.splice(i, 1); reRender(); }
    }));
    const gradeAddBtn = pageEl.querySelector('[data-et-grade-add]');
    if (gradeAddBtn) gradeAddBtn.addEventListener('click', () => {
      if (STATE.form.grading.grades.length >= 10) return;
      const defaultMode = STATE.form.grading.mode === 'absolute' ? 'absolute' : 'relative';
      STATE.form.grading.grades.push({ key: uid('g'), name: '', mode: defaultMode, minScore: 0, ratio: 0 });
      reRender();
    });
    updateGradeSumIndicator();

    /* 고급 설정 */
    const advToggle = pageEl.querySelector('[data-et-adv-toggle]');
    if (advToggle) advToggle.addEventListener('change', e => {
      STATE.form.advanced.groupGrading = e.target.checked;
      reRender();
    });
    const advAddBtn = pageEl.querySelector('[data-et-adv-add]');
    if (advAddBtn) advAddBtn.addEventListener('click', () => {
      const cnt = (STATE.form.advanced.gradingRows.filter(r => r.id !== 'default')).length;
      STATE.form.advanced.gradingRows.push({
        id: uid('a'), name: '', condField: '', condValues: [],
        priority: cnt + 1, gradingMode: 'absolute', grades: [],
      });
      reRender();
    });
    pageEl.querySelectorAll('[data-et-adv-name]').forEach(inp => inp.addEventListener('input', e => {
      const r = STATE.form.advanced.gradingRows.find(x => x.id === e.target.dataset.etAdvName);
      if (r) r.name = e.target.value;
    }));
    pageEl.querySelectorAll('[data-et-adv-priority]').forEach(inp => inp.addEventListener('input', e => {
      const r = STATE.form.advanced.gradingRows.find(x => x.id === e.target.dataset.etAdvPriority);
      if (r) r.priority = clamp(e.target.value, 1, 98);
    }));
    pageEl.querySelectorAll('[data-et-adv-cond-field]').forEach(sel => sel.addEventListener('change', e => {
      const r = STATE.form.advanced.gradingRows.find(x => x.id === e.target.dataset.etAdvCondField);
      if (!r) return;
      r.condField = e.target.value;
      r.condValues = [];
      reRender();
    }));
    pageEl.querySelectorAll('[data-et-adv-cond-value]').forEach(cb => cb.addEventListener('change', e => {
      const [id, val] = e.target.dataset.etAdvCondValue.split('|');
      const r = STATE.form.advanced.gradingRows.find(x => x.id === id);
      if (!r) return;
      r.condValues = r.condValues || [];
      if (e.target.checked) { if (r.condValues.indexOf(val) === -1) r.condValues.push(val); }
      else { r.condValues = r.condValues.filter(v => v !== val); }
    }));
    pageEl.querySelectorAll('[data-et-adv-del]').forEach(b => b.addEventListener('click', e => {
      const id = e.currentTarget.dataset.etAdvDel;
      STATE.form.advanced.gradingRows = STATE.form.advanced.gradingRows.filter(x => x.id !== id);
      reRender();
    }));
    pageEl.querySelectorAll('[data-et-adv-edit]').forEach(b => b.addEventListener('click', e => {
      openAdvEditModal(e.currentTarget.dataset.etAdvEdit);
    }));
  }

  /* 섹션별 완료 체크 surgical update */
  function updateSectionChecks() {
    const pageEl = document.getElementById('page-hr-eval-type');
    if (!pageEl || !STATE.form) return;
    const validators = STATE.step === 1
      ? [{ num: 1, fn: isBasicValid }, { num: 2, fn: isFormValid }]
      : [{ num: 3, fn: isProcessValid }, { num: 4, fn: isSection5Valid }, { num: 5, fn: isSection6Valid }];
    const checkSVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
    validators.forEach(({ num, fn }) => {
      const section = pageEl.querySelector(`[data-et-section="${num}"]`);
      if (!section) return;
      const header = section.querySelector('header');
      if (!header) return;
      const valid = fn(STATE.form);
      const old = header.querySelector('[data-et-check]');
      if (valid && !old) {
        const span = document.createElement('span');
        span.setAttribute('data-et-check', '');
        span.style.cssText = 'margin-left:auto;display:inline-flex;align-items:center;gap:5px;color:var(--color-success);font-size:var(--fs-sm);font-weight:var(--fw-semibold);';
        span.innerHTML = `${checkSVG} 완료`;
        header.appendChild(span);
      } else if (!valid && old) {
        old.remove();
      }
    });
  }

  /* =========================================================
   *  EDITOR — Save & Validate
   * ========================================================= */
  function performSave() {
    const f = STATE.form;
    const err = validate(f);
    if (err) {
      window.toast && window.toast(err.msg, 'warning');
      if (err.step && err.step !== STATE.step) { STATE.step = err.step; reRender(); }
      return;
    }
    /* 신규 등록은 사유가 '최초 등록' 으로 자동 — 모달 없이 즉시 저장.
       기존 수정 / 새 버전 발행은 변경 사유 입력 모달을 띄우고, 입력값을 버전 이력에 기록. */
    if (!STATE.editingId) { commitSave('최초 등록'); return; }
    openReasonModal();
  }

  /* 실제 저장 — reason 을 버전 이력 changeReason 으로 기록 */
  function commitSave(reason) {
    const f = STATE.form;
    const now = nowDate();

    if (!STATE.editingId) {
      const id = generateId();
      const newType = deepClone(f);
      newType.id = id;
      newType.version = 'v1';
      newType.versionHistory = [{ v: 'v1', publishedAt: now, publisher: HR_NAME, changeReason: reason || '최초 등록', kind: 'create' }];
      newType.appliedRounds = [];
      newType.active = true;
      newType.updatedAt = now;
      newType.updatedBy = HR_NAME;
      STATE.types.unshift(newType);
      window.toast && window.toast(`${newType.name} 등록 완료`, 'success');
    } else {
      const idx = STATE.types.findIndex(t => t.id === STATE.editingId);
      if (idx < 0) { exitEditorSilently(); return; }
      const orig = STATE.types[idx];
      const updated = deepClone(f);
      updated.id = orig.id;
      updated.appliedRounds = orig.appliedRounds || [];
      updated.active = orig.active;
      updated.version = orig.version;
      /* 수정 사유를 수정 이력으로 누적 기록 (버전 발행 개념 없음 — 단순 수정 이력) */
      updated.versionHistory = (orig.versionHistory || []).concat([{ v: orig.version, publishedAt: now, publisher: HR_NAME, changeReason: reason, kind: 'edit' }]);
      updated.updatedAt = now;
      updated.updatedBy = HR_NAME;
      STATE.types[idx] = updated;
      window.toast && window.toast(`${updated.name} 수정 완료`, 'success');
    }

    exitEditorSilently();
  }

  /* ===== 변경 사유 입력 모달 (수정 / 새 버전 발행 공통) =====
     UI Kit 모달(.modal-backdrop / .modal) 재사용 — et-adv-edit-modal 과 동일 패턴. */
  function openReasonModal() {
    let modal = document.getElementById('et-reason-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'et-reason-modal';
      modal.className = 'modal-backdrop';
      modal.addEventListener('click', (e) => { if (e.target === modal) closeReasonModal(); });
      document.body.appendChild(modal);
    }
    const isVer = STATE.isNewVersion;
    const title = isVer ? '새 버전 발행 — 변경 사유' : '수정 사유 입력';
    const hint = isVer
      ? '직전 버전 대비 무엇을 변경하는지 기록합니다. 기존 적용 회차는 이전 버전을 그대로 유지합니다.'
      : '이번 수정에서 무엇을 바꾸는지 기록합니다. 버전 이력에 「수정」 으로 누적됩니다.';
    modal.innerHTML = `
      <div class="modal">
        <header class="modal__header">
          <div class="modal__title">${esc(title)}</div>
          <button class="modal__close" type="button" data-et-reason-close aria-label="닫기">✕</button>
        </header>
        <div class="modal__body">
          <div class="form-help" style="margin-bottom:10px;">${esc(hint)}</div>
          <textarea class="input" data-et-reason-input rows="3" placeholder="예: 리더십 분야 항목 배점 조정" style="width:100%;resize:vertical;min-height:72px;"></textarea>
          <div data-et-reason-error class="field-error" style="display:none;margin-top:6px;color:var(--color-danger);font-size:var(--fs-sm);">변경 사유를 입력해주세요.</div>
        </div>
        <footer class="modal__footer">
          <button class="btn" type="button" data-et-reason-cancel>취소</button>
          <button class="btn btn--primary" type="button" data-et-reason-confirm>${isVer ? '새 버전 발행' : '저장'}</button>
        </footer>
      </div>
    `;
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';

    const input = modal.querySelector('[data-et-reason-input]');
    const errEl = modal.querySelector('[data-et-reason-error]');
    modal.querySelectorAll('[data-et-reason-close], [data-et-reason-cancel]').forEach(b => b.addEventListener('click', closeReasonModal));
    if (input) input.addEventListener('input', () => {
      if (input.value.trim()) { input.classList.remove('is-invalid'); if (errEl) errEl.style.display = 'none'; }
    });
    modal.querySelector('[data-et-reason-confirm]').addEventListener('click', () => {
      const reason = (input && input.value.trim()) || '';
      if (!reason) {
        if (input) { input.classList.add('is-invalid'); input.focus(); }
        if (errEl) errEl.style.display = 'block';
        return;
      }
      closeReasonModal();
      commitSave(reason);
    });
    if (input) input.focus();
  }

  function closeReasonModal() {
    const m = document.getElementById('et-reason-modal');
    if (m) { m.classList.remove('is-open'); document.body.style.overflow = ''; }
  }

  function exitEditorSilently() {
    STATE.view = 'list';
    STATE.editingId = null;
    STATE.isNewVersion = false;
    STATE.form = null;
    renderListView(document.getElementById('page-hr-eval-type'));
  }

  /* validate — { msg, step } 반환 (정상이면 null). 양식(문항)만 검증. */
  function validate(f) {
    if (!f.name || !f.name.trim()) return { msg: '양식명을 입력해주세요.', step: 1 };

    const secs = (f.competency && f.competency.sections) || [];
    if (!secs.length) return { msg: '평가 양식의 분야를 1개 이상 추가해주세요.', step: 1 };
    if (secs.some(s => !s.name || !s.name.trim())) return { msg: '분야명을 모두 입력해주세요.', step: 1 };
    if (secs.some(s => !(s.items || []).length)) return { msg: '각 분야에 항목을 1개 이상 추가해주세요.', step: 1 };
    if (secs.some(s => s.items.some(it => !it.text || !it.text.trim()))) return { msg: '항목 문장을 모두 입력해주세요.', step: 1 };

    /* 배점 — 분야 합계 100점, 각 분야의 항목 배점 합계 = 분야 배점 */
    if (sumSectionScores(f.competency) !== 100) return { msg: '분야 배점의 합계가 100점이어야 합니다.', step: 1 };
    if (secs.some(s => sumItemScores(s) !== (Number(s.score) || 0))) {
      return { msg: '각 분야의 항목 배점 합계가 분야 배점과 일치해야 합니다.', step: 1 };
    }

    return null;
  }

  function generateId() {
    const max = STATE.types.reduce((m, t) => {
      const n = Number(String(t.id).replace(/^ET-/, ''));
      return Math.max(m, isFinite(n) ? n : 0);
    }, 0);
    return 'ET-' + String(max + 1).padStart(3, '0');
  }

  function nextVersion(cur) {
    const m = String(cur || 'v0').match(/^v(\d+)$/);
    return 'v' + ((m ? Number(m[1]) : 0) + 1);
  }

  /* =========================================================
   *  VIEW: DETAIL  (조회 전용)
   * ========================================================= */
  function openDetail(id) {
    STATE.view = 'detail';
    STATE.detailId = id;
    renderDetailView(document.getElementById('page-hr-eval-type'));
  }

  function renderDetailView(pageEl) {
    const t = STATE.types.find(r => r.id === STATE.detailId);
    if (!t) { STATE.view = 'list'; renderListView(pageEl); return; }

    pageEl.innerHTML = `
      <div class="page-bar">
        <button class="page-bar__back" type="button" data-et-detail-back>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          목록
        </button>
        <div class="page-bar__divider"></div>
        <div>
          <div class="page-bar__title">
            ${esc(t.name)}
            ${t.useYn ? '<span class="pill pill--success" style="margin-left:6px;">사용</span>' : '<span class="pill" style="margin-left:6px;">미사용</span>'}
            ${(t.appliedRounds || []).length > 0 ? `<span class="pill pill--soft-blue" style="margin-left:4px;">회차 연결 ${(t.appliedRounds || []).length}건</span>` : ''}
          </div>
        </div>
        <div class="page-bar__spacer" style="flex:1;"></div>
        <div class="page-bar__actions">
          <button class="btn btn--sm" type="button" data-et-detail-print>
            ${(window.Icons && window.Icons.printer) || ''} PDF 출력
          </button>
          <button class="btn btn--sm" type="button" data-et-detail-copy>복제</button>
          ${(t.appliedRounds || []).length === 0
            ? `<button class="btn btn--sm btn--primary" type="button" data-et-detail-edit>수정</button>`
            : ''}
        </div>
      </div>

      ${(t.appliedRounds || []).length > 0
        ? `<div style="padding:10px 28px;background:rgba(0,52,125,.04);border-bottom:1px solid var(--color-divider);font-size:var(--fs-sm);color:var(--color-text-sub);">이 양식은 평가회차에 연결되어 있어 수정·삭제할 수 없습니다. 변경이 필요하면 [복제] 후 새 양식으로 편집하세요.</div>`
        : ''}

      <div style="flex:1;min-height:0;overflow:auto;padding:24px 28px 40px;display:flex;flex-direction:column;gap:16px;background:var(--color-surface-alt);">
        ${detailSection1(t)}
        ${detailFormSection(t)}
        ${detailVersionBlock(t)}
      </div>
    `;
    pageEl.querySelector('[data-et-detail-back]').addEventListener('click', () => {
      STATE.view = 'list';
      STATE.detailId = null;
      renderListView(pageEl);
    });
    const editBtn = pageEl.querySelector('[data-et-detail-edit]');
    if (editBtn) editBtn.addEventListener('click', () => openEditor(t.id));
    const copyBtn = pageEl.querySelector('[data-et-detail-copy]');
    if (copyBtn) copyBtn.addEventListener('click', () => { attemptCopy(t.id); STATE.view = 'list'; STATE.detailId = null; renderListView(pageEl); });
    const printBtn = pageEl.querySelector('[data-et-detail-print]');
    if (printBtn) printBtn.addEventListener('click', () => printDetail(t));
  }

  /* 인쇄(PDF 미리보기) — 기본 정보 ~ 버전/적용 이력 콘텐츠만 모아 새 창에 렌더 후 브라우저 인쇄.
     앱 스타일시트를 그대로 링크해 화면과 동일한 모양으로 PDF 저장/인쇄할 수 있다. */
  function printDetail(t) {
    const content = `
      ${detailSection1(t)}
      ${detailFormSection(t)}
    `;
    const win = window.open('', '_blank', 'width=920,height=1040');
    if (!win) {
      window.toast && window.toast('팝업이 차단되었습니다. 인쇄하려면 팝업을 허용해 주세요.', 'warning');
      return;
    }
    const styleLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map(l => `<link rel="stylesheet" href="${l.href}">`).join('');
    const today = '2026-06-04';
    win.document.write(`<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>평가양식 - ${esc(t.name)}</title>
  ${styleLinks}
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    body { background:#fff; margin:0; padding:24px 28px; color:var(--color-text); }
    .et-print { max-width:186mm; margin:0 auto; display:flex; flex-direction:column; gap:16px; }
    .et-print__head {
      display:flex; align-items:flex-end; justify-content:space-between;
      border-bottom:2px solid var(--color-brand-primary); padding-bottom:12px; margin-bottom:4px;
    }
    .et-print__title { font-size:22px; font-weight:var(--fw-bold); color:var(--color-text); }
    .et-print__meta { text-align:right; font-size:12px; color:var(--color-text-muted); line-height:1.6; }
    .et-print__bar {
      position:sticky; top:0; display:flex; gap:8px; justify-content:flex-end;
      padding:10px 0; background:#fff; margin-bottom:4px;
    }
    .et-print section { break-inside:avoid; box-shadow:none !important; }
    .et-print table { break-inside:auto; }
    .et-print tr { break-inside:avoid; }
    @media print {
      .et-print__bar { display:none; }
      body { padding:0; }
      .et-print { max-width:none; }
      .et-print__head { border-bottom-color:#00347d; }
    }
  </style>
</head>
<body>
  <div class="et-print__bar">
    <button class="btn btn--sm" type="button" onclick="window.close()">닫기</button>
    <button class="btn btn--sm btn--primary" type="button" onclick="window.print()">인쇄 / PDF 저장</button>
  </div>
  <div class="et-print">
    <div class="et-print__head">
      <div>
        <div style="font-size:12px;color:var(--color-text-muted);margin-bottom:4px;">성원애드피아 · 역량평가 양식</div>
        <div class="et-print__title">${esc(t.name)}</div>
      </div>
      <div class="et-print__meta">
        양식 번호 <strong>${esc(t.id)}</strong><br/>
        출력일 ${today}<br/>
        출력자 ${esc(HR_NAME)}
      </div>
    </div>
    ${content}
  </div>
  <script>window.onload=function(){setTimeout(function(){try{window.print();}catch(e){}},400);};<\/script>
</body>
</html>`);
    win.document.close();
    win.focus();
  }

  function detailSection1(t) {
    const status = `${esc(t.id)} · 적용 회차 <strong>${(t.appliedRounds || []).length}건</strong>`;
    return sectionWrap(1, '기본 정보', '', `
      <div class="fm-tbl fm-tbl--compact fm-tbl--bordered">
        <div class="fm-tbl__row fm-tbl__row--2">
          <div class="fm-tbl__label">양식명</div>
          <div class="fm-tbl__value"><strong>${esc(t.name)}</strong></div>
          <div class="fm-tbl__label">사용 여부</div>
          <div class="fm-tbl__value">${t.useYn ? '<span class="pill pill--success">사용</span>' : '<span class="pill">미사용</span>'}</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label">설명</div>
          <div class="fm-tbl__value">${esc(t.description || '-')}</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--2">
          <div class="fm-tbl__label">양식 번호</div>
          <div class="fm-tbl__value"><code>${esc(t.id)}</code></div>
          <div class="fm-tbl__label">적용 회차 수</div>
          <div class="fm-tbl__value">${(t.appliedRounds || []).length}건</div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label">최종 수정</div>
          <div class="fm-tbl__value">${esc(t.updatedAt || '-')} <span class="t-muted">· ${esc(t.updatedBy || '-')}</span></div>
        </div>
      </div>
    `, { status });
  }

  function detailFormSection(t) {
    const comp = t.competency || { scale: 5, sections: [] };
    normalizeScaleLabels(comp);
    normalizeCompScores(comp);
    const scale = comp.scale || 5;
    const labels = comp.scaleLabels[scale] || DEFAULT_SCALE_LABELS[scale] || [];

    const labelChips = labels.map((lab, i) => `
      <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:var(--radius-pill);background:var(--color-surface-alt);border:1px solid var(--color-border);font-size:var(--fs-xs);color:var(--color-text-sub);">
        <strong style="color:var(--color-text);">${i + 1}점</strong><span>${esc(lab)}</span>
      </span>
    `).join('');

    const sectionsBody = (comp.sections || []).map(sec => {
      const items = sec.items || [];
      const groupHead = `
        <tr style="background:rgba(0,52,125,.04);">
          <td colspan="2" style="padding:8px 14px;font-weight:var(--fw-semibold);color:var(--color-brand-primary);font-size:var(--fs-sm);letter-spacing:0.2px;">
            ${esc(sec.name || '(이름 없음)')}
            <span style="margin-left:8px;color:var(--color-text-muted);font-weight:var(--fw-regular);font-size:var(--fs-xs);">${items.length} 항목</span>
          </td>
          <td style="padding:8px 14px;text-align:right;font-weight:var(--fw-semibold);color:var(--color-brand-primary);font-size:var(--fs-sm);">${Number(sec.score) || 0}점</td>
        </tr>`;
      const itemRows = items.length
        ? items.map((it, ii) => `
            <tr>
              <td style="text-align:center;color:var(--color-text-muted);font-size:var(--fs-xs);width:40px;">${ii + 1}</td>
              <td>${esc(it.text || '-')}</td>
              <td style="text-align:right;width:80px;color:var(--color-text-sub);">${Number(it.score) || 0}점</td>
            </tr>`).join('')
        : `<tr><td colspan="3" class="t-muted" style="text-align:center;padding:10px;">항목이 없습니다.</td></tr>`;
      return groupHead + itemRows;
    }).join('');

    const itemCnt = (comp.sections || []).reduce((s, sec) => s + (sec.items || []).length, 0);
    const totalScore = sumSectionScores(comp);
    const status = `${scale}점 · 분야 <strong>${(comp.sections || []).length}</strong> · 항목 <strong>${itemCnt}</strong> · 배점 합계 <strong>${totalScore}</strong>점`;

    return sectionWrap(2, '평가 양식 — 역량', '', `
      <h4 style="font-size:var(--fs-sm);font-weight:var(--fw-semibold);margin:0 0 8px;color:var(--color-text-sub);">척도 <small style="margin-left:8px;color:var(--color-text-muted);font-weight:var(--fw-regular);font-size:var(--fs-xs);">${scale}점 척도</small></h4>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;">${labelChips}</div>
      <h4 style="font-size:var(--fs-sm);font-weight:var(--fw-semibold);margin:0 0 8px;color:var(--color-text-sub);">분야 · 평가 항목 · 배점</h4>
      <table class="tbl tbl--bordered" style="width:100%;">
        <thead><tr><th style="width:40px;text-align:center;">#</th><th>평가 항목</th><th style="width:80px;text-align:right;">배점</th></tr></thead>
        <tbody>${sectionsBody || '<tr><td colspan="3" class="t-muted" style="text-align:center;padding:14px;">등록된 분야가 없습니다.</td></tr>'}</tbody>
      </table>
    `, { status });
  }

  function detailProcessSection(t) {
    const proc = (t.process && t.process[EL]) || { selfEval: false, stages: [] };
    normalizeStageWeights(proc);
    const stages = proc.stages || [];

    const flowChips = []
      .concat(proc.selfEval ? [`본인 (${Number(proc.selfWeight) || 0}%)`] : [])
      .concat(stages.map((s, i) => `${i + 1}단계: ${roleLabel(s.role)} (${Number(s.weight) || 0}%)`))
      .concat(['확정'])
      .map((label, i, arr) => `
        <span style="display:inline-flex;align-items:center;gap:4px;">
          <span style="padding:2px 8px;border-radius:var(--radius-pill);background:var(--color-surface);border:1px solid var(--color-border);font-size:var(--fs-xs);color:var(--color-text-sub);">${esc(label)}</span>
          ${i < arr.length - 1 ? '<span style="color:var(--color-text-muted);">→</span>' : ''}
        </span>
      `).join('');

    const stagesHTML = stages.length === 0
      ? `<div style="color:var(--color-text-muted);font-size:var(--fs-sm);">단계 미정의</div>`
      : stages.map((s, i) => `
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:var(--color-active);color:var(--color-brand-primary);font-size:var(--fs-xs);font-weight:var(--fw-semibold);">${i + 1}</span>
            <span style="color:var(--color-text);">${esc(roleLabel(s.role))}</span>
            <span style="margin-left:auto;font-size:var(--fs-sm);color:var(--color-text-sub);">비중 <strong style="color:var(--color-text);">${Number(s.weight) || 0}%</strong></span>
          </div>`).join('');

    const wsum = procTotalWeight(proc);
    const status = `역량 <span class="t-muted">(${proc.selfEval ? '자기평가 + ' : ''}${stages.length}단계 · 비중 합계 ${wsum}%)</span>`;

    return sectionWrap(3, '평가 프로세스', '', `
      <div style="border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden;">
        <header style="padding:10px 16px;background:var(--color-surface-alt);border-bottom:1px solid var(--color-border);display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <strong style="font-size:var(--fs-md);">역량</strong>
          <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">${flowChips}</div>
        </header>
        <div style="padding:16px 20px;display:grid;grid-template-columns:140px 1fr;gap:14px 20px;align-items:start;">
          <div class="form-label" style="margin:0;padding-top:2px;">자기평가</div>
          <div>${proc.selfEval
            ? `<span class="pill pill--success">사용</span> <span style="margin-left:8px;font-size:var(--fs-sm);color:var(--color-text-sub);">비중 <strong style="color:var(--color-text);">${Number(proc.selfWeight) || 0}%</strong></span>`
            : '<span class="pill">미사용</span>'}</div>
          <div class="form-label" style="margin:0;padding-top:2px;">평가자 단계</div>
          <div style="display:flex;flex-direction:column;gap:8px;">${stagesHTML}</div>
        </div>
      </div>
    `, { status });
  }

  function detailSection5(t) {
    const mode = t.grading.mode || 'absolute';
    const grades = t.grading.grades || [];
    const headExtra = mode === 'absolute' ? `<th>점수 조건</th>` :
                      mode === 'relative' ? `<th>상위 % (누적 범위)</th>` :
                      `<th style="width:120px;">산정 방식</th><th>기준값</th>`;
    let cum = 0;
    const bodyRows = grades.map((g, i) => {
      const next = grades[i + 1];
      let mid = '';
      const gMode = (mode === 'mixed') ? (g.mode || 'relative') : mode;
      if (gMode === 'absolute') {
        const score = Number(g.minScore) || 0;
        if (mode === 'mixed') {
          mid = `<strong>${score}점 미만</strong> <span class="t-muted" style="margin-left:6px;">(먼저 분류)</span>`;
        } else {
          mid = `<strong>${score}점 이상</strong>`;
          if (next) mid += ` <span class="t-muted" style="margin-left:6px;">~ ${Number(next.minScore) || 0}점 미만</span>`;
          else mid += ` <span class="t-muted" style="margin-left:6px;">(최저)</span>`;
        }
      } else {
        const r = Number(g.ratio) || 0;
        mid = `<span style="color:var(--color-text-sub);">상위</span> <strong>${r}%</strong> <span class="t-muted" style="margin-left:6px;">(상위 ${cum}% ~ ${cum + r}%)</span>`;
        cum += r;
      }
      const middleCell = mode === 'mixed'
        ? `<td><span class="pill ${gMode === 'absolute' ? 'pill--soft-blue' : 'pill--soft-info'}">${esc(gMode === 'absolute' ? '절대' : '상대')}</span></td><td>${mid}</td>`
        : `<td>${mid}</td>`;
      return `<tr><td><strong>${esc(g.name || '-')}</strong></td>${middleCell}</tr>`;
    }).join('');

    const status = `${esc(gradingModeLabel(mode))} · 등급 <strong>${grades.length}개</strong>`;

    return sectionWrap(4, '평가 등급 산정', '', `
      ${mode === 'mixed' ? `
        <div style="padding:10px 14px;margin-bottom:12px;background:rgba(0,52,125,.04);border-left:3px solid var(--color-brand-primary);border-radius:0 var(--radius-md) var(--radius-md) 0;font-size:var(--fs-sm);">
          혼합평가 — 절대평가 조건 먼저 적용 후, 남은 대상자에게 상대평가 비율 적용
        </div>` : ''}
      <table class="tbl tbl--bordered">
        <thead><tr><th style="width:140px;">등급명</th>${headExtra}</tr></thead>
        <tbody>${bodyRows || '<tr><td colspan="3" style="text-align:center;color:var(--color-text-muted);padding:14px;">등록된 등급이 없습니다.</td></tr>'}</tbody>
      </table>
    `, { status });
  }

  function detailSection6(t) {
    if (!t.advanced || !t.advanced.groupGrading) {
      return sectionWrap(5, '고급 설정', '', `
        <div style="min-height:80px;display:flex;align-items:center;justify-content:center;text-align:center;color:var(--color-text-muted);font-size:var(--fs-sm);">
          그룹별 등급 기준 별도 적용 미사용
        </div>
      `, { status: `<span class="t-muted">미사용</span>` });
    }
    const rows = (t.advanced.gradingRows || [])
      .filter(r => r.id !== 'default')
      .slice().sort((a, b) => (a.priority || 99) - (b.priority || 99));
    const bodyRows = rows.map(r => {
      const gCount = (r.grades || []).length;
      const editCellLabel = gCount > 0
        ? `<span class="pill pill--soft-blue">${esc(gradingModeLabel(r.gradingMode))}</span> <span class="t-muted" style="margin-left:6px;">${gCount}등급</span>`
        : `<span class="pill" style="background:rgba(245,158,11,.12);color:#B45309;">등급 미정</span>`;
      return `<tr>
        <td style="text-align:center;">${r.priority || 1}</td>
        <td><strong>${esc(r.name || '-')}</strong></td>
        <td>${esc(conditionText({ field: r.condField, values: r.condValues }))}</td>
        <td>${editCellLabel}</td>
      </tr>`;
    }).join('');

    const s5Mode = gradingModeLabel(t.grading.mode || 'absolute');
    const s5Count = (t.grading.grades || []).length;

    return sectionWrap(5, '고급 설정', '', `
      <div style="padding:12px 14px;margin-bottom:14px;background:rgba(0,52,125,.04);border-left:3px solid var(--color-brand-primary);border-radius:0 var(--radius-md) var(--radius-md) 0;font-size:var(--fs-sm);">
        <strong>기본 등급 기준:</strong> <span class="pill pill--soft-blue" style="margin-left:6px;">${esc(s5Mode)}</span> <span class="t-muted" style="margin-left:4px;">${s5Count}등급</span>
      </div>
      <table class="tbl tbl--bordered">
        <thead>
          <tr>
            <th style="width:80px;text-align:center;">우선순위</th>
            <th style="width:160px;">기준명</th>
            <th>적용 조건</th>
            <th style="width:220px;">등급 정의</th>
          </tr>
        </thead>
        <tbody>${bodyRows || '<tr><td colspan="4" style="text-align:center;color:var(--color-text-muted);padding:14px;">등록된 예외 그룹이 없습니다.</td></tr>'}</tbody>
      </table>
    `, { status: `사용 중 · 예외 <strong>${rows.length}</strong>그룹` });
  }

  /* 적용 회차 엔트리 정규화 — 문자열(레거시) / { round, version } 모두 허용.
     version 이 없으면(과거 데이터) 현재 버전으로 폴백. */
  function roundEntry(r, curVersion) {
    if (typeof r === 'string') return { round: r, version: curVersion || '' };
    return { round: (r && (r.round || r.id)) || '', version: (r && r.version) || curVersion || '' };
  }

  /* 버전 이력 구분 pill — kind 없으면 변경 사유로 추정 (레거시 폴백) */
  function versionKindPill(v) {
    let k = v.kind;
    if (!k) k = (v.changeReason === '최초 등록' || v.changeReason === '복제 등록') ? 'create' : 'version';
    if (k === 'create')  return '<span class="pill pill--soft-success">등록</span>';
    if (k === 'version') return '<span class="pill pill--soft-blue">새 버전</span>';
    if (k === 'edit')    return '<span class="pill">수정</span>';
    return '<span class="pill">-</span>';
  }

  function detailVersionBlock(t) {
    const history = t.versionHistory || [];
    const rounds = t.appliedRounds || [];
    const status = `수정 이력 <strong>${history.length}</strong>건 · 적용 회차 <strong>${rounds.length}</strong>건`;
    return `
      <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:20px 24px 22px;">
        <header style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--color-divider);">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-brand-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <h3 style="font-size:var(--fs-lg);font-weight:var(--fw-semibold);color:var(--color-text);">수정 이력 / 적용 회차</h3>
          <span style="margin-left:auto;font-size:var(--fs-sm);color:var(--color-text-sub);">${status}</span>
        </header>

        <h4 style="font-size:var(--fs-sm);font-weight:var(--fw-semibold);margin-bottom:8px;color:var(--color-text-sub);">수정 이력</h4>
        <table class="tbl tbl--bordered" style="margin-bottom:18px;">
          <thead><tr><th style="width:90px;text-align:center;">구분</th><th style="width:130px;">일자</th><th style="width:120px;">처리자</th><th>변경 사유</th></tr></thead>
          <tbody>${history.length
            ? history.slice().reverse().map(v => `<tr>
                  <td style="text-align:center;">${versionKindPill(v)}</td>
                  <td>${esc(v.publishedAt)}</td>
                  <td>${esc(v.publisher)}</td>
                  <td>${esc(v.changeReason || '-')}</td>
                </tr>`).join('')
            : '<tr><td colspan="4" style="text-align:center;color:var(--color-text-muted);padding:14px;">수정 이력이 없습니다.</td></tr>'}</tbody>
        </table>

        <h4 style="font-size:var(--fs-sm);font-weight:var(--fw-semibold);margin-bottom:8px;color:var(--color-text-sub);">적용 평가회차</h4>
        <table class="tbl tbl--bordered">
          <thead><tr><th style="width:220px;">회차 ID</th><th>비고</th></tr></thead>
          <tbody>${rounds.length
            ? rounds.map(r => {
                const e = roundEntry(r, t.version);
                return `<tr>
                  <td><code>${esc(e.round)}</code></td>
                  <td class="t-muted">연결됨</td>
                </tr>`;
              }).join('')
            : '<tr><td colspan="2" style="text-align:center;color:var(--color-text-muted);padding:14px;">적용된 평가회차가 없습니다.</td></tr>'}</tbody>
        </table>
      </section>
    `;
  }

  /* =========================================================
   *  VIEW: 단계·등급 설정 (전역 App.HREvalConfig 편집)
   * ========================================================= */
  function cfgStageSum(st) {
    return (st.self && st.self.on ? clampScore(st.self.weight) : 0)
      + clampScore(st.first.weight) + clampScore(st.second.weight) + clampScore(st.ceo.weight);
  }
  function cfgGroupSum(g) {
    return (g.tiers || []).reduce((s, t) => s + clampScore(t.ratio), 0);
  }

  /* ===== 단계·등급 설정 수정 이력 테이블 ===== */
  function renderConfigHistoryTable() {
    const rows = (App.HREvalConfig && App.HREvalConfig.history) ? App.HREvalConfig.history() : [];
    const bodyRows = rows.length
      ? rows.map((h, i) => {
          const no = rows.length - i;   // 최신이 위 · No 내림차순 (도메인 표준)
          return `
            <tr>
              <td style="text-align:center;color:var(--color-text-sub);">${no}</td>
              <td>${esc(h.reason || '-')}</td>
              <td style="text-align:center;white-space:nowrap;">${esc(h.by || '-')}</td>
              <td style="text-align:center;white-space:nowrap;">${esc(h.at || '-')}</td>
            </tr>`;
        }).join('')
      : `<tr><td colspan="4" style="text-align:center;color:var(--color-text-muted);padding:24px 0;">수정 이력이 없습니다.</td></tr>`;
    return `
      <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden;">
        <header style="padding:12px 16px;border-bottom:1px solid var(--color-divider);">
          <strong style="font-size:var(--fs-md);color:var(--color-text);">단계·등급 설정 수정 이력</strong>
        </header>
        <table class="tbl tbl--bordered" style="width:100%;">
          <thead>
            <tr>
              <th style="width:48px;text-align:center;">No</th>
              <th>수정 사유</th>
              <th style="width:120px;text-align:center;">수정자</th>
              <th style="width:150px;text-align:center;">수정일시</th>
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </section>`;
  }

  /* ===== 수정 사유 입력 모달 — 저장 시 사유 입력 후 적용 → 이력 누적 ===== */
  function openConfigReasonModal(onConfirm) {
    let host = document.getElementById('hret-reason-modal');
    if (!host) {
      host = document.createElement('div');
      host.id = 'hret-reason-modal';
      host.className = 'modal-backdrop';
      document.body.appendChild(host);
    }
    host.innerHTML = `
      <div class="modal" style="max-width:520px;">
        <div class="modal__header">
          <div class="modal__title">단계·등급 설정 수정 사유</div>
          <button class="modal__close" type="button" data-hret-reason-x aria-label="닫기">✕</button>
        </div>
        <div class="modal__body" style="background:var(--color-surface);padding:18px 20px;">
          <div class="form-field" style="margin-bottom:0;">
            <label class="form-label is-required">수정 사유</label>
            <textarea class="input input--full" rows="4" data-hret-reason-input placeholder="단계·비중·등급 명칭·비율 등 변경 사유를 작성해주세요."></textarea>
            <div class="field-error" data-hret-reason-err style="display:none;margin-top:6px;">수정 사유를 입력해주세요.</div>
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn" type="button" data-hret-reason-x>취소</button>
          <button class="btn btn--primary" type="button" data-hret-reason-ok>저장</button>
        </div>
      </div>`;
    host.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    const close = () => { host.classList.remove('is-open'); document.body.style.overflow = ''; };
    host.onclick = (e) => { if (e.target === host) close(); };
    host.querySelectorAll('[data-hret-reason-x]').forEach(b => b.addEventListener('click', close));
    const input = host.querySelector('[data-hret-reason-input]');
    const errEl = host.querySelector('[data-hret-reason-err]');
    host.querySelector('[data-hret-reason-ok]').addEventListener('click', () => {
      const val = (input.value || '').trim();
      if (!val) { if (errEl) errEl.style.display = ''; input.classList.add('is-invalid'); input.focus(); return; }
      close();
      if (typeof onConfirm === 'function') onConfirm(val);
    });
    if (input) {
      input.addEventListener('input', () => { input.classList.remove('is-invalid'); if (errEl) errEl.style.display = 'none'; });
      input.focus();
    }
  }

  function renderStageGradeView(pageEl) {
    STATE.view = 'stageGrade';
    STATE.settingsTab = 'stageGrade';
    if (!STATE.configDraft) STATE.configDraft = (App.HREvalConfig && App.HREvalConfig.get()) || null;
    const cfg = STATE.configDraft;
    if (!cfg) { pageEl.innerHTML = `${settingsTabBar('stageGrade')}<div style="padding:32px;color:var(--color-text-muted);">단계·등급 설정 모듈을 불러올 수 없습니다.</div>`; bindSettingsTabs(pageEl); return; }

    const roleOpts = (App.HREvalConfig.roleOptions() || []);
    const roleSelect = (cur, hook) => `<select class="select" data-cfg-role="${hook}" style="max-width:200px;">${
      roleOpts.map(r => `<option value="${esc(r.key)}" ${cur === r.key ? 'selected' : ''}>${esc(r.label)}</option>`).join('')
    }</select>`;
    const wInput = (val, hook) => `<span style="display:inline-flex;align-items:center;gap:5px;">
        <input type="number" min="0" max="100" class="input" data-cfg-weight="${hook}" value="${clampScore(val)}" style="width:72px;text-align:right;" />
        <span style="color:var(--color-text-muted);">%</span></span>`;

    const st = cfg.stages;

    /* 흐름 chips — 저장본이 아닌 편집 중 draft(cfg.stages) 기준으로 생성해야
       본인평가 사용/미사용 토글이 상단 뱃지에 즉시 반영된다. */
    const draftFlow = [];
    if (st.self && st.self.on) draftFlow.push({ label: '본인', weight: clampScore(st.self.weight) });
    draftFlow.push({ label: '1차 · ' + App.HREvalConfig.roleLabel(st.first.role),  weight: clampScore(st.first.weight) });
    draftFlow.push({ label: '2차 · ' + App.HREvalConfig.roleLabel(st.second.role), weight: clampScore(st.second.weight) });
    draftFlow.push({ label: '대표이사', weight: clampScore(st.ceo.weight) });
    draftFlow.push({ label: '확정' });
    const flowChips = draftFlow.map((c, i, arr) => `
      <span style="display:inline-flex;align-items:center;gap:4px;">
        <span style="padding:2px 8px;border-radius:var(--radius-pill);background:var(--color-surface);border:1px solid var(--color-border);font-size:var(--fs-xs);color:var(--color-text-sub);">${esc(c.label)}${c.weight != null ? ` (${c.weight}%)` : ''}</span>
        ${i < arr.length - 1 ? '<span style="color:var(--color-text-muted);">→</span>' : ''}
      </span>`).join('');

    const wsum = cfgStageSum(st);
    const wOk = wsum <= 100;

    const stageCard = `
      <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:20px 24px 22px;">
        <header style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--color-divider);">
          <span style="display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;padding:0 8px;border-radius:var(--radius-sm);background:var(--color-brand-primary);color:#fff;font-size:var(--fs-sm);font-weight:var(--fw-bold);">1</span>
          <h3 style="font-size:var(--fs-lg);font-weight:var(--fw-semibold);">평가자 단계</h3>
        </header>
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:16px;">${flowChips}</div>
        <div class="fm-tbl fm-tbl--compact fm-tbl--bordered">
          <div class="fm-tbl__row fm-tbl__row--1">
            <div class="fm-tbl__label">본인평가</div>
            <div class="fm-tbl__value">
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <label class="cb cb--pill" style="padding:5px 14px;font-size:var(--fs-sm);"><input type="radio" name="cfg-self" value="Y" data-cfg-self ${st.self.on ? 'checked' : ''} /><span>사용</span></label>
                <label class="cb cb--pill" style="padding:5px 14px;font-size:var(--fs-sm);"><input type="radio" name="cfg-self" value="N" data-cfg-self ${!st.self.on ? 'checked' : ''} /><span>미사용</span></label>
                ${st.self.on ? `<span style="margin-left:8px;font-size:var(--fs-sm);color:var(--color-text-sub);">배분율 ${wInput(st.self.weight, 'self')}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="fm-tbl__row fm-tbl__row--2">
            <div class="fm-tbl__label">1차 평가자</div>
            <div class="fm-tbl__value">${roleSelect(st.first.role, 'first')} <span style="margin-left:8px;font-size:var(--fs-sm);color:var(--color-text-sub);">배분율 ${wInput(st.first.weight, 'first')}</span></div>
            <div class="fm-tbl__label">2차 평가자</div>
            <div class="fm-tbl__value">${roleSelect(st.second.role, 'second')} <span style="margin-left:8px;font-size:var(--fs-sm);color:var(--color-text-sub);">배분율 ${wInput(st.second.weight, 'second')}</span></div>
          </div>
          <div class="fm-tbl__row fm-tbl__row--1">
            <div class="fm-tbl__label">최종 평가자</div>
            <div class="fm-tbl__value"><span class="pill pill--soft-blue">대표이사</span> <span style="margin-left:8px;font-size:var(--fs-sm);color:var(--color-text-sub);">배분율 ${wInput(st.ceo.weight, 'ceo')}</span></div>
          </div>
        </div>
        <div style="margin-top:12px;font-size:var(--fs-sm);font-weight:var(--fw-medium);color:var(--color-text-sub);">
          배분율 합계: <strong data-cfg-weight-total style="color:${wOk ? 'var(--color-success)' : 'var(--color-danger)'};">${wsum}%</strong>
          <small style="color:var(--color-text-muted);">/ 100% 이내</small>
        </div>
      </section>`;

    const gradeCards = (cfg.grades || []).map((g, gi) => {
      const gsum = cfgGroupSum(g);
      const gOk = gsum <= 100;
      const catChips = (g.condValues || []).map(v => `<span class="pill">${esc(App.HREvalConfig.jobCatLabel(v))}</span>`).join(' ');
      const tierRows = (g.tiers || []).map((t, ti) => `
        <tr>
          <td style="text-align:center;color:var(--color-text-muted);font-size:var(--fs-xs);">${ti + 1}</td>
          <td><input type="text" class="input" data-cfg-tier-name="${gi}-${ti}" value="${esc(t.name)}" style="width:100%;max-width:160px;" /></td>
          <td style="text-align:center;"><span style="display:inline-flex;align-items:center;gap:5px;"><input type="number" min="0" max="100" class="input" data-cfg-tier-ratio="${gi}-${ti}" value="${clampScore(t.ratio)}" style="width:72px;text-align:right;" /><span style="color:var(--color-text-muted);">%</span></span></td>
        </tr>`).join('');
      return `
        <div style="border:1px solid var(--color-border);border-radius:var(--radius-md);padding:14px 16px;background:var(--color-surface);">
          <header style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
            <strong style="font-size:var(--fs-md);">${esc(g.groupName)}</strong>
            <span style="display:inline-flex;gap:4px;flex-wrap:wrap;">${catChips}</span>
          </header>
          <table class="tbl tbl--bordered">
            <thead><tr><th style="width:40px;text-align:center;">#</th><th>등급 명칭</th><th style="width:120px;text-align:center;">비율</th></tr></thead>
            <tbody>${tierRows}</tbody>
          </table>
          <div style="margin-top:8px;text-align:right;font-size:var(--fs-xs);font-weight:var(--fw-medium);color:${gOk ? 'var(--color-text-muted)' : 'var(--color-danger)'};">
            비율 합계 <strong data-cfg-grade-sum="${gi}">${gsum}</strong>% / 100% 이내
          </div>
        </div>`;
    }).join('');

    const gradeCard = `
      <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:20px 24px 22px;">
        <header style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--color-divider);">
          <span style="display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;padding:0 8px;border-radius:var(--radius-sm);background:var(--color-brand-primary);color:#fff;font-size:var(--fs-sm);font-weight:var(--fw-bold);">2</span>
          <h3 style="font-size:var(--fs-lg);font-weight:var(--fw-semibold);">평가 등급 산정</h3>
        </header>
        <div style="display:flex;flex-direction:column;gap:14px;">${gradeCards}</div>
      </section>`;

    pageEl.innerHTML = `
      ${settingsTabBar('stageGrade')}
      <div style="flex:1;min-height:0;overflow:auto;padding:18px 28px 28px;background:var(--color-surface-alt);">
        <div style="display:flex;flex-direction:column;gap:16px;">
          ${stageCard}
          ${gradeCard}
          ${renderConfigHistoryTable()}
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:12px 28px;border-top:1px solid var(--color-divider);background:var(--color-surface);">
        <small style="color:var(--color-text-muted);">모든 역량평가 회차가 이 설정을 상속합니다.</small>
        <div style="display:flex;gap:8px;">
          <button class="btn btn--sm" type="button" data-cfg-reset>되돌리기</button>
          <button class="btn btn--sm btn--primary" type="button" data-cfg-save>저장</button>
        </div>
      </div>
    `;
    bindStageGrade(pageEl);
  }

  function bindStageGrade(pageEl) {
    bindSettingsTabs(pageEl);
    const cfg = STATE.configDraft;
    const st = cfg.stages;

    pageEl.querySelectorAll('[data-cfg-self]').forEach(r => r.addEventListener('change', e => {
      if (!e.target.checked) return;
      st.self.on = (e.target.value === 'Y');
      renderStageGradeView(pageEl);
    }));
    pageEl.querySelectorAll('[data-cfg-role]').forEach(sel => sel.addEventListener('change', e => {
      const hook = e.target.dataset.cfgRole;
      st[hook].role = e.target.value;
      renderStageGradeView(pageEl);   // 흐름 chips 갱신
    }));
    pageEl.querySelectorAll('[data-cfg-weight]').forEach(inp => inp.addEventListener('input', e => {
      const hook = e.target.dataset.cfgWeight;
      st[hook].weight = clampScore(e.target.value);
      const totEl = pageEl.querySelector('[data-cfg-weight-total]');
      if (totEl) {
        const sum = cfgStageSum(st);
        totEl.textContent = sum + '%';
        totEl.style.color = sum <= 100 ? 'var(--color-success)' : 'var(--color-danger)';
      }
    }));

    pageEl.querySelectorAll('[data-cfg-tier-name]').forEach(inp => inp.addEventListener('input', e => {
      const [gi, ti] = e.target.dataset.cfgTierName.split('-').map(Number);
      cfg.grades[gi].tiers[ti].name = e.target.value;
    }));
    pageEl.querySelectorAll('[data-cfg-tier-ratio]').forEach(inp => inp.addEventListener('input', e => {
      const [gi, ti] = e.target.dataset.cfgTierRatio.split('-').map(Number);
      cfg.grades[gi].tiers[ti].ratio = clampScore(e.target.value);
      const sumEl = pageEl.querySelector(`[data-cfg-grade-sum="${gi}"]`);
      if (sumEl) {
        const sum = cfgGroupSum(cfg.grades[gi]);
        sumEl.textContent = sum;
        sumEl.closest('div').style.color = sum <= 100 ? 'var(--color-text-muted)' : 'var(--color-danger)';
      }
    }));

    const resetBtn = pageEl.querySelector('[data-cfg-reset]');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      STATE.configDraft = App.HREvalConfig.get();
      renderStageGradeView(pageEl);
      window.toast && window.toast('저장 전 상태로 되돌렸습니다.', 'info');
    });
    const saveBtn = pageEl.querySelector('[data-cfg-save]');
    if (saveBtn) saveBtn.addEventListener('click', () => saveStageGrade(pageEl));
  }

  function saveStageGrade(pageEl) {
    const cfg = STATE.configDraft;
    /* 인라인 검증 — 합계 100% 초과 금지 */
    if (cfgStageSum(cfg.stages) > 100) {
      const inp = pageEl.querySelector('[data-cfg-weight="ceo"]');
      if (inp && App.Forms) App.Forms.setFieldError(inp, '배분율 합계가 100%를 초과했습니다.');
      else window.toast && window.toast('평가자 배분율 합계가 100%를 초과했습니다.', 'warning');
      return;
    }
    for (let gi = 0; gi < cfg.grades.length; gi++) {
      if (cfgGroupSum(cfg.grades[gi]) > 100) {
        const inp = pageEl.querySelector(`[data-cfg-tier-ratio="${gi}-0"]`);
        if (inp && App.Forms) App.Forms.setFieldError(inp, `「${cfg.grades[gi].groupName}」 비율 합계가 100%를 초과했습니다.`);
        else window.toast && window.toast(`「${cfg.grades[gi].groupName}」 등급 비율 합계가 100%를 초과했습니다.`, 'warning');
        return;
      }
      if (cfg.grades[gi].tiers.some(t => !t.name || !t.name.trim())) {
        const inp = pageEl.querySelector(`[data-cfg-tier-name="${gi}-0"]`);
        if (inp && App.Forms) App.Forms.setFieldError(inp, '등급 명칭을 모두 입력해주세요.');
        else window.toast && window.toast('등급 명칭을 모두 입력해주세요.', 'warning');
        return;
      }
    }
    /* 수정 사유 모달 입력 후 적용 → 수정 이력 누적 */
    openConfigReasonModal((reason) => {
      App.HREvalConfig.save(cfg, reason);
      STATE.configDraft = App.HREvalConfig.get();
      window.toast && window.toast('단계·등급 설정이 저장되었습니다. 수정 이력에 반영됩니다.', 'success');
      renderStageGradeView(pageEl);
    });
  }

  /* =========================================================
   *  Public API — 회차 화면이 양식 목록을 단일 소스로 소비
   * ========================================================= */
  App.HREvalType = {
    /* 회차 등록 드롭다운/미리보기용 — {key, name, description, useYn, competency, appliedRounds} */
    listForms() {
      return ensureBuilt().map(t => ({
        key: t.id, name: t.name, description: t.description || '',
        useYn: t.useYn !== false, competency: deepClone(t.competency || { scale: 5, sections: [] }),
        appliedRounds: (t.appliedRounds || []).slice(),
      }));
    },
    getForm(key) {
      const t = ensureBuilt().find(x => x.id === key);
      if (!t) return null;
      return {
        key: t.id, name: t.name, description: t.description || '',
        useYn: t.useYn !== false, competency: deepClone(t.competency || { scale: 5, sections: [] }),
        appliedRounds: (t.appliedRounds || []).slice(),
      };
    },
    defaultScaleLabels(scale) { return (DEFAULT_SCALE_LABELS[scale] || []).slice(); },
  };

  /* =========================================================
   *  Page Init
   * ========================================================= */
  let built = false;
  function initPage() {
    const pageEl = document.getElementById('page-hr-eval-type');
    if (!pageEl) return;
    pageEl.__onShow = () => {
      ensureBuilt();
      STATE.view = 'list';
      STATE.settingsTab = 'form';
      STATE.configDraft = null;
      STATE.selectedIds.clear();
      renderListView(pageEl);
    };
  }
  const prev = App.initPages;
  App.initPages = function () {
    if (typeof prev === 'function') prev();
    initPage();
  };
})();
