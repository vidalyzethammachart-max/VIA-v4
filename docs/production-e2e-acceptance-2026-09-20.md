# VIA V4 Multi-review Video Case — Production acceptance

Run dates: 2026-09-20 to 2026-09-22 (Asia/Bangkok). Status: functional E2E flows and member/leader/admin acceptance PASS. The remaining n8n identity-propagation acceptance item is closed by user confirmation ("ผ่านแล้วนะ") after reviewing the requested node checks. This is user-verified acceptance, not a new agent-run execution or proof that every content-only node emits an ID.

## Latest acceptance closure — user verified

The user confirmed that the remaining n8n check passed after being given the
Webhook → Transform/Assemble → AI/Merge → Build Final → callback checklist for
aggregate execution `2983`. Record this as **PASS (user verified)**. The user did
not provide a new execution ID, workflow version or export, so this closure must
not be described as a fresh agent inspection or a workflow modification.

The observed implementation still includes content-only AI outputs with identity
recovered from upstream references, as documented in the trace below. Acceptance
is closed on the user's confirmation of that routing; the report does not assert
literal `aggregate_id` presence in every standalone node output. No additional
production mutation, deployment, migration or Git push accompanies this closure.

Scope update: the user explicitly removed V2 and V3 smoke tests. Continue with
V4 individual evaluation and its real callback first; V2/V3 are not acceptance
blockers. Existing V4 aggregate and permissions requirements remain in scope.

Execution order clarified by the user: test the application on localhost first,
then push only after the agreed flow passes. No Git commit/push has occurred.
The three n8n patches had already been applied to the active workflow under the
earlier explicit approval; localhost uses the configured production Supabase
and n8n services. Do not describe this setup as isolated local infrastructure.

Current local setup: Vite at `http://localhost:5173/` and the existing upload
API at `http://localhost:8080/`. Chrome control is working with the approved
Phirapon profile. Evaluation 236 was submitted through the visible form.
The initial combine attempt stopped before insertion because `GEMINI_API_KEY`
was absent. After the user supplied it, configured the supported local model,
restarted the backend and successfully created aggregate
`98ea15f2-eeb6-4b6a-b782-fd5b0405f52b`. Sent it through the browser button; n8n
execution `2983` completed with a real successful callback. Earlier sections
retain the investigation history; the current acceptance matrix takes precedence.

## Verified evidence

- Local HEAD, cached origin/main and live GitHub `refs/heads/main` (verified with `git ls-remote`): `55c7904afa7bfb2337e50b2cf879433d7a0546f8`.
- Supabase migration list was queried against the linked remote database: all 30 local/remote versions match, latest `20260728170000`.
- Live Edge Functions: `forward-to-n8n` v20 ACTIVE; `document-generation-callback` v21 ACTIVE; `document-artifact-url` v11 ACTIVE; `admin-user-management` v3 ACTIVE.
- Live OPTIONS requests to the three document functions returned HTTP 200 with `POST, OPTIONS` allowed. These are connectivity checks, not completed document flows.
- Latest `npm.cmd test`: 41 passed, 0 failed, 0 skipped (32 existing plus 9 new node-contract tests).
- `npm.cmd run build`: exit 0; warning about a minified chunk larger than 500 kB.
- Authenticated n8n inspection succeeded after the user restarted Codex. `VIA-v4` is Active, workflow ID `nl38M3CrQPQXpg0G`, exported version ID `c2bfc1ec-80a2-4a55-98ad-90245c211433`, 17 nodes. A workflow export was downloaded through the UI and inspected locally without changing the active workflow. No new execution has been run.
- Candidate V4 URL inferred from local Vercel project name: `https://via-v4.vercel.app`. Browser returned HTTP 404, `FUNCTION_RUNTIME_DEPRECATED`, request ID `sin1::4fx7j-1789893255115-b4f75238993a`. The current production URL and deployment settings still require confirmation; this does not establish an application-code root cause.
- Correction: the active workflow references `https://via4-app.vercel.app/api/n8n-analysis-result`. GET `https://via4-app.vercel.app/` returned HTTP 200 with the VIA page title, request ID `sin1::djvfw-1789897609418-e4ae372f825e`. GET `https://via3-app.vercel.app/` also returned HTTP 200, request ID `sin1::8kmsf-1789897609851-31e71f43d9f9`. These landing-page checks are not V4/V3 document smoke tests. The earlier inferred hostname was not the URL used by the active workflow.
- The committed Postman collection contains placeholder credentials, not usable test sessions.
- Vercel dashboard redirects to Log in; deployment runtime settings could not be inspected. Repository `vercel.json` has rewrites and no explicit function runtime override. No runtime change or redeployment was attempted without evidence and approval.

