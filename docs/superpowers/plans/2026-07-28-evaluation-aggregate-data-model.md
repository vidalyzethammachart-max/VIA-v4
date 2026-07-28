# Evaluation and Aggregate Data Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate individual evaluation identifiers from aggregate summary identifiers, add relational source integrity, and preserve compatibility with VIA V2 and VIA V3 on the shared Supabase project.

**Architecture:** VIA V4 will build summary payloads through a pure tested module that emits `aggregate_id` without any `evaluation_id` alias. Supabase Edge Functions will share a tested document-target resolver, while an additive database migration will repair document columns and maintain `video_case_aggregate_sources` from the existing `source_evaluation_ids` array through a trigger.

**Tech Stack:** React 18, TypeScript, Node.js `node:test`, Supabase PostgreSQL migrations, Supabase Edge Functions on Deno, Postman collection JSON.

## Global Constraints

- Do not drop, rename, or reinterpret existing tables or columns.
- VIA V2, VIA V3, and VIA V4 share the same Supabase project.
- Individual evaluations use only `evaluation_id`.
- Combined summaries use only `aggregate_id`.
- Preserve `source_evaluation_ids` for compatibility.
- Preserve `google_doc_id`, `evaluation_kind`, `analysis_kind`, and `video_case_aggregate_runs`.
- Do not push migrations, deploy Edge Functions, or change n8n until local review passes and the user explicitly approves the external action.
- Preserve unrelated dirty-worktree changes.

---

### Task 1: Add a Tested Summary Payload Boundary

**Files:**
- Create: `src/services/videoCaseSummaryPayloadCore.js`
- Create: `src/services/videoCaseSummaryPayloadCore.d.ts`
- Create: `tests/videoCaseSummaryPayloadCore.test.js`
- Modify: `src/services/videoCaseService.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: aggregate rows with `id`, `video_case_id`, `source_evaluation_ids`, `source_count`, `source_snapshot`, `combined_scores`, `section_averages`, `ai_output`, and `ai_raw_text`.
- Produces: `buildVideoCaseSummaryPayload(options)` returning a summary payload with `aggregate_id` and no evaluation identifier fields.

- [ ] **Step 1: Add the Node test command**

Add this script to `package.json`:

```json
{
  "scripts": {
    "test": "node --test \"tests/**/*.test.js\""
  }
}
```

- [ ] **Step 2: Write the failing summary payload tests**

Create `tests/videoCaseSummaryPayloadCore.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildVideoCaseSummaryPayload } from "../src/services/videoCaseSummaryPayloadCore.js";

const aggregate = {
  id: "61abc689-868a-4bc7-a0b0-000000000000",
  video_case_id: "b639bb41-79ba-4d4c-bdcc-ec004f670853",
  source_evaluation_ids: [224, 225, 226],
  source_count: 3,
  source_snapshot: {
    case_title: "Postman Test",
    source_runs: [{ order_number: "001" }],
  },
  combined_scores: { "1": { q1: 4 } },
  section_averages: { "1": 4 },
  ai_output: { summary: "Combined result" },
  ai_raw_text: null,
};

test("summary payload uses aggregate_id and never aliases a source evaluation", () => {
  const payload = buildVideoCaseSummaryPayload({
    aggregate,
    requestedByEmployeeNumber: "020943",
    combinePrompt: "Leader note",
  });

  assert.equal(payload.document_type, "video_case_summary");
  assert.equal(payload.aggregate_id, aggregate.id);
  assert.equal(payload.video_case_id, aggregate.video_case_id);
  assert.deepEqual(payload.source_evaluation_ids, [224, 225, 226]);
  assert.equal(Object.hasOwn(payload, "evaluation_id"), false);
  assert.equal(Object.hasOwn(payload, "evaluationId"), false);
});

test("summary payload keeps question, section, AI, and leader inputs", () => {
  const payload = buildVideoCaseSummaryPayload({
    aggregate,
    requestedByEmployeeNumber: "020943",
    combinePrompt: "Leader note",
  });

  assert.deepEqual(payload.question_averages, { "1": { q1: 4 } });
  assert.deepEqual(payload.section_averages, { "1": 4 });
  assert.deepEqual(payload.aggregate_analysis, { summary: "Combined result" });
  assert.equal(payload.combine_prompt, "Leader note");
  assert.equal(payload.sender_employee_number, "020943");
});
```

- [ ] **Step 3: Run the tests and verify RED**

Run:

```powershell
npm.cmd test
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `videoCaseSummaryPayloadCore.js`.

