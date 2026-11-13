// Free text; the suggestions in GROUP_TYPES resolve to their stored values.
export type VideoGroupType = string;

export const GROUP_TYPES: ReadonlyArray<{ value: string; label: string }>;

export const GROUP_TYPE_MAX_LENGTH: number;

export function resolveGroupType(input: string): string;

export function normalizeGroupPart(value: string): string;

export function buildVideoGroupIdentity(orderNumber: string, groupType: string, subjectName: string): string;

export function getGroupTypeLabel(groupType: string): string;

export function buildVideoGroupDisplayName(groupType: string, subjectName: string): string;

export function validateVideoGroupForm(form: {
  orderNumber: string;
  groupType: string;
  subjectName: string;
}): string | null;
