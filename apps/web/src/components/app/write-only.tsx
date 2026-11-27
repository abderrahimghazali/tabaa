"use client";

import type { Capability } from "@/lib/permissions";
import { useCan } from "@/lib/me-client";

/** Renders its children only for roles that hold the capability. */
export function Can({ cap, children }: { cap: Capability; children: React.ReactNode }) {
  return useCan(cap) ? <>{children}</> : null;
}

/** Renders its children only for roles that may write (not VIEWER, not ACCOUNTANT). */
export function WriteOnly({ children }: { children: React.ReactNode }) {
  return <Can cap="write">{children}</Can>;
}

/** Renders its children only for OWNER and ADMIN. */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  return <Can cap="admin">{children}</Can>;
}
