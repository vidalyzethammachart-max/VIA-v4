# VIA V4 — Use Cases

ระบบ **VIA (Video Intelligence & Analytics)** ใช้ส่งแบบประเมินวิดีโอ (rubric 9 หมวด / 45 ข้อ) ให้ AI วิเคราะห์ และสร้างเอกสาร PDF/DOCX

เอกสารนี้เขียนจาก `src/App.tsx`, `README.md`, `docs/figma-screen-map.md`, `docs/direct-document-dispatch.md` และ `docs/roles.md` (ปรับล่าสุด 2026-11-20)

## Actors

| Actor | คำอธิบาย |
|---|---|
| ผู้เยี่ยมชม | ยังไม่ล็อกอิน |
| User | global role `user`: ดู dashboard, My Forms, พรีวิวและดาวน์โหลด PDF แต่ส่งแบบประเมินไม่ได้ |
| Editor | global role `editor`: ทำได้เท่า User และส่งแบบประเมินได้ (`/form-submit`) |
| Admin | global role `admin`: ทำได้เท่า Editor และจัดการผู้ใช้ อนุมัติคำขอ ดูงานที่ค้าง และดาวน์โหลด DOCX |
| Super Admin | global role `super_admin` (มีได้บัญชีเดียว): ทำได้เท่า Admin และดู error log (`/super-admin/errors`) ดูรายละเอียดใน `docs/roles.md` |
| Case Leader | case role `leader` ในเคสหนึ่ง สร้างแบบประเมินกลุ่มจากเคสนั้นได้ (Admin ทำได้ทุกเคส) ตอนนี้ UI ส่งแบบประเมินกำหนดบทบาทเป็น `member` เสมอ ไม่พบทางตั้ง leader จากฝั่ง UI |
| Case Member | case role `member`: ถูกเพิ่มอัตโนมัติเมื่อส่งแบบประเมินในเคสนั้น |
| Supabase | Auth, Postgres (RLS), Storage, Edge Functions |
| Cloudflare R2 | เก็บวิดีโอที่อัปโหลด |
| n8n | รับงาน ประมวลผลวิดีโอ/AI สร้างเอกสาร แล้ว callback |
| Gemini | วิเคราะห์ AI และสรุปผลรวมของเคส |

> role ของ Leader/Member (ระดับเคส) แยกจาก global role และไม่ใช้แทนกัน

## Use Case Diagram

```mermaid
flowchart LR
  V([ผู้เยี่ยมชม])
  U([User])
  E([Editor])
  L([Case Leader])
  A([Admin])
  S([ระบบ n8n / Gemini / R2])

  subgraph AUTH[บัญชี]
    UC01(UC-01 สมัครสมาชิก)
    UC02(UC-02 เข้าสู่ระบบ)
    UC03(UC-03 ลืม/รีเซ็ตรหัสผ่าน)
    UC04(UC-04 จัดการโปรไฟล์)
    UC05(UC-05 ขอสิทธิ์ Editor)
    UC22(UC-22 บังคับสิทธิ์ / session)
  end
  subgraph EVAL[การประเมิน]
    UC07(UC-07 กรอกและส่งแบบประเมิน)
    UC08(UC-08 อัปโหลดวิดีโอ)
    UC09(UC-09 วิเคราะห์ AI + สร้างเอกสาร)
  end
  subgraph MINE[ผลงานของฉัน]
    UC10(UC-10 ดูสถานะ My Forms)
    UC11(UC-11 พรีวิว/ดาวน์โหลด)
    UC12(UC-12 ลบฟอร์ม)
    UC13(UC-13 Dashboard)
  end
  subgraph CASE[Video Case]
    UC14(UC-14 สร้าง/เข้าเคสอัตโนมัติ)
    UC16(UC-16 ดูรายละเอียดเคส)
    UC17(UC-17 รวมผลประเมินแบบเดิม)
    UC18(UC-18 สร้างเอกสารสรุปเคส)
    UC19(UC-19 ลบผลรวม)
    UC23(UC-23 สร้างแบบประเมินกลุ่ม)
  end
  subgraph ADM[ผู้ดูแล]
    UC06(UC-06 อนุมัติคำขอ)
    UC20(UC-20 จัดการผู้ใช้)
    UC21(UC-21 ตรวจงานที่ค้าง)
  end

  V --> UC01 & UC02 & UC03
  U --> UC04 & UC05 & UC10 & UC11 & UC12 & UC13 & UC16
  E --> UC07 & UC08
  L --> UC17 & UC18 & UC19 & UC23
  A --> UC06 & UC20 & UC21
  UC07 -. include .-> UC14
  UC07 -. include .-> UC08
  UC07 -. include .-> UC09
  UC18 -. include .-> UC09
  S --- UC09
  S --- UC08
```

