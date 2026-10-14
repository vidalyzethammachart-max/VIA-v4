// Match normalize_video_case_key_part in Postgres; retain Thai and punctuation.
export function buildVideoCaseKey(orderNumber: string, subjectName: string): string {
  const order = orderNumber.trim().toLowerCase().replace(/\s+/g, "-");
  const subject = subjectName.trim().toLowerCase().replace(/\s+/g, "-");
  return order && subject ? `${order}-${subject}` : "";
}
