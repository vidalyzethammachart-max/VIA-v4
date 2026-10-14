# VIA V4 — Screen inventory and flow map

ตรวจจาก `src/App.tsx` และ page/service implementations วันที่ 2026-09-22

เอกสารนี้เป็นรายการอ้างอิงสำหรับสร้าง Figma จากเว็บปัจจุบัน ไม่ใช่หลักฐานว่าหน้าจอทั้งหมดถูกสร้างใน Figma แล้ว และไม่เปลี่ยน role model หรือพฤติกรรมของแอป

## ขอบเขต

- 16 page components ที่มี route จริง รวม 18 route definitions (2 aliases)
- หน้าจอภาษาไทย ธีมสว่างเป็นชุดหลัก พร้อมระบุสถานะสำคัญและสิทธิ์ข้างหน้าจอ
- ใช้ข้อมูลจำลองสำหรับหน้าที่มีข้อมูลผู้ใช้/เคส เอกสาร และตารางผู้ดูแล
- แต่ละหน้าใน Figma ต้องมีชื่อ, route, หน้าที่, ปุ่มสำคัญ, สิทธิ์, ระบบที่เกี่ยวข้อง และเส้นทางไปหน้าถัดไป
- สีหลัก `#04418b`; พื้น slate-50 / white; ข้อความ slate-900; ใช้โลโก้จริงจาก `src/assets`
- โค้ดไม่ได้กำหนด custom font ใน Tailwind: ตรวจ font ที่ browser render ก่อนเลือก font ใน Figma

## หน้าจอทั้งหมด

| ID | หน้า / component | Route | สิทธิ์ / หน้าที่และ actions | สถานะที่ต้องแสดงหรืออธิบาย |
|---|---|---|---|---|
| 01 | Login | `/` | ผู้ยังไม่ล็อกอิน; email/password, แสดงรหัสผ่าน, เข้าสู่ระบบ, สมัครสมาชิก, ลืมรหัสผ่าน | ว่าง, required fields, invalid login, กำลังส่ง |
| 02 | Register | `/register` | user ID, employee number, email, password/confirm; สมัครผ่าน Supabase Auth | validation, password mismatch, สำเร็จ/รอยืนยัน email, error |
| 03 | ForgotPassword | `/forgot-password` | ขอ email สำหรับ recovery; กลับ login | ส่งสำเร็จแบบไม่เปิดเผยว่ามีบัญชีหรือไม่, cooldown, error |
| 04 | ResetPassword | `/reset-password` | recovery session; ตั้งรหัสผ่านใหม่และยืนยัน | checking, ready, expired, validation, success/error modal |
| 05 | Home | `/home` | ผู้ล็อกอิน; เริ่มประเมิน, dashboard, กลุ่มวิดีโอ | หน้า landing และ profile menu |
| 06 | FormSubmit | `/form-submit` | editor/admin; case metadata, rubric 9 หมวด/45 ข้อ, ข้อเสนอแนะ, data-only/with-video, ยืนยันส่ง | แบบฟอร์มว่าง, ผูก case ผ่าน `?caseId=`, validation, confirm, progress, error/success |
| 07 | Profile | `/profile` | ผู้ล็อกอิน; ดู/แก้ข้อมูลตนเองและ avatar, ออกจากระบบ | read/edit, avatar editor, saving, success/error |
| 08 | Dashboard | `/dashboard` | ผู้ล็อกอิน; สรุป evaluations ที่อ่านได้ตาม RLS; เลือกหมวดและกราฟ bar/donut | loading, empty/error, populated chart |
| 09 | MyFormsDashboard | `/my-forms` | รายการ individual evaluations ของตน; ค้นหา/กรองสถานะ, Preview, PDF/DOCX, ลบผ่าน confirm | queued/processing/ready/failed ตามสถานะเอกสาร, empty, download busy, delete confirm |
| 10 | PreviewPage | `/preview/:docId` | ผู้ล็อกอินและสิทธิ์ข้อมูล; `docId` ใน route คือ evaluation ID; เปิดเอกสาร individual | loading/processing, PDF ready, error, download |
| 11 | VideoCasesPage | `/video-cases` | ผู้ล็อกอิน; สร้าง/เข้าร่วมด้วยรหัสและชื่อเคส, เลือกเคส, เปิดรายละเอียด/เริ่มประเมิน | empty, validation, selected case; controls ตาม global/case role |
| 12 | VideoCaseDetailPage | `/video-cases/:videoCaseId` | อ่าน evaluations และ aggregate history ของเคส; leader/admin เลือก sources, รวม, ลบ aggregate | member read-only, leader/admin management, combine confirm/progress, delete confirm |
| 13 | VideoCaseSummaryPage | `/video-cases/:videoCaseId/summaries/:summaryId` | ดูผลรวม rubric/AI และแหล่งข้อมูล; เพิ่มข้อเสนอแนะและส่งสร้างเอกสารตาม guard ของหน้า | loading/not found, summary ready, sending/error, document ready |
| 14 | VideoCaseSummaryDocumentPreviewPage | `/video-cases/:videoCaseId/summaries/:summaryId/preview` | Preview เอกสาร aggregate และดาวน์โหลด PDF/DOCX | processing, ready, failed/not found |
| 15 | AdminDashboard | `/admin` | admin; สถิติผู้ใช้/คำขอ, ค้นหาและกรอง role, เปลี่ยน role, ลบผู้ใช้ผ่าน confirm | loading, populated, busy, success/error, delete confirm |
| 16 | RoleRequestsPage | `/role-requests` | user ขอ editor/ดูและยกเลิกคำขอ; admin ตรวจและอนุมัติ/ปฏิเสธ | pending/approved/rejected, submit busy, cancel confirm, user/admin views |