- [ ] **Step 4: Implement the pure summary payload builder**

Create `src/services/videoCaseSummaryPayloadCore.js`:

```js
export function buildVideoCaseSummaryPayload({
  aggregate,
  requestedByEmployeeNumber,
  combinePrompt,
}) {
  const snapshot = aggregate.source_snapshot || {};
  const sourceRuns = Array.isArray(snapshot.source_runs) ? snapshot.source_runs : [];
  const firstSource = sourceRuns.find((run) => run && typeof run === "object") || {};
  const caseTitle = typeof snapshot.case_title === "string" ? snapshot.case_title : null;
  const orderNumber =
    typeof firstSource.order_number === "string" && firstSource.order_number.trim()
      ? firstSource.order_number.trim()
      : null;

  return {
    document_type: "video_case_summary",
    aggregate_id: aggregate.id,
    video_case_id: aggregate.video_case_id,
    case_title: caseTitle,
    subject_name: caseTitle ? `${caseTitle} - Aggregate Report` : "Aggregate Report",
    order_number: orderNumber,
    sender_employee_number: requestedByEmployeeNumber,
    source_evaluation_ids: aggregate.source_evaluation_ids,
    source_count: aggregate.source_count,
    question_averages: aggregate.combined_scores,
    section_averages: aggregate.section_averages || null,
    aggregate_analysis: aggregate.ai_output || aggregate.ai_raw_text,
    combine_prompt: combinePrompt,
  };
}
```

Create `src/services/videoCaseSummaryPayloadCore.d.ts`:

```ts
export type VideoCaseSummaryAggregate = {
  id: string;
  video_case_id: string;
  source_evaluation_ids: number[];
  source_count: number;
  source_snapshot: Record<string, unknown>;
  combined_scores: Record<string, unknown>;
  section_averages?: Record<string, unknown>;
  ai_output: Record<string, unknown> | null;
  ai_raw_text: string | null;
};

export type VideoCaseSummaryPayload = {
  document_type: "video_case_summary";
  aggregate_id: string;
  video_case_id: string;
  case_title: string | null;
  subject_name: string;
  order_number: string | null;
  sender_employee_number: string | null;
  source_evaluation_ids: number[];
  source_count: number;
  question_averages: Record<string, unknown>;
  section_averages: Record<string, unknown> | null;
  aggregate_analysis: Record<string, unknown> | string | null;
  combine_prompt: string | null;
};

export function buildVideoCaseSummaryPayload(options: {
  aggregate: VideoCaseSummaryAggregate;
  requestedByEmployeeNumber: string | null;
  combinePrompt: string | null;
}): VideoCaseSummaryPayload;
```

- [ ] **Step 5: Replace the inline builder**

In `src/services/videoCaseService.ts`:

```ts
import { buildVideoCaseSummaryPayload } from "./videoCaseSummaryPayloadCore.js";
export { buildVideoCaseSummaryPayload } from "./videoCaseSummaryPayloadCore.js";
```

Remove the inline implementation, including `primaryEvaluationId`, `evaluation_id`, `evaluationId`, `aggregateId`, and `videoCaseId`.

- [ ] **Step 6: Run tests and build to verify GREEN**

Run:

```powershell
npm.cmd test
npm.cmd run build
```

Expected: all Node tests PASS and Vite build exits 0.

- [ ] **Step 7: Commit the isolated payload change**

```powershell
git add -- package.json tests/videoCaseSummaryPayloadCore.test.js src/services/videoCaseSummaryPayloadCore.js src/services/videoCaseSummaryPayloadCore.d.ts src/services/videoCaseService.ts
git commit -m "fix: separate summary aggregate identifiers"
```

---

### Task 2: Validate Document Targets in Both Edge Functions

**Files:**
- Create: `supabase/functions/_shared/documentTarget.js`
- Create: `tests/documentTarget.test.js`
- Modify: `supabase/functions/forward-to-n8n/index.ts`
- Modify: `supabase/functions/document-generation-callback/index.ts`

**Interfaces:**
- Produces: `resolveDocumentTarget(payload)` returning `{ kind, table, id, documentType }`.
- Consumed by: both forwarding and callback Edge Functions.

- [ ] **Step 1: Write failing identifier contract tests**

