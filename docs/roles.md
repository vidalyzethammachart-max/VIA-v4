# Role และสิทธิ์การใช้งาน

สถานะ ณ 2026-11-17 (หลัง commit `a5c443c`) สรุปจากโค้ดและ migration ใน repo และผลทดสอบกับ production

## โครงสร้าง

มี 4 role เรียงลำดับ `user < editor < admin < super_admin` role ที่สูงกว่ามีสิทธิ์ครอบคลุม role ที่ต่ำกว่า

- ฝั่งเว็บ: `src/lib/roles.ts` (`ROLES`, `roleAtLeast`, `normalizeRole`) ค่าที่ไม่รู้จักถือเป็น `user`
- ฝั่ง DB: `public.role_at_least()` และ `public.is_super_admin()`
- ฝั่ง edge function: `supabase/functions/_shared/roleAccess.js` (`isAdminRole` นับ admin และ super_admin)
- การซ่อนปุ่มใน UI เป็นเรื่อง UX การบังคับสิทธิ์จริงอยู่ที่ RLS, RPC แบบ `SECURITY DEFINER` และ edge function

## ตารางสิทธิ์

| ความสามารถ | user | editor | admin | super_admin |
|---|---|---|---|---|
| ส่งฟอร์มประเมิน (`/form-submit`) | ไม่ได้ | ได้ | ได้ | ได้ |
| ขอเลื่อนเป็น editor (`/role-requests`) | ได้ | – | – | – |
| ดูแบบประเมินของคนอื่น (`/preview/:id`) | ได้ | ได้ | ได้ | ได้ |
| ดาวน์โหลด PDF | ได้ | ได้ | ได้ | ได้ |
| ดาวน์โหลด DOCX | ไม่ได้ | ไม่ได้ | ได้ | ได้ |
| สร้าง group (รวมผลประเมิน) | เฉพาะ leader ของ case ต้นทาง | เฉพาะ leader ของ case ต้นทาง | ทุก case | ทุก case |
| เห็นรายการ group | เฉพาะที่เป็นสมาชิก case ต้นทางหรือเป็นผู้ขอ | ทุกกลุ่ม | ทุกกลุ่ม | ทุกกลุ่ม |
| ลบ group | เฉพาะที่ตัวเองเป็นผู้ขอ | เฉพาะที่ตัวเองเป็นผู้ขอ | ทุกกลุ่ม | ทุกกลุ่ม |
| ปุ่มลบในหน้า preview ของแบบประเมินคนอื่น | ไม่มี | ไม่มี | มี | มี |
| อนุมัติคำขอ role, จัดการ user | ไม่ได้ | ไม่ได้ | ได้ | ได้ |
| `/admin`, `/admin/stuck-jobs` | ไม่ได้ | ไม่ได้ | ได้ | ได้ |
| `/super-admin/errors` (error log) | ไม่ได้ | ไม่ได้ | ไม่ได้ | ได้ |

เงื่อนไขการลบ group: เอกสารต้องไม่อยู่ในสถานะ `pending` (policy `video_group_evaluations_delete_owner_or_admin`)

หลังล็อกอิน: admin ขึ้นไปไป `/home`, editor ไป `/form-submit`, user ไป `/dashboard`

## กฎของ super_admin

- มีได้บัญชีเดียว (unique partial index ใน `user_information`)
- ตั้งหรือถอดได้ทางเดียวคือรัน SQL ใน SQL Editor trigger `guard_super_admin_role` ปฏิเสธทางอื่นทั้งหมด รวมถึง service-role key
- ไม่มีตัวเลือก `super_admin` ใน dropdown เลือก role (`ASSIGNABLE_ROLES` มีแค่ user, editor, admin)
- admin แก้ไขหรือลบ super_admin ไม่ได้ และแก้ role ของบัญชีตัวเองไม่ได้ (edge function `admin-user-management`)
- ขอ `super_admin` ผ่านระบบคำขอไม่ได้ และอนุมัติคำขอที่ชี้มาที่บัญชี super_admin ไม่ได้ (`review_role_request`)

## กระบวนการขอและอนุมัติ role

1. user กดขอเป็น editor ที่ `/role-requests` (เพิ่มแถวใน `role_requests` สถานะ `pending`) ขอได้ครั้งละ 1 คำขอ
2. user ยกเลิกคำขอที่ยัง `pending` ของตัวเองได้ (สถานะ `cancelled`)
3. admin ขึ้นไปเห็นคำขอทั้งหมดและกดอนุมัติหรือปฏิเสธผ่าน RPC `review_role_request`
4. ถ้าอนุมัติ ระบบตั้ง `user_information.role` ในธุรกรรมเดียวกัน แล้วบันทึก activity log (`REQUEST_ROLE`, `APPROVE_ROLE`, `REJECT_ROLE`, `CANCEL_ROLE_REQUEST`)

สถานะ `approved`, `rejected`, `cancelled` เปลี่ยนต่อไม่ได้ นอกจากคำขอ admin เปลี่ยน role ได้ที่ `/admin` โดยตรง (เป็น user, editor หรือ admin)

ข้อสังเกต: RLS ตอน insert คำขอไม่จำกัดค่า `requested_role` (กันเฉพาะ `super_admin`) UI มีปุ่มขอ editor อย่างเดียว แต่การเรียก API ตรงขอ `admin` ได้ ต้องอาศัย admin ตรวจก่อนอนุมัติ

