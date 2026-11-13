// admin and super_admin both hold admin privileges; super_admin is a single account above admin.
export function isAdminRole(role) {
  return role === 'admin' || role === 'super_admin';
}
