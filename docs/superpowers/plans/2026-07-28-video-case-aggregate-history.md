# Video Case Aggregate History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an auditable aggregate-history table to each Video Case, with immutable creator name and employee-number snapshots.

**Architecture:** An additive Supabase migration adds creator snapshot columns and a `BEFORE INSERT` trigger that captures `user_information.full_name` and `employee_number`. VIA V4 reads those fields with existing aggregate queries, maps them through a small pure display helper, and renders a horizontally scrollable history table with the existing summary route and leader/admin-only deletion.

**Tech Stack:** PostgreSQL/Supabase migrations and pgTAP, TypeScript, React 18, React Router, Tailwind CSS, Node test runner.

## Global Constraints

- The Supabase project is shared by VIA V2, VIA V3, and VIA V4.
- Existing tables and columns must not be dropped, renamed, or have their meaning changed.
- Individual evaluations continue to use `evaluation_id`; combined summaries continue to use `aggregate_id`.
- Every Video Case member can view all aggregate-history rows for that case.
- Only a case leader or system admin can create or delete aggregates.
- Creator name and employee number are immutable snapshots captured when the aggregate is created.
- Missing historical identity renders `Unknown user` and `-`; it must not block the page.
- Do not change summary calculation, n8n forwarding, document generation, or `/my-forms`.
- Preserve all pre-existing dirty-worktree changes. Do not stage or commit unrelated modifications.

---

## File Structure

- Create `supabase/migrations/20260728170000_video_case_aggregate_requester_snapshot.sql`: additive columns, requester snapshot trigger, historical backfill, and leader/admin delete policy.
- Create `supabase/tests/video_case_aggregate_history.sql`: pgTAP coverage for schema, trigger, immutability, explicit snapshot preservation, and aggregate policies.
- Create `src/services/videoCaseAggregateHistoryCore.js`: pure aggregate-history display mapping and summary-route construction.
- Create `src/services/videoCaseAggregateHistoryCore.d.ts`: TypeScript declarations for the pure helper.
- Create `tests/videoCaseAggregateHistoryCore.test.js`: Node unit tests for fallbacks, source IDs, and summary routes.
- Create `tests/videoCaseAggregateHistoryPage.test.js`: source-level integration checks for table columns, permissions, navigation, and deletion flow.
- Modify `src/services/videoCaseService.ts`: expose snapshot fields on `VideoCaseAggregateRow`.
- Modify `src/page/VideoCaseDetailPage.tsx`: render history table and add leader/admin-only aggregate deletion.

### Task 1: Add Requester Snapshot Schema and Trigger

**Files:**
- Create: `supabase/tests/video_case_aggregate_history.sql`
- Create: `supabase/migrations/20260728170000_video_case_aggregate_requester_snapshot.sql`

**Interfaces:**
- Consumes: `public.video_case_aggregates.requested_by`, `public.user_information.auth_user_id`, `full_name`, and `employee_number`.
- Produces: nullable `requested_by_name text` and `requested_by_employee_number text` columns populated by `public.snapshot_video_case_aggregate_requester()`, plus `video_case_aggregates_delete_leader`.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/video_case_aggregate_history.sql`:

```sql
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(8);

SELECT has_column(
  'public',
  'video_case_aggregates',
  'requested_by_name'
);
SELECT has_column(
  'public',
  'video_case_aggregates',
  'requested_by_employee_number'
);
SELECT has_trigger(
  'public',
  'video_case_aggregates',
  'trg_snapshot_video_case_aggregate_requester'
);
SELECT policies_are(
  'public',
  'video_case_aggregates',
  ARRAY[
    'video_case_aggregates_delete_leader',
    'video_case_aggregates_insert_leader',
    'video_case_aggregates_select_related',
    'video_case_aggregates_update_leader'
  ]
);

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
  '00000000-0000-4000-8000-000000000301',
  'authenticated',
  'authenticated',
  'aggregate-history@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"employee_number":"HIST-001"}'::jsonb,
  now(),
  now()
);

