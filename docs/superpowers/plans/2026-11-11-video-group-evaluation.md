# แบบประเมินกลุ่มวิดีโอ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้หัวหน้าเคส/แอดมินเลือกแบบประเมิน ≥ 2 ใบในหน้า `/video-cases` รวมเป็นแบบประเมินกลุ่มวิดีโอ ที่เห็นผู้ประเมินทุกคนและข้อเสนอแนะรายคน แล้วส่งให้ AI สรุปรวมผ่านเส้นทาง n8n เดิม

**Architecture:** ต่อยอดโครงเดิม: ผลรวมยังเป็นแถวใน `video_case_aggregates` และส่งเอกสารผ่าน `forward-to-n8n` เดิม ไม่แก้ n8n workflow ตรรกะใหม่ (ขั้นต่ำ 2 ใบ, แปลงแถวเป็น source run, ร่างข้อเสนอแนะรวม) อยู่ในไฟล์ `*Core.js` ที่เทสต์ด้วย `node --test` ส่วน UI เป็นการต่อสายจากฟังก์ชันเหล่านี้

**Tech Stack:** React 18 + TypeScript + Vite, Supabase, `node --test` (tests/**/*.test.js), Tailwind

**Spec:** `docs/superpowers/specs/2026-11-11-video-group-evaluation-design.md` (แผนนี้แก้ข้อสมมติของสเปกบางข้อ ดู "Spec corrections")

## Spec corrections (พบหลังอ่านโค้ดจริงบน `main`)

- `buildVideoCaseSummaryPayload` ส่ง `suggestions` และข้อมูล source run (`overallSuggestionRaw`) ให้ n8n อยู่แล้ว สิ่งที่ขาดคือ **ผู้ประเมินที่ผูกกับข้อเสนอแนะแต่ละข้อ** และร่างข้อเสนอแนะรวมให้ผู้ใช้
- ค่า `rubric` เป็นตัวเลข (`number | null`) อย่างเดียว (`FormSubmit.tsx:315`) จึง **ไม่ต้องแก้การรวมข้อความใน `aggregateStatistics.js`**; งานนี้เพียงปักเทสต์ว่าค่า `null` ไม่ถูกนับเป็น 0
- งานทำบนสาขา `main` ตามที่ผู้ใช้เลือก (repo ถูกสลับจาก `ppe` ระหว่างคุย) ซึ่งยังไม่มีการรีดีไซน์ล่าสุดของ `ppe`

## Global Constraints

- ขั้นต่ำการรวม = **2** แบบประเมิน (นับเฉพาะใบที่ `document_status === "ready"` และไม่ซ้ำ id)
- ข้อความที่ผู้ใช้เห็นเป็นภาษาไทย; ชื่อหน้า/ผลลัพธ์: **"แบบประเมินกลุ่มวิดีโอ"**; ปุ่ม: **"รวมเป็นแบบประเมินกลุ่ม"**
- ห้ามแก้ n8n workflow; field เดิมใน payload ต้องอยู่ครบ (เพิ่ม field ใหม่ได้อย่างเดียว)
- ไม่เรียก AI/n8n จริงระหว่างทดสอบ; ใบต้นทางไม่ถูกแก้หรือลบ
- ตรวจด้วย `npm test` (= `node --test "tests/**/*.test.js"`) และ `npm run typecheck`
- commit message ลงท้ายด้วย `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`

## Review Focus

