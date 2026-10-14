# Production web acceptance — 2026-10-14

Target: https://via4-app.vercel.app, deployment commit `b0dd108`. Browser: approved Chrome Phirapon profile; user signed in on the production site. These checks used the live website, not localhost or a direct API submission.

| Flow | Result | Evidence |
| --- | --- | --- |
| Production sign-in and admin page | PASS | User completed sign-in; authenticated `/admin` rendered |
| Dashboard | PASS | Individual evaluations and the separate three-source aggregate show correct readiness and means; 246 and the retained aggregate ready, older 247 still pending |
| Submit a data-only evaluation through the web form | PASS | Entered synthetic order `WEB-E2E-20261014-01`, synthetic title/comment, selected score 3 on all 45 questions using UI controls, then clicked Send once |
| Persisted review and queue | PASS | New evaluation `248`, case `bdc6b196-29e9-4a0b-8857-fa07e5c3a6d6`, queue `72318c2c-8cfe-494a-aa02-fcf7d6e538f1`; independent read confirms all 45 scores equal 3 |
| Real processing and callback | PASS | n8n execution `3003`, Succeeded, 20:55:55 Bangkok, 47.046 seconds; queue completed on attempt 1; document ready with PDF and DOCX storage paths |
| My Forms and status link | PASS | Browser displayed Evaluation ID 248 and the synthetic review; followed its status link to `/preview/248`, which gained document links after the real callback |
| Individual PDF | PASS | Opened signed PDF from the production preview page in Chrome; six pages visibly render the expected order/title and score-3 checkmarks |
| Individual DOCX browser download | PASS | Clicking the production DOCX link saved `result (9).docx`, 404899 bytes; valid Word ZIP; extracted XML contains the expected order and title text, with no unresolved template placeholders |
| Existing aggregate preview and DOCX | PASS | Production page for `dfc81cac-ea57-4bcc-9785-7aba9bf32795` shows three sources and both document links; clicking DOCX saved `result (10).docx`, 404979 bytes, exact hash match to the previously verified artifact |
| Existing aggregate PDF | PASS | Opened the PDF link from the production summary page; Chrome visibly renders six pages with `QUEUE-SYNTHETIC-SUMMARY` and score-3 checkmarks |
| Video upload | NOT TESTED | This run selected data only. Previous read-only backend checks returned 5xx; do not infer video upload success from this run |
| Embedded PDF preview | NOT VERIFIED | Document links and direct Chrome PDF work. This run does not establish that the inline iframe renders reliably |

Only synthetic report content was entered. One new V4 case and evaluation were created through the normal web form; no data, roles, credentials, or workflow settings were deleted or changed. The existing aggregate was opened/downloaded, not recreated or resubmitted.

The browser download event helper timed out, but the actual browser download succeeded: newly timestamped files appeared in Downloads and were independently validated. Downloads were not replaced by direct API file retrieval in this web acceptance run.

Individual DOCX SHA-256: `71f28bc97f8e5b4191aa547147ea708be62888fb2ae86e8662c6525ffa5ab8a4`.

Summary DOCX SHA-256: `07b43b16ca848d6eadda477dba89397ec251cbdaf00512755803463e4303bf99`.

## Download filename verification after deployment `44253ac`

Production individual and aggregate preview links now send the evaluation or case title as the download filename. Actual Chrome downloads confirmed these files on disk:

| Document | Downloaded filename | Bytes |
| --- | --- | --- |
| Individual DOCX | ทดสอบ production หลัง deploy แบบข้อมูลสังเคราะห์.docx | 404899 |
| Individual PDF | ทดสอบ production หลัง deploy แบบข้อมูลสังเคราะห์.pdf | 447742 |
| Aggregate DOCX | ทดสอบ Dashboard เคสเดียวกัน 3 ชุด.docx | 404979 |
| Aggregate PDF | ทดสอบ Dashboard เคสเดียวกัน 3 ชุด.pdf | 449509 |

Chrome saved PDFs under Downloads/Documents and opened the local files automatically. DOCX files were saved under Downloads. All 87 tests, lint, TypeScript checks, and the production build passed for this change.

Screenshots are retained locally in `.figma-capture/web-production-248-pdf.png` and `.figma-capture/web-production-n8n-3003.png`. Local test artifacts remain excluded from Git and deployment uploads. No application source was modified during this test.
