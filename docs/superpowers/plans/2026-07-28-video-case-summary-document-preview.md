# Video Case Summary Document Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Video Case-only document preview page for generated aggregate PDF/DOCX artifacts that matches the existing individual evaluation preview experience.

**Architecture:** A small pure module classifies aggregate document state and validates that the aggregate belongs to the route's video case. A dedicated React page loads and polls the aggregate, resolves signed artifact URLs through the existing Edge Function service, and renders the PDF using the established preview layout. The existing summary page only gains navigation to the document page; `/my-forms` and `/preview/:docId` remain unchanged.

**Tech Stack:** React 18, TypeScript, React Router, Supabase JS, Tailwind CSS, Node.js `node:test`, Vite.

## Global Constraints

- The route is `/video-cases/:videoCaseId/summaries/:summaryId/preview`.
- `summaryId` is always `video_case_aggregates.id` and must never be interpreted as an `evaluation_id`.
- Do not list aggregate summaries in `/my-forms`.
- Do not change the existing individual evaluation preview route or behavior.
- Signed URLs must come from the existing `document-artifact-url` Edge Function through `getVideoCaseAggregateDocumentUrls`.
- Do not expose a service-role key or construct public storage URLs in the browser.
- Do not add deletion, editing, document generation, callback, storage-path, or n8n changes.

---

## File Structure

- Create `src/services/videoCaseSummaryDocumentPreviewCore.js`: pure route and document-state classification.
- Create `src/services/videoCaseSummaryDocumentPreviewCore.d.ts`: TypeScript interface for the pure module.
- Create `tests/videoCaseSummaryDocumentPreviewCore.test.js`: focused state and route tests using the existing test runner.
- Create `src/page/VideoCaseSummaryDocumentPreviewPage.tsx`: aggregate loading, polling, signed URLs, status UI, iframe, and downloads.
- Modify `src/App.tsx`: register the protected nested preview route.
- Modify `src/page/VideoCaseSummaryPage.tsx`: expose the document action without embedding document rendering.

### Task 1: Aggregate Document Preview Contract

**Files:**
- Create: `tests/videoCaseSummaryDocumentPreviewCore.test.js`
- Create: `src/services/videoCaseSummaryDocumentPreviewCore.js`
- Create: `src/services/videoCaseSummaryDocumentPreviewCore.d.ts`

**Interfaces:**
- Consumes: aggregate fields `video_case_id`, `document_status`, `document_error`, `pdf_storage_path`, and `docx_storage_path`.
- Produces: `resolveVideoCaseSummaryDocumentState(aggregate, videoCaseId)` and `buildVideoCaseSummaryDocumentPreviewPath(videoCaseId, summaryId)`.

- [ ] **Step 1: Write the failing contract tests**

```javascript
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVideoCaseSummaryDocumentPreviewPath,
  resolveVideoCaseSummaryDocumentState,
} from "../src/services/videoCaseSummaryDocumentPreviewCore.js";

const base = {
  video_case_id: "case-1",
  document_status: "ready",
  document_error: null,
  pdf_storage_path: "video-case-aggregates/a/result.pdf",
  docx_storage_path: "video-case-aggregates/a/result.docx",
};

test("builds the nested aggregate document preview route", () => {
  assert.equal(
    buildVideoCaseSummaryDocumentPreviewPath("case 1", "aggregate/1"),
    "/video-cases/case%201/summaries/aggregate%2F1/preview",
  );
});

test("rejects an aggregate from another video case", () => {
  assert.deepEqual(
    resolveVideoCaseSummaryDocumentState(base, "case-2"),
    { kind: "mismatched_case" },
  );
});

test("classifies pending and failed aggregates", () => {
  assert.deepEqual(
    resolveVideoCaseSummaryDocumentState(
      { ...base, document_status: "pending" },
      "case-1",
    ),
    { kind: "pending" },
  );
  assert.deepEqual(
    resolveVideoCaseSummaryDocumentState(
      { ...base, document_status: "failed", document_error: "generation failed" },
      "case-1",
    ),
    { kind: "failed", error: "generation failed" },
  );
});

test("requires at least one artifact for a ready aggregate", () => {
  assert.deepEqual(
    resolveVideoCaseSummaryDocumentState(
      { ...base, pdf_storage_path: null, docx_storage_path: null },
      "case-1",
    ),
    { kind: "ready_without_artifact" },
  );
});

test("returns available formats for a ready aggregate", () => {
  assert.deepEqual(
    resolveVideoCaseSummaryDocumentState(base, "case-1"),
    { kind: "ready", hasPdf: true, hasDocx: true },
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test tests/videoCaseSummaryDocumentPreviewCore.test.js
```

