/* compute_date_facts: 문단 텍스트의 날짜 표현 → 실제 요일·구역 포함 여부. (Python compute_date_facts.py 포팅) */
(function (WBR) {
  'use strict';
  const U = WBR.util, WD = U.WD;
  const DF = { HOLIDAYS: {} };

  const RELATIVE_WORDS = ['내주 초', '내주초', '내주', '차주', '금주', '익일', '월말', '월초', '중순', '상반기', '하반기', '연말',
    '이번 주', '다음 주', '다음주', '이번주', '9월 중', '10월 중', '11월 중', '12월 중', '9월 초', '9월 말', '10월 초', '10월 말',
    '금일', '명일', '내일', '조만간', '추후', '연내', '첫째 주', '둘째 주', '셋째 주', '넷째 주', '마지막 주'];

  // 2자리 연도는 어포스트로피가 있거나 20~99일 때만 연도로 본다('09.07'은 월.일).
  const D = n => `(?<![\\d.])(?<y${n}>(?:\\d{4}|'\\d{2}|[2-9]\\d)\\s*[.년\\-/]\\s*)?(?<m${n}>\\d{1,2})\\s*[.월\\-/]\\s*(?<d${n}>\\d{1,2})(?![.\\d]\\d)(?![A-Za-z])\\s*일?\\s*(?:\\((?<w${n}>[월화수목금토일])\\))?`;
  const DATE_RE = new RegExp(D('1') + '(?:\\s*[~∼\\-–]\\s*(?:' + D('2') + '|(?<d2only>\\d{1,2})\\s*일?\\s*(?:\\((?<w2only>[월화수목금토일])\\))?))?', 'gu');
  const MONTH_RE = /(?:'?\d{2,4}\s*[.년]\s*)?\d{1,2}\s*월\s*(?:초|중순|말|중)(?![\p{L}\p{N}_])/gu;

  function parseYear(s) {
    if (!s) return null;
    s = s.trim().replace(/^'/, '').replace(/[.년\-/ ]+$/, '').trim();
    return s.length === 2 ? 2000 + parseInt(s, 10) : parseInt(s, 10);
  }
  function resolve(y, m, d, ref) {
    const years = y ? [y] : [U.ymd(ref).y - 1, U.ymd(ref).y, U.ymd(ref).y + 1];
    let best = null, bestD = Infinity;
    for (const yy of years) {
      const iso = U.isoOf(yy, m, d); if (!iso) continue;
      const diff = Math.abs(U.days(iso) - U.days(ref));
      if (diff < bestD) { best = iso; bestD = diff; }
    }
    return best;
  }
  function weekOf(iso) { const mon = U.addDays(iso, -U.weekday(iso)); return [mon, U.addDays(mon, 6)]; }
  function parseHeadingRange(text, ref) {
    const m = (text || '').match(/(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*[~∼\-–]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/);
    if (!m) return null;
    const a = resolve(null, +m[1], +m[2], ref), b = resolve(null, +m[3], +m[4], ref);
    return a && b ? [a, b] : null;
  }
  const rel = (a, b) => a === b ? 'same' : (a < b ? 'past' : 'future');
  const between = (x, r) => r[0] <= x && x <= r[1];

  DF.compute = function (paragraphs, report_date, section_headings) {
    const ref = report_date;
    let this_week = null, next_week = null; const heading_src = {};
    if (section_headings) {
      let r = parseHeadingRange(section_headings['금주실적'] || '', ref);
      if (r) { this_week = r; heading_src.this_week = section_headings['금주실적']; }
      r = parseHeadingRange(section_headings['차주계획'] || '', ref);
      if (r) { next_week = r; heading_src.next_week = section_headings['차주계획']; }
    }
    if (!this_week) { this_week = weekOf(U.addDays(ref, -7)); heading_src.this_week = 'computed: report_date 직전 주(월~일)'; }
    if (!next_week) { next_week = weekOf(ref); heading_src.next_week = 'computed: report_date 포함 주(월~일)'; }
    const tw = this_week, nw = next_week;
    const dates = [], unresolved = new Set();
    for (const p of paragraphs) {
      const text = p.text;
      if (!text.trim()) continue;
      DATE_RE.lastIndex = 0; let m;
      while ((m = DATE_RE.exec(text)) !== null) {
        if (m[0] === '') { DATE_RE.lastIndex++; continue; }
        const g = m.groups, raw = m[0].trim();
        const pre = text.slice(Math.max(0, m.index - 1), m.index), post = text.slice(m.index + m[0].length, m.index + m[0].length + 1);
        if (/^\d$/.test(pre) || ['억', '%', '천', '만'].includes(post)) continue;
        const mo = +g.m1, da = +g.d1;
        if (!(mo >= 1 && mo <= 12 && da >= 1 && da <= 31)) continue;
        const y1 = parseYear(g.y1);
        const d1 = resolve(y1, mo, da, ref);
        if (!d1) { unresolved.add(`${p.para_id}: '${raw}' (존재하지 않는 날짜)`); continue; }
        const rec = {
          para_id: p.para_id, section: p.section, dept: p.dept, raw, resolved: d1, actual_weekday: WD[U.weekday(d1)],
          written_weekday: g.w1 || null, weekday_match: null, in_this_week: between(d1, tw), in_next_week: between(d1, nw),
          is_range: false, range_end: null, range_valid: null, relative_to_report: rel(d1, ref),
          holiday: DF.HOLIDAYS[d1] || null, year_assumed: y1 === null,
        };
        if (g.w1) rec.weekday_match = g.w1 === WD[U.weekday(d1)];
        let d2 = null, w2 = null;
        if (g.m2 && g.d2) {
          const y2 = parseYear(g.y2) || (y1 || null);
          d2 = resolve(y2, +g.m2, +g.d2, d1); w2 = g.w2 || null;
        } else if (g.d2only) {
          d2 = resolve(U.ymd(d1).y, mo, +g.d2only, d1); w2 = g.w2only || null;
        }
        if (d2) {
          rec.is_range = true; rec.range_end = d2; rec.range_valid = d2 >= d1;
          rec.end_actual_weekday = WD[U.weekday(d2)]; rec.end_written_weekday = w2;
          rec.end_weekday_match = w2 ? w2 === WD[U.weekday(d2)] : null;
          rec.end_in_this_week = between(d2, tw); rec.end_in_next_week = between(d2, nw);
          rec.end_relative_to_report = rel(d2, ref);
        }
        dates.push(rec);
      }
      MONTH_RE.lastIndex = 0; let mm;
      while ((mm = MONTH_RE.exec(text)) !== null) unresolved.add(`${p.para_id}: '${mm[0]}'`);
      for (const w of RELATIVE_WORDS) if (text.includes(w)) unresolved.add(`${p.para_id}: '${w}'`);
    }
    const hol = {};
    for (const k of Object.keys(DF.HOLIDAYS)) if (tw[0] <= k && k <= U.addDays(nw[1], 14)) hol[k] = DF.HOLIDAYS[k];
    return { report_date, report_weekday: WD[U.weekday(ref)], this_week, next_week, range_source: heading_src, dates,
      unresolved: Array.from(unresolved).sort(), holidays_in_range: hol };
  };

  WBR.date_facts = DF;
})(globalThis.WBR = globalThis.WBR || {});
