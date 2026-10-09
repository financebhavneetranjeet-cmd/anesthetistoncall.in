export const USER_ROLES = ["hospital", "anesthetist", "surgeon", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const ROLE_LABELS: Record<UserRole, string> = { hospital: "Hospital", anesthetist: "Anesthetist", surgeon: "Surgeon", admin: "Admin" };
export function isUserRole(value: string): value is UserRole { return USER_ROLES.includes(value as UserRole); }
export function canPostCase(role: UserRole): boolean { return role === "hospital" || role === "admin"; }
