/* 회귀 테스트(Node): 세 주차 취합본을 변환해 ① 성공 ② 검증 통과 ③ 0908·0923은 사람 작성본(hwpx)과 본문 행 일치(번호·공백 무시) ④ 1012는 표 4개·월간계획 확인.
   실행: node tests/run_regression.js   (tests/data 에 README.md의 파일을 넣어 둘 것) */
const fs = require('fs'), path = require('path');
const { WBR, ROOT } = require('./node_env');
const HW = WBR.hwpx_tools, U = WBR.util;
const DATA = process.env.WBR_DATA || path.join(ROOT, 'tests', 'data');
const TPL = '[임원회의용] 연구본부 주간업무보고(YYMMDD) 양식.hwpx';
const TPL_V2 = '[임원회의용] 연구본부 주간업무보고(YYMMDD) 양식_v2.hwpx';
const CASES = [
  ['[취합중] 주간업무보고_26.09.08.docx', '[임원회의용] 연구본부 주간업무보고(260908).hwpx', { tables: 0 }],
  ['[취합중] 주간업무보고_26.09.23.docx', '[임원회의용] 연구본부 주간업무보고(260923).hwpx', { tables: 1 }],
  ['[취합중] 주간업무보고_월간계획 포함_261012.docx', null, { tables: 4, monthly: true }],
  // 개선 양식(2026-10, AI융합기술원 신설 + 본부 배너): 합성 취합본. 연구지원팀 → '연구본부' 아래
  ['[테스트] 개선양식_합성_261026.docx', null, { tables: 0, monthly: true, template: TPL_V2, hq: { '금주실적/연구본부': 15, '차주계획/연구본부': 15, '월간계획/연구본부': 5, '월간계획/AI융합기술원': 5 }, slots: ['금주실적/AI융합기술원/󰊱. AI기술개발', '차주계획/디지털기술원/󰊱. 검사/승인 DXAX'] }],
];
async function bodyLines(bytes) {
  const z = await JSZip.loadAsync(bytes); const root = U.parseXml(await z.file('Contents/section0.xml').async('string')).documentElement;
  const out = [];
  for (const s of HW.iter_slots(root)) {
    if (s.heading === null && !s.continuation) continue;
    const ps = U.childrenNS(s.sub, 'http://www.hancom.co.kr/hwpml/2011/paragraph', 'p');
    const after = s.heading !== null ? ps.slice(ps.indexOf(s.heading) + 1) : ps;
    for (const p of after) {
      if (U.descendants(p, 'http://www.hancom.co.kr/hwpml/2011/paragraph', 'tbl').length) continue;
      const t = HW.ptext(p).trim(); if (t) out.push(t.replace(/^\d+\./, 'N.').replace(/\s+/g, ''));
    }
  }
  return out;
}
if (!fs.existsSync(path.join(DATA, TPL))) { console.log('no test data in ' + DATA + ' — see tests/data/README.md'); process.exit(1); }
(async () => {
  const st = JSON.parse(fs.readFileSync(path.join(ROOT, 'ext', 'settings.json'), 'utf8')); st['같은이름_있으면'] = '덮어쓰기';
  // 구 양식(본부 배너 없음) 시절의 운영 규칙: 연구지원팀 항목을 특정 칸에 배치 (구 양식 케이스에만 적용)
  const legacy = Object.assign({}, st, { '칸없는_부서_처리': { '차주계획|연구지원팀|다. 기타': ['디지털기술원', '라. 첨단기술융합'], '월간계획|연구지원팀|월간계획': ['친환경선박해양연구소', '월간계획'] } });
  let okAll = true;
  for (const [docx, human, exp] of CASES) {
    const tplName = exp.template || TPL;
    const res = await WBR.convert.convert({ docxBytes: fs.readFileSync(path.join(DATA, docx)), docxName: docx, templateBytes: fs.readFileSync(path.join(DATA, tplName)), templateName: tplName, settings: exp.template ? st : legacy, existingNames: [] });
    const name = docx.slice(0, 40);
    if (!res.ok) { console.log(`FAIL ${name}: ${res.blocked}`); okAll = false; continue; }
    const s = res.summary, msgs = [];
    if (s['표'].length !== exp.tables) msgs.push(`표 ${s['표'].length}개(기대 ${exp.tables})`);
    if (exp.monthly && !Object.keys(s['칸별_항목수']).some(k => k.startsWith('월간계획'))) msgs.push('월간계획 칸 미채움');
    for (const k of Object.keys(exp.hq || {})) if (s['칸별_항목수'][k] !== exp.hq[k]) msgs.push(`${k} ${s['칸별_항목수'][k]}(기대 ${exp.hq[k]})`);
    for (const k of exp.slots || []) if (!(k in s['칸별_항목수'])) msgs.push(`칸 비어 있음: ${k}`);
    if (s['칸없음_미배치'].length) msgs.push('미배치 ' + s['칸없음_미배치'].length);
    if (human) {
      const a = await bodyLines(res.output_bytes); const b = (await bodyLines(fs.readFileSync(path.join(DATA, human)))).filter(x => !x.includes('주요월간계획'));
      const diff = U.opcodes(b, a).filter(o => o.op !== 'equal');
      if (diff.length) msgs.push(`사람 작성본과 차이 ${diff.length}곳: ` + diff.slice(0, 3).map(o => `-${b.slice(o.i1, o.i2).join('|')} +${a.slice(o.j1, o.j2).join('|')}`).join(' ; '));
    }
    const nErr = res.checks.filter(c => c.level === '오류').length;
    if (msgs.length) okAll = false;
    console.log(`${msgs.length ? 'FAIL' : 'PASS'} ${name}: 발췌 ${s['발췌_행']}행, 표 ${s['표'].length}, 쪽 ${s['본문_쪽수_추정']}, 규칙검토 오류 ${nErr} ${msgs.join('; ')}`);
  }
  console.log(okAll ? 'ALL PASS' : 'SOME FAILED'); process.exit(okAll ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
