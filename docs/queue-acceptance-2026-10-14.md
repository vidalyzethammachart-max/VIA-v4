# Queue acceptance — 2026-10-14

Acceptance snapshot before the subsequent commit/deployment step. Verified on this Windows workstation against the configured live Supabase and n8n services. Frontend browser checks used localhost. At this checkpoint the application/UI had not been published to Vercel; the two database migrations below were deployed. No new evaluation, aggregate, or case was created, and no existing record was deleted.

## Results

| Check | Result | Evidence |
| --- | --- | --- |
| Deployed queue identity binding | PASS | Migration `20261014140000`; authenticated direct RPC regression against synthetic evaluation 246 passed inside a transaction followed by ROLLBACK |
| Queue health migration | PASS | `20261014150000` installed; readback reports `worker_online=true`, `paused=false` after worker recovery |
| Individual processing | PASS | Evaluation `246`; queue `aff78170-e734-49a6-a790-d71931f62bc8`; n8n execution `3001` succeeded at 20:26:52 Bangkok in 56.942 seconds; job completed on attempt 1; real document state ready |
| Summary processing | PASS | Aggregate `dfc81cac-ea57-4bcc-9785-7aba9bf32795`; queue `b38ac538-452e-42a8-b4eb-4ab539c1f645`; n8n execution `3002` succeeded at 20:29:41 Bangkok in 56.469 seconds; job completed on attempt 1; real document state ready |
| PDF / DOCX access | PASS | All four signed downloads under the test user's permissions returned HTTP 200; valid PDF and Word ZIP signatures; Word packages contain the generated synthetic titles |
| PDF opened directly in Chrome | PASS | Evaluation 246 visibly renders a six-page PDF with `QUEUE-SYNTHETIC-246`, the synthetic title, and score-3 checkmarks |
| Embedded individual PDF preview | NOT VERIFIED | Preview page loads and offers downloads, but its iframe stayed blank in the controlled browser. Direct PDF works; added an explicit fallback instruction. No claim of fixed inline rendering |
| Original evaluation content | PASS | Scores, suggestions, and case linkage of 244–247 match pre-test hashes. During individual processing, complete rows 244,245,247 remained unchanged |
| Summary source integrity | PASS | During summary processing, complete evaluation rows 244–247 remained unchanged. Aggregate source snapshot, source ID array, and combined scores also match pre-summary hashes |
| TypeScript | PASS | Both app and Vite configuration checked by `npm run typecheck`; build now includes these checks |
| Lint | PASS | `npm run lint`, zero errors or warnings; temporary `.figma-capture` artifacts are excluded |
| Automated tests | PASS | `npm test`: 83 passed, zero failed; real queue migrations execute in temporary PostgreSQL via PGlite |
| Build | PASS | `npm run build`, exit 0; remaining warning is a ~764 kB JavaScript chunk |
| Local worker process recovery | PASS | Scheduled task `VIA-V4-QueueWorker`; stopped known idle worker PID 35212 at 20:34:36, supervisor started PID 18892 at 20:34:46; heartbeat returned online |
| Always-on production host | BLOCKED | User has no server. Current worker depends on this PC being awake, online, and signed in. A persistent host and real reboot recovery there have not been configured |

## Test data and authorization boundaries

Outbound content was generated entirely for this smoke test: score 3 for 45 questions, synthetic titles/order numbers, and synthetic suggestions. Stored subject names, comments, rubrics, and source snapshots were not copied into outbound n8n requests. The existing synthetic pending evaluation/aggregate were used as callback targets; their original source fields were preserved.

Automatic approval review rejected the initial proposal to send the stored evaluation content because of possible sensitive-data export. That rejected command did not execute. The subsequent approved calls used newly generated synthetic report content instead. No credential or workflow change was made in n8n.

The configured n8n API key expires at `2026-09-26T17:00:00Z` and API reads return 401. Execution status was verified in the authenticated browser. Renew that existing key through the owner before relying on automated n8n API inspection; never paste it into reports or commit it.

## Artifact integrity

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Individual PDF | 449319 | `5c0f94564b09c2c184a0aa255a00e19a41c83f42f7c0ab1df98d6c53d083f672` |
| Individual DOCX | 405022 | `539d0bfc2108a82973f82091dad5d810dd8cea5f9a7be876c9611d770ab956a9` |
| Summary PDF | 449509 | `9e096d88124a8a417227b28881e8fb483543d77e8633956528be9a799e53c5bc` |
| Summary DOCX | 404979 | `07b43b16ca848d6eadda477dba89397ec251cbdaf00512755803463e4303bf99` |

See [worker operation and safe recovery](queue-worker-operations.md). This acceptance run itself did not commit, push, or deploy the frontend; those are separate release steps.