- เลือกซ้ำ id เดียวกัน 2 ครั้ง → นับเป็น 1 ใบ ไม่ผ่านขั้นต่ำ (Task 1)
- เลือกใบที่ยังไม่ `ready` ปนมา → ถูกตัดก่อนนับ ไม่ทำให้ผ่านขั้นต่ำ (Task 1)
- คะแนนบางข้อเป็น `null` ในบางใบ → เฉลี่ยจากใบที่มีค่า ไม่นับ `null` เป็น 0; ถ้าทุกใบ `null` ข้อนั้นหายไป (Task 2)
- ผู้ประเมินไม่มีรหัสพนักงาน หรือข้อเสนอแนะว่าง/เว้นวรรค → ร่างข้อเสนอแนะใช้ "ไม่ระบุรหัส" และข้ามข้อว่าง ไม่ขึ้น `undefined` (Task 3)
- ไม่มีใครเขียนข้อเสนอแนะเลย → ร่างเป็นสตริงว่าง ไม่โยน error (Task 3)

---

### Task 1: กติกาขั้นต่ำ 2 ใบ

**Files:**
- Modify: `src/services/videoCaseCombineSelectionCore.js`, `src/services/videoCaseCombineSelectionCore.d.ts`
- Test: `tests/videoCaseCombineSelection.test.js`

**Interfaces:**
- Produces:
  - `export const MIN_COMBINE_COUNT = 2`
  - `export const COMBINE_MIN_MESSAGE: string` = `"เลือกแบบประเมินที่พร้อมใช้งานอย่างน้อย 2 รายการจึงจะรวมผลได้"`
  - `export function getCombineBlockReason(runs: CombinableEvaluation[], selectedIds: number[]): string | null` — คืน `null` เมื่อรวมได้, ไม่งั้นคืน `COMBINE_MIN_MESSAGE`

- [ ] **Step 1: เขียนเทสต์ที่ล้ม** ต่อท้าย `tests/videoCaseCombineSelection.test.js` (ใช้ `runs` เดิมในไฟล์: 333, 332 ready; 334 pending; 331 failed):
  - `"fewer than two ready evaluations cannot be combined"`: `getCombineBlockReason(runs, [])`, `(runs, [333])` เท่ากับ `COMBINE_MIN_MESSAGE`
  - `"two ready evaluations can be combined"`: `getCombineBlockReason(runs, [333, 332])` เป็น `null`
  - `"pending and failed selections do not count toward the minimum"`: `(runs, [333, 334, 331])` เท่ากับ `COMBINE_MIN_MESSAGE`
  - `"the same evaluation selected twice counts once"`: `(runs, [333, 333])` เท่ากับ `COMBINE_MIN_MESSAGE`
  - `"the minimum is two"`: `MIN_COMBINE_COUNT === 2` และข้อความมีคำว่า `อย่างน้อย 2`
- [ ] **Step 2: รัน** `node --test tests/videoCaseCombineSelection.test.js` — คาดว่า FAIL (ยังไม่มี export)
- [ ] **Step 3: implement** ตาม Interfaces ในไฟล์ core โดยใช้ `keepCombinableSelection` + `new Set` นับ id ที่ไม่ซ้ำ; เพิ่ม declaration ใน `.d.ts`
- [ ] **Step 4: รันเทสต์ไฟล์เดิม** — คาดว่า PASS ทุกเคส
- [ ] **Step 5: Commit** `feat: require at least two ready evaluations to combine`

### Task 2: บังคับขั้นต่ำที่ service + ตัวแปลงแถวเป็น source run

**Files:**
- Modify: `src/services/videoCaseCombineSelectionCore.js` (+ `.d.ts`), `src/services/videoCaseService.ts` (`combineVideoCaseAnalyses`, ~บรรทัด 385)
- Test: `tests/videoCaseCombineSelection.test.js`, `tests/videoCaseCombine.test.js`

