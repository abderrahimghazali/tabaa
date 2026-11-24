"use client";

import { useMemo } from "react";
import qrcode from "qrcode-generator";

/** QR code drawn locally as one SVG path: no network, nothing inline beyond SVG attributes. */
export function QrCode({ value, label, size = 176 }: { value: string; label: string; size?: number }) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
    return { path: d, count: n };
  }, [value]);
  const box = count + 8;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${box} ${box}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="rounded-xl border border-border-button-default bg-white"
    >
      <path d={path} className="fill-neutral-950" />
    </svg>
  );
}
