"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog } from "@/components/base/modal/modal";
import { useI18n } from "@/lib/i18n-client";

type Guard = { setDirty: (dirty: boolean) => void; go: (href: string) => void };

const GuardCtx = createContext<Guard>({ setDirty: () => {}, go: () => {} });
export const useLeaveGuard = () => useContext(GuardCtx);

/** Warns before leaving with unsaved changes: tab close or reload, links, and the settings tabs. */
export function LeaveGuard({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const router = useRouter();
  const dirty = useRef(false);
  const [dirtyState, setDirtyState] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const setDirty = useCallback((d: boolean) => {
    dirty.current = d;
    setDirtyState(d);
  }, []);

  const go = useCallback(
    (href: string) => {
      if (dirty.current) setPending(href);
      else router.push(href);
    },
    [router],
  );

  useEffect(() => {
    if (!dirtyState) return;
    const beforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      e.preventDefault();
      e.stopPropagation();
      setPending(url.pathname + url.search + url.hash);
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirtyState]);

  return (
    <GuardCtx value={{ setDirty, go }}>
      {children}
      <AlertDialog
        isOpen={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        variant="danger"
        title={t("co.leaveTitle")}
        description={t("co.leaveBody")}
        confirmLabel={t("co.leaveConfirm")}
        cancelLabel={t("co.leaveStay")}
        onConfirm={() => {
          const href = pending;
          setPending(null);
          setDirty(false);
          if (href) router.push(href);
        }}
      />
    </GuardCtx>
  );
}
