/* =========================================================
 * Charts — 순수 SVG 차트 헬퍼
 *
 * 사용:
 *   element.innerHTML = Charts.donut(segments, opts);
 *   element.innerHTML = Charts.gauge(value, max, opts);
 *   element.innerHTML = Charts.line(data, opts);
 *   element.innerHTML = Charts.bar(data, opts);
 *   element.innerHTML = Charts.sparkline(data, opts);
 *
 * 모든 함수는 <svg>...</svg> 문자열을 반환한다.
 * 외부 라이브러리 의존성 없음.
 * ========================================================= */
(function () {

  /** 부드러운 path (Catmull-Rom 보간 기반 cubic bezier) */
  function smoothPath(points) {
    if (!points.length) return '';
    let d = `M ${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const cur  = points[i];
      const prev = points[i - 1];
      const prv2 = points[i - 2] || prev;
      const next = points[i + 1] || cur;
      const cp1x = prev.x + (cur.x  - prv2.x) / 6;
      const cp1y = prev.y + (cur.y  - prv2.y) / 6;
      const cp2x = cur.x  - (next.x - prev.x) / 6;
      const cp2y = cur.y  - (next.y - prev.y) / 6;
      d += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${cur.x.toFixed(2)},${cur.y.toFixed(2)}`;
    }
    return d;
  }

  /* ===================== Donut ===================== */
  /**
   * segments: [{ value, color }, ...]
   * opts: { size, thickness, center: 'label or HTML', track: '#color' }
   */
  function donut(segments, opts = {}) {
    const size = opts.size || 120;
    const w    = opts.thickness || 14;
    const r    = (size - w) / 2;
    const cx   = size / 2;
    const cy   = size / 2;
    const C    = 2 * Math.PI * r;
    const track = opts.track || '#E5E7EB';
    const total = segments.reduce((s, x) => s + x.value, 0) || 1;
    let rot = -90;
    const arcs = segments.map(seg => {
      const f = seg.value / total;
      const dash = C * f;
      const html = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
        stroke="${seg.color}" stroke-width="${w}"
        stroke-dasharray="${dash.toFixed(2)} ${(C - dash).toFixed(2)}"
        transform="rotate(${rot} ${cx} ${cy})" />`;
      rot += f * 360;
      return html;
    }).join('');
    const center = opts.center
      ? `<foreignObject x="0" y="0" width="${size}" height="${size}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:inherit;text-align:center;">${opts.center}</div></foreignObject>`
      : '';
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="cv-donut">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${track}" stroke-width="${w}"/>
      ${arcs}
      ${center}
    </svg>`;
  }

  /* ===================== Gauge (half donut) ===================== */
  /**
   * value 0..max → 0..180° (좌→상→우)
   * opts: { size, thickness, color, track, ticks }
   */
  function gauge(value, max, opts = {}) {
    const size = opts.size || 160;
    const w    = opts.thickness || 14;
    const r    = (size - w) / 2 - 4;
    const cx   = size / 2;
    const cy   = size / 2 + r / 4;
    const v    = Math.max(0, Math.min(value / max, 1));
    const ang  = Math.PI * (1 - v);            // 좌→우 (라디안)
    const sx   = cx - r, sy = cy;
    const ex   = cx + r * Math.cos(ang);
    const ey   = cy - r * Math.sin(ang);
    const exF  = cx + r;                       // full end
    const track = opts.track || '#E5E7EB';
    const color = opts.color || '#16A34A';

    const tracePath = `M ${sx},${sy} A ${r} ${r} 0 0 1 ${exF} ${sy}`;
    const valPath   = v > 0 ? `M ${sx},${sy} A ${r} ${r} 0 0 1 ${ex.toFixed(2)} ${ey.toFixed(2)}` : '';

    // 우측 tick marks
    let ticks = '';
    if (opts.ticks !== false) {
      const N = 14;
      for (let i = 1; i <= N; i++) {
        const a = (Math.PI / N) * i;
        const inner = r - 2, outer = r + 8;
        const x1 = cx + inner * Math.cos(a - Math.PI), y1 = cy + inner * Math.sin(a - Math.PI);
        const x2 = cx + outer * Math.cos(a - Math.PI), y2 = cy + outer * Math.sin(a - Math.PI);
        // 우측 절반만 (i > N/2)
        if (i > N / 2) {
          ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#9CA3AF" stroke-width="1" opacity="0.5"/>`;
        }
      }
    }
    return `<svg width="${size}" height="${size * 0.7}" viewBox="0 0 ${size} ${size * 0.7}" class="cv-gauge">
      <path d="${tracePath}" stroke="${track}" stroke-width="${w}" stroke-linecap="round" fill="none"/>
      ${valPath ? `<path d="${valPath}" stroke="${color}" stroke-width="${w}" stroke-linecap="round" fill="none"/>` : ''}
      ${ticks}
    </svg>`;
  }

  /* ===================== Line Chart ===================== */
  /**
   * data: [{ x: 'label', y: number }, ...]
   * opts: { width, height, color, fill, grid, labels, smooth, tooltip, paddingX, paddingY, yTicks }
   */
  function line(data, opts = {}) {
    const W = opts.width  || 600;
    const H = opts.height || 220;
    const padL = opts.paddingX != null ? opts.paddingX : 40;
    const padR = 20;
    const padT = 14;
    const padB = opts.paddingY != null ? opts.paddingY : 32;
    const color = opts.color || '#22C55E';
    const fill  = opts.fill !== false;
    const grid  = opts.grid !== false;
    const labels = opts.labels !== false;
    const smooth = opts.smooth !== false;
    const yTicks = opts.yTicks || 5;
    const tooltip = opts.tooltip; // { x: 'Apr 12', y: 18000, label: '$18K', sublabel: 'Sales' }

    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    const minY = Math.min(...data.map(d => d.y));
    const maxY = Math.max(...data.map(d => d.y));
    const rangeY = (maxY - minY) || 1;
    const yScale = y => padT + innerH - ((y - minY) / rangeY) * innerH;
    const xScale = i => padL + (i / Math.max(1, data.length - 1)) * innerW;

    const points = data.map((d, i) => ({ x: xScale(i), y: yScale(d.y) }));
    const path = smooth ? smoothPath(points) : points.map((p, i) => `${i ? 'L' : 'M'} ${p.x},${p.y}`).join(' ');

    // Area fill
    const areaPath = fill
      ? `${path} L ${points[points.length - 1].x},${padT + innerH} L ${points[0].x},${padT + innerH} Z`
      : '';

    // Gradient ID (unique-ish)
    const gid = 'lg' + Math.random().toString(36).slice(2, 8);

    // Gridlines + Y labels
    let gridHTML = '';
    if (grid) {
      for (let i = 0; i <= yTicks; i++) {
        const y = padT + (innerH / yTicks) * i;
        const v = maxY - (rangeY / yTicks) * i;
        gridHTML += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#E5E7EB" stroke-width="1" stroke-dasharray="3 4"/>`;
        if (labels) gridHTML += `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="#9CA3AF">${opts.yLabel ? opts.yLabel(v) : v.toFixed(0)}</text>`;
      }
    }

    // X labels
    let xLabels = '';
    if (labels) {
      const step = Math.max(1, Math.ceil(data.length / 6));
      data.forEach((d, i) => {
        if (i % step !== 0 && i !== data.length - 1) return;
        const x = xScale(i);
        xLabels += `<text x="${x}" y="${H - 10}" text-anchor="middle" font-size="10" fill="#9CA3AF">${d.x}</text>`;
      });
    }

    // Tooltip
    let tipHTML = '';
    if (tooltip) {
      const idx = data.findIndex(d => d.x === tooltip.x);
      if (idx >= 0) {
        const p = points[idx];
        tipHTML = `
          <line x1="${p.x}" y1="${padT}" x2="${p.x}" y2="${padT + innerH + 12}" stroke="${color}" stroke-width="1" stroke-dasharray="3 4" opacity="0.6"/>
          <circle cx="${p.x}" cy="${p.y}" r="5" fill="${color}" stroke="#fff" stroke-width="2"/>
          <g transform="translate(${p.x + 8}, ${p.y - 36})">
            <rect x="0" y="0" width="110" height="48" rx="8" fill="#fff" stroke="#E5E7EB"/>
            <text x="12" y="18" font-size="11" font-weight="600" fill="#1F2937">${tooltip.x}</text>
            <circle cx="14" cy="34" r="4" fill="${color}"/>
            <text x="24" y="38" font-size="11" fill="#6B7280">${tooltip.sublabel || 'Sales'}:</text>
            <text x="${tooltip.sublabel ? 24 + (tooltip.sublabel.length * 6) + 8 : 60}" y="38" font-size="11" font-weight="700" fill="#1F2937">${tooltip.label || tooltip.y}</text>
          </g>
          <polygon points="${p.x - 5},${H - padB + 2} ${p.x + 5},${H - padB + 2} ${p.x},${H - padB - 4}" fill="#1F2937"/>
        `;
      }
    }

    return `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" class="cv-line" preserveAspectRatio="none">
      <defs>
        <linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"  stop-color="${color}" stop-opacity="0.32"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${gridHTML}
      ${areaPath ? `<path d="${areaPath}" fill="url(#${gid})"/>` : ''}
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${xLabels}
      ${tipHTML}
    </svg>`;
  }

  /* ===================== Bar Chart ===================== */
  /**
   * data: [{x, y}]
   * opts: { width, height, color, gap, labels, paddingX, paddingY }
   */
  function bar(data, opts = {}) {
    const W = opts.width  || 280;
    const H = opts.height || 100;
    const padL = opts.paddingX != null ? opts.paddingX : 8;
    const padR = 8;
    const padT = 8;
    const padB = opts.labels ? 18 : 8;
    const color = opts.color || '#3B82F6';
    const gap = opts.gap != null ? opts.gap : 6;
    const radius = opts.radius != null ? opts.radius : 4;

    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const maxY = Math.max(...data.map(d => d.y));
    const barW = (innerW - gap * (data.length - 1)) / data.length;

    const bars = data.map((d, i) => {
      const x = padL + i * (barW + gap);
      const h = (d.y / maxY) * innerH;
      const y = padT + innerH - h;
      return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="${radius}" fill="${color}"/>`;
    }).join('');

    let xLabels = '';
    if (opts.labels) {
      data.forEach((d, i) => {
        const x = padL + i * (barW + gap) + barW / 2;
        xLabels += `<text x="${x}" y="${H - 4}" text-anchor="middle" font-size="9" fill="#9CA3AF">${d.x}</text>`;
      });
    }

    return `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" class="cv-bar" preserveAspectRatio="none">
      ${bars}${xLabels}
    </svg>`;
  }

  /* ===================== Multi-series Line ===================== */
  /**
   * series: [{ name, color, data: [{x,y}], dashed?, width? }, ...]  — 모든 시리즈가 x축·y스케일 공유
   * opts: { width, height, grid, labels, yTicks, yLabel, smooth, dots, minY, maxY, baseZero, paddingX, paddingY }
   * (범례는 호출 측에서 렌더 — 색상 제어 유연성)
   */
  function multiLine(series, opts = {}) {
    const W = opts.width || 600, H = opts.height || 240;
    const padL = opts.paddingX != null ? opts.paddingX : 48, padR = 16, padT = 14;
    const padB = opts.paddingY != null ? opts.paddingY : 28;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const grid = opts.grid !== false, labels = opts.labels !== false;
    const yTicks = opts.yTicks || 4, smooth = opts.smooth !== false;
    const xs = (series[0] && series[0].data) || [];
    const allY = series.flatMap(s => s.data.map(d => d.y)).filter(v => v != null);
    let minY = opts.minY != null ? opts.minY : Math.min(...allY);
    let maxY = opts.maxY != null ? opts.maxY : Math.max(...allY);
    if (opts.baseZero) minY = Math.min(0, minY);
    const rangeY = (maxY - minY) || 1;
    const yScale = y => padT + innerH - ((y - minY) / rangeY) * innerH;
    const xScale = i => padL + (i / Math.max(1, xs.length - 1)) * innerW;
    let gridHTML = '';
    if (grid) {
      for (let i = 0; i <= yTicks; i++) {
        const y = padT + (innerH / yTicks) * i;
        const v = maxY - (rangeY / yTicks) * i;
        gridHTML += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#E5E7EB" stroke-width="1" stroke-dasharray="3 4"/>`;
        if (labels) gridHTML += `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="#9CA3AF">${opts.yLabel ? opts.yLabel(v) : v.toFixed(0)}</text>`;
      }
    }
    let xLabels = '';
    if (labels) {
      const step = Math.max(1, Math.ceil(xs.length / 8));
      xs.forEach((d, i) => {
        if (i % step !== 0 && i !== xs.length - 1) return;
        xLabels += `<text x="${xScale(i)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#9CA3AF">${d.x}</text>`;
      });
    }
    const gid = 'ml' + Math.random().toString(36).slice(2, 8);
    let defs = '', fills = '';
    const paths = series.map((s, si) => {
      const pts = s.data.map((d, i) => d.y == null ? null : ({ x: xScale(i), y: yScale(d.y) })).filter(Boolean);
      if (!pts.length) return '';
      const path = smooth ? smoothPath(pts) : pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x},${p.y}`).join(' ');
      // 영역 채움 — opts.fill 이고 첫(비점선) 시리즈일 때만
      if (opts.fill && si === 0 && !s.dashed) {
        defs += `<linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${s.color}" stop-opacity="0.28"/><stop offset="100%" stop-color="${s.color}" stop-opacity="0"/></linearGradient>`;
        fills += `<path d="${path} L ${pts[pts.length - 1].x},${padT + innerH} L ${pts[0].x},${padT + innerH} Z" fill="url(#${gid})"/>`;
      }
      const last = pts[pts.length - 1];
      const dot = opts.dots !== false ? `<circle cx="${last.x}" cy="${last.y}" r="3.5" fill="${s.color}" stroke="#fff" stroke-width="1.5"/>` : '';
      return `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2.5}" stroke-linecap="round" stroke-linejoin="round"${s.dashed ? ' stroke-dasharray="5 4" opacity="0.8"' : ''}/>${dot}`;
    }).join('');
    return `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" class="cv-mline" preserveAspectRatio="none">${defs ? `<defs>${defs}</defs>` : ''}${gridHTML}${fills}${paths}${xLabels}</svg>`;
  }

  /* ===================== Grouped Bar ===================== */
  /**
   * data: [{ x: label, values: [v0, v1, ...] }, ...]  — 카테고리별 묶음 막대
   * opts: { width, height, colors:[..], grid, labels, yTicks, yLabel, maxY, groupGap }
   */
  function groupBar(data, opts = {}) {
    const W = opts.width || 600, H = opts.height || 240;
    const padL = opts.paddingX != null ? opts.paddingX : 48, padR = 16, padT = 14;
    const padB = opts.labels !== false ? 28 : 10;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const colors = opts.colors || ['#00347D', '#9CA3AF'];
    const grid = opts.grid !== false, yTicks = opts.yTicks || 4;
    const nSeries = (data[0] && data[0].values.length) || 1;
    const maxY = opts.maxY != null ? opts.maxY : Math.max(...data.flatMap(d => d.values));
    const rangeY = maxY || 1;
    const groupGap = opts.groupGap != null ? opts.groupGap : 14, barGap = 2;
    const groupW = (innerW - groupGap * (data.length - 1)) / data.length;
    const barW = (groupW - barGap * (nSeries - 1)) / nSeries;
    const yScale = v => (v / rangeY) * innerH;
    let gridHTML = '';
    if (grid) {
      for (let i = 0; i <= yTicks; i++) {
        const y = padT + (innerH / yTicks) * i;
        const v = maxY - (rangeY / yTicks) * i;
        gridHTML += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#E5E7EB" stroke-width="1" stroke-dasharray="3 4"/>`;
        if (opts.labels !== false) gridHTML += `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="#9CA3AF">${opts.yLabel ? opts.yLabel(v) : v.toFixed(0)}</text>`;
      }
    }
    let bars = '', xLabels = '';
    data.forEach((g, gi) => {
      const gx = padL + gi * (groupW + groupGap);
      g.values.forEach((v, si) => {
        const h = yScale(v), x = gx + si * (barW + barGap), y = padT + innerH - h;
        bars += `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3" fill="${colors[si % colors.length]}"/>`;
      });
      if (opts.labels !== false) xLabels += `<text x="${gx + groupW / 2}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#9CA3AF">${g.x}</text>`;
    });
    return `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" class="cv-gbar" preserveAspectRatio="none">${gridHTML}${bars}${xLabels}</svg>`;
  }

  /* ===================== Sparkline ===================== */
  function sparkline(values, opts = {}) {
    const W = opts.width || 140;
    const H = opts.height || 36;
    const color = opts.color || '#22C55E';
    const data = values.map((y, i) => ({ x: i, y }));
    const minY = Math.min(...values), maxY = Math.max(...values);
    const rangeY = (maxY - minY) || 1;
    const points = data.map((d, i) => ({
      x: (i / Math.max(1, data.length - 1)) * (W - 4) + 2,
      y: H - 2 - ((d.y - minY) / rangeY) * (H - 4),
    }));
    const path = smoothPath(points);
    const gid = 'sl' + Math.random().toString(36).slice(2, 8);
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="cv-spark">
      <defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient></defs>
      <path d="${path} L ${points[points.length-1].x},${H} L ${points[0].x},${H} Z" fill="url(#${gid})"/>
      <path d="${path}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>
    </svg>`;
  }

  /* ===================== Interactive Line ===================== */
  /**
   * Charts.attachLineHover(container, data, opts)
   *   - container 안의 <svg.cv-line> 을 찾아 호버 시 가이드 라인 + 값 툴팁을 표시
   *   - line() 으로 렌더링한 직후 호출
   *
   * Charts.renderLine(container, data, opts)
   *   - line() 렌더 + 호버 자동 부착 (단축 헬퍼)
   */
  function attachLineHover(container, data, opts = {}) {
    const svg = container.querySelector('svg.cv-line');
    if (!svg) return;

    const W = opts.width  || 600;
    const H = opts.height || 220;
    const padL = opts.paddingX != null ? opts.paddingX : 40;
    const padR = 20;
    const padT = 14;
    const padB = opts.paddingY != null ? opts.paddingY : 32;
    const color = opts.color || '#22C55E';
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    const minY = Math.min(...data.map(d => d.y));
    const maxY = Math.max(...data.map(d => d.y));
    const rangeY = (maxY - minY) || 1;
    const yScale = y => padT + innerH - ((y - minY) / rangeY) * innerH;
    const xScale = i => padL + (i / Math.max(1, data.length - 1)) * innerW;
    const points = data.map((d, i) => ({ x: xScale(i), y: yScale(d.y), data: d }));

    const NS = 'http://www.w3.org/2000/svg';
    function el(tag, attrs) {
      const e = document.createElementNS(NS, tag);
      Object.keys(attrs || {}).forEach(k => e.setAttribute(k, attrs[k]));
      return e;
    }

    // Hover group (initially hidden)
    const hover = el('g', { class: 'cv-line__hover', 'pointer-events': 'none' });
    hover.style.opacity = '0';
    hover.style.transition = 'opacity 120ms ease';

    const guide = el('line', {
      y1: padT, y2: padT + innerH,
      stroke: color, 'stroke-width': '1',
      'stroke-dasharray': '3 4', opacity: '0.55',
    });
    const dot = el('circle', { r: '5', fill: color, stroke: '#fff', 'stroke-width': '2' });
    const tipG = el('g');

    const tipBg = el('rect', {
      width: '110', height: '46', rx: '8',
      fill: '#fff', stroke: '#E5E7EB', 'stroke-width': '1',
    });
    tipBg.style.filter = 'drop-shadow(0 4px 12px rgba(16,24,40,0.10))';
    const tipX  = el('text', { x: '12', y: '18', 'font-size': '11', 'font-weight': '600', fill: '#1F2937' });
    const tipD  = el('circle', { cx: '14', cy: '34', r: '4', fill: color });
    const tipL  = el('text', { x: '24', y: '38', 'font-size': '11', fill: '#6B7280' });
    tipL.textContent = (opts.tooltipLabel || 'Sales') + ':';
    const tipV  = el('text', { y: '38', 'font-size': '11', 'font-weight': '700', fill: '#1F2937' });

    tipG.append(tipBg, tipX, tipD, tipL, tipV);
    hover.append(guide, dot, tipG);
    svg.appendChild(hover);

    // Cursor area
    const area = el('rect', {
      x: padL, y: padT,
      width: innerW, height: innerH,
      fill: 'transparent', class: 'cv-line__hover-area',
    });
    area.style.cursor = 'crosshair';
    svg.appendChild(area);

    // Show/hide handlers
    function show(clientX) {
      const rect = svg.getBoundingClientRect();
      const svgX = ((clientX - rect.left) / rect.width) * W;

      // 가장 가까운 데이터 포인트
      let nearest = points[0], minDist = Infinity;
      points.forEach(p => {
        const d = Math.abs(p.x - svgX);
        if (d < minDist) { minDist = d; nearest = p; }
      });

      guide.setAttribute('x1', nearest.x);
      guide.setAttribute('x2', nearest.x);
      dot.setAttribute('cx', nearest.x);
      dot.setAttribute('cy', nearest.y);

      // 툴팁 위치: 우측 우선, 끝에 가까우면 좌측 반전
      const tipW = 110, tipH = 46;
      let tx = nearest.x + 12;
      if (tx + tipW > W - 4) tx = nearest.x - tipW - 12;
      let ty = nearest.y - tipH - 8;
      if (ty < padT) ty = nearest.y + 12;
      tipG.setAttribute('transform', `translate(${tx}, ${ty})`);

      tipX.textContent = nearest.data.x;
      tipV.textContent = opts.yLabel ? opts.yLabel(nearest.data.y) : String(Math.round(nearest.data.y));

      // 라벨 길이에 맞춰 값 X 위치 재계산
      try {
        const lblLen = tipL.getComputedTextLength() || 36;
        tipV.setAttribute('x', 28 + lblLen);
      } catch (_) { tipV.setAttribute('x', 70); }

      hover.style.opacity = '1';
    }
    function hide() { hover.style.opacity = '0'; }

    area.addEventListener('mousemove', e => show(e.clientX));
    area.addEventListener('mouseleave', hide);

    // Touch 지원
    area.addEventListener('touchmove', e => {
      if (e.touches.length) show(e.touches[0].clientX);
    }, { passive: true });
    area.addEventListener('touchend', hide);

    return { destroy() { area.remove(); hover.remove(); } };
  }

  function renderLine(container, data, opts) {
    if (!container) return;
    container.innerHTML = line(data, opts);
    if (opts && opts.hover === false) return null;
    return attachLineHover(container, data, opts);
  }

  /* ===================== HTML 오버레이 툴팁 (다중 시리즈 공용) ===================== */
  function _ensureTip(container) {
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    let tip = container.querySelector(':scope > .cv-htip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'cv-htip';
      tip.style.cssText = 'position:absolute; z-index:6; pointer-events:none; opacity:0; transition:opacity 120ms ease; background:#fff; border:1px solid #E5E7EB; border-radius:8px; box-shadow:0 6px 18px rgba(16,24,40,.12); padding:9px 11px; font-size:11px; min-width:104px; white-space:nowrap;';
      container.appendChild(tip);
    }
    return tip;
  }
  function _tipHTML(title, rows) {
    return `<div style="font-weight:700; color:#1F2937; margin-bottom:5px;">${title}</div>` +
      rows.map(r => `<div style="display:flex; align-items:center; gap:7px; line-height:1.6;">
        <i style="width:8px;height:8px;border-radius:2px;background:${r.color};display:inline-block;flex:0 0 auto;"></i>
        <span style="color:#6B7280;">${r.name}</span>
        <strong style="color:#1F2937; margin-left:auto; padding-left:10px;">${r.value}</strong></div>`).join('');
  }
  function _placeTip(tip, container, anchorXpx, anchorYpx) {
    const cw = container.clientWidth, ch = container.clientHeight;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = anchorXpx - tw / 2;
    left = Math.max(2, Math.min(left, cw - tw - 2));
    let top = anchorYpx - th - 12;
    if (top < 2) top = anchorYpx + 14;
    if (top + th > ch) top = Math.max(2, ch - th - 2);
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }

  /* 다중 시리즈 라인 호버 — 시리즈 1개도 지원 (단일 라인 호버 대체 가능) */
  function attachMultiLineHover(container, series, opts = {}) {
    const svg = container.querySelector('svg.cv-mline'); if (!svg) return;
    const W = opts.width || 600, H = opts.height || 240;
    const padL = opts.paddingX != null ? opts.paddingX : 48, padR = 16, padT = 14;
    const padB = opts.paddingY != null ? opts.paddingY : 28;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const xs = (series[0] && series[0].data) || [];
    const allY = series.flatMap(s => s.data.map(d => d.y)).filter(v => v != null);
    let minY = opts.minY != null ? opts.minY : Math.min(...allY);
    let maxY = opts.maxY != null ? opts.maxY : Math.max(...allY);
    if (opts.baseZero) minY = Math.min(0, minY);
    const rangeY = (maxY - minY) || 1;
    const yScale = y => padT + innerH - ((y - minY) / rangeY) * innerH;
    const xScale = i => padL + (i / Math.max(1, xs.length - 1)) * innerW;
    const NS = 'http://www.w3.org/2000/svg';
    const el = (t, a) => { const e = document.createElementNS(NS, t); Object.keys(a || {}).forEach(k => e.setAttribute(k, a[k])); return e; };
    const hover = el('g', { 'pointer-events': 'none' }); hover.style.opacity = '0'; hover.style.transition = 'opacity 120ms ease';
    const guide = el('line', { y1: padT, y2: padT + innerH, stroke: '#94A3B8', 'stroke-width': '1', 'stroke-dasharray': '3 4', opacity: '0.75' });
    hover.appendChild(guide);
    const dots = series.map(s => { const c = el('circle', { r: '4.5', fill: s.color, stroke: '#fff', 'stroke-width': '2' }); hover.appendChild(c); return c; });
    svg.appendChild(hover);
    const area = el('rect', { x: padL, y: padT, width: innerW, height: innerH, fill: 'transparent' }); area.style.cursor = 'crosshair'; svg.appendChild(area);
    const tip = _ensureTip(container);
    function show(clientX) {
      const rect = svg.getBoundingClientRect();
      const svgX = ((clientX - rect.left) / rect.width) * W;
      let idx = 0, md = Infinity;
      xs.forEach((d, i) => { const dist = Math.abs(xScale(i) - svgX); if (dist < md) { md = dist; idx = i; } });
      // 모든 시리즈가 null 인 인덱스면 값 있는 가장 가까운 인덱스로 스냅
      const hasVal = (i) => series.some(s => s.data[i] && s.data[i].y != null);
      if (!hasVal(idx)) { for (let off = 1; off < xs.length; off++) { if (hasVal(idx - off)) { idx -= off; break; } if (hasVal(idx + off)) { idx += off; break; } } }
      const gx = xScale(idx);
      guide.setAttribute('x1', gx); guide.setAttribute('x2', gx);
      let topY = padT + innerH;
      const rows = [];
      series.forEach((s, si) => {
        const pt = s.data[idx];
        const v = pt ? pt.y : null;
        if (v == null) { dots[si].style.display = 'none'; return; }
        const y = yScale(v); topY = Math.min(topY, y);
        dots[si].style.display = ''; dots[si].setAttribute('cx', gx); dots[si].setAttribute('cy', y);
        // s.fmt(point) 가 있으면 전체 데이터 포인트로 값 구성(예: 요율 + 금액 동반 표시)
        const value = s.fmt ? s.fmt(pt) : (opts.yLabel ? opts.yLabel(v) : String(Math.round(v)));
        rows.push({ color: s.color, name: s.name, value });
      });
      hover.style.opacity = '1';
      tip.innerHTML = _tipHTML(xs[idx].x, rows);
      tip.style.opacity = '1';
      const sr = svg.getBoundingClientRect(), cr = container.getBoundingClientRect();
      _placeTip(tip, container, (sr.left - cr.left) + (gx / W) * sr.width, (sr.top - cr.top) + (topY / H) * sr.height);
    }
    function hide() { hover.style.opacity = '0'; tip.style.opacity = '0'; }
    area.addEventListener('mousemove', e => show(e.clientX));
    area.addEventListener('mouseleave', hide);
    area.addEventListener('touchmove', e => { if (e.touches.length) show(e.touches[0].clientX); }, { passive: true });
    area.addEventListener('touchend', hide);
    return { destroy() { hover.remove(); area.remove(); tip.remove(); } };
  }

  /* 그룹 막대 호버 — 그룹 하이라이트 + 시리즈별 값 툴팁 */
  function attachGroupBarHover(container, data, opts = {}) {
    const svg = container.querySelector('svg.cv-gbar'); if (!svg) return;
    const W = opts.width || 600, H = opts.height || 240;
    const padL = opts.paddingX != null ? opts.paddingX : 48, padR = 16, padT = 14;
    const padB = opts.labels !== false ? 28 : 10;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const groupGap = opts.groupGap != null ? opts.groupGap : 14;
    const groupW = (innerW - groupGap * (data.length - 1)) / data.length;
    const names = opts.series || [], colors = opts.colors || ['#00347D', '#9CA3AF'];
    const gx = gi => padL + gi * (groupW + groupGap);
    const NS = 'http://www.w3.org/2000/svg';
    const el = (t, a) => { const e = document.createElementNS(NS, t); Object.keys(a || {}).forEach(k => e.setAttribute(k, a[k])); return e; };
    const hi = el('rect', { y: padT, height: innerH, fill: '#0F172A', opacity: '0', rx: '4' }); hi.style.transition = 'opacity 120ms ease';
    svg.insertBefore(hi, svg.firstChild);
    const area = el('rect', { x: padL, y: padT, width: innerW, height: innerH, fill: 'transparent' }); area.style.cursor = 'crosshair'; svg.appendChild(area);
    const tip = _ensureTip(container);
    function show(clientX) {
      const rect = svg.getBoundingClientRect();
      const svgX = ((clientX - rect.left) / rect.width) * W;
      let idx = 0, md = Infinity;
      data.forEach((g, i) => { const c = gx(i) + groupW / 2; const dist = Math.abs(c - svgX); if (dist < md) { md = dist; idx = i; } });
      hi.setAttribute('x', gx(idx) - 3); hi.setAttribute('width', groupW + 6); hi.setAttribute('opacity', '0.06');
      const rows = data[idx].values.map((v, si) => ({ color: colors[si % colors.length], name: names[si] || ('값' + (si + 1)), value: opts.yLabel ? opts.yLabel(v) : String(Math.round(v)) }));
      tip.innerHTML = _tipHTML(data[idx].x, rows);
      tip.style.opacity = '1';
      const sr = svg.getBoundingClientRect(), cr = container.getBoundingClientRect();
      _placeTip(tip, container, (sr.left - cr.left) + ((gx(idx) + groupW / 2) / W) * sr.width, (sr.top - cr.top) + (padT / H) * sr.height + 8);
    }
    function hide() { hi.setAttribute('opacity', '0'); tip.style.opacity = '0'; }
    area.addEventListener('mousemove', e => show(e.clientX));
    area.addEventListener('mouseleave', hide);
    area.addEventListener('touchmove', e => { if (e.touches.length) show(e.touches[0].clientX); }, { passive: true });
    area.addEventListener('touchend', hide);
    return { destroy() { hi.remove(); area.remove(); tip.remove(); } };
  }

  window.Charts = { donut, gauge, line, bar, multiLine, groupBar, sparkline, attachLineHover, attachMultiLineHover, attachGroupBarHover, renderLine, _smoothPath: smoothPath };
})();