## Local changes and outstanding access

- Added this report, `n8n/README.md`, three Code node bodies under `n8n/nodes/`, and `tests/n8nVideoCaseContract.test.js`. The three approved Code nodes are now applied to active VIA-v4; see rollout evidence below. No application deployment, migration, role change or production test-data creation occurred.
- The original broader production-data scope below is not approved. The user subsequently approved the reduced V4 scope recorded under Localhost retry: one synthetic case, two score 1/5 evaluations and one retained aggregate, with real n8n/document processing. Deletion and new V2/V3 records are not included in that approval.
- Required access: a test account with editor/admin authority to create evaluations; designated leader/admin/member sessions for role tests; working browser automation for UI checks. User's current V4 login reached `/home`, but opening `/form-submit` redirected to `/dashboard`. `App.tsx` requires editor for that route, and `ProtectedRoute.tsx` redirects lower-ranked users to `/dashboard`; no role was changed. Normal email/password authentication through Supabase is available for API E2E, but the supplied test login has not authenticated. `VIA_E2E_EMAIL` and `VIA_E2E_PASSWORD` are configured in gitignored `.env.local`; never print these values or session tokens.
- Initial CLI telemetry writes and network requests were blocked by the workspace sandbox. Read-only Supabase and GitHub commands succeeded after approved execution escalation. No automatic approval rejection remains outstanding.

## Proposed production test data — approval required before execution

Run prefix: `VIA-E2E-20260920` (add a unique suffix on execution).

1. Use existing designated test accounts with case leader, system admin, and case member authority. Do not change the global role model or existing account roles.
2. Create one isolated V4 video case with synthetic subject/title and join the designated test member to this test case. Record the resulting case ID and membership IDs.
3. Create two V4 source evaluations in that case, all rubric scores 1 and 5 respectively. Submit both through the normal individual document flow. Preserve both permanently during this acceptance run.
4. Create up to three aggregates from exactly those two sources: one retained for payload, callback, history, preview and PDF/DOCX checks; two disposable aggregates to verify leader/admin deletion separately. Expected average is 3.00 for every matching question and section.
5. Verify member history visibility and a denied deletion attempt against a disposable test aggregate. If an unauthorized deletion unexpectedly succeeds, record FAIL and stop that test; never target historical aggregates or sources.
6. V2 and V3 tests were removed from scope by the user. Do not create records in those versions.
7. Allow normal n8n/AI/document-generation processing and callbacks for only these test records. This creates test documents and can consume configured service usage. Do not manually forge a success callback as a substitute for the real workflow.
8. Delete only the two specifically recorded disposable test aggregates, after approval. Keep the case, all evaluations, the retained aggregate and generated documents as evidence. Never delete source evaluations or historical production records.

No deployment, migration push or active n8n workflow modification is included in this proposed data approval.

## Evidence required while running

- Record workflow ID, active/published version and execution IDs. Trace `aggregate_id` and `document_type` through every executed branch/node until the real callback; ensure `evaluation_id` is absent for summaries. Inspect identifier fields without recording headers, credentials or secrets.
- Capture source evaluation fields and the retained aggregate before/after each callback. Compare snapshots to prove that the other document type and individual source results were not overwritten.
- Check ordered `video_case_aggregate_sources` links, compatibility source ID array, source count and every question/section average.
- Record new evaluation IDs, aggregate IDs and document IDs. Verify `/my-forms`, aggregate history, preview rendering and actual PDF/DOCX downloads with the authorized accounts.
- Run leader and admin create/delete tests separately, plus member history and denied delete. UI visibility alone is insufficient evidence of server authorization.
- V2 and V3 are excluded by the latest user instruction.

## Acceptance matrix

