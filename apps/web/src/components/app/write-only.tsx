"use client";

import { useCanWrite } from "@/lib/me-client";

/** Renders its children only for roles that may write (everyone but VIEWER). */
export function WriteOnly({ children }: { children: React.ReactNode }) {
  return useCanWrite() ? <>{children}</> : null;
}
