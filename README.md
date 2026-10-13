# KR Weekly Report Converter · 주간보고 변환기

Turns a collected weekly work report (Word `.docx`) into an executive-meeting report (Hangul `.hwpx`) by extracting only the **red-highlighted** paragraphs into a fixed hwpx template — entirely inside the browser. No server, no installer, no data leaves the PC.

취합이 끝난 주간업무보고(docx)에서 **빨간색** 문단만 뽑아 임원회의용 한글 양식(hwpx)에 채워 넣는 Chrome 확장 / 단일 HTML 도구입니다. 파일은 브라우저 안에서만 처리됩니다.

[English](#english) · [한국어](#한국어)

---

## English

### What it does
- Reads the docx (`word/document.xml`), classifies paragraphs by section (this week / next week / monthly plan / income), department, category and level (1./ㅇ/-), and keeps the red ones (run color R≥C0, G≤40, B≤40).
- Fills the hwpx template: cover date, period ranges, income figures, monthly-plan slot, and each department/category box; renumbers items from 1, inserts a blank line between items, converts red nested tables into real hwpx tables, and **paginates by cloning the page table** when a box overflows (never splits an item).
- Resolves paragraph/character styles from `header.xml` by their properties (font size, ratio, spacing, indent), so the template may be re-saved in Hangul without breaking.
- Re-parses the generated file and refuses to export unless the text round-trips exactly and the styles are uniform.
- Produces a rule-based checklist (date/weekday mismatch, inverted ranges, future dates written as completed, holidays, duplicate numbers, unbalanced brackets, long gaps, red body under a black title, departments with no box in the template, overflow) and an HTML report.

### Use it
**Option A – hosted single file:** open the GitHub Pages site of this repo (`https://kr-woojj.github.io/kr-weekly-report/`), or download `weekly-report-converter.html` from Releases and double-click it. Chrome/Edge 86+.

**Option B – Chrome extension (unpacked):** download `weekly-report-converter-extension.zip` from Releases (or use the `ext/` folder of a clone) → `chrome://extensions` → *Developer mode* → *Load unpacked* → pick the folder → click the toolbar icon.

Then: **Choose folder** (the folder that holds the collected docx and the `…양식.hwpx` template) → the docx, template and report date are auto-detected → **Convert** → the hwpx, an HTML checklist and a `_로그/` JSON land in the same folder. If folder access is not available, the app falls back to file pickers + downloads.

### Departments without a box in the template
Red items whose department/category has no box in the template (e.g. a support team) go under the **division banner** (`연구본부` by default, `본부_칸` in settings) at the top of the first page of each section (this week / next week / monthly plan), numbered from 1; an explicit mapping in `칸없는_부서_처리` takes precedence; if the template has neither, the items are reported in the checklist instead of being dropped silently.

### Adapting to your own template
The engine is written against one specific template layout (see [docs/template-structure.md](docs/template-structure.md)): a sequence of 2×2 tables, one per page, whose right cell holds a department banner, a category heading with a circled number, and empty paragraphs. Department/category names, aliases, where to put departments that have no box, fonts, page capacity, holidays and output file names live in `ext/settings.json`; a `주간보고변환기_설정.json` dropped into the working folder overrides it without redeploying. Anything structural (different table layout, different docx table columns) is in `engine/hwpx_tools.js` and `engine/extract_docx.js`.

### Develop
```
npm install
npm run build        # ext/ (copies engine+vendor) and dist/ (single HTML + extension zip)
npm test             # regression — needs private sample files in tests/data (see tests/data/README.md)
npm run test:browser # same, inside real Chromium via Playwright (extension page, file:// page, folder mode)
```
Layout: `engine/` (pure JS, browser & Node, global `WBR` namespace; `convert.js` is the single entry point: bytes in → bytes out), `ext/` (Manifest V3 extension = deployable folder, `app.js` is the UI), `vendor/jszip.min.js`, `build.js`, `tests/`.

The engine was ported from a Python/lxml implementation; three real weeks of reports convert to **identical** output (paragraphs, style IDs, tables, checklist) in both engines, and two of them match the human-made executive files line for line.

### Privacy
Everything runs in the page. The extension makes no network requests; the single HTML file embeds its dependencies. Sample documents are internal and are not part of this repository.

### Maintenance
Maintained on a best-effort basis for one organization's template. Issues and PRs are welcome, but there is no release schedule.

### Third-party
- [JSZip](https://stuartk.com/jszip) 3.10.1 (`vendor/jszip.min.js`) — MIT (dual MIT/GPLv3), (c) Stuart Knightley; bundles [pako](https://github.com/nodeca/pako) — MIT. Notices are kept in the file header.
- Dev only: `@xmldom/xmldom` (MIT), `playwright` (Apache-2.0).

### License
MIT — see [LICENSE](LICENSE).

---

## 한국어

### 하는 일
- 취합본 docx를 읽어 구역(금주실적/차주계획/월간계획/수입실적)·부서·분류·수준(1./ㅇ/-)을 판정하고 빨간색 문단만 뽑습니다.
- 양식 hwpx에 표지 날짜·실적/계획 기간·수입실적·월간계획 월을 채우고, 부서·분류 칸마다 항목을 넣습니다. 번호 1부터 재부여, 항목 사이 빈 줄, 빨간색 표는 hwpx 표로 변환, 한 쪽을 넘으면 **같은 표를 복제해 다음 쪽으로**(항목 중간에서 나누지 않음).
- 기준 문단 스타일은 `header.xml`에서 속성(글자 크기·장평·자간·들여쓰기)으로 찾으므로 양식을 한글에서 재저장해도 됩니다.
- 생성 파일을 다시 파싱해 문구가 그대로이고 스타일이 균일할 때만 내보냅니다.
- 규칙 검토(날짜-요일 불일치, 기간 역전, 완료형 미래 날짜, 공휴일, 번호 중복, 괄호 짝, 긴 공백, 제목 검정/본문 빨강, 칸 없는 부서, 쪽 넘침)와 HTML 보고서를 만듭니다.

### 사용
- **단일 HTML**: GitHub Pages 주소를 열거나 Releases의 `weekly-report-converter.html`을 내려받아 더블클릭.
- **Chrome 확장**: Releases의 `weekly-report-converter-extension.zip` 압축 해제 → `chrome://extensions` → 개발자 모드 → "압축해제된 확장 프로그램을 로드합니다" → 폴더 선택.
- 이후 [폴더 선택] → 취합본·양식·보고일 자동 → [변환] → 같은 폴더에 hwpx·확인목록 HTML·`_로그/` 저장. 자세한 순서는 [docs/user-guide.ko.md](docs/user-guide.ko.md), 개발·설정은 [docs/developer-guide.ko.md](docs/developer-guide.ko.md).

### 칸 없는 부서
양식에 칸이 없는 부서(예: 연구지원팀)의 빨간색 항목은 실적·계획·월간계획 첫 쪽의 **'연구본부' 배너 아래**에 번호 1부터 들어갑니다(`본부_칸`). `칸없는_부서_처리`에 적은 명시 배치가 우선하고, 둘 다 없으면 '확인할 것'으로 보고합니다.

### 다른 양식에 맞추기
부서·분류명, 별칭, 칸 없는 부서 배치, 글꼴, 쪽 용량, 공휴일, 출력 파일명은 `ext/settings.json`(작업 폴더의 `주간보고변환기_설정.json`이 우선). 표 구조가 다르면 `engine/hwpx_tools.js`(iter_slots/fill_hwpx), 취합본 표 구조가 다르면 `engine/extract_docx.js`를 고칩니다. 양식 구조 가정은 [docs/template-structure.md](docs/template-structure.md)에 적어 두었습니다.

### 유지보수·제3자 코드
특정 조직 양식 전용 도구로, 최선 노력(best-effort) 수준으로 유지합니다. 제3자 코드는 JSZip(MIT, `vendor/`)과 개발용 의존성만 포함합니다(위 Third-party 절).

### 라이선스
MIT.
