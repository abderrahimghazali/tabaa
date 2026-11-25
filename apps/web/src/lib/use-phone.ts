"use client";

import { useSyncExternalStore } from "react";

const PHONE = "(max-width: 959px)";
const subscribe = (cb: () => void) => {
  const q = window.matchMedia(PHONE);
  q.addEventListener("change", cb);
  return () => q.removeEventListener("change", cb);
};

/** True below the `nav` breakpoint, where the sidebar becomes a drawer and keyboard hints make no sense. */
export const usePhone = () => useSyncExternalStore(subscribe, () => window.matchMedia(PHONE).matches, () => false);
