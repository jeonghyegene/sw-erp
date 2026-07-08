/* =========================================================
 * UI Kit interactions (vanilla JS)
 *  - TOC scrollspy
 *  - Tag close · Progress control · Popover · Dropdown
 *  - Accordion · Tabs · Modal · Toast · Sweet Alert
 *  - Slider · Range Slider (single/dual) · Dropzone
 *  - Rating · Tree · Mega Options · Password toggle
 *  - Touchspin · Switch · Datepicker · Typeahead · Validation
 * ========================================================= */
(function () {
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ============ Helpers ============ */
  function escapeHTML(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function stars(n) {
    const full = Math.floor(n), empty = 5 - full;
    return `<span class="stars">${'★'.repeat(full)}<span class="off">${'★'.repeat(empty)}</span></span>`;
  }

  /* 한글 금액 변환 — 300000 → 삼십만 / 1234 → 천이백삼십사 */
  function numToKorean(num) {
    num = Math.floor(Number(num) || 0);
    if (num === 0) return '영';
    if (num < 0) return '음수';
    const digits = ['','일','이','삼','사','오','육','칠','팔','구'];
    const places = ['','십','백','천'];
    const myriads = ['','만','억','조','경'];
    let str = String(num);
    let result = '';
    let mi = 0;
    while (str.length > 0) {
      const group = str.slice(-4);
      str = str.slice(0, -4);
      let g = '';
      let any = false;
      for (let i = 0; i < group.length; i++) {
        const d = parseInt(group[i]);
        const p = group.length - 1 - i;
        if (d === 0) continue;
        any = true;
        if (d === 1 && p > 0) g += places[p];           // 일십 → 십
        else                  g += digits[d] + places[p];
      }
      if (any) result = g + myriads[mi] + result;
      mi++;
    }
    return result || '영';
  }
  window.numToKorean = numToKorean;

  /* Amount Input 데모 */
  (function () {
    const input = document.getElementById('demo-amount-input');
    const display = document.getElementById('demo-amount-display');
    if (!input || !display) return;
    function update() {
      const n = Number(input.value) || 0;
      display.textContent = `￦${n.toLocaleString()} (일금${numToKorean(n)}원정)`;
    }
    input.addEventListener('input', update);
  })();

  /* ============ Activity List ============ */
  (function () {
    const host = document.getElementById('actl-host');
    if (!host) return;
    const rows = [
      { name: 'Emma Smith',     mail: 'smith@kpmg.com',     color: 'c2', dot: 'online', date: 'Jun 24, 2026', amt: 832,  status: ['Pending',   'pill--warning'] },
      { name: 'Melody Macy',    mail: 'melody@altbox.com',  color: 'c6', dot: 'online', date: 'Jun 24, 2026', amt: 520,  status: ['Pending',   'pill--warning'] },
      { name: 'Max Smith',      mail: 'max@kt.com',         color: 'c4', dot: '',       date: 'Aug 19, 2026', amt: 860,  status: ['Rejected',  'pill--danger']  },
      { name: 'Sean Bean',      mail: 'sean@dellito.com',   color: 'c1', dot: '',       date: 'Nov 10, 2026', amt: 999,  status: ['Pending',   'pill--warning'] },
      { name: 'Brian Cox',      mail: 'brian@exchange.com', color: 'c3', dot: '',       date: 'Aug 19, 2026', amt: 873,  status: ['Rejected',  'pill--danger']  },
      { name: 'Mikaela Collins',mail: 'mik@pex.com',        color: 'c2', dot: 'online', date: 'Jun 24, 2026', amt: 783,  status: ['Approved',  'pill--success'] },
      { name: 'Francis Mitcham',mail: 'f.mit@kpmg.com',     color: 'c5', dot: '',       date: 'May 05, 2026', amt: 505,  status: ['In progress','pill--purple']  },
      { name: 'Olivia Wild',    mail: 'olivia@corpmail.com',color: 'c6', dot: 'online', date: 'Aug 19, 2026', amt: 431,  status: ['Pending',   'pill--warning'] },
    ];
    host.innerHTML = rows.map(r => `
      <div class="actl__row">
        <div class="actl__user">
          <span class="av av--md av--${r.color}">${r.name.charAt(0)}${r.dot ? `<span class="av__dot av__dot--${r.dot}"></span>` : ''}</span>
          <div>
            <div class="actl__name">${escapeHTML(r.name)}</div>
            <div class="actl__sub">${escapeHTML(r.mail)}</div>
          </div>
        </div>
        <div class="actl__date">${r.date}</div>
        <div class="actl__amt">$${r.amt.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
        <div><span class="pill ${r.status[1]}">${r.status[0]}</span></div>
        <div class="actl__action"><button class="btn btn--sm btn--soft">View</button></div>
      </div>
    `).join('');
  })();

  /* ============ Product Grid ============ */
  (function () {
    const body = document.getElementById('pgrid-body');
    if (!body) return;
    const products = [
      { id: 1, name: 'Product 1', sku: '03218009', qty: 38, price: 70,  rating: 5, status: ['Scheduled', 'pill--soft-blue'], thumb: '⌚' },
      { id: 2, name: 'Product 2', sku: '01273003', qty: 12, price: 182, rating: 3, status: ['Inactive',  'pill--danger'],    thumb: '🎧' },
      { id: 3, name: 'Product 3', sku: '03974008', qty: 20, price: 78,  rating: 5, status: ['Published', 'pill--success'],   thumb: '🛸' },
      { id: 4, name: 'Product 4', sku: '02172005', qty: 37, price: 272, rating: 3, status: ['Scheduled', 'pill--soft-blue'], thumb: '🍷' },
      { id: 5, name: 'Product 5', sku: '02544002', qty: 49, price: 243, rating: 4, status: ['Published', 'pill--success'],   thumb: '🍾' },
      { id: 6, name: 'Product 6', sku: '03196006', qty: 18, price: 110, rating: 5, status: ['Scheduled', 'pill--soft-blue'], thumb: '🍶' },
    ];
    body.innerHTML = products.map(p => `
      <div class="pgrid__row" data-id="${p.id}">
        <div class="pgrid__cb"><input type="checkbox" data-row-check></div>
        <div class="pgrid__product">
          <div class="pgrid__thumb">${p.thumb}</div>
          <div><div class="pgrid__name">${escapeHTML(p.name)}</div></div>
        </div>
        <div class="pgrid__sku">${p.sku}</div>
        <div class="pgrid__qty">${p.qty}</div>
        <div class="pgrid__price">${p.price.toFixed(2)}</div>
        <div class="pgrid__rating">${stars(p.rating)}</div>
        <div class="pgrid__status"><span class="pill ${p.status[1]}">${p.status[0]}</span></div>
        <div class="pgrid__action">
          <span class="dd" data-dd>
            <button class="btn btn--sm btn--soft">Actions ▾</button>
            <div class="dd__menu">
              <button class="dd__item">편집</button>
              <button class="dd__item">복제</button>
              <div class="dd__divider"></div>
              <button class="dd__item" style="color:var(--color-danger)">삭제</button>
            </div>
          </span>
        </div>
      </div>
    `).join('');

    // 새로 추가된 dd 들에 dropdown 동작 부여
    body.querySelectorAll('[data-dd]').forEach(d => {
      d.querySelector('button').addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('[data-dd]').forEach(o => { if (o !== d) o.classList.remove('is-open'); });
        d.classList.toggle('is-open');
      });
      d.querySelector('.dd__menu')?.addEventListener('click', e => e.stopPropagation());
    });

    // 체크박스 동작
    const all = document.getElementById('pgrid-all');
    function syncSelected() {
      body.querySelectorAll('[data-row-check]').forEach(cb => {
        cb.closest('.pgrid__row').classList.toggle('is-selected', cb.checked);
      });
      const cbs = body.querySelectorAll('[data-row-check]');
      const checked = body.querySelectorAll('[data-row-check]:checked').length;
      all.checked = checked === cbs.length && cbs.length > 0;
      all.indeterminate = checked > 0 && checked < cbs.length;
    }
    all?.addEventListener('change', () => {
      body.querySelectorAll('[data-row-check]').forEach(cb => cb.checked = all.checked);
      syncSelected();
    });
    body.addEventListener('change', e => { if (e.target.matches('[data-row-check]')) syncSelected(); });
  })();

  /* ============ User Cards ============ */
  (function () {
    const host = document.getElementById('user-cards-host');
    if (!host) return;
    const users = [
      { name: 'Patric Watson', role: 'Art Director at Novica Co.',    color: 'c3', following: true,  earn: 14560, sales: 236400 },
      { name: 'Olivia Larson', role: 'Art Director at Seal Inc.',     color: 'c6', following: false, earn: 14560, sales: 236400 },
      { name: 'Adam Williams', role: 'System Arcitect at Wolto Co.',  color: 'c2', following: true,  earn: 14560, sales: 236400 },
      { name: 'Paul Marcus',   role: 'Art Director at Novica Co.',    color: 'c5', following: true,  earn: 14560, sales: 236400 },
      { name: 'Neil Owen',     role: 'Accountant at Numbers Co.',     color: 'c3', following: false, earn: 14560, sales: 236400 },
      { name: 'Sean Paul',     role: 'Developer at Loop Inc',         color: 'c4', following: false, earn: 14560, sales: 236400 },
    ];
    host.innerHTML = users.map((u, i) => `
      <div class="user-card" data-i="${i}">
        <div class="user-card__av-wrap">
          <span class="av av--xl av--${u.color}">${u.name.charAt(0)}</span>
          <span class="av__dot av__dot--online" style="position:absolute"></span>
        </div>
        <div class="user-card__name">${escapeHTML(u.name)}</div>
        <div class="user-card__role">${escapeHTML(u.role)}</div>
        <div class="user-card__stats">
          <div class="user-card__stat"><strong>$${u.earn.toLocaleString()}</strong><span>Earnings</span></div>
          <div class="user-card__stat"><strong>$${u.sales.toLocaleString()}</strong><span>Sales</span></div>
        </div>
        <button class="btn btn--soft btn-follow ${u.following ? 'is-on' : ''}" data-follow>
          <span class="ic-follow">+ Follow</span>
          <span class="ic-following">✓ Following</span>
        </button>
      </div>
    `).join('');

    // 위치 보정 (av__dot 은 .av 내부 기준이라 별도 처리 필요)
    host.querySelectorAll('.user-card__av-wrap').forEach(w => {
      const dot = w.querySelector('.av__dot');
      const av  = w.querySelector('.av');
      if (dot && av) {
        // av 안으로 옮긴다
        av.appendChild(dot);
        dot.style.position = '';
      }
    });

    host.addEventListener('click', e => {
      const b = e.target.closest('[data-follow]');
      if (!b) return;
      b.classList.toggle('is-on');
    });
  })();

  /* ============ Form Table: card-internal tabs toggle ============ */
  $$('[data-fm-tabs]').forEach(host => {
    host.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-fm-tab]');
      if (!btn) return;
      host.querySelectorAll('[data-fm-tab]').forEach(t => t.classList.toggle('is-active', t === btn));
    });
  });

  /* ============ Button: Loading demo & Group toggle ============ */
  $$('[data-loading-demo]').forEach(b => {
    b.addEventListener('click', () => {
      if (b.classList.contains('is-loading')) return;
      const original = b.innerHTML;
      b.classList.add('is-loading');
      setTimeout(() => {
        b.classList.remove('is-loading');
        b.innerHTML = original;
      }, 2000);
    });
  });
  $$('[data-bgrp]').forEach(group => {
    group.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn');
      if (!btn || !group.contains(btn)) return;
      group.querySelectorAll('.btn').forEach(b => b.classList.toggle('is-active', b === btn));
    });
  });

  /* ============ Dashboard Widgets ============ */
  (function () {
    if (!window.Charts) return;

    // Score Gauge (73 / 100)
    const sg = document.getElementById('score-gauge');
    if (sg) {
      sg.insertAdjacentHTML('afterbegin', Charts.gauge(73, 100, { size: 180, thickness: 14, color: '#22C55E' }));
    }

    // Mini Calendar (June 2020)
    const mc = document.getElementById('mcal-host');
    if (mc) {
      const grid = mc.querySelector('.mcal__grid');
      const WD = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      // June 2020: 1st is Monday
      const firstDay = 1, daysInMonth = 30, prevDays = 31;
      let html = WD.map(w => `<div class="mcal__wd">${w}</div>`).join('');
      for (let i = firstDay - 1; i >= 0; i--) html += `<div class="mcal__day is-other">${prevDays - i}</div>`;
      for (let d = 1; d <= daysInMonth; d++) {
        const cls = ['mcal__day'];
        if (d === 21) cls.push('is-selected');
        if (d === 19 || d === 20) cls.push('is-range');
        if (d === 22) cls.push('has-dot');
        html += `<div class="${cls.join(' ')}">${d}</div>`;
      }
      const total = firstDay + daysInMonth, tail = (7 - (total % 7)) % 7;
      for (let i = 1; i <= tail; i++) html += `<div class="mcal__day is-other">${i}</div>`;
      grid.innerHTML = html;
    }

    // KPI Donut (Expected Earnings)
    const kd1 = document.getElementById('kpi-donut-1');
    if (kd1) {
      kd1.innerHTML = Charts.donut(
        [{ value: 7660, color: '#EC4899' }, { value: 2820, color: '#2563EB' }, { value: 45257, color: '#E5E7EB' }],
        { size: 100, thickness: 14, track: '#F3F4F7' }
      );
    }

    // KPI Bar (Average Daily Sales)
    const kb1 = document.getElementById('kpi-bar-1');
    if (kb1) {
      kb1.innerHTML = Charts.bar(
        [{x:'M',y:18},{x:'T',y:42},{x:'W',y:62},{x:'T',y:72},{x:'F',y:80},{x:'S',y:96},{x:'S',y:54}],
        { width: 260, height: 120, color: '#3B82F6', gap: 10, radius: 6 }
      );
    }

    // KPI Line 1 (Sales This Months) — Smooth Line + 호버 툴팁
    const kl1 = document.getElementById('kpi-line-1');
    if (kl1) {
      Charts.renderLine(
        kl1,
        [
          {x:'Apr 04',y:18000},{x:'Apr 05',y:19500},{x:'Apr 06',y:21500},{x:'Apr 07',y:21500},
          {x:'Apr 08',y:19500},{x:'Apr 09',y:19000},{x:'Apr 10',y:19500},{x:'Apr 11',y:18000},
          {x:'Apr 12',y:18500},{x:'Apr 13',y:21800},{x:'Apr 14',y:19500},{x:'Apr 15',y:18800},
          {x:'Apr 16',y:23500},
        ],
        {
          width: 760, height: 240, color: '#22C55E',
          yTicks: 4,
          yLabel: v => '$' + (v/1000).toFixed(1) + 'K',
          tooltipLabel: 'Sales',
        }
      );
    }

    // KPI Line 2 (Discounted Product Sales) — Smooth Line + 호버 툴팁
    const kl2 = document.getElementById('kpi-line-2');
    if (kl2) {
      Charts.renderLine(
        kl2,
        [
          {x:'Apr 04',y:344},{x:'Apr 05',y:346},{x:'Apr 06',y:351},{x:'Apr 07',y:350},
          {x:'Apr 08',y:352},{x:'Apr 09',y:354},{x:'Apr 10',y:351},{x:'Apr 12',y:347},
          {x:'Apr 14',y:354},{x:'Apr 16',y:354},{x:'Apr 18',y:357},
        ],
        {
          width: 600, height: 220, color: '#3B82F6',
          yTicks: 4,
          yLabel: v => '$' + Math.round(v),
          tooltipLabel: 'Sales',
        }
      );
    }

    // Order tabs toggle
    document.querySelectorAll('.order-card__tabs').forEach(host => {
      host.addEventListener('click', e => {
        const t = e.target.closest('.order-tab');
        if (!t) return;
        host.querySelectorAll('.order-tab').forEach(o => o.classList.toggle('is-active', o === t));
      });
    });
  })();

  /* ============ Charts section demos ============ */
  (function () {
    if (!window.Charts) return;

    const cd = document.getElementById('ch-donut');
    if (cd) {
      cd.innerHTML = Charts.donut(
        [{value:42,color:'#EC4899'},{value:28,color:'#2563EB'},{value:18,color:'#22C55E'},{value:12,color:'#F59E0B'}],
        { size: 140, thickness: 18, center: '<div><div style="font-size:20px;font-weight:700;letter-spacing:-0.02em">100%</div><div style="font-size:10px;color:#9CA3AF">Channels</div></div>' }
      );
    }

    ['ch-gauge-1','ch-gauge-2','ch-gauge-3'].forEach((id, i) => {
      const el = document.getElementById(id);
      if (!el) return;
      const cfgs = [
        { v: 28, color: '#DC2626', label: 'Low'  },
        { v: 65, color: '#F59E0B', label: 'Mid'  },
        { v: 92, color: '#22C55E', label: 'High' },
      ];
      const c = cfgs[i];
      el.innerHTML = Charts.gauge(c.v, 100, { size: 140, thickness: 12, color: c.color }) +
        `<div style="text-align:center; margin-top:-32px; font-size:22px; font-weight:700; letter-spacing:-0.02em">${c.v}</div>` +
        `<div style="text-align:center; font-size:11px; color:#9CA3AF; font-weight:600">${c.label}</div>`;
    });

    const cl = document.getElementById('ch-line-1');
    if (cl) {
      // 고정 시드로 매 새로고침마다 같은 그래프 (호버 검증용)
      let seed = 12345;
      const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
      const lineData = Array.from({length: 12}, (_, i) => ({
        x: 'M' + (i + 1),
        y: 30 + Math.sin(i * 0.7) * 18 + rand() * 8,
      }));
      Charts.renderLine(cl, lineData, {
        width: 700, height: 220, color: '#8B5CF6',
        yTicks: 4, yLabel: v => v.toFixed(0),
        tooltipLabel: 'Value',
      });
    }

    const cb = document.getElementById('ch-bar-1');
    if (cb) {
      cb.innerHTML = Charts.bar(
        [{x:'Jan',y:24},{x:'Feb',y:48},{x:'Mar',y:32},{x:'Apr',y:64},{x:'May',y:52},{x:'Jun',y:78},{x:'Jul',y:88},{x:'Aug',y:62}],
        { width: 600, height: 200, color: '#3B82F6', gap: 14, radius: 6, labels: true, paddingY: 24 }
      );
    }

    const cml = document.getElementById('ch-mline-1');
    if (cml) {
      const M = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
      cml.innerHTML = Charts.multiLine([
        { name: '올해', color: '#00347D', data: M.map((x,i)=>({x, y:[92,95,108,104,101,112,99,90,110,118,114,124][i]})) },
        { name: '작년', color: '#9CA3AF', dashed: true, data: M.map((x,i)=>({x, y:[80,84,92,90,88,96,86,80,95,101,99,108][i]})) },
      ], { width: 600, height: 220, yLabel: (v)=>v.toFixed(0), yTicks: 4 });
    }
    const cgb = document.getElementById('ch-gbar-1');
    if (cgb) {
      cgb.innerHTML = Charts.groupBar(
        ['1월','2월','3월','4월','5월','6월'].map((x,i)=>({ x, values: [[92,95,108,104,101,112][i], [70,72,80,78,76,82][i]] })),
        { width: 600, height: 220, colors: ['#00347D','#CBD5E1'], yLabel: (v)=>v.toFixed(0), yTicks: 4 }
      );
    }

    const sparks = [
      ['ch-spark-1', [12,18,15,22,28,32,30,38,45,42,48,52], '#22C55E'],
      ['ch-spark-2', [38,32,42,48,45,52,58,55,62,68,72,70], '#3B82F6'],
      ['ch-spark-3', [52,48,55,50,45,42,38,35,38,42,40,38], '#EC4899'],
      ['ch-spark-4', [8,12,10,14,18,15,22,20,18,16,14,12], '#F59E0B'],
    ];
    sparks.forEach(([id, vals, color]) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = Charts.sparkline(vals, { width: 200, height: 40, color });
    });
  })();

  /* ============ Card Showcase: bar chart (smooth animation on appear) ============ */
  (function () {
    const host = document.getElementById('chart-bars');
    if (!host) return;
    // 정제된 데이터 패턴: 자연스러운 그래프 형태
    const heights = [32, 48, 38, 62, 54, 78, 68, 92, 82, 96, 88, 100, 84, 72, 56];
    host.innerHTML = heights.map((h, i) =>
      `<span style="height:0%; transition: height 0.7s cubic-bezier(0.4,0,0.2,1) ${i * 40}ms; opacity:${0.55 + h/250}"></span>`
    ).join('');
    // 다음 프레임에 실제 높이 적용 → 부드러운 grow-up 애니메이션
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        host.querySelectorAll('span').forEach((b, i) => { b.style.height = heights[i] + '%'; });
      });
    });
  })();

  /* ============ Stat Cards ============ */
  (function () {
    const host = document.getElementById('stat-cards-host');
    if (!host) return;
    const cards = [
      { kind: 'orange', code: 'WST-OIL-01', label: '폐유',         tag: '지정폐기물',     unit: 'L',  final: 300,   prev: 320,   inQty: 180, useQty: 0, scrap: 200, history: 2,
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>' },
      { kind: 'blue',   code: 'WST-WTR-01', label: '폐수 (현상액)',  tag: '지정폐기물',     unit: 'L',  final: 500,   prev: 540,   inQty: 260, useQty: 0, scrap: 300, history: 2,
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>' },
      { kind: 'navy',   code: 'WST-PLT-01', label: '폐판 (알루미늄 인쇄판)', tag: '사업장폐기물', unit: '매', final: 1080,  prev: 1200,  inQty: 480, useQty: 0, scrap: 600, history: 2,
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>' },
      { kind: 'green',  code: 'WST-PPR-01', label: '폐지 (인쇄 잔지)', tag: '사업장폐기물',   unit: 'kg', final: 660,   prev: 850,   inQty: 430, useQty: 120, scrap: 500, history: 2,
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>' },
      { kind: 'purple', code: 'WST-RAG-01', label: '폐걸래 (잉크 오염)', tag: '사업장폐기물', unit: 'kg', final: 75,    prev: 60,    inQty: 35,  useQty: 0, scrap: 20,  history: 2,
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>' },
      { kind: 'red',    code: 'WST-SLV-01', label: '폐용제 (세척용)',   tag: '지정폐기물',   unit: 'L',  final: 220,   prev: 180,   inQty: 140, useQty: 0, scrap: 100, history: 2,
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v7.31"/><path d="M14 9.3V2"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/></svg>' },
    ];
    host.innerHTML = cards.map(c => `
      <article class="stat-card stat-card--${c.kind}">
        <header class="stat-card__top">
          <span class="stat-card__icon">${c.icon}</span>
          <div class="stat-card__meta">
            <div class="stat-card__title">${c.label}</div>
            <div class="stat-card__code">${c.code} · ${c.tag}</div>
          </div>
          <span class="stat-card__unit">${c.unit}</span>
        </header>
        <div class="stat-card__main">
          <span class="stat-card__main-label">최종재고</span>
          <span class="stat-card__main-value">${c.final.toLocaleString()}<small>${c.unit}</small></span>
        </div>
        <div class="stat-card__grid">
          <div class="stat-card__grid-item"><span>기존재고</span><strong>${c.prev.toLocaleString()}</strong></div>
          <div class="stat-card__grid-item"><span>누적입고</span><strong class="up">+${c.inQty}</strong></div>
          <div class="stat-card__grid-item"><span>누적사용</span><strong>${c.useQty ? '-' + c.useQty : '-0'}</strong></div>
          <div class="stat-card__grid-item"><span>누적폐기</span><strong class="down">-${c.scrap}</strong></div>
        </div>
        <footer class="stat-card__footer">
          <span class="stat-card__footer-meta">${c.history}건의 처리 이력</span>
          <a class="stat-card__link" href="#">상세 보기 →</a>
        </footer>
      </article>
    `).join('');
  })();

  /* ============ OffCanvas ============ */
  (function () {
    function openOC(id) {
      const oc = document.getElementById(id);
      const bd = document.querySelector(`[data-oc-host="${id}"]`);
      if (!oc) return;
      oc.classList.add('is-open');
      bd && bd.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    }
    function closeAll() {
      $$('.offcanvas.is-open, .oc-backdrop.is-open').forEach(el => el.classList.remove('is-open'));
      document.body.style.overflow = '';
    }
    $$('[data-oc-open]').forEach(b => b.addEventListener('click', () => openOC(b.dataset.ocOpen)));
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-oc-close]')) closeAll();
      if (e.target.matches('.oc-backdrop')) closeAll();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.querySelector('.offcanvas.is-open')) closeAll();
    });

    // Memo character counter
    $$('[data-memo-host]').forEach(host => {
      const ta = host.querySelector('[data-memo-input]');
      const out = host.querySelector('[data-memo-count]');
      const save = host.querySelector('[data-memo-save]');
      function update() { out.textContent = ta.value.length; }
      ta && ta.addEventListener('input', update);
      save && save.addEventListener('click', () => {
        window.toast && window.toast('메모가 저장되었습니다.', 'success');
      });
      update();
    });
  })();

  /* ============ Icon Grid ============ */
  function renderIconGrid() {
    const host = $('#icon-grid');
    if (!host || !window.Icons) return;
    host.innerHTML = Object.entries(window.Icons).map(([name, svg]) => `
      <div class="icon-cell" title="${name}">${svg}<span>${name}</span></div>
    `).join('');
  }
  renderIconGrid();

  /* ============ TOC scrollspy ============ */
  function initTOC() {
    const links = $$('#uk-toc a');
    const targets = links
      .map(a => document.querySelector(a.getAttribute('href')))
      .filter(Boolean);
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          const id = e.target.id;
          links.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === '#' + id));
        }
      });
    }, { rootMargin: '-30% 0px -65% 0px' });
    targets.forEach(t => obs.observe(t));
    links.forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      const id = a.getAttribute('href').slice(1);
      const t = document.getElementById(id);
      t && t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }
  initTOC();

  /* ============ Tag close ============ */
  document.addEventListener('click', (e) => {
    const close = e.target.closest('[data-remove-tag]');
    if (close) close.parentElement.remove();
  });

  /* ============ Progress control ============ */
  (function () {
    const bar = $('#ctrl-progress');
    if (!bar) return;
    function set(v) { v = Math.max(0, Math.min(100, v)); bar.style.width = v + '%'; bar.dataset.v = v; }
    set(30);
    $('#ctrl-inc').addEventListener('click', () => set(Number(bar.dataset.v || 30) + 10));
    $('#ctrl-dec').addEventListener('click', () => set(Number(bar.dataset.v || 30) - 10));
  })();

  /* ============ Popover ============ */
  $$('[data-pop]').forEach(p => {
    p.addEventListener('click', (e) => {
      e.stopPropagation();
      $$('[data-pop]').forEach(o => { if (o !== p) o.classList.remove('is-open'); });
      p.classList.toggle('is-open');
    });
    p.querySelector('.pop__panel')?.addEventListener('click', e => e.stopPropagation());
  });
  document.addEventListener('click', () => $$('[data-pop]').forEach(p => p.classList.remove('is-open')));

  /* ============ Dropdown ============ */
  $$('[data-dd]').forEach(d => {
    d.querySelector('button').addEventListener('click', (e) => {
      e.stopPropagation();
      $$('[data-dd]').forEach(o => { if (o !== d) o.classList.remove('is-open'); });
      d.classList.toggle('is-open');
    });
    d.querySelector('.dd__menu')?.addEventListener('click', e => e.stopPropagation());
  });
  document.addEventListener('click', () => $$('[data-dd]').forEach(d => d.classList.remove('is-open')));

  /* ============ Accordion ============ */
  $$('[data-acc]').forEach(acc => {
    const single = acc.hasAttribute('data-acc-single');
    acc.addEventListener('click', (e) => {
      const head = e.target.closest('[data-acc-toggle]');
      if (!head) return;
      const item = head.closest('.acc-item');
      const opening = !item.classList.contains('is-open');
      if (single) acc.querySelectorAll('.acc-item').forEach(i => i.classList.remove('is-open'));
      item.classList.toggle('is-open', opening);
    });
  });

  /* ============ Tabs ============ */
  $$('[data-tabs]').forEach(tabs => {
    tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      const id = btn.dataset.tab;
      tabs.querySelectorAll('.tabs__tab').forEach(t => t.classList.toggle('is-active', t === btn));
      tabs.querySelectorAll('.tabs__panel').forEach(p => p.classList.toggle('is-active', p.dataset.panel === id));
    });
  });

  /* ============ Modal ============ */
  function openModal(id) {
    const m = document.querySelector(`.modal-backdrop[data-modal-id="${id}"]`) || document.getElementById('modal-' + id);
    if (!m) return;
    m.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeAllModals() {
    $$('.modal-backdrop.is-open').forEach(m => m.classList.remove('is-open'));
    document.body.style.overflow = '';
  }
  $$('[data-open-modal]').forEach(b => b.addEventListener('click', () => openModal(b.dataset.openModal)));
  $$('.modal-backdrop').forEach(m => {
    m.addEventListener('click', (e) => { if (e.target === m) closeAllModals(); });
  });
  document.addEventListener('click', (e) => { if (e.target.closest('[data-modal-close]')) closeAllModals(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAllModals(); });

  /* ============ Toast ============ */
  const toastHost = $('#toast-host');
  function toast(text, kind = 'info', timeout = 3000) {
    const t = document.createElement('div');
    t.className = 'toast toast--' + kind;
    t.innerHTML = `<span>${text}</span><button class="toast__close">✕</button>`;
    toastHost.appendChild(t);
    function dismiss() {
      t.classList.add('is-out');
      t.addEventListener('animationend', () => t.remove(), { once: true });
    }
    t.querySelector('.toast__close').addEventListener('click', dismiss);
    if (timeout) setTimeout(dismiss, timeout);
  }
  window.toast = toast; // expose
  $$('[data-toast]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.toast;
    const msgs = { info: '안내 메시지입니다.', success: '저장되었습니다.', warning: '주의가 필요합니다.', danger: '오류가 발생했습니다.' };
    toast(msgs[k] || '메시지', k);
  }));

  /* ============ Sweet Alert ============ */
  const SW_ICONS = {
    success:  { cls: 'sweet-icon--success',  glyph: '✓' },
    danger:   { cls: 'sweet-icon--danger',   glyph: '✕' },
    warning:  { cls: 'sweet-icon--warning',  glyph: '!' },
    info:     { cls: 'sweet-icon--info',     glyph: 'i' },
    confirm:  { cls: 'sweet-icon--question', glyph: '?' },
  };
  function sweet({ icon = 'info', title, text, confirmText = '확인', cancelText, onConfirm }) {
    const m = $('#sweet-modal');
    const cfg = SW_ICONS[icon] || SW_ICONS.info;
    $('#sweet-body').innerHTML = `
      <div class="sweet-icon ${cfg.cls}">${cfg.glyph}</div>
      <div class="sweet-body">
        <div class="sweet-body__title">${title || ''}</div>
        <div class="sweet-body__text">${text || ''}</div>
      </div>
    `;
    $('#sweet-footer').innerHTML = `
      ${cancelText ? `<button class="btn" data-modal-close>${cancelText}</button>` : ''}
      <button class="btn btn--primary" data-sweet-ok>${confirmText}</button>
    `;
    $('[data-sweet-ok]').addEventListener('click', () => {
      closeAllModals();
      onConfirm && onConfirm();
    });
    m.classList.add('is-open'); document.body.style.overflow = 'hidden';
  }
  window.sweet = sweet;
  $$('[data-sweet]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.sweet;
    if (k === 'confirm') {
      sweet({ icon: 'confirm', title: '삭제하시겠습니까?', text: '이 작업은 되돌릴 수 없습니다.', cancelText: '취소', confirmText: '삭제',
        onConfirm: () => toast('삭제되었습니다.', 'success') });
    } else {
      const titles = { success: '성공', danger: '오류', warning: '경고', info: '안내' };
      const texts  = { success: '작업이 정상적으로 처리되었습니다.', danger: '요청을 처리할 수 없습니다.',
                       warning: '입력값을 다시 확인해주세요.', info: '안내 메시지입니다.' };
      sweet({ icon: k, title: titles[k], text: texts[k] });
    }
  }));

  /* ============ Slider ============ */
  $$('[data-slider]').forEach(slider => {
    const track = slider.querySelector('.slider__track');
    const slides = slider.querySelectorAll('.slider__slide');
    const dotsHost = slider.querySelector('.slider__dots');
    let idx = 0;
    let timer;
    function render() {
      track.style.transform = `translateX(-${idx * 100}%)`;
      dotsHost.querySelectorAll('.slider__dot').forEach((d, i) => d.classList.toggle('is-on', i === idx));
    }
    function go(n) { idx = (n + slides.length) % slides.length; render(); }
    function auto() { clearInterval(timer); timer = setInterval(() => go(idx + 1), 4000); }
    dotsHost.innerHTML = Array.from(slides).map((_, i) => `<span class="slider__dot" data-i="${i}"></span>`).join('');
    dotsHost.addEventListener('click', e => { const d = e.target.closest('.slider__dot'); if (d) { go(Number(d.dataset.i)); auto(); } });
    slider.querySelector('[data-slider-prev]').addEventListener('click', () => { go(idx - 1); auto(); });
    slider.querySelector('[data-slider-next]').addEventListener('click', () => { go(idx + 1); auto(); });
    render(); auto();
  });

  /* ============ Range Slider (single) ============ */
  $$('[data-single-range]').forEach(r => {
    const out = $('[data-single-val]');
    r.addEventListener('input', () => { if (out) out.textContent = r.value; });
  });

  /* ============ Range Slider (dual) ============ */
  $$('[data-dual-rng]').forEach(rng => {
    const lo = rng.querySelector('[data-dual-low]');
    const hi = rng.querySelector('[data-dual-high]');
    const fill = rng.querySelector('.dual-rng__fill');
    const loOut = document.querySelector('[data-dual-low-val]');
    const hiOut = document.querySelector('[data-dual-high-val]');
    const min = Number(rng.dataset.min);
    const max = Number(rng.dataset.max);
    function update() {
      let l = Number(lo.value), h = Number(hi.value);
      if (l > h - 5000) { if (this === lo) lo.value = (h - 5000); else hi.value = (l + 5000); l = Number(lo.value); h = Number(hi.value); }
      const lp = ((l - min) / (max - min)) * 100;
      const hp = ((h - min) / (max - min)) * 100;
      fill.style.left  = lp + '%';
      fill.style.right = (100 - hp) + '%';
      if (loOut) loOut.textContent = l.toLocaleString();
      if (hiOut) hiOut.textContent = h.toLocaleString();
    }
    lo.addEventListener('input', update);
    hi.addEventListener('input', update);
    update();
  });

  /* ============ Dropzone ============ */
  (function () {
    const dz = $('#dz'); const input = $('#dz-input'); const list = $('#dz-list');
    if (!dz) return;
    const files = [];
    function render() {
      list.innerHTML = files.map((f, i) => `
        <div class="dz-file">
          <span>📄</span>
          <span class="dz-file__name">${f.name}</span>
          <span class="dz-file__size">${(f.size / 1024).toFixed(1)} KB</span>
          <button class="dz-file__remove" data-i="${i}">제거</button>
        </div>
      `).join('');
    }
    function add(fs) { Array.from(fs).forEach(f => files.push(f)); render(); }
    dz.addEventListener('click', () => input.click());
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('is-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('is-over'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('is-over'); add(e.dataTransfer.files); });
    input.addEventListener('change', () => add(input.files));
    list.addEventListener('click', e => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      files.splice(Number(b.dataset.i), 1); render();
    });
  })();

  /* ============ Rating ============ */
  $$('[data-rating]').forEach(r => {
    const stars = $$('.rating__star', r);
    const out = document.querySelector('[data-rating-val]');
    let val = Number(r.dataset.value || 0);
    function paint(v) { stars.forEach(s => s.classList.toggle('is-on', Number(s.dataset.r) <= v)); }
    paint(val);
    r.addEventListener('mouseover', e => { const s = e.target.closest('.rating__star'); if (s) paint(Number(s.dataset.r)); });
    r.addEventListener('mouseleave', () => paint(val));
    r.addEventListener('click', e => {
      const s = e.target.closest('.rating__star');
      if (!s) return;
      val = Number(s.dataset.r); paint(val);
      if (out && r === document.querySelector('[data-rating]')) out.textContent = val;
    });
  });

  /* ============ Tree View ============ */
  $('#tree')?.addEventListener('click', (e) => {
    const tog = e.target.closest('.tree__toggle');
    const row = e.target.closest('.tree__row');
    if (!row) return;
    const node = row.parentElement;
    if (node.classList.contains('is-leaf')) return;
    node.classList.toggle('is-open');
  });

  /* ============ Org Combo (조직도 드롭다운) demo ============ */
  $$('[data-org-combo]').forEach(root => {
    if (!window.App || !App.Components || !App.Components.attachOrgCombo) return;
    const demoNodes = [
      { name: '임원실' },
      { name: '감사' },
      { name: '경영지원본부', children: [
        { name: '회계팀' }, { name: '인사총무팀' }, { name: '자산관리팀' },
      ]},
      { name: 'MVP개발부' },
      { name: '홍보팀' },
      { name: '고객지원본부', children: [
        { name: 'CS파트' }, { name: '고객지원파트' },
        { name: '접수팀', children: [
          { name: '디자인파트' }, { name: '접수파트-재택' },
        ]},
        { name: '영업파트' },
      ]},
      { name: 'IT연구소', children: [
        { name: '개발1팀' }, { name: '개발2팀' }, { name: '인프라운영파트' },
      ]},
    ];
    const out = document.querySelector('[data-org-combo-out]');
    App.Components.attachOrgCombo(root, {
      nodes: demoNodes,
      placeholder: '부서를 선택해 주세요',
      searchable: true,
      onChange(value) { if (out) out.textContent = value || '—'; },
    });
  });

  /* ============ Password toggle ============ */
  $$('[data-toggle-pw]').forEach(b => {
    b.addEventListener('click', () => {
      const inp = document.getElementById(b.dataset.togglePw);
      if (!inp) return;
      inp.type = inp.type === 'password' ? 'text' : 'password';
      b.textContent = inp.type === 'password' ? '👁' : '🙈';
    });
  });

  /* ============ Mega Options ============ */
  $$('[data-mega]').forEach(host => {
    const out = document.querySelector('[data-mega-val]');
    host.addEventListener('click', (e) => {
      const opt = e.target.closest('.mega-opt');
      if (!opt) return;
      host.querySelectorAll('.mega-opt').forEach(o => o.classList.toggle('is-on', o === opt));
      if (out) out.textContent = opt.dataset.value;
    });
  });

  /* ============ Touchspin ============ */
  $$('[data-tspin]').forEach(t => {
    const inp = t.querySelector('input');
    const min = Number(t.dataset.min ?? '-Infinity');
    const max = Number(t.dataset.max ?? 'Infinity');
    const step = Number(t.dataset.step || 1);
    const clamp = v => Math.max(min, Math.min(max, v));
    t.querySelector('[data-tspin-dec]').addEventListener('click', () => inp.value = clamp(Number(inp.value) - step));
    t.querySelector('[data-tspin-inc]').addEventListener('click', () => inp.value = clamp(Number(inp.value) + step));
    inp.addEventListener('change', () => inp.value = clamp(Number(inp.value) || 0));
  });

  /* ============ Datepicker (custom calendar) ============ */
  (function () {
    const root = $('#dp');
    if (!root) return;
    const input = root.querySelector('input');
    const panel = root.querySelector('.dp__panel');
    const today = new Date();
    let view = new Date(today.getFullYear(), today.getMonth(), 1);
    let selected = null;
    const WEEKDAYS = ['일','월','화','수','목','금','토'];
    function fmt(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
    function render() {
      const y = view.getFullYear(); const m = view.getMonth();
      const first = new Date(y, m, 1);
      const startDay = first.getDay();
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const prevDays   = new Date(y, m, 0).getDate();
      let cells = '';
      for (let i = startDay - 1; i >= 0; i--) cells += `<div class="dp__day is-other">${prevDays - i}</div>`;
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(y, m, d);
        const cls = [];
        if (date.toDateString() === today.toDateString()) cls.push('is-today');
        if (selected && date.toDateString() === selected.toDateString()) cls.push('is-selected');
        cells += `<div class="dp__day ${cls.join(' ')}" data-day="${d}">${d}</div>`;
      }
      const total = startDay + daysInMonth;
      const tail = (7 - (total % 7)) % 7;
      for (let i = 1; i <= tail; i++) cells += `<div class="dp__day is-other">${i}</div>`;
      panel.innerHTML = `
        <div class="dp__head">
          <span class="dp__nav" data-prev>‹</span>
          <span>${y}.${String(m+1).padStart(2,'0')}</span>
          <span class="dp__nav" data-next>›</span>
        </div>
        <div class="dp__grid">${WEEKDAYS.map(w => `<div class="dp__wd">${w}</div>`).join('') + cells}</div>
      `;
    }
    input.addEventListener('click', e => { e.stopPropagation(); root.classList.toggle('is-open'); render(); });
    document.addEventListener('click', e => { if (!root.contains(e.target)) root.classList.remove('is-open'); });
    panel.addEventListener('click', e => {
      e.stopPropagation();
      if (e.target.matches('[data-prev]')) { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); render(); return; }
      if (e.target.matches('[data-next]')) { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); render(); return; }
      const cell = e.target.closest('.dp__day:not(.is-other)');
      if (cell) {
        selected = new Date(view.getFullYear(), view.getMonth(), Number(cell.dataset.day));
        input.value = fmt(selected); root.classList.remove('is-open');
      }
    });
  })();

  /* ============ Typeahead ============ */
  (function () {
    const root = $('#ta'); if (!root) return;
    const input = root.querySelector('input');
    const list = root.querySelector('.ta__list');
    const data = [
      '대한민국','일본','중국','미국','독일','프랑스','이탈리아','스페인','영국','호주','뉴질랜드',
      'Argentina','Brazil','Canada','Denmark','Egypt','Finland','Germany','Hungary','India','Japan',
      'Korea','Mexico','Norway','Portugal','Russia','Sweden','Thailand','Vietnam',
    ];
    function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function render(q) {
      if (!q) { root.classList.remove('is-open'); return; }
      const re = new RegExp('(' + escapeRe(q) + ')', 'gi');
      const hit = data.filter(d => d.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
      if (!hit.length) {
        list.innerHTML = `<div class="ta__empty">결과가 없습니다.</div>`;
      } else {
        list.innerHTML = hit.map(d => `<div class="ta__item">${d.replace(re, '<mark>$1</mark>')}</div>`).join('');
      }
      root.classList.add('is-open');
    }
    input.addEventListener('input', () => render(input.value));
    input.addEventListener('focus',  () => render(input.value));
    document.addEventListener('click', e => { if (!root.contains(e.target)) root.classList.remove('is-open'); });
    list.addEventListener('click', e => {
      const it = e.target.closest('.ta__item');
      if (it) { input.value = it.textContent; root.classList.remove('is-open'); }
    });
    // 키보드 네비게이션
    input.addEventListener('keydown', e => {
      const items = list.querySelectorAll('.ta__item');
      if (!items.length) return;
      const cur = list.querySelector('.ta__item.is-active');
      let idx = cur ? Array.from(items).indexOf(cur) : -1;
      if (e.key === 'ArrowDown') { idx = (idx + 1) % items.length; e.preventDefault(); }
      else if (e.key === 'ArrowUp') { idx = (idx - 1 + items.length) % items.length; e.preventDefault(); }
      else if (e.key === 'Enter' && cur) { input.value = cur.textContent; root.classList.remove('is-open'); return; }
      else return;
      items.forEach((it, i) => it.classList.toggle('is-active', i === idx));
    });
  })();

  /* ============ Validation ============ */
  (function () {
    const form = $('#val-form'); if (!form) return;
    const ok = $('#val-ok');
    function validateField(field) {
      const rule = field.dataset.validate || '';
      const inp = field.querySelector('input');
      const v = inp ? (inp.type === 'checkbox' ? inp.checked : inp.value.trim()) : '';
      let pass = true;
      rule.split('|').forEach(r => {
        const [name, arg] = r.split(':');
        if (name === 'required') pass = pass && (typeof v === 'boolean' ? v : !!v);
        else if (name === 'email' && v) pass = pass && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        else if (name === 'min'   && v) pass = pass && String(v).length >= Number(arg);
        else if (name === 'match' && v) {
          const other = form.querySelector(`[name="${arg}"]`);
          pass = pass && other && other.value === v;
        }
      });
      field.classList.toggle('is-invalid', !pass);
      field.classList.toggle('is-valid', pass);
      return pass;
    }
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let allOk = true;
      $$('[data-validate]', form).forEach(f => { if (!validateField(f)) allOk = false; });
      if (allOk) { ok.style.display = ''; toast('제출되었습니다!', 'success'); }
      else ok.style.display = 'none';
    });
    form.addEventListener('input', (e) => {
      const f = e.target.closest('[data-validate]'); if (f) validateField(f);
    });
    form.querySelector('[data-val-reset]').addEventListener('click', () => {
      $$('[data-validate]', form).forEach(f => f.classList.remove('is-invalid','is-valid'));
      ok.style.display = 'none';
    });
  })();

  /* ============ Inline Field Error 데모 ============ */
  (function () {
    const form = $('#fe-demo'); if (!form || !window.App || !window.App.Forms) return;
    const F = window.App.Forms;
    const nameEl  = form.querySelector('#fe-demo-name');
    const emailEl = form.querySelector('#fe-demo-email');
    F.applyOnInput(form);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      F.clearAll(form);
      let ok = true;
      const name = nameEl.value.trim();
      const email = emailEl.value.trim();
      if (!name) { F.setFieldError(nameEl, '이름을 입력해 주세요'); ok = false; }
      if (!email) { F.setFieldError(emailEl, '이메일을 입력해 주세요'); ok = false; }
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        F.setFieldError(emailEl, '올바른 이메일 형식이 아닙니다');
        ok = false;
      }
      if (ok && window.toast) window.toast('등록되었습니다.', 'success');
    });
    form.querySelector('[data-fe-reset]').addEventListener('click', () => {
      F.clearAll(form);
      nameEl.value = ''; emailEl.value = '';
    });
  })();

  /* ============ Multi Select (전역 인터랙션) ============ */
  if (window.App && window.App.Components && window.App.Components.initMultiSelect) {
    window.App.Components.initMultiSelect();
  }

  /* ============ Expandable Grid Row Demo ============ */
  (function () {
    const mount = document.getElementById('demo-grid-expand');
    if (!mount || !window.App || !window.App.Grid) return;
    const rows = Array.from({ length: 25 }, (_, i) => ({
      no: 25 - i, name: `프로젝트 ${i + 1}`, owner: '윤성수', stage: i % 3 === 0 ? '진행중' : (i % 3 === 1 ? '완료' : '대기'),
    }));
    window.App.Grid.create({
      mount,
      columns: [
        { key: 'no',    label: 'No',     align: 'right',  width: '60px' },
        { key: 'name',  label: '이름',   align: 'left' },
        { key: 'owner', label: '담당자', align: 'left',   width: '120px' },
        { key: 'stage', label: '단계',   align: 'center', width: '90px' },
        { key: '_exp',  label: '상세',   align: 'center', width: '80px',
          format: () => `<button class="grid__expand-btn" data-grid-expand><span class="caret">▸</span>펼치기</button>` },
      ],
      rows,
      pageSize: 10,
      expand: (row) => `<strong>${row.name}</strong> 상세 — 담당자 ${row.owner}, 단계 ${row.stage}. 본 영역은 <code>opts.expand(row)</code> 가 반환한 HTML입니다.`,
    });
  })();

  /* ============ Brand Card Selectable Demo (선택/해제 토글) ============ */
  (function () {
    const grid = document.querySelector('[data-brand-selectable-demo]');
    if (!grid) return;
    grid.addEventListener('click', (e) => {
      // 카드 또는 토글 버튼 어디를 눌러도 카드 단위 토글 (이벤트 위임)
      const card = e.target.closest('.brand-card--selectable');
      if (!card) return;
      const selected = card.classList.toggle('is-selected');
      const btn = card.querySelector('[data-brand-toggle]');
      if (btn) {
        btn.textContent = selected ? '해제' : '선택';
        btn.classList.toggle('btn--primary', selected);
        btn.classList.toggle('btn--soft', !selected);
      }
    });
  })();

  /* ============ Image Picker Demo (단일 이미지 업로드) ============ */
  (function () {
    document.querySelectorAll('.image-picker[data-ip]').forEach(picker => {
      const input = picker.querySelector('.image-picker__input');
      if (!input) return;
      // 카드 클릭 → 파일 다이얼로그
      // <label> 요소는 브라우저가 자동으로 자식 input 의 click 을 트리거하므로
      // JS 에서 input.click() 을 또 호출하면 파일 다이얼로그가 두 번 열린다.
      picker.addEventListener('click', (e) => {
        if (e.target.closest('.image-picker__remove')) return;
        if (picker.tagName === 'LABEL') return;
        input.click();
      });
      // 파일 선택 → 미리보기 전환
      input.addEventListener('change', () => {
        const f = input.files && input.files[0];
        if (!f) return;
        const url = URL.createObjectURL(f);
        picker.classList.remove('is-empty');
        picker.classList.add('has-image');
        picker.innerHTML = '';
        picker.appendChild(input);
        const img = document.createElement('img');
        img.className = 'image-picker__img'; img.src = url; img.alt = f.name;
        picker.appendChild(img);
        const rm = document.createElement('button');
        rm.type = 'button'; rm.className = 'image-picker__remove'; rm.setAttribute('aria-label', '이미지 삭제');
        rm.textContent = '✕';
        picker.appendChild(rm);
      });
      // X 버튼 → 비어있는 상태로 복귀 (이벤트 위임)
      picker.addEventListener('click', (e) => {
        const rm = e.target.closest('.image-picker__remove');
        if (!rm) return;
        e.stopPropagation();
        picker.classList.remove('has-image');
        picker.classList.add('is-empty');
        picker.innerHTML = '';
        const newInput = document.createElement('input');
        newInput.type = 'file'; newInput.className = 'image-picker__input'; newInput.accept = 'image/*';
        picker.appendChild(newInput);
        picker.appendChild(document.createTextNode('+'));
        // 새 input 에 다시 change 핸들러 부착
        newInput.addEventListener('change', () => {
          const f = newInput.files && newInput.files[0];
          if (!f) return;
          const url = URL.createObjectURL(f);
          picker.classList.remove('is-empty');
          picker.classList.add('has-image');
          picker.innerHTML = '';
          picker.appendChild(newInput);
          const img2 = document.createElement('img');
          img2.className = 'image-picker__img'; img2.src = url; img2.alt = f.name;
          picker.appendChild(img2);
          const rm2 = document.createElement('button');
          rm2.type = 'button'; rm2.className = 'image-picker__remove'; rm2.setAttribute('aria-label', '이미지 삭제');
          rm2.textContent = '✕';
          picker.appendChild(rm2);
        });
      });
    });
  })();

  /* ============ Image Picker Grid Demo (다중 이미지 업로드) ============ */
  (function () {
    document.querySelectorAll('.image-picker-grid[data-ipg-live]').forEach(grid => {
      const max = parseInt(grid.dataset.ipgMax, 10) || 10;
      function count() { return grid.querySelectorAll('[data-ipg-thumb]').length; }
      function syncFull() { grid.classList.toggle('is-full', count() >= max); }
      function addThumb(url, name) {
        const item = document.createElement('div');
        item.className = 'image-picker-grid__item';
        item.setAttribute('data-ipg-thumb', '');
        item.title = '클릭하여 확대';
        item.innerHTML =
          '<img class="image-picker-grid__img" src="' + url + '" alt="' + (name || '') + '">' +
          '<button class="image-picker-grid__remove" type="button" data-ipg-remove aria-label="이미지 삭제">✕</button>';
        const add = grid.querySelector('[data-ipg-add]');
        grid.insertBefore(item, add);
        syncFull();
      }
      // 썸네일 클릭 → 확대 / ✕ → 삭제
      grid.addEventListener('click', (e) => {
        const rm = e.target.closest('[data-ipg-remove]');
        if (rm) { e.stopPropagation(); rm.closest('[data-ipg-thumb]').remove(); syncFull(); return; }
        const thumb = e.target.closest('[data-ipg-thumb]');
        if (thumb && window.App && App.openImageLightbox) {
          const img = thumb.querySelector('img');
          App.openImageLightbox(img ? img.src : '', img ? img.alt : '');
        }
      });
      // 파일 선택 → 썸네일 추가 (최대치 cap)
      const input = grid.querySelector('.image-picker-grid__input');
      if (input) input.addEventListener('change', () => {
        Array.from(input.files || []).forEach(f => {
          if (count() >= max) return;
          if (!/^image\//.test(f.type)) return;
          addThumb(URL.createObjectURL(f), f.name);
        });
        input.value = '';
      });
      syncFull();
    });
  })();

  /* ============ Chip Select Demo (검색·칩·인라인 드롭다운 다중 선택) ============
   *  실제 동작 인터랙티브 데모. data-chip-select-live 루트에 부착.
   *  - 입력: 검색어로 옵션 필터 (초성 포함) + ↑↓ 키로 active 이동 + Enter 로 선택 + Backspace 로 마지막 칩 제거
   *  - 옵션 클릭: 칩 추가 + 입력 초기화 + 옵션 리스트에서 자동 제외 + 드롭다운 유지
   *  - 칩 × 클릭: 칩 제거 + 옵션 리스트에 복귀
   *
   *  Fix 내역:
   *   ① 옵션 선택 후 드롭다운 즉시 닫힘 — _renderDropdown() 이 DOM 교체 시
   *     detach 된 e.target 을 document.click 핸들러가 "외부 클릭" 으로 오인.
   *     → dropdown click 에 e.stopPropagation(), document.click 에 document.contains() 방어.
   *   ② 드롭다운 위치 오류 — CSS top:100% 가 label+field+hint 전체 높이 기준.
   *     → _positionDropdown() 으로 field 하단 기준 동적 계산.
   *   ③ 초성 검색 미지원 → _matchCho() 헬퍼 추가.
   * ============================================================ */
  (function () {
    /* 초성 검색 헬퍼 */
    const _CHOSUNG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
    function _cho(str) {
      return Array.from(str).map(ch => {
        const code = ch.charCodeAt(0);
        return (code >= 0xAC00 && code <= 0xD7A3)
          ? _CHOSUNG[Math.floor((code - 0xAC00) / 588)]
          : ch.toLowerCase();
      }).join('');
    }
    function _matchCho(target, q) {
      const tc = _cho(target);
      for (let i = 0; i <= tc.length - q.length; i++) {
        if (tc.slice(i, i + q.length) === q) return true;
      }
      return false;
    }

    document.querySelectorAll('[data-chip-select-live]').forEach(root => {
      const FACILITY_CATALOG = [
        { code: 'FAC-001', name: '윤전기 #1',  kind: '윤전기', loc: '성수동 1F' },
        { code: 'FAC-002', name: '윤전기 #3',  kind: '윤전기', loc: '성수동 1F' },
        { code: 'FAC-003', name: '인쇄기 #2',  kind: '인쇄기', loc: '성수동 1F' },
        { code: 'FAC-004', name: '인쇄기 #5',  kind: '인쇄기', loc: '성수동 2F' },
        { code: 'FAC-005', name: '제본기 #1',  kind: '제본기', loc: '남영동 1F' },
        { code: 'FAC-006', name: '제본기 #3',  kind: '제본기', loc: '남영동 2F' },
        { code: 'FAC-007', name: '재단기 #1',  kind: '재단기', loc: '성남 1F'   },
        { code: 'FAC-008', name: '코팅기 #2',  kind: '코팅기', loc: '하남 1F'   },
      ];
      const field    = root.querySelector('[data-chip-select-field]');
      const input    = root.querySelector('[data-chip-select-input]');
      const dropdown = root.querySelector('[data-chip-select-dropdown]');
      const countEl  = root.querySelector('[data-chip-select-count]');
      if (!field || !input || !dropdown) return;
      const selected = new Set();   // code 집합

      function _escAttr(s){ return String(s ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;'); }

      /* ② Fix: 드롭다운을 field 바로 아래 동적 위치 고정 */
      function _positionDropdown() {
        const fieldRect = field.getBoundingClientRect();
        const rootRect  = root.getBoundingClientRect();
        dropdown.style.top = (fieldRect.bottom - rootRect.top + 2) + 'px';
      }

      function _renderField() {
        // 기존 칩 제거 후 다시 그림 (input 은 보존)
        Array.from(field.querySelectorAll('.chip-select__chip')).forEach(c => c.remove());
        Array.from(selected).reverse().forEach(code => {
          const item = FACILITY_CATALOG.find(o => o.code === code);
          if (!item) return;
          const chip = document.createElement('span');
          chip.className = 'chip-select__chip';
          chip.innerHTML = `${item.name} <span class="chip-select__chip-sub">${item.kind} · ${item.loc}</span><button type="button" class="chip-select__chip-remove" aria-label="제거" data-rm-code="${_escAttr(item.code)}">×</button>`;
          field.insertBefore(chip, field.firstChild);
        });
        if (countEl) countEl.textContent = String(selected.size);
      }
      function _renderDropdown() {
        const q = (input.value || '').trim().toLowerCase();
        const list = FACILITY_CATALOG
          .filter(o => !selected.has(o.code))
          .filter(o => !q
            || o.name.toLowerCase().includes(q)
            || o.code.toLowerCase().includes(q)
            || o.kind.toLowerCase().includes(q)
            || _matchCho(o.name, q)   /* ③ Fix: 초성 검색 */
            || _matchCho(o.kind, q));
        if (!list.length) {
          dropdown.innerHTML = `<div class="chip-select__empty">검색 결과가 없습니다.</div>`;
          return;
        }
        dropdown.innerHTML = list.map((o, i) => `
          <button class="chip-select__option${i === 0 ? ' is-active' : ''}" type="button" data-pick-code="${_escAttr(o.code)}">
            <span class="chip-select__option-text">
              <span class="chip-select__option-main">${o.name}</span>
              <span class="chip-select__option-sub">${o.kind} · ${o.loc}</span>
            </span>
            <span class="chip-select__option-code">${o.code}</span>
          </button>`).join('');
      }
      function _open() {
        root.classList.add('is-open');
        _positionDropdown();   /* ② Fix */
        _renderDropdown();
      }
      function _close() { root.classList.remove('is-open'); }
      function _addByCode(code) {
        if (!code || selected.has(code)) return;
        selected.add(code);
        input.value = '';
        _renderField();
        root.classList.add('is-open');   /* ① Fix: 선택 후 드롭다운 유지 */
        _positionDropdown();             /* ② Fix */
        _renderDropdown();
        input.focus();
      }
      function _removeByCode(code) {
        if (!selected.has(code)) return;
        selected.delete(code);
        _renderField();
        if (root.classList.contains('is-open')) _renderDropdown();
      }
      function _moveActive(dir) {
        const opts = Array.from(dropdown.querySelectorAll('.chip-select__option'));
        if (!opts.length) return;
        let i = opts.findIndex(o => o.classList.contains('is-active'));
        if (i < 0) i = 0;
        opts[i].classList.remove('is-active');
        i = (i + dir + opts.length) % opts.length;
        opts[i].classList.add('is-active');
        opts[i].scrollIntoView({ block: 'nearest' });
      }

      // 입력 포커스 → 드롭다운 열기
      input.addEventListener('focus', _open);
      input.addEventListener('input', () => { _open(); });
      // 필드 클릭 → 입력으로 포커스
      field.addEventListener('click', (e) => {
        if (e.target.closest('.chip-select__chip')) return;
        input.focus();
      });
      // 키보드
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); _open(); _moveActive(+1); }
        else if (e.key === 'ArrowUp')   { e.preventDefault(); _moveActive(-1); }
        else if (e.key === 'Enter') {
          e.preventDefault();
          const active = dropdown.querySelector('.chip-select__option.is-active');
          if (active) _addByCode(active.dataset.pickCode);
        }
        else if (e.key === 'Escape') { _close(); }
        else if (e.key === 'Backspace' && !input.value && selected.size) {
          const last = Array.from(selected).pop();
          _removeByCode(last);
        }
      });
      /* ① Fix: 옵션 클릭 — stopPropagation 추가
       *  _renderDropdown() 이 innerHTML 교체 시 클릭된 버튼이 DOM 에서 detach 됨.
       *  이후 document.click 핸들러가 detach 된 e.target 을 "외부 클릭"으로 오인하여
       *  _close() 를 호출하는 문제를 stopPropagation() 으로 원천 차단. */
      dropdown.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-pick-code]');
        if (btn) {
          e.stopPropagation();
          _addByCode(btn.dataset.pickCode);
        }
      });
      // 칩 × 클릭
      field.addEventListener('click', (e) => {
        const rm = e.target.closest('[data-rm-code]');
        if (rm) { e.stopPropagation(); _removeByCode(rm.dataset.rmCode); }
      });
      /* ① Fix: 외부 클릭 → 닫기
       *  document.contains(e.target) 체크 추가 — detach 된 요소(innerHTML 교체로 제거된 옵션 버튼)는
       *  document 범위 밖으로 간주되므로 닫기 트리거가 오동작하는 것을 방어. */
      document.addEventListener('click', (e) => {
        if (!root.contains(e.target) && document.contains(e.target)) _close();
      });
    });
  })();

  /* ============ Photo Lightbox (UI Kit `.photo-lightbox`) — 도메인 단일 이미지 크게보기 표준
   *  어떤 화면에서든 썸네일 클릭 시 큰 화면으로 확대. (메인앱 pages.js 구현과 동일 마크업/동작)
   *
   *  사용:
   *    App.openPhotoLightbox({ photos:[{src,caption,icon}], index:0 });  // 다중(◀▶ 네비)
   *    App.openPhotoLightbox(src, caption);                              // 단일 src
   *    App.openImageLightbox(src, alt);                                  // 하위호환 어댑터
   *    App.openImageLightbox({ title, fileName, dataUrl, icon });        // 파일첨부용(어댑터)
   *
   *  src 가 없으면 placeholder(아이콘+파일명) 표시. 닫기: × / backdrop / ESC, 이동: ◀▶ 키.
   *  마크업 자동 생성 — 처음 호출 시 body 에 .photo-lightbox 노드 1개 mount, 이후 재사용.
   * ============================================================ */
  (function () {
    let el = null;
    let state = { photos: [], index: 0 };
    function build() {
      if (el) return el;
      const wrap = document.createElement('div');
      wrap.innerHTML = `
        <div class="photo-lightbox" data-lb-host role="dialog" aria-modal="true" aria-label="이미지 보기">
          <button class="photo-lightbox__close" type="button" data-lb-close aria-label="닫기">✕</button>
          <button class="photo-lightbox__nav photo-lightbox__nav--prev" type="button" data-lb-prev aria-label="이전">◀</button>
          <button class="photo-lightbox__nav photo-lightbox__nav--next" type="button" data-lb-next aria-label="다음">▶</button>
          <img class="photo-lightbox__img" data-lb-img alt="">
          <div class="photo-lightbox__placeholder" data-lb-placeholder>
            <div class="photo-lightbox__placeholder-icon" data-lb-ph-icon>🖼️</div>
            <div class="photo-lightbox__placeholder-name" data-lb-ph-name></div>
            <div class="photo-lightbox__placeholder-note">등록된 이미지가 없습니다.</div>
          </div>
          <div class="photo-lightbox__caption" data-lb-caption></div>
          <div class="photo-lightbox__counter" data-lb-counter></div>
        </div>`;
      document.body.appendChild(wrap.firstElementChild);
      el = document.querySelector('[data-lb-host]');
      el.addEventListener('click', (e) => {
        if (e.target === el) { close(); return; }
        if (e.target.closest('[data-lb-close]')) { close(); return; }
        if (e.target.closest('[data-lb-prev]'))  { shift(-1); return; }
        if (e.target.closest('[data-lb-next]'))  { shift(1);  return; }
      });
      document.addEventListener('keydown', (e) => {
        if (!el.classList.contains('is-open')) return;
        if (e.key === 'Escape')          close();
        else if (e.key === 'ArrowLeft')  shift(-1);
        else if (e.key === 'ArrowRight') shift(1);
      });
      return el;
    }
    function render() {
      const n = state.photos.length; if (!n) return;
      const i = state.index, p = state.photos[i], hasSrc = !!p.src;
      el.classList.toggle('is-placeholder', !hasSrc);
      if (hasSrc) {
        el.querySelector('[data-lb-img]').src = p.src;
      } else {
        el.querySelector('[data-lb-img]').removeAttribute('src');
        el.querySelector('[data-lb-ph-icon]').textContent = p.icon || '🖼️';
        el.querySelector('[data-lb-ph-name]').textContent = p.caption || '이미지 파일';
      }
      el.querySelector('[data-lb-caption]').textContent = p.caption || '';
      el.querySelector('[data-lb-counter]').textContent = n > 1 ? `${i + 1} / ${n}` : '';
      el.querySelector('[data-lb-prev]').disabled = (i === 0);
      el.querySelector('[data-lb-next]').disabled = (i === n - 1);
      el.querySelectorAll('.photo-lightbox__nav').forEach(b => b.style.display = (n > 1) ? '' : 'none');
    }
    function shift(d) { const n = state.photos.length; const x = state.index + d; if (x < 0 || x >= n) return; state.index = x; render(); }
    function close() { if (el) el.classList.remove('is-open'); }
    function openPhoto(arg1, arg2) {
      build();
      if (typeof arg1 === 'string') {
        state.photos = [{ src: arg1, caption: arg2 || '' }]; state.index = 0;
      } else if (Array.isArray(arg1)) {
        state.photos = arg1.map(p => typeof p === 'string' ? { src: p, caption: '' } : p); state.index = Number(arg2) || 0;
      } else if (arg1 && typeof arg1 === 'object') {
        state.photos = (arg1.photos || []).map(p => typeof p === 'string' ? { src: p, caption: '' } : p);
        state.index = Math.min(Math.max(0, Number(arg1.index) || 0), Math.max(0, state.photos.length - 1));
      } else { return; }
      if (!state.photos.length) { state.photos = [{ src: '', caption: '' }]; state.index = 0; }
      render();
      el.classList.add('is-open');
    }
    function openImage(opts, altMaybe) {
      if (typeof opts === 'string') { openPhoto({ photos: [{ src: opts, caption: altMaybe || '' }], index: 0 }); return; }
      opts = opts || {};
      openPhoto({ photos: [{ src: opts.dataUrl || '', caption: opts.fileName || opts.title || '', icon: opts.icon }], index: 0 });
    }
    // 글로벌 노출 — 도메인 표준 + 하위호환 별칭
    window.App = window.App || {};
    window.App.openPhotoLightbox  = openPhoto;
    window.App.openImageLightbox  = openImage;
    window.App.closePhotoLightbox = close;
    window.App.closeImageLightbox = close;
  })();

})();
