# n8n Evaluation and Video Case Summary Contract

Individual evaluations and combined video case summaries are separate document
types. They must retain separate primary identifiers through every n8n node and
the final document callback.

## Identifier Rules

| Document type | Primary identifier | Source provenance |
| --- | --- | --- |
| `evaluation` | `evaluation_id` (positive integer) | Not applicable |
| `video_case_summary` | `aggregate_id` (UUID) | `source_evaluation_ids` |

A payload must never contain both `evaluation_id` and `aggregate_id`. n8n must
never copy the first source evaluation into `evaluation_id` for a summary.

The Edge Functions temporarily accept legacy payloads without `document_type`
when exactly one valid primary identifier is present. New V4 and n8n payloads
must send `document_type`; the fallback exists only so V2/V3 can be migrated
without downtime.

## Normalize Incoming Payload

```text
document_type         <- body.document_type
evaluation_id         <- body.evaluation_id (evaluation only)
aggregate_id          <- body.aggregate_id (summary only)
video_case_id         <- body.video_case_id
source_evaluation_ids <- body.source_evaluation_ids
```

For a summary, preserve `aggregate_id` unchanged through merge, AI, document,
and callback nodes. `source_evaluation_ids` describes provenance and is not the
document primary key.

## Final Document Callback

```text
document_type <- normalized.document_type
evaluation_id <- normalized.evaluation_id (evaluation only)
aggregate_id  <- normalized.aggregate_id (summary only)
docId         <- document result docId
status        <- ready or failed
```

Send the callback to the deployed `document-generation-callback` Edge Function
with the configured `x-callback-secret` header.

## Evaluation Example

```json
{
  "document_type": "evaluation",
  "evaluation_id": 224,
  "video_case_id": "b639bb41-79ba-4d4c-bdcc-ec004f670853",
  "subject_name": "Postman Test",
  "order_number": "001"
}
```

Successful callback:

```json
{
  "document_type": "evaluation",
  "evaluation_id": 224,
  "docId": "google-document-id",
  "status": "ready"
}
```

## Video Case Summary Example

```json
{
  "document_type": "video_case_summary",
  "aggregate_id": "61abc689-868a-4bc7-a0b0-000000000000",
  "video_case_id": "b639bb41-79ba-4d4c-bdcc-ec004f670853",
  "sender_employee_number": "020943",
  "source_evaluation_ids": [224, 225, 226],
  "source_count": 3,
  "question_averages": {
    "1": {
      "q1": 4
    }
  },
  "section_averages": {
    "1": 4
  },
  "aggregate_analysis": {
    "summary": "Combined result"
  },
  "combine_prompt": "Leader note"
}
```

Successful callback:

```json
{
  "document_type": "video_case_summary",
  "aggregate_id": "61abc689-868a-4bc7-a0b0-000000000000",
  "docId": "google-document-id",
  "status": "ready"
}
```

The callback updates `evaluations` for an evaluation and
`video_case_aggregates` for a video case summary.
