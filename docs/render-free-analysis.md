# แผนย้ายการวิเคราะห์วิดีโอไป Render Free

วันที่ตรวจข้อมูล: 28 ตุลาคม 2026 (Asia/Bangkok)

สถานะล่าสุด 29 ตุลาคม 2026: สร้างและ deploy Render Free แล้ว ผ่านการวิเคราะห์
วิดีโอสังเคราะห์และไฟล์ M4V จริงแบบเรียก endpoint โดยตรงแล้ว ต่อมาสลับ URL ใน
n8n ที่ Active สำเร็จ และกู้ execution 3093 เป็น 3094 จบใน 2m 36.843s พร้อม
callback ของรายการ 299 และ PDF/DOCX ที่เปิด/ดาวน์โหลดได้ ดู
[หลักฐานการสลับและขอบเขตการตรวจ](n8n-render-cutover-2026-10-29.md)
รายละเอียดด้านล่างเป็นแผนและข้อจำกัดที่ใช้ตรวจรับ

## ผลทดสอบบน Render วันที่ 29 ตุลาคม 2026

- Service: `via-v4-analysis`, ID `srv-dbh8ejm1egvs73eqjueg`, region Singapore
- Endpoint: `https://via-v4-analysis.onrender.com/api/analyze-video`
- Health: `GET https://via-v4-analysis.onrender.com/healthz`
- Free service บน Hobby workspace; ตอนตรวจไม่มี card on file และยอดเดือนนี้ $0
- Build จาก branch `feat/render-free-analysis`, commit `29160da5be0b51b15516e80a72e2c909d4e9701d`
  Dockerfile `Dockerfile.analysis`, auto-deploy Off
- Build แรกเริ่มจาก main เพราะช่องค้น branch ไม่ได้เลือก branch จริง จึงยกเลิกหลัง 9.9 วินาที
  จากนั้นเลือก branch ผ่าน Settings และ deploy commit ข้างต้นสำเร็จ ไม่ได้สลับ n8n ระหว่าง build
- Probe ไม่เรียก AI: health 200, ไม่มี token 401, แหล่งวิดีโอไม่อนุญาต 422,
  API upload และ aggregate 404
- วิดีโอสังเคราะห์ 12 วินาที: HTTP 200 ใน 12.866 วินาที, 6 ภาพ, เสียง MP3 72,939 ไบต์,
  Gemini 2.5 Flash, ผลครบ 6 หมวด, cache ทั้งสองเป็น false
- ไฟล์จริง `035_001_Teaser Academic Resources Guide for Your Enhanced Learning.m4v`:
  ใช้ object จากรอบทดสอบ 294 ที่เก็บใน R2 อยู่แล้ว ไม่อัปโหลดซ้ำสำหรับ direct probe
  HTTP 200 ใน 135.868 วินาที, ดาวน์โหลดครบ 76,812,480 ไบต์, ความยาว 65 วินาที,
  ภาพ 6 เฟรม, เสียง MP3 391,679 ไบต์, Gemini 2.5 Flash, ผลครบ 6 หมวด และไม่ใช้ cache
- ระหว่าง direct request ไฟล์จริงยังไม่จบ health ตอบ 200 ใน 141 ms
- หน้า CPU/Memory metrics ต้องอัปเกรดแผน จึงไม่ได้อ่าน peak RAM/CPU และไม่ได้อัปเกรด
  ผลข้างต้นยืนยันว่าไฟล์นี้ทำงานได้ ไม่ใช่หลักประกันสำหรับทุกไฟล์ที่เว็บรับได้
- ชุดทดสอบในเครื่องหลังเพิ่ม coverage: 172 ผ่าน; lint/build ผ่านก่อนหน้า โดย build
  มีคำเตือน bundle ใหญ่กว่า 500 kB เดิม; review ไม่พบ blocking issue
- สำรอง workflow จาก server ก่อนสลับไว้ใน ignored `logs/n8n-before-render-20261029.local.json`
  Candidate เพิ่ม readiness GET และปรับ expression ให้อ่านวิดีโอจาก `Has Video?1`
  โดยรักษา POST retries เป็น Off; contract tests กับ candidate ผ่าน 14/14

