import { isEvaluationStuck } from "./stuckEvaluationCore.js";

export function documentStatusLabel(status: string, thai: boolean, createdAt?: string): string {
  if (status === "ready") return thai ? "พร้อมเปิด" : "Ready";
  if (status === "failed") return thai ? "สร้างไม่สำเร็จ" : "Failed";
  if (createdAt && isEvaluationStuck({ document_status: status, created_at: createdAt })) {
    return thai ? "ค้างเกิน 30 นาที" : "Stuck over 30 min";
  }
  return thai ? "กำลังประมวลผล" : "Processing";
}
