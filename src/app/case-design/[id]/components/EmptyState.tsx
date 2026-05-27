/**
 * EmptyState — centered illustration shown on the diagram canvas when the
 * Case Design has zero positions. Drives the advisor toward the two valid
 * first actions: add a source manually, or import from Meeting 1 intake.
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
      <div className="pointer-events-auto bg-white border border-zinc-200 rounded-xl shadow-sm px-8 py-7 max-w-md text-center">
        <div className="cw-float mx-auto mb-4 flex items-center justify-center">
          <svg
            className="w-20 h-20 text-[#16253C]/30"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="2" y="6" width="6" height="12" rx="1.5" />
            <rect x="16" y="6" width="6" height="12" rx="1.5" />
            <path d="M8 12 L16 12" strokeDasharray="2 2" />
            <path d="M14 10 L16 12 L14 14" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-[#16253C] mb-1">
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
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-semibold bg-[#16253C] text-white rounded-md hover:bg-[#1E3456] transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C7A356] focus:ring-offset-2 motion-reduce:transition-none"
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
        </div>
      </div>
    </div>
  );
}
