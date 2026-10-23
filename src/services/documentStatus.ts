export function documentStatusLabel(status: string, thai: boolean): string {
  if (status === "ready") return thai ? "พร้อมเปิด" : "Ready";
  if (status === "failed") return thai ? "สร้างไม่สำเร็จ" : "Failed";
  return thai ? "กำลังประมวลผล" : "Processing";
}
