# Video Group Evaluations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins and case leaders combine evaluations from any cases into a separately stored, named "group evaluation" that produces an AI summary and PDF/DOCX through the existing n8n pipeline.

**Architecture:** Two new Postgres tables plus one RPC own creation and permissions. The group's UUID travels to n8n in the existing `aggregate_id` slot; edge functions detect it by looking it up in the new table and treat it as a new dispatch kind `group`. New pages under `/video-groups` replace the per-case combine buttons.

**Tech Stack:** Supabase (Postgres migrations, Deno edge functions), React + TypeScript + Vite, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-12-video-group-evaluations-design.md`

## Global Constraints

- Group type values (stored): `group`, `round`, `year_end`; labels: "กลุ่ม", "รวมรอบ", "สรุปปลายปี". Dropdown only; DB CHECK enforces the three values.
- Minimum sources: `MIN_COMBINE_COUNT` = 2 (from `src/services/videoCaseCombineSelectionCore.js`); only `document_status === "ready"` evaluations are selectable.
- Identity: a group is a duplicate when `normalize(order_number)`, `group_type`, `normalize(subject_name)` all match, where normalize = `lower(btrim(x))` with whitespace runs → `-` (same as `normalize_video_case_key_part`). **Plan refinement of spec §1:** enforce this with a unique expression index on the three parts instead of one concatenated `group_key` (a concatenated key collides, e.g. `("1","round","group-x")` vs `("1-round","group","x")`). Task 1 amends the spec.
- n8n workflow is NOT modified. Payload keeps `document_type: "video_case_summary"`, `aggregate_id = group.id`, and never contains `evaluation_id`.
- Never run migrations on the real Supabase project, call n8n/AI for real, or fetch n8n `/rest/` from page JS without asking the user first.
- Test command: `node --test "tests/**/*.test.js"`; build: `npm run build` (typecheck + vite). Existing tests must stay green.
- Commit messages: `feat:`/`fix:`/`test:`/`docs:` prefix, ending with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- New UI text goes through `t()` with keys added to both `th` and `en` in `src/i18n/translations.ts`.

## Review Focus

1. Duplicate detection ignores case and surrounding/inner whitespace (`"001 "` + `"Round A"` equals `"001"` + `"round  a"`) — pinned in Task 1 and Task 2 tests.
2. A leader selecting an evaluation from a case they cannot view is rejected as a whole, nothing half-written — Task 2 migration test.
3. Selection containing a duplicate ID or a non-`ready` evaluation is rejected by the RPC even if the UI allowed it — Task 2 migration test.
4. A legacy `video_case_aggregates` row still dispatches and still resolves as kind `aggregate` after this change — Task 4 tests.
5. Thai order numbers and subject names survive normalization and reach the n8n payload unchanged — Task 1 and Task 5 tests.

---

### Task 1: Group core logic and spec amendment

**Files:**
- Create: `src/services/videoGroupCore.js`, `src/services/videoGroupCore.d.ts`
- Test: `tests/videoGroupCore.test.js`
- Modify: `docs/superpowers/specs/2026-11-12-video-group-evaluations-design.md` (§1 and the decisions table: replace `group_key` with the unique expression index; §2 step 3: the review step on the create page shows averages only, and the editable suggestion draft plus the send action live on the group detail page, still before anything goes to n8n)

**Interfaces:**
- Produces:
  - `GROUP_TYPES: ReadonlyArray<{ value: "group" | "round" | "year_end"; label: string }>`
  - `normalizeGroupPart(value: string): string`
  - `buildVideoGroupIdentity(orderNumber: string, groupType: string, subjectName: string): string` — returns `""` if any part is empty/invalid, otherwise the three normalized parts joined by `"\u0000"` (client-side duplicate pre-check only; the DB index is authoritative)
  - `getGroupTypeLabel(groupType: string): string`
  - `buildVideoGroupDisplayName(groupType: string, subjectName: string): string` — `"<label> <subject trimmed>"`
  - `validateVideoGroupForm(form: { orderNumber: string; groupType: string; subjectName: string }): string | null` — Thai error message or `null`

- [ ] **Step 1: Write failing tests** in `tests/videoGroupCore.test.js`: `GROUP_TYPES` values/labels equal the Global Constraints list; `normalizeGroupPart("  A  b ")` is `"a-b"`; `buildVideoGroupIdentity("001 ","round","Round  A")` equals `buildVideoGroupIdentity("001","round","round a")`; Thai input `"สั่งงาน 1"` normalizes to `"สั่งงาน-1"`; unknown type or empty part returns `""`; `buildVideoGroupDisplayName("round"," Q1 ")` is `"รวมรอบ Q1"`; `validateVideoGroupForm` returns a message for each missing field and `null` when valid.
- [ ] **Step 2:** Run `node --test tests/videoGroupCore.test.js` — expect FAIL (module missing).
- [ ] **Step 3:** Implement the functions in `videoGroupCore.js` with `.d.ts` typings (follow `videoCaseCombineSelectionCore.js` + `.d.ts` pairing).
- [ ] **Step 4:** Run the test file — expect PASS.
- [ ] **Step 5:** Amend the spec as described, then commit: `git add src/services/videoGroupCore.* tests/videoGroupCore.test.js docs/superpowers/specs/2026-11-12-video-group-evaluations-design.md` — `feat: add video group identity and form validation core`.

### Task 2: Migration — tables, RLS, create RPC

**Files:**
- Create: `supabase/migrations/20261112090000_video_group_evaluations.sql`
- Test: `tests/videoGroupEvaluationsMigration.test.js` (source-regex style like `tests/videoCaseAggregateHistoryMigration.test.js`)

**Interfaces:**
- Produces (SQL):
  - table `public.video_group_evaluations` and `public.video_group_evaluation_sources` with the columns listed in spec §1 (no `group_key`); unique index named `video_group_evaluations_identity_idx` on `(public.normalize_video_case_key_part(order_number), group_type, public.normalize_video_case_key_part(subject_name))`; `CHECK (group_type IN ('group','round','year_end'))`
  - `public.can_view_video_group(p_group_id uuid) RETURNS boolean` — SECURITY DEFINER, `STABLE`: admin (`role_at_least('admin')`) or any source row with `can_view_video_case(video_case_id)`; used by both select policies so the two tables never reference each other's RLS
  - `public.create_video_group_evaluation(p_order_number text, p_group_type text, p_subject_name text, p_evaluation_ids bigint[], p_source_snapshot jsonb, p_combined_scores jsonb, p_section_averages jsonb) RETURNS public.video_group_evaluations`

- [ ] **Step 1: Write failing tests** asserting on the migration source: both tables exist with RLS enabled; no `INSERT`/`UPDATE`/`DELETE` policy for `authenticated` on either table; the unique index name and its three expression parts; the `CHECK` list; no trigger enforcing a single case; the RPC is `SECURITY DEFINER`, requires `auth.uid()`, rejects fewer than 2 ids, duplicate ids, non-`ready` evaluations and evaluations the caller cannot view (`can_view_video_case`) unless admin, requires admin or leader of at least one source case, and maps requester name/employee number from `user_information` the way `20260728170000_video_case_aggregate_requester_snapshot.sql` does; `GRANT EXECUTE` only to `authenticated`.
- [ ] **Step 2:** Run the test file — expect FAIL (file missing).
- [ ] **Step 3:** Write the migration. The RPC writes the group and its sources (`source_position` from array order, `video_case_id` from each evaluation) in one transaction and stores the three JSON parameters as given. Duplicate identity surfaces as the unique-index violation (client maps by index name).
- [ ] **Step 4:** Run the test file — expect PASS. Do not apply to a real database.
- [ ] **Step 5:** Commit `feat: add video group evaluation tables and create RPC`.

### Task 3: Migration — dispatch kind `group`, close legacy aggregate creation

**Files:**
- Create: `supabase/migrations/20261112091000_video_group_dispatch.sql`
- Test: `tests/videoGroupDispatchMigration.test.js` (extend the style of `tests/directDocumentDispatch.test.js`; read it first)

**Interfaces:**
- Consumes: `video_group_evaluations` from Task 2.
- Produces: `begin_document_dispatch(p_kind text, p_id text, p_payload jsonb)` and `finish_document_dispatch(...)` accepting `p_kind = 'group'`; trigger `sync_group_dispatch_callback`.

- [ ] **Step 1: Write failing tests** on the migration source: `document_dispatches_target_kind_check` is dropped and re-added with `('evaluation','aggregate','group')`; both functions are re-created with a `'group'` branch that locks `video_group_evaluations` `FOR UPDATE`, requires `requested_by = auth.uid()` or admin (finish has no auth check, as today), sets `document_status='pending'` and injects `'document_type','video_case_summary','aggregate_id',<group id>` into the secured payload; the `aggregate` and `evaluation` branches are textually unchanged; trigger `sync_group_dispatch_callback` calls `sync_document_dispatch_callback('group')` after update of `document_status,pdf_storage_path,docx_storage_path`; `video_case_aggregates_insert_leader` is dropped and no new insert policy is created; the original REVOKE/GRANT lines for both functions are repeated.
- [ ] **Step 2:** Run the test file — expect FAIL.
- [ ] **Step 3:** Write the migration by copying the two function definitions from `20261023090000_direct_document_dispatch.sql` and adding the branch; no change to the case-in-trash check for groups (`case_id` stays NULL).
- [ ] **Step 4:** Run the test file — expect PASS.
- [ ] **Step 5:** Commit `feat: dispatch documents for video group evaluations`.

### Task 4: Edge functions resolve group targets

**Files:**
- Modify: `supabase/functions/_shared/documentTarget.js`, `supabase/functions/_shared/directForward.js`, `supabase/functions/document-generation-callback/index.ts`, `supabase/functions/document-artifact-url/index.ts`
- Test: `tests/documentTarget.test.js`, `tests/directForward.test.js`, `tests/documentCallback.test.js` (add cases; update their fake clients to support the new `from(...).select().eq().maybeSingle()` lookup)

**Interfaces:**
- Consumes: Task 3 `group` kind.
- Produces: `resolveDocumentTargetWithGroups(payload: object, groupExists: (id: string) => Promise<boolean>): Promise<Target>` in `documentTarget.js` — calls `resolveDocumentTarget`; if the result is `kind: "aggregate"` and `groupExists(id)` is true returns `{ kind: "group", table: "video_group_evaluations", id, documentType: "video_case_summary" }`; otherwise returns the original target. `resolveDocumentTarget` itself stays synchronous and unchanged.

- [ ] **Step 1: Write failing tests:** `documentTarget` — group UUID → kind `group`; unknown UUID → `aggregate`; evaluation payloads never call `groupExists`. `directForward` — a payload whose `aggregate_id` is a group calls `begin_document_dispatch` with `p_kind: "group"` and replies with `groupId`; a legacy aggregate still sends `p_kind: "aggregate"` (Review Focus 4). `documentCallback` — a group callback updates `video_group_evaluations` and responds `ok` with `aggregateId` equal to the id n8n sent plus `groupId`. Artifact URL: a group id returns signed URLs for its paths; a non-creator who cannot view any source case gets 403 (assert on the permission helper, extracted as a small exported function if the function body cannot be tested directly).
- [ ] **Step 2:** Run the three test files — expect FAIL on new cases only.
- [ ] **Step 3:** Implement. Lookups: `directForward` uses the user-scoped client (RLS applies), callback and artifact-url use the service client. In artifact-url the group permission is: admin, or `requested_by` equals the user, or the user is a member of any source case (`video_group_evaluation_sources` → `video_case_members`); check the group table before the aggregate table.
- [ ] **Step 4:** Run `node --test "tests/**/*.test.js"` — expect all PASS.
- [ ] **Step 5:** Commit `feat: resolve group documents in dispatch, callback and artifact URL`.

### Task 5: Group service and n8n payload

**Files:**
- Create: `src/services/videoGroupPayloadCore.js`, `src/services/videoGroupPayloadCore.d.ts`, `src/services/videoGroupService.ts`
- Test: `tests/videoGroupPayloadCore.test.js`, `tests/videoGroupService.test.js` (use `tests/helpers/tsLoader.js` and `globalThis.__fakeSupabase` as in `tests/videoCaseService.test.js`)

**Interfaces:**
- Consumes: `combineAggregateStatistics` (`aggregateStatistics.js`), `toCombineSourceRuns`, `MIN_COMBINE_COUNT`, `buildVideoCaseSummaryPayload`, `buildVideoGroupDisplayName`.
- Produces in `videoGroupPayloadCore.js`: `buildVideoGroupSummaryPayload({ group, requestedByEmployeeNumber, combinePrompt }): object` — the `buildVideoCaseSummaryPayload` output for the group with `order_number = group.order_number`, `subject_name = buildVideoGroupDisplayName(group.group_type, group.subject_name)`, `video_case_id` = first source's case, no `evaluation_id`.
- Produces in `videoGroupService.ts`:
  - `type VideoGroupType = "group" | "round" | "year_end"`, `type VideoGroupRow` (all table columns), `type SelectableEvaluationRow = VideoCaseEvaluationRow & { video_cases: { case_key: string; case_title: string | null } | null }`
  - `getSelectableEvaluations(): Promise<SelectableEvaluationRow[]>` — `evaluations` where `document_status = 'ready'` and `video_case_id` not null, embedding `video_cases(case_key, case_title)`, newest first
  - `createVideoGroupEvaluation(params: { orderNumber: string; groupType: VideoGroupType; subjectName: string; sourceRuns: SelectableEvaluationRow[]; }): Promise<VideoGroupRow>` — rejects below `MIN_COMBINE_COUNT`; computes stats with `combineAggregateStatistics(toCombineSourceRuns(...))`; calls RPC `create_video_group_evaluation`; maps unique violation on `video_group_evaluations_identity_idx` to "มีแบบประเมินกลุ่มนี้อยู่แล้ว (เลขที่สั่งงาน ประเภท และชื่อหัวข้อซ้ำกัน)"
  - `getVideoGroups(): Promise<VideoGroupRow[]>`, `getVideoGroup(id: string): Promise<VideoGroupRow | null>`, `getVideoGroupSources(id: string): Promise<Array<{ evaluation_id: number; video_case_id: string; source_position: number }>>`
  - `getVideoGroupDocumentUrls(id: string): Promise<{ pdfUrl: string | null; docxUrl: string | null }>` (invokes `document-artifact-url` with `aggregateId: id`)
  - `sendVideoGroupToN8n(id: string, combinePrompt: string | null): Promise<VideoGroupRow>` — mirrors `sendVideoCaseAggregateToN8nWithPrompt`: returns early when `document_status === "ready"`, invokes `forward-to-n8n` with `buildVideoGroupSummaryPayload`, re-reads the group after the call

- [ ] **Step 1: Write failing tests:** payload has `document_type: "video_case_summary"`, `aggregate_id`, no `evaluation_id`, Thai `order_number`/`subject_name` unchanged (Review Focus 5), `evaluators` and `suggestions` present; `createVideoGroupEvaluation` with one source throws the min-count message and never calls the RPC; with two sources calls the RPC with `p_evaluation_ids` in selection order and averaged `p_combined_scores`; a `23505` error naming the identity index becomes the duplicate message; `sendVideoGroupToN8n` skips the invoke when already `ready`.
- [ ] **Step 2:** Run both test files — expect FAIL.
- [ ] **Step 3:** Implement both modules and `.d.ts`.
- [ ] **Step 4:** Run both test files — expect PASS.
- [ ] **Step 5:** Commit `feat: add video group service and summary payload`.

### Task 6: Evaluation picker and create page

**Files:**
- Modify: `src/components/CaseEvaluationPicker.tsx`
- Create: `src/page/VideoGroupCreatePage.tsx`
- Modify: `src/i18n/translations.ts` (add `videoGroups.*` keys, th + en)
- Test: `tests/videoGroupPages.test.js` (source-regex style like `tests/videoCaseGroupEvaluationPage.test.js`)

**Interfaces:**
- Consumes: Task 1 and Task 5 exports; `getCombineBlockReason`.
- Produces: `CaseEvaluationPicker` accepts `analyses: Array<VideoCaseEvaluationRow & { video_cases?: { case_key: string; case_title: string | null } | null }>` and shows the case label under each row when `video_cases` is present (existing callers unchanged). `VideoGroupCreatePage` (default export) has three stacked steps — pick (search box filters by order number, subject name, case label), name (order number input, group type `<select>` over `GROUP_TYPES`, subject name input, inline duplicate/validation message from `validateVideoGroupForm`), review (per-section averages read-only + "สร้างแบบประเมินกลุ่ม" button). On success it navigates to `/video-groups/<id>`. Query `?caseId=<uuid>` pre-selects that case's `ready` evaluations. Create button is disabled while busy and re-enabled in `finally`; errors show in the existing red error box style.

- [ ] **Step 1: Write failing tests:** page source uses `getSelectableEvaluations`, `CaseEvaluationPicker`, `GROUP_TYPES`, `validateVideoGroupForm`, `createVideoGroupEvaluation`, `getCombineBlockReason`, navigates to `/video-groups/`, reads `caseId` from the query string; picker source renders the case label; translations contain every `videoGroups.*` key used, in both languages.
- [ ] **Step 2:** Run `node --test tests/videoGroupPages.test.js` — expect FAIL.
- [ ] **Step 3:** Implement; follow the layout and class conventions of `VideoCasesPage.tsx`.
- [ ] **Step 4:** Run the test file and `npm run build` — expect PASS and a clean typecheck.
- [ ] **Step 5:** Commit `feat: add video group create page`.

### Task 7: List and detail pages, routes, navigation

**Files:**
- Create: `src/page/VideoGroupsPage.tsx`, `src/page/VideoGroupDetailPage.tsx`
- Modify: `src/App.tsx`, `src/components/ProfileDropdown.tsx`, `src/page/Home.tsx`, `src/i18n/translations.ts`
- Test: `tests/videoGroupPages.test.js` (add cases)

**Interfaces:**
- Consumes: Task 5 service.
- Produces: routes `/video-groups`, `/video-groups/new`, `/video-groups/:groupId`, each wrapped in a plain `<ProtectedRoute>` (no `requiredRole`; the RPC and RLS are the authority, the link visibility below is only UX). `VideoGroupsPage` lists groups (display name, order number, source count, document status) with a "สร้างแบบประเมินกลุ่ม" link shown only to admin/leader-capable users. `VideoGroupDetailPage` shows the 9 sections / 45 averages read-only with `SectionCard` (same rendering approach as `VideoCaseSummaryPage.tsx`), the source list with case labels, an overall-suggestion textarea prefilled by `buildCombinedSuggestionDraft(sourceRuns)`, a send/resend button calling `sendVideoGroupToN8n`, and PDF/DOCX links from `getVideoGroupDocumentUrls` when `document_status === "ready"`; guards against double submit with a ref like `submittingRef` in the existing page.

- [ ] **Step 1: Write failing tests:** `App.tsx` registers the three routes; list page links to `/video-groups/new`; detail page uses `sendVideoGroupToN8n`, `getVideoGroupDocumentUrls`, `buildCombinedSuggestionDraft` and a `submittingRef`; `ProfileDropdown` and `Home` link to `/video-groups`.
- [ ] **Step 2:** Run `node --test tests/videoGroupPages.test.js` — expect FAIL on new cases.
- [ ] **Step 3:** Implement pages, routes and links.
- [ ] **Step 4:** Run the test file and `npm run build` — expect PASS.
- [ ] **Step 5:** Commit `feat: add video group list and detail pages`.

### Task 8: Retire per-case combine

**Files:**
- Modify: `src/page/VideoCasesPage.tsx`, `src/page/VideoCaseDetailPage.tsx`, `tests/videoCaseGroupEvaluationPage.test.js`
- Modify: `src/services/videoCaseService.ts` — remove `combineVideoCaseAnalyses` only if no remaining importer (grep first)

**Interfaces:**
- Consumes: route `/video-groups/new?caseId=<id>` from Task 6.

- [ ] **Step 1: Update tests first:** in `tests/videoCaseGroupEvaluationPage.test.js` replace the `VideoCasesPage` and `VideoCaseDetailPage` assertions with: each page links to `/video-groups/new?caseId=` and no longer contains `combineVideoCaseAnalyses`, `handleCombine` or `CaseEvaluationPicker`. Keep the summary-page assertions (legacy page stays).
- [ ] **Step 2:** Run the file — expect FAIL.
- [ ] **Step 3:** Replace the combine section, confirm modal state and handler in both pages with a link "รวมเป็นแบบประเมินกลุ่ม" to the create page (visible to the same users as before); delete now-unused imports and state.
- [ ] **Step 4:** Run `node --test "tests/**/*.test.js"` and `npm run build` — expect all PASS, no unused-import typecheck errors.
- [ ] **Step 5:** Commit `refactor: send per-case combine to the video group create page`.

### Task 9: Contract docs and final verification

**Files:**
- Modify: `docs/n8n-video-case-summary-contract.md`, `docs/superpowers/specs/2026-11-11-video-group-evaluation-design.md` (status line: superseded in part by the 2026-11-12 spec)

- [ ] **Step 1:** In the contract doc, add that `aggregate_id` may be the UUID of a video group evaluation, that the server distinguishes it by table lookup, and that n8n must keep treating it as an opaque UUID.
- [ ] **Step 2:** Run `node --test "tests/**/*.test.js"` and `npm run build` — expect 0 failures and a successful build.
- [ ] **Step 3:** Commit `docs: document group evaluations in the n8n summary contract`.
- [ ] **Step 4:** Report to the user what still needs their approval: applying the two migrations to Supabase, deploying the edge functions, and one real group document through n8n (confirm n8n accepts a payload without a same-case `video_case_id` constraint).
