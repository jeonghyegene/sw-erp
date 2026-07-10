/* =========================================================
 * Module: 평가 결과 모달 (평가 회차에서 호출)
 *
 *  개요
 *   - 「평가 확정(finalized)」 회차의 [결과 보기] 에서 호출되는 결과 모달 provider.
 *   - 별도 페이지/메뉴 없음. App.HREvalResult.open(roundId) 으로 진입.
 *   - 모달 마운트: index.html #modal-evh-result (본문 #evh-result-body).
 *
 *  View
 *   1) result    — 회차 결과 요약 (등급 분포 + 대상자별 결과 테이블)
 *   2) detail    — 단일 대상자의 평가 결과 상세 (역량 응답 결과 read-only · 결과 모달 위 레이어)
 *
 *  데이터
 *   - 회차/유형: App.HREvalRounds.* (공유 API). 양식(역량)은 type.competency 내장.
 *   - 결과값:   실서비스에선 평가 결과 테이블. 스토리보드에서는 회차/대상자 키 기반 결정적 mock.
 *   - 평가요소는 역량 단일.
 *
 *  UI Kit 재사용
 *   .toolbar / .tbl / .pill / .progress / .modal--xl
 *   .likert--readonly (점수 결과 표시)
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  /* ============ STATE ============ */
  const STATE = {
    view: 'list',            // 'list' | 'result'  (detail 은 result 위의 모달로 전환됨)
    selectedRoundId: null,
    selectedTargetId: null,  // 모달이 열려있는 대상자 id (없으면 null)
    filter: { keyword: '', typeKey: '', status: '' },
    /* result view 의 표 검색/필터/정렬 — openResult 시 초기화 */
    resultTable: {
      keyword: '',                // 검색어 — 이름·사번 부분 일치
      dept: '',                   // 부서 드롭다운 (빈 값 = 전체)
      position: '',               // 직책 드롭다운
      excludeGrades: new Set(),   // off 된 등급 (Set 비어있으면 모든 등급 표시)
      sortBy: 'totalScore',       // 'empId' | 'name' | 'dept' | 'position' | 'totalScore' | element명
      sortDir: 'desc',            // 'asc' | 'desc'
    },
  };

  /* ============ Helpers (page-hr-eval-input 와 동일한 패턴) ============ */
  function $(s, r = document) { return r.querySelector(s); }
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* 표시 전용 — 'YYYY-MM-DD' → 'YY/MM/DD' (데이터 값은 원본 유지) */
  function fmtD(s) {
    s = (s === null || s === undefined) ? '' : String(s);
    return s.length >= 10 ? s.slice(2,4) + '/' + s.slice(5,7) + '/' + s.slice(8,10) : s;
  }
  function periodText(from, to) {
    if (!from && !to) return '-';
    return `${from ? fmtD(from) : '?'} ~ ${to ? fmtD(to) : '?'}`;
  }
  /* avatar — 인사정보카드와 동일 산식: 사번 끝 2자리 % 6 + 1. 이니셜은 성 한 글자. */
  function avColor(emp) {
    if (emp && emp.colorIdx) return `av--c${emp.colorIdx}`;
    const seed = Number(String((emp && emp.id) || '').slice(-2)) || 1;
    return `av--c${(seed % 6) + 1}`;
  }
  function avatarHTML(emp, size) {
    const cls = `av av--${size || 'sm'} ${avColor(emp)}`;
    if (emp.photoUrl) {
      return `<span class="av av--${size || 'sm'}" style="background:transparent;"><img src="${esc(emp.photoUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"></span>`;
    }
    return `<span class="${cls}">${esc((emp.name || '?').charAt(0))}</span>`;
  }
  function allMembers() {
    return (window.App && App.HRMembers && App.HRMembers.list) ? App.HRMembers.list() : [];
  }
  function memberById(id) { return allMembers().find(e => e.id === id) || null; }
  function roundStatusPill(code) {
    const s = (App.HREvalRounds && App.HREvalRounds.statusLabel) ? App.HREvalRounds.statusLabel(code) : null;
    if (!s) return '';
    return `<span class="pill${s.pill ? ' pill--' + s.pill : ''}">${esc(s.label)}</span>`;
  }
  function getRoundTargets(round) {
    const api = App.HREvalRounds;
    if (!round) return [];
    if (round.targetEmpIds && round.targetEmpIds.length) {
      const set = new Set(round.targetEmpIds);
      return allMembers().filter(e => set.has(e.id));
    }
    if (api && typeof api.listEmployeesMatchingFilter === 'function' && round.targetFilter) {
      return api.listEmployeesMatchingFilter(round.targetFilter);
    }
    return [];
  }

  /* ============ 결과 mock 산출기 ============
   *  대상자/회차 키 해시 기반 결정적 점수.
   *  finalized 회차: 모든 대상자에 점수·등급 부여.
   *  canceled  회차: 점수 부여 없음 (중단 시점 진행률만 가짐).
   *
   *  실서비스에서는 평가 결과 테이블 (per emp x element x stage) 의 가중평균을 사용. */
  function seed(s) {
    return Math.abs(Array.from(String(s)).reduce((a, c) => a + c.charCodeAt(0) * 31, 7));
  }
  function targetMockResult(round, target, type) {
    if (!round || !target || !type) return null;
    if (round.status === 'canceled') return null;
    const h = seed(round.id + '|' + target.id);
    /* 역량 단일 요소 — 가중치 100, 총점 = 역량 점수 (55 ~ 98, 결정적) */
    const elScore = 55 + (h % 44);
    const elScores = { '역량': elScore };
    const weights = { '역량': 100 };
    const totalScore = elScore;
    const grade = computeGrade(type, totalScore, h);
    return { elScores, weights, totalScore, grade };
  }
  function computeGrade(type, score, hash) {
    const g = type.grading || {};
    const grades = (g.grades || []).slice();
    if (!grades.length) return '-';
    const mode = g.mode;
    if (mode === 'absolute') {
      const match = grades.find(x => score >= (Number(x.minScore) || 0));
      return match ? (match.name || match.key) : (grades[grades.length - 1].name || '-');
    }
    /* relative / mixed — 결정적 mock — hash 로 인덱스 분배 */
    const idx = hash % grades.length;
    return grades[idx].name || grades[idx].key || '-';
  }
  function gradeColor(name) {
    /* S/A/pass 류 → success, B/hold → info/warning, C/D/fail → danger. 생산직 tier 상/중/하 포함. */
    if (/^(S|A|전환|pass|상)/i.test(name)) return 'pill--success';
    if (/^(B|보류|hold)/i.test(name))       return 'pill--info';
    if (/^(C|중)/i.test(name))              return 'pill--warning';
    if (/^(D|미전환|fail|하)/i.test(name))  return 'pill--danger';
    return '';
  }
  /* 등급 스킴 — 단계·등급 설정(App.HREvalConfig) 의 직군 그룹별 tier 를 단일 소스로 사용.
     (회차 type 은 더 이상 grading 을 들고 있지 않음 — findEvalType 이 config 상속 구조로 이관됨) */
  function evalConfig() {
    return (window.App && App.HREvalConfig && typeof App.HREvalConfig.grades === 'function') ? App.HREvalConfig : null;
  }
  /* 등급 표시 순서 — 설정된 그룹 tier 를 순서대로 dedupe (예: S,A,B,C,상,중,하) */
  function configGradeOrder() {
    const cfg = evalConfig();
    const order = [];
    if (cfg) cfg.grades().forEach(g => (g.tiers || []).forEach(t => { if (t.name && !order.includes(t.name)) order.push(t.name); }));
    return order;
  }

  /* 코호트(회차 전체) 등급 산정 — 직군 그룹별 상대평가.
   *   대상자를 직군 그룹(사무·연구직 / 생산직 …) 으로 나누고, 각 그룹 안에서 총점 내림차순 순위를
   *   그룹 tier 의 비율(ratio)만큼 상위부터 배정(마지막 tier 가 잔여 인원 흡수).
   *   → 설정된 비율이 그룹별 등급 분포에 그대로 반영된다.
   *   results[].grade 를 채우고 { [empId]: grade } 맵을 반환. */
  function assignCohortGrades(type, results) {
    const map = {};
    const cfg = evalConfig();
    if (!cfg || !results.length) { results.forEach(r => { r.grade = '-'; map[r.target.id] = '-'; }); return map; }

    /* 직군 그룹으로 분할 */
    const groups = new Map();
    results.forEach(r => {
      const g = cfg.gradeGroupFor(r.target);
      const key = (g && g.groupName) || '기타';
      if (!groups.has(key)) groups.set(key, { group: g, list: [] });
      groups.get(key).list.push(r);
    });

    groups.forEach(({ group, list }) => {
      const tiers = (group && group.tiers) || [];
      if (!tiers.length) { list.forEach(r => { r.grade = '-'; map[r.target.id] = '-'; }); return; }
      const sorted = list.slice().sort((a, b) =>
        (b.totalScore - a.totalScore) || String(a.target.id).localeCompare(String(b.target.id)));
      const n = sorted.length;
      let assigned = 0;
      tiers.forEach((t, i) => {
        const isLast = i === tiers.length - 1;
        let cnt = isLast ? (n - assigned) : Math.round(n * (Number(t.ratio) || 0) / 100);
        cnt = Math.max(0, Math.min(cnt, n - assigned));
        for (let k = 0; k < cnt; k++) { const r = sorted[assigned++]; r.grade = t.name; map[r.target.id] = t.name; }
      });
      while (assigned < n) { const r = sorted[assigned++]; r.grade = tiers[tiers.length - 1].name; map[r.target.id] = r.grade; }
    });
    return map;
  }

  /* 도넛/칩/표 좌측 인디케이터에서 쓰는 직접 색상 (pill 토큰과 별도) */
  function gradeStrokeColor(name) {
    if (/^(S|전환|pass)/i.test(name)) return '#16A34A';
    if (/^A/i.test(name))             return '#34A853';
    if (/^상/.test(name))             return '#16A34A';
    if (/^(B|보류|hold)/i.test(name)) return '#3B82F6';
    if (/^(C|중)/i.test(name))        return '#F59E0B';
    if (/^(D|미전환|fail|하)/i.test(name)) return '#DC2626';
    return '#6B7280';
  }

  /* =========================================================
   *  VIEW: RESULT — 회차 결과 요약 + 대상자별 결과
   * ========================================================= */
  function openResult(roundId) {
    STATE.view = 'result';
    STATE.selectedRoundId = roundId;
    STATE.selectedTargetId = null;
    STATE.resultTable = {
      keyword: '',
      condition: 'name',         // 'name' | 'id'
      dept: '',
      position: '',
      /* 포함 대상 등급 — 비어있으면 전체 (검색패널 체크그룹 패턴) */
      includeGrades: new Set(),
      sortBy: 'totalScore',
      sortDir: 'desc',
    };
    /* 페이지 전환 대신 modal 로 표시. 본문은 modal__body 에 채운다. */
    renderResultView(document.getElementById('modal-evh-result'));
    openEvhResultModal();
  }
  function openEvhResultModal() {
    const m = document.getElementById('modal-evh-result');
    if (!m) return;
    m.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeEvhResultModal() {
    const m = document.getElementById('modal-evh-result');
    if (m) m.classList.remove('is-open');
    document.body.style.overflow = '';
  }
  function exitToList() {
    STATE.view = 'list';
    STATE.selectedRoundId = null;
    closeEvhResultModal();
  }

  function renderResultView(modalEl) {
    /* modalEl 은 #modal-evh-result. 본문은 #evh-result-body 에 채운다. */
    const round = App.HREvalRounds.get(STATE.selectedRoundId);
    if (!round) { exitToList(); return; }
    const type = App.HREvalRounds.getType(round.typeKey);
    const targets = getRoundTargets(round);
    const isCanceled = round.status === 'canceled';

    /* 회차 전체 결과 일괄 산정 (mock) — filter/sort 가 매번 재계산하지 않도록 캐싱 */
    const allResults = (isCanceled || !type) ? [] : targets.map(t => {
      const r = targetMockResult(round, t, type);
      return r ? Object.assign({ target: t }, r) : null;
    }).filter(Boolean);

    /* 등급 산정 — 회차 전체를 대상으로 절대/상대 방식에 맞게 등급 부여 (분포가 설정 비율을 반영).
       상세 모달에서도 동일 등급을 쓰도록 id→grade 맵을 STATE 에 보관. */
    STATE.gradeById = (!isCanceled && type) ? assignCohortGrades(type, allResults) : {};

    /* 등급 분포 */
    const dist = {};
    if (!isCanceled && type) {
      allResults.forEach(r => { dist[r.grade] = (dist[r.grade] || 0) + 1; });
    }

    /* 모달 타이틀 갱신 */
    const titleEl = modalEl.querySelector('#evh-result-title');
    if (titleEl) {
      titleEl.innerHTML = `${esc(round.name)} <span style="margin-left:8px;vertical-align:middle;">${roundStatusPill(round.status)}</span>`;
    }

    /* 모달 본문에 결과 콘텐츠 채우기 — 기존 split 구조 유지, page-bar 는 모달 header 가 대체 */
    const pageEl = modalEl.querySelector('#evh-result-body');
    if (!pageEl) return;

    pageEl.innerHTML = `
      ${isCanceled
        ? `<div style="flex:1;min-height:0;overflow:auto;padding:20px 24px 40px;background:var(--color-surface-alt);">${renderCanceledNotice(round)}</div>`
        : `
          <div class="split" style="--split-left:300px;flex:1;min-height:0;">
            <aside class="split__left" style="background:var(--color-surface);">
              <div class="split__head" style="padding:10px 16px;min-height:56px;"><h3>회차 정보</h3></div>
              <div class="split__body" style="padding:0;">${renderSidePanel(round, type, allResults, dist)}</div>
            </aside>
            <section class="split__right" style="background:var(--color-surface-alt);">
              <div class="split__head" style="background:var(--color-surface);padding:10px 16px;min-height:56px;gap:12px;">
                <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
                  <strong style="font-size:var(--fs-md);color:var(--color-text);white-space:nowrap;">대상자별 평가 결과</strong>
                  <small style="color:var(--color-text-muted);white-space:nowrap;" data-evh-result-count>${applyTableFilterSort(allResults, type).length}건</small>
                </div>
                <button class="btn btn--sm" type="button" data-evh-export>엑셀 다운로드</button>
              </div>
              <div style="background:var(--color-surface);border-bottom:1px solid var(--color-divider);" data-evh-filter-host>
                ${renderResultSearchPanel(type, allResults)}
              </div>
              <div class="split__body" style="padding:16px;" data-evh-table-host>
                ${renderResultTableNew(type, applyTableFilterSort(allResults, type))}
              </div>
            </section>
          </div>
        `}

      <!-- 대상자 상세 모달 — 성명 클릭 시 openDetailModal 이 채워 띄움. 결과 모달 위에 표시되어야 하므로 modal-backdrop--over-modal 사용. -->
      <div class="modal-backdrop modal-backdrop--over-modal" data-evh-detail-modal>
        <div class="modal modal--xl" style="max-height:90vh;">
          <div class="modal__header">
            <div style="flex:1;min-width:0;">
              <div class="modal__title" data-evh-detail-title>대상자 상세</div>
              <div class="page-bar__sub" data-evh-detail-sub style="margin-top:2px;"></div>
            </div>
            <button class="modal__close" type="button" data-evh-detail-close aria-label="닫기">✕</button>
          </div>
          <div class="modal__body" style="background:var(--color-surface-alt);padding:20px 24px;display:flex;flex-direction:column;gap:14px;" data-evh-detail-body></div>
          <div class="modal__footer">
            <button class="btn" type="button" data-evh-detail-close>닫기</button>
          </div>
        </div>
      </div>
    `;

    bindResult(pageEl, type, allResults);
  }

  /* ===== 대상자 상세 모달 ===== */
  function openDetailModal(targetId) {
    const pageEl = document.getElementById('evh-result-body');
    const round = App.HREvalRounds.get(STATE.selectedRoundId);
    const target = memberById(targetId);
    if (!pageEl || !round || !target) return;
    const type = App.HREvalRounds.getType(round.typeKey);
    const result = targetMockResult(round, target, type);
    /* 목록(코호트) 에서 산정된 등급과 동일하게 표시 — 상대/혼합평가는 회차 전체 순위 기반이므로 개별 재계산과 다를 수 있음 */
    if (result && STATE.gradeById && STATE.gradeById[targetId]) result.grade = STATE.gradeById[targetId];
    const isCanceled = round.status === 'canceled';

    const modal = pageEl.querySelector('[data-evh-detail-modal]');
    if (!modal) return;
    const titleEl = modal.querySelector('[data-evh-detail-title]');
    const subEl   = modal.querySelector('[data-evh-detail-sub]');
    const bodyEl  = modal.querySelector('[data-evh-detail-body]');

    titleEl.innerHTML = `${esc(target.name)} 평가 결과 ${result ? `<span class="pill ${gradeColor(result.grade)}" style="margin-left:8px;font-size:var(--fs-sm);">${esc(result.grade)}</span>` : ''}`;
    subEl.textContent = `${target.id} · ${target.dept || '-'} · ${target.position || '-'} · ${(type && type.name) || round.typeKey}`;
    bodyEl.innerHTML = `
      ${renderTargetCard(target, result, isCanceled)}
      ${isCanceled ? renderCanceledNotice(round) : renderElementBreakdowns(round, target, type, result)}
    `;

    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    STATE.selectedTargetId = targetId;
  }
  function closeDetailModal() {
    const pageEl = document.getElementById('evh-result-body');
    const modal = pageEl && pageEl.querySelector('[data-evh-detail-modal]');
    if (modal) modal.classList.remove('is-open');
    document.body.style.overflow = '';
    STATE.selectedTargetId = null;
  }

  /* ===== 좌측 사이드 인포 패널 ===== */
  function renderSidePanel(round, type, allResults, dist) {
    const row = (label, value) => `
      <div style="display:flex;flex-direction:column;gap:2px;">
        <div style="font-size:var(--fs-xs);color:var(--color-text-muted);">${esc(label)}</div>
        <div style="font-size:var(--fs-sm);color:var(--color-text);font-weight:var(--fw-medium);">${value}</div>
      </div>
    `;
    const block = (title, content) => `
      <section style="padding:14px 16px;border-bottom:1px solid var(--color-divider);">
        <div style="font-size:var(--fs-xs);font-weight:var(--fw-semibold);color:var(--color-text-sub);letter-spacing:.02em;text-transform:uppercase;margin-bottom:10px;">${esc(title)}</div>
        ${content}
      </section>
    `;

    /* 평가 정보 */
    const info = block('평가 정보', `
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${row('평가번호', esc(round.id))}
        ${row('평가유형', esc((type && type.name) || round.typeKey))}
        ${row('결과 유형', esc((type && type.resultType) || '-'))}
      </div>
    `);

    /* 기간 */
    const period = block('기간', `
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${row('대상기간', esc(periodText(round.periodFrom, round.periodTo)))}
        ${row('입력기간', esc(periodText(round.inputFrom, round.inputTo)))}
        ${row('대상자수', `${(round.targetCount || allResults.length).toLocaleString()}명`)}
      </div>
    `);

    /* 등급 분포 도넛 — 등급 명칭은 단계·등급 설정(직군 그룹 tier) 에서 상속.
       그룹이 여러 개면 tier 명칭을 순서대로 dedupe 해 노출(예: S/A/B/C + 상/중/하). */
    let order = configGradeOrder();
    if (!order.length) order = Object.keys(dist);
    const totalN = allResults.length;
    let cumOffset = 0;
    const segments = order.map(name => {
      const n = dist[name] || 0;
      const pct = totalN ? (n / totalN * 100) : 0;
      const offset = -cumOffset;
      cumOffset += pct;
      return { name, n, pct, offset, color: gradeStrokeColor(name) };
    });
    /* viewBox 에 좌우 2 단위씩 여유를 줘서 stroke-width 가 박스 경계에 잘리지 않도록 함 (r=15.915, stroke≈5) */
    const donutSvg = totalN ? `
      <svg viewBox="-2 -2 40 40" preserveAspectRatio="xMidYMid meet" style="overflow:visible;">
        <circle class="donut__track" cx="18" cy="18" r="15.915"/>
        ${segments.map(s => s.pct > 0 ? `<circle class="donut__seg" cx="18" cy="18" r="15.915" style="stroke:${s.color};stroke-dasharray:${s.pct.toFixed(2)} ${(100 - s.pct).toFixed(2)};stroke-dashoffset:${s.offset.toFixed(2)};"/>` : '').join('')}
      </svg>
    ` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--color-text-muted);font-size:var(--fs-xs);">데이터 없음</div>`;
    const distBlock = block('등급 분포', `
      <div style="display:flex;justify-content:center;margin-bottom:12px;">
        <div class="donut" style="--donut-size:140px;--donut-thickness:5;">
          ${donutSvg}
          <div class="donut__center">
            <div class="donut__value">${totalN}</div>
            <div class="donut__label">명</div>
          </div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        ${segments.map(s => `
          <div style="display:flex;align-items:center;gap:8px;font-size:var(--fs-xs);">
            <span style="width:10px;height:10px;border-radius:2px;background:${s.color};flex-shrink:0;"></span>
            <span style="flex:1;color:var(--color-text-sub);">${esc(s.name)}</span>
            <strong style="color:var(--color-text);">${s.n}</strong>
            <span style="color:var(--color-text-muted);min-width:36px;text-align:right;">${Math.round(s.pct)}%</span>
          </div>
        `).join('')}
      </div>
    `);

    /* 평균 점수 — 대상자 전체 총점 평균 (요소별 분리 없이 단일 값) */
    const avgScore = allResults.length
      ? Math.round(allResults.reduce((a, r) => a + (r.totalScore || 0), 0) / allResults.length * 10) / 10
      : 0;
    const avgPct = Math.min(100, Math.max(0, avgScore));
    const avgBlock = block('평균 점수', `
      <div style="display:flex;align-items:baseline;gap:6px;">
        <strong style="font-size:var(--fs-2xl);font-weight:var(--fw-bold);color:var(--color-brand-primary);">${avgScore}</strong>
        <span style="color:var(--color-text-muted);font-size:var(--fs-sm);">/ 100점</span>
      </div>
      <div class="progress" style="margin-top:8px;"><div class="progress__bar" style="width:${avgPct}%;"></div></div>
    `);

    return info + period + distBlock + avgBlock;
  }

  /* ===== 결과 검색 패널 — App.Components.searchPanel 재사용 =====
     · 기본 노출: 이름/사번 검색 필드 1개 + [상세검색] 버튼
     · 상세검색 펼침: 부서 / 직책 드롭다운 + 등급 체크박스 그룹
     · 등급 체크박스는 "포함" 의미 — 비어있으면 전체 표시, 체크된 항목만 필터링 (검색패널 표준) */
  function renderResultSearchPanel(type, allResults) {
    const C = App.Components;
    const grades = (type && type.grading && type.grading.grades) || [];
    const depts = Array.from(new Set((allResults || []).map(r => r.target.dept).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'ko'));
    const positions = Array.from(new Set((allResults || []).map(r => r.target.position).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'ko'));

    const adv = [
      { name: 'dept',     label: '부서', options: depts.map(d => ({ value: d, label: d })) },
      { name: 'position', label: '직책', options: positions.map(p => ({ value: p, label: p })) },
    ];
    const checkGroups = grades.length ? [{
      key: 'grade',
      label: '등급',
      items: grades.map(g => {
        const name = g.name || g.key;
        return { value: name, label: name };
      }),
    }] : [];

    return C.searchPanel({
      showDateRange: false,
      conditions: [
        { value: 'name', label: '성명' },
        { value: 'id',   label: '사번' },
      ],
      placeholder: '이름 또는 사번',
      cols: 2,
      advanced: adv,
      checkGroups,
    });
  }

  /* ===== 결과 표 (필터·정렬 적용된 rows) ===== */
  function applyTableFilterSort(allResults, type) {
    const st = STATE.resultTable;
    const kw = (st.keyword || '').toLowerCase().trim();
    const cond = st.condition || 'name';
    let rows = allResults.filter(r => {
      /* 등급 — 선택된 항목이 있을 때만 필터, 비어있으면 전체 통과 */
      if (st.includeGrades && st.includeGrades.size > 0 && !st.includeGrades.has(r.grade)) return false;
      if (st.dept     && r.target.dept     !== st.dept)     return false;
      if (st.position && r.target.position !== st.position) return false;
      if (kw) {
        const hay = (cond === 'id' ? (r.target.id || '') : (r.target.name || '')).toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
    /* 정렬 */
    const key = st.sortBy;
    const dir = st.sortDir === 'asc' ? 1 : -1;
    const getVal = (r) => {
      if (key === 'totalScore') return r.totalScore;
      if (key === 'grade')      return r.grade || '';
      if (key === 'empId')      return r.target.id || '';
      if (key === 'name')       return r.target.name || '';
      if (key === 'dept')       return r.target.dept || '';
      if (key === 'position')   return r.target.position || '';
      if (key && key.startsWith('el:')) return r.elScores[key.slice(3)] || 0;
      return r.target.id || '';
    };
    rows.sort((a, b) => {
      const va = getVal(a), vb = getVal(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), 'ko') * dir;
    });
    return rows;
  }

  /* 정렬 토글 헤더 빌더 — sortKey 가 현재 sortBy 와 같으면 is-asc/is-desc 클래스 부여 */
  function sortTh(sortKey, label, attrs) {
    const st = STATE.resultTable;
    const active = st.sortBy === sortKey;
    const cls = active ? (st.sortDir === 'asc' ? 'is-asc' : 'is-desc') : '';
    const align = (attrs && attrs.align) || 'left';
    const width = (attrs && attrs.width) ? `width:${attrs.width};` : '';
    return `<th style="${width}text-align:${align};">
      <button class="th-sort ${cls}" type="button" data-evh-sortcol="${esc(sortKey)}">
        ${esc(label)}<span class="th-sort__ico" aria-hidden="true"></span>
      </button>
    </th>`;
  }

  function renderResultTableNew(type, rows) {
    if (!rows.length) {
      return `<div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:48px 24px;text-align:center;color:var(--color-text-muted);">조건에 해당하는 대상자가 없습니다.</div>`;
    }
    const elemHeads = (type ? type.elements : []).map(el => sortTh(`el:${el}`, el, { align: 'right' })).join('');
    const body = rows.map(r => {
      const t = r.target;
      const color = gradeStrokeColor(r.grade);
      const elCells = (type ? type.elements : []).map(el => `
        <td style="text-align:right;">
          <span style="font-weight:var(--fw-medium);">${r.elScores[el]}</span>
        </td>
      `).join('');
      return `
        <tr data-evh-target="${esc(t.id)}">
          <td style="width:4px;padding:0;background:${color};"></td>
          <td style="text-align:center;">
            <span class="pill ${gradeColor(r.grade)}" style="min-width:36px;justify-content:center;font-weight:var(--fw-semibold);">${esc(r.grade)}</span>
          </td>
          <td style="white-space:nowrap;">${esc(t.id)}</td>
          <td><div style="display:flex;align-items:center;gap:8px;min-width:0;"><span class="ssw-tbl__ava" style="width:24px;height:24px;flex:0 0 auto;">${esc((t.name||'').slice(0,1))}</span><a href="#" data-evh-open-detail style="color:var(--color-brand-primary);font-weight:var(--fw-medium);white-space:nowrap;">${esc(t.name)}</a></div></td>
          <td>${esc(t.dept || '-')}</td>
          <td style="text-align:center;">${esc(t.position || '-')}</td>
          ${elCells}
          <td style="text-align:right;font-weight:var(--fw-semibold);font-size:var(--fs-md);color:var(--color-text);">${r.totalScore}</td>
        </tr>
      `;
    }).join('');

    return `
      <div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden;">
        <div style="overflow:auto;max-height:none;">
          <table class="tbl tbl--hover" style="margin:0;">
            <thead>
              <tr>
                <th style="width:4px;padding:0;background:var(--color-divider);"></th>
                ${sortTh('grade',   '등급',  { align: 'center', width: '64px' })}
                ${sortTh('empId',   '사번',  { align: 'left',   width: '110px' })}
                ${sortTh('name',    '성명',  { align: 'left',   width: '100px' })}
                ${sortTh('dept',    '부서',  { align: 'left'                   })}
                ${sortTh('position','직책',  { align: 'center', width: '90px'  })}
                ${elemHeads}
                ${sortTh('totalScore', '총점', { align: 'right', width: '80px' })}
              </tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderCanceledNotice(round) {
    return `
      <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:24px;display:flex;align-items:flex-start;gap:14px;">
        <div style="width:36px;height:36px;border-radius:50%;background:rgba(220,38,38,.1);color:var(--color-danger);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <div>
          <div style="font-weight:var(--fw-semibold);color:var(--color-text);">중단된 회차입니다.</div>
          <p style="font-size:var(--fs-sm);color:var(--color-text-sub);margin-top:6px;">
            이 회차는 평가가 종료되지 않고 중단(폐기) 되었습니다. 등급 산정 결과는 없으며, 중단 시점까지 입력된 응답값은 이력으로 보존됩니다.
          </p>
          <p style="font-size:var(--fs-xs);color:var(--color-text-muted);margin-top:4px;">
            대상자별 입력 이력이 필요한 경우 시스템 관리자에게 문의하세요.
          </p>
        </div>
      </section>
    `;
  }

  function bindResult(pageEl, type, allResults) {
    /* 모달 close X(✕) / [data-modal-close] / 오버레이(backdrop) 클릭 시 닫기 + STATE 정리.
     *   전역 data-modal-close 핸들러가 없으므로 closeEvhResultModal 로 직접 닫아야 한다. */
    const wrap = pageEl.closest('#modal-evh-result');
    if (wrap && !wrap.dataset.evhBound) {
      wrap.dataset.evhBound = '1';
      wrap.addEventListener('click', (e) => {
        if (e.target.closest('[data-modal-close]') || e.target === wrap) {
          STATE.view = 'list';
          STATE.selectedRoundId = null;
          closeEvhResultModal();
        }
      });
    }
    const ex = pageEl.querySelector('[data-evh-export]');
    if (ex) ex.addEventListener('click', () => window.toast && window.toast('엑셀 다운로드는 준비 중입니다.', 'info'));

    /* canceled 회차는 split/toolbar 자체가 없음 → 이하 핸들러 등록 스킵 */
    const tableHost = pageEl.querySelector('[data-evh-table-host]');
    if (!tableHost) return;

    const repaintTable = () => {
      tableHost.innerHTML = renderResultTableNew(type, applyTableFilterSort(allResults, type));
    };
    const updateCount = () => {
      const cnt = pageEl.querySelector('[data-evh-result-count]');
      if (cnt) cnt.textContent = applyTableFilterSort(allResults, type).length + '건';
    };

    /* 검색 패널 — App.Components.searchPanel 마크업 + App.Search.attach 핸들러 사용.
       params: { condition, keyword, advanced:{dept,position}, checks:{grade:[...]} } */
    const searchRoot = pageEl.querySelector('[data-evh-filter-host] [data-search]');
    if (searchRoot && App.Search) {
      App.Search.attach(searchRoot, (params) => {
        const st = STATE.resultTable;
        st.condition = params.condition || 'name';
        st.keyword   = (params.keyword || '').trim();
        st.dept      = (params.advanced && params.advanced.dept)     || '';
        st.position  = (params.advanced && params.advanced.position) || '';
        const checkedGrades = (params.checks && params.checks.grade) || [];
        st.includeGrades = new Set(checkedGrades);
        repaintTable(); updateCount();
      });
    }

    /* 컬럼 헤더 클릭 — 같은 컬럼 재클릭 시 asc/desc 토글. 다른 컬럼이면 desc 로 시작. */
    tableHost.addEventListener('click', e => {
      const btn = e.target.closest('[data-evh-sortcol]');
      if (!btn) return;
      const key = btn.dataset.evhSortcol;
      const st = STATE.resultTable;
      if (st.sortBy === key) {
        st.sortDir = st.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        st.sortBy = key;
        st.sortDir = 'desc';
      }
      repaintTable();
    });

    /* 상세 모달 — 닫기 버튼들 + 백드롭 클릭 + ESC */
    pageEl.querySelectorAll('[data-evh-detail-close]').forEach(b => b.addEventListener('click', closeDetailModal));
    const modal = pageEl.querySelector('[data-evh-detail-modal]');
    if (modal) modal.addEventListener('click', e => {
      if (e.target === modal) closeDetailModal();   // 백드롭 영역만 (모달 내부 클릭은 통과)
    });
    /* ESC 키 — 모달이 열린 동안에만 동작. 단일 listener 가 result view 마다 재바인딩되지만 closeDetailModal 자체가 idempotent */
    pageEl.__evhKeyHandler && document.removeEventListener('keydown', pageEl.__evhKeyHandler);
    pageEl.__evhKeyHandler = (e) => {
      if (e.key === 'Escape' && modal && modal.classList.contains('is-open')) closeDetailModal();
    };
    document.addEventListener('keydown', pageEl.__evhKeyHandler);
    /* 대상자 성명 클릭은 ensureRootDelegation 가 openDetailModal 로 라우팅 */
  }

  /* =========================================================
   *  DETAIL 콘텐츠 헬퍼 — openDetailModal 에서 사용. 이전엔 풀스크린
   *  view 였으나 사용자가 모달 전환을 요청하여 view 단계는 제거됨. */
  function renderTargetCard(t, result, isCanceled) {
    return `
      <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:16px 20px;display:flex;align-items:center;gap:16px;">
        ${avatarHTML(t, 'lg')}
        <div style="flex:1;min-width:0;">
          <div style="font-size:var(--fs-lg);font-weight:var(--fw-semibold);color:var(--color-text);">
            ${esc(t.name)} <small style="color:var(--color-text-muted);font-weight:var(--fw-regular);font-size:var(--fs-sm);margin-left:6px;">${esc(t.id)}</small>
          </div>
          <div style="font-size:var(--fs-sm);color:var(--color-text-sub);margin-top:4px;">
            ${esc(t.dept || '-')} · ${esc(t.position || '-')} · ${esc(t.rank || '-')}
            ${t.joinDate ? ` · 입사 ${esc(fmtD(t.joinDate))}` : ''}
          </div>
        </div>
        ${!isCanceled && result ? `
          <div style="text-align:right;">
            <div style="font-size:var(--fs-xs);color:var(--color-text-muted);">총점</div>
            <div style="font-size:var(--fs-2xl);font-weight:var(--fw-bold);color:var(--color-brand-primary);">${result.totalScore}</div>
            <div style="font-size:var(--fs-xs);color:var(--color-text-muted);">100점 만점</div>
          </div>
        ` : ''}
      </section>
    `;
  }

  function renderElementBreakdowns(round, target, type, result) {
    if (!type) return '';
    return renderElementBlock(round, target, type, '역량', result);
  }

  function renderElementBlock(round, target, type, el, result) {
    const proc = (type.process || {})[el];
    const comp = type.competency || null;   /* 역량 양식 — 평가유형에 내장 */
    const elScore = result ? result.elScores[el] : null;

    /* 단계 구성 (역량) */
    const stageList = [];
    if (proc) {
      if (proc.selfEval) stageList.push({ key: 'self', label: '본인 평가' });
      (proc.stages || []).forEach((s, i) => {
        stageList.push({ key: String(i), label: `${i + 1}단계 (${App.HREvalRounds.roleLabel(s.role)})` });
      });
    }

    const header = `
      <header style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;border-bottom:1px solid var(--color-divider);padding-bottom:12px;margin-bottom:14px;">
        <div>
          <h3 style="font-size:var(--fs-lg);font-weight:var(--fw-semibold);margin:0;">
            ${esc(el)} <small style="color:var(--color-text-muted);font-weight:var(--fw-regular);font-size:var(--fs-sm);margin-left:8px;">${esc((type && type.name) || '')}</small>
          </h3>
        </div>
        ${result ? `
          <div style="text-align:right;">
            <div style="font-size:var(--fs-xs);color:var(--color-text-muted);">${esc(el)} 점수</div>
            <div style="font-size:var(--fs-xl);font-weight:var(--fw-bold);color:var(--color-text);">${elScore}<small style="font-size:var(--fs-sm);font-weight:var(--fw-regular);color:var(--color-text-muted);"> 점</small></div>
          </div>
        ` : ''}
      </header>
    `;

    const body = comp
      ? renderCompetencyReadonly(round, target, comp, stageList)
      : `<div style="color:var(--color-text-muted);padding:24px;text-align:center;">역량 양식을 불러올 수 없습니다.</div>`;

    return `
      <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:20px 24px;">
        ${header}
        ${body}
      </section>
    `;
  }

  /* 역량 — 본인/평가자 단계별 점수를 한 표에 가로로 비교 표시 */
  function renderCompetencyReadonly(round, target, comp, stageList) {
    const scale = (comp && comp.scale) || 5;
    const sections = (comp && comp.sections) || [];

    /* 결정적 응답 mock — (round, target, stage, item) 키 해시 → 1~scale */
    const ans = (stageKey, itemId) => {
      const h = seed(round.id + '|' + target.id + '|' + stageKey + '|' + itemId);
      return (h % scale) + 1;
    };
    /* 단계별 평균 — 헤더에 표시 */
    const stageAvg = stageList.map(s => {
      const items = sections.flatMap(sec => sec.items || []);
      const sum = items.reduce((a, it) => a + ans(s.key, it.id), 0);
      const avg = items.length ? (sum / items.length) : 0;
      return Math.round(avg * 10) / 10;
    });

    const stageHeaderHTML = `
      <div style="display:grid;grid-template-columns:1fr ${stageList.map(() => '120px').join(' ')};gap:10px;padding:8px 12px;background:var(--color-surface-alt);border-radius:var(--radius-md);margin-bottom:12px;">
        <small style="color:var(--color-text-muted);font-weight:var(--fw-medium);align-self:center;">단계별 평균</small>
        ${stageList.map((s, i) => `
          <div style="text-align:center;">
            <div style="font-size:var(--fs-xs);color:var(--color-text-muted);">${esc(s.label)}</div>
            <div style="font-size:var(--fs-md);font-weight:var(--fw-semibold);color:var(--color-text);">${stageAvg[i]}<small style="font-weight:var(--fw-regular);color:var(--color-text-muted);"> / ${scale}</small></div>
          </div>
        `).join('')}
      </div>
    `;

    /* 한 문항 = .q-stages 카드. 헤더에 Q번호+질문, 바디에 단계 컬럼 균등 분할. */
    const renderLikertCol = (s, it) => {
      const v = ans(s.key, it.id);
      const opts = Array.from({ length: scale }, (_, k) => {
        const val = k + 1;
        return `<label class="likert__opt ${val === v ? 'is-on' : ''}"><span class="likert__num">${val}</span></label>`;
      }).join('');
      return `
        <div class="q-stages__col">
          <div class="q-stages__col-label">${esc(s.label)}</div>
          <div class="likert likert--readonly likert--compact" data-value="${v}">${opts}</div>
        </div>
      `;
    };

    const sectionsHTML = sections.map((sec, sIdx) => {
      const itemsHTML = (sec.items || []).map((it, iIdx) => `
        <div class="q-stages" style="--q-stages-cols:${stageList.length || 1};">
          <div class="q-stages__head">
            <span class="q-stages__qnum">Q${sIdx + 1}-${iIdx + 1}</span>
            <span class="q-stages__qtext">${esc(it.text)}</span>
          </div>
          <div class="q-stages__body">
            ${stageList.map(s => renderLikertCol(s, it)).join('')}
          </div>
        </div>
      `).join('');
      return `
        <div style="margin-bottom:18px;">
          <div style="display:flex;align-items:center;gap:8px;padding:6px 0;margin-bottom:8px;">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:var(--radius-sm);background:var(--color-brand-primary);color:#fff;font-size:var(--fs-xs);font-weight:var(--fw-bold);">${sIdx + 1}</span>
            <strong style="font-size:var(--fs-md);">${esc(sec.name)}</strong>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;">${itemsHTML}</div>
        </div>
      `;
    }).join('');

    return `
      ${stageList.length ? stageHeaderHTML : ''}
      ${sectionsHTML || `<div style="color:var(--color-text-muted);padding:24px;text-align:center;">문항이 없습니다.</div>`}
    `;
  }

  /* =========================================================
   *  공통 click 위임 — 결과 모달 본문(#evh-result-body)에 1회만 부착.
   *  대상자 성명 클릭 → 상세 모달. */
  function ensureRootDelegation(bodyEl) {
    if (!bodyEl || bodyEl.dataset.evhDelegated === '1') return;
    bodyEl.dataset.evhDelegated = '1';
    bodyEl.addEventListener('click', e => {
      const link = e.target.closest('[data-evh-open-detail]');
      const tr = e.target.closest('[data-evh-target]');
      if (link && tr) { e.preventDefault(); openDetailModal(tr.dataset.evhTarget); }
    });
  }

  /* =========================================================
   *  Public API — 평가 회차 [결과 보기] 에서 호출.
   *   App.HREvalResult.open(roundId)
   * ========================================================= */
  App.HREvalResult = {
    open(roundId) {
      const body = document.getElementById('evh-result-body');
      if (body) ensureRootDelegation(body);
      openResult(roundId);
    },
  };
})();