| Flow | Result | Missing evidence / blocker |
| --- | --- | --- |
| Active n8n exported Code node contract | PASS | Fresh API readback of active version `1ed79df7-93de-41db-be08-763b7fcc2962`: 9 passed / 0 failed; this is not an E2E execution |
| n8n identity propagation through AI/Merge to callback | PASS (user verified) | User confirmed "ผ่านแล้วนะ" after the node-check checklist; no new execution/export supplied. See latest acceptance closure above and the original trace below |
| Individual n8n through real document callback | PASS | Executions `2981` / `2982`; callbacks target `235` / `236`, `aggregateId: null`, status ready; hashes of both preexisting aggregates remain unchanged |
| V4 individual creation and My Forms data query | PASS | New evaluations `235` / `236`; 236 was created through the visible browser form, all 45 scores verified as 5 |
| Individual `/my-forms` rendering and browser Preview | PASS | Both synthetic evaluations appear; their Preview pages visibly render PDFs with score-1 / score-5 checkmarks |
| Individual PDF/DOCX signed downloads | PASS | User-scoped storage signed URLs returned HTTP 200 for both real generated artifacts |
| Aggregate from two sources, averages and real callback | PASS | Aggregate 98ea15f2-eeb6-4b6a-b782-fd5b0405f52b from 236 / 235; ordered links correct; all 45 question and nine section means 3; execution 2983 callback targets only aggregate; complete source rows unchanged |
| Aggregate preview and PDF/DOCX download | PASS | Browser renders aggregate PDF; both authenticated downloads HTTP 200; browser DOCX exactly matches storage artifact |
| Admin aggregate creation and history | PASS | Existing system admin created the aggregate through browser; history shows the same ID, two sources, and ready document |
| Admin aggregate deletion | PASS | 2026-09-22: normal admin DELETE removed only fixture 5afdf41a-8ff8-4d7e-bc51-f36cdd6912d7 and its links; retained aggregate and evaluations unchanged |
| Non-admin leader creation | PASS | Created 7aea6348-cde1-438c-84fa-d767066dcd52 through the real browser combine flow as editor/case leader; correct source links and means; sources unchanged |
| Non-admin leader deletion | PASS | 2026-09-22: leader deleted 7aea6348-cde1-438c-84fa-d767066dcd52 through actual browser confirmation; independent admin read confirms both fixtures/links gone, retained aggregate and evaluations unchanged |
| Member history and hidden management controls | PASS | 2026-09-22: actual non-admin editor session with case role member reads retained aggregate history; no combine/delete controls; backend can_manage_video_case returns false |
| Member server-side denied delete | PASS | 2026-09-22: real member DELETE against fixture 5afdf41a-8ff8-4d7e-bc51-f36cdd6912d7 returned zero rows; member and admin reads confirm fixture remains; retained aggregate and both source evaluations unchanged |

Individual and aggregate execution evidence is recorded below. Earlier investigation
notes describe their state at that point in time; the matrix and latest closure
above take precedence. Local contract tests alone do not close browser E2E.

## Localhost retry

- Started Vite with `npm.cmd run dev -- --host localhost --port 5173 --strictPort` and a process-scoped `VITE_UPLOAD_VIDEO_API_URL=http://localhost:8080/api/upload-video` override. No environment file was changed.
- Started the existing backend with `npm.cmd run start:upload-api` on port 8080.
- `GET http://localhost:5173/`: HTTP 200; the browser rendered the VIA login form. The Vercel runtime error is absent on this local page.
- `GET http://localhost:8080/`: HTTP 200, expected `Upload API running` response.
- Aggregate API preflight from `http://localhost:5173`: HTTP 204 and matching `Access-Control-Allow-Origin`.
- Inspected the Vite-served service module without printing its environment values: frontend API configuration points to the local backend.
- Supabase and n8n still use their configured external services. Local startup is PASS. V4 login was verified by reaching `/home`, but the current account cannot open the editor-only form. Browser control failed again during the next action.
- The user explicitly approved the reduced scope of one synthetic case, two score 1/5 evaluations and one retained aggregate with real n8n processing. No deletion is included in this reduced scope.
- The user initially requested Chrome profile `Thammachart`, then explicitly authorized using `Phirapon` and reported logging in. Resume with Phirapon once browser control is available; no further profile approval is needed.
- Browser retries fail before inventory/session inspection: `windows sandbox failed: CreateProcessWithLogonW failed: 2`. A tool reset and subsequent retries did not recover browser control. Frontend and backend were rechecked after the user's login report and both still returned HTTP 200. No test records have been created.

## Baseline workflow findings and applied fix

