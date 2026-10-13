/* fill_hwpx / verify_hwpx: 임원회의용 hwpx 양식 채우기·검증. (Python hwpx_tools.py 포팅)
   양식 구조: 본문은 2x2 표의 연속(표 1개 = 1쪽). r1c0 첫 문단 = '실 적'|'계 획'|'월 간'.
   r1c1 subList: [부서 배너(1x1 중첩표)] → 분류 제목 문단('󰊱. …') → 빈 문단들(여기에 항목).
   기준 문단은 header.xml에서 속성으로 찾는다(ID는 한글 재저장 시 바뀜). */
(function (WBR) {
  'use strict';
  const U = WBR.util, WD = U.WD;
  const HP = 'http://www.hancom.co.kr/hwpml/2011/paragraph';
  const HH = 'http://www.hancom.co.kr/hwpml/2011/head';
  const HW = {
    FALLBACK_STYLE: { 1: ['62', '40'], 2: ['65', '12'], 3: ['57', '12'] },
    LEVEL_INTENT: { 1: '-2956', 2: '-3661', 3: '-4266' },
    LEVEL_INDENT: { 1: ' ', 2: '  ', 3: '    ' },
    BASE_CHAR: ['1500', '8', '95', '-1'],
    CAT_ALIAS: { '검사/승인디지털화': '검사/승인디지털라이제이션' },
    LINE_PITCH: 2400, CHARS_PER_LINE: 33.0,
    TABLE_WIDTH: 43584, TABLE_FONT_HEIGHT: '1000', TABLE_ROW_HEIGHT: 282, CENTER_MAX_WIDTH: 8,
    HQ: { banner: '연구본부', category: '본부' },   // 칸 없는 빨간색 항목을 넣는 '본부' 배너(양식에 있을 때만)
  };
  const PUA = /[\u{F0000}-\u{FFFFF}]/u;
  const hp = (el, local) => U.childrenNS(el, HP, local);
  const hp1 = (el, local) => U.firstChildNS(el, HP, local);
  const hh1 = (el, local) => U.firstChildNS(el, HH, local);
  const allTbl = el => U.descendants(el, HP, 'tbl');

  HW.norm_key = function (s) {
    s = (s || '').trim();
    s = s.replace(/^\s*(?:[\u{F0000}-\u{FFFFF}]|[가-힣]|\d+)?\s*\.\s*/u, '');   // '󰊱.' '가.' '1.' 제거
    s = s.replace(/[\s·]/gu, '');
    return HW.CAT_ALIAS[s] !== undefined ? HW.CAT_ALIAS[s] : s;
  };
  HW.ptext = function (p) {
    let s = '';
    for (const r of hp(p, 'run')) for (const t of hp(r, 't')) s += t.textContent || '';
    return s;
  };
  const ptext = HW.ptext;
  function setText(p, text) {
    const runs = hp(p, 'run');
    let t = hp1(runs[0], 't');
    if (!t) t = U.sub(runs[0], HP, 'hp:t');
    U.removeAll(t); t.appendChild(p.ownerDocument.createTextNode(text));
    for (const r of runs.slice(1)) p.removeChild(r);
  }
  HW.text_width = function (text) { let w = 0; for (const ch of text) w += ch.codePointAt(0) < 128 ? 0.55 : 1.0; return w; };
  HW.est_lines = text => Math.max(1, Math.ceil(HW.text_width(text) / HW.CHARS_PER_LINE));
  const est_lines = HW.est_lines;

  // ---------- 스타일 ID 해석 ----------
  HW.resolve_styles = function (header) {
    const cps = {};
    for (const c of U.descendants(header, HH, 'charPr')) {
      const fr = hh1(c, 'fontRef'), ra = hh1(c, 'ratio'), sp = hh1(c, 'spacing');
      if (!fr || !ra || !sp) continue;
      const sig = [c.getAttribute('height'), fr.getAttribute('hangul'), ra.getAttribute('hangul'), sp.getAttribute('hangul')];
      if (sig.join('|') === HW.BASE_CHAR.join('|')) {
        const bold = hh1(c, 'bold') !== null;
        if (cps[bold] === undefined) cps[bold] = c.getAttribute('id');
      }
    }
    const pps = {};
    for (const p of U.descendants(header, HH, 'paraPr')) {
      const al = hh1(p, 'align');
      if (!al || al.getAttribute('horizontal') !== 'JUSTIFY') continue;
      const it = U.descendants(p, '*', 'intent')[0];
      if (it && /^-?\d+$/.test(it.getAttribute('value') || '')) { const v = it.getAttribute('value'); if (pps[v] === undefined) pps[v] = p.getAttribute('id'); }
    }
    const styles = {}, src = {};
    for (const lvl of [1, 2, 3]) {
      const pp = pps[HW.LEVEL_INTENT[lvl]], cp = cps[lvl === 1];
      if (pp && cp) { styles[lvl] = [pp, cp]; src[lvl] = 'resolved'; }
      else { styles[lvl] = HW.FALLBACK_STYLE[lvl]; src[lvl] = 'fallback'; }
    }
    return [styles, src];
  };
  function makePara(doc, styles, level, text) {
    const [ppr, cpr] = styles[level];
    const p = U.mkel(doc, HP, 'hp:p', { id: '2147483648', paraPrIDRef: ppr, styleIDRef: '0', pageBreak: '0', columnBreak: '0', merged: '0' });
    const r = U.sub(p, HP, 'hp:run', { charPrIDRef: cpr });
    if (text) { const t = U.sub(r, HP, 'hp:t'); t.appendChild(doc.createTextNode(text)); }
    return p;
  }

  // ---------- 중첩 표 ----------
  HW.resolve_table_styles = function (header) {
    let body_cp = null, head_cp = null, body_el = null;
    for (const c of U.descendants(header, HH, 'charPr')) {
      const fr = hh1(c, 'fontRef'), sp = hh1(c, 'spacing'), ra = hh1(c, 'ratio');
      if (!fr) continue;
      if (c.getAttribute('height') === HW.TABLE_FONT_HEIGHT && fr.getAttribute('hangul') === '7' && sp && sp.getAttribute('hangul') === '0' && ra && ra.getAttribute('hangul') === '100') {
        const bold = hh1(c, 'bold') !== null;
        if (bold && head_cp === null) head_cp = c.getAttribute('id');
        if (!bold && body_cp === null) { body_cp = c.getAttribute('id'); body_el = c; }
      }
    }
    let added = false;
    if (head_cp === null && body_cp !== null) {
      const cpsEl = U.descendants(header, HH, 'charProperties')[0];
      const neu = body_el.cloneNode(true);
      const ids = U.children(cpsEl).map(x => parseInt(x.getAttribute('id'), 10));
      const newId = String(Math.max(...ids) + 1); neu.setAttribute('id', newId);
      const ul = hh1(neu, 'underline'); const b = U.mkel(header.ownerDocument, HH, 'hh:bold');
      if (ul) neu.insertBefore(b, ul); else neu.appendChild(b);
      cpsEl.appendChild(neu); cpsEl.setAttribute('itemCnt', String(U.children(cpsEl).length)); head_cp = newId; added = true;
    }
    let center_pp = null, just_pp = null;
    for (const p of U.descendants(header, HH, 'paraPr')) {
      const al = hh1(p, 'align'); const it = U.descendants(p, '*', 'intent')[0];
      if (!al || !it || it.getAttribute('value') !== '0') continue;
      const ls = U.descendants(p, '*', 'lineSpacing').find(x => x.getAttribute('type') === 'PERCENT' && x.getAttribute('value') === '160');
      if (!ls) continue;
      if (al.getAttribute('horizontal') === 'CENTER' && center_pp === null) center_pp = p.getAttribute('id');
      if (al.getAttribute('horizontal') === 'JUSTIFY' && just_pp === null) just_pp = p.getAttribute('id');
    }
    let bf = null;
    for (const b of U.descendants(header, HH, 'borderFill')) {
      const all = Array.from(b.getElementsByTagName('*'));
      const n = all.filter(x => x.getAttribute('type') === 'SOLID' && x.getAttribute('width') === '0.12 mm').length;
      const face = all.some(x => x.hasAttribute('faceColor'));
      if (n >= 4 && !face) { bf = b.getAttribute('id'); break; }
    }
    return { body_cp, head_cp, center_pp, just_pp, bf, head_cp_added: added };
  };

  HW.make_table = function (doc, ts, newId, grid_twips, rows) {
    const ncols = Math.max(...rows.map(r => r.reduce((a, c) => a + c.colspan, 0)));
    const grid = grid_twips && grid_twips.length === ncols ? grid_twips : Array(ncols).fill(1);
    const tot = grid.reduce((a, b) => a + b, 0); const widths = grid.map(g => Math.round(HW.TABLE_WIDTH * g / tot));
    const tbl = U.mkel(doc, HP, 'hp:tbl', { id: String(newId), zOrder: '0', numberingType: 'TABLE', textWrap: 'TOP_AND_BOTTOM', textFlow: 'BOTH_SIDES', lock: '0',
      dropcapstyle: 'None', pageBreak: 'CELL', repeatHeader: '1', rowCnt: String(rows.length), colCnt: String(ncols), cellSpacing: '0', borderFillIDRef: ts.bf, noAdjust: '0' });
    U.sub(tbl, HP, 'hp:sz', { width: String(HW.TABLE_WIDTH), widthRelTo: 'ABSOLUTE', height: String(HW.TABLE_ROW_HEIGHT * rows.length), heightRelTo: 'ABSOLUTE', protect: '0' });
    U.sub(tbl, HP, 'hp:pos', { treatAsChar: '1', affectLSpacing: '0', flowWithText: '1', allowOverlap: '0', holdAnchorAndSO: '0', vertRelTo: 'PARA', horzRelTo: 'PARA', vertAlign: 'TOP', horzAlign: 'LEFT', vertOffset: '0', horzOffset: '0' });
    U.sub(tbl, HP, 'hp:outMargin', { left: '141', right: '141', top: '141', bottom: '141' });
    U.sub(tbl, HP, 'hp:inMargin', { left: '510', right: '510', top: '141', bottom: '141' });
    rows.forEach((row, ri) => {
      const tr = U.sub(tbl, HP, 'hp:tr'); let col = 0;
      row.forEach((c, ci) => {
        if (c.vmerge === 'continue') { col += c.colspan; return; }
        let rowspan = 1;
        if (c.vmerge === 'restart') {
          for (let rj = ri + 1; rj < rows.length; rj++) {
            const below = ci < rows[rj].length ? rows[rj][ci] : null;
            if (below && below.vmerge === 'continue') rowspan += 1; else break;
          }
        }
        const tc = U.sub(tr, HP, 'hp:tc', { name: '', header: '0', hasMargin: '0', protect: '0', editable: '0', dirty: '0', borderFillIDRef: ts.bf });
        const sub = U.sub(tc, HP, 'hp:subList', { id: '', textDirection: 'HORIZONTAL', lineWrap: 'BREAK', vertAlign: 'CENTER', linkListIDRef: '0', linkListNextIDRef: '0', textWidth: '0', textHeight: '0', hasTextRef: '0', hasNumRef: '0' });
        const lines = c.lines && c.lines.length ? c.lines : [''];
        const isHead = ri === 0;
        const short = Math.max(0, ...lines.map(l => HW.text_width(l))) <= HW.CENTER_MAX_WIDTH;
        const ppr = (isHead || short) ? ts.center_pp : ts.just_pp;
        const cpr = isHead ? ts.head_cp : ts.body_cp;
        for (const ln of lines) {
          const p = U.sub(sub, HP, 'hp:p', { id: '2147483648', paraPrIDRef: ppr, styleIDRef: '0', pageBreak: '0', columnBreak: '0', merged: '0' });
          const r = U.sub(p, HP, 'hp:run', { charPrIDRef: cpr });
          if (ln) { const t = U.sub(r, HP, 'hp:t'); t.appendChild(doc.createTextNode(ln)); }
        }
        U.sub(tc, HP, 'hp:cellAddr', { colAddr: String(col), rowAddr: String(ri) });
        U.sub(tc, HP, 'hp:cellSpan', { colSpan: String(c.colspan), rowSpan: String(rowspan) });
        const w = widths.slice(col, col + c.colspan).reduce((a, b) => a + b, 0);
        U.sub(tc, HP, 'hp:cellSz', { width: String(w), height: String(HW.TABLE_ROW_HEIGHT * rowspan) });
        U.sub(tc, HP, 'hp:cellMargin', { left: '510', right: '510', top: '141', bottom: '141' });
        col += c.colspan;
      });
    });
    return tbl;
  };
  HW.table_lines = function (rows) {
    let n = 0;
    for (const row of rows) n += Math.max(...row.map(c => c.lines.reduce((a, l) => a + est_lines(l), 0) || 1));
    return Math.ceil(n * 0.67) + 1;
  };
  function makeTablePara(doc, styles, tbl) {
    const p = U.mkel(doc, HP, 'hp:p', { id: '2147483648', paraPrIDRef: styles[3][0], styleIDRef: '0', pageBreak: '0', columnBreak: '0', merged: '0' });
    const r = U.sub(p, HP, 'hp:run', { charPrIDRef: styles[3][1] }); r.appendChild(tbl);
    return p;
  }

  // ---------- 양식 순회 ----------
  HW.iter_slots = function (root) {
    const out = []; let dept = null, prev_key = null;
    for (const tbl of allTbl(root)) {
      const trs = hp(tbl, 'tr'); if (trs.length !== 2) continue;
      const tcs = hp(trs[1], 'tc'); if (tcs.length !== 2) continue;
      const left = hp(hp1(tcs[0], 'subList'), 'p');
      const section = ptext(left[0]).replace(/ /g, '');
      const sub = hp1(tcs[1], 'subList');
      let heading = null, has_banner = false;
      for (const p of hp(sub, 'p')) {
        for (const banner of allTbl(p)) {
          const bt = U.descendants(banner, HP, 'p').map(ptext).join('').trim();
          if (bt && banner.getAttribute('rowCnt') === '1' && banner.getAttribute('colCnt') === '1') { dept = bt; has_banner = true; }
        }
        const t = ptext(p);
        if (PUA.test(t) && heading === null) heading = p;
      }
      const cat = heading ? ptext(heading).trim() : null;
      const sec = { '실적': '금주실적', '계획': '차주계획' }[section] || null;
      const cont = heading === null && !has_banner && sec !== null && prev_key !== null && prev_key[0] === sec;
      const key = cont ? prev_key : ((sec && cat) ? [sec, HW.norm_key(dept), HW.norm_key(cat)] : null);
      out.push({ section, sec, dept, category: cat, key, continuation: cont, left_paras: left, sub, heading, tbl, cell: tcs[1] });
      if (key) prev_key = key;
    }
    return out;
  };
  const K = key => key.join('/');
  const bannerText = b => U.descendants(b, HP, 'p').map(ptext).join('').trim();
  const isBannerTbl = b => b.getAttribute('rowCnt') === '1' && b.getAttribute('colCnt') === '1';
  /** sub 안에서 이름이 name인 배너 문단 */
  function findBannerPara(sub, name) {
    for (const p of hp(sub, 'p')) for (const b of allTbl(p)) if (isBannerTbl(b) && HW.norm_key(bannerText(b)) === HW.norm_key(name)) return p;
    return null;
  }
  /** 양식이 받을 수 있는 키 목록과 본부 배너 유무: {keys:Set('구역/부서/분류'), hq:{금주실적:bool, 차주계획:bool, 월간계획:bool}} */
  HW.template_keys = function (sectionXml) {
    const root = U.parseXml(sectionXml).documentElement; const keys = new Set(); const hq = {};
    for (const s of HW.iter_slots(root)) {
      if (s.section === '월간') {
        for (const p of hp(s.sub, 'p')) for (const b of allTbl(p)) if (isBannerTbl(b)) keys.add(K(['월간계획', HW.norm_key(bannerText(b)), HW.norm_key('월간계획')]));
        if (findBannerPara(s.sub, HW.HQ.banner)) hq['월간계획'] = true;
        continue;
      }
      if (s.key && !s.continuation) keys.add(K(s.key));
      if (s.sec && !hq[s.sec] && findBannerPara(s.sub, HW.HQ.banner)) hq[s.sec] = true;
    }
    return { keys, hq };
  };
  function fmtRange(r) { const a = U.ymd(r[0]), b = U.ymd(r[1]); return [`(${U.pad(a.m)}.${U.pad(a.d)}~`, `${U.pad(b.m)}.${U.pad(b.d)})`]; }
  function cellCapacityLines(slot) {
    const h = parseInt(hp1(slot.cell, 'cellSz').getAttribute('height'), 10);
    const cap = Math.round(h / HW.LINE_PITCH);
    let used = 0; const kids = U.children(slot.sub);
    for (const p of hp(slot.sub, 'p')) {
      if (p === slot.heading) { used += 1; continue; }
      const inner = allTbl(p);
      if (inner.length) { for (const t of inner) used += parseInt(t.getAttribute('rowCnt'), 10) * 1.3 + 0.7; }
      else if (slot.heading !== null && kids.indexOf(p) < kids.indexOf(slot.heading)) used += ptext(p).trim() ? est_lines(ptext(p)) : 1;
    }
    return Math.trunc(cap - used);
  }
  function cloneTableForContinuation(slot, newId) {
    const tbl = slot.tbl.cloneNode(true); tbl.setAttribute('id', String(newId));
    const tcs = hp(hp(tbl, 'tr')[1], 'tc'); const sub = hp1(tcs[1], 'subList');
    U.removeAll(sub);
    return [tbl, sub];
  }

  // ---------- fill ----------
  /** sectionXml/headerXml: 문자열. 반환 {log, sectionXml, headerXml(변경 시)} */
  HW.fill_hwpx = function (sectionXml, headerXml, report_date, items, this_week, next_week, income, opts) {
    opts = Object.assign({ renumber: true, blank_between_items: true, paginate: true }, opts || {});
    const doc = U.parseXml(sectionXml); const root = doc.documentElement;
    const hdoc = U.parseXml(headerXml); const header = hdoc.documentElement;
    const [styles, style_src] = HW.resolve_styles(header);
    const ts = HW.resolve_table_styles(header);
    const rd = U.ymd(report_date);
    const log = { filled: 0, unmatched: [], slots_filled: {}, renumbered: [], date_set: null, ranges_set: 0, income_set: [],
      styles, style_source: style_src, pages_added: {}, items_split_across_pages: [], page_lines: {}, tables_inserted: [], table_style: ts };
    let max_tbl_id = Math.max(...allTbl(root).map(t => parseInt(t.getAttribute('id'), 10)));

    // 1. 표지 날짜
    for (const p of U.descendants(root, HP, 'p')) {
      const t = ptext(p);
      if (/^\s*\d{4}\. \d{2}\. \d{2}\.\([월화수목금토일]\)\s*$/.test(t)) {
        const neu = `${rd.y}. ${U.pad(rd.m)}. ${U.pad(rd.d)}.(${WD[U.weekday(report_date)]})`;
        setText(p, neu); log.date_set = neu; break;
      }
    }
    // 2. (구역, 부서, 분류) 그룹
    const groups = new Map();
    for (const it of items) {
      const key = K([it.section, HW.norm_key(it.dept), HW.norm_key(it.category)]);
      if (!groups.has(key)) groups.set(key, []); groups.get(key).push(it);
    }
    function buildGroups(its) {
      const out = []; let n1 = 0, cur = null;
      for (const it of its) {
        if (it.kind === 'table') {
          if (cur === null) { cur = { lines: [], nlines: 0 }; out.push(cur); }
          cur.lines.push(['table', it]); cur.nlines += HW.table_lines(it.rows); continue;
        }
        const lvl = [1, 2, 3].includes(it.level) ? it.level : 3;
        let body = it.text.trim();
        if (lvl === 1 && opts.renumber) {
          n1 += 1; const nb = body.replace(/^\d+\s*[.．]\s*/u, `${n1}. `);
          if (nb !== body) log.renumbered.push([it.para_id, body.slice(0, 20), nb.slice(0, 20)]);
          body = nb;
        }
        if (it.auto_bullet && !/^[-–—·•]/.test(body)) body = '- ' + body;
        const text = HW.LEVEL_INDENT[lvl] + body;
        if (lvl === 1 || cur === null) { cur = { lines: [], nlines: 0 }; out.push(cur); }
        cur.lines.push([lvl, text]); cur.nlines += est_lines(text);
      }
      return out;
    }
    function emit(sub, insertAt, pageGroups) {
      let n = 0;
      pageGroups.forEach((g, gi) => {
        if (gi > 0 && opts.blank_between_items) { U.insertAt(sub, insertAt, makePara(doc, styles, 1, '')); insertAt += 1; }
        for (const [lvl, text] of g.lines) {
          if (lvl === 'table') {
            max_tbl_id += 1;
            const tbl = HW.make_table(doc, ts, max_tbl_id, text.grid_twips, text.rows);
            U.insertAt(sub, insertAt, makeTablePara(doc, styles, tbl)); insertAt += 1;
            log.tables_inserted.push({ table_id: text.table_id, hwpx_tbl_id: max_tbl_id, rows: text.rows.length, cols: parseInt(tbl.getAttribute('colCnt'), 10) });
            continue;
          }
          U.insertAt(sub, insertAt, makePara(doc, styles, lvl, text)); insertAt += 1; n += 1;
        }
      });
      return [insertAt, n];
    }
    const matched = new Set();
    const slots = HW.iter_slots(root);
    // 2b. 본부 칸: key가 (구역, 본부배너, 본부)인 그룹은 그 구역 첫 쪽의 본부 배너 바로 아래에 넣는다(실적·계획)
    for (const sec of ['금주실적', '차주계획']) {
      const key = K([sec, HW.norm_key(HW.HQ.banner), HW.norm_key(HW.HQ.category)]);
      const its = groups.get(key); if (!its) continue;
      let target = null, bp = null;
      for (const s of slots) { if (s.sec !== sec) continue; bp = findBannerPara(s.sub, HW.HQ.banner); if (bp) { target = s; break; } }
      if (!bp) continue;
      let kids = U.children(target.sub); let idx = kids.indexOf(bp) + 1;
      while (idx < kids.length && kids[idx].localName === 'p' && !ptext(kids[idx]).trim() && !allTbl(kids[idx]).length) { target.sub.removeChild(kids[idx]); kids = U.children(target.sub); }
      const [at, n] = emit(target.sub, U.indexOf(target.sub, bp) + 1, buildGroups(its));
      U.insertAt(target.sub, at, makePara(doc, styles, 1, ''));   // 다음 배너와 띄움
      log.filled += n; matched.add(key); log.slots_filled[`${sec}/${HW.HQ.banner}`] = its.length;
      log.hq_filled = log.hq_filled || {}; log.hq_filled[sec] = its.length;
    }
    for (const slot of slots) {
      const sec = slot.sec;
      const rng = sec === '금주실적' ? this_week : (sec === '차주계획' ? next_week : null);
      if (rng) {
        const [a, b] = fmtRange(rng);
        for (const p of slot.left_paras.slice(1)) {
          const t = ptext(p).trim();
          if (/^\(\d{2}\.\d{2}~$/.test(t) || t === '(00.00~') { setText(p, a); log.ranges_set += 1; }
          else if (/^\d{2}\.\d{2}\)$/.test(t) || t === '00.00)') { setText(p, b); log.ranges_set += 1; }
        }
      }
      if (slot.heading === null || sec === null || slot.continuation) continue;
      const its = groups.get(K(slot.key)); if (!its) continue;
      matched.add(K(slot.key));
      const sub = slot.sub, heading = slot.heading;
      const ps = hp(sub, 'p');
      for (const p of ps.slice(ps.indexOf(heading) + 1)) if (!ptext(p).trim()) sub.removeChild(p);
      const cap_first = cellCapacityLines(slot);
      const cap_full = Math.round(parseInt(hp1(slot.cell, 'cellSz').getAttribute('height'), 10) / HW.LINE_PITCH);
      const grps = buildGroups(its);
      const pages = [[]], used = [0]; let cap = cap_first;
      for (const g of grps) {
        let need = g.nlines + (pages[pages.length - 1].length && opts.blank_between_items ? 1 : 0);
        if (opts.paginate && pages[pages.length - 1].length && used[used.length - 1] + need > cap) { pages.push([]); used.push(0); cap = cap_full; need = g.nlines; }
        if (opts.paginate && !pages[pages.length - 1].length && g.nlines > cap)
          log.items_split_across_pages.push({ slot: `${sec}/${slot.dept}/${slot.category}`, item: String(g.lines[0][1]).slice(0, 30), lines: g.nlines });
        pages[pages.length - 1].push(g); used[used.length - 1] += need;
      }
      const slotName = `${sec}/${slot.dept}/${slot.category}`;
      log.page_lines[slotName] = used;
      let insertAt = U.indexOf(sub, heading) + 1;
      let n; [insertAt, n] = emit(sub, insertAt, pages[0]); log.filled += n;
      let prev = slot.tbl;
      for (const pg of pages.slice(1)) {
        max_tbl_id += 1;
        const [ntbl, nsub] = cloneTableForContinuation(slot, max_tbl_id);
        U.insertAfter(prev, ntbl); prev = ntbl;
        [, n] = emit(nsub, 0, pg); log.filled += n;
      }
      if (pages.length > 1) log.pages_added[slotName] = pages.length - 1;
      log.slots_filled[slotName] = its.length;
    }
    // 3b. 월간 계획 칸
    for (const slot of slots) {
      if (slot.section !== '월간') continue;
      const sub = slot.sub; const paras = hp(sub, 'p');
      for (const p of paras) { const t = ptext(p); if (t.includes('00월')) { setText(p, t.replace('00월', `${U.pad(rd.m)}월`)); log.monthly_title = ptext(p); } }
      const banners = [];
      for (const p of paras) for (const b of allTbl(p)) if (b.getAttribute('rowCnt') === '1' && b.getAttribute('colCnt') === '1')
        banners.push([p, U.descendants(b, HP, 'p').map(ptext).join('').trim()]);
      for (const [bp, dept] of banners) {
        const key = K(['월간계획', HW.norm_key(dept), HW.norm_key('월간계획')]);
        const its = groups.get(key); if (!its) continue;
        matched.add(key);
        let kids = U.children(sub); let idx = kids.indexOf(bp) + 1;
        while (idx < kids.length && kids[idx].namespaceURI === HP && kids[idx].localName === 'p' && !ptext(kids[idx]).trim() && !allTbl(kids[idx]).length) {
          sub.removeChild(kids[idx]); kids = U.children(sub);
        }
        const grps = buildGroups(its);
        const [, n] = emit(sub, U.indexOf(sub, bp) + 1, grps);
        log.filled += n; log.slots_filled[`월간계획/${dept}`] = its.length;
      }
    }
    for (const [key, its] of groups) if (!matched.has(key)) {
      log.unmatched.push({ section: key.split('/')[0], dept: its[0].dept, category: its[0].category, count: its.length, para_ids: its.map(i => i.para_id) });
    }
    // 4. 수입실적
    if (income) {
      for (const tbl of allTbl(root)) {
        if (tbl.getAttribute('rowCnt') === '4' && tbl.getAttribute('colCnt') === '2') {
          for (const tr of hp(tbl, 'tr')) {
            const tcs = hp(tr, 'tc');
            const label = ptext(hp(hp1(tcs[0], 'subList'), 'p')[0]).replace(/ /g, '');
            for (const k of Object.keys(income)) if (k.replace(/ /g, '') === label) {
              const p = hp(hp1(tcs[1], 'subList'), 'p')[0]; setText(p, income[k]); log.income_set.push([k, income[k]]);
            }
          }
        }
      }
    }
    return { log, sectionXml: U.serializeXml(root), headerXml: ts.head_cp_added ? U.serializeXml(header) : null };
  };

  // ---------- verify ----------
  HW.verify_hwpx = function (sectionXml, headerXml, expected_items, renumber) {
    if (renumber === undefined) renumber = true;
    const root = U.parseXml(sectionXml).documentElement, header = U.parseXml(headerXml).documentElement;
    const [styles, style_src] = HW.resolve_styles(header);
    const cp = {}; for (const c of U.descendants(header, HH, 'charPr')) cp[c.getAttribute('id')] = c;
    const cpSig = cid => { const c = cp[cid]; const sp = hh1(c, 'spacing'), ra = hh1(c, 'ratio'); return [c.getAttribute('height'), sp.getAttribute('hangul'), ra.getAttribute('hangul'), hh1(c, 'bold') !== null]; };
    const base = {}; for (const l of Object.keys(styles)) base[l] = cpSig(styles[l][1]);
    const pairToLevel = {}; for (const l of Object.keys(styles)) pairToLevel[styles[l].join('|')] = l;
    const isBanner = b => b.getAttribute('rowCnt') === '1' && b.getAttribute('colCnt') === '1';
    const tableRows = tb => hp(tb, 'tr').map(tr => hp(tr, 'tc').map(tc => hp(hp1(tc, 'subList'), 'p').map(ptext)));
    const got = new Map(), violations = [], page_lines = {};
    const push = (key, v) => { if (!got.has(key)) got.set(key, []); got.get(key).push(v); };
    const styleCheck = (p, t, where) => {
      const ppr = p.getAttribute('paraPrIDRef'); const cps = Array.from(new Set(hp(p, 'run').map(r => r.getAttribute('charPrIDRef')))).sort();
      if (cps.length !== 1 || pairToLevel[ppr + '|' + cps[0]] === undefined) violations.push(Object.assign({ text: t.slice(0, 30), paraPrIDRef: ppr, charPrIDRef: cps }, where));
    };
    for (const slot of HW.iter_slots(root)) {
      if (slot.section === '월간') {
        let dept = null;
        for (const p of hp(slot.sub, 'p')) {
          const bs = allTbl(p).filter(isBanner);
          if (bs.length) { dept = U.descendants(bs[0], HP, 'p').map(ptext).join('').trim(); continue; }
          const inner = allTbl(p).filter(tb => !isBanner(tb));
          if (inner.length && dept) { for (const tb of inner) push(K(['월간계획', HW.norm_key(dept), HW.norm_key('월간계획')]), ['table', tableRows(tb)]); continue; }
          const t = ptext(p);
          if (dept && t.trim() && !t.includes('주요월간계획')) { push(K(['월간계획', HW.norm_key(dept), HW.norm_key('월간계획')]), t); styleCheck(p, t, { slot: ['월간계획', dept] }); }
        }
        continue;
      }
      if (slot.key === null || slot.sec === null) continue;
      const paras = hp(slot.sub, 'p');
      const after = slot.heading !== null ? paras.slice(paras.indexOf(slot.heading) + 1) : paras;
      const key = K(slot.key); if (!got.has(key)) got.set(key, []);
      let n_lines = 0;
      // 본부 배너 아래(제목 앞) 문단
      if (slot.heading !== null) {
        let inHq = false; const hqKey = K([slot.sec, HW.norm_key(HW.HQ.banner), HW.norm_key(HW.HQ.category)]);
        for (const p of paras.slice(0, paras.indexOf(slot.heading))) {
          const bs = allTbl(p).filter(isBanner);
          if (bs.length) { inHq = HW.norm_key(bannerText(bs[0])) === HW.norm_key(HW.HQ.banner); continue; }
          if (!inHq || allTbl(p).length) continue;
          const t = ptext(p); if (!t.trim()) { n_lines += 1; continue; }
          push(hqKey, t); n_lines += est_lines(t); styleCheck(p, t, { slot: [slot.sec, HW.HQ.banner] });
        }
      }
      after.forEach((p, i) => {
        const inner = allTbl(p).filter(tb => !isBanner(tb));
        if (inner.length) { for (const tb of inner) { const tr = tableRows(tb); push(key, ['table', tr]); n_lines += Math.ceil(tr.length * 0.67) + 1; } return; }
        const t = ptext(p);
        if (!t.trim()) { n_lines += 1; return; }
        push(key, t); n_lines += est_lines(t);
        styleCheck(p, t, { slot: slot.key, para_index: i });
      });
      (page_lines[key] = page_lines[key] || []).push(n_lines);
    }
    const exp = new Map();
    for (const it of expected_items) { const key = K([it.section, HW.norm_key(it.dept), HW.norm_key(it.category)]); if (!exp.has(key)) exp.set(key, []); exp.get(key).push(it); }
    const text_diff = [];
    const H = x => Array.isArray(x) ? JSON.stringify(x) : x;
    for (const [key, its] of exp) {
      const g = got.get(key);
      if (g === undefined) { text_diff.push({ slot: key, issue: '양식에 칸 없음(unmatched)', count: its.length }); continue; }
      const expLines = []; let n1 = 0;
      for (const it of its) {
        if (it.kind === 'table') { expLines.push(['table', it.rows.map(row => row.filter(c => c.vmerge !== 'continue').map(c => c.lines.map(U.normWs)))]); continue; }
        let b = it.text.trim();
        if (it.level === 1 && renumber) { n1 += 1; b = b.replace(/^\d+\s*[.．]\s*/u, `${n1}. `); }
        if (it.auto_bullet && !/^[-–—·•]/.test(b)) b = '- ' + b;
        expLines.push(U.normWs(b));
      }
      const gotLines = g.map(x => Array.isArray(x) ? ['table', x[1].map(row => row.map(c => c.filter(l => l.trim()).map(U.normWs)))] : U.normWs(x));
      const a = expLines.map(H), b = gotLines.map(H);
      if (a.length !== b.length || a.some((x, i) => x !== b[i])) {
        for (const o of U.opcodes(a, b)) if (o.op !== 'equal') text_diff.push({ slot: key, op: o.op, expected: a.slice(o.i1, o.i2), got: b.slice(o.j1, o.j2) });
      }
    }
    const cap_full = 30; const over = {};
    for (const k of Object.keys(page_lines)) if (page_lines[k].some(x => x > cap_full)) over[k] = page_lines[k];
    const total_pages = Object.values(page_lines).reduce((a, v) => a + v.length, 0);
    return { text_diff, style_uniform: violations.length === 0, style_violations: violations, styles, style_source: style_src, base_charPr: base,
      page_lines, body_pages: total_pages, overflow_risk: Object.keys(over).length ? 'high' : 'low', over_capacity_pages: over };
  };

  WBR.hwpx_tools = HW;
})(globalThis.WBR = globalThis.WBR || {});