Create `tests/documentTarget.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { resolveDocumentTarget } from "../supabase/functions/_shared/documentTarget.js";

test("resolves an individual evaluation", () => {
  assert.deepEqual(
    resolveDocumentTarget({ document_type: "evaluation", evaluation_id: 224 }),
    {
      kind: "evaluation",
      table: "evaluations",
      id: 224,
      documentType: "evaluation",
    },
  );
});

test("resolves a video case summary", () => {
  const aggregateId = "61abc689-868a-4bc7-a0b0-000000000000";
  assert.deepEqual(
    resolveDocumentTarget({
      document_type: "video_case_summary",
      aggregate_id: aggregateId,
    }),
    {
      kind: "aggregate",
      table: "video_case_aggregates",
      id: aggregateId,
      documentType: "video_case_summary",
    },
  );
});

test("rejects mixed evaluation and aggregate identifiers", () => {
  assert.throws(
    () =>
      resolveDocumentTarget({
        document_type: "video_case_summary",
        aggregate_id: "61abc689-868a-4bc7-a0b0-000000000000",
        evaluation_id: 224,
      }),
    /must not contain both/,
  );
});

test("rejects an identifier that does not match document_type", () => {
  assert.throws(
    () => resolveDocumentTarget({ document_type: "evaluation", aggregate_id: "61abc689-868a-4bc7-a0b0-000000000000" }),
    /evaluation_id is required/,
  );
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
npm.cmd test
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `documentTarget.js`.

- [ ] **Step 3: Implement the shared resolver**

Create `supabase/functions/_shared/documentTarget.js`:

```js
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveDocumentTarget(payload) {
  const evaluationId = Number(payload?.evaluation_id);
  const aggregateId =
    typeof payload?.aggregate_id === "string" ? payload.aggregate_id.trim() : "";
  const hasEvaluation = Number.isInteger(evaluationId) && evaluationId > 0;
  const hasAggregate = UUID_PATTERN.test(aggregateId);

  if (hasEvaluation && hasAggregate) {
    throw new Error("Document payload must not contain both evaluation_id and aggregate_id.");
  }

  if (payload?.document_type === "evaluation") {
    if (!hasEvaluation) throw new Error("evaluation_id is required for an evaluation document.");
    return {
      kind: "evaluation",
      table: "evaluations",
      id: evaluationId,
      documentType: "evaluation",
    };
  }

  if (payload?.document_type === "video_case_summary") {
    if (!hasAggregate) throw new Error("aggregate_id is required for a video case summary.");
    return {
      kind: "aggregate",
      table: "video_case_aggregates",
      id: aggregateId,
      documentType: "video_case_summary",
    };
  }

  throw new Error("Unsupported document_type.");
}
```

- [ ] **Step 4: Make forwarding use the resolved target**

In `supabase/functions/forward-to-n8n/index.ts`:

```ts
import { resolveDocumentTarget } from "../_shared/documentTarget.js";
```

Resolve and validate immediately after parsing the request body. Use `target.table` and `target.id` for every status update. Include normalized `document_type`, `evaluation_id` or `aggregate_id` in the secured payload based on the resolved target.

Return HTTP 400 for resolver errors before calling n8n.

- [ ] **Step 5: Make callback use the resolved target**

In `supabase/functions/document-generation-callback/index.ts`, replace target inference:

```ts
.from(aggregateId ? "video_case_aggregates" : "evaluations")
```

with:

```ts
const target = resolveDocumentTarget(payload);
// ...
.from(target.table)
.update(updateValues)
.eq("id", target.id)
.select("id")
.maybeSingle();
```

Return HTTP 404 when no target row is returned.

- [ ] **Step 6: Run contract tests and build**

Run:

```powershell
npm.cmd test
npm.cmd run build
```

Expected: tests PASS and build exits 0.

- [ ] **Step 7: Commit the Edge Function contract**

```powershell
git add -- tests/documentTarget.test.js supabase/functions/_shared/documentTarget.js supabase/functions/forward-to-n8n/index.ts supabase/functions/document-generation-callback/index.ts
git commit -m "fix: validate evaluation and aggregate document targets"
```

---

### Task 3: Add Aggregate Source Integrity and Repair Document Columns

**Files:**
- Create: `supabase/migrations/20260728090000_evaluation_aggregate_integrity.sql`
- Create: `supabase/tests/evaluation_aggregate_integrity.sql`
- Create: `supabase/tests/evaluation_aggregate_behavior.sql`

**Interfaces:**
- Produces: `video_case_aggregate_sources(aggregate_id, evaluation_id, source_position, created_at)`.
- Maintains: source links from `video_case_aggregates.source_evaluation_ids` through a database trigger.

- [ ] **Step 1: Write the database behavior test first**

Create `supabase/tests/evaluation_aggregate_integrity.sql`:

```sql
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(12);

