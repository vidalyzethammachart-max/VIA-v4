export const ROLES = ["user", "editor", "admin"] as const;

export type AppRole = (typeof ROLES)[number];

const ROLE_RANK: Record<AppRole, number> = {
  user: 1,
  editor: 2,
  admin: 3,
};

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function normalizeRole(value: unknown): AppRole {
  return isAppRole(value) ? value : "user";
}

export function roleAtLeast(currentRole: AppRole, requiredRole: AppRole): boolean {
  return ROLE_RANK[currentRole] >= ROLE_RANK[requiredRole];
}
