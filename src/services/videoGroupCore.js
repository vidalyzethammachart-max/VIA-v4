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

function isGroupType(groupType) {
  return GROUP_TYPES.some((type) => type.value === groupType);
}

export function buildVideoGroupIdentity(orderNumber, groupType, subjectName) {
  if (!isGroupType(groupType)) return "";
  const order = normalizeGroupPart(orderNumber);
  const subject = normalizeGroupPart(subjectName);
  if (!order || !subject) return "";
  return [order, groupType, subject].join("\u0000");
}

export function getGroupTypeLabel(groupType) {
  return GROUP_TYPES.find((type) => type.value === groupType)?.label ?? "";
}

export function buildVideoGroupDisplayName(groupType, subjectName) {
  return `${getGroupTypeLabel(groupType)} ${String(subjectName ?? "").trim()}`;
}

export function validateVideoGroupForm(form) {
  if (!String(form?.orderNumber ?? "").trim()) return "กรุณากรอกเลขที่สั่งงาน";
  if (!isGroupType(form?.groupType)) return "กรุณาเลือกประเภทกลุ่ม";
  if (!String(form?.subjectName ?? "").trim()) return "กรุณากรอกชื่อหัวข้อ";
  return null;
}