ผล candidate ข้างต้นเป็นหลักฐานก่อนสลับ รอบแก้ไขถัดมาเปลี่ยนเฉพาะ URL ของ
Analyze Video ผ่าน UI แล้ว reload ตรวจจาก server ไม่ได้ import candidate หรือเพิ่ม
readiness GET การกู้รายการเดิมผ่าน Render และ callback/PDF/DOCX สำเร็จแล้ว
แต่ cold start และการส่งแบบประเมินใหม่หลังสลับยังไม่ได้ตรวจในรอบนี้

## เส้นทางที่จะใช้

เว็บ Vercel → อัปโหลดวิดีโอเข้า R2 → Supabase forward-to-n8n → n8n VIA-v4
→ Render `/api/analyze-video` → ดาวน์โหลดจาก R2 และแยกภาพ/เสียงด้วย ffmpeg
→ Gemini Free → n8n สร้าง PDF/DOCX → callback เข้า Supabase

Render จะทำหน้าที่แทน backend ในเครื่องและ ngrok เท่านั้น การออก URL อัปโหลด
ผ่าน hosting เดิมยังอยู่ การย้ายนี้จึงไม่รับรองว่าค่าใช้จ่ายรวมของระบบเป็นศูนย์
ไม่ต้องแบ่งไฟล์วิดีโอก่อนอัปโหลด ระบบยังแยกภาพตัวอย่างและเสียงที่ backend

## ทางเลือกที่พิจารณา

- เครื่องผู้ใช้ + ngrok: ผ่านการทดสอบจริงแล้ว แต่หยุดให้บริการเมื่อเครื่องพักหรือออฟไลน์
- Cloud Run เดิม: รองรับงานนี้ แต่ไม่สามารถรับรองว่าไม่มีค่าใช้จ่ายเพิ่ม
- Render Free: ผู้ใช้เลือกเพราะไม่ต้องเปิดเครื่องและต้องการหลีกเลี่ยงค่าบริการเพิ่ม
  ต้องยอมรับ cold start และทรัพยากรที่จำกัด

## ข้อจำกัดที่ยืนยันจาก Render

- Free Web Service: 0.1 CPU และ RAM 512 MB
- ไม่มีคำขอเข้า 15 นาที จะพัก service; คำขอถัดไปปลุก service ใช้เวลาประมาณหนึ่งนาที
- 750 instance-hours ต่อ workspace ต่อเดือน แบ่งใช้กับ free services อื่น
- เกินชั่วโมงฟรีจะถูกพักจนเดือนใหม่
- ไฟล์ในเครื่อง Render หายเมื่อ restart, redeploy หรือพัก service ไม่มี persistent disk ฟรี
- มีโควตา bandwidth/build เพิ่มเติม หากไม่มี payment method จะพักบริการ/หยุด build
  ตามข้อจำกัด แทนการเก็บเงินส่วนเกิน ต้องตรวจ workspace จริงก่อน deploy
- Render อาจพัก free service ที่เรียกเครือข่ายภายนอกสูงผิดปกติ งานนี้เรียก R2 และ Gemini
- Render ระบุว่า Free เหมาะกับการทดลอง ไม่แนะนำให้ใช้เป็น production ที่ต้องการความพร้อมสูง

ยังไม่เคยทดสอบไฟล์จริงบน RAM 512 MB และ CPU 0.1 จึงยังรับรองไม่ได้ว่างานวิดีโอ
ทุกขนาดที่เว็บรับอยู่จะทำงานได้หรือจบใน timeout เดิม

แหล่งข้อมูล:
- https://render.com/docs/free
- https://render.com/docs/compute-plans
- https://render.com/docs/web-services
- https://render.com/docs/blueprint-spec

## งานที่ต้องปรับ

1. เตรียม service สำหรับวิเคราะห์เท่านั้น เปิด `POST /api/analyze-video` และ health check
   ไม่เปิด API อัปโหลดหรือการรวมผลที่ใช้ provider อื่นโดยไม่จำเป็น
2. ปรับ listener ให้รับ `0.0.0.0:$PORT` บน Render โดยรักษา listener ในเครื่องให้เป็น loopback
3. ใช้ Docker/Node และ ffmpeg ที่มีอยู่ เพิ่ม deployment configuration ที่ระบุ `plan: free`
   ไม่เพิ่มฐานข้อมูลหรือ persistent disk แบบเสียเงิน
