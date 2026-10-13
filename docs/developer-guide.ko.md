# 주간보고 변환기 (Chrome 확장 / 단일 HTML) — 개발자·담당자용

Python/lxml 엔진을 JavaScript로 포팅한 것. 브라우저 안에서만 동작하며 서버·설치 프로그램·Python이 필요 없다.
3세트(0908·0923·1012) 변환 결과가 Python 엔진 출력과 **문단·스타일 ID·표·검토 항목까지 동일**함을 확인했다(`tests/compare_py_js.py`).

## 구성
```
engine/                엔진(전역 WBR 네임스페이스, 브라우저·Node 공용)
  util.js              DOM·날짜·문자열 도우미, 간단 diff
  extract_docx.js      docx → 문단 JSON(빨간색, 수준, 중첩 표, 월간계획)
  date_facts.js        날짜·요일·범위·공휴일
  hwpx_tools.js        fill_hwpx / verify_hwpx (양식 앵커, 기준 문단 속성 해석, 쪽 넘김, 표)
  rules_review.js      규칙 기반 '확인할 것'
  report_html.js       결과 보고서 HTML
  convert.js           convert({docxBytes, templateBytes, settings, …}) — 유일한 진입점(바이트 in → 바이트 out)
ext/                   Chrome 확장(Manifest V3) = 배포 폴더. build.js가 engine·vendor를 여기에 복사
  manifest.json, background.js(아이콘 클릭 → 탭), index.html, app.js(화면), app.css, settings.json, icon*.png
vendor/jszip.min.js    zip 읽기/쓰기(JSZip 3.10.1)
build.js               ext/ 갱신 + dist/weekly-report-converter.html(단일 파일) + dist/weekly-report-converter-extension.zip
tests/
  run_regression.js    회귀(0908·0923 사람 작성본과 본문 행 일치, 1012 표·월간계획)
  compare_py_js.py     Python 엔진 출력과 정밀 비교
  browser_test.js      실제 Chromium으로 확장 페이지·단일 HTML 변환(Playwright)
  folder_mode_test.js  폴더 지정 모드(같은 폴더 저장·_로그·_v2) 검증
  data/                테스트 파일(README.md 참고)
```

## 빌드·테스트
```
npm install
npm run build          # ext/ 갱신, dist/ 생성
npm test               # ALL PASS 여야 배포(tests/data 필요)
npm run test:browser   # (선택) 실제 Chromium
```

## 배포
- 확장: `dist/weekly-report-converter-extension.zip` → 압축 해제 → `chrome://extensions` 개발자 모드 → 압축해제된 확장 로드. (IT가 원하면 그룹 정책 `ExtensionInstallForcelist`로 배포하거나 웹 스토어 비공개 등록 가능 — 코드 변경 불필요)
- 단일 HTML: `dist/weekly-report-converter.html` 하나만 배포. 더블클릭으로 Chrome/Edge에서 열림.
- 두 형태 모두 코드가 같다(단일 HTML은 settings.json을 안에 품고 있음).

## 설정(settings.json)
| 변경 | 키 |
|---|---|
| 양식 파일명 패턴, 출력 파일명, 같은 이름 처리(번호붙임/덮어쓰기) | `양식_파일명_패턴`, `출력_파일명`, `같은이름_있으면` |
| 분류명 별칭, 팀명 | `분류_별칭`, `팀명_부서` |
| 칸 없는 부서 처리 | ① `칸없는_부서_처리`에 (구역\|부서\|분류)→[부서, 분류]를 적으면 그 칸 ② 없으면 `본부_칸`(양식의 '연구본부' 배너 바로 아래, 실적·계획·월간계획) ③ 본부 배너도 없으면 '확인할 것'으로만 보고 |
| 양식 글꼴·크기·들여쓰기 | `기준문단_속성` (fallback_ID는 양식 header.xml의 paraPr/charPr id) |
| 쪽 용량, 표 폭·글자 | `쪽용량`, `표` |
| 공휴일(연 1회 갱신) | `공휴일` |
| 보고서·로그 이름, 로그 폴더 | `보고서_파일명`, `로그_파일명`, `로그_폴더`(기본 `_로그`) |
- **배포 후 설정 변경**: 주간업무보고 폴더에 `주간보고변환기_설정.json`을 두면 그 값이 내장 설정을 덮어쓴다(키 단위 병합). 확장을 다시 배포할 필요 없음.
- 양식 구조(칸 추가·2×2 표 변경)는 `engine/hwpx_tools.js` iter_slots/fill_hwpx, 취합본 구조는 `engine/extract_docx.js`, 규칙 추가는 `engine/rules_review.js`.

## 2026-10 조직 개편 반영(v1.1)
- 취합 양식: AI융합기술원(AI기술개발·자율운항선박기술개발·기타) 추가, 디지털기술원 분류 변경(검사/승인 DXAX, SeaTrust 및 기술소프트웨어 개발, 첨단기술융합, 기타). 분류·부서명은 양식에서 읽으므로 코드 변경 없음.
- 임원용 양식: 실적·계획·월간계획 첫 쪽에 '연구본부' 배너 추가 → 칸 없는 빨간색 항목(연구지원팀)은 그 아래에 들어감(`본부_칸`). 쪽 용량 계산에 반영됨.
- 양식에 특정 부서 배너가 빠져 있으면(예: 월간계획의 한 부서) 그 항목은 본부 아래로 가고 경고로 알림.
- 칸 없는 항목은 검증(text_diff) 대상에서 빼고 '확인할 것'으로만 보고(이전엔 변환이 막혔음).

## 동작 메모
- 폴더 지정은 File System Access API(`showDirectoryPicker`, Chrome/Edge 86+). 권한은 세션당 1회 확인되며, 최근 폴더 핸들은 IndexedDB에 저장해 [최근 폴더 다시 열기]로 재사용.
- 폴더 지정이 불가한 환경(정책 차단, 구형 브라우저)은 자동으로 파일 선택 + 다운로드 모드.
- 생성 파일은 직렬화 후 다시 파싱해 검증(text_diff=0, 스타일 균일)한 것만 내보낸다.
- 알려진 한계: 쪽 수는 추정(한글 확인 단계 유지). `compute_date_facts`가 "기술3 - 1차년도" 같은 표현을 날짜로 오인할 수 있음(참고 수준).