UPDATE public.user_information
SET full_name = 'History Leader',
    employee_number = 'HIST-001'
WHERE auth_user_id::text = '00000000-0000-4000-8000-000000000301';

INSERT INTO public.video_cases (
  id,
  title,
  case_key,
  case_title,
  created_by
) VALUES (
  '00000000-0000-4000-8000-000000000311',
  'Aggregate history case',
  'aggregate-history-case',
  'Aggregate history case',
  '00000000-0000-4000-8000-000000000301'
);

INSERT INTO public.video_case_aggregates (
  id,
  video_case_id,
  requested_by,
  source_evaluation_ids,
  source_count
) VALUES (
  '00000000-0000-4000-8000-000000000321',
  '00000000-0000-4000-8000-000000000311',
  '00000000-0000-4000-8000-000000000301',
  '{}'::integer[],
  0
);

SELECT is(
  (
    SELECT requested_by_name
    FROM public.video_case_aggregates
    WHERE id = '00000000-0000-4000-8000-000000000321'
  ),
  'History Leader',
  'insert snapshots requester full name'
);

SELECT is(
  (
    SELECT requested_by_employee_number
    FROM public.video_case_aggregates
    WHERE id = '00000000-0000-4000-8000-000000000321'
  ),
  'HIST-001',
  'insert snapshots requester employee number'
);

UPDATE public.user_information
SET full_name = 'Renamed Leader',
    employee_number = 'HIST-002'
WHERE auth_user_id::text = '00000000-0000-4000-8000-000000000301';

SELECT is(
  (
    SELECT requested_by_name || ':' || requested_by_employee_number
    FROM public.video_case_aggregates
    WHERE id = '00000000-0000-4000-8000-000000000321'
  ),
  'History Leader:HIST-001',
  'profile edits do not mutate an existing snapshot'
);

INSERT INTO public.video_case_aggregates (
  id,
  video_case_id,
  requested_by,
  requested_by_name,
  requested_by_employee_number,
  source_evaluation_ids,
  source_count
) VALUES (
  '00000000-0000-4000-8000-000000000322',
  '00000000-0000-4000-8000-000000000311',
  '00000000-0000-4000-8000-000000000301',
  'Imported Name',
  'IMPORTED-001',
  '{}'::integer[],
  0
);

SELECT is(
  (
    SELECT requested_by_name || ':' || requested_by_employee_number
    FROM public.video_case_aggregates
    WHERE id = '00000000-0000-4000-8000-000000000322'
  ),
  'Imported Name:IMPORTED-001',
  'the trigger preserves explicitly supplied snapshots'
);

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Run the database test to verify it fails**

Run:

```powershell
npx.cmd supabase test db
```

Expected: FAIL because the two snapshot columns and trigger do not exist.

- [ ] **Step 3: Write the additive migration**

Create `supabase/migrations/20260728170000_video_case_aggregate_requester_snapshot.sql`:

```sql
ALTER TABLE public.video_case_aggregates
  ADD COLUMN IF NOT EXISTS requested_by_name text NULL,
  ADD COLUMN IF NOT EXISTS requested_by_employee_number text NULL;

CREATE OR REPLACE FUNCTION public.snapshot_video_case_aggregate_requester()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  requester_name text;
  requester_employee_number text;
BEGIN
  SELECT
    NULLIF(trim(profile.full_name), ''),
    NULLIF(trim(profile.employee_number), '')
  INTO requester_name, requester_employee_number
  FROM public.user_information profile
  WHERE profile.auth_user_id::text = NEW.requested_by::text
  LIMIT 1;

  NEW.requested_by_name :=
    COALESCE(NULLIF(trim(NEW.requested_by_name), ''), requester_name);
  NEW.requested_by_employee_number :=
    COALESCE(
      NULLIF(trim(NEW.requested_by_employee_number), ''),
      requester_employee_number
    );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.snapshot_video_case_aggregate_requester()
FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_snapshot_video_case_aggregate_requester
ON public.video_case_aggregates;

CREATE TRIGGER trg_snapshot_video_case_aggregate_requester
BEFORE INSERT
ON public.video_case_aggregates
FOR EACH ROW
EXECUTE FUNCTION public.snapshot_video_case_aggregate_requester();

UPDATE public.video_case_aggregates aggregate
SET
  requested_by_name = COALESCE(
    aggregate.requested_by_name,
    NULLIF(trim(profile.full_name), '')
  ),
  requested_by_employee_number = COALESCE(
    aggregate.requested_by_employee_number,
    NULLIF(trim(profile.employee_number), '')
  )
FROM public.user_information profile
WHERE profile.auth_user_id::text = aggregate.requested_by::text
  AND (
    aggregate.requested_by_name IS NULL
    OR aggregate.requested_by_employee_number IS NULL
  );

NOTIFY pgrst, 'reload schema';
```

