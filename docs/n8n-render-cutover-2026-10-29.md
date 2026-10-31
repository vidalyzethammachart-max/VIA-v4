# n8n Render cutover — 2026-10-29

## Root cause and live change

Execution 3093 failed in 1.473 seconds with HTTP 404 / `ERR_NGROK_3200`:
the configured ngrok endpoint was offline. Executions 3091 and 3092 also failed.
The live editor still pointed Analyze Video at ngrok despite the earlier Render
deployment. R2 storage was already in use; this failure was at the analysis host.

Changed only Analyze Video's URL in active workflow `nl38M3CrQPQXpg0G` to:

`https://via-v4-analysis.onrender.com/api/analyze-video`

Saved and reloaded the page from the server; the editor showed Saved, Active,
and the Render URL. Existing Header Auth credential, JSON payload, 600000ms
timeout, Retry On Fail OFF and Stop Workflow behavior were retained.
No readiness node was added in this repair; the previous candidate import was
not applied. Health was checked before the controlled recovery attempt.

Render Dashboard independently confirmed service `srv-dbh8ejm1egvs73eqjueg`
is Free, Live, and deployed from commit `29160da`. No deployment, plan change,
billing change or credential change was performed.

## Verification

- Live Render health: HTTP 200, `{"ok":true}`.
- Live analysis POST without token: HTTP 401.
- Local `node --test tests/n8nVideoCaseContract.test.js tests/hostedAnalysis.test.js`:
  20 passed, 0 failed. Initial sandbox run could not bind loopback (EPERM);
  the approved run outside the sandbox passed.
- Confirmed no running execution before selecting **Retry with currently saved
  workflow (from node with error)** for the definitively failed execution 3093.
  One recovery execution, **3094**, started at 07:54:52 Bangkok.
- Recovery **3094 succeeded in 2m 36.843s** using the Render URL.
  Its final HTTP callback returned `AI analysis saved.` for evaluation **299**,
  with model `gemini-2.5-flash`.
- Authenticated production page `/preview/299` showed `TestwitVideo`, order
  `009`, and both stored PDF/DOCX download links. The PDF loaded in Chrome as
  six pages, with the expected title and average 3.16. DOCX downloaded as
  `TestwitVideo.docx` (405060 bytes); ZIP integrity check passed. This verifies
  availability, not a separate Word layout audit or a full visual PDF review.
- No further recovery was sent for 3091/3092. Those are separate failed
  submissions and were not needed to establish this fix.

## Free service limits

Render's [Free service documentation](https://render.com/docs/free), checked
on October 29, states that idle services sleep after 15 minutes and take about
one minute to wake. Each workspace shares 750 free instance hours per month;
bandwidth and build quotas also apply. Local caches disappear on restart/sleep.
The application's single-operation limit rejects overlapping analysis requests
instead of providing a durable queue. The current timeout does not prove cold
start acceptance; this run was made after a successful health check.

## Production test with the requested Negotiating video

- User explicitly requested a production website test with
  `/Users/Phirapon/Downloads/2 Introduction Negotiating for Value Creation.m4v`.
- Local probe: 342328931 bytes (342.3 MB decimal / 326.5 MiB), duration
  272.08 seconds, H.264 1920×1080 approximately 25 fps, AAC stereo audio.
- Existing My Forms list had no matching test. Prepared one form with order
  `TEST-RENDER-20261029`, title `RenderTest-Negotiating-20261029`, all 45
  human scores set to 3, and an explicit system-test note.
- Selected the original file through the website's file picker; no transcode
  or direct backend bypass. Confirmed no active n8n executions and the editor's
  Render endpoint before submission.
- Chrome was being used concurrently. On returning to the form, upload was
  already in progress (25% observed); the agent did not click Submit again.
  At 08:09:25 Bangkok upload remained underway.
- Upload completed through the production website. It showed
  `Evaluation sent for analysis. Evaluation ID: 300`; My Forms contained one
  matching new entry, linked to case `57293aab-70b6-47cf-af40-a9ce73c27247`.
- n8n execution **3095** started at **08:11:03 Bangkok** and failed in
  **2m 45.762s** at Analyze Video, using the correct Render endpoint.
  HTTP **422** body: `{"code":"invalid_video","error":"Media processing failed or exceeded the time limit."}`.
  No retry or second submission was sent. Full pipeline acceptance **FAILED**.
- Current core code makes frame extraction fatal, while audio-extraction errors
  are caught and allow processing to continue. This error therefore localizes
  to the frame-extraction subprocess. Its deadline is 120 seconds, but the
  response does not distinguish timeout from a nonzero process exit.
- A read-only media check using the original local file and the same six-frame
  extraction command succeeded in **10.582 seconds**, exit 0, six JPEGs. ffmpeg
  selected the actual H.264 video stream (0:0), not the attached cover images.
  This rules out an unconditional local decoding failure; it does not reproduce
  Render's CPU/RAM constraints. Temporary probe frames were removed.
- Render application logs exposed the startup line only, with no ffmpeg exit
  detail. Resource exhaustion or the 120-second deadline remain hypotheses,
  not confirmed causes. No service configuration, deployment or plan changed.
- Production My Forms still displayed the new evaluation as processing after
  the terminal n8n failure. PDF/DOCX were not available; failure status is not
  automatically propagated by this failed execution.
