# Video Case Summary Document Preview Design

## Objective

Provide a document preview experience for generated video-case summary
artifacts that matches the existing individual evaluation preview without
mixing aggregate summaries into `/my-forms`.

## Scope

- Add a dedicated preview page under the selected video case.
- Display the generated PDF in an iframe.
- Provide PDF and DOCX download actions.
- Display pending, ready, and failed document states.
- Keep the existing summary review and submission page separate.
- Do not add aggregate summaries to `/my-forms`.
- Do not change the individual evaluation preview route or behavior.

## Route

The document preview route is:

```text
/video-cases/:videoCaseId/summaries/:summaryId/preview
```

`summaryId` is the aggregate primary key from
`video_case_aggregates.id`. It must never be interpreted as an
`evaluation_id`.

## Navigation

The existing summary page displays a `ดูเอกสาร` action when the aggregate
document status is `ready` and at least one artifact path is available.

The document preview page provides:

- Download PDF, when `pdf_storage_path` is available.
- Download DOCX, when `docx_storage_path` is available.
- Back to summary.
- Back to video case.

Pending and failed aggregates may still open the preview route so users can
inspect their current status and error message.

## Data Flow

1. Read `videoCaseId` and `summaryId` from the route.
2. Load the aggregate through `getVideoCaseAggregate(summaryId)`.
3. Reject the page when the aggregate does not exist or its
   `video_case_id` does not equal the route `videoCaseId`.
4. While `document_status` is `pending`, poll the aggregate record at a
   bounded interval so the page can transition to ready or failed.
5. When ready and artifact paths exist, call
   `getVideoCaseAggregateDocumentUrls(summaryId)`.
6. That service invokes the existing `document-artifact-url` Edge Function
   with `{ aggregateId: summaryId }`.
7. Render the returned signed PDF URL in an iframe and use the returned PDF
   and DOCX URLs for downloads.

The frontend must not construct public storage URLs or use the service-role
key.

## UI States

### Loading

Show the same neutral loading treatment used by the individual document
preview.

### Pending

Show that document generation is still processing. Poll until the aggregate
becomes ready or failed.

### Ready

Show document metadata, PDF/DOCX actions, and the embedded PDF preview. If
only DOCX exists, show the DOCX action and an artifact-available fallback
instead of an empty iframe.

### Failed

Show `document_error` and navigation back to the summary and video case.

### Missing or mismatched

Show a not-found message when the aggregate does not exist. Show an invalid
case message when the aggregate belongs to a different video case.

## Permissions

The page remains behind `ProtectedRoute`. Artifact URLs are resolved by the
existing `document-artifact-url` Edge Function, which verifies the user and
their role or case membership before returning signed URLs.

No client-side service-role access is introduced.

## Component Design

Add a focused `VideoCaseSummaryDocumentPreviewPage` component rather than
adding document rendering responsibilities to `VideoCaseSummaryPage`.

Reuse existing button, card, status, and iframe styling from `PreviewPage`.
Shared extraction is optional and should only be done when it reduces
duplication without changing the individual evaluation behavior.

## Error Handling

- Invalid or missing route parameters do not invoke Supabase.
- Aggregate query errors are shown on the page.
- Signed URL errors show the returned message without exposing secrets.
- Missing paths in a ready aggregate produce a clear artifact-not-available
  message.
- Polling is stopped when the component unmounts or the status is no longer
  pending.

## Testing

- The new route renders the aggregate preview component.
- A ready aggregate requests URLs with its `aggregate_id`.
- A ready aggregate renders a PDF iframe and PDF/DOCX actions.
- A pending aggregate displays processing state and polls.
- A failed aggregate displays `document_error`.
- A mismatched `videoCaseId` is rejected.
- The existing `/preview/:docId` individual evaluation flow remains
  unchanged.
- `npm.cmd test` and `npm.cmd run build` complete successfully.

## Out of Scope

- Listing aggregate summaries in `/my-forms`.
- Deleting aggregates from the preview page.
- Editing combined scores or suggestions from the document preview.
- Generating documents from the preview page.
- Changing storage paths, callbacks, or n8n workflow behavior.
