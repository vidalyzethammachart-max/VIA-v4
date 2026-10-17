# ตรวจสอบและปรับปรุง VIA: OpenAI video analysis

วันที่ 17 ตุลาคม 2026 — ตรวจจาก working tree รวมงานที่ยังไม่ commit ตามคำขอในไฟล์แนบ ไม่ deploy ไม่แก้ production ไม่ลบข้อมูล และไม่เรียก OpenAI แบบมีค่าใช้จ่ายในรอบงานนี้

## 1. โครงสร้างที่พบจริง

| ส่วน | หลักฐานใน repository | ข้อสรุป |
|---|---|---|
| เว็บ React/TypeScript/Vite | `package.json`, `src/page/FormSubmit.tsx` | รองรับ data-only และ with-video; บันทึกก่อนเข้าคิว |
| วิดีโอ | `server/r2Presign.js`, `FormSubmit.tsx` | browser PUT ตรง R2 ไม่ส่งไฟล์ใหญ่ผ่าน n8n |
| API local / container | `upload-api.js`, `server/cloud-run-upload.js`, `Dockerfile` | Express ใช้ core วิเคราะห์เดียวกัน; container รัน cloud-run-upload |
| AI | `server/openAiAnalysis.js`, `server/videoAnalysisCore.js`, `server/videoCaseAggregateCore.js` | โค้ดที่ค้างไว้ย้ายมา OpenAI แล้ว; รอบนี้เติม controls/cache/metadata |
| คิว | `server/requestQueueWorker.js`, `server/requestQueuePolicy.js`, migrations `20261014130000*`, `20261014140000*`, `20261014150000*` | คิว durable ใน Supabase, single global lane, fencing token, health, inspected retry |
| n8n | `n8n/nodes/*.js.txt`, `tests/n8nVideoCaseContract.test.js` | มี Code node bodies ไม่ใช่ full workflow export; ตรวจ contract แบบ offline ได้ |
| callback เอกสาร | `supabase/functions/document-generation-callback/index.ts` | ต้องมี server callback secret; แยก evaluation/aggregate; ready ต้องมี artifact |
| callback ผล AI | `api/n8n-analysis-result.js` | รองรับ analysis/model เข้าฟิลด์ AI เดิม แยกจาก rubric |
| สิทธิ์ | `src/lib/roles.ts`, migrations baseline/accounting/video-case | global roles เป็น user/editor/admin; case-scoped member/leader |

ไม่พบ AGENTS.md ที่ใช้กับ checkout หรือใน ancestor ที่ตรวจ ไม่มี Apps Script `.gs` หรือไฟล์ Google Docs template ใน repository จึงไม่สามารถยืนยันโค้ดสร้างไฟล์จริงหรือการป้องกันรายงานซ้ำใน Apps Script ได้

Role Guest ที่กล่าวในบริบทไม่ใช่ค่าใน enum ปัจจุบัน จึงไม่เพิ่มหรือเปลี่ยนชื่อ role โดยคาดเดา ไม่ถือว่า default role ของผู้ใช้ที่ authenticated เท่ากับการอนุญาต guest ที่ยังไม่ login

## 2. แผนและงานเดิมที่ใช้ต่อ

- `docs/superpowers/plans/2026-10-14-central-request-queue.md`: ใช้คิวเดิม ไม่สร้างอีกคิวหรือ reset งานเพื่อทดลอง
- `docs/superpowers/specs/2026-10-15-cloud-video-queue-design.md`: เป็นแบบเสนอเรื่อง hosted dispatcher/Scheduler ยังไม่ได้ implement หรือ activate ในรอบนี้
- `docs/openai-migration-status-2026-10-17.md`: หลักฐานทดสอบจริงก่อนรอบนี้; OpenAI เคยตอบ `credit_balance_exhausted` ไม่ใช่ข้อยืนยันสถานะเครดิตแบบสดในรอบนี้
- working tree มี migration ไป OpenAI, scripts, tests และ docs ที่ยังไม่ commit อยู่ก่อนเริ่ม เก็บไว้และพัฒนาต่อ ไม่มี git reset/checkout ทับงาน

## 3. ขอบเขตระยะแรกที่แก้ในเครื่อง

### Provider และ contract