(Editor และ Admin ได้รับ use case ของ User ด้วย และ Admin ได้รับของ Editor และ Leader ด้วย แต่ไม่ได้วาดซ้ำเพื่อให้ diagram อ่านง่าย)

---

## กลุ่มบัญชี

### UC-01 สมัครสมาชิก
- **Actor**: ผู้เยี่ยมชม
- **Precondition**: ยังไม่มีบัญชี
- **Main flow**
  1. เปิดหน้า `/register`
  2. กรอก user ID, เลขพนักงาน, email, password และยืนยัน password
  3. กดสมัคร ระบบสร้างบัญชีผ่าน Supabase Auth
  4. ระบบแจ้งผลสำเร็จ (อาจรอยืนยัน email)
- **Alternate / Exception**
  - ข้อมูลไม่ครบหรือรูปแบบผิด: แสดง validation ไม่ส่งคำขอ
  - password ไม่ตรงกัน: แจ้ง error
  - email ซ้ำหรือ Auth ปฏิเสธ: แสดงข้อความผิดพลาด
- **Postcondition**: มีบัญชีใหม่ role เริ่มต้นเป็น `user`

### UC-02 เข้าสู่ระบบ
- **Actor**: ผู้เยี่ยมชม
- **Precondition**: มีบัญชีแล้ว
- **Main flow**
  1. เปิด `/` กรอก email และ password
  2. ระบบตรวจสอบผ่าน Supabase Auth
  3. ระบบนำทุก role ไป `/home` (`getDefaultRouteForRole` ใน `src/App.tsx`)
- **Alternate / Exception**
  - ข้อมูลผิด: แจ้ง invalid login
  - มี session อยู่แล้วและเปิด `/`: redirect ไป `/home`
  - เปิดหน้าที่ไม่มีสิทธิ์ภายหลัง: admin ขึ้นไปไป `/home`, editor ไป `/form-submit`, user ไป `/dashboard` (ดู UC-22)
- **Postcondition**: มี session ที่ใช้งานได้

### UC-03 ลืมและรีเซ็ตรหัสผ่าน
- **Actor**: ผู้เยี่ยมชม
- **Main flow**
  1. เปิด `/forgot-password` กรอก email
  2. ระบบส่งลิงก์ recovery โดยไม่เปิดเผยว่ามีบัญชีหรือไม่
  3. ผู้ใช้เปิดลิงก์ไป `/reset-password`
  4. ตั้งรหัสผ่านใหม่และยืนยัน
  5. กลับไปเข้าสู่ระบบด้วยรหัสใหม่
- **Alternate / Exception**: กดขอซ้ำเร็วเกินไป (cooldown), ลิงก์หมดอายุ, password ไม่ตรงกัน
- **Postcondition**: รหัสผ่านถูกเปลี่ยน

### UC-04 จัดการโปรไฟล์
- **Actor**: ผู้ใช้ที่ล็อกอิน (ทุก role)
- **Main flow**
  1. เปิด `/profile` ดูข้อมูล
  2. แก้ชื่อ-นามสกุล เลขพนักงาน เพศ และอัปโหลด/ตัด avatar
  3. บันทึก
  4. หรือกดออกจากระบบ
