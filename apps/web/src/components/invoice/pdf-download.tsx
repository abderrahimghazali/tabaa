"use client";

import { useState } from "react";
import { RiFilePdf2Line } from "@remixicon/react";
import { SpinnerGlyph } from "@/components/base/spinner/spinner";
import { toast } from "@/components/base/toast/toast";
import { useI18n } from "@/lib/i18n-client";

export function PdfSpinner({ className }: { className?: string }) {
  return <SpinnerGlyph size="sm" className={`${className ?? ""} text-current`} />;
}

export const pdfIcon = (busy: boolean) => (busy ? PdfSpinner : RiFilePdf2Line);

export function usePdfDownload(id: string) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  async function download() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/factures/${encodeURIComponent(id)}/pdf`, { cache: "no-store" });
      if (res.redirected && new URL(res.url).pathname.startsWith("/session-expiree")) {
        window.location.assign("/session-expiree");
        return;
      }
      if (!res.ok || !res.headers.get("content-type")?.startsWith("application/pdf")) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        toast.error(body?.message ?? t("pdf.failed"));
        return;
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "facture.pdf";
      const href = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = href;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
    } catch {
      toast.error(t("pdf.failed"));
    } finally {
      setBusy(false);
    }
  }

  return { busy, download };
}