1. Normalize Incoming Payload and Transform VIA Payload distinguish summary versus individual IDs. Calculate Evaluation Stats spreads the input metadata forward. Build Final AppScript Body retrieves IDs from Normalize/Transform and emits exactly one primary ID.
2. Assemble Final Evaluation Context drops `document_type`, `aggregate_id`, sources, averages and callback context, and unconditionally emits `evaluation_id: null` for a summary. The candidate fixes this output contract.
3. AI output and Parse Final Report Sections do not carry all metadata directly. Build Final's upstream references recover the correct target in the local test. This is not proof of wrong callback routing, nor proof that every node output preserves the ID. Apps Script and the real callback remain unverified.
4. Transform VIA Payload and Build Final AppScript Body round every score, including fractional aggregate averages. Actual exported code changes 1.5 to 2 in Transform and 2.5 to 3 in Build Final. Candidate patches preserve decimals for summaries and preserve existing individual rounding.
5. `Set Video Analysis Empty` explicitly assigns `evaluation_id` and omits aggregate metadata; Merge receives the original normalized payload on its other input. Actual cloud merge outputs still need verification.
6. The HTTP Request to `/api/n8n-analysis-result` is gated by `If document_type == evaluation`, so it is not the aggregate document callback. Document creation uses the Apps Script branch with `JSON.stringify($json)` and a callback URL in the body.
7. The locally configured n8n webhook path matches the exported V4 webhook path. The deployed Edge Function's server-side webhook value was not read or changed.

Regression evidence:

- Actual exported workflow code: **6 passed / 3 failed** in 9 contract tests.
- Candidate Code node bodies: **9 passed / 0 failed**.
- Full repository suite: **41 passed / 0 failed**. Build: exit 0. `git diff --check`: exit 0.
- No actual AI request, callback or database write is simulated as a production success in these tests.

## Applied rollout evidence

The user supplied `N8N_API_KEY` in gitignored `.env.local`, enabling public API
access to the approved workflow. Initial GET returned HTTP 200 and confirmed the
original active version and all baseline node hashes before any write.

| Applied node | Active version after readback | Tests on readback |
| --- | --- | --- |
| Transform VIA Payload | `6035b7f6-0282-47e9-9d9b-3553aa0fcefc` | 3 passed / 0 failed |
| Assemble Final Evaluation Context | `87a2b682-2dc7-4b3f-ad42-2d3fc345c383` | 5 passed / 0 failed |
| Build Final AppScript Body | `1ed79df7-93de-41db-be08-763b7fcc2962` | 9 passed / 0 failed |

Each step was completed and tested before the next. Every readback verified exact
expected node changes, active status, matching saved/published versions and node
bodies, and unchanged connections, settings, staticData, pinData, metadata, tags,
shares and description. Credentials and all other node parameters were preserved.
Full snapshots remain outside the repository because they can contain secrets.

The first PUT was rejected with HTTP 400: the n8n 1.123.80 public API settings
schema rejects `timeSavedMode`, although GET returns it. Automatic approval review
then rejected omission of that property due to potential production settings loss.
Read-only inspection of the exact 1.123.80 official source proved that
WorkflowService merges incoming settings over stored settings. The subsequent
approved request omitted only the unsupported property, and readback confirmed
all settings, including `timeSavedMode`, were unchanged. No rejection remains
outstanding. No settings or security controls were changed to bypass review.

Browser automation was retried after the patches and still failed before session
inspection with `failed to start Node runtime: The system cannot find the path
specified. (os error 3)`. Therefore no new actual n8n execution, evaluation,
aggregate, callback or generated document is claimed. The original E2E blockers
and reduced test-data authorization remain as recorded above.

## Individual authentication attempt

- User supplied the test account in `.env.local`. First normal Supabase password login returned HTTP 400 / `invalid_credentials`.
- Found an unquoted `#` in the password assignment, causing dotenv parsing to truncate the value. Quoted the existing value locally, without changing the account password.
- Retried once after that correction: HTTP 400 / `invalid_credentials` again. The configured Supabase project matches the linked project; parsed credentials have no outer whitespace.
- No evaluation, case or aggregate was created, and no n8n execution/callback was triggered. Account role could not be read because login failed.
- Requested that the user verify the same credentials through the production VIA login and correct the local test credentials. No password reset, role change or further login retries were attempted.

## Individual localhost execution — actual results

The user confirmed access to `/form-submit` on localhost, then updated the local
test credentials. Normal Supabase password authentication succeeded with the
existing admin account `ba9a8749-03a7-4e24-8852-8d6d80048657`. No role was changed.

The first read-only GET probe through Vite's n8n proxy failed with HTTP 500 and
`EACCES`: the local process could not access the network inside the sandbox.
Restarted the same Vite server with approved network access. A GET then reached
n8n and returned its expected HTTP 404 for a POST-only webhook. No workflow
execution was triggered by that GET probe; no application code change was needed.

