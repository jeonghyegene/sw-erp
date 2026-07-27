/* =========================================================
 * Page: HR > 퇴사 관리 > 퇴직연금 관리  (부담금 관리 개편판)
 *
 *  업무 목적
 *   - 직원별 퇴직연금 「기업부담금」 납입 내역을 기준월 단위로 엑셀 업로드·검증·적용한다.
 *   - 적용 완료된 데이터로 직원별 기업부담금 누계 / 월별 합계를 조회·관리한다.
 *   - 직원별 중도인출 내역을 별도 이력으로 등록·관리한다. (누계에서 차감하지 않음)
 *   - 개인부담금은 본 화면의 관리 대상에서 제외 — 월별 합계는 「기업부담금 합계」 기준.
 *
 *  화면 구조 (2 탭)
 *   1) 상용직 퇴직연금 현황 — 직원별 기업부담금 누계 + 상세(월별 납입 / 중도인출)
 *        · 툴바 [퇴직연금 월별 업로드] → 급여정산 4대보험 업로드와 동일한 분할(split) 모달로
 *          기준월별 엑셀 업로드 → 검증 → [적용] 시 누계에 반영. (BATCH 모델 재사용)
 *   2) 일용직 퇴직연금 현황 — 주 15h 이상 임금계약서 기간 합산 1년 이상 판정 + 퇴직금 산출
 *
 *  데이터 모델 (단일 소스, 공유 — App.HRPension)  ※ 인사정보카드(퇴직 탭) 도 본 모듈을 단일 소스로 읽는다.
 *   STORE[empId] = {
 *     enrolled, enrollDate, plan, bank, monthlyWage,
 *     payments:    [{ id, month:'YYYY-MM', wageMonth, contribAmount, paidAmount, paidDate, dueDate,
 *                     uploadedAt, uploadedBy, note }],      // 월별 납입(=기업부담금)
 *     withdrawals: [{ id, date, amount, reason, note, fileName, registeredAt, registeredBy }]  // 중도인출
 *   }
 *   BATCH[ym] = { ym, fileName, uploadedAt, uploadedBy, status, reupload,
 *                 rows:[{ empId, empName, jobCat, amount, note, status:'ok'|'check' }] }
 *     status: none | pending(적용대기) | applied(적용완료) | error | reuploaded
 *
 *  UI Kit 재사용
 *   .att-scope-tabs/.att-scope-tab · .search/.field · .toolbar · .card · .kpi · .tbl · .pill
 *   .pagination · .modal(.modal--lg) · .fm-tbl · .input · .select · .btn · .file-field
 *   App.Components.searchPanel · App.Search.attach · App.Forms · App.confirmDelete
 *   App.flashToast · App.downloadFile
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  /* ============ 환경 ============ */
  const TODAY = '2026-07-25';           /* 데모 기준일 — 최근 납입마감(매월 20일) 지난 월 = 2026-07 */
  const HR_NAME = '정혜진';

  const PLAN_OPTS = [
    { value: 'DC', label: 'DC형 (확정기여)' },
    { value: 'DB', label: 'DB형 (확정급여)' },
  ];
  const BANK_OPTS = ['국민', '신한', '하나', '우리', '농협', '기업', '미래에셋', '삼성증권'];
  const PAYDAY_LABEL = '매월 20일';

  const WITHDRAW_REASONS = ['주택구입', '전세보증금', '요양(6개월 이상)', '파산선고', '개인회생', '천재지변', '기타'];

  /* 사원유형 (member.jobCat 내부키 ↔ 표시명) */
  const JOB_CAT_LABEL = { office: '사무직', production: '생산직', research: '연구직', outsource: '도급직' };
  function jobCatLabel(v) { return JOB_CAT_LABEL[v] || v || '-'; }

  /* 업로드(배치) 처리상태 */
  const BATCH_STATUS = {
    none:       { label: '미업로드',   cls: 'pill--muted'   },
    pending:    { label: '적용대기',   cls: 'pill--warning' },
    applied:    { label: '적용완료',   cls: 'pill--success' },
    error:      { label: '오류',       cls: 'pill--danger'  },
    reuploaded: { label: '재업로드됨', cls: 'pill--info'    },
  };

  /* ============ 공통 유틸 ============ */
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
  function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
  function fmtYYMMDD(s) {
    if (!s) return '-';
    const p = String(s).slice(0, 10).split('-');
    if (p.length < 3) return s;
    return `${p[0].slice(2)}/${p[1]}/${p[2]}`;
  }
  /* 일시 'YYYY-MM-DD HH:MM' → 'YY/MM/DD   HH:MM' (SWADPIA §2, 공백 3칸) */
  function fmtDateTime(s) {
    if (!s) return '-';
    const str = String(s);
    const dpart = str.slice(0, 10), tpart = str.length > 10 ? str.slice(11, 16) : '';
    const d = fmtYYMMDD(dpart);
    return tpart ? `${d}   ${tpart}` : d;
  }
  function nowDateTime() {
    const d = new Date();
    return `${ymd(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  function fmtWon(n) { return (Number(n) || 0).toLocaleString('ko-KR'); }
  function parseWon(v) { return Number(String(v == null ? '' : v).replace(/[^0-9]/g, '')) || 0; }
  function uid() { return 'p' + Math.random().toString(36).slice(2, 9); }
  function seedNum(str) {
    let h = 0; const s = String(str || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000000007;
    return Math.abs(h);
  }

  /* ----- 월(月) 유틸 ----- */
  function addMonths(ym, n) {
    let [y, m] = String(ym).split('-').map(Number);
    m += n; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1;
    return `${y}-${pad2(m)}`;
  }
  function fmtMonth(ym) { if (!ym) return '-'; const [y, m] = String(ym).split('-'); return `${y}-${m}`; }
  /* 표시 전용 — YYYY-MM → YY/MM (SWADPIA §1). 데이터/입력값에는 fmtMonth 사용. */
  function fmtMonthDisp(ym) { if (!ym) return '-'; const [y, m] = String(ym).split('-'); return `${y.slice(2)}/${m}`; }
  function lastDueMonth() {
    const [y, m, d] = TODAY.split('-').map(Number);
    const cur = `${y}-${pad2(m)}`;
    return d >= 20 ? cur : addMonths(cur, -1);
  }

  /* 납입 상태 — 인사카드 paymentRows 호환용 */
  function payStatus(p) {
    const paid = Number(p.paidAmount) || 0;
    if (!paid || !p.paidDate) return { key: 'unpaid', label: '미납', cls: 'pill--danger' };
    const due = p.dueDate ? ymd(addDays(new Date(p.dueDate), 10)) : '';
    if (due && String(p.paidDate) > due) return { key: 'late', label: '지연', cls: 'pill--warning' };
    return { key: 'ok', label: '정상', cls: 'pill--success' };
  }

  /* =========================================================
   *  App.HRPension — 퇴직연금 데이터 모듈 (단일 소스, 공유)
   * ========================================================= */
  const STORE = {};
  const BATCH = {};

  function seedFor(empId) {
    const h = seedNum(empId);
    const enrolled = (h % 100) < 90;                 /* ~90% 가입 */
    const m = memberById(empId);
    const join = (m && m.joinDate) ? String(m.joinDate).slice(0, 10) : '2024-03-02';
    const joinYear = Number(join.slice(0, 4)) || 2024;
    const joinMonth = Number(join.slice(5, 7)) || 3;

    const bank = BANK_OPTS[h % BANK_OPTS.length];
    const monthlyWage = 2500000 + (h % 16) * 125000; /* 월 임금 2.5M ~ 4.4M */

    if (!enrolled) {
      return { enrolled: false, enrollDate: '', plan: 'DC', bank, monthlyWage, payments: [], withdrawals: [] };
    }

    const enrollDate = join;
    const contribAmount = Math.round(monthlyWage / 12);   /* 월 기업부담금 (DC 월 적립액) */
    const uploaders = [HR_NAME, '윤민지', HR_NAME];

    /* 월별 납입 — 가입월부터 「전월(=lastDue-1)」 까지 적용완료로 seed.
       당월(lastDue) 은 payments 에 넣지 않고 BATCH(적용대기)로 시연한다. */
    const lastApplied = addMonths(lastDueMonth(), -1);
    const enrollYm = `${joinYear}-${pad2(joinMonth)}`;
    let startYm = addMonths(lastApplied, -35);
    if (startYm < enrollYm) startYm = enrollYm;

    const payments = [];
    for (let y = startYm; y <= lastApplied; y = addMonths(y, 1)) {
      const dueDate = `${y}-20`;
      payments.push({
        id: uid(), month: y, wageMonth: monthlyWage, contribAmount, dueDate,
        paidAmount: contribAmount, paidDate: dueDate,
        uploadedAt: `${y}-25 14:30`, uploadedBy: uploaders[seedNum(y) % uploaders.length], note: '',
      });
    }

    /* 중도인출 — 약 25% 가 1건 보유 */
    const withdrawals = [];
    if ((h % 100) < 25 && payments.length) {
      const paidCum = payments.reduce((s, p) => s + (Number(p.paidAmount) || 0), 0);
      const amt = Math.max(500000, Math.round(paidCum * (0.2 + (h % 3) * 0.1) / 100000) * 100000);
      const date = ymd(addDays(new Date(TODAY), -(120 + (h % 500))));
      withdrawals.push({
        id: uid(), date, amount: amt, reason: WITHDRAW_REASONS[h % (WITHDRAW_REASONS.length - 1)],
        note: '증빙 확인 완료', fileName: `중도인출_증빙_${empId}.pdf`,
        registeredAt: `${ymd(addDays(new Date(date), 2))} 10:20`, registeredBy: HR_NAME,
      });
    }

    return { enrolled: true, enrollDate, plan: 'DC', bank, monthlyWage, payments, withdrawals };
  }
  function ensure(empId) {
    if (!STORE[empId]) STORE[empId] = seedFor(empId);
    return STORE[empId];
  }

  App.HRPension = {
    /* ----- 가입 정보 ----- */
    info(empId) {
      const r = ensure(empId);
      return { enrolled: !!r.enrolled, enrollDate: r.enrollDate || '', plan: r.plan || 'DC', bank: r.bank || '' };
    },
    isEnrolled(empId) { return !!ensure(empId).enrolled; },
    setInfo(empId, info) {
      const r = ensure(empId);
      r.enrolled = !!info.enrolled;
      r.enrollDate = info.enrollDate || '';
      r.plan = info.plan || 'DC';
      if (info.bank !== undefined) r.bank = info.bank;
    },
    contribution(empId) {
      const r = ensure(empId);
      if (!r.enrolled) return 0;
      if (r.payments.length) return Number(r.payments[r.payments.length - 1].contribAmount) || 0;
      return Math.round((Number(r.monthlyWage) || 0) / 12);
    },

    /* ----- 납입 내역 (월별) ----- */
    payments(empId) {
      return ensure(empId).payments.slice().sort((a, b) => String(b.month).localeCompare(String(a.month)));
    },
    paymentFor(empId, ym) { return ensure(empId).payments.find(p => p.month === ym) || null; },
    unpaidCount(empId) { return ensure(empId).payments.filter(p => !(Number(p.paidAmount) > 0)).length; },
    removePayment(empId, id) {
      const r = ensure(empId);
      r.payments = r.payments.filter(p => p.id !== id);
    },
    /* 특정 월 기업부담금 적용(=실제 납입 확정). 배치 적용에서 호출. */
    applyPaymentFor(empId, ym, amount, meta) {
      const r = ensure(empId);
      const amt = Math.max(0, Math.round(Number(amount) || 0));
      const exist = r.payments.find(p => p.month === ym);
      if (exist) {
        exist.contribAmount = amt; exist.paidAmount = amt; exist.paidDate = `${ym}-20`;
        exist.wageMonth = amt * 12;
        if (meta) { exist.uploadedAt = meta.uploadedAt || exist.uploadedAt; exist.uploadedBy = meta.uploadedBy || exist.uploadedBy; }
        return;
      }
      r.payments.push({
        id: uid(), month: ym, wageMonth: amt * 12, contribAmount: amt, dueDate: `${ym}-20`,
        paidAmount: amt, paidDate: `${ym}-20`,
        uploadedAt: (meta && meta.uploadedAt) || `${ym}-25 14:30`, uploadedBy: (meta && meta.uploadedBy) || HR_NAME, note: '',
      });
    },
    /* 산정/실제 납입 누계 (전체) */
    calcCumulative(empId) { return ensure(empId).payments.reduce((s, p) => s + (Number(p.contribAmount) || 0), 0); },
    paidCumulative(empId) { return ensure(empId).payments.reduce((s, p) => s + (Number(p.paidAmount) || 0), 0); },
    /* 기업부담금 누계 — 조회기간(YYYY-MM 범위) 내 적용완료 합계. from/to 미지정 시 전체. */
    contribCumulative(empId, from, to) {
      return ensure(empId).payments.reduce((s, p) => {
        if (!(Number(p.paidAmount) > 0)) return s;
        if (from && p.month < from) return s;
        if (to && p.month > to) return s;
        return s + (Number(p.paidAmount) || 0);
      }, 0);
    },
    /* 최종 납입월 — 기업부담금이 마지막으로 적용된 기준월 */
    lastPaidMonth(empId) {
      let last = '';
      ensure(empId).payments.forEach(p => { if (Number(p.paidAmount) > 0 && p.month > last) last = p.month; });
      return last;
    },

    /* ----- 중도인출 이력 (누계에서 차감하지 않음) ----- */
    withdrawals(empId) {
      return ensure(empId).withdrawals.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    },
    withdrawnTotal(empId) { return ensure(empId).withdrawals.reduce((s, r) => s + (Number(r.amount) || 0), 0); },
    addWithdrawal(empId, rec) {
      const w = {
        id: uid(), date: rec.date, amount: Math.max(0, Math.round(Number(rec.amount) || 0)),
        reason: rec.reason || '', note: rec.note || '', fileName: rec.fileName || '',
        registeredAt: rec.registeredAt || nowDateTime(), registeredBy: rec.registeredBy || HR_NAME,
      };
      ensure(empId).withdrawals.push(w);
      return w;
    },
    updateWithdrawal(empId, id, patch) {
      const w = ensure(empId).withdrawals.find(x => x.id === id);
      if (!w) return;
      if (patch.date !== undefined) w.date = patch.date;
      if (patch.amount !== undefined) w.amount = Math.max(0, Math.round(Number(patch.amount) || 0));
      if (patch.reason !== undefined) w.reason = patch.reason;
      if (patch.note !== undefined) w.note = patch.note;
      if (patch.fileName !== undefined && patch.fileName) w.fileName = patch.fileName;
    },
    removeWithdrawal(empId, id) {
      const r = ensure(empId);
      r.withdrawals = r.withdrawals.filter(w => w.id !== id);
    },

    /* =====================================================
     *  월별 업로드 배치 (기준월 단위)
     * ===================================================== */
    /* 기준월 뷰 — BATCH 우선, 없으면 payments 로부터 적용완료 파생, 그것도 없으면 미업로드 */
    monthView(ym) {
      const b = BATCH[ym];
      if (b) return b;
      const rows = derivedAppliedRows(ym);
      if (rows.length) {
        const meta = derivedBatchMeta(ym, rows);
        return { ym, derived: true, status: 'applied', fileName: meta.fileName, uploadedAt: meta.uploadedAt, uploadedBy: meta.uploadedBy, rows };
      }
      return { ym, status: 'none', rows: [] };
    },
    batch(ym) { return BATCH[ym] || null; },
    /* 엑셀 업로드(mock) — 기준월 대상 배치 생성(적용대기). 이미 적용된 월이면 재업로드. */
    uploadBatch(ym, opt) {
      opt = opt || {};
      const prev = this.monthView(ym);
      const reupload = prev && prev.status === 'applied';
      BATCH[ym] = buildUploadBatch(ym, {
        fileName: opt.fileName || `퇴직연금_${ym.replace('-', '')}.xlsx`,
        uploadedBy: opt.uploadedBy || HR_NAME, reupload,
      });
      return BATCH[ym];
    },
    /* 업로드 데이터 적용 — 정상(ok) 행만 payments 에 반영. 상태 적용완료 전환. */
    applyBatch(ym) {
      const b = BATCH[ym];
      if (!b) return { applied: 0, skipped: 0 };
      let applied = 0, skipped = 0;
      b.rows.forEach(r => {
        if (r.status === 'ok' && r.empId && Number(r.amount) > 0) {
          App.HRPension.applyPaymentFor(r.empId, ym, r.amount, { uploadedAt: b.uploadedAt, uploadedBy: b.uploadedBy });
          applied++;
        } else { skipped++; }
      });
      b.status = 'applied';
      return { applied, skipped };
    },

    /* ----- 인사정보카드(퇴직 탭) 연동용 행 변환 (컬럼 구조 불변) ----- */
    paymentRows(empId) {
      return this.payments(empId).map(p => {
        const st = payStatus(p);
        return [
          fmtMonthDisp(p.month), fmtWon(p.wageMonth) + '원', fmtWon(p.contribAmount) + '원',
          p.paidAmount ? fmtWon(p.paidAmount) + '원' : '-',
          p.paidDate ? fmtYYMMDD(p.paidDate) : '-', st.label,
        ];
      });
    },
    withdrawalRows(empId) {
      return this.withdrawals(empId).map(w => [fmtYYMMDD(w.date), fmtWon(w.amount) + '원', w.reason || '']);
    },
  };

  /* 적용완료 파생 행 — payments 에 해당 월이 납입된 가입 직원 */
  function derivedAppliedRows(ym) {
    const rows = [];
    fullMembers().forEach(p => {
      if (!App.HRPension.isEnrolled(p.id)) return;
      const pay = App.HRPension.paymentFor(p.id, ym);
      if (pay && Number(pay.paidAmount) > 0) {
        rows.push({ empId: p.id, empName: p.name, jobCat: p.jobCat, amount: Number(pay.paidAmount), note: pay.note || '', status: 'ok' });
      }
    });
    return rows;
  }
  function derivedBatchMeta(ym, rows) {
    let at = '', by = '';
    for (const r of rows) {
      const pay = App.HRPension.paymentFor(r.empId, ym);
      if (pay && pay.uploadedAt) { at = pay.uploadedAt; by = pay.uploadedBy || HR_NAME; break; }
    }
    return { fileName: `퇴직연금_${ym.replace('-', '')}.xlsx`, uploadedAt: at || `${ym}-25 14:30`, uploadedBy: by || HR_NAME };
  }
  /* 업로드 배치 mock 생성 — 가입 재직자 전체 + 확인필요(금액/사번/퇴사자) 3건 샘플 주입 */
  function buildUploadBatch(ym, opt) {
    const enrolled = activeMembers().filter(m => App.HRPension.isEnrolled(m.id));
    const rows = enrolled.map(m => ({
      empId: m.id, empName: m.name, jobCat: m.jobCat,
      amount: App.HRPension.contribution(m.id), note: '', status: 'ok',
    }));
    /* 확인 필요 샘플 — 첫 1명을 금액 오류 처리.
       (주민번호 불일치 케이스는 없음 — 주민등록번호는 앞 6자리만 보관하므로 불일치가 발생하지 않는다.) */
    if (rows[0]) { rows[0].status = 'check'; rows[0].note = '금액 오류'; rows[0].amount = 0; }
    /* 매칭 실패(사번 오류) — 명단에 없는 사번 */
    rows.push({ empId: 'SW00000000', empName: '(매칭 실패)', jobCat: '', amount: 200000, note: '사번 오류', status: 'check' });
    /* 퇴사자 납입 — 확인필요 */
    const retired = (App.HRResign && App.HRResign.list) ? App.HRResign.list()[0] : null;
    if (retired) rows.push({ empId: retired.empId, empName: retired.name, jobCat: deriveJobCat(retired.dept), amount: App.HRPension.contribution(retired.empId), note: '퇴사자 납입', status: 'check' });

    return {
      ym, fileName: opt.fileName, uploadedAt: nowDateTime(), uploadedBy: opt.uploadedBy,
      status: 'pending', reupload: !!opt.reupload, rows,
    };
  }

  /* =========================================================
   *  Page STATE
   * ========================================================= */
  const STATE = {
    tab: 'cumul',                  /* 'cumul'(상용직) | 'daily'(일용직) */
    month: lastDueMonth(),         /* 퇴직연금 월별 업로드 모달 — 기준월 */
    cu:  { page: 1, pageSize: 20 },
    dy:  { page: 1, pageSize: 20 },
    filter: { keyword: '', condition: 'name', dept: '', jobCats: [], active: '', from: '', to: '', dateCol: 'joinDate' },
    dfilter: { keyword: '', condition: 'name', dept: '', eligible: '' },   /* 일용직 퇴직연금 현황 필터 */
    detailEmpId: null,             /* 직원별 상세 모달 */
    detailKind: 'regular',         /* 'regular'(상용직 상세) | 'daily'(일용직 판정 상세) */
    wdEdit: { id: null, fileName: '' },  /* 중도인출 추가/수정 팝업 상태 */
  };

  /* ============ 데이터 소스 ============ */
  function activeMembers() {
    const all = (window.App && App.HRMembers && App.HRMembers.list) ? App.HRMembers.list() : [];
    return all.filter(m => m.status !== 'retired');
  }
  function memberById(empId) {
    const all = (window.App && App.HRMembers && App.HRMembers.list) ? App.HRMembers.list() : [];
    return all.find(m => m.id === empId) || null;
  }
  function deriveJobCat(dept) {
    const d = String(dept || '');
    if (/생산/.test(d)) return 'production';
    if (/연구|R&D/i.test(d)) return 'research';
    return 'office';
  }
  /* 재직 + 퇴직(App.HRResign) 통합 인원 (직원별 누계 현황용) */
  function fullMembers() {
    const active = activeMembers().map(m => ({
      id: m.id, name: m.name, dept: m.dept || '', jobCat: m.jobCat || 'office',
      joinDate: (m.joinDate || '').slice(0, 10), resignDate: '', active: true,
      photoUrl: m.photoUrl || '', position: m.position || '', empType: m.empType || 'regular',
      site: m.site || '성수동', infoStatus: m.infoStatus || 'done',
    }));
    const retired = (window.App && App.HRResign && App.HRResign.list) ? App.HRResign.list() : [];
    const seen = {};
    active.forEach(p => { seen[p.id] = true; });
    const retiredPeople = [];
    retired.forEach(r => {
      if (seen[r.empId]) return;
      seen[r.empId] = true;
      retiredPeople.push({
        id: r.empId, name: r.name, dept: (r.dept || '').split('/').pop().trim(), jobCat: deriveJobCat(r.dept),
        joinDate: (r.joinDate || '').slice(0, 10), resignDate: (r.retiredAt || '').slice(0, 10), active: false,
        photoUrl: '', position: r.position || '', empType: 'regular',
      });
    });
    return active.concat(retiredPeople);
  }
  function personById(empId) { return fullMembers().find(p => p.id === empId) || memberById(empId); }
  function deptOptions() {
    const set = [];
    fullMembers().forEach(p => { if (p.dept && set.indexOf(p.dept) < 0) set.push(p.dept); });
    return set.sort().map(d => ({ value: d, label: d }));
  }

  /* ============ avatar ============ */
  function avColor(empId) {
    const seed = Number(String(empId || '').slice(-2)) || 1;
    return `av--c${(seed % 6) + 1}`;
  }
  function avatarHTML(p) {
    if (p && p.photoUrl) {
      return `<span class="av av--sm" style="background:transparent;"><img src="${esc(p.photoUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"></span>`;
    }
    return `<span class="av av--sm ${avColor(p && p.id)}">${esc(((p && p.name) || '?').charAt(0))}</span>`;
  }
  function avatarInline(p) {
    return p && p.photoUrl
      ? `<img src="${esc(p.photoUrl)}" alt="" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;" />`
      : `<span style="width:24px;height:24px;border-radius:50%;background:var(--color-active);color:var(--color-brand-primary);display:inline-flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;">${esc(((p && p.name) || '?').charAt(0))}</span>`;
  }

  /* =========================================================
   *  일용직 퇴직연금 대상 판정 엔진
   *
   *  판정 규칙 (근로자퇴직급여보장법 — 계속근로 1년 이상 + 주 15시간 이상)
   *   1) 계속근로는 계약이 「달력상 공백 없이」 이어지면 유지된다.
   *      · 15시간 미만 계약이 중간에 있어도 (공백이 아니므로) 계속근로는 끊기지 않는다.
   *      · 하루라도 달력상 공백이 생기면 계속근로가 끊긴다(별도 구간).
   *   2) 한 계속근로 구간 안에서 「주 15시간 이상」 계약분만 인정 기간·임금에 합산.
   *      (15시간 미만 기간은 제외)
   *   3) 대표(인정기간 최장) 계속근로 구간의 15시간 이상 인정기간이 1년(365일) 이상이면 대상자
   *   4) 퇴직금 = 인정 기간 임금 총액 ÷ 12
   *
   *  ※ 데모 시드 데이터. 실제 임금계약서/급여 연동 시 dailyWorkers() 만 교체하면 된다.
   * ========================================================= */
  const DAILY_MIN_WEEKLY_HOURS = 15;   /* 주 평균 소정근로시간 하한 */
  const DAILY_ELIGIBLE_DAYS    = 365;  /* 계속근로 1년(일) */

  let _dailySeed = null;
  function dailyWorkers() {
    if (_dailySeed) return _dailySeed;
    /* contracts[].weeklyHours = 주 평균 소정근로시간, wageTotal = 해당 계약기간 임금 총액(원) */
    _dailySeed = [
      /* 단일 계약 · 1년 미만 → 비대상 */
      { id: 'SW26060101', name: '정일용', dept: '생산본부', contracts: [
        { id: 'WC-IY-01', from: '2026-06-01', to: '2026-12-31', weeklyHours: 40, wageTotal: 16800000 },
      ] },
      /* 15시간 이상 2건이지만 중간에 공백(연속성 단절) → 각 구간 1년 미만 → 비대상 */
      { id: 'SW26030501', name: '박단기', dept: '물류센터', contracts: [
        { id: 'WC-DG-01', from: '2024-03-01', to: '2024-12-31', weeklyHours: 20, wageTotal: 9000000 },
        { id: 'WC-DG-02', from: '2025-04-01', to: '2026-01-31', weeklyHours: 20, wageTotal: 9000000 },
      ] },
      /* 15시간 이상 3건이 끊김 없이 연속 → 합산 1년 이상 → 대상 */
      { id: 'SW25050201', name: '이연속', dept: '생산본부', contracts: [
        { id: 'WC-YS-01', from: '2025-01-01', to: '2025-06-30', weeklyHours: 30, wageTotal: 12000000 },
        { id: 'WC-YS-02', from: '2025-07-01', to: '2025-12-31', weeklyHours: 32, wageTotal: 12500000 },
        { id: 'WC-YS-03', from: '2026-01-01', to: '2026-04-30', weeklyHours: 28, wageTotal: 8000000 },
      ] },
      /* 중간에 15시간 미만 계약이 끼었지만 공백 없이 계속근로 유지 → 15시간 이상 기간만 합산해 1년 이상 → 대상
         (중간 15시간 미만 기간은 인정에서 제외) */
      { id: 'SW24110301', name: '최혼합', dept: '물류센터', contracts: [
        { id: 'WC-HH-01', from: '2024-09-01', to: '2025-02-28', weeklyHours: 25, wageTotal: 7200000 },
        { id: 'WC-HH-02', from: '2025-03-01', to: '2025-05-31', weeklyHours: 10, wageTotal: 3000000 },
        { id: 'WC-HH-03', from: '2025-06-01', to: '2026-06-30', weeklyHours: 25, wageTotal: 15600000 },
      ] },
      /* 15시간 이상 연속 2년 → 대상 */
      { id: 'SW23070101', name: '한장기', dept: '생산본부', contracts: [
        { id: 'WC-JG-01', from: '2023-08-01', to: '2024-07-31', weeklyHours: 40, wageTotal: 24000000 },
        { id: 'WC-JG-02', from: '2024-08-01', to: '2025-07-31', weeklyHours: 40, wageTotal: 25200000 },
      ] },
    ];
    return _dailySeed;
  }

  function daysInclusive(from, to) {
    const a = new Date(from), b = new Date(to);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
    return Math.max(0, Math.round((b - a) / 86400000) + 1);
  }
  /* 일수 → 'N년 M개월' 표기 (1개월=30일 근사). 1개월 미만은 '일' */
  function durationLabel(days) {
    if (days <= 0) return '0일';
    const y = Math.floor(days / 365);
    const m = Math.floor((days % 365) / 30);
    const parts = [];
    if (y) parts.push(`${y}년`);
    if (m) parts.push(`${m}개월`);
    if (!parts.length) parts.push(`${days}일`);
    return parts.join(' ');
  }
  /* cur 계약이 직전 계약과 연속인지 — 직전 종료 다음 날 이내 시작(달력상 공백 없음) */
  function _dailyContinuous(prevTo, curFrom) {
    return curFrom <= ymd(addDays(new Date(prevTo), 1));
  }

  /* 근로자 1명의 대상 판정 결과.
     ── 계속근로(continuity) 판정 ──
       계약이 「달력상 공백 없이」 이어지면 계속근로가 유지된다.
       15시간 미만 계약이 중간에 있어도 (공백이 아니므로) 계속근로는 끊기지 않는다.
       달력상 하루라도 공백이 생기면 계속근로가 끊긴다(별도 구간).
     ── 인정 기간·임금 ──
       한 계속근로 구간 안에서 「주 15시간 이상」 계약분만 인정 기간·임금에 합산한다.
       (15시간 미만 기간은 제외 — incState='hours')
     ── 판정 ──
       대표(인정기간이 가장 긴) 계속근로 구간의 15시간 이상 인정기간이 1년 이상이면 대상.
       퇴직금 = 인정 기간 임금 총액 ÷ 12. */
  function assessDaily(w) {
    const contracts = (w.contracts || []).map(c => ({
      id: c.id, from: c.from, to: c.to,
      weeklyHours: Number(c.weeklyHours) || 0,
      wageTotal: Number(c.wageTotal) || 0,
      days: daysInclusive(c.from, c.to),
      eligible: (Number(c.weeklyHours) || 0) >= DAILY_MIN_WEEKLY_HOURS,
    })).sort((a, b) => String(a.from).localeCompare(String(b.from)));

    /* 계속근로 구간 구성 — 달력 공백만 구간을 끊는다(시간 수 무관). */
    const runs = [];
    let cur = null;
    contracts.forEach(c => {
      if (cur && _dailyContinuous(cur.lastTo, c.from)) {
        cur.lastTo = c.to > cur.lastTo ? c.to : cur.lastTo;
      } else {
        cur = { idx: runs.length, lastTo: c.to, eligDays: 0, eligWage: 0 };
        runs.push(cur);
      }
      c.runIdx = cur.idx;
      /* 15시간 이상 계약분만 인정 기간·임금에 합산 */
      if (c.eligible) { cur.eligDays += c.days; cur.eligWage += c.wageTotal; }
    });

    /* 대표 구간 = 15시간 이상 인정기간이 가장 긴 계속근로 구간 */
    let best = null;
    runs.forEach(r => { if (!best || r.eligDays > best.eligDays) best = r; });
    const eligibleDays = best ? best.eligDays : 0;
    const eligibleWage = best ? best.eligWage : 0;
    const isTarget = eligibleDays >= DAILY_ELIGIBLE_DAYS;
    const severance = isTarget ? Math.round(eligibleWage / 12) : 0;

    /* 계약별 합산 여부 표기:
       · 15시간 미만 → 'hours' (제외)
       · 대표 구간의 15시간 이상 → 'in' (포함)
       · 다른(달력 공백으로 분리된) 구간의 15시간 이상 → 'gap' (제외) */
    contracts.forEach(c => {
      c.incState = !c.eligible ? 'hours' : (best && c.runIdx === best.idx ? 'in' : 'gap');
    });

    return {
      id: w.id, name: w.name, dept: w.dept,
      firstFrom: contracts.length ? contracts[0].from : '',
      lastTo: contracts.length ? contracts[contracts.length - 1].to : '',
      contracts, runs, eligibleDays, eligibleWage, isTarget, severance,
    };
  }
  function dailyAssessed() { return dailyWorkers().map(assessDaily); }
  function dailyPerson(a) {
    const m = memberById(a.id);
    return m ? Object.assign({}, m, { name: a.name, dept: a.dept }) : { id: a.id, name: a.name, dept: a.dept };
  }

  /* =========================================================
   *  SHELL — 탭바 + 본문 컨테이너
   * ========================================================= */
  function render(pageEl) {
    pageEl.innerHTML = `
      <div class="att-scope-tabs" style="flex-shrink:0;" data-pen-tabs>
        <button type="button" class="att-scope-tab ${STATE.tab === 'cumul' ? 'is-active' : ''}" data-pen-tab="cumul">상용직 퇴직연금 현황</button>
        <button type="button" class="att-scope-tab ${STATE.tab === 'daily' ? 'is-active' : ''}" data-pen-tab="daily">일용직 퇴직연금 현황</button>
      </div>
      <div style="flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;" data-pen-tabbody></div>

      <!-- 직원별 상세 모달 -->
      <div class="modal-backdrop" data-pen-detail-host>
        <div class="modal modal--lg" role="dialog" aria-modal="true" aria-labelledby="pen-detail-title">
          <header class="modal__header">
            <h2 class="modal__title" id="pen-detail-title" data-pen-detail-title>직원별 퇴직연금 상세</h2>
            <button class="modal__close" type="button" data-pen-detail-close aria-label="닫기">✕</button>
          </header>
          <div class="modal__body" data-pen-detail-body></div>
          <footer class="modal__footer">
            <button class="btn" type="button" data-pen-detail-close>닫기</button>
          </footer>
        </div>
      </div>

      <!-- 중도인출 내역 추가/수정 팝업 -->
      <div class="modal-backdrop" data-pen-wd-host style="z-index:var(--z-modal);">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="pen-wd-title" style="width:480px;">
          <header class="modal__header">
            <h2 class="modal__title" id="pen-wd-title" data-pen-wd-title>중도인출 내역 추가</h2>
            <button class="modal__close" type="button" data-pen-wd-close aria-label="닫기">✕</button>
          </header>
          <div class="modal__body" data-pen-wd-body></div>
          <footer class="modal__footer offcanvas__footer--between" style="display:flex;align-items:center;">
            <span style="font-size:var(--fs-xs);color:var(--color-text-muted);">중도인출 금액은 누계에서 차감하지 않습니다.</span>
            <span style="display:flex;gap:6px;">
              <button class="btn" type="button" data-pen-wd-close>취소</button>
              <button class="btn btn--primary" type="button" data-pen-wd-save>저장</button>
            </span>
          </footer>
        </div>
      </div>

      <!-- 퇴직연금 월별 업로드 모달 — 급여정산 4대보험 업로드와 동일한 분할(split) 화면 -->
      <div class="modal-backdrop" data-pen-upl-host>
        <div class="modal modal--xl" role="dialog" aria-modal="true" aria-labelledby="pen-upl-title">
          <header class="modal__header">
            <h2 class="modal__title" id="pen-upl-title">퇴직연금 월별 업로드</h2>
            <button class="modal__close" type="button" data-pen-upl-close aria-label="닫기">✕</button>
          </header>
          <div class="modal__body" style="display:flex;flex-direction:column;gap:0;padding:14px 20px 0;">
            <div class="split" style="--split-left:340px;height:520px;max-height:56vh;border:1px solid var(--color-divider);border-radius:var(--radius-md);overflow:hidden;">
              <div class="split__left" data-pen-upl-left></div>
              <div class="split__right" data-pen-upl-right></div>
            </div>
          </div>
          <footer class="modal__footer">
            <button class="btn" type="button" data-pen-upl-close>닫기</button>
          </footer>
        </div>
      </div>
    `;
    renderTabBody(pageEl);
    bindShell(pageEl);
  }

  function renderTabBody(pageEl) {
    if (STATE.tab === 'daily') renderDailyTab(pageEl);
    else renderCumulTab(pageEl);
  }

  /* =========================================================
   *  퇴직연금 월별 업로드 모달 (분할 화면)
   *   급여 정산 > 4대보험 월 고지액 업로드 모달과 동일한 좌·우 split 구성.
   *   - 좌: 기준월 선택 + 엑셀 드롭존
   *   - 우: 업로드 정보 + 직원별 기업부담금 내역 + [업로드 데이터 적용]
   *   BATCH 모델(App.HRPension.uploadBatch/applyBatch/monthView) 을 그대로 재사용한다.
   * ========================================================= */
  /* 기준월 드롭다운 — 최근 6개월(당월 포함), 최신월이 위로 */
  function penUpRecentMonths() {
    const base = lastDueMonth();
    const out = [];
    for (let i = 0; i < 6; i++) out.push(addMonths(base, -i));
    return out;
  }
  function penUpOpen(pageEl) {
    const host = pageEl.querySelector('[data-pen-upl-host]');
    if (!host) return;
    if (!STATE.month) STATE.month = lastDueMonth();
    penUpRenderLeft(pageEl);
    penUpRenderRight(pageEl);
    host.classList.add('is-open');
  }
  function penUpClose(pageEl) {
    const host = pageEl.querySelector('[data-pen-upl-host]');
    if (host) host.classList.remove('is-open');
  }

  /* 좌측 — 기준월 선택 + 엑셀 업로드(드롭존) */
  function penUpRenderLeft(pageEl) {
    const host = pageEl.querySelector('[data-pen-upl-left]');
    if (!host) return;
    const monthOpts = penUpRecentMonths().map(m => {
      const v = App.HRPension.monthView(m);
      const tag = v.status === 'applied' ? ' · 적용완료' : (v.status === 'pending' || v.status === 'error') ? ' · 업로드됨' : '';
      return `<option value="${esc(m)}" ${m === STATE.month ? 'selected' : ''}>${esc(fmtMonthDisp(m))}${tag}</option>`;
    }).join('');
    host.innerHTML = `
      <div style="padding:14px 12px;display:flex;flex-direction:column;gap:16px;">
        <div>
          <label class="form-label" style="display:block;margin-bottom:6px;">기준월 선택 <em style="color:var(--color-danger);">*</em></label>
          <select class="select" data-pen-upl-month style="width:100%;">${monthOpts}</select>
          <p class="form-help" style="margin-top:6px;">최근 6개월까지 조회할 수 있습니다.</p>
        </div>
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
            <label class="form-label" style="margin:0;">엑셀 업로드</label>
            <button class="btn btn--xs" type="button" data-pen-upl-template>양식 다운로드</button>
          </div>
          <div class="file-field">
            <div class="dz" data-pen-upl-dz tabindex="0">
              <svg class="dz__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <div class="dz__title">엑셀을 끌어 놓거나 클릭하여 선택</div>
              <div class="dz__sub">엑셀(.xlsx/.xls) · CSV</div>
              <input type="file" hidden data-pen-upl-input accept=".xlsx,.xls,.csv" />
            </div>
          </div>
        </div>
      </div>`;
  }

  /* 우측 — 업로드 정보 + 직원별 기업부담금 내역 + [적용] */
  function penUpRenderRight(pageEl) {
    const host = pageEl.querySelector('[data-pen-upl-right]');
    if (!host) return;
    const view = App.HRPension.monthView(STATE.month);
    const rows = view.rows || [];

    if (view.status === 'none' || !rows.length) {
      host.innerHTML = `<div class="split__empty" style="flex-direction:column;gap:6px;text-align:center;line-height:1.6;">
        선택한 기준월(${esc(fmtMonthDisp(STATE.month))})에 업로드된 퇴직연금 내역이 없습니다.<br>
        <span style="font-size:var(--fs-sm);">좌측에서 엑셀을 업로드하세요.</span>
      </div>`;
      return;
    }

    const st = BATCH_STATUS[view.status] || BATCH_STATUS.none;
    const applied = view.status === 'applied';
    const contribSum = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const checkCount = rows.filter(r => r.status === 'check').length;

    const head = `
      <div class="split__head" style="align-items:center;height:auto;min-height:44px;padding:10px 14px;">
        <div style="display:flex;flex-wrap:wrap;gap:4px 20px;font-size:var(--fs-sm);color:var(--color-text-sub);align-items:center;">
          <span>기준월 <strong style="color:var(--color-text);">${esc(fmtMonthDisp(STATE.month))}</strong></span>
          <span>업로드일 <strong style="color:var(--color-text);">${esc(fmtDateTime(view.uploadedAt))}</strong></span>
          <span>담당자 <strong style="color:var(--color-text);">${esc(view.uploadedBy || '-')}</strong></span>
          <span>파일 <a href="javascript:;" data-pen-upl-download style="color:var(--color-brand-primary);">${esc(view.fileName || '-')} <span style="font-size:10px;">↓</span></a></span>
        </div>
        <span class="pill ${st.cls}" style="flex-shrink:0;">${st.label}</span>
      </div>`;

    const stat = (label, value, unit, color) => `
      <div style="flex:1;min-width:0;padding:10px 12px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);">
        <div style="font-size:var(--fs-xs);color:var(--color-text-muted);margin-bottom:4px;">${label}</div>
        <div style="font-size:var(--fs-lg);font-weight:var(--fw-bold);color:${color};">${value}<span style="font-size:var(--fs-xs);font-weight:var(--fw-regular);color:var(--color-text-muted);"> ${unit}</span></div>
      </div>`;

    const rowsHTML = rows.map((r, i) => {
      const isCheck = r.status === 'check';
      const statusPill = isCheck ? `<span class="pill pill--warning">확인 필요</span>` : `<span class="pill pill--success">정상</span>`;
      return `
        <tr>
          <td style="text-align:right;color:var(--color-text-muted);">${rows.length - i}</td>
          <td style="white-space:nowrap;">${esc(r.empId || '-')}</td>
          <td style="white-space:nowrap;font-weight:var(--fw-medium);">${esc(r.empName || '-')}</td>
          <td style="text-align:right;white-space:nowrap;${Number(r.amount) > 0 ? '' : 'color:var(--color-danger);'}">${Number(r.amount) > 0 ? fmtWon(r.amount) : '0'}</td>
          <td style="color:${isCheck ? 'var(--color-danger)' : 'var(--color-text-muted)'};font-size:var(--fs-xs);">${esc(r.note || '')}</td>
          <td style="text-align:center;">${statusPill}</td>
        </tr>`;
    }).join('');

    const body = `
      <div class="split__body" style="padding:10px 12px;">
        <div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
          ${stat('업로드 인원', fmtWon(rows.length), '명', 'var(--color-brand-primary)')}
          ${stat('기업부담금 합계', fmtWon(contribSum), '원', 'var(--color-brand-primary)')}
          ${stat('확인 필요', fmtWon(checkCount), '건', checkCount ? 'var(--color-danger)' : 'var(--color-text-muted)')}
        </div>
        <div class="table-card"><div class="table-card__body">
          <table class="tbl tbl--hover" style="min-width:560px;">
            <thead><tr>
              <th style="width:48px;text-align:right;">순번</th>
              <th style="width:130px;">사번</th>
              <th>가입자명</th>
              <th style="width:150px;text-align:right;">기업부담금(퇴직금)</th>
              <th style="width:130px;">비고</th>
              <th style="width:90px;text-align:center;">상태</th>
            </tr></thead>
            <tbody>${rowsHTML}</tbody>
          </table>
        </div></div>
      </div>`;

    const foot = `
      <div style="padding:10px 14px;border-top:1px solid var(--color-divider);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-shrink:0;background:var(--color-surface);">
        ${applied ? '<span></span>' : `<button class="btn btn--sm" type="button" data-pen-upl-del style="color:var(--color-danger);">업로드 삭제</button>`}
        <div style="display:flex;align-items:center;gap:12px;">
          <span class="form-help" style="margin:0;">${applied ? '이미 상용직 퇴직연금 현황에 반영되었습니다.' : '업로드만으로는 반영되지 않습니다. 내용 확인 후 [적용]하세요.'}</span>
          ${applied
            ? '<button class="btn btn--sm" type="button" disabled>적용됨</button>'
            : '<button class="btn btn--sm btn--primary" type="button" data-pen-upl-apply>업로드 데이터 적용</button>'}
        </div>
      </div>`;

    host.innerHTML = head + body + foot;
  }

  /* 엑셀 업로드(mock) — 기존 업로드분이 있으면 재업로드 확인 */
  function penUpAddFile(pageEl, file) {
    const view = App.HRPension.monthView(STATE.month);
    if (view.status === 'pending' || view.status === 'applied' || view.status === 'error') {
      if (!confirm('해당 기준월에 이미 업로드된 퇴직연금 내역이 있습니다. 기존 파일을 삭제하고 새 파일로 다시 업로드하시겠습니까?')) return;
    }
    const batch = App.HRPension.uploadBatch(STATE.month, { fileName: file ? file.name : undefined, uploadedBy: HR_NAME });
    penUpRenderLeft(pageEl);
    penUpRenderRight(pageEl);
    const checkN = (batch.rows || []).filter(r => r.status === 'check').length;
    flashOk(`${fmtMonthDisp(STATE.month)} 퇴직연금 업로드 완료 · ${batch.rows.length}건 (확인 필요 ${checkN}건). 검토 후 [적용]하세요.`, checkN ? 'warning' : 'success');
  }
  function penUpApply(pageEl) {
    const view = App.HRPension.monthView(STATE.month);
    if (view.status !== 'pending' && view.status !== 'error') return;
    const checkN = (view.rows || []).filter(r => r.status === 'check').length;
    const proceed = () => {
      const res = App.HRPension.applyBatch(STATE.month);
      penUpRenderLeft(pageEl);
      penUpRenderRight(pageEl);
      if (STATE.tab === 'cumul') refreshCumul(pageEl);
      flashOk(`${fmtMonthDisp(STATE.month)} 기업부담금 ${res.applied}건이 상용직 퇴직연금 현황에 반영되었습니다.${res.skipped ? ` (확인 필요 ${res.skipped}건 제외)` : ''}`);
    };
    if (checkN && App.confirmModal) {
      App.confirmModal({
        title: `확인 필요 ${checkN}건이 있습니다.`,
        message: '정상 건만 적용하고 확인 필요 건은 제외합니다. 계속하시겠습니까?',
        confirmText: '정상 건 적용',
        onConfirm: proceed,
      });
    } else { proceed(); }
  }
  function penUpDelUpload(pageEl) {
    const view = App.HRPension.monthView(STATE.month);
    if (view.status !== 'pending' && view.status !== 'error') return;   /* 적용완료분은 삭제 불가 */
    if (!confirm(`${fmtMonthDisp(STATE.month)} 업로드 내역을 삭제하시겠습니까?`)) return;
    delete BATCH[STATE.month];
    penUpRenderLeft(pageEl);
    penUpRenderRight(pageEl);
    flashOk('업로드 내역이 삭제되었습니다.');
  }
  function penUpDownloadFile(pageEl) {
    const view = App.HRPension.monthView(STATE.month);
    if (view.fileName && App.downloadFile) App.downloadFile(view.fileName, { context: '퇴직연금 월별 업로드' });
  }

  /* =========================================================
   *  TAB 1 — 상용직 퇴직연금 현황 (기업부담금 누계)
   * ========================================================= */
  function renderCumulTab(pageEl) {
    const body = pageEl.querySelector('[data-pen-tabbody]');
    if (!body) return;
    const C = App.Components;
    const searchHTML = C.searchPanel({
      showDateRange: true,
      dateLabel: '조회기간',
      /* 조회기간 기준 선택 — 입사일(일자) / 최종 납입월(월) */
      dateColumns: [{ key: 'joinDate', label: '입사일' }, { key: 'lastPaidMonth', label: '최종 납입월' }],
      quick: [],
      conditions: [{ value: 'name', label: '성명' }, { value: 'empId', label: '사번' }],
      placeholder: '직원명 또는 사번 검색',
      cols: 2,
      advanced: [
        { name: 'dept', label: '부서', options: deptOptions() },
        { name: 'active', label: '재직상태', options: [{ value: 'y', label: '재직' }, { value: 'n', label: '퇴직' }] },
      ],
    });

    body.innerHTML = `
      ${searchHTML}
      <div style="flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;">
        <div class="toolbar" style="flex-shrink:0;">
          <div class="toolbar__left"><span class="toolbar__count">총 <strong data-pen-cu-count>0</strong>명</span></div>
          <div class="toolbar__right">
            <button class="btn btn--sm" type="button" data-pen-cu-excel>${(window.Icons && window.Icons.download) || ''} 엑셀 다운로드</button>
            <button class="btn btn--sm btn--primary" type="button" data-pen-cu-upload>${(window.Icons && window.Icons.upload) || ''} 퇴직연금 월별 업로드</button>
          </div>
        </div>
        <div class="grid-wrap" style="flex:1;min-height:0;">
          <div class="grid-scroll">
            <table class="tbl tbl--hover">
              <thead>
                <tr>
                  <th style="width:52px;text-align:center;">No</th>
                  <th style="width:130px;">사번</th>
                  <th>직원명</th>
                  <th style="width:120px;">부서</th>
                  <th style="width:100px;text-align:center;">입사일</th>
                  <th style="width:100px;text-align:center;">퇴사일</th>
                  <th style="width:84px;text-align:center;">재직상태</th>
                  <th style="width:150px;text-align:right;">최근 납입 기업부담금</th>
                  <th style="width:100px;text-align:center;">최종 납입월</th>
                  <th style="width:160px;text-align:right;">기업부담금 총 누계액</th>
                  <th style="width:96px;text-align:center;">중도인출</th>
                  <th style="width:72px;text-align:center;">상세</th>
                </tr>
              </thead>
              <tbody data-pen-cu-body></tbody>
            </table>
          </div>
          <div class="pagination">
            <div class="pagination__info" data-pen-cu-info></div>
            <div class="pagination__right">
              <div class="pagination__size">
                <label>페이지당</label>
                <select class="select" data-pen-cu-pagesize>
                  <option value="20" selected>20</option><option value="50">50</option><option value="100">100</option><option value="200">200</option>
                </select>
                <span>건</span>
              </div>
              <div class="pagination__list" data-pen-cu-pagination></div>
            </div>
          </div>
        </div>
      </div>
    `;
    bindCumul(pageEl);
    refreshCumul(pageEl);
  }

  function applyCumulFilter(list) {
    const f = STATE.filter;
    const kw = (f.keyword || '').trim().toLowerCase();
    return list.filter(p => {
      /* 정규직 누계 현황 — 일용직은 별도 「일용직 누계 현황」 탭에서 관리하므로 제외 */
      if (p.empType === 'daily') return false;
      if (kw) {
        const t = f.condition === 'empId' ? p.id : p.name;
        if (!String(t || '').toLowerCase().includes(kw)) return false;
      }
      if (f.dept && p.dept !== f.dept) return false;
      if (f.active === 'y' && !p.active) return false;
      if (f.active === 'n' && p.active) return false;
      /* 조회기간 — 선택 기준(입사일 YYYY-MM-DD / 최종 납입월 YYYY-MM)이 범위에 드는 행만 */
      if (f.from || f.to) {
        const v = f.dateCol === 'lastPaidMonth'
          ? (App.HRPension.lastPaidMonth(p.id) || '')
          : String(p.joinDate || '').slice(0, 10);
        if (!v) return false;
        if (f.from && v < f.from) return false;
        if (f.to && v > f.to) return false;
      }
      return true;
    });
  }

  function cumulRowsHTML(rows, total, start) {
    if (!rows.length) {
      return `<tr><td colspan="12" style="text-align:center;color:var(--color-text-muted);padding:32px 0;">조건에 해당하는 직원이 없습니다.</td></tr>`;
    }
    return rows.map((p, i) => {
      const no = total - (start + i);
      const cum = App.HRPension.contribCumulative(p.id);
      const last = App.HRPension.lastPaidMonth(p.id);
      const recent = last ? ((App.HRPension.paymentFor(p.id, last) || {}).paidAmount || 0) : 0;
      const wdCount = App.HRPension.withdrawals(p.id).length;
      const statusPill = p.active ? `<span class="pill pill--success">재직</span>` : `<span class="pill pill--muted">퇴직</span>`;
      return `
        <tr class="is-clickable" data-pen-cu-row="${esc(p.id)}">
          <td style="text-align:center;color:var(--color-text-muted);">${no}</td>
          <td><a href="#" class="link-code" data-pen-card="${esc(p.id)}">${esc(p.id)}</a></td>
          <td>
            <div style="display:flex;align-items:center;gap:8px;min-width:0;">
              ${avatarInline(p)}
              <a href="#" data-pen-card="${esc(p.id)}" style="color:var(--color-brand-primary);font-weight:var(--fw-medium);white-space:nowrap;">${esc(p.name)}</a>
            </div>
          </td>
          <td style="white-space:nowrap;color:var(--color-text-sub);">${esc(p.dept || '-')}</td>
          <td style="text-align:center;white-space:nowrap;color:var(--color-text-sub);">${p.joinDate ? esc(fmtYYMMDD(p.joinDate)) : '-'}</td>
          <td style="text-align:center;white-space:nowrap;color:var(--color-text-sub);">${p.resignDate ? esc(fmtYYMMDD(p.resignDate)) : '-'}</td>
          <td style="text-align:center;">${statusPill}</td>
          <td style="text-align:right;white-space:nowrap;${recent ? 'color:var(--color-text-sub);' : 'color:var(--color-text-muted);'}">${recent ? fmtWon(recent) : '-'}</td>
          <td style="text-align:center;white-space:nowrap;color:var(--color-text-sub);">${last ? esc(fmtMonthDisp(last)) : '-'}</td>
          <td style="text-align:right;font-weight:var(--fw-semibold);color:var(--color-brand-primary);">${cum ? fmtWon(cum) : '<span style="color:var(--color-text-muted);font-weight:var(--fw-regular);">-</span>'}</td>
          <td style="text-align:center;">${wdCount ? `<span style="color:var(--color-danger);font-size:var(--fs-xs);">${wdCount}건</span>` : `<span style="color:var(--color-text-muted);font-size:var(--fs-xs);">0건</span>`}</td>
          <td style="text-align:center;"><button class="btn btn--xs" type="button" data-pen-detail="${esc(p.id)}">보기</button></td>
        </tr>`;
    }).join('');
  }

  function refreshCumul(pageEl) {
    const filtered = applyCumulFilter(fullMembers());
    const total = filtered.length;
    const start = (STATE.cu.page - 1) * STATE.cu.pageSize;
    const rows = filtered.slice(start, start + STATE.cu.pageSize);
    const bodyEl = pageEl.querySelector('[data-pen-cu-body]');
    if (bodyEl) bodyEl.innerHTML = cumulRowsHTML(rows, total, start);
    const cnt = pageEl.querySelector('[data-pen-cu-count]');
    if (cnt) cnt.textContent = total;
    renderPagination(pageEl, total, STATE.cu, {
      info: '[data-pen-cu-info]', list: '[data-pen-cu-pagination]', size: '[data-pen-cu-pagesize]',
    });
  }

  /* =========================================================
   *  TAB 2 — 일용직 퇴직연금 현황 (대상 판정)
   * ========================================================= */
  function renderDailyTab(pageEl) {
    const body = pageEl.querySelector('[data-pen-tabbody]');
    if (!body) return;
    const C = App.Components;
    const searchHTML = C.searchPanel({
      showDateRange: false,
      quick: [],
      conditions: [{ value: 'name', label: '성명' }, { value: 'empId', label: '사번' }],
      placeholder: '직원명 또는 사번 검색',
      cols: 2,
      advanced: [
        { name: 'dept', label: '부서', options: dailyDeptOptions() },
        { name: 'eligible', label: '대상 판정', options: [{ value: 'y', label: '대상' }, { value: 'n', label: '비대상' }] },
      ],
    });

    body.innerHTML = `
      ${searchHTML}
      <div style="flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;">
        <div class="toolbar" style="flex-shrink:0;">
          <div class="toolbar__left"><span class="toolbar__count">총 <strong data-pen-dy-count>0</strong>명 <span data-pen-dy-target style="color:var(--color-text-muted);font-size:var(--fs-xs);"></span></span></div>
          <div class="toolbar__right">
            <button class="btn btn--sm" type="button" data-pen-dy-excel>${(window.Icons && window.Icons.download) || ''} 엑셀 다운로드</button>
          </div>
        </div>
        <div class="grid-wrap" style="flex:1;min-height:0;">
          <div class="grid-scroll">
            <table class="tbl tbl--hover">
              <thead>
                <tr>
                  <th style="width:52px;text-align:center;">No</th>
                  <th style="width:130px;">사번</th>
                  <th>직원명</th>
                  <th style="width:120px;">부서</th>
                  <th style="width:100px;text-align:center;">최초 계약일</th>
                  <th style="width:160px;text-align:center;">인정 근로기간 (15시간 이상)</th>
                  <th style="width:160px;text-align:right;">인정 기간 임금 총액</th>
                  <th style="width:100px;text-align:center;">대상 판정</th>
                  <th style="width:150px;text-align:right;">예상 퇴직금</th>
                  <th style="width:72px;text-align:center;">상세</th>
                </tr>
              </thead>
              <tbody data-pen-dy-body></tbody>
            </table>
          </div>
          <div class="pagination">
            <div class="pagination__info" data-pen-dy-info></div>
            <div class="pagination__right">
              <div class="pagination__size">
                <label>페이지당</label>
                <select class="select" data-pen-dy-pagesize>
                  <option value="20" selected>20</option><option value="50">50</option><option value="100">100</option><option value="200">200</option>
                </select>
                <span>건</span>
              </div>
              <div class="pagination__list" data-pen-dy-pagination></div>
            </div>
          </div>
        </div>
      </div>
    `;
    bindDaily(pageEl);
    refreshDaily(pageEl);
  }

  function dailyDeptOptions() {
    const set = [];
    dailyAssessed().forEach(a => { if (a.dept && set.indexOf(a.dept) < 0) set.push(a.dept); });
    return set.sort().map(d => ({ value: d, label: d }));
  }

  function applyDailyFilter(list) {
    const f = STATE.dfilter;
    const kw = (f.keyword || '').trim().toLowerCase();
    return list.filter(a => {
      if (kw) {
        const t = f.condition === 'empId' ? a.id : a.name;
        if (!String(t || '').toLowerCase().includes(kw)) return false;
      }
      if (f.dept && a.dept !== f.dept) return false;
      if (f.eligible === 'y' && !a.isTarget) return false;
      if (f.eligible === 'n' && a.isTarget) return false;
      return true;
    });
  }

  function dailyRowsHTML(rows, total, start) {
    if (!rows.length) {
      return `<tr><td colspan="10" style="text-align:center;color:var(--color-text-muted);padding:32px 0;">조건에 해당하는 일용직 근로자가 없습니다.</td></tr>`;
    }
    return rows.map((a, i) => {
      const no = total - (start + i);
      const p = dailyPerson(a);
      const linkable = !!memberById(a.id);
      const idCell = linkable
        ? `<a href="#" class="link-code" data-pen-card="${esc(a.id)}">${esc(a.id)}</a>`
        : `<span class="link-code" style="color:var(--color-text-sub);">${esc(a.id)}</span>`;
      const nameCell = linkable
        ? `<a href="#" data-pen-card="${esc(a.id)}" style="color:var(--color-brand-primary);font-weight:var(--fw-medium);white-space:nowrap;">${esc(a.name)}</a>`
        : `<span style="color:var(--color-text);font-weight:var(--fw-medium);white-space:nowrap;">${esc(a.name)}</span>`;
      const targetPill = a.isTarget
        ? `<span class="pill pill--success">대상</span>`
        : `<span class="pill pill--muted">비대상</span>`;
      return `
        <tr class="is-clickable" data-pen-dy-row="${esc(a.id)}">
          <td style="text-align:center;color:var(--color-text-muted);">${no}</td>
          <td>${idCell}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px;min-width:0;">
              ${avatarInline(p)}
              ${nameCell}
            </div>
          </td>
          <td style="white-space:nowrap;color:var(--color-text-sub);">${esc(a.dept || '-')}</td>
          <td style="text-align:center;white-space:nowrap;color:var(--color-text-sub);">${a.firstFrom ? esc(fmtYYMMDD(a.firstFrom)) : '-'}</td>
          <td style="text-align:center;white-space:nowrap;${a.eligibleDays ? '' : 'color:var(--color-text-muted);'}">${a.eligibleDays ? esc(durationLabel(a.eligibleDays)) : '-'}</td>
          <td style="text-align:right;white-space:nowrap;color:var(--color-text-sub);">${a.eligibleWage ? fmtWon(a.eligibleWage) : '-'}</td>
          <td style="text-align:center;">${targetPill}</td>
          <td style="text-align:right;font-weight:var(--fw-semibold);${a.isTarget ? 'color:var(--color-brand-primary);' : 'color:var(--color-text-muted);font-weight:var(--fw-regular);'}">${a.isTarget ? fmtWon(a.severance) : '-'}</td>
          <td style="text-align:center;"><button class="btn btn--xs" type="button" data-pen-dy-detail="${esc(a.id)}">보기</button></td>
        </tr>`;
    }).join('');
  }

  function refreshDaily(pageEl) {
    const filtered = applyDailyFilter(dailyAssessed());
    const total = filtered.length;
    const targetN = filtered.filter(a => a.isTarget).length;
    const start = (STATE.dy.page - 1) * STATE.dy.pageSize;
    const rows = filtered.slice(start, start + STATE.dy.pageSize);
    const bodyEl = pageEl.querySelector('[data-pen-dy-body]');
    if (bodyEl) bodyEl.innerHTML = dailyRowsHTML(rows, total, start);
    const cnt = pageEl.querySelector('[data-pen-dy-count]');
    if (cnt) cnt.textContent = total;
    const tgt = pageEl.querySelector('[data-pen-dy-target]');
    if (tgt) tgt.textContent = total ? `· 대상 ${targetN}명` : '';
    renderPagination(pageEl, total, STATE.dy, {
      info: '[data-pen-dy-info]', list: '[data-pen-dy-pagination]', size: '[data-pen-dy-pagesize]',
    });
  }

  function bindDaily(pageEl) {
    const searchRoot = pageEl.querySelector('[data-search]');
    const onSearch = (params) => {
      const adv = params.advanced || {};
      STATE.dfilter.keyword = (params.keyword || '').trim();
      STATE.dfilter.condition = params.condition || 'name';
      STATE.dfilter.dept = adv.dept || '';
      STATE.dfilter.eligible = adv.eligible || '';
      STATE.dy.page = 1;
      refreshDaily(pageEl);
    };
    if (App.Search && App.Search.attach) App.Search.attach(searchRoot, onSearch, { defaultQuick: null });

    const pg = pageEl.querySelector('[data-pen-dy-pagination]');
    if (pg) pg.addEventListener('click', e => {
      const b = e.target.closest('.pagination__btn');
      if (!b || b.disabled) return;
      const p = Number(b.dataset.page);
      if (Number.isFinite(p)) { STATE.dy.page = p; refreshDaily(pageEl); }
    });
    const ps = pageEl.querySelector('[data-pen-dy-pagesize]');
    if (ps) ps.addEventListener('change', e => { STATE.dy.pageSize = Number(e.target.value); STATE.dy.page = 1; refreshDaily(pageEl); });

    const excel = pageEl.querySelector('[data-pen-dy-excel]');
    if (excel) excel.addEventListener('click', () => downloadDailyExcel());
  }

  /* ----- 일용직 판정 상세 모달 본문 ----- */
  function dailyDetailBodyHTML(empId) {
    const a = dailyAssessed().find(x => x.id === empId);
    if (!a) return `<div style="text-align:center;color:var(--color-text-muted);padding:32px 0;">데이터가 없습니다.</div>`;
    const p = dailyPerson(a);
    const statusPill = a.isTarget
      ? '<span class="pill pill--success pill--lg">퇴직연금 대상</span>'
      : '<span class="pill pill--muted pill--lg">비대상</span>';

    const infoLine = (label, value) => `<span style="white-space:nowrap;"><span style="color:var(--color-text-muted);">${label}</span> ${value}</span>`;
    const headerHTML = `
      <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:var(--color-surface-alt);border:1px solid var(--color-border);border-radius:var(--radius-md);margin-bottom:16px;">
        ${avatarHTML(p)}
        <div style="min-width:0;flex:1;">
          <div style="font-weight:var(--fw-semibold);color:var(--color-text);">${esc(a.name)} <span style="color:var(--color-text-muted);font-weight:var(--fw-regular);font-size:var(--fs-sm);">${esc(a.id)}</span></div>
          <div style="display:flex;flex-wrap:wrap;gap:4px 14px;font-size:var(--fs-xs);color:var(--color-text-sub);margin-top:4px;">
            ${infoLine('부서', esc(a.dept || '-'))}
            ${infoLine('최초 계약일', a.firstFrom ? esc(fmtYYMMDD(a.firstFrom)) : '-')}
            ${infoLine('최종 계약종료', a.lastTo ? esc(fmtYYMMDD(a.lastTo)) : '-')}
          </div>
        </div>
        <div>${statusPill}</div>
      </div>`;

    const stat = (label, value, unit, color, sub) => `
      <div style="flex:1;min-width:0;padding:12px 14px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);">
        <div style="font-size:var(--fs-xs);color:var(--color-text-muted);margin-bottom:4px;">${label}</div>
        <div style="font-size:var(--fs-xl);font-weight:var(--fw-bold);color:${color};">${value}<span style="font-size:var(--fs-xs);font-weight:var(--fw-regular);color:var(--color-text-muted);"> ${unit}</span></div>
        ${sub ? `<div style="font-size:var(--fs-xs);color:var(--color-text-muted);margin-top:2px;">${sub}</div>` : ''}
      </div>`;
    const summaryHTML = `
      <div style="display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap;">
        ${stat('인정 근로기간 (15시간 이상)', a.eligibleDays ? durationLabel(a.eligibleDays) : '0일', '', a.isTarget ? 'var(--color-success)' : 'var(--color-text)', `1년 이상 시 대상 · ${a.eligibleDays.toLocaleString()}일`)}
        ${stat('인정 기간 임금 총액', fmtWon(a.eligibleWage), '원', 'var(--color-text)', '계속근로 중 15시간 이상 구간')}
        ${stat('예상 퇴직금', a.isTarget ? fmtWon(a.severance) : '-', a.isTarget ? '원' : '', a.isTarget ? 'var(--color-brand-primary)' : 'var(--color-text-muted)', a.isTarget ? '임금 총액 ÷ 12' : '대상 아님')}
      </div>`;

    const incInfo = {
      in:    { pill: '<span class="pill pill--success">포함</span>', note: '' },
      hours: { pill: '<span class="pill pill--muted">제외</span>', note: '15시간 미만' },
      gap:   { pill: '<span class="pill pill--muted">제외</span>', note: '연속성 단절' },
    };
    const rowsHTML = a.contracts.length
      ? a.contracts.map(c => {
          const inc = incInfo[c.incState] || incInfo.gap;
          const included = c.incState === 'in';
          return `
            <tr${included ? '' : ' style="opacity:.55;"'}>
              <td style="white-space:nowrap;">${esc(fmtYYMMDD(c.from))} ~ ${esc(fmtYYMMDD(c.to))}</td>
              <td style="text-align:center;white-space:nowrap;">${esc(durationLabel(c.days))}</td>
              <td style="text-align:right;white-space:nowrap;${c.weeklyHours >= DAILY_MIN_WEEKLY_HOURS ? 'color:var(--color-text);font-weight:var(--fw-medium);' : 'color:var(--color-danger);'}">${c.weeklyHours}시간</td>
              <td style="text-align:right;white-space:nowrap;color:var(--color-text-sub);">${fmtWon(c.wageTotal)}</td>
              <td style="text-align:center;white-space:nowrap;">${inc.pill}${inc.note ? `<div style="font-size:var(--fs-xs);color:var(--color-text-muted);margin-top:2px;">${inc.note}</div>` : ''}</td>
            </tr>`;
        }).join('')
      : `<tr><td colspan="5" style="text-align:center;color:var(--color-text-muted);padding:22px 0;">등록된 임금계약서가 없습니다.</td></tr>`;
    const tableHTML = `
      <div style="font-size:var(--fs-sm);font-weight:var(--fw-semibold);margin-bottom:8px;color:var(--color-text);">임금계약서 내역 <span style="color:var(--color-text-muted);font-weight:var(--fw-regular);">(공백 없이 계속근로 중 주 15시간 이상 기간만 인정 · 15시간 미만 기간·달력 공백은 제외)</span></div>
      <table class="tbl tbl--bordered" style="width:100%;">
        <thead><tr>
          <th style="width:180px;">계약 기간</th>
          <th style="width:110px;text-align:center;">기간</th>
          <th style="width:120px;text-align:right;">주 소정근로</th>
          <th style="text-align:right;">임금 총액(원)</th>
          <th style="width:80px;text-align:center;">합산 여부</th>
        </tr></thead>
        <tbody>${rowsHTML}</tbody>
      </table>`;

    return `${headerHTML}${summaryHTML}${tableHTML}`;
  }

  function downloadDailyExcel() {
    const list = applyDailyFilter(dailyAssessed());
    const header = ['사번', '직원명', '부서', '최초 계약일', '인정 근로기간(일)', '인정 근로기간', '인정 기간 임금 총액', '대상 판정', '예상 퇴직금'];
    const lines = [header.join(',')];
    list.forEach(a => {
      lines.push([
        csvCell(a.id), csvCell(a.name), csvCell(a.dept),
        a.firstFrom || '', a.eligibleDays, durationLabel(a.eligibleDays),
        a.eligibleWage, a.isTarget ? '대상' : '비대상', a.isTarget ? a.severance : '',
      ].map(csvCell).join(','));
    });
    const csv = '﻿' + lines.join('\r\n');
    triggerDownload(`퇴직연금_일용직누계_${TODAY.replace(/-/g, '')}.csv`, new Blob([csv], { type: 'text/csv;charset=utf-8;' }), '일용직 누계 현황');
    flashOk(`일용직 누계 현황 ${list.length}건을 받았습니다.`);
  }

  /* =========================================================
   *  직원별 상세 모달
   * ========================================================= */
  function detailBodyHTML(empId) {
    const p = personById(empId) || { id: empId, name: '', dept: '', position: '' };
    const cum = App.HRPension.contribCumulative(empId);
    const last = App.HRPension.lastPaidMonth(empId);
    const withdrawn = App.HRPension.withdrawnTotal(empId);
    const wdCount = App.HRPension.withdrawals(empId).length;
    const statusPill = p.active ? '<span class="pill pill--success pill--lg">재직</span>' : '<span class="pill pill--muted pill--lg">퇴직</span>';

    /* ----- 헤더: 직원 기본정보 + 요약 ----- */
    const infoLine = (label, value) => `<span style="white-space:nowrap;"><span style="color:var(--color-text-muted);">${label}</span> ${value}</span>`;
    const headerHTML = `
      <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:var(--color-surface-alt);border:1px solid var(--color-border);border-radius:var(--radius-md);margin-bottom:16px;">
        ${avatarHTML(p)}
        <div style="min-width:0;flex:1;">
          <div style="font-weight:var(--fw-semibold);color:var(--color-text);">${esc(p.name)} <span style="color:var(--color-text-muted);font-weight:var(--fw-regular);font-size:var(--fs-sm);">${esc(p.id)}</span></div>
          <div style="display:flex;flex-wrap:wrap;gap:4px 14px;font-size:var(--fs-xs);color:var(--color-text-sub);margin-top:4px;">
            ${infoLine('부서', esc(p.dept || '-'))}
            ${infoLine('사원유형', esc(jobCatLabel(p.jobCat)))}
            ${infoLine('입사일', esc(fmtYYMMDD(p.joinDate)))}
            ${infoLine('퇴사일', p.resignDate ? esc(fmtYYMMDD(p.resignDate)) : '-')}
          </div>
        </div>
        <div>${statusPill}</div>
      </div>`;

    /* ----- 누계 요약 stat ----- */
    const stat = (label, value, unit, color, sub) => `
      <div style="flex:1;min-width:0;padding:12px 14px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);">
        <div style="font-size:var(--fs-xs);color:var(--color-text-muted);margin-bottom:4px;">${label}</div>
        <div style="font-size:var(--fs-xl);font-weight:var(--fw-bold);color:${color};">${value}<span style="font-size:var(--fs-xs);font-weight:var(--fw-regular);color:var(--color-text-muted);"> ${unit}</span></div>
        ${sub ? `<div style="font-size:var(--fs-xs);color:var(--color-text-muted);margin-top:2px;">${sub}</div>` : ''}
      </div>`;
    const summaryHTML = `
      <div style="display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap;">
        ${stat('기업부담금 누계', fmtWon(cum), '원', 'var(--color-brand-primary)', '최종 납입월 ' + (last ? fmtMonthDisp(last) : '-'))}
        ${stat('중도인출 누계', fmtWon(withdrawn), '원', withdrawn ? 'var(--color-danger)' : 'var(--color-text-muted)', wdCount + '건')}
      </div>`;

    /* ----- 월별 기업부담금 납입 내역 ----- */
    const pays = App.HRPension.payments(empId).filter(x => Number(x.paidAmount) > 0);
    const payRowsHTML = pays.length
      ? pays.map(p2 => `
          <tr>
            <td style="text-align:center;white-space:nowrap;font-weight:var(--fw-medium);">${esc(fmtMonthDisp(p2.month))}</td>
            <td style="text-align:right;white-space:nowrap;color:var(--color-brand-primary);font-weight:var(--fw-medium);">${fmtWon(p2.paidAmount)}</td>
            <td style="text-align:center;white-space:nowrap;color:var(--color-text-sub);">${p2.uploadedAt ? esc(fmtDateTime(p2.uploadedAt)) : '-'}</td>
            <td style="text-align:center;white-space:nowrap;color:var(--color-text-sub);">${esc(p2.uploadedBy || '-')}</td>
            <td style="color:var(--color-text-muted);font-size:var(--fs-xs);">${esc(p2.note || '')}</td>
          </tr>`).join('')
      : `<tr><td colspan="5" style="text-align:center;color:var(--color-text-muted);padding:22px 0;">적용된 월별 기업부담금 내역이 없습니다.</td></tr>`;
    const payHTML = `
      <div style="font-size:var(--fs-sm);font-weight:var(--fw-semibold);margin-bottom:8px;color:var(--color-text);">월별 기업부담금 납입 내역</div>
      <table class="tbl tbl--bordered" style="width:100%;margin-bottom:20px;">
        <thead><tr>
          <th style="width:96px;text-align:center;">기준월</th>
          <th style="text-align:right;">기업부담금(원)</th>
          <th style="width:150px;text-align:center;">업로드일시</th>
          <th style="width:110px;text-align:center;">업로드 담당자</th>
          <th>비고</th>
        </tr></thead>
        <tbody>${payRowsHTML}</tbody>
      </table>`;

    /* ----- 중도인출 내역 ----- */
    const wds = App.HRPension.withdrawals(empId);
    const wdRowsHTML = wds.length
      ? wds.map(w => `
          <tr>
            <td style="white-space:nowrap;">${esc(fmtYYMMDD(w.date))}</td>
            <td style="text-align:right;white-space:nowrap;color:var(--color-danger);">${fmtWon(w.amount)}</td>
            <td style="white-space:nowrap;">${esc(w.reason || '-')}</td>
            <td style="text-align:center;white-space:nowrap;color:var(--color-text-sub);">${w.registeredAt ? esc(fmtDateTime(w.registeredAt)) : '-'}</td>
            <td style="text-align:center;white-space:nowrap;color:var(--color-text-sub);">${esc(w.registeredBy || '-')}</td>
            <td style="color:var(--color-text-muted);font-size:var(--fs-xs);">${esc(w.note || '')}</td>
            <td style="text-align:center;white-space:nowrap;">${w.fileName
              ? `<a href="javascript:;" data-pen-wd-file="${esc(w.fileName)}" style="color:var(--color-brand-primary);font-size:var(--fs-xs);">첨부 보기 <span style="font-size:10px;">↓</span></a>`
              : '<span style="color:var(--color-text-muted);">-</span>'}</td>
            <td style="text-align:center;white-space:nowrap;">
              <button class="btn btn--xs" type="button" data-pen-wd-editbtn="${esc(w.id)}">수정</button>
              <button class="btn btn--xs btn--soft-danger" type="button" data-pen-wd-del="${esc(w.id)}">삭제</button>
            </td>
          </tr>`).join('')
      : `<tr><td colspan="8" style="text-align:center;color:var(--color-text-muted);padding:22px 0;">등록된 중도인출 내역이 없습니다.</td></tr>`;
    const wdHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
        <div style="font-size:var(--fs-sm);font-weight:var(--fw-semibold);color:var(--color-text);">중도인출 내역</div>
        <button class="btn btn--sm btn--primary" type="button" data-pen-wd-add>+ 중도인출 내역 추가</button>
      </div>
      <table class="tbl tbl--bordered" style="width:100%;">
        <thead><tr>
          <th style="width:100px;">인출일자</th>
          <th style="width:130px;text-align:right;">인출금액(원)</th>
          <th style="width:120px;">인출사유</th>
          <th style="width:150px;text-align:center;">등록일시</th>
          <th style="width:90px;text-align:center;">등록자</th>
          <th>비고</th>
          <th style="width:110px;text-align:center;">첨부파일</th>
          <th style="width:96px;text-align:center;">관리</th>
        </tr></thead>
        <tbody>${wdRowsHTML}</tbody>
      </table>`;

    return `${headerHTML}${summaryHTML}${payHTML}${wdHTML}`;
  }

  function openDetail(pageEl, empId, kind) {
    STATE.detailEmpId = empId;
    STATE.detailKind = kind || 'regular';
    renderDetailBody(pageEl);
    const host = pageEl.querySelector('[data-pen-detail-host]');
    if (host) host.classList.add('is-open');
  }
  function closeDetail(pageEl) {
    STATE.detailEmpId = null;
    STATE.detailKind = 'regular';
    const host = pageEl.querySelector('[data-pen-detail-host]');
    if (host) host.classList.remove('is-open');
  }
  function renderDetailBody(pageEl) {
    if (!STATE.detailEmpId) return;
    const title = pageEl.querySelector('[data-pen-detail-title]');
    const body = pageEl.querySelector('[data-pen-detail-body]');
    if (STATE.detailKind === 'daily') {
      const a = dailyAssessed().find(x => x.id === STATE.detailEmpId);
      if (title) title.textContent = `일용직 퇴직연금 대상 판정${a ? ' (' + a.name + ')' : ''}`;
      if (body) body.innerHTML = dailyDetailBodyHTML(STATE.detailEmpId);
      return;
    }
    const p = personById(STATE.detailEmpId);
    if (title) title.textContent = `직원별 퇴직연금 상세${p ? ' (' + p.name + ')' : ''}`;
    if (body) body.innerHTML = detailBodyHTML(STATE.detailEmpId);
  }

  /* ----- 중도인출 추가/수정 팝업 ----- */
  function wdFormHTML(edit) {
    const w = edit || {};
    return `
      <div class="fm-tbl fm-tbl--bordered fm-tbl--compact">
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label">인출일자 <em style="color:var(--color-danger);">*</em></div>
          <div class="fm-tbl__value"><input class="input" type="date" data-pen-wf-date max="${TODAY}" value="${esc(w.date || '')}" style="width:100%;"></div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label">인출금액 <em style="color:var(--color-danger);">*</em></div>
          <div class="fm-tbl__value"><input class="input" type="text" inputmode="numeric" data-pen-wf-amt placeholder="0" value="${w.amount ? fmtWon(w.amount) : ''}" style="width:100%;text-align:right;"></div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label">인출사유 <em style="color:var(--color-danger);">*</em></div>
          <div class="fm-tbl__value">
            <select class="select" data-pen-wf-reason style="width:100%;">
              <option value="">사유 선택</option>
              ${WITHDRAW_REASONS.map(r => `<option value="${esc(r)}"${w.reason === r ? ' selected' : ''}>${esc(r)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label">비고</div>
          <div class="fm-tbl__value"><textarea class="input" data-pen-wf-note placeholder="담당자 메모" style="width:100%;height:50px;min-height:50px;resize:vertical;">${esc(w.note || '')}</textarea></div>
        </div>
        <div class="fm-tbl__row fm-tbl__row--1">
          <div class="fm-tbl__label">첨부파일</div>
          <div class="fm-tbl__value">
            <div style="display:flex;align-items:center;gap:8px;">
              <button class="btn btn--sm" type="button" data-pen-wf-pick>파일 선택</button>
              <span data-pen-wf-fname style="font-size:var(--fs-sm);color:var(--color-text-${w.fileName ? '' : 'muted'});">${w.fileName ? esc(w.fileName) : '선택된 파일 없음'}</span>
            </div>
            <input type="file" hidden data-pen-wf-file>
          </div>
        </div>
      </div>`;
  }
  function openWdPopup(pageEl, editId) {
    const w = editId ? App.HRPension.withdrawals(STATE.detailEmpId).find(x => x.id === editId) : null;
    STATE.wdEdit = { id: editId || null, fileName: (w && w.fileName) || '' };
    const title = pageEl.querySelector('[data-pen-wd-title]');
    const body = pageEl.querySelector('[data-pen-wd-body]');
    if (title) title.textContent = editId ? '중도인출 내역 수정' : '중도인출 내역 추가';
    if (body) body.innerHTML = wdFormHTML(w);
    const host = pageEl.querySelector('[data-pen-wd-host]');
    if (host) host.classList.add('is-open');
  }
  function closeWdPopup(pageEl) {
    STATE.wdEdit = { id: null, fileName: '' };
    const host = pageEl.querySelector('[data-pen-wd-host]');
    if (host) host.classList.remove('is-open');
  }
  function saveWdFromPopup(pageEl) {
    const body = pageEl.querySelector('[data-pen-wd-body]');
    if (!body || !STATE.detailEmpId) return;
    const dateEl = body.querySelector('[data-pen-wf-date]');
    const amtEl = body.querySelector('[data-pen-wf-amt]');
    const reaEl = body.querySelector('[data-pen-wf-reason]');
    const noteEl = body.querySelector('[data-pen-wf-note]');

    App.Forms && App.Forms.clearAll && App.Forms.clearAll(body);
    let ok = true;
    if (!dateEl.value) { App.Forms.setFieldError(dateEl, '인출일자를 선택해 주세요.'); ok = false; }
    else if (dateEl.value > TODAY) { App.Forms.setFieldError(dateEl, '미래 일자는 입력할 수 없습니다.'); ok = false; }
    const amt = parseWon(amtEl.value);
    if (!amt) { App.Forms.setFieldError(amtEl, '인출금액을 입력해 주세요.'); ok = false; }
    const reason = reaEl.value;
    if (!reason) { App.Forms.setFieldError(reaEl, '인출사유를 선택해 주세요.'); ok = false; }
    if (!ok) return;

    const payload = { date: dateEl.value, amount: amt, reason, note: (noteEl.value || '').trim(), fileName: STATE.wdEdit.fileName };
    if (STATE.wdEdit.id) {
      App.HRPension.updateWithdrawal(STATE.detailEmpId, STATE.wdEdit.id, payload);
      flashOk('중도인출 내역이 수정되었습니다.');
    } else {
      App.HRPension.addWithdrawal(STATE.detailEmpId, payload);
      flashOk('중도인출 내역이 등록되었습니다.');
    }
    closeWdPopup(pageEl);
    renderDetailBody(pageEl);
    if (STATE.tab === 'cumul') refreshCumul(pageEl);
  }

  /* =========================================================
   *  공통 페이지네이션 렌더
   * ========================================================= */
  function renderPagination(pageEl, total, st, sel) {
    const size = st.pageSize;
    const start = (st.page - 1) * size;
    const totalPages = Math.max(1, Math.ceil(total / size));
    if (st.page > totalPages) st.page = totalPages;

    const info = pageEl.querySelector(sel.info);
    if (info) info.textContent = total === 0 ? '0건' : `${start + 1}-${Math.min(start + size, total)} / ${total}건`;

    const btns = [];
    btns.push(`<button class="pagination__btn" data-page="1" ${st.page === 1 ? 'disabled' : ''}>«</button>`);
    btns.push(`<button class="pagination__btn" data-page="${Math.max(1, st.page - 1)}" ${st.page === 1 ? 'disabled' : ''}>‹</button>`);
    const win = 10;
    let s = Math.max(1, st.page - Math.floor(win / 2));
    let e = Math.min(totalPages, s + win - 1);
    if (e - s < win - 1) s = Math.max(1, e - win + 1);
    for (let i = s; i <= e; i++) {
      btns.push(`<button class="pagination__btn${i === st.page ? ' is-active' : ''}" data-page="${i}">${i}</button>`);
    }
    btns.push(`<button class="pagination__btn" data-page="${Math.min(totalPages, st.page + 1)}" ${st.page === totalPages ? 'disabled' : ''}>›</button>`);
    btns.push(`<button class="pagination__btn" data-page="${totalPages}" ${st.page === totalPages ? 'disabled' : ''}>»</button>`);
    const list = pageEl.querySelector(sel.list);
    if (list) list.innerHTML = btns.join('');
    const ps = pageEl.querySelector(sel.size);
    if (ps) ps.value = String(st.pageSize);
  }

  /* =========================================================
   *  BIND
   * ========================================================= */
  function bindShell(pageEl) {
    const tabs = pageEl.querySelector('[data-pen-tabs]');
    if (tabs) tabs.addEventListener('click', e => {
      const b = e.target.closest('[data-pen-tab]');
      if (!b) return;
      const t = b.dataset.penTab;
      if (t === STATE.tab) return;
      STATE.tab = t;
      tabs.querySelectorAll('.att-scope-tab').forEach(x => x.classList.toggle('is-active', x.dataset.penTab === t));
      renderTabBody(pageEl);
    });

    if (pageEl.dataset.penDelegated) return;
    pageEl.dataset.penDelegated = '1';

    /* 금액 입력 blur 시 콤마 정렬 */
    pageEl.addEventListener('blur', e => {
      const el = e.target.closest('[data-pen-wf-amt]');
      if (el) el.value = el.value.trim() ? fmtWon(parseWon(el.value)) : '';
    }, true);

    /* 파일 선택 / 기준월 선택 change */
    pageEl.addEventListener('change', e => {
      /* 퇴직연금 업로드 모달 — 기준월 선택 */
      if (e.target.matches('[data-pen-upl-month]')) {
        STATE.month = e.target.value;
        penUpRenderLeft(pageEl); penUpRenderRight(pageEl);
        return;
      }
      /* 퇴직연금 업로드 모달 — 엑셀 파일 선택 */
      if (e.target.matches('[data-pen-upl-input]')) {
        const f = e.target.files && e.target.files[0];
        if (f) penUpAddFile(pageEl, f);
        e.target.value = '';
        return;
      }
      const wf = e.target.closest('[data-pen-wf-file]');
      if (wf) {
        const f = wf.files && wf.files[0];
        STATE.wdEdit.fileName = f ? f.name : STATE.wdEdit.fileName;
        const nameEl = pageEl.querySelector('[data-pen-wf-fname]');
        if (nameEl && f) { nameEl.textContent = f.name; nameEl.style.color = 'var(--color-text)'; }
        return;
      }
    });

    /* 퇴직연금 업로드 모달 — 드래그&드롭 */
    pageEl.addEventListener('dragover',  e => { const dz = e.target.closest('[data-pen-upl-dz]'); if (dz) { e.preventDefault(); dz.classList.add('is-over'); } });
    pageEl.addEventListener('dragleave', e => { const dz = e.target.closest('[data-pen-upl-dz]'); if (dz) dz.classList.remove('is-over'); });
    pageEl.addEventListener('drop', e => {
      const dz = e.target.closest('[data-pen-upl-dz]'); if (!dz) return;
      e.preventDefault(); dz.classList.remove('is-over');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) penUpAddFile(pageEl, f);
    });

    /* 전역 위임 클릭 */
    pageEl.addEventListener('click', e => {
      /* 사번·성명 → 인사정보카드 */
      const cardLink = e.target.closest('[data-pen-card]');
      if (cardLink) {
        e.preventDefault(); e.stopPropagation();
        const m = memberById(cardLink.dataset.penCard) || personById(cardLink.dataset.penCard);
        if (m && App.HRInfoCard && App.HRInfoCard.open) {
          App.HRInfoCard.open(Object.assign({
            empType: m.empType || 'regular', jobCat: m.jobCat || 'office',
            site: m.site || '성수동', infoStatus: 'done',
          }, m));
        }
        return;
      }

      /* ----- 직원별(정규직) 상세 진입 (버튼 / 행) ----- */
      const detailBtn = e.target.closest('[data-pen-detail]');
      if (detailBtn) { openDetail(pageEl, detailBtn.dataset.penDetail); return; }
      const row = e.target.closest('[data-pen-cu-row]');
      if (row && STATE.tab === 'cumul') {
        if (e.target.closest('button, a, input, select, textarea, label')) return;
        const s = window.getSelection && window.getSelection();
        if (s && s.type === 'Range' && String(s).length > 0) return;
        openDetail(pageEl, row.dataset.penCuRow); return;
      }

      /* ----- 일용직 판정 상세 진입 (버튼 / 행) ----- */
      const dyDetailBtn = e.target.closest('[data-pen-dy-detail]');
      if (dyDetailBtn) { openDetail(pageEl, dyDetailBtn.dataset.penDyDetail, 'daily'); return; }
      const dyRow = e.target.closest('[data-pen-dy-row]');
      if (dyRow && STATE.tab === 'daily') {
        if (e.target.closest('button, a, input, select, textarea, label')) return;
        const s = window.getSelection && window.getSelection();
        if (s && s.type === 'Range' && String(s).length > 0) return;
        openDetail(pageEl, dyRow.dataset.penDyRow, 'daily'); return;
      }

      /* ----- 상세 모달 ----- */
      if (e.target.closest('[data-pen-detail-close]') || e.target === pageEl.querySelector('[data-pen-detail-host]')) {
        closeDetail(pageEl); return;
      }
      /* 중도인출 첨부 다운로드 */
      const wdFile = e.target.closest('[data-pen-wd-file]');
      if (wdFile) {
        e.preventDefault();
        if (App.downloadFile) App.downloadFile(wdFile.dataset.penWdFile, { context: '중도인출 증빙' });
        return;
      }
      /* 중도인출 추가/수정/삭제 */
      if (e.target.closest('[data-pen-wd-add]')) { openWdPopup(pageEl, null); return; }
      const wdEditBtn = e.target.closest('[data-pen-wd-editbtn]');
      if (wdEditBtn) { openWdPopup(pageEl, wdEditBtn.dataset.penWdEditbtn); return; }
      const wdDel = e.target.closest('[data-pen-wd-del]');
      if (wdDel && STATE.detailEmpId) {
        const id = wdDel.dataset.penWdDel;
        App.confirmDelete && App.confirmDelete({
          title: '중도인출 내역을 삭제하시겠습니까?', message: '이 작업은 되돌릴 수 없습니다.',
          onConfirm() {
            App.HRPension.removeWithdrawal(STATE.detailEmpId, id);
            renderDetailBody(pageEl);
            if (STATE.tab === 'cumul') refreshCumul(pageEl);
            flashOk('중도인출 내역이 삭제되었습니다.');
          },
        });
        return;
      }

      /* ----- 중도인출 팝업 ----- */
      if (e.target.closest('[data-pen-wf-pick]')) {
        const fileEl = pageEl.querySelector('[data-pen-wf-file]');
        if (fileEl) fileEl.click(); return;
      }
      if (e.target.closest('[data-pen-wd-save]')) { saveWdFromPopup(pageEl); return; }
      if (e.target.closest('[data-pen-wd-close]') || e.target === pageEl.querySelector('[data-pen-wd-host]')) { closeWdPopup(pageEl); return; }

      /* ----- 퇴직연금 월별 업로드 모달 ----- */
      if (e.target.closest('[data-pen-upl-dz]')) {
        const fileEl = pageEl.querySelector('[data-pen-upl-input]');
        if (fileEl) fileEl.click(); return;
      }
      if (e.target.closest('[data-pen-upl-template]')) { downloadTemplate(); return; }
      if (e.target.closest('[data-pen-upl-apply]'))    { penUpApply(pageEl); return; }
      if (e.target.closest('[data-pen-upl-del]'))      { penUpDelUpload(pageEl); return; }
      if (e.target.closest('[data-pen-upl-download]')) { e.preventDefault(); penUpDownloadFile(pageEl); return; }
      if (e.target.closest('[data-pen-upl-close]') || e.target === pageEl.querySelector('[data-pen-upl-host]')) { penUpClose(pageEl); return; }
    });

    pageEl.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (pageEl.querySelector('[data-pen-wd-host].is-open')) closeWdPopup(pageEl);
      else if (pageEl.querySelector('[data-pen-upl-host].is-open')) penUpClose(pageEl);
      else if (STATE.detailEmpId) closeDetail(pageEl);
    });
  }

  function bindCumul(pageEl) {
    const searchRoot = pageEl.querySelector('[data-search]');
    const onSearch = (params) => {
      const adv = params.advanced || {};
      STATE.filter.keyword = (params.keyword || '').trim();
      STATE.filter.condition = params.condition || 'name';
      STATE.filter.dept = adv.dept || '';
      STATE.filter.active = adv.active || '';
      STATE.filter.from = params.from || '';
      STATE.filter.to = params.to || '';
      STATE.filter.dateCol = params.dateKey || 'joinDate';
      STATE.cu.page = 1;
      refreshCumul(pageEl);
    };
    if (App.Search && App.Search.attach) App.Search.attach(searchRoot, onSearch, { defaultQuick: null });
    setupPeriodBasis(searchRoot, onSearch);

    const pg = pageEl.querySelector('[data-pen-cu-pagination]');
    if (pg) pg.addEventListener('click', e => {
      const b = e.target.closest('.pagination__btn');
      if (!b || b.disabled) return;
      const p = Number(b.dataset.page);
      if (Number.isFinite(p)) { STATE.cu.page = p; refreshCumul(pageEl); }
    });
    const ps = pageEl.querySelector('[data-pen-cu-pagesize]');
    if (ps) ps.addEventListener('change', e => { STATE.cu.pageSize = Number(e.target.value); STATE.cu.page = 1; refreshCumul(pageEl); });

    const excel = pageEl.querySelector('[data-pen-cu-excel]');
    if (excel) excel.addEventListener('click', () => downloadCumulExcel());

    const upBtn = pageEl.querySelector('[data-pen-cu-upload]');
    if (upBtn) upBtn.addEventListener('click', () => penUpOpen(pageEl));
  }

  /* 조회기간 — 선택 기준에 따라 입력 타입 전환 (입사일=일자 / 최종 납입월=월) + 기본값 비움 */
  function setupPeriodBasis(searchRoot, onSearch) {
    if (!searchRoot) return;
    const fromEl = searchRoot.querySelector('[data-from]');
    const toEl = searchRoot.querySelector('[data-to]');
    const colEl = searchRoot.querySelector('[data-date-col]');
    if (!fromEl || !toEl) return;
    const applyMode = () => {
      const isMonth = colEl && colEl.value === 'lastPaidMonth';
      [fromEl, toEl].forEach(el => {
        el.type = isMonth ? 'month' : 'date';   /* 최종 납입월 → 월만 선택 */
        el.value = '';
        el.classList.toggle('input--date', !isMonth);
      });
    };
    applyMode();
    if (colEl) colEl.addEventListener('change', () => {
      applyMode();
      onSearch && onSearch(App.Search.readParams(searchRoot));
    });
    const resetBtn = searchRoot.querySelector('[data-reset]');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      setTimeout(() => {
        applyMode();
        onSearch && onSearch(App.Search.readParams(searchRoot));
      }, 0);
    });
  }

  /* ----- 엑셀 양식 / 다운로드 ----- */
  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function triggerDownload(fileName, blob, context) {
    if (App.downloadFile) { App.downloadFile(fileName, { blob, context }); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function downloadTemplate() {
    const ym = STATE.month;
    const emps = activeMembers().filter(m => App.HRPension.isEnrolled(m.id));
    const header = ['기준월', '가입자명', '주민등록번호 앞자리+뒷자리 첫번째 숫자만', '기업부담금(퇴직금)', '비고'];
    const lines = [header.join(',')];
    emps.forEach(m => {
      lines.push([ym, csvCell(m.name), '', App.HRPension.contribution(m.id), ''].map(csvCell).join(','));
    });
    const csv = '﻿' + lines.join('\r\n');
    triggerDownload(`퇴직연금_기업부담금_양식_${ym.replace('-', '')}.csv`, new Blob([csv], { type: 'text/csv;charset=utf-8;' }), '퇴직연금 기업부담금 양식');
    flashOk(`${fmtMonthDisp(ym)} 기업부담금 양식을 받았습니다. (가입 직원 ${emps.length}명)`);
  }
  function downloadCumulExcel() {
    const list = applyCumulFilter(fullMembers());
    const header = ['사번', '직원명', '부서', '입사일', '퇴사일', '재직상태', '최근 납입 기업부담금', '최종 납입월', '기업부담금 총 누계액', '중도인출 건수'];
    const lines = [header.join(',')];
    list.forEach(p => {
      const last = App.HRPension.lastPaidMonth(p.id);
      const recent = last ? ((App.HRPension.paymentFor(p.id, last) || {}).paidAmount || 0) : 0;
      lines.push([
        csvCell(p.id), csvCell(p.name), csvCell(p.dept),
        p.joinDate || '', p.resignDate || '', p.active ? '재직' : '퇴직',
        recent, last || '',
        App.HRPension.contribCumulative(p.id),
        App.HRPension.withdrawals(p.id).length,
      ].map(csvCell).join(','));
    });
    const csv = '﻿' + lines.join('\r\n');
    triggerDownload(`퇴직연금_정규직누계_${TODAY.replace(/-/g, '')}.csv`, new Blob([csv], { type: 'text/csv;charset=utf-8;' }), '정규직 누계 현황');
    flashOk(`정규직 누계 현황 ${list.length}건을 받았습니다.`);
  }

  function flashOk(msg, kind) {
    if (App.flashToast) App.flashToast(msg, kind || 'success');
    else if (window.toast) window.toast(msg, kind || 'success');
  }

  /* App.Forms 폴백 */
  if (!App.Forms) {
    App.Forms = {
      setFieldError(el, msg) { if (el) { el.title = msg; el.style.borderColor = 'var(--color-danger)'; } },
      clearAll(root) { if (root) root.querySelectorAll('.input,.select').forEach(el => { el.style.borderColor = ''; el.title = ''; }); },
    };
  }

  /* =========================================================
   *  마운트
   * ========================================================= */
  function initPage() {
    const pageEl = document.getElementById('page-hr-pension');
    if (!pageEl) return;
    pageEl.__onShow = () => { render(pageEl); };
  }
  const prev = App.initPages;
  App.initPages = function () {
    if (typeof prev === 'function') prev();
    initPage();
  };
})();
