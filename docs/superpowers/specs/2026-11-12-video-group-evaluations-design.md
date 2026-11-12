# แบบประเมินกลุ่ม (รวมข้ามเคส ตารางแยก) — Design

วันที่: 2026-11-12 · สถานะ: รอผู้ใช้ตรวจสเปก

สเปกนี้ **แทนที่บางส่วน** ของ `2026-11-11-video-group-evaluation-design.md` (ที่ย้ายขั้นรวมไป `/video-cases`
และเก็บผลใน `video_case_aggregates`) เฉพาะเรื่องที่เก็บผลรวมและหน้าสร้าง ส่วนการเฉลี่ยคะแนน การร่างข้อเสนอแนะ
รวม และ payload `evaluators`/`suggestions` ที่แผนเดิมกำหนดยังใช้ต่อ

## เป้าหมาย

`video_case` ยังเป็นตัวตนหลักของงาน (primary) แบบประเมินกลุ่มเป็นผลรวมที่อยู่เหนือเคส ผู้ใช้เลือกแบบประเมินใบไหนก็ได้
**ข้ามเคสได้** แล้วตั้ง `orderNumber`, ประเภทกลุ่ม และ `subjectName` ใหม่ให้กลุ่ม เก็บในตาราง Supabase ที่แยกจาก
`evaluations` และ `video_case_aggregates` ใบต้นทางไม่ถูกแก้หรือลบ

## การตัดสินใจที่ตกลงกันแล้ว

| เรื่อง | ข้อสรุป |
| --- | --- |
| กับ `video_case_aggregates` เดิม | ตารางกลุ่มใหม่รับหน้าที่รวมแทนทั้งหมด ปิดการสร้างรายการใหม่ของเดิม ข้อมูลเก่ายังอ่านและเปิดเอกสารได้ ไม่ย้ายข้อมูล |
| field ก่อน `subjectName` | dropdown ค่าคงที่: "กลุ่ม", "รวมรอบ", "สรุปปลายปี" |
| ความซ้ำ | ถือว่าซ้ำเมื่อ `orderNumber` + ประเภท + `subjectName` ตรงกันหลัง normalize |
| ผู้สร้าง | แอดมิน และหัวหน้าเคส (leader) หัวหน้าเลือกได้เฉพาะใบในเคสที่ตนมองเห็น แอดมินเลือกได้ทุกใบ |
| ผู้อ่าน | ผู้ที่มองเห็นเคสต้นทางอย่างน้อยหนึ่งเคส และแอดมินทุกกลุ่ม |
| ผลลัพธ์ | pipeline เดิมทั้งชุด: เฉลี่ย 9 หมวด 45 ข้อ → ร่างข้อเสนอแนะรวมแก้ได้ → `forward-to-n8n` → AI สรุป → PDF/DOCX |
| n8n | **ไม่แก้ workflow** ใช้ช่อง `aggregate_id` เดิมส่ง UUID ของกลุ่ม ดู "สัญญา n8n" |
| หน้าจอ | หน้าใหม่ `/video-groups` แยกจาก `/video-cases` |

## 1. โมเดลข้อมูล (migration ใหม่)

### `video_group_evaluations`
- `id uuid` primary key (ค่านี้คือที่ส่งเป็น `aggregate_id`)
- `order_number text not null`, `group_type text not null` (CHECK ใน `'group','round','year_end'` โดยแสดงผลเป็นไทยที่ UI),
  `subject_name text not null`
- `group_key text not null unique`: ค่า normalize ของ `order_number` + `group_type` + `subject_name` ด้วยกฎเดียวกับ
  `build_video_case_key` (trim, lower, ช่องว่างเป็น `-`; คงตัวอักษรไทยและเครื่องหมาย) ฟังก์ชัน SQL และ TS ต้องให้ผลตรงกัน (มีเทสต์)
- `requested_by uuid`, `requested_by_name`, `requested_by_employee_number`
- ผลรวม: `source_snapshot jsonb`, `combined_scores jsonb`, `section_averages jsonb`, `source_count int`
- `ai_model`, `ai_output jsonb`, `ai_raw_text`, `status` (คงคอลัมน์ให้ตรงกับแถวเดิมเพื่อใช้ร่วมกับโค้ดแสดงผล)
- เอกสาร: `document_status` (`pending|ready|failed`), `document_error`, `source_doc_id`, `pdf_storage_path`, `docx_storage_path`
- `created_at`, `updated_at`

### `video_group_evaluation_sources`
- primary key `(group_id, evaluation_id)`, `unique (group_id, source_position)`, `source_position int`
- `video_case_id uuid` ของใบต้นทาง (ใช้ตรวจสิทธิ์และแสดงที่มา)
- **ไม่มี** trigger บังคับเคสเดียวกัน; คงการห้ามเลือกใบซ้ำในกลุ่มเดียว

