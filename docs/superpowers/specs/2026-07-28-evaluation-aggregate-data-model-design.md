# Evaluation and Aggregate Data Model Design

## Objective

Separate individual evaluations from combined video-case summaries without breaking VIA V2 or VIA V3, which share the same Supabase project with VIA V4.

The design is additive. It introduces relational integrity for aggregate sources and a strict payload contract while preserving existing tables, columns, arrays, and document fields for compatibility.

## Constraints

- The Supabase project is shared by VIA V2, VIA V3, and VIA V4.
- Existing tables and columns must not be dropped, renamed, or have their meaning changed.
- Individual evaluations must continue to use `evaluations.id` as `evaluation_id`.
- Combined summaries must use `video_case_aggregates.id` as `aggregate_id`.
- Existing `source_evaluation_ids` arrays remain available during the compatibility period.
- Existing `google_doc_id`, `evaluation_kind`, `analysis_kind`, and `video_case_aggregate_runs` remain unchanged.
- Migrations must be idempotent and safe against the current remote schema drift.

## Identifier Contract

### Individual evaluation

An individual submission is stored in `public.evaluations`.

- Primary identifier: `evaluations.id`
- API field: `evaluation_id`
- Document type: `evaluation`
- Document callback target: `public.evaluations`

An individual payload must not contain `aggregate_id`.

### Combined summary

A leader-created combined result is stored in `public.video_case_aggregates`.

- Primary identifier: `video_case_aggregates.id`
- API field: `aggregate_id`
- Document type: `video_case_summary`
- Document callback target: `public.video_case_aggregates`

A summary payload must not use a source evaluation ID as its own identifier. Its source evaluations are provenance only and remain in `source_evaluation_ids` and the new relational source table.

## Relational Source Table

Add `public.video_case_aggregate_sources`.

| Column | Type | Rules |
| --- | --- | --- |
| `aggregate_id` | `uuid` | References `video_case_aggregates(id)` with `ON DELETE CASCADE` |
| `evaluation_id` | `bigint` | References `evaluations(id)` with `ON DELETE RESTRICT` |
| `source_position` | `integer` | Non-negative ordering value |
| `created_at` | `timestamptz` | Defaults to `now()` |

The composite primary key is:

```text
(aggregate_id, evaluation_id)
```

An additional unique constraint on `(aggregate_id, source_position)` prevents ambiguous source ordering.

`ON DELETE RESTRICT` protects a source evaluation from deletion while it is referenced by a combined summary. Deleting the aggregate removes only its source-link rows.

## Compatibility Strategy

`video_case_aggregates.source_evaluation_ids` remains the compatibility representation. VIA V4 writes both:

1. The existing `source_evaluation_ids` array.
2. One row per source evaluation in `video_case_aggregate_sources`.

The migration backfills the source table from existing aggregate arrays using array ordinality. Re-running the migration must not duplicate rows.

VIA V4 reads the relational source rows when available and falls back to `source_evaluation_ids` for aggregates created by older code or during deployment sequencing.

No V2 or V3 query needs to change during this migration.

## Document Schema Repair

The remote migration history contains the old evaluation-document migration, but the remote PostgREST schema reports that `evaluations.source_doc_id` is absent. Add a new repair migration rather than editing or replaying historical migrations.

The repair migration adds these evaluation columns with `IF NOT EXISTS`:

- `source_doc_id text`
- `pdf_storage_path text`
- `docx_storage_path text`

It also preserves the existing document indexes and requests a PostgREST schema reload.

The same migration verifies aggregate document columns additively:

- `document_status`
- `document_error`
- `source_doc_id`
- `pdf_storage_path`
- `docx_storage_path`

## Payload Contract

### Evaluation request

```json
{
  "document_type": "evaluation",
  "evaluation_id": 224
}
```

Required rules:

- `evaluation_id` is a positive integer.
- `aggregate_id` is absent.

### Summary request

```json
{
  "document_type": "video_case_summary",
  "aggregate_id": "61abc689-868a-4bc7-a0b0-000000000000",
  "video_case_id": "b639bb41-79ba-4d4c-bdcc-ec004f670853",
  "source_evaluation_ids": [224, 225, 226]
}
```

Required rules:

