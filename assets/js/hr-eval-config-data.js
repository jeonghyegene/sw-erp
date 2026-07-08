/* =========================================================
 * Data module: 역량평가 단계·등급 전역 설정 (App.HREvalConfig)
 *
 *  「역량평가 설정 > 단계·등급 설정」 화면이 편집하고,
 *  「역량평가 회차」 화면이 상속(read-only)하는 전역 단일 소스.
 *
 *  ※ 피드백 반영: 평가자 단계·등급을 자유롭게 추가/삭제하던 구조가
 *     과하다 → 고정 구조(전역 단일)로 단순화.
 *
 *  평가자 단계 (고정 시퀀스)
 *    본인평가(on/off) → 1차 → 2차 → 대표이사 → 확정
 *    · 본인   : on/off, 배분율 기본 5%
 *    · 1차    : 직책 기준 role(파트장/팀장/실장/본부장/직접지정), 배분율 기본 20%
 *    · 2차    : 동일 role 선택, 배분율 기본 25%
 *    · 대표이사: 고정, 배분율 기본 50%
 *    · 배분율 합계 ≤ 100%
 *
 *  평가 등급 산정 (직군 그룹별 고정 tier — 그룹별 등급 명칭)
 *    · 사무·연구직 : S 10 / A 20 / B 50 / C 20
 *    · 생산직      : 상 30 / 중 50 / 하 20
 *    · 그룹별 비율 합계 ≤ 100%
 *
 *  회차 배정용 stage key 는 '역량_0'(1차) / '역량_1'(2차) 로 유지
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

  /* ============ 평가자 role (직책 기준) ============ */
  const ROLE_OPTIONS = [
    { key: 'part_lead',     label: '파트장' },
    { key: 'team_lead',     label: '팀장' },
    { key: 'office_lead',   label: '실장' },
    { key: 'hq_lead',       label: '본부장' },
    { key: 'direct_assign', label: '직접 지정' },
  ];
  function roleLabel(k) {
    if (k === 'ceo')  return '대표이사';
    if (k === 'self') return '본인';
    return (ROLE_OPTIONS.find(r => r.key === k) || {}).label || '-';
  }

  /* ============ 직군 (member.jobCat 내부키 ↔ 표시명) ============ */
  const JOB_CAT_LABEL = { office: '사무직', production: '생산직', research: '연구직', outsource: '도급직' };
  function jobCatLabel(v) { return JOB_CAT_LABEL[v] || v || '-'; }

  /* ============ 기본값 ============ */
  function defaults() {
    return {
      stages: {
        self:   { on: true, weight: 5 },
        first:  { role: 'team_lead', weight: 20 },
        second: { role: 'hq_lead',   weight: 25 },
        ceo:    { weight: 50 },
      },
      grades: [
        {
          id: uid('gg'), groupName: '사무·연구직',
          condField: 'jobCategory', condValues: ['office', 'research'],
          tiers: [
            { name: 'S', ratio: 10 },
            { name: 'A', ratio: 20 },
            { name: 'B', ratio: 50 },
            { name: 'C', ratio: 20 },
          ],
        },
        {
          id: uid('gg'), groupName: '생산직',
          condField: 'jobCategory', condValues: ['production'],
          tiers: [
            { name: '상', ratio: 30 },
            { name: '중', ratio: 50 },
            { name: '하', ratio: 20 },
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

  /* 배분율 합계 (자기평가 on 시 포함) */
  function sumStageWeights(st) {
    st = st || _ensure().stages;
    return (st.self && st.self.on ? num(st.self.weight) : 0)
      + num(st.first && st.first.weight)
      + num(st.second && st.second.weight)
      + num(st.ceo && st.ceo.weight);
  }

  App.HREvalConfig = {
    /* ---- role ---- */
    roleOptions() { return ROLE_OPTIONS.slice(); },
    roleLabel,
    jobCatLabel,

    /* ---- 조회 ---- */
    get() { return deepClone(_ensure()); },
    stages() { return deepClone(_ensure().stages); },
    grades() { return deepClone(_ensure().grades); },
    sumStageWeights,

    /* 회차 대상자별 사람 배정이 필요한 단계 목록 (1차/2차).
       key 는 evaluatorAssignments[empId][key] 식별자 — 기존 '역량_N' 호환. */
    assignStages() {
      const st = _ensure().stages;
      return [
        { key: '역량_0', order: 1, title: '1차 평가자', role: st.first.role },
        { key: '역량_1', order: 2, title: '2차 평가자', role: st.second.role },
      ];
    },

    /* 표시용 전체 흐름 [{label, weight?}] — 본인(on)→1차→2차→대표이사→확정 */
    stageFlow() {
      const st = _ensure().stages;
      const flow = [];
      if (st.self && st.self.on) flow.push({ key: 'self', label: '본인', weight: num(st.self.weight) });
      flow.push({ key: 'first',  label: '1차 · ' + roleLabel(st.first.role),  weight: num(st.first.weight) });
      flow.push({ key: 'second', label: '2차 · ' + roleLabel(st.second.role), weight: num(st.second.weight) });
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