Before `NOTIFY`, add the missing delete policy:

```sql
DROP POLICY IF EXISTS video_case_aggregates_delete_leader
ON public.video_case_aggregates;

CREATE POLICY video_case_aggregates_delete_leader
ON public.video_case_aggregates
FOR DELETE
TO authenticated
USING (
  public.current_video_case_role(video_case_id) = 'leader'
  OR public.role_at_least('admin'::public.app_role)
);
```

- [ ] **Step 4: Rebuild the local database and run pgTAP**

Run:

```powershell
npx.cmd supabase db reset
npx.cmd supabase test db
```

Expected: all database tests PASS, including eight assertions in `video_case_aggregate_history.sql`.

- [ ] **Step 5: Review the migration for shared-project safety**

Run:

```powershell
Select-String -Path supabase\migrations\20260728170000_video_case_aggregate_requester_snapshot.sql -Pattern 'DROP COLUMN|RENAME COLUMN|ALTER COLUMN'
```

Expected: no output.

- [ ] **Step 6: Commit only the database task files**

```powershell
git add -- supabase/migrations/20260728170000_video_case_aggregate_requester_snapshot.sql supabase/tests/video_case_aggregate_history.sql
git commit -m "feat: snapshot video case aggregate requester"
```

If either path contains pre-existing user changes, do not commit; report the
conflict and leave the verified changes unstaged.

### Task 2: Add Aggregate History Display Mapping

**Files:**
- Create: `tests/videoCaseAggregateHistoryCore.test.js`
- Create: `src/services/videoCaseAggregateHistoryCore.js`
- Create: `src/services/videoCaseAggregateHistoryCore.d.ts`
- Modify: `src/services/videoCaseService.ts`

**Interfaces:**
- Consumes: a `VideoCaseAggregateRow` with snapshot identity, source IDs, and statuses.
- Produces: `buildVideoCaseAggregateHistoryItem(aggregate)` and `buildVideoCaseAggregateSummaryPath(videoCaseId, aggregateId)`.

- [ ] **Step 1: Write the failing Node tests**

