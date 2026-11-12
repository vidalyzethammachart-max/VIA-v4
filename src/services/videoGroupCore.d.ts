export type VideoGroupType = "group" | "round" | "year_end";

export const GROUP_TYPES: ReadonlyArray<{ value: VideoGroupType; label: string }>;

export function normalizeGroupPart(value: string): string;

export function buildVideoGroupIdentity(orderNumber: string, groupType: string, subjectName: string): string;

export function getGroupTypeLabel(groupType: string): string;

export function buildVideoGroupDisplayName(groupType: string, subjectName: string): string;

export function validateVideoGroupForm(form: {
  orderNumber: string;
  groupType: string;
  subjectName: string;
}): string | null;
