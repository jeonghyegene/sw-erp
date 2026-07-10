/* =========================================================
 * Page: HR > 평가 관리 > 평가 진행
 *
 *  개요
 *   - 구성원(개인)이 자신에게 배정된 평가를 진행하는 화면.
 *   - 「평가 회차」에서 [평가 시작] 된 회차 중 status = pending/inProgress 만 노출.
 *   - 회차별로 「내가 해야 할 평가 항목」 을 분해하여 보여줌:
 *       · 내가 평가 대상자 + 평가유형 process[역량].selfEval → 본인 평가 항목 1건
 *       · 다른 대상자에 대한 평가자(직속/차상위/부서장/HR/직접지정) → 대상자별 단계 평가 항목
 *
 *  View
 *   1) list     — 진행중 회차 목록 (내가 참여하는 것만)
 *   2) round    — 단일 회차 진입 — 내가 할 일(=평가 항목) 목록 + 회차 정보
 *   3) evaluate — 한 평가 항목(대상자 1명) 평가 폼 (역량 likert)
 *
 *  데이터
 *   - 회차/평가유형: App.HREvalRounds.* (page-hr-eval-round 가 노출)
 *   - 직원/대상자:   App.HRMembers.list()
 *   - 역량 양식: 평가유형(type.competency) 에 내장 — task.competency 로 전달
 *
 *  현재 사용자
 *   - STATE.currentUserId 로 「내 시점」 을 보유. 화면 상단의 picker 로 전환 가능 (스토리보드용).
 *
 *  UI Kit 재사용
 *   .toolbar / .tbl / .pill / .progress / .pagination / .page-bar
 *   .likert / .likert--readonly / .likert--compact (신규 등록)
 *   .form-field / .input / .select / .cb / .fm-tbl
 *   .av (아바타) / .doc-card (헤더 카드)
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  /* ============ 환경 ============ */
  const TODAY = '2026-05-18';

  /* ============ STATE ============ */
  const STATE = {
    view: 'list',              // 'list' | 'round'  (evaluate 는 round 위에 뜨는 모달로 전환됨)
    currentUserId: null,       // 「내 시점」
    selectedRoundId: null,
    selectedTaskKey: null,     // 평가 입력 모달이 열린 task key (없으면 null)
    /* 응답 — { [roundId]: { [empId]: { [stageKey]: { [element]: { _items: {[itemId]:score}, _comment } } } } }
     *   stageKey 형식: 'self' (selfEval 단계) | '0','1','2',... (process.stages 인덱스) */
    responses: {},
    submitted: {},             // { [roundId]: Set<taskKey> }
    filter: { keyword: '', roleScope: 'all', statusScope: 'all' },
  };

  /* ============ Helpers ============ */
  function $(s, r = document) { return r.querySelector(s); }
  function $$(s, r = document) { return Array.from(r.querySelectorAll(s)); }
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
  /* 성명 셀 — 임직원 관리(page-hr-info-mgmt) nameCellHTML 과 동일 패턴.
   *   사진 + 이름 + 부서·직책(muted inline). 부서·직책 사이 구두점(·)은 둘 다 값 있을 때만. */
  function nameMetaCell(emp) {
    if (!emp) return '<span class="t-muted">-</span>';
    const dept = emp.dept ? esc(emp.dept) : '';
    const pos  = emp.position ? esc(emp.position) : '';
    const dot  = (dept && pos) ? `<span style="color:var(--color-text-muted);font-size:var(--fs-xs);padding:0 2px;" aria-hidden="true">·</span>` : '';
    const meta = (v) => v ? `<span style="color:var(--color-text-muted);font-size:var(--fs-xs);white-space:nowrap;">${v}</span>` : '';
    return `
      <div style="display:flex;align-items:center;gap:8px;min-width:0;">
        ${avatarHTML(emp, 'sm')}
        <strong style="color:var(--color-text);font-weight:var(--fw-medium);white-space:nowrap;">${esc(emp.name || '-')}</strong>
        <span style="display:inline-flex;align-items:center;gap:0;min-width:0;">${meta(dept)}${dot}${meta(pos)}</span>
      </div>
    `;
  }

  /* ============ 데이터 어댑터 ============ */
  function allMembers() {
    return (window.App && App.HRMembers && App.HRMembers.list) ? App.HRMembers.list() : [];
  }
  function memberById(id) { return allMembers().find(e => e.id === id) || null; }
  function isActiveMember(e) { return e && e.status !== 'retired' && e.status !== 'contractExpired'; }

  /* 회차의 대상자 목록 — targetEmpIds 가 있으면 그것, 없으면 targetFilter 로 산출 */
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

  /* 평가자 결정 — direct_assign 외 역할은 결정적(heuristic) 규칙으로 해결 */
  function resolveEvaluator(target, role, round) {
    if (!target) return null;
    const all = allMembers().filter(isActiveMember);
    if (role === 'direct_assign') {
      const a = (round.evaluatorAssignments || {})[target.id] || {};
      /* direct_assign 단계 키 (e.g. '역량_1') 는 listDirectAssignStages 에서 발급 — caller 가 stageKey 전달.
       *   이 함수는 단순 fallback 용으로 호출되므로 a 의 첫 값 반환. */
      const v = Object.values(a).find(Boolean);
      return v || (all.find(e => e.id !== target.id) || {}).id || null;
    }
    /* 같은 부서 — 같은 dept 가 정확히 일치하지 않을 수 있으므로 본부 prefix 기준 fallback */
    const sameDept = all.filter(e => e.id !== target.id && e.dept && target.dept && (e.dept === target.dept));
    /* 직책 기준 role (파트장/팀장/실장/본부장) — 단계·등급 설정과 동일. 반드시 같은 부서 안에서만 해석.
       해당 직책자가 없으면 같은 부서 상위 리더로 대행, 그마저 없으면 미배정(수동). (부서 교차 배정 방지) */
    const ROLE_POS = { part_lead: '파트장', team_lead: '팀장', office_lead: '실장', hq_lead: '본부장' };
    if (ROLE_POS[role]) {
      const posLabel = ROLE_POS[role];
      const exact = sameDept.find(e => e.position === posLabel);
      if (exact) return exact.id;
      const lead = sameDept.find(e => ['본부장', '소장', '팀장'].includes(e.position));
      return lead ? lead.id : null;
    }
    if (role === 'direct_sup') {
      return (sameDept[0] || all.find(e => e.id !== target.id) || {}).id || null;
    }
    if (role === 'next_sup') {
      return (sameDept[1] || sameDept[0] || all.find(e => e.id !== target.id) || {}).id || null;
    }
    if (role === 'dept_head') {
      const head = sameDept.find(e => e.position === '팀장' || e.position === '본부장')
        || sameDept.find(e => e.rank === '부장' || e.rank === '차장')
        || sameDept[0];
      return (head || {}).id || null;
    }
    if (role === 'hr') {
      const hr = all.find(e => /인사/.test(e.dept || '')) || all[0];
      return (hr || {}).id || null;
    }
    return null;
  }

  /* 한 회차에서 userId 가 수행해야 할 평가 항목(taskList) 산출 */
  function listMyTasks(round, userId) {
    const api = App.HREvalRounds;
    if (!round || !userId) return [];
    const type = api.getType(round.typeKey);
    if (!type || !type.process) return [];
    const targets = getRoundTargets(round);
    const tasks = [];

    targets.forEach(t => {
      Object.keys(type.process).forEach(el => {
        const proc = type.process[el] || {};
        /* 본인 평가 — selfEval=true 이고 내가 대상자일 때 */
        if (proc.selfEval && t.id === userId) {
          tasks.push({
            key: `${t.id}|${el}|self`,
            targetId: t.id,
            target: t,
            element: el,
            stageIdx: -1,
            stageKey: 'self',
            stageLabel: '본인 평가 (자기 진단)',
            role: 'self',
            roleKey: 'self',
            competency: type.competency,
            isSelf: true,
          });
        }
        /* 각 평가자 단계 — 내가 평가자로 지정되었으면 */
        const stages = proc.stages || [];
        stages.forEach((s, idx) => {
          let evaluatorId;
          if (s.role === 'direct_assign') {
            const a = (round.evaluatorAssignments || {})[t.id] || {};
            evaluatorId = a[`${el}_${idx}`] || null;
            /* 스토리보드 mock 의 round 들은 evaluatorAssignments 가 비어있을 수 있음 — 결정적 fallback */
            if (!evaluatorId) {
              const all = allMembers().filter(isActiveMember);
              const same = all.filter(e => e.id !== t.id && e.dept === t.dept);
              evaluatorId = (same[(idx + 1) % Math.max(1, same.length)] || same[0] || all[0]).id;
            }
          } else {
            evaluatorId = resolveEvaluator(t, s.role, round);
          }
          if (evaluatorId === userId) {
            tasks.push({
              key: `${t.id}|${el}|${idx}`,
              targetId: t.id,
              target: t,
              element: el,
              stageIdx: idx,
              stageKey: String(idx),
              stageLabel: `${idx + 1}단계 (${api.roleLabel(s.role)})`,
              role: s.role,
              roleKey: s.role,
              competency: type.competency,
              isSelf: false,
            });
          }
        });
      });
    });

    return tasks;
  }

  /* userId 가 어떤 회차들에 참여하는지 (참여 = 내가 한 건이라도 평가할 게 있음) */
  function listMyRounds(userId) {
    const api = App.HREvalRounds;
    if (!api) return [];
    /* 평가 「진행중」 = pending + inProgress */
    const cands = api.listByStatus(['pending', 'inProgress']);
    return cands.filter(r => listMyTasks(r, userId).length > 0);
  }

  /* ============ 응답·진행률 ============ */
  function ensureResponseSlot(roundId, taskKey) {
    if (!STATE.responses[roundId]) STATE.responses[roundId] = {};
    if (!STATE.responses[roundId][taskKey]) STATE.responses[roundId][taskKey] = { _items: {}, _comment: '' };
    return STATE.responses[roundId][taskKey];
  }
  function isTaskSubmitted(roundId, taskKey) {
    const set = STATE.submitted[roundId];
    return set ? set.has(taskKey) : false;
  }
  function markSubmitted(roundId, taskKey) {
    if (!STATE.submitted[roundId]) STATE.submitted[roundId] = new Set();
    STATE.submitted[roundId].add(taskKey);
  }
  function unmarkSubmitted(roundId, taskKey) {
    const s = STATE.submitted[roundId];
    if (s) s.delete(taskKey);
  }

  /* 역량 task 의 답변 완료율 — 모든 문항에 점수 부여되었는지로 판정.
   *   인사·성과는 process 에 안 들어가므로 task 자체가 생성되지 않음 (시스템 산정만). */
  function taskCompletionRatio(task, response) {
    const comp = task.competency || null;
    if (!comp || !comp.sections) return 0;
    const items = comp.sections.flatMap(s => (s.items || []).map(it => it.id));
    if (!items.length) return 0;
    const r = response || { _items: {} };
    const done = items.filter(id => Number(r._items[id]) > 0).length;
    return done / items.length;
  }
  function taskStatus(roundId, task) {
    const r = (STATE.responses[roundId] || {})[task.key];
    const ratio = taskCompletionRatio(task, r);
    if (isTaskSubmitted(roundId, task.key)) return { code: 'done',     label: '제출 완료', pill: 'success', ratio: 1 };
    if (ratio === 0)  return { code: 'todo',  label: '미시작',  pill: '',        ratio: 0 };
    if (ratio < 1)    return { code: 'doing', label: '진행중',  pill: 'warning', ratio };
    return { code: 'ready', label: '제출 전 검토', pill: 'info', ratio };
  }
  function roundMyProgress(roundId, userId) {
    const round = App.HREvalRounds.get(roundId);
    if (!round) return { total: 0, done: 0, ratio: 0 };
    const tasks = listMyTasks(round, userId);
    const done = tasks.filter(t => isTaskSubmitted(roundId, t.key)).length;
    return { total: tasks.length, done, ratio: tasks.length ? done / tasks.length : 0 };
  }

  /* 선행 단계 task 의 key — 본인평가/1단계 등은 null. 2단계+ 는 이전 stageIdx 의 평가 task key.
   *   ※ 1단계가 selfEval 에 의존하는지는 회사 프로세스마다 다르므로 여기서는 게이팅 대상에서 제외 — 평가자 단계 간 의존만 적용. */
  function prerequisiteTaskKey(task) {
    if (!task || task.isSelf) return null;
    if (task.stageKey === 'self') return null;
    const idx = typeof task.stageIdx === 'number' ? task.stageIdx : -1;
    if (idx <= 0) return null;
    return `${task.targetId}|${task.element}|${idx - 1}`;
  }
  function isTaskLocked(roundId, task) {
    const prereq = prerequisiteTaskKey(task);
    if (!prereq) return false;
    return !isTaskSubmitted(roundId, prereq);
  }
  function lockedStageLabel(task) {
    /* 선행 단계 명칭 — 카드 상태 pill 텍스트 ("1단계 평가 대기중") */
    const idx = task.stageIdx;
    return `${idx}단계 평가 대기중`;
  }

  /* ============ 현재 사용자 picker 옵션 ============
   *   스토리보드 데모용 — 다양한 역할(평가 대상/평가자) 을 가진 후보를 우선 노출.
   *   실서비스에서는 로그인 사용자로 고정되며 picker 자체가 없다. */
  function pickViewerCandidates() {
    const all = allMembers().filter(isActiveMember);
    /* 상위 8명 — 스토리보드에서는 충분 */
    return all.slice(0, 12);
  }
  function defaultViewer() {
    const cands = pickViewerCandidates();
    const api = App.HREvalRounds;
    if (api && api.listByStatus) {
      const active = api.listByStatus(['pending', 'inProgress']);
      /* 1순위 — 앞 단계(1단계 등)가 이미 존재하는 후속 단계(2차 등) 평가자.
         → 진입 즉시 「이미 앞선 단계가 완료된 대상자」의 평가하기에서 이전 단계 평가내용을 확인할 수 있다. */
      for (const c of cands) {
        for (const r of active) {
          if (listMyTasks(r, c.id).some(t => !t.isSelf && t.stageIdx >= 1)) return c.id;
        }
      }
      /* 2순위 — 평가할 항목이 하나라도 있는 후보 */
      for (const c of cands) {
        for (const r of active) {
          if (listMyTasks(r, c.id).length) return c.id;
        }
      }
    }
    return (cands[0] || {}).id || null;
  }

  /* ============ 평가요소 표시 헬퍼 ============ */
  function elementBadge(el) {
    const map = { '역량': 'pill--info', '인사': 'pill--soft-blue', '성과': 'pill--soft-green' };
    return `<span class="pill ${map[el] || ''}" style="font-size:var(--fs-xs);">${esc(el)}</span>`;
  }
  function roundStatusPill(code) {
    const s = (App.HREvalRounds && App.HREvalRounds.statusLabel) ? App.HREvalRounds.statusLabel(code) : null;
    if (!s) return '';
    return `<span class="pill${s.pill ? ' pill--' + s.pill : ''}">${esc(s.label)}</span>`;
  }

  /* =========================================================
   *  VIEW: INTEGRATED (회차 선택 dropdown + 회차 정보 + 평가 태스크 그리드)
   *   기존 list (회차 목록) + round (회차 내 평가 항목) 를 단일 뷰로 통합.
   *   - 상단 좌측: 회차 선택 dropdown (평가 가능한 회차들)
   *   - 상단 우측: 회차 정보 카드 (기간, 진행률, 회차 상태)
   *   - 하단: 평가해야 할 task 그리드. 행 [평가하기] 클릭 → offcanvas 로 평가 상세
   * ========================================================= */
  function renderListView(pageEl) {
    STATE.view = 'list';
    const userId = STATE.currentUserId;
    const myRounds = listMyRounds(userId);
    /* 선택된 회차 자동 결정 — 기존 selection 우선, 없으면 첫 회차 */
    let currentRound = null;
    if (STATE.selectedRoundId) {
      currentRound = myRounds.find(r => r.id === STATE.selectedRoundId) || null;
    }
    if (!currentRound && myRounds.length) {
      currentRound = myRounds[0];
      STATE.selectedRoundId = currentRound.id;
    }
    /* 선행 단계(자기진단·이전 평가자) 제출 mock — 통합 뷰에서도 실행되어야 스텝퍼/[평가내용 보기]가 보인다. */
    if (currentRound) ensureMockPriorSubmissions(currentRound, userId);

    const viewerOpts = pickViewerCandidates().map(e => {
      const sel = e.id === userId ? 'selected' : '';
      return `<option value="${esc(e.id)}" ${sel}>${esc(e.name)} — ${esc(e.dept || '-')}${e.position ? ' · ' + esc(e.position) : ''}</option>`;
    }).join('');
    /* 회차 옵션 — 평가명 + 상태 (예: "2026년 2분기 정기 역량평가 (진행중)") */
    const statusName = (st) => {
      const s = App.HREvalRounds.statusLabel ? App.HREvalRounds.statusLabel(st) : null;
      return s ? s.label : st;
    };
    const roundOpts = myRounds.map(r => `<option value="${esc(r.id)}"${r.id === (currentRound && currentRound.id) ? ' selected' : ''}>${esc(r.name)} (${esc(statusName(r.status))})</option>`).join('');

    /* 상단 바 — 평가 회차(드롭다운) · 평가 기간 · 진행률 (선택된 회차 기준) */
    const mmdd = (d) => { if (!d) return '?'; const p = String(d).split('-'); return p.length >= 3 ? `${p[1]}/${p[2]}` : d; };
    let periodVal = '<span class="t-muted">-</span>';
    let progVal   = '<span class="t-muted">-</span>';
    let tasksGridHTML = '';
    if (currentRound) {
      periodVal = `${mmdd(currentRound.inputFrom)} ~ ${mmdd(currentRound.inputTo)} <span style="color:var(--color-warning);font-weight:var(--fw-medium);margin-left:4px;">마감</span>`;
      const prog = roundMyProgress(currentRound.id, userId);
      const pct = Math.round(prog.ratio * 100);
      progVal = `${prog.done} / ${prog.total}명 <span style="color:var(--color-text-muted);font-weight:var(--fw-regular);margin-left:2px;">(${pct}%)</span>`;
      tasksGridHTML = renderTaskList(currentRound, userId, listMyTasks(currentRound, userId));
    } else {
      tasksGridHTML = `<div style="padding:48px 20px;text-align:center;color:var(--color-text-muted);">진행중인 평가 회차가 없습니다.</div>`;
    }

    pageEl.innerHTML = `
      <div style="padding:14px 24px;background:var(--color-surface);border-bottom:1px solid var(--color-divider);display:flex;align-items:center;gap:48px;flex-wrap:wrap;">
        <div style="display:flex;flex-direction:column;gap:3px;min-width:0;">
          <span style="font-size:var(--fs-xs);color:var(--color-text-muted);">평가 회차</span>
          <select class="select" id="evi-round-picker" style="border-color:transparent;background-color:transparent;box-shadow:none;padding-left:0;height:auto;font-size:var(--fs-md);font-weight:var(--fw-semibold);color:var(--color-text);min-width:0;width:auto;max-width:420px;cursor:pointer;">
            ${myRounds.length ? roundOpts : '<option value="">진행중인 회차 없음</option>'}
          </select>
        </div>
        <div style="display:flex;flex-direction:column;gap:3px;">
          <span style="font-size:var(--fs-xs);color:var(--color-text-muted);">평가 기간</span>
          <span style="font-size:var(--fs-md);font-weight:var(--fw-semibold);color:var(--color-text);">${periodVal}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:3px;">
          <span style="font-size:var(--fs-xs);color:var(--color-text-muted);">진행률</span>
          <span style="font-size:var(--fs-md);font-weight:var(--fw-semibold);color:var(--color-text);">${progVal}</span>
        </div>
      </div>

      <div style="flex:1;min-height:0;display:flex;flex-direction:column;overflow:auto;padding:16px 22px;background:var(--color-surface-alt);">
        ${tasksGridHTML}
      </div>

      <!-- 평가 입력 OffCanvas — task 카드 [평가하기/이어하기/검토] 클릭 시 openEvaluate 가 콘텐츠 채워 띄움 -->
      <div class="oc-backdrop" data-evi-eval-host></div>
      <aside class="offcanvas offcanvas--lg" data-evi-eval-modal aria-hidden="true" style="width:760px;max-width:100vw;">
        <header class="offcanvas__header">
          <div style="flex:1;min-width:0;">
            <div class="offcanvas__title" data-evi-eval-title>평가 입력</div>
            <div class="page-bar__sub" style="margin-top:2px;font-size:var(--fs-sm);color:var(--color-text-muted);" data-evi-eval-sub></div>
          </div>
          <button class="offcanvas__close" type="button" data-evi-eval-close aria-label="닫기">✕</button>
        </header>
        <div class="offcanvas__body" style="background:var(--color-surface-alt);" data-evi-eval-body></div>
        <div class="offcanvas__footer" data-evi-eval-footer></div>
      </aside>

      <!-- 이전 단계 평가내용 모달 — 평가 OffCanvas 위에 표시(over-oc). 수습 평가의 「평가내용 보기」와 동일 패턴 -->
      <div class="modal-backdrop modal-backdrop--over-oc" data-evi-prior-modal>
        <div class="modal" style="max-width:720px;">
          <div class="modal__header">
            <div class="modal__title" data-evi-prior-title>이전 단계 평가 내용</div>
            <button class="modal__close" type="button" data-evi-prior-close aria-label="닫기">✕</button>
          </div>
          <div class="modal__body" style="background:var(--color-surface-alt);padding:18px 20px;" data-evi-prior-body></div>
          <div class="modal__footer"><button class="btn" type="button" data-evi-prior-close>닫기</button></div>
        </div>
      </div>

      <div data-evi-viewer-fab style="position:fixed;right:24px;bottom:24px;z-index:50;display:flex;align-items:center;gap:8px;padding:8px 14px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-pill);box-shadow:var(--shadow-md);">
        <span style="font-size:var(--fs-xs);color:var(--color-text-muted);">내 시점</span>
        <select class="select select--sm" id="evi-viewer" style="min-width:240px;border:0;background:transparent;font-weight:var(--fw-medium);">${viewerOpts}</select>
      </div>
    `;

    bindList(pageEl);
    bindEvaluateModalChrome(pageEl);
  }

  function renderListRows(rounds, userId) {
    if (!rounds.length) {
      return `<tr><td colspan="8" style="text-align:center;color:var(--color-text-muted);padding:48px 0;">
        진행중인 평가 회차에 참여 항목이 없습니다.
      </td></tr>`;
    }
    return rounds.map(r => {
      const type = App.HREvalRounds.getType(r.typeKey);
      const tasks = listMyTasks(r, userId);
      const selfTasks  = tasks.filter(t => t.isSelf).length;
      const otherCount = new Set(tasks.filter(t => !t.isSelf).map(t => t.targetId)).size;
      const roleChips = [];
      if (selfTasks)  roleChips.push(`<span class="pill pill--info" style="font-size:var(--fs-xs);">본인 평가</span>`);
      if (otherCount) roleChips.push(`<span class="pill" style="font-size:var(--fs-xs);">${otherCount}명 평가</span>`);
      const prog = roundMyProgress(r.id, userId);
      const pct = Math.round(prog.ratio * 100);

      const disabled = r.status === 'pending';
      return `
        <tr data-evi-round="${esc(r.id)}" style="${disabled ? 'opacity:.6;' : ''}">
          <td style="white-space:nowrap;">${esc(r.id)}</td>
          <td style="white-space:nowrap;">${esc(type ? type.name : r.typeKey)}</td>
          <td style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:340px;">
            <a href="#" data-evi-open style="color:var(--color-brand-primary);font-weight:var(--fw-medium);">${esc(r.name)}</a>
          </td>
          <td style="white-space:nowrap;">${esc(periodText(r.inputFrom, r.inputTo))}</td>
          <td>${roleChips.join(' ') || '<span class="t-muted" style="font-size:var(--fs-xs);">-</span>'}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px;">
              <div class="progress" style="flex:1;"><div class="progress__bar${pct >= 100 ? ' progress__bar--success' : ''}" style="width:${pct}%;"></div></div>
              <small style="white-space:nowrap;color:var(--color-text-sub);">${prog.done} / ${prog.total}</small>
            </div>
          </td>
          <td style="text-align:center;">${roundStatusPill(r.status)}</td>
          <td style="text-align:center;">
            <button class="btn btn--xs ${disabled ? '' : 'btn--primary'}" type="button" data-evi-enter ${disabled ? 'disabled title="입력 시작일 전입니다."' : ''}>
              ${disabled ? '대기' : (pct >= 100 ? '검토' : (pct > 0 ? '이어하기' : '평가 시작'))}
            </button>
          </td>
        </tr>`;
    }).join('');
  }

  function bindList(pageEl) {
    const sel = $('#evi-viewer', pageEl);
    if (sel) sel.addEventListener('change', () => {
      STATE.currentUserId = sel.value;
      STATE.selectedRoundId = null;  /* 시점 바뀌면 회차도 재선정 */
      renderListView(pageEl);
    });
    /* 회차 선택 dropdown — 회차 전환 시 같은 뷰 재렌더 */
    const roundSel = $('#evi-round-picker', pageEl);
    if (roundSel) roundSel.addEventListener('change', () => {
      STATE.selectedRoundId = roundSel.value || null;
      renderListView(pageEl);
    });
    /* 그 외 클릭(평가 task 진입 등) 은 ensureRootDelegation 가 처리 */
  }

  /* =========================================================
   *  VIEW: ROUND (선택된 회차의 「내 할 일」 목록)
   * ========================================================= */
  function openRound(roundId) {
    STATE.view = 'round';
    STATE.selectedRoundId = roundId;
    STATE.selectedTaskKey = null;
    renderRoundView(document.getElementById('page-hr-eval-input'));
  }
  function exitToList() {
    STATE.view = 'list';
    STATE.selectedRoundId = null;
    renderListView(document.getElementById('page-hr-eval-input'));
  }

  function renderRoundView(pageEl) {
    const userId = STATE.currentUserId;
    const round = App.HREvalRounds.get(STATE.selectedRoundId);
    if (!round) { exitToList(); return; }
    ensureMockPriorSubmissions(round, userId);
    const type = App.HREvalRounds.getType(round.typeKey);
    const tasks = listMyTasks(round, userId);
    const prog = roundMyProgress(round.id, userId);
    const pct = Math.round(prog.ratio * 100);

    pageEl.innerHTML = `
      <div class="page-bar">
        <button class="page-bar__back" type="button" data-evi-back>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          목록
        </button>
        <div class="page-bar__divider"></div>
        <div>
          <div class="page-bar__title">${esc(round.name)} <span style="margin-left:8px;vertical-align:middle;">${roundStatusPill(round.status)}</span></div>
        </div>
        <div class="page-bar__spacer" style="flex:1;"></div>
        <div class="page-bar__actions">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:var(--fs-xs);color:var(--color-text-muted);">내 진행률</span>
            <div class="progress" style="width:140px;"><div class="progress__bar${pct >= 100 ? ' progress__bar--success' : ''}" style="width:${pct}%;"></div></div>
            <strong style="font-size:var(--fs-sm);color:var(--color-text);white-space:nowrap;">${prog.done} / ${prog.total} <small style="color:var(--color-text-muted);font-weight:var(--fw-regular);">(${pct}%)</small></strong>
          </div>
        </div>
      </div>

      <div data-evi-round-scroll style="flex:1;min-width:0;min-height:0;overflow-y:auto;overflow-x:hidden;padding:20px 24px 40px;background:var(--color-surface-alt);">
        ${renderRoundInfoCard(round, type, userId)}
        ${renderTaskList(round, userId, tasks)}
      </div>

      <!-- 평가 입력 모달 — task 카드 [평가하기/이어하기/검토] 클릭 시 openEvaluate 가 콘텐츠 채워 띄움 -->
      <div class="modal-backdrop" data-evi-eval-modal>
        <div class="modal modal--xl" style="max-height:92vh;">
          <div class="modal__header">
            <div style="flex:1;min-width:0;">
              <div class="modal__title" data-evi-eval-title>평가 입력</div>
              <div class="page-bar__sub" style="margin-top:2px;" data-evi-eval-sub></div>
            </div>
            <button class="modal__close" type="button" data-evi-eval-close aria-label="닫기">✕</button>
          </div>
          <div class="modal__body" style="background:var(--color-surface-alt);padding:20px 24px;display:flex;flex-direction:column;gap:14px;" data-evi-eval-body></div>
          <div class="modal__footer" data-evi-eval-footer></div>
        </div>
      </div>
    `;

    pageEl.querySelector('[data-evi-back]').addEventListener('click', exitToList);
    bindEvaluateModalChrome(pageEl);
    /* task 항목 클릭은 ensureRootDelegation 가 처리 */
  }

  /* 통합 뷰에 부착되는 offcanvas 외곽 핸들러 — 닫기 버튼 / backdrop / ESC */
  function bindEvaluateModalChrome(pageEl) {
    const oc = pageEl.querySelector('[data-evi-eval-modal]');
    const bd = pageEl.querySelector('[data-evi-eval-host]');
    if (!oc) return;
    pageEl.querySelectorAll('[data-evi-eval-close]').forEach(b => b.addEventListener('click', () => closeEvaluate(pageEl)));
    if (bd) bd.addEventListener('click', () => closeEvaluate(pageEl));
    /* 이전 단계 평가내용 모달 — 열기/닫기 (페이지당 1회만 위임 바인딩) */
    if (!pageEl.__eviPriorBound) {
      pageEl.__eviPriorBound = true;
      pageEl.addEventListener('click', (e) => {
        const pb = e.target.closest('[data-evi-prior]');
        if (pb) { openPriorStage(pageEl, pb.dataset.eviPrior); return; }
        if (e.target.closest('[data-evi-prior-close]') || e.target.matches('[data-evi-prior-modal]')) { closePriorStage(pageEl); return; }
      });
    }
    pageEl.__eviKeyHandler && document.removeEventListener('keydown', pageEl.__eviKeyHandler);
    pageEl.__eviKeyHandler = (e) => {
      if (e.key !== 'Escape') return;
      const priorM = pageEl.querySelector('[data-evi-prior-modal].is-open');
      if (priorM) { priorM.classList.remove('is-open'); return; }   /* 이전 단계 모달 먼저 닫기 */
      if (oc.classList.contains('is-open')) closeEvaluate(pageEl);
    };
    document.addEventListener('keydown', pageEl.__eviKeyHandler);
  }

  function renderRoundInfoCard(round, type, userId) {
    const me = memberById(userId);
    const isTarget = getRoundTargets(round).some(t => t.id === userId);
    const roleChips = [];
    if (isTarget) roleChips.push(`<span class="pill pill--info" style="font-size:var(--fs-xs);">평가 대상자</span>`);
    roleChips.push(`<span class="pill" style="font-size:var(--fs-xs);">평가자</span>`);

    const cell = (label, value) => `
      <div>
        <div style="font-size:var(--fs-xs);color:var(--color-text-muted);">${esc(label)}</div>
        <div style="margin-top:4px;font-weight:var(--fw-medium);color:var(--color-text);">${value}</div>
      </div>
    `;

    return `
      <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:18px 22px;margin-bottom:16px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px 20px;">
        ${cell('평가번호', esc(round.id))}
        ${cell('평가유형', esc((type && type.name) || round.typeKey))}
        ${cell('평가 대상기간', esc(periodText(round.periodFrom, round.periodTo)))}
        ${cell('결과 유형', esc((type && type.resultType) || '-'))}
        ${cell('평가요소 구성', `<div style="display:flex;flex-wrap:wrap;gap:4px;">${(type ? type.elements : []).map(el => elementBadge(el)).join('')}</div>`)}
        ${cell('내 시점', `<div style="display:flex;align-items:center;gap:8px;">${me ? avatarHTML(me, 'sm') : ''}<span>${esc(me ? me.name : '-')}</span><small style="color:var(--color-text-muted);font-weight:var(--fw-regular);">${esc(me ? (me.dept || '-') : '')}</small></div>`)}
        ${cell('내 참여 형태', `<div style="display:flex;flex-wrap:wrap;gap:4px;">${roleChips.join('')}</div>`)}
      </section>
    `;
  }

  function renderTaskList(round, userId, tasks) {
    if (!tasks.length) {
      return `
        <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:40px 24px;text-align:center;color:var(--color-text-muted);">
          이 회차에서 진행할 평가 항목이 없습니다.
        </section>
      `;
    }
    /* 본인 평가가 먼저, 타인 평가는 그 뒤로 정렬해서 그리드 1개에 노출 */
    const sorted = tasks.slice().sort((a, b) => {
      if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
      return 0;
    });

    return `
      <div class="grid-wrap" style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden;">
        <div class="grid-scroll">
          <table class="tbl tbl--hover">
            <thead>
              <tr>
                <th style="width:80px;text-align:center;">구분</th>
                <th style="width:90px;">평가요소</th>
                <th style="min-width:280px;">대상자</th>
                <th style="width:160px;">평가 단계</th>
                <th style="width:140px;text-align:center;">상태</th>
                <th style="width:170px;">진행률</th>
                <th style="width:120px;text-align:center;"></th>
              </tr>
            </thead>
            <tbody>
              ${sorted.map(t => renderTaskRow(round, t)).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
  function renderTaskRow(round, task) {
    const status = taskStatus(round.id, task);
    const pct = Math.round(status.ratio * 100);
    const locked = isTaskLocked(round.id, task);
    const statusPill = locked
      ? `<span class="pill" style="font-size:var(--fs-xs);white-space:nowrap;background:var(--color-surface-alt);color:var(--color-text-muted);">${esc(lockedStageLabel(task))}</span>`
      : `<span class="pill${status.pill ? ' pill--' + status.pill : ''}" style="font-size:var(--fs-xs);white-space:nowrap;">${esc(status.label)}</span>`;

    const btnLabel = locked ? '평가하기'
                   : status.code === 'done' ? '검토'
                   : status.code === 'todo' ? '평가하기'
                   : '이어하기';
    const btnPrimary = !locked && status.code !== 'done';
    const btnDisabled = locked ? 'disabled' : '';

    /* 대상자 셀 — 임직원 관리 성명 컬럼과 동일: 사진 + 이름 + 부서·직책(inline muted). 본인 평가도 동일(구분 컬럼이 본인 표시). */
    const targetCell = nameMetaCell(task.target);

    return `
      <tr ${locked ? 'style="opacity:.6;"' : ''}>
        <td style="text-align:center;">${task.isSelf ? '<span class="pill pill--soft-blue" style="font-size:var(--fs-xs);">본인</span>' : '<span class="pill" style="font-size:var(--fs-xs);">타인</span>'}</td>
        <td>${elementBadge(task.element)}</td>
        <td>${targetCell}</td>
        <td>${renderStageDots(round, task)}</td>
        <td style="text-align:center;white-space:nowrap;">${statusPill}</td>
        <td>
          <div style="display:flex;align-items:center;gap:6px;">
            <div class="progress" style="flex:1;height:6px;"><div class="progress__bar${pct >= 100 ? ' progress__bar--success' : ''}" style="width:${pct}%;"></div></div>
            <small style="color:${status.code === 'done' ? 'var(--color-success)' : 'var(--color-text-sub)'};font-weight:var(--fw-medium);min-width:34px;text-align:right;font-size:var(--fs-xs);">${pct}%</small>
          </div>
        </td>
        <td style="text-align:center;">
          <button class="btn btn--xs ${btnPrimary ? 'btn--primary' : ''}" type="button" data-evi-task="${esc(task.key)}" ${btnDisabled}>${btnLabel}</button>
        </td>
      </tr>
    `;
  }

  /* 대상자+평가요소의 전체 평가 단계 chain —
   *   본인 평가(selfEval) → 1단계 → 2단계 ... → 확정.
   *   각 step.taskKey 로 제출 여부를 조회한다. terminal(확정) 은 회차 finalized 여부로 완료 판정. */
  function buildStageChain(round, task) {
    const type = App.HREvalRounds.getType(round.typeKey);
    const proc = (type && type.process && type.process[task.element]) || {};
    const stages = proc.stages || [];
    const chain = [];
    if (proc.selfEval) chain.push({ key: 'self', label: '본인 평가', taskKey: `${task.targetId}|${task.element}|self` });
    stages.forEach((s, i) => chain.push({
      key: String(i),
      label: `${i + 1}단계 (${App.HREvalRounds.roleLabel(s.role)})`,
      taskKey: `${task.targetId}|${task.element}|${i}`,
    }));
    chain.push({ key: 'final', label: '확정', terminal: true });
    return chain;
  }

  /* 평가 단계 컴팩트 스텝퍼 — UI Kit .step-dots (그리드 셀용).
   *   완료 단계=진한 원, 현재 task 단계=브랜드 원, 대기=테두리 원. 평가관리 화면 참고. */
  function renderStageDots(round, task) {
    const chain = buildStageChain(round, task);
    const items = chain.map((s, i) => {
      let cls = '';
      if (s.terminal) cls = (round.status === 'finalized') ? 'is-done' : '';
      else if (s.key === task.stageKey) cls = 'is-current';
      else if (isTaskSubmitted(round.id, s.taskKey)) cls = 'is-done';
      return `<li class="step-dots__item ${cls}"><span class="step-dots__dot" title="${esc(s.label)}">${i + 1}</span></li>`;
    }).join('');
    return `<ol class="step-dots step-dots--sm" style="padding:0;margin:0;list-style:none;">${items}</ol>`;
  }

  /* 한 task 의 「평가요소 전체 단계」 stepper —
   *   대상자+평가요소의 전체 단계 chain(본인 평가 → 1단계 → 2단계 ...) 에서
   *   현재 task 가 어느 위치인지, 앞 단계가 제출됐는지를 시각화. */
  function renderStageStepper(round, task) {
    const type = App.HREvalRounds.getType(round.typeKey);
    if (!type || !type.process) return '';
    const proc = type.process[task.element] || {};
    const stages = proc.stages || [];
    const steps = [];
    if (proc.selfEval) {
      steps.push({
        key: 'self',
        label: '본인 평가',
        taskKey: `${task.targetId}|${task.element}|self`,
      });
    }
    stages.forEach((s, i) => {
      steps.push({
        key: String(i),
        label: `${i + 1}단계`,
        taskKey: `${task.targetId}|${task.element}|${i}`,
      });
    });
    if (steps.length < 2) return '';   /* 단일 단계면 stepper 표시 의미 없음 */

    const curIdx = steps.findIndex(s => s.key === task.stageKey);
    return `
      <ol class="steps-h" style="margin:0;">
        ${steps.map((s, i) => {
          const isCurrent = i === curIdx;
          const submitted = isTaskSubmitted(round.id, s.taskKey);
          const cls = isCurrent ? 'is-current' : (submitted ? 'is-done' : '');
          return `
            <li class="steps-h__item ${cls}">
              <span class="steps-h__num">${i + 1}</span>
              <div class="steps-h__body"><span class="steps-h__title">${esc(s.label)}</span></div>
            </li>
          `;
        }).join('')}
      </ol>
    `;
  }

  /* 스토리보드 데모용 — 사용자 task 의 선행 단계는 「이미 다른 평가자가 제출」 한 것으로 간주.
     실서비스에서는 평가자별 제출 상태가 실 데이터로 들어오므로 불필요. round 별 1회만 실행. */
  function ensureMockPriorSubmissions(round, userId) {
    if (!round || !userId) return;
    if (!STATE._mockPriorMarked) STATE._mockPriorMarked = new Set();
    /* 가드는 (회차+시점) 단위 — 「내 시점」 을 바꾸면 새 시점의 선행 단계도 다시 mock 처리되어야 한다. */
    const markKey = `${round.id}|${userId}`;
    if (STATE._mockPriorMarked.has(markKey)) return;
    STATE._mockPriorMarked.add(markKey);
    const type = App.HREvalRounds.getType(round.typeKey);
    if (!type || !type.process) return;
    const comp = type.competency || null;
    const scale = (comp && comp.scale) || 5;
    const itemIds = (comp && comp.sections) ? comp.sections.flatMap(s => (s.items || []).map(it => it.id)) : [];
    /* 선행 단계를 「제출 완료 + 점수·코멘트 입력」 상태로 mock — [평가내용 보기]가 빈 화면이 되지 않도록 한다. */
    const seedSubmitted = (key, who) => {
      const slot = ensureResponseSlot(round.id, key);
      if (Object.keys(slot._items).length === 0) {
        itemIds.forEach((id, idx) => { slot._items[id] = ((idx * 2 + 2) % scale) + 1; });   // 점수 분포 (1~scale)
        slot._comment = `${who} 평가 의견(데모): 담당 업무에서 기대 수준을 대체로 충족하며 협업 태도가 양호합니다.`;
      }
      markSubmitted(round.id, key);
    };
    listMyTasks(round, userId).forEach(t => {
      if (t.isSelf) return;
      const proc = type.process[t.element] || {};
      /* 본인 평가가 선행으로 잡혀 있으면 — 자기 진단도 이미 제출된 것으로 mock */
      if (proc.selfEval) seedSubmitted(`${t.targetId}|${t.element}|self`, '자기진단');
      /* 내 stage 이전의 평가자 단계들도 모두 제출 처리 */
      for (let i = 0; i < t.stageIdx; i++) seedSubmitted(`${t.targetId}|${t.element}|${i}`, `${i + 1}단계`);
    });
  }

  function taskCard(round, task) {
    const status = taskStatus(round.id, task);
    const pct = Math.round(status.ratio * 100);
    const locked = isTaskLocked(round.id, task);
    const stepperHTML = renderStageStepper(round, task);

    /* 상태 pill — 잠겼으면 'N단계 평가 대기중', 아니면 기존 status.label */
    const statusPill = locked
      ? `<span class="pill" style="font-size:var(--fs-xs);background:var(--color-surface-alt);color:var(--color-text-muted);">${esc(lockedStageLabel(task))}</span>`
      : `<span class="pill${status.pill ? ' pill--' + status.pill : ''}" style="font-size:var(--fs-xs);">${esc(status.label)}</span>`;

    /* 카드 헤더 — 본인 평가는 '본인 평가' 라벨 / 타인 평가는 대상자 아바타+이름+소속 */
    const headerEl = task.isSelf
      ? `<div class="task-card__head">
           <div style="display:flex;align-items:center;gap:8px;min-width:0;">
             ${elementBadge(task.element)}
             <strong style="font-size:var(--fs-md);color:var(--color-text);">본인 평가</strong>
           </div>
           ${statusPill}
         </div>`
      : `<div class="task-card__head" style="gap:10px;">
           <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1;">
             ${avatarHTML(task.target, 'sm')}
             <div style="min-width:0;flex:1;">
               <div style="display:flex;align-items:baseline;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                 <strong style="color:var(--color-text);font-size:var(--fs-md);">${esc(task.target.name)}</strong>
                 <small style="color:var(--color-text-muted);font-weight:var(--fw-regular);font-size:var(--fs-xs);">${esc(task.target.id)}</small>
               </div>
               <div style="font-size:var(--fs-xs);color:var(--color-text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                 ${esc(task.target.dept || '-')}${task.target.position ? ' · ' + esc(task.target.position) : ''}
               </div>
             </div>
           </div>
           ${statusPill}
         </div>`;

    /* 메타 — 타인 평가에 한해 평가요소 badge + 현재 단계 라벨 (본인은 헤더에 이미 노출) */
    const metaRow = task.isSelf ? '' : `
      <div class="task-card__row" style="gap:6px;flex-wrap:wrap;">
        ${elementBadge(task.element)}
        <span style="color:var(--color-text-sub);font-size:var(--fs-xs);">${esc(task.stageLabel)}</span>
      </div>
    `;

    /* 스텝퍼 (다단계일 때만) */
    const stepperRow = stepperHTML
      ? `<div class="task-card__row" style="display:block;">${stepperHTML}</div>`
      : '';

    /* 액션 — 잠금/완료/진행 따라 라벨·스타일 분기 */
    const btnLabel = locked ? '평가하기'
                   : status.code === 'done' ? '검토'
                   : status.code === 'todo' ? '평가하기'
                   : '이어하기';
    const btnPrimary = !locked && status.code !== 'done';
    const btnDisabled = locked ? 'disabled' : '';

    /* 푸터 좌측 — 잠금이면 안내 문구, 아니면 진행률(컴팩트 바 + %) */
    const footLeft = locked
      ? `<small style="color:var(--color-text-muted);font-size:var(--fs-xs);">선행 단계 대기중</small>`
      : `<div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0;max-width:160px;">
           <div class="progress" style="flex:1;height:6px;"><div class="progress__bar${pct >= 100 ? ' progress__bar--success' : ''}" style="width:${pct}%;"></div></div>
           <small style="color:${status.code === 'done' ? 'var(--color-success)' : 'var(--color-text-sub)'};font-weight:var(--fw-medium);min-width:34px;text-align:right;font-size:var(--fs-xs);">${pct}%</small>
         </div>`;

    return `
      <div class="task-card ${locked ? 'is-locked' : ''}">
        ${headerEl}
        <div class="task-card__body">
          ${metaRow}
          ${stepperRow}
        </div>
        <div class="task-card__foot">
          ${footLeft}
          <button class="btn btn--xs ${btnPrimary ? 'btn--primary' : ''}" type="button" data-evi-task="${esc(task.key)}" ${btnDisabled}>
            ${btnLabel}
          </button>
        </div>
      </div>
    `;
  }

  /* =========================================================
   *  EVALUATE — round 뷰 위에 뜨는 모달. STATE.view 단계는 더 이상 'evaluate' 가 없음.
   * ========================================================= */
  function openEvaluate(taskKey) {
    const pageEl = document.getElementById('page-hr-eval-input');
    if (!pageEl) return;
    STATE.selectedTaskKey = taskKey;
    populateEvaluateModal(pageEl);
    /* offcanvas + backdrop 토글 */
    const oc = pageEl.querySelector('[data-evi-eval-modal]');
    const bd = pageEl.querySelector('[data-evi-eval-host]');
    if (oc) { oc.classList.add('is-open'); oc.setAttribute('aria-hidden', 'false'); }
    if (bd) bd.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeEvaluate(pageEl) {
    pageEl = pageEl || document.getElementById('page-hr-eval-input');
    if (!pageEl) return;
    const oc = pageEl.querySelector('[data-evi-eval-modal]');
    const bd = pageEl.querySelector('[data-evi-eval-host]');
    if (oc) { oc.classList.remove('is-open'); oc.setAttribute('aria-hidden', 'true'); }
    if (bd) bd.classList.remove('is-open');
    document.body.style.overflow = '';
    STATE.selectedTaskKey = null;
    /* 평가 입력 후 진행률 변동 가능 → 현재 뷰 재렌더 (선택 회차 유지) */
    renderListView(pageEl);
  }

  function findTask(roundId, taskKey) {
    const round = App.HREvalRounds.get(roundId);
    const tasks = listMyTasks(round, STATE.currentUserId);
    return tasks.find(t => t.key === taskKey) || null;
  }

  /* 모달 헤더/바디/푸터를 현재 task 상태로 채움. 저장·제출·제출취소 시 같은 함수로 재렌더. */
  function populateEvaluateModal(pageEl) {
    const round = App.HREvalRounds.get(STATE.selectedRoundId);
    if (!round) { closeEvaluate(pageEl); return; }
    ensureMockPriorSubmissions(round, STATE.currentUserId);   /* 평가 모달 직전에도 선행 단계 mock 보장 */
    const task = findTask(round.id, STATE.selectedTaskKey);
    if (!task) { closeEvaluate(pageEl); return; }
    const type = App.HREvalRounds.getType(round.typeKey);
    const comp = (task.competency) || (type && type.competency) || null;
    const status = taskStatus(round.id, task);
    const submitted = isTaskSubmitted(round.id, task.key);

    const titleEl  = pageEl.querySelector('[data-evi-eval-title]');
    const subEl    = pageEl.querySelector('[data-evi-eval-sub]');
    const bodyEl   = pageEl.querySelector('[data-evi-eval-body]');
    const footerEl = pageEl.querySelector('[data-evi-eval-footer]');

    titleEl.innerHTML = `
      ${task.isSelf ? '본인 평가' : '평가자 입력'}
      <span class="pill${status.pill ? ' pill--' + status.pill : ''}" style="font-size:var(--fs-xs);margin-left:6px;vertical-align:middle;">${esc(status.label)}</span>
    `;
    /* 회색 서브 문구(단계 · 양식명)는 아래 안내 카드 / 역량 평가 헤더에 중복되므로 미노출 */
    if (subEl) subEl.style.display = 'none';
    bodyEl.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px;">
        ${renderTargetCard(task)}
        ${renderEvaluatorContextCard(task, round)}
        ${renderPriorStages(round, task, comp, type)}
        ${renderEvaluationForm(round, task, comp, type, submitted)}
        ${renderCommentSection(round, task, submitted)}
      </div>
    `;
    footerEl.innerHTML = submitted
      ? `<span style="flex:1;font-size:var(--fs-xs);color:var(--color-text-muted);">제출이 완료되어 수정·취소할 수 없습니다.</span>
         <button class="btn" type="button" data-evi-eval-close>닫기</button>`
      : `<button class="btn" type="button" data-evi-eval-close>닫기</button>
         <button class="btn" type="button" data-evi-save>임시저장</button>
         <button class="btn btn--primary" type="button" data-evi-submit>제출</button>`;

    bindEvaluate(pageEl);
    /* 푸터의 [data-evi-eval-close] 도 chrome 핸들러로 묶기 */
    footerEl.querySelectorAll('[data-evi-eval-close]').forEach(b => b.addEventListener('click', () => closeEvaluate(pageEl)));
  }

  function renderTargetCard(task) {
    const t = task.target;
    return `
      <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:16px 20px;display:flex;align-items:center;gap:16px;">
        ${avatarHTML(t, 'lg')}
        <div style="flex:1;min-width:0;">
          <div style="font-size:var(--fs-lg);font-weight:var(--fw-semibold);color:var(--color-text);">
            ${esc(t.name)}
            <small style="color:var(--color-text-muted);font-weight:var(--fw-regular);font-size:var(--fs-sm);margin-left:6px;">${esc(t.id)}</small>
          </div>
          <div style="font-size:var(--fs-sm);color:var(--color-text-sub);margin-top:4px;">
            ${esc(t.dept || '-')} · ${esc(t.position || '-')} · ${esc(t.rank || '-')}
            ${t.joinDate ? ` · 입사 ${esc(fmtD(t.joinDate))}` : ''}
          </div>
        </div>
        ${task.isSelf ? `<span class="pill pill--info">본인 평가</span>` : ''}
      </section>
    `;
  }

  function renderEvaluatorContextCard(task, round) {
    if (task.isSelf) return '';
    const meId = STATE.currentUserId;
    const me = memberById(meId);
    return `
      <section style="padding:14px 18px;background:var(--color-surface-alt);border:1px solid var(--color-divider);border-radius:var(--radius-md);font-size:var(--fs-sm);color:var(--color-text-sub);line-height:1.6;">
        <strong style="color:var(--color-text);">${esc(me ? me.name : '')}</strong>
        <small style="color:var(--color-text-muted);">(${esc(meId)})</small>
        님은 이 대상자의
        <strong style="color:var(--color-brand-primary);">${esc(task.stageLabel)}</strong>
        평가자입니다.
      </section>
    `;
  }

  /* 단계 목록 — 자기진단(있으면) + 평가자 단계 전체. 각 단계의 평가자/제출여부/현재여부 포함. */
  function priorStageList(round, task, type) {
    const proc = (type && type.process && type.process[task.element]) || {};
    const stages = proc.stages || [];
    const list = [];
    if (proc.selfEval) {
      const key = `${task.targetId}|${task.element}|self`;
      list.push({ key, idxLabel: '자기진단', num: '★', sub: '본인', evId: task.targetId,
                  submitted: isTaskSubmitted(round.id, key), isCurrent: task.stageKey === 'self', isSelf: true });
    }
    stages.forEach((s, i) => {
      let evId;
      if (s.role === 'direct_assign') {
        const a = (round.evaluatorAssignments || {})[task.targetId] || {};
        evId = a[`${task.element}_${i}`] || null;
      } else {
        evId = resolveEvaluator(task.target, s.role, round);
      }
      const key = `${task.targetId}|${task.element}|${i}`;
      list.push({ key, idxLabel: `${i + 1}단계`, num: String(i + 1), sub: App.HREvalRounds.roleLabel(s.role), evId,
                  submitted: isTaskSubmitted(round.id, key), isCurrent: task.stageKey === String(i), isSelf: false });
    });
    return list;
  }

  /* 평가 단계 스텝퍼 — #16: 수습 평가 「이어하기」와 동일한 레이아웃(UI Kit .steps-h).
     자기진단·앞선 평가자 단계를 스텝으로 표시하고, 제출 완료된 앞선 단계에는 [평가내용 보기] 버튼을 달아
     읽기 전용 모달(data-evi-prior-modal)로 전체 입력 내용을 확인한다. */
  function renderPriorStages(round, task, comp, type) {
    if (task.isSelf || !comp || !comp.sections) return '';
    const list = priorStageList(round, task, type);
    if (list.length <= 1) return '';   // 앞선 단계가 없으면 미표시
    const steps = list.map(st => {
      const cls = st.isCurrent ? 'is-current' : (st.submitted ? 'is-done' : '');
      const ev = memberById(st.evId);
      const evName = ev ? ev.name : (st.isSelf ? ((task.target && task.target.name) || '본인') : '미지정');
      const viewBtn = (st.submitted && !st.isCurrent)
        ? `<button class="btn btn--xs" type="button" data-evi-prior="${esc(st.key)}" style="margin-top:5px;">평가내용 보기</button>`
        : '';
      return `<li class="steps-h__item ${cls}">
          <span class="steps-h__num">${esc(st.num)}</span>
          <div class="steps-h__body">
            <span class="steps-h__title">${esc(st.idxLabel)}</span>
            <span class="steps-h__sub">${esc(st.sub)} · ${esc(evName)}</span>
            ${viewBtn}
          </div>
        </li>`;
    }).join('');
    return `
      <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:16px 20px;">
        <header style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
          <h3 style="font-size:var(--fs-md);font-weight:var(--fw-semibold);margin:0;">평가 단계</h3>
        </header>
        <div><ol class="steps-h" style="margin:0;">${steps}</ol></div>
      </section>
    `;
  }

  /* 한 단계의 읽기 전용 내용 — 이전 단계 모달(data-evi-prior-modal) 본문.
     수습 평가의 「평가내용 보기」(renderStageReviewBlock)와 동일한 레이아웃:
       단계 배지 + 평가자(아바타) + 환산 점수 헤더 → 읽기전용 likert 폼 → 종합 의견.
     radio name 은 prior 전용 prefix 로 namespacing(현재 입력 폼과 충돌 방지), data-evi-item 미사용. */
  function renderPriorStageBody(round, info, comp, type) {
    const scale = (comp && comp.scale) || 5;
    const labels = (comp.scaleLabels && comp.scaleLabels[scale])
      || ((App.HREvalRounds && App.HREvalRounds.defaultScaleLabels) ? App.HREvalRounds.defaultScaleLabels(scale) : ['매우 미흡', '미흡', '보통', '우수', '매우 우수']);
    const sections = (comp && comp.sections) || [];
    const resp = (STATE.responses[round.id] || {})[info.key] || { _items: {}, _comment: '' };
    const ev = memberById(info.evId);
    const nameSafe = String(info.key).replace(/[^a-zA-Z0-9_-]/g, '_');

    /* 환산 점수 — 응답 평균 / 척도 × 100 (수습 평가 stageScore 와 동일 산식) */
    const itemIds = sections.flatMap(s => (s.items || []).map(it => it.id));
    const answered = itemIds.filter(id => Number(resp._items[id]) > 0);
    const score = answered.length
      ? Math.round((answered.reduce((a, id) => a + Number(resp._items[id] || 0), 0) / answered.length / scale) * 100)
      : 0;

    const sectionsHTML = sections.map((sec, sIdx) => {
      const itemsHTML = (sec.items || []).map((it, iIdx) => {
        const cur = Number(resp._items[it.id] || 0);
        const opts = Array.from({ length: scale }, (_, k) => {
          const v = k + 1;
          const on = cur === v ? 'is-on' : '';
          return `
            <label class="likert__opt ${on}">
              <input type="radio" name="evi-prior-${nameSafe}-${esc(it.id)}" value="${v}" ${cur === v ? 'checked' : ''} disabled />
              <span class="likert__num">${v}</span>
              <span class="likert__lbl">${esc(labels[k] || '')}</span>
            </label>`;
        }).join('');
        return `
          <div style="padding:14px 16px;border:1px solid var(--color-divider);border-radius:var(--radius-md);background:var(--color-surface);display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;align-items:baseline;gap:10px;">
              <span style="font-size:var(--fs-xs);color:var(--color-brand-primary);font-weight:var(--fw-semibold);min-width:36px;">Q${sIdx + 1}-${iIdx + 1}</span>
              <span style="flex:1;font-size:var(--fs-md);color:var(--color-text);">${esc(it.text)}</span>
            </div>
            <div class="likert likert--readonly" data-value="${cur}">${opts}</div>
          </div>`;
      }).join('');
      return `
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div style="display:flex;align-items:center;gap:8px;padding:8px 0 4px;border-bottom:1px solid var(--color-divider);">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:var(--radius-sm);background:var(--color-brand-primary);color:#fff;font-size:var(--fs-xs);font-weight:var(--fw-bold);">${sIdx + 1}</span>
            <strong style="font-size:var(--fs-md);">${esc(sec.name)}</strong>
            <small style="color:var(--color-text-muted);font-size:var(--fs-xs);">${(sec.items || []).length} 문항</small>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;">${itemsHTML}</div>
        </div>`;
    }).join('');

    const commentHTML = (resp._comment || '').trim()
      ? `<div style="font-size:var(--fs-sm);color:var(--color-text-sub);line-height:1.55;white-space:pre-wrap;background:var(--color-surface-alt);border:1px solid var(--color-divider);border-radius:var(--radius-sm);padding:10px 12px;"><strong style="display:block;font-size:var(--fs-xs);color:var(--color-text-muted);margin-bottom:4px;">${info.isSelf ? '자기 진단 의견' : '평가자 의견'}</strong>${esc(resp._comment)}</div>`
      : '';

    return `
      <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:14px 18px;display:flex;flex-direction:column;gap:12px;">
        <header style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;border-bottom:1px solid var(--color-divider);padding-bottom:10px;">
          <span style="display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 9px;border-radius:var(--radius-pill);background:var(--color-active);color:var(--color-brand-primary);font-size:var(--fs-xs);font-weight:var(--fw-semibold);">${esc(info.idxLabel)}</span>
          ${ev ? `<span style="display:inline-flex;align-items:center;gap:5px;font-size:var(--fs-sm);color:var(--color-text-sub);">${avatarHTML(ev, 'xs')}${esc(ev.name)}</span>` : `<span style="font-size:var(--fs-sm);color:var(--color-text-sub);">${info.isSelf ? '본인' : '평가자 미지정'}</span>`}
          <span style="flex:1;"></span>
          <span style="font-size:var(--fs-sm);color:var(--color-text-sub);">환산 점수 <strong style="color:var(--color-brand-primary);">${score}</strong>점</span>
        </header>
        ${sectionsHTML}
        ${commentHTML}
      </section>
    `;
  }

  /* 이전 단계 모달 열기/닫기 */
  function openPriorStage(pageEl, stageKey) {
    const round = App.HREvalRounds.get(STATE.selectedRoundId);
    if (!round) return;
    const task = findTask(round.id, STATE.selectedTaskKey);
    if (!task) return;
    const type = App.HREvalRounds.getType(round.typeKey);
    const comp = (task.competency) || (type && type.competency) || null;
    const info = priorStageList(round, task, type).find(s => s.key === stageKey);
    if (!info || !comp) return;
    const titleEl = pageEl.querySelector('[data-evi-prior-title]');
    const bodyEl  = pageEl.querySelector('[data-evi-prior-modal] [data-evi-prior-body]');
    if (titleEl) titleEl.textContent = `${info.idxLabel} 평가 내용`;
    if (bodyEl) bodyEl.innerHTML = renderPriorStageBody(round, info, comp, type);
    const m = pageEl.querySelector('[data-evi-prior-modal]');
    if (m) m.classList.add('is-open');
  }
  function closePriorStage(pageEl) {
    const m = pageEl.querySelector('[data-evi-prior-modal]');
    if (m) m.classList.remove('is-open');
  }

  function renderEvaluationForm(round, task, comp, type, readonly) {
    if (!comp || !comp.sections) {
      return `
        <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:32px;text-align:center;color:var(--color-text-muted);">
          역량 양식 정보를 불러올 수 없습니다.
        </section>
      `;
    }
    return renderCompetencyForm(round, task, comp, type, readonly);
  }

  /* 역량 폼 — likert 5점 척도 (또는 3/7) */
  function renderCompetencyForm(round, task, comp, type, readonly) {
    const scale = (comp && comp.scale) || 5;
    const labels = (comp.scaleLabels && comp.scaleLabels[scale])
      || ((App.HREvalRounds && App.HREvalRounds.defaultScaleLabels) ? App.HREvalRounds.defaultScaleLabels(scale) : ['매우 미흡', '미흡', '보통', '우수', '매우 우수']);
    const sections = (comp && comp.sections) || [];
    const typeName = (type && type.name) || '';
    const response = ensureResponseSlot(round.id, task.key);

    const sectionsHTML = sections.map((sec, sIdx) => {
      const itemsHTML = (sec.items || []).map((it, iIdx) => {
        const cur = Number(response._items[it.id] || 0);
        const optsHTML = Array.from({ length: scale }, (_, k) => {
          const v = k + 1;
          const on = cur === v ? 'is-on' : '';
          return `
            <label class="likert__opt ${on}">
              <input type="radio" name="evi-q-${esc(it.id)}" value="${v}" ${cur === v ? 'checked' : ''} ${readonly ? 'disabled' : ''} />
              <span class="likert__num">${v}</span>
              <span class="likert__lbl">${esc(labels[k] || '')}</span>
            </label>
          `;
        }).join('');
        return `
          <div data-evi-item="${esc(it.id)}" style="padding:14px 16px;border:1px solid var(--color-divider);border-radius:var(--radius-md);background:var(--color-surface);display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;align-items:baseline;gap:10px;">
              <span style="font-size:var(--fs-xs);color:var(--color-brand-primary);font-weight:var(--fw-semibold);min-width:28px;">Q${sIdx + 1}-${iIdx + 1}</span>
              <span style="flex:1;font-size:var(--fs-md);color:var(--color-text);">${esc(it.text)}</span>
            </div>
            <div class="likert ${readonly ? 'likert--readonly' : ''}" data-value="${cur}">${optsHTML}</div>
          </div>
        `;
      }).join('');
      return `
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div style="display:flex;align-items:center;gap:8px;padding:8px 0 4px;border-bottom:1px solid var(--color-divider);">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:var(--radius-sm);background:var(--color-brand-primary);color:#fff;font-size:var(--fs-xs);font-weight:var(--fw-bold);">${sIdx + 1}</span>
            <strong style="font-size:var(--fs-md);">${esc(sec.name)}</strong>
            <small style="color:var(--color-text-muted);font-size:var(--fs-xs);">${(sec.items || []).length} 문항</small>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;">${itemsHTML}</div>
        </div>
      `;
    }).join('');

    return `
      <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:20px 24px;display:flex;flex-direction:column;gap:18px;">
        <header style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;border-bottom:1px solid var(--color-divider);padding-bottom:12px;">
          <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;">
            <h3 style="font-size:var(--fs-lg);font-weight:var(--fw-semibold);margin:0;">역량 평가</h3>
            ${typeName ? `<span style="font-size:var(--fs-md);font-weight:var(--fw-medium);color:var(--color-text-sub);">${esc(typeName)}</span>` : ''}
          </div>
          <small style="color:var(--color-text-muted);font-size:var(--fs-xs);">${scale}점 척도</small>
        </header>
        ${sectionsHTML}
        ${readonly ? '' : `
          <div style="padding:10px 14px;background:var(--color-surface-alt);border-radius:var(--radius-md);font-size:var(--fs-xs);color:var(--color-text-muted);">
            모든 문항에 점수를 부여한 후 [제출] 버튼을 눌러주세요. 임시저장은 입력 기간 종료 전까지 언제든 가능합니다.
          </div>
        `}
      </section>
    `;
  }


  /* 코멘트 입력 — 본인 평가/타인 평가 공통 */
  function renderCommentSection(round, task, readonly) {
    const r = ensureResponseSlot(round.id, task.key);
    return `
      <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:20px 24px;">
        <header style="margin-bottom:10px;">
          <h3 style="font-size:var(--fs-md);font-weight:var(--fw-semibold);margin:0;">${task.isSelf ? '자기 진단 코멘트' : '평가자 코멘트'} <small style="font-weight:var(--fw-regular);color:var(--color-text-muted);">(선택)</small></h3>
        </header>
        <textarea class="input input--full" id="evi-comment" rows="7" ${readonly ? 'disabled' : ''} placeholder="${task.isSelf ? '자신의 강점·개선 포인트를 자유롭게 기술해주세요.' : '대상자에게 전달할 피드백을 작성해주세요. (대상자 본인에게 공유될 수 있음)'}">${esc(r._comment || '')}</textarea>
      </section>
    `;
  }

  function bindEvaluate(pageEl) {
    const round = App.HREvalRounds.get(STATE.selectedRoundId);
    const task = findTask(round.id, STATE.selectedTaskKey);
    if (!task) return;
    const response = ensureResponseSlot(round.id, task.key);

    /* likert radio 변경 → response 반영 + 시각 동기화 */
    pageEl.querySelectorAll('[data-evi-item]').forEach(itemEl => {
      const itemId = itemEl.dataset.eviItem;
      const lk = itemEl.querySelector('.likert');
      itemEl.querySelectorAll('input[type="radio"]').forEach(rb => {
        rb.addEventListener('change', () => {
          if (!rb.checked) return;
          response._items[itemId] = Number(rb.value);
          /* 옵션 is-on 갱신 */
          itemEl.querySelectorAll('.likert__opt').forEach(o => {
            const ib = o.querySelector('input[type="radio"]');
            o.classList.toggle('is-on', !!ib && ib.checked);
          });
          if (lk) lk.dataset.value = rb.value;
          /* 상태 pill / 저장 버튼 활성화 — 가벼운 라이브 업데이트는 생략 (저장/제출 시 재렌더) */
        });
      });
    });

    /* 코멘트 */
    const ta = pageEl.querySelector('#evi-comment');
    if (ta) ta.addEventListener('input', () => { response._comment = ta.value; });

    const save = pageEl.querySelector('[data-evi-save]');
    if (save) save.addEventListener('click', () => {
      window.toast && window.toast('임시저장 되었습니다.', 'success');
    });

    const submit = pageEl.querySelector('[data-evi-submit]');
    if (submit) submit.addEventListener('click', () => {
      const ratio = taskCompletionRatio(task, response);
      if (ratio < 1) {
        if (!confirm('아직 점수를 부여하지 않은 문항이 있습니다.\n그래도 제출하시겠습니까?')) return;
      } else {
        if (!confirm('제출하시겠습니까?\n\n※ 제출 후에는 수정 및 제출 취소가 불가능합니다.')) return;
      }
      markSubmitted(round.id, task.key);
      window.toast && window.toast('제출 완료되었습니다.', 'success');
      populateEvaluateModal(pageEl);
    });
    /* 제출 후 수정·취소 불가 — 제출 취소(unsubmit) 기능 제거됨. */
  }

  /* =========================================================
   *  공통 click 위임 — pageEl 단위로 1회만 부착.
   *  view 가 바뀌어도 같은 hook(data-evi-round / data-evi-task / data-evi-open)을 사용하므로
   *  view 별로 별도 바인딩하지 않고 STATE.view 로 라우팅한다. */
  function ensureRootDelegation(pageEl) {
    if (pageEl.dataset.eviDelegated === '1') return;
    pageEl.dataset.eviDelegated = '1';
    pageEl.addEventListener('click', e => {
      /* 통합 뷰 — 회차 선택은 dropdown 으로 처리되므로 task 클릭만 받음 */
      const taskBtn = e.target.closest('[data-evi-task]');
      if (taskBtn) {
        if (taskBtn.disabled) return;
        openEvaluate(taskBtn.dataset.eviTask);
        return;
      }
    });
  }

  /* =========================================================
   *  Page Init
   * ========================================================= */
  function initPage() {
    const pageEl = document.getElementById('page-hr-eval-input');
    if (!pageEl) return;
    pageEl.__onShow = () => {
      /* 첫 진입 시 현재 사용자 결정 */
      if (!STATE.currentUserId) STATE.currentUserId = defaultViewer();
      ensureRootDelegation(pageEl);
      /* 회차에 진입한 상태라면 그 뷰로 복귀, 아니면 list. 평가 입력은 round 위에 뜨는 모달이라 별도 분기 없음. */
      if (STATE.view === 'round' && STATE.selectedRoundId) renderRoundView(pageEl);
      else renderListView(pageEl);
    };
  }
  const prev = App.initPages;
  App.initPages = function () {
    if (typeof prev === 'function') prev();
    initPage();
  };
})();