- **Alternate / Exception**: บันทึกไม่สำเร็จ แสดง error
- **Postcondition**: ข้อมูลโปรไฟล์ใน `user_information` ถูกอัปเดต

## กลุ่มสิทธิ์

### UC-05 ขอสิทธิ์ Editor
- **Actor**: User
- **Main flow**
  1. เปิด `/role-requests` ส่งคำขอสิทธิ์ editor
  2. ดูสถานะ pending / approved / rejected
  3. ยกเลิกคำขอที่ยังรอได้ (ผ่านหน้าต่างยืนยัน)
- **Alternate / Exception**: ผู้ใช้มีคำขอ pending ได้ครั้งละ 1 รายการ (unique index) ส่งซ้ำจะ error
- **Postcondition**: มีคำขอรอ Admin ตรวจ
- **หมายเหตุด้านความปลอดภัย**: ฝั่ง client และ RLS ไม่จำกัดค่า `requested_role` ผู้ใช้จึงยื่นขอ `admin` ได้ แต่ไม่ได้สิทธิ์เอง เพราะการอนุมัติต้องเป็น Admin และ trigger `guard_user_role_changes` ห้ามผู้ที่ไม่ใช่ admin/service_role เปลี่ยน role

### UC-06 ตรวจและอนุมัติคำขอสิทธิ์
- **Actor**: Admin
- **Main flow**
  1. เปิด `/role-requests` ดูรายการคำขอ
  2. อนุมัติหรือปฏิเสธ
- **Postcondition**: ถ้าอนุมัติ ผู้ขอได้สิทธิ์ editor

## กลุ่มการประเมิน

### UC-07 กรอกและส่งแบบประเมิน
- **Actor**: Editor, Admin
- **Precondition**: ล็อกอินและมีสิทธิ์ editor ขึ้นไป (route guard `requiredRole="editor"`)
- **Main flow**
  1. เปิด `/form-submit` (อาจผูกเคสผ่าน `?caseId=`)
  2. กรอกข้อมูลเคส ให้คะแนน rubric 9 หมวด 45 ข้อ และข้อเสนอแนะ
  3. เลือกโหมด data-only หรือ with-video
  4. ถ้ามีวิดีโอ ระบบทำ UC-08
  5. กดยืนยันส่ง ระบบบันทึก evaluation
  6. ระบบส่งงานให้ n8n ผ่าน Edge Function `forward-to-n8n` (UC-09)
  7. แสดงความคืบหน้าและผลสำเร็จ
- **Alternate / Exception**
  - กรอกไม่ครบ: validation
  - สิทธิ์ไม่พอ: redirect ตาม role
  - งานนี้ถูกส่งไปแล้ว: guard กันส่งซ้ำ ไม่เริ่มงานเดิมซ้ำ
  - n8n ตอบช้าหรือผลไม่ชัดเจน: สถานะ `unknown` และต้องตรวจ n8n ก่อน ไม่มี retry อัตโนมัติ
- **Postcondition**: มี evaluation ใหม่ สถานะรอประมวลผล

### UC-08 อัปโหลดวิดีโอขึ้น R2
- **Actor**: Editor, Admin (ระบบ R2 ร่วมทำงาน)
- **Main flow**
  1. เบราว์เซอร์เรียก `POST /api/r2-presign-upload` เพื่อขอ signed URL
  2. เบราว์เซอร์อัปโหลดวิดีโอตรงไปที่ R2
  3. ข้อมูล download URL ถูกแนบไปกับงานที่ส่งให้ n8n
- **Alternate / Exception**: ตัวแปร R2 ฝั่ง server ไม่ครบ: ขั้นขอ signed URL ล้มเหลวก่อนอัปโหลด
- **Postcondition**: วิดีโออยู่ใน R2 พร้อมให้ n8n ดาวน์โหลด

