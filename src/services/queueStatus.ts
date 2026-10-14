export function queueStatusLabel(status: string, thai: boolean): string {
  const labels: Record<string, [string,string]> = {
    queued:["รอคิว", "Queued"], running:["กำลังวิเคราะห์", "Processing"],
    awaiting_callback:["รอเอกสาร", "Waiting for document"], retry_wait:["รอลองใหม่ / โควตา AI", "Waiting to retry / AI quota"],
    attention:["ต้องตรวจสอบงาน", "Needs attention"], failed:["สร้างไม่สำเร็จ", "Failed"],
    completed:["ประมวลผลแล้ว", "Processed"],
  };
  return labels[status]?.[thai ? 0 : 1] || (thai ? "ยังไม่พร้อม" : "Not ready");
}
