/**
 * Celebrate — full-screen overlay shown when the advisor confirms a Case Design.
 *
 * A big green check pops in, confetti rains for 1.8s, then the overlay fades.
 * Pure CSS animations defined in globals.css under the `cw-*` namespace; no
 * additional deps. Respects prefers-reduced-motion (animations collapse).
 */
"use client";

import { useEffect, useMemo, useState } from "react";

interface CelebrateProps {
  /** Number of child Opportunities that were just created, shown in the message. */
  childOppCount: number;
  /** Fires after the celebration completes (~2.4s) so the parent can reload. */
  onDone: () => void;
}

const COLORS = [
  "#16253C", // CW navy
  "#C7A356", // CW gold
  "#D9B96E", // gold hover
  "#1E40AF", // owner blue
  "#22C55E", // success green
  "#FFFFFF",
];

function makeDots(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const left = Math.random() * 100;
    const dx = (Math.random() - 0.5) * 240;
    const dur = 1400 + Math.random() * 900;
    const delay = Math.random() * 250;
    const color = COLORS[i % COLORS.length];
    const size = 6 + Math.round(Math.random() * 6);
    const rounded = Math.random() > 0.5 ? "9999px" : "2px";
    return { left, dx, dur, delay, color, size, rounded };
  });
}

export default function Celebrate({ childOppCount, onDone }: CelebrateProps) {
  const dots = useMemo(() => makeDots(60), []);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      onDone();
    }, 2400);
    return () => clearTimeout(t);
  }, [onDone]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[#16253C]/40 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
    >
      {dots.map((d, i) => (
        <span
          key={i}
          className="cw-confetti-dot"
          style={{
            left: `${d.left}vw`,
            width: d.size,
            height: d.size,
            background: d.color,
            borderRadius: d.rounded,
            "--cw-dx": `${d.dx}px`,
            "--cw-dur": `${d.dur}ms`,
            animationDelay: `${d.delay}ms`,
          } as React.CSSProperties}
        />
      ))}

      <div className="cw-check-celebrate flex flex-col items-center gap-4 rounded-2xl bg-white px-10 py-8 shadow-2xl ring-1 ring-[#C7A356]/30">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 ring-4 ring-emerald-100">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-12 w-12 text-emerald-500" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 12.5l5 5L20 7" />
          </svg>
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-[#16253C]">Money Map confirmed</h2>
          <p className="mt-1 text-sm text-zinc-600">
            {childOppCount > 0
              ? `${childOppCount} ${childOppCount === 1 ? "Opportunity" : "Opportunities"} created in Salesforce.`
              : "Case Design locked."}
          </p>
        </div>
      </div>
    </div>
  );
}
