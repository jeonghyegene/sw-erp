/* 인사관리 매뉴얼용 자동 스크린샷 — puppeteer
 * 로컬 정적 서버 기동 → 각 화면/모달로 이동 → assets/img/manual/*.png 저장 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = process.argv[2] || process.cwd();
const OUT = path.join(ROOT, 'assets', 'img', 'manual');
fs.mkdirSync(OUT, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.ico': 'image/x-icon',
};

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const fp = path.join(ROOT, p);
      if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(fp).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ANN = {};
let PAGE = null;

async function shot(el, file, targets) {
  await el.screenshot({ path: path.join(OUT, file) });
  console.log('  ✓', file);
  if (targets && targets.length && PAGE) {
    const rects = await PAGE.evaluate((elem, tgs) => {
      const er = elem.getBoundingClientRect();
      const find = (t) => {
        if (t.sel) return elem.querySelector(t.sel) || document.querySelector(t.sel);
        if (t.text) return [...elem.querySelectorAll(t.tag || '*')].find(e => {
          const tx = (e.textContent || '').trim();
          return tx === t.text || (e.getAttribute && e.getAttribute('placeholder') === t.text);
        });
        return null;
      };
      const out = [];
      tgs.forEach((t, i) => {
        const e = find(t); if (!e) return;
        const r = e.getBoundingClientRect(); if (!r.width) return;
        out.push({ n: t.n || i + 1, label: t.label || '',
          x: +((r.left - er.left) / er.width * 100).toFixed(2),
          y: +((r.top - er.top) / er.height * 100).toFixed(2),
          w: +(r.width / er.width * 100).toFixed(2),
          h: +(r.height / er.height * 100).toFixed(2) });
      });
      return out;
    }, el, targets);
    ANN[file] = rects;
    console.log('    ann', file, JSON.stringify(rects));
  }
}

(async () => {
  const server = await serve();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/index.html`;
  console.log('server:', base);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  PAGE = page;
  await page.setViewport({ width: 1460, height: 940, deviceScaleFactor: 1.5 });
  page.on('pageerror', e => console.log('  [pageerror]', e.message));
  page.on('console', e => { if (e.type() === 'error') console.log('  [console.error]', e.text()); });
  page.on('requestfailed', r => console.log('  [reqfail]', r.url().slice(-60), r.failure() && r.failure().errorText));
  page.on('response', r => { if (r.status() >= 400) console.log('  [' + r.status() + ']', r.url().replace(base.replace('/index.html',''), '')); });

  await page.goto(base, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1500);
  const diag = await page.evaluate(() => ({ app: typeof window.App, keys: window.App ? Object.keys(window.App) : [], pages: document.querySelectorAll('.page').length }));
  console.log('  DIAG app=', diag.app, 'pages=', diag.pages, 'keys=', JSON.stringify(diag.keys));
  await page.waitForFunction("window.App && App.Tabs && typeof App.Tabs.open === 'function'", { timeout: 15000 });

  // 홈 공지 팝업 등 초기 오버레이 닫기
  await page.evaluate(() => {
    document.querySelectorAll('button').forEach(b => {
      if (b.offsetParent !== null && /닫기|오늘 하루/.test(b.textContent || '')) b.click();
    });
    document.querySelectorAll('.modal-backdrop.is-open, .offcanvas.is-open').forEach(m => m.classList.remove('is-open'));
    document.body.style.overflow = '';
  });
  await sleep(500);
  await sleep(1200); // fonts + init

  async function go(id, label, pageId) {
    await page.evaluate((a) => window.App.Tabs.open(a), { id, label, page: pageId });
    await page.waitForSelector(`#${pageId}.is-active`, { timeout: 15000 });
    await sleep(900);
    return await page.$(`#${pageId}`);
  }

  async function openModalByClick(sel, modalId, note) {
    const btn = await page.$(sel);
    if (!btn) { console.log('  ✗ 트리거 없음:', note, sel); return null; }
    await btn.click();
    try { await page.waitForSelector(`#${modalId}.is-open, #${modalId}[style*="display: flex"]`, { timeout: 6000 }); }
    catch (e) { /* fall through — 일부 모달은 클래스 없이 표시 */ }
    await sleep(700);
    const m = await page.$(`#${modalId} .modal`) || await page.$(`#${modalId}`);
    return m;
  }
  async function closeAny() {
    await page.evaluate(() => {
      document.querySelectorAll('.modal-backdrop.is-open, .modal-backdrop').forEach(m => m.classList.remove('is-open'));
      document.querySelectorAll('.offcanvas.is-open').forEach(o => o.classList.remove('is-open'));
      document.body.style.overflow = '';
    });
    await sleep(400);
  }

  // ===== A. 임직원 현황 =====
  console.log('A. 임직원 현황');
  let el = await go('hr-employee', '임직원 현황', 'page-hr-employee');
  // 조직도 트리 펼치기 (기본 접힘) — JS 직접 클릭
  await page.evaluate(() => {
    const b = document.querySelector('#page-hr-employee [data-split-expand="hr-emp-split"]');
    if (b) b.click();
    const sp = document.getElementById('hr-emp-split');
    if (sp) sp.classList.remove('is-left-collapsed');
  });
  await sleep(700);
  if (el) await shot(el, 'a-hr-employee-main.png', [
    { n: 1, sel: 'input[placeholder*="검색"]', label: '성명·사번 검색' },
    { n: 2, text: '조직도', tag: 'h3', label: '조직도 트리' },
    { n: 3, text: '즐겨찾기', tag: 'label', label: '즐겨찾기만 보기' },
    { n: 4, text: '도급직', tag: 'label', label: '도급직만 보기' },
  ]);

  // ===== B. 임직원 관리 =====
  console.log('B. 임직원 관리');
  el = await go('hr-info-mgmt', '임직원 관리', 'page-hr-info-mgmt');
  if (el) await shot(el, 'b-info-mgmt-main.png', [
    { n: 1, sel: '[data-act="create"]', label: '임직원 등록' },
    { n: 2, sel: '[data-act="list-download"]', label: '리스트 다운로드(엑셀)' },
    { n: 3, sel: '[data-empi-dept-manage]', label: '부서 관리' },
  ]);

  // 등록 모달
  let m = await openModalByClick('#page-hr-info-mgmt [data-act="create"]', 'modal-empi-create', '임직원 등록');
  if (m) await shot(m, 'b1-create-modal.png', [
    { n: 1, sel: '[data-empi-create-submit]', label: '등록' },
    { n: 2, text: '선택 정보', tag: 'div', label: '선택 정보 펼치기' },
  ]);
  await closeAny();

  // 인사카드 모달 (PDF 버튼 포함)
  m = await openModalByClick('#page-hr-info-mgmt [data-emp-card-link]', 'modal-empi-card', '인사카드');
  if (m) await shot(m, 'a5-card-modal.png', [
    { n: 1, sel: '[data-empi-card-pdf]', label: 'PDF 출력' },
    { n: 2, sel: '[data-empi-card-tabs] .tabs__nav', label: '탭 5개' },
  ]);
  // 인사 정보 탭으로 이동 (계약/서명요청 — B-3)
  const infoTab = await page.$('#modal-empi-card [data-empi-card-tabs] [data-tab="contract"]');
  if (infoTab) { await infoTab.click(); await sleep(700); const mm = await page.$('#modal-empi-card .modal'); if (mm) await shot(mm, 'b3-card-contract-tab.png', [
    { n: 1, sel: '[data-empi-request-sign]', label: '서명 요청' },
    { n: 2, sel: '[data-empi-docs-bulk-send]', label: '전체 발송' },
    { n: 3, sel: '[data-empi-contract-write]', label: '계약서 작성' },
  ]); }
  await closeAny();

  // 부서 관리 모달
  {
    const btn = await page.$('#page-hr-info-mgmt [data-empi-dept-manage]');
    if (btn) {
      await page.evaluate(() => { const b = document.querySelector('#page-hr-info-mgmt [data-empi-dept-manage]'); if (b) b.click(); });
      await sleep(800);
      const dm = await page.$('.modal-backdrop.is-open .modal') || await page.$('.offcanvas.is-open');
      if (dm) await shot(dm, 'b8-dept-modal.png'); else console.log('  ✗ 부서관리 모달 안 열림');
      await closeAny();
    } else console.log('  ✗ 부서관리 버튼 없음');
  }

  // ===== C. 포상·징계 =====
  console.log('C. 포상·징계');
  el = await go('hr-prize-discipline', '포상·징계', 'page-hr-prize-discipline');
  if (el) await shot(el, 'c-prize-main.png', [
    { n: 1, sel: '[data-pd-new]', label: '신규 등록' },
    { n: 2, sel: '[data-pd-edit]', label: '수정' },
  ]);

  m = await openModalByClick('#page-hr-prize-discipline [data-pd-new]', 'modal-pd-editor', '포상 신규');
  if (m) await shot(m, 'c1-new-modal.png', [
    { n: 1, sel: '[data-pd-pick]', label: '직원 선택' },
    { n: 2, text: '등록', tag: 'button', label: '등록' },
  ]);
  await closeAny();

  m = await openModalByClick('#page-hr-prize-discipline [data-pd-edit]', 'modal-pd-editor', '포상 수정');
  if (m) await shot(m, 'c4-edit-modal.png', [
    { n: 1, text: '삭제', tag: 'button', label: '삭제' },
    { n: 2, text: '저장', tag: 'button', label: '저장' },
  ]);
  await closeAny();

  fs.writeFileSync(path.join(OUT, 'annotations.json'), JSON.stringify(ANN, null, 2));
  await browser.close();
  server.close();
  console.log('DONE →', OUT);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