### UC-09 วิเคราะห์ด้วย AI และสร้างเอกสาร
- **Actor หลัก**: ระบบ (n8n, Gemini, Supabase)
- **Trigger**: UC-07 หรือ UC-18 ส่งงานผ่าน `forward-to-n8n`
- **Main flow**
  1. Edge Function ตรวจสิทธิ์ เปิด guard ต่อเอกสาร แล้วส่งงานให้ n8n
  2. n8n ตอบรับทันที (HTTP 202) และประมวลผลต่อแบบ asynchronous
  3. n8n ดาวน์โหลดวิดีโอจาก R2 วิเคราะห์ด้วย AI และสร้าง PDF/DOCX
  4. n8n เรียก callback (`/api/n8n-analysis-result` และ `document-generation-callback`) พร้อม secret
  5. ระบบเก็บผล AI (`analysis_ai_output`) และเส้นทางไฟล์ แล้วเปลี่ยนสถานะเป็น ready
- **Alternate / Exception**: ปฏิเสธการส่งหรือประมวลผลล้มเหลว สถานะเป็น `rejected`/`failed`; ผลที่ callback ถึงแล้วมีผลเหนือ error/timeout ที่มาทีหลัง
- **Postcondition**: เอกสารพร้อมดาวน์โหลด หรือระบุสถานะล้มเหลว
- **หมายเหตุ**: ผู้ใช้ปิดเว็บได้หลังระบบตอบรับ

## กลุ่มผลงานของฉัน

### UC-10 ดูสถานะฟอร์มของฉัน
- **Actor**: ผู้ใช้ที่ล็อกอิน
- **Main flow**: เปิด `/my-forms` ค้นหา/กรองตามสถานะ (queued / processing / ready / failed)
- **Alternate**: ไม่มีรายการ แสดง empty state
- **Postcondition**: ไม่เปลี่ยนข้อมูล

### UC-11 พรีวิวและดาวน์โหลดเอกสาร
- **Actor**: ผู้ใช้ที่ล็อกอินและมีสิทธิ์เห็นข้อมูลนั้น
- **Main flow**
  1. เลือกรายการที่ ready เปิด `/preview/:docId` (docId คือ evaluation ID)
  2. ดู PDF และกดดาวน์โหลด PDF (DOCX ดาวน์โหลดได้เฉพาะ admin ขึ้นไป)
  3. ระบบขอ URL ที่ได้รับอนุญาตผ่าน `document-artifact-url`
- **Alternate / Exception**: เอกสารยังประมวลผลอยู่ แสดงสถานะรอ; ไม่พบหรือไม่มีสิทธิ์ แสดง error
- **Postcondition**: ผู้ใช้ได้ไฟล์

### UC-12 ลบฟอร์ม
- **Actor**: เจ้าของฟอร์ม
- **Main flow**: กดลบใน `/my-forms` ยืนยันในหน้าต่างยืนยัน ระบบลบรายการ
- **Alternate**: กดยกเลิก ไม่มีการเปลี่ยนแปลง
- **Postcondition**: รายการหายจากรายการของผู้ใช้

### UC-13 ดู Dashboard สรุป
- **Actor**: ผู้ใช้ที่ล็อกอิน
- **Main flow**: เปิด `/dashboard` เลือกหมวดและชนิดกราฟ (bar / donut) ระบบสรุปจาก evaluations ที่อ่านได้ตาม RLS
- **Alternate**: loading / ไม่มีข้อมูล / error
- **Postcondition**: ไม่เปลี่ยนข้อมูล

## กลุ่ม Video Case

### UC-14 สร้างหรือเข้าเคสอัตโนมัติตอนส่งแบบประเมิน
- **Actor**: Editor, Admin (ทำภายใน UC-07 ไม่มีหน้าจอแยก)
- **Main flow**
  1. ผู้ส่งกรอกเลขลำดับ (`order_number`) และชื่อเรื่อง (`subject_name`) ในฟอร์ม
  2. `FormSubmit` เรียก RPC `resolve_video_case_by_identity` (ผ่าน `resolveVideoCaseMembership`) ด้วยคู่ค่านี้
  3. ถ้ายังไม่มีเคสที่ตรงกัน RPC สร้างเคสใหม่ โดยผู้ส่งเป็น `created_by` ถ้ามีแล้วก็ใช้เคสเดิม
  4. RPC เพิ่มผู้ส่งเป็นสมาชิกเคส (`video_case_members`)
  5. หลังอัปโหลดวิดีโอ `FormSubmit` เรียก RPC ซ้ำเพื่อแนบวิดีโอต้นทาง (เฉพาะผู้สร้างเคสหรือ admin ที่แนบได้)
