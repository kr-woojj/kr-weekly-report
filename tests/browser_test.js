/* 실제 Chromium에서 ① 확장 페이지 ② 단일 HTML(file://) 을 열어 3세트를 변환하고 결과 hwpx를 내려받아 저장.
   실행: node tests/browser_test.js <outdir>   → 이후 python tests/compare_py_js.py <py_outdir> <outdir> 로 비교 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const DATA = process.env.WBR_DATA || path.join(ROOT, 'tests', 'data');
const TPL = '[임원회의용] 연구본부 주간업무보고(YYMMDD) 양식.hwpx';
const CASES = ['[취합중] 주간업무보고_26.09.08.docx', '[취합중] 주간업무보고_26.09.23.docx', '[취합중] 주간업무보고_월간계획 포함_261012.docx'];
const b64 = f => fs.readFileSync(path.join(DATA, f)).toString('base64');

async function runOnPage(page, outdir, tag) {
  for (const docx of CASES) {
    await page.evaluate(async ({ dn, db, tn, tb }) => {
      const toFile = (b, n) => new File([Uint8Array.from(atob(b), c => c.charCodeAt(0))], n);
      await window.WBR_APP.takeFiles([toFile(db, dn), toFile(tb, tn)]);
    }, { dn: docx, db: b64(docx), tn: TPL, tb: b64(TPL) });
    await page.waitForSelector('#btnConvert:not([disabled])', { timeout: 10000 });
    await page.click('#btnConvert');
    await page.waitForSelector('#step3:not([hidden])', { timeout: 30000, state: 'attached' }); try { await page.waitForSelector('#btnDownload:not([hidden])', { timeout: 30000, state: 'attached' }); } catch (e) { console.log('DEBUG status=', await page.textContent('#status'), '| box=', (await page.textContent('#resultBox')).slice(0, 200), '| hidden=', await page.getAttribute('#btnDownload', 'hidden'), await page.evaluate(() => JSON.stringify(window.WBR_APP.state.result).slice(0, 1500))); throw e; }
    const status = await page.textContent('#status'); const box = await page.textContent('#resultBox');
    const dl = page.waitForEvent('download'); await page.click('#btnDownload'); const d = await dl;   // 다운로드 동작 확인(헤드리스는 파일명이 'download'로 옴)
    const got = await page.evaluate(() => { const r = window.WBR_APP.state.result; let s = ''; r.output_bytes.forEach(b => s += String.fromCharCode(b)); return { name: r.output_name, b64: btoa(s), report: r.report_html, rname: r.report_name }; });
    const name = got.name; fs.writeFileSync(path.join(outdir, name), Buffer.from(got.b64, 'base64')); fs.writeFileSync(path.join(outdir, got.rname), got.report);
    await d.delete();
    const logJson = await page.evaluate(() => window.WBR_APP.state.result.log_json); const logName = await page.evaluate(() => window.WBR_APP.state.result.log_name);
    fs.writeFileSync(path.join(outdir, logName), logJson);
    console.log(`[${tag}] ${name} | ${status.trim()} | ${box.trim().replace(/\s+/g, ' ').slice(0, 110)}`);
  }
}

(async () => {
  const outdir = process.argv[2] || '/tmp/browser_out'; fs.mkdirSync(outdir, { recursive: true });
  const extOut = path.join(outdir, 'ext'), htmlOut = path.join(outdir, 'html'); fs.mkdirSync(extOut, { recursive: true }); fs.mkdirSync(htmlOut, { recursive: true });
  const extPath = path.join(ROOT, 'ext');
  const ctx = await chromium.launchPersistentContext('', { headless: true, args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`], acceptDownloads: true });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`chrome-extension://${extId}/index.html`);
  console.log('확장 페이지 열림:', await page.title(), '| FSA:', await page.evaluate(() => typeof window.showDirectoryPicker));
  await runOnPage(page, extOut, 'ext');
  await page.screenshot({ path: path.join(outdir, 'ext_result.png'), fullPage: true });
  // 단일 HTML (file://)
  const page2 = await ctx.newPage(); page2.on('pageerror', e => errors.push('html: ' + String(e)));
  await page2.goto('file://' + path.join(ROOT, 'dist', '주간보고변환기.html'));
  console.log('단일 HTML 열림:', await page2.title(), '| 설정:', await page2.textContent('#settingsSrc'));
  await runOnPage(page2, htmlOut, 'html');
  await page2.screenshot({ path: path.join(outdir, 'html_result.png'), fullPage: true });
  await ctx.close();
  console.log('page errors:', errors.length ? errors : 'none');
})().catch(e => { console.error(e); process.exit(1); });
