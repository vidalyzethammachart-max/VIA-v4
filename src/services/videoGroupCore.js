// Group evaluation identity and form rules. The database unique index is authoritative;
// the identity here is only a client-side duplicate pre-check.
export const GROUP_TYPES = Object.freeze([
  Object.freeze({ value: "group", label: "กลุ่ม" }),
  Object.freeze({ value: "round", label: "รวมรอบ" }),
  Object.freeze({ value: "year_end", label: "สรุปปลายปี" }),
]);

// Same rule as normalize_video_case_key_part in SQL: lower(btrim(x)), whitespace runs -> "-".
export function normalizeGroupPart(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "-");
}

export const GROUP_TYPE_MAX_LENGTH = 100;

// The group type is free text with suggestions. A suggestion (its label or stored value) resolves
// to the stored value so it stays compatible with existing rows; anything else is kept as typed.
export function resolveGroupType(input) {
  const text = String(input ?? "").trim();
  if (!text) return "";
  const lower = text.toLowerCase();
  const known = GROUP_TYPES.find((type) => type.value === lower || type.label === text);
  return known ? known.value : text;
}

export function buildVideoGroupIdentity(orderNumber, groupType, subjectName) {
  const type = normalizeGroupPart(resolveGroupType(groupType));
  const order = normalizeGroupPart(orderNumber);
  const subject = normalizeGroupPart(subjectName);
  if (!order || !type || !subject) return "";
  return [order, type, subject].join("\u0000");
}

export function getGroupTypeLabel(groupType) {
  const text = String(groupType ?? "").trim();
  return GROUP_TYPES.find((type) => type.value === text)?.label ?? text;
}

export function buildVideoGroupDisplayName(groupType, subjectName) {
  return `${getGroupTypeLabel(groupType)} ${String(subjectName ?? "").trim()}`.trim();
}

export function validateVideoGroupForm(form) {
  if (!String(form?.orderNumber ?? "").trim()) return "กรุณากรอกเลขที่สั่งงาน";
  const groupType = resolveGroupType(form?.groupType);
  if (!groupType) return "กรุณาระบุประเภทกลุ่ม";
  if (groupType.length > GROUP_TYPE_MAX_LENGTH) {
    return `ประเภทกลุ่มต้องไม่เกิน ${GROUP_TYPE_MAX_LENGTH} ตัวอักษร`;
  }
  if (!String(form?.subjectName ?? "").trim()) return "กรุณากรอกชื่อหัวข้อ";
  return null;
}
