/**
 * HouseholdSummaryStrip — slim banner under the BuilderHeader that gives the
 * advisor instant household context: total source value, per-owner totals,
 * and account-bucket tally chips. One glance answers "what are we working
 * with on this household?".
 */
"use client";

import { useMemo } from "react";
import type { CaseDesignBundle } from "@/lib/case-design/types";
import { rollupHousehold, formatMoneyCompact } from "@/lib/case-design/auto-layout";

interface Props {
  bundle: CaseDesignBundle;
  householdLabel: string;
}

export default function HouseholdSummaryStrip({ bundle, householdLabel }: Props) {
  const rollup = useMemo(() => rollupHousehold(bundle.positions), [bundle.positions]);
  if (rollup.sourceCount === 0) return null;

  return (
    <div className="bg-white border-b border-zinc-200 px-5 py-2.5">
      <div className="flex items-center gap-5 flex-wrap">
        {/* Hero: total source value */}
        <div className="flex items-baseline gap-2 pr-5 border-r border-zinc-200">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            {householdLabel} Total
          </span>
          <span className="text-xl font-bold text-[#16253C] tabular-nums">
            {formatMoneyCompact(rollup.totalSourceValue)}
          </span>
          <span className="text-[11px] text-zinc-500">
            ({rollup.sourceCount} account{rollup.sourceCount === 1 ? "" : "s"})
          </span>
        </div>

        {/* Per-owner breakdown */}
        {rollup.byOwner.length > 0 && (
          <div className="flex items-center gap-3 pr-5 border-r border-zinc-200">
            {rollup.byOwner.map((o) => (
              <div key={o.owner} className="flex items-baseline gap-1.5">
                <span className="text-xs font-semibold text-[#1E40AF]">{o.owner}</span>
                <span className="text-xs font-bold text-zinc-900 tabular-nums">
                  {formatMoneyCompact(o.total)}
                </span>
                <span className="text-[10px] text-zinc-500">({o.count})</span>
              </div>
            ))}
          </div>
        )}

        {/* Bucket tally chips */}
        {rollup.byBucket.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            {rollup.byBucket.map((b) => (
              <span
                key={b.bucket}
                className="inline-flex items-baseline gap-1 px-2 py-0.5 rounded-full bg-zinc-100 text-[11px] text-zinc-700 border border-zinc-200"
                title={
                  b.total > 0
                    ? `${b.count} ${b.bucket} account${b.count === 1 ? "" : "s"} · ${formatMoneyCompact(b.total)}`
                    : `${b.count} ${b.bucket} account${b.count === 1 ? "" : "s"} · no Amount on Opportunity`
                }
              >
                <span className="font-semibold text-[#16253C]">{b.count}</span>
                <span>{b.bucket}</span>
                {b.total > 0 && (
                  <>
                    <span className="text-zinc-400">·</span>
                    <span className="font-semibold text-zinc-900 tabular-nums">
                      {formatMoneyCompact(b.total)}
                    </span>
                  </>
                )}
              </span>
            ))}
          </div>
        )}

        {/* Destinations counter (only when at least one exists) */}
        {rollup.destinationCount > 0 && (
          <div className="ml-auto flex items-baseline gap-2 pl-4 border-l border-zinc-200">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#C7A356]">
              Destinations
            </span>
            <span className="text-sm font-bold text-[#16253C] tabular-nums">
              {formatMoneyCompact(rollup.totalDestinationValue)}
            </span>
            <span className="text-[11px] text-zinc-500">
              ({rollup.destinationCount})
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
