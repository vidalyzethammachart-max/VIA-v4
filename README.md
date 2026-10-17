# VIA

Video Intelligence & Analytics web application for evaluation form submission, role-based access, document generation, and admin user management.

## Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Supabase
  - Auth
  - Postgres
  - Storage
  - Edge Functions
- n8n
- Google Apps Script

## Main Features

- Authentication with login, register, forgot password, and reset password
- Role-based routing for `user`, `editor`, and `admin`
- Evaluation form submission flow
- Dashboard with bar chart and donut chart summaries
- My Forms page with generated document tracking
- Document preview with PDF/DOCX download
- Profile management
  - full name
  - employee number
  - gender
  - avatar upload
- Durable queue for evaluation and summary processing, including uploaded video
- Admin dashboard
  - user search/filter
  - role update
  - account deletion
- Light mode / dark mode

## App Routes

- `/` login
- `/register`
- `/forgot-password`
- `/reset-password`
- `/dashboard`
- `/form-submit`
- `/my-forms`
- `/preview/:docId`
- `/profile`
- `/role-requests`
- `/admin`

## Environment Variables

Create a `.env` file:

```env
VITE_SUPABASE_URL=YOUR_SUPABASE_URL
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
N8N_WEBHOOK_URL=YOUR_N8N_WEBHOOK_URL
VITE_UPLOAD_VIDEO_API_URL=https://YOUR_UPLOAD_API_URL/api/upload-video
CORS_ORIGIN=http://localhost:5173,https://YOUR_FRONTEND_DOMAIN
R2_ACCOUNT_ID=YOUR_CLOUDFLARE_ACCOUNT_ID
R2_ACCESS_KEY_ID=YOUR_R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY=YOUR_R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME=YOUR_R2_BUCKET_NAME
```

Video submissions use Cloudflare R2 direct upload to avoid request body limits on Render/Vercel:

1. The frontend calls `POST /api/r2-presign-upload` on the upload backend.
2. The browser uploads the video directly to R2 with the returned signed `uploadUrl`.
3. The frontend calls the authenticated `forward-to-n8n` Edge Function, which authorizes and saves the document request to the queue (HTTP 202).
4. The server-only worker claims one job at a time, refreshes the R2 download URL, and dispatches the existing n8n workflow. The document callback determines readiness.

Run the worker with `npm run start:queue`. Configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `N8N_WEBHOOK_URL` in the gitignored `.env.queue.local`; video processing also needs the R2 credentials above. See [worker setup, health alerts, and recovery](docs/queue-worker-operations.md). An online worker is required for queued jobs to progress.

n8n should download the video from `payload[0].video.downloadUrl` instead of expecting a multipart binary field. Do not send large video binaries through `/api/n8n-webhook`; that proxy accepts JSON payloads only.

## n8n AI Result Callback

The n8n workflow must call `POST https://YOUR_FRONTEND_DOMAIN/api/n8n-analysis-result` after its AI node finishes. Configure these server-only deployment variables (never expose them as `VITE_*`):

```env
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
N8N_CALLBACK_SECRET=GENERATE_A_LONG_RANDOM_SECRET
```

Set request header `x-n8n-callback-secret` to the same `N8N_CALLBACK_SECRET`, and send this JSON from n8n:

```json
{
  "evaluation_id": 217,
  "model": "gemini-2.5-flash",
  "analysis": {
    "summary": "AI evaluation result"
  }
}
```

`analysis` is stored in `evaluations.analysis_ai_output`. If the AI result is plain text, send it as `raw_text` and it is stored in `evaluations.analysis_ai_raw_text`.

