# แผนย้ายการวิเคราะห์วิดีโอไป Render Free

วันที่ตรวจข้อมูล: 28 ตุลาคม 2026 (Asia/Bangkok)

สถานะ: ผู้ใช้เลือก Render Free แล้ว เอกสารนี้อธิบายการย้ายและเกณฑ์ทดสอบ
ยังไม่ได้สร้าง service, deploy หรือเปลี่ยน URL ใน n8n

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