**Interfaces:**
- Consumes: `MIN_COMBINE_COUNT`, `COMBINE_MIN_MESSAGE` (Task 1), `getAnalysisMatrix` จาก `src/services/aggregateStatistics.js`
- Produces: `export function toCombineSourceRuns(runs: VideoCaseEvaluationRow[]): CombineSourceRun[]` โดย `CombineSourceRun` มี field เดียวกับที่ `handleCombine` ในสองหน้าสร้างอยู่ตอนนี้: `id, user_id, employee_number, evaluation_id (= id), run_kind (= analysis_kind), rubric, matrix (= getAnalysisMatrix(analysis_ai_output)), ai_output (= analysis_ai_output), ai_raw_text (= analysis_ai_raw_text), notes (= overall_suggestion), created_at, order_number`

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**
  - `videoCaseCombineSelection.test.js`: `"maps evaluation rows to combine source runs"` — ป้อนแถวที่มี `analysis_ai_output: { quality_scores: { a: 1 } }`, `overall_suggestion: "ดี"`, `analysis_kind: "human"`; ยืนยัน `evaluation_id === id`, `matrix` เท่ากับ `{ a: 1 }`, `notes === "ดี"`, `run_kind === "human"`
  - `videoCaseCombine.test.js`: ปรับ stub `require` ใน `runInNewContext` ให้คืน `videoCaseCombineSelectionCore.js` จริงเมื่อ name เป็น `"./videoCaseCombineSelectionCore.js"` (import จริงด้วย `import * as selectionCore from "../src/services/videoCaseCombineSelectionCore.js"`); เพิ่มเทสต์ `"combining fewer than two evaluations is rejected before touching the database"`: เรียก `exports.combineVideoCaseAnalyses` ด้วย source run 1 ใบ คาด `assert.rejects(..., /อย่างน้อย 2/)` และ `saved.length === 0`
  - `videoCaseCombine.test.js`: `"null scores are skipped, not counted as zero"` — `combineAggregateStatistics([{rubric:{a:{q1:null}}},{rubric:{a:{q1:4}}}]).aggregatedScores.a.q1 === 4`; และเมื่อทุกใบเป็น `null` ข้อ `q1` ไม่อยู่ใน `aggregatedScores.a` (เทสต์นี้ปักพฤติกรรมเดิม อาจผ่านทันที ให้บันทึกไว้)
- [ ] **Step 2: รัน** `node --test tests/videoCaseCombineSelection.test.js tests/videoCaseCombine.test.js` — คาดว่าเคส mapper และเคสขั้นต่ำ FAIL
- [ ] **Step 3: implement** `toCombineSourceRuns` ใน core (import `getAnalysisMatrix`); ใน `combineVideoCaseAnalyses` แทนที่ `if (!params.sourceRuns.length) throw ...` ด้วยการนับ `evaluation_id` ไม่ซ้ำ ถ้า `< MIN_COMBINE_COUNT` ให้ `throw new Error(COMBINE_MIN_MESSAGE)` (import จาก `./videoCaseCombineSelectionCore.js`)
- [ ] **Step 4: รันเทสต์สองไฟล์** — PASS ทั้งหมด; รัน `npm run typecheck` ต้องผ่าน
- [ ] **Step 5: Commit** `feat: enforce two-evaluation minimum in combineVideoCaseAnalyses`

### Task 3: ผู้ประเมินและร่างข้อเสนอแนะรวมใน payload

**Files:**
- Modify: `src/services/videoCaseSummaryPayloadCore.js`, `src/services/videoCaseSummaryPayloadCore.d.ts`
- Check: `supabase/functions/forward-to-n8n/` (ว่ามี allowlist ของ field หรือไม่), `tests/n8nVideoCaseContract.test.js`
- Test: `tests/videoCaseSummaryPayloadCore.test.js`

**Interfaces:**
- Produces:
  - `export function buildCombinedSuggestionDraft(sourceRuns: Array<{ employee_number?: string | null; notes?: string | null }>): string` — ต่อข้อเสนอแนะของแต่ละใบเป็น `ผู้ประเมิน <รหัสหรือ "ไม่ระบุรหัส">: <notes ที่ trim>` คั่นด้วย `"\n\n"`; ข้ามใบที่ notes ว่าง/ไม่ใช่สตริง
  - `buildVideoCaseSummaryPayload` คืน field ใหม่ `evaluators: Array<{ evaluation_id: number | null; employee_number: string | null; notes: string | null }>` (field เดิมทั้งหมดคงอยู่)