SELECT has_column('public', 'evaluations', 'source_doc_id');
SELECT has_column('public', 'evaluations', 'pdf_storage_path');
SELECT has_column('public', 'evaluations', 'docx_storage_path');
SELECT has_table('public', 'video_case_aggregate_sources');
SELECT has_pk('public', 'video_case_aggregate_sources');
SELECT has_column('public', 'video_case_aggregate_sources', 'aggregate_id');
SELECT has_column('public', 'video_case_aggregate_sources', 'evaluation_id');
SELECT has_column('public', 'video_case_aggregate_sources', 'source_position');
SELECT fk_ok(
  'public',
  'video_case_aggregate_sources',
  'aggregate_id',
  'public',
  'video_case_aggregates',
  'id'
);
SELECT fk_ok(
  'public',
  'video_case_aggregate_sources',
  'evaluation_id',
  'public',
  'evaluations',
  'id'
);
SELECT has_trigger(
  'public',
  'video_case_aggregates',
  'trg_sync_video_case_aggregate_sources'
);
SELECT policies_are(
  'public',
  'video_case_aggregate_sources',
  ARRAY['video_case_aggregate_sources_select_related']
);

SELECT * FROM finish();
ROLLBACK;
```

Create `supabase/tests/evaluation_aggregate_behavior.sql`:

```sql
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(5);

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000101',
  'authenticated',
  'authenticated',
  'aggregate-integrity@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"employee_number":"TEST-0001"}'::jsonb,
  now(),
  now()
);

INSERT INTO public.video_cases (
  id,
  title,
  case_key,
  case_title,
  created_by
) VALUES
  (
    '00000000-0000-4000-8000-000000000111',
    'Integrity case A',
    'integrity-case-a',
    'Integrity case A',
    '00000000-0000-4000-8000-000000000101'
  ),
  (
    '00000000-0000-4000-8000-000000000112',
    'Integrity case B',
    'integrity-case-b',
    'Integrity case B',
    '00000000-0000-4000-8000-000000000101'
  );

INSERT INTO public.evaluations (
  id,
  user_id,
  video_case_id,
  subject_name,
  rubric,
  document_status
) VALUES
  (
    900001,
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000111',
    'Integrity evaluation 1',
    '{"1":{"q1":5}}'::jsonb,
    'pending'
  ),
  (
    900002,
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000111',
    'Integrity evaluation 2',
    '{"1":{"q1":3}}'::jsonb,
    'pending'
  ),
  (
    900003,
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000112',
    'Integrity evaluation 3',
    '{"1":{"q1":4}}'::jsonb,
    'pending'
  );

INSERT INTO public.video_case_aggregates (
  id,
  video_case_id,
  requested_by,
  source_evaluation_ids,
  source_count
) VALUES (
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000111',
  '00000000-0000-4000-8000-000000000101',
  ARRAY[900001, 900002],
  2
);

SELECT is(
  (
    SELECT array_agg(evaluation_id ORDER BY source_position)
    FROM public.video_case_aggregate_sources
    WHERE aggregate_id = '00000000-0000-4000-8000-000000000201'
  ),
  ARRAY[900001::bigint, 900002::bigint],
  'source rows preserve aggregate ordering'
);

SELECT throws_ok(
  $$
    UPDATE public.video_case_aggregates
    SET source_evaluation_ids = ARRAY[900001, 900001]
    WHERE id = '00000000-0000-4000-8000-000000000201'
  $$,
  '22023',
  'Aggregate source evaluation IDs must be unique.',
  'duplicate source IDs are rejected'
);

SELECT throws_ok(
  $$
    UPDATE public.video_case_aggregates
    SET source_evaluation_ids = ARRAY[900003]
    WHERE id = '00000000-0000-4000-8000-000000000201'
  $$,
  '23514',
  'Aggregate source evaluations must belong to the same video case.',
  'cross-case source IDs are rejected'
);