Created one synthetic case and one score-1 individual evaluation through the same
Supabase RPC/insert operations used by the form. Sent the form-shaped payload to
`http://localhost:5173/api/n8n-webhook`, using the existing Postman 3A rubric
template. This was an API-driven localhost integration test, not browser clicks.

| Evidence | Value |
| --- | --- |
| Test title | `VIA-E2E-LOCAL-20260920-01` |
| Case ID | `7e14dbe9-2c77-4be2-b2f7-32c9bfc1d19a` |
| Case key | `e2e-001-via-e2e-local-20260920-01-local01` |
| Evaluation ID | `235` |
| Initial status / section means | `pending`; every section average `1` |
| Localhost POST | HTTP 200 |
| n8n execution | `2981`, success; 2026-09-20 16:15:27.147Z to 16:16:23.514Z |
| Executed active version | `1ed79df7-93de-41db-be08-763b7fcc2962` |
| Document ID | `1Ak4sm7NEsrsAwiW2Rr0QrfOnlRl-kCKFADc9wEOavaw` |
| Callback result | `ok: true`, `status: ready`, `evaluationId: 235`, `aggregateId: null` |
| Final evaluation state | `ready`, `document_error: null` |
| PDF | `evaluations/235/result.pdf`, HTTP 200, 438047 bytes |
| DOCX | `evaluations/235/result.docx`, HTTP 200, 404823 bytes |

The executed node trace carries evaluation ID 235 through Normalize, Merge,
Transform, Stats, Assemble and Build Final. Build Final recovered the ID after
AI/report parsing omitted metadata. The Apps Script response reports the actual
successful callback with that same ID. No manual callback was sent. The analysis
callback also completed, and the evaluation has model `gemini-2.5-flash`.

Before creating the test record, captured hashes of every field in both existing
aggregate rows. After the real callback, both hashes and the aggregate count
matched exactly. No aggregate was modified by this Individual flow.

Authenticated with the same user and ran the exact select/filter/order used by
`MyFormsDashboard`: evaluation 235 is present and ready. Generated signed URLs
with the user's storage access, matching the page's download path, and downloaded
both artifacts. PDF has a valid `%PDF-` header; DOCX is a readable ZIP package with
`word/document.xml`, the synthetic title, and no unresolved `{{...}}` placeholders.
These checks do not establish visual layout quality. No PDF renderer was available.

PDF SHA-256: `19d5196e217805c612a69185936c94e87eda04a4dd27515e6a1980e5b3b8e977`.
DOCX SHA-256: `3152991b072864ea4a29651d19d61fc1d9ac687046a5540911add0adff3d119a`.
Downloaded artifacts and secret-bearing execution data remain in the local temp
directory, outside Git. The user was given `/my-forms` and `/preview/235` links;
actual browser rendering and preview confirmation remain pending.

No source evaluation or existing data was deleted. The second evaluation and the
new aggregate have not been created. V2/V3 remain excluded. No Git push, app
deployment or migration was performed.

## Browser control restored

The user reloaded the VS Code window. Fresh node_repl processes use runtime
`df473e5367fa2b42`; the previous missing-path startup failure no longer occurred.
Initial inventory calls then failed to load the browser request-header policy.
The policy service answered HTTP 200 to a correctly formed read-only initialization
probe. After session reset and further supported browser discovery, Chrome became
available. The exact cause of the temporary policy-loading failure is not proven;
no policy, security check, plugin code or Codex configuration was modified.

Restarted Vite on localhost:5173 after the reload had stopped it. Using the
approved Chrome Phirapon profile, opened `/my-forms`, observed the synthetic row,
clicked its Preview link and visually confirmed the PDF rendered at `/preview/235`.
The screenshot shows the synthetic title and first-page score-1 checkmarks. The
Chrome tab was left open for the user. This closes the previously pending browser
display check for the Individual flow. No new evaluation or aggregate was created
during browser recovery. Browser download-button testing remains separate from
the already verified authenticated API downloads.

## Visible browser submission — second individual

Using the existing synthetic case, clicked Submit review, retained the prefilled
order/title and case link, and selected all 45 rubric scores as 5. The score
buttons toggle on a second click and their accessible names change to a checkmark;
the initial automation locator shifted. Corrected the locator and verified exactly
45 selected buttons, all in the score-5 column, before final submission. The form
correctly blocked an intermediate incomplete selection; no partial record was sent.

Created evaluation `236` through the form and its confirmation dialog. My Forms
displayed `Evaluation ID: 236` and its pending row, then the real callback made it
ready. The existing case details show two reviews, one reviewer, means 1.0 / 5.0,
and source links `/preview/235` / `/preview/236`. This run proves two evaluations,
not two distinct reviewer accounts.

