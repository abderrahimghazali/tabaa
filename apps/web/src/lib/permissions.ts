import type { Role } from "@facture/core";

/**
 * One entry per row of the permission table in API.md. The API enforces the same table;
 * the interface only hides what a role cannot do.
 */
export type Capability =
  | "write" // create, edit, issue invoices; record payments; customers and items
  | "send" // send invoices by email
  | "bank" // import statements, match and ignore bank lines (unmatching and deleting imports need "admin")
  | "admin" // void payments, delete records, company settings
  | "auditLog" // activity log
  | "export" // data export
  | "team" // manage the team (an ADMIN cannot touch owners)
  | "close"; // close the workspace

const MATRIX: Record<Capability, readonly Role[]> = {
  write: ["OWNER", "ADMIN", "MEMBER"],
  send: ["OWNER", "ADMIN", "MEMBER"],
  bank: ["OWNER", "ADMIN", "MEMBER"],
  admin: ["OWNER", "ADMIN"],
  auditLog: ["OWNER", "ADMIN", "ACCOUNTANT"],
  export: ["OWNER", "ACCOUNTANT"],
  team: ["OWNER", "ADMIN"],
  close: ["OWNER"],
};

export const ROLES: readonly Role[] = ["OWNER", "ADMIN", "MEMBER", "ACCOUNTANT", "VIEWER"];

export const can = (role: Role | null | undefined, capability: Capability) => !!role && MATRIX[capability].includes(role);

/** Rows of the table in the order the Équipe tab shows them. */
export const CAPABILITY_ROWS: readonly (Capability | "read")[] = ["read", "write", "send", "bank", "admin", "auditLog", "export", "team", "close"];

export const roleHas = (role: Role, row: Capability | "read") => row === "read" || can(role, row);

/** Roles the actor may give to someone else. Only an owner may grant ownership. */
export const grantableRoles = (actor: Role): readonly Role[] => (actor === "OWNER" ? ROLES : actor === "ADMIN" ? ROLES.filter((r) => r !== "OWNER") : []);

/** Whether the actor may change or remove a member who currently holds `target`. An admin cannot touch an owner. */
export const canManageMember = (actor: Role, target: Role) => can(actor, "team") && (actor === "OWNER" || target !== "OWNER");