### Aliases และไฟล์ที่ไม่อยู่ใน router

- `/admin-dashboard` redirect ไป `/admin` (ไม่สร้างเป็นหน้าที่ 17)
- `/video-cases/:videoCaseId/aggregates/:aggregateId` ใช้ `VideoCaseSummaryPage` เดียวกับ summary route
- `VideoCaseAggregateReviewPage.tsx` มีใน repository แต่ไม่มี route ใน `App.tsx`; ไม่แสดงเป็นหน้าที่เข้าถึงได้จริง
- `/` เมื่อมี session แล้ว redirect ไป `/home`; การ submit login ใหม่เลือก `/admin`, `/form-submit`, `/dashboard` ตาม role ใน `Login.tsx`
- ProtectedRoute ที่สิทธิ์ไม่พอ redirect ตาม role; การเห็นปุ่มบน Home ไม่ได้ข้าม route guard

## Map ของผู้ใช้

1. Login → Register หรือ ForgotPassword → recovery email → ResetPassword → Login
2. Login สำเร็จ → admin: Admin / editor: FormSubmit / user: Dashboard
3. เมนูบัญชี → Home, Profile, RoleRequests, Dashboard, MyForms, VideoCases; FormSubmit เฉพาะ editor/admin; Admin เฉพาะ admin
4. Home → FormSubmit → ยืนยัน → บันทึก evaluation → MyForms → Individual Preview → PDF/DOCX
5. VideoCases → สร้าง/เข้าร่วม → Case Detail → FormSubmit ที่ผูก case → individual evaluation ใหม่
6. Case Detail → leader/admin เลือก evaluations → ยืนยันรวม → Aggregate Summary → ส่งสร้างเอกสาร → Aggregate Preview → PDF/DOCX
7. Member → Case Detail → aggregate history/summary; ไม่มีสิทธิ์สร้างหรือลบ aggregate
8. RoleRequests → user ขอ editor → admin review → สิทธิ์ editor เมื่ออนุมัติ

การทดสอบ acceptance ใช้ 2 evaluations คะแนน 1 และ 5 ซึ่งได้ค่าเฉลี่ย 3.00; UI ปัจจุบันตรวจว่ามี source อย่างน้อย 1 รายการก่อน combine จึงไม่ควรเขียนใน Figma ว่าโค้ดบังคับขั้นต่ำ 2

## Map ของข้อมูลและ backend

| Flow | Input / service | ผลลัพธ์และข้อจำกัด |
|---|---|---|
| Auth | Supabase Auth + `user_information` | session และ global role: user/editor/admin |
| Case membership | `videoCaseService` + RPC + RLS | shared video case; case role member/leader แยกจาก global role |
| Individual | FormSubmit → evaluations → forward-to-n8n | payload มี evaluation_id; เอกสารกลับเข้า evaluation เดิม |
| Aggregate | selected evaluations → combine API/Gemini → aggregate + source links | ค่าเฉลี่ยและ AI summary แยก record; ไม่เขียนทับ source evaluations |
| Aggregate document | Summary → forward-to-n8n → n8n | payload มี aggregate_id และไม่มี evaluation_id |
| Callback | document-generation-callback | แยก target individual/aggregate; อัปเดต document status และ artifact metadata |
| Artifact | document-artifact-url / Supabase Storage | authorized PDF/DOCX; ไม่ใส่ signed URLs หรือ secrets ใน Figma |
| User administration | admin-user-management + RLS | admin-only actions; global role ไม่ใช้แทน case leader |

## สถานะส่งมอบ Figma