| Evidence | Value |
| --- | --- |
| Evaluation / case | `236` / `7e14dbe9-2c77-4be2-b2f7-32c9bfc1d19a` |
| All section means | `5` across nine sections |
| n8n execution | `2982`, success, 16:44:36.284Z to 16:45:34.444Z |
| Executed active version | `1ed79df7-93de-41db-be08-763b7fcc2962` |
| Real callback | `ok: true`, `status: ready`, `evaluationId: 236`, `aggregateId: null` |
| Document ID | `1RQqo-Fx3V-9eemn51KXNAlbPgAY4Itt1LHBCWbtjFIA` |
| PDF | `evaluations/236/result.pdf`, HTTP 200, 438030 bytes |
| DOCX | `evaluations/236/result.docx`, HTTP 200, 404716 bytes |
| Existing aggregates | Count 2; both complete-row hashes match the pre-individual snapshot |

Chrome visibly rendered the six-page PDF with the synthetic title and score-5
checkmarks. My Forms lists both ready source evaluations. Clicking Download DOCX
saved `result (7).docx` in Downloads; its bytes exactly match the authenticated
storage download. It is a valid Word ZIP package, contains the test title and has
no unresolved template placeholders. The PDF button was clicked, but browser-only
save/open behavior has not yet been confirmed; authenticated PDF download and
in-page PDF rendering are independently verified.

PDF SHA-256: `c74603fee0b86c494fa962f07d2238520b7fdff70143bb742a23cc69e21ac6fa`.
DOCX SHA-256: `11c7d9a138efe90c2228b243f0ed9ce803d700f842762333eb213651363fed79`.

The first browser combine attempt failed before insertion because local
`GEMINI_API_KEY` was absent. The user then supplied it in `.env.local`. Google's
model-list API returned HTTP 200 and confirmed `gemini-2.5-flash` supports
generateContent; the old default `gemini-1.5-flash` was absent. Added the local
`GEMINI_MODEL=gemini-2.5-flash` setting and restarted the backend. No production
configuration, architecture or role model was changed.

## Real aggregate execution and document acceptance

Retried the same two selected evaluations through the browser. Gemini analysis
succeeded and the normal authenticated insert created one retained aggregate.
The source ID array is `[236, 235]`; relational source rows have positions 1 / 2
in that order. All 45 question averages and all nine section averages equal 3.
Complete source evaluation rows matched their pre-aggregation snapshot.

Clicked Send to n8n on the summary page. The page reported the aggregate ID,
then its document Preview became ready and visibly rendered a six-page PDF with
the Aggregate Report title and score-3 checkmarks. History shows the exact
aggregate ID, source IDs, creator identity, and ready document status.

| Evidence | Value |
| --- | --- |
| Aggregate ID | `98ea15f2-eeb6-4b6a-b782-fd5b0405f52b` |
| n8n execution | `2983`, success, 16:55:21.112Z to 16:56:08.828Z |
| Executed active version | `1ed79df7-93de-41db-be08-763b7fcc2962` |
| Document ID | `1K4QA9V9iyEt25pjQKoPLcSG64h-H9B-1er95d3LDjhM` |
| Real callback | `ok: true`, `status: ready`, matching `aggregateId`, `evaluationId: null` |
| Source preservation | Both complete evaluation rows identical before and after aggregate callback |
| PDF | `video-case-aggregates/98ea15f2-eeb6-4b6a-b782-fd5b0405f52b/result.pdf`, HTTP 200, 441070 bytes |
| DOCX | `video-case-aggregates/98ea15f2-eeb6-4b6a-b782-fd5b0405f52b/result.docx`, HTTP 200, 404751 bytes |

The webhook input and final Apps Script request carry `document_type:
video_case_summary`, the correct `aggregate_id`, and no `evaluation_id` property.
The callback targets that aggregate and never aliases either source evaluation.

The real trace is not a claim that every node's standalone output includes the
ID. Set Video Analysis Empty emits `evaluation_id: null` and no aggregate ID;
Merge restores the aggregate ID from the other input, and Transform removes the
irrelevant null evaluation property. The two AI nodes and report parser output
content only; Build Final recovers identity through its existing upstream node
references. Normalize, Transform, Stats, Merge Evaluation Sources, Assemble and
Build Final all retain the correct aggregate ID. The aggregate branch does not
run the individual-only HTTP Request analysis callback. No further workflow
mutation was made. At this stage, literal metadata presence on every content-only
node was not established despite the correct end-to-end callback. The user later
closed the remaining identity-propagation acceptance item; see the latest closure
above. That confirmation does not change this historical trace.

