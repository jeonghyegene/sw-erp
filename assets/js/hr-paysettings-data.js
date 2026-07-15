/* =========================================================
 * Data module: 급여 기준 (App.HRPaySettings) — 구 page-hr-pay-settings
 *   ※ 「급여 기준 설정」 화면은 제거됨. App.HRPaySettings(가산배율·지급일 조회)를
 *      급여 정산 화면이 호출한다.
 * -----------------------------------------------------------
 * (원본 헤더) Page: HR > 급여 관리 > 급여 관련 설정
 *
 *  시간외수당 가산배율과 기본 지급일 등 급여 정산에 적용되는
 *  계산 기준 마스터를 관리하는 데이터 모듈.
 *
 *  Public API (App.HRPaySettings)
 *   · getOtRate(key) / getOtMultiplier(key) / getOtAll() — 시간외수당 가산배율 조회
 *   · getPayday() — 기본 지급일 조회
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

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
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ============ STATE ============ */
  const STATE = {
    /* 시간외수당 가산배율 (saved) */
    otRates: {},          /* { [key]: 현재 가산배율 } */
    /* 기본 지급일 */
    payday: {
      kind: 'fixed',
      dayOfMonth: 25,
      weekendRule: 'prev',
    },
  };

  function ensureLoaded() {
    if (Object.keys(STATE.otRates).length) return;
    /* 초기값 = 법정 최소 가산배율 */
    OT_RATE_DEFS.forEach(d => { STATE.otRates[d.key] = d.legalMin; });
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
  };

})();