ใช้ `POST /api/analyze-video` เดิม รับ `fileUrl`, `fileName`, `prompt` เหมือนเดิม ไม่สมมติว่าส่ง MP4 เข้า vision API โดยตรง:

1. ดาวน์โหลดจาก trusted HTTPS R2 host โดยไม่ตาม redirect จำกัด byte ที่ stream จริงไม่เกิน 1 GiB
2. ตรวจ duration จาก metadata จริงด้วย ffmpeg: มากกว่า 20 นาทีหรืออ่านไม่ได้ถูกปฏิเสธ
3. เลือก 3–12 ภาพ (default 6) กระจายตลอด duration และย่อกว้าง 1024 px; จำกัดเวลา ffmpeg
4. แยก MP3 ส่งให้ `gpt-audio-mini` ประเมินเสียงจริง เก็บ evidence และ usage ไว้ใช้ซ้ำ
5. ส่งภาพและ audio evidence เข้า Responses API ด้วย `gpt-4.1-mini` คืน JSON
6. คง `status`, `analysis`, `model`, `frameCount`, `audioBytes` และ field เดิม เพิ่ม provider/promptVersion/usage/cache metadata โดยไม่เปลี่ยนคะแนนผู้ประเมิน

ไม่มี audio evidence จะกำชับให้คะแนนเสียง/การบรรยายเป็น null และระบุข้อจำกัด ไม่ใช้ transcript หรือภาพเดาเสียง ไม่มี silent fallback ไป provider เสียเงินอีกราย และไม่มีการรับประกันว่าคุณภาพ/ราคาดีกว่า Gemini

การสุ่มภาพยังไม่ใช่การดูทุกเฟรม และอาจพลาดเหตุการณ์สั้น ๆ ต้องระบุข้อจำกัดนี้ในรายงาน จำนวนภาพกับต้นทุนและความครอบคลุมต้องวัดกับคลิปจริงภายหลัง

### Cache และ retry

`server/analysisCache.js` เก็บเฉพาะผลที่ตรวจแล้วและ usage บน server; hash identity รวม provider scope, model, prompt version และ request content ไม่เก็บ request body/media/API key เป็นไฟล์ cache ใช้ separate audio/vision entries ทำให้ vision ล้มเหลวแล้วไม่ต้องประเมินเสียงที่สำเร็จไปแล้วซ้ำ

ป้องกันคำขอซ้ำใน process ด้วย shared promise และข้าม process ที่ใช้ directory เดียวกันด้วย exclusive file lock เขียนผลแบบ atomic เปลี่ยน prompt/model/input แล้วได้ key ใหม่ ผลไม่สมบูรณ์/ไม่ใช่ JSON ไม่ถือเป็นผลสำเร็จ

ถ้า network outcome ไม่แน่นอนหรือบันทึกผลหลัง provider สำเร็จไม่ได้ จะค้าง `.lock` ให้ตรวจ ไม่ลบแล้ว replay เอง การตอบ 409/analysis_pending ให้ตรวจ usage และ n8n execution ก่อนแก้ lock

ข้อจำกัด: cache directory บน ephemeral Cloud Run ไม่รับประกันอยู่รอดหลังเปลี่ยน instance หรือ deploy ต้องเตรียม persistent/shared storage หรือออกแบบ durable store แยกก่อนยืนยัน production idempotency ข้ามเครื่อง คิว Supabase เดิมไม่ได้ทดแทนการเก็บ AI output แบบ durable นี้

คืน usage เดิมพร้อม cache-hit flag; usage จาก cache ไม่ใช่ token ที่เพิ่งถูกเรียกเก็บเงิน API ไม่ได้ส่งราคาดอลลาร์ จึงคืน `estimatedCostUsd: null` ไม่คำนวณจากราคาเดา และไม่รวม audio/vision token ด้วย flat rate ที่ผิดชนิด

`requestQueuePolicy.js` หยุด retry เมื่อได้รับ billing/credit error ที่รู้จัก และ hold attention เมื่อได้รับ ambiguous analysis error แต่ถ้า n8n ส่งกลับเพียง generic 500 โดยไม่บอก underlying code จะยังแยกสาเหตุไม่ได้ ต้องตรวจ webhook response contract จริงก่อน production

### การเชื่อม n8n