For uploads larger than 250MB, the upload backend environment must include all R2 variables:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`

If any of these are missing, the presign step fails before the browser can upload to R2.

To inspect the older multipart relay flow, set:

```env
VITE_VIDEO_UPLOAD_MODE=legacy
```

Legacy mode sends the file through `/api/upload-video` on the upload backend and relays it to n8n as multipart form data.

Local Cloud Run-compatible backend:

```bash
npm run start:upload-api
```

Set the frontend upload target when using Cloud Run:

```env
VITE_UPLOAD_VIDEO_API_URL=https://YOUR_CLOUD_RUN_URL/api/upload-video
```

Cloudflare R2 bucket CORS must allow the frontend origin to `PUT` objects. Example:

```json
[
  {
    "AllowedOrigins": ["http://localhost:5173", "https://YOUR_FRONTEND_DOMAIN"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

Build the Cloud Run container with:

```bash
docker build -f Dockerfile -t via-upload-api .
```

The Cloud Run backend also exposes `POST /api/analyze-video` for n8n. It accepts:

```json
{
  "fileUrl": "https://example.com/video.mp4",
  "fileName": "video.mp4"
}
```

It downloads the video and extracts sample frames and audio with ffmpeg. OpenAI evaluates the audio separately, then combines that evidence with the frames to return the existing structured analysis contract. It samples visual frames; it does not inspect every frame of the complete video. Set these **server-only** variables:

```env
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
OPENAI_MODEL=gpt-4.1-mini
OPENAI_AUDIO_MODEL=gpt-audio-mini
```

Both aggregate analysis endpoints also use OpenAI. There is no automatic fallback to Gemini. An audio API failure fails the request instead of silently scoring audio from images. API credentials and inference credit are separate from a ChatGPT subscription. Keep keys out of `VITE_*`, version control, images, and logs; configure them separately on the deployed backend.

Verify model access with `node scripts/check-openai.mjs`. Run `node scripts/check-openai.mjs --generate` for a small, billable synthetic JSON request that does not send user data. Restart the local upload API after changing server code or environment values.

Analysis endpoints now require `Authorization: Bearer <ANALYSIS_API_TOKEN>` from the calling service. Set the server token and the matching n8n **Header Auth** credential before restarting. Do not expose this token in the website. Missing configuration returns 503; invalid credentials return 401. Upload-presign and existing health endpoints are unchanged.

See [the migration audit and setup guide](docs/openai-migration-audit-2026-10-17.md) and the [inactive, credential-free n8n video adapter](n8n/workflows/via-openai-video-adapter.json). The main production workflow has not been changed. Video/aggregate results are cached in `AI_ANALYSIS_CACHE_DIR` (default `logs/analysis-cache`); retain this directory on persistent storage to reuse results after replacing a host. Cache hits reuse original usage records and do not represent newly charged tokens. The provider does not return a dollar cost, so `estimatedCostUsd` is null rather than an invented estimate. An unknown delivery holds a `.lock` for inspection; do not remove it and replay blindly. Live smoke checks can hit cache and are not proof of fresh provider availability.

Changing AI providers does not repair a hosting outage: n8n still calls its configured analysis backend URL. If that Cloud Run project's billing is disabled, restore hosting or deploy this backend to a reachable host before retrying the workflow. Never point n8n Cloud at `localhost`, and inspect an existing execution before retrying an ambiguous queue job.

## Local Development

Install dependencies:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

Build production bundle:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

Lint:

```bash
npm run lint
```

## Supabase

Supabase logic in this project includes:

- database migrations in [`supabase/migrations`](./supabase/migrations)
- edge functions in [`supabase/functions`](./supabase/functions)

Current edge functions:

- `forward-to-n8n`
- `document-generation-callback`
- `document-artifact-url`
- `admin-user-management`
- `generate-doc`

## Database Migrations

Important migrations already included:

- `20260403195000_accounting_layer.sql`
- `20260403223000_role_requests.sql`
- `20260404001000_cancel_role_requests.sql`
- `20260404013000_evaluations_user_doc_columns.sql`
- `20260404030000_secure_evaluations_document_flow.sql`
- `20260404110000_document_artifacts_storage.sql`
- `20260404123000_expand_user_profile_fields.sql`
- `20260405110000_profile_avatar_storage.sql`

## Document Generation Flow

The document pipeline is split across the app, Supabase, n8n, and Google Apps Script.

High-level flow:

1. User submits an evaluation.
2. Supabase forwards the request to n8n.
3. n8n prepares payload data for Google Apps Script.
4. Apps Script creates a Google Doc from a template.
5. Apps Script exports PDF and DOCX.
6. Apps Script uploads files to Supabase Storage.
7. Apps Script calls `document-generation-callback`.
8. The app reads generated artifacts from Supabase Storage for preview/download.

Generated document artifacts are stored in:

- bucket: `evaluation-documents`
- path pattern:
  - `evaluations/<evaluation_id>/result.pdf`
  - `evaluations/<evaluation_id>/result.docx`

Profile avatars are stored in:

- bucket: `profile-avatars`

## Project Structure

```text
src/
  assets/
  components/
  config/
  hooks/
  lib/
  page/
  services/
  theme/
supabase/
  functions/
  migrations/
```

## Notable Pages

- [`src/page/Dashboard.tsx`](./src/page/Dashboard.tsx)
- [`src/page/FormSubmit.tsx`](./src/page/FormSubmit.tsx)
- [`src/page/MyFormsDashboard.tsx`](./src/page/MyFormsDashboard.tsx)
- [`src/page/PreviewPage.tsx`](./src/page/PreviewPage.tsx)
- [`src/page/Profile.tsx`](./src/page/Profile.tsx)
- [`src/page/AdminDashboard.tsx`](./src/page/AdminDashboard.tsx)

## Notes

- This project expects Supabase policies, buckets, and edge functions to be deployed before all features work correctly.
- Google Apps Script is part of the production document pipeline and is managed outside this repository.
- n8n is also external to this repository and must be configured separately.
