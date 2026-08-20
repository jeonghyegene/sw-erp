/* =========================================================
 * Data module: 역량평가 단계·등급 전역 설정 (App.HREvalConfig)
 *
 *  「역량평가 설정 > 단계·등급 설정」 화면이 편집하고,
 *  「역량평가 회차」 화면이 상속(read-only)하는 전역 단일 소스.
 *
 *  ※ 피드백 반영: 평가자 단계·등급을 자유롭게 추가/삭제하던 구조가
 *     과하다 → 고정 구조(전역 단일)로 단순화.
 *
 *  평가자 단계
 *    본인평가(on/off) → 1차 → 2차 → 대표이사(고정) → 확정
 *    · 본인      : 사용/미사용, 배분율 기본 5%
 *    · 1차·2차   : 슬롯 2개 고정. 각 슬롯을 「사용/미사용」 스위치로 켜고 끈다(추가·삭제 없음).
 *                 평가자는 role(임원/본부장/팀장/소장/파트장/팀원/기타/직접 지정) 드롭다운 선택.
 *                 · 기타      = 위 목록에 없는 직책 — 조직에서 해당 직책자를 찾아 배정(없으면 상위 리더 대행)
 *                 · 직접 지정 = 회차 등록 시 대상자별로 평가자를 사람 단위로 직접 지정
 *    · 대표이사  : 최종 평가자 — 고정(삭제·미사용 불가), 배분율 기본 50%
 *    · 배분율 합계 ≤ 100% (미사용 단계는 합계에서 제외)
 *
 *  평가 등급 산정 (직군별 등급 tier — 직군마다 별도 등급 명칭·비율)
 *    · 사무직 : S 10 / A 20 / B 40 / C 20 / D 10
 *    · 연구직 : S 10 / A 20 / B 40 / C 20 / D 10
 *    · 생산직 : 최상 10 / 상 20 / 중 40 / 하 20 / 최하 10
 *    · 등급은 직군별로 최대 5개까지 추가 가능, 비율 합계 ≤ 100%
 *
 *  회차 배정용 stage key 는 사용 중인 단계 순서대로 '역량_0', '역량_1', …
 *  (evaluatorAssignments 데이터 모델 호환).
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  /* ============ 환경 ============ */
  const TODAY   = '2026-05-14';
  const HR_NAME = '정혜진';

  /* ============ 헬퍼 ============ */
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
  function uid(p) { return p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function num(n) { n = Number(n); return isFinite(n) ? n : 0; }

  /* ============ 평가자 role ============
   *  1차·2차 평가자는 아래 중 하나를 드롭다운으로 선택한다.
   *  · 직책 기준(임원~기타) : 대상자의 조직에서 해당 직책자를 찾아 자동 배정
   *  · 직접 지정            : 회차 등록 시 대상자별로 평가자를 직접 선택 */
  const ROLE_OPTIONS = [
    { key: 'exec',          label: '임원' },
    { key: 'hq_lead',       label: '본부장' },
    { key: 'team_lead',     label: '팀장' },
    { key: 'site_lead',     label: '소장' },
    { key: 'part_lead',     label: '파트장' },
    { key: 'member',        label: '팀원' },
    { key: 'other',         label: '기타' },
    { key: 'direct_assign', label: '직접 지정' },
  ];
  /* 구 role 키 (기존 저장 데이터 방어용) */
  const LEGACY_ROLE_LABEL = {
    office_lead: '실장', direct_sup: '직속 상급자',
    next_sup: '차상위 상급자', dept_head: '부서장', hr: 'HR 담당자',
  };
  function roleLabel(k) {
    if (k === 'ceo')  return '대표이사';
    if (k === 'self') return '본인';
    return (ROLE_OPTIONS.find(r => r.key === k) || {}).label || LEGACY_ROLE_LABEL[k] || '-';
  }

  /* ============ 등급 tier 개수 제한 ============ */
  const MAX_TIERS = 5;              // 직군별 등급 최대 개수
  const MIN_TIERS = 2;              // 직군별 등급 최소 개수

  /* ============ 직군 (member.jobCat 내부키 ↔ 표시명) ============ */
  const JOB_CAT_LABEL = { office: '사무직', production: '생산직', research: '연구직', outsource: '도급직' };
  function jobCatLabel(v) { return JOB_CAT_LABEL[v] || v || '-'; }

  /* ============ 평가자 단계 ============ */
  const MID_SLOTS = 2;              // 본인·대표이사 사이의 평가자 단계 슬롯 — 1차·2차 (고정)
  const SLOT_DEFAULT_ROLE = ['team_lead', 'hq_lead'];
  /* 구 role 키 → 신 role 키 (드롭다운 옵션과 불일치하는 값이 남지 않도록 이관) */
  const ROLE_MIGRATION = {
    office_lead: 'site_lead',       // 실장 → 소장 (동일 직책 서열)
    direct_sup: 'team_lead', next_sup: 'hq_lead', dept_head: 'team_lead', hr: 'direct_assign',
  };
  function migrateRole(r) {
    if (ROLE_OPTIONS.some(o => o.key === r)) return r;
    return ROLE_MIGRATION[r] || 'team_lead';
  }

  /* 저장 구조 정규화 — 구 { first, second } 고정 구조를 mid 배열로 이관 */
  function normalizeStages(st) {
    st = st || {};
    const self = { on: !!(st.self && st.self.on), weight: num(st.self && st.self.weight) };
    let mid = Array.isArray(st.mid) ? st.mid.slice() : null;
    if (!mid) {
      mid = [];
      if (st.first)  mid.push({ id: uid('stg'), role: st.first.role,  weight: num(st.first.weight),  on: st.first.on  !== false });
      if (st.second) mid.push({ id: uid('stg'), role: st.second.role, weight: num(st.second.weight), on: st.second.on !== false });
    }
    mid = mid.slice(0, MID_SLOTS).map(m => ({
      id: m.id || uid('stg'), role: migrateRole(m.role), weight: num(m.weight), on: m.on !== false,
    }));
    /* 슬롯 개수는 항상 MID_SLOTS 로 고정 — 부족하면 「미사용」 슬롯으로 채운다. */
    while (mid.length < MID_SLOTS) {
      mid.push({ id: uid('stg'), role: SLOT_DEFAULT_ROLE[mid.length] || 'team_lead', weight: 0, on: false });
    }
    return { self, mid, ceo: { weight: num(st.ceo && st.ceo.weight) } };
  }
  /* 실제 진행되는(사용 중) 평가자 단계만 */
  function activeMid(st) { return (st.mid || []).filter(m => m.on !== false); }

  /* ============ 기본값 ============ */
  function defaults() {
    return {
      stages: {
        self: { on: true, weight: 5 },
        mid: [
          { id: uid('stg'), role: 'team_lead', weight: 20, on: true },
          { id: uid('stg'), role: 'hq_lead',   weight: 25, on: true },
          { id: uid('stg'), role: 'exec',      weight: 0,  on: false },
        ],
        ceo:  { weight: 50 },
      },
      grades: [
        {
          id: uid('gg'), groupName: '사무직',
          condField: 'jobCategory', condValues: ['office'],
          tiers: [
            { name: 'S', ratio: 10 },
            { name: 'A', ratio: 20 },
            { name: 'B', ratio: 40 },
            { name: 'C', ratio: 20 },
            { name: 'D', ratio: 10 },
          ],
        },
        {
          id: uid('gg'), groupName: '연구직',
          condField: 'jobCategory', condValues: ['research'],
          tiers: [
            { name: 'S', ratio: 10 },
            { name: 'A', ratio: 20 },
            { name: 'B', ratio: 40 },
            { name: 'C', ratio: 20 },
            { name: 'D', ratio: 10 },
          ],
        },
        {
          id: uid('gg'), groupName: '생산직',
          condField: 'jobCategory', condValues: ['production'],
          tiers: [
            { name: '최상', ratio: 10 },
            { name: '상',   ratio: 20 },
            { name: '중',   ratio: 40 },
            { name: '하',   ratio: 20 },
            { name: '최하', ratio: 10 },
          ],
        },
      ],
      updatedAt: TODAY, updatedBy: HR_NAME,
    };
  }

  /* ============ STATE (mock 인메모리) ============ */
  let _cfg = null;
  let _history = [
    { at: '26/05/14   09:00', by: HR_NAME, reason: '최초 설정', kind: 'create' },
  ];
  function _ensure() { if (!_cfg) _cfg = defaults(); return _cfg; }

  /* 배분율 합계 — 사용 중인 단계만 합산 (미사용 단계·미사용 본인평가는 제외) */
  function sumStageWeights(st) {
    st = st || _ensure().stages;
    return (st.self && st.self.on ? num(st.self.weight) : 0)
      + activeMid(st).reduce((s, m) => s + num(m.weight), 0)
      + num(st.ceo && st.ceo.weight);
  }

  App.HREvalConfig = {
    /* ---- role ---- */
    roleOptions() { return ROLE_OPTIONS.slice(); },
    midSlots: MID_SLOTS,
    maxTiers: MAX_TIERS,
    minTiers: MIN_TIERS,
    normalizeStages,
    roleLabel,
    jobCatLabel,

    /* ---- 조회 ---- */
    get() { const c = deepClone(_ensure()); c.stages = normalizeStages(c.stages); return c; },
    stages() { return normalizeStages(_ensure().stages); },
    grades() { return deepClone(_ensure().grades); },
    sumStageWeights,

    /* 회차 대상자별 사람 배정이 필요한 단계 목록 (1차/2차).
       key 는 evaluatorAssignments[empId][key] 식별자 — 기존 '역량_N' 호환. */
    assignStages() {
      return activeMid(_ensure().stages).map((m, i) => ({
        key: '역량_' + i, order: i + 1, title: (i + 1) + '차 평가자', role: m.role,
      }));
    },

    /* 사용 중인 평가자 단계 [{id, role, weight}] — 회차가 process.stages 로 상속 */
    midStages() { return activeMid(_ensure().stages).map(m => deepClone(m)); },

    /* 표시용 전체 흐름 [{label, weight?}] — 본인(on)→1차→2차→대표이사→확정 */
    stageFlow() {
      const st = _ensure().stages;
      const flow = [];
      if (st.self && st.self.on) flow.push({ key: 'self', label: '본인', weight: num(st.self.weight) });
      activeMid(st).forEach((m, i) => {
        flow.push({ key: m.id, label: (i + 1) + '차 · ' + roleLabel(m.role), weight: num(m.weight) });
      });
      flow.push({ key: 'ceo',    label: '대표이사', weight: num(st.ceo.weight) });
      flow.push({ key: 'final',  label: '확정' });
      return flow;
    },

    /* 결과 유형 요약 문자열 (회차 평가정보 표시용) — 첫 그룹 tier 기준 */
    resultTypeSummary() {
      const g = _ensure().grades[0];
      if (!g) return '상대평가';
      return `상대평가 · ${g.tiers.length}등급 (${g.tiers.map(t => t.name).join('/')})`;
    },

    /* 직원의 직군에 해당하는 등급 그룹 (없으면 첫 그룹) */
    gradeGroupFor(emp) {
      const grades = _ensure().grades;
      const jc = emp && emp.jobCat;
      const hit = grades.find(g => (g.condValues || []).includes(jc));
      return deepClone(hit || grades[0] || null);
    },

    /* ---- 저장 ---- */
    save(next, reason) {
      _cfg = deepClone(next);
      _cfg.stages = normalizeStages(_cfg.stages);
      _cfg.updatedAt = TODAY;
      _cfg.updatedBy = HR_NAME;
      /* 일시 표기 — SWADPIA §2: YY/MM/DD   HH:MM (공백 3칸) */
      let hhmm = '00:00';
      try { const n = new Date(); hhmm = String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0'); } catch (e) {}
      _history.unshift({
        at: TODAY.slice(2).replace(/-/g, '/') + '   ' + hhmm,
        by: HR_NAME, reason: reason || '설정 변경', kind: 'edit',
      });
      return this.get();
    },
    history() { return _history.slice(); },
  };
})();
