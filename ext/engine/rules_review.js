/* 규칙 기반 검토 — AI 없이 코드만으로 판정 가능한 것. (Python rules_review.py 포팅)
   각 항목: {level:'오류|경고|참고', where, para_id, red, text, what} */
(function (WBR) {
  'use strict';
  const U = WBR.util;
  const PAIRS = [['(', ')'], ['[', ']'], ['“', '”'], ['「', '」'], ['《', '》'], ['{', '}']];
  const count = (s, ch) => s.split(ch).length - 1;
  const where = p => `${p.section || ''}/${p.dept || ''}/${p.category || ''}`;

  function rule_review(report, dates, fill, ver, items, st) {
    const C = [];
    const P = report.paragraphs; const pm = {}; for (const p of P) pm[p.para_id] = p;
    const red = new Set(P.filter(p => p.is_red).map(p => p.para_id));
    const tw = dates.this_week, nw = dates.next_week;
    const add = (level, p, what, text) => C.push({ level, where: where(p), para_id: p.para_id, red: red.has(p.para_id),
      text: (text || p.text).trim().replace(/ /g, ' ').slice(0, 80), what });

    // 1. 날짜-요일, 기간 역전, 구역 밖 날짜, 공휴일
    for (const d of dates.dates) {
      const p = pm[d.para_id];
      if (d.weekday_match === false) add('오류', p, `'${d.raw}': ${d.resolved}은 ${d.actual_weekday}요일인데 (${d.written_weekday})로 적힘. 날짜 또는 요일 확인.`, d.raw);
      if (d.end_weekday_match === false) add('오류', p, `'${d.raw}': 종료일 ${d.range_end}은 ${d.end_actual_weekday}요일인데 (${d.end_written_weekday})로 적힘.`, d.raw);
      if (d.range_valid === false) add('오류', p, `'${d.raw}': 시작일이 종료일보다 늦음(기간 역전).`, d.raw);
      if (d.section === '금주실적' && !d.is_range && d.year_assumed !== false) {
        if (d.resolved > tw[1] && !p.text.includes('예정') && /(완료|개최|송부|제출|수행|실시|참석)/.test(p.text))
          add('경고', p, `'${d.raw}'는 금주 실적 범위(${tw[0]}~${tw[1]}) 이후인데 완료형으로 적힘. 차주 계획으로 옮기거나 '예정' 표기 확인.`, d.raw);
      }
      if (d.section === '차주계획' && !d.is_range) {
        if (d.resolved < nw[0] && tw[0] <= d.resolved) add('경고', p, `'${d.raw}'는 금주 실적 범위의 날짜인데 차주 계획에 있음. 구역 확인.`, d.raw);
      }
      if (d.holiday && !d.is_range && (d.section === '금주실적' || d.section === '차주계획'))
        add('경고', p, `'${d.raw}'(${d.resolved})는 공휴일(${d.holiday})임. 일정 확인.`, d.raw);
    }
    // 2. 상대 표현
    const seen = new Set();
    for (const u of dates.unresolved || []) {
      const i = u.indexOf(': '); const pid = u.slice(0, i), raw = u.slice(i + 2);
      if (pm[pid] && !seen.has(pid) && ['차주계획', '월간계획'].includes(pm[pid].section) && red.has(pid)) { seen.add(pid); add('참고', pm[pid], `상대 날짜 표현 ${raw} — 임원용에 그대로 들어감.`, raw); }
    }
    // 3. 번호 중복·건너뜀
    const groups = new Map();
    for (const p of P) {
      if (p.level === 1 && ['금주실적', '차주계획', '월간계획'].includes(p.section) && !p.in_nested_table && p.text.trim()) {
        const m = p.text.match(/^\s*(\d+)\s*[.．]/u);
        if (m) { const k = `${p.section}|${p.dept}|${p.category}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push([parseInt(m[1], 10), p]); }
      }
    }
    for (const lst of groups.values()) {
      const nums = lst.map(x => x[0]);
      if (nums.some((n, i) => n !== i + 1)) {
        let dup = false;
        for (const [n, p] of lst) if (nums.filter(x => x === n).length > 1) { add('참고', p, `항목 번호 ${n}이 같은 분류에 중복됨(임원용은 1부터 재부여하므로 결과에는 영향 없음).`); dup = true; break; }
        if (!dup) add('참고', lst[0][1], `항목 번호가 순서대로가 아님: [${nums.join(', ')}] (임원용은 재부여).`);
      }
    }
    // 4. 괄호·따옴표 짝 (빨간색 문단만)
    for (const p of P) {
      if (!red.has(p.para_id) || !p.text.trim() || p.in_nested_table) continue;
      const t = p.text.replace(/^\s*[가-힣\d]\)/u, ' ');
      for (const [a, b] of PAIRS) if (count(t, a) !== count(t, b)) { add('경고', p, `괄호/따옴표 짝이 맞지 않음: '${a}' ${count(t, a)}개, '${b}' ${count(t, b)}개.`); break; }
      if (t.includes('）') || t.includes('（')) add('참고', p, '전각 괄호(（ ）)가 섞여 있음.');
      if (/^[ㅇ○]\S/u.test(p.text.trim())) add('참고', p, '글머리 기호 뒤 공백 없음.');
      if (/\S {4,}\S/u.test(t)) add('경고', p, '문단 안에 긴 공백(4칸 이상)이 있음 — 두 항목이 한 줄에 붙었거나 정렬용 공백. 임원용에서 줄이 잘릴 수 있음.');
    }
    // 5. 제목 검정 + 본문 빨강
    for (const p of P) {
      if (p.level === 1 && ['금주실적', '차주계획', '월간계획'].includes(p.section) && !p.in_nested_table && p.text.trim() && !red.has(p.para_id)) {
        const kids = P.filter(q => q.item_id === p.para_id && q.para_id !== p.para_id && q.is_red);
        if (kids.length) add('경고', p, `항목 제목은 검정인데 본문 ${kids.length}행이 빨간색 → 임원용에 제목 없이 들어감. 제목도 빨간색으로 지정할지 확인.`);
      }
    }
    // 6. 빨간 항목 안의 검정 표 / 일부만 빨간 표
    for (const t of report.nested_tables || []) {
      const anchor = pm[t.anchor_para_id];
      if (anchor && anchor.is_red && !t.is_red) add('참고', anchor, `이 항목의 표(${t.n_rows}×${t.n_cols})는 검정이라 임원용에서 빠짐. 포함하려면 표를 빨간색으로.`);
      else if (t.is_red === false && t.red_ratio > 0 && t.red_ratio < 1)
        add('경고', anchor || { para_id: t.table_id, text: t.table_id, section: t.section, dept: t.dept, category: t.category },
          `표(${t.n_rows}×${t.n_cols})의 셀 일부만 빨간색(${Math.round(t.red_ratio * 100)}%) → 전체를 넣지 않음. 전부 빨간색으로 하거나 제외.`);
    }
    // 7. 칸 없는 부서
    for (const u of fill.unmatched || [])
      add('경고', { para_id: u.para_ids[0], text: `${u.dept} ${u.category} ${u.count}행`, section: u.section, dept: u.dept, category: u.category },
        "양식에 칸이 없는 부서·분류의 빨간색 내용 — 임원용에 넣지 않았음. settings.json '칸없는_부서_처리'에 배치 칸을 적으면 자동으로 들어감.");
    // 7b. 본부 배너 아래로 옮긴 항목
    for (const m of fill.hq_moved || [])
      C.push({ level: m.dept_has_slot ? '경고' : '참고', where: m.from, para_id: '', red: true, text: `${m.count}행`,
        what: m.dept_has_slot ? `${m.dept}은 다른 구역에는 칸이 있는데 ${m.section}에는 없어 '연구본부' 제목 아래에 넣었음. 양식에 ${m.section} 칸을 추가할지 확인.`
          : `양식에 칸이 없어 ${m.section}의 '연구본부' 제목 아래에 번호를 이어 넣었음.` });
    // 8. 쪽 넘침
    for (const x of fill.items_split_across_pages || [])
      C.push({ level: '참고', where: x.slot, para_id: '', red: true, text: x.item.trim().slice(0, 60), what: `항목 하나가 약 ${x.lines}행으로 한 쪽(30행) 이상 — 한글에서 셀 넘침 확인.` });
    for (const k of fill.first_page_moved || [])
      C.push({ level: '참고', where: k, para_id: '', red: true, text: '', what: '첫 쪽이 앞 내용(수입실적·연구본부 항목)으로 차서 부서 배너·분류 제목째 다음 쪽으로 넘김. 한글에서 첫 쪽 여백 확인.' });
    for (const k of Object.keys(fill.pages_added || {}))
      C.push({ level: '참고', where: k, para_id: '', red: true, text: '', what: `분량이 많아 ${fill.pages_added[k]}쪽 추가(표 복제). 한글에서 쪽 나뉨 확인.` });
    // 9. 빨간색 없는 부서
    const depts = new Map();
    for (const p of P) if (['금주실적', '차주계획'].includes(p.section) && p.dept && p.level === 1 && !p.in_nested_table) {
      const k = `${p.section}|${p.dept}`; if (!depts.has(k)) depts.set(k, []); depts.get(k).push(p.is_red);
    }
    for (const [k, flags] of depts) {
      const [sec, dept] = k.split('|');
      if (flags.length && !flags.some(Boolean) && dept !== '연구지원팀')
        C.push({ level: '참고', where: `${sec}/${dept}`, para_id: '', red: false, text: '', what: `${sec} ${dept}에 빨간색 항목이 없음(항목 ${flags.length}건).` });
    }
    const order = { '오류': 0, '경고': 1, '참고': 2 };
    C.sort((a, b) => (order[a.level] - order[b.level]) || ((a.red ? 0 : 1) - (b.red ? 0 : 1)) || (a.para_id < b.para_id ? -1 : a.para_id > b.para_id ? 1 : 0));
    return C;
  }
  WBR.rules_review = { rule_review };
})(globalThis.WBR = globalThis.WBR || {});
