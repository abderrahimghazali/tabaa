"use client";

import { createContext, useContext } from "react";
import type { Me } from "@facture/core";

const MeCtx = createContext<Me | null>(null);

export function MeProvider({ me, children }: { me: Me; children: React.ReactNode }) {
  return <MeCtx value={me}>{children}</MeCtx>;
}

export const useMe = () => useContext(MeCtx);
/** VIEWER accounts are read-only; the API enforces it too. */
export const useCanWrite = () => useContext(MeCtx)?.role !== "VIEWER";
/** OWNER and ADMIN may change the company, delete records and void payments. */
export const useCanAdmin = () => {
  const role = useContext(MeCtx)?.role;
  return role === "OWNER" || role === "ADMIN";
};
