"use client";

import { useLayoutEffect, useRef, useState } from "react";

export const SHEET_WIDTH = 794;

export function SheetFrame({ children }: { children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);
  const [height, setHeight] = useState(1123);

  useLayoutEffect(() => {
    const measure = () => {
      if (!outer.current || !inner.current) return;
      const s = Math.min(1, outer.current.clientWidth / SHEET_WIDTH);
      setScale(s);
      setHeight(inner.current.offsetHeight * s);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (outer.current) ro.observe(outer.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={outer}
      className="print-frame relative w-full"
      style={{ height: scale === null ? undefined : height, minHeight: scale === null ? 480 : undefined }}
    >
      <div
        ref={inner}
        className="print-sheet absolute start-0 top-0 origin-top-left rtl:origin-top-right"
        style={{
          width: SHEET_WIDTH,
          transform: `scale(${scale ?? 1})`,
          visibility: scale === null ? "hidden" : "visible",
        }}
      >
        {children}
      </div>
    </div>
  );
}
