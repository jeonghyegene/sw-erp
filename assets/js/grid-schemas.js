/* =========================================================
 * Grid Schemas
 *
 * page-grid 화면을 사용하는 LNB 항목별 그리드 스키마 레지스트리.
 *
 * 각 스키마 형태:
 *   {
 *     columns:  [{ key, label, align?, width?, format?(v,row) }, ...],
 *     mock:     (n) => rows[],                       // mock 데이터 생성기
 *     search:   { conditions, advanced, checkGroups },  // 검색 패널 spec
 *     filter:   (rows, params) => filteredRows,      // 필터 함수
 *   }
 *
 * 등록되지 않은 item id 는 default 스키마 사용 (HR 사원 정보).
 *
 * 새 그리드 화면 추가: 이 파일에 한 블록만 추가하면 됨.
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});
  const Pill = (text, kind) => `<span class="pill ${kind ? 'pill--' + kind : ''}">${text}</span>`;

  // 공통 mock 헬퍼
  function pad2(n) { return String(n).padStart(2, '0'); }
  function dateStr(year, monthSeed, daySeed) {
    return `${year}-${pad2((monthSeed % 12) + 1)}-${pad2((daySeed % 27) + 1)}`;
  }
  function dateTimeStr(year, monthSeed, daySeed, hourSeed, minSeed) {
    return `${dateStr(year, monthSeed, daySeed)} ${pad2(hourSeed % 24)}:${pad2(minSeed % 60)}`;
  }
  function pick(arr, i) { return arr[i % arr.length]; }
  function won(n) { return n.toLocaleString(); }   // §2.2: 셀은 천 단위 콤마만, 단위는 헤더 (원)

  // ===== SWADPIA 표기 포맷터 =====
  // §1.1 일자: YY/MM/DD (예: 26/05/12)
  const fmtYMD = (v) => {
    if (!v) return '';
    const s = String(v);
    // '2026-05-12' or '2026/05/12' → '26/05/12'
    const m = s.match(/^(\d{2,4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (!m) return s;
    const yy = m[1].slice(-2);
    return `${yy}/${pad2(+m[2])}/${pad2(+m[3])}`;
  };
  // §1.2 일시: YY/MM/DD   HH:MM (공백 3칸)
  const fmtYMDHM = (v) => {
    if (!v) return '';
    const s = String(v);
    const m = s.match(/^(\d{2,4})[-./](\d{1,2})[-./](\d{1,2})[ T](\d{1,2}):(\d{1,2})/);
    if (!m) return s;
    return `${m[1].slice(-2)}/${pad2(+m[2])}/${pad2(+m[3])}   ${pad2(+m[4])}:${pad2(+m[5])}`;
  };
  // §8.1 코드 표기: <a class="link-code"> 블루 + 언더바
  const fmtCode = (v) => v ? `<a class="link-code">${v}</a>` : '';
  // 소모품 구분 pill — App.Consumables.GUBUN_PILL 단일 진실원 (로드 전 fallback)
  const supGubunPill = (v) => {
    const m = (window.App && window.App.Consumables && window.App.Consumables.GUBUN_PILL) || { '일반소모품': 'info', '사무소모품': 'success' };
    return `<span class="pill pill--${m[v] || 'muted'}">${v || ''}</span>`;
  };
  // 자재 도메인 자재코드 표기: 블루 + Bold (언더바 없음) — 도메인 공통
  const fmtMatCode = (v) => v ? `<strong style="color:var(--color-brand-primary);">${v}</strong>` : '';
  // §2.2 금액 표기: 천 단위 콤마 (셀에 단위 없음. 헤더에 (원) 표시)
  const fmtMoney = (v) => {
    if (v == null || v === '') return '';
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.-]/g, ''));
    return isNaN(n) ? v : n.toLocaleString();
  };
  // 수량 + 단위 표기 — unit '매' 인 경우 (원자재 용지) 자동으로 "/N연" 부가 표시
  //   500매 = 1연 (정수 떨어지면 정수, 아니면 소수 1자리)
  const fmtQtyUnit = (v, row) => {
    const n = Number(v) || 0;
    const unit = row && row.unit ? row.unit : '';
    const numStr = n.toLocaleString();
    if (!unit) return numStr;
    let extra = '';
    if (unit === '매' && n > 0) {
      const reams = n / 500;
      const reamStr = Number.isInteger(reams) ? String(reams) : reams.toFixed(1);
      extra = `<span style="color:var(--color-text-muted); font-size:var(--fs-xs);"> / ${reamStr}연</span>`;
    }
    return `${numStr}<span style="color:var(--color-text-muted); font-size:var(--fs-xs);"> ${unit}</span>${extra}`;
  };

  // 텍스트 검색 헬퍼 — 키워드/조건 모두 적용
  function textFilter(rows, params, defaultKeys) {
    if (!params.keyword) return rows;
    const kw = params.keyword.toLowerCase();
    const cond = params.condition;
    return rows.filter(r => {
      if (cond && cond !== 'all') return String(r[cond] ?? '').toLowerCase().includes(kw);
      return defaultKeys.some(k => String(r[k] ?? '').toLowerCase().includes(kw));
    });
  }
  function advFilter(rows, params) {
    const adv = params.advanced || {};
    return rows.filter(r => Object.keys(adv).every(k => {
      const v = adv[k];
      if (v == null || v === '') return true;
      // 다중선택(배열) — 빈 배열은 전체 통과, 그 외는 row 값이 배열의 어느 항목과 일치하는지
      if (Array.isArray(v)) {
        if (v.length === 0) return true;
        return v.includes(String(r[k] ?? ''));
      }
      return String(r[k] ?? '').includes(v);
    }));
  }
  function dateFilter(rows, params, defaultKey) {
    // 검색 패널이 dateKey 를 보내오면 그것을, 아니면 schema 기본 key
    const key = (params && params.dateKey) ? params.dateKey : defaultKey;
    if (!key) return rows;
    // 일시 컬럼("2026-05-12 14:30")도 일 단위로 비교 — 앞 10자리(YYYY-MM-DD) 추출 후 from/to 와 비교
    const datePart = (v) => String(v ?? '').slice(0, 10);
    if (params.from) rows = rows.filter(r => datePart(r[key]) >= params.from);
    if (params.to)   rows = rows.filter(r => datePart(r[key]) <= params.to);
    return rows;
  }

  /* ---------- 결재 페이지 공통 스키마 빌더 (대기/완료/반려) ---------- */
  function _buildMyApprovalSchema(segment) {
    const STATE_KIND = { '대기':'warning', '진행중':'info', '완료':'success', '반려':'danger' };
    const STAGE_KIND = { '결재':'success', '대기':'warning', '반려':'danger', '-':'muted' };
    const mode = segment === 'inbox' ? 'approver-inbox'
              : segment === 'done'  ? 'approver-done'
                                    : 'approver-reject';
    const listFn = () => {
      const A = window.App && window.App.MyApprovals;
      if (!A) return [];
      return segment === 'inbox' ? A.forInbox()
           : segment === 'done'  ? A.forDone()
                                 : A.forReject();
    };

    function renderLineCell(row) {
      const text = (row._stages || []).map(s => `${s.name}(${s.status})`).join(' → ');
      return `<div style="display:flex; align-items:center; gap:8px;">
        <span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis;">${text}</span>
        <button type="button" class="grid__expand-btn" data-grid-expand title="결재선 상세 펼치기"><span class="caret">▸</span></button>
      </div>`;
    }

    // 반려 단계(상태='반려') 추출 — 반려자/반려일시 컬럼에서 공용
    const rejectStageOf = (row) => (row._stages || []).find(s => s.status === '반려') || null;

    // 세그먼트별 추가 컬럼
    //  · done   : 결재일시 (내 결재 시점)
    //  · reject : 반려자(본인/이후 결재자 구분) + 반려일시 (반려 단계 기준)
    const segCols =
      segment === 'done' ? [
        { key: 'myActionAt', label: '결재일시', align: 'center', width: '170px', format: fmtYMDHM },
      ] :
      segment === 'reject' ? [
        { key: '_rejecter', label: '반려자', align: 'left', width: '150px',
          format: (_, row) => {
            const rj = rejectStageOf(row);
            if (!rj) return '<span style="color:var(--color-text-muted);">—</span>';
            const isMe = rj.name === '윤성수';
            const pill = isMe
              ? `<span class="pill pill--soft-danger">본인</span>`
              : `<span class="pill pill--soft-warning2">이후 결재자</span>`;
            return `<span style="display:inline-flex; align-items:center; gap:6px;">${pill}<span>${rj.name}</span></span>`;
          } },
        { key: '_rejectAt', label: '반려일시', align: 'center', width: '170px',
          format: (_, row) => { const rj = rejectStageOf(row); return fmtYMDHM(rj ? rj.when : ''); } },
      ] : [];

    return {
      refreshOnShow: true,
      toolbarActions: [{ label: '엑셀', icon: 'download' }],
      // 긴급 결재 행 — 붉은색 계열 하이라이트 (도메인 표준 .is-urgent)
      rowClass: (row) => row && row.priority === '긴급' ? 'is-urgent' : '',
      columns: [
        { key: 'no',         label: 'No',           align: 'center',  width: '60px' },
        { key: 'docNo',      label: '문서/요청번호', align: 'left',   width: '160px',
          format: (v) => v ? `<a class="link-code" data-approval-detail data-doc-no="${v}">${v}</a>` : '' },
        { key: 'priority',   label: '구분',         align: 'center', width: '70px',
          format: (v) => v === '긴급'
            ? `<span class="pill pill--danger">긴급</span>`
            : `<span class="pill pill--muted">일반</span>` },
        { key: 'kind',       label: '유형',         align: 'center', width: '80px',
          format: (v) => v === '시스템'
            ? `<span class="pill pill--info">시스템</span>`
            : `<span class="pill pill--muted">기안</span>` },
        { key: 'docName',    label: '문서/요청명',   align: 'center', width: '140px' },
        { key: 'title',      label: '제목',         align: 'left' },
        { key: 'status',     label: '상태',         align: 'center', width: '90px',
          format: (_, row) => `<span class="pill pill--${STATE_KIND[row.statusText] || 'muted'}">${row.statusText}</span>` },
        { key: 'drafter',     label: '기안자',       align: 'left',   width: '90px' },
        { key: 'drafterDept', label: '부서',         align: 'left',   width: '120px' },
        { key: 'draftAt',     label: '기안일시',     align: 'center', width: '170px', format: fmtYMDHM },
        ...segCols,
        { key: 'line',       label: '결재선',       align: 'left',
          format: (_, row) => renderLineCell(row) },
        { key: 'detail',     label: '상세',         align: 'center', width: '70px',
          format: (_, row) => `<button type="button" class="btn btn--xs btn--soft-primary" data-approval-detail data-doc-no="${row.docNo}">상세</button>` },
      ],
      expand(row) {
        const stages = row._stages || [];
        return `<div style="display:flex; flex-direction:column; gap:6px;">
          <div style="font-weight:var(--fw-semibold); color:var(--color-text); font-size:var(--fs-sm);">결재선 — 단계별 결재 정보</div>
          <table class="grid" style="width:auto; min-width:560px;">
            <thead>
              <tr>
                <th style="width:60px;">단계</th>
                <th style="width:140px;">결재자</th>
                <th style="width:90px;">결재</th>
                <th style="width:170px;">결재일시</th>
                <th>의견</th>
              </tr>
            </thead>
            <tbody>
              ${stages.map((s, idx) => `
                <tr>
                  <td class="col-center">${idx + 1}차</td>
                  <td>${s.name}${s.name === '윤성수' ? '<span style="color:var(--color-brand-primary); font-weight:var(--fw-semibold); margin-left:4px;">(나)</span>' : ''}</td>
                  <td class="col-center">${Pill(s.status, STAGE_KIND[s.status] || 'muted')}</td>
                  <td class="col-center">${fmtYMDHM(s.when)}</td>
                  <td>${s.comment ? String(s.comment) : '<span style="color:var(--color-text-muted);">—</span>'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`;
      },
      mock() { return listFn(); },
      // 기본 검색(기간/키워드) + 결재 구분(일반/긴급) 라디오
      //  · 반려 화면은 기간 기준을 '반려일' 기본값으로 (반려일시 → 기안일 순)
      search: {
        ...(segment === 'reject' ? {
          dateColumns: [
            { key: '_rejectAt', label: '반려일' },
            { key: 'draftAt',   label: '기안일' },
          ],
        } : {}),
        conditions: [
          { value: 'all',     label: '전체' },
          { value: 'title',   label: '제목' },
          { value: 'docNo',   label: '문서/요청번호' },
          { value: 'docName', label: '문서/요청명' },
          { value: 'drafter', label: '기안자' },
        ],
        radioGroups: [
          { key: 'priority', label: '구분', wide: false, defaultValue: '', items: [
            { value: '',     label: '전체' },
            { value: '일반', label: '일반' },
            { value: '긴급', label: '긴급' },
          ]},
        ],
      },
      filter(rows, p) {
        rows = textFilter(rows, p, ['title','docNo','docName','drafter']);
        // 반려 화면은 반려일 기준이 기본 (드롭다운 선택 시 p.dateKey 우선)
        rows = dateFilter(rows, p, segment === 'reject' ? '_rejectAt' : 'draftAt');
        // 결재 구분 라디오 (전체 / 일반 / 긴급)
        if (p.radios && p.radios.priority) {
          rows = rows.filter(r => r.priority === p.radios.priority);
        }
        return rows;
      },
      bindActions(pageEl, refresh, getRows) {
        pageEl.addEventListener('click', (e) => {
          const t = e.target.closest('[data-approval-detail]');
          if (!t) return;
          const docNo = t.dataset.docNo;
          if (!docNo) return;
          const row = (getRows ? getRows() : []).find(r => r.docNo === docNo);
          if (window.App && window.App.openDocDetail && row) {
            window.App.openDocDetail(row, refresh, getRows, { mode });
          }
        });
      },
    };
  }
  function chkFilter(rows, params, map) {
    const c = params.checks || {};
    return rows.filter(r => Object.keys(map).every(groupKey => {
      const selected = c[groupKey];
      if (!selected || !selected.length) return true;
      const rowVal = map[groupKey](r);
      if (Array.isArray(rowVal)) return rowVal.some(v => selected.includes(v));
      return selected.includes(rowVal);
    }));
  }

  // ===== 스키마 정의 =====
  const SCHEMAS = {

    /* ---------- HR: 인사 관리 (default fallback) ---------- */
    'hr-employee': {
      columns: [
        { key: 'no',     label: 'No',     align: 'center',  width: '60px' },
        { key: 'empno',  label: '사번',   align: 'left',   width: '90px',  format: fmtCode },   // §8.1 코드 표기
        { key: 'name',   label: '이름',   align: 'left',   width: '100px' },
        { key: 'dept',   label: '부서',   align: 'left' },
        { key: 'pos',    label: '직급',   align: 'left' },
        { key: 'joined', label: '입사일', align: 'center', format: fmtYMD },                    // §1.1 YY/MM/DD
        { key: 'email',  label: '이메일', align: 'left' },
        { key: 'phone',  label: '연락처', align: 'left' },
        { key: 'status', label: '상태',   align: 'center', width: '80px' },
      ],
      mock(n = 235) {
        const dept = ['경영지원','인사팀','재무팀','영업1팀','영업2팀','개발팀','품질팀','생산팀'];
        const pos  = ['사원','주임','대리','과장','차장','부장'];
        const wt   = ['정규직','계약직','파견','인턴'];
        const off  = ['성수동','하남','인현동','충무로'];
        const st   = [['재직','success'],['휴직','warning'],['퇴직','danger']];
        const rows = [];
        for (let i = 1; i <= n; i++) {
          const s = st[i % 17 === 0 ? 2 : i % 11 === 0 ? 1 : 0];
          rows.push({
            no: i, empno: 'E' + (10000 + i), name: '홍길동' + i,
            dept: pick(dept, i), pos: pick(pos, i),
            joined: dateStr(2020, i, i),
            email: `user${i}@company.co.kr`,
            phone: `010-${1000 + (i*7) % 9000}-${1000 + (i*13) % 9000}`,
            statusText: s[0],
            status: Pill(s[0], s[1]),
            worktype: pick(wt, i), office: pick(off, i),
          });
        }
        return rows;
      },
      search: {
        conditions: [
          { value: 'all',   label: '전체' },
          { value: 'name',  label: '이름' },
          { value: 'empno', label: '사번' },
          { value: 'dept',  label: '부서' },
          { value: 'email', label: '이메일' },
        ],
        cols: 3,  // 3컬럼 레이아웃
        advanced: [
          { name: 'dept',       label: '부서',     options: ['경영지원','인사팀','재무팀','영업1팀','영업2팀','개발팀','품질팀','생산팀'] },
          { name: 'pos',        label: '직급',     options: ['사원','주임','대리','과장','차장','부장'] },
          { name: 'statusText', label: '재직 상태', options: ['재직','휴직','퇴직'] },
        ],
        checkGroups: [
          { key: 'worktype', label: '근무 유형', items: ['정규직','계약직','파견','인턴'] },
          { key: 'office',   label: '근무지',    items: ['성수동','하남','인현동','충무로'] },
        ],
      },
      filter(rows, p) {
        rows = textFilter(rows, p, ['name','empno','dept','email']);
        rows = advFilter(rows, p);
        rows = dateFilter(rows, p, 'joined');
        rows = chkFilter(rows, p, {
          worktype: r => r.worktype,
          office:   r => r.office,
        });
        return rows;
      },
    },

    /* ---------- HR: 발령 ---------- */
    'hr-appoint': {
      columns: [
        { key: 'no',         label: 'No',       align: 'center',  width: '60px' },
        { key: 'effectDate', label: '발령일',   align: 'center', width: '110px', format: fmtYMD },
        { key: 'empno',      label: '사번',     align: 'left',   width: '90px',  format: fmtCode },
        { key: 'name',       label: '이름',     align: 'left',   width: '100px' },
        { key: 'fromDept',   label: '이전 부서', align: 'left' },
        { key: 'toDept',     label: '발령 부서', align: 'left' },
        { key: 'kind',       label: '발령 유형', align: 'center' },
        { key: 'status',     label: '상태',     align: 'center', width: '80px' },
      ],
      mock(n = 80) {
        const dept = ['경영지원','인사팀','재무팀','영업1팀','영업2팀','개발팀','품질팀','생산팀'];
        const kind = ['신규채용','부서이동','승진','전보','직책부여'];
        const channels = ['홈페이지','제휴사','방문접수','관리자'];
        const st   = [['완료','success'],['예정','info'],['반려','danger']];
        const rows = [];
        for (let i = 1; i <= n; i++) {
          const s = st[i % 8 === 0 ? 2 : i % 3 === 0 ? 1 : 0];
          rows.push({
            no: i, effectDate: dateStr(2026, i, i),
            empno: 'E' + (10000 + i), name: '홍길동' + i,
            fromDept: pick(dept, i), toDept: pick(dept, i + 3),
            kind: pick(kind, i), statusText: s[0],
            channel: pick(channels, i),
            status: Pill(s[0], s[1]),
          });
        }
        return rows;
      },
      search: {
        conditions: [
          { value: 'all',   label: '전체' },
          { value: 'name',  label: '이름' },
          { value: 'empno', label: '사번' },
        ],
        cols: 2,  // 2컬럼 레이아웃 (스크린샷 패턴)
        advanced: [
          { name: 'kind',       label: '발령 유형', required: true,
            options: ['신규채용','부서이동','승진','전보','직책부여'] },
          { name: 'statusText', label: '상태',
            options: ['완료','예정','반려'] },
        ],
        inputs: [
          { name: 'empnoFrom', label: '사번 시작', type: 'text', placeholder: '예: E10000' },
          { name: 'empnoTo',   label: '사번 끝',   type: 'text', placeholder: '예: E10050' },
        ],
        radioGroups: [
          { key: 'channel', label: '접수경로', defaultValue: '전체',
            items: ['전체','홈페이지','제휴사','방문접수','관리자'] },
        ],
      },
      filter(rows, p) {
        rows = textFilter(rows, p, ['name','empno']);
        rows = advFilter(rows, p);
        rows = dateFilter(rows, p, 'effectDate');
        if (p.radios?.channel && p.radios.channel !== '전체') {
          rows = rows.filter(r => r.channel === p.radios.channel);
        }
        if (p.inputs?.empnoFrom) rows = rows.filter(r => r.empno >= p.inputs.empnoFrom);
        if (p.inputs?.empnoTo)   rows = rows.filter(r => r.empno <= p.inputs.empnoTo);
        return rows;
      },
    },

    /* ---------- 근태: 근태 현황 ---------- */
    'att-status': {
      columns: [
        { key: 'date',     label: '일자',     align: 'center', width: '110px', format: fmtYMD },
        { key: 'empno',    label: '사번',     align: 'left',   width: '90px',  format: fmtCode },
        { key: 'name',     label: '이름',     align: 'left',   width: '100px' },
        { key: 'dept',     label: '부서',     align: 'left' },
        { key: 'checkIn',  label: '출근',     align: 'center', width: '80px' },
        { key: 'checkOut', label: '퇴근',     align: 'center', width: '80px' },
        { key: 'workHrs',  label: '근무시간', align: 'right',  width: '90px' },
        { key: 'status',   label: '상태',     align: 'center', width: '80px' },
      ],
      mock(n = 200) {
        const dept = ['개발팀','품질팀','생산팀','영업1팀','경영지원'];
        const st = [['정상','success'],['지각','warning'],['결근','danger'],['휴가','info']];
        const rows = [];
        for (let i = 1; i <= n; i++) {
          const s = st[i % 23 === 0 ? 2 : i % 9 === 0 ? 1 : i % 17 === 0 ? 3 : 0];
          const ci = s[0] === '결근' || s[0] === '휴가' ? '-' : `${pad2(8 + (i % 2))}:${pad2((i*7) % 60)}`;
          const co = s[0] === '결근' || s[0] === '휴가' ? '-' : `${pad2(17 + (i % 3))}:${pad2((i*11) % 60)}`;
          rows.push({
            date: dateStr(2026, 4, i), empno: 'E' + (10000 + (i % 50)),
            name: '홍길동' + (i % 50 + 1), dept: pick(dept, i),
            checkIn: ci, checkOut: co,
            workHrs: s[0] === '결근' || s[0] === '휴가' ? '0:00' : `${8 + (i % 3)}:${pad2((i*13) % 60)}`,
            statusText: s[0], status: Pill(s[0], s[1]),
          });
        }
        return rows;
      },
      search: {
        conditions: [
          { value: 'all',   label: '전체' },
          { value: 'name',  label: '이름' },
          { value: 'empno', label: '사번' },
        ],
        advanced: [
          { name: 'dept', label: '부서', options: ['개발팀','품질팀','생산팀','영업1팀','경영지원'] },
          { name: 'statusText', label: '상태', options: ['정상','지각','결근','휴가'] },
        ],
      },
      filter(rows, p) {
        rows = textFilter(rows, p, ['name','empno','dept']);
        rows = advFilter(rows, p);
        rows = dateFilter(rows, p, 'date');
        return rows;
      },
    },

    /* ---------- 회계: 비용관리 > 임차자산 (사무실 임차 관리) ----------
     * App.LeasedAssets 단일 데이터원. 등록/수정은 승인 요청(조정 사유) → 변동이력 자동 기록.
     * 청구서류 ↓ 다운로드 · 변동이력확인 버튼 · 행 클릭 시 수정. */
    'acc-cost-rent': (function buildLeaseAssetSchema() {
      const won = (v) => (Number(v) || 0).toLocaleString();
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '엑셀', icon: 'download' },
          { label: '임차자산 등록', icon: 'plus', kind: 'primary', key: 'lease-register' },
        ],
        columns: [
          { key: 'no',          label: 'No',        align: 'center', width: '56px',
            format: (v, row) => `${v ?? ''}<a data-lease-detail="${row.id}" hidden></a>` },
          { key: 'mgmtNo',      label: '관리번호',   align: 'center', width: '110px',
            format: (v) => `<span style="color:var(--color-brand-primary); font-weight:var(--fw-semibold);">${v || ''}</span>` },
          { key: 'name',        label: '자산명',     align: 'left',   width: '170px', flex: true },
          { key: 'addr',        label: '주소',       align: 'left',   width: '230px' },
          { key: 'floor',       label: '층',         align: 'center', width: '64px' },
          { key: 'area',        label: '면적(㎡)',   align: 'right',  width: '90px',
            format: (v) => v ? Number(v).toLocaleString() : '-' },
          { key: 'pyeong',      label: '평',         align: 'right',  width: '70px',
            format: (v) => v ? v : '-' },
          { key: 'acquireDate', label: '취득일자',   align: 'center', width: '104px', format: fmtYMD },
          { key: 'billFile',    label: '청구서류',   align: 'center', width: '80px',
            format: (v) => v ? `<a href="javascript:;" data-lease-dl="${v}" title="다운로드" style="color:var(--color-brand-primary);">↓</a>` : '<span style="color:var(--color-text-muted);">-</span>' },
          { key: 'useDept',     label: '사용부서',   align: 'center', width: '110px' },
          { key: 'manager',     label: '담당자',     align: 'center', width: '84px' },
          { key: 'deposit',     label: '보증금(원)', align: 'right',  width: '130px', format: won },
          { key: 'monthlyRent', label: '월임차료(원)', align: 'right', width: '120px', format: won },
          { key: 'maintFee',    label: '관리비(원)', align: 'right',  width: '110px', format: won },
          { key: 'total',       label: '합계(원)',   align: 'right',  width: '120px',
            format: (v) => `<strong style="color:var(--color-brand-primary);">${won(v)}</strong>` },
          { key: 'lessor',      label: '임대인',     align: 'left',   width: '130px' },
          { key: 'contractDate',label: '계약일',     align: 'center', width: '104px', format: fmtYMD },
          { key: 'contractEnd', label: '계약만기일', align: 'center', width: '104px', format: fmtYMD },
          { key: '_hist',       label: '변동이력',   align: 'center', width: '92px',
            format: (_, row) => `<button type="button" class="btn btn--xs btn--soft-primary" data-lease-hist="${row.id}">변동이력</button>` },
          { key: 'memo',        label: '비고',       align: 'left',   width: '140px',
            format: (v) => v ? v : '<span style="color:var(--color-text-muted);">-</span>' },
        ],
        mock() { const L = window.App && window.App.LeasedAssets; return L ? L.list() : []; },
        search: {
          cols: 3,
          conditions: [
            { value: 'all',     label: '전체' },
            { value: 'mgmtNo',  label: '관리번호' },
            { value: 'name',    label: '자산명' },
            { value: 'addr',    label: '주소' },
            { value: 'lessor',  label: '임대인' },
            { value: 'useDept', label: '사용부서' },
          ],
          advanced: [
            { name: 'useDept', label: '사용부서', options: ['경영지원본부', '영업본부', '생산본부', '디자인본부'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['mgmtNo', 'name', 'addr', 'lessor', 'useDept', 'manager']);
          rows = advFilter(rows, p);
          rows = dateFilter(rows, p, 'contractEnd');
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            if (e.target.closest('[data-action-key="lease-register"]')) {
              if (window.App.openLeaseFormModal) window.App.openLeaseFormModal(null, { onChange: () => refresh() });
              return;
            }
            const dl = e.target.closest('[data-lease-dl]');
            if (dl) { e.preventDefault(); e.stopPropagation(); if (window.App.downloadFile) window.App.downloadFile(dl.dataset.leaseDl, { context: '임차자산 청구서류' }); return; }
            const hist = e.target.closest('[data-lease-hist]');
            if (hist) { e.preventDefault(); e.stopPropagation(); if (window.App.openLeaseHistoryModal) window.App.openLeaseHistoryModal(hist.dataset.leaseHist); return; }
            const dt = e.target.closest('[data-lease-detail]');
            if (dt) { if (window.App.openLeaseFormModal) window.App.openLeaseFormModal(dt.dataset.leaseDetail, { onChange: () => refresh() }); }
          });
        },
      };
    })(),

    /* ---------- 회계: 금융관리 > 대출 계좌 현황 관리 ----------
     * 금융관계사(ebranch) API 연동으로 대출 계좌의 약정·잔액·만기·이자 현황을 관리. 와이드 그리드(가로 스크롤).
     * 우측 상단 "새로고침"으로 잔액·잔여기일 재조회. (데모 mock — 실 운영 시 ebranch API 응답으로 교체) */
    'acc-fin-loan': (function buildLoanMgmtSchema() {
      const ACCOUNTS = [
        { site: '(주)성원애드피아(본점)',   bank: '국민은행', no: '068816-04-452592',   name: '기업일반운전자금대출', subject: '대출',     repay: '분할상환',   amount: 500000000, balance: 320000000, cur: 'KRW', rate: 4.85, due: '2027-03-27', open: '2026-03-27', closed: '', payDay: '2026-06-27', interest: 1293000, limitLeft: 0 },
        { site: '(주)성원애드피아(본점)',   bank: '기업은행', no: '034-053757-39-3031',  name: '이행보증',             subject: '입출식예금', repay: '분할상환',   amount: 100000000, balance: 100000000, cur: 'KRW', rate: 3.20, due: '2026-03-13', open: '2025-03-13', closed: '', payDay: '2026-06-13', interest: 266000,  limitLeft: 0 },
        { site: '(주)성원애드피아(본점)',   bank: '하나은행', no: '109-980238-35542(1)', name: '기업시설일반자금대출', subject: '대출',     repay: '만기일시상환', amount: 800000000, balance: 800000000, cur: 'KRW', rate: 5.10, due: '2027-03-31', open: '2024-03-31', closed: '', payDay: '2026-06-30', interest: 3400000, limitLeft: 0 },
        { site: '(주)성원애드피아몰(본점)', bank: '신한은행', no: '311-245-544230',      name: '<기준>일반자금대출',   subject: '대출',     repay: '분할상환',   amount: 300000000, balance: 0,         cur: 'KRW', rate: 4.40, due: '2026-05-14', open: '2025-05-14', closed: '2026-04-14', payDay: '', interest: 0, limitLeft: 0 },
        { site: '(주)성원애드피아몰(본점)', bank: '우리은행', no: '1248-500-012181',     name: '특별/시설8년/운전',    subject: '대출',     repay: '분할상환',   amount: 1000000000, balance: 0,        cur: 'KRW', rate: 3.95, due: '2027-03-15', open: '2019-03-29', closed: '2023-09-15', payDay: '', interest: 0, limitLeft: 3000000000 },
        { site: '(주)성원애드피아(본점)',   bank: '기업은행', no: '034-053757-41-5520',  name: '한도대출(마이너스)',   subject: '대출',     repay: '만기일시상환', amount: 500000000, balance: 180000000, cur: 'KRW', rate: 5.65, due: '2026-09-30', open: '2025-09-30', closed: '', payDay: '2026-06-30', interest: 847000, limitLeft: 320000000 },
      ];
      const won = (v) => (Number(v) || 0).toLocaleString();
      const moneyCell = (v) => v ? won(v) : '<span style="color:var(--color-text-muted);">-</span>';
      const SUBJ_PILL = { '대출': 'soft-danger', '입출식예금': 'info' };
      const _now = Date.now();
      const daysLeft = (due, closed) => closed ? null : Math.max(0, Math.round((new Date(due + 'T00:00:00').getTime() - _now) / 86400000));
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '새로고침', icon: 'refresh', key: 'loan-refresh' },
        ],
        columns: [
          { key: 'no',         label: 'No',        align: 'center', width: '56px' },
          { key: 'site',       label: '사업장',     align: 'left',   width: '180px' },
          { key: 'bank',       label: '은행',       align: 'left',   width: '90px' },
          { key: 'accountNo',  label: '계좌번호',   align: 'left',   width: '160px', format: fmtCode },
          { key: 'name',       label: '대출명',     align: 'left',   width: '190px', flex: true },
          { key: 'subject',    label: '계좌과목',   align: 'center', width: '96px',
            format: (v) => `<span class="pill pill--${SUBJ_PILL[v] || 'muted'}">${v || ''}</span>` },
          { key: 'repay',      label: '상환방법',   align: 'center', width: '104px' },
          { key: 'amount',     label: '약정금액(원)', align: 'right', width: '140px', format: won },
          { key: 'balance',    label: '대출잔액(원)', align: 'right', width: '140px',
            format: (v) => `<strong style="color:var(--color-brand-primary);">${won(v)}</strong>` },
          { key: 'cur',        label: '통화',       align: 'center', width: '64px' },
          { key: 'fxRate',     label: '적용환율',   align: 'right',  width: '90px',
            format: (v) => (Number(v) || 0).toFixed(2) },
          { key: 'krwBal',     label: '대출원화액(원)', align: 'right', width: '140px', format: won },
          { key: 'due',        label: '만기일',     align: 'center', width: '104px', format: fmtYMD },
          { key: 'open',       label: '대출일',     align: 'center', width: '104px', format: fmtYMD },
          { key: 'closed',     label: '완제(해지)일', align: 'center', width: '110px',
            format: (v) => v ? fmtYMD(v) : '<span style="color:var(--color-text-muted);">-</span>' },
          { key: 'remainDays', label: '잔여기일',   align: 'right',  width: '90px',
            format: (v) => v == null ? '<span style="color:var(--color-text-muted);">-</span>' : `${(Number(v) || 0).toLocaleString()}일` },
          { key: 'rate',       label: '이율',       align: 'right',  width: '76px',
            format: (v) => `${(Number(v) || 0).toFixed(2)}%` },
          { key: 'payDay',     label: '원리납입일', align: 'center', width: '104px',
            format: (v) => v ? fmtYMD(v) : '<span style="color:var(--color-text-muted);">-</span>' },
          { key: 'interest',   label: '이자금액(원)', align: 'right', width: '120px', format: moneyCell },
          { key: 'limitLeft',  label: '한도여유액(원)', align: 'right', width: '140px', format: moneyCell },
        ],
        mock() {
          const N = ACCOUNTS.length;
          return ACCOUNTS.map((a, i) => ({
            no: N - i,                       // 도메인 표준: No 내림차순(N→1)
            site: a.site, bank: a.bank, accountNo: a.no, name: a.name, subject: a.subject, repay: a.repay,
            amount: a.amount, balance: a.balance, cur: a.cur,
            fxRate: a.cur === 'KRW' ? 0 : a.fxRate,            // 원화는 적용환율 0.00
            krwBal: a.balance,                                  // 원화 대출 → 대출잔액과 동일
            due: a.due, open: a.open, closed: a.closed,
            remainDays: daysLeft(a.due, a.closed),
            rate: a.rate, payDay: a.payDay, interest: a.interest, limitLeft: a.limitLeft,
          }));
        },
        search: {
          cols: 3,
          conditions: [
            { value: 'all',       label: '전체' },
            { value: 'site',      label: '사업장' },
            { value: 'bank',      label: '은행' },
            { value: 'name',      label: '대출명' },
            { value: 'accountNo', label: '계좌번호' },
          ],
          advanced: [
            { name: 'subject', label: '계좌과목', options: ['대출', '입출식예금'] },
            { name: 'repay',   label: '상환방법', options: ['분할상환', '만기일시상환'] },
            { name: 'bank',    label: '은행',     options: ['국민은행', '기업은행', '하나은행', '신한은행', '우리은행'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['site', 'bank', 'name', 'accountNo']);
          rows = advFilter(rows, p);
          rows = dateFilter(rows, p, 'due');
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            if (e.target.closest('[data-action-key="loan-refresh"]')) {
              refresh();
              if (window.App && App.flashToast) App.flashToast('ebranch 대출 계좌 현황을 새로고침했습니다.', 'success');
            }
          });
        },
      };
    })(),

    /* ---------- 회계: 금융관리 > 일반계좌 시재보고서 ----------
     * 금융관계사 API 연동으로 사업장/계좌별 잔액(전일·입금·출금·잔액·인출가능)을 조회.
     * 우측 상단 "새로고침"으로 최신 잔액 재조회. (데모 mock — 실 운영 시 API 응답으로 교체) */
    'acc-fin-acc-report': (function buildAcctReportSchema() {
      const ACCOUNTS = [
        { site: '(주)성원애드피아 뚝섬로지점', kind: '입출식예금', bank: '기업은행', no: '034-104772-04-017', alias: '뚝섬로지점' },
        { site: '(주)성원애드피아 성남지점',   kind: '입출식예금', bank: '기업은행', no: '034-107662-04-018', alias: '성남지점' },
        { site: '(주)성원애드피아 하남지점',   kind: '입출식예금', bank: '기업은행', no: '034-105171-04-011', alias: '하남' },
        { site: '(주)성원애드피아(본점)',     kind: '정기예금',   bank: '국민은행', no: '068815295174001',   alias: '국민수퍼고정금리예금' },
        { site: '(주)성원애드피아(본점)',     kind: '입출식예금', bank: '국민은행', no: '99876543213',       alias: '방문현금매출(출무)' },
        { site: '(주)성원애드피아(본점)',     kind: '입출식예금', bank: '국민은행', no: '99876543214',       alias: '택배자재방문판매' },
        { site: '(주)성원애드피아(본점)',     kind: '입출식예금', bank: '국민은행', no: '99876543215',       alias: '자동이체출금' },
        { site: '(주)성원애드피아(본점)',     kind: '입출식예금', bank: '국민은행', no: '99876543218',       alias: '모계좌-국민' },
        { site: '(주)성원애드피아(본점)',     kind: '입출식예금', bank: '기업은행', no: '034-053757-01-037',  alias: '온라인카드매출' },
        { site: '(주)성원애드피아(본점)',     kind: '입출식예금', bank: '기업은행', no: '034-053757-04-041',  alias: '모계좌-기업' },
        { site: '(주)성원애드피아(본점)',     kind: '입출식예금', bank: '기업은행', no: '034-053757-04-058',  alias: '방문즈매출' },
        { site: '(주)성원애드피아(본점)',     kind: '입출식예금', bank: '기업은행', no: '034-053757-04-065',  alias: '방문현금매출(인천)' },
        { site: '(주)성원애드피아(본점)',     kind: '입출식예금', bank: '기업은행', no: '034-053757-04-072',  alias: '성원 집금(MMDA)' },
        { site: '(주)성원애드피아(본점)',     kind: '입출식예금', bank: '기업은행', no: '034-053757-04-080',  alias: '견적금' },
        { site: '(주)성원애드피아(본점)',     kind: '입출식예금', bank: '기업은행', no: '034-053757-04-097',  alias: '지출(성원)' },
        { site: '(주)성원애드피아(본점)',     kind: '입출식예금', bank: '기업은행', no: '034-053757-04-108',  alias: '고객환불' },
        { site: '(주)성원애드피아(본점)',     kind: '입출식예금', bank: '기업은행', no: '034-053757-04-115',  alias: '폐판 스크랩계좌' },
        { site: '(주)성원애드피아(본점)',     kind: '입출식예금', bank: '농협',     no: '301-0101-6644-91',   alias: '모계좌-농협' },
        { site: '(주)성원애드피아(본점)',     kind: '입출식예금', bank: '수협은행', no: '1010-2219-5961',     alias: '보통예금' },
        { site: '(주)성원애드피아(본점)',     kind: '입출식예금', bank: '신한은행', no: '140-009-517480',     alias: '모계좌-신한' },
        { site: '(주)성원애드피아(본점)',     kind: '입출식예금', bank: '우리은행', no: '1005-701-176761',    alias: '가결제업체입금' },
        { site: '(주)성원애드피아(본점)',     kind: '입출식예금', bank: '우리은행', no: '1005-901-824855',    alias: '모계좌-우리' },
        { site: '(주)성원애드피아(본점)',     kind: '입출식예금', bank: '하나은행', no: '287-890107-24104',   alias: '기업자유예금' },
        { site: '(주)성원애드피아(인현동)',   kind: '입출식예금', bank: '기업은행', no: '034-104117-04-010',  alias: '인현동' },
      ];
      const won = (v) => (Number(v) || 0).toLocaleString();
      const KIND_PILL = { '입출식예금': 'info', '정기예금': 'success' };
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '새로고침', icon: 'refresh', key: 'acct-refresh' },
        ],
        columns: [
          { key: 'no',        label: 'No',        align: 'center', width: '56px' },
          { key: 'site',      label: '사업장',     align: 'left',   width: '200px' },
          { key: 'kind',      label: '계좌구분',   align: 'center', width: '104px',
            format: (v) => `<span class="pill pill--${KIND_PILL[v] || 'muted'}">${v || ''}</span>` },
          { key: 'bank',      label: '은행',       align: 'left',   width: '96px' },
          { key: 'accountNo', label: '계좌번호',   align: 'left',   width: '150px', format: fmtCode },
          { key: 'alias',     label: '계좌별칭',   align: 'left',   width: '160px', flex: true },
          { key: 'prevBal',   label: '전일잔액(원)', align: 'right', width: '128px', format: won },
          { key: 'depo',      label: '입금액(원)',   align: 'right', width: '118px', format: won },
          { key: 'withdraw',  label: '출금액(원)',   align: 'right', width: '118px', format: won },
          { key: 'balance',   label: '잔액(원)',     align: 'right', width: '130px',
            format: (v) => `<strong style="color:var(--color-brand-primary);">${won(v)}</strong>` },
          { key: 'available', label: '현재인출가능잔액(원)', align: 'right', width: '150px', format: won },
        ],
        mock() {
          const N = ACCOUNTS.length;
          return ACCOUNTS.map((a, i) => {
            const isTerm = a.kind === '정기예금';
            const prev = ((i * 37) % 90 + 5) * 1000000 + (i * 131717) % 1000000;
            const depo     = isTerm ? 0 : ((i * 17) % 40) * 100000 + (i * 9311) % 100000;
            const withdraw = isTerm ? 0 : ((i * 13) % 35) * 100000 + (i * 7717) % 100000;
            const balance  = prev + depo - withdraw;
            return {
              no: N - i,                       // 도메인 표준: No 내림차순(N→1)
              site: a.site, kind: a.kind, bank: a.bank, accountNo: a.no, alias: a.alias,
              prevBal: prev, depo, withdraw, balance,
              available: isTerm ? 0 : balance, // 정기예금은 인출불가
            };
          });
        },
        search: {
          cols: 3,
          conditions: [
            { value: 'all',       label: '전체' },
            { value: 'site',      label: '사업장' },
            { value: 'bank',      label: '은행' },
            { value: 'alias',     label: '계좌별칭' },
            { value: 'accountNo', label: '계좌번호' },
          ],
          advanced: [
            { name: 'kind', label: '계좌구분', options: ['입출식예금', '정기예금'] },
            { name: 'bank', label: '은행',     options: ['기업은행', '국민은행', '농협', '수협은행', '신한은행', '우리은행', '하나은행'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['site', 'bank', 'alias', 'accountNo']);
          rows = advFilter(rows, p);
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            if (e.target.closest('[data-action-key="acct-refresh"]')) {
              refresh();
              if (window.App && App.flashToast) App.flashToast('금융관계사 계좌 잔액을 새로고침했습니다.', 'success');
            }
          });
        },
      };
    })(),

    /* ---------- 회계: 금융관리 > 일반계좌 잔액 조회 ----------
     * 금융관계사(ebranch) API 연동으로 계좌별 현재/인출가능 잔액과 잔액·거래내역 조회 상태를 점검. 와이드 그리드(가로 스크롤).
     * 우측 상단 "새로고침"으로 잔액·상태 재조회. (데모 mock — 실 운영 시 ebranch API 응답으로 교체) */
    'acc-fin-acc-balance': (function buildAcctBalanceSchema() {
      const ACCOUNTS = [
        { site: '(주)성원애드피아 뚝섬로지점', bank: '기업은행', no: '034-104772-04-017', alias: '뚝섬로지점',          subject: '입출식예금', regAt: '2023-12-11 17:29:23', branch: '을지로 (지)', balStat: '해지',   txStat: '해지' },
        { site: '(주)성원애드피아 성남지점',   bank: '기업은행', no: '034-107662-04-018', alias: '성남지점',            subject: '입출식예금', regAt: '2024-01-29 19:45:01', branch: '',          balStat: '정상',   txStat: '정상' },
        { site: '(주)성원애드피아 하남지점',   bank: '기업은행', no: '034-105171-04-011', alias: '하남',                subject: '입출식예금', regAt: '2024-04-01 08:44:14', branch: '을지로 (지)', balStat: '정상',   txStat: '정상' },
        { site: '(주)성원애드피아(본점)',     bank: '국민은행', no: '068815295174001',   alias: '국민수퍼고정금리예금', subject: '정기예금',   regAt: '2026-01-28 09:31:28', branch: '',          balStat: '미처리', txStat: '미처리' },
        { site: '(주)성원애드피아(본점)',     bank: '국민은행', no: '99876543213',       alias: '방문현금매출',         subject: '입출식예금', regAt: '2019-09-06 10:09:33', branch: '',          balStat: '정상',   txStat: '정상' },
        { site: '(주)성원애드피아(본점)',     bank: '국민은행', no: '99876543214',       alias: '택배자재방문판매',     subject: '입출식예금', regAt: '2019-09-06 10:09:33', branch: '',          balStat: '정상',   txStat: '정상' },
        { site: '(주)성원애드피아(본점)',     bank: '국민은행', no: '99876543215',       alias: '자동이체출금',         subject: '입출식예금', regAt: '2019-09-06 10:09:33', branch: '',          balStat: '정상',   txStat: '정상' },
        { site: '(주)성원애드피아(본점)',     bank: '국민은행', no: '99876543218',       alias: '모계좌-국민',          subject: '입출식예금', regAt: '2019-09-06 10:08:21', branch: '',          balStat: '정상',   txStat: '정상' },
        { site: '(주)성원애드피아(본점)',     bank: '기업은행', no: '034-053757-01-037',  alias: '온라인카드매출',       subject: '입출식예금', regAt: '2019-09-06 10:08:21', branch: '가상계좌',  balStat: '정상',   txStat: '정상' },
        { site: '(주)성원애드피아(본점)',     bank: '기업은행', no: '034-053757-04-041',  alias: '모계좌-기업',          subject: '입출식예금', regAt: '2019-09-06 10:08:21', branch: '',          balStat: '정상',   txStat: '정상' },
        { site: '(주)성원애드피아(본점)',     bank: '기업은행', no: '034-053757-04-058',  alias: '방문카드매출',         subject: '입출식예금', regAt: '2019-09-06 10:08:22', branch: '',          balStat: '정상',   txStat: '정상' },
        { site: '(주)성원애드피아(본점)',     bank: '기업은행', no: '034-053757-04-065',  alias: '방문현금매출(인천)',   subject: '입출식예금', regAt: '2019-09-06 10:08:22', branch: '',          balStat: '정상',   txStat: '정상' },
        { site: '(주)성원애드피아(본점)',     bank: '기업은행', no: '034-053757-04-072',  alias: '성원 집금(MMDA)',      subject: '입출식예금', regAt: '2019-09-20 17:23:18', branch: '',          balStat: '정상',   txStat: '정상' },
        { site: '(주)성원애드피아(본점)',     bank: '기업은행', no: '034-053757-04-097',  alias: '지출(성원)',           subject: '입출식예금', regAt: '2019-09-20 17:23:18', branch: '',          balStat: '정상',   txStat: '정상' },
        { site: '(주)성원애드피아(본점)',     bank: '기업은행', no: '034-053757-04-115',  alias: '폐판 스크랩계좌',      subject: '입출식예금', regAt: '2024-07-15 14:14:45', branch: '',          balStat: '정상',   txStat: '정상' },
        { site: '(주)성원애드피아(본점)',     bank: '농협',     no: '301-0101-6644-91',   alias: '모계좌-농협',          subject: '입출식예금', regAt: '2019-09-06 10:10:00', branch: '',          balStat: '정상',   txStat: '정상' },
        { site: '(주)성원애드피아(본점)',     bank: '수협은행', no: '1010-2219-5961',     alias: '보통예금',             subject: '입출식예금', regAt: '2022-06-16 14:47:33', branch: '',          balStat: '정상',   txStat: '정상' },
        { site: '(주)성원애드피아(본점)',     bank: '신한은행', no: '140-009-517480',     alias: '모계좌-신한',          subject: '입출식예금', regAt: '2019-09-06 10:13:28', branch: '',          balStat: '정상',   txStat: '정상' },
        { site: '(주)성원애드피아(본점)',     bank: '우리은행', no: '1005-701-176761',    alias: '가결제업체입금',       subject: '입출식예금', regAt: '2019-09-06 10:11:12', branch: '',          balStat: '정상',   txStat: '정상' },
        { site: '(주)성원애드피아(본점)',     bank: '우리은행', no: '1005-901-824855',    alias: '모계좌-우리',          subject: '입출식예금', regAt: '2019-09-06 10:11:13', branch: '',          balStat: '정상',   txStat: '정상' },
        { site: '(주)성원애드피아(본점)',     bank: '하나은행', no: '287-890107-24104',   alias: '기업자유예금',         subject: '입출식예금', regAt: '2019-09-23 16:26:22', branch: '',          balStat: '정상',   txStat: '정상' },
        { site: '(주)성원애드피아(인현동)',   bank: '기업은행', no: '034-104117-04-010',  alias: '인현동',               subject: '입출식예금', regAt: '2023-05-10 19:27:36', branch: '을지로 (지)', balStat: '정상',   txStat: '정상' },
      ];
      const won = (v) => (Number(v) || 0).toLocaleString();
      const SUBJ_PILL = { '입출식예금': 'info', '정기예금': 'success' };
      const STAT_PILL = { '정상': 'success', '해지': 'danger', '미처리': 'warning' };
      const blank = (v) => v ? v : '<span style="color:var(--color-text-muted);">-</span>';
      const statCell = (v) => `<span class="pill pill--${STAT_PILL[v] || 'muted'}">${v}</span>`;
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '새로고침', icon: 'refresh', key: 'balance-refresh' },
        ],
        columns: [
          { key: 'no',        label: 'No',        align: 'center', width: '56px' },
          { key: 'site',      label: '사업장',     align: 'left',   width: '180px' },
          { key: 'bank',      label: '은행',       align: 'left',   width: '90px' },
          { key: 'accountNo', label: '계좌번호',   align: 'left',   width: '150px', format: fmtCode },
          { key: 'alias',     label: '계좌별칭',   align: 'left',   width: '150px', flex: true },
          { key: 'subject',   label: '계좌과목',   align: 'center', width: '100px',
            format: (v) => `<span class="pill pill--${SUBJ_PILL[v] || 'muted'}">${v || ''}</span>` },
          { key: 'balance',   label: '현재잔액(원)', align: 'right', width: '130px',
            format: (v) => `<strong style="color:var(--color-brand-primary);">${won(v)}</strong>` },
          { key: 'available', label: '인출가능잔액(원)', align: 'right', width: '140px', format: won },
          { key: 'balQueryAt', label: '최종잔액조회일시', align: 'center', width: '150px', format: fmtYMDHM },
          { key: 'balStat',   label: '잔액조회상태', align: 'center', width: '96px', format: statCell },
          { key: 'txQueryAt', label: '최종거래내역조회일시', align: 'center', width: '160px', format: fmtYMDHM },
          { key: 'txStat',    label: '거래내역조회상태', align: 'center', width: '110px', format: statCell },
          { key: 'regAt',     label: '계좌등록일시', align: 'center', width: '150px', format: fmtYMDHM },
          { key: 'branch',    label: '영업점',     align: 'left',   width: '100px', format: blank },
          { key: 'income',    label: '수입',       align: 'center', width: '70px',  format: blank },
          { key: 'lastTxAt',  label: '최종거래일시', align: 'center', width: '150px', format: fmtYMDHM },
        ],
        mock() {
          const N = ACCOUNTS.length;
          return ACCOUNTS.map((a, i) => {
            const closed = a.balStat === '해지';
            const pending = a.balStat === '미처리';
            const balance = (closed || pending) ? 0 : ((i * 37) % 90 + 3) * 1000000 + (i * 131717) % 1000000;
            return {
              no: N - i,                       // 도메인 표준: No 내림차순(N→1)
              site: a.site, bank: a.bank, accountNo: a.no, alias: a.alias, subject: a.subject,
              balance, available: balance,
              balQueryAt: pending ? '' : '2026-06-10 08:16:30',
              balStat: a.balStat,
              txQueryAt: '2026-06-10 08:17:05',
              txStat: a.txStat,
              regAt: a.regAt, branch: a.branch, income: '',
              lastTxAt: closed ? '' : '2026-06-09 ' + pad2(9 + (i % 9)) + ':' + pad2((i * 7) % 60),
            };
          });
        },
        search: {
          cols: 3,
          conditions: [
            { value: 'all',       label: '전체' },
            { value: 'site',      label: '사업장' },
            { value: 'bank',      label: '은행' },
            { value: 'alias',     label: '계좌별칭' },
            { value: 'accountNo', label: '계좌번호' },
          ],
          advanced: [
            { name: 'balStat', label: '잔액조회상태', options: ['정상', '해지', '미처리'] },
            { name: 'subject', label: '계좌과목',     options: ['입출식예금', '정기예금'] },
            { name: 'bank',    label: '은행',         options: ['기업은행', '국민은행', '농협', '수협은행', '신한은행', '우리은행', '하나은행'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['site', 'bank', 'alias', 'accountNo']);
          rows = advFilter(rows, p);
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            if (e.target.closest('[data-action-key="balance-refresh"]')) {
              refresh();
              if (window.App && App.flashToast) App.flashToast('ebranch 계좌 잔액·조회상태를 새로고침했습니다.', 'success');
            }
          });
        },
      };
    })(),

    /* ---------- 회계: 금융관리 > 외화계좌 시재보고서 ----------
     * 금융관계사 API 연동으로 외화계좌별 통화/잔액(전일·입금·출금·잔액)을 조회하고,
     * 적용환율 기준 원화 환산액(환율적용잔액)을 함께 표기. 우측 상단 "새로고침"으로 재조회.
     * (데모 mock — 실 운영 시 API 응답으로 교체) */
    'acc-fin-fx-report': (function buildFxReportSchema() {
      const ACCOUNTS = [
        { site: '(주)성원애드피아(본점)', kind: '입출식예금', bank: '기업은행', no: '034-053757-56-00016(5)',  cur: 'AUD', alias: '거주자외화보통예금' },
        { site: '(주)성원애드피아(본점)', kind: '입출식예금', bank: '기업은행', no: '034-096673-56-00019(21)', cur: 'CNY', alias: '거주자외화보통예금' },
        { site: '(주)성원애드피아(본점)', kind: '입출식예금', bank: '하나은행', no: '287-890072-47038',         cur: 'JPY', alias: '외화보통예금(JPY)' },
        { site: '(주)성원애드피아(본점)', kind: '입출식예금', bank: '국민은행', no: '068868-11-019288',         cur: 'USD', alias: '거주자외화보통예금' },
        { site: '(주)성원애드피아(본점)', kind: '정기예금',   bank: '국민은행', no: '068868-11-019291',         cur: 'USD', alias: '거주자외화정기예금' },
        { site: '(주)성원애드피아(본점)', kind: '입출식예금', bank: '기업은행', no: '034-053757-56-00016(1)',  cur: 'USD', alias: '거주자외화보통예금' },
        { site: '(주)성원애드피아(본점)', kind: '입출식예금', bank: '기업은행', no: '034-096673-56-00019(1)',  cur: 'USD', alias: '거주자외화보통예금' },
      ];
      // 적용환율 (KRW / 1 통화단위) — 데모. 실 운영 시 API 고시환율로 교체
      const RATE = { USD: 1352.4, JPY: 9.12, AUD: 883.5, CNY: 189.3 };
      const SCALE = { JPY: 1000000, CNY: 50000, AUD: 30000, USD: 40000 };   // 통화별 잔액 자릿수 데모
      const fxFmt  = (v) => (Number(v) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
      const wonFmt = (v) => (Number(v) || 0).toLocaleString();
      const KIND_PILL = { '입출식예금': 'info', '정기예금': 'success' };
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '새로고침', icon: 'refresh', key: 'fx-refresh' },
        ],
        columns: [
          { key: 'no',        label: 'No',        align: 'center', width: '56px' },
          { key: 'site',      label: '사업장',     align: 'left',   width: '190px' },
          { key: 'kind',      label: '계좌구분',   align: 'center', width: '104px',
            format: (v) => `<span class="pill pill--${KIND_PILL[v] || 'muted'}">${v || ''}</span>` },
          { key: 'bank',      label: '은행',       align: 'left',   width: '90px' },
          { key: 'accountNo', label: '계좌번호',   align: 'left',   width: '180px', format: fmtCode },
          { key: 'cur',       label: '통화',       align: 'center', width: '70px',
            format: (v) => `<strong style="color:var(--color-brand-primary);">${v || ''}</strong>` },
          { key: 'alias',     label: '계좌별칭',   align: 'left',   width: '170px', flex: true },
          { key: 'prevBal',   label: '전일잔액',   align: 'right',  width: '120px', format: fxFmt },
          { key: 'depo',      label: '입금액',     align: 'right',  width: '110px', format: fxFmt },
          { key: 'withdraw',  label: '출금액',     align: 'right',  width: '110px', format: fxFmt },
          { key: 'balance',   label: '잔액',       align: 'right',  width: '120px',
            format: (v, row) => `<strong>${fxFmt(v)}</strong> <span style="color:var(--color-text-muted); font-size:var(--fs-xs);">${row.cur || ''}</span>` },
          { key: 'krwBal',    label: '환율적용잔액', align: 'right', width: '150px',
            format: (v) => `<strong style="color:var(--color-brand-primary);">${wonFmt(v)}</strong> <span style="color:var(--color-text-muted); font-size:var(--fs-xs);">원</span>` },
        ],
        mock() {
          const N = ACCOUNTS.length;
          return ACCOUNTS.map((a, i) => {
            const isTerm = a.kind === '정기예금';
            const unit = SCALE[a.cur] || 10000;
            const prev = ((i * 31) % 9 + 1) * unit + (i * 7919) % unit;
            const depo     = isTerm ? 0 : ((i * 11) % 5) * (unit / 10) + (i * 3313) % (unit / 10);
            const withdraw = isTerm ? 0 : ((i * 7) % 4) * (unit / 10) + (i * 1717) % (unit / 10);
            const isJPY = a.cur === 'JPY';
            const r2 = (x) => isJPY ? Math.round(x) : Math.round(x * 100) / 100;   // JPY는 정수
            const prevB = r2(prev), depoB = r2(depo), wdB = r2(withdraw);
            const balance = r2(prevB + depoB - wdB);
            const krwBal = Math.round(balance * (RATE[a.cur] || 1));
            return {
              no: N - i,                       // 도메인 표준: No 내림차순(N→1)
              site: a.site, kind: a.kind, bank: a.bank, accountNo: a.no, cur: a.cur, alias: a.alias,
              prevBal: prevB, depo: depoB, withdraw: wdB, balance, krwBal,
            };
          });
        },
        search: {
          cols: 3,
          conditions: [
            { value: 'all',       label: '전체' },
            { value: 'site',      label: '사업장' },
            { value: 'bank',      label: '은행' },
            { value: 'alias',     label: '계좌별칭' },
            { value: 'accountNo', label: '계좌번호' },
          ],
          advanced: [
            { name: 'cur',  label: '통화',     options: ['USD', 'JPY', 'AUD', 'CNY'] },
            { name: 'kind', label: '계좌구분', options: ['입출식예금', '정기예금'] },
            { name: 'bank', label: '은행',     options: ['기업은행', '국민은행', '하나은행'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['site', 'bank', 'alias', 'accountNo', 'cur']);
          rows = advFilter(rows, p);
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            if (e.target.closest('[data-action-key="fx-refresh"]')) {
              refresh();
              if (window.App && App.flashToast) App.flashToast('금융관계사 외화계좌 잔액·환율을 새로고침했습니다.', 'success');
            }
          });
        },
      };
    })(),

    /* ---------- 회계: 금융관리 > 외화계좌 거래내역 ----------
     * 금융관계사(ebranch) API 연동으로 외화계좌 거래(입·출금)와 적용환율 기준 원화 환산액을 조회. 와이드 그리드(가로 스크롤).
     * 우측 상단 "새로고침"으로 재조회. (데모 mock — 실 운영 시 ebranch API 응답으로 교체) */
    'acc-fin-fx-tx': (function buildFxTxSchema() {
      const ACCTS = [
        { site: '(주)성원애드피아(본점)', bank: '기업은행', no: '034-053757-56-00016(5)', cur: 'AUD', alias: '거주자외화보통예금' },
        { site: '(주)성원애드피아(본점)', bank: '기업은행', no: '034-053757-56-00016(1)', cur: 'USD', alias: '거주자외화보통예금' },
        { site: '(주)성원애드피아(본점)', bank: '하나은행', no: '287-890072-47038',        cur: 'JPY', alias: '외화보통예금(JPY)' },
        { site: '(주)성원애드피아(본점)', bank: '기업은행', no: '034-096673-56-00019(21)', cur: 'CNY', alias: '거주자외화보통예금' },
      ];
      const RATE = { USD: 1495.6, JPY: 9.12, AUD: 1038.4, CNY: 189.3 };   // 적용환율 (KRW/통화). 실 운영 시 고시환율
      const PARTY = ['수출대금 입금', '해외송금 수취', '구매대금 송금', '수수료', '환전 입금', '거래처 송금'];
      const BRANCH = ['외환사업부', '을지로(지)', '본점영업부', '강남금융센터'];
      const fxFmt = (v) => (Number(v) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
      const won   = (v) => Math.round(Number(v) || 0).toLocaleString();
      const fxCell  = (v) => v ? fxFmt(v) : '<span style="color:var(--color-text-muted);">-</span>';
      const wonCell = (v) => v ? won(v) : '<span style="color:var(--color-text-muted);">-</span>';
      const blank = (v) => v ? v : '<span style="color:var(--color-text-muted);">-</span>';
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '새로고침', icon: 'refresh', key: 'fxtx-refresh' },
        ],
        columns: [
          { key: 'no',        label: 'No',        align: 'center', width: '56px' },
          { key: 'site',      label: '사업장',     align: 'left',   width: '180px' },
          { key: 'bank',      label: '은행',       align: 'left',   width: '88px' },
          { key: 'accountNo', label: '계좌번호',   align: 'left',   width: '180px', format: fmtCode },
          { key: 'alias',     label: '계좌별칭',   align: 'left',   width: '160px', flex: true },
          { key: 'cur',       label: '통화',       align: 'center', width: '64px',
            format: (v) => `<strong style="color:var(--color-brand-primary);">${v || ''}</strong>` },
          { key: 'txDate',    label: '일자',       align: 'center', width: '104px', format: fmtYMD },
          { key: 'depo',      label: '입금액',     align: 'right',  width: '110px', format: fxCell },
          { key: 'depoKrw',   label: '환율적용입금', align: 'right', width: '130px', format: wonCell },
          { key: 'withdraw',  label: '출금액',     align: 'right',  width: '110px', format: fxCell },
          { key: 'withdrawKrw', label: '환율적용출금', align: 'right', width: '130px', format: wonCell },
          { key: 'balance',   label: '잔액',       align: 'right',  width: '120px',
            format: (v) => `<strong>${fxFmt(v)}</strong>` },
          { key: 'fxRate',    label: '적용환율',   align: 'right',  width: '96px',
            format: (v) => (Number(v) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
          { key: 'balKrw',    label: '환율적용잔액', align: 'right', width: '140px',
            format: (v) => `<strong style="color:var(--color-brand-primary);">${won(v)}</strong>` },
          { key: 'branch',    label: '취급점',     align: 'left',   width: '110px', format: blank },
          { key: 'memo1',     label: '적요1',      align: 'left',   width: '130px', format: blank },
          { key: 'memo2',     label: '적요2',      align: 'left',   width: '120px', format: blank },
        ],
        mock() {
          const rows = [];
          let seq = 0;
          ACCTS.forEach((a, ai) => {
            const rate = RATE[a.cur] || 1;
            const isJPY = a.cur === 'JPY';
            const unit = isJPY ? 100000 : a.cur === 'CNY' ? 5000 : a.cur === 'AUD' ? 2000 : 5000;
            let bal = (ai + 2) * unit;
            const cnt = 4 + (ai % 3);
            for (let j = 0; j < cnt; j++) {
              const isIn = (seq % 3 !== 0);
              let amt = (((seq * 7) % 9) + 1) * (unit / 10);
              amt = isJPY ? Math.round(amt) : Math.round(amt * 100) / 100;
              const depo = isIn ? amt : 0;
              const withdraw = isIn ? 0 : amt;
              bal = isJPY ? (bal + depo - withdraw) : Math.round((bal + depo - withdraw) * 100) / 100;
              rows.push({
                site: a.site, bank: a.bank, accountNo: a.no, alias: a.alias, cur: a.cur,
                txDate: dateStr(2026, 2, 40 - seq),    // 2026-03 분포
                depo, depoKrw: Math.round(depo * rate),
                withdraw, withdrawKrw: Math.round(withdraw * rate),
                balance: bal, fxRate: rate, balKrw: Math.round(bal * rate),
                branch: pick(BRANCH, seq),
                memo1: isIn ? pick(PARTY, seq) : pick(PARTY, seq + 2),
                memo2: '',
              });
              seq++;
            }
          });
          rows.forEach((r, i) => { r.no = rows.length - i; });   // 도메인 표준: No 내림차순(N→1)
          return rows;
        },
        search: {
          cols: 3,
          conditions: [
            { value: 'all',       label: '전체' },
            { value: 'site',      label: '사업장' },
            { value: 'bank',      label: '은행' },
            { value: 'alias',     label: '계좌별칭' },
            { value: 'accountNo', label: '계좌번호' },
          ],
          advanced: [
            { name: 'cur',  label: '통화', options: ['USD', 'JPY', 'AUD', 'CNY'] },
            { name: 'bank', label: '은행', options: ['기업은행', '하나은행'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['site', 'bank', 'alias', 'accountNo', 'cur', 'memo1']);
          rows = advFilter(rows, p);
          rows = dateFilter(rows, p, 'txDate');
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            if (e.target.closest('[data-action-key="fxtx-refresh"]')) {
              refresh();
              if (window.App && App.flashToast) App.flashToast('ebranch 외화 거래내역을 새로고침했습니다.', 'success');
            }
          });
        },
      };
    })(),

    /* ---------- 회계: 금융관리 > 예적금 시재보고서 ----------
     * 금융관계사(ebranch) API 연동으로 예적금 계좌별 잔액(전일·입금·출금·잔액)을 조회.
     * 우측 상단 "새로고침"으로 최신 잔액 재조회. (데모 mock — 실 운영 시 ebranch API 응답으로 교체) */
    'acc-fin-deposit-report': (function buildDepositReportSchema() {
      const ACCOUNTS = [
        { site: '(주)성원애드피아(본점)',   kind: '입출식예금', bank: '국민은행', no: '068815295174001',     alias: '국민은행' },
        { site: '(주)성원애드피아(본점)',   kind: '입출식예금', bank: '기업은행', no: '034-053757-75-016',   alias: '특정금전신탁(초단기)' },
        { site: '(주)성원애드피아몰(본점)', kind: '입출식예금', bank: '기업은행', no: '034-096673-75-023',   alias: '특정금전신탁(초단기)' },
        { site: '(주)성원애드피아(본점)',   kind: '입출식예금', bank: '신한은행', no: '207-027-451131',      alias: '신한은행' },
        { site: '(주)성원애드피아(본점)',   kind: '정기예금',   bank: '국민은행', no: '068815295180022',     alias: '국민 정기예금(1년)' },
        { site: '(주)성원애드피아(본점)',   kind: '정기적금',   bank: '기업은행', no: '034-053757-88-101',   alias: '기업 정기적금(자유)' },
        { site: '(주)성원애드피아몰(본점)', kind: '정기예금',   bank: '신한은행', no: '207-027-460055',      alias: '신한 회전식 정기예금' },
        { site: '(주)성원애드피아(본점)',   kind: '정기적금',   bank: '하나은행', no: '287-890072-50330',    alias: '하나 적립식 적금' },
      ];
      const won = (v) => (Number(v) || 0).toLocaleString();
      const KIND_PILL = { '입출식예금': 'info', '정기예금': 'success', '정기적금': 'purple' };
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '새로고침', icon: 'refresh', key: 'deposit-refresh' },
        ],
        columns: [
          { key: 'no',        label: 'No',        align: 'center', width: '56px' },
          { key: 'site',      label: '사업장',     align: 'left',   width: '200px' },
          { key: 'kind',      label: '계좌구분',   align: 'center', width: '104px',
            format: (v) => `<span class="pill pill--${KIND_PILL[v] || 'muted'}">${v || ''}</span>` },
          { key: 'bank',      label: '은행',       align: 'left',   width: '96px' },
          { key: 'accountNo', label: '계좌번호',   align: 'left',   width: '160px', format: fmtCode },
          { key: 'alias',     label: '계좌별칭',   align: 'left',   width: '180px', flex: true },
          { key: 'prevBal',   label: '전일잔액(원)', align: 'right', width: '130px', format: won },
          { key: 'depo',      label: '입금액(원)',   align: 'right', width: '120px', format: won },
          { key: 'withdraw',  label: '출금액(원)',   align: 'right', width: '120px', format: won },
          { key: 'balance',   label: '잔액(원)',     align: 'right', width: '130px',
            format: (v) => `<strong style="color:var(--color-brand-primary);">${won(v)}</strong>` },
        ],
        mock() {
          const N = ACCOUNTS.length;
          return ACCOUNTS.map((a, i) => {
            const isSavings = a.kind === '정기예금' || a.kind === '정기적금';
            const prev = ((i * 41) % 80 + 10) * 1000000 + (i * 151337) % 1000000;
            // 정기예금: 거치(입출금 없음) / 정기적금: 매월 납입(입금만) / 입출식: 입·출금 발생
            const depo     = a.kind === '입출식예금' ? ((i * 17) % 40) * 100000 + (i * 9311) % 100000
                           : a.kind === '정기적금'   ? 500000
                           : 0;
            const withdraw = a.kind === '입출식예금' ? ((i * 13) % 35) * 100000 + (i * 7717) % 100000 : 0;
            const balance  = prev + depo - withdraw;
            return {
              no: N - i,                       // 도메인 표준: No 내림차순(N→1)
              site: a.site, kind: a.kind, bank: a.bank, accountNo: a.no, alias: a.alias,
              prevBal: prev, depo, withdraw, balance,
            };
          });
        },
        search: {
          cols: 3,
          conditions: [
            { value: 'all',       label: '전체' },
            { value: 'site',      label: '사업장' },
            { value: 'bank',      label: '은행' },
            { value: 'alias',     label: '계좌별칭' },
            { value: 'accountNo', label: '계좌번호' },
          ],
          advanced: [
            { name: 'kind', label: '계좌구분', options: ['입출식예금', '정기예금', '정기적금'] },
            { name: 'bank', label: '은행',     options: ['국민은행', '기업은행', '신한은행', '하나은행'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['site', 'bank', 'alias', 'accountNo']);
          rows = advFilter(rows, p);
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            if (e.target.closest('[data-action-key="deposit-refresh"]')) {
              refresh();
              if (window.App && App.flashToast) App.flashToast('ebranch 예적금 계좌 잔액을 새로고침했습니다.', 'success');
            }
          });
        },
      };
    })(),

    /* ---------- 회계: 금융관리 > 일반계좌 거래내역 조회 ----------
     * 금융관계사(ebranch) API 연동으로 계좌별 거래(입·출금) 내역을 조회. 와이드 그리드(가로 스크롤).
     * 우측 상단 "새로고침"으로 재조회. (데모 mock — 실 운영 시 ebranch API 응답으로 교체) */
    'acc-fin-acc-tx': (function buildAcctTxSchema() {
      const ACCTS = [
        { site: '(주)성원애드피아(본점)', bank: '기업은행', no: '034-053757-04-041', alias: '모계좌-기업' },
        { site: '(주)성원애드피아(본점)', bank: '기업은행', no: '034-053757-04-058', alias: '방문카드매출' },
        { site: '성원푸드몰',             bank: '우리은행', no: '1005-003-479514',   alias: '카드OTA매출' },
        { site: '(주)성원애드피아(본점)', bank: '우리은행', no: '1005-901-824855',   alias: '모계좌-우리' },
        { site: '(주)성원애드피아(본점)', bank: '국민은행', no: '99876543213',       alias: '방문현금매출' },
      ];
      const PARTY_IN  = ['로고킹', '최태량', '박정호', '(주)크리에이티브', '마유진', '양지기획', '김서이(네모폰)', '이태양', '카드OTA정산', 'NH17898807', 'KB34578801'];
      const PARTY_OUT = ['박세익', '이보나', '염정윤', '정지현', '장영진', '김건우', '온라인광고비', '카드수수료', '자동이체', '급여이체'];
      const SUSI_IN   = ['카드매출', '현금매출', '이체입금', '온라인매출'];
      const SUSI_OUT  = ['구매대금', '수수료', '세금납부', '광고비', '급여이체'];
      const BRANCH    = ['기업 홍대역', '농협 신당동', '토스', '케이뱅크', '카카오', '하나 역삼동', 'SC', '국민', '신한', 'WON뱅킹사업부', '하나은행(081660)'];
      const GIRO      = ['0921008', '0891002', '0900032', '0040100', '0234710', '', '', ''];
      const won  = (v) => (Number(v) || 0).toLocaleString();
      const moneyCell = (v) => v ? won(v) : '<span style="color:var(--color-text-muted);">-</span>';
      const blank = (v) => v ? v : '<span style="color:var(--color-text-muted);">-</span>';
      const SUSI_PILL = { '카드매출': 'soft-blue', '현금매출': 'soft-blue', '이체입금': 'soft-blue', '온라인매출': 'soft-blue',
        '구매대금': 'soft-danger', '수수료': 'soft-danger', '세금납부': 'soft-danger', '광고비': 'soft-danger', '급여이체': 'soft-danger' };
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '새로고침', icon: 'refresh', key: 'acctx-refresh' },
        ],
        columns: [
          { key: 'no',        label: 'No',        align: 'center', width: '56px' },
          { key: 'site',      label: '사업장',     align: 'left',   width: '180px' },
          { key: 'bank',      label: '은행',       align: 'left',   width: '80px' },
          { key: 'accountNo', label: '계좌번호',   align: 'left',   width: '156px', format: fmtCode },
          { key: 'alias',     label: '계좌별칭',   align: 'left',   width: '130px' },
          { key: 'txDate',    label: '거래일자',   align: 'center', width: '104px', format: fmtYMD },
          { key: 'depo',      label: '입금액(원)', align: 'right',  width: '120px', format: moneyCell },
          { key: 'withdraw',  label: '출금액(원)', align: 'right',  width: '120px', format: moneyCell },
          { key: 'balance',   label: '잔액(원)',   align: 'right',  width: '130px',
            format: (v) => `<strong style="color:var(--color-brand-primary);">${won(v)}</strong>` },
          { key: 'memo',      label: '적요',       align: 'left',   width: '160px', flex: true },
          { key: 'memo1',     label: '적요1',      align: 'left',   width: '110px', format: blank },
          { key: 'memo2',     label: '적요2',      align: 'left',   width: '110px', format: blank },
          { key: 'susi',      label: '수지항목',   align: 'center', width: '100px',
            format: (v) => v ? `<span class="pill pill--${SUSI_PILL[v] || 'muted'}">${v}</span>` : '<span style="color:var(--color-text-muted);">-</span>' },
          { key: 'branch',    label: '취급점',     align: 'left',   width: '140px', format: blank },
          { key: 'giro',      label: '지로코드',   align: 'center', width: '96px',  format: blank },
        ],
        mock() {
          const rows = [];
          let seq = 0;
          ACCTS.forEach((a, ai) => {
            let bal = (ai + 3) * 50000000;
            const cnt = 6 + (ai % 4);
            for (let j = 0; j < cnt; j++) {
              const isIn = (seq % 3 !== 0);   // 대부분 입금, 1/3 출금
              const amt = (((seq * 7) % 9) + 1) * 100000 + (seq * 3137) % 100000;
              const depo = isIn ? amt : 0;
              const withdraw = isIn ? 0 : amt;
              bal += depo - withdraw;
              rows.push({
                site: a.site, bank: a.bank, accountNo: a.no, alias: a.alias,
                txDate: dateStr(2026, 3, 40 - seq),     // 2026-04 분포
                depo, withdraw, balance: bal,
                memo: isIn ? pick(PARTY_IN, seq) : pick(PARTY_OUT, seq),
                memo1: '', memo2: '',
                susi: isIn ? pick(SUSI_IN, seq) : pick(SUSI_OUT, seq),
                branch: pick(BRANCH, seq),
                giro: GIRO[seq % GIRO.length],
              });
              seq++;
            }
          });
          rows.forEach((r, i) => { r.no = rows.length - i; });   // 도메인 표준: No 내림차순(N→1)
          return rows;
        },
        search: {
          cols: 3,
          conditions: [
            { value: 'all',       label: '전체' },
            { value: 'site',      label: '사업장' },
            { value: 'bank',      label: '은행' },
            { value: 'alias',     label: '계좌별칭' },
            { value: 'accountNo', label: '계좌번호' },
            { value: 'memo',      label: '적요' },
          ],
          advanced: [
            { name: 'bank', label: '은행', options: ['기업은행', '국민은행', '우리은행'] },
            { name: 'susi', label: '수지항목', options: ['카드매출', '현금매출', '이체입금', '온라인매출', '구매대금', '수수료', '세금납부', '광고비', '급여이체'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['site', 'bank', 'alias', 'accountNo', 'memo', 'branch']);
          rows = advFilter(rows, p);
          rows = dateFilter(rows, p, 'txDate');
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            if (e.target.closest('[data-action-key="acctx-refresh"]')) {
              refresh();
              if (window.App && App.flashToast) App.flashToast('ebranch 거래내역을 새로고침했습니다.', 'success');
            }
          });
        },
      };
    })(),

    /* ---------- 회계: 금융관리 > 법인카드 승인내역 조회 ----------
     * 금융관계사(ebranch) API 연동으로 법인카드 승인(매입) 내역을 조회. 와이드 그리드(가로 스크롤).
     * 우측 상단 "새로고침"으로 재조회. (데모 mock — 실 운영 시 ebranch API 응답으로 교체) */
    'acc-fin-card': (function buildCardApprovalSchema() {
      const SITE = '(주)성원애드피아(본점)';
      const CARDS = [
        '4670-0900-2149-4895', '4670-0900-2234-3810', '4670-0900-2281-8563',
        '5105-5400-0078-4536', '5105-5400-0080-4573', '5105-5400-0092-0254', '5105-5400-0099-2451',
      ];
      const MERCH = [
        { biz: '116-81-19948', mno: '9979747680', name: '쿠팡(주)',           cat: 'PG(온라인)',   ceo: '강한승', tel: '02-1670-9420' },
        { biz: '383-27-01764', mno: '9926625540', name: '이마트24 남한산성점', cat: '편의점',       ceo: '김미정', tel: '031-756-1212' },
        { biz: '307-86-02693', mno: '9946399836', name: '성수남부 기아오토큐', cat: '자동차정비',   ceo: '오세훈', tel: '02-466-3380' },
        { biz: '113-85-21083', mno: '9106096985', name: '쿠팡',               cat: 'PG(온라인)',   ceo: '박대준', tel: '02-1577-7011' },
        { biz: '890-85-01530', mno: '9959396762', name: '세븐일레븐 충무팀점', cat: '편의점',       ceo: '최정현', tel: '02-2231-4455' },
        { biz: '396-87-03587', mno: '9965888878', name: '카카오T 택시',        cat: '택시',         ceo: '류긍선', tel: '1644-2255' },
        { biz: '201-81-21515', mno: '9786084798', name: '스타벅스코리아',      cat: '커피전문점',   ceo: '손정현', tel: '1522-3232' },
        { biz: '621-35-01623', mno: '9924611898', name: '컴포즈커피 성남법조점', cat: '커피전문점', ceo: '양윤석', tel: '031-721-8080' },
        { biz: '129-86-53404', mno: '9960636975', name: '하이테크에너지 주유소', cat: '주유소',     ceo: '정대훈', tel: '02-512-7700' },
        { biz: '441-23-00874', mno: '9955440860', name: '서래왕추돌(뚝섬점)',  cat: '한식(한정식)', ceo: '한상우', tel: '02-453-9090' },
        { biz: '437-07-02607', mno: '9941477653', name: '메가엠지씨커피 뚝섬', cat: '커피전문점',   ceo: '하형운', tel: '02-461-2424' },
        { biz: '442-11-03342', mno: '9924041764', name: '남한산성 은행나무집', cat: '한식(한정식)', ceo: '이태양', tel: '031-743-1100' },
        { biz: '311-85-19070', mno: '9920124126', name: '콘피에르 셀렉션',     cat: '양식',         ceo: '문선영', tel: '02-790-5252' },
        { biz: '619-95-05256', mno: '9924013226', name: '아네뜨 플라워 광장점', cat: '조경/화원',    ceo: '권나래', tel: '02-336-7788' },
        { biz: '107-87-59496', mno: '9983600552', name: '나드에프엔비(주)',   cat: '무역업',       ceo: '정우성', tel: '02-6000-3300' },
      ];
      const won = (v) => (Number(v) || 0).toLocaleString();
      const moneyCell = (v) => v ? won(v) : '<span style="color:var(--color-text-muted);">-</span>';
      const blank = (v) => v ? v : '<span style="color:var(--color-text-muted);">-</span>';
      const hms = (sec) => `${pad2(Math.floor(sec / 3600) % 24)}:${pad2(Math.floor(sec / 60) % 60)}:${pad2(sec % 60)}`;
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '새로고침', icon: 'refresh', key: 'card-refresh' },
        ],
        columns: [
          { key: 'no',       label: 'No',          align: 'center', width: '56px' },
          { key: 'site',     label: '사업장',       align: 'left',   width: '180px' },
          { key: 'issuer',   label: '카드사',       align: 'left',   width: '84px' },
          { key: 'cardNo',   label: '카드번호',     align: 'left',   width: '170px', format: fmtCode },
          { key: 'apprDate', label: '승인일자',     align: 'center', width: '104px', format: fmtYMD },
          { key: 'apprTime', label: '승인시간',     align: 'center', width: '92px' },
          { key: 'apprNo',   label: '승인번호',     align: 'center', width: '100px' },
          { key: 'apprAmt',  label: '승인금액(원)', align: 'right',  width: '120px',
            format: (v) => `<strong>${won(v)}</strong>` },
          { key: 'saleAmt',  label: '판매금액(원)', align: 'right',  width: '120px', format: won },
          { key: 'tip',      label: '봉사료(원)',   align: 'right',  width: '96px',  format: moneyCell },
          { key: 'vat',      label: '부가세(원)',   align: 'right',  width: '110px', format: won },
          { key: 'fxAmt',    label: '승인(외화)금액', align: 'right', width: '120px', format: won },
          { key: 'canceled', label: '취소여부',     align: 'center', width: '88px',
            format: (v) => `<span class="pill pill--${v === '취소' ? 'danger' : 'success'}">${v}</span>` },
          { key: 'domestic', label: '국내/외',      align: 'center', width: '80px' },
          { key: 'merchBiz', label: '가맹점사업자번호', align: 'center', width: '130px', format: fmtCode },
          { key: 'merchNo',  label: '가맹점번호',   align: 'center', width: '120px', format: fmtCode },
          { key: 'merch',    label: '가맹점',       align: 'left',   width: '180px', flex: true },
          { key: 'cat',      label: '업종',         align: 'center', width: '110px' },
          { key: 'ceo',      label: '대표자명',     align: 'left',   width: '100px', format: blank },
          { key: 'tel',      label: '대표번호',     align: 'center', width: '120px', format: blank },
        ],
        mock() {
          const rows = [];
          const N = 34;
          const _base = new Date();   // 승인일자 — 오늘 기준 최근 40일 분포 (이번달 합계가 항상 존재하도록)
          for (let i = 0; i < N; i++) {
            const m = MERCH[i % MERCH.length];
            const canceled = (i % 11 === 5);
            const sale = (((i * 13) % 28) + 1) * 1000 + ((i * 311) % 9) * 100;
            const vat = Math.round(sale / 10);
            const tip = (i % 13 === 0) ? Math.round(sale * 0.05) : 0;
            const _d = new Date(_base); _d.setDate(_base.getDate() - i);   // 최신(오늘)부터 1일씩 과거로 — No 내림차순과 일치
            rows.push({
              no: N - i,                       // 도메인 표준: No 내림차순(N→1)
              site: SITE, issuer: '롯데카드', cardNo: pick(CARDS, i),
              apprDate: `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`,
              apprTime: hms(28000 + i * 1317),
              apprNo: String(46107337 - i * 137),
              apprAmt: sale + vat + tip, saleAmt: sale, tip, vat, fxAmt: 0,
              canceled: canceled ? '취소' : '정상',
              domestic: '국내',
              merchBiz: m.biz, merchNo: m.mno, merch: m.name, cat: m.cat, ceo: m.ceo, tel: m.tel,
            });
          }
          return rows;
        },
        search: {
          cols: 3,
          conditions: [
            { value: 'all',    label: '전체' },
            { value: 'cardNo', label: '카드번호' },
            { value: 'merch',  label: '가맹점' },
            { value: 'apprNo', label: '승인번호' },
            { value: 'ceo',    label: '대표자명' },
          ],
          advanced: [
            { name: 'canceled', label: '취소여부', options: ['정상', '취소'] },
            { name: 'domestic', label: '국내/외',  options: ['국내', '해외'] },
            { name: 'cat',      label: '업종',     options: ['PG(온라인)', '편의점', '자동차정비', '택시', '커피전문점', '주유소', '한식(한정식)', '양식', '조경/화원', '무역업'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['cardNo', 'merch', 'apprNo', 'ceo', 'merchBiz', 'merchNo']);
          rows = advFilter(rows, p);
          rows = dateFilter(rows, p, 'apprDate');
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            if (e.target.closest('[data-action-key="card-refresh"]')) {
              refresh();
              if (window.App && App.flashToast) App.flashToast('ebranch 법인카드 승인내역을 새로고침했습니다.', 'success');
            }
          });
        },
      };
    })(),

    /* ---------- 회계: 금융관리 > 예적금 계좌 현황 관리 ----------
     * 금융관계사(ebranch) API 연동으로 예적금/신탁 계좌의 계약·잔액·만기 현황을 관리. 와이드 그리드(가로 스크롤).
     * 우측 상단 "새로고침"으로 잔액·잔여기일 재조회. (데모 mock — 실 운영 시 ebranch API 응답으로 교체) */
    'acc-fin-deposit': (function buildDepositMgmtSchema() {
      const ACCOUNTS = [
        { site: '(주)성원애드피아(본점)',   bank: '국민은행', no: '068815295174001',   cur: 'KRW', product: '국민수퍼고정금리형-만기일시지급', alias: '국민은행',       subject: '정기예금',   kind: '예금', contract: 300000000, monthly: 0,        balance: 300000000, open: '2026-01-09', due: '2027-01-09', queryAt: '2026-06-10 09:16:34' },
        { site: '(주)성원애드피아(본점)',   bank: '기업은행', no: '034-053757-75-016', cur: 'KRW', product: '특정금전신탁(초단기형(MMT))',    alias: '특정금전신탁',   subject: '입출식예금', kind: '신탁', contract: 0,         monthly: 0,        balance: 152340000, open: '2019-01-09', due: '2049-09-29', queryAt: '2026-06-10 09:16:17' },
        { site: '(주)성원애드피아(본점)',   bank: '신한은행', no: '207-027-451131',    cur: 'KRW', product: '신한 S드림 정기예금(기업뱅킹전)', alias: '신한은행',     subject: '정기예금',   kind: '예금', contract: 100000000, monthly: 0,        balance: 100000000, open: '2025-12-22', due: '2026-06-22', queryAt: '2026-06-10 09:16:35' },
        { site: '(주)성원애드피아몰(본점)', bank: '기업은행', no: '034-096673-75-023', cur: 'KRW', product: '특정금전신탁(초단기형(MMT))',    alias: '특정금전신탁',   subject: '입출식예금', kind: '신탁', contract: 0,         monthly: 0,        balance: 88200000,  open: '2019-09-27', due: '2049-09-29', queryAt: '2026-06-10 09:16:18' },
        { site: '(주)성원애드피아(본점)',   bank: '기업은행', no: '034-053757-88-101', cur: 'KRW', product: 'IBK 자유적립식 정기적금',        alias: '기업 정기적금', subject: '정기적금',   kind: '적금', contract: 60000000,  monthly: 5000000,  balance: 35000000,  open: '2025-07-01', due: '2026-12-31', queryAt: '2026-06-10 09:16:20' },
        { site: '(주)성원애드피아(본점)',   bank: '국민은행', no: '068815295180022',   cur: 'KRW', product: 'KB 국민첫재테크 정기예금',      alias: '국민 정기예금', subject: '정기예금',   kind: '예금', contract: 200000000, monthly: 0,        balance: 200000000, open: '2025-03-15', due: '2026-09-15', queryAt: '2026-06-10 09:16:22' },
        { site: '(주)성원애드피아몰(본점)', bank: '신한은행', no: '207-027-460055',    cur: 'KRW', product: '신한 회전식 정기예금(6개월)',   alias: '신한 회전예금', subject: '정기예금',   kind: '예금', contract: 150000000, monthly: 0,        balance: 150000000, open: '2026-02-20', due: '2026-08-20', queryAt: '2026-06-10 09:16:25' },
        { site: '(주)성원애드피아(본점)',   bank: '하나은행', no: '287-890072-50330',  cur: 'KRW', product: '하나 적립식 적금(자유)',        alias: '하나 적금',     subject: '정기적금',   kind: '적금', contract: 36000000,  monthly: 3000000,  balance: 21000000,  open: '2025-10-05', due: '2026-10-05', queryAt: '2026-06-10 09:16:28' },
      ];
      const won = (v) => (Number(v) || 0).toLocaleString();
      const moneyCell = (v) => v ? won(v) : '<span style="color:var(--color-text-muted);">-</span>';
      const SUBJ_PILL = { '입출식예금': 'info', '정기예금': 'success', '정기적금': 'purple' };
      const KIND_PILL = { '예금': 'soft-blue', '적금': 'purple', '신탁': 'slate' };
      const _now = Date.now();
      const daysLeft = (due) => Math.max(0, Math.round((new Date(due + 'T00:00:00').getTime() - _now) / 86400000));
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '새로고침', icon: 'refresh', key: 'deposit-mgmt-refresh' },
        ],
        columns: [
          { key: 'no',         label: 'No',        align: 'center', width: '56px' },
          { key: 'site',       label: '사업장',     align: 'left',   width: '180px' },
          { key: 'bank',       label: '은행',       align: 'left',   width: '90px' },
          { key: 'accountNo',  label: '계좌번호',   align: 'left',   width: '156px', format: fmtCode },
          { key: 'cur',        label: '통화',       align: 'center', width: '66px' },
          { key: 'product',    label: '예금명',     align: 'left',   width: '230px', flex: true },
          { key: 'alias',      label: '계좌별칭',   align: 'left',   width: '130px' },
          { key: 'subject',    label: '계좌과목',   align: 'center', width: '100px',
            format: (v) => `<span class="pill pill--${SUBJ_PILL[v] || 'muted'}">${v || ''}</span>` },
          { key: 'kind',       label: '계좌구분',   align: 'center', width: '84px',
            format: (v) => `<span class="pill pill--${KIND_PILL[v] || 'muted'}">${v || ''}</span>` },
          { key: 'contract',   label: '계약금액(원)', align: 'right', width: '130px', format: moneyCell },
          { key: 'monthly',    label: '월납입액(원)', align: 'right', width: '120px', format: moneyCell },
          { key: 'balance',    label: '잔액(원)',   align: 'right',  width: '130px',
            format: (v) => `<strong style="color:var(--color-brand-primary);">${won(v)}</strong>` },
          { key: 'open',       label: '신규일',     align: 'center', width: '104px', format: fmtYMD },
          { key: 'due',        label: '만기일',     align: 'center', width: '104px', format: fmtYMD },
          { key: 'remainDays', label: '잔여기일',   align: 'right',  width: '90px',
            format: (v) => `${(Number(v) || 0).toLocaleString()}일` },
          { key: 'queryAt',    label: '최종잔액조회일시', align: 'center', width: '152px', format: fmtYMDHM },
          { key: 'status',     label: '잔액조회상태', align: 'center', width: '100px',
            format: (v) => `<span class="pill pill--${v === '정상' ? 'success' : 'danger'}">${v}</span>` },
        ],
        mock() {
          const N = ACCOUNTS.length;
          return ACCOUNTS.map((a, i) => ({
            no: N - i,                       // 도메인 표준: No 내림차순(N→1)
            site: a.site, bank: a.bank, accountNo: a.no, cur: a.cur, product: a.product, alias: a.alias,
            subject: a.subject, kind: a.kind,
            contract: a.contract, monthly: a.monthly, balance: a.balance,
            open: a.open, due: a.due, remainDays: daysLeft(a.due),
            queryAt: a.queryAt, status: '정상',
          }));
        },
        search: {
          cols: 3,
          conditions: [
            { value: 'all',       label: '전체' },
            { value: 'site',      label: '사업장' },
            { value: 'bank',      label: '은행' },
            { value: 'product',   label: '예금명' },
            { value: 'alias',     label: '계좌별칭' },
            { value: 'accountNo', label: '계좌번호' },
          ],
          advanced: [
            { name: 'subject', label: '계좌과목', options: ['입출식예금', '정기예금', '정기적금'] },
            { name: 'kind',    label: '계좌구분', options: ['예금', '적금', '신탁'] },
            { name: 'bank',    label: '은행',     options: ['국민은행', '기업은행', '신한은행', '하나은행'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['site', 'bank', 'product', 'alias', 'accountNo']);
          rows = advFilter(rows, p);
          rows = dateFilter(rows, p, 'due');
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            if (e.target.closest('[data-action-key="deposit-mgmt-refresh"]')) {
              refresh();
              if (window.App && App.flashToast) App.flashToast('ebranch 예적금 계좌 현황을 새로고침했습니다.', 'success');
            }
          });
        },
      };
    })(),

    /* ---------- 자재: 입·출고 > 입고 조회 ----------
     * 발주(MatOrders) 기반 입고 메타데이터 그리드. App.MatInbounds 가 단일 진실 공급원.
     * 발주번호 클릭 → 발주 상세 OC. 입고 추가 버튼 → 입고추가 OC.
     */
    'mat-io-in': (function buildMatInboundSchema() {
      const KIND_PILL = { '원자재': 'info', '부자재': 'success' };
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '엑셀', icon: 'download' },
          { label: '입고 추가', icon: 'plus', kind: 'primary', key: 'add-inbound' },
        ],
        columns: [
          { key: 'no',             label: 'No',          align: 'center',  width: '56px',
            // hidden detail trigger — App.Grid 의 row 클릭 자동 상세 진입 로직이 본 트리거를 찾아 발화
            format: (v, row) => `${v ?? ''}<a data-matin-detail="${row.id}" hidden></a>` },
          { key: 'kind',           label: '구분',         align: 'center', width: '76px',
            format: (v) => `<span class="pill pill--${KIND_PILL[v] || 'muted'}">${v || ''}</span>` },
          { key: 'poNo',           label: '발주번호',     align: 'center', width: '128px',
            format: (v, row) => v
              ? `<a class="link-code" data-matin-po="${row.poId || ''}" style="cursor:pointer;">${v}</a>`
              : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'vendor',         label: '공급사',       align: 'left',   width: '140px' },
          { key: 'vendorManager',  label: '공급사 담당자', align: 'center', width: '100px' },
          { key: 'matName',        label: '자재명',       align: 'left',   width: '170px' },
          { key: 'spec',           label: '규격',         align: 'center', width: '140px',
            format: (v) => v ? v : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'cutType',        label: '재단유형',     align: 'center', width: '120px',
            format: (v) => v ? v : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'qty',            label: '발주수량',     align: 'right',  width: '140px',
            format: fmtQtyUnit },
          { key: 'orderer',        label: '발주담당자',   align: 'center', width: '90px' },
          { key: 'orderedAt',      label: '발주일시',     align: 'center', width: '160px', format: fmtYMDHM },
          { key: 'expectedAt',     label: '입고예정일시', align: 'center', width: '160px', format: fmtYMDHM },
          { key: 'inLocation',     label: '입고위치',     align: 'center', width: '100px' },
          { key: 'deliveryMethod', label: '배송방법',     align: 'center', width: '90px' },
          { key: 'actualAt',       label: '실제입고일시', align: 'center', width: '160px',
            format: (v) => v ? fmtYMDHM(v) : '<span style="color:var(--color-text-muted);">미입고</span>' },
          { key: 'delayText',      label: '지연현황',     align: 'center', width: '110px',
            format: (_, row) => `<span class="pill pill--${row.delayKind || 'muted'}">${row.delayText || '—'}</span>` },
          { key: 'barcode',        label: '바코드',       align: 'center', width: '160px',
            format: (v) => v
              ? `<span style=" font-size:var(--fs-xs); color:var(--color-brand-primary);">${v}</span>`
              : '<span style="color:var(--color-text-muted);">—</span>' },
        ],
        mock() {
          const S = window.App && window.App.MatInbounds;
          return S ? S.list() : [];
        },
        search: {
          cols: 4,
          conditions: [
            { value: 'all',           label: '전체' },
            { value: 'poNo',          label: '발주번호' },
            { value: 'vendor',        label: '공급사' },
            { value: 'vendorManager', label: '공급사 담당자' },
            { value: 'matName',       label: '자재명' },
            { value: 'orderer',       label: '발주담당자' },
            { value: 'barcode',       label: '바코드' },
          ],
          advanced: [
            { name: 'kind',           label: '구분',     options: ['원자재','부자재'] },
            { name: 'inLocation',     label: '입고위치', options: ['하남신사옥','성수동','남영동','충무로','인현동'] },
            { name: 'deliveryMethod', label: '배송방법', options: ['개별화물','다마스','라보','탑차','1톤화물','기타'] },
            { name: 'delayText',      label: '지연현황', options: ['정상입고','입고예정','시간 지연','일 지연'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['poNo','vendor','vendorManager','matName','orderer','barcode','spec']);
          // 지연현황은 부분일치 (예: '시간 지연' → '3시간 지연' 매칭)
          if (p && p.delayText) {
            const term = p.delayText;
            rows = rows.filter(r => {
              if (!r.delayText) return false;
              if (term === '정상입고' || term === '입고예정') return r.delayText === term;
              return r.delayText.includes(term);
            });
            // advFilter 가 delayText 를 또 처리하지 않도록 제거
            p = Object.assign({}, p); delete p.delayText;
          }
          rows = advFilter(rows, p);
          rows = dateFilter(rows, p, 'orderedAt');
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            // 툴바: 입고 추가
            const add = e.target.closest('[data-action-key="add-inbound"]');
            if (add) {
              if (window.App && window.App.openMatInboundAddOC) {
                window.App.openMatInboundAddOC(() => refresh());
              }
              return;
            }
            // 발주번호 클릭 → 발주 상세 OC
            const poLink = e.target.closest('[data-matin-po]');
            if (poLink) {
              e.preventDefault(); e.stopPropagation();
              const r = window.App.MatOrders.get(poLink.dataset.matinPo);
              if (r && window.App.openMatOrderDetailOC) window.App.openMatOrderDetailOC(r);
              return;
            }
            // 상세 버튼 클릭 → 입고 상세 OC
            const dt = e.target.closest('[data-matin-detail]');
            if (dt) {
              const r = window.App.MatInbounds.get(dt.dataset.matinDetail);
              if (r && window.App.openMatInboundDetailOC) {
                window.App.openMatInboundDetailOC(r, { onChange: () => refresh() });
              }
              return;
            }
          });
        },
      };
    })(),

    /* ---------- 자재: 입·출고 > 출고 조회 ----------
     * 자재 흐름 추적 — 언제(출고일시) / 어디서(재고장소) / 어디로(출고장소) /
     * 어떤 자재(자재코드·자재명·규격·재단유형) / 얼마(출고수량) / 왜(출고사유) / 누가(출고담당자/요청부서) / 어느 LOT
     * App.MatOutbounds 가 단일 진실 공급원.
     */
    'mat-io-out': (function buildMatOutboundSchema() {
      const KIND_PILL = { '원자재': 'info', '부자재': 'success' };
      const REASON_PILL = { '생산': 'success', '외주': 'info', '샘플': 'warning', '폐기': 'danger', '기타': 'muted' };
      const STATUS_PILL = { '출고완료': 'success', '취소': 'danger' };
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '엑셀', icon: 'download' },
        ],
        columns: [
          { key: 'no',           label: 'No',         align: 'center',  width: '56px',
            format: (v, row) => `${v ?? ''}<a data-matout-detail="${row.id}" hidden></a>` },
          { key: 'outNo',        label: '출고번호',    align: 'center', width: '130px',
            format: (v) => `<span style=" color:var(--color-brand-primary); font-weight:var(--fw-semibold);">${v || ''}</span>` },
          { key: 'linkedReqNo',  label: '신청번호',   align: 'center', width: '160px',
            format: (v, row) => v
              ? `<a class="link-code" data-matout-req="${row.linkedReqId || ''}" style="cursor:pointer; ">${v}</a>`
              : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'kind',         label: '구분',       align: 'center', width: '76px',
            format: (v) => `<span class="pill pill--${KIND_PILL[v] || 'muted'}">${v || ''}</span>` },
          { key: 'matCode',      label: '자재코드',    align: 'center', width: '100px', format: fmtMatCode },
          { key: 'matName',      label: '자재명',      align: 'left',   width: '160px' },
          { key: 'spec',         label: '규격',        align: 'center', width: '130px',
            format: (v) => v ? v : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'cutType',      label: '재단유형',    align: 'center', width: '110px',
            format: (v) => v ? v : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'outAt',        label: '출고일시',    align: 'center', width: '160px', format: fmtYMDHM },
          { key: 'outQty',       label: '출고수량',    align: 'right',  width: '140px',
            format: fmtQtyUnit },
          { key: 'reason',       label: '출고사유',    align: 'center', width: '80px',
            format: (v) => `<span class="pill pill--${REASON_PILL[v] || 'muted'}">${v || ''}</span>` },
          { key: 'handler',      label: '출고담당자',  align: 'center', width: '100px' },
          { key: 'stockLocation',label: '재고장소',    align: 'center', width: '100px' },
          { key: 'destination',  label: '출고장소',    align: 'center', width: '140px' },
          { key: 'requestDept',  label: '요청부서',    align: 'center', width: '110px' },
          { key: 'barcode',      label: '바코드',      align: 'center', width: '160px',
            format: (v) => v
              ? `<span style=" font-size:var(--fs-xs); color:var(--color-brand-primary);">${v}</span>`
              : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'status',       label: '상태',        align: 'center', width: '90px',
            format: (v) => `<span class="pill pill--${STATUS_PILL[v] || 'muted'}">${v || ''}</span>` },
        ],
        mock() {
          const S = window.App && window.App.MatOutbounds;
          return S ? S.list() : [];
        },
        search: {
          cols: 4,
          conditions: [
            { value: 'all',         label: '전체' },
            { value: 'outNo',       label: '출고번호' },
            { value: 'linkedReqNo', label: '신청번호' },
            { value: 'matCode',     label: '자재코드' },
            { value: 'matName',     label: '자재명' },
            { value: 'handler',     label: '출고담당자' },
            { value: 'requestDept', label: '요청부서' },
            { value: 'barcode',     label: '바코드' },
          ],
          advanced: [
            { name: 'kind',          label: '구분',     options: ['원자재','부자재'] },
            { name: 'reason',        label: '출고사유', options: ['생산','외주','샘플','폐기','기타'] },
            { name: 'stockLocation', label: '재고장소', options: ['하남신사옥','성수동','남영동','충무로','인현동'] },
            { name: 'status',        label: '상태',     options: ['출고완료','취소'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['outNo','linkedReqNo','matCode','matName','handler','requestDept','barcode','spec','destination']);
          rows = advFilter(rows, p);
          rows = dateFilter(rows, p, 'outAt');
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            const dt = e.target.closest('[data-matout-detail]');
            if (dt) {
              const r = window.App.MatOutbounds.get(dt.dataset.matoutDetail);
              if (r && window.App.openMatOutboundDetailOC) {
                window.App.openMatOutboundDetailOC(r, { onChange: () => refresh() });
              }
              return;
            }
            // 신청번호 클릭 → 신청 상세 OC
            const reqLink = e.target.closest('[data-matout-req]');
            if (reqLink) {
              e.preventDefault(); e.stopPropagation();
              const r = window.App.MatOutRequests.get(reqLink.dataset.matoutReq);
              if (r && window.App.openMatOutRequestDetailOC) {
                window.App.openMatOutRequestDetailOC(r, { readonly: true });
              }
              return;
            }
          });
        },
      };
    })(),

    /* ---------- 자재: 입·출고 > 출고 신청 (본인 신청 내역 + 신청 등록) ----------
     * 신청 부서(요청자)가 자재 출고를 신청. 본인이 신청한 내역만 노출.
     * 등록한 신청은 신청 내역(mat-io-req)에 자동 연동. 상태: 출고대기 → 출고완료/취소.
     */
    'mat-io-stock': (function buildMatOutReqFormSchema() {
      const KIND_PILL = { '원자재': 'info', '부자재': 'success' };
      const REASON_PILL = { '생산': 'success', '외주': 'info', '샘플': 'warning', '폐기': 'danger', '기타': 'muted' };
      const STATUS_PILL = { '출고대기': 'warning', '출고완료': 'success', '취소': 'danger' };
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '엑셀', icon: 'download' },
          { label: '출고 신청', icon: 'plus', kind: 'primary', key: 'register-matoutreq' },
        ],
        columns: [
          { key: 'no',          label: 'No',         align: 'center',  width: '56px',
            format: (v, row) => `${v ?? ''}<a data-matoutreqf-detail="${row.id}" hidden></a>` },
          { key: 'reqNo',       label: '신청번호',    align: 'center', width: '160px',
            format: (v) => `<span style=" color:var(--color-brand-primary); font-weight:var(--fw-semibold);">${v || ''}</span>` },
          { key: 'requestedAt', label: '신청일시',    align: 'center', width: '160px', format: fmtYMDHM },
          { key: 'kind',        label: '구분',       align: 'center', width: '76px',
            format: (v) => `<span class="pill pill--${KIND_PILL[v] || 'muted'}">${v || ''}</span>` },
          { key: 'matCode',     label: '자재코드',    align: 'center', width: '100px', format: fmtMatCode },
          { key: 'matName',     label: '자재명',     align: 'left',   width: '160px' },
          { key: 'spec',        label: '규격',       align: 'center', width: '130px',
            format: (v) => v ? v : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'cutType',     label: '재단유형',   align: 'center', width: '110px',
            format: (v) => v ? v : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'qty',         label: '신청수량',   align: 'right',  width: '140px',
            format: fmtQtyUnit },
          { key: 'needBy',      label: '희망 출고일', align: 'center', width: '110px', format: fmtYMD },
          { key: 'reason',      label: '사유',       align: 'center', width: '80px',
            format: (v) => `<span class="pill pill--${REASON_PILL[v] || 'muted'}">${v || ''}</span>` },
          { key: 'destination', label: '출고처',     align: 'center', width: '140px' },
          { key: 'status',      label: '상태',       align: 'center', width: '90px',
            format: (v) => `<span class="pill pill--${STATUS_PILL[v] || 'muted'}">${v || ''}</span>` },
          { key: 'linkedOutNo', label: '출고번호',   align: 'center', width: '170px',
            format: (v, row) => {
              if (!v) return '<span style="color:var(--color-text-muted);">—</span>';
              return `<a class="link-code" data-matoutreqf-out="${row.linkedOutId || ''}" style="cursor:pointer; ">${v}</a>`;
            } },
        ],
        mock() {
          const S = window.App && window.App.MatOutRequests;
          const me = window.App && window.App.currentUser;
          if (!S || !me) return [];
          return S.listByRequester(me.empId);
        },
        search: {
          cols: 3,
          conditions: [
            { value: 'all',         label: '전체' },
            { value: 'reqNo',       label: '신청번호' },
            { value: 'matCode',     label: '자재코드' },
            { value: 'matName',     label: '자재명' },
            { value: 'destination', label: '출고처' },
          ],
          advanced: [
            { name: 'kind',   label: '구분', options: ['원자재','부자재'] },
            { name: 'reason', label: '사유', options: ['생산','외주','샘플','폐기','기타'] },
            { name: 'status', label: '상태', options: ['출고대기','출고완료','취소'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['reqNo','matCode','matName','destination','spec']);
          rows = advFilter(rows, p);
          rows = dateFilter(rows, p, 'requestedAt');
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            // 툴바: 출고 신청 등록
            const reg = e.target.closest('[data-action-key="register-matoutreq"]');
            if (reg) {
              if (window.App && window.App.openMatOutRequestRegisterOC) {
                window.App.openMatOutRequestRegisterOC(() => refresh());
              }
              return;
            }
            // 상세 → 본인 신청 화면은 read-only (담당자 처리 결과만 확인)
            const dt = e.target.closest('[data-matoutreqf-detail]');
            if (dt) {
              const r = window.App.MatOutRequests.get(dt.dataset.matoutreqfDetail);
              if (r && window.App.openMatOutRequestDetailOC) {
                window.App.openMatOutRequestDetailOC(r, { onChange: () => refresh(), readonly: true });
              }
              return;
            }
            // 출고번호 클릭 → 출고 상세
            const outLink = e.target.closest('[data-matoutreqf-out]');
            if (outLink) {
              e.preventDefault(); e.stopPropagation();
              const r = window.App.MatOutbounds.get(outLink.dataset.matoutreqfOut);
              if (r && window.App.openMatOutboundDetailOC) window.App.openMatOutboundDetailOC(r);
              return;
            }
          });
        },
      };
    })(),

    /* ---------- 자재: 입·출고 > 신청 내역 (출고 부서 관리용) ----------
     * 타 부서에서 등록한 출고 신청을 출고 부서가 확인 → 출고 등록 또는 취소 처리.
     * 데이터: App.MatOutRequests
     */
    'mat-io-req': (function buildMatOutReqSchema() {
      const KIND_PILL = { '원자재': 'info', '부자재': 'success' };
      const REASON_PILL = { '생산': 'success', '외주': 'info', '샘플': 'warning', '폐기': 'danger', '기타': 'muted' };
      const STATUS_PILL = { '출고대기': 'warning', '출고완료': 'success', '취소': 'danger' };
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '엑셀', icon: 'download' },
        ],
        columns: [
          { key: 'no',          label: 'No',         align: 'center',  width: '56px',
            format: (v, row) => `${v ?? ''}<a data-matoutreq-detail="${row.id}" hidden></a>` },
          { key: 'reqNo',       label: '신청번호',    align: 'center', width: '160px',
            format: (v) => `<span style=" color:var(--color-brand-primary); font-weight:var(--fw-semibold);">${v || ''}</span>` },
          { key: 'requestedAt', label: '신청일시',    align: 'center', width: '160px', format: fmtYMDHM },
          { key: 'requester',   label: '신청자',      align: 'left',   width: '110px',
            format: (_, row) => `<div style="display:flex; align-items:center; gap:6px;">
              ${row.photo
                ? `<img src="${row.photo}" alt="" style="width:24px; height:24px; border-radius:50%; object-fit:cover;">`
                : `<span style="width:24px; height:24px; border-radius:50%; background:var(--color-active); color:var(--color-brand-primary); display:inline-flex; align-items:center; justify-content:center; font-size:11px;">${(row.requester || '').slice(0,1)}</span>`}
              <strong>${row.requester || ''}</strong>
            </div>` },
          { key: 'requestDept', label: '신청부서',    align: 'center', width: '120px' },
          { key: 'kind',        label: '구분',       align: 'center', width: '76px',
            format: (v) => `<span class="pill pill--${KIND_PILL[v] || 'muted'}">${v || ''}</span>` },
          { key: 'matCode',     label: '자재코드',    align: 'center', width: '100px', format: fmtMatCode },
          { key: 'matName',     label: '자재명',     align: 'left',   width: '160px' },
          { key: 'spec',        label: '규격',       align: 'center', width: '130px',
            format: (v) => v ? v : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'cutType',     label: '재단유형',   align: 'center', width: '110px',
            format: (v) => v ? v : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'qty',         label: '신청수량',   align: 'right',  width: '140px',
            format: fmtQtyUnit },
          { key: 'needBy',      label: '희망 출고일', align: 'center', width: '110px', format: fmtYMD },
          { key: 'reason',      label: '사유',       align: 'center', width: '80px',
            format: (v) => `<span class="pill pill--${REASON_PILL[v] || 'muted'}">${v || ''}</span>` },
          { key: 'destination', label: '출고처',     align: 'center', width: '140px' },
          { key: 'status',      label: '상태',       align: 'center', width: '90px',
            format: (v) => `<span class="pill pill--${STATUS_PILL[v] || 'muted'}">${v || ''}</span>` },
          { key: 'linkedOutNo', label: '출고번호',   align: 'center', width: '170px',
            format: (v, row) => {
              if (!v) return '<span style="color:var(--color-text-muted);">—</span>';
              return `<a class="link-code" data-matoutreq-out="${row.linkedOutId || ''}" style="cursor:pointer; ">${v}</a>`;
            } },
        ],
        mock() {
          const S = window.App && window.App.MatOutRequests;
          return S ? S.list() : [];
        },
        search: {
          cols: 3,
          conditions: [
            { value: 'all',         label: '전체' },
            { value: 'reqNo',       label: '신청번호' },
            { value: 'requester',   label: '신청자' },
            { value: 'requestDept', label: '신청부서' },
            { value: 'matCode',     label: '자재코드' },
            { value: 'matName',     label: '자재명' },
            { value: 'destination', label: '출고처' },
          ],
          advanced: [
            { name: 'kind',   label: '구분', options: ['원자재','부자재'] },
            { name: 'reason', label: '사유', options: ['생산','외주','샘플','폐기','기타'] },
            { name: 'status', label: '상태', options: ['출고대기','출고완료','취소'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['reqNo','requester','requestDept','matCode','matName','destination','spec']);
          rows = advFilter(rows, p);
          rows = dateFilter(rows, p, 'requestedAt');
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            // 상세 버튼
            const dt = e.target.closest('[data-matoutreq-detail]');
            if (dt) {
              const r = window.App.MatOutRequests.get(dt.dataset.matoutreqDetail);
              if (r && window.App.openMatOutRequestDetailOC) {
                window.App.openMatOutRequestDetailOC(r, { onChange: () => refresh() });
              }
              return;
            }
            // 출고번호 클릭 → 출고 상세 OC
            const outLink = e.target.closest('[data-matoutreq-out]');
            if (outLink) {
              e.preventDefault(); e.stopPropagation();
              const r = window.App.MatOutbounds.get(outLink.dataset.matoutreqOut);
              if (r && window.App.openMatOutboundDetailOC) window.App.openMatOutboundDetailOC(r);
              return;
            }
          });
        },
      };
    })(),

    /* ---------- 자산·업체: 시설 자산 ---------- */
    'as-status-facility': {
      columns: [
        { key: 'no',         label: 'No',          align: 'center',  width: '60px' },
        { key: 'assetNo',    label: '자산번호',    align: 'left',   width: '120px', format: fmtCode },
        { key: 'name',       label: '자산명',      align: 'left' },
        { key: 'location',   label: '위치',        align: 'left' },
        { key: 'acquiredOn', label: '취득일',      align: 'center', width: '110px', format: fmtYMD },
        { key: 'cost',       label: '취득금액(원)', align: 'right',  width: '130px' },
        { key: 'book',       label: '장부가(원)',  align: 'right',  width: '130px' },
        { key: 'status',     label: '상태',        align: 'center', width: '80px' },
      ],
      mock(n = 64) {
        const facs = ['공조기','보일러','발전기','변압기','지게차','컨베이어','크레인','에어컴프레서','정수기','CCTV'];
        const locs = ['본사 1F','본사 2F','공장 A동','공장 B동','지사 사무실','지하 기계실'];
        const st = [['운영중','success'],['점검중','warning'],['폐기','danger']];
        const rows = [];
        for (let i = 1; i <= n; i++) {
          const s = st[i % 19 === 0 ? 2 : i % 7 === 0 ? 1 : 0];
          const c = (Math.floor((i*131) % 90) + 10) * 100000;
          rows.push({
            no: i, assetNo: 'FA-' + (2020000 + i),
            name: pick(facs, i) + ' #' + (i % 10 + 1),
            location: pick(locs, i),
            acquiredOn: dateStr(2020 + (i % 6), i, i),
            cost: won(c), book: won(Math.floor(c * (0.4 + (i % 6) / 10))),
            statusText: s[0], status: Pill(s[0], s[1]),
          });
        }
        return rows;
      },
      search: {
        conditions: [
          { value: 'all',    label: '전체' },
          { value: 'assetNo',label: '자산번호' },
          { value: 'name',   label: '자산명' },
          { value: 'location', label: '위치' },
        ],
        advanced: [
          { name: 'statusText', label: '상태', options: ['운영중','점검중','폐기'] },
        ],
      },
      filter(rows, p) {
        rows = textFilter(rows, p, ['assetNo','name','location']);
        rows = advFilter(rows, p);
        rows = dateFilter(rows, p, 'acquiredOn');
        return rows;
      },
    },

    /* ---------- 장비/부품: 장비 현황 ---------- */
    'eq-list': {
      columns: [
        { key: 'no',          label: 'No',          align: 'center',  width: '60px' },
        { key: 'eqNo',        label: '장비번호',    align: 'left',   width: '110px', format: fmtCode },
        { key: 'name',        label: '장비명',      align: 'left' },
        { key: 'line',        label: '라인',        align: 'center' },
        { key: 'maker',       label: '제조사',      align: 'left' },
        { key: 'installedOn', label: '도입일',      align: 'center', width: '110px', format: fmtYMD },
        { key: 'lastCheck',   label: '최근 점검일', align: 'center', width: '120px', format: fmtYMD },
        { key: 'status',      label: '가동 상태',   align: 'center', width: '90px' },
      ],
      mock(n = 56) {
        const makers = ['두산공작기계','한국후지','SMC코리아','삼익THK','LS메카'];
        const lines  = ['LINE-1','LINE-2','LINE-3','검사실','조립실'];
        const eqs    = ['CNC선반','머시닝센터','프레스','로봇암','컨베이어','검사기','이젝터'];
        const st = [['가동','success'],['정지','danger'],['점검중','warning']];
        const rows = [];
        for (let i = 1; i <= n; i++) {
          const s = st[i % 11 === 0 ? 1 : i % 7 === 0 ? 2 : 0];
          rows.push({
            no: i, eqNo: 'EQ-' + (2000 + i),
            name: pick(eqs, i) + ' ' + (i % 20 + 1) + '호기',
            line: pick(lines, i), maker: pick(makers, i),
            installedOn: dateStr(2018 + (i % 7), i, i),
            lastCheck:   dateStr(2026, (i + 3), i),
            statusText: s[0], status: Pill(s[0], s[1]),
          });
        }
        return rows;
      },
      search: {
        conditions: [
          { value: 'all',  label: '전체' },
          { value: 'eqNo', label: '장비번호' },
          { value: 'name', label: '장비명' },
          { value: 'maker',label: '제조사' },
        ],
        advanced: [
          { name: 'line',       label: '라인', options: ['LINE-1','LINE-2','LINE-3','검사실','조립실'] },
          { name: 'statusText', label: '상태', options: ['가동','정지','점검중'] },
        ],
      },
      filter(rows, p) {
        rows = textFilter(rows, p, ['eqNo','name','maker']);
        rows = advFilter(rows, p);
        rows = dateFilter(rows, p, 'installedOn');
        return rows;
      },
    },

    /* ---------- 시스템: 원자재 코드 ---------- */
    'sys-code-raw': {
      columns: [
        { key: 'code',      label: '코드',     align: 'center', width: '120px', format: fmtCode },
        { key: 'name',      label: '명칭',     align: 'left' },
        { key: 'category',  label: '분류',     align: 'center', width: '120px' },
        { key: 'unit',      label: '단위',     align: 'center', width: '70px' },
        { key: 'inUse',     label: '사용여부', align: 'center', width: '90px' },
        { key: 'createdOn', label: '등록일',   align: 'center', width: '110px', format: fmtYMD },
        { key: 'updatedOn', label: '수정일',   align: 'center', width: '110px', format: fmtYMD },
      ],
      mock(n = 140) {
        const cats = ['수지','금속','부자재','첨가제','포장재'];
        const names = ['ABS','PP','PE','SUS304','AL6061','산화방지제','UV안정제','OPP필름','폴리백'];
        const units = ['KG','EA','M','L','PCS'];
        const rows = [];
        for (let i = 1; i <= n; i++) {
          rows.push({
            code: 'RM-' + (1000 + i),
            name: pick(names, i) + '-' + pad2(i % 99),
            category: pick(cats, i), unit: pick(units, i),
            inUse: i % 13 === 0 ? Pill('미사용','warning') : Pill('사용','success'),
            inUseText: i % 13 === 0 ? '미사용' : '사용',
            createdOn: dateStr(2024, i, i),
            updatedOn: dateStr(2026, i, i + 5),
          });
        }
        return rows;
      },
      search: {
        conditions: [
          { value: 'all',  label: '전체' },
          { value: 'code', label: '코드' },
          { value: 'name', label: '명칭' },
        ],
        advanced: [
          { name: 'category', label: '분류', options: ['수지','금속','부자재','첨가제','포장재'] },
          { name: 'inUseText',label: '사용여부', options: ['사용','미사용'] },
        ],
      },
      filter(rows, p) {
        rows = textFilter(rows, p, ['code','name']);
        rows = advFilter(rows, p);
        rows = dateFilter(rows, p, 'createdOn');
        return rows;
      },
    },

    /* ---------- 전자결재: 결재 요청함 ----------
     * App.SystemApprovals.byDrafter(ME) 에 보관된 시스템 승인요청을 mock() 위로 prepend.
     * (시스템 화면에서 실시간 등록된 row 가 항상 최신순으로 첫 페이지 상단에 노출)
     * ---------- */
    'apr-draft-sent': (function buildSentSchema() {
      // 상태 → Pill 컬러
      const STATE_KIND = { '대기':'warning', '진행중':'info', '완료':'success', '반려':'danger', '회수':'muted' };
      // 결재 단계 상태 (대기/결재/반려/-)  ※ '회수' 는 문서 전체 상태이며 단계 상태로는 사용하지 않음
      const STAGE_KIND = { '결재':'success', '대기':'warning', '반려':'danger', '-':'muted' };
      const APPROVERS  = ['김부장','이팀장','윤성수','박상무','정대표'];
      const COMMENTS   = ['이상 없음.','확인 후 진행 바랍니다.','검토 필요.','반려 — 사유 보완.','회수 후 재상신.'];

      function makeStages(i, statusText) {
        const total = 3;
        const stages = [];
        for (let k = 0; k < total; k++) {
          let s = '-';   // 미진행
          let when = '';
          let comment = '';
          if (statusText === '완료')       { s = '결재'; when = dateTimeStr(2026, i, i + k, 9 + k, (i + k) % 60); comment = pick(COMMENTS, i + k); }
          else if (statusText === '반려')  {
            if (k === 0) { s = '결재'; when = dateTimeStr(2026, i, i, 9, i % 60); comment = pick(COMMENTS, i); }
            else if (k === 1) { s = '반려'; when = dateTimeStr(2026, i, i + 1, 11, (i+1) % 60); comment = '반려 — 사유 보완 후 재상신 바랍니다.'; }
            else { s = '-'; }
          }
          else if (statusText === '회수')  { s = (k === 0) ? '결재' : '-'; when = (k === 0) ? dateTimeStr(2026, i, i, 9, i % 60) : ''; comment = (k === 0) ? pick(COMMENTS, i) : ''; }
          else if (statusText === '진행중'){ s = (k === 0) ? '결재' : (k === 1 ? '대기' : '-'); when = (k === 0) ? dateTimeStr(2026, i, i, 9, i % 60) : ''; comment = (k === 0) ? pick(COMMENTS, i) : ''; }
          else /* 대기 */                  { s = (k === 0) ? '대기' : '-'; }
          stages.push({ name: APPROVERS[k % APPROVERS.length], status: s, when, comment });
        }
        return stages;
      }
      function makeLogs(i, statusText, isResubmit) {
        // 반려 후 재상신 케이스만 로그 노출 (이전 결재/반려/의견 기록)
        if (!isResubmit) return [];
        return [
          { at: dateTimeStr(2026, i, i,     9,  i % 60),     who: '김부장', action: '결재',   comment: '1차 확인 OK' },
          { at: dateTimeStr(2026, i, i + 1, 11, (i+1) % 60), who: '이팀장', action: '반려',   comment: '사유 보완 필요' },
          { at: dateTimeStr(2026, i, i + 2, 13, (i+2) % 60), who: '윤성수', action: '재상신', comment: '내용 보완 후 재상신' },
        ];
      }

      function renderLineCell(row) {
        // 결재선 라인 텍스트 + 아코디언 토글 버튼
        const text = row._stages.map(s => `${s.name}(${s.status})`).join(' → ');
        return `<div style="display:flex; align-items:center; gap:8px;">
          <span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis;">${text}</span>
          <button type="button" class="grid__expand-btn" data-grid-expand title="결재선 상세 펼치기"><span class="caret">▸</span></button>
        </div>`;
      }

      return {
        // 신규등록 버튼 제외 (기안은 문서작성 화면에서 시작)
        refreshOnShow: true,
        toolbarActions: [{ label: '엑셀', icon: 'download' }],
        // 긴급 결재 행 — 붉은색 계열 하이라이트 (도메인 표준 .is-urgent)
        rowClass: (row) => row && row.priority === '긴급' ? 'is-urgent' : '',
        columns: [
          { key: 'no',         label: 'No',           align: 'center',  width: '60px' },
          { key: 'docNo',      label: '문서/요청번호', align: 'left',   width: '160px',
            format: (v) => v ? `<a class="link-code" data-doc-detail data-doc-no="${v}">${v}</a>` : '' },
          { key: 'priority',   label: '구분',         align: 'center', width: '70px',
            format: (v) => v === '긴급'
              ? `<span class="pill pill--danger">긴급</span>`
              : `<span class="pill pill--muted">일반</span>` },
          { key: 'kind',       label: '유형',         align: 'center', width: '80px',
            format: (v) => v === '시스템'
              ? `<span class="pill pill--info">시스템</span>`
              : `<span class="pill pill--muted">기안</span>` },
          { key: 'docName',    label: '문서/요청명',   align: 'center', width: '140px' },
          { key: 'title',      label: '제목',         align: 'left' },
          { key: 'status',     label: '상태',         align: 'center', width: '90px' },
          { key: 'draftAt',    label: '기안일시',     align: 'center', width: '170px', format: fmtYMDHM },
          { key: 'line',       label: '결재선',       align: 'left',
            format: (_, row) => renderLineCell(row) },
          { key: 'detail',     label: '상세',         align: 'center', width: '70px',
            format: (_, row) => `<button type="button" class="btn btn--xs btn--soft-primary" data-doc-detail data-doc-no="${row.docNo}">상세</button>` },
        ],
        // 결재선 아코디언 row — 단계별 카드
        expand(row) {
          const stages = row._stages || [];
          return `<div style="display:flex; flex-direction:column; gap:6px;">
            <div style="font-weight:var(--fw-semibold); color:var(--color-text); font-size:var(--fs-sm);">결재선 — 단계별 결재 정보</div>
            <table class="grid" style="width:auto; min-width:560px;">
              <thead>
                <tr>
                  <th style="width:60px;">단계</th>
                  <th style="width:120px;">결재자</th>
                  <th style="width:90px;">결재</th>
                  <th style="width:170px;">결재일시</th>
                  <th>의견</th>
                </tr>
              </thead>
              <tbody>
                ${stages.map((s, idx) => `
                  <tr>
                    <td class="col-center">${idx + 1}차</td>
                    <td>${s.name}</td>
                    <td class="col-center">${Pill(s.status, STAGE_KIND[s.status] || 'muted')}</td>
                    <td class="col-center">${fmtYMDHM(s.when)}</td>
                    <td>${s.comment ? String(s.comment) : '<span style="color:var(--color-text-muted);">—</span>'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>`;
        },
        mock(n = 60) {
          // 기안: 전자결재 양식
          const FORM_NAMES = ['휴가신청서','출장신청서','지출품의서','구매요청서','채용품의서','경비사전신청서'];
          const FORM_TITLES = ['연차 사용','대구 출장','5월 거래처 접대비','노트북 구매','경력직 채용','출장 경비 사전'];
          // 시스템: 시스템 데이터 등록/수정 요청
          const SYS_NAMES = ['장비등록','장비수정','자재등록','자재수정','계정등록','업체등록'];
          const SYS_TITLES = {
            '장비등록': ['신규 복합기 등록','네트워크 장비 추가','측정기 등록'],
            '장비수정': ['장비 정보 수정','장비 위치 변경'],
            '자재등록': ['신규 자재 등록','원자재 정보 추가'],
            '자재수정': ['자재 단가 수정','자재 분류 변경'],
            '계정등록': ['신규 사용자 계정 등록','권한 계정 추가'],
            '업체등록': ['신규 거래처 등록','협력사 추가'],
          };
          const STATES = ['대기','진행중','완료','반려','회수'];
          // 실시간 등록된 시스템 승인요청 (App.SystemApprovals.byDrafter(ME)) 을 prepend
          const ME = (window.App && window.App.currentUser && window.App.currentUser.name) || '윤성수';
          const live = (window.App && window.App.SystemApprovals && window.App.SystemApprovals.byDrafter)
            ? window.App.SystemApprovals.byDrafter(ME).map(r => ({
                // 그리드 컬럼이 요구하는 status pill 형태로 평탄화
                no:        r.no || 0,
                docNo:     r.docNo,
                kind:      r.kind,
                priority:  r.priority || '일반',
                docName:   r.docName,
                title:     r.title,
                statusText: r.statusText,
                status:    Pill(r.statusText, STATE_KIND[r.statusText] || 'muted'),
                draftAt:   r.draftAt,
                _stages:   r._stages,
                _logs:     r._logs,
                _isResubmit: r._isResubmit,
                _sysRef:   r,    // 상세화면 접근 시 원본 참조
              }))
            : [];
          const rows = live.slice();
          for (let i = 1; i <= n; i++) {
            const statusText = STATES[i % STATES.length];
            const isResubmit = (statusText === '진행중' && i % 7 === 0);
            const stages = makeStages(i, statusText);
            const isSystem = (i % 5 < 2);   // ~40% 시스템 / 60% 기안
            const kind = isSystem ? '시스템' : '기안';
            const docName = isSystem ? pick(SYS_NAMES, i) : pick(FORM_NAMES, i);
            const titleList = isSystem ? (SYS_TITLES[docName] || ['시스템 요청']) : FORM_TITLES;
            rows.push({
              no: i,
              docNo: `${isSystem ? 'SYS' : 'DOC'}-2026-${pad2(i)}`,
              kind,
              priority: (i % 4 === 1) ? '긴급' : '일반',   // 약 1/4 긴급 (붉은색 행 하이라이트)
              docName,
              title: pick(titleList, i) + ' #' + i,
              statusText,
              status: Pill(statusText, STATE_KIND[statusText] || 'muted'),
              draftAt: dateTimeStr(2026, i, i, 9 + (i % 8), i % 60),
              _stages: stages,
              _logs: makeLogs(i, statusText, isResubmit),
              _isResubmit: isResubmit,
            });
          }
          // No 재부여 — 실시간 시스템 승인요청이 prepend 되었으므로 1부터 다시 매김
          rows.forEach((r, idx) => { r.no = idx + 1; });
          return rows;
        },
        search: {
          cols: 3,
          conditions: [
            { value: 'all',     label: '전체' },
            { value: 'title',   label: '제목' },
            { value: 'docNo',   label: '문서/요청번호' },
            { value: 'docName', label: '문서/요청명' },
          ],
          advanced: [
            { name: 'docName',    label: '문서/요청명', options: ['휴가신청서','출장신청서','지출품의서','구매요청서','채용품의서','경비사전신청서','장비등록','장비수정','자재등록','자재수정','계정등록','업체등록'] },
          ],
          // 상태 — 인라인 체크박스 (다중 선택)
          checkGroups: [
            { key: 'statusText', label: '상태', wide: false, items: [
              { value: '대기',   label: '대기' },
              { value: '진행중', label: '진행중' },
              { value: '완료',   label: '완료' },
              { value: '반려',   label: '반려' },
              { value: '회수',   label: '회수' },
            ]},
          ],
          radioGroups: [
            { key: 'priority', label: '구분', wide: false, defaultValue: '', items: [
              { value: '',     label: '전체' },
              { value: '일반', label: '일반' },
              { value: '긴급', label: '긴급' },
            ]},
            { key: 'kind', label: '유형', wide: false, defaultValue: '', items: [
              { value: '',     label: '전체' },
              { value: '기안', label: '기안' },
              { value: '시스템', label: '시스템' },
            ]},
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['title','docNo','docName']);
          rows = advFilter(rows, p);
          rows = dateFilter(rows, p, 'draftAt');
          // 상태 체크박스 (다중 선택) — 비어 있으면 전체
          if (p.checks && Array.isArray(p.checks.statusText) && p.checks.statusText.length) {
            rows = rows.filter(r => p.checks.statusText.includes(r.statusText));
          }
          // 결재 구분 라디오 (전체 / 일반 / 긴급)
          if (p.radios && p.radios.priority) {
            rows = rows.filter(r => r.priority === p.radios.priority);
          }
          // 유형 라디오 (전체 / 기안 / 시스템)
          if (p.radios && p.radios.kind) {
            rows = rows.filter(r => r.kind === p.radios.kind);
          }
          return rows;
        },
        // 문서번호/상세 버튼 → 상세 모달
        bindActions(pageEl, refresh, getRows) {
          pageEl.addEventListener('click', (e) => {
            const t = e.target.closest('[data-doc-detail]');
            if (!t) return;
            const docNo = t.dataset.docNo;
            if (!docNo) return;
            const row = (getRows ? getRows() : []).find(r => r.docNo === docNo);
            if (window.App && window.App.openDocDetail && row) {
              window.App.openDocDetail(row, refresh, getRows);
            }
          });
        },
      };
    })(),

    /* ---------- 전자결재: 임시저장함 ---------- */
    'apr-draft-temp': {
      refreshOnShow: true,
      // 신규등록 버튼 제외 (임시저장은 문서작성 화면에서만 생성)
      toolbarActions: [{ label: '엑셀', icon: 'download' }],
      columns: [
        { key: 'no',       label: 'No',       align: 'center',  width: '60px' },
        { key: 'docNo',    label: '문서번호', align: 'center', width: '150px',
          format: (v, row) => v ? `<a class="link-code" data-draft-detail data-draft-id="${row._id}">${v}</a>` : '' },
        { key: 'docName',  label: '문서명',   align: 'center', width: '120px' },
        // 제목 = flex 컬럼 — 잉여 폭을 단독 흡수해 문서번호·문서명을 컴팩트하게 좌측으로 당기고 배치 안정화
        { key: 'title',    label: '제목',     align: 'left',   flex: true },
        { key: 'savedAt',  label: '저장일시', align: 'center', width: '170px', format: fmtYMDHM },
        { key: 'actions',  label: '관리',     align: 'center', width: '120px',
          format: (_, row) => `<span style="display:inline-flex; gap:4px;">
            <button type="button" class="btn btn--xs btn--soft" data-draft-action="edit"   data-draft-id="${row._id}">수정</button>
            <button type="button" class="btn btn--xs btn--soft-danger" data-draft-action="delete" data-draft-id="${row._id}">삭제</button>
          </span>` },
      ],
      mock() {
        const list = window.App.Drafts.list() || [];
        // 도메인 표준: No 내림차순 (N → 1, 최신이 위로)
        return list.map((d, i) => ({
          _id: d.id,
          no: list.length - i,
          docNo: d.docNo || '',
          docName: d.docName || '',
          title: d.title || '',
          savedAt: d.savedAt || '',
        }));
      },
      search: {
        conditions: [
          { value: 'all',     label: '전체' },
          { value: 'title',   label: '제목' },
          { value: 'docNo',   label: '문서번호' },
          { value: 'docName', label: '문서명' },
        ],
      },
      filter(rows, p) {
        rows = textFilter(rows, p, ['title','docNo','docName']);
        rows = advFilter(rows, p);
        rows = dateFilter(rows, p, 'savedAt');
        return rows;
      },
      bindActions(pageEl, refresh) {
        pageEl.addEventListener('click', (e) => {
          // 문서번호 클릭 → 상세 모달
          const link = e.target.closest('[data-draft-detail]');
          if (link) {
            const id = link.dataset.draftId;
            const draft = window.App.Drafts.get(id);
            if (draft && window.App.openDraftDetail) window.App.openDraftDetail(draft, refresh);
            return;
          }
          // 관리 컬럼 버튼
          const btn = e.target.closest('[data-draft-action]');
          if (!btn) return;
          const action = btn.dataset.draftAction;
          const id = btn.dataset.draftId;
          if (action === 'edit') {
            window.App.Drafts.setPending(id);
            window.App.Tabs.open({ id: 'apr-draft-write', label: '문서작성', page: 'page-doc-write' });
          } else if (action === 'delete') {
            window.App.confirmDelete({
              message: '임시저장 항목을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.',
              onConfirm() {
                window.App.Drafts.remove(id);
                refresh();
                window.App.flashToast && window.App.flashToast('삭제되었습니다.', 'success');
              },
            });
          }
        });
      },
    },

    /* ---------- 전자결재: 결재 대기 / 결재 완료 / 결재 반려 ---------- */
    'apr-inbox':  _buildMyApprovalSchema('inbox'),
    'apr-done':   _buildMyApprovalSchema('done'),
    'apr-reject': _buildMyApprovalSchema('reject'),

    /* ---------- 전자결재: 결재선 등록 ---------- */
    'apr-line': (function buildApprovalLineSchema() {
      const _selectedIds = new Set();
      function approverText(emp) {
        if (!emp) return '<span style="color:var(--color-text-muted);">—</span>';
        return `<div style="display:flex; align-items:center; gap:6px;">
          ${emp.photo
            ? `<img src="${emp.photo}" alt="" style="width:24px; height:24px; border-radius:50%; object-fit:cover;">`
            : `<span style="width:24px; height:24px; border-radius:50%; background:var(--color-active); color:var(--color-brand-primary); display:inline-flex; align-items:center; justify-content:center; font-size:11px;">${(emp.name || '').slice(0,1)}</span>`}
          <span><strong>${emp.name}</strong><span style="color:var(--color-text-muted); font-size:var(--fs-xs); margin-left:4px;">${emp.dept || ''}</span></span>
        </div>`;
      }

      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '엑셀', icon: 'download' },
          { label: '삭제', kind: 'ghost', key: 'delete-selected' },
          { label: '결재선 등록', icon: 'plus', kind: 'primary', key: 'register-line' },
        ],
        columns: [
          { key: '_check',       label: '<input type="checkbox" data-line-select-all aria-label="현재 페이지 전체 선택">', align: 'center', width: '40px',
            format: (_, row) => `<input type="checkbox" data-line-select="${row.id}"${_selectedIds.has(row.id) ? ' checked' : ''}>` },
          { key: 'no',           label: 'No',        align: 'center',  width: '60px' },
          { key: 'docType',      label: '문서명',     align: 'center', width: '130px' },
          { key: 'lineName',     label: '결재선명',   align: 'left',   width: '160px' },
          { key: '_a1',          label: '1차',        align: 'left',   width: '180px',
            format: (_, row) => approverText(row.approvers && row.approvers[0]) },
          { key: '_a2',          label: '2차',        align: 'left',   width: '180px',
            format: (_, row) => approverText(row.approvers && row.approvers[1]) },
          { key: '_a3',          label: '3차',        align: 'left',   width: '180px',
            format: (_, row) => approverText(row.approvers && row.approvers[2]) },
          { key: '_recip',       label: '수신/참조',   align: 'center', width: '110px',
            format: (_, row) => {
              const n = (row.recipients || []).length;
              return n
                ? `<button type="button" class="btn btn--xs btn--soft-primary" data-line-recip="${row.id}">${n}명 보기</button>`
                : '<span style="color:var(--color-text-muted);">—</span>';
            } },
          { key: 'registeredAt', label: '등록일시',   align: 'center', width: '170px', format: fmtYMDHM },
          { key: 'active',       label: '사용여부',   align: 'center', width: '90px',
            format: (v, row) => `<label class="switch"><input type="checkbox" data-line-active="${row.id}"${v ? ' checked' : ''}><span class="switch__box"></span></label>` },
          { key: '_detail',      label: '상세',       align: 'center', width: '70px',
            format: (_, row) => `<button type="button" class="btn btn--xs btn--soft" data-line-detail="${row.id}">상세</button>` },
        ],
        mock() {
          const A = window.App && window.App.MyApprovalLines;
          return A ? A.list() : [];
        },
        // 상세검색 없음 — 기본 검색만
        search: {
          conditions: [
            { value: 'all',      label: '전체' },
            { value: 'lineName', label: '결재선명' },
            { value: 'docType',  label: '문서명' },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['lineName','docType']);
          rows = dateFilter(rows, p, 'registeredAt');
          return rows;
        },
        bindActions(pageEl, refresh, getRows) {
          // 헤더 전체 선택 체크박스 상태 동기화 (전체 선택 / 부분 선택 / 미선택)
          function syncSelectAllHeader() {
            const head = pageEl.querySelector('[data-line-select-all]');
            if (!head) return;
            const rowCbs = pageEl.querySelectorAll('[data-line-select]');
            if (!rowCbs.length) {
              head.checked = false;
              head.indeterminate = false;
              return;
            }
            const checkedCount = Array.from(rowCbs).filter(c => c.checked).length;
            head.checked       = (checkedCount === rowCbs.length);
            head.indeterminate = (checkedCount > 0 && checkedCount < rowCbs.length);
          }

          // 체크박스 토글
          pageEl.addEventListener('change', (e) => {
            // 헤더 전체 선택/해제
            const all = e.target.closest('[data-line-select-all]');
            if (all) {
              const checked = all.checked;
              pageEl.querySelectorAll('[data-line-select]').forEach(cb => {
                cb.checked = checked;
                const id = cb.dataset.lineSelect;
                if (checked) _selectedIds.add(id);
                else _selectedIds.delete(id);
              });
              all.indeterminate = false;
              return;
            }
            const cb = e.target.closest('[data-line-select]');
            if (cb) {
              const id = cb.dataset.lineSelect;
              if (cb.checked) _selectedIds.add(id);
              else _selectedIds.delete(id);
              syncSelectAllHeader();
              return;
            }
            // 사용여부 toggle
            const sw = e.target.closest('[data-line-active]');
            if (sw) {
              window.App.MyApprovalLines.toggleActive(sw.dataset.lineActive);
              return;
            }
          });

          // 페이지/필터 변경 등으로 행이 다시 렌더된 후 헤더 상태 동기화
          new MutationObserver(syncSelectAllHeader)
            .observe(pageEl.querySelector('tbody') || pageEl, { childList: true, subtree: true });

          // 클릭 액션
          pageEl.addEventListener('click', (e) => {
            // 결재선 등록
            const reg = e.target.closest('[data-action-key="register-line"]');
            if (reg) {
              window.App.openApprovalLineOC(null, () => { _selectedIds.clear(); refresh(); });
              return;
            }
            // 삭제 (체크된 항목)
            const del = e.target.closest('[data-action-key="delete-selected"]');
            if (del) {
              if (!_selectedIds.size) {
                window.App.flashToast && window.App.flashToast('삭제할 항목을 선택해주세요.', 'warning');
                return;
              }
              window.App.confirmDelete({
                message: `선택한 ${_selectedIds.size}개 결재선을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`,
                onConfirm() {
                  window.App.MyApprovalLines.removeMany([..._selectedIds]);
                  _selectedIds.clear();
                  window.App.flashToast && window.App.flashToast('삭제되었습니다.', 'success');
                  refresh();
                },
              });
              return;
            }
            // 상세 (수정)
            const dt = e.target.closest('[data-line-detail]');
            if (dt) {
              const r = window.App.MyApprovalLines.get(dt.dataset.lineDetail);
              if (r) window.App.openApprovalLineOC(r, () => { _selectedIds.clear(); refresh(); });
              return;
            }
            // 수신/참조 N명 보기
            const rc = e.target.closest('[data-line-recip]');
            if (rc) {
              const r = window.App.MyApprovalLines.get(rc.dataset.lineRecip);
              if (r) window.App.openRecipientsListOC(r.recipients || [], `${r.lineName} — 수신/참조자`);
              return;
            }
          });
        },
      };
    })(),

    /* ---------- 전자결재: 권한 위임 ---------- */
    'apr-delegate': {
      refreshOnShow: true,
      toolbarActions: [
        { label: '엑셀', icon: 'download' },
        { label: '위임 등록', icon: 'plus', kind: 'primary', key: 'register-delegation' },
      ],
      columns: [
        { key: 'no',           label: 'No',     align: 'center',  width: '60px' },
        { key: 'delName',      label: '위임자', align: 'left',   width: '160px',
          format: (_, row) => `${row.delName}<span style="color:var(--color-text-muted); margin-left:6px; font-size:var(--fs-sm);">${row.delDept || ''}${row.delPos ? ' / ' + row.delPos : ''}</span>` },
        { key: 'period',       label: '기간',   align: 'center', width: '220px',
          format: (_, row) => `${fmtYMD(row.periodFrom)} ~ ${fmtYMD(row.periodTo)}` },
        { key: 'reason',       label: '사유',   align: 'left' },
        { key: 'registeredAt', label: '등록일시', align: 'center', width: '170px', format: fmtYMDHM },
        { key: 'releasedAt',   label: '해제일시', align: 'center', width: '170px',
          format: (v) => v ? fmtYMDHM(v) : '<span style="color:var(--color-text-muted);">—</span>' },
        { key: 'status',       label: '상태',   align: 'center', width: '120px',
          format: (_, row) => row.status === '위임중'
            ? `<span class="pill pill--success">위임중</span>`
            : `<span class="pill pill--muted" title="${row.statusReason || ''}">위임해제</span>` },
        { key: 'action',       label: '관리',   align: 'center', width: '90px',
          format: (_, row) => row.status === '위임중'
            ? `<button type="button" class="btn btn--xs btn--soft-danger" data-deleg-action="release" data-deleg-id="${row.id}">해제</button>`
            : '<span style="color:var(--color-text-muted);">—</span>' },
      ],
      mock() {
        const A = window.App && window.App.MyDelegations;
        return A ? A.list() : [];
      },
      // 상세검색 없음 — 기본 검색만
      search: {
        conditions: [
          { value: 'all',    label: '전체' },
          { value: 'delName',label: '위임자' },
          { value: 'reason', label: '사유' },
        ],
      },
      filter(rows, p) {
        rows = textFilter(rows, p, ['delName','reason']);
        rows = dateFilter(rows, p, 'registeredAt');
        return rows;
      },
      bindActions(pageEl, refresh) {
        // 위임 등록 버튼 (툴바)
        pageEl.addEventListener('click', (e) => {
          const reg = e.target.closest('[data-action-key="register-delegation"]');
          if (reg) {
            if (window.App && window.App.openDelegationOC) {
              window.App.openDelegationOC(() => refresh());
            }
            return;
          }
          // 해제 버튼 (그리드 행)
          const rel = e.target.closest('[data-deleg-action="release"]');
          if (rel) {
            const id = rel.dataset.delegId;
            window.App.confirmModal({
              title: '권한위임 해제',
              message: '해당 권한위임을 해제하시겠습니까?',
              confirmText: '해제',
              onConfirm() {
                if (window.App.MyDelegations.release(id)) {
                  window.App.flashToast && window.App.flashToast('권한위임이 해제되었습니다.', 'success');
                  refresh();
                }
              },
            });
            return;
          }
        });
      },
    },

    /* ---------- 전자결재: 인감 사용 ---------- */
    'apr-stamp': (function buildStampSchema() {
      const _selectedIds = new Set();
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '엑셀', icon: 'download' },
          { label: '삭제', kind: 'ghost', key: 'delete-selected' },
          { label: '사용 등록', icon: 'plus', kind: 'primary', key: 'register-stamp' },
        ],
        columns: [
          { key: '_check',       label: '<input type="checkbox" data-stamp-select-all aria-label="현재 페이지 전체 선택">', align: 'center', width: '40px',
            format: (_, row) => `<input type="checkbox" data-stamp-select="${row.id}"${_selectedIds.has(row.id) ? ' checked' : ''}>` },
          { key: 'no',           label: 'No',          align: 'center',  width: '60px' },
          { key: 'reqNo',        label: '신청번호',     align: 'center', width: '110px',
            format: (v) => `<span style="font-family:var(--font-family); color:var(--color-brand-primary); font-weight:var(--fw-semibold);">${v || ''}</span>` },
          { key: 'applicant',    label: '신청자',       align: 'left',   width: '120px',
            format: (_, row) => `<div style="display:flex; align-items:center; gap:6px;">
              ${row.photo
                ? `<img src="${row.photo}" alt="" style="width:24px; height:24px; border-radius:50%; object-fit:cover;">`
                : `<span style="width:24px; height:24px; border-radius:50%; background:var(--color-active); color:var(--color-brand-primary); display:inline-flex; align-items:center; justify-content:center; font-size:11px;">${(row.applicant || '').slice(0,1)}</span>`}
              <strong>${row.applicant || ''}</strong>${row.pos ? `<span style="color:var(--color-text-muted); font-size:var(--fs-xs); margin-left:2px;">${row.pos}</span>` : ''}
            </div>` },
          { key: 'dept',         label: '부서',         align: 'center', width: '120px' },
          { key: 'requestedAt',  label: '신청일시',     align: 'center', width: '170px', format: fmtYMDHM },
          { key: 'stampType',    label: '인감 종류',    align: 'center', width: '110px',
            format: (v) => v ? `<span class="pill pill--info">${v}</span>` : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'purpose',      label: '용도',         align: 'center', width: '120px' },
          { key: 'party',        label: '거래처/제출처', align: 'left',   width: '180px' },
          { key: 'sheets',       label: '매수',         align: 'right',  width: '70px',
            format: (v) => (Number(v) || 0).toLocaleString() },
          { key: 'useOn',        label: '사용예정일',   align: 'center', width: '110px', format: fmtYMD },
          { key: '_detail',      label: '상세',         align: 'center', width: '70px',
            format: (_, row) => `<button type="button" class="btn btn--xs btn--soft" data-stamp-detail="${row.id}">상세</button>` },
        ],
        mock() {
          const S = window.App && window.App.StampUsages;
          return S ? S.list() : [];
        },
        search: {
          conditions: [
            { value: 'all',       label: '전체' },
            { value: 'reqNo',     label: '신청번호' },
            { value: 'applicant', label: '신청자' },
            { value: 'party',     label: '거래처/제출처' },
            { value: 'purpose',   label: '용도' },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['reqNo','applicant','dept','party','purpose','stampType']);
          rows = dateFilter(rows, p, 'requestedAt');
          return rows;
        },
        bindActions(pageEl, refresh) {
          // 헤더 전체 선택 체크박스 상태 동기화
          function syncSelectAllHeader() {
            const head = pageEl.querySelector('[data-stamp-select-all]');
            if (!head) return;
            const rowCbs = pageEl.querySelectorAll('[data-stamp-select]');
            if (!rowCbs.length) { head.checked = false; head.indeterminate = false; return; }
            const checked = Array.from(rowCbs).filter(c => c.checked).length;
            head.checked       = (checked === rowCbs.length);
            head.indeterminate = (checked > 0 && checked < rowCbs.length);
          }

          pageEl.addEventListener('change', (e) => {
            const all = e.target.closest('[data-stamp-select-all]');
            if (all) {
              const checked = all.checked;
              pageEl.querySelectorAll('[data-stamp-select]').forEach(cb => {
                cb.checked = checked;
                const id = cb.dataset.stampSelect;
                if (checked) _selectedIds.add(id);
                else _selectedIds.delete(id);
              });
              all.indeterminate = false;
              return;
            }
            const cb = e.target.closest('[data-stamp-select]');
            if (cb) {
              const id = cb.dataset.stampSelect;
              if (cb.checked) _selectedIds.add(id);
              else _selectedIds.delete(id);
              syncSelectAllHeader();
              return;
            }
          });

          new MutationObserver(syncSelectAllHeader)
            .observe(pageEl.querySelector('tbody') || pageEl, { childList: true, subtree: true });

          pageEl.addEventListener('click', (e) => {
            // 사용 등록
            const reg = e.target.closest('[data-action-key="register-stamp"]');
            if (reg) {
              if (window.App && window.App.openStampUsageOC) {
                window.App.openStampUsageOC(() => { _selectedIds.clear(); refresh(); });
              }
              return;
            }
            // 삭제 (체크된 항목)
            const del = e.target.closest('[data-action-key="delete-selected"]');
            if (del) {
              if (!_selectedIds.size) {
                window.App.flashToast && window.App.flashToast('삭제할 항목을 선택해주세요.', 'warning');
                return;
              }
              window.App.confirmDelete({
                message: `선택한 ${_selectedIds.size}건의 사용 내역을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`,
                onConfirm() {
                  window.App.StampUsages.removeMany([..._selectedIds]);
                  _selectedIds.clear();
                  window.App.flashToast && window.App.flashToast('삭제되었습니다.', 'success');
                  refresh();
                },
              });
              return;
            }
            // 상세
            const dt = e.target.closest('[data-stamp-detail]');
            if (dt) {
              const r = window.App.StampUsages.get(dt.dataset.stampDetail);
              if (r && window.App.openStampUsageDetailOC) {
                window.App.openStampUsageDetailOC(r);
              }
              return;
            }
          });
        },
      };
    })(),

    /* ---------- 자재: 신청 내역 (발주 담당자용 — 신청 등록 버튼 없음) ---------- */
    'mat-buy-req': (function buildMatReqSchema() {
      const KIND_PILL   = { '원자재': 'info', '부자재': 'success' };
      const STATUS_PILL = { '발주대기': 'warning', '발주완료': 'success', '신청취소': 'danger' };
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '엑셀', icon: 'download' },
        ],
        columns: [
          { key: 'no',          label: 'No',         align: 'center',  width: '60px',
            format: (v, row) => `${v ?? ''}<a data-matreq-detail="${row.id}" hidden></a>` },
          { key: 'reqNo',       label: '신청번호',    align: 'center', width: '130px',
            format: (v) => `<span style="font-family:var(--font-family); color:var(--color-brand-primary); font-weight:var(--fw-semibold);">${v || ''}</span>` },
          { key: 'requester',   label: '신청자',     align: 'left',   width: '120px',
            format: (_, row) => `<div style="display:flex; align-items:center; gap:6px;">
              ${row.photo
                ? `<img src="${row.photo}" alt="" style="width:24px; height:24px; border-radius:50%; object-fit:cover;">`
                : `<span style="width:24px; height:24px; border-radius:50%; background:var(--color-active); color:var(--color-brand-primary); display:inline-flex; align-items:center; justify-content:center; font-size:11px;">${(row.requester || '').slice(0,1)}</span>`}
              <strong>${row.requester || ''}</strong>${row.pos ? `<span style="color:var(--color-text-muted); font-size:var(--fs-xs); margin-left:2px;">${row.pos}</span>` : ''}
            </div>` },
          { key: 'dept',        label: '부서',       align: 'center', width: '110px' },
          { key: 'requestedAt', label: '신청일시',    align: 'center', width: '170px', format: fmtYMDHM },
          { key: 'kind',        label: '구분',       align: 'center', width: '80px',
            format: (v) => `<span class="pill pill--${KIND_PILL[v] || 'muted'}">${v || ''}</span>` },
          { key: 'matCode',     label: '자재코드',    align: 'center', width: '100px', format: fmtMatCode },
          { key: 'matName',     label: '자재명',     align: 'left',   width: '160px' },
          { key: 'category',    label: '분류',       align: 'center', width: '90px' },
          { key: 'qty',         label: '수량',       align: 'right',  width: '140px',
            format: fmtQtyUnit },
          { key: 'needBy',      label: '희망 입고일', align: 'center', width: '110px', format: fmtYMD },
          { key: 'reason',      label: '사유',       align: 'left' },
          { key: 'status',      label: '상태',       align: 'center', width: '80px',
            format: (v) => `<span class="pill pill--${STATUS_PILL[v] || 'muted'}">${v || ''}</span>` },
        ],
        mock() {
          const S = window.App && window.App.MatRequests;
          return S ? S.list() : [];
        },
        search: {
          conditions: [
            { value: 'all',       label: '전체' },
            { value: 'reqNo',     label: '신청번호' },
            { value: 'requester', label: '신청자' },
            { value: 'matCode',   label: '자재코드' },
            { value: 'matName',   label: '자재명' },
          ],
          advanced: [
            { name: 'kind',   label: '구분', options: ['원자재','부자재'] },
            { name: 'status', label: '상태', options: ['발주대기','발주완료','신청취소'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['reqNo','requester','dept','matCode','matName','category','reason']);
          rows = advFilter(rows, p);
          rows = dateFilter(rows, p, 'requestedAt');
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            const dt = e.target.closest('[data-matreq-detail]');
            if (dt) {
              const r = window.App.MatRequests.get(dt.dataset.matreqDetail);
              // 담당자 모드: 발주대기 행 상세에서 발주등록/발주취소 가능
              if (r && window.App.openMatRequestDetailOC) {
                window.App.openMatRequestDetailOC(r, { allowActions: true, onChange: () => refresh() });
              }
            }
          });
        },
      };
    })(),

    /* ---------- 자재: 구매 신청 (본인 신청 내역 + 신청 등록) ---------- */
    'mat-buy-req-form': (function buildMatReqFormSchema() {
      const KIND_PILL   = { '원자재': 'info', '부자재': 'success' };
      const STATUS_PILL = { '발주대기': 'warning', '발주완료': 'success', '신청취소': 'danger' };
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '엑셀', icon: 'download' },
          { label: '신청 등록', icon: 'plus', kind: 'primary', key: 'register-matreq' },
        ],
        columns: [
          { key: 'no',          label: 'No',          align: 'center',  width: '60px',
            format: (v, row) => `${v ?? ''}<a data-matreqf-detail="${row.id}" hidden></a>` },
          { key: 'reqNo',       label: '신청번호',     align: 'center', width: '130px',
            format: (v) => `<span style="font-family:var(--font-family); color:var(--color-brand-primary); font-weight:var(--fw-semibold);">${v || ''}</span>` },
          { key: 'requestedAt', label: '신청일시',     align: 'center', width: '170px', format: fmtYMDHM },
          { key: 'kind',        label: '구분',        align: 'center', width: '80px',
            format: (v) => `<span class="pill pill--${KIND_PILL[v] || 'muted'}">${v || ''}</span>` },
          { key: 'matCode',     label: '자재코드',     align: 'center', width: '100px', format: fmtMatCode },
          { key: 'matName',     label: '자재명',      align: 'left',   width: '160px' },
          { key: 'category',    label: '분류',        align: 'center', width: '90px' },
          { key: 'qty',         label: '수량',        align: 'right',  width: '140px',
            format: fmtQtyUnit },
          { key: 'needBy',      label: '희망 입고일',  align: 'center', width: '110px', format: fmtYMD },
          { key: 'reason',      label: '사유',        align: 'left' },
          { key: 'status',      label: '상태',        align: 'center', width: '90px',
            format: (v) => `<span class="pill pill--${STATUS_PILL[v] || 'muted'}">${v || ''}</span>` },
        ],
        mock() {
          const S = window.App && window.App.MatRequests;
          const me = window.App && window.App.currentUser;
          if (!S || !me) return [];
          return S.listByRequester(me.empId);
        },
        search: {
          conditions: [
            { value: 'all',     label: '전체' },
            { value: 'reqNo',   label: '신청번호' },
            { value: 'matCode', label: '자재코드' },
            { value: 'matName', label: '자재명' },
          ],
          advanced: [
            { name: 'kind',   label: '구분', options: ['원자재','부자재'] },
            { name: 'status', label: '상태', options: ['발주대기','발주완료','신청취소'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['reqNo','matCode','matName','category','reason']);
          rows = advFilter(rows, p);
          rows = dateFilter(rows, p, 'requestedAt');
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            const reg = e.target.closest('[data-action-key="register-matreq"]');
            if (reg) {
              if (window.App && window.App.openMatRequestOC) window.App.openMatRequestOC(() => refresh());
              return;
            }
            const dt = e.target.closest('[data-matreqf-detail]');
            if (dt) {
              const r = window.App.MatRequests.get(dt.dataset.matreqfDetail);
              // 본인 신청 화면: 발주대기 상태면 신청취소 가능 (발주등록은 담당자 화면에서만)
              if (r && window.App.openMatRequestDetailOC) window.App.openMatRequestDetailOC(r, { allowCancel: true, onChange: () => refresh() });
            }
          });
        },
      };
    })(),

    /* ---------- 자재: 발주 내역 (발주 등록 버튼 없음 — 신청 상세에서만 등록) ---------- */
    'mat-buy-po': (function buildMatPoSchema() {
      const KIND_PILL   = { '원자재': 'info', '부자재': 'success' };
      const TYPE_PILL   = { '고정': 'muted', '요청': 'info' };
      const STATUS_PILL = { '발주중': 'warning', '입고완료': 'success', '취소': 'danger' };
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '엑셀', icon: 'download' },
        ],
        columns: [
          { key: 'no',           label: 'No',         align: 'center',  width: '60px',
            format: (v, row) => `${v ?? ''}<a data-matpo-detail="${row.id}" hidden></a>` },
          { key: 'poNo',         label: '발주번호',    align: 'center', width: '130px',
            format: (v) => `<span style="font-family:var(--font-family); color:var(--color-brand-primary); font-weight:var(--fw-semibold);">${v || ''}</span>` },
          { key: 'orderType',    label: '발주구분',    align: 'center', width: '80px',
            format: (v) => `<span class="pill pill--${TYPE_PILL[v] || 'muted'}">${v || '요청'}</span>` },
          { key: 'orderedAt',    label: '발주일시',    align: 'center', width: '170px', format: fmtYMDHM },
          { key: 'orderer',      label: '발주자',     align: 'left',   width: '110px',
            format: (_, row) => `<div style="display:flex; align-items:center; gap:6px;">
              ${row.photo
                ? `<img src="${row.photo}" alt="" style="width:24px; height:24px; border-radius:50%; object-fit:cover;">`
                : `<span style="width:24px; height:24px; border-radius:50%; background:var(--color-active); color:var(--color-brand-primary); display:inline-flex; align-items:center; justify-content:center; font-size:11px;">${(row.orderer || '').slice(0,1)}</span>`}
              <strong>${row.orderer || ''}</strong>
            </div>` },
          { key: 'reqNo',        label: '신청번호',    align: 'center', width: '120px',
            format: (v, row) => v
              ? `<a class="link-code" data-matpo-req="${row.reqId || ''}" style="cursor:pointer;">${v}</a>`
              : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'approvalDocNo',label: '결재 승인번호', align: 'center', width: '130px',
            format: (v) => v
              ? `<a class="link-code" data-matpo-appr="${v}" style="cursor:pointer;">${v}</a>`
              : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'kind',         label: '자재구분',    align: 'center', width: '80px',
            format: (v) => `<span class="pill pill--${KIND_PILL[v] || 'muted'}">${v || ''}</span>` },
          { key: 'matCode',      label: '자재코드',    align: 'center', width: '100px', format: fmtMatCode },
          { key: 'matName',      label: '자재명',     align: 'left',   width: '160px' },
          { key: 'vendor',       label: '공급사',     align: 'left',   width: '140px' },
          { key: 'qty',          label: '수량',       align: 'right',  width: '140px',
            format: fmtQtyUnit },
          { key: 'unitPrice',    label: '단가(원)',   align: 'right',  width: '100px', format: fmtMoney },
          { key: 'amount',       label: '금액(원)',   align: 'right',  width: '120px',
            format: (v) => `<strong>${fmtMoney(v)}</strong>` },
          { key: 'dueDate',      label: '납기일',     align: 'center', width: '110px', format: fmtYMD },
          { key: 'status',       label: '상태',       align: 'center', width: '90px',
            format: (v) => `<span class="pill pill--${STATUS_PILL[v] || 'muted'}">${v || ''}</span>` },
        ],
        mock() {
          const S = window.App && window.App.MatOrders;
          return S ? S.list() : [];
        },
        search: {
          cols: 3,
          conditions: [
            { value: 'all',           label: '전체' },
            { value: 'poNo',          label: '발주번호' },
            { value: 'reqNo',         label: '신청번호' },
            { value: 'approvalDocNo', label: '결재 승인번호' },
            { value: 'matCode',       label: '자재코드' },
            { value: 'matName',       label: '자재명' },
            { value: 'vendor',        label: '공급사' },
          ],
          advanced: [
            { name: 'orderType', label: '발주구분', options: ['고정','요청'] },
            { name: 'kind',      label: '자재구분', options: ['원자재','부자재'] },
            { name: 'status',    label: '상태',    options: ['발주중','입고완료','취소'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['poNo','reqNo','approvalDocNo','orderer','matCode','matName','vendor']);
          rows = advFilter(rows, p);
          rows = dateFilter(rows, p, 'orderedAt');
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            // 신청번호 클릭 → 신청 상세 OC
            const reqLink = e.target.closest('[data-matpo-req]');
            if (reqLink) {
              e.preventDefault(); e.stopPropagation();
              const req = window.App.MatRequests.get(reqLink.dataset.matpoReq);
              if (req && window.App.openMatRequestDetailOC) window.App.openMatRequestDetailOC(req);
              return;
            }
            // 결재 승인번호 클릭 → 전자결재 상세 모달 노출
            const apprLink = e.target.closest('[data-matpo-appr]');
            if (apprLink) {
              e.preventDefault(); e.stopPropagation();
              if (window.App && window.App.openPurchaseApprovalDetail) {
                window.App.openPurchaseApprovalDetail(apprLink.dataset.matpoAppr);
              }
              return;
            }
            const dt = e.target.closest('[data-matpo-detail]');
            if (dt) {
              const r = window.App.MatOrders.get(dt.dataset.matpoDetail);
              if (r && window.App.openMatOrderDetailOC) {
                window.App.openMatOrderDetailOC(r, { onChange: () => refresh() });
              }
            }
          });
        },
      };
    })(),

    /* ---------- 자재: 자재 > 자재현황 (발주 → 생산(조판)·기기 연동 사용추적) ----------
     * 발주 자재 기준으로 조판/인쇄 작업·기기 사용 정보를 추적하는 관리 페이지(데모).
     *  · 1번 그리드(샘플 1건) 행 클릭 → 아코디언 확장 → 2번 그리드(조판·인쇄 작업 상세) 노출.
     *  · 그리드 하위 .callout 안내 — MES 조판정보 연동 기반 작업방식 안내.
     *  · 실 운영 시: 발주(MatOrders) + MES 조판정보/모니터링(MON) 연동으로 상세 행 구성.
     */
    'mat-main-status': (function buildMatStatusSchema() {
      const esc = (v) => (v == null ? '' : String(v)).replace(/</g, '&lt;');
      const num = (v) => (Number(v) || 0).toLocaleString();
      const STATUS_PILL = { '입고대기': 'muted', '입고완료': 'info', '인쇄중': 'warning', '생산완료': 'success' };
      const qtyCell = (v, unit) => `${num(v)}<span style="color:var(--color-text-muted); font-size:var(--fs-xs); margin-left:2px;">${esc(unit || '')}</span>`;

      // 2번 — 아코디언 상세 그리드 (조판·인쇄 작업): No, 인쇄위치, 인쇄담당, 인쇄기기, 작업수량, 바코드, 조판번호, 조판유형, 조판담당
      const DETAIL_COLS = [
        { key: 'no',        label: 'No',       align: 'center', width: '56px' },
        { key: 'printPos',  label: '인쇄위치', align: 'center', width: '110px' },
        { key: 'printMgr',  label: '인쇄담당', align: 'left',   width: '100px' },
        { key: 'printer',   label: '인쇄기기', align: 'center', width: '110px' },
        { key: 'workQty',   label: '작업수량', align: 'right',  width: '90px',  format: num },
        { key: 'barcode',   label: '바코드',   align: 'center', width: '160px' },
        { key: 'plateNo',   label: '조판번호', align: 'center', width: '120px' },
        { key: 'plateType', label: '조판유형', align: 'center', width: '90px' },
        { key: 'plateMgr',  label: '조판담당', align: 'left',   width: '100px' },
      ];
      function _detailGrid(rows) {
        const head = DETAIL_COLS.map(c => `<th class="col-${c.align}" style="width:${c.width};">${esc(c.label)}</th>`).join('');
        const body = (rows || []).map(r => `<tr>${DETAIL_COLS.map(c => {
          const v = r[c.key];
          const cell = c.format ? c.format(v, r) : esc(v);
          return `<td class="col-${c.align}">${cell}</td>`;
        }).join('')}</tr>`).join('');
        return `<div style="padding:2px 0;">
          <div style="font-weight:var(--fw-semibold); color:var(--color-text); margin-bottom:8px;">조판 · 인쇄 작업 상세 <span style="color:var(--color-text-muted); font-weight:var(--fw-regular); font-size:var(--fs-xs);">(${(rows || []).length}건 · MES 조판/모니터링 연동)</span></div>
          <div class="grid-scroll" style="overflow:auto; border:1px solid var(--color-border); border-radius:var(--radius-sm);">
            <table class="grid" style="min-width:max-content;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
          </div>
        </div>`;
      }

      const NOTE_HTML = `<div class="callout callout--brand" data-ms-note style="flex:0 0 auto; margin:12px 16px 16px;">
        <span class="callout__icon">ⓘ</span>
        <div class="callout__body">
          <div class="callout__title">자재 발주정보 기준으로 생산(조판), 기기정보 연동을 통한 사용 정보 추적 관리 페이지 &gt; 작업방식 변경 필요.</div>
          <div>인쇄전 필수조건</div>
          <div class="flow-steps">
            <span class="flow-steps__item"><span class="flow-steps__no">1</span> MES 조판정보 선택</span>
            <span class="flow-steps__arrow">›</span>
            <span class="flow-steps__item"><span class="flow-steps__no">2</span> 발주자재 바코드태깅</span>
            <span class="flow-steps__arrow">›</span>
            <span class="flow-steps__item"><span class="flow-steps__no">3</span> 작업수량 입력</span>
            <span class="flow-steps__arrow">›</span>
            <span class="flow-steps__item"><span class="flow-steps__no">4</span> 생산시작</span>
          </div>
        </div>
      </div>`;

      return {
        toolbarActions: [{ label: '엑셀', icon: 'download' }],
        columns: [
          { key: 'no',        label: 'No',          align: 'center', width: '64px',
            format: (v) => `<button class="grid__expand-btn" data-grid-expand title="조판·인쇄 상세 펼치기"><span class="caret">▸</span></button><span style="margin-left:2px;">${v ?? ''}</span>` },
          { key: 'image',     label: '이미지',      align: 'center', width: '70px',
            format: (v) => v
              ? `<div class="pgrid__thumb" style="width:44px; height:44px; margin:0 auto; padding:0; overflow:hidden;"><img src="${esc(v)}" alt="" style="width:100%; height:100%; object-fit:cover;" onerror="this.parentNode.textContent='🖼';"></div>`
              : `<div class="pgrid__thumb" style="width:44px; height:44px; margin:0 auto;">🖼</div>` },
          { key: 'poNo',      label: '발주번호',    align: 'center', width: '130px',
            format: (v) => `<a href="javascript:void(0)" data-ms-po="${esc(v)}" title="발주 상세 보기" style="color:var(--color-brand-primary); cursor:pointer; text-decoration:none; font-weight:var(--fw-semibold);">${esc(v)}</a>` },
          { key: 'poAt',      label: '발주일시',    align: 'center', width: '150px', format: fmtYMDHM },
          { key: 'matCode',   label: '자재코드',    align: 'center', width: '100px', format: fmtMatCode },
          { key: 'matName',   label: '자재명',      align: 'left',   width: '200px', flex: true,
            format: (v, r) => `<a href="javascript:void(0)" data-ms-matinfo="${esc(r.matCode)}" title="자재 정보 보기" style="color:var(--color-brand-primary); cursor:pointer; text-decoration:none;">${esc(v)}</a>` },
          { key: 'spec',      label: '규격',        align: 'center', width: '150px' },
          { key: 'cutType',   label: '재단유형',    align: 'center', width: '110px',
            format: (v) => v ? esc(v) : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'supplier',  label: '공급사',      align: 'left',   width: '120px',
            format: (v) => v ? `<a href="javascript:void(0)" data-ms-vendor="${esc(v)}" title="거래처 상세 보기" style="color:var(--color-brand-primary); cursor:pointer; text-decoration:none;">${esc(v)}</a>` : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'poQty',     label: '발주수량',    align: 'right',  width: '100px', format: (v, r) => qtyCell(v, r.unit) },
          { key: 'workQty',   label: '작업수량',    align: 'right',  width: '100px', format: (v, r) => qtyCell(v, r.unit) },
          { key: 'stockQty',  label: '재고수량',    align: 'right',  width: '100px', format: (v, r) => qtyCell(v, r.unit) },
          { key: 'poPrice',   label: '발주단가(원)', align: 'right', width: '120px', format: fmtMoney },
          { key: 'amount',    label: '금액(원)',    align: 'right',  width: '120px', format: fmtMoney },
          { key: 'vat',       label: '부가세(원)',  align: 'right',  width: '110px', format: fmtMoney },
          { key: 'status',    label: '진행현황',    align: 'center', width: '100px',
            format: (v) => `<span class="pill pill--${STATUS_PILL[v] || 'muted'}">${esc(v)}</span>` },
          { key: 'inboundLoc', label: '입고처',     align: 'center', width: '110px' },
          { key: 'priceHistCount', label: '단가변경이력', align: 'center', width: '100px',
            format: (v, r) => (Number(v) || 0)
              ? `<a href="javascript:void(0)" data-ms-pricehist="${esc(r.matCode)}" title="단가 상세 정보 보기" style="cursor:pointer; text-decoration:none;"><span class="pill pill--info">${Number(v)}</span></a>`
              : '<span style="color:var(--color-text-muted);">—</span>' },
        ],
        rowClass: () => 'is-clickable',
        // 행 클릭 → 아코디언 확장 → 2번 그리드(조판·인쇄 작업 상세)
        expand: (row) => _detailGrid(row._detail),
        mock() {
          // 단가변경이력 건수 — 자재단가 마스터(L000011)의 실제 이력 수와 동기화
          const _pr = (window.App && window.App.MatPrices && window.App.MatPrices.getByCode) ? window.App.MatPrices.getByCode('L000011') : null;
          const _histCnt = _pr ? (_pr.history || []).length : 3;
          return [{
            id: 'ms-1', no: 1, image: '',
            poNo: 'PO-2606-001', poAt: '2026-06-15 10:30',
            matCode: 'L000011', matName: '뉴플러스(미색) 70g',
            spec: '종목636*939', cutType: '8절',
            supplier: '한솔제지', unit: '개',
            poQty: 25, workQty: 18, stockQty: 7,
            poPrice: 19000, amount: 475000, vat: 47500,
            status: '인쇄중', inboundLoc: '성수 1창고', priceHistCount: _histCnt,
            _detail: [
              { no: 3, printPos: '남영빌딩 1층', printMgr: '김인쇄', printer: '인쇄 1호기', workQty: 6, barcode: 'BC-20260615-001', plateNo: 'PL-0615-01', plateType: '스티커', plateMgr: '박조판' },
              { no: 2, printPos: '남영빌딩 1층', printMgr: '김인쇄', printer: '인쇄 1호기', workQty: 6, barcode: 'BC-20260615-002', plateNo: 'PL-0615-02', plateType: '스티커', plateMgr: '박조판' },
              { no: 1, printPos: '남영빌딩 1층', printMgr: '이출력', printer: '인쇄 2호기', workQty: 6, barcode: 'BC-20260615-003', plateNo: 'PL-0615-03', plateType: '스티커', plateMgr: '최조판' },
            ],
          }];
        },
        search: {
          cols: 2,
          conditions: [
            { value: 'all',     label: '전체' },
            { value: 'poNo',    label: '발주번호' },
            { value: 'matCode', label: '자재코드' },
            { value: 'matName', label: '자재명' },
          ],
          advanced: [
            { name: 'status', label: '진행현황', options: ['입고대기', '입고완료', '인쇄중', '생산완료'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['poNo', 'matCode', 'matName', 'supplier']);
          rows = advFilter(rows, p);
          rows = dateFilter(rows, p, 'poAt');
          return rows;
        },
        bindActions(pageEl) {
          // 그리드 하위 안내 문구 (.callout) — 멱등 삽입
          const wrap = pageEl.querySelector('.grid-wrap');
          if (wrap && !pageEl.querySelector('[data-ms-note]')) {
            wrap.insertAdjacentHTML('afterend', NOTE_HTML);
          }
          // 셀 링크 클릭 → 연관 상세 팝업 (모두 Read Only) + 행 클릭 → 아코디언 토글
          if (wrap && !wrap.__msRowClickBound) {
            wrap.__msRowClickBound = true;
            const App = window.App;
            wrap.addEventListener('click', (e) => {
              // ⓪ 발주번호 → 발주 상세 (read-only)
              const po = e.target.closest('[data-ms-po]');
              if (po) {
                const o = (App.MatOrders && App.MatOrders.list) ? App.MatOrders.list().find(x => x.poNo === po.dataset.msPo) : null;
                if (o && App.openMatOrderDetailOC) App.openMatOrderDetailOC(o);
                else if (App.flashToast) App.flashToast('연결된 발주 정보가 없습니다.', 'info');
                return;
              }
              // ① 공급사 → 거래처 상세 (read-only)
              const sup = e.target.closest('[data-ms-vendor]');
              if (sup) {
                const v = (App.Vendors && App.Vendors.list) ? App.Vendors.list().find(x => x.name === sup.dataset.msVendor) : null;
                if (v && App.openVendorDetailModal) App.openVendorDetailModal(v.id, { hideActions: true });
                else if (App.flashToast) App.flashToast('연결된 거래처 정보가 없습니다.', 'info');
                return;
              }
              // ② 자재명 → 자재정보 "요약정보"만 팝업 (read-only)
              const nm = e.target.closest('[data-ms-matinfo]');
              if (nm) {
                if (App.openMatInfoSummaryModal) App.openMatInfoSummaryModal(nm.dataset.msMatinfo);
                else if (App.flashToast) App.flashToast('연결된 자재 정보가 없습니다.', 'info');
                return;
              }
              // ③ 단가변경이력 → 자재단가 "단가 상세 정보" (read-only)
              const ph = e.target.closest('[data-ms-pricehist]');
              if (ph) {
                const r = (App.MatPrices && App.MatPrices.getByCode) ? App.MatPrices.getByCode(ph.dataset.msPricehist) : null;
                if (r && App.openMatPriceDetailOC) App.openMatPriceDetailOC(r, { hideAdjust: true });
                else if (App.flashToast) App.flashToast('연결된 단가 정보가 없습니다.', 'info');
                return;
              }
              // ④ 그 외 행 영역 클릭 → 아코디언 토글 (인터랙티브 요소·텍스트 선택 중 제외)
              if (e.target.closest('button, a, input, select, textarea, label, .pill, .combo')) return;
              const tr = e.target.closest('tbody tr[data-row-idx]');
              if (!tr || tr.classList.contains('grid__row-expand')) return;
              const sel = window.getSelection && window.getSelection();
              if (sel && sel.type === 'Range' && String(sel).length > 0) return;
              const btn = tr.querySelector('[data-grid-expand]');
              if (btn) btn.click();
            });
          }
        },
      };
    })(),

    /* ---------- 자재: 자재 > 부자재현황 (부자재 발주 → 기기 연동 사용추적) ----------
     * 자재현황(mat-main-status)과 동일 패턴 — 부자재(잉크·소모품 등) 데이터로 구성.
     *  · 1번 그리드(샘플 1건) 행 클릭 → 아코디언 확장 → 2번 그리드(조판·인쇄 작업 상세).
     *  · 그리드 하위 .callout 안내 — 부자재 발주정보 기반 기기정보 연동 안내.
     *  · 코드 체계: 부자재정보=SubMatInfo(P-코드), 부자재단가=SubMatPrices(SM-코드) 분리.
     *    → 동일 자재(EPSON 카트리지)가 양쪽에 실재(P000001 ↔ SM-2001) → 각 코드로 조회.
     */
    'mat-sub-status': (function buildSubMatStatusSchema() {
      const esc = (v) => (v == null ? '' : String(v)).replace(/</g, '&lt;');
      const num = (v) => (Number(v) || 0).toLocaleString();
      const STATUS_PILL = { '입고대기': 'muted', '입고완료': 'info', '인쇄중': 'warning', '생산완료': 'success' };
      const qtyCell = (v, unit) => `${num(v)}<span style="color:var(--color-text-muted); font-size:var(--fs-xs); margin-left:2px;">${esc(unit || '')}</span>`;

      // 2번 — 아코디언 상세 그리드 (기기 사용 정보)
      const DETAIL_COLS = [
        { key: 'no',        label: 'No',       align: 'center', width: '56px' },
        { key: 'printPos',  label: '기기위치', align: 'center', width: '110px' },
        { key: 'printMgr',  label: '기기담당', align: 'left',   width: '100px' },
        { key: 'printer',   label: '기기정보', align: 'center', width: '110px' },
        { key: 'workQty',   label: '사용수량', align: 'right',  width: '90px',  format: num },
        { key: 'barcode',   label: '바코드',   align: 'center', width: '160px' },
      ];
      function _detailGrid(rows) {
        const head = DETAIL_COLS.map(c => `<th class="col-${c.align}" style="width:${c.width};">${esc(c.label)}</th>`).join('');
        const body = (rows || []).map(r => `<tr>${DETAIL_COLS.map(c => {
          const v = r[c.key];
          const cell = c.format ? c.format(v, r) : esc(v);
          return `<td class="col-${c.align}">${cell}</td>`;
        }).join('')}</tr>`).join('');
        return `<div style="padding:2px 0;">
          <div style="font-weight:var(--fw-semibold); color:var(--color-text); margin-bottom:8px;">부자재 사용 이력 상세 <span style="color:var(--color-text-muted); font-weight:var(--fw-regular); font-size:var(--fs-xs);">(${(rows || []).length}건 · MES/기기 연동)</span></div>
          <div class="grid-scroll" style="overflow:auto; border:1px solid var(--color-border); border-radius:var(--radius-sm);">
            <table class="grid" style="min-width:max-content;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
          </div>
        </div>`;
      }

      const NOTE_HTML = `<div class="callout callout--brand" data-ms-note style="flex:0 0 auto; margin:12px 16px 16px;">
        <span class="callout__icon">ⓘ</span>
        <div class="callout__body">
          <div class="callout__title">부자재 발주정보 기준으로 기기정보 연동을 통한 사용 정보 추적 관리 페이지</div>
          <div>필수조건: MES 또는 별도 시스템에 기기정보와 부자재 발주 정보 및 사용수량 등록 필수</div>
        </div>
      </div>`;

      return {
        toolbarActions: [{ label: '엑셀', icon: 'download' }],
        columns: [
          { key: 'no',        label: 'No',          align: 'center', width: '64px',
            format: (v) => `<button class="grid__expand-btn" data-grid-expand title="조판·인쇄 상세 펼치기"><span class="caret">▸</span></button><span style="margin-left:2px;">${v ?? ''}</span>` },
          { key: 'image',     label: '이미지',      align: 'center', width: '70px',
            format: (v) => v
              ? `<div class="pgrid__thumb" style="width:44px; height:44px; margin:0 auto; padding:0; overflow:hidden;"><img src="${esc(v)}" alt="" style="width:100%; height:100%; object-fit:cover;" onerror="this.parentNode.textContent='🖼';"></div>`
              : `<div class="pgrid__thumb" style="width:44px; height:44px; margin:0 auto;">🖼</div>` },
          { key: 'poNo',      label: '발주번호',    align: 'center', width: '130px',
            format: (v) => `<a href="javascript:void(0)" data-ms-po="${esc(v)}" title="발주 상세 보기" style="color:var(--color-brand-primary); cursor:pointer; text-decoration:none; font-weight:var(--fw-semibold);">${esc(v)}</a>` },
          { key: 'poAt',      label: '발주일시',    align: 'center', width: '150px', format: fmtYMDHM },
          { key: 'matCode',   label: '자재코드',    align: 'center', width: '100px', format: fmtMatCode },
          { key: 'matName',   label: '자재명',      align: 'left',   width: '240px', flex: true,
            format: (v, r) => `<a href="javascript:void(0)" data-ms-subinfo="${esc(r.infoCode)}" title="부자재 정보 보기" style="color:var(--color-brand-primary); cursor:pointer; text-decoration:none;">${esc(v)}</a>` },
          { key: 'spec',      label: '규격',        align: 'center', width: '120px' },
          { key: 'cutType',   label: '유형',        align: 'center', width: '110px',
            format: (v) => v && v !== '-' ? esc(v) : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'supplier',  label: '공급사',      align: 'left',   width: '130px',
            format: (v) => v ? `<a href="javascript:void(0)" data-ms-vendor="${esc(v)}" title="거래처 상세 보기" style="color:var(--color-brand-primary); cursor:pointer; text-decoration:none;">${esc(v)}</a>` : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'poQty',     label: '발주수량',    align: 'right',  width: '100px', format: (v, r) => qtyCell(v, r.unit) },
          { key: 'workQty',   label: '사용수량',    align: 'right',  width: '100px', format: (v, r) => qtyCell(v, r.unit) },
          { key: 'stockQty',  label: '재고수량',    align: 'right',  width: '100px', format: (v, r) => qtyCell(v, r.unit) },
          { key: 'poPrice',   label: '발주단가(원)', align: 'right', width: '120px', format: fmtMoney },
          { key: 'amount',    label: '금액(원)',    align: 'right',  width: '120px', format: fmtMoney },
          { key: 'vat',       label: '부가세(원)',  align: 'right',  width: '110px', format: fmtMoney },
          { key: 'status',    label: '진행현황',    align: 'center', width: '100px',
            format: (v) => `<span class="pill pill--${STATUS_PILL[v] || 'muted'}">${esc(v)}</span>` },
          { key: 'inboundLoc', label: '입고처',     align: 'center', width: '110px' },
        ],
        rowClass: () => 'is-clickable',
        expand: (row) => _detailGrid(row._detail),
        mock() {
          return [{
            id: 'sms-1', no: 1, image: '',
            poNo: 'PO-2606-101', poAt: '2026-06-14 09:20',
            matCode: 'SM-2001',           // 부자재단가(SubMatPrices) 코드 — 단가변경이력 조회용
            infoCode: 'P000001',          // 부자재정보(SubMatInfo) 코드 — 자재명 요약 조회용
            matName: 'EPSON T6997 Maintenance Cartridge',
            spec: '350ml', cutType: '잉크',
            supplier: '(주)맥플러스', unit: 'ea',
            poQty: 10, workQty: 7, stockQty: 3,
            poPrice: 50000, amount: 500000, vat: 50000,
            status: '인쇄중', inboundLoc: '성수 2창고',
            _detail: [
              { no: 2, printPos: '성수 2층', printMgr: '김디지털', printer: '디지털 1호기', workQty: 4, barcode: 'BC-20260614-101' },
              { no: 1, printPos: '성수 2층', printMgr: '이출력',   printer: '디지털 2호기', workQty: 3, barcode: 'BC-20260614-102' },
            ],
          }];
        },
        search: {
          cols: 2,
          conditions: [
            { value: 'all',     label: '전체' },
            { value: 'poNo',    label: '발주번호' },
            { value: 'matCode', label: '자재코드' },
            { value: 'matName', label: '자재명' },
          ],
          advanced: [
            { name: 'status', label: '진행현황', options: ['입고대기', '입고완료', '인쇄중', '생산완료'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['poNo', 'matCode', 'matName', 'supplier']);
          rows = advFilter(rows, p);
          rows = dateFilter(rows, p, 'poAt');
          return rows;
        },
        bindActions(pageEl) {
          const wrap = pageEl.querySelector('.grid-wrap');
          if (wrap && !pageEl.querySelector('[data-ms-note]')) {
            wrap.insertAdjacentHTML('afterend', NOTE_HTML);
          }
          if (wrap && !wrap.__msRowClickBound) {
            wrap.__msRowClickBound = true;
            const App = window.App;
            wrap.addEventListener('click', (e) => {
              // ⓪ 발주번호 → 발주 상세 (read-only)
              const po = e.target.closest('[data-ms-po]');
              if (po) {
                const o = (App.MatOrders && App.MatOrders.list) ? App.MatOrders.list().find(x => x.poNo === po.dataset.msPo) : null;
                if (o && App.openMatOrderDetailOC) App.openMatOrderDetailOC(o);
                else if (App.flashToast) App.flashToast('연결된 발주 정보가 없습니다.', 'info');
                return;
              }
              // ① 공급사 → 거래처 상세 (read-only, 자재현황과 동일 — 닫기 외 버튼 비노출)
              const sup = e.target.closest('[data-ms-vendor]');
              if (sup) {
                const v = (App.Vendors && App.Vendors.list) ? App.Vendors.list().find(x => x.name === sup.dataset.msVendor) : null;
                if (v && App.openVendorDetailModal) App.openVendorDetailModal(v.id, { hideActions: true });
                else if (App.flashToast) App.flashToast('연결된 거래처 정보가 없습니다.', 'info');
                return;
              }
              // ② 자재명 → 부자재정보 "요약정보"만 팝업 (read-only)
              const nm = e.target.closest('[data-ms-subinfo]');
              if (nm) {
                if (App.openSubMatInfoSummaryModal) App.openSubMatInfoSummaryModal(nm.dataset.msSubinfo);
                else if (App.flashToast) App.flashToast('연결된 부자재 정보가 없습니다.', 'info');
                return;
              }
              // ③ 그 외 행 영역 클릭 → 아코디언 토글
              if (e.target.closest('button, a, input, select, textarea, label, .pill, .combo')) return;
              const tr = e.target.closest('tbody tr[data-row-idx]');
              if (!tr || tr.classList.contains('grid__row-expand')) return;
              const sel = window.getSelection && window.getSelection();
              if (sel && sel.type === 'Range' && String(sel).length > 0) return;
              const btn = tr.querySelector('[data-grid-expand]');
              if (btn) btn.click();
            });
          }
        },
      };
    })(),

    /* ---------- 자재: 자재 > 자재 단가 (원자재 용지 단가 마스터 + 변경 이력) ----------
     * 발주 시 적용일 기준 단가 자동 적용. 단가 = 고시가 × (1 - 할인률).
     * 현재 vs 직전 비교 컬럼 — 트렌드 자동 계산 (.trend-delta--up/--down).
     * 데이터: App.MatPrices
     */
    'mat-main-price': (function buildMatPriceSchema() {
      const STATUS_PILL = { '승인': 'success', '대기': 'warning', '반려': 'danger' };
      const REASON_PILL = {
        '신규 계약': 'info', '계약 변경': 'warning', '재계약': 'success',
        '원가 상승': 'danger', '원가 인하': 'info', '기타': 'muted',
      };
      // 변화율 → trend-delta HTML (자동 계산)
      const trendPill = (cur, prev, opts = {}) => {
        if (cur == null || prev == null || prev === 0) {
          return `<span class="trend-delta trend-delta--flat">—</span>`;
        }
        const diff = opts.absolute ? (cur - prev) : ((cur - prev) / prev * 100);
        if (Math.abs(diff) < 0.05) return `<span class="trend-delta trend-delta--flat">—</span>`;
        const arrow = diff > 0 ? '↑' : '↓';
        const mod   = diff > 0 ? 'up' : 'down';
        const sufx  = opts.absolute ? 'pp' : '%';
        return `<span class="trend-delta trend-delta--${mod}">${arrow} ${Math.abs(diff).toFixed(1)}${sufx}</span>`;
      };
      // 현재값 + 트렌드 인라인 (우측정렬 셀 안에서)
      const fmtCurWithTrend = (v, prev, opts) => {
        const numStr = (v == null) ? '<span style="color:var(--color-text-muted);">—</span>'
          : (typeof v === 'number' ? v.toLocaleString() : v);
        return `<span style="font-weight:var(--fw-semibold);">${numStr}</span> ${trendPill(v, prev, opts || {})}`;
      };
      // 할인률 — '25%' 형식, 트렌드는 절대(pp)
      const fmtCurRateWithTrend = (v, prev) => {
        if (v == null) return '<span style="color:var(--color-text-muted);">—</span>';
        return `<span style="font-weight:var(--fw-semibold);">${v}%</span> ${trendPill(v, prev, { absolute: true })}`;
      };
      const fmtPrev = (v) => v == null ? '<span style="color:var(--color-text-muted);">—</span>'
        : (typeof v === 'number' ? v.toLocaleString() : v);
      const fmtPrevRate = (v) => v == null ? '<span style="color:var(--color-text-muted);">—</span>'
        : `${v}%`;

      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '엑셀',       icon: 'download' },
          { label: '단가마스터', icon: 'cog',                        key: 'open-matprice-master' },
          { label: '단가 조정',  icon: 'plus', kind: 'primary',      key: 'register-matprice' },
        ],
        columns: [
          { key: 'no',           label: 'No',         align: 'center',  width: '56px',
            format: (v, row) => `${v ?? ''}<a data-matprice-detail="${row.id}" hidden></a>` },
          { key: 'matCode',      label: '자재코드',    align: 'center', width: '100px', format: fmtMatCode },
          { key: 'category',     label: '대분류',     align: 'center', width: '90px',
            format: (v) => `<span class="pill pill--muted">${v || ''}</span>` },
          { key: 'subCategory',  label: '중분류',     align: 'center', width: '90px' },
          { key: 'matName',      label: '자재명',     align: 'left',   width: '200px' },
          { key: 'spec',         label: '규격',       align: 'center', width: '110px' },
          { key: 'cutType',      label: '재단유형',   align: 'center', width: '120px',
            format: (v) => v ? v : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'supplier',     label: '공급사',     align: 'left',   width: '110px' },
          { key: 'supplierContact', label: '공급사담당자', align: 'center', width: '100px' },
          { key: 'currentMarketPrice', label: '현재고시가 (원)', align: 'right', width: '140px',
            format: (v, row) => fmtCurWithTrend(v, row.prevMarketPrice) },
          { key: 'prevMarketPrice',    label: '이전고시가 (원)', align: 'right', width: '110px',
            format: fmtPrev },
          { key: 'currentDiscountRate', label: '현재할인률', align: 'right', width: '130px',
            format: (v, row) => fmtCurRateWithTrend(v, row.prevDiscountRate) },
          { key: 'prevDiscountRate',    label: '이전할인률', align: 'right', width: '100px',
            format: fmtPrevRate },
          { key: 'currentPrice', label: '현재 단가 (원)', align: 'right', width: '140px',
            format: (v, row) => fmtCurWithTrend(v, row.prevPrice) },
          { key: 'prevPrice',    label: '직전 단가 (원)', align: 'right', width: '110px',
            format: fmtPrev },
          { key: 'registeredAt', label: '등록일시',    align: 'center', width: '160px', format: fmtYMDHM },
          { key: 'appliedAt',    label: '적용일',     align: 'center', width: '100px', format: fmtYMD },
          { key: 'history',      label: '변경이력',   align: 'center', width: '90px',
            format: (v, row) => {
              const n = (row.history || []).length;
              return n
                ? `<a href="javascript:void(0)" data-matprice-hist="${row.id}" class="pill pill--info" title="단가 변경 이력 보기" style="cursor:pointer;">${n}</a>`
                : '<span style="color:var(--color-text-muted);">—</span>';
            } },
          { key: 'status',       label: '상태',       align: 'center', width: '80px',
            format: (v) => `<span class="pill pill--${STATUS_PILL[v] || 'muted'}">${v || ''}</span>` },
        ],
        mock() {
          const S = window.App && window.App.MatPrices;
          return S ? S.list() : [];
        },
        search: {
          cols: 3,
          conditions: [
            { value: 'all',         label: '전체' },
            { value: 'matCode',     label: '자재코드' },
            { value: 'matName',     label: '자재명' },
            { value: 'supplier',    label: '공급사' },
            { value: 'supplierContact', label: '공급사담당자' },
          ],
          advanced: [
            { name: 'category',    label: '대분류', options: ['스탠다드','스페셜','패키지','스티커'] },
            { name: 'subCategory', label: '중분류', options: ['아트지','모조지','스노우지','켄트지','머메이드','랑데뷰','반누보','SC아이보리','아트지스티커'] },
            { name: 'status',      label: '상태',   options: ['승인','대기','반려'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['matCode','matName','supplier','supplierContact','spec']);
          rows = advFilter(rows, p);
          rows = dateFilter(rows, p, 'registeredAt');
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            // 툴바: 단가마스터 (카테고리 단위 단가 일괄 관리)
            const masterBtn = e.target.closest('[data-action-key="open-matprice-master"]');
            if (masterBtn) {
              if (window.App && window.App.openMatPriceMasterModal) {
                window.App.openMatPriceMasterModal({ onChange: () => refresh() });
              }
              return;
            }
            // 툴바: 단가 조정 등록
            const reg = e.target.closest('[data-action-key="register-matprice"]');
            if (reg) {
              if (window.App && window.App.openMatPriceAdjustOC) {
                window.App.openMatPriceAdjustOC(null, { onChange: () => refresh() });
              }
              return;
            }
            // 변경이력 카운트 클릭 → 단가 상세(단가 이력 카드) 노출
            const hist = e.target.closest('[data-matprice-hist]');
            if (hist) {
              const r = window.App.MatPrices.get(hist.dataset.matpriceHist);
              if (r && window.App.openMatPriceDetailOC) {
                window.App.openMatPriceDetailOC(r, { onChange: () => refresh() });
              }
              return;
            }
            // 상세 → 단가 상세 OC
            const dt = e.target.closest('[data-matprice-detail]');
            if (dt) {
              const r = window.App.MatPrices.get(dt.dataset.matpriceDetail);
              if (r && window.App.openMatPriceDetailOC) {
                window.App.openMatPriceDetailOC(r, { onChange: () => refresh() });
              }
              return;
            }
          });
        },
      };
    })(),

    /* ---------- 자재: 자재 > 부자재 단가 (잉크/소모품/포장재 등 단가 마스터 + 변경 이력) ----------
     * 단가 + 할인률 직접 입력 → 최종 할인가 자동 계산. 발주 시 적용일 기준 최종 할인가 자동 적용.
     * 자재 단가(자재) 와 유사하나 분류 3단계(대/중/소) + 사이즈/수량 컬럼 + 최종/직전 할인가 추가.
     * 데이터: App.SubMatPrices
     */
    'mat-sub-price': (function buildSubMatPriceSchema() {
      const STATUS_PILL = { '승인': 'success', '대기': 'warning', '반려': 'danger' };
      const trendPill = (cur, prev, opts = {}) => {
        if (cur == null || prev == null || prev === 0) {
          return `<span class="trend-delta trend-delta--flat">—</span>`;
        }
        const diff = opts.absolute ? (cur - prev) : ((cur - prev) / prev * 100);
        if (Math.abs(diff) < 0.05) return `<span class="trend-delta trend-delta--flat">—</span>`;
        const arrow = diff > 0 ? '↑' : '↓';
        const mod   = diff > 0 ? 'up' : 'down';
        const sufx  = opts.absolute ? 'pp' : '%';
        return `<span class="trend-delta trend-delta--${mod}">${arrow} ${Math.abs(diff).toFixed(1)}${sufx}</span>`;
      };
      const fmtCurWithTrend = (v, prev, opts) => {
        const numStr = (v == null) ? '<span style="color:var(--color-text-muted);">—</span>'
          : (typeof v === 'number' ? v.toLocaleString() : v);
        return `<span style="font-weight:var(--fw-semibold);">${numStr}</span> ${trendPill(v, prev, opts || {})}`;
      };
      const fmtCurRateWithTrend = (v, prev) => {
        if (v == null) return '<span style="color:var(--color-text-muted);">—</span>';
        return `<span style="font-weight:var(--fw-semibold);">${v}%</span> ${trendPill(v, prev, { absolute: true })}`;
      };
      const fmtPrev = (v) => v == null ? '<span style="color:var(--color-text-muted);">—</span>'
        : (typeof v === 'number' ? v.toLocaleString() : v);
      const fmtPrevRate = (v) => v == null ? '<span style="color:var(--color-text-muted);">—</span>'
        : `${v}%`;

      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '엑셀',     icon: 'download' },
          { label: '단가 조정', icon: 'plus', kind: 'primary', key: 'register-submatprice' },
        ],
        columns: [
          { key: 'no',           label: 'No',         align: 'center',  width: '56px',
            format: (v, row) => `${v ?? ''}<a data-submatprice-detail="${row.id}" hidden></a>` },
          { key: 'matCode',      label: '자재코드',    align: 'center', width: '100px', format: fmtMatCode },
          { key: 'category',     label: '대분류',     align: 'center', width: '80px',
            format: (v) => `<span class="pill pill--muted">${v || ''}</span>` },
          { key: 'subCategory',  label: '중분류',     align: 'center', width: '90px' },
          { key: 'minorCategory', label: '소분류',     align: 'center', width: '90px' },
          { key: 'matName',      label: '자재명',     align: 'left',   width: '240px' },
          { key: 'size',         label: '사이즈',     align: 'center', width: '120px' },
          { key: 'qty',          label: '수량',       align: 'right',  width: '90px',
            format: (v, row) => `${(Number(v) || 0).toLocaleString()}<span style="color:var(--color-text-muted); font-size:var(--fs-xs); margin-left:2px;">${row.qtyUnit || ''}</span>` },
          { key: 'supplier',     label: '공급사',     align: 'left',   width: '120px' },
          { key: 'supplierContact', label: '공급사담당자', align: 'center', width: '100px' },
          { key: 'currentPrice', label: '현재단가 (원)', align: 'right', width: '130px',
            format: (v, row) => fmtCurWithTrend(v, row.prevPrice) },
          { key: 'prevPrice',    label: '직전단가 (원)', align: 'right', width: '100px',
            format: fmtPrev },
          { key: 'currentDiscountRate', label: '현재할인률', align: 'right', width: '130px',
            format: (v, row) => fmtCurRateWithTrend(v, row.prevDiscountRate) },
          { key: 'prevDiscountRate',    label: '직전할인률', align: 'right', width: '100px',
            format: fmtPrevRate },
          { key: 'currentDiscountedPrice', label: '최종할인가 (원)', align: 'right', width: '140px',
            format: (v, row) => fmtCurWithTrend(v, row.prevDiscountedPrice) },
          { key: 'prevDiscountedPrice',    label: '직전할인가 (원)', align: 'right', width: '110px',
            format: fmtPrev },
          { key: 'registeredAt', label: '등록일시',    align: 'center', width: '160px', format: fmtYMDHM },
          { key: 'appliedAt',    label: '적용일',     align: 'center', width: '100px', format: fmtYMD },
          { key: 'history',      label: '변경이력',   align: 'center', width: '90px',
            format: (v, row) => {
              const n = (row.history || []).length;
              return n
                ? `<a href="javascript:void(0)" data-submatprice-hist="${row.id}" class="pill pill--info" title="단가 변경 이력 보기" style="cursor:pointer;">${n}</a>`
                : '<span style="color:var(--color-text-muted);">—</span>';
            } },
          { key: 'status',       label: '상태',       align: 'center', width: '80px',
            format: (v) => `<span class="pill pill--${STATUS_PILL[v] || 'muted'}">${v || ''}</span>` },
        ],
        mock() {
          const S = window.App && window.App.SubMatPrices;
          return S ? S.list() : [];
        },
        search: {
          cols: 3,
          conditions: [
            { value: 'all',         label: '전체' },
            { value: 'matCode',     label: '자재코드' },
            { value: 'matName',     label: '자재명' },
            { value: 'supplier',    label: '공급사' },
            { value: 'supplierContact', label: '공급사담당자' },
          ],
          advanced: [
            { name: 'category',     label: '대분류', options: ['인쇄','출력','후가공','포장','기타'] },
            { name: 'subCategory',  label: '중분류', options: ['디지털','옵셋','스페셜','포장','금박','소모품'] },
            { name: 'status',       label: '상태',   options: ['승인','대기','반려'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['matCode','matName','supplier','supplierContact','size','minorCategory']);
          rows = advFilter(rows, p);
          rows = dateFilter(rows, p, 'registeredAt');
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            const reg = e.target.closest('[data-action-key="register-submatprice"]');
            if (reg) {
              if (window.App && window.App.openSubMatPriceAdjustOC) {
                window.App.openSubMatPriceAdjustOC(null, { onChange: () => refresh() });
              }
              return;
            }
            // 변경이력 카운트 클릭 → 단가 상세(단가 이력 카드) 노출
            const hist = e.target.closest('[data-submatprice-hist]');
            if (hist) {
              const r = window.App.SubMatPrices.get(hist.dataset.submatpriceHist);
              if (r && window.App.openSubMatPriceDetailOC) {
                window.App.openSubMatPriceDetailOC(r, { onChange: () => refresh() });
              }
              return;
            }
            const dt = e.target.closest('[data-submatprice-detail]');
            if (dt) {
              const r = window.App.SubMatPrices.get(dt.dataset.submatpriceDetail);
              if (r && window.App.openSubMatPriceDetailOC) {
                window.App.openSubMatPriceDetailOC(r, { onChange: () => refresh() });
              }
              return;
            }
          });
        },
      };
    })(),

    /* ---------- 전자결재: 수신/참조 ---------- */
    'apr-ref': (function buildRefSchema() {
      const STATE_KIND = { '진행중':'info', '완료':'success', '반려':'danger' };
      const STAGE_KIND = { '결재':'success', '대기':'warning', '반려':'danger', '-':'muted' };

      function renderLineCell(row) {
        const text = (row._stages || []).map(s => `${s.name}(${s.status})`).join(' → ');
        return `<div style="display:flex; align-items:center; gap:8px;">
          <span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis;">${text}</span>
          <button type="button" class="grid__expand-btn" data-grid-expand title="결재선 상세 펼치기"><span class="caret">▸</span></button>
        </div>`;
      }

      return {
        refreshOnShow: true,
        toolbarActions: [{ label: '엑셀', icon: 'download' }],
        columns: [
          { key: 'no',         label: 'No',           align: 'center',  width: '60px' },
          { key: 'docNo',      label: '문서/요청번호', align: 'left',   width: '160px',
            format: (v) => v ? `<a class="link-code" data-ref-detail data-doc-no="${v}">${v}</a>` : '' },
          { key: 'kind',       label: '구분',         align: 'center', width: '80px',
            format: (v) => v === '시스템'
              ? `<span class="pill pill--info">시스템</span>`
              : `<span class="pill pill--muted">기안</span>` },
          { key: 'docName',    label: '문서/요청명',   align: 'center', width: '140px' },
          { key: 'title',      label: '제목',         align: 'left' },
          { key: 'myRole',     label: '내 역할',       align: 'center', width: '90px',
            format: (v) => v === '참조'
              ? `<span class="pill pill--warning">참조</span>`
              : `<span class="pill pill--success">수신</span>` },
          { key: 'status',     label: '상태',         align: 'center', width: '90px',
            format: (_, row) => `<span class="pill pill--${STATE_KIND[row.statusText] || 'muted'}">${row.statusText}</span>` },
          { key: 'drafter',     label: '기안자',       align: 'left',   width: '90px' },
          { key: 'drafterDept', label: '부서',         align: 'left',   width: '120px' },
          { key: 'draftAt',     label: '기안일시',     align: 'center', width: '170px', format: fmtYMDHM },
          { key: 'line',        label: '결재선',       align: 'left',
            format: (_, row) => renderLineCell(row) },
          { key: 'detail',      label: '상세',         align: 'center', width: '70px',
            format: (_, row) => `<button type="button" class="btn btn--xs btn--soft-primary" data-ref-detail data-doc-no="${row.docNo}">상세</button>` },
        ],
        expand(row) {
          const stages = row._stages || [];
          return `<div style="display:flex; flex-direction:column; gap:6px;">
            <div style="font-weight:var(--fw-semibold); color:var(--color-text); font-size:var(--fs-sm);">결재선 — 단계별 결재 정보</div>
            <table class="grid" style="width:auto; min-width:560px;">
              <thead>
                <tr>
                  <th style="width:60px;">단계</th>
                  <th style="width:140px;">결재자</th>
                  <th style="width:90px;">결재</th>
                  <th style="width:170px;">결재일시</th>
                  <th>의견</th>
                </tr>
              </thead>
              <tbody>
                ${stages.map((s, idx) => `
                  <tr>
                    <td class="col-center">${idx + 1}차</td>
                    <td>${s.name}</td>
                    <td class="col-center">${Pill(s.status, STAGE_KIND[s.status] || 'muted')}</td>
                    <td class="col-center">${fmtYMDHM(s.when)}</td>
                    <td>${s.comment ? String(s.comment) : '<span style="color:var(--color-text-muted);">—</span>'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>`;
        },
        mock() {
          const A = window.App && window.App.MyReferences;
          return A ? A.list() : [];
        },
        // 상세검색 영역 미사용 — 기본 검색(기간/키워드)만 유지
        search: {
          conditions: [
            { value: 'all',     label: '전체' },
            { value: 'title',   label: '제목' },
            { value: 'docNo',   label: '문서/요청번호' },
            { value: 'docName', label: '문서/요청명' },
            { value: 'drafter', label: '기안자' },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['title','docNo','docName','drafter']);
          rows = dateFilter(rows, p, 'draftAt');
          return rows;
        },
        bindActions(pageEl, refresh, getRows) {
          pageEl.addEventListener('click', (e) => {
            const t = e.target.closest('[data-ref-detail]');
            if (!t) return;
            const docNo = t.dataset.docNo;
            if (!docNo) return;
            const row = (getRows ? getRows() : []).find(r => r.docNo === docNo);
            if (window.App && window.App.openDocDetail && row) {
              window.App.openDocDetail(row, refresh, getRows, { mode: 'reference' });
            }
          });
        },
      };
    })(),

    /* ---------- 경영: 사내공지 ----------
     * App.Notices 가 단일 진실 공급원. 등록/상세 OC 는 pages.js 에서 정의.
     * 구분: 일반·긴급·장애·점검·인사·근태·규정·경조·교육·보안·급여
     * 행 클릭 또는 상세 버튼 클릭 → openNoticeDetailOC
     * 툴바 [+ 공지 등록] → openNoticeRegisterOC
     */
    'biz-notice': {
      refreshOnShow: true,
      toolbarActions: [
        { label: '엑셀', icon: 'download' },
        { label: '공지 등록', icon: 'plus', kind: 'primary', key: 'register-notice' },
      ],
      columns: [
        { key: 'no',          label: 'No',         align: 'center',  width: '60px',
          format: (v, row) => `${v ?? ''}<a data-notice-detail="${row.id}" hidden></a>` },
        { key: 'kind',        label: '구분',       align: 'center', width: '80px',
          format: (v) => {
            const map = (window.App && App.Notices && App.Notices.KIND_PILL) || {};
            return `<span class="pill pill--${map[v] || 'muted'}">${v || ''}</span>`;
          } },
        { key: 'title',       label: '제목',       align: 'left',
          format: (v, row) => {
            const pop = row.popup ? `<span class="pill pill--info" style="margin-right:6px; font-size:10px;">팝업</span>` : '';
            return `${pop}<a class="link-code" data-notice-detail="${row.id}" style="cursor:pointer; color:var(--color-text); text-decoration:none; font-weight:var(--fw-semibold);">${String(v || '').replace(/</g,'&lt;')}</a>`;
          } },
        { key: 'files',       label: '첨부파일',   align: 'center', width: '110px',
          format: (v) => {
            const n = Array.isArray(v) ? v.length : 0;
            if (!n) return '<span style="color:var(--color-text-muted);">—</span>';
            return `<span style="display:inline-flex; align-items:center; gap:4px; color:var(--color-brand-primary);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg><span style="font-weight:var(--fw-semibold);">${n}</span></span>`;
          } },
        { key: 'createdAt',   label: '등록일시',   align: 'center', width: '160px', format: fmtYMDHM },
        { key: 'createdBy',   label: '등록자',     align: 'left',   width: '120px',
          format: (v, row) => {
            const dept = row.createdDept ? `<span style="color:var(--color-text-muted); font-size:var(--fs-xs); margin-left:4px;">${String(row.createdDept).replace(/</g,'&lt;')}</span>` : '';
            return `<strong>${String(v || '').replace(/</g,'&lt;')}</strong>${dept}`;
          } },
      ],
      mock() {
        const S = window.App && window.App.Notices;
        return S ? S.list() : [];
      },
      search: {
        cols: 2,
        conditions: [
          { value: 'all',       label: '전체' },
          { value: 'title',     label: '제목' },
          { value: 'createdBy', label: '등록자' },
        ],
        advanced: [
          { name: 'kind', label: '구분',
            options: ['일반','긴급','장애','점검','인사','근태','규정','경조','교육','보안','급여'] },
        ],
      },
      filter(rows, p) {
        rows = textFilter(rows, p, ['title','content','createdBy']);
        rows = advFilter(rows, p);
        rows = dateFilter(rows, p, 'createdAt');
        return rows;
      },
      bindActions(pageEl, refresh) {
        pageEl.addEventListener('click', (e) => {
          // 툴바: 공지 등록
          const reg = e.target.closest('[data-action-key="register-notice"]');
          if (reg) {
            if (window.App && window.App.openNoticeRegisterOC) {
              window.App.openNoticeRegisterOC(() => refresh());
            }
            return;
          }
          // 행/제목/숨김 트리거 클릭 → 상세
          const dt = e.target.closest('[data-notice-detail]');
          if (dt) {
            e.preventDefault();
            const r = window.App.Notices.get(dt.dataset.noticeDetail);
            if (r && window.App.openNoticeDetailOC) {
              window.App.openNoticeDetailOC(r, { onChange: () => refresh() });
            }
            return;
          }
        });
      },
    },

    /* ---------- 경영: 기업 방문 ---------- */
    /* ---------- 경영 및 홍보 > 현황 > 기업방문 ----------
     * 사내 임직원의 타 기업 방문(전시회/비즈매칭/사업제휴/견학) 견학 내역 관리.
     * 데이터: App.BizVisits / 등록·수정: openBizVisitFormModal / 상세: openBizVisitDetailOC
     */
    'biz-visit': (function buildBizVisitSchema() {
      const fmtFileCount = (files, kind) => {
        if (!Array.isArray(files) || files.length === 0) return '<span style="color:var(--color-text-muted);">—</span>';
        return `<a class="link-code" href="javascript:;" data-bv-files="${kind}" title="클릭 시 전체 다운로드" style="color:var(--color-brand-primary); font-weight:var(--fw-semibold);">${files.length}</a>`;
      };
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '엑셀',     icon: 'download' },
          { label: '방문 등록', icon: 'plus', kind: 'primary', key: 'register-bizvisit' },
        ],
        columns: [
          { key: 'no',             label: 'No',         align: 'center',  width: '56px',
            format: (v, row) => `${v ?? ''}<a data-bv-detail="${row.id}" hidden></a>` },
          { key: 'companyName',    label: '기업명',     align: 'left',   width: '160px',
            format: (v) => `<strong>${String(v || '').replace(/</g,'&lt;')}</strong>` },
          { key: 'visitDate',      label: '방문일',     align: 'center', width: '110px', format: fmtYMD },
          { key: 'visitType',      label: '방문유형',   align: 'center', width: '90px',
            format: (v) => {
              const map = (window.App && App.BizVisits && App.BizVisits.VISIT_TYPE_PILL) || {};
              return `<span class="pill pill--${map[v] || 'muted'}">${v || ''}</span>`;
            } },
          { key: 'swContact',      label: '성원담당자', align: 'left',   width: '100px',
            format: (v) => String(v || '—').replace(/</g,'&lt;') },
          { key: 'industry',       label: '업종',       align: 'left',   width: '110px',
            format: (v) => v || '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'mainProduct',    label: '주요제품',   align: 'left',   width: '130px',
            format: (v) => v || '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'businessCard',   label: '명함',       align: 'center', width: '90px',
            format: (v) => fmtFileCount(v, 'businessCard') },
          { key: 'companyContact', label: '기업담당자', align: 'left',   width: '110px',
            format: (v) => `<strong>${String(v || '—').replace(/</g,'&lt;')}</strong>` },
          { key: 'companyPhone',   label: '기업연락처', align: 'left',   width: '160px',
            format: (v) => v ? `<span style="font-variant-numeric:tabular-nums;">${String(v).replace(/</g,'&lt;')}</span>` : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'companyLocation',label: '기업위치',   align: 'left',   width: '140px',
            format: (v) => v || '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'annualRevenue',  label: '연매출',     align: 'right',  width: '100px',
            format: (v) => v ? `<strong>${String(v).replace(/</g,'&lt;')}</strong>` : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'companySize',    label: '규모',       align: 'center', width: '90px',
            format: (v) => {
              const map = (window.App && App.BizVisits && App.BizVisits.SIZE_PILL) || {};
              return v ? `<span class="pill pill--${map[v] || 'muted'}">${v}</span>` : '<span style="color:var(--color-text-muted);">—</span>';
            } },
          { key: 'meetingContent', label: '미팅내용',   align: 'left',   width: '240px',
            format: (v) => {
              const s = String(v || '');
              if (!s) return '<span style="color:var(--color-text-muted);">—</span>';
              return `<span style="display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; line-height:1.4; font-size:var(--fs-sm);" title="${s.replace(/"/g,'&quot;')}">${s.replace(/</g,'&lt;')}</span>`;
            } },
          { key: 'reactionTemp',   label: '반응온도',   align: 'center', width: '100px',
            format: (v) => {
              const map = (window.App && App.BizVisits && App.BizVisits.REACTION_PILL) || {};
              return v ? `<span class="pill pill--${map[v] || 'muted'}">${v}</span>` : '<span style="color:var(--color-text-muted);">—</span>';
            } },
          { key: 'meetingResult',  label: '미팅결과',   align: 'center', width: '90px',
            format: (v) => {
              const map = (window.App && App.BizVisits && App.BizVisits.RESULT_PILL) || {};
              return v ? `<span class="pill pill--${map[v] || 'muted'}">${v}</span>` : '<span style="color:var(--color-text-muted);">—</span>';
            } },
          { key: 'importance',     label: '중요도',     align: 'center', width: '70px',
            format: (v) => {
              const map = (window.App && App.BizVisits && App.BizVisits.IMPORTANCE_PILL) || {};
              return v ? `<span class="pill pill--${map[v] || 'muted'}" style="font-weight:var(--fw-bold);">${v}</span>` : '<span style="color:var(--color-text-muted);">—</span>';
            } },
          { key: 'files',          label: '첨부파일',   align: 'center', width: '100px',
            format: (v) => fmtFileCount(v, 'files') },
          { key: 'remarks',        label: '비고',       align: 'left',   width: '160px',
            format: (v) => {
              const s = String(v || '');
              if (!s) return '<span style="color:var(--color-text-muted);">—</span>';
              return `<span style="font-size:var(--fs-sm); color:var(--color-text-sub);" title="${s.replace(/"/g,'&quot;')}">${s.length > 24 ? s.slice(0, 24) + '…' : s}</span>`;
            } },
        ],
        mock() {
          const S = window.App && window.App.BizVisits;
          return S ? S.list() : [];
        },
        search: {
          cols: 4,
          conditions: [
            { value: 'all',            label: '전체' },
            { value: 'companyName',    label: '기업명' },
            { value: 'companyContact', label: '기업담당자' },
            { value: 'swContact',      label: '성원담당자' },
            { value: 'mainProduct',    label: '주요제품' },
            { value: 'industry',       label: '업종' },
          ],
          advanced: [
            { name: 'visitType',     label: '방문유형', options: ['전시회','비즈매칭','사업제휴','견학','벤치마킹','계약체결','기타'] },
            { name: 'companySize',   label: '규모',     options: ['대기업','중견기업','중소기업','소상공인','스타트업'] },
            { name: 'reactionTemp',  label: '반응온도', options: ['매우긍정적','긍정적','보통','부정적','매우부정적'] },
            { name: 'meetingResult', label: '미팅결과', options: ['계약','협력','추가미팅','보류','거절'] },
            { name: 'importance',    label: '중요도',   options: ['S','A','B','C','D'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['companyName','companyContact','swContact','industry','mainProduct','companyLocation','meetingContent']);
          rows = advFilter(rows, p);
          rows = dateFilter(rows, p, 'visitDate');
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            // 툴바: 방문 등록
            const reg = e.target.closest('[data-action-key="register-bizvisit"]');
            if (reg) {
              if (window.App && window.App.openBizVisitFormModal) {
                window.App.openBizVisitFormModal(null, { onChange: () => refresh() });
              }
              return;
            }
            // 명함 / 첨부파일 숫자 카운트 클릭 → 해당 파일 전체 다운로드
            const fileLink = e.target.closest('[data-bv-files]');
            if (fileLink) {
              e.preventDefault();
              e.stopPropagation();
              const tr = fileLink.closest('tr[data-row-idx]');
              const dt = tr ? tr.querySelector('[data-bv-detail]') : null;
              if (!dt || !window.App || !window.App.BizVisits) return;
              const r = window.App.BizVisits.get(dt.dataset.bvDetail);
              if (!r) return;
              const kind = fileLink.dataset.bvFiles;
              const files = Array.isArray(r[kind]) ? r[kind] : [];
              if (!files.length || typeof App.downloadFile !== 'function') return;
              const ctx = kind === 'businessCard' ? '기업방문 명함' : '기업방문 첨부파일';
              files.forEach(f => App.downloadFile(f.name, { context: ctx }));
              return;
            }
            // 상세
            const dt = e.target.closest('[data-bv-detail]');
            if (dt) {
              e.preventDefault();
              const r = window.App.BizVisits.get(dt.dataset.bvDetail);
              if (r && window.App.openBizVisitDetailOC) {
                window.App.openBizVisitDetailOC(r, { onChange: () => refresh() });
              }
              return;
            }
          });
        },
      };
    })(),

    /* ---------- 경영 및 홍보 > 현황 > 기획물 ----------
     * 사내 제작 기획물 관리: 언제(제작일), 누가(진행부서/담당자), 무엇을(대분류·소분류·제작사·최종파일),
     * 어떤 목적으로(목적), 어떻게 사용(사용처) 했는지를 한 행에 압축.
     * 데이터: App.BizPlans / 등록·수정: openBizPlanFormModal / 상세: openBizPlanDetailOC
     */
    'biz-plan': (function buildBizPlanSchema() {
      const CATEGORY_PILL = {
        '사내 인쇄물': 'info',
        '사내 제작물': 'success',
        '외주 디자인': 'warning',
        '고객사 접대': 'danger',
        '기타':       'muted',
      };
      const fmtFileCount = (files, kind) => {
        if (!Array.isArray(files) || files.length === 0) return '<span style="color:var(--color-text-muted);">—</span>';
        return `<a class="link-code" href="javascript:;" data-bp-files="${kind}" title="클릭 시 전체 다운로드" style="color:var(--color-brand-primary); font-weight:var(--fw-semibold);">${files.length}</a>`;
      };
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '엑셀',       icon: 'download' },
          { label: '기획물 등록', icon: 'plus', kind: 'primary', key: 'register-bizplan' },
        ],
        columns: [
          { key: 'no',           label: 'No',         align: 'center',  width: '56px',
            format: (v, row) => `${v ?? ''}<a data-bp-detail="${row.id}" hidden></a>` },
          { key: 'category',     label: '대분류',     align: 'center', width: '110px',
            format: (v) => v ? `<span class="pill pill--${CATEGORY_PILL[v] || 'muted'}">${String(v).replace(/</g,'&lt;')}</span>` : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'subCategory',  label: '소분류',     align: 'left',   width: '120px',
            format: (v) => v ? `<strong>${String(v).replace(/</g,'&lt;')}</strong>` : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'producer',     label: '제작사',     align: 'left',   width: '130px',
            format: (v) => v || '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'deptName',     label: '진행부서',   align: 'left',   width: '110px',
            format: (v) => v || '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'owner',        label: '담당자',     align: 'left',   width: '100px',
            format: (v) => `<strong>${String(v || '—').replace(/</g,'&lt;')}</strong>` },
          { key: 'finalFiles',   label: '최종파일',   align: 'center', width: '90px',
            format: (v) => fmtFileCount(v, 'finalFiles') },
          { key: 'productDate',  label: '제작일',     align: 'center', width: '100px', format: fmtYMD },
          { key: 'purpose',      label: '목적',       align: 'left',   width: '200px',
            format: (v) => {
              const s = String(v || '');
              if (!s) return '<span style="color:var(--color-text-muted);">—</span>';
              return `<span style="display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; line-height:1.4; font-size:var(--fs-sm);" title="${s.replace(/"/g,'&quot;')}">${s.replace(/</g,'&lt;')}</span>`;
            } },
          { key: 'usedAt',       label: '사용처',     align: 'left',   width: '160px',
            format: (v) => v ? String(v).replace(/</g,'&lt;') : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'memo',         label: '메모',       align: 'left',   width: '160px',
            format: (v) => {
              const s = String(v || '');
              if (!s) return '<span style="color:var(--color-text-muted);">—</span>';
              return `<span style="font-size:var(--fs-sm); color:var(--color-text-sub);" title="${s.replace(/"/g,'&quot;')}">${s.length > 24 ? s.slice(0, 24) + '…' : s}</span>`;
            } },
        ],
        mock() {
          const S = window.App && window.App.BizPlans;
          return S ? S.list() : [];
        },
        search: {
          cols: 4,
          dateColumns: [{ key: 'productDate', label: '제작일' }],
          conditions: [
            { value: 'all',         label: '전체' },
            { value: 'subCategory', label: '소분류' },
            { value: 'producer',    label: '제작사' },
            { value: 'owner',       label: '담당자' },
            { value: 'purpose',     label: '목적' },
            { value: 'usedAt',      label: '사용처' },
          ],
          advanced: [
            { name: 'category',  label: '대분류',   options: ['사내 인쇄물','사내 제작물','외주 디자인','고객사 접대','기타'] },
            { name: 'deptName',  label: '진행부서', options: [
              '임원실','감사','경영지원본부','회계팀','인사총무팀','자산관리팀',
              'MVP개발부','MVP2개발부','홍보팀',
              '고객지원본부','CS파트','고객지원파트','접수팀','디자인파트','접수파트-재택','영업파트',
              'MD팀','구매팀','VIP관리팀','영업팀','생산연구소',
              '생산본부','출고팀','프로젝트팀',
              'IT연구소','개발1팀','개발2팀','개발3팀','개발4팀','인프라운영파트',
            ] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['subCategory','producer','deptName','owner','purpose','usedAt','memo','category']);
          rows = advFilter(rows, p);
          rows = dateFilter(rows, p, 'productDate');
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            // 툴바: 기획물 등록
            const reg = e.target.closest('[data-action-key="register-bizplan"]');
            if (reg) {
              if (window.App && window.App.openBizPlanFormModal) {
                window.App.openBizPlanFormModal(null, { onChange: () => refresh() });
              }
              return;
            }
            // 최종파일 숫자 카운트 클릭 → 전체 다운로드
            const fileLink = e.target.closest('[data-bp-files]');
            if (fileLink) {
              e.preventDefault();
              e.stopPropagation();
              const tr = fileLink.closest('tr[data-row-idx]');
              const dt = tr ? tr.querySelector('[data-bp-detail]') : null;
              if (!dt || !window.App || !window.App.BizPlans) return;
              const r = window.App.BizPlans.get(dt.dataset.bpDetail);
              if (!r) return;
              const kind = fileLink.dataset.bpFiles;
              const files = Array.isArray(r[kind]) ? r[kind] : [];
              if (!files.length || typeof App.downloadFile !== 'function') return;
              files.forEach(f => App.downloadFile(f.name, { context: '기획물 최종파일' }));
              return;
            }
            // 상세 OC 진입
            const dt = e.target.closest('[data-bp-detail]');
            if (dt) {
              e.preventDefault();
              const r = window.App.BizPlans.get(dt.dataset.bpDetail);
              if (r && window.App.openBizPlanDetailOC) {
                window.App.openBizPlanDetailOC(r, { onChange: () => refresh() });
              }
              return;
            }
          });
        },
      };
    })(),

    /* ---------- 경영 및 홍보 > 현황 > 사건사고 ----------
     * 회사 내 사건사고 (산업재해·시설사고·차량사고·보안 등) 등록·관리.
     * 컬럼: No / 제목 / 사건유형 / 소속 / 부서 / 이름 / 발생일시 / 발생장소 /
     *       사건경위 / 발생원인 / 대응계획 / 처리유형 / 첨부파일 / 메모
     * 데이터: App.BizIncidents / 등록·수정: openBizIncidentFormModal / 상세: openBizIncidentDetailOC
     */
    'biz-incident': (function buildBizIncidentSchema() {
      // 발생 원인 → pill 색상 (도메인 표준: 사람 실수=danger / 설비·시설=warning / 환경·외부=info·muted / 관리=warning)
      const CAUSE_PILL = {
        '본인 부주의':      'danger',
        '안전수칙 미준수':  'danger',
        '기계 결함':        'warning',
        '시설 노후':        'warning',
        '환경 요인':        'info',
        '외부 요인':        'muted',
        '관리 소홀':        'warning',
        '기타':             'muted',
      };
      const fmtFileCount = (files) => {
        if (!Array.isArray(files) || files.length === 0) return '<span style="color:var(--color-text-muted);">—</span>';
        return `<a class="link-code" href="javascript:;" data-bi-files title="클릭 시 전체 다운로드" style="color:var(--color-brand-primary); font-weight:var(--fw-semibold);">${files.length}</a>`;
      };
      // 2-line clamp (그리드 행 높이 일관성 — pre-line 금지)
      const clamp2 = (s) => {
        const str = String(s || '');
        if (!str) return '<span style="color:var(--color-text-muted);">—</span>';
        // 줄바꿈을 공백으로 치환해서 한 줄로 만든 다음 2줄 clamp — 행 높이가 데이터에 따라 들쭉날쭉하지 않게.
        const flat = str.replace(/\n+/g, ' · ');
        return `<span style="display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; line-height:1.45; font-size:var(--fs-sm);" title="${str.replace(/"/g,'&quot;')}">${flat.replace(/</g,'&lt;')}</span>`;
      };
      // 소속/부서 — 괄호 안 부속 정보는 muted 색으로 시각 계층 분리 (예: "도금사(굿스텝스)" → "도금사" 강조 + "(굿스텝스)" 흐림)
      const fmtWithParen = (v) => {
        if (!v) return '<span style="color:var(--color-text-muted);">—</span>';
        const s = String(v);
        const m = s.match(/^([^(]+)(\([^)]+\))(.*)$/);
        if (!m) return s.replace(/</g,'&lt;');
        return `${m[1].replace(/</g,'&lt;')}<span style="color:var(--color-text-muted); font-size:var(--fs-xs);"> ${m[2].replace(/</g,'&lt;')}</span>${m[3].replace(/</g,'&lt;')}`;
      };
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '엑셀',       icon: 'download' },
          { label: '사건사고 등록', icon: 'plus', kind: 'primary', key: 'register-bizincident' },
        ],
        columns: [
          { key: 'no',           label: 'No',       align: 'center',  width: '56px',
            format: (v, row) => `${v ?? ''}<a data-bi-detail="${row.id}" hidden></a>` },
          { key: 'title',        label: '제목',     align: 'left',   width: '260px',
            format: (v) => {
              const s = String(v || '');
              if (!s) return '<span style="color:var(--color-text-muted);">—</span>';
              return `<strong style="display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; line-height:1.4;" title="${s.replace(/"/g,'&quot;')}">${s.replace(/</g,'&lt;')}</strong>`;
            } },
          { key: 'incidentType', label: '사건유형', align: 'center', width: '130px',
            format: (v) => {
              const map = (window.App && App.BizIncidents && App.BizIncidents.INCIDENT_TYPE_PILL) || {};
              return v ? `<span class="pill pill--${map[v] || 'muted'}">${String(v).replace(/</g,'&lt;')}</span>` : '<span style="color:var(--color-text-muted);">—</span>';
            } },
          { key: 'affiliation',  label: '소속',     align: 'left',   width: '150px',
            format: fmtWithParen },
          { key: 'deptName',     label: '부서',     align: 'left',   width: '150px',
            format: fmtWithParen },
          { key: 'personName',   label: '이름',     align: 'left',   width: '90px',
            format: (v) => `<strong>${String(v || '—').replace(/</g,'&lt;')}</strong>` },
          { key: 'occurredAt',   label: '발생일시', align: 'center', width: '150px', format: fmtYMDHM },
          { key: 'location',     label: '발생 장소', align: 'left',   width: '120px',
            format: (v) => v ? `<strong style="color:var(--color-brand-primary);">${String(v).replace(/</g,'&lt;')}</strong>` : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'circumstances',label: '사건 경위', align: 'left',   width: '220px',
            format: (v) => clamp2(v) },
          { key: 'cause',        label: '발생 원인', align: 'center', width: '120px',
            format: (v) => v ? `<span class="pill pill--${CAUSE_PILL[v] || 'muted'}">${String(v).replace(/</g,'&lt;')}</span>` : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'responsePlan', label: '대응 계획', align: 'left',   width: '280px',
            format: (v) => clamp2(v) },
          { key: 'processType',  label: '처리유형', align: 'center', width: '100px',
            format: (v) => {
              const map = (window.App && App.BizIncidents && App.BizIncidents.PROCESS_TYPE_PILL) || {};
              return v ? `<span class="pill pill--${map[v] || 'muted'}">${String(v).replace(/</g,'&lt;')}</span>` : '<span style="color:var(--color-text-muted);">—</span>';
            } },
          { key: 'files',        label: '첨부파일', align: 'center', width: '90px',
            format: (v) => fmtFileCount(v) },
          { key: 'memo',         label: '메모',     align: 'left',   width: '170px',
            format: (v) => {
              const s = String(v || '');
              if (!s) return '<span style="color:var(--color-text-muted);">—</span>';
              return `<span style="font-size:var(--fs-sm); color:var(--color-text-sub);" title="${s.replace(/"/g,'&quot;')}">${s.length > 26 ? s.slice(0, 26) + '…' : s}</span>`;
            } },
        ],
        mock() {
          const S = window.App && window.App.BizIncidents;
          return S ? S.list() : [];
        },
        search: {
          cols: 4,
          dateColumns: [{ key: 'occurredAt', label: '발생일시' }],
          conditions: [
            { value: 'all',         label: '전체' },
            { value: 'title',       label: '제목' },
            { value: 'affiliation', label: '소속' },
            { value: 'deptName',    label: '부서' },
            { value: 'personName',  label: '이름' },
            { value: 'location',    label: '발생장소' },
          ],
          advanced: [
            { name: 'incidentType', label: '사건유형',
              options: ['자사 직원 부상','도급업체 직원 부상','시설 사고','화재','차량 사고','보안 사고','환경 사고','기타'] },
            { name: 'cause',        label: '발생원인',
              options: ['본인 부주의','안전수칙 미준수','기계 결함','시설 노후','환경 요인','외부 요인','관리 소홀','기타'] },
            { name: 'processType',  label: '처리유형',
              options: ['산재신청','보험처리','자체처리','경찰신고','외부신고','미정'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['title','affiliation','deptName','personName','location','circumstances','responsePlan','memo']);
          rows = advFilter(rows, p);
          rows = dateFilter(rows, p, 'occurredAt');
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            // 툴바: 사건사고 등록
            const reg = e.target.closest('[data-action-key="register-bizincident"]');
            if (reg) {
              if (window.App && window.App.openBizIncidentFormModal) {
                window.App.openBizIncidentFormModal(null, { onChange: () => refresh() });
              }
              return;
            }
            // 첨부파일 숫자 카운트 클릭 → 전체 다운로드
            const fileLink = e.target.closest('[data-bi-files]');
            if (fileLink) {
              e.preventDefault();
              e.stopPropagation();
              const tr = fileLink.closest('tr[data-row-idx]');
              const dt = tr ? tr.querySelector('[data-bi-detail]') : null;
              if (!dt || !window.App || !window.App.BizIncidents) return;
              const r = window.App.BizIncidents.get(dt.dataset.biDetail);
              if (!r) return;
              const files = Array.isArray(r.files) ? r.files : [];
              if (!files.length || typeof App.downloadFile !== 'function') return;
              files.forEach(f => App.downloadFile(f.name, { context: '사건사고 첨부' }));
              return;
            }
            // 상세 OC 진입
            const dt = e.target.closest('[data-bi-detail]');
            if (dt) {
              e.preventDefault();
              const r = window.App.BizIncidents.get(dt.dataset.biDetail);
              if (r && window.App.openBizIncidentDetailOC) {
                window.App.openBizIncidentDetailOC(r, { onChange: () => refresh() });
              }
              return;
            }
          });
        },
      };
    })(),

    /* ---------- 경영 및 홍보 > 현황 > 산업안전 ----------
     * 산업안전보건 교육 항목의 등록·관리.
     * 핵심: 어떤 교육(구분·프로그램)을, 어디 기관 주관으로(담당기관), 어느 법인 대상(대상법인)으로,
     *       어떤 방식(방법)·어느 위탁업체(업체명·업체담당자)를 통해, 누가(성원담당자) 관리하며,
     *       마지막으로 언제(최근시행일) 몇 번째(회차) 시행했는지를 한 행에 압축.
     * 데이터: App.IndustrialSafety / 등록·수정: openSafetyFormModal / 상세: openSafetyDetailOC
     */
    'biz-safety': (function buildBizSafetySchema() {
      // 구분 → pill (법정교육=info 공식·의무 / 자체교육=success 자율)
      const CATEGORY_PILL = { '법정교육': 'info', '자체교육': 'success' };
      // 방법 → pill (집합=info / 온라인=success / 외부위탁=warning / 혼합=muted)
      const METHOD_PILL   = { '집합교육': 'info', '온라인': 'success', '외부위탁': 'warning', '혼합': 'muted' };
      // 대상법인 → pill (법인별 고정 색 — 어디서든 같은 법인은 같은 색)
      const CORP_PILL     = { '전사': 'slate', '애드피아': 'info', '애드피아몰': 'cyan', '스테이락': 'purple', '성원정': 'teal' };
      const muted = '<span style="color:var(--color-text-muted);">—</span>';
      const esc = (v) => String(v).replace(/</g, '&lt;');
      // 다중값(배열) → pill 묶음. 2개까지 노출, 초과분은 +N (행 높이 일관 유지)
      const fmtMultiPills = (arr, pillMap, fallbackKind) => {
        const list = Array.isArray(arr) ? arr : (arr ? [arr] : []);
        if (!list.length) return muted;
        const cap = 2;
        const shown = list.slice(0, cap).map(v =>
          `<span class="pill pill--${(pillMap && pillMap[v]) || fallbackKind}">${esc(v)}</span>`).join('');
        const extra = list.length > cap
          ? `<span style="color:var(--color-text-muted); font-size:var(--fs-xs);">+${list.length - cap}</span>` : '';
        const title = esc(list.join(', '));
        return `<span style="display:inline-flex; flex-wrap:wrap; gap:3px; align-items:center; justify-content:center;" title="${title}">${shown}${extra}</span>`;
      };
      // 시점 표기 — 기타(직접입력) 이면 timingEtc 우선
      const fmtTiming = (v, row) => {
        const t = (v === '기타(직접입력)') ? (row && row.timingEtc ? row.timingEtc : '기타') : v;
        return t ? `<span style="font-size:var(--fs-sm);">${esc(t)}</span>` : muted;
      };
      const fmtFileCount = (files) => {
        if (!Array.isArray(files) || files.length === 0) return muted;
        return `<a class="link-code" href="javascript:;" data-isf-files title="클릭 시 전체 다운로드" style="color:var(--color-brand-primary); font-weight:var(--fw-semibold);">${files.length}</a>`;
      };
      const clampMemo = (v) => {
        const s = String(v || '');
        if (!s) return muted;
        return `<span style="font-size:var(--fs-sm); color:var(--color-text-sub);" title="${s.replace(/"/g,'&quot;')}">${s.length > 24 ? s.slice(0, 24) + '…' : s.replace(/</g,'&lt;')}</span>`;
      };
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '엑셀',     icon: 'download' },
          { label: '교육 등록', icon: 'plus', kind: 'primary', key: 'register-safety' },
        ],
        columns: [
          { key: 'no',          label: 'No',         align: 'center', width: '56px',
            format: (v, row) => `${v ?? ''}<a data-isf-detail="${row.id}" hidden></a>` },
          { key: 'category',    label: '구분',       align: 'center', width: '90px',
            format: (v) => v ? `<span class="pill pill--${CATEGORY_PILL[v] || 'muted'}">${String(v).replace(/</g,'&lt;')}</span>` : muted },
          { key: 'program',     label: '프로그램',   align: 'left',   width: '200px', flex: true,
            format: (v) => v ? `<strong>${String(v).replace(/</g,'&lt;')}</strong>` : muted },
          { key: 'agency',      label: '담당기관',   align: 'center', width: '100px',
            format: (v) => v ? `<span class="pill pill--soft">${String(v).replace(/</g,'&lt;')}</span>` : muted },
          { key: 'targetCorp',  label: '대상법인',   align: 'center', width: '150px',
            format: (v) => fmtMultiPills(v, CORP_PILL, 'muted') },
          { key: 'targets',     label: '대상',       align: 'center', width: '150px',
            format: (v) => fmtMultiPills(v, null, 'soft') },
          { key: 'timing',      label: '시점',       align: 'center', width: '90px',
            format: fmtTiming },
          { key: 'method',      label: '방법',       align: 'center', width: '90px',
            format: (v) => v ? `<span class="pill pill--${METHOD_PILL[v] || 'muted'}">${String(v).replace(/</g,'&lt;')}</span>` : muted },
          { key: 'vendorName',  label: '업체명',     align: 'left',   width: '140px',
            format: (v) => v ? String(v).replace(/</g,'&lt;') : muted },
          { key: 'vendorOwner', label: '업체담당자', align: 'left',   width: '100px',
            format: (v) => v ? String(v).replace(/</g,'&lt;') : muted },
          { key: 'swOwner',     label: '성원담당자', align: 'left',   width: '100px',
            format: (v) => v ? `<strong>${String(v).replace(/</g,'&lt;')}</strong>` : muted },
          { key: 'lastDate',    label: '최근시행일', align: 'center', width: '110px', format: fmtYMD },
          { key: 'round',       label: '회차',       align: 'center', width: '80px',
            format: (v) => (v == null || v === '') ? muted : Number(v).toLocaleString() },
          { key: 'files',       label: '첨부파일',   align: 'center', width: '90px',
            format: (v) => fmtFileCount(v) },
          { key: 'memo',        label: '메모',       align: 'left',   width: '160px',
            format: clampMemo },
        ],
        mock() {
          const S = window.App && window.App.IndustrialSafety;
          return S ? S.list() : [];
        },
        search: {
          cols: 4,
          dateColumns: [{ key: 'lastDate', label: '최근시행일' }],
          conditions: [
            { value: 'all',         label: '전체' },
            { value: 'program',     label: '프로그램' },
            { value: 'agency',      label: '담당기관' },
            { value: 'vendorName',  label: '업체명' },
            { value: 'vendorOwner', label: '업체담당자' },
            { value: 'swOwner',     label: '성원담당자' },
          ],
          advanced: [
            { name: 'category',   label: '구분',     options: ['법정교육', '자체교육'] },
            { name: 'targetCorp', label: '대상법인', multi: true, placeholder: '전체', options: ['전사', '애드피아', '애드피아몰', '스테이락', '성원정'] },
            { name: 'targets',    label: '대상',     multi: true, placeholder: '전체', options: ['전직원', '사무직', '영업직', '생산직', '도급직', '계약직', '관리직', '신규입사자', '일용직'] },
            { name: 'method',     label: '방법',     options: ['집합교육', '온라인', '외부위탁', '혼합'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['program', 'agency', 'vendorName', 'vendorOwner', 'swOwner', 'swDept', 'memo']);
          // 대상법인·대상 은 row 값이 배열이라 advFilter 로 처리 불가 → 배열/스칼라 모두 대응하는 교집합 매칭
          const adv = p.advanced || {};
          const matchAny = (rowVal, sel) => {
            const sels = Array.isArray(sel) ? sel : (sel ? [sel] : []);
            if (!sels.length) return true;
            const rv = Array.isArray(rowVal) ? rowVal : (rowVal ? [rowVal] : []);
            return sels.some(x => rv.includes(x));
          };
          if (adv.category)   rows = rows.filter(r => matchAny(r.category, adv.category));
          if (adv.method)     rows = rows.filter(r => matchAny(r.method, adv.method));
          if (adv.targetCorp) rows = rows.filter(r => matchAny(r.targetCorp, adv.targetCorp));
          if (adv.targets)    rows = rows.filter(r => matchAny(r.targets, adv.targets));
          rows = dateFilter(rows, p, 'lastDate');
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            // 툴바: 교육 등록
            const reg = e.target.closest('[data-action-key="register-safety"]');
            if (reg) {
              if (window.App && window.App.openSafetyFormModal) {
                window.App.openSafetyFormModal(null, { onChange: () => refresh() });
              }
              return;
            }
            // 첨부파일 숫자 카운트 클릭 → 전체 다운로드
            const fileLink = e.target.closest('[data-isf-files]');
            if (fileLink) {
              e.preventDefault();
              e.stopPropagation();
              const tr = fileLink.closest('tr[data-row-idx]');
              const dt = tr ? tr.querySelector('[data-isf-detail]') : null;
              if (!dt || !window.App || !window.App.IndustrialSafety) return;
              const r = window.App.IndustrialSafety.get(dt.dataset.isfDetail);
              if (!r) return;
              const files = Array.isArray(r.files) ? r.files : [];
              if (!files.length || typeof App.downloadFile !== 'function') return;
              files.forEach(f => App.downloadFile(f.name, { context: '산업안전 교육 첨부파일' }));
              return;
            }
            // 상세 OC 진입
            const dt = e.target.closest('[data-isf-detail]');
            if (dt) {
              e.preventDefault();
              const r = window.App.IndustrialSafety.get(dt.dataset.isfDetail);
              if (r && window.App.openSafetyDetailOC) {
                window.App.openSafetyDetailOC(r, { onChange: () => refresh() });
              }
              return;
            }
          });
        },
      };
    })(),

    /* ---------- 경영 및 홍보 > 자료실/문서 ----------
     * 사내 자료(산업안전·인수인계·신청서·업무협조·경위서·보고서·품의서·기타) 등록·관리.
     * 핵심: 자료를 카테고리별로 등록하고 다운받아 사용할 수 있게.
     * 데이터: App.BizArchive / 등록·수정: openBizArchiveFormModal / 상세: openBizArchiveDetailOC
     */
    'biz-archive': (function buildBizArchiveSchema() {
      const CATEGORY_PILL = {
        '산업안전': 'danger',
        '인수인계': 'info',
        '신청서':   'success',
        '업무협조': 'info',
        '경위서':   'danger',
        '보고서':   'success',
        '품의서':   'warning',
        '기타':     'muted',
      };
      const fmtFileCount = (files) => {
        if (!Array.isArray(files) || files.length === 0) return '<span style="color:var(--color-text-muted);">—</span>';
        return `<a class="link-code" href="javascript:;" data-ba-files title="클릭 시 전체 다운로드" style="color:var(--color-brand-primary); font-weight:var(--fw-semibold);">${files.length}</a>`;
      };
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '엑셀',     icon: 'download' },
          { label: '자료 등록', icon: 'plus', kind: 'primary', key: 'register-bizarchive' },
        ],
        columns: [
          { key: 'no',           label: 'No',       align: 'center',  width: '56px',
            format: (v, row) => `${v ?? ''}<a data-ba-detail="${row.id}" hidden></a>` },
          { key: 'category',     label: '카테고리', align: 'center', width: '100px',
            format: (v) => v ? `<span class="pill pill--${CATEGORY_PILL[v] || 'muted'}">${String(v).replace(/</g,'&lt;')}</span>` : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'title',        label: '제목',     align: 'left',   width: '320px',
            format: (v) => `<strong>${String(v || '').replace(/</g,'&lt;')}</strong>` },
          { key: 'files',        label: '파일',     align: 'center', width: '80px',
            format: (v) => fmtFileCount(v) },
          { key: 'registeredBy', label: '등록자',   align: 'left',   width: '90px',
            format: (v) => String(v || '—').replace(/</g,'&lt;') },
          { key: 'registeredAt', label: '등록일시', align: 'center', width: '150px', format: fmtYMDHM },
        ],
        mock() {
          const S = window.App && window.App.BizArchive;
          return S ? S.list() : [];
        },
        search: {
          cols: 3,
          dateColumns: [{ key: 'registeredAt', label: '등록일시' }],
          conditions: [
            { value: 'all',          label: '전체' },
            { value: 'title',        label: '제목' },
            { value: 'registeredBy', label: '등록자' },
          ],
          advanced: [
            { name: 'category', label: '카테고리', options: ['산업안전','인수인계','신청서','업무협조','경위서','보고서','품의서','기타'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['title','registeredBy','category']);
          rows = advFilter(rows, p);
          rows = dateFilter(rows, p, 'registeredAt');
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            // 툴바: 자료 등록
            const reg = e.target.closest('[data-action-key="register-bizarchive"]');
            if (reg) {
              if (window.App && window.App.openBizArchiveFormModal) {
                window.App.openBizArchiveFormModal(null, { onChange: () => refresh() });
              }
              return;
            }
            // 파일 숫자 카운트 클릭 → 전체 다운로드
            const fileLink = e.target.closest('[data-ba-files]');
            if (fileLink) {
              e.preventDefault();
              e.stopPropagation();
              const tr = fileLink.closest('tr[data-row-idx]');
              const dt = tr ? tr.querySelector('[data-ba-detail]') : null;
              if (!dt || !window.App || !window.App.BizArchive) return;
              const r = window.App.BizArchive.get(dt.dataset.baDetail);
              if (!r) return;
              const files = Array.isArray(r.files) ? r.files : [];
              if (!files.length || typeof App.downloadFile !== 'function') return;
              files.forEach(f => App.downloadFile(f.name, { context: '자료실 첨부파일' }));
              return;
            }
            // 상세 OC 진입
            const dt = e.target.closest('[data-ba-detail]');
            if (dt) {
              e.preventDefault();
              const r = window.App.BizArchive.get(dt.dataset.baDetail);
              if (r && window.App.openBizArchiveDetailOC) {
                window.App.openBizArchiveDetailOC(r, { onChange: () => refresh() });
              }
              return;
            }
          });
        },
      };
    })(),

    /* ---------- 자산·업체 > 소모품 > 구매 신청 (본인 신청 내역 + 신청 등록) ---------- */
    'as-buy-req': (function buildSupReqSchema() {
      const STATUS_PILL = { '발주대기': 'warning', '발주완료': 'success', '발주취소': 'danger' };
      const qtyU = (v, row) => `<span style="font-variant-numeric:tabular-nums;">${(Number(v) || 0).toLocaleString()}</span> <span style="color:var(--color-text-muted); font-size:var(--fs-xs);">${row.unit || ''}</span>`;
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '엑셀', icon: 'download' },
          { label: '신청 등록', icon: 'plus', kind: 'primary', key: 'register-supreq' },
        ],
        columns: [
          { key: 'no',          label: 'No',        align: 'center', width: '60px',
            format: (v, row) => `${v ?? ''}<a data-supreq-detail="${row.id}" hidden></a>` },
          { key: 'reqNo',       label: '신청번호',  align: 'center', width: '140px',
            format: (v) => `<span style="color:var(--color-brand-primary); font-weight:var(--fw-semibold);">${v || ''}</span>` },
          { key: 'requestedAt', label: '신청일시',  align: 'center', width: '170px', format: fmtYMDHM },
          { key: 'gubun',       label: '구분',      align: 'center', width: '96px',
            format: supGubunPill },
          { key: 'type',        label: '유형',      align: 'center', width: '110px' },
          { key: 'code',        label: '품목코드',  align: 'center', width: '104px',
            format: (v) => v ? `<strong style="color:var(--color-brand-primary);">${v}</strong>` : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'name',        label: '품목명',    align: 'left',   width: '180px', flex: true },
          { key: 'qty',         label: '수량',      align: 'right',  width: '120px', format: qtyU },
          { key: 'needBy',      label: '희망일',    align: 'center', width: '104px', format: fmtYMD },
          { key: 'reason',      label: '사유',      align: 'left',   width: '120px' },
          { key: 'status',      label: '상태',      align: 'center', width: '88px',
            format: (v) => `<span class="pill pill--${STATUS_PILL[v] || 'muted'}">${v || ''}</span>` },
        ],
        mock() {
          const S = window.App && window.App.SupRequests;
          const me = window.App && window.App.currentUser;
          return (S && me) ? S.listByRequester(me.empId) : [];
        },
        search: {
          conditions: [
            { value: 'all',   label: '전체' },
            { value: 'reqNo', label: '신청번호' },
            { value: 'code',  label: '품목코드' },
            { value: 'name',  label: '품목명' },
          ],
          advanced: [
            { name: 'gubun',  label: '구분', options: (window.App && App.Consumables ? App.Consumables.gubunOptions() : ['일반소모품','사무소모품']) },
            { name: 'status', label: '상태', options: ['발주대기','발주완료','발주취소'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['reqNo','code','name','type','reason']);
          rows = advFilter(rows, p);
          rows = dateFilter(rows, p, 'requestedAt');
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            const reg = e.target.closest('[data-action-key="register-supreq"]');
            if (reg) { if (window.App.openSupRequestOC) window.App.openSupRequestOC(() => refresh()); return; }
            const dt = e.target.closest('[data-supreq-detail]');
            if (dt) { const r = window.App.SupRequests.get(dt.dataset.supreqDetail); if (r && window.App.openSupRequestDetailOC) window.App.openSupRequestDetailOC(r); }
          });
        },
      };
    })(),

    /* ---------- 자산·업체 > 소모품 > 신청 내역 (담당자 전체 조회 + 발주처리) ---------- */
    'as-buy-req-list': (function buildSupReqListSchema() {
      const STATUS_PILL = { '발주대기': 'warning', '발주완료': 'success', '발주취소': 'danger' };
      const qtyU = (v, row) => `<span style="font-variant-numeric:tabular-nums;">${(Number(v) || 0).toLocaleString()}</span> <span style="color:var(--color-text-muted); font-size:var(--fs-xs);">${row.unit || ''}</span>`;
      return {
        refreshOnShow: true,
        toolbarActions: [ { label: '엑셀', icon: 'download' } ],
        columns: [
          { key: 'no',          label: 'No',        align: 'center', width: '60px',
            format: (v, row) => `${v ?? ''}<a data-supreqlist-detail="${row.id}" hidden></a>` },
          { key: 'reqNo',       label: '신청번호',  align: 'center', width: '140px',
            format: (v) => `<span style="color:var(--color-brand-primary); font-weight:var(--fw-semibold);">${v || ''}</span>` },
          { key: 'requester',   label: '신청자',    align: 'left',   width: '110px',
            format: (v, row) => `<strong>${v || ''}</strong>${row.pos ? `<span style="color:var(--color-text-muted); font-size:var(--fs-xs); margin-left:3px;">${row.pos}</span>` : ''}` },
          { key: 'dept',        label: '부서',      align: 'center', width: '110px' },
          { key: 'requestedAt', label: '신청일시',  align: 'center', width: '160px', format: fmtYMDHM },
          { key: 'gubun',       label: '구분',      align: 'center', width: '96px',
            format: supGubunPill },
          { key: 'type',        label: '유형',      align: 'center', width: '100px' },
          { key: 'name',        label: '품목명',    align: 'left',   width: '170px', flex: true },
          { key: 'qty',         label: '수량',      align: 'right',  width: '110px', format: qtyU },
          { key: 'needBy',      label: '희망일',    align: 'center', width: '104px', format: fmtYMD },
          { key: 'reason',      label: '사유',      align: 'left',   width: '110px' },
          { key: 'status',      label: '상태',      align: 'center', width: '88px',
            format: (v) => `<span class="pill pill--${STATUS_PILL[v] || 'muted'}">${v || ''}</span>` },
        ],
        mock() { const S = window.App && window.App.SupRequests; return S ? S.list() : []; },
        search: {
          cols: 3,
          conditions: [
            { value: 'all',       label: '전체' },
            { value: 'reqNo',     label: '신청번호' },
            { value: 'requester', label: '신청자' },
            { value: 'name',      label: '품목명' },
            { value: 'dept',      label: '부서' },
          ],
          advanced: [
            { name: 'gubun',  label: '구분', options: (window.App && App.Consumables ? App.Consumables.gubunOptions() : ['일반소모품','사무소모품']) },
            { name: 'status', label: '상태', options: ['발주대기','발주완료','발주취소'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['reqNo','requester','dept','name','type','reason']);
          rows = advFilter(rows, p);
          rows = dateFilter(rows, p, 'requestedAt');
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            const dt = e.target.closest('[data-supreqlist-detail]');
            if (dt) {
              const r = window.App.SupRequests.get(dt.dataset.supreqlistDetail);
              // 담당자 모드 — 발주대기 건은 상세에서 발주 등록/신청 취소 가능
              if (r && window.App.openSupRequestDetailOC) window.App.openSupRequestDetailOC(r, { allowActions: true, onChange: () => refresh() });
            }
          });
        },
      };
    })(),

    /* ---------- 자산·업체 > 소모품 > 발주 내역 (발주대기 신청 → 발주) ---------- */
    'as-buy-po': (function buildSupPoSchema() {
      const STATUS_PILL = { '발주중': 'warning', '부분입고': 'info', '입고완료': 'success', '취소': 'danger' };
      const qtyU = (v, row) => `<span style="font-variant-numeric:tabular-nums;">${(Number(v) || 0).toLocaleString()}</span> <span style="color:var(--color-text-muted); font-size:var(--fs-xs);">${row.unit || ''}</span>`;
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '엑셀', icon: 'download' },
        ],
        columns: [
          { key: 'no',        label: 'No',        align: 'center', width: '60px',
            format: (v, row) => `${v ?? ''}<a data-suppo-detail="${row.id}" hidden></a>` },
          { key: 'poNo',      label: '발주번호',  align: 'center', width: '140px',
            format: (v) => `<span style="color:var(--color-brand-primary); font-weight:var(--fw-semibold);">${v || ''}</span>` },
          { key: 'orderedAt', label: '발주일시',  align: 'center', width: '170px', format: fmtYMDHM },
          { key: 'orderer',   label: '발주자',    align: 'left',   width: '96px' },
          { key: 'reqNo',     label: '신청번호',  align: 'center', width: '140px',
            format: (v, row) => v ? `<a class="link-code" data-suppo-req="${row.reqId || ''}" style="cursor:pointer;">${v}</a>` : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'gubun',     label: '구분',      align: 'center', width: '96px',
            format: supGubunPill },
          { key: 'type',      label: '유형',      align: 'center', width: '100px' },
          { key: 'name',      label: '품목명',    align: 'left',   width: '170px', flex: true },
          { key: 'vendor',    label: '공급사',    align: 'left',   width: '120px' },
          { key: 'qty',       label: '수량',      align: 'right',  width: '110px', format: qtyU },
          { key: 'unitPrice', label: '단가(원)',  align: 'right',  width: '100px', format: fmtMoney },
          { key: 'amount',    label: '금액(원)',  align: 'right',  width: '120px', format: (v) => `<strong>${fmtMoney(v)}</strong>` },
          { key: 'dueDate',   label: '납기일',    align: 'center', width: '104px', format: fmtYMD },
          { key: 'status',    label: '상태',      align: 'center', width: '88px',
            format: (v) => `<span class="pill pill--${STATUS_PILL[v] || 'muted'}">${v || ''}</span>` },
        ],
        mock() { const S = window.App && window.App.SupOrders; return S ? S.list() : []; },
        search: {
          cols: 3,
          conditions: [
            { value: 'all',    label: '전체' },
            { value: 'poNo',   label: '발주번호' },
            { value: 'reqNo',  label: '신청번호' },
            { value: 'name',   label: '품목명' },
            { value: 'vendor', label: '공급사' },
          ],
          advanced: [
            { name: 'gubun',  label: '구분', options: (window.App && App.Consumables ? App.Consumables.gubunOptions() : ['일반소모품','사무소모품']) },
            { name: 'status', label: '상태', options: ['발주중','부분입고','입고완료','취소'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['poNo','reqNo','orderer','name','type','vendor']);
          rows = advFilter(rows, p);
          rows = dateFilter(rows, p, 'orderedAt');
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            const reqLink = e.target.closest('[data-suppo-req]');
            if (reqLink) { e.preventDefault(); e.stopPropagation(); const r = window.App.SupRequests.get(reqLink.dataset.suppoReq); if (r && window.App.openSupRequestDetailOC) window.App.openSupRequestDetailOC(r); return; }
            const dt = e.target.closest('[data-suppo-detail]');
            if (dt) { const r = window.App.SupOrders.get(dt.dataset.suppoDetail); if (r && window.App.openSupOrderDetailOC) window.App.openSupOrderDetailOC(r, { onChange: () => refresh() }); }
          });
        },
      };
    })(),

    /* ---------- 자산·업체 > 소모품 > 업체 발주 내역 (업체가 발주 확인 → 입고정보 등록) ---------- */
    'as-buy-vendor-po': (function buildSupVendorPoSchema() {
      const IO_PILL     = { '발주중': 'warning', '부분입고': 'info', '입고완료': 'success', '취소': 'danger' };
      const qtyU = (v, row) => `<span style="font-variant-numeric:tabular-nums;">${(Number(v) || 0).toLocaleString()}</span> <span style="color:var(--color-text-muted); font-size:var(--fs-xs);">${row.unit || ''}</span>`;
      return {
        refreshOnShow: true,
        toolbarActions: [ { label: '엑셀', icon: 'download' } ],
        columns: [
          { key: 'no',        label: 'No',        align: 'center', width: '56px',
            format: (v, row) => `${v ?? ''}<a data-supvpo-detail="${row.id}" hidden></a>` },
          { key: '_io',       label: '입고정보',  align: 'center', width: '92px',
            format: (_, row) => {
              if (row.status !== '발주중' && row.status !== '부분입고') return `<span class="pill pill--${IO_PILL[row.status] || 'muted'}">${row.status}</span>`;
              // 발주중·부분입고 — 스캔 대기 레코드 있으면 입고대기 / 없으면 입고등록(부분입고는 잔량 입고)
              if (row._hasPendingInb) return `<span class="pill pill--warning" title="거래명세서 바코드 스캔 시 입고 완료">입고대기</span>`;
              return `${row.status === '부분입고' ? `<span class="pill pill--info" style="margin-right:4px;">부분입고</span>` : ''}<button type="button" class="btn btn--xs btn--soft-primary" data-supvpo-reg="${row.id}" title="${row.status === '부분입고' ? '잔량 입고 등록' : '입고정보 등록'}">입고등록</button>`;
            } },
          { key: 'poNo',      label: '발주번호',  align: 'center', width: '140px',
            format: (v) => `<span style="color:var(--color-brand-primary); font-weight:var(--fw-semibold);">${v || ''}</span>` },
          { key: 'orderedAt', label: '발주일시',  align: 'center', width: '160px', format: fmtYMDHM },
          { key: 'orderer',   label: '발주담당자', align: 'center', width: '100px' },
          { key: 'vendor',    label: '공급사',    align: 'left',   width: '120px' },
          { key: 'gubun',     label: '구분',      align: 'center', width: '96px',
            format: supGubunPill },
          { key: 'name',      label: '품목명',    align: 'left',   width: '170px', flex: true },
          { key: 'qty',       label: '수량',      align: 'right',  width: '100px', format: qtyU },
          { key: 'unitPrice', label: '단가(원)',  align: 'right',  width: '100px', format: fmtMoney },
          { key: 'amount',    label: '금액(원)',  align: 'right',  width: '120px', format: (v) => `<strong>${fmtMoney(v)}</strong>` },
          { key: 'expectedAt',label: '입고예정일시', align: 'center', width: '150px',
            format: (v) => v ? fmtYMDHM(v) : '<span style="color:var(--color-text-muted);">미등록</span>' },
          { key: 'inLocation',label: '입고위치',  align: 'center', width: '100px',
            format: (v) => v ? v : '<span style="color:var(--color-text-muted);">-</span>' },
          { key: 'deliveryMethod', label: '배송방법', align: 'center', width: '96px',
            format: (v) => v ? v : '<span style="color:var(--color-text-muted);">-</span>' },
          { key: 'actualAt',  label: '실제입고일시', align: 'center', width: '150px',
            format: (v) => v ? fmtYMDHM(v) : '<span style="color:var(--color-text-muted);">-</span>' },
          { key: 'delayText', label: '지연현황',  align: 'center', width: '104px',
            format: (v, row) => v ? `<span class="pill pill--${row.delayKind || 'muted'}">${v}</span>` : '<span style="color:var(--color-text-muted);">-</span>' },
        ],
        mock() {
          const O = window.App && window.App.SupOrders;
          const I = window.App && window.App.SupInbounds;
          if (!O) return [];
          const inbs = I ? I.list() : [];
          const rows = O.list().map(po => {
            const inb = inbs.find(x => x.poId === po.id && x.actualAt) || inbs.find(x => x.poId === po.id) || null;
            return Object.assign({}, po, {
              _hasPendingInb: inbs.some(x => x.poId === po.id && !x.actualAt),   // 스캔 대기 레코드 존재 여부
              expectedAt:     inb ? inb.expectedAt : '',
              inLocation:     inb ? inb.inLocation : '',
              deliveryMethod: inb ? inb.deliveryMethod : '',
              actualAt:       inb ? inb.actualAt : null,
              delayText:  inb ? inb.delayText : '', delayKind: inb ? inb.delayKind : 'muted',
            });
          });
          rows.forEach((r, i) => r.no = rows.length - i);   // No 내림차순
          return rows;
        },
        search: {
          cols: 3,
          conditions: [
            { value: 'all',    label: '전체' },
            { value: 'poNo',   label: '발주번호' },
            { value: 'vendor', label: '공급사' },
            { value: 'name',   label: '품목명' },
          ],
          advanced: [
            { name: 'vendor', label: '공급사', options: (window.App && App.SupOrders ? App.SupOrders.VENDORS : []) },
            { name: 'status', label: '상태',   options: ['발주중','부분입고','입고완료','취소'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['poNo','vendor','name']);
          rows = advFilter(rows, p);
          rows = dateFilter(rows, p, 'orderedAt');
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            const reg = e.target.closest('[data-supvpo-reg]');
            if (reg) {
              e.preventDefault(); e.stopPropagation();
              if (window.App.openSupInboundAddOC) window.App.openSupInboundAddOC(() => refresh(), reg.dataset.supvpoReg);
              return;
            }
            const dt = e.target.closest('[data-supvpo-detail]');
            if (dt) {
              // 상세 = 거래명세서 (발주·입고 정보 + 명세서/바코드 스캔으로 실제입고 등록)
              if (window.App.openSupTransactionModal) window.App.openSupTransactionModal(dt.dataset.supvpoDetail, { onChange: () => refresh() });
              else { const r = window.App.SupOrders.get(dt.dataset.supvpoDetail); if (r && window.App.openSupOrderDetailOC) window.App.openSupOrderDetailOC(r, { onChange: () => refresh() }); }
            }
          });
        },
      };
    })(),

    /* ---------- 자산·업체 > 소모품 > 입고 조회 (발주중 PO → 입고, 재고 +) ---------- */
    'as-io-in': (function buildSupInSchema() {
      const qtyU = (v, row) => `<span style="font-variant-numeric:tabular-nums;">${(Number(v) || 0).toLocaleString()}</span> <span style="color:var(--color-text-muted); font-size:var(--fs-xs);">${row.unit || ''}</span>`;
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '엑셀', icon: 'download' },
        ],
        columns: [
          { key: 'no',         label: 'No',          align: 'center', width: '56px',
            format: (v, row) => `${v ?? ''}<a data-supin-detail="${row.id}" hidden></a>` },
          { key: 'inNo',       label: '입고번호',     align: 'center', width: '140px',
            format: (v) => `<span style="color:var(--color-brand-primary); font-weight:var(--fw-semibold);">${v || ''}</span>` },
          { key: 'poNo',       label: '발주번호',     align: 'center', width: '140px',
            format: (v, row) => v ? `<a class="link-code" data-supin-po="${row.poId || ''}" style="cursor:pointer;">${v}</a>` : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'vendor',        label: '공급사',       align: 'left',   width: '120px' },
          { key: 'vendorManager', label: '공급사 담당자', align: 'center', width: '100px',
            format: (v) => v ? v : '<span style="color:var(--color-text-muted);">-</span>' },
          { key: 'gubun',      label: '구분',         align: 'center', width: '96px',
            format: supGubunPill },
          { key: 'name',       label: '품목명',       align: 'left',   width: '180px', flex: true },
          { key: 'qty',        label: '발주수량',     align: 'right',  width: '110px', format: qtyU },
          { key: 'orderer',    label: '발주담당자',   align: 'center', width: '100px',
            format: (v) => v ? v : '<span style="color:var(--color-text-muted);">-</span>' },
          { key: 'orderedAt',  label: '발주일시',     align: 'center', width: '160px', format: fmtYMDHM },
          { key: 'inQty',      label: '입고수량',     align: 'right',  width: '110px',
            format: (v, row) => v == null ? '<span style="color:var(--color-text-muted);">—</span>' : `<strong style="font-variant-numeric:tabular-nums;">${(Number(v) || 0).toLocaleString()}</strong> <span style="color:var(--color-text-muted); font-size:var(--fs-xs);">${row.unit || ''}</span>` },
          { key: 'inLocation', label: '입고장소',     align: 'center', width: '120px' },
          { key: 'expectedAt', label: '입고예정일시', align: 'center', width: '160px', format: fmtYMDHM },
          { key: 'actualAt',   label: '실제입고일시', align: 'center', width: '160px',
            format: (v) => v ? fmtYMDHM(v) : '<span style="color:var(--color-text-muted);">미입고</span>' },
          { key: 'delayText',  label: '지연현황',     align: 'center', width: '104px',
            format: (_, row) => `<span class="pill pill--${row.delayKind || 'muted'}">${row.delayText || '—'}</span>` },
          { key: 'barcode',    label: '바코드',       align: 'center', width: '150px',
            format: (v) => v ? `<span style="font-size:var(--fs-xs); color:var(--color-brand-primary);">${v}</span>` : '<span style="color:var(--color-text-muted);">—</span>' },
        ],
        mock() { const S = window.App && window.App.SupInbounds; return S ? S.list() : []; },
        search: {
          cols: 3,
          conditions: [
            { value: 'all',     label: '전체' },
            { value: 'inNo',    label: '입고번호' },
            { value: 'poNo',    label: '발주번호' },
            { value: 'vendor',  label: '공급사' },
            { value: 'name',    label: '품목명' },
            { value: 'barcode', label: '바코드' },
          ],
          advanced: [
            { name: 'gubun',      label: '구분',     options: (window.App && App.Consumables ? App.Consumables.gubunOptions() : ['일반소모품','사무소모품']) },
            { name: 'inLocation', label: '입고장소', options: (window.App && App.SupInbounds ? App.SupInbounds.LOCATIONS : []) },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['inNo','poNo','vendor','vendorManager','orderer','name','barcode']);
          rows = advFilter(rows, p);
          rows = dateFilter(rows, p, 'expectedAt');
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            const poLink = e.target.closest('[data-supin-po]');
            if (poLink) { e.preventDefault(); e.stopPropagation(); const r = window.App.SupOrders.get(poLink.dataset.supinPo); if (r && window.App.openSupOrderDetailOC) window.App.openSupOrderDetailOC(r); return; }
            const dt = e.target.closest('[data-supin-detail]');
            if (dt) { const r = window.App.SupInbounds.get(dt.dataset.supinDetail); if (r && window.App.openSupInboundDetailOC) window.App.openSupInboundDetailOC(r, { onChange: () => refresh() }); }
          });
        },
      };
    })(),

    /* ---------- 자산·업체 > 소모품 > 출고 내역 (재고 → 출고, 재고 −) ---------- */
    'as-io-out': (function buildSupOutSchema() {
      const REASON_PILL = { '사용': 'success', '지급': 'info', '폐기': 'danger', '기타': 'muted' };
      const STATUS_PILL = { '출고완료': 'success', '취소': 'danger' };
      const qtyU = (v, row) => `<span style="font-variant-numeric:tabular-nums;">${(Number(v) || 0).toLocaleString()}</span> <span style="color:var(--color-text-muted); font-size:var(--fs-xs);">${row.unit || ''}</span>`;
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '엑셀', icon: 'download' },
          { label: '출고 등록', icon: 'plus', kind: 'primary', key: 'register-supout' },
        ],
        columns: [
          { key: 'no',           label: 'No',        align: 'center', width: '56px',
            format: (v, row) => `${v ?? ''}<a data-supout-detail="${row.id}" hidden></a>` },
          { key: 'outNo',        label: '출고번호',  align: 'center', width: '140px',
            format: (v) => `<span style="color:var(--color-brand-primary); font-weight:var(--fw-semibold);">${v || ''}</span>` },
          { key: 'outAt',        label: '출고일시',  align: 'center', width: '170px', format: fmtYMDHM },
          { key: 'gubun',        label: '구분',      align: 'center', width: '96px',
            format: supGubunPill },
          { key: 'type',         label: '유형',      align: 'center', width: '100px' },
          { key: 'name',         label: '품목명',    align: 'left',   width: '180px', flex: true },
          { key: 'outQty',       label: '출고수량',  align: 'right',  width: '110px', format: qtyU },
          { key: 'reason',       label: '출고사유',  align: 'center', width: '84px',
            format: (v) => `<span class="pill pill--${REASON_PILL[v] || 'muted'}">${v || ''}</span>` },
          { key: 'destination',  label: '수령부서',  align: 'center', width: '120px' },
          { key: 'receiver',     label: '수령자',    align: 'left',   width: '90px',
            format: (v) => v ? v : '<span style="color:var(--color-text-muted);">-</span>' },
          { key: 'handler',      label: '담당자',    align: 'center', width: '90px' },
          { key: 'stockLocation',label: '재고장소',  align: 'center', width: '120px' },
          { key: 'status',       label: '상태',      align: 'center', width: '88px',
            format: (v) => `<span class="pill pill--${STATUS_PILL[v] || 'muted'}">${v || ''}</span>` },
        ],
        mock() { const S = window.App && window.App.SupOutbounds; return S ? S.list() : []; },
        search: {
          cols: 3,
          conditions: [
            { value: 'all',     label: '전체' },
            { value: 'outNo',   label: '출고번호' },
            { value: 'name',    label: '품목명' },
            { value: 'handler', label: '담당자' },
          ],
          advanced: [
            { name: 'gubun',  label: '구분',     options: (window.App && App.Consumables ? App.Consumables.gubunOptions() : ['일반소모품','사무소모품']) },
            { name: 'reason', label: '출고사유', options: ['사용','지급','폐기','기타'] },
            { name: 'status', label: '상태',     options: ['출고완료','취소'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['outNo','name','type','handler','destination','receiver']);
          rows = advFilter(rows, p);
          rows = dateFilter(rows, p, 'outAt');
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            const reg = e.target.closest('[data-action-key="register-supout"]');
            if (reg) { if (window.App.openSupOutboundRegisterOC) window.App.openSupOutboundRegisterOC(() => refresh()); return; }
            const dt = e.target.closest('[data-supout-detail]');
            if (dt) { const r = window.App.SupOutbounds.get(dt.dataset.supoutDetail); if (r && window.App.openSupOutboundDetailOC) window.App.openSupOutboundDetailOC(r, { onChange: () => refresh() }); }
          });
        },
      };
    })(),

    /* ---------- 자산·업체 > 소모품 > 출고 신청 (본인 신청 내역 + 신청 등록) ---------- */
    'as-out-req': (function buildSupOutReqSchema() {
      const STATUS_PILL = { '출고대기': 'warning', '출고완료': 'success', '신청취소': 'danger' };
      const qtyU = (v, row) => `<span style="font-variant-numeric:tabular-nums;">${(Number(v) || 0).toLocaleString()}</span> <span style="color:var(--color-text-muted); font-size:var(--fs-xs);">${row.unit || ''}</span>`;
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '엑셀', icon: 'download' },
          { label: '신청 등록', icon: 'plus', kind: 'primary', key: 'register-supoutreq' },
        ],
        columns: [
          { key: 'no',          label: 'No',        align: 'center', width: '60px',
            format: (v, row) => `${v ?? ''}<a data-supoutreq-detail="${row.id}" hidden></a>` },
          { key: 'reqNo',       label: '신청번호',  align: 'center', width: '150px',
            format: (v) => `<span style="color:var(--color-brand-primary); font-weight:var(--fw-semibold);">${v || ''}</span>` },
          { key: 'requestedAt', label: '신청일시',  align: 'center', width: '170px', format: fmtYMDHM },
          { key: 'gubun',       label: '구분',      align: 'center', width: '96px', format: supGubunPill },
          { key: 'type',        label: '유형',      align: 'center', width: '110px' },
          { key: 'code',        label: '품목코드',  align: 'center', width: '104px',
            format: (v) => v ? `<strong style="color:var(--color-brand-primary);">${v}</strong>` : '<span style="color:var(--color-text-muted);">—</span>' },
          { key: 'name',        label: '품목명',    align: 'left',   width: '180px', flex: true },
          { key: 'qty',         label: '수량',      align: 'right',  width: '110px', format: qtyU },
          { key: 'needBy',      label: '희망일',    align: 'center', width: '104px', format: fmtYMD },
          { key: 'destination', label: '수령부서',  align: 'center', width: '120px' },
          { key: 'reason',      label: '용도',      align: 'left',   width: '120px' },
          { key: 'status',      label: '상태',      align: 'center', width: '88px',
            format: (v) => `<span class="pill pill--${STATUS_PILL[v] || 'muted'}">${v || ''}</span>` },
        ],
        mock() {
          const S = window.App && window.App.SupOutRequests;
          const me = window.App && window.App.currentUser;
          return (S && me) ? S.listByRequester(me.empId) : [];
        },
        search: {
          conditions: [
            { value: 'all',   label: '전체' },
            { value: 'reqNo', label: '신청번호' },
            { value: 'code',  label: '품목코드' },
            { value: 'name',  label: '품목명' },
          ],
          advanced: [
            { name: 'gubun',  label: '구분', options: (window.App && App.Consumables ? App.Consumables.gubunOptions() : ['일반소모품','사무소모품']) },
            { name: 'status', label: '상태', options: ['출고대기','출고완료','신청취소'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['reqNo','code','name','type','reason','destination']);
          rows = advFilter(rows, p);
          rows = dateFilter(rows, p, 'requestedAt');
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            const reg = e.target.closest('[data-action-key="register-supoutreq"]');
            if (reg) { if (window.App.openSupOutRequestOC) window.App.openSupOutRequestOC(() => refresh()); return; }
            const dt = e.target.closest('[data-supoutreq-detail]');
            if (dt) { const r = window.App.SupOutRequests.get(dt.dataset.supoutreqDetail); if (r && window.App.openSupOutRequestDetailOC) window.App.openSupOutRequestDetailOC(r); }
          });
        },
      };
    })(),

    /* ---------- 자산·업체 > 소모품 > 출고 신청 내역 (담당자 전체 조회 + 출고처리) ---------- */
    'as-out-req-list': (function buildSupOutReqListSchema() {
      const STATUS_PILL = { '출고대기': 'warning', '출고완료': 'success', '신청취소': 'danger' };
      const qtyU = (v, row) => `<span style="font-variant-numeric:tabular-nums;">${(Number(v) || 0).toLocaleString()}</span> <span style="color:var(--color-text-muted); font-size:var(--fs-xs);">${row.unit || ''}</span>`;
      return {
        refreshOnShow: true,
        toolbarActions: [ { label: '엑셀', icon: 'download' } ],
        columns: [
          { key: 'no',          label: 'No',        align: 'center', width: '56px',
            format: (v, row) => `${v ?? ''}<a data-supoutreqlist-detail="${row.id}" hidden></a>` },
          { key: 'reqNo',       label: '신청번호',  align: 'center', width: '150px',
            format: (v) => `<span style="color:var(--color-brand-primary); font-weight:var(--fw-semibold);">${v || ''}</span>` },
          { key: 'requester',   label: '신청자',    align: 'left',   width: '110px',
            format: (v, row) => `<strong>${v || ''}</strong>${row.pos ? `<span style="color:var(--color-text-muted); font-size:var(--fs-xs); margin-left:3px;">${row.pos}</span>` : ''}` },
          { key: 'dept',        label: '부서',      align: 'center', width: '110px' },
          { key: 'requestedAt', label: '신청일시',  align: 'center', width: '160px', format: fmtYMDHM },
          { key: 'gubun',       label: '구분',      align: 'center', width: '96px', format: supGubunPill },
          { key: 'name',        label: '품목명',    align: 'left',   width: '170px', flex: true },
          { key: 'qty',         label: '수량',      align: 'right',  width: '100px', format: qtyU },
          { key: 'needBy',      label: '희망일',    align: 'center', width: '104px', format: fmtYMD },
          { key: 'destination', label: '수령부서',  align: 'center', width: '120px' },
          { key: 'receiver',    label: '수령자',    align: 'left',   width: '90px',
            format: (v) => v ? v : '<span style="color:var(--color-text-muted);">-</span>' },
          { key: 'reason',      label: '용도',      align: 'left',   width: '110px' },
          { key: 'status',      label: '상태',      align: 'center', width: '88px',
            format: (v) => `<span class="pill pill--${STATUS_PILL[v] || 'muted'}">${v || ''}</span>` },
        ],
        mock() { const S = window.App && window.App.SupOutRequests; return S ? S.list() : []; },
        search: {
          cols: 3,
          conditions: [
            { value: 'all',       label: '전체' },
            { value: 'reqNo',     label: '신청번호' },
            { value: 'requester', label: '신청자' },
            { value: 'name',      label: '품목명' },
            { value: 'dept',      label: '부서' },
          ],
          advanced: [
            { name: 'gubun',  label: '구분', options: (window.App && App.Consumables ? App.Consumables.gubunOptions() : ['일반소모품','사무소모품']) },
            { name: 'status', label: '상태', options: ['출고대기','출고완료','신청취소'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['reqNo','requester','dept','name','type','reason','destination','receiver']);
          rows = advFilter(rows, p);
          rows = dateFilter(rows, p, 'requestedAt');
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            const dt = e.target.closest('[data-supoutreqlist-detail]');
            if (dt) {
              const r = window.App.SupOutRequests.get(dt.dataset.supoutreqlistDetail);
              // 담당자 모드 — 출고대기 건은 상세에서 출고 등록/신청 취소 가능
              if (r && window.App.openSupOutRequestDetailOC) window.App.openSupOutRequestDetailOC(r, { allowActions: true, onChange: () => refresh() });
            }
          });
        },
      };
    })(),

    /* ---------- 자산/업체 > 자산현황 > 소모품 ----------
     * 소모성 자재(일반·사무)의 재고 현황 관리.
     * 핵심: 무엇이(구분·분류·품목명·규격) 얼마나 있고(현재고 vs 안전재고 → 재고상태),
     *       단가·보관위치·담당자는 무엇이며, 마지막 입출고가 언제였는지를 한 행에 압축.
     * 재고상태는 현재고/안전재고로 자동 도출(소진=danger / 부족=warning / 정상=success).
     * 데이터: App.Consumables / 등록·수정: openConsumableFormModal / 상세: openConsumableDetailOC
     */
    'as-status-consume': (function buildConsumableSchema() {
      const CATEGORY_PILL = { '일반소모품': 'info', '사무소모품': 'success', '일반': 'info', '사무': 'success' };
      const STATUS_PILL    = { '정상': 'success', '부족': 'warning', '소진': 'danger' };
      const muted = '<span style="color:var(--color-text-muted);">—</span>';
      const esc = (v) => String(v).replace(/</g, '&lt;');
      // 재고상태 자동 도출 — App.Consumables.statusOf 단일 진실원 위임 (로드 전 fallback)
      const statusOf = (stock, safe) => {
        if (window.App && window.App.Consumables) return window.App.Consumables.statusOf(stock, safe);
        const s = Number(stock) || 0, sf = Number(safe) || 0;
        if (s <= 0) return '소진';
        if (sf > 0 && s <= sf) return '부족';
        return '정상';
      };
      const clampMemo = (v) => {
        const s = String(v || '');
        if (!s) return muted;
        return `<span style="font-size:var(--fs-sm); color:var(--color-text-sub);" title="${s.replace(/"/g,'&quot;')}">${s.length > 22 ? s.slice(0, 22) + '…' : esc(s)}</span>`;
      };
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '엑셀',       icon: 'download' },
          { label: '소모품 등록', icon: 'plus', kind: 'primary', key: 'register-consume' },
        ],
        columns: [
          { key: 'no',         label: 'No',        align: 'center', width: '56px',
            format: (v, row) => `${v ?? ''}<a data-csm-detail="${row.id}" hidden></a>` },
          { key: 'code',       label: '품목코드',  align: 'center', width: '104px',
            format: (v) => v ? `<strong style="color:var(--color-brand-primary);">${esc(v)}</strong>` : muted },
          { key: 'gubun',      label: '구분',      align: 'center', width: '96px',
            format: (v) => v ? `<span class="pill pill--${CATEGORY_PILL[v] || 'muted'}">${esc(v)}</span>` : muted },
          { key: 'type',       label: '유형',      align: 'center', width: '120px',
            format: (v) => v ? `<span class="pill pill--soft">${esc(v)}</span>` : muted },
          { key: 'name',       label: '품목명',    align: 'left',   width: '200px', flex: true,
            format: (v) => v ? `<strong>${esc(v)}</strong>` : muted },
          { key: 'spec',       label: '규격',      align: 'left',   width: '130px',
            format: (v) => v ? esc(v) : muted },
          { key: 'unit',       label: '단위',      align: 'center', width: '64px',
            format: (v) => v ? esc(v) : muted },
          { key: 'stock',      label: '현재고',    align: 'right',  width: '80px',
            format: (v, row) => {
              const st = statusOf(v, row.safeStock);
              const n = Number(v) || 0;
              const color = st === '소진' ? 'var(--color-danger)' : st === '부족' ? 'var(--color-warning)' : 'var(--color-text)';
              const fw = st === '정상' ? 'var(--fw-regular)' : 'var(--fw-bold)';
              return `<span style="color:${color}; font-weight:${fw}; font-variant-numeric:tabular-nums;">${n.toLocaleString()}</span>`;
            } },
          { key: 'safeStock',  label: '안전재고',  align: 'right',  width: '80px',
            format: (v) => `<span style="color:var(--color-text-muted); font-variant-numeric:tabular-nums;">${(Number(v) || 0).toLocaleString()}</span>` },
          { key: 'status',     label: '재고상태',  align: 'center', width: '84px',
            format: (_v, row) => { const st = statusOf(row.stock, row.safeStock); return `<span class="pill pill--${STATUS_PILL[st]}">${st}</span>`; } },
          { key: 'price',      label: '단가(원)',  align: 'right',  width: '90px', format: fmtMoney },
          { key: 'location',   label: '보관위치',  align: 'left',   width: '130px',
            format: (v) => v ? esc(v) : muted },
          { key: 'manager',    label: '담당자',    align: 'left',   width: '90px',
            format: (v) => v ? `<strong>${esc(v)}</strong>` : muted },
          { key: 'lastIoDate', label: '최근입출고일', align: 'center', width: '116px', format: fmtYMD },
          { key: 'memo',       label: '비고',      align: 'left',   width: '150px', format: clampMemo },
        ],
        mock() {
          const S = window.App && window.App.Consumables;
          return S ? S.list() : [];
        },
        search: {
          cols: 4,
          dateColumns: [{ key: 'lastIoDate', label: '최근입출고일' }],
          conditions: [
            { value: 'all',      label: '전체' },
            { value: 'name',     label: '품목명' },
            { value: 'code',     label: '품목코드' },
            { value: 'spec',     label: '규격' },
            { value: 'location', label: '보관위치' },
            { value: 'manager',  label: '담당자' },
          ],
          advanced: [
            { name: 'gubun', label: '구분', options: (window.App && App.Consumables ? App.Consumables.gubunOptions() : ['일반소모품', '사무소모품']) },
            { name: 'type',  label: '유형', multi: true, placeholder: '전체',
              options: (window.App && App.Consumables) ? Array.from(new Set([].concat(...App.Consumables.gubunOptions().map(g => App.Consumables.typesOf(g))))) : [] },
            { name: 'status', label: '재고상태', multi: true, placeholder: '전체', options: ['정상', '부족', '소진'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['name', 'code', 'spec', 'location', 'manager', 'type', 'memo']);
          const adv = p.advanced || {};
          const matchAny = (rowVal, sel) => {
            const sels = Array.isArray(sel) ? sel : (sel ? [sel] : []);
            if (!sels.length) return true;
            return sels.includes(String(rowVal ?? ''));
          };
          if (adv.gubun) rows = rows.filter(r => matchAny(r.gubun, adv.gubun));
          if (adv.type)  rows = rows.filter(r => matchAny(r.type, adv.type));
          if (adv.status)      rows = rows.filter(r => matchAny(statusOf(r.stock, r.safeStock), adv.status));
          rows = dateFilter(rows, p, 'lastIoDate');
          return rows;
        },
        bindActions(pageEl, refresh) {
          pageEl.addEventListener('click', (e) => {
            const reg = e.target.closest('[data-action-key="register-consume"]');
            if (reg) {
              if (window.App && window.App.openConsumableFormModal) {
                window.App.openConsumableFormModal(null, { onChange: () => refresh() });
              }
              return;
            }
            const dt = e.target.closest('[data-csm-detail]');
            if (dt) {
              e.preventDefault();
              const r = window.App.Consumables.get(dt.dataset.csmDetail);
              if (r && window.App.openConsumableDetailOC) {
                window.App.openConsumableDetailOC(r, { onChange: () => refresh() });
              }
              return;
            }
          });
        },
      };
    })(),

    /* ---------- 자산/업체 > 부동산 > 건물 ----------
     * 건물 자산 정보 등록·관리. 한 행에 압축:
     *   - 무엇/어디(용도·구분·건물명·주소)
     *   - 규모(대지/실/공용/연면적·층수·용적률·건폐율)
     *   - 가치(취득일자·매입가·시세·과세표준)
     *   - 임대차(계약일·만기일) + 관리(부서·담당자) + 비고
     * 구분: 자가(info) / 임차(warning) / 임대(success).
     * 데이터: App.RealtyBuildings / 등록·수정: openRealtyBuildingFormModal / 상세: openRealtyBuildingDetailOC
     */
    'as-realty-bldg': (function buildRealtyBuildingSchema() {
      const muted = '<span style="color:var(--color-text-muted);">—</span>';
      const esc = (v) => String(v).replace(/</g, '&lt;');
      const USAGE_PILL = { '사무용': 'info', '상업용': 'success', '공장': 'warning', '창고': 'muted', '주거용': 'info', '복합용도': 'success', '기타': 'muted' };
      const OWN_PILL   = { '자가': 'info', '임차': 'warning', '임대': 'success' };
      // 건축 상태 — 완공(success)/가설(info, 임시구조물)/건설중(warning, 진행중)
      const STATUS_PILL = { '완공': 'success', '가설': 'info', '건설중': 'warning' };
      const fmtArea  = (v) => (v == null || v === '') ? muted : `<span style="font-variant-numeric:tabular-nums;">${(Number(v) || 0).toLocaleString()}</span>`;
      const fmtRatio = (v) => (v == null || v === '') ? muted : `<span style="font-variant-numeric:tabular-nums;">${(Number(v) || 0).toLocaleString()}</span>`;
      const fmtFloors = (_v, row) => {
        const up = Number(row.floorsUp) || 0, dn = Number(row.floorsDown) || 0;
        if (!up && !dn) return muted;
        return `<span style="font-variant-numeric:tabular-nums;">${up}F${dn ? ` / B${dn}` : ''}</span>`;
      };
      // 만기일 — 임박/만료 색상 강조 (즉시 인지)
      const fmtExpiry = (v) => {
        if (!v) return muted;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const d = new Date(String(v).replace(/\//g, '-')); d.setHours(0, 0, 0, 0);
        const diff = Math.round((d - today) / 86400000);
        const txt = fmtYMD(v);
        let color = 'var(--color-text-sub)';
        if (diff < 0) color = 'var(--color-danger)';
        else if (diff <= 90) color = 'var(--color-warning)';
        return `<span style="color:${color}; font-variant-numeric:tabular-nums;">${txt}</span>`;
      };
      const clampMemo = (v) => {
        const s = String(v || '');
        if (!s) return muted;
        return `<span style="font-size:var(--fs-sm); color:var(--color-text-sub);" title="${s.replace(/"/g, '&quot;')}">${s.length > 20 ? esc(s.slice(0, 20)) + '…' : esc(s)}</span>`;
      };
      // 계약서류 첨부 — 파일 개수 클릭 시 전체 다운로드
      const fmtFiles = (files) => {
        if (!Array.isArray(files) || files.length === 0) return muted;
        return `<a class="link-code" href="javascript:;" data-bldg-files title="클릭 시 계약서류 전체 다운로드" style="font-weight:var(--fw-semibold);">${files.length}</a>`;
      };
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '엑셀',     icon: 'download', key: 'export-realty-bldg' },
          { label: '건물 등록', icon: 'plus', kind: 'primary', key: 'register-realty-bldg' },
        ],
        columns: [
          { key: 'no',          label: 'No',            align: 'center', width: '56px',
            format: (v, row) => `${v ?? ''}<a data-bldg-detail="${row.id}" hidden></a>` },
          { key: 'usage',       label: '용도',          align: 'center', width: '90px',
            format: (v) => v ? `<span class="pill pill--${USAGE_PILL[v] || 'muted'}">${esc(v)}</span>` : muted },
          { key: 'ownType',     label: '구분',          align: 'center', width: '78px',
            format: (v) => v ? `<span class="pill pill--${OWN_PILL[v] || 'muted'}">${esc(v)}</span>` : muted },
          { key: 'status',      label: '상태',          align: 'center', width: '84px',
            format: (v) => v ? `<span class="pill pill--${STATUS_PILL[v] || 'muted'}">${esc(v)}</span>` : muted },
          { key: 'name',        label: '건물명',        align: 'left',   width: '180px', flex: true,
            format: (v, row) => v ? `<a class="link-code" href="javascript:;" data-bldg-detail="${row.id}" title="상세 보기" style="font-weight:var(--fw-semibold);">${esc(v)}</a>` : muted },
          { key: 'address',     label: '주소',          align: 'left',   width: '240px',
            format: (v) => v ? esc(v) : muted },
          { key: 'landArea',    label: '대지면적(㎡)',  align: 'right',  width: '108px', format: fmtArea },
          { key: 'netArea',     label: '실면적(㎡)',    align: 'right',  width: '104px', format: fmtArea },
          { key: 'commonArea',  label: '공용면적(㎡)',  align: 'right',  width: '108px', format: fmtArea },
          { key: 'floors',      label: '층수',          align: 'center', width: '96px',  format: fmtFloors },
          { key: 'grossArea',   label: '연면적(㎡)',    align: 'right',  width: '104px', format: fmtArea },
          { key: 'far',         label: '용적률(%)',     align: 'right',  width: '92px',  format: fmtRatio },
          { key: 'bcr',         label: '건폐율(%)',     align: 'right',  width: '92px',  format: fmtRatio },
          { key: 'acquiredOn',  label: '취득일자',      align: 'center', width: '100px', format: fmtYMD },
          { key: 'buyPrice',    label: '매입가(원)',    align: 'right',  width: '120px', format: fmtMoney },
          { key: 'marketPrice', label: '시세(원)',      align: 'right',  width: '120px', format: fmtMoney },
          { key: 'taxBase',     label: '과세표준금액(원)', align: 'right', width: '132px', format: fmtMoney },
          { key: 'contractDate', label: '계약일',       align: 'center', width: '100px', format: fmtYMD },
          { key: 'expiryDate',  label: '만기일',        align: 'center', width: '100px', format: fmtExpiry },
          { key: 'files',       label: '계약서류',      align: 'center', width: '84px',  format: (v) => fmtFiles(v) },
          { key: 'mgmtDept',    label: '관리부서',      align: 'left',   width: '110px',
            format: (v) => v ? esc(v) : muted },
          { key: 'manager',     label: '담당자',        align: 'left',   width: '88px',
            format: (v) => v ? `<strong>${esc(v)}</strong>` : muted },
          { key: 'memo',        label: '비고',          align: 'left',   width: '150px', format: clampMemo },
        ],
        mock() {
          const S = window.App && window.App.RealtyBuildings;
          return S ? S.list() : [];
        },
        search: {
          cols: 3,
          dateColumns: [
            { key: 'acquiredOn',  label: '취득일자' },
            { key: 'contractDate', label: '계약일' },
            { key: 'expiryDate',  label: '만기일' },
          ],
          conditions: [
            { value: 'all',      label: '전체' },
            { value: 'name',     label: '건물명' },
            { value: 'address',  label: '주소' },
            { value: 'mgmtDept', label: '관리부서' },
            { value: 'manager',  label: '담당자' },
          ],
          advanced: [
            { name: 'usage',   label: '용도', multi: true, placeholder: '전체', options: ['사무용', '상업용', '공장', '창고', '주거용', '복합용도', '기타'] },
            { name: 'ownType', label: '구분', options: ['자가', '임차', '임대'] },
            { name: 'status',  label: '상태', options: ['완공', '가설', '건설중'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['name', 'address', 'mgmtDept', 'manager']);
          const adv = p.advanced || {};
          const matchAny = (rowVal, sel) => {
            const sels = Array.isArray(sel) ? sel : (sel ? [sel] : []);
            if (!sels.length) return true;
            return sels.includes(String(rowVal ?? ''));
          };
          if (adv.usage)   rows = rows.filter(r => matchAny(r.usage, adv.usage));
          if (adv.ownType) rows = rows.filter(r => matchAny(r.ownType, adv.ownType));
          if (adv.status)  rows = rows.filter(r => matchAny(r.status, adv.status));
          rows = dateFilter(rows, p, 'acquiredOn');
          return rows;
        },
        bindActions(pageEl, refresh, getRows) {
          // 자산 등록부 — 기간검색은 선택 조건. 기본값(1개월)이 과거 취득일 데이터를 모두 제외해
          //   조회 시 0건이 되는 문제 방지 → 진입 시 기간을 비워 '전체'를 기본으로 둔다(사용자가 기간 지정 시에만 필터).
          const _fromEl = pageEl.querySelector('[data-from]');
          const _toEl   = pageEl.querySelector('[data-to]');
          if (_fromEl) _fromEl.value = '';
          if (_toEl)   _toEl.value = '';
          pageEl.querySelectorAll('[data-quick]').forEach(b => b.classList.remove('is-active'));
          pageEl.addEventListener('click', (e) => {
            // 툴바: 건물 등록
            const reg = e.target.closest('[data-action-key="register-realty-bldg"]');
            if (reg) {
              if (window.App && window.App.openRealtyBuildingFormModal) {
                window.App.openRealtyBuildingFormModal(null, { onChange: () => refresh() });
              }
              return;
            }
            // 툴바: 엑셀 다운로드 (CSV)
            const xls = e.target.closest('[data-action-key="export-realty-bldg"]');
            if (xls) {
              const rows = (typeof getRows === 'function' ? getRows() : []) || [];
              const head = ['No', '용도', '구분', '상태', '건물명', '주소', '대지면적(㎡)', '실면적(㎡)', '공용면적(㎡)', '지상층수', '지하층수', '연면적(㎡)', '용적률(%)', '건폐율(%)', '취득일자', '매입가(원)', '시세(원)', '과세표준금액(원)', '계약일', '만기일', '계약서류수', '관리부서', '담당자', '비고'];
              const cell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
              const lines = [head.map(cell).join(',')];
              rows.forEach(r => lines.push([r.no, r.usage, r.ownType, r.status, r.name, r.address, r.landArea, r.netArea, r.commonArea, r.floorsUp, r.floorsDown, r.grossArea, r.far, r.bcr, r.acquiredOn, r.buyPrice, r.marketPrice, r.taxBase, r.contractDate, r.expiryDate, (Array.isArray(r.files) ? r.files.length : 0), r.mgmtDept, r.manager, r.memo].map(cell).join(',')));
              const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
              if (typeof App.downloadFile === 'function') {
                App.downloadFile('건물자산_' + new Date().toISOString().slice(0, 10) + '.csv', { blob, context: '건물 자산 목록' });
              }
              return;
            }
            // 계약서류 숫자 클릭 → 첨부파일 전체 다운로드
            const fileLink = e.target.closest('[data-bldg-files]');
            if (fileLink) {
              e.preventDefault();
              e.stopPropagation();
              const tr = fileLink.closest('tr[data-row-idx]');
              const dtf = tr ? tr.querySelector('[data-bldg-detail]') : null;
              if (!dtf || !window.App || !window.App.RealtyBuildings) return;
              const r = window.App.RealtyBuildings.get(dtf.dataset.bldgDetail);
              const files = r && Array.isArray(r.files) ? r.files : [];
              if (!files.length || typeof App.downloadFile !== 'function') return;
              files.forEach(f => App.downloadFile(f.name, { context: '건물 계약서류' }));
              return;
            }
            // 상세 OC 진입
            const dt = e.target.closest('[data-bldg-detail]');
            if (dt) {
              e.preventDefault();
              const r = window.App.RealtyBuildings.get(dt.dataset.bldgDetail);
              if (r && window.App.openRealtyBuildingDetailOC) {
                window.App.openRealtyBuildingDetailOC(r, { onChange: () => refresh() });
              }
              return;
            }
          });
        },
      };
    })(),

    /* ---------- 자산/업체 > 부동산 > 토지 ----------
     * 토지 자산 정보 등록·관리 (건물 스키마와 동형, 규모는 면적만).
     *   - 무엇/어디(용도(지목)·구분·토지명·주소)
     *   - 규모(대지/실/공용면적)
     *   - 가치(취득일자·계약서류·매입가·시세·과세표준)
     *   - 임대차(계약일·만기일) + 관리(부서·담당자) + 비고
     * 구분: 자가(info) / 임차(warning) / 임대(success).
     * 데이터: App.RealtyLands / 등록·수정: openRealtyLandFormModal / 상세: openRealtyLandDetailOC
     */
    'as-realty-land': (function buildRealtyLandSchema() {
      const muted = '<span style="color:var(--color-text-muted);">—</span>';
      const esc = (v) => String(v).replace(/</g, '&lt;');
      const USAGE_PILL = { '대지': 'info', '전': 'success', '답': 'success', '임야': 'warning', '공장용지': 'warning', '창고용지': 'muted', '잡종지': 'muted', '주차장': 'info', '기타': 'muted' };
      const OWN_PILL   = { '자가': 'info', '임차': 'warning', '임대': 'success' };
      const fmtArea  = (v) => (v == null || v === '') ? muted : `<span style="font-variant-numeric:tabular-nums;">${(Number(v) || 0).toLocaleString()}</span>`;
      const fmtExpiry = (v) => {
        if (!v) return muted;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const d = new Date(String(v).replace(/\//g, '-')); d.setHours(0, 0, 0, 0);
        const diff = Math.round((d - today) / 86400000);
        let color = 'var(--color-text-sub)';
        if (diff < 0) color = 'var(--color-danger)';
        else if (diff <= 90) color = 'var(--color-warning)';
        return `<span style="color:${color}; font-variant-numeric:tabular-nums;">${fmtYMD(v)}</span>`;
      };
      const fmtFiles = (files) => {
        if (!Array.isArray(files) || files.length === 0) return muted;
        return `<a class="link-code" href="javascript:;" data-lnd-files title="클릭 시 계약서류 전체 다운로드" style="font-weight:var(--fw-semibold);">${files.length}</a>`;
      };
      const clampMemo = (v) => {
        const s = String(v || '');
        if (!s) return muted;
        return `<span style="font-size:var(--fs-sm); color:var(--color-text-sub);" title="${s.replace(/"/g, '&quot;')}">${s.length > 20 ? esc(s.slice(0, 20)) + '…' : esc(s)}</span>`;
      };
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '엑셀',     icon: 'download', key: 'export-realty-land' },
          { label: '토지 등록', icon: 'plus', kind: 'primary', key: 'register-realty-land' },
        ],
        columns: [
          { key: 'no',          label: 'No',            align: 'center', width: '56px',
            format: (v, row) => `${v ?? ''}<a data-lnd-detail="${row.id}" hidden></a>` },
          { key: 'usage',       label: '용도',          align: 'center', width: '90px',
            format: (v) => v ? `<span class="pill pill--${USAGE_PILL[v] || 'muted'}">${esc(v)}</span>` : muted },
          { key: 'ownType',     label: '구분',          align: 'center', width: '78px',
            format: (v) => v ? `<span class="pill pill--${OWN_PILL[v] || 'muted'}">${esc(v)}</span>` : muted },
          { key: 'name',        label: '토지명',        align: 'left',   width: '180px', flex: true,
            format: (v, row) => v ? `<a class="link-code" href="javascript:;" data-lnd-detail="${row.id}" title="상세 보기" style="font-weight:var(--fw-semibold);">${esc(v)}</a>` : muted },
          { key: 'address',     label: '주소',          align: 'left',   width: '240px',
            format: (v) => v ? esc(v) : muted },
          { key: 'landArea',    label: '대지면적(㎡)',  align: 'right',  width: '108px', format: fmtArea },
          { key: 'netArea',     label: '실면적(㎡)',    align: 'right',  width: '104px', format: fmtArea },
          { key: 'commonArea',  label: '공용면적(㎡)',  align: 'right',  width: '108px', format: fmtArea },
          { key: 'acquiredOn',  label: '취득일자',      align: 'center', width: '100px', format: fmtYMD },
          { key: 'files',       label: '계약서류',      align: 'center', width: '84px',  format: (v) => fmtFiles(v) },
          { key: 'buyPrice',    label: '매입가(원)',    align: 'right',  width: '120px', format: fmtMoney },
          { key: 'marketPrice', label: '시세(원)',      align: 'right',  width: '120px', format: fmtMoney },
          { key: 'taxBase',     label: '과세표준금액(원)', align: 'right', width: '132px', format: fmtMoney },
          { key: 'contractDate', label: '계약일',       align: 'center', width: '100px', format: fmtYMD },
          { key: 'expiryDate',  label: '만기일',        align: 'center', width: '100px', format: fmtExpiry },
          { key: 'mgmtDept',    label: '관리부서',      align: 'left',   width: '110px',
            format: (v) => v ? esc(v) : muted },
          { key: 'manager',     label: '담당자',        align: 'left',   width: '88px',
            format: (v) => v ? `<strong>${esc(v)}</strong>` : muted },
          { key: 'memo',        label: '비고',          align: 'left',   width: '150px', format: clampMemo },
        ],
        mock() {
          const S = window.App && window.App.RealtyLands;
          return S ? S.list() : [];
        },
        search: {
          cols: 3,
          dateColumns: [
            { key: 'acquiredOn',  label: '취득일자' },
            { key: 'contractDate', label: '계약일' },
            { key: 'expiryDate',  label: '만기일' },
          ],
          conditions: [
            { value: 'all',      label: '전체' },
            { value: 'name',     label: '토지명' },
            { value: 'address',  label: '주소' },
            { value: 'mgmtDept', label: '관리부서' },
            { value: 'manager',  label: '담당자' },
          ],
          advanced: [
            { name: 'usage',   label: '용도', multi: true, placeholder: '전체', options: ['대지', '전', '답', '임야', '공장용지', '창고용지', '잡종지', '주차장', '기타'] },
            { name: 'ownType', label: '구분', options: ['자가', '임차', '임대'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['name', 'address', 'mgmtDept', 'manager']);
          const adv = p.advanced || {};
          const matchAny = (rowVal, sel) => {
            const sels = Array.isArray(sel) ? sel : (sel ? [sel] : []);
            if (!sels.length) return true;
            return sels.includes(String(rowVal ?? ''));
          };
          if (adv.usage)   rows = rows.filter(r => matchAny(r.usage, adv.usage));
          if (adv.ownType) rows = rows.filter(r => matchAny(r.ownType, adv.ownType));
          rows = dateFilter(rows, p, 'acquiredOn');
          return rows;
        },
        bindActions(pageEl, refresh, getRows) {
          // 자산 등록부 — 기간검색은 선택 조건. 기본값(1개월)이 과거 취득일 데이터를 모두 제외해
          //   조회 시 0건이 되는 문제 방지 → 진입 시 기간을 비워 '전체'를 기본으로 둔다(사용자가 기간 지정 시에만 필터).
          const _fromEl = pageEl.querySelector('[data-from]');
          const _toEl   = pageEl.querySelector('[data-to]');
          if (_fromEl) _fromEl.value = '';
          if (_toEl)   _toEl.value = '';
          pageEl.querySelectorAll('[data-quick]').forEach(b => b.classList.remove('is-active'));
          pageEl.addEventListener('click', (e) => {
            // 툴바: 토지 등록
            const reg = e.target.closest('[data-action-key="register-realty-land"]');
            if (reg) {
              if (window.App && window.App.openRealtyLandFormModal) {
                window.App.openRealtyLandFormModal(null, { onChange: () => refresh() });
              }
              return;
            }
            // 툴바: 엑셀 다운로드 (CSV)
            const xls = e.target.closest('[data-action-key="export-realty-land"]');
            if (xls) {
              const rows = (typeof getRows === 'function' ? getRows() : []) || [];
              const head = ['No', '용도', '구분', '토지명', '주소', '대지면적(㎡)', '실면적(㎡)', '공용면적(㎡)', '취득일자', '계약서류수', '매입가(원)', '시세(원)', '과세표준금액(원)', '계약일', '만기일', '관리부서', '담당자', '비고'];
              const cell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
              const lines = [head.map(cell).join(',')];
              rows.forEach(r => lines.push([r.no, r.usage, r.ownType, r.name, r.address, r.landArea, r.netArea, r.commonArea, r.acquiredOn, (Array.isArray(r.files) ? r.files.length : 0), r.buyPrice, r.marketPrice, r.taxBase, r.contractDate, r.expiryDate, r.mgmtDept, r.manager, r.memo].map(cell).join(',')));
              const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
              if (typeof App.downloadFile === 'function') {
                App.downloadFile('토지자산_' + new Date().toISOString().slice(0, 10) + '.csv', { blob, context: '토지 자산 목록' });
              }
              return;
            }
            // 계약서류 숫자 클릭 → 첨부파일 전체 다운로드
            const fileLink = e.target.closest('[data-lnd-files]');
            if (fileLink) {
              e.preventDefault();
              e.stopPropagation();
              const tr = fileLink.closest('tr[data-row-idx]');
              const dtf = tr ? tr.querySelector('[data-lnd-detail]') : null;
              if (!dtf || !window.App || !window.App.RealtyLands) return;
              const r = window.App.RealtyLands.get(dtf.dataset.lndDetail);
              const files = r && Array.isArray(r.files) ? r.files : [];
              if (!files.length || typeof App.downloadFile !== 'function') return;
              files.forEach(f => App.downloadFile(f.name, { context: '토지 계약서류' }));
              return;
            }
            // 상세 OC 진입
            const dt = e.target.closest('[data-lnd-detail]');
            if (dt) {
              e.preventDefault();
              const r = window.App.RealtyLands.get(dt.dataset.lndDetail);
              if (r && window.App.openRealtyLandDetailOC) {
                window.App.openRealtyLandDetailOC(r, { onChange: () => refresh() });
              }
              return;
            }
          });
        },
      };
    })(),

    /* ---------- 자산/업체 > 자산 현황 > 동산현황 ----------
     * 동산(소모품 제외) 통합 등록부. 소모품(수량관리)은 별도 화면(as-status-consume).
     * 구분(2차)·유형(3차)은 [시스템>코드관리>자산코드>동산(MOV)] 코드를 단일 진실원으로 매칭:
     *   2차 코드 = 구분(차량/사무용품/사무기기/전자제품/전산기기/로봇/AI/시설), 3차 코드 = 유형.
     * 한 행에 압축: 식별(자산번호·구분·유형·자산명·모델·제조사) →
     *   취득·가치(취득일·취득금액·장부가) → 배치(사용부서·사용자·위치·담당자) → 상태.
     * 장부가는 App.AssetItems.bookValueOf() 정액법 자동계산(단일 진실원).
     * 데이터: App.AssetItems / 등록·수정: openAssetFormModal / 상세: openAssetDetailOC
     */
    'as-status-asset': (function buildAssetStatusSchema() {
      const muted = '<span style="color:var(--color-text-muted);">—</span>';
      const esc = (v) => String(v).replace(/</g, '&lt;');
      const STATUS_PILL = { '보관중': 'info', '사용중': 'success', '수리중': 'warning', '폐기': 'muted' };
      const clampMemo = (v) => {
        const s = String(v || '');
        if (!s) return muted;
        return `<span style="font-size:var(--fs-sm); color:var(--color-text-sub);" title="${s.replace(/"/g, '&quot;')}">${s.length > 18 ? esc(s.slice(0, 18)) + '…' : esc(s)}</span>`;
      };
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '엑셀',     icon: 'download', key: 'export-asset' },
          { label: '자산 등록', icon: 'plus', kind: 'primary', key: 'register-asset' },
        ],
        columns: [
          { key: 'no',         label: 'No',         align: 'center', width: '56px',
            format: (v, row) => `${v ?? ''}<a data-asset-detail="${row.id}" hidden></a>` },
          { key: 'assetNo',    label: '자산번호',   align: 'center', width: '120px',
            format: (v, row) => v ? `<a class="link-code" href="javascript:;" data-asset-detail="${row.id}" title="상세 보기" style="font-weight:var(--fw-semibold);">${esc(v)}</a>` : muted },
          { key: 'category',   label: '구분',       align: 'center', width: '92px',
            format: (v) => v ? `<span class="pill pill--soft">${esc(v)}</span>` : muted },
          { key: 'type',       label: '유형',       align: 'center', width: '104px',
            format: (v) => v ? `<span style="color:var(--color-text-sub);">${esc(v)}</span>` : muted },
          { key: 'name',       label: '자산명',     align: 'left',   width: '180px', flex: true,
            format: (v, row) => v ? `<a class="link-code" href="javascript:;" data-asset-detail="${row.id}" title="상세 보기" style="font-weight:var(--fw-semibold);">${esc(v)}</a>` : muted },
          { key: 'model',      label: '모델·규격',  align: 'left',   width: '150px',
            format: (v) => v ? esc(v) : muted },
          { key: 'maker',      label: '제조사',     align: 'center', width: '110px',
            format: (v) => v ? esc(v) : muted },
          { key: 'acquiredOn', label: '취득일',     align: 'center', width: '100px', format: fmtYMD },
          { key: 'cost',       label: '취득금액(원)', align: 'right', width: '120px', format: fmtMoney },
          { key: 'book',       label: '장부가(원)',  align: 'right', width: '120px',
            format: (v) => (v == null || v === '') ? muted : `<span style="font-variant-numeric:tabular-nums;">${(Number(v) || 0).toLocaleString()}</span>` },
          { key: 'useDept',    label: '사용부서',   align: 'left',   width: '110px',
            format: (v) => v ? esc(v) : muted },
          { key: 'user',       label: '사용자',     align: 'left',   width: '90px',
            format: (v) => v ? `<strong>${esc(v)}</strong>` : muted },
          { key: 'location',   label: '위치',       align: 'left',   width: '120px',
            format: (v) => v ? esc(v) : muted },
          { key: 'manager',    label: '담당자',     align: 'left',   width: '90px',
            format: (v) => v ? esc(v) : muted },
          { key: 'status',     label: '상태',       align: 'center', width: '84px',
            format: (v) => v ? `<span class="pill pill--${STATUS_PILL[v] || 'muted'}">${esc(v)}</span>` : muted },
          { key: 'memo',       label: '비고',       align: 'left',   width: '140px', format: clampMemo },
        ],
        mock() {
          const S = window.App && window.App.AssetItems;
          return S ? S.list() : [];
        },
        search: {
          cols: 3,
          dateColumns: [{ key: 'acquiredOn', label: '취득일' }],
          conditions: [
            { value: 'all',     label: '전체' },
            { value: 'assetNo', label: '자산번호' },
            { value: 'name',    label: '자산명' },
            { value: 'model',   label: '모델·규격' },
            { value: 'maker',   label: '제조사' },
            { value: 'type',    label: '유형' },
            { value: 'user',    label: '사용자' },
            { value: 'manager', label: '담당자' },
          ],
          advanced: [
            { name: 'category', label: '구분',     multi: true, placeholder: '전체',
              options: ['차량', '사무용품', '사무기기', '전자제품', '전산기기', '로봇/AI', '시설'] },
            { name: 'status',   label: '상태',     multi: true, placeholder: '전체',
              options: ['보관중', '사용중', '수리중', '폐기'] },
            { name: 'useDept',  label: '사용부서', placeholder: '전체',
              options: ['경영지원본부', '자산관리팀', '인사총무팀', '재무회계팀', '생산본부', 'IT연구소', '영업본부', '개발1팀', '개발2팀'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['assetNo', 'name', 'model', 'maker', 'type', 'user', 'manager', 'memo']);
          const adv = p.advanced || {};
          const matchAny = (rowVal, sel) => {
            const sels = Array.isArray(sel) ? sel : (sel ? [sel] : []);
            if (!sels.length) return true;
            return sels.includes(String(rowVal ?? ''));
          };
          if (adv.category) rows = rows.filter(r => matchAny(r.category, adv.category));
          if (adv.status)   rows = rows.filter(r => matchAny(r.status, adv.status));
          if (adv.useDept)  rows = rows.filter(r => matchAny(r.useDept, adv.useDept));
          rows = dateFilter(rows, p, 'acquiredOn');
          return rows;
        },
        bindActions(pageEl, refresh, getRows) {
          // 등록부 — 기간검색은 선택. 진입 시 기간 비워 '전체' 기본 (과거 취득일 제외 방지).
          const _fromEl = pageEl.querySelector('[data-from]');
          const _toEl   = pageEl.querySelector('[data-to]');
          if (_fromEl) _fromEl.value = '';
          if (_toEl)   _toEl.value = '';
          pageEl.querySelectorAll('[data-quick]').forEach(b => b.classList.remove('is-active'));
          const _submit = pageEl.querySelector('[data-submit]');
          if (_submit) _submit.click();   // 비운 기간으로 재조회 → 진입 시 전체 노출 (기본 1개월 범위가 과거 취득일을 모두 제외하는 문제 방지)
          pageEl.addEventListener('click', (e) => {
            const reg = e.target.closest('[data-action-key="register-asset"]');
            if (reg) {
              if (window.App && window.App.openAssetFormModal) window.App.openAssetFormModal(null, { onChange: () => refresh() });
              return;
            }
            const xls = e.target.closest('[data-action-key="export-asset"]');
            if (xls) {
              const rows = (typeof getRows === 'function' ? getRows() : []) || [];
              const head = ['No', '자산번호', '구분', '유형', '자산명', '모델·규격', '제조사', '취득일', '취득금액(원)', '장부가(원)', '사용부서', '사용자', '위치', '담당자', '상태', '비고'];
              const cell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
              const lines = [head.map(cell).join(',')];
              rows.forEach(r => lines.push([r.no, r.assetNo, r.category, r.type, r.name, r.model, r.maker, r.acquiredOn, r.cost, r.book, r.useDept, r.user, r.location, r.manager, r.status, r.memo].map(cell).join(',')));
              const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
              if (typeof App.downloadFile === 'function') App.downloadFile('동산현황_' + new Date().toISOString().slice(0, 10) + '.csv', { blob, context: '동산 현황 목록' });
              return;
            }
            const dt = e.target.closest('[data-asset-detail]');
            if (dt) {
              e.preventDefault();
              const r = window.App.AssetItems.get(dt.dataset.assetDetail);
              if (r && window.App.openAssetDetailOC) window.App.openAssetDetailOC(r, { onChange: () => refresh() });
              return;
            }
          });
        },
      };
    })(),

    /* ---------- 자산/업체 > 입·출고 > 입·출고 이력 ----------
     * 자산 변동(이동) 통합 원장. 유형: 입고/출고/이동/반납/폐기.
     * 자산은 개별 추적 단위라, 자산 1건의 전 생애 이동을 한 곳에서 추적.
     *   - 입고: 취득(구매 후 등록) 시 자동 기록 — 자산현황>자산등록과 연동
     *   - 출고: 사용부서·사용자에게 지급/배정 → 자산 상태 '사용중'
     *   - 이동: 위치/부서 변경  · 반납: 사용 종료 후 회수 → '보관중'  · 폐기: 처분 → '폐기'
     * 자산번호 클릭 → 자산 상세. 행 클릭 → 입·출고 상세(read-only).
     * 데이터: App.AssetMovements / 등록: openAssetMovementModal / 상세: openAssetMovementDetailOC
     */
    'as-io': (function buildAssetMovementSchema() {
      const muted = '<span style="color:var(--color-text-muted);">—</span>';
      const esc = (v) => String(v).replace(/</g, '&lt;');
      const TYPE_PILL = { '입고': 'info', '출고': 'warning', '이동': 'muted', '반납': 'success', '폐기': 'danger' };
      const clampMemo = (v) => {
        const s = String(v || '');
        if (!s) return muted;
        return `<span style="font-size:var(--fs-sm); color:var(--color-text-sub);" title="${s.replace(/"/g, '&quot;')}">${s.length > 16 ? esc(s.slice(0, 16)) + '…' : esc(s)}</span>`;
      };
      // 상대처/사용자 — 유형별 핵심 상대를 한 셀에 요약
      const counterpartOf = (row) => {
        if (row.type === '입고') return row.counterpart || row.fromName || muted;
        if (row.type === '출고') return [row.useDept, row.user].filter(Boolean).join(' · ') || muted;
        if (row.type === '반납') return (row.user || row.useDept) ? `${esc([row.useDept, row.user].filter(Boolean).join(' '))} 반납` : muted;
        if (row.type === '폐기') return row.disposalType ? esc(row.disposalType) + (row.disposalAmount ? ` · ${(Number(row.disposalAmount) || 0).toLocaleString()}원` : '') : muted;
        return muted;
      };
      const locOf = (row) => {
        if (row.type === '이동') return (row.fromLoc || row.toLoc) ? `${esc(row.fromLoc || '?')} → ${esc(row.toLoc || '?')}` : muted;
        if (!row.toLoc) return muted;
        const detail = row.detailLoc ? `<span style="color:var(--color-text-muted); font-size:var(--fs-xs);"> · ${esc(row.detailLoc)}</span>` : '';
        return esc(row.toLoc) + detail;
      };
      return {
        refreshOnShow: true,
        toolbarActions: [
          { label: '엑셀',       icon: 'download', key: 'export-io' },
          { label: '입·출고 등록', icon: 'plus', kind: 'primary', key: 'register-io' },
        ],
        columns: [
          { key: 'no',        label: 'No',        align: 'center', width: '56px',
            format: (v, row) => `${v ?? ''}<a data-io-detail="${row.id}" hidden></a>` },
          { key: 'type',      label: '유형',      align: 'center', width: '72px',
            format: (v) => v ? `<span class="pill pill--${TYPE_PILL[v] || 'muted'}">${esc(v)}</span>` : muted },
          { key: 'moveNo',    label: '입출고번호', align: 'center', width: '136px',
            format: (v) => v ? `<span style="color:var(--color-brand-primary); font-weight:var(--fw-semibold);">${esc(v)}</span>` : muted },
          { key: 'assetNo',   label: '자산번호',  align: 'center', width: '120px',
            format: (v, row) => v ? `<a class="link-code" href="javascript:;" data-io-asset="${row.assetId || ''}" title="자산 상세" style="cursor:pointer;">${esc(v)}</a>` : muted },
          { key: 'assetName', label: '자산명',    align: 'left',   width: '180px', flex: true,
            format: (v) => v ? esc(v) : muted },
          { key: 'category',  label: '구분',      align: 'center', width: '92px',
            format: (v) => v ? `<span class="pill pill--soft">${esc(v)}</span>` : muted },
          { key: 'qty',       label: '수량',      align: 'right',  width: '76px',
            format: (v, row) => {
              const n = Number(v) || 0;
              if (!n) return muted;
              const sign  = (row.type === '출고' || row.type === '폐기') ? '−' : (row.type === '입고' || row.type === '반납') ? '+' : '';
              const color = (row.type === '출고' || row.type === '폐기') ? 'var(--color-danger)' : (row.type === '입고' || row.type === '반납') ? 'var(--color-success)' : 'var(--color-text-sub)';
              return `<span style="font-variant-numeric:tabular-nums; color:${color}; font-weight:var(--fw-semibold);">${sign}${n.toLocaleString()}</span>`;
            } },
          { key: 'movedAt',   label: '처리일',    align: 'center', width: '110px', format: fmtYMD },
          { key: 'cpart',     label: '상대처·사용자', align: 'left', width: '170px',
            format: (_v, row) => counterpartOf(row) },
          { key: 'loc',       label: '위치',      align: 'center', width: '150px',
            format: (_v, row) => locOf(row) },
          { key: 'handler',   label: '담당자',    align: 'center', width: '90px',
            format: (v) => v ? esc(v) : muted },
          { key: 'reason',    label: '사유',      align: 'left',   width: '120px',
            format: (v) => v ? esc(v) : muted },
          { key: 'memo',      label: '비고',      align: 'left',   width: '130px', format: clampMemo },
        ],
        mock() {
          const S = window.App && window.App.AssetMovements;
          return S ? S.list() : [];
        },
        search: {
          cols: 2,
          dateColumns: [{ key: 'movedAt', label: '처리일' }],
          conditions: [
            { value: 'all',       label: '전체' },
            { value: 'moveNo',    label: '입출고번호' },
            { value: 'assetNo',   label: '자산번호' },
            { value: 'assetName', label: '자산명' },
            { value: 'handler',   label: '담당자' },
          ],
          advanced: [
            { name: 'type',     label: '유형', multi: true, placeholder: '전체',
              options: ['입고', '출고', '이동', '반납', '폐기'] },
            { name: 'category', label: '구분', multi: true, placeholder: '전체',
              options: ['차량', '사무용품', '사무기기', '전자제품', '전산기기', '로봇/AI', '시설'] },
          ],
        },
        filter(rows, p) {
          rows = textFilter(rows, p, ['moveNo', 'assetNo', 'assetName', 'handler', 'reason', 'memo', 'useDept', 'user', 'counterpart']);
          const adv = p.advanced || {};
          const matchAny = (rowVal, sel) => {
            const sels = Array.isArray(sel) ? sel : (sel ? [sel] : []);
            if (!sels.length) return true;
            return sels.includes(String(rowVal ?? ''));
          };
          if (adv.type)     rows = rows.filter(r => matchAny(r.type, adv.type));
          if (adv.category) rows = rows.filter(r => matchAny(r.category, adv.category));
          rows = dateFilter(rows, p, 'movedAt');
          return rows;
        },
        bindActions(pageEl, refresh, getRows) {
          const _fromEl = pageEl.querySelector('[data-from]');
          const _toEl   = pageEl.querySelector('[data-to]');
          if (_fromEl) _fromEl.value = '';
          if (_toEl)   _toEl.value = '';
          pageEl.querySelectorAll('[data-quick]').forEach(b => b.classList.remove('is-active'));
          const _submit = pageEl.querySelector('[data-submit]');
          if (_submit) _submit.click();   // 비운 기간으로 재조회 → 진입 시 전체 이력 노출
          pageEl.addEventListener('click', (e) => {
            const reg = e.target.closest('[data-action-key="register-io"]');
            if (reg) {
              if (window.App && window.App.openAssetMovementModal) window.App.openAssetMovementModal({ onChange: () => refresh() });
              return;
            }
            const xls = e.target.closest('[data-action-key="export-io"]');
            if (xls) {
              const rows = (typeof getRows === 'function' ? getRows() : []) || [];
              const head = ['No', '유형', '입출고번호', '자산번호', '자산명', '구분', '수량', '처리일', '사용부서', '사용자', '상대처', '이동전위치', '이동후위치', '상세위치', '담당자', '사유', '비고'];
              const cell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
              const lines = [head.map(cell).join(',')];
              rows.forEach(r => lines.push([r.no, r.type, r.moveNo, r.assetNo, r.assetName, r.category, r.qty, r.movedAt, r.useDept, r.user, r.counterpart, r.fromLoc, r.toLoc, r.detailLoc, r.handler, r.reason, r.memo].map(cell).join(',')));
              const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
              if (typeof App.downloadFile === 'function') App.downloadFile('자산입출고이력_' + new Date().toISOString().slice(0, 10) + '.csv', { blob, context: '자산 입출고 이력' });
              return;
            }
            // 자산번호 클릭 → 자산 상세로 점프
            const assetLink = e.target.closest('[data-io-asset]');
            if (assetLink) {
              e.preventDefault(); e.stopPropagation();
              const r = window.App.AssetItems && window.App.AssetItems.get(assetLink.dataset.ioAsset);
              if (r && window.App.openAssetDetailOC) window.App.openAssetDetailOC(r, { onChange: () => refresh() });
              return;
            }
            // 행/상세 → 입출고 상세(read-only)
            const dt = e.target.closest('[data-io-detail]');
            if (dt) {
              e.preventDefault();
              const r = window.App.AssetMovements.get(dt.dataset.ioDetail);
              if (r && window.App.openAssetMovementDetailOC) window.App.openAssetMovementDetailOC(r, { onChange: () => refresh() });
              return;
            }
          });
        },
      };
    })(),
  };

  // default: 등록 안 된 item 은 사원 정보로 fallback
  function get(itemId) { return SCHEMAS[itemId] || SCHEMAS['hr-employee']; }

  App.GridSchemas = { get, all: SCHEMAS };
})();
