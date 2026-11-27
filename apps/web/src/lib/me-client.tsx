"use client";

import { createContext, useContext } from "react";
import type { Me } from "@facture/core";
import { can, type Capability } from "./permissions";

const MeCtx = createContext<Me | null>(null);

export function MeProvider({ me, children }: { me: Me; children: React.ReactNode }) {
  return <MeCtx value={me}>{children}</MeCtx>;
}

export const useMe = () => useContext(MeCtx);
export const useCan = (capability: Capability) => can(useContext(MeCtx)?.role, capability);
/** Create, edit, issue, record payments, customers and items. VIEWER and ACCOUNTANT are read-only. */
export const useCanWrite = () => useCan("write");
/** OWNER and ADMIN may change the company, delete records and void payments. */
export const useCanAdmin = () => useCan("admin");