- **Alternate / Exception**
  - คู่ค่ากับเคสที่เลือกไม่ตรงกัน (ชนกันแบบ A-B + C กับ A + B-C): ระบบปฏิเสธ (`Case identity does not match`)
  - ขอเป็น leader ของเคสที่มี leader อยู่แล้ว: ปฏิเสธ (`Video case already has a leader`) แต่ UI ปัจจุบันส่ง `member` เสมอ จึงไม่เกิดจากฟอร์มนี้
- **Postcondition**: มีเคสและผู้ส่งเป็นสมาชิก บทบาท `member`
- **หมายเหตุ**: เคยมีหน้า `/video-cases` สำหรับสร้างและเข้าร่วมเคสด้วยรหัส ปัจจุบันไม่มี route นี้ใน `src/App.tsx` และไม่พบโค้ด UI ที่ตั้ง leader (ข้อความ i18n "ฉันเป็นหัวหน้าเคสนี้" ใน `FormSubmit.tsx` ถูกประกาศไว้แต่ไม่พบที่เรียกใช้) ยังไม่ได้ตรวจว่ามี leader ในฐานข้อมูลจริงหรือตั้งด้วยวิธีอื่น

### UC-15 เข้าร่วมเคส (ยกเลิก)
- ไม่มีขั้นตอนเข้าร่วมด้วยรหัสแล้ว การเป็นสมาชิกเกิดใน UC-14 เมื่อส่งแบบประเมินในเคสนั้น

### UC-16 ดูรายละเอียดเคสและประวัติผลรวม
- **Actor**: สมาชิกเคส (Member/Leader), Admin
- **Main flow**
  1. เปิด `/video-cases/:videoCaseId` จากลิงก์ชื่อรายการบน `/dashboard` (ไม่มีหน้ารายการเคสแยก)
  2. ดูรายการ evaluations และประวัติผลรวม (aggregate)
  3. เปิดผลรวมเพื่อดู rubric เฉลี่ยและสรุป AI
  4. เริ่มประเมินใหม่ในเคสนี้ (ไป UC-07 ถ้ามีสิทธิ์ editor)
- **Alternate**: Member เห็นแบบอ่านอย่างเดียว ไม่มีปุ่มจัดการ
- **Postcondition**: ไม่เปลี่ยนข้อมูล

> UC-17 ถึง UC-19 เป็นผลรวมแบบเดิมใน `video_case_aggregates` ตามสเปก `docs/superpowers/specs/2026-11-12-video-group-evaluations-design.md` การสร้างผลรวมใหม่ย้ายไปเป็นแบบประเมินกลุ่ม (UC-23) และปิดของเดิม ข้อมูลเก่ายังอ่านและเปิดเอกสารได้ (route ยังอยู่ใน `App.tsx`) ผมยังไม่ได้ตรวจว่าปุ่มสร้างของเดิมถูกซ่อนในหน้า UI หรือไม่

### UC-17 รวมผลประเมินของเคส (แบบเดิม)
- **Actor**: Case Leader, Admin (Gemini ร่วมทำงาน)
- **Precondition**: เคสมี evaluations อย่างน้อย 1 รายการ
- **Main flow**
  1. เลือก evaluations ที่เป็นแหล่งข้อมูล
  2. กดรวมและยืนยัน
  3. ระบบคำนวณค่าเฉลี่ยและให้ Gemini สรุป
  4. บันทึกเป็น aggregate พร้อมลิงก์ไปยัง source