SELECT throws_ok(
  'DELETE FROM public.evaluations WHERE id = 900001',
  '23503',
  NULL,
  'a referenced evaluation cannot be deleted'
);

DELETE FROM public.video_case_aggregates
WHERE id = '00000000-0000-4000-8000-000000000201';

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.video_case_aggregate_sources
    WHERE aggregate_id = '00000000-0000-4000-8000-000000000201'
  ),
  0,
  'deleting an aggregate cascades its source links'
);

SELECT * FROM finish();
ROLLBACK;
```

Both test files roll back after `finish()` so no test rows persist.

Use temporary authenticated test users and roll back the transaction at the end so no test rows persist.

- [ ] **Step 2: Run the database test and verify RED**

This repository does not contain the original `CREATE TABLE` migrations for `evaluations` and `user_information`. First try the local database:

```powershell
npx.cmd supabase db reset
npx.cmd supabase test db supabase/tests/evaluation_aggregate_integrity.sql
```

Expected before implementation: FAIL because `video_case_aggregate_sources` does not exist.

If reset fails before reaching this migration because the historical baseline is incomplete, record the database integration test as blocked. Run it later only on an isolated Supabase branch cloned from the shared project after explicit approval. Never substitute the production database for the failing test.

- [ ] **Step 3: Add the idempotent repair migration**

Create `supabase/migrations/20260728090000_evaluation_aggregate_integrity.sql` beginning with:

```sql
ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS source_doc_id text NULL,
  ADD COLUMN IF NOT EXISTS pdf_storage_path text NULL,
  ADD COLUMN IF NOT EXISTS docx_storage_path text NULL;

ALTER TABLE public.video_case_aggregates
  ADD COLUMN IF NOT EXISTS document_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS document_error text NULL,
  ADD COLUMN IF NOT EXISTS source_doc_id text NULL,
  ADD COLUMN IF NOT EXISTS pdf_storage_path text NULL,
  ADD COLUMN IF NOT EXISTS docx_storage_path text NULL,
  ADD COLUMN IF NOT EXISTS section_averages jsonb NOT NULL DEFAULT '{}'::jsonb;
```

Add the source table:

```sql
CREATE TABLE IF NOT EXISTS public.video_case_aggregate_sources (
  aggregate_id uuid NOT NULL
    REFERENCES public.video_case_aggregates(id) ON DELETE CASCADE,
  evaluation_id bigint NOT NULL
    REFERENCES public.evaluations(id) ON DELETE RESTRICT,
  source_position integer NOT NULL CHECK (source_position > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aggregate_id, evaluation_id),
  UNIQUE (aggregate_id, source_position)
);
```

- [ ] **Step 4: Add same-case validation and synchronization**

Create a `SECURITY DEFINER` trigger function with `SET search_path = public` and `SET row_security = off`.

Before writing links, it must reject:

```sql
cardinality(NEW.source_evaluation_ids)
<>
cardinality(ARRAY(SELECT DISTINCT unnest(NEW.source_evaluation_ids)))
```

It must also reject any source ID that is missing or has `evaluations.video_case_id IS DISTINCT FROM NEW.video_case_id`.

After validation:

```sql
DELETE FROM public.video_case_aggregate_sources
WHERE aggregate_id = NEW.id;

INSERT INTO public.video_case_aggregate_sources (
  aggregate_id,
  evaluation_id,
  source_position
)
SELECT NEW.id, source_id, position::integer
FROM unnest(NEW.source_evaluation_ids) WITH ORDINALITY
  AS source(source_id, position);
```

Attach it `AFTER INSERT OR UPDATE OF source_evaluation_ids, video_case_id` on `video_case_aggregates`.

- [ ] **Step 5: Validate and backfill existing aggregates**

Before backfill, use a `DO` block to raise a descriptive exception if an existing aggregate contains duplicate, missing, or cross-case evaluation IDs.

Backfill valid rows using `unnest(... WITH ORDINALITY)` and `ON CONFLICT (aggregate_id, evaluation_id) DO UPDATE SET source_position = EXCLUDED.source_position`.

- [ ] **Step 6: Add read-only authenticated access**

Enable RLS on `video_case_aggregate_sources`.

Grant `SELECT` to `authenticated`, with a policy that permits rows when:

```sql
EXISTS (
  SELECT 1
  FROM public.video_case_aggregates aggregate
  WHERE aggregate.id = aggregate_id
    AND public.can_view_video_case(aggregate.video_case_id)
)
```

Do not grant direct authenticated insert, update, or delete. The aggregate trigger owns synchronization.

Finish with:

```sql
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 7: Run database tests and verify GREEN**

