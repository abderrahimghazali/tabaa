"use client";

import { useCanAdmin, useCanWrite } from "@/lib/me-client";

/** Renders its children only for roles that may write (everyone but VIEWER). */
export function WriteOnly({ children }: { children: React.ReactNode }) {
  return useCanWrite() ? <>{children}</> : null;
}

/** Renders its children only for OWNER and ADMIN. */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  return useCanAdmin() ? <>{children}</> : null;
}
