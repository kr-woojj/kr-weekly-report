/* Node에서 엔진을 돌리기 위한 전역 설정: DOMParser/XMLSerializer(@xmldom), JSZip */
const path = require('path'), fs = require('fs'), vm = require('vm');
const xmldom = require('@xmldom/xmldom');
globalThis.DOMParser = xmldom.DOMParser;
globalThis.XMLSerializer = xmldom.XMLSerializer;
globalThis.JSZip = require('jszip');
const ROOT = path.join(__dirname, '..');
for (const f of ['util.js', 'extract_docx.js', 'date_facts.js', 'hwpx_tools.js', 'rules_review.js', 'report_html.js', 'convert.js']) {
  const p = path.join(ROOT, 'engine', f);
  vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: p });
}
module.exports = { WBR: globalThis.WBR, ROOT };
