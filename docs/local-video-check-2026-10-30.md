# Local video check — 2026-10-30

The user corrected the requested submission test to local before push/deployment.
No push or deployment was performed.

## Production upload interrupted

Before that correction, one production form submission was started with order
`TEST-CLOUD-20261030`, title `CloudTest-Negotiating-20261030`, all 45 human rubric
scores selected as 3 and the original Negotiating video attached. On correction,
the UI still displayed upload progress 24%, with no evaluation ID or success
message. Navigated that tab to `about:blank` to interrupt the in-flight upload.
No second submission or retry was sent.

The form resolves/creates video-case membership before uploading and saves the
evaluation only after upload completes. Consequently, a test video case may
remain; cancellation does not establish that all production side effects were
rolled back. No production analysis outcome is claimed.

## Local media pipeline

Ran the current `analyzeVideoFromUrl` implementation with the original file
served by a temporary loopback HTTP server. Gemini responses were simulated;
the real download, ffmpeg metadata probe, frame extraction, full audio extraction,
request assembly and response validation ran. The test asserted six JPEG inputs
and audio larger than 1 MB at the provider boundary. No real AI request or cloud
database write was made by this local check.

| Result | Value |
| --- | --- |
| Status | `analyzed` |
| Bytes read | 342,328,931 |
| Duration | 272.08 seconds |
| Images | 6 |
| Audio bytes | 1,633,178 |
| Local elapsed time | 2.547 seconds |

Temporary downloaded media and simulation cache were removed; the original file
was preserved. This establishes local media-pipeline success, not real Gemini
analysis, UI form submission, n8n, callback, or document generation acceptance.

Vite was started on `http://127.0.0.1:5173`. Its current configuration points to
hosted Supabase and an upload backend on Cloud Run. Form dispatch calls hosted
`forward-to-n8n`; merely using localhost does not route Analyze Video to the
patched local backend. Clarification was requested before another submission.
