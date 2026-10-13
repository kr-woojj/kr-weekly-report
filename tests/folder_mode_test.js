/* 폴더 지정 모드 검증: showDirectoryPicker를 OPFS(같은 FileSystemDirectoryHandle API)로 대체해
   폴더 선택 → 자동 탐색 → 변환 → 같은 폴더에 hwpx·HTML·_로그 저장을 실제 Chromium에서 확인. */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const DATA = process.env.WBR_DATA || path.join(ROOT, 'tests', 'data');
const TPL0 = '[임원회의용] 연구본부 주간업무보고(YYMMDD) 양식.hwpx', DOCX0 = '[취합중] 주간업무보고_월간계획 포함_261012.docx';
// 이 컨테이너의 헤드리스 Chromium은 OPFS에 비ASCII 이름을 만들면 렌더러가 죽으므로(샌드박스 한정) 테스트는 ASCII 이름으로 한다.
const TPL = 'template_yangsik.hwpx', DOCX = 'collect_261012.docx';
const b64 = f => fs.readFileSync(path.join(DATA, f)).toString('base64');
const SRC = { [DOCX]: DOCX0, [TPL]: TPL0 };
(async () => {
  const extPath = path.join(ROOT, 'ext');
  const ctx = await chromium.launchPersistentContext('', { headless: true, args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`] });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('crash', () => console.log('PAGE CRASH')); page.on('close', () => console.log('PAGE CLOSED'));
  await page.goto(`chrome-extension://${sw.url().split('/')[2]}/index.html`);
  await page.waitForTimeout(500); console.log('title', await page.title());
  // OPFS에 테스트 파일 심기 + 폴더 선택기 대체
  for (const [n, b] of Object.entries({ [DOCX]: b64(SRC[DOCX]), [TPL]: b64(SRC[TPL]), 'memo.txt': btoa('x') })) {
    await page.evaluate(async ({ n, b }) => {
      const root = await navigator.storage.getDirectory();
      const fh = await root.getFileHandle(n, { create: true }); const w = await fh.createWritable();
      const bin = atob(b); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      await w.write(arr); await w.close();
    }, { n, b });
    console.log('seeded', n);
  }
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory(); window.showDirectoryPicker = async () => root;
    const st = await (await fetch('settings.json')).json();   // ASCII 이름용 설정으로 대체
    Object.assign(st, { '양식_파일명_패턴': 'yangsik.hwpx', '출력_파일명': 'exec_report_{YYMMDD}.hwpx', '로그_폴더': '_log', '폴더_설정파일명': 'settings_override.json', '보고서_파일명': 'result_{YYMMDD}.html', '로그_파일명': 'log_{YYMMDD}_{STAMP}.json' });
    window.fetch = async () => ({ json: async () => st });
    indexedDB.open = () => { throw new Error('idb off (test)'); };   // OPFS 핸들의 IndexedDB 저장은 샌드박스에서 불안정
  });
  await page.click('#btnFolder');
  await page.waitForSelector('#btnConvert:not([disabled])', { timeout: 15000 });
  console.log('자동 탐색:', await page.inputValue('#selDocx'), '|', await page.inputValue('#selTpl'), '|', await page.inputValue('#reportDate'));
  await page.click('#btnConvert');
  await page.waitForSelector('#step3:not([hidden])', { state: 'attached', timeout: 30000 });
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('저장 완료'), null, { timeout: 15000 }).catch(() => {});
  console.log('상태:', await page.textContent('#status'));
  const listing = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory(); const out = [];
    for await (const [n, e] of root.entries()) { if (e.kind === 'file') out.push(n + ' ' + (await e.getFile()).size); else { for await (const [m, f] of e.entries()) out.push(n + '/' + m + ' ' + (await f.getFile()).size); } }
    return out.sort();
  });
  console.log('폴더 내용:\n  ' + listing.join('\n  '));
  // 같은 이름 재변환 → _v2
  await page.click('#btnConvert'); await page.waitForTimeout(3000);
  console.log('재변환 상태:', await page.textContent('#status'));
  await ctx.close();
  console.log('page errors:', errors.length ? errors : 'none');
})().catch(e => { console.error(e); process.exit(1); });
