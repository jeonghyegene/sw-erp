/* =========================================================
 * Data module: 입사 서류 (App.JoinDocsRegistry + App.JoinDocs) — 구 page-hr-joindocs
 *   ※ 「입사 서류 관리」 화면은 제거됨. 서류 마스터/서명 데이터 모듈만 단일 소스로 유지.
 *      임직원 관리(page-hr-info-mgmt)의 「서류 보관함」 탭이 본 모듈을 호출한다.
 *      ⚠ App.JoinDocsRegistry / App.JoinDocs 시그니처는 절대 변경 금지(다른 화면 의존).
 *      (구 LIST/EDIT 화면 렌더 코드는 남아 있으나 마운트되지 않아 inert.)
 *
 *   (원본) 서류 중심(Document-centric) 관리 화면.
 *
 *  뷰 모드:
 *   · LIST  — 서류 목록 그리드. 행/서류명 클릭 → EDIT, [보기] → 제출/서명 현황 모달, [삭제]
 *   · EDIT  — 좌(서류명·본문·수정 사유) / 우(미리보기) split. [저장] 즉시 새 버전 발행(기존 유지)
 *
 *  서명 현황 모달(중앙 팝업) — 조회 전용:
 *   · 직원별 행 — 성명(사진·부서·직책) | 입사일 | 적용 버전 | 상태 | 서명일 | 기능(미리보기)
 *   · 상태 2값: 미서명 / 서명 완료
 *   · HR 발송/서명요청 없음. 서명은 직원이 「내 정보 > 입사 서류」 에서 라이브러리 서류를 직접 다운로드·서명.
 *
 *  공유 데이터 (다른 화면이 의존 — 절대 시그니처 변경 금지):
 *   · window.App.JoinDocsRegistry — 서류 마스터 (입사 서류 양식 설정 화면이 동일 객체를 mutate)
 *   · window.App.JoinDocs.{ migrateOnBump, getEmps, ensureInit, countSignedForDoc }
 *   · window.App.JoinDocs.{ masterDocs, docBody, recordSignature, getSignature, getSignatures }
 *       └ 내 정보(셀프서비스) 서명과 입사서류관리 현황이 공유하는 단일 소스(SELF_SIGS)
 *
 *  UI Kit: .toolbar / .tbl / .pill / .btn / .page-bar / .split / .doc-editor__paper / .modal
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  /* ============ 공유 서류 레지스트리 ============
   *   입사 서류 양식 설정 화면(page-hr-doctemplates)이 이 객체를 직접 mutate 합니다.
   *   버전 발행 시 bumpVersion() 호출 → policy='requireResign' 이면 migrateOnBump() 가 emp.docs 갱신. */
  const ALL_EMP_TAGS = ['정규직','계약직','일용직','촉탁직','생산직','도급직'];
  const REGISTRY = (App.JoinDocsRegistry = App.JoinDocsRegistry || {
    ALL_EMP_TAGS,
    docs: [
      { key: 'sec',    name: '보안 서약서',                  targetTags: ALL_EMP_TAGS.slice(),  effectiveFrom: 'all', activeVersion: 'v1', versions: [{ v: 'v1', publishedAt: '2026-01-01', changeReason: '최초 등록', policy: null }], body: defaultBody('보안 서약서') },
      { key: 'priv',   name: '개인정보 동의서',              targetTags: ALL_EMP_TAGS.slice(),  effectiveFrom: 'all', activeVersion: 'v1', versions: [{ v: 'v1', publishedAt: '2026-01-01', changeReason: '최초 등록', policy: null }], body: defaultBody('개인정보 동의서') },
      { key: 'pledge', name: '근무 서약서',                  targetTags: ALL_EMP_TAGS.slice(),  effectiveFrom: 'all', activeVersion: 'v1', versions: [{ v: 'v1', publishedAt: '2026-01-01', changeReason: '최초 등록', policy: null }], body: defaultBody('근무 서약서') },
      { key: 'safety', name: '안전 준수 서약서',             targetTags: ['생산직'],            effectiveFrom: 'all', activeVersion: 'v1', versions: [{ v: 'v1', publishedAt: '2026-01-01', changeReason: '최초 등록', policy: null }], body: defaultBody('안전 준수 서약서') },
      { key: 'wage',   name: '금품청산 지급기일 연장합의서', targetTags: ALL_EMP_TAGS.slice(),  effectiveFrom: 'all', activeVersion: 'v1', versions: [{ v: 'v1', publishedAt: '2026-01-01', changeReason: '최초 등록', policy: null }], body: defaultBody('금품청산 지급기일 연장합의서') },
    ],
  });

  /* 기본 본문 — 편집 화면에서 토큰 치환되어 렌더 */
  function defaultBody(name) {
    return [
      `제1조 (목적)`,
      `본 문서는 ${name} 의 목적을 명시하며, 근로자는 그 내용을 충분히 확인하고 자발적으로 동의합니다.`,
      ``,
      `제2조 (효력)`,
      `본 동의는 근로계약 기간 동안 유효하며, 관련 법령 및 회사 규정에 따라 처리됩니다.`,
      ``,
      `제3조 (기타)`,
      `본 문서에 명시되지 않은 사항은 관계 법령 및 회사의 취업규칙에 따른다.`,
    ].join('\n');
  }

  /* 새 버전 발행. policy 가 'requireResign' 이면 마이그레이션. */
  REGISTRY.bumpVersion = function (docKey, opts) {
    const doc = REGISTRY.docs.find(d => d.key === docKey);
    if (!doc) return;
    /* 나가는(현행) 버전의 본문을 해당 버전 엔트리에 스냅샷 보존 — 과거 버전 내용 조회/이력용 */
    const curEntry = (doc.versions || []).find(v => v.v === doc.activeVersion);
    if (curEntry && curEntry.body == null) curEntry.body = doc.body;
    const curN = parseInt(String(doc.activeVersion).slice(1), 10) || 1;
    const nextV = 'v' + (curN + 1);
    doc.activeVersion = nextV;
    if (opts && typeof opts.body === 'string') doc.body = opts.body;
    if (opts && typeof opts.name === 'string') doc.name = opts.name;
    if (opts && Array.isArray(opts.targetTags)) doc.targetTags = opts.targetTags.slice();
    doc.versions.push({
      v: nextV,
      publishedAt: today(),
      changeReason: (opts && opts.changeReason) || '',
      policy: (opts && opts.policy) || 'newOnly',
      body: doc.body,   /* 발행 시점 본문 스냅샷 */
    });
    if (opts && opts.policy === 'requireResign') migrateOnBump(docKey, nextV);
    return nextV;
  };

  /* 새 서류 추가 — addDoc({key,name,targetTags,effectiveFrom,body}) */
  REGISTRY.addDoc = function (def) {
    if (!def || !def.key || !def.name) return null;
    if (REGISTRY.docs.find(d => d.key === def.key)) return null;
    const doc = {
      key: def.key,
      name: def.name,
      targetTags: Array.isArray(def.targetTags) ? def.targetTags.slice() : ALL_EMP_TAGS.slice(),
      effectiveFrom: def.effectiveFrom || 'all',
      activeVersion: 'v1',
      versions: [{ v: 'v1', publishedAt: today(), changeReason: '최초 등록', policy: null }],
      body: def.body || defaultBody(def.name),
    };
    REGISTRY.docs.push(doc);
    if (STATE.rows && STATE.rows.length) injectNewDocToEmps(doc);
    return doc;
  };

  /* 서류 삭제 — 1명이라도 completed/resign 이면 거부 */
  REGISTRY.deleteDoc = function (docKey) {
    const signed = countSignedForDoc(docKey);
    if (signed > 0) return { ok: false, signed };
    const idx = REGISTRY.docs.findIndex(d => d.key === docKey);
    if (idx < 0) return { ok: false, signed: 0 };
    REGISTRY.docs.splice(idx, 1);
    if (STATE.rows && STATE.rows.length) {
      STATE.rows.forEach(emp => {
        const di = emp.docs.findIndex(x => x.key === docKey);
        if (di >= 0) emp.docs.splice(di, 1);
      });
    }
    refreshAll();
    return { ok: true, signed: 0 };
  };

  /* 특정 docKey 에 대해 completed/resign 한 입사자 수 — 삭제 가능 여부 판정용 */
  function countSignedForDoc(docKey) {
    if (!STATE.rows || !STATE.rows.length) return 0;
    return STATE.rows.reduce((n, emp) => {
      const d = emp.docs.find(x => x.key === docKey);
      return (d && (d.status === 'completed' || d.status === 'resign')) ? n + 1 : n;
    }, 0);
  }

  /* 새 서류를 기존 입사자(매칭되는)에게 unsent 로 주입 */
  function injectNewDocToEmps(doc) {
    STATE.rows.forEach(emp => {
      if (emp.docs.find(x => x.key === doc.key)) return;
      const tags = empTagSet(emp);
      const tagMatch = !doc.targetTags || !doc.targetTags.length || doc.targetTags.some(t => tags.has(t));
      const dateMatch = !doc.effectiveFrom || doc.effectiveFrom === 'all' || (emp.joinDate || '') >= doc.effectiveFrom;
      if (!tagMatch || !dateMatch) return;
      emp.docs.push({
        key: doc.key, name: doc.name,
        status: 'unsent', signedAt: '',
        signedVersion: '', targetVersion: doc.activeVersion,
      });
    });
    refreshAll();
  }

  /* 입사자 → 태그 집합 (대상 매칭용) */
  function empTagSet(emp) {
    const tags = new Set();
    if (emp.empType === 'regular')  tags.add('정규직');
    if (emp.empType === 'contract') tags.add('계약직');
    if (emp.empType === 'daily')    tags.add('일용직');
    if (emp.empType === 'commission') tags.add('촉탁직');
    if (emp.jobCat === 'production') tags.add('생산직');
    if (emp.contractOut) tags.add('도급직');
    return tags;
  }
  function docsForEmp(emp) {
    const tags = empTagSet(emp);
    return REGISTRY.docs.filter(d => {
      if (d.effectiveFrom && d.effectiveFrom !== 'all') {
        if ((emp.joinDate || '') < d.effectiveFrom) return false;
      }
      if (!d.targetTags || !d.targetTags.length) return true;
      return d.targetTags.some(t => tags.has(t));
    });
  }

  /* ============ Mock 입사자 + 서류 상태 ============
   *   임직원 통합 마스터의 호환 조회 API(App.HRMembers)를 사용하되,
   *   서류 진행 상태(emp.docs)는 본 모듈이 자체 보유한다.
   *   emp.docs[].status: unsent(미발송) / pending(미제출) / completed(제출완료) / resign(재서명 필요)
   *   → 화면에는 2값(미제출 / 서명 완료)으로 매핑 (completed = 서명 완료, 그 외 = 미제출). */
  function makeMock() {
    const todayD = new Date('2026-05-12');
    const ymd = (d) => d.toISOString().slice(0, 10);
    const hrs = ['정혜진','윤민지'];

    const members = (window.App && App.HRMembers && App.HRMembers.list)
      ? App.HRMembers.list()
      : [];
    const candidates = members.filter(m =>
      !['retired','contractExpired'].includes(m.status)
    );

    return candidates.map((m, i) => {
      const seed = Number(String(m.id || '').slice(-2)) || (i + 1);
      let scenario = 'unsent';
      const docsSentReached  = !!m.docsSentDate;
      const infoDoneReached  = m.infoStatus === 'done';
      if (m.status === 'completed') scenario = 'completed';
      else if (docsSentReached) scenario = (seed % 4 === 0) ? 'completed' : 'pending';
      else if (infoDoneReached) scenario = (seed % 3 === 0) ? 'pending' : 'unsent';

      const emp = {
        id: m.id,
        name: m.name || ((m.fname || '') + (m.gname || '')),
        photoUrl:     m.photoUrl || '',
        dept: m.dept || '',
        rank: m.rank || '사원',
        position: m.position || '팀원',
        jobCat:       m.jobCat || 'office',
        empType:      m.empType || 'regular',
        contractSubType: m.contractSubType || '',
        contractOut:  !!m.contractOut,
        joinDate:     m.joinDate || ymd(todayD),
        hrOwner:      hrs[seed % hrs.length],
        sent: false, sentAt: '',
        docs: [],
        scenario,
      };

      const docs = docsForEmp(emp).map(d => ({
        key: d.key, name: d.name,
        status: 'unsent', signedAt: '',
        signedVersion: '', targetVersion: d.activeVersion,
      }));

      if (scenario !== 'unsent') {
        emp.sent = true;
        const sentDate = new Date(todayD.getTime() - 5 * 86400000);
        emp.sentAt = ymd(sentDate);
        docs.forEach((doc, di) => {
          doc.status = 'pending';
          if (scenario === 'completed') {
            doc.status = 'completed';
            doc.signedVersion = doc.targetVersion;
            const s = new Date(sentDate.getTime() + (di + 1) * 3600 * 1000 * 6);
            doc.signedAt = `${ymd(s)} ${String(s.getHours()).padStart(2,'0')}:${String(s.getMinutes()).padStart(2,'0')}`;
          }
        });
      }
      emp.docs = docs;
      return emp;
    });
  }

  /* ============ 조직도 (제출/서명 현황 모달 좌측 트리) ============
   *   임직원 관리(page-hr-employee)와 동일한 ID/타입 체계 + dept명 매핑.
   *   (비활성 부서는 본 화면에서 미노출 — 활성 부서만) */
  const DEPTS = [
    { id: 'C0',  parentId: null, name: '(주)성원애드피아', type: 'root' },
    { id: 'T1',  parentId: 'C0', name: '경영지원본부',     type: 'hq'   },
    { id: 'T2',  parentId: 'C0', name: '생산본부',          type: 'hq'   },
    { id: 'T3',  parentId: 'C0', name: '개발팀',            type: 'team' },
    { id: 'T4',  parentId: 'C0', name: '홍보팀',            type: 'team' },
    { id: 'P11', parentId: 'T1', name: '인사팀',            type: 'part' },
    { id: 'P12', parentId: 'T1', name: '재무팀',            type: 'part' },
    { id: 'P13', parentId: 'T1', name: '총무팀',            type: 'part' },
    { id: 'P21', parentId: 'T2', name: '생산1팀',           type: 'part' },
    { id: 'P22', parentId: 'T2', name: '품질팀',            type: 'part' },
  ];
  const DEPT_NAME_TO_ID = {
    '경영지원본부': 'T1', '생산본부': 'T2', '개발팀': 'T3', '홍보팀': 'T4',
    '인사팀': 'P11', '재무팀': 'P12', '총무팀': 'P13', '생산1팀': 'P21', '품질팀': 'P22',
  };
  const CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
  function deptIcon(type) {
    if (type === 'root') return '🏢';
    if (type === 'hq')   return '🏛️';
    if (type === 'team') return '👥';
    return '📄';
  }
  function deptChildren(parentId) { return DEPTS.filter(d => d.parentId === parentId); }
  function deptIdForEmp(emp) { return DEPT_NAME_TO_ID[emp.dept] || 'C0'; }
  /* deptId 서브트리(자손 포함) 에 속한 emps */
  function empsInDept(emps, deptId) {
    if (!deptId || deptId === 'C0') return emps;
    const ids = new Set([deptId]);
    (function collect(id) { deptChildren(id).forEach(c => { ids.add(c.id); collect(c.id); }); })(deptId);
    return emps.filter(e => ids.has(deptIdForEmp(e)));
  }

  /* ============ STATE ============ */
  const STATE = {
    rows: [],            // 직원 데이터 (makeMock) — 현황 모달 + 외부 export 가 사용
    view: 'list',        // 'list' | 'add' | 'edit'
    editingKey: null,    // EDIT 모드 — 편집 중인 서류 key
    form: null,          // { name, body, changeReason }
    statusDocKey: null,  // 현황 모달 대상 서류 key
    statusDept: 'C0',    // 현황 모달 좌측 트리 선택 부서
    statusSel: new Set(),// 현황 모달 체크 선택된 emp id
    preview: null,       // { empId, keys[], idx }
  };

  /* ============ 헬퍼 ============ */
  function $(s, r = document) { return r.querySelector(s); }
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function today() { return '2026-05-12'; }
  function registry() { return App.JoinDocsRegistry; }
  function ensureRows() { if (!STATE.rows.length) STATE.rows = makeMock(); }
  function latestVersionInfo(doc) {
    return doc.versions[doc.versions.length - 1] || { v: 'v1', publishedAt: '-', changeReason: '-', policy: null };
  }
  function openModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function fieldErr(el, msg) {
    if (App.Forms && App.Forms.setFieldError && el) App.Forms.setFieldError(el, msg);
    else window.toast && window.toast(msg, 'warning');
  }
  /* 직원 사진 — 24px (없으면 이니셜 placeholder). 임직원 관리 단일 소스(photoUrl). */
  function avatarHTML(emp, size) {
    const px = size || 24;
    const photo = emp.photoUrl || '';
    return photo
      ? `<img src="${esc(photo)}" alt="" style="width:${px}px;height:${px}px;border-radius:50%;object-fit:cover;flex-shrink:0;" />`
      : `<span style="width:${px}px;height:${px}px;border-radius:50%;background:var(--color-active);color:var(--color-brand-primary);display:inline-flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;">${esc((emp.name || '?').charAt(0))}</span>`;
  }

  /* 특정 서류 대상 직원 목록 + 서명 통계 */
  function empsForDoc(docKey) {
    ensureRows();
    return STATE.rows.filter(e => e.docs.some(d => d.key === docKey));
  }
  function isSigned(emp, docKey) {
    /* 본인 셀프서비스 서명(단일 소스) 우선 → 없으면 시드 상태 */
    if (App.JoinDocs.getSignature && App.JoinDocs.getSignature(emp.id, docKey)) return true;
    const d = emp.docs.find(x => x.key === docKey);
    return !!(d && d.status === 'completed');
  }
  /* 서명일시 — 셀프서비스 서명 우선 */
  function signedAtOf(emp, docKey) {
    const sig = App.JoinDocs.getSignature && App.JoinDocs.getSignature(emp.id, docKey);
    if (sig && sig.signedAt) return sig.signedAt;
    const d = emp.docs.find(x => x.key === docKey);
    return (d && d.signedAt) || '';
  }
  function docSignStats(docKey) {
    const emps = empsForDoc(docKey);
    const signed = emps.filter(e => isSigned(e, docKey)).length;
    return { total: emps.length, signed, unsigned: emps.length - signed };
  }
  /* 현황 모달 — 좌측 트리에서 선택한 부서로 필터된 대상 직원 */
  function statusFilteredEmps() {
    return empsInDept(empsForDoc(STATE.statusDocKey), STATE.statusDept || 'C0');
  }

  /* 화면(page-hr-joindocs)은 제거됨 — 데이터만 변경되고 렌더 대상이 없으므로 no-op.
     소비처(임직원관리 「서류 보관함」)는 다음 조회 시 App.JoinDocs.* 로 최신 데이터를 읽는다. */
  function refreshAll() {}

  /* ============ 버전 업 마이그레이션 (외부 호출) ============
   *   page-hr-doctemplates 가 REGISTRY.bumpVersion(docKey, { policy:'requireResign' }) 호출 시
   *   bumpVersion 내부에서 자동으로 본 함수를 호출 — 제출완료(v1) → 재서명 필요 로 전환. */
  function migrateOnBump(docKey, newVersion) {
    if (!STATE.rows.length) return;
    STATE.rows.forEach(emp => {
      const d = emp.docs.find(x => x.key === docKey);
      if (!d) return;
      d.targetVersion = newVersion;
      if (d.status === 'completed' && (d.signedVersion || 'v1') !== newVersion) {
        d.status = 'resign';
      }
    });
    refreshAll();
  }

  /* 다른 페이지에서 즉시 호출하려면 App.JoinDocs.* 사용 */
  App.JoinDocs = App.JoinDocs || {};
  App.JoinDocs.migrateOnBump = migrateOnBump;
  App.JoinDocs.getEmps = function () { return STATE.rows; };
  App.JoinDocs.ensureInit = function () {
    if (!STATE.rows.length) STATE.rows = makeMock();
    return STATE.rows;
  };
  App.JoinDocs.countSignedForDoc = function (docKey) {
    App.JoinDocs.ensureInit();
    return countSignedForDoc(docKey);
  };

  /* ====== 셀프서비스(내 정보 > 입사 서류) 연동 API ======
   *   입사서류관리는 '서류 자료실' — 전 직원이 항상 열람·다운로드 가능.
   *   서명 여부는 직원 본인(인사정보)에 보관하므로 여기서는 양식(마스터)만 노출한다.
   *   발송/서명요청 개념 없음. */
  /* 마스터 서류 등록부 — 대상 태그·버전·본문(body, 서명 미리보기용) 포함 */
  App.JoinDocs.masterDocs = function () {
    return REGISTRY.docs.map(d => ({
      key: d.key, name: d.name, activeVersion: d.activeVersion,
      targetTags: (d.targetTags || []).slice(), body: d.body || defaultBody(d.name),
    }));
  };
  App.JoinDocs.docBody = function (key) {
    const d = REGISTRY.docs.find(x => x.key === key);
    return d ? (d.body || defaultBody(d.name)) : '';
  };
  /* 버전 목록 (최신순) — { v, publishedAt, changeReason, policy, body } */
  App.JoinDocs.getVersions = function (key) {
    const d = REGISTRY.docs.find(x => x.key === key);
    return d ? (d.versions || []).slice().reverse() : [];
  };
  /* 특정 버전 본문 — 스냅샷이 있으면 그 본문, 없으면(구 시드 등) 현행 본문 fallback */
  App.JoinDocs.getVersionBody = function (key, v) {
    const d = REGISTRY.docs.find(x => x.key === key);
    if (!d) return '';
    const entry = (d.versions || []).find(x => x.v === v);
    if (entry && entry.body != null) return entry.body;
    return d.body || defaultBody(d.name);
  };
  /* 직원 본인 전자서명 저장소 — { empId: { docKey: { signedAt, version } } }
   *   내 정보(셀프서비스)에서 서명 시 기록되고, 입사서류관리 현황 조회가 동일 소스를 읽는다(단일 소스). */
  const SELF_SIGS = {};
  const SIG_HIST = {};   /* { empId: { docKey: [ { signedAt, version }, ... ] } } — 재서명 포함 전체 서명 이력 */
  App.JoinDocs.recordSignature = function (empId, docKey, info) {
    if (!empId || !docKey) return;
    const rec = info || { signedAt: '', version: '' };
    if (!SELF_SIGS[empId]) SELF_SIGS[empId] = {};
    SELF_SIGS[empId][docKey] = rec;                 /* 현행(최신) 서명 */
    if (!SIG_HIST[empId]) SIG_HIST[empId] = {};
    if (!SIG_HIST[empId][docKey]) SIG_HIST[empId][docKey] = [];
    SIG_HIST[empId][docKey].push(Object.assign({}, rec));   /* 이력 누적 (이전 서명본 보존) */
  };
  App.JoinDocs.getSignature  = function (empId, docKey) {
    return (SELF_SIGS[empId] && SELF_SIGS[empId][docKey]) || null;
  };
  App.JoinDocs.getSignatures = function (empId) { return SELF_SIGS[empId] || {}; };
  /* 서명 이력 (오래된→최신 순) — 재서명 시 이전 버전 서명본이 그대로 보존됨 */
  App.JoinDocs.getSignatureHistory = function (empId, docKey) {
    return (SIG_HIST[empId] && SIG_HIST[empId][docKey]) ? SIG_HIST[empId][docKey].slice() : [];
  };
  /* 재서명 필요 여부 — 서명한 버전 이후에 'requireResign' 정책으로 발행된 버전이 있으면 true.
   *   (경미한 newOnly 버전 업은 기존 서명 유지) */
  App.JoinDocs.needsResign = function (empId, docKey) {
    const sig = App.JoinDocs.getSignature(empId, docKey);
    if (!sig || !sig.version) return false;
    const doc = REGISTRY.docs.find(d => d.key === docKey);
    if (!doc || doc.activeVersion === sig.version) return false;
    const sigN = parseInt(String(sig.version).slice(1), 10) || 0;
    return (doc.versions || []).some(v => {
      const vN = parseInt(String(v.v).slice(1), 10) || 0;
      return vN > sigN && v.policy === 'requireResign';
    });
  };

  /* 직원이 라이브러리에서 본인 인사정보로 '보관'한 서류 — { empId: Set(docKey) }
   *   서명한 서류는 자동으로 보관된 것으로 간주(getKept/isKept 가 SELF_SIGS 도 포함). */
  const KEPT = {};
  App.JoinDocs.keepDoc   = function (empId, docKey) {
    if (!empId || !docKey) return;
    if (!KEPT[empId]) KEPT[empId] = new Set();
    KEPT[empId].add(docKey);
  };
  App.JoinDocs.unkeepDoc = function (empId, docKey) {
    if (KEPT[empId]) KEPT[empId].delete(docKey);
  };
  App.JoinDocs.isKept    = function (empId, docKey) {
    if (KEPT[empId] && KEPT[empId].has(docKey)) return true;
    return !!(SELF_SIGS[empId] && SELF_SIGS[empId][docKey]);
  };
  App.JoinDocs.getKept   = function (empId) {
    const s = new Set(KEPT[empId] ? Array.from(KEPT[empId]) : []);
    Object.keys(SELF_SIGS[empId] || {}).forEach(k => s.add(k));
    return Array.from(s);
  };

  /* 직원 본인 제출(업로드) 서류 — { empId: [ { id, docType, fileName, size, uploadedAt, blob } ] }
   *   주민등록등본·원천징수영수증·통장사본 등 본인이 직접 올리는 증빙. 라이브러리(회사 양식)와 별개. */
  const UPLOADS = {};
  let _upSeq = 0;
  App.JoinDocs.getUploads = function (empId) { return UPLOADS[empId] || []; };
  App.JoinDocs.addUpload  = function (empId, item) {
    if (!empId || !item) return null;
    if (!UPLOADS[empId]) UPLOADS[empId] = [];
    const rec = Object.assign({ id: 'UP' + (++_upSeq) }, item);
    UPLOADS[empId].push(rec);
    return rec;
  };
  App.JoinDocs.removeUpload = function (empId, id) {
    if (UPLOADS[empId]) UPLOADS[empId] = UPLOADS[empId].filter(x => x.id !== id);
  };
  App.JoinDocs.getUpload = function (empId, id) {
    return (UPLOADS[empId] || []).find(x => x.id === id) || null;
  };

})();