- [x] ตรวจ route inventory จากโค้ด (16 screens / 18 definitions)
- [x] ระบุ aliases, guards, navigation และ backend flows
- [x] ยืนยันบัญชี/ทีมปลายทาง: ผู้ใช้เลือก Phirapon ผ่านตัวเชื่อมต่อ
- [x] สร้างไฟล์: https://www.figma.com/design/6CTrBXEZcELw7fuEQiSZx4
- [x] นำเข้า 16 หน้าจริงจาก React components พร้อมข้อมูลจำลอง และตรวจข้อความ/ขนาดของ 14 หน้าแรกผ่าน API
- [x] เพิ่มอีก 2 มุมมอง: Case Detail ของ member (`29:2`) และ Role Requests ของ admin (`30:2`)
- [x] จัดเรียงและใส่คำอธิบาย route / หน้าที่ / actions / roles ข้าง 16 หน้าหลัก
- [x] บันทึก node IDs และสถานะใน [figma-state.json](figma-state.json)
- [x] สร้าง flow map: https://www.figma.com/board/dkCXhGLsIC06vcHUgcz2wB
- [ ] สารบัญคลิกไปแต่ละหน้าจอ และลิงก์จาก map กลับหน้าจอ
- [ ] ตั้งชื่อและจัดตำแหน่ง 2 มุมมองล่าสุด พร้อมอัปเดตข้อความสถานะบน cover
- [ ] ตรวจภาพครบทุกหน้าและภาพ diagram (ตรวจภาพ Login, Home, Case Detail, Admin แล้ว)

### ข้อจำกัด ณ checkpoint

Figma MCP แจ้ง `You've reached the Figma MCP tool call limit on the Starter plan` ระหว่างสร้างสารบัญ จึงหยุดการเขียน Figma เพิ่มเติม ไม่ได้สมัคร/อัปเกรดแผน และไม่อ้างว่างาน QA เสร็จทั้งหมด

- มี 16 หน้าหลัก + 2 มุมมองสิทธิ์ + Home dark reference เดิม แยกจาก cover
- เป็น editable frames/text จาก HTML capture ไม่ใช่ reusable component library หรือ prototype ที่กดปุ่มได้ครบ
- Preview individual/aggregate แสดง **pending**; Reset Password แสดง **expired link**; สถานะ ready/download อธิบายในหมายเหตุ แต่ยังไม่ได้สร้างภาพ ready state ในชุดนี้
- ขนาดภาพเป็น viewport จริงขณะ capture: 958 หรือ 1920 px; ไม่ใช่ชุด responsive breakpoints ครบทุกขนาด
- Capture แปลง system font เป็น font ที่ Figma ใช้ได้; เปลี่ยน Consolas ที่ไม่พร้อมใช้งาน 2 จุดเป็น Roboto Mono (`13:1659`, `23:1835`) ไม่อ้าง pixel-perfect typography
- ข้อมูลตัวอย่างใช้ `example.invalid`, IDs จำลอง และคะแนน 1/5 เฉลี่ย 3 ไม่มี credentials หรือ signed artifact URLs
- รายงาน acceptance ปิด n8n identity propagation ด้วย **คำยืนยันของผู้ใช้**; งาน Figma ไม่ใช่ production E2E รอบใหม่

### เครื่องมือ render สำหรับทำต่อ

รัน `npm.cmd run dev -- --config .figma-capture/vite.config.mjs` แล้วเปิด `http://localhost:5174/`

Config แยกนี้ใช้ page components เดิม แต่แทน Supabase ด้วยข้อมูลจำลองแบบ read-only ไม่อ่าน `.env` และบล็อก application API ภายนอก ไม่ใช้ config นี้สำหรับทดสอบ acceptance หรือ deploy
สคริปต์ Figma capture ถูกจำกัดให้อยู่ใน config นี้; `index.html` ของแอปคืนเป็นต้นฉบับแล้ว
Capture IDs เดิมหมดอายุได้ ให้สร้างใหม่แล้วเปิด URL ทันที ห้ามนำ ID ที่ใช้สำเร็จแล้วกลับมาใช้ซ้ำ

อ้างอิง acceptance: [production-e2e-acceptance-2026-09-20.md](production-e2e-acceptance-2026-09-20.md)

### Resume — linked navigation verified
Connected as Vidalyze. Added index frames 43:2, 43:11, 43:36 in the existing file, 18 screen links plus FigJam link, and navigation beside all 16 main screens. API verification: 66 hyperlinks, zero missing node targets. Two index screenshots reviewed. Role views 29:2 and 30:2 renamed and positioned; cover status updated. FigJam return links, remaining visual QA and ready-state captures are still pending. No production or application changes.

### Prototype checkpoint — main flows
Wired captured Login/Home buttons and individual/aggregate main flows. Start node 7:2. Individual: 13:1670 → 49:2 confirmation → 17:2 processing → after 2 seconds 47:2 simulated ready. Aggregate: 21:112 → 49:190 confirmation → 23:2 summary → 22:2 processing → after 2 seconds 49:101 simulated ready. Both mock download buttons lead to 49:290 feedback (no actual file); Back returns to Preview, Home returns to 12:2.
Verified 11 key reactions and flow starting point by API readback; visually reviewed individual confirmation/ready. Browser playback is not tested. Ready body text visibly overflows its container; quota rejected the attempted fix. Mock actions retain red captured delete-button styling. Other forms, score input, error states and many secondary buttons are not interactive yet. Do not call the full prototype complete.
