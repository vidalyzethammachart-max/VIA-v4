import { isAdminRole } from './roleAccess.js';

// Group document permission: editor or admin, the requester, or a member of any source case.
export function canReadGroupDocument({ role, userId, group, sourceCaseIds, memberCaseIds }) {
  if (role === 'editor' || isAdminRole(role)) return true;
  if (group?.requested_by && group.requested_by === userId) return true;
  const memberOf = new Set(memberCaseIds || []);
  return (sourceCaseIds || []).some((id) => memberOf.has(id));
}