Expected: FAIL because `videoCaseSummaryDocumentPreviewCore.js` does not exist.

- [ ] **Step 3: Implement the minimal pure module**

```javascript
export function buildVideoCaseSummaryDocumentPreviewPath(videoCaseId, summaryId) {
  return `/video-cases/${encodeURIComponent(videoCaseId)}/summaries/${encodeURIComponent(summaryId)}/preview`;
}

export function resolveVideoCaseSummaryDocumentState(aggregate, videoCaseId) {
  if (!aggregate) return { kind: "not_found" };
  if (aggregate.video_case_id !== videoCaseId) return { kind: "mismatched_case" };
  if (aggregate.document_status === "pending") return { kind: "pending" };
  if (aggregate.document_status === "failed") {
    return {
      kind: "failed",
      error: aggregate.document_error || "Document generation failed.",
    };
  }

  const hasPdf = Boolean(aggregate.pdf_storage_path);
  const hasDocx = Boolean(aggregate.docx_storage_path);
  if (!hasPdf && !hasDocx) return { kind: "ready_without_artifact" };
  return { kind: "ready", hasPdf, hasDocx };
}
```

Add declarations matching the aggregate input and discriminated union output so the React page can switch exhaustively on `kind`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
node --test tests/videoCaseSummaryDocumentPreviewCore.test.js
```

Expected: 5 tests pass.

- [ ] **Step 5: Run the complete unit suite**

Run:

```powershell
npm.cmd test
```

Expected: all existing and new tests pass.

- [ ] **Step 6: Commit the contract**

```powershell
git add -- tests/videoCaseSummaryDocumentPreviewCore.test.js src/services/videoCaseSummaryDocumentPreviewCore.js src/services/videoCaseSummaryDocumentPreviewCore.d.ts
git commit -m "test: define aggregate document preview states"
```

### Task 2: Dedicated Summary Document Preview Page

**Files:**
- Create: `src/page/VideoCaseSummaryDocumentPreviewPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `getVideoCaseAggregate(summaryId)`, `getVideoCaseAggregateDocumentUrls(summaryId)`, and `resolveVideoCaseSummaryDocumentState`.
- Produces: protected route `/video-cases/:videoCaseId/summaries/:summaryId/preview`.

- [ ] **Step 1: Add a failing route assertion**

Extend `tests/videoCaseSummaryDocumentPreviewCore.test.js` with a source-level route assertion that reads `src/App.tsx` and requires:

```text
path="/video-cases/:videoCaseId/summaries/:summaryId/preview"
```

and:

```text
<VideoCaseSummaryDocumentPreviewPage />
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test tests/videoCaseSummaryDocumentPreviewCore.test.js
```

Expected: FAIL because `App.tsx` does not register the route.

- [ ] **Step 3: Implement the preview page**

Create `VideoCaseSummaryDocumentPreviewPage.tsx` with these behaviors:

```typescript
const { videoCaseId, summaryId } = useParams<{
  videoCaseId: string;
  summaryId: string;
}>();
```

