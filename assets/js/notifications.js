/* =========================================================
 * Notification Center (알림함)
 *
 * 진입점:
 *   - GNB 벨 아이콘 클릭
 *   - 프로필 메뉴 > 알림함
 *
 * 데이터 스키마:
 *   {
 *     id, sender: { name, initial?, color? },
 *     title, datetime: Date|ISOString,
 *     status: 'info' | 'success' | 'warning' | 'urgent',
 *     read: boolean,
 *     content: string (HTML 허용)
 *   }
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  // ===== Mock 데이터 (실 운영 시 API 응답으로 교체) =====
  const MOCK = [
    { id: 'n1',  sender: { name: '윤성수', color: 'c1' }, title: '[전자결재] 휴가 신청서가 도착했습니다.',
      datetime: new Date(Date.now() -  5 * 60 * 1000), status: 'urgent',  read: false,
      link: { itemId: 'apr-inbox', label: '결재 대기', page: 'page-grid' },
      content: '결재 요청 문서가 1건 도착했습니다.<br>· 문서: 2025-1108 휴가 신청서 (홍길동 사원)<br>· 결재 라인: 김부장 → 이팀장 → 윤성수<br>· 기한: 2026-05-13 (D-2)' },
    { id: 'n2',  sender: { name: '시스템', color: 'c4' }, title: '서버 점검이 오늘 23:00 ~ 익일 02:00 예정입니다.',
      datetime: new Date(Date.now() - 45 * 60 * 1000), status: 'warning',  read: false,
      content: '월간 정기 점검으로 일부 서비스(전자결재/MES)가 일시 중단될 수 있습니다. 점검 중에도 그룹웨어 메인 기능은 정상 동작합니다.' },
    { id: 'n3',  sender: { name: '인사팀 김민지', color: 'c5' }, title: '4월 근태 마감이 완료되었습니다.',
      datetime: new Date(Date.now() -  2 * 3600 * 1000), status: 'success', read: false,
      link: { itemId: 'att-status', label: '근태 현황', page: 'page-grid' },
      content: '4월 근태 마감 처리가 완료되었습니다. 본인 근태 내역은 "근태 > 월별 근태" 에서 확인하실 수 있습니다.' },
    { id: 'n4',  sender: { name: '자재팀 박상혁', color: 'c2' }, title: '자재 부족 SKU 7건 발주 요청',
      datetime: new Date(Date.now() -  6 * 3600 * 1000), status: 'info',    read: true,
      link: { itemId: 'mat-buy-req', label: '신청 내역', page: 'page-grid' },
      content: '아래 SKU 7건의 재고가 안전재고를 하회하여 발주 요청 드립니다.<br>· SKU-1023 (잔량 12 / 기준 50)<br>· SKU-1041 (잔량 3 / 기준 30)<br>· …' },
    { id: 'n5',  sender: { name: '회계팀 이수정', color: 'c3' }, title: '5월 부가세 신고 자료 송부 요청',
      datetime: new Date(Date.now() - 26 * 3600 * 1000), status: 'info',    read: true,
      content: '5월 부가세 신고 마감 일정에 따라 부서별 매입/매출 자료를 5월 13일까지 송부 부탁드립니다.' },
    { id: 'n6',  sender: { name: '품질팀 정우진', color: 'c6' }, title: '품질 이슈 보고서가 등록되었습니다.',
      datetime: new Date(Date.now() - 50 * 3600 * 1000), status: 'urgent',  read: true,
      content: '4월 30일자 라인2 품질 이상 보고서가 등록되었습니다. 관련 부서 회신 부탁드립니다.' },
    { id: 'n7',  sender: { name: '보안관리실', color: 'c1' }, title: '4월 출입 이력 리포트가 생성되었습니다.',
      datetime: new Date(Date.now() - 4  * 86400 * 1000), status: 'info',    read: true,
      content: '월간 출입 이력 리포트가 생성되었습니다. 보안/시설/차량 > 출입 이력에서 다운로드 가능합니다.' },
    { id: 'n8',  sender: { name: '경영지원', color: 'c4' }, title: '경영지표 KPI 대시보드가 갱신되었습니다.',
      datetime: new Date(Date.now() - 6  * 86400 * 1000), status: 'success', read: true,
      link: { itemId: 'dashboard', label: '임원 전용', page: 'page-dashboard' },
      content: '주간 KPI 데이터가 새로 반영되었습니다. (전주 대비 매출 +8.6%)' },
  ];

  const State = {
    items: MOCK.slice(),
    filter: 'all', // all | unread | urgent
    open: false,
  };

  // ===== 헬퍼 =====
  function $(s, r = document) { return r.querySelector(s); }

  function pad2(n) { return String(n).padStart(2, '0'); }
  function fmtDatetime(dt) {
    const d = (dt instanceof Date) ? dt : new Date(dt);
    return `${String(d.getFullYear()).slice(2)}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  const STATUS_META = {
    info:    { cls: 'pill--info',    label: '안내'   },
    success: { cls: 'pill--success', label: '완료'   },
    warning: { cls: 'pill--warning', label: '주의'   },
    urgent:  { cls: 'pill--danger',  label: '긴급'   },
  };

  function initialOf(name) { return (name || '?').trim().charAt(0); }

  function filtered() {
    switch (State.filter) {
      case 'unread': return State.items.filter(n => !n.read);
      case 'urgent': return State.items.filter(n => n.status === 'urgent');
      default:       return State.items;
    }
  }

  function updateBellBadge() {
    const unread = State.items.filter(n => !n.read).length;
    const badge = document.querySelector('#btn-notif .badge');
    if (!badge) return;
    if (unread > 0) {
      badge.textContent = unread > 99 ? '99+' : String(unread);
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  // ===== 렌더 =====
  function render() {
    const list = $('#notif-list');
    const rows = filtered();
    if (!rows.length) {
      list.innerHTML = `<div class="empty">표시할 알림이 없습니다.</div>`;
      return;
    }
    list.innerHTML = rows.map(n => {
      const st = STATUS_META[n.status] || STATUS_META.info;
      const initial = n.sender.initial || initialOf(n.sender.name);
      return `
        <article class="notif-item${n.read ? '' : ' is-unread'}" role="listitem" data-id="${n.id}">
          <button type="button" class="notif-item__head" data-notif-toggle aria-expanded="false">
            <span class="notif-avatar ${n.sender.color || 'c1'}">${initial}</span>
            <span class="notif-main">
              <span class="notif-sender">${n.sender.name}</span>
              <span class="notif-title" title="${n.title}">${n.title}</span>
            </span>
            <span class="notif-meta">
              <span class="notif-time">${fmtDatetime(n.datetime)}</span>
              <span class="pill ${st.cls}">${st.label}</span>
              <svg class="notif-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </span>
          </button>
          <div class="notif-body">
            <div class="notif-body__inner">
              ${n.content}
              <div class="notif-body__footer">
                <button class="btn btn--sm" type="button" data-notif-mark="${n.id}">${n.read ? '안 읽음으로' : '읽음 처리'}</button>
                ${n.link ? `<button class="btn btn--sm btn--primary" type="button" data-notif-go="${n.id}">바로 가기</button>` : ''}
              </div>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  // ===== 동작 =====
  function open() {
    State.open = true;
    $('#notif-backdrop').hidden = false;
    $('#notif-drawer').hidden = false;
    render();
    document.body.style.overflow = 'hidden';
  }
  function close() {
    State.open = false;
    $('#notif-backdrop').hidden = true;
    $('#notif-drawer').hidden = true;
    document.body.style.overflow = '';
  }
  function toggleItem(id) {
    const el = document.querySelector(`.notif-item[data-id="${id}"]`);
    if (!el) return;
    const opening = !el.classList.contains('is-open');
    // 단일 확장 정책: 다른 항목 닫기 (원하면 제거)
    document.querySelectorAll('.notif-item.is-open').forEach(other => {
      if (other !== el) other.classList.remove('is-open');
    });
    el.classList.toggle('is-open', opening);
    const btn = el.querySelector('[data-notif-toggle]');
    if (btn) btn.setAttribute('aria-expanded', String(opening));
    // 펼치면 자동 읽음 처리
    if (opening) markRead(id, true);
  }
  function markRead(id, read = true) {
    const n = State.items.find(x => x.id === id);
    if (!n) return;
    n.read = read;
    const el = document.querySelector(`.notif-item[data-id="${id}"]`);
    if (el) el.classList.toggle('is-unread', !read);
    // 토글 라벨 갱신
    const btn = el?.querySelector(`[data-notif-mark="${id}"]`);
    if (btn) btn.textContent = read ? '안 읽음으로' : '읽음 처리';
    updateBellBadge();
  }
  function markAllRead() {
    State.items.forEach(n => n.read = true);
    render();
    updateBellBadge();
  }
  function setFilter(f) {
    State.filter = f;
    document.querySelectorAll('[data-notif-filter]').forEach(b => {
      b.classList.toggle('is-active', b.dataset.notifFilter === f);
    });
    render();
  }

  // ===== 이벤트 바인딩 =====
  function bind() {
    // 닫기
    $('#notif-backdrop').addEventListener('click', close);
    document.querySelectorAll('[data-notif-close]').forEach(b => b.addEventListener('click', close));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && State.open) close(); });

    // 필터
    document.querySelectorAll('[data-notif-filter]').forEach(b => {
      b.addEventListener('click', () => setFilter(b.dataset.notifFilter));
    });

    // 모두 읽음
    document.querySelector('[data-notif-mark-all]').addEventListener('click', markAllRead);

    // 리스트 위임 (토글/읽음/이동)
    $('#notif-list').addEventListener('click', (e) => {
      const toggleBtn = e.target.closest('[data-notif-toggle]');
      if (toggleBtn) {
        const itemEl = toggleBtn.closest('.notif-item');
        toggleItem(itemEl.dataset.id);
        return;
      }
      const markBtn = e.target.closest('[data-notif-mark]');
      if (markBtn) {
        const id = markBtn.dataset.notifMark;
        const n = State.items.find(x => x.id === id);
        markRead(id, !n.read);
        return;
      }
      const goBtn = e.target.closest('[data-notif-go]');
      if (goBtn) {
        const id = goBtn.dataset.notifGo;
        const n = State.items.find(x => x.id === id);
        markRead(id, true);
        close();
        // 알림에 연결된 링크(메뉴)로 이동 — link 가 있는 알림만 '바로 가기' 노출됨
        if (n && n.link && App.Nav && App.Nav.selectItem) {
          App.Nav.selectItem(n.link.itemId, n.link.label, n.link.page);
        }
      }
    });

    // 진입점 1) GNB 벨 아이콘
    const bell = document.querySelector('#btn-notif');
    if (bell) bell.addEventListener('click', open);

    // 진입점 2) 프로필 메뉴 > 알림함
    //  - stopPropagation 하지 않음: 부모 .gnb__profile 이 토글되어 메뉴가 닫히도록 둠
    document.querySelectorAll('[data-open-notif]').forEach(b => {
      b.addEventListener('click', () => open());
    });
  }

  App.Notifications = {
    init() { bind(); updateBellBadge(); },
    open, close, render,
    markRead, markAllRead, setFilter,
    // 외부(대시보드 등)에서 알림 목록/미확인 수 조회 — 단일 데이터원 공유
    list: () => State.items.slice(),
    unreadCount: () => State.items.filter(n => !n.read).length,
    // 외부에서 알림 추가 (서버 push 받았을 때)
    add(item) {
      State.items.unshift(Object.assign({ datetime: new Date(), read: false, status: 'info' }, item));
      if (State.open) render();
      updateBellBadge();
    },
  };
})();