พบว่า Code body `Transform VIA Payload` เดิมไม่ส่งต่อ OpenAI backend's `analysis` ไป `videoEvaluation` จึงเพิ่มการรับ aliases เดิมและ `status=analyzed` โดยเก็บ AI metadata แยก ตรวจต่อผ่าน Assemble context แล้ว human rubric ไม่เปลี่ยน

แก้เฉพาะไฟล์ใน repo ยังไม่ได้แก้ live nodes รายงานภาษาไทย/Apps Script flow และ Gemini text-generation nodes เดิมไม่ถูกแทนโดยอัตโนมัติ เพราะขอบเขตระยะแรกคือบริการวิเคราะห์วิดีโอ

ไฟล์ `n8n/workflows/via-openai-video-adapter.json` เป็น sub-workflow นำเข้าได้ ไม่ใช่ full main workflow ที่สร้างเดา มี Execute Sub-workflow Trigger, HTTP analysis, และรักษา target identity ไม่มี webhook เปิด public, ไม่มี credentials หรือ pinData และตั้ง inactive

เลือกใช้อย่างใดอย่างหนึ่งตอน activate ที่ได้รับอนุญาต:

- เปลี่ยน URL/Header Auth ของ Analyze Video node เดิม กระทบ flow น้อยที่สุด หรือ
- นำเข้า adapter แล้วเรียกจาก with-video branch โดย wait for completion และคง Merge ที่รวม human evaluation เดิม

ต้องคง request prompt ภาษาไทยเดิม และใช้ Code body Transform/Assemble ที่ปรับไว้ อย่าเสียบ adapter บน data-only branch หรือเปลี่ยน schema ของ report ทั้งชุด

### Access และข้อมูล

analysis endpoints ทั้ง local และ container ต้องใช้ service token ผ่าน `Authorization: Bearer ...` หากไม่ตั้ง token จะตอบ 503, ถ้าผิดตอบ 401 ห้ามฝัง token ใน frontend เก็บใน n8n Header Auth credential

token นี้ยืนยัน calling service เท่านั้น ไม่ใช่ role/owner ของผู้ใช้ ต้องใช้ Supabase enqueue authorization/RLS เดิมต่อ และตรวจสิทธิ์ต้นทางใน flow ก่อน dispatch เสมอ Host allowlist ลด arbitrary downloads ไม่แทน source authorization

การป้องกัน n8n public webhook และ presign endpoint ต้องตรวจ deployment จริงเพิ่มก่อนเปิด public website; ห้ามอ้างว่า migration นี้ audit security ทั้งระบบครบแล้ว

ไม่มีการแก้ schema/role/RLS ในรอบนี้ ไม่ต้องมี migration ใหม่ ข้อมูล evaluation, aggregate, source IDs, rubric 9×5 และ callback fields เดิมถูกเก็บไว้

## 4. Video Case และระยะถัดไป

`video_cases` เป็น shared case; มี membership, individual evaluations/analysis runs และ aggregates ที่อ้าง source results แยกต่างหาก `src/services/videoCaseService.ts` คำนวณ combined statistics ด้วยโค้ดและเก็บ source IDs ไม่เรียก AI ซ้ำขณะรวมคะแนน

ใช้ส่วนนี้ต่อได้ ไม่สร้าง video group ใหม่หรือ global leader role ต้องรักษา source results และให้ leader/admin เป็นผู้สั่ง aggregate ตาม permission เดิม

ระยะถัดไปต้องระบุ video version/revision และ rubric version ก่อนทำ trend/หลายวิดีโอ; แยก trend จาก comparison, เลือก source/time window ชัดเจน, กำหนดน้ำหนักต่อวิดีโอ ไม่ให้จำนวน review เพิ่มน้ำหนักโดยไม่ตั้งใจ ไม่แปลง schema เดิมให้หมายถึงหลายวิดีโอโดยอัตโนมัติ

ยังไม่รับประกัน report-only retry ว่าจะไม่สร้าง Google Docs ซ้ำ เพราะไม่มี Apps Script source หรือ durable report checkpoint ปัจจุบัน Full workflow replay อาจเรียก Gemini report nodes เดิมซ้ำ แม้ OpenAI video cache ช่วยลดการวิเคราะห์วิดีโอซ้ำได้ ต้อง resume เฉพาะจุดล้มเหลวด้วย saved context ที่ตรวจแล้วและตรวจ idempotency ฝั่ง Apps Script ก่อนใช้งานจริง

