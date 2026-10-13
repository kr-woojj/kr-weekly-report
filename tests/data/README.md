# Test data (not included in the repository)

The regression tests need real documents, which are internal and therefore **not published**.
Copy the following files into this folder (or point `WBR_DATA` to a folder that has them):

| File | Used by |
|---|---|
| `[임원회의용] 연구본부 주간업무보고(YYMMDD) 양식.hwpx` | template (all cases) |
| `[취합중] 주간업무보고_26.09.08.docx` + `[임원회의용] 연구본부 주간업무보고(260908).hwpx` | case 1: body lines must equal the human-made file |
| `[취합중] 주간업무보고_26.09.23.docx` + `[임원회의용] 연구본부 주간업무보고(260923).hwpx` | case 2: same + 1 nested table |
| `[취합중] 주간업무보고_월간계획 포함_261012.docx` | case 3: 4 tables, monthly-plan slot, pagination |
| `[임원회의용] 연구본부 주간업무보고(YYMMDD) 양식_v2.hwpx` + `[테스트] 개선양식_합성_261026.docx` | case 4: 2026-10 template (division banner, new institute), synthetic input |

Then: `npm test` (Node) · `npm run test:browser` (real Chromium via Playwright).