- [ ] **Step 1: เขียนเทสต์ที่ล้ม** ใน `videoCaseSummaryPayloadCore.test.js`:
  - `"draft joins each evaluator's suggestion with their code"`: ป้อน 2 ใบ (`020943`/"ดี", `021111`/"ปรับปรุง") คาดข้อความ `"ผู้ประเมิน 020943: ดี\n\nผู้ประเมิน 021111: ปรับปรุง"`
  - `"draft skips blank notes and labels missing codes"`: ใบหนึ่ง notes `"   "`, อีกใบ `employee_number: null` notes `"ok"` คาด `"ผู้ประเมิน ไม่ระบุรหัส: ok"` และไม่มี `undefined`
  - `"draft is empty when nobody wrote a suggestion"`: ป้อน `[]` และ `[{notes:null}]` คาด `""`
  - `"payload lists the evaluators and keeps existing fields"`: aggregate ที่มี `source_runs` 2 ใบ (`evaluation_id`, `employee_number`, `notes`) คาด `payload.evaluators` ตรงกับข้อมูล และ `payload.suggestions`, `payload.question_averages`, `payload.aggregate_id` ยังอยู่
- [ ] **Step 2: รัน** `node --test tests/videoCaseSummaryPayloadCore.test.js` — FAIL
- [ ] **Step 3: implement** ทั้งสองส่วนใน core; `evaluators` ใช้ `run.evaluation_id ?? run.id`; อัปเดต `.d.ts` (ชนิด `VideoCaseSummaryPayload` + ฟังก์ชันใหม่)
- [ ] **Step 4: ตรวจ allowlist** — `grep -rn "combine_prompt\|suggestions" supabase/functions/forward-to-n8n/`; ถ้าฟังก์ชันคัดเลือก field ก่อนส่งต่อ ให้เพิ่ม `evaluators` ที่นั่นพร้อมเทสต์ในไฟล์ contract ที่เกี่ยวข้อง ถ้าส่งต่อทั้ง body ไม่ต้องแก้
- [ ] **Step 5: รัน** `npm test` ทั้งชุด (รวม `n8nVideoCaseContract.test.js`) — PASS; ถ้า contract test ตรวจ key แบบเป๊ะ ให้เพิ่ม `evaluators` ในค่าที่คาดหวัง
- [ ] **Step 6: Commit** `feat: include evaluators and a combined suggestion draft for group evaluations`

### Task 4: หน้าแบบประเมินกลุ่มวิดีโอ (หน้าสรุป)

**Files:**
- Modify: `src/page/VideoCaseSummaryPage.tsx` (effect ตั้งค่า `overallSuggestion` ~บรรทัด 174–182, หัวข้อ `h2` ~บรรทัด 283–288 และข้อความ ~บรรทัด 230)
- Test: `tests/videoCaseGroupEvaluationPage.test.js` (ใหม่ ใช้สไตล์อ่านซอร์สด้วย regex เหมือน `videoCaseAggregateHistoryPage.test.js`)

**Interfaces:**
- Consumes: `buildCombinedSuggestionDraft` (Task 3) นำเข้าจาก `../services/videoCaseSummaryPayloadCore`

