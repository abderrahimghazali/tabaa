import type { Me } from "@facture/core";

export const canWrite = (me: Me) => me.role !== "VIEWER";
/** OWNER and ADMIN: company changes, deletions and voiding payments. */
export const canAdmin = (me: Me) => me.role === "OWNER" || me.role === "ADMIN";
