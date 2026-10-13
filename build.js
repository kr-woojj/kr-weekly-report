/* 빌드: ① ext/ 에 engine·vendor 복사(확장 폴더 완성) ② dist/weekly-report-converter.html 단일 파일 생성 ③ dist/weekly-report-converter-extension.zip
   실행: node build.js */
const fs = require('fs'), path = require('path');
const ROOT = __dirname, EXT = path.join(ROOT, 'ext'), DIST = path.join(ROOT, 'dist');
const ENGINE = ['util.js', 'extract_docx.js', 'date_facts.js', 'hwpx_tools.js', 'rules_review.js', 'report_html.js', 'convert.js'];
fs.mkdirSync(path.join(EXT, 'engine'), { recursive: true }); fs.mkdirSync(path.join(EXT, 'vendor'), { recursive: true }); fs.mkdirSync(DIST, { recursive: true });
for (const f of ENGINE) fs.copyFileSync(path.join(ROOT, 'engine', f), path.join(EXT, 'engine', f));
fs.copyFileSync(path.join(ROOT, 'vendor', 'jszip.min.js'), path.join(EXT, 'vendor', 'jszip.min.js'));

// 단일 HTML: 외부 참조를 전부 인라인
let html = fs.readFileSync(path.join(EXT, 'index.html'), 'utf8');
const inline = (src) => fs.readFileSync(path.join(EXT, src), 'utf8').replace(/<\/script/gi, '<\\/script');
html = html.replace('<link rel="stylesheet" href="app.css">', () => '<style>\n' + fs.readFileSync(path.join(EXT, 'app.css'), 'utf8') + '\n</style>');
const settings = fs.readFileSync(path.join(EXT, 'settings.json'), 'utf8');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => '<script>\n' + inline(src) + '\n</script>');
html = html.replace('<script>\n' + inline('app.js'), () => '<script>window.WBR_SETTINGS_INLINE = ' + settings.trim() + ';</script>\n<script>\n' + inline('app.js'));
html = html.replace('<title>주간보고 변환기</title>', '<title>주간보고 변환기 (단일 파일)</title>');
fs.writeFileSync(path.join(DIST, 'weekly-report-converter.html'), html);
console.log('dist/weekly-report-converter.html', (html.length / 1024).toFixed(0) + 'KB');

// 확장 zip
const JSZip = require('jszip'); const zip = new JSZip();
(function addDir(dir, rel) {
  for (const n of fs.readdirSync(dir)) { const p = path.join(dir, n); const r = rel ? rel + '/' + n : n;
    if (fs.statSync(p).isDirectory()) addDir(p, r); else zip.file(r, fs.readFileSync(p)); }
})(EXT, 'weekly-report-converter-extension');
zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }).then(b => { fs.writeFileSync(path.join(DIST, 'weekly-report-converter-extension.zip'), b); console.log('dist/weekly-report-converter-extension.zip', (b.length / 1024).toFixed(0) + 'KB'); });