The authenticated document-artifact-url Edge Function supplied both download
URLs. PDF has a valid `%PDF-` header. Browser Download DOCX saved
`result (8).docx`; it exactly matches the downloaded storage object, is a valid
Word package, contains the synthetic Aggregate Report title and has no unresolved
template placeholders. The browser PDF link was clicked; separate browser file
save was not observed. In-page PDF rendering and the actual HTTP PDF download
are verified.

PDF SHA-256: `c1f4d846e7374ee3ea28718587de1a5716586e637a12e6fd9c91d3f1b8675393`.
DOCX SHA-256: `f90467b37640a2fb30320599813875d53f769b102968080dbb2cb82638231990`.

Remaining acceptance: designated non-admin leader/member sessions; member
history/denied deletion; explicit authorization for disposable aggregate
creation/deletion before leader/admin delete tests. The retained aggregate,
case and both source evaluations were preserved. No app deployment, migration,
Git commit or push occurred. Automated checks remain 41 passed / 0 failed;
build and git diff --check pass. `.env.local` is ignored by Git.

## Member acceptance — 2026-09-22

The user created `via-e2e-member` (auth ID
`9546a2e6-4245-4e91-b5f5-26a0ca6409af`, test employee ID `E2E-MEMBER-01`)
and changed its global role from user to editor themselves. The agent did not
change that role. Before membership, the real browser showed no cases and the
direct test-case URL returned Video case not found.

The user explicitly approved adding this account as member of only the existing
synthetic case. An authenticated admin insert was rejected by RLS because the
membership insert policy also requires auth.uid() = user_id. No policy was
changed. Used the existing resolveVideoCaseMembership application service and
resolve_video_case_membership RPC under the actual member browser session.
A temporary localhost-only test page guarded the exact account and supplied
the existing order, subject and short code with memberRole member. It was
removed after testing and is not part of the deliverable or production build.

Created membership ID `8e1c2dc9-30fd-43df-8ba8-8af6c9d8db50` in case
`7e14dbe9-2c77-4be2-b2f7-32c9bfc1d19a`. Under that same member session,
current_video_case_role returned member, can_manage_video_case returned false,
and the authenticated aggregate history query returned the retained ready
aggregate `98ea15f2-eeb6-4b6a-b782-fd5b0405f52b` with sources `[236,235]`.

The actual case detail page then showed Your role: member, both source
evaluations, and the ready aggregate history row with its correct source IDs
and summary link. No combine button, selection checkboxes or delete buttons
were present. Member history and UI restrictions pass. This does not prove
DELETE RLS enforcement: no deletion request was made. Server-side denial and
leader/admin successful deletion still require authorized disposable records;
case leader assignment also remains unapproved. No source evaluation or
retained aggregate was deleted, and no migration, deployment or push occurred.

### Disposable admin fixture prepared

The user approved creating disposable aggregate test data. Created one fixture
with the normal admin session, ID `5afdf41a-8ff8-4d7e-bc51-f36cdd6912d7`, in
the same synthetic case. Its source_snapshot marker is
`VIA-E2E-ROLE-20260922-ADMIN-DELETE`; ordered relational sources are 236 / 235.
It contains copied score averages for permission testing, no AI output or
document paths, and no n8n/document generation was requested. Document status
is pending intentionally; this is not an additional document acceptance run.
The second approved fixture is reserved for later creation under a case leader.

Actual member browser history now shows both this fixture and the retained
aggregate, with no deletion controls. A temporary local test page is prepared
to issue DELETE only for this exact fixture under the exact member account,
guarding the case role and fixture marker and verifying that the row remains.
No DELETE has been sent. Explicit confirmation of that destructive test was
requested, since the user's last approval specified creation only. Leader
assignment and successful admin/leader deletion remain pending authorization.

### Member DELETE enforcement — PASS

After the user confirmed proceeding with the exact fixture DELETE test, clicked
the guarded local test-page button under the real non-admin member session.
The authenticated DELETE returned HTTP 200, no error code, and `deletedIds: []`.
This is an RLS-filtered no-op, not a successful deletion. The subsequent member
SELECT still returned the same fixture ID. An independent admin read at
`2026-09-22T06:35:15.311Z` also confirmed that fixture exists with its original
acceptance marker. Complete retained aggregate and source evaluation rows match
the pre-role-test snapshots exactly. Membership remains member.

