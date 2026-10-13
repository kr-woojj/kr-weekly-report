/* JS 엔진으로 변환: node tests/run_js.js <docx> <template> <outdir> [settings.json] [reportDate] */
const fs = require('fs'), path = require('path');
const { WBR, ROOT } = require('./node_env');
(async () => {
  const [docx, tpl, outdir, settingsPath, reportDate] = process.argv.slice(2);
  const settings = JSON.parse(fs.readFileSync(settingsPath || path.join(ROOT, 'ext', 'settings.json'), 'utf8'));
  settings['같은이름_있으면'] = '덮어쓰기';
  const t0 = Date.now();
  const res = await WBR.convert.convert({ docxBytes: fs.readFileSync(docx), docxName: path.basename(docx), templateBytes: fs.readFileSync(tpl), templateName: path.basename(tpl), settings, reportDate: reportDate || null, existingNames: [] });
  const ms = Date.now() - t0;
  if (!res.ok) { console.log('BLOCKED:', res.blocked); console.log(res.log.join('\n')); process.exit(1); }
  fs.mkdirSync(outdir, { recursive: true });
  fs.writeFileSync(path.join(outdir, res.output_name), res.output_bytes);
  fs.writeFileSync(path.join(outdir, res.report_name), res.report_html);
  fs.writeFileSync(path.join(outdir, res.log_name), res.log_json);
  const s = res.summary; const n = {}; for (const l of ['오류', '경고', '참고']) n[l] = res.checks.filter(c => c.level === l).length;
  console.log(`OK ${res.output_name}: 발췌 ${s['발췌_행']}행, 표 ${s['표'].length}, 쪽 ${s['본문_쪽수_추정']}, 검토 ${JSON.stringify(n)}, ${ms}ms`);
})().catch(e => { console.error(e); process.exit(2); });