## DOCX เฉพาะ admin ขึ้นไป (บังคับ 3 ชั้น)

1. **Edge function** `document-artifact-url`: ไม่ออกลิงก์ DOCX ให้ non-admin (ครอบคลุมเอกสารประเมิน, group และสรุปผลของ case)
2. **Storage policy** `evaluation_documents_read_authenticated` บน bucket `evaluation-documents`: อ่านวัตถุที่เป็น DOCX ได้เฉพาะ admin ขึ้นไป ฟังก์ชัน `is_docx_artifact_path()` ตรวจทั้งนามสกุล `.docx` และ path ที่บันทึกใน `evaluations`, `video_case_aggregates`, `video_group_evaluations` (migration `20261117100000_docx_admin_only.sql`) หน้า `/preview` และ `/my-forms` ขอลิงก์จาก Storage ตรง จึงต้องมีชั้นนี้
3. **UI**: ซ่อนปุ่ม DOCX จาก non-admin และป้ายลิงก์บน dashboard เป็น "PDF"

## การสร้าง group

- RPC `create_video_group_evaluation`: admin ขึ้นไปสร้างได้ทุก case ส่วนคนอื่นต้องเห็นทุก case ต้นทางและเป็น leader ของอย่างน้อยหนึ่ง case (migration `20261117090000_video_group_no_editor_create.sql`)
- `list_group_source_cases()`: ให้แค่ case ที่ผู้เรียกเข้าถึงได้ (`can_view_video_case`) admin เห็นทุก case
- `can_view_video_group`: editor ขึ้นไปเห็นทุก group (ตั้งใจให้ editor ยังอ่านได้)
- UI: `VideoGroupsPage` แสดงปุ่มสร้างเมื่อเป็น admin หรือ leader, `VideoCaseDetailPage` แสดงปุ่ม combine เมื่อเป็น leader หรือ admin, `VideoGroupCreatePage` ส่ง non-admin ที่ไม่ได้เป็น leader กลับ `/video-groups`

## ข้อควรรู้เรื่องการอ่านข้อมูล

- ตาราง `evaluations` อ่านได้ทุกคนที่ล็อกอิน (policy `evaluations_select_dashboard_authenticated` ใช้ `USING (true)` ตั้งใจให้ dashboard แสดงทุกคน) role จึงไม่จำกัดการอ่านข้อมูลประเมิน
- PDF ใน bucket `evaluation-documents` อ่านได้ทุกคนที่ล็อกอิน
- ตารางที่เปิด RLS แต่ไม่มี policy (`ai_queue_control`, `evaluation_stuck_reports`, `document_dispatches`, `evaluation_execution_failures`) เข้าได้เฉพาะ service-role หรือ RPC

## การทดสอบ

- เทสต์อัตโนมัติ: `tests/roles.test.js`, `tests/roleAccess.test.js`, `tests/videoGroupEditorCreate.test.js`, `tests/docxAdminOnly.test.js`, `tests/documentArtifactUrl.test.js`, `tests/roleUiGuards.test.js` (ส่วนใหญ่ตรวจจากข้อความในซอร์สและ mock ไม่ได้รัน DB จริง) รันด้วย Node 24
- เดินหน้าจอในเบราว์เซอร์ครบ 4 role และดาวน์โหลด DOCX จริงด้วย admin ได้ไฟล์ครบขนาด
- จำลองสิทธิ์อ่านไฟล์ใน DB ต่อ role ด้วย `SET LOCAL ROLE authenticated` + `request.jwt.claims` ใน transaction แล้ว rollback: user และ editor ไม่เห็นไฟล์ `.docx`, admin และ super_admin เห็น
- ยังไม่ได้ทดสอบ: user ที่เป็นสมาชิกหรือ leader ของ case ต้นทาง, และการให้ user/editor เรียกลิงก์ DOCX จริงแล้วถูกปฏิเสธ

## การ deploy ฝั่ง Supabase

ไม่มีโปรเจกต์ staging (`my-app-db`, ref `vpajxuomerowvxwfezik` เป็นโปรเจกต์เดียว) และ dev server ต่อกับ production ดังนั้นควรทดสอบก่อนขึ้นเสมอ (จำลองสิทธิ์ใน DB และเดินหน้าจอด้วยบัญชีจริง) แล้วค่อย deploy

```bash
# Migration: ใช้ -f เพราะ SQL ที่ขึ้นต้นด้วย "--" ถูก CLI อ่านเป็น flag
npx -y supabase@2 db query --linked -f supabase/migrations/<file>.sql

# Edge function (ตรวจว่า verify_jwt ยังเป็น true หลัง deploy)
npx -y supabase@2 functions deploy document-artifact-url --project-ref vpajxuomerowvxwfezik --use-api
npx -y supabase@2 functions list --project-ref vpajxuomerowvxwfezik -o json
```

ย้อนกลับ: รัน `20261114090000_video_group_editor_create.sql` ซ้ำเพื่อคืนสิทธิ์ editor สร้าง group และสร้าง policy ของ bucket ตาม `20260514001000_evaluation_documents_read_policy.sql` เพื่อคืนการอ่านไฟล์ทั้งหมด
