import { useId } from "react";
import { cx } from "@/utils/cx";
import type { StampTone as Tone } from "@/lib/status";

// The stamp inks are physical: they stay the same in any theme.
const toneClass: Record<Tone, string> = {
  neutral: "text-neutral-500",
  encre: "text-accent-600",
  ok: "text-green-600",
  warn: "text-orange-600",
  danger: "text-red-600",
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const fit = (len: number, max: number, room: number, em = 0.78) => Math.min(max, room / (Math.max(len, 1) * em));

export function Cachet({
  word,
  tone,
  top,
  bottom,
  sub,
  dashed,
  animate,
  size = 148,
  className,
  rtl,
}: {
  word: string;
  tone: Tone;
  top: string;
  bottom: string;
  sub?: string;
  dashed?: boolean;
  animate?: boolean;
  size?: number;
  className?: string;
  rtl?: boolean;
}) {
  const uid = useId().replace(/[^a-z0-9]/gi, "");
  const topText = clip(top.toUpperCase(), 30);
  const bottomText = clip(bottom.toUpperCase(), 30);
  const wordSize = fit(word.length, 24, 100, 0.74);
  const family = rtl ? "var(--font-plex-ar)" : "var(--font-bricolage)";

  return (
    <span
      className={cx("cachet-ink pointer-events-none inline-block opacity-90 select-none", toneClass[tone], className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={word}
    >
      <svg
        viewBox="0 0 200 200"
        width={size}
        height={size}
        className={animate ? "cachet-press" : undefined}
        aria-hidden="true"
      >
        <defs>
          <filter id={`ink${uid}`} filterUnits="userSpaceOnUse" x="-10" y="-10" width="220" height="220">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="grain" />
            <feDisplacementMap in="SourceGraphic" in2="grain" scale="2.4" result="rough" />
            <feTurbulence type="fractalNoise" baseFrequency="0.03 0.045" numOctaves="3" seed="11" result="blot" />
            <feColorMatrix
              in="blot"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.5 1.78"
              result="uneven"
            />
            <feComposite in="rough" in2="uneven" operator="in" />
          </filter>
          <path id={`top${uid}`} d="M 29.3 100 A 70.7 70.7 0 0 1 170.7 100" />
          <path id={`bot${uid}`} d="M 20.7 100 A 79.3 79.3 0 0 0 179.3 100" />
        </defs>
        <g
          filter={`url(#ink${uid})`}
          fill="currentColor"
          stroke="currentColor"
          style={{ fontFamily: "var(--font-bricolage)" }}
        >
          <circle cx="100" cy="100" r="95" fill="none" strokeWidth="3.6" strokeDasharray={dashed ? "9 6" : undefined} />
          <circle cx="100" cy="100" r="88.5" fill="none" strokeWidth="1.2" />
          <circle cx="100" cy="100" r="62" fill="none" strokeWidth="1.2" />
          <text
            fontSize={fit(topText.length, 12, 190, 0.8)}
            fontWeight="700"
            letterSpacing="1.4"
            stroke="none"
            textAnchor="middle"
          >
            <textPath href={`#top${uid}`} startOffset="50%">
              {topText}
            </textPath>
          </text>
          <text
            fontSize={fit(bottomText.length, 12, 190, 0.8)}
            fontWeight="700"
            letterSpacing="1.4"
            stroke="none"
            textAnchor="middle"
          >
            <textPath href={`#bot${uid}`} startOffset="50%">
              {bottomText}
            </textPath>
          </text>
          <path d="M 21 100 l 3.5 -3.5 l 3.5 3.5 l -3.5 3.5 z" stroke="none" transform="translate(-4 0)" />
          <path d="M 172 100 l 3.5 -3.5 l 3.5 3.5 l -3.5 3.5 z" stroke="none" transform="translate(4 0)" />
          <line x1="46" x2="154" y1="83" y2="83" strokeWidth="1.6" />
          <line x1="46" x2="154" y1="117" y2="117" strokeWidth="1.6" />
          <text
            x="100"
            y="100"
            dy="0.36em"
            textAnchor="middle"
            fontWeight={rtl ? "600" : "700"}
            fontSize={wordSize}
            letterSpacing={rtl ? 0 : 1.5}
            stroke="none"
            style={{ fontFamily: family }}
          >
            {word}
          </text>
          {sub && (
            <text
              x="100"
              y="134"
              textAnchor="middle"
              fontSize="9.5"
              fontWeight="500"
              stroke="none"
              letterSpacing="0.5"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {sub}
            </text>
          )}
        </g>
      </svg>
    </span>
  );
}