- [ ] **Step 1: เขียนเทสต์ที่ล้ม** `"summary page is the group evaluation and prefills the suggestion"`: อ่านซอร์ส `VideoCaseSummaryPage.tsx` คาด match `/แบบประเมินกลุ่มวิดีโอ/` และ `/buildCombinedSuggestionDraft\(sourceRuns\)/`
- [ ] **Step 2: รัน** `node --test tests/videoCaseGroupEvaluationPage.test.js` — FAIL
- [ ] **Step 3: implement** — effect ตั้งค่าเริ่มต้นเป็น `combine_prompt` ถ้ามี ไม่งั้นใช้ `buildCombinedSuggestionDraft(sourceRuns)` (เพิ่ม `sourceRuns` ใน dependency array; ผู้ใช้ที่พิมพ์แล้วต้องไม่ถูกเขียนทับเมื่อ re-render ให้ตั้งค่าเฉพาะตอน aggregate โหลดเสร็จ); เปลี่ยนหัวข้อ/คำอธิบายหน้าเป็น "แบบประเมินกลุ่มวิดีโอ" พร้อมบอกจำนวนผู้ประเมินที่ถูกรวม (`sourceRuns.length`)
- [ ] **Step 4: รันเทสต์ไฟล์ใหม่** PASS, `npm run typecheck` ผ่าน
- [ ] **Step 5: Commit** `feat: present the combined result as a group evaluation with a prefilled suggestion`

### Task 5: ขั้นเลือกและรวมที่หน้า `/video-cases`

**Files:**
- Create: `src/components/CaseEvaluationPicker.tsx`
- Modify: `src/page/VideoCasesPage.tsx`
- Test: `tests/videoCaseGroupEvaluationPage.test.js`

**Interfaces:**
- Consumes: `getCombinableEvaluationIds`, `keepCombinableSelection`, `isCombinableEvaluation`, `getCombineBlockReason`, `toCombineSourceRuns` (Task 1–2)
- Produces: `export default function CaseEvaluationPicker(props: { analyses: VideoCaseEvaluationRow[]; selectedIds: number[]; onChange: (ids: number[]) => void; disabled?: boolean }): JSX.Element` — รายการแบบประเมินพร้อมช่องติ๊ก (ใบที่ไม่ `ready` ติ๊กไม่ได้), แสดงผู้ประเมิน (`employee_number`), วันที่, คะแนนเฉลี่ย, สถานะ; ใช้ได้ทั้งมือถือและจอใหญ่

- [ ] **Step 1: เขียนเทสต์ที่ล้ม** ใน `videoCaseGroupEvaluationPage.test.js` อ่านซอร์ส `VideoCasesPage.tsx` คาด match: `/CaseEvaluationPicker/`, `/getCombineBlockReason\(/`, `/toCombineSourceRuns\(/`, `/รวมเป็นแบบประเมินกลุ่ม/`; และ **ไม่** match `/handleDeleteEvaluation|evaluationToDelete/` (โค้ดค้างถูกลบแล้ว)
- [ ] **Step 2: รัน** — FAIL
- [ ] **Step 3: สร้าง `CaseEvaluationPicker`** ตาม Interfaces (ใช้ `getEvaluationAverage` ถ้ามี helper เดิมที่ `VideoCaseDetailPage.tsx` ใช้ ให้ย้าย/ใช้ซ้ำแทนการเขียนใหม่)
- [ ] **Step 4: แก้ `VideoCasesPage.tsx`**
  - ในการ์ด "เคสที่เลือก" แทรก `CaseEvaluationPicker` เมื่อ `effectiveCaseRole === "leader" && !showTrash`
  - ค่าเริ่มต้นที่ `loadCaseData`: `getCombinableEvaluationIds(analysisRows)`; `selectedAnalyses` กรองด้วย `keepCombinableSelection`
  - ปุ่ม "รวมเป็นแบบประเมินกลุ่ม" `disabled` เมื่อ `combining || getCombineBlockReason(analyses, selectedAnalysisIds) !== null`; ใต้ปุ่มแสดงเหตุผลเมื่อ `getCombineBlockReason` ไม่เป็น `null`; กดแล้วเปิด `ConfirmModal` เดิม (`confirmOpen`) ข้อความไทย
  - `handleCombine` ใช้ `toCombineSourceRuns(selectedAnalyses)`; ข้อความ error เป็นไทย
  - ลบโค้ดค้าง: `prompt`, `handleDeleteEvaluation`, `evaluationToDelete`, `deleting`, `ConfirmModal` ลบแบบประเมิน และ import ที่ไม่ใช้