- `aggregate_id` is a valid UUID.
- `evaluation_id` and `evaluationId` are absent.
- `source_evaluation_ids` contains only positive integer IDs.

The application may include camel-case aliases for non-identifier compatibility fields, but primary identifiers use snake case at the n8n boundary.

## Forwarding and Callback Rules

`forward-to-n8n` validates the identifier contract before forwarding:

- `document_type = evaluation` requires only `evaluation_id`.
- `document_type = video_case_summary` requires only `aggregate_id`.
- A payload containing both identifiers is rejected with HTTP 400.
- A payload containing neither required identifier is rejected with HTTP 400.

The secured payload preserves `aggregate_id`, `video_case_id`, and `source_evaluation_ids` through n8n.

`document-generation-callback` selects its update table from `document_type`:

- `evaluation` updates `evaluations.id = evaluation_id`.
- `video_case_summary` updates `video_case_aggregates.id = aggregate_id`.

It must not infer the target table merely from whichever ID happens to be present.

The callback returns HTTP 400 for inconsistent document types and identifiers, HTTP 404 when the target record does not exist, and HTTP 500 only for database or unexpected server failures.

## n8n Contract

Every n8n transformation used by the shared document workflow must preserve:

- `document_type`
- `evaluation_id` for individual evaluations
- `aggregate_id` for summaries
- `video_case_id` for summaries
- `source_evaluation_ids` for summaries
- callback URL and callback secret

The final callback body for a summary contains `document_type`, `aggregate_id`, document artifact fields, and status. It does not contain a substituted source `evaluation_id`.

## Security

- Existing RLS policies remain in place.
- Users who can view an aggregate can view its source-link rows.
- Only leaders, admins, and the aggregate creation flow can insert source-link rows.
- Source-link inserts must confirm that the evaluation belongs to the same `video_case_id` as the aggregate.
- Service-role callbacks remain protected by `DOCUMENT_CALLBACK_SECRET`.

The same-case validation is enforced in the database, not only in the frontend.

## Error Handling

- Aggregate creation is atomic: aggregate and source-link rows either complete together or the operation fails.
- A failed n8n request marks the correct evaluation or aggregate document status as `failed`.
- A callback cannot update an individual evaluation using an aggregate request.
- A missing source row does not silently remove an ID from the compatibility array.
- Backfill conflicts are ignored only when the same `(aggregate_id, evaluation_id)` link already exists.

## Testing

### Database tests

- Creating a source link with matching case IDs succeeds.
- Linking an evaluation from another video case fails.
- Duplicate `(aggregate_id, evaluation_id)` fails.
- Deleting an aggregate cascades to its source links.
- Deleting a referenced evaluation is restricted.
- Existing aggregate arrays backfill with stable source ordering.
- Repair migration succeeds whether document columns already exist or are absent.

### Payload tests

- Evaluation payload contains `evaluation_id` and no `aggregate_id`.
- Summary payload contains `aggregate_id` and no `evaluation_id` aliases.
- Summary payload retains all `source_evaluation_ids`.
- Mixed identifiers are rejected.
- Missing identifiers are rejected.

### Application verification

- A normal form submission still appears in `/my-forms`.
- A leader can combine selected evaluations and preview one summary payload.
- Sending a summary updates `video_case_aggregates`, not a source evaluation.
- Existing V2 and V3 evaluation submissions continue to use the shared evaluation workflow.
- `npm.cmd run build` completes successfully.

## Deployment Order

1. Apply the additive repair and aggregate-source migration.
2. Verify the backfilled source rows and document columns.
3. Deploy callback validation and forwarding changes.
4. Update and activate the n8n field mappings.
5. Deploy the V4 frontend/service changes.
6. Run one individual evaluation test.
7. Run one summary test using a new aggregate.
8. Monitor V2 and V3 submissions before considering any legacy cleanup.

## Out of Scope

- Dropping `video_case_aggregate_runs`.
- Dropping `source_evaluation_ids`.
- Removing `google_doc_id`, `evaluation_kind`, or `analysis_kind`.
- Migrating V2 or V3 application code.
- Generating a second document type for the same aggregate.
- Automatically deleting historical Google Docs created by failed workflow attempts.