Run:

```powershell
npx.cmd supabase db reset
npx.cmd supabase test db supabase/tests/evaluation_aggregate_integrity.sql
```

Expected: all database assertions PASS.

- [ ] **Step 8: Review the remote migration without applying it**

Run:

```powershell
npx.cmd supabase db push --dry-run
```

Expected: only `20260728090000_evaluation_aggregate_integrity.sql` is pending. Do not run a real push in this task.

- [ ] **Step 9: Commit the migration and database test**

```powershell
git add -- supabase/migrations/20260728090000_evaluation_aggregate_integrity.sql supabase/tests/evaluation_aggregate_integrity.sql supabase/tests/evaluation_aggregate_behavior.sql
git commit -m "feat: add aggregate source integrity"
```

---

### Task 4: Read Relational Sources with Array Fallback

**Files:**
- Create: `tests/videoCaseSourceIds.test.js`
- Create: `src/services/videoCaseSourceIds.js`
- Create: `src/services/videoCaseSourceIds.d.ts`
- Modify: `src/services/videoCaseService.ts`
- Modify: `src/page/VideoCaseSummaryPage.tsx`

**Interfaces:**
- Produces: `resolveAggregateSourceIds(sourceRows, fallbackIds)` returning stable evaluation IDs.

- [ ] **Step 1: Write failing source resolution tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { resolveAggregateSourceIds } from "../src/services/videoCaseSourceIds.js";

test("uses ordered relational source rows", () => {
  const result = resolveAggregateSourceIds(
    [
      { evaluation_id: 225, source_position: 2 },
      { evaluation_id: 224, source_position: 1 },
    ],
    [999],
  );
  assert.deepEqual(result, [224, 225]);
});

