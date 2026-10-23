# Direct video submission — 2026-10-23 (Asia/Bangkok)

## Rollout

- Applied only migration `20261023090000_direct_document_dispatch.sql` after dry
  run; preflight found zero running/awaiting/attention legacy queue jobs.
- Deployed `forward-to-n8n` version 23 (JWT verification true) and
  `document-generation-callback` version 22 (existing callback-secret auth,
  gateway JWT verification false as before).
- Verified direct dispatch RPC exists, old worker claim returns zero rows, and
  authenticated legacy enqueue permission is false. Unauthenticated forwarding
  returned 401 without invoking n8n.
- User confirmed setting VIA-v4 Webhook Respond to Immediately and saving it.
  The actual test nevertheless exceeded the 20-second acknowledgement deadline;
  this response-mode/runtime discrepancy remains to be checked before claiming
  immediate browser acknowledgement works. No workflow settings were committed
  by the agent through the UI.

## Authorized real browser submission

- Browser: `http://localhost:5173/form-submit`; one click on Send.
- Order: `002`; title: `TestWithVideo`.
- Overall suggestion: `Test process with video`.
- Selected all 45 scores randomly; database readback confirms 45 stored answers.
- Video: `2 Introduction Negotiating for Value Creation.m4v`, displayed 326.5 MB,
  duration shown by the file chooser 04:32.
- R2 browser upload completed; saved evaluation **261**, created 11:13:58 Bangkok.
- Direct dispatch created 11:14:00; **no queue worker was used**.
- n8n VIA-v4 workflow `nl38M3CrQPQXpg0G`, execution **3044**, started 11:14:01.
- Edge request timed out awaiting acknowledgement and safely recorded unknown
  delivery. The original workflow continued; the agent did not replay it.

## Result

**FAIL at downstream AI processing.** n8n execution 3044 ended with an error after
1m 53.667s at `Analyze Video`. Its HTTP Request output reports:

`OpenAI request failed (HTTP 429). credit_balance_exhausted: API credit balance is exhausted.`

No AI output, PDF, or DOCX was stored at the verification checkpoint. Upload,
persistence, and direct n8n delivery passed; AI/document completion did not.

After independently observing the failed execution, the agent reconciled only
#261 from pending/unknown to failed with the error/execution ID. The update was
conditional on the matching order/title, no artifact paths, pending document
state, and unknown dispatch state, so a completed callback could not be replaced.
The callback synchronization trigger also records dispatch failure.

Do not retry until API credit is restored and the original execution is confirmed
stopped. No billing changes, fake success callback, automatic replay, historical
job retry, or second evaluation submission occurred.
