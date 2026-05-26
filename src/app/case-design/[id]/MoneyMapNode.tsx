/**
 * MoneyMapNode — custom react-flow node rendering a single account box in the
 * visual style of the printed Money Map PDFs (white box, blue owner name,
 * curly-brace SVG side decorations, bold dollar amount, optional fee pill).
 */
"use client";

import { memo } from "react";
import { Handle, Position as HandlePosition, type NodeProps, type Node } from "@xyflow/react";
import type { CaseDesignPosition } from "@/lib/case-design/types";
import {
  formatValueDisplay,
  formatFeeBadge,
  NODE_WIDTH,
  NODE_HEIGHT,
} from "@/lib/case-design/auto-layout";

export interface MoneyMapNodeData extends Record<string, unknown> {
  position: CaseDesignPosition;
}

export type MoneyMapNodeType = Node<MoneyMapNodeData, "moneyMap">;

function CurlyBrace({ side }: { side: "left" | "right" }) {
  const flip = side === "right";
  return (
    <svg
      width={10}
      height={NODE_HEIGHT}
      viewBox={`0 0 10 ${NODE_HEIGHT}`}
      className={`absolute top-0 ${flip ? "-right-[10px]" : "-left-[10px]"}`}
      style={{ transform: flip ? "scaleX(-1)" : undefined }}
      aria-hidden
    >
      <path
        d={`M9 0 C 3 12, 3 ${NODE_HEIGHT / 2 - 8}, 1 ${NODE_HEIGHT / 2}
            C 3 ${NODE_HEIGHT / 2 + 8}, 3 ${NODE_HEIGHT - 12}, 9 ${NODE_HEIGHT}`}
        fill="none"
        stroke="#9CA3AF"
        strokeWidth={1.2}
      />
    </svg>
  );
}

function MoneyMapNodeInner({ data, selected }: NodeProps<MoneyMapNodeType>) {
  const p = data.position;
  const value = formatValueDisplay(p);
  const fee = formatFeeBadge(p);
  const replacement = p.Annual_Fee_Display__c === "Consider Replacement if appropriate";

  const accountTypeDisplay =
    p.Account_Type__c === "Other" && p.Account_Type_Other__c
      ? p.Account_Type_Other__c
      : p.Account_Type__c;

  return (
    <div className="relative" style={{ width: NODE_WIDTH }}>
      <Handle type="target" position={HandlePosition.Left} className="!bg-zinc-400" />
      <Handle type="source" position={HandlePosition.Right} className="!bg-zinc-400" />
      <CurlyBrace side="left" />
      <CurlyBrace side="right" />
      <div
        className={`bg-white border rounded-lg px-3 py-2 shadow-sm ${
          selected ? "border-[#C7A356] ring-2 ring-[#C7A356]/30" : "border-zinc-300"
        }`}
        style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
      >
        <div className="text-center leading-tight">
          <div className="font-bold text-[13px] text-[#1E40AF]">
            {p.Owner_Label__c || "—"}
          </div>
          <div className="text-[12px] text-[#1E40AF]">{accountTypeDisplay}</div>
          {p.Custodian__c && (
            <div className="text-[12px] text-black mt-0.5">{p.Custodian__c}</div>
          )}
          {p.Product_Detail__c && (
            <div className="text-[11px] italic text-black/80">{p.Product_Detail__c}</div>
          )}
          {p.Account_Number_Last4__c && (
            <div className="text-[10px] text-zinc-500">···{p.Account_Number_Last4__c}</div>
          )}
        </div>
        <div className="mt-1 text-center font-bold text-[14px] text-black">{value}</div>
        {replacement && (
          <div className="text-center text-[10px] italic text-rose-600 mt-0.5">
            Consider Replacement if appropriate
          </div>
        )}
      </div>
      {fee && !replacement && (
        <div className="mt-1 mx-auto inline-block px-2 py-0.5 rounded-full border border-zinc-300 bg-white text-[11px] text-zinc-700 absolute left-1/2 -translate-x-1/2 whitespace-nowrap"
             style={{ top: NODE_HEIGHT + 4 }}>
          {fee}
        </div>
      )}
    </div>
  );
}

export const MoneyMapNode = memo(MoneyMapNodeInner);