- Load with `getVideoCaseAggregate(summaryId)`.
- Classify with `resolveVideoCaseSummaryDocumentState(aggregate, videoCaseId)`.
- Poll every 5 seconds only while state is `pending`.
- Resolve URLs only for `ready` state with `getVideoCaseAggregateDocumentUrls(summaryId)`.
- Render metadata and navigation in the header.
- Render a neutral loading card while loading.
- Render an amber processing card while pending.
- Render a red error card for failed, missing, mismatched, query, or signed-URL errors.
- Render PDF and DOCX download actions when present.
- Render an `h-[800px] w-full` iframe only when `pdfUrl` exists.
- Render a ready fallback when only DOCX exists.
- Stop polling on unmount or when status changes.

The page must not mutate or delete the aggregate.

- [ ] **Step 4: Register the protected route**

Import `VideoCaseSummaryDocumentPreviewPage` in `src/App.tsx` and register:

```tsx
<Route
  path="/video-cases/:videoCaseId/summaries/:summaryId/preview"
  element={
    <ProtectedRoute>
      <VideoCaseSummaryDocumentPreviewPage />
    </ProtectedRoute>
  }
/>
```

Place it next to the existing video-case summary routes.

- [ ] **Step 5: Run the route contract and full tests**

Run:

```powershell
node --test tests/videoCaseSummaryDocumentPreviewCore.test.js
npm.cmd test
```

Expected: all tests pass.

- [ ] **Step 6: Run the production build**

Run:

```powershell
npm.cmd run build
```

Expected: build succeeds. The existing large-chunk warning is non-blocking.

- [ ] **Step 7: Commit the preview page**

```powershell
git add -- src/page/VideoCaseSummaryDocumentPreviewPage.tsx src/App.tsx tests/videoCaseSummaryDocumentPreviewCore.test.js
git commit -m "feat: add aggregate document preview page"
```

### Task 3: Summary Navigation and Final Verification

**Files:**
- Modify: `src/page/VideoCaseSummaryPage.tsx`
- Modify: `tests/videoCaseSummaryDocumentPreviewCore.test.js`

**Interfaces:**
- Consumes: `buildVideoCaseSummaryDocumentPreviewPath(videoCaseId, aggregate.id)`.
- Produces: visible document navigation for ready and non-ready aggregate states without embedding the document.

- [ ] **Step 1: Add a failing source-level navigation test**

Extend the focused test to require `VideoCaseSummaryPage.tsx` to import and call:

```text
buildVideoCaseSummaryDocumentPreviewPath
```

and display document navigation copy.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test tests/videoCaseSummaryDocumentPreviewCore.test.js
```

Expected: FAIL because the summary page has no document preview navigation.

- [ ] **Step 3: Add the document action**

In `VideoCaseSummaryPage.tsx`:

- Import `buildVideoCaseSummaryDocumentPreviewPath`.
- Add a `ดูเอกสาร` link to the header actions when
  `aggregate.document_status === "ready"` and either artifact path exists.
- Add a `ตรวจสอบสถานะเอกสาร` link when status is `pending` or `failed`.
- Point both actions to the same nested preview route.
- Do not load artifact URLs or embed an iframe on the summary page.

- [ ] **Step 4: Run the focused and complete test suites**

Run:

```powershell
node --test tests/videoCaseSummaryDocumentPreviewCore.test.js
npm.cmd test
```

Expected: all tests pass.

- [ ] **Step 5: Run static and production verification**

Run:

```powershell
npm.cmd run build
git diff --check
```

Expected: build succeeds and `git diff --check` reports no whitespace errors.

- [ ] **Step 6: Manually verify the ready aggregate**

Open:

```text
/video-cases/b639bb41-79ba-4d4c-bdcc-ec004f670853/summaries/2cec8f58-bceb-4a46-9795-361b80c4b9a9/preview
```

Verify:

- The PDF renders in the iframe.
- PDF and DOCX actions open signed URLs.
- Back to summary and back to video case work.
- `/my-forms` remains unchanged.

- [ ] **Step 7: Commit the navigation**

```powershell
git add -- src/page/VideoCaseSummaryPage.tsx tests/videoCaseSummaryDocumentPreviewCore.test.js
git commit -m "feat: link summaries to generated documents"
```
