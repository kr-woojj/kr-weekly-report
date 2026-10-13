/* 주간보고 변환 엔진 — 단일 진입점 (브라우저·Node 공용). (Python convert.py 포팅)
   convert({docxBytes, docxName, templateBytes, templateName, settings, reportDate, options, existingNames}) -> Promise<result>
   result: {ok, output_name, output_bytes(Uint8Array), report_name, report_html, log_name, log_json, summary, checks, blocked, log}
   파일 읽기·쓰기는 호출자(UI)가 한다. 사람이 결정할 것은 settings/options로만 들어온다. */
(function (WBR) {
  'use strict';
  const U = WBR.util, EX = WBR.extract_docx, DF = WBR.date_facts, HW = WBR.hwpx_tools;
  const SECTIONS = ['금주실적', '차주계획', '월간계획'];
  const CV = {};

  CV.apply_settings = function (st) {
    HW.CAT_ALIAS = Object.assign({}, st['분류_별칭'] || {});
    const b = st['기준문단_속성'] || {};
    if (Object.keys(b).length) {
      for (const k of Object.keys(b['들여쓰기'] || {})) HW.LEVEL_INTENT[k] = b['들여쓰기'][k];
      for (const k of Object.keys(b['fallback_ID'] || {})) HW.FALLBACK_STYLE[k] = b['fallback_ID'][k].slice();
      HW.BASE_CHAR = [b['글자크기'] || '1500', b['한글글꼴'] || '8', b['장평'] || '95', b['자간'] || '-1'];
    }
    const pc = st['쪽용량'] || {};
    if (pc['줄간격_hwpunit']) HW.LINE_PITCH = parseInt(pc['줄간격_hwpunit'], 10);
    if (pc['한줄_글자폭']) HW.CHARS_PER_LINE = parseFloat(pc['한줄_글자폭']);
    const tb = st['표'] || {};
    if (tb['폭_hwpunit']) HW.TABLE_WIDTH = parseInt(tb['폭_hwpunit'], 10);
    if (tb['글자크기']) HW.TABLE_FONT_HEIGHT = String(tb['글자크기']);
    if (tb['가운데정렬_최대글자폭']) HW.CENTER_MAX_WIDTH = parseInt(tb['가운데정렬_최대글자폭'], 10);
    DF.HOLIDAYS = Object.assign({}, st['공휴일'] || {});
    const hq = st['본부_칸'] || {};
    HW.HQ = { banner: hq['배너명'] || '연구본부', category: hq['분류키'] || '본부', enabled: hq['사용'] !== false };
  };
  /** 양식에 칸이 없는 항목을 본부 배너 아래로 보낸다(양식에 본부 배너가 있는 구역만). 반환: 옮긴 (구역/부서/분류) 목록 */
  CV.remap_to_hq = function (items, tk) {
    const moved = new Map();
    if (!HW.HQ.enabled) return moved;
    for (const it of items) {
      const key = [it.section, HW.norm_key(it.dept), HW.norm_key(it.category)].join('/');
      if (tk.keys.has(key) || !tk.hq[it.section]) continue;
      const from = `${it.section}/${it.dept}/${it.category}`;
      if (it.section === '월간계획') it.dept = HW.HQ.banner;
      else { it.dept = HW.HQ.banner; it.category = HW.HQ.category; }
      moved.set(from, (moved.get(from) || 0) + 1);
    }
    return moved;
  };

  /** 민감도 레이블(DRM)로 암호화된 docx인가: OOXML zip('PK')이 아니고 OLE 컨테이너 헤더이면 true */
  CV.is_drm_encrypted = function (bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (b.length >= 2 && b[0] === 0x50 && b[1] === 0x4B) return false;
    const ole = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
    return b.length >= 8 && ole.every((v, i) => b[i] === v);
  };
  CV.is_template_name = (name, st) => name.endsWith('.hwpx') && name.includes(st['양식_파일명_패턴'] || '양식.hwpx');
  CV.unique_name = function (name, existing, policy) {
    const has = n => existing.includes(n);
    if (!has(name) || policy === '덮어쓰기') return name;
    const m = name.match(/^(.*)(\.[^.]+)$/); const base = m ? m[1] : name, ext = m ? m[2] : '';
    let n = 2; while (has(`${base}_v${n}${ext}`)) n++;
    return `${base}_v${n}${ext}`;
  };

  CV.build_items = function (report, st, options, log) {
    const remap = {}; for (const k of Object.keys(st['칸없는_부서_처리'] || {})) if (!k.startsWith('_')) remap[k] = st['칸없는_부서_처리'][k];
    const remapped = p => { const k = `${p.section}|${p.dept}|${p.category}`; return k in remap ? [remap[k][0], remap[k][1], true] : [p.dept, p.category, false]; };
    const pmap = {}; for (const p of report.paragraphs) pmap[p.para_id] = p;
    const items = [], nested_skipped = [], remappedItems = new Set(), tablesByAnchor = new Map();
    for (const t of report.nested_tables || []) {
      if (!options['중첩표_포함'] || !t.is_red || !SECTIONS.includes(t.section)) { for (const row of t.rows) for (const c of row) nested_skipped.push(...c.paras); continue; }
      const rows = t.rows.map(row => row.map(c => {
        const lines = [];
        for (const pid of c.paras) { const q = pmap[pid]; for (const ln of q.text.replace(/ /g, ' ').split('\n')) if (ln.trim()) lines.push((q.auto_bullet ? '· ' : '') + ln.trim()); }
        return { lines, colspan: c.colspan, vmerge: c.vmerge };
      }));
      const [td, tc] = remapped(t);
      if (!tablesByAnchor.has(t.anchor_para_id)) tablesByAnchor.set(t.anchor_para_id, []);
      tablesByAnchor.get(t.anchor_para_id).push({ kind: 'table', table_id: t.table_id, dept: td, category: tc, section: t.section, level: 3, text: '', grid_twips: t.grid_twips, rows, para_id: t.table_id });
    }
    for (const p of report.paragraphs) {
      if (!SECTIONS.includes(p.section) || !p.is_red || !p.text.trim() || p.in_nested_table) continue;
      const text = p.text.replace(/ /g, ' ');
      const [dd, cc, rm] = remapped(p);
      if (rm) remappedItems.add(`${p.section}/${p.dept}/${p.category} → ${dd}/${cc}`);
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        const lvl = p.auto_bullet ? 3 : (EX.level_of(line) || p.level || 3);
        items.push({ para_id: p.para_id, dept: dd, category: cc, section: p.section, level: lvl, text: line, auto_bullet: !!p.auto_bullet });
      }
      for (const t of tablesByAnchor.get(p.para_id) || []) items.push(t);
    }
    const income = {};
    for (const p of report.paragraphs) if (p.section === '수입실적' && p.dept === '수입실적' && p.text.trim()) income[p.category] = p.text.trim();
    for (const r of Array.from(remappedItems).sort()) log.push(`칸 없는 부서 배치: ${r} (설정 '칸없는_부서_처리')`);
    return [items, income, nested_skipped];
  };

  async function readZip(bytes) { return await JSZip.loadAsync(bytes); }

  CV.convert = async function (inp) {
    const st = inp.settings; CV.apply_settings(st);
    const opt = Object.assign({}, st['옵션'] || {}, inp.options || {});
    const log = [];
    const res = { ok: false, output_name: null, output_bytes: null, report_name: null, report_html: null, log_name: null, log_json: null, summary: {}, checks: [], blocked: null, log };
    if (!inp.docxBytes) { res.blocked = '취합본 파일이 없습니다.'; return res; }
    if (CV.is_drm_encrypted(inp.docxBytes)) {
      res.blocked = '이 취합본은 민감도 레이블(DRM)로 암호화되어 있어 프로그램이 읽을 수 없습니다.\nWord에서 파일을 열어 [민감도] → 암호화되지 않는 레이블(또는 "제한 없음")로 바꿔 저장한 뒤 다시 넣어 주세요.';
      return res;
    }
    if (!inp.templateBytes) { res.blocked = `임원용 양식(hwpx)을 찾지 못했습니다. 취합본과 같은 폴더에 "${st['양식_파일명_패턴'] || '양식.hwpx'}"이 들어간 파일이 있어야 합니다(또는 양식 파일을 직접 선택).`; return res; }
    // 1. 추출·날짜
    let report;
    try {
      const z = await readZip(inp.docxBytes); const f = z.file('word/document.xml');
      if (!f) throw new Error('word/document.xml 없음 — docx 파일이 아닙니다.');
      report = EX.extract(await f.async('string'), inp.docxName || '');
    } catch (e) { res.blocked = `취합본을 읽는 중 오류: ${e.message || e}`; return res; }
    const rd = inp.reportDate || report.report_date;
    if (!rd) { res.blocked = '보고일을 문서에서 찾지 못했습니다(제목 아래 "YYYY.MM.DD" 줄). 보고일을 직접 입력해 주세요.'; return res; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rd) || !U.isoOf(...rd.split('-').map(Number))) { res.blocked = `보고일 형식이 잘못되었습니다: ${rd} (YYYY-MM-DD)`; return res; }
    const dates = DF.compute(report.paragraphs, rd, report.section_headings);
    log.push(`보고일 ${rd}(${dates.report_weekday}), 금주 실적 ${dates.this_week[0]}~${dates.this_week[1]}, 차주 계획 ${dates.next_week[0]}~${dates.next_week[1]} (출처: 문서 제목)`);
    // 2. 항목
    const [items, income] = CV.build_items(report, st, opt, log);
    const n_red = report.paragraphs.filter(p => p.is_red && p.text.trim()).length;
    if (!items.length) { res.blocked = '빨간색(임원 보고) 내용이 없습니다. 취합본에서 임원 보고 항목을 빨간색으로 지정했는지 확인해 주세요.'; return res; }
    // 3. 채우기
    const { y, m, d } = U.ymd(rd); const yymmdd = `${String(y).slice(2)}${U.pad(m)}${U.pad(d)}`;
    const outName = CV.unique_name((st['출력_파일명'] || '[임원회의용] 연구본부 주간업무보고({YYMMDD}).hwpx').replace('{YYMMDD}', yymmdd), inp.existingNames || [], st['같은이름_있으면'] || '번호붙임');
    let fill, sectionXml, headerXml, tz, hqMoved = [];
    try {
      tz = await readZip(inp.templateBytes);
      const sec = tz.file('Contents/section0.xml'), hdr = tz.file('Contents/header.xml');
      if (!sec || !hdr) throw new Error('Contents/section0.xml 또는 header.xml 없음 — hwpx 양식이 아닙니다.');
      const secXml = await sec.async('string');
      const tk = HW.template_keys(secXml);
      const moved = CV.remap_to_hq(items, tk);
      for (const [from, n] of moved) log.push(`칸 없는 항목 ${n}건을 '${HW.HQ.banner}' 제목 아래에 넣음: ${from}`);
      hqMoved = Array.from(moved, ([from, n]) => ({ from, count: n, dept: from.split('/')[1], section: from.split('/')[0],
        dept_has_slot: Array.from(tk.keys).some(k => k.split('/')[1] === HW.norm_key(from.split('/')[1])) }));
      const r = HW.fill_hwpx(secXml, await hdr.async('string'), rd, items, dates.this_week, dates.next_week, income,
        { renumber: !!opt['번호_재부여'], blank_between_items: !!opt['항목사이_빈줄'], paginate: !!opt['쪽넘김_표복제'] });
      fill = r.log; fill.hq_moved = hqMoved; sectionXml = r.sectionXml; headerXml = r.headerXml || await hdr.async('string');
    } catch (e) { res.blocked = `양식을 채우는 중 오류: ${e.message || e}`; res.log.push(String(e.stack || e)); return res; }
    // 4. 검증 (직렬화된 XML을 다시 파싱해 확인)
    const unmatchedKeys = new Set(fill.unmatched.map(u => [u.section, HW.norm_key(u.dept), HW.norm_key(u.category)].join('/')));
    const expected = items.filter(it => !unmatchedKeys.has([it.section, HW.norm_key(it.dept), HW.norm_key(it.category)].join('/')));   // 칸 없는 항목은 '확인할 것'으로 보고(검증 대상 아님)
    const ver = HW.verify_hwpx(sectionXml, headerXml, expected, !!opt['번호_재부여']);
    if (ver.text_diff.length || !ver.style_uniform) {
      res.blocked = `생성한 파일이 검증을 통과하지 못해 내보내지 않았습니다. 로그를 담당자에게 보내 주세요.\ntext_diff=${ver.text_diff.length}, style_uniform=${ver.style_uniform}`;
      res.log.push(JSON.stringify({ text_diff: ver.text_diff.slice(0, 5), violations: ver.style_violations.slice(0, 5) }));
      return res;
    }
    // zip 조립 (양식의 파일 순서 유지, mimetype은 무압축)
    const zout = new JSZip();
    for (const name of Object.keys(tz.files)) {
      const f = tz.files[name]; if (f.dir) continue;
      let data;
      if (name === 'Contents/section0.xml') data = sectionXml;
      else if (name === 'Contents/header.xml') data = headerXml;
      else data = await f.async('uint8array');
      zout.file(name, data, { compression: name === 'mimetype' ? 'STORE' : 'DEFLATE', date: f.date, createFolders: false });
    }
    res.output_bytes = await zout.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    // 5. 규칙 검토
    const checks = WBR.rules_review.rule_review(report, dates, fill, ver, items, st);
    Object.assign(res, { ok: true, output_name: outName, checks });
    res.summary = {
      '보고일': rd, '요일': dates.report_weekday, '금주실적': dates.this_week, '차주계획': dates.next_week,
      '빨간색_문단': n_red, '발췌_행': fill.filled, '표': fill.tables_inserted.map(t => [t.table_id, t.rows, t.cols]),
      '칸별_항목수': fill.slots_filled, '번호_재부여': fill.renumbered.length, '추가_쪽': fill.pages_added, '본문_쪽수_추정': ver.body_pages,
      '칸없음_미배치': fill.unmatched, '수입실적': fill.income_set, '스타일': fill.styles, '스타일_출처': fill.style_source,
      '한쪽초과_항목': fill.items_split_across_pages, '양식': inp.templateName || '', '취합본': inp.docxName || '',
    };
    res.report_name = (st['보고서_파일명'] || '변환결과_{YYMMDD}.html').replace('{YYMMDD}', yymmdd);
    res.report_html = WBR.report_html.render(res);
    res.log_name = (st['로그_파일명'] || '변환_{YYMMDD}_{STAMP}.json').replace('{YYMMDD}', yymmdd).replace('{STAMP}', U.stamp());
    res.log_json = JSON.stringify({ summary: res.summary, checks, log, fill, verify: ver }, null, 1);
    res.dates = dates; res.report = report;
    return res;
  };

  /** UI용: docx만 읽어 보고일·문단 수·빨간색 수 미리보기 */
  CV.peek = async function (docxBytes, docxName) {
    const z = await readZip(docxBytes); const f = z.file('word/document.xml');
    if (!f) throw new Error('word/document.xml 없음 — docx 파일이 아닙니다.');
    const rep = EX.extract(await f.async('string'), docxName || '');
    return { report_date: rep.report_date, n_para: rep.paragraphs.length, n_red: rep.paragraphs.filter(p => p.is_red && p.text.trim()).length, headings: rep.section_headings };
  };

  WBR.convert = CV;
})(globalThis.WBR = globalThis.WBR || {});
