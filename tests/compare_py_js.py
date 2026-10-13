"""Python 엔진 출력과 JS 엔진 출력을 문단 단위(paraPrIDRef, charPrIDRef, 텍스트)·표 단위로 정밀 비교.
사용: python tests/compare_py_js.py <py_outdir> <js_outdir>
"""
import sys, os, zipfile, json, re
from lxml import etree
HP = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'

def canon(path):
    z = zipfile.ZipFile(path)
    root = etree.fromstring(z.read('Contents/section0.xml'))
    hdr = z.read('Contents/header.xml').decode('utf-8')
    out = []
    for p in root.iter(HP + 'p'):
        runs = p.findall(HP + 'run')
        txt = ''.join(''.join(t.itertext()) for r in runs for t in r.findall(HP + 't'))
        out.append(('p', p.get('paraPrIDRef'), tuple(r.get('charPrIDRef') for r in runs), txt))
    for t in root.iter(HP + 'tbl'):
        cells = [(tc.find(HP + 'cellAddr').get('colAddr'), tc.find(HP + 'cellAddr').get('rowAddr'), tc.find(HP + 'cellSpan').get('colSpan'), tc.find(HP + 'cellSpan').get('rowSpan'), tc.find(HP + 'cellSz').get('width')) for tc in t.iter(HP + 'tc')]
        out.append(('tbl', t.get('id'), t.get('rowCnt'), t.get('colCnt'), t.get('borderFillIDRef'), tuple(cells)))
    names = [i.filename for i in z.infolist()]
    comp = {i.filename: i.compress_type for i in z.infolist()}
    return out, names, comp, hdr

def main(a, b):
    ok = True
    for f in sorted(os.listdir(a)):
        if not f.endswith('.hwpx'): continue
        pa, pb = os.path.join(a, f), os.path.join(b, f)
        if not os.path.exists(pb): print('MISSING in js:', f); ok = False; continue
        ca, na, compa, ha = canon(pa); cb, nb, compb, hb = canon(pb)
        diffs = [(i, x, y) for i, (x, y) in enumerate(zip(ca, cb)) if x != y]
        print(f'{f}: py {len(ca)} / js {len(cb)} 요소, 차이 {len(diffs)}, zip순서 {"같음" if na == nb else "다름"}, mimetype STORED {compb.get("mimetype") == zipfile.ZIP_STORED}, header 동일 {ha == hb}')
        for i, x, y in diffs[:5]:
            print('  PY', x); print('  JS', y)
        if diffs or len(ca) != len(cb): ok = False
    # 검토 결과 비교
    for f in sorted(os.listdir(a)):
        if f.endswith('.html'):
            ja = [x for x in os.listdir(a) if x.startswith('변환_' + f[5:11])]; jb = [x for x in os.listdir(b) if x.startswith('변환_' + f[5:11])]
            if ja and jb:
                A = json.load(open(os.path.join(a, ja[-1]), encoding='utf-8')); B = json.load(open(os.path.join(b, jb[-1]), encoding='utf-8'))
                ka = [(c['level'], c['para_id'], c['what']) for c in A['checks']]; kb = [(c['level'], c['para_id'], c['what']) for c in B['checks']]
                same = ka == kb
                print(f'  checks {f[5:11]}: py {len(ka)} / js {len(kb)} {"동일" if same else "다름"}')
                if not same:
                    ok = False
                    for x in ka:
                        if x not in kb: print('   only PY', x)
                    for x in kb:
                        if x not in ka: print('   only JS', x)
                sa, sb = A['summary'], B['summary']
                for k in ('발췌_행', '본문_쪽수_추정', '칸별_항목수', '추가_쪽', '수입실적', '스타일', '번호_재부여'):
                    if json.dumps(sa.get(k), sort_keys=True, ensure_ascii=False) != json.dumps(sb.get(k), sort_keys=True, ensure_ascii=False):
                        print(f'   summary {k} 다름: PY {sa.get(k)} JS {sb.get(k)}'); ok = False
    print('ALL SAME' if ok else 'DIFFERENT')
    return 0 if ok else 1

if __name__ == '__main__':
    sys.exit(main(sys.argv[1], sys.argv[2]))
