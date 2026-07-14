/* =========================================================
 * HR/ATT Shims — erp-hr 모듈 이식 시 그룹웨어 베이스(pages.js)에
 * 존재하지 않던 공용 헬퍼만 보충한다.
 *
 *  - App.csvDownload(fileName, rows, opts)  : CSV 생성 후 App.downloadFile 위임
 *  - App.sweetAlert({ icon, title, message, confirmText, onClose })
 *
 * 그 외(App.flashToast / App.openEmpPicker / App.confirmDelete /
 * App.downloadFile / App.openSystemApprovalModal)는 베이스 pages.js 에
 * 이미 정의되어 있어 보충하지 않는다.
 * ========================================================= */
(function () {
  const App = (window.App = window.App || {});

  /* ---------- App.csvDownload (erp-hr pages.js 이식) ---------- */
  if (typeof App.csvDownload !== 'function') {
    App.csvDownload = function (fileName, rows, opts) {
      opts = opts || {};
      try {
        const cell = (v) => {
          const s = (v === null || v === undefined) ? '' : String(v);
          return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const body = (rows || [])
          .map(r => (Array.isArray(r) ? r : [r]).map(cell).join(','))
          .join('\r\n');
        const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8;' });
        return App.downloadFile(fileName, { blob, context: opts.context });
      } catch (err) {
        if (typeof App.flashToast === 'function') App.flashToast('다운로드에 실패했습니다.', 'danger');
        return false;
      }
    };
  }

  /* ---------- App.xlsxDownload — 다중 시트 엑셀 다운로드 (외부 라이브러리 무의존) ----------
   *  SpreadsheetML 2003 (Excel XML) 포맷으로 생성 → Excel 이 시트별로 그대로 연다.
   *  CSV 로는 불가능한 (1) 시트 분할 (2) 표 상단 제목행 을 지원한다.
   *
   *  App.xlsxDownload(fileName, sheets, opts)
   *    sheets : [{ name:'시트명', rows:[ row, ... ] }]
   *    row    : 셀 배열 [v, v, …]  또는  { style:'title'|'hdr', cells:[v,…] }
   *    cell   : 문자열/숫자  또는  { v, style }
   *    opts   : { context } (다운로드 디버그 컨텍스트)
   */
  if (typeof App.xlsxDownload !== 'function') {
    App.xlsxDownload = function (fileName, sheets, opts) {
      opts = opts || {};
      try {
        const escXml = (s) => String(s == null ? '' : s)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ');
        /* 시트명 정리 — Excel 제약: 31자 이하, \ / ? * [ ] : 금지, 공백 시 'Sheet' */
        const seenNames = {};
        const sheetName = (nm) => {
          let n = String(nm || 'Sheet').replace(/[\\/?*\[\]:]/g, ' ').slice(0, 31).trim() || 'Sheet';
          if (seenNames[n]) { const b = n.slice(0, 28); let i = 2; while (seenNames[b + '_' + i]) i++; n = b + '_' + i; }
          seenNames[n] = true;
          return n;
        };
        const cellXml = (v, style) => {
          let type, out;
          if (typeof v === 'number' && isFinite(v)) { type = 'Number'; out = String(v); }
          else { type = 'String'; out = escXml(v); }
          const st = style ? ` ss:StyleID="${style}"` : '';
          return `<Cell${st}><Data ss:Type="${type}">${out}</Data></Cell>`;
        };
        const rowXml = (row) => {
          let cells, rowStyle;
          if (row && !Array.isArray(row) && row.cells) { cells = row.cells; rowStyle = row.style; }
          else { cells = row || []; }
          const inner = cells.map(c => (c && typeof c === 'object' && 'v' in c)
            ? cellXml(c.v, c.style || rowStyle) : cellXml(c, rowStyle)).join('');
          return `<Row>${inner}</Row>`;
        };
        const wsXml = (sh) => {
          const rows = (sh.rows || []).map(rowXml).join('');
          return `<Worksheet ss:Name="${escXml(sheetName(sh.name))}"><Table>${rows}</Table></Worksheet>`;
        };
        const xml =
          '<?xml version="1.0" encoding="UTF-8"?>\r\n' +
          '<?mso-application progid="Excel.Sheet"?>\r\n' +
          '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"' +
          ' xmlns:o="urn:schemas-microsoft-com:office:office"' +
          ' xmlns:x="urn:schemas-microsoft-com:office:excel"' +
          ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
          '<Styles>' +
          '<Style ss:ID="title"><Font ss:Bold="1" ss:Size="13"/></Style>' +
          '<Style ss:ID="hdr"><Font ss:Bold="1"/><Interior ss:Color="#EFEFEF" ss:Pattern="Solid"/></Style>' +
          '</Styles>' +
          (sheets || []).map(wsXml).join('') +
          '</Workbook>';
        const blob = new Blob(['﻿' + xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
        return App.downloadFile(fileName, { blob, context: opts.context });
      } catch (err) {
        if (typeof App.flashToast === 'function') App.flashToast('다운로드에 실패했습니다.', 'danger');
        return false;
      }
    };
  }

  /* ---------- App.sweetAlert (erp-hr pages.js 이식) ---------- */
  if (typeof App.sweetAlert !== 'function') {
    const SWEET_ICONS = {
      success:  { cls: 'sweet-icon--success',  glyph: '✓' },
      danger:   { cls: 'sweet-icon--danger',   glyph: '✕' },
      warning:  { cls: 'sweet-icon--warning',  glyph: '!' },
      info:     { cls: 'sweet-icon--info',     glyph: 'i' },
      question: { cls: 'sweet-icon--question', glyph: '?' },
    };
    let _sweetAlertEl = null;
    function _buildSweetAlert() {
      if (_sweetAlertEl) return _sweetAlertEl;
      const wrap = document.createElement('div');
      wrap.innerHTML = `
        <div class="modal-backdrop" data-sweet-alert-host style="z-index:1100;">
          <div class="modal" style="max-width:400px;">
            <div class="modal__body">
              <div class="sweet-icon" data-sa-icon>i</div>
              <div class="sweet-body">
                <div class="sweet-body__title" data-sa-title></div>
                <div class="sweet-body__text"  data-sa-text></div>
              </div>
            </div>
            <div class="modal__footer">
              <button class="btn btn--primary" type="button" data-sa-ok>확인</button>
            </div>
          </div>
        </div>`;
      while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
      _sweetAlertEl = document.querySelector('[data-sweet-alert-host]');
      return _sweetAlertEl;
    }

    App.sweetAlert = function (opts) {
      opts = opts || {};
      const bd = _buildSweetAlert();
      const cfg = SWEET_ICONS[opts.icon] || SWEET_ICONS.info;
      const iconEl = bd.querySelector('[data-sa-icon]');
      iconEl.className = 'sweet-icon ' + cfg.cls;
      iconEl.textContent = cfg.glyph;
      bd.querySelector('[data-sa-title]').textContent = opts.title || '';
      bd.querySelector('[data-sa-text]').textContent  = opts.message || '';
      bd.querySelector('[data-sa-ok]').textContent    = opts.confirmText || '확인';

      function close() {
        bd.classList.remove('is-open');
        bd.removeEventListener('click', onClick);
        document.removeEventListener('keydown', onKey);
        if (typeof opts.onClose === 'function') opts.onClose();
      }
      function onClick(e) {
        if (e.target === bd) { close(); return; }
        if (e.target.closest('[data-sa-ok]')) { close(); return; }
      }
      function onKey(e) { if (e.key === 'Escape') close(); }
      bd.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey);
      bd.classList.add('is-open');
    };
  }
})();

/* =========================================================
 * [data-dd] 더보기(케밥) 드롭다운 전역 토글 — erp-hr 화면(평가 회차·평가유형·
 * 급여정산 등)의 행 더보기 메뉴가 메인앱에서 동작하도록 보충한다.
 * 원래 토글 로직은 ui-kit.js(데모 전용, 메인앱 미로드)에만 있어 누락됐었다.
 * 행이 동적 렌더되므로 document 위임 방식으로 처리한다.
 * ========================================================= */
(function () {
  function closeAll(except) {
    document.querySelectorAll('[data-dd].is-open').forEach(d => { if (d !== except) d.classList.remove('is-open'); });
  }
  document.addEventListener('click', (e) => {
    /* 케밥 버튼 클릭 — 해당 드롭다운만 토글 */
    const kebab = e.target.closest('[data-dd] > button, [data-dd] .btn--kebab');
    if (kebab) {
      const dd = kebab.closest('[data-dd]');
      const willOpen = !dd.classList.contains('is-open');
      closeAll(dd);
      dd.classList.toggle('is-open', willOpen);
      e.stopPropagation();
      return;
    }
    /* 그 외 클릭(메뉴 항목 포함)은 드롭다운을 닫는다. 항목 클릭 이벤트는
       stopPropagation 하지 않으므로 페이지의 행 핸들러(복제/삭제)로 정상 버블된다. */
    closeAll(null);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(null); });
})();