test("falls back to the compatibility array", () => {
  assert.deepEqual(resolveAggregateSourceIds([], [224, 225]), [224, 225]);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run `npm.cmd test`.

Expected: FAIL because `videoCaseSourceIds.js` does not exist.

- [ ] **Step 3: Implement ordered resolution**

Create `resolveAggregateSourceIds` to:

- filter positive integer IDs;
- sort relational rows by `source_position`;
- remove duplicates;
- use fallback IDs only when no valid relational rows exist.

- [ ] **Step 4: Fetch relational sources**

Add a service query:

```ts
supabase
  .from("video_case_aggregate_sources")
  .select("evaluation_id, source_position")
  .eq("aggregate_id", aggregateId)
  .order("source_position", { ascending: true });
```

Use the resolver in the summary page and keep the array fallback for deployment compatibility.

- [ ] **Step 5: Surface protected-delete errors**

When deletion of an evaluation fails with foreign-key code `23503`, show:

```text
This evaluation is used by a combined summary and cannot be deleted.
```

Do not silently remove it from existing aggregate provenance.

- [ ] **Step 6: Verify tests and build**

Run:

```powershell
npm.cmd test
npm.cmd run build
```

Expected: tests PASS and build exits 0.

- [ ] **Step 7: Commit relational source reads**

```powershell
git add -- tests/videoCaseSourceIds.test.js src/services/videoCaseSourceIds.js src/services/videoCaseSourceIds.d.ts src/services/videoCaseService.ts src/page/VideoCaseSummaryPage.tsx
git commit -m "feat: read relational aggregate sources"
```

---

### Task 5: Update Postman and Document the n8n Mapping

**Files:**
- Modify: `postman/VIA-v4-video-case-test.postman_collection.json`
- Create: `docs/n8n-video-case-summary-contract.md`

**Interfaces:**
- Postman variables: `aggregate_id`, `document_callback_secret`, and existing evaluation variables.
- n8n mapping: preserves the correct primary identifier for each document type.

- [ ] **Step 1: Add Postman contract variables**

Add:

```json
{ "key": "aggregate_id", "value": "" },
{ "key": "document_callback_secret", "value": "PASTE_DOCUMENT_CALLBACK_SECRET" }
```

- [ ] **Step 2: Add an authenticated summary forwarding request**

Add a request to:

```text
{{supabase_url}}/functions/v1/forward-to-n8n
```

with `apikey`, `Authorization`, and this body:

```json
{
  "document_type": "video_case_summary",
  "aggregate_id": "{{aggregate_id}}",
  "video_case_id": "{{video_case_id}}",
  "source_evaluation_ids": []
}
```

Its pre-request script rejects an empty or invalid UUID and rejects any body containing `evaluation_id`.

- [ ] **Step 3: Add separate identifier validation tests**

Postman tests must confirm:

- evaluation request uses a positive `evaluation_id`;
- summary request uses a UUID `aggregate_id`;
- summary request does not contain `evaluation_id`;
- mixed-identifier request returns HTTP 400.

- [ ] **Step 4: Write the exact n8n field mapping**

Create `docs/n8n-video-case-summary-contract.md` with:

```text
Normalize Incoming Payload
  document_type <- body.document_type
  evaluation_id <- body.evaluation_id (evaluation only)
  aggregate_id <- body.aggregate_id (summary only)
  video_case_id <- body.video_case_id
  source_evaluation_ids <- body.source_evaluation_ids

Final document callback
  document_type <- normalized.document_type
  evaluation_id <- normalized.evaluation_id (evaluation only)
  aggregate_id <- normalized.aggregate_id (summary only)
  docId <- document result docId
  status <- ready or failed
```

Include one complete evaluation example and one complete summary example. State that n8n must never copy the first source evaluation into `evaluation_id`.

- [ ] **Step 5: Validate collection JSON and run all local checks**

Run:

```powershell
node -e "JSON.parse(require('fs').readFileSync('postman/VIA-v4-video-case-test.postman_collection.json','utf8')); console.log('Postman JSON valid')"
npm.cmd test
npm.cmd run build
```

Expected: Postman JSON valid, all tests PASS, and build exits 0.

- [ ] **Step 6: Commit test artifacts and documentation**

```powershell
git add -- postman/VIA-v4-video-case-test.postman_collection.json docs/n8n-video-case-summary-contract.md
git commit -m "docs: add summary workflow contract tests"
```

---

### Task 6: External Deployment and End-to-End Verification

**Files:**
- No new source files.
- External systems: linked Supabase project and n8n workflow.

**Interfaces:**
- Requires: all Tasks 1-5 complete and reviewed.
- Produces: deployed additive schema, deployed Edge Functions, updated n8n workflow, and verified individual/summary flows.

- [ ] **Step 1: Obtain explicit approval for external changes**

Ask separately before running a real database push, Edge Function deployment, or changing n8n.

- [ ] **Step 2: Push the additive migration**

Run:

```powershell
npx.cmd supabase db push
```

Confirm only the approved integrity migration is applied.

- [ ] **Step 3: Verify remote columns and source rows**

Confirm in Supabase:

- evaluation artifact columns exist;
- `video_case_aggregate_sources` exists;
- old aggregate arrays have matching ordered source rows;
- no V2/V3 tables or columns were removed.

- [ ] **Step 4: Deploy the Edge Functions**

Run:

```powershell
npx.cmd supabase functions deploy forward-to-n8n
npx.cmd supabase functions deploy document-generation-callback
```

- [ ] **Step 5: Apply and save the n8n mapping**

Update the active workflow using `docs/n8n-video-case-summary-contract.md`. Ensure the summary branch preserves `aggregate_id` through the final callback.

- [ ] **Step 6: Test an individual evaluation**

Run Postman requests for the individual path. Verify:

- one new `evaluations.id` is created;
- callback updates that evaluation;
- no aggregate row is changed;
- the document appears in `/my-forms`.

- [ ] **Step 7: Test one new summary**

Create a new aggregate from at least two evaluations. Verify:

- one `video_case_aggregates.id` is created;
- source-link rows match all selected evaluations;
- outbound payload contains `aggregate_id` and no `evaluation_id`;
- callback updates the aggregate row;
- no source evaluation document fields are overwritten.

- [ ] **Step 8: Verify V2 and V3 compatibility**

Submit one normal evaluation from each still-active version or run their existing smoke tests. Confirm both can insert and read evaluations without schema or policy errors.

- [ ] **Step 9: Record deployment evidence**

Record migration version, Edge Function deployment timestamps, n8n workflow execution IDs, test evaluation ID, test aggregate ID, and document IDs in the deployment handoff. Do not include secrets or access tokens.
