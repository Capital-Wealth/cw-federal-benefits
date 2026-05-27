/**
 * EmptyState — centered card on the diagram canvas when the Case Design has
 * zero positions. Includes an animated mini Money Map preview that loops so
 * the advisor sees what they're about to build, plus the two valid first
 * actions (manual add, or import from Meeting 1 intake).
 */
"use client";

interface EmptyStateProps {
  householdLabel: string;
  onAddSource: () => void;
  onImportIntake?: () => void;
  intakeCount: number;
}

export default function EmptyState({
  householdLabel,
  onAddSource,
  onImportIntake,
  intakeCount,
}: EmptyStateProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="pointer-events-auto bg-white border border-zinc-200 rounded-2xl shadow-md px-8 py-7 max-w-md text-center">
        <MoneyMapPreview />
        <h2 className="text-lg font-bold text-[#16253C] mb-1.5">
          Build a Money Map for {householdLabel}
        </h2>
        <p className="text-sm text-zinc-600 leading-relaxed mb-5">
          Show where their money sits today, where it should go, and how it
          moves between accounts.
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onAddSource}
            className="cw-empty-cta w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-semibold bg-[#16253C] text-white rounded-md hover:bg-[#1E3456] transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C7A356] focus:ring-offset-2 motion-reduce:transition-none"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Start with a source account
          </button>
          {intakeCount > 0 && onImportIntake && (
            <button
              type="button"
              onClick={onImportIntake}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-semibold bg-white border border-[#C7A356] text-[#16253C] rounded-md hover:bg-[#C7A356]/10 transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C7A356] focus:ring-offset-2 motion-reduce:transition-none"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Load {intakeCount} accounts from Meeting 1 intake
            </button>
          )}
          <p className="mt-1 text-[11px] text-zinc-500">
            Click a box to edit
            <span className="mx-1.5 text-zinc-300">·</span>
            Drag from a source to a destination to connect them
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Mini Money Map preview ---------------- */

/**
 * Loops a tiny build-up of a Money Map (3 sources → arrows → 2 destinations)
 * so the empty canvas advertises what the advisor is about to build.
 * Keyframes live in globals.css under the `cw-mm-*` namespace and respect
 * prefers-reduced-motion.
 */
function MoneyMapPreview() {
  // Source boxes (left column, navy)
  const sources = [
    { x: 6, y: 8, w: 56, h: 22, cls: "cw-mm-src cw-mm-src-1" },
    { x: 6, y: 49, w: 56, h: 22, cls: "cw-mm-src cw-mm-src-2" },
    { x: 6, y: 90, w: 56, h: 22, cls: "cw-mm-src cw-mm-src-3" },
  ];
  // Destination boxes (right column, gold-stroke)
  const destinations = [
    { x: 158, y: 30, w: 56, h: 22, cls: "cw-mm-dest cw-mm-dest-1" },
    { x: 158, y: 71, w: 56, h: 22, cls: "cw-mm-dest cw-mm-dest-2" },
  ];
  // Curved edges — each connects a source midpoint to a destination midpoint
  const edges = [
    { d: "M62 19 C 100 19, 120 41, 158 41", cls: "cw-mm-edge cw-mm-edge-1" },
    { d: "M62 60 C 100 60, 120 41, 158 41", cls: "cw-mm-edge cw-mm-edge-2" },
    { d: "M62 101 C 100 101, 120 82, 158 82", cls: "cw-mm-edge cw-mm-edge-3" },
  ];

  return (
    <div className="cw-mm-preview mx-auto mb-5 flex items-center justify-center">
      <svg
        viewBox="0 0 220 120"
        className="w-44 h-24"
        aria-hidden="true"
      >
        {/* Column hints */}
        <text x="34" y="6" textAnchor="middle" fontSize="6" fontWeight="600" fill="#16253C" opacity="0.45" letterSpacing="0.5">
          SOURCES
        </text>
        <text x="186" y="6" textAnchor="middle" fontSize="6" fontWeight="600" fill="#C7A356" letterSpacing="0.5">
          DESTINATIONS
        </text>

        {/* Edges drawn first so they sit beneath boxes */}
        <g fill="none" stroke="#C7A356" strokeWidth="1.5" strokeLinecap="round">
          {edges.map((e) => (
            <path key={e.cls} d={e.d} className={e.cls} />
          ))}
        </g>

        {/* Source boxes — navy fill */}
        <g>
          {sources.map((s) => (
            <g key={s.cls} className={s.cls}>
              <rect
                x={s.x}
                y={s.y}
                width={s.w}
                height={s.h}
                rx="3"
                fill="#16253C"
                opacity="0.92"
              />
              <rect x={s.x + 6} y={s.y + 6} width="22" height="3" rx="1" fill="#C7A356" opacity="0.75" />
              <rect x={s.x + 6} y={s.y + 12} width="34" height="2.5" rx="1" fill="#ffffff" opacity="0.55" />
            </g>
          ))}
        </g>

        {/* Destination boxes — white fill with gold border */}
        <g>
          {destinations.map((d) => (
            <g key={d.cls} className={d.cls}>
              <rect
                x={d.x}
                y={d.y}
                width={d.w}
                height={d.h}
                rx="3"
                fill="#ffffff"
                stroke="#C7A356"
                strokeWidth="1.5"
              />
              <rect x={d.x + 6} y={d.y + 6} width="22" height="3" rx="1" fill="#16253C" opacity="0.75" />
              <rect x={d.x + 6} y={d.y + 12} width="34" height="2.5" rx="1" fill="#16253C" opacity="0.35" />
              {/* Glowing arrow tip on the destinations */}
              <circle cx={d.x - 2} cy={d.y + d.h / 2} r="1.5" fill="#C7A356" className="cw-mm-dot" />
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
