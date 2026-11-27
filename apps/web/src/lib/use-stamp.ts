"use client";

import { useSyncExternalStore } from "react";

const p2 = (n: number) => String(n).padStart(2, "0");
const noop = () => () => {};

/**
 * Formats a timestamp as "27/11/2026 14:02". The browser's own time zone is used once mounted;
 * until then (server render and hydration) only the UTC date is shown, so the two never disagree.
 */
export function useStamp() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    if (!mounted) return `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
    return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  };
}