## 5. ตั้งค่าและใช้งานหลังตรวจทาน

```env
OPENAI_API_KEY=<server-only API key>
OPENAI_MODEL=gpt-4.1-mini
OPENAI_AUDIO_MODEL=gpt-audio-mini
ANALYSIS_API_TOKEN=<random service token, keep private>
AI_ANALYSIS_CACHE_DIR=logs/analysis-cache
VIDEO_ANALYSIS_FRAME_COUNT=6
VIDEO_ALLOWED_HOSTS=
VIDEO_ALLOW_LOCAL_TEST_URLS=false
```

`R2_ACCOUNT_ID` เดิมจะเพิ่ม R2 host เข้า allowlist อัตโนมัติ `VIDEO_ALLOWED_HOSTS` สำหรับ trusted storage เพิ่มเติมเท่านั้น `VIDEO_ALLOW_LOCAL_TEST_URLS=true` ใช้กับ synthetic loopback tests ห้ามตั้ง production

ตั้ง `ANALYSIS_API_TOKEN` และ Header Auth ก่อน restart backend: `npm.cmd run start:upload-api` ดูค่า `.env` ก่อน `.env.local` ตาม `server/loadEnv.js` และ process environment มีลำดับสูงกว่า ไม่พิมพ์ secret เพื่อเช็ก config

n8n Cloud ต้องเรียก HTTPS backend ที่ reachable ไม่ใช่ localhost โค้ด local ที่แก้ไม่เปลี่ยน Cloud Run/n8n URL ให้เอง การเปิด tunnel ถูกปฏิเสธก่อนหน้านี้และไม่ได้ใช้เป็นทางลัดในรอบนี้ ไม่เปิด Billing/เติมเงิน/auto-reload แทนเจ้าของบัญชี

## 6. ผลตรวจและข้อจำกัด

| Flow | สถานะ | หลักฐาน/ขอบเขต |
|---|---|---|
| Tests ทั้ง repo | PASS | 110 tests ณ checkpoint ก่อน final documentation update; รันซ้ำหากมี code เปลี่ยนภายหลัง |
| lint | PASS | npm.cmd run lint |
| typecheck/build | PASS | npm.cmd run build; bundle-size warning เดิมยังอยู่ |
| วิดีโอ → ffmpeg → OpenAI adapter | PASS แบบ mock | synthetic media จริง, actual ffmpeg, mocked provider responses; ไม่ใช่ paid API test |
| ไม่มีวิดีโอ | PASS แบบ contract | ไม่สร้าง video evidence; tests เดิมของ submission/target ยังผ่าน |
| human/AI separation, source IDs, aggregate averages | PASS แบบ contract | tests n8n, source IDs, queue security และ combined statistics |
| cache/retry | PASS แบบ mock | concurrent calls, report replay, successful audio reuse, unknown delivery lock |
| analysis auth/storage allowlist/duration | PASS local | ไม่ใช่ proof ของ deployed access control |
| อ่าน n8n export สด | BLOCKED | public API key ตอบ 401; ไม่เดา full workflow หรือทับ live version |
| Apps Script/Docs template | BLOCKED | ไม่มี source/template export ใน checkout |
| paid OpenAI / real video E2E | NOT RUN | ผู้ใช้ไม่อนุญาตค่าใช้จ่ายในงานรอบนี้; หลักฐานก่อนหน้าคือ API credit หมด |
| production / deployed RLS / reports เก่าจริง | NOT VERIFIED | ไม่ deploy ไม่ mutate data ไม่เปิดงานจริง |

แยก upload/analysis/document stages ได้จาก form, backend errors และ document/queue state เดิม แต่ยังไม่มี durable per-stage orchestration ใหม่ ไม่อ้างว่า phase 2 หรือ hosted worker เสร็จแล้ว

## 7. แหล่งอ้างอิง

- OpenAI image/vision inputs: https://developers.openai.com/api/docs/guides/images-vision
- Audio inputs: https://developers.openai.com/api/docs/guides/audio-chat-completions
- API errors/billing vs transient rate limits: https://developers.openai.com/api/docs/guides/error-codes
- API pricing (ต้องคำนวณจาก workload จริง): https://developers.openai.com/api/docs/pricing
