# Production Gemini acceptance - 2026-10-28

## Integration and deployment

The user explicitly authorized push, merge into main, and testing on
`https://via4-app.vercel.app/`.

- Feature commit: `8cee64b43083b4b4ee811e03de43c6d7727129cd`.
- Pushed `fix/gemini-free-video`, fast-forwarded main, then pushed main.
- GitHub's connector could read the repository but returned 403 when creating
  a PR. Used the existing Git credentials for the explicitly authorized
  fast-forward merge and push instead. No force push or history rewrite.
- All 166 tests passed on the merged main tree. Lint and production build also
  passed. Build retained the existing warning about a bundle over 500 kB.
- Vercel reported success for the main commit; production responded HTTP 200.
- Fresh saved n8n export version:
  `60775adb-fe57-4dae-b2a5-c8a13fec8f3f`. Its context Code node matches main.
  Changes since the earlier saved context fix were pinned test data and version,
  not node configuration or credentials. Production runs ignore editor pinData.

## Cost boundary and authorization

The production frontend still uses the existing Cloud Run service to issue an
R2 signed upload URL. The analysis endpoint uses the authenticated local Gemini
listener through ngrok Free. After this distinction was explained, the user
explicitly authorized **one real video submission through the existing hosting**.
No billing activation, credit top-up, new Cloud Run revision or traffic change
was made. Read-only Cloud Billing again returned billingEnabled false for the
Gemini key project. This is not a guarantee that all existing hosting usage has
zero charge; the bounded production test was explicitly approved.

## Test identity and input

- Production browser session; fresh form submission, not a retry of evaluation
  291 or an old execution.
- Order `004`, title `ProductionGemini-20261028`.
- Checked My Forms for this title first: no existing entry.
- All 45 human scores set to 3, with an explicit synthetic-test note.
- Generated moving test pattern and sine tone MP4, 12 seconds, 241673 bytes.
- One Send click. Existing production R2 upload flow and authenticated Supabase
  forwarding were used. No local frontend, proxy override or fake callback.
- New evaluation **292**, n8n execution **3081**, started 06:40:06 Bangkok.

## Result

**PASS for the synthetic production pipeline.** Execution 3081 succeeded in
1m 3.294s, and evaluation 292 received both real callback artifact links at
`https://via4-app.vercel.app/preview/292`. No retry or second submission was
performed for this production test.

Downloaded both files through the production page:

- PDF: 443601 bytes; opened and rendered all six pages locally. The title and
  human average 3.00 are present. Visual review found readable Thai text and
  intact score tables/report sections, without clipping or overlapping text.
- DOCX: 405014 bytes; document XML parses successfully, contains the expected
  title, and has no unresolved double-brace placeholders. All 45 scored rows
  put their check in the third score column. Human average remains 3.00.
- The narrative explicitly identifies the synthetic test and its limits instead
  of presenting the result as validation of a real teaching video's quality.
- Read the actual Assemble Final Evaluation Context output from completed
  execution 3081 without Save or Execute: evaluation_id was 292 and all six
  video categories, with their real test-pattern comments, were present.
  Cached audio evidence was reused (audioHit true); this production run does
  not establish another fresh video-provider inference. The earlier real
  multimodal Gemini result remained available and reached the report prompt.

The DOCX check covers its structure and contents; it is not a separate Word
layout-render comparison. The PDF was visually reviewed page by page.

## Main problems addressed

1. OpenAI credit exhaustion: route video analysis to the verified Gemini free
   project; do not pretend the OpenAI account credit was repaired.
2. Hosting: run analysis on a restricted loopback listener through ngrok Free,
   retaining service-token authentication and blocking all other public paths.
3. n8n routing and request shape: connect the true video branch through the HTTP
   Analyze Video node to Merge input 2; use nested `video.downloadUrl` and
   `video.fileName` in the parent workflow.
4. Process networking: the initial local test process inherited agent sandbox
   restrictions and returned EACCES when fetching R2. Restart it in the approved
   network-enabled context; do not change API credentials or billing to fix it.
5. Report evidence: skip empty legacy aliases so they cannot hide canonical
   videoEvaluation. Human rubric scores remain unchanged.

Raw workflow exports, signed URLs, media, generated documents and diagnostic
logs are kept under ignored logs. Do not publish them with the source changes.
