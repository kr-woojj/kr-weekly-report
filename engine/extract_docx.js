/* extract_docx: 취합용 주간업무보고 docx → 문단 단위 JSON. (Python extract_docx.py 포팅)
   빨간색 판정: run의 w:color가 적색 계열(R>=0xC0, G<=0x40, B<=0x40). 색 없음/000000 = 검정.
   w:del(변경 추적 삭제분)은 제외, w:ins는 포함. w:br은 '\n'으로 보존. */
(function (WBR) {
  'use strict';
  const U = WBR.util;
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const EX = {};

  function isRedHex(h) {
    if (!h || !/^[0-9A-Fa-f]{6}$/.test(h)) return false;
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return r >= 0xC0 && g <= 0x40 && b <= 0x40;
  }

  function paraRuns(p) {
    const runs = [];
    for (const r of U.descendants(p, W, 'r')) {
      let anc = r.parentNode, skip = false;
      while (anc && anc !== p) {
        if (anc.namespaceURI === W && anc.localName === 'del') { skip = true; break; }
        anc = anc.parentNode;
      }
      if (skip) continue;
      const rpr = U.firstChildNS(r, W, 'rPr');
      let color = null, hl = null;
      if (rpr) {
        const c = U.firstChildNS(rpr, W, 'color'); if (c) color = (c.getAttributeNS(W, 'val') || '').toUpperCase();
        const h = U.firstChildNS(rpr, W, 'highlight'); if (h) hl = h.getAttributeNS(W, 'val');
      }
      let text = '';
      for (const ch of U.children(r)) {
        if (ch.namespaceURI !== W) continue;
        if (ch.localName === 't') text += ch.textContent || '';
        else if (ch.localName === 'br') text += '\n';
        else if (ch.localName === 'tab') text += '\t';
      }
      if (text === '') continue;
      runs.push({ text, is_red: isRedHex(color), color, highlight: hl });
    }
    return runs;
  }

  EX.level_of = function (text) {
    const t = text.trimStart();
    if (/^\d{1,2}\s*[.．](?=\s|\[|[가-힣A-Za-z])/u.test(t)) return 1;   // '1. [..]' (날짜 '10.15'는 제외)
    if (/^[ㅇ○◦●]/.test(t)) return 2;
    if (/^[-–—·•]/.test(t)) return 3;
    return 0;
  };

  function hasNumPr(p) {
    const ppr = U.firstChildNS(p, W, 'pPr'); if (!ppr) return null;
    const np = U.firstChildNS(ppr, W, 'numPr'); if (!np) return null;
    const il = U.firstChildNS(np, W, 'ilvl');
    return il ? parseInt(il.getAttributeNS(W, 'val'), 10) : 0;
  }

  /** documentXml: word/document.xml 문자열 */
  EX.extract = function (documentXml, docxName) {
    const doc = U.parseXml(documentXml);
    const body = doc.getElementsByTagNameNS(W, 'body')[0];
    const paragraphs = [];
    let section = '기타';
    const section_ranges = {};
    let report_date = null, pid = 0, tbl_idx = 0;
    const template_rows = [], nested_tables = [];

    function add(pEl, location, dept, category, sectionName) {
      const runs = paraRuns(pEl);
      const text = runs.map(r => r.text).join('');
      pid += 1;
      const para_id = 'p-' + String(pid).padStart(4, '0');
      const nonWs = runs.filter(r => r.text.trim());
      const redChars = nonWs.filter(r => r.is_red).reduce((a, r) => a + U.codepoints(r.text.trim()).length, 0);
      const allChars = nonWs.reduce((a, r) => a + U.codepoints(r.text.trim()).length, 0);
      const red_ratio = allChars ? redChars / allChars : 0;
      const is_red = nonWs.length > 0 && nonWs.every(r => r.is_red);
      let lvl = EX.level_of(text);
      const auto = hasNumPr(pEl);
      if (lvl === 0 && auto !== null && text.trim()) lvl = 3;
      const rec = {
        para_id, dept, category, section: sectionName, location, text, level: lvl,
        auto_bullet: auto !== null && text.trim() !== '',
        in_nested_table: location.includes('/nested'),
        is_red, red_ratio: Math.round(red_ratio * 1000) / 1000, partial_red: red_ratio > 0 && red_ratio < 1,
        has_linebreak: text.includes('\n'),
        runs: runs.map(r => ({ text: r.text, is_red: r.is_red, highlight: r.highlight })),
      };
      paragraphs.push(rec);
      return rec;
    }
    const cellText = tc => U.childrenNS(tc, W, 'p').map(p => paraRuns(p).map(r => r.text).join('')).join('\n').trim();

    function walkCell(tc, loc, dept, category, sec) {
      for (const ch of U.children(tc)) {
        if (ch.namespaceURI !== W) continue;
        if (ch.localName === 'p') add(ch, loc, dept || null, category || null, sec);
        else if (ch.localName === 'tbl') {
          const tid = 'T' + String(nested_tables.length + 1).padStart(2, '0');
          let anchor = null;
          for (let i = paragraphs.length - 1; i >= 0; i--) if (paragraphs[i].text.trim() && !paragraphs[i].in_nested_table) { anchor = paragraphs[i].para_id; break; }
          const gridEl = U.firstChildNS(ch, W, 'tblGrid');
          const grid = gridEl ? U.childrenNS(gridEl, W, 'gridCol').map(g => parseInt(g.getAttributeNS(W, 'w'), 10)) : [];
          const trows = [];
          U.childrenNS(ch, W, 'tr').forEach((ntr, nri) => {
            const row = [];
            U.childrenNS(ntr, W, 'tc').forEach((ntc, nci) => {
              const tcpr = U.firstChildNS(ntc, W, 'tcPr');
              let span = 1, vmerge = null;
              if (tcpr) {
                const gs = U.firstChildNS(tcpr, W, 'gridSpan'); if (gs) span = parseInt(gs.getAttributeNS(W, 'val'), 10);
                const vm = U.firstChildNS(tcpr, W, 'vMerge'); if (vm) vmerge = vm.getAttributeNS(W, 'val') || 'continue';
              }
              const cps = [];
              for (const p of U.childrenNS(ntc, W, 'p')) {
                const r = add(p, `${loc}/nested r${nri}c${nci}`, dept || null, category || null, sec);
                r.table_id = tid; r.cell = [nri, nci]; cps.push(r.para_id);
              }
              row.push({ paras: cps, colspan: span, vmerge });
            });
            trows.push(row);
          });
          nested_tables.push({ table_id: tid, anchor_para_id: anchor, dept: dept || null, category: category || null, section: sec, location: loc, grid_twips: grid, rows: trows });
        }
      }
    }

    for (const child of U.children(body)) {
      if (child.namespaceURI !== W) continue;
      if (child.localName === 'p') {
        const rec = add(child, 'body', null, null, section);
        const t = rec.text.trim();
        const m = t.match(/^(\d{4})[.\-/ ]\s*(\d{1,2})[.\-/ ]\s*(\d{1,2})\.?$/);
        if (m && report_date === null) report_date = `${m[1]}-${U.pad(+m[2])}-${U.pad(+m[3])}`;
        if (/금주\s*실적/.test(t)) { section = '금주실적'; section_ranges['금주실적'] = t; rec.section = section; rec.is_heading = true; }
        else if (/차주\s*계획/.test(t)) { section = '차주계획'; section_ranges['차주계획'] = t; rec.section = section; rec.is_heading = true; }
        else if (/수입\s*실적/.test(t)) { section = '수입실적'; rec.section = section; rec.is_heading = true; }
        else if (/월간\s*계획/.test(t)) { section = '월간계획'; section_ranges['월간계획'] = t; rec.section = section; rec.is_heading = true; }
      } else if (child.localName === 'tbl') {
        tbl_idx += 1;
        U.childrenNS(child, W, 'tr').forEach((tr, ri) => {
          const tcs = U.childrenNS(tr, W, 'tc');
          if ((section === '금주실적' || section === '차주계획') && tcs.length >= 3) {
            const dept = cellText(tcs[0]), category = cellText(tcs[1]);
            if (ri === 0 && dept === '구분') return;
            if (dept.includes('서식')) { template_rows.push(`tbl${tbl_idx} r${ri}`); return; }
            walkCell(tcs[2], `tbl${tbl_idx} r${ri}c2`, dept, category, section);
          } else if (section === '월간계획' && tcs.length >= 2) {
            const dept = cellText(tcs[0]);
            if (ri === 0 && dept === '구분') return;
            if (dept.includes('서식')) { template_rows.push(`tbl${tbl_idx} r${ri}`); return; }
            walkCell(tcs[tcs.length - 1], `tbl${tbl_idx} r${ri}c${tcs.length - 1}`, dept, '월간계획', section);
          } else if (section === '수입실적' && tcs.length >= 2) {
            const label = cellText(tcs[0]);
            for (const p of U.childrenNS(tcs[1], W, 'p')) add(p, `tbl${tbl_idx} r${ri}c1`, '수입실적', label, section);
          } else {
            tcs.forEach((tc, ci) => { for (const p of U.childrenNS(tc, W, 'p')) add(p, `tbl${tbl_idx} r${ri}c${ci}`, null, null, section); });
          }
        });
      }
    }
    // 연속행(level 0)은 직전 항목 소속
    let last_item = null;
    for (const rec of paragraphs) {
      if (['금주실적', '차주계획', '월간계획'].includes(rec.section) && rec.location !== 'body') {
        if (rec.level === 1) last_item = rec.para_id;
        rec.item_id = rec.text.trim() ? last_item : null;
      }
    }
    const pmap = {}; for (const p of paragraphs) pmap[p.para_id] = p;
    for (const t of nested_tables) {
      const cells = [];
      for (const row of t.rows) for (const c of row) for (const id of c.paras) if (pmap[id].text.trim()) cells.push(pmap[id]);
      t.n_rows = t.rows.length;
      t.n_cols = t.rows.length ? Math.max(...t.rows.map(row => row.reduce((a, c) => a + c.colspan, 0))) : 0;
      t.is_red = cells.length > 0 && cells.every(c => c.is_red);
      t.red_ratio = cells.length ? Math.round(cells.filter(c => c.is_red).length / cells.length * 1000) / 1000 : 0;
      t.anchor_item_id = t.anchor_para_id ? (pmap[t.anchor_para_id].item_id ?? null) : null;
    }
    return { nested_tables, docx_path: docxName || '', report_date, section_headings: section_ranges, template_rows_skipped: template_rows, paragraphs };
  };

  WBR.extract_docx = EX;
})(globalThis.WBR = globalThis.WBR || {});