- **Alternate / Exception**: ไม่เลือก source ปุ่มรวมใช้ไม่ได้; AI ล้มเหลว แสดง error
- **Postcondition**: มีผลรวมใหม่ ไม่เขียนทับ evaluations ต้นทาง

### UC-18 สร้างเอกสารสรุปของเคส
- **Actor**: Case Leader, Admin
- **Main flow**
  1. เปิดหน้าผลรวม `/video-cases/:videoCaseId/summaries/:summaryId`
  2. เพิ่มข้อเสนอแนะ แล้วส่งสร้างเอกสาร (ทำ UC-09 ด้วย aggregate_id)
  3. เปิด `/preview` ของผลรวมเพื่อดูและดาวน์โหลด PDF/DOCX
- **Alternate**: กำลังประมวลผล / ล้มเหลว / ไม่พบ
- **Postcondition**: มีเอกสารสรุปของเคส

### UC-19 ลบผลรวม
- **Actor**: Case Leader, Admin
- **Main flow**: กดลบ aggregate ยืนยันในหน้าต่างยืนยัน
- **Alternate**: Member ไม่มีปุ่มนี้
- **Postcondition**: ผลรวมถูกลบ evaluations ต้นทางยังอยู่

### UC-23 สร้างแบบประเมินกลุ่ม (Video Group)
- **Actor**: Admin (ทุก case), Case Leader (เฉพาะ case ที่ตนเป็น leader)
- **Precondition**: มีแบบประเมินสถานะ `ready` อย่างน้อย 2 ใบ ที่ผู้สร้างมองเห็น
- **Main flow**
  1. เปิด `/video-groups` แล้วกดสร้าง (ปุ่มแสดงเมื่อเป็น admin หรือ leader) ไป `/video-groups/new`
  2. เลือกแบบประเมินจากหลายเคสได้ (`list_group_source_cases`)
  3. ตั้ง `orderNumber`, ประเภท (กลุ่ม / รวมรอบ / สรุปปลายปี) และ `subjectName`
  4. ระบบเรียก RPC `create_video_group_evaluation` เฉลี่ย 9 หมวดและร่างข้อเสนอแนะรวมให้แก้ได้
  5. ส่งสร้างเอกสารผ่าน `forward-to-n8n` โดยใช้ id ของกลุ่มเป็น `aggregate_id` (UC-09) แล้วดู/ดาวน์โหลดที่ `/video-groups/:groupId/preview`
- **Alternate / Exception**
  - ชุด orderNumber + ประเภท + subjectName ซ้ำ: ปฏิเสธด้วย unique index
  - ผู้ใช้ที่ไม่ใช่ admin และไม่ได้เป็น leader: ถูกส่งกลับ `/video-groups`
  - ลบกลุ่ม: ผู้ขอสร้างหรือ admin ลบได้ ต้องไม่อยู่ในสถานะ `pending`
- **การมองเห็น**: editor ขึ้นไปเห็นทุกกลุ่ม user เห็นเฉพาะกลุ่มที่เป็นสมาชิกเคสต้นทางหรือเป็นผู้ขอ
- **Postcondition**: มีกลุ่มใหม่และเอกสาร แบบประเมินต้นทางไม่ถูกแก้ ดูรายละเอียดใน `docs/roles.md`

## กลุ่มผู้ดูแล

### UC-20 จัดการผู้ใช้
- **Actor**: Admin
- **Main flow**
  1. เปิด `/admin` ดูสถิติผู้ใช้และคำขอ
  2. ค้นหาและกรองตาม role
  3. เปลี่ยน role หรือลบบัญชี (ยืนยันก่อนลบ)
