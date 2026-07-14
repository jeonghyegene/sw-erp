/* =========================================================
 * Page: HR > 퇴사 관리 > 퇴사 현황
 *
 *  개요
 *   - 퇴사자 전수 통계 + 목록 화면.
 *   - 데이터는 App.HRResign.list() 단일 소스 (page-hr-resign.js 가 정의).
 *
 *  구성
 *   1) KPI 카드 4종 — 이번 달 / 올해 누적 / 평균 근속 / 자발 비율
 *   2) Line 차트 — 최근 12개월 월별 퇴사자 추이
 *   3) Donut 차트 — 사유 분포 (자발/비자발 색상 구분)
 *   4) Bar 차트   — 부서별 퇴사자 (Top 5)
 *   5) Grid       — 퇴사자 전체 목록 + 검색·필터
 *
 *  UI Kit 재사용
 *   .toolbar / .tbl / .pill / .pagination
 *   Charts.donut / Charts.bar / Charts.renderLine
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  /* ============ 환경 ============ */
  const TODAY = '2026-05-18';

  /* ============ STATE ============ */
  const STATE = {
    filter: { keyword: '', condition: 'name', kind: '', voluntary: '', from: '', to: '' },
    page: 1, pageSize: 20,
    /* 대시보드(KPI + 차트) 영역 접힘 상태 — 그리드만 보고 싶을 때 접어둠. 페이지 재진입에도 유지. */
    dashboardOpen: true,
  };

  /* 초기 기본 기간 — 없음(전체). 퇴사일은 기간(from~to) 입력으로 조회하며,
     기본값은 비워 두어 전체 퇴사자가 모두 보이도록 한다. */

  /* ============ Helpers ============ */
  function $(s, r = document) { return r.querySelector(s); }
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function yearOf(dStr) { return (dStr || '').slice(0, 4); }
  function monthOf(dStr) { return (dStr || '').slice(0, 7); }   /* YYYY-MM */
  function fmtTenure(days) {
    if (!days) return '-';
    const y = Math.floor(days / 365);
    const m = Math.floor((days % 365) / 30);
    return `${y}년 ${m}개월`;
  }
  /* 개인정보 보관 정책 — 퇴사일(retiredAt) + 5년 = 인사 정보 삭제 가능일.
     반환은 ISO(YYYY-MM-DD), 표시는 fmtYYMMDD 로 YY/MM/DD (SWADPIA §1 일자 표기). */
  function addYears(ymdStr, n) {
    if (!ymdStr) return '';
    const p = String(ymdStr).slice(0, 10).split('-');
    if (p.length < 3) return '';
    return `${Number(p[0]) + n}-${p[1]}-${p[2]}`;
  }
  function fmtYYMMDD(ymdStr) {
    if (!ymdStr) return '-';
    const p = String(ymdStr).slice(0, 10).split('-');
    if (p.length < 3) return ymdStr;
    return `${p[0].slice(2)}/${p[1]}/${p[2]}`;
  }
  /* 일시 표시 전용 — YYYY-MM-DD HH:MM → YY/MM/DD   HH:MM (SWADPIA §2, 공백 3칸). 데이터/키 변환에는 사용 금지. */
  function fmtDateTime(dtStr) {
    if (!dtStr) return '-';
    const m = String(dtStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!m) return dtStr;
    return `${m[1].slice(2)}/${m[2]}/${m[3]}   ${m[4]}:${m[5]}`;
  }
  function deletableDate(r) { return addYears(r.retiredAt, 5); }      /* ISO */
  function canDelete(r) { const d = deletableDate(r); return !!d && TODAY >= d; }
  /* avatar — 인사정보카드와 동일 산식: 사번 끝 2자리 % 6 + 1. 이니셜은 성 한 글자. */
  function avColor(empIdOrSeed) {
    const seed = Number(String(empIdOrSeed || '').slice(-2)) || 1;
    return `av--c${(seed % 6) + 1}`;
  }
  function avatarHTML(r) {
    /* 퇴사자 행 avatar — 입사자 관리 마스터 사진(member.photoUrl) 이 있으면 사용,
       없으면 성(姓) 이니셜 + 시드 색상. retired 직원의 emp 정보는 App.HRMembers 에 보존됨. */
    const member = (window.App && App.HRMembers && App.HRMembers.list)
      ? App.HRMembers.list().find(m => m.id === r.empId) : null;
    const photoUrl = member && member.photoUrl;
    const initial = (r.name || '?').charAt(0);
    const cls = `av av--sm ${avColor(r.empId)}`;
    if (photoUrl) {
      return `<span class="av av--sm" style="background:transparent;"><img src="${esc(photoUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"></span>`;
    }
    return `<span class="${cls}">${esc(initial)}</span>`;
  }

  function getResigns() {
    if (window.App && App.HRResign && typeof App.HRResign.list === 'function') return App.HRResign.list();
    return [];
  }
  function getKinds() {
    if (window.App && App.HRResign && typeof App.HRResign.kinds === 'function') return App.HRResign.kinds();
    return [];
  }
  function kindLabel(v) {
    if (window.App && App.HRResign && typeof App.HRResign.kindLabel === 'function') return App.HRResign.kindLabel(v);
    return v;
  }

  /* ============ 통계 ============ */
  function computeStats() {
    const list = getResigns();
    const today = TODAY;
    const thisMonth = today.slice(0, 7);
    const thisYear  = today.slice(0, 4);
    const lastYear  = String(Number(thisYear) - 1);

    const thisMonthCount = list.filter(r => monthOf(r.retiredAt) === thisMonth).length;
    const thisYearCount  = list.filter(r => yearOf(r.retiredAt)  === thisYear).length;
    const lastYearCount  = list.filter(r => yearOf(r.retiredAt)  === lastYear).length;
    const yoy = lastYearCount > 0 ? Math.round(((thisYearCount - lastYearCount) / lastYearCount) * 100) : null;

    const avgTenureDays = list.length
      ? Math.round(list.reduce((s, r) => s + (r.tenureDays || 0), 0) / list.length)
      : 0;

    const voluntary = list.filter(r => r.voluntary).length;
    const voluntaryPct = list.length ? Math.round((voluntary / list.length) * 100) : 0;

    /* 12개월 추이 — { '2025-06': N, ... } */
    const monthly = [];
    const dt = new Date(today);
    for (let i = 11; i >= 0; i--) {
      const d = new Date(dt.getFullYear(), dt.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
      const count = list.filter(r => monthOf(r.retiredAt) === key).length;
      monthly.push({ x: key.slice(5), y: count, _full: key });
    }

    /* 사유 분포 */
    const reasonDist = {};
    list.forEach(r => { reasonDist[r.reasonKind] = (reasonDist[r.reasonKind] || 0) + 1; });
    const reasonSegments = Object.keys(reasonDist).map(k => ({
      key: k, label: kindLabel(k), value: reasonDist[k],
      color: kindToColor(k),
    })).sort((a, b) => b.value - a.value);

    /* 부서 분포 — Top 5 */
    const deptDist = {};
    list.forEach(r => {
      const d = r.dept || '미분류';
      deptDist[d] = (deptDist[d] || 0) + 1;
    });
    const deptBars = Object.keys(deptDist).map(k => ({ x: shortDept(k), y: deptDist[k], full: k }))
      .sort((a, b) => b.y - a.y).slice(0, 7);

    return {
      total: list.length,
      thisMonthCount, thisYearCount, lastYearCount, yoy,
      avgTenureDays, voluntary, voluntaryPct,
      monthly, reasonSegments, deptBars,
    };
  }

  function kindToColor(kind) {
    /* 자발(파란계열) / 비자발(붉은계열) — Charts 컬러 통일 */
    const meta = (getKinds().find(k => k.value === kind) || {});
    if (meta.voluntary) {
      return ({
        self:    '#3B82F6',
        career:  '#2563EB',
        family:  '#0EA5E9',
        health:  '#06B6D4',
        other:   '#6366F1',
      })[kind] || '#3B82F6';
    }
    return ({
      retirement:    '#84CC16',
      contract_end:  '#F59E0B',
      probation_end: '#F97316',
      dismissal:     '#DC2626',
      layoff:        '#B91C1C',
    })[kind] || '#9CA3AF';
  }

  /* 부서명 단축 — "본부 / 팀" 에서 팀명만 */
  function shortDept(d) {
    if (!d) return '-';
    if (d.includes(' / ')) return d.split(' / ').pop();
    return d;
  }

  /* ============ 필터된 목록 ============ */
  function applyFilter() {
    const p = STATE.filter;
    const kw = (p.keyword || '').trim().toLowerCase();
    return getResigns().filter(r => {
      if (kw) {
        const t = p.condition === 'empId' ? r.empId : r.name;
        if (!String(t).toLowerCase().includes(kw)) return false;
      }
      if (p.kind && r.reasonKind !== p.kind) return false;
      if (p.voluntary === 'voluntary'    && !r.voluntary) return false;
      if (p.voluntary === 'involuntary' && r.voluntary)  return false;
      if (p.from && (r.retiredAt || '') < p.from) return false;
      if (p.to   && (r.retiredAt || '') > p.to)   return false;
      return true;
    }).sort((a, b) => (b.retiredAt || '').localeCompare(a.retiredAt || ''));
  }

  /* =========================================================
   *  VIEW
   * ========================================================= */
  function render(pageEl) {
    const C = App.Components;

    const kindOpts = getKinds().map(k => ({ value: k.value, label: k.label }));
    const searchHTML = C.searchPanel({
      showDateRange: true,
      dateLabel: '퇴사일',
      quick: ['week','m1','m3','m6','y1'],
      conditions: [
        { value: 'name',  label: '성명' },
        { value: 'empId', label: '사번' },
      ],
      placeholder: '성명 또는 사번 검색',
      cols: 2,
      advanced: [
        { name: 'kind',      label: '사유 구분', options: kindOpts },
        { name: 'voluntary', label: '자발 여부', options: [
          { value: 'voluntary',   label: '자발' },
          { value: 'involuntary', label: '비자발' },
        ]},
      ],
    });

    pageEl.innerHTML = `
      ${searchHTML}

      <div style="flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;">
        <div class="toolbar">
          <div class="toolbar__left">
            <span class="toolbar__count">총 <strong data-lv-count>0</strong>건</span>
          </div>
          <div class="toolbar__right"></div>
        </div>
        <div class="grid-wrap" style="flex:1;min-height:0;">
          <div class="grid-scroll">
            <table class="tbl tbl--hover">
              <thead>
                <tr>
                  <th style="width:140px;">퇴사 처리 번호</th>
                  <th style="width:150px;">결재 승인번호</th>
                  <th style="width:110px;">사번</th>
                  <th style="width:240px;">성명</th>
                  <th style="width:110px;">입사일</th>
                  <th style="width:110px;">퇴사일</th>
                  <th style="width:110px;text-align:center;">삭제 가능일</th>
                  <th style="width:110px;">근속</th>
                  <th style="width:160px;">사유</th>
                  <th style="width:90px;">처리자</th>
                  <th style="width:80px;text-align:center;"></th>
                </tr>
              </thead>
              <tbody data-lv-body></tbody>
            </table>
          </div>
          <div class="pagination">
            <div class="pagination__info" data-lv-info></div>
            <div class="pagination__right">
              <div class="pagination__size">
                <label>페이지당</label>
                <select class="select" data-lv-pagesize>
                  <option value="20">20</option><option value="40">40</option><option value="60">60</option><option value="100">100</option>
                </select>
                <span>건</span>
              </div>
              <div class="pagination__list" data-lv-pagination></div>
            </div>
          </div>
        </div>
      </div>
    `;

    refreshTable(pageEl);
    bind(pageEl);
  }

  function kpiCard(title, value, valueColor) {
    return `
      <div style="padding:14px 16px;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);">
        <div style="font-size:var(--fs-xs);color:var(--color-text-muted);">${esc(title)}</div>
        <div style="font-size:var(--fs-2xl);font-weight:var(--fw-bold);margin-top:4px;color:${valueColor || 'var(--color-text)'};">${value}</div>
      </div>
    `;
  }

  /* 성명 셀 — 임직원 관리(page-hr-info-mgmt nameCellHTML) 와 동일 패턴: 사진 + 이름 + 팀·직위·직책(muted inline).
   *   팀·직위·직책을 구두점(·)으로만 구분(앞뒤 여백 없이) 표기. */
  function nameCell(r) {
    const parts = [r.dept, r.rank, r.position].filter(Boolean).map(esc);   // 팀·직위·직책
    const dot   = `<span style="color:var(--color-text-muted);font-size:var(--fs-xs);" aria-hidden="true">·</span>`;
    const span  = (v) => `<span style="color:var(--color-text-muted);font-size:var(--fs-xs);white-space:nowrap;">${v}</span>`;
    return `
      <div style="display:flex;align-items:center;gap:8px;min-width:0;">
        ${avatarHTML(r)}
        <a href="#" data-lv-card="${esc(r.empId)}" style="color:var(--color-brand-primary);font-weight:var(--fw-medium);white-space:nowrap;">${esc(r.name)}</a>
        <span style="display:inline-flex;align-items:center;gap:0;min-width:0;">${parts.map(span).join(dot)}</span>
      </div>`;
  }

  /* 결재 승인번호 — 퇴사 처리 번호(RSG-YYYY-####) 기반 결정적 합성. */
  function resignApprovalNo(r) {
    const m = String((r && r.id) || '').match(/RSG-(\d{4})-(\d+)/);
    return m ? `AP-${m[1]}-${m[2]}` : ('AP-' + ((r && r.id) || '-'));
  }

  /* 결재 승인번호 클릭 → 사직원 전자결재 상세(결재 완료) 모달.
     자재 발주내역의 결재 승인번호 모달(App.openPurchaseApprovalDetail)과 동일하게
     App.openDocDetail 에 결재 완료 상태의 문서 row 를 합성해 전달. */
  /* 사직원 전자결재 상세(결재 완료) 모달 — 전자결재 상세와 동일한 레이아웃(.modal--xl / .fm-tbl / .grid)
     이되 본문은 「지출품의서」가 아니라 「사직원」 내용으로 구성한다. */
  function openResignApprovalDetail(r) {
    if (!r) return;
    const docNo = resignApprovalNo(r);
    const approvedAt = String(r.processedAt || r.retiredAt || TODAY);
    const m = approvedAt.match(/^(\d{4})-(\d{2})-(\d{2})/);
    let draftAt = approvedAt + ' 09:00';
    let apprWhen = approvedAt + ' 17:00';
    if (m) {
      const d = Math.max(1, Number(m[3]) - 1);
      draftAt = `${m[1]}-${m[2]}-${String(d).padStart(2, '0')} 09:00`;
      apprWhen = `${m[1]}-${m[2]}-${m[3]} 17:00`;
    }
    const deptPos = [r.dept, r.position].filter(Boolean).join(' · ') || '-';
    const reason = kindLabel(r.reasonKind) + (r.reason ? ` — ${esc(r.reason)}` : '');
    const stages = [
      { name: '팀장',     when: draftAt,  comment: '확인하였습니다.' },
      { name: '본부장',   when: apprWhen, comment: '승인합니다.' },
      { name: '대표이사', when: apprWhen, comment: '사직을 수리합니다.' },
    ];
    let modal = document.getElementById('lv-appr-backdrop');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'lv-appr-backdrop';
      modal.className = 'modal-backdrop';
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.closest('[data-lv-appr-close]')) closeResignApprovalDetail();
      });
    }
    modal.innerHTML = `
      <div class="modal modal--xl" style="min-width:auto;">
        <div class="modal__header">
          <div class="modal__title">결재 완료 · 사직원 · ${esc(docNo)}</div>
          <button class="modal__close" type="button" data-lv-appr-close aria-label="닫기">✕</button>
        </div>
        <div class="modal__body" style="color:var(--color-text);">
          <div class="fm-tbl" style="border:1px solid var(--color-divider);border-radius:var(--radius-md);margin-bottom:18px;">
            <div class="fm-tbl__row fm-tbl__row--4">
              <div class="fm-tbl__label">문서번호</div>
              <div class="fm-tbl__value"><a class="link-code">${esc(docNo)}</a></div>
              <div class="fm-tbl__label">문서명</div>
              <div class="fm-tbl__value">사직원</div>
              <div class="fm-tbl__label">상태</div>
              <div class="fm-tbl__value"><span class="pill pill--success">완료</span></div>
              <div class="fm-tbl__label">기안자</div>
              <div class="fm-tbl__value">${esc(r.name || '')}</div>
            </div>
            <div class="fm-tbl__row fm-tbl__row--2">
              <div class="fm-tbl__label">제목</div>
              <div class="fm-tbl__value">${esc((r.name || '') + ' 사직원')}</div>
              <div class="fm-tbl__label">기안일시</div>
              <div class="fm-tbl__value">${esc(fmtDateTime(draftAt))}</div>
            </div>
          </div>

          <div class="fm-tbl" style="border:1px solid var(--color-divider);border-radius:var(--radius-md);margin-bottom:18px;">
            <div class="fm-tbl__row fm-tbl__row--2">
              <div class="fm-tbl__label">성명</div>
              <div class="fm-tbl__value">${esc(r.name || '-')} <span style="color:var(--color-text-muted);font-size:var(--fs-sm);margin-left:4px;">${esc(r.empId || '')}</span></div>
              <div class="fm-tbl__label">소속 · 직책</div>
              <div class="fm-tbl__value">${esc(deptPos)}</div>
            </div>
            <div class="fm-tbl__row fm-tbl__row--2">
              <div class="fm-tbl__label">입사일</div>
              <div class="fm-tbl__value">${esc(r.joinDate ? fmtYYMMDD(r.joinDate) : '-')}</div>
              <div class="fm-tbl__label">퇴사(예정)일</div>
              <div class="fm-tbl__value">${esc(r.retiredAt ? fmtYYMMDD(r.retiredAt) : '-')}</div>
            </div>
            <div class="fm-tbl__row fm-tbl__row--1">
              <div class="fm-tbl__label">사직 사유</div>
              <div class="fm-tbl__value">${reason}</div>
            </div>
            <div class="fm-tbl__row fm-tbl__row--1">
              <div class="fm-tbl__label">사직서 내용</div>
              <div class="fm-tbl__value" style="white-space:pre-wrap;line-height:1.7;">상기 본인은 일신상의 사유로 ${r.retiredAt ? esc(fmtYYMMDD(r.retiredAt)) : ''}자로 사직하고자 하오니 재가하여 주시기 바랍니다.</div>
            </div>
          </div>

          <div style="margin-bottom:8px;"><strong>결재선</strong></div>
          <table class="grid" style="width:100%;">
            <thead>
              <tr>
                <th style="width:60px;">단계</th>
                <th style="width:140px;">결재자</th>
                <th style="width:100px;">결재</th>
                <th style="width:200px;">결재일시</th>
                <th>의견</th>
              </tr>
            </thead>
            <tbody>
              ${stages.map((s, i) => `
                <tr>
                  <td class="col-center">${i + 1}차</td>
                  <td>${esc(s.name)}</td>
                  <td class="col-center"><span class="pill pill--success">결재</span></td>
                  <td class="col-center">${esc(fmtDateTime(s.when))}</td>
                  <td>${esc(s.comment)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="modal__footer"><button class="btn" type="button" data-lv-appr-close>닫기</button></div>
      </div>`;
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeResignApprovalDetail() {
    const m = document.getElementById('lv-appr-backdrop');
    if (!m) return;
    m.classList.remove('is-open');
    if (!document.querySelector('.modal-backdrop.is-open')) document.body.style.overflow = '';
  }

  function renderRows(rows) {
    if (!rows.length) {
      return `<tr><td colspan="11" style="text-align:center;color:var(--color-text-muted);padding:32px 0;">조건에 해당하는 퇴사자가 없습니다.</td></tr>`;
    }
    return rows.map(r => {
      const delAt = deletableDate(r);
      const delOk = canDelete(r);
      return `
      <tr>
        <td style="white-space:nowrap;">${esc(r.id)}</td>
        <td style="white-space:nowrap;"><a href="#" data-lv-appr="${esc(r.id)}" style="color:var(--color-brand-primary);font-weight:var(--fw-medium);text-decoration:underline;text-underline-offset:2px;">${esc(resignApprovalNo(r))}</a></td>
        <td style="white-space:nowrap;">${esc(r.empId)}</td>
        <td>${nameCell(r)}</td>
        <td style="white-space:nowrap;">${esc(r.joinDate ? fmtYYMMDD(r.joinDate) : '-')}</td>
        <td style="white-space:nowrap;">${esc(r.retiredAt ? fmtYYMMDD(r.retiredAt) : '-')}</td>
        <td style="white-space:nowrap;text-align:center;${delOk ? 'color:var(--color-danger);font-weight:var(--fw-medium);' : 'color:var(--color-text-muted);'}">${esc(fmtYYMMDD(delAt))}</td>
        <td style="white-space:nowrap;">${esc(fmtTenure(r.tenureDays))}</td>
        <td>${esc(kindLabel(r.reasonKind))}</td>
        <td>${esc(r.processedBy || '-')}</td>
        <td style="text-align:center;">${delOk
          ? `<button class="btn btn--xs btn--soft-danger" type="button" data-lv-del="${esc(r.id)}">삭제</button>`
          : `<button class="btn btn--xs" type="button" disabled title="삭제 가능일(${esc(fmtYYMMDD(delAt))}) 이후 삭제할 수 있습니다.">삭제</button>`}</td>
      </tr>
    `;
    }).join('');
  }

  function refreshTable(pageEl) {
    const filtered = applyFilter();
    const start = (STATE.page - 1) * STATE.pageSize;
    const rows = filtered.slice(start, start + STATE.pageSize);
    const body = pageEl.querySelector('[data-lv-body]');
    if (body) body.innerHTML = renderRows(rows);
    const cnt = pageEl.querySelector('[data-lv-count]');
    if (cnt) cnt.textContent = filtered.length;
    renderPagination(pageEl, filtered);
  }

  function renderPagination(pageEl, filtered) {
    const total = filtered.length;
    const start = (STATE.page - 1) * STATE.pageSize;
    const size = STATE.pageSize;
    const totalPages = Math.max(1, Math.ceil(total / size));
    if (STATE.page > totalPages) STATE.page = totalPages;

    const info = pageEl.querySelector('[data-lv-info]');
    if (info) info.textContent = total === 0 ? '0건' : `${start + 1}-${Math.min(start + size, total)} / ${total}건`;

    const btns = [];
    btns.push(`<button class="pagination__btn" data-page="1" ${STATE.page === 1 ? 'disabled' : ''}>«</button>`);
    btns.push(`<button class="pagination__btn" data-page="${Math.max(1, STATE.page - 1)}" ${STATE.page === 1 ? 'disabled' : ''}>‹</button>`);
    const win = 10;
    let s = Math.max(1, STATE.page - Math.floor(win / 2));
    let e = Math.min(totalPages, s + win - 1);
    if (e - s < win - 1) s = Math.max(1, e - win + 1);
    for (let i = s; i <= e; i++) {
      btns.push(`<button class="pagination__btn${i === STATE.page ? ' is-active' : ''}" data-page="${i}">${i}</button>`);
    }
    btns.push(`<button class="pagination__btn" data-page="${Math.min(totalPages, STATE.page + 1)}" ${STATE.page === totalPages ? 'disabled' : ''}>›</button>`);
    btns.push(`<button class="pagination__btn" data-page="${totalPages}" ${STATE.page === totalPages ? 'disabled' : ''}>»</button>`);
    const pp = pageEl.querySelector('[data-lv-pagination]');
    if (pp) pp.innerHTML = btns.join('');

    const sel = pageEl.querySelector('[data-lv-pagesize]');
    if (sel) sel.value = String(STATE.pageSize);
  }

  function bind(pageEl) {
    App.Search.attach(pageEl.querySelector('[data-search]'), (params) => {
      const adv = params.advanced || {};
      STATE.filter.keyword   = (params.keyword || '').trim();
      STATE.filter.condition = params.condition || 'name';
      STATE.filter.kind      = adv.kind || '';
      STATE.filter.voluntary = adv.voluntary || '';
      STATE.filter.from      = params.from || '';
      STATE.filter.to        = params.to || '';
      STATE.page = 1;
      refreshTable(pageEl);
    }, { defaultQuick: null });   /* 퇴사일 기본 기간 없음(전체) — 칩 미선택 · 기간(from~to) 입력 시에만 필터 적용 */

    const pp = pageEl.querySelector('[data-lv-pagination]');
    if (pp) pp.addEventListener('click', e => {
      const b = e.target.closest('.pagination__btn');
      if (!b || b.disabled) return;
      const p = Number(b.dataset.page);
      if (Number.isFinite(p)) { STATE.page = p; refreshTable(pageEl); }
    });
    const ps = pageEl.querySelector('[data-lv-pagesize]');
    if (ps) ps.addEventListener('change', e => { STATE.pageSize = Number(e.target.value); STATE.page = 1; refreshTable(pageEl); });

    /* 대시보드 접기/펼치기 — STATE 토글 후 전체 재렌더 */
    const toggle = pageEl.querySelector('[data-lv-toggle]');
    if (toggle) toggle.addEventListener('click', () => {
      STATE.dashboardOpen = !STATE.dashboardOpen;
      render(pageEl);
    });

    /* [+ 퇴사 처리] 버튼 — 중앙 레이어 모달 오픈 */
    const resignBtn = pageEl.querySelector('[data-lv-resign]');
    if (resignBtn) resignBtn.addEventListener('click', openResignModal);

    /* 성명 클릭 — 인사정보카드 drawer 열기 (read-only).
       1순위: 입사자 관리 마스터(App.HRMembers) 의 emp 정보 — 사진/연락처 등 풀 데이터 보유
       2순위: 퇴사 이력(App.HRResign) 의 레코드 — seed 직원 등 마스터에 없는 경우 최소 정보로 카드 구성
       두 경우 모두 status='retired' 로 전달하면 HRInfoCard 가 자동으로 read-only 모드로 렌더한다. */
    if (!pageEl.dataset.lvDelegated) {
      pageEl.dataset.lvDelegated = '1';
      pageEl.addEventListener('click', e => {
        /* 결재 승인번호 클릭 → 사직원 결재 완료 모달 */
        const apprLink = e.target.closest('[data-lv-appr]');
        if (apprLink) {
          e.preventDefault();
          const rec = getResigns().find(x => x.id === apprLink.dataset.lvAppr);
          if (rec) openResignApprovalDetail(rec);
          return;
        }
        /* [삭제] — 삭제 가능일(퇴사일+5년) 도달 레코드 파기. 개인정보 보관 정책 준수. */
        const delBtn = e.target.closest('[data-lv-del]');
        if (delBtn) {
          e.preventDefault();
          if (delBtn.disabled) return;
          const id = delBtn.dataset.lvDel;
          const rec = getResigns().find(x => x.id === id);
          if (!rec || !canDelete(rec)) return;
          App.confirmDelete && App.confirmDelete({
            title: '퇴사 정보를 삭제하시겠습니까?',
            message: `${rec.name} (${rec.id})\n삭제 가능일(${fmtYYMMDD(deletableDate(rec))})이 경과하여 인사 정보를 파기합니다. 이 작업은 되돌릴 수 없습니다.`,
            onConfirm() {
              if (App.HRResign && App.HRResign.remove) App.HRResign.remove(id);
              refreshTable(pageEl);
              window.toast && window.toast('퇴사 정보가 삭제되었습니다.', 'success');
            },
          });
          return;
        }
        const link = e.target.closest('[data-lv-card]');
        if (!link) return;
        e.preventDefault();
        const empId = link.dataset.lvCard;
        if (!window.App || !App.HRInfoCard || !App.HRInfoCard.open) return;

        const member = (App.HRMembers && App.HRMembers.list)
          ? App.HRMembers.list().find(m => m.id === empId) : null;
        if (member) {
          App.HRInfoCard.open(Object.assign({
            empType: member.empType || 'regular',
            jobCat: member.jobCat || 'office',
            site: member.site || '성수동',
            infoStatus: 'done',
            status: 'retired',
          }, member));
          return;
        }
        /* 마스터 미존재 — 퇴사 이력 레코드로 fallback. 동일 empId 가 여러 건이면 최신(retiredAt 내림차순) 우선. */
        const resigns = (App.HRResign && App.HRResign.list) ? App.HRResign.list() : [];
        const rec = resigns
          .filter(r => r.empId === empId)
          .sort((a, b) => String(b.retiredAt || '').localeCompare(String(a.retiredAt || '')))[0];
        if (!rec) {
          window.toast && window.toast('인사 정보를 찾을 수 없습니다.', 'info');
          return;
        }
        App.HRInfoCard.open({
          id: rec.empId,
          name: rec.name,
          dept: rec.dept || '',
          position: rec.position || '',
          rank: rec.rank || '',
          joinDate: rec.joinDate || '',
          retiredAt: rec.retiredAt || '',
          empType: 'regular',
          jobCat: 'office',
          site: '성수동',
          infoStatus: 'done',
          status: 'retired',
        });
      });
    }
  }

  /* =========================================================
   *  RESIGN MODAL — 퇴사 처리 통합 (퇴사 처리 화면을 모달로 흡수)
   *   · 대상자 선택은 전자결재 직원 선택 OffCanvas(App.openEmpPicker) 사용
   *   · 사유/퇴사일/메모 입력 → [퇴사 처리] 시 App.HRResign.add
   * ========================================================= */
  const RESIGN_FORM = {
    target: null,           // { id, name, dept, pos, photo }
    retiredAt: TODAY,
    reasonKind: 'self',
    reason: '',
    erpRevoked: false,
    assetReturnRequested: false,
    handoverDone: false,
  };
  function resetResignForm() {
    RESIGN_FORM.target = null;
    RESIGN_FORM.retiredAt = TODAY;
    RESIGN_FORM.reasonKind = 'self';
    RESIGN_FORM.reason = '';
    RESIGN_FORM.erpRevoked = false;
    RESIGN_FORM.assetReturnRequested = false;
    RESIGN_FORM.handoverDone = false;
  }
  function getResignKinds() {
    return (App.HRResign && App.HRResign.kinds) ? App.HRResign.kinds() : [
      { value: 'self',   label: '본인 사정 (자발)' },
      { value: 'career', label: '이직 (자발)' },
    ];
  }
  function openResignModal() {
    resetResignForm();
    const m = document.getElementById('modal-lv-resign');
    if (!m) return;
    renderResignBody();
    m.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    /* 닫기(✕) / 취소 버튼 — 모달 닫기 + STATE 정리 */
    m.querySelectorAll('[data-modal-close]').forEach(b => {
      if (b.dataset.bound) return;
      b.dataset.bound = '1';
      b.addEventListener('click', closeResignModal);
    });
    /* 오버레이(backdrop) 클릭 — 모달 영역 밖을 누르면 닫기 */
    if (!m.dataset.backdropBound) {
      m.dataset.backdropBound = '1';
      m.addEventListener('click', (e) => { if (e.target === m) closeResignModal(); });
    }
    const submitBtn = m.querySelector('[data-lv-resign-submit]');
    if (submitBtn && !submitBtn.dataset.bound) {
      submitBtn.dataset.bound = '1';
      submitBtn.addEventListener('click', commitResign);
    }
  }
  function closeResignModal() {
    const m = document.getElementById('modal-lv-resign');
    if (m) m.classList.remove('is-open');
    document.body.style.overflow = '';
    resetResignForm();
  }
  /* 연차 정산 — 퇴사일 기준 미사용 잔여 연차(연차수당 환산 대상).
     근로기준법 제60조: 1년 미만 매월 1일(최대11), 1년 이상 기본 15 + 2년마다 1일(상한 25).
     이월/사용은 사번 기반 결정적 mock. 입사일은 대상자 → 임직원 관리(App.HRInfoMgmt)에서 보강. */
  function computeResignLeave(t, refStr) {
    if (!t) return null;
    let joinDate = t.joinDate;
    if (!joinDate && window.App && App.HRInfoMgmt && App.HRInfoMgmt.list) {
      const r = App.HRInfoMgmt.list().find(x => x.id === t.id) ||
                App.HRInfoMgmt.list().find(x => x.name === t.name);
      if (r) joinDate = r.joinDate;
    }
    const ymd = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
    const ref  = ymd(refStr) || new Date();
    const tail = Number(String(t.id || '').replace(/\D/g, '').slice(-2)) || 1;
    let join = ymd(joinDate);
    /* 직원 선택 명단(EMPLOYEES)에 입사일이 없으면 사번 기반 결정적 근속(0~79개월)으로 산정 */
    if (!join) join = new Date(ref.getFullYear(), ref.getMonth() - ((tail * 7) % 80), Math.min(ref.getDate(), 28));
    let months = (ref.getFullYear() - join.getFullYear()) * 12 + (ref.getMonth() - join.getMonth());
    if (ref.getDate() < join.getDate()) months -= 1;
    if (months < 0) months = 0;
    const years = Math.floor(months / 12);
    const under1 = years < 1;
    let granted, carried, used;
    if (under1) {
      granted = Math.min(months, 11); carried = 0;
      used = months > 0 ? Math.min(tail % 2, granted) : 0;
    } else {
      const addD = Math.floor((years - 1) / 2);
      granted = Math.min(15 + addD, 25);
      carried = Math.min(tail % 6, 5);
      used = Math.min((tail * 2) % (granted + 1), granted + carried);
    }
    const total = carried + granted;
    return { carried, granted, total, used, remain: Math.max(0, total - used) };
  }

  function renderResignBody() {
    const body = document.getElementById('lv-resign-body');
    if (!body) return;
    const f = RESIGN_FORM;
    const t = f.target;
    const kinds = getResignKinds();
    const ls = computeResignLeave(t, f.retiredAt);

    body.innerHTML = `
      <div class="form-field">
        <label class="form-label is-required">대상자</label>
        ${t ? `
          <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border:1px solid var(--color-divider);border-radius:var(--radius-md);background:var(--color-surface-alt);">
            <img src="${esc(t.photo || '')}" alt="" style="width:36px;height:36px;border-radius:50%;background:#E5E7EB;object-fit:cover;" onerror="this.style.background='#E5E7EB';this.removeAttribute('src');" />
            <div style="flex:1;min-width:0;">
              <div><strong>${esc(t.name)}</strong> <small style="color:var(--color-text-muted);">${esc(t.id)}</small></div>
              <div style="font-size:var(--fs-xs);color:var(--color-text-muted);">${esc(t.dept || '-')} · ${esc(t.pos || t.position || '-')}</div>
            </div>
            <button class="btn btn--sm" type="button" data-lv-pick-emp>변경</button>
          </div>
        ` : `
          <button class="btn" type="button" data-lv-pick-emp style="width:100%;justify-content:center;padding:14px;border:1px dashed var(--color-border);background:transparent;">
            + 대상자 선택
          </button>
          <div class="form-help">대상자 선택 버튼을 누르면 직원 선택 패널이 열립니다.</div>
        `}
      </div>

      <div class="form-field">
        <label class="form-label is-required">퇴사일</label>
        <input class="input" type="date" id="lv-f-retired" value="${esc(f.retiredAt)}" />
      </div>

      <div class="form-field">
        <label class="form-label is-required">사유 구분</label>
        <select class="select input--full" id="lv-f-kind" style="max-width:280px;">
          ${kinds.map(k => `<option value="${esc(k.value)}"${k.value === f.reasonKind ? ' selected' : ''}>${esc(k.label)}</option>`).join('')}
        </select>
      </div>

      <div class="form-field">
        <label class="form-label">사유 상세</label>
        <textarea class="input input--full" id="lv-f-reason" rows="3" placeholder="구체적인 사유 (선택)">${esc(f.reason)}</textarea>
      </div>

      <div class="form-field">
        <label class="form-label">처리 항목</label>
        <div style="display:flex;flex-direction:column;gap:6px;">
          <label class="cb"><input type="checkbox" id="lv-f-erp" ${f.erpRevoked ? 'checked' : ''} /> ERP 계정 회수</label>
          <label class="cb"><input type="checkbox" id="lv-f-asset" ${f.assetReturnRequested ? 'checked' : ''} /> 자산 반납 요청</label>
          <label class="cb"><input type="checkbox" id="lv-f-handover" ${f.handoverDone ? 'checked' : ''} /> 업무 인수인계 완료</label>
        </div>
      </div>

      ${t ? `
      <div class="form-field" style="margin-bottom:0;">
        <label class="form-label">연차 정산</label>
        ${ls ? `
          <div style="border:1px solid var(--color-divider);border-radius:var(--radius-md);overflow:hidden;">
            <table class="tbl tbl--bordered" style="border:0;width:100%;font-size:var(--fs-sm);">
              <tbody>
                <tr><th style="background:var(--color-surface-alt);width:55%;">잔여 연차 <span style="color:var(--color-text-muted);font-weight:var(--fw-regular);">(연차수당 환산)</span></th><td style="text-align:right;font-weight:var(--fw-semibold);color:var(--color-brand-primary);">${ls.remain}일</td></tr>
              </tbody>
            </table>
          </div>
          <div class="form-help">회계연도 기준 부여분은 제외하고 <strong>입사일 기준</strong>으로 재산정한 미사용 잔여 연차 <strong>${ls.remain}일</strong>이 연차수당으로 환산됩니다.</div>
        ` : `<div class="form-help">입사일 정보가 없어 연차를 산정할 수 없습니다.</div>`}
      </div>
      ` : ''}
    `;

    /* 입력 동기화 */
    body.querySelector('[data-lv-pick-emp]')?.addEventListener('click', pickTargetEmp);
    body.querySelector('#lv-f-retired')?.addEventListener('input', e => { f.retiredAt = e.target.value; validateResign(); });
    body.querySelector('#lv-f-retired')?.addEventListener('change', () => renderResignBody());  /* 퇴사일 변경 → 연차 정산 재산정 */
    body.querySelector('#lv-f-kind')?.addEventListener('change', e => { f.reasonKind = e.target.value; });
    body.querySelector('#lv-f-reason')?.addEventListener('input', e => { f.reason = e.target.value; });
    body.querySelector('#lv-f-erp')?.addEventListener('change', e => { f.erpRevoked = e.target.checked; });
    body.querySelector('#lv-f-asset')?.addEventListener('change', e => { f.assetReturnRequested = e.target.checked; });
    body.querySelector('#lv-f-handover')?.addEventListener('change', e => { f.handoverDone = e.target.checked; });

    validateResign();
  }
  function validateResign() {
    const m = document.getElementById('modal-lv-resign');
    if (!m) return;
    const btn = m.querySelector('[data-lv-resign-submit]');
    if (!btn) return;
    btn.disabled = !RESIGN_FORM.target || !RESIGN_FORM.retiredAt || !RESIGN_FORM.reasonKind;
  }
  function pickTargetEmp() {
    if (!(window.App && typeof App.openEmpPicker === 'function')) {
      window.toast && window.toast('직원 선택 모듈이 준비되지 않았습니다.', 'warning');
      return;
    }
    const modal = document.getElementById('modal-lv-resign');
    if (modal) modal.style.visibility = 'hidden';
    App.openEmpPicker({
      action: 'callback',
      multi: false,
      onConfirm(selected) {
        if (modal) modal.style.visibility = '';
        if (selected && selected[0]) {
          const e = selected[0];
          RESIGN_FORM.target = { id: e.id, name: e.name, dept: e.dept, pos: e.pos, position: e.pos, photo: e.photo };
          renderResignBody();
        }
      },
      onClose() { if (modal) modal.style.visibility = ''; },
    });
  }
  function commitResign() {
    const f = RESIGN_FORM;
    if (!f.target) return;
    if (!(App.HRResign && App.HRResign.add)) {
      window.toast && window.toast('퇴사 모듈이 준비되지 않았습니다.', 'warning');
      return;
    }
    const memberMaster = (App.HRMembers && App.HRMembers.list)
      ? App.HRMembers.list().find(m => m.id === f.target.id) : null;
    App.HRResign.add({
      empId: f.target.id,
      name: f.target.name,
      dept: f.target.dept || (memberMaster && memberMaster.dept) || '',
      position: f.target.position || (memberMaster && memberMaster.position) || '',
      rank: (memberMaster && memberMaster.rank) || '',
      joinDate: (memberMaster && memberMaster.joinDate) || '',
      retiredAt: f.retiredAt,
      reasonKind: f.reasonKind,
      reason: f.reason,
      erpRevoked: f.erpRevoked,
      assetReturnRequested: f.assetReturnRequested,
      handoverDone: f.handoverDone,
    });
    window.toast && window.toast(`${f.target.name} 퇴사 처리 완료`, 'success');
    closeResignModal();
    /* 통계/그리드 즉시 반영 */
    const pageEl = document.getElementById('page-hr-leave');
    if (pageEl) render(pageEl);
  }

  /* =========================================================
   *  Page Init
   * ========================================================= */
  function initPage() {
    const pageEl = document.getElementById('page-hr-leave');
    if (!pageEl) return;
    /* 매 진입마다 재렌더 — 퇴사 처리 후 통계가 즉시 반영되도록 */
    pageEl.__onShow = () => { render(pageEl); };
  }
  const prev = App.initPages;
  App.initPages = function () {
    if (typeof prev === 'function') prev();
    initPage();
  };
})();
