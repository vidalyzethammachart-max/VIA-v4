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
- Video file upload to n8n webhook
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
VITE_N8N_WEBHOOK_URL=YOUR_N8N_WEBHOOK_URL
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
3. The frontend sends the evaluation payload to `N8N_WEBHOOK_URL` with `video.downloadUrl`.

n8n should download the video from `payload[0].video.downloadUrl` instead of expecting a multipart binary field. Do not send large video binaries through `/api/n8n-webhook`; that proxy accepts JSON payloads only.

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
docker build -f Dockerfile.cloudrun -t via-upload-api .
```

The Cloud Run backend also exposes `POST /api/analyze-video` for n8n. It accepts:

```json
{
  "fileUrl": "https://example.com/video.mp4",
  "fileName": "video.mp4"
}
```

It downloads the video, extracts sample frames with ffmpeg, sends those frames to Gemini vision, and returns a structured analysis. Set:

```env
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
GEMINI_MODEL=gemini-1.5-flash
```

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