- **Alternate**: ดำเนินการไม่สำเร็จ แสดง error; Admin จัดการบัญชีตัวเองผ่านหน้านี้ไม่ได้
- **Postcondition**: role หรือบัญชีเปลี่ยนตามที่เลือก (ผ่าน Edge Function `admin-user-management`)
- **การลบบัญชี**: Edge Function ตรวจก่อนว่าผู้ใช้เคยสร้าง video case หรือไม่ (`video_cases.created_by` อ้างอิง `auth.users` แบบ `ON DELETE RESTRICT`) ถ้าเคย จะตอบ 409 และไม่ลบอะไรเลย ผู้ดูแลต้องโอนหรือลบเคสเหล่านั้นก่อน ถ้าไม่เคย จะลบ `activity_logs`, `evaluations`, `role_requests`, `user_information` และ avatar แล้วลบผู้ใช้ใน Auth ส่วน `video_case_members` และ aggregate runs ถูกลบตามด้วย cascade (อ่านจาก migration ยังไม่ได้ทดสอบกับฐานข้อมูลจริง)

### UC-21 ตรวจงานที่ค้าง (Stuck Jobs)
- **Actor**: Admin
- **Main flow**: เปิดหน้า Stuck Jobs (`AdminStuckJobsPage`, `StuckEvaluationsPanel`) ดูรายการที่ค้าง ตรวจสถานะการส่งก่อนตัดสินใจกู้ตามแนวทางใน `docs/direct-document-dispatch.md`
- **หมายเหตุ**: ระบบตั้งใจไม่มี retry อัตโนมัติหรือ public retry endpoint; เคสที่ส่งซ้ำจะแสดงรายการเดียว และสำเนาที่ค้างจากการส่งซ้ำถูกซ่อน
- **Postcondition**: Admin รู้สถานะและตัดสินใจกู้ได้อย่างปลอดภัย

## กลุ่มระบบ

### UC-22 บังคับสิทธิ์และ session
- **Actor**: ระบบ
- **Main flow**
  1. `ProtectedRoute` ตรวจ session และ role ทุกครั้งที่เข้าหน้า
  2. ไม่ล็อกอิน: กลับหน้า login
  3. สิทธิ์ไม่พอ: redirect ตาม role (การเห็นปุ่มบน Home ไม่ข้าม guard)
  4. `SessionMonitor` เฝ้าสถานะ session
  5. `/admin-dashboard` redirect ไป `/admin`
- **Postcondition**: ผู้ใช้เข้าถึงเฉพาะหน้าที่มีสิทธิ์

---

## ข้อสังเกต

- UC-21 และข้อมูลการกู้งานเขียนจากชื่อไฟล์และเอกสารเท่านั้น ยังไม่ได้ไล่อ่านโค้ด `AdminStuckJobsPage.tsx` ทีละบรรทัด ควรตรวจปุ่ม/การกระทำจริงก่อนใช้เป็นข้อกำหนด
- ค่าเริ่มต้นของ role หลังสมัคร (`user`) อนุมานจากโมเดล role ใน README (โค้ดฝั่ง client ใช้ `user` เป็นค่า fallback เมื่อ role ไม่ถูกต้อง)
- UC-05, UC-14 และ UC-20 ตรวจกับ migration แล้ว (`20260403223000_role_requests.sql`, `20260710000000_video_case_multi_review.sql`, `20261014040000_video_case_identity_without_suffix.sql`) แต่ไม่ได้รันกับฐานข้อมูลจริง
- แก้เอกสารนี้เมื่อ 2026-11-20 ให้ตรงกับโค้ด: login ไป `/home`, เคสถูกสร้างอัตโนมัติตอนส่งฟอร์ม (UC-14), ยกเลิก UC-15, เพิ่ม UC-23 และ super_admin ส่วนกฎ DOCX/สิทธิ์ละเอียดอ่านจาก `docs/roles.md` ไม่ได้ตรวจซ้ำในโค้ด
- ช่องว่างที่ยังไม่ยืนยัน: ไม่พบ UI ที่ตั้ง Case Leader ซึ่งกระทบ UC-23 สำหรับผู้ใช้ที่ไม่ใช่ admin
- เทสต์อัตโนมัติของ use case อยู่ใน `tests/` (ไฟล์ `roles`, `passwordReset`, `roleRequestService`, `videoCaseService`, `adminUserManagement`) ยังไม่มีเทสต์ที่ครอบคลุมการ redirect ของ `ProtectedRoute` และหน้า UI
