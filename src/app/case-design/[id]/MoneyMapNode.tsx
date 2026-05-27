/**
 * MoneyMapNode — custom react-flow node rendering a single account box in the
 * visual style of the printed Money Map PDFs. White card, blue owner name,
 * curly-brace SVG side decorations, centered amount in bold, optional fee
 * pill below the box, and a "Consider Replacement" italic call-out when the
 * advisor has set the override.
 */
"use client";

import { memo } from "react";
import {
  Handle,
  Position as HandlePosition,
  type NodeProps,
  type Node,
} from "@xyflow/react";
import type { CaseDesignPosition } from "@/lib/case-design/types";
import {
  formatValueDisplay,
  formatFeeBadge,
  NODE_WIDTH,
  NODE_HEIGHT,
} from "@/lib/case-design/auto-layout";

export interface MoneyMapNodeData extends Record<string, unknown> {
  position: CaseDesignPosition;
  /**
   * Set by the Diagram component on Source positions that have no outgoing
   * edges. Renders a subtle "KEEP" badge so the advisor can tell at a glance
   * which accounts are staying put (e.g. existing carrier annuities, IULs)
   * vs which are flowing into a destination.
   */
  keepBadge?: boolean;
}

export type MoneyMapNodeType = Node<MoneyMapNodeData, "moneyMap">;

function CurlyBrace({ side }: { side: "left" | "right" }) {
  const flip = side === "right";
  const w = 12;
  const h = NODE_HEIGHT;
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={`absolute top-0 pointer-events-none ${flip ? "-right-3" : "-left-3"}`}
      style={{ transform: flip ? "scaleX(-1)" : undefined }}
      aria-hidden="true"
    >
      {/* Top curve into midpoint pinch, then midpoint pinch into bottom curve. */}
      <path
        d={`
          M ${w - 1} 1
          C ${w - 6} 8, ${w - 6} ${h / 2 - 10}, 1 ${h / 2}
          C ${w - 6} ${h / 2 + 10}, ${w - 6} ${h - 8}, ${w - 1} ${h - 1}
        `}
        fill="none"
        stroke="#94A3B8"
        strokeWidth={1.25}
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoneyMapNodeInner({ data, selected }: NodeProps<MoneyMapNodeType>) {
  const p = data.position;
  const value = formatValueDisplay(p);
  const fee = formatFeeBadge(p);
  const replacement =
    p.Annual_Fee_Display__c === "Consider Replacement if appropriate";

  const accountTypeDisplay =
    p.Account_Type__c === "Other" && p.Account_Type_Other__c
      ? p.Account_Type_Other__c
      : p.Account_Type__c;

  return (
    <div
      className="relative group"
      style={{ width: NODE_WIDTH }}
    >
      {/* react-flow connection handles — kept subtle (semi-transparent on hover) */}
      <Handle
        type="target"
        position={HandlePosition.Left}
        className="!w-2 !h-2 !bg-zinc-400 !border-2 !border-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 motion-reduce:transition-none"
      />
      <Handle
        type="source"
        position={HandlePosition.Right}
        className="!w-2 !h-2 !bg-zinc-400 !border-2 !border-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 motion-reduce:transition-none"
      />

      <CurlyBrace side="left" />
      <CurlyBrace side="right" />

      {data.keepBadge && (
        <span
          className="absolute -top-2 right-1 z-10 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-600 text-white text-[9px] font-bold uppercase tracking-wider shadow-sm pointer-events-none"
          title="No move planned — this account stays in place."
          aria-label="Stays in place"
        >
          <svg className="w-2 h-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 13l4 4L19 7" />
          </svg>
          Keep
        </span>
      )}

      <div
        className={`bg-white rounded-lg px-3 py-2.5 cursor-pointer transition-shadow duration-200 motion-reduce:transition-none ${
          selected
            ? "ring-2 ring-[#C7A356] shadow-md"
            : data.keepBadge
              ? "ring-1 ring-emerald-200 group-hover:shadow-md"
              : "ring-1 ring-zinc-200 group-hover:shadow-md"
        }`}
        style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
      >
        <div className="text-center leading-tight">
          <div className="font-bold text-sm text-[#1E40AF] truncate">
            {p.Owner_Label__c || "—"}
          </div>
          <div className="text-[12px] font-medium text-[#1E40AF] truncate">
            {accountTypeDisplay}
          </div>
          {p.Custodian__c && (
            <div className="text-[12px] font-semibold text-zinc-900 mt-1 truncate">
              {p.Custodian__c}
              {p.Account_Number_Last4__c && (
                <span className="text-[11px] font-normal text-zinc-500 ml-1">
                  {p.Account_Number_Last4__c}
                </span>
              )}
            </div>
          )}
          {p.Product_Detail__c && (
            <div className="text-[11px] italic text-zinc-700 truncate">
              {p.Product_Detail__c}
            </div>
          )}
        </div>
        <div className="mt-1.5 text-center font-bold text-base text-zinc-900">
          {value}
        </div>
        {p.Contribution_Note__c && (
          <div className="mt-1 text-center text-[10px] text-zinc-600 leading-tight whitespace-pre-line">
            {p.Contribution_Note__c}
          </div>
        )}
      </div>

      {/* Fee pill OR "Consider Replacement" italic, anchored below the box. */}
      {fee && !replacement && (
        <div
          className="absolute left-1/2 -translate-x-1/2 mt-1 px-2 py-0.5 rounded-full border border-zinc-300 bg-white text-[10px] text-zinc-700 whitespace-nowrap shadow-sm"
          style={{ top: NODE_HEIGHT + 2 }}
        >
          {fee}
        </div>
      )}
      {replacement && (
        <div
          className="absolute left-1/2 -translate-x-1/2 mt-1 text-[10px] italic text-zinc-600 whitespace-nowrap"
          style={{ top: NODE_HEIGHT + 4 }}
        >
          Consider Replacement if appropriate
        </div>
      )}
    </div>
  );
}

export const MoneyMapNode = memo(MoneyMapNodeInner);
