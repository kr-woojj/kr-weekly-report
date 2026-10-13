# Template and input assumptions · 양식·입력 구조 가정

The converter is not a generic docx→hwpx tool. It assumes the two documents below. If yours differ, adjust `engine/extract_docx.js` (input) or `engine/hwpx_tools.js` (template).

## Input: collected weekly report (docx)
- Body paragraphs act as section headings: text containing `금주 실적`, `차주 계획`, `수입 실적`, `월간 계획`. The week ranges are read from the headings, e.g. `금주 실적 (09.21-10.11)`.
- A paragraph `YYYY.MM.DD` under the title is the report (meeting) date.
- Under `금주 실적` / `차주 계획`: a 3-column table — department · category · content. Rows whose first cell is `구분` (header) or contains `서식` (format sample) are skipped.
- Under `월간 계획`: a 2-column table — department · content. Under `수입 실적`: label · value.
- Inside a content cell: paragraphs, optionally nested tables. Level is taken from the leading text (`1.` = item, `ㅇ/○` = sub, `-` = detail); Word auto-bullets (numPr) count as level 3.
- Red = every non-blank run of the paragraph has `w:color` with R ≥ 0xC0, G ≤ 0x40, B ≤ 0x40. Tracked deletions (`w:del`) are ignored; `w:br` becomes a line break (each line becomes one hwpx paragraph).

## Template: executive report (hwpx)
- `Contents/section0.xml` body is a sequence of 2×2 tables; each table is one page (`pageBreak="TABLE"`).
  - row 1, cell 0: first paragraph is `실 적` / `계 획` / `월 간`, followed by `(00.00~` and `00.00)` paragraphs (period placeholders).
  - row 1, cell 1 (`subList`): optional department banner (a 1×1 nested table whose text is the department name), then a category heading paragraph containing a PUA circled number (U+F0000–U+FFFFF range, e.g. `󰊱. 선급기술 개발/지원`), then empty paragraphs where items are inserted.
  - A 2×2 table with neither banner nor heading directly after a filled one is treated as a continuation page (the converter creates these itself by cloning).
- Division banner (optional): a 1×1 banner reading `연구본부` placed before the first department banner on the first page of each section (and on the monthly page). Items whose department has no box are inserted right after it (`본부_칸` in settings).
- Monthly slot: a page whose left cell says `월 간`; its right cell contains `[연구본부 00월 주요월간계획]` and department banners; items are inserted after each banner.
- Cover: a paragraph matching `YYYY. MM. DD.(요일)`. Income: a 4×2 table whose first-column labels match the docx `수입 실적` labels.
- Styles are resolved from `Contents/header.xml` by properties, not by ID:
  - charPr: `height=1500`, `fontRef hangul=8`, `ratio hangul=95`, `spacing hangul=-1`; bold → level 1, non-bold → levels 2/3.
  - paraPr: `align=JUSTIFY` with first intent `-2956` (L1) / `-3661` (L2) / `-4266` (L3). Fallback IDs are in `settings.json`.
  - Nested tables: 10 pt charPr (`height=1000`, `fontRef hangul=7`), CENTER/JUSTIFY paraPr with intent 0 and 160 % line spacing, a borderFill with four SOLID 0.12 mm borders.
- Page capacity: cell height / 2400 hwpunit ≈ 30 lines; 33 character widths per line (Korean 1, ASCII 0.55). Both are in `settings.json` (`쪽용량`).
- Leading-space convention per level: 1 / 2 / 4 spaces; one blank paragraph between level-1 items.