4. จำกัดการประมวลผลวิดีโอพร้อมกัน และวัด RAM/เวลา ffmpeg จริงก่อนกำหนดขนาดงานที่รองรับ
   กรณีเต็มต้องตอบอย่างชัดเจน ห้ามแอบทิ้งงานหรือรับปากว่าจะมีคิวถาวร
5. จัดการ cold start ด้วยการตรวจ readiness ที่ไม่เรียก AI ก่อนส่งวิเคราะห์จริง
   ไม่เปิด automatic retry ของ POST วิเคราะห์ หากผลการส่งไม่แน่นอนต้องตรวจ execution ก่อน
6. คง JSON request/response และคะแนนมนุษย์เดิม เมื่อ service ผ่านแล้วเปลี่ยน URL
   ของ Analyze Video จาก ngrok เป็น URL จริงของ Render; ไม่เดาชื่อโดเมนล่วงหน้า
7. เก็บวิดีโอ/เอกสารใน R2/Supabase ตามเดิม Cache และ lock บน Render เป็นข้อมูลชั่วคราว
   ต้องไม่อ้างว่า lock ในเครื่องป้องกันการเรียกซ้ำข้าม restart ได้

## Configuration และ secrets

ค่าที่ไม่เป็นความลับ:

```dotenv
NODE_ENV=production
VIDEO_ANALYSIS_PROVIDER=gemini
GEMINI_MODEL=gemini-2.5-flash
VIDEO_ALLOW_LOCAL_TEST_URLS=false
```

Secrets ใน Render เท่านั้น:

- `GEMINI_API_KEY`: ใช้โปรเจกต์ Gemini Free ที่ผู้ใช้ยืนยันและปิด billing อยู่
- `ANALYSIS_API_TOKEN`: ใช้ service token ที่ตรงกับ credential ใน n8n

ไม่ใส่ secrets ใน Git, render.yaml, frontend, screenshot หรือข้อความแชต
ไม่ย้าย `.env.local` ทั้งไฟล์ เพราะมีข้อมูลของบริการอื่นที่ Render ไม่จำเป็นต้องใช้

## เกณฑ์ตรวจรับก่อนสลับใช้งาน

1. ยืนยัน workspace/service เป็น Free และตรวจ payment method, โควตา และค่าที่อาจคิดเงิน
   หากมีขั้นตอนบังคับชำระเงินให้หยุด ไม่เพิ่มวิธีชำระเงินเอง
2. ตรวจ route: health พร้อม, ไม่มี token ถูกปฏิเสธ, token ถูกต้องแต่แหล่งวิดีโอไม่อนุญาต
   ถูกปฏิเสธ โดยยังไม่เรียก AI
3. ทดสอบภาพ/เสียงสังเคราะห์และวัด memory/เวลา รวมถึง cold start และพฤติกรรมเมื่องานชนกัน
4. ตรวจว่า execution ก่อนหน้าจบแล้วก่อนส่งแบบประเมินพร้อมไฟล์จริงหนึ่งครั้ง
   ไม่ retry 3082 หรือสร้างงานแทนของผู้ใช้อื่นอัตโนมัติ
5. ยืนยัน n8n จบ, callback พร้อม, PDF/DOCX เปิดได้ และผล AI อิงหลักฐานวิดีโอ
6. หลังผ่านจึงเลิกพึ่ง ngrok/เครื่องผู้ใช้ และบันทึก URL, execution และข้อจำกัดที่วัดได้

## ขอบเขตค่าใช้จ่าย

เป้าหมายคือไม่มีค่าบริการ Render เพิ่มและไม่เปิด billing ของ Gemini
การย้ายนี้ไม่ลบค่าใช้จ่ายหรือข้อจำกัดของ Vercel, R2, Cloud Run ฝั่งอัปโหลด, Supabase และ n8n
หาก Free ไม่รองรับไฟล์จริง ให้รายงานผลและหยุด ไม่อัปเกรดแผนหรือเปลี่ยนไป provider เสียเงินเอง
