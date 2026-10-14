# Queue worker operations

The queue is durable in Supabase. An online worker dispatches one document request at a time. A queued acknowledgement does not mean a document is ready; the authenticated document callback must store at least one artifact.

## This Windows PC

The `VIA-V4-QueueWorker` scheduled task runs as the current user with limited privileges. It starts at sign-in and checks once a minute that its supervisor is running, preventing duplicate task instances. The supervisor restarts an exited worker after 10 seconds. It does not run while the PC is off/asleep or the user is logged out. This is not a 24/7 production server.

Install or update after pulling changes:

```powershell
powershell.exe -NoProfile -File scripts/install-queue-worker.ps1
```

Check and operate:

```powershell
Get-ScheduledTask -TaskName VIA-V4-QueueWorker
Get-ScheduledTaskInfo -TaskName VIA-V4-QueueWorker
Get-Content -LiteralPath logs/queue-worker.log -Tail 20
Start-ScheduledTask -TaskName VIA-V4-QueueWorker
# Stop only when no request is running; stopping during delivery needs inspection.
Stop-ScheduledTask -TaskName VIA-V4-QueueWorker
```

The runner writes worker output to `logs/queue-worker.log`, errors to `logs/queue-worker-error.log`, and lifecycle events to `logs/queue-supervisor.log`. The previous worker logs are retained as `.previous`; the supervisor log rotates at 10 MB. Logs contain job IDs and state transitions, not payloads or credentials. `logs/queue-worker.pid` identifies the current worker.

Keep `.env.queue.local` outside Git. Required keys: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `N8N_WEBHOOK_URL`. R2 credentials are also required for video jobs. `AI_QUEUE_GAP_SECONDS` defaults to 90 and cannot be less than 60. Never expose these worker credentials as `VITE_*` variables.

## Health and a paused queue

The worker updates a heartbeat every 30 seconds, including while waiting for n8n. Dashboard reports the worker offline after 90 seconds without a heartbeat. All signed-in users can read only the two global health booleans; job rows remain restricted to their requester and admins.

An `attention` job holds the global lane because delivery may already have happened. Dashboard warns that the queue is paused. The owner or admin must inspect the n8n execution for the document target, confirm it has stopped and has no completed artifact, then use **ลองใหม่ด้วยข้อมูลเดิม**. Never confirm this while the original execution is active. If the original callback completes, the worker reconciles the ready artifact and releases the lane automatically. A `retry_wait` job waits until its persisted retry time; it does not need another form submission.

## A future always-on host

Run `npm ci` with dev dependencies for build/test, then run the worker with `npm run start:queue` under the host's service supervisor. Keep a single desired instance, server-only credentials, automatic restart, and persistent logs. Database claiming still prevents concurrent dispatch if two processes overlap. Confirm `get_ai_queue_health()` reports `worker_online=true` before moving traffic, then stop the Windows task while idle. Hosting, billing, and reboot recovery on an actual server remain unverified until a host is provided.

## Verification

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

Build includes TypeScript checks for both the app and Vite configuration. Queue security and health tests execute the real migrations against temporary PostgreSQL through PGlite. The deployed identity check in `supabase/tests/queue_payload_security_rollback.sql` uses synthetic evaluation 246 and rolls back every change; it does not call n8n.