แบบกลุ่มไม่มี `video_case_id` ของตัวเอง เชื่อมกับเคสผ่านใบต้นทาง

### การสร้าง: RPC `create_video_group_evaluation`
ฟังก์ชัน Postgres เดียว (SECURITY DEFINER ตรวจ `auth.uid()` เอง) ทำในธุรกรรมเดียว:
1. ตรวจผู้เรียก: แอดมิน หรือเป็น leader ของอย่างน้อยหนึ่งเคสที่ใบต้นทางอยู่
2. ตรวจใบต้นทางทุกใบ: มีอยู่จริง `document_status = 'ready'` และ (แอดมิน หรือ `can_view_video_case` ของเคสนั้น) ไม่ซ้ำกัน และอย่างน้อย 2 ใบ
3. คำนวณ `group_key`; ซ้ำ → error `unique_violation` ที่แมปเป็นข้อความไทย
4. เขียนกลุ่มและ sources พร้อมกัน; ผลเฉลี่ยคำนวณฝั่ง client ด้วย `combineAggregateStatistics` เดิมแล้วส่งเข้ามาเป็นพารามิเตอร์ เหมือนที่ `combineVideoCaseAnalyses` ทำอยู่ (ไม่ย้ายตรรกะเฉลี่ยไป SQL ในรอบนี้)

### RLS
- `select`: แอดมิน หรือมี source ที่ `can_view_video_case(video_case_id)`
- ไม่มี policy `insert` ตรงจาก client; เขียนผ่าน RPC เท่านั้น
- `update` (สถานะเอกสาร) ทำโดย service role ผ่าน callback และ `finish_document_dispatch` เหมือนของเดิม

### `video_case_aggregates` เดิม
ไม่แก้ข้อมูล เพิกถอน/ปรับ policy `video_case_aggregates_insert_leader` เพื่อปิดการสร้างใหม่ (ยังอ่านและ update สถานะเอกสารได้)

## 2. หน้าจอ

- `/video-groups`: รายการกลุ่มที่ผู้ใช้มองเห็น (ชื่อเต็ม = ประเภท + ชื่อหัวข้อ, เลขที่สั่งงาน, จำนวนต้นทาง, สถานะเอกสาร); ปุ่ม "สร้างแบบประเมินกลุ่ม" เห็นเฉพาะแอดมิน/หัวหน้าเคส
- `/video-groups/new` สามขั้นในหน้าเดียว
  1. เลือกแบบประเมินข้ามเคส (ค้นหาด้วยเลขที่สั่งงาน/ชื่อหัวข้อ/เคส มีป้ายเคส; ติ๊กได้เฉพาะ `ready`; ขั้นต่ำ `MIN_COMBINE_COUNT` = 2)
  2. ตั้งชื่อ: เลขที่สั่งงาน → ประเภท (dropdown) → ชื่อหัวข้อ; ตรวจซ้ำทันที
  3. ตรวจและรวม: คะแนนเฉลี่ยรายหมวด + ร่างข้อเสนอแนะรวม (`buildCombinedSuggestionDraft`) แก้ได้ก่อนส่ง
- `/video-groups/:groupId`: หน้าสรุปกลุ่ม 9 หมวด 45 ข้อ รายชื่อต้นทาง สถานะ/ดาวน์โหลด PDF/DOCX และปุ่มส่งใหม่เมื่อล้มเหลว
- `CaseEvaluationPicker` ขยายให้แสดงป้ายเคสและรับรายการข้ามเคส (ใช้ซ้ำ ไม่เขียนใหม่)
- ปุ่มรวมใน `VideoCasesPage` และ `VideoCaseDetailPage` เปลี่ยนเป็นลิงก์ไป `/video-groups/new` โดยติ๊กใบของเคสปัจจุบันไว้ล่วงหน้า; ลบโค้ดรวมซ้ำสองที่
- เส้นทางเดิม `/video-cases/:id/summaries/...` และ `aggregates/...` ยังอยู่ (อ่านข้อมูลเก่า)
- เพิ่มเมนู "แบบประเมินกลุ่ม"; ข้อความทั้งหมดผ่าน i18n เดิม

## 3. สัญญา n8n และการส่งเอกสาร

- payload ไป `forward-to-n8n`: `document_type: "video_case_summary"`, `aggregate_id = group.id`, ไม่มี `evaluation_id`
  `order_number` = ของกลุ่ม, `subject_name` = "ประเภท + ชื่อหัวข้อ", `source_evaluation_ids`, `source_count`,
  `question_averages`, `section_averages`, `evaluators`, `suggestions`, `overallSuggestionRaw` คงรูปเดิม