Member history, hidden management UI and actual server-side DELETE denial now
pass. Admin successful DELETE and separate non-admin leader create/delete remain
open. The test page was removed after capturing this evidence.

### Admin DELETE and case-scoped leader assignment

The user confirmed proceeding after being asked to approve deletion of the
exact disposable admin fixture and promotion of the test membership only.
Normal admin DELETE returned HTTP 200 and exactly the ID
`5afdf41a-8ff8-4d7e-bc51-f36cdd6912d7`. Readback at
`2026-09-22T07:00:40.600Z` confirmed zero remaining fixture rows and zero fixture
source links. The complete retained aggregate and evaluation rows remain
identical to the pre-role-test snapshots.

After checking that no other leader existed in the synthetic case, changed
membership `8e1c2dc9-30fd-43df-8ba8-8af6c9d8db50` to leader for only that case.
Readback at `2026-09-22T07:01:18.010Z` confirms the case-scoped role and the
unchanged global editor role. Reloaded the real browser: Your role: leader and
combine/delete controls are now visible. Selected existing sources 236 / 235
and confirmed normal UI aggregation to create the second approved test record.

The normal leader UI flow completed and created
`7aea6348-cde1-438c-84fa-d767066dcd52`, requested_by
`9546a2e6-4245-4e91-b5f5-26a0ca6409af`. Source array and ordered links are
236 / 235; every question and section mean is 3. Complete retained aggregate
and evaluation snapshots remain unchanged. No Send to n8n action was requested
for this disposable leader record, so document status remains pending.
Successful leader creation is verified; deletion awaits action-time confirmation.

### Leader DELETE and final role verification — PASS

The user confirmed deleting the exact leader fixture. The earlier modal was no
longer open, so reselected only the row whose full ID was
`7aea6348-cde1-438c-84fa-d767066dcd52`, checked the modal target and clicked
Delete under the actual editor/case-leader browser session. The application
history then showed only the retained ready aggregate, with both individual
evaluations still listed. No source evaluation delete button was used.

Independent admin readback at `2026-09-22T10:05:29.112Z` confirmed:

- Both disposable aggregate IDs are absent; their relational source links are absent.
- Retained aggregate `98ea15f2-eeb6-4b6a-b782-fd5b0405f52b` matches its complete pre-test snapshot.
- Evaluations 235 / 236 match their complete pre-test snapshots.
- Test account global role is still editor; membership remains leader only in the approved synthetic case.

All requested member/leader/admin functional role checks now pass. No application
code or RLS/migration change was required for these tests. Temporary test pages
have been removed. At the end of this role test, the workflow qualification was
literal ID presence in every intermediate node output; the later user-confirmed
closure is recorded at the top of this report. The real trace retains the evidence
for end-to-end identity routing and callback correctness.
Figma all-page capture/mapping and Git commit/push are separate remaining work.

## Local pre-commit verification — 2026-09-23 12:44 +07:00

Figma work is paused at the user's request. This run made no production requests,
workflow edits, database writes, deployments, migrations, commits or pushes.
The production acceptance results above remain historical evidence; they were
not rerun or reverified against the live environment in this check.

- HEAD: `55c7904`.
- `npm.cmd test`: 41 passed, 0 failed, 0 skipped (including 9 n8n regression tests).
- `npm.cmd run build`: exit 0; existing >500 kB chunk warning remains.
- `git diff --check`: exit 0. Since all candidate additions are untracked, also
  scanned all 12 new files for trailing whitespace: no findings.
- Secret screening of the 12 new files: no matches for tested private-key,
  JWT/API-key or signed-token URL patterns; no matches for configured secret
  values of at least 12 characters from local env files. This is a targeted
  screen, not a guarantee that every possible sensitive-data format is covered.
  No secret values were printed or recorded. `.env` and `.env.local` are ignored.
- Working tree: no tracked changes; untracked n8n patch files, regression test,
  acceptance report and paused Figma fixture/documentation remain preserved.
- Suggested commit scope for the completed non-Figma work: `n8n/`,
  `tests/n8nVideoCaseContract.test.js`, and this acceptance report.
  Figma work remains incomplete and should be handled separately.
- No new implementation defect was found by this verification. Commit and push
  still await explicit user authorization.

### Git publication authorization
After the local checks above, the user explicitly authorized committing and pushing the V4 n8n patches, regression test and this report. Paused Figma work is excluded. The resulting commit and remote publication are verified in the delivery response; no additional production mutation is part of this publication.
