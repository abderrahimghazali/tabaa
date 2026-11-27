import type { Me } from "@facture/core";
import { can, type Capability } from "./permissions";

export const meCan = (me: Me, capability: Capability) => can(me.role, capability);
export const canWrite = (me: Me) => meCan(me, "write");
/** OWNER and ADMIN: company changes, deletions and voiding payments. */
export const canAdmin = (me: Me) => meCan(me, "admin");