- `video_case_id`: สัญญาปัจจุบันระบุว่า n8n แค่ normalize ผ่านไป ไม่ใช่ identity; แบบกลุ่มส่งค่าของเคสแรกในต้นทางเป็นค่าประกอบ
  (ต้องยืนยันกับ workflow จริงว่าไม่ validate เป็นอย่างอื่น — ดูความเสี่ยง)
- การแปลง UUID เป็นเป้าหมาย: `resolveDocumentTarget` ยังเป็นฟังก์ชันบริสุทธิ์ที่ได้ kind `aggregate`; เพิ่มขั้น async
  `resolveGroupTarget` ที่ค้น `video_group_evaluations` ก่อน เจอจึงเปลี่ยนเป็น kind `group` ใช้ที่ `directForward.js`,
  `document-generation-callback`, `document-artifact-url`
- migration แก้ `begin_document_dispatch` / `finish_document_dispatch` ให้รับ `p_kind = 'group'` (ปัจจุบันรองรับ `evaluation`, `aggregate`)
  และตรวจว่า `document_dispatches.target_kind` / `ai_request_queue.target_kind` ไม่มี CHECK constraint ที่กัน kind ใหม่
- อัปเดต `docs/n8n-video-case-summary-contract.md`: ระบุว่า `aggregate_id` อาจเป็น UUID ของแบบกลุ่ม และ server แยกตามตารางที่พบ

## Error handling

- ซ้ำกับกลุ่มเดิม: RPC ตอบ error ชัด; หน้าแสดงกล่องแดงเดิม ไม่ navigate
- ต้นทางไม่พร้อม/ไม่มีสิทธิ์/ซ้ำ: RPC ปฏิเสธทั้งชุด ไม่สร้างครึ่งเดียว
- ส่งเอกสารล้มเหลว: กลุ่มยังอยู่ `document_status` = `failed`/`pending` ส่งใหม่ได้ ใช้กลไกกันส่งซ้ำของ server เดิม
- ปุ่มรวมปิดระหว่างทำงาน คืนสถานะใน `finally`

## การทดสอบ (`node --test "tests/**/*.test.js"`, TDD)

- TS/JS: normalize `group_key` เท่ากับกฎ SQL, ค่า dropdown ที่ถูกต้อง, เลือกข้ามเคส + ขั้นต่ำ 2 ใบ, payload ครบและไม่มี `evaluation_id`
- `resolveGroupTarget`: UUID ในตารางกลุ่ม → `group`, ไม่อยู่ → `aggregate`, ไม่ใช่ UUID → error
- migration (รูปแบบเดียวกับ `videoCaseAggregateHistoryMigration.test.js`): ตรวจข้อความ SQL ว่ามี unique บน `group_key`, ไม่มี trigger เคสเดียวกัน,
  RPC ตรวจสิทธิ์, `begin/finish_document_dispatch` รองรับ `group`, policy insert เดิมถูกปิด
- ทดสอบมือหลังทำเสร็จ: สร้างกลุ่มจริงและส่งผ่าน n8n จริง (ไม่เรียก n8n/AI/รัน migration บน Supabase จริงโดยไม่ถามผู้ใช้ก่อน)

## ความเสี่ยงและสิ่งที่ต้องยืนยันตอนวางแผน

1. n8n workflow อาจ validate `document_type`/`video_case_id` เข้มกว่าที่สัญญาเขียน — ตรวจผ่านหน้าจอ n8n (ห้ามเรียก REST ตรง) ก่อนปล่อยใช้
2. `begin/finish_document_dispatch` และตาราง `document_dispatches`/`ai_request_queue` ผมอ่านเฉพาะบรรทัดที่อ้าง kind ยังไม่ได้อ่านครบ จึงยังไม่รู้ว่าต้องแก้เพิ่มแค่ไหน
3. ผลเฉลี่ยคำนวณฝั่ง client แล้วส่งเข้า RPC ผู้เรียกที่ตั้งใจโกงอาจส่งค่าเฉลี่ยที่ไม่ตรงกับต้นทางได้ (เหมือนของเดิม); ถ้าต้องการกัน ให้ย้ายการเฉลี่ยไป SQL เป็นงานรอบถัดไป
4. รายการประเภทกลุ่มเป็น CHECK constraint การเพิ่มค่าใหม่ต้องมี migration
5. `video_case_aggregates` เดิมที่สถานะ `pending` ค้างอยู่ยังต้องส่งเอกสารได้ — ต้องไม่ปิดเส้นทาง `forward-to-n8n` ของ kind `aggregate`

## นอกขอบเขตรอบนี้

หน้าเปรียบเทียบคะแนนข้ามเคส/กราฟ, การย้ายข้อมูล aggregate เก่าเข้าตารางใหม่, การแก้ workflow n8n, การย้ายการเฉลี่ยไป SQL
