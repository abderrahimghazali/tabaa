import { cx as cn } from "@/utils/cx";

const STEM = "M11.5 4.5V24";
const LOOP = "M4.5 24H19.5C24.6 24 28 21.2 28 17.2C28 10.6 17.6 9.4 11.5 15.6";

function Strokes({ className, travelling }: { className?: string; travelling?: boolean }) {
  // pathLength normalises both strokes to 100 so one dash pattern fits each.
  const dash = travelling ? { pathLength: 100, strokeDasharray: "35 65" } : {};
  return (
    <g className={className}>
      <path d={STEM} {...dash} />
      <path d={LOOP} {...dash} />
    </g>
  );
}

export function BrandMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} fill="none" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="8" className="fill-accent-500" />
      <g
        transform="translate(3.2 3.8) scale(.8)"
        stroke="var(--color-text-white)"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Strokes />
      </g>
    </svg>
  );
}

export function BrandLoader({ size = 56, label, className, inverse }: { size?: number; label: string; className?: string; inverse?: boolean }) {
  return (
    <div role="status" className={cn("flex flex-col items-center gap-3", className)}>
      <svg
        viewBox="0 0 32 32"
        width={size}
        height={size}
        fill="none"
        aria-hidden="true"
        className={inverse ? "stroke-text-white" : "stroke-accent-500"}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Strokes className="brand-base" />
        <Strokes className="brand-travel" travelling />
      </svg>
      <span className="sr-only">{label}</span>
    </div>
  );
}