- [ ] **Step 5: รัน** `npm test` และ `npm run typecheck` — PASS (เทสต์ regex ของ `videoCaseAggregateHistoryPage` ต้องไม่พัง)
- [ ] **Step 6: ตรวจมือ** `npm run dev` เปิด `/video-cases` ด้วยบัญชีหัวหน้าเคส: เลือก 1 ใบ → ปุ่มปิดและมีเหตุผล; เลือก 2 ใบ → กดรวมแล้วไปหน้า "แบบประเมินกลุ่มวิดีโอ" ที่มีร่างข้อเสนอแนะ; ด้วยบัญชีสมาชิก → ไม่เห็นปุ่ม **อย่ากดส่งไป n8n จริงโดยไม่ถามผู้ใช้**
- [ ] **Step 7: Commit** `feat: combine evaluations into a group evaluation from the video cases page`

### Task 6: หน้ารายละเอียดเคสใช้กติกาเดียวกัน

**Files:**
- Modify: `src/page/VideoCaseDetailPage.tsx` (`handleCombine` ~บรรทัด 168–208, ปุ่มรวม ~บรรทัด 418–425, ข้อความ ~บรรทัด 175)
- Test: `tests/videoCaseGroupEvaluationPage.test.js`

**Interfaces:**
- Consumes: `getCombineBlockReason`, `toCombineSourceRuns`

- [ ] **Step 1: เขียนเทสต์ที่ล้ม** อ่านซอร์ส `VideoCaseDetailPage.tsx` คาด match `/getCombineBlockReason\(/` และ `/toCombineSourceRuns\(/` และไม่ match `/อย่างน้อย 1 รายการ/`
- [ ] **Step 2: รัน** — FAIL
- [ ] **Step 3: implement** — แทนการ map source run ในบรรทัด ~185–198 ด้วย `toCombineSourceRuns(selectedAnalyses)`; ปุ่มรวม `disabled` เมื่อ `getCombineBlockReason(analyses, selectedAnalysisIds) !== null` และแสดงเหตุผลใต้ปุ่ม; ลบข้อความ "อย่างน้อย 1 รายการ"
- [ ] **Step 4: รัน** `npm test` + `npm run typecheck` — PASS
- [ ] **Step 5: Commit** `refactor: share the combine rule and source-run mapping with the case detail page`

---

## Self-Review

- **Spec coverage:** ขั้นต่ำ 2 ใบ → Task 1,2,5,6; ขั้นตอนอยู่หน้า `/video-cases` → Task 5; ข้อมูลครบ (ผู้ประเมิน + ข้อเสนอแนะรายคน) → Task 3,4; ผลลัพธ์เป็นแบบประเมินกลุ่ม + AI สรุป → Task 3,4 (ใช้ `forward-to-n8n` เดิม); error handling/RLS/กันส่งซ้ำ → ใช้ของเดิม ไม่มี task ใหม่
- **Type consistency:** `getCombineBlockReason(runs, selectedIds)`, `toCombineSourceRuns(runs)`, `buildCombinedSuggestionDraft(sourceRuns)`, `COMBINE_MIN_MESSAGE` ใช้ชื่อเดียวกันทุก task
- **ความเสี่ยงที่เหลือ:** (1) ยังไม่ยืนยันว่า n8n/AI ใช้ `evaluators` ได้เลยหรือต้องแก้ prompt (Task 3 Step 4 ตรวจแค่ฝั่ง edge function); (2) `main` ไม่มีการรีดีไซน์ของ `ppe` — ถ้ารวมสาขากันภายหลังจะ conflict ที่ `VideoCasesPage.tsx` / `VideoCaseDetailPage.tsx`
