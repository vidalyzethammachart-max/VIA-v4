# Data-only Dashboard E2E — 2026-10-14

User requested no video attachment. All submissions used the actual localhost:5173 form UI, current authenticated profile, and synthetic comments. This verifies data-only evaluation processing, not analysis of real video content.

| Flow | Result | Evidence |
| --- | --- | --- |
| Normal evaluation | PASS | #244, 45 answers = 3; PDF 446286 bytes, DOCX 405017 bytes; n8n #2994 succeeded |
| Three reviews in one case | PASS | #245, #246, #247 belong to f5fb496f-b7b6-450a-8bd9-ab7568bffb1b; each has 45 answers, respectively 1, 3, 5 |
| Aggregate | PASS | dfc81cac-ea57-4bcc-9785-7aba9bf32795 references all three source IDs; 45 combined answers, minimum = maximum = 3; original scores preserved |
| Dashboard | PASS | New normal result, three shared-case results, and aggregate visible; aggregate shows 3.00; totals 13 active cases, 21 individual evaluations, 5 aggregates |
| First shared review documents | PASS | #245 PDF 447344 bytes, DOCX 405015 bytes; n8n #2995 succeeded |
| Remaining individual documents | FAIL | #246 and #247 remain pending with no storage objects; n8n #2996 and #2997 show Error |
| Aggregate documents | FAIL | No storage objects; n8n #2998 Error; retry using original workflow from failed node also Error (#2999) |

All document states verified using read-only linked database queries in e2e-dashboard-round-audit.sql and e2e-dashboard-integrity.sql. Screenshot: dashboard-data-only-e2e.png.

The n8n execution detail canvas remained loading, preventing inspection of the underlying node error. API inspection returned 401. No workflow, credentials, billing settings, or pinned data were changed. Do not attribute the failures to quota or credentials without the node error details. The dashboard correctly shows unavailable documents; the end-to-end document flow is not fully passing.
