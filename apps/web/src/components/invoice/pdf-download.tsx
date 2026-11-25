"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PrintSheet, type SheetModel } from "./invoice-sheet";

// Opened as a normal navigation so the browser's own viewer shows the file.
export function openPdf(id: string) {
  window.open(`/factures/${encodeURIComponent(id)}/pdf`, "_blank", "noopener");
}

// Printing uses the same paginated sheet as the PDF, mounted on <body> so the rest of the page can be removed from print.
export function PrintPortal({ model }: { model: SheetModel }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className="print-portal">
      <PrintSheet model={model} />
    </div>,
    document.body,
  );
}