Create `tests/videoCaseAggregateHistoryCore.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVideoCaseAggregateHistoryItem,
  buildVideoCaseAggregateSummaryPath,
} from "../src/services/videoCaseAggregateHistoryCore.js";

const aggregate = {
  id: "12345678-aaaa-bbbb-cccc-123456789012",
  requested_by_name: "  History Leader  ",
  requested_by_employee_number: "  HIST-001  ",
  source_evaluation_ids: [224, "225", 224, 0, null],
  source_count: 2,
  status: "ready",
  document_status: "pending",
  created_at: "2026-07-28T10:00:00.000Z",
};

test("builds a normalized aggregate history item", () => {
  assert.deepEqual(buildVideoCaseAggregateHistoryItem(aggregate), {
    aggregateId: "12345678-aaaa-bbbb-cccc-123456789012",
    shortAggregateId: "12345678",
    creatorName: "History Leader",
    employeeNumber: "HIST-001",
    sourceEvaluationIds: [224, 225],
    sourceCount: 2,
    analysisStatus: "ready",
    documentStatus: "pending",
    createdAt: "2026-07-28T10:00:00.000Z",
  });
});

test("uses neutral fallbacks for missing historical identity", () => {
  const result = buildVideoCaseAggregateHistoryItem({
    ...aggregate,
    requested_by_name: null,
    requested_by_employee_number: null,
    source_evaluation_ids: [],
    source_count: 0,
  });

  assert.equal(result.creatorName, "Unknown user");
  assert.equal(result.employeeNumber, "-");
  assert.deepEqual(result.sourceEvaluationIds, []);
});

test("builds the existing nested summary route", () => {
  assert.equal(
    buildVideoCaseAggregateSummaryPath("case 1", "aggregate/1"),
    "/video-cases/case%201/summaries/aggregate%2F1",
  );
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
node --test tests/videoCaseAggregateHistoryCore.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for
`videoCaseAggregateHistoryCore.js`.

- [ ] **Step 3: Implement the pure display helper**

Create `src/services/videoCaseAggregateHistoryCore.js`:

```js
function cleanText(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function uniquePositiveIds(values) {
  const ids = [];
  const seen = new Set();

  for (const value of Array.isArray(values) ? values : []) {
    const id = Number(value);
    if (Number.isInteger(id) && id > 0 && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }

  return ids;
}

export function buildVideoCaseAggregateHistoryItem(aggregate) {
  const aggregateId = cleanText(aggregate?.id, "");

  return {
    aggregateId,
    shortAggregateId: aggregateId.slice(0, 8) || "-",
    creatorName: cleanText(aggregate?.requested_by_name, "Unknown user"),
    employeeNumber: cleanText(
      aggregate?.requested_by_employee_number,
      "-",
    ),
    sourceEvaluationIds: uniquePositiveIds(
      aggregate?.source_evaluation_ids,
    ),
    sourceCount:
      Number.isInteger(Number(aggregate?.source_count))
      && Number(aggregate?.source_count) >= 0
        ? Number(aggregate.source_count)
        : 0,
    analysisStatus: cleanText(aggregate?.status, "pending"),
    documentStatus: cleanText(aggregate?.document_status, "pending"),
    createdAt: cleanText(aggregate?.created_at, ""),
  };
}

export function buildVideoCaseAggregateSummaryPath(videoCaseId, aggregateId) {
  return `/video-cases/${encodeURIComponent(videoCaseId)}/summaries/${encodeURIComponent(aggregateId)}`;
}
```

Create `src/services/videoCaseAggregateHistoryCore.d.ts`:

```ts
export type VideoCaseAggregateHistoryInput = {
  id?: unknown;
  requested_by_name?: unknown;
  requested_by_employee_number?: unknown;
  source_evaluation_ids?: unknown;
  source_count?: unknown;
  status?: unknown;
  document_status?: unknown;
  created_at?: unknown;
};

export type VideoCaseAggregateHistoryItem = {
  aggregateId: string;
  shortAggregateId: string;
  creatorName: string;
  employeeNumber: string;
  sourceEvaluationIds: number[];
  sourceCount: number;
  analysisStatus: string;
  documentStatus: string;
  createdAt: string;
};

export function buildVideoCaseAggregateHistoryItem(
  aggregate: VideoCaseAggregateHistoryInput,
): VideoCaseAggregateHistoryItem;

export function buildVideoCaseAggregateSummaryPath(
  videoCaseId: string,
  aggregateId: string,
): string;
```

- [ ] **Step 4: Extend the aggregate service type**

Add these fields after `requested_by` in `VideoCaseAggregateRow` within
`src/services/videoCaseService.ts`:

```ts
requested_by_name: string | null;
requested_by_employee_number: string | null;
```

Keep `getVideoCaseAggregates()` on `.select("*")`; the database trigger and
backfill provide the values without a profile query.

- [ ] **Step 5: Run the focused and complete Node tests**

Run:

```powershell
node --test tests/videoCaseAggregateHistoryCore.test.js
npm.cmd test
```

Expected: both commands PASS.

- [ ] **Step 6: Commit only the mapping task files**

```powershell
git add -- tests/videoCaseAggregateHistoryCore.test.js src/services/videoCaseAggregateHistoryCore.js src/services/videoCaseAggregateHistoryCore.d.ts
git diff -- src/services/videoCaseService.ts
```

Stage only the two added type lines in `src/services/videoCaseService.ts` if
they can be separated safely from its pre-existing modifications, then commit:

```powershell
git commit -m "feat: map video case aggregate history"
```

If safe partial staging is not possible, leave `src/services/videoCaseService.ts`
unstaged and report it instead of committing unrelated work.

### Task 3: Render Aggregate History and Leader Deletion

**Files:**
- Create: `tests/videoCaseAggregateHistoryPage.test.js`
- Modify: `src/page/VideoCaseDetailPage.tsx`

**Interfaces:**
- Consumes: `aggregates`, `canCombine`, `loadCaseData`,
  `deleteVideoCaseAggregate()`, and the history mapping functions from Task 2.
- Produces: an `Aggregate history` table and a confirmed delete flow.

- [ ] **Step 1: Write the failing page integration test**

Create `tests/videoCaseAggregateHistoryPage.test.js`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
  new URL("../src/page/VideoCaseDetailPage.tsx", import.meta.url),
  "utf8",
);
const serviceSource = readFileSync(
  new URL("../src/services/videoCaseService.ts", import.meta.url),
  "utf8",
);

test("renders the aggregate audit columns", () => {
  for (const label of [
    "Aggregate history",
    "Aggregate",
    "Created",
    "Created by",
    "Employee no.",
    "Sources",
    "Analysis",
    "Document",
    "Action",
  ]) {
    assert.match(pageSource, new RegExp(label.replace(".", "\\.")));
  }
});

test("links each aggregate to its existing summary page", () => {
  assert.match(
    pageSource,
    /buildVideoCaseAggregateSummaryPath\(selectedCase\.id,\s*item\.aggregateId\)/,
  );
  assert.match(pageSource, />\s*View summary\s*</);
});

test("guards aggregate deletion with leader permission and confirmation", () => {
  assert.match(pageSource, /canCombine\s*&&\s*\(/);
  assert.match(pageSource, /setAggregateToDelete\(aggregate\)/);
  assert.match(pageSource, /await deleteVideoCaseAggregate\(aggregateToDelete\.id\)/);
  assert.match(pageSource, /await loadCaseData\(selectedCase\.id\)/);
  assert.match(pageSource, /title="Delete aggregate"/);
  assert.match(
    serviceSource,
    /\.delete\(\)\s*\.eq\("id", aggregateId\)\s*\.select\("id"\)\s*\.maybeSingle\(\)/,
  );
  assert.match(
    serviceSource,
    /Aggregate not found or you do not have permission to delete it\./,
  );
});

test("shows an explicit empty aggregate history state", () => {
  assert.match(
    pageSource,
    /No evaluation summaries have been combined for this Video Case yet\./,
  );
});
```

- [ ] **Step 2: Run the page test to verify it fails**

Run:

```powershell
node --test tests/videoCaseAggregateHistoryPage.test.js
```

Expected: FAIL because the history section and aggregate delete flow are absent.

- [ ] **Step 3: Add imports, mapped rows, and deletion state**

In `src/page/VideoCaseDetailPage.tsx`, import:

```ts
import {
  buildVideoCaseAggregateHistoryItem,
  buildVideoCaseAggregateSummaryPath,
} from "../services/videoCaseAggregateHistoryCore";
```

Add `deleteVideoCaseAggregate` to the existing import from
`videoCaseService`.

Add state:

```ts
const [aggregateToDelete, setAggregateToDelete] =
  useState<VideoCaseAggregateRow | null>(null);
const [deletingAggregate, setDeletingAggregate] = useState(false);
```

Add the mapped list after `latestAggregate`:

```ts
const aggregateHistory = useMemo(
  () => aggregates.map((aggregate) => ({
    aggregate,
    item: buildVideoCaseAggregateHistoryItem(aggregate),
  })),
  [aggregates],
);
```

- [ ] **Step 4: Make aggregate deletion detect RLS no-op responses**

Replace `deleteVideoCaseAggregate()` in `src/services/videoCaseService.ts` with:

```ts
export async function deleteVideoCaseAggregate(
  aggregateId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("video_case_aggregates")
    .delete()
    .eq("id", aggregateId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error(
      "Aggregate not found or you do not have permission to delete it.",
    );
  }
}
```

This prevents the UI from reporting success when RLS deletes zero rows.

- [ ] **Step 5: Add the aggregate delete handler and modal**

Add:

```ts
async function handleDeleteAggregate() {
  if (!selectedCase || !aggregateToDelete) return;

  try {
    setDeletingAggregate(true);
    setErrorMessage(null);
    await deleteVideoCaseAggregate(aggregateToDelete.id);
    setSuccessMessage(
      `Aggregate ${aggregateToDelete.id.slice(0, 8)} was deleted.`,
    );
    await loadCaseData(selectedCase.id);
  } catch (error) {
    setErrorMessage(
      error instanceof Error ? error.message : "Failed to delete aggregate.",
    );
  } finally {
    setDeletingAggregate(false);
    setAggregateToDelete(null);
  }
}
```

Add a third `ConfirmModal` after the evaluation delete modal:

```tsx
<ConfirmModal
  isOpen={Boolean(aggregateToDelete)}
  title="Delete aggregate"
  message={`Delete aggregate ${aggregateToDelete?.id.slice(0, 8) ?? ""}? Source evaluations will remain.`}
  variant="danger"
  onCancel={() => {
    if (!deletingAggregate) setAggregateToDelete(null);
  }}
  onConfirm={() => void handleDeleteAggregate()}
  confirmLabel={deletingAggregate ? "Deleting..." : "Delete"}
  cancelLabel="Cancel"
  confirmDisabled={deletingAggregate}
/>
```

- [ ] **Step 6: Render the history table below Evaluations**

Insert this section after the existing Evaluations section:

```tsx
<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
  <div>
    <h3 className="text-lg font-semibold text-slate-900">
      Aggregate history
    </h3>
    <p className="mt-1 text-sm text-slate-500">
      Combined evaluation summaries for this Video Case.
    </p>
  </div>

  {aggregateHistory.length === 0 ? (
    <p className="mt-4 text-sm text-slate-500">
      No evaluation summaries have been combined for this Video Case yet.
    </p>
  ) : (
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[1080px] border-collapse text-left text-xs">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            {[
              "Aggregate",
              "Created",
              "Created by",
              "Employee no.",
              "Sources",
              "Analysis",
              "Document",
              "Action",
            ].map((label) => (
              <th
                key={label}
                className="border-b border-slate-200 px-4 py-3 font-semibold"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {aggregateHistory.map(({ aggregate, item }) => (
            <tr key={item.aggregateId} className="align-top hover:bg-slate-50/70">
              <td className="px-4 py-3">
                <p className="font-semibold text-slate-900">
                  {item.shortAggregateId}
                </p>
                <p className="mt-1 break-all text-slate-400">
                  {item.aggregateId}
                </p>
              </td>
              <td className="px-4 py-3 text-slate-600">
                {item.createdAt ? new Date(item.createdAt).toLocaleString() : "-"}
              </td>
              <td className="px-4 py-3 text-slate-700">{item.creatorName}</td>
              <td className="px-4 py-3 text-slate-700">{item.employeeNumber}</td>
              <td className="px-4 py-3 text-slate-600">
                <p>{item.sourceCount} evaluation(s)</p>
                <p className="mt-1">
                  {item.sourceEvaluationIds.length
                    ? item.sourceEvaluationIds.map((id) => `#${id}`).join(", ")
                    : "-"}
                </p>
              </td>
              <td className="px-4 py-3 text-slate-600">
                {item.analysisStatus}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {item.documentStatus}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    to={buildVideoCaseAggregateSummaryPath(
                      selectedCase.id,
                      item.aggregateId,
                    )}
                    className="font-semibold text-[#04418b] hover:underline"
                  >
                    View summary
                  </Link>
                  {canCombine && (
                    <button
                      type="button"
                      onClick={() => setAggregateToDelete(aggregate)}
                      className="font-semibold text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</section>
```

- [ ] **Step 7: Run focused tests**

Run:

```powershell
node --test tests/videoCaseAggregateHistoryCore.test.js tests/videoCaseAggregateHistoryPage.test.js
```

Expected: all aggregate-history tests PASS.

- [ ] **Step 8: Run the full frontend verification**

Run:

```powershell
npm.cmd test
npm.cmd run build
```

Expected: all Node tests PASS and Vite production build completes. Existing
large-chunk warnings are non-blocking.

- [ ] **Step 9: Manually verify both permission states**

Run:

```powershell
npm.cmd run dev
```

Verify in `/video-cases/:videoCaseId`:

1. A leader/admin sees all aggregate rows, `View summary`, and `Delete`.
2. A member sees all aggregate rows and `View summary`, but no `Delete`.
3. A new aggregate displays the creator snapshot.
4. An old aggregate with null snapshots displays `Unknown user` and `-`.
5. Deleting an aggregate refreshes the table and does not remove evaluations.
6. At mobile width, the table scrolls horizontally and retains every column.

- [ ] **Step 10: Commit only the UI task files**

```powershell
git add -- tests/videoCaseAggregateHistoryPage.test.js
git diff -- src/page/VideoCaseDetailPage.tsx
```

Stage only the aggregate-history changes in
`src/page/VideoCaseDetailPage.tsx` if they can be separated safely, then commit:

```powershell
git commit -m "feat: show video case aggregate history"
```

Because `VideoCaseDetailPage.tsx` already contains uncommitted work, do not
commit the full file if that would include unrelated changes.

### Task 4: Final Regression and Migration Readiness

**Files:**
- Verify: `supabase/migrations/20260728170000_video_case_aggregate_requester_snapshot.sql`
- Verify: `supabase/tests/video_case_aggregate_history.sql`
- Verify: `src/services/videoCaseAggregateHistoryCore.js`
- Verify: `src/services/videoCaseService.ts`
- Verify: `src/page/VideoCaseDetailPage.tsx`

**Interfaces:**
- Consumes: all deliverables from Tasks 1-3.
- Produces: verified migration and application artifacts ready for deployment.

- [ ] **Step 1: Run all local automated checks from a clean terminal**

```powershell
npx.cmd supabase test db
npm.cmd test
npm.cmd run build
```

Expected: every command exits with code `0`.

- [ ] **Step 2: Inspect only feature-related diffs**

```powershell
git diff --check
git diff -- supabase/migrations/20260728170000_video_case_aggregate_requester_snapshot.sql supabase/tests/video_case_aggregate_history.sql src/services/videoCaseAggregateHistoryCore.js src/services/videoCaseAggregateHistoryCore.d.ts src/services/videoCaseService.ts src/page/VideoCaseDetailPage.tsx tests/videoCaseAggregateHistoryCore.test.js tests/videoCaseAggregateHistoryPage.test.js
```

Expected: no whitespace errors; the diff contains no n8n, document callback,
summary calculation, `/my-forms`, or unrelated role changes.

- [ ] **Step 3: Inspect final worktree state**

```powershell
git status --short
```

Expected: pre-existing unrelated modifications remain untouched. Any
feature-related uncommitted changes are listed explicitly in the completion
report.

- [ ] **Step 4: Prepare deployment commands without executing them**

After local verification, report these commands for the user to run:

```powershell
npx.cmd supabase db push
npx.cmd vercel --prod
```

Do not deploy or push the migration without explicit user authorization.
