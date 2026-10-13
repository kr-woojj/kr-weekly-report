/* 변환 결과 보고서(HTML 한 장). (Python report_html.py 포팅) */
(function (WBR) {
  'use strict';
  const U = WBR.util, e = U.escapeHtml;
  const CSS = `body{font-family:'Malgun Gothic',sans-serif;max-width:960px;margin:24px auto;padding:0 16px;color:#222}
h1{font-size:20px;margin:0 0 4px} .sub{color:#666;margin-bottom:16px} h2{font-size:16px;margin:22px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
table{border-collapse:collapse;width:100%;font-size:13px} th,td{border:1px solid #ddd;padding:5px 7px;text-align:left;vertical-align:top}
th{background:#f4f4f4} .lv-오류{color:#b00020;font-weight:bold} .lv-경고{color:#b35c00;font-weight:bold} .lv-참고{color:#555}
.ok{background:#eef8ee;border:1px solid #b7dbb7;padding:10px 12px;border-radius:6px} .box{background:#f8f8f8;padding:10px 12px;border-radius:6px;font-size:13px}
.red{color:#c00} code{background:#f1f1f1;padding:1px 4px}`;
  const S = k => String(k).replace(/\u{F02B1}/gu, '①').replace(/\u{F02B2}/gu, '②').replace(/\u{F02B3}/gu, '③').replace(/\u{F02B4}/gu, '④').replace(/\u{F02B5}/gu, '⑤');
  WBR.report_html = { S };

  WBR.report_html.render = function (res) {
    const s = res.summary; const now = new Date();
    const stamp = `${now.getFullYear()}-${U.pad(now.getMonth() + 1)}-${U.pad(now.getDate())} ${U.pad(now.getHours())}:${U.pad(now.getMinutes())}`;
    const L = [`<!doctype html><meta charset='utf-8'><title>변환 결과 ${s['보고일']}</title><style>${CSS}</style>`,
      `<h1>임원회의용 주간업무보고 변환 결과</h1><div class='sub'>보고일 ${s['보고일']}(${s['요일']}) · 취합본 ${e(s['취합본'])} · 양식 ${e(s['양식'])} · 생성 ${stamp}</div>`,
      `<div class='ok'>✔ 생성 파일: <b>${e(res.output_name)}</b><br>발췌 ${s['발췌_행']}행, 표 ${s['표'].length}개, 본문 ${s['본문_쪽수_추정']}쪽(추정), 수입실적 ${e(s['수입실적'].map(x => x[1]).join(', '))}</div>`];
    const chk = res.checks; const n = {}; for (const l of ['오류', '경고', '참고']) n[l] = chk.filter(c => c.level === l).length;
    L.push(`<h2>확인할 것 — 오류 ${n['오류']} / 경고 ${n['경고']} / 참고 ${n['참고']}</h2>`);
    L.push("<div class='box'>항상 할 것: 한글에서 열어 <b>쪽 수, 표 셀 넘침, 줄 끝 어절 분리</b>를 확인한 뒤 송부. 아래 '오류'는 송부 전에 작성 부서에 확인.</div>");
    if (chk.length) {
      L.push('<table><tr><th>구분</th><th>빨강</th><th>위치</th><th>원문</th><th>내용</th></tr>');
      for (const c of chk) L.push(`<tr><td class='lv-${c.level}'>${c.level}</td><td>${c.red ? '●' : ''}</td><td>${e(S(c.where))}<br><small>${e(c.para_id)}</small></td><td>${e(c.text)}</td><td>${e(c.what)}</td></tr>`);
      L.push('</table>');
    } else L.push('<p>규칙 검토에서 발견된 것 없음.</p>');
    L.push('<h2>칸별 발췌 항목 수</h2><table><tr><th>구역/부서/분류</th><th>항목</th></tr>');
    for (const k of Object.keys(s['칸별_항목수'])) L.push(`<tr><td>${e(S(k))}</td><td>${s['칸별_항목수'][k]}</td></tr>`);
    L.push('</table>');
    const pa = Object.keys(s['추가_쪽']);
    if (pa.length) L.push('<h2>쪽 넘김(표 복제)</h2><ul>' + pa.map(k => `<li>${e(S(k))}: +${s['추가_쪽'][k]}쪽</li>`).join('') + '</ul>');
    if (s['칸없음_미배치'].length) L.push("<h2 class='red'>넣지 않은 빨간색(양식에 칸 없음)</h2><ul>" + s['칸없음_미배치'].map(u => `<li>${e(u.section)}/${e(u.dept)}/${e(u.category)}: ${u.count}행</li>`).join('') + '</ul>');
    L.push('<h2>처리 기록</h2><ul>' + res.log.map(x => `<li>${e(x)}</li>`).join('') + '</ul>');
    L.push(`<div class='box'>번호 재부여 ${s['번호_재부여']}건 · 기준 문단 ${e(JSON.stringify(s['스타일']))} (${e(JSON.stringify(s['스타일_출처']))})</div>`);
    return L.join('\n');
  };
})(globalThis.WBR = globalThis.WBR || {});
