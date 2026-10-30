# Changelog

## 1.2.0 — 2026-10-30
- Monthly-plan page now paginates: when the monthly box overflows (~30 lines), the page table is cloned and content continues on the next page, split at department-banner / item boundaries (a banner always moves together with its first item). Items longer than one page are reported.
- First-page overflow: when the first page of a section is already filled by the income table and division-banner items, the department banner and category heading move to a new page together with their items instead of overflowing page 1.
- Verification now checks red nested tables placed under the division banner and division-banner content on pages without a category heading.

## 1.1.0 — 2026-10-13
- Reorganization support: new departments/categories are read from the documents (no code change).
- Items whose department has no box in the template now go under the `연구본부` banner on the first page of each section (`본부_칸` setting), numbered from 1, and are counted in page capacity.
- Unmatched items no longer block the export; they are reported in the checklist.
- Regression case for the new template (synthetic input).

## 1.0.0 — 2026-10-13
- First public release: Chrome extension (Manifest V3) and single-file HTML build of the same app.
- Engine ported from the Python/lxml implementation; outputs verified identical on three real weeks.
- Folder mode (File System Access API) with auto-detection of docx/template/report date, same-folder output, `_로그/` logs, `_v2` naming; fallback to file pickers + downloads.
- Rule-based checklist and HTML report; DRM-encrypted docx detection with an unlock hint.
