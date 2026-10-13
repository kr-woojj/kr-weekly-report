/* 주간보고 변환기 — 화면 로직 (Chrome 확장 탭 / 단일 HTML 공용).
   폴더 지정(File System Access API)이 되면 같은 폴더에 결과를 저장하고, 안 되면 파일 선택 + 다운로드로 동작. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const CV = WBR.convert;
  const FSA = typeof window.showDirectoryPicker === 'function';
  const SETTINGS_FILE_IN_FOLDER = '주간보고변환기_설정.json';
  const S = { settings: null, settingsSrc: '내장', dir: null, files: [], docx: null, tpl: null, result: null, blobUrls: [] };

  // ---------- 설정 ----------
  async function loadSettings() {
    if (window.WBR_SETTINGS_INLINE) { S.settings = window.WBR_SETTINGS_INLINE; S.settingsSrc = '내장'; }
    else { S.settings = await (await fetch('settings.json')).json(); S.settingsSrc = 'settings.json'; }
    $('settingsSrc').textContent = S.settingsSrc;
    $('optRenumber').checked = S.settings['옵션']?.['번호_재부여'] !== false;
    $('optTables').checked = S.settings['옵션']?.['중첩표_포함'] !== false;
  }
  async function loadFolderSettings() {
    if (!S.dir) return;
    try {
      const fh = await S.dir.getFileHandle(S.settings['폴더_설정파일명'] || SETTINGS_FILE_IN_FOLDER);
      const txt = await (await fh.getFile()).text();
      S.settings = Object.assign({}, S.settings, JSON.parse(txt)); S.settingsSrc = '폴더의 ' + (S.settings['폴더_설정파일명'] || SETTINGS_FILE_IN_FOLDER);
      $('settingsSrc').textContent = S.settingsSrc;
    } catch (e) { /* 없으면 내장 설정 */ }
  }

  // ---------- 최근 폴더 기억 (IndexedDB) ----------
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('wbr-converter', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function kvGet(k) { try { const db = await idb(); return await new Promise((res, rej) => { const t = db.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); }); } catch (e) { return undefined; } }
  async function kvSet(k, v) { try { const db = await idb(); await new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite').objectStore('kv').put(v, k); t.onsuccess = res; t.onerror = () => rej(t.error); }); } catch (e) { /* ignore */ } }

  // ---------- 폴더 ----------
  async function pickFolder() {
    try {
      const h = await window.showDirectoryPicker({ mode: 'readwrite', id: 'wbr-folder' });
      await useFolder(h); await kvSet('folder', h);
    } catch (e) { if (e.name !== 'AbortError') setStatus('폴더를 열지 못했습니다: ' + e.message, 'err'); }
  }
  async function reopenRecent() {
    const h = await kvGet('folder'); if (!h) return;
    let p = await h.queryPermission({ mode: 'readwrite' });
    if (p !== 'granted') p = await h.requestPermission({ mode: 'readwrite' });
    if (p === 'granted') await useFolder(h); else setStatus('폴더 접근이 허용되지 않았습니다. [폴더 선택…]으로 다시 지정하세요.', 'warn');
  }
  async function useFolder(h) {
    S.dir = h; $('folderName').textContent = '폴더: ' + h.name;
    await loadSettings(); await loadFolderSettings();
    const files = [];
    for await (const [name, entry] of h.entries()) if (entry.kind === 'file') files.push({ name, handle: entry });
    S.files = files;
    const docxs = files.filter(f => /\.docx$/i.test(f.name) && !f.name.startsWith('~$'));
    const tpls = files.filter(f => CV.is_template_name(f.name, S.settings));
    const mt = await Promise.all(docxs.map(async f => (await f.handle.getFile()).lastModified));
    docxs.forEach((f, i) => f.mtime = mt[i]);
    docxs.sort((a, b) => (b.name.includes('취합') - a.name.includes('취합')) || (b.mtime - a.mtime));
    fillSelect($('selDocx'), docxs.map(f => f.name), '취합본 docx 없음');
    fillSelect($('selTpl'), tpls.map(f => f.name), '양식 hwpx 없음 — 폴더에 "' + (S.settings['양식_파일명_패턴'] || '양식.hwpx') + '"이 든 파일 필요');
    await onPickChanged();
  }
  function fillSelect(sel, names, emptyMsg) {
    sel.innerHTML = '';
    if (!names.length) { const o = document.createElement('option'); o.textContent = emptyMsg; o.value = ''; sel.appendChild(o); return; }
    for (const n of names) { const o = document.createElement('option'); o.textContent = n; o.value = n; sel.appendChild(o); }
  }
  async function readFromFolder(name) {
    const f = S.files.find(x => x.name === name); if (!f) return null;
    const file = await f.handle.getFile();
    return { name, bytes: new Uint8Array(await file.arrayBuffer()) };
  }
  async function onPickChanged() {
    $('btnConvert').disabled = true; $('peek').textContent = ''; $('peek').className = 'muted';
    if (FSA) {
      if ($('selDocx').value !== DROP) S.docx = $('selDocx').value ? await readFromFolder($('selDocx').value) : null;
      if ($('selTpl').value !== DROP) S.tpl = $('selTpl').value ? await readFromFolder($('selTpl').value) : null;
    }
    if (!S.docx) { $('peek').textContent = '취합본 docx를 선택하세요.'; return; }
    if (CV.is_drm_encrypted(S.docx.bytes)) {
      $('peek').className = 'err';
      $('peek').textContent = '⚠ 이 취합본은 민감도 레이블(DRM)로 암호화되어 있어 읽을 수 없습니다. Word에서 열어 [민감도] → 암호화 없는 레이블(제한 없음)로 바꿔 저장한 뒤 다시 선택하세요.';
      return;
    }
    try {
      const pk = await CV.peek(S.docx.bytes, S.docx.name);
      if (pk.report_date) $('reportDate').value = pk.report_date;
      $('peek').textContent = `취합본 읽음: 문단 ${pk.n_para}개, 빨간색 ${pk.n_red}개, 보고일 ${pk.report_date || '(없음 — 직접 입력)'}` + (pk.headings['금주실적'] ? ` · ${pk.headings['금주실적']}` : '');
      if (!pk.n_red) { $('peek').className = 'warn'; $('peek').textContent += ' — 빨간색 내용이 없습니다.'; }
    } catch (e) { $('peek').className = 'err'; $('peek').textContent = '취합본을 읽지 못했습니다: ' + e.message; return; }
    if (!S.tpl) { $('peek').textContent += ' · 양식 hwpx가 없습니다.'; $('peek').className = 'warn'; return; }
    $('btnConvert').disabled = false;
  }

  // ---------- 파일 선택 방식(폴더 지정 불가 시) ----------
  async function fileToObj(file) { return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }; }
  async function takeFiles(list) {
    for (const f of list) {
      if (/\.docx$/i.test(f.name)) { S.docx = await fileToObj(f); markPicked('selDocx', f.name); }
      else if (/\.hwpx$/i.test(f.name)) { S.tpl = await fileToObj(f); markPicked('selTpl', f.name); }
    }
    await onPickChanged();
  }
  const DROP = '__dropped__';
  function markPicked(id, name) {
    const el = $(id);
    if (el.tagName === 'SELECT') {   // 폴더 모드: 끌어놓은 파일을 목록에 추가해 선택
      let o = el.querySelector(`option[value="${DROP}"]`);
      if (!o) { o = document.createElement('option'); o.value = DROP; el.appendChild(o); }
      o.textContent = name + ' (끌어놓음)'; el.value = DROP;
    } else el.replaceWith(labelSpan(id, name));
  }
  function labelSpan(id, text) { const s = document.createElement('div'); s.id = id; s.className = 'note'; s.textContent = text; return s; }

  // ---------- 변환 ----------
  function setStatus(msg, cls) { $('status').textContent = msg; $('status').className = cls || 'muted'; }
  async function runConvert() {
    $('btnConvert').disabled = true; setStatus('변환 중…'); $('step3').hidden = true;
    const existing = FSA && S.dir ? S.files.map(f => f.name) : [];
    const opts = { '번호_재부여': $('optRenumber').checked, '중첩표_포함': $('optTables').checked };
    let res;
    try {
      res = await CV.convert({ docxBytes: S.docx.bytes, docxName: S.docx.name, templateBytes: S.tpl?.bytes, templateName: S.tpl?.name, settings: S.settings, reportDate: $('reportDate').value || null, options: opts, existingNames: existing });
    } catch (e) { res = { ok: false, blocked: '예상치 못한 오류: ' + (e.stack || e), checks: [], log: [] }; }
    S.result = res; $('btnConvert').disabled = false;
    showResult(res);
    if (!res.ok) { setStatus('변환 실패', 'err'); return; }
    // 저장
    if (FSA && S.dir) {
      try {
        await writeFile(S.dir, res.output_name, res.output_bytes);
        await writeFile(S.dir, res.report_name, res.report_html);
        const logDir = await S.dir.getDirectoryHandle(S.settings['로그_폴더'] || '_로그', { create: true });
        await writeFile(logDir, res.log_name, res.log_json);
        setStatus(`저장 완료: ${res.output_name} (폴더 "${S.dir.name}")`, 'ok');
        S.files.push({ name: res.output_name });   // 같은 이름 재변환 시 _v2 부여
        $('btnDownload').hidden = true; $('btnDownloadReport').hidden = true;
      } catch (e) {
        setStatus('폴더에 저장하지 못했습니다(' + e.message + '). 아래 다운로드 버튼을 쓰세요.', 'warn');
        $('btnDownload').hidden = false; $('btnDownloadReport').hidden = false;
      }
    } else {
      setStatus('변환 완료 — 다운로드 버튼으로 받으세요.', 'ok');
      $('btnDownload').hidden = false; $('btnDownloadReport').hidden = false;
    }
  }
  async function writeFile(dir, name, data) {
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable(); await w.write(data); await w.close();
  }
  function showResult(res) {
    $('step3').hidden = false; const box = $('resultBox'); const tb = $('checks').querySelector('tbody'); tb.innerHTML = '';
    if (!res.ok) {
      box.innerHTML = `<div class="result-bad"><b>변환하지 못했습니다.</b>\n${esc(res.blocked || '')}</div>`;
      if (res.log && res.log.length) box.innerHTML += `<div class="note"><small>${esc(res.log.join('\n'))}</small></div>`;
      $('btnReport').hidden = true; $('btnDownload').hidden = true; $('btnDownloadReport').hidden = true; $('chkCount').textContent = ''; return;
    }
    const s = res.summary;
    const n = {}; for (const l of ['오류', '경고', '참고']) n[l] = res.checks.filter(c => c.level === l).length;
    box.innerHTML = `<div class="result-ok">✔ 생성: <b>${esc(res.output_name)}</b><br>발췌 ${s['발췌_행']}행 · 표 ${s['표'].length}개 · 본문 ${s['본문_쪽수_추정']}쪽(추정) · 수입실적 ${esc(s['수입실적'].map(x => x[1]).join(', ') || '(없음)')}` +
      (s['칸없음_미배치'].length ? `<br><span class="warn">넣지 않은 빨간색(양식에 칸 없음): ${esc(s['칸없음_미배치'].map(u => `${u.dept} ${u.category} ${u.count}행`).join(', '))}</span>` : '') +
      (Object.keys(s['추가_쪽']).length ? `<br>쪽 넘김: ${esc(Object.entries(s['추가_쪽']).map(([k, v]) => `${WBR.report_html.S(k)} +${v}쪽`).join(', '))}` : '') + '</div>';
    $('chkCount').textContent = `— 오류 ${n['오류']} / 경고 ${n['경고']} / 참고 ${n['참고']}`;
    for (const c of res.checks) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="lv-${c.level}">${c.level}${c.red ? ' ●' : ''}</td><td>${esc(WBR.report_html.S(c.where))}<br><small class="muted">${esc(c.para_id)}</small></td><td>${esc(c.text)}</td><td>${esc(c.what)}</td>`;
      tb.appendChild(tr);
    }
    $('btnReport').hidden = false;
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function blobUrl(data, type) { const u = URL.createObjectURL(new Blob([data], { type })); S.blobUrls.push(u); return u; }
  function download(name, data, type) { const a = document.createElement('a'); a.href = blobUrl(data, type); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }

  // ---------- 이벤트 ----------
  async function init() {
    await loadSettings().catch(e => setStatus('설정(settings.json)을 읽지 못했습니다: ' + e.message, 'err'));
    if (FSA) {
      $('btnFolder').addEventListener('click', pickFolder);
      if (await kvGet('folder')) { $('btnRecent').hidden = false; $('btnRecent').addEventListener('click', reopenRecent); }
      $('selDocx').addEventListener('change', onPickChanged); $('selTpl').addEventListener('change', onPickChanged);
    } else {
      $('noFsa').hidden = false; $('btnFolder').textContent = '파일 선택…'; $('dropZone').hidden = false;
      $('btnFolder').addEventListener('click', () => $('fileDocx').click());
      $('fileDocx').multiple = true; $('fileDocx').accept = '.docx,.hwpx';
      $('fileDocx').addEventListener('change', e => takeFiles(e.target.files));
      $('selDocx').replaceWith(labelSpan('selDocx', '(파일 선택 또는 끌어놓기)')); $('selTpl').replaceWith(labelSpan('selTpl', '(파일 선택 또는 끌어놓기)'));
    }
    const dz = $('dropZone');
    for (const el of [dz, document.body]) {
      el.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
      el.addEventListener('dragleave', () => dz.classList.remove('over'));
      el.addEventListener('drop', async e => { e.preventDefault(); dz.classList.remove('over'); if (e.dataTransfer?.files?.length) await takeFiles(e.dataTransfer.files); });
    }
    $('btnConvert').addEventListener('click', runConvert);
    $('btnReport').addEventListener('click', () => { if (S.result?.report_html) window.open(blobUrl(S.result.report_html, 'text/html'), '_blank'); });
    $('btnDownload').addEventListener('click', () => download(S.result.output_name, S.result.output_bytes, 'application/octet-stream'));
    $('btnDownloadReport').addEventListener('click', () => download(S.result.report_name, S.result.report_html, 'text/html'));
    $('reportDate').value = WBR.util.todayIso();
  }
  // 테스트 훅
  window.WBR_APP = { state: S, runConvert, takeFiles };
  init();
})();
