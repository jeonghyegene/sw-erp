/* =========================================================
 * HR 직원 조회 호환 어댑터
 *
 * 직원 기준정보의 단일 진실원(SoT)은 App.HRInfoMgmt 이다.
 * 기존 발령·평가·휴직·급여 화면이 App.HRMembers API를 사용하고 있어,
 * 소비 화면을 한 번에 바꾸지 않고도 같은 원본을 보도록 얇은 어댑터만 유지한다.
 *
 * 공식 API(기존 호환):
 *   · App.HRMembers.list()
 *   · App.HRMembers.isComplete(emp)
 *   · App.HRMembers.wageContractStatus(emp)
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  function infoMgmt() {
    return App.HRInfoMgmt || null;
  }

  function list() {
    const api = infoMgmt();
    return api && typeof api.list === 'function' ? api.list() : [];
  }

  function isComplete(emp) {
    const api = infoMgmt();
    return !!(api && typeof api.isComplete === 'function' && api.isComplete(emp));
  }

  function wageContractStatus(emp) {
    const api = infoMgmt();
    return api && typeof api.wageContractStatus === 'function'
      ? api.wageContractStatus(emp)
      : null;
  }

  App.HRMembers = {
    list,
    isComplete,
    wageContractStatus,
  };
})();
