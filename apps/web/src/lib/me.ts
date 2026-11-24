import type { Me } from "@facture/core";
export const canWrite = (me: Me) => me.role !== "VIEWER";